import { assetUrl } from '../assetUrl';
import { MAP_SIZE } from '../config';
import type { Tile } from './world';

/**
 * 모험 맵 열세 장과 맵 위 몬스터 자료(2026-11-18 밤 맵 열세 장·몬스터 한 마리씩, 디자인 세션 공유 노트 adventure-maps13.md, adventure-monsters.md).
 * 게임은 public/sprites/adventure/의 디자인 세션 자료를 그대로 읽는다.
 * - adv-maps.json(version 3, 원본 art-source/adventure/maps/adv-maps.json, 디자인 노트 adventure-maps13.md 8절): 맵 모양, 바닥, 꾸밈, 포탈(도착 칸 at),
 *   몬스터(맵마다 monsters), 돌아오는 자리(back, zoneBack), 보스·중간 보스 칸, 되돌림 칸, 일곱 빛, 별, 지역 여덟(zones). 띠는 없다.
 *   입구 맵 포탈은 평원 1로 가는 하나, 지역 첫 맵에 앞 지역 포탈(prev_zone)(2026-11-18 사용자 "맵은 전체가 다 이어져있는 것이기 떄문에 시작맵에 포탈이 열리는 형식은 맞지않다", "판마다 다시 잡기", 앞 지역 포탈 "둔다 (추천)").
 * - infernus.png, infernus-floor.png, infernus.json: 꾸밈 조각
 * - monsters.json, monsters.webp: 떠 있는 몬스터 59마리 그림(칸, 발밑 점, 역할, 맵, 지역, 자리, 임시 이름). 그림 파일 이름은 json의 image 값,
 *   그림은 2배 해상도(scale 0.5)
 * - monsters-new.json, monsters-new.webp(2026-11-19 새 지역 여섯, 78마리, 844KB, GPU 약 6.7MB): 맵 자료 몬스터의 sheet가 'new'인 것.
 *   처음부터 읽지 않고 그 몬스터가 있는 맵에 들어가기 전에만 읽는다(loadAdventureMaps(map), 렌더링 성능 먼저).
 * - 맵 자료 version 4(2026-11-19, 디자인 노트 adventure-maps-v4.md): 맵 스물다섯 장, 지역 열넷, 맵마다 전투 배경 battleBg, 높은 지역 포탈 jump·gate.
 * 서버 몬스터 표(adventure_spots)와 맵 → 지역 표(adventure_maps)는 monster-spots.json(version 2)과 이 자료로 만든다
 * (공유 노트 code-adventure-tools/monster-rows.cjs). 맵·몬스터를 바꾸면 SQL 행도 다시 만든다.
 * 모험 창에서 들어가거나 모험 맵에서 새로고침할 때 한 번 읽는다(게임 시작 때는 모험 맵에 있을 때만). 맵을 만들기 전에 읽혀 있어야 한다.
 */

export interface AdvSpot extends Tile {
  level: number;
  band?: number;
}
export interface AdvMidSpot extends AdvSpot {
  name: string;
  room: string;
}
export interface AdvBossSpot extends AdvSpot {
  /** 별 하늘 보스방 둘: 'left' / 'right' */
  side?: string;
}
export interface AdvPortalSpot extends Tile {
  /** 입구 맵 포탈(평원 1로 하나), 다음 지역(이번 판에 이 지역 보스를 잡으면 열림), 같은 지역 다음 맵, 앞 맵, 앞 지역(늘 열림),
   * 평원 1의 높은 지역 포탈(화산 폭풍 1로, 늘 열림), 화산 폭풍 1의 입구로 가는 포탈(늘 열림) */
  kind: 'zone' | 'next' | 'next_map' | 'prev_map' | 'prev_zone' | 'jump' | 'gate';
  /** 입구 맵 지역 포탈의 지역 번호(1~8) */
  zone?: number;
  to: string;
  /** 타고 가면 서는 칸(다음 맵·지역은 그 맵 입구, 앞 맵은 그 맵의 돌아오는 자리 back, 앞 지역은 그 지역 마지막 맵의 zoneBack) */
  at: Tile;
  /** 'either': 보스 둘 가운데 하나만 잡아도 열린다(별 하늘) */
  opensBy?: 'either';
}
export interface AdvLights {
  origin: number;
  size: number;
  n: number;
  /** n줄, 줄마다 n글자(빛 번호) */
  rows: string[];
  /** hud: 화면 위 짧은 글("exp x 3" 등, 디자인 세션 자료) */
  legend: { name: string; color: string; bonus: string; key: string; hud?: string }[];
}
/** 맵 위 몬스터 한 마리(맵 자료 monsters, 서버 몬스터 표 한 줄과 같은 칸) */
export interface AdvMonsterSpot extends Tile {
  role: MonsterRole;
  level: number;
  /** 'normal' / 중간 보스 방 이름 / 'boss' 등 */
  slot: string;
  /** monsters.json 프레임 id(sheet가 'new'이면 monsters-new.json 프레임 id) */
  art: string;
  /** 'new': 두 번째 몬스터 그림(새 지역 여섯) */
  sheet?: string;
  name: string | null;
  /** 일곱 빛 들판 빛 번호(lights.legend) */
  light?: number | null;
  /** 경험치 배수(경험치 방 3) */
  exp?: number;
}
export interface AdvMapData {
  id: string;
  name: string;
  /** 지역 번호(입구 맵은 없음) */
  zone?: number;
  /** 지역 이름(입구 맵은 없음). 높은 지역 포탈 이름표 "→ 화산 폭풍"에 쓴다. */
  zoneName?: string;
  /** 이 맵 전투 배경 이름(public/sprites/adventure/adv-bg-<이름>.webp). 입구 맵은 없음 */
  battleBg?: string;
  /** 지역 안 몇째 맵 / 몇 장 */
  part?: number;
  parts?: number;
  /** 앞 맵 포탈로 이 맵에 돌아올 때 서는 칸 */
  back?: Tile;
  /** 지역 마지막 맵: 다음 지역의 앞 지역 포탈로 돌아올 때 서는 칸(보스방 옆). 그 포탈의 at과 같다. */
  zoneBack?: Tile;
  monsters: AdvMonsterSpot[];
  background: string;
  /** 46줄 × 46글자: '.' 땅, '~' 물, ' ' 빈 땅 */
  rows: string[];
  /** 칸마다 tiles.png 번호(36진수 두 글자, '--'는 바닥 없음) */
  floor: string[];
  entry: Tile;
  bosses: AdvBossSpot[];
  mids: AdvMidSpot[];
  portals: AdvPortalSpot[];
  resets: Tile[];
  walls: { x: number; y: number; id: string }[];
  trees: { sprite: string; x: number; y: number }[];
  tileProps: { tile: number; x: number; y: number }[];
  props: { id: string; x: number; y: number }[];
  floors: { id: string; x: number; y: number; clip?: boolean }[];
  lights?: AdvLights;
  stars?: { x: number; y: number; s: number; a: number }[];
}
export interface InfernusPiece {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 칸 가운데에 맞출 그림 안 점 */
  ax: number;
  ay: number;
  /** 막는 칸(fp × fp, 앞 칸이 기준). 0이면 막지 않음 */
  fp: number;
}
export interface InfernusMeta {
  credit: string;
  props: Record<string, InfernusPiece>;
  floors: Record<string, { x: number; y: number; w: number; h: number }>;
}

export type MonsterRole = 'normal' | 'mid' | 'boss';
export interface MonsterFrame {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 발밑 점(그림 아래 가운데) */
  ax: number;
  ay: number;
  role: MonsterRole;
  zone: string;
  /** 'normal' / 중간 보스 방 이름 / 'boss' / 별 하늘 'left'·'right' */
  slot: string;
  /** 임시 이름 */
  name: string;
}
export interface MonsterMeta {
  /** 몬스터 그림 파일 이름(같은 폴더). 없으면 monsters.png */
  image?: string;
  /** 그림 해상도 배율: 그림 1px이 월드 몇 px인지(고해상도 그림이면 0.5처럼). 없으면 1. 월드 크기 = 칸 크기 × scale */
  scale?: number;
  /** 역할마다 높이·뜬 높이·흔들림 폭(월드 px) */
  roles: Record<MonsterRole, { h: number; lift: number; bob: number }>;
  frames: Record<string, MonsterFrame>;
}

/** 맵 위에 뜬 몬스터 하나. 서버 adventure_spots의 한 줄과 같은 칸이다. */
export interface FieldMonster extends Tile {
  /** monsters.json 프레임 id */
  art: string;
  kind: 'normal' | 'mini' | 'boss';
  /** 몬스터 레벨(자료에 몬스터마다 있음, 기획 19장 '몬스터 한 마리씩'). 서버 몬스터 표(adventure_spots)의 레벨과 같다. */
  level: number;
  /** 중간 보스 방 이름(서버 adventure_minis.name과 같음). 아니면 '' */
  slot: string;
  /** 이 자리 전투에 붙는 구역 보너스 키(일곱 빛, 경험치 방 'exp3') */
  bonus: string | null;
}

interface Loaded {
  maps: Record<string, AdvMapData>;
  meta: InfernusMeta;
  pieces: HTMLImageElement;
  floorPieces: HTMLImageElement;
  monsters: MonsterMeta;
  monsterSheet: HTMLImageElement;
}

/** 몬스터 그림 한 장(프레임 자료와 그림, Phaser 텍스처 키) */
export interface MonsterSheet {
  meta: MonsterMeta;
  image: HTMLImageElement;
  key: string;
}

let loaded: Loaded | null = null;
let loading: Promise<Loaded> | null = null;
/** 두 번째 몬스터 그림(새 지역 여섯). 그 몬스터가 있는 맵에 처음 들어갈 때 읽는다. */
let newSheet: MonsterSheet | null = null;
let newSheetLoading: Promise<MonsterSheet> | null = null;

function imageFile(name: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`이미지를 읽지 못했습니다: ${name}`));
    img.src = assetUrl(`sprites/adventure/${name}`);
  });
}

async function json<T>(name: string): Promise<T> {
  const res = await fetch(assetUrl(`sprites/adventure/${name}`));
  if (!res.ok) throw new Error(`자료를 읽지 못했습니다: ${name}`);
  return (await res.json()) as T;
}

/**
 * 맵 자료(몬스터 포함), Infernus 그림, 몬스터 그림을 한 번 읽는다(약 1.5MB, 처음 한 번).
 * map을 주면 그 맵 몬스터가 두 번째 몬스터 그림을 쓸 때 그것도 기다린다(맵을 올리기 전에, 바닥 그림의 몬스터 그림자도 그 그림을 씀).
 */
export async function loadAdventureMaps(map?: string) {
  const base = await loadBaseMaps();
  if (map && needsNewSheet(map)) await loadNewSheet();
  return base;
}

/** 이 맵에 두 번째 몬스터 그림을 쓰는 몬스터가 있는지(맵 자료를 읽은 뒤) */
function needsNewSheet(map: string) {
  return (loaded?.maps[map]?.monsters ?? []).some((m) => m.sheet === 'new');
}

function loadNewSheet() {
  newSheetLoading ??= json<MonsterMeta>('monsters-new.json').then(async (meta) => {
    const image = await imageFile(meta.image ?? 'monsters-new.webp');
    newSheet = { meta, image, key: 'adv-monsters-new' };
    monsterCache.clear();
    return newSheet;
  });
  newSheetLoading.catch(() => (newSheetLoading = null));
  return newSheetLoading;
}

function loadBaseMaps() {
  loading ??= Promise.all([
    json<{ maps: Record<string, AdvMapData> }>('adv-maps.json'),
    json<InfernusMeta>('infernus.json'),
    imageFile('infernus.png'),
    imageFile('infernus-floor.png'),
    json<MonsterMeta>('monsters.json').then(async (m) => [m, await imageFile(m.image ?? 'monsters.png')] as const),
  ]).then(([data, meta, pieces, floorPieces, [monsters, monsterSheet]]) => {
    loaded = { maps: data.maps, meta, pieces, floorPieces, monsters, monsterSheet };
    monsterCache.clear();
    return loaded;
  });
  loading.catch(() => (loading = null));
  return loading;
}

/** 맵 자료를 읽었는지. map을 주면 그 맵이 쓰는 몬스터 그림까지 읽었는지 */
export const adventureMapsReady = (map?: string) => loaded !== null && (!map || !needsNewSheet(map) || newSheet !== null);

/** 몬스터 그림 키로 그 몬스터의 프레임과 그림을 찾는다(두 그림의 키는 겹치지 않음). 아직 못 읽었으면 null */
export function monsterArt(art: string): (MonsterSheet & { frame: MonsterFrame }) | null {
  if (!loaded) return null;
  const old = loaded.monsters.frames[art];
  if (old) return { meta: loaded.monsters, image: loaded.monsterSheet, key: 'adv-monsters', frame: old };
  const next = newSheet?.meta.frames[art];
  return next && newSheet ? { ...newSheet, frame: next } : null;
}

/** 맵 자료. 아직 읽지 않았으면 undefined(맵을 올리기 전에 loadAdventureMaps를 기다린다). */
export function advMap(id: string): AdvMapData | undefined {
  return loaded?.maps[id];
}

export function infernus() {
  return loaded;
}

/** 입구 칸. 자료가 없으면 맵 가운데. */
export function advEntry(id: string): Tile {
  const e = advMap(id)?.entry;
  return e ? { x: e.x, y: e.y } : { x: Math.floor(MAP_SIZE / 2), y: Math.floor(MAP_SIZE / 2) };
}

/** from 맵에서 to 맵으로 가는 포탈의 도착 칸(앞 맵 포탈이면 to 맵의 돌아오는 자리). 없으면 undefined */
export function advArrival(from: string, to: string): Tile | undefined {
  const at = advMap(from)?.portals.find((p) => p.to === to)?.at;
  return at ? { x: at.x, y: at.y } : undefined;
}

const monsterCache = new Map<string, FieldMonster[]>();

/**
 * 맵 위 몬스터: 맵 자료 monsters 그대로(몬스터 한 마리씩, 그림·레벨·빛·경험치 배수가 자료에 있음). 맵마다 한 번 만든다.
 * 보너스 키: 일곱 빛은 lights.legend[light].key, 경험치 방(exp 3)은 'exp3'. 서버 몬스터 줄의 bonus와 같다.
 */
export function monstersOf(id: string): FieldMonster[] {
  const cached = monsterCache.get(id);
  if (cached) return cached;
  const data = advMap(id);
  if (!loaded || !data?.zone) return [];
  // 두 번째 몬스터 그림을 아직 못 읽었으면 그 몬스터는 빼고, 다음에 다시 만든다(남기지 않음).
  const missing = (data.monsters ?? []).some((m) => !monsterArt(m.art));
  const legend = data.lights?.legend ?? [];
  const out = (data.monsters ?? [])
    .filter((m) => monsterArt(m.art))
    .map((m): FieldMonster => {
      const bonus = m.light !== undefined && m.light !== null ? (legend[m.light]?.key ?? null) : m.exp === 3 ? 'exp3' : null;
      return { x: m.x, y: m.y, art: m.art, kind: m.role === 'mid' ? 'mini' : m.role, level: m.level, slot: m.role === 'mid' ? m.slot : '', bonus };
    });
  if (!missing) monsterCache.set(id, out);
  return out;
}

/** 일곱 빛 들판: 칸의 구역 빛(legend 번호). 구역 밖이면 −1 */
export function lightAt(lights: AdvLights | undefined, x: number, y: number) {
  if (!lights) return -1;
  const cx = Math.floor((x - lights.origin) / lights.size);
  const cy = Math.floor((y - lights.origin) / lights.size);
  if (cx < 0 || cy < 0 || cx >= lights.n || cy >= lights.n) return -1;
  return Number(lights.rows[cy][cx]);
}
