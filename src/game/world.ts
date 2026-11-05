import { BLOCKS, type BlockId } from '../blocks';
import { MAP_SIZE, PLACE_RANGE } from '../config';
import { Terrain, type GameMap } from './map';

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

  constructor(readonly map: GameMap) {}

  private key(x: number, y: number) {
    return x + y * MAP_SIZE;
  }

  inBounds(x: number, y: number) {
    return x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE;
  }

  blockAt(x: number, y: number) {
    return this.blocks.get(this.key(x, y));
  }

  private isOpenGround(x: number, y: number) {
    if (!this.inBounds(x, y)) return false;
    const i = this.key(x, y);
    return this.map.terrain[i] !== Terrain.Water && !this.map.solid[i];
  }

  isWalkable(x: number, y: number) {
    if (!this.isOpenGround(x, y)) return false;
    const block = this.blockAt(x, y);
    return !block || !BLOCKS[block].solid;
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
    return this.isOpenGround(target.x, target.y) && !this.blockAt(target.x, target.y);
  }

  place(x: number, y: number, id: BlockId) {
    this.blocks.set(this.key(x, y), id);
  }

  remove(x: number, y: number) {
    this.blocks.delete(this.key(x, y));
  }
}
