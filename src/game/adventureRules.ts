/**
 * 모험 규칙(2026-11-17 사용자가 정함, 기획 docs/balance/dungeon-rework.md). 서버 SQL `20261117000000_adventure.sql`과 같은 식이다.
 * 결과는 서버가 정하고, 화면은 이 값으로 창에 값을 보이고 추천 나누기를 센다(이길 확률 칸 색은 2026-11-18 없앰).
 * 숫자와 식은 docs/balance/tools/dungeon-run.js 위쪽 값과 같다(fightOnce, expOf, levelFromExp, dropChance, monster, PER_POINT, START, 무기 고정 수치 flatOf).
 * 바꾸면 그 파일, 서버 SQL(adventure_battle, adventure_power, adventure_buy_slot, adventure_set_auto), 이 파일을 함께 고친다.
 * 몬스터 레벨은 몬스터마다 자료에 있다(adventureMaps.ts, 서버 몬스터 표).
 */

export type AdvStat = 'hp' | 'atk' | 'def' | 'agi' | 'luc';
export const ADV_STATS: readonly AdvStat[] = ['hp', 'atk', 'def', 'agi', 'luc'];
export type AdvStats = Record<AdvStat, number>;

/** 장신구 효과. 서버 adventure_power의 fx와 같은 모양이다. */
export interface AdvFx {
  comboAdd: number;
  comboMax: number;
  critMul: number;
  leech: number;
  /** 버팀 목걸이: [확률, 남기는 체력 비율] */
  endure: [number, number][];
  exp: number;
  gold: number;
  /** 장착 무기(DEF ★4 이상): 받는 피해 줄임 몫 */
  guard?: number;
  /** 장착 무기(LUC ★4 이상): 보통 몬스터 무기 드랍 + 몫 */
  drop?: number;
}
export type AdvPower = AdvStats & { fx: AdvFx };

/** 판 하나의 BP(2026-11-17 모험 손보기, 하루 제한 없음) */
export const BP_RUN = 20;
export const WIN_BP = 1;
export const LOSE_BP = 3;
/** 판 안에서 처음 잡을 때 받는 BP: 지역 보스 +5, 중간 보스 +2(한 판에 보스마다 한 번) */
export const BOSS_BP = 5;
export const MINI_BP = 2;
/** 서버는 직전 전투와 이만큼 떨어져야 전투를 받는다(adventure_battle, 기획 8장). 화면은 조금 더 기다린다. */
export const FIGHT_GAP_MS = 2600;
export const POINTS_PER_LEVEL = 5;
export const START: AdvStats = { hp: 100, atk: 10, def: 0, agi: 0, luc: 0 };
export const PER_POINT: AdvStats = { hp: 5, atk: 1, def: 3, agi: 1, luc: 1 };
/**
 * "추천대로 나누기"(기획 6장): 마을 AGI와 상관없이 HP 3 : ATK 3 : DEF 1 : AGI 1(2026-11-18 기획 결정, 예전은 마을 AGI가 있으면 3 : 3 : 1).
 * 서버 adventure_battle·adventure_set_auto의 저절로 나누기, 계산기 SPLIT과 같다.
 */
export const SPLIT: AdvStats = { hp: 3, atk: 3, def: 1, agi: 1, luc: 0 };
export const MAX_TURNS = 20;
export const MAX_HITS = 5;
export const CRIT_MUL = 2;
/** 콤보·크리티컬 식의 몬스터 레벨 배수(2 → 4, 2026-11-19 사용자 "agi 의 효과를 줄이고 세기는 5%만 낮춘다.", 서버 adventure_battle, 계산기 COMBO_K·CRIT_K) */
const COMBO_K = 4;
const CRIT_K = 4;
export const COMBO_MAX = 0.5;
export const CRIT_MAX = 0.5;
/** 마을 스텟 1 = 그 스텟 모험 포인트 10개(100 → 10, 2026-11-18 사용자 "4. 시작 마을 스텟의 *100 으로 시작하니깐 너무 쉽다. 10배로 줄인다.", 서버 adventure_power) */
export const TOWN_X = 10;
/** 이긴 전투 하나에 가져가는 마을 경험치(기획 8장, 계산기 dungeon-run.js TOWN_EXP_PER_WIN). 4,900 → 5,400(2026-11-18 결과 칸 클릭 규칙 뒤 다시 맞춤, 기획 17장 '결과 칸 클릭 규칙의 안', 사용자 "추천안으로") */
export const TOWN_EXP_PER_WIN = 5400;
/** 판 금화 가운데 마을 골드로 가져가는 몫(0.5 → 1, 2026-11-19 사용자 "가져오는 재화는 100%로 같게하고, 금화를 현재보다 2배로 늘려라.") */
export const TAKE_GOLD = 1;
export const BASE_SLOTS = 2;
export const MAX_SLOTS = 8;
/** 3~8번째 장신구 칸 값(마을 골드) */
export const SLOT_PRICES = [200000, 1000000, 5000000, 25000000, 125000000, 625000000];

export const NO_FX: AdvFx = { comboAdd: 0, comboMax: COMBO_MAX, critMul: CRIT_MUL, leech: 0, endure: [], exp: 0, gold: 0, guard: 0, drop: 0 };

/** 레벨 L, 세기 d인 몬스터 */
export const monster = (L: number, d: number) => ({ hp: d * (30 + 10 * L), atk: d * (5 + 1.5 * L) });
/** 한 번 이긴 판 경험치(40 → 20, 2026-11-19 사용자 "모험에서 얻는 경험치를 지금에서 50%를 줄이거나…", 서버 adventure_battle) */
export const expOf = (L: number) => 20 * (L + 3) ** 2;
// 경험치 줄어듦(예전 expFalloff)은 없앴다: 판 레벨과 상관없이 몬스터 경험치를 다 준다(2026-11-18 사용자 "레벨의 2배가 되더라도, 경험치 못얻거나, 아이템 못얻는건 없다. 무조건 얻는다").
/** 레벨 n까지 쌓인 경험치는 50n(n − 1)이다. */
export const levelFromExp = (e: number) => Math.floor((1 + Math.sqrt(1 + (8 * e) / 100)) / 2);
export const lucGold = (luc: number, L: number) => 1 + (3 * luc) / (luc + 4 * L);
/** 보통 몬스터 무기 드랍(0.02 → 0.002, 2026-11-18 사용자 "전반적으로 드롭률이 너무 높다. 파격적으로 줄여줘.", 서버 adventure_battle). 잡은 보스를 다시 잡을 때는 서버 0.02. */
export const dropChance = (luc: number, L: number) => 0.002 * (1 + luc / (luc + 4 * L));
/**
 * 무기 고정 수치(2026-11-19 사용자 "이대로 (추천)", 기획 10장 '고정 수치'): 고정 포인트 = 그 몫의 % × 2 × 무기 지역의 보스 레벨(무기마다 버림).
 * 서버 adventure_power(numeric으로 정확히 셈)와 끝자리까지 같게 정수로 센다(소수 곱하기의 오차로 버림이 1 어긋나지 않게).
 * 컬렉션 몫 % = ★ × 1% × 가진 수, 장착 몫 % = 무기 행 equipPct × (1 + 0.25 × (가진 수 − 1)) = equipPct × (가진 수 + 3) ÷ 4.
 */
export const FLAT_X = 2;
export const collectionFlat = (star: number, copies: number, bossLevel: number) => Math.floor((star * copies * FLAT_X * bossLevel) / 100);
export const equipFlat = (basePct: number, copies: number, bossLevel: number) =>
  Math.floor((Math.round(basePct * 10000) * (copies + 3) * FLAT_X * bossLevel) / 40000);
/** 판 금화의 기준 칸 레벨(지옥 끝, 계산기 GOLD_REF_L) */
const GOLD_REF_L = 20000;
/** 한 번 이긴 판 금화: 332 × (L ÷ 2만)^0.08 × LUC 배율(166 → 332, 2026-11-19 사용자 "가져오는 재화는 100%로 같게하고, 금화를 현재보다 2배로 늘려라."). 보스·중간 보스는 처음 잡을 때만 5배(151 → 166, 2026-11-18 결과 칸 클릭 규칙 뒤 다시 맞춤, 기획 17장 '결과 칸 클릭 규칙의 안', 사용자 "추천안으로") */
export const runGold = (L: number, luc: number, boss: boolean, pouch = 0) =>
  Math.round(332 * (L / GOLD_REF_L) ** 0.08 * lucGold(luc, L) * (boss ? 5 : 1) * (1 + pouch));
/** 베이스 레벨 = 마을 레벨 ÷ 1,000(버림), 모험 스텟 × (1 + 0.25 × 베이스 레벨) */
export const baseLevel = (townLevel: number) => Math.floor(townLevel / 1000);
export const baseMul = (townLevel: number) => 1 + baseLevel(townLevel) * 0.25;
/** 처음 잡은 지역 보스 수로 열리는 장신구 칸 수(보스 하나에 칸 하나, 여섯째 보스에서 8칸) */
/**
 * 판 레벨 L에서 다음 레벨까지 찬 몫(0~1): 레벨 L에 닿는 경험치는 50·L·(L − 1), 한 레벨은 100·L(levelFromExp, 서버 adventure_battle).
 * 큰 수라 BigInt로 센다. 전투 결과 칸 막대가 쓴다.
 */
export function runExpRatio(level: bigint, exp: bigint) {
  const L = level < 1n ? 1n : level;
  const need = 100n * L;
  let cur = exp - 50n * L * (L - 1n);
  if (cur < 0n) cur = 0n;
  if (cur > need) cur = need;
  return Number((cur * 10000n) / need) / 10000;
}

/**
 * 장착 무기 스텟 몫(기획 19장 '컬렉션 무기 장착', 계산기 EQUIP_STAR_PCT·EQUIP_COPY): ★ × 5% × (1 + 0.25 × 단계). 단계는 같은 무기를 더 얻은 수(copies − 1).
 * 서버는 adventure_weapons.equip_pct(처음 값 ★ × 0.05)를 쓰므로 화면도 무기 행의 equipPct를 받아 이 식에 넣는다.
 */
export const EQUIP_COPY = 0.25;
export const equipPct = (base: number, copies: number) => base * (1 + EQUIP_COPY * Math.max(0, copies - 1));

export const slotCap = (bosses: number) => Math.min(MAX_SLOTS, BASE_SLOTS + bosses);
/** 지금 칸 수에서 다음 칸 값. 더 늘릴 수 없으면 null */
export const slotPrice = (slots: number) => SLOT_PRICES[slots - BASE_SLOTS] ?? null;

/** 계산기와 같은 난수(mulberry32). 칸 색을 셀 때 같은 씨앗이면 같은 값이 나온다. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 전투 하나(서버 adventure_battle, 계산기 fightOnce). 이기면 true. */
export function fightOnce(p: AdvPower, m: { hp: number; atk: number }, L: number, r: () => number) {
  const fx = p.fx;
  const combo = Math.min(fx.comboMax, p.agi / (p.agi + L * COMBO_K) + fx.comboAdd);
  const crit = Math.min(CRIT_MAX, (p.agi + p.luc) / (p.agi + p.luc + L * CRIT_K));
  const hit = ((m.atk * m.atk) / (m.atk + p.def)) * (1 - (fx.guard ?? 0));
  const saves = fx.endure.slice();
  let me = p.hp;
  let mon = m.hp;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let hits = 1;
    while (hits < MAX_HITS && r() < combo) hits++;
    for (let h = 0; h < hits; h++) {
      // 난수를 뽑는 차례도 계산기와 같게 둔다(같은 씨앗이면 계산기와 같은 값).
      const v = 0.9 + 0.2 * r();
      const isCrit = r() < crit;
      const dmg = Math.min(mon, p.atk * v * (isCrit ? fx.critMul : 1));
      mon -= dmg;
      if (mon <= 0) return true;
      if (fx.leech) me = Math.min(p.hp, me + dmg * fx.leech);
    }
    me -= hit * (0.9 + 0.2 * r());
    if (me <= 0) {
      let saved = false;
      let back = 0;
      while (!saved && saves.length) {
        const [chance, frac] = saves.pop()!;
        saved = r() < chance;
        back = frac;
      }
      if (!saved) return false;
      me = Math.max(1, p.hp * back);
    }
  }
  return false;
}

// 이길 확률(winRate, 칸 색)은 2026-11-18 사용자 "이길 확률 같은건 없애라"로 없앴다. fightOnce는 서버·계산기와 같은 식의 기준으로 남긴다(화면은 쓰지 않음).
