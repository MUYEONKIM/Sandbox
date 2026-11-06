import type { Color } from './pixels';
import { sprite, type SpriteName } from './sprites';

/** 벽 원본은 폭이 96픽셀이라 1/3로 줄이면 타일 폭 32에 꼭 맞는다. */
const SHRINK = 3;
const SOURCE_W = 108;
const SOURCE_H = 123;
/** 원본에서 벽 맨 아래 꼭짓점의 위치 */
const SOURCE_BOTTOM_X = 54;
const SOURCE_BOTTOM_Y = 113;

const WALL_W = Math.round(SOURCE_W / SHRINK);
const WALL_H = Math.round(SOURCE_H / SHRINK);

/** 그림에서 칸 중심에 맞출 위치 (0~1). 칸 중심은 앞 꼭짓점보다 8픽셀 위에 있다. */
export const WALL_ORIGIN_X = SOURCE_BOTTOM_X / SOURCE_W;
export const WALL_ORIGIN_Y = (SOURCE_BOTTOM_Y / SHRINK - 8) / WALL_H;

export const WALL_VARIANTS = 11;

/**
 * 이웃 벽 방향으로 고르는 조각 번호. 비트: +x=1, -x=2, +y=4, -y=8
 * 화면에서는 +x가 오른쪽 아래, -x가 왼쪽 위, +y가 왼쪽 아래, -y가 오른쪽 위다.
 */
const VARIANT_BY_NEIGHBORS = [0, 0, 0, 0, 1, 8, 7, 3, 1, 10, 9, 4, 1, 6, 5, 2];

export function wallVariant(neighbors: number) {
  return VARIANT_BY_NEIGHBORS[neighbors];
}

/** 벽 조각 하나를 타일 크기로 줄이고, tint가 있으면 그 색을 입힌다. */
export function paintWall(variant: number, tint: Color | null): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = WALL_W;
  canvas.height = WALL_H;
  const context = canvas.getContext('2d')!;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  const name = `wal${String(variant).padStart(4, '0')}` as SpriteName;
  context.drawImage(sprite(name), 0, 0, WALL_W, WALL_H);

  // 줄이면서 생긴 반투명 가장자리를 없애 도트처럼 또렷하게 만든다.
  const image = context.getImageData(0, 0, WALL_W, WALL_H);
  const { data } = image;
  for (let i = 3; i < data.length; i += 4) data[i] = data[i] < 110 ? 0 : 255;
  if (tint !== null) {
    const red = ((tint >> 16) & 255) / 255;
    const green = ((tint >> 8) & 255) / 255;
    const blue = (tint & 255) / 255;
    for (let i = 0; i < data.length; i += 4) {
      data[i] *= red;
      data[i + 1] *= green;
      data[i + 2] *= blue;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}
