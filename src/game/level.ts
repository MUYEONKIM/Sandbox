/** 레벨은 끝이 없어서 BigInt로 다루고, 한국어 큰 수 단위로 보여 준다. */
const UNITS = [
  '',
  '만',
  '억',
  '조',
  '경',
  '해',
  '자',
  '양',
  '구',
  '간',
  '정',
  '재',
  '극',
  '항하사',
  '아승기',
  '나유타',
  '불가사의',
  '무량대수',
];

const UNIT_SIZE = 10000n;

/** 네 자리씩 끊은 묶음. 낮은 자리부터 담는다. */
function groups(level: bigint) {
  const parts: bigint[] = [];
  for (let rest = level; rest > 0n; rest /= UNIT_SIZE) parts.push(rest % UNIT_SIZE);
  return parts;
}

/** 무량대수까지 넘어가면 단위가 없어서 지수로 쓴다. */
function scientific(level: bigint) {
  const digits = level.toString();
  return `${digits[0]}.${digits.slice(1, 3)}×10^${digits.length - 1}`;
}

/** 12조 3,456억처럼 위의 두 단위를 보여 준다. short면 맨 위 단위만 쓴다. */
export function formatLevel(level: bigint, short = false) {
  if (level < UNIT_SIZE) return level.toLocaleString();
  const parts = groups(level);
  const top = parts.length - 1;
  if (top >= UNITS.length) return scientific(level);

  const head = `${parts[top].toLocaleString()}${UNITS[top]}`;
  const next = parts[top - 1];
  return short || next === 0n ? head : `${head} ${next.toLocaleString()}${UNITS[top - 1]}`;
}

/** 다른 사람이 보낸 레벨 문자열을 믿지 않고 형식을 확인한다. */
export function parseLevel(value: unknown): bigint | null {
  return typeof value === 'string' && /^[1-9]\d{0,20000}$/.test(value) ? BigInt(value) : null;
}

/** 레벨 level에서 다음 레벨까지 필요한 경험치. 서버의 `level_need`와 같아야 한다. */
export function levelNeed(level: bigint) {
  return 100 * Number(level);
}
