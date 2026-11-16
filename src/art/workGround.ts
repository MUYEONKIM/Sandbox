import { Terrain, type GameMap } from '../game/map';
import type { WorkId } from '../game/maps';
import { isPlot } from '../game/farm';
import { ORIGIN_X, ORIGIN_Y } from '../iso';
import { paintGround, worldRect } from './ground';
import { frac, hash2, type Color } from './pixels';

/**
 * 작업장 바닥(2026-11-16 사용자 "작업장들도 디자인을 제대로", 그림과 꾸밈은 디자인 세션이 정함).
 * paintGround로 맵 가장자리 옆면과 물 타일을 먼저 그린 뒤, 윗면을 작업장마다 픽셀 단위로 다시 칠한다.
 * 잡음과 길까지의 거리는 칸을 잘게 나눈 격자에 미리 계산해 두고 픽셀마다 찾아 쓴다(처음 들어갈 때 한 번, 매 프레임 비용 없음).
 * 길·고랑·물가는 칠한 그림이라 밟고 지나갈 수 있고 블록도 놓을 수 있다. 막는 것은 workLayouts.ts의 소품뿐이다.
 */

type Point = readonly [number, number];
type Shader = (gx: number, gy: number, sx: number, sy: number) => Color;

/** 물 타일 윗면은 땅보다 이만큼 낮다(tiles.png 물 타일이 4픽셀 아래에서 시작한다). */
const WATER_DROP = 4;

const mix = (a: Color, b: Color, t: number): Color => {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  const r = ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * k;
  const g = ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * k;
  const bl = (a & 255) + ((b & 255) - (a & 255)) * k;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};

/** 부드러운 값 잡음(0~1) */
function noise(x: number, y: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const s = seed * 7919;
  const a = hash2(xi + s, yi);
  const b = hash2(xi + 1 + s, yi);
  const c = hash2(xi + s, yi + 1);
  const d = hash2(xi + 1 + s, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const pick = (list: readonly Color[], t: number) => list[Math.min(list.length - 1, Math.max(0, Math.floor(t * list.length)))];

/** 맵을 한 칸에 res×res로 나눈 격자에 미리 계산한 값 */
class Field {
  readonly data: Float32Array;
  private readonly n: number;

  constructor(
    size: number,
    private readonly res: number,
    fn: (gx: number, gy: number) => number,
  ) {
    this.n = size * res;
    this.data = new Float32Array(this.n * this.n);
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) this.data[j * this.n + i] = fn((i + 0.5) / res, (j + 0.5) / res);
    }
  }

  /** 맵 안 좌표만 받는다(칠하는 픽셀은 늘 맵 안이다). */
  at(gx: number, gy: number) {
    return this.data[((gy * this.res) | 0) * this.n + ((gx * this.res) | 0)];
  }
}

/** 꺾인 길까지의 거리(가운데 선)와 길을 따라 잰 위치를 한 칸에 8×8로 미리 계산한다. 먼 곳은 거리 99다. */
function pathFields(size: number, points: readonly Point[], reach: number) {
  const res = 8;
  const n = size * res;
  const dist = new Float32Array(n * n).fill(99);
  const along = new Float32Array(n * n);
  const segs: { ax: number; ay: number; dx: number; dy: number; len: number; start: number }[] = [];
  let start = 0;
  for (let k = 0; k + 1 < points.length; k++) {
    const [ax, ay] = points[k];
    const [bx, by] = points[k + 1];
    const len = Math.hypot(bx - ax, by - ay);
    segs.push({ ax, ay, dx: bx - ax, dy: by - ay, len, start });
    start += len;
  }
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const i0 = Math.max(0, Math.floor((Math.min(...xs) - reach) * res));
  const i1 = Math.min(n, Math.ceil((Math.max(...xs) + reach) * res));
  const j0 = Math.max(0, Math.floor((Math.min(...ys) - reach) * res));
  const j1 = Math.min(n, Math.ceil((Math.max(...ys) + reach) * res));
  for (let j = j0; j < j1; j++) {
    const gy = (j + 0.5) / res;
    for (let i = i0; i < i1; i++) {
      const gx = (i + 0.5) / res;
      let best = reach;
      let at = 0;
      for (const sg of segs) {
        const t = Math.max(0, Math.min(1, ((gx - sg.ax) * sg.dx + (gy - sg.ay) * sg.dy) / (sg.len * sg.len)));
        const ex = gx - sg.ax - t * sg.dx;
        const ey = gy - sg.ay - t * sg.dy;
        const d = Math.sqrt(ex * ex + ey * ey);
        if (d < best) {
          best = d;
          at = sg.start + t * sg.len;
        }
      }
      if (best < reach) {
        dist[j * n + i] = best;
        along[j * n + i] = at;
      }
    }
  }
  const index = (gx: number, gy: number) => ((gy * res) | 0) * n + ((gx * res) | 0);
  return { dist, d: { at: (gx: number, gy: number) => dist[index(gx, gy)] }, a: { at: (gx: number, gy: number) => along[index(gx, gy)] } };
}

const FLOWERS = [0xffffff, 0xffd84d, 0xff9ad0, 0xb79cff];

// ───────────────────────────── 채석장 ─────────────────────────────
const GRAVEL = [0x8c877d, 0x969186, 0xa09b90];
const BEDROCK = [0x9da1a4, 0xa7abae, 0xb1b4b6];
/** 돌을 실어 나르는 길: 도착 칸 옆에서 건물을 돌아 뒤쪽 바위 벽까지 굽이친다. 길 위쪽에는 수레 레일이 깔렸다. */
export const QUARRY_ROAD: readonly Point[] = [
  [43.5, 43],
  [43.5, 35],
  [37, 29.5],
  [30.5, 27],
  [25, 19.5],
  [21.5, 11],
  [14, 6.5],
  [6, 4],
];
const QUARRY_RAIL_FROM = 16;

function quarry(size: number): Shader {
  const road = pathFields(size, QUARRY_ROAD, 1.6);
  const rock = new Field(size, 4, (x, y) => noise(x / 5, y / 5, 1));
  const gravel = new Field(size, 4, (x, y) => noise(x / 2.5, y / 2.5, 2));
  const slab = new Field(size, 4, (x, y) => noise(x / 1.5, y / 1.5, 4));
  const crack = new Field(size, 4, (x, y) => noise(x / 2, y / 2, 7) * 2);
  return (gx, gy, sx, sy) => {
    const d = road.d.at(gx, gy);
    if (d < 0.95) {
      const along = road.a.at(gx, gy);
      if (along > QUARRY_RAIL_FROM && d < 0.48) {
        if (Math.abs(d - 0.24) < 0.05) return sx & 1 ? 0x9aa0a8 : 0x5b5f66;
        if (frac(along * 2.2) < 0.22) return (sx + sy) % 3 === 0 ? 0x5a3e28 : 0x6a4a30;
        return hash2(sx, sy) > 0.6 ? 0x6e6a62 : 0x7e796f;
      }
      if (d > 0.82) return 0x7e786c;
      if (Math.abs(d - 0.42) < 0.07) return 0xa59b86;
      return hash2(sx >> 1, sy) > 0.93 ? 0xc6bca4 : 0xb6ac96;
    }
    const n = rock.at(gx, gy);
    if (n > 0.64) {
      // 깎아 낸 암반 판: 뒤쪽 테는 밝고 앞쪽 테는 어두워 조금 솟아 보인다.
      if (n < 0.675) return rock.at(gx - 0.3, gy - 0.3) > n ? 0x6a6e72 : 0xc4c8ca;
      if (frac(gx * 0.8 + gy * 0.3 + crack.at(gx, gy)) < 0.022) return 0x6e7276;
      if (n > 0.72 && frac(gx * 2) < 0.07 && Math.abs(frac(gy * 1.5) - 0.5) < 0.06) return 0x55595d;
      return hash2(sx, sy) > 0.96 ? 0xc4c7c9 : pick(BEDROCK, slab.at(gx, gy));
    }
    let c = pick(GRAVEL, gravel.at(gx, gy));
    const h = hash2(sx, sy);
    if (h > 0.95) c = 0xbdb8ab;
    else if (h < 0.035) c = 0x6c6860;
    else if (hash2(sx >> 1, sy + 3) > 0.975) c = 0xd2ccbe;
    // 길가에 날린 먼지
    if (d < 1.6) c = mix(c, 0xc9bfa8, (1.6 - d) * 0.4);
    return c;
  };
}

// ───────────────────────────── 벌목장 ─────────────────────────────
const SOIL = [0x523d2a, 0x5c4530, 0x664d36];
const MOSS = [0x4a7236, 0x557f3e, 0x618c46];
const LEAVES = [0xc8742e, 0xd8a03a, 0x9a3a22, 0x8a8a34];
/** 숲으로 들어가는 오솔길 */
export const LOGGING_TRAIL: readonly Point[] = [
  [42.5, 43],
  [42.8, 34],
  [35, 27.5],
  [28, 22.5],
  [21.5, 14],
  [12, 8.5],
  [4, 3],
];
/** 톱밥이 날린 마당(건물과 통나무 더미 둘레) */
const SAWDUST = { x: 35.5, y: 40.5, r: 5.5 };

function logging(size: number): Shader {
  const trail = pathFields(size, LOGGING_TRAIL, 1);
  const moss = new Field(size, 4, (x, y) => noise(x / 4, y / 4, 3));
  const mossTone = new Field(size, 4, (x, y) => noise(x, y, 8));
  const soil = new Field(size, 4, (x, y) => noise(x / 2, y / 2, 5));
  return (gx, gy, sx, sy) => {
    const d = trail.d.at(gx, gy);
    if (d < 0.85) {
      if (d > 0.72) return 0x46331f;
      if (frac(trail.a.at(gx, gy) * 0.7) < 0.04 && d < 0.6) return 0x5a3e26;
      return hash2(sx >> 1, sy) > 0.92 ? 0x9a7c58 : 0x8a6c4c;
    }
    let c: Color;
    if (moss.at(gx, gy) > 0.64) {
      c = hash2(sx, sy) > 0.9 ? 0x7aa652 : pick(MOSS, mossTone.at(gx, gy));
    } else {
      c = pick(SOIL, soil.at(gx, gy));
      const h = hash2(sx, sy);
      if (h > 0.955) c = LEAVES[(hash2(sy, sx) * LEAVES.length) | 0];
      else if (h < 0.03) c = 0x3a2a1c;
    }
    const dx = gx - SAWDUST.x;
    const dy = gy - SAWDUST.y;
    const dust = 1 - Math.sqrt(dx * dx + dy * dy) / SAWDUST.r;
    if (dust > 0 && hash2(sx + 7, sy) < dust * 0.55) c = hash2(sx, sy + 9) > 0.5 ? 0xd8b98a : 0xc4a070;
    return c;
  };
}

// ───────────────────────────── 채집장 ─────────────────────────────
const MEADOW = [0x6ea440, 0x78ae48, 0x82b850];
export const GATHER_PATHS: readonly (readonly Point[])[] = [
  [
    [42.5, 43],
    [42.5, 30],
    [30, 22.5],
    [17, 16.5],
    [4, 9],
  ],
  [
    [30, 22.5],
    [33, 12],
    [38.5, 3.5],
  ],
];
/** 고랑 낸 밭: [x0, y0, x1, y1] (자원 칸 사이 빈 땅) */
export const FURROWS: readonly (readonly [number, number, number, number])[] = [
  [6, 26, 13, 31],
  [20, 32, 27, 36],
  [32, 15, 37, 20],
];

function gathering(size: number): Shader {
  // 두 길의 거리를 하나로 합치고, 밭 자리는 칸 단위 표로 미리 만든다.
  const [first, ...rest] = GATHER_PATHS.map((p) => pathFields(size, p, 0.95));
  for (const p of rest) for (let i = 0; i < first.dist.length; i++) first.dist[i] = Math.min(first.dist[i], p.dist[i]);
  const furrow = new Uint8Array(size * size);
  for (const [x0, y0, x1, y1] of FURROWS) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) furrow[x + y * size] = 1;
  const meadow = new Field(size, 4, (x, y) => noise(x / 3, y / 3, 11));
  const clover = new Field(size, 4, (x, y) => noise(x / 2, y / 2, 12));
  return (gx, gy, sx, sy) => {
    const d = first.d.at(gx, gy);
    if (d < 0.8) {
      if (d > 0.68) return hash2(sx, sy) > 0.5 ? 0x5f9a3c : 0x8a6c48;
      if (Math.abs(d - 0.3) < 0.06) return 0x86643e;
      return hash2(sx >> 1, sy) > 0.94 ? 0xb89a6a : 0xa58658;
    }
    if (furrow[(gx | 0) + (gy | 0) * size]) {
      const ridge = frac(gy * 2.5) < 0.5;
      if (ridge && (sx & 3) === 0 && hash2(sx, (gy * 2.5) | 0) > 0.55) return 0x7cc24f;
      return ridge ? 0x7a5638 : 0x5e4028;
    }
    let c = clover.at(gx, gy) > 0.7 ? 0x5f9a3c : pick(MEADOW, meadow.at(gx, gy));
    const h = hash2(sx, sy);
    if (h > 0.985) return FLOWERS[(hash2(sy, sx) * FLOWERS.length) | 0];
    if (h < 0.06) c = 0x5a8c36;
    return c;
  };
}

// ───────────────────────────── 낚시터 ─────────────────────────────
/** map.ts의 연못(가운데 23, 반지름 13, 칸 가운데 기준)에 맞춘 원 */
const POND = { x: 23.5, y: 23.5, r: 13.5 };
const SHORE_GRASS = [0x66a442, 0x70ae4a, 0x7ab852];
export const FISHING_PATH: readonly Point[] = [
  [42.5, 43],
  [43, 35.5],
  [38, 31.5],
  [34.6, 30.5],
];
/** 연잎 자리(칸 좌표, 연못 물 위) */
const LILIES: readonly Point[] = [
  [14.5, 17],
  [16, 31.5],
  [30.5, 13.5],
  [33, 28],
  [21, 12],
  [12.5, 25],
];
const DEEP = 0x1f4e7a;
const MID = 0x3a7fae;
const SHALLOW = 0x68b2cc;

function fishing(size: number): { ground: Shader; water: Shader } {
  const path = pathFields(size, FISHING_PATH, 0.95);
  const grass = new Field(size, 4, (x, y) => noise(x / 3, y / 3, 21));
  const swirl = new Field(size, 4, (x, y) => noise(x / 3, y / 3, 31) * 1.2);
  const ground: Shader = (gx, gy, sx, sy) => {
    const d = path.d.at(gx, gy);
    if (d < 0.8) {
      if (d > 0.68) return 0x8a6c48;
      return hash2(sx >> 1, sy) > 0.93 ? 0xc8b48a : 0xb59e74;
    }
    const ex = gx - POND.x;
    const ey = gy - POND.y;
    const edge = Math.sqrt(ex * ex + ey * ey) - POND.r;
    if (edge < 1.6) {
      const h = hash2(sx, sy);
      if (h > 0.93) return h > 0.97 ? 0x8a8a84 : 0xa8a49a;
      if (edge < 0.7) return 0xb5a27a;
      if (edge > 1.3 && hash2(sx >> 1, sy) > 0.5) return 0x8ab05a;
      return 0xd2c196;
    }
    const h = hash2(sx, sy);
    if (h > 0.988) return FLOWERS[(hash2(sy, sx) * FLOWERS.length) | 0];
    return h < 0.06 ? 0x5a8c36 : pick(SHORE_GRASS, grass.at(gx, gy));
  };
  const water: Shader = (gx, gy, sx, sy) => {
    const ex = gx - POND.x;
    const ey = gy - POND.y;
    const r = Math.sqrt(ex * ex + ey * ey);
    const depth = Math.max(0, Math.min(1, (POND.r - r) / 6));
    // 물가 갈대
    if (POND.r - r < 0.9 && hash2(sx >> 1, 77) > 0.55 && (sy + (sx >> 1)) % 5 < 3) return hash2(sx, 3) > 0.5 ? 0x3f6a2a : 0x6a7a34;
    for (const [lx, ly] of LILIES) {
      const ldx = (gx - lx) * 1.2;
      const ldy = gy - ly;
      const d = Math.sqrt(ldx * ldx + ldy * ldy);
      if (d < 0.42) {
        if (d < 0.1 && (lx * 3) % 2 < 1) return 0xff9ad0;
        if (Math.abs(Math.atan2(ldy, ldx) - 0.6) >= 0.35) return d > 0.34 ? 0x3f7a30 : 0x5aa040;
      }
    }
    let c = depth < 0.5 ? mix(SHALLOW, MID, depth * 2) : mix(MID, DEEP, (depth - 0.5) * 2);
    // 물결은 성기게, 바람 부는 쪽(뒤쪽)만
    if (gx + gy < 44 && frac(r * 0.9 + swirl.at(gx, gy)) < 0.03) c = mix(c, 0xd8f0ff, 0.3);
    if ((sx * 7 + sy * 13) % 151 === 0) c = 0xe8f6ff;
    return c;
  };
  return { ground, water };
}

// ───────── 농장(2026-11-16 사용자 "농장도 꾸며졌으면 좋겠다", 디자인 세션 farm-decor.md 2-1) ─────────
// 구획 사이 길과 둘레 길은 바퀴 자국이 난 다진 흙길, 길 쪽 구획 가장자리는 풀 둑, 아직 안 산 땅은 고랑 진 풀,
// 맵 앞쪽 띠와 뒤쪽 가장자리는 들꽃 풀밭, 포탈 앞과 창고 앞은 흙 마당이다. 산 땅은 FarmField의 밭 타일과 작물이 덮는다.

const FARM_MEADOW = [0x6aa844, 0x74b24c, 0x7ebc54];
const FALLOW = [0x93c45c, 0x9bcb63, 0xa3d16b];
const FARM_DIRT = [0xa98154, 0xb38a5b, 0xbd9462];
/** 땅 구획 가장자리에서 길 쪽으로 이만큼(칸)은 풀 둑(논두렁)이다. */
const BANK = 0.22;

/** 칸 종류: 0 땅(구획), 1 흙길, 2 풀밭 */
function farmKind(cx: number, cy: number) {
  if (isPlot(cx, cy)) return 0;
  const between = (v: number) => v >= 2 && v <= 41 && (v - 2) % 8 >= 6;
  const inside = (v: number) => v >= 2 && v <= 41;
  if ((between(cx) && inside(cy)) || (between(cy) && inside(cx))) return 1;
  if (cx <= 6 && cy >= 42) return 1;
  if (cx >= 42 && cy >= 42) return 1;
  return 2;
}

function farm(size: number): Shader {
  const kinds = new Uint8Array(size * size);
  const near = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      kinds[x + y * size] = farmKind(x, y);
      near[x + y * size] = (isPlot(x - 1, y) ? 1 : 0) | (isPlot(x + 1, y) ? 2 : 0) | (isPlot(x, y - 1) ? 4 : 0) | (isPlot(x, y + 1) ? 8 : 0);
    }
  }
  const fallow = new Field(size, 4, (x, y) => noise(x / 2, y / 2, 21));
  const dirt = new Field(size, 4, (x, y) => noise(x * 1.5, y * 1.5, 22));
  const clover = new Field(size, 4, (x, y) => noise(x / 2, y / 2, 12));
  const meadow = new Field(size, 4, (x, y) => noise(x / 3, y / 3, 11));
  return (gx, gy, sx, sy) => {
    const cx = gx | 0;
    const cy = gy | 0;
    const kind = kinds[cx + cy * size];
    if (kind === 0) {
      // 아직 아무도 사지 않은 땅: 고르게 자란 풀에 고랑 줄
      const row = frac(gy * 3);
      let c = FALLOW[(fallow.at(gx, gy) * 3) | 0];
      if (row < 0.16) c = 0x82b752;
      else if (row > 0.84) c = mix(c, 0xb4dc7a, 0.5);
      if (hash2(sx, sy) > 0.97) c = 0x6f9f44;
      return c;
    }
    // 땅 구획까지의 거리(칸)로 둑을 칠한다. 이웃이 땅인지는 칸마다 미리 셈해 둔 표(near)로 본다.
    let bank = 9;
    const m = near[cx + cy * size];
    if (m) {
      const fx = frac(gx);
      const fy = frac(gy);
      if (m & 1) bank = fx;
      if (m & 2) bank = Math.min(bank, 1 - fx);
      if (m & 4) bank = Math.min(bank, fy);
      if (m & 8) bank = Math.min(bank, 1 - fy);
    }
    if (bank < BANK) {
      if (bank > BANK - 0.05) return 0x5a8f38;
      return hash2(sx, sy) > 0.8 ? 0x8cc85e : 0x74b24c;
    }
    if (kind === 1) {
      // 흙길: 2칸 길 가운데 양쪽에 바퀴 자국, 작은 돌
      const alongY = (cx - 2) % 8 >= 6 && cx >= 2 && cx <= 41;
      const alongX = (cy - 2) % 8 >= 6 && cy >= 2 && cy <= 41;
      let c = FARM_DIRT[(dirt.at(gx, gy) * 3) | 0];
      const rut = (v: number) => {
        const f = frac((v - 2) / 8) * 8 - 6;
        return Math.abs(f - 0.55) < 0.08 || Math.abs(f - 1.45) < 0.08;
      };
      if ((alongY && !alongX && rut(gx)) || (alongX && !alongY && rut(gy))) c = 0x8e6a40;
      const h = hash2(sx, sy);
      if (h > 0.985) c = 0xd2c2a0;
      else if (h < 0.02) c = 0x7a5a36;
      return c;
    }
    // 풀밭: 들풀과 꽃
    let c = clover.at(gx, gy) > 0.7 ? 0x5f9a3c : FARM_MEADOW[(meadow.at(gx, gy) * 3) | 0];
    const h = hash2(sx, sy);
    if (h > 0.985) return FLOWERS[(hash2(sy, sx) * FLOWERS.length) | 0];
    if (h < 0.06) c = 0x5a8c36;
    return c;
  };
}

/** 작업장(과 농장) 바닥 한 장. paintGround와 같은 크기와 자리(왼쪽 위 = worldRect(size).left, 0)다. */
export function paintWorkGround(map: GameMap, id: WorkId | 'farm'): HTMLCanvasElement {
  const canvas = paintGround(map);
  // 칠한 픽셀만 불투명한 덧그림을 따로 만들어 위에 얹는다(바닥 그림을 읽어 오는 getImageData는 느리다).
  const image = new ImageData(canvas.width, canvas.height);
  const data = image.data;
  const { size, terrain } = map;
  const rect = worldRect(size);
  let ground: Shader;
  let water: Shader | null = null;
  if (id === 'fishing') ({ ground, water } = fishing(size));
  else ground = id === 'farm' ? farm(size) : id === 'quarry' ? quarry(size) : id === 'logging' ? logging(size) : gathering(size);
  const kindAt = (gx: number, gy: number) => (gx < 0 || gy < 0 || gx >= size || gy >= size ? -1 : terrain[(gx | 0) + (gy | 0) * size]);
  const bottom = Math.min(canvas.height, ORIGIN_Y + size * 16 + WATER_DROP);
  const width = canvas.width;
  for (let sy = ORIGIN_Y; sy < bottom; sy++) {
    const v = (sy + 0.5 - ORIGIN_Y) / 8;
    const w = v - WATER_DROP / 8;
    // 이 줄에서 맵 마름모가 걸치는 가로 범위만 돈다.
    const half = Math.min(v, size * 2 - v) * 16;
    const x0 = Math.max(0, Math.floor(ORIGIN_X - rect.left - half - 16));
    const x1 = Math.min(width, Math.ceil(ORIGIN_X - rect.left + half + 16));
    for (let sx = x0; sx < x1; sx++) {
      const u = (sx + 0.5 + rect.left - ORIGIN_X) / 16;
      let gx = (u + v) / 2;
      let gy = (v - u) / 2;
      let kind = kindAt(gx, gy);
      let paint: Shader | null = kind === Terrain.Ground ? ground : null;
      if (kind !== Terrain.Ground && water) {
        gx = (u + w) / 2;
        gy = (w - u) / 2;
        kind = kindAt(gx, gy);
        if (kind === Terrain.Water) paint = water;
      }
      if (!paint) continue;
      const c = paint(gx, gy, sx, sy);
      const i = (sy * width + sx) * 4;
      data[i] = (c >> 16) & 255;
      data[i + 1] = (c >> 8) & 255;
      data[i + 2] = c & 255;
      data[i + 3] = 255;
    }
  }
  const overlay = document.createElement('canvas');
  overlay.width = canvas.width;
  overlay.height = canvas.height;
  overlay.getContext('2d')!.putImageData(image, 0, 0);
  canvas.getContext('2d')!.drawImage(overlay, 0, 0);
  return canvas;
}
