import { BLOCK_IDS, isCube, isFurniture, rotatedBlock, type BlockId } from '../blocks';
import { FURNITURE_KINDS } from '../furniture';
import { isItem, isWeapon, WEAPON_IDS, type ItemId, type WeaponId } from '../items';

export const HOTBAR_SIZE = 9;
/** 0번 키 칸: 언제나 메모장이다(2026-11-13 사용자 요청). 단축키 칸 0~8 뒤의 번호로 고르고, 다른 것을 넣거나 뺄 수 없다. */
export const MEMO_SLOT = HOTBAR_SIZE;
/** 예전 저장 형식의 한 칸 최대 개수. 지금은 개수를 세지 않지만 저장된 칸을 읽을 때 검사한다. */
const STACK_SIZE = 64;

export interface Stack {
  id: ItemId;
  /** 개수는 세지 않는다(블록은 무제한, 무기는 하나). 저장 형식을 지키려고 남겨 둔 값이다. */
  count: number;
}

export type Slot = Stack | null;

/**
 * 인벤토리 창의 탭(2026-11-12 사용자 요청 "타일, 장식품 탭 분류"). 타일은 상자 블록, 장식품은 나머지 블록이다.
 * 가구는 사용자가 준 실내 꾸미기 에셋으로 만든 장식품이고(2026-11-13), 종류가 많아 탭을 따로 둔다.
 */
export const TABS = { tile: '타일', decor: '장식품', furniture: '가구', weapon: '무기' } as const;
export type TabId = keyof typeof TABS;

export function tabOf(id: ItemId): TabId {
  if (isWeapon(id)) return 'weapon';
  if (isFurniture(id)) return 'furniture';
  return isCube(id) ? 'tile' : 'decor';
}

function isSlot(value: unknown): value is Stack {
  const stack = value as Partial<Stack> | null;
  return (
    !!stack && isItem(stack.id) && Number.isInteger(stack.count) && stack.count! >= 1 && stack.count! <= STACK_SIZE
  );
}

/** 처음 단축키 칸에 놓는 블록. 무기는 그 뒤 빈칸에 들어간다. */
const HOTBAR_BLOCKS: readonly BlockId[] = ['stone', 'brick', 'wood', 'hedge', 'glass', 'grass', 'pine', 'flower'];

/**
 * 저장된 목록의 앞 9칸이 단축키 칸이다(예전에는 가방 칸까지 저장했고, 그 앞 9칸도 단축키 칸이었다).
 * 같은 것이 두 칸에 있으면 하나만 남기고, 무기는 서버가 아는 보유 목록에 있을 때만 둔다(저장된 인벤토리는 위조할 수 있으므로).
 * 저장된 것이 없으면(처음 가입) 기본 블록과 가진 무기로 채운다.
 */
function readHotbar(saved: unknown, owned: ReadonlySet<WeaponId>): Slot[] {
  const hotbar: Slot[] = Array.from({ length: HOTBAR_SIZE }, () => null);
  if (Array.isArray(saved)) {
    const seen = new Set<ItemId>();
    saved.slice(0, HOTBAR_SIZE).forEach((slot, i) => {
      if (!isSlot(slot) || seen.has(slot.id) || (isWeapon(slot.id) && !owned.has(slot.id))) return;
      hotbar[i] = { id: slot.id, count: 1 };
      seen.add(slot.id);
    });
    return hotbar;
  }
  [...HOTBAR_BLOCKS, ...owned].slice(0, HOTBAR_SIZE).forEach((id, i) => (hotbar[i] = { id, count: 1 }));
  return hotbar;
}

/**
 * 단축키 칸 9개와 가진 것 전체. 블록과 꾸미기는 누구나 모든 종류를 무제한으로 가지므로(2026-11-11 사용자 요청)
 * 인벤토리 창은 탭별 목록이고, 거기서 단축키 칸으로 끌어다 놓는다. 저장하는 것은 단축키 칸뿐이다.
 */
export class Inventory {
  /** 단축키 칸 0~8 */
  readonly slots: Slot[];
  selected = 0;
  private readonly weapons: Set<WeaponId>;
  private readonly listeners: (() => void)[] = [];

  constructor(saved: unknown, owned: readonly WeaponId[]) {
    this.weapons = new Set(owned);
    this.slots = readHotbar(saved, this.weapons);
  }

  onChange(fn: () => void) {
    this.listeners.push(fn);
  }

  private changed() {
    for (const fn of this.listeners) fn();
  }

  /** 메모장 칸(MEMO_SLOT)을 고르면 null이다. */
  get selectedStack(): Slot {
    return this.slots[this.selected] ?? null;
  }

  get memoSelected() {
    return this.selected === MEMO_SLOT;
  }

  /** 탭에 보여 줄 것: 블록은 전부, 무기는 가진 것만. 순서는 blocks.ts, items.ts의 순서다. */
  catalog(tab: TabId): ItemId[] {
    if (tab === 'weapon') return WEAPON_IDS.filter((id) => this.weapons.has(id));
    // 가구는 방향마다 블록이 따로 있어서 종류마다 첫 방향만 보이고, 단축키 칸에서 돌린다(rotateSelected).
    if (tab === 'furniture') return FURNITURE_KINDS as BlockId[];
    return BLOCK_IDS.filter((id) => tabOf(id) === tab);
  }

  /** 고른 칸의 가구를 다음 방향으로 돌린다. 돌릴 것이 없으면 false */
  rotateSelected() {
    const stack = this.selectedStack;
    const next = stack && !isWeapon(stack.id) ? rotatedBlock(stack.id) : null;
    if (!next) return false;
    this.slots[this.selected] = { id: next, count: 1 };
    this.changed();
    return true;
  }

  /** 단축키 칸에서의 자리. 없으면 -1 */
  hotbarIndexOf(id: ItemId) {
    return this.slots.findIndex((slot) => slot?.id === id);
  }

  select(index: number) {
    this.selected = index;
    this.changed();
  }

  /** 목록의 것을 단축키 칸 index에 넣는다. 이미 다른 칸에 있으면 두 칸을 맞바꾼다. */
  put(index: number, id: ItemId) {
    const already = this.hotbarIndexOf(id);
    if (already === index) return;
    if (already >= 0) this.slots[already] = this.slots[index];
    this.slots[index] = { id, count: 1 };
    this.changed();
  }

  /** 단축키 칸끼리 자리를 바꾼다. */
  move(from: number, to: number) {
    if (from === to) return;
    [this.slots[from], this.slots[to]] = [this.slots[to], this.slots[from]];
    this.changed();
  }

  /** 단축키 칸을 비운다. 목록에는 그대로 남는다. */
  clear(index: number) {
    if (!this.slots[index]) return;
    this.slots[index] = null;
    this.changed();
  }

  /** 새로 산 무기를 무기 탭에 넣고, 단축키 칸에 빈칸이 있으면 거기에도 넣는다. 단축키 칸에 들어갔으면 true */
  addWeapon(id: WeaponId) {
    this.weapons.add(id);
    if (this.hotbarIndexOf(id) < 0) {
      const empty = this.slots.indexOf(null);
      if (empty >= 0) this.slots[empty] = { id, count: 1 };
    }
    this.changed();
    return this.hotbarIndexOf(id) >= 0;
  }
}
