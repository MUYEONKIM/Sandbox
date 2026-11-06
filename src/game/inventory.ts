import { BLOCK_IDS } from '../blocks';
import { isItem, isWeapon, WEAPON_IDS, type ItemId } from '../items';

export const HOTBAR_SIZE = 9;
export const BAG_SIZE = 27;
export const STACK_SIZE = 64;

export interface Stack {
  id: ItemId;
  count: number;
}

export type Slot = Stack | null;

/** 무기는 한 칸에 하나만 들어간다. */
function stackLimit(id: ItemId) {
  return isWeapon(id) ? 1 : STACK_SIZE;
}

function isSlot(value: unknown): value is Slot {
  if (value === null) return true;
  const stack = value as Partial<Stack>;
  return (
    isItem(stack.id) &&
    Number.isInteger(stack.count) &&
    stack.count! >= 1 &&
    stack.count! <= stackLimit(stack.id)
  );
}

function isSlotList(value: unknown): value is Slot[] {
  return Array.isArray(value) && value.length === HOTBAR_SIZE + BAG_SIZE && value.every(isSlot);
}

/** 처음 가입한 플레이어의 인벤토리: 단축키 칸과 가방에 벽 블록을 한 묶음씩 넣는다. */
function starterSlots(): Slot[] {
  const slots: Slot[] = Array.from({ length: HOTBAR_SIZE + BAG_SIZE }, () => null);
  BLOCK_IDS.forEach((id, i) => {
    slots[i] = { id, count: STACK_SIZE };
    slots[HOTBAR_SIZE + i] = { id, count: STACK_SIZE };
  });
  return slots;
}

/** 무기가 없는 플레이어(기존 계정 포함)에게 기본 무기를 빈칸에 넣어 준다. */
function giveStarterWeapons(slots: Slot[]) {
  for (const id of WEAPON_IDS) {
    if (slots.some((slot) => slot?.id === id)) continue;
    const empty = slots.indexOf(null);
    if (empty >= 0) slots[empty] = { id, count: 1 };
  }
}

/** 슬롯 0~8은 단축키 칸, 9~35는 가방 칸이다. */
export class Inventory {
  readonly slots: Slot[];
  selected = 0;
  private readonly listeners: (() => void)[] = [];

  constructor(saved: unknown) {
    this.slots = isSlotList(saved) ? saved : starterSlots();
    giveStarterWeapons(this.slots);
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

  /** 선택한 칸에서 블록 하나를 꺼낸다. */
  takeSelected(): ItemId | null {
    const stack = this.selectedStack;
    if (!stack) return null;
    stack.count--;
    if (stack.count === 0) this.slots[this.selected] = null;
    this.changed();
    return stack.id;
  }

  canAdd(id: ItemId) {
    return this.slots.some((s) => s === null || (s.id === id && s.count < stackLimit(id)));
  }

  /** 블록 하나를 넣는다. 가득 차면 false를 돌려준다. */
  add(id: ItemId) {
    const stack = this.slots.find((s) => s?.id === id && s.count < stackLimit(id));
    if (stack) {
      stack.count++;
    } else {
      const empty = this.slots.indexOf(null);
      if (empty < 0) return false;
      this.slots[empty] = { id, count: 1 };
    }
    this.changed();
    return true;
  }

  /** 슬롯끼리 옮긴다. 같은 블록이면 합치고, 다르면 서로 바꾼다. */
  move(from: number, to: number) {
    if (from === to) return;
    const a = this.slots[from];
    const b = this.slots[to];
    if (a && b && a.id === b.id) {
      const moved = Math.min(a.count, stackLimit(a.id) - b.count);
      b.count += moved;
      a.count -= moved;
      if (a.count === 0) this.slots[from] = null;
    } else {
      this.slots[from] = b;
      this.slots[to] = a;
    }
    this.changed();
  }
}
