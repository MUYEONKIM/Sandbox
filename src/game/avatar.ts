import type Phaser from 'phaser';
import { MAX_HP } from '../config';
import { depthOf, gridToWorld } from '../iso';
import { WEAPONS, type WeaponId } from '../items';
import type { Tile } from './world';

/** 캐릭터 시트의 칸 크기와, 칸 안에서 발이 닿는 높이 */
export const TEAM_W = 22;
export const TEAM_H = 40;
const TEAM_FOOT_Y = 39;

/** 시트에는 7명이 한 사람당 2장씩 이어져 있다. 모두 왼쪽 앞을 보고 있고 뒷모습은 없다. */
const TEAM_SIZE = 7;
const TEAM_FRAMES = 2;
/** 가만히 있을 때 두 장을 번갈아 보여 주는 간격. 원본 애니메이션과 같다. */
const IDLE_FRAME_MS = 500;
/** 걷는 그림이 따로 없어서 걸음마다 살짝 뛰어오른다. (아트 픽셀) */
const STEP_HOP = 2;

/** 플레이어 id로 캐릭터를 고른다. 어느 화면에서 봐도 같은 캐릭터가 나온다. */
function memberOf(id: string) {
  let sum = 0;
  for (const char of id) sum += char.charCodeAt(0);
  return sum % TEAM_SIZE;
}

/** 무기를 들었을 때 손의 높이와 몸에서 떨어진 거리 (아트 픽셀) */
const HAND_HEIGHT = 12;
const HAND_REACH = 7;
const HIT_FLASH_MS = 120;
const DOWN_ALPHA = 0.4;

/** 칼을 휘두르는 시간과 각도 (라디안) */
const SWING_MS = 160;
const SWING_ARC = 2.4;
/** 칼자국의 반지름과 사라지는 시간. 바닥이 납작해 보이는 만큼 세로로 줄여 그린다. */
const SLASH_RADIUS = 20;
const SLASH_FADE_MS = 180;
const SLASH_FLATTEN = 0.6;

/** 점프의 가장 높은 지점 (아트 픽셀). 벽 블록 높이보다 높아야 넘어가 보인다. */
const JUMP_HEIGHT = 24;

/** 총에 맞았을 때 뒤로 밀려나는 거리와 몸이 기우는 각도 (라디안) */
const KNOCK_DISTANCE = 9;
const KNOCK_LEAN = 0.28;
const KNOCK_MS = 280;
/** 밀려나는 데 쓰는 시간의 비율. 나머지는 천천히 돌아온다. */
const KNOCK_OUT = 0.2;

/** 달릴 때 발밑에서 피어오르는 연기 */
const SMOKE_LIFE_MS = 380;
const SMOKE_ALPHA = 0.75;
/** 연기가 흩어지는 좌우 폭과 떠오르는 높이 (아트 픽셀) */
const SMOKE_SPREAD = 7;
const SMOKE_RISE = 9;

/** 맵 위의 캐릭터 하나. 내 캐릭터와 다른 플레이어가 함께 쓴다. */
export class Avatar {
  private readonly image: Phaser.GameObjects.Image;
  private readonly gun: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly firstFrame: number;
  /** 땅 위의 위치. 카메라가 따라가므로 점프나 밀려남에 흔들리지 않는다. */
  readonly anchor = { x: 0, y: 0 };
  private from: Tile;
  private t = 1;
  private ms = 1;
  private flip = false;
  /** 걷는 동안 보여 줄 그림. 걸음마다 바뀐다. */
  private stepFrame = 0;
  private aimAngle: number | null = null;
  private lowerGunAt = Infinity;
  private airborne = false;
  private swingT = 1;
  private knockX = 0;
  private knockY = 0;
  private knockT = 1;
  hp: number;

  constructor(
    private readonly scene: Phaser.Scene,
    id: string,
    public tile: Tile,
    hp = MAX_HP,
  ) {
    this.from = tile;
    this.hp = hp;
    this.firstFrame = memberOf(id) * TEAM_FRAMES;
    this.image = scene.add.image(0, 0, 'team', this.firstFrame).setOrigin(0.5, TEAM_FOOT_Y / TEAM_H);
    this.gun = scene.add.image(0, 0, 'pistol').setVisible(false);
    this.setWeapon('pistol');
    this.shadow = scene.add.image(0, 0, 'jump-shadow');
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

  get jumping() {
    return this.airborne;
  }

  get isDown() {
    return this.hp <= 0;
  }

  /** 격자 이동 방향으로 몸을 돌린다. 그림이 왼쪽을 보므로 화면 오른쪽으로 갈 때 뒤집는다. */
  face(dx: number, dy: number) {
    const screenX = dx - dy;
    if (screenX !== 0) this.flip = screenX > 0;
  }

  /** 지금 위치에서 to까지 걸어간다. 이동 중에 불러도 끊기지 않고 이어진다. */
  stepTo(to: Tile, ms: number) {
    this.face(to.x - this.tile.x, to.y - this.tile.y);
    this.from = this.position();
    this.tile = to;
    this.t = ms > 0 ? 0 : 1;
    this.ms = ms;
    this.stepFrame = 1 - this.stepFrame;
    this.airborne = false;
  }

  /** to까지 포물선을 그리며 뛴다. 제자리 점프도 된다. */
  jumpTo(to: Tile, ms: number) {
    this.stepTo(to, ms);
    this.airborne = true;
  }

  /** 총알이 (dirX, dirY) 쪽으로 밀어낸다. 화면 방향의 단위 벡터다. */
  hitBack(dirX: number, dirY: number) {
    this.knockX = dirX;
    this.knockY = dirY;
    this.knockT = 0;
  }

  /** stepTo처럼 움직이되 발밑에 하얀 연기를 남긴다. */
  runTo(to: Tile, ms: number) {
    this.puff();
    this.stepTo(to, ms);
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
    this.airborne = false;
  }

  /** 소수 격자 좌표로 본 지금 위치. 칸의 왼쪽 위 모서리 기준이다. */
  position(): Tile {
    return {
      x: this.from.x + (this.tile.x - this.from.x) * this.t,
      y: this.from.y + (this.tile.y - this.from.y) * this.t,
    };
  }

  /** 손에 든 무기 그림을 바꾼다. */
  setWeapon(id: WeaponId) {
    const { size, grip } = WEAPONS[id].art;
    this.gun.setTexture(id).setOrigin(grip.x / size, grip.y / size);
  }

  /** 칼을 화면 각도 angle 쪽으로 휘두르고 칼자국을 남긴다. */
  swing(angle: number, holdMs?: number) {
    this.aim(angle, holdMs);
    this.swingT = 0;

    const { x, y, depth } = this.image;
    const center = Math.atan2(Math.sin(angle) / SLASH_FLATTEN, Math.cos(angle));
    const slash = this.scene.add
      .graphics()
      .setPosition(x, y - HAND_HEIGHT)
      .setScale(1, SLASH_FLATTEN)
      .setDepth(depth + 1);
    slash.lineStyle(3, 0xffffff, 0.9).beginPath();
    slash.arc(0, 0, SLASH_RADIUS, center - SWING_ARC / 2, center + SWING_ARC / 2);
    slash.strokePath();
    this.scene.tweens.add({
      targets: slash,
      alpha: 0,
      duration: SLASH_FADE_MS,
      onComplete: () => slash.destroy(),
    });
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
    if (this.t >= 1) this.airborne = false;
    if (this.knockT < 1) this.knockT = Math.min(1, this.knockT + delta / KNOCK_MS);
    if (this.swingT < 1) this.swingT = Math.min(1, this.swingT + delta / SWING_MS);
    if (this.scene.time.now >= this.lowerGunAt) this.lowerGun();
    this.sync();
  }

  /** 빠르게 밀려났다가 천천히 돌아오는 정도 (0~1) */
  private get knockAmount() {
    const t = this.knockT;
    return t < KNOCK_OUT ? t / KNOCK_OUT : ((1 - t) / (1 - KNOCK_OUT)) ** 2;
  }

  private sync() {
    const { x, y } = this.position();
    const pos = gridToWorld(x + 0.5, y + 0.5);
    this.anchor.x = pos.x;
    this.anchor.y = pos.y;

    const walking = this.t < 1 && !this.airborne;
    const hop = walking ? STEP_HOP * Math.sin(Math.PI * this.t) : 0;
    const lift = this.airborne ? JUMP_HEIGHT * 4 * this.t * (1 - this.t) : hop;
    const knock = this.knockAmount;
    const drawX = pos.x + this.knockX * KNOCK_DISTANCE * knock;
    const drawY = pos.y + this.knockY * KNOCK_DISTANCE * 0.6 * knock - lift;
    const idleFrame = Math.floor(this.scene.time.now / IDLE_FRAME_MS) % TEAM_FRAMES;
    const frame = this.firstFrame + (walking ? this.stepFrame : idleFrame);
    // 공중에서는 넘어가는 벽보다 앞에 그려져야 벽에 가리지 않는다.
    const depth = this.airborne
      ? depthOf(Math.max(this.from.x, this.tile.x), Math.max(this.from.y, this.tile.y)) + 1
      : depthOf(x, y) + 1;
    this.image
      .setPosition(drawX, drawY)
      .setFrame(frame)
      .setFlipX(this.flip)
      .setRotation(this.knockX * KNOCK_LEAN * knock)
      .setDepth(depth);
    this.shadow.setPosition(pos.x, pos.y).setDepth(depthOf(x, y));

    const armed = this.aimAngle !== null && !this.isDown;
    this.gun.setVisible(armed);
    if (armed) {
      const angle = this.aimAngle! + (this.swingT < 1 ? (this.swingT - 0.5) * SWING_ARC : 0);
      this.gun
        .setPosition(drawX + Math.cos(angle) * HAND_REACH, drawY - HAND_HEIGHT + Math.sin(angle) * HAND_REACH * 0.5)
        .setRotation(angle)
        .setFlipY(Math.abs(angle) > Math.PI / 2)
        .setDepth(Math.sin(angle) < 0 ? depth - 0.5 : depth + 0.5);
    }
  }

  destroy() {
    this.image.destroy();
    this.gun.destroy();
    this.shadow.destroy();
  }
}
