import type { ChatMessage } from '../net/session';
import { element } from './dom';

const MAX_MESSAGES = 50;
/** 입력창에서 Tab으로 바꾸는 채팅 모드. 일반은 같은 맵, 전체는 모든 맵이다(2026-11-12 사용자 요청). */
const MODES = {
  map: { label: '일반', placeholder: '같은 맵에만 보입니다 (Tab: 전체)', everyone: false },
  all: { label: '전체', placeholder: '모든 맵에 보입니다 (Tab: 일반)', everyone: true },
} as const;
type Mode = keyof typeof MODES;
const MAX_LENGTH = 100;
/** 맨 아래에서 이만큼 안이면 맨 아래를 보고 있는 것으로 친다. */
const BOTTOM_SLACK = 24;

/** 채팅 기록과 입력창 */
export class ChatBox {
  private readonly log: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly entry: HTMLElement;
  private readonly modeBadge: HTMLElement;
  /** 마지막에 쓴 모드를 기억해 다음에 열 때도 그대로 쓴다. */
  private mode: Mode = 'map';
  private stuckToBottom = true;

  constructor(
    root: HTMLElement,
    private readonly send: (text: string, everyone: boolean) => void,
  ) {
    const box = element('chat', root);
    this.log = element('chat-log', box);
    this.entry = element('chat-entry', box);
    this.entry.hidden = true;
    this.modeBadge = element('chat-mode', this.entry, 'button');
    (this.modeBadge as HTMLButtonElement).type = 'button';
    this.modeBadge.addEventListener('pointerdown', (e) => e.preventDefault());
    this.modeBadge.addEventListener('click', () => this.toggleMode());
    this.input = element('chat-input', this.entry, 'input') as HTMLInputElement;
    this.input.maxLength = MAX_LENGTH;
    this.input.hidden = true;
    this.renderMode();

    this.input.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('pointerdown', (e) => {
      if (e.target !== this.input && e.target !== this.modeBadge) this.close();
    });
  }

  get isOpen() {
    return !this.input.hidden;
  }

  open() {
    this.entry.hidden = false;
    this.input.hidden = false;
    this.input.focus();
  }

  close() {
    this.input.value = '';
    this.entry.hidden = true;
    this.input.hidden = true;
    this.input.blur();
  }

  private toggleMode() {
    this.mode = this.mode === 'map' ? 'all' : 'map';
    this.renderMode();
  }

  private renderMode() {
    const mode = MODES[this.mode];
    this.modeBadge.textContent = mode.label;
    this.modeBadge.className = `chat-mode ${this.mode}`;
    this.input.placeholder = mode.placeholder;
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
    } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      const text = this.input.value.trim();
      if (text) this.send(text, MODES[this.mode].everyone);
      this.close();
    }
  }

  show(message: ChatMessage) {
    const line = this.addLine(message.everyone ? 'chat-line chat-all' : 'chat-line');
    if (message.everyone) element('chat-tag', line, 'span').textContent = '[전체]';
    element('chat-author', line, 'span').textContent = message.author;
    element('chat-text', line, 'span').textContent = message.text;
    this.settle();
  }

  /** 입장, 처치 같은 전체 알림을 채팅 기록에도 남긴다. */
  system(text: string) {
    this.addLine('chat-line chat-system').textContent = text;
    this.settle();
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
