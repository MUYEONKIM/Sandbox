import { BLOCK_IDS, BLOCKS, type BlockId } from '../blocks';

export const HOTBAR_SIZE = 9;
export const BAG_SIZE = 27;
export const STACK_SIZE = 64;

export interface Stack {
  id: BlockId;
  count: number;
}

export type Slot = Stack | null;

function isSlot(value: unknown): value is Slot {
  if (value === null) return true;
  const stack = value as Partial<Stack>;
  return (
    Object.hasOwn(BLOCKS, stack.id ?? '') &&
    Number.isInteger(stack.count) &&
    stack.count! >= 1 &&
    stack.count! <= STACK_SIZE
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

/** 슬롯 0~8은 단축키 칸, 9~35는 가방 칸이다. */
export class Inventory {
  readonly slots: Slot[];
  selected = 0;
  private readonly listeners: (() => void)[] = [];

  constructor(saved: unknown) {
    this.slots = isSlotList(saved) ? saved : starterSlots();
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
  takeSelected(): BlockId | null {
    const stack = this.selectedStack;
    if (!stack) return null;
    stack.count--;
    if (stack.count === 0) this.slots[this.selected] = null;
    this.changed();
    return stack.id;
  }

  canAdd(id: BlockId) {
    return this.slots.some((s) => s === null || (s.id === id && s.count < STACK_SIZE));
  }

  /** 블록 하나를 넣는다. 가득 차면 false를 돌려준다. */
  add(id: BlockId) {
    const stack = this.slots.find((s) => s?.id === id && s.count < STACK_SIZE);
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
      const moved = Math.min(a.count, STACK_SIZE - b.count);
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
