import type { RealtimeChannel } from '@supabase/supabase-js';
import { BLOCKS, type BlockId } from '../blocks';
import { MAX_HP, MAX_MAP_SIZE, TEAM_SIZE } from '../config';
import type { Slot } from '../game/inventory';
import { parseLevel } from '../game/level';
import type { StatId } from '../game/stats';
import { isWeapon, type WeaponId } from '../items';
import type { Profile } from './auth';
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
  level: bigint;
  motion: Motion;
  /** 고른 캐릭터. 옛 계정은 null이다. */
  skin: number | null;
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

export interface RankEntry {
  nickname: string;
  level: bigint;
}

export interface PlacedBlock {
  x: number;
  y: number;
  id: BlockId;
}

export interface SessionEvents {
  /** 내 현재 칸. 새로 들어온 플레이어에게 위치를 알릴 때 쓴다. */
  currentTile(): { x: number; y: number };
  /** 내 현재 체력. 새로 들어온 플레이어에게 알릴 때 쓴다. */
  currentHp(): number;
  /** 내 현재 레벨 */
  currentLevel(): bigint;
  onMove(move: PlayerMove): void;
  onShot(shot: PlayerShot): void;
  /** 서버가 알려 주는 체력 변화 */
  onHp(id: string, hp: number): void;
  /** 서버가 판정한 회피 */
  onDodge(id: string): void;
  /** 서버가 알려 주는 레벨과 경험치 변화 */
  onLevel(id: string, level: bigint, exp: number): void;
  /** 지금 같은 맵에 접속 중인 플레이어 id 목록 */
  onRoster(ids: Set<string>): void;
  onChat(message: ChatMessage): void;
  onBlocksLoaded(blocks: PlacedBlock[]): void;
  onBlockPlaced(block: PlacedBlock): void;
  onBlockRemoved(x: number, y: number): void;
  onConnection(connected: boolean): void;
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

const isTileCoord = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < MAX_MAP_SIZE;
const isGridCoord = (v: unknown): v is number => typeof v === 'number' && v >= -1 && v <= MAX_MAP_SIZE + 1;
const isHp = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MAX_HP;
const isBlockId = (v: unknown): v is BlockId => typeof v === 'string' && Object.hasOwn(BLOCKS, v);
const isSkin = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < TEAM_SIZE;

/** 다른 플레이어가 보낸 값은 믿을 수 없으므로 형식을 확인한다. */
function parseMove(value: unknown): PlayerMove | null {
  const m = value as (Partial<Omit<PlayerMove, 'level'>> & { level?: unknown }) | null;
  if (!m || typeof m.id !== 'string' || typeof m.nickname !== 'string') return null;
  if (!isTileCoord(m.x) || !isTileCoord(m.y) || typeof m.ms !== 'number') return null;
  return {
    id: m.id,
    nickname: m.nickname.slice(0, MAX_NAME),
    x: m.x,
    y: m.y,
    ms: Math.min(Math.max(m.ms, 0), MAX_STEP_MS),
    hp: isHp(m.hp) ? m.hp : MAX_HP,
    level: parseLevel(m.level) ?? 1n,
    motion: m.motion === 'run' || m.motion === 'jump' ? m.motion : 'walk',
    skin: isSkin(m.skin) ? m.skin : null,
  };
}

function parseShot(value: unknown): PlayerShot | null {
  const s = value as Partial<PlayerShot> | null;
  if (!s || typeof s.id !== 'string') return null;
  if (!isGridCoord(s.fromX) || !isGridCoord(s.fromY) || !isGridCoord(s.toX) || !isGridCoord(s.toY)) return null;
  const weapon = isWeapon(s.weapon) ? s.weapon : 'pistol';
  return { id: s.id, weapon, fromX: s.fromX, fromY: s.fromY, toX: s.toX, toY: s.toY };
}

function parseChat(value: unknown): ChatMessage | null {
  const m = value as Partial<ChatMessage> | null;
  if (!m || typeof m.id !== 'string' || typeof m.author !== 'string' || typeof m.text !== 'string') return null;
  return { id: m.id, author: m.author.slice(0, MAX_NAME), text: m.text.slice(0, MAX_TEXT) };
}

function parseBlock(row: { x?: unknown; y?: unknown; block?: unknown }): PlacedBlock | null {
  if (!isTileCoord(row.x) || !isTileCoord(row.y) || !isBlockId(row.block)) return null;
  return { x: row.x, y: row.y, id: row.block };
}

/** 로그인한 플레이어 한 명의 서버 연결. 멀티플레이 통신은 이 파일에만 둔다. */
export class GameSession {
  private channel: RealtimeChannel | null = null;
  private readonly chat;
  private events!: SessionEvents;
  private mapId: string;
  private joined = false;
  private pending: ProfilePatch = {};
  private saveTimer = 0;

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
    this.joinMap();

    // 서버만 보낼 수 있는 채널이다. 채팅은 맵과 상관없이 모든 플레이어에게 전달된다.
    this.chat
      .on('broadcast', { event: 'chat' }, ({ payload }) => {
        const message = parseChat(payload);
        if (message) events.onChat(message);
      })
      .on('broadcast', { event: 'hp' }, ({ payload }) => {
        if (typeof payload?.id === 'string' && isHp(payload.hp)) events.onHp(payload.id, payload.hp);
      })
      .on('broadcast', { event: 'dodge' }, ({ payload }) => {
        if (typeof payload?.id === 'string') events.onDodge(payload.id);
      })
      .on('broadcast', { event: 'level' }, ({ payload }) => {
        const level = parseLevel(payload?.level);
        const exp = typeof payload?.exp === 'number' && payload.exp >= 0 ? payload.exp : 0;
        if (typeof payload?.id === 'string' && level) events.onLevel(payload.id, level, exp);
      })
      .subscribe();
  }

  /** 지금 맵의 채널에 들어간다. 위치와 접속자는 같은 맵끼리만 주고받는다. */
  private joinMap() {
    const { events, mapId } = this;
    const channel = supabase.channel(`world:${mapId}`, {
      config: { private: true, presence: { key: this.profile.id } },
    });
    this.channel = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        events.onRoster(new Set(Object.keys(channel.presenceState())));
      })
      .on('presence', { event: 'join' }, () => this.announce())
      .on('broadcast', { event: 'move' }, ({ payload }) => {
        const move = parseMove(payload);
        if (move && move.id !== this.profile.id) events.onMove(move);
      })
      .on('broadcast', { event: 'shot' }, ({ payload }) => {
        const shot = parseShot(payload);
        if (shot && shot.id !== this.profile.id) events.onShot(shot);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'blocks' }, ({ new: row }) => {
        const block = parseBlock(row);
        if (block && row.map === mapId) events.onBlockPlaced(block);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'blocks' }, ({ old }) => {
        if (old.map === mapId && isTileCoord(old.x) && isTileCoord(old.y)) events.onBlockRemoved(old.x, old.y);
      })
      .subscribe((status) => {
        if (channel !== this.channel) return;
        this.joined = status === 'SUBSCRIBED';
        events.onConnection(this.joined);
        if (this.joined) {
          void channel.track({});
          this.announce();
          void this.syncBlocks();
        }
      });
  }

  /** 다른 맵으로 옮겨 간다. */
  async changeMap(mapId: string, x: number, y: number) {
    const previous = this.channel;
    this.channel = null;
    this.joined = false;
    this.mapId = mapId;
    if (previous) await supabase.removeChannel(previous);
    this.joinMap();
    this.saveLater({ map: mapId, x, y });
    await this.flush();
  }

  /** 지금 맵의 블록을 서버 기준으로 다시 맞춘다. */
  async syncBlocks() {
    const { mapId } = this;
    const { data } = await supabase.from('blocks').select('x, y, block').eq('map', mapId);
    if (!data || mapId !== this.mapId) return;
    this.events.onBlocksLoaded(data.map(parseBlock).filter((block) => block !== null));
  }

  sendMove(x: number, y: number, ms: number, motion: Motion = 'walk') {
    if (!this.joined || !this.channel) return;
    const { id, nickname, skin } = this.profile;
    const hp = this.events.currentHp();
    const level = this.events.currentLevel().toString();
    void this.channel.send({
      type: 'broadcast',
      event: 'move',
      payload: { id, nickname, x, y, ms, hp, level, motion, skin },
    });
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

  /** 꾸미기 블록 한 묶음을 산다. 새 골드와 받은 개수를 돌려주고, 실패하면 null이다. */
  async buyItem(item: string): Promise<{ gold: number; amount: number } | null> {
    const { data, error } = await supabase.rpc('buy_item', { item });
    return error ? null : (data as { gold: number; amount: number });
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

  /** 스텟을 1 올리고 새 골드와 스텟 값을 돌려준다. 실패하면 null이다. */
  async buyStat(stat: StatId): Promise<{ gold: number; value: number } | null> {
    const { data, error } = await supabase.rpc('buy_stat', { stat });
    return error ? null : (data as { gold: number; value: number });
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
    const { x, y } = this.events.currentTile();
    this.sendMove(x, y, 0);
  }

  async sendChat(text: string) {
    await supabase.rpc('send_chat', { message: text });
  }

  /** 다른 사람이 먼저 같은 칸에 놓았으면 false를 돌려준다. */
  async placeBlock(x: number, y: number, id: BlockId) {
    const { error } = await supabase.from('blocks').insert({ map: this.mapId, x, y, block: id });
    return !error;
  }

  /** 블록을 지우고 지운 블록 종류를 돌려준다. 다른 사람이 먼저 지웠으면 null이다. */
  async removeBlock(x: number, y: number): Promise<BlockId | null> {
    const { data } = await supabase
      .from('blocks')
      .delete()
      .eq('map', this.mapId)
      .eq('x', x)
      .eq('y', y)
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
