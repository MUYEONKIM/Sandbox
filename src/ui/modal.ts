import { element } from './dom';
import { sound } from '../sound/engine';
import type { SfxKey } from '../sound/catalog';

/**
 * 화면 가운데 작은 창(새 소식, 메모 쓰기와 읽기, 골드 버리기). 열 때 만들고 닫을 때 지운다.
 * 열려 있는 동안 GameScene.canAct가 게임 조작을 막고, Esc는 맨 위 창부터 닫는다.
 */
const open: Modal[] = [];

export function anyModalOpen() {
  return open.length > 0;
}

export function closeTopModal() {
  open[open.length - 1]?.close();
}

export class Modal {
  readonly box: HTMLElement;
  private readonly backdrop: HTMLElement;
  private onClose: (() => void) | null = null;

  /** openSound·closeSound: 열고 닫을 때 소리(메모 창은 paper, 상자 창은 box_open·box_close) */
  constructor(root: HTMLElement, className: string, title: string, openSound: SfxKey = 'ui_open', private readonly closeSound: SfxKey = 'ui_close') {
    this.backdrop = element('modal-backdrop', root);
    this.box = element(`modal ${className}`, this.backdrop);
    element('modal-title', this.box).textContent = title;
    // 글을 쓰는 칸에서는 게임 키(src/game/keys.ts)가 안 받으므로 Esc를 여기서 받는다. 창 밖 게임으로 넘기지 않는다.
    this.backdrop.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      this.close();
    });
    open.push(this);
    sound.play(openSound);
  }

  /** 아래쪽 버튼. 누르면 onClick이 false를 돌려주지 않는 한 창을 닫는다. */
  button(text: string, onClick: () => boolean | void | Promise<boolean | void>, primary = false) {
    let row = this.box.querySelector<HTMLElement>('.modal-buttons');
    if (!row) row = element('modal-buttons', this.box);
    const button = element(primary ? 'modal-button primary' : 'modal-button', row, 'button') as HTMLButtonElement;
    button.type = 'button';
    button.textContent = text;
    button.addEventListener('click', async () => {
      button.disabled = true;
      const keep = (await onClick()) === false;
      button.disabled = false;
      if (!keep) this.close();
    });
    return button;
  }

  whenClosed(callback: () => void) {
    this.onClose = callback;
    return this;
  }

  get isOpen() {
    return open.includes(this);
  }

  close() {
    const at = open.indexOf(this);
    if (at < 0) return;
    open.splice(at, 1);
    sound.play(this.closeSound);
    this.backdrop.remove();
    this.onClose?.();
  }
}
