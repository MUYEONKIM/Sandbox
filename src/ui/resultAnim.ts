// 전투 결과 칸 2판 애니메이션(2026-11-18 사용자: "레벨이 지금처럼 경험치 바가 차면서 숫자가 오르는게 맞다. … 경험치 + xx만, lv 312 -> 412,
// 포인트 + 991 이런것들은 다 뺀다. 담백하게 경험치바, 현재 경험치/레벨업에 필요한 경험치 와 레벨만 존재하고, 들어온 경험치 숫자가 줄어드는게
// 보이면서 경험치가 차는 애니메이션이다. 그리고 레벨업1 마다 레벨에 Level up 하면서 효과가 계속 뜬다. 그리고 얻은 무기는 하단에 무기 사진과
// 별(몇성인지)이 같이 뜬다." 디자인 adventure-ui.md 18절, 시안 art-source/adventure/ui/resultanim.ts를 BigInt로 옮김. 값은 디자인 세션이 정함).
//
// 결과 칸(이김): [Lv 312] ······ [+498만] / 보라 막대 / "EXP 47만 / 78.3만" / 얻은 무기 그림 + 별
// - 막대가 차고 → 번쩍(흰 겹)·레벨 숫자 +1 튐 → "Level up"이 레벨 위로 떠올랐다 사라짐 → 막대가 비고 다시 참. 마지막은 지금 경험치까지.
// - 처음 다섯 레벨은 하나씩 점점 빨라지고(300, 240, 190, 150, 120ms), 그 뒤는 몰아치기(50ms마다 막대 한 번 + Level up, 많아야 16번 0.8초).
// - 들어온 경험치는 애니메이션 시간에 고르게 줄어 0이 되고 사라진다. 끝나면 무기가 하나씩 튀어 나온다.
// 가벼움: 애니메이션 동안만 rAF. 프레임마다 막대 transform·번쩍 opacity와 바뀐 글자만 고친다. Level up과 무기는 CSS 애니메이션(많아야 21개, 끝나면 지움).
import { reducedMotion } from '../game/battleIntro';
import { popLevel } from './levelUpAnim';
import { sound } from '../sound/engine';

export const RES = {
  /** 처음 다섯 레벨의 한 레벨 길이(차기 + 번쩍·+1). 여섯째부터는 몰아치기 */
  intro: [300, 240, 190, 150, 120],
  /** 한 레벨 길이 가운데 끝 번쩍·+1의 몫 */
  popShare: 0.35,
  /** 첫 레벨: 지금 자리에서 끝까지(남은 몫에 비례, 최소) */
  firstMin: 90,
  /** 몰아치기: 한 번(막대가 한 번 참 + Level up) 길이와 최대 길이(넘으면 한 번에 여러 레벨씩) */
  rushTick: 50,
  rushMax: 800,
  /** 마지막: 0에서 지금 경험치까지(몫에 비례, 최소 60) */
  lastFill: 220,
  /** 레벨이 안 오를 때: 지금 자리에서 새 자리까지 */
  noLevel: 260,
  /** 끝난 뒤 무기 튀어 나오기(하나에 160ms, 60ms씩 엇갈림)와 닫히기까지 */
  dropPop: 160,
  dropStagger: 60,
  closeAfter: 500,
};

interface Seg {
  t0: number;
  t1: number;
  kind: 'fill' | 'pop' | 'rush';
  from: number;
  to: number;
  level: bigint;
  levelTo: bigint;
  ticks: number;
}

export interface ResPlan {
  segs: Seg[];
  total: number;
  /** Level up이 뜨는 때(ms) */
  ups: number[];
}

/** from 레벨 startPct(0~1)에서 to 레벨 endPct까지의 계획 */
export function planResult(from: bigint, to: bigint, startPct: number, endPct: number): ResPlan {
  const segs: Seg[] = [];
  const ups: number[] = [];
  let t = 0;
  const push = (dur: number, s: { kind: Seg['kind']; from: number; to: number; level: bigint; levelTo?: bigint; ticks?: number }) => {
    segs.push({ t0: t, t1: t + dur, levelTo: s.level, ticks: 0, ...s });
    t += dur;
  };
  const n = to - from;
  if (n <= 0n) {
    push(RES.noLevel, { kind: 'fill', from: startPct, to: endPct, level: to });
    return { segs, total: t, ups };
  }
  const intro = Number(n < BigInt(RES.intro.length) ? n : BigInt(RES.intro.length));
  for (let i = 0; i < intro; i++) {
    const d = RES.intro[i];
    const fillD = d * (1 - RES.popShare);
    push(i === 0 ? Math.max(RES.firstMin, fillD * (1 - startPct)) : fillD, { kind: 'fill', from: i === 0 ? startPct : 0, to: 1, level: from + BigInt(i) });
    ups.push(t);
    push(d * RES.popShare, { kind: 'pop', from: 1, to: 1, level: from + BigInt(i + 1) });
  }
  const rest = n - BigInt(intro);
  if (rest > 0n) {
    const most = BigInt(Math.floor(RES.rushMax / RES.rushTick));
    const ticks = Number(rest < most ? rest : most);
    for (let k = 1; k <= ticks; k++) ups.push(t + k * RES.rushTick - 1);
    push(ticks * RES.rushTick, { kind: 'rush', from: 0, to: 1, level: from + BigInt(intro), levelTo: to, ticks });
  }
  push(Math.max(60, RES.lastFill * endPct), { kind: 'fill', from: 0, to: endPct, level: to });
  return { segs, total: t, ups };
}

interface ResFrame {
  level: bigint;
  pct: number;
  flash: number;
  /** 들어온 경험치 가운데 아직 남은 몫(1 → 0, 시간에 고르게) */
  drain: number;
}

const easeOut = (u: number) => 1 - (1 - u) * (1 - u);

function frameAt(p: ResPlan, t: number): ResFrame {
  const drain = Math.max(0, 1 - t / p.total);
  const s = p.segs.find((x) => t < x.t1) ?? p.segs[p.segs.length - 1];
  const u = Math.min(1, Math.max(0, (t - s.t0) / Math.max(1, s.t1 - s.t0)));
  if (s.kind === 'fill') return { level: s.level, pct: s.from + (s.to - s.from) * easeOut(u), flash: 0, drain };
  if (s.kind === 'pop') return { level: s.level, pct: 1, flash: 1 - u, drain };
  // 몰아치기: ticks번 막대가 0→1, 한 번 끝날 때마다 레벨이 고르게 올라 마지막에 levelTo
  const k = Math.min(s.ticks, Math.floor(u * s.ticks));
  const within = u * s.ticks - Math.floor(u * s.ticks);
  const level = s.level + ((s.levelTo - s.level) * BigInt(k)) / BigInt(s.ticks);
  return { level, pct: within, flash: within < 0.25 ? 0.5 : 0, drain };
}

/** 몫(0~1)만큼의 큰 수 */
function part(n: bigint, share: number) {
  return (n * BigInt(Math.round(Math.min(1, Math.max(0, share)) * 1_000_000))) / 1_000_000n;
}

export interface ResEls {
  /** 레벨 숫자(Lv 뒤) */
  level: HTMLElement;
  /** Level up이 떠오를 자리(레벨 글자 둘레) */
  upLayer: HTMLElement;
  fill: HTMLElement;
  flash: HTMLElement;
  /** 들어온 경험치(+498만) */
  gain: HTMLElement;
  /** EXP 지금 / 필요 */
  exp: HTMLElement;
  /** 얻은 무기 칸들(처음엔 숨김, 끝에 하나씩) */
  drops: HTMLElement[];
}

export interface ResValues {
  from: bigint;
  to: bigint;
  /** 전투 전 판 경험치(쌓인 값) */
  expBefore: bigint;
  /** 들어온 경험치 */
  gained: bigint;
  /** 레벨 글(bigText) */
  levelText: (n: bigint) => string;
  /** 경험치 글(만·억 소수 한 자리) */
  numText: (n: bigint) => string;
}

/** 판 레벨 L의 한 칸(다음 레벨까지 필요한 경험치)과 L에 닿는 경험치(서버 adventure_battle, levelFromExp) */
const needOf = (L: bigint) => 100n * (L < 1n ? 1n : L);
const baseOf = (L: bigint) => 50n * L * (L - 1n);

/** 지금 칸 안의 경험치(0~한 칸) */
function inLevel(L: bigint, exp: bigint) {
  const cur = exp - baseOf(L);
  const need = needOf(L);
  return cur < 0n ? 0n : cur > need ? need : cur;
}

/** 잰 값(성능 확인용): 마지막 결과 칸의 계획 길이, 실제 길이(무기까지), 프레임 수, 프레임마다 JS 시간 합과 가장 긴 것, 글을 고친 횟수, Level up 수 */
export const resultStats = { plan: 0, real: 0, frames: 0, ms: 0, maxMs: 0, texts: 0, ups: 0, skipped: false };

export interface ResultAnim {
  /** 무기까지 다 나온 때(건너뛰어도) 풀린다. 닫기는 그 뒤 RES.closeAfter */
  done: Promise<void>;
  /** 아직 도는 중인지 */
  readonly running: boolean;
  /** 곧바로 끝 모습(무기까지) */
  finish(): void;
}

/** 결과 칸을 처음 모습으로 두고(레벨, 들어온 경험치, 막대, EXP) 애니메이션을 돌린다. 움직임 줄이기면 바로 끝 모습. */
export function playResult(el: ResEls, v: ResValues): ResultAnim {
  const t0 = performance.now();
  const expAfter = v.expBefore + v.gained;
  const startPct = Number((inLevel(v.from, v.expBefore) * 10000n) / needOf(v.from)) / 10000;
  const endPct = Number((inLevel(v.to, expAfter) * 10000n) / needOf(v.to)) / 10000;
  const plan = planResult(v.from, v.to, startPct, endPct);
  const quiet = reducedMotion();
  Object.assign(resultStats, { plan: Math.round(plan.total), real: 0, frames: 0, ms: 0, maxMs: 0, texts: 0, ups: 0, skipped: false });
  const shown = { level: -1n, gain: '', exp: '' };
  const setText = (e: HTMLElement, text: string, key: 'gain' | 'exp') => {
    if (shown[key] === text) return;
    shown[key] = text;
    e.textContent = text;
    resultStats.texts++;
  };
  const apply = (f: ResFrame) => {
    el.fill.style.transform = `scaleX(${f.pct.toFixed(4)})`;
    el.flash.style.opacity = f.flash.toFixed(2);
    if (f.level !== shown.level) {
      shown.level = f.level;
      el.level.textContent = v.levelText(f.level);
      resultStats.texts++;
    }
    // 남은 들어온 경험치가 0이 되면 글을 지운다(아주 작게 들어오면 "+0"이 보이지 않게)
    const left = f.drain > 0 ? part(v.gained, f.drain) : 0n;
    setText(el.gain, left > 0n ? `+${v.numText(left)}` : '', 'gain');
    const need = needOf(f.level);
    setText(el.exp, `EXP ${v.numText(part(need, f.pct))} / ${v.numText(need)}`, 'exp');
  };
  /** 끝 모습: 정확한 경험치 값(막대 몫으로 어림하지 않음) */
  const applyEnd = () => {
    apply(frameAt(plan, plan.total));
    el.flash.style.opacity = '0';
    setText(el.gain, '', 'gain');
    const need = needOf(v.to);
    setText(el.exp, `EXP ${v.numText(inLevel(v.to, expAfter))} / ${v.numText(need)}`, 'exp');
  };
  let upIdx = 0;
  const levelUp = (quick: boolean) => {
    popLevel(el.level);
    // 눈금마다 조금씩 높게(sound-plan.md 3-4: 1 + 0.04 × n). 몰아치기는 눈금이 많아 2배에서 멈춘다(에이전트가 정함).
    sound.play('level_tick', { rate: Math.min(2, 1 + upIdx * 0.04) });
    const tag = document.createElement('span');
    tag.className = quick ? 'lvup-tag quick' : 'lvup-tag';
    tag.textContent = 'Level up';
    // 몰아치기에서는 짧게(0.35초) 뜨고 다섯 자리(−32 ~ +32px)를 돌아가며 옆으로 퍼져 겹쳐 쌓이지 않는다
    tag.style.setProperty('--dx', quick ? `${(((upIdx * 2) % 5) - 2) * 16}px` : '0px');
    tag.addEventListener('animationend', () => tag.remove());
    el.upLayer.appendChild(tag);
    upIdx++;
    resultStats.ups++;
  };
  const showDrops = (animate: boolean) =>
    el.drops.forEach((d, i) => {
      if (animate) {
        d.style.animationDelay = `${i * RES.dropStagger}ms`;
        d.classList.add('show');
        window.setTimeout(() => sound.play('item_drop'), i * RES.dropStagger);
      } else {
        d.classList.remove('show');
        d.classList.add('shown');
      }
    });

  let running = true;
  let raf = 0;
  let timer = 0;
  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  const end = (skipped: boolean) => {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    applyEnd();
    resultStats.skipped = skipped;
    if (skipped || quiet) {
      // 건너뛰면 Level up 띠를 지우고 무기는 바로 보인다.
      el.upLayer.replaceChildren();
      showDrops(false);
      window.clearTimeout(timer);
      resultStats.real = Math.round(performance.now() - t0);
      resolve();
      return;
    }
    showDrops(true);
    timer = window.setTimeout(() => {
      resultStats.real = Math.round(performance.now() - t0);
      resolve();
    }, el.drops.length ? RES.dropPop + RES.dropStagger * (el.drops.length - 1) : 0);
  };

  apply(frameAt(plan, 0));
  if (quiet) {
    end(false);
  } else {
    let start = 0;
    let nextUp = 0;
    const step = (now: number) => {
      // 눌러서 끝 모습으로 멈췄으면(finish) 더 그리지 않는다(프레임 취소가 늦어도 레벨이 다시 움직이지 않게).
      if (!running) return;
      const c0 = performance.now();
      if (!start) start = now;
      const t = now - start;
      if (t >= plan.total) {
        end(false);
        return;
      }
      apply(frameAt(plan, t));
      while (nextUp < plan.ups.length && plan.ups[nextUp] <= t) {
        levelUp(nextUp >= RES.intro.length);
        nextUp++;
      }
      const spent = performance.now() - c0;
      resultStats.frames++;
      resultStats.ms += spent;
      if (spent > resultStats.maxMs) resultStats.maxMs = spent;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
  return {
    done,
    get running() {
      return running;
    },
    finish: () => end(true),
  };
}

