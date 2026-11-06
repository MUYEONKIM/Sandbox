import { TILE_H, TILE_W } from '../config';
import { paintCube, type FaceShader } from './cube';
import { clamp01, frac, hash2, Pixels, ramp, Rng, shade, type Color } from './pixels';

/** canvas와, 그 안에서 칸 중심에 맞출 지점 */
export interface Art {
  canvas: HTMLCanvasElement;
  ax: number;
  ay: number;
}

const LEAF = [0x1f5a37, 0x2a7440, 0x3b9148, 0x5bb153, 0x8fd06a];
const NEEDLE = [0x123f35, 0x1b5a45, 0x2a7a55, 0x4a9d66];

export function paintTree(seed: number): Art {
  const p = new Pixels(58, 72);
  const cx = 29;
  const base = 64;
  const rng = new Rng(seed * 97 + 13);

  p.ellipse(cx, base, 21, 10, 0x143a22, 95);
  for (let y = 40; y <= base; y++) {
    for (let x = cx - 3; x <= cx + 3; x++) {
      p.set(x, y, x < cx - 1 ? 0x8d6239 : x > cx + 1 ? 0x5a3b24 : 0x75502e);
    }
  }
  p.rect(cx - 5, base - 1, 2, 2, 0x5a3b24);
  p.rect(cx + 4, base - 1, 2, 2, 0x5a3b24);

  const clumps: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < 26; i++) {
    const a = rng.next() * Math.PI * 2;
    const d = Math.sqrt(rng.next());
    clumps.push({ x: cx + Math.cos(a) * d * 20, y: 26 + Math.sin(a) * d * 17, r: rng.int(6, 10) });
  }
  clumps.sort((a, b) => a.y - b.y);
  for (const c of clumps) {
    for (let y = Math.floor(c.y - c.r); y <= c.y + c.r; y++) {
      for (let x = Math.floor(c.x - c.r); x <= c.x + c.r; x++) {
        const nx = (x + 0.5 - c.x) / c.r;
        const ny = (y + 0.5 - c.y) / c.r;
        if (nx * nx + ny * ny > 1) continue;
        const t = 0.5 - nx * 0.28 - ny * 0.42 + (26 - y) / 46 + (hash2(x, y) - 0.5) * 0.16;
        p.set(x, y, ramp(LEAF, t, x, y));
      }
    }
  }
  p.outlineOuter(0x123a28);
  return { canvas: p.toCanvas(), ax: cx, ay: base };
}

export function paintPine(seed: number): Art {
  const p = new Pixels(40, 74);
  const cx = 20;
  const base = 68;
  p.ellipse(cx, base, 15, 7, 0x143a22, 95);
  p.rect(cx - 2, 56, 5, base - 56, 0x6a4628);
  p.rect(cx + 1, 56, 2, base - 56, 0x4a3020);

  for (let tier = 4; tier >= 0; tier--) {
    const top = 2 + tier * 10;
    const height = 18 + tier * 2;
    const halfWidth = 7 + tier * 2.8;
    for (let y = top; y < top + height; y++) {
      const k = (y - top) / height;
      const hw = k * halfWidth + (hash2(y, tier + seed) - 0.5) * 3;
      for (let x = Math.floor(cx - hw); x <= cx + hw; x++) {
        const t = 0.62 - ((x - cx) / (hw + 1)) * 0.4 - k * 0.32 + (hash2(x, y) - 0.5) * 0.14;
        p.set(x, y, ramp(NEEDLE, t, x, y));
      }
    }
  }
  p.outlineOuter(0x0e2f2a);
  return { canvas: p.toCanvas(), ax: cx, ay: base };
}

export function paintBarrel(): Art {
  const p = new Pixels(20, 28);
  const cx = 10;
  p.ellipse(cx, 24, 9, 4, 0x143a22, 90);
  for (let y = 6; y < 24; y++) {
    const bulge = Math.sin(((y - 6) / 18) * Math.PI) * 2;
    const hw = 6 + bulge;
    for (let x = Math.floor(cx - hw); x <= cx + hw; x++) {
      const t = 0.75 - ((x - cx + hw) / (hw * 2)) * 0.8;
      let c = ramp([0x70482a, 0x8d5f37, 0xa97645], t, x, y);
      if (y === 10 || y === 19) c = ramp([0x4c4a50, 0x77747a], t, x, y);
      p.set(x, y, c);
    }
  }
  p.ellipse(cx, 6, 6.5, 3, 0xb98a55);
  p.ellipse(cx, 6, 4, 1.6, 0x8d5f37);
  p.outlineOuter(0x33241c);
  return { canvas: p.toCanvas(), ax: cx, ay: 24 };
}

export function paintCrate(): Art {
  const shader: FaceShader = (face, u, v) => {
    if (face === 'top') return frac(v * 3) < 0.14 ? 0x9a7040 : 0xd2a971;
    if (u < 0.12 || u > 0.88 || v < 0.12 || v > 0.88) return 0xa77c49;
    if (Math.abs(u - v) < 0.1 || Math.abs(u + v - 1) < 0.1) return 0xa77c49;
    return 0xc69c63;
  };
  return { canvas: paintCube(shader), ax: TILE_W / 2, ay: TILE_H + 8 };
}

export function paintBanner(): Art {
  const p = new Pixels(22, 56);
  const cx = 8;
  p.ellipse(cx + 1, 50, 8, 4, 0x2b2a22, 80);
  p.rect(cx - 1, 4, 3, 46, 0xc7ccd2);
  p.rect(cx + 1, 4, 1, 46, 0x8c929b);
  p.rect(cx - 2, 2, 5, 2, 0xf0d27a);
  for (let y = 8; y < 34; y++) {
    const tail = y > 28 ? Math.abs(y - 31) : 3;
    for (let x = cx + 2; x < cx + 13; x++) {
      if (y > 28 && Math.abs(x - (cx + 7.5)) > tail + 2) continue;
      let c: Color = x < cx + 4 ? 0x2c5fa8 : x > cx + 10 ? 0x2c5fa8 : 0x3b7ac9;
      if (y === 10 || y === 26) c = 0xf0d27a;
      p.set(x, y + Math.round(Math.sin(x * 0.5) * 1), c);
    }
  }
  p.rect(cx - 3, 49, 7, 2, 0x8c929b);
  p.outlineOuter(0x2a2f45);
  return { canvas: p.toCanvas(), ax: cx, ay: 50 };
}

/** 여러 덩어리를 겹친 울퉁불퉁한 덩어리를 그린다. 바위와 덤불에 쓴다. */
function paintLump(seed: number, palette: Color[], outline: Color, size: number): Pixels {
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
        p.set(x, y, ramp(palette, t, x, y));
      }
    }
  }
  p.outlineOuter(outline);
  return p;
}

const ROCK = [0x5f5f68, 0x7a7a84, 0x96969f, 0xb7b7bf];
const BUSH = [0x2a6b35, 0x3b8a43, 0x57a84f, 0x7fc765];

/** 채석장의 바위 무더기 */
export function paintRock(seed: number): Art {
  const size = 36;
  const p = paintLump(seed, ROCK, 0x34343c, size);
  return { canvas: p.toCanvas(), ax: size / 2, ay: size - 8 };
}

/** 채집장의 열매 덤불 */
export function paintBush(seed: number): Art {
  const size = 36;
  const p = paintLump(seed + 40, BUSH, 0x173f22, size);
  const rng = new Rng(seed * 53 + 9);
  for (let i = 0; i < 7; i++) {
    const x = rng.int(9, size - 10);
    const y = rng.int(12, size - 12);
    p.rect(x, y, 2, 2, 0xe0524c);
    p.set(x, y, 0xffb3a6);
  }
  return { canvas: p.toCanvas(), ax: size / 2, ay: size - 8 };
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

/** mask: 이웃 울타리 방향 비트 (+x=1, -x=2, +y=4, -y=8) */
export function paintFence(mask: number): Art {
  const p = new Pixels(TILE_W, TILE_H + 16);
  const cx = TILE_W / 2;
  const cy = 24;
  const rail = (dx: number, dy: number) => {
    for (const h of [5, 10]) {
      p.line(cx, cy - h, cx + dx, cy - h + dy, 0x8a5d34);
      p.line(cx, cy - h + 1, cx + dx, cy - h + 1 + dy, 0x5f3e24);
    }
  };
  if (mask & 2) rail(-8, -4);
  if (mask & 8) rail(8, -4);
  p.rect(cx - 2, cy - 13, 4, 14, 0x9c6c3f);
  p.rect(cx + 1, cy - 13, 1, 14, 0x6b4628);
  p.rect(cx - 2, cy - 14, 4, 1, 0xc09362);
  if (mask & 1) rail(8, 4);
  if (mask & 4) rail(-8, 4);
  return { canvas: p.toCanvas(), ax: cx, ay: cy };
}

export interface HouseArt {
  canvas: HTMLCanvasElement;
  /** 캔버스 안에서 집 바닥 (0,0) 모서리의 위치 */
  ox: number;
  oy: number;
}

/** 경사 지붕이 있는 w x d 칸 크기의 집을 그린다. */
export function paintHouse(w: number, d: number): HouseArt {
  const WALL = 36;
  const RISE = 36;
  const OVER = 0.35;
  const MARGIN = 32;
  const ox = d * 16 + MARGIN;
  const oy = WALL + RISE + 22;
  const p = new Pixels((w + d) * 16 + MARGIN * 2, oy + (w + d) * 8 + 16);

  type V = readonly [number, number];
  const at = (x: number, y: number, z: number): V => [ox + (x - y) * 16, oy + (x + y) * 8 - z];
  const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]];

  const logs = (u: number, v: number, seed: number): Color => {
    const rows = v * 7;
    const row = Math.floor(rows);
    if (frac(rows) < 0.16) return 0x5f3d22;
    const c = [0xa8743f, 0xb5804a, 0x9c6a38][Math.floor(hash2(row, seed) * 3)];
    if (hash2(row, Math.floor(u * 30) + seed) > 0.86) return shade(c, 0.9);
    return frac(rows) > 0.84 ? shade(c, 0.86) : c;
  };

  const foundation = (u: number, v: number): Color => {
    const rows = v * 12;
    const row = Math.floor(rows);
    const cols = u * 18 + (row & 1) * 0.5;
    if (frac(rows) < 0.2 || frac(cols) < 0.1) return 0x5f6068;
    return [0x8f9098, 0xa3a3aa, 0x7f8088][Math.floor(hash2(row, Math.floor(cols)) * 3)];
  };

  const windowAt = (u: number, v: number, cu: number, hw: number, top: number, bottom: number): Color | null => {
    if (Math.abs(u - cu) > hw || v < top || v > bottom) return null;
    const fu = (u - (cu - hw)) / (hw * 2);
    const fv = (v - top) / (bottom - top);
    if (fu < 0.13 || fu > 0.87 || fv < 0.1 || fv > 0.9) return 0xe8dcc0;
    if (Math.abs(fu - 0.5) < 0.05 || Math.abs(fv - 0.5) < 0.05) return 0xe8dcc0;
    return fu + fv < 0.8 ? 0x8fc8e0 : 0x2f5a80;
  };

  const flowerBox = (u: number, v: number, cu: number, hw: number, top: number): Color | null => {
    if (Math.abs(u - cu) > hw + 0.01 || v < top || v > top + 0.1) return null;
    if (v > top + 0.05) return 0x6b4628;
    return [0xff9a3c, 0xf26f6f, 0x4c9a3e, 0xffd84d][Math.floor(hash2(Math.floor(u * 90), 2) * 4)];
  };

  // 앞쪽(문이 있는) 벽
  const leftOrigin = at(0, d, WALL);
  p.parallelogram(leftOrigin, sub(at(w, d, WALL), leftOrigin), [0, WALL], (u, v) => {
    if (u > 0.44 && u < 0.56 && v > 0.36) {
      if (u < 0.455 || u > 0.545 || v < 0.39) return 0x4f3320;
      if (u > 0.525 && v > 0.62 && v < 0.67) return 0xf0d27a;
      return frac(u * 90) < 0.25 ? 0x5e3d24 : 0x7c5230;
    }
    if (v > 0.86) return foundation(u, v);
    for (const cu of [0.18, 0.82]) {
      const box = flowerBox(u, v, cu, 0.08, 0.64);
      if (box !== null) return box;
      const win = windowAt(u, v, cu, 0.08, 0.3, 0.63);
      if (win !== null) return win;
    }
    return logs(u, v, 1);
  });

  // 오른쪽 벽과 박공
  const rightOrigin = at(w, 0, WALL);
  const rightDir = sub(at(w, d, WALL), rightOrigin);
  p.parallelogram(rightOrigin, rightDir, [0, WALL], (u, v) => {
    if (v > 0.86) return shade(foundation(u, v), 0.76);
    const win = windowAt(u, v, 0.5, 0.11, 0.22, 0.6);
    if (win !== null) return shade(win, 0.82);
    return shade(logs(u, v, 2), 0.76);
  });
  p.parallelogram(rightOrigin, rightDir, [0, -RISE], (u, v) => {
    if (v > 1 - Math.abs(2 * u - 1)) return null;
    return frac(u * 10) < 0.14 ? 0x8f8468 : 0xc9bb98;
  });

  // 지붕
  const rise = RISE + WALL;
  const ridgeA = at(-OVER, d / 2, rise);
  const ridgeB = at(w + OVER, d / 2, rise);
  const drop = (RISE * (d / 2 + OVER)) / (d / 2);
  const shingle = (u: number, v: number): Color => {
    const rows = v * 8;
    const row = Math.floor(rows);
    const cols = u * w * 2.4 + (row & 1) * 0.5;
    if (v > 0.965) return 0x1a4852;
    if (v < 0.03) return 0x74c7c6;
    if (frac(rows) > 0.8) return 0x1f5560;
    if (frac(cols) < 0.08) return 0x27626e;
    return [0x2f8291, 0x3a95a0, 0x358a99, 0x49a8ad][Math.floor(hash2(row, Math.floor(cols)) * 4)];
  };
  p.parallelogram(ridgeA, sub(ridgeB, ridgeA), sub(at(-OVER, -OVER, rise - drop), ridgeA), (u, v) =>
    shade(shingle(u, v), 0.72),
  );

  // 굴뚝
  const chimney = at(w * 0.7, d * 0.3, rise + 2);
  const chimneyColor = (u: number, v: number, f: number) => {
    const c = frac(v * 4) < 0.2 ? 0x8f4a36 : frac(u * 2 + (Math.floor(v * 4) & 1) * 0.5) < 0.12 ? 0x8f4a36 : 0xb9654a;
    return shade(c, f);
  };
  p.parallelogram([chimney[0] - 8, chimney[1] - 4], [8, 4], [0, 26], (u, v) => chimneyColor(u, v, 1));
  p.parallelogram([chimney[0], chimney[1]], [8, -4], [0, 26], (u, v) => chimneyColor(u, v, 0.74));
  p.parallelogram([chimney[0], chimney[1] - 8], [8, 4], [-8, 4], () => 0x4a3a34);

  p.parallelogram(ridgeA, sub(ridgeB, ridgeA), sub(at(-OVER, d + OVER, rise - drop), ridgeA), shingle);

  p.outlineOuter(0x2a2430);
  return { canvas: p.toCanvas(), ox, oy };
}
