export interface ChatMessage {
  author: string;
  text: string;
}

/** 채팅 메시지가 오가는 통로. 멀티플레이를 넣을 때 서버와 통신하는 구현으로 교체한다. */
export interface ChatChannel {
  send(text: string): void;
  onMessage(fn: (message: ChatMessage) => void): void;
}

/** 싱글플레이용 통로: 보낸 메시지를 그대로 되돌려 준다. */
export class LocalChat implements ChatChannel {
  private readonly listeners: ((message: ChatMessage) => void)[] = [];

  constructor(private readonly author: string) {}

  send(text: string) {
    for (const fn of this.listeners) fn({ author: this.author, text });
  }

  onMessage(fn: (message: ChatMessage) => void) {
    this.listeners.push(fn);
  }
}
