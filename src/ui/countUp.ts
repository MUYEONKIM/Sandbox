// 숫자 오르기(2026-11-18 사용자 "숫자 오르는 애니메이션은 골드도 마찬가지이다", "전투가 끝나고 밑에 골드 얼마, 경험치 얼마, 레벨업 얼마
// 이렇게 뜨는게 아니라 애니메이션으로 올라가는 숫자가 보인다", 디자인 adventure-ui.md 16절, 시안 art-source/adventure/ui/countup.ts를 옮김).
// 여러 숫자가 같은 시계로 앞 값(또는 0)에서 끝 값까지 ease-out으로 오르고, 끝나면 한 번 튄다(1.08배 + 금빛 테 빛, 180ms).
// 가벼움: 오르는 동안만 requestAnimationFrame. 프레임마다 글자가 바뀐 칸만 textContent를 고친다.
// 시작 전에 끝 값 글자로 폭을 한 번 재서 min-width로 잡아 둔다(오르는 동안 폭이 흔들려 줄이 다시 배치되지 않게). 큰 수라 BigInt로 센다.
import { reducedMotion } from '../game/battleIntro';

export const COUNT = {
  /** 전투 결과 줄: 함께 오르는 시간(결과 줄 1.2초 안에 끝나고 남은 시간 동안 끝 값을 읽게) */
  result: 450,
  /** 마을 일·노동, 모험 금화: 막대 애니메이션과 같이 */
  gold: 450,
  /** 마을로 돌아갈 때 계정 줄 골드 G, 모험 결과 화면 줄들 */
  village: 600,
  /** 끝난 뒤 튀어 오름 */
  pop: 180,
};

export interface Counter {
  el: HTMLElement;
  from: bigint;
  to: bigint;
  /** 글자 만들기(앞뒤 말 포함, 예: n => `경험치 +${bigText(n)}`) */
  fmt: (n: bigint) => string;
}

export interface CountOptions {
  /** 끝 값 폭으로 min-width를 잡는다(칩·골드처럼 폭이 글자를 따라가는 칸). 끝나면 푼다. */
  lockWidth?: boolean;
  /** 끝나면 한 번 튄다 */
  pop?: boolean;
}

export interface Counting {
  done: Promise<void>;
  /** 곧바로 끝 값으로(튀지 않음) */
  finish: () => void;
}

/** 잰 값(성능 확인용): 마지막 오르기의 실제 길이, 프레임 수, 프레임마다 JS 시간 합과 가장 긴 것, 글자를 고친 횟수, 폭 잡기 시간 */
export const countStats = { real: 0, frames: 0, ms: 0, maxMs: 0, texts: 0, lockMs: 0 };

const easeOut = (u: number) => 1 - (1 - u) ** 3;
const SCALE = 1_000_000;

/** u(0~1)일 때 from → to 사이 값 */
function between(from: bigint, to: bigint, u: number) {
  return from + ((to - from) * BigInt(Math.round(easeOut(u) * SCALE))) / BigInt(SCALE);
}

/** 튀어 오름(시안 CSS num-pop과 같은 키프레임). 레벨 숫자처럼 Web Animations로 건다(CSS 클래스를 다시 거는 것보다 쌈). */
const POP_KEYS: Keyframe[] = [
  { offset: 0, transform: 'scale(1)' },
  { offset: 0.45, transform: 'scale(1.08)', boxShadow: '0 0 0 1px rgb(242 207 106 / 80%), 0 0 6px rgb(242 207 106 / 70%)' },
  { offset: 1, transform: 'scale(1)' },
];

export function popNumber(el: HTMLElement) {
  if (reducedMotion() || typeof el.animate !== 'function') return;
  el.animate(POP_KEYS, { duration: COUNT.pop, easing: 'ease-out' });
}

/** 숫자 여럿을 함께 올린다. 움직임 줄이기면 곧바로 끝 값이다. 칸이 모두 화면에서 빠지면(창을 닫음) 멈춘다. */
export function countUp(items: Counter[], ms: number, options: CountOptions = {}): Counting {
  const ends = items.map((it) => it.fmt(it.to));
  if (reducedMotion() || ms <= 0 || items.length === 0) {
    items.forEach((it, i) => {
      if (it.el.textContent !== ends[i]) it.el.textContent = ends[i];
    });
    return { done: Promise.resolve(), finish: () => {} };
  }
  if (options.lockWidth) {
    // 끝 글자를 모두 넣고 → 한 번에 재고 → min-width를 건 뒤 → 처음 글자로(배치는 한 번만)
    const t0 = performance.now();
    items.forEach((it, i) => (it.el.textContent = ends[i]));
    const widths = items.map((it) => it.el.getBoundingClientRect().width);
    // 잰 폭 그대로(올리면 끝에 min-width를 풀 때 1px 줄어든다)
    items.forEach((it, i) => (it.el.style.minWidth = `${widths[i]}px`));
    countStats.lockMs = performance.now() - t0;
  }
  const shown = items.map((it) => it.fmt(it.from));
  items.forEach((it, i) => (it.el.textContent = shown[i]));
  Object.assign(countStats, { real: 0, frames: 0, ms: 0, maxMs: 0, texts: 0 });
  let raf = 0;
  let over = false;
  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  const end = (pop: boolean) => {
    if (over) return;
    over = true;
    cancelAnimationFrame(raf);
    items.forEach((it, i) => {
      if (shown[i] !== ends[i]) it.el.textContent = ends[i];
      if (options.lockWidth) it.el.style.minWidth = '';
      if (pop && options.pop) popNumber(it.el);
    });
    resolve();
  };
  let start = 0;
  const step = (now: number) => {
    const t0 = performance.now();
    if (!start) start = now;
    const u = (now - start) / ms;
    if (u >= 1) {
      countStats.real = Math.round(now - start);
      end(true);
      return;
    }
    if (!items.some((it) => it.el.isConnected)) {
      end(false);
      return;
    }
    items.forEach((it, i) => {
      const s = it.fmt(between(it.from, it.to, u));
      if (s !== shown[i]) {
        shown[i] = s;
        it.el.textContent = s;
        countStats.texts++;
      }
    });
    const spent = performance.now() - t0;
    countStats.frames++;
    countStats.ms += spent;
    if (spent > countStats.maxMs) countStats.maxMs = spent;
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return { done, finish: () => end(false) };
}

/** 글자로 온 큰 수(서버 값)를 BigInt로. 이상하면 0 */
export function bigOf(value: string | number | bigint) {
  try {
    return typeof value === 'bigint' ? value : BigInt(typeof value === 'number' ? Math.floor(Math.max(0, value)) : value);
  } catch {
    return 0n;
  }
}
