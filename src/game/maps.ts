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

export interface MapInfo {
  name: string;
  /** 바닥색 네 단계 (어두운 색부터) */
  ground: Color[];
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
    ground: [0x4c9a3e, 0x5bab43, 0x6dbd49, 0x82cc55],
    accent: 0x9df08f,
    links: { right: 'desert', bottom: 'volcano', left: 'forest' },
  },
  snow: {
    name: '설원',
    ground: [0xbfd6e4, 0xcfe1ec, 0xdeebf3, 0xedf5f9],
    accent: 0x7fd3ff,
    links: { bottom: 'forest' },
  },
  desert: {
    name: '사막',
    ground: [0xcfa862, 0xdcb873, 0xe6c686, 0xeed39a],
    accent: 0xffc34d,
    links: { left: 'plains' },
  },
  volcano: {
    name: '화산',
    ground: [0x3d3236, 0x483b3e, 0x544447, 0x614f4f],
    accent: 0xff6a3d,
    links: { top: 'plains' },
  },
  forest: {
    name: '숲',
    ground: [0x2a6138, 0x316e41, 0x397b49, 0x438952],
    accent: 0x4fdc86,
    links: { right: 'plains', top: 'snow' },
  },
  quarry: {
    name: '채석장',
    ground: [0x8a8580, 0x98938d, 0xa6a19a, 0xb4afa7],
    accent: 0xc9c4bc,
    links: { bottom: 'plains' },
    work: true,
  },
  logging: {
    name: '벌목장',
    ground: [0x6f5a3a, 0x7d6742, 0x8b744b, 0x998155],
    accent: 0x4fdc86,
    links: { bottom: 'plains' },
    work: true,
  },
  gathering: {
    name: '채집장',
    ground: [0x6f9a45, 0x7dab4c, 0x8cbc55, 0x9bcb60],
    accent: 0xf2a65a,
    links: { bottom: 'plains' },
    work: true,
  },
  fishing: {
    name: '낚시터',
    ground: [0xb79a68, 0xc5a974, 0xd3b781, 0xdfc48e],
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
