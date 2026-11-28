// art-source/weapon-glow/make-glow.cjs가 만드는 파일이다. 손으로 고치지 않는다.
// 무기 강화 금빛 + 30강 이상 화려한 효과 안 C(모두). 그림·움직임·시간은 디자인 세션 16이 정했다(공유 노트 weapon-glow.md 13절).

export type GoldTier = 0 | 1 | 2;
export const GOLD_SOFT_FROM = 20;
export const GOLD_BRIGHT_FROM = 30;
export function goldTier(level: number): GoldTier {
  return level >= GOLD_BRIGHT_FROM ? 2 : level >= GOLD_SOFT_FROM ? 1 : 0;
}

/**
 * 손에 든 그림 public/sprites/forge/gold-held.png, 빛만 gold-light.png(같은 배치, 가산 혼합, 밤에만).
 * 칸 40×40, 프레임 번호 = row × 23 + 칸. 칸 0~2 은은 숨쉬기, 칸 3~22 찬란 20장(모두 다름).
 * grip(x, y)은 칸 안 손잡이(setOrigin(x / 40, y / 40)), tip(tipX, tipY)은 총구·칼끝 바로 앞(총구 터짐 자리).
 */
export const GOLD_HELD_SIZE = 40;
export const GOLD_HELD_COLS = 23;
export const GOLD_HELD = {
  "handgun": {
    "row": 0,
    "x": 16.5,
    "y": 20,
    "tipX": 28,
    "tipY": 17
  },
  "machinegun": {
    "row": 1,
    "x": 15,
    "y": 23,
    "tipX": 32,
    "tipY": 19
  },
  "sniper": {
    "row": 2,
    "x": 15.4,
    "y": 21.7,
    "tipX": 35,
    "tipY": 19
  },
  "shotgun": {
    "row": 3,
    "x": 16.9,
    "y": 19.4,
    "tipX": 33,
    "tipY": 17
  },
  "dagger": {
    "row": 4,
    "x": 17.3,
    "y": 19.7,
    "tipX": 27,
    "tipY": 19
  },
  "sword": {
    "row": 5,
    "x": 15.5,
    "y": 19.1,
    "tipX": 32,
    "tipY": 19
  },
  "greatsword": {
    "row": 6,
    "x": 11.7,
    "y": 19.5,
    "tipX": 33,
    "tipY": 20
  },
  "scimitar": {
    "row": 7,
    "x": 12.4,
    "y": 18.4,
    "tipX": 32,
    "tipY": 18
  },
  "rapier": {
    "row": 8,
    "x": 13.3,
    "y": 19.9,
    "tipX": 33,
    "tipY": 19
  },
  "club": {
    "row": 9,
    "x": 13.7,
    "y": 18.9,
    "tipX": 30,
    "tipY": 19
  },
  "axe": {
    "row": 10,
    "x": 11.5,
    "y": 17.3,
    "tipX": 33,
    "tipY": 17
  }
} as const;
export const GOLD_SOFT_ORDER = [0,1,2,1];
export const GOLD_SOFT_MS = 500;
export const GOLD_BRIGHT_ORDER = [3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22];
export const GOLD_BRIGHT_MS = 100;

/** 아이콘 public/sprites/forge/gold-icons.png(안과 상관없이 같음): 칸 32×32, 줄 = row, 칸 0 은은 · 1 찬란. 기관총만 왼쪽 위 24×24. */
export const GOLD_ICON_SIZE = 32;
export const GOLD_ICON_SMALL: Partial<Record<keyof typeof GOLD_HELD, number>> = { machinegun: 24 };

/** +30 근접 칼자국 public/sprites/forge/gold-slash.png: 칸 64×64 4장, 한 장 50ms. 칸 가운데가 호의 중심, 오른쪽(각도 0)을 가운데로 그림.
 *  avatar.swing의 흰 호 대신 쓴다: 납작하게(scaleY 0.6) 한 컨테이너 안에서 center 각도로 돌린다. 반지름 20, 폭 2.4rad로 지금 호와 같다. */
export const GOLD_SLASH = {"size":64,"radius":20,"arc":2.4,"frames":4,"ms":50};
/** +30 총구 터짐 gold-muzzle.png: 칸 20×20 3장, 한 장 40ms. 기준점 (0.5, 0.5)을 총구(tip)에 두고 무기와 같이 돌리고 뒤집는다. */
export const GOLD_MUZZLE = {"size":20,"frames":3,"ms":40};
/** +30 총알 gold-bullet.png 14×5(오른쪽이 머리). 'bullet' 대신 쓴다. */
export const GOLD_BULLET = { width: 14, height: 5 };
