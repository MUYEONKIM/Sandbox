import { BLOCK_HEIGHT, TILE_H, TILE_W } from '../config';
import { Pixels, shade, type Color } from './pixels';

export type Face = 'top' | 'left' | 'right';

/** 블록 면의 (u,v) 위치 색을 돌려주는 함수. 빛에 따른 명암은 paintCube가 입힌다. */
export type FaceShader = (face: Face, u: number, v: number) => Color;

/** 마름모 칸 하나를 꽉 채우는 정육면체를 그린다. 캔버스 맨 아래 가운데가 칸의 앞 꼭짓점이다. */
export function paintCube(shader: FaceShader): HTMLCanvasElement {
  const hw = TILE_W / 2;
  const hh = TILE_H / 2;
  const p = new Pixels(TILE_W, TILE_H + BLOCK_HEIGHT);

  p.parallelogram([hw, 0], [hw, hh], [-hw, hh], (u, v) => {
    const c = shader('top', u, v);
    return u > 0.94 || v > 0.94 ? shade(c, 1.16) : c;
  });
  p.parallelogram([0, hh], [hw, hh], [0, BLOCK_HEIGHT], (u, v) =>
    shade(shader('left', u, v), u > 0.93 ? 1 : 0.84),
  );
  p.parallelogram([hw, TILE_H], [hw, -hh], [0, BLOCK_HEIGHT], (u, v) =>
    shade(shader('right', u, v), u < 0.07 ? 0.86 : 0.66),
  );
  p.outlineInner(0.6);
  return p.toCanvas();
}
