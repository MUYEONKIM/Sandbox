import type Phaser from 'phaser';
import { BLOCK_IDS, BLOCKS, blockArt, type BlockId } from '../blocks';
import { WALL_H } from '../art/interior';
import { spritePixels, sprite, type SpriteName } from '../art/sprites';
import { gridToWorld } from '../iso';
import { OUTDOOR_FRAMES, ROOM_WALL_FRAMES } from '../roomDecor';
import type { Portal } from './maps';
import { FLOORS, type TowerId } from './tower';
import type { Tile } from './world';

/**
 * 방 꾸미기 장식품 그림(2026-11-24, 디자인 세션 3·5, src/roomDecor.ts).
 * - 장식품·놓는 벽·바닥 타일·바깥용 장식품: 시트 한 장마다 텍스처 하나에 블록 id(또는 'style:mask', 'id:n') 프레임을 단다.
 * - 벽지·벽걸이: 납작한 그림을 뒤쪽 벽 기울기(가로 1px에 0.5px, src/art/interior.ts Painter.wall과 같은 셈)로 눕힌 그림을
 *   처음 쓸 때 한 장(WALL_DECOR_TEXTURE)에 모두 구워 둔다. 왼쪽 벽은 화면 왼쪽부터 그림 열 차례로 읽어 뒤집히지 않게 한다.
 */

/** 벽지·벽걸이를 붙이는 맵(사용자가 정함: 4·7·8층과 7층으로 나가는 포탈이 있는 빈방) */
export const WALL_DECOR_MAPS: ReadonlySet<string> = new Set(['tower4', 'tower7', 'tower8', 'annex']);

export type WallSide = 'right' | 'left';

/** 뒤쪽 벽 칸: 바닥 바로 뒤의 허공 칸. 오른쪽 벽은 (x, y0 − 1), 왼쪽 벽은 (x0 − 1, y)이다. */
export interface WallCell extends Tile {
  side: WallSide;
}

const floorOf = (mapId: string) => (WALL_DECOR_MAPS.has(mapId) ? FLOORS[mapId as TowerId] : null);

/** 칸 (x, y)가 그 맵의 뒤쪽 벽 칸이면 그 벽 칸 */
export function wallCellAt(mapId: string, x: number, y: number): WallCell | null {
  const floor = floorOf(mapId);
  if (!floor) return null;
  const [x0, y0, x1, y1] = floor.area;
  if (y === y0 - 1 && x >= x0 && x <= x1) return { x, y, side: 'right' };
  if (x === x0 - 1 && y >= y0 && y <= y1) return { x, y, side: 'left' };
  return null;
}

/** 벽 칸 바로 앞 바닥 칸(손이 닿는지 이 칸으로 본다) */
export function wallFront(cell: WallCell): Tile {
  return cell.side === 'right' ? { x: cell.x, y: cell.y + 1 } : { x: cell.x + 1, y: cell.y };
}

/** 벽을 따라 k칸 옆 벽 칸 */
export function wallNext(cell: WallCell, k: number): WallCell {
  return cell.side === 'right' ? { ...cell, x: cell.x + k } : { ...cell, y: cell.y + k };
}

/** 벽 칸의 아래 모서리 기준점(월드 px): 오른쪽 벽은 칸 왼쪽 끝, 왼쪽 벽은 칸 오른쪽 끝이다. */
function wallBase(cell: WallCell) {
  return cell.side === 'right' ? gridToWorld(cell.x, cell.y + 1) : gridToWorld(cell.x + 1, cell.y);
}

/**
 * 벽지·벽걸이를 놓지 못하는 벽 칸: 벽의 문(엘리베이터 문과 옆 버튼, 8층 비상구)과 벽에 붙은 포탈·도착 칸 바로 뒤.
 * 맵 배치 규칙: 포탈·문은 가려지면 안 된다. 칸 키는 "x,y"다.
 */
export function blockedWallCells(mapId: string, portals: readonly Portal[]): Set<string> {
  const blocked = new Set<string>();
  const floor = floorOf(mapId);
  if (!floor) return blocked;
  const [x0, y0] = floor.area;
  for (const door of floor.doorways) {
    const extra = door.kind === 'elevator' ? 2 : 1;
    for (let a = door.at - 1; a <= door.at + extra; a++) blocked.add(door.wall === 'right' ? `${a},${y0 - 1}` : `${x0 - 1},${a}`);
  }
  for (const portal of portals) {
    for (const t of [portal, portal.landing]) {
      if (t.y === y0) blocked.add(`${t.x},${y0 - 1}`);
      if (t.x === x0) blocked.add(`${x0 - 1},${t.y}`);
    }
  }
  return blocked;
}

/** 화면 점 (wx, wy)가 가리키는 뒤쪽 벽 칸. 벽면(바닥에서 WALL_H px까지) 밖이면 null */
export function wallAtPoint(mapId: string, wx: number, wy: number): WallCell | null {
  const floor = floorOf(mapId);
  if (!floor) return null;
  const [x0, y0, x1, y1] = floor.area;
  const corner = gridToWorld(x0, y0);
  const right = Math.floor(wx - corner.x);
  if (right >= 0 && right < (x1 - x0 + 1) * 16) {
    const v = corner.y + Math.floor(right / 2) - wy;
    if (v >= 0 && v < WALL_H) return { x: x0 + Math.floor(right / 16), y: y0 - 1, side: 'right' };
  }
  const left = Math.floor(corner.x - 1 - wx);
  if (left >= 0 && left < (y1 - y0 + 1) * 16) {
    const v = corner.y + Math.floor(left / 2) - wy;
    if (v >= 0 && v < WALL_H) return { x: x0 - 1, y: y0 + Math.floor(left / 16), side: 'left' };
  }
  return null;
}

/** 벽 칸의 테두리 네 점(월드 px, 벽을 따라 span칸): 아래 두 점, 위 두 점 */
export function wallOutline(cell: WallCell, span = 1) {
  const b = wallBase(cell);
  const w = span * 16;
  const far = cell.side === 'right' ? { x: b.x + w, y: b.y + w / 2 } : { x: b.x - w, y: b.y + w / 2 };
  return [b, far, { x: far.x, y: far.y - WALL_H }, { x: b.x, y: b.y - WALL_H }];
}

/** 장식품 시트들의 텍스처 프레임을 한 번 단다. */
export function ensureRoomTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('room/room-decor')) return;
  const sheets = new Map<string, Phaser.Textures.Texture>();
  const sheet = (name: SpriteName) => {
    let texture = sheets.get(name);
    if (!texture) {
      texture = scene.textures.addImage(name, sprite(name))!;
      sheets.set(name, texture);
    }
    return texture;
  };
  sheet('room/room-decor');
  sheet('room/room-decor-more');
  for (const id of BLOCK_IDS) {
    const art = blockArt(id);
    if (art.kind === 'room') {
      const [x, y, w, h] = art.frame;
      sheet(art.sheet).add(id, 0, x, y, w, h);
    } else if (art.kind === 'ftile') {
      const [x, y, w, h] = art.frame;
      sheet('room/room-tiles').add(id, 0, x, y, w, h);
    }
  }
  for (const [style, frames] of Object.entries(ROOM_WALL_FRAMES)) {
    frames.forEach(([x, y, w, h], mask) => sheet('room/room-walls').add(`${style}:${mask}`, 0, x, y, w, h));
  }
  for (const [id, frames] of Object.entries(OUTDOOR_FRAMES)) {
    frames.forEach(([x, y, w, h], n) => sheet('room/outdoor-decor').add(`${id}:${n}`, 0, x, y, w, h));
  }
}

export const WALL_DECOR_TEXTURE = 'room-wall-decor';

/** 구운 벽 그림 한 장의 자리: 그림 왼쪽 위가 벽 칸 기준점에서 (dx, dy) */
interface WallArt {
  dx: number;
  dy: number;
}
const wallArts = new Map<string, WallArt>();

/** 벽지·벽걸이 한 장을 한쪽 벽 기울기로 눕힌다. 그림 위아래 투명한 줄은 잘라 내고 dy로 옮긴다. */
function slant(id: BlockId, side: WallSide, pixels: Map<string, ImageData>) {
  const art = blockArt(id);
  if (art.kind !== 'paper' && art.kind !== 'hang') return null;
  const span = art.kind === 'hang' ? art.span : 1;
  const W = span * 16;
  const H = WALL_H + Math.floor((W - 1) / 2) + 1;
  let source = pixels.get(art.sheet);
  if (!source) {
    source = spritePixels(art.sheet);
    pixels.set(art.sheet, source);
  }
  const [fx, fy, fw, fh] = art.frame;
  const off = Math.floor((W - fw) / 2);
  const out = new Uint8ClampedArray(W * H * 4);
  let minY = H;
  let maxY = -1;
  for (let px = 0; px < W; px++) {
    // i: 벽을 따라 잰 칸 안 거리(오른쪽 벽은 화면 오른쪽으로, 왼쪽 벽은 화면 왼쪽으로 는다)
    const i = side === 'right' ? px : W - 1 - px;
    const col = art.kind === 'paper' ? px % 16 : px - off;
    if (col < 0 || col >= fw) continue;
    for (let r = 0; r < fh; r++) {
      const v = art.kind === 'paper' ? WALL_H - 1 - r : art.hang + (fh - 1 - r);
      if (v < 0 || v >= WALL_H) continue;
      const s = ((fy + r) * source.width + fx + col) * 4;
      if (source.data[s + 3] === 0) continue;
      const y = Math.floor(i / 2) + WALL_H - 1 - v;
      const d = (y * W + px) * 4;
      out[d] = source.data[s];
      out[d + 1] = source.data[s + 1];
      out[d + 2] = source.data[s + 2];
      out[d + 3] = source.data[s + 3];
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxY < 0) return null;
  const h = maxY - minY + 1;
  return { w: W, h, data: out.subarray(minY * W * 4, (maxY + 1) * W * 4), dx: side === 'right' ? 0 : -W, dy: minY - (WALL_H - 1) };
}

/** 벽지·벽걸이를 양쪽 벽 기울기로 모두 구운 텍스처를 한 번 만든다(맵에 처음 붙일 때). 프레임 이름은 'id:right', 'id:left'. */
export function ensureWallDecorTexture(scene: Phaser.Scene) {
  if (scene.textures.exists(WALL_DECOR_TEXTURE)) return;
  const pixels = new Map<string, ImageData>();
  const pieces: { name: string; w: number; h: number; data: Uint8ClampedArray; dx: number; dy: number; x: number; y: number }[] = [];
  for (const id of BLOCK_IDS) {
    const kind = BLOCKS[id].art.kind;
    if (kind !== 'paper' && kind !== 'hang') continue;
    for (const side of ['right', 'left'] as const) {
      const piece = slant(id, side, pixels);
      if (piece) pieces.push({ name: `${id}:${side}`, ...piece, x: 0, y: 0 });
    }
  }
  // 높은 것부터 가로 1024px 줄에 채운다(1px 띄움).
  const WIDTH = 1024;
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const p of [...pieces].sort((a, b) => b.h - a.h)) {
    if (x + p.w > WIDTH) {
      x = 0;
      y += rowH + 1;
      rowH = 0;
    }
    p.x = x;
    p.y = y;
    x += p.w + 1;
    rowH = Math.max(rowH, p.h);
  }
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = Math.max(1, y + rowH);
  const context = canvas.getContext('2d')!;
  for (const p of pieces) context.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.w, p.h), p.x, p.y);
  const texture = scene.textures.addCanvas(WALL_DECOR_TEXTURE, canvas)!;
  for (const p of pieces) {
    texture.add(p.name, 0, p.x, p.y, p.w, p.h);
    wallArts.set(p.name, { dx: p.dx, dy: p.dy });
  }
}

/** 벽지·벽걸이 그림을 벽 칸에 맞춘다. 그림이 없으면 false */
export function placeWallDecor(image: Phaser.GameObjects.Image, id: BlockId, cell: WallCell) {
  const name = `${id}:${cell.side}`;
  const at = wallArts.get(name);
  if (!at) return false;
  const base = wallBase(cell);
  image.setTexture(WALL_DECOR_TEXTURE, name).setOrigin(0, 0).setPosition(base.x + at.dx, base.y + at.dy);
  return true;
}

/** 벽걸이가 벽을 따라 차지하는 칸 수와 높이 범위(바닥에서 px). 벽지는 null */
export function hangExtent(id: BlockId) {
  const art = blockArt(id);
  if (art.kind !== 'hang') return null;
  return { span: art.span, low: art.hang, high: art.hang + art.frame[3] };
}
