import type { WorkId } from '../game/maps';
import { Pixels } from './pixels';

/** 작업 도구 그림. 머리가 위를 향하게 그리고, grip은 손으로 잡는 위치, reach는 grip에서 끝까지의 길이다. */
export interface ToolArt {
  grip: { x: number; y: number };
  reach: number;
  canvas: HTMLCanvasElement;
}

const OUTLINE = 0x1f1a24;
const HANDLE = 0x7b4d2c;
const HANDLE_LIGHT = 0xa8743f;
const STEEL = 0xaab2bb;
const STEEL_LIGHT = 0xe2e7ec;
const STEEL_DARK = 0x6f7480;

function handle(p: Pixels, x: number, y0: number, y1: number) {
  p.rect(x, y0, 1, y1 - y0 + 1, HANDLE_LIGHT);
  p.rect(x + 1, y0, 1, y1 - y0 + 1, HANDLE);
}

function paintPickaxe(): ToolArt {
  const p = new Pixels(24, 24);
  handle(p, 11, 6, 21);
  p.line(3, 8, 8, 4, STEEL);
  p.line(4, 8, 9, 5, STEEL_DARK);
  p.rect(9, 3, 6, 3, STEEL);
  p.rect(9, 3, 6, 1, STEEL_LIGHT);
  p.line(15, 4, 20, 8, STEEL);
  p.line(14, 5, 19, 8, STEEL_DARK);
  p.outlineOuter(OUTLINE);
  return { grip: { x: 12, y: 20 }, reach: 16, canvas: p.toCanvas() };
}

function paintAxe(): ToolArt {
  const p = new Pixels(24, 24);
  handle(p, 9, 3, 21);
  p.rect(11, 3, 3, 7, STEEL_DARK);
  p.rect(14, 2, 3, 9, STEEL);
  p.rect(17, 1, 2, 11, STEEL_LIGHT);
  p.outlineOuter(OUTLINE);
  return { grip: { x: 10, y: 20 }, reach: 16, canvas: p.toCanvas() };
}

function paintSickle(): ToolArt {
  const p = new Pixels(24, 24);
  handle(p, 9, 13, 21);
  p.line(10, 13, 8, 9, STEEL);
  p.line(8, 9, 9, 5, STEEL);
  p.line(9, 5, 13, 3, STEEL_LIGHT);
  p.line(13, 3, 17, 4, STEEL_LIGHT);
  p.line(9, 9, 10, 6, STEEL_DARK);
  p.line(10, 6, 13, 5, STEEL_DARK);
  p.outlineOuter(OUTLINE);
  return { grip: { x: 10, y: 20 }, reach: 16, canvas: p.toCanvas() };
}

function paintRod(): ToolArt {
  const p = new Pixels(8, 36);
  p.rect(3, 1, 1, 20, HANDLE_LIGHT);
  p.rect(3, 21, 2, 13, HANDLE);
  p.rect(2, 26, 4, 3, STEEL_DARK);
  p.set(3, 0, STEEL_LIGHT);
  return { grip: { x: 4, y: 31 }, reach: 31, canvas: p.toCanvas() };
}

const PAINTERS: Record<WorkId, () => ToolArt> = {
  quarry: paintPickaxe,
  logging: paintAxe,
  gathering: paintSickle,
  fishing: paintRod,
};

export function paintTool(place: WorkId) {
  return PAINTERS[place]();
}

/** 낚시에 성공하면 물 위로 튀어 오르는 물고기 */
export function paintFish() {
  const p = new Pixels(14, 8);
  p.ellipse(6, 4, 5, 3, 0x7cc0dc);
  p.rect(3, 5, 6, 1, 0xdff2f8);
  p.rect(11, 2, 2, 5, 0x5a9dbd);
  p.rect(10, 3, 1, 3, 0x5a9dbd);
  p.set(3, 3, 0x1f1a24);
  p.outlineOuter(0x2a4a5c);
  return p.toCanvas();
}
