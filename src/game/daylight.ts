import type Phaser from 'phaser';

/**
 * 한국 시간(KST)에 따른 바깥 맵의 밝기(2026-11-13 사용자 요청 "아침, 노을, 저녁, 새벽 느낌을 화면 밝기로").
 * 시간 구간은 사용자가 고른 그대로다: 아침 06~17시 지금 밝기, 노을 17~19시 주황빛, 저녁 19~04시 어둡게, 새벽 04~06시 푸른빛.
 * 정각마다 바뀌고, 30초마다 시각을 확인한다. 건물 안과 전쟁터(늘 어두움)에는 쓰지 않는다.
 */
export type DayPhase = 'morning' | 'sunset' | 'evening' | 'dawn';

const CHECK_MS = 30_000;
const FADE_MS = 2500;

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
  private phase: DayPhase = phaseOf(kstHour());
  private outdoor = false;
  /** 시간대 대신 늘 덮는 색(지옥 던전처럼 분위기가 정해진 맵) */
  private mood: { color: number; alpha: number } | null = null;
  /** 시간대가 정해지거나 바뀔 때 부른다(등 빛이 진하기를 맞춘다, lights.ts). fade면 2.5초 동안 바뀌는 중이다. */
  onPhase: ((phase: DayPhase, fade: boolean) => void) | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    depth: number,
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
    this.cover.setFillStyle(color, 1);
    this.scene.tweens.killTweensOf(this.cover);
    if (fade) this.scene.tweens.add({ targets: this.cover, alpha: target, duration: FADE_MS });
    else this.cover.setAlpha(target);
  }
}
