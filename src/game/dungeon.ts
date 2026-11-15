import type { BlockId } from '../blocks';
import { MAP_SIZE } from '../config';
import { PORTAL_MARGIN, portalsOf, type DungeonId } from './maps';
import { makePlot, type Tree } from './village';
import type { Tile } from './world';

/**
 * 던전 두 곳의 꾸밈(2026-11-15 사용자 요청 "맵을 적절하게 꾸미고"). 시드가 같으면 늘 같은 배치다.
 * 평원 던전은 풀밭에 무너진 이끼 돌 유적, 바위, 덤불, 나무. 지옥 던전은 그을린 땅에 용암 웅덩이, 흑요석 기둥, 붉은 바위.
 * 장애물은 모두 지나갈 수 없고 총알을 막는다. 묶음끼리 한 칸씩 띄워 길을 막지 않는다. 배치는 에이전트가 정했다.
 */

/** 묶음 하나의 칸: (0, 0) 기준 상대 위치와 블록 그림. 'oak', 'pine'은 블록이 아니라 맵의 나무다. */
type Piece = [number, number, BlockId | 'oak' | 'pine'];
type Cluster = Piece[];

const MEADOW: readonly Cluster[] = [
  // 무너진 유적 벽
  [
    [0, 0, 'mossy_stone'],
    [1, 0, 'mossy_stone'],
    [2, 0, 'rubble'],
    [0, 1, 'mossy_stone'],
    [0, 2, 'rubble'],
  ],
  // 유적 기둥 둘
  [
    [0, 0, 'mossy_stone'],
    [3, 0, 'mossy_stone'],
  ],
  [
    [0, 0, 'rock'],
    [1, 0, 'rock'],
    [1, 1, 'rubble'],
  ],
  [
    [0, 0, 'leafy_bush'],
    [1, 0, 'thicket'],
    [0, 1, 'thicket'],
  ],
  [
    [0, 0, 'oak'],
    [2, 1, 'pine'],
  ],
  [[0, 0, 'oak']],
];

const INFERNO: readonly Cluster[] = [
  // 용암 웅덩이
  [
    [0, 0, 'lava'],
    [1, 0, 'lava'],
    [0, 1, 'lava'],
    [1, 1, 'lava'],
  ],
  [
    [0, 0, 'lava'],
    [1, 0, 'lava'],
    [2, 0, 'lava'],
    [1, 1, 'lava'],
  ],
  // 흑요석 기둥과 돌무더기
  [
    [0, 0, 'black_block'],
    [1, 1, 'rubble'],
  ],
  [
    [0, 0, 'red_rock'],
    [1, 0, 'spire_rock'],
    [0, 1, 'red_rock'],
  ],
  [[0, 0, 'spire_rock']],
];

const LAYOUTS: Record<DungeonId, { seed: number; clusters: readonly Cluster[]; count: number }> = {
  meadow: { seed: 5521, clusters: MEADOW, count: 30 },
  inferno: { seed: 6661, clusters: INFERNO, count: 28 },
};

/** 맵 가장자리에서 이만큼 안쪽에만 놓는다. */
const EDGE = 2;

/** 나가는 포탈 둘레. 몬스터가 들어오지도, 생기지도 않는 쉼터다. */
export const SAFE_RADIUS = 7;

/** 칸이 나가는 포탈 앞 쉼터 안인지 */
export function inSafeZone(id: DungeonId, x: number, y: number) {
  const [exit] = portalsOf(id);
  return Math.hypot(x - exit.landing.x, y - exit.landing.y) <= SAFE_RADIUS;
}

function rotate([x, y, what]: Piece, turns: number): Piece {
  let [rx, ry] = [x, y];
  for (let i = 0; i < turns; i++) [rx, ry] = [-ry, rx];
  return [rx, ry, what];
}

export interface DungeonLayout {
  walls: { x: number; y: number; id: BlockId }[];
  trees: Tree[];
}

export function layoutDungeon(id: DungeonId): DungeonLayout {
  const { seed, clusters, count } = LAYOUTS[id];
  const { rng, mark, isFree } = makePlot(seed);
  const walls: DungeonLayout['walls'] = [];
  const trees: Tree[] = [];

  // 나가는 포탈 둘레는 비워 둔다.
  for (const portal of portalsOf(id)) {
    for (let y = portal.y - PORTAL_MARGIN - 1; y <= portal.y + PORTAL_MARGIN + 1; y++) {
      for (let x = portal.x - PORTAL_MARGIN - 1; x <= portal.x + PORTAL_MARGIN + 1; x++) mark(x, y);
    }
    mark(portal.landing.x, portal.landing.y);
  }

  const inside = (x: number, y: number) => x >= EDGE && y >= EDGE && x < MAP_SIZE - EDGE && y < MAP_SIZE - EDGE;
  const fits = (pieces: Piece[], ox: number, oy: number) =>
    pieces.every(([dx, dy]) => {
      const x = ox + dx;
      const y = oy + dy;
      if (!inside(x, y)) return false;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (inside(x + i, y + j) && !isFree(x + i, y + j)) return false;
      return true;
    });

  let placed = 0;
  for (let tries = 0; placed < count && tries < count * 60; tries++) {
    const pieces = rng.pick(clusters).map((piece) => rotate(piece, rng.int(0, 3)));
    const ox = rng.int(EDGE, MAP_SIZE - EDGE - 1);
    const oy = rng.int(EDGE, MAP_SIZE - EDGE - 1);
    if (!fits(pieces, ox, oy)) continue;
    for (const [dx, dy, what] of pieces) {
      const x = ox + dx;
      const y = oy + dy;
      mark(x, y);
      if (what === 'oak') trees.push({ sprite: 'oaktree', x, y });
      else if (what === 'pine') trees.push({ sprite: 'pinetree', x, y });
      else walls.push({ x, y, id: what });
    }
    placed++;
  }
  return { walls, trees };
}

/** 몬스터가 생길 수 있는 칸: 쉼터 밖이고 맵 가장자리에서 떨어진 칸. 막힌 칸인지는 부르는 쪽이 본다. */
export function spawnCandidates(id: DungeonId): Tile[] {
  const tiles: Tile[] = [];
  for (let y = EDGE + 1; y < MAP_SIZE - EDGE - 1; y++) {
    for (let x = EDGE + 1; x < MAP_SIZE - EDGE - 1; x++) if (!inSafeZone(id, x, y)) tiles.push({ x, y });
  }
  return tiles;
}

/** 던전 고르는 창에 보이는 던전(서버 dungeons 표) */
export interface DungeonInfo {
  id: DungeonId;
  name: string;
  blurb: string;
}

/** 몬스터 종류(서버 monsters 표). 능력치와 보상은 표 값이라 재배포 없이 바꾼다. */
export interface MonsterKind {
  id: string;
  dungeon: DungeonId;
  name: string;
  hp: number;
  damage: number;
  /** 초당 칸 */
  speed: number;
  attackMs: number;
  /** 공격이 닿는 거리(칸) */
  reach: number;
  /** 이 거리(칸) 안의 사람을 쫓는다 */
  sight: number;
  gold: number;
  exp: number;
  /** 던전에 한 번에 있는 수 */
  count: number;
}
