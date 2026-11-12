import type { Economy, ShopStat } from '../game/economy';
import { statEffect, type StatId } from '../game/stats';
import { element } from './dom';
import { PurchaseWindow } from './purchase';

interface CastleActions {
  onBuyStat(id: StatId, amount: number): Promise<void>;
}

/** 한 번에 올릴 수 있는 양. 서버 buy_stat은 1~1000을 받는다. */
const AMOUNTS = [1, 10, 100, 1000];

/** 아이티공간 1층 카페 ITS'room의 카운터: 골드로 스텟을 올린다. 실제 결제는 서버가 한다. */
export class CastleWindow extends PurchaseWindow {
  private readonly statList: HTMLElement;
  /** 아래 사기 버튼이 한 번에 올리는 양 */
  private amount = AMOUNTS[0];

  constructor(
    parent: HTMLElement,
    economy: Economy,
    private readonly actions: CastleActions,
  ) {
    super(parent, economy, "ITS'room 카운터", '돈으로 사람을 고쳐 드립니다. 부작용은 본인 책임입니다.');

    element('office-section', this.root).textContent = '능력치';
    this.addAmountPicker();
    this.statList = element('shop-stats', this.root);
    for (const stat of economy.stats) this.addStat(stat);

    this.finish();
  }

  /** 위에서 양을 고르면 아래 모든 사기 버튼의 양과 값이 함께 바뀐다. */
  private addAmountPicker() {
    const row = element('shop-amounts', this.root);
    element('shop-amounts-label', row).textContent = '한 번에';
    for (const amount of AMOUNTS) {
      const button = element('shop-amount', row, 'button') as HTMLButtonElement;
      button.type = 'button';
      button.textContent = `+${amount.toLocaleString()}`;
      button.addEventListener('click', () => {
        this.amount = amount;
        this.render();
      });
      this.refreshers.push(() => {
        button.classList.toggle('chosen', this.amount === amount);
        button.disabled = this.busy;
      });
    }
  }

  private addStat(stat: ShopStat) {
    const { id, name, blurb } = stat;
    const row = element('shop-stat', this.statList);
    const badge = element('shop-stat-badge', row);
    element('shop-stat-id', badge).textContent = id.toUpperCase();
    const value = element('shop-stat-value', badge);

    const text = element('shop-stat-text', row);
    const title = element('shop-stat-name', text);
    element('shop-stat-blurb', text).textContent = blurb;

    const buy = this.buyButton(row, () => this.actions.onBuyStat(id, this.amount));
    this.refreshers.push(() => {
      const owned = this.economy.stat(id);
      const price = this.economy.statPrice(stat, this.amount);
      value.textContent = owned.toLocaleString();
      title.textContent = `${name} · ${statEffect(id, owned)}`;
      buy.textContent = `+${this.amount.toLocaleString()} · ${price.toLocaleString()}G`;
      buy.disabled = this.busy || this.economy.gold < price;
    });
  }
}
