/**
 * 모험 지역 아틀라스 밝기(2026-11-22 사용자 "모험에서 전체적으로 너무 안보인다. 모험 뒷 배경도 어둡고 타일도 전반적으로 어두워서 분간이 잘 안된다.",
 * 고른 것 "이 숫자 그대로 (추천)", PM 전달). 숫자는 디자인 세션 노트 adventure-brightness.md 4절, 셈은 art-source/adventure/maps/brightness/lut.js와 같다.
 * 지역 아틀라스(바닥 타일과 서 있는 조각)와 물 칸(tiles.png 사본)을 읽을 때 한 번 바꾼다. 매 프레임 하는 일은 없다.
 */
export interface Bright {
  gamma?: number;
  gain?: number;
  contrast?: number;
  lift?: number;
  sat?: number;
}

/** 지역 아틀라스 이름 → 바닥(아틀라스)·물(tiles.png) 밝기. 일곱 빛(rainbow), 뼈 사막(bone-desert), 용의 둥지(dragon-lair)는 그대로다. */
export const AREA_BRIGHT: Record<string, { ground?: Bright; water?: Bright }> = {
  gate: { ground: { gamma: 1.15 } },
  plains: { ground: { gamma: 1.7, sat: 1.35 }, water: { gamma: 1.35 } },
  hell: { ground: { gamma: 1.35 } },
  'tangled-forest': { ground: { gamma: 2.1, sat: 1.05 } },
  cliff: { ground: { gamma: 1.15, contrast: 1.08 } },
  cloud: { ground: { gamma: 1.2 } },
  stars: { ground: { gamma: 1.35 } },
  'shadow-cave': { ground: { gamma: 1.65 } },
  abyss: { ground: { gamma: 1.35 }, water: { gamma: 1.3 } },
  marsh: { ground: { gamma: 1.4 }, water: { gamma: 1.3, sat: 1.1 } },
  'cursed-castle': { ground: { gamma: 1.2 } },
  volcano: { ground: { gamma: 1.35 } },
};

/** 채널 값 0~255 → 바꾼 값. 감마 v^(1/gamma) → 대비 (v - 0.5) × contrast + 0.5 → v × gain + lift → 0~1로 자름. */
export function makeLut(p: Bright = {}) {
  const { gamma = 1, gain = 1, contrast = 1, lift = 0 } = p;
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    let v = Math.pow(i / 255, 1 / gamma);
    v = (v - 0.5) * contrast + 0.5;
    v = v * gain + lift;
    lut[i] = Math.round(Math.max(0, Math.min(1, v)) * 255);
  }
  return lut;
}

/**
 * 그림 한 장을 p로 바꾼 새 canvas. 알파 0 픽셀은 건너뛰고 알파는 그대로 둔다. p가 없으면 원본을 그대로 돌려준다.
 * canvas는 CPU 쪽(willReadFrequently)이라 Phaser 텍스처로 올릴 때 빠르다(이름표 묶음과 같음).
 */
export function bake<T extends HTMLImageElement | HTMLCanvasElement>(image: T, p: Bright | undefined): T | HTMLCanvasElement {
  if (!p) return image;
  const { width, height } = image;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, width, height);
  const px = data.data;
  const lut = makeLut(p);
  const s = p.sat ?? 1;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    let r = lut[px[i]];
    let g = lut[px[i + 1]];
    let b = lut[px[i + 2]];
    if (s !== 1) {
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      r = y + (r - y) * s;
      g = y + (g - y) * s;
      b = y + (b - y) * s;
    }
    // Uint8ClampedArray가 0~255로 자르고 반올림한다.
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  }
  context.putImageData(data, 0, 0);
  return canvas;
}
