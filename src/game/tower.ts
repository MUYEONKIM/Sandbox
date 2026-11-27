import type { SpriteName } from '../art/sprites';
import type { Area, MapId, Portal } from './maps';
import type { Tile } from './world';

/**
 * 아이티공간 건물 안. 9층과 옥상이 있지만 들어갈 수 있는 곳은 1, 4, 7, 8층과 옥상뿐이다.
 * 엘리베이터는 7층까지 가고, 8층은 7층 사무실 안 계단으로, 옥상은 8층 바깥 계단으로 올라간다.
 * 시작마을 주점을 고친 도박장(casino)과 증권거래소 안(exchange)도 같은 방식으로 그리는 건물 안이라 여기에 함께 둔다.
 */
export type TowerId =
  | 'tower1'
  | 'tower4'
  | 'tower7'
  | 'tower8'
  | 'stairs'
  | 'rooftop'
  | 'elevator'
  | 'casino'
  | 'exchange'
  | 'annex'
  | 'hideout'
  | 'balcony'
  | 'balcony4'
  | 'mart'
  | 'smithy'
  | 'labor'
  | 'farmcoop';

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
export const STAIRS: Area = [6, 20, 39, 22];
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
  style: 'lobby' | 'office' | 'roof' | 'stairs' | 'cabin' | 'casino' | 'exchange' | 'plain' | 'mart' | 'smithy' | 'labor' | 'farmcoop' | 'hideout';
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
 * 4층 오른쪽 아래 바닥 끝 바깥에 숨은 방. 바닥 끝 칸 trigger를 밟으면 밟은 사람 화면에서만 드러나고,
 * 벗어나면 다시 숨는다. 처음 자리는 사용자가 정했고(2026-11-08), 자리가 알려져서 입구를 바닥 끝을 따라 더 아래로
 * 옮겼다(2026-11-15 사용자 요청). 방은 바닥에서 한 칸 떨어져 있고 입구 앞 통로 한 칸(passage)으로만 이어진다
 * (같은 날 "그 좌표로만 진입하도록 한 칸 띄워 줘"). 가구 없이 비워 두어 블록과 가구를 놓아 꾸민다(같은 날
 * "8*12로 바꾸고 사물을 뺀다", "자유롭게 꾸밀 수 있게"). 옮긴 거리는 에이전트가 정했다.
 * 크기는 10×14칸이다(2026-11-27 사용자 "8*12 가 아닌 10*14 로"). 예전 8×12칸(x 44~51, y 16~27)을 모두 품게
 * 통로 반대쪽(x)으로 두 칸, 앞뒤(y)로 한 칸씩 늘려서 이미 놓인 블록이 그 자리에 남는다(늘린 쪽은 에이전트가 정함).
 * 같은 날 사용자 "4층 비밀의 방도 벽꾸미기나 이런것들이 안되니깐 해당 비밀의방 입구를 밟으면 비밀의 방으로 이동하는걸로 한다":
 * 4층 안의 구역에서 따로 된 방(맵 'hideout')으로 옮겼다. 4층 바닥 끝 trigger 칸은 그림 없는 숨은 입구(Portal.secret)라 밟으면 방으로 가고,
 * 방 안 아래쪽 꼭짓점 칸의 포탈로 나오면 trigger 바로 안쪽(back)에 선다. 방 칸 좌표(area)는 4층 때와 같아서
 * 놓인 블록·상자 안 물건·떨어진 것은 맵 이름만 바꿔 옮긴다(supabase/migrations/20261127100000_hideout_room.sql).
 */
export const HIDEOUT = {
  trigger: { x: 42, y: 21 },
  back: { x: 41, y: 21 },
  area: [44, 15, 53, 28] as Area,
  title: '진우씨가 유일하게 맘 편히 쉬었던 안식처',
};
/** 숨은 방에서 4층으로 나가는 포탈: 방 아래쪽 꼭짓점 칸(7층 이름 없는 방과 같게, 제가 정한 것). 들어오면 대각선 두 칸 안쪽에 선다. */
const HIDEOUT_EXIT = { x: HIDEOUT.area[2], y: HIDEOUT.area[3] };

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
  // 2026-11-16 룰렛 탁자 자리를 비우려고 (22, 24)에서 옮김(디자인 세션 다시 꾸미기)
  { sprite: 'cafe-table', x: 18, y: 27 },
  { sprite: 'cafe-table', x: 25, y: 27 },
];

/**
 * 증권거래소 안(2026-11-12 사용자 요청 "도박장처럼 증권거래소 안에 들어가서 거래"). 바닥은 도박장과 같은 18×18칸이다.
 * 마을 건물의 정문이 왼쪽 면이라 앞-왼쪽 변 가운데로 시작마을에 나간다.
 */
export const EXCHANGE_HALL: Area = [13, 13, 30, 30];
/**
 * 오른쪽 벽에 건 큰 시세 전광판 하나(2026-11-13 사용자 요청 "전광판이 하나 띄워져 있고, 들어가면 모달창이 뜨면서 거래").
 * 전광판은 종목마다 한 칸씩 나뉘고 x는 그 칸의 가운데다. 숫자는 그림이 아니라 화면 위 글씨라서 가격이 바뀌면 바로 바뀐다.
 * 종목 id는 SQL stocks 표와 같다.
 */
export const EXCHANGE_TICKERS: { stock: string; name: string; x: number; color: number }[] = [
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
 * 상점 안(2026-11-15 사용자 요청 "상점도 건물 내부로 들어가서 팔거나 살 수 있도록"). 바닥 14×14칸(에이전트가 정함).
 * 바닥과 벽은 src/art/interior.ts의 'mart' 스타일, 소품은 디자인 세션이 그린 public/sprites/mart-*.png다.
 * 소품 자리는 디자인 세션이 그림으로 맞춰 본 배치를 그대로 썼다. 오른쪽 벽 가운데는 벽의 MART 판이 보이게 비운다.
 */
export const MART_HALL: Area = [15, 15, 28, 28];
const mart = (x: number, y: number) => ({ x: MART_HALL[0] + x, y: MART_HALL[1] + y });
/** 계산대(땅 3×1, 앞면 +y). 가운데 앞 칸이 상점 창을 여는 창구다. */
export const MART_COUNTER = { sprite: 'mart-counter' as const, ...mart(6, 3), w: 3, d: 1 };
const MART_TILL = { x: MART_COUNTER.x + 1, y: MART_COUNTER.y + 1 };
/** 나가는 문: 앞-오른쪽 변(x 끝) 가운데. 밟으면 시작마을 상점 문 앞에 선다. */
const MART_EXIT = { x: MART_HALL[2], y: mart(0, 7).y };
/** 진열대와 냉장고(장식, 지나갈 수 없음). -x가 없는 것은 오른쪽 벽(y 처음)에, -x는 왼쪽 벽(x 처음)에 붙는다. */
export const MART_PROPS = [
  MART_COUNTER,
  { sprite: 'mart-shelf-fruit' as const, ...mart(1, 0), w: 2, d: 1 },
  { sprite: 'mart-shelf-goods' as const, ...mart(3, 0), w: 2, d: 1 },
  { sprite: 'mart-shelf-drinks' as const, ...mart(9, 0), w: 2, d: 1 },
  { sprite: 'mart-fridge' as const, ...mart(11, 0), w: 1, d: 1 },
  { sprite: 'mart-fridge' as const, ...mart(12, 0), w: 1, d: 1 },
  { sprite: 'mart-shelf-fruit-x' as const, ...mart(0, 3), w: 1, d: 2 },
  { sprite: 'mart-shelf-drinks-x' as const, ...mart(0, 6), w: 1, d: 2 },
  { sprite: 'mart-shelf-goods-x' as const, ...mart(0, 9), w: 1, d: 2 },
  { sprite: 'mart-fridge-x' as const, ...mart(0, 12), w: 1, d: 1 },
  // 2026-11-16 다시 꾸미기(디자인 세션, interior-restyle.md). 냉동고·냉장고 둘레에는 interior.ts가 바닥에 찬 불빛을 그린다.
  { sprite: 'mart-pallet' as const, x: 15, y: 15, w: 1, d: 1 },
  { sprite: 'mart-freezer-x' as const, x: 15, y: 16, w: 1, d: 2 },
  { sprite: 'mart-pallet' as const, x: 15, y: 20, w: 1, d: 1 },
  { sprite: 'mart-freezer' as const, x: 20, y: 15, w: 2, d: 1 },
  { sprite: 'mart-freezer' as const, x: 22, y: 15, w: 2, d: 1 },
  { sprite: 'mart-coffee' as const, x: 28, y: 15, w: 1, d: 1 },
  { sprite: 'mart-fridge-x' as const, x: 15, y: 26, w: 1, d: 1 },
  { sprite: 'mart-baskets' as const, x: 28, y: 20, w: 1, d: 1 },
  { sprite: 'mart-baskets' as const, x: 28, y: 24, w: 1, d: 1 },
];

/**
 * 대장간 안(2026-11-16, 사용자 "대장간도 안으로"). 상점 안과 같은 14×14칸이고 바닥과 벽은 src/art/interior.ts의 'smithy' 스타일,
 * 소품은 디자인 세션이 그린 public/sprites/smithy-*.png다. 소품 자리는 디자인 세션이 그림으로 맞춰 본 배치(interior-art.md)를 그대로 썼다.
 * 창구는 둘이다: 왼쪽 벽 무기 걸이 앞(사기 탭)과 모루 앞(강화·팔기 탭). 장신구 진열장 앞 창구는 장신구 배포(D)에서 더한다.
 */
export const SMITHY_HALL: Area = [15, 15, 28, 28];
const smithy = (x: number, y: number) => ({ x: SMITHY_HALL[0] + x, y: SMITHY_HALL[1] + y });
/** 모루(땅 1×1, 앞면 +y). 앞 칸이 강화·팔기 창구다. */
const SMITHY_ANVIL = { sprite: 'smithy-anvil' as const, ...smithy(2, 3), w: 1, d: 1 };
/** 왼쪽 벽 무기 걸이(땅 1×2, 앞면 +x). 첫 걸이의 아래 칸 앞이 사기 창구다. */
const SMITHY_RACK = { sprite: 'smithy-weapon-rack-x' as const, ...smithy(0, 5), w: 1, d: 2 };
const SMITHY_COUNTERS = {
  anvil: { x: SMITHY_ANVIL.x, y: SMITHY_ANVIL.y + 1 },
  rack: { x: SMITHY_RACK.x + 1, y: SMITHY_RACK.y + 1 },
};
/** 나가는 문: 상점 안과 같은 앞-오른쪽 변(x 끝) 가운데. 밟으면 시작마을 대장간 문 앞에 선다. */
const SMITHY_EXIT = { x: SMITHY_HALL[2], y: smithy(0, 7).y };
/** 화로, 숯, 모루, 물통, 무기 걸이, 방어구 받침대, 장신구 진열장(지나갈 수 없음). -x가 붙은 것은 왼쪽 벽(x 처음)에 붙는다. */
export const SMITHY_PROPS = [
  { sprite: 'smithy-forge' as const, ...smithy(1, 0), w: 2, d: 2 },
  { sprite: 'smithy-coal' as const, ...smithy(3, 0), w: 1, d: 1 },
  SMITHY_ANVIL,
  { sprite: 'smithy-barrel' as const, ...smithy(4, 2), w: 1, d: 1 },
  SMITHY_RACK,
  { sprite: 'smithy-weapon-rack-x' as const, ...smithy(0, 8), w: 1, d: 2 },
  { sprite: 'smithy-forge-x' as const, ...smithy(0, 11), w: 2, d: 2 },
  { sprite: 'smithy-armor-stand' as const, ...smithy(10, 0), w: 1, d: 1 },
  { sprite: 'smithy-armor-stand' as const, ...smithy(11, 0), w: 1, d: 1 },
  { sprite: 'smithy-case' as const, ...smithy(12, 1), w: 2, d: 1 },
];

/**
 * 노동청 안(labor)과 농협 안(farmcoop)(2026-11-16 사용자 "둘 다 만들어", 디자인 세션 labor-coop-rooms.md). 상점 안과 같은 14×14칸이고
 * 창구 하나가 지금의 노동청 창, 농협 창을 연다. 맵 id는 창을 여는 포탈 이름(office, coop)과 헷갈리지 않게 따로 지었다(에이전트가 정함).
 */
export const SHOP_ROOM: Area = [15, 15, 28, 28];
const SHOP_ROOM_EXIT = { x: 28, y: 22 };
const SHOP_ROOM_COUNTER = { x: 22, y: 18 };
function shopRoomPortals(to: 'office' | 'coop', label: string): Portal[] {
  return [
    { ...SHOP_ROOM_EXIT, to: 'plains', label: '시작마을', landing: { x: 26, y: 22 } },
    { ...SHOP_ROOM_COUNTER, to, label, landing: { x: 22, y: 20 } },
  ];
}

type Prop = { sprite: SpriteName; x: number; y: number; w: number; d: number };
const props = (sprite: SpriteName, w: number, d: number, ...cells: [number, number][]): Prop[] => cells.map(([x, y]) => ({ sprite, x, y, w, d }));

/**
 * 건물 안 소품(2026-11-16 사용자 "대장간 내부의 분위기가 매우 마음에 들었다. 해당 느낌으로 다른 건물들도", 디자인 세션 interior-restyle.md).
 * 건물처럼 바닥 아래 꼭짓점에 맞춰 놓고 지나갈 수 없다. 상점(MART_PROPS)과 대장간(SMITHY_PROPS)은 따로 있다. 7, 8층에는 두지 않았다.
 */
export const ROOM_PROPS: Partial<Record<TowerId, Prop[]>> = {
  casino: [
    ...props('casino-slot-x', 1, 1, [13, 14], [13, 15], [13, 16], [13, 28], [13, 29]),
    ...props('casino-slot', 1, 1, [14, 13]),
    ...props('casino-cashier', 2, 1, [28, 13]),
    ...props('casino-roulette', 2, 2, [21, 25]),
  ],
  exchange: [...props('exchange-desk-x', 1, 2, [13, 15], [13, 18], [13, 21], [13, 24]), ...props('exchange-kiosk', 1, 1, [17, 17], [27, 17])],
  tower1: [...props('lobby-vending', 1, 1, [25, 13], [26, 13]), ...props('office-cooler', 1, 1, [32, 13])],
  tower4: [
    ...props('office-cooler', 1, 1, [26, 3]),
    ...props('lobby-vending', 1, 1, [27, 3]),
    ...props('office-printer', 1, 1, [36, 3]),
    ...props('office-server', 1, 1, [38, 3], [39, 3], [40, 3]),
    ...props('office-bookshelf-x', 1, 2, [3, 10], [3, 12]),
    ...props('office-printer-x', 1, 1, [3, 15]),
  ],
  rooftop: [...props('roof-hvac', 2, 2, [6, 5], [9, 5]), ...props('roof-solar', 2, 1, [16, 3], [19, 3], [22, 3], [25, 3])],
  labor: [
    ...props('labor-counter', 3, 1, [21, 17]),
    ...props('labor-lockers', 2, 1, [15, 15], [27, 15]),
    ...props('labor-toolrack', 2, 1, [25, 15]),
    ...props('labor-bench-x', 1, 2, [15, 19], [15, 22], [15, 25]),
    ...props('labor-ticket', 1, 1, [27, 20]),
    ...props('office-cooler-x', 1, 1, [15, 17]),
  ],
  farmcoop: [
    ...props('coop-counter', 3, 1, [21, 17]),
    ...props('coop-seeds', 2, 1, [15, 15]),
    ...props('coop-seedlings', 2, 1, [17, 15]),
    ...props('coop-sacks', 1, 1, [25, 15], [27, 15], [15, 20], [15, 27], [28, 19]),
    ...props('coop-crates', 1, 1, [26, 15], [28, 15], [15, 21], [28, 25]),
    ...props('coop-seeds-x', 1, 2, [15, 17]),
    ...props('coop-seedlings-x', 1, 2, [15, 23]),
    ...props('coop-scale-x', 1, 1, [15, 26]),
  ],
};

/** 노동청 안의 화분(나무처럼 칸 가운데에 섬) */
export const LABOR_FURNITURE: Furniture[] = [{ sprite: 'plant', x: 15, y: 28 }];

/**
 * 어디와도 이어지지 않은 빈방. 들어오는 길은 src/game/hush.ts의 암호문에만 있다.
 * 나가는 포탈은 7층으로 가고, 7층에는 이 방으로 오는 포탈이 없어 엘리베이터 앞에 선다.
 * 소품도 사이 벽도 없이 한 가지 밝은 돌 바닥과 뒤쪽 두 벽만 있고, 플레이어가 놓는 벽·가구·블록으로 꾸민다.
 * 2026-11-24 16×16칸 빈방 → 2026-11-25 24×20칸으로 넓힘(뒤쪽 두 벽 자리는 그대로) → 같은 날 사용자가 사이 벽과 현관 바닥을 치우게 함
 * ("벽도 다 치워라, 벽도 내가 알아서 다 세울 수 있지 않나", 고른 것 "사이 벽만 치움", "넓이는 두고 바닥은 한 가지로").
 */
export const ANNEX: Area = [16, 16, 39, 35];
/**
 * 7층으로 나가는 포탈: 방 마름모의 아래쪽 꼭짓점 칸(화면에서 가장 아래, 2026-11-27 사용자 "비밀의 방 들어오면 입구 위치를 아래쪽 꼭지점으로").
 * 맨 앞 칸이라 무엇에도 가려지지 않는다. 들어오면 그 칸에서 방 안쪽으로 대각선 두 칸(ANNEX_ENTRY)에 선다(제가 정한 것). 예전 자리는 (36, 35)였다.
 */
const ANNEX_EXIT = { x: ANNEX[2], y: ANNEX[3] };
const ANNEX_ENTRY = { x: ANNEX_EXIT.x - 2, y: ANNEX_EXIT.y - 2 };
/**
 * 빈방 뒤쪽 오른쪽 벽의 발코니 문(2026-11-27 사용자 "문 열고 나가면 발코니", 자리와 그림은 디자인 세션 8): 벽을 따라 칸 x 27·28에 걸친
 * 유리 두 짝 문이다. 문 그림은 벽 모서리에서 u px부터 30px 폭, 높이 top px이다(디자인 balcony.json).
 * 같은 날 사용자 "비밀의 방 발코니 가는 포탈은 놓지 않는다 … 문으로 가면 문열리는 애니메이션과 함께 자연스럽게 발코니로 나가진다":
 * 포탈 원을 없애고 걸어서 지나가는 문(Portal.door)으로 바꿨다. 문 앞 두 칸(y 16)에서 문 쪽으로 걸으면 열리며 넘어간다.
 */
export const ANNEX_DOOR = { x: [27, 28] as const, u: 177, top: 50 };
/**
 * 발코니(같은 날, 6판): x 12칸 × y 5칸. 뒤쪽 오른쪽 변이 건물 외벽(가운데 칸 x 5·6 앞에 문), 나머지 세 변은 유리 난간이다.
 * 바닥·외벽·뒤 왼쪽 난간·아래층 외벽은 그림 한 장(balcony-base)이고, 앞 두 변 난간은 칸 조각으로 캐릭터 앞에 그린다.
 * 맵 밖에는 밤 도시 야경을 깐다(src/game/cityView.ts). 블록과 가구를 놓을 수 있고, 지붕이 없어 벽지·벽걸이·천장 것은 못 건다.
 */
export const BALCONY: Area = [16, 16, 27, 20];
const BALCONY_DOOR = [BALCONY[0] + 5, BALCONY[0] + 6] as const;
/**
 * 발코니 그림과 카메라 값(디자인 세션 8 balcony.json 6판, 아트 px). 바탕 그림 왼쪽 위 = 바닥 뒤 모서리 − (left, top).
 * 건물이 위·아래로 이어져 그림이 길다. 카메라는 이 맵에서만 캐릭터 발이 화면 (가로 60%, 세로 62%)에 오게 따라가고,
 * 카메라 범위의 오른쪽 끝을 바닥 뒤 모서리 x + right(건물 오른쪽 끝)에 묶어 넓은 화면에서 건물 오른쪽에 하늘이 보이지 않게 한다.
 */
export const BALCONY_VIEW = { left: 80, top: 461, playerAt: [0.6, 0.62] as const, right: 226 };
/** 발코니 건물 외벽에 그려진 벽등 둘(바탕 그림, 외벽 칸 3·8, 바닥에서 34~50px): 그 칸에 거는 벽걸이는 등 위로 올린다(roomArt). */
export const BALCONY_LAMPS = { x: [BALCONY[0] + 3, BALCONY[0] + 8] as const, top: 50 };
/** 발코니 쪽 문 여닫힘 그림(30 × 65 한 장)의 왼쪽 위 = 바닥 뒤 모서리 + (x, y)(디자인 세션 8 balcony-door.json) */
export const BALCONY_DOOR_ART = { x: 81, y: -10 };
/**
 * 4층 발코니(2026-11-27 사용자 "4층에서 발코니처럼 나갈 수 있는 장소를 만든다. 7층 비밀의 방의 발코니와 같은 구조와 느낌으로, 대신 배경은 방금 만든 옥상배경느낌으로",
 * 그림과 값은 디자인 세션 9 balcony4.json). 비밀이 아니다. 7층 발코니와 칸·그림 자리·카메라·문 여닫힘이 모두 같고(BALCONY_*을 그대로 씀),
 * 그림은 시간대마다 따로 그린 한 벌을 읽고(cityViews.ts), 맵 밖은 옥상 하늘·지평선 + 가까운 시가지 판이다.
 * 4층 문은 뒤쪽 오른쪽 벽 칸 x 14·15(화이트보드와 ITS 포스터 사이 빈 벽, 디자인 세션 9가 정함)다. 벽 모서리에서 u px, 높이 top px로 7층 빈방 문과 셈이 같다.
 */
export const BALCONY4: Area = BALCONY;
export const TOWER4_DOOR = { x: [14, 15] as const, u: 177, top: 50 };
/** 발코니 앞 난간 칸: [x, y, 조각]. 그 칸에 설 수 있고 난간은 캐릭터 앞에 그린다. */
export const BALCONY_RAILS: readonly (readonly [number, number, 'x' | 'y' | 'corner'])[] = [
  ...Array.from({ length: BALCONY[2] - BALCONY[0] }, (_, i) => [BALCONY[0] + i, BALCONY[3], 'x'] as const),
  ...Array.from({ length: BALCONY[3] - BALCONY[1] }, (_, i) => [BALCONY[2], BALCONY[1] + i, 'y'] as const),
  [BALCONY[2], BALCONY[3], 'corner'],
];

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
    portals: [
      wallPortal(UPPER, elevator, 'elevator'),
      { ...HIDEOUT.trigger, to: 'hideout', secret: true, landing: HIDEOUT.back },
      // 발코니 문(걸어서 지나감, 2026-11-27): 문 칸이 벽 칸 (x, 2), 문 앞 칸이 (x, 3)이다.
      ...TOWER4_DOOR.x.map((x): Portal => ({ x, y: UPPER[1] - 1, to: 'balcony4', door: true, landing: { x, y: UPPER[1] } })),
    ],
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
      // 전광판 가운데 앞 매매 창구. 밟으면 모든 종목이 있는 거래 창이 열린다.
      { x: EXCHANGE_HALL_SIGN.x, y: EXCHANGE_HALL[1] + 2, to: 'trade', landing: { x: EXCHANGE_HALL_SIGN.x, y: EXCHANGE_HALL[1] + 4 } },
    ],
  },
  mart: {
    ...plain,
    number: null,
    style: 'mart',
    area: MART_HALL,
    doorways: [],
    portals: [
      { ...MART_EXIT, to: 'plains', label: '시작마을', landing: { x: MART_EXIT.x - 2, y: MART_EXIT.y } },
      // 계산대 앞 창구. 밟으면 상점 창(자원 팔기, 도구, 포션, 기타)이 열린다.
      { ...MART_TILL, to: 'shop', label: '계산대', landing: { x: MART_TILL.x, y: MART_TILL.y + 2 } },
    ],
  },
  smithy: {
    ...plain,
    number: null,
    style: 'smithy',
    area: SMITHY_HALL,
    doorways: [],
    portals: [
      { ...SMITHY_EXIT, to: 'plains', label: '시작마을', landing: { x: SMITHY_EXIT.x - 2, y: SMITHY_EXIT.y } },
      // 창구 둘은 같은 대장간 창을 다른 탭으로 연다(src/ui/forge.ts).
      { ...SMITHY_COUNTERS.rack, to: 'forge-shop', label: '무기 사기', landing: { x: SMITHY_COUNTERS.rack.x + 2, y: SMITHY_COUNTERS.rack.y } },
      { ...SMITHY_COUNTERS.anvil, to: 'forge-anvil', label: '강화 · 팔기', landing: { x: SMITHY_COUNTERS.anvil.x, y: SMITHY_COUNTERS.anvil.y + 2 } },
    ],
  },
  labor: { ...plain, number: null, style: 'labor', area: SHOP_ROOM, doorways: [], portals: shopRoomPortals('office', '작업장 고르기') },
  farmcoop: { ...plain, number: null, style: 'farmcoop', area: SHOP_ROOM, doorways: [], portals: shopRoomPortals('coop', '농협 창구') },
  annex: {
    ...plain,
    number: null,
    style: 'plain',
    area: ANNEX,
    doorways: [],
    // 첫 포탈(7층)이 쓰러진 뒤 일어나는 칸이다. 발코니 문(두 칸)은 걸어서 지나가는 문이다.
    portals: [
      { ...ANNEX_EXIT, to: 'tower7', label: '7층', landing: ANNEX_ENTRY },
      ...ANNEX_DOOR.x.map((x): Portal => ({ x, y: ANNEX[1] - 1, to: 'balcony', door: true, landing: { x, y: ANNEX[1] } })),
    ],
  },
  hideout: {
    ...plain,
    number: null,
    style: 'hideout',
    area: HIDEOUT.area,
    doorways: [],
    portals: [{ ...HIDEOUT_EXIT, to: 'tower4', label: '4층', landing: { x: HIDEOUT_EXIT.x - 2, y: HIDEOUT_EXIT.y - 2 } }],
  },
  balcony: {
    ...plain,
    number: null,
    style: 'plain',
    area: BALCONY,
    doorways: [],
    // 방으로 들어가는 문(걸어서 지나감). 첫 칸 앞이 쓰러진 뒤 일어나는 칸이다.
    portals: BALCONY_DOOR.map((x): Portal => ({ x, y: BALCONY[1] - 1, to: 'annex', door: true, landing: { x, y: BALCONY[1] } })),
  },
  balcony4: {
    ...plain,
    number: null,
    style: 'plain',
    area: BALCONY4,
    doorways: [],
    // 4층으로 들어가는 문(걸어서 지나감). 첫 칸 앞이 쓰러진 뒤 일어나는 칸이다.
    portals: BALCONY_DOOR.map((x): Portal => ({ x, y: BALCONY4[1] - 1, to: 'tower4', door: true, landing: { x, y: BALCONY4[1] } })),
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
