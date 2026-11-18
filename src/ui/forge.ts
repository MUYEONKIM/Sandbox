import type { Economy } from '../game/economy';
import {
  buyPrice,
  GEAR_MAX,
  hammerMs,
  LEVEL_MAX,
  SCROLL_IDS,
  SCROLL_NAMES,
  type ForgeTable,
  type Gear,
  type ScrollId,
} from '../game/forge';
import { goldText, type Gold } from '../game/gold';
import type { Inventory } from '../game/inventory';
import { paintWeaponIcon, WEAPONS, type WeaponId } from '../items';
import { paintForgeIcon } from '../art/weapons';
import type { ForgeFail, ForgeResult } from '../net/session';
import { element } from './dom';
import { ForgeFx } from './forgeFx';
import { josa, josaRo } from './notice';
import { PurchaseWindow } from './purchase';

/** 대장간 창의 탭: 무기 걸이 앞 창구는 사기, 모루 앞 창구는 강화·팔기(src/game/tower.ts의 SMITHY_PROPS) */
export type ForgeTab = 'buy' | 'anvil';

interface ForgeActions {
  buy(kind: WeaponId): Promise<ForgeFail | null>;
  sell(gear: Gear): Promise<ForgeFail | null>;
  hammer(gear: Gear, scrolls: ReadonlySet<ScrollId>): Promise<ForgeResult | ForgeFail>;
  /** 연출이 사라진 뒤 결과를 가방에 붙인다(단계 바꾸기, 부서진 무기 빼기). */
  land(gear: Gear, outcome: ForgeResult): void;
}

const FAIL_TEXT: Record<ForgeFail, string> = {
  gold: '골드가 모자랍니다.',
  'too-many': `기본 권총 말고 ${GEAR_MAX}자루까지 가집니다. 하나를 판 뒤에 사 주세요.`,
  fast: '망치가 아직 식지 않았습니다. 잠시 뒤에 다시 두드려 주세요.',
  elsewhere: '대장간 안에서만 강화합니다.',
  gone: '그 무기가 없습니다. 창을 닫았다 다시 열어 주세요.',
  failed: '처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
};

const SCROLL_BLURBS: Record<ScrollId, string> = {
  guard: '이번 망치질에서 파괴가 나오면 유지로 바꿉니다.',
  hold: '이번 망치질에서 하락이 나오면 유지로 바꿉니다.',
  boost: '이번 망치질의 유지 확률 10%p를 성공으로 옮깁니다.',
};
const SCROLL_UNUSABLE: Record<ScrollId, string> = {
  guard: '파괴는 +20 도전부터 나와서 지금은 쓰지 않습니다.',
  hold: '하락은 +12 도전부터 나와서 지금은 쓰지 않습니다.',
  boost: '유지 확률이 10%보다 낮아 쓰지 않습니다.',
};

/** 팔기 버튼을 한 번 더 눌러야 파는 시간(실수로 높은 단계를 팔지 않게, 에이전트가 정함) */
const SELL_CONFIRM_MS = 3000;
/** 망치질 대기 시간을 다시 쓰는 간격 */
const COUNTDOWN_MS = 100;

const percent = (value: number) => `${Number(value.toFixed(1))}%`;

/** 아이콘 그림은 한 번만 만든다(창을 다시 그릴 때마다 캔버스를 만들지 않게). */
const iconUrls = new Map<string, string>();
function weaponIcon(kind: WeaponId) {
  let url = iconUrls.get(kind);
  if (!url) {
    url = paintWeaponIcon(kind).toDataURL();
    iconUrls.set(kind, url);
  }
  return url;
}
function scrollIcon(id: ScrollId) {
  const key = `scroll:${id}`;
  let url = iconUrls.get(key);
  if (!url) {
    url = paintForgeIcon(id === 'guard' ? 'scroll_guard' : id === 'hold' ? 'scroll_hold' : 'scroll_success').toDataURL();
    iconUrls.set(key, url);
  }
  return url;
}

/**
 * 대장간 창(2026-11-16, docs/balance/weapons.md 2·6장, forge-items.md 3장). 무기를 사고, 망치질로 강화하고, 판다.
 * 값과 결과는 서버(buy_gear, forge_gear, sell_gear)가 정하고, 여기 보이는 값은 같은 식으로 미리 셈한 것이다.
 */
export class ForgeWindow extends PurchaseWindow {
  private tab: ForgeTab = 'buy';
  private readonly tabButtons = new Map<ForgeTab, HTMLButtonElement>();
  private readonly buyPane: HTMLElement;
  private readonly anvilPane: HTMLElement;
  private readonly countLine: HTMLElement;
  private readonly gearList: HTMLElement;
  private readonly bench: HTMLElement;
  private selected: number | null = null;
  private readonly scrolls = new Set<ScrollId>();
  private result = '';
  /** 서버 답을 받은 때부터 센다(서버는 봐주지 않으므로). */
  private nextHammerAt = 0;
  private countdown = 0;
  /** 망치질 버튼. 대기 시간은 이 글자만 고친다. */
  private hammerButton: HTMLButtonElement | null = null;
  private sellArmedUntil = 0;
  /** 망치질 번개 연출(src/ui/forgeFx.ts) */
  readonly fx = new ForgeFx();

  constructor(
    parent: HTMLElement,
    economy: Economy,
    private readonly inventory: Inventory,
    private readonly table: ForgeTable,
    private readonly actions: ForgeActions,
  ) {
    super(parent, economy, '대장간', '무기를 사고, 망치로 두드려 강화하고, 팝니다. 강화할수록 비싸게 팔립니다.');

    const tabs = element('shop-amounts', this.root);
    for (const [id, label] of [
      ['buy', '무기 사기'],
      ['anvil', '강화 · 팔기'],
    ] as [ForgeTab, string][]) {
      const button = element('shop-amount', tabs, 'button') as HTMLButtonElement;
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => this.show(id));
      this.tabButtons.set(id, button);
    }

    this.buyPane = element('forge-pane', this.root);
    this.countLine = element('office-note', this.buyPane);
    const weaponList = element('shop-weapons', this.buyPane);
    for (const weapon of economy.forSale) this.addWeapon(weaponList, weapon.id);

    // 망치질·팔기 버튼과 결과를 탭 바로 아래에 둔다(2026-11-16 사용자 "망치질 버튼 같은 상호작용은 제일 위에").
    // 그 아래 고른 무기와 확률, 두루마리, 내 무기 목록 순서다(PM이 정함).
    this.anvilPane = element('forge-pane', this.root);
    this.bench = element('shop-stats', this.anvilPane);
    element('office-section', this.anvilPane).textContent = '내 무기';
    this.gearList = element('shop-stats', this.anvilPane);

    this.refreshers.push(() => this.renderPanes());
    inventory.onChange(() => {
      if (this.isOpen) this.render();
    });
    this.finish();
  }

  /** 창구에 따라 탭을 골라 연다. */
  openAt(tab: ForgeTab) {
    this.tab = tab;
    this.result = '';
    this.open();
  }

  close() {
    super.close();
    this.fx.stop();
    window.clearInterval(this.countdown);
    this.countdown = 0;
  }

  private show(tab: ForgeTab) {
    this.tab = tab;
    this.render();
  }

  private get luk() {
    return this.economy.stat('luk');
  }

  private basePrice(kind: WeaponId) {
    return this.economy.weapon(kind)?.price ?? 0;
  }

  private spec(kind: WeaponId) {
    const info = this.economy.weapon(kind);
    const weapon = WEAPONS[kind];
    if (!info) return '';
    const seconds = `${Number((info.cooldownMs / 1000).toFixed(2))}초`;
    if (weapon.melee) return `피해 ${info.damage} · ${seconds} · ${weapon.range}칸 · ${weapon.arc}도`;
    const shots = info.pellets > 1 ? `${info.damage} × ${info.pellets}알` : `${info.damage}`;
    const reload = `${Number((info.reloadMs / 1000).toFixed(1))}초`;
    return `피해 ${shots} · ${seconds} · ${weapon.range}칸 · 탄창 ${info.magazine}발 · 재장전 ${reload}`;
  }

  private addWeapon(list: HTMLElement, kind: WeaponId) {
    const row = element('shop-weapon', list);
    const icon = element('shop-weapon-icon', row, 'img') as HTMLImageElement;
    icon.src = weaponIcon(kind);
    icon.alt = '';
    element('shop-weapon-name', row).textContent = WEAPONS[kind].name;
    element('shop-weapon-blurb', row).textContent = this.economy.weapon(kind)?.blurb ?? '';
    element('shop-weapon-spec', row).textContent = this.spec(kind);
    const buy = this.buyButton(row, async () => {
      const fail = await this.actions.buy(kind);
      this.result = fail ? FAIL_TEXT[fail] : '';
    });
    this.refreshers.push(() => {
      const price = buyPrice(this.basePrice(kind));
      buy.textContent = goldText(price);
      buy.disabled = this.busy || this.economy.gold < price || this.inventory.gearList.length >= GEAR_MAX;
    });
  }

  private renderPanes() {
    for (const [id, button] of this.tabButtons) button.classList.toggle('chosen', id === this.tab);
    this.buyPane.hidden = this.tab !== 'buy';
    this.anvilPane.hidden = this.tab !== 'anvil';
    const count = this.inventory.gearList.length;
    const luk =
      this.luk > 0
        ? ` 사는 값은 LUK와 상관없습니다. LUK ${this.luk.toLocaleString()} 배율(×${(1 + this.luk / 300).toFixed(2)})은 판매가 가운데 산 값을 넘는 몫에만 붙습니다(+8부터).`
        : '';
    this.countLine.textContent =
      `가진 무기 ${count} / ${GEAR_MAX}자루(기본 권총 빼고). 새 무기는 +0이고, 바로 팔면 산 값의 절반입니다.${luk}` +
      (this.tab === 'buy' && this.result ? ` ${this.result}` : '');
    if (this.tab === 'anvil') this.renderAnvil();
  }

  private renderAnvil() {
    const list = this.inventory.gearList;
    if (this.selected !== null && !list.some((g) => g.id === this.selected)) this.selected = null;
    if (this.selected === null && list.length) this.selected = list[0].id;

    this.gearList.replaceChildren();
    if (!list.length) element('office-empty', this.gearList).textContent = '강화할 무기가 없습니다. 무기 사기 탭에서 삽니다. 기본 권총은 강화하지 않습니다.';
    for (const gear of list) {
      const row = element('shop-stat', this.gearList);
      const icon = element('shop-tool-icon', row, 'img') as HTMLImageElement;
      icon.src = weaponIcon(gear.kind);
      icon.alt = '';
      const text = element('shop-stat-text', row);
      element('shop-stat-name', text).textContent = `+${gear.level} ${WEAPONS[gear.kind].name}`;
      element('shop-stat-blurb', text).textContent = `판매가 ${goldText(this.sale(gear))}`;
      const pick = element('shop-amount', row, 'button') as HTMLButtonElement;
      pick.type = 'button';
      pick.textContent = gear.id === this.selected ? '선택됨' : '선택';
      // 칩 버튼은 줄 너비를 나눠 갖는 모양이라(.shop-amount) 글자 너비만 쓰게 한다.
      pick.style.flex = 'none';
      pick.classList.toggle('chosen', gear.id === this.selected);
      pick.disabled = this.busy;
      pick.addEventListener('click', () => {
        this.selected = gear.id;
        this.scrolls.clear();
        this.result = '';
        this.render();
      });
    }

    this.bench.replaceChildren();
    const gear = list.find((g) => g.id === this.selected);
    if (!this.table.ready) {
      element('office-empty', this.bench).textContent = '대장간 정보를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.';
      return;
    }
    if (!gear) {
      if (this.result) element('office-note', this.bench).textContent = this.result;
      return;
    }
    this.renderBench(gear);
  }

  private sale(gear: Gear) {
    return this.table.sale(gear.level, this.basePrice(gear.kind), this.luk);
  }

  private renderBench(gear: Gear) {
    const base = this.basePrice(gear.kind);
    const luk = this.luk;
    const top = gear.level >= LEVEL_MAX;

    // 이번 망치질 값: 강화비와 고른 두루마리(forge-items.md 3장). 쓸 수 없는 단계의 두루마리는 고른 것에서 뺀다.
    let cost: Gold = this.table.fee(gear.level, base, luk);
    const prices = new Map<ScrollId, Gold | null>();
    for (const id of SCROLL_IDS) {
      const price = this.table.scroll(id, gear.level, base, luk);
      prices.set(id, price);
      if (price === null) this.scrolls.delete(id);
      else if (this.scrolls.has(id)) cost += price;
    }

    // 망치질·팔기 버튼과 강화비 글 한 줄. 값이 길면 꺾인다(.forge-actions, 2026-11-18 숫자를 줄이지 않고 쓴 뒤).
    const actions = element('shop-stat forge-actions', this.bench);
    const hammer = element('shop-buy', actions, 'button') as HTMLButtonElement;
    hammer.type = 'button';
    const wait = this.nextHammerAt - performance.now();
    hammer.textContent = wait > 0 ? `망치질 ${(wait / 1000).toFixed(1)}초` : `망치질 (${goldText(cost)})`;
    hammer.disabled = this.busy || top || wait > 0 || this.economy.gold < cost;
    hammer.addEventListener('click', () => void this.hammer(gear));
    this.hammerButton = hammer;
    if (wait > 0) this.tickCountdown();

    const sell = element('shop-buy', actions, 'button') as HTMLButtonElement;
    sell.type = 'button';
    const armed = performance.now() < this.sellArmedUntil;
    sell.textContent = armed ? `한 번 더 누르면 팝니다 (+${goldText(this.sale(gear))})` : `팔기 (+${goldText(this.sale(gear))})`;
    sell.disabled = this.busy;
    sell.addEventListener('click', () => void this.sell(gear));
    const note = element('shop-stat-text', actions);
    element('shop-stat-blurb', note).textContent = `강화비 ${goldText(this.table.fee(gear.level, base, luk))}${this.scrolls.size ? ' + 두루마리' : ''} · ${hammerMs(base) / 1000}초에 한 번`;

    if (this.result) element('office-note', this.bench).textContent = this.result;

    const head = element('shop-stat', this.bench);
    const icon = element('shop-tool-icon', head, 'img') as HTMLImageElement;
    icon.src = weaponIcon(gear.kind);
    icon.alt = '';
    const text = element('shop-stat-text', head);
    const name = WEAPONS[gear.kind].name;
    element('shop-stat-name', text).textContent = top ? `+${gear.level} ${name} (끝 단계)` : `+${gear.level} → +${gear.level + 1} ${name}`;
    const odds = this.table.odds(gear.level, this.scrolls);
    element('shop-stat-blurb', text).textContent = odds
      ? `성공 ${percent(odds.success)} · 유지 ${percent(odds.keep)} · 하락 ${percent(odds.fall)} · 파괴 ${percent(odds.destroy)}`
      : '더 올릴 수 없습니다.';

    for (const id of SCROLL_IDS) {
      const price = prices.get(id) ?? null;
      const row = element('shop-stat', this.bench);
      const art = element('shop-tool-icon', row, 'img') as HTMLImageElement;
      art.src = scrollIcon(id);
      art.alt = '';
      const text = element('shop-stat-text', row);
      element('shop-stat-name', text).textContent = price === null ? SCROLL_NAMES[id] : `${SCROLL_NAMES[id]} ${goldText(price)}`;
      element('shop-stat-blurb', text).textContent = price === null ? SCROLL_UNUSABLE[id] : SCROLL_BLURBS[id];
      const button = element('shop-amount', row, 'button') as HTMLButtonElement;
      button.type = 'button';
      button.textContent = this.scrolls.has(id) ? '선택됨' : '선택';
      button.style.flex = 'none';
      button.disabled = price === null || this.busy || top;
      button.classList.toggle('chosen', this.scrolls.has(id));
      button.addEventListener('click', () => {
        if (this.scrolls.has(id)) this.scrolls.delete(id);
        else this.scrolls.add(id);
        this.render();
      });
    }
  }

  private tickCountdown() {
    if (this.countdown) return;
    this.countdown = window.setInterval(() => {
      const wait = this.nextHammerAt - performance.now();
      if (wait > 0) {
        if (this.hammerButton) this.hammerButton.textContent = `망치질 ${(wait / 1000).toFixed(1)}초`;
        return;
      }
      window.clearInterval(this.countdown);
      this.countdown = 0;
      if (this.isOpen) this.render();
    }, COUNTDOWN_MS);
  }

  private async hammer(gear: Gear) {
    const before = gear.level;
    const name = WEAPONS[gear.kind].name;
    this.busy = true;
    // 지난 결과 문구가 연출 중에 이번 결과처럼 보이지 않게 지운다.
    this.result = '';
    this.render();
    // 누르자마자 연출을 띄우고, 서버 결과는 받는 대로 넘겨 마지막 번개에 보인다.
    // 단계·목록과 결과 문구는 연출이 사라진 뒤에 붙인다(뒤 창에 결과가 먼저 비치지 않게). 골드는 바로 맞춘다.
    const shown = this.fx.play(weaponIcon(gear.kind), hammerMs(this.basePrice(gear.kind)));
    let landed: ForgeResult | null = null;
    try {
      const outcome = await this.actions.hammer(gear, new Set(this.scrolls));
      if (typeof outcome === 'string') {
        this.fx.stop();
        this.result = FAIL_TEXT[outcome];
        if (outcome === 'fast') this.nextHammerAt = performance.now() + hammerMs(this.basePrice(gear.kind));
        return;
      }
      landed = outcome;
      this.nextHammerAt = performance.now() + hammerMs(this.basePrice(gear.kind));
      this.fx.setResult({ kind: outcome.result, level: outcome.level ?? before, saved: outcome.saved !== null });
      const paid = `(-${goldText(outcome.paid)})`;
      let text: string;
      if (outcome.result === 'success') text = `성공했습니다. +${outcome.level} ${josa(name, '이', '가')} 됐습니다. ${paid}`;
      else if (outcome.result === 'drop') text = `하락했습니다. +${josaRo(String(outcome.level))} 내려갔습니다. ${paid}`;
      else if (outcome.result === 'destroy') text = `+${before} ${josa(name, '이', '가')} 부서졌습니다. ${paid}`;
      else if (outcome.saved === 'guard') text = `파괴 방지 두루마리가 막아 +${before} 그대로입니다. ${paid}`;
      else if (outcome.saved === 'hold') text = `하락 방지 두루마리가 막아 +${before} 그대로입니다. ${paid}`;
      else text = `유지됐습니다. +${before} 그대로입니다. ${paid}`;
      await shown;
      this.result = text;
    } finally {
      this.busy = false;
      if (landed) this.actions.land(gear, landed);
      this.render();
    }
  }

  private async sell(gear: Gear) {
    if (performance.now() >= this.sellArmedUntil) {
      this.sellArmedUntil = performance.now() + SELL_CONFIRM_MS;
      this.render();
      window.setTimeout(() => this.isOpen && this.render(), SELL_CONFIRM_MS);
      return;
    }
    this.sellArmedUntil = 0;
    const price = this.sale(gear);
    const label = `+${gear.level} ${WEAPONS[gear.kind].name}`;
    this.busy = true;
    this.render();
    try {
      const fail = await this.actions.sell(gear);
      this.result = fail ? FAIL_TEXT[fail] : `${josa(label, '을', '를')} 팔았습니다. (+${goldText(price)})`;
    } finally {
      this.busy = false;
      this.render();
    }
  }
}
