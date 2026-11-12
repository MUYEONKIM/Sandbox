import type { SpriteName } from '../art/sprites';
import type { Area, MapId, Portal } from './maps';
import type { Tile } from './world';

/**
 * 아이티공간 건물 안. 9층과 옥상이 있지만 들어갈 수 있는 곳은 1, 4, 7, 8층과 옥상뿐이다.
 * 엘리베이터는 7층까지 가고, 8층은 7층 사무실 안 계단으로, 옥상은 8층 바깥 계단으로 올라간다.
 * 시작마을 주점을 고친 도박장(casino)과 증권거래소 안(exchange)도 같은 방식으로 그리는 건물 안이라 여기에 함께 둔다.
 */
export type TowerId = 'tower1' | 'tower4' | 'tower7' | 'tower8' | 'stairs' | 'rooftop' | 'elevator' | 'casino' | 'exchange' | 'annex';

/** 1층 로비 바닥. 블록 설치 구역도 이 범위다. */
export const LOBBY: Area = [13, 13, 32, 32];
/** 4층과 옥상 바닥. 블록 설치 구역도 이 범위다. */
export const UPPER: Area = [3, 3, 42, 42];
/**
 * 7, 8층 바닥. 사용자가 준 실제 평면도(2026-11-11)를 한 칸 7.16pt로 옮겼다: x는 62칸(평면도 세로), y는 80칸(평면도 가로)이다.
 * 평면도 아래(엘리베이터 쪽)가 화면 앞쪽에 오도록 놓아서 뒤쪽 왼쪽 벽이 평면도 위 변, 뒤쪽 오른쪽 벽이 평면도 오른쪽 변이다.
 * 평면도 좌표는 아래 at()이 바꾼다. 블록 설치 구역도 이 범위다(벽 칸에는 못 놓는다).
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
 * wall: 방을 나누는 얇은 흰 벽, core: 엘리베이터 통과 덕트 같은 콘크리트 덩어리, glass: 뚫린 바닥 둘레의 유리 난간
 */
export type PartitionKind = 'wall' | 'core' | 'glass';

export interface Partition {
  kind: PartitionKind;
  area: Area;
}

export interface FloorPlan {
  /** 층 번호. 옥상, 바깥 계단, 엘리베이터 안은 null */
  number: number | null;
  style: 'lobby' | 'office' | 'roof' | 'stairs' | 'cabin' | 'casino' | 'exchange' | 'annex';
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
function railRow(xa: number, xb: number, y: number): Tile[] {
  const x0 = Math.min(xa, xb);
  return Array.from({ length: Math.abs(xb - xa) + 1 }, (_, i) => ({ x: x0 + i, y }));
}

/**
 * 7, 8층 평면도 좌표(gx: 평면도 아래에서 위로 0~61, gy: 왼쪽에서 오른쪽으로 0~79)를 맵 칸으로 바꾼다.
 * 평면도 아래(엘리베이터 쪽)가 화면 아래(앞쪽)에 오도록 돌려 놓는다(사용자 요청 2026-11-11).
 */
const PLAN_GX = TOP_FLOORS[2] - TOP_FLOORS[0];
const PLAN_GY = TOP_FLOORS[3] - TOP_FLOORS[1];
const at = (gx: number, gy: number) => ({ x: TOP_FLOORS[0] + PLAN_GX - gx, y: TOP_FLOORS[1] + PLAN_GY - gy });
const rect = (gx0: number, gy0: number, gx1 = gx0, gy1 = gy0): Area => {
  const a = at(gx0, gy0);
  const b = at(gx1, gy1);
  return [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)];
};
/** 평면도 기준으로 적은 계단 오르는 쪽을 맵 방향으로 바꾼다. 돌려 놓았으므로 y 방향이 뒤집힌다. */
const flight = (area: Area, planUp: 'y+' | 'y-'): Flight => ({ area, up: planUp === 'y+' ? 'y-' : 'y+' });
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
    rect(27, 44, 27, 53), // 가운데 계단 사이 벽
    rect(5, 5, 5, 18), // 계단실 계단 사이 벽
  ]),
  ...parts('core', [rect(0, 47, 1, 54), rect(0, 27, 9, 37)]), // 아래쪽 덕트, 엘리베이터 통
];

/** 계단실(평면도 아래 왼쪽)과 가운데 U자 계단의 계단 무늬. 오르는 쪽은 평면도 기준이다. */
const SHARED_FLIGHTS: Flight[] = [
  flight(rect(6, 3, 11, 19), 'y-'),
  flight(rect(0, 3, 4, 19), 'y+'),
  flight(rect(22, 44, 26, 53), 'y+'),
  flight(rect(28, 44, 32, 53), 'y-'),
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
      // 가운데 홀과 오른쪽 사무실 사이. 문은 x 46~48(사무실)과 28~30(계단 앞 공간, 사용자 수정 2026-11-11)
      rect(20, 33, 27, 33),
      rect(31, 33, 45, 33),
      rect(49, 33, 61, 33),
      // 계단 앞 공간: 위 벽(문 y 36~38)과 아래 벽
      rect(37, 34, 37, 35),
      rect(37, 39, 37, 44),
      rect(21, 34, 21, 57),
      // 아래쪽 방 셋(엘리베이터 옆 방, 가운데 방, 오른쪽 방)
      rect(14, 43, 14, 54),
      rect(14, 58, 14, 65),
      rect(0, 65, 13, 65),
      rect(12, 70, 12, 79),
      rect(12, 66, 16, 66),
    ]),
    // 계단실 옆 덕트는 사용자가 빼라고 했다(2026-11-11).
    ...parts('core', [rect(10, 27, 15, 38)]),
  ],
  flights: SHARED_FLIGHTS,
  voids: [],
  // 계단 앞 공간에서 위 계단 끝으로 바로 오르지 못하게 막는다.
  railings: railRow(at(28, 43).x, at(32, 43).x, at(28, 43).y),
  portals: [
    // 엘리베이터 문은 계단실 쪽(평면도 왼쪽) 면, 계단실 문 옆 짧은 벽 바로 옆이다(사용자 수정 2026-11-11).
    { ...at(7, 26), to: 'elevator', landing: at(7, 24) },
    { ...STAIR_TOP, to: 'tower8', label: '8층 (계단)', landing: at(24, 41) },
  ],
};

/** 8층 바깥 계단 문: 뒤쪽 오른쪽 벽(평면도 오른쪽 변 가운데쯤). 사용자가 실제 화면에 표시한 자리다(2026-11-11). */
const ROOF_EXIT: Doorway = { wall: 'right', at: at(29, 79).x, kind: 'outside' };

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
    // 뒤쪽 벽의 문으로 나가면 옥상으로 오르는 바깥 계단이다.
    wallPortal(TOP_FLOORS, ROOF_EXIT, 'stairs'),
  ],
};

/** 도박장 바닥. 앞-오른쪽 변 가운데로 시작마을에 나간다. */
export const CASINO_HALL: Area = [13, 13, 30, 30];
/** 달팽이 경주로: 왼쪽 벽을 따라 놓인 낮은 경주로. 지나갈 수 없고, 뒤쪽(y가 작은 쪽) 끝이 결승선이다. */
export const SNAIL_TRACK: Area = [13, 17, 14, 27];
/** 오른쪽 벽에 건 게임판의 가운데 칸(x). 판 앞 두 칸에 포탈이 있다. */
export const LADDER_BOARD_X = 18;
export const ODDEVEN_BOARD_X = 25;
/** 도박장 간판을 다는 벽 위치와 높이 (아트 픽셀) */
export const CASINO_SIGN = { x: 21.5, y: CASINO_HALL[1], lift: 70 };

export const CASINO_FURNITURE: Furniture[] = [
  { sprite: 'plant', x: 13, y: 13 },
  { sprite: 'plant', x: 30, y: 13 },
  { sprite: 'plant', x: 13, y: 30 },
  { sprite: 'cafe-table', x: 22, y: 24 },
  { sprite: 'cafe-table', x: 25, y: 27 },
];

/**
 * 증권거래소 안(2026-11-12 사용자 요청 "도박장처럼 증권거래소 안에 들어가서 거래"). 바닥은 도박장과 같은 18×18칸이다.
 * 마을 건물의 정문이 왼쪽 면이라 앞-왼쪽 변 가운데로 시작마을에 나간다.
 */
export const EXCHANGE_HALL: Area = [13, 13, 30, 30];
/**
 * 오른쪽 벽에 건 종목 시세판의 가운데 칸(x). 판 앞 두 칸이 그 종목 창구 포탈이고, 타면 그 종목이 고른 채로 거래 창이 열린다.
 * 시세판의 숫자는 그림이 아니라 화면 위 글씨라서 가격이 바뀌면 바로 바뀐다. 종목 id는 SQL stocks 표와 같다.
 */
export const EXCHANGE_BOOTHS: { stock: string; name: string; x: number; color: number }[] = [
  { stock: 'samsung', name: '삼성전자', x: 16, color: 0x1428a0 },
  { stock: 'hynix', name: 'SK하이닉스', x: 20, color: 0xe8102a },
  { stock: 'hanwha', name: '한화', x: 24, color: 0xee6a10 },
  { stock: 'itspace', name: '아이티공간', x: 28, color: 0x1f5cff },
];
/** 시세판 글씨를 띄우는 높이 (아트 픽셀, 바닥에서) */
export const TICKER_LIFT = 32;
/** 홀 가운데 황소 동상. 나가는 문에서 들어오면 바로 보인다. */
export const BULL = { sprite: 'bull' as const, x: 21, y: 21, w: 2, d: 2 };
/** 거래소 간판을 다는 벽 위치와 높이 (아트 픽셀) */
export const EXCHANGE_HALL_SIGN = { x: 22, y: EXCHANGE_HALL[1], lift: 70 };
const EXCHANGE_EXIT = { x: 22, y: EXCHANGE_HALL[3] };

export const EXCHANGE_FURNITURE: Furniture[] = [
  { sprite: 'plant', x: 13, y: 13 },
  { sprite: 'plant', x: 13, y: 30 },
  { sprite: 'plant', x: 30, y: 30 },
  { sprite: 'cafe-table', x: 16, y: 25 },
  { sprite: 'cafe-table', x: 27, y: 25 },
];

/**
 * 어디와도 이어지지 않은 작은 다다미방(2026-11-13 사용자 요청 "7층과 격리된 공간"). 들어오는 길은 src/game/hush.ts의 암호문에만 있다.
 * 나가는 포탈은 7층으로 가고, 7층에는 이 방으로 오는 포탈이 없어 엘리베이터 앞에 선다.
 */
export const ANNEX: Area = [20, 20, 26, 26];
/** 방석은 바닥 그림이라 밟고 앉을 수 있다. 스탠드와 밥상은 칸을 막는다. */
export const ANNEX_PROPS = {
  lamp: { x: 20, y: 20 },
  table: { x: 25, y: 22 },
  cushion: { x: 23, y: 22 },
  plant: { x: 26, y: 20 },
};
const ANNEX_EXIT = { x: 23, y: ANNEX[3] };

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
    doorways: [ROOF_EXIT],
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
  casino: {
    ...plain,
    number: null,
    style: 'casino',
    area: CASINO_HALL,
    doorways: [],
    portals: [
      { x: CASINO_HALL[2], y: 22, to: 'plains', label: '시작마을', landing: { x: CASINO_HALL[2] - 2, y: 22 } },
      { x: LADDER_BOARD_X, y: CASINO_HALL[1] + 2, to: 'ladder', landing: { x: LADDER_BOARD_X, y: CASINO_HALL[1] + 4 } },
      { x: ODDEVEN_BOARD_X, y: CASINO_HALL[1] + 2, to: 'oddeven', landing: { x: ODDEVEN_BOARD_X, y: CASINO_HALL[1] + 4 } },
      { x: SNAIL_TRACK[2] + 2, y: 22, to: 'snail', landing: { x: SNAIL_TRACK[2] + 4, y: 22 } },
    ],
  },
  exchange: {
    ...plain,
    number: null,
    style: 'exchange',
    area: EXCHANGE_HALL,
    doorways: [],
    portals: [
      { ...EXCHANGE_EXIT, to: 'plains', label: '시작마을', landing: { x: EXCHANGE_EXIT.x, y: EXCHANGE_EXIT.y - 2 } },
      ...EXCHANGE_BOOTHS.map(
        ({ stock, name, x }): Portal => ({ x, y: EXCHANGE_HALL[1] + 2, to: 'trade', stock, label: name, landing: { x, y: EXCHANGE_HALL[1] + 4 } }),
      ),
    ],
  },
  annex: {
    ...plain,
    number: null,
    style: 'annex',
    area: ANNEX,
    doorways: [],
    portals: [{ ...ANNEX_EXIT, to: 'tower7', label: '7층', landing: { x: ANNEX_EXIT.x, y: ANNEX_EXIT.y - 2 } }],
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
