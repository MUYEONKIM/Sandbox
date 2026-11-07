import type { SpriteName } from '../art/sprites';
import type { Area, MapId, Portal } from './maps';

/**
 * 아이티공간 건물 안. 9층과 옥상이 있지만 들어갈 수 있는 곳은 1, 4, 7, 8층과 옥상뿐이다.
 * 엘리베이터는 7층까지 가고, 8층은 7층 계단실로, 옥상은 8층 바깥 계단으로 올라간다.
 */
export type TowerId = 'tower1' | 'tower4' | 'tower7' | 'tower8' | 'rooftop';

/** 층마다 맵 가운데의 이 칸들만 바닥이다. 블록 설치 구역과 서버의 blocks 정책도 같은 범위를 쓴다. */
export const FLOOR: Area = [13, 13, 32, 32];
const [X0, Y0, X1] = FLOOR;
export const FLOOR_SIZE = X1 - X0 + 1;

/** 새로 가입한 플레이어가 태어나는 층과 칸. 서버의 profiles 기본값과 같다. */
export const BIRTH_MAP: TowerId = 'tower7';
export const BIRTH_TILE = { x: 23, y: 23 };

/** 엘리베이터는 모든 층의 같은 자리(오른쪽 벽)에 있다. */
const ELEVATOR_X = 28;
/** 7층과 8층을 잇는 계단실 문 (왼쪽 벽) */
const STAIRS_Y = 18;
/** 8층에서 옥상으로 가는 바깥 계단 (왼쪽 벽) */
const OUTSIDE_Y = 27;
/** 1층 출입문 (앞쪽 오른쪽 가장자리) */
const EXIT_Y = 23;

export const ELEVATOR_INFO = { name: '엘리베이터', accent: 0xbfe6ff };
export const COUNTER_INFO = { name: "ITS'room 카운터", accent: 0xff7ad9 };

/** 엘리베이터 버튼. 2, 3, 5, 6층은 임대를 줘서 내리지 못한다. */
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
  /** 층 번호. 옥상은 null */
  number: number | null;
  style: 'lobby' | 'office' | 'roof';
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
export const CAFE_SIGN = { x: 20, y: Y0, lift: 66 };

export const LOBBY_FURNITURE: Furniture[] = [
  { sprite: 'cafe-table', x: 15, y: 20 },
  { sprite: 'cafe-table', x: 18, y: 22 },
  { sprite: 'cafe-table', x: 15, y: 25 },
  { sprite: 'cafe-table', x: 21, y: 25 },
  { sprite: 'plant', x: 24, y: 13 },
  { sprite: 'plant', x: 31, y: 13 },
  { sprite: 'plant', x: 13, y: 31 },
];

function wallPortal({ wall, at }: Doorway, to: Portal['to'], label?: string): Portal {
  return wall === 'right'
    ? { x: at, y: Y0, to, label, landing: { x: at, y: Y0 + 2 } }
    : { x: X0, y: at, to, label, landing: { x: X0 + 2, y: at } };
}

const elevator: Doorway = { wall: 'right', at: ELEVATOR_X, kind: 'elevator' };
const stairsUp: Doorway = { wall: 'left', at: STAIRS_Y, kind: 'stairs' };
const outside: Doorway = { wall: 'left', at: OUTSIDE_Y, kind: 'outside' };
const roofStairs: Doorway = { wall: 'left', at: OUTSIDE_Y, kind: 'roofStairs' };

export const FLOORS: Record<TowerId, FloorPlan> = {
  tower1: {
    number: 1,
    style: 'lobby',
    doorways: [elevator],
    portals: [
      wallPortal(elevator, 'elevator'),
      { ...COUNTER_SPOT, to: 'counter', landing: { x: COUNTER_SPOT.x, y: COUNTER_SPOT.y + 2 } },
      { x: X1, y: EXIT_Y, to: 'plains', label: '시작마을', landing: { x: X1 - 2, y: EXIT_Y } },
    ],
  },
  tower4: {
    number: 4,
    style: 'office',
    doorways: [elevator],
    portals: [wallPortal(elevator, 'elevator')],
  },
  tower7: {
    number: 7,
    style: 'office',
    doorways: [elevator, stairsUp],
    portals: [wallPortal(elevator, 'elevator'), wallPortal(stairsUp, 'tower8', '8층 (계단)')],
  },
  tower8: {
    number: 8,
    style: 'office',
    doorways: [stairsUp, outside],
    portals: [wallPortal(stairsUp, 'tower7', '7층 (계단)'), wallPortal(outside, 'rooftop', '옥상 (바깥 계단)')],
  },
  rooftop: {
    number: null,
    style: 'roof',
    doorways: [roofStairs],
    portals: [wallPortal(roofStairs, 'tower8', '8층 (바깥 계단)')],
  },
};

export function isTower(id: MapId): id is TowerId {
  return Object.hasOwn(FLOORS, id);
}
