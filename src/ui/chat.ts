import type { ChatMessage } from '../net/session';
import { element } from './dom';
import { foldButton, isFolded, saveFolded, showFoldButton } from './fold';
import { TOUCH } from './touch';
import { sound } from '../sound/engine';

const MAX_MESSAGES = 50;
/** 입력창에서 Tab으로 바꾸는 채팅 모드. 일반은 같은 맵, 전체는 모든 맵이다(2026-11-12 사용자 요청). */
const MODES = {
  map: { label: '일반', placeholder: '같은 맵에만 보입니다 (Tab: 전체)', everyone: false },
  all: { label: '전체', placeholder: '모든 맵에 보입니다 (Tab: 일반)', everyone: true },
} as const;
// 휴대폰은 키보드가 없어 채팅을 여는 버튼과 보내기 버튼을 따로 둔다(에이전트가 정함, touch.css).
type Mode = keyof typeof MODES;

/** 새로고침해도 남기는 채팅 기록 한 줄(2026-11-12 사용자 요청). 브라우저에 계정별로 저장한다. */
type Saved = { author: string; text: string; everyone: boolean } | { system: string };
const MAX_LENGTH = 100;
/** 맨 아래에서 이만큼 안이면 맨 아래를 보고 있는 것으로 친다. */
const BOTTOM_SLACK = 24;
/** 접힌 칸의 새 메시지 수는 여기까지 쓰고 넘으면 "99+" */
const UNREAD_MAX = 99;

/** 채팅 기록과 입력창 */
export class ChatBox {
  private readonly log: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly entry: HTMLElement;
  private readonly modeBadge: HTMLElement;
  /** 휴대폰: 입력창이 닫혀 있을 때 보이는 '채팅' 버튼 */
  private readonly opener: HTMLButtonElement;
  /** 마지막에 쓴 모드를 기억해 다음에 열 때도 그대로 쓴다. */
  private mode: Mode = 'map';
  private stuckToBottom = true;
  private history: Saved[] = [];
  private readonly box: HTMLElement;
  private readonly unread: HTMLElement;
  private folded: boolean;
  /** 접혀 있는 동안 받은 사람의 채팅 수(입장·처치 같은 알림 줄과 내 채팅은 세지 않음) */
  private unreadCount = 0;

  /** storageKey는 계정마다 다른 이름이라 같은 브라우저에서 다른 계정의 기록이 섞이지 않는다. me는 내 id(내 채팅은 새 메시지로 세지 않음). */
  constructor(
    root: HTMLElement,
    private readonly send: (text: string, everyone: boolean) => void,
    private readonly storageKey: string,
    private readonly me = '',
  ) {
    const box = element('chat', root);
    this.box = box;
    this.log = element('chat-log', box);
    // 접으면 기록 대신 왼쪽 아래 작은 칸 "채팅 [새 메시지 수] +"가 남는다(ui-minimize.md). 칸 아무 데나 눌러도 편다.
    box.classList.add('foldable');
    const chip = element('chat-chip', box);
    element('chat-chip-label', chip, 'span').textContent = '채팅';
    this.unread = element('chat-unread', chip, 'span');
    showFoldButton(
      foldButton(chip, () => this.setFolded(false)),
      true,
    );
    chip.addEventListener('click', () => this.setFolded(false));
    foldButton(box, () => this.setFolded(true)).classList.add('chat-fold');
    this.folded = isFolded('chat');
    box.classList.toggle('folded', this.folded);
    this.entry = element('chat-entry', box);
    this.entry.hidden = true;
    this.modeBadge = element('chat-mode', this.entry, 'button');
    (this.modeBadge as HTMLButtonElement).type = 'button';
    this.modeBadge.addEventListener('pointerdown', (e) => e.preventDefault());
    this.modeBadge.addEventListener('click', () => this.toggleMode());
    this.input = element('chat-input', this.entry, 'input') as HTMLInputElement;
    this.input.maxLength = MAX_LENGTH;
    this.input.hidden = true;
    this.input.enterKeyHint = 'send';
    // 휴대폰 화면 키보드의 Enter가 keydown으로 안 올 때도 있어 보내기 버튼을 둔다. 마우스 화면에서는 숨긴다(style.css).
    const sendButton = element('chat-send', this.entry, 'button') as HTMLButtonElement;
    sendButton.type = 'button';
    sendButton.textContent = '보내기';
    sendButton.addEventListener('pointerdown', (e) => e.preventDefault());
    sendButton.addEventListener('click', () => this.submit());
    this.opener = element('chat-open', box, 'button') as HTMLButtonElement;
    this.opener.type = 'button';
    this.opener.textContent = '채팅';
    this.opener.addEventListener('click', () => this.open());
    // 휴대폰에서는 채팅 기록을 눌러도 입력창이 열린다(기록을 밀어 올려 읽을 때는 열리지 않는다).
    if (TOUCH) this.log.addEventListener('click', () => this.open());
    this.renderMode();

    this.input.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('pointerdown', (e) => {
      const target = e.target instanceof Node ? e.target : null;
      // 입력줄(입력창, 모드 표시, 보내기)과 여는 버튼, 휴대폰의 채팅 기록을 누를 때는 닫지 않는다.
      const keep = target && (this.entry.contains(target) || target === this.opener || (TOUCH && this.log.contains(target)));
      if (!keep) this.close();
    });
    this.restore();
  }

  get isOpen() {
    return !this.input.hidden;
  }

  open() {
    this.entry.hidden = false;
    this.input.hidden = false;
    this.opener.hidden = true;
    this.input.focus();
  }

  close() {
    this.input.value = '';
    this.entry.hidden = true;
    this.input.hidden = true;
    this.opener.hidden = false;
    this.input.blur();
  }

  /** 쓴 글을 보내고 입력창을 닫는다(Enter, 휴대폰은 보내기 버튼). */
  private submit() {
    const text = this.input.value.trim();
    if (text) {
      sound.play('chat_send');
      this.send(text, MODES[this.mode].everyone);
    }
    this.close();
  }

  private toggleMode() {
    this.mode = this.mode === 'map' ? 'all' : 'map';
    this.renderMode();
  }

  private renderMode() {
    const mode = MODES[this.mode];
    this.modeBadge.textContent = mode.label;
    this.modeBadge.className = `chat-mode ${this.mode}`;
    // 휴대폰에는 Tab 키가 없어 모드 안내를 빼고 쓴다(모드는 왼쪽 표시를 눌러 바꾼다).
    this.input.placeholder = TOUCH ? mode.placeholder.replace(/ \(Tab: .+\)$/, '') : mode.placeholder;
    this.entry.classList.toggle('all', this.mode === 'all');
  }

  private onKey(e: KeyboardEvent) {
    // 한글 조합 중에 누른 Enter는 글자를 확정할 뿐이고, 전송은 뒤따르는 keydown에서 처리한다.
    if (e.isComposing) return;
    if (e.code === 'Escape') {
      this.close();
    } else if (e.code === 'Tab') {
      // 브라우저가 다른 칸으로 초점을 옮기지 않게 막고 모드만 바꾼다.
      e.preventDefault();
      this.toggleMode();
    } else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.key === 'Enter') {
      // 휴대폰 화면 키보드는 code를 비워 보낼 때가 있어 key도 본다.
      this.submit();
    }
  }

  show({ id, author, text, everyone }: ChatMessage) {
    this.draw({ author, text, everyone });
    this.remember({ author, text, everyone });
    if (this.folded && id !== this.me) {
      this.unreadCount++;
      this.unread.textContent = this.unreadCount > UNREAD_MAX ? `${UNREAD_MAX}+` : String(this.unreadCount);
    }
  }

  /** 접기·펴기. 펴면 새 메시지 수를 지우고 기록을 맨 아래로 내린다. */
  private setFolded(value: boolean) {
    if (value === this.folded) return;
    this.folded = value;
    this.box.classList.toggle('folded', value);
    saveFolded('chat', value);
    if (value) return;
    this.unreadCount = 0;
    this.unread.textContent = '';
    this.stuckToBottom = true;
    this.log.scrollTop = this.log.scrollHeight;
  }

  /** 입장, 처치 같은 전체 알림을 채팅 기록에도 남긴다. */
  system(text: string) {
    this.draw({ system: text });
    this.remember({ system: text });
  }

  private draw(entry: Saved) {
    if ('system' in entry) {
      this.addLine('chat-line chat-system').textContent = entry.system;
    } else {
      const line = this.addLine(entry.everyone ? 'chat-line chat-all' : 'chat-line');
      if (entry.everyone) element('chat-tag', line, 'span').textContent = '[전체]';
      element('chat-author', line, 'span').textContent = entry.author;
      element('chat-text', line, 'span').textContent = entry.text;
    }
    this.settle();
  }

  private remember(entry: Saved) {
    this.history.push(entry);
    if (this.history.length > MAX_MESSAGES) this.history.shift();
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.history));
    } catch {
      // 저장소를 못 쓰는 브라우저(사생활 보호 모드 등)면 기록만 안 남는다.
    }
  }

  /** 지난번에 남긴 기록을 다시 그린다. 이상한 값은 건너뛴다. */
  private restore() {
    let saved: unknown = null;
    try {
      saved = JSON.parse(localStorage.getItem(this.storageKey) ?? 'null');
    } catch {
      return;
    }
    if (!Array.isArray(saved)) return;
    const isText = (v: unknown) => typeof v === 'string' && v.length <= 200;
    for (const entry of saved.slice(-MAX_MESSAGES)) {
      const e = entry as Partial<{ author: unknown; text: unknown; everyone: unknown; system: unknown }> | null;
      if (e && isText(e.system)) this.history.push({ system: e.system as string });
      else if (e && isText(e.author) && isText(e.text)) {
        this.history.push({ author: e.author as string, text: e.text as string, everyone: e.everyone === true });
      }
    }
    for (const entry of this.history) this.draw(entry);
  }

  /** 줄을 붙이기 전에 맨 아래를 보고 있었는지 기억한다. 위로 올려 읽는 중이면 끌어내리지 않는다. */
  private addLine(className: string) {
    this.stuckToBottom = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < BOTTOM_SLACK;
    return element(className, this.log);
  }

  private settle() {
    if (this.log.childElementCount > MAX_MESSAGES) this.log.firstElementChild?.remove();
    if (this.stuckToBottom) this.log.scrollTop = this.log.scrollHeight;
  }
}
