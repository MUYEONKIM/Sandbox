import { hash2 } from './art/pixels';
import { sprite, type SpriteName } from './art/sprites';
import { paintCube } from './art/cube';

/** tiles.png는 32×32 칸이 가로 11개씩 놓인 그림이다. */
const TILE_CELL = 32;
const TILE_COLUMNS = 11;

/**
 * 블록 그림의 종류.
 * cube: block-textures.png의 텍스처 칸으로 그린 상자(기본 블록). 그 위에 다른 블록을 쌓을 수 있다. side는 옆면 텍스처.
 * sprite: public/sprites의 그림 한 장을 칸 위에 세운다(나무, 가구).
 * tile: tiles.png의 칸 그림이고, 같은 칸에는 늘 같은 그림이 나오도록 위치로 하나를 고른다(꽃, 바위 등).
 */
export type BlockArt =
  | { kind: 'cube'; texture: number; side?: number }
  | { kind: 'sprite'; sprite: SpriteName }
  | { kind: 'tile'; tiles: readonly number[] };

interface BlockInfo {
  name: string;
  /** true면 캐릭터가 지나갈 수 없고 총알도 막는다. */
  solid: boolean;
  art: BlockArt;
}

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
  oak: { name: '참나무', solid: true, art: { kind: 'sprite', sprite: 'oaktree' } },
  pine: { name: '소나무', solid: true, art: { kind: 'sprite', sprite: 'pinetree' } },
  fir: { name: '전나무', solid: true, art: { kind: 'sprite', sprite: 'firtree' } },
  flower: { name: '꽃', solid: false, art: { kind: 'tile', tiles: [41, 44, 46, 47] } },
  weed: { name: '풀', solid: false, art: { kind: 'tile', tiles: [42, 43, 45] } },
  rock: { name: '바위', solid: true, art: { kind: 'tile', tiles: [64, 65, 67] } },
  log: { name: '통나무', solid: true, art: { kind: 'tile', tiles: [48, 49, 50, 51, 52] } },
  bush: { name: '작은 덤불', solid: true, art: { kind: 'tile', tiles: [27, 28] } },
  // 2026-11-12: tiles.png에서 쓰지 않던 수풀과 바위
  leafy_bush: { name: '넓은잎 덤불', solid: true, art: { kind: 'tile', tiles: [29, 30, 31, 32] } },
  thicket: { name: '풀숲', solid: true, art: { kind: 'tile', tiles: [33, 34, 35, 36] } },
  red_rock: { name: '붉은 바위', solid: true, art: { kind: 'tile', tiles: [53, 54, 55, 56, 57, 58, 59, 60] } },
  rubble: { name: '돌무더기', solid: true, art: { kind: 'tile', tiles: [62] } },
  spire_rock: { name: '뾰족 바위', solid: true, art: { kind: 'tile', tiles: [66] } },
  cafe_table: { name: '카페 테이블', solid: true, art: { kind: 'sprite', sprite: 'cafe-table' } },
  plant: { name: '화분', solid: true, art: { kind: 'sprite', sprite: 'plant' } },
} as const satisfies Record<string, BlockInfo>;

export type BlockId = keyof typeof BLOCKS;

export const BLOCK_IDS = Object.keys(BLOCKS) as BlockId[];

/** 상자 모양의 기본 블록. 위에 다른 블록을 쌓을 수 있다. */
export const CUBE_IDS = BLOCK_IDS.filter((id) => BLOCKS[id].art.kind === 'cube');

export function blockArt(id: BlockId): BlockArt {
  return BLOCKS[id].art;
}

export function isCube(id: BlockId) {
  return BLOCKS[id].art.kind === 'cube';
}

/** tile 블록이 칸 (x, y)에서 쓰는 tiles.png 번호 */
export function blockTile(tiles: readonly number[], x: number, y: number) {
  return tiles[Math.floor(hash2(x, y) * tiles.length)];
}

/** 기본 블록의 상자 그림. 기본 블록이 아니면 쓰지 않는다. */
export function paintBlock(id: BlockId): HTMLCanvasElement {
  const art = blockArt(id);
  return art.kind === 'cube' ? paintCube(art.texture, art.side) : paintCube(0);
}

/** 인벤토리와 상점에 쓰는 정사각형 아이콘 */
export function paintBlockIcon(id: BlockId): HTMLCanvasElement {
  const art = BLOCKS[id].art;
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
  const image = sprite(art.sprite);
  const size = Math.max(image.width, image.height);
  canvas.width = canvas.height = size;
  context.drawImage(image, Math.floor((size - image.width) / 2), size - image.height);
  return canvas;
}
