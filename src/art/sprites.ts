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
  // 시작마을 동굴 입구(디자인 세션 art-source/adventure, 2026-11-17). 기존 던전 입구다. -x는 문이 오른쪽 면이다.
  'cave-x',
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
  // 무기 강화 금빛(2026-11-28, 디자인 세션 16 art-source/weapon-glow/out/final, src/art/goldArt.ts가 칸 자리): 손에 든 그림·밤 빛·아이콘,
  // +30 칼자국·총구 터짐·총알. 게임 텍스처는 처음 금빛 무기를 그릴 때 올린다(src/game/weaponGlow.ts).
  'forge/gold-held',
  'forge/gold-light',
  'forge/gold-icons',
  'forge/gold-slash',
  'forge/gold-muzzle',
  'forge/gold-bullet',
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
  'work-wheelbarrow',
  'work-wheelbarrow-x',
  'work-dock',
  'work-boat',
  'work-bench',
  'work-bench-x',
  'work-rodrack',
  'work-tackle',
  'work-dryrack',
  'work-lantern',
  // 농장 꾸밈(2026-11-16, 디자인 세션 farm-decor.md, src/game/farmLayout.ts)
  'farm-haystack',
  'farm-bales',
  'farm-bales-x',
  'farm-well',
  'farm-shed',
  'farm-shed-x',
  'farm-fence',
  'farm-fence-x',
  // 횃불(2026-11-24, 디자인 세션 art-source/torch, 공유 노트 torch.md): 아이콘 20 × 20, 들고 있는 그림 7 × 22 불꽃 4장 × 2방향
  'torch/torch-icon',
  'torch/torch-held',
  // 방 꾸미기 장식품(2026-11-24, 디자인 세션 3·5, src/roomDecor.ts). 장식품 두 장, 놓는 벽, 바닥 타일, 벽지 두 장, 바깥용 장식품
  'room/room-decor',
  'room/room-decor-more',
  'room/room-walls',
  'room/room-tiles',
  'room/wall-textures',
  'room/wall-textures-more',
  'room/outdoor-decor',
  // 방 꾸미기 새 거리(2026-11-27, src/roomUse.ts). 디자인 세션 5: 가구·장식품, 놓는 벽·높은 벽·구멍 벽, 문·창문·커튼, 바닥 타일, 벽지.
  // 디자인 세션 8: 단·계단·천장 것, 난간, 앉은·누운 자세
  'room/room-decor-3',
  'room/room-walls-3',
  'room/room-openings',
  'room/room-tiles-3',
  'room/wall-textures-3',
  'room/new-decor',
  'room/new-rails',
  'room/poses',
  // 방 꾸미기 4차(디자인 세션 5: 러그·탁자·벽 조명·벽걸이 TV·벽 장식·탁상 소품, 새 창문)와 연말·크리스마스 묶음(디자인 세션 8)
  'room/room-decor-4',
  'room/room-decor-4-sides',
  'room/room-openings-4',
  'room/room-decor-xmas',
  // 발코니(2026-11-27, 디자인 세션 8): 바탕 그림, 앞 난간 조각, 방 안쪽 문과 발코니 쪽 문의 여닫힘 네 장. 야경 층은 그 맵에 들어갈 때 따로 읽는다.
  'balcony/balcony-base',
  'balcony/rail-x',
  'balcony/rail-y',
  'balcony/rail-corner',
  'balcony/door-room-frames',
  'balcony/door-balcony-frames',
  // 시작마을 빌라(2026-11-27, 디자인 세션 11 villa.md): 마을 겉모습·앞뜰 벤치, 로비·복도·옥상 층 그림, 현관문 여닫힘 두 벌, 옥상 소품. 옥상 풍경은 cityViews.ts가 따로 읽는다.
  'villa/house',
  'villa/bench-out',
  'villa/lobby',
  'villa/hall',
  'villa/roof',
  'villa/door-hall-frames',
  'villa/door-room-frames',
  'villa/tank',
  'villa/laundry',
  'villa/tub-red',
  'villa/tub-blue',
  'villa/bench',
  // 캠프파이어(2026-11-28, 디자인 세션 14 art-source/campfire/final/sprites): 시작마을 2×2칸 모닥불·광장·산길 아치와 캠프파이어 맵 소품.
  // 맵 밖 하늘·별·산·숲 층과 별똥별은 그 맵에 들어갈 때 따로 읽는다(campfire.ts CampSky).
  // 2판·넓힌 맵(같은 날): 마을 통나무 셋·그루터기(vlog-*, vstump), 산길 둘레 덤불·바위(마을과 캠프파이어 맵이 같이 씀),
  // 캠프파이어 맵 큰 불·불티·통나무 넷·그루터기·어린 전나무. 1판 불(flame, flare)과 통나무(log-x·y, log-x2·y2)는 뺐다.
  'campfire/pit2',
  'campfire/flame2',
  'campfire/vlog-ne',
  'campfire/vlog-nw',
  'campfire/vlog-sw',
  'campfire/vstump',
  'campfire/plaza2',
  'campfire/woodpile',
  'campfire/pit',
  'campfire/blaze',
  'campfire/blaze-flare',
  'campfire/embers',
  'camp/bush-a',
  'camp/bush-b',
  'camp/rock-m',
  'camp/rock-s',
  'camp/log-a',
  'camp/log-b',
  'camp/log-c',
  'camp/log-d',
  'camp/stump',
  'camp/fir-s',
  'camp/fir-m',
  'camp/arch-y',
  'camp/arch-x',
  'camp/floor',
  'camp/chair',
  'camp/chair-x',
  'camp/tent-a',
  'camp/tent-b',
  'camp/lantern',
  'camp/grill',
  'camp/log-throw',
  'camp/sparks',
  // 출입문과 NPC(2026-11-28, 디자인 세션 13 art-source/doors-npc/final/sprites): 마을 건물 문 여닫힘(건물마다 한 줄, 4장),
  // 건물 안 나가는 문 여닫힘(방마다 한 줄, 48 × 81 4장), NPC(한 줄에 22 × 40 5장). 나가는 문 텍스처는 건물 안에 있을 때만 GPU에 둔다.
  'doors/village-doors',
  'doors/exit-doors',
  // 상점 문 앞 붉은 테 매트(2026-11-28 상점 입구 안 A). 마을 바닥 그림에 한 번 칠한다.
  'doors/mat-red',
  'npcs',
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
    // 캠프파이어 그림은 바닥 아래 꼭짓점 줄이 비어 있어 그림 맨 아래 줄(높이 − 1)이 땅 줄이다(디자인 세션 14 campfire.json groundPointY).
    const image = name.startsWith('campfire/') || name.startsWith('camp/') ? sprite(name) : null;
    point = image ? { x: image.width / 2, y: image.height - 1 } : findGroundPoint(name);
    groundPoints.set(name, point);
  }
  return point;
}
