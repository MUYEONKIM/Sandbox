import { assetUrl } from '../assetUrl';
import { MAP_SIZE } from '../config';
import type { Tile } from './world';

/**
 * 모험 맵 열세 장과 맵 위 몬스터 자료(2026-11-18 밤 맵 열세 장·몬스터 한 마리씩, 디자인 세션 공유 노트 adventure-maps13.md, adventure-monsters.md).
 * 게임은 public/sprites/adventure/의 디자인 세션 자료를 그대로 읽는다.
 * - adv-maps.json(version 2, 원본 art-source/adventure/maps/adv-maps.json): 맵 모양, 바닥, 꾸밈, 포탈(도착 칸 at), 몬스터(맵마다 monsters),
 *   돌아오는 자리(back), 보스·중간 보스 칸, 되돌림 칸, 일곱 빛, 별, 지역 여덟(zones). 띠는 없다.
 * - infernus.png, infernus-floor.png, infernus.json: 꾸밈 조각
 * - monsters.json, monsters.webp: 떠 있는 몬스터 59마리 그림(칸, 발밑 점, 역할, 맵, 지역, 자리, 임시 이름). 그림 파일 이름은 json의 image 값,
 *   그림은 2배 해상도(scale 0.5)
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
  /** 지역 포탈(입구 맵), 다음 지역, 같은 지역 다음 맵, 앞 맵 */
  kind: 'zone' | 'next' | 'next_map' | 'prev_map';
  /** 입구 맵 지역 포탈의 지역 번호(1~8) */
  zone?: number;
  to: string;
  /** 타고 가면 서는 칸(다음 맵·지역은 그 맵 입구, 앞 맵은 그 맵의 돌아오는 자리) */
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
  /** monsters.json 프레임 id */
  art: string;
  name: string;
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
  /** 지역 안 몇째 맵 / 몇 장 */
  part?: number;
  parts?: number;
  /** 앞 맵 포탈로 이 맵에 돌아올 때 서는 칸 */
  back?: Tile;
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

let loaded: Loaded | null = null;
let loading: Promise<Loaded> | null = null;

function image(name: string) {
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

/** 맵 자료(몬스터 포함), Infernus 그림, 몬스터 그림을 한 번 읽는다(약 1.5MB, 처음 한 번). */
export function loadAdventureMaps() {
  loading ??= Promise.all([
    json<{ maps: Record<string, AdvMapData> }>('adv-maps.json'),
    json<InfernusMeta>('infernus.json'),
    image('infernus.png'),
    image('infernus-floor.png'),
    json<MonsterMeta>('monsters.json').then(async (m) => [m, await image(m.image ?? 'monsters.png')] as const),
  ]).then(([data, meta, pieces, floorPieces, [monsters, monsterSheet]]) => {
    loaded = { maps: data.maps, meta, pieces, floorPieces, monsters, monsterSheet };
    monsterCache.clear();
    return loaded;
  });
  loading.catch(() => (loading = null));
  return loading;
}

export const adventureMapsReady = () => loaded !== null;

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
  const legend = data.lights?.legend ?? [];
  const out = (data.monsters ?? [])
    .filter((m) => loaded!.monsters.frames[m.art])
    .map((m): FieldMonster => {
      const bonus = m.light !== undefined && m.light !== null ? (legend[m.light]?.key ?? null) : m.exp === 3 ? 'exp3' : null;
      return { x: m.x, y: m.y, art: m.art, kind: m.role === 'mid' ? 'mini' : m.role, level: m.level, slot: m.role === 'mid' ? m.slot : '', bonus };
    });
  monsterCache.set(id, out);
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
