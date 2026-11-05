import type { ChatChannel, ChatMessage } from '../game/chat';
import { element } from './dom';

const BUBBLE_MS = 4000;
const MAX_MESSAGES = 50;
const MAX_LENGTH = 100;

/** 채팅 기록, 입력창, 캐릭터 머리 위 말풍선 */
export class ChatBox {
  private readonly log: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly bubble: HTMLElement;
  private hideBubbleTimer = 0;

  constructor(
    root: HTMLElement,
    private readonly channel: ChatChannel,
    private readonly playerName: string,
  ) {
    const box = element('chat', root);
    this.log = element('chat-log', box);
    this.input = element('chat-input', box, 'input') as HTMLInputElement;
    this.input.maxLength = MAX_LENGTH;
    this.input.placeholder = '메시지를 입력하고 Enter';
    this.input.hidden = true;

    this.bubble = element('bubble', root);
    this.bubble.hidden = true;

    this.input.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('pointerdown', (e) => {
      if (e.target !== this.input) this.close();
    });
    channel.onMessage((message) => this.show(message));
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

  /** 말풍선을 화면 좌표 (x, y) 위로 옮긴다. */
  moveBubble(x: number, y: number) {
    this.bubble.style.left = `${x}px`;
    this.bubble.style.top = `${y}px`;
  }

  private onKey(e: KeyboardEvent) {
    // 한글 조합 중에 누른 Enter는 글자를 확정할 뿐이고, 전송은 뒤따르는 keydown에서 처리한다.
    if (e.isComposing) return;
    if (e.code === 'Escape') {
      this.close();
    } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      const text = this.input.value.trim();
      if (text) this.channel.send(text);
      this.close();
    }
  }

  private show(message: ChatMessage) {
    const line = element('chat-line', this.log);
    element('chat-author', line, 'span').textContent = message.author;
    element('chat-text', line, 'span').textContent = message.text;
    if (this.log.childElementCount > MAX_MESSAGES) this.log.firstElementChild?.remove();
    this.log.scrollTop = this.log.scrollHeight;

    if (message.author === this.playerName) {
      this.bubble.textContent = message.text;
      this.bubble.hidden = false;
      window.clearTimeout(this.hideBubbleTimer);
      this.hideBubbleTimer = window.setTimeout(() => {
        this.bubble.hidden = true;
      }, BUBBLE_MS);
    }
  }
}
