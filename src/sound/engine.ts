import { assetUrl } from '../assetUrl';
import { BGM, SFX, SFX_SPRITES, type BgmKey, type SfxKey } from './catalog';
import { loadSoundSettings, saveSoundSettings, type SoundSettings } from './settings';

/**
 * 소리 장치(2026-11-27, 공유 노트 sound-plan.md). Phaser 소리 관리자 대신 브라우저 Web Audio를 직접 쓴다(에이전트가 정함):
 * - BGM을 바꿀 때 소리 크기 변화를 브라우저가 맡아(AudioParam ramp) 매 프레임 할 일이 없다.
 * - 대장간·도박장처럼 Phaser 밖의 DOM 창 소리도 같은 장치로 낸다.
 * 그래서 Phaser는 소리를 끄고 시작한다(main.ts audio.noAudio).
 *
 * - 첫 클릭·키 입력 전에는 오디오를 만들지도, 파일을 받지도 않는다. 게임에 들어간 뒤(enterGame) 효과음 묶음을 뒤에서 받고,
 *   다 받기 전에 생긴 효과음은 건너뛴다. BGM은 그 맵에 처음 들 때 그 곡만 받는다.
 * - 효과음 규칙(sound-plan.md 3-4): 남의 행동(at)은 3칸 안 그대로, 표의 칸 수에서 0이 되도록 곧게 줄이고 ×0.7(좌우 나눔 없음).
 *   같은 키 동시 수(max)와 간격(gap)을 넘으면 새 소리를 버리고, 효과음 전체는 동시에 16개까지다.
 * - 탭을 숨기거나 소리를 끄면 0.4초 동안 줄인 뒤 오디오를 멈춘다(suspend). 숨긴 동안 온 효과음은 버린다.
 */

/** 칸 좌표 */
export interface Spot {
  x: number;
  y: number;
}

export interface PlayOptions {
  /** 남의 행동이면 그 칸. 내 칸과의 거리만큼 줄인다. */
  at?: Spot | null;
  /** 누구의 소리인지(사람마다 1, 같은 사람 간격). 없으면 나. */
  who?: string;
  /** 빠르기(음 높이). 결과 화면 레벨 눈금처럼 부르는 쪽이 정할 때 */
  rate?: number;
}

interface Deck {
  key: BgmKey;
  source: AudioBufferSourceNode;
  gain: GainNode;
  /** source.start를 부른 오디오 시각 */
  startedAt: number;
  /** 곡 안에서 시작한 자리(초) */
  offset: number;
  /** 반복 구간(초) */
  loopStart: number;
  loopEnd: number;
  volume: number;
  stopTimer: number;
}

interface Voice {
  key: SfxKey;
  /** 겹침을 함께 세는 묶음(발소리 여섯, 총 넷처럼). 없으면 키 */
  group: string;
  who: string;
  mine: boolean;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/** bgm.json 한 줄 */
interface BgmInfo {
  file: string;
  loopStart: number;
  loopEnd: number;
}

interface Piece {
  buffer: AudioBuffer;
  start: number;
  end: number;
}

/** 곡을 바꿀 때 앞 곡을 줄이며 새 곡을 키우는 시간(초, sound-plan.md 1절). 시간대 3초, 숨은 방 2초, 보스 마당 1초는 부르는 쪽이 준다. */
export const BGM_FADE = 0.8;
/** 숨기기·끄기 때 줄이는 시간(초) */
const HIDE_FADE = 0.4;
/** 풀어 둔 BGM을 몇 곡까지 들고 있나(지금 곡 + 바뀌는 중인 곡, sound-plan.md 2절) */
const BGM_KEEP = 2;
/** 효과음 전체 동시 수(sound-plan.md 3-4) */
const MAX_VOICES = 16;
/** 남의 소리: 이 칸 수 안은 그대로, 표의 칸 수에서 0. 남의 소리 전체 배율 */
const NEAR = 3;
const OTHER_SCALE = 0.7;
/** 흔드는 빠르기 폭(0.95~1.05) */
const VARY = 0.05;
const ME = 'me';
/** 이 소리를 부른 뒤 0.5초 안에는 gold_get을 내지 않는다(겹쳐 시끄럽지 않게, sound-plan.md 3-4) */
const BIG_MONEY = new Set<SfxKey>(['gold_big', 'casino_win', 'forge_success', 'battle_win', 'resource_rare']);
const GOLD_QUIET_MS = 500;

const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'] as const;

/** 슬라이더 0~100을 소리 크기 0~1로(sound-plan.md 2절이 권한 기본값 BGM 0.5·효과음 0.8이 50·80이 되게 곧게) */
const curve = (value: number) => value / 100;

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bgmBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  /** 이 브라우저에 Web Audio가 없음 */
  private unsupported = false;
  private settings: SoundSettings = loadSoundSettings();
  private hidden = document.visibilityState === 'hidden';
  private suspendTimer = 0;
  private armed = false;
  /** 게임에 들어갔음(그 전에는 효과음 묶음을 받지 않는다) */
  private inGame = false;

  /** bgm.json(곡 이름 → 파일, 반복 구간). 처음 곡을 틀 때 한 번 받는다. */
  private bgmInfo: Record<string, BgmInfo> | null = null;
  private bgmInfoLoad: Promise<void> | null = null;
  private readonly bgmBuffers = new Map<BgmKey, AudioBuffer>();
  private readonly bgmLoads = new Map<BgmKey, Promise<AudioBuffer | null>>();
  private readonly failed = new Set<string>();
  /** 들고 있는 BGM, 오래된 것이 앞 */
  private bgmHeld: BgmKey[] = [];

  private wanted: BgmKey | null = null;
  /** 다음 곡 바꾸기에 쓸 겹침 시간(초) */
  private fade = BGM_FADE;
  private deck: Deck | null = null;
  private fading: Deck[] = [];
  /** 곡마다 마지막으로 멈춘 자리(초). 같은 곡으로 돌아오면 이어서 튼다. */
  private readonly resumeAt = new Map<BgmKey, number>();

  /** 받은 효과음 조각(키 → 묶음 그림 속 자리) */
  private readonly pieces = new Map<string, Piece>();
  private readonly spriteLoads = new Set<string>();
  private voices: Voice[] = [];
  private readonly lastStart = new Map<string, number>();
  private listener: (() => Spot | null) | null = null;
  private readonly changed = new Set<() => void>();

  /** 큰돈 소리를 부른 때(ms). 0.5초 안에 골드가 늘어도 gold_get을 내지 않는다. */
  private bigMoneyAt = -Infinity;
  /** 마지막으로 창이 열린 때(ms). 같은 클릭에서 창이 열리면 버튼 소리를 건너뛴다. */
  private openedAt = -Infinity;

  /** 개발 확인용: 부른 횟수, 받은 바이트 */
  readonly calls = new Map<string, number>();
  readonly bytes = { bgm: 0, sfx: 0 };

  constructor() {
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.visibilityState === 'hidden';
      this.refresh();
    });
    this.arm();
  }

  get state(): Readonly<SoundSettings> {
    return this.settings;
  }

  /** 설정 바꾸기. 저장하고 곧바로 소리에 반영한다. */
  set(patch: Partial<SoundSettings>) {
    this.settings = { ...this.settings, ...patch };
    saveSoundSettings(this.settings);
    this.applyBuses();
    this.refresh();
    // 켜는 클릭은 창 전체 입력 감지보다 늦게 처리되므로 여기서 바로 켠다.
    if (this.audible && !this.ctx) this.unlock();
    for (const fn of this.changed) fn();
  }

  onChange(fn: () => void) {
    this.changed.add(fn);
  }

  /** 남의 소리 거리를 잴 기준(내 칸) */
  setListener(fn: () => Spot | null) {
    this.listener = fn;
  }

  /** 게임 화면이 생겼다. 이제부터 효과음 묶음을 받는다(켜져 있으면 바로, 아니면 켜질 때). */
  enterGame() {
    this.inGame = true;
    this.loadSprites();
  }

  /** 들을 수 있는 상태(끄지 않았고 탭이 보임) */
  private get audible() {
    return !this.settings.mute && !this.hidden;
  }

  private get running() {
    return this.ctx?.state === 'running' && this.audible;
  }

  // ---- 켜기 ----

  private readonly gesture = () => this.unlock();

  private arm() {
    if (this.armed || this.unsupported) return;
    this.armed = true;
    for (const type of GESTURES) window.addEventListener(type, this.gesture, { capture: true, passive: true });
  }

  private disarm() {
    if (!this.armed) return;
    this.armed = false;
    for (const type of GESTURES) window.removeEventListener(type, this.gesture, { capture: true });
  }

  /** 첫 클릭·키 입력. 꺼 두었으면 켤 때까지 기다린다(켜는 클릭이 곧 다음 입력이다). */
  private unlock() {
    if (!this.audible) return;
    const ctx = this.ctx ?? this.create();
    if (!ctx) return;
    if (ctx.state === 'running') {
      this.disarm();
      this.woke();
      return;
    }
    void ctx.resume().then(() => {
      if (ctx.state === 'running') this.disarm();
    }, () => undefined);
  }

  /** 오디오가 돌기 시작했다(처음, 숨김·끄기에서 돌아옴). */
  private woke() {
    this.syncBgm();
    this.loadSprites();
  }

  private create(): AudioContext | null {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    let ctx: AudioContext | null = null;
    try {
      if (Ctor) ctx = new Ctor({ latencyHint: 'interactive' });
    } catch {
      ctx = null;
    }
    if (!ctx) {
      this.unsupported = true;
      this.disarm();
      return null;
    }
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.bgmBus = ctx.createGain();
    this.bgmBus.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.applyBuses();
    ctx.onstatechange = () => {
      if (ctx.state === 'running') {
        this.disarm();
        this.woke();
      } else if (this.audible) {
        // 휴대폰에서 전화·다른 앱 때문에 멈췄으면 다음 입력에 다시 켠다.
        this.arm();
      }
    };
    return ctx;
  }

  private applyBuses() {
    if (!this.ctx || !this.bgmBus || !this.sfxBus) return;
    const now = this.ctx.currentTime;
    this.bgmBus.gain.setTargetAtTime(curve(this.settings.bgm), now, 0.03);
    this.sfxBus.gain.setTargetAtTime(curve(this.settings.sfx), now, 0.03);
  }

  /** 숨기기·끄기를 반영한다: 들리면 다시 켜고, 아니면 줄인 뒤 멈춘다. */
  private refresh() {
    const ctx = this.ctx;
    if (!ctx || !this.master) {
      if (this.audible) this.arm();
      return;
    }
    const gain = this.master.gain;
    const now = ctx.currentTime;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    window.clearTimeout(this.suspendTimer);
    if (this.audible) {
      gain.linearRampToValueAtTime(1, now + 0.5);
      if (ctx.state === 'running') this.woke();
      else {
        void ctx.resume().then(() => {
          if (ctx.state !== 'running') this.arm();
        }, () => this.arm());
      }
      return;
    }
    gain.linearRampToValueAtTime(0, now + HIDE_FADE);
    this.suspendTimer = window.setTimeout(() => {
      if (this.audible || ctx.state !== 'running') return;
      this.stopVoices();
      void ctx.suspend().catch(() => undefined);
    }, HIDE_FADE * 1000 + 100);
  }

  // ---- 파일 ----

  private fetchAudio(kind: 'bgm' | 'sfx', file: string): Promise<AudioBuffer> {
    const ctx = this.ctx!;
    return fetch(assetUrl(`sound/${kind}/${file}`))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((data) => {
        this.bytes[kind] += data.byteLength;
        // Safari 옛 판은 콜백 꼴만 받는다.
        return new Promise<AudioBuffer>((resolve, reject) => void ctx.decodeAudioData(data, resolve, reject));
      });
  }

  private loadBgm(key: BgmKey): Promise<AudioBuffer | null> {
    const held = this.bgmBuffers.get(key);
    if (held) return Promise.resolve(held);
    const loading = this.bgmLoads.get(key);
    if (loading) return loading;
    const file = this.bgmInfo?.[key]?.file;
    if (!this.ctx || !file || this.failed.has(`bgm:${key}`)) return Promise.resolve(null);
    const load = this.fetchAudio('bgm', file)
      .then((buffer) => {
        this.bgmBuffers.set(key, buffer);
        this.bgmHeld = this.bgmHeld.filter((k) => k !== key);
        this.bgmHeld.push(key);
        while (this.bgmHeld.length > BGM_KEEP) this.bgmBuffers.delete(this.bgmHeld.shift()!);
        return buffer;
      })
      .catch((error: unknown) => {
        this.failed.add(`bgm:${key}`);
        console.warn('[소리 파일을 읽지 못함]', file, error);
        return null;
      })
      .finally(() => this.bgmLoads.delete(key));
    this.bgmLoads.set(key, load);
    return load;
  }

  /** bgm.json을 한 번 받는다(1KB). 받으면 원하던 곡을 튼다. 못 받으면 곡 없이 둔다. */
  private loadBgmInfo() {
    this.bgmInfoLoad ??= fetch(assetUrl('sound/bgm/bgm.json'))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<Record<string, BgmInfo>>;
      })
      .then((info) => {
        this.bgmInfo = info;
      })
      .catch((error: unknown) => {
        this.bgmInfo = {};
        console.warn('[곡 목록을 읽지 못함]', error);
      })
      .then(() => this.syncBgm());
  }

  /** 효과음 묶음(오디오 스프라이트 m4a + json, sound-plan.md 3-2)을 받는다. 게임에 들어가 소리가 켜진 뒤 한 번. */
  private loadSprites() {
    if (!this.inGame || !this.running) return;
    for (const name of SFX_SPRITES) {
      if (this.spriteLoads.has(name)) continue;
      this.spriteLoads.add(name);
      void fetch(assetUrl(`sound/sfx/${name}.json`))
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<{ resources: string[]; spritemap: Record<string, { start: number; end: number }> }>;
        })
        .then(async ({ resources, spritemap }) => {
          const buffer = await this.fetchAudio('sfx', resources[0]);
          for (const [key, { start, end }] of Object.entries(spritemap)) this.pieces.set(key, { buffer, start, end });
        })
        .catch((error: unknown) => console.warn('[효과음 묶음을 읽지 못함]', name, error));
    }
  }

  // ---- BGM ----

  /**
   * 이 곡을 튼다(null이면 조용히). 같은 곡이면 그대로 이어 튼다. fade초 동안 앞 곡을 줄이며 새 곡을 키운다.
   * 켜지기 전이면 켜질 때 튼다(첫 클릭·키 입력).
   */
  playBgm(key: BgmKey | null, fade = BGM_FADE) {
    if (import.meta.env.DEV) this.count(`bgm:${key}`);
    this.wanted = key;
    this.fade = fade;
    this.syncBgm();
  }

  private syncBgm() {
    const ctx = this.ctx;
    if (!ctx || !this.bgmBus || !this.running) return;
    if (!this.bgmInfo) {
      if (this.wanted) this.loadBgmInfo();
      return;
    }
    const key = this.wanted && this.bgmInfo[this.wanted]?.file ? this.wanted : null;
    if (this.deck?.key === key) return;
    const fade = this.fade;
    if (this.deck) this.fadeOut(this.deck, fade);
    this.deck = null;
    if (!key) return;
    // 막 줄이던 같은 곡이면 그 자리에서 다시 키운다(가게에 들어갔다 바로 나올 때).
    const back = this.fading.find((d) => d.key === key);
    if (back) {
      this.fading = this.fading.filter((d) => d !== back);
      window.clearTimeout(back.stopTimer);
      this.ramp(back.gain, back.volume, fade);
      this.deck = back;
      return;
    }
    void this.loadBgm(key).then((buffer) => {
      if (!buffer || this.wanted !== key || this.deck?.key === key || !this.bgmBus || !this.running) return;
      if (this.deck) this.fadeOut(this.deck, this.fade);
      this.deck = this.startDeck(ctx, this.bgmBus, key, buffer, this.fade);
    });
  }

  private startDeck(ctx: AudioContext, bus: GainNode, key: BgmKey, buffer: AudioBuffer, fade: number): Deck {
    const info = this.bgmInfo?.[key];
    const loopStart = Math.min(Math.max(0, info?.loopStart ?? 0), buffer.duration);
    const loopEnd = info && info.loopEnd > loopStart && info.loopEnd <= buffer.duration ? info.loopEnd : buffer.duration;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = loopStart;
    source.loopEnd = loopEnd;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const volume = BGM[key].volume ?? 1;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + fade);
    source.connect(gain);
    gain.connect(bus);
    // 처음이면 반복 구간 앞에서, 들었던 곡이면 멈췄던 자리에서 튼다.
    const saved = this.resumeAt.get(key);
    const offset = saved !== undefined && saved >= loopStart && saved < loopEnd ? saved : loopStart;
    source.start(now, offset);
    return { key, source, gain, startedAt: now, offset, loopStart, loopEnd, volume, stopTimer: 0 };
  }

  /** 곡 안에서 지금 자리(초). 반복 구간을 돈 만큼 되감아 센다. */
  private position(deck: Deck) {
    const played = deck.offset + this.ctx!.currentTime - deck.startedAt;
    if (played < deck.loopEnd) return played;
    return deck.loopStart + ((played - deck.loopStart) % (deck.loopEnd - deck.loopStart));
  }

  private ramp(gain: GainNode, to: number, seconds: number) {
    const now = this.ctx!.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(to, now + seconds);
  }

  private fadeOut(deck: Deck, fade: number) {
    const ctx = this.ctx!;
    this.resumeAt.set(deck.key, this.position(deck));
    this.ramp(deck.gain, 0, fade);
    this.fading.push(deck);
    const end = ctx.currentTime + fade;
    // 오디오 시각으로 다 줄었는지 본다(숨겨서 멈춘 동안에는 기다린다).
    const check = () => {
      if (ctx.currentTime < end) {
        deck.stopTimer = window.setTimeout(check, 250);
        return;
      }
      this.fading = this.fading.filter((d) => d !== deck);
      deck.source.stop();
      deck.source.disconnect();
      deck.gain.disconnect();
    };
    deck.stopTimer = window.setTimeout(check, fade * 1000 + 50);
  }

  // ---- 효과음 ----

  /**
   * 효과음을 낸다. at을 주면 남의 행동 소리로 보고 내 칸과의 거리만큼 줄인다(표에 칸 수가 없으면 남의 것은 내지 않음).
   * 묶음을 아직 받지 않았거나, 켜지기 전이거나, 숨긴 탭이면 아무것도 하지 않는다(쌓였다가 한꺼번에 나지 않게).
   */
  play(key: SfxKey, opts: PlayOptions = {}) {
    if (import.meta.env.DEV) this.count(key);
    if (key === 'ui_open' || key === 'paper' || key === 'box_open') this.openedAt = performance.now();
    if (BIG_MONEY.has(key)) this.bigMoneyAt = performance.now();
    else if (key === 'gold_get' && performance.now() - this.bigMoneyAt < GOLD_QUIET_MS) return;
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus || !this.running || this.settings.sfx === 0) return;
    const piece = this.pieces.get(key);
    if (!piece) return;
    const def = SFX[key];
    const mine = !opts.at;
    const who = opts.who ?? ME;
    let volume = 1;
    if (!mine) {
      if (!def.range) return;
      const me = this.listener?.();
      if (!me) return;
      const far = Math.hypot(opts.at!.x - me.x, opts.at!.y - me.y);
      if (far > def.range) return;
      volume = (far <= NEAR ? 1 : 1 - (far - NEAR) / (def.range - NEAR)) * OTHER_SCALE * (def.otherScale ?? 1);
      if (volume < 0.01) return;
    }
    const now = performance.now();
    const group = def.group ?? key;
    // 간격: 같은 키, 같은 사람(whoGap), 남의 것만(otherGap)
    if (def.gap && now - (this.lastStart.get(key) ?? -Infinity) < def.gap) return;
    if (def.whoGap && now - (this.lastStart.get(`${group}@${who}`) ?? -Infinity) < def.whoGap) return;
    if (!mine && def.otherGap && now - (this.lastStart.get(`${key}@others`) ?? -Infinity) < def.otherGap) return;
    // 겹침: 같은 묶음 동시 수, 내 것·남의 것 따로 동시 수. 사람마다 1이면 그 사람의 앞 소리를 끊는다.
    let same = 0;
    let sameSide = 0;
    let previous: Voice | null = null;
    for (const v of this.voices) {
      if (v.group !== group) continue;
      if (def.perWho && v.who === who) {
        previous = v;
        continue;
      }
      same++;
      if (v.mine === mine) sameSide++;
    }
    if (def.max && same >= def.max) return;
    if ((mine ? def.mineMax : def.othersMax) !== undefined && sameSide >= (mine ? def.mineMax! : def.othersMax!)) return;
    if (previous) this.cut(previous);
    if (this.voices.length >= MAX_VOICES) {
      // 전체 한도: 내 소리면 가장 오래된 남의 소리를 빼고, 남의 소리면 버린다(에이전트가 정함).
      const other = mine ? this.voices.find((v) => !v.mine) : undefined;
      if (!other) return;
      this.cut(other);
    }
    this.lastStart.set(key, now);
    if (def.whoGap) this.lastStart.set(`${group}@${who}`, now);
    if (!mine && def.otherGap) this.lastStart.set(`${key}@others`, now);

    const source = ctx.createBufferSource();
    source.buffer = piece.buffer;
    const rate = opts.rate ?? (def.vary ? 1 + (Math.random() * 2 - 1) * VARY : 1);
    if (rate !== 1) source.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(bus);
    const voice: Voice = { key, group, who, mine, source, gain };
    this.voices.push(voice);
    source.onended = () => {
      this.voices = this.voices.filter((v) => v !== voice);
      source.disconnect();
      gain.disconnect();
    };
    source.start(0, piece.start, piece.end - piece.start);
  }

  /**
   * 버튼을 눌렀다. 창을 여는 버튼은 ui_open만 내도록(sound-plan.md 3-4) 이 클릭 처리가 끝난 뒤에 보고,
   * 그사이 창이 열렸으면 건너뛴다(창은 클릭 처리 안에서 바로 열린다).
   */
  click(key: 'ui_click' | 'ui_tab') {
    const at = performance.now();
    window.setTimeout(() => {
      if (this.openedAt < at) this.play(key);
    }, 0);
  }

  /** 앞 소리를 끊을 때는 15ms 동안 줄이고 멈춘다(딱 소리가 나지 않게). */
  private cut(voice: Voice) {
    this.voices = this.voices.filter((v) => v !== voice);
    const now = this.ctx!.currentTime;
    voice.gain.gain.setTargetAtTime(0, now, 0.005);
    voice.source.stop(now + 0.02);
  }

  private stopVoices() {
    for (const voice of this.voices) voice.source.stop();
    this.voices = [];
  }

  private count(key: string) {
    this.calls.set(key, (this.calls.get(key) ?? 0) + 1);
  }

  /** 개발 확인용 요약 */
  debug() {
    return {
      state: this.ctx?.state ?? 'none',
      inGame: this.inGame,
      settings: this.settings,
      bgm: this.deck?.key ?? null,
      wanted: this.wanted,
      fading: this.fading.map((d) => d.key),
      voices: this.voices.length,
      bgmHeld: [...this.bgmBuffers.keys()],
      sfxKeys: this.pieces.size,
      bytes: { ...this.bytes },
      calls: Object.fromEntries(this.calls),
    };
  }
}

export const sound = new SoundEngine();
