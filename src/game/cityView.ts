import Phaser from 'phaser';
import { spriteUrl } from '../art/sprites';
import { CITY_BLINKS } from '../roomUse';

/**
 * 발코니 맵 밖에 까는 밤 도시 야경(2026-11-27 사용자 "바깥의 야경이 배경으로", 그림과 놓는 법은 디자인 세션 8 balcony-and-new-decor.md 3절).
 * 화면에 고정한 층 다섯(하늘·먼 산·강 건너 빌딩·강변 도로·가까운 옥상)을 가로로 이어 붙이고, 카메라가 움직인 만큼 층마다 다른 배율로만 민다.
 * - 그림은 그 맵에 들어갈 때 읽고(약 136KB), 나갈 때 그린 것을 지운다. 다른 맵에서는 아무 비용이 없다.
 * - 움직임은 tilePosition 숫자만 바꾼다(캔버스를 다시 칠하지 않음). 카메라가 안 움직이면 차 불빛 띠 둘만 바뀐다.
 * - 빨간 항공등은 층마다 점 그림 두 장을 0.6초마다 번갈아 보인다(타이머 하나).
 */

/** 지평선: 화면 높이(아트 px)의 이 비율 */
const HORIZON = 0.32;
const SKY_TOP = 0x05081a;
const BASE = 0x0a0920;
/** 달 가운데 자리: 가로는 화면 비율, 세로는 지평선 높이의 비율 */
const MOON = { x: 0.2, horizon: 0.4 };
/** 가까운 옥상 층은 강변 도로 층 맨 위에서 이만큼(px) 안쪽으로 올라오면(화면이 낮으면) 그리지 않는다. */
const NEAR_GAP = 60;
/** 강변 도로 차 불빛 띠: low 층 안의 줄과 흐르는 속도(초당 px, 오른쪽이 +) */
const TRAFFIC = [
  { name: 'city-traffic-head', row: 8, speed: 9 },
  { name: 'city-traffic-tail', row: 14, speed: -7 },
] as const;
const BLINK_MS = 600;
/** 점 그림 위쪽 여백(층 위로 솟은 송신탑 끝의 등) */
const BLINK_PAD = 32;

interface LayerDef {
  name: string;
  h: number;
  /** 가로 밀림 배율(카메라 scrollX에 곱함) */
  factor: number;
  /** 층 맨 위 y(아트 px): h0는 지평선, viewH는 화면 높이 */
  top: (h0: number, viewH: number) => number;
}

/** 강변 도로 층 맨 위: 지평선에서 아래로(px) */
const LOW_TOP = 84;

const LAYERS: LayerDef[] = [
  { name: 'city-sky', h: 320, factor: 0, top: (h0) => h0 - 320 },
  { name: 'city-far', h: 112, factor: 0.02, top: (h0) => h0 + 12 - 112 },
  { name: 'city-mid', h: 276, factor: 0.04, top: (h0) => h0 + 22 - 190 },
  { name: 'city-low', h: 300, factor: 0.07, top: (h0) => h0 + LOW_TOP },
  { name: 'city-near', h: 150, factor: 0.12, top: (_h0, viewH) => viewH - 150 },
];
const NAMES = [...LAYERS.map((l) => l.name), 'city-moon', ...TRAFFIC.map((t) => t.name)];

interface Strip {
  sprite: Phaser.GameObjects.TileSprite;
  factor: number;
  top: (h0: number, viewH: number) => number;
  /** 스스로 흐르는 양(px) */
  flow: number;
  speed: number;
}

export class CityView {
  private strips: Strip[] = [];
  private fill: Phaser.GameObjects.Rectangle | null = null;
  private moon: Phaser.GameObjects.Image | null = null;
  private near: Phaser.GameObjects.TileSprite | null = null;
  private blinks: Phaser.GameObjects.TileSprite[][] = [];
  private timer: Phaser.Time.TimerEvent | null = null;
  private shown = false;
  /** 지난번에 맞춘 화면 크기·배율 */
  private laidOut = '';
  private lastScroll = NaN;
  /** 성능 확인용: 층 자리를 다시 맞춘 횟수 */
  layouts = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth: number,
  ) {}

  get active() {
    return this.shown;
  }

  /** 발코니 맵에 들어올 때. 그림을 아직 안 읽었으면 읽은 뒤에 깐다. */
  show() {
    this.shown = true;
    const missing = NAMES.filter((name) => !this.scene.textures.exists(name));
    if (!missing.length) {
      this.build();
      return;
    }
    for (const name of missing) this.scene.load.image(name, spriteUrl(`balcony/${name}`));
    this.scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
      if (this.shown && !this.strips.length) this.build();
    });
    this.scene.load.start();
  }

  hide() {
    this.shown = false;
    for (const { sprite } of this.strips) sprite.destroy();
    for (const pair of this.blinks) for (const sprite of pair) sprite.destroy();
    this.fill?.destroy();
    this.moon?.destroy();
    this.timer?.remove();
    this.strips = [];
    this.blinks = [];
    this.fill = this.moon = this.timer = this.near = null;
    this.laidOut = '';
  }

  private build() {
    const add = (name: string, h: number, depth: number) =>
      this.scene.add.tileSprite(0, 0, 16, h, name).setOrigin(0, 0).setScrollFactor(0).setDepth(depth);
    this.fill = this.scene.add.rectangle(0, 0, 16, 16, BASE).setOrigin(0, 0).setScrollFactor(0).setDepth(this.depth);
    LAYERS.forEach((layer, i) => {
      const sprite = add(layer.name, layer.h, this.depth + 0.01 * (i + 1));
      this.strips.push({ sprite, factor: layer.factor, top: layer.top, flow: 0, speed: 0 });
      if (layer.name === 'city-near') this.near = sprite;
      if (layer.name === 'city-sky') this.moon = this.scene.add.image(0, 0, 'city-moon').setScrollFactor(0).setDepth(this.depth + 0.015);
      const spots = (CITY_BLINKS as Record<string, readonly (readonly number[])[]>)[layer.name.slice(5)];
      if (spots) {
        const pair = [0, 1].map((phase) => {
          const key = this.blinkTexture(layer.name, layer.h, spots, phase);
          return add(key, layer.h + BLINK_PAD, this.depth + 0.01 * (i + 1) + 0.002);
        });
        pair[1].setVisible(false);
        this.blinks.push(pair);
        this.strips.push(...pair.map((sprite) => ({ sprite, factor: layer.factor, top: (h0: number, viewH: number) => layer.top(h0, viewH) - BLINK_PAD, flow: 0, speed: 0 })));
      }
      if (layer.name === 'city-low') {
        for (const { name, row, speed } of TRAFFIC) {
          const strip = add(name, 2, this.depth + 0.01 * (i + 1) + 0.004);
          this.strips.push({ sprite: strip, factor: layer.factor, top: (h0, viewH) => layer.top(h0, viewH) + row, flow: 0, speed });
        }
      }
    });
    this.timer = this.scene.time.addEvent({
      delay: BLINK_MS,
      loop: true,
      callback: () => {
        for (const [a, b] of this.blinks) {
          a.setVisible(!a.visible);
          b.setVisible(!a.visible);
        }
      },
    });
    this.laidOut = '';
    this.lastScroll = NaN;
  }

  /** 빨간 항공등 점 그림 한 장(층과 같은 폭, 짝·홀 번째 등만). 처음 한 번 만든다. */
  private blinkTexture(layer: string, h: number, spots: readonly (readonly number[])[], phase: number) {
    const key = `${layer}-blink-${phase}`;
    if (this.scene.textures.exists(key)) return key;
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = h + BLINK_PAD;
    const context = canvas.getContext('2d')!;
    spots.forEach(([x, y], n) => {
      if (n % 2 !== phase) return;
      context.fillStyle = 'rgba(255, 59, 59, 0.35)';
      context.fillRect(x - 1, y + BLINK_PAD, 3, 1);
      context.fillRect(x, y + BLINK_PAD - 1, 1, 3);
      context.fillStyle = '#ff3b3b';
      context.fillRect(x, y + BLINK_PAD, 1, 1);
    });
    this.scene.textures.addCanvas(key, canvas);
    return key;
  }

  /** 매 프레임: 화면 크기나 배율이 바뀌었으면 자리를 다시 맞추고, 카메라가 움직였으면 층을 민다. 차 불빛 띠는 늘 흐른다. */
  update(delta: number) {
    if (!this.strips.length) return;
    const cam = this.scene.cameras.main;
    const key = `${cam.width},${cam.height},${cam.zoom}`;
    if (key !== this.laidOut) this.layout(cam, key);
    const scroll = Math.round(cam.scrollX);
    const moved = scroll !== this.lastScroll;
    this.lastScroll = scroll;
    for (const strip of this.strips) {
      if (strip.speed) strip.flow += (strip.speed * delta) / 1000;
      else if (!moved) continue;
      const x = Math.round(scroll * strip.factor - strip.flow);
      if (strip.sprite.tilePositionX !== x) strip.sprite.tilePositionX = x;
    }
  }

  /** scrollFactor 0인 그림은 카메라 배율로 화면 가운데를 중심으로 커지므로, 화면 왼쪽 위에서 잰 아트 px 자리를 그만큼 옮겨 준다. */
  private layout(cam: Phaser.Cameras.Scene2D.Camera, key: string) {
    this.laidOut = key;
    this.layouts++;
    const viewW = Math.ceil(cam.width / cam.zoom);
    const viewH = Math.ceil(cam.height / cam.zoom);
    const ox = Math.floor(cam.width / 2 - cam.width / (2 * cam.zoom));
    const oy = Math.floor(cam.height / 2 - cam.height / (2 * cam.zoom));
    const h0 = Math.round(viewH * HORIZON);
    for (const { sprite, top } of this.strips) sprite.setPosition(ox, oy + top(h0, viewH)).setSize(viewW + 2, sprite.height);
    this.moon?.setPosition(ox + Math.round(viewW * MOON.x), oy + Math.round(h0 * MOON.horizon));
    this.near?.setVisible(viewH - this.near.height >= h0 + LOW_TOP + NEAR_GAP);
    // 강변 도로 층 아래(큰 화면)는 바닥색으로 채운다. 하늘 위는 카메라 배경색(SKY_TOP)이다.
    this.fill?.setPosition(ox, oy + h0).setSize(viewW + 2, Math.max(1, viewH - h0 + 2));
    cam.setBackgroundColor(SKY_TOP);
  }
}
