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

export interface MapInfo {
  name: string;
  /** 바닥색 네 단계 (어두운 색부터) */
  ground: Color[];
  /** 이 맵으로 가는 포탈의 색 */
  accent: Color;
  /** 귀퉁이별로 이어지는 맵 */
  links: Partial<Record<Corner, MapId>>;
}

export type MapId = 'plains' | 'snow' | 'desert' | 'volcano' | 'forest';

/** 맵 목록. 평원을 중심으로 네 귀퉁이가 각 맵으로 이어진다. */
export const MAPS: Record<MapId, MapInfo> = {
  plains: {
    name: '평원',
    ground: [0x4c9a3e, 0x5bab43, 0x6dbd49, 0x82cc55],
    accent: 0x9df08f,
    links: { top: 'snow', right: 'desert', bottom: 'volcano', left: 'forest' },
  },
  snow: {
    name: '설원',
    ground: [0xbfd6e4, 0xcfe1ec, 0xdeebf3, 0xedf5f9],
    accent: 0x7fd3ff,
    links: { bottom: 'plains' },
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
    links: { right: 'plains' },
  },
};

export const DEFAULT_MAP: MapId = 'plains';

export function isMapId(value: unknown): value is MapId {
  return typeof value === 'string' && Object.hasOwn(MAPS, value);
}

export interface Portal {
  x: number;
  y: number;
  to: MapId;
  /** 이 포탈 근처에서 플레이어가 서는 칸 */
  landing: { x: number; y: number };
}

function portalAt(corner: Corner, to: MapId): Portal {
  const { x, y, inX, inY } = CORNERS[corner];
  return { x, y, to, landing: { x: x + inX * LANDING_ALONG, y: y + inY * LANDING_ACROSS } };
}

export function portalsOf(id: MapId): Portal[] {
  return (Object.entries(MAPS[id].links) as [Corner, MapId][]).map(([corner, to]) => portalAt(corner, to));
}

/** 포탈을 타고 나서 도착할 칸: 도착한 맵에서 돌아오는 포탈 앞이다. */
export function arrivalFor(portal: Portal, from: MapId) {
  const back = portalsOf(portal.to).find((p) => p.to === from);
  return back ? back.landing : portal.landing;
}
