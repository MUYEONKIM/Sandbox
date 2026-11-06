import { hash2, Rng } from '../art/pixels';
import type { SpriteName } from '../art/sprites';
import { MAP_SIZE } from '../config';
import type { Building } from './map';
import { CASTLE, FAME, isInside, OFFICE, portalsOf, SHOP, type Area } from './maps';
import type { Tile } from './world';

/** tiles.png의 타일 번호 */
const PAVING = [63, 63, 63, 63, 61];
const DIRT_ROAD = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const HEDGES = [27, 28];
const FLOWERS = [41, 44, 46, 47];
const WEEDS = [42, 43, 45];
const LOGS = [48, 49, 50, 51, 52];
const ROCKS = [64, 65, 67];

/** 시드를 고정해야 모든 플레이어에게 같은 마을이 보이고 충돌 판정도 같아진다. */
const SEED = 7919;

const TREE_COUNT = 14;
const LOG_COUNT = 3;
const ROCK_COUNT = 3;
const FLOWER_COUNT = 50;
const WEED_COUNT = 40;
const SLIM_TREES: SpriteName[] = ['pinetree', 'firtree'];
const ALL_TREES: SpriteName[] = ['pinetree', 'firtree', 'oaktree'];

/**
 * 나무는 화면 위쪽으로 솟아 뒤에 있는 것을 가린다. 품이 넓은 참나무는
 * 뒤에 가릴 것이 적은 맵 안쪽 귀퉁이(x + y가 작은 곳)에만 심는다.
 */
const OAK_LINE = 30;

/** 포탈 주변은 이만큼 비워 둔다. */
const PORTAL_CLEARANCE = 2;


const STONE_ROADS: Area[] = [
  // 성문 앞 광장과 시계탑으로 가는 길
  [29, 19, 33, 28],
  [34, 23, 37, 24],
  // 상점으로 가는 길
  [18, 12, 19, 13],
  // 성을 두르는 길
  [14, 14, 33, 15],
  [14, 32, 33, 33],
  [14, 14, 15, 33],
  [32, 14, 33, 33],
];

/** 성을 두르는 길에서 네 포탈로 이어지는 길 */
const DIRT_ROADS: Area[] = [
  // 사막
  [32, 1, 33, 13],
  [32, 1, 44, 2],
  // 화산
  [34, 32, 43, 33],
  [42, 32, 43, 44],
  [42, 43, 44, 44],
  // 숲
  [14, 34, 15, 44],
  [1, 43, 15, 44],
  // 노동청
  [6, 14, 13, 15],
  [6, 2, 7, 13],
  [5, 1, 7, 2],
];

/** 큰 건물은 뒤쪽을 가리므로 화면 세로줄(x - y)이 겹치지 않게 놓는다. */
const BUILDINGS: Building[] = [
  { sprite: 'fruit', x: 38, y: 17, w: 3, d: 3 },
  { sprite: 'tailor', x: 34, y: 26, w: 3, d: 3 },
  { sprite: 'clock', x: 38, y: 22, w: 4, d: 4 },
  { sprite: 'tavern', x: 41, y: 12, w: 4, d: 4 },
  { sprite: 'thatched', x: 37, y: 35, w: 4, d: 4 },
  { sprite: 'chapel', x: 36, y: 5, w: 5, d: 3 },
  { sprite: 'house', x: 27, y: 6, w: 3, d: 5 },
  { sprite: 'house', x: 10, y: 6, w: 3, d: 5 },
  { sprite: 'house', x: 33, y: 36, w: 3, d: 5 },
  { sprite: 'thatched', x: 9, y: 18, w: 4, d: 4 },
  { sprite: 'fish', x: 10, y: 37, w: 3, d: 3 },
  { sprite: 'crops', x: 18, y: 36, w: 4, d: 4 },
  { sprite: 'crops', x: 23, y: 36, w: 4, d: 4 },
  { sprite: 'crops', x: 28, y: 36, w: 4, d: 4 },
];

const FIXED_TREES: Tree[] = [
  // 성문 양옆
  { sprite: 'pinetree', x: 30, y: 20 },
  { sprite: 'pinetree', x: 30, y: 27 },
  { sprite: 'treehouse', x: 4, y: 20 },
  // 광장의 명예의 전당 게시판
  { sprite: FAME.sprite, x: FAME.x, y: FAME.y },
];

/** 울타리처럼 줄지어 심은 덤불 */
const HEDGE_ROWS: Area[] = [
  // 성 앞 정원. 가운데는 지나다닐 수 있게 비운다.
  [18, 30, 22, 30],
  [24, 30, 28, 30],
  // 광장 양쪽
  [29, 18, 31, 18],
  [29, 29, 31, 29],
];

/** 뒤에 볼거리가 있어 나무를 심지 않는 구역: 밭 앞, 시장 앞, 상점 앞 */
const TREELESS: Area[] = [
  [16, 40, 41, 45],
  [34, 22, 45, 31],
  [16, 12, 31, 17],
];

const POND = { x: 6, y: 30, radius: 5 };


function eachTile([x0, y0, x1, y1]: Area, visit: (x: number, y: number) => void) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) visit(x, y);
  }
}

const tileIndex = (x: number, y: number) => x + y * MAP_SIZE;

/** 같은 칸에는 항상 같은 타일이 나오도록 좌표로 고른다. */
function pickTile(tiles: number[], x: number, y: number) {
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

/** 시작마을: 성을 두른 돌길, 포탈로 가는 흙길, 그 사이의 집과 나무, 꽃을 배치한다. */
export function layoutVillage(): Village {
  const rng = new Rng(SEED);
  const floorTiles = new Map<number, number>();
  const decals = new Map<number, number>();
  const props: TileProp[] = [];
  const trees: Tree[] = [...FIXED_TREES];
  const water: Tile[] = [];
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

  for (const area of STONE_ROADS) {
    eachTile(area, (x, y) => {
      floorTiles.set(tileIndex(x, y), pickTile(PAVING, x, y));
      mark(x, y);
    });
  }
  for (const area of DIRT_ROADS) {
    eachTile(area, (x, y) => {
      floorTiles.set(tileIndex(x, y), pickTile(DIRT_ROAD, x, y));
      mark(x, y);
    });
  }

  for (const { x, y, w, d } of [OFFICE, CASTLE, SHOP, ...BUILDINGS]) eachTile([x, y, x + w - 1, y + d - 1], mark);

  for (const portal of portalsOf('plains')) {
    const c = PORTAL_CLEARANCE;
    eachTile([portal.x - c, portal.y - c, portal.x + c, portal.y + c], mark);
    mark(portal.landing.x, portal.landing.y);
  }

  const { x: px, y: py, radius } = POND;
  eachTile([px - radius, py - radius, px + radius, py + radius], (x, y) => {
    if (Math.hypot(x - px, y - py) > radius) return;
    water.push({ x, y });
    mark(x, y);
  });

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
  scatter(LOG_COUNT, hasRoom, (x, y) => props.push({ x, y, tile: rng.pick(LOGS) }));
  scatter(ROCK_COUNT, hasRoom, (x, y) => props.push({ x, y, tile: rng.pick(ROCKS) }));
  scatter(FLOWER_COUNT, isFree, (x, y) => decals.set(tileIndex(x, y), rng.pick(FLOWERS)));
  scatter(WEED_COUNT, isFree, (x, y) => decals.set(tileIndex(x, y), rng.pick(WEEDS)));

  return { floorTiles, decals, props, trees, buildings: BUILDINGS, water };
}
