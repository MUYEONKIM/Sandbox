import { hash2, Rng } from '../art/pixels';
import type { SpriteName } from '../art/sprites';
import { MAP_SIZE } from '../config';
import type { Building } from './map';
import { BOARD, CASTLE, COOP, EXCHANGE, GUIDEPOSTS, PORTAL_MARGIN, FAME, isInside, OFFICE, portalsOf, SHOP, TAVERN, type Area } from './maps';
import type { Tile } from './world';

/** tiles.png의 타일 번호 */
const PAVING = [63, 63, 63, 63, 61];
const HEDGES = [27, 28];
const FLOWERS = [41, 44, 46, 47];

/** 시드를 고정해야 모든 플레이어에게 같은 마을이 보이고 충돌 판정도 같아진다. */
const SEED = 7919;

/**
 * 시작마을은 중요한 건물만 두고 장식을 최소로 한다(2026-11-11 사용자 요청 "너무 많이 꾸며져 있다").
 * 블록과 꾸미기를 누구나 어디에나 놓을 수 있으니 빈 땅을 넉넉히 남긴다.
 */
const TREE_COUNT = 6;
const FLOWER_COUNT = 18;
const SLIM_TREES: SpriteName[] = ['pinetree', 'firtree'];
const ALL_TREES: SpriteName[] = ['pinetree', 'firtree', 'oaktree'];

/**
 * 나무는 화면 위쪽으로 솟아 뒤에 있는 것을 가린다. 품이 넓은 참나무는
 * 뒤에 가릴 것이 적은 맵 안쪽 귀퉁이(x + y가 작은 곳)에만 심는다.
 */
const OAK_LINE = 30;


/**
 * 길은 모두 같은 돌길이다(2026-11-15 사용자 요청 "도로 색깔이 다르다"). 건물은 성 둘레 네 방향에 고루 나눴다(같은 날 "건물이 다
 * 상단에 몰려 있다"): 위쪽 노동청, 오른쪽 농협(농장 길 옆), 아래쪽 도박장(던전 길 옆), 왼쪽 상점과 증권거래소(전쟁터 길 옆).
 * 자리는 에이전트가 정했다.
 */
const STONE_ROADS: Area[] = [
  // 성문 앞 광장
  [29, 19, 33, 28],
  // 명예의 전당과 게시판 간판 앞으로
  [34, 21, 37, 22],
  [34, 26, 37, 27],
  // 성을 두르는 길
  [14, 14, 33, 15],
  [14, 32, 33, 33],
  [14, 14, 15, 33],
  [32, 14, 33, 33],
  // 노동청: 성을 두르는 길 왼쪽 위 귀퉁이에서 위로, 다시 왼쪽으로
  [14, 6, 15, 13],
  [10, 6, 13, 7],
  // 상점: 왼쪽 변에서 왼쪽으로
  [3, 25, 13, 26],
  // 증권거래소: 전쟁터 길에서 왼쪽으로
  [5, 39, 13, 40],
  // 농협: 농장 길에서 오른쪽으로
  [34, 10, 40, 11],
  // 도박장: 던전 길에서 위로
  [42, 37, 43, 42],
  // 농장(오른쪽 귀퉁이)
  [32, 1, 33, 13],
  [32, 1, 44, 2],
  // 전쟁터(왼쪽 귀퉁이)
  [14, 34, 15, 44],
  [1, 43, 15, 44],
  // 던전 입장(아래 귀퉁이)
  [32, 34, 33, 44],
  [34, 43, 44, 44],
];

/** 아이티공간, 상점, 노동청 말고 세운 건물: 도박장이 된 주점, 증권거래소 */
const BUILDINGS: Building[] = [
  { sprite: TAVERN.sprite, x: TAVERN.x, y: TAVERN.y, w: TAVERN.w, d: TAVERN.d },
  { sprite: COOP.sprite, x: COOP.x, y: COOP.y, w: COOP.w, d: COOP.d },
  { sprite: EXCHANGE.sprite, x: EXCHANGE.x, y: EXCHANGE.y, w: EXCHANGE.w, d: EXCHANGE.d },
];

const FIXED_TREES: Tree[] = [
  // 성문 양옆
  { sprite: 'pinetree', x: 30, y: 20 },
  { sprite: 'pinetree', x: 30, y: 27 },
  // 광장 오른쪽 잔디밭의 명예의 전당 간판과 게시판
  { sprite: FAME.sprite, x: FAME.x, y: FAME.y },
  { sprite: BOARD.sprite, x: BOARD.x, y: BOARD.y },
  // 귀퉁이 포탈 안내판
  ...GUIDEPOSTS.map(({ x, y }) => ({ sprite: 'board' as const, x, y })),
];

/** 울타리처럼 줄지어 심은 덤불: 성 앞 정원. 가운데는 지나다닐 수 있게 비운다. */
const HEDGE_ROWS: Area[] = [
  [18, 30, 22, 30],
  [24, 30, 28, 30],
];

/** 나무를 심지 않는 구역: 건물과 그 앞길 둘레 */
const TREELESS: Area[] = [
  [3, 3, 16, 13],
  [1, 14, 13, 28],
  [2, 30, 13, 41],
  [34, 3, 42, 12],
  [34, 34, 45, 45],
  [34, 19, 40, 28],
];


export function eachTile([x0, y0, x1, y1]: Area, visit: (x: number, y: number) => void) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) visit(x, y);
  }
}

export const tileIndex = (x: number, y: number) => x + y * MAP_SIZE;

/** 같은 칸에는 항상 같은 타일이 나오도록 좌표로 고른다. */
export function pickTile(tiles: number[], x: number, y: number) {
  return tiles[Math.floor(hash2(x, y) * tiles.length)];
}

export interface TileProp extends Tile {
  tile: number;
}

export interface Tree extends Tile {
  sprite: SpriteName;
}

export interface Scenery {
  /** 칸 번호 → 맵 기본 바닥 대신 까는 타일 */
  floorTiles: Map<number, number>;
  /** 칸 번호 → 바닥에 그려 넣어 밟고 지나갈 수 있는 타일 */
  decals: Map<number, number>;
  /** 칸을 차지하고 서 있는 타일 */
  props: TileProp[];
  /** 칸을 차지하고 서 있는 나무와 게시판 */
  trees: Tree[];
}

export interface Village extends Scenery {
  buildings: Building[];
  water: Tile[];
}

/** 칸을 차지해 가며 장식을 흩어 놓는 도구. 시드가 같으면 항상 같은 배치가 나온다. */
export function makePlot(seed: number) {
  const rng = new Rng(seed);
  /** 길, 건물, 물처럼 이미 쓰고 있는 칸 */
  const used = new Uint8Array(MAP_SIZE * MAP_SIZE);

  const mark = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE) used[tileIndex(x, y)] = 1;
  };
  const isFree = (x: number, y: number) => used[tileIndex(x, y)] === 0;

  /** 자기와 주변 8칸이 비어 있어야 한다. 그래서 흩어 놓은 장애물끼리 길을 막지 못한다. */
  const hasRoom = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        const inside = nx >= 0 && ny >= 0 && nx < MAP_SIZE && ny < MAP_SIZE;
        if (inside && !isFree(nx, ny)) return false;
      }
    }
    return true;
  };

  /** 조건에 맞는 칸을 골라 count개를 놓는다. */
  const scatter = (count: number, fits: (x: number, y: number) => boolean, place: (x: number, y: number) => void) => {
    let placed = 0;
    for (let tries = 0; placed < count && tries < count * 40; tries++) {
      const x = rng.int(0, MAP_SIZE - 1);
      const y = rng.int(0, MAP_SIZE - 1);
      if (!fits(x, y)) continue;
      place(x, y);
      mark(x, y);
      placed++;
    }
  };

  return { rng, mark, isFree, hasRoom, scatter };
}

/** 시작마을: 성을 두른 돌길, 포탈로 가는 흙길, 성 앞 정원, 드문드문한 나무와 꽃 */
export function layoutVillage(): Village {
  const { rng, mark, isFree, hasRoom, scatter } = makePlot(SEED);
  const floorTiles = new Map<number, number>();
  const decals = new Map<number, number>();
  const props: TileProp[] = [];
  const trees: Tree[] = [...FIXED_TREES];

  for (const area of STONE_ROADS) {
    eachTile(area, (x, y) => {
      floorTiles.set(tileIndex(x, y), pickTile(PAVING, x, y));
      mark(x, y);
    });
  }

  for (const { x, y, w, d } of [OFFICE, CASTLE, SHOP, ...BUILDINGS]) eachTile([x, y, x + w - 1, y + d - 1], mark);

  for (const portal of portalsOf('plains')) {
    const c = PORTAL_MARGIN;
    eachTile([portal.x - c, portal.y - c, portal.x + c, portal.y + c], mark);
    mark(portal.landing.x, portal.landing.y);
  }

  for (const { x, y } of FIXED_TREES) mark(x, y);
  for (const area of HEDGE_ROWS) {
    eachTile(area, (x, y) => {
      props.push({ x, y, tile: pickTile(HEDGES, x, y) });
      mark(x, y);
    });
  }

  const canPlant = (x: number, y: number) => hasRoom(x, y) && !TREELESS.some((area) => isInside(area, x, y));
  scatter(TREE_COUNT, canPlant, (x, y) => {
    trees.push({ x, y, sprite: rng.pick(x + y < OAK_LINE ? ALL_TREES : SLIM_TREES) });
  });
  scatter(FLOWER_COUNT, isFree, (x, y) => decals.set(tileIndex(x, y), rng.pick(FLOWERS)));

  return { floorTiles, decals, props, trees, buildings: BUILDINGS, water: [] };
}
