import { adventureArt, HERO_ART, itemIcon, loadAdventureArt, weaponIcon } from '../art/adventureArt';
import { bigText, type Adventure } from '../game/adventure';
import { bpDots } from '../game/adventureBattle';
import { ADV_STATS, baseLevel, BP_RUN, equipPct, MAX_SLOTS, slotCap, slotPrice, SPLIT, TOWN_EXP_PER_WIN, TOWN_X, type AdvStat } from '../game/adventureRules';
import { goldText } from '../game/gold';
import { adventureAssign, adventureBuy, adventureBuySlot, adventureEquip, adventureSell, adventureSetAuto, adventureEquipWeapon, type AdvEquipFx, type AdvItem, type AdvWeapon, type AdvResult, type AdvView, adventureRanking, type AdvRanking } from '../net/adventure';
import { bigOf, COUNT, countUp, type Counter } from './countUp';
import { element } from './dom';
import { Modal } from './modal';

/**
 * 모험 창(2026-11-17, 기획 docs/balance/dungeon-rework.md 3장, 디자인 세션 시안 adventure-ui.md 4장).
 * 상태 칸(BP, 판, 금화, 베이스 레벨, 마을 골드)과 탭 다섯(들어가기, 스텟, 상점, 장신구, 컬렉션).
 * 창은 서버 값이 바뀌거나(Adventure.version) 탭을 바꾸거나 그림을 다 읽었을 때만 다시 쓴다.
 * 상점과 장신구는 시작마을에서, 판 중이 아닐 때만 된다(서버도 막음). 스텟 탭은 모험 맵에서도 열고, 필드의 스텟 판(P)도 같은 줄을 쓴다.
 * '들어가기' 탭은 큰 버튼 하나다(2026-11-18 모험 손보기): 판이 없으면 새 판으로 입구 맵에, 판 중이면 남긴 맵 입구에 선다.
 */

export const STAT_NAME: Record<AdvStat, string> = { hp: 'HP', atk: 'ATK', def: 'DEF', agi: 'AGI', luc: 'LUC' };
const STAT_DESC: Record<AdvStat, string> = {
  hp: '최대 체력 · 1포인트 +5',
  atk: '주는 피해 · 1포인트 +1',
  def: '받는 피해 줄임 · 1포인트 +3',
  agi: '콤보·크리티컬 확률 · 1포인트 +1',
  luc: '금화·무기·크리티컬 · 1포인트 +1',
};

type Tab = 'enter' | 'stats' | 'shop' | 'gear' | 'collection';
const TABS: [Tab, string][] = [
  ['enter', '들어가기'],
  ['stats', '스텟'],
  ['shop', '상점'],
  ['gear', '장신구'],
  ['collection', '컬렉션'],
];

/** 서버 오류 글을 보이는 말로 */
const FAIL: Record<string, string> = {
  'not enough gold': '마을 골드가 모자랍니다.',
  'item locked': '아직 상점에 나오지 않은 물건입니다.',
  'slot locked': '보스를 더 잡아야 칸이 열립니다.',
  'one of a kind': '같은 종류의 장신구는 하나만 낄 수 있습니다.',
  'not at the gate': '시작마을의 모험하기 포탈에서만 할 수 있습니다.',
  'in run': '모험 중에는 할 수 없습니다.',
  'no run': '모험 중이 아닙니다.',
  'no monster': '여기에는 몬스터가 없습니다.',
  'bad map': '갈 수 없는 맵입니다.',
  'not enough points': '남은 포인트가 모자랍니다.',
  'bad points': '포인트는 0 이상의 정수로 적어 주세요.',
  'bad slot': '없는 칸입니다.',
  'not owned': '가지고 있지 않은 장신구입니다.',
  'weapon not owned': '가지고 있지 않은 무기입니다.',
  'no bp': 'BP가 없습니다.',
  'too fast': '잠시 뒤에 다시 해 주세요.',
  'zone locked': '아직 열리지 않은 지역입니다.',
  'not in the field': '이 맵에서는 싸울 수 없습니다.',
};
export const failText = (reason: string) => FAIL[reason] ?? '잠시 후 다시 해 주세요.';

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

export function itemEffect(item: AdvItem) {
  switch (item.kind) {
    case 'gem':
      return `${STAT_NAME[item.stat ?? 'hp']} +${pct(item.value)}`;
    case 'learn':
      return `경험치 +${pct(item.value)}`;
    case 'pouch':
      return `금화 +${pct(item.value)}`;
    case 'combo':
      return `콤보 확률 +${pct(item.value)}p, 상한 ${pct(item.value2 ?? 0.5)}`;
    case 'sharp':
      return `크리티컬 피해 ×${item.value}`;
    case 'leech':
      return `때린 피해의 ${pct(item.value)} 회복`;
    case 'endure':
      return '0이 될 때 한 번 1로 버팀';
  }
}

/** 순위 레벨 글(디자인 시안 "Lv 41.7만"): 1만 아래는 "5,200", 1억 아래는 만 단위 소수 한 자리(내림), 그 위는 bigText */
function rankLevel(level: string) {
  const n = Number(level);
  if (!Number.isFinite(n) || n >= 1e8) return bigText(level, true);
  if (n < 10000) return Math.floor(n).toLocaleString('ko-KR');
  return `${(Math.floor(n / 1000) / 10).toFixed(1).replace(/\.0$/, '')}만`;
}

/** 작은 줄 하나를 [글, 클래스] 조각으로 만든다(서버 글은 textContent로만 넣는다). */
function line(cls: string, parent: HTMLElement, parts: (string | [string, string])[], tag = 'div') {
  const el = element(cls, parent, tag);
  for (const part of parts) {
    if (typeof part === 'string') el.append(part);
    else element(part[1], el, part[1] === 'b' ? 'b' : 'span').textContent = part[0];
  }
  return el;
}

function button(cls: string, parent: HTMLElement, text: string, onClick: () => void, disabled = false) {
  const b = element(cls, parent, 'button') as HTMLButtonElement;
  b.type = 'button';
  b.textContent = text;
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

/** 서버 함수를 부르고 값을 바꾼다. 실패하면 say로 이유를 보인다. */
export async function adventureCall(adventure: Adventure, call: () => Promise<AdvView | string>, say: (text: string) => void, done = '') {
  const view = await call();
  if (typeof view === 'string') {
    say(failText(view));
    return false;
  }
  adventure.set(view);
  say(done);
  return true;
}

/** 남은 포인트(서버가 글자로 보냄)를 BigInt로. 못 읽으면 0 */
function pointsOf(text: string) {
  try {
    return BigInt(text.split('.')[0]);
  } catch {
    return 0n;
  }
}

/** adventure_assign에 보낼 값: 안전한 정수면 숫자, 더 크면 글자(서버 numeric) */
const assignArg = (v: bigint) => (v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v.toString());

/**
 * 스텟 줄(창의 스텟 탭과 필드의 스텟 판, 디자인 세션 시안 adventure-ui.md 13절).
 * 위에 [추천대로 (3 : 3 : 1)] [고르게], 스텟마다 [+1] [+10] [+100] [절반] [전부]. 누르면 바로 나눈다(adventure_assign).
 * 추천대로는 HP 3 : ATK 3 : DEF 1(마을 AGI가 0이면 AGI 1도), 고르게는 다섯 스텟에 똑같이 나누고 나머지는 남긴다.
 * 절반은 남은 포인트의 반(내림, 적어도 1), 전부는 남은 포인트 모두다. 남은 포인트보다 큰 버튼은 꺼 둔다.
 * 계산은 화면이 하고 남은 포인트는 큰 수일 수 있어 BigInt로 센다.
 * [추천대로] 버튼을 돌려준다(레벨 업 창의 "추천대로 나누고 닫기"가 누름).
 */
export function statRows(parent: HTMLElement, adventure: Adventure, view: AdvView, compact: boolean, say: (text: string) => void): HTMLButtonElement {
  const points = pointsOf(view.points);
  const top = element('adv-points', parent);
  line('adv-points-left', top, ['남은 포인트 ', [bigText(view.points), 'b']]);
  if (!compact) element('adv-status-dim', top).textContent = `모험 Lv ${bigText(view.level)}`;
  const buttons: HTMLButtonElement[] = [];
  // 누른 뒤 서버 값이 올 때까지 모두 끈다(두 번 눌러 모자란 포인트를 보내지 않게). 실패하면 다시 켠다.
  const send = (values: Partial<Record<AdvStat, bigint>>, done: string) => {
    const on = buttons.filter((b) => !b.disabled);
    for (const b of on) b.disabled = true;
    const args = Object.fromEntries(ADV_STATS.map((k) => [k, assignArg(values[k] ?? 0n)])) as Record<AdvStat, number | string>;
    void adventureCall(adventure, () => adventureAssign(args), say, done).then((ok) => {
      if (!ok) for (const b of on) b.disabled = false;
    });
  };
  const quick = element('adv-quick', parent);
  const parts = BigInt(ADV_STATS.reduce((a, k) => a + SPLIT[k], 0));
  const unit = points / parts;
  const recommend = button('adv-btn', quick, '추천대로 (3 : 3 : 1 : 1)', () => {
    send(Object.fromEntries(ADV_STATS.map((k) => [k, unit * BigInt(SPLIT[k])])), '추천대로 나눴습니다.');
  }, unit === 0n);
  buttons.push(recommend);
  const even = points / 5n;
  const evenly = button('adv-btn', quick, '고르게', () => send(Object.fromEntries(ADV_STATS.map((k) => [k, even])), '고르게 나눴습니다.'), even === 0n);
  buttons.push(evenly);
  const half = points >= 2n ? points / 2n : points;
  const list = element('adv-stats', parent);
  const p = view.power;
  for (const k of ADV_STATS) {
    const row = element('adv-stat', list);
    element('adv-stat-key', row).textContent = STAT_NAME[k];
    const mid = element('', row);
    element('adv-stat-value', mid).textContent = bigText(p[k]);
    element('adv-stat-desc', mid).textContent = compact ? STAT_DESC[k] : `${STAT_DESC[k]} · 나눈 포인트 ${bigText(view.spent[k])} · 마을 +${bigText(p.town[k] * TOWN_X)}`;
    const add = element('adv-stat-add', row);
    const steps: [string, bigint][] = [['+1', 1n], ['+10', 10n], ['+100', 100n], ['절반', half], ['전부', points]];
    for (const [label, amount] of steps) {
      buttons.push(button('adv-step wide', add, label, () => send({ [k]: amount }, `${STAT_NAME[k]}에 ${bigText(amount.toString())} 나눴습니다.`), amount <= 0n || amount > points));
    }
  }
  const toggle = element(`adv-toggle${view.auto ? ' on' : ''}`, parent);
  toggle.style.marginTop = '8px';
  element('adv-toggle-box', toggle);
  element('', toggle, 'span').textContent = '레벨이 오르면 추천대로 저절로 나누기';
  toggle.addEventListener('click', () => void adventureCall(adventure, () => adventureSetAuto(!view.auto), say));
  return recommend;
}

/**
 * 귀환 확인 창(디자인 세션 시안 adventure-ui.md 13절). [귀환]을 누르면 onYes.
 */
export function confirmReturn(root: HTMLElement, onYes: () => void) {
  const modal = new Modal(root, 'adv-confirm', '귀환할까요?');
  element('adv-confirm-text', modal.box).textContent = '귀환하면 이번 모험이 끝납니다. 얻은 경험치와 금화의 절반을 마을로 가져갑니다.';
  modal.button('계속하기', () => undefined);
  modal.button('귀환', () => onYes(), true);
  return modal;
}

export interface AdventureWindowActions {
  /** 판을 열고(판 중이면 이어 하기) 그 판이 있는 모험 맵 입구로 간다. */
  enter(): void;
  /** 지금 맵 id(상점이 되는지, 필드인지 보려고) */
  mapId(): string;
}

export class AdventureWindow {
  private readonly root: HTMLElement;
  private readonly status: HTMLElement;
  private readonly tabs = new Map<Tab, HTMLButtonElement>();
  private readonly message: HTMLElement;
  private readonly body: HTMLElement;
  private tab: Tab = 'enter';
  /** 들어가기 탭의 최고 레벨 순위(탭을 열 때 한 번 읽음, 실시간 구독 없음) */
  private ranking: AdvRanking | null = null;
  private rankingVersion = 0;
  /** 컬렉션 탭에서 누른 무기 */
  private chosenWeapon: string | null = null;
  private shownKey = '';
  /** 다시 쓴 횟수(성능 확인용) */
  renders = 0;

  constructor(
    parent: HTMLElement,
    private readonly adventure: Adventure,
    private readonly actions: AdventureWindowActions,
  ) {
    this.root = element('office adv-window', parent);
    this.root.hidden = true;
    element('office-title', this.root).textContent = '모험';
    this.status = element('adv-status', this.root);
    const bar = element('adv-tabs', this.root);
    for (const [id, label] of TABS) this.tabs.set(id, button('adv-tab', bar, label, () => this.show(id)));
    this.message = element('adv-message', this.root);
    this.body = element('', this.root);
    button('office-close', this.root, '나가기 (Esc)', () => this.close());
    // 모험 맵 꾸밈 그림 출처(디자인 세션 adventure-maps.md 2절)
    element('adv-credit', this.root).textContent = '모험 맵 그림 일부: Infernus by PVGames (Pioneer Valley Games)';
    adventure.onChange(() => {
      if (!this.root.hidden) this.render();
    });
  }

  get isOpen() {
    return !this.root.hidden;
  }

  private get inField() {
    return this.actions.mapId().startsWith('adv_');
  }

  /** 창을 연다. 서버에서 다시 읽고, 끝난 판의 결과가 있으면 결과 화면을 먼저 띄운다. */
  async open(tab: Tab = this.inField ? 'stats' : 'enter') {
    this.tab = tab;
    if (tab === 'enter') void this.loadRanking();
    this.message.textContent = '';
    this.root.hidden = false;
    this.shownKey = '';
    this.render();
    if (!adventureArt) void loadAdventureArt().then(() => this.rerender());
    const result = await this.adventure.refresh();
    if (typeof result === 'string') this.say(failText(result));
    else if (result) showAdventureResult(this.root.parentElement!, result, this.adventure);
  }

  close() {
    this.root.hidden = true;
  }

  private show(tab: Tab) {
    if (tab === 'enter' && this.tab !== 'enter') void this.loadRanking();
    this.tab = tab;
    this.message.textContent = '';
    this.rerender();
  }

  /** 최고 레벨 순위를 한 번 읽는다(들어가기 탭을 열 때). */
  private async loadRanking() {
    const r = await adventureRanking();
    if (typeof r === 'string') return;
    this.ranking = r;
    this.rankingVersion++;
    this.rerender();
  }

  private rerender() {
    this.shownKey = '';
    if (!this.root.hidden) this.render();
  }

  /** 다시 그릴지 가르는 값(서버 값, 순위, 탭, 고른 무기, 그림, 맵, 무기 목록) */
  private renderKey() {
    return `${this.adventure.version}|${this.rankingVersion}|${this.tab}|${this.chosenWeapon}|${adventureArt ? 1 : 0}|${this.actions.mapId()}|${this.adventure.weapons.length}`;
  }

  private say = (text: string) => {
    this.message.textContent = text;
  };

  private render() {
    const view = this.adventure.view;
    for (const [id, b] of this.tabs) {
      b.classList.toggle('chosen', id === this.tab);
      b.querySelector('.adv-badge')?.remove();
    }
    if (!view) {
      this.status.textContent = '불러오는 중입니다.';
      this.body.replaceChildren();
      return;
    }
    const key = this.renderKey();
    if (key === this.shownKey) return;
    this.shownKey = key;
    this.renders++;
    if (view.points !== '0') element('adv-badge', this.tabs.get('stats')!, 'span').textContent = bigText(view.points);
    this.renderStatus(view);
    this.body.replaceChildren();
    if (this.tab === 'enter') this.renderEnter(view);
    else if (this.tab === 'stats') this.renderStats(view);
    else if (this.tab === 'shop') this.renderShop(view);
    else if (this.tab === 'gear') this.renderGear(view);
    else this.renderCollection(view);
  }

  private renderStatus(view: AdvView) {
    const s = this.status;
    s.replaceChildren();
    bpDots(s, view.inRun ? view.bp : BP_RUN);
    if (view.inRun) line('', s, ['모험 ', [`Lv ${bigText(view.level)}`, 'b'], ' · 남은 포인트 ', [bigText(view.points), 'adv-gold']]);
    line('adv-status-right', s, ['금화 ', [bigText(view.runGold), 'adv-coin']]);
    const town = Number(view.townLevel);
    const base = baseLevel(town);
    element('adv-status-dim', s).textContent =
      `베이스 레벨 ${base} (모험 스텟 ×${view.power.mul}) · 마을 레벨 ${((base + 1) * 1000 - town).toLocaleString()} 더 오르면 ${base + 1}`;
    line('adv-status-right', s, [[goldText(BigInt(view.townGold)), 'adv-gold']]);
  }

  private renderEnter(view: AdvView) {
    const label = this.inField ? '모험 중입니다' : view.inRun ? `이어 하기 (BP ${view.bp})` : '들어가기';
    button('adv-go', this.body, label, () => this.actions.enter(), this.inField);
    this.renderRanking();
  }

  /**
   * 최고 레벨 순위(디자인 adventure-ui.md 14절, 시안 rank-board.png): 위 10명(순위, 닉네임, "Lv 41.7만"), 1·2·3위 순위 숫자 색.
   * 내가 10위 안이면 그 줄을 칠하고, 밖이면 "⋯" 뒤에 내 줄, 기록이 없으면 "- 이름 -"을 흐리게. 설명 글은 넣지 않는다.
   */
  private renderRanking() {
    const r = this.ranking;
    if (!r) return;
    element('adv-section', this.body).textContent = '최고 레벨';
    const list = element('adv-rank', this.body);
    const row = (rank: string, name: string, level: string, cls = '') => {
      const el = element(`adv-rank-row${cls}`, list);
      const top = rank === '1' || rank === '2' || rank === '3' ? ` top${rank}` : '';
      element(`adv-rank-n${top}`, el, 'span').textContent = rank;
      element('adv-rank-name', el, 'span').textContent = name;
      element('adv-rank-lv', el, 'span').textContent = level;
    };
    for (const t of r.top) row(String(t.rank), t.name, `Lv ${rankLevel(t.level)}`, t.me ? ' me' : '');
    if (r.top.some((t) => t.me)) return;
    element('adv-rank-gap', list).textContent = '⋯';
    if (r.me) row(String(r.me.rank), r.me.name, `Lv ${rankLevel(r.me.level)}`, ' me');
    else row('-', r.name ?? '', '-', ' me none');
  }

  private renderStats(view: AdvView) {
    statRows(this.body, this.adventure, view, false, this.say);
    const b = view.power.bonus;
    element('adv-bonus', this.body).textContent =
      `전투 스텟 = (처음 값 + (나눈 포인트 + 마을 스텟 × ${TOWN_X}) × 1포인트 효과) × (1 + 컬렉션·보석 HP +${pct(b.hp)} · ATK +${pct(b.atk)} · DEF +${pct(b.def)} · AGI +${pct(b.agi)} · LUC +${pct(b.luc)}) × 베이스 ×${view.power.mul}`;
  }

  /** 상점과 장신구 끼기·팔기가 되는지: 시작마을이고 판 중이 아닐 때(서버도 막음, 기획 3장). 안 되면 버튼만 누를 수 없다(까닭은 쓰지 않음). */
  private gateNote(view: AdvView) {
    return this.actions.mapId() === 'plains' && !view.inRun;
  }

  private renderShop(view: AdvView) {
    const atGate = this.gateNote(view);
    const bosses = view.bosses.length;
    const cap = slotCap(bosses);
    const price = slotPrice(view.slots);
    const slots = element('adv-slots-line', this.body);
    if (price === null) line('', slots, ['장신구 칸 ', [String(view.slots), 'b'], ` / ${MAX_SLOTS} · 모두 열렸습니다`]);
    else line('', slots, ['장신구 칸 ', [String(view.slots), 'b'], ` / ${MAX_SLOTS} · 다음 칸(${view.slots + 1}번째) `, [goldText(price), 'adv-gold']]);
    const lockedSlot = view.slots >= cap;
    button('adv-btn', slots, '칸 늘리기', () => void adventureCall(this.adventure, adventureBuySlot, this.say, '칸을 늘렸습니다.'), price === null || lockedSlot || !atGate);

    const ownCount = (id: string) => view.owned.filter((o) => o.item === id).length;
    element('adv-section', this.body).textContent = '보석 · 그 스텟 +% (여러 개 껴도 됨)';
    const gems = view.shop.filter((i) => i.kind === 'gem');
    const tiers = [...new Set(gems.map((g) => g.tier))].sort((a, b) => a - b);
    for (const tier of tiers) {
      const row = gems.filter((g) => g.tier === tier);
      const first = row[0];
      const locked = first.opens > bosses;
      line('adv-zone-line', this.body, [`${tier}단계 · 그 스텟 `, [`+${pct(first.value)}`, 'b'], ' · ', [goldText(BigInt(first.price)), 'adv-gold']]);
      const cards = element('adv-gems', this.body);
      for (const gem of row) {
        const owned = ownCount(gem.id);
        const card = element(`adv-gem${locked ? ' locked' : owned ? ' owned' : ''}`, cards);
        card.title = gem.name;
        card.appendChild(itemIcon(gem.kind, gem.stat));
        element('adv-gem-stat', card).textContent = itemEffect(gem);
        element('adv-gem-own', card).textContent = owned ? `가짐 ${owned}` : gem.name.replace('의 보석', '');
        if (!locked) button('', card, '사기', () => void this.buy(gem), !atGate);
      }
    }
    element('adv-section', this.body).textContent = '그 밖의 장신구 · 한 종류에 하나만 낌';
    const items = element('adv-items', this.body);
    for (const item of view.shop.filter((i) => i.kind !== 'gem')) {
      const locked = item.opens > bosses;
      itemCard(items, item, `${item.name} ${item.tier}단계`, locked ? 'locked' : ownCount(item.id) ? 'owned' : '', (foot) => {
        if (!locked) {
          line('', foot, [[goldText(BigInt(item.price)), 'adv-gold']], 'span');
          button('adv-btn gold', foot, '사기', () => void this.buy(item), !atGate);
        }
      });
    }
  }

  private buy(item: AdvItem) {
    return adventureCall(this.adventure, () => adventureBuy(item.id), this.say, `${item.name} ${item.tier}단계를 샀습니다.`);
  }

  private renderGear(view: AdvView) {
    const atGate = this.gateNote(view);
    const itemOf = (id: string) => view.shop.find((i) => i.id === id);
    element('adv-section', this.body).textContent = `낀 장신구 (칸 ${view.slots} / ${MAX_SLOTS})`;
    const gear = element('adv-gear', this.body);
    for (let s = 1; s <= MAX_SLOTS; s++) {
      if (s > view.slots) {
        element('adv-gear-slot locked', gear);
        continue;
      }
      const worn = view.owned.find((o) => o.slot === s);
      const item = worn && itemOf(worn.item);
      const slot = element(`adv-gear-slot${item ? '' : ' empty'}`, gear);
      if (item) {
        slot.title = `${item.name} ${item.tier}단계 · ${itemEffect(item)}`;
        slot.appendChild(itemIcon(item.kind, item.stat));
      }
    }
    element('adv-section', this.body).textContent = '가진 장신구';
    const items = element('adv-items', this.body);
    for (const o of view.owned) {
      const item = itemOf(o.item);
      if (!item) continue;
      itemCard(items, item, `${item.name} ${item.tier}단계`, o.slot ? 'owned' : '', (foot) => {
        if (o.slot) {
          element('', foot, 'span').textContent = `${o.slot}번 칸에 낌`;
          button('adv-btn', foot, '빼기', () => void adventureCall(this.adventure, () => adventureEquip(o.slot!, null), this.say), !atGate);
        } else {
          button('adv-btn gold', foot, '끼기', () => {
            const used = new Set(view.owned.map((x) => x.slot));
            let free = 0;
            for (let s = 1; s <= view.slots && !free; s++) if (!used.has(s)) free = s;
            if (!free) this.say('빈 칸이 없습니다. 먼저 하나를 빼 주세요.');
            else void adventureCall(this.adventure, () => adventureEquip(free, o.id), this.say);
          }, !atGate);
        }
        button('adv-btn', foot, `팔기 ${goldText(BigInt(o.paid) / 2n)}`, () => void adventureCall(this.adventure, () => adventureSell(o.id), this.say, '팔았습니다.'), !atGate);
      });
    }
  }

  /**
   * 컬렉션 탭(디자인 adventure-ui.md 17절 2번): 지역마다 "평원 무기 22 / 27"과 격자(가진 것 밝게, 없는 것 그림자, 낀 무기 금빛 테와 E).
   * 가진 무기를 누르면 고르고, 아래 고정 칸에 그 무기 카드와 [장착]을 보인다. 고른 것이 없으면 낀 무기 카드와 [빼기].
   * 마우스를 올려도 카드를 띄우지 않는다(2026-11-18 사용자 "게임내에서의 무기들은 어차피 클릭하면 효과가 보이니깐, 마우스 호버시 무기 설명 뜨는건 안떠도 된다.").
   */
  private renderCollection(view: AdvView) {
    const adv = this.adventure;
    if (!adv.weapons.length) {
      element('adv-note', this.body).textContent = '무기 목록을 불러오는 중입니다.';
      return;
    }
    const wrap = element('adv-coll-wrap', this.body);
    const foot = element('adv-coll-foot', this.body);
    // 누른 칸의 테와 아래 고정 칸만 바꾼다(창 전체를 다시 그리지 않음, 216칸이라 약 80ms 들던 것)
    let chosenCell: HTMLElement | null = null;
    const showFoot = () => {
      foot.replaceChildren();
      const show = adv.weapon(this.chosenWeapon ?? view.mainWeapon);
      foot.hidden = !show || !adv.copies(show.id);
      if (!show || foot.hidden) return;
      const on = show.id === view.mainWeapon;
      weaponCard(foot, adv, show, on ? 'equipped' : 'pick', () => {
        void adventureCall(adv, () => adventureEquipWeapon(on ? null : show.id), this.say).then((ok) => {
          if (!ok) return;
          this.chosenWeapon = null;
          this.rerender();
        });
      });
    };
    for (const zone of view.zones) {
      const list = adv.weapons
        .filter((w) => w.zone === zone.id)
        .sort((a, b) => Number(a.boss) - Number(b.boss) || a.star - b.star || Number(a.art) - Number(b.art));
      const have = list.filter((w) => adv.copies(w.id) > 0).length;
      element('adv-section', wrap).textContent = `${zone.open ? zone.name : '???'} 무기 ${have} / ${list.length}`;
      const grid = element('adv-collection', wrap);
      for (const w of list) {
        const copies = adv.copies(w.id);
        const slot = weaponSlot(grid, w, { unknown: copies === 0, plus: copies > 1 ? copies - 1 : 0, chosen: w.id === this.chosenWeapon, equipped: w.id === view.mainWeapon });
        if (w.id === this.chosenWeapon) chosenCell = slot;
        if (!copies) continue;
        slot.style.cursor = 'pointer';
        slot.addEventListener('click', () => {
          chosenCell?.classList.remove('chosen');
          slot.classList.add('chosen');
          chosenCell = slot;
          this.chosenWeapon = w.id;
          this.shownKey = this.renderKey();
          showFoot();
        });
      }
    }
    // 아래 고정 칸은 격자 뒤에 둔다(sticky라 창 아래에 붙어 보임)
    this.body.append(foot);
    showFoot();
  }
}

/** 장착 무기 칸·목록의 화면 상태. 판을 다시 그려도 남긴다(AdventureField가 가짐). */
export interface EquipUi {
  /** [바꾸기]로 가진 무기 목록을 열었는지 */
  open: boolean;
  /** 스텟 거르기(null이면 전체) */
  filter: AdvStat | null;
  /** 목록에서 누른 무기 */
  sel: string | null;
  /** 목록 격자 스크롤(다시 그려도 그 자리) */
  scroll: number;
}

/** 소수 한 자리까지(26.25 → 26.3, 40 → 40) */
const oneDecimal = (n: number) => String(Math.round(n * 10) / 10);
const FX_TEXT: Record<AdvEquipFx, (v: number) => string> = {
  crit: (v) => `크리티컬 피해 +${Math.round(v * 100) / 100}`,
  combo: (v) => `콤보 +${oneDecimal(v * 100)}%p`,
  leech: (v) => `흡혈 ${oneDecimal(v * 100)}%`,
  guard: (v) => `받는 피해 −${oneDecimal(v * 100)}%`,
  drop: (v) => `드랍 +${oneDecimal(v * 100)}%`,
};

/**
 * 장착 효과 글(숫자만, 기획 19장 '컬렉션 무기 장착'): ["ATK +15%"] 또는 ★4 이상이면 ["ATK +40%", "크리티컬 피해 +0.25"].
 * 스텟 몫은 무기 행의 equipPct × (1 + 0.25 × 단계)(서버 adventure_power와 같음).
 */
export function equipEffects(w: AdvWeapon, copies: number) {
  const out = [`${STAT_NAME[w.stat]} +${oneDecimal(equipPct(w.equipPct, copies) * 100)}%`];
  if (w.equipFx && w.equipFxValue) out.push(FX_TEXT[w.equipFx](w.equipFxValue));
  return out;
}

/** 무기 그림 캔버스(adv-weapons.png 한 칸)를 size px로 */
function weaponCanvas(art: string, size: number) {
  const c = weaponIcon(art);
  c.style.width = `${size}px`;
  c.style.height = `${size}px`;
  return c;
}

/**
 * 무기 카드(디자인 17절, 대장간 상점 무기 카드와 같은 바탕·테두리): 그림 48px, 이름, 별 + 단계 + 보스/중간 보스, 효과 숫자.
 * state: equipped(장착 표 + [빼기]), pick([장착]). act는 버튼을 누를 때.
 */
function weaponCard(parent: HTMLElement, adv: Adventure, w: AdvWeapon, state: 'equipped' | 'pick', act?: () => void) {
  const card = element(`adv-wcard${state === 'equipped' ? ' on' : ''}`, parent);
  const copies = adv.copies(w.id);
  element('adv-wcard-icon', card).appendChild(weaponCanvas(w.art, 48));
  const body = element('adv-wcard-body', card);
  const head = element('adv-wcard-head', body);
  element('adv-wcard-name', head, 'b').textContent = w.name;
  if (state === 'equipped') element('adv-wcard-tag', head, 'span').textContent = '장착';
  const meta = element('adv-wcard-meta', body);
  element('adv-wcard-star', meta, 'span').textContent = '★'.repeat(w.star);
  if (copies > 1) element('adv-wcard-plus', meta, 'span').textContent = ` +${copies - 1}`;
  if (w.boss) element('adv-wcard-kind', meta, 'span').textContent = ' 보스';
  else if (w.mini) element('adv-wcard-kind', meta, 'span').textContent = ' 중간 보스';
  const fx = element('adv-wcard-fx', body);
  for (const t of equipEffects(w, copies)) element('', fx, 'span').textContent = t;
  const btns = element('adv-wcard-btns', card);
  button(state === 'equipped' ? 'adv-btn' : 'adv-btn gold', btns, state === 'equipped' ? '빼기' : '장착', () => act?.());
  return card;
}

/**
 * 스텟 판(P, 레벨 업 창도 같은 판) 맨 위 장착 칸(디자인 17절 1번): 무기 그림(금빛 테 46px), 이름·별·단계, 효과 숫자, [바꾸기].
 * 낀 것이 없으면 "장검"과 "-". [바꾸기]를 누르면 판 안에 가진 무기 목록(거르기 칩, 36px 격자 별·단계 높은 것부터, 고른 무기 카드)이 열린다.
 * 목록은 열 때만 그린다. [장착]을 누르면 장착 칸이 바뀌고 목록이 닫힌다. rerender는 판을 다시 그린다.
 */
export function equipBlock(parent: HTMLElement, adv: Adventure, view: AdvView, ui: EquipUi, say: (text: string) => void, rerender: () => void) {
  if (!adventureArt) void loadAdventureArt().then(rerender);
  const box = element('adv-equip', parent);
  const eq = view.mainWeapon && adv.copies(view.mainWeapon) ? adv.weapon(view.mainWeapon) : undefined;
  const slot = element('adv-equip-slot', box);
  const icon = element('adv-equip-icon', slot);
  const info = element('adv-equip-info', slot);
  const head = element('adv-equip-head', info);
  if (eq) {
    icon.appendChild(weaponCanvas(eq.art, 40));
    element('', head, 'b').textContent = eq.name;
    element('adv-wcard-star', head, 'span').textContent = ` ${'★'.repeat(eq.star)}`;
    const copies = adv.copies(eq.id);
    if (copies > 1) element('adv-wcard-plus', head, 'span').textContent = ` +${copies - 1}`;
    const fx = element('adv-equip-fx', info);
    for (const t of equipEffects(eq, copies)) element('', fx, 'span').textContent = t;
  } else {
    element('', head, 'b').textContent = '장검';
    element('adv-equip-fx dim', info).textContent = '-';
  }
  button(ui.open ? 'adv-btn gold' : 'adv-btn', slot, ui.open ? '닫기' : '바꾸기', () => {
    ui.open = !ui.open;
    ui.sel = null;
    ui.scroll = 0;
    rerender();
  });
  if (!ui.open) return box;
  const pick = element('adv-equip-pick', box);
  const filters = element('adv-equip-filter', pick);
  for (const k of [null, ...ADV_STATS] as (AdvStat | null)[]) {
    const chip = button(`adv-chip${ui.filter === k ? ' on' : ''}`, filters, k ? STAT_NAME[k] : '전체', () => {
      ui.filter = k;
      ui.scroll = 0;
      rerender();
    });
    chip.type = 'button';
  }
  const grid = element('adv-equip-grid', pick);
  const selHost = element('adv-equip-sel', pick);
  let chosenCell: HTMLElement | null = null;
  // 고른 무기 카드(누르면 이것만 바꾼다. 판 전체를 다시 그리지 않음, 216칸이라 약 30ms 들던 것).
  // reveal이면 판이 스크롤될 때 카드가 판 안에 보이게 판을 민다(레벨 업 창은 아래 버튼 줄만큼 띄움, CSS scroll-padding).
  const showSel = (reveal = false) => {
    selHost.replaceChildren();
    const sel = ui.sel ? adv.weapon(ui.sel) : undefined;
    selHost.hidden = !sel;
    if (!sel) return;
    const on = sel.id === view.mainWeapon;
    weaponCard(selHost, adv, sel, on ? 'equipped' : 'pick', () => {
      void adventureCall(adv, () => adventureEquipWeapon(on ? null : sel.id), say).then((ok) => {
        if (!ok) return;
        ui.open = false;
        ui.sel = null;
        ui.scroll = 0;
        rerender();
      });
    });
    if (reveal) selHost.scrollIntoView({ block: 'nearest' });
  };
  const mine = adv.weapons.filter((w) => adv.copies(w.id) > 0 && (!ui.filter || w.stat === ui.filter));
  mine.sort((a, b) => b.star - a.star || adv.copies(b.id) - adv.copies(a.id) || Number(a.art) - Number(b.art));
  for (const w of mine) {
    const copies = adv.copies(w.id);
    const cell = weaponSlot(grid, w, { plus: copies > 1 ? copies - 1 : 0, chosen: w.id === ui.sel, equipped: w.id === view.mainWeapon });
    if (w.id === ui.sel) chosenCell = cell;
    cell.style.cursor = 'pointer';
    cell.addEventListener('click', () => {
      chosenCell?.classList.remove('chosen');
      cell.classList.add('chosen');
      chosenCell = cell;
      ui.sel = w.id;
      showSel(true);
    });
  }
  pick.append(selHost);
  grid.scrollTop = ui.scroll;
  grid.addEventListener('scroll', () => (ui.scroll = grid.scrollTop), { passive: true });
  showSel();
  return box;
}

/** 무기 칸 하나(36px): 별 수, 단계, 낀 무기면 금빛 테와 E(디자인 17절) */
function weaponSlot(parent: HTMLElement, w: AdvWeapon, opts: { isNew?: boolean; unknown?: boolean; chosen?: boolean; plus?: number; equipped?: boolean }) {
  const box = element(`adv-weapon${opts.isNew ? ' new' : ''}${opts.unknown ? ' unknown' : ''}${opts.chosen ? ' chosen' : ''}${opts.equipped ? ' equipped' : ''}`, parent);
  box.appendChild(weaponIcon(w.art));
  if (!opts.unknown) element('adv-weapon-star', box).textContent = `${w.star}★`;
  if (opts.plus) element('adv-weapon-plus', box).textContent = `+${opts.plus}`;
  if (opts.equipped) element('adv-weapon-on', box).textContent = 'E';
  return box;
}

function itemCard(parent: HTMLElement, item: AdvItem, name: string, cls: string, fillFoot: (foot: HTMLElement) => void) {
  const card = element(`adv-item${cls ? ` ${cls}` : ''}`, parent);
  element('adv-item-icon', card).appendChild(itemIcon(item.kind, item.stat));
  element('adv-item-name', card).textContent = name;
  element('adv-item-effect', card).textContent = itemEffect(item);
  fillFoot(element('adv-item-foot', card));
}

/**
 * 판이 끝났을 때의 결과 화면(기획 3장 5번, 시안 adventure-ui.md 3장·13절). BP가 0이 되어 끝난 판은 "당신은 죽었습니다.",
 * 귀환한 판은 "마을로 돌아왔습니다."다. 가져가는 양은 둘이 같다. onVillage가 있으면 [마을로], 없으면 [확인] 버튼을 단다.
 */
export function showAdventureResult(root: HTMLElement, result: AdvResult, adventure: Adventure, onVillage?: () => void) {
  const modal = new Modal(root, 'adv-end', '');
  modal.box.parentElement?.classList.add('adv-end-veil');
  modal.box.querySelector('.modal-title')?.remove();
  const art = adventureArt;
  const c = element('', modal.box, 'canvas') as HTMLCanvasElement;
  c.width = 160;
  c.height = 60;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#1c1014';
  g.fillRect(0, 0, 160, 60);
  for (let y = 40; y < 60; y++)
    for (let x = 0; x < 160; x++) {
      const d = Math.hypot((x - 80) / 70, (y - 46) / 14);
      if (d >= 1) continue;
      g.fillStyle = (x + y) & 1 && d > 0.7 ? '#2a1a1e' : '#3a2428';
      g.fillRect(x, y, 1, 1);
    }
  const m = HERO_ART;
  // 죽었으면 쓰러진 모습, 귀환했으면 선 모습
  const pose = result.reason === 'bp' ? 4 : 0;
  if (art) g.drawImage(art.heroes, pose * m.cell.w, 3 * m.cell.h, m.cell.w, m.cell.h, 80 - m.foot.x, 50 - m.foot.y, m.cell.w, m.cell.h);
  element('adv-end-title', modal.box).textContent = result.reason === 'bp' ? '당신은 죽었습니다.' : '마을로 돌아왔습니다.';
  const rows = element('adv-end-rows', modal.box);
  const row = (k: string, fill: (v: HTMLElement) => void) => {
    element('adv-end-key', rows).textContent = k;
    fill(element('adv-end-val', rows));
  };
  row('이번 모험', (v) => (v.textContent = `최고 Lv ${bigText(result.level)} · 이긴 전투 ${result.wins}번 · 진 전투 ${result.losses}번`));
  const counters: Counter[] = [];
  row('경험치', (v) => {
    const to = bigOf(result.townExp);
    const fmt = (n: bigint) => `마을 경험치 +${bigText(n.toString())}`;
    counters.push({ el: element('adv-end-take', v, 'span'), from: 0n, to, fmt });
    element('adv-end-from', v, 'span').textContent = `이긴 전투 ${result.wins}번 × ${TOWN_EXP_PER_WIN.toLocaleString()} · 모험 경험치 ${bigText(result.exp, true)}`;
  });
  row('골드', (v) => {
    const to = bigOf(result.townGold);
    const fmt = (n: bigint) => `마을 골드 +${goldText(n)}`;
    counters.push({ el: element('adv-end-take adv-gold', v, 'span'), from: 0n, to, fmt });
    line('adv-end-from', v, ['금화 ', [bigText(result.gold), 'adv-coin'], '의 50%'], 'span');
  });
  // 얻은 무기가 없으면 무기 줄을 두지 않는다("없음"을 쓰지 않음).
  const drops = result.drops.map((id) => adventure.weapon(id)).filter((w): w is AdvWeapon => !!w);
  if (drops.length) row('무기', (v) => {
    // 새로 얻은 무기는 금테, 이미 있던 무기는 단계(+n)
    const list = element('adv-weapons', v);
    const seen = new Map<string, number>();
    for (const id of result.drops) seen.set(id, (seen.get(id) ?? 0) + 1);
    for (const w of new Map(drops.map((d) => [d.id, d])).values()) {
      const copies = adventure.copies(w.id);
      weaponSlot(list, w, { isNew: copies === (seen.get(w.id) ?? 0), plus: copies > 1 ? copies - 1 : 0 });
    }
  });
  modal.button(onVillage ? '마을로' : '확인', () => onVillage?.(), true);
  // 가져가는 경험치·골드가 화면이 뜰 때 0부터 600ms 동안 함께 오르고 튄다(디자인 adventure-ui.md 16절). 창을 닫으면 멈춘다.
  countUp(counters, COUNT.village, { lockWidth: true, pop: true });
  return modal;
}
