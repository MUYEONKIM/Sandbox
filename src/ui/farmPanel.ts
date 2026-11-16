import { element } from './dom';

/** 안내 창 한 번에 보일 것: 글 줄(첫 줄이 제목)과 버튼 글. 버튼이 없으면 action은 null */
export interface FarmPanelView {
  lines: readonly string[];
  action: string | null;
}

/** 줄은 많아야 넷이다(남의 다 자란 작물: 제목, 다 자람, 주인만 거둠, 칭찬·비난 수). */
const MAX_LINES = 4;

/**
 * 작물 곁에 서면 캐릭터 발밑에 뜨는 작은 안내 창(2026-11-16 사용자 요청, 기획 docs/balance/farm.md 9.3).
 * 게임을 멈추지 않고 떠 있기만 한다. 바탕은 마우스를 막지 않고 버튼만 눌린다. 무엇을 보일지는 GameScene이 정하고,
 * 여기는 받은 글이 지난번과 다를 때만 DOM을 고친다.
 */
export class FarmPanel {
  private readonly root: HTMLElement;
  private readonly rows: HTMLElement[] = [];
  private readonly button: HTMLButtonElement;
  private readonly buttonText: HTMLElement;
  private shown: FarmPanelView | null = null;
  /** 창의 버튼을 누르면 F와 같은 일을 한다(휴대폰에는 F 키가 없다). GameScene이 정한다. */
  onAction: (() => void) | null = null;
  /** 창을 고친 횟수(성능 확인용) */
  writes = 0;

  constructor(parent: HTMLElement) {
    this.root = element('farm-panel', parent);
    this.root.hidden = true;
    for (let i = 0; i < MAX_LINES; i++) this.rows.push(element(i === 0 ? 'farm-panel-title' : 'farm-panel-line', this.root));
    this.button = element('farm-panel-button', this.root, 'button') as HTMLButtonElement;
    this.button.type = 'button';
    element('pickup-key', this.button, 'span').textContent = 'F';
    this.buttonText = element('farm-panel-do', this.button, 'span');
    this.button.addEventListener('click', () => this.onAction?.());
  }

  /** 창을 띄우거나(view) 숨긴다(null). 글과 버튼이 지난번과 같으면 아무것도 하지 않는다. */
  set(view: FarmPanelView | null) {
    const last = this.shown;
    if (view === null) {
      if (last === null) return;
      this.shown = null;
      this.root.hidden = true;
      this.writes++;
      return;
    }
    if (last && last.action === view.action && last.lines.length === view.lines.length && last.lines.every((line, i) => line === view.lines[i])) return;
    this.shown = view;
    this.writes++;
    for (let i = 0; i < MAX_LINES; i++) {
      const row = this.rows[i];
      const text = view.lines[i];
      row.hidden = text === undefined;
      if (text !== undefined && row.textContent !== text) row.textContent = text;
    }
    this.button.hidden = view.action === null;
    if (view.action !== null && this.buttonText.textContent !== view.action) this.buttonText.textContent = view.action;
    this.root.hidden = false;
  }
}
