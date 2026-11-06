import { Pixels } from './pixels';

export const PISTOL_SIZE = 16;
/** 권총 그림에서 손으로 잡는 위치 */
export const PISTOL_GRIP = { x: 5, y: 9 };

/** 총구가 오른쪽을 향한 권총 */
export function paintPistol(): HTMLCanvasElement {
  const p = new Pixels(PISTOL_SIZE, PISTOL_SIZE);
  p.rect(2, 4, 13, 4, 0x6f7480);
  p.rect(2, 4, 13, 1, 0xb7bcc2);
  p.rect(2, 7, 13, 1, 0x4a4f5a);
  p.rect(13, 5, 2, 2, 0x2b2430);
  p.rect(3, 8, 4, 6, 0x6b4628);
  p.rect(3, 8, 1, 6, 0x9c6c3f);
  p.rect(6, 8, 1, 6, 0x4a3020);
  p.rect(7, 8, 4, 1, 0x3a3f48);
  p.rect(10, 8, 1, 2, 0x3a3f48);
  p.rect(7, 10, 4, 1, 0x3a3f48);
  p.outlineOuter(0x1f1a24);
  return p.toCanvas();
}

/** 날아가는 총알. 진행 방향으로 돌려서 그린다. */
export function paintBullet(): HTMLCanvasElement {
  const p = new Pixels(8, 3);
  p.rect(0, 1, 3, 1, 0xff9a3c);
  p.rect(3, 1, 3, 1, 0xffd84d);
  p.rect(5, 0, 2, 3, 0xffd84d);
  p.rect(6, 1, 2, 1, 0xffffff);
  return p.toCanvas();
}
