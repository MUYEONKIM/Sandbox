import type Phaser from 'phaser';
import { gridToWorld } from '../iso';

/**
 * 전쟁터의 손전등 시야(2026-11-13 사용자 요청 "밤에 손전등 켰을 때처럼"): 화면은 어둡고, 내가 바라보는 쪽 부채꼴만 밝다.
 * 칸 좌표에서 사방으로 빛을 쏴 장애물(총알을 막는 칸)에 부딪히면 거기서 멈춘다. 그래서 장애물 뒤는 부채꼴 안이어도 어둡다.
 * 빛이 닿지 않는 곳의 다른 플레이어는 GameScene이 sees()로 숨긴다.
 */

/** 부채꼴: 사용자가 고른 90도(반각 45도), 8칸 */
const HALF_ANGLE = Math.PI / 4;
const RANGE = 8;
/** 부채꼴 가장자리는 이 각도만큼 더 가며 빛이 짧아진다(테두리가 칼같이 잘리지 않게). */
const EDGE_SOFT = Math.PI / 18;
/** 내 둘레는 뒤쪽도 이만큼(칸) 보인다. */
const NEAR = 1.2;
/** 빛을 쏘는 개수와 한 걸음(칸) */
const RAYS = 240;
const STEP = 0.1;
/** 막힌 칸의 앞면이 보이도록 부딪힌 곳보다 조금 더 밝힌다(칸). */
const FACE = 0.45;
/** 빛 끝의 옅은 띠(칸). 장애물에 막힌 쪽에는 두지 않는다. */
const FADE = 0.8;
/** 화면 끝까지 덮는 거리(칸) */
const FAR = 40;
const DARK = 0x05070c;
const DARK_ALPHA = 0.88;
const FADE_ALPHA = 0.5;

const TAU = Math.PI * 2;
const wrap = (a: number) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

export class Flashlight {
  private readonly shade: Phaser.GameObjects.Graphics;
  private readonly reach = new Float32Array(RAYS);
  private readonly blocked = new Uint8Array(RAYS);
  private ox = 0;
  private oy = 0;
  private on = false;

  constructor(scene: Phaser.Scene, depth: number) {
    this.shade = scene.add.graphics().setDepth(depth).setVisible(false);
  }

  get active() {
    return this.on;
  }

  setActive(on: boolean) {
    this.on = on;
    this.shade.setVisible(on);
    if (!on) this.shade.clear();
  }

  /**
   * (ox, oy)는 내 위치(칸 가운데의 격자 좌표), facing은 바라보는 격자 방향, stops(x, y)는 빛을 막는 칸인지다.
   */
  update(ox: number, oy: number, facing: { dx: number; dy: number }, stops: (x: number, y: number) => boolean) {
    if (!this.on) return;
    this.ox = ox;
    this.oy = oy;
    const aim = Math.atan2(facing.dy, facing.dx);
    const homeX = Math.floor(ox);
    const homeY = Math.floor(oy);
    for (let i = 0; i < RAYS; i++) {
      const angle = (i / RAYS) * TAU;
      const off = Math.abs(wrap(angle - aim));
      const max =
        off <= HALF_ANGLE
          ? RANGE
          : off <= HALF_ANGLE + EDGE_SOFT
            ? NEAR + (RANGE - NEAR) * (1 - (off - HALF_ANGLE) / EDGE_SOFT)
            : NEAR;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      let reach = max;
      let blocked = 0;
      for (let t = STEP; t < max; t += STEP) {
        const tx = Math.floor(ox + cos * t);
        const ty = Math.floor(oy + sin * t);
        if ((tx !== homeX || ty !== homeY) && stops(tx, ty)) {
          reach = Math.min(max, t + FACE);
          blocked = 1;
          break;
        }
      }
      this.reach[i] = reach;
      this.blocked[i] = blocked;
    }
    this.draw();
  }

  /** 빛 밖을 어둡게 칠한다. 빛줄기 사이마다 사각형 두 장(옅은 띠, 짙은 어둠)이다. */
  private draw() {
    const g = this.shade;
    g.clear();
    const point = (i: number, d: number) => {
      const angle = (i / RAYS) * TAU;
      return gridToWorld(this.ox + Math.cos(angle) * d, this.oy + Math.sin(angle) * d);
    };
    /** 빛줄기 i, j 사이에서 거리 near~far를 칠한다. */
    const band = (i: number, j: number, nearI: number, nearJ: number, farI: number, farJ: number) => {
      const corners = [point(i, nearI), point(j, nearJ), point(j, farJ), point(i, farI)];
      g.beginPath();
      g.moveTo(corners[0].x, corners[0].y);
      for (const c of corners.slice(1)) g.lineTo(c.x, c.y);
      g.closePath();
      g.fillPath();
    };
    for (let i = 0; i < RAYS; i++) {
      const j = (i + 1) % RAYS;
      const innerI = this.reach[i];
      const innerJ = this.reach[j];
      const midI = innerI + (this.blocked[i] ? 0 : FADE);
      const midJ = innerJ + (this.blocked[j] ? 0 : FADE);
      if (midI > innerI || midJ > innerJ) {
        g.fillStyle(DARK, FADE_ALPHA);
        band(i, j, innerI, innerJ, midI, midJ);
      }
      g.fillStyle(DARK, DARK_ALPHA);
      band(i, j, midI, midJ, FAR, FAR);
    }
  }

  /** 격자 좌표 (x, y)가 빛 안인지. 손전등이 꺼져 있으면 늘 true */
  sees(x: number, y: number) {
    if (!this.on) return true;
    const dx = x - this.ox;
    const dy = y - this.oy;
    const r = Math.hypot(dx, dy);
    if (r < 0.01) return true;
    const angle = (Math.atan2(dy, dx) + TAU) % TAU;
    return r <= this.reach[Math.round((angle / TAU) * RAYS) % RAYS];
  }
}
