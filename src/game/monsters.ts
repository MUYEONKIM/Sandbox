import type Phaser from 'phaser';
import { depthOf, gridToWorld } from '../iso';
import type { MonsterMessage } from '../net/session';
import type { BulletTarget } from './bullets';
import type { MonsterKind } from './dungeon';
import { MONSTER_ART } from './monsterArt';
import type { Tile } from './world';

/**
 * 던전 몬스터(2026-11-15 사용자 요청 "몬스터도 움직이고 나를 공격", 질문에 "같이 보기"를 고름).
 *
 * 같은 던전에 있는 사람 중 id가 가장 작은 사람(호스트)이 몬스터를 움직이고, 0.2초마다 위치와 체력을 맵 채널로 보낸다.
 * 나머지는 받은 위치로 부드럽게 옮겨 그린다. 누가 때리면 호스트에게 피해를 보내고(호스트 자신은 바로 깎음),
 * 호스트가 죽었다고 알리면 마지막 한 방을 친 사람이 서버 kill_monster로 보상을 받는다.
 * 몬스터가 사람을 때리면 호스트가 맞은 사람에게 알리고, 맞은 사람이 서버 monster_hit로 체력을 깎는다.
 * 호스트가 나가면 다음으로 id가 작은 사람이 마지막으로 받은 위치에서 이어서 움직인다.
 * 서버는 몬스터 체력을 모르므로 보상은 kill_monster의 간격 제한으로만 막는다(친구끼리 하는 게임이라 에이전트가 정함).
 */

/** 호스트가 위치를 보내는 간격 */
const SNAPSHOT_MS = 200;
/** 다른 사람이 있는 던전에 들어오면 이만큼은 그 사람이 보내는 몬스터 위치를 기다린 뒤에야 내가 호스트로 몬스터를 만든다. */
const HOST_WAIT_MS = 3000;
/** 공격 동작을 시작하고 실제로 맞을 때까지 */
const WINDUP_MS = 350;
const HURT_MS = 250;
/** 쓰러진 뒤 사라질 때까지 */
const DEATH_MS = 900;
const RESPAWN_MS = 6000;
/** 사람에게서 이만큼 떨어진 칸에만 새로 생긴다. */
const SPAWN_CLEAR = 7;
const WANDER_RADIUS = 4;
/** 몬스터끼리 이보다 가까우면 서로 밀어낸다. */
const SEPARATION = 0.7;
/**
 * 호스트가 아닐 때 내 공격으로 체력이 0이 되면 호스트의 답을 기다리지 않고 바로 쓰러뜨려 보인다(2026-11-15 사용자 보고
 * "죽고 나서 골드 획득량이 뜨는 게 느리다"). 이 시간 안에는 호스트의 위치 알림이 아직 살아 있다고 해도 쓰러진 채로 둔다.
 */
const PREDICT_MS = 1200;
/** 맞은 사람이 공격 거리에서 이만큼 벗어났으면 빗나간다. */
const DODGE_SLACK = 1.4;

const STATES = ['idle', 'walk', 'attack', 'hurt', 'dead'] as const;
type State = (typeof STATES)[number];
const ANIM_OF: Record<State, string> = { idle: 'idle', walk: 'walk', attack: 'attack', hurt: 'hurt', dead: 'death' };

interface Monster {
  id: number;
  kind: MonsterKind;
  x: number;
  y: number;
  hp: number;
  state: State;
  face: 1 | -1;
  // 호스트가 쓰는 값
  target: string | null;
  nextAttackAt: number;
  stateUntil: number;
  deadAt: number;
  goal: { x: number; y: number } | null;
  restUntil: number;
  // 그림
  sprite: Phaser.GameObjects.Sprite;
  fromX: number;
  fromY: number;
  lerp: number;
  shown: State | null;
  flashUntil: number;
  /** 내 공격으로 쓰러졌다고 미리 보이는 동안(이 시각까지) */
  predictedUntil: number;
}

export interface MonsterHooks {
  myId: string;
  /** 살아 있는 사람들의 칸(나 포함) */
  players(): { id: string; x: number; y: number }[];
  walkable(x: number, y: number): boolean;
  /** 나가는 포탈 앞 쉼터. 몬스터가 들어가지 않고 그 안의 사람은 쫓지 않는다. */
  safe(x: number, y: number): boolean;
  spawnTiles: Tile[];
  send(message: MonsterMessage): void;
  /** 내 공격으로 몬스터가 쓰러지는 것이 보였다. 받을 골드를 바로 띄운다(몬스터마다 한 번). */
  onKillSeen(kind: MonsterKind, x: number, y: number): void;
  /** 내가 마지막 한 방을 친 것이 확정됐다. 서버에서 보상을 받는다(몬스터마다 한 번). */
  onMyKill(kind: MonsterKind): void;
  /** 몬스터가 나를 때렸다 */
  onHitMe(kind: MonsterKind): void;
}

/** 몬스터 그림의 동작들을 Phaser에 등록한다. 게임을 시작할 때 한 번 부른다. */
export function registerMonsterAnims(scene: Phaser.Scene, image: (id: string) => HTMLImageElement) {
  for (const [id, art] of Object.entries(MONSTER_ART)) {
    const key = `monster-${id}`;
    if (!scene.textures.exists(key)) scene.textures.addSpriteSheet(key, image(id), { frameWidth: art.width, frameHeight: art.height });
    const rows = ['idle', 'walk', 'attack', 'hurt', 'death'] as const;
    rows.forEach((anim, row) => {
      const animKey = `${id}-${anim}`;
      if (scene.anims.exists(animKey)) return;
      const count = art.frames[anim];
      const frames = Array.from({ length: count }, (_, i) => ({ key, frame: row * art.cols + i }));
      const loop = anim === 'idle' || anim === 'walk';
      scene.anims.create({ key: animKey, frames, frameRate: anim === 'walk' ? 10 : anim === 'attack' ? 14 : 8, repeat: loop ? -1 : 0 });
    });
  }
}

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

export class MonsterField {
  private readonly monsters = new Map<number, Monster>();
  private readonly bars: Phaser.GameObjects.Graphics;
  private hostId: string | null = null;
  /** 접속 명단을 처음 받은 시각. 0이면 아직 모른다. */
  private rosterAt = 0;
  /** 명단에 나 말고 다른 사람이 있는지 */
  private othersHere = false;
  private gotSnapshot = false;
  /** 다른 사람에게서 몬스터 위치를 마지막으로 받은 시각 */
  private lastSnapshotAt = 0;
  /** 내가 호스트로 한 번이라도 몬스터를 움직였는지 */
  private simulated = false;
  private nextSnapshotAt = 0;
  private lastTick = performance.now();
  private readonly pending: { id: number; target: string; at: number }[] = [];
  private readonly respawns: { kind: MonsterKind; at: number }[] = [];
  /** 보상을 이미 받은 몬스터 */
  private readonly claimed = new Set<number>();
  /** 쓰러지며 받을 골드를 이미 띄운 몬스터 */
  private readonly seenKills = new Set<number>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly kinds: MonsterKind[],
    private readonly hooks: MonsterHooks,
    barDepth: number,
  ) {
    this.bars = scene.add.graphics().setDepth(barDepth);
  }

  private get isHost() {
    return this.hostId === this.hooks.myId;
  }

  /** 같은 맵 접속 명단이 바뀌었다. id가 가장 작은 사람이 호스트다. */
  setRoster(ids: Set<string>) {
    if (!this.rosterAt) this.rosterAt = performance.now();
    this.othersHere = [...ids].some((id) => id !== this.hooks.myId);
    const all = [...ids, this.hooks.myId].sort();
    const next = all[0];
    if (next === this.hostId) return;
    // 이미 몬스터를 움직이고 있으면 새 호스트가 이어받아 위치를 보내올 때까지 계속 움직인다(applySnapshot에서 넘김).
    // 바로 멈추면 새 호스트가 받을 위치가 없어 몬스터를 새로 만든다.
    if (this.isHost && this.simulated) return;
    const wasHost = this.isHost;
    this.hostId = next;
    // 내가 새로 호스트가 됐다: 받아 둔 위치에서 이어서 움직인다. 생길 몬스터가 모자라면 다시 채운다.
    if (this.isHost && !wasHost) this.takeOver();
  }

  private takeOver() {
    const now = performance.now();
    for (const m of this.monsters.values()) {
      m.x = this.shownX(m);
      m.y = this.shownY(m);
      m.lerp = 1;
      m.target = null;
      m.goal = null;
      m.nextAttackAt = now + m.kind.attackMs;
      m.stateUntil = now;
      if (m.state === 'dead') m.deadAt = now;
    }
  }

  // ───────── 호스트가 하는 일 ─────────

  /** 멈추지 않는 시계에서 0.1초마다 부른다. 호스트면 몬스터를 움직이고 위치를 보낸다. */
  tick() {
    const now = performance.now();
    const dt = Math.min(250, now - this.lastTick);
    this.lastTick = now;
    if (!this.isHost) {
      // 호스트가 몬스터 위치를 보내지 않으면(나갔거나 몬스터가 없는 옛 버전 화면) 내가 이어받는다.
      if (!this.rosterAt || now - Math.max(this.rosterAt, this.lastSnapshotAt) < HOST_WAIT_MS) return;
      this.hostId = this.hooks.myId;
      this.takeOver();
    }
    // 혼자면 바로, 다른 사람이 있으면 그 사람의 몬스터 위치를 받을 때까지(최대 HOST_WAIT_MS) 기다린다.
    if (!this.gotSnapshot && (!this.rosterAt || (this.othersHere && now - this.rosterAt < HOST_WAIT_MS))) return;
    if (this.monsters.size === 0 && this.respawns.length === 0) {
      for (const kind of this.kinds) for (let i = 0; i < kind.count; i++) this.spawn(kind);
    }
    this.simulated = true;
    this.step(now, dt);
    if (now >= this.nextSnapshotAt) {
      this.nextSnapshotAt = now + SNAPSHOT_MS;
      this.hooks.send({ event: 'mstate', from: this.hooks.myId, list: this.snapshot() });
    }
  }

  private snapshot() {
    return [...this.monsters.values()].map((m) => [
      m.id,
      this.kinds.indexOf(m.kind),
      Math.round(m.x * 100),
      Math.round(m.y * 100),
      m.hp,
      STATES.indexOf(m.state),
      m.face,
    ]);
  }

  private step(now: number, dt: number) {
    const players = this.hooks.players().filter((p) => !this.hooks.safe(Math.round(p.x), Math.round(p.y)));
    for (const m of [...this.monsters.values()]) {
      if (m.state === 'dead') {
        if (now - m.deadAt > DEATH_MS) this.remove(m.id);
        continue;
      }
      if ((m.state === 'hurt' || m.state === 'attack') && now >= m.stateUntil) m.state = 'idle';

      let target = players.find((p) => p.id === m.target);
      if (target && dist(m.x, m.y, target.x, target.y) > m.kind.sight * 1.5) target = undefined;
      if (!target) {
        let best = m.kind.sight;
        for (const p of players) {
          const d = dist(m.x, m.y, p.x, p.y);
          if (d <= best) {
            best = d;
            target = p;
          }
        }
      }
      m.target = target?.id ?? null;

      if (target) {
        const d = dist(m.x, m.y, target.x, target.y);
        this.faceToward(m, target.x - m.x, target.y - m.y);
        if (d <= m.kind.reach) {
          // 맞는 중에도 공격한다. 맞았다고 멈추는 시간은 없다(2026-11-15 사용자 요청 "무적시간 따위는 없다").
          if (now >= m.nextAttackAt) {
            m.state = 'attack';
            m.stateUntil = now + Math.min(600, m.kind.attackMs * 0.6);
            m.nextAttackAt = now + m.kind.attackMs;
            this.pending.push({ id: m.id, target: target.id, at: now + WINDUP_MS });
          } else if (m.state === 'walk') {
            m.state = 'idle';
          }
        } else if (m.state !== 'attack') {
          // 맞는 중에도 쫓아온다. 맞은 동작은 걷기로 바뀌기 전까지만 보인다.
          const moved = this.move(m, target.x, target.y, m.kind.speed, dt);
          if (m.state !== 'hurt' || moved) m.state = moved ? 'walk' : 'idle';
        }
      } else if (m.state !== 'hurt') {
        this.wander(m, now, dt);
      }
    }
    this.separate();
    this.resolveAttacks(now);
    this.refill(now, players);
  }

  private faceToward(m: Monster, dx: number, dy: number) {
    // 화면 가로 방향은 격자 (dx - dy) 쪽이다. 그림은 오른쪽을 본다.
    const screen = dx - dy;
    if (Math.abs(screen) > 0.05) m.face = screen > 0 ? 1 : -1;
  }

  /** (tx, ty) 쪽으로 걷는다. 막히면 가로, 세로로 나눠 미끄러진다. 움직였으면 true */
  private move(m: Monster, tx: number, ty: number, speed: number, dt: number) {
    const dx = tx - m.x;
    const dy = ty - m.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.05) return false;
    const stride = Math.min(length, (speed * dt) / 1000);
    const nx = m.x + (dx / length) * stride;
    const ny = m.y + (dy / length) * stride;
    const ok = (x: number, y: number) => {
      const tx2 = Math.round(x);
      const ty2 = Math.round(y);
      return this.hooks.walkable(tx2, ty2) && !this.hooks.safe(tx2, ty2);
    };
    let moved = false;
    if (ok(nx, m.y)) {
      m.x = nx;
      moved = true;
    }
    if (ok(m.x, ny)) {
      m.y = ny;
      moved = true;
    }
    if (moved) this.faceToward(m, dx, dy);
    return moved;
  }

  /** 쫓을 사람이 없으면 둘레를 천천히 거닐다 쉰다. */
  private wander(m: Monster, now: number, dt: number) {
    if (now < m.restUntil) {
      m.state = 'idle';
      return;
    }
    if (!m.goal) {
      const gx = Math.round(m.x + (Math.random() * 2 - 1) * WANDER_RADIUS);
      const gy = Math.round(m.y + (Math.random() * 2 - 1) * WANDER_RADIUS);
      if (!this.hooks.walkable(gx, gy) || this.hooks.safe(gx, gy)) {
        m.restUntil = now + 800;
        return;
      }
      m.goal = { x: gx, y: gy };
    }
    const moved = this.move(m, m.goal.x, m.goal.y, m.kind.speed * 0.5, dt);
    if (!moved || dist(m.x, m.y, m.goal.x, m.goal.y) < 0.1) {
      m.goal = null;
      m.restUntil = now + 1500 + Math.random() * 2500;
      m.state = 'idle';
      return;
    }
    m.state = 'walk';
  }

  private separate() {
    const list = [...this.monsters.values()].filter((m) => m.state !== 'dead');
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const d = dist(a.x, a.y, b.x, b.y);
        if (d >= SEPARATION) continue;
        const push = (SEPARATION - d) / 2;
        const ux = d > 0.001 ? (a.x - b.x) / d : Math.random() - 0.5;
        const uy = d > 0.001 ? (a.y - b.y) / d : Math.random() - 0.5;
        this.nudge(a, ux * push, uy * push);
        this.nudge(b, -ux * push, -uy * push);
      }
    }
  }

  private nudge(m: Monster, dx: number, dy: number) {
    const x = m.x + dx;
    const y = m.y + dy;
    if (this.hooks.walkable(Math.round(x), Math.round(y)) && !this.hooks.safe(Math.round(x), Math.round(y))) {
      m.x = x;
      m.y = y;
    }
  }

  /** 휘두른 공격이 닿을 때가 됐으면 맞은 사람에게 알린다(나면 바로 서버에 맞았다고 알림). */
  private resolveAttacks(now: number) {
    const players = this.hooks.players();
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const hit = this.pending[i];
      if (hit.at > now) continue;
      this.pending.splice(i, 1);
      const m = this.monsters.get(hit.id);
      const target = players.find((p) => p.id === hit.target);
      if (!m || m.state === 'dead' || !target) continue;
      if (dist(m.x, m.y, target.x, target.y) > m.kind.reach * DODGE_SLACK) continue;
      if (hit.target === this.hooks.myId) this.hooks.onHitMe(m.kind);
      else this.hooks.send({ event: 'matk', id: m.id, kind: m.kind.id, target: hit.target });
    }
  }

  /** 쓰러진 몬스터는 RESPAWN_MS 뒤에 사람에게서 떨어진 칸에 다시 생긴다. */
  private refill(now: number, players: { id: string; x: number; y: number }[]) {
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      if (this.respawns[i].at > now) continue;
      const [{ kind }] = this.respawns.splice(i, 1);
      if (!this.spawn(kind, players)) this.respawns.push({ kind, at: now + 1000 });
    }
    // 호스트가 바뀌어 다시 생길 차례를 잃은 몬스터를 채운다.
    for (const kind of this.kinds) {
      const alive = [...this.monsters.values()].filter((m) => m.kind === kind).length;
      const queued = this.respawns.filter((r) => r.kind === kind).length;
      for (let i = alive + queued; i < kind.count; i++) this.respawns.push({ kind, at: now + RESPAWN_MS });
    }
  }

  private spawn(kind: MonsterKind, players = this.hooks.players()) {
    const tiles = this.hooks.spawnTiles;
    for (let tries = 0; tries < 40; tries++) {
      const tile = tiles[Math.floor(Math.random() * tiles.length)];
      if (!tile || !this.hooks.walkable(tile.x, tile.y)) continue;
      if (players.some((p) => dist(p.x, p.y, tile.x, tile.y) < SPAWN_CLEAR)) continue;
      const id = Math.floor(Math.random() * 2 ** 31);
      if (this.monsters.has(id)) continue;
      this.add(id, kind, tile.x, tile.y, kind.hp, 'idle', 1);
      return true;
    }
    return false;
  }

  /** 호스트가 피해를 준다. by가 마지막 한 방이면 보상을 받는다. */
  private applyDamage(id: number, damage: number, by: string) {
    const m = this.monsters.get(id);
    if (!m || m.state === 'dead') return;
    const now = performance.now();
    m.hp = Math.max(0, m.hp - damage);
    m.target = by;
    m.flashUntil = now + HURT_MS;
    if (m.hp === 0) {
      m.state = 'dead';
      m.deadAt = now;
      this.respawns.push({ kind: m.kind, at: now + RESPAWN_MS });
      if (by === this.hooks.myId) this.claim(m);
      else this.hooks.send({ event: 'mdead', id: m.id, kind: m.kind.id, by });
      return;
    }
    if (m.state !== 'attack') {
      m.state = 'hurt';
      m.stateUntil = now + HURT_MS;
    }
  }

  private claim(m: Monster) {
    this.seeKill(m);
    if (this.claimed.has(m.id)) return;
    this.claimed.add(m.id);
    this.hooks.onMyKill(m.kind);
  }

  private seeKill(m: Monster) {
    if (this.seenKills.has(m.id)) return;
    this.seenKills.add(m.id);
    this.hooks.onKillSeen(m.kind, this.shownX(m), this.shownY(m));
  }

  // ───────── 모두가 하는 일 ─────────

  /** 내 공격이 몬스터에 맞았다. */
  damage(targetId: string, damage: number) {
    const id = Number(targetId.slice(2));
    const m = this.monsters.get(id);
    if (!m || m.state === 'dead') return;
    if (this.isHost) {
      this.applyDamage(id, damage, this.hooks.myId);
      return;
    }
    this.hooks.send({ event: 'mhit', id, damage, by: this.hooks.myId });
    // 호스트의 답을 기다리는 동안 맞은 티를 낸다. 체력은 다음 위치 알림이 맞춘다.
    const now = performance.now();
    m.flashUntil = now + HURT_MS;
    m.hp = Math.max(0, m.hp - damage);
    if (m.hp > 0) return;
    // 내 한 방으로 쓰러질 체력이었다: 바로 쓰러뜨려 보이고 받을 골드를 띄운다. 보상은 호스트가 확인해 주면(mdead) 받는다.
    m.state = 'dead';
    m.deadAt = now;
    m.predictedUntil = now + PREDICT_MS;
    this.seeKill(m);
  }

  /** 누가 쏜 총알이든 몬스터에 닿으면 번쩍인다. */
  flash(targetId: string) {
    const m = this.monsters.get(Number(targetId.slice(2)));
    if (m) m.flashUntil = performance.now() + HURT_MS;
  }

  onMessage(message: MonsterMessage) {
    switch (message.event) {
      case 'mstate':
        this.applySnapshot(message.from, message.list);
        break;
      case 'mhit':
        if (this.isHost) this.applyDamage(message.id, message.damage, message.by);
        break;
      case 'mdead': {
        const m = this.monsters.get(message.id);
        if (m && m.state !== 'dead') {
          m.state = 'dead';
          m.hp = 0;
        }
        if (message.by === this.hooks.myId && !this.claimed.has(message.id)) {
          if (m) this.claim(m);
          else {
            this.claimed.add(message.id);
            const kind = this.kinds.find((k) => k.id === message.kind);
            if (kind) this.hooks.onMyKill(kind);
          }
        }
        break;
      }
      case 'matk':
        if (message.target === this.hooks.myId) {
          const kind = this.kinds.find((k) => k.id === message.kind);
          if (kind) this.hooks.onHitMe(kind);
        }
        break;
    }
  }

  private applySnapshot(from: string, list: number[][]) {
    if (from === this.hooks.myId) return;
    // 둘이 동시에 호스트라고 여기면 id가 작은 쪽이 이긴다. 다만 내가 막 들어와 아직 몬스터를 움직이기 전이면
    // 먼저 있던 사람의 몬스터를 받아 이어서 움직인다(새로 만들면 들어올 때마다 몬스터가 바뀜).
    const adopt = this.isHost && from > this.hooks.myId;
    if (adopt && this.simulated) return;
    if (this.isHost && !adopt) this.hostId = from;
    this.gotSnapshot = true;
    this.lastSnapshotAt = performance.now();
    const seen = new Set<number>();
    for (const [id, kindIndex, x100, y100, hp, stateIndex, face] of list) {
      const kind = this.kinds[kindIndex];
      const state = STATES[stateIndex];
      if (!kind || !state) continue;
      seen.add(id);
      const x = x100 / 100;
      const y = y100 / 100;
      const m = this.monsters.get(id);
      if (!m) {
        this.add(id, kind, x, y, hp, state, face < 0 ? -1 : 1);
        continue;
      }
      // 내가 쓰러뜨렸다고 미리 보이는 동안에는 호스트가 아직 내 공격을 받기 전의 알림이라도 쓰러진 채로 둔다.
      if (m.predictedUntil > performance.now() && STATES[stateIndex] !== 'dead') continue;
      m.fromX = this.shownX(m);
      m.fromY = this.shownY(m);
      m.lerp = 0;
      m.x = x;
      m.y = y;
      m.hp = hp;
      m.state = state;
      m.face = face < 0 ? -1 : 1;
    }
    for (const id of [...this.monsters.keys()]) if (!seen.has(id)) this.remove(id);
    if (adopt) this.takeOver();
  }

  private add(id: number, kind: MonsterKind, x: number, y: number, hp: number, state: State, face: 1 | -1) {
    const art = MONSTER_ART[kind.id as keyof typeof MONSTER_ART];
    const sprite = this.scene.add.sprite(0, 0, `monster-${kind.id}`).setOrigin(art.footX / art.width, art.footY / art.height);
    const m: Monster = {
      id,
      kind,
      x,
      y,
      hp,
      state,
      face,
      target: null,
      nextAttackAt: 0,
      stateUntil: 0,
      deadAt: state === 'dead' ? performance.now() : 0,
      goal: null,
      restUntil: 0,
      sprite,
      fromX: x,
      fromY: y,
      lerp: 1,
      shown: null,
      flashUntil: 0,
      predictedUntil: 0,
    };
    this.monsters.set(id, m);
    this.draw(m, performance.now());
  }

  private remove(id: number) {
    const m = this.monsters.get(id);
    if (!m) return;
    m.sprite.destroy();
    this.monsters.delete(id);
  }

  private shownX(m: Monster) {
    return this.isHost ? m.x : m.fromX + (m.x - m.fromX) * m.lerp;
  }

  private shownY(m: Monster) {
    return this.isHost ? m.y : m.fromY + (m.y - m.fromY) * m.lerp;
  }

  /** 화면 갱신마다 부른다: 받은 위치로 부드럽게 옮기고 동작과 체력 막대를 그린다. */
  update(delta: number) {
    const now = performance.now();
    this.bars.clear();
    for (const m of this.monsters.values()) {
      if (m.lerp < 1) m.lerp = Math.min(1, m.lerp + delta / SNAPSHOT_MS);
      this.draw(m, now);
    }
  }

  private draw(m: Monster, now: number) {
    const x = this.shownX(m);
    const y = this.shownY(m);
    const p = gridToWorld(x + 0.5, y + 0.5);
    m.sprite.setPosition(p.x, p.y).setDepth(depthOf(x, y) + 1).setFlipX(m.face < 0);
    if (m.shown !== m.state) {
      m.shown = m.state;
      m.sprite.play(`${m.kind.id}-${ANIM_OF[m.state]}`);
    }
    // 맞으면 사람이 맞았을 때처럼 잠깐 붉어진다.
    const tint = now < m.flashUntil ? 0xff6b5e : 0xffffff;
    if (m.sprite.tintTopLeft !== tint) m.sprite.setTint(tint);
    if (m.state === 'dead') {
      m.sprite.setAlpha(Math.max(0, 1 - Math.max(0, now - m.deadAt - DEATH_MS * 0.5) / (DEATH_MS * 0.5)));
      return;
    }
    if (m.hp >= m.kind.hp) return;
    const art = MONSTER_ART[m.kind.id as keyof typeof MONSTER_ART];
    const top = p.y - art.footY - 3;
    const w = 16;
    this.bars.fillStyle(0x1f1510, 0.85).fillRect(p.x - w / 2 - 1, top - 1, w + 2, 4);
    this.bars.fillStyle(0xd8413b, 1).fillRect(p.x - w / 2, top, (w * m.hp) / m.kind.hp, 2);
  }

  /** 총알과 칼이 맞힐 수 있는 몬스터. id는 'm:<번호>'이다. */
  targets(): BulletTarget[] {
    const list: BulletTarget[] = [];
    for (const m of this.monsters.values()) {
      if (m.state !== 'dead') list.push({ id: `m:${m.id}`, x: this.shownX(m) + 0.5, y: this.shownY(m) + 0.5 });
    }
    return list;
  }

  destroy() {
    for (const m of this.monsters.values()) m.sprite.destroy();
    this.monsters.clear();
    this.bars.destroy();
  }
}

export function isMonsterTarget(id: string) {
  return id.startsWith('m:');
}
