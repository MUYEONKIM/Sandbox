import type { Area } from '../game/maps';
import { CAFE, FLOORS, STAIR_FLIGHTS, type Doorway, type FloorPlan, type TowerId } from '../game/tower';
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

  text(wall: Wall, text: string, u0: number, v0: number, scale: number, c: Color) {
    [...text].forEach((ch, i) => {
      GLYPHS[ch].forEach((row, ry) => {
        [...row].forEach((bit, rx) => {
          if (bit !== '1') return;
          const u = u0 + (i * 4 + rx) * scale;
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

function officeFloor(): FloorShader {
  return (gx, gy, sx, sy) => {
    if (frac(gx / 2) < 0.025 || frac(gy / 2) < 0.025) return 0x4f5560;
    const base = (Math.floor(gx / 2) + Math.floor(gy / 2)) & 1 ? 0x5f6672 : 0x666e7b;
    return hash2(sx, sy) < 0.18 ? shade(base, 0.92) : base;
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
function stairsFloor(painter: Painter): FloorShader {
  const { x0, w } = painter;
  return (gx, _gy, sx, sy) => {
    const x = x0 + Math.floor(gx);
    const onFlight = STAIR_FLIGHTS.some(([a, b]) => x >= a && x <= b);
    if (!onFlight) return (sx + 2 * sy) % 6 === 0 ? 0xa3a9b0 : 0x8a9098;
    const s = frac(gx * 2);
    if (s > 0.78) return 0x3e4248;
    if (s > 0.7) return 0xf2c14e;
    const lift = 1 + (1 - gx / w) * 0.15;
    return shade((sx + sy) % 3 === 0 ? 0x6b7179 : 0x7d838c, lift);
  };
}

const FLOOR_SHADERS = { lobby: lobbyFloor, office: officeFloor, roof: roofFloor, stairs: stairsFloor };

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

/** 가장 먼저 그리는 벽면: 사무실 벽, 1층 로비 벽, 옥상 난간 */
function paintWalls(painter: Painter, plan: FloorPlan) {
  const { style } = plan;
  if (style === 'stairs') {
    paintFacade(painter, plan);
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
  if (door.kind === 'stairs') {
    painter.wallRect(wall, uc - 12, uc + 12, 0, 52, () => FRAME);
    painter.wallRect(wall, uc - 10, uc + 10, 0, 49, (u, v) => {
      if (u >= uc - 5 && u < uc + 5 && v >= 32 && v < 42) return 0xa8d4ea;
      if (u >= uc + 5 && u < uc + 8 && v >= 22 && v < 25) return 0xe0e0e0;
      return 0x8d939b;
    });
    // 계단 그림 표지판
    painter.wallRect(wall, uc - 8, uc + 8, 55, 64, (u, v) => {
      const step = Math.floor((u - uc + 6) / 3);
      return u > uc - 6 && u < uc + 6 && v - 56 < step + 1 && v > 56 ? 0xf4f4f0 : SIGN_GREEN;
    });
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
};

/** 층 하나를 그린다. 같은 층은 처음 들어갈 때 한 번만 그리면 된다. */
export function paintInterior(id: TowerId): HTMLCanvasElement {
  const plan = FLOORS[id];
  const painter = new Painter(plan.area);
  const { p, w, d, cx } = painter;
  const shader = FLOOR_SHADERS[plan.style](painter);

  // 바닥 앞쪽 두께. 앞 모서리를 기준으로 왼쪽은 앞-왼쪽 변, 오른쪽은 앞-오른쪽 변이다.
  const corner = cx + (w - d) * 16;
  const [leftEdge, rightEdge] = EDGE_COLORS[plan.style];
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

/** 층 그림을 맵 위에 놓을 왼쪽 위 위치. corner는 바닥 뒤쪽 모서리의 월드 좌표다. */
export function interiorOrigin(id: TowerId, corner: { x: number; y: number }) {
  const [, y0, , y1] = FLOORS[id].area;
  return { left: corner.x - (y1 - y0 + 1) * 16, top: corner.y - WALL_H };
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
