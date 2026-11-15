import type { WeaponId } from '../items';
import type { Gold } from './gold';

/**
 * 대장간 값 계산(2026-11-16, docs/balance/weapons.md 2장, forge-items.md 3장). 서버 forge_gear·gear_price와 같은 식이다.
 * 판매가는 서버 forge_steps 표의 단계 값 × 무기값/1,000 × (1 + LUK/300)이고 소수점 아래는 버린다.
 * 골드는 끝이 없어서 BigInt로 센다. 표의 값은 소수 둘째 자리까지라 100을 곱한 정수(센트)로 다룬다.
 */

/** 기본 권총 말고 가질 수 있는 무기 수(서버 buy_gear와 같음) */
export const GEAR_MAX = 5;
/** 강화는 +99에서 멈춘다. */
export const LEVEL_MAX = 99;

/** 강화 단계 하나: 이 단계에서 다음 단계에 도전할 때의 확률(백만분율)과 이 단계의 판매가(무기값 1,000G, LUK 0) */
export interface ForgeStep {
  level: number;
  success: number;
  keep: number;
  fall: number;
  destroy: number;
  /** 판매가 × 100 */
  cents: bigint;
}

/** 가진 자루 하나(서버 gear 표 한 줄) */
export interface Gear {
  id: number;
  kind: WeaponId;
  level: number;
}

/** 두루마리: guard 파괴 방지, hold 하락 방지, boost 성공(유지 10%p를 성공으로) */
export type ScrollId = 'guard' | 'hold' | 'boost';
export const SCROLL_IDS: readonly ScrollId[] = ['guard', 'hold', 'boost'];
export const SCROLL_NAMES: Record<ScrollId, string> = { guard: '파괴 방지 두루마리', hold: '하락 방지 두루마리', boost: '성공 두루마리' };

/** 망치질 결과 */
export type ForgeOutcome = 'success' | 'keep' | 'drop' | 'destroy';

const PPM = 1_000_000n;

/** 서버의 numeric 글자("552.47", 아주 큰 값은 정수)를 센트로 읽는다. */
export function parseCents(value: unknown): bigint | null {
  const text = typeof value === 'number' ? value.toFixed(2) : String(value);
  const match = /^(\d{1,1100})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? '0').padEnd(2, '0'));
}

const luk = (value: number) => BigInt(Math.max(0, Math.floor(value)));

/** 무기를 사는 값: 무기값 × (1 + LUK/300), 버림 */
export function buyPrice(base: number, lukValue: number): Gold {
  return (BigInt(base) * (300n + luk(lukValue))) / 300n;
}

/** 망치질 한 번의 간격: 3초 × 무기값/1,000 */
export function hammerMs(base: number) {
  return 3 * base;
}

export class ForgeTable {
  private readonly steps: ForgeStep[];

  constructor(steps: ForgeStep[]) {
    this.steps = [...steps].sort((a, b) => a.level - b.level);
  }

  get ready() {
    return this.steps.length === LEVEL_MAX + 1;
  }

  step(level: number) {
    return this.steps[level];
  }

  /** 판매가 */
  sale(level: number, base: number, lukValue: number): Gold {
    const step = this.steps[level];
    if (!step) return 0n;
    return (step.cents * BigInt(base) * (300n + luk(lukValue))) / 30_000_000n;
  }

  /** 강화비: 판매가의 1%(반올림, 최소 1G) */
  fee(level: number, base: number, lukValue: number): Gold {
    const value = (this.sale(level, base, lukValue) + 50n) / 100n;
    return value < 1n ? 1n : value;
  }

  /** 두루마리 값. 이 단계에서 쓸 수 없으면 null이다(파괴·하락이 없거나 유지가 10% 밑). */
  scroll(id: ScrollId, level: number, base: number, lukValue: number): Gold | null {
    const step = this.steps[level];
    if (!step || level >= LEVEL_MAX) return null;
    const sale = this.sale(level, base, lukValue);
    const atLeastOne = (value: bigint) => (value < 1n ? 1n : value);
    // 지켜 주거나 더해 주는 평균 값보다 10% 비싸게, 올림
    const ceil = (top: bigint, bottom: bigint) => (top + bottom - 1n) / bottom;
    if (id === 'guard') return step.destroy > 0 ? atLeastOne(ceil(BigInt(step.destroy) * sale * 11n, PPM * 10n)) : null;
    if (id === 'hold') {
      if (step.fall <= 0) return null;
      const below = this.sale(level - 1, base, lukValue);
      return atLeastOne(ceil(BigInt(step.fall) * (sale - below) * 11n, PPM * 10n));
    }
    if (step.keep < 100_000) return null;
    return atLeastOne(ceil((this.sale(level + 1, base, lukValue) - sale) * 11n, 100n));
  }

  /** 고른 두루마리를 넣은 도전 확률(백분율) */
  odds(level: number, scrolls: ReadonlySet<ScrollId>) {
    const step = this.steps[level];
    if (!step || level >= LEVEL_MAX) return null;
    let { success, keep, fall, destroy } = step;
    if (scrolls.has('boost') && keep >= 100_000) {
      success += 100_000;
      keep -= 100_000;
    }
    if (scrolls.has('hold')) {
      keep += fall;
      fall = 0;
    }
    if (scrolls.has('guard')) {
      keep += destroy;
      destroy = 0;
    }
    const pct = (ppm: number) => ppm / 10_000;
    return { success: pct(success), keep: pct(keep), fall: pct(fall), destroy: pct(destroy) };
  }
}
