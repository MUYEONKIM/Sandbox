import type { WeaponId } from '../items';
import type { WorkId } from './maps';
import type { StatId } from './stats';

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

export interface ShopWeapon {
  id: WeaponId;
  blurb: string;
  price: number;
  damage: number;
  cooldownMs: number;
}

export interface ShopTool {
  id: string;
  workplace: WorkId;
  name: string;
  blurb: string;
  price: number;
}

export interface ShopStat {
  id: StatId;
  name: string;
  blurb: string;
  basePrice: number;
  priceStep: number;
}

export interface EconomyData {
  gold: number;
  loot: LootItem[];
  workplaces: Workplace[];
  stash: { item: string; count: number }[];
  weapons: ShopWeapon[];
  tools: ShopTool[];
  stats: ShopStat[];
  myStats: Record<StatId, number>;
  owned: WeaponId[];
  ownedTools: string[];
}

/** 희귀 자원을 알림에서 돋보이게 하는 가격 기준 */
const RARE_PRICE = 40;

/** DB에 없는 무기를 쏠 때 쓰는 발사 간격 */
const DEFAULT_COOLDOWN_MS = 250;

/** 내 골드, 자원, 무기, 스텟. 값은 모두 서버가 정하고 여기서는 화면에 보여 줄 사본만 들고 있다. */
export class Economy {
  gold: number;
  readonly workplaces: Workplace[];
  readonly stats: ShopStat[];
  readonly tools: ShopTool[];
  private readonly weapons: ShopWeapon[];
  private readonly myStats: Record<StatId, number>;
  private readonly owned: Set<WeaponId>;
  private readonly ownedTools: Set<string>;
  private readonly loot = new Map<string, LootItem>();
  private readonly stash = new Map<string, number>();
  private readonly listeners: (() => void)[] = [];

  constructor(data: EconomyData) {
    this.gold = data.gold;
    this.workplaces = data.workplaces;
    this.stats = data.stats;
    this.tools = data.tools;
    this.weapons = data.weapons;
    this.myStats = { ...data.myStats };
    this.owned = new Set(data.owned);
    this.ownedTools = new Set(data.ownedTools);
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

  add(item: string, count = 1) {
    this.stash.set(item, (this.stash.get(item) ?? 0) + count);
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

  /** 상점에서 파는 무기. 기본 지급품은 뺀다. */
  get forSale() {
    return this.weapons.filter(({ price }) => price > 0);
  }

  cooldownOf(id: WeaponId) {
    return this.weapons.find((weapon) => weapon.id === id)?.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  }

  owns(id: WeaponId) {
    return this.owned.has(id);
  }

  ownsTool(id: string) {
    return this.ownedTools.has(id);
  }

  stat(id: StatId) {
    return this.myStats[id];
  }

  /** 스텟은 살수록 비싸진다. 서버의 buy_stat과 같은 계산이다. */
  statPrice({ id, basePrice, priceStep }: ShopStat) {
    return basePrice + priceStep * this.myStats[id];
  }

  setWeaponBought(id: WeaponId, gold: number) {
    this.gold = gold;
    this.owned.add(id);
    this.changed();
  }

  setToolBought(id: string, gold: number) {
    this.gold = gold;
    this.ownedTools.add(id);
    this.changed();
  }

  setStatBought(id: StatId, value: number, gold: number) {
    this.gold = gold;
    this.myStats[id] = value;
    this.changed();
  }
}
