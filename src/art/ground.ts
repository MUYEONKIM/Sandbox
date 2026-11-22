import { TILE_H, TILE_W } from '../config';
import { Terrain, type GameMap } from '../game/map';
import { gridToWorld, ORIGIN_X, ORIGIN_Y } from '../iso';
import { hash2 } from './pixels';
import { sprite } from './sprites';

/** tiles.png는 32×32 칸이 가로 11개씩 놓인 그림이다. */
export const TILE_CELL = 32;
const COLUMNS = 11;

/** 꽃과 바위 타일은 블록 윗면 위에 놓이도록 그려져 있어 그만큼 올려 그린다. */
export const DECOR_LIFT = 8;

/** 연못에 까는 물 타일. 잔잔한 타일을 여러 번 넣어 파도가 가끔만 보이게 한다. */
const WATER_TILES = [93, 93, 93, 93, 92, 94, 95, 88];

/** 맵 앞쪽 가장자리 아래로 드러나는 블록 옆면의 높이 (아트 픽셀) */
const BLOCK_SIDE = 8;

/** 한 변이 size칸인 맵이 차지하는 월드 범위. 기본 크기 맵은 왼쪽 끝이 0이고, 넓은 맵은 왼쪽으로 더 나간다. */
export function worldRect(size: number) {
  return { left: ORIGIN_X - (size * TILE_W) / 2, width: size * TILE_W, height: ORIGIN_Y + size * TILE_H + BLOCK_SIDE * 2 };
}

/** 같은 칸에는 항상 같은 타일이 나오도록 좌표로 고른다. */
function pick(tiles: number[], x: number, y: number) {
  return tiles[Math.floor(hash2(x, y) * tiles.length)];
}

/**
 * 지형 전체를 큰 이미지 한 장으로 그린다. 타일마다 스프라이트를 만들지 않아 가볍다.
 * 뒤쪽 칸부터 그려서 앞 칸이 뒤 칸의 옆면을 덮게 한다. 물 타일은 블록보다 얇아서
 * 같은 높이에 그리면 바닥보다 낮은 연못처럼 보인다.
 */
/**
 * deco: 모험 맵 새 바닥 아틀라스(2026-11-20). 땅 칸에 decoTiles 번호가 있으면 아틀라스 그 칸(32 × 32, tiles.png와 같은 모양)을 같은 자리에 그린다.
 * 물 칸과 번호 없는 칸은 지금처럼 tiles.png. 뒤 칸부터 한 번에 그리는 차례는 그대로다(앞 칸이 뒤 칸 옆면을 덮음).
 * deco.water가 있으면 물 칸은 그 그림(그 지역 밝기를 구운 tiles.png 사본, 2026-11-22)에서 같은 타일 번호로 그린다.
 */
export function paintGround(
  map: GameMap,
  deco?: { image: CanvasImageSource; tiles: { x: number; y: number }[]; water?: CanvasImageSource },
): HTMLCanvasElement {
  const { size } = map;
  const rect = worldRect(size);
  const canvas = document.createElement('canvas');
  canvas.width = rect.width;
  canvas.height = rect.height;
  const context = canvas.getContext('2d')!;
  const sheet = sprite('tiles');
  const waterSheet = deco?.water ?? sheet;

  const draw = (tile: number, left: number, top: number, from: CanvasImageSource = sheet) => {
    const sx = (tile % COLUMNS) * TILE_CELL;
    const sy = Math.floor(tile / COLUMNS) * TILE_CELL;
    context.drawImage(from, sx, sy, TILE_CELL, TILE_CELL, left, top, TILE_CELL, TILE_CELL);
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = x + y * size;
      if (map.terrain[index] === Terrain.Void) continue;
      const water = map.terrain[index] === Terrain.Water;
      const corner = gridToWorld(x, y);
      const left = corner.x - TILE_CELL / 2 - rect.left;
      const top = corner.y - map.floorTop;
      const dt = deco && !water ? map.decoTiles.get(index) : undefined;
      const dr = dt !== undefined ? deco!.tiles[dt] : undefined;
      if (dr) {
        context.drawImage(deco!.image, dr.x, dr.y, TILE_CELL, TILE_CELL, left, top, TILE_CELL, TILE_CELL);
        continue;
      }
      // 건물 안처럼 바닥 타일이 없는 맵은 바닥을 따로 그린다.
      const tile = map.floorTiles.get(index) ?? pick(water ? WATER_TILES : map.floor, x, y);
      if (tile !== undefined) draw(tile, left, top, water ? waterSheet : sheet);
      const decal = map.decals.get(index);
      if (decal !== undefined) draw(decal, left, top - DECOR_LIFT);
    }
  }
  return canvas;
}
