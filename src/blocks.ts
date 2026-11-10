import { hash2 } from './art/pixels';
import { sprite, type SpriteName } from './art/sprites';
import { paintCube } from './art/cube';

/** tiles.png는 32×32 칸이 가로 11개씩 놓인 그림이다. */
const TILE_CELL = 32;
const TILE_COLUMNS = 11;

/**
 * 블록 그림의 종류.
 * wall: block-textures.png의 텍스처 한 칸으로 그린 상자. 그 위에 다른 블록을 쌓을 수 있다.
 * sprite: public/sprites의 그림 한 장을 칸 위에 세운다(나무, 가구).
 * tile: tiles.png의 칸 그림이고, 같은 칸에는 늘 같은 그림이 나오도록 위치로 하나를 고른다(꽃, 바위 등).
 */
export type BlockArt =
  | { kind: 'wall'; texture: number }
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
  stone: { name: '돌벽', solid: true, art: { kind: 'wall', texture: 0 } },
  brick: { name: '벽돌벽', solid: true, art: { kind: 'wall', texture: 1 } },
  wood: { name: '나무벽', solid: true, art: { kind: 'wall', texture: 2 } },
  hedge: { name: '덤불벽', solid: true, art: { kind: 'wall', texture: 3 } },
  oak: { name: '참나무', solid: true, art: { kind: 'sprite', sprite: 'oaktree' } },
  pine: { name: '소나무', solid: true, art: { kind: 'sprite', sprite: 'pinetree' } },
  fir: { name: '전나무', solid: true, art: { kind: 'sprite', sprite: 'firtree' } },
  flower: { name: '꽃', solid: false, art: { kind: 'tile', tiles: [41, 44, 46, 47] } },
  weed: { name: '풀', solid: false, art: { kind: 'tile', tiles: [42, 43, 45] } },
  rock: { name: '바위', solid: true, art: { kind: 'tile', tiles: [64, 65, 67] } },
  log: { name: '통나무', solid: true, art: { kind: 'tile', tiles: [48, 49, 50, 51, 52] } },
  bush: { name: '작은 덤불', solid: true, art: { kind: 'tile', tiles: [27, 28] } },
  cafe_table: { name: '카페 테이블', solid: true, art: { kind: 'sprite', sprite: 'cafe-table' } },
  plant: { name: '화분', solid: true, art: { kind: 'sprite', sprite: 'plant' } },
} as const satisfies Record<string, BlockInfo>;

export type BlockId = keyof typeof BLOCKS;

export const BLOCK_IDS = Object.keys(BLOCKS) as BlockId[];

/** 상자 모양의 벽 블록. 가입할 때 공짜로 준다. */
export const WALL_IDS = BLOCK_IDS.filter((id) => BLOCKS[id].art.kind === 'wall');

export function blockArt(id: BlockId): BlockArt {
  return BLOCKS[id].art;
}

export function isWall(id: BlockId) {
  return BLOCKS[id].art.kind === 'wall';
}

/** tile 블록이 칸 (x, y)에서 쓰는 tiles.png 번호 */
export function blockTile(tiles: readonly number[], x: number, y: number) {
  return tiles[Math.floor(hash2(x, y) * tiles.length)];
}

/** 벽 블록의 상자 그림. 벽이 아니면 쓰지 않는다. */
export function paintBlock(id: BlockId): HTMLCanvasElement {
  const art = BLOCKS[id].art;
  return paintCube(art.kind === 'wall' ? art.texture : 0);
}

/** 인벤토리와 상점에 쓰는 정사각형 아이콘 */
export function paintBlockIcon(id: BlockId): HTMLCanvasElement {
  const art = BLOCKS[id].art;
  if (art.kind === 'wall') return paintBlock(id);
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
