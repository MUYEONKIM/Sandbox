import { BLOCKS, footprintOf, isCube, isLarge, type BlockId } from '../blocks';
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

/**
 * 블록을 놓고 치울 수 있는 칸: 둘레 8칸(화면에서 마름모)에 더해, 마름모 네 변의 가운데에서 바깥으로 한 칸씩 더
 * (2026-11-12 사용자 요청 "상하좌우 한 칸씩 더", 같은 날 "마름모 꼭짓점이 아니라 변마다 가운데 한 칸"으로 바로잡음).
 * 변의 가운데는 격자로 곧은 방향이라, 더 닿는 네 칸은 격자로 곧게 두 칸 떨어진 칸이다.
 */
export function inBuildReach(from: Tile, to: Tile) {
  const dx = Math.abs(from.x - to.x);
  const dy = Math.abs(from.y - to.y);
  return Math.max(dx, dy) <= PLACE_RANGE || (dx + dy === PLACE_RANGE + 1 && Math.min(dx, dy) === 0);
}

/** 맵 위 상태(지형, 고정 장애물, 설치된 블록)와 그에 대한 규칙 */
export class World {
  /** 칸마다 쌓인 블록. 배열 번호가 높이(z)이고 0이 바닥이다. */
  private readonly blocks = new Map<number, BlockId[]>();
  /** 건물 층 안의 벽 칸 */
  private readonly partitions = new Set<number>();
  /**
   * 여러 칸을 차지하는 막힌 가구(침대, 탁자 등)가 덮은 칸 → 가구를 놓은 칸. 놓은 칸 자체는 blocks에 있다.
   * 카펫처럼 지나갈 수 있는 가구는 바닥 그림일 뿐이라 덮은 칸을 막지 않는다(그 위에 다른 가구를 놓을 수 있다).
   */
  private readonly covered = new Map<number, number>();
  /** 블록을 놓거나 치울 때마다 1씩 는다. 전쟁터 손전등이 막힌 칸이 바뀐 것을 알아챌 때 쓴다. */
  version = 0;

  constructor(
    readonly map: GameMap,
    readonly portals: Portal[],
  ) {
    for (const { x, y } of map.partitions) this.partitions.add(this.key(x, y));
  }

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

  /** 큰 가구가 덮은 칸이면 그 가구를 놓은 칸 */
  ownerOf(x: number, y: number): Tile | undefined {
    const key = this.covered.get(this.key(x, y));
    return key === undefined ? undefined : { x: key % this.map.size, y: Math.floor(key / this.map.size) };
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

  /** 블록을 놓을 수 있는 빈 바닥인지(벽, 가구, 허공, 물이 아닌 칸) */
  isOpenGround(x: number, y: number) {
    if (!this.inBounds(x, y)) return false;
    const i = this.key(x, y);
    return this.map.terrain[i] === Terrain.Ground && !this.map.solid[i];
  }

  isWalkable(x: number, y: number) {
    if (!this.isOpenGround(x, y)) return false;
    if (this.covered.has(this.key(x, y))) return false;
    const block = this.blockAt(x, y);
    return !block || !BLOCKS[block].solid;
  }

  /** 점프로 넘을 수 없는 칸: 두 개 이상 쌓은 블록과 건물 층 안의 벽 */
  blocksJump(x: number, y: number) {
    return this.heightAt(x, y) >= 2 || this.partitions.has(this.key(x, y));
  }

  /** 총알과 칼을 막는 칸: 건물이나 자원 같은 고정 장애물과 지나갈 수 없는 블록이다. 물과 꽃은 넘어간다. */
  blocksShots(x: number, y: number) {
    const block = this.blockAt(x, y);
    return this.map.solid[this.key(x, y)] === 1 || this.covered.has(this.key(x, y)) || (block !== undefined && BLOCKS[block].solid);
  }

  /** from에서 (dx, dy)로 한 칸 갈 수 있는지 본다. 양옆이 모두 막힌 틈은 지나갈 수 없다. */
  canStep(from: Tile, dx: number, dy: number) {
    if (!this.isWalkable(from.x + dx, from.y + dy)) return false;
    if (dx === 0 || dy === 0) return true;
    return this.isWalkable(from.x + dx, from.y) || this.isWalkable(from.x, from.y + dy);
  }

  /**
   * target에 id를 놓을 수 있는지. 손은 target에만 닿으면 되고, 막힌 큰 가구는 차지하는 칸이 모두 비어 있어야 한다.
   * 지나갈 수 있는 가구(카펫 등)는 놓는 칸 하나만 본다.
   */
  canPlace(target: Tile, player: Tile, id: BlockId) {
    if (!inBuildReach(player, target)) return false;
    return this.placeTiles(target, id).every((tile) => this.isFreeForBlock(tile, player));
  }

  /** 놓을 때 비어 있어야 하는 칸들 */
  placeTiles(target: Tile, id: BlockId): Tile[] {
    if (!BLOCKS[id].solid) return [target];
    const { x0, y0, a, b } = footprintOf(id, target.x, target.y);
    const tiles: Tile[] = [];
    for (let y = y0; y < y0 + b; y++) for (let x = x0; x < x0 + a; x++) tiles.push({ x, y });
    return tiles;
  }

  private isFreeForBlock(target: Tile, player: Tile) {
    if (target.x === player.x && target.y === player.y) return false;
    if (!this.map.buildZones.some((zone) => isInside(zone, target.x, target.y))) return false;
    if (this.isPortalArea(target.x, target.y)) return false;
    if (this.map.reserved.some(({ x, y }) => x === target.x && y === target.y)) return false;
    if (this.covered.has(this.key(target.x, target.y))) return false;
    return this.isOpenGround(target.x, target.y) && !this.heightAt(target.x, target.y);
  }

  /** 칸의 블록 위에 하나 더 쌓을 수 있는지. 기본 블록(상자) 위에만, MAX_STACK개까지 쌓는다. 큰 가구는 쌓지 않는다. */
  canStack(target: Tile, player: Tile, id?: BlockId) {
    if (id && isLarge(id)) return false;
    if (!inBuildReach(player, target)) return false;
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
    this.version++;
    const key = this.key(x, y);
    const stack = this.blocks.get(key) ?? [];
    stack[z] = id;
    this.blocks.set(key, stack);
    if (z === 0 && BLOCKS[id].solid) {
      for (const tile of this.placeTiles({ x, y }, id)) {
        if (this.inBounds(tile.x, tile.y) && (tile.x !== x || tile.y !== y)) this.covered.set(this.key(tile.x, tile.y), key);
      }
    }
  }

  remove(x: number, y: number, z: number) {
    this.version++;
    const key = this.key(x, y);
    const stack = this.blocks.get(key);
    if (!stack) return;
    if (z === 0) {
      for (const [tile, owner] of this.covered) if (owner === key) this.covered.delete(tile);
    }
    delete stack[z];
    // 맨 위가 빠지면 비어 있는 꼭대기를 걷어 낸다.
    while (stack.length && stack[stack.length - 1] === undefined) stack.pop();
    if (!stack.length) this.blocks.delete(key);
  }
}
