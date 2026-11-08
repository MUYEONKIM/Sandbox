import type { SpriteName } from '../art/sprites';
import type { Area, MapId, Portal } from './maps';
import type { Tile } from './world';

/**
 * 아이티공간 건물 안. 9층과 옥상이 있지만 들어갈 수 있는 곳은 1, 4, 7, 8층과 옥상뿐이다.
 * 엘리베이터는 7층까지 가고, 8층은 7층 사무실 안 계단으로, 옥상은 8층 바깥 계단으로 올라간다.
 */
export type TowerId = 'tower1' | 'tower4' | 'tower7' | 'tower8' | 'stairs' | 'rooftop' | 'elevator';

/** 1층 로비 바닥 */
const LOBBY: Area = [13, 13, 32, 32];
/** 4, 7, 8층과 옥상 바닥. 블록 설치 구역도 이 범위다. */
export const UPPER: Area = [3, 3, 42, 42];
/** 8층에서 옥상으로 오르는 바깥 계단. 건물 벽에 붙은 2칸 너비 계단이고 맨 앞 줄은 난간이다. */
const STAIRS: Area = [6, 20, 39, 22];
/** 엘리베이터 안 */
const CABIN: Area = [21, 21, 24, 24];

export const COUNTER_INFO = { name: "ITS'room 카운터", accent: 0xff7ad9 };
export const PANEL_INFO = { name: '층 버튼', accent: 0xffd84d };

/** 엘리베이터 버튼. 위에서부터 7층이고, 2, 3, 5, 6층은 임대를 줘서 내리지 못한다. */
export const ELEVATOR_STOPS: { floor: number; to: TowerId | null }[] = [
  { floor: 7, to: 'tower7' },
  { floor: 6, to: null },
  { floor: 5, to: null },
  { floor: 4, to: 'tower4' },
  { floor: 3, to: null },
  { floor: 2, to: null },
  { floor: 1, to: 'tower1' },
];

export type DoorKind = 'elevator' | 'outside' | 'roofStairs' | 'panel';

/** 뒤쪽 벽에 난 문. at은 오른쪽 벽이면 x, 왼쪽 벽이면 y 칸이다. */
export interface Doorway {
  wall: 'left' | 'right';
  at: number;
  kind: DoorKind;
}

/** 칸 하나를 차지하는 가구 */
export interface Furniture {
  sprite: SpriteName;
  x: number;
  y: number;
}

export interface FloorPlan {
  /** 층 번호. 옥상, 바깥 계단, 엘리베이터 안은 null */
  number: number | null;
  style: 'lobby' | 'office' | 'roof' | 'stairs' | 'cabin';
  /** 바닥이 있는 칸 */
  area: Area;
  doorways: Doorway[];
  /** 계단 무늬를 그리는 칸. 왼쪽 위(-x)로 갈수록 높다. */
  flights: Area[];
  /** 난간이 서 있는 칸. 지나갈 수 없다. */
  railings: Tile[];
  /** 벽에 쓰는 글씨: 왼쪽 벽의 칸 위치와 글씨 */
  signs: { at: number; text: string }[];
  /** 첫 포탈 앞이 쓰러진 뒤 일어나는 칸이다. */
  portals: Portal[];
}

/** 1층 카페 ITS'room의 카운터. 오른쪽 벽을 따라 놓이고 손님은 앞(+y)에 선다. */
export const COUNTER = { sprite: 'counter' as const, x: 17, y: 15, w: 6, d: 1 };
const COUNTER_SPOT = { x: 20, y: 16 };
/** 카페 바닥(나무)이 깔리는 구역 */
export const CAFE: Area = [13, 13, 24, 28];
/** 카페 간판을 다는 벽 위치와 높이 (아트 픽셀) */
export const CAFE_SIGN = { x: 20, y: LOBBY[1], lift: 66 };

export const LOBBY_FURNITURE: Furniture[] = [
  { sprite: 'cafe-table', x: 15, y: 20 },
  { sprite: 'cafe-table', x: 18, y: 22 },
  { sprite: 'cafe-table', x: 15, y: 25 },
  { sprite: 'cafe-table', x: 21, y: 25 },
  { sprite: 'plant', x: 24, y: 13 },
  { sprite: 'plant', x: 31, y: 13 },
  { sprite: 'plant', x: 13, y: 31 },
];

/**
 * 4층 오른쪽 아래 바닥 끝 바깥에 숨은 작은 방. 바닥 끝 칸 trigger를 밟으면 밟은 사람 화면에서만 드러나고,
 * 층을 나가면 다시 숨는다. 자리는 사용자가 정했다(2026-11-08, 실제 사이트 test 계정이 서 있던 칸).
 */
export const HIDEOUT = {
  map: 'tower4' as const,
  trigger: { x: 42, y: 15 },
  area: [43, 12, 45, 18] as Area,
  title: '진우씨가 유일하게 맘 편히 쉬었던 안식처',
  /** 이불. 바닥 그림에 함께 그리고 칸만 막는다. */
  futon: [44, 12, 45, 13] as Area,
  lamp: { x: 43, y: 12 },
  table: { x: 45, y: 16 },
  plant: { x: 43, y: 18 },
};

/** 숨은 방에서 가구가 있어 지나갈 수 없는 칸 */
export function hideoutSolid(): Tile[] {
  const [x0, y0, x1, y1] = HIDEOUT.futon;
  const tiles: Tile[] = [HIDEOUT.lamp, HIDEOUT.table, HIDEOUT.plant];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tiles.push({ x, y });
  return tiles;
}

/** 한 줄로 늘어선 난간 칸 */
function railRow(x0: number, x1: number, y: number): Tile[] {
  return Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y }));
}

/**
 * 7층과 8층을 잇는 사무실 안 계단. 2칸 너비로 왼쪽 벽을 향해 오르고 양옆은 난간이다.
 * 벽 앞 두 칸은 층참이고 그 끝의 포탈로 다른 층에 간다.
 */
const WELL = { x0: UPPER[0], x1: 12, y0: 11, y1: 12 };
const WELL_FLIGHT: Area = [WELL.x0 + 2, WELL.y0, WELL.x1, WELL.y1];
const WELL_RAILINGS = [...railRow(WELL.x0, WELL.x1, WELL.y0 - 1), ...railRow(WELL.x0, WELL.x1, WELL.y1 + 1)];

function wellPortal(to: MapId, label: string): Portal {
  return { x: WELL.x0, y: WELL.y0, to, label, landing: { x: WELL.x0 + 2, y: WELL.y1 } };
}

function wallPortal([x0, y0]: Area, { wall, at }: Doorway, to: Portal['to'], label?: string): Portal {
  return wall === 'right'
    ? { x: at, y: y0, to, label, landing: { x: at, y: y0 + 2 } }
    : { x: x0, y: at, to, label, landing: { x: x0 + 2, y: at } };
}

const lobbyElevator: Doorway = { wall: 'right', at: 28, kind: 'elevator' };
const elevator: Doorway = { wall: 'right', at: 33, kind: 'elevator' };
const outside: Doorway = { wall: 'left', at: 34, kind: 'outside' };
const roofStairs: Doorway = { wall: 'left', at: 34, kind: 'roofStairs' };
/** 바깥 계단 아래 층참의 8층 문과 위 층참의 옥상 문 */
const stairsBottom: Doorway = { wall: 'right', at: 38, kind: 'outside' };
const stairsTop: Doorway = { wall: 'left', at: 20, kind: 'outside' };
/** 엘리베이터 안의 층 버튼 */
const panel: Doorway = { wall: 'right', at: 23, kind: 'panel' };

const plain = { flights: [] as Area[], railings: [] as Tile[], signs: [] as FloorPlan['signs'] };

export const FLOORS: Record<TowerId, FloorPlan> = {
  tower1: {
    ...plain,
    number: 1,
    style: 'lobby',
    area: LOBBY,
    doorways: [lobbyElevator],
    portals: [
      wallPortal(LOBBY, lobbyElevator, 'elevator'),
      { ...COUNTER_SPOT, to: 'counter', landing: { x: COUNTER_SPOT.x, y: COUNTER_SPOT.y + 2 } },
      { x: LOBBY[2], y: 23, to: 'plains', label: '시작마을', landing: { x: LOBBY[2] - 2, y: 23 } },
    ],
  },
  tower4: {
    ...plain,
    number: 4,
    style: 'office',
    area: UPPER,
    doorways: [elevator],
    portals: [wallPortal(UPPER, elevator, 'elevator')],
  },
  tower7: {
    number: 7,
    style: 'office',
    area: UPPER,
    doorways: [elevator],
    flights: [WELL_FLIGHT],
    railings: WELL_RAILINGS,
    signs: [{ at: WELL.y0, text: '8F' }],
    portals: [wallPortal(UPPER, elevator, 'elevator'), wellPortal('tower8', '8층 (계단)')],
  },
  tower8: {
    number: 8,
    style: 'office',
    area: UPPER,
    doorways: [outside],
    flights: [WELL_FLIGHT],
    railings: WELL_RAILINGS,
    signs: [{ at: WELL.y0, text: '7F' }],
    portals: [wellPortal('tower7', '7층 (계단)'), wallPortal(UPPER, outside, 'stairs')],
  },
  stairs: {
    ...plain,
    number: null,
    style: 'stairs',
    area: STAIRS,
    doorways: [stairsBottom, stairsTop],
    flights: [
      [26, STAIRS[1], 35, STAIRS[3]],
      [10, STAIRS[1], 21, STAIRS[3]],
    ],
    railings: railRow(STAIRS[0], STAIRS[2], STAIRS[3]),
    portals: [
      { x: stairsBottom.at, y: STAIRS[1], to: 'tower8', label: '8층', landing: { x: stairsBottom.at - 2, y: STAIRS[1] + 1 } },
      { x: STAIRS[0], y: stairsTop.at, to: 'rooftop', label: '옥상', landing: { x: STAIRS[0] + 2, y: stairsTop.at + 1 } },
    ],
  },
  rooftop: {
    ...plain,
    number: null,
    style: 'roof',
    area: UPPER,
    doorways: [roofStairs],
    portals: [wallPortal(UPPER, roofStairs, 'stairs')],
  },
  elevator: {
    ...plain,
    number: null,
    style: 'cabin',
    area: CABIN,
    doorways: [panel],
    // 포탈은 층 버튼판 하나다. 층을 고르는 것도, 탔던 층에서 내리는 것도 버튼판 창에서 한다.
    portals: [wallPortal(CABIN, panel, 'panel')],
  },
};

export function isTower(id: MapId): id is TowerId {
  return Object.hasOwn(FLOORS, id);
}
