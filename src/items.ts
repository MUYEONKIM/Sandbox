import { MACHINE_GUN_ART, PISTOL_ART, SWORD_ART, type WeaponArt } from './art/weapons';
import { BLOCKS, paintBlockIcon, type BlockId } from './blocks';

export type WeaponId = 'pistol' | 'sword' | 'machinegun';
export type ItemId = BlockId | WeaponId;

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
  return isWeapon(id) || (typeof id === 'string' && Object.hasOwn(BLOCKS, id));
}

export function itemName(id: ItemId): string {
  return isWeapon(id) ? WEAPONS[id].name : BLOCKS[id].name;
}

export function paintItem(id: ItemId): HTMLCanvasElement {
  return isWeapon(id) ? WEAPONS[id].art.paint() : paintBlockIcon(id);
}
