import type { WorkId } from './maps';

export interface LootItem {
  item: string;
  workplace: string;
  name: string;
  blurb: string;
  price: number;
  weight: number;
}

export interface Workplace {
  id: WorkId;
  name: string;
  blurb: string;
  gatherMs: number;
}

export interface EconomyData {
  gold: number;
  loot: LootItem[];
  workplaces: Workplace[];
  stash: { item: string; count: number }[];
}

/** 희귀 자원을 알림에서 돋보이게 하는 가격 기준 */
const RARE_PRICE = 40;

/** 내 골드와 가진 자원. 값은 모두 서버가 정하고 여기서는 화면에 보여 줄 사본만 들고 있다. */
export class Economy {
  gold: number;
  readonly workplaces: Workplace[];
  private readonly loot = new Map<string, LootItem>();
  private readonly stash = new Map<string, number>();
  private readonly listeners: (() => void)[] = [];

  constructor(data: EconomyData) {
    this.gold = data.gold;
    this.workplaces = data.workplaces;
    for (const item of data.loot) this.loot.set(item.item, item);
    for (const { item, count } of data.stash) this.stash.set(item, count);
  }

  onChange(fn: () => void) {
    this.listeners.push(fn);
  }

  private changed() {
    for (const fn of this.listeners) fn();
  }

  workplace(id: string) {
    return this.workplaces.find((w) => w.id === id);
  }

  lootItem(item: string) {
    return this.loot.get(item);
  }

  /** 자원 표의 확률과 가격으로 계산한 분당 평균 벌이 */
  goldPerMinute(place: Workplace) {
    const items = [...this.loot.values()].filter((item) => item.workplace === place.id);
    const totalWeight = items.reduce((sum, { weight }) => sum + weight, 0);
    const totalValue = items.reduce((sum, { weight, price }) => sum + weight * price, 0);
    return totalWeight ? (totalValue / totalWeight) * (60000 / place.gatherMs) : 0;
  }

  isRare(item: LootItem) {
    return item.price >= RARE_PRICE;
  }

  add(item: string) {
    this.stash.set(item, (this.stash.get(item) ?? 0) + 1);
    this.changed();
  }

  /** 가진 자원 목록. 비싼 것부터 보여 준다. */
  entries() {
    return [...this.stash.entries()]
      .flatMap(([item, count]) => {
        const info = this.loot.get(item);
        return info ? [{ ...info, count }] : [];
      })
      .sort((a, b) => b.price - a.price);
  }

  get stashValue() {
    return this.entries().reduce((sum, { price, count }) => sum + price * count, 0);
  }

  setSold(gold: number) {
    this.gold = gold;
    this.stash.clear();
    this.changed();
  }
}
