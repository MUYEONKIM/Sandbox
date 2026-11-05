import { paintCube, type FaceShader } from './art/cube';
import { frac, hash2, vnoise } from './art/pixels';

const faceSeed = { top: 3, left: 11, right: 29 } as const;

const stoneShader: FaceShader = (face, u, v) => {
  const rows = v * 3;
  const row = Math.floor(rows);
  const cols = u * 2 + (row % 2) * 0.5;
  if (frac(rows) < 0.14 || frac(cols) < 0.08) return 0x6f7480;
  const n = hash2(row * 7 + faceSeed[face], Math.floor(cols) * 13);
  return [0xa7adb5, 0xb7bcc2, 0x9aa0aa, 0xc3c7cb][Math.floor(n * 4)];
};

const brickShader: FaceShader = (face, u, v) => {
  const rows = v * 4;
  const row = Math.floor(rows);
  const cols = u * 2 + (row % 2) * 0.5;
  if (frac(rows) < 0.18 || frac(cols) < 0.06) return 0xd6c4ae;
  const n = hash2(row * 5 + faceSeed[face], Math.floor(cols) * 17);
  return [0xb4503c, 0xc25f46, 0xa64632, 0xcb6d50][Math.floor(n * 4)];
};

const woodShader: FaceShader = (face, u, v) => {
  const across = (face === 'top' ? v : u) * 4;
  const along = face === 'top' ? u : v;
  const plank = Math.floor(across);
  if (frac(across) < 0.1) return 0x6a4526;
  const base = [0xb98a52, 0xc99a60, 0xad7f49, 0xc08f56][Math.floor(hash2(plank, faceSeed[face]) * 4)];
  return hash2(plank * 3, Math.floor(along * 9)) > 0.82 ? 0xa0733f : base;
};

const hedgeShader: FaceShader = (face, u, v) => {
  const n = vnoise(u * 6 + faceSeed[face], v * 6) * 0.7 + hash2(Math.floor(u * 16), Math.floor(v * 16)) * 0.3;
  return [0x2c7a3c, 0x38934a, 0x4cab52, 0x6cc261][Math.min(3, Math.floor(n * 4))];
};

/**
 * 블록 목록. 새 블록은 여기에 한 줄 추가하면 인벤토리, 설치, 충돌에 모두 반영된다.
 * solid가 true면 캐릭터가 지나갈 수 없다.
 */
export const BLOCKS = {
  stone: { name: '돌벽', solid: true, shader: stoneShader },
  brick: { name: '벽돌벽', solid: true, shader: brickShader },
  wood: { name: '나무벽', solid: true, shader: woodShader },
  hedge: { name: '덤불벽', solid: true, shader: hedgeShader },
} as const satisfies Record<string, { name: string; solid: boolean; shader: FaceShader }>;

export type BlockId = keyof typeof BLOCKS;

export const BLOCK_IDS = Object.keys(BLOCKS) as BlockId[];

export function paintBlock(id: BlockId): HTMLCanvasElement {
  return paintCube(BLOCKS[id].shader);
}
