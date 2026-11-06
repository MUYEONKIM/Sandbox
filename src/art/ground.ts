import { MAP_SIZE, TILE_H, TILE_W } from '../config';
import { Terrain, type GameMap } from '../game/map';
import { gridToWorld, ORIGIN_Y } from '../iso';
import { hash2 } from './pixels';
import { sprite } from './sprites';

/** tiles.png는 32×32 칸이 가로 11개씩 놓인 그림이다. */
const CELL = 32;
const COLUMNS = 11;

/** 연못에 까는 물 타일. 잔잔한 타일을 여러 번 넣어 파도가 가끔만 보이게 한다. */
const WATER_TILES = [93, 93, 93, 93, 92, 94, 95, 88];

/** 맵 앞쪽 가장자리 아래로 드러나는 블록 옆면의 높이 (아트 픽셀) */
const BLOCK_SIDE = 8;

export const WORLD_W = MAP_SIZE * TILE_W;
export const WORLD_H = ORIGIN_Y + MAP_SIZE * TILE_H + BLOCK_SIDE * 2;

/** 같은 칸에는 항상 같은 타일이 나오도록 좌표로 고른다. */
function pick(tiles: number[], x: number, y: number) {
  return tiles[Math.floor(hash2(x, y) * tiles.length)];
}

/**
 * 지형 전체를 큰 이미지 한 장으로 그린다. 타일마다 스프라이트를 만들지 않아 가볍다.
 * 뒤쪽 칸부터 그려서 앞 칸이 뒤 칸의 옆면을 덮게 한다. 물 타일은 블록보다 얇아서
 * 같은 높이에 그리면 바닥보다 낮은 연못처럼 보인다.
 */
export function paintGround(map: GameMap): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = WORLD_W;
  canvas.height = WORLD_H;
  const context = canvas.getContext('2d')!;
  const sheet = sprite('tiles');

  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const water = map.terrain[x + y * MAP_SIZE] === Terrain.Water;
      const tile = pick(water ? WATER_TILES : map.floor, x, y);
      const sx = (tile % COLUMNS) * CELL;
      const sy = Math.floor(tile / COLUMNS) * CELL;
      const corner = gridToWorld(x, y);
      context.drawImage(sheet, sx, sy, CELL, CELL, corner.x - CELL / 2, corner.y - map.floorTop, CELL, CELL);
    }
  }
  return canvas;
}
