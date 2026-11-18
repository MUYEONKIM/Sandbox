// 레벨 업 막대 애니메이션(2026-11-18 사용자 "레벨업이 단순히 숫자만 바뀌는게 아니라, 경험치칸 다 차고 레벨 1오르고 하는 애니메이션이 추가되어야 한다",
// 디자인 adventure-ui.md 15절, 시안 art-source/adventure/ui/levelup.ts를 옮김. 값은 모두 디자인 세션이 정함).
// 흐름: 막대가 끝까지 찬다 → 하얗게 번쩍이고 레벨 숫자가 1 오르며 튀어 오른다 → 막대가 비고 다시 찬다 … → 마지막은 지금 경험치 자리까지.
// 4 이상 오르면 첫 하나만 하나씩, 가운데는 빨리 돌리기(420ms), 마지막 하나를 다시 또렷이. 모두 1.2초를 넘지 않는다.
// 가벼움: 도는 동안만 requestAnimationFrame. 프레임마다 막대 transform(scaleX)과 번쩍임 opacity만 고치고, 숫자 글은 바뀔 때만 고친다.
// 레벨은 아주 커질 수 있어(모험 레벨 수십만, 마을 레벨) BigInt로 센다.
import { reducedMotion } from '../game/battleIntro';

export const LVUP = {
  /** 첫 막대가 지금 자리에서 끝까지 차는 시간(남은 몫에 비례, 최소 80ms) */
  firstFill: 220,
  /** 끝에 닿아 번쩍이고 숫자가 오르는 시간(이 동안 막대는 가득) */
  pop: 130,
  /** 하나씩 보일 때 빈 막대가 끝까지 차는 시간 */
  fill: 170,
  /** 마지막 막대가 0에서 지금 경험치까지 차는 시간(몫에 비례, 최소 60ms) */
  lastFill: 220,
  /** 이만큼까지는 하나씩 보인다. 넘으면 첫 하나 + 빨리 돌리기 + 마지막 하나 */
  oneByOne: 3,
  /** 빨리 돌리기 길이와 막대가 차는 횟수(레벨 수와 상관없이) */
  roll: 420,
  rollCycles: 5,
  /** 빨리 돌리기 동안 숫자를 고치는 간격(그 사이에는 그대로) */
  rollStep: 35,
  /** 전체 상한: 넘으면 모든 시간을 같은 비율로 줄인다 */
  cap: 1200,
};

interface Seg {
  t0: number;
  t1: number;
  kind: 'fill' | 'pop' | 'roll';
  from: number;
  to: number;
  level: bigint;
  /** 빨리 돌리기가 닿는 레벨 */
  levelTo: bigint;
}

export interface LevelPlan {
  segs: Seg[];
  total: number;
}

/** from 레벨 startPct(0~1)에서 to 레벨 endPct까지. 레벨이 안 오르면 막대만 찬다. */
export function levelPlan(from: bigint, to: bigint, startPct: number, endPct: number): LevelPlan {
  const segs: Seg[] = [];
  let t = 0;
  const push = (dur: number, s: Omit<Seg, 't0' | 't1' | 'levelTo'> & { levelTo?: bigint }) => {
    segs.push({ t0: t, t1: t + dur, levelTo: s.level, ...s });
    t += dur;
  };
  const n = to - from;
  if (n <= 0n) {
    push(Math.max(60, LVUP.lastFill * Math.abs(endPct - startPct)), { kind: 'fill', from: startPct, to: endPct, level: to });
    return { segs, total: t };
  }
  push(Math.max(80, LVUP.firstFill * (1 - startPct)), { kind: 'fill', from: startPct, to: 1, level: from });
  push(LVUP.pop, { kind: 'pop', from: 1, to: 1, level: from + 1n });
  if (n <= BigInt(LVUP.oneByOne)) {
    for (let L = from + 1n; L < to; L++) {
      push(LVUP.fill, { kind: 'fill', from: 0, to: 1, level: L });
      push(LVUP.pop, { kind: 'pop', from: 1, to: 1, level: L + 1n });
    }
  } else {
    // 가운데(from + 2 … to − 1)는 빨리 돌리기, 마지막 하나(to)는 다시 또렷이
    push(LVUP.roll, { kind: 'roll', from: 0, to: 1, level: from + 1n, levelTo: to - 1n });
    push(LVUP.pop, { kind: 'pop', from: 1, to: 1, level: to });
  }
  push(Math.max(60, LVUP.lastFill * endPct), { kind: 'fill', from: 0, to: endPct, level: to });
  if (t > LVUP.cap) {
    const k = LVUP.cap / t;
    for (const s of segs) {
      s.t0 *= k;
      s.t1 *= k;
    }
    t = LVUP.cap;
  }
  return { segs, total: t };
}

interface Frame {
  level: bigint;
  /** 막대 몫 0~1 */
  pct: number;
  /** 번쩍임 세기 0~1(번쩍·+1 동안 1 → 0) */
  flash: number;
  /** 지금 번쩍·+1이 시작된 시각(숫자 튀어 오름을 다시 걸 때) */
  popAt: number | null;
}

const easeOut = (u: number) => 1 - (1 - u) * (1 - u);

/** t(ms)의 모습 */
function frameAt(p: LevelPlan, t: number): Frame {
  const s = p.segs.find((x) => t < x.t1) ?? p.segs[p.segs.length - 1];
  const u = Math.min(1, Math.max(0, (t - s.t0) / Math.max(1, s.t1 - s.t0)));
  if (s.kind === 'fill') return { level: s.level, pct: s.from + (s.to - s.from) * easeOut(u), flash: 0, popAt: null };
  if (s.kind === 'pop') return { level: s.level, pct: 1, flash: 1 - u, popAt: s.t0 };
  // 빨리 돌리기: 막대는 rollCycles번 0→1, 숫자는 rollStep마다 ease-out으로 올라간다(많아야 12번 바뀜)
  const cyc = (u * LVUP.rollCycles) % 1;
  const steps = Math.floor((t - s.t0) / LVUP.rollStep);
  const allSteps = Math.max(1, Math.floor((s.t1 - s.t0) / LVUP.rollStep));
  const k = BigInt(Math.round(easeOut(Math.min(1, steps / allSteps)) * 4096));
  return { level: s.level + ((s.levelTo - s.level) * k) / 4096n, pct: cyc, flash: cyc < 0.15 ? 0.35 : 0, popAt: null };
}

/** 숫자 튀어 오름(흰 글자 + 연보라 빛, 1.22배 → 1배, 260ms). 시안 CSS lv-pop과 같은 키프레임이다. */
const POP_KEYS: Keyframe[] = [
  { offset: 0, color: '#ffffff', textShadow: '0 0 8px rgb(233 220 255 / 95%)', transform: 'scale(1)' },
  { offset: 0.35, color: '#ffffff', textShadow: '0 0 8px rgb(233 220 255 / 95%)', transform: 'scale(1.22)' },
  { offset: 1, transform: 'scale(1)' },
];
const POP_MS = 260;
const pops = new WeakMap<HTMLElement, Animation>();

/**
 * 숫자 튀어 오름을 처음부터 다시 건다. CSS 클래스를 다시 거는 것보다 Web Animations가 싸서(잰 값: 한 번에 약 1.6ms 대 4.8ms) 이것을 쓴다(에이전트가 정함).
 * 같은 요소에 돌고 있던 것은 멈춘다. 움직임 줄이기면 걸지 않는다.
 */
export function popLevel(el: HTMLElement) {
  if (reducedMotion() || typeof el.animate !== 'function') return;
  pops.get(el)?.cancel();
  pops.set(el, el.animate(POP_KEYS, { duration: POP_MS, easing: 'ease-out' }));
}

/** 잰 값(성능 확인용): 마지막 애니메이션의 계획 길이, 실제 길이(지연 빼고), 그린 프레임 수, 프레임마다 JS 시간 합과 가장 긴 것, 숫자를 고친 횟수 */
export const levelStats = { plan: 0, real: 0, frames: 0, ms: 0, maxMs: 0, texts: 0, skipped: false };

export interface LevelTarget {
  /** 레벨 숫자 글(정보 칸의 .lv-num) */
  label: HTMLElement;
  fmt: (level: bigint) => string;
}

export interface LevelPlayOptions {
  /** 이만큼 기다렸다가 시작한다(전투 배경이 걷히는 동안). 그동안은 앞 모습 그대로. */
  delay?: number;
  /** 도는 동안 누른 키를 다른 데로 넘기지 않는다(곧 레벨 업 스텟 창이 뜰 때) */
  swallowKeys?: boolean;
}

/**
 * 정보 칸 막대 하나(.exp 안의 .exp-fill과 .lv-flash). 애니메이션 밖에서는 막대 몫을 transform으로만 둔다(CSS transition 0.15s).
 * 도는 동안 키를 누르거나 화면을 누르면 곧바로 끝 모습으로 간다. 움직임 줄이기면 바로 끝 모습.
 */
export class LevelBar {
  private raf = 0;
  private timer = 0;
  private playing: {
    plan: LevelPlan;
    target: LevelTarget;
    to: bigint;
    end: number;
    shown: bigint;
    lastPop: number | null;
    started: number;
    resolve: () => void;
    done: Promise<void>;
    swallowKeys: boolean;
  } | null = null;
  /** 보이는 레벨이 바뀌거나(pop false) 튀어 오를 때(pop true). 머리 위 내 이름표를 같은 때에 맞춘다. 끝에는 늘 끝 레벨로 한 번 부른다. */
  onLevel: ((level: bigint, pop: boolean) => void) | null = null;

  constructor(
    private readonly box: HTMLElement,
    private readonly fill: HTMLElement,
    private readonly flash: HTMLElement,
  ) {}

  get running() {
    return this.playing !== null;
  }

  /** 끝날 때(건너뛰어도) 풀린다. 돌고 있지 않으면 바로 풀린다. */
  done() {
    return this.playing?.done ?? Promise.resolve();
  }

  /** 애니메이션 없이 막대 몫을 둔다(경험치만 늘면 CSS transition 0.15s로 늘어남). */
  set(ratio: number) {
    this.finish();
    this.fill.style.transform = `scaleX(${clamp(ratio).toFixed(4)})`;
  }

  /** from 레벨 startPct에서 to 레벨 endPct까지 돌린다. 부르는 쪽은 숫자 글을 고치지 않는다(여기서 고친다). */
  play(from: bigint, to: bigint, startPct: number, endPct: number, target: LevelTarget, options: LevelPlayOptions = {}) {
    this.finish();
    const plan = levelPlan(from, to, clamp(startPct), clamp(endPct));
    if (reducedMotion()) {
      target.label.textContent = target.fmt(to);
      this.fill.style.transform = `scaleX(${clamp(endPct).toFixed(4)})`;
      this.onLevel?.(to, false);
      return;
    }
    let resolve!: () => void;
    const done = new Promise<void>((r) => (resolve = r));
    this.playing = { plan, target, to, end: clamp(endPct), shown: from, lastPop: null, started: 0, resolve, done, swallowKeys: options.swallowKeys === true };
    Object.assign(levelStats, { plan: Math.round(plan.total), real: 0, frames: 0, ms: 0, maxMs: 0, texts: 0, skipped: false });
    target.label.textContent = target.fmt(from);
    this.fill.style.transform = `scaleX(${clamp(startPct).toFixed(4)})`;
    this.box.classList.add('lv-anim');
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('pointerdown', this.onPointer, true);
    const begin = () => {
      this.timer = 0;
      this.raf = requestAnimationFrame(this.step);
    };
    if (options.delay && options.delay > 0) this.timer = window.setTimeout(begin, options.delay);
    else begin();
  }

  /** 곧바로 끝 모습으로 간다(키, 화면 누름, 다음 전투, 다른 값으로 다시 그릴 때). */
  finish() {
    const p = this.playing;
    if (!p) return;
    levelStats.skipped = true;
    this.end(p);
  }

  private readonly step = (now: number) => {
    const p = this.playing;
    if (!p) return;
    const t0 = performance.now();
    if (!p.started) p.started = now;
    const t = now - p.started;
    if (t >= p.plan.total) {
      levelStats.real = Math.round(t);
      this.end(p);
      return;
    }
    this.apply(p, frameAt(p.plan, t));
    const ms = performance.now() - t0;
    levelStats.frames++;
    levelStats.ms += ms;
    if (ms > levelStats.maxMs) levelStats.maxMs = ms;
    this.raf = requestAnimationFrame(this.step);
  };

  private apply(p: NonNullable<LevelBar['playing']>, f: Frame) {
    this.fill.style.transform = `scaleX(${f.pct.toFixed(4)})`;
    this.flash.style.opacity = f.flash.toFixed(2);
    const changed = f.level !== p.shown;
    if (changed) {
      p.shown = f.level;
      p.target.label.textContent = p.target.fmt(f.level);
      levelStats.texts++;
    }
    const pop = f.popAt !== null && f.popAt !== p.lastPop;
    if (pop) {
      p.lastPop = f.popAt;
      popLevel(p.target.label);
    }
    if (changed || pop) this.onLevel?.(f.level, pop);
  }

  private end(p: NonNullable<LevelBar['playing']>) {
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.timer);
    this.raf = 0;
    this.timer = 0;
    this.playing = null;
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('pointerdown', this.onPointer, true);
    if (p.shown !== p.to) p.target.label.textContent = p.target.fmt(p.to);
    this.fill.style.transform = `scaleX(${p.end.toFixed(4)})`;
    this.flash.style.opacity = '0';
    this.box.classList.remove('lv-anim');
    this.onLevel?.(p.to, false);
    p.resolve();
  }

  private readonly onKey = (e: KeyboardEvent) => {
    // 누르고 있는 키가 저절로 되풀이되는 것(결과 줄을 닫은 방향 키 등)으로는 건너뛰지 않는다.
    if (e.repeat) return;
    if (this.playing?.swallowKeys) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
    this.finish();
  };

  private readonly onPointer = () => this.finish();
}

function clamp(v: number) {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}
