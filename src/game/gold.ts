import { formatLevel } from './level';

/**
 * 골드는 끝이 없어서(대장간 높은 단계 판매가가 10^42까지 감, 2026-11-15) BigInt로 다룬다.
 * 서버는 골드를 글자로 보낸다. 예전 서버나 작은 값은 숫자로 올 수도 있어서 둘 다 읽는다.
 */
export type Gold = bigint;

const DIGITS = /^(\d{1,1100})(?:\.0*)?$/;

/** 서버가 보낸 골드를 읽는다. 숫자(안전한 정수)든 글자("123", "123.000")든 받고, 그 밖은 null이다. */
export function parseGold(value: unknown): Gold | null {
  if (typeof value === 'bigint') return value >= 0n ? value : null;
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  if (typeof value !== 'string') return null;
  const match = DIGITS.exec(value);
  return match ? BigInt(match[1]) : null;
}

/** parseGold와 같지만 읽지 못하면 fallback을 돌려준다. */
export function toGold(value: unknown, fallback: Gold = 0n): Gold {
  return parseGold(value) ?? fallback;
}

/** 12만 3,456처럼 만·억·조·경 단위로 쓴다. 1만 밑은 1,234처럼 쓴다. short면 맨 위 단위만 쓴다. */
export function formatGold(gold: Gold | number, short = false) {
  const value = typeof gold === 'number' ? BigInt(Math.max(0, Math.round(gold))) : gold;
  return value < 0n ? `-${formatLevel(-value, short)}` : formatLevel(value, short);
}

/** "12만 3,456G" */
export function goldText(gold: Gold | number, short = false) {
  return `${formatGold(gold, short)}G`;
}

/** 값(number)이 지금 골드로 살 수 있는 만큼인지. 값은 작은 표 값이라 number로 온다. */
export function canAfford(gold: Gold, price: number | Gold) {
  return gold >= (typeof price === 'bigint' ? price : BigInt(Math.ceil(price)));
}

/** 화면에 숫자로만 쓰는 곳(작은 값 계산)에 넘길 때. 9,007조를 넘으면 정확하지 않다. */
export function goldNumber(gold: Gold) {
  return Number(gold);
}
