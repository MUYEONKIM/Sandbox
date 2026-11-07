import { MAP_SIZE } from '../config';
import type { Tile, World } from './world';

const DIRS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
  { dx: 1, dy: 1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: -1 },
];

/** 비용이 가장 작은 칸을 꺼내는 작은 힙 */
class Heap {
  private readonly items: { key: number; cost: number }[] = [];

  get size() {
    return this.items.length;
  }

  push(key: number, cost: number) {
    const items = this.items;
    items.push({ key, cost });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].cost <= items[i].cost) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }

  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop()!;
    if (items.length) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && items[l].cost < items[m].cost) m = l;
        if (r < items.length && items[r].cost < items[m].cost) m = r;
        if (m === i) break;
        [items[m], items[i]] = [items[i], items[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * from에서 to까지 걸어갈 칸들을 찾는다 (from은 빼고 to까지).
 * 대각선은 걸리는 시간만큼 비싸게 친다. 포탈은 도착지일 때만 밟는다.
 * to에 갈 수 없으면 갈 수 있는 칸 중 to에 가장 가까운 칸까지 간다.
 */
export function findPath(world: World, from: Tile, to: Tile): Tile[] {
  const key = (x: number, y: number) => x + y * MAP_SIZE;
  const cost = new Float64Array(MAP_SIZE * MAP_SIZE).fill(Infinity);
  const came = new Int32Array(MAP_SIZE * MAP_SIZE).fill(-1);
  const start = key(from.x, from.y);
  const goal = key(to.x, to.y);
  cost[start] = 0;

  const heap = new Heap();
  heap.push(start, 0);
  let best = start;
  let bestGap = Math.hypot(from.x - to.x, from.y - to.y);

  while (heap.size) {
    const { key: here, cost: spent } = heap.pop();
    if (spent > cost[here]) continue;
    if (here === goal) {
      best = goal;
      break;
    }
    const x = here % MAP_SIZE;
    const y = Math.floor(here / MAP_SIZE);
    const gap = Math.hypot(x - to.x, y - to.y);
    if (gap < bestGap) {
      best = here;
      bestGap = gap;
    }
    for (const { dx, dy } of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      const next = key(nx, ny);
      if (!world.canStep({ x, y }, dx, dy)) continue;
      if (next !== goal && world.portalAt(nx, ny)) continue;
      const total = spent + Math.hypot(dx, dy);
      if (total >= cost[next]) continue;
      cost[next] = total;
      came[next] = here;
      heap.push(next, total);
    }
  }

  const path: Tile[] = [];
  for (let at = best; at !== start; at = came[at]) {
    path.push({ x: at % MAP_SIZE, y: Math.floor(at / MAP_SIZE) });
  }
  return path.reverse();
}
