import type { Economy } from '../game/economy';
import { priceChange, profitText, STOCK_INFO, TRADE_MAX, type Market, type Quote } from '../game/market';
import { element } from './dom';
import { PurchaseWindow } from './purchase';

interface ExchangeActions {
  /** amount > 0이면 사고, < 0이면 판다. */
  onTrade(stock: string, amount: number): Promise<void>;
}

/** 수량 버튼(2026-11-12 사용자 요청 "1, 10, 100 지정 가능하고 원하는 숫자도 가능"). */
const AMOUNTS = [1, 10, 100];
/** 창이 열려 있는 동안 시세를 다시 확인하는 간격. 가격은 매시 정각에 바뀐다. */
const REFRESH_MS = 60_000;

const clock = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

/**
 * 증권거래소 창: 종목마다 지금 가격, 1시간 전보다 얼마나 바뀌었는지, 내 주식과 손익, 사기·팔기 버튼.
 * 매수와 매도만 있고 지금 가격에 바로 체결된다. 실제 결제는 서버 trade_stock이 한다.
 */
export class ExchangeWindow extends PurchaseWindow {
  private readonly list: HTMLElement;
  private readonly note: HTMLElement;
  private readonly input: HTMLInputElement;
  private amount = AMOUNTS[1];
  private refreshTimer = 0;
  private readonly rows = new Map<string, { row: HTMLElement; refresh: () => void }>();
  /** 거래소 안 종목 창구로 열었으면 그 종목. 줄을 강조하고 보이게 내린다. */
  private focus: string | null = null;

  constructor(
    parent: HTMLElement,
    economy: Economy,
    private readonly market: Market,
    private readonly actions: ExchangeActions,
  ) {
    super(parent, economy, '증권거래소', '오르면 내 실력, 내리면 세력 탓.');
    this.root.classList.add('exchange');
    this.note = element('exchange-note', this.root);

    element('office-section', this.root).textContent = '수량';
    const row = element('exchange-amount', this.root);
    for (const amount of AMOUNTS) {
      const button = element('shop-amount', row, 'button') as HTMLButtonElement;
      button.type = 'button';
      button.textContent = `${amount}주`;
      button.addEventListener('click', () => this.setAmount(amount));
      this.refreshers.push(() => {
        button.classList.toggle('chosen', this.amount === amount);
        button.disabled = this.busy;
      });
    }
    // 원하는 수는 직접 친다. 누르면 지금 수가 모두 골라져 바로 새로 칠 수 있다(도박장 거는 돈 칸과 같은 방식).
    const field = element('casino-field exchange-field', row, 'label');
    element('casino-field-label', field, 'span').textContent = '직접 입력';
    this.input = element('casino-input', field, 'input') as HTMLInputElement;
    this.input.type = 'text';
    this.input.inputMode = 'numeric';
    this.input.autocomplete = 'off';
    this.input.maxLength = String(TRADE_MAX).length;
    this.input.placeholder = '수량';
    this.input.value = String(this.amount);
    element('casino-unit', field, 'span').textContent = '주';
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
      this.amount = Math.min(Number(digits) || 0, TRADE_MAX);
      this.render();
    });
    this.refreshers.push(() => {
      this.input.disabled = this.busy;
    });

    element('office-section', this.root).textContent = '종목';
    this.list = element('exchange-list', this.root);
    this.refreshers.push(() => this.renderList());

    this.finish();
    market.onChange(() => this.render());
  }

  open(focus?: string) {
    this.focus = focus ?? null;
    super.open();
    this.rows.get(this.focus ?? '')?.row.scrollIntoView({ block: 'nearest' });
    void this.market.refresh();
    window.clearInterval(this.refreshTimer);
    this.refreshTimer = window.setInterval(() => void this.market.refresh(), REFRESH_MS);
  }

  close() {
    super.close();
    this.input.blur();
    window.clearInterval(this.refreshTimer);
  }

  private setAmount(amount: number) {
    this.amount = amount;
    this.input.value = String(amount);
    this.render();
  }

  /** 종목 줄은 처음 시세를 받았을 때 만들고, 그 뒤로는 글자만 바꾼다(누르는 중인 버튼이 사라지지 않게). */
  private renderList() {
    const { quotes } = this.market;
    if (!quotes.length) {
      this.list.textContent = '시세를 불러오는 중입니다...';
      this.note.textContent = '';
      return;
    }
    if (this.rows.size !== quotes.length) {
      this.list.replaceChildren();
      this.rows.clear();
      for (const quote of quotes) this.rows.set(quote.id, this.addRow(quote));
    }
    for (const { refresh } of this.rows.values()) refresh();

    const listed = quotes.filter((q) => STOCK_INFO[q.id]?.listed);
    const latest = new Date(Math.max(...listed.map((q) => q.updatedAt.getTime())));
    const next = new Date();
    next.setHours(next.getHours() + 1, 0, 0, 0);
    this.note.textContent = `실제 주가(네이버 증권)를 1시간마다 받아옵니다 · 마지막 갱신 ${clock(latest)} · 다음 ${clock(next)}`;
  }

  private addRow({ id }: Quote) {
    const info = STOCK_INFO[id];
    const row = element('stock', this.list);
    const icon = element('stock-icon', row, 'img') as HTMLImageElement;
    icon.alt = '';
    if (info) icon.src = info.icon;
    const main = element('stock-main', row);
    const head = element('stock-head', main);
    const name = element('stock-name', head, 'span');
    const price = element('stock-price', head, 'span');
    const sub = element('stock-sub', main);
    element('stock-blurb', sub, 'span').textContent = info?.blurb ?? '';
    const change = element('stock-change', sub, 'span');
    const mine = element('stock-mine', main);
    const actions = element('stock-actions', main);
    const buy = this.buyButton(actions, () => this.actions.onTrade(id, this.amount));
    buy.classList.add('stock-buy');
    const sell = this.buyButton(actions, () => this.actions.onTrade(id, -this.amount));
    sell.classList.add('stock-sell');

    const refresh = () => {
      row.classList.toggle('stock-focus', this.focus === id);
      const quote = this.market.quote(id);
      if (!quote) return;
      const held = this.market.holding(id);
      const total = quote.price * this.amount;
      name.textContent = quote.name;
      price.textContent = `${quote.price.toLocaleString()}원`;
      const moved = priceChange(quote.price, quote.prevPrice);
      change.className = `stock-change tone-${moved.tone}`;
      change.textContent = moved.text;
      mine.replaceChildren();
      if (held.shares > 0) {
        const profit = profitText(quote.price * held.shares, held.cost);
        mine.append(`보유 ${held.shares.toLocaleString()}주 · 평균 ${Math.round(held.cost / held.shares).toLocaleString()}원 · `);
        element(`stock-profit tone-${profit.tone}`, mine, 'span').textContent = profit.text;
      } else {
        mine.textContent = '가진 주식 없음';
      }
      const amount = this.amount.toLocaleString();
      buy.textContent = `사기 ${amount}주 · ${total.toLocaleString()}G`;
      sell.textContent = `팔기 ${amount}주 · ${total.toLocaleString()}G`;
      buy.disabled = this.busy || this.amount < 1 || this.economy.gold < total;
      sell.disabled = this.busy || this.amount < 1 || held.shares < this.amount;
    };
    return { row, refresh };
  }
}
