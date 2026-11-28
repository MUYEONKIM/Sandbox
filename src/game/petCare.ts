import { adoptPet, buyPetTreats, petAct, petState, petTick, setPet, type PetAct, type PetActResult, type PetServerState } from '../net/pets';
import type { Gold } from './gold';
import { stageOf, type PetFood, type PetKind, type PetMood, type SentMood } from './pets';

/**
 * 내 펫 상태(2026-11-28 코드 묶음 7, 기획 pet-care-1127.md 2·6·10장). 서버(pet_state 등)가 기준이고, 화면은 받은 값에서 같은 속도로 줄여 보인다.
 * - 접속 중 시간당: 배부름 −4, 함께함 0, 기운 +2(앉거나 누우면 +20). 막대 숫자는 정수가 바뀔 때만 바뀐다(30초마다 견줌, DOM은 바뀐 때만).
 * - 10분마다 pet_tick(걸은 칸, 쉰 초, 캠프파이어 곁 초). 배부름이나 함께함이 0이 되는 때에 pet_state를 한 번 불러 기회 수를 맞춘다.
 * - 기회가 줄었는지·펫을 잃었는지는 이 기기에 마지막으로 본 값(localStorage)과 견준다(기획 6.2·6.3).
 * 실시간 알림은 보내지 않는다(기분과 종류는 GameScene이 이동 알림·접속 명단에 싣는다).
 */
const ONLINE_RATE = { fullness: -4, company: 0, energy: 2, rest: 20 } as const;
const TICK_MS = 10 * 60 * 1000;
const POLL_MS = 30 * 1000;
const JOY_MS = 2000;
const HEART_GAP_MS = 10 * 1000;
const BIG_GAP_MS = 10 * 60 * 1000;
/** 행동마다 되풀이 간격(초, 서버 pet_act와 같음) */
export const ACT_GAP_S: Record<PetAct, number> = { pat: 30, praise: 30, feed: 0, play: 120, talk: 3 };

export interface PetValues {
  fullness: number;
  energy: number;
  company: number;
  happy: number;
}

function load(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 저장하지 못해도 지금 화면에서는 맞다.
  }
}

export class PetCare {
  state: PetServerState | null = null;
  /** 서버에 펫 함수가 없거나 읽지 못함(펫 화면을 띄우지 않음) */
  unavailable = false;
  private base = { at: 0, fullness: 100, energy: 100, company: 100 };
  /** 서버 시계 − 화면 시계(ms) */
  private clockSkew = 0;
  private resting = false;
  private joyUntil = 0;
  private lastHeartAt = -Infinity;
  private lastBigAt = -Infinity;
  private shown = '';
  private sentKey = '';
  private zeroAsked = false;
  /** 10분 틱에 보낼 것 */
  walked = 0;
  private restMs = 0;
  private campMs = 0;
  private ticking = false;
  private polling = 0;

  /** 값이나 상태가 바뀜(상태 창이 보이는 숫자와 견줘 바뀐 것만 고침) */
  onChange: (() => void) | null = null;
  /** 기회가 줄었다. online이면 접속해 있는 동안 줄었다. */
  onChanceLost: ((left: number, online: boolean) => void) | null = null;
  /** 펫을 잃었다(kind: 잃은 종류). alive면 이번 접속에서 그 펫을 보고 있었다(작별 연출 뒤 창, 아니면 창만). */
  onLost: ((kind: PetKind | null, alive: boolean) => void) | null = null;
  /** 펫이 생김(처음 고름·입양) 또는 사라짐 */
  onPet: ((kind: PetKind | null) => void) | null = null;
  /** 처음 닿은 단계(큰 화면) */
  onStage: ((stage: number) => void) | null = null;
  /** 다른 사람에게 보낼 종류·기분이 바뀜 */
  onSent: (() => void) | null = null;
  /** 0에서 다시 둘 다 30 이상이 됨 */
  onRearmed: (() => void) | null = null;

  constructor(private readonly myId: string) {}

  private get chancesKey() {
    return `pet-chances:${this.myId}`;
  }

  private get farewellKey() {
    return `pet-farewell:${this.myId}`;
  }

  async load() {
    const s = await petState();
    if (!s) {
      this.unavailable = true;
      this.onChange?.();
      return;
    }
    this.apply(s, false);
    window.clearInterval(this.polling);
    this.polling = window.setInterval(() => this.poll(), POLL_MS);
    window.setInterval(() => void this.tick(), TICK_MS);
  }

  /** 다시 읽는다(모험이 끝났을 때, 장작을 넣었을 때). */
  async refresh() {
    const s = await petState();
    if (s) this.apply(s, true);
  }

  get kind() {
    return this.state?.pet ?? null;
  }

  /** 펫을 고른 적이 없음(처음 고르는 창) */
  get needsPick() {
    return !!this.state && !this.state.pet && this.state.lostCount === 0;
  }

  /** 펫을 잃은 뒤(빈 방석, 입양) */
  get lostPet() {
    return !!this.state && !this.state.pet && this.state.lostCount > 0;
  }

  get stage() {
    return stageOf(this.state?.bond ?? 0);
  }

  get treatPrice(): Gold {
    return this.state?.treatPrice ?? 200n;
  }

  get adoptPrice(): Gold {
    return this.state?.adoptPrice ?? 1_000_000n;
  }

  /** 서버 값으로 바꾼다. online: 접속해 있는 동안 받은 값(기회가 주는 연출·작별 연출) */
  private apply(s: PetServerState, online: boolean) {
    const prev = this.state;
    this.state = s;
    this.clockSkew = s.now - Date.now();
    this.base = { at: performance.now(), fullness: s.fullness, energy: s.energy, company: s.company };
    this.zeroAsked = false;
    // 잃음: 작별 창은 잃은 때마다 한 번(이 기기에 본 것을 적어 둠). 작별 연출이 펫 그림을 쓰므로 onPet보다 먼저 알린다.
    if (!s.pet && s.lostCount > 0 && s.lostAt && load(this.farewellKey) !== s.lostAt) {
      save(this.farewellKey, s.lostAt);
      this.onLost?.(s.lostKind ?? prev?.pet ?? null, online && !!prev?.pet);
    }
    if (prev?.pet !== s.pet) this.onPet?.(s.pet);
    // 기회: 이 기기에 마지막으로 본 수보다 적으면 한 칸씩 흐려지는 움직임(펫이 바뀌었으면 새로 셈)
    const seen = Number(load(this.chancesKey));
    if (s.pet) {
      if (prev && prev.pet === s.pet && s.chances < prev.chances) this.onChanceLost?.(s.chances, online);
      else if (!prev && load(this.chancesKey) !== null && Number.isFinite(seen) && s.chances < seen && s.lostCount === Number(load(`${this.chancesKey}:lost`) ?? s.lostCount))
        this.onChanceLost?.(s.chances, false);
      save(this.chancesKey, String(s.chances));
      save(`${this.chancesKey}:lost`, String(s.lostCount));
    }
    this.onChange?.();
    this.checkSent();
  }

  /** 지금 보이는 값(정수). 줄어드는 배부름·함께함은 올림이라 0은 정말 0일 때만이고, 차오르는 기운은 내림이다. */
  values(now = performance.now()): PetValues {
    const h = (now - this.base.at) / 3_600_000;
    const fullness = Math.max(0, this.base.fullness + ONLINE_RATE.fullness * h);
    const company = Math.max(0, this.base.company + ONLINE_RATE.company * h);
    const energy = Math.min(100, this.base.energy + (this.resting ? ONLINE_RATE.rest : ONLINE_RATE.energy) * h);
    const f = Math.ceil(fullness - 1e-9);
    const c = Math.ceil(company - 1e-9);
    const e = Math.min(100, Math.floor(energy + 1e-9));
    return { fullness: f, energy: e, company: c, happy: Math.round((f + e + c) / 3) };
  }

  /** 배부름이나 함께함이 0 */
  get zero() {
    const v = this.values();
    return !!this.state?.pet && (v.fullness === 0 || v.company === 0);
  }

  /** 상태 창 얼굴(pets.md 8-4 차례) */
  mood(now = performance.now()): PetMood {
    if (this.state?.pet && performance.now() < this.joyUntil && !this.zero) return 'joy';
    return this.sentMood(now);
  }

  /** 다른 사람에게 보내는 기분(잠깐인 joy 빼고) */
  sentMood(now = performance.now()): SentMood {
    const v = this.values(now);
    if (v.fullness === 0 || v.company === 0) return 'weak';
    if (v.fullness < 30) return 'hungry';
    if (v.energy < 30) return 'sleepy';
    if (v.company < 30) return 'lonely';
    if (v.happy < 40) return 'sulky';
    if (v.happy >= 70) return 'good';
    return 'normal';
  }

  /** 다른 사람에게 보낼 종류·기분이 바뀌었으면 알린다. */
  private checkSent() {
    const key = this.state?.pet ? `${this.state.pet}:${this.sentMood()}` : '';
    if (key === this.sentKey) return;
    this.sentKey = key;
    this.onSent?.();
  }

  /** 앉거나 누웠는지(기운이 +20으로 참). 바뀌면 지금 값을 바탕으로 다시 센다. */
  setResting(resting: boolean) {
    if (resting === this.resting) return;
    const now = performance.now();
    const h = (now - this.base.at) / 3_600_000;
    this.base = {
      at: now,
      fullness: Math.max(0, this.base.fullness + ONLINE_RATE.fullness * h),
      company: Math.max(0, this.base.company + ONLINE_RATE.company * h),
      energy: Math.min(100, this.base.energy + (this.resting ? ONLINE_RATE.rest : ONLINE_RATE.energy) * h),
    };
    this.resting = resting;
  }

  /** 쉰 시간(앉기·눕기)과 그 가운데 캠프파이어 곁 시간을 더한다(펫이 있을 때만 부름). */
  addRest(ms: number, camp: boolean) {
    this.restMs += ms;
    if (camp) this.campMs += ms;
  }

  /** 30초마다: 보이는 숫자가 바뀌었으면 상태 창을 고치고, 0이 됐으면 서버에 한 번 묻는다. */
  private poll() {
    if (!this.state?.pet) return;
    const v = this.values();
    const key = `${v.fullness}|${v.energy}|${v.company}`;
    if (key !== this.shown) {
      this.shown = key;
      this.onChange?.();
    }
    this.checkSent();
    if ((v.fullness === 0 || v.company === 0) && this.state.rearm && !this.zeroAsked) {
      this.zeroAsked = true;
      void this.refresh();
    }
  }

  private async tick() {
    if (this.ticking || !this.state?.pet) return;
    this.ticking = true;
    const walked = Math.min(this.walked, 3000);
    const rest = Math.min(Math.round(this.restMs / 1000), 600);
    const camp = Math.min(Math.round(this.campMs / 1000), rest);
    const s = await petTick(walked, rest, camp);
    this.ticking = false;
    if (!s) return;
    this.walked = 0;
    this.restMs = 0;
    this.campMs = 0;
    this.apply(s, true);
    if (s.newStage) this.onStage?.(s.newStage);
  }

  /** 행동의 남은 간격(ms). 0이면 지금 된다. */
  cooldown(act: PetAct) {
    const last = this.state?.acts[act];
    if (last === undefined) return 0;
    const gap = ACT_GAP_S[act] * 1000;
    return Math.max(0, last * 1000 + gap - (Date.now() + this.clockSkew));
  }

  /** 돌보기 하나(서버 pet_act). 결과를 그대로 돌려주고 상태를 맞춘다. */
  async act(act: PetAct, food?: PetFood): Promise<PetActResult | 'no pet' | 'failed'> {
    const result = await petAct(act, food);
    if (typeof result === 'string') {
      if (result === 'no pet') void this.refresh();
      return result;
    }
    this.apply(result, true);
    if (result.rearmed) this.onRearmed?.();
    if (result.newStage) this.onStage?.(result.newStage);
    return result;
  }

  /** 좋은 일 직후 2초 '눈 감고 웃음' */
  joy() {
    this.joyUntil = performance.now() + JOY_MS;
    this.onChange?.();
    window.setTimeout(() => this.onChange?.(), JOY_MS + 20);
  }

  /** 하트는 10초에 한 번까지(기획 8). 띄울 수 있으면 true를 돌려주고 시각을 적는다. */
  takeHeart() {
    const now = performance.now();
    if (now - this.lastHeartAt < HEART_GAP_MS) return false;
    this.lastHeartAt = now;
    return true;
  }

  /** 큰 화면: 단계 오름은 늘, 그 밖(그날 첫 쓰다듬기·좋아하는 먹이)은 10분에 한 번까지 */
  takeBig(always: boolean) {
    const now = performance.now();
    if (!always && now - this.lastBigAt < BIG_GAP_MS) return false;
    this.lastBigAt = now;
    return true;
  }

  async pick(kind: PetKind) {
    const result = await setPet(kind);
    if (typeof result === 'string') {
      if (result === 'already') await this.refresh();
      return result;
    }
    save(this.chancesKey, String(result.chances));
    this.apply(result, true);
    return null;
  }

  async adopt(kind: PetKind) {
    const result = await adoptPet(kind);
    if (typeof result === 'string') return result;
    save(this.chancesKey, String(result.state.chances));
    this.apply(result.state, true);
    return result.gold;
  }

  async buyTreats(amount: number) {
    const result = await buyPetTreats(amount);
    if (typeof result !== 'string' && this.state) {
      this.state = { ...this.state, treats: result.count };
      this.onChange?.();
    }
    return result;
  }

  /** 펫 간식 수(먹이를 먹은 뒤 남은 수로 맞춤) */
  get treats() {
    return this.state?.treats ?? 0;
  }
}
