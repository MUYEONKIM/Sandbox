import { BLOCKS, type BlockId } from '../blocks';
import { MAP_SIZE, PLACE_RANGE } from '../config';
import { Terrain, type GameMap } from './map';
import { isInside, type Portal } from './maps';

export interface Tile {
  x: number;
  y: number;
}

/** 캐릭터 손이 닿는 칸인지 판단한다. 대각선을 포함한 8방위로 PLACE_RANGE칸까지 닿는다. */
export function inReach(from: Tile, to: Tile, range = PLACE_RANGE) {
  return Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) <= range;
}

/** 맵 위 상태(지형, 고정 장애물, 설치된 블록)와 그에 대한 규칙 */
export class World {
  private readonly blocks = new Map<number, BlockId>();
  /** 맵에 박힌 장식 벽 */
  private readonly walls = new Map<number, BlockId>();

  constructor(
    readonly map: GameMap,
    readonly portals: Portal[],
  ) {
    for (const { x, y, id } of map.walls) this.walls.set(this.key(x, y), id);
  }

  private key(x: number, y: number) {
    return x + y * MAP_SIZE;
  }

  inBounds(x: number, y: number) {
    return x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE;
  }

  blockAt(x: number, y: number) {
    return this.blocks.get(this.key(x, y));
  }

  /** 설치된 블록이나 장식 벽. 벽 그림을 이웃과 이을 때 쓴다. */
  wallAt(x: number, y: number) {
    if (!this.inBounds(x, y)) return undefined;
    return this.blocks.get(this.key(x, y)) ?? this.walls.get(this.key(x, y));
  }

  /** 설치된 블록이 있는 칸 목록 */
  blockTiles(): Tile[] {
    return [...this.blocks.keys()].map((key) => ({ x: key % MAP_SIZE, y: Math.floor(key / MAP_SIZE) }));
  }

  /** 캐릭터 주변 8칸 안에 있는 자원 칸을 찾는다. */
  spotNear(player: Tile) {
    return this.map.spots.find((spot) => inReach(player, spot));
  }

  portalAt(x: number, y: number) {
    return this.portals.find((p) => p.x === x && p.y === y);
  }

  /** 포탈과 그 앞 도착 칸은 막으면 안 되므로 블록을 놓지 못한다. */
  private isPortalArea(x: number, y: number) {
    return this.portals.some((p) => (p.x === x && p.y === y) || (p.landing.x === x && p.landing.y === y));
  }

  private isOpenGround(x: number, y: number) {
    if (!this.inBounds(x, y)) return false;
    const i = this.key(x, y);
    return this.map.terrain[i] === Terrain.Ground && !this.map.solid[i];
  }

  isWalkable(x: number, y: number) {
    if (!this.isOpenGround(x, y)) return false;
    const block = this.blockAt(x, y);
    return !block || !BLOCKS[block].solid;
  }

  /** 총알과 칼을 막는 칸: 건물이나 자원 같은 고정 장애물과 설치된 블록이다. 물은 넘어간다. */
  blocksShots(x: number, y: number) {
    return this.map.solid[this.key(x, y)] === 1 || this.blockAt(x, y) !== undefined;
  }

  /** from에서 (dx, dy)로 한 칸 갈 수 있는지 본다. 양옆이 모두 막힌 틈은 지나갈 수 없다. */
  canStep(from: Tile, dx: number, dy: number) {
    if (!this.isWalkable(from.x + dx, from.y + dy)) return false;
    if (dx === 0 || dy === 0) return true;
    return this.isWalkable(from.x + dx, from.y) || this.isWalkable(from.x, from.y + dy);
  }

  canPlace(target: Tile, player: Tile) {
    if (!inReach(player, target)) return false;
    if (target.x === player.x && target.y === player.y) return false;
    if (!this.map.buildZones.some((zone) => isInside(zone, target.x, target.y))) return false;
    if (this.isPortalArea(target.x, target.y)) return false;
    return this.isOpenGround(target.x, target.y) && !this.blockAt(target.x, target.y);
  }

  place(x: number, y: number, id: BlockId) {
    this.blocks.set(this.key(x, y), id);
  }

  remove(x: number, y: number) {
    this.blocks.delete(this.key(x, y));
  }
}
