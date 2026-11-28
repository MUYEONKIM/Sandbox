import { CROP_IDS, type CropId } from '../game/farm';
import { paintItem, type SeedId } from '../items';
import { element } from './dom';

/** 안내 창의 씨앗 고르기 칸 하나: 작물과 가진 개수 */
export interface FarmSeedView {
  crop: CropId;
  count: number;
}

/** 안내 창 한 번에 보일 것. 버튼이 없으면 그 칸은 null */
export interface FarmPanelView {
  lines: readonly string[];
  /** F 버튼 글(칭찬, 거두기, 거두고 심기, 심기) */
  action: string | null;
  /** 둘째 버튼 글(비난) */
  second: string | null;
  /** 내 땅이면 한 번에 거두기·심기·칭찬하기 버튼 셋(2026-11-28 농장 1-1). 심기는 든 씨앗이 있을 때만 눌린다. */
  tend: { canPlant: boolean } | null;
  /** 씨앗 고르기 줄. 가진 씨앗만(작물 차례). 안 띄우면 null */
  seeds: readonly FarmSeedView[] | null;
  /** 들고 있는 씨앗(씨앗 고르기 줄에서 밝게) */
  held: CropId | null;
}

/** 한 번에 하는 일 셋(서버 tend_plots의 act) */
export type TendAct = 'harvest' | 'plant' | 'praise';
export type FarmPanelButton = 'action' | 'second' | TendAct;

const TEND_BUTTONS: readonly [TendAct, string][] = [
  ['harvest', '한 번에 거두기'],
  ['plant', '한 번에 심기'],
  ['praise', '한 번에 칭찬하기'],
];

/** 줄은 많아야 넷이다(자라는 작물: 제목, 남은 시간, 칭찬·비난 수, 다음 누를 때). */
const MAX_LINES = 4;

function sameView(a: FarmPanelView, b: FarmPanelView) {
  if (a.action !== b.action || a.second !== b.second || a.held !== b.held) return false;
  if ((a.tend === null) !== (b.tend === null) || a.tend?.canPlant !== b.tend?.canPlant) return false;
  if (a.lines.length !== b.lines.length || !a.lines.every((line, i) => line === b.lines[i])) return false;
  if (a.seeds === null || b.seeds === null) return a.seeds === b.seeds;
  return a.seeds.length === b.seeds.length && a.seeds.every((s, i) => s.crop === b.seeds![i].crop && s.count === b.seeds![i].count);
}

/**
 * 작물 곁에 서면 캐릭터 발밑에 뜨는 작은 안내 창(2026-11-16 사용자 요청, 기획 docs/balance/farm.md 9.3,
 * 2026-11-28 농장 UX life-1127.md 2.2: 칭찬·비난 버튼, 씨앗 고르기, 농장 1-1: 한 번에 거두기·심기·칭찬하기).
 * 게임을 멈추지 않고 떠 있기만 한다. 바탕은 마우스를 막지 않고 버튼만 눌린다. 무엇을 보일지는 GameScene이 정하고,
 * 여기는 받은 것이 지난번과 다를 때만 DOM을 고친다. 씨앗 그림은 씨앗 줄을 처음 띄울 때 한 번 그린다.
 */
export class FarmPanel {
  private readonly root: HTMLElement;
  private readonly rows: HTMLElement[] = [];
  private readonly seedRow: HTMLElement;
  private seedButtons: Map<CropId, { button: HTMLButtonElement; count: HTMLElement }> | null = null;
  private readonly buttonRow: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly buttonText: HTMLElement;
  private readonly second: HTMLButtonElement;
  private readonly tendRow: HTMLElement;
  private readonly tend = new Map<TendAct, HTMLButtonElement>();
  private shown: FarmPanelView | null = null;
  /** 창의 버튼을 누르면(첫 버튼은 F와 같은 일). GameScene이 정한다. */
  onAction: ((button: FarmPanelButton) => void) | null = null;
  /** 씨앗 고르기 칸을 누르면 그 씨앗을 든다. GameScene이 정한다. */
  onSeed: ((crop: CropId) => void) | null = null;
  /** 창을 고친 횟수(성능 확인용) */
  writes = 0;

  constructor(parent: HTMLElement) {
    this.root = element('farm-panel', parent);
    this.root.hidden = true;
    for (let i = 0; i < MAX_LINES; i++) this.rows.push(element(i === 0 ? 'farm-panel-title' : 'farm-panel-line', this.root));
    this.seedRow = element('farm-panel-seeds', this.root);
    this.seedRow.hidden = true;
    this.buttonRow = element('farm-panel-buttons', this.root);
    this.button = element('farm-panel-button', this.buttonRow, 'button') as HTMLButtonElement;
    this.button.type = 'button';
    element('pickup-key', this.button, 'span').textContent = 'F';
    this.buttonText = element('farm-panel-do', this.button, 'span');
    this.second = element('farm-panel-button', this.buttonRow, 'button') as HTMLButtonElement;
    this.second.type = 'button';
    // 내 땅: 버튼 이름이 하는 일 그대로(2026-11-28 사용자 "한 번에 심기, 한 번에 칭찬하기 로 이름을 확실하게", 버튼 셋으로).
    this.tendRow = element('farm-panel-buttons farm-panel-tend', this.root);
    for (const [act, label] of TEND_BUTTONS) {
      const b = element('farm-panel-button', this.tendRow, 'button') as HTMLButtonElement;
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', () => this.onAction?.(act));
      this.tend.set(act, b);
    }
    this.button.addEventListener('click', () => this.onAction?.('action'));
    this.second.addEventListener('click', () => this.onAction?.('second'));
    // 버튼이 초점을 가져가면 Space·Enter가 버튼을 다시 누른다(fold.ts와 같은 까닭).
    for (const b of [this.button, this.second, ...this.tend.values()]) {
      b.tabIndex = -1;
      b.addEventListener('pointerdown', (e) => e.preventDefault());
    }
  }

  /** 씨앗 고르기 칸 여섯(작물 차례). 처음 띄울 때 한 번만 만든다. */
  private seedCells() {
    if (this.seedButtons) return this.seedButtons;
    const map = new Map<CropId, { button: HTMLButtonElement; count: HTMLElement }>();
    for (const crop of CROP_IDS) {
      const button = element('farm-seed', this.seedRow, 'button') as HTMLButtonElement;
      button.type = 'button';
      button.tabIndex = -1;
      button.addEventListener('pointerdown', (e) => e.preventDefault());
      const icon = element('farm-seed-icon', button, 'img') as HTMLImageElement;
      icon.src = paintItem(`seed_${crop}` as SeedId).toDataURL();
      icon.alt = '';
      const count = element('farm-seed-count', button, 'span');
      button.addEventListener('click', () => this.onSeed?.(crop));
      map.set(crop, { button, count });
    }
    this.seedButtons = map;
    return map;
  }

  /** 창을 띄우거나(view) 숨긴다(null). 지난번과 같으면 아무것도 하지 않는다. */
  set(view: FarmPanelView | null) {
    const last = this.shown;
    if (view === null) {
      if (last === null) return;
      this.shown = null;
      this.root.hidden = true;
      this.writes++;
      return;
    }
    if (last && sameView(last, view)) return;
    this.shown = view;
    this.writes++;
    for (let i = 0; i < MAX_LINES; i++) {
      const row = this.rows[i];
      const text = view.lines[i];
      row.hidden = text === undefined;
      if (text !== undefined && row.textContent !== text) row.textContent = text;
    }
    this.seedRow.hidden = view.seeds === null;
    if (view.seeds) {
      const cells = this.seedCells();
      const counts = new Map(view.seeds.map((s) => [s.crop, s.count]));
      for (const [crop, { button, count }] of cells) {
        const n = counts.get(crop);
        button.hidden = n === undefined;
        if (n === undefined) continue;
        const text = n.toLocaleString();
        if (count.textContent !== text) count.textContent = text;
        button.classList.toggle('chosen', crop === view.held);
      }
    }
    this.button.hidden = view.action === null;
    if (view.action !== null && this.buttonText.textContent !== view.action) this.buttonText.textContent = view.action;
    this.second.hidden = view.second === null;
    if (view.second !== null && this.second.textContent !== view.second) this.second.textContent = view.second;
    this.buttonRow.hidden = view.action === null && view.second === null;
    this.tendRow.hidden = view.tend === null;
    if (view.tend) this.tend.get('plant')!.disabled = !view.tend.canPlant;
    this.root.hidden = false;
    this.fitAboveBag();
  }

  /**
   * 손가락 화면: 아래 막대 위 오른쪽 '인벤토리' 단추(touch.css)를 덮으면 그 위 6px까지 올린다(2026-11-28 농장 1-1, 버튼 줄이 하나 늘어 휴대폰에서 덮음).
   * 내용이 바뀔 때만 한 번 잰다(매 프레임 일 없음). 마우스 화면에서는 단추가 숨겨져 있어 아무것도 하지 않는다.
   */
  private fitAboveBag() {
    if (this.root.style.marginTop) this.root.style.marginTop = '';
    const bag = document.querySelector<HTMLElement>('.bag-button');
    if (!bag || bag.offsetParent === null) return;
    const panel = this.root.getBoundingClientRect();
    const button = bag.getBoundingClientRect();
    const lift = panel.bottom + 6 - button.top;
    if (lift > 0 && panel.left < button.right && panel.right > button.left) this.root.style.marginTop = `${-Math.ceil(lift)}px`;
  }
}
