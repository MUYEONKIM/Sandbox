import type Phaser from 'phaser';
import type { MonsterRole } from './adventureMaps';

/**
 * 모험 전투 들어가기 소용돌이와 전투 창 뒤 배경(2026-11-18, 디자인 세션 adventure-battle-fx.md 1장, 참고 구현 art-source/adventure/ui/swirl.ts).
 * 사용자: "전투 진입해서 모달창 뒤편의 배경은 기존 캐릭터 있던 맵에 살짝 노이즈 껴서 보인다."
 * 흐름: 싸움을 거는 순간(다음 Phaser 프레임의 postrender) 필드 화면을 한 번만 찍고 Phaser 루프를 재운다.
 *   1) 감기: 찍은 그림(화면 ÷ 4)을 몬스터 둘레로 시계 방향으로 비틀며 확대한다.
 *   2) 풀기: 비틀림과 확대가 풀리며 '노이즈 낀 원래 화면'으로 바뀐다. 끝 그림이 곧 배경이다.
 *   3) 소용돌이 캔버스를 배경(화면 ÷ 2 캔버스 + CSS filter + 가장자리 어둠 + 노이즈 층)으로 바꾸고, 전투 창이 그 위에 120ms 동안 나타난다.
 *   4) 전투 창이 닫히면 배경을 150ms 동안 걷어 실제 필드로 돌아간다(leave).
 * 가벼움: 필드는 한 번만 읽는다. 배경은 ÷ 2 캔버스에 drawImage만(픽셀을 읽지 않음), 색 빼기·어둡게는 CSS filter다.
 *   소용돌이는 그 ÷ 2 그림을 GPU 캔버스에서 다시 ÷ 4로 줄여 작은 그림만 읽는다. 움직이는 노이즈는 CSS transform으로 자리만 옮긴다.
 *   움직임 줄이기 설정이거나 소용돌이 준비가 50ms를 넘는 기기는 소용돌이 없이 150ms 동안 배경으로 바뀌기만 한다.
 * 길이·세기·배경 값은 디자인이 정함. 덮개 자리(HUD까지 덮음), 픽셀 옮기기(감기는 32비트로 한 번에)는 에이전트가 정함.
 */

export type SwirlKind = 'normal' | 'repeat' | 'boss';

interface SwirlSpec {
  /** 길이(ms): 감기 + 풀기 */
  ms: number;
  /** 감기가 차지하는 몫(0~1). 나머지가 풀기 */
  inFrac: number;
  /** 가운데에서 가장 많이 비틀 때 몇 바퀴 */
  turns: number;
  /** 가장 많이 확대할 때(1 = 그대로) */
  zoom: number;
}

export const SWIRL: Record<SwirlKind, SwirlSpec> = {
  // 처음 싸울 때(또는 마지막 전투 창이 닫히고 3초 넘게 지났을 때): 248 + 152ms
  normal: { ms: 400, inFrac: 0.62, turns: 1.1, zoom: 1.3 },
  // 마지막 전투 창이 닫히고 3초 안에 또 싸울 때: 120 + 80ms
  repeat: { ms: 200, inFrac: 0.6, turns: 0.5, zoom: 1.15 },
  // 중간 보스와 보스: 372 + 228ms, 배경이 검붉다
  boss: { ms: 600, inFrac: 0.62, turns: 1.8, zoom: 1.45 },
};

/** 전투 창 뒤 배경: 색을 조금 빼고(sat), 어둡게(dim), 가장자리 어둠(vignette), 멈춘 노이즈(grainStill), 보스는 붉은 기(tint) */
interface BackdropSpec {
  sat: number;
  dim: number;
  grainStill: number;
  vignette: number;
  tint?: [number, number, number, number];
}
const BACKDROP: Record<'normal' | 'boss', BackdropSpec> = {
  normal: { sat: 0.6, dim: 0.72, grainStill: 0.1, vignette: 0.35 },
  boss: { sat: 0.45, dim: 0.62, grainStill: 0.13, vignette: 0.45, tint: [96, 16, 12, 0.22] },
};
/** 움직이는 노이즈 한 겹: 128px 흑백 타일을 2배로, 불투명도. 자리는 CSS 애니메이션(1초에 10번, adv-grain)으로 옮긴다. */
const GRAIN = { tile: 128, opacity: 0.07 };

/** 마지막 전투 창이 닫힌 뒤 이 시간 안에 다시 싸우면 짧은 소용돌이 */
export const REPEAT_WITHIN_MS = 3000;
/** 움직임 줄이기(또는 느린 기기)면 이 시간 동안 배경으로 바뀌기만 한다. */
const REDUCED_MS = 150;
/** 배경을 걷는 시간(전투 창이 닫힐 때, 요청이 실패했을 때) */
export const LEAVE_MS = 150;
/** 배경은 화면 ÷ 2(가로 960 이하), 소용돌이는 화면 ÷ 4(가로 480 이하) */
const BACK_MAX_W = 960;
const SWIRL_MAX_W = 480;
/** 소용돌이 준비(작은 그림 읽기 + 표 만들기)가 이보다 오래 걸리면 다음부터 소용돌이 없이 바꾸기만 한다(디자인 제안). */
const SLOW_SETUP_MS = 50;
/** postrender를 이만큼 기다려도 오지 않으면(루프가 멈춘 때) 찍지 않고 바꾸기만 한다. */
const CAPTURE_WAIT_MS = 250;

const LUT = 1024;
const COS = new Float32Array(LUT);
const SIN = new Float32Array(LUT);
for (let i = 0; i < LUT; i++) {
  COS[i] = Math.cos((i / LUT) * Math.PI * 2);
  SIN[i] = Math.sin((i / LUT) * Math.PI * 2);
}
const smooth = (u: number) => {
  const v = Math.min(1, Math.max(0, u));
  return v * v * (3 - 2 * v);
};

/** 잰 값(성능 확인용): 찍은 횟수와 배경 찍기·소용돌이 준비 시간 합, 그린 프레임 수와 시간 합, 마지막 크기, 느린 기기로 본 적 */
export const introStats = { captures: 0, backMs: 0, setupMs: 0, frames: 0, drawMs: 0, w: 0, h: 0, slow: false };

export function reducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 어느 소용돌이를 쓸지: 보스·중간 보스는 boss, 마지막 전투 창이 닫히고 3초 안이면 repeat, 아니면 normal */
export function swirlKind(role: MonsterRole, lastClosedAt: number, now = performance.now()): SwirlKind {
  if (role !== 'normal') return 'boss';
  return now - lastClosedAt < REPEAT_WITHIN_MS ? 'repeat' : 'normal';
}

/** 움직이는·멈춘 노이즈 타일(처음 한 번 만든다): 흑백 알파 노이즈, CSS 배경으로 2배로 깐다. */
let grainUrl: string | null = null;
function grainTile() {
  if (grainUrl) return grainUrl;
  const size = GRAIN.tile;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = Math.random() < 0.5 ? 0 : 255;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = Math.floor(Math.random() * 255);
  }
  g.putImageData(img, 0, 0);
  grainUrl = c.toDataURL('image/png');
  return grainUrl;
}

/** 배경(한 번 찍는다): 필드 화면을 화면 ÷ 2 캔버스에 줄여 그리기만 한다. */
function shootBackdrop(field: HTMLCanvasElement) {
  const W = field.width;
  const H = field.height;
  const down = Math.max(2, Math.ceil(W / BACK_MAX_W));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(W / down));
  cv.height = Math.max(1, Math.ceil(H / down));
  const g = cv.getContext('2d')!;
  g.imageSmoothingEnabled = true;
  g.drawImage(field, 0, 0, W, H, 0, 0, cv.width, cv.height);
  return cv;
}

/** 배경 층들: 찍은 그림(CSS filter) → 가장자리 어둠 → (보스) 붉은 기 → 멈춘 노이즈 → 움직이는 노이즈 */
function backdropElement(shot: HTMLCanvasElement, spec: BackdropSpec) {
  const box = document.createElement('div');
  box.className = 'adv-backdrop';
  shot.style.cssText = `filter: saturate(${spec.sat}) brightness(${spec.dim}); image-rendering: pixelated; width: 100%; height: 100%;`;
  box.append(shot);
  const layer = (css: string, cls = '') => {
    const el = document.createElement('div');
    if (cls) el.className = cls;
    el.style.cssText = css;
    box.append(el);
  };
  const grain = grainTile();
  const tile = GRAIN.tile * 2;
  layer(`background: radial-gradient(ellipse at center, transparent 40%, rgb(0 0 0 / ${Math.round(spec.vignette * 100)}%) 100%);`);
  if (spec.tint) layer(`background: rgb(${spec.tint[0]} ${spec.tint[1]} ${spec.tint[2]} / ${Math.round(spec.tint[3] * 100)}%);`);
  layer(`background: url(${grain}) 0 0 / ${tile}px; image-rendering: pixelated; opacity: ${spec.grainStill};`);
  layer(`inset: -128px; background: url(${grain}) 0 0 / ${tile}px; image-rendering: pixelated; opacity: ${GRAIN.opacity};`, 'grain');
  return box;
}

/** ÷ 4 그림에 배경 사양을 픽셀로(풀기의 끝 그림). 화면의 배경 층들과 거의 같다. */
function processed(src: Uint8ClampedArray, w: number, h: number, spec: BackdropSpec) {
  const p = new Uint8ClampedArray(src.length);
  const [tr, tg, tb, ta] = spec.tint ?? [0, 0, 0, 0];
  const cx = w / 2;
  const cy = h / 2;
  let seed = 0x9e3779b9;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let r = src[i];
      let g = src[i + 1];
      let b = src[i + 2];
      const l = 0.3 * r + 0.59 * g + 0.11 * b;
      r = (l + (r - l) * spec.sat) * spec.dim;
      g = (l + (g - l) * spec.sat) * spec.dim;
      b = (l + (b - l) * spec.sat) * spec.dim;
      const ux = (x - cx) / cx;
      const uy = (y - cy) / cy;
      const d = Math.min(1, Math.max(0, (Math.sqrt(ux * ux + uy * uy) / Math.SQRT2 - 0.4) / 0.6));
      const v = 1 - spec.vignette * d;
      r *= v;
      g *= v;
      b *= v;
      if (ta) {
        r = r * (1 - ta) + tr * ta;
        g = g * (1 - ta) + tg * ta;
        b = b * (1 - ta) + tb * ta;
      }
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      const n = (((seed >>> 0) / 4294967296) * 2 - 1) * 255 * spec.grainStill * 0.5;
      p[i] = r + n;
      p[i + 1] = g + n;
      p[i + 2] = b + n;
      p[i + 3] = 255;
    }
  }
  return p;
}

/** 찍은 그림(÷ 4)과 비틀기 표. 그리는 캔버스가 곧 덮개다. */
export class Swirl {
  readonly canvas = document.createElement('canvas');
  private readonly g: CanvasRenderingContext2D;
  private readonly src: Uint8ClampedArray;
  private readonly src32: Uint32Array;
  private readonly back: Uint8ClampedArray;
  private readonly out: ImageData;
  private readonly out32: Uint32Array;
  private readonly dx: Float32Array;
  private readonly dy: Float32Array;
  /** (1 − 거리)²: 가운데일수록 많이 비튼다 */
  private readonly weight: Float32Array;
  private readonly w: number;
  private readonly h: number;
  private readonly cx: number;
  private readonly cy: number;

  /** field: 배경으로 찍은 ÷ 2 그림(다시 ÷ 4로 줄여 읽는다). screenW: 화면 폭. fx, fy: 소용돌이 가운데(화면 비율 0~1, 20~80% 안으로 묶음) */
  constructor(field: HTMLCanvasElement, screenW: number, fx: number, fy: number, back: BackdropSpec) {
    const down = Math.max(4, Math.ceil(screenW / SWIRL_MAX_W));
    const w = (this.w = Math.max(1, Math.ceil(screenW / down)));
    const h = (this.h = Math.max(1, Math.ceil((screenW / down) * (field.height / field.width))));
    this.canvas.width = w;
    this.canvas.height = h;
    // GPU 캔버스에 줄여 그린 뒤 작은 그림만 읽는다(디자인 측정: willReadFrequently로 큰 그림을 읽는 것보다 2.5배 빠름).
    this.g = this.canvas.getContext('2d')!;
    this.g.imageSmoothingEnabled = true;
    this.g.drawImage(field, 0, 0, field.width, field.height, 0, 0, w, h);
    this.src = this.g.getImageData(0, 0, w, h).data;
    this.src32 = new Uint32Array(this.src.buffer, this.src.byteOffset, w * h);
    this.back = processed(this.src, w, h, back);
    this.out = this.g.createImageData(w, h);
    this.out32 = new Uint32Array(this.out.data.buffer);
    const cx = (this.cx = Math.min(0.8, Math.max(0.2, fx)) * w);
    const cy = (this.cy = Math.min(0.8, Math.max(0.2, fy)) * h);
    const R = Math.max(Math.hypot(cx, cy), Math.hypot(w - cx, cy), Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy));
    const invR = 1 / R;
    const n = w * h;
    const dxs = (this.dx = new Float32Array(n));
    const dys = (this.dy = new Float32Array(n));
    const ws = (this.weight = new Float32Array(n));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const ddx = x + 0.5 - cx;
        const ddy = y + 0.5 - cy;
        dxs[i] = ddx;
        dys[i] = ddy;
        const r = Math.min(1, Math.sqrt(ddx * ddx + ddy * ddy) * invR);
        ws[i] = (1 - r) * (1 - r);
      }
    }
  }

  /** p: 0(시작) ~ 1(끝). 감기에는 비틀기가 p^1.4로 커지고, 풀기에는 줄어들며 그림이 배경으로 바뀐다. 끝은 배경 그대로다. */
  draw(p: number, spec: SwirlSpec) {
    const t0 = performance.now();
    const { w, h, src, src32, back, out32, dx, dy, weight, cx, cy } = this;
    const o = this.out.data;
    const q = Math.min(1, Math.max(0, p));
    let twist: number;
    let zoom: number;
    let mix: number;
    if (q <= spec.inFrac) {
      const u = q / spec.inFrac;
      twist = u ** 1.4;
      zoom = u * u;
      mix = 0;
    } else {
      const u = (q - spec.inFrac) / (1 - spec.inFrac);
      twist = (1 - u) ** 2;
      zoom = (1 - u) ** 2;
      mix = smooth(u * 1.25);
    }
    const K = spec.turns * LUT * twist;
    const inv = 1 / (1 + (spec.zoom - 1) * zoom);
    const a = 1 - mix;
    const wm = w - 1;
    const hm = h - 1;
    for (let i = 0, n = w * h; i < n; i++) {
      const k = (K * weight[i]) & (LUT - 1);
      const c = COS[k];
      const s = SIN[k];
      let sx = (cx + (dx[i] * c - dy[i] * s) * inv) | 0;
      let sy = (cy + (dx[i] * s + dy[i] * c) * inv) | 0;
      if (sx < 0) sx = 0;
      else if (sx > wm) sx = wm;
      if (sy < 0) sy = 0;
      else if (sy > hm) sy = hm;
      const si = sy * w + sx;
      if (mix === 0) {
        out32[i] = src32[si];
      } else {
        const sb = si * 4;
        const ob = i * 4;
        o[ob] = src[sb] * a + back[sb] * mix;
        o[ob + 1] = src[sb + 1] * a + back[sb + 1] * mix;
        o[ob + 2] = src[sb + 2] * a + back[sb + 2] * mix;
        o[ob + 3] = 255;
      }
    }
    this.g.putImageData(this.out, 0, 0);
    introStats.frames++;
    introStats.drawMs += performance.now() - t0;
  }
}

/**
 * 이 기기에서 소용돌이 준비가 느렸으면 다음부터 바꾸기만 한다. 페이지를 연 뒤 첫 찍기는 GPU가 화면을 다 그리기를 기다려 늘 길어서
 * (1920×1080에서 첫 번 약 95ms, 그다음 25~35ms) 세지 않고, 두 번 잇달아 50ms를 넘을 때만 느린 기기로 본다(에이전트가 정함).
 */
let slowDevice = false;
let setups = 0;
let slowRuns = 0;

/**
 * 전투 들어가기 한 번. 만들면 다음 Phaser 프레임(postrender)에서 필드를 찍고 루프를 재운 뒤 소용돌이를 돌린다.
 * done은 배경으로 바뀌어 전투 창을 띄울 수 있을 때 풀린다. hasBackdrop이면 전투 창 장막은 더 어둡게 하지 않는다(.on-backdrop).
 * leave()는 배경을 150ms 동안 걷는다(전투 창이 닫힐 때, 요청이 실패했을 때). 필드 루프는 부르는 쪽이 깨운다.
 */
export class BattleIntro {
  private cover: HTMLElement | null = null;
  private backdrop: HTMLElement | null = null;
  readonly done: Promise<void>;

  constructor(
    private readonly game: Phaser.Game,
    kind: SwirlKind,
    /** 싸울 몬스터 몸 가운데(화면 비율 0~1) */
    private readonly at: { x: number; y: number },
  ) {
    const spec = SWIRL[kind];
    const back = BACKDROP[kind === 'boss' ? 'boss' : 'normal'];
    const quick = reducedMotion() || slowDevice;
    this.done = this.capture(back, !quick).then((shot) => {
      if (!shot) return this.wait(REDUCED_MS);
      if (shot.swirl) return this.play(shot.swirl, spec).then(() => this.showBackdrop(shot.shot, back, false));
      return this.showBackdrop(shot.shot, back, true);
    });
  }

  /** 전투 창 장막을 배경 위에 투명하게 둘지 */
  get hasBackdrop() {
    return this.backdrop !== null;
  }

  /** 다음 postrender에서 필드를 찍고(배경 ÷ 2, 소용돌이 ÷ 4) 루프를 재운다. 루프가 돌지 않으면 null. */
  private capture(back: BackdropSpec, withSwirl: boolean) {
    return new Promise<{ shot: HTMLCanvasElement; swirl: Swirl | null } | null>((resolve) => {
      const { game } = this;
      let settled = false;
      const take = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        let result: { shot: HTMLCanvasElement; swirl: Swirl | null } | null = null;
        try {
          const t0 = performance.now();
          const shot = shootBackdrop(game.canvas);
          const t1 = performance.now();
          introStats.backMs += t1 - t0;
          let swirl: Swirl | null = null;
          if (withSwirl) {
            swirl = new Swirl(shot, game.canvas.width, this.at.x, this.at.y, back);
            const setup = performance.now() - t1;
            introStats.setupMs += setup;
            introStats.w = swirl.canvas.width;
            introStats.h = swirl.canvas.height;
            if (setups++ > 0) {
              slowRuns = setup > SLOW_SETUP_MS ? slowRuns + 1 : 0;
              if (slowRuns >= 2) {
                slowDevice = true;
                introStats.slow = true;
              }
            }
          }
          introStats.captures++;
          result = { shot, swirl };
        } catch {
          result = null;
        }
        game.loop.sleep();
        resolve(result);
      };
      const timer = window.setTimeout(() => {
        game.events.off('postrender', take);
        if (settled) return;
        settled = true;
        game.loop.sleep();
        resolve(null);
      }, CAPTURE_WAIT_MS);
      game.events.once('postrender', take);
    });
  }

  private play(swirl: Swirl, spec: SwirlSpec) {
    swirl.canvas.classList.add('adv-cover');
    (document.getElementById('hud') ?? document.body).appendChild(swirl.canvas);
    this.cover = swirl.canvas;
    swirl.draw(0, spec);
    return new Promise<void>((resolve) => {
      const start = performance.now();
      const step = (now: number) => {
        const p = (now - start) / spec.ms;
        swirl.draw(p, spec);
        if (p < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  /** 소용돌이 캔버스를 배경으로 바꾼다. fade면(움직임 줄이기·느린 기기) 150ms 동안 나타난다. */
  private showBackdrop(shot: HTMLCanvasElement, back: BackdropSpec, fade: boolean) {
    const box = backdropElement(shot, back);
    if (fade) box.classList.add('fade');
    (document.getElementById('hud') ?? document.body).appendChild(box);
    this.backdrop = box;
    this.cover?.remove();
    this.cover = null;
    return fade ? this.wait(REDUCED_MS) : Promise.resolve();
  }

  private wait(ms: number) {
    return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
  }

  /** 배경을 걷는다(필드 루프는 부르는 쪽이 깨운다). */
  leave() {
    const els = [this.cover, this.backdrop].filter((x): x is HTMLElement => x !== null);
    this.cover = null;
    this.backdrop = null;
    for (const el of els) {
      el.classList.add('closing');
      window.setTimeout(() => el.remove(), LEAVE_MS);
    }
  }
}
