import type Phaser from 'phaser';
import { sprite } from '../art/sprites';
import { depthOf, tileCenter } from '../iso';
import type { NameTags } from '../ui/nametags';
import type { GameId } from './casino';
import type { MapId } from './maps';
import { npcLinesOf, talkId, type TalkDay, type TalkPhase, type TalkSeason } from './npcLines';
import type { Tile } from './world';

/**
 * 건물 안 NPC(2026-11-28 사용자 "들어가서도 포탈(창구)을 밟는 대신 NPC와 이야기한다. NPC와 이야기할 수 있는 범위는 넓게",
 * 그림과 값은 디자인 세션 13 doors-npc.json npcs·talk). 예전 창구 포탈 대신 창구 뒤나 게임판 앞에 서서 같은 창을 연다.
 * - 그림 npcs.png: NPC마다 한 줄, 22 × 40 다섯 장(0·1 서기, 2·3·4 짧은 동작). 발 줄·크기·숨쉬기가 플레이어 캐릭터와 같고 화면 왼쪽(+y)을 본다.
 * - 이야기 범위: NPC 칸에서 가로·세로 TALK_RANGE칸 안(체비셰프, 소품·창구 너머도 됨). 여럿이면 직선 거리가 가까운 쪽, 같으면 내가 바라보는 쪽.
 * - 말 걸기: NPC가 나를 돌아보고(좌우 뒤집기만) 말풍선 2.2초, 0.3초 뒤 예전 창구의 창이 열린다. 맵에 들어와 처음 말 걸면 첫 인사,
 *   다음부터 npcLines.ts의 여러 대사 가운데 하나(pickLine, 2026-11-28 npc-lines-1128.md 2절).
 * - NPC 칸은 지나갈 수 없고 블록을 놓을 수 없다(map.ts가 solid로 막음). 예전 창구 칸은 빈 바닥이다.
 * - 안내 문구는 없다. 범위에 들어오면 나를 돌아보는 것만 한다.
 */

/** NPC가 여는 창(예전 창구 포탈의 to) */
export type NpcWindow = 'shop' | 'forge-shop' | 'forge-anvil' | 'office' | 'coop' | 'trade' | 'counter' | GameId;

export interface NpcSpec {
  id: string;
  name: string;
  x: number;
  y: number;
  /** 처음 보는 쪽. 그림은 +y(화면 왼쪽)를 보고, +x는 좌우를 뒤집는다(플레이어 face와 같은 규칙). */
  face: '+x' | '+y';
  opens: NpcWindow;
  /** 예전 창구 칸: 범위 밖에서 NPC를 누르면 먼저 이 칸으로 걸어간다. 없으면 NPC 칸에 가장 가까운 칸으로 간다. */
  stand?: Tile;
  /** 그림 줄 */
  row: number;
  /** 짧은 동작: 장 차례와 한 장 시간 */
  action: { frames: readonly number[]; frameMs: number };
}

export const NPC_TALK_RANGE = 4;
/** 말풍선 시간과 창을 여는 때(ms) */
export const NPC_BUBBLE_MS = 2200;
export const NPC_OPEN_DELAY_MS = 300;

const NPC_TEXTURE = 'npcs';
const NPC_W = 22;
const NPC_H = 40;
/** 발 줄(플레이어 TEAM_FOOT_Y와 같음) */
const NPC_FOOT_Y = 39;
const PER_ROW = 5;
/** 서기 두 장을 바꾸는 간격(플레이어와 같음) */
const IDLE_FRAME_MS = 500;
/** 짧은 동작 사이(ms, 이 사이에서 무작위) */
const ACTION_GAP_MS = [8000, 14000] as const;
/** 화면(worldView)에서 이만큼 밖까지는 화면 안으로 친다(px) */
const VIEW_PAD = 32;

const COOP_CLERK_ACTION = { frames: [2, 3, 4, 3, 4], frameMs: 180 };

export const NPCS: Partial<Record<MapId, readonly NpcSpec[]>> = {
  mart: [
    { id: 'shopkeeper', name: '상점 주인', x: 22, y: 17, face: '+y', opens: 'shop', stand: { x: 22, y: 19 }, row: 0, action: { frames: [2, 3, 3, 4], frameMs: 160 } },
  ],
  smithy: [
    { id: 'smith', name: '대장장이', x: 17, y: 17, face: '+y', opens: 'forge-anvil', stand: { x: 17, y: 19 }, row: 1, action: { frames: [2, 2, 3, 4, 2, 2, 3, 4], frameMs: 130 } },
    { id: 'apprentice', name: '견습 대장장이', x: 16, y: 23, face: '+x', opens: 'forge-shop', stand: { x: 16, y: 21 }, row: 2, action: { frames: [2, 3, 4, 4], frameMs: 240 } },
  ],
  labor: [
    { id: 'labor', name: '노동청 직원', x: 21, y: 16, face: '+y', opens: 'office', stand: { x: 22, y: 18 }, row: 3, action: { frames: [2, 3, 4, 4], frameMs: 150 } },
  ],
  farmcoop: [
    { id: 'coop', name: '농협 직원', x: 22, y: 16, face: '+y', opens: 'coop', stand: { x: 22, y: 18 }, row: 4, action: COOP_CLERK_ACTION },
  ],
  exchange: [
    { id: 'clerk', name: '거래소 직원', x: 22, y: 14, face: '+y', opens: 'trade', stand: { x: 22, y: 15 }, row: 5, action: { frames: [2, 3, 2, 4], frameMs: 240 } },
  ],
  casino: [
    { id: 'dealer-ladder', name: '사다리 딜러', x: 18, y: 14, face: '+y', opens: 'ladder', stand: { x: 18, y: 15 }, row: 6, action: { frames: [2, 3, 2, 4], frameMs: 220 } },
    { id: 'dealer-oddeven', name: '홀짝 딜러', x: 25, y: 14, face: '+y', opens: 'oddeven', stand: { x: 25, y: 15 }, row: 7, action: { frames: [2, 3, 4, 3, 4, 3], frameMs: 110 } },
    { id: 'host-snail', name: '경주 진행자', x: 15, y: 22, face: '+x', opens: 'snail', stand: { x: 16, y: 22 }, row: 8, action: { frames: [2, 3, 4, 3, 4], frameMs: 160 } },
  ],
  tower1: [
    { id: 'barista', name: '바리스타', x: 19, y: 14, face: '+y', opens: 'counter', stand: { x: 20, y: 16 }, row: 9, action: { frames: [2, 3, 4, 3, 4], frameMs: 170 } },
  ],
  // 농장 포탈 옆 농협 직원(2026-11-28 PM, 기획 docs/balance/life-1127.md 2.2): 농협 안 직원과 같은 그림·창.
  // 자리는 제가 정한 것: 이야기 범위(y 41~)가 밭(y ~39)과 밭 앞 길(y 40)에 닿지 않고, 포탈 (0, 45) ±2·도착 칸 (3, 44) ±1·소품(등 (7, 43))을 비킨 앞 줄.
  farm: [{ id: 'farm-coop', name: '농협 직원', x: 6, y: 45, face: '+y', opens: 'coop', row: 4, action: COOP_CLERK_ACTION }],
};

export function npcsOf(id: MapId): readonly NpcSpec[] {
  return NPCS[id] ?? [];
}

/** tile이 이 NPC의 이야기 범위 안인지 */
export function inTalkRange(npc: Tile, tile: Tile) {
  return Math.max(Math.abs(npc.x - tile.x), Math.abs(npc.y - tile.y)) <= NPC_TALK_RANGE;
}

export interface Npc {
  spec: NpcSpec;
  image: Phaser.GameObjects.Image;
  tag: string;
  flip: boolean;
  /** 지금 장(줄 안 0~4) */
  frame: number;
  /** 짧은 동작 차례. 서 있으면 −1 */
  step: number;
  /** 서 있으면 다음 동작을 시작할 때, 동작 중이면 다음 장으로 넘길 때(scene.time.now) */
  nextAt: number;
}

const gap = () => ACTION_GAP_MS[0] + Math.random() * (ACTION_GAP_MS[1] - ACTION_GAP_MS[0]);

const DEFAULT_GREET = '어서 오세요.';
/** 그 NPC에게 이 번째까지 말 걸면 처음 온 사람, 이 수를 넘으면 단골(그 기기에서 셈) */
const NEWCOMER_TALKS = 10;
const REGULAR_TALKS = 30;
/** 다시 고르지 않는 바로 앞 줄 수 */
const RECENT_LINES = 3;
/** 그 기기에 NPC마다 적는 이야기 수와 날 줄을 쓴 날: { [talkId]: { n, day } } */
const TALK_KEY = 'npc-talk';

type TalkBook = Record<string, { n?: number; day?: string }>;
let talkBook: TalkBook | null | undefined;

function readTalkBook(): TalkBook | null {
  if (talkBook !== undefined) return talkBook;
  try {
    const raw = JSON.parse(localStorage.getItem(TALK_KEY) ?? '{}') as unknown;
    talkBook = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as TalkBook) : {};
  } catch {
    talkBook = null;
  }
  return talkBook;
}

function saveTalkBook() {
  if (!talkBook) return;
  try {
    localStorage.setItem(TALK_KEY, JSON.stringify(talkBook));
  } catch {
    // 못 쓰면 이번 화면 동안만 센다.
  }
}

/** 이번 이야기를 하나 세고 센 수를 돌려준다. 기기에 적지 못하면 null(처음 온 사람도 단골도 아님). */
function talkCount(id: string): number | null {
  const book = readTalkBook();
  if (!book) return null;
  const entry = (book[id] ??= {});
  entry.n = (Number.isFinite(entry.n) ? (entry.n as number) : 0) + 1;
  saveTalkBook();
  return entry.n;
}

/** 날 줄을 쓴 날(한국 시간 'M-D'). 기기에 적지 못하면 이번 화면 동안만 기억한다. */
const dayUsedHere = new Map<string, string>();
function dayUsed(id: string): string | undefined {
  return readTalkBook()?.[id]?.day ?? dayUsedHere.get(id);
}
function markDay(id: string, date: string) {
  dayUsedHere.set(id, date);
  const book = readTalkBook();
  if (!book) return;
  (book[id] ??= {}).day = date;
  saveTalkBook();
}

/** 한국 시간의 시·달·날짜 */
function kstNow(now = Date.now()) {
  const d = new Date(now + 9 * 3_600_000);
  const month = d.getUTCMonth() + 1;
  const date = d.getUTCDate();
  return { hour: d.getUTCHours(), month, day: date, date: `${d.getUTCFullYear()}-${month}-${date}` };
}

/** 아침 06~11시, 낮 11~17시, 노을 17~19시, 밤 19~04시, 새벽 04~06시 */
function talkPhase(hour: number): TalkPhase {
  if (hour >= 6 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'noon';
  if (hour >= 17 && hour < 19) return 'sunset';
  if (hour >= 4 && hour < 6) return 'dawn';
  return 'night';
}

/** 봄 3~5월, 여름 6~8월, 가을 9~11월, 겨울 12~2월 */
function talkSeason(month: number): TalkSeason {
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

/** 크리스마스 12월 24~25일, 새해 첫날 1월 1일 */
function talkDay({ month, day }: { month: number; day: number }): TalkDay | null {
  if (month === 12 && (day === 24 || day === 25)) return 'xmas';
  if (month === 1 && day === 1) return 'newyear';
  return null;
}

function pickOne<T>(list: readonly T[]): T | undefined {
  return list.length ? list[Math.floor(Math.random() * list.length)] : undefined;
}

/**
 * 지금 맵의 NPC들. 그림 한 장씩이고 장이 바뀔 때만 setFrame한다. update는 맵에 NPC가 없으면 바로 끝나고,
 * 있으면 NPC마다 시각 비교 한두 번이다(한 맵 최대 3명). 돌아보기는 내 칸이 바뀔 때만 다시 센다(watch).
 */
export class NpcCrew {
  private list: Npc[] = [];
  private idle = 0;
  private seen = { x: Number.NaN, y: Number.NaN };
  /** 이번 맵 방문에 이미 인사한 NPC id */
  private readonly greeted = new Set<string>();
  /** NPC(talkId)마다 바로 앞에 한 줄들. 화면을 켜 둔 동안만, 맵을 옮겨도 남는다. */
  private readonly recent = new Map<string, string[]>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly tags: NameTags,
  ) {}

  get all(): readonly Npc[] {
    return this.list;
  }

  /** 맵에 들어올 때 NPC를 세우고 이름표를 단다. */
  show(id: MapId) {
    const specs = npcsOf(id);
    if (!specs.length) return;
    if (!this.scene.textures.exists(NPC_TEXTURE)) this.scene.textures.addSpriteSheet(NPC_TEXTURE, sprite('npcs'), { frameWidth: NPC_W, frameHeight: NPC_H });
    const now = this.scene.time.now;
    this.idle = Math.floor(now / IDLE_FRAME_MS) % 2;
    for (const spec of specs) {
      const c = tileCenter(spec.x, spec.y);
      const flip = spec.face === '+x';
      const image = this.scene.add
        .image(c.x, c.y, NPC_TEXTURE, spec.row * PER_ROW + this.idle)
        .setOrigin(0.5, NPC_FOOT_Y / NPC_H)
        .setDepth(depthOf(spec.x, spec.y) + 1)
        .setFlipX(flip);
      const tag = `npc-${id}-${spec.id}`;
      this.tags.add(tag, spec.name, 'npc');
      this.list.push({ spec, image, tag, flip, frame: this.idle, step: -1, nextAt: now + gap() });
    }
  }

  /** 맵을 떠날 때 */
  clear() {
    for (const npc of this.list) {
      npc.image.destroy();
      this.tags.remove(npc.tag);
    }
    this.list = [];
    this.greeted.clear();
    this.seen = { x: Number.NaN, y: Number.NaN };
  }

  /** 이름표 자리: 발 − lift(px) */
  placeTags(place: (tag: string, x: number, y: number) => void, lift: number) {
    for (const { image, tag } of this.list) place(tag, image.x, image.y - lift);
  }

  /** 서기 두 장 바꾸기와 짧은 동작. 동작은 화면(+32px) 안에서만 시작하고, 동작 중 화면 밖으로 나가면 서기로 돌아간다. */
  update(time: number, view: Phaser.Geom.Rectangle) {
    if (!this.list.length) return;
    const idle = Math.floor(time / IDLE_FRAME_MS) % 2;
    const breathe = idle !== this.idle;
    this.idle = idle;
    for (const npc of this.list) {
      const { frames, frameMs } = npc.spec.action;
      if (npc.step >= 0) {
        if (time < npc.nextAt) continue;
        npc.step++;
        if (npc.step >= frames.length || !this.onScreen(npc, view)) {
          npc.step = -1;
          npc.nextAt = time + gap();
          this.setFrame(npc, idle);
          continue;
        }
        this.setFrame(npc, frames[npc.step]);
        npc.nextAt = time + frameMs;
        continue;
      }
      if (time >= npc.nextAt) {
        if (this.onScreen(npc, view)) {
          npc.step = 0;
          npc.nextAt = time + frameMs;
          this.setFrame(npc, frames[0]);
          continue;
        }
        npc.nextAt = time + gap();
      }
      if (breathe) this.setFrame(npc, idle);
    }
  }

  /** 내 칸이 바뀌었을 때만: 범위 안 NPC는 나를 돌아보고, 범위 밖 NPC는 처음 보던 쪽으로 돌아간다. */
  watch(me: Tile) {
    if (!this.list.length || (me.x === this.seen.x && me.y === this.seen.y)) return;
    this.seen = { x: me.x, y: me.y };
    for (const npc of this.list) this.turn(npc, inTalkRange(npc.spec, me) ? me : null);
  }

  /** 범위 안에서 말 걸 NPC: 직선 거리가 가까운 쪽, 같으면 facing 쪽에 더 가까운 쪽 */
  pick(me: Tile, facing: { dx: number; dy: number }): Npc | undefined {
    let best: Npc | undefined;
    let bestDist = Infinity;
    let bestAim = -Infinity;
    for (const npc of this.list) {
      if (!inTalkRange(npc.spec, me)) continue;
      const dx = npc.spec.x - me.x;
      const dy = npc.spec.y - me.y;
      const dist = Math.hypot(dx, dy);
      const aim = dist ? (dx * facing.dx + dy * facing.dy) / dist : 0;
      if (dist < bestDist - 1e-9 || (Math.abs(dist - bestDist) <= 1e-9 && aim > bestAim)) {
        best = npc;
        bestDist = dist;
        bestAim = aim;
      }
    }
    return best;
  }

  /** 화면 점 (wx, wy)가 NPC 그림(22 × 40) 위면 그 NPC(겹치면 앞에 그린 쪽) */
  hit(wx: number, wy: number): Npc | undefined {
    let best: Npc | undefined;
    for (const npc of this.list) {
      const { x, y, depth } = npc.image;
      if (wx < x - NPC_W / 2 || wx >= x + NPC_W / 2 || wy < y - NPC_FOOT_Y || wy > y + NPC_H - NPC_FOOT_Y) continue;
      if (!best || depth > best.image.depth) best = npc;
    }
    return best;
  }

  /** 말을 건다: 나를 돌아보고 머리 위 말풍선(처음이면 첫 인사). */
  greet(npc: Npc, me: Tile) {
    this.turn(npc, me);
    const first = !this.greeted.has(npc.spec.id);
    this.greeted.add(npc.spec.id);
    this.tags.say(npc.tag, this.pickLine(npc.spec.id, first), NPC_BUBBLE_MS);
  }

  /**
   * 대사 고르기(npc-lines-1128.md 2절): 맵에 들어와 처음이면 첫 인사. 크리스마스·새해 첫날이면 그날 첫 번 뒤 이야기에 날 줄을 한 번.
   * 그 밖에는 3번에 1번 그때 줄(때·계절·날·처음 온 사람·단골), 나머지는 늘 하는 말. 바로 앞 3줄은 다시 고르지 않는다.
   */
  private pickLine(npcId: string, first: boolean): string {
    const id = talkId(npcId);
    const lines = npcLinesOf(npcId);
    const count = talkCount(id);
    if (!lines) return DEFAULT_GREET;
    if (first) return lines.greet;
    const now = kstNow();
    const day = talkDay(now);
    const recent = this.recent.get(id) ?? [];
    let line: string | undefined;
    if (day && dayUsed(id) !== now.date) {
      line = lines.day[day];
      markDay(id, now.date);
    }
    if (!line && Math.random() < 1 / 3) {
      const moment = [lines.phase[talkPhase(now.hour)], lines.season[talkSeason(now.month)]];
      if (day) moment.push(lines.day[day]);
      if (count !== null && count <= NEWCOMER_TALKS) moment.push(lines.newcomer);
      if (count !== null && count > REGULAR_TALKS) moment.push(lines.regular);
      line = pickOne(moment.filter((text) => !recent.includes(text)));
    }
    line ??= pickOne(lines.always.filter((text) => !recent.includes(text))) ?? pickOne(lines.always) ?? lines.greet;
    this.recent.set(id, [...recent, line].slice(-RECENT_LINES));
    return line;
  }

  /** 좌우만 돈다. toward가 없으면 처음 보던 쪽이고, 화면에서 바로 위·아래면 지금 쪽을 둔다. */
  private turn(npc: Npc, toward: Tile | null) {
    let flip = npc.spec.face === '+x';
    if (toward) {
      const screenX = toward.x - npc.spec.x - (toward.y - npc.spec.y);
      flip = screenX === 0 ? npc.flip : screenX > 0;
    }
    if (flip === npc.flip) return;
    npc.flip = flip;
    npc.image.setFlipX(flip);
  }

  private setFrame(npc: Npc, frame: number) {
    if (npc.frame === frame) return;
    npc.frame = frame;
    npc.image.setFrame(npc.spec.row * PER_ROW + frame);
  }

  private onScreen({ image }: Npc, view: Phaser.Geom.Rectangle) {
    return (
      image.x + NPC_W / 2 >= view.x - VIEW_PAD &&
      image.x - NPC_W / 2 <= view.right + VIEW_PAD &&
      image.y >= view.y - VIEW_PAD &&
      image.y - NPC_FOOT_Y <= view.bottom + VIEW_PAD
    );
  }
}
