import type { CropId } from './farm';

/**
 * 펫(2026-11-28 코드 묶음 7). 그림·움직임은 디자인 세션 12(공유 노트 pets.md), 규칙은 기획 세션 4(docs/balance/pet-care-1127.md).
 * 8종(2026-11-28 7-2에서 갈색 강아지 dog_brown, 강아지 dog는 '황토색 강아지'), 처음 한 마리 무료(한 번 고르면 못 바꿈), 꾸밈만(능력 없음). 서버 profiles.pet과 pet_care가 기준이다(SQL 20261128400000_pets.sql).
 */
export type PetKind = 'dog' | 'cat' | 'rabbit' | 'fox' | 'panda' | 'penguin' | 'blackcat' | 'dog_brown';
/** 그림 시트(public/sprites/pets/pets.png, 얼굴 시트)의 줄 차례 */
export const PET_KINDS: readonly PetKind[] = ['dog', 'cat', 'rabbit', 'fox', 'panda', 'penguin', 'blackcat', 'dog_brown'];
/** 고르는 창에 놓는 차례(pets.md 4절: 검은 고양이는 고양이 옆, 10-8: 강아지 둘이 앞, 4 × 2) */
export const PET_PICK_ORDER: readonly PetKind[] = ['dog', 'dog_brown', 'cat', 'blackcat', 'rabbit', 'fox', 'panda', 'penguin'];
export const PET_NAMES: Record<PetKind, string> = {
  dog: '황토색 강아지',
  cat: '고양이',
  rabbit: '토끼',
  fox: '여우',
  panda: '판다',
  penguin: '펭귄',
  blackcat: '검은 고양이',
  dog_brown: '갈색 강아지',
};

export function isPetKind(value: unknown): value is PetKind {
  return typeof value === 'string' && (PET_KINDS as readonly string[]).includes(value);
}

/** 게임 안 그림 한 칸(pets.json): 34 × 32, 기준점 (17, 23) = 발밑(앉기·자기는 닿는 면). 줄 = 종류, 칸 = 자세 */
export const PET_CELL = { w: 34, h: 32, ax: 17, ay: 23 } as const;
export const PET_FRAMES = [
  'stand',
  'walkA',
  'walkB',
  'standBack',
  'walkABack',
  'walkBBack',
  'sit',
  'sitBack',
  'curl',
  'happy',
  'eat',
  'weak',
  'droop',
  'droopA',
  'droopB',
  'droopBack',
  'droopABack',
  'droopBBack',
] as const;
export type PetFrame = (typeof PET_FRAMES)[number];

export function petFrameIndex(kind: PetKind, frame: PetFrame) {
  return PET_KINDS.indexOf(kind) * PET_FRAMES.length + PET_FRAMES.indexOf(frame);
}

/** 효과 그림(pet-fx.png, [x, y, 너비, 높이], 그림 가운데 아래가 놓는 점) */
export const PET_FX = {
  hand: [0, 0, 8, 7],
  heart: [11, 0, 7, 6],
  bowl: [22, 0, 11, 6],
  bowlEmpty: [33, 0, 11, 6],
  ball: [44, 0, 6, 6],
  sparkle: [55, 0, 5, 5],
} as const;
export type PetFx = keyof typeof PET_FX;

/** 표정(얼굴 시트 칸 차례, faces-soft 160px·faces-pixel 40px). joy는 좋은 일 직후 2초와 큰 화면 */
export const PET_MOODS = ['normal', 'good', 'sulky', 'hungry', 'sleepy', 'lonely', 'joy', 'weak'] as const;
export type PetMood = (typeof PET_MOODS)[number];
/** 다른 사람에게 보내는 기분(joy는 잠깐이라 보내지 않음) */
export type SentMood = Exclude<PetMood, 'joy'>;

export function isSentMood(value: unknown): value is SentMood {
  return typeof value === 'string' && value !== 'joy' && (PET_MOODS as readonly string[]).includes(value);
}

/** 친밀도 다섯 단계(기획 5.1, 정함). 보상은 없다. */
export const PET_STAGES = [
  { name: '낯가림', min: 0 },
  { name: '익숙함', min: 100 },
  { name: '친함', min: 500 },
  { name: '단짝', min: 1500 },
  { name: '가족', min: 3500 },
] as const;

/** 친밀도 → 단계(1~5) */
export function stageOf(bond: number) {
  let stage = 1;
  PET_STAGES.forEach(({ min }, i) => {
    if (bond >= min) stage = i + 1;
  });
  return stage;
}

/** 펫 이름 길이(서버 pet_clean_name: 앞뒤 빈칸을 지운 뒤 1~8자, 제어 문자 안 됨) */
export const PET_NAME_MAX = 8;

/** 이름 칸 글을 서버 규칙대로 다듬는다. 쓸 수 없으면 null */
export function cleanPetName(text: string) {
  const name = text.trim();
  const length = [...name].length;
  return length >= 1 && length <= PET_NAME_MAX && !/[\u0000-\u001f\u007f-\u009f]/.test(name) ? name : null;
}

/** 보이는 이름: 지어 준 이름, 없으면 종류 이름 */
export function petNameOf(kind: PetKind, name: string | null | undefined) {
  return name || PET_NAMES[kind];
}

/** 끝 글자 받침에 따라 조사를 고른다(펭귄이·펭귄을, 강아지가·강아지를). */
export function josa(word: string, plain: string, batchim: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code < 11172 && code % 28 ? batchim : plain;
}

/** 먹이: 펫 간식(상점), 작물(양파 빼고), 말 안 듣는 붕어, 길가의 그냥 풀(토끼·판다만). 서버 pet_food_value와 같다. */
export type PetFood = 'treat' | Exclude<CropId, 'onion'> | 'rebel_carp' | 'roadside_grass';
export const PET_FOODS: readonly PetFood[] = ['treat', 'carrot', 'potato', 'tomato', 'eggplant', 'corn', 'rebel_carp', 'roadside_grass'];
const FAVORITES: Record<PetKind, readonly PetFood[]> = {
  dog: ['potato'],
  dog_brown: ['potato'],
  cat: ['rebel_carp'],
  blackcat: ['rebel_carp'],
  rabbit: ['carrot', 'roadside_grass'],
  fox: ['corn'],
  panda: ['carrot'],
  penguin: ['rebel_carp'],
};

/** 그 펫이 먹는지, 배부름 +값과 좋아하는지(기획 3.3). 먹지 않으면 null */
/** 그 종류가 좋아하는 먹이(서버 pet_food_value와 같은 목록, 상태 창 '좋아하는 음식' 줄) */
export function favoriteFoods(kind: PetKind): readonly PetFood[] {
  return FAVORITES[kind];
}

export function foodValue(kind: PetKind, food: PetFood): { full: number; favorite: boolean } | null {
  if (food === 'treat') return { full: 50, favorite: false };
  if (food === 'roadside_grass' && kind !== 'rabbit' && kind !== 'panda') return null;
  const favorite = FAVORITES[kind].includes(food);
  return { full: favorite ? 30 : 15, favorite };
}

/** 무릎에 오르지 않는 가구(옆 바닥에서 웅크림)와 침대에 오르지 않는 눕는 가구(pets.md 3절, 디자인 세션 12가 정함) */
export const NO_LAP = /^rd_(bike_indoor|toilet|drum_set|rocking_horse|sofa_corner_)/;
export const NO_BED = /^rd_(bathtub|crib)/;
