import type { RealtimeChannel } from '@supabase/supabase-js';
import { BLOCKS, type BlockId } from '../blocks';
import { BASE_HP, MAX_MAP_SIZE, MAX_STACK, TEAM_SIZE } from '../config';
import type { Slot } from '../game/inventory';
import { parseLevel } from '../game/level';
import type { BetResult, GameId } from '../game/casino';
import type { StatId } from '../game/stats';
import { isWeapon, type WeaponId } from '../items';
import type { Profile } from './auth';
import type { Notice } from '../ui/notice';
import { supabase } from './supabase';

export type Motion = 'walk' | 'run' | 'jump';

/** 작업 한 번의 결과. 레벨은 아주 커질 수 있어 문자열로 온다. */
export interface HarvestResult {
  item: string;
  count: number;
  level: string;
  /** 지금 레벨에서 모은 경험치 */
  exp: number;
  /** 이번에 얻은 경험치 */
  gained: number;
}

export interface PlayerMove {
  id: string;
  nickname: string;
  x: number;
  y: number;
  ms: number;
  hp: number;
  /** 최대 체력. HP 스텟에 따라 사람마다 다르다. */
  maxHp: number;
  level: bigint;
  motion: Motion;
  /** 고른 캐릭터. 옛 계정은 null이다. */
  skin: number | null;
  /** 일하고 있는 자원 칸. 일하지 않으면 null이다. 같은 맵 사람들이 작업 동작을 그리는 데 쓴다. */
  work: { x: number; y: number } | null;
}

/** 다른 플레이어의 공격. 화면에 보여 주기만 하고 피해 판정은 공격한 쪽이 한다. */
export interface PlayerShot {
  id: string;
  weapon: WeaponId;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export interface ChatMessage {
  id: string;
  author: string;
  text: string;
}

export interface KillEntry {
  nickname: string;
  kills: number;
  deaths: number;
}

export interface RankEntry {
  nickname: string;
  level: bigint;
}

export interface PlacedBlock {
  x: number;
  y: number;
  /** 쌓인 높이. 0이 바닥이다. */
  z: number;
  id: BlockId;
}

export interface SessionEvents {
  /** 내 현재 칸. 새로 들어온 플레이어에게 위치를 알릴 때 쓴다. */
  currentTile(): { x: number; y: number };
  /** 내 현재 체력과 최대 체력. 새로 들어온 플레이어에게 알릴 때 쓴다. */
  currentHp(): number;
  currentMaxHp(): number;
  /** 내가 일하고 있는 자원 칸 */
  currentWork(): { x: number; y: number } | null;
  /** 내 현재 레벨 */
  currentLevel(): bigint;
  onMove(move: PlayerMove): void;
  onShot(shot: PlayerShot): void;
  /** 서버가 알려 주는 체력 변화. max는 그 사람의 최대 체력이고, 옛 서버 함수는 보내지 않아 null이다. */
  onHp(id: string, hp: number, max: number | null): void;
  /** 서버가 판정한 회피 */
  onDodge(id: string): void;
  /** 서버가 모두에게 보내는 알림(입장, 처치) */
  onNotice(notice: Notice): void;
  /** 접속 명단에 실린 다른 사람의 위치와 상태. 맵에 들어오자마자 오며, 아직 안 보이는 사람만 그리면 된다. */
  onPresence(move: PlayerMove): void;
  /** 같은 맵의 다른 사람이 자원을 하나 얻었다. rare면 희귀 자원이다. */
  onHarvest(id: string, rare: boolean): void;
  /** 서버가 알려 주는 레벨과 경험치 변화 */
  onLevel(id: string, level: bigint, exp: number): void;
  /** 지금 같은 맵에 접속 중인 플레이어 id 목록 */
  onRoster(ids: Set<string>): void;
  onChat(message: ChatMessage): void;
  onBlocksLoaded(blocks: PlacedBlock[]): void;
  onBlockPlaced(block: PlacedBlock): void;
  onBlockRemoved(x: number, y: number, z: number): void;
  /** 맵 채널 연결 상태. 끊겼으면 reason에 이유가 온다. */
  onConnection(connected: boolean, reason: string | null): void;
}

interface ProfilePatch {
  map?: string;
  x?: number;
  y?: number;
  inventory?: Slot[];
}

const MAX_NAME = 12;
const MAX_TEXT = 100;
const MAX_STEP_MS = 1000;
const SAVE_DELAY_MS = 2000;
/** 내 위치나 상태가 바뀌면 이만큼 뒤에 접속 명단을 고친다. */
const PRESENCE_DELAY_MS = 800;
/**
 * 접속 명단은 이 간격보다 자주 고치지 않는다. Supabase는 한 사람이 30초에 명단을 5번(채널에 들 때 포함)까지만 고치게 하고,
 * 넘으면 그 채널을 닫아 버린다(ClientPresenceRateLimitReached). 2026-11-11에 멈출 때마다 고치다가 이 제한에 걸려
 * "서버에 연결하는 중입니다 (채널이 닫힘)"이 계속 떴다. 15초면 채널에 들 때 1번 + 2번이라 맵을 몇 번 옮겨도 남는다.
 */
const PRESENCE_GAP_MS = 15000;
/** 여러 사람이 한꺼번에 들어와도 내 위치는 이 간격에 한 번만 다시 알린다. */
const ANNOUNCE_GAP_MS = 300;
/** 맵 채널이 끊기면 이만큼 기다렸다가 채널을 새로 만들어 다시 든다. 실패할 때마다 두 배로 늘린다. */
const REJOIN_MS = 3000;
const REJOIN_MAX_MS = 30000;

const DROP_REASONS: Record<string, string> = {
  CHANNEL_ERROR: '채널 오류',
  TIMED_OUT: '서버 응답 없음',
  CLOSED: '채널이 닫힘',
};

/** 연결이 끊긴 이유를 짧게. 화면 문구 옆에 띄워 원인을 알 수 있게 한다. */
function dropReason(status: string, error?: Error) {
  const name = DROP_REASONS[status] ?? status;
  const detail = error?.message?.trim();
  return detail ? `${name}: ${detail.slice(0, 60)}` : name;
}

/**
 * 같은 이름의 채널이 남아 있으면 치운다. 라이브러리는 같은 이름으로 채널을 만들면 남아 있던 것을 돌려주는데,
 * 다 나가지 못하고 남은 채널을 다시 쓰면 구독이 꼬여 연결 문구가 계속 떠 있을 수 있다.
 */
async function dropChannel(channel: RealtimeChannel | null) {
  if (!channel) return;
  const status = await supabase.removeChannel(channel);
  if (status !== 'ok') {
    channel.teardown();
    supabase.realtime.channels = supabase.realtime.channels.filter((c) => c !== channel);
  }
}

async function dropTopic(topic: string) {
  for (const channel of supabase.getChannels().filter((c) => c.topic === `realtime:${topic}`)) await dropChannel(channel);
}

const isTileCoord = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < MAX_MAP_SIZE;
const isGridCoord = (v: unknown): v is number => typeof v === 'number' && v >= -1 && v <= MAX_MAP_SIZE + 1;
const isHp = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const isMaxHp = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= BASE_HP;
const isBlockId = (v: unknown): v is BlockId => typeof v === 'string' && Object.hasOwn(BLOCKS, v);
const isLevel = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < MAX_STACK;
const isSkin = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < TEAM_SIZE;

/** 다른 플레이어가 보낸 값은 믿을 수 없으므로 형식을 확인한다. */
function parseMove(value: unknown): PlayerMove | null {
  const m = value as (Partial<Omit<PlayerMove, 'level'>> & { level?: unknown }) | null;
  if (!m || typeof m.id !== 'string' || typeof m.nickname !== 'string') return null;
  if (!isTileCoord(m.x) || !isTileCoord(m.y) || typeof m.ms !== 'number') return null;
  const maxHp = isMaxHp(m.maxHp) ? m.maxHp : BASE_HP;
  const work = m.work as { x?: unknown; y?: unknown } | null | undefined;
  return {
    id: m.id,
    nickname: m.nickname.slice(0, MAX_NAME),
    x: m.x,
    y: m.y,
    ms: Math.min(Math.max(m.ms, 0), MAX_STEP_MS),
    hp: isHp(m.hp) ? Math.min(m.hp, maxHp) : maxHp,
    maxHp,
    level: parseLevel(m.level) ?? 1n,
    motion: m.motion === 'run' || m.motion === 'jump' ? m.motion : 'walk',
    skin: isSkin(m.skin) ? m.skin : null,
    work: work && isTileCoord(work.x) && isTileCoord(work.y) ? { x: work.x, y: work.y } : null,
  };
}

function parseShot(value: unknown): PlayerShot | null {
  const s = value as Partial<PlayerShot> | null;
  if (!s || typeof s.id !== 'string') return null;
  if (!isGridCoord(s.fromX) || !isGridCoord(s.fromY) || !isGridCoord(s.toX) || !isGridCoord(s.toY)) return null;
  const weapon = isWeapon(s.weapon) ? s.weapon : 'pistol';
  return { id: s.id, weapon, fromX: s.fromX, fromY: s.fromY, toX: s.toX, toY: s.toY };
}

const isName = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

function parseNotice(value: unknown): Notice | null {
  const n = value as { kind?: unknown; name?: unknown; killer?: unknown; victim?: unknown } | null;
  if (n?.kind === 'join' && isName(n.name)) return { kind: 'join', name: n.name.slice(0, MAX_NAME) };
  if (n?.kind === 'kill' && isName(n.killer) && isName(n.victim)) {
    return { kind: 'kill', killer: n.killer.slice(0, MAX_NAME), victim: n.victim.slice(0, MAX_NAME) };
  }
  return null;
}

function parseChat(value: unknown): ChatMessage | null {
  const m = value as Partial<ChatMessage> | null;
  if (!m || typeof m.id !== 'string' || typeof m.author !== 'string' || typeof m.text !== 'string') return null;
  return { id: m.id, author: m.author.slice(0, MAX_NAME), text: m.text.slice(0, MAX_TEXT) };
}

function parseBlock(row: { x?: unknown; y?: unknown; z?: unknown; block?: unknown }): PlacedBlock | null {
  if (!isTileCoord(row.x) || !isTileCoord(row.y) || !isLevel(row.z) || !isBlockId(row.block)) return null;
  return { x: row.x, y: row.y, z: row.z, id: row.block };
}

/** 로그인한 플레이어 한 명의 서버 연결. 멀티플레이 통신은 이 파일에만 둔다. */
export class GameSession {
  private channel: RealtimeChannel | null = null;
  /** 지금 맵의 채팅. 서버만 보낼 수 있는 chat:<맵> 채널이라 닉네임을 사칭할 수 없다. */
  private mapChat: RealtimeChannel | null = null;
  private readonly chat;
  private events!: SessionEvents;
  private mapId: string;
  private joined = false;
  private pending: ProfilePatch = {};
  private saveTimer = 0;
  private presenceTimer = 0;
  private lastTrack = -Infinity;
  /** 서버가 맵 채널에 보낸 마지막 시스템 메시지. 채널이 닫힌 이유를 알아보는 데 쓴다. */
  private lastSystem: string | null = null;
  private lastAnnounce = 0;
  private rejoinTimer = 0;
  private rejoinTries = 0;

  constructor(readonly profile: Profile) {
    this.mapId = profile.map;
    this.chat = supabase.channel('world-chat', { config: { private: true } });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.flush();
    });
  }

  async connect(events: SessionEvents) {
    this.events = events;
    await supabase.realtime.setAuth();
    await this.joinMap();

    // 서버만 보낼 수 있는 채널이다. 체력, 회피, 레벨 알림은 맵과 상관없이 모든 플레이어에게 전달된다.
    this.chat
      .on('broadcast', { event: 'hp' }, ({ payload }) => {
        if (typeof payload?.id === 'string' && isHp(payload.hp)) events.onHp(payload.id, payload.hp, isMaxHp(payload.max) ? payload.max : null);
      })
      .on('broadcast', { event: 'dodge' }, ({ payload }) => {
        if (typeof payload?.id === 'string') events.onDodge(payload.id);
      })
      .on('broadcast', { event: 'notice' }, ({ payload }) => {
        const notice = parseNotice(payload);
        if (notice) events.onNotice(notice);
      })
      .on('broadcast', { event: 'level' }, ({ payload }) => {
        const level = parseLevel(payload?.level);
        const exp = typeof payload?.exp === 'number' && payload.exp >= 0 ? payload.exp : 0;
        if (typeof payload?.id === 'string' && level) events.onLevel(payload.id, level, exp);
      })
      .subscribe();
  }

  /** 지금 맵의 채널에 들어간다. 위치, 접속자, 채팅은 같은 맵끼리만 주고받는다(채팅은 2026-11-11 사용자 요청). */
  private async joinMap() {
    const { events, mapId } = this;
    await dropTopic(`chat:${mapId}`);
    await dropTopic(`world:${mapId}`);
    if (mapId !== this.mapId) return;
    const mapChat = supabase.channel(`chat:${mapId}`, { config: { private: true } });
    this.mapChat = mapChat;
    const channel = supabase.channel(`world:${mapId}`, {
      config: { private: true, presence: { key: this.profile.id } },
    });
    this.channel = channel;
    /** 맵을 옮기면 예전 채널은 나가는 중에도 알림이 올 수 있어서, 지금 맵의 채널에서 온 것만 받는다. */
    const current = () => channel === this.channel;

    mapChat
      .on('broadcast', { event: 'chat' }, ({ payload }) => {
        const message = parseChat(payload);
        if (message && mapChat === this.mapChat) events.onChat(message);
      })
      .subscribe();

    this.lastSystem = null;
    channel
      .on('system', {}, (payload: { message?: string; status?: string }) => {
        if (current() && payload?.status !== 'ok') this.lastSystem = String(payload?.message ?? payload?.status ?? '').slice(0, 80) || null;
      })
      .on('presence', { event: 'sync' }, () => {
        if (!current()) return;
        const state = channel.presenceState();
        events.onRoster(new Set(Object.keys(state)));
        // 접속 명단에 각자의 위치와 상태가 실려 있어서, 들어오자마자 다른 사람의 답을 기다리지 않고 그린다.
        for (const [key, metas] of Object.entries(state)) {
          if (key === this.profile.id) continue;
          const move = parseMove(metas[metas.length - 1]);
          if (move) events.onPresence(move);
        }
      })
      // 새로 들어온 사람에게는 명단보다 정확한 지금 위치를 한 번 더 보낸다. 명단 내용만 바뀐 것(currentPresences가 있음)은 넘긴다.
      .on('presence', { event: 'join' }, ({ key, currentPresences }) => {
        if (current() && key !== this.profile.id && currentPresences.length === 0) this.announce();
      })
      .on('broadcast', { event: 'move' }, ({ payload }) => {
        const move = parseMove(payload);
        if (current() && move && move.id !== this.profile.id) events.onMove(move);
      })
      .on('broadcast', { event: 'shot' }, ({ payload }) => {
        const shot = parseShot(payload);
        if (current() && shot && shot.id !== this.profile.id) events.onShot(shot);
      })
      .on('broadcast', { event: 'harvest' }, ({ payload }) => {
        if (current() && typeof payload?.id === 'string' && payload.id !== this.profile.id) events.onHarvest(payload.id, payload.rare === true);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'blocks' }, ({ new: row }) => {
        const block = parseBlock(row);
        if (current() && block && row.map === mapId) events.onBlockPlaced(block);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'blocks' }, ({ old }) => {
        if (current() && old.map === mapId && isTileCoord(old.x) && isTileCoord(old.y) && isLevel(old.z)) events.onBlockRemoved(old.x, old.y, old.z);
      })
      .subscribe((status, error) => {
        if (!current()) return;
        this.joined = status === 'SUBSCRIBED';
        if (this.joined) {
          this.rejoinTries = 0;
          window.clearTimeout(this.rejoinTimer);
          this.rejoinTimer = 0;
          events.onConnection(true, null);
          this.trackNow();
          this.announce();
          void this.syncBlocks();
          return;
        }
        const server = status === 'CLOSED' && this.lastSystem ? ` / 서버: ${this.lastSystem}` : '';
        const reason = dropReason(status, error) + server;
        console.warn('[실시간 연결 끊김]', mapId, reason, error);
        events.onConnection(false, reason);
        this.scheduleRejoin();
      });
  }

  /**
   * 맵 채널이 끊기고 잠시 뒤에도 돌아오지 않으면 채널을 치우고 새로 만들어 다시 든다(2026-11-11 사용자가 "연결하는 중" 문구가
   * 계속 뜬다고 함). 라이브러리도 스스로 다시 들려고 하므로, 그사이 붙으면 아무것도 하지 않는다.
   */
  private scheduleRejoin() {
    if (this.rejoinTimer) return;
    const delay = Math.min(REJOIN_MAX_MS, REJOIN_MS * 2 ** this.rejoinTries);
    this.rejoinTries++;
    this.rejoinTimer = window.setTimeout(() => {
      this.rejoinTimer = 0;
      if (!this.joined) void this.rejoin();
    }, delay);
  }

  private async rejoin() {
    const { channel, mapChat } = this;
    this.channel = null;
    this.mapChat = null;
    await dropChannel(mapChat);
    await dropChannel(channel);
    if (this.channel === null) await this.joinMap();
  }

  /** 다른 맵으로 옮겨 간다. */
  async changeMap(mapId: string, x: number, y: number) {
    const previous = this.channel;
    const previousChat = this.mapChat;
    const sameMap = mapId === this.mapId;
    this.channel = null;
    this.mapChat = null;
    this.joined = false;
    this.mapId = mapId;
    window.clearTimeout(this.presenceTimer);
    this.presenceTimer = 0;
    window.clearTimeout(this.rejoinTimer);
    this.rejoinTimer = 0;
    this.rejoinTries = 0;
    // 예전 맵 채널을 다 나갈 때까지 기다리지 않고 새 맵 채널에 바로 든다. 같은 맵이면 채널 이름이 같아서 먼저 나간다.
    if (previousChat) void dropChannel(previousChat);
    if (previous && sameMap) await dropChannel(previous);
    else if (previous) void dropChannel(previous);
    await this.joinMap();
    this.saveLater({ map: mapId, x, y });
    await this.flush();
  }

  /** 지금 맵의 블록을 서버 기준으로 다시 맞춘다. */
  async syncBlocks() {
    const { mapId } = this;
    const { data } = await supabase.from('blocks').select('x, y, z, block').eq('map', mapId);
    if (!data || mapId !== this.mapId) return;
    this.events.onBlocksLoaded(data.map(parseBlock).filter((block) => block !== null));
  }

  /** 이동 알림과 접속 명단에 싣는 내 위치와 상태 */
  private myState(ms: number, motion: Motion, tile = this.events.currentTile()) {
    const { id, nickname, skin } = this.profile;
    return {
      id,
      nickname,
      x: tile.x,
      y: tile.y,
      ms,
      hp: this.events.currentHp(),
      maxHp: this.events.currentMaxHp(),
      level: this.events.currentLevel().toString(),
      motion,
      skin,
      work: this.events.currentWork(),
    };
  }

  sendMove(x: number, y: number, ms: number, motion: Motion = 'walk') {
    if (!this.joined || !this.channel) return;
    void this.channel.send({ type: 'broadcast', event: 'move', payload: this.myState(ms, motion, { x, y }) });
    this.refreshPresence();
  }

  /** 잠시 뒤 접속 명단에 실린 내 위치와 상태를 지금 것으로 고친다. 체력이나 레벨이 바뀌었을 때도 부른다. */
  refreshPresence() {
    if (this.presenceTimer) return;
    const wait = Math.max(PRESENCE_DELAY_MS, this.lastTrack + PRESENCE_GAP_MS - performance.now());
    this.presenceTimer = window.setTimeout(() => {
      this.presenceTimer = 0;
      this.trackNow();
    }, wait);
  }

  /** 접속 명단에 지금 위치와 상태를 싣는다. 너무 자주 부르면 서버가 채널을 닫으므로 refreshPresence를 거친다. */
  private trackNow() {
    if (!this.joined || !this.channel) return;
    this.lastTrack = performance.now();
    void this.channel.track(this.myState(0, 'walk'));
  }

  /** 자원을 하나 얻었다고 같은 맵 사람들에게 알린다. 마무리 효과를 그리는 데만 쓴다. */
  sendHarvest(rare: boolean) {
    if (!this.joined || !this.channel) return;
    void this.channel.send({ type: 'broadcast', event: 'harvest', payload: { id: this.profile.id, rare } });
  }

  sendShot(weapon: WeaponId, fromX: number, fromY: number, toX: number, toY: number) {
    if (!this.joined || !this.channel) return;
    const payload = { id: this.profile.id, weapon, fromX, fromY, toX, toY };
    void this.channel.send({ type: 'broadcast', event: 'shot', payload });
  }

  /** 자원 하나를 캔다. 작업 간격을 어기거나 작업장이 아니면 null을 돌려준다. */
  async harvest(): Promise<HarvestResult | null> {
    const { data, error } = await supabase.rpc('harvest');
    return error ? null : (data as HarvestResult);
  }

  /** 가진 자원을 모두 팔고 새 골드를 돌려준다. */
  async sellAll(): Promise<number | null> {
    const { data, error } = await supabase.rpc('sell_all');
    return error ? null : (data as number);
  }

  /** 무기를 사고 새 골드를 돌려준다. 실패하면 null이다. */
  async buyWeapon(weapon: WeaponId): Promise<number | null> {
    const { data, error } = await supabase.rpc('buy_weapon', { weapon });
    return error ? null : (data as number);
  }

  /** 작업 도구를 사고 새 골드를 돌려준다. 실패하면 null이다. */
  async buyTool(tool: string): Promise<number | null> {
    const { data, error } = await supabase.rpc('buy_tool', { tool });
    return error ? null : (data as number);
  }

  /** 작업장마다 지금 있는 사람(최근 2분 안에 일했거나 움직인 사람). 실패하면 null이다. */
  async fetchWorkplaceRoster(): Promise<{ workplace: string; nickname: string }[] | null> {
    const { data, error } = await supabase.rpc('workplace_roster');
    return error ? null : (data as { workplace: string; nickname: string }[]);
  }

  /** 접속했다고 모두에게 알린다. 같은 사람은 서버가 1분에 한 번만 알린다. */
  async announceJoin() {
    await supabase.rpc('announce_join');
  }

  /** 킬/데스 순위를 위에서 size명까지 읽어 온다. 실패하면 null이다. */
  async fetchKillRanking(size: number): Promise<KillEntry[] | null> {
    const { data, error } = await supabase.rpc('top_killers', { how_many: size });
    return error ? null : (data as KillEntry[]);
  }

  /** 레벨 순위를 위에서 size명까지 읽어 온다. 실패하면 null이다. */
  async fetchRanking(size: number): Promise<RankEntry[] | null> {
    const { data, error } = await supabase.rpc('top_players', { how_many: size });
    if (error) return null;
    return (data as { nickname: string; level: string }[]).map(({ nickname, level }) => ({
      nickname,
      level: parseLevel(level) ?? 1n,
    }));
  }

  /** 스텟을 amount만큼 올리고 새 골드와 스텟 값을 돌려준다. 실패하면 null이다. */
  async buyStat(stat: StatId, amount: number): Promise<{ gold: number; value: number } | null> {
    const { data, error } = await supabase.rpc('buy_stat', { stat, amount });
    return error ? null : (data as { gold: number; value: number });
  }

  /** 도박장에서 골드를 건다. 결과와 배당은 서버가 정한다. 실패하면 null이다. */
  async placeBet(game: GameId, pick: string, amount: number): Promise<BetResult | null> {
    const { data, error } = await supabase.rpc('place_bet', { game, pick, amount });
    return error ? null : (data as BetResult);
  }

  /** 내 공격이 맞았음을 서버에 알린다. 피해량과 체력은 서버가 계산한다. */
  async hitPlayer(target: string, weapon: WeaponId) {
    await supabase.rpc('hit_player', { target, weapon });
  }

  /** 쓰러진 뒤 체력을 되찾는다. 실패하면 false를 돌려준다. */
  async respawn() {
    const { error } = await supabase.rpc('respawn');
    return !error;
  }

  private announce() {
    const now = performance.now();
    if (now - this.lastAnnounce < ANNOUNCE_GAP_MS) return;
    this.lastAnnounce = now;
    const { x, y } = this.events.currentTile();
    this.sendMove(x, y, 0);
  }

  async sendChat(text: string) {
    await supabase.rpc('send_chat', { message: text });
  }

  /** 다른 사람이 먼저 같은 자리에 놓았거나 아래 블록이 빠졌으면 false를 돌려준다. */
  async placeBlock(x: number, y: number, z: number, id: BlockId) {
    const { error } = await supabase.from('blocks').insert({ map: this.mapId, x, y, z, block: id });
    return !error;
  }

  /** 블록을 지우고 지운 블록 종류를 돌려준다. 다른 사람이 먼저 지웠거나 그 위에 쌓았으면 null이다. */
  async removeBlock(x: number, y: number, z: number): Promise<BlockId | null> {
    const { data } = await supabase
      .from('blocks')
      .delete()
      .eq('map', this.mapId)
      .eq('x', x)
      .eq('y', y)
      .eq('z', z)
      .select('block')
      .maybeSingle();
    return data && isBlockId(data.block) ? data.block : null;
  }

  saveLater(patch: ProfilePatch) {
    Object.assign(this.pending, patch);
    if (!this.saveTimer) this.saveTimer = window.setTimeout(() => void this.flush(), SAVE_DELAY_MS);
  }

  /** 저장을 미뤄 둔 위치와 인벤토리를 지금 저장한다. */
  async flush() {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = 0;
    if (!Object.keys(this.pending).length) return;
    const patch = this.pending;
    this.pending = {};
    await supabase.from('profiles').update(patch).eq('id', this.profile.id);
  }
}
