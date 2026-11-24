import type Phaser from 'phaser';
import { ensureTorchHole, TORCH_HOLE } from '../art/torch';

/**
 * 한국 시간(KST)에 따른 바깥 맵의 밝기(2026-11-13 사용자 요청 "아침, 노을, 저녁, 새벽 느낌을 화면 밝기로").
 * 시간 구간은 사용자가 고른 그대로다: 아침 06~17시 지금 밝기, 노을 17~19시 주황빛, 저녁 19~04시 어둡게, 새벽 04~06시 푸른빛.
 * 정각마다 바뀌고, 30초마다 시각을 확인한다. 건물 안과 전쟁터(늘 어두움)에는 쓰지 않는다.
 */
export type DayPhase = 'morning' | 'sunset' | 'evening' | 'dawn';

const CHECK_MS = 30_000;
const FADE_MS = 2500;
/** 횃불 구멍 덮개(DynamicTexture)의 키와 화면 밖 여유(월드 px). 카메라가 한 프레임에 움직이는 거리보다 넉넉해야 가장자리가 비지 않는다. */
const HOLE_COVER = 'torch-cover';
const HOLE_MARGIN = 64;
/** 내가 움직이지 않고 남의 횃불만 움직였을 때 다시 그리는 최소 간격(ms). 1초에 30번 */
const OTHERS_REDRAW_MS = 33;

export interface Point {
  x: number;
  y: number;
}

/** 화면 전체에 덮는 색과 진하기. 아침은 덮지 않는다. */
const LOOK: Record<DayPhase, { color: number; alpha: number }> = {
  morning: { color: 0x000000, alpha: 0 },
  sunset: { color: 0xff6a2a, alpha: 0.22 },
  evening: { color: 0x0a1030, alpha: 0.45 },
  dawn: { color: 0x2e4a8c, alpha: 0.25 },
};

export function kstHour(now = Date.now()) {
  return Math.floor(now / 3_600_000 + 9) % 24;
}

export function phaseOf(hour: number): DayPhase {
  if (hour >= 6 && hour < 17) return 'morning';
  if (hour >= 17 && hour < 19) return 'sunset';
  if (hour >= 4 && hour < 6) return 'dawn';
  return 'evening';
}

export class Daylight {
  private readonly cover: Phaser.GameObjects.Rectangle;
  /**
   * 횃불 구멍을 낸 덮개(2026-11-24 횃불, 공유 노트 code-torch-check-1124.md 1장 C): 화면 크기의 흰 DynamicTexture에 횃불마다 구멍 그림을
   * 지우기로 찍고, 시간대 색으로 물들여 사각형 덮개 대신 보인다. 횃불이 화면에 없으면 숨기고 사각형을 쓴다(평소 비용 0).
   */
  private holeTex: Phaser.Textures.DynamicTexture | null = null;
  private holeImage: Phaser.GameObjects.Image | null = null;
  private holesOn = false;
  private color = 0x000000;
  /** 지난번에 그린 화면 자리·내 횃불(mine)과 남의 횃불(others), 그린 시각 */
  private drawnMine = '';
  private drawnOthers = '';
  private drawnAt = 0;
  /** 성능 확인용: 구멍 덮개를 다시 그린 횟수와 마지막 한 번 그리는 데 든 시간(ms, CPU) */
  holeDraws = 0;
  holeMs = 0;
  private phase: DayPhase = phaseOf(kstHour());
  private outdoor = false;
  /** 시간대 대신 늘 덮는 색(지옥 던전처럼 분위기가 정해진 맵) */
  private mood: { color: number; alpha: number } | null = null;
  /** 시간대가 정해지거나 바뀔 때 부른다(등 빛이 진하기를 맞춘다, lights.ts). fade면 2.5초 동안 바뀌는 중이다. */
  onPhase: ((phase: DayPhase, fade: boolean) => void) | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth: number,
  ) {
    this.cover = scene.add.rectangle(0, 0, 1, 1, 0x000000, 0).setOrigin(0, 0).setDepth(depth);
    scene.time.addEvent({ delay: CHECK_MS, loop: true, callback: () => this.check() });
  }

  /** 맵에 들어갈 때 부른다. outdoor면 그 맵 범위(월드 좌표)를 시간대 색으로, mood가 있으면 그 색으로 덮는다. */
  setMap(outdoor: boolean, left: number, top: number, width: number, height: number, mood: { color: number; alpha: number } | null = null) {
    this.outdoor = outdoor;
    this.mood = mood;
    this.scene.tweens.killTweensOf(this.cover);
    this.cover.setPosition(left, top).setSize(width, height);
    this.paint(false);
  }

  private check() {
    const phase = phaseOf(kstHour());
    if (phase === this.phase) return;
    this.phase = phase;
    this.paint(true);
  }

  get current() {
    return this.phase;
  }

  private paint(fade: boolean) {
    this.onPhase?.(this.phase, fade);
    const { color, alpha } = this.mood ?? LOOK[this.phase];
    const target = this.mood ? alpha : this.outdoor ? alpha : 0;
    this.color = color;
    this.holeImage?.setTint(color);
    this.cover.setFillStyle(color, 1);
    this.scene.tweens.killTweensOf(this.cover);
    if (fade) this.scene.tweens.add({ targets: this.cover, alpha: target, duration: FADE_MS });
    else this.cover.setAlpha(target);
  }

  /** 횃불 구멍을 낼 수 있는 덮개인지: 바깥 맵의 시간대 덮개(지옥 분위기 색과 전쟁터 어둠은 그대로 둔다) */
  private get holeable() {
    return this.outdoor && !this.mood;
  }

  /**
   * 매 프레임(GameScene.update) 부른다. view는 카메라 화면 범위(월드), mine은 내 횃불 발밑, others는 화면 안 남의 횃불 발밑(가까운 8명까지).
   * 바뀐 것이 없으면 아무것도 하지 않는다. 내가 움직이면 바로, 남만 움직이면 1초에 30번까지 다시 그린다.
   */
  setHoles(view: Phaser.Geom.Rectangle, mine: Point | null, others: readonly Point[], now: number) {
    const want = this.holeable && (mine !== null || others.length > 0) && this.cover.alpha > 0;
    if (!want) {
      if (this.holesOn) {
        this.holesOn = false;
        this.holeImage?.setVisible(false);
        this.cover.setVisible(true);
        this.drawnMine = this.drawnOthers = '';
      }
      return;
    }
    const w = Math.ceil((Math.ceil(view.width) + HOLE_MARGIN * 2) / 2) * 2;
    const h = Math.ceil((Math.ceil(view.height) + HOLE_MARGIN * 2) / 2) * 2;
    if (!this.holeTex) {
      ensureTorchHole(this.scene);
      this.holeTex = this.scene.textures.addDynamicTexture(HOLE_COVER, w, h)!;
      this.holeImage = this.scene.add.image(0, 0, HOLE_COVER).setOrigin(0, 0).setDepth(this.depth).setTint(this.color);
    } else if (this.holeTex.width !== w || this.holeTex.height !== h) {
      this.holeTex.setSize(w, h);
      this.holeImage!.setSize(w, h).setFrame(this.holeTex.get());
      this.drawnMine = '';
    }
    const left = Math.floor(view.x) - HOLE_MARGIN;
    const top = Math.floor(view.y) - HOLE_MARGIN;
    const spot = (p: Point) => `${Math.round(p.x) - left},${Math.round(p.y) - top}`;
    const mineKey = `${left},${top},${w},${h},${mine ? spot(mine) : ''}`;
    const othersKey = others.map(spot).join(';');
    const image = this.holeImage!;
    if (image.alpha !== this.cover.alpha) image.setAlpha(this.cover.alpha);
    if (!this.holesOn) {
      this.holesOn = true;
      image.setVisible(true);
      this.cover.setVisible(false);
    } else if (mineKey === this.drawnMine && (othersKey === this.drawnOthers || now - this.drawnAt < OTHERS_REDRAW_MS)) {
      return;
    }
    const started = performance.now();
    const tex = this.holeTex;
    tex.fill(0xffffff, 1);
    // 프레임을 찍을 때 (x, y)는 그림 가운데다.
    for (const p of mine ? [mine, ...others] : others) tex.erase(TORCH_HOLE, Math.round(p.x) - left, Math.round(p.y) - top);
    tex.render();
    if (image.x !== left || image.y !== top) image.setPosition(left, top);
    this.drawnMine = mineKey;
    this.drawnOthers = othersKey;
    this.drawnAt = now;
    this.holeDraws++;
    this.holeMs = performance.now() - started;
  }
}
