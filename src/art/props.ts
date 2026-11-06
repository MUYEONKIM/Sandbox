import { clamp01, frac, hash2, Pixels, ramp, Rng, shade, type Color } from './pixels';

/** canvas와, 그 안에서 칸 중심에 맞출 지점 */
export interface Art {
  canvas: HTMLCanvasElement;
  ax: number;
  ay: number;
}

const ROCK = [0x5f5f68, 0x7a7a84, 0x96969f, 0xb7b7bf];

/** 채석장의 바위 무더기 */
export function paintRock(seed: number): Art {
  const size = 36;
  const p = new Pixels(size, size);
  const cx = size / 2;
  const rng = new Rng(seed * 131 + 17);
  const lumps: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < 9; i++) {
    const a = rng.next() * Math.PI * 2;
    const d = Math.sqrt(rng.next()) * (size * 0.26);
    lumps.push({ x: cx + Math.cos(a) * d, y: size * 0.58 + Math.sin(a) * d * 0.6, r: size * (0.14 + rng.next() * 0.1) });
  }
  lumps.sort((a, b) => a.y - b.y);
  for (const lump of lumps) {
    for (let y = Math.floor(lump.y - lump.r); y <= lump.y + lump.r; y++) {
      for (let x = Math.floor(lump.x - lump.r); x <= lump.x + lump.r; x++) {
        const nx = (x + 0.5 - lump.x) / lump.r;
        const ny = (y + 0.5 - lump.y) / lump.r;
        if (nx * nx + ny * ny > 1) continue;
        const t = 0.55 - nx * 0.3 - ny * 0.42 + (hash2(x, y) - 0.5) * 0.14;
        p.set(x, y, ramp(ROCK, t, x, y));
      }
    }
  }
  p.outlineOuter(0x34343c);
  return { canvas: p.toCanvas(), ax: cx, ay: size - 8 };
}

/** 낚시터 물가에 떠 있는 찌 */
export function paintBobber(): Art {
  const p = new Pixels(16, 16);
  p.ellipse(8, 11, 7, 3.5, 0xa8dde6, 110);
  p.rect(7, 3, 2, 4, 0xffffff);
  p.rect(6, 7, 4, 3, 0xe0524c);
  p.rect(7, 10, 2, 1, 0xa33530);
  return { canvas: p.toCanvas(), ax: 8, ay: 11 };
}

export const PORTAL_FRAMES = 8;
const PORTAL_W = 48;
const PORTAL_H = 80;
const PORTAL_BASE = 66;
const PORTAL_SPARKS = 14;
/** 포탈 그림에서 칸 중심에 맞출 세로 위치 (0~1) */
export const PORTAL_ORIGIN_Y = PORTAL_BASE / PORTAL_H;

/** 투명도를 몇 단계로 끊어 도트 느낌을 살린다. */
const stepAlpha = (a: number) => Math.round(clamp01(a) * 5) * 51;

/** 땅에 빛나는 고리가 있고 그 위로 빛기둥과 빛 알갱이가 솟아오르는 포탈 */
export function paintPortal(color: Color, frame: number): Art {
  const p = new Pixels(PORTAL_W, PORTAL_H);
  const cx = PORTAL_W / 2;
  const base = PORTAL_BASE;
  const phase = frame / PORTAL_FRAMES;
  const bright = shade(color, 1.5);
  const beamTop = 8;

  // 위로 올라가며 흐려지는 빛기둥
  for (let y = beamTop; y < base; y++) {
    const rise = (base - y) / (base - beamTop);
    const halfWidth = 15 - rise * 5;
    for (let x = 0; x < PORTAL_W; x++) {
      const across = Math.abs(x + 0.5 - cx) / halfWidth;
      if (across >= 1) continue;
      const streak = 0.65 + 0.35 * Math.sin(x * 1.1 + rise * 8 - phase * Math.PI * 2);
      const a = (1 - rise) ** 1.3 * (1 - across * across) * streak;
      if (stepAlpha(a) > 0) p.set(x, y, a > 0.5 ? bright : color, stepAlpha(a));
    }
  }

  // 땅에서 퍼지는 빛과 고리
  const pulse = 1 + Math.sin(phase * Math.PI * 2) * 0.08;
  for (let y = base - 14; y < base + 14; y++) {
    for (let x = 0; x < PORTAL_W; x++) {
      const r = Math.hypot((x + 0.5 - cx) / (21 * pulse), (y + 0.5 - base) / (10.5 * pulse));
      if (r > 1) continue;
      if (r > 0.8) p.set(x, y, bright, 230);
      else if (r < 0.42) p.set(x, y, 0xffffff, stepAlpha(0.9 - r));
      else p.set(x, y, color, stepAlpha(1 - r));
    }
  }

  // 위로 떠오르는 빛 알갱이. frame이 한 바퀴 돌면 제자리로 돌아온다.
  for (let i = 0; i < PORTAL_SPARKS; i++) {
    const t = frac(hash2(i, 2) + phase);
    const x = cx + (hash2(i, 1) - 0.5) * 30;
    const y = base - t * (base - beamTop) - 2;
    const a = stepAlpha(1 - t);
    if (a === 0) continue;
    p.set(x, y, 0xffffff, a);
    if (i % 3 === 0) p.set(x + 1, y, bright, a);
  }
  return { canvas: p.toCanvas(), ax: cx, ay: base };
}
