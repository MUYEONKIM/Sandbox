import { Pixels, type Color } from './pixels';
import type { Art } from './props';

/** 전쟁터(옛 숲, 2026-11-13 사용자 요청)에 박혀 있는 장애물 그림. (ax, ay)가 칸 가운데다. */

const OUTLINE = 0x2a241d;

/** 모래주머니 한 칸: 낮은 상자 모양으로 쌓은 자루 두 줄 */
export function paintSandbags(): Art {
  const p = new Pixels(32, 27);
  const height = 9;
  const top = 3;
  const halfW = 13;
  const halfH = 6.5;
  const cx = 16;
  const cy = top + halfH;
  const BAG = 0xbca677;
  const LEFT = 0xa38d5f;
  const RIGHT = 0x8c784e;
  const SEAM = 0x6e5c3b;
  // 자루는 한 줄에 셋, 아랫줄은 반 개씩 엇갈린다. 자루 사이와 줄 사이는 어두운 솔기다.
  const side = (base: Color) => (u: number, v: number) => {
    const row = v < 0.5 ? 0 : 1;
    const along = u * 3 + row * 0.5;
    if (Math.abs(v - 0.5) < 0.08 || along % 1 < 0.1) return SEAM;
    const bulge = Math.abs(((v * 2) % 1) - 0.5);
    return bulge > 0.38 ? SEAM : base;
  };
  p.parallelogram([cx - halfW, cy], [halfW, halfH], [0, height], side(LEFT));
  p.parallelogram([cx, cy + halfH], [halfW, -halfH], [0, height], side(RIGHT));
  p.parallelogram([cx, top], [halfW, halfH], [-halfW, halfH], (u) => (u * 3) % 1 < 0.1 ? SEAM : BAG);
  p.outlineOuter(OUTLINE);
  return { canvas: p.toCanvas(), ax: cx, ay: cy + height };
}

/** 대전차 장애물(체코 고슴도치): 철골 세 개를 엇갈려 세웠다. */
export function paintHedgehog(): Art {
  const p = new Pixels(26, 28);
  const STEEL = 0x50545b;
  const LIGHT = 0x878c95;
  const RUST = 0x7d4b2b;
  p.ellipse(13, 23, 10, 3.5, 0x1d1a16, 90);
  const beam = (x0: number, y0: number, x1: number, y1: number) => {
    p.line(x0, y0, x1, y1, STEEL);
    p.line(x0 + 1, y0, x1 + 1, y1, LIGHT);
    p.line(x0 - 1, y0, x1 - 1, y1, STEEL);
  };
  beam(5, 24, 20, 5);
  beam(21, 24, 6, 6);
  beam(13, 26, 13, 2);
  for (const [x, y] of [
    [9, 19],
    [17, 11],
    [13, 15],
    [18, 20],
  ]) {
    p.set(x, y, RUST);
  }
  p.outlineOuter(OUTLINE);
  return { canvas: p.toCanvas(), ax: 13, ay: 23 };
}

/** 포탄 구덩이: 땅에 패인 자국이라 밟고 지나간다. */
export function paintCrater(): Art {
  const p = new Pixels(36, 19);
  p.ellipse(18, 9.5, 17, 8.5, 0x5f4c38);
  p.ellipse(18, 9, 15, 7.2, 0x7a644a);
  p.ellipse(18, 10, 11.5, 5.3, 0x3d3127);
  p.ellipse(18, 11, 7, 3, 0x2c241d);
  for (let x = 6; x < 30; x += 3) p.set(x, 3 + Math.round(Math.abs(x - 18) / 4), 0x96805f);
  return { canvas: p.toCanvas(), ax: 18, ay: 9 };
}
