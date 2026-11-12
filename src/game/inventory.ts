import { BLOCKS, type BlockId } from '../blocks';
import { isItem, isWeapon, type ItemId, type WeaponId } from '../items';

export const HOTBAR_SIZE = 9;
/** 가방 칸. 블록이 늘어 2026-11-12에 27칸(3줄)에서 63칸(7줄)으로 늘렸다. 블록과 무기를 합친 수보다 커야 모두 들어간다. */
export const BAG_SIZE = 63;
/** 예전 저장 형식의 한 칸 최대 개수. 지금은 개수를 세지 않지만 저장된 칸을 읽을 때 검사한다. */
const STACK_SIZE = 64;

export interface Stack {
  id: ItemId;
  /** 개수는 세지 않는다(블록은 무제한, 무기는 하나). 저장 형식을 지키려고 남겨 둔 값이다. */
  count: number;
}

export type Slot = Stack | null;

function isSlot(value: unknown): value is Slot {
  if (value === null) return true;
  const stack = value as Partial<Stack>;
  return isItem(stack.id) && Number.isInteger(stack.count) && stack.count! >= 1 && stack.count! <= STACK_SIZE;
}

/** 가방이 작던 때 저장한 목록(칸 수가 더 적음)도 받는다. 모자란 칸은 arrange가 빈칸으로 채운다. */
function isSlotList(value: unknown): value is Slot[] {
  return Array.isArray(value) && value.length <= HOTBAR_SIZE + BAG_SIZE && value.every(isSlot);
}

/** 처음 단축키 칸에 놓는 블록. 나머지 블록은 가방에 들어간다. */
const HOTBAR_BLOCKS: readonly BlockId[] = ['stone', 'brick', 'wood', 'hedge', 'glass', 'grass', 'pine', 'flower'];

/**
 * 블록과 꾸미기는 누구나 모든 종류를 무제한으로 가진다(2026-11-11 사용자 요청, 상점에서 팔지 않음).
 * 저장된 칸 배치는 살리고, 같은 것이 두 칸에 있으면 하나만 남기고, 빠진 블록은 빈칸에 채운다.
 * 무기는 서버가 아는 보유 목록에 맞춘다(저장된 인벤토리는 위조할 수 있으므로).
 */
function arrange(saved: unknown, owned: readonly WeaponId[]): Slot[] {
  const slots: Slot[] = Array.from({ length: HOTBAR_SIZE + BAG_SIZE }, () => null);
  if (isSlotList(saved)) saved.forEach((slot, i) => (slots[i] = slot ? { id: slot.id, count: 1 } : null));
  const seen = new Set<ItemId>();
  slots.forEach((slot, i) => {
    if (!slot) return;
    if (seen.has(slot.id) || (isWeapon(slot.id) && !owned.includes(slot.id))) slots[i] = null;
    else seen.add(slot.id);
  });

  const put = (id: ItemId, from: number) => {
    if (seen.has(id)) return;
    let empty = slots.indexOf(null, from);
    if (empty < 0) empty = slots.indexOf(null);
    if (empty < 0) return;
    slots[empty] = { id, count: 1 };
    seen.add(id);
  };
  for (const id of HOTBAR_BLOCKS) put(id, 0);
  for (const id of owned) put(id, 0);
  for (const id of Object.keys(BLOCKS) as BlockId[]) put(id, HOTBAR_SIZE);
  return slots;
}

/** 슬롯 0~8은 단축키 칸, 9~35는 가방 칸이다. 칸마다 한 종류씩 들어 있고 쓰거나 회수해도 개수가 변하지 않는다. */
export class Inventory {
  readonly slots: Slot[];
  selected = 0;
  private readonly listeners: (() => void)[] = [];

  constructor(saved: unknown, owned: readonly WeaponId[]) {
    this.slots = arrange(saved, owned);
  }

  onChange(fn: () => void) {
    this.listeners.push(fn);
  }

  private changed() {
    for (const fn of this.listeners) fn();
  }

  get selectedStack(): Slot {
    return this.slots[this.selected];
  }

  select(index: number) {
    this.selected = index;
    this.changed();
  }

  /** 새로 산 무기를 빈칸에 넣는다. 자리가 없으면 false다. */
  addWeapon(id: WeaponId) {
    if (this.slots.some((slot) => slot?.id === id)) return true;
    const empty = this.slots.indexOf(null);
    if (empty < 0) return false;
    this.slots[empty] = { id, count: 1 };
    this.changed();
    return true;
  }

  /** 슬롯끼리 자리를 바꾼다. */
  move(from: number, to: number) {
    if (from === to) return;
    [this.slots[from], this.slots[to]] = [this.slots[to], this.slots[from]];
    this.changed();
  }
}
