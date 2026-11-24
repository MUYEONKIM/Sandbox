import { BLOCK_IDS, blockArt, isCube, isFurniture, rotatedBlock, type BlockId } from '../blocks';
import { ROOM_DECOR_TAB, ROOM_FURNITURE_TAB } from '../roomDecor';
import {
  gearIdOf,
  gearRef,
  isGearRef,
  isItem,
  isPotion,
  isSeed,
  isTool,
  isWeapon,
  itemName,
  POTION_IDS,
  SEED_IDS,
  TORCH,
  WEAPON_IDS,
  WEAPONS,
  type GearRef,
  type ItemId,
  type WeaponId,
} from '../items';
import type { Gear } from './forge';

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

/** 손에 든 무기: 종류와 자루(기본 권총은 자루가 없다) */
export interface Arm {
  kind: WeaponId;
  gear: Gear | null;
  /** 단축키 칸의 id. 탄창을 자루마다 따로 센다. */
  key: ItemId;
}

/**
 * 인벤토리 창의 작은 탭(2026-11-12 사용자 요청 "타일, 장식품 탭 분류"에서 시작). 큰 탭(꾸미기·전투·농사·메모)은 ui/hud.ts의 BAG_GROUPS.
 * 2026-11-25 사용자 "꾸미는 블록은 무기·포션과 따로 탭으로", "벽은 따로 '벽'으로": 타일 = 상자 블록과 바닥 타일, 장식품 = 올리는 소품·벽지·벽걸이·바깥용,
 * 가구 = 바닥 가구·깔개, 벽 = 놓는 벽(바닥 타일을 타일에 둔 것은 PM이 정함).
 */
export const TABS = { tile: '타일', decor: '장식품', furniture: '가구', wall: '벽', paper: '벽지', weapon: '무기', potion: '포션', seed: '씨앗' } as const;
export type TabId = keyof typeof TABS;

export function tabOf(id: ItemId): TabId {
  // 횃불은 손에 드는 것이라 무기 탭(기본 권총 바로 뒤)에 둔다(2026-11-24 PM이 정함).
  if (isWeapon(id) || isGearRef(id) || isTool(id)) return 'weapon';
  if (isPotion(id)) return 'potion';
  if (isSeed(id)) return 'seed';
  if (isFurniture(id)) return 'furniture';
  if (isCube(id)) return 'tile';
  const art = blockArt(id);
  if (art.kind === 'pwall') return 'wall';
  // 벽지는 꾸미기 안 따로 된 벽지 탭(2026-11-25 사용자 "벽지를 따로 '벽지' 탭으로")
  if (art.kind === 'paper') return 'paper';
  if (art.kind === 'ftile') return 'tile';
  if (art.kind === 'room' && art.slot !== 'top') return 'furniture';
  return 'decor';
}

/** 바깥용 장식품 21개(장식품 탭에서 방 꾸미기 것 뒤에 blocks.ts 차례로) */
const OUTDOOR_IDS = BLOCK_IDS.filter((id) => blockArt(id).kind === 'outdoor');
/** 방 꾸미기 가구 탭 목록(roomDecor.ts 차례: 바닥 타일 → 놓는 벽 → 바닥 가구·깔개)을 작은 탭마다 나눈 것 */
const ROOM_LIST = ROOM_FURNITURE_TAB as readonly BlockId[];
const FLOOR_TILE_IDS = ROOM_LIST.filter((id) => blockArt(id).kind === 'ftile');
const PLACED_WALL_IDS = ROOM_LIST.filter((id) => blockArt(id).kind === 'pwall');
const ROOM_FURNITURE_IDS = ROOM_LIST.filter((id) => blockArt(id).kind === 'room');

function isSlot(value: unknown): value is Stack {
  const stack = value as Partial<Stack> | null;
  return (
    !!stack && isItem(stack.id) && Number.isInteger(stack.count) && stack.count! >= 1 && stack.count! <= STACK_SIZE
  );
}

/** 처음 단축키 칸에 놓는 블록. 그 뒤 8번 칸에 기본 권총, 9번 칸에 횃불이 들어간다(2026-11-24 꽃을 빼고 횃불을 넣음, PM이 정함). */
const HOTBAR_BLOCKS: readonly BlockId[] = ['stone', 'brick', 'wood', 'hedge', 'glass', 'grass', 'pine'];
/** 횃불이 들어가는 단축키 칸(9번 키) */
export const TORCH_SLOT = 8;
/**
 * 저장 목록의 단축키 9칸 뒤(10번째 자리)에 붙이는 '횃불 넣었음' 표시(2026-11-24 사용자 "이미 가입한 계정도 모두 9번 칸에 횃불").
 * 이 표시가 없는 저장은 한 번만 9번 칸을 횃불로 바꾼다. 그 뒤에는 옮기거나 빼도 다시 넣지 않는다. 칸 모양이 아니라 칸으로 읽히지 않는다.
 */
const TORCH_MARK = 'torch1';

/** 무기 탭과 대장간의 자루 순서: 종류 순서(items.ts), 같은 종류는 높은 단계부터 */
export function sortGear(list: Gear[]) {
  const order = (kind: WeaponId) => WEAPON_IDS.indexOf(kind);
  return [...list].sort((a, b) => order(a.kind) - order(b.kind) || b.level - a.level || a.id - b.id);
}

/**
 * 저장된 목록의 앞 9칸이 단축키 칸이다(예전에는 가방 칸까지 저장했고, 그 앞 9칸도 단축키 칸이었다).
 * 같은 것이 두 칸에 있으면 하나만 남기고, 자루는 서버가 아는 내 자루일 때만 둔다(저장된 인벤토리는 위조할 수 있으므로).
 * 대장간 배포(2026-11-16) 전의 저장은 무기 종류('sword', 'machinegun')를 담고 있어서 그 종류의 첫 자루로 바꿔 읽는다.
 * 저장된 것이 없으면(처음 가입) 기본 블록과 기본 권총, 가진 자루로 채운다.
 */
function readHotbar(saved: unknown, gear: ReadonlyMap<number, Gear>): { hotbar: Slot[]; changed: boolean } {
  const hotbar: Slot[] = Array.from({ length: HOTBAR_SIZE }, () => null);
  if (Array.isArray(saved)) {
    const seen = new Set<ItemId>();
    const all = sortGear([...gear.values()]);
    const firstOf = (kind: WeaponId) => {
      const found = all.find((g) => g.kind === kind && !seen.has(gearRef(g.id)));
      return found ? gearRef(found.id) : null;
    };
    saved.slice(0, HOTBAR_SIZE).forEach((slot, i) => {
      if (!isSlot(slot)) return;
      let id: ItemId | null = slot.id;
      if (isGearRef(id) && !gear.has(gearIdOf(id))) id = null;
      else if (isWeapon(id) && id !== 'pistol') id = firstOf(id);
      if (!id || seen.has(id)) return;
      hotbar[i] = { id, count: 1 };
      seen.add(id);
    });
    // 횃불을 한 번만 9번 칸에 넣는다. 원래 9번 칸의 것은 인벤토리 목록에 그대로 있다(블록·권총은 무제한, 자루는 무기 탭).
    if (saved[HOTBAR_SIZE] === TORCH_MARK) return { hotbar, changed: false };
    if (!seen.has(TORCH)) hotbar[TORCH_SLOT] = { id: TORCH, count: 1 };
    return { hotbar, changed: true };
  }
  [...HOTBAR_BLOCKS, 'pistol' as const, TORCH].slice(0, HOTBAR_SIZE).forEach((id, i) => (hotbar[i] = { id, count: 1 }));
  return { hotbar, changed: true };
}

/**
 * 단축키 칸 9개와 가진 것 전체. 블록과 꾸미기는 누구나 모든 종류를 무제한으로 가지므로(2026-11-11 사용자 요청)
 * 인벤토리 창은 탭별 목록이고, 거기서 단축키 칸으로 끌어다 놓는다. 저장하는 것은 단축키 칸뿐이다.
 * 무기는 기본 권총과 가진 자루(대장간에서 산 것, 서버 gear 표)다.
 */
export class Inventory {
  /** 단축키 칸 0~8 */
  readonly slots: Slot[];
  selected = 0;
  private readonly gear = new Map<number, Gear>();
  private readonly listeners: (() => void)[] = [];

  /** 읽을 때 횃불을 넣었거나 처음 가입이라 바로 한 번 저장해야 하는지 */
  readonly needsSave: boolean;

  constructor(saved: unknown, gear: readonly Gear[]) {
    for (const g of gear) this.gear.set(g.id, { ...g });
    const { hotbar, changed } = readHotbar(saved, this.gear);
    this.slots = hotbar;
    this.needsSave = changed;
  }

  /** 서버 profiles.inventory에 저장할 목록: 단축키 9칸 + 횃불 표시 */
  saved(): unknown[] {
    return [...this.slots, TORCH_MARK];
  }

  /** 고른 칸에 횃불이 있는지(9번 칸이 아니어도 횃불을 고르면 든다) */
  get torchSelected() {
    return isTool(this.selectedStack?.id);
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

  /** 가진 자루 목록(무기 탭 순서) */
  get gearList() {
    return sortGear([...this.gear.values()]);
  }

  gearOf(id: ItemId) {
    return isGearRef(id) ? this.gear.get(gearIdOf(id)) : undefined;
  }

  /** 칸의 것이 무기면 그 종류와 자루. 기본 권총은 자루가 없다. */
  armOf(id: ItemId): Arm | null {
    if (id === 'pistol') return { kind: 'pistol', gear: null, key: id };
    const gear = this.gearOf(id);
    return gear ? { kind: gear.kind, gear, key: id } : null;
  }

  get selectedArm(): Arm | null {
    const stack = this.selectedStack;
    return stack ? this.armOf(stack.id) : null;
  }

  /** 이름. 자루는 "+12 장검"처럼 단계를 붙인다. */
  nameOf(id: ItemId) {
    const gear = this.gearOf(id);
    return gear ? `+${gear.level} ${WEAPONS[gear.kind].name}` : itemName(id);
  }

  /** 아이콘을 찾는 id: 자루는 그 종류의 아이콘이다. */
  iconKey(id: ItemId): Exclude<ItemId, GearRef> {
    if (!isGearRef(id)) return id;
    return this.gearOf(id)?.kind ?? 'pistol';
  }

  /** 탭에 보여 줄 것: 블록은 전부, 무기는 기본 권총과 가진 자루. 순서는 blocks.ts, items.ts의 순서다. */
  catalog(tab: TabId): ItemId[] {
    if (tab === 'weapon') return ['pistol', TORCH, ...this.gearList.map((g) => gearRef(g.id))];
    // 포션은 가진 개수와 상관없이 다 보이고, 개수는 칸에 적는다(0개면 상점에서 산다).
    if (tab === 'potion') return POTION_IDS;
    if (tab === 'seed') return SEED_IDS;
    // 가구는 방향마다 블록이 따로 있어서 종류마다 첫 방향만 보이고, 단축키 칸에서 돌린다(rotateSelected).
    // 2026-11-24 방 꾸미기: 옛 가구(f_)는 탭에서 숨기고(놓인 것은 그대로 보이고 회수됨), 새 가구를 낸다. 놓는 벽은 벽 탭, 바닥 타일은 타일 탭.
    if (tab === 'furniture') return ROOM_FURNITURE_IDS;
    if (tab === 'wall') return PLACED_WALL_IDS;
    if (tab === 'decor') return [...(ROOM_DECOR_TAB as readonly BlockId[]).filter((id) => tabOf(id) === 'decor'), ...OUTDOOR_IDS];
    if (tab === 'paper') return (ROOM_DECOR_TAB as readonly BlockId[]).filter((id) => tabOf(id) === 'paper');
    // 타일: 상자 블록 뒤에 바닥 타일
    if (tab === 'tile') return [...BLOCK_IDS.filter((id) => isCube(id)), ...FLOOR_TILE_IDS];
    return BLOCK_IDS.filter((id) => tabOf(id) === tab);
  }

  /** 고른 칸의 가구를 다음 방향으로 돌린다. 돌릴 것이 없으면 false */
  rotateSelected() {
    const stack = this.selectedStack;
    const id = stack?.id;
    const next = id && !isWeapon(id) && !isGearRef(id) && !isPotion(id) && !isSeed(id) && !isTool(id) ? rotatedBlock(id) : null;
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

  /** 새로 산 자루를 무기 탭에 넣고, 단축키 칸에 빈칸이 있으면 거기에도 넣는다. 단축키 칸에 들어갔으면 true */
  addGear(gear: Gear) {
    this.gear.set(gear.id, { ...gear });
    const empty = this.slots.indexOf(null);
    if (empty >= 0) this.slots[empty] = { id: gearRef(gear.id), count: 1 };
    this.changed();
    return empty >= 0;
  }

  /** 강화로 단계가 바뀐 자루 */
  setGearLevel(id: number, level: number) {
    const gear = this.gear.get(id);
    if (!gear) return;
    gear.level = level;
    this.changed();
  }

  /** 팔았거나 파괴된 자루를 목록과 단축키 칸에서 뺀다. */
  removeGear(id: number) {
    if (!this.gear.delete(id)) return;
    const at = this.hotbarIndexOf(gearRef(id));
    if (at >= 0) this.slots[at] = null;
    this.changed();
  }
}
