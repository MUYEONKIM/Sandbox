import { isAdventure, MAPS, type MapId } from '../game/maps';
import { WEAPONS, type WeaponId } from '../items';
import { isCurtain, isOff, type BlockId } from '../blocks';

/**
 * 소리 목록(2026-11-27). 파일은 public/sound/bgm/, public/sound/sfx/ 아래에 두고 file에 이름을 적는다.
 * file이 없는 소리는 부르더라도 아무것도 하지 않는다(파일이 오기 전의 빈 소리).
 * 이름(키)과 붙는 자리는 공유 노트 sound-plan.md 1절(BGM), 3절(효과음)을 따른다.
 */
/** 곡마다 코드에서 더 곱할 크기(0~1). 파일 이름과 반복 구간은 public/sound/bgm/bgm.json이 정한다(곡을 다시 만들면 바뀜). */
export interface BgmDef {
  volume?: number;
}

/**
 * 효과음 규칙(sound-plan.md 3-4·3-5 표). 소리 크기는 파일이 등급대로 맞춰 나오므로 코드에서 곱하지 않는다.
 */
export interface SfxDef {
  /** 같은 키(group이면 묶음)가 동시에 이만큼이면 새 소리를 버린다('동시 N') */
  max?: number;
  /** 같은 키가 이 ms 안에 또 오면 버린다('간격 Nms') */
  gap?: number;
  /** 남의 것이 들리는 칸 수. 없으면 남의 것은 내지 않는다('안 남') */
  range?: number;
  /** 겹침을 함께 세는 묶음(발소리 여섯, 총 넷, 작업 셋, 휘두르기 둘) */
  group?: string;
  /** 사람마다 1: 같은 사람의 새 소리가 앞 소리를 끊는다 */
  perWho?: boolean;
  /** 내 것만, 남의 것만 동시 수(총: 내 것 2, 남 6. 남 발소리 3, 남 작업 4) */
  mineMax?: number;
  othersMax?: number;
  /** 같은 사람 간격(ms, 총 40) */
  whoGap?: number;
  /** 남의 것만 간격(ms, 남이 나타나고 사라질 때 포탈 3000) */
  otherGap?: number;
  /** 남의 것 추가 배율(포탈 ×0.5) */
  otherScale?: number;
  /** 낼 때마다 빠르기를 0.95~1.05에서 고른다(자주 나는 소리) */
  vary?: boolean;
}

/** 받을 효과음 묶음(public/sound/sfx/<이름>.json + 그 안 resources). 0.65MB를 넘으면 도박장·대장간 몫을 sfx_more로 나눈다(3-2). */
export const SFX_SPRITES: readonly string[] = ['sfx'];

const STEP: SfxDef = { group: 'step', perWho: true, range: 6, othersMax: 3, vary: true };
const GUN: SfxDef = { group: 'gun', mineMax: 2, othersMax: 6, whoGap: 40, range: 16, vary: true };
const STRIKE: SfxDef = { group: 'strike', perWho: true, range: 10, othersMax: 4, vary: true };
const SWING: SfxDef = { group: 'swing', perWho: true, range: 12 };
const ONE: SfxDef = { max: 1 };

/** sound-plan.md 3-5 효과음 92가지(발소리는 셋씩이라 키 96개, sell은 2026-11-27에 빠짐) */
const SFX_LIST = {
  // 이동
  step_grass_1: STEP,
  step_grass_2: STEP,
  step_grass_3: STEP,
  step_floor_1: STEP,
  step_floor_2: STEP,
  step_floor_3: STEP,
  jump: { group: 'jump', perWho: true, range: 8 },
  land: { group: 'land', perWho: true, range: 8 },
  portal: { max: 1, range: 10, otherScale: 0.5, otherGap: 3000 },
  elevator: ONE,
  secret: ONE,
  door_open: { whoGap: 600, range: 10 },
  door_close: { whoGap: 600, range: 10 },
  sit: { perWho: true, range: 8 },
  down: { perWho: true, range: 12 },
  respawn: ONE,
  // 짓기와 방
  block_place: { max: 3, gap: 40, range: 12 },
  block_remove: { max: 3, gap: 40, range: 12 },
  switch_on: { gap: 100, range: 10 },
  switch_off: { gap: 100, range: 10 },
  curtain: { gap: 300, range: 10 },
  box_open: ONE,
  box_close: ONE,
  torch_on: { group: 'torch', perWho: true, range: 10 },
  torch_off: { group: 'torch', perWho: true, range: 10 },
  // 작업
  strike_stone: STRIKE,
  strike_wood: STRIKE,
  strike_gather: STRIKE,
  fish_cast: { perWho: true, range: 10 },
  fish_bite: ONE,
  resource_get: { gap: 300 },
  resource_rare: { max: 1, range: 12 },
  plant: { gap: 80, range: 10 },
  crop_harvest: { gap: 80, range: 10 },
  // 필드 전투(전쟁터·던전)
  gun_pistol: GUN,
  gun_mg: GUN,
  gun_sniper: { ...GUN, range: 20 },
  gun_shotgun: GUN,
  swing_light: SWING,
  swing_heavy: SWING,
  reload_out: ONE,
  reload_in: ONE,
  bullet_wall: { max: 4, gap: 60, range: 8 },
  hit_me: { gap: 80, vary: true },
  hit_other: { max: 4, gap: 40, range: 12, vary: true },
  dodge: { gap: 100, range: 10 },
  potion: { perWho: true, range: 8 },
  kill: ONE,
  monster_attack: { max: 3, gap: 60, range: 12 },
  monster_die: { max: 3, range: 12 },
  gold_drop: { gap: 150, range: 10 },
  pickup: { gap: 100 },
  paper: ONE,
  // 모험 전투
  battle_start: ONE,
  battle_boss: ONE,
  adv_hit: { max: 2, gap: 60, vary: true },
  adv_crit: { max: 1, vary: true },
  adv_hurt: { max: 2, gap: 60, vary: true },
  adv_heal: ONE,
  battle_win: ONE,
  battle_lose: ONE,
  level_tick: { gap: 50 },
  item_drop: { max: 2 },
  boss_clear: ONE,
  run_dead: ONE,
  run_home: ONE,
  equip: { gap: 100 },
  stat_up: { gap: 60 },
  // 돈과 가게
  gold_get: { gap: 150 },
  gold_big: ONE,
  buy: { gap: 100 },
  deny: { gap: 2000 },
  anvil: { max: 2 },
  forge_success: ONE,
  forge_keep: ONE,
  forge_drop: ONE,
  forge_break: ONE,
  chip: { gap: 80 },
  bowl_shake: ONE,
  bowl_lift: ONE,
  marble: { gap: 60 },
  ladder_open: ONE,
  ladder_run: ONE,
  race_start: ONE,
  race_finish: ONE,
  casino_win: ONE,
  casino_lose: ONE,
  // 성장과 알림
  level_up: ONE,
  notice: { gap: 1500 },
  disconnect: { gap: 5000 },
  // 화면
  ui_click: { gap: 30 },
  ui_tab: { gap: 30 },
  ui_open: { gap: 100 },
  ui_close: { gap: 100 },
  chat_send: { gap: 200 },
  chat_get: { gap: 1000 },
} satisfies Record<string, SfxDef>;

export type SfxKey = keyof typeof SFX_LIST;
export const SFX: Record<SfxKey, SfxDef> = SFX_LIST;

/** sound-plan.md 1절 BGM 14곡의 이름. 파일·반복 구간은 public/sound/bgm/bgm.json(사운드 세션 1이 만듦)을 읽는다. */
const BGM_LIST = {
  village_day: {},
  village_night: {},
  fields: {},
  indoor: {},
  casino: {},
  battlefield: {},
  adv_gate: {},
  adv_wild: {},
  adv_fire: {},
  adv_sky: {},
  adv_deep: {},
  adv_ruin: {},
  boss: {},
  secret: {},
} satisfies Record<string, BgmDef>;

export type BgmKey = keyof typeof BGM_LIST;
export const BGM: Record<BgmKey, BgmDef> = BGM_LIST;



/** 모험 지역 번호 → 지역 곡(sound-plan.md 1절 8~12번) */
const ZONE_BGM: Record<number, BgmKey> = {
  1: 'adv_wild', 3: 'adv_wild', 4: 'adv_wild',
  2: 'adv_fire', 14: 'adv_fire',
  5: 'adv_sky', 6: 'adv_sky', 7: 'adv_sky',
  8: 'adv_deep', 9: 'adv_deep', 10: 'adv_deep',
  11: 'adv_ruin', 12: 'adv_ruin', 13: 'adv_ruin',
};

/** 지역 보스 마당(sound-plan.md 1절 13번) */
const BOSS_YARDS = new Set<string>(['adv_1c', 'adv_2b', 'adv_3', 'adv_4', 'adv_5', 'adv_6b', 'adv_7', 'adv_8', 'adv_9b', 'adv_10b', 'adv_11b', 'adv_12b', 'adv_13b', 'adv_14b']);
/** 비밀 방 곡을 트는 맵: 이름 없는 방, 그 발코니, 4층 숨은 방(2026-11-27부터 따로 된 맵) */
const SECRET_MAPS = new Set<string>(['annex', 'balcony', 'hideout']);
/** 건물 안 곡(sound-plan.md 1절 4번). 4층 발코니(balcony4)는 옥상·바깥 계단처럼 4층에 딸려 건물 안 곡(에이전트가 정함) */
const INDOOR_MAPS = new Set<string>(['mart', 'labor', 'farmcoop', 'smithy', 'exchange', 'tower1', 'tower4', 'tower7', 'tower8', 'rooftop', 'elevator', 'stairs', 'balcony4']);

export const isBossYard = (id: MapId) => BOSS_YARDS.has(id);

/** 모험 지역 곡. 보스 마당도 보스를 잡았으면 이 곡으로 돌아간다. */
export function zoneBgm(id: MapId): BgmKey {
  const zone = Number(/^adv_(\d+)/.exec(id)?.[1]);
  return ZONE_BGM[zone] ?? 'adv_gate';
}

/**
 * 맵에 들어가면 트는 곡. 시작마을은 night면 밤 곡이다. 보스 마당은 보스 곡(잡은 뒤의 지역 곡은 GameScene이 고른다).
 * 처음 보는 맵(새로 생긴 맵)은 조용히 둔다.
 */
export function bgmForMap(id: MapId, night: boolean): BgmKey | null {
  if (id === 'plains') return night ? 'village_night' : 'village_day';
  if (SECRET_MAPS.has(id)) return 'secret';
  // 시작마을 빌라(로비·엘리베이터·2층 복도·방 열·옥상)는 건물 안 곡. 옥상도 아이티공간 옥상처럼 같은 곡(PM이 정함).
  if (INDOOR_MAPS.has(id) || id.startsWith('villa')) return 'indoor';
  if (id === 'meadow') return 'adv_wild';
  if (id === 'inferno') return 'adv_fire';
  if (id === 'adv_gate') return 'adv_gate';
  if (isAdventure(id)) return isBossYard(id) ? 'boss' : zoneBgm(id);
  if (id === 'farm' || id === 'snow' || MAPS[id].work) return 'fields';
  if (id === 'casino') return 'casino';
  if (id === 'forest') return 'battlefield';
  return null;
}

/** 등·커튼을 바꾼 뒤의 id로 고르는 소리: 커튼·블라인드는 curtain, 등은 켬·끔 */
export function toggleSfx(next: BlockId): SfxKey {
  if (isCurtain(next)) return 'curtain';
  return isOff(next) ? 'switch_off' : 'switch_on';
}

/** 무기를 쓸 때 나는 소리(권총·대형 권총, 기관총, 저격총, 산탄총, 가벼운·무거운 근접 무기) */
export function weaponSfx(id: WeaponId): SfxKey {
  if (WEAPONS[id].melee) return id === 'dagger' || id === 'scimitar' || id === 'rapier' ? 'swing_light' : 'swing_heavy';
  if (id === 'machinegun') return 'gun_mg';
  if (id === 'sniper') return 'gun_sniper';
  if (id === 'shotgun') return 'gun_shotgun';
  return 'gun_pistol';
}

/** 건물 안(바닥을 맵 자료로 깔지 않는 맵)을 드나들면 문 소리, 그 밖은 포탈 소리 */
export function doorBetween(from: MapId, to: MapId) {
  const inside = (id: MapId) => MAPS[id].floor.length === 0;
  return inside(from) !== inside(to);
}
