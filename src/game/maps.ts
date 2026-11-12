import type { Color } from '../art/pixels';
import { MAP_SIZE } from '../config';
import { GAMES, isGame, type GameId } from './casino';
import { COUNTER_INFO, FLOORS, isTower, PANEL_INFO, type TowerId } from './tower';

const END = MAP_SIZE - 1;

/** 맵의 네 귀퉁이 칸과 맵 안쪽으로 향하는 방향 */
const CORNERS = {
  top: { x: 0, y: 0, inX: 1, inY: 1 },
  right: { x: END, y: 0, inX: -1, inY: 1 },
  bottom: { x: END, y: END, inX: -1, inY: -1 },
  left: { x: 0, y: END, inX: 1, inY: -1 },
} as const;

type Corner = keyof typeof CORNERS;

/** 포탈에서 나와 서는 칸. 다시 포탈을 타지 않고 포탈 그림에도 가리지 않도록 비껴 선다. */
const LANDING_ALONG = 3;
const LANDING_ACROSS = 1;

/** 포탈 주변은 이만큼 비워 둔다. */
export const PORTAL_MARGIN = 2;

/** 직사각형 구역: x0, y0, x1, y1 (끝 칸 포함) */
export type Area = readonly [number, number, number, number];

export const isInside = ([x0, y0, x1, y1]: Area, x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

export type WorkId = 'quarry' | 'logging' | 'gathering' | 'fishing';
export type MapId = 'plains' | 'snow' | 'desert' | 'volcano' | 'forest' | TowerId | WorkId;

/** tiles.png의 타일 번호. 왼쪽 위부터 오른쪽으로 센다. 번호를 여러 번 넣으면 더 자주 나온다. */
const GRASS = [22, 23, 24];
const DARK_GRASS = [40];
const DIRT = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const CRACKED_DIRT = [11, 14, 15, 16];
const SCORCHED_DIRT = [17, 18, 21];
const STONE = [63, 63, 63, 61];
const FARMLAND = [25, 26];
const ICE = [110, 110, 110, 110, 113, 116];

/** 타일 그림에서 윗면이 시작하는 높이. 블록보다 얇은 판은 더 아래에서 시작한다. */
const BLOCK_TOP = 8;
const SLAB_TOP = 12;

export interface MapInfo {
  name: string;
  /** 바닥에 섞어 까는 타일 번호 */
  floor: number[];
  /** 타일 그림에서 윗면이 시작하는 높이 */
  floorTop: number;
  /** 미니맵에 칠하는 바닥색 */
  color: Color;
  /** 이 맵으로 가는 포탈의 색 */
  accent: Color;
  /** 귀퉁이별로 이어지는 맵 */
  links: Partial<Record<Corner, MapId>>;
  /** 작업장이면 true. 이 맵에서 자원을 캘 수 있다. */
  work?: boolean;
  /** true면 공격이 막힌다. 서버도 같은 맵을 막으므로 바꾸면 SQL도 함께 바꾼다. 지금은 시작마을뿐이다(2026-11-11 사용자 요청). */
  safe?: boolean;
}

/** 맵 목록. 평원을 중심으로 귀퉁이가 각 맵으로 이어지고, 작업장은 노동청에서 간다. 블록은 어느 맵이든 바닥 전체에 놓는다(2026-11-11 사용자 요청). */
export const MAPS: Record<MapId, MapInfo> = {
  plains: {
    name: '평원',
    floor: GRASS,
    floorTop: BLOCK_TOP,
    color: 0xa5d04f,
    accent: 0x9df08f,
    links: { right: 'desert', left: 'forest' },
    safe: true,
  },
  snow: {
    name: '설원',
    floor: ICE,
    floorTop: SLAB_TOP,
    color: 0x8fd0ea,
    accent: 0x7fd3ff,
    links: { bottom: 'forest' },
  },
  desert: {
    name: '사막',
    floor: DIRT,
    floorTop: BLOCK_TOP,
    color: 0xa5714f,
    accent: 0xffc34d,
    links: { left: 'plains', right: 'volcano' },
  },
  volcano: {
    name: '화산',
    floor: SCORCHED_DIRT,
    floorTop: BLOCK_TOP,
    color: 0x6e3a24,
    accent: 0xff6a3d,
    links: { left: 'desert' },
  },
  // 아이티공간 건물 안
  tower1: {
    name: '아이티공간 1층',
    floor: [],
    floorTop: BLOCK_TOP,
    color: 0xd9d4ca,
    accent: 0xff7ad9,
    links: {},
  },
  tower4: {
    name: '아이티공간 4층',
    floor: [],
    floorTop: BLOCK_TOP,
    color: 0x6b7280,
    accent: 0xbfe6ff,
    links: {},
  },
  tower7: {
    name: '아이티공간 7층',
    floor: [],
    floorTop: BLOCK_TOP,
    color: 0x6b7280,
    accent: 0xbfe6ff,
    links: {},
  },
  tower8: {
    name: '아이티공간 8층',
    floor: [],
    floorTop: BLOCK_TOP,
    color: 0x6b7280,
    accent: 0x7fe3a0,
    links: {},
  },
  // 엘리베이터 안. 층 버튼을 눌러 1, 4, 7층으로 간다.
  elevator: {
    name: '엘리베이터',
    floor: [],
    floorTop: BLOCK_TOP,
    color: 0x8a929c,
    accent: 0xbfe6ff,
    links: {},
  },
  // 8층과 옥상 사이의 바깥 계단. 블록은 놓을 수 없다.
  stairs: {
    name: '바깥 계단',
    floor: [],
    floorTop: BLOCK_TOP,
    color: 0x8a9098,
    accent: 0x7fe3a0,
    links: {},
  },
  // 시작마을 주점을 고친 도박장
  casino: {
    name: '인생한방 도박장',
    floor: [],
    floorTop: BLOCK_TOP,
    color: 0x7a1824,
    accent: 0xffc34d,
    links: {},
  },
  // 증권거래소 안
  exchange: {
    name: '증권거래소',
    floor: [],
    floorTop: BLOCK_TOP,
    color: 0x2b3342,
    accent: 0xff6a5c,
    links: {},
  },
  rooftop: {
    name: '아이티공간 옥상',
    floor: [],
    floorTop: BLOCK_TOP,
    color: 0x9a9a96,
    accent: 0x8fd0ff,
    links: {},
  },
  forest: {
    name: '숲',
    floor: DARK_GRASS,
    floorTop: BLOCK_TOP,
    color: 0x3f8a35,
    accent: 0x4fdc86,
    links: { right: 'plains', top: 'snow' },
  },
  quarry: {
    name: '채석장',
    floor: STONE,
    floorTop: BLOCK_TOP,
    color: 0x84948c,
    accent: 0xc9c4bc,
    links: { bottom: 'plains' },
    work: true,
  },
  logging: {
    name: '벌목장',
    floor: CRACKED_DIRT,
    floorTop: BLOCK_TOP,
    color: 0xb08468,
    accent: 0x4fdc86,
    links: { bottom: 'plains' },
    work: true,
  },
  gathering: {
    name: '채집장',
    floor: FARMLAND,
    floorTop: BLOCK_TOP,
    color: 0x8a5a3c,
    accent: 0xf2a65a,
    links: { bottom: 'plains' },
    work: true,
  },
  fishing: {
    name: '낚시터',
    floor: GRASS,
    floorTop: BLOCK_TOP,
    color: 0xa5d04f,
    accent: 0x5fc8ff,
    links: { bottom: 'plains' },
    work: true,
  },
};

export const DEFAULT_MAP: MapId = 'plains';

/** 평원 위쪽 귀퉁이의 노동청 건물. 문 앞 칸이 포탈이다. */
export const OFFICE = {
  sprite: 'inn' as const,
  x: 0,
  y: 0,
  w: 4,
  d: 4,
  door: { x: 4, y: 1 },
  landing: { x: 6, y: 2 },
  name: '노동청',
  accent: 0xffd84d,
};

/** 평원 한가운데의 아이티공간. 정문 앞 칸이 포탈이고, 타면 건물 1층으로 들어간다. */
export const CASTLE = {
  sprite: 'castle' as const,
  x: 18,
  y: 18,
  w: 11,
  d: 11,
  door: { x: 29, y: 23 },
  landing: { x: 31, y: 24 },
  name: '아이티공간',
  accent: 0xff7ad9,
};

/** 아이티공간 오른쪽 위의 상점. 문 앞 칸이 포탈이고, 타면 상점 창이 열린다. */
export const SHOP = {
  sprite: 'villa' as const,
  x: 18,
  y: 4,
  w: 6,
  d: 8,
  door: { x: 18, y: 12 },
  landing: { x: 19, y: 14 },
  name: '상점',
  accent: 0xb58cff,
};

/** 시작마을 오른쪽 귀퉁이 주점(tavern)의 오른쪽 벽 문. 문 앞 칸이 포탈이고, 타면 도박장으로 들어간다. 맵 끝이라 벽을 따라 비껴 선다. */
export const CASINO_DOOR = { door: { x: 45, y: 14 }, landing: { x: 45, y: 16 } };

/**
 * 광장 오른쪽 잔디밭의 명예의 전당 간판. 앞 칸이 포탈이고, 타면 레벨 순위 창이 열린다.
 * 2026-11-12에 광장 안(32, 21)에서 옮겼다(사용자 요청 "중앙 메인 건물과 너무 겹침"). 아래 게시판과 나란히 선다.
 */
export const FAME = {
  sprite: 'board' as const,
  x: 37,
  y: 20,
  door: { x: 38, y: 21 },
  landing: { x: 38, y: 22 },
  name: '명예의 전당',
  accent: 0xfff1b8,
};

/**
 * 누구나 글을 쓰는 게시판(2026-11-12 사용자 요청 "마을 중앙에 누구나 글을 쓰는 게시판", 같은 날 이름을 "게시판"으로).
 * 처음엔 광장 안(32, 26)이었는데 아이티공간과 겹쳐 보여 광장 오른쪽 잔디밭, 명예의 전당 아래로 옮겼다.
 * 앞 칸이 포탈이고, 타면 게시판 창이 열린다.
 */
export const BOARD = {
  sprite: 'board' as const,
  x: 37,
  y: 25,
  door: { x: 38, y: 26 },
  landing: { x: 38, y: 27 },
  name: '게시판',
  accent: 0x9fe0ff,
};

/**
 * 증권거래소(2026-11-12 사용자 요청 "증권거래소 건물에서 주식을 사고판다"). 게시판 아래쪽 잔디밭에 선다.
 * 기둥이 선 정면(왼쪽 아래 면) 가운데 문 앞 칸이 포탈이고, 타면 거래소 안(exchange 맵)으로 들어간다.
 * 거래는 안의 종목 창구에서 한다(2026-11-12 사용자 요청 "도박장처럼 안에 들어가서 거래").
 */
export const EXCHANGE = {
  sprite: 'exchange' as const,
  x: 38,
  y: 33,
  w: 6,
  d: 6,
  door: { x: 40, y: 39 },
  landing: { x: 41, y: 41 },
  name: '증권거래소',
};

/** 거래소 안 종목 창구 포탈. 이름은 포탈마다 종목 이름(label)을 쓴다. */
const TRADE_INFO = { name: '매매 창구', accent: 0xffd84d };

export function isMapId(value: unknown): value is MapId {
  return typeof value === 'string' && Object.hasOwn(MAPS, value);
}

export interface Portal {
  x: number;
  y: number;
  /** 'office', 'shop', 'counter', 'fame', 'board', 'trade', 'panel'과 도박장 게임은 맵을 옮기지 않고 창을 연다. */
  to: MapId | 'office' | 'shop' | 'counter' | 'fame' | 'board' | 'trade' | 'panel' | GameId;
  /** 'trade' 포탈(거래소 종목 창구)이 고르는 종목 id */
  stock?: string;
  /** 포탈 위에 띄울 이름. 없으면 가는 곳의 이름이다. */
  label?: string;
  /** 이 포탈 근처에서 플레이어가 서는 칸 */
  landing: { x: number; y: number };
}

function portalAt(corner: Corner, to: MapId): Portal {
  const { x, y, inX, inY } = CORNERS[corner];
  return { x, y, to, landing: { x: x + inX * LANDING_ALONG, y: y + inY * LANDING_ACROSS } };
}

export function portalsOf(id: MapId): Portal[] {
  if (isTower(id)) return FLOORS[id].portals;
  const portals = (Object.entries(MAPS[id].links) as [Corner, MapId][]).map(([corner, to]) => portalAt(corner, to));
  if (id === 'plains') {
    portals.push({ ...OFFICE.door, to: 'office', landing: OFFICE.landing });
    portals.push({ ...SHOP.door, to: 'shop', landing: SHOP.landing });
    portals.push({ ...CASTLE.door, to: 'tower1', label: CASTLE.name, landing: CASTLE.landing });
    portals.push({ ...FAME.door, to: 'fame', landing: FAME.landing });
    portals.push({ ...BOARD.door, to: 'board', landing: BOARD.landing });
    portals.push({ ...EXCHANGE.door, to: 'exchange', landing: EXCHANGE.landing });
    portals.push({ ...CASINO_DOOR.door, to: 'casino', landing: CASINO_DOOR.landing });
  }
  return portals;
}

function portalInfo({ to }: Portal) {
  if (to === 'office') return OFFICE;
  if (to === 'counter') return COUNTER_INFO;
  if (to === 'panel') return PANEL_INFO;
  if (to === 'fame') return FAME;
  if (to === 'board') return BOARD;
  if (to === 'trade') return TRADE_INFO;
  if (isGame(to)) return GAMES[to];
  return to === 'shop' ? SHOP : MAPS[to];
}

export function portalName(portal: Portal) {
  return portal.label ?? portalInfo(portal).name;
}

export function portalColor(portal: Portal) {
  return portalInfo(portal).accent;
}

/**
 * from에서 to로 넘어갔을 때 서는 칸: 돌아오는 포탈 앞이다.
 * 엘리베이터로 오면 엘리베이터 앞이고, 작업장에서 돌아오면 노동청 앞이다.
 */
export function arrivalFor(to: MapId, from: MapId) {
  const portals = portalsOf(to);
  const back =
    portals.find((p) => p.to === from) ??
    portals.find((p) => p.to === 'elevator') ??
    (isTower(to) ? portals[0] : undefined);
  return back ? back.landing : OFFICE.landing;
}

/** 쓰러진 뒤 일어나는 칸. 블록을 놓을 수 없는 칸이라 갇힐 일이 없다. */
export function respawnTile(id: MapId) {
  return id === DEFAULT_MAP ? CASTLE.landing : portalsOf(id)[0].landing;
}
