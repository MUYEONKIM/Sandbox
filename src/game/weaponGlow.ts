import type Phaser from 'phaser';
import { GOLD_HELD_SIZE, GOLD_MUZZLE, GOLD_SLASH } from '../art/goldArt';
import { sprite } from '../art/sprites';
import type { WeaponId } from '../items';
import type { DayPhase } from './daylight';
import { isAdventure, MAPS, type MapId } from './maps';
import { isTower } from './tower';

/**
 * 무기 강화 금빛(2026-11-28, 디자인 세션 16 공유 노트 weapon-glow.md): +20~+29 은은, +30 이상 찬란(안 C)과 +30 공격 효과.
 * 그림은 public/sprites/forge/gold-*.png, 칸 자리와 시간은 src/art/goldArt.ts. 그리는 일은 Avatar(avatar.ts)가 한다.
 * 그림은 처음 쓸 때만 GPU에 올린다(아무도 금빛 무기를 들지 않으면 올리지 않음).
 */
export const GOLD_TEXTURES = {
  held: 'gold-held',
  light: 'gold-light',
  slash: 'gold-slash',
  muzzle: 'gold-muzzle',
  bullet: 'gold-bullet',
} as const;
export type GoldTexture = keyof typeof GOLD_TEXTURES;

/** 그림 하나를 처음 쓸 때 등록하고 텍스처 키를 돌려준다. */
export function ensureGold(scene: Phaser.Scene, which: GoldTexture) {
  const key = GOLD_TEXTURES[which];
  if (scene.textures.exists(key)) return key;
  const textures = scene.textures;
  if (which === 'held') textures.addSpriteSheet(key, sprite('forge/gold-held'), { frameWidth: GOLD_HELD_SIZE, frameHeight: GOLD_HELD_SIZE });
  else if (which === 'light') textures.addSpriteSheet(key, sprite('forge/gold-light'), { frameWidth: GOLD_HELD_SIZE, frameHeight: GOLD_HELD_SIZE });
  else if (which === 'slash') textures.addSpriteSheet(key, sprite('forge/gold-slash'), { frameWidth: GOLD_SLASH.size, frameHeight: GOLD_SLASH.size });
  else if (which === 'muzzle') textures.addSpriteSheet(key, sprite('forge/gold-muzzle'), { frameWidth: GOLD_MUZZLE.size, frameHeight: GOLD_MUZZLE.size });
  else textures.addImage(key, sprite('forge/gold-bullet'));
  return key;
}

/** 장면마다 하나: 밤 빛 그림 진하기와 깊이, +30 공격 효과 깊이. GameScene이 맵·시간대가 바뀔 때 고치고 모든 Avatar가 읽는다. */
export interface GoldNight {
  /** 밤 빛 그림(gold-light.png, 가산 혼합) 진하기. 0이면 빛 그림을 숨긴다. */
  strength: number;
  /** 빛 그림 깊이: 밤 덮개 바로 위(고정 등 빛무리와 같음) */
  lightDepth: number;
  /** +30 칼자국·총구 터짐·총알 깊이. 밤 덮개가 있는 밤이면 덮개 위, 아니면 null(사람 곁, 지금 칼자국·총알 자리) */
  fxDepth: number | null;
}

const nights = new WeakMap<Phaser.Scene, GoldNight>();

export function goldNightOf(scene: Phaser.Scene) {
  let night = nights.get(scene);
  if (!night) {
    night = { strength: 0, lightDepth: 0, fxDepth: null };
    nights.set(scene, night);
  }
  return night;
}

/** 시간대 덮개 맵의 빛 그림 진하기(lights.ts 등 빛과 같은 값, weapon-glow.md 4절) */
const PHASE_STRENGTH: Record<DayPhase, number> = { morning: 0, sunset: 0.55, evening: 1, dawn: 0.65 };

/**
 * 맵과 시간대에 맞춰 밤 빛 그림을 고친다(Daylight가 맵에 들어갈 때와 시간대가 바뀔 때 부름).
 * - 시간대 덮개가 있는 바깥 맵(마을 포함): 시간대 진하기, 효과는 밤이면 덮개 위
 * - 지옥 분위기 색(mood) 맵: 늘 1, 효과는 덮개 위
 * - 캠프파이어 맵(늘 밤, 사람에 밤 색을 곱함): 늘 1, 덮개가 없어 효과는 사람 곁
 * - 건물 안·층·모험 맵(덮개 없음)과 전쟁터(어둠 속에서 자리가 드러나지 않게): 0
 */
export function setGoldNight(scene: Phaser.Scene, id: MapId, phase: DayPhase, daylightDepth: number) {
  const info = MAPS[id];
  const night = goldNightOf(scene);
  const camp = id === 'campfire';
  const outdoor = !isTower(id) && !info.dark && !isAdventure(id);
  night.strength = info.mood || camp ? 1 : outdoor ? PHASE_STRENGTH[phase] : 0;
  night.lightDepth = daylightDepth + 0.2;
  night.fxDepth = night.strength > 0 && !camp ? daylightDepth + 0.3 : null;
}

/** 이동 알림·접속 명단에 싣는 손에 든 무기(고른 칸이 무기일 때 종류와 그 자루의 단계, 기본 권총은 0) */
export interface HeldArm {
  kind: WeaponId;
  level: number;
}

export function sameArm(a: HeldArm | null, b: HeldArm | null) {
  return a === b || (!!a && !!b && a.kind === b.kind && a.level === b.level);
}
