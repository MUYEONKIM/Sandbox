import type { Color } from '../art/pixels';
import { MAP_SIZE } from '../config';
import { GAMES, isGame, type GameId } from './casino';
import { COUNTER_INFO, FLOORS, isTower, PANEL_INFO, type TowerId } from './tower';
import { advEntry, advMap, advArrival, type AdvPortalSpot } from './adventureMaps';

const END = MAP_SIZE - 1;

/** 맵의 네 귀퉁이 칸과 맵 안쪽으로 향하는 방향 */
const CORNERS = {
  top: { x: 0, y: 0, inX: 1, inY: 1 },
  right: { x: END, y: 0, inX: -1, inY: 1 },
  bottom: { x: END, y: END, inX: -1, inY: -1 },
  left: { x: 0, y: END, inX: 1, inY: -1 },
} as const;

type Corner = keyof typeof CORNERS;

/** 포탈에서 나와 서는 칸. 다시 포탈을 타지 않고 포탈 그림에도 가리지 않도록 비껴 선다. */
const LANDING_ALONG = 3;
const LANDING_ACROSS = 1;

/** 포탈 주변은 이만큼 비워 둔다. */
export const PORTAL_MARGIN = 2;

/** 직사각형 구역: x0, y0, x1, y1 (끝 칸 포함) */
export type Area = readonly [number, number, number, number];

export const isInside = ([x0, y0, x1, y1]: Area, x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

export type WorkId = 'quarry' | 'logging' | 'gathering' | 'fishing';
/** 던전(2026-11-15 사용자 요청). id는 서버 dungeons 표와 같다. */
export type DungeonId = 'meadow' | 'inferno';
export const DUNGEON_IDS: readonly DungeonId[] = ['meadow', 'inferno'];
/**
 * 모험 맵 스물다섯 장(2026-11-18 밤 맵 나누기, 기획 docs/balance/dungeon-rework.md 19장, 디자인 세션 adventure-maps13.md): 입구 맵 adv_gate와 지역 맵 열둘(평원 셋, 지옥 둘, 구름 정원 둘, 나머지 한 장씩).
 * 2026-11-19 새 지역 여섯(심연 골짜기 ~ 화산 폭풍, 지역마다 두 장, 기획 19장 '새 지역 여섯(A안)', 디자인 노트 adventure-maps-v4.md)을 더했다.
 * 맵 id는 서버 adventure_maps.map과 같다(지역은 adventure_maps.zone, 지역의 첫 맵이 adventure_zones.map). 맵 모양과 꾸밈은 디자인 세션 자료(adventureMaps.ts)를 읽는다.
 */
export type AdventureMapId =
  | 'adv_gate'
  | 'adv_1a'
  | 'adv_1b'
  | 'adv_1r'
  | 'adv_1c'
  | 'adv_2a'
  | 'adv_2l'
  | 'adv_2r'
  | 'adv_2b'
  | 'adv_3a'
  | 'adv_3l'
  | 'adv_3r'
  | 'adv_3'
  | 'adv_4a'
  | 'adv_4l'
  | 'adv_4r'
  | 'adv_4'
  | 'adv_5a'
  | 'adv_5l'
  | 'adv_5r'
  | 'adv_5'
  | 'adv_6a'
  | 'adv_6l'
  | 'adv_6r'
  | 'adv_6b'
  | 'adv_7a'
  | 'adv_7l'
  | 'adv_7r'
  | 'adv_7'
  | 'adv_8a'
  | 'adv_8l'
  | 'adv_8r'
  | 'adv_8'
  | 'adv_9a'
  | 'adv_9l'
  | 'adv_9r'
  | 'adv_9b'
  | 'adv_10a'
  | 'adv_10l'
  | 'adv_10r'
  | 'adv_10b'
  | 'adv_11a'
  | 'adv_11l'
  | 'adv_11r'
  | 'adv_11b'
  | 'adv_12a'
  | 'adv_12l'
  | 'adv_12r'
  | 'adv_12b'
  | 'adv_13a'
  | 'adv_13l'
  | 'adv_13r'
  | 'adv_13b'
  | 'adv_14a'
  | 'adv_14l'
  | 'adv_14r'
  | 'adv_14b';
export const ADVENTURE_GATE_MAP: AdventureMapId = 'adv_gate';
export const ADVENTURE_MAPS: readonly AdventureMapId[] = [
  'adv_gate', 'adv_1a', 'adv_1b', 'adv_1r', 'adv_1c', 'adv_2a', 'adv_2l', 'adv_2r',
  'adv_2b', 'adv_3a', 'adv_3l', 'adv_3r', 'adv_3', 'adv_4a', 'adv_4l', 'adv_4r',
  'adv_4', 'adv_5a', 'adv_5l', 'adv_5r', 'adv_5', 'adv_6a', 'adv_6l', 'adv_6r',
  'adv_6b', 'adv_7a', 'adv_7l', 'adv_7r', 'adv_7', 'adv_8a', 'adv_8l', 'adv_8r',
  'adv_8', 'adv_9a', 'adv_9l', 'adv_9r', 'adv_9b', 'adv_10a', 'adv_10l', 'adv_10r',
  'adv_10b', 'adv_11a', 'adv_11l', 'adv_11r', 'adv_11b', 'adv_12a', 'adv_12l', 'adv_12r',
  'adv_12b', 'adv_13a', 'adv_13l', 'adv_13r', 'adv_13b', 'adv_14a', 'adv_14l', 'adv_14r',
  'adv_14b',
];
export type MapId = 'plains' | 'snow' | 'farm' | 'forest' | TowerId | WorkId | DungeonId | AdventureMapId;

/** tiles.png의 타일 번호. 왼쪽 위부터 오른쪽으로 센다. 번호를 여러 번 넣으면 더 자주 나온다. */
const GRASS = [22, 23, 24];
const CRACKED_DIRT = [11, 14, 15, 16];
const SCORCHED_DIRT = [17, 18, 21];
const STONE = [63, 63, 63, 61];
const FARMLAND = [25, 26];
const ICE = [110, 110, 110, 110, 113, 116];

/** 타일 그림에서 윗면이 시작하는 높이. 블록보다 얇은 판은 더 아래에서 시작한다. */
const BLOCK_TOP = 8;
const SLAB_TOP = 12;

export interface MapInfo {
  name: string;
  /** 바닥에 섞어 까는 타일 번호 */
  floor: number[];
  /** 타일 그림에서 윗면이 시작하는 높이 */
  floorTop: number;
  /** 미니맵에 칠하는 바닥색 */
  color: Color;
  /** 이 맵으로 가는 포탈의 색 */
  accent: Color;
  /** 귀퉁이별로 이어지는 맵 */
  links: Partial<Record<Corner, MapId>>;
  /** 작업장이면 true. 이 맵에서 자원을 캘 수 있다. */
  work?: boolean;
  /** true면 공격이 막힌다. 서버도 같은 맵을 막으므로 바꾸면 SQL도 함께 바꾼다. 지금은 시작마을뿐이다(2026-11-11 사용자 요청). */
  safe?: boolean;
  /** true면 늘 어둡고 내 손전등 시야만 보인다(전쟁터, 2026-11-13 사용자 요청). */
  dark?: boolean;
  /** 던전이면 true. 몬스터가 나오고, 블록을 놓을 수 없고, 사람끼리는 총알이 맞지 않는다. */
  dungeon?: boolean;
  /** 모험 맵이면 true. 몬스터는 보이지 않고, 걸으면 조우 게이지가 차서 혼자 하는 전투가 열린다. 블록과 공격이 없다. */
  adventure?: boolean;
  /** 맵 밖(빈 땅) 배경색. mood가 없을 때 쓴다(모험 맵, 디자인 세션 자료의 background). */
  background?: string;
  /**
   * 늘 같은 분위기로 덮는 색(시간대 밝기 대신)과 맵 밖 배경색. 있으면 용암 불빛과 불똥, 화면 가장자리 어둠도 켠다(src/game/gloom.ts).
   * 지옥 던전(2026-11-15 사용자 요청 "조금 더 음습하게").
   */
  mood?: { color: number; alpha: number; background: string };
}

/** 맵 목록. 평원을 중심으로 귀퉁이가 각 맵으로 이어지고, 작업장은 노동청에서 간다. 블록은 어느 맵이든 바닥 전체에 놓는다(2026-11-11 사용자 요청). */
export const MAPS: Record<MapId, MapInfo> = {
  plains: {
    name: '평원',
    floor: GRASS,
    floorTop: BLOCK_TOP,
    color: 0xa5d04f,
    accent: 0x9df08f,
    links: { right: 'farm', left: 'forest' },
    safe: true,
  },
  snow: {
    name: '설원',
    floor: ICE,
    floorTop: SLAB_TOP,
    color: 0x8fd0ea,
    accent: 0x7fd3ff,
    links: { bottom: 'forest' },
  },
  // 농장(2026-11-15 사용자 요청). 사막과 화산을 없애고 시작마을 오른쪽 포탈이 농장으로 간다. 공격이 된다.
  farm: {
    name: '농장',
    floor: GRASS,
    floorTop: BLOCK_TOP,
    color: 0x8fbf4f,
    accent: 0xf2d16b,
    links: { left: 'plains' },
  },
  // 아이티공간 건물 안
  tower1: {
    name: '아이티공간 1층',
    floor: [],
    floorTop: BLOCK_TOP,
    color: 0xd9d4ca,
    accent: 0xff7ad9,
    links: {},
  },
  tower4: {
    name: '아이티공간 4층',
    floor: [],
    floorTop: BLOCK_TOP,
    color: 0x6b7280,
    accent: 0xbfe6ff,
    links: {},
  },
  tower7: {
    name: '아이티공간 7층',
    floor: [],
    floorTop: BLOCK_TOP,
    color: 0x6b7280,
    accent: 0xbfe6ff,
    links: {},
  },
  tower8: {
    name: '아이티공간 8층',
    floor: [],
    floorTop: BLOCK_TOP,
    color: 0x6b7280,
    accent: 0x7fe3a0,
    links: {},
  },
  // 엘리베이터 안. 층 버튼을 눌러 1, 4, 7층으로 간다.
  elevator: {
    name: '엘리베이터',
    floor: [],
    floorTop: BLOCK_TOP,
    color: 0x8a929c,
    accent: 0xbfe6ff,
    links: {},
  },
  // 8층과 옥상 사이의 바깥 계단. 블록은 놓을 수 없다.
  stairs: {
    name: '바깥 계단',
    floor: [],
    floorTop: BLOCK_TOP,
    color: 0x8a9098,
    accent: 0x7fe3a0,
    links: {},
  },
  // 시작마을 주점을 고친 도박장
  casino: {
    name: '인생한방 도박장',
    floor: [],
    floorTop: BLOCK_TOP,
    color: 0x7a1824,
    accent: 0xffc34d,
    links: {},
  },
  // 이름 없는 방(src/game/hush.ts)
  annex: {
    name: '???',
    floor: [],
    floorTop: BLOCK_TOP,
    color: 0xc9bf7a,
    accent: 0xc9b8ff,
    links: {},
  },
  // 상점 안(2026-11-15 사용자 요청). 시작마을 가게라 공격이 막힌다(에이전트가 정함, 서버 hit_player에도 있음).
  // 노동청 안과 농협 안(2026-11-16 사용자 "둘 다 만들어"). 시작마을 건물 안이라 공격이 막힌다(서버 hit_player도 막음).
  labor: {
    name: '노동청',
    floor: [],
    floorTop: BLOCK_TOP,
    color: 0x8a6a48,
    accent: 0xffd84d,
    links: {},
    safe: true,
  },
  farmcoop: {
    name: '농협',
    floor: [],
    floorTop: BLOCK_TOP,
    color: 0x8a6a40,
    accent: 0xf2d16b,
    links: {},
    safe: true,
  },
  // 대장간 안(2026-11-16). 시작마을 건물 안이라 공격이 막힌다(서버 hit_player도 'smithy'를 막음).
  smithy: {
    name: '대장간',
    floor: [],
    floorTop: BLOCK_TOP,
    color: 0x6b4a3a,
    accent: 0xff9a3c,
    links: {},
    safe: true,
  },
  mart: {
    name: '상점',
    floor: [],
    floorTop: BLOCK_TOP,
    color: 0xd9d4c8,
    accent: 0xb58cff,
    links: {},
    safe: true,
  },
  // 증권거래소 안
  exchange: {
    name: '증권거래소',
    floor: [],
    floorTop: BLOCK_TOP,
    color: 0x2b3342,
    accent: 0xff6a5c,
    links: {},
  },
  rooftop: {
    name: '아이티공간 옥상',
    floor: [],
    floorTop: BLOCK_TOP,
    color: 0x9a9a96,
    accent: 0x8fd0ff,
    links: {},
  },
  // 예전 숲. 2026-11-13 사용자 요청으로 전쟁터가 됐다. 저장된 위치와 블록이 'forest'를 쓰므로 id는 그대로 둔다.
  // 손전등 시야(src/game/vision.ts)와 장애물 배치(src/game/battlefield.ts)가 이 맵에만 있다.
  forest: {
    name: '전쟁터',
    floor: [...CRACKED_DIRT, ...SCORCHED_DIRT, 0, 3],
    floorTop: BLOCK_TOP,
    color: 0x5a4a3a,
    accent: 0xff7a4d,
    links: { right: 'plains', top: 'snow' },
    dark: true,
  },
  quarry: {
    name: '채석장',
    floor: STONE,
    floorTop: BLOCK_TOP,
    color: 0x84948c,
    accent: 0xc9c4bc,
    links: { bottom: 'plains' },
    work: true,
  },
  logging: {
    name: '벌목장',
    floor: CRACKED_DIRT,
    floorTop: BLOCK_TOP,
    color: 0xb08468,
    accent: 0x4fdc86,
    links: { bottom: 'plains' },
    work: true,
  },
  gathering: {
    name: '채집장',
    floor: FARMLAND,
    floorTop: BLOCK_TOP,
    color: 0x8a5a3c,
    accent: 0xf2a65a,
    links: { bottom: 'plains' },
    work: true,
  },
  fishing: {
    name: '낚시터',
    floor: GRASS,
    floorTop: BLOCK_TOP,
    color: 0xa5d04f,
    accent: 0x5fc8ff,
    links: { bottom: 'plains' },
    work: true,
  },
  // 던전은 시작마을 아래 "던전 입장" 포탈의 창에서 고른다. 위쪽 귀퉁이 포탈로 시작마을에 돌아간다.
  meadow: {
    name: '평원 던전',
    floor: GRASS,
    floorTop: BLOCK_TOP,
    color: 0x86b048,
    accent: 0x9df08f,
    links: { top: 'plains' },
    dungeon: true,
  },
  inferno: {
    name: '지옥 던전',
    floor: SCORCHED_DIRT,
    floorTop: BLOCK_TOP,
    color: 0x5a2418,
    accent: 0xff4a2a,
    links: { top: 'plains' },
    dungeon: true,
    mood: { color: 0x1a0207, alpha: 0.5, background: '#0b0305' },
  },
  // 모험 맵(2026-11-18). 모양, 바닥, 꾸밈, 포탈 자리는 디자인 세션 자료(adv-maps.json)를 읽는다(map.ts generateMap).
  // 나가는 포탈은 없다(마을로는 귀환과 BP 0뿐, 기획 3장). 공격은 서버 hit_player도 막는다. accent는 입구 맵 지역 포탈 색(디자인 세션 시안).
  // v5(2026-11-21, 디자인 adventure-maps-v5.md): 지역마다 맵 넷(들머리, 왼길, 오른길, 보스 마당). 바탕은 맵 자료 background, 색은 그 지역 지금 색(에이전트가 정함).
  // 이름은 장소 분위기에 맞춘 이름(2026-11-21 사용자 "맵이름도 분위기에 걸맞게 바꿔줘", 이름은 에이전트가 정함). 맵 자료 name('지역 + 번호')은 화면에 쓰지 않는다.
  // 바탕(빈 땅) 색은 2026-11-22 밝기 수정으로 디자인 adventure-brightness.md 4절 새 색이다(구름 정원은 그대로, 지옥 분위기 덮개 50% → 20%). 맵 자료 background는 예전 값이고 게임은 읽지 않는다.
  adv_gate: adventureInfo('모험 입구', 0x8a8f9e, 0xffffff, '#242b3a'),
  adv_1a: adventureInfo('어스름 들판', 0x86b048, 0x7fd36a, '#212c3a'),
  adv_1b: adventureInfo('덤불 샛길', 0x86b048, 0x7fd36a, '#212c3a'),
  adv_1r: adventureInfo('금빛 풀길', 0x86b048, 0x7fd36a, '#212c3a'),
  adv_1c: adventureInfo('괴수의 언덕', 0x86b048, 0x7fd36a, '#212c3a'),
  adv_2a: { ...adventureInfo('불길 어귀', 0x5a2418, 0xff4a2a, '#2c0b0e'), mood: { color: 0x1a0207, alpha: 0.2, background: '#2c0b0e' } },
  adv_2l: { ...adventureInfo('용암 굴길', 0x5a2418, 0xff4a2a, '#2c0b0e'), mood: { color: 0x1a0207, alpha: 0.2, background: '#2c0b0e' } },
  adv_2r: { ...adventureInfo('잿불 골짜기', 0x5a2418, 0xff4a2a, '#2c0b0e'), mood: { color: 0x1a0207, alpha: 0.2, background: '#2c0b0e' } },
  adv_2b: { ...adventureInfo('불꽃 제단', 0x5a2418, 0xff4a2a, '#2c0b0e'), mood: { color: 0x1a0207, alpha: 0.2, background: '#2c0b0e' } },
  adv_3a: adventureInfo('뿌리 어귀', 0x2f5a2a, 0x2f8a3a, '#132019'),
  adv_3l: adventureInfo('빈터 샛길', 0x2f5a2a, 0x2f8a3a, '#132019'),
  adv_3r: adventureInfo('가시 덤불길', 0x2f5a2a, 0x2f8a3a, '#132019'),
  adv_3: adventureInfo('고목의 뜰', 0x2f5a2a, 0x2f8a3a, '#132019'),
  adv_4a: adventureInfo('벼랑 어귀', 0x6a6a72, 0x9a9aa6, '#1e2633'),
  adv_4l: adventureInfo('바위 난간길', 0x6a6a72, 0x9a9aa6, '#1e2633'),
  adv_4r: adventureInfo('바람 벼랑길', 0x6a6a72, 0x9a9aa6, '#1e2633'),
  adv_4: adventureInfo('낭떠러지 끝', 0x6a6a72, 0x9a9aa6, '#1e2633'),
  adv_5a: adventureInfo('무지개 어귀', 0x8a8a96, 0xffffff, '#22222e'),
  adv_5l: adventureInfo('빛살 들판', 0x8a8a96, 0xffffff, '#22222e'),
  adv_5r: adventureInfo('빛무리 들판', 0x8a8a96, 0xffffff, '#22222e'),
  adv_5: adventureInfo('일곱 빛 제단', 0x8a8a96, 0xffffff, '#22222e'),
  adv_6a: adventureInfo('구름 계단', 0x8fd0ea, 0x8fd0ff, '#86bfe6'),
  adv_6l: adventureInfo('떠 있는 섬', 0x8fd0ea, 0x8fd0ff, '#86bfe6'),
  adv_6r: adventureInfo('구름 다리', 0x8fd0ea, 0x8fd0ff, '#86bfe6'),
  adv_6b: adventureInfo('하늘 정원', 0x8fd0ea, 0x8fd0ff, '#86bfe6'),
  adv_7a: adventureInfo('별빛 어귀', 0x3a4a8a, 0x6a5cff, '#141c46'),
  adv_7l: adventureInfo('은하 길', 0x3a4a8a, 0x6a5cff, '#141c46'),
  adv_7r: adventureInfo('별똥 언덕', 0x3a4a8a, 0x6a5cff, '#141c46'),
  adv_7: adventureInfo('두 별의 뜰', 0x3a4a8a, 0x6a5cff, '#141c46'),
  adv_8a: adventureInfo('어둠 굴 입구', 0x3a2a4a, 0x7a3aa8, '#0d0a13'),
  adv_8l: adventureInfo('보랏빛 굴길', 0x3a2a4a, 0x7a3aa8, '#0d0a13'),
  adv_8r: adventureInfo('메아리 굴길', 0x3a2a4a, 0x7a3aa8, '#0d0a13'),
  adv_8: adventureInfo('가장 깊은 그늘', 0x3a2a4a, 0x7a3aa8, '#0d0a13'),
  adv_9a: adventureInfo('심연 가장자리', 0x1f5a5a, 0x2fc8c0, '#0b2132'),
  adv_9l: adventureInfo('물안개 동굴', 0x1f5a5a, 0x2fc8c0, '#0b2132'),
  adv_9r: adventureInfo('가라앉은 폐허', 0x1f5a5a, 0x2fc8c0, '#0b2132'),
  adv_9b: adventureInfo('심연 밑바닥', 0x1f5a5a, 0x2fc8c0, '#0b2132'),
  adv_10a: adventureInfo('안개 늪 어귀', 0x3a6a30, 0x6fbf5a, '#14251b'),
  adv_10l: adventureInfo('외딴 섬길', 0x3a6a30, 0x6fbf5a, '#14251b'),
  adv_10r: adventureInfo('검은 웅덩이', 0x3a6a30, 0x6fbf5a, '#14251b'),
  adv_10b: adventureInfo('망령의 늪', 0x3a6a30, 0x6fbf5a, '#14251b'),
  adv_11a: adventureInfo('모래 언덕', 0x8a7a50, 0xe8d29a, '#2e2618'),
  adv_11l: adventureInfo('해골 구덩이', 0x8a7a50, 0xe8d29a, '#2e2618'),
  adv_11r: adventureInfo('모래 무덤', 0x8a7a50, 0xe8d29a, '#2e2618'),
  adv_11b: adventureInfo('백골 평원', 0x8a7a50, 0xe8d29a, '#2e2618'),
  adv_12a: adventureInfo('무너진 성문', 0x4a3a6a, 0x9a6ad8, '#1d1929'),
  adv_12l: adventureInfo('망루 회랑', 0x4a3a6a, 0x9a6ad8, '#1d1929'),
  adv_12r: adventureInfo('버려진 예배당', 0x4a3a6a, 0x9a6ad8, '#1d1929'),
  adv_12b: adventureInfo('저주받은 왕좌', 0x4a3a6a, 0x9a6ad8, '#1d1929'),
  adv_13a: adventureInfo('얼음 계곡', 0x2a3a7a, 0x5a7aff, '#15233a'),
  adv_13l: adventureInfo('서리 동굴', 0x2a3a7a, 0x5a7aff, '#15233a'),
  adv_13r: adventureInfo('용의 굴', 0x2a3a7a, 0x5a7aff, '#15233a'),
  adv_13b: adventureInfo('용의 둥지', 0x2a3a7a, 0x5a7aff, '#15233a'),
  adv_14a: adventureInfo('잿빛 분화구', 0x6a2a10, 0xff7a1a, '#2c0f08'),
  adv_14l: adventureInfo('검은 바위길', 0x6a2a10, 0xff7a1a, '#2c0f08'),
  adv_14r: adventureInfo('불벼락 능선', 0x6a2a10, 0xff7a1a, '#2c0f08'),
  adv_14b: adventureInfo('폭풍의 화구', 0x6a2a10, 0xff7a1a, '#2c0f08'),
};

function adventureInfo(name: string, color: Color, accent: Color, background: string): MapInfo {
  return { name, floor: GRASS, floorTop: BLOCK_TOP, color, accent, links: {}, safe: true, adventure: true, background };
}

/** 모험 지역 맵 다음 지역 포탈 색(디자인 세션 시안: 빨강) */
const NEXT_PORTAL_COLOR = 0xff4a2a;

export function isDungeon(id: MapId): id is DungeonId {
  return MAPS[id].dungeon === true;
}

export function isAdventure(id: MapId): id is AdventureMapId {
  return MAPS[id].adventure === true;
}

/**
 * 시작마을 아래쪽 귀퉁이의 '모험하기' 포탈(2026-11-17, 기획 docs/balance/dungeon-rework.md 14장). 예전에는 던전 입장 포탈이었고,
 * 기존 던전 입구는 동굴(CAVE)로 옮겼다. 밟으면 모험 창이 열리고, 모험 필드에서 돌아오면 이 앞에 선다(배포 2).
 * 포탈 색은 예전 던전 입장 빨강을 그대로 둔다(에이전트가 정함).
 */
export const ADVENTURE_GATE = {
  door: { x: END, y: END },
  landing: { x: END - LANDING_ALONG, y: END - LANDING_ACROSS },
  name: '모험하기',
  accent: 0xff5a5a,
};

/**
 * 기존 던전 입구인 동굴(2026-11-17, 사용자가 디자인 세션 시안 "후보 2: 상점·증권거래소 사이"를 고름, 공유 노트 adventure-cave.md).
 * 땅 4×4, 문이 오른쪽 면이라 문 칸은 (x + 4, y + 1)이고 성을 두르는 길 왼쪽 변을 본다. 길과 나무는 바꾸지 않았다.
 * 문 앞 칸이 '던전 입장' 포탈이고 타면 던전 고르는 창이 열린다. 던전에서 돌아오면 이 앞에 선다. 포탈 색은 예전 던전 빨강이다.
 */
export const CAVE = {
  sprite: 'cave-x' as const,
  x: 9,
  y: 27,
  w: 4,
  d: 4,
  door: { x: 13, y: 28 },
  landing: { x: 15, y: 29 },
  name: '던전 입장',
  accent: 0xff5a5a,
};

export const DEFAULT_MAP: MapId = 'plains';

/** 평원 위쪽 귀퉁이의 노동청 건물. 문 앞 칸이 포탈이다. */
export const OFFICE = {
  sprite: 'inn' as const,
  x: 5,
  y: 5,
  w: 4,
  d: 4,
  door: { x: 9, y: 6 },
  landing: { x: 11, y: 7 },
  name: '노동청',
  accent: 0xffd84d,
};

/** 평원 한가운데의 아이티공간. 정문 앞 칸이 포탈이고, 타면 건물 1층으로 들어간다. */
export const CASTLE = {
  sprite: 'castle' as const,
  x: 18,
  y: 18,
  w: 11,
  d: 11,
  door: { x: 29, y: 23 },
  landing: { x: 31, y: 24 },
  name: '아이티공간',
  accent: 0xff7ad9,
};

/**
 * 시작마을 왼쪽의 상점. 문 앞 칸이 포탈이고, 타면 상점 안(mart 맵)으로 들어간다(2026-11-15 사용자 요청 "상점도 건물 내부로 들어가서").
 * 사고파는 것은 안의 계산대 앞 창구에서 한다(src/game/tower.ts의 MART_PROPS).
 */
export const SHOP = {
  sprite: 'villa' as const,
  x: 3,
  y: 16,
  w: 6,
  d: 8,
  door: { x: 3, y: 24 },
  landing: { x: 4, y: 26 },
  name: '상점',
  accent: 0xb58cff,
};

/**
 * 대장간(2026-11-16, 사용자 "새 건물 + 포탈"). 성 아래쪽 길 너머 잔디밭(전쟁터 길과 던전 길 사이)에 선 벽돌 공방이다.
 * 자리는 디자인 세션이 포탈·안내판을 가리지 않게 골랐다(PM을 거쳐 사용자가 "같이 넣기"로 정함, 공유 노트 occlusion.md).
 * 그림은 디자인 세션이 그렸고(public/sprites/smithy.png, 땅 4×4), 문은 왼쪽 면 gx 1~2라 문 칸은 (x + 1, y + 4)다.
 * 문 앞 칸이 포탈이고, 타면 대장간 안(smithy 맵)으로 들어간다. 사고, 강화하고, 파는 것은 안의 창구에서 한다.
 */
export const SMITHY = {
  sprite: 'smithy' as const,
  x: 22,
  y: 36,
  w: 4,
  d: 4,
  door: { x: 23, y: 40 },
  landing: { x: 24, y: 42 },
  name: '대장간',
};

/** 대장간 안 창구 포탈 */
const FORGE_INFO = { name: '대장간', accent: 0xff9a3c };

/** 시작마을 오른쪽 귀퉁이 주점(tavern)의 오른쪽 벽 문. 문 앞 칸이 포탈이고, 타면 도박장으로 들어간다. 맵 끝이라 벽을 따라 비껴 선다. */
export const CASINO_DOOR = { door: { x: 41, y: 38 }, landing: { x: 43, y: 38 } };

/** 주점(도박장) 건물 자리. 오른쪽 벽에 그려진 문이 CASINO_DOOR다. */
export const TAVERN = { sprite: 'tavern' as const, x: 37, y: 36, w: 4, d: 4, name: '인생한방 도박장' };

/**
 * 시작마을 귀퉁이 포탈로 가는 길이 성을 두르는 길에서 갈라지는 곳의 안내판(2026-11-15 사용자 요청 "각 방향 포탈이 어디로
 * 향하는지 모르겠다, 안내판을 세워라"). 자리와 글은 에이전트가 정했다.
 */
export const GUIDEPOSTS = [
  { x: 31, y: 11, text: '농장 가는 길 ↗' },
  { x: 16, y: 36, text: '↙ 전쟁터 가는 길' },
  { x: 31, y: 40, text: '모험하기 ↘' },
];

/**
 * 광장 오른쪽 잔디밭의 명예의 전당 간판. 앞 칸이 포탈이고, 타면 레벨 순위 창이 열린다.
 * 2026-11-12에 광장 안(32, 21)에서 옮겼다(사용자 요청 "중앙 메인 건물과 너무 겹침"). 아래 게시판과 나란히 선다.
 */
export const FAME = {
  sprite: 'board' as const,
  x: 37,
  y: 20,
  door: { x: 38, y: 21 },
  landing: { x: 38, y: 22 },
  name: '명예의 전당',
  accent: 0xfff1b8,
};

/**
 * 누구나 글을 쓰는 게시판(2026-11-12 사용자 요청 "마을 중앙에 누구나 글을 쓰는 게시판", 같은 날 이름을 "게시판"으로).
 * 처음엔 광장 안(32, 26)이었는데 아이티공간과 겹쳐 보여 광장 오른쪽 잔디밭, 명예의 전당 아래로 옮겼다.
 * 앞 칸이 포탈이고, 타면 게시판 창이 열린다.
 */
export const BOARD = {
  sprite: 'board' as const,
  x: 37,
  y: 25,
  door: { x: 38, y: 26 },
  landing: { x: 38, y: 27 },
  name: '게시판',
  accent: 0x9fe0ff,
};

/**
 * 증권거래소(2026-11-12 사용자 요청 "증권거래소 건물에서 주식을 사고판다"). 게시판 아래쪽 잔디밭에 선다.
 * 기둥이 선 정면(왼쪽 아래 면) 가운데 문 앞 칸이 포탈이고, 타면 거래소 안(exchange 맵)으로 들어간다.
 * 거래는 안의 종목 창구에서 한다(2026-11-12 사용자 요청 "도박장처럼 안에 들어가서 거래").
 */
export const EXCHANGE = {
  sprite: 'exchange' as const,
  x: 4,
  y: 32,
  w: 6,
  d: 6,
  door: { x: 6, y: 38 },
  landing: { x: 7, y: 40 },
  name: '증권거래소',
};

/**
 * 농협(2026-11-15 사용자 요청 "시작마을에 농협 건물, 땅과 씨앗을 산다"). 농장으로 가는 길 옆 오른쪽 잔디밭에 선 초가집이고(2026-11-15 건물을 네 방향으로 고루 나누며 옮김),
 * 앞 왼쪽 면 가운데 문 앞 칸이 포탈이라 타면 농협 창이 열린다. 자리와 그림(마을 에셋의 초가집)은 에이전트가 정했다.
 */
export const COOP = {
  sprite: 'thatched' as const,
  x: 37,
  y: 5,
  w: 4,
  d: 4,
  door: { x: 38, y: 9 },
  landing: { x: 39, y: 11 },
  name: '농협',
  accent: 0xf2d16b,
};

/** 거래소 안 종목 창구 포탈. 이름은 포탈마다 종목 이름(label)을 쓴다. */
const TRADE_INFO = { name: '매매 창구', accent: 0xffd84d };

export function isMapId(value: unknown): value is MapId {
  return typeof value === 'string' && Object.hasOwn(MAPS, value);
}

export interface Portal {
  x: number;
  y: number;
  /** 'office', 'dungeon', 'adventure', 'coop', 'shop', 'forge-shop', 'forge-anvil', 'counter', 'fame', 'board', 'trade', 'panel'과 도박장 게임은 맵을 옮기지 않고 창을 연다. */
  to: MapId | 'office' | 'dungeon' | 'adventure' | 'coop' | 'shop' | 'forge-shop' | 'forge-anvil' | 'counter' | 'fame' | 'board' | 'trade' | 'panel' | GameId;
  /** 포탈 위에 띄울 이름. 없으면 가는 곳의 이름이다. */
  label?: string;
  /** 포탈 색. 없으면 가는 곳의 색이다. */
  color?: Color;
  /**
   * 모험 맵 포탈(adventureMaps.ts): 보스방 옆 다음 지역 포탈('next')만 이번 판에 그 지역 보스를 잡았을 때 보인다(서버 run_bosses).
   * 입구 맵 포탈('zone', 평원 1로 하나), 같은 지역 다음 맵('next_map')·앞 맵('prev_map'), 지역 첫 맵의 앞 지역 포탈('prev_zone')은 늘 열려 있다.
   * 평원 1의 높은 지역 포탈('jump', 화산 폭풍 1로, 한쪽으로만)은 이번 판에 그 칸의 수문장을 이겼을 때 선다(2026-11-19 사용자). 'gate'(화산 폭풍 1 → 입구)는 2026-11-19 뺐다.
   */
  adventure?: 'zone' | 'link' | 'next' | 'next_map' | 'prev_map' | 'prev_zone' | 'jump' | 'gate';
  /** 이 포탈 근처에서 플레이어가 서는 칸 */
  landing: { x: number; y: number };
}

function portalAt(corner: Corner, to: MapId): Portal {
  const { x, y, inX, inY } = CORNERS[corner];
  return { x, y, to, landing: { x: x + inX * LANDING_ALONG, y: y + inY * LANDING_ACROSS } };
}

/**
 * 모험 맵 포탈 자리 전부(맵 자료). 보일지는 GameScene이 서버 값으로 고른다(열린 지역, 잡은 보스).
 * 모험 맵에서는 나와서 서는 칸이 늘 그 맵 입구라 landing은 포탈 칸 그대로 둔다.
 */
/**
 * v5 포탈(2026-11-21, 디자인 adventure-maps-v5.md 6절)의 화면 종류: link는 need로 나눈다. boss는 예전 '다음 지역'(next, 이번 판 지역 보스를 잡으면 보임, 빨강),
 * gate는 예전 '높은 지역'(jump, 이번 판 수문장을 이기면 보임), 비우면 늘 보이는 'link'(가는 맵 색). 서버 adventure_move도 같은 need를 본다.
 */
function portalKind(p: AdvPortalSpot): NonNullable<Portal['adventure']> {
  if (p.kind !== 'link') return p.kind;
  return p.need === 'boss' ? 'next' : p.need === 'gate' ? 'jump' : 'link';
}

function adventurePortals(id: AdventureMapId): Portal[] {
  return (advMap(id)?.portals ?? []).flatMap((p): Portal[] => {
    if (!isMapId(p.to)) return [];
    const kind = portalKind(p);
    // 글씨는 '→ 가는 맵 이름'만(v5, 디자인 확인 도구 view.js와 같음). 다음 지역 포탈만 빨강.
    const color = kind === 'next' ? { color: NEXT_PORTAL_COLOR } : {};
    return [{ x: p.x, y: p.y, to: p.to, landing: { x: p.x, y: p.y }, adventure: kind, ...color }];
  });
}

export function portalsOf(id: MapId): Portal[] {
  if (isTower(id)) return FLOORS[id].portals;
  if (isAdventure(id)) return adventurePortals(id);
  const portals = (Object.entries(MAPS[id].links) as [Corner, MapId][]).map(([corner, to]) => portalAt(corner, to));
  if (id === 'plains') {
    portals.push({ ...OFFICE.door, to: 'labor', landing: OFFICE.landing });
    portals.push({ ...SHOP.door, to: 'mart', landing: SHOP.landing });
    portals.push({ ...CASTLE.door, to: 'tower1', label: CASTLE.name, landing: CASTLE.landing });
    portals.push({ ...FAME.door, to: 'fame', landing: FAME.landing });
    portals.push({ ...BOARD.door, to: 'board', landing: BOARD.landing });
    portals.push({ ...EXCHANGE.door, to: 'exchange', landing: EXCHANGE.landing });
    portals.push({ ...CASINO_DOOR.door, to: 'casino', landing: CASINO_DOOR.landing });
    portals.push({ ...ADVENTURE_GATE.door, to: 'adventure', landing: ADVENTURE_GATE.landing });
    portals.push({ ...CAVE.door, to: 'dungeon', landing: CAVE.landing });
    portals.push({ ...COOP.door, to: 'farmcoop', landing: COOP.landing });
    portals.push({ ...SMITHY.door, to: 'smithy', landing: SMITHY.landing });
  }
  return portals;
}

function portalInfo({ to }: Portal) {
  if (to === 'office') return OFFICE;
  if (to === 'dungeon') return CAVE;
  if (to === 'adventure') return ADVENTURE_GATE;
  if (to === 'coop') return COOP;
  if (to === 'counter') return COUNTER_INFO;
  if (to === 'panel') return PANEL_INFO;
  if (to === 'fame') return FAME;
  if (to === 'board') return BOARD;
  if (to === 'trade') return TRADE_INFO;
  if (to === 'forge-shop' || to === 'forge-anvil') return FORGE_INFO;
  if (isGame(to)) return GAMES[to];
  return to === 'shop' ? SHOP : MAPS[to];
}

export function portalName(portal: Portal) {
  return portal.label ?? portalInfo(portal).name;
}

export function portalColor(portal: Portal) {
  return portal.color ?? portalInfo(portal).accent;
}

/**
 * from에서 to로 넘어갔을 때 서는 칸: 돌아오는 포탈 앞이다. 모험 맵은 늘 그 맵 입구 칸이다(맵 자료의 entry).
 * 엘리베이터로 오면 엘리베이터 앞이고, 작업장에서 돌아오면 노동청 앞, 던전에서 돌아오면 동굴(던전 입장 포탈) 앞, 모험 필드에서 돌아오면 아래 귀퉁이 모험하기 포탈 앞이다.
 * 작업장은 노동청 안(labor)의 창에서 가도 작업장 포탈 앞에 선다(2026-11-16 노동청 안 맵을 낸 뒤 노동청 앞 좌표 (11, 7)에 서던 것을 고침).
 */
export function arrivalFor(to: MapId, from: MapId) {
  // 모험 맵: 타고 온 포탈의 도착 칸(앞 맵 포탈이면 그 맵의 돌아오는 자리), 없으면 입구.
  if (isAdventure(to)) return (isAdventure(from) ? advArrival(from, to) : undefined) ?? advEntry(to);
  if (to === DEFAULT_MAP && isDungeon(from)) return CAVE.landing;
  if (to === DEFAULT_MAP && isAdventure(from)) return ADVENTURE_GATE.landing;
  const portals = portalsOf(to);
  const back =
    portals.find((p) => p.to === from) ??
    portals.find((p) => p.to === 'elevator') ??
    (isTower(to) || MAPS[to].work ? portals[0] : undefined);
  return back ? back.landing : OFFICE.landing;
}

/** 쓰러진 뒤 일어나는 칸. 블록을 놓을 수 없는 칸이라 갇힐 일이 없다. 모험 맵은 입구 칸이다(나가는 포탈이 없음). */
export function respawnTile(id: MapId) {
  if (isAdventure(id)) return advEntry(id);
  return id === DEFAULT_MAP ? CASTLE.landing : portalsOf(id)[0].landing;
}
