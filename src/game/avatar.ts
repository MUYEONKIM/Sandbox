import type Phaser from 'phaser';
import { CHAR_FOOT_Y, CHAR_H } from '../art/character';
import { PISTOL_GRIP, PISTOL_SIZE } from '../art/weapons';
import { MAX_HP } from '../config';
import { depthOf, gridToWorld } from '../iso';
import type { Tile } from './world';

/** 총을 들었을 때 손의 높이와 몸에서 떨어진 거리 (아트 픽셀) */
const HAND_HEIGHT = 12;
const HAND_REACH = 7;
const HIT_FLASH_MS = 120;
const DOWN_ALPHA = 0.4;

/** 대시 연기: 출발할 때 한 번 피어오르고, 달리는 동안 조금씩 남는다. */
const SMOKE_BURST = 3;
const SMOKE_INTERVAL_MS = 40;
const SMOKE_LIFE_MS = 380;
const SMOKE_ALPHA = 0.75;
/** 연기가 흩어지는 좌우 폭과 떠오르는 높이 (아트 픽셀) */
const SMOKE_SPREAD = 7;
const SMOKE_RISE = 9;

/** 맵 위의 캐릭터 하나. 내 캐릭터와 다른 플레이어가 함께 쓴다. */
export class Avatar {
  private readonly image: Phaser.GameObjects.Image;
  private readonly gun: Phaser.GameObjects.Image;
  private from: Tile;
  private t = 1;
  private ms = 1;
  private view: 'front' | 'back' = 'front';
  private flip = false;
  private leftFoot = true;
  private aimAngle: number | null = null;
  private lowerGunAt = Infinity;
  private smoking = false;
  private nextSmokeAt = 0;
  hp: number;

  constructor(
    private readonly scene: Phaser.Scene,
    public tile: Tile,
    hp = MAX_HP,
  ) {
    this.from = tile;
    this.hp = hp;
    this.image = scene.add.image(0, 0, 'player', 'front-0').setOrigin(0.5, CHAR_FOOT_Y / CHAR_H);
    this.gun = scene.add
      .image(0, 0, 'pistol')
      .setOrigin(PISTOL_GRIP.x / PISTOL_SIZE, PISTOL_GRIP.y / PISTOL_SIZE)
      .setVisible(false);
    this.setHp(hp);
    this.sync();
  }

  get sprite() {
    return this.image;
  }

  get moving() {
    return this.t < 1;
  }

  /** 지금 칸 이동이 얼마나 진행됐는지 (0~1) */
  get progress() {
    return this.t;
  }

  get isDown() {
    return this.hp <= 0;
  }

  /** 격자 이동 방향으로 몸을 돌린다. 화면에서 위쪽이면 등을, 왼쪽이면 뒤집은 그림을 쓴다. */
  face(dx: number, dy: number) {
    if (!dx && !dy) return;
    this.view = dx + dy < 0 ? 'back' : 'front';
    this.flip = dx - dy < 0;
  }

  /** 지금 위치에서 to까지 걸어간다. 이동 중에 불러도 끊기지 않고 이어진다. */
  stepTo(to: Tile, ms: number) {
    this.face(to.x - this.tile.x, to.y - this.tile.y);
    this.from = this.position();
    this.tile = to;
    this.t = ms > 0 ? 0 : 1;
    this.ms = ms;
    this.leftFoot = !this.leftFoot;
    this.smoking = false;
  }

  /** stepTo처럼 움직이되 발밑에 하얀 연기를 흩날린다. */
  dashTo(to: Tile, ms: number) {
    for (let i = 0; i < SMOKE_BURST; i++) this.puff();
    this.stepTo(to, ms);
    this.smoking = true;
    this.nextSmokeAt = this.scene.time.now + SMOKE_INTERVAL_MS;
  }

  private leaveSmoke() {
    if (!this.moving) {
      this.smoking = false;
      return;
    }
    const now = this.scene.time.now;
    if (now < this.nextSmokeAt) return;
    this.nextSmokeAt = now + SMOKE_INTERVAL_MS;
    this.puff();
  }

  /** 연기 한 덩이를 발밑에 놓고, 흩어지며 떠올라 사라지게 한다. */
  private puff() {
    const { x, y, depth } = this.image;
    const spread = () => (Math.random() - 0.5) * SMOKE_SPREAD * 2;
    const scale = 0.6 + Math.random() * 0.5;
    const smoke = this.scene.add
      .image(x + spread(), y + Math.random() * 3, 'smoke')
      .setDepth(depth - 0.1)
      .setAlpha(SMOKE_ALPHA)
      .setScale(scale);
    this.scene.tweens.add({
      targets: smoke,
      x: smoke.x + spread(),
      y: smoke.y - SMOKE_RISE * (0.5 + Math.random() * 0.5),
      scale: scale * 1.7,
      alpha: 0,
      duration: SMOKE_LIFE_MS,
      ease: 'Sine.easeOut',
      onComplete: () => smoke.destroy(),
    });
  }

  /** 걷지 않고 바로 옮긴다. */
  teleport(to: Tile) {
    this.from = to;
    this.tile = to;
    this.t = 1;
  }

  /** 소수 격자 좌표로 본 지금 위치. 칸의 왼쪽 위 모서리 기준이다. */
  position(): Tile {
    return {
      x: this.from.x + (this.tile.x - this.from.x) * this.t,
      y: this.from.y + (this.tile.y - this.from.y) * this.t,
    };
  }

  /** 총을 화면 각도 angle로 겨눈다. holdMs를 주면 그 시간이 지나 내린다. */
  aim(angle: number, holdMs?: number) {
    this.aimAngle = angle;
    this.lowerGunAt = holdMs === undefined ? Infinity : this.scene.time.now + holdMs;
  }

  lowerGun() {
    this.aimAngle = null;
    this.lowerGunAt = Infinity;
  }

  setHp(hp: number) {
    if (hp < this.hp) this.flash();
    this.hp = hp;
    this.image.setAlpha(this.isDown ? DOWN_ALPHA : 1);
  }

  private flash() {
    this.image.setTint(0xff6b5e);
    this.scene.time.delayedCall(HIT_FLASH_MS, () => {
      if (this.image.active) this.image.setTint(0xffffff);
    });
  }

  update(delta: number) {
    if (this.t < 1) this.t = Math.min(1, this.t + delta / this.ms);
    if (this.scene.time.now >= this.lowerGunAt) this.lowerGun();
    this.sync();
    if (this.smoking) this.leaveSmoke();
  }

  private sync() {
    const { x, y } = this.position();
    const pos = gridToWorld(x + 0.5, y + 0.5);
    const frame = this.t < 0.5 ? (this.leftFoot ? 1 : 2) : 0;
    const depth = depthOf(x, y) + 1;
    this.image
      .setPosition(pos.x, pos.y)
      .setFrame(`${this.view}-${frame}`)
      .setFlipX(this.flip)
      .setDepth(depth);

    const armed = this.aimAngle !== null && !this.isDown;
    this.gun.setVisible(armed);
    if (armed) {
      const angle = this.aimAngle!;
      this.gun
        .setPosition(pos.x + Math.cos(angle) * HAND_REACH, pos.y - HAND_HEIGHT + Math.sin(angle) * HAND_REACH * 0.5)
        .setRotation(angle)
        .setFlipY(Math.abs(angle) > Math.PI / 2)
        .setDepth(Math.sin(angle) < 0 ? depth - 0.5 : depth + 0.5);
    }
  }

  destroy() {
    this.image.destroy();
    this.gun.destroy();
  }
}
