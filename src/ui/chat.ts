import type { ChatMessage } from '../net/session';
import { element } from './dom';

const MAX_MESSAGES = 50;
const MAX_LENGTH = 100;
/** 맨 아래에서 이만큼 안이면 맨 아래를 보고 있는 것으로 친다. */
const BOTTOM_SLACK = 24;

/** 채팅 기록과 입력창 */
export class ChatBox {
  private readonly log: HTMLElement;
  private readonly input: HTMLInputElement;
  private stuckToBottom = true;

  constructor(
    root: HTMLElement,
    private readonly send: (text: string) => void,
  ) {
    const box = element('chat', root);
    this.log = element('chat-log', box);
    this.input = element('chat-input', box, 'input') as HTMLInputElement;
    this.input.maxLength = MAX_LENGTH;
    this.input.placeholder = '메시지를 입력하고 Enter';
    this.input.hidden = true;

    this.input.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('pointerdown', (e) => {
      if (e.target !== this.input) this.close();
    });
  }

  get isOpen() {
    return !this.input.hidden;
  }

  open() {
    this.input.hidden = false;
    this.input.focus();
  }

  close() {
    this.input.value = '';
    this.input.hidden = true;
    this.input.blur();
  }

  private onKey(e: KeyboardEvent) {
    // 한글 조합 중에 누른 Enter는 글자를 확정할 뿐이고, 전송은 뒤따르는 keydown에서 처리한다.
    if (e.isComposing) return;
    if (e.code === 'Escape') {
      this.close();
    } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      const text = this.input.value.trim();
      if (text) this.send(text);
      this.close();
    }
  }

  show(message: ChatMessage) {
    const line = this.addLine('chat-line');
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
