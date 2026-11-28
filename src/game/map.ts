import { Rng } from '../art/pixels';
import { BLOCKS, type BlockId } from '../blocks';
import type { SpriteName } from '../art/sprites';
import { MAP_SIZE } from '../config';
import { CAMP_RESERVED, CAMP_TREES } from './campfire';
import { CASTLE, isAdventure, isDungeon, MAPS, OFFICE, PORTAL_MARGIN, portalsOf, SHOP, type Area, type MapId, type WorkId } from './maps';
import { layoutDungeon } from './dungeon';
import { advLamps, advMap, advSize, infernus, decoArt } from './adventureMaps';
import { FARM_ROAD_TILES, isPlot } from './farm';
import {
  BULL,
  CASINO_FURNITURE,
  COUNTER,
  EXCHANGE_FURNITURE,
  FLOORS,
  isTower,
  LOBBY_FURNITURE,
  MART_PROPS,
  SMITHY_PROPS,
  ROOM_PROPS,
  LABOR_FURNITURE,
  SNAIL_TRACK,
  type PartitionKind,
} from './tower';
import { layoutBattlefield, type BattleProp } from './battlefield';
import { layoutVillage, type Scenery } from './village';
import type { Tile } from './world';
import { WORK_LAYOUTS } from './workLayouts';
import { FARM_PROPS, farmFences, type FenceEdge } from './farmLayout';

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
  /** 칸 사이 변을 막는 울타리(농장만, farmLayout.ts). 걸음(World.canStep)과 점프가 넘지 못한다. */
  fences: FenceEdge[];
  /** 모험 맵의 Infernus 조각(infernus.png). (x, y)가 맨 앞 칸이고 막는 칸은 이미 solid에 넣었다. */
  pieces: { id: string; x: number; y: number }[];
  /** 모험 맵 새 바닥(2026-11-20): 칸 번호 → 지역 아틀라스 tiles 번호(땅 칸만). tiles.png 번호인 floorTiles와 섞지 않는다. */
  decoTiles: Map<number, number>;
  /** 모험 맵 새 서 있는 조각(지역 아틀라스 props). (x, y)가 맨 앞 칸이고 막는 칸은 이미 solid에 넣었다. */
  decoPieces: { id: string; x: number; y: number }[];
}

/** 작업장 건물이 들어가는 자리. 도착하는 귀퉁이 근처다. */
const WORK_SITE = { x: 38, y: 38, w: 4, d: 4 };

/** 작업장을 꾸미는 건물. 벌목장 오두막(cabin)은 시작마을 농협을 현대풍으로 다시 그리기 전의 초가집 그림이다(2026-11-15). */
const WORK_BUILDINGS: Partial<Record<MapId, SpriteName>> = {
  quarry: 'watchtower',
  logging: 'cabin',
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

/** 건물 층의 바닥 앞쪽에 남기는 빈칸 수 */
const FRONT_GAP = 3;

/** 맵 한 변의 칸 수. 건물 층은 바닥에 맞추고, 모험 맵은 맵 자료 size(v5 64·46), 나머지 맵은 기본 크기다. 4층 숨은 방은 2026-11-27부터 따로 된 맵이라 4층은 바닥 크기로 돌아왔다. */
export function mapSize(id: MapId) {
  if (isAdventure(id)) return advSize(id);
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
  const pieces: GameMap['pieces'] = [];
  const decoTiles: GameMap['decoTiles'] = new Map();
  const decoPieces: GameMap['decoPieces'] = [];

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
    if (id === 'mart') buildings.push(...MART_PROPS);
    if (id === 'smithy') buildings.push(...SMITHY_PROPS);
    // 건물 안 소품(2026-11-16 다시 꾸미기, 노동청·농협 안)
    buildings.push(...(ROOM_PROPS[id] ?? []));
    if (id === 'labor') scenery.trees.push(...LABOR_FURNITURE);
    // 캠프파이어 맵 뒤쪽 두 변의 나무(2026-11-28, campfire.ts)
    if (id === 'campfire') scenery.trees.push(...CAMP_TREES);
    if (id === 'exchange') {
      buildings.push({ ...BULL });
      scenery.trees.push(...EXCHANGE_FURNITURE);
    }
  } else if (id === 'forest') {
    const battle = layoutBattlefield();
    scenery.trees.push(...battle.trees);
    battleProps = battle.props;
    battleWalls = battle.walls;
    for (const { kind, x, y } of battleProps) if (kind !== 'crater') solid[x + y * size] = 1;
    for (const { x, y } of battleWalls) solid[x + y * size] = 1;
  } else if (id === 'farm') {
    // 땅이 아닌 칸(구획 사이 2칸 길과 가장자리)은 흙길이다. 산 땅의 밭 그림은 FarmField가 덮는다.
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) if (!isPlot(x, y)) scenery.floorTiles.set(x + y * size, FARM_ROAD_TILES[(x * 7 + y * 13) % FARM_ROAD_TILES.length]);
    }
    // 농장 꾸밈 소품(2026-11-16, farmLayout.ts): 작업장 소품처럼 건물로 놓고 아래 반복문이 칸을 막는다.
    buildings.push(...FARM_PROPS);
  } else if (isAdventure(id)) {
    battleWalls = layoutAdventure(id, size, terrain, solid, scenery, pieces, decoTiles, decoPieces);
  } else if (isDungeon(id)) {
    const dungeon = layoutDungeon(id);
    scenery.trees.push(...dungeon.trees);
    battleWalls = dungeon.walls;
    for (const { x, y } of battleWalls) solid[x + y * size] = 1;
  } else if (id === 'fishing') {
    spots = digPond(terrain);
  } else if (MAPS[id].work) {
    spots = scatterSpots(id, solid);
  }

  const workBuilding = WORK_BUILDINGS[id];
  if (workBuilding) buildings.push({ sprite: workBuilding, ...WORK_SITE });
  // 작업장 소품(2026-11-16 디자인 세션, workLayouts.ts): 건물처럼 놓고 아래 반복문이 차지하는 칸을 막는다.
  const workLayout = MAPS[id].work ? WORK_LAYOUTS[id as WorkId] : undefined;
  if (workLayout) buildings.push(...workLayout.props);

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
  // 소품으로 바꾼 작업장은 예전 장식 벽(WORK_WALLS)을 세우지 않는다.
  const walls = workLayout && !workLayout.removeWalls ? workWalls(id as WorkId, terrain, solid) : battleWalls;
  const bounds: Area = isTower(id) ? FLOORS[id].area : [0, 0, size - 1, size - 1];
  // 블록은 어느 맵이든 바닥 전체에 놓는다. 벽, 물, 포탈 둘레처럼 놓을 수 없는 칸은 World.canPlace가 거른다.
  // 던전에는 놓지 않는다(몬스터 길을 막지 않게, 에이전트가 정함). 모험 필드도 블록이 없다(기획 3장).
  // 4층 숨은 방 입구 칸은 숨은 포탈(Portal.secret)이라 포탈 칸·도착 칸 규칙(World.isPortalArea)으로 비운다.
  // 캠프파이어 맵도 블록을 못 놓는다(2026-11-28 디자인 camp-map.json blocks: false, 서버 정책도 막음).
  const buildZones = isDungeon(id) || isAdventure(id) || id === 'campfire' ? [] : [bounds];
  // 시작마을 캠프파이어 광장 원 32칸과 일어나는 칸은 블록을 못 놓는다(사용자 "광장 원 안에는 블록을 못 놓게", 서버 plains_reserved).
  const reserved: Tile[] = id === 'plains' ? [...CAMP_RESERVED] : [];
  const fences = id === 'farm' ? farmFences() : [];
  return { ...scenery, size, floor, floorTop, terrain, solid, spots, buildings, buildZones, bounds, railings, walls, partitions, reserved, battleProps, fences, pieces, decoTiles, decoPieces };
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

/**
 * 모험 맵(2026-11-18, 디자인 세션 자료 adv-maps.json, 공유 노트 adventure-maps.md 3절): 땅·물·빈 땅, 칸마다 바닥 타일, 블록 벽, 나무, 꽃 타일,
 * Infernus 조각(막는 칸 fp × fp)을 자료 그대로 놓는다. 자료를 아직 읽지 않았으면 빈 땅이다(맵을 올리기 전에 loadAdventureMaps를 기다린다).
 * 바닥 조각, 일곱 빛 색, 별, 띠 경계 점선은 바닥 그림을 그릴 때 더한다(art/adventureGround.ts).
 */
function layoutAdventure(
  id: string,
  size: number,
  terrain: Uint8Array,
  solid: Uint8Array,
  scenery: Scenery,
  pieces: GameMap['pieces'],
  decoTiles: GameMap['decoTiles'],
  decoPieces: GameMap['decoPieces'],
): FixedWall[] {
  const data = advMap(id);
  const meta = infernus()?.meta;
  if (!data || !meta) {
    terrain.fill(Terrain.Void);
    return [];
  }
  for (let y = 0; y < size; y++) {
    const row = data.rows[y] ?? '';
    const floor = data.floor[y] ?? '';
    for (let x = 0; x < size; x++) {
      const c = row[x];
      terrain[x + y * size] = c === '.' ? Terrain.Ground : c === '~' ? Terrain.Water : Terrain.Void;
      const f = floor.slice(2 * x, 2 * x + 2);
      if (f && f !== '--') scenery.floorTiles.set(x + y * size, parseInt(f, 36));
    }
  }
  const walls: FixedWall[] = [];
  for (const w of data.walls) {
    if (!(w.id in BLOCKS)) continue;
    walls.push({ x: w.x, y: w.y, id: w.id as BlockId });
    solid[w.x + w.y * size] = 1;
  }
  for (const t of data.trees) scenery.trees.push({ sprite: t.sprite as SpriteName, x: t.x, y: t.y });
  for (const t of data.tileProps) scenery.props.push({ tile: t.tile, x: t.x, y: t.y });
  for (const p of data.props) {
    const piece = meta.props[p.id];
    if (!piece) continue;
    pieces.push({ id: p.id, x: p.x, y: p.y });
    for (let j = 0; j < piece.fp; j++) {
      for (let i = 0; i < piece.fp; i++) {
        const x = p.x - i;
        const y = p.y - j;
        if (x >= 0 && y >= 0 && x < size && y < size) solid[x + y * size] = 1;
      }
    }
  }
  // 새 바닥·꾸밈(2026-11-20, 디자인 세션 adventure-deco.md): 땅 칸 바닥 번호와 서 있는 조각(fp × fp 칸을 막음, fp 0은 막지 않음).
  // 막는 칸은 아틀라스 json의 fp로 센다. 아틀라스를 읽기 전에는 맵을 올리지 않는다(loadAdventureMaps(map), adventureMapsReady(map)).
  const art = decoArt(id);
  if (art && data.decoFloor) {
    for (let y = 0; y < size; y++) {
      const row = data.decoFloor[y] ?? '';
      for (let x = 0; x < size; x++) {
        const f = row.slice(2 * x, 2 * x + 2);
        if (f && f !== '--' && terrain[x + y * size] === Terrain.Ground) decoTiles.set(x + y * size, parseInt(f, 36));
      }
    }
  }
  for (const p of art ? (data.decoProps ?? []) : []) {
    const piece = art!.meta.props[p.id];
    if (!piece) continue;
    decoPieces.push({ id: p.id, x: p.x, y: p.y });
    for (let j = 0; j < piece.fp; j++) {
      for (let i = 0; i < piece.fp; i++) {
        const x = p.x - i;
        const y = p.y - j;
        if (x >= 0 && y >= 0 && x < size && y < size) solid[x + y * size] = 1;
      }
    }
  }
  // 등불(2026-11-24, 디자인 adv-lights.md 8절): fp 1이면 그 칸을 막는다(마을 가로등 블록처럼 지나갈 수 없음). 서버는 칸을 보지 않는다.
  const lamps = advLamps(id);
  if (lamps?.frame.fp) {
    for (const [x, y] of lamps.spots) if (x >= 0 && y >= 0 && x < size && y < size) solid[x + y * size] = 1;
  }
  return walls;
}
