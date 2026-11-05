import type { RealtimeChannel } from '@supabase/supabase-js';
import { BLOCKS, type BlockId } from '../blocks';
import { MAP_SIZE } from '../config';
import type { Slot } from '../game/inventory';
import type { Profile } from './auth';
import { supabase } from './supabase';

export interface PlayerMove {
  id: string;
  nickname: string;
  x: number;
  y: number;
  ms: number;
}

export interface ChatMessage {
  id: string;
  author: string;
  text: string;
}

export interface PlacedBlock {
  x: number;
  y: number;
  id: BlockId;
}

export interface SessionEvents {
  /** 내 현재 칸. 새로 들어온 플레이어에게 위치를 알릴 때 쓴다. */
  currentTile(): { x: number; y: number };
  onMove(move: PlayerMove): void;
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

const isTileCoord = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < MAP_SIZE;
const isBlockId = (v: unknown): v is BlockId => typeof v === 'string' && Object.hasOwn(BLOCKS, v);

/** 다른 플레이어가 보낸 값은 믿을 수 없으므로 형식을 확인한다. */
function parseMove(value: unknown): PlayerMove | null {
  const m = value as Partial<PlayerMove> | null;
  if (!m || typeof m.id !== 'string' || typeof m.nickname !== 'string') return null;
  if (!isTileCoord(m.x) || !isTileCoord(m.y) || typeof m.ms !== 'number') return null;
  return {
    id: m.id,
    nickname: m.nickname.slice(0, MAX_NAME),
    x: m.x,
    y: m.y,
    ms: Math.min(Math.max(m.ms, 0), MAX_STEP_MS),
  };
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

    // 채팅은 맵과 상관없이 모든 플레이어에게 전달된다.
    this.chat
      .on('broadcast', { event: 'chat' }, ({ payload }) => {
        const message = parseChat(payload);
        if (message) events.onChat(message);
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

  sendMove(x: number, y: number, ms: number) {
    if (!this.joined || !this.channel) return;
    const { id, nickname } = this.profile;
    void this.channel.send({ type: 'broadcast', event: 'move', payload: { id, nickname, x, y, ms } });
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
