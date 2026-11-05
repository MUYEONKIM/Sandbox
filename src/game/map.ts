import { MAP_SIZE } from '../config';

export const Terrain = { Grass: 0, Dirt: 1, Paving: 2, Farm: 3, Water: 4 } as const;

export type PropKind = 'tree' | 'pine' | 'barrel' | 'crate' | 'banner';

export interface Prop {
  kind: PropKind;
  x: number;
  y: number;
  variant: number;
}

export interface Fence {
  x: number;
  y: number;
  /** 이웃 울타리 방향 비트: +x=1, -x=2, +y=4, -y=8 */
  mask: number;
}

export interface House {
  x: number;
  y: number;
  w: number;
  d: number;
}

export interface GameMap {
  terrain: Uint8Array;
  /** 맵에 고정된 장애물(집, 나무, 울타리 등) 칸 */
  solid: Uint8Array;
  props: Prop[];
  fences: Fence[];
  house: House | null;
  spawn: { x: number; y: number };
}

/** 시작 맵은 아무것도 없는 평지다. */
export function generateMap(): GameMap {
  const center = Math.floor(MAP_SIZE / 2);
  return {
    terrain: new Uint8Array(MAP_SIZE * MAP_SIZE).fill(Terrain.Grass),
    solid: new Uint8Array(MAP_SIZE * MAP_SIZE),
    props: [],
    fences: [],
    house: null,
    spawn: { x: center, y: center },
  };
}
