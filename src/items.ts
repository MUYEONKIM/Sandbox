import { paintPistol } from './art/weapons';
import { BLOCKS, paintBlock, type BlockId } from './blocks';

/** 무기 목록. cooldownMs는 발사 간격, range는 총알이 날아가는 칸 수다. */
export const WEAPONS = {
  pistol: { name: '권총', cooldownMs: 250, range: 10 },
} as const;

export type WeaponId = keyof typeof WEAPONS;
export type ItemId = BlockId | WeaponId;

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

export function isWeapon(id: ItemId): id is WeaponId {
  return Object.hasOwn(WEAPONS, id);
}

export function isItem(id: unknown): id is ItemId {
  return typeof id === 'string' && (Object.hasOwn(BLOCKS, id) || Object.hasOwn(WEAPONS, id));
}

export function itemName(id: ItemId): string {
  return isWeapon(id) ? WEAPONS[id].name : BLOCKS[id].name;
}

export function paintItem(id: ItemId): HTMLCanvasElement {
  return isWeapon(id) ? paintPistol() : paintBlock(id);
}
