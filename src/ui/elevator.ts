import { ELEVATOR_STOPS, type TowerId } from '../game/tower';
import { element } from './dom';

interface ElevatorActions {
  onGo(to: TowerId): void;
}

/** 아이티공간 엘리베이터: 7층까지 간다. 임대 준 층은 눌러도 서지 않는다. */
export class ElevatorWindow {
  private readonly root: HTMLElement;
  private readonly message: HTMLElement;
  private readonly buttons: { floor: number; button: HTMLButtonElement }[] = [];

  constructor(parent: HTMLElement, actions: ElevatorActions) {
    this.root = element('office elevator', parent);
    this.root.hidden = true;

    element('office-title', this.root).textContent = '엘리베이터';
    element('office-subtitle', this.root).textContent = '7층까지 운행합니다. 8층은 7층 사무실 안 계단으로 올라가세요.';

    const panel = element('elevator-panel', this.root);
    for (const { floor, to } of ELEVATOR_STOPS) {
      const button = element('elevator-button', panel, 'button') as HTMLButtonElement;
      button.type = 'button';
      button.textContent = String(floor);
      button.addEventListener('click', () => {
        if (to) actions.onGo(to);
        else this.say(`${floor}층은 임대 줬습니다.`);
      });
      this.buttons.push({ floor, button });
    }
    this.message = element('elevator-message', this.root);

    const close = element('office-close', this.root, 'button') as HTMLButtonElement;
    close.type = 'button';
    close.textContent = '닫기 (Esc)';
    close.addEventListener('click', () => this.close());
  }

  get isOpen() {
    return !this.root.hidden;
  }

  /** 엘리베이터가 서 있는 층의 버튼은 불이 켜져 있다. 누르면 그 층에서 문이 열린다. */
  open(current: number | null) {
    for (const { floor, button } of this.buttons) {
      button.classList.toggle('here', floor === current);
    }
    this.say('');
    this.root.hidden = false;
  }

  close() {
    this.root.hidden = true;
  }

  private say(text: string) {
    this.message.textContent = text;
  }
}
