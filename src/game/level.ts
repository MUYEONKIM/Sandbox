/**
 * 게임에 보이는 큰 수(레벨, 경험치, 골드, 금화, HP, 피해, 값)를 줄이지 않고 쉼표를 넣어 쓰는 하나뿐인 함수(1.5만 → 15,000, +498만 → +4,980,000).
 * 2026-11-18 사용자 "몬스터 레벨 표기를 1.5만 이렇게 하지말고, Lv. 15,000 이렇게 표기로 해줘. 경험치, 골드 hp, 피해등도 다 마찬가지이다."
 * 레벨·골드는 끝이 없어서 BigInt로 받는다. 포맷터는 하나를 만들어 두고 다시 쓴다(숫자 오르기가 매 프레임 부르므로, toLocaleString은 부를 때마다 새로 만듦).
 * 10^24 이상(25자리 이상, 대장간 아주 높은 단계 판매가 등)은 너무 길어 "1.23×10^42"처럼 쓴다(에이전트가 정함).
 */
const NUMBER = new Intl.NumberFormat('ko-KR');
const HUGE = 10n ** 24n;

/** 너무 큰 수는 지수로 쓴다. */
function scientific(n: bigint) {
  const digits = n.toString();
  return `${digits[0]}.${digits.slice(1, 3)}×10^${digits.length - 1}`;
}

/** 15,000처럼 쓴다. number는 소수점 아래를 버린다. */
export function formatNumber(value: bigint | number): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return String(value);
    const whole = Math.trunc(value);
    if (Math.abs(whole) < 1e21) return NUMBER.format(whole);
    value = BigInt(whole);
  }
  if (value >= HUGE) return scientific(value);
  if (value <= -HUGE) return `-${scientific(-value)}`;
  return NUMBER.format(value);
}

/** 다른 사람이 보낸 레벨 문자열을 믿지 않고 형식을 확인한다. */
export function parseLevel(value: unknown): bigint | null {
  return typeof value === 'string' && /^[1-9]\d{0,20000}$/.test(value) ? BigInt(value) : null;
}

/** 레벨 level에서 다음 레벨까지 필요한 경험치. 서버의 `level_need`와 같아야 한다. */
export function levelNeed(level: bigint) {
  return 100 * Number(level);
}
