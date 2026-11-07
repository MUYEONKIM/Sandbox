import type { SpriteName } from '../art/sprites';
import type { Area, MapId, Portal } from './maps';
import type { Tile } from './world';

/**
 * 아이티공간 건물 안. 9층과 옥상이 있지만 들어갈 수 있는 곳은 1, 4, 7, 8층과 옥상뿐이다.
 * 엘리베이터는 7층까지 가고, 8층은 7층 계단실로, 옥상은 8층 바깥 계단으로 올라간다.
 */
export type TowerId = 'tower1' | 'tower4' | 'tower7' | 'tower8' | 'stairs' | 'rooftop';

/** 1층 로비 바닥 */
const LOBBY: Area = [13, 13, 32, 32];
/** 4, 7, 8층과 옥상 바닥. 블록 설치 구역도 이 범위다. */
export const UPPER: Area = [3, 3, 42, 42];
/** 8층에서 옥상으로 오르는 바깥 계단. 건물 벽에 붙은 2칸 너비 계단이고 맨 앞 줄은 난간이다. */
const STAIRS: Area = [6, 20, 39, 22];

/** 새로 가입한 플레이어가 태어나는 층과 칸. 서버의 profiles 기본값과 같다. */
export const BIRTH_MAP: TowerId = 'tower7';
export const BIRTH_TILE = { x: 23, y: 23 };

export const ELEVATOR_INFO = { name: '엘리베이터', accent: 0xbfe6ff };
export const COUNTER_INFO = { name: "ITS'room 카운터", accent: 0xff7ad9 };

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

export type DoorKind = 'elevator' | 'stairs' | 'outside' | 'roofStairs';

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
  /** 층 번호. 옥상과 바깥 계단은 null */
  number: number | null;
  style: 'lobby' | 'office' | 'roof' | 'stairs';
  /** 바닥이 있는 칸 */
  area: Area;
  doorways: Doorway[];
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

/** 바깥 계단의 구간: 아래 층참, 계단, 가운데 층참, 계단, 위 층참 (x 범위, 끝 칸 포함) */
export const STAIR_FLIGHTS: [number, number][] = [
  [26, 35],
  [10, 21],
];

/** 바깥 계단 맨 앞 줄의 난간 칸. 지나갈 수 없다. */
export const RAILINGS: Tile[] = Array.from({ length: STAIRS[2] - STAIRS[0] + 1 }, (_, i) => ({
  x: STAIRS[0] + i,
  y: STAIRS[3],
}));

function wallPortal([x0, y0]: Area, { wall, at }: Doorway, to: Portal['to'], label?: string): Portal {
  return wall === 'right'
    ? { x: at, y: y0, to, label, landing: { x: at, y: y0 + 2 } }
    : { x: x0, y: at, to, label, landing: { x: x0 + 2, y: at } };
}

const lobbyElevator: Doorway = { wall: 'right', at: 28, kind: 'elevator' };
const elevator: Doorway = { wall: 'right', at: 33, kind: 'elevator' };
const stairsUp: Doorway = { wall: 'left', at: 12, kind: 'stairs' };
const outside: Doorway = { wall: 'left', at: 34, kind: 'outside' };
const roofStairs: Doorway = { wall: 'left', at: 34, kind: 'roofStairs' };
/** 바깥 계단 아래 층참의 8층 문과 위 층참의 옥상 문 */
const stairsBottom: Doorway = { wall: 'right', at: 38, kind: 'outside' };
const stairsTop: Doorway = { wall: 'left', at: 20, kind: 'outside' };

export const FLOORS: Record<TowerId, FloorPlan> = {
  tower1: {
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
    doorways: [elevator, stairsUp],
    portals: [wallPortal(UPPER, elevator, 'elevator'), wallPortal(UPPER, stairsUp, 'tower8', '8층 (계단)')],
  },
  tower8: {
    number: 8,
    style: 'office',
    area: UPPER,
    doorways: [stairsUp, outside],
    portals: [wallPortal(UPPER, stairsUp, 'tower7', '7층 (계단)'), wallPortal(UPPER, outside, 'stairs')],
  },
  stairs: {
    number: null,
    style: 'stairs',
    area: STAIRS,
    doorways: [stairsBottom, stairsTop],
    portals: [
      { x: stairsBottom.at, y: STAIRS[1], to: 'tower8', label: '8층', landing: { x: stairsBottom.at - 2, y: STAIRS[1] + 1 } },
      { x: STAIRS[0], y: stairsTop.at, to: 'rooftop', label: '옥상', landing: { x: STAIRS[0] + 2, y: stairsTop.at + 1 } },
    ],
  },
  rooftop: {
    number: null,
    style: 'roof',
    area: UPPER,
    doorways: [roofStairs],
    portals: [wallPortal(UPPER, roofStairs, 'stairs')],
  },
};

export function isTower(id: MapId): id is TowerId {
  return Object.hasOwn(FLOORS, id);
}
