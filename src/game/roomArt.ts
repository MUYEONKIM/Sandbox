import type Phaser from 'phaser';
import { BLOCK_IDS, BLOCKS, blockArt, layerSheet, tileSheet, wallFrame, wallSheet, type BlockId } from '../blocks';
import { WALL_H } from '../art/interior';
import { spritePixels, sprite, type SpriteName } from '../art/sprites';
import { gridToWorld } from '../iso';
import { OUTDOOR_FRAMES, ROOM_WALL_FRAMES } from '../roomDecor';
import { USE_LAYER_FRAMES, USE_WALL_FRAMES } from '../roomUse';
import { MORE_LAYER_FRAMES } from '../roomMore';
import { ANNEX, ANNEX_DOOR, BALCONY, BALCONY_LAMPS, FLOORS, type TowerId } from './tower';
import type { Tile } from './world';

/**
 * 방 꾸미기 장식품 그림(2026-11-24, 디자인 세션 3·5, src/roomDecor.ts).
 * - 장식품·놓는 벽·바닥 타일·바깥용 장식품: 시트 한 장마다 텍스처 하나에 블록 id(또는 'style:mask', 'id:n') 프레임을 단다.
 * - 벽지·벽걸이: 납작한 그림을 뒤쪽 벽 기울기(가로 1px에 0.5px, src/art/interior.ts Painter.wall과 같은 셈)로 눕힌 그림을
 *   처음 쓸 때 한 장(WALL_DECOR_TEXTURE)에 모두 구워 둔다. 왼쪽 벽은 화면 왼쪽부터 그림 열 차례로 읽어 뒤집히지 않게 한다.
 */

/**
 * 벽지·벽걸이를 붙이는 맵(사용자가 정함: 4·7·8층과 7층으로 나가는 포탈이 있는 빈방).
 * 발코니는 2026-11-27 사용자 "발코니쪽 벽면에 장식품 마찬가지로 달 수 있게": 뒤쪽 건물 외벽(오른쪽 벽)에만 벽걸이를 건다(벽지는 바르지 않음, WALL_PAPER_OFF).
 */
export const WALL_DECOR_MAPS: ReadonlySet<string> = new Set(['tower4', 'tower7', 'tower8', 'annex', 'balcony', 'hideout']);
/** 천장 것을 매다는 맵(지붕이 있는 맵). 발코니는 지붕이 없어 뺀다. */
export const CEIL_MAPS: ReadonlySet<string> = new Set(['tower4', 'tower7', 'tower8', 'annex', 'hideout']);
/** 한쪽 벽만 벽인 맵: 발코니는 뒤 왼쪽 변이 유리 난간이라 오른쪽 벽(건물 외벽)만 쓴다. */
const WALL_SIDES: Readonly<Record<string, WallSide>> = { balcony: 'right' };
/** 벽지를 바르지 않는 맵(제가 정한 것: 발코니 건물 외벽은 바탕 그림의 문·벽등을 덮지 않게 벽걸이만) */
export const WALL_PAPER_OFF: ReadonlySet<string> = new Set(['balcony']);

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
  const only = WALL_SIDES[mapId];
  if (y === y0 - 1 && x >= x0 && x <= x1 && only !== 'left') return { x, y, side: 'right' };
  if (x === x0 - 1 && y >= y0 && y <= y1 && only !== 'right') return { x, y, side: 'left' };
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
 * 벽지·벽걸이를 놓지 못하는 벽 칸: 벽 그림에 그려 넣은 문(엘리베이터 문과 옆 버튼, 8층 비상구) 자리. 맵 배치 규칙: 문은 가려지면 안 된다.
 * 칸 키는 "x,y"다. 벽 앞 바닥 포탈·도착 칸 뒤의 벽 칸은 막지 않는다(2026-11-27 사용자 "포탈이 있는곳에는 벽위의 장식품을 놓지 못한다. 이를 수정한다").
 * 바닥의 포탈·도착 칸에 물건을 놓지 못하는 것은 그대로다(world.ts isPortalArea). 빈방 발코니 문은 따로 그린 그림이라 벽걸이보다 앞에 그려 가리지 않는다.
 */
export function blockedWallCells(mapId: string): Set<string> {
  const blocked = new Set<string>();
  const floor = floorOf(mapId);
  if (!floor) return blocked;
  const [x0, y0] = floor.area;
  for (const door of floor.doorways) {
    const extra = door.kind === 'elevator' ? 2 : 1;
    for (let a = door.at - 1; a <= door.at + extra; a++) blocked.add(door.wall === 'right' ? `${a},${y0 - 1}` : `${x0 - 1},${a}`);
  }
  return blocked;
}

/**
 * 뒤쪽 벽 칸에 그려진, 가리면 안 되는 그림(빈방·발코니의 발코니 문, 발코니 벽등)의 위 끝 높이(px). 키는 벽 칸 "x,y".
 * 그 칸에 거는 벽걸이는 그 위로 올려 건다(backWallHang).
 */
const WALL_DOOR_TOPS: Readonly<Record<string, ReadonlyMap<string, number>>> = {
  annex: new Map(ANNEX_DOOR.x.map((x) => [`${x},${ANNEX[1] - 1}`, ANNEX_DOOR.top] as const)),
  balcony: new Map(
    [...ANNEX_DOOR.x.map((x) => x - ANNEX_DOOR.x[0] + BALCONY[0] + 5), ...BALCONY_LAMPS.x].map(
      (x) => [`${x},${BALCONY[1] - 1}`, x === BALCONY_LAMPS.x[0] || x === BALCONY_LAMPS.x[1] ? BALCONY_LAMPS.top : ANNEX_DOOR.top] as const,
    ),
  ),
};

/**
 * 뒤쪽 벽 칸 cell부터 벽을 따라 차지하는 칸에 건 벽걸이의 그림 아래 끝(바닥에서 px). 벽지는 null.
 * 차지하는 칸 중 문 칸(WALL_DOOR_TOPS)이 있으면 문 위 1px로 올린다(2026-11-27, 문이 가려지지도 벽걸이가 문 뒤에 숨지도 않게, 제가 정한 것).
 * 올린 그림이 벽(위 마감 3px 아래)에 들어가지 않으면 null이라 걸지 않는다.
 */
export function backWallHang(mapId: string, id: BlockId, cell: WallCell): number | null {
  const art = blockArt(id);
  if (art.kind !== 'hang') return null;
  const doors = WALL_DOOR_TOPS[mapId];
  let low = art.hang;
  for (let k = 0; doors && k < art.span; k++) {
    const c = wallNext(cell, k);
    const top = doors.get(`${c.x},${c.y}`);
    if (top !== undefined) low = Math.max(low, top + 1);
  }
  if (low === art.hang) return low;
  return low + art.frame[3] <= WALL_H - HANG_MARGIN ? low : null;
}

/** 화면 점 (wx, wy)가 가리키는 뒤쪽 벽 칸. 벽면(바닥에서 WALL_H px까지) 밖이면 null */
export function wallAtPoint(mapId: string, wx: number, wy: number): WallCell | null {
  const floor = floorOf(mapId);
  if (!floor) return null;
  const [x0, y0, x1, y1] = floor.area;
  const only = WALL_SIDES[mapId];
  const corner = gridToWorld(x0, y0);
  const right = Math.floor(wx - corner.x);
  if (right >= 0 && right < (x1 - x0 + 1) * 16 && only !== 'left') {
    const v = corner.y + Math.floor(right / 2) - wy;
    if (v >= 0 && v < WALL_H) return { x: x0 + Math.floor(right / 16), y: y0 - 1, side: 'right' };
  }
  const left = Math.floor(corner.x - 1 - wx);
  if (left >= 0 && left < (y1 - y0 + 1) * 16 && only !== 'right') {
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
  // 새 거리 시트: 새 벽·높은 벽·난간 이음 모양('재질:mask'), 구멍 벽과 문·창문·커튼 겹(USE_LAYER_FRAMES 이름 그대로)
  for (const [style, frames] of Object.entries(USE_WALL_FRAMES)) {
    frames.forEach(([x, y, w, h], mask) => sheet(wallSheet(style)).add(`${style}:${mask}`, 0, x, y, w, h));
  }
  for (const [name, [x, y, w, h]] of [...Object.entries(USE_LAYER_FRAMES), ...Object.entries(MORE_LAYER_FRAMES)]) sheet(layerSheet(name)).add(name, 0, x, y, w, h);
  for (const id of BLOCK_IDS) {
    const art = blockArt(id);
    if (art.kind === 'room') {
      const [x, y, w, h] = art.frame;
      sheet(art.sheet).add(id, 0, x, y, w, h);
    } else if (art.kind === 'ftile') {
      const [x, y, w, h] = art.frame;
      sheet(tileSheet(id)).add(id, 0, x, y, w, h);
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

/**
 * 벽걸이 그림을 높은 놓는 벽의 보이는 면에 맞춘다(2026-11-27 room-rules.md 13.2). side는 그 면의 기울기(x 방향 벽은 right, y 방향 벽은 left),
 * base는 그 면 아래 모서리의 뒤쪽 끝(월드 px)이다. 그림이 없으면 false
 */
export function placeWallDecorAt(image: Phaser.GameObjects.Image, id: BlockId, side: WallSide, base: { x: number; y: number }) {
  const name = `${id}:${side}`;
  const at = wallArts.get(name);
  if (!at) return false;
  image.setTexture(WALL_DECOR_TEXTURE, name).setOrigin(0, 0).setPosition(base.x + at.dx, base.y + at.dy);
  return true;
}

/** 벽지·벽걸이 그림을 벽 칸에 맞춘다. up은 그림을 디자인 높이보다 더 올리는 px(문 위로 올린 벽걸이). 그림이 없으면 false */
export function placeWallDecor(image: Phaser.GameObjects.Image, id: BlockId, cell: WallCell, up = 0) {
  const name = `${id}:${cell.side}`;
  const at = wallArts.get(name);
  if (!at) return false;
  const base = wallBase(cell);
  image.setTexture(WALL_DECOR_TEXTURE, name).setOrigin(0, 0).setPosition(base.x + at.dx, base.y + at.dy - up);
  return true;
}

const sheetPixels = new Map<string, ImageData>();
function pixelsOf(name: SpriteName) {
  let data = sheetPixels.get(name);
  if (!data) {
    data = spritePixels(name);
    sheetPixels.set(name, data);
  }
  return data;
}

/**
 * 놓는 벽에 바른 벽지 그림(2026-11-25 사용자 "내가 세운 벽에도 벽지를 바를 수 있게")의 텍스처 이름. 처음 쓸 때 한 장 만들어 두고 다시 쓴다.
 * 벽 시트의 그 이음 모양 그림을 복사해, 옆면(앞-왼쪽 면·앞-오른쪽 면) 픽셀만 벽지 무늬로 바꾼다. 윗면, 테두리(투명한 칸과 맞닿은 픽셀),
 * 반투명 픽셀(창문 벽 유리)은 그대로 둔다. 면은 칸 가운데를 지나는 두께 1/4칸 판(디자인 그림과 같은 틀)으로 셈해 고르고,
 * 무늬 열은 화면 x로 이어(옆 칸 벽과 이음매 없음), 높이는 벽지 아래쪽(걸레받이 포함)을 쓰고 맨 위 3줄은 벽지 마감이다.
 * 오른쪽 앞면은 0.82배로 어둡게 칠한다(상자 그림과 같은 빛 방향). 기준점은 벽 그림과 같다.
 */
export function paperedWallTexture(scene: Phaser.Scene, style: string, mask: number, paper: BlockId, height: number) {
  const key = `papered:${style}:${mask}:${paper}`;
  if (scene.textures.exists(key)) return key;
  const art = blockArt(paper);
  const [fx, fy, w, h, ax, ay] = wallFrame(style, mask);
  const wall = pixelsOf(wallSheet(style));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d')!;
  context.drawImage(sprite(wallSheet(style)), fx, fy, w, h, 0, 0, w, h);
  if (art.kind !== 'paper') {
    scene.textures.addCanvas(key, canvas);
    return key;
  }
  const out = context.getImageData(0, 0, w, h);
  const source = pixelsOf(art.sheet);
  const [px0, py0] = art.frame;
  const t = 0.125;
  const boxes: [number, number, number, number][] = [[-t, t, -t, t]];
  if (mask & 1) boxes.push([-t, 0.5, -t, t]);
  if (mask & 2) boxes.push([-0.5, t, -t, t]);
  if (mask & 4) boxes.push([-t, t, -t, 0.5]);
  if (mask & 8) boxes.push([-t, t, -0.5, t]);
  const within = (s: number, lo: number, hi: number) => s >= lo - 1e-6 && s <= hi + 1e-6;
  const alphaAt = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : wall.data[((fy + y) * wall.width + fx + x) * 4 + 3]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alphaAt(x, y) !== 255) continue;
      // 테두리: 네 이웃 중 하나라도 투명하면 그대로 둔다.
      if (alphaAt(x - 1, y) === 0 || alphaAt(x + 1, y) === 0 || alphaAt(x, y - 1) === 0 || alphaAt(x, y + 1) === 0) continue;
      const dx = (x + 0.5 - ax) / 16; // u − v
      const dy = y + 0.5 - ay; // (u + v) × 8 − z
      let best = -Infinity;
      let face: 'top' | 'left' | 'right' | null = null;
      let z = 0;
      for (const [u0, u1, v0, v1] of boxes) {
        const s = (dy + height) / 8;
        const tu = (s + dx) / 2;
        const tv = (s - dx) / 2;
        if (within(tu, u0, u1) && within(tv, v0, v1) && s > best) {
          best = s;
          face = 'top';
        }
        const lu = v1 + dx;
        const lz = (lu + v1) * 8 - dy;
        if (within(lu, u0, u1) && lz >= 0 && lz <= height && lu + v1 > best) {
          best = lu + v1;
          face = 'left';
          z = lz;
        }
        const rv = u1 - dx;
        const rz = (u1 + rv) * 8 - dy;
        if (within(rv, v0, v1) && rz >= 0 && rz <= height && u1 + rv > best) {
          best = u1 + rv;
          face = 'right';
          z = rz;
        }
      }
      if (face !== 'left' && face !== 'right') continue;
      const fromTop = Math.max(0, Math.min(height - 1, height - 1 - Math.floor(z)));
      const row = fromTop < 3 ? fromTop : WALL_H - height + fromTop;
      const col = (((x - ax) % 16) + 16) % 16;
      const s = ((py0 + row) * source.width + px0 + col) * 4;
      if (source.data[s + 3] === 0) continue;
      const k = face === 'right' ? 0.82 : 1;
      const d = (y * w + x) * 4;
      out.data[d] = Math.round(source.data[s] * k);
      out.data[d + 1] = Math.round(source.data[s + 1] * k);
      out.data[d + 2] = Math.round(source.data[s + 2] * k);
    }
  }
  context.putImageData(out, 0, 0);
  scene.textures.addCanvas(key, canvas);
  return key;
}

/** 벽걸이가 벽을 따라 차지하는 칸 수와 높이 범위(바닥에서 px). 벽지는 null */
export function hangExtent(id: BlockId) {
  const art = blockArt(id);
  if (art.kind !== 'hang') return null;
  return { span: art.span, low: art.hang, high: art.hang + art.frame[3] };
}

/** 벽걸이 그림 위아래로 남기는 벽 높이(px): 아래 걸레받이 쪽 3, 위 마감 3(디자인 세션 5: 낮은 벽 36은 hang + 그림 높이 ≤ 33) */
const HANG_MARGIN = 3;

/** 벽걸이를 거는 가장 낮은 놓는 벽 높이(디자인 세션 5 room-decor-4.md: 낮은 벽 36에는 걸고 난간·낮은 벽 18에는 걸지 않음) */
const HANG_MIN_WALL = 36;

/**
 * 높이 height px인 벽에 건 벽걸이 그림의 아래 끝(바닥에서 px). 그림이 그 벽에 들어가지 않으면 null.
 * 높은 벽(76, 뒤쪽 벽과 같은 높이)은 디자인 hang 그대로다. 낮은 놓는 벽(36, 2026-11-27 사용자 "우리가 세운 벽에도 장식품을")은
 * 디자인 hangLow(4차부터 항목마다 있음, null이면 못 검)를 쓴다. hangLow가 없는 앞 묶음 벽걸이는 76 벽에서 걸 수 있는 띠(3 ~ 73 − 그림 높이)를
 * 그 벽의 띠(3 ~ 높이 − 3 − 그림 높이)로 같은 비율로 줄인다(제가 정한 것). 띠 차례가 그대로라 겹쳐 걸어도 위아래가 뒤쪽 벽과 같다.
 */
export function hangOnWall(id: BlockId, height: number): number | null {
  const art = blockArt(id);
  if (art.kind !== 'hang') return null;
  if (height >= WALL_H) return art.hang;
  if (height < HANG_MIN_WALL) return null;
  if (art.low !== undefined) return art.low;
  const h = art.frame[3];
  const top = height - HANG_MARGIN - h;
  if (top < HANG_MARGIN) return null;
  const tallTop = Math.max(HANG_MARGIN + 1, WALL_H - HANG_MARGIN - h);
  const t = Math.min(1, Math.max(0, (art.hang - HANG_MARGIN) / (tallTop - HANG_MARGIN)));
  return HANG_MARGIN + Math.round(t * (top - HANG_MARGIN));
}
