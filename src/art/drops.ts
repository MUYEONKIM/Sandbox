import { Pixels, type Color } from './pixels';
import type { Art } from './props';

/** 땅에 놓인 메모와 골드, 그 둘레에서 반짝이는 별, 단축키 칸의 메모장 그림 */

const OUTLINE = 0x2c2430;
const PAPER = 0xfffbea;
const PAPER_SHADE = 0xe6dcc0;
const RULE = 0x9bb4d6;
const COIN = 0xf2c14e;
const COIN_RIM = 0xb8862a;
const COIN_SHINE = 0xfff1a8;

/** 땅에 납작하게 놓인 쪽지 한 장. 줄이 그어져 있고 한 귀퉁이가 접혔다. 칸 가운데가 (ax, ay)다. */
export function paintMemoNote(): Art {
  const p = new Pixels(24, 16);
  const cx = 12;
  const cy = 9;
  const a: [number, number] = [10, 5];
  const b: [number, number] = [-9, 4.5];
  const o: [number, number] = [cx - 0.5, cy - 5];
  // 종이 두께: 앞쪽 두 변 아래로 1픽셀
  p.parallelogram([o[0] + b[0], o[1] + b[1]], a, [0, 1], () => PAPER_SHADE);
  p.parallelogram([o[0] + a[0], o[1] + a[1]], b, [0, 1], () => PAPER_SHADE);
  p.parallelogram(o, a, b, (u, v) => {
    if (u > 0.78 && v > 0.72 && u + v > 1.62) return u + v > 1.74 ? null : PAPER_SHADE;
    if (v > 0.16 && v < 0.2) return 0xe07a7a;
    if (u > 0.12 && u < 0.92 && v > 0.3 && Math.abs(((v - 0.3) % 0.18) - 0.09) < 0.025) return RULE;
    return PAPER;
  });
  p.outlineOuter(OUTLINE);
  return { canvas: p.toCanvas(), ax: cx, ay: cy };
}

/** 골드 더미. 크기 0(1~99G), 1(100~999G), 2(1,000G 이상)로 동전 수가 늘어난다. */
export function goldTier(amount: number) {
  return amount >= 1000 ? 2 : amount >= 100 ? 1 : 0;
}

/** 동전 (x, y, 쌓인 층). 층이 높을수록 위에 있다. */
const COINS: [number, number, number][][] = [
  [
    [-3, -1, 0],
    [3, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  [
    [-6, 1, 0],
    [6, 1, 0],
    [-2, -1, 1],
    [3, 0, 1],
    [0, 0, 2],
  ],
  [
    [-4, 2, 0],
    [4, 2, 0],
    [-5, 0, 1],
    [5, 1, 1],
    [-1, 0, 2],
    [2, 0, 2],
    [0, -1, 3],
  ],
];

export function paintGoldPile(tier: number): Art {
  const p = new Pixels(26, 20);
  const cx = 13;
  const cy = 14;
  const coins = COINS.slice(0, tier + 1)
    .flat()
    .sort((m, n) => m[2] - n[2] || m[1] - n[1]);
  for (const [x, y, layer] of coins) {
    const sx = cx + x;
    const sy = cy + y - layer * 2;
    p.ellipse(sx, sy + 1, 3.3, 1.8, COIN_RIM);
    p.ellipse(sx, sy, 3.3, 1.8, COIN);
    p.set(sx - 1, sy - 1, COIN_SHINE);
    p.set(sx, sy - 1, COIN_SHINE);
  }
  p.outlineOuter(OUTLINE);
  return { canvas: p.toCanvas(), ax: cx, ay: cy };
}

/** 네 갈래 반짝임 (가운데가 그림 가운데) */
export function paintSparkle(): HTMLCanvasElement {
  const p = new Pixels(13, 13);
  const c0 = 6;
  for (let k = 1; k <= 6; k++) {
    const c: Color = k <= 2 ? 0xffffff : k <= 4 ? 0xfff1a8 : 0xf2c14e;
    p.set(c0 - k, c0, c);
    p.set(c0 + k, c0, c);
    p.set(c0, c0 - k, c);
    p.set(c0, c0 + k, c);
  }
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    p.set(c0 + dx, c0 + dy, 0xfff6c8);
  }
  p.set(c0, c0, 0xffffff);
  return p.toCanvas();
}

/** 물건 밑에 번지는 은은한 빛. 가운데로 갈수록 진하다. */
export function paintGlow(): HTMLCanvasElement {
  const p = new Pixels(32, 16);
  for (const [rx, ry, a] of [
    [15, 7.5, 40],
    [11, 5.5, 60],
    [7, 3.5, 90],
  ]) {
    p.ellipse(16, 8, rx, ry, 0xfff1a8, a);
  }
  return p.toCanvas();
}

/** 단축키 0번 칸의 메모장: 노란 수첩에 스프링과 줄, 비스듬히 놓인 연필 */
export function paintMemoPadIcon(): HTMLCanvasElement {
  const p = new Pixels(24, 24);
  p.rect(4, 4, 14, 17, 0xf6d860);
  p.rect(4, 4, 14, 3, 0xd8a838);
  for (let x = 6; x < 17; x += 3) {
    p.set(x, 3, 0x8a8f99);
    p.set(x, 4, 0xc8ccd4);
  }
  for (let y = 9; y < 20; y += 3) p.rect(6, y, 10, 1, 0xc9a640);
  for (let k = 0; k < 11; k++) {
    p.set(19 - k, 9 + k, 0xe8913a);
    p.set(20 - k, 9 + k, 0xf4b04e);
  }
  p.set(9, 20, 0x3a2a1a);
  p.set(19, 8, 0xe07a7a);
  p.set(20, 8, 0xe07a7a);
  p.outlineOuter(OUTLINE);
  return p.toCanvas();
}

/** 주운 메모 칸: 접힌 귀퉁이가 있는 쪽지 */
export function paintNoteIcon(): HTMLCanvasElement {
  const p = new Pixels(24, 24);
  p.rect(5, 4, 14, 17, PAPER);
  for (let y = 9; y < 19; y += 3) p.rect(7, y, 10, 1, RULE);
  p.rect(5, 6, 14, 1, 0xe07a7a);
  // 오른쪽 아래 귀퉁이를 접었다: 바깥 삼각형은 비우고 안쪽은 접힌 뒷면 색
  for (let j = 0; j < 5; j++) {
    for (let i = 0; i < 5; i++) {
      if (i + j > 4) p.set(14 + i, 16 + j, 0, 0);
      else if (i + j >= 3) p.set(14 + i, 16 + j, PAPER_SHADE);
    }
  }
  p.outlineOuter(OUTLINE);
  return p.toCanvas();
}
