import { BLOCKS, isCube, type BlockId } from '../blocks';
import { MAX_STACK, PLACE_RANGE } from '../config';
import { Terrain, type GameMap } from './map';
import { isInside, type Area, type Portal } from './maps';

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
  /** 칸마다 쌓인 블록. 배열 번호가 높이(z)이고 0이 바닥이다. */
  private readonly blocks = new Map<number, BlockId[]>();

  constructor(
    readonly map: GameMap,
    readonly portals: Portal[],
  ) {}

  private key(x: number, y: number) {
    return x + y * this.map.size;
  }

  inBounds(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.map.size && y < this.map.size;
  }

  /** 바닥에 놓인 블록. 지나갈 수 있는지와 총알이 막히는지는 이 블록으로 정한다. */
  blockAt(x: number, y: number) {
    return this.blocks.get(this.key(x, y))?.[0];
  }

  /** 높이 z에 놓인 블록 */
  blockAtLevel(x: number, y: number, z: number) {
    return this.blocks.get(this.key(x, y))?.[z];
  }

  /** 칸에 쌓인 블록 수 */
  heightAt(x: number, y: number) {
    return this.blocks.get(this.key(x, y))?.length ?? 0;
  }

  /** 칸의 맨 위 블록과 그 높이 */
  topAt(x: number, y: number) {
    const stack = this.blocks.get(this.key(x, y));
    if (!stack?.length) return undefined;
    const z = stack.length - 1;
    return { id: stack[z], z };
  }

  /** 설치된 블록이 있는 칸 목록 */
  blockTiles(): Tile[] {
    const { size } = this.map;
    return [...this.blocks.keys()].map((key) => ({ x: key % size, y: Math.floor(key / size) }));
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

  /** 총알과 칼을 막는 칸: 건물이나 자원 같은 고정 장애물과 지나갈 수 없는 블록이다. 물과 꽃은 넘어간다. */
  blocksShots(x: number, y: number) {
    const block = this.blockAt(x, y);
    return this.map.solid[this.key(x, y)] === 1 || (block !== undefined && BLOCKS[block].solid);
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
    if (this.map.reserved.some(({ x, y }) => x === target.x && y === target.y)) return false;
    return this.isOpenGround(target.x, target.y) && !this.heightAt(target.x, target.y);
  }

  /** 칸의 블록 위에 하나 더 쌓을 수 있는지. 기본 블록(상자) 위에만, MAX_STACK개까지 쌓는다. */
  canStack(target: Tile, player: Tile) {
    if (!inReach(player, target)) return false;
    if (!this.map.buildZones.some((zone) => isInside(zone, target.x, target.y))) return false;
    const top = this.topAt(target.x, target.y);
    return top !== undefined && top.z + 1 < MAX_STACK && isCube(top.id);
  }

  /** 숨은 방처럼 나중에 드러나는 바닥을 걸을 수 있게 한다. solid는 가구가 있어 막는 칸이다. */
  openFloor([x0, y0, x1, y1]: Area, solid: Tile[]) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) this.map.terrain[this.key(x, y)] = Terrain.Ground;
    }
    for (const { x, y } of solid) this.map.solid[this.key(x, y)] = 1;
  }

  /** openFloor로 연 바닥을 다시 허공으로 되돌린다. */
  closeFloor([x0, y0, x1, y1]: Area) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        this.map.terrain[this.key(x, y)] = Terrain.Void;
        this.map.solid[this.key(x, y)] = 0;
      }
    }
  }

  place(x: number, y: number, z: number, id: BlockId) {
    const key = this.key(x, y);
    const stack = this.blocks.get(key) ?? [];
    stack[z] = id;
    this.blocks.set(key, stack);
  }

  remove(x: number, y: number, z: number) {
    const key = this.key(x, y);
    const stack = this.blocks.get(key);
    if (!stack) return;
    delete stack[z];
    // 맨 위가 빠지면 비어 있는 꼭대기를 걷어 낸다.
    while (stack.length && stack[stack.length - 1] === undefined) stack.pop();
    if (!stack.length) this.blocks.delete(key);
  }
}
