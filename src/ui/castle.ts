import type { Economy, ShopStat } from '../game/economy';
import { statEffect, type StatId } from '../game/stats';
import { element } from './dom';
import { PurchaseWindow } from './purchase';
import { formatGold, goldText } from '../game/gold';

interface CastleActions {
  onBuyStat(id: StatId, amount: number): Promise<void>;
}

/** 고르기 쉬운 양. 그 밖의 양은 직접 친다. */
const AMOUNTS = [1, 10, 100, 1000];
/** 한 번에 올릴 수 있는 끝. 서버 buy_stat은 1~10억을 받는다(2026-11-15, 골드 상한을 없애며 1,000에서 올림). */
const AMOUNT_MAX = 1_000_000_000;

/** 아이티공간 1층 카페 ITS'room의 카운터: 골드로 스텟을 올린다. 실제 결제는 서버가 한다. */
export class CastleWindow extends PurchaseWindow {
  private readonly statList: HTMLElement;
  /** 아래 사기 버튼이 한 번에 올리는 양 */
  private amount = AMOUNTS[0];
  private input!: HTMLInputElement;

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
        this.input.value = String(amount);
        this.render();
      });
      this.refreshers.push(() => {
        button.classList.toggle('chosen', this.amount === amount);
        button.disabled = this.busy;
      });
    }
    // 원하는 양은 직접 친다(2026-11-15, 증권거래소 수량 칸과 같은 방식). 숫자만 받고 1~10억이다.
    const field = element('casino-field exchange-field', row, 'label');
    element('casino-field-label', field, 'span').textContent = '직접 입력';
    this.input = element('casino-input', field, 'input') as HTMLInputElement;
    this.input.type = 'text';
    this.input.inputMode = 'numeric';
    this.input.autocomplete = 'off';
    this.input.maxLength = String(AMOUNT_MAX).length;
    this.input.placeholder = '포인트';
    this.input.value = String(this.amount);
    element('casino-unit', field, 'span').textContent = '포인트';
    let justFocused = false;
    this.input.addEventListener('focus', () => {
      this.input.select();
      justFocused = true;
    });
    this.input.addEventListener('mouseup', (e) => {
      if (justFocused) e.preventDefault();
      justFocused = false;
    });
    this.input.addEventListener('blur', () => {
      justFocused = false;
    });
    this.input.addEventListener('input', () => {
      const digits = this.input.value.replace(/\D/g, '');
      if (digits !== this.input.value) this.input.value = digits;
      this.amount = Math.min(Number(digits) || 0, AMOUNT_MAX);
      this.render();
    });
    this.refreshers.push(() => {
      this.input.disabled = this.busy;
    });
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
      value.textContent = formatGold(owned);
      title.textContent = `${name} · ${statEffect(id, owned)}`;
      if (this.amount < 1) {
        buy.textContent = '양을 적어 주세요';
        buy.disabled = true;
        return;
      }
      const price = this.economy.statPrice(stat, this.amount);
      buy.textContent = `+${this.amount.toLocaleString()} · ${goldText(price)}`;
      buy.disabled = this.busy || this.economy.gold < price;
    });
  }
}
