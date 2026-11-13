import { assetUrl } from '../assetUrl';
/**
 * 증권거래소의 종목과 내 주식(2026-11-12 사용자 요청). 가격과 보유 수는 서버(stocks, holdings 표)가 정하고
 * 여기서는 화면에 보여 줄 사본만 든다. 1원 = 1G.
 */

/** 서버 stocks 표의 id. 그림과 소개 문구는 여기서 붙인다. */
export const STOCK_INFO: Record<string, { icon: string; blurb: string; listed: boolean }> = {
  samsung: { icon: assetUrl('stocks/samsung.png'), blurb: '국민 주식. 일단 다들 하나씩은 있습니다.', listed: true },
  hynix: { icon: assetUrl('stocks/hynix.png'), blurb: '한 주 사려면 노동청에서 며칠 묵어야 합니다.', listed: true },
  hanwha: { icon: assetUrl('stocks/hanwha.png'), blurb: '불꽃처럼 오를지도 모릅니다. 불꽃은 금방 집니다.', listed: true },
  itspace: { icon: assetUrl('stocks/itspace.png'), blurb: '비상장. 대체로 내려갑니다. 애사심은 오릅니다.', listed: false },
};

/** 한 번에 사고팔 수 있는 최대 주식 수. 서버 trade_stock과 같다. */
export const TRADE_MAX = 1_000_000;

export interface Quote {
  id: string;
  name: string;
  price: number;
  /** 바로 전 갱신(1시간 전) 가격 */
  prevPrice: number;
  updatedAt: Date;
}

export interface Holding {
  shares: number;
  /** 지금 가진 주식을 사는 데 쓴 골드. 평균 단가 = cost / shares */
  cost: number;
}

export interface MarketSource {
  quotes(): Promise<Quote[] | null>;
  holdings(): Promise<{ stock: string; shares: number; cost: number }[] | null>;
}

/** 시세를 다시 읽는 최소 간격. 가격은 1시간마다 바뀌므로 창을 열 때마다 읽을 필요는 없다. */
const REFRESH_GAP_MS = 60_000;

export class Market {
  quotes: Quote[] = [];
  private readonly holdings = new Map<string, Holding>();
  private readonly listeners: (() => void)[] = [];
  private loadedAt = -Infinity;

  constructor(private readonly source: MarketSource) {}

  onChange(fn: () => void) {
    this.listeners.push(fn);
  }

  private changed() {
    for (const fn of this.listeners) fn();
  }

  /** 시세와 내 주식을 서버에서 다시 읽는다. force가 아니면 1분 안에는 다시 읽지 않는다. */
  async refresh(force = false) {
    const now = performance.now();
    if (!force && now - this.loadedAt < REFRESH_GAP_MS) return;
    this.loadedAt = now;
    const [quotes, holdings] = await Promise.all([this.source.quotes(), this.source.holdings()]);
    if (quotes) this.quotes = quotes;
    if (holdings) {
      this.holdings.clear();
      for (const { stock, shares, cost } of holdings) this.holdings.set(stock, { shares, cost });
    }
    if (quotes || holdings) this.changed();
  }

  quote(id: string) {
    return this.quotes.find((q) => q.id === id);
  }

  holding(id: string): Holding {
    return this.holdings.get(id) ?? { shares: 0, cost: 0 };
  }

  /** 거래가 끝난 뒤 서버가 알려 준 보유 수와 체결 가격으로 맞춘다. */
  setTraded(id: string, shares: number, cost: number, price: number) {
    if (shares > 0) this.holdings.set(id, { shares, cost });
    else this.holdings.delete(id);
    const quote = this.quote(id);
    if (quote && quote.price !== price) {
      // 그사이 정각이 지나 가격이 바뀌었다. 다음에 열 때 전체를 다시 읽는다.
      quote.price = price;
      this.loadedAt = -Infinity;
    }
    this.changed();
  }

  /** 가진 주식: 종목 순서대로 */
  owned() {
    return this.quotes.flatMap((quote) => {
      const held = this.holdings.get(quote.id);
      return held ? [{ quote, ...held }] : [];
    });
  }

  /** 가진 주식을 지금 가격으로 판 값 */
  get value() {
    return this.owned().reduce((sum, { quote, shares }) => sum + quote.price * shares, 0);
  }
}

/** 가격 변화: "▲ 2,000 (+0.97%)". 한국 시장처럼 오르면 빨강, 내리면 파랑으로 칠한다(class 'up'/'down'/'flat'). */
export function priceChange(now: number, before: number) {
  const diff = now - before;
  const rate = before ? (diff / before) * 100 : 0;
  const tone = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '-';
  const text = diff === 0 ? '변동 없음' : `${arrow} ${Math.abs(diff).toLocaleString()} (${diff > 0 ? '+' : '-'}${Math.abs(rate).toFixed(2)}%)`;
  /** 거래소 안 시세판처럼 좁은 곳에 쓰는 등락률만 */
  const short = diff === 0 ? '변동 없음' : `${arrow} ${Math.abs(rate).toFixed(2)}%`;
  return { tone, text, short } as const;
}

/** 평가손익: 지금 값 - 산 값. "+12,000G (+3.20%)" */
export function profitText(value: number, cost: number) {
  const diff = value - cost;
  const rate = cost ? (diff / cost) * 100 : 0;
  const tone = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  return { tone, text: `${diff > 0 ? '+' : diff < 0 ? '-' : ''}${Math.abs(diff).toLocaleString()}G (${diff >= 0 ? '+' : '-'}${Math.abs(rate).toFixed(2)}%)` } as const;
}
