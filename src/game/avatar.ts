import Phaser from 'phaser';
import { BASE_HP, TEAM_SIZE } from '../config';
import { depthOf, gridToWorld, keepDepth } from '../iso';
import { WEAPONS, type WeaponId } from '../items';
import { ensureTorchTexture, TORCH_FLAME, TORCH_FRAME_MS, TORCH_GRIP, TORCH_HAND, TORCH_ORDER, TORCH_TEXTURE } from '../art/torch';
import {
  GOLD_BRIGHT_MS,
  GOLD_BRIGHT_ORDER,
  GOLD_HELD,
  GOLD_HELD_COLS,
  GOLD_HELD_SIZE,
  GOLD_MUZZLE,
  GOLD_SLASH,
  GOLD_SOFT_MS,
  GOLD_SOFT_ORDER,
  goldTier,
  type GoldTier,
} from '../art/goldArt';
import { ensureGold, goldNightOf, type GoldNight } from './weaponGlow';
import type { BulletLook } from './bullets';
import type { Tile } from './world';
import type { SfxKey } from '../sound/catalog';
import { PetFollower, type PetSeat } from './petFollower';
import type { PetKind, SentMood } from './pets';

/** 캐릭터 시트의 칸 크기와, 칸 안에서 발이 닿는 높이 */
export const TEAM_W = 22;
export const TEAM_H = 40;
const TEAM_FOOT_Y = 39;

/** 시트에는 한 사람당 2장씩 이어져 있다. 모두 왼쪽 앞을 보고 있고 뒷모습은 없다. */
const TEAM_FRAMES = 2;
/** 가만히 있을 때 두 장을 번갈아 보여 주는 간격. 원본 애니메이션과 같다. */
const IDLE_FRAME_MS = 500;
/** 걷는 그림이 따로 없어서 걸음마다 살짝 뛰어오른다. (아트 픽셀) */
const STEP_HOP = 2;

/** 캐릭터를 고른 적 없는 옛 계정은 id로 정한다. 어느 화면에서 봐도 같은 캐릭터가 나온다(모험 전투 화면도 씀). */
export function memberOf(id: string) {
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

/**
 * 무기를 고르고 겨누지 않을 때 내려 든 각도(라디안, 2026-11-28 무기 금빛 weapon-glow.md 14-1): 앞모습은 바라보는 쪽 아래로,
 * 뒷모습은 바라보는 쪽 위로(몸 뒤). 공격 금지 맵의 나와, 공격하지 않을 때의 다른 사람이 이 자세다.
 */
const REST_ANGLE = 0.35;
/** 카메라 화면 밖 이만큼(월드 px)까지는 금빛 칸을 고르고 빛·효과를 보인다. 더 밖이면 건너뛴다(weapon-glow.md 13-3). */
const GOLD_VIEW_MARGIN = 64;
type GoldWeapon = keyof typeof GOLD_HELD;

/** 무기 그림의 금빛 단계. 기본 권총(과 금빛 그림 줄이 없는 무기)은 늘 0이다. */
function tierOf(id: WeaponId, level: number): GoldTier {
  return Object.hasOwn(GOLD_HELD, id) ? goldTier(level) : 0;
}

/** 사람마다 금빛 움직임 시작을 엇갈리게 하는 값(0~1999ms, id로 정해 어느 화면에서나 같음) */
function goldPhaseOf(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash % 2000;
}

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

/** 앉았거나 누운 자세 그림과 놓을 자리 */
export interface Pose {
  kind: 'sit' | 'lie';
  frame: string;
  x: number;
  y: number;
  originX: number;
  originY: number;
  flip: boolean;
  depth: number;
  /** 이 자세일 때 펫 자리(2026-11-28 펫, GameScene.applyPose가 정함) */
  pet?: PetSeat;
}

/** 맵 위의 캐릭터 하나. 내 캐릭터와 다른 플레이어가 함께 쓴다. */
export class Avatar {
  private readonly image: Phaser.GameObjects.Image;
  private readonly gun: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Image;
  /** 손에 든 횃불(2026-11-24, 디자인 torch.md 2절). 처음 들 때 만든다. */
  private torch: Phaser.GameObjects.Image | null = null;
  private torchOn = false;
  /** 이 사람의 소리(착지, 횃불). GameScene이 내 것·남의 것에 맞춰 단다. 없으면 소리를 내지 않는다. */
  sounds: ((key: SfxKey) => void) | null = null;
  /** 불꽃 가운데(월드 좌표). 횃불이 보일 때만 맞는 값이다. */
  readonly flame = { x: 0, y: 0 };
  private readonly firstFrame: number;
  /** 땅 위의 위치. 카메라가 따라가므로 점프나 밀려남에 흔들리지 않는다. */
  readonly anchor = { x: 0, y: 0 };
  private from: Tile;
  private t = 1;
  private ms = 1;
  private flip = false;
  /** 화면 위쪽을 보고 있으면 뒷모습을 그린다. */
  private back = false;
  /** 격자에서 바라보는 방향. 전쟁터 손전등이 이 쪽을 비춘다(처음엔 화면 왼쪽 아래 = y 방향). */
  private dir = { dx: 0, dy: 1 };
  /** 전쟁터에서 내 손전등 빛 밖에 있어 숨긴 캐릭터 */
  private hidden = false;
  /** 걷는 동안 보여 줄 그림. 걸음마다 바뀐다. */
  private stepFrame = 0;
  private aimAngle: number | null = null;
  private lowerGunAt = Infinity;
  private airborne = false;
  private swingT = 1;
  private knockX = 0;
  private knockY = 0;
  private knockT = 1;
  /** 작업 동작으로 몸을 움직이는 양 */
  private poseX = 0;
  private poseY = 0;
  private poseLean = 0;
  /** 칸에 선 캐릭터를 올려 그리는 높이(아트 px)를 주는 함수: 단·계단(2026-11-27, 보이기만 높음). 장면이 넣는다. */
  floorLift: ((x: number, y: number) => number) | null = null;
  /**
   * 가구에 앉았거나 누운 자세(2026-11-27, 그림은 디자인 세션 8 poses.png). frame은 자세 그림 이름('스킨:자세'), (x, y)는 그 그림 기준점을
   * 둘 월드 자리(앉는 면·눕는 면), origin은 기준점(뒤집었으면 뒤집은 값), depth는 그 가구 바로 앞 깊이다.
   */
  private posture: Pose | null = null;
  /** 손에 든 무기 그림의 종류와 금빛 단계(0 없음, 1 은은 +20~+29, 2 찬란 +30~) */
  private weapon: WeaponId | null = null;
  private tier: GoldTier = 0;
  /** 고른 칸의 무기(모든 맵에서 손에 듦, 2026-11-28). 겨누지 않으면 내려 든다. 무기를 고르지 않았으면 null */
  private carryKind: WeaponId | null = null;
  private carryTier: GoldTier = 0;
  /** 금빛 칸: 사람마다 엇갈림(ms), 지금 무기의 첫 칸 번호(줄 × 23), 지금 칸 */
  private readonly goldPhase: number;
  private goldRow = 0;
  private goldFrame = -1;
  /** 장면이 정한 밤 빛 그림 진하기·깊이(weaponGlow.ts) */
  private readonly goldNight: GoldNight;
  /** 밤 빛 그림(가산 혼합, 밤 덮개 위). 금빛 무기를 밤에 처음 그릴 때 만든다. */
  private glow: Phaser.GameObjects.Image | null = null;
  private glowFrame = -1;
  /** +30 금빛 칼자국(납작한 컨테이너 안에서 돌린 그림)과 총구 터짐. 처음 쓸 때 만들어 다시 쓴다. 칸이 -1이면 쉬는 중 */
  private goldSlash: { box: Phaser.GameObjects.Container; image: Phaser.GameObjects.Image } | null = null;
  private slashAt = 0;
  private slashFrame = -1;
  private muzzle: Phaser.GameObjects.Image | null = null;
  private muzzleAt = 0;
  private muzzleFrame = -1;
  /** 성능 확인용: 모든 사람의 금빛 그림(손에 든 것, 빛, 칼자국, 총구) 칸을 바꾼 횟수 */
  static goldFrameSets = 0;
  hp: number;
  /** 최대 체력. HP 스텟에 따라 사람마다 다르다. */
  maxHp: number;
  /** 따라오는 펫(2026-11-28). 없으면 null */
  pet: PetFollower | null = null;
  /** 펫이 설 수 있는 칸인지(주인 뒤로 옮길 때, GameScene이 넣음). 없으면 어디든 */
  canStand: ((x: number, y: number) => boolean) | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    id: string,
    public tile: Tile,
    hp = BASE_HP,
    skin: number | null = null,
    maxHp = BASE_HP,
  ) {
    this.from = tile;
    this.hp = hp;
    this.maxHp = maxHp;
    this.firstFrame = (skin ?? memberOf(id)) * TEAM_FRAMES;
    this.goldPhase = goldPhaseOf(id);
    this.goldNight = goldNightOf(scene);
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

  /** 격자에서 바라보는 방향(dx, dy는 -1, 0, 1) */
  get gridFacing() {
    return this.dir;
  }

  /** 전쟁터 빛 밖이나 닫힌 숨은 방 안이라 숨겨 두었는지 */
  get isHidden() {
    return this.hidden;
  }

  /** 횃불을 든다(9번 칸 등 횃불 칸을 골랐을 때, 다른 사람은 이동 알림의 torch). 전쟁터에서는 부르는 쪽이 false를 준다. */
  setTorch(on: boolean) {
    if (on === this.torchOn) return;
    this.torchOn = on;
    this.sounds?.(on ? 'torch_on' : 'torch_off');
    if (on && !this.torch) {
      ensureTorchTexture(this.scene);
      this.torch = this.scene.add.image(0, 0, TORCH_TEXTURE, 'torch-l0').setOrigin(TORCH_GRIP.x / 7, TORCH_GRIP.y / 22);
    }
    if (!on) this.torch?.setVisible(false);
    else this.sync();
  }

  /** 횃불이 보이는지(들었고, 쓰러지지 않았고, 숨기지 않음) */
  get torchLit() {
    return this.torchOn && !this.isDown && !this.hidden;
  }

  /** 전쟁터에서 빛 밖에 있거나 닫힌 숨은 방 안에 있으면 캐릭터와 그림자, 무기를 숨긴다. 바뀌었으면 true */
  setHidden(hidden: boolean) {
    if (hidden === this.hidden) return false;
    this.hidden = hidden;
    this.image.setVisible(!hidden);
    this.shadow.setVisible(!hidden && !this.posture);
    if (hidden) {
      this.gun.setVisible(false);
      this.hideGoldLights();
    }
    return true;
  }

  /** 가구에 앉히거나 눕힌다. null이면 일어난다. */
  setPosture(posture: Pose | null) {
    this.posture = posture;
    if (!posture) this.image.setOrigin(0.5, TEAM_FOOT_Y / TEAM_H);
    this.shadow.setVisible(!posture && !this.hidden);
    this.sync();
  }

  /** 고른 캐릭터 번호(team.png 차례) */
  get skinIndex() {
    return this.firstFrame / TEAM_FRAMES;
  }

  get postureKind() {
    return this.posture?.kind ?? null;
  }

  /** 지금 자세(펫이 자리를 읽음). 서 있으면 null */
  get posturePose() {
    return this.posture;
  }

  /** 마지막 한 칸 걸음 시간(펫이 같은 빠르기로 따라옴). 아직 걷지 않았으면 0 */
  get stepMs() {
    return this.ms > 1 ? this.ms : 0;
  }

  /**
   * 펫을 데리고 다닌다(kind null이면 없앰). 같은 종류면 그대로 두고 기분 얼굴만 바꾼다. mood는 다른 사람 펫 머리 위 기분 얼굴(내 펫은 null).
   * weak: 배부름이나 함께함이 0인 동안의 힘없는 걸음.
   */
  setPet(kind: PetKind | null, mood: SentMood | null = null, weak = false) {
    if (this.pet && this.pet.kind !== kind) {
      this.pet.destroy();
      this.pet = null;
    }
    if (!kind) return;
    if (!this.pet) {
      this.pet = new PetFollower(this.scene, this, kind);
      if (this.night !== 0xffffff) this.pet.setTint(this.night);
    }
    this.pet.weak = weak;
    this.pet.setMood(mood);
  }

  /** 지금 바라보는 화면 방향. 오른쪽이 1이다. */
  get facing() {
    return this.flip ? 1 : -1;
  }

  /** 작업 동작을 위해 몸을 옮기고 기울인다. 0을 주면 제자리로 돌아온다. */
  pose(x: number, y: number, lean: number) {
    this.poseX = x;
    this.poseY = y;
    this.poseLean = lean;
  }

  get isDown() {
    return this.hp <= 0;
  }

  /** 격자 이동 방향으로 몸을 돌린다. 그림이 왼쪽을 보므로 화면 오른쪽으로 갈 때 뒤집는다. */
  face(dx: number, dy: number) {
    if (dx || dy) this.dir = { dx: Math.sign(dx), dy: Math.sign(dy) };
    const screenX = dx - dy;
    if (screenX !== 0) this.flip = screenX > 0;
    const screenY = dx + dy;
    if (screenY !== 0) this.back = screenY < 0;
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

  /** 손에 든 무기 그림을 바꾼다. level은 그 자루의 강화 단계(+20부터 금빛, weapon-glow.md). 같은 그림이면 아무것도 하지 않는다. */
  setWeapon(id: WeaponId, level = 0) {
    this.showWeapon(id, tierOf(id, level));
  }

  private showWeapon(id: WeaponId, tier: GoldTier) {
    if (id === this.weapon && tier === this.tier) return;
    this.weapon = id;
    this.tier = tier;
    this.glowFrame = -1;
    if (!tier) {
      const { size, grip } = WEAPONS[id].art;
      this.gun.setTexture(id).setOrigin(grip.x / size, grip.y / size);
      this.hideGoldLights();
      return;
    }
    // 금빛: gold-held.png의 그 무기 줄. 첫 칸을 두고, 움직이는 칸은 sync가 고른다.
    const { row, x, y } = GOLD_HELD[id as GoldWeapon];
    this.goldRow = row * GOLD_HELD_COLS;
    this.goldFrame = this.goldRow + (tier === 2 ? GOLD_BRIGHT_ORDER[0] : GOLD_SOFT_ORDER[0]);
    this.gun.setTexture(ensureGold(this.scene, 'held'), this.goldFrame).setOrigin(x / GOLD_HELD_SIZE, y / GOLD_HELD_SIZE);
  }

  /**
   * 고른 칸의 무기를 손에 든다(2026-11-28 "모든 맵에서", 다른 사람은 이동 알림의 arm). null이면 들지 않는다.
   * 겨누지 않을 때는 내려 든 자세로 그린다. 바뀐 때만 그림을 바꾼다(매 프레임 불러도 된다).
   */
  hold(id: WeaponId | null, level = 0) {
    const tier = id ? tierOf(id, level) : 0;
    if (id === this.carryKind && tier === this.carryTier) return;
    this.carryKind = id;
    this.carryTier = tier;
    if (id) this.showWeapon(id, tier);
  }

  /** +30 총을 쏠 때 총구 금빛 터짐(weapon-glow.md 13-2). 그 밖의 무기와 화면 밖에서는 아무것도 하지 않는다. */
  muzzleFlash() {
    if (this.tier !== 2 || WEAPONS[this.weapon!].melee) return;
    this.muzzleAt = this.scene.time.now;
    this.muzzleFrame = -2;
  }

  /** 이 사람이 쏘는 총알 그림: +30이면 금빛 총알과 그 깊이(밤에는 덮개 위), 아니면 null(지금 총알) */
  get bulletLook(): BulletLook | null {
    if (this.tier !== 2) return null;
    return { texture: ensureGold(this.scene, 'bullet'), depth: this.goldNight.fxDepth };
  }

  /** 칼을 화면 각도 angle 쪽으로 휘두르고 칼자국을 남긴다. +30이면 금빛 칼자국이다. */
  swing(angle: number, holdMs?: number) {
    this.aim(angle, holdMs);
    this.swingT = 0;

    const { x, y, depth } = this.image;
    const center = Math.atan2(Math.sin(angle) / SLASH_FLATTEN, Math.cos(angle));
    if (this.tier === 2) {
      this.goldSwing(x, y - HAND_HEIGHT, center, depth + 1);
      return;
    }
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

  /**
   * +30 금빛 칼자국(gold-slash.png 4장 × 50ms): 흰 호와 같은 자리·납작함·각도. 사람마다 하나를 만들어 다시 쓴다.
   * 밤 덮개가 있는 밤에는 덮개 위에 둔다. 화면 밖이면 그리지 않는다.
   */
  private goldSwing(x: number, y: number, center: number, depth: number) {
    if (!this.onScreen(x, y)) return;
    let slash = this.goldSlash;
    if (!slash) {
      const image = this.scene.add.image(0, 0, ensureGold(this.scene, 'slash'), 0);
      const box = this.scene.add.container(0, 0, [image]).setScale(1, SLASH_FLATTEN);
      slash = this.goldSlash = { box, image };
    }
    slash.box.setPosition(x, y).setDepth(this.goldNight.fxDepth ?? depth).setVisible(true);
    slash.image.setRotation(center).setFrame(0);
    this.slashAt = this.scene.time.now;
    this.slashFrame = 0;
    Avatar.goldFrameSets++;
  }

  /** 금빛 칼자국 칸을 넘기고, 다 보였으면 숨긴다. */
  private stepGoldSlash() {
    const slash = this.goldSlash!;
    const k = Math.floor((this.scene.time.now - this.slashAt) / GOLD_SLASH.ms);
    if (k >= GOLD_SLASH.frames) {
      slash.box.setVisible(false);
      this.slashFrame = -1;
    } else if (k !== this.slashFrame) {
      this.slashFrame = k;
      slash.image.setFrame(k);
      Avatar.goldFrameSets++;
    }
  }

  /** 카메라 화면(여백 GOLD_VIEW_MARGIN) 안의 자리인지 */
  private onScreen(x: number, y: number) {
    const view = this.scene.cameras.main.worldView;
    return x > view.x - GOLD_VIEW_MARGIN && x < view.right + GOLD_VIEW_MARGIN && y > view.y - GOLD_VIEW_MARGIN && y < view.bottom + GOLD_VIEW_MARGIN;
  }

  /** 밤 빛 그림과 총구 터짐을 숨긴다(무기를 숨기거나 금빛이 아니게 될 때). */
  private hideGoldLights() {
    if (this.glow?.visible) this.glow.setVisible(false);
    if (this.muzzleFrame !== -1) {
      this.muzzle?.setVisible(false);
      this.muzzleFrame = -1;
    }
  }

  /** 총을 화면 각도 angle로 겨눈다. holdMs를 주면 그 시간이 지나 내린다. */
  aim(angle: number, holdMs?: number) {
    this.aimAngle = angle;
    this.lowerGunAt = holdMs === undefined ? Infinity : this.scene.time.now + holdMs;
  }

  lowerGun() {
    this.aimAngle = null;
    this.lowerGunAt = Infinity;
    // 다른 사람이 공격할 때 바꿔 든 무기(shot)가 고른 무기와 다르면 고른 무기로 돌아간다.
    if (this.carryKind) this.showWeapon(this.carryKind, this.carryTier);
  }

  setHp(hp: number) {
    if (hp < this.hp) this.flash();
    this.hp = hp;
    this.image.setAlpha(this.isDown ? DOWN_ALPHA : 1);
  }

  private flash() {
    this.image.setTint(0xff6b5e);
    this.scene.time.delayedCall(HIT_FLASH_MS, () => {
      if (this.image.active) this.image.setTint(this.night);
    });
  }

  /** 늘 밤인 맵(캠프파이어 맵, 2026-11-28)에서 사람과 손에 든 것에 곱하는 색. 흰색이면 그대로다. */
  private night = 0xffffff;

  setNight(tint: number | null) {
    const next = tint ?? 0xffffff;
    if (next === this.night) return;
    this.night = next;
    this.image.setTint(next);
    this.gun.setTint(next);
    this.pet?.setTint(tint);
  }

  update(delta: number) {
    if (this.t < 1) this.t = Math.min(1, this.t + delta / this.ms);
    if (this.t >= 1 && this.airborne) {
      this.airborne = false;
      this.sounds?.('land');
    }
    if (this.knockT < 1) this.knockT = Math.min(1, this.knockT + delta / KNOCK_MS);
    if (this.swingT < 1) this.swingT = Math.min(1, this.swingT + delta / SWING_MS);
    if (this.scene.time.now >= this.lowerGunAt) this.lowerGun();
    if (this.slashFrame >= 0) this.stepGoldSlash();
    this.sync();
    this.pet?.update(delta);
  }

  /** 빠르게 밀려났다가 천천히 돌아오는 정도 (0~1) */
  private get knockAmount() {
    const t = this.knockT;
    return t < KNOCK_OUT ? t / KNOCK_OUT : ((1 - t) / (1 - KNOCK_OUT)) ** 2;
  }

  private sync() {
    // 앉았거나 누웠으면 자세 그림 한 장을 그 자리에 둔다(걷기·점프·무기 그림 없음).
    if (this.posture) {
      const p = this.posture;
      const at = gridToWorld(this.tile.x + 0.5, this.tile.y + 0.5);
      this.anchor.x = at.x;
      this.anchor.y = at.y;
      this.image.setTexture('poses', p.frame).setFlipX(p.flip).setOrigin(p.originX, p.originY).setRotation(0).setPosition(p.x, p.y);
      keepDepth(this.image, p.depth);
      this.gun.setVisible(false);
      this.hideGoldLights();
      this.torch?.setVisible(false);
      return;
    }
    const { x, y } = this.position();
    const pos = gridToWorld(x + 0.5, y + 0.5);
    this.anchor.x = pos.x;
    this.anchor.y = pos.y;

    const walking = this.t < 1 && !this.airborne;
    const hop = walking ? STEP_HOP * Math.sin(Math.PI * this.t) : 0;
    const lift = this.airborne ? JUMP_HEIGHT * 4 * this.t * (1 - this.t) : hop;
    const knock = this.knockAmount;
    // 단·계단 위에서는 그 높이만큼 올려 그린다(걷는 동안은 두 칸 높이 사이를 잇는다). 앉거나 누우면 앉는 면 높이다.
    let ground = 0;
    if (this.floorLift) {
      const to = this.floorLift(this.tile.x, this.tile.y);
      ground = this.t < 1 ? to + (this.floorLift(Math.round(this.from.x), Math.round(this.from.y)) - to) * (1 - this.t) : to;
    }
    const drawX = pos.x + this.knockX * KNOCK_DISTANCE * knock + this.poseX;
    const drawY = pos.y + this.knockY * KNOCK_DISTANCE * 0.6 * knock - lift + this.poseY - ground;
    const idleFrame = Math.floor(this.scene.time.now / IDLE_FRAME_MS) % TEAM_FRAMES;
    const frame = this.firstFrame + (walking ? this.stepFrame : idleFrame);
    // 공중에서는 넘어가는 벽보다 앞에 그려져야 벽에 가리지 않는다.
    const depth = this.airborne
      ? depthOf(Math.max(this.from.x, this.tile.x), Math.max(this.from.y, this.tile.y)) + 1
      : depthOf(x, y) + 1;
    this.image
      .setPosition(drawX, drawY)
      .setTexture(this.back ? 'team-back' : 'team', frame)
      .setFlipX(this.flip)
      .setRotation(this.knockX * KNOCK_LEAN * knock + this.poseLean);
    keepDepth(this.image, depth);
    keepDepth(this.shadow.setPosition(pos.x, pos.y - ground), depthOf(x, y));

    if (this.torch) {
      const lit = this.torchLit;
      this.torch.setVisible(lit);
      if (lit) {
        // 손잡이 점을 손 자리에. 쉬는 그림 둘째 장은 손이 1px 내려간다(torch.md 2절). 걸을 때 뛰는 높이와 점프는 drawY에 들어 있다.
        const hand = this.flip ? TORCH_HAND.right : TORCH_HAND.left;
        const bob = !walking && idleFrame === 1 ? 1 : 0;
        const tx = drawX + hand.dx;
        const ty = drawY + hand.dy + bob;
        const name = `torch-${this.flip ? 'r' : 'l'}${TORCH_ORDER[Math.floor(this.scene.time.now / TORCH_FRAME_MS) % TORCH_ORDER.length]}`;
        if (this.torch.frame.name !== name) this.torch.setFrame(name);
        if (this.torch.x !== tx || this.torch.y !== ty) this.torch.setPosition(tx, ty);
        keepDepth(this.torch, depth + 0.5);
        this.flame.x = tx - TORCH_GRIP.x + TORCH_FLAME.x;
        this.flame.y = ty - TORCH_GRIP.y + TORCH_FLAME.y;
      }
    }

    // 겨누는 중이면 겨눈 쪽, 아니면 고른 무기를 내려 든 자세(모든 맵, 2026-11-28 weapon-glow.md 14-1). 쓰러지면 숨긴다.
    const aiming = this.aimAngle !== null;
    const armed = (aiming || this.carryKind !== null) && !this.isDown && !this.hidden;
    this.gun.setVisible(armed);
    if (armed) {
      let angle: number;
      let bob = 0;
      if (aiming) angle = this.aimAngle! + (this.swingT < 1 ? (this.swingT - 0.5) * SWING_ARC : 0);
      else {
        angle = this.back ? (this.flip ? -REST_ANGLE : REST_ANGLE - Math.PI) : this.flip ? REST_ANGLE : Math.PI - REST_ANGLE;
        // 쉬는 그림 둘째 장은 손이 1px 내려간다(횃불과 같음).
        if (!walking && idleFrame === 1) bob = 1;
      }
      const flipY = Math.abs(angle) > Math.PI / 2;
      const gx = drawX + Math.cos(angle) * HAND_REACH;
      const gy = drawY - HAND_HEIGHT + bob + Math.sin(angle) * HAND_REACH * 0.5;
      this.gun.setPosition(gx, gy).setRotation(angle).setFlipY(flipY);
      keepDepth(this.gun, Math.sin(angle) < 0 ? depth - 0.5 : depth + 0.5);
      if (this.tier) this.syncGold(gx, gy, angle, flipY, depth);
    } else this.hideGoldLights();
  }

  /**
   * 금빛 무기(weapon-glow.md 5·13절): 지금 칸을 골라 바뀔 때만 setFrame, 밤이면 같은 칸의 빛 그림을 무기에 겹치고,
   * +30 총이면 쏜 뒤 0.12초 총구 터짐을 총구에 둔다. 화면 밖이면 칸을 고르지 않고 빛·효과를 숨긴다.
   */
  private syncGold(x: number, y: number, angle: number, flipY: boolean, depth: number) {
    if (!this.onScreen(x, y)) {
      this.hideGoldLights();
      return;
    }
    const now = this.scene.time.now;
    const bright = this.tier === 2;
    const order = bright ? GOLD_BRIGHT_ORDER : GOLD_SOFT_ORDER;
    const frame = this.goldRow + order[Math.floor((now + this.goldPhase) / (bright ? GOLD_BRIGHT_MS : GOLD_SOFT_MS)) % order.length];
    if (frame !== this.goldFrame) {
      this.goldFrame = frame;
      this.gun.setFrame(frame, false, false);
      Avatar.goldFrameSets++;
    }

    // 밤 빛 그림: 몸 앞에 든 무기만. 몸 뒤로 든 무기(뒷모습, 위로 겨눔)는 빛을 덮개 위에 두면 몸 위로 무기 빛이 비치고,
    // 몸 아래에 두면 사람 사이에 가산 그림이 끼어 그리기 묶음이 끊겨(120명 밤 그리기 약 0.57 → 0.85ms) 빛을 끈다(제가 정한 것).
    const night = this.goldNight;
    if (night.strength > 0 && Math.sin(angle) >= 0) {
      let glow = this.glow;
      if (!glow) glow = this.glow = this.scene.add.image(0, 0, ensureGold(this.scene, 'light'), frame).setBlendMode(Phaser.BlendModes.ADD);
      if (frame !== this.glowFrame) {
        this.glowFrame = frame;
        glow.setFrame(frame, false, false);
        Avatar.goldFrameSets++;
      }
      if (glow.originX !== this.gun.originX || glow.originY !== this.gun.originY) glow.setOrigin(this.gun.originX, this.gun.originY);
      if (glow.alpha !== night.strength) glow.setAlpha(night.strength);
      keepDepth(glow.setPosition(x, y).setRotation(angle).setFlipY(flipY).setVisible(true), night.lightDepth);
    } else if (this.glow?.visible) this.glow.setVisible(false);

    if (this.muzzleFrame === -1) return;
    const k = Math.floor((now - this.muzzleAt) / GOLD_MUZZLE.ms);
    if (k >= GOLD_MUZZLE.frames || !bright) {
      this.muzzle?.setVisible(false);
      this.muzzleFrame = -1;
      return;
    }
    const muzzle = (this.muzzle ??= this.scene.add.image(0, 0, ensureGold(this.scene, 'muzzle'), 0));
    if (k !== this.muzzleFrame) {
      this.muzzleFrame = k;
      muzzle.setFrame(k);
      Avatar.goldFrameSets++;
    }
    // 총구 자리: 손잡이에서 총구까지(그림 안)를 무기와 같이 뒤집고 돌린다.
    const art = GOLD_HELD[this.weapon as GoldWeapon];
    const tx = art.tipX - art.x;
    const ty = (flipY ? -1 : 1) * (art.tipY - art.y);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    muzzle.setPosition(x + cos * tx - sin * ty, y + sin * tx + cos * ty).setRotation(angle).setFlipY(flipY).setVisible(true);
    keepDepth(muzzle, night.fxDepth ?? depth + 1);
  }

  destroy() {
    this.pet?.destroy();
    this.pet = null;
    this.image.destroy();
    this.torch?.destroy();
    this.gun.destroy();
    this.glow?.destroy();
    this.goldSlash?.box.destroy();
    this.muzzle?.destroy();
    this.shadow.destroy();
  }
}
