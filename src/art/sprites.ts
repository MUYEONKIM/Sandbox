/** public/sprites 폴더의 이미지를 게임 시작 전에 한 번에 읽어 둔다. */
const NAMES = [
  'Smoke0000',
  'Smoke0001',
  'Smoke0002',
  'board',
  'castle',
  'chapel',
  'clock',
  'crops',
  'firtree',
  'fish',
  'fruit',
  'house',
  'inn',
  'oaktree',
  'pinetree',
  'tailor',
  'tavern',
  'team',
  'team-back',
  'thatched',
  'tiles',
  'treehouse',
  'villa',
  'watchtower',
  ...Array.from({ length: 11 }, (_, i) => `wal${String(i).padStart(4, '0')}`),
] as const;

export type SpriteName = (typeof NAMES)[number];

const images = new Map<string, HTMLImageElement>();

export function spriteUrl(name: string) {
  return `sprites/${name}.png`;
}

function loadImage(name: string) {
  return new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      images.set(name, image);
      resolve();
    };
    image.onerror = () => reject(new Error(`이미지를 읽지 못했습니다: ${name}`));
    image.src = spriteUrl(name);
  });
}

export async function loadSprites() {
  await Promise.all(NAMES.map(loadImage));
}

export function sprite(name: SpriteName) {
  const image = images.get(name);
  if (!image) throw new Error(`읽지 않은 이미지입니다: ${name}`);
  return image;
}

/** 이미지의 픽셀 값을 읽어 온다. */
export function spritePixels(name: SpriteName) {
  const image = sprite(name);
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, image.width, image.height);
}

const groundPoints = new Map<string, { x: number; y: number }>();

function findGroundPoint(name: SpriteName) {
  const { data, width, height } = spritePixels(name);
  for (let y = height - 1; y >= 0; y--) {
    let sum = 0;
    let count = 0;
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < 128) continue;
      sum += x;
      count++;
    }
    if (count) return { x: sum / count, y };
  }
  return { x: width / 2, y: height };
}

/** 이미지에서 땅에 닿는 지점을 찾는다: 가장 아래 줄의 가운데다. */
export function groundPoint(name: SpriteName) {
  let point = groundPoints.get(name);
  if (!point) {
    point = findGroundPoint(name);
    groundPoints.set(name, point);
  }
  return point;
}
