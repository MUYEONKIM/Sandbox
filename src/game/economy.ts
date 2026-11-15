import type { PotionId, WeaponId } from '../items';
import { cropValue, type CropId, type CropInfo, type Grade } from './farm';
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
  renameTickets: number;
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

/** 상점에서 파는 포션(서버 potions 표) */
export interface PotionInfo {
  id: PotionId;
  name: string;
  blurb: string;
  heal: number;
  price: number;
}

/** 닉네임 변경권 한 장 값. 서버 buy_rename_ticket의 100000과 같다(2026-11-13 사용자 요청 "10만 골드"). */
export const RENAME_PRICE = 100_000;

/** 한 번 캘 때 얻는 기본 개수. 서버 harvest의 2와 같다(2026-11-11 사용자 요청으로 2배). */
export const HARVEST_COUNT = 2;

/** 희귀 자원을 알림에서 돋보이게 하는 가격 기준 */
const RARE_PRICE = 40;

/** DB에 없는 무기를 쏠 때 쓰는 발사 간격 */
const DEFAULT_COOLDOWN_MS = 250;

/** 내 골드, 자원, 무기, 스텟. 값은 모두 서버가 정하고 여기서는 화면에 보여 줄 사본만 들고 있다. */
export class Economy {
  gold: number;
  /** 가진 닉네임 변경권 수 */
  renameTickets: number;
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
  potions: PotionInfo[] = [];
  private readonly potionCounts = new Map<PotionId, number>();
  /** 농장 작물 표, 내 씨앗과 거둔 작물(2026-11-15) */
  crops: CropInfo[] = [];
  private readonly seeds = new Map<CropId, number>();
  private readonly harvested = new Map<string, number>();

  constructor(data: EconomyData) {
    this.gold = data.gold;
    this.renameTickets = data.renameTickets;
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

  /** 자원 표의 확률과 가격으로 계산한 분당 평균 벌이. LUK와 도구는 빼고 센다. */
  goldPerMinute(place: Workplace) {
    const items = [...this.loot.values()].filter((item) => item.workplace === place.id);
    const totalWeight = items.reduce((sum, { weight }) => sum + weight, 0);
    const totalValue = items.reduce((sum, { weight, price }) => sum + weight * price, 0);
    return totalWeight ? (totalValue / totalWeight) * HARVEST_COUNT * (60000 / place.gatherMs) : 0;
  }

  isRare(item: LootItem) {
    return item.price >= RARE_PRICE;
  }

  add(item: string, count = 1) {
    this.stash.set(item, (this.stash.get(item) ?? 0) + count);
    this.changed();
  }

  /** 현상금으로 빼앗긴 자원을 뺀다. */
  take(item: string, count: number) {
    const left = (this.stash.get(item) ?? 0) - count;
    if (left > 0) this.stash.set(item, left);
    else this.stash.delete(item);
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

  /** 서버가 알려 준 골드로 맞춘다. 도박장에서 걸고 받을 때 쓴다. */
  setGold(gold: number) {
    this.gold = gold;
    this.changed();
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

  /**
   * 몬스터에게 주는 한 방의 피해: 무기 피해 × (1 + STR × 0.1%). 소수점 아래는 그 확률만큼 1을 더한다(서버 hit_player와 같은 식).
   * 몬스터 체력은 서버가 모르고 같은 던전 사람끼리 나눠 보므로 피해도 클라이언트가 정한다.
   */
  monsterDamage(id: WeaponId) {
    const base = this.weapons.find((weapon) => weapon.id === id)?.damage ?? 0;
    return Math.max(1, Math.floor(base * (1 + this.stat('str') * 0.001) + Math.random()));
  }

  /** 포션 표와 내가 가진 개수. 접속할 때 따로 읽는다(표가 없으면 빈 목록). */
  setPotions(catalog: PotionInfo[], counts: { potion: PotionId; count: number }[]) {
    this.potions = catalog;
    this.potionCounts.clear();
    for (const { potion, count } of counts) this.potionCounts.set(potion, count);
    this.changed();
  }

  potion(id: PotionId) {
    return this.potions.find((potion) => potion.id === id);
  }

  potionCount(id: PotionId) {
    return this.potionCounts.get(id) ?? 0;
  }

  setPotionCount(id: PotionId, count: number) {
    this.potionCounts.set(id, count);
    this.changed();
  }

  /** 작물 표와 내 씨앗·작물. 접속할 때 따로 읽는다(표가 없으면 빈 목록). */
  setFarm(crops: CropInfo[], stock: { kind: 'seed' | Grade; crop: CropId; count: number }[]) {
    this.crops = crops;
    this.seeds.clear();
    this.harvested.clear();
    for (const { kind, crop, count } of stock) {
      if (kind === 'seed') this.seeds.set(crop, count);
      else if (count > 0) this.harvested.set(`${kind}:${crop}`, count);
    }
    this.changed();
  }

  cropInfo(id: CropId) {
    return this.crops.find((crop) => crop.id === id);
  }

  seedCount(crop: CropId) {
    return this.seeds.get(crop) ?? 0;
  }

  setSeedCount(crop: CropId, count: number) {
    this.seeds.set(crop, count);
    this.changed();
  }

  addCrop(crop: CropId, grade: Grade, count: number) {
    const k = `${grade}:${crop}`;
    this.harvested.set(k, (this.harvested.get(k) ?? 0) + count);
    this.changed();
  }

  clearCrops() {
    this.harvested.clear();
    this.changed();
  }

  /** 거둔 작물(종류마다 한 줄)과 팔면 받는 값 */
  get cropStock() {
    const rows: { crop: CropInfo; grade: Grade; count: number; value: number }[] = [];
    for (const crop of this.crops) {
      for (const grade of ['praise', 'normal', 'blame'] as Grade[]) {
        const count = this.harvested.get(`${grade}:${crop.id}`) ?? 0;
        if (count > 0) rows.push({ crop, grade, count, value: count * cropValue(crop.price, grade) });
      }
    }
    return rows;
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

  /**
   * 스텟을 count포인트 한 번에 살 때의 값. 1포인트마다 priceStep씩 비싸지므로 그 합이다.
   * 서버의 buy_stat과 같은 계산이다.
   */
  statPrice({ id, basePrice, priceStep }: ShopStat, count = 1) {
    const owned = this.myStats[id];
    return count * basePrice + priceStep * (count * owned + (count * (count - 1)) / 2);
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

  setRenameTickets(tickets: number, gold = this.gold) {
    this.gold = gold;
    this.renameTickets = tickets;
    this.changed();
  }

  setStatBought(id: StatId, value: number, gold: number) {
    this.gold = gold;
    this.myStats[id] = value;
    this.changed();
  }
}
