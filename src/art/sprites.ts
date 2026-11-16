import { assetUrl } from '../assetUrl';

/** public/sprites 폴더의 이미지를 게임 시작 전에 한 번에 읽어 둔다. */
const NAMES = [
  'Smoke0000',
  'Smoke0001',
  'Smoke0002',
  'block-textures',
  'board',
  'bull',
  'cabin',
  'cafe-table',
  'castle',
  'chapel',
  'clock',
  'counter',
  'crops',
  'exchange',
  'firtree',
  'fish',
  'fruit',
  'furniture',
  'house',
  'inn',
  'oaktree',
  'pinetree',
  'plant',
  'tailor',
  'tavern',
  'team',
  'team-back',
  'thatched',
  'tiles',
  'treehouse',
  'villa',
  'watchtower',
  // 던전 몬스터(art-source/monsters/make-monsters.cjs)
  'monsters/orc',
  'monsters/soldier',
  'monsters/demon',
  'monsters/blood',
  // 상점 안 소품(디자인 세션, art-source/interior/make-props.cjs). -x는 앞면이 +x로 돌아간 그림이다.
  'mart-counter',
  'mart-counter-x',
  'mart-shelf-fruit',
  'mart-shelf-fruit-x',
  'mart-shelf-goods',
  'mart-shelf-goods-x',
  'mart-shelf-drinks',
  'mart-shelf-drinks-x',
  'mart-fridge',
  'mart-fridge-x',
  // 체력 포션(newassets/포션의 potion86, 90, 87)
  'potions/small',
  'potions/medium',
  'potions/large',
  // 농장 작물(art-source/farm/make-crops.cjs)
  'farm/crops',
  // 대장간 건물과 안 소품(디자인 세션, 2026-11-15). 이름에 -x가 붙은 소품은 앞면이 오른쪽 면이다.
  'smithy',
  'smithy-forge',
  'smithy-forge-x',
  'smithy-anvil',
  'smithy-anvil-x',
  'smithy-weapon-rack',
  'smithy-weapon-rack-x',
  'smithy-armor-stand',
  'smithy-armor-stand-x',
  'smithy-case',
  'smithy-case-x',
  'smithy-barrel',
  'smithy-coal',
  // 대장간 무기: 손에 든 그림과 아이콘(src/art/forgeArt.ts가 칸 자리)
  'forge/held',
  'forge/icons',
  // 건물 안 다시 꾸미기 소품 28장(디자인 세션, 2026-11-16, interior-restyle.md)
  'mart-freezer',
  'mart-freezer-x',
  'mart-coffee',
  'mart-coffee-x',
  'mart-baskets',
  'mart-pallet',
  'casino-slot',
  'casino-slot-x',
  'casino-roulette',
  'casino-cashier',
  'casino-cashier-x',
  'exchange-desk',
  'exchange-desk-x',
  'exchange-kiosk',
  'exchange-kiosk-x',
  'office-server',
  'office-server-x',
  'office-bookshelf',
  'office-bookshelf-x',
  'office-cooler',
  'office-cooler-x',
  'office-printer',
  'office-printer-x',
  'lobby-vending',
  'lobby-vending-x',
  'roof-hvac',
  'roof-solar',
  'roof-solar-x',
  // 노동청·농협 안 소품(디자인 세션, 2026-11-16, labor-coop-rooms.md). 쓰는 것만 읽는다.
  'labor-counter',
  'labor-lockers',
  'labor-toolrack',
  'labor-bench-x',
  'labor-ticket',
  'coop-counter',
  'coop-seeds',
  'coop-seeds-x',
  'coop-seedlings',
  'coop-seedlings-x',
  'coop-sacks',
  'coop-crates',
  'coop-scale-x',
  // 작업장 네 곳 소품(디자인 세션, 2026-11-16, workplace-art.md, src/game/workLayouts.ts). 쓰는 것만 읽는다.
  'work-cliff',
  'work-cliff-x',
  'work-crane',
  'work-cart',
  'work-rubble',
  'work-blocks',
  'work-logpile',
  'work-logpile-x',
  'work-sawhorse',
  'work-firewood',
  'work-stump',
  'work-campfire',
  'work-fruittree',
  'work-bush',
  'work-scarecrow',
  'work-basket',
  'work-wheelbarrow-x',
  'work-dock',
  'work-boat',
  'work-bench',
  'work-bench-x',
  'work-rodrack',
  'work-tackle',
  'work-dryrack',
  'work-lantern',
] as const;

export type SpriteName = (typeof NAMES)[number];

const images = new Map<string, HTMLImageElement>();

export function spriteUrl(name: string) {
  return assetUrl(`sprites/${name}.png`);
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
