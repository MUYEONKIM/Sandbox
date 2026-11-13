import type { BlockId } from '../blocks';
import { MAP_SIZE } from '../config';
import { PORTAL_MARGIN, portalsOf } from './maps';
import { makePlot, type Tree } from './village';

/**
 * 전쟁터(맵 id는 예전 이름 그대로 'forest'. 저장된 위치와 블록이 이 id를 쓴다)의 장애물 배치.
 * 2026-11-13 사용자 요청 "시작마을 좌측의 숲을 전쟁터로, 여러 지형지물로 장애물을". 시드가 같으면 늘 같은 배치다.
 * 장애물은 모두 지나갈 수 없고 총알과 손전등 빛을 막는다(src/game/vision.ts). 구덩이만 밟고 지나간다.
 */

const SEED = 4417;

export type BattleKind = 'sandbag' | 'hedgehog' | 'crater';

export interface BattleProp {
  kind: BattleKind;
  x: number;
  y: number;
}

export interface Battlefield {
  /** 블록 그림을 쓰는 박힌 장애물(무너진 벽돌 벽, 콘크리트 방벽, 탄약 상자, 돌무더기) */
  walls: { x: number; y: number; id: BlockId }[];
  /** 전쟁터 전용 그림(모래주머니, 대전차 장애물, 포탄 구덩이) */
  props: BattleProp[];
  /** 불탄 나무. 화면에서 어둡게 칠한다. */
  trees: Tree[];
}

/** 장애물 묶음 하나의 칸들. (0, 0)을 기준으로 한 상대 위치와 무엇을 놓을지 */
type Piece = [number, number, BlockId | BattleKind];
type Cluster = Piece[];

const SANDBAG_NEST: Cluster = [
  [0, 0, 'sandbag'],
  [1, 0, 'sandbag'],
  [2, 0, 'sandbag'],
  [0, 1, 'sandbag'],
  [0, 2, 'sandbag'],
];
const SANDBAG_LINE: Cluster = [
  [0, 0, 'sandbag'],
  [1, 0, 'sandbag'],
  [2, 0, 'sandbag'],
  [3, 0, 'sandbag'],
];
const BRICK_RUIN: Cluster = [
  [0, 0, 'brick'],
  [1, 0, 'brick'],
  [2, 0, 'brick'],
  [3, 0, 'rubble'],
  [0, 1, 'brick'],
  [0, 2, 'rubble'],
];
const CONCRETE: Cluster = [
  [0, 0, 'stone'],
  [1, 0, 'stone'],
  [2, 0, 'stone'],
];
const CRATES: Cluster = [
  [0, 0, 'crate'],
  [1, 0, 'crate'],
  [0, 1, 'crate'],
];
const HEDGEHOGS: Cluster = [
  [0, 0, 'hedgehog'],
  [2, 1, 'hedgehog'],
  [4, 0, 'hedgehog'],
];
const ROCKS: Cluster = [
  [0, 0, 'red_rock'],
  [1, 1, 'rubble'],
];
/** 'pine', 'fir'는 블록이 아니라 맵의 불탄 나무로 놓는다. */
const BURNT_TREES: Cluster = [
  [0, 0, 'pine'],
  [2, 1, 'fir'],
];

const CLUSTERS: readonly Cluster[] = [SANDBAG_NEST, SANDBAG_LINE, BRICK_RUIN, CONCRETE, CRATES, HEDGEHOGS, ROCKS, BURNT_TREES];
const CLUSTER_COUNT = 26;
const CRATER_COUNT = 24;
/** 맵 가장자리에서 이만큼 안쪽에만 놓는다. */
const EDGE = 2;

/** 묶음을 네 방향 중 하나로 돌린다. */
function rotate([x, y, what]: Piece, turns: number): Piece {
  let [rx, ry] = [x, y];
  for (let i = 0; i < turns; i++) [rx, ry] = [-ry, rx];
  return [rx, ry, what];
}

export function layoutBattlefield(): Battlefield {
  const { rng, mark, isFree, scatter } = makePlot(SEED);
  const walls: Battlefield['walls'] = [];
  const props: BattleProp[] = [];
  const trees: Tree[] = [];

  // 포탈 둘레와 도착 칸은 비워 둔다.
  for (const portal of portalsOf('forest')) {
    for (let y = portal.y - PORTAL_MARGIN - 1; y <= portal.y + PORTAL_MARGIN + 1; y++) {
      for (let x = portal.x - PORTAL_MARGIN - 1; x <= portal.x + PORTAL_MARGIN + 1; x++) mark(x, y);
    }
    mark(portal.landing.x, portal.landing.y);
  }

  const inside = (x: number, y: number) => x >= EDGE && y >= EDGE && x < MAP_SIZE - EDGE && y < MAP_SIZE - EDGE;
  /** 묶음의 칸과 그 둘레 한 칸이 모두 비어 있어야 놓는다. 그래야 묶음끼리 붙어 길을 막지 않는다. */
  const fits = (pieces: Piece[], ox: number, oy: number) =>
    pieces.every(([dx, dy]) => {
      const x = ox + dx;
      const y = oy + dy;
      if (!inside(x, y)) return false;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (inside(x + i, y + j) && !isFree(x + i, y + j)) return false;
      return true;
    });

  let placed = 0;
  for (let tries = 0; placed < CLUSTER_COUNT && tries < CLUSTER_COUNT * 60; tries++) {
    const pieces = rng.pick(CLUSTERS).map((piece) => rotate(piece, rng.int(0, 3)));
    const ox = rng.int(EDGE, MAP_SIZE - EDGE - 1);
    const oy = rng.int(EDGE, MAP_SIZE - EDGE - 1);
    if (!fits(pieces, ox, oy)) continue;
    for (const [dx, dy, what] of pieces) {
      const x = ox + dx;
      const y = oy + dy;
      mark(x, y);
      if (what === 'sandbag' || what === 'hedgehog' || what === 'crater') props.push({ kind: what, x, y });
      else if (what === 'pine') trees.push({ sprite: 'pinetree', x, y });
      else if (what === 'fir') trees.push({ sprite: 'firtree', x, y });
      else walls.push({ x, y, id: what });
    }
    placed++;
  }

  scatter(CRATER_COUNT, isFree, (x, y) => props.push({ kind: 'crater', x, y }));
  return { walls, props, trees };
}
