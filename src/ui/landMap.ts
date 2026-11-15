import { CUBE_ORIGIN_X, CUBE_ORIGIN_Y } from '../art/cube';
import { DECOR_LIFT, paintGround, TILE_CELL, worldRect } from '../art/ground';
import { groundPoint, sprite } from '../art/sprites';
import { blockArt, blockTile, footprintOf, paintBlock, type BlockId } from '../blocks';
import { BLOCK_HEIGHT, MAP_SIZE } from '../config';
import { CROP_ART, CROP_CELL } from '../game/cropArt';
import { FARMLAND_TILES, FLOOR_TOP, formatLeft, GRADE_NAME, gradeOf, isPlot, ripeAt, stageOf, type CropInfo, type CropId, type Plot } from '../game/farm';
import { generateMap } from '../game/map';
import { gridToWorld, tileCenter, worldToGrid } from '../iso';
import type { PlacedBlock } from '../net/session';
import { element } from './dom';
import './landMap.css';

/**
 * 농협 땅 지도(2026-11-16 사용자 "우리 맵은 마름모인데 농협 들어가면 직사각형이다. 땅을 살 때 실제 맵이 보이도록",
 * 기획 docs/balance/farm.md 9.1, 모두 에이전트가 정함). 게임과 같은 마름모 농장을 같은 그림으로 그린다.
 *
 * 그림판 세 장(모두 농장 그림 1배 크기 1472 × 824):
 * - 바닥 보관본(안 보임): 흙길과 잔디. 바뀌지 않아 처음 한 번만 그리고 페이지가 열린 동안 다시 쓴다.
 * - 밑그림: 바닥, 밭, 주인 덮개와 경계선, 작물, 블록. 열 때와 사고팔기 뒤 땅을 다시 읽을 때만 그린다.
 * - 덧그림: 고른 칸, 가리킨 칸, 끄는 범위. 바뀔 때만, 화면 갱신 한 번에 최대 한 번 그린다.
 * 확대와 이동은 CSS transform만 바꾼다(다시 그리지 않음).
 */

const RECT = worldRect(MAP_SIZE);
const TILE_COLUMNS = 11;
/** 한 번에 고르는 칸 수(서버 buy_plots, sell_plots와 같음) */
export const MAX_PICK = 100;
/** 확대 단계: 칸 너비 16px, 32px(그림 1배), 64px(게임 화면과 같음). 맨 앞에 "전체"(창에 꼭 맞게)가 붙는다. */
const ZOOMS = [0.5, 1, 2];
/** 같은 배율로 보는 범위: 지도가 창 밖으로 반 넘게 나가지 않게 */
const KEEP_IN = 0.5;
/** 시작마을로 가는 포탈 칸(농장 왼쪽 꼭짓점) */
const HOME_PORTAL = { x: 0, y: MAP_SIZE - 1 };

const COLORS = {
  mine: 'rgba(255, 214, 77, 0.25)',
  mineEdge: '#ffd84d',
  other: 'rgba(74, 44, 24, 0.25)',
  otherEdge: '#7a4a2c',
  buy: 'rgba(255, 255, 255, 0.55)',
  buyEdge: '#ffffff',
  sell: 'rgba(255, 90, 90, 0.55)',
  sellEdge: '#ff5a5a',
  hover: '#ffffff',
  range: '#fff3a0',
};

let groundCache: HTMLCanvasElement | null = null;
/** 흙길과 잔디(게임의 농장 바닥과 같은 그림) */
function ground() {
  groundCache ??= paintGround(generateMap('farm'));
  return groundCache;
}

const cubeCache = new Map<BlockId, HTMLCanvasElement>();
function cubeOf(id: BlockId) {
  let canvas = cubeCache.get(id);
  if (!canvas) {
    canvas = paintBlock(id);
    cubeCache.set(id, canvas);
  }
  return canvas;
}

/** 칸 (x, y)의 바닥 마름모 네 꼭짓점(그림판 좌표): 위, 오른쪽, 아래, 왼쪽 */
function corners(x0: number, y0: number, x1 = x0 + 1, y1 = y0 + 1) {
  return [gridToWorld(x0, y0), gridToWorld(x1, y0), gridToWorld(x1, y1), gridToWorld(x0, y1)].map((p) => ({ x: p.x - RECT.left, y: p.y }));
}

function diamond(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1?: number, y1?: number) {
  const [a, b, c, d] = corners(x0, y0, x1, y1);
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
}

export interface LandMapData {
  plots: Plot[];
  blocks: PlacedBlock[];
}

interface LandMapOptions {
  myId: string;
  crop(id: CropId): CropInfo | undefined;
  /** 고른 칸이 바뀔 때. mode는 사기(빈 땅) 또는 팔기(내 땅) */
  onPick(cells: [number, number][], mode: 'buy' | 'sell' | null): void;
}

type Kind = 'road' | 'empty' | 'mine' | 'other';

export class LandMap {
  readonly root: HTMLElement;
  readonly tip: HTMLElement;
  private readonly view: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly under: HTMLCanvasElement;
  private readonly over: HTMLCanvasElement;
  private readonly modeButton: HTMLButtonElement;
  private readonly owner = new Map<string, Plot>();
  /** 블록이 있는 칸(큰 가구는 차지하는 칸 모두) */
  private readonly blocked = new Set<string>();
  readonly picked = new Set<string>();
  mode: 'buy' | 'sell' | null = null;
  private hover: { x: number; y: number } | null = null;
  private dragFrom: { x: number; y: number } | null = null;
  private dragTo: { x: number; y: number } | null = null;
  private pan: { x: number; y: number; tx: number; ty: number } | null = null;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinch: { distance: number; scale: number } | null = null;
  private dragMode: 'pick' | 'move';
  private scale = 1;
  private tx = 0;
  private ty = 0;
  private fitScale = 1;
  private overlayQueued = 0;
  /** 그린 횟수(잴 때 본다) */
  readonly drawn = { under: 0, over: 0, underMs: 0 };

  constructor(
    parent: HTMLElement,
    private readonly options: LandMapOptions,
  ) {
    this.root = element('land-board', parent);
    this.view = element('land-view', this.root);
    this.stage = element('land-stage', this.view);
    this.under = element('land-layer', this.stage, 'canvas') as HTMLCanvasElement;
    this.over = element('land-layer', this.stage, 'canvas') as HTMLCanvasElement;
    for (const canvas of [this.under, this.over]) {
      canvas.width = RECT.width;
      canvas.height = RECT.height;
    }
    this.stage.style.width = `${RECT.width}px`;
    this.stage.style.height = `${RECT.height}px`;

    // 휴대폰(터치)은 끌면 옮기고, PC는 끌면 고른다. 버튼으로 바꾼다.
    this.dragMode = matchMedia('(pointer: coarse)').matches ? 'move' : 'pick';
    this.modeButton = element('land-mode', this.view, 'button') as HTMLButtonElement;
    this.modeButton.type = 'button';
    this.modeButton.addEventListener('click', () => {
      this.dragMode = this.dragMode === 'pick' ? 'move' : 'pick';
      this.showMode();
    });
    this.showMode();
    const zoom = element('land-zoom', this.view);
    for (const [label, step] of [
      ['+', 1],
      ['−', -1],
    ] as [string, number][]) {
      const button = element('land-zoom-button', zoom, 'button') as HTMLButtonElement;
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => this.zoomStep(step, this.view.clientWidth / 2, this.view.clientHeight / 2));
    }
    this.tip = element('land-tip', this.root);

    this.view.addEventListener('pointerdown', (e) => this.onDown(e));
    this.view.addEventListener('pointermove', (e) => this.onMove(e));
    this.view.addEventListener('pointerup', (e) => this.onUp(e));
    this.view.addEventListener('pointercancel', (e) => this.onUp(e, true));
    this.view.addEventListener('contextmenu', (e) => e.preventDefault());
    this.view.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const r = this.view.getBoundingClientRect();
        this.zoomStep(e.deltaY < 0 ? 1 : -1, e.clientX - r.left, e.clientY - r.top);
      },
      { passive: false },
    );
  }

  private showMode() {
    this.modeButton.textContent = this.dragMode === 'pick' ? '끌기: 고르기' : '끌기: 옮기기';
    this.view.classList.toggle('moving', this.dragMode === 'move');
  }

  /** 창이 화면에 붙은 뒤 부른다: 전체 배율로 맞춘다. */
  fit() {
    const w = this.view.clientWidth;
    const h = this.view.clientHeight;
    this.fitScale = Math.min(w / RECT.width, h / RECT.height);
    this.setScale(this.fitScale, w / 2, h / 2, true);
  }

  private levels() {
    return [this.fitScale, ...ZOOMS.filter((z) => z > this.fitScale * 1.05)];
  }

  private zoomStep(step: number, cx: number, cy: number) {
    const levels = this.levels();
    let at = levels.findIndex((z) => Math.abs(z - this.scale) < 1e-6);
    if (at < 0) at = levels.findIndex((z) => z > this.scale) - (step > 0 ? 1 : 0);
    const next = levels[Math.max(0, Math.min(levels.length - 1, at + step))];
    this.setScale(next, cx, cy);
  }

  /** (cx, cy)(창 안 좌표)를 기준으로 배율을 바꾼다. 전체 배율이면 가운데에 둔다. */
  private setScale(scale: number, cx: number, cy: number, center = false) {
    const w = this.view.clientWidth;
    const h = this.view.clientHeight;
    if (center || scale <= this.fitScale + 1e-6) {
      this.scale = this.fitScale;
      this.tx = (w - RECT.width * this.scale) / 2;
      this.ty = (h - RECT.height * this.scale) / 2;
    } else {
      const px = (cx - this.tx) / this.scale;
      const py = (cy - this.ty) / this.scale;
      this.scale = scale;
      this.tx = cx - px * scale;
      this.ty = cy - py * scale;
    }
    this.applyTransform();
  }

  private applyTransform() {
    const w = this.view.clientWidth;
    const h = this.view.clientHeight;
    const mw = RECT.width * this.scale;
    const mh = RECT.height * this.scale;
    if (this.scale > this.fitScale + 1e-6) {
      this.tx = Math.min(w * KEEP_IN, Math.max(w * (1 - KEEP_IN) - mw, this.tx));
      this.ty = Math.min(h * KEEP_IN, Math.max(h * (1 - KEEP_IN) - mh, this.ty));
    }
    this.stage.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.scale})`;
    // 1배보다 작으면 부드럽게 줄이고, 1배 이상이면 도트가 뭉개지지 않게 키운다.
    this.stage.classList.toggle('crisp', this.scale >= 1);
  }

  setData({ plots, blocks }: LandMapData) {
    this.owner.clear();
    for (const plot of plots) this.owner.set(`${plot.x},${plot.y}`, plot);
    this.blocked.clear();
    for (const { x, y, id } of blocks) {
      const { x0, y0, a, b } = footprintOf(id, x, y);
      for (let j = y0; j < y0 + b; j++) for (let i = x0; i < x0 + a; i++) this.blocked.add(`${i},${j}`);
    }
    this.drawUnder(blocks);
    this.queueOverlay();
  }

  get mine() {
    let n = 0;
    for (const plot of this.owner.values()) if (plot.owner === this.options.myId) n++;
    return n;
  }

  kindOf(x: number, y: number): Kind {
    if (!isPlot(x, y)) return 'road';
    const plot = this.owner.get(`${x},${y}`);
    if (!plot) return 'empty';
    return plot.owner === this.options.myId ? 'mine' : 'other';
  }

  /** 내 땅을 팔 수 있는지: 작물과 블록이 없어야 한다(서버 sell_plots와 같음). */
  private sellable(x: number, y: number) {
    return this.kindOf(x, y) === 'mine' && !this.owner.get(`${x},${y}`)?.crop && !this.blocked.has(`${x},${y}`);
  }

  private pickable(x: number, y: number) {
    if (this.mode === 'buy') return this.kindOf(x, y) === 'empty';
    if (this.mode === 'sell') return this.sellable(x, y);
    return this.kindOf(x, y) === 'empty' || this.sellable(x, y);
  }

  private toggle(x: number, y: number, on?: boolean) {
    if (!this.pickable(x, y)) return;
    const id = `${x},${y}`;
    const next = on ?? !this.picked.has(id);
    if (next && this.picked.size >= MAX_PICK) return;
    if (next) {
      this.mode ??= this.kindOf(x, y) === 'mine' ? 'sell' : 'buy';
      this.picked.add(id);
    } else this.picked.delete(id);
    if (!this.picked.size) this.mode = null;
  }

  clearPicks() {
    this.picked.clear();
    this.mode = null;
    this.changed();
  }

  get cells() {
    return [...this.picked].map((c) => c.split(',').map(Number) as [number, number]);
  }

  private changed() {
    this.options.onPick(this.cells, this.mode);
    this.queueOverlay();
  }

  // ───────── 입력 ─────────

  private local(e: PointerEvent) {
    const r = this.view.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private cellAt(e: PointerEvent) {
    const p = this.local(e);
    const wx = (p.x - this.tx) / this.scale + RECT.left;
    const wy = (p.y - this.ty) / this.scale;
    const { gx, gy } = worldToGrid(wx, wy);
    const x = Math.floor(gx);
    const y = Math.floor(gy);
    return x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE ? { x, y } : null;
  }

  private onDown(e: PointerEvent) {
    // 지도 밖으로 끌어도 계속 받는다. 잡지 못하는 포인터(이미 끝난 것)면 그냥 넘어간다.
    try {
      this.view.setPointerCapture(e.pointerId);
    } catch {
      // 무시
    }
    this.pointers.set(e.pointerId, this.local(e));
    if (this.pointers.size === 2) {
      // 두 손가락: 고르기와 옮기기를 멈추고 오므리기·벌리기로 확대한다.
      const [a, b] = [...this.pointers.values()];
      this.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: this.scale };
      this.dragFrom = this.dragTo = null;
      this.pan = null;
      this.queueOverlay();
      return;
    }
    const moving = this.dragMode === 'move' || e.button === 1 || e.button === 2;
    if (moving) {
      const p = this.local(e);
      this.pan = { x: p.x, y: p.y, tx: this.tx, ty: this.ty };
      return;
    }
    this.dragFrom = this.dragTo = this.cellAt(e);
    this.queueOverlay();
  }

  private onMove(e: PointerEvent) {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, this.local(e));
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const scale = Math.max(this.fitScale, Math.min(ZOOMS[ZOOMS.length - 1], (this.pinch.scale * Math.hypot(a.x - b.x, a.y - b.y)) / this.pinch.distance));
      this.setScale(scale, (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    if (this.pan) {
      const p = this.local(e);
      this.tx = this.pan.tx + p.x - this.pan.x;
      this.ty = this.pan.ty + p.y - this.pan.y;
      this.applyTransform();
      return;
    }
    const at = this.cellAt(e);
    // 같은 칸 안에서 움직이면 아무것도 하지 않는다.
    const same = (a: typeof at, b: typeof at) => (a === null ? b === null : b !== null && a.x === b.x && a.y === b.y);
    if (this.dragFrom) {
      if (!same(at, this.dragTo) && at) {
        this.dragTo = at;
        this.queueOverlay();
      }
    }
    if (same(at, this.hover)) return;
    this.hover = at;
    this.tip.textContent = this.describe(at);
    this.queueOverlay();
  }

  private onUp(e: PointerEvent, cancel = false) {
    this.pointers.delete(e.pointerId);
    if (this.pinch) {
      if (this.pointers.size < 2) this.pinch = null;
      return;
    }
    this.pan = null;
    const from = this.dragFrom;
    const to = cancel ? null : (this.cellAt(e) ?? this.dragTo);
    this.dragFrom = this.dragTo = null;
    if (from && to) {
      if (from.x === to.x && from.y === to.y) this.toggle(to.x, to.y);
      else {
        // 시작 칸과 끝 칸을 두 모서리로 하는 격자 네모(마름모 결을 따라 비스듬한 네모)
        for (let y = Math.min(from.y, to.y); y <= Math.max(from.y, to.y); y++) {
          for (let x = Math.min(from.x, to.x); x <= Math.max(from.x, to.x); x++) this.toggle(x, y, true);
        }
      }
      this.changed();
    } else this.queueOverlay();
  }

  /** 가리킨 칸의 글: 게임에서 밭 위에 마우스를 올릴 때와 같은 식 */
  describe(at: { x: number; y: number } | null) {
    if (!at) return '';
    const where = `(${at.x}, ${at.y})`;
    if (!isPlot(at.x, at.y)) return at.x === HOME_PORTAL.x && at.y === HOME_PORTAL.y ? `시작마을 포탈 ${where}` : `길 ${where}`;
    const plot = this.owner.get(`${at.x},${at.y}`);
    if (!plot) return `빈 땅 ${where}`;
    const who = plot.owner === this.options.myId ? `내 땅 ${where}` : `${plot.nickname || '누군가'}의 땅 ${where}`;
    const block = this.blocked.has(`${at.x},${at.y}`) ? ' · 블록 있음' : '';
    const crop = plot.crop && this.options.crop(plot.crop);
    if (!crop) return `${who}${block}`;
    const left = ripeAt(plot, crop) - Date.now();
    const votes = `칭찬 ${plot.praise} · 비난 ${plot.blame}`;
    if (left <= 0) return `${who} · ${GRADE_NAME[gradeOf(plot)]}${crop.name} · 다 자람 · ${votes}${block}`;
    return `${who} · ${crop.name} · ${formatLeft(left)} 남음 · ${votes}${block}`;
  }

  // ───────── 그리기 ─────────

  private drawUnder(blocks: PlacedBlock[]) {
    const started = performance.now();
    const ctx = this.under.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, RECT.width, RECT.height);
    ctx.drawImage(ground(), 0, 0);
    const tiles = sprite('tiles');
    const drawTile = (tile: number, left: number, top: number) =>
      ctx.drawImage(tiles, (tile % TILE_COLUMNS) * TILE_CELL, Math.floor(tile / TILE_COLUMNS) * TILE_CELL, TILE_CELL, TILE_CELL, left, top, TILE_CELL, TILE_CELL);

    // 1. 산 땅의 밭(작물이 없는 칸. 작물 그림은 밭을 포함한다)
    const now = Date.now();
    for (const plot of this.owner.values()) {
      if (plot.crop && this.options.crop(plot.crop)) continue;
      const corner = gridToWorld(plot.x, plot.y);
      drawTile(FARMLAND_TILES[(plot.x * 7 + plot.y * 13) % FARMLAND_TILES.length], corner.x - TILE_CELL / 2 - RECT.left, corner.y - FLOOR_TOP);
    }

    // 2. 주인 덮개와, 주인이 다른 칸과 맞닿은 변에만 긋는 경계선(색마다 한 번에 칠하고 긋는다)
    for (const kind of ['mine', 'other'] as const) {
      const cells = [...this.owner.values()].filter((p) => this.kindOf(p.x, p.y) === kind);
      if (!cells.length) continue;
      ctx.beginPath();
      for (const { x, y } of cells) diamond(ctx, x, y);
      ctx.fillStyle = COLORS[kind];
      ctx.fill();
      ctx.beginPath();
      const ownerOf = (x: number, y: number) => this.owner.get(`${x},${y}`)?.owner ?? null;
      for (const { x, y, owner } of cells) {
        const [top, right, bottom, left] = corners(x, y);
        const edge = (a: { x: number; y: number }, b: { x: number; y: number }, nx: number, ny: number) => {
          if (ownerOf(nx, ny) === owner) return;
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        };
        edge(top, right, x, y - 1);
        edge(right, bottom, x + 1, y);
        edge(bottom, left, x, y + 1);
        edge(left, top, x - 1, y);
      }
      ctx.strokeStyle = COLORS[kind === 'mine' ? 'mineEdge' : 'otherEdge'];
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // 3. 작물과 블록: 게임처럼 뒤쪽 칸부터
    const items: { depth: number; draw: () => void }[] = [];
    const crops = sprite('farm/crops');
    for (const plot of this.owner.values()) {
      const crop = plot.crop && this.options.crop(plot.crop);
      if (!crop) continue;
      const art = CROP_ART[crop.id];
      const c = tileCenter(plot.x, plot.y);
      const sx = stageOf(plot, crop, now) * CROP_CELL.width;
      const sy = art.row * CROP_CELL.height;
      items.push({
        depth: plot.x + plot.y + 0.2,
        draw: () => ctx.drawImage(crops, sx, sy, CROP_CELL.width, CROP_CELL.height, c.x - RECT.left - art.anchorX, c.y - art.anchorY, CROP_CELL.width, CROP_CELL.height),
      });
    }
    for (const block of blocks) items.push({ depth: block.x + block.y + block.z * 0.01 + 0.5, draw: () => this.drawBlock(ctx, block, drawTile) });
    items.sort((a, b) => a.depth - b.depth);
    for (const item of items) item.draw();

    // 4. 시작마을 포탈(왼쪽 꼭짓점): 지도와 게임 화면을 맞춰 볼 기준
    const portal = tileCenter(HOME_PORTAL.x, HOME_PORTAL.y);
    const px = portal.x - RECT.left;
    ctx.beginPath();
    ctx.ellipse(px, portal.y, 13, 6.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(157, 240, 143, 0.6)';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(31, 26, 36, 0.85)';
    ctx.strokeText('← 시작마을 포탈', px + 18, portal.y - 18);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('← 시작마을 포탈', px + 18, portal.y - 18);

    this.drawn.under++;
    this.drawn.underMs = performance.now() - started;
  }

  private drawBlock(
    ctx: CanvasRenderingContext2D,
    { x, y, z, id }: PlacedBlock,
    drawTile: (tile: number, left: number, top: number) => void,
  ) {
    const art = blockArt(id);
    const lift = z * BLOCK_HEIGHT;
    const c = tileCenter(x, y);
    if (art.kind === 'cube') {
      const image = cubeOf(id);
      ctx.drawImage(image, c.x - RECT.left - image.width * CUBE_ORIGIN_X, c.y - lift - image.height * CUBE_ORIGIN_Y);
      return;
    }
    if (art.kind === 'sprite') {
      const image = sprite(art.sprite);
      const foot = groundPoint(art.sprite);
      ctx.drawImage(image, c.x - RECT.left - foot.x, c.y - lift - foot.y);
      return;
    }
    if (art.kind === 'furniture') {
      const [fx, fy, w, h, ax, ay] = art.frame;
      const { x0, y0, a, b } = footprintOf(id, x, y);
      const at = gridToWorld(x0 + a / 2, y0 + b / 2);
      ctx.drawImage(sprite('furniture'), fx, fy, w, h, at.x - RECT.left - ax, at.y - lift - ay, w, h);
      return;
    }
    const corner = gridToWorld(x, y);
    drawTile(blockTile(art.tiles, x, y), corner.x - TILE_CELL / 2 - RECT.left, corner.y - FLOOR_TOP - DECOR_LIFT - lift);
  }

  /** 덧그림은 바뀔 때만, 화면 갱신 한 번에 최대 한 번 그린다. */
  private queueOverlay() {
    if (this.overlayQueued) return;
    this.overlayQueued = requestAnimationFrame(() => {
      this.overlayQueued = 0;
      this.drawOverlay();
    });
  }

  private drawOverlay() {
    const ctx = this.over.getContext('2d')!;
    ctx.clearRect(0, 0, RECT.width, RECT.height);
    if (this.picked.size) {
      const sell = this.mode === 'sell';
      ctx.beginPath();
      for (const id of this.picked) {
        const [x, y] = id.split(',').map(Number);
        diamond(ctx, x, y);
      }
      ctx.fillStyle = sell ? COLORS.sell : COLORS.buy;
      ctx.fill();
      ctx.strokeStyle = sell ? COLORS.sellEdge : COLORS.buyEdge;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if (this.dragFrom && this.dragTo && (this.dragFrom.x !== this.dragTo.x || this.dragFrom.y !== this.dragTo.y)) {
      ctx.beginPath();
      diamond(
        ctx,
        Math.min(this.dragFrom.x, this.dragTo.x),
        Math.min(this.dragFrom.y, this.dragTo.y),
        Math.max(this.dragFrom.x, this.dragTo.x) + 1,
        Math.max(this.dragFrom.y, this.dragTo.y) + 1,
      );
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = COLORS.range;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (this.hover) {
      ctx.beginPath();
      diamond(ctx, this.hover.x, this.hover.y);
      ctx.strokeStyle = COLORS.hover;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    this.drawn.over++;
  }

  destroy() {
    cancelAnimationFrame(this.overlayQueued);
    this.overlayQueued = 0;
  }
}
