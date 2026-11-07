import { MAP_SIZE } from '../config';
import type { Area } from '../game/maps';
import type { Tile } from '../game/world';
import { element } from './dom';

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

export interface MinimapState {
  me: Tile;
  others: Tile[];
  blocks: Tile[];
  portals: Tile[];
}


/** 우측 상단 미니맵: 나는 노란색, 다른 유저는 빨간색, 포탈은 하늘색으로 표시한다. */
export class Minimap {
  private readonly title: HTMLElement;
  private readonly ctx: CanvasRenderingContext2D;
  private ground = '#5bab43';
  /** 바닥이 있는 범위. 건물 안처럼 좁은 맵은 이 범위를 미니맵 가득 키워 그린다. */
  private bounds: Area = [0, 0, MAP_SIZE - 1, MAP_SIZE - 1];

  constructor(parent: HTMLElement) {
    const box = element('minimap', parent);
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
  }

  setMap(name: string, ground: number, bounds: Area) {
    this.title.textContent = name;
    this.ground = `#${ground.toString(16).padStart(6, '0')}`;
    this.bounds = bounds;
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

  draw({ me, others, blocks, portals }: MinimapState) {
    const { ctx } = this;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

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
    for (const portal of portals) this.dot(portal, COLOR_PORTAL, 4);
    for (const other of others) this.dot(other, COLOR_OTHER, 4);
    this.dot(me, COLOR_ME, 5);
  }
}
