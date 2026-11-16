import type Phaser from 'phaser';

/** 그림(텍스처 한 칸)의 알파: 불투명한 픽셀이면 1, 투명하면 0 */
export interface AlphaMask {
  width: number;
  height: number;
  alpha: Uint8Array;
}

const masks = new Map<string, AlphaMask | null>();

/**
 * 그림의 알파 값을 처음 한 번만 캔버스에 그려 읽어 두고 다시 쓴다. 가리기 검사(covers.ts)와 포탈 지키기(keepClear.ts)가 함께 쓴다.
 * Phaser의 textures.getPixelAlpha는 부를 때마다 캔버스에 그려 읽어 한 번에 1ms가 넘게 걸렸다
 * (2026-11-16 블록이 많은 벌목장을 걸을 때 한 프레임이 최대 48ms까지 튄 원인).
 */
export function alphaMask(frame: Phaser.Textures.Frame): AlphaMask | null {
  const key = `${frame.texture.key}|${frame.name}`;
  const cached = masks.get(key);
  if (cached !== undefined) return cached;
  const width = frame.cutWidth;
  const height = frame.cutHeight;
  const source = frame.source.image as CanvasImageSource | undefined;
  let mask: AlphaMask | null = null;
  if (width && height && source) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(source, frame.cutX, frame.cutY, width, height, 0, 0, width, height);
    const data = context.getImageData(0, 0, width, height).data;
    const alpha = new Uint8Array(width * height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3] > 0 ? 1 : 0;
    mask = { width, height, alpha };
  }
  masks.set(key, mask);
  return mask;
}

/** 그림 왼쪽 위에서 (px, py)인 픽셀이 불투명한지. textures.getPixelAlpha(px, py, ...) > 0과 같다(잘린 여백 frame.x·y를 뺀다). */
export function opaqueAt(frame: Phaser.Textures.Frame, px: number, py: number) {
  const mask = alphaMask(frame);
  if (!mask) return false;
  const x = px - frame.x;
  const y = py - frame.y;
  if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) return false;
  return mask.alpha[y * mask.width + x] === 1;
}
