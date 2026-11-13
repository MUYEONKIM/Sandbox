import Phaser from 'phaser';
import { worldRect } from '../art/ground';
import { gridToWorld } from '../iso';

/**
 * 전쟁터의 손전등 시야(2026-11-13 사용자 요청 "밤에 손전등 켰을 때처럼"): 화면은 어둡고, 내가 바라보는 쪽 부채꼴만 밝다.
 * 칸 좌표에서 사방으로 빛을 쏴 장애물(총알을 막는 칸)에 부딪히면 거기서 멈춘다. 그래서 장애물 뒤는 부채꼴 안이어도 어둡다.
 * 빛이 닿지 않는 곳의 다른 플레이어는 GameScene이 sees()로 숨긴다.
 *
 * 그리는 법: 맵 크기의 작은 canvas(월드의 1/3 해상도) 한 장을 어둡게 칠하고 빛 모양을 한 번에 지운 뒤 3배로 늘려 덮는다.
 * 처음에는 어둠을 빛줄기 사이 조각 수백 장으로 그렸는데, 조각 사이에 실금이 생겨 빛줄기가 줄무늬로 새어 보였다(2026-11-13 사용자 보고).
 * 사용자가 "투박해도 되니 최적화와 렌더링에 신경 써 달라"고 해서, 가장자리는 늘린 그림의 흐릿함으로 부드럽게 두고
 * 내 위치나 방향, 막힌 칸이 바뀔 때만 다시 그린다.
 */

/** 부채꼴: 사용자가 고른 90도(반각 45도), 8칸 */
const HALF_ANGLE = Math.PI / 4;
const RANGE = 8;
/** 부채꼴 가장자리는 이 각도만큼 더 가며 빛이 짧아진다. */
const EDGE_SOFT = Math.PI / 18;
/** 내 둘레는 뒤쪽도 이만큼(칸) 보인다. */
const NEAR = 1.2;
/** 빛줄기 수와 한 걸음(칸) */
const RAYS = 144;
const STEP = 0.12;
/** 막힌 칸의 앞면이 보이도록 부딪힌 곳보다 조금 더 밝힌다(칸). */
const FACE = 0.45;
/** 빛 끝의 옅은 띠(칸). 장애물에 막힌 쪽에는 두지 않는다. */
const FADE = 0.9;
/** 어둠 canvas 해상도: 월드 픽셀 몇 개를 한 칸으로 칠하는지 */
const SCALE = 3;
const DARK = 'rgba(5, 7, 12, 0.88)';
/** 옅은 띠는 어둠을 이만큼 걷어 낸다. */
const FADE_CLEAR = 0.45;
/** 빛 가장자리를 흐리게 하는 정도(canvas 픽셀) */
const EDGE_BLUR = 1;

const TAU = Math.PI * 2;
const wrap = (a: number) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
const KEY = 'flashlight-dark';

export class Flashlight {
  private readonly reach = new Float32Array(RAYS);
  private readonly blocked = new Uint8Array(RAYS);
  private texture: Phaser.Textures.CanvasTexture | null = null;
  private image: Phaser.GameObjects.Image | null = null;
  private left = 0;
  private ox = 0;
  private oy = 0;
  private on = false;
  /** 지난번에 그린 상태. 같으면 다시 그리지 않는다. */
  private drawn = '';

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth: number,
  ) {}

  get active() {
    return this.on;
  }

  /** 맵에 들어갈 때 부른다. on이면 그 맵(한 변 size칸)을 덮는 어둠을 준비한다. */
  setActive(on: boolean, size: number) {
    this.on = on;
    this.drawn = '';
    if (!on) {
      this.image?.setVisible(false);
      return;
    }
    const rect = worldRect(size);
    const width = Math.ceil(rect.width / SCALE);
    const height = Math.ceil(rect.height / SCALE);
    if (!this.texture || this.texture.width !== width || this.texture.height !== height) {
      this.image?.destroy();
      if (this.scene.textures.exists(KEY)) this.scene.textures.remove(KEY);
      this.texture = this.scene.textures.createCanvas(KEY, width, height)!;
      this.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
      this.image = this.scene.add.image(0, 0, KEY).setOrigin(0, 0).setScale(SCALE).setDepth(this.depth);
    }
    this.left = rect.left;
    this.image!.setPosition(rect.left, 0).setVisible(true);
  }

  /**
   * (ox, oy)는 내 위치(칸 가운데의 격자 좌표), facing은 바라보는 격자 방향, stops(x, y)는 빛을 막는 칸인지,
   * version은 막힌 칸이 바뀔 때마다 달라지는 값이다.
   */
  update(ox: number, oy: number, facing: { dx: number; dy: number }, stops: (x: number, y: number) => boolean, version: number) {
    if (!this.on) return;
    const state = `${ox.toFixed(2)},${oy.toFixed(2)},${facing.dx},${facing.dy},${version}`;
    if (state === this.drawn) return;
    this.drawn = state;
    this.ox = ox;
    this.oy = oy;
    this.cast(Math.atan2(facing.dy, facing.dx), stops);
    this.paint();
  }

  private cast(aim: number, stops: (x: number, y: number) => boolean) {
    const { ox, oy } = this;
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
  }

  /** canvas를 어둡게 칠하고 빛 모양을 지운다: 먼저 옅은 띠까지 반쯤, 그다음 빛이 닿는 곳까지 전부. */
  private paint() {
    const texture = this.texture!;
    const ctx = texture.context;
    const { width, height } = texture;
    ctx.globalCompositeOperation = 'copy';
    ctx.fillStyle = DARK;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'destination-out';
    // 작은 그림을 늘리면 가장자리가 계단처럼 보여서 빛 모양을 살짝 흐리게 지운다.
    ctx.filter = `blur(${EDGE_BLUR}px)`;
    this.lightPath(ctx, (i) => this.reach[i] + (this.blocked[i] ? 0 : FADE));
    ctx.fillStyle = `rgba(0, 0, 0, ${FADE_CLEAR})`;
    ctx.fill();
    this.lightPath(ctx, (i) => this.reach[i]);
    ctx.fillStyle = 'rgba(0, 0, 0, 1)';
    ctx.fill();
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
    texture.refresh();
  }

  /** 빛줄기 끝을 이은 다각형 한 개. 내 위치를 둘러싸므로 조각 없이 한 번에 칠한다. */
  private lightPath(ctx: CanvasRenderingContext2D, distance: (i: number) => number) {
    ctx.beginPath();
    for (let i = 0; i < RAYS; i++) {
      const angle = (i / RAYS) * TAU;
      const d = distance(i);
      const p = gridToWorld(this.ox + Math.cos(angle) * d, this.oy + Math.sin(angle) * d);
      const x = (p.x - this.left) / SCALE;
      const y = p.y / SCALE;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
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
