import { Rng } from '../art/pixels';
import { MAP_SIZE } from '../config';
import { MAPS, OFFICE, type MapId } from './maps';
import type { Tile } from './world';

export const Terrain = { Grass: 0, Dirt: 1, Paving: 2, Farm: 3, Water: 4 } as const;

export interface GameMap {
  /** 바닥색 네 단계 (어두운 색부터) */
  ground: number[];
  terrain: Uint8Array;
  /** 맵에 고정된 장애물 칸 */
  solid: Uint8Array;
  /** 자원을 캘 수 있는 칸 */
  spots: Tile[];
}

/** 작업장 자원은 이 간격의 격자에 흩어 놓는다. */
const SPOT_SPACING = 6;
/** 맵 가장자리와 포탈 근처를 비워 둔다. */
const SPOT_MARGIN = 3;
const PORTAL_CLEARANCE = 7;

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
  const terrain = new Uint8Array(MAP_SIZE * MAP_SIZE).fill(Terrain.Grass);
  const solid = new Uint8Array(MAP_SIZE * MAP_SIZE);
  let spots: Tile[] = [];

  if (id === 'plains') {
    for (let y = OFFICE.y; y < OFFICE.y + OFFICE.d; y++) {
      for (let x = OFFICE.x; x < OFFICE.x + OFFICE.w; x++) solid[x + y * MAP_SIZE] = 1;
    }
  } else if (id === 'fishing') {
    spots = digPond(terrain);
  } else if (MAPS[id].work) {
    spots = scatterSpots(id, solid);
  }

  return { ground: MAPS[id].ground, terrain, solid, spots };
}
