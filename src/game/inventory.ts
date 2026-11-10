import type { BlockId } from '../blocks';
import { isItem, isWeapon, type ItemId, type WeaponId } from '../items';

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

/** 가입할 때 단축키 칸과 가방에 한 묶음씩 넣어 주는 벽 블록 */
const STARTER_BLOCKS: readonly BlockId[] = ['stone', 'brick', 'wood', 'hedge'];

/**
 * 모든 플레이어가 한 번 한 묶음씩 받는 기본 블록(2026-11-10에 더함). 서버 gifts 표가 계정마다 한 번만 주게 막는다.
 * 새로 가입한 사람도 처음 접속할 때 이것으로 받는다.
 */
export const BASIC_GIFT = {
  name: 'basic-blocks',
  blocks: [
    'cobble',
    'dirt',
    'grass',
    'sand',
    'glass',
    'snow',
    'white_block',
    'black_block',
    'red_block',
    'blue_block',
    'yellow_block',
  ] as readonly BlockId[],
};

/** 처음 가입한 플레이어의 인벤토리: 단축키 칸과 가방에 벽 블록을 한 묶음씩 넣는다. 꾸미기 블록은 상점에서 산다. */
function starterSlots(): Slot[] {
  const slots: Slot[] = Array.from({ length: HOTBAR_SIZE + BAG_SIZE }, () => null);
  STARTER_BLOCKS.forEach((id, i) => {
    slots[i] = { id, count: STACK_SIZE };
    slots[HOTBAR_SIZE + i] = { id, count: STACK_SIZE };
  });
  return slots;
}

/** 저장된 인벤토리는 위조할 수 있으므로 서버가 아는 보유 무기에 맞춘다. */
function matchWeapons(slots: Slot[], owned: readonly WeaponId[]) {
  slots.forEach((slot, i) => {
    if (slot && isWeapon(slot.id) && !owned.includes(slot.id)) slots[i] = null;
  });
  for (const id of owned) {
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

  constructor(saved: unknown, owned: readonly WeaponId[]) {
    this.slots = isSlotList(saved) ? saved : starterSlots();
    matchWeapons(this.slots, owned);
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

  /** id를 몇 개 더 넣을 수 있는지 센다. */
  room(id: ItemId) {
    const limit = stackLimit(id);
    return this.slots.reduce((sum, s) => sum + (s === null ? limit : s.id === id ? limit - s.count : 0), 0);
  }

  /** 블록 여러 개를 한 번에 넣고 넣은 개수를 돌려준다. 자리가 모자라면 남는 것은 버린다. */
  give(id: ItemId, count: number) {
    let given = 0;
    while (given < count) {
      const stack = this.slots.find((s) => s?.id === id && s.count < stackLimit(id));
      const empty = stack ? -1 : this.slots.indexOf(null);
      if (!stack && empty < 0) break;
      const target = stack ?? (this.slots[empty] = { id, count: 0 });
      const moved = Math.min(count - given, stackLimit(id) - target.count);
      target.count += moved;
      given += moved;
    }
    if (given) this.changed();
    return given;
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
