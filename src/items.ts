import { forgeHeldArt, MACHINE_GUN_ART, paintForgeIcon, PISTOL_ART, type WeaponArt } from './art/weapons';
import type { ForgeIconId } from './art/forgeArt';
import { sprite } from './art/sprites';
import { BLOCKS, paintBlockIcon, type BlockId } from './blocks';
import { CROP_ART, CROP_CELL } from './game/cropArt';
import { CROP_IDS, type CropId } from './game/farm';

/**
 * 무기 종류(2026-11-16 대장간 배포, docs/balance/weapons.md 6장). id는 서버 weapons 표와 같다.
 * 기본 권총(pistol) 말고는 자루마다 서버 gear 표에 한 줄이고 강화 단계가 있다. 검은 id를 그대로 두고 이름만 장검이 됐다.
 */
export type WeaponId =
  | 'pistol'
  | 'handgun'
  | 'machinegun'
  | 'sniper'
  | 'shotgun'
  | 'dagger'
  | 'sword'
  | 'greatsword'
  | 'scimitar'
  | 'rapier'
  | 'club'
  | 'axe';
/** 가진 자루 하나. 단축키 칸에는 서버 gear 표의 id로 'gear:<id>'를 넣는다. */
export type GearRef = `gear:${number}`;
/** 체력 포션(2026-11-15 사용자 요청). id는 서버 potions 표와 같다. 회복량과 값은 그 표가 기준이다. */
export type PotionId = 'potion_small' | 'potion_medium' | 'potion_large';
/** 농장 씨앗(2026-11-15). 심을 작물 id 앞에 seed_를 붙인다. 가진 개수는 서버 farm_stock이 센다. */
export type SeedId = `seed_${CropId}`;
export type ItemId = BlockId | WeaponId | GearRef | PotionId | SeedId;

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

export function isGearRef(id: unknown): id is GearRef {
  return typeof id === 'string' && /^gear:[1-9]\d{0,15}$/.test(id);
}

export function gearRef(id: number): GearRef {
  return `gear:${id}`;
}

export function gearIdOf(ref: GearRef) {
  return Number(ref.slice(5));
}

/** 바닥에 놓는 것(블록, 꾸미기, 가구)인지 */
export function isBlockItem(id: ItemId): id is BlockId {
  return !isWeapon(id) && !isGearRef(id) && !isPotion(id) && !isSeed(id);
}

interface Weapon {
  name: string;
  /** 닿는 거리 (칸) */
  range: number;
  art: WeaponArt;
  /** 인벤토리·대장간 아이콘(forge/icons.png 칸). 없으면 손에 든 그림을 쓴다. */
  icon?: ForgeIconId;
  /** 총알 없이 앞쪽을 벤다. */
  melee?: boolean;
  /** 근접 무기가 베는 폭 (도). 조준한 방향에서 이 폭 안에 있어야 벤다. */
  arc?: number;
  /** 누르고 있으면 계속 쏜다. */
  auto?: boolean;
  /** 총알이 좌우로 흩어지는 폭 (라디안) */
  spread?: number;
  /** 산탄: 한 번에 퍼지는 부채꼴의 폭 (라디안). 알 수는 서버 weapons.pellets다. */
  fan?: number;
}

const DEG = Math.PI / 180;

/**
 * 무기 목록(weapons.md 6장). 가격, 피해량, 발사 간격, 탄창, 재장전, 알 수는 DB의 weapons 표가 기준이다.
 * 사거리, 베는 폭, 흩어짐은 화면만 쓴다(서버는 맞았다는 것만 받는다).
 */
export const WEAPONS: Record<WeaponId, Weapon> = {
  pistol: { name: '기본 권총', range: 10, art: PISTOL_ART },
  handgun: { name: '대형 권총', range: 10, art: forgeHeldArt('handgun'), icon: 'handgun' },
  machinegun: { name: '기관총', range: 9, art: MACHINE_GUN_ART, auto: true, spread: 0.12 },
  sniper: { name: '저격총', range: 20, art: forgeHeldArt('sniper'), icon: 'sniper' },
  shotgun: { name: '산탄총', range: 5, art: forgeHeldArt('shotgun'), icon: 'shotgun', fan: 29 * DEG },
  dagger: { name: '단검', range: 1, art: forgeHeldArt('dagger'), icon: 'dagger', melee: true, arc: 40 },
  sword: { name: '장검', range: 2, art: forgeHeldArt('longsword'), icon: 'longsword', melee: true, arc: 45 },
  greatsword: { name: '대검', range: 2, art: forgeHeldArt('greatsword'), icon: 'greatsword', melee: true, arc: 60 },
  scimitar: { name: '곡도', range: 2, art: forgeHeldArt('scimitar'), icon: 'scimitar', melee: true, arc: 50 },
  rapier: { name: '세검', range: 3, art: forgeHeldArt('rapier'), icon: 'rapier', melee: true, arc: 15 },
  club: { name: '둔기', range: 1, art: forgeHeldArt('club'), icon: 'club', melee: true, arc: 45 },
  axe: { name: '도끼', range: 2, art: forgeHeldArt('axe'), icon: 'axe', melee: true, arc: 30 },
};

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

export function isWeapon(id: unknown): id is WeaponId {
  return typeof id === 'string' && Object.hasOwn(WEAPONS, id);
}

export function isItem(id: unknown): id is ItemId {
  return isWeapon(id) || isGearRef(id) || isPotion(id) || isSeed(id) || (typeof id === 'string' && Object.hasOwn(BLOCKS, id));
}

/** 이름. 자루('gear:<id>')는 단계를 알아야 해서 Inventory.nameOf를 쓴다. */
export function itemName(id: ItemId): string {
  if (isWeapon(id)) return WEAPONS[id].name;
  if (isGearRef(id)) return '무기';
  if (isPotion(id)) return POTIONS[id].name;
  if (isSeed(id)) return `${SEED_NAMES[cropOfSeed(id)]} 씨앗`;
  return BLOCKS[id].name;
}

/** 무기 아이콘: 대장간 무기는 forge/icons.png 칸, 기본 권총과 기관총은 손에 든 그림 그대로 */
export function paintWeaponIcon(id: WeaponId) {
  const { icon, art } = WEAPONS[id];
  return icon ? paintForgeIcon(icon) : art.paint();
}

/** 아이콘 그림. 자루는 그 종류의 아이콘이다(Inventory.iconKey로 종류를 받는다). */
export function paintItem(id: Exclude<ItemId, GearRef>): HTMLCanvasElement {
  if (isWeapon(id)) return paintWeaponIcon(id);
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
