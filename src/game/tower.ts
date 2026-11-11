import type { SpriteName } from '../art/sprites';
import type { Area, MapId, Portal } from './maps';
import type { Tile } from './world';

/**
 * 아이티공간 건물 안. 9층과 옥상이 있지만 들어갈 수 있는 곳은 1, 4, 7, 8층과 옥상뿐이다.
 * 엘리베이터는 7층까지 가고, 8층은 7층 사무실 안 계단으로, 옥상은 8층 바깥 계단으로 올라간다.
 */
export type TowerId = 'tower1' | 'tower4' | 'tower7' | 'tower8' | 'stairs' | 'rooftop' | 'elevator';

/** 1층 로비 바닥. 블록 설치 구역도 이 범위다. */
export const LOBBY: Area = [13, 13, 32, 32];
/** 4층과 옥상 바닥. 블록 설치 구역도 이 범위다. */
export const UPPER: Area = [3, 3, 42, 42];
/**
 * 7, 8층 바닥. 사용자가 준 실제 평면도(2026-11-11)를 한 칸 7.16pt로 옮겼다: x는 평면도 아래(엘리베이터 쪽)에서 위로 62칸,
 * y는 평면도 왼쪽(창가)에서 오른쪽으로 80칸이다. 그래서 뒤쪽 왼쪽 벽이 평면도 아래 변, 뒤쪽 오른쪽 벽이 평면도 왼쪽 변이다.
 * 블록 설치 구역도 이 범위다(벽 칸에는 못 놓는다).
 */
export const TOP_FLOORS: Area = [3, 3, 64, 82];
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

/** 계단 무늬를 그리는 칸. up은 올라가는 쪽이다(x-: 왼쪽 위, y-: 오른쪽 위, y+: 왼쪽 아래). */
export interface Flight {
  area: Area;
  up: 'x-' | 'y-' | 'y+';
}

/**
 * 층 안을 나누는 벽. 칸을 막고 상자 그림(art/cube.ts)으로 세운다.
 * wall: 방을 나누는 흰 벽, core: 엘리베이터 옆 기둥과 덕트, elevator: 엘리베이터 통, glass: 뚫린 바닥 둘레의 유리 난간
 */
export type PartitionKind = 'wall' | 'core' | 'elevator' | 'glass';

export interface Partition {
  kind: PartitionKind;
  area: Area;
}

export interface FloorPlan {
  /** 층 번호. 옥상, 바깥 계단, 엘리베이터 안은 null */
  number: number | null;
  style: 'lobby' | 'office' | 'roof' | 'stairs' | 'cabin';
  /** 바닥이 있는 칸 */
  area: Area;
  doorways: Doorway[];
  flights: Flight[];
  /** 층 안의 벽 */
  partitions: Partition[];
  /** 아래층이 내려다보이게 뚫린 바닥. 걸을 수 없다. */
  voids: Area[];
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

/** 7, 8층 평면도 좌표(gx: 아래에서 위, gy: 왼쪽에서 오른쪽)를 맵 칸으로 바꾼다. */
const at = (gx: number, gy: number) => ({ x: TOP_FLOORS[0] + gx, y: TOP_FLOORS[1] + gy });
const rect = (gx0: number, gy0: number, gx1 = gx0, gy1 = gy0): Area => {
  const a = at(gx0, gy0);
  const b = at(gx1, gy1);
  return [a.x, a.y, b.x, b.y];
};
const parts = (kind: PartitionKind, areas: Area[]): Partition[] => areas.map((area) => ({ kind, area }));

/**
 * 7, 8층에 공통인 구조: 평면도 아래 왼쪽의 계단실, 엘리베이터와 덕트, 가운데 7·8층을 잇는 U자 계단, 아래쪽 방들.
 * 문은 벽을 비운 3칸이다. 평면도의 왼쪽 창가 돌출부와 바깥 기둥, 화장실 칸막이는 뺐다.
 */
const SHARED_PARTITIONS: Partition[] = [
  ...parts('wall', [
    rect(8, 26, 12, 26), // 계단실 문 옆
    rect(33, 44, 33, 57), // 가운데 계단 위쪽 벽
    rect(22, 57, 32, 57), // 가운데 계단 오른쪽 끝
    rect(34, 44, 36, 44), // 계단 앞 공간 오른쪽
    rect(14, 38, 14, 39), // 아래쪽 방들의 위 벽(문 40~42, 54~56 또는 55~57)
    rect(0, 51, 13, 51), // 아래쪽 방 사이
    rect(15, 58, 21, 58), // 복도 끝
  ]),
  ...parts('core', [
    rect(27, 44, 27, 53), // 가운데 계단 사이 벽
    rect(5, 5, 6, 18), // 계단실 계단 사이 벽
    rect(0, 47, 1, 54), // 아래쪽 덕트
  ]),
  ...parts('elevator', [rect(0, 27, 9, 37)]),
];

/** 계단실(평면도 아래 왼쪽)과 가운데 U자 계단의 계단 무늬 */
const SHARED_FLIGHTS: Flight[] = [
  { area: rect(7, 3, 11, 19), up: 'y-' },
  { area: rect(0, 3, 4, 19), up: 'y+' },
  { area: rect(22, 44, 26, 53), up: 'y+' },
  { area: rect(28, 44, 32, 53), up: 'y-' },
];

/** 가운데 U자 계단. 7층에서 아래 계단, 층참, 위 계단을 걸어 올라 끝 칸에서 8층으로 가고, 8층은 계단 끝 칸에서 바로 내려간다. */
const STAIR_TOP = at(30, 44);

const FLOOR7: Pick<FloorPlan, 'partitions' | 'flights' | 'voids' | 'railings' | 'portals'> = {
  partitions: [
    ...SHARED_PARTITIONS,
    ...parts('wall', [
      // 왼쪽 방 세 개(창가)와 그 문. 문은 x 22~24, 33~35, 46~48
      rect(13, 10, 21, 10),
      rect(25, 10, 32, 10),
      rect(36, 10, 45, 10),
      rect(49, 10, 61, 10),
      rect(26, 0, 26, 9),
      rect(44, 0, 44, 9),
      rect(12, 0, 12, 20), // 계단실 위 벽(문 y 21~25)
      // 가운데 홀과 오른쪽 사무실 사이(문 x 46~48)
      rect(20, 33, 45, 33),
      rect(49, 33, 61, 33),
      // 계단 앞 공간: 위 벽(문 y 36~38)과 아래 벽
      rect(37, 34, 37, 35),
      rect(37, 39, 37, 44),
      rect(21, 34, 21, 57),
      // 아래쪽 방들(엘리베이터 홀, 가운데 방, 오른쪽 방)
      rect(14, 43, 14, 54),
      rect(14, 58, 14, 65),
      rect(0, 65, 13, 65),
      rect(12, 70, 12, 79),
      rect(12, 66, 16, 66),
    ]),
    ...parts('core', [rect(10, 27, 15, 38), rect(13, 18, 15, 20)]),
  ],
  flights: SHARED_FLIGHTS,
  voids: [],
  // 계단 앞 공간에서 위 계단 끝으로 바로 오르지 못하게 막는다.
  railings: railRow(at(28, 43).x, at(32, 43).x, at(28, 43).y),
  portals: [
    // 엘리베이터 문은 엘리베이터 홀 쪽(오른쪽 위)에 있다.
    { ...at(5, 38), to: 'elevator', landing: at(5, 41) },
    { ...STAIR_TOP, to: 'tower8', label: '8층 (계단)', landing: at(24, 41) },
  ],
};

const FLOOR8: Pick<FloorPlan, 'partitions' | 'flights' | 'voids' | 'railings' | 'portals'> = {
  partitions: [
    ...SHARED_PARTITIONS,
    ...parts('wall', [
      rect(12, 0, 12, 22), // 계단실 위 벽(문 y 23~25)
      // 뚫린 바닥 아래 왼쪽 벽(문 x 18~20)
      rect(13, 18, 17, 18),
      rect(21, 18, 21, 18),
      // 계단 앞 공간 위 벽(문 y 39~41)과 아래쪽은 복도로 트였다.
      rect(37, 34, 37, 38),
      rect(37, 42, 37, 44),
      rect(21, 43, 21, 57),
      // 화장실 두 칸과 오른쪽 방
      rect(14, 43, 14, 53),
      rect(14, 57, 14, 66),
      rect(15, 51, 15, 52),
      rect(0, 66, 13, 66),
      rect(10, 67, 10, 69),
      rect(10, 73, 10, 79),
      rect(11, 69, 14, 69),
    ]),
    // 8층에는 엘리베이터가 서지 않아 문이 없다.
    ...parts('core', [rect(10, 27, 14, 38), rect(0, 38, 9, 38), rect(15, 27, 15, 28)]),
    // 7층 가운데 홀 위가 뚫려 있다.
    ...parts('glass', [rect(22, 10, 22, 33), rect(23, 10, 61, 10), rect(23, 33, 61, 33)]),
  ],
  flights: SHARED_FLIGHTS,
  voids: [rect(23, 11, 61, 32)],
  railings: [],
  portals: [
    { ...STAIR_TOP, to: 'tower7', label: '7층 (계단)', landing: at(30, 41) },
    // 계단실 문으로 들어가면 옥상으로 오르는 바깥 계단이다.
    { ...at(12, 24), to: 'stairs', landing: at(14, 24) },
  ],
};

function wallPortal([x0, y0]: Area, { wall, at }: Doorway, to: Portal['to'], label?: string): Portal {
  return wall === 'right'
    ? { x: at, y: y0, to, label, landing: { x: at, y: y0 + 2 } }
    : { x: x0, y: at, to, label, landing: { x: x0 + 2, y: at } };
}

const lobbyElevator: Doorway = { wall: 'right', at: 28, kind: 'elevator' };
const elevator: Doorway = { wall: 'right', at: 33, kind: 'elevator' };
const roofStairs: Doorway = { wall: 'left', at: 34, kind: 'roofStairs' };
/** 바깥 계단 아래 층참의 8층 문과 위 층참의 옥상 문 */
const stairsBottom: Doorway = { wall: 'right', at: 38, kind: 'outside' };
const stairsTop: Doorway = { wall: 'left', at: 20, kind: 'outside' };
/** 엘리베이터 안의 층 버튼 */
const panel: Doorway = { wall: 'right', at: 23, kind: 'panel' };

const plain = {
  flights: [] as Flight[],
  partitions: [] as Partition[],
  voids: [] as Area[],
  railings: [] as Tile[],
  signs: [] as FloorPlan['signs'],
};

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
    area: TOP_FLOORS,
    doorways: [],
    signs: [],
    ...FLOOR7,
  },
  tower8: {
    number: 8,
    style: 'office',
    area: TOP_FLOORS,
    doorways: [],
    signs: [],
    ...FLOOR8,
  },
  stairs: {
    ...plain,
    number: null,
    style: 'stairs',
    area: STAIRS,
    doorways: [stairsBottom, stairsTop],
    flights: [
      { area: [26, STAIRS[1], 35, STAIRS[3]], up: 'x-' },
      { area: [10, STAIRS[1], 21, STAIRS[3]], up: 'x-' },
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
