import { MAP_SIZE, TILE_H, TILE_W } from '../config';
import { Terrain, type GameMap } from '../game/map';
import { gridToWorld, ORIGIN_X, ORIGIN_Y, worldToGrid } from '../iso';
import { fbm, frac, hash2, Pixels, ramp, shade, vnoise, type Color } from './pixels';

const GRASS = [0x4c9a3e, 0x5bab43, 0x6dbd49, 0x82cc55];
const DIRT = [0xa98150, 0xbb9560, 0xcba973, 0xdabb86];
const PAVING = [0xd9c9a3, 0xe3d5b3, 0xcdbb92, 0xeadfc2];
const WATER = [0x25698f, 0x2f7fa8, 0x3a93bc];

/** 맵 아래로 드러나는 섬 옆면 높이 (아트 픽셀) */
const ISLAND_SIDE = 36;

export const WORLD_W = MAP_SIZE * TILE_W;
export const WORLD_H = ORIGIN_Y + MAP_SIZE * TILE_H + ISLAND_SIDE + 8;

/** 지형 전체를 큰 이미지 한 장으로 그린다. 타일마다 스프라이트를 만들지 않아 가볍다. */
export function paintGround(map: GameMap): HTMLCanvasElement {
  const S = MAP_SIZE;
  const p = new Pixels(WORLD_W, WORLD_H);

  const terrainAt = (gx: number, gy: number) => {
    const x = Math.floor(gx);
    const y = Math.floor(gy);
    if (x < 0 || y < 0 || x >= S || y >= S) return -1;
    return map.terrain[x + y * S];
  };

  /** 풀, 흙, 물의 경계는 구불구불하게 만들고 포장과 밭의 경계는 반듯하게 둔다. */
  const surface = (sx: number, sy: number) => {
    const { gx, gy } = worldToGrid(sx + 0.5, sy + 0.5);
    const base = terrainAt(gx, gy);
    if (base < 0 || base === Terrain.Paving || base === Terrain.Farm) return base;
    const wobbled = terrainAt(
      gx + (vnoise(sx * 0.11, sy * 0.11) - 0.5) * 0.75,
      gy + (vnoise(sy * 0.11 + 40, sx * 0.11) - 0.5) * 0.75,
    );
    if (wobbled < 0 || wobbled === Terrain.Paving || wobbled === Terrain.Farm) return base;
    return wobbled;
  };

  /** 평지에서도 칸이 보이도록 마름모 격자를 옅게 넣는다. */
  const paintGrass = (sx: number, sy: number): Color => {
    const { gx, gy } = worldToGrid(sx + 0.5, sy + 0.5);
    const c = ramp(GRASS, fbm(sx * 0.03, sy * 0.06) * 0.5 + 0.28, sx, sy);
    return frac(gx) < 0.065 || frac(gy) < 0.065 ? shade(c, 0.9) : c;
  };

  const paintWater = (sx: number, sy: number): Color => {
    for (let k = 1; k <= 5; k++) {
      if (surface(sx, sy - k) !== Terrain.Water) return k <= 3 ? 0x5a3f28 : 0x1f4f6e;
    }
    if (surface(sx, sy + 1) !== Terrain.Water) return 0xa8dde6;
    if (surface(sx - 2, sy) !== Terrain.Water || surface(sx + 2, sy) !== Terrain.Water) return 0x5cb4cc;
    if (vnoise(sx * 0.07, sy * 0.3) > 0.76) return 0x6fc2d6;
    return ramp(WATER, fbm(sx * 0.04, sy * 0.1), sx, sy);
  };

  const paintDirt = (sx: number, sy: number): Color => {
    const nearGrass =
      surface(sx + 3, sy) === Terrain.Grass ||
      surface(sx - 3, sy) === Terrain.Grass ||
      surface(sx, sy + 2) === Terrain.Grass ||
      surface(sx, sy - 2) === Terrain.Grass;
    if (nearGrass) return 0x8f6b3f;
    if (hash2(sx, sy) > 0.975) return 0xe8d3a4;
    return ramp(DIRT, fbm(sx * 0.09, sy * 0.17), sx, sy);
  };

  const paintPaving = (sx: number, sy: number): Color => {
    const { gx, gy } = worldToGrid(sx + 0.5, sy + 0.5);
    const rows = gy * 3;
    const row = Math.floor(rows);
    const cols = gx * 1.5 + (row & 1) * 0.5;
    if (frac(rows) < 0.19 || frac(cols) < 0.1) return 0xa9977a;
    return PAVING[Math.floor(hash2(row, Math.floor(cols)) * 4)];
  };

  const paintFarm = (sx: number, sy: number): Color => {
    const { gy } = worldToGrid(sx + 0.5, sy + 0.5);
    const f = frac(gy * 3);
    const c = f < 0.4 ? 0x6b4a2b : f < 0.7 ? 0x8a6239 : 0x9c7245;
    return hash2(sx, sy) > 0.9 ? shade(c, 0.9) : c;
  };

  /** 맵 앞쪽 두 변 아래로 보이는 섬의 흙벽 */
  const paintSide = (sx: number, sy: number) => {
    const { gx, gy } = worldToGrid(sx + 0.5, sy + 0.5);
    const right = sx >= ORIGIN_X;
    const over = right ? gx - S : gy - S;
    const across = right ? gy - over : gx - over;
    if (over < 0 || across < 0 || across > S) return;
    const d = over * TILE_H;
    if (d > ISLAND_SIDE - vnoise(sx * 0.12, 3) * 12) return;
    const light = right ? 0.72 : 0.92;
    let c: Color;
    if (d < 3) c = 0x3f7f35;
    else if (d < 12) c = ramp([0x7a5533, 0x8f6840], vnoise(sx * 0.15, sy * 0.3), sx, sy);
    else c = ramp([0x5f5a58, 0x77706c, 0x8a827c], vnoise(sx * 0.1, sy * 0.28), sx, sy);
    p.set(sx, sy, shade(c, light));
  };

  for (let sy = 0; sy < WORLD_H; sy++) {
    for (let sx = 0; sx < WORLD_W; sx++) {
      const t = surface(sx, sy);
      if (t < 0) paintSide(sx, sy);
      else if (t === Terrain.Grass) p.set(sx, sy, paintGrass(sx, sy));
      else if (t === Terrain.Dirt) p.set(sx, sy, paintDirt(sx, sy));
      else if (t === Terrain.Paving) p.set(sx, sy, paintPaving(sx, sy));
      else if (t === Terrain.Farm) p.set(sx, sy, paintFarm(sx, sy));
      else p.set(sx, sy, paintWater(sx, sy));
    }
  }

  stampDetails(p, map);
  return p.toCanvas();
}

/** 밭 칸에 새싹을 찍는다. */
function stampDetails(p: Pixels, map: GameMap) {
  const S = MAP_SIZE;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (map.terrain[x + y * S] !== Terrain.Farm) continue;
      for (let i = 0; i < 3; i++) {
        if (hash2(x * 3 + i, y * 5) < 0.45) continue;
        const w = gridToWorld(x + (i + 0.5) / 3, y + 0.7);
        p.set(w.x, w.y, 0x3f8f3a);
        p.set(w.x - 1, w.y - 1, 0x6dbd49);
        p.set(w.x + 1, w.y - 1, 0x6dbd49);
        p.set(w.x, w.y - 1, 0x4c9a3e);
      }
    }
  }
}
