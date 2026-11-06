import type { Color } from '../art/pixels';
import { MAP_SIZE } from '../config';

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

export type WorkId = 'quarry' | 'logging' | 'gathering' | 'fishing';
export type MapId = 'plains' | 'snow' | 'desert' | 'volcano' | 'forest' | WorkId;

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
}

/** 맵 목록. 평원을 중심으로 귀퉁이가 각 맵으로 이어지고, 작업장은 노동청에서 간다. */
export const MAPS: Record<MapId, MapInfo> = {
  plains: {
    name: '평원',
    floor: GRASS,
    floorTop: BLOCK_TOP,
    color: 0xa5d04f,
    accent: 0x9df08f,
    links: { right: 'desert', bottom: 'volcano', left: 'forest' },
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
    links: { left: 'plains' },
  },
  volcano: {
    name: '화산',
    floor: SCORCHED_DIRT,
    floorTop: BLOCK_TOP,
    color: 0x6e3a24,
    accent: 0xff6a3d,
    links: { top: 'plains' },
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

/** 평원 한가운데의 아이티공간. 정문 앞 칸이 포탈이고, 타면 상점 창이 열린다. */
export const SHOP = {
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

export function isMapId(value: unknown): value is MapId {
  return typeof value === 'string' && Object.hasOwn(MAPS, value);
}

export interface Portal {
  x: number;
  y: number;
  /** 'office'와 'shop'은 맵을 옮기지 않고 창을 연다. */
  to: MapId | 'office' | 'shop';
  /** 이 포탈 근처에서 플레이어가 서는 칸 */
  landing: { x: number; y: number };
}

function portalAt(corner: Corner, to: MapId): Portal {
  const { x, y, inX, inY } = CORNERS[corner];
  return { x, y, to, landing: { x: x + inX * LANDING_ALONG, y: y + inY * LANDING_ACROSS } };
}

export function portalsOf(id: MapId): Portal[] {
  const portals = (Object.entries(MAPS[id].links) as [Corner, MapId][]).map(([corner, to]) => portalAt(corner, to));
  if (id === 'plains') {
    portals.push({ ...OFFICE.door, to: 'office', landing: OFFICE.landing });
    portals.push({ ...SHOP.door, to: 'shop', landing: SHOP.landing });
  }
  return portals;
}

function portalInfo({ to }: Portal) {
  if (to === 'office') return OFFICE;
  return to === 'shop' ? SHOP : MAPS[to];
}

export function portalName(portal: Portal) {
  return portalInfo(portal).name;
}

export function portalColor(portal: Portal) {
  return portalInfo(portal).accent;
}

/** from에서 to로 넘어갔을 때 서는 칸: 돌아오는 포탈 앞이고, 작업장에서 돌아오면 노동청 앞이다. */
export function arrivalFor(to: MapId, from: MapId) {
  const back = portalsOf(to).find((p) => p.to === from);
  return back ? back.landing : OFFICE.landing;
}

/** 쓰러진 뒤 일어나는 칸. 블록을 놓을 수 없는 포탈 앞이라 갇힐 일이 없다. */
export function respawnTile(id: MapId) {
  return id === DEFAULT_MAP ? SHOP.landing : portalsOf(id)[0].landing;
}
