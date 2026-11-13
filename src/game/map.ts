import { Rng } from '../art/pixels';
import type { BlockId } from '../blocks';
import type { SpriteName } from '../art/sprites';
import { MAP_SIZE } from '../config';
import { CASTLE, MAPS, OFFICE, PORTAL_MARGIN, portalsOf, SHOP, type Area, type MapId, type WorkId } from './maps';
import {
  ANNEX,
  ANNEX_PROPS,
  BULL,
  CASINO_FURNITURE,
  COUNTER,
  EXCHANGE_FURNITURE,
  FLOORS,
  HIDEOUT,
  isTower,
  LOBBY_FURNITURE,
  SNAIL_TRACK,
  type PartitionKind,
} from './tower';
import { layoutBattlefield, type BattleProp } from './battlefield';
import { layoutVillage, type Scenery } from './village';
import type { Tile } from './world';

/** Void는 아무것도 없는 칸이다. 건물 안처럼 맵의 일부만 쓸 때 나머지를 채운다. */
export const Terrain = { Ground: 0, Water: 1, Void: 2 } as const;

/** 맵에 놓인 건물. (x, y)는 차지하는 칸의 위쪽 모서리다. */
export interface Building extends Tile {
  sprite: SpriteName;
  w: number;
  d: number;
}

/** 건물 층 안을 나누는 벽 칸 */
export interface PartitionTile extends Tile {
  kind: PartitionKind;
}

/** 맵에 박혀 있는 장식 벽. 블록 그림을 쓰지만 회수할 수 없다. */
export interface FixedWall extends Tile {
  id: BlockId;
}

export interface GameMap extends Scenery {
  /** 맵 한 변의 칸 수. 칸 번호는 x + y * size다. */
  size: number;
  /** 바닥에 섞어 까는 타일 번호 */
  floor: number[];
  /** 타일 그림에서 윗면이 시작하는 높이 (아트 픽셀) */
  floorTop: number;
  terrain: Uint8Array;
  /** 맵에 고정된 장애물 칸 */
  solid: Uint8Array;
  /** 자원을 캘 수 있는 칸 */
  spots: Tile[];
  buildings: Building[];
  /** 블록을 놓을 수 있는 구역 */
  buildZones: Area[];
  /** 바닥이 있는 범위. 미니맵이 이 범위를 그린다. */
  bounds: Area;
  /** 난간이 서 있는 칸 */
  railings: Tile[];
  /** 장식 벽 */
  walls: FixedWall[];
  /** 건물 층 안의 벽. 칸을 막고 뛰어넘을 수도 없다. */
  partitions: PartitionTile[];
  /** 블록을 놓으면 안 되는 칸. 숨은 방을 여는 칸이 막히지 않게 한다. */
  reserved: Tile[];
  /** 전쟁터 전용 장애물과 포탄 구덩이 */
  battleProps: BattleProp[];
}

/** 작업장 건물이 들어가는 자리. 도착하는 귀퉁이 근처다. */
const WORK_SITE = { x: 38, y: 38, w: 4, d: 4 };

/** 작업장을 꾸미는 건물 */
const WORK_BUILDINGS: Partial<Record<MapId, SpriteName>> = {
  quarry: 'watchtower',
  logging: 'thatched',
  gathering: 'fruit',
  fishing: 'fish',
};

/**
 * 작업장 장식 벽: 도착하는 귀퉁이 근처에 한두 줄만 둔다. [블록, x0, y0, x1, y1] (끝 칸 포함)
 * 자원, 물, 건물, 포탈 근처와 겹치는 칸은 건너뛴다.
 */
const WORK_WALLS: Record<WorkId, [BlockId, number, number, number, number][]> = {
  // 채석장: 돌벽으로 두른 돌 쌓아 두는 곳
  quarry: [
    ['stone', 32, 41, 35, 41],
    ['stone', 32, 37, 32, 40],
  ],
  // 벌목장: 나무 울타리
  logging: [
    ['wood', 31, 43, 35, 43],
    ['wood', 31, 39, 31, 42],
  ],
  // 채집장: 밭 가장자리 덤불
  gathering: [
    ['hedge', 32, 35, 36, 35],
    ['hedge', 32, 36, 32, 38],
  ],
  // 낚시터: 물가 나무 울타리
  fishing: [
    ['wood', 34, 36, 37, 36],
    ['wood', 37, 32, 37, 35],
  ],
};

/** 작업장 자원은 이 간격의 격자에 흩어 놓는다. */
const SPOT_SPACING = 6;
/** 맵 가장자리와 포탈 근처를 비워 둔다. */
const SPOT_MARGIN = 3;
const PORTAL_CLEARANCE = 9;

const POND_RADIUS = 13;
const POND_CENTER = Math.floor(MAP_SIZE / 2);

function scatterSpots(id: MapId, solid: Uint8Array): Tile[] {
  const rng = new Rng(id.length * 7919 + id.charCodeAt(0));
  const spots: Tile[] = [];
  const end = MAP_SIZE - 1;
  for (let gy = SPOT_MARGIN; gy < MAP_SIZE - SPOT_MARGIN; gy += SPOT_SPACING) {
    for (let gx = SPOT_MARGIN; gx < MAP_SIZE - SPOT_MARGIN; gx += SPOT_SPACING) {
      const x = gx + rng.int(0, SPOT_SPACING - 2);
      const y = gy + rng.int(0, SPOT_SPACING - 2);
      if (x > end - PORTAL_CLEARANCE && y > end - PORTAL_CLEARANCE) continue;
      spots.push({ x, y });
      solid[x + y * MAP_SIZE] = 1;
    }
  }
  return spots;
}

/** 낚시터 가운데에 연못을 파고, 물가 칸 몇 곳을 낚시 자리로 쓴다. */
function digPond(terrain: Uint8Array): Tile[] {
  const isWater = (x: number, y: number) => Math.hypot(x - POND_CENTER, y - POND_CENTER) <= POND_RADIUS;
  const spots: Tile[] = [];
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      if (!isWater(x, y)) continue;
      terrain[x + y * MAP_SIZE] = Terrain.Water;
      const shore = !isWater(x + 1, y) || !isWater(x - 1, y) || !isWater(x, y + 1) || !isWater(x, y - 1);
      if (shore && (x + y * 3) % 5 === 0) spots.push({ x, y });
    }
  }
  return spots;
}

/** 건물 층의 바닥 앞쪽에 남기는 빈칸 수. 4층 숨은 방이 이 자리에 있다. */
const FRONT_GAP = 3;

/** 맵 한 변의 칸 수. 건물 층은 바닥에 맞추고, 나머지 맵은 기본 크기다. */
export function mapSize(id: MapId) {
  if (!isTower(id)) return MAP_SIZE;
  const [, , x1, y1] = FLOORS[id].area;
  return Math.max(MAP_SIZE, x1 + FRONT_GAP + 1, y1 + FRONT_GAP + 1);
}

/** 맵은 기본적으로 평지다. 맵마다 바닥색이 다르고, 건물이나 자원이 있는 맵은 여기서 채운다. */
export function generateMap(id: MapId): GameMap {
  const size = mapSize(id);
  const terrain = new Uint8Array(size * size).fill(Terrain.Ground);
  const solid = new Uint8Array(size * size);
  const buildings: Building[] = [];
  let spots: Tile[] = [];
  let scenery: Scenery = { floorTiles: new Map(), decals: new Map(), props: [], trees: [] };
  let battleProps: BattleProp[] = [];
  let battleWalls: FixedWall[] = [];

  if (id === 'plains') {
    for (const { sprite, x, y, w, d } of [OFFICE, CASTLE, SHOP]) buildings.push({ sprite, x, y, w, d });
    const village = layoutVillage();
    scenery = village;
    buildings.push(...village.buildings);
    for (const { x, y } of village.water) terrain[x + y * size] = Terrain.Water;
  } else if (isTower(id)) {
    terrain.fill(Terrain.Void);
    const [x0, y0, x1, y1] = FLOORS[id].area;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) terrain[x + y * size] = Terrain.Ground;
    }
    for (const [vx0, vy0, vx1, vy1] of FLOORS[id].voids) {
      for (let y = vy0; y <= vy1; y++) {
        for (let x = vx0; x <= vx1; x++) terrain[x + y * size] = Terrain.Void;
      }
    }
    if (id === 'tower1') {
      buildings.push({ ...COUNTER });
      scenery.trees.push(...LOBBY_FURNITURE);
    }
    if (id === 'casino') {
      scenery.trees.push(...CASINO_FURNITURE);
      const [tx0, ty0, tx1, ty1] = SNAIL_TRACK;
      for (let y = ty0; y <= ty1; y++) {
        for (let x = tx0; x <= tx1; x++) solid[x + y * size] = 1;
      }
    }
    if (id === 'exchange') {
      buildings.push({ ...BULL });
      scenery.trees.push(...EXCHANGE_FURNITURE);
    }
    if (id === 'annex') {
      const { lamps, plants, table, rocks, alcove } = ANNEX_PROPS;
      scenery.trees.push(...plants.map((at) => ({ sprite: 'plant' as const, ...at })));
      for (const { x, y } of [...lamps, table, ...rocks]) solid[x + y * size] = 1;
      for (let x = alcove.x0; x <= alcove.x1; x++) solid[x + ANNEX[1] * size] = 1;
    }
  } else if (id === 'forest') {
    const battle = layoutBattlefield();
    scenery.trees.push(...battle.trees);
    battleProps = battle.props;
    battleWalls = battle.walls;
    for (const { kind, x, y } of battleProps) if (kind !== 'crater') solid[x + y * size] = 1;
    for (const { x, y } of battleWalls) solid[x + y * size] = 1;
  } else if (id === 'fishing') {
    spots = digPond(terrain);
  } else if (MAPS[id].work) {
    spots = scatterSpots(id, solid);
  }

  const workBuilding = WORK_BUILDINGS[id];
  if (workBuilding) buildings.push({ sprite: workBuilding, ...WORK_SITE });

  for (const { x, y, w, d } of buildings) {
    for (let j = y; j < y + d; j++) {
      for (let i = x; i < x + w; i++) solid[i + j * size] = 1;
    }
  }
  for (const { x, y } of [...scenery.props, ...scenery.trees]) solid[x + y * size] = 1;

  const { floor, floorTop } = MAPS[id];
  const railings = isTower(id) ? FLOORS[id].railings : [];
  for (const { x, y } of railings) solid[x + y * size] = 1;
  const partitions: PartitionTile[] = [];
  for (const { kind, area } of isTower(id) ? FLOORS[id].partitions : []) {
    const [px0, py0, px1, py1] = area;
    for (let y = py0; y <= py1; y++) {
      for (let x = px0; x <= px1; x++) {
        if (solid[x + y * size]) continue;
        partitions.push({ x, y, kind });
        solid[x + y * size] = 1;
      }
    }
  }
  const walls = MAPS[id].work ? workWalls(id as WorkId, terrain, solid) : battleWalls;
  const bounds: Area = isTower(id) ? FLOORS[id].area : [0, 0, size - 1, size - 1];
  // 블록은 어느 맵이든 바닥 전체에 놓는다. 벽, 물, 포탈 둘레처럼 놓을 수 없는 칸은 World.canPlace가 거른다.
  const buildZones = [bounds];
  const reserved = id === HIDEOUT.map ? [HIDEOUT.trigger] : [];
  return { ...scenery, size, floor, floorTop, terrain, solid, spots, buildings, buildZones, bounds, railings, walls, partitions, reserved, battleProps };
}

/** 장식 벽을 놓을 수 있는 칸에만 세우고 그 칸을 막는다. */
function workWalls(id: WorkId, terrain: Uint8Array, solid: Uint8Array): FixedWall[] {
  const nearPortal = (x: number, y: number) =>
    portalsOf(id).some(
      (p) =>
        (Math.abs(p.x - x) <= PORTAL_MARGIN && Math.abs(p.y - y) <= PORTAL_MARGIN) ||
        (p.landing.x === x && p.landing.y === y),
    );
  const walls: FixedWall[] = [];
  for (const [block, x0, y0, x1, y1] of WORK_WALLS[id]) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = x + y * MAP_SIZE;
        if (terrain[i] !== Terrain.Ground || solid[i] || nearPortal(x, y)) continue;
        walls.push({ x, y, id: block });
        solid[i] = 1;
      }
    }
  }
  return walls;
}
