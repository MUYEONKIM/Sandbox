import { FORGE_HELD, FORGE_HELD_SIZE, FORGE_ICON_SIZE, FORGE_ICONS, type ForgeIconId, type ForgeWeaponArtId } from './forgeArt';
import { Pixels } from './pixels';
import { sprite } from './sprites';

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
export const MACHINE_GUN_ART: WeaponArt = { size: 24, grip: { x: 7, y: 15 }, paint: paintMachineGun };

/** 대장간 무기의 손에 든 그림: public/sprites/forge/held.png의 32×32 칸 하나(디자인 세션, forgeArt.ts). */
export function forgeHeldArt(id: ForgeWeaponArtId): WeaponArt {
  const { col, grip } = FORGE_HELD[id];
  const size = FORGE_HELD_SIZE;
  return {
    size,
    grip,
    paint() {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      canvas.getContext('2d')!.drawImage(sprite('forge/held'), col * size, 0, size, size, 0, 0, size, size);
      return canvas;
    },
  };
}

/** 대장간 아이콘(무기, 방어구, 두루마리, 장신구): public/sprites/forge/icons.png의 32×32 칸 하나 */
export function paintForgeIcon(id: ForgeIconId) {
  const { col, row } = FORGE_ICONS[id];
  const size = FORGE_ICON_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.getContext('2d')!.drawImage(sprite('forge/icons'), col * size, row * size, size, size, 0, 0, size, size);
  return canvas;
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
