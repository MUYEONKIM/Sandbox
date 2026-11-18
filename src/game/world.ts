import { BLOCKS, footprintOf, isCube, isLarge, type BlockId } from '../blocks';
import { BUILD_RANGE, MAX_STACK, PLACE_RANGE } from '../config';
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
 * 블록과 가구를 놓고 치울 수 있는 칸: 8방위로 BUILD_RANGE(2)칸, 화면에서 큰 마름모(2026-11-13 사용자 요청 "그냥 8방위 2칸으로").
 * 예전에는 둘레 8칸에 네 변의 가운데에서 한 칸씩만 더 닿았다(2026-11-12).
 */
export function inBuildReach(from: Tile, to: Tile) {
  return Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) <= BUILD_RANGE;
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
  /** 울타리가 막는 변(농장만). 키는 fenceKey. */
  private readonly fences = new Set<number>();
  /** 모험 맵 몬스터 칸(2026-11-18 부딪히면 싸움): 걸어 들어가거나 점프로 내리거나 넘지 못한다. 길찾기도 피한다. */
  private readonly monsterTiles = new Set<number>();

  constructor(
    readonly map: GameMap,
    readonly portals: Portal[],
  ) {
    for (const { x, y } of map.partitions) this.partitions.add(this.key(x, y));
    for (const { x, y, side } of map.fences ?? []) this.fences.add(this.fenceKey(x, y, side === 'left'));
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

  /** 모험 맵 몬스터 칸을 정한다(맵마다 한 번). */
  setMonsterTiles(tiles: readonly { x: number; y: number }[]) {
    this.monsterTiles.clear();
    for (const { x, y } of tiles) if (this.inBounds(x, y)) this.monsterTiles.add(this.key(x, y));
  }

  isMonsterTile(x: number, y: number) {
    return this.monsterTiles.size > 0 && this.inBounds(x, y) && this.monsterTiles.has(this.key(x, y));
  }

  isWalkable(x: number, y: number) {
    if (!this.isOpenGround(x, y)) return false;
    if (this.covered.has(this.key(x, y))) return false;
    if (this.monsterTiles.has(this.key(x, y))) return false;
    const block = this.blockAt(x, y);
    return !block || !BLOCKS[block].solid;
  }

  /** 점프로 넘을 수 없는 칸: 두 개 이상 쌓은 블록과 건물 층 안의 벽, 모험 맵 몬스터 칸 */
  blocksJump(x: number, y: number) {
    return this.heightAt(x, y) >= 2 || this.partitions.has(this.key(x, y)) || this.monsterTiles.has(this.key(x, y));
  }

  /** 총알과 칼을 막는 칸: 건물이나 자원 같은 고정 장애물과 지나갈 수 없는 블록이다. 물과 꽃은 넘어간다. */
  blocksShots(x: number, y: number) {
    const block = this.blockAt(x, y);
    return this.map.solid[this.key(x, y)] === 1 || this.covered.has(this.key(x, y)) || (block !== undefined && BLOCKS[block].solid);
  }

  /**
   * from에서 (dx, dy)로 한 칸 갈 수 있는지 본다. 양옆이 모두 막힌 틈은 지나갈 수 없다.
   * 울타리(농장)는 칸 사이 변을 막는다: 가로·세로는 그 변에 울타리가 없어야 가고, 대각선은 꺾는 칸이 걸을 수 있고
   * 두 변 모두 울타리가 없는 꺾인 길이 하나라도 있어야 간다(farm-decor.md 2-3). 울타리 없는 맵은 예전 규칙과 같다.
   * 내 걸음과 길찾기(path.ts)가 모두 여기를 거친다.
   */
  canStep(from: Tile, dx: number, dy: number) {
    const tx = from.x + dx;
    const ty = from.y + dy;
    if (!this.isWalkable(tx, ty)) return false;
    if (!this.fences.size) {
      if (dx === 0 || dy === 0) return true;
      return this.isWalkable(tx, from.y) || this.isWalkable(from.x, ty);
    }
    if (dx === 0 || dy === 0) return !this.fenceBetween(from.x, from.y, tx, ty);
    const okX = this.isWalkable(tx, from.y) && !this.fenceBetween(from.x, from.y, tx, from.y) && !this.fenceBetween(tx, from.y, tx, ty);
    const okY = this.isWalkable(from.x, ty) && !this.fenceBetween(from.x, from.y, from.x, ty) && !this.fenceBetween(from.x, ty, tx, ty);
    return okX || okY;
  }

  /** 가로·세로로 이웃한 두 칸 사이에 울타리가 있는지 */
  fenceBetween(ax: number, ay: number, bx: number, by: number) {
    if (!this.fences.size) return false;
    if (bx === ax && by === ay + 1) return this.fences.has(this.fenceKey(bx, by, false));
    if (bx === ax && by === ay - 1) return this.fences.has(this.fenceKey(ax, ay, false));
    if (by === ay && bx === ax + 1) return this.fences.has(this.fenceKey(bx, by, true));
    if (by === ay && bx === ax - 1) return this.fences.has(this.fenceKey(ax, ay, true));
    return false;
  }

  /** 한 걸음(가로·세로·대각선)이 울타리를 넘는지. 대각선은 두 꺾인 길이 모두 울타리를 넘을 때 넘는 것으로 친다(점프용). */
  crossesFence(a: Tile, b: Tile) {
    if (!this.fences.size) return false;
    if (a.x === b.x || a.y === b.y) return this.fenceBetween(a.x, a.y, b.x, b.y);
    const viaX = this.fenceBetween(a.x, a.y, b.x, a.y) || this.fenceBetween(b.x, a.y, b.x, b.y);
    const viaY = this.fenceBetween(a.x, a.y, a.x, b.y) || this.fenceBetween(a.x, b.y, b.x, b.y);
    return viaX && viaY;
  }

  private fenceKey(x: number, y: number, left: boolean) {
    return (x + y * this.map.size) * 2 + (left ? 1 : 0);
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

  /** 이 맵에서 블록을 놓을 수 있는 칸을 더 좁힌다. 농장은 내 땅의 빈 칸에만 놓는다(서버 정책도 같음). */
  buildFilter: ((x: number, y: number) => boolean) | null = null;

  private isFreeForBlock(target: Tile, player: Tile) {
    if (target.x === player.x && target.y === player.y) return false;
    if (this.buildFilter && !this.buildFilter(target.x, target.y)) return false;
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
    if (this.buildFilter && !this.buildFilter(target.x, target.y)) return false;
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

  /** 허공(바닥이 없는 칸)인지. 맵 밖도 허공으로 본다. 닫힌 숨은 방 칸이 여기에 든다. */
  isVoid(x: number, y: number) {
    return !this.inBounds(x, y) || this.map.terrain[this.key(x, y)] === Terrain.Void;
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
