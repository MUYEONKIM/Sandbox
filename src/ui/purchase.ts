import type { Economy } from '../game/economy';
import { element } from './dom';

/** 골드를 내는 창의 공통 틀: 보유 골드 표시, 결제 중 버튼 잠금, 나가기 버튼 */
export abstract class PurchaseWindow {
  protected readonly root: HTMLElement;
  /** 골드나 보유 목록이 바뀔 때마다 다시 그리는 항목 */
  protected readonly refreshers: (() => void)[] = [];
  /** 결제가 끝나기 전에 또 눌러 두 번 사는 일이 없도록 버튼을 막아 둔다. */
  protected busy = false;
  private readonly wallet: HTMLElement;

  protected constructor(
    parent: HTMLElement,
    protected readonly economy: Economy,
    title: string,
    subtitle: string,
  ) {
    this.root = element('office', parent);
    this.root.hidden = true;
    element('office-title', this.root).textContent = title;
    element('office-subtitle', this.root).textContent = subtitle;
    this.wallet = element('shop-wallet', this.root);
  }

  /** 내용을 다 붙인 뒤 부른다. 나가기 버튼이 맨 아래에 온다. */
  protected finish() {
    const close = element('office-close', this.root, 'button') as HTMLButtonElement;
    close.type = 'button';
    close.textContent = '나가기 (Esc)';
    close.addEventListener('click', () => this.close());

    this.economy.onChange(() => this.render());
    this.render();
  }

  get isOpen() {
    return !this.root.hidden;
  }

  open() {
    this.render();
    this.root.hidden = false;
  }

  close() {
    this.root.hidden = true;
  }

  protected buyButton(parent: HTMLElement, buy: () => Promise<void>) {
    const button = element('shop-buy', parent, 'button') as HTMLButtonElement;
    button.type = 'button';
    button.addEventListener('click', async () => {
      this.busy = true;
      this.render();
      try {
        await buy();
      } finally {
        this.busy = false;
        this.render();
      }
    });
    return button;
  }

  private render() {
    this.wallet.textContent = `보유 골드 ${this.economy.gold.toLocaleString()}G`;
    for (const refresh of this.refreshers) refresh();
  }
}
