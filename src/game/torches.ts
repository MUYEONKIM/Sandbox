import Phaser from 'phaser';
import { ensureGlowTexture, GLOW_LOOKS, GLOW_TEXTURE } from '../art/glow';
import { ensureTorchWarm, TORCH_WARM } from '../art/torch';
import { keepDepth } from '../iso';

/** 바닥 빛 웅덩이 깊이(lights.ts DEPTH_POOL과 같음): 바닥 그림 위, 사람·블록·나무 아래라 바닥만 밝힌다. */
const DEPTH_POOL = 0.7;
const LOOK = GLOW_LOOKS.torch;

/** 횃불 하나: 발밑(웅덩이)과 불꽃 가운데(빛무리), 횃불 그림 깊이 */
export interface TorchSpot {
  key: string;
  footX: number;
  footY: number;
  flameX: number;
  flameY: number;
  depth: number;
}

interface Pair {
  pool: Phaser.GameObjects.Image;
  halo: Phaser.GameObjects.Image;
  level: number;
}

/**
 * 횃불의 따뜻한 빛(2026-11-24, 디자인 torch.md 3절 "어둠 걷음 + 따뜻한 빛 (추천)"): 발밑 바닥 웅덩이(0xffc070, 반지름 5칸)와
 * 불꽃 빛무리(glow.ts torch). 등 빛처럼 가산 혼합이고 진하기는 시간대(Lights.glow, 아침 0)와 불 깜빡임(1초 1.5번, 0.15)을 따른다.
 * 그림은 내 것과 화면 안 남의 것(가까운 8명)만큼 만들어 두고 다시 쓴다. 매 프레임은 자리만 옮기고, 알파는 깜빡임 계단이 바뀔 때만 고친다.
 */
export class TorchLight {
  private readonly pairs: Pair[] = [];
  private shown = 0;
  private strength = -1;

  constructor(private readonly scene: Phaser.Scene) {}

  /** spots는 지금 보일 횃불들, strength는 등 빛 진하기(0이면 다 숨김) */
  update(spots: readonly TorchSpot[], strength: number, now: number) {
    const count = strength > 0 ? spots.length : 0;
    while (this.pairs.length < count) this.pairs.push(this.newPair());
    const all = strength !== this.strength;
    this.strength = strength;
    for (let i = 0; i < this.pairs.length; i++) {
      const pair = this.pairs[i];
      const spot = i < count ? spots[i] : null;
      if (!spot) {
        if (i < this.shown) {
          pair.pool.setVisible(false);
          pair.halo.setVisible(false);
        }
        continue;
      }
      if (i >= this.shown) {
        pair.pool.setVisible(true);
        pair.halo.setVisible(true);
        pair.level = -1;
      }
      if (pair.pool.x !== spot.footX || pair.pool.y !== spot.footY) pair.pool.setPosition(spot.footX, spot.footY);
      if (pair.halo.x !== spot.flameX || pair.halo.y !== spot.flameY) pair.halo.setPosition(spot.flameX, spot.flameY);
      keepDepth(pair.halo, spot.depth + 0.005);
      // 깜빡임: 등 빛(lights.ts tick)과 같은 4계단. 횃불마다 위상을 달리한다.
      const s = Math.sin(((now / 1000) * 1.5 + i * 0.37) * Math.PI * 2) * 0.5 + 0.5;
      const level = Math.round(s * 3);
      if (!all && level === pair.level) continue;
      pair.level = level;
      const k = strength * (1 - (LOOK.flicker * level) / 3);
      pair.halo.setAlpha(k);
      pair.pool.setAlpha(k);
    }
    this.shown = count;
  }

  /** 맵을 떠날 때 숨긴다(그림은 다시 쓴다). */
  hide() {
    for (const pair of this.pairs) {
      pair.pool.setVisible(false);
      pair.halo.setVisible(false);
    }
    this.shown = 0;
  }

  private newPair(): Pair {
    ensureTorchWarm(this.scene);
    ensureGlowTexture(this.scene);
    const pool = this.scene.add.image(0, 0, TORCH_WARM).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH_POOL).setVisible(false);
    const halo = this.scene.add.image(0, 0, GLOW_TEXTURE, 'halo:torch').setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    return { pool, halo, level: -1 };
  }
}
