import type { Economy, ShopStat } from '../game/economy';
import { statEffect, type StatId } from '../game/stats';
import { element } from './dom';
import { PurchaseWindow } from './purchase';

interface CastleActions {
  onBuyStat(id: StatId): Promise<void>;
}

/** 아이티공간 창: 골드로 스텟을 올린다. 실제 결제는 서버가 한다. */
export class CastleWindow extends PurchaseWindow {
  private readonly statList: HTMLElement;

  constructor(
    parent: HTMLElement,
    economy: Economy,
    private readonly actions: CastleActions,
  ) {
    super(parent, economy, '아이티공간', '돈으로 사람을 고쳐 드립니다. 부작용은 본인 책임입니다.');

    element('office-section', this.root).textContent = '능력치';
    this.statList = element('shop-stats', this.root);
    for (const stat of economy.stats) this.addStat(stat);

    this.finish();
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

    const buy = this.buyButton(row, () => this.actions.onBuyStat(id));
    this.refreshers.push(() => {
      const owned = this.economy.stat(id);
      const price = this.economy.statPrice(stat);
      value.textContent = String(owned);
      title.textContent = `${name} · ${statEffect(id, owned)}`;
      buy.textContent = `+1 · ${price.toLocaleString()}G`;
      buy.disabled = this.busy || this.economy.gold < price;
    });
  }
}
