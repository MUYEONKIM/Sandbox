import type { RealtimeChannel } from '@supabase/supabase-js';
import { BLOCKS, type BlockId } from '../blocks';
import { BASE_HP, MAX_MAP_SIZE, MAX_STACK, TEAM_SIZE } from '../config';
import type { Slot } from '../game/inventory';
import { parseLevel } from '../game/level';
import type { BetResult, GameId } from '../game/casino';
import type { StatId } from '../game/stats';
import { isWeapon, type WeaponId } from '../items';
import type { Profile } from './auth';
import type { BoardPost, PostCategory, WriteResult } from '../ui/board';
import type { Notice } from '../ui/notice';
import type { WantedEntry } from '../ui/wanted';
import type { Quote } from '../game/market';
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

export type HarvestFail = 'elsewhere' | 'failed';

/** 닉네임을 못 바꾼 까닭: 이미 쓰는 이름, 지금 이름과 같음, 2~12자가 아님, 변경권 없음, 그 밖 */
export type RenameFail = 'taken' | 'same' | 'bad' | 'ticket' | 'failed';

function renameFail(message: string): RenameFail {
  if (message.includes('name taken')) return 'taken';
  if (message.includes('same name')) return 'same';
  if (message.includes('bad name')) return 'bad';
  if (message.includes('no ticket')) return 'ticket';
  return 'failed';
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
  /** true면 모든 맵에 보낸 전체 채팅, false면 같은 맵의 일반 채팅 */
  everyone: boolean;
}

/** 현상범이 잡혀 넘어간 현상금 */
export interface Bounty {
  killer: string;
  victim: string;
  gold: number;
  items: { item: string; count: number }[];
}

export type TradeResult =
  | { ok: true; gold: number; shares: number; cost: number; price: number }
  | { ok: false; reason: 'gold' | 'shares' | 'overflow' | 'failed' };

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

/** 땅에 놓인 메모나 골드(2026-11-13 사용자 요청). 메모 글은 주울 때 받는다. */
export interface GroundItem {
  id: number;
  x: number;
  y: number;
  /** 골드면 액수, 메모면 null */
  amount: number | null;
}

/** 내가 들고 있는 메모 */
export interface HeldMemo {
  id: number;
  body: string;
  /** 쓴 사람 닉네임 */
  author: string;
}

/** 땅에 놓기가 안 된 까닭: 맵이 서버와 다름, 땅에 둔 것이 너무 많음, 골드 부족, 그 밖 */
export type DropFail = 'wrong-map' | 'too-many' | 'gold' | 'failed';

export type PickResult =
  | { ok: true; kind: 'gold'; amount: number; gold: number }
  | { ok: true; kind: 'memo'; memo: HeldMemo }
  | { ok: false; reason: 'gone' | 'overflow' | 'failed' };

function parseGround(row: { id?: unknown; x?: unknown; y?: unknown; amount?: unknown }): GroundItem | null {
  const id = Number(row.id);
  if (!Number.isSafeInteger(id) || !isTileCoord(row.x) || !isTileCoord(row.y)) return null;
  const amount = row.amount === null || row.amount === undefined ? null : Number(row.amount);
  if (amount !== null && !(Number.isSafeInteger(amount) && amount > 0)) return null;
  return { id, x: row.x, y: row.y, amount };
}

function parseMemo(row: { id?: unknown; body?: unknown; author?: unknown } | null | undefined): HeldMemo | null {
  const id = Number(row?.id);
  if (!row || !Number.isSafeInteger(id) || typeof row.body !== 'string' || typeof row.author !== 'string') return null;
  return { id, body: row.body, author: row.author };
}

function dropFail(message: string): DropFail {
  if (message.includes('wrong map')) return 'wrong-map';
  if (message.includes('too many')) return 'too-many';
  if (message.includes('not enough gold')) return 'gold';
  return 'failed';
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
  /** 현상금이 넘어갔다. 잡은 사람과 잡힌 사람의 화면이 골드와 자원을 맞춘다. */
  onBounty(bounty: Bounty): void;
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
  /** 지금 맵 땅에 놓인 것 전부. 맵 채널에 들거나 다시 붙을 때 온다. */
  onGroundLoaded(items: GroundItem[]): void;
  onGroundAdded(item: GroundItem): void;
  onGroundRemoved(id: number): void;
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
/** 블록을 한 번에 읽는 줄 수. Supabase API가 한 번에 돌려주는 최대(max_rows)와 같다. */
const BLOCK_PAGE = 1000;
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
  const r = value as { id?: unknown; from?: unknown; to?: unknown } | null;
  if (n?.kind === 'rename' && typeof r?.id === 'string' && isName(r.from) && isName(r.to)) {
    return { kind: 'rename', id: r.id, from: r.from.slice(0, MAX_NAME), to: r.to.slice(0, MAX_NAME) };
  }
  if (n?.kind === 'kill' && isName(n.killer) && isName(n.victim)) {
    const wanted = (n as { wanted?: unknown }).wanted;
    return {
      kind: 'kill',
      killer: n.killer.slice(0, MAX_NAME),
      victim: n.victim.slice(0, MAX_NAME),
      wanted: typeof wanted === 'number' && wanted >= 0 && wanted <= 5 ? wanted : 0,
    };
  }
  return null;
}

function parseBounty(value: unknown): Bounty | null {
  const b = value as Partial<Bounty> | null;
  if (!b || typeof b.killer !== 'string' || typeof b.victim !== 'string' || typeof b.gold !== 'number' || !Array.isArray(b.items)) {
    return null;
  }
  const items = b.items.filter(
    (i): i is { item: string; count: number } => typeof i?.item === 'string' && Number.isInteger(i?.count) && i.count > 0,
  );
  return { killer: b.killer, victim: b.victim, gold: Math.max(0, Math.floor(b.gold)), items };
}

function parseChat(value: unknown, everyone: boolean): ChatMessage | null {
  const m = value as Partial<ChatMessage> | null;
  if (!m || typeof m.id !== 'string' || typeof m.author !== 'string' || typeof m.text !== 'string') return null;
  return { id: m.id, author: m.author.slice(0, MAX_NAME), text: m.text.slice(0, MAX_TEXT), everyone };
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
      .on('broadcast', { event: 'chat' }, ({ payload }) => {
        const message = parseChat(payload, true);
        if (message) events.onChat(message);
      })
      .on('broadcast', { event: 'bounty' }, ({ payload }) => {
        const bounty = parseBounty(payload);
        if (bounty) events.onBounty(bounty);
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
        const message = parseChat(payload, false);
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ground_items' }, ({ new: row }) => {
        const item = parseGround(row);
        if (current() && item && row.map === mapId) events.onGroundAdded(item);
      })
      // 지운 줄은 기본 키(id)만 온다. 다른 맵의 id면 화면에 없으니 지울 것도 없다.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'ground_items' }, ({ old }) => {
        const id = Number(old.id);
        if (current() && Number.isSafeInteger(id)) events.onGroundRemoved(id);
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
          void this.syncGround();
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
    // 서버의 내 맵은 채널을 옮기기 전에 먼저 저장한다. 채널을 나가는 데 시간이 걸리면 그동안 서버가 나를 예전 맵에 있다고 보고
    // 작업장의 harvest나 땅의 물건 줍기를 거절했다(2026-11-13 사용자가 Supabase에 'not at a workplace'가 자주 뜬다고 함).
    this.saveLater({ map: mapId, x, y });
    const saved = this.flush();
    // 예전 맵 채널을 다 나갈 때까지 기다리지 않고 새 맵 채널에 바로 든다. 같은 맵이면 채널 이름이 같아서 먼저 나간다.
    if (previousChat) void dropChannel(previousChat);
    if (previous && sameMap) await dropChannel(previous);
    else if (previous) void dropChannel(previous);
    await this.joinMap();
    await saved;
  }

  /**
   * 지금 맵의 블록을 서버 기준으로 다시 맞춘다.
   * Supabase API는 한 번에 1,000줄(max_rows)까지만 돌려주므로 1,000줄보다 적게 올 때까지 나눠 읽는다.
   * 예전에 한 번만 읽어서 블록이 1,000개 넘는 맵은 나머지가 안 보였고, 그 자리에 다시 놓으면 서버에 이미 있어 409로 실패했다(2026-11-12 사용자 보고).
   */
  async syncBlocks() {
    const { mapId } = this;
    const rows: Parameters<typeof parseBlock>[0][] = [];
    for (;;) {
      // 기본 키 순서로 읽어야 쪽이 겹치거나 빠지지 않는다.
      const { data, error } = await supabase
        .from('blocks')
        .select('x, y, z, block')
        .eq('map', mapId)
        .order('x')
        .order('y')
        .order('z')
        .range(rows.length, rows.length + BLOCK_PAGE - 1);
      if (error || !data || mapId !== this.mapId) return;
      rows.push(...data);
      if (data.length < BLOCK_PAGE) break;
    }
    this.events.onBlocksLoaded(rows.map(parseBlock).filter((block) => block !== null));
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

  /**
   * 자원 하나를 캔다. 실패하면 까닭을 돌려준다. 'elsewhere'는 서버에 저장된 내 맵이 작업장이 아닐 때다:
   * 같은 계정의 다른 창이나 기기가 다른 맵으로 옮겨 간 경우다.
   */
  async harvest(): Promise<HarvestResult | HarvestFail> {
    const { data, error } = await supabase.rpc('harvest');
    if (!error) return data as HarvestResult;
    return error.message.includes('not at a workplace') ? 'elsewhere' : 'failed';
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

  /** 닉네임 변경권을 한 장 사고 새 골드와 변경권 수를 돌려준다. 실패하면 null이다. */
  async buyRenameTicket(): Promise<{ gold: number; tickets: number } | null> {
    const { data, error } = await supabase.rpc('buy_rename_ticket');
    return error ? null : (data as { gold: number; tickets: number });
  }

  /**
   * 변경권 한 장을 써서 닉네임을 바꾼다. 바뀌면 접속 명단과 이동 알림에 새 이름을 실어 같은 맵 사람의 이름표도 바뀌게 한다.
   * 모든 사람에게 가는 변경 알림은 서버가 보낸다.
   */
  async changeNickname(name: string): Promise<{ ok: true; name: string } | { ok: false; reason: RenameFail }> {
    const { data, error } = await supabase.rpc('change_nickname', { new_name: name });
    if (error) return { ok: false, reason: renameFail(error.message) };
    this.profile.nickname = data as string;
    this.refreshPresence();
    this.announce();
    return { ok: true, name: this.profile.nickname };
  }

  /** 작업 도구를 사고 새 골드를 돌려준다. 실패하면 null이다. */
  async buyTool(tool: string): Promise<number | null> {
    const { data, error } = await supabase.rpc('buy_tool', { tool });
    return error ? null : (data as number);
  }

  /** 현상범 명단(지금 악업 1 이상). 실패하면 null이다. */
  async fetchWanted(): Promise<WantedEntry[] | null> {
    const { data, error } = await supabase.rpc('wanted_list');
    return error ? null : (data as WantedEntry[]);
  }

  /** 게시판의 최근 글을 새 글부터 읽는다. 실패하면 null이다. */
  async readBoard(size: number, kind: PostCategory | null): Promise<BoardPost[] | null> {
    const { data, error } = await supabase.rpc('read_board', { how_many: size, kind });
    if (error) return null;
    type Row = { id: number; nickname: string; body: string; created_at: string; mine: boolean; category: string };
    return (data as Row[]).map((row) => ({
      id: row.id,
      nickname: row.nickname,
      body: row.body,
      createdAt: new Date(row.created_at),
      mine: row.mine,
      category: row.category === 'suggestion' ? 'suggestion' : 'general',
    }));
  }

  /** 게시판에 글을 쓴다. 서버가 10초에 한 번만 받는다. */
  async writePost(body: string, category: PostCategory): Promise<WriteResult> {
    const { error } = await supabase.rpc('write_post', { body, category });
    if (!error) return 'ok';
    return error.message.includes('too fast') ? 'too_fast' : 'failed';
  }

  /** 내가 쓴 글을 지운다. 지웠으면 true */
  async deletePost(id: number) {
    const { data, error } = await supabase.rpc('delete_post', { post_id: id });
    return !error && data === true;
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

  /** 증권거래소 종목과 지금 가격. 실패하면 null이다. */
  async fetchQuotes(): Promise<Quote[] | null> {
    const { data, error } = await supabase.rpc('stock_quotes');
    if (error) return null;
    return (data as { id: string; name: string; price: number; prev_price: number; updated_at: string }[]).map((q) => ({
      id: q.id,
      name: q.name,
      price: Number(q.price),
      prevPrice: Number(q.prev_price),
      updatedAt: new Date(q.updated_at),
    }));
  }

  /** 내가 가진 주식. 실패하면 null이다. */
  async fetchHoldings(): Promise<{ stock: string; shares: number; cost: number }[] | null> {
    const { data, error } = await supabase.rpc('my_holdings');
    if (error) return null;
    return (data as { stock: string; shares: number; cost: number }[]).map(({ stock, shares, cost }) => ({
      stock,
      shares: Number(shares),
      cost: Number(cost),
    }));
  }

  /** 지금 맵 땅에 놓인 것을 서버 기준으로 다시 받는다. 한 사람당 20개까지라 1,000줄이면 넉넉하다. */
  async syncGround() {
    const { mapId } = this;
    const { data, error } = await supabase.from('ground_items').select('id, x, y, amount').eq('map', mapId).order('id').limit(1000);
    if (error || !data || mapId !== this.mapId) return;
    this.events?.onGroundLoaded(data.map(parseGround).filter((item): item is GroundItem => item !== null));
  }

  /** 메모를 써서 (x, y)에 놓는다. */
  async dropMemo(body: string, x: number, y: number): Promise<{ ok: true; item: GroundItem } | { ok: false; reason: DropFail }> {
    const { data, error } = await supabase.rpc('drop_memo', { body, map: this.mapId, x, y });
    const item = error ? null : parseGround(data);
    return item ? { ok: true, item } : { ok: false, reason: dropFail(error?.message ?? '') };
  }

  /** 들고 있던 메모를 (x, y)에 다시 놓는다. */
  async placeMemo(memo: number, x: number, y: number): Promise<{ ok: true; item: GroundItem } | { ok: false; reason: DropFail }> {
    const { data, error } = await supabase.rpc('place_memo', { memo, map: this.mapId, x, y });
    const item = error ? null : parseGround(data);
    return item ? { ok: true, item } : { ok: false, reason: dropFail(error?.message ?? '') };
  }

  /** 골드를 amount만큼 (x, y)에 버린다. gold는 버린 뒤 남은 골드다. */
  async dropGold(amount: number, x: number, y: number): Promise<{ ok: true; item: GroundItem; gold: number } | { ok: false; reason: DropFail }> {
    const { data, error } = await supabase.rpc('drop_gold', { amount, map: this.mapId, x, y });
    const d = data as { item?: unknown; gold?: unknown } | null;
    const item = error || !d ? null : parseGround(d.item as Parameters<typeof parseGround>[0]);
    return item ? { ok: true, item, gold: Number(d!.gold) } : { ok: false, reason: dropFail(error?.message ?? '') };
  }

  /** 땅의 것을 줍는다. 먼저 주운 사람만 받는다. */
  async pickUp(item: number): Promise<PickResult> {
    const { data, error } = await supabase.rpc('pick_up', { item });
    if (error) {
      const reason = error.message.includes('gone') ? 'gone' : error.message.includes('too much gold') ? 'overflow' : 'failed';
      return { ok: false, reason };
    }
    const d = data as { amount?: unknown; gold?: unknown; memo?: Parameters<typeof parseMemo>[0] };
    if (d.amount !== undefined && d.amount !== null) return { ok: true, kind: 'gold', amount: Number(d.amount), gold: Number(d.gold) };
    const memo = parseMemo(d.memo);
    return memo ? { ok: true, kind: 'memo', memo } : { ok: false, reason: 'failed' };
  }

  /** 내가 들고 있는 메모, 새것부터 */
  async myMemos(): Promise<HeldMemo[]> {
    const { data, error } = await supabase.rpc('my_memos');
    if (error || !Array.isArray(data)) return [];
    return data.map(parseMemo).filter((memo): memo is HeldMemo => memo !== null);
  }

  /** 주식을 지금 가격에 산다(amount > 0) 또는 판다(amount < 0). 체결 가격과 수는 서버가 정한다. */
  async tradeStock(stock: string, amount: number): Promise<TradeResult> {
    const { data, error } = await supabase.rpc('trade_stock', { stock, amount });
    if (error) {
      const reason = error.message.includes('not enough gold')
        ? 'gold'
        : error.message.includes('not enough shares')
          ? 'shares'
          : error.message.includes('too much gold')
            ? 'overflow'
            : 'failed';
      return { ok: false, reason };
    }
    const d = data as { gold: number; shares: number; cost: number; price: number };
    return { ok: true, gold: Number(d.gold), shares: Number(d.shares), cost: Number(d.cost), price: Number(d.price) };
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

  /** everyone이면 모든 맵에(전체 채팅), 아니면 같은 맵에만(일반 채팅) 보낸다. */
  async sendChat(text: string, everyone: boolean) {
    await supabase.rpc('send_chat', { message: text, everyone });
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
