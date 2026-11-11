import { BLOCK_HEIGHT } from '../config';
import { spritePixels } from './sprites';

/** block-textures.png는 16×16 텍스처가 가로 한 줄로 이어진 그림이다. 원본과 고른 위치는 art-source/textures/make-sheet.cjs */
const TEXTURE = 16;
/** 윗면 마름모의 폭과 높이 (타일과 같다) */
const TOP_W = 32;
const TOP_H = 16;

const CUBE_W = TOP_W;

/** 그림에서 칸 중심에 맞출 위치 (0~1). 칸 중심은 바닥 마름모의 가운데로, 앞 꼭짓점보다 8픽셀 위다. */
export const CUBE_ORIGIN_X = 0.5;
export function cubeOriginY(height = BLOCK_HEIGHT) {
  const h = TOP_H + height;
  return (h - TOP_H / 2) / h;
}
export const CUBE_ORIGIN_Y = cubeOriginY();

/** 빛이 왼쪽 위에서 온다. 윗면 앞 모서리는 밝게, 옆면 밑줄은 어둡게 해서 붙은 블록끼리 구분한다. */
const SHADE_TOP = 1;
const SHADE_LEFT = 0.84;
const SHADE_RIGHT = 0.66;
const EDGE_LIGHT = 1.18;
const EDGE_DARK = 0.7;
/** 텍스처의 투명한 칸(유리 가운데)은 옅은 하늘색으로 비치게 칠한다. */
const GLASS = [200, 230, 255] as const;
const GLASS_ALPHA = 70;

let textures: ImageData | undefined;

/**
 * 텍스처 한 칸으로 아이소메트릭 상자를 그린다. 윗면은 텍스처를 마름모로 눕히고, 옆면 두 개는 기울여 붙인다.
 * 텍스처가 이음매 없는 무늬라 옆면 높이(18)가 텍스처(16)보다 길어도 무늬를 이어 붙인다.
 * side를 주면 옆면은 그 텍스처로 칠하고(잔디처럼 위아래가 다른 그림), 이어 붙이지 않고 옆면 높이에 맞춰 늘린다.
 * height는 옆면 높이다. edges가 false면 윗면 앞 모서리를 밝히지 않아, 여러 칸을 붙인 덩어리(건물 안 기둥)의 윗면이 바둑판처럼 보이지 않는다.
 */
export function paintCube(texture: number, side = texture, height = BLOCK_HEIGHT, edges = true): HTMLCanvasElement {
  const cubeH = TOP_H + height;
  textures ??= spritePixels('block-textures');
  const source = textures;
  const canvas = document.createElement('canvas');
  canvas.width = CUBE_W;
  canvas.height = cubeH;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(CUBE_W, cubeH);

  const put = (x: number, y: number, cell: number, s: number, t: number, shade: number) => {
    const sx = cell * TEXTURE + (Math.floor(s) % TEXTURE);
    const sy = Math.floor(t) % TEXTURE;
    const from = (sx + sy * source.width) * 4;
    const to = (x + y * CUBE_W) * 4;
    const clear = source.data[from + 3] < 128;
    for (let c = 0; c < 3; c++) image.data[to + c] = Math.min(255, Math.round((clear ? GLASS[c] : source.data[from + c]) * shade));
    image.data[to + 3] = clear ? GLASS_ALPHA : 255;
  };
  const stretch = side !== texture;

  for (let y = 0; y < cubeH; y++) {
    for (let x = 0; x < CUBE_W; x++) {
      const fx = x + 0.5;
      const fy = y + 0.5;
      // 윗면: 텍스처 (u, v)가 화면 (16 + u - v, (u + v) / 2)에 온다.
      const u = (fx - TOP_W / 2 + 2 * fy) / 2;
      const v = (2 * fy - fx + TOP_W / 2) / 2;
      if (u >= 0 && u < TEXTURE && v >= 0 && v < TEXTURE) {
        put(x, y, texture, u, v, edges && (u >= TEXTURE - 1 || v >= TEXTURE - 1) ? EDGE_LIGHT : SHADE_TOP);
        continue;
      }
      const left = fx < TOP_W / 2;
      const s = left ? fx : fx - TOP_W / 2;
      // 옆면 윗변의 높이: 왼쪽 면은 내려가고 오른쪽 면은 올라간다.
      const t = fy - (left ? TOP_H / 2 + s / 2 : TOP_H - s / 2);
      if (t < 0 || t >= height) continue;
      const shade = left ? SHADE_LEFT : SHADE_RIGHT;
      const row = stretch ? (t * TEXTURE) / height : t;
      put(x, y, side, s, row, t >= height - 1 ? shade * EDGE_DARK : shade);
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}
