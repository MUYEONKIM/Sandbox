import { Rng } from '../art/pixels';
import type { SpriteName } from '../art/sprites';
import { MAP_SIZE } from '../config';
import { MAPS, OFFICE, SHOP, type MapId } from './maps';
import type { Tile } from './world';

export const Terrain = { Ground: 0, Water: 1 } as const;

/** 맵에 놓인 건물. (x, y)는 차지하는 칸의 위쪽 모서리다. */
export interface Building extends Tile {
  sprite: SpriteName;
  w: number;
  d: number;
}

export interface GameMap {
  /** 바닥에 섞어 까는 타일 번호 */
  floor: number[];
  /** 타일 그림에서 윗면이 시작하는 높이 (아트 픽셀) */
  floorTop: number;
  terrain: Uint8Array;
  /** 맵에 고정된 장애물 칸 */
  solid: Uint8Array;
  /** 자원을 캘 수 있는 칸 */
  spots: Tile[];
  buildings: Building[];
}

/** 작업장 건물이 들어가는 자리. 도착하는 귀퉁이 근처다. */
const WORK_SITE = { x: 38, y: 38, w: 4, d: 4 };

/** 작업장을 꾸미는 건물 */
const WORK_BUILDINGS: Partial<Record<MapId, SpriteName>> = {
  quarry: 'watchtower',
  logging: 'thatched',
  gathering: 'fruit',
  fishing: 'fish',
};

/** 작업장 자원은 이 간격의 격자에 흩어 놓는다. */
const SPOT_SPACING = 6;
/** 맵 가장자리와 포탈 근처를 비워 둔다. */
const SPOT_MARGIN = 3;
const PORTAL_CLEARANCE = 9;

const POND_RADIUS = 13;
const POND_CENTER = Math.floor(MAP_SIZE / 2);

function scatterSpots(id: MapId, solid: Uint8Array): Tile[] {
  const rng = new Rng(id.length * 7919 + id.charCodeAt(0));
  const spots: Tile[] = [];
  const end = MAP_SIZE - 1;
  for (let gy = SPOT_MARGIN; gy < MAP_SIZE - SPOT_MARGIN; gy += SPOT_SPACING) {
    for (let gx = SPOT_MARGIN; gx < MAP_SIZE - SPOT_MARGIN; gx += SPOT_SPACING) {
      const x = gx + rng.int(0, SPOT_SPACING - 2);
      const y = gy + rng.int(0, SPOT_SPACING - 2);
      if (x > end - PORTAL_CLEARANCE && y > end - PORTAL_CLEARANCE) continue;
      spots.push({ x, y });
      solid[x + y * MAP_SIZE] = 1;
    }
  }
  return spots;
}

/** 낚시터 가운데에 연못을 파고, 물가 칸 몇 곳을 낚시 자리로 쓴다. */
function digPond(terrain: Uint8Array): Tile[] {
  const isWater = (x: number, y: number) => Math.hypot(x - POND_CENTER, y - POND_CENTER) <= POND_RADIUS;
  const spots: Tile[] = [];
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      if (!isWater(x, y)) continue;
      terrain[x + y * MAP_SIZE] = Terrain.Water;
      const shore = !isWater(x + 1, y) || !isWater(x - 1, y) || !isWater(x, y + 1) || !isWater(x, y - 1);
      if (shore && (x + y * 3) % 5 === 0) spots.push({ x, y });
    }
  }
  return spots;
}

/** 맵은 기본적으로 평지다. 맵마다 바닥색이 다르고, 건물이나 자원이 있는 맵은 여기서 채운다. */
export function generateMap(id: MapId): GameMap {
  const terrain = new Uint8Array(MAP_SIZE * MAP_SIZE).fill(Terrain.Ground);
  const solid = new Uint8Array(MAP_SIZE * MAP_SIZE);
  const buildings: Building[] = [];
  let spots: Tile[] = [];

  if (id === 'plains') {
    for (const { sprite, x, y, w, d } of [OFFICE, SHOP]) buildings.push({ sprite, x, y, w, d });
  } else if (id === 'fishing') {
    spots = digPond(terrain);
  } else if (MAPS[id].work) {
    spots = scatterSpots(id, solid);
  }

  const workBuilding = WORK_BUILDINGS[id];
  if (workBuilding) buildings.push({ sprite: workBuilding, ...WORK_SITE });

  for (const { x, y, w, d } of buildings) {
    for (let j = y; j < y + d; j++) {
      for (let i = x; i < x + w; i++) solid[i + j * MAP_SIZE] = 1;
    }
  }

  const { floor, floorTop } = MAPS[id];
  return { floor, floorTop, terrain, solid, spots, buildings };
}
