import { BASE_HP } from '../config';

export const STAT_IDS = ['str', 'def', 'agi', 'luk', 'hp'] as const;

export type StatId = (typeof STAT_IDS)[number];

export function isStat(id: unknown): id is StatId {
  return STAT_IDS.includes(id as StatId);
}

/** HP 스텟 포인트로 최대 체력을 구한다. 서버는 최대 체력을 profiles.max_hp에 그대로 둔다. */
export const maxHpOf = (points: number) => BASE_HP + points;

/** 1포인트의 효과는 0.1%다. DEF와 AGI는 이 값으로 점점 완만해진다. */
const SCALE = 1000;
const MAX_DODGE = 0.6;
/** LUK 1포인트는 자원 개수 평균 +0.5%다(2026-11-11 사용자 요청). 서버 harvest의 0.005와 같다. */
const LUK_RATE = 0.005;

const percent = (ratio: number) => `${Number((ratio * 100).toFixed(1))}%`;

/** 아이티공간에 보여 줄 스텟 효과. 실제 계산은 서버의 hit_player와 harvest가 하므로 공식을 바꾸면 함께 바꾼다. */
export function statEffect(id: StatId, value: number) {
  switch (id) {
    case 'str':
      return `주는 피해 +${percent(value / SCALE)}`;
    case 'def':
      return `받는 피해 -${percent(value / (value + SCALE))}`;
    case 'agi':
      return `확률 ${percent(Math.min(MAX_DODGE, value / (value + SCALE)))}`;
    case 'luk':
      return `평균 +${percent(value * LUK_RATE)}`;
    case 'hp':
      return `최대 HP ${maxHpOf(value)}`;
  }
}
