import Phaser from 'phaser';
import { BLOCK_HEIGHT } from '../config';
import { ensureGlowTexture, FIXED_LIGHTS, GLOW_LOOKS, GLOW_TEXTURE, LIGHT_BLOCKS, type GlowLook, type GlowLookId } from '../art/glow';
import { gridToWorld, keepDepth, tileCenter } from '../iso';
import type { DayPhase } from './daylight';

/**
 * 바깥 맵의 등과 조명 빛(2026-11-16 사용자 "가로등 장식품은 많이 있는데 빛이 나지 않는다", 설계 lantern-glow.md 7장).
 * - 고정 등(작업장·농장 등 기둥, 벌목장 모닥불): 맵에 들어올 때 웅덩이와 빛무리를 한 번 놓는다. 빛무리는 밤 덮개 위다.
 * - 플레이어 조명(조명 블록과 가구 조명): 화면(여백 64px) 안에서 화면 가운데에 가까운 30개까지만 켠다(사용자가 정함).
 *   빛 블록을 놓거나 치울 때, 블록 덩어리(BlockChunks)가 화면을 다시 볼 때, 맵에 들어올 때만 고른다. 이미지 30쌍을 다시 쓴다.
 *   빛무리는 그 조명 바로 위 깊이라 앞의 나무·건물·블록에 가려지고, 웅덩이는 바닥(z = 0)에 놓인 것만 서로 2칸 밖일 때 둔다.
 * - 깜빡임: 맵에 타이머 하나(0.1초)가 빛마다 위상만 다르게 4계단으로 진하기를 바꾼다(사용자 "등까지 살짝").
 * - 시간대: 아침 0, 노을 0.55, 저녁 1, 새벽 0.65. 바뀔 때 숫자 하나를 2.5초 동안 옮기고, 아침이면 숨기고 타이머를 멈춘다.
 * 켜는 맵: 바깥이고 전쟁터(dark)가 아니고 분위기 색(mood)이 없는 맵. 건물 안은 켜지 않는다.
 */

/** 플레이어 조명을 켜는 최대 수 */
export const MAX_PLAYER_LIGHTS = 30;
/** 바닥 웅덩이끼리 이 거리(칸, 8방위) 안이면 먼저 고른 하나만 둔다(가산이 겹쳐 하얗게 타지 않게). */
const POOL_GAP = 2;
/** 화면 밖 이만큼(월드 px)까지는 켠다. */
const MARGIN = 64;
const TICK_MS = 100;
const FADE_MS = 2500;
/** 바닥 웅덩이 깊이: 바닥 그림(0.6) 위, 블록·소품·사람 아래, 밤 덮개 아래 */
const DEPTH_POOL = 0.7;
/** 플레이어 조명 웅덩이는 조금 옅게(시안과 같음) */
const PLAYER_POOL_ALPHA = 0.8;
const STRENGTH: Record<DayPhase, number> = { morning: 0, sunset: 0.55, evening: 1, dawn: 0.65 };

interface Lit {
  look: GlowLook;
  /** 깜빡임 위상(0~1). 칸과 높이로 정해 등마다 같은 때에 깜빡이지 않는다. */
  phase: number;
  pool: Phaser.GameObjects.Image | null;
  halo: Phaser.GameObjects.Image;
  /** 웅덩이 진하기 배율 */
  poolAlpha: number;
  /** 지난번 깜빡임 계단(0~3). 바뀔 때만 알파를 고친다. */
  level: number;
}

interface PlayerLight {
  key: string;
  look: GlowLookId;
  x: number;
  y: number;
  z: number;
  /** 그 조명 그림의 깊이. 빛무리는 바로 위에 둔다. */
  depth: number;
}

interface Slot extends Lit {
  key: string | null;
  poolOn: boolean;
}

const phaseOf = (x: number, y: number, z: number) => ((x * 73 + y * 151 + z * 37) % 100) / 100;

export class Lights {
  private enabled = false;
  private strength = 0;
  private target = 0;
  /** 빛 진하기를 마지막으로 그린 값. 바뀌면 모든 빛의 알파를 다시 쓴다. */
  private drawnStrength = -1;
  private fade: Phaser.Tweens.Tween | null = null;
  private readonly fixed: Lit[] = [];
  private readonly blocks = new Map<string, PlayerLight>();
  /** 플레이어 조명용으로 만들어 둔 이미지(최대 30쌍). key는 지금 맡은 조명, poolOn은 웅덩이를 둘지 */
  private readonly slots: Slot[] = [];
  private readonly view = new Phaser.Geom.Rectangle(0, 0, 0, 0);
  private hasView = false;
  private chooseQueued = false;
  private readonly timer: Phaser.Time.TimerEvent;
  /** 고르기 횟수와 깜빡임 타이머가 돈 횟수(성능 확인용) */
  chooses = 0;
  ticks = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    /** 고정 등 빛무리 깊이(밤 덮개 바로 위) */
    private readonly haloDepth: number,
    phase: DayPhase,
  ) {
    this.strength = this.target = STRENGTH[phase];
    this.timer = scene.time.addEvent({ delay: TICK_MS, loop: true, paused: true, callback: () => this.tick() });
  }

  /** 맵에 들어올 때. enabled가 아니면(건물 안, 전쟁터, 분위기 맵) 아무것도 놓지 않는다. props는 그 맵의 건물·소품 목록이다. */
  enter(enabled: boolean, props: readonly { sprite: string; x: number; y: number }[]) {
    this.clear();
    this.enabled = enabled;
    if (!enabled) return;
    for (const { sprite, x, y } of props) {
      const spot = FIXED_LIGHTS[sprite];
      if (!spot) continue;
      ensureGlowTexture(this.scene);
      const look = GLOW_LOOKS[spot.look];
      const ground = gridToWorld(x + spot.gx, y + spot.gy);
      const pool = this.image(`pool:${spot.look}`, ground.x, ground.y, DEPTH_POOL);
      const halo = this.image(`halo:${spot.look}`, ground.x, ground.y - look.head, this.haloDepth);
      this.fixed.push({ look, phase: phaseOf(x, y, 0), pool, halo, poolAlpha: 1, level: -1 });
    }
    this.queueChoose();
    this.refresh();
  }

  /** 맵을 떠날 때. 고정 등 이미지는 지우고 플레이어 조명 이미지는 숨겨 두었다가 다시 쓴다. */
  clear() {
    for (const lit of this.fixed) {
      lit.pool?.destroy();
      lit.halo.destroy();
    }
    this.fixed.length = 0;
    this.blocks.clear();
    for (const slot of this.slots) {
      slot.key = null;
      slot.halo.setVisible(false);
      slot.pool?.setVisible(false);
    }
    this.enabled = false;
    this.timer.paused = true;
  }

  /** 시간대가 바뀌었다(Daylight). fade면 2.5초 동안 옮긴다. */
  setPhase(phase: DayPhase, fade: boolean) {
    this.target = STRENGTH[phase];
    this.fade?.remove();
    this.fade = null;
    if (!fade || this.target === this.strength) {
      this.strength = this.target;
      this.refresh();
      return;
    }
    const from = this.strength;
    this.fade = this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: FADE_MS,
      onUpdate: (tween) => {
        this.strength = from + (this.target - from) * tween.getValue()!;
      },
      onComplete: () => {
        this.fade = null;
        this.strength = this.target;
        this.refresh();
      },
    });
    this.refresh();
  }

  /** 빛 블록이 놓였다. 빛 블록이 아니면 아무것도 하지 않는다. depth는 그 블록 그림의 깊이다. */
  addBlock(id: string, x: number, y: number, z: number, depth: number) {
    const look = LIGHT_BLOCKS[id];
    if (!look || !this.enabled) return;
    const key = `${x},${y},${z}`;
    this.blocks.set(key, { key, look, x, y, z, depth });
    this.queueChoose();
  }

  removeBlock(x: number, y: number, z: number) {
    if (this.blocks.delete(`${x},${y},${z}`)) this.queueChoose();
  }

  /** 블록 덩어리가 화면 범위를 다시 볼 때(카메라가 32px 넘게 움직였거나 화면 크기가 바뀜) 부른다. */
  setView(view: Phaser.Geom.Rectangle) {
    this.view.setTo(view.x, view.y, view.width, view.height);
    this.hasView = true;
    if (this.blocks.size || this.slots.some((slot) => slot.key)) this.choose();
  }

  /** 지금 켠 플레이어 조명 수(확인용) */
  get shownPlayerLights() {
    return this.slots.filter((slot) => slot.key && slot.halo.visible).length;
  }

  private image(frame: string, x: number, y: number, depth: number) {
    return this.scene.add.image(x, y, GLOW_TEXTURE, frame).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth).setVisible(false);
  }

  /** 빛 블록을 한꺼번에 많이 받을 때(맵에 들어와 블록을 읽을 때) 한 번만 고르게 다음 프레임으로 미룬다. */
  private queueChoose() {
    if (this.chooseQueued) return;
    this.chooseQueued = true;
    this.scene.time.delayedCall(0, () => {
      this.chooseQueued = false;
      if (this.enabled) this.choose();
    });
  }

  /** 화면 안 빛 블록 가운데 화면 가운데에서 가까운 30개를 슬롯에 나눈다. 계속 켜진 조명은 같은 슬롯을 쓴다. */
  private choose() {
    if (!this.enabled || !this.hasView) return;
    this.chooses++;
    const v = this.view;
    const cx = v.x + v.width / 2;
    const cy = v.y + v.height / 2;
    const inView: { light: PlayerLight; d: number }[] = [];
    for (const light of this.blocks.values()) {
      const c = tileCenter(light.x, light.y);
      if (c.x < v.x - MARGIN || c.x > v.right + MARGIN || c.y < v.y - MARGIN || c.y > v.bottom + MARGIN) continue;
      inView.push({ light, d: (c.x - cx) ** 2 + (c.y - cy) ** 2 });
    }
    inView.sort((a, b) => a.d - b.d);
    const chosen = inView.slice(0, MAX_PLAYER_LIGHTS).map((entry) => entry.light);
    const pooled = new Set<string>();
    const poolAt: PlayerLight[] = [];
    for (const light of chosen) {
      if (light.z !== 0 || !GLOW_LOOKS[light.look].pool) continue;
      if (poolAt.some((q) => Math.max(Math.abs(q.x - light.x), Math.abs(q.y - light.y)) <= POOL_GAP)) continue;
      poolAt.push(light);
      pooled.add(light.key);
    }

    const wanted = new Map(chosen.map((light) => [light.key, light]));
    // 계속 켜진 조명은 슬롯을 그대로 쓰고, 빠진 조명의 슬롯은 비운다.
    for (const slot of this.slots) {
      if (slot.key && !wanted.has(slot.key)) {
        slot.key = null;
        slot.halo.setVisible(false);
        slot.pool?.setVisible(false);
      }
    }
    const taken = new Set(this.slots.filter((slot) => slot.key).map((slot) => slot.key));
    for (const light of chosen) {
      let slot = taken.has(light.key) ? this.slots.find((s) => s.key === light.key) : undefined;
      if (!slot) {
        slot = this.slots.find((s) => !s.key) ?? this.newSlot();
        slot.key = light.key;
        slot.level = -1;
      }
      this.place(slot, light, pooled.has(light.key));
    }
    this.refresh();
  }

  private newSlot() {
    ensureGlowTexture(this.scene);
    const halo = this.image('halo:lamp', 0, 0, 0);
    const pool = this.image('pool:lamp', 0, 0, DEPTH_POOL);
    const slot: Slot = { key: null, poolOn: false, look: GLOW_LOOKS.lamp, phase: 0, pool, halo, poolAlpha: PLAYER_POOL_ALPHA, level: -1 };
    this.slots.push(slot);
    return slot;
  }

  /** 슬롯 이미지를 그 조명 자리·모양·깊이로 옮긴다. 같으면 건드리지 않는다. */
  private place(slot: Slot, light: PlayerLight, withPool: boolean) {
    const look = GLOW_LOOKS[light.look];
    const c = tileCenter(light.x, light.y);
    slot.look = look;
    slot.phase = phaseOf(light.x, light.y, light.z);
    const haloFrame = `halo:${light.look}`;
    if (slot.halo.frame.name !== haloFrame) slot.halo.setFrame(haloFrame);
    const hy = c.y - light.z * BLOCK_HEIGHT - look.head;
    if (slot.halo.x !== c.x || slot.halo.y !== hy) slot.halo.setPosition(c.x, hy);
    keepDepth(slot.halo, light.depth + 0.005);
    const pool = slot.pool!;
    if (withPool) {
      const poolFrame = `pool:${light.look}`;
      if (pool.frame.name !== poolFrame) pool.setFrame(poolFrame);
      if (pool.x !== c.x || pool.y !== c.y) pool.setPosition(c.x, c.y);
    }
    slot.poolOn = withPool;
  }

  /** 켤지(진하기 > 0, 빛이 있음)에 따라 이미지를 보이고 타이머를 돌리거나 멈춘다. */
  private refresh() {
    const on = this.enabled && (this.strength > 0 || this.target > 0);
    for (const lit of this.fixed) {
      lit.halo.setVisible(on);
      lit.pool?.setVisible(on);
    }
    for (const slot of this.slots) {
      const shown = on && slot.key !== null;
      slot.halo.setVisible(shown);
      slot.pool?.setVisible(shown && slot.poolOn);
    }
    const any = this.fixed.length > 0 || this.slots.some((slot) => slot.key);
    this.timer.paused = !(on && any);
    this.drawnStrength = -1;
    if (on && any) this.tick();
  }

  /** 0.1초마다: 빛마다 깜빡임 계단을 셈해 바뀐 것만 알파를 고친다. 진하기가 바뀌는 동안은 모두 고친다. */
  private tick() {
    this.ticks++;
    const t = this.scene.time.now / 1000;
    const all = this.drawnStrength !== this.strength;
    this.drawnStrength = this.strength;
    const update = (lit: Lit) => {
      const speed = lit.look.fire ? 1.5 : 0.5;
      const s = Math.sin((t * speed + lit.phase) * Math.PI * 2) * 0.5 + 0.5;
      const level = Math.round(s * 3);
      if (!all && level === lit.level) return;
      lit.level = level;
      const k = this.strength * (1 - (lit.look.flicker * level) / 3);
      lit.halo.setAlpha(k);
      lit.pool?.setAlpha(k * lit.poolAlpha);
    };
    for (const lit of this.fixed) update(lit);
    for (const slot of this.slots) if (slot.key) update(slot);
  }
}
