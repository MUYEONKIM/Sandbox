import { Pixels } from './pixels';

/** 무기 그림. 오른쪽을 향한 정사각형 캔버스에 그리고, grip은 손으로 잡는 위치다. */
export interface WeaponArt {
  size: number;
  grip: { x: number; y: number };
  paint(): HTMLCanvasElement;
}

const OUTLINE = 0x1f1a24;

function paintPistol() {
  const p = new Pixels(16, 16);
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
  p.outlineOuter(OUTLINE);
  return p.toCanvas();
}

function paintSword() {
  const p = new Pixels(24, 24);
  p.rect(8, 11, 13, 3, 0xc9d1d9);
  p.rect(8, 11, 13, 1, 0xf4f7fa);
  p.rect(8, 13, 13, 1, 0x7f8a96);
  p.rect(21, 12, 2, 1, 0xf4f7fa);
  p.rect(6, 8, 2, 9, 0xe0b23c);
  p.rect(6, 8, 1, 9, 0xf7d774);
  p.rect(3, 11, 3, 3, 0x6b4628);
  p.rect(3, 11, 3, 1, 0x9c6c3f);
  p.rect(1, 10, 2, 5, 0xe0b23c);
  p.outlineOuter(OUTLINE);
  return p.toCanvas();
}

function paintMachineGun() {
  const p = new Pixels(24, 24);
  p.rect(1, 10, 4, 4, 0x6b4628);
  p.rect(1, 10, 4, 1, 0x9c6c3f);
  p.rect(5, 9, 10, 6, 0x4a4f5a);
  p.rect(5, 9, 10, 1, 0x8a9099);
  p.rect(5, 14, 10, 1, 0x2b2f38);
  p.rect(15, 10, 6, 2, 0x3a3f48);
  p.rect(15, 10, 6, 1, 0x6f7480);
  p.rect(21, 9, 2, 4, 0x2b2430);
  p.rect(6, 15, 3, 5, 0x6b4628);
  p.rect(10, 15, 4, 6, 0x2f5a35);
  p.rect(10, 15, 4, 1, 0x4f8a55);
  p.outlineOuter(OUTLINE);
  return p.toCanvas();
}

export const PISTOL_ART: WeaponArt = { size: 16, grip: { x: 5, y: 9 }, paint: paintPistol };
export const SWORD_ART: WeaponArt = { size: 24, grip: { x: 4, y: 12 }, paint: paintSword };
export const MACHINE_GUN_ART: WeaponArt = { size: 24, grip: { x: 7, y: 15 }, paint: paintMachineGun };

/** 날아가는 총알. 진행 방향으로 돌려서 그린다. */
export function paintBullet(): HTMLCanvasElement {
  const p = new Pixels(8, 3);
  p.rect(0, 1, 3, 1, 0xff9a3c);
  p.rect(3, 1, 3, 1, 0xffd84d);
  p.rect(5, 0, 2, 3, 0xffd84d);
  p.rect(6, 1, 2, 1, 0xffffff);
  return p.toCanvas();
}
