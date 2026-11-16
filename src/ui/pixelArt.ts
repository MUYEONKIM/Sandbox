/**
 * 도박장 판(홀짝·사다리)을 도트 그림으로 그리는 도구(2026-11-16 사용자 "홀짝게임, 사다리게임 의 ui가 너무 허접하다",
 * 그림은 디자인 세션 casino-ui.md). 판은 두 배 캔버스(bet.ts STAGE_SCALE)라, 1배 좌표로 칠하면 2배 크기 도트가 된다.
 * 조각 그림(구슬, 그릇, 금화, 덧문, 도트 글자, 강조 고리, 그림자)은 처음 쓸 때 한 번 만들어 두고 찍는다.
 * 매 프레임 픽셀 단위로 칠하는 일은 없다.
 */

type G = CanvasRenderingContext2D;

export const OUT = '#1c120c';
const FONT = "'Malgun Gothic', 'Apple SD Gothic Neo', system-ui, sans-serif";

export function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function rect(g: G, x: number, y: number, w: number, h: number, c: string) {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
}

/** 테두리가 매끈하지 않은(도트) 타원 칠하기. c가 함수면 픽셀마다 색을 고르고, null이면 그 픽셀은 비운다. */
export function ellipse(g: G, cx: number, cy: number, rx: number, ry: number, c: string | ((x: number, y: number) => string | null)) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      if (d > 1) continue;
      const col = typeof c === 'string' ? c : c(x, y);
      if (col) rect(g, x, y, 1, 1, col);
    }
  }
}

/** 타원 고리(두께 t) */
export function ring(g: G, cx: number, cy: number, rx: number, ry: number, t: number, c: string) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      const inner = ((x + 0.5 - cx) / (rx - t)) ** 2 + ((y + 0.5 - cy) / (ry - t)) ** 2;
      if (d <= 1 && inner > 1) rect(g, x, y, 1, 1, c);
    }
  }
}

/** 글자를 1배로 그려 반투명을 잘라 도트 글자로 만들고, 바깥에 1픽셀 테두리를 두른다. */
function pixelText(text: string, size: number, color: string, outline: string) {
  const pad = 3;
  const probe = makeCanvas(1, 1).getContext('2d')!;
  probe.font = `bold ${size}px ${FONT}`;
  const w = Math.ceil(probe.measureText(text).width) + pad * 2;
  const h = size + pad * 2 + 2;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.font = `bold ${size}px ${FONT}`;
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.fillText(text, pad, h / 2 + 1);
  const img = g.getImageData(0, 0, w, h);
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) solid[i] = img.data[i * 4 + 3] >= 120 ? 1 : 0;
  const [r, gg, b] = [1, 3, 5].map((k) => parseInt(color.slice(k, k + 2), 16));
  const [or, og, ob] = [1, 3, 5].map((k) => parseInt(outline.slice(k, k + 2), 16));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let rgb: number[] | null = null;
      if (solid[i]) rgb = [r, gg, b];
      else {
        for (let dy = -1; dy <= 1 && !rgb; dy++) {
          for (let dx = -1; dx <= 1 && !rgb; dx++) if (x + dx >= 0 && x + dx < w && solid[(y + dy) * w + x + dx]) rgb = [or, og, ob];
        }
      }
      img.data[i * 4] = rgb ? rgb[0] : 0;
      img.data[i * 4 + 1] = rgb ? rgb[1] : 0;
      img.data[i * 4 + 2] = rgb ? rgb[2] : 0;
      img.data[i * 4 + 3] = rgb ? 255 : 0;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

const cache = new Map<string, HTMLCanvasElement>();

/** key마다 한 번만 만든다. */
export function once(key: string, make: () => HTMLCanvasElement) {
  let art = cache.get(key);
  if (!art) {
    art = make();
    cache.set(key, art);
  }
  return art;
}

/** 도트 글자 조각(한 번 만들어 둔다) */
export const textArt = (text: string, size: number, color: string, outline = OUT) =>
  once(`t:${text}:${size}:${color}:${outline}`, () => pixelText(text, size, color, outline));

/** 1배 그림을 판에 가운데 맞춰 찍는다. */
export function stamp(ctx: G, art: HTMLCanvasElement, cx: number, cy: number) {
  ctx.drawImage(art, Math.round(cx - art.width / 2), Math.round(cy - art.height / 2));
}

/** w×h 조각 캔버스에 그린다. */
export function piece(w: number, h: number, paint: (g: G) => void) {
  const c = makeCanvas(w, h);
  paint(c.getContext('2d')!);
  return c;
}
