import { APARTMENT, APARTMENT_SITES, FIRST_DONG, PORTAL_MARGIN, portalsOf, type Area } from './maps';
import type { Building } from './map';
import {
  eachTile,
  FLOWERS,
  HEDGES,
  makePlot,
  PAVING,
  pickTile,
  SLIM_TREES,
  tileIndex,
  WEEDS,
  type Scenery,
  type TileProp,
  type Tree,
} from './village';

const SEED = 4177;
const TREE_COUNT = 12;
const FLOWER_COUNT = 40;
const WEED_COUNT = 24;

/** 단지 안의 길: 포탈 앞, 서쪽 길, 동마다 앞을 지나는 길, 가운데 길, 동쪽 길 */
const ROADS: Area[] = [
  [1, 1, 4, 2],
  [3, 1, 4, 38],
  [3, 13, 41, 14],
  [3, 25, 41, 26],
  [3, 37, 41, 38],
  [22, 13, 23, 38],
  [40, 13, 41, 38],
];

export interface Residence extends Scenery {
  buildings: Building[];
}

/** 주거단지: 행복 아파트와 단지 안의 길, 나무, 꽃을 배치한다. */
export function layoutResidence(): Residence {
  const { rng, mark, isFree, hasRoom, scatter } = makePlot(SEED);
  const floorTiles = new Map<number, number>();
  const decals = new Map<number, number>();
  const props: TileProp[] = [];
  const trees: Tree[] = [];

  for (const area of ROADS) {
    eachTile(area, (x, y) => {
      floorTiles.set(tileIndex(x, y), pickTile(PAVING, x, y));
      mark(x, y);
    });
  }

  const buildings = APARTMENT_SITES.map(({ x, y }, index): Building => {
    const { sprite, w, d } = APARTMENT;
    eachTile([x, y, x + w - 1, y + d - 1], mark);
    // 현관 오른쪽의 덤불. 왼쪽까지 심으면 위쪽 방향키를 누른 채 오다가 현관 앞에 갇힌다.
    eachTile([x + 6, y + d, x + w - 1, y + d], (hx, hy) => {
      props.push({ x: hx, y: hy, tile: pickTile(HEDGES, hx, hy) });
      mark(hx, hy);
    });
    return { sprite, x, y, w, d, label: `행복 아파트 ${FIRST_DONG + index}동` };
  });

  for (const { x, y, landing } of portalsOf('residence')) {
    const c = PORTAL_MARGIN;
    eachTile([x - c, y - c, x + c, y + c], mark);
    mark(landing.x, landing.y);
  }

  scatter(TREE_COUNT, hasRoom, (x, y) => trees.push({ x, y, sprite: rng.pick(SLIM_TREES) }));
  scatter(FLOWER_COUNT, isFree, (x, y) => decals.set(tileIndex(x, y), rng.pick(FLOWERS)));
  scatter(WEED_COUNT, isFree, (x, y) => decals.set(tileIndex(x, y), rng.pick(WEEDS)));

  return { floorTiles, decals, props, trees, buildings };
}
