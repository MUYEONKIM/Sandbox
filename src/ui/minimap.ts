import { MAP_SIZE } from '../config';
import type { Area } from '../game/maps';
import type { Tile } from '../game/world';
import { element } from './dom';
import { FoldBox } from './fold';

/** 칸 하나를 미니맵에서 몇 픽셀 옮길지. 맵처럼 2:1 마름모로 그린다. */
const STEP_X = 2;
const STEP_Y = 1;
const PADDING = 6;
const WIDTH = MAP_SIZE * STEP_X * 2 + PADDING * 2;
const HEIGHT = MAP_SIZE * STEP_Y * 2 + PADDING * 2;

const COLOR_ME = '#ffe14d';
const COLOR_OTHER = '#ff4d4d';
const COLOR_PORTAL = '#5fe3ff';
const COLOR_BLOCK = '#d7d9dd';
/** 모험 보스·중간 보스 점(2026-11-23 사용자 "모험 미니맵에 보스들 위치 표시되게 해라."). 색은 맵 바닥 고리·이름표 테두리와 같다(제가 정한 것). */
const COLOR_BOSS = '#ff3b30';
const COLOR_MINI = '#ffa53a';
const COLOR_EDGE = '#1f1510';

/** 미니맵 보스 점: 보스는 큰 빨강 마름모, 중간 보스·수문장은 작은 주황 마름모(네모인 나·유저·포탈과 모양으로 갈림) */
export interface BossDot extends Tile {
  kind: 'boss' | 'mini';
}

export interface MinimapState {
  me: Tile;
  others: Tile[];
  blocks: Tile[];
  portals: Tile[];
  /** 모험 맵의 보스·중간 보스·수문장(이번 판에 이긴 것은 빠짐) */
  bosses: BossDot[];
}


/** 우측 상단 미니맵: 나는 노란색, 다른 유저는 빨간색, 포탈은 하늘색 네모, 모험 보스는 빨강·주황 마름모로 표시한다. */
export class Minimap {
  private readonly title: HTMLElement;
  /** 범례 '보스' 칸. 모험 맵에서만 보인다. */
  private readonly bossKey: HTMLElement;
  private readonly ctx: CanvasRenderingContext2D;
  private ground = '#5bab43';
  /** 바닥이 있는 범위. 건물 안처럼 좁은 맵은 이 범위를 미니맵 가득 키워 그린다. */
  private bounds: Area = [0, 0, MAP_SIZE - 1, MAP_SIZE - 1];
  /** 접으면 맵 이름 한 줄만 남는다. 접혀 있는 동안 GameScene은 그리지 않는다. */
  readonly fold: FoldBox;
  /**
   * 모험 맵 윤곽(2026-11-25 사용자 "맵 지형이 미니맵에 윤곽만 나오게", 디자인 세션 6 minimap-v8.md 2절): 걷는 땅의 테두리 1픽셀.
   * 맵에 들어갈 때 한 번 굽고 draw는 이것을 붙이기만 한다. 모험 맵이 아니면 null(지금처럼 바닥 마름모와 블록 점).
   */
  private outline: HTMLCanvasElement | null = null;
  /** 마지막으로 윤곽을 구운 시간(ms, 확인용) */
  lastOutlineMs = 0;
  /** 왼쪽 위 지역 전체지도 버튼(모험 지역 맵에서만 보임) */
  private readonly mapButton: HTMLButtonElement;
  /** 지도 버튼을 눌렀을 때 */
  onMapButton: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    const box = element('minimap', parent);
    this.mapButton = element('minimap-mapbtn', box, 'button') as HTMLButtonElement;
    this.mapButton.type = 'button';
    // 눌러도 초점을 가져가지 않아 Space(점프)·Enter(채팅)가 버튼을 다시 누르지 않는다(접기 버튼과 같음).
    this.mapButton.tabIndex = -1;
    this.mapButton.title = '전체지도 (M)';
    this.mapButton.hidden = true;
    this.mapButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onMapButton?.();
    });
    this.title = element('minimap-title', box);
    const canvas = element('minimap-canvas', box, 'canvas') as HTMLCanvasElement;
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    this.ctx = canvas.getContext('2d')!;

    const legend = element('minimap-legend', box);
    for (const [label, color] of [
      ['나', COLOR_ME],
      ['유저', COLOR_OTHER],
      ['포탈', COLOR_PORTAL],
    ]) {
      const item = element('minimap-key', legend, 'span');
      item.textContent = label;
      item.style.setProperty('--dot', color);
    }
    this.bossKey = element('minimap-key boss', legend, 'span');
    this.bossKey.textContent = '보스';
    this.bossKey.style.setProperty('--dot', COLOR_BOSS);
    this.bossKey.hidden = true;
    this.fold = new FoldBox('minimap', box, this.title);
  }

  get folded() {
    return this.fold.folded;
  }

  /**
   * adventure: 모험 맵이면 범례에 '보스' 칸을 보인다. terrain을 주면(모험 맵) 걷는 땅 윤곽을 한 번 굽는다.
   * chapter: 모험 지역 맵이면 왼쪽 위 지역 전체지도 버튼을 보인다(입구 맵은 없음).
   */
  setMap(name: string, ground: number, bounds: Area, adventure = false, terrain?: { cells: Uint8Array; size: number; ground: number }, chapter = false) {
    this.title.textContent = name;
    this.ground = `#${ground.toString(16).padStart(6, '0')}`;
    this.bounds = bounds;
    this.bossKey.hidden = !adventure;
    this.mapButton.hidden = !chapter;
    this.outline = terrain ? this.bakeOutline(terrain) : null;
  }

  /** 지역 전체지도가 열려 있으면 지도 버튼을 눌린 모양으로 */
  setMapPressed(pressed: boolean) {
    this.mapButton.classList.toggle('pressed', pressed);
  }

  /**
   * 그림판 픽셀마다 project를 거꾸로 해서 덮는 칸을 찾아 걷는 땅 가면을 만들고, 네 이웃에 땅이 아닌 픽셀이 있는 땅 픽셀만 선 색으로 칠한다.
   * 선 색 #efe2c2(디자인 세션 6). 196 × 104 픽셀이라 한 번에 수 ms다.
   */
  private bakeOutline({ cells, size, ground }: { cells: Uint8Array; size: number; ground: number }) {
    const t0 = performance.now();
    const [x0, y0, x1, y1] = this.bounds;
    const w = x1 - x0 + 1;
    const d = y1 - y0 + 1;
    const zoom = MAP_SIZE / Math.max(w, d);
    const backX = WIDTH / 2 - ((w - d) / 2) * zoom * STEP_X;
    const backY = HEIGHT / 2 - ((w + d) / 2) * zoom * STEP_Y;
    const mask = new Uint8Array(WIDTH * HEIGHT);
    for (let py = 0; py < HEIGHT; py++) {
      for (let px = 0; px < WIDTH; px++) {
        const a = (px + 0.5 - backX) / STEP_X;
        const b = (py + 0.5 - backY) / STEP_Y;
        const gx = Math.floor(x0 + (a + b) / 2 / zoom);
        const gy = Math.floor(y0 + (b - a) / 2 / zoom);
        if (gx < x0 || gy < y0 || gx > x1 || gy > y1 || gx >= size || gy >= size) continue;
        if (cells[gx + gy * size] === ground) mask[px + py * WIDTH] = 1;
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(WIDTH, HEIGHT);
    for (let py = 0; py < HEIGHT; py++) {
      for (let px = 0; px < WIDTH; px++) {
        const i = px + py * WIDTH;
        const edge =
          mask[i] === 1 && (px === 0 || py === 0 || px === WIDTH - 1 || py === HEIGHT - 1 || !mask[i - 1] || !mask[i + 1] || !mask[i - WIDTH] || !mask[i + WIDTH]);
        // 미니맵 상자는 밝은 양피지 그림이라 크림색 선이 묻힌다. 그림판 안을 어두운 판(#1f1510, 92%)으로 깔아 디자인 시안처럼 보이게 한다(제가 정한 것).
        img.data[i * 4] = edge ? 0xef : 0x1f;
        img.data[i * 4 + 1] = edge ? 0xe2 : 0x15;
        img.data[i * 4 + 2] = edge ? 0xc2 : 0x10;
        img.data[i * 4 + 3] = edge ? 255 : 235;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.lastOutlineMs = performance.now() - t0;
    return canvas;
  }

  /** 격자 위의 점을 미니맵 좌표로 옮긴다. 바닥 범위를 미니맵 가운데에 가득 차게 키운다. */
  private project(gx: number, gy: number) {
    const [x0, y0, x1, y1] = this.bounds;
    const w = x1 - x0 + 1;
    const d = y1 - y0 + 1;
    const zoom = MAP_SIZE / Math.max(w, d);
    const u = (gx - x0) * zoom;
    const v = (gy - y0) * zoom;
    const backX = WIDTH / 2 - ((w - d) / 2) * zoom * STEP_X;
    const backY = HEIGHT / 2 - ((w + d) / 2) * zoom * STEP_Y;
    return { x: backX + (u - v) * STEP_X, y: backY + (u + v) * STEP_Y };
  }

  private toScreen({ x, y }: Tile) {
    return this.project(x + 0.5, y + 0.5);
  }

  private dot(tile: Tile, color: string, size: number) {
    const { x, y } = this.toScreen(tile);
    const half = Math.floor(size / 2);
    this.ctx.fillStyle = '#1f1510';
    this.ctx.fillRect(x - half - 1, y - half - 1, size + 2, size + 2);
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x - half, y - half, size, size);
  }

  /** 마름모 점: 가운데에서 위아래 h픽셀. 한 줄씩 정수 픽셀로 채워 흐려지지 않게 하고, 한 픽셀 큰 어두운 마름모를 먼저 깔아 테두리로 쓴다. */
  private diamond(tile: Tile, color: string, h: number) {
    const { x, y } = this.toScreen(tile);
    const cx = Math.round(x);
    const cy = Math.round(y);
    const { ctx } = this;
    for (const [r, fill] of [
      [h + 1, COLOR_EDGE],
      [h, color],
    ] as const) {
      ctx.fillStyle = fill;
      for (let dy = -r; dy <= r; dy++) {
        const w = r - Math.abs(dy);
        ctx.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
      }
    }
  }

  draw({ me, others, blocks, portals, bosses }: MinimapState) {
    const { ctx } = this;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    if (this.outline) {
      // 모험 맵: 구워 둔 윤곽만 붙이고 막힌 칸 점은 그리지 않는다(윤곽과 겹쳐 지저분함, 디자인 세션 6).
      ctx.drawImage(this.outline, 0, 0);
      this.drawDots(portals, bosses, others, me);
      return;
    }

    const [x0, y0, x1, y1] = this.bounds;
    const corners = [
      this.project(x0, y0),
      this.project(x1 + 1, y0),
      this.project(x1 + 1, y1 + 1),
      this.project(x0, y1 + 1),
    ];
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (const { x, y } of corners.slice(1)) ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fillStyle = this.ground;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#1f1510';
    ctx.stroke();

    ctx.fillStyle = COLOR_BLOCK;
    for (const block of blocks) {
      const { x, y } = this.toScreen(block);
      ctx.fillRect(x - 1, y, 2, 1);
    }
    this.drawDots(portals, bosses, others, me);
  }

  private drawDots(portals: Tile[], bosses: BossDot[], others: Tile[], me: Tile) {
    for (const portal of portals) this.dot(portal, COLOR_PORTAL, 4);
    for (const boss of bosses) {
      if (boss.kind === 'boss') this.diamond(boss, COLOR_BOSS, 4);
      else this.diamond(boss, COLOR_MINI, 3);
    }
    for (const other of others) this.dot(other, COLOR_OTHER, 4);
    this.dot(me, COLOR_ME, 5);
  }
}
