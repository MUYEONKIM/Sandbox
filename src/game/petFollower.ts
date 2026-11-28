import Phaser from 'phaser';
import { STEP_MS } from '../config';
import { depthOf, gridToWorld, keepDepth, worldToGrid } from '../iso';
import { sprite } from '../art/sprites';
import { NO_BED, NO_LAP, PET_CELL, PET_FX, PET_KINDS, PET_MOODS, petFrameIndex, type PetFrame, type PetFx, type PetKind, type SentMood } from './pets';
import type { Avatar } from './avatar';
import type { Tile } from './world';

/**
 * 주인 하나의 펫 그림 하나(2026-11-28 코드 묶음 7, 그림·규칙 pets.md 5절·8-7·9절). 부딪힘·총알 없음(꾸밈).
 * - 따라오기: 주인이 떠난 칸(발자취)만 밟는다. 걸을 때 2칸 뒤, 0.18초 넘게 서면 1칸 뒤. 3칸 넘게 뒤처지면 × 0.6, 8칸 넘으면 주인 뒤로 옮긴다.
 * - 앉기·눕기: 주인 자세(Pose.pet)에 담긴 자리로 0.32초 걸어가 앉고, 4초 뒤 무릎(또는 옆 바닥에서 웅크림). 누우면 침대 위로.
 * - 0인 동안(weak): 걸음 × 2, 고개 떨군 걸음, 서면 0.25초 뒤 엎드림.
 * 렌더링(pets.md 5-5): 매 프레임 하는 일은 주인 칸이 바뀌었는지 보는 것뿐이고, 걷거나 뛰는 동안만 자리를 고친다. 그림 칸·뒤집기·깊이는 바뀔 때만,
 * 화면(여유 64px) 밖이면 그리지 않고(setVisible false) 칸도 고르지 않는다.
 */
export const PET_TEXTURE = 'pets';
const FX_TEXTURE = 'pet-fx';
const MOOD_TEXTURE = 'pet-moods';
/** 다른 사람 펫 머리 위 기분 얼굴 크기(아트 px, faces-pixel 40px를 부드럽게 줄임, 제가 정한 것) */
const MOOD_SIZE = 16;

export function ensurePetTextures(scene: Phaser.Scene) {
  const textures = scene.textures;
  if (!textures.exists(PET_TEXTURE)) textures.addSpriteSheet(PET_TEXTURE, sprite('pets/pets'), { frameWidth: PET_CELL.w, frameHeight: PET_CELL.h });
  if (!textures.exists(FX_TEXTURE)) {
    const fx = textures.addImage(FX_TEXTURE, sprite('pets/pet-fx'))!;
    for (const [name, [x, y, w, h]] of Object.entries(PET_FX)) fx.add(name, 0, x, y, w, h);
  }
}

/** 기분 얼굴(다른 사람 화면): 처음 쓸 때 한 번 40px 시트를 16px로 줄여 굽는다. */
function ensureMoodTexture(scene: Phaser.Scene) {
  if (scene.textures.exists(MOOD_TEXTURE)) return;
  const src = sprite('pets/faces-pixel');
  const cols = PET_MOODS.length;
  const canvas = document.createElement('canvas');
  canvas.width = cols * MOOD_SIZE;
  canvas.height = PET_KINDS.length * MOOD_SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  const texture = scene.textures.addCanvas(MOOD_TEXTURE, canvas)!;
  for (let r = 0; r < PET_KINDS.length; r++) for (let c = 0; c < cols; c++) texture.add(r * cols + c, 0, c * MOOD_SIZE, r * MOOD_SIZE, MOOD_SIZE, MOOD_SIZE);
}

/** 앉거나 누운 주인 곁 펫 자리(화면 px, 펫 기준점). GameScene.applyPose가 정해 Pose.pet에 싣는다. */
export interface PetSeat {
  kind: 'sit' | 'lie';
  /** 앉기: 옆자리(sit·sitBack, 뒤로 앉음·무릎 안 되는 가구면 4초 뒤 여기서 웅크림). 눕기: 침대 앞 옆 바닥 */
  side: { x: number; y: number; depth: number; flip: boolean; back: boolean; cell: Tile };
  /** 무릎·침대 위(웅크림). 없으면 옆 바닥에서 웅크림 */
  top: { x: number; y: number; depth: number; flip: boolean } | null;
}

const SIDE_CELLS = 0.62;
const BED_ALONG = 0.66;
const LAP = { sit: [-4, -1], sitFloor: [1, -2] } as const;
const FACE = {
  SW: { look: [0, 1], side: [1, 0], back: false, flip: false },
  SE: { look: [1, 0], side: [0, 1], back: false, flip: true },
  NE: { look: [0, -1], side: [1, 0], back: true, flip: true },
  NW: { look: [-1, 0], side: [0, 1], back: true, flip: false },
} as const;
const gridStep = (gx: number, gy: number, k: number) => ({ x: (gx - gy) * 16 * k, y: (gx + gy) * 8 * k });
const cellOf = (x: number, y: number) => {
  const g = worldToGrid(x, y);
  return { x: Math.floor(g.gx), y: Math.floor(g.gy) };
};

/** 앉은 사람 곁 자리(pets.md 3절: 옆 칸 ① 화면 앞쪽 옆 → ② 반대쪽 옆 → ③ 보는 쪽 앞, 걸을 수 있고 그 가구가 아닌 첫 칸) */
export function sitSeat(o: {
  /** 가구(또는 맵 소품) 기준점 화면 px. y는 받침 높이를 뺀 바닥 */
  cx: number;
  cy: number;
  spot: { dx: number; dy: number; z: number; face: keyof typeof FACE };
  furniture: string | null;
  /** 사람 그림 기준점과 깊이 */
  person: { x: number; y: number; depth: number };
  inside: (x: number, y: number) => boolean;
  walkable: (x: number, y: number) => boolean;
}): PetSeat {
  const F = FACE[o.spot.face];
  const floor = o.spot.z <= 5;
  let at = { x: 0, y: 0 };
  let cell = { x: 0, y: 0 };
  let first: { at: typeof at; cell: typeof cell } | null = null;
  for (const d of [F.side, [-F.side[0], -F.side[1]], F.look]) {
    const st = gridStep(d[0], d[1], SIDE_CELLS);
    at = { x: o.cx + o.spot.dx + st.x, y: o.cy + o.spot.dy + st.y };
    cell = cellOf(at.x, at.y);
    first ??= { at, cell };
    if (!o.inside(cell.x, cell.y) && o.walkable(cell.x, cell.y)) break;
    at = first.at;
    cell = first.cell;
  }
  const lapOk = !F.back && !(o.furniture && NO_LAP.test(o.furniture));
  const [lx, ly] = LAP[floor ? 'sitFloor' : 'sit'];
  return {
    kind: 'sit',
    side: { x: at.x, y: at.y, depth: depthOf(cell.x, cell.y) + 0.95, flip: F.flip, back: F.back, cell },
    top: lapOk ? { x: o.person.x + (F.flip ? -lx : lx), y: o.person.y + ly, depth: o.person.depth + 0.1, flip: F.flip } : null,
  };
}

/** 누운 사람 곁 자리(pets.md 3절): 머리→발 0.66 자리에서 몸 축에 수직으로 화면 앞쪽, 한 칸 폭 침대 0.22칸(다리 위)·두 칸 이상 0.62칸(옆 빈자리) */
export function lieSeat(o: {
  cx: number;
  cy: number;
  lie: { head: readonly number[]; foot: readonly number[]; z: number };
  /** 가구가 차지한 칸 수(x, y) */
  a: number;
  b: number;
  furniture: string | null;
  person: { depth: number };
}): PetSeat {
  const { head, foot, z } = o.lie;
  const dx = foot[0] - head[0];
  const dy = foot[1] - head[1];
  const ax = (dx / 16 + dy / 8) / 2;
  const ay = (dy / 8 - dx / 16) / 2;
  const alongX = Math.abs(ax) > Math.abs(ay);
  const perp = alongX ? [0, 1] : [1, 0];
  const across = alongX ? o.b : o.a;
  const off = gridStep(perp[0], perp[1], across >= 2 ? 0.62 : 0.22);
  const leg = { x: o.cx + head[0] + dx * BED_ALONG + off.x, y: o.cy + head[1] + dy * BED_ALONG + off.y - z };
  const out = gridStep(perp[0], perp[1], across / 2 + 0.45);
  const fl = { x: leg.x - off.x + out.x, y: leg.y + z - off.y + out.y };
  const cell = cellOf(fl.x, fl.y);
  const flip = !(head[0] < foot[0]);
  return {
    kind: 'lie',
    side: { x: fl.x, y: fl.y, depth: depthOf(cell.x, cell.y) + 0.95, flip, back: false, cell },
    top: o.furniture && NO_BED.test(o.furniture) ? null : { x: leg.x, y: leg.y, depth: o.person.depth + 0.1, flip },
  };
}

type Phase = 'walk' | 'wait' | 'hop' | 'rest';
interface ScreenMove {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  start: number;
  ms: number;
  arc: number;
  /** 걷는 동안 두 장을 0.12초마다 바꿈 */
  walk: boolean;
}
/** 돌보기·작별 연출(내 펫만, 내 화면에만) */
type ShowKind = 'pat' | 'praise' | 'feed' | 'shake' | 'shakeOnly' | 'play' | 'farewell';
interface Show {
  kind: ShowKind;
  start: number;
  hearts: boolean;
  /** 연출을 시작한 자리 */
  x: number;
  y: number;
  done?: () => void;
  /** 놀아주기: 공이 떨어지는 자리, 작별: 걸어갈 끝 자리 */
  tx: number;
  ty: number;
  /** 작별: 주인 쪽 뒤집기 */
  flipToOwner: boolean;
}

const SHOW_MS: Record<ShowKind, number> = { pat: 1800, praise: 1200, feed: 2100, shake: 1100, shakeOnly: 900, play: 1900, farewell: 2100 };
const STOP_MS = 180;
const SIT_IDLE_MS = 6000;
const WEAK_DOWN_MS = 250;
const LAP_WAIT_MS = 4000;
const SEAT_WALK_MS = 320;
const SEAT_HOP_MS = 260;
const SEAT_HOP = 8;
const JUMP_HOP = 10;
const FAR_TILES = 8;
const TRAIL_MAX = 24;
const VIEW_MARGIN = 64;
const HEAD = 15;

export class PetFollower {
  readonly image: Phaser.GameObjects.Image;
  private badge: Phaser.GameObjects.Image | null = null;
  private mood: SentMood | null = null;
  private fx: Partial<Record<'hand' | 'bowl' | 'ball' | 'sparkle' | 'heart0' | 'heart1', Phaser.GameObjects.Image>> = {};
  private shownFrame = -1;
  private shownFlip = false;
  private shown = true;
  private frame: PetFrame = 'stand';
  private flip = false;
  private back = false;
  private x = 0;
  private y = 0;
  private depth = 0;
  // 따라오기(격자)
  private tile: Tile;
  private from: Tile;
  private t = 1;
  private ms = STEP_MS;
  private arc = 0;
  private stepFrame = 0;
  private trail: (Tile & { jump: boolean })[] = [];
  private ox: number;
  private oy: number;
  private ownerJumped = false;
  private ownerMovedAt = 0;
  private idleSince = 0;
  // 앉기·눕기
  private posture: unknown = null;
  private seat: PetSeat | null = null;
  private phase: Phase = 'rest';
  private phaseAt = 0;
  private move: ScreenMove | null = null;
  private show: Show | null = null;
  /** 배부름이나 함께함이 0인 동안 */
  weak = false;
  private ended = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly owner: Avatar,
    readonly kind: PetKind,
    /** 처음 둘 칸(없으면 주인 뒤 칸) */
    at?: Tile,
  ) {
    ensurePetTextures(scene);
    this.ox = owner.tile.x;
    this.oy = owner.tile.y;
    this.tile = at ?? this.behindOwner();
    this.from = this.tile;
    this.image = scene.add.image(0, 0, PET_TEXTURE, petFrameIndex(kind, 'stand')).setOrigin(PET_CELL.ax / PET_CELL.w, PET_CELL.ay / PET_CELL.h);
    this.flip = owner.facing > 0;
    this.placeOnGrid();
    // 이미 앉거나 누운 사람(접속 명단으로 앎)의 펫은 기다리지 않고 바로 무릎·침대 위에 둔다(pets.md 5-2).
    const pose = owner.posturePose;
    if (pose?.pet) this.sitDown(pose.pet, true);
    this.posture = pose;
    this.apply(true);
  }

  /** 다른 사람 펫 머리 위 기분 얼굴(null이면 숨김). 바뀔 때만 칸을 바꾼다. */
  setMood(mood: SentMood | null) {
    if (mood === this.mood) return;
    this.mood = mood;
    if (!mood) {
      this.badge?.setVisible(false);
      return;
    }
    if (!this.badge) {
      ensureMoodTexture(this.scene);
      this.badge = this.scene.add.image(0, 0, MOOD_TEXTURE, 0).setOrigin(0.5, 1);
      if (this.tint !== null) this.badge.setTint(this.tint);
    }
    this.badge.setFrame(PET_KINDS.indexOf(this.kind) * PET_MOODS.length + PET_MOODS.indexOf(mood));
    this.apply(true);
  }

  private tint: number | null = null;
  setTint(tint: number | null) {
    this.tint = tint;
    if (tint === null) {
      this.image.clearTint();
      this.badge?.clearTint();
    } else {
      this.image.setTint(tint);
      this.badge?.setTint(tint);
    }
  }

  /** 지금 자리(화면 px, 펫 발밑) */
  get anchor() {
    return { x: this.x, y: this.y };
  }

  /** 머리 위(말풍선·하트 자리) */
  get head() {
    return { x: this.x, y: this.y - HEAD };
  }

  /** 무릎·침대 위에서 자는 중 */
  get asleep() {
    return this.seat !== null && this.phase === 'rest' && this.frame === 'curl';
  }

  /** 주인 1칸 안에 있는지 */
  get near() {
    return Math.max(Math.abs(this.tile.x - this.owner.tile.x), Math.abs(this.tile.y - this.owner.tile.y)) <= 1;
  }

  get visibleNow() {
    return this.shown && this.image.visible;
  }

  /** 주인 뒤 칸(막혔으면 둘레에서 설 수 있는 칸, 없으면 주인 칸) */
  private behindOwner(): Tile {
    const { tile, gridFacing, canStand } = this.owner;
    const behind = { x: tile.x - gridFacing.dx, y: tile.y - gridFacing.dy };
    if (!canStand || canStand(behind.x, behind.y)) return behind;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && canStand(tile.x + dx, tile.y + dy)) return { x: tile.x + dx, y: tile.y + dy };
    return { x: tile.x, y: tile.y };
  }

  private placeOnGrid() {
    const p = gridToWorld(this.tile.x + 0.5, this.tile.y + 0.5);
    this.x = p.x;
    this.y = p.y - (this.owner.floorLift?.(this.tile.x, this.tile.y) ?? 0);
    this.depth = depthOf(this.tile.x, this.tile.y) + 0.95;
  }

  update(delta: number) {
    if (this.ended) return;
    const now = this.scene.time.now;
    const o = this.owner;
    if (o.isHidden) {
      if (this.image.visible) this.setShown(false);
      return;
    }
    const pose = o.posturePose;
    if (pose !== this.posture) {
      const was = this.posture;
      this.posture = pose;
      if (pose?.pet) this.sitDown(pose.pet, was !== null && this.seat !== null);
      else if (this.seat) this.standUp();
    }
    if (this.show) {
      this.stepShow(now);
      return;
    }
    if (this.seat) {
      this.stepSeat(now);
      return;
    }
    this.trackOwner(now);
    if (this.t < 1) {
      this.t = Math.min(1, this.t + delta / this.ms);
      const k = this.t;
      const fx = this.from.x + (this.tile.x - this.from.x) * k;
      const fy = this.from.y + (this.tile.y - this.from.y) * k;
      const p = gridToWorld(fx + 0.5, fy + 0.5);
      const lift = this.owner.floorLift ? this.owner.floorLift(this.tile.x, this.tile.y) : 0;
      const hop = this.arc ? this.arc * 4 * k * (1 - k) : Math.sin(Math.PI * k);
      this.x = p.x;
      this.y = p.y - lift - hop;
      if (this.t >= 1) {
        this.y = p.y - lift;
        this.idleSince = now;
      }
      this.apply(false);
      return;
    }
    if (o.isDown) {
      this.setPose(this.back ? 'sitBack' : 'sit');
      if (!this.shown) this.apply(false);
      return;
    }
    this.pickStep(now);
  }

  /** 주인 칸이 바뀌었으면 떠난 칸을 발자취에 넣는다. 멀리(2칸 넘게) 옮겼거나 8칸 넘게 떨어지면 주인 뒤 칸으로 옮긴다. */
  private trackOwner(now: number) {
    const o = this.owner.tile;
    if (o.x !== this.ox || o.y !== this.oy) {
      const jump = Math.max(Math.abs(o.x - this.ox), Math.abs(o.y - this.oy));
      if (jump > 2) {
        // 포탈·맵 옮김·엘리베이터·부활: 도착 칸 뒤에 바로 둔다(그 칸부터 발자취).
        this.ox = o.x;
        this.oy = o.y;
        this.ownerJumped = false;
        this.ownerMovedAt = now;
        this.resetBehind(now);
        return;
      } else {
        this.trail.push({ x: this.ox, y: this.oy, jump: this.ownerJumped });
        if (this.trail.length > TRAIL_MAX) this.trail.splice(0, this.trail.length - TRAIL_MAX);
      }
      this.ownerJumped = this.owner.jumping || jump === 2;
      this.ox = o.x;
      this.oy = o.y;
      this.ownerMovedAt = now;
    }
    if (Math.max(Math.abs(this.tile.x - o.x), Math.abs(this.tile.y - o.y)) > FAR_TILES) this.resetBehind(now);
  }

  private resetBehind(now: number) {
    this.trail = [];
    this.tile = this.behindOwner();
    this.from = this.tile;
    this.t = 1;
    this.placeOnGrid();
    this.idleSince = now;
    this.apply(true);
  }

  private pickStep(now: number) {
    const gap = this.owner.moving || now - this.ownerMovedAt < STOP_MS ? 2 : 1;
    const ox = this.ox;
    const oy = this.oy;
    const d = Math.max(Math.abs(this.tile.x - ox), Math.abs(this.tile.y - oy));
    if (d <= gap) {
      this.idle(now);
      return;
    }
    const path = this.trail;
    const goal = path.length - (gap - 1) - 1;
    let pick = -1;
    for (let i = Math.min(goal, path.length - 1); i >= 0; i--) {
      const p = path[i];
      const step = Math.max(Math.abs(p.x - this.tile.x), Math.abs(p.y - this.tile.y));
      if (step === 1) {
        pick = i;
        break;
      }
    }
    let to: Tile & { jump: boolean };
    if (pick >= 0) {
      to = path[pick];
      path.splice(0, pick + 1);
    } else if (goal >= 0 && path.length) {
      to = path.shift()!;
    } else {
      // 발자취가 없으면(옮긴 직후) 주인 쪽으로 한 칸
      to = { x: this.tile.x + Math.sign(ox - this.tile.x), y: this.tile.y + Math.sign(oy - this.tile.y), jump: false };
    }
    const dist = Math.max(1, Math.max(Math.abs(to.x - this.tile.x), Math.abs(to.y - this.tile.y)));
    const base = this.owner.stepMs || STEP_MS;
    this.stepTo(to, base * dist * (d > 3 ? 0.6 : 1) * (this.weak ? 2 : 1), to.jump || dist >= 2 ? JUMP_HOP : 0);
  }

  private stepTo(to: Tile, ms: number, arc: number) {
    const dx = to.x - this.tile.x;
    const dy = to.y - this.tile.y;
    this.face(dx - dy, dx + dy);
    this.from = this.tile;
    this.tile = { x: to.x, y: to.y };
    this.t = 0;
    this.ms = Math.max(1, ms);
    this.arc = arc;
    this.stepFrame = 1 - this.stepFrame;
    this.depth = depthOf(Math.max(this.from.x, this.tile.x), Math.max(this.from.y, this.tile.y)) + 0.95;
    const walk = this.weak ? (this.stepFrame ? 'droopA' : 'droopB') : this.stepFrame ? 'walkA' : 'walkB';
    this.frame = (this.back ? `${walk}Back` : walk) as PetFrame;
  }

  private face(screenX: number, screenY: number) {
    if (screenX !== 0) this.flip = screenX > 0;
    if (screenY !== 0) this.back = screenY < 0;
  }

  /** 서 있음: 0인 동안 0.25초 뒤 엎드림, 주인이 6초 넘게 서 있으면 앉음 */
  private idle(now: number) {
    const still = now - Math.max(this.idleSince, this.ownerMovedAt);
    let frame: PetFrame;
    if (this.weak) frame = still > WEAK_DOWN_MS ? 'weak' : this.back ? 'droopBack' : 'droop';
    else if (still > SIT_IDLE_MS) frame = this.back ? 'sitBack' : 'sit';
    else frame = this.back ? 'standBack' : 'stand';
    if (frame !== this.frame) {
      this.frame = frame;
      this.apply(false);
    } else if (!this.shown) this.apply(false);
  }

  private setPose(frame: PetFrame) {
    if (frame === this.frame) return;
    this.frame = frame;
    this.apply(false);
  }

  // ───────── 앉기·눕기 ─────────
  private sitDown(seat: PetSeat, instant: boolean) {
    const keepTop = this.seat !== null && this.phase === 'rest' && this.frame === 'curl';
    this.seat = seat;
    this.t = 1;
    this.trail = [];
    if (instant || keepTop) {
      this.restAt(this.scene.time.now, keepTop || seat.kind === 'lie' || instant);
      return;
    }
    this.phase = 'walk';
    this.phaseAt = this.scene.time.now;
    this.face(seat.side.x - this.x, 0);
    this.move = { x0: this.x, y0: this.y, x1: seat.side.x, y1: seat.side.y, start: this.phaseAt, ms: SEAT_WALK_MS, arc: 0, walk: true };
    this.depth = seat.side.depth;
  }

  /** 끝 자리에 바로 둔다(무릎·침대 위, 없으면 옆 바닥 웅크림). top이 false면 옆에 앉은 채(4초 기다림 없이 앉은 자리) */
  private restAt(now: number, top: boolean) {
    const seat = this.seat!;
    this.move = null;
    this.phase = 'rest';
    this.phaseAt = now;
    if (top && seat.top) {
      this.x = seat.top.x;
      this.y = seat.top.y;
      this.depth = seat.top.depth;
      this.flip = seat.top.flip;
    } else {
      this.x = seat.side.x;
      this.y = seat.side.y;
      this.depth = seat.side.depth;
      this.flip = seat.side.flip;
    }
    this.frame = 'curl';
    this.apply(true);
  }

  private stepSeat(now: number) {
    const seat = this.seat!;
    if (this.move) {
      if (!this.stepMove(now)) return;
      if (this.phase === 'walk') {
        if (seat.kind === 'lie') {
          if (!seat.top) return this.restAt(now, false);
          this.phase = 'hop';
          this.phaseAt = now;
          this.frame = 'stand';
          this.move = { x0: this.x, y0: this.y, x1: seat.top.x, y1: seat.top.y, start: now, ms: SEAT_HOP_MS, arc: SEAT_HOP, walk: false };
          this.depth = seat.top.depth;
          return;
        }
        this.phase = 'wait';
        this.phaseAt = now;
        this.flip = seat.side.flip;
        this.frame = seat.side.back ? 'sitBack' : 'sit';
        this.apply(true);
        return;
      }
      // 뛰어오르기 끝
      this.restAt(now, true);
      return;
    }
    // 화면 밖에서 숨겼던 펫은 카메라가 다가오면 다시 보인다(앉아 있는 동안은 이것만 본다).
    if (!this.shown) this.apply(false);
    if (this.phase === 'wait' && now - this.phaseAt >= LAP_WAIT_MS) {
      if (!seat.top) return this.restAt(now, false);
      this.phase = 'hop';
      this.phaseAt = now;
      this.move = { x0: this.x, y0: this.y, x1: seat.top.x, y1: seat.top.y, start: now, ms: SEAT_HOP_MS, arc: SEAT_HOP, walk: false };
      this.depth = seat.top.depth;
    }
  }

  /** 화면 px 직선 이동 한 프레임. 끝났으면 true */
  private stepMove(now: number) {
    const m = this.move!;
    const k = Math.min(1, (now - m.start) / m.ms);
    this.x = m.x0 + (m.x1 - m.x0) * k;
    this.y = m.y0 + (m.y1 - m.y0) * k - (m.arc ? m.arc * 4 * k * (1 - k) : 0);
    if (m.walk) {
      const walk = Math.floor((now - m.start) / 120) % 2 ? 'walkB' : 'walkA';
      this.frame = (this.back ? `${walk}Back` : walk) as PetFrame;
    }
    this.apply(false);
    if (k < 1) return false;
    this.move = null;
    return true;
  }

  /** 주인이 일어나면 옆 칸(① 칸)에 내려와 서고, 그 칸부터 다시 따라간다. */
  private standUp() {
    const seat = this.seat!;
    this.seat = null;
    this.move = null;
    this.tile = { ...seat.side.cell };
    this.from = this.tile;
    this.t = 1;
    this.trail = [];
    this.ox = this.owner.tile.x;
    this.oy = this.owner.tile.y;
    this.ownerMovedAt = this.scene.time.now;
    this.idleSince = this.ownerMovedAt;
    this.placeOnGrid();
    this.frame = this.back ? 'standBack' : 'stand';
    this.apply(true);
  }

  // ───────── 돌보기·작별 연출(pets.md 8-7, 9-4) ─────────
  /**
   * 돌보기 동작을 보인다. hearts: 하트를 띄울지(10초에 한 번까지는 부르는 쪽이 정함). 자는 동안(무릎·침대)에는 그림을 바꾸지 않고 손·하트만.
   * 연출 동안은 따라가기를 멈추고, 끝나면 이어 간다.
   */
  playCare(kind: Exclude<ShowKind, 'farewell'>, hearts: boolean) {
    if (this.ended) return;
    this.endShow();
    const now = this.scene.time.now;
    const dir = { x: this.x - this.owner.anchor.x, y: this.y - this.owner.anchor.y };
    const len = Math.hypot(dir.x, dir.y) || 1;
    // 공은 주인 → 펫 쪽으로 펫 너머 1.3칸(제가 정한 방향)
    const reach = 1.3 * 18;
    this.show = {
      kind,
      start: now,
      hearts,
      x: this.x,
      y: this.y,
      tx: this.x + (dir.x / len) * reach,
      ty: this.y + (dir.y / len) * reach * 0.5,
      flipToOwner: this.owner.anchor.x > this.x,
    };
  }

  /** 작별 연출(약 2초): 한 번 돌아보고 주인 반대쪽으로 세 칸 걸어가며 흐려진다. 끝나면 done */
  farewell(done: () => void) {
    if (this.ended) return done();
    this.endShow();
    this.seat = null;
    this.move = null;
    const away = { x: Math.sign(this.tile.x - this.owner.tile.x), y: Math.sign(this.tile.y - this.owner.tile.y) };
    if (!away.x && !away.y) {
      // 주인 칸에 겹쳐 있으면 주인이 보는 반대쪽으로
      away.x = -this.owner.gridFacing.dx;
      away.y = -this.owner.gridFacing.dy || (away.x ? 0 : 1);
    }
    const end = gridToWorld(this.tile.x + 0.5 + away.x * 3, this.tile.y + 0.5 + away.y * 3);
    this.show = {
      kind: 'farewell',
      start: this.scene.time.now,
      hearts: false,
      x: this.x,
      y: this.y,
      tx: end.x,
      ty: end.y - (this.y - gridToWorld(this.tile.x + 0.5, this.tile.y + 0.5).y),
      flipToOwner: this.owner.anchor.x > this.x,
      done,
    };
  }

  private fxImage(name: 'hand' | 'bowl' | 'ball' | 'sparkle' | 'heart0' | 'heart1') {
    let image = this.fx[name];
    if (!image) {
      const frame: PetFx = name === 'heart0' || name === 'heart1' ? 'heart' : name;
      image = this.scene.add.image(0, 0, FX_TEXTURE, frame).setOrigin(0.5, 1);
      this.fx[name] = image;
    }
    return image.setVisible(true);
  }

  private hideFx(name: 'hand' | 'bowl' | 'ball' | 'sparkle' | 'heart0' | 'heart1') {
    this.fx[name]?.setVisible(false);
  }

  private endShow() {
    if (!this.show) return;
    for (const image of Object.values(this.fx)) image?.setVisible(false);
    const { x, y } = this.show;
    const was = this.show;
    this.show = null;
    this.image.setAlpha(1);
    this.x = x;
    this.y = y;
    if (was.kind !== 'farewell') {
      this.frame = this.seat && this.phase === 'rest' ? 'curl' : this.weak ? 'weak' : this.back ? 'standBack' : 'stand';
      this.apply(true);
    }
  }

  private heart(name: 'heart0' | 'heart1', ms: number) {
    // 0.8초 동안 머리에서 12px 떠오르며 옅어진다.
    if (ms < 0 || ms > 800) return this.hideFx(name);
    const k = ms / 800;
    const h = this.fxImage(name);
    h.setPosition(Math.round(this.x), Math.round(this.y - HEAD - 12 * k)).setAlpha(1 - k * k);
    keepDepth(h, this.depth + 0.04);
  }

  private stepShow(now: number) {
    const s = this.show!;
    const ms = now - s.start;
    if (ms >= SHOW_MS[s.kind]) {
      const done = s.done;
      if (s.kind === 'farewell') {
        for (const image of Object.values(this.fx)) image?.setVisible(false);
        this.show = null;
        this.end();
        done?.();
        return;
      }
      this.endShow();
      return;
    }
    const sleeping = this.seat !== null && this.phase === 'rest';
    const front = this.flip;
    let frame: PetFrame = this.frame;
    this.x = s.x;
    this.y = s.y;
    if (s.kind === 'pat') {
      if (!sleeping) frame = 'happy';
      const hand = this.fxImage('hand');
      hand.setPosition(Math.round(this.x + 2.5 * Math.sin((ms / 450) * Math.PI * 2)), Math.round(this.y - HEAD + 1));
      keepDepth(hand, this.depth + 0.05);
      if (s.hearts) {
        this.heart('heart0', ms - 500);
        this.heart('heart1', ms - 1000);
      }
    } else if (s.kind === 'praise') {
      if (!sleeping) frame = 'happy';
      if (s.hearts) this.heart('heart0', ms - 200);
    } else if (s.kind === 'feed' || s.kind === 'shake') {
      const bowl = this.fxImage('bowl');
      const bx = this.x + (front ? 9 : -9);
      bowl.setPosition(Math.round(bx), Math.round(this.y + 3));
      keepDepth(bowl, this.depth + 0.01);
      if (s.kind === 'feed') {
        bowl.setFrame(ms >= 1200 ? 'bowlEmpty' : 'bowl');
        if (ms < 1700) {
          frame = 'eat';
          this.y = s.y + (Math.floor(ms / 240) % 2);
        } else {
          frame = 'happy';
          if (s.hearts) this.heart('heart0', ms - 1700);
        }
      } else {
        bowl.setFrame('bowl');
        frame = 'stand';
        if (ms >= 250 && ms < 250 + 4 * 120) this.flip = Math.floor((ms - 250) / 120) % 2 ? !front : front;
      }
    } else if (s.kind === 'shakeOnly') {
      frame = 'stand';
      if (ms >= 150 && ms < 150 + 4 * 120) this.flip = Math.floor((ms - 150) / 120) % 2 ? !front : front;
    } else if (s.kind === 'play') {
      // 0~0.6초 공이 주인 손에서 펫 너머로(높이 26px), 0.6~1.0 펫이 공으로, 1.0~1.4 돌아옴, 1.4~1.9 한 번 뛰고 반짝이·하트
      const ball = this.fxImage('ball');
      const hand = { x: this.owner.anchor.x, y: this.owner.anchor.y - 12 };
      if (ms < 600) {
        const k = ms / 600;
        ball.setPosition(Math.round(hand.x + (s.tx - hand.x) * k), Math.round(hand.y + (s.ty - hand.y) * k - 26 * 4 * k * (1 - k)));
        keepDepth(ball, Math.max(this.depth, this.owner.sprite.depth) + 0.05);
        frame = this.back ? 'standBack' : 'stand';
      } else if (ms < 1000) {
        const k = (ms - 600) / 400;
        ball.setPosition(Math.round(s.tx), Math.round(s.ty));
        this.x = s.x + (s.tx - s.x) * k;
        this.y = s.y + (s.ty - s.y) * k;
        this.flip = s.tx > s.x;
        frame = Math.floor(ms / 120) % 2 ? 'walkA' : 'walkB';
      } else if (ms < 1400) {
        this.hideFx('ball');
        const k = (ms - 1000) / 400;
        this.x = s.tx + (s.x - s.tx) * k;
        this.y = s.ty + (s.y - s.ty) * k;
        this.flip = s.x > s.tx;
        frame = Math.floor(ms / 120) % 2 ? 'walkA' : 'walkB';
      } else {
        const k = (ms - 1400) / 500;
        frame = 'happy';
        this.y = s.y - 5 * 4 * Math.min(k * 2, 1) * (1 - Math.min(k * 2, 1));
        const sp = this.fxImage('sparkle');
        sp.setPosition(Math.round(this.x + 6), Math.round(s.y - HEAD - 2)).setAlpha(1 - k);
        keepDepth(sp, this.depth + 0.05);
        if (s.hearts) this.heart('heart0', ms - 1400);
      }
    } else if (s.kind === 'farewell') {
      if (ms < 300) frame = 'weak';
      else if (ms < 900) {
        frame = 'droop';
        this.flip = s.flipToOwner;
      } else {
        const k = (ms - 900) / 1200;
        this.x = s.x + (s.tx - s.x) * k;
        this.y = s.y + (s.ty - s.y) * k;
        this.flip = s.tx > s.x;
        const backward = s.ty < s.y;
        const step = Math.floor((ms - 900) / 200) % 2 ? 'droopA' : 'droopB';
        frame = (backward ? `${step}Back` : step) as PetFrame;
        this.image.setAlpha(1 - k);
      }
    }
    this.frame = frame;
    this.apply(false);
  }

  // ───────── 그리기 ─────────
  private setShown(shown: boolean) {
    this.shown = shown;
    this.image.setVisible(shown);
    this.badge?.setVisible(shown && this.mood !== null && !this.asleep && this.show?.kind !== 'farewell');
  }

  /** 바뀐 것만 Phaser에 넘긴다. 화면 밖이면 숨기고 칸을 고르지 않는다(force면 칸도 다시 봄). */
  private apply(force: boolean) {
    const view = this.scene.cameras.main.worldView;
    const on = this.x > view.x - VIEW_MARGIN && this.x < view.right + VIEW_MARGIN && this.y > view.y - VIEW_MARGIN && this.y < view.bottom + VIEW_MARGIN;
    if (!on) {
      if (this.shown) this.setShown(false);
      return;
    }
    if (!this.shown) {
      this.setShown(true);
      force = true;
    }
    const index = petFrameIndex(this.kind, this.frame);
    if (force || index !== this.shownFrame) {
      this.shownFrame = index;
      this.image.setFrame(index);
      PetFollower.frameSets++;
    }
    if (force || this.flip !== this.shownFlip) {
      this.shownFlip = this.flip;
      this.image.setFlipX(this.flip);
    }
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    if (this.image.x !== x || this.image.y !== y) this.image.setPosition(x, y);
    keepDepth(this.image, this.depth);
    if (this.badge && this.mood) {
      const show = !this.asleep && this.show?.kind !== 'farewell';
      if (this.badge.visible !== show) this.badge.setVisible(show);
      if (show) {
        if (this.badge.x !== x || this.badge.y !== y - HEAD - 1) this.badge.setPosition(x, y - HEAD - 1);
        keepDepth(this.badge, this.depth + 0.02);
      }
    }
  }

  /** 1초에 setFrame 부른 수(성능 재기용) */
  static frameSets = 0;

  private end() {
    this.ended = true;
    this.image.setVisible(false);
    this.badge?.setVisible(false);
  }

  destroy() {
    this.ended = true;
    this.image.destroy();
    this.badge?.destroy();
    for (const image of Object.values(this.fx)) image?.destroy();
  }
}
