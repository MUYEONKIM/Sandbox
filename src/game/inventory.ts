import type { BlockId } from '../blocks';

export const HOTBAR_SIZE = 9;
export const BAG_SIZE = 27;
export const STACK_SIZE = 64;

export interface Stack {
  id: BlockId;
  count: number;
}

export type Slot = Stack | null;

/** 슬롯 0~8은 단축키 칸, 9~35는 가방 칸이다. */
export class Inventory {
  readonly slots: Slot[] = Array.from({ length: HOTBAR_SIZE + BAG_SIZE }, () => null);
  selected = 0;
  private readonly listeners: (() => void)[] = [];

  constructor(start: Partial<Record<number, Stack>>) {
    for (const [i, stack] of Object.entries(start)) this.slots[Number(i)] = stack ?? null;
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
