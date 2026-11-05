import { MAP_SIZE, TILE_H, TILE_W } from './config';

/** 월드 좌표에서 맵 (0,0) 칸의 위쪽 꼭짓점 위치 */
export const ORIGIN_X = (MAP_SIZE * TILE_W) / 2;
export const ORIGIN_Y = 72;

/** 격자 좌표(소수 가능)를 월드 픽셀 좌표로 변환한다. */
export function gridToWorld(gx: number, gy: number) {
  return {
    x: ORIGIN_X + ((gx - gy) * TILE_W) / 2,
    y: ORIGIN_Y + ((gx + gy) * TILE_H) / 2,
  };
}

/** 월드 픽셀 좌표를 격자 좌표(소수)로 변환한다. */
export function worldToGrid(wx: number, wy: number) {
  const u = (wx - ORIGIN_X) / (TILE_W / 2);
  const v = (wy - ORIGIN_Y) / (TILE_H / 2);
  return { gx: (u + v) / 2, gy: (v - u) / 2 };
}

/** 칸 중심의 월드 좌표 */
export function tileCenter(x: number, y: number) {
  return gridToWorld(x + 0.5, y + 0.5);
}

/** 화면 아래쪽(앞쪽)에 있을수록 나중에 그려지도록 하는 깊이 값 */
export function depthOf(gx: number, gy: number) {
  return 100 + (gx + gy) * 10;
}
