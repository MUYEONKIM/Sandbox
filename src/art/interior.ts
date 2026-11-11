import type { Area } from '../game/maps';
import { CAFE, FLOORS, HIDEOUT, type Doorway, type Flight, type FloorPlan, type TowerId } from '../game/tower';
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
const BASEBOARD = 0x4a505a;
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
  '4': ['101', '101', '111', '001', '001'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  F: ['111', '100', '110', '100', '100'],
  R: ['110', '101', '110', '101', '101'],
};

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
    const columns = text.length * 4 - 1;
    [...text].forEach((ch, i) => {
      GLYPHS[ch].forEach((row, ry) => {
        [...row].forEach((bit, rx) => {
          if (bit !== '1') return;
          const column = i * 4 + rx;
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

function lobbyFloor(painter: Painter): FloorShader {
  const [cx0, cy0, cx1, cy1] = CAFE;
  const { x0, y0 } = painter;
  return (gx, gy, sx, sy) => {
    const inCafe = gx >= cx0 - x0 && gx < cx1 - x0 + 1 && gy >= cy0 - y0 && gy < cy1 - y0 + 1;
    if (inCafe) {
      const row = Math.floor(gy * 2);
      const seam = Math.floor((gx + (row % 3) * 1.3) / 2.6);
      const onSeam = (gy * 2) % 1 < 0.12 || ((gx + (row % 3) * 1.3) / 2.6) % 1 < 0.03;
      return onSeam ? 0x7e5834 : PLANK[Math.floor(hash2(row, seam) * PLANK.length)];
    }
    if (frac(gx) < 0.05 || frac(gy) < 0.05) return 0xb9b3a8;
    const base = (Math.floor(gx) + Math.floor(gy)) & 1 ? 0xe9e5dd : 0xdcd7cd;
    return hash2(sx >> 1, sy) > 0.96 ? shade(base, 0.93) : base;
  };
}

function officeFloor(painter: Painter, plan: FloorPlan): FloorShader {
  return (gx, gy, sx, sy) => {
    const flight = flightAt(painter, plan, gx, gy);
    if (flight) return stepColor(painter, flight, gx, gy, sx, sy, 0xb7bcc4, 0x2f3338, 0x4f5560);
    if (frac(gx / 2) < 0.025 || frac(gy / 2) < 0.025) return 0x4f5560;
    const base = (Math.floor(gx / 2) + Math.floor(gy / 2)) & 1 ? 0x5f6672 : 0x666e7b;
    const color = hash2(sx, sy) < 0.18 ? shade(base, 0.92) : base;
    // 뚫린 바닥 너머로 아래층 바닥이 어둡게 보인다.
    return inVoid(painter, plan, gx, gy) ? shade(color, 0.45) : color;
  };
}

function roofFloor(painter: Painter): FloorShader {
  // 가운데의 헬기 착륙장
  const cx = painter.w / 2;
  const cy = painter.d / 2;
  return (gx, gy, sx, sy) => {
    const u = gy - cy;
    const w = gx - cx;
    const r = Math.hypot(u, w);
    if (r > 4.4 && r < 5) return 0xf2c14e;
    const h = (Math.abs(u + 1.4) < 0.4 || Math.abs(u - 1.4) < 0.4) && Math.abs(w) < 2.1;
    if (h || (Math.abs(w) < 0.35 && Math.abs(u) < 1.4)) return 0xf4f4f0;
    if (frac(gx / 4) < 0.012 || frac(gy / 4) < 0.012) return 0x85857f;
    const n = hash2(sx, sy);
    return n < 0.2 ? 0x9a9a95 : n > 0.85 ? 0xadada8 : 0xa3a39e;
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

const FLOOR_SHADERS = { lobby: lobbyFloor, office: officeFloor, roof: roofFloor, stairs: stairsFloor, cabin: cabinFloor };

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

/** 가장 먼저 그리는 벽면: 사무실 벽, 1층 로비 벽, 옥상 난간 */
function paintWalls(painter: Painter, plan: FloorPlan) {
  const { style } = plan;
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
      painter.wallRect(wall, 0, painter.length(wall), 0, PARAPET_H, (u, v) => {
        if (wall === 'left' && gaps.some((g) => Math.abs(u - g) < 14)) return null;
        if (v >= PARAPET_H - 2) return 0xcfcfca;
        return wall === 'left' ? 0xb5b5b0 : 0xa7a7a2;
      });
    }
    return;
  }

  const doorUs = plan.doorways.map((d) => ({ wall: d.wall, u: painter.doorCenter(d) }));
  const nearDoor = (wall: Wall, u0: number, u1: number) =>
    doorUs.some((d) => d.wall === wall && u1 > d.u - 24 && u0 < d.u + 24);
  const cafeEnd = (CAFE[2] - painter.x0 + 1) * U;

  painter.wallRect('left', 0, painter.length('left'), 0, WALL_H, (_u, v) => {
    if (v < 6) return BASEBOARD;
    if (v >= WALL_H - 3) return TRIM;
    return style === 'lobby' ? 0xe2ddd3 : 0xe9ecef;
  });
  painter.wallRect('right', 0, painter.length('right'), 0, WALL_H, (u, v) => {
    if (v < 6) return BASEBOARD;
    if (v >= WALL_H - 3) return TRIM;
    if (style === 'lobby' && u < cafeEnd) return u % 8 === 0 ? 0x6a4430 : (u >> 3) & 1 ? 0x8a5a3c : 0x7f5236;
    return style === 'lobby' ? 0xd9d4ca : 0xdfe3e8;
  });

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
    // 층 버튼판: 위에서부터 7층, 맨 위에는 층 표시창
    painter.wallRect(wall, uc - 7, uc + 7, 22, 56, (u, v) => {
      if (u === uc - 7 || u === uc + 6 || v === 22 || v === 55) return 0x5b626c;
      const row = Math.floor((53 - v) / 4.4);
      const inButton = Math.abs(u - uc) <= 1 && (53 - v) % 4.4 < 2.2 && row < 7;
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

const EDGE_COLORS = {
  lobby: [0x4f5560, 0x40454e],
  office: [0x4f5560, 0x40454e],
  roof: [0x7d7d78, 0x6a6a66],
  stairs: [0x3e4248, 0x2f3338],
  cabin: [0x5b626c, 0x4a505a],
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

  // 1층 출입문 앞 발판
  const exit = plan.portals.find((portal) => portal.to === 'plains');
  if (exit) {
    const o = painter.screen(exit.x - painter.x0 - 1, exit.y - painter.y0 - 1);
    p.parallelogram(o, [32, 16], [-48, 24], (u, v) => (u < 0.06 || u > 0.94 || v < 0.04 || v > 0.96 ? 0x2a2c31 : 0x43464d));
  }

  paintWalls(painter, plan);
  for (const door of plan.doorways) paintDoor(painter, door, plan.number);
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

export function hideoutOrigin(corner: { x: number; y: number }) {
  return originOf(HIDEOUT.area, corner);
}

/** 두 색을 t만큼 섞는다. */
function mix(a: Color, b: Color, t: number): Color {
  const channel = (shift: number) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

const LAMP_LIGHT = 0xffd98a;
const BLANKET = [0x4a78b8, 0x3f69a3];

/** 숨은 방 바닥: 짙은 나무 바닥, 가운데 러그, 스탠드 불빛, 이불과 슬리퍼 */
export function paintHideoutFloor(): HTMLCanvasElement {
  const painter = new Painter(HIDEOUT.area);
  const { p, x0, y0 } = painter;
  const lampX = HIDEOUT.lamp.x - x0 + 0.5;
  const lampY = HIDEOUT.lamp.y - y0 + 0.5;

  paintSlab(
    painter,
    (gx, gy) => {
      let c: Color;
      if (gx > 0.35 && gx < 2.65 && gy > 2.35 && gy < 5.65) {
        const border = gx < 0.55 || gx > 2.45 || gy < 2.55 || gy > 5.45;
        c = border ? 0xe9d8b4 : (Math.floor(gx * 3) + Math.floor(gy * 3)) & 1 ? 0xb5523b : 0xc8664a;
      } else {
        const row = Math.floor(gy * 2);
        const seam = Math.floor((gx + (row % 3) * 1.3) / 2.6);
        const onSeam = (gy * 2) % 1 < 0.12 || ((gx + (row % 3) * 1.3) / 2.6) % 1 < 0.03;
        c = onSeam ? 0x5e3f24 : shade(PLANK[Math.floor(hash2(row, seam) * PLANK.length)], 0.82);
      }
      const glow = Math.max(0, 1 - Math.hypot(gx - lampX, gy - lampY) / 3.2);
      return glow > 0 ? mix(shade(c, 1 + glow * 0.25), LAMP_LIGHT, glow * 0.3) : c;
    },
    [0x5a3e28, 0x4a3220],
  );

  // 이불: 바닥에서 조금 솟은 요 위에 베개와 덮은 이불
  const [fx0, fy0, fx1, fy1] = HIDEOUT.futon;
  const g0 = fx0 - x0 + 0.08;
  const g1 = fx1 - x0 + 0.92;
  const h0 = fy0 - y0 + 0.08;
  const h1 = fy1 - y0 + 0.92;
  const lift = 5;
  const at = (gx: number, gy: number, z: number): [number, number] => [...painter.screen(gx, gy, z)];
  const minus = (a: [number, number], b: [number, number]): [number, number] => [a[0] - b[0], a[1] - b[1]];
  const top = at(g0, h0, -lift);
  const side = (u: number, v: number) => (v < 0.45 ? 0xd8d0be : u > 0.4 ? BLANKET[1] : 0xd8d0be);
  p.parallelogram(at(g0, h1, -lift), minus(at(g1, h1, -lift), at(g0, h1, -lift)), [0, lift], (u, v) => shade(side(u, v), 0.8));
  p.parallelogram(at(g1, h0, -lift), minus(at(g1, h1, -lift), at(g1, h0, -lift)), [0, lift], (u, v) => shade(side(u, v), 0.7));
  p.parallelogram(top, minus(at(g1, h0, -lift), top), minus(at(g0, h1, -lift), top), (u, v) => {
    if (v < 0.3) return u > 0.22 && u < 0.78 && v > 0.06 ? (v > 0.24 ? 0xd9d3c6 : 0xf6f3ec) : 0xe6dfcf;
    if (v < 0.4) return 0xe6dfcf;
    if (v < 0.47) return 0xf0c86a;
    const wrinkle = Math.sin(u * 9 + v * 4) > 0.75;
    const check = (Math.floor(u * 6) + Math.floor(v * 6)) & 1;
    return wrinkle ? shade(BLANKET[check], 0.85) : BLANKET[check];
  });

  // 이불 앞에 벗어 둔 슬리퍼 한 켤레
  for (const k of [0, 1]) {
    const [sx, sy] = at(g0 + 0.25 + k * 0.32, h1 + 0.35 + k * 0.05, 0);
    p.ellipse(sx, sy, 3.2, 1.6, 0x6fa3c8);
    p.set(sx - 1, sy, 0xf4f1ea);
  }

  p.outlineOuter(OUTLINE);
  return p.toCanvas();
}

/** 숨은 방 뒤쪽 벽: 줄무늬 벽지, 노을 지는 창, 작은 전구 줄. 칸보다 뒤에 그려야 해서 바닥과 따로 그린다. */
export function paintHideoutWall(): HTMLCanvasElement {
  const painter = new Painter(HIDEOUT.area);
  const height = 52;
  const length = painter.length('right');
  painter.wallRect('right', 0, length, 0, height, (u, v) => {
    if (v < 5) return 0x5a3e28;
    if (v >= height - 3) return 0xf3ead8;
    return u % 6 === 0 ? 0xe2cfae : 0xefe0c2;
  });
  const [w0, w1, b, t] = [8, length - 8, 18, 42];
  const sunset = [0x7a5c8f, 0xe07a5f, 0xf6b26b];
  painter.wallRect('right', w0, w1, b, t, (u, v) => {
    if (u === w0 || u === w1 - 1 || v === b || v === t - 1 || u === Math.floor((w0 + w1) / 2)) return 0x6a4a30;
    if (Math.hypot(u - (w1 - 10), v - 26) < 3.2) return 0xfff1c4;
    const k = Math.floor(u / 4);
    if (v - b < 3 + hash2(k, 5) * 6) return 0x3d3350;
    return ramp(sunset, (v - b) / (t - b), u, v);
  });
  for (let u = 3; u < length - 2; u += 6) {
    const v = height - 8 - Math.round(Math.sin((u / length) * Math.PI) * 3);
    painter.wallRect('right', u, u + 2, v, v + 2, () => (u % 12 === 3 ? 0xffd98a : 0xff9fb0));
  }
  painter.p.outlineOuter(OUTLINE);
  return painter.p.toCanvas();
}

/** 숨은 방 구석의 스탠드. 갓 아래로 따뜻한 불빛이 샌다. */
export function paintLamp(): Art {
  const p = new Pixels(20, 48);
  const cx = 10;
  const cy = 44;
  p.ellipse(cx, cy, 5, 2, 0x3a3a3a);
  for (let v = 1; v < 32; v++) {
    p.set(cx - 1, cy - v, 0x4a4a4a);
    p.set(cx, cy - v, 0x6a6a6a);
  }
  for (let y = cy - 42; y <= cy - 31; y++) {
    const t = (y - (cy - 42)) / 11;
    const half = 3 + t * 4;
    for (let x = Math.ceil(cx - half); x <= Math.floor(cx + half - 1); x++) {
      p.set(x, y, x < cx - half + 2 ? 0xe9b866 : ramp([0xf6dca0, 0xfbe9bf], t, x, y));
    }
  }
  p.rect(cx - 5, cy - 31, 10, 1, 0xfff1c4);
  p.outlineOuter(OUTLINE);
  return { canvas: p.toCanvas(), ax: cx, ay: cy };
}

/** 숨은 방의 낮은 밥상: 컵라면과 머그컵이 올라가 있다. */
export function paintLowTable(): Art {
  const p = new Pixels(32, 32);
  const cx = 16;
  const cy = 24;
  const raise = 7;
  const topY = cy - raise;
  // 다리
  for (const [x, y] of [
    [cx - 10, topY + 1],
    [cx, topY + 5],
    [cx + 10, topY + 1],
  ]) {
    for (let v = 0; v < raise - 1; v++) p.set(x, y + 1 + v, 0x5e3f24);
  }
  // 상판 두께와 윗면
  p.parallelogram([cx - 11, topY], [11, 5.5], [0, 2], () => 0x7e5834);
  p.parallelogram([cx, topY + 5.5], [11, -5.5], [0, 2], () => 0x6a4a30);
  p.parallelogram([cx, topY - 5.5], [11, 5.5], [-11, 5.5], (u, v) => ((u * 7 + v * 3) % 1 < 0.15 ? 0xa97c4c : 0xc69866));
  // 컵라면
  p.rect(cx - 6, topY - 8, 6, 6, 0xf4f1ea);
  p.rect(cx - 6, topY - 6, 6, 2, 0xd8413b);
  p.rect(cx - 6, topY - 9, 6, 1, 0xe9e3d3);
  // 머그컵과 김
  p.rect(cx + 2, topY - 6, 4, 4, 0xf6f3ec);
  p.set(cx + 6, topY - 5, 0xf6f3ec);
  p.set(cx + 6, topY - 4, 0xf6f3ec);
  p.set(cx + 3, topY - 8, 0xdfe7ec);
  p.set(cx + 4, topY - 10, 0xdfe7ec);
  p.outlineOuter(OUTLINE);
  return { canvas: p.toCanvas(), ax: cx, ay: cy };
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
