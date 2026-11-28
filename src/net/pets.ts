import { toGold, type Gold } from '../game/gold';
import { isPetKind, type PetFood, type PetKind } from '../game/pets';
import type { Grade } from '../game/farm';
import { supabase } from './supabase';

/**
 * 펫 서버 함수(SQL 20261128400000_pets.sql). 모두 RPC이고 실시간 알림이 아니다(기획 10.2).
 * 상태 값은 서버가 부른 그때의 값(소수)이고, 화면은 같은 속도로 줄여 보인다(src/game/petCare.ts).
 */
export interface PetServerState {
  pet: PetKind | null;
  /** 지어 준 이름(SQL 20261128500000_pet_names.sql). null이면 종류 이름. 잃은 뒤에도 남아 작별 창에 쓴다. */
  name: string | null;
  lostCount: number;
  lostAt: string | null;
  /** 잃은 펫의 종류(작별 창) */
  lostKind: PetKind | null;
  chances: number;
  rearm: boolean;
  fullness: number;
  energy: number;
  company: number;
  bond: number;
  bestStage: number;
  /** 오늘(한국 시간) 첫 말을 했는지, 첫 쓰다듬기를 했는지 */
  greeted: boolean;
  patted: boolean;
  /** 행동마다 마지막 시각(서버 초) */
  acts: Partial<Record<PetAct, number>>;
  treats: number;
  treatPrice: Gold;
  adoptPrice: Gold;
  /** 서버 지금(ms). 행동 간격을 화면 시계로 바꿀 때 쓴다. */
  now: number;
}

export type PetAct = 'pat' | 'praise' | 'feed' | 'play' | 'talk';
export type PetRefusal = 'soon' | 'zero' | 'tired' | 'full' | 'food';

export interface PetActResult extends PetServerState {
  ok: boolean;
  reason: PetRefusal | null;
  /** 먹이를 먹었으면 쓴 작물 등급(작물만)과 그 먹이의 남은 개수 */
  grade: Grade | null;
  left: number | null;
  favorite: boolean;
  greet: boolean;
  firstPat: boolean;
  rearmed: boolean;
  newStage: number | null;
}

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : fallback);

function parseState(value: unknown): PetServerState | null {
  const d = value as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') return null;
  const acts: Partial<Record<PetAct, number>> = {};
  const rawActs = d.acts as Record<string, unknown> | null;
  if (rawActs && typeof rawActs === 'object') {
    for (const act of ['pat', 'praise', 'feed', 'play', 'talk'] as const) if (rawActs[act] !== undefined) acts[act] = num(rawActs[act]);
  }
  return {
    pet: isPetKind(d.pet) ? d.pet : null,
    name: typeof d.name === 'string' && d.name !== '' ? d.name : null,
    lostCount: num(d.lostCount),
    lostAt: typeof d.lostAt === 'string' ? d.lostAt : null,
    lostKind: isPetKind(d.lostKind) ? d.lostKind : null,
    chances: num(d.chances, 2),
    rearm: d.rearm !== false,
    fullness: num(d.fullness, 100),
    energy: num(d.energy, 100),
    company: num(d.company, 100),
    bond: num(d.bond),
    bestStage: num(d.bestStage, 1),
    greeted: d.greeted === true,
    patted: d.patted === true,
    acts,
    treats: num(d.treats),
    treatPrice: toGold(d.treatPrice ?? '200'),
    adoptPrice: toGold(d.adoptPrice ?? '1000000'),
    now: num(d.now, Date.now()),
  };
}

/** 지금 값. 서버에 펫 함수가 아직 없거나 실패하면 null(펫 화면을 띄우지 않음). */
export async function petState(): Promise<PetServerState | null> {
  const { data, error } = await supabase.rpc('pet_state');
  return error ? null : parseState(data);
}

/** 돌보기 하나. 펫이 없으면 'no pet', 그 밖의 실패는 'failed' */
export async function petAct(act: PetAct, food?: PetFood): Promise<PetActResult | 'no pet' | 'failed'> {
  const { data, error } = await supabase.rpc('pet_act', food ? { act, food } : { act });
  if (error) return error.message.includes('no pet') ? 'no pet' : 'failed';
  const state = parseState(data);
  if (!state) return 'failed';
  const d = data as Record<string, unknown>;
  const reason = d.reason;
  return {
    ...state,
    ok: d.ok === true,
    reason: reason === 'soon' || reason === 'zero' || reason === 'tired' || reason === 'full' || reason === 'food' ? reason : null,
    grade: d.grade === 'normal' || d.grade === 'praise' || d.grade === 'blame' ? d.grade : null,
    left: d.left === null || d.left === undefined ? null : num(d.left),
    favorite: d.favorite === true,
    greet: d.greet === true,
    firstPat: d.firstPat === true,
    rearmed: d.rearmed === true,
    newStage: d.newStage === null || d.newStage === undefined ? null : num(d.newStage),
  };
}

/** 10분에 한 번: 걸은 칸, 쉰 초, 그 가운데 캠프파이어 곁 초 */
export async function petTick(walked: number, restS: number, campS: number): Promise<(PetServerState & { newStage: number | null }) | null> {
  const { data, error } = await supabase.rpc('pet_tick', { walked, rest_s: restS, camp_s: campS });
  if (error) return null;
  const state = parseState(data);
  if (!state) return null;
  const n = (data as Record<string, unknown>).newStage;
  return { ...state, newStage: n === null || n === undefined ? null : num(n) };
}

/** 처음 한 마리(무료)와 이름. 이미 정했으면 'already', 잃은 적이 있으면 'adopt', 쓸 수 없는 이름이면 'bad name' */
export async function setPet(kind: PetKind, name: string): Promise<PetServerState | 'already' | 'adopt' | 'bad name' | 'failed'> {
  const { data, error } = await supabase.rpc('set_pet', { p: kind, pet_name: name });
  if (error) {
    const m = error.message;
    return m.includes('already') ? 'already' : m.includes('bad name') ? 'bad name' : m.includes('adopt') ? 'adopt' : 'failed';
  }
  return parseState(data) ?? 'failed';
}

/** 입양(잃은 뒤에만, 골드)과 이름. 펫이 있으면 'has pet', 골드가 모자라면 'gold', 쓸 수 없는 이름이면 'bad name' */
export async function adoptPet(kind: PetKind, name: string): Promise<{ state: PetServerState; gold: Gold } | 'has pet' | 'first' | 'gold' | 'bad name' | 'failed'> {
  const { data, error } = await supabase.rpc('adopt_pet', { p: kind, pet_name: name });
  if (error) {
    const m = error.message;
    return m.includes('has pet') ? 'has pet' : m.includes('first') ? 'first' : m.includes('bad name') ? 'bad name' : m.includes('gold') ? 'gold' : 'failed';
  }
  const state = parseState(data);
  if (!state) return 'failed';
  return { state, gold: toGold((data as Record<string, unknown>).gold) };
}

/** 이름 바꾸기(값 없음). 펫이 없으면 'no pet', 쓸 수 없는 이름이면 'bad name' */
export async function renamePet(name: string): Promise<PetServerState | 'no pet' | 'bad name' | 'failed'> {
  const { data, error } = await supabase.rpc('rename_pet', { pet_name: name });
  if (error) {
    const m = error.message;
    return m.includes('bad name') ? 'bad name' : m.includes('no pet') ? 'no pet' : 'failed';
  }
  return parseState(data) ?? 'failed';
}

/** 펫 간식 사기(1~100개) */
export async function buyPetTreats(amount: number): Promise<{ gold: Gold; count: number } | 'gold' | 'failed'> {
  const { data, error } = await supabase.rpc('buy_pet_treats', { amount });
  if (error) return error.message.includes('not enough gold') ? 'gold' : 'failed';
  const d = data as Record<string, unknown>;
  return { gold: toGold(d.gold), count: num(d.count) };
}

