import type { AdvFx, AdvStat, AdvStats } from '../game/adventureRules';
import { supabase } from './supabase';

/**
 * 모험 서버 함수(SQL 20261117000000_adventure.sql). 결과는 서버가 정하고, 모든 함수가 창에 보일 값(AdvView)을 돌려준다.
 * 골드·레벨·경험치·포인트처럼 커지는 수는 서버가 글자로 보낸다.
 */

/** 중간 보스(기획 11장). idx는 맵 자료 mids 순서(1부터). killed는 한 번이라도 잡았는지. */
export interface AdvMini {
  idx: number;
  name: string;
  level: number;
  strength: number;
  /** 판 금화 배수(평원 금화 방 2) */
  gold: number;
  weapon: string | null;
  killed: boolean;
}

export interface AdvZone {
  /** 지역 id(adv_1~adv_8) */
  id: string;
  name: string;
  /** 지역의 첫 맵(입구 맵 지역 포탈이 가는 곳) */
  map: string;
  /** 지역의 맵들(차례대로, 서버 adventure_maps). 지역 하나가 맵 여럿일 수 있다(2026-11-18 기획 19장 '맵 나누기'). */
  maps: string[];
  strength: number;
  /** 지역 일반 몬스터의 가장 낮은 레벨(입구 맵 포탈 이름표 "Lv 첫 몬스터 ~ 보스") */
  first: number;
  bossLevel: number;
  bossStrength: number;
  open: boolean;
  minis: AdvMini[];
}

export interface AdvItem {
  id: string;
  kind: 'gem' | 'learn' | 'pouch' | 'combo' | 'sharp' | 'leech' | 'endure';
  stat: AdvStat | null;
  tier: number;
  name: string;
  value: number;
  value2: number | null;
  price: string;
  opens: number;
  stack: boolean;
}

/** 컬렉션 무기 정의. art는 adv-weapons.png 칸 번호(글자). zone은 지역 id(adv_1~adv_8), mini는 중간 보스가 주는 무기. */
export interface AdvWeapon {
  id: string;
  name: string;
  art: string;
  star: number;
  stat: AdvStat;
  zone: string;
  boss: boolean;
  mini?: boolean;
  /** 장착하면 그 스텟에 더하는 몫(단계 +0일 때, 단계마다 × (1 + 0.25 × 단계)) */
  equipPct: number;
  /** ★4 이상 특수 효과와 값: crit 크리티컬 피해 +, combo 콤보 +%p(상한도), leech 흡혈, guard 받는 피해 −, drop 무기 드랍 + */
  equipFx: AdvEquipFx | null;
  equipFxValue: number;
}

export type AdvEquipFx = 'crit' | 'combo' | 'leech' | 'guard' | 'drop';

export interface AdvOwned {
  id: number;
  item: string;
  slot: number | null;
  paid: string;
}

export interface AdvPowerView extends AdvStats {
  base: number;
  mul: number;
  town: AdvStats;
  bonus: AdvStats;
  /** 무기 고정 포인트(컬렉션 + 장착, 2026-11-19). 판 포인트·마을 스텟 × 10과 같은 자리에 더해짐 */
  flat: AdvStats;
  /** 낀 보석 고정 포인트(2026-11-19 보석을 % 대신 고정 포인트로). 무기 고정 포인트와 같은 자리에 더해짐 */
  gem?: AdvStats;
  fx: AdvFx;
  /** 장착 무기 효과(서버가 셈). 장착이 없으면 null. flat은 장착 몫 고정 포인트 */
  equip: { weapon: string; stat: AdvStat; pct: number; flat: number; fx: AdvEquipFx | null; value: number } | null;
}

/** 끝난 판의 결과(결과 화면). reason은 끝난 까닭: 'bp' BP가 0이 됨, 'return' 귀환. 가져가는 양은 둘이 같다. */
export interface AdvResult {
  reason: 'bp' | 'return';
  /** 판이 끝난 맵 */
  map: string | null;
  level: string;
  wins: number;
  losses: number;
  exp: string;
  townExp: number;
  gold: string;
  townGold: string;
  drops: string[];
}

export interface AdvView {
  /** 이 판의 BP. 판이 없으면 20(다음 판). 보스를 잡으면 20을 넘을 수 있다. */
  bp: number;
  inRun: boolean;
  /** 이 판이 있는 맵(이어 하기 자리). 판이 없으면 null */
  runMap: string | null;
  /** 이 판에서 BP를 받은 보스('adv_1', 중간 보스는 'adv_2#3') */
  runBosses: string[];
  level: string;
  exp: string;
  points: string;
  spent: Record<AdvStat, string>;
  runGold: string;
  wins: number;
  losses: number;
  drops: string[];
  auto: boolean;
  slots: number;
  mainWeapon: string | null;
  bosses: string[];
  zones: AdvZone[];
  shop: AdvItem[];
  owned: AdvOwned[];
  collection: { weapon: string; copies: number }[];
  power: AdvPowerView;
  townLevel: string;
  townGold: string;
  /** 아직 안 본 끝난 판의 결과. adventure_state가 한 번만 같이 준다(BP 0으로 끝난 판, 새로고침해도 남음). adventure_return은 바로 준다. */
  result?: AdvResult;
  /** 컬렉션 무기 정의. adventure_state만 같이 준다. */
  weapons?: AdvWeapon[];
}

/** 차례 하나: [누구(0 나, 1 몬스터, 2 버팀 목걸이), 피해, 크리티컬(1/0), 내 체력, 몬스터 체력] */
export type AdvTurn = [0 | 1 | 2, number, 0 | 1, number, number];

export interface AdvBattle {
  win: boolean;
  turns: AdvTurn[];
  me: AdvStats;
  /** 싸운 몬스터 자리(adventure_spots). boss는 지역 보스와 중간 보스 모두 true, mini는 중간 보스 번호, bonus는 그 자리 구역 보너스 */
  mon: { map: string; zone: string; x: number; y: number; kind: 'normal' | 'mini' | 'boss' | 'gate'; art: string | null; mini: number | null; bonus: string | null; level: number; boss: boolean; hp: number; atk: number };
  exp: string;
  level: string;
  points: string;
  gold: string;
  drop: string | null;
  /** 떨어진 무기를 이제 몇 개 가졌는지(1이면 새 무기, 2 이상이면 단계가 오름) */
  dropCopies: number;
  firstBoss: boolean;
  firstMini: boolean;
  /** 보스·중간 보스를 처음 잡았는지(판 금화 × 5는 이때만) */
  firstKill: boolean;
  /** 이 전투로 받은 BP(지역 보스 3, 중간 보스 2, 처음 값이고 서버 설정 표 bp_boss·bp_mini가 정함. 이긴 전투의 −1은 따로) */
  bpGain: number;
  /** 이 전투로 BP가 0이 되어 판이 끝났으면 true. 결과는 adventure_state로 받는다. state의 bp는 다음 판 값(20)이다. */
  ended: boolean;
  state: AdvView;
}

/** 실패하면 서버의 오류 글(예: 'no bp', 'too fast', 'not enough gold')이나 'failed'를 돌려준다. */
async function call<T>(name: string, args?: Record<string, unknown>): Promise<T | string> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) return error.message || 'failed';
  return data as T;
}

export const adventureState = () => call<AdvView>('adventure_state');

/**
 * 모험 숫자 설정 표(adventure_tuning, SQL 20261123100000_adventure_tuning.sql, 2026-11-23 사용자 "옮겨"). key → value.
 * 전투는 서버가 이 표로 센다. 화면은 일곱 빛 들판 구역 글의 배수(bonus_*)만 쓴다. 읽지 못하면 null.
 */
export async function adventureTuning(): Promise<Record<string, number> | null> {
  const { data, error } = await supabase.from('adventure_tuning').select('key, value');
  if (error || !data) return null;
  const out: Record<string, number> = {};
  for (const row of data as { key: string; value: number | string }[]) {
    const v = Number(row.value);
    if (Number.isFinite(v)) out[row.key] = v;
  }
  return out;
}
/** 맵 위 몬스터(칸 x, y)와 싸운다. 레벨과 구역 보너스는 서버가 그 자리로 정한다. */
/** 들어가기 탭의 최고 레벨 순위: 위 10명과 내 순위(기록이 없으면 null), 내 닉네임 */
export interface AdvRanking {
  top: { rank: number; name: string; level: string; me: boolean }[];
  me: { rank: number; name: string; level: string } | null;
  name: string | null;
}
export const adventureRanking = () => call<AdvRanking>('adventure_ranking');

/** 전투: 몬스터의 맵과 칸만 보낸다. 레벨·세기·빛·경험치 방은 서버가 몬스터 줄에서 읽는다. */
export const adventureBattle = (map: string, x: number, y: number) => call<AdvBattle>('adventure_battle', { map, x, y });
/** 판을 연다(판 중이면 그대로, 이어 하기) */
export const adventureStart = () => call<AdvView>('adventure_start');
/** 귀환: 판을 끝내고 결과를 바로 받는다 */
export const adventureReturn = () => call<AdvView & { result?: AdvResult }>('adventure_return');
/** 포탈로 맵을 옮긴다(앞으로만) */
export const adventureMove = (target: string) => call<AdvView>('adventure_move', { target });
/** 포인트 나누기. 큰 수는 글자로 보낸다(서버 numeric). */
export const adventureAssign = (points: Record<AdvStat, number | string>) => call<AdvView>('adventure_assign', points);
export const adventureSetAuto = (enabled: boolean) => call<AdvView>('adventure_set_auto', { enabled });
export const adventureBuy = (item: string) => call<AdvView>('adventure_buy', { item });
export const adventureSell = (item: number) => call<AdvView>('adventure_sell', { item });
export const adventureEquip = (slot: number, item: number | null) => call<AdvView>('adventure_equip', { slot, item });
export const adventureBuySlot = () => call<AdvView>('adventure_buy_slot');
/** 무기 장착(가진 것만, null이면 풀기). 다음 전투부터 든다. */
export const adventureEquipWeapon = (weapon: string | null) => call<AdvView>('adventure_equip_weapon', { weapon_id: weapon });
