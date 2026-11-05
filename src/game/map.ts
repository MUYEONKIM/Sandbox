import type { Color } from '../art/pixels';
import { MAP_SIZE } from '../config';

export const Terrain = { Grass: 0, Dirt: 1, Paving: 2, Farm: 3, Water: 4 } as const;

export interface GameMap {
  /** 바닥색 네 단계 (어두운 색부터) */
  ground: Color[];
  terrain: Uint8Array;
  /** 맵에 고정된 장애물 칸 */
  solid: Uint8Array;
}

/** 맵은 처음에 아무것도 없는 평지다. 맵마다 바닥색만 다르다. */
export function generateMap(ground: Color[]): GameMap {
  return {
    ground,
    terrain: new Uint8Array(MAP_SIZE * MAP_SIZE).fill(Terrain.Grass),
    solid: new Uint8Array(MAP_SIZE * MAP_SIZE),
  };
}
