import { paintWall } from './art/walls';

/**
 * 블록 목록. 새 블록은 여기에 한 줄 추가하면 인벤토리, 설치, 충돌에 모두 반영된다.
 * solid가 true면 캐릭터가 지나갈 수 없고, tint는 벽 그림에 입힐 색이다.
 */
export const BLOCKS = {
  stone: { name: '돌벽', solid: true, tint: null },
  brick: { name: '벽돌벽', solid: true, tint: 0xf0a088 },
  wood: { name: '나무벽', solid: true, tint: 0xd8b078 },
  hedge: { name: '덤불벽', solid: true, tint: 0x8fdc80 },
} as const satisfies Record<string, { name: string; solid: boolean; tint: number | null }>;

export type BlockId = keyof typeof BLOCKS;

export const BLOCK_IDS = Object.keys(BLOCKS) as BlockId[];

export function paintBlock(id: BlockId, variant = 0): HTMLCanvasElement {
  return paintWall(variant, BLOCKS[id].tint);
}
