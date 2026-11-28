import Phaser from 'phaser';
import { spriteUrl, type SpriteName } from '../art/sprites';
import { gridToWorld } from '../iso';
import type { GlowLook } from '../art/glow';
import type { Building } from './map';
import type { Tile } from './world';

/**
 * 캠프파이어(2026-11-28, 사용자 결정 "캠프파이어존은 중앙에 자그만하게"(2×2칸 안), 캠프파이어 맵 "산속 캠핑에서 모닥불과 함께
 * 빛나는 하늘의 별을 바라보는" 컨셉, 들어가는 길 "광장 옆 산길 입구 (추천)"). 값은 모두 디자인 세션 14의
 * art-source/campfire/final/campfire.json(chosen, campfireSmall.b)과 camp-map.json 그대로다. 장작 규칙은 기획 4 life-1127.md 4-1.
 */

// ───────── 시작마을 2×2칸 캠프파이어 ─────────

/** 화덕·통나무 넷·장작더미·산길 아치. 건물처럼 바닥 아래 꼭짓점에 맞춰 놓고 칸을 막는다. */
export const VILLAGE_CAMP_PROPS: Building[] = [
  { sprite: 'campfire/pit2', x: 23, y: 23, w: 2, d: 2 },
  { sprite: 'campfire/log-x2', x: 23, y: 22, w: 2, d: 1 },
  { sprite: 'campfire/log-y2', x: 22, y: 23, w: 1, d: 2 },
  { sprite: 'campfire/log-y2', x: 25, y: 23, w: 1, d: 2 },
  { sprite: 'campfire/log-x2', x: 23, y: 25, w: 2, d: 1 },
  { sprite: 'campfire/woodpile', x: 26, y: 22, w: 1, d: 1 },
  { sprite: 'camp/arch-y', x: 17, y: 20, w: 1, d: 2 },
];

/** 광장 돌바닥 그림: 그림 왼쪽 위 = (gridToWorld(21, 21).x − 96, gridToWorld(21, 21).y − 1). 마을 바닥 그림에 함께 칠한다. */
export const VILLAGE_PLAZA = { sprite: 'campfire/plaza2' as const, gx: 21, gy: 21, dx: -96, dy: -1 };

/** 산길 흙 오솔길: 이 네모 안 칸에 tiles.png 흙 타일 넷 가운데 (x × 3 + y × 5) % 4번째를 깐다. */
export const TRAIL_AREA = [16, 20, 21, 21] as const;
export const TRAIL_TILES = [14, 16, 11, 15];

/** 캠프파이어로 이어지는 돌길 넷(1칸 폭, 링 도로에 이어짐) */
export const CAMP_ROADS: [number, number, number, number][] = [
  [27, 23, 31, 23],
  [23, 27, 23, 31],
  [23, 16, 23, 20],
  [16, 23, 20, 23],
];

/**
 * 블록 못 놓는 칸(사용자 "캠프파이어 광장 원 안에는 블록을 못 놓게"): 광장 원 32칸(가운데 (24, 24), 반지름 3.3)과 일어나는 칸 (30, 23).
 * 서버 SQL plains_reserved와 같아야 한다.
 */
export const CAMP_RESERVED: Tile[] = (() => {
  const rows: [number, number, number][] = [
    [21, 22, 25],
    [22, 21, 26],
    [23, 21, 26],
    [24, 21, 26],
    [25, 21, 26],
    [26, 22, 25],
  ];
  const out: Tile[] = [];
  for (const [y, x0, x1] of rows) for (let x = x0; x <= x1; x++) out.push({ x, y });
  out.push({ x: 30, y: 23 });
  return out;
})();

/** 노란 이름표: '캠프파이어'는 화덕 가운데 땅 점에서 74px 위, '산길 ↖'은 아치 앞에서 62px 위 */
export const VILLAGE_CAMP_SIGNS = [
  { text: '캠프파이어', gx: 24, gy: 24, lift: 74 },
  { text: '산길 ↖', gx: 17.5, gy: 21, lift: 62 },
];

// ───────── 불꽃 ─────────

/** 불꽃 그림 한 벌: 프레임 크기, 기준점(그림 안 px), 프레임 수. 120ms마다 다음 장이다. */
export interface FlameArt {
  sprite: SpriteName;
  w: number;
  h: number;
  ax: number;
  ay: number;
  frames: number;
}

export const FLAME_MS = 120;
export const FLAME2: FlameArt = { sprite: 'campfire/flame2', w: 32, h: 42, ax: 16, ay: 40, frames: 4 };
export const FLAME_BIG: FlameArt = { sprite: 'campfire/flame', w: 40, h: 54, ax: 20, ay: 51, frames: 4 };
export const FLAME_FLARE: FlameArt = { sprite: 'campfire/flare', w: 56, h: 76, ax: 28, ay: 72, frames: 4 };
export const SPARKS: FlameArt = { sprite: 'camp/sparks', w: 80, h: 80, ax: 40, ay: 70, frames: 6 };

/** 불이 서는 땅 점(칸 좌표)과 그 점에서 그림 기준점까지 올림(px) */
export const VILLAGE_FIRE = { gx: 24, gy: 24, lift: 3, art: FLAME2 };
export const CAMP_FIRE = { gx: 23.5, gy: 23.5, lift: 3, art: FLAME_BIG };

// ───────── 소품 자리에 앉기(통나무·캠핑 의자) ─────────

/** 블록이 아닌 맵 소품의 앉는 자리 하나. dx·dy는 그 소품 바닥 가운데에서 화면 px, z는 앉는 면 높이(USE_SEATS와 같은 꼴) */
export interface PropSeat {
  x: number;
  y: number;
  /** 소품 바닥 가운데 칸 좌표 */
  cx: number;
  cy: number;
  dx: number;
  dy: number;
  z: number;
  face: 'SE' | 'SW' | 'NW' | 'NE';
}

/** 소품 하나의 자리들(소품 왼쪽 위 칸 x·y, 넓이 w·d, 자리마다 그 소품 안 칸 [i, j]) */
function seatsOf(x: number, y: number, w: number, d: number, list: [number, number, number, number, number, PropSeat['face']][]): PropSeat[] {
  return list.map(([i, j, dx, dy, z, face]) => ({ x: x + i, y: y + j, cx: x + w / 2, cy: y + d / 2, dx, dy, z, face }));
}

/** 맵마다 소품 앉는 자리: 시작마을 통나무 8자리(앉는 높이 8.2), 캠프파이어 맵 통나무 12자리(8.7)와 캠핑 의자 2자리(10) */
export const PROP_SEATS: Partial<Record<string, PropSeat[]>> = {
  plains: [
    ...seatsOf(23, 22, 2, 1, [
      [0, 0, -8, -4, 8.2, 'SW'],
      [1, 0, 8, 4, 8.2, 'SW'],
    ]),
    ...seatsOf(22, 23, 1, 2, [
      [0, 0, 8, -4, 8.2, 'SE'],
      [0, 1, -8, 4, 8.2, 'SE'],
    ]),
    ...seatsOf(25, 23, 1, 2, [
      [0, 0, 8, -4, 8.2, 'NW'],
      [0, 1, -8, 4, 8.2, 'NW'],
    ]),
    ...seatsOf(23, 25, 2, 1, [
      [0, 0, -8, -4, 8.2, 'NE'],
      [1, 0, 8, 4, 8.2, 'NE'],
    ]),
  ],
  campfire: [
    ...seatsOf(22, 20, 3, 1, [
      [0, 0, -16, -8, 8.7, 'SW'],
      [1, 0, 0, 0, 8.7, 'SW'],
      [2, 0, 16, 8, 8.7, 'SW'],
    ]),
    ...seatsOf(20, 22, 1, 3, [
      [0, 0, 16, -8, 8.7, 'SE'],
      [0, 1, 0, 0, 8.7, 'SE'],
      [0, 2, -16, 8, 8.7, 'SE'],
    ]),
    ...seatsOf(26, 22, 1, 3, [
      [0, 0, 16, -8, 8.7, 'NW'],
      [0, 1, 0, 0, 8.7, 'NW'],
      [0, 2, -16, 8, 8.7, 'NW'],
    ]),
    ...seatsOf(22, 26, 3, 1, [
      [0, 0, -16, -8, 8.7, 'NE'],
      [1, 0, 0, 0, 8.7, 'NE'],
      [2, 0, 16, 8, 8.7, 'NE'],
    ]),
    ...seatsOf(26, 20, 1, 1, [[0, 0, 0, 0, 10, 'SW']]),
    ...seatsOf(20, 26, 1, 1, [[0, 0, 0, 0, 10, 'SE']]),
  ],
};

/** 그 맵 그 칸의 소품 앉는 자리 */
export function propSeatAt(map: string, x: number, y: number) {
  return PROP_SEATS[map]?.find((seat) => seat.x === x && seat.y === y);
}

// ───────── 캠프파이어 맵 ─────────

/** 바닥 17×17칸. 바닥 그림 왼쪽 위 = (gridToWorld(15, 32).x, gridToWorld(15, 15).y) */
export const CAMP_AREA = [15, 15, 31, 31] as const;
export const CAMP_FLOOR = 'camp/floor' as const;
/** 들어오면 서는 칸이자 일어나는 칸 */
export const CAMP_ARRIVE = { x: 23, y: 28 };
/** 산길 아치 앞 두 칸(숨은 포탈) → 마을 */
export const CAMP_EXIT = [
  { x: 22, y: 30 },
  { x: 23, y: 30 },
];
/** 늘 밤: 바닥·소품·나무·사람에 곱하는 색(옥상 floorTint와 같은 길). 불꽃·빛·하늘 층은 곱하지 않는다. */
export const CAMP_NIGHT_TINT = 0x8a92b4;
/** 카메라가 캐릭터보다 이만큼 위를 본다(하늘을 넓게). 폭 620px 이하는 휴대폰 값 */
export const CAMP_CAMERA_LIFT = { desktop: 70, mobile: 100 };

type Prop = Building;
const prop = (sprite: SpriteName, x: number, y: number, w = 1, d = 1): Prop => ({ sprite, x, y, w, d });

/** 맵 소품(건물처럼 놓고 칸을 막음). 석쇠는 굽기(요리 묶음)가 들어오기 전까지 꾸밈이다. */
export const CAMP_PROPS: Prop[] = [
  prop('campfire/pit', 22, 22, 3, 3),
  prop('campfire/log-x', 22, 20, 3, 1),
  prop('campfire/log-y', 20, 22, 1, 3),
  prop('campfire/log-y', 26, 22, 1, 3),
  prop('campfire/log-x', 22, 26, 3, 1),
  prop('camp/chair', 26, 20),
  prop('camp/chair-x', 20, 26),
  prop('camp/tent-a', 16, 19, 3, 3),
  prop('camp/tent-b', 19, 16, 3, 3),
  prop('camp/lantern', 19, 19),
  prop('camp/lantern', 25, 30),
  prop('campfire/woodpile', 28, 20),
  prop('campfire/woodpile', 28, 21),
  prop('camp/grill', 28, 23, 2, 1),
  prop('camp/arch-x', 22, 31, 2, 1),
];

/** 뒤쪽 두 변을 따라 선 나무(앞쪽에는 두지 않아 불과 사람을 가리지 않음). 마을 나무처럼 발끝이 칸 가운데다. */
export const CAMP_TREES: { sprite: SpriteName; x: number; y: number }[] = [
  { sprite: 'pinetree', x: 16, y: 15 },
  { sprite: 'firtree', x: 23, y: 15 },
  { sprite: 'pinetree', x: 27, y: 15 },
  { sprite: 'pinetree', x: 30, y: 16 },
  { sprite: 'firtree', x: 15, y: 17 },
  { sprite: 'pinetree', x: 15, y: 23 },
  { sprite: 'firtree', x: 15, y: 27 },
  { sprite: 'pinetree', x: 16, y: 30 },
];

const BONFIRE: GlowLook = { color: 0xff8a3a, pool: 124, halo: 40, head: 22, flicker: 0.18, fire: true };
const CAMP_LANTERN: GlowLook = { color: 0xffd890, pool: 46, halo: 16, head: 10, flicker: 0.05, fire: false };
const ARCH_LANTERN: GlowLook = { color: 0xffd890, pool: 40, halo: 14, head: 35, flicker: 0.08, fire: false };

/** 늘 켠 빛: 큰 불(화덕 가운데), 랜턴 둘, 나가는 아치 랜턴. 자리는 칸 좌표(땅 점). key는 빛 그림 이름(이 맵에서만 만들고 나가면 지움) */
export const CAMP_LIGHTS: { key: string; look: GlowLook; gx: number; gy: number; fire?: boolean }[] = [
  { key: 'glow-camp-bonfire', look: BONFIRE, gx: 23.5, gy: 23.5, fire: true },
  { key: 'glow-camp-lantern', look: CAMP_LANTERN, gx: 19.5, gy: 19.5 },
  { key: 'glow-camp-lantern', look: CAMP_LANTERN, gx: 25.5, gy: 30.5 },
  { key: 'glow-camp-arch', look: ARCH_LANTERN, gx: 23.68, gy: 31.5 },
];

/** 이름표 '마을 가는 길 ↙': gridToWorld(23, 31.5)에서 62px 위 */
export const CAMP_SIGN = { text: '마을 가는 길 ↙', gx: 23, gy: 31.5, lift: 62 };

/** 장작 넣는 칸: 화덕에 맞닿은 고리 16칸(x 21·25의 y 21~25, y 21·25의 x 21~25) */
export function isFuelTile(x: number, y: number) {
  const inRing = x >= 21 && x <= 25 && y >= 21 && y <= 25;
  return inRing && (x === 21 || x === 25 || y === 21 || y === 25);
}

/** 장작 넣기 간격(서버 campfire_tuning gap_seconds의 처음 값). 화면은 이 안에 다시 누르면 아무것도 하지 않는다. */
export const FUEL_GAP_MS = 60_000;
/** 장작 던지기 0.4초(가운데 26px 솟음), 큰 불꽃 1.6초, 불티 프레임 80ms, 불빛 1.35배에서 천천히 1로 */
export const FUEL = { throwMs: 400, arc: 26, flareMs: 1600, sparkMs: 80, boost: 1.35, hand: 20, target: 10 };

// ───────── 맵 밖 하늘(화면에 붙은 층) ─────────

interface CampLayer {
  key: string;
  file: string;
  /** 그림 높이(아트 px) */
  h: number;
  /** 층 위 끝 = 화면높이/2 + (바닥 뒤 꼭짓점 월드 y + A − 카메라 가운데 y) × fy */
  A: number;
  fy: number;
  /** 가로 밀림 배율 */
  fx: number;
  /** 프레임이 있으면 [한 장 너비, 높이, 장 수]와 바꾸는 간격 */
  frames?: [number, number, number];
  frameMs?: number;
  /** 이 층 아래 끝부터 화면 아래 끝까지 채우는 색 */
  fillBelow?: number;
}

/** 뒤 → 앞. 값은 camp-map.json backdrop 그대로다. */
const CAMP_LAYERS: CampLayer[] = [
  { key: 'camp-bg-sky', file: 'camp/sky', h: 300, A: -164, fy: 0.05, fx: 0.03 },
  { key: 'camp-bg-stars', file: 'camp/stars', h: 200, A: -164, fy: 0.05, fx: 0.03, frames: [256, 200, 3], frameMs: 500 },
  { key: 'camp-bg-ridge-far', file: 'camp/ridge-far', h: 90, A: -39, fy: 0.12, fx: 0.08 },
  { key: 'camp-bg-ridge-near', file: 'camp/ridge-near', h: 100, A: -24, fy: 0.2, fx: 0.15 },
  { key: 'camp-bg-trees', file: 'camp/trees', h: 130, A: -9, fy: 0.35, fx: 0.3, fillBelow: 0x0a0e1f },
];
/** 하늘 맨 위 색(카메라 배경) */
export const CAMP_SKY_TOP = 0x050817;
const SHOOT = { key: 'camp-bg-shoot', file: 'camp/shoot', w: 72, h: 40, frames: 8, frameMs: 60, minMs: 20_000, maxMs: 40_000, top: 0.35 };

interface Strip {
  layer: CampLayer;
  obj: Phaser.GameObjects.TileSprite;
  fill: Phaser.GameObjects.Rectangle | null;
}

/**
 * 캠프파이어 맵 밖의 하늘·별·먼 산·가까운 산·숲(화면에 붙은 층, cityViews.ts Skyline과 같은 셈)과 별똥별.
 * 그림은 이 맵에 들어올 때 읽고 나가면 GPU에서 지운다. 층 자리는 카메라가 1px 이상 움직였거나 화면 크기가 바뀐 때만 다시 맞춘다.
 * 큰 별은 세 장을 0.5초마다 돌리고(프레임이 바뀔 때만), 별똥별은 20~40초에 한 번 화면 위쪽 35% 안 무작위 자리를 내 화면에서만 지나간다.
 */
export class CampSky {
  private strips: Strip[] = [];
  private shoot: Phaser.GameObjects.Image | null = null;
  private starTimer: Phaser.Time.TimerEvent | null = null;
  private shootTimer: Phaser.Time.TimerEvent | null = null;
  private shootFrame: Phaser.Time.TimerEvent | null = null;
  private cornerY = 0;
  private laidOut = '';
  private epoch = 0;
  private shown = false;
  /** 성능 확인용: 층 자리를 다시 맞춘 횟수, 별 프레임을 바꾼 횟수, 별똥별 수 */
  moves = 0;
  starFlips = 0;
  shots = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth: number,
  ) {}

  get active() {
    return this.shown;
  }

  /** 맵에 들어올 때. cornerY는 바닥 뒤 꼭짓점 월드 y다. 그림을 다 읽은 뒤 층을 만든다. */
  show(cornerY: number) {
    this.hide();
    this.shown = true;
    this.cornerY = cornerY;
    const epoch = ++this.epoch;
    const load = this.scene.load;
    let waiting = 0;
    for (const { key, file } of [...CAMP_LAYERS, SHOOT]) {
      if (this.scene.textures.exists(key)) continue;
      load.image(key, spriteUrl(file));
      waiting++;
    }
    const build = () => {
      // 읽는 동안 맵을 떠났으면 읽힌 그림을 바로 지운다(다시 들어오면 새로 읽음).
      if (epoch !== this.epoch || !this.shown) {
        if (!this.shown) for (const { key } of [...CAMP_LAYERS, SHOOT]) if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
        return;
      }
      this.build();
    };
    if (!waiting) {
      build();
      return;
    }
    load.once(Phaser.Loader.Events.COMPLETE, build);
    load.start();
  }

  private build() {
    const add = this.scene.add;
    this.scene.cameras.main.setBackgroundColor(CAMP_SKY_TOP);
    CAMP_LAYERS.forEach((layer, i) => {
      if (!this.scene.textures.exists(layer.key)) return;
      const depth = this.depth + 0.01 * (i + 1);
      const texture = this.scene.textures.get(layer.key);
      if (layer.frames) {
        const [w, h, n] = layer.frames;
        for (let f = 0; f < n; f++) if (!texture.has(String(f))) texture.add(String(f), 0, f * w, 0, w, h);
      }
      const obj = add.tileSprite(0, 0, 16, layer.h, layer.key, layer.frames ? '0' : undefined).setOrigin(0, 0).setScrollFactor(0).setDepth(depth);
      const fill = layer.fillBelow !== undefined ? add.rectangle(0, 0, 16, 16, layer.fillBelow).setOrigin(0, 0).setScrollFactor(0).setDepth(depth + 0.001) : null;
      this.strips.push({ layer, obj, fill });
      if (layer.frames && layer.frameMs) {
        let frame = 0;
        const count = layer.frames[2];
        this.starTimer = this.scene.time.addEvent({
          delay: layer.frameMs,
          loop: true,
          callback: () => {
            frame = (frame + 1) % count;
            obj.setFrame(String(frame));
            this.starFlips++;
          },
        });
      }
    });
    if (this.scene.textures.exists(SHOOT.key)) {
      const texture = this.scene.textures.get(SHOOT.key);
      for (let f = 0; f < SHOOT.frames; f++) if (!texture.has(String(f))) texture.add(String(f), 0, f * SHOOT.w, 0, SHOOT.w, SHOOT.h);
      // 하늘 층(맨 뒤) 바로 위
      this.shoot = add.image(0, 0, SHOOT.key, '0').setOrigin(0, 0).setScrollFactor(0).setDepth(this.depth + 0.015).setVisible(false);
      this.queueShoot();
    }
    this.laidOut = '';
    this.update(this.scene.cameras.main);
  }

  private queueShoot() {
    const wait = Phaser.Math.Between(SHOOT.minMs, SHOOT.maxMs);
    this.shootTimer = this.scene.time.delayedCall(wait, () => this.shootStar());
  }

  /** 별똥별 하나: 화면 위쪽 35% 안 무작위 자리에서 8장을 60ms마다 넘기고 숨긴다. */
  private shootStar() {
    const shoot = this.shoot;
    if (!shoot || !this.shown) return;
    const cam = this.scene.cameras.main;
    const viewW = Math.ceil(cam.width / cam.zoom);
    const viewH = Math.ceil(cam.height / cam.zoom);
    const ox = Math.floor(cam.width / 2 - cam.width / (2 * cam.zoom));
    const oy = Math.floor(cam.height / 2 - cam.height / (2 * cam.zoom));
    const x = ox + Phaser.Math.Between(0, Math.max(0, viewW - SHOOT.w));
    const y = oy + Phaser.Math.Between(0, Math.max(0, Math.round(viewH * SHOOT.top) - SHOOT.h));
    shoot.setPosition(x, y).setFrame('0').setVisible(true);
    this.shots++;
    let frame = 0;
    this.shootFrame = this.scene.time.addEvent({
      delay: SHOOT.frameMs,
      repeat: SHOOT.frames - 1,
      callback: () => {
        frame++;
        if (frame >= SHOOT.frames) {
          shoot.setVisible(false);
          return;
        }
        shoot.setFrame(String(frame));
      },
    });
    this.queueShoot();
  }

  /** 맵을 떠날 때: 층을 지우고 그림을 GPU에서 뺀다. */
  hide() {
    this.epoch++;
    for (const { obj, fill } of this.strips) {
      obj.destroy();
      fill?.destroy();
    }
    this.strips = [];
    this.shoot?.destroy();
    this.shoot = null;
    this.starTimer?.remove();
    this.shootTimer?.remove();
    this.shootFrame?.remove();
    this.starTimer = this.shootTimer = this.shootFrame = null;
    if (this.shown) for (const { key } of [...CAMP_LAYERS, SHOOT]) if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    this.shown = false;
  }

  /** 카메라가 이번 프레임 자리를 정한 뒤(FOLLOW_UPDATE) 부른다. */
  update(cam: Phaser.Cameras.Scene2D.Camera) {
    if (!this.strips.length) return;
    const cx = Math.round(cam.midPoint.x);
    const cy = Math.round(cam.midPoint.y);
    const key = `${cam.width},${cam.height},${cam.zoom},${cx},${cy}`;
    if (key === this.laidOut) return;
    this.laidOut = key;
    this.moves++;
    const viewW = Math.ceil(cam.width / cam.zoom);
    const viewH = Math.ceil(cam.height / cam.zoom);
    const ox = Math.floor(cam.width / 2 - cam.width / (2 * cam.zoom));
    const oy = Math.floor(cam.height / 2 - cam.height / (2 * cam.zoom));
    for (const { layer, obj, fill } of this.strips) {
      const top = Math.round(viewH / 2 + (this.cornerY + layer.A - cy) * layer.fy);
      if (obj.width !== viewW + 2) obj.setSize(viewW + 2, layer.h);
      obj.setPosition(ox, oy + top);
      obj.tilePositionX = Math.round(cx * layer.fx);
      if (fill) {
        const y = top + layer.h;
        fill.setVisible(y < viewH).setPosition(ox, oy + y).setSize(viewW + 2, Math.max(1, viewH - y + 2));
      }
    }
  }
}

/** 칸 좌표 땅 점(월드) */
export function groundAt(gx: number, gy: number) {
  return gridToWorld(gx, gy);
}
