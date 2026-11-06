import { Pixels } from './pixels';

/** 점프하는 동안 땅에 남는 그림자 */
export function paintJumpShadow(): HTMLCanvasElement {
  const p = new Pixels(20, 10);
  p.ellipse(10, 5, 9, 4.5, 0x1a2a1a, 90);
  return p.toCanvas();
}

/** 대시할 때 발밑에서 피어오르는 작은 하얀 연기 한 덩이 */
export function paintSmoke(): HTMLCanvasElement {
  const p = new Pixels(9, 9);
  p.ellipse(4.5, 4.5, 4.5, 4, 0xd8dde2, 170);
  p.ellipse(4, 4, 3.4, 3, 0xf2f4f6, 210);
  p.ellipse(3.5, 3.2, 1.8, 1.6, 0xffffff, 240);
  return p.toCanvas();
}
