import type Phaser from 'phaser';
import { sprite } from './sprites';

/**
 * 횃불 그림과 밤 빛(2026-11-24 사용자 "횃불도 추가해서 밤 같은 경우 자기 반경 어느정도 범위로 아침처럼 밝게 보이도록 하는 아이템을 추가한다",
 * 견본에서 "어둠 걷음 + 따뜻한 빛 (추천)"을 고름). 그림과 숫자는 디자인 세션 공유 노트 torch.md와 art-source/torch/out/torch.json 그대로다.
 */

/** 들고 있는 횃불 시트(public/sprites/torch/torch-held.png): 7 × 22 그림이 1줄은 화면 왼쪽을 볼 때, 2줄은 오른쪽을 볼 때(좌우 뒤집음) 불꽃 4장 */
export const TORCH_TEXTURE = 'torch-held';
const FRAME_W = 7;
const FRAME_H = 22;
/** 손잡이 점(그림 안): 손 자리에 맞추는 점 */
export const TORCH_GRIP = { x: 3, y: 17 };
/** 손잡이 점을 둘 자리(발 = 칸 가운데 기준, 아트 px). 캐릭터 그림을 뒤집지 않으면 left, 뒤집으면 right */
export const TORCH_HAND = { left: { dx: 6, dy: -10 }, right: { dx: -7, dy: -10 } };
/** 불꽃 가운데(그림 안). 발에서 위로 21px이다. */
export const TORCH_FLAME = { x: 3.5, y: 6 };
/** 불꽃 장 차례와 한 장 시간 */
export const TORCH_ORDER = [0, 1, 2, 3, 2, 1];
export const TORCH_FRAME_MS = 120;

/** 들고 있는 횃불 텍스처와 프레임(`torch-l0`~`torch-r3`)을 한 번 등록한다. */
export function ensureTorchTexture(scene: Phaser.Scene) {
  if (scene.textures.exists(TORCH_TEXTURE)) return;
  const texture = scene.textures.addImage(TORCH_TEXTURE, sprite('torch/torch-held'))!;
  for (let i = 0; i < 4; i++) {
    texture.add(`torch-l${i}`, 0, i * (FRAME_W + 1), 0, FRAME_W, FRAME_H);
    texture.add(`torch-r${i}`, 0, i * (FRAME_W + 1), FRAME_H + 1, FRAME_W, FRAME_H);
  }
}

/** 칸 거리 → 화면 타원: 칸 1개가 가로 16√2, 세로 8√2 아트 px */
const TILE_RX = 16 * Math.SQRT2;
const TILE_RY = 8 * Math.SQRT2;
/** 어둠 걷기: 이 칸 수 안은 덮개 0(아침), CLEAR~EDGE는 4계단으로 어두워지고, 밖은 그대로 */
const CLEAR_TILES = 4;
const EDGE_TILES = 6;
/** 따뜻한 빛 웅덩이: 반지름 5칸, 가운데 진하기 0.24 × 등 빛 알파 계단 */
const WARM_TILES = 5;
const WARM_ALPHA = 0.24;
export const TORCH_WARM_COLOR = 0xffc070;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
/** 등 빛과 같은 알파 계단(glow.ts STEPS) */
const GLOW_STEPS = [0, 0.18, 0.36, 0.6, 0.9];

/** 가운데에서 칸 거리 */
function tilesFrom(x: number, y: number, cx: number, cy: number) {
  return Math.hypot((x - cx) / TILE_RX, (y - cy) / TILE_RY);
}

export const TORCH_HOLE = 'torch-hole';
export const TORCH_WARM = 'torch-warm';

/**
 * 밤 덮개를 지울 구멍(흰색에 알파만): 가운데 4칸은 알파 1(덮개를 다 지움), 4~6칸은 4계단(바이어 4 × 4로 섞음), 밖은 0.
 * 지우기는 덮개 알파 × (1 − 이 알파)라 계단이 덮개 진하기 0, 1/4, 2/4, 3/4, 1이 된다. 맵에 처음 쓸 때 한 번 만든다.
 */
export function ensureTorchHole(scene: Phaser.Scene) {
  if (scene.textures.exists(TORCH_HOLE)) return;
  const w = Math.ceil(TILE_RX * EDGE_TILES) * 2 + 2;
  const h = Math.ceil(TILE_RY * EDGE_TILES) * 2 + 2;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const data = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = tilesFrom(x + 0.5, y + 0.5, w / 2, h / 2);
      if (r >= EDGE_TILES) continue;
      let cover = 0;
      if (r > CLEAR_TILES) {
        const f = ((r - CLEAR_TILES) / (EDGE_TILES - CLEAR_TILES)) * 4;
        const i = Math.floor(f);
        cover = Math.min(4, f - i > BAYER[(x & 3) + (y & 3) * 4] ? i + 1 : i) / 4;
      }
      const k = (y * w + x) * 4;
      data.data[k] = data.data[k + 1] = data.data[k + 2] = 255;
      data.data[k + 3] = Math.round((1 - cover) * 255);
    }
  }
  ctx.putImageData(data, 0, 0);
  scene.textures.addCanvas(TORCH_HOLE, canvas);
}

/** 따뜻한 빛 웅덩이(가산 혼합, 바닥 깊이): 0xffc070, 반지름 5칸, 알파 0.24 × 등 빛 계단((1 − 거리)^1.4) */
export function ensureTorchWarm(scene: Phaser.Scene) {
  if (scene.textures.exists(TORCH_WARM)) return;
  const w = Math.ceil(TILE_RX * WARM_TILES) * 2;
  const h = Math.ceil(TILE_RY * WARM_TILES) * 2;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const data = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = tilesFrom(x + 0.5, y + 0.5, w / 2, h / 2) / WARM_TILES;
      if (d >= 1) continue;
      const f = (1 - d) ** 1.4 * (GLOW_STEPS.length - 1);
      const i = Math.floor(f);
      const a = GLOW_STEPS[Math.min(GLOW_STEPS.length - 1, f - i > BAYER[(x & 3) + (y & 3) * 4] ? i + 1 : i)];
      const k = (y * w + x) * 4;
      data.data[k] = (TORCH_WARM_COLOR >> 16) & 255;
      data.data[k + 1] = (TORCH_WARM_COLOR >> 8) & 255;
      data.data[k + 2] = TORCH_WARM_COLOR & 255;
      data.data[k + 3] = Math.round(a * WARM_ALPHA * 255);
    }
  }
  ctx.putImageData(data, 0, 0);
  scene.textures.addCanvas(TORCH_WARM, canvas);
}
