import {
  BLOCKS,
  canStackOn,
  footprintOf,
  isDoor,
  isFlat,
  isFloorTile,
  isLarge,
  isOnTop,
  isPaper,
  isPlacedWall,
  standLift,
  topOf,
  type BlockId,
} from '../blocks';
import { BLOCK_HEIGHT, BUILD_RANGE, CEIL_Z, MAX_STACK, PLACE_RANGE } from '../config';
import { Terrain, type GameMap } from './map';
import { isInside, type Area, type Portal } from './maps';

export interface Tile {
  x: number;
  y: number;
}

/** 칸 하나의 한 높이 */
export interface Level extends Tile {
  z: number;
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
   * 여러 칸을 차지하는 막힌 가구(침대, 탁자 등)가 덮은 칸 → 가구를 놓은 칸과 높이. 놓은 칸 자체는 blocks에 있다.
   * 카펫처럼 지나갈 수 있는 가구는 바닥 그림일 뿐이라 덮은 칸을 막지 않는다(그 위에 다른 가구를 놓을 수 있다).
   * 가구는 바닥이나 바닥 타일·얇은 깔개(윗면 0) 위에 놓였을 때만 칸을 덮는다(2026-11-24). 덮은 칸에는 가구 윗면에 올린 소품이 놓인다.
   */
  private readonly covered = new Map<number, { owner: number; z: number }>();
  /** covered를 거꾸로 찾는 표: "놓은 칸 키:z" → 덮은 칸 키들 */
  private readonly coverIndex = new Map<string, number[]>();
  /**
   * 천장 자리(z CEIL_Z)에 매단 것(2026-11-27). 바닥 쌓기와 따로라 걷기·쌓기·총알과 상관없다.
   * 두 칸짜리(줄 조명, 가렌드)는 놓은 칸에 두고, 뻗은 칸은 ceilCover에 놓은 칸을 적는다.
   */
  private readonly ceilings = new Map<number, BlockId>();
  private readonly ceilCover = new Map<number, number>();
  /** 지금 이 화면에서 열려 보이는 문 칸. 닫혀 보이는 문만 총알을 막는다(room-rules.md 3.2). */
  private readonly openDoors = new Set<number>();
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

  /** 바닥에 놓인 블록(z 0) */
  blockAt(x: number, y: number) {
    return this.blocks.get(this.key(x, y))?.[0];
  }

  /** 칸에 쌓인 것 중 하나라도 막히는지(2026-11-24: 방석 위 꽃병, 바닥 타일 위 상자도 막는다) */
  private solidStack(x: number, y: number) {
    const stack = this.blocks.get(this.key(x, y));
    return !!stack && stack.some((id) => id !== undefined && BLOCKS[id].solid);
  }

  /** 칸에 쌓인 것이 모두 납작한지(바닥 타일·얇은 깔개). 빈 칸도 그렇다. 이런 칸은 바닥처럼 그 위에 무엇이든 놓는다. */
  isFlatStack(x: number, y: number) {
    const stack = this.blocks.get(this.key(x, y));
    return !stack || stack.every((id) => id === undefined || isFlat(id));
  }

  /** 블록이 있거나 큰 가구가 덮은 칸 */
  isOccupied(x: number, y: number) {
    const key = this.key(x, y);
    return this.blocks.has(key) || this.covered.has(key);
  }

  /**
   * 칸 (x, y)의 높이 z에 놓인(놓일) 것이 서는 높이(아트 px)와 받치는 것.
   * 높이는 아래 것들의 윗면 높이 합이다(상자 18, 탁자 18, 의자 11, 방석 5, 바닥 타일 0 등). 윗면을 모르는 옛 블록은 상자 높이로 센다.
   * 큰 가구가 덮은 칸에서는 납작한 것(바닥 타일·깔개)이 아닌 것이 그 가구 윗면에 선다. flat은 놓이는 것이 납작한지다.
   */
  supportOf(x: number, y: number, z: number, flat = false): { lift: number; on: Level | null } {
    const stack = this.blocks.get(this.key(x, y));
    let lift = 0;
    let on: Level | null = null;
    for (let i = 0; i < z; i++) {
      const id = stack?.[i];
      if (id === undefined) continue;
      // 놓는 벽에 바른 벽지는 높이를 더하지 않는다(벽 겉면 그림).
      const top = isPaper(id) ? 0 : (topOf(id) ?? BLOCK_HEIGHT);
      lift += top;
      if (top > 0) on = { x, y, z: i };
    }
    if (on || flat) return { lift, on };
    const cover = this.covered.get(this.key(x, y));
    if (!cover) return { lift, on };
    const owner = this.tileOf(cover.owner);
    const id = this.blockAtLevel(owner.x, owner.y, cover.z);
    if (!id) return { lift, on };
    const base = this.supportOf(owner.x, owner.y, cover.z);
    return { lift: Math.max(lift, base.lift + (topOf(id) ?? 0)), on: { ...owner, z: cover.z } };
  }

  private tileOf(key: number): Tile {
    return { x: key % this.map.size, y: Math.floor(key / this.map.size) };
  }

  /** 높이 z에 놓인 블록(z가 CEIL_Z면 천장 자리) */
  blockAtLevel(x: number, y: number, z: number) {
    if (z === CEIL_Z) return this.ceilings.get(this.key(x, y));
    return this.blocks.get(this.key(x, y))?.[z];
  }

  /** 칸 (x, y)의 천장 자리를 쓰는 것: 놓은 칸과 id. 두 칸짜리가 뻗어 온 칸이면 그 놓은 칸이다. */
  ceilAt(x: number, y: number): (Tile & { id: BlockId }) | null {
    if (!this.inBounds(x, y)) return null;
    const key = this.key(x, y);
    const owner = this.ceilings.has(key) ? key : this.ceilCover.get(key);
    const id = owner === undefined ? undefined : this.ceilings.get(owner);
    return id === undefined || owner === undefined ? null : { ...this.tileOf(owner), id };
  }

  /** 천장 것이 쓰는 칸들 */
  private ceilTiles(x: number, y: number, id: BlockId): Tile[] {
    const { x0, y0, a, b } = footprintOf(id, x, y);
    const tiles: Tile[] = [];
    for (let cy = y0; cy < y0 + b; cy++) for (let cx = x0; cx < x0 + a; cx++) tiles.push({ x: cx, y: cy });
    return tiles;
  }

  /** target 칸의 천장 자리에 id를 매달 수 있는지: 손이 닿고, 쓰는 칸이 모두 바닥 위이고 천장 자리가 비어 있어야 한다. */
  canHang(target: Tile, player: Tile, id: BlockId) {
    if (!inBuildReach(player, target)) return false;
    return this.ceilTiles(target.x, target.y, id).every(({ x, y }) => {
      if (!this.inBounds(x, y) || this.map.terrain[this.key(x, y)] !== Terrain.Ground || this.map.solid[this.key(x, y)]) return false;
      if (this.buildFilter && !this.buildFilter(x, y)) return false;
      if (!this.map.buildZones.some((zone) => isInside(zone, x, y))) return false;
      return !this.ceilAt(x, y);
    });
  }

  /** 칸 (x, y)에 선 캐릭터를 올려 그리는 높이(아트 px): 그 칸에 놓인 단의 윗면, 계단은 그 반(room-rules.md 5절, 보이기만 높음) */
  floorLift(x: number, y: number) {
    const stack = this.inBounds(x, y) ? this.blocks.get(this.key(x, y)) : undefined;
    if (!stack) return 0;
    let lift = 0;
    for (const id of stack) if (id !== undefined) lift += standLift(id);
    return lift;
  }

  /** 칸에 놓인 문과 그 높이. 없으면 null */
  doorAt(x: number, y: number): { id: BlockId; z: number } | null {
    const stack = this.inBounds(x, y) ? this.blocks.get(this.key(x, y)) : undefined;
    if (!stack) return null;
    for (let z = 0; z < stack.length; z++) {
      const id = stack[z];
      if (id !== undefined && isDoor(id)) return { id, z };
    }
    return null;
  }

  /** 문이 이 화면에서 열려 보이는지 적어 둔다. */
  setDoorOpen(x: number, y: number, open: boolean) {
    if (open) this.openDoors.add(this.key(x, y));
    else this.openDoors.delete(this.key(x, y));
  }

  isDoorOpen(x: number, y: number) {
    return this.openDoors.has(this.key(x, y));
  }

  /** 큰 가구가 덮은 칸이면 그 가구를 놓은 칸과 높이 */
  ownerOf(x: number, y: number): Level | undefined {
    const cover = this.covered.get(this.key(x, y));
    return cover === undefined ? undefined : { ...this.tileOf(cover.owner), z: cover.z };
  }

  /** 놓은 칸 (x, y)의 높이 z 가구가 덮은 칸들(놓은 칸은 뺌) */
  coveredBy(x: number, y: number, z: number): Tile[] {
    return (this.coverIndex.get(`${this.key(x, y)}:${z}`) ?? []).map((key) => this.tileOf(key));
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

  /** 설치된 블록이 있는 바닥 칸 목록(벽지·벽걸이를 붙인 벽 칸은 뺀다) */
  blockTiles(): Tile[] {
    return [...this.blocks.keys()].map((key) => this.tileOf(key)).filter(({ x, y }) => this.isOpenGround(x, y));
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
    return !this.solidStack(x, y);
  }

  /**
   * 점프로 넘을 수 없는 칸: 두 개 이상 쌓은 블록(바닥 타일·얇은 깔개는 세지 않음), 놓는 벽, 건물 층 안의 벽, 모험 맵 몬스터 칸.
   * 방석 위 컵처럼 둘을 쌓은 것도 넘지 못한다(2026-11-24 코드 세션이 정함).
   */
  blocksJump(x: number, y: number) {
    if (this.partitions.has(this.key(x, y)) || this.monsterTiles.has(this.key(x, y))) return true;
    const stack = this.blocks.get(this.key(x, y));
    if (!stack) return false;
    let raised = 0;
    for (const id of stack) {
      if (id === undefined) continue;
      if (isPlacedWall(id)) return true;
      if (!isFlat(id)) raised++;
    }
    return raised >= 2;
  }

  /** 총알과 칼을 막는 칸: 건물이나 자원 같은 고정 장애물과 지나갈 수 없는 블록이다(쌓인 것 중 하나라도). 물과 꽃은 넘어간다. */
  blocksShots(x: number, y: number) {
    const key = this.key(x, y);
    if (this.map.solid[key] === 1 || this.covered.has(key) || this.solidStack(x, y)) return true;
    // 닫혀 보이는 문은 막는다(사람은 늘 지나간다).
    return !this.openDoors.has(key) && this.doorAt(x, y) !== null;
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
    // 바닥 타일·얇은 깔개(윗면 0)만 깔린 칸은 빈 바닥으로 보고 그 위(쌓인 수 높이)에 놓는다(2026-11-24). 바닥 타일은 빈 칸에만.
    const height = this.heightAt(target.x, target.y);
    if (height >= MAX_STACK) return false;
    if (height > 0) {
      const top = this.topAt(target.x, target.y)!;
      if (isFloorTile(id) || !canStackOn(top.id, id)) return false;
    }
    const tiles = this.placeTiles(target, id);
    // 여러 칸 가구는 덮는 칸이 모두 같은 높이(모두 단이거나 모두 바닥)일 때만 놓는다(room-rules.md 5.2).
    if (tiles.length > 1) {
      const lift = this.supportOf(target.x, target.y, this.heightAt(target.x, target.y), true).lift;
      if (tiles.some((t) => this.supportOf(t.x, t.y, this.heightAt(t.x, t.y), true).lift !== lift)) return false;
    }
    return tiles.every((tile) => this.isFreeForBlock(tile, player));
  }

  /**
   * 큰 가구가 덮은 칸 target에 작은 소품을 그 가구 윗면에 올릴 수 있는지(2026-11-24). 서버는 가구 크기를 모르므로 소품은 그 칸의
   * 쌓인 수 높이(바닥 타일이 있으면 그 위)로 저장하고, 화면이 가구 윗면 높이에 그린다.
   */
  canPlaceOnCover(target: Tile, player: Tile, id: BlockId) {
    const owner = this.ownerOf(target.x, target.y);
    if (!owner || !isOnTop(id) || !inBuildReach(player, target)) return false;
    const furniture = this.blockAtLevel(owner.x, owner.y, owner.z);
    if (!furniture || !topOf(furniture)) return false;
    if (!this.isFlatStack(target.x, target.y) || this.heightAt(target.x, target.y) >= MAX_STACK) return false;
    if (this.buildFilter && !this.buildFilter(target.x, target.y)) return false;
    return this.map.buildZones.some((zone) => isInside(zone, target.x, target.y));
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
    return this.isOpenGround(target.x, target.y) && this.isFlatStack(target.x, target.y);
  }

  /**
   * 칸의 블록 위에 하나 더 쌓을 수 있는지(맨 위가 납작하지 않은 칸). MAX_STACK개까지 쌓는다. 큰 가구는 쌓지 않는다.
   * 상자 위에는 한 칸짜리 무엇이든, 탁자·의자·방석 같은 윗면 위에는 작은 소품만 올린다(blocks.ts canStackOn).
   */
  canStack(target: Tile, player: Tile, id?: BlockId) {
    if (id && isLarge(id)) return false;
    if (!inBuildReach(player, target)) return false;
    if (!this.map.buildZones.some((zone) => isInside(zone, target.x, target.y))) return false;
    if (this.buildFilter && !this.buildFilter(target.x, target.y)) return false;
    const top = this.topAt(target.x, target.y);
    // 납작한 것만 깔린 칸은 빈 바닥과 같이 canPlace로 본다(큰 가구가 차지할 칸을 함께 봐야 함).
    if (top === undefined || top.z + 1 >= MAX_STACK || this.isFlatStack(target.x, target.y)) return false;
    // 벽지를 바른 놓는 벽: 벽지 위에는 벽지를 또 바르지 않고, 그 밖의 것은 아래 벽 기준(낮은 벽 위 소품)으로 본다.
    let base = top.id;
    if (isPaper(top.id) && top.z > 0) {
      if (id && isPaper(id)) return false;
      base = this.blockAtLevel(target.x, target.y, top.z - 1) ?? top.id;
    }
    return id ? canStackOn(base, id) : topOf(base) !== null;
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
    if (z === CEIL_Z) {
      this.ceilings.set(key, id);
      for (const t of this.ceilTiles(x, y, id)) {
        if (this.inBounds(t.x, t.y) && (t.x !== x || t.y !== y)) this.ceilCover.set(this.key(t.x, t.y), key);
      }
      return;
    }
    const stack = this.blocks.get(key) ?? [];
    const onFloor = stack.slice(0, z).every((below) => below === undefined || isFlat(below));
    stack[z] = id;
    this.blocks.set(key, stack);
    if (onFloor && BLOCKS[id].solid) {
      const keys: number[] = [];
      for (const tile of this.placeTiles({ x, y }, id)) {
        if (!this.inBounds(tile.x, tile.y) || (tile.x === x && tile.y === y)) continue;
        this.covered.set(this.key(tile.x, tile.y), { owner: key, z });
        keys.push(this.key(tile.x, tile.y));
      }
      if (keys.length) this.coverIndex.set(`${key}:${z}`, keys);
    }
  }

  remove(x: number, y: number, z: number) {
    this.version++;
    const key = this.key(x, y);
    if (z === CEIL_Z) {
      this.ceilings.delete(key);
      for (const [tile, owner] of this.ceilCover) if (owner === key) this.ceilCover.delete(tile);
      return;
    }
    if (this.blocks.get(key)?.[z] !== undefined && isDoor(this.blocks.get(key)![z])) this.openDoors.delete(key);
    const stack = this.blocks.get(key);
    if (!stack) return;
    const covers = this.coverIndex.get(`${key}:${z}`);
    if (covers) {
      for (const tile of covers) {
        const cover = this.covered.get(tile);
        if (cover && cover.owner === key && cover.z === z) this.covered.delete(tile);
      }
      this.coverIndex.delete(`${key}:${z}`);
    }
    delete stack[z];
    // 맨 위가 빠지면 비어 있는 꼭대기를 걷어 낸다.
    while (stack.length && stack[stack.length - 1] === undefined) stack.pop();
    if (!stack.length) this.blocks.delete(key);
  }
}
