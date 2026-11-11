import type { Color } from './pixels';

/** 칸 윗면 마름모의 폭과 높이 (타일과 같다) */
const TOP_W = 32;
const TOP_H = 16;

/** 얇은 벽 모양. 두께는 칸 한 변에 대한 비율, 높이는 아트 픽셀이다. */
export interface ThinWallStyle {
  thickness: number;
  height: number;
  top: Color;
  left: Color;
  right: Color;
  /** 바닥 쪽 걸레받이. 없으면 null */
  base: Color | null;
  /** 옆면 불투명도 0~255. 유리는 반쯤 비친다. */
  alpha: number;
}

/** 사무실 벽: 뒤쪽 벽과 같은 밝은 회색에 어두운 걸레받이 */
export const OFFICE_WALL: ThinWallStyle = {
  thickness: 0.22,
  height: 36,
  top: 0xf6f7f8,
  left: 0xdfe3e8,
  right: 0xc2c8d0,
  base: 0x4a505a,
  alpha: 255,
};

/** 뚫린 바닥 둘레의 유리 난간: 낮고 비치며 위에 손잡이가 있다. */
export const GLASS_RAIL: ThinWallStyle = {
  thickness: 0.14,
  height: 18,
  top: 0x8a929c,
  left: 0xbfe3f5,
  right: 0x9ccbe2,
  base: null,
  alpha: 120,
};

/** 이웃 방향 비트: +x=1, -x=2, +y=4, -y=8 */
export const NEIGHBOR = { px: 1, nx: 2, py: 4, ny: 8 } as const;

interface Box {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

/** 그림에서 칸 중심에 맞출 위치 (0~1) */
export function thinWallOriginY(style: ThinWallStyle) {
  const h = TOP_H + style.height;
  return (h - TOP_H / 2) / h;
}

/**
 * 칸 가운데를 지나는 얇은 벽을 그린다. 이웃 벽이 있는 쪽으로 칸 끝까지 팔을 뻗어 옆 칸의 벽과 이어진다.
 * 칸 안 좌표 (u, v)는 0~1이고 u가 +x, v가 +y 쪽이다. 화면 한 점에 겹친 면 가운데 가장 앞(높은 쪽)을 칠한다.
 */
export function paintThinWall(style: ThinWallStyle, neighbors: number): HTMLCanvasElement {
  const { thickness, height } = style;
  const a = 0.5 - thickness / 2;
  const b = 0.5 + thickness / 2;
  const boxes: Box[] = [{ u0: a, u1: b, v0: a, v1: b }];
  if (neighbors & NEIGHBOR.px) boxes.push({ u0: a, u1: 1, v0: a, v1: b });
  if (neighbors & NEIGHBOR.nx) boxes.push({ u0: 0, u1: b, v0: a, v1: b });
  if (neighbors & NEIGHBOR.py) boxes.push({ u0: a, u1: b, v0: a, v1: 1 });
  if (neighbors & NEIGHBOR.ny) boxes.push({ u0: a, u1: b, v0: 0, v1: b });

  const w = TOP_W;
  const h = TOP_H + height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(w, h);
  const inside = (t: number, lo: number, hi: number) => t >= lo - 1e-6 && t <= hi + 1e-6;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // 화면 점: X = 16 + (u - v) * 16, Y = (u + v) * 8 + height - z
      const p = (x + 0.5 - TOP_W / 2) / 16; // u - v
      const q = y + 0.5;
      let best = -Infinity;
      let color: Color | null = null;
      let alpha = 255;
      for (const box of boxes) {
        // 윗면 (z = height)
        const s = q / 8; // u + v
        const u = (s + p) / 2;
        const v = (s - p) / 2;
        if (inside(u, box.u0, box.u1) && inside(v, box.v0, box.v1) && height > best) {
          best = height;
          color = style.top;
          alpha = 255;
        }
        // 앞-왼쪽 면 (v = v1)
        {
          const fu = box.v1 + p;
          const z = (fu + box.v1) * 8 + height - q;
          if (inside(fu, box.u0, box.u1) && z >= 0 && z < height && z > best) {
            best = z;
            color = style.base !== null && z < 3 ? style.base : style.left;
            alpha = style.alpha;
          }
        }
        // 앞-오른쪽 면 (u = u1)
        {
          const fv = box.u1 - p;
          const z = (box.u1 + fv) * 8 + height - q;
          if (inside(fv, box.v0, box.v1) && z >= 0 && z < height && z > best) {
            best = z;
            color = style.base !== null && z < 3 ? style.base : style.right;
            alpha = style.alpha;
          }
        }
      }
      if (color === null) continue;
      const o = (x + y * w) * 4;
      image.data[o] = (color >> 16) & 255;
      image.data[o + 1] = (color >> 8) & 255;
      image.data[o + 2] = color & 255;
      image.data[o + 3] = alpha;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}
