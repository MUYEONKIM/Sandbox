import type { Area } from '../game/maps';
import { SNAIL_COLORS } from '../game/casino';
import {
  BULL,
  CAFE,
  EXCHANGE_TICKERS,
  FLOORS,
  LADDER_BOARD_X,
  MART_PROPS,
  ODDEVEN_BOARD_X,
  SNAIL_TRACK,
  type Doorway,
  type Flight,
  type FloorPlan,
  type TowerId,
} from '../game/tower';
import { frac, hash2, Pixels, ramp, shade, type Color } from './pixels';
import type { Art } from './props';

/**
 * 아이티공간 층 그림: 바닥과 뒤쪽 두 벽, 벽에 난 문을 한 장에 그린다.
 * 그림 맨 위에서 WALL_H만큼 내려온 곳이 바닥의 뒤쪽 모서리다.
 */
export const WALL_H = 76;
const PARAPET_H = 12;
const EDGE = 6;
/** 벽을 따라 한 칸이 차지하는 화면 너비 */
const U = 16;

type Wall = 'left' | 'right';

const OUTLINE = 0x2c2430;
const TRIM = 0xf6f7f8;
const FRAME = 0x5b6068;
const SIGN_GREEN = 0x2fa05a;
const PLANK = [0xb98a58, 0xc69866, 0xa97c4c, 0xd0a472];
const STEEL = [0x9aa3ad, 0xb4bcc5, 0xcfd6dd];
const SKY = [0x7fc4ea, 0xa9dcf3, 0xdff3fb];
const CITY = [0x46566f, 0x566781, 0x67799a];
const LEAVES = [0x3f8a35, 0x5aa83f, 0x7cc24f];
const GLASS = [0x4f7fa8, 0x6a9cc6, 0x8fbde0];

/** 벽에 쓰는 3×5 글꼴 */
const GLYPHS: Record<string, string[]> = {
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '0': ['111', '101', '101', '101', '111'],
  '5': ['111', '100', '111', '001', '111'],
  '9': ['111', '101', '111', '001', '111'],
  A: ['010', '101', '111', '101', '101'],
  C: ['111', '100', '100', '100', '111'],
  E: ['111', '100', '111', '100', '111'],
  F: ['111', '100', '110', '100', '100'],
  G: ['111', '100', '101', '101', '111'],
  H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  L: ['100', '100', '100', '100', '111'],
  // N도 M처럼 3칸이면 H와 헷갈려 4칸으로 쓴다.
  N: ['1001', '1101', '1011', '1001', '1001'],
  Y: ['101', '101', '010', '010', '010'],
  // W도 M처럼 5칸으로 쓴다.
  W: ['10001', '10001', '10101', '11011', '10001'],
  // M은 3칸으로 쓰면 H와 헷갈려 5칸으로 쓴다(글자 폭은 글자마다 다를 수 있다).
  M: ['10001', '11011', '10101', '10001', '10001'],
  T: ['111', '010', '010', '010', '010'],
  K: ['101', '101', '110', '101', '101'],
  O: ['111', '101', '101', '101', '111'],
  P: ['111', '101', '111', '100', '100'],
  R: ['110', '101', '110', '101', '101'],
  S: ['111', '100', '111', '001', '111'],
};

/** 글씨 한 줄의 너비(글자 사이 한 칸 포함, 배율 1) */
function textColumns(text: string) {
  return [...text].reduce((sum, ch) => sum + GLYPHS[ch][0].length + 1, -1);
}

/** 바닥 크기에 맞춘 도화지. 바닥은 W×D칸이고 오른쪽 벽이 W칸, 왼쪽 벽이 D칸이다. */
class Painter {
  readonly x0: number;
  readonly y0: number;
  readonly w: number;
  readonly d: number;
  /** 그림 안에서 바닥 뒤쪽 모서리의 x */
  readonly cx: number;
  readonly p: Pixels;

  constructor([x0, y0, x1, y1]: Area) {
    this.x0 = x0;
    this.y0 = y0;
    this.w = x1 - x0 + 1;
    this.d = y1 - y0 + 1;
    this.cx = this.d * 16;
    this.p = new Pixels((this.w + this.d) * 16, WALL_H + (this.w + this.d) * 8 + EDGE);
  }

  length(wall: Wall) {
    return (wall === 'right' ? this.w : this.d) * U;
  }

  /** 벽 위의 점. u는 뒤쪽 모서리에서 벽을 따라 잰 화면 너비, v는 바닥에서 위로 잰 높이다. */
  wall(wall: Wall, u: number, v: number, c: Color) {
    const y = WALL_H + u / 2 - v;
    if (wall === 'left') this.p.set(this.cx - u - 1, y, c);
    else this.p.set(this.cx + u, y, c);
  }

  wallRect(wall: Wall, u0: number, u1: number, v0: number, v1: number, shader: (u: number, v: number) => Color | null) {
    for (let u = Math.max(0, u0); u < Math.min(this.length(wall), u1); u++) {
      for (let v = Math.max(0, v0); v < v1; v++) {
        const c = shader(u, v);
        if (c !== null) this.wall(wall, u, v, c);
      }
    }
  }

  /** 글씨를 쓴다. 왼쪽 벽은 u가 커질수록 화면 왼쪽으로 가므로 글자 순서를 뒤집어야 바로 읽힌다. */
  text(wall: Wall, text: string, u0: number, v0: number, scale: number, c: Color) {
    const columns = textColumns(text);
    let left = 0;
    [...text].forEach((ch) => {
      const at = left;
      left += GLYPHS[ch][0].length + 1;
      GLYPHS[ch].forEach((row, ry) => {
        [...row].forEach((bit, rx) => {
          if (bit !== '1') return;
          const column = at + rx;
          const u = u0 + (wall === 'left' ? columns - 1 - column : column) * scale;
          const v = v0 + (4 - ry) * scale;
          this.wallRect(wall, u, u + scale, v, v + scale, () => c);
        });
      });
    });
  }

  /** 바닥 위의 점 (바닥 안쪽 격자 좌표, 바닥에서 z만큼 내려간 높이) */
  screen(gx: number, gy: number, z = 0) {
    return [this.cx + (gx - gy) * 16, WALL_H + (gx + gy) * 8 + z] as const;
  }

  doorCenter({ wall, at }: Doorway) {
    return (at - (wall === 'right' ? this.x0 : this.y0)) * U + U / 2;
  }
}

type FloorShader = (gx: number, gy: number, sx: number, sy: number) => Color;

/**
 * 계단 한 칸은 두 단이다. 단의 아래쪽 모서리에 띠와 그림자를 넣고, 올라가는 쪽으로 갈수록 밝게 해서 오르막으로 보이게 한다.
 * (gx, gy)는 바닥 안쪽 격자 좌표다.
 */
function stepColor(painter: Painter, flight: Flight, gx: number, gy: number, sx: number, sy: number, tread: Color, edge: Color, riser: Color): Color {
  const [x0, y0, x1, y1] = flight.area;
  const x = painter.x0 + gx;
  const y = painter.y0 + gy;
  // along: 내려가는 쪽으로 커지는 좌표, rise: 계단 안에서 0(아래)~1(위)
  const along = flight.up === 'x-' ? x : flight.up === 'y-' ? y : -y;
  const rise =
    flight.up === 'x-' ? (x1 + 1 - x) / (x1 - x0 + 1) : flight.up === 'y-' ? (y1 + 1 - y) / (y1 - y0 + 1) : (y - y0) / (y1 - y0 + 1);
  const s = frac(along * 2);
  if (s > 0.78) return riser;
  if (s > 0.7) return edge;
  return shade((sx + sy) % 3 === 0 ? shade(tread, 0.88) : tread, 1 + rise * 0.15);
}

/** 계단 칸이면 그 계단을 돌려준다. */
function flightAt(painter: Painter, plan: FloorPlan, gx: number, gy: number) {
  const x = painter.x0 + Math.floor(gx);
  const y = painter.y0 + Math.floor(gy);
  return plan.flights.find(({ area: [x0, y0, x1, y1] }) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
}

/** 아래층이 보이게 뚫린 바닥 칸인지 본다. */
function inVoid(painter: Painter, plan: FloorPlan, gx: number, gy: number) {
  const x = painter.x0 + Math.floor(gx);
  const y = painter.y0 + Math.floor(gy);
  return plan.voids.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
}

const LOBBY_STONE = [0xebe6da, 0xe4dfd2, 0xefeae0];
const PLANK_GROOVE = 0x6e4a2a;

/**
 * 1층 로비 바닥: 결이 비치는 베이지 대리석 판(한 칸 한 장)과 줄눈. 카페 구역은 못 자국과 나뭇결이 있는 긴 마루다.
 * 2026-11-16 '대장간 느낌'으로 다시 그림(재질이 살아 있는 바닥, 에이전트가 정함).
 */
function lobbyFloor(painter: Painter): FloorShader {
  const [cx0, cy0, cx1, cy1] = CAFE;
  const { x0, y0 } = painter;
  return (gx, gy, sx, sy) => {
    const inCafe = gx >= cx0 - x0 && gx < cx1 - x0 + 1 && gy >= cy0 - y0 && gy < cy1 - y0 + 1;
    if (inCafe) {
      const row = Math.floor(gy * 2);
      const along = gx + (row % 3) * 1.3;
      const seam = Math.floor(along / 2.6);
      const t = frac(along / 2.6);
      if (frac(gy * 2) < 0.1) return PLANK_GROOVE;
      if (t < 0.025) return 0x7e5834;
      const base = PLANK[Math.floor(hash2(row, seam) * PLANK.length)];
      // 판 양 끝의 못 자국 두 개
      if ((t < 0.06 || t > 0.96) && Math.abs(frac(gy * 2) - 0.55) < 0.12 && (sx & 1) === 0) return 0x5a3a20;
      return (sx + row * 7) % 9 === 0 || (sx + row * 5) % 13 === 0 ? shade(base, 0.9) : base;
    }
    const tx = Math.floor(gx);
    const ty = Math.floor(gy);
    if (frac(gx) < 0.04 || frac(gy) < 0.04) return 0xb7b0a2;
    const base = LOBBY_STONE[Math.floor(hash2(tx, ty) * LOBBY_STONE.length)];
    // 판마다 기울기가 다른 결 한두 줄
    const k = hash2(ty, tx + 31);
    const vein = frac(gx * (0.6 + k) + gy * (1.4 - k) + k * 5);
    if (vein < 0.025) return 0xcbc3b2;
    if (vein > 0.5 && vein < 0.51) return 0xd8d1c2;
    return hash2(sx >> 1, sy) > 0.97 ? shade(base, 0.95) : base;
  };
}

const CARPET_TILE = [0x5a6271, 0x606878];
const CARPET_GRAIN = CARPET_TILE.map((c) => shade(c, 0.93));
const CARPET_FLECK = CARPET_TILE.map((c) => shade(c, 1.1));

/**
 * 사무실 바닥: 반 칸 크기 카펫 타일을 한 장씩 결 방향을 돌려 깐다(가로 결, 세로 결). 계단과 뚫린 바닥은 그대로다.
 * 7, 8층은 바닥이 커서(62×80칸) 픽셀마다 계산을 적게 한다.
 */
function officeFloor(painter: Painter, plan: FloorPlan): FloorShader {
  const flights = plan.flights.length > 0;
  const voids = plan.voids.length > 0;
  return (gx, gy, sx, sy) => {
    if (flights) {
      const flight = flightAt(painter, plan, gx, gy);
      if (flight) return stepColor(painter, flight, gx, gy, sx, sy, 0xb7bcc4, 0x2f3338, 0x4f5560);
    }
    const cx = Math.floor(gx * 2);
    const cy = Math.floor(gy * 2);
    const k = (cx * 7 + cy * 3) % 5 === 0 ? 1 : 0;
    // 결: 타일마다 가로·세로를 번갈아. 한 장에 줄 넷.
    const grain = (cx + cy) & 1 ? frac(gx * 8) : frac(gy * 8);
    const n = hash2(sx, sy);
    const color = n < 0.06 ? CARPET_FLECK[k] : n > 0.97 ? 0x4c5361 : grain < 0.5 ? CARPET_TILE[k] : CARPET_GRAIN[k];
    // 뚫린 바닥 너머로 아래층 바닥이 어둡게 보인다.
    return voids && inVoid(painter, plan, gx, gy) ? shade(color, 0.45) : color;
  };
}

/** 판 밝기(셋) × 얼룩(없음, 있음)마다 [어두운 점, 바탕, 밝은 점] */
const ROOF_TONES = [0x9d9d97, 0xa3a39e, 0xaaaaa4, 0x929290, 0x989893, 0x9e9e99].map((c) => [shade(c, 0.95), c, shade(c, 1.05)]);

/** 옥상 바닥: 한 칸짜리 콘크리트 판과 줄눈, 빗물 얼룩과 배수구, 난간 안쪽 노란 안전선. 가운데 헬기 착륙장. */
function roofFloor(painter: Painter): FloorShader {
  const cx = painter.w / 2;
  const cy = painter.d / 2;
  return (gx, gy, sx, sy) => {
    const u = gy - cy;
    const w = gx - cx;
    if (Math.abs(u) < 5 && Math.abs(w) < 5) {
      const r = Math.hypot(u, w);
      if (r > 4.4 && r < 5) return 0xf2c14e;
      const h = (Math.abs(u + 1.4) < 0.4 || Math.abs(u - 1.4) < 0.4) && Math.abs(w) < 2.1;
      if (h || (Math.abs(w) < 0.35 && Math.abs(u) < 1.4)) return 0xf4f4f0;
    }
    // 난간 안쪽 노란 안전선(뒤쪽 두 변과 앞쪽 두 변)
    const edge = Math.min(gx, gy, painter.w - gx, painter.d - gy);
    if (edge > 0.55 && edge < 0.7) return (Math.floor((gx + gy) * 2) & 1) === 0 ? 0xf2c14e : 0x3a3a3a;
    const tx = Math.floor(gx);
    const ty = Math.floor(gy);
    if (frac(gx) < 0.035 || frac(gy) < 0.035) return 0x7f7f79;
    // 8칸마다 배수구
    if (tx % 8 === 4 && ty % 8 === 4 && Math.abs(frac(gx) - 0.5) < 0.18 && Math.abs(frac(gy) - 0.5) < 0.18) {
      return (sx + sy) % 2 === 0 ? 0x4a4a46 : 0x5e5e59;
    }
    // 판마다 밝기가 조금 다르고, 3칸 덩어리로 빗물 얼룩이 진다.
    const tone = hash2(tx, ty);
    const stain = hash2(Math.floor(tx / 3), Math.floor(ty / 3) + 90) > 0.78 && tone > 0.3;
    const k = (tone < 0.3 ? 0 : tone > 0.8 ? 2 : 1) + (stain ? 3 : 0);
    const n = hash2(sx, sy);
    return ROOF_TONES[k][n < 0.15 ? 0 : n > 0.92 ? 2 : 1];
  };
}

/** 바깥 계단: 층참은 미끄럼 방지 철판, 계단은 한 칸에 두 단이고 뒤쪽(왼쪽 위)으로 갈수록 높다. */
function stairsFloor(painter: Painter, plan: FloorPlan): FloorShader {
  return (gx, gy, sx, sy) => {
    const flight = flightAt(painter, plan, gx, gy);
    if (!flight) return (sx + 2 * sy) % 6 === 0 ? 0xa3a9b0 : 0x8a9098;
    return stepColor(painter, flight, gx, gy, sx, sy, 0x7d838c, 0xf2c14e, 0x3e4248);
  };
}

/** 엘리베이터 바닥: 작은 검은 타일 */
function cabinFloor(): FloorShader {
  return (gx, gy) => {
    if (frac(gx * 2) < 0.06 || frac(gy * 2) < 0.06) return 0x2b2f36;
    return (Math.floor(gx * 2) + Math.floor(gy * 2)) & 1 ? 0x3a3f46 : 0x454b53;
  };
}

const CARPET = [0x7a1824, 0x8a1e2a];
const CASINO_GOLD = 0xd9b45a;
const DIM_GOLD = 0xb08a3e;

/** 도박장 바닥: 금색 마름모 무늬 붉은 카펫. 벽에 건 게임판 앞에는 금테 두른 펠트를 깔았다. */
function casinoFloor(painter: Painter): FloorShader {
  const felts = [
    { gx: LADDER_BOARD_X - painter.x0 + 0.5, color: 0x23466e },
    { gx: ODDEVEN_BOARD_X - painter.x0 + 0.5, color: 0x1f5e3a },
  ];
  return (gx, gy, sx, sy) => {
    for (const felt of felts) {
      const du = Math.abs(gx - felt.gx);
      if (du < 2.4 && gy > 0.3 && gy < 3.4) {
        if (du > 2.15 || gy < 0.55 || gy > 3.15) return DIM_GOLD;
        return hash2(sx, sy) < 0.15 ? shade(felt.color, 0.9) : felt.color;
      }
    }
    // 2×2칸마다 무늬 한 벌: 가는 금 마름모 격자, 가운데 청록 원과 금 테, 원 둘레 꽃잎 넷, 칸 사이 작은 금점.
    const a = frac(gx / 2);
    const b = frac(gy / 2);
    const da = a - 0.5;
    const db = b - 0.5;
    if (a < 0.016 || b < 0.016) return DIM_GOLD;
    const r = Math.hypot(da, db);
    if (r < 0.035) return CASINO_GOLD;
    if (r < 0.12) return (sx + sy) % 4 === 0 ? 0x123a36 : 0x184c49;
    if (r < 0.15) return CASINO_GOLD;
    const petal = Math.min(Math.abs(Math.abs(da) - 0.25) + Math.abs(db), Math.abs(da) + Math.abs(Math.abs(db) - 0.25));
    if (petal < 0.055) return petal < 0.025 ? 0xe8c46a : DIM_GOLD;
    // 칸 사이 가는 마름모 테(화면에서는 납작한 다이아몬드)
    const ring = Math.abs(Math.abs(da) + Math.abs(db) - 0.36);
    if (ring < 0.012) return 0x9a2a30;
    const base = Math.abs(da) + Math.abs(db) < 0.36 ? CARPET[1] : CARPET[0];
    // 털 결: 짧은 점들
    return hash2(sx >> 1, sy) > 0.92 ? shade(base, 0.86) : base;
  };
}

const EXCHANGE_GOLD = 0xd2a84a;
const EXCHANGE_GOLD_DIM = 0x9c7a34;
const GRANITE_TILES = [0x2b3342, 0x323b4c];
const RUNNER = [0x8e1f28, 0x7a1820];
/** 시세판과 차트의 오름(빨강), 내림(파랑). 우리나라 증권 색이다. */
const MARKET_UP = 0xff4b3e;
const MARKET_DOWN = 0x4d8dff;

/** 증권거래소 바닥: 짙은 남색 돌 타일, 종목 창구 앞 매트, 나가는 문에서 황소까지 붉은 카펫, 황소 둘레 금빛 원 */
function nearestTicker<T extends { gx: number }>(tickers: T[], gx: number): T {
  return tickers.reduce((best, t) => (Math.abs(t.gx - gx) < Math.abs(best.gx - gx) ? t : best));
}

function exchangeFloor(painter: Painter): FloorShader {
  const bull = { gx: BULL.x - painter.x0 + BULL.w / 2, gy: BULL.y - painter.y0 + BULL.d / 2 };
  const tickers = EXCHANGE_TICKERS.map((ticker) => ({ gx: ticker.x - painter.x0 + 0.5, color: ticker.color }));
  // 전광판 앞에 깐 긴 매트. 맨 뒤 띠는 위 전광판 칸마다 그 회사 색이다.
  const m0 = tickers[0].gx - 1.9;
  const m1 = tickers[tickers.length - 1].gx + 1.9;
  return (gx, gy, sx, sy) => {
    if (gx > m0 && gx < m1 && gy > 0.3 && gy < 3.4) {
      if (gx - m0 < 0.18 || m1 - gx < 0.18 || gy < 0.48 || gy > 3.22) return EXCHANGE_GOLD_DIM;
      if (gy < 0.75) return nearestTicker(tickers, gx).color;
      return hash2(sx, sy) < 0.12 ? 0x1b2333 : 0x202a3d;
    }
    const r = Math.hypot(gx - bull.gx, gy - bull.gy);
    if (r > 1.9 && r < 2.12) return EXCHANGE_GOLD;
    const dx = Math.abs(gx - bull.gx);
    if (gy > bull.gy + 2 && dx < 0.96) {
      if (dx > 0.8) return EXCHANGE_GOLD_DIM;
      return RUNNER[hash2(sx >> 1, sy) > 0.93 ? 1 : 0];
    }
    if (r <= 1.9) return (sx + sy) % 5 === 0 ? 0x4a5468 : 0x3e475a;
    // 3칸마다 금 상감 줄
    if (frac(gx / 3) < 0.012 || frac(gy / 3) < 0.012) return EXCHANGE_GOLD_DIM;
    if (frac(gx) < 0.03 || frac(gy) < 0.03) return 0x161c27;
    const tx = Math.floor(gx);
    const ty = Math.floor(gy);
    let base = GRANITE_TILES[(tx + ty) & 1];
    // 갈아 낸 화강암: 흰 알갱이와 검은 알갱이
    const n = hash2(sx, sy);
    if (n > 0.985) return 0x5b6478;
    if (n < 0.02) return 0x161b24;
    // 천장 조명이 비친 긴 빛줄(화면 대각선)
    const glare = frac((gx - gy) * 0.18 + hash2(tx, ty) * 0.05);
    if (glare < 0.04) base = shade(base, 1.12);
    else if (glare < 0.08) base = shade(base, 1.05);
    return base;
  };
}

/** 빈방 바닥 돌 두 가지 색과 줄눈(로비 대리석 색에서 결을 뺀 것) */
const PLAIN_STONE = [0xebe6da, 0xe6e1d5];
const PLAIN_GROUT = 0xcdc6b8;

/** 빈방 바닥(이름 없는 방, 2026-11-24 에이전트가 정함): 한 칸에 한 장인 밝은 돌판과 가는 줄눈. 결이나 무늬는 넣지 않는다. 방 전체가 한 가지다. */
function plainFloor(): FloorShader {
  return (gx, gy) => {
    if (frac(gx) < 0.04 || frac(gy) < 0.04) return PLAIN_GROUT;
    return PLAIN_STONE[Math.floor(hash2(Math.floor(gx), Math.floor(gy)) * PLAIN_STONE.length)];
  };
}

const TERRAZZO = [0xeeece6, 0xe8e6df, 0xf2f0eb];
const COLD_LIGHT = 0xdcf2ff;

/**
 * 상점 안 바닥: 반 칸 크기 테라초 타일(돌 조각이 박힌 흰 바닥)과 줄눈, 군데군데 끌린 자국.
 * 냉장고·냉동고 앞에는 찬 불빛이 번진다(MART_PROPS에서 자리를 읽는다).
 */
function martFloor(painter: Painter): FloorShader {
  const lights = MART_PROPS.filter((p) => /fridge|freezer/.test(p.sprite)).map((p) => ({
    gx: p.x - painter.x0 + p.w / 2,
    gy: p.y - painter.y0 + p.d / 2,
  }));
  return (gx, gy, sx, sy) => {
    let c: Color;
    if (frac(gx * 2) < 0.05 || frac(gy * 2) < 0.05) c = 0xc9c6bf;
    else {
      const tx = Math.floor(gx * 2);
      const ty = Math.floor(gy * 2);
      c = TERRAZZO[Math.floor(hash2(tx, ty) * TERRAZZO.length)];
      const n = hash2(sx, sy);
      if (n < 0.022) c = 0xb3afa7;
      else if (n < 0.03) c = 0xd9ab9a;
      else if (n < 0.038) c = 0xadbdca;
      else if (hash2(Math.floor(gx * 3), Math.floor(gy * 3) + 77) > 0.94 && (sx + sy) % 3 === 0) c = shade(c, 0.94);
    }
    let glow = 0;
    for (const light of lights) glow = Math.max(glow, 1 - Math.hypot(gx - light.gx, gy - light.gy) / 2.2);
    return glow > 0 ? mix(c, COLD_LIGHT, Math.round(glow * 4) * 0.09) : c;
  };
}

const FLAGSTONE = [0x6f6a62, 0x7a756c, 0x666159];

/** 대장간 안 바닥: 칸마다 크기가 다른 돌판 넷, 그 사이 흙 줄눈과 군데군데 흙 얼룩 */
function smithyFloor(): FloorShader {
  return (gx, gy, sx, sy) => {
    const tx = Math.floor(gx);
    const ty = Math.floor(gy);
    const cutX = 0.35 + hash2(tx, ty) * 0.3;
    const cutY = 0.35 + hash2(ty, tx + 7) * 0.3;
    const fx = frac(gx);
    const fy = frac(gy);
    if (fx < 0.05 || fy < 0.05 || Math.abs(fx - cutX) < 0.035 || Math.abs(fy - cutY) < 0.035) return 0x3e3a35;
    const piece = (fx > cutX ? 1 : 0) + (fy > cutY ? 2 : 0);
    const base = FLAGSTONE[Math.floor(hash2(tx * 4 + piece, ty) * FLAGSTONE.length)];
    const c = hash2(Math.floor(gx * 3), Math.floor(gy * 3) + 50) > 0.86 ? mix(base, 0x6b5136, 0.45) : base;
    return hash2(sx, sy) > 0.93 ? shade(c, 0.88) : c;
  };
}

const OAK_BLOCKS = [0xb88a55, 0xc4965f, 0xa97c4a, 0xd0a46c];

/**
 * 노동청 안 바닥(2026-11-16, 에이전트가 정함): 반 칸마다 나무 조각 셋을 결 방향을 번갈아 깐 바구니 짜임 마루.
 * 창구 앞과 문에서 창구까지는 많이 밟혀 조금 밝다.
 */
function laborFloor(painter: Painter): FloorShader {
  // 창구 앞(바닥 안쪽 7.5, 4.5)에서 나가는 문 앞(앞-오른쪽 변 가운데)까지
  const [ax, ay] = [7.5, 4.5];
  const [bx, by] = [painter.w - 0.5, Math.floor(painter.d / 2) + 0.5];
  const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
  const onPath = (gx: number, gy: number) => {
    const t = Math.max(0, Math.min(1, ((gx - ax) * (bx - ax) + (gy - ay) * (by - ay)) / len2));
    return Math.hypot(gx - ax - t * (bx - ax), gy - ay - t * (by - ay)) < 0.9;
  };
  return (gx, gy, sx) => {
    const cx = Math.floor(gx * 2);
    const cy = Math.floor(gy * 2);
    const across = (cx + cy) & 1 ? frac(gx * 2) : frac(gy * 2);
    const along = (cx + cy) & 1 ? frac(gy * 2) : frac(gx * 2);
    if (frac(gx * 2) < 0.04 || frac(gy * 2) < 0.04) return 0x6e4a2a;
    const plank = Math.floor(across * 3);
    if (frac(across * 3) < 0.08) return 0x8f6640;
    let c = OAK_BLOCKS[Math.floor(hash2(cx * 3 + plank, cy) * OAK_BLOCKS.length)];
    if ((sx + Math.floor(along * 9) * 3) % 11 === 0) c = shade(c, 0.94);
    // 문에서 창구까지 닳은 길
    return onPath(gx, gy) ? shade(c, 1.08) : c;
  };
}

const BARN_PLANKS = [0x8a6440, 0x96704a, 0x7e5a38];

/** 농협 안 바닥(에이전트가 정함): 반 칸 너비의 넓은 헛간 널, 줄마다 이음매가 어긋나고 옹이와 흘린 짚이 보인다. */
function farmcoopFloor(): FloorShader {
  return (gx, gy, sx, sy) => {
    const row = Math.floor(gy * 2);
    const along = gx + hash2(row, 3) * 3;
    const board = Math.floor(along / (2 + (row % 3)));
    if (frac(gy * 2) < 0.07) return 0x4a3220;
    if (frac(along / (2 + (row % 3))) < 0.02) return 0x553a24;
    let c = BARN_PLANKS[Math.floor(hash2(row, board) * BARN_PLANKS.length)];
    // 옹이: 널마다 하나쯤
    const kx = board * (2 + (row % 3)) - hash2(row, 3) * 3 + 0.4 + hash2(board, row) * 1.4;
    const knot = Math.hypot((gx - kx) * 2.2, (frac(gy * 2) - 0.5) * 1.1);
    if (knot < 0.12) return 0x4a3220;
    if (knot < 0.2) c = shade(c, 0.86);
    if ((sx * 2 + row * 5) % 11 === 0) c = shade(c, 0.92);
    const n = hash2(sx, sy);
    if (n > 0.996) return 0xe8c86a;
    if (n > 0.993) return 0xc9a34e;
    return c;
  };
}

/** 스타일마다 바닥. 상점(mart)과 대장간(smithy)은 tower.ts의 FloorPlan.style에 더해지면 쓰인다. */
const FLOOR_SHADERS: Record<string, (painter: Painter, plan: FloorPlan) => FloorShader> = {
  lobby: lobbyFloor,
  office: officeFloor,
  roof: roofFloor,
  stairs: stairsFloor,
  cabin: cabinFloor,
  casino: casinoFloor,
  exchange: exchangeFloor,
  plain: plainFloor,
  hideout: hideoutFloor,
  mart: martFloor,
  smithy: smithyFloor,
  labor: laborFloor,
  farmcoop: farmcoopFloor,
};

/** 건물 바깥 유리벽. 바깥 계단 뒤에 보인다. */
function paintFacade(painter: Painter, plan: FloorPlan) {
  for (const wall of ['left', 'right'] as Wall[]) {
    painter.wallRect(wall, 0, painter.length(wall), 0, WALL_H, (u, v) => {
      if (v < 4) return FRAME;
      if (v >= WALL_H - 3) return 0x9aa3ad;
      if (v >= 34 && v < 40) return 0x8a929c;
      if (u % 32 < 2) return 0x3d4f63;
      if ((u + v) % 47 < 3) return 0xb9daf0;
      return ramp(GLASS, (v % 34) / 34, u, v);
    });
  }
  const bottom = plan.doorways.find((door) => door.wall === 'right');
  if (bottom) painter.text('right', '8F', painter.doorCenter(bottom) - 60, 14, 3, 0xf4f4f0);
  painter.text('right', 'RF', 40, 44, 3, 0xf4f4f0);
}

/** 엘리베이터 안 벽: 철판, 나무 손잡이, 왼쪽 벽의 거울 */
function paintCabin(painter: Painter) {
  for (const wall of ['left', 'right'] as Wall[]) {
    painter.wallRect(wall, 0, painter.length(wall), 0, WALL_H, (u, v) => {
      if (v < 4) return 0x2b2f36;
      if (v >= WALL_H - 4) return 0xf6f3e0;
      if (v >= 26 && v < 30) return v === 26 ? 0xd0a472 : 0xa97c4c;
      if (wall === 'left' && u >= 10 && u < 54 && v >= 34 && v < 70) {
        if (u === 10 || u === 53 || v === 34 || v === 69) return 0x8a929c;
        return (u + v) % 19 < 2 ? 0xf2f8fb : ramp([0xa8c4d4, 0xc4dae6, 0xdcebf3], (v - 34) / 36, u, v);
      }
      if (u % 16 === 0) return 0x7d858f;
      return STEEL[Math.floor(((u % 16) / 16) * STEEL.length)];
    });
  }
}

/** 도박장 벽: 아래는 짙은 나무 판, 위는 마름모 무늬 벽지, 맨 위에는 전구 줄. 오른쪽 벽에 사다리판과 홀짝판, 왼쪽 벽에 달팽이 경주 점수판을 건다. */
function paintCasinoWalls(painter: Painter) {
  const DAMASK = [0x4a1420, 0x521722];
  const DAMASK_INK = 0x6e1e2a;
  const WARM = 0xffb070;
  const ladderU = (LADDER_BOARD_X - painter.x0) * U + U / 2;
  const oddEvenU = (ODDEVEN_BOARD_X - painter.x0) * U + U / 2;
  const signU = Math.round((ladderU + oddEvenU) / 2);
  const [, sy0, , sy1] = SNAIL_TRACK;
  /** 벽등을 달 자리: 게임판과 점수판, 가운데 간판을 피한다. */
  const sconces: Record<Wall, number[]> = {
    right: [24, painter.length('right') - 24],
    left: [(sy0 - painter.y0) * U - 4, (sy1 + 1 - painter.y0) * U + 4],
  };
  for (const wall of ['left', 'right'] as Wall[]) {
    const lights = sconces[wall];
    painter.wallRect(wall, 0, painter.length(wall), 0, WALL_H, (u, v) => {
      // 검은 대리석 걸레받이와 흰 결
      if (v < 6) return (u + v * 3) % 23 === 0 || (u * 2 + v) % 31 === 0 ? 0x5a5660 : 0x16141a;
      if (v === 6) return DIM_GOLD;
      // 호두나무 판벽: 32픽셀 판마다 도드라진 테와 금 선
      if (v < 23) {
        const pu = u % 32;
        if (pu < 2 || pu > 29 || v === 7 || v === 22) return 0x5a3422;
        if (((pu === 4 || pu === 27) && v >= 10 && v <= 19) || ((v === 10 || v === 19) && pu >= 4 && pu <= 27)) return DIM_GOLD;
        return u % 5 === 0 ? 0x351c12 : 0x3e2216;
      }
      // 금 의자 띠
      if (v < 26) return v === 24 ? CASINO_GOLD : DIM_GOLD;
      // 위: 다마스크 벽지, 이마돌림, 전구 줄
      if (v >= WALL_H - 3) return CASINO_GOLD;
      if (v >= 68) return v === 68 ? DIM_GOLD : 0x1e0a08;
      if (v >= 64) return v === 66 ? DIM_GOLD : 0x2a140c;
      const lu = u % 16;
      const lv = (v - 26) % 16;
      const motif = Math.abs(lu - 8) * 1.3 + Math.abs(lv - 8) < 6 && !(Math.abs(lu - 8) < 2 && lv < 5);
      const dot = Math.abs(lu - 0.5) + Math.abs(lv - 0.5) < 2;
      let c: Color = motif || dot ? DAMASK_INK : DAMASK[(u >> 4) & 1];
      // 벽등 둘레가 따뜻하게 비친다.
      for (const at of lights) {
        const r = Math.hypot((u - at) * 0.8, v - 58);
        if (r < 16) c = mix(c, WARM, Math.round((1 - r / 16) * 3) * 0.12);
      }
      return c;
    });
    for (let u = 4; u < painter.length(wall) - 2; u += 8) {
      const on = Math.floor(u / 8) & 1;
      painter.wallRect(wall, u, u + 2, 69, 71, () => (on ? 0xffe08a : 0xff7a5a));
    }
    // 금 벽등: 받침, 갓, 불꽃 모양 전구
    for (const at of lights) {
      painter.wallRect(wall, at - 2, at + 2, 48, 56, (_u, v) => (v === 48 || v === 55 ? CASINO_GOLD : DIM_GOLD));
      painter.wallRect(wall, at - 4, at + 4, 56, 58, () => CASINO_GOLD);
      painter.wallRect(wall, at - 1, at + 1, 58, 62, (_u, v) => (v === 61 ? 0xfff6d8 : 0xffe08a));
    }
  }

  // 게임판 사이 네온 간판: 검은 판에 분홍 네온 777, 청록 네온 테. 둘레 벽이 분홍빛으로 물든다.
  const neonW = textColumns('777') * 3 + 10;
  const n0 = signU - Math.floor(neonW / 2);
  painter.wallRect('right', n0 - 4, n0 + neonW + 4, 37, 67, (u, v) => {
    const out = Math.max(n0 - u, u - (n0 + neonW - 1), 41 - v, v - 62);
    if (out > 0) return out <= 2 ? 0x9a2a5a : 0x7a2040;
    if (out === 0) return 0x2a2a30;
    if (out === -2) return 0x5ff0ff;
    if (out === -1 || out === -3) return 0x1f6a72;
    return 0x0e0c12;
  });
  painter.wallRect('right', n0 + 4, n0 + neonW - 4, 44, 60, (u, v) => (hash2(u, v) > 0.5 ? 0x3a1430 : null));
  painter.text('right', '777', n0 + 5, 44, 3, 0xff4fb8);
  painter.text('right', '777', n0 + 5, 45, 3, 0xffb0e0);

  // 왼쪽 벽 귀퉁이 둘: 금 액자에 든 큰 카드(스페이드 A, 하트 K)
  const card = (center: number, rank: string, red: boolean) => {
    painter.wallRect('left', center - 10, center + 10, 44, 68, (u, v) => {
      if (u <= center - 9 || u >= center + 8 || v <= 45 || v >= 66) return CASINO_GOLD;
      if (u <= center - 7 || u >= center + 6 || v <= 47 || v >= 64) return 0x2a140c;
      const pip = Math.hypot(u - center, (v - 55) * 1.2);
      if (pip < 4.5) return red ? 0xd8413b : 0x1d1d22;
      return 0xf6f1e4;
    });
    painter.text('left', rank, center + 1, 58, 1, red ? 0xd8413b : 0x1d1d22);
  };
  card(30, 'A', false);
  card(painter.length('left') - 26, 'K', true);

  // 사다리판: 세로줄 둘, 가로줄 넷. 위는 출발(좌 빨강, 우 파랑), 아래는 도착 표시다.
  const ladder = (LADDER_BOARD_X - painter.x0) * U + U / 2;
  painter.wallRect('right', ladder - 26, ladder + 26, 14, 66, (u, v) => {
    const du = u - ladder;
    if (Math.abs(du) >= 24 || v < 16 || v >= 64) return CASINO_GOLD;
    const rail = Math.abs(du + 11) <= 1 || Math.abs(du - 11) <= 1;
    if (rail && v >= 24 && v <= 55) return 0x2c2430;
    const rung = [27, 34, 41, 48].findIndex((r) => v >= r && v < r + 2);
    if (rung >= 0 && Math.abs(du) <= 11) return rung & 1 ? 0x2f5fa8 : 0xd8413b;
    const nearRail = Math.abs(Math.abs(du) - 11) <= 2;
    if (nearRail && v >= 57 && v < 61) return du < 0 ? 0xd8413b : 0x2f5fa8;
    if (nearRail && v >= 18 && v < 22) return 0x2c2430;
    return 0xf4f1ea;
  });

  // 홀짝판: 왼쪽은 홀(빨강, 구슬 셋), 오른쪽은 짝(파랑, 구슬 넷)
  const oddEven = (ODDEVEN_BOARD_X - painter.x0) * U + U / 2;
  const marbles = [
    [-16, 48],
    [-8, 40],
    [-16, 32],
    [8, 48],
    [16, 48],
    [8, 32],
    [16, 32],
  ];
  painter.wallRect('right', oddEven - 26, oddEven + 26, 14, 66, (u, v) => {
    const du = u - oddEven;
    if (Math.abs(du) >= 24 || v < 16 || v >= 64 || du === 0 || du === -1) return CASINO_GOLD;
    for (const [mu, mv] of marbles) {
      if ((du - mu) ** 2 + (v - mv) ** 2 <= 10) return du < mu && v > mv ? 0xffffff : 0xd6dce4;
    }
    return du < 0 ? 0xb23a3a : 0x2f5fa8;
  });

  // 달팽이 경주 점수판: 왼쪽 벽, 경주로 바로 위. 출발은 앞쪽(u가 큰 쪽), 결승은 뒤쪽이다.
  const [, ty0, , ty1] = SNAIL_TRACK;
  const s0 = (ty0 - painter.y0) * U + 4;
  const s1 = (ty1 + 1 - painter.y0) * U - 4;
  painter.wallRect('left', s0, s1, 26, 68, (u, v) => {
    if (u < s0 + 2 || u >= s1 - 2 || v < 28 || v >= 66) return 0x6a4430;
    if (u < s0 + 8) return (Math.floor(u / 2) + Math.floor(v / 2)) & 1 ? 0xf4f4f0 : 0x1d1d22;
    return 0x24402e;
  });
  SNAIL_COLORS.forEach((color, lane) => {
    const v0 = 54 - lane * 12;
    painter.text('left', String(lane + 1), s1 - 12, v0, 2, 0xf4f1ea);
    for (let u = s0 + 12; u < s1 - 16; u += 4) painter.wallRect('left', u, u + 2, v0 + 4, v0 + 5, () => 0x6f8f78);
    const at = s1 - 26 - Math.floor(hash2(lane, 9) * (s1 - s0 - 60));
    painter.wallRect('left', at - 3, at + 3, v0 + 2, v0 + 8, (u, v) => (Math.hypot(u - at, v - v0 - 5) < 3 ? color : null));
    painter.wallRect('left', at - 2, at + 7, v0 + 2, v0 + 4, () => 0xe8d8a8);
  });
}

/**
 * 증권거래소 벽: 아래는 짙은 호두나무 판, 위는 남색 벽, 금빛 띠와 천장 조명.
 * 오른쪽 벽에 종목 시세판 넷(숫자는 화면 위 글씨로 따로 띄운다), 왼쪽 벽에 큰 KOSPI 차트 화면을 건다.
 */
function paintExchangeWalls(painter: Painter) {
  const NAVY = 0x1f2c47;
  for (const wall of ['left', 'right'] as Wall[]) {
    painter.wallRect(wall, 0, painter.length(wall), 0, WALL_H, (u, v) => {
      // 검은 화강암 걸레받이
      if (v < 5) return hash2(u, v) > 0.9 ? 0x3a4050 : 0x14161c;
      // 호두나무 판벽(48픽셀 판, 도드라진 테)
      if (v < 21) {
        const pu = u % 48;
        if (pu < 2 || pu > 45 || v === 5 || v === 20) return 0x5a3a22;
        if (pu === 5 || pu === 42 || v === 8 || v === 17) return 0x4a3020;
        return (u + v * 2) % 7 === 0 ? 0x2e1e10 : 0x3a2616;
      }
      // 놋쇠 손잡이 띠
      if (v < 24) return v === 21 ? EXCHANGE_GOLD_DIM : v === 22 ? EXCHANGE_GOLD : 0xf0d488;
      if (v >= WALL_H - 3) return EXCHANGE_GOLD;
      if (v >= 70) return v === 70 ? EXCHANGE_GOLD_DIM : 0x141c2e;
      if (v >= 66) return v === 67 ? EXCHANGE_GOLD : 0x18233a;
      // 64픽셀마다 홈 파인 기둥, 그 사이는 남색 천 벽
      const pu = u % 64;
      if (pu < 8) {
        if (v >= 62) return EXCHANGE_GOLD_DIM;
        return pu === 0 || pu === 7 ? 0x18233a : pu & 1 ? 0x24324f : 0x2c3c5e;
      }
      // 천장 조명이 벽에 그리는 빛 부채
      const c = 36;
      const spread = Math.abs(pu - c);
      const lit = v > 40 && spread < (70 - v) * 0.45 + 3;
      const base = (u + v) % 4 === 0 ? 0x1c2842 : NAVY;
      return lit ? mix(base, 0x3a5080, Math.min(1, (v - 40) / 30) * 0.55) : base;
    });
    for (let u = 34; u < painter.length(wall) - 4; u += 64) painter.wallRect(wall, u, u + 4, 70, 72, () => 0xfff4d0);
  }

  // 큰 시세 전광판 하나: 쇠 테두리, 검은 판을 종목 칸으로 나누고 칸 아래 띠는 회사 색, 맨 위는 주황 LED 흐름 글씨 줄
  const columns = EXCHANGE_TICKERS.map(({ x, color }) => ({ gx: (x - painter.x0) * U + U / 2, color }));
  const b0 = columns[0].gx - 28;
  const b1 = columns[columns.length - 1].gx + 28;
  painter.wallRect('right', b0, b1, 10, 66, (u, v) => {
    if (u - b0 < 2 || b1 - u <= 2 || v < 12 || v >= 64) return 0x3a414c;
    const column = nearestTicker(columns, u);
    const half = (columns[1].gx - columns[0].gx) / 2;
    const seam = Math.abs(Math.abs(u - column.gx) - half);
    if (seam < 1 && v >= 18 && v < 54) return 0x2a313c;
    if (v < 18) return v === 17 ? shade(column.color, 1.35) : column.color;
    if (v >= 55 && v < 62) {
      if (u % 2 || v % 2) return 0x0b0e13;
      return hash2(u >> 1, v >> 1) > 0.55 ? 0xffb347 : 0x2a1e10;
    }
    return u % 3 === 0 && v % 3 === 0 ? 0x1a212b : 0x0b0e13;
  });

  // KOSPI 차트 화면(아래 책상 모니터보다 높게). 왼쪽 벽은 u가 커질수록 화면 왼쪽이라 시간은 u가 줄어드는 쪽으로 흐른다.
  // 화면 빛이 둘레 벽에 푸르게 번진다.
  const u0 = 72;
  const u1 = 264;
  const sv0 = 28;
  painter.wallRect('left', u0 - 4, u1 + 4, sv0 - 4, 72, (u, v) => {
    const out = Math.max(u0 - u, u - (u1 - 1), sv0 - v, v - 69);
    if (out > 0) return out <= 2 ? 0x2c4a7a : 0x24385e;
    if (u < u0 + 2 || u >= u1 - 2 || v < sv0 + 2 || v >= 68) return 0x3a414c;
    if (v >= 58) return v === 58 ? 0x2a3140 : 0x10151d;
    return (u - u0) % 24 === 0 || (v - sv0) % 8 === 0 ? 0x18202c : 0x0b0e13;
  });
  painter.text('left', 'KOSPI', u1 - 6 - 19 * 2, 60, 2, 0xffc34d);
  const candles = 14;
  const step = Math.floor((u1 - u0 - 16) / candles);
  let close = 40;
  for (let i = 0; i < candles; i++) {
    const open = close;
    // 대체로 오르는 장. 정해진 씨앗이라 늘 같은 모양이다.
    close = Math.max(sv0 + 6, Math.min(54, open + Math.round((hash2(i, 41) - 0.38) * 7)));
    const high = Math.max(open, close) + 1 + Math.floor(hash2(i, 7) * 2);
    const low = Math.min(open, close) - 1 - Math.floor(hash2(i, 13) * 2);
    const color = close >= open ? MARKET_UP : MARKET_DOWN;
    const at = u1 - 10 - i * step;
    painter.wallRect('left', at - 1, at, Math.max(low, sv0 + 3), Math.min(high, 57), () => color);
    painter.wallRect('left', at - 4, at + 3, Math.min(open, close), Math.max(open, close) + 1, () => color);
  }

  // 왼쪽 벽 뒤쪽: 세계 시계 둘(서울, 뉴욕). 바늘은 서로 14시간 어긋나 있다.
  ([
    [22, 'SEL', 10, 2],
    [52, 'NYC', 20, 2],
  ] as const).forEach(([center, label, hour, minute]) => {
    painter.wallRect('left', center - 10, center + 10, 44, 66, (u, v) => {
      const r = Math.hypot(u - center, v - 57);
      if (r > 9) return null;
      if (r > 7.5) return EXCHANGE_GOLD;
      const ha = (hour / 12) * Math.PI * 2;
      const ma = (minute / 12) * Math.PI * 2;
      const du = u - center;
      const dv = v - 57;
      const onHand = (angle: number, len: number) => {
        const along = du * Math.sin(angle) + dv * Math.cos(angle);
        const across = Math.abs(du * Math.cos(angle) - dv * Math.sin(angle));
        return along >= 0 && along <= len && across < 0.8;
      };
      if (onHand(ha, 4) || onHand(ma, 6)) return 0x1d2229;
      return 0xf6f1e4;
    });
    painter.text('left', label, center - Math.floor(textColumns(label) / 2), 39, 1, EXCHANGE_GOLD);
  });
}

/** 달팽이 경주로: 왼쪽 벽을 따라 놓인 낮은 상자. 세 줄 잔디 레인, 뒤쪽 끝 결승선, 앞쪽 출발선에 선 달팽이 셋 */
function paintSnailTrack(painter: Painter) {
  const { p } = painter;
  const [x0, y0, x1, y1] = SNAIL_TRACK;
  const g0 = x0 - painter.x0 + 0.05;
  const g1 = x1 - painter.x0 + 0.9;
  const h0 = y0 - painter.y0 + 0.1;
  const h1 = y1 - painter.y0 + 0.9;
  const lift = 6;
  const at = (gx: number, gy: number, z = -lift): [number, number] => [...painter.screen(gx, gy, z)];
  const minus = (a: [number, number], b: [number, number]): [number, number] => [a[0] - b[0], a[1] - b[1]];

  p.parallelogram(at(g0, h1), minus(at(g1, h1), at(g0, h1)), [0, lift], (_u, v) => (v > 0.7 ? 0x3a2414 : 0x6a4430));
  p.parallelogram(at(g1, h0), minus(at(g1, h1), at(g1, h0)), [0, lift], (_u, v) => (v > 0.7 ? 0x2e1c10 : 0x5a3a22));
  p.parallelogram(at(g0, h0), minus(at(g1, h0), at(g0, h0)), minus(at(g0, h1), at(g0, h0)), (u, v) => {
    if (u < 0.07 || u > 0.93) return 0x8a5a3c;
    const w = ((u - 0.07) / 0.86) * 3;
    const lane = Math.min(2, Math.floor(w));
    if (lane > 0 && frac(w) < 0.06) return 0xf4f1ea;
    if (v < 0.05) return (Math.floor(u * 10) + Math.floor(v * 120)) & 1 ? 0xf4f4f0 : 0x1d1d22;
    if (v > 0.9 && v < 0.915) return 0xf4f1ea;
    return lane & 1 ? 0x4f8a3c : 0x5a9a44;
  });

  SNAIL_COLORS.forEach((color, lane) => {
    const gx = g0 + (0.07 + ((lane + 0.5) / 3) * 0.86) * (g1 - g0);
    const [sx, sy] = at(gx, h0 + 0.95 * (h1 - h0));
    p.ellipse(sx + 1, sy, 3, 1.3, 0xe8d8a8);
    p.ellipse(sx - 1, sy - 2, 2.3, 2.3, color);
    p.set(sx - 1, sy - 2, shade(color, 0.6));
  });
}

/**
 * 상점 안 벽: 아래 회색 판, 빨강·흰 줄무늬 띠, 위 흰 벽, 맨 위 흰 테.
 * 오른쪽 벽 가운데 빨간 판에 흰 MART 글씨, 왼쪽 벽에 노란 할인 포스터 둘(진열대와 냉장고보다 높게).
 */
function paintMartWalls(painter: Painter) {
  const RED = 0xd8413b;
  const RED_DARK = 0x9b1f1f;
  const WALL = 0xf3f1ea;
  for (const wall of ['left', 'right'] as Wall[]) {
    const length = painter.length(wall);
    painter.wallRect(wall, 0, length, 0, WALL_H, (u, v) => {
      // 아래: 스테인리스 걸레받이
      if (v < 5) return v === 4 ? 0xd0d5db : u % 3 === 0 ? 0x9aa1aa : 0xb4bac2;
      // 흰 유약 벽돌 타일(8×4)
      if (v < 26) {
        const row = (v - 5) >> 2;
        const k = u + (row & 1) * 4;
        if ((v - 5) % 4 === 3 || k % 8 === 7) return 0xcfd5db;
        if ((v - 5) % 4 === 2) return 0xffffff;
        return hash2(k >> 3, row + (wall === 'left' ? 40 : 0)) > 0.85 ? 0xeef2f5 : 0xf7f8f8;
      }
      // 빨간 띠와 가는 흰 줄
      if (v < 32) return v === 26 || v === 31 ? RED_DARK : v === 28 ? 0xf6f7f8 : RED;
      if (v >= WALL_H - 3) return TRIM;
      if (v >= 70) return 0xc9ced4;
      // 천장 형광등: 48픽셀마다 32픽셀 등. 등 아래 벽이 밝다.
      const lamp = (u + 8) % 48 < 32;
      if (v >= 65) return lamp ? (v === 66 || v === 67 ? 0xffffff : 0xdfe3e8) : 0xc9ced4;
      if (lamp && v >= 57) return mix(WALL, 0xfffbe8, (v - 56) / 9);
      return WALL;
    });
  }

  // 오른쪽 벽 가운데 불 켜진 MART 간판: 빨간 상자, 흰 글씨, 둘레 벽이 붉게 비친다.
  const signW = textColumns('MART') * 4 + 12;
  const u0 = Math.round(painter.length('right') / 2 - signW / 2);
  painter.wallRect('right', u0 - 4, u0 + signW + 4, 38, 72, (u, v) => {
    const out = Math.max(u0 - u, u - (u0 + signW - 1), 42 - v, v - 69);
    if (out <= 0) return u === u0 || u === u0 + signW - 1 || v === 42 || v === 69 ? RED_DARK : RED;
    return out <= 2 ? 0xffd6d0 : 0xfbe7e2;
  });
  painter.text('right', 'MART', u0 + 6, 46, 4, 0xffffff);

  // 오른쪽 벽 양끝: 초록 칠판 가격표
  const right = painter.length('right');
  for (const center of [Math.round(right * 0.16), Math.round(right * 0.84)]) {
    painter.wallRect('right', center - 16, center + 16, 48, 66, (u, v) => {
      if (u === center - 16 || u === center + 15 || v === 48 || v === 65) return 0x8a5c33;
      if ((v - 51) % 4 === 0 && v < 63 && u > center - 13 && u < center + 6 + Math.floor(hash2(v, center) * 6)) return 0xe8e4d8;
      if (v > 50 && v < 63 && u >= center + 8 && u <= center + 12 && (v - 51) % 4 < 2) return 0xffd84d;
      return 0x2e4a3a;
    });
  }

  // 왼쪽 벽: SALE 포스터, 둥근 시계, OPEN 24H 판
  const left = painter.length('left');
  const sale = Math.round(left * 0.28);
  painter.wallRect('left', sale - 18, sale + 18, 46, 68, (u, v) => {
    if (u === sale - 18 || u === sale + 17 || v === 46 || v === 67) return 0xd8a020;
    if (v < 54 && v > 48 && u > sale - 14 && u < sale + 13) return RED;
    return 0xffd84d;
  });
  painter.text('left', 'SALE', sale - Math.floor((textColumns('SALE') * 2) / 2), 56, 2, RED);
  const clock = Math.round(left * 0.5);
  painter.wallRect('left', clock - 9, clock + 9, 48, 66, (u, v) => {
    const r = Math.hypot(u - clock, v - 57);
    if (r > 8.5) return null;
    if (r > 7) return 0x3a3f46;
    if ((Math.abs(u - clock) < 1 && v >= 57 && v <= 62) || (v === 57 && u >= clock && u <= clock + 4)) return 0x1d2229;
    return r > 6 && (Math.round(u - clock) % 6 === 0 || Math.round(v - 57) % 6 === 0) ? 0x8a929c : 0xfafafa;
  });
  const open = Math.round(left * 0.74);
  const openW = textColumns('OPEN') * 2 + 8;
  painter.wallRect('left', open - openW / 2, open + openW / 2, 46, 68, (u, v) => {
    if (u === open - openW / 2 || u === open + openW / 2 - 1 || v === 46 || v === 67) return 0x1d2229;
    return 0x2b2f36;
  });
  painter.text('left', 'OPEN', open - openW / 2 + 4, 58, 2, 0x7fe0a0);
  painter.text('left', '24H', open - Math.floor((textColumns('24H') * 2) / 2), 49, 2, 0xffd84d);
}

/**
 * 대장간 안 벽: 아래 돌 띠, 위 붉은 벽돌, 맨 위 검은 철 들보.
 * 오른쪽 벽 가운데 검은 철판에 불빛 색 FORGE 글씨, 왼쪽 벽에 나무 걸이에 건 집게와 망치(무기 걸이보다 높게).
 */
function paintSmithyWalls(painter: Painter) {
  const MORTAR = 0x5e2f25;
  for (const wall of ['left', 'right'] as Wall[]) {
    painter.wallRect(wall, 0, painter.length(wall), 0, WALL_H, (u, v) => {
      if (v < 8) return v === 7 ? 0x6a655d : (Math.floor(u / 12) + (v < 4 ? 1 : 0)) & 1 ? 0x57524b : 0x4d4842;
      if (v >= WALL_H - 5) return v === WALL_H - 5 ? 0x1f2227 : 0x2d3138;
      const row = Math.floor((v - 8) / 4);
      if ((v - 8) % 4 === 3) return MORTAR;
      const k = u + (row & 1) * 4;
      if (k % 8 === 7) return MORTAR;
      const r = hash2(Math.floor(k / 8) + (wall === 'left' ? 500 : 0), row);
      return r < 0.25 ? 0x84402f : r > 0.92 ? 0xa65a42 : 0x9a4a35;
    });
  }
  const signW = textColumns('FORGE') * 4 + 12;
  const u0 = Math.round(painter.length('right') / 2 - signW / 2);
  painter.wallRect('right', u0, u0 + signW, 42, 70, (u, v) => (u === u0 || u === u0 + signW - 1 || v === 42 || v === 69 ? 0x1f2227 : 0x2d3138));
  painter.text('right', 'FORGE', u0 + 6, 46, 4, 0xffd27a);

  // 왼쪽 벽 나무 걸이에 건 집게 둘과 망치 둘
  const length = painter.length('left');
  const r0 = Math.round(length / 2) - 40;
  painter.wallRect('left', r0, r0 + 80, 62, 65, (_u, v) => (v === 64 ? 0xa97c4c : 0x7b4d2c));
  for (let i = 0; i < 4; i++) {
    const hook = r0 + 10 + i * 20;
    if (i % 2 === 0) {
      // 집게: 두 다리가 아래로 벌어진다.
      painter.wallRect('left', hook - 4, hook + 5, 40, 62, (u, v) => {
        const spread = Math.max(0, 52 - v) / 4;
        return Math.abs(u - hook + spread) < 0.8 || Math.abs(u - hook - spread) < 0.8 ? 0x3a3f46 : null;
      });
    } else {
      // 망치: 나무 자루 아래 쇠 머리
      painter.wallRect('left', hook, hook + 2, 46, 62, () => 0x8a5c33);
      painter.wallRect('left', hook - 4, hook + 6, 40, 46, (_u, v) => (v === 45 ? 0x8a9099 : 0x4a4f57));
    }
  }
}

/**
 * 노동청 안 벽(2026-11-16, 에이전트가 정함): 아래 짙은 나무 걸레받이와 초록 유약 타일, 나무 띠, 위 베이지 회벽, 갓등 넷과 번지는 빛.
 * 오른쪽 벽 가운데 초록 판에 흰 WORK 글씨, 그 왼쪽 빨간 숫자 번호판(07). 왼쪽 벽 가운데 코르크 구인판(작업장 넷: 곡괭이, 도끼, 바구니, 물고기),
 * 그 양옆 시계와 노란 안전 표지.
 */
function paintLaborWalls(painter: Painter) {
  const PLASTER = 0xe9e0c9;
  const GLOW = 0xfff1c8;
  for (const wall of ['left', 'right'] as Wall[]) {
    const length = painter.length(wall);
    const lamps: number[] = [];
    for (let u = 40; u < length - 20; u += 72) lamps.push(u);
    painter.wallRect(wall, 0, length, 0, WALL_H, (u, v) => {
      if (v < 5) return v === 4 ? 0x5a3a22 : 0x3a2616;
      if (v < 24) {
        const row = (v - 5) >> 2;
        const k = u + (row & 1) * 4;
        if ((v - 5) % 4 === 3 || k % 8 === 7) return 0x1f4a3a;
        if ((v - 5) % 4 === 2) return 0x5aa080;
        return hash2(k >> 3, row + (wall === 'left' ? 30 : 0)) > 0.8 ? 0x367a5c : 0x3f8a6a;
      }
      if (v < 26) return v === 24 ? 0x7a5234 : 0x9a6b3c;
      if (v >= WALL_H - 3) return 0xf2ead6;
      if (v >= 66) return v === 66 || v === 69 ? 0x7a5234 : 0x5a3a22;
      let c: Color = (u * 3 + v * 7) % 37 === 0 ? 0xddd3b9 : PLASTER;
      for (const at of lamps) {
        const r = Math.hypot((u - at) * 0.7, v - 62);
        if (r < 14) c = mix(c, GLOW, Math.round((1 - r / 14) * 3) * 0.14);
      }
      return c;
    });
    // 갓등: 놋쇠 받침과 우윳빛 갓
    for (const at of lamps) {
      painter.wallRect(wall, at - 1, at + 1, 64, 66, () => 0xb08a3e);
      painter.wallRect(wall, at - 4, at + 4, 60, 64, (_u, v) => (v === 60 ? 0xfff6d8 : 0xf6efdc));
    }
  }

  // 오른쪽 벽 가운데 WORK 판
  const signW = textColumns('WORK') * 3 + 12;
  const s0 = Math.round(painter.length('right') / 2 - signW / 2);
  painter.wallRect('right', s0, s0 + signW, 40, 64, (u, v) => (u === s0 || u === s0 + signW - 1 || v === 40 || v === 63 ? 0xf2ead6 : 0x1f6a4a));
  painter.text('right', 'WORK', s0 + 6, 45, 3, 0xffffff);
  // 번호판: 검은 상자에 빨간 숫자, 둘레가 붉게 비친다.
  const n0 = s0 - 40;
  painter.wallRect('right', n0 - 3, n0 + 31, 41, 61, (u, v) => {
    const out = Math.max(n0 - u, u - (n0 + 27), 44 - v, v - 57);
    if (out > 0) return out <= 2 ? 0xf0c8b0 : null;
    return out === 0 ? 0x3a3f46 : 0x120c0c;
  });
  painter.text('right', '07', n0 + 6, 46, 2, 0xff3b30);

  // 왼쪽 벽 가운데 구인판: 나무 테 두른 코르크, 핀 꽂은 카드 넷
  const left = painter.length('left');
  const b0 = Math.round(left / 2) - 52;
  const b1 = b0 + 104;
  painter.wallRect('left', b0, b1, 30, 64, (u, v) => {
    if (u < b0 + 3 || u >= b1 - 3 || v < 33 || v >= 61) return 0x7a5234;
    return (u * 7 + v * 3) % 5 === 0 ? 0xa8783e : 0xc08a4a;
  });
  const icons: ((du: number, dv: number) => Color | null)[] = [
    // 곡괭이: 회색 머리, 나무 자루
    (du, dv) => (dv === 9 && Math.abs(du) <= 6 - Math.abs(du) / 3 ? 0x8a929c : du === 0 && dv < 9 && dv > 1 ? 0x8a5c33 : null),
    // 도끼
    (du, dv) => (du === -1 && dv > 1 && dv < 11 ? 0x8a5c33 : du >= 0 && du <= 4 && dv >= 7 && dv <= 10 ? 0x9aa3ad : null),
    // 바구니와 열매
    (du, dv) => (dv >= 2 && dv <= 5 && Math.abs(du) <= 5 ? (dv === 5 ? 0x8a5c33 : 0xb98a58) : dv >= 6 && dv <= 7 && Math.abs(du) <= 4 && du % 2 === 0 ? 0xd8413b : null),
    // 물고기
    (du, dv) => (Math.abs(du / 6) ** 2 + Math.abs((dv - 6) / 3) ** 2 < 1 ? (du === -3 && dv === 7 ? 0x1d2229 : 0x4d8dff) : du > 5 && du < 9 && Math.abs(dv - 6) <= du - 5 ? 0x4d8dff : null),
  ];
  icons.forEach((icon, i) => {
    const c = b0 + 14 + i * 25;
    painter.wallRect('left', c - 10, c + 10, 36, 58, (u, v) => {
      if (v === 55 && Math.abs(u - c) <= 1) return 0xd8413b;
      if (u === c - 10 || u === c + 9 || v === 36 || v === 57) return 0xd8d0b8;
      const mark = icon(c - u, v - 38);
      if (mark !== null) return mark;
      if (v >= 39 && v <= 40 && Math.abs(u - c) < 7) return 0xb9b09b;
      return i % 2 ? 0xfff6d0 : 0xfafafa;
    });
  });
  // 시계(구인판 뒤쪽)와 안전 표지(앞쪽)
  const clock = b0 - 20;
  painter.wallRect('left', clock - 9, clock + 9, 42, 62, (u, v) => {
    const r = Math.hypot(u - clock, v - 52);
    if (r > 8.5) return null;
    if (r > 7) return 0x5a3a22;
    if ((Math.abs(u - clock) < 1 && v >= 52 && v <= 57) || (v === 52 && u >= clock - 4 && u <= clock)) return 0x1d2229;
    return 0xfaf6ea;
  });
  const sign = b1 + 18;
  painter.wallRect('left', sign - 10, sign + 10, 40, 62, (u, v) => {
    if (u === sign - 10 || u === sign + 9 || v === 40 || v === 61) return 0x1d2229;
    const tri = v >= 44 && v <= 57 && Math.abs(u - sign) <= (57 - v) * 0.6;
    if (tri) return Math.abs(u - sign) <= (57 - v) * 0.6 - 2 && v >= 46 ? (Math.abs(u - sign) < 1 && v > 48 && v !== 50 ? 0x1d2229 : 0xffd84d) : 0x1d2229;
    return 0xffd84d;
  });
}

/**
 * 농협 안 벽(에이전트가 정함): 아래 들돌 띠와 나무 턱, 위는 흰 회벽에 짙은 기둥과 가로대, 칸마다 엇갈린 버팀목(목조 뼈대), 맨 위 굵은 들보.
 * 오른쪽 벽 가운데 사슬에 매단 초록 FARM 판, 그 양옆 등잔 둘(따뜻한 빛). 왼쪽 벽 들보에 말린 옥수수와 마늘 다발, 밀짚모자, 땅 지도 액자.
 */
function paintFarmcoopWalls(painter: Painter) {
  const STONES = [0x9a917f, 0x8a826f, 0xa59c88];
  const PLASTER = 0xf1ead8;
  const BEAM = 0x5a3a22;
  const right = painter.length('right');
  const lanterns = [Math.round(right / 2) - 64, Math.round(right / 2) + 64];
  for (const wall of ['left', 'right'] as Wall[]) {
    painter.wallRect(wall, 0, painter.length(wall), 0, WALL_H, (u, v) => {
      if (v < 10) {
        const row = Math.floor(v / 5);
        const k = u + row * 7;
        const w = 9 + Math.floor(hash2(Math.floor(k / 12), row) * 5);
        if (v % 5 === 4 || k % w === 0) return 0x6e665a;
        return STONES[Math.floor(hash2(Math.floor(k / w), row + (wall === 'left' ? 9 : 0)) * STONES.length)];
      }
      if (v < 12) return v === 10 ? 0x4a3020 : 0x6a4a30;
      if (v >= 70) return v >= WALL_H - 2 ? 0x3a2414 : v === 70 ? 0x3a2414 : 0x4a3020;
      const bay = Math.floor(u / 48);
      const pu = u % 48;
      if (pu < 5) return pu === 0 ? 0x3a2414 : BEAM;
      if (v >= 40 && v < 43) return v === 40 ? 0x3a2414 : BEAM;
      // 버팀목: 칸마다 방향을 바꿔 아래 칸에 비스듬히
      if (v < 40) {
        const t = (v - 12) / 28;
        const x = bay % 2 ? 5 + t * 40 : 45 - t * 40;
        if (Math.abs(pu - x) < 2) return BEAM;
      }
      let c: Color = (u * 5 + v * 3) % 29 === 0 ? 0xe2d9c2 : PLASTER;
      if (wall === 'right') {
        for (const at of lanterns) {
          const r = Math.hypot((u - at) * 0.8, v - 52);
          if (r < 16) c = mix(c, 0xffc070, Math.round((1 - r / 16) * 3) * 0.13);
        }
      }
      return c;
    });
  }

  // FARM 판: 들보에서 내린 사슬 둘, 초록 칠 판, 노란 글씨
  const signW = textColumns('FARM') * 4 + 12;
  const s0 = Math.round(right / 2 - signW / 2);
  for (const u of [s0 + 6, s0 + signW - 7]) painter.wallRect('right', u, u + 1, 64, 70, (_u, v) => (v % 2 ? 0x8a929c : 0x5b626c));
  painter.wallRect('right', s0, s0 + signW, 40, 64, (u, v) => {
    if (u === s0 || u === s0 + signW - 1 || v === 40 || v === 63) return 0x3a2414;
    return (u + v * 3) % 9 === 0 ? 0x2a6a3a : 0x2f7a42;
  });
  painter.text('right', 'FARM', s0 + 6, 46, 4, 0xffe08a);
  // 등잔: 쇠 갓, 주황 불, 아래 고리
  for (const at of lanterns) {
    painter.wallRect('right', at - 1, at + 1, 60, 70, () => 0x3a3f46);
    painter.wallRect('right', at - 4, at + 4, 44, 60, (u, v) => {
      if (v >= 57 || v < 46) return 0x2b2f36;
      if (Math.abs(u - at) >= 3) return 0x3a3f46;
      return v > 52 ? 0xfff1b8 : 0xffb347;
    });
  }

  // 왼쪽 벽 들보에 매단 다발: 옥수수(노랑과 마른 잎)와 마늘(흰 알)을 번갈아
  const left = painter.length('left');
  for (let at = 28, i = 0; at < left - 16; at += 44, i++) {
    painter.wallRect('left', at, at + 1, 62, 70, () => 0x8a6a3a);
    if (i % 2 === 0) {
      painter.wallRect('left', at - 6, at + 7, 44, 62, (u, v) => {
        const du = u - at;
        const cob = [-4, 0, 4].find((c) => Math.abs(du - c) <= 1 && v < 58 - Math.abs(c));
        if (cob !== undefined) return (u + v) % 2 ? 0xf2c14e : 0xd8a020;
        if (v >= 56 && Math.abs(du) <= 5 - (v - 56)) return 0xc9b07a;
        return null;
      });
    } else {
      painter.wallRect('left', at - 6, at + 7, 46, 62, (u, v) => {
        const du = u - at;
        if (v >= 58 && Math.abs(du) <= 1) return 0xc9b07a;
        const bulbs = [[-3, 54], [3, 54], [0, 50], [-3, 47], [3, 47]];
        for (const [bu, bv] of bulbs) if (Math.hypot(du - bu, v - bv) < 2.4) return (u + v) % 3 ? 0xf6f1e4 : 0xd8cfc0;
        return null;
      });
    }
  }
  // 오른쪽 벽 앞쪽: 땅 지도 액자(칸마다 밭색), 뒤쪽: 걸어 둔 밀짚모자
  const map0 = right - 60;
  painter.wallRect('right', map0, map0 + 44, 30, 56, (u, v) => {
    if (u < map0 + 2 || u >= map0 + 42 || v < 32 || v >= 54) return 0x5a3a22;
    const cu = Math.floor((u - map0 - 2) / 5);
    const cv = Math.floor((v - 32) / 4);
    if ((u - map0 - 2) % 5 === 4 || (v - 32) % 4 === 3) return 0xd8cfb0;
    const k = hash2(cu, cv);
    return k > 0.75 ? 0xf2c14e : k > 0.45 ? 0x7cc24f : k > 0.25 ? 0x8a6440 : 0xb98a58;
  });
  const hat = 40;
  painter.wallRect('right', hat - 14, hat + 14, 40, 56, (u, v) => {
    const du = u - hat;
    if (v >= 44 && v <= 46 && Math.abs(du) <= 13) return v === 44 ? 0xc9a34e : 0xe8c86a;
    if (v > 46 && v <= 53 && Math.abs(du) <= 7 - (v - 47) * 0.4) return v === 48 ? 0xd8413b : (u + v) % 3 ? 0xe8c86a : 0xd8b85a;
    return null;
  });
}

/** 빈방 벽(이름 없는 방, 2026-11-24 에이전트가 정함): 걸레받이, 무늬 없는 칠한 벽, 천장 아래 가는 테만 둔다. */
function paintPlainWalls(painter: Painter) {
  for (const wall of ['left', 'right'] as Wall[]) {
    painter.wallRect(wall, 0, painter.length(wall), 0, WALL_H, (_u, v) => {
      if (v < 5) return v === 4 ? 0x9a9284 : 0x7e776a;
      if (v >= WALL_H - 3) return TRIM;
      if (v === WALL_H - 4) return 0xd9d3c7;
      return 0xf1ede4;
    });
  }
}

/** 상점·대장간처럼 tower.ts의 FloorPlan.style에 아직 없을 수 있는 스타일의 벽 */
const SHOP_WALLS: Partial<Record<string, (painter: Painter) => void>> = {
  mart: paintMartWalls,
  smithy: paintSmithyWalls,
  labor: paintLaborWalls,
  farmcoop: paintFarmcoopWalls,
  plain: paintPlainWalls,
  hideout: paintHideoutWalls,
};

/** 가장 먼저 그리는 벽면: 사무실 벽, 1층 로비 벽, 옥상 난간 */
function paintWalls(painter: Painter, plan: FloorPlan) {
  const { style } = plan;
  const shopWalls = SHOP_WALLS[style];
  if (shopWalls) {
    shopWalls(painter);
    return;
  }
  if (style === 'casino') {
    paintCasinoWalls(painter);
    return;
  }
  if (style === 'exchange') {
    paintExchangeWalls(painter);
    return;
  }
  if (style === 'stairs') {
    paintFacade(painter, plan);
    return;
  }
  if (style === 'cabin') {
    paintCabin(painter);
    return;
  }
  if (style === 'roof') {
    const gaps = plan.doorways.map((d) => painter.doorCenter(d));
    for (const wall of ['left', 'right'] as Wall[]) {
      const base = wall === 'left' ? 0xb5b5b0 : 0xa7a7a2;
      painter.wallRect(wall, 0, painter.length(wall), 0, PARAPET_H, (u, v) => {
        if (wall === 'left' && gaps.some((g) => Math.abs(u - g) < 14)) return null;
        // 갓돌, 이음매, 빗물 자국
        if (v >= PARAPET_H - 2) return v === PARAPET_H - 2 ? 0x8f8f8a : 0xd8d8d2;
        if (u % 32 === 0) return shade(base, 0.85);
        return hash2(u >> 2, 5) > 0.8 && v < PARAPET_H - 3 - (u % 3) ? shade(base, 0.92) : base;
      });
    }
    return;
  }

  const doorUs = plan.doorways.map((d) => ({ wall: d.wall, u: painter.doorCenter(d) }));
  const nearDoor = (wall: Wall, u0: number, u1: number) =>
    doorUs.some((d) => d.wall === wall && u1 > d.u - 24 && u0 < d.u + 24);
  const cafeEnd = (CAFE[2] - painter.x0 + 1) * U;
  const lobby = style === 'lobby';
  const PLASTER = lobby ? 0xe7e1d5 : 0xeef1f4;
  const LED = lobby ? 0xfff3d6 : 0xffffff;

  /**
   * 벽 재료 층(2026-11-16 '대장간 느낌', 에이전트가 정함): 걸레받이, 아래 판(로비는 트래버틴 돌, 사무실은 회청색 천 판),
   * 가는 띠, 칠한 벽, 천장 아래 간접등과 그 아래 번지는 빛, 천장 테.
   */
  const layered = (u: number, v: number): Color => {
    if (v < 6) return v === 5 ? 0x5b626c : 0x3f444d;
    if (v < 20) {
      if (lobby) {
        const row = Math.floor((v - 6) / 7);
        const k = u + (row & 1) * 12;
        if ((v - 6) % 7 === 6 || k % 24 === 0) return 0xb9b09b;
        return hash2(Math.floor(k / 24), row) > 0.5 ? 0xd6cdb8 : 0xcfc6b0;
      }
      return u % 32 === 0 ? 0xa4aebb : (u + v) % 3 === 0 ? 0xb3bcc8 : 0xb9c2ce;
    }
    if (v < 22) return v === 20 ? 0x9aa3ad : 0xd0d5db;
    if (v >= WALL_H - 3) return TRIM;
    if (v >= 70) return 0xc9ced4;
    if (v >= 66) return v === 66 || v === 67 ? LED : 0xdfe3e8;
    if (v >= 60) return mix(PLASTER, LED, ((v - 59) / 7) * 0.6);
    return PLASTER;
  };
  painter.wallRect('left', 0, painter.length('left'), 0, WALL_H, (u, v) => layered(u, v));
  painter.wallRect('right', 0, painter.length('right'), 0, WALL_H, (u, v) => {
    if (lobby && u < cafeEnd && v >= 6 && v < WALL_H - 3) return u % 8 === 0 ? 0x6a4430 : (u >> 3) & 1 ? 0x8a5a3c : 0x7f5236;
    return layered(u, v);
  });

  // 오른쪽 벽에 건 것: 사무실은 화이트보드와 ITS 포스터를 번갈아, 문·엘리베이터·층 번호 둘레는 비운다.
  if (!lobby) {
    const elevator = plan.doorways.find((d) => d.kind === 'elevator');
    const busy = elevator ? [painter.doorCenter(elevator) - 96, painter.doorCenter(elevator) + 44] : [140, 210];
    let k = 0;
    for (let center = 96; center < painter.length('right') - 40; center += 176) {
      const half = k % 2 === 0 ? 30 : 16;
      if (center + half > busy[0] && center - half < busy[1]) continue;
      if (nearDoor('right', center - half - 16, center + half + 16)) continue;
      if (k % 2 === 0) {
        // 화이트보드: 알루미늄 테, 마커로 그린 상자와 화살표, 아래 받침
        painter.wallRect('right', center - half, center + half, 30, 60, (u, v) => {
          if (v < 32) return v === 30 ? 0x6b7380 : 0x9aa3ad;
          if (u === center - half || u === center + half - 1 || v === 59 || v === 32) return 0x9aa3ad;
          const lu = u - center + half;
          const box = (a: number, b: number, v0: number, v1: number) =>
            ((lu === a || lu === b) && v >= v0 && v <= v1) || ((v === v0 || v === v1) && lu >= a && lu <= b);
          if (box(6, 20, 42, 52) || box(36, 52, 40, 50)) return 0x2f5fa8;
          if (v === 46 && lu > 20 && lu < 36) return 0xd8413b;
          if ((v === 36 || v === 38) && lu > 6 && lu < 6 + Math.floor(hash2(center, v) * 30)) return 0x3a3f46;
          return 0xfafbfc;
        });
      } else {
        // ITS 포스터: 검은 테, 파란 바탕에 흰 ITS, 분홍 띠
        painter.wallRect('right', center - half, center + half, 32, 62, (u, v) => {
          if (u === center - half || u === center + half - 1 || v === 32 || v === 61) return 0x2b2f36;
          if (v < 38) return 0xff7ad9;
          return 0x1f5cff;
        });
        painter.text('right', 'ITS', center - Math.floor(textColumns('ITS') * 2 / 2), 46, 2, 0xffffff);
      }
      k++;
    }
  } else {
    // 로비: 엘리베이터 오른쪽 벽에 큰 ITS 글씨
    const elevator = plan.doorways.find((d) => d.kind === 'elevator');
    if (elevator) {
      const at = painter.doorCenter(elevator) + 34;
      painter.text('right', 'ITS', at, 48, 3, 0x1f5cff);
      painter.text('right', 'ITS', at + 1, 47, 3, 0x6f9cff);
    }
  }

  // 왼쪽 벽의 큰 창: 1층은 길가의 나무, 위층은 도시가 보인다.
  const pane = 64;
  for (let u0 = 8; u0 + pane - 8 <= painter.length('left'); u0 += pane) {
    const u1 = u0 + pane - 8;
    if (nearDoor('left', u0, u1)) continue;
    const top = style === 'lobby' ? 70 : 64;
    const bottom = style === 'lobby' ? 8 : 18;
    painter.wallRect('left', u0, u1, bottom, top, (u, v) => {
      if (u === u0 || u === u1 - 1 || v === bottom || v === top - 1 || u === u0 + 27 || u === u0 + 28) return FRAME;
      const t = (v - bottom) / (top - bottom);
      if (style === 'lobby') {
        const crown = 14 + Math.sin(u * 0.21) * 4 + hash2(u >> 2, 3) * 4;
        if (v - bottom < 4) return 0x8a8f96;
        if (v - bottom < crown) return ramp(LEAVES, (v - bottom) / crown, u, v);
        return ramp(SKY, 1 - t, u, v);
      }
      const k = Math.floor(u / 5);
      const height = 6 + hash2(k, 7) * 28;
      if (v - bottom < height) {
        if (u % 5 === 2 && v % 4 === 1 && hash2(u, v) > 0.55) return 0xffe9a0;
        return CITY[Math.floor(hash2(k, 3) * CITY.length)];
      }
      return ramp(SKY, 1 - t, u, v);
    });
  }

  // 1층 카페 벽의 메뉴판
  if (style === 'lobby') {
    for (const u0 of [40, 104]) {
      painter.wallRect('right', u0, u0 + 48, 36, 60, (u, v) => {
        if (u < u0 + 2 || u >= u0 + 46 || v < 38 || v >= 58) return 0x5a3a22;
        const line = (v - 40) % 5 === 0 && v < 56;
        const length = 12 + hash2(u0, v) * 26;
        return line && u - u0 - 4 < length ? 0xe8e4d8 : 0x2e3b33;
      });
    }
  }

  // 사무실 안 계단 위 벽에 가는 층을 쓴다.
  for (const { at, text } of plan.signs) {
    painter.text('left', text, (at - painter.y0) * U + 4, 44, 3, 0x2fa05a);
  }

  // 층 번호
  if (plan.number !== null) {
    const elevator = plan.doorways.find((d) => d.kind === 'elevator');
    const u0 = elevator ? painter.doorCenter(elevator) - 64 : 160;
    painter.text('right', `${plan.number}F`, u0, 34, 3, 0x4a505a);
  }
}

function paintDoor(painter: Painter, door: Doorway, floorNumber: number | null) {
  const uc = painter.doorCenter(door);
  const { wall } = door;
  if (door.kind === 'elevator') {
    painter.wallRect(wall, uc - 19, uc + 19, 0, 58, () => 0x6b7380);
    painter.wallRect(wall, uc - 16, uc + 16, 0, 54, (u) => {
      if (u === uc - 1 || u === uc) return 0x5b626c;
      return STEEL[Math.floor((((u - uc + 16) % 16) / 16) * STEEL.length)];
    });
    painter.wallRect(wall, uc - 9, uc + 9, 60, 69, () => 0x1d2229);
    if (floorNumber !== null) painter.text(wall, String(floorNumber), uc - 1, 62, 1, 0xff9a3c);
    painter.wallRect(wall, uc + 22, uc + 27, 24, 37, () => 0x8a929c);
    painter.wallRect(wall, uc + 23, uc + 26, 27, 29, () => 0xffd84d);
    painter.wallRect(wall, uc + 23, uc + 26, 32, 34, () => 0xf4f4f0);
    return;
  }
  if (door.kind === 'panel') {
    // 층 버튼판: 위에서부터 7층(빌라는 셋, door.buttons), 맨 위에는 층 표시창
    const buttons = door.buttons ?? 7;
    painter.wallRect(wall, uc - 7, uc + 7, 22, 56, (u, v) => {
      if (u === uc - 7 || u === uc + 6 || v === 22 || v === 55) return 0x5b626c;
      const row = Math.floor((53 - v) / 4.4);
      const inButton = Math.abs(u - uc) <= 1 && (53 - v) % 4.4 < 2.2 && row < buttons;
      return inButton ? (row === 0 ? 0xffd84d : 0xf4f4f0) : 0x2b2f36;
    });
    painter.wallRect(wall, uc - 9, uc + 9, 60, 69, () => 0x1d2229);
    painter.wallRect(wall, uc - 3, uc + 3, 62, 67, (u, v) => (Math.abs(u - uc) <= 66 - v - 62 ? 0xff9a3c : null));
    return;
  }
  if (door.kind === 'outside') {
    painter.wallRect(wall, uc - 15, uc + 15, 0, 56, () => FRAME);
    painter.wallRect(wall, uc - 13, uc + 13, 0, 53, (u, v) => {
      if (u === uc - 1 || u === uc) return FRAME;
      if (v === 24 || v === 25) return 0xd0d4d8;
      const cloud = Math.hypot((u - uc - 4) / 6, (v - 40) / 3) < 1;
      return cloud ? 0xf6fbfe : ramp(SKY, 1 - v / 53, u, v);
    });
    // 비상구 표지판
    painter.wallRect(wall, uc - 9, uc + 9, 58, 67, (u, v) => {
      const arrow = v === 62 && u > uc - 6 && u < uc + 5;
      const head = Math.abs(v - 62) + Math.abs(u - (uc - 5)) <= 2 && u >= uc - 6;
      return arrow || head ? 0xf4f4f0 : SIGN_GREEN;
    });
    return;
  }
  // 옥상 난간이 끊긴 자리에서 바깥 계단으로 내려간다.
  const at = door.at - painter.y0;
  const steps = 5;
  for (let k = steps; k >= 1; k--) {
    const o = painter.screen(-k, at - 0.4, k * 6);
    const a = painter.screen(-k + 1, at - 0.4, k * 6);
    const b = painter.screen(-k, at + 1.4, k * 6);
    const along: [number, number] = [a[0] - o[0], a[1] - o[1]];
    const across: [number, number] = [b[0] - o[0], b[1] - o[1]];
    painter.p.parallelogram(o, along, across, (s) => (s > 0.82 ? 0x6e6e6a : 0x8c8c88));
  }
  for (const side of [-0.4, 1.4]) {
    const top = painter.screen(0, at + side, -18);
    const bottom = painter.screen(-steps, at + side, steps * 6 - 14);
    painter.p.line(top[0], top[1], bottom[0], bottom[1], 0xf2c14e);
  }
  for (const u of [uc - 14, uc + 13]) painter.wallRect(wall, u, u + 2, 0, 22, (_, v) => (v > 19 ? 0x3a3a3a : 0xf2c14e));
}

const EDGE_COLORS: Record<string, number[]> = {
  lobby: [0x4f5560, 0x40454e],
  office: [0x4f5560, 0x40454e],
  roof: [0x7d7d78, 0x6a6a66],
  stairs: [0x3e4248, 0x2f3338],
  cabin: [0x5b626c, 0x4a505a],
  casino: [0x3a1418, 0x2a0e12],
  exchange: [0x232a36, 0x1a1f29],
  plain: [0x8a8476, 0x77726a],
  hideout: [0x5a3e28, 0x4a3220],
  mart: [0x5b626c, 0x4a505a],
  smithy: [0x3e3a35, 0x2f2c28],
  labor: [0x5a3a20, 0x4a3018],
  farmcoop: [0x4a3220, 0x3a2614],
};

/** 바닥 윗면과 앞쪽 두께를 칠한다. */
function paintSlab(painter: Painter, shader: FloorShader, [leftEdge, rightEdge]: number[]) {
  const { p, w, d, cx } = painter;

  // 바닥 앞쪽 두께. 앞 모서리를 기준으로 왼쪽은 앞-왼쪽 변, 오른쪽은 앞-오른쪽 변이다.
  const corner = cx + (w - d) * 16;
  for (let sx = 0; sx < p.w; sx++) {
    const t = (sx + 0.5 - cx) / 16;
    const base = sx < corner ? WALL_H + (t + 2 * d) * 8 : WALL_H + (2 * w - t) * 8;
    for (let e = 0; e < EDGE; e++) p.set(sx, base + e, sx < corner ? leftEdge : rightEdge);
  }

  for (let sy = WALL_H; sy <= WALL_H + (w + d) * 8; sy++) {
    for (let sx = 0; sx < p.w; sx++) {
      const dx = (sx + 0.5 - cx) / 16;
      const dy = (sy + 0.5 - WALL_H) / 8;
      const gx = (dy + dx) / 2;
      const gy = (dy - dx) / 2;
      if (gx < 0 || gy < 0 || gx > w || gy > d) continue;
      p.set(sx, sy, shader(gx, gy, sx, sy));
    }
  }
}

/** 층 하나를 그린다. 같은 층은 처음 들어갈 때 한 번만 그리면 된다. */
export function paintInterior(id: TowerId): HTMLCanvasElement {
  const plan = FLOORS[id];
  const painter = new Painter(plan.area);
  const { p } = painter;
  paintSlab(painter, FLOOR_SHADERS[plan.style](painter, plan), EDGE_COLORS[plan.style]);

  // 시작마을로 나가는 문 앞 발판. 앞-오른쪽 변(x 끝)의 문이면 y로 길고, 앞-왼쪽 변(y 끝)의 문이면 x로 길다.
  // 나가는 문(2026-11-28, 걸어서 지나가는 문)은 발판 가운데 칸이 첫 문 포탈의 문 앞 칸이다. 문 그림은 발판 앞 변에 선다(GameScene).
  const door = plan.portals.find((portal) => portal.to === 'plains');
  const exit = door?.door ? door.landing : door;
  if (exit) {
    const o = painter.screen(exit.x - painter.x0 - 1, exit.y - painter.y0 - 1);
    const frontLeft = exit.y === plan.area[3];
    const [along, across]: [number, number][] = frontLeft ? [[48, 24], [-32, 16]] : [[32, 16], [-48, 24]];
    p.parallelogram(o, along, across, (u, v) => (u < 0.06 || u > 0.94 || v < 0.04 || v > 0.96 ? 0x2a2c31 : 0x43464d));
  }

  paintWalls(painter, plan);
  for (const door of plan.doorways) paintDoor(painter, door, plan.number);
  if (plan.style === 'casino') paintSnailTrack(painter);
  p.outlineOuter(OUTLINE);
  return p.toCanvas();
}

/** 바닥 그림을 맵 위에 놓을 왼쪽 위 위치. corner는 바닥 뒤쪽 모서리의 월드 좌표다. */
function originOf([, y0, , y1]: Area, corner: { x: number; y: number }) {
  return { left: corner.x - (y1 - y0 + 1) * 16, top: corner.y - WALL_H };
}

export function interiorOrigin(id: TowerId, corner: { x: number; y: number }) {
  return originOf(FLOORS[id].area, corner);
}

/** 두 색을 t만큼 섞는다. */
function mix(a: Color, b: Color, t: number): Color {
  const channel = (shift: number) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** 숨은 방 바닥: 짙은 나무 바닥. 가구 없이 비워 두고 플레이어가 꾸민다(2026-11-15 사용자 요청). 2026-11-27부터 따로 된 맵의 바닥 무늬다. */
function hideoutFloor(): FloorShader {
  return (gx, gy) => {
    const row = Math.floor(gy * 2);
    const seam = Math.floor((gx + (row % 3) * 1.3) / 2.6);
    const onSeam = (gy * 2) % 1 < 0.12 || ((gx + (row % 3) * 1.3) / 2.6) % 1 < 0.03;
    return onSeam ? 0x5e3f24 : shade(PLANK[Math.floor(hash2(row, seam) * PLANK.length)], 0.82);
  };
}

/**
 * 숨은 방 뒤쪽 두 벽: 줄무늬 벽지, 노을 지는 창, 작은 전구 줄(2026-11-15 그림을 벽 높이 76에 맞춰 양쪽 벽으로 늘림, 2026-11-27).
 * 따로 된 맵이 되면서 벽지·벽걸이를 붙일 수 있어 4·7·8층과 같은 높이로 그린다.
 */
function paintHideoutWalls(painter: Painter) {
  for (const wall of ['left', 'right'] as Wall[]) {
    painter.wallRect(wall, 0, painter.length(wall), 0, WALL_H, (u, v) => {
      if (v < 5) return 0x5a3e28;
      if (v >= WALL_H - 3) return 0xf3ead8;
      return u % 6 === 0 ? 0xe2cfae : 0xefe0c2;
    });
  }
  const length = painter.length('right');
  const [w0, w1, b, t] = [8, Math.min(length - 8, 120), 18, 50];
  const sunset = [0x7a5c8f, 0xe07a5f, 0xf6b26b];
  painter.wallRect('right', w0, w1, b, t, (u, v) => {
    if (u === w0 || u === w1 - 1 || v === b || v === t - 1 || u === Math.floor((w0 + w1) / 2)) return 0x6a4a30;
    if (Math.hypot(u - (w1 - 10), v - 30) < 3.2) return 0xfff1c4;
    const k = Math.floor(u / 4);
    if (v - b < 3 + hash2(k, 5) * 6) return 0x3d3350;
    return ramp(sunset, (v - b) / (t - b), u, v);
  });
  for (let u = 3; u < length - 2; u += 6) {
    const v = WALL_H - 10 - Math.round(Math.sin((u / length) * Math.PI) * 3);
    painter.wallRect('right', u, u + 2, v, v + 2, () => (u % 12 === 3 ? 0xffd98a : 0xff9fb0));
  }
}

/** 바깥 계단 앞 줄의 난간 한 칸. 칸 가운데를 지나 x 방향으로 뻗는다. */
export function paintRailing(): Art {
  const p = new Pixels(20, 26);
  const cx = 10;
  const cy = 20;
  for (const h of [4, 15]) p.line(cx - 8, cy - 4 - h, cx + 8, cy + 4 - h, h === 15 ? 0xf2c14e : 0x8a929c);
  for (const x of [cx - 8, cx]) {
    const y = cy + (x - cx) / 2;
    for (let v = 0; v <= 15; v++) p.set(x, y - v, 0x5b626c);
  }
  p.outlineOuter(OUTLINE);
  return { canvas: p.toCanvas(), ax: cx, ay: cy };
}
