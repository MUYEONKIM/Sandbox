/** 0xRRGGBB */
export type Color = number;

export const frac = (v: number) => v - Math.floor(v);
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** 같은 좌표에는 항상 같은 값을 주는 0~1 해시 */
export function hash2(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/** t(0~1)를 팔레트 색으로 바꾼다. 경계는 도트 디더링으로 섞는다. */
export function ramp(palette: Color[], t: number, x: number, y: number): Color {
  const i = Math.floor(clamp01(t) * (palette.length - 1) + BAYER[(x & 3) + (y & 3) * 4]);
  return palette[Math.min(i, palette.length - 1)];
}

export function shade(c: Color, f: number): Color {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * f));
  const b = Math.min(255, Math.round((c & 255) * f));
  return (r << 16) | (g << 8) | b;
}

export class Rng {
  constructor(private seed: number) {}

  next(): number {
    this.seed = (this.seed + 0x6d2b79f5) | 0;
    let t = Math.imul(this.seed ^ (this.seed >>> 15), 1 | this.seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.next() * list.length)];
  }
}

type Vec = readonly [number, number];

/** 픽셀을 직접 찍어 canvas를 만드는 작은 도화지 */
export class Pixels {
  private readonly image: ImageData;
  private readonly data: Uint32Array;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.image = new ImageData(w, h);
    this.data = new Uint32Array(this.image.data.buffer);
  }

  set(x: number, y: number, c: Color, a = 255) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const r = (c >> 16) & 255;
    const g = (c >> 8) & 255;
    const b = c & 255;
    this.data[y * this.w + x] = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }

  private opaque(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    return this.data[y * this.w + x] >>> 24 > 200;
  }

  private rgbAt(i: number): Color {
    const v = this.data[i];
    return ((v & 255) << 16) | (v & 0xff00) | ((v >> 16) & 255);
  }

  rect(x: number, y: number, w: number, h: number, c: Color) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c);
  }

  line(x0: number, y0: number, x1: number, y1: number, c: Color) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i++) {
      this.set(Math.round(x0 + ((x1 - x0) * i) / steps), Math.round(y0 + ((y1 - y0) * i) / steps), c);
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: Color, a = 255) {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c, a);
      }
    }
  }

  /** 평행사변형을 칠한다. shader는 면 위의 (u,v)를 받아 색을 돌려준다. null이면 건너뛴다. */
  parallelogram(o: Vec, a: Vec, b: Vec, shader: (u: number, v: number) => Color | null) {
    const det = a[0] * b[1] - a[1] * b[0];
    const xs = [o[0], o[0] + a[0], o[0] + b[0], o[0] + a[0] + b[0]];
    const ys = [o[1], o[1] + a[1], o[1] + b[1], o[1] + a[1] + b[1]];
    const x0 = Math.floor(Math.min(...xs));
    const x1 = Math.ceil(Math.max(...xs));
    const y0 = Math.floor(Math.min(...ys));
    const y1 = Math.ceil(Math.max(...ys));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const dx = x + 0.5 - o[0];
        const dy = y + 0.5 - o[1];
        const u = (dx * b[1] - dy * b[0]) / det;
        const v = (a[0] * dy - a[1] * dx) / det;
        if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
        const c = shader(u, v);
        if (c !== null) this.set(x, y, c);
      }
    }
  }

  /** 불투명 영역 바깥에 1픽셀 테두리를 두른다. */
  outlineOuter(c: Color) {
    const targets: number[] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.opaque(x, y)) continue;
        if (this.opaque(x - 1, y) || this.opaque(x + 1, y) || this.opaque(x, y - 1) || this.opaque(x, y + 1)) {
          targets.push(x, y);
        }
      }
    }
    for (let i = 0; i < targets.length; i += 2) this.set(targets[i], targets[i + 1], c);
  }

  /** 불투명 영역 가장자리 픽셀을 어둡게 한다. */
  outlineInner(f: number) {
    const targets: number[] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!this.opaque(x, y)) continue;
        if (!this.opaque(x - 1, y) || !this.opaque(x + 1, y) || !this.opaque(x, y - 1) || !this.opaque(x, y + 1)) {
          targets.push(y * this.w + x);
        }
      }
    }
    for (const i of targets) {
      this.set(i % this.w, Math.floor(i / this.w), shade(this.rgbAt(i), f));
    }
  }

  toCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = this.w;
    canvas.height = this.h;
    canvas.getContext('2d')!.putImageData(this.image, 0, 0);
    return canvas;
  }
}
