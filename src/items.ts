import { MACHINE_GUN_ART, PISTOL_ART, SWORD_ART, type WeaponArt } from './art/weapons';
import { sprite } from './art/sprites';
import { BLOCKS, paintBlockIcon, type BlockId } from './blocks';
import { CROP_ART, CROP_CELL } from './game/cropArt';
import { CROP_IDS, type CropId } from './game/farm';

export type WeaponId = 'pistol' | 'sword' | 'machinegun';
/** 체력 포션(2026-11-15 사용자 요청). id는 서버 potions 표와 같다. 회복량과 값은 그 표가 기준이다. */
export type PotionId = 'potion_small' | 'potion_medium' | 'potion_large';
/** 농장 씨앗(2026-11-15). 심을 작물 id 앞에 seed_를 붙인다. 가진 개수는 서버 farm_stock이 센다. */
export type SeedId = `seed_${CropId}`;
export type ItemId = BlockId | WeaponId | PotionId | SeedId;

export const SEED_IDS = CROP_IDS.map((crop) => `seed_${crop}` as SeedId);
const SEED_NAMES: Record<CropId, string> = { carrot: '당근', potato: '감자', onion: '양파', tomato: '토마토', eggplant: '가지', corn: '옥수수' };

export function isSeed(id: unknown): id is SeedId {
  return typeof id === 'string' && (SEED_IDS as string[]).includes(id);
}

export function cropOfSeed(id: SeedId) {
  return id.slice(5) as CropId;
}

/** 포션 이름과 그림(public/sprites/potions, 사용자가 준 newassets/포션에서 고름) */
export const POTIONS: Record<PotionId, { name: string; icon: 'potions/small' | 'potions/medium' | 'potions/large' }> = {
  potion_small: { name: '작은 체력 포션', icon: 'potions/small' },
  potion_medium: { name: '체력 포션', icon: 'potions/medium' },
  potion_large: { name: '큰 체력 포션', icon: 'potions/large' },
};

export const POTION_IDS = Object.keys(POTIONS) as PotionId[];

export function isPotion(id: unknown): id is PotionId {
  return typeof id === 'string' && Object.hasOwn(POTIONS, id);
}

/** 바닥에 놓는 것(블록, 꾸미기, 가구)인지 */
export function isBlockItem(id: ItemId): id is BlockId {
  return !isWeapon(id) && !isPotion(id) && !isSeed(id);
}

interface Weapon {
  name: string;
  /** 닿는 거리 (칸) */
  range: number;
  art: WeaponArt;
  /** 총알 없이 앞쪽을 벤다. */
  melee?: boolean;
  /** 누르고 있으면 계속 쏜다. */
  auto?: boolean;
  /** 총알이 좌우로 흩어지는 폭 (라디안) */
  spread?: number;
}

/** 무기 목록. 가격, 피해량, 발사 간격은 DB의 weapons 표가 기준이다. */
export const WEAPONS: Record<WeaponId, Weapon> = {
  pistol: { name: '권총', range: 10, art: PISTOL_ART },
  sword: { name: '검', range: 2.2, art: SWORD_ART, melee: true },
  machinegun: { name: '기관총', range: 9, art: MACHINE_GUN_ART, auto: true, spread: 0.12 },
};

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

export function isWeapon(id: unknown): id is WeaponId {
  return typeof id === 'string' && Object.hasOwn(WEAPONS, id);
}

export function isItem(id: unknown): id is ItemId {
  return isWeapon(id) || isPotion(id) || isSeed(id) || (typeof id === 'string' && Object.hasOwn(BLOCKS, id));
}

export function itemName(id: ItemId): string {
  if (isWeapon(id)) return WEAPONS[id].name;
  if (isPotion(id)) return POTIONS[id].name;
  if (isSeed(id)) return `${SEED_NAMES[cropOfSeed(id)]} 씨앗`;
  return BLOCKS[id].name;
}

export function paintItem(id: ItemId): HTMLCanvasElement {
  if (isWeapon(id)) return WEAPONS[id].art.paint();
  if (isSeed(id)) {
    // 씨앗 그림은 그 작물의 다 자란 모습(마지막 장)이다.
    const art = CROP_ART[cropOfSeed(id)];
    const canvas = document.createElement('canvas');
    canvas.width = CROP_CELL.width;
    canvas.height = CROP_CELL.height;
    const sx = (art.frames - 1) * CROP_CELL.width;
    const sy = art.row * CROP_CELL.height;
    canvas.getContext('2d')!.drawImage(sprite('farm/crops'), sx, sy, CROP_CELL.width, CROP_CELL.height, 0, 0, CROP_CELL.width, CROP_CELL.height);
    return canvas;
  }
  if (isPotion(id)) {
    const image = sprite(POTIONS[id].icon);
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    return canvas;
  }
  return paintBlockIcon(id);
}
