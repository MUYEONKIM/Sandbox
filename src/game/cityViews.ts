import Phaser from 'phaser';
import { spriteUrl } from '../art/sprites';
import { gridToWorld } from '../iso';
import type { DayPhase } from './daylight';
import { STAIRS as STAIRS_AREA, UPPER } from './tower';

/**
 * 옥상·바깥 계단·4층 발코니의 도시 풍경(2026-11-27 사용자 "우리 옥상과, 옥상 올라가는 계단, 4층에도 시티뷰를", 4층은 맵 대신 발코니).
 * 그림과 값은 디자인 세션 9(공유 노트 city-views.md 0·0-B절, art-source/city-views/out/final/city-views.json·balcony4.json)다.
 * - 시간대(새벽·낮·노을·밤, daylight.ts DayPhase)마다 따로 그린 네 벌 중 지금 시간대 한 벌만 읽는다. 맵에 들어갈 때 읽고 나갈 때 지운다.
 *   맵 안에서 시간대가 바뀌면(하루 네 번) 새 벌을 다 읽은 뒤 바꿔 끼우고 옛 벌을 지운다. 그래서 GPU에는 늘 한 벌뿐이다(PhaseArt).
 * - 풍경 층은 화면에 고정한 TileSprite이고 카메라가 1px 이상 움직였을 때만 자리 숫자를 바꾼다(Skyline). 다시 칠하는 일은 없다.
 * 7층 발코니 야경(cityView.ts)은 밤 한 벌만이라 그대로 둔다.
 */

const PHASED_ALL: readonly DayPhase[] = ['evening', 'dawn', 'morning', 'sunset'];

/** 그림 이름(public/sprites/city-views/<이름>-<시간대>.png)마다 있는 시간대와 가로로 이은 프레임 [너비, 높이, 장 수] */
const ART = {
  'roof-sky': {},
  'roof-far': {},
  'roof-city': {},
  'roof-moon': { phases: ['evening', 'dawn'] },
  'tower-wall-left': { frames: [64, 136, 3] },
  'tower-wall-right': { frames: [64, 136, 3] },
  'stairs-sky': {},
  'stairs-back': {},
  'stairs-near': {},
  'stairs-under': {},
  'balcony4-base': {},
  'balcony4-city': {},
  'balcony4-door-room': { frames: [30, 65, 4] },
  'balcony4-door-balcony': { frames: [30, 65, 4] },
  'balcony4-rail-x': {},
  'balcony4-rail-y': {},
  'balcony4-rail-corner': {},
} as const satisfies Record<string, { phases?: readonly DayPhase[]; frames?: readonly [number, number, number] }>;

export type CityArt = keyof typeof ART;

const phasesOf = (name: CityArt): readonly DayPhase[] => ('phases' in ART[name] ? (ART[name] as { phases: readonly DayPhase[] }).phases : PHASED_ALL);
const framesOf = (name: CityArt) => ('frames' in ART[name] ? (ART[name] as { frames: readonly [number, number, number] }).frames : null);

/** 아직 읽지 않았거나 이 시간대에 없는 그림(낮의 달) 자리에 쓰는 투명 텍스처. 프레임 '0'~'3'이 있어 문 그림도 그대로 받는다. */
export const CITY_BLANK = 'cv/blank';
const BLANK = CITY_BLANK;

type Bindable = Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite;

interface Bound {
  obj: Bindable;
  name: CityArt;
  /** 그 그림의 프레임(벽 조각)이 정해져 있으면 그 이름. 없으면 지금 보이는 프레임을 그대로 둔다(문 여닫힘). */
  frame?: string;
}

/**
 * 지금 맵이 쓰는 도시 풍경 그림을 지금 시간대 한 벌만 읽어 두고, 그 그림을 쓰는 그림 물체(bind)에 끼운다.
 * 읽는 동안 물체는 투명 텍스처라 보이지 않는다. 시간대가 바뀌면 새 벌을 다 읽은 뒤 한꺼번에 바꿔 끼우고 옛 벌을 지운다.
 */
export class PhaseArt {
  private phase: DayPhase;
  private names = new Set<CityArt>();
  private binds: Bound[] = [];
  /** 이 클래스가 읽기를 맡은 텍스처 키(읽는 중인 것 포함) */
  private readonly owned = new Set<string>();
  /** 읽지 못한 키(파일 없음 등). 다시 기다리지 않는다. */
  private readonly failed = new Set<string>();
  /** 맵이나 시간대가 바뀔 때마다 늘린다. 늦게 끝난 읽기는 지금 것과 다르면 끼우지 않는다. */
  private epoch = 0;
  /** 그림을 다 끼운 뒤 부른다(풍경 층이 텍스처를 바꿔 끼움) */
  private readyHandlers: (() => void)[] = [];
  /** 성능 확인용: 그림 묶음을 읽은 횟수와 지금 GPU에 있는 바이트 */
  loads = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    phase: DayPhase,
  ) {
    this.phase = phase;
    if (!scene.textures.exists(BLANK)) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 2;
      const texture = scene.textures.addCanvas(BLANK, canvas)!;
      for (let i = 0; i < 4; i++) texture.add(String(i), 0, 0, 0, 2, 2);
    }
    scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      if (this.owned.has(file.key)) this.failed.add(file.key);
    });
  }

  /** 이 시간대 그림의 텍스처 키. 이 시간대에 없는 그림이면 null */
  key(name: CityArt, phase = this.phase) {
    return phasesOf(name).includes(phase) ? `cv/${name}-${phase}` : null;
  }

  /** 지금 끼워 둔 그림이 다 읽혔는지 */
  ready(name: CityArt) {
    const key = this.key(name);
    return key !== null && this.scene.textures.exists(key);
  }

  /** 맵에 들어올 때: 이 맵이 쓰는 그림 이름들. 지금 시간대 한 벌을 읽기 시작한다. */
  use(names: readonly CityArt[]) {
    this.names = new Set(names);
    this.binds = [];
    this.readyHandlers = [];
    this.load();
  }

  /** 맵을 나갈 때: 끼운 것을 잊고 읽은 그림을 모두 지운다(그림 물체는 GameScene.clearMap이 먼저 지운다). */
  leave() {
    this.names.clear();
    this.binds = [];
    this.readyHandlers = [];
    this.epoch++;
    this.prune();
  }

  /** 그림 물체에 그림을 끼운다(다 읽혔으면 바로, 아니면 읽은 뒤). frame이 있으면 그 프레임을 쓴다. */
  bind<T extends Bindable>(obj: T, name: CityArt, frame?: string): T {
    const bound = { obj, name, frame };
    this.binds.push(bound);
    this.apply(bound);
    return obj;
  }

  /** 그림이 끼워질 때마다(처음과 시간대가 바뀔 때) 부를 것 */
  onReady(handler: () => void) {
    this.readyHandlers.push(handler);
  }

  /** 시간대가 바뀌었다(하루 네 번). 이 맵에 풍경이 있으면 새 벌을 읽은 뒤 바꿔 끼운다. */
  setPhase(phase: DayPhase) {
    if (phase === this.phase) return;
    this.phase = phase;
    if (this.names.size) this.load();
  }

  get current() {
    return this.phase;
  }

  /** 지금 GPU에 있는 이 클래스의 텍스처 바이트(너비 × 높이 × 4) */
  gpuBytes() {
    let bytes = 0;
    for (const key of this.owned) {
      if (!this.scene.textures.exists(key)) continue;
      const source = this.scene.textures.get(key).source[0];
      bytes += source.width * source.height * 4;
    }
    return bytes;
  }

  private wanted() {
    const keys = new Set<string>();
    for (const name of this.names) {
      const key = this.key(name);
      if (key) keys.add(key);
    }
    return keys;
  }

  private load() {
    const epoch = ++this.epoch;
    const want = this.wanted();
    const missing = [...want].filter((key) => !this.scene.textures.exists(key));
    if (!missing.length) {
      this.settle();
      return;
    }
    this.loads++;
    const loader = this.scene.load;
    for (const key of missing) {
      this.owned.add(key);
      loader.image(key, spriteUrl(`city-views/${key.slice(3)}`));
    }
    const finish = () => {
      // 늦게 끝난 읽기(그사이 맵이나 시간대가 바뀜): 끼우지 않고 필요 없는 것만 지운다.
      if (epoch !== this.epoch) {
        this.prune();
        return;
      }
      if (missing.some((key) => !this.scene.textures.exists(key) && !this.failed.has(key))) {
        loader.once(Phaser.Loader.Events.COMPLETE, finish);
        return;
      }
      this.settle();
    };
    loader.once(Phaser.Loader.Events.COMPLETE, finish);
    loader.start();
  }

  /** 다 읽었다: 프레임을 달고, 끼운 물체를 모두 새 그림으로 바꾸고, 옛 벌을 지운다. */
  private settle() {
    for (const name of this.names) {
      const key = this.key(name);
      const frames = framesOf(name);
      if (!key || !frames || !this.scene.textures.exists(key)) continue;
      const texture = this.scene.textures.get(key);
      if (texture.has(String(frames[2] - 1))) continue;
      for (let i = 0; i < frames[2]; i++) texture.add(String(i), 0, i * frames[0], 0, frames[0], frames[1]);
    }
    for (const bound of this.binds) this.apply(bound);
    for (const handler of this.readyHandlers) handler();
    this.prune();
  }

  /** 그림 하나를 끼운다. 이 시간대 그림을 읽는 중이면 지금 그림(처음이면 투명)을 그대로 두고, 이 시간대에 없는 그림(낮의 달)은 투명으로 바꾼다. */
  private apply({ obj, name, frame }: Bound) {
    if (!obj.scene) return;
    const key = this.key(name);
    if (key !== null && !this.scene.textures.exists(key)) return;
    const keep = frame ?? (framesOf(name) ? obj.frame.name : undefined);
    obj.setTexture(key ?? BLANK, keep);
  }

  /** 지금 시간대·맵에 쓰지 않는 그림을 지운다. 아직 끼워 둔 그림(새 벌을 읽는 중)은 남긴다. */
  private prune() {
    const want = this.wanted();
    const inUse = new Set(this.binds.filter(({ obj }) => obj.scene).map(({ obj }) => obj.texture.key));
    for (const key of this.owned) {
      if (want.has(key) || inUse.has(key)) continue;
      if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
      // 아직 읽는 중이면 키를 남겨 두었다가 다 읽힌 뒤 지운다(늦게 끝난 읽기가 prune을 부름).
      else if (this.scene.load.isLoading() && !this.failed.has(key)) continue;
      this.owned.delete(key);
      this.failed.delete(key);
    }
  }
}

/** 붙박이 그림 한 조각: 그림 왼쪽 위 월드 자리와 프레임 */
export interface PinnedPiece {
  art: CityArt;
  x: number;
  y: number;
  frame?: string;
}

/** 바닥 앞 두께(px): 붙박이 벽은 바닥 그림 앞 모서리에서 이만큼 아래부터 붙는다. */
const FLOOR_EDGE = 6;

/**
 * 붙박이 그림(카메라와 같이 움직임, 풍경보다 앞·바닥 그림보다 뒤): 옥상 바닥 앞 두 변 아래 우리 건물 바깥벽(4칸마다 64 × 136 한 조각, 틀 셋을 돌려 씀),
 * 바깥 계단 앞 변 아래 유리벽(2칸마다 32 × 266). 자리는 디자인 city-views.json maps.*.pinned와 같고, 여기서는 바닥 범위에서 셈한다.
 */
export const CITY_PINNED: Record<'rooftop' | 'stairs', readonly PinnedPiece[]> = {
  rooftop: (() => {
    const [x0, y0, x1, y1] = UPPER;
    const left = gridToWorld(x0, y1 + 1);
    const right = gridToWorld(x1 + 1, y0);
    const count = (x1 - x0 + 1) / 4;
    return Array.from({ length: count }, (_, k) => [
      { art: 'tower-wall-left' as const, x: left.x + 64 * k, y: left.y + FLOOR_EDGE + 32 * k, frame: String(k % 3) },
      { art: 'tower-wall-right' as const, x: right.x - 64 - 64 * k, y: right.y + FLOOR_EDGE + 32 * k, frame: String((k + 1) % 3) },
    ]).flat();
  })(),
  stairs: (() => {
    const [x0, , x1, y1] = STAIRS_AREA;
    const left = gridToWorld(x0, y1 + 1);
    return Array.from({ length: (x1 - x0 + 1) / 2 }, (_, k) => ({ art: 'stairs-under' as const, x: left.x + 32 * k, y: left.y + FLOOR_EDGE + 16 * k }));
  })(),
};

/**
 * 옥상·바깥 계단 바닥 그림(옥상은 소품까지)에 곱하는 시간대 색(디자인 floorTint, 낮은 곱하지 않음). 시간대가 바뀔 때만 setTint한다.
 * 포탈·캐릭터·블록·이름표·풍경·붙박이 벽은 곱하지 않는다.
 */
export const FLOOR_TINT: Readonly<Record<string, Partial<Record<DayPhase, number>>>> = {
  rooftop: { evening: 0x6b75a8, dawn: 0xa8a8cc, sunset: 0xf2c2b3 },
  stairs: { evening: 0x9ea8db, dawn: 0xcccce6, sunset: 0xffdbcc },
};

/** 층 위 끝을 정하는 셈: 월드에 붙임(옥상·계단) 또는 지평선에 붙임(4층 발코니) */
type Anchor = { fy: number; A: number; dy: number } | { horizon: number; dy: number };

interface SkyLayer {
  art: CityArt;
  /** 그림 높이(아트 px) */
  h: number;
  /** 가로 밀림 배율(카메라 가운데 월드 x에 곱함) */
  fx: number;
  top: Anchor;
  /** 하나뿐인 그림(달): 가운데 x = 화면 너비 × 이 값 */
  sprite?: { x: number; w: number };
  /** 화면 아래 끝까지 세로로 감기는 판. 월드에 붙은 층이면 안쪽 무늬를 (카메라 y − 뒤 모서리 y) × (plane − fy)만큼 민다. */
  plane?: number;
  /** 이 층 아래 끝부터 화면 아래 끝까지 채우는 색(층과 같이 움직임) */
  fillBelow?: Record<DayPhase, number>;
}

interface SkyDef {
  /** 카메라 배경색(하늘 맨 위 색) */
  fill: Record<DayPhase, number>;
  /** 이 화면 y 아래는 bottom 색(계단). 위 끝 셈은 층과 같다. */
  split?: { anchor: Anchor; bottom: Record<DayPhase, number> };
  layers: readonly SkyLayer[];
}

const ROOF_FILL: Record<DayPhase, number> = { evening: 0x03061a, dawn: 0x141c44, morning: 0x3a78c6, sunset: 0x26285c };
const ROOF = { fy: 0.12, A: -280 } as const;
const STAIRS = { fy: 0.25, A: 148 } as const;
const B4 = 0.36;

/** 맵마다 풍경 층(뒤 → 앞). 값은 디자인 city-views.json maps.*.layers와 balcony4.json view 그대로다. */
export const SKYLINES = {
  rooftop: {
    fill: ROOF_FILL,
    layers: [
      { art: 'roof-sky', h: 200, fx: 0.04, top: { ...ROOF, dy: -200 } },
      { art: 'roof-moon', h: 24, fx: 0, top: { ...ROOF, dy: -104 }, sprite: { x: 0.76, w: 24 } },
      { art: 'roof-city', h: 256, fx: 0.3, top: { ...ROOF, dy: 30 }, plane: 0.3 },
      // 맨 아래 24줄이 시가지 판 윗가장자리를 덮는 안개 치마라 시가지보다 앞에 그린다.
      { art: 'roof-far', h: 96, fx: 0.1, top: { ...ROOF, dy: -46 } },
    ],
  },
  stairs: {
    fill: { evening: 0x0a0618, dawn: 0x1a1c48, morning: 0x4a86cc, sunset: 0x2c2458 },
    split: { anchor: { ...STAIRS, dy: 40 }, bottom: { evening: 0x3a1c50, dawn: 0x374077, morning: 0xa8c0d8, sunset: 0x7b566c } },
    layers: [
      { art: 'stairs-sky', h: 220, fx: 0.05, top: { ...STAIRS, dy: -200 } },
      {
        art: 'stairs-back',
        h: 190,
        fx: 0.25,
        top: { ...STAIRS, dy: -118 },
        fillBelow: { evening: 0x3a1c50, dawn: 0x374077, morning: 0xa8c0d8, sunset: 0x7b566c },
      },
      {
        art: 'stairs-near',
        h: 330,
        fx: 0.45,
        top: { fy: 0.45, A: STAIRS.A, dy: -70 },
        fillBelow: { evening: 0x080711, dawn: 0x141929, morning: 0x36383d, sunset: 0x2e2124 },
      },
    ],
  },
  balcony4: {
    fill: ROOF_FILL,
    layers: [
      { art: 'roof-sky', h: 200, fx: 0, top: { horizon: B4, dy: -200 } },
      { art: 'roof-moon', h: 24, fx: 0, top: { horizon: B4, dy: -96 }, sprite: { x: 0.3, w: 24 } },
      { art: 'balcony4-city', h: 256, fx: 0.1, top: { horizon: B4, dy: 30 }, plane: 0 },
      { art: 'roof-far', h: 96, fx: 0.03, top: { horizon: B4, dy: -46 } },
    ],
  },
} as const satisfies Record<string, SkyDef>;

export type SkylineId = keyof typeof SKYLINES;

export const isSkyline = (id: string): id is SkylineId => Object.hasOwn(SKYLINES, id);

/** 이 맵의 풍경 층이 쓰는 그림 이름 */
export function skylineArt(id: SkylineId): CityArt[] {
  return SKYLINES[id].layers.map((layer) => layer.art);
}

interface Strip {
  layer: SkyLayer;
  obj: Phaser.GameObjects.TileSprite | Phaser.GameObjects.Image;
  fill: Phaser.GameObjects.Rectangle | null;
}

/**
 * 화면에 고정한 풍경 층(cityView.ts와 같은 방식)에 세로 패럴랙스를 더했다.
 * 층 위 끝 화면 y = 화면높이/2 + (뒤 모서리 월드 y + A − 카메라 가운데 월드 y) × fy + dy, tilePositionX = 카메라 가운데 월드 x × fx.
 * 카메라가 자리를 정한 뒤(FOLLOW_UPDATE) 한 번 부르고, 카메라 가운데가 1px 이상 움직였거나 화면 크기·배율이 바뀌었을 때만 숫자를 바꾼다.
 */
export class Skyline {
  private def: SkyDef | null = null;
  private strips: Strip[] = [];
  private split: Phaser.GameObjects.Rectangle | null = null;
  private cornerY = 0;
  private phase: DayPhase = 'morning';
  private laidOut = '';
  /** 성능 확인용: 층 자리를 다시 맞춘 횟수 */
  moves = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly art: PhaseArt,
    private readonly depth: number,
  ) {}

  get active() {
    return this.def !== null;
  }

  /** 맵에 들어올 때(PhaseArt.use 다음): cornerY는 바닥 뒤 모서리 월드 y */
  show(id: SkylineId, cornerY: number) {
    this.hide();
    const def: SkyDef = SKYLINES[id];
    this.def = def;
    this.cornerY = cornerY;
    this.phase = this.art.current;
    const add = this.scene.add;
    if (def.split) this.split = add.rectangle(0, 0, 16, 16, def.split.bottom[this.phase]).setOrigin(0, 0).setScrollFactor(0).setDepth(this.depth);
    def.layers.forEach((layer, i) => {
      const depth = this.depth + 0.01 * (i + 1);
      const obj = layer.sprite
        ? add.image(0, 0, BLANK).setOrigin(0, 0)
        : add.tileSprite(0, 0, 16, layer.h, BLANK).setOrigin(0, 0);
      obj.setScrollFactor(0).setDepth(depth);
      this.art.bind(obj, layer.art);
      const fill = layer.fillBelow
        ? add.rectangle(0, 0, 16, 16, layer.fillBelow[this.phase]).setOrigin(0, 0).setScrollFactor(0).setDepth(depth + 0.001)
        : null;
      this.strips.push({ layer, obj, fill });
    });
    this.art.onReady(() => this.repaint());
    this.repaint();
  }

  hide() {
    for (const { obj, fill } of this.strips) {
      obj.destroy();
      fill?.destroy();
    }
    this.split?.destroy();
    this.strips = [];
    this.split = null;
    this.def = null;
  }

  /** 시간대 색(카메라 배경, 채움)을 다시 칠하고 자리를 다시 맞춘다(처음과 시간대가 바뀔 때). */
  private repaint() {
    const def = this.def;
    if (!def) return;
    this.phase = this.art.current;
    this.scene.cameras.main.setBackgroundColor(def.fill[this.phase]);
    if (def.split) this.split?.setFillStyle(def.split.bottom[this.phase]);
    for (const { layer, fill } of this.strips) if (fill && layer.fillBelow) fill.setFillStyle(layer.fillBelow[this.phase]);
    this.laidOut = '';
  }

  /** 카메라가 이번 프레임 자리를 정한 뒤(FOLLOW_UPDATE) 부른다. */
  update(cam: Phaser.Cameras.Scene2D.Camera) {
    const def = this.def;
    if (!def) return;
    const cx = Math.round(cam.midPoint.x);
    const cy = Math.round(cam.midPoint.y);
    const key = `${cam.width},${cam.height},${cam.zoom},${cx},${cy}`;
    if (key === this.laidOut) return;
    this.laidOut = key;
    this.moves++;
    // scrollFactor 0인 그림은 카메라 배율로 화면 가운데를 중심으로 커지므로, 화면 왼쪽 위에서 잰 아트 px 자리를 그만큼 옮긴다(cityView.ts layout).
    const viewW = Math.ceil(cam.width / cam.zoom);
    const viewH = Math.ceil(cam.height / cam.zoom);
    const ox = Math.floor(cam.width / 2 - cam.width / (2 * cam.zoom));
    const oy = Math.floor(cam.height / 2 - cam.height / (2 * cam.zoom));
    const topOf = (a: Anchor) =>
      Math.round('horizon' in a ? Math.round(viewH * a.horizon) + a.dy : viewH / 2 + (this.cornerY + a.A - cy) * a.fy + a.dy);
    if (def.split && this.split) {
      const y = Math.max(0, topOf(def.split.anchor));
      this.split.setPosition(ox, oy + y).setSize(viewW + 2, Math.max(1, viewH - y + 2));
    }
    for (const { layer, obj, fill } of this.strips) {
      const top = topOf(layer.top);
      if (layer.sprite) {
        obj.setPosition(ox + Math.round(viewW * layer.sprite.x - layer.sprite.w / 2), oy + top);
        continue;
      }
      const strip = obj as Phaser.GameObjects.TileSprite;
      const height = layer.plane !== undefined ? Math.max(1, viewH - top + 1) : layer.h;
      if (strip.width !== viewW + 2 || strip.height !== height) strip.setSize(viewW + 2, height);
      strip.setPosition(ox, oy + top);
      strip.tilePositionX = Math.round(cx * layer.fx);
      if (layer.plane !== undefined && 'fy' in layer.top) strip.tilePositionY = Math.round((cy - this.cornerY) * (layer.plane - layer.top.fy));
      if (fill) {
        const y = top + layer.h;
        fill.setVisible(y < viewH).setPosition(ox, oy + y).setSize(viewW + 2, Math.max(1, viewH - y + 2));
      }
    }
  }
}
