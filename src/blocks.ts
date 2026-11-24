import { hash2 } from './art/pixels';
import { sprite, type SpriteName } from './art/sprites';
import { paintCube } from './art/cube';
import { BLOCK_HEIGHT } from './config';
import { FURNITURE_BLOCKS, FURNITURE_NEXT } from './furniture';
import { OUTDOOR_FRAMES, ROOM_BLOCKS, ROOM_NEXT, ROOM_WALL_FRAMES } from './roomDecor';

/** tiles.png는 32×32 칸이 가로 11개씩 놓인 그림이다. */
const TILE_CELL = 32;
const TILE_COLUMNS = 11;

/**
 * 블록 그림의 종류.
 * cube: block-textures.png의 텍스처 칸으로 그린 상자(기본 블록). 그 위에 다른 블록을 쌓을 수 있다. side는 옆면 텍스처.
 * sprite: public/sprites의 그림 한 장을 칸 위에 세운다(나무, 가구).
 * tile: tiles.png의 칸 그림이고, 같은 칸에는 늘 같은 그림이 나오도록 위치로 하나를 고른다(꽃, 바위 등).
 * furniture: furniture.png 한 장 안의 한 자리(사용자가 준 실내 꾸미기 에셋, src/furniture.ts).
 *   frame은 [x, y, 너비, 높이, 차지하는 칸들의 가운데에 맞출 점 x, y, 차지하는 칸 수 x 방향, y 방향]이다.
 */
export type Frame = readonly [number, number, number, number, number, number, number, number];

/**
 * 방 꾸미기(2026-11-24, src/roomDecor.ts) 그림 종류.
 * room: 장식품 시트의 한 자리(furniture와 같은 frame). slot floor 바닥 가구, rug 바닥 깔개(지나감), top 다른 것 위에도 올리는 작은 소품.
 * paper: 벽지(뒤쪽 벽 칸에 붙임, 16 × 76 무늬). hang: 벽걸이(뒤쪽 벽 칸에 검, 납작한 앞모습, hang은 바닥에서 그림 아래 끝 px, span은 벽을 따라 칸 수).
 * pwall: 놓는 벽(칸 가운데를 지나는 얇은 판, 이음 모양 16칸은 ROOM_WALL_FRAMES). ftile: 바닥 타일(z 0에만, 윗면 0).
 * outdoor: 바깥용 장식품의 새 그림(OUTDOOR_FRAMES, 칸 자리로 하나를 고름).
 */
export type RoomSheet = 'room/room-decor' | 'room/room-decor-more';
export type BlockArt =
  | { kind: 'cube'; texture: number; side?: number }
  | { kind: 'sprite'; sprite: SpriteName }
  | { kind: 'tile'; tiles: readonly number[] }
  | { kind: 'furniture'; frame: Frame }
  | { kind: 'room'; sheet: RoomSheet; slot: 'floor' | 'rug' | 'top'; frame: Frame }
  | { kind: 'paper'; sheet: 'room/wall-textures' | 'room/wall-textures-more'; frame: readonly [number, number, number, number] }
  | { kind: 'hang'; sheet: RoomSheet; frame: Frame; hang: number; span: number }
  | { kind: 'pwall'; style: string; axis: 'x' | 'y' }
  | { kind: 'ftile'; frame: Frame }
  | { kind: 'outdoor' };

interface BlockInfo {
  name: string;
  /** true면 캐릭터가 지나갈 수 없고 총알도 막는다. */
  solid: boolean;
  art: BlockArt;
  /** 윗면 높이(아트 px). 있으면 그 위에 올릴 수 있다. 0은 바닥 타일·얇은 깔개처럼 납작해서 그 위가 바닥과 같다. 상자는 BLOCK_HEIGHT. */
  top?: number;
  /** 다른 것의 윗면에 올리는 작은 소품 */
  onTop?: boolean;
  /** 놓는 벽: 점프로 넘지 못한다(맵 벽 partitions와 같음). */
  wall?: boolean;
}

/** 바깥용 장식품 21개(2026-11-24 같은 id·크기·막힘에 새 그림, 디자인 세션 3). 맵에 박힌 고정 장식은 옛 그림 그대로다. */
const outdoor = (name: string, solid: boolean) => ({ name, solid, art: { kind: 'outdoor' } }) as const;

/**
 * 놓을 수 있는 블록 목록. 새 블록은 여기에 한 줄 추가하면 인벤토리, 설치, 충돌에 모두 반영된다.
 * 상점에서 팔려면 DB의 shop_items 표에도 같은 id로 가격을 넣는다.
 */
export const BLOCKS = {
  stone: { name: '돌벽', solid: true, art: { kind: 'cube', texture: 0 } },
  brick: { name: '벽돌벽', solid: true, art: { kind: 'cube', texture: 1 } },
  wood: { name: '나무벽', solid: true, art: { kind: 'cube', texture: 2 } },
  hedge: { name: '덤불벽', solid: true, art: { kind: 'cube', texture: 3 } },
  cobble: { name: '조약돌', solid: true, art: { kind: 'cube', texture: 4 } },
  dirt: { name: '흙', solid: true, art: { kind: 'cube', texture: 5 } },
  grass: { name: '잔디', solid: true, art: { kind: 'cube', texture: 6, side: 7 } },
  sand: { name: '모래', solid: true, art: { kind: 'cube', texture: 8 } },
  glass: { name: '유리', solid: true, art: { kind: 'cube', texture: 9 } },
  snow: { name: '눈 블록', solid: true, art: { kind: 'cube', texture: 10 } },
  white_block: { name: '흰 블록', solid: true, art: { kind: 'cube', texture: 11 } },
  black_block: { name: '검은 블록', solid: true, art: { kind: 'cube', texture: 12 } },
  red_block: { name: '빨간 블록', solid: true, art: { kind: 'cube', texture: 13 } },
  blue_block: { name: '파란 블록', solid: true, art: { kind: 'cube', texture: 14 } },
  yellow_block: { name: '노란 블록', solid: true, art: { kind: 'cube', texture: 15 } },
  // 2026-11-12 사용자 요청 "블록 추가해 줘": 텍스처 묶음에서 쓰지 않던 무늬로 만든 상자 블록. texture 번호는 art-source/textures/make-sheet.cjs의 순서다.
  mossy_stone: { name: '이끼 돌벽', solid: true, art: { kind: 'cube', texture: 17 } },
  marble: { name: '대리석', solid: true, art: { kind: 'cube', texture: 18 } },
  ice: { name: '얼음', solid: true, art: { kind: 'cube', texture: 19 } },
  water: { name: '물 블록', solid: true, art: { kind: 'cube', texture: 20 } },
  lava: { name: '용암 블록', solid: true, art: { kind: 'cube', texture: 21 } },
  birch: { name: '자작나무 벽', solid: true, art: { kind: 'cube', texture: 22 } },
  cactus: { name: '선인장', solid: true, art: { kind: 'cube', texture: 23 } },
  gold_ore: { name: '금광석', solid: true, art: { kind: 'cube', texture: 24 } },
  diamond_ore: { name: '다이아 광석', solid: true, art: { kind: 'cube', texture: 25 } },
  ruby_ore: { name: '루비 광석', solid: true, art: { kind: 'cube', texture: 26 } },
  crate: { name: '나무 궤짝', solid: true, art: { kind: 'cube', texture: 27 } },
  bookshelf: { name: '책장', solid: true, art: { kind: 'cube', texture: 28 } },
  fireplace: { name: '벽난로', solid: true, art: { kind: 'cube', texture: 29 } },
  lamp: { name: '조명', solid: true, art: { kind: 'cube', texture: 30 } },
  jack_lantern: { name: '호박등', solid: true, art: { kind: 'cube', texture: 31 } },
  strawberry: { name: '딸기 블록', solid: true, art: { kind: 'cube', texture: 32 } },
  mushroom: { name: '버섯 블록', solid: true, art: { kind: 'cube', texture: 33 } },
  chocolate: { name: '초콜릿 블록', solid: true, art: { kind: 'cube', texture: 34 } },
  cookie: { name: '쿠키 블록', solid: true, art: { kind: 'cube', texture: 35 } },
  mint_choco: { name: '민트초코 블록', solid: true, art: { kind: 'cube', texture: 36 } },
  honeycomb: { name: '벌집', solid: true, art: { kind: 'cube', texture: 37 } },
  hazard: { name: '공사 줄무늬', solid: true, art: { kind: 'cube', texture: 38 } },
  target: { name: '과녁', solid: true, art: { kind: 'cube', texture: 39 } },
  checker: { name: '체크무늬', solid: true, art: { kind: 'cube', texture: 40 } },
  green_block: { name: '초록 블록', solid: true, art: { kind: 'cube', texture: 41 } },
  orange_block: { name: '주황 블록', solid: true, art: { kind: 'cube', texture: 42 } },
  sky_block: { name: '하늘색 블록', solid: true, art: { kind: 'cube', texture: 43 } },
  pink_block: { name: '분홍 블록', solid: true, art: { kind: 'cube', texture: 44 } },
  purple_block: { name: '보라 블록', solid: true, art: { kind: 'cube', texture: 45 } },
  light_wood: { name: '밝은 나무판', solid: true, art: { kind: 'cube', texture: 46 } },
  hay: { name: '짚단', solid: true, art: { kind: 'cube', texture: 47 } },
  // 바깥용 장식품: 2026-11-12에 tiles.png·맵 소품 그림으로 만들었고, 2026-11-24에 같은 id·크기·막힘으로 새로 그렸다(outdoor-decor.png).
  oak: outdoor('참나무', true),
  pine: outdoor('소나무', true),
  fir: outdoor('전나무', true),
  flower: outdoor('꽃', false),
  weed: outdoor('풀', false),
  rock: outdoor('바위', true),
  log: outdoor('통나무', true),
  bush: outdoor('작은 덤불', true),
  leafy_bush: outdoor('넓은잎 덤불', true),
  thicket: outdoor('풀숲', true),
  red_rock: outdoor('붉은 바위', true),
  rubble: outdoor('돌무더기', true),
  spire_rock: outdoor('뾰족 바위', true),
  signboard: outdoor('나무 간판', true),
  water_rock: outdoor('물가 바위', true),
  stepping_stone: outdoor('징검돌', false),
  gravel_mound: outdoor('자갈 흙더미', true),
  vine_mound: outdoor('덩굴 흙더미', true),
  cafe_table: outdoor('카페 테이블', true),
  plant: outdoor('화분', true),
  // 2026-11-16 사용자 "빛나는 가로등을 플레이어도 설치": 바깥 맵에서 밤에 빛난다(src/game/lights.ts). 새 그림의 등 머리는 칸 가운데 위 37px이다.
  street_lamp: outdoor('가로등', true),
  // 2026-11-13 사용자 요청 "데코 에셋도 장식품으로": 가구 91종(방향마다 한 블록). 목록은 art-source/deco/make-furniture.cjs가 만든다.
  // 2026-11-24부터 인벤토리 탭에는 내지 않는다(옛 가구). 놓인 것은 그대로 보이고 회수할 수 있다.
  ...FURNITURE_BLOCKS,
  // 2026-11-24 방 꾸미기 새 장식품(rd_, src/roomDecor.ts)
  ...ROOM_BLOCKS,
} as const satisfies Record<string, BlockInfo>;

export type BlockId = keyof typeof BLOCKS;

export const BLOCK_IDS = Object.keys(BLOCKS) as BlockId[];

/** 상자 모양의 기본 블록. 위에 다른 블록을 쌓을 수 있다. */
export const CUBE_IDS = BLOCK_IDS.filter((id) => BLOCKS[id].art.kind === 'cube');

export function blockArt(id: BlockId): BlockArt {
  return BLOCKS[id].art as BlockArt;
}

export function isCube(id: BlockId) {
  return BLOCKS[id].art.kind === 'cube';
}

/** 옛 가구(f_, 2026-11-13). 2026-11-24부터 인벤토리 탭에 내지 않는다. */
export function isFurniture(id: BlockId) {
  return BLOCKS[id].art.kind === 'furniture';
}

const infoOf = (id: BlockId): BlockInfo => BLOCKS[id];

/** 윗면 높이(아트 px). 상자는 BLOCK_HEIGHT, 윗면이 없으면 null(그 위에 놓지 못함). */
export function topOf(id: BlockId): number | null {
  if (isCube(id)) return BLOCK_HEIGHT;
  return infoOf(id).top ?? null;
}

/** 바닥 타일·얇은 깔개(윗면 0): 그 위가 바닥과 같아 무엇이든 놓는다. */
export function isFlat(id: BlockId) {
  return topOf(id) === 0;
}

/** 다른 것의 윗면에 올리는 작은 소품 */
export function isOnTop(id: BlockId) {
  return !!infoOf(id).onTop;
}

/** 바닥 타일(z 0에만 놓음) */
export function isFloorTile(id: BlockId) {
  return BLOCKS[id].art.kind === 'ftile';
}

/** 뒤쪽 벽 칸에 붙이는 것(벽지, 벽걸이) */
export function isWallDecor(id: BlockId) {
  const { kind } = BLOCKS[id].art;
  return kind === 'paper' || kind === 'hang';
}

/** 벽지(뒤쪽 벽 칸이나 놓는 벽 위에 바름) */
export function isPaper(id: BlockId) {
  return BLOCKS[id].art.kind === 'paper';
}

/** 놓는 벽(점프로 넘지 못함) */
export function isPlacedWall(id: BlockId) {
  return !!infoOf(id).wall;
}

/** 바닥에 깔리는 것(방석·러그·카펫·꽃처럼 바닥 바로 위에 그려 캐릭터가 위로 지나감) */
export function isRug(id: BlockId) {
  const art = blockArt(id);
  if (art.kind === 'room') return art.slot === 'rug';
  if (art.kind === 'furniture') return !BLOCKS[id].solid;
  return false;
}

/**
 * below 위(같은 칸 바로 위 z)에 id를 쌓을 수 있는지(2026-11-24 장식품 위에 장식품).
 * 상자 위에는 지금처럼 한 칸짜리 무엇이든, 윗면 0(바닥 타일·얇은 깔개) 위에는 바닥처럼 무엇이든(깔개 위 깔개는 빼고),
 * 그 밖의 윗면(탁자, 의자, 방석 등) 위에는 작은 소품만 올린다. 바닥 타일·벽지·벽걸이는 쌓지 않는다.
 */
export function canStackOn(below: BlockId, id: BlockId) {
  // 벽지는 놓는 벽 바로 위에 바른다(2026-11-25 사용자 "내가 세운 벽에도 벽지를"). 유리 칸막이에는 바르지 않는다(PM이 정함).
  if (isPaper(id)) {
    const art = BLOCKS[below].art;
    return art.kind === 'pwall' && art.style !== 'rd_wall_glass';
  }
  if (isFloorTile(id) || isWallDecor(id) || isWallDecor(below)) return false;
  const top = topOf(below);
  if (top === null) return false;
  if (top === 0) return !(isRug(below) && isRug(id));
  if (isCube(below)) return !isLarge(id) && !isPlacedWall(id);
  return isOnTop(id);
}

/** 블록이 차지하는 칸들: 왼쪽 위(뒤) 모서리 칸 (x0, y0)에서 x 방향 a칸, y 방향 b칸 */
export interface Footprint {
  x0: number;
  y0: number;
  a: number;
  b: number;
}

/**
 * 칸 (x, y)에 놓은 블록이 차지하는 칸들. 큰 가구(2026-11-13 사용자 요청 "한 칸 블록이 아니어도 된다")는
 * 놓은 칸이 가운데쯤 오게 퍼진다(2×2는 놓은 칸이 뒤 모서리, 3×3은 한가운데). 다른 블록은 그 칸 하나다.
 */
export function footprintOf(id: BlockId, x: number, y: number): Footprint {
  const art = blockArt(id);
  if (art.kind !== 'furniture' && art.kind !== 'room') return { x0: x, y0: y, a: 1, b: 1 };
  const [, , , , , , a, b] = art.frame;
  return { x0: x - Math.floor((a - 1) / 2), y0: y - Math.floor((b - 1) / 2), a, b };
}

/** 한 칸보다 큰 블록인지. 큰 가구는 다른 블록 위에 쌓지 않는다. */
export function isLarge(id: BlockId) {
  const { a, b } = footprintOf(id, 0, 0);
  return a > 1 || b > 1;
}

/** 가구를 돌렸을 때(R) 바뀌는 다음 방향. 방향이 하나뿐이거나 가구가 아니면 null */
export function rotatedBlock(id: BlockId): BlockId | null {
  return ((FURNITURE_NEXT[id] ?? ROOM_NEXT[id]) as BlockId | undefined) ?? null;
}

/** tile 블록이 칸 (x, y)에서 쓰는 tiles.png 번호 */
export function blockTile(tiles: readonly number[], x: number, y: number) {
  return tiles[Math.floor(hash2(x, y) * tiles.length)];
}

/** 바깥용 장식품이 칸 (x, y)에서 쓰는 그림 번호(outdoor-decor.png의 variants 차례) */
export function outdoorVariant(id: BlockId, x: number, y: number) {
  const n = OUTDOOR_FRAMES[id]?.length ?? 1;
  return Math.floor(hash2(x, y) * n);
}

/** 바깥용 장식품의 칸 (x, y) 그림 frame */
export function outdoorFrame(id: BlockId, x: number, y: number): Frame {
  return OUTDOOR_FRAMES[id][outdoorVariant(id, x, y)] as unknown as Frame;
}

/** 놓는 벽의 이음 모양 mask 그림 */
export function wallFrame(style: string, mask: number): Frame {
  return ROOM_WALL_FRAMES[style][mask] as unknown as Frame;
}

/** 놓는 벽이 제 방향으로 늘 뻗는 이음 비트(x면 +x|−x, y면 +y|−y) */
export function wallAxisMask(axis: 'x' | 'y') {
  return axis === 'x' ? 1 | 2 : 4 | 8;
}

/** 시트 한 자리를 정사각형 캔버스 가운데에 그린다(아이콘). */
function frameIcon(image: CanvasImageSource, x: number, y: number, w: number, h: number) {
  const canvas = document.createElement('canvas');
  const size = Math.max(w, h);
  canvas.width = canvas.height = size;
  canvas.getContext('2d')!.drawImage(image, x, y, w, h, Math.floor((size - w) / 2), Math.floor((size - h) / 2), w, h);
  return canvas;
}

/** 기본 블록의 상자 그림. 기본 블록이 아니면 쓰지 않는다. */
export function paintBlock(id: BlockId): HTMLCanvasElement {
  const art = blockArt(id);
  return art.kind === 'cube' ? paintCube(art.texture, art.side) : paintCube(0);
}

/** 인벤토리와 상점에 쓰는 정사각형 아이콘 */
export function paintBlockIcon(id: BlockId): HTMLCanvasElement {
  const art = blockArt(id);
  if (art.kind === 'cube') return paintBlock(id);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  if (art.kind === 'tile') {
    canvas.width = canvas.height = TILE_CELL;
    const tile = art.tiles[0];
    const sx = (tile % TILE_COLUMNS) * TILE_CELL;
    const sy = Math.floor(tile / TILE_COLUMNS) * TILE_CELL;
    context.drawImage(sprite('tiles'), sx, sy, TILE_CELL, TILE_CELL, 0, 0, TILE_CELL, TILE_CELL);
    return canvas;
  }
  if (art.kind === 'furniture') {
    const [x, y, w, h] = art.frame;
    const size = Math.max(w, h);
    canvas.width = canvas.height = size;
    context.drawImage(sprite('furniture'), x, y, w, h, Math.floor((size - w) / 2), Math.floor((size - h) / 2), w, h);
    return canvas;
  }
  if (art.kind === 'room' || art.kind === 'hang') {
    const [x, y, w, h] = art.frame;
    return frameIcon(sprite(art.sheet), x, y, w, h);
  }
  if (art.kind === 'ftile') {
    const [x, y, w, h] = art.frame;
    return frameIcon(sprite('room/room-tiles'), x, y, w, h);
  }
  if (art.kind === 'pwall') {
    const [x, y, w, h] = wallFrame(art.style, wallAxisMask(art.axis));
    return frameIcon(sprite('room/room-walls'), x, y, w, h);
  }
  if (art.kind === 'outdoor') {
    const [x, y, w, h] = OUTDOOR_FRAMES[id][0];
    return frameIcon(sprite('room/outdoor-decor'), x, y, w, h);
  }
  if (art.kind === 'paper') {
    // 벽지는 16 × 76 무늬라 두 번 이어 붙여 아래(걸레받이 쪽) 32 × 32만 보인다.
    const [x, y, w, h] = art.frame;
    canvas.width = canvas.height = 32;
    for (const dx of [0, 16]) context.drawImage(sprite(art.sheet), x, y + h - 32, w, 32, dx, 0, 16, 32);
    return canvas;
  }
  const image = sprite(art.sprite);
  const size = Math.max(image.width, image.height);
  canvas.width = canvas.height = size;
  context.drawImage(image, Math.floor((size - image.width) / 2), size - image.height);
  return canvas;
}
