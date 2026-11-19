import { assetUrl } from '../assetUrl';
import { advMap } from '../game/adventureMaps';
import { sprite } from './sprites';

/**
 * 모험 화면 그림(2026-11-17 디자인 세션 art-source/adventure, 공유 노트 adventure-ui.md). 그림은 public/sprites/adventure/에 있다.
 * 모험 창을 열거나 모험 필드에 들어갈 때 한 번 읽는다(게임 시작 때 읽지 않음). 아래 표는 디자인 세션 JSON(adv-heroes.json,
 * adv-items.json)을 옮겨 적은 것이다. 그림을 다시 만들면 함께 고친다.
 * 몬스터 그림은 맵 위 몬스터와 같은 몬스터 그림(monsters.json의 image, adventureMaps.ts)를 쓴다(2026-11-18). 예전 옆모습 몬스터 넷과 색 단계는 쓰지 않는다.
 */

/** 내 캐릭터 전투 그림: 줄 = 캐릭터(필드 캐릭터 시트의 일곱 종), 칸 = 동작 */
export const HERO_ART = {
  cell: { w: 44, h: 46 },
  foot: { x: 21, y: 44 },
  poses: ['idle0', 'idle1', 'attack', 'hit', 'down'],
  /** 무기 쥐는 손 자리(동작마다). 쓰러지면 없다. */
  hand: {
    idle0: { x: 28, y: 32 },
    idle1: { x: 28, y: 32 },
    attack: { x: 34, y: 32 },
    hit: { x: 24, y: 32 },
    down: null,
  } as Record<string, { x: number; y: number } | null>,
};

/**
 * 맵 전투 배경(2026-11-19 디자인 시안 art-source/adventure/battle-bg/bg-board.png, 사용자 확인. 같은 날 새 지역 여섯과 함께 맵마다로 바꿈, 기획 19장):
 * 맵마다 480 × 270 webp 한 장(맵 자료 battleBg, 디자인 세션이 고름. 지금 지역 여덟은 지역의 모든 맵이 같은 그림).
 * 2배로 그리는 전투 캔버스에 240 × 135로 그린다. 함께 읽지 않고 그 배경을 쓰는 맵에서 처음 싸울 때 그 한 장만 읽고
 * 다시 쓴다(loadMapBg, 싸우기를 누르면 소용돌이 동안 받기 시작함). 맵 자료에 없으면 평원 그림.
 */
const bgLoads = new Map<string, Promise<HTMLImageElement>>();
const bgs = new Map<string, HTMLImageElement>();
const bgName = (map: string) => advMap(map)?.battleBg ?? 'dark-plains';

/** 맵 전투 배경 한 장을 읽는다(같은 그림은 처음 한 번, 실패하면 다음에 다시). */
export function loadMapBg(map: string) {
  const name = bgName(map);
  let load = bgLoads.get(name);
  if (!load) {
    load = image(`adv-bg-${name}`, 'webp').then((img) => {
      bgs.set(name, img);
      return img;
    });
    load.catch(() => bgLoads.delete(name));
    bgLoads.set(name, load);
  }
  return load;
}

/** 읽어 둔 맵 전투 배경(아직 못 읽었으면 null) */
export function battleBg(map: string): HTMLImageElement | null {
  return bgs.get(bgName(map)) ?? null;
}

/** 장신구 아이콘(adv-items.png, 32×32 칸): 보석은 스텟, 그 밖의 장신구는 종류로 고른다. */
const ITEM_COL: Record<string, number> = { hp: 0, atk: 1, def: 2, agi: 3, luc: 4, learn: 5, pouch: 6, combo: 7, sharp: 8, leech: 9, endure: 10 };
export const ITEM_ICON = 32;
export const itemIconCol = (kind: string, stat: string | null) => ITEM_COL[kind === 'gem' ? (stat ?? 'hp') : kind] ?? 0;

/** 대표 무기가 없을 때(컬렉션 전) 전투에서 드는 무기: 대장간 손 그림의 장검(에이전트가 정함) */
export const DEFAULT_HELD = 'longsword';

export interface AdventureArt {
  heroes: HTMLImageElement;
  items: HTMLImageElement;
  held: HTMLImageElement;
  /** 컬렉션 무기 216종(adv-weapons.png, 18열 × 32px, 순서는 adventure_weapons.art) */
  weapons: HTMLImageElement;
}

export const WEAPON_CELL = 32;
const WEAPON_COLS = 18;

let loading: Promise<AdventureArt> | null = null;
/** 이미 읽었으면 바로 쓸 수 있다(창을 그릴 때 기다리지 않으려고). */
export let adventureArt: AdventureArt | null = null;

function image(name: string, ext = 'png') {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`이미지를 읽지 못했습니다: ${name}`));
    img.src = assetUrl(`sprites/adventure/${name}.${ext}`);
  });
}

/** 모험 그림 세 장을 한 번 읽는다(무기 그림 87KB 포함). 전투 배경은 지역마다 따로(loadZoneBg). */
export function loadAdventureArt() {
  loading ??= Promise.all(['adv-heroes', 'adv-items', 'adv-weapons'].map((n) => image(n))).then(([heroes, items, weapons]) => {
    adventureArt = { heroes, items, held: sprite('forge/held'), weapons };
    return adventureArt;
  });
  loading.catch(() => (loading = null));
  return loading;
}

/** 장신구 아이콘 한 칸을 그린 32×32 캔버스(그림을 아직 못 읽었으면 빈 칸) */
export function itemIcon(kind: string, stat: string | null) {
  const c = document.createElement('canvas');
  c.width = ITEM_ICON;
  c.height = ITEM_ICON;
  const art = adventureArt;
  if (art) {
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.drawImage(art.items, itemIconCol(kind, stat) * ITEM_ICON, 0, ITEM_ICON, ITEM_ICON, 0, 0, ITEM_ICON, ITEM_ICON);
  }
  return c;
}

/** 무기 칸 하나를 그린 32×32 캔버스(그림을 아직 못 읽었으면 빈 칸) */
export function weaponIcon(art: string) {
  const c = document.createElement('canvas');
  c.width = WEAPON_CELL;
  c.height = WEAPON_CELL;
  const img = adventureArt?.weapons;
  if (img) {
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const n = Number(art);
    g.drawImage(img, (n % WEAPON_COLS) * WEAPON_CELL, Math.floor(n / WEAPON_COLS) * WEAPON_CELL, WEAPON_CELL, WEAPON_CELL, 0, 0, WEAPON_CELL, WEAPON_CELL);
  }
  return c;
}

export interface HeldWeapon {
  /** 무기 그림의 칸 자리 */
  sx: number;
  sy: number;
  /** 쥐는 자리(칸 안 픽셀) */
  grip: { x: number; y: number };
  /** 오른쪽을 보게 돌리는 각도: 검은 칼끝이 오른쪽 위라 45도, 총은 0 */
  turn: number;
}

const heldCache = new Map<string, HeldWeapon>();

/**
 * 대표 무기를 전투에서 드는 법(디자인 세션 adventure-weapons.md): 검은 45도 돌려 오른쪽을 보게 하고 손잡이 끝(불투명 픽셀 가운데
 * 가장 왼쪽 아래)을 쥔다. 총은 그대로 두고 손잡이 쪽(왼쪽 30%, 아래)을 쥔다. 처음 쓸 때 칸 픽셀을 한 번 읽는다.
 */
export function heldWeapon(id: string, art: string): HeldWeapon | null {
  const cached = heldCache.get(id);
  if (cached) return cached;
  const img = adventureArt?.weapons;
  if (!img) return null;
  const n = Number(art);
  const sx = (n % WEAPON_COLS) * WEAPON_CELL;
  const sy = Math.floor(n / WEAPON_COLS) * WEAPON_CELL;
  const c = document.createElement('canvas');
  c.width = WEAPON_CELL;
  c.height = WEAPON_CELL;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, sx, sy, WEAPON_CELL, WEAPON_CELL, 0, 0, WEAPON_CELL, WEAPON_CELL);
  const px = g.getImageData(0, 0, WEAPON_CELL, WEAPON_CELL).data;
  const gun = id.startsWith('gun-');
  let best = { x: 4, y: 28 };
  let score = -Infinity;
  let minX = WEAPON_CELL, maxX = 0, maxY = 0;
  for (let y = 0; y < WEAPON_CELL; y++) {
    for (let x = 0; x < WEAPON_CELL; x++) {
      if (px[(y * WEAPON_CELL + x) * 4 + 3] < 100) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      if (y - x > score) {
        score = y - x;
        best = { x, y };
      }
    }
  }
  const held: HeldWeapon = gun
    ? { sx, sy, grip: { x: Math.round(minX + (maxX - minX) * 0.3), y: maxY - 1 }, turn: 0 }
    : { sx, sy, grip: best, turn: Math.PI / 4 };
  heldCache.set(id, held);
  return held;
}
