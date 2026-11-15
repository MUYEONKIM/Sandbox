import Phaser from 'phaser';
import { tileCenter } from '../iso';
import type { Tile } from './world';

/**
 * 지옥 던전의 음습한 분위기(2026-11-15 사용자 요청 "지옥 던전 조금 더 음습하게").
 * 화면을 검붉게 덮는 색은 Daylight가 맵의 mood로 칠하고, 여기서는 그 위에 용암 불빛(칸마다 번지는 주황 빛, 함께 천천히 일렁임)과
 * 내 둘레에서 피어올라 꺼지는 불똥을 더한다. 가장자리가 어두워지는 테두리는 CSS(#game.gloom)다.
 * 렌더링 비용: 불빛은 용암 칸 수만큼의 이미지에 트윈 하나, 불똥은 동시에 30개 안팎이다. 숫자와 색은 에이전트가 정했다.
 */

const GLOW_ALPHA = { from: 0.32, to: 0.62 };
const GLOW_MS = 1600;
const EMBER_EVERY_MS = 120;
const EMBER_LIFE_MS = 3200;

function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 72;
  canvas.height = 40;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(36, 20);
  ctx.scale(1, 0.55);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 36);
  gradient.addColorStop(0, 'rgba(255, 140, 50, 0.9)');
  gradient.addColorStop(0.45, 'rgba(230, 70, 20, 0.45)');
  gradient.addColorStop(1, 'rgba(120, 10, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, 36, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

function emberTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 3;
  canvas.height = 3;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ff7a2a';
  ctx.fillRect(0, 1, 3, 1);
  ctx.fillRect(1, 0, 1, 3);
  ctx.fillStyle = '#ffe08a';
  ctx.fillRect(1, 1, 1, 1);
  return canvas;
}

export class Gloom {
  private glows: Phaser.GameObjects.Image[] = [];
  private embers: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private following = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth: number,
  ) {
    if (!scene.textures.exists('gloom-glow')) scene.textures.addCanvas('gloom-glow', glowTexture());
    if (!scene.textures.exists('gloom-ember')) scene.textures.addCanvas('gloom-ember', emberTexture());
  }

  /** 분위기가 있는 맵에 들어갈 때 부른다. lava는 불빛을 둘 용암 칸이다. 불똥은 track으로 정한 대상 둘레에서 핀다. */
  show(lava: Tile[]) {
    this.clear();
    document.getElementById('game')?.classList.add('gloom');
    for (const { x, y } of lava) {
      const c = tileCenter(x, y);
      this.glows.push(this.scene.add.image(c.x, c.y - 6, 'gloom-glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(this.depth).setAlpha(GLOW_ALPHA.from));
    }
    if (this.glows.length) {
      this.scene.tweens.add({ targets: this.glows, alpha: GLOW_ALPHA.to, duration: GLOW_MS, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    this.embers = this.scene.add
      .particles(0, 0, 'gloom-ember', {
        lifespan: EMBER_LIFE_MS,
        frequency: EMBER_EVERY_MS,
        quantity: 1,
        speedX: { min: -6, max: 6 },
        speedY: { min: -28, max: -12 },
        alpha: { start: 0.9, end: 0 },
        scale: { start: 1, end: 0.4 },
        blendMode: Phaser.BlendModes.ADD,
        // 따라가는 캐릭터 둘레의 화면 크기쯤 되는 네모 안 아무 곳에서 핀다.
        emitZone: {
          type: 'random',
          source: {
            getRandomPoint: (point: { x: number; y: number }) => {
              point.x = -260 + Math.random() * 520;
              point.y = -140 + Math.random() * 320;
            },
          },
        },
      })
      .setDepth(this.depth + 0.1);
    this.following = false;
  }

  /** 불똥이 내 캐릭터 둘레에서 피게 한다. 맵에 들어온 뒤 캐릭터가 생기므로 매 프레임 불러도 한 번만 붙인다. */
  track(target: { x: number; y: number }) {
    if (!this.embers || this.following) return;
    this.embers.startFollow(target);
    this.following = true;
  }

  clear() {
    document.getElementById('game')?.classList.remove('gloom');
    this.scene.tweens.killTweensOf(this.glows);
    for (const glow of this.glows) glow.destroy();
    this.glows = [];
    this.embers?.destroy();
    this.embers = null;
  }
}
