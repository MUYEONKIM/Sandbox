import Phaser from 'phaser';
import { paintJumpShadow, paintSmoke } from '../art/effects';
import { DECOR_LIFT, paintGround, TILE_CELL, worldRect } from '../art/ground';
import { paintWorkGround } from '../art/workGround';
import {
  hideoutOrigin,
  hideoutPassageOrigin,
  interiorOrigin,
  paintHideoutFloor,
  paintHideoutPassage,
  paintHideoutWall,
  paintInterior,
  paintLamp,
  paintLowTable,
  paintRailing,
  paintGardenRock,
} from '../art/interior';
import { paintBobber, paintPortal, paintRock, PORTAL_FRAMES, PORTAL_ORIGIN_Y, type Art } from '../art/props';
import { groundPoint, sprite, type SpriteName } from '../art/sprites';
import { anyModalOpen } from '../ui/modal';
import { CUBE_ORIGIN_X, CUBE_ORIGIN_Y, cubeOriginY, paintCube } from '../art/cube';
import { GLASS_RAIL, NEIGHBOR, OFFICE_WALL, paintThinWall, thinWallOriginY, type ThinWallStyle } from '../art/partition';
import { paintBullet } from '../art/weapons';
import { blockArt, blockTile, BLOCKS, footprintOf, paintBlock, CUBE_IDS, type BlockId } from '../blocks';
import { FURNITURE_BLOCKS } from '../furniture';
import {
  BLOCK_HEIGHT,
  JUMP_MS,
  JUMP_TILES,
  MAP_SIZE,
  MAX_STACK,
  BUILD_RANGE,
  RUN_SPEED,
  STEP_MS,
  TILE_H,
  TILE_W,
  ZOOM,
} from '../config';
import { depthOf, gridToWorld, keepDepth, tileCenter, worldToGrid } from '../iso';
import { cropOfSeed, isBlockItem, isGearRef, isPotion, isSeed, itemName, WEAPON_IDS, WEAPONS, type ItemId, type PotionId, type WeaponId } from '../items';
import type {
  Bounty,
  ChatMessage,
  GameSession,
  GroundItem,
  HarvestFail,
  HeldMemo,
  Motion,
  PlacedBlock,
  PlayerMove,
  PlayerShot,
  SessionEvents,
} from '../net/session';
import { dropFailText, type GroundUi } from '../ui/ground';
import { GroundItems } from './drops';
import type { ChatBox } from '../ui/chat';
import type { Hud, RunStatus } from '../ui/hud';
import { COUNT } from '../ui/countUp';
import type { Minimap } from '../ui/minimap';
import type { NameTags } from '../ui/nametags';
import type { CastleWindow } from '../ui/castle';
import type { CasinoWindows } from '../ui/casino';
import { noticeText, type Notice, type NoticeBar } from '../ui/notice';
import type { ElevatorWindow } from '../ui/elevator';
import type { BoardWindow } from '../ui/board';
import type { WantedPanel } from '../ui/wanted';
import type { ExchangeWindow } from '../ui/exchange';
import type { FameWindow } from '../ui/fame';
import type { OfficeWindow } from '../ui/office';
import type { ShopWindow } from '../ui/shop';
import type { ForgeWindow } from '../ui/forge';
import { opaqueAt } from './alphaMask';
import { Avatar, memberOf, TEAM_H, TEAM_W } from './avatar';
import { BULLET_HEIGHT, Bullets, type BulletTarget } from './bullets';
import { BlockChunks } from './blockChunks';
import { CoverFader } from './covers';
import { KEEP_CLEAR_ALPHA, KeepClear } from './keepClear';
import type { Economy, ShopTool } from './economy';
import type { Arm, Inventory } from './inventory';
import type { Dir, Keys } from './keys';
import { formatNumber, levelNeed } from './level';
import { goldText, toGold } from './gold';
import { generateMap, type Building, type GameMap } from './map';
import {
  arrivalFor,
  CASTLE,
  DEFAULT_MAP,
  EXCHANGE,
  type Area,
  isMapId,
  MAPS,
  OFFICE,
  portalColor,
  portalName,
  portalsOf,
  respawnTile,
  SHOP,
  SMITHY,
  COOP,
  GUIDEPOSTS,
  isAdventure,
  isDungeon,
  ADVENTURE_GATE_MAP,
  type AdventureMapId,
  type DungeonId,
  type MapId,
  type Portal,
  type WorkId,
} from './maps';
import { meleeTarget } from './melee';
import { findPath } from './path';
import { isGame } from './casino';
import { priceChange, STOCK_INFO, type Market } from './market';
import {
  ANNEX_PROPS,
  CAFE_SIGN,
  CASINO_SIGN,
  EXCHANGE_TICKERS,
  EXCHANGE_HALL,
  EXCHANGE_HALL_SIGN,
  FLOORS,
  HIDEOUT,
  inHideout,
  isTower,
  TICKER_LIFT,
  type PartitionKind,
  type TowerId,
} from './tower';
import { maxHpOf, type StatId } from './stats';
import { startTicker } from './ticker';
import { WorkFx } from './workFx';
import { Daylight } from './daylight';
import { Flashlight } from './vision';
import { Gloom } from './gloom';
import type { BattleKind } from './battlefield';
import { paintCrater, paintHedgehog, paintSandbags } from '../art/battlefield';
import { inBuildReach, inReach, World, type Tile } from './world';
import { HUSH_HOLD_MS, openHush } from './hush';
import { inSafeZone, spawnCandidates, type MonsterKind } from './dungeon';
import { isMonsterTarget, MonsterField, registerMonsterAnims } from './monsters';
import type { DungeonWindow } from '../ui/dungeon';
import type { MonsterMessage } from '../net/session';
import { isGate } from './farmLayout';
import { Lights } from './lights';
import type { Adventure } from './adventure';
import { AdventureField } from './adventureField';
import { playBattle } from './adventureBattle';
import { loadAdventureArt, loadMapBg } from '../art/adventureArt';
import { adventureBattle, adventureMove, adventureReturn, adventureStart, type AdvResult } from '../net/adventure';
import { confirmReturn, failText, showAdventureResult, type AdventureWindow } from '../ui/adventure';
import { advEntry, advMap, infernus, loadAdventureMaps, adventureMapsReady, monsterArt, monstersOf, type FieldMonster } from './adventureMaps';
import { paintAdventureGround } from '../art/adventureGround';
import { FIGHT_GAP_MS } from './adventureRules';
import { BattleIntro, LEAVE_MS, swirlKind } from './battleIntro';
import { bigText } from './adventure';
import { cropStateText, FARM_DO_LABEL, FarmField, formatLeft, GRADE_NAME, isPlot, leftTick, ownerWord, plotAction, plotCardLines, registerFarmTextures, ripeAt, showsCard, votesText, type CropId, type Plot, type PlotSituation } from './farm';
import type { CoopWindow } from '../ui/coop';
import { Modal } from '../ui/modal';
import { element } from '../ui/dom';
import { byInput } from '../ui/touch';

/** 창을 내리거나 다른 탭으로 가도 작업을 이어 가도록 확인하는 간격 */
const WORK_TICK_MS = 250;
/**
 * 서버가 작업을 연달아 이만큼 거절하면 일을 멈춘다. 예전에는 멈추지 않고 채집 시간마다 다시 물어서, 숨은 창에서도
 * Supabase에 에러가 끝없이 쌓였다(2026-11-13 사용자 보고).
 */
const HARVEST_FAILS_TO_STOP = 2;

/** 마우스 휠로 고를 수 있는 화면 배율(기본 ZOOM = 2). 반 단위라 도트가 덜 뭉개진다. 단계는 에이전트가 정했다. */
const ZOOM_LEVELS = [1, 1.5, 2, 2.5, 3];
/** 휠을 굴릴 때 한 칸씩만 바뀌게 하는 간격 */
const ZOOM_STEP_MS = 120;
const ZOOM_KEY = 'camera-zoom';

function nearestZoom(zoom: number) {
  return ZOOM_LEVELS.reduce((best, level) => (Math.abs(level - zoom) < Math.abs(best - zoom) ? level : best));
}

/** 이 브라우저에 기억한 화면 배율. 없거나 읽지 못하면 기본 배율 */
function savedZoom() {
  try {
    const value = Number(localStorage.getItem(ZOOM_KEY));
    return ZOOM_LEVELS.includes(value) ? value : ZOOM;
  } catch {
    return ZOOM;
  }
}

/** 몬스터를 움직이는 간격(호스트만). 탭이 숨어도 도는 시계로 돈다. */
const MONSTER_TICK_MS = 100;
/** 서버 kill_monster는 0.3초 안에 다시 부르면 거절한다. 조금 넉넉히 띄운다. */
const KILL_CLAIM_GAP_MS = 330;
const DEPTH_GROUND = 0;
const DEPTH_OVERLAY = 1;

/** 닉네임을 띄울 높이: 발에서 머리 위까지 (아트 픽셀) */
const HEAD_HEIGHT = 40;
const PORTAL_TAG_HEIGHT = 44;
const PORTAL_FRAME_MS = 100;

/** 연기가 나는 굴뚝 꼭대기의 위치 (건물 그림 기준 픽셀): 노동청 옥상 배기통, 대장간 벽돌 굴뚝(forge-art.md) */
const CHIMNEYS: Partial<Record<string, { x: number; y: number }>> = { inn: { x: 91, y: 3 }, smithy: { x: 93, y: 7 } };
const SMOKE_FRAMES = ['Smoke0000', 'Smoke0001', 'Smoke0002'] as const;
const SMOKE_FRAME_MS = 240;
/** 클릭을 연달아 해도 안내가 쌓이지 않게 하는 간격 */
const NOTICE_MS = 2000;

/**
 * 건물 이름표를 다는 위치 (건물 그림 기준 픽셀, 이름표 아래 가운데). 2026-11-15 건물을 현대 도시풍으로 다시 그리며
 * art-source/town/make-town.cjs가 출력한 자리로 맞췄다. 아이티공간은 정문 앞에서도 보이게 타워 앞 모서리의 저층부 옥상 위다.
 */
const CASTLE_SIGN = { x: 176, y: 243 };
/** 상점: 옥상 MART 간판 위 */
const SHOP_SIGN = { x: 95, y: 32 };
/** 그 밖의 마을 건물: 지붕(옥상 간판) 위 가운데 */
const PLAIN_SIGNS: Partial<Record<string, { name: string; x: number; y: number }>> = {
  inn: { name: OFFICE.name, x: 64, y: 14 },
  tavern: { name: '인생한방 도박장', x: 64, y: 7 },
  thatched: { name: COOP.name, x: 66, y: 8 },
  smithy: { name: SMITHY.name, x: 64, y: 27 },
  // 동굴 언덕 꼭대기(디자인 세션 adventure-cave.md 1장이 권한 자리, 글은 에이전트가 정함)
  'cave-x': { name: '던전', x: 64, y: 4 },
};
/** 증권거래소: 옥상 가운데 */
const EXCHANGE_SIGN = { x: 99, y: 55 };
/** 층 그림은 바닥보다 위, 블록 설치 범위 표시보다 아래에 그린다. */
const DEPTH_INTERIOR = 0.5;
/** 밟고 지나가는 꽃과 풀 블록은 바닥 바로 위에 그려 캐릭터를 가리지 않는다. */
const DEPTH_DECAL = 0.6;
/** 시간대 색과 전쟁터 어둠은 모든 월드 그림 위에 덮는다(이름표, 창 같은 화면 UI는 그 위의 HTML이라 덮이지 않는다). */
const DEPTH_DAYLIGHT = 50_000;
const DEPTH_DARKNESS = 50_001;
/** 시간대 색을 맵 바깥 여백까지 넉넉히 덮는 폭 (월드 픽셀) */
const DAYLIGHT_PAD = 2000;
/** 전쟁터의 불탄 나무 색 */
const BURNT_TINT = 0x6b5b50;
const BATTLE_ART: Record<BattleKind, () => Art> = { sandbag: paintSandbags, hedgehog: paintHedgehog, crater: paintCrater };
/** 4층 숨은 방 바닥은 층 그림 바로 위에 그린다. */
const DEPTH_HIDEOUT = 0.55;
/** 같은 칸에 쌓인 블록끼리 위층을 나중에 그리도록 높이마다 더하는 깊이. 칸 하나의 깊이 차(10)보다 훨씬 작다. */
const STACK_DEPTH = 0.01;

/**
 * 건물 층 안 벽 그림. 방을 나누는 벽과 유리 난간은 칸 가운데를 지나는 얇은 판(art/partition.ts)이고,
 * 엘리베이터 통과 덕트는 꽉 찬 콘크리트 덩어리(block-textures.png 칸 번호와 옆면 높이)다.
 */
const THIN_PARTITIONS: Partial<Record<PartitionKind, ThinWallStyle>> = { wall: OFFICE_WALL, glass: GLASS_RAIL };
const SOLID_PARTITIONS: Partial<Record<PartitionKind, { texture: number; height: number }>> = {
  core: { texture: 16, height: BLOCK_HEIGHT * 2 },
};
const WORLD_BACKGROUND = '#2c6f93';
const INDOOR_BACKGROUND = '#14141c';
const ROOF_BACKGROUND = '#8fcfee';
/** 전쟁터처럼 늘 어두운 맵의 맵 바깥 색. 하늘색이면 어둠 밖이 밝게 튀어 보인다. */
const DARK_BACKGROUND = '#07090f';

/** 작물 밭은 칸 하나가 아니라 4칸 너비로 그려진다. 그림에서 밭 가운데 위치 */
const CROPS_CENTER = { x: 64, y: 58 };

/** 맵 가장자리에서도 캐릭터가 화면 UI에 가리지 않도록 카메라에 주는 여백 (아트 픽셀) */
const CAMERA_PAD_X = 80;
const CAMERA_PAD_Y = 110;

const FADE_MS = 200;
/** 되돌림 칸을 밟은 걸음이 끝난 뒤 입구로 옮긴다(한 칸 걷는 시간보다 조금 길게). */
const RESET_DELAY_MS = 160;
const MINIMAP_INTERVAL_MS = 100;

/** 프레임이 오래 끊겼을 때 캐릭터가 순간이동하지 않도록 한 프레임의 시간을 제한한다. */
const MAX_FRAME_MS = 100;

/** 칸 이동의 이 지점까지는 방향을 바꿀 수 있다. */
const TURN_WINDOW = 0.5;

/** 총을 쏜 다른 플레이어의 총이 보이는 시간 */
const REMOTE_AIM_MS = 700;
/** 연사 무기는 이 수만큼 쏠 때 한 번만 알린다. 받는 쪽이 그만큼 나눠 그려서 통신량을 줄인다. */
const BURST = 3;
/** 재장전 원: 캐릭터 오른쪽 위에 지름 8(아트 픽셀). 진행을 12단계로 끊어 단계가 바뀔 때만 다시 그린다(forge-art.md 이펙트 5). */
const RELOAD_RING = { dx: 12, dy: -34, radius: 4, steps: 12 };
/** 산탄 한 알이 부채꼴 자리에서 더 틀어지는 폭 (라디안, 에이전트가 정함) */
const PELLET_JITTER = 0.035;
const RESPAWN_MS = 3000;
/** 휴대폰에서 다른 플레이어나 몬스터를 눌렀다고 보는 거리 (칸) */
const TAP_TARGET_TILES = 1.5;
/** 휴대폰에서 이만큼 누르고 있으면 길게 누르기(블록 회수)다(에이전트가 정함). */
const LONG_PRESS_MS = 450;
/** 길게 누르는 동안 손가락이 이만큼(화면 px) 넘게 움직이면 길게 누르기로 보지 않는다. */
const PRESS_SLOP_PX = 12;
/** 두 손가락 사이가 이만큼 배로 벌어지거나 좁아질 때마다 배율을 한 단계 바꾼다(에이전트가 정함). */
const PINCH_STEP = 1.25;
const RESPAWN_RETRY_MS = 1000;

interface PortalSprite {
  portal: Portal;
  image: Phaser.GameObjects.Image;
  tag: string;
}

/** 건물에 붙은 이름표 */
interface Sign extends Tile {
  tag: string;
}

/** 지금 하고 있는 한 칸 걸음. 방향을 바꿀 때 출발 칸으로 돌아가 다시 계산한다. */
interface Walk {
  from: Tile;
  /** 플레이어가 누른 방향. 벽을 따라 미끄러질 때는 실제 이동 방향과 다르다. */
  dir: Dir;
}

/** 누른 방향이 막혔을 때 대신 가 볼 방향. 벽을 따라가거나 벽 끝을 돌아가게 된다. */
function slideOptions({ dx, dy }: Dir): Dir[] {
  if (dx !== 0 && dy !== 0) {
    return [
      { dx, dy: 0 },
      { dx: 0, dy },
    ];
  }
  if (dx !== 0) {
    return [
      { dx, dy: -1 },
      { dx, dy: 1 },
    ];
  }
  return [
    { dx: -1, dy },
    { dx: 1, dy },
  ];
}

export class GameScene extends Phaser.Scene implements SessionEvents {
  world!: World;
  private mapId: MapId;
  /** 모험 필드에 있을 때의 조우 게이지·띠 표시(2026-11-17) */
  private advField: AdventureField | null = null;
  /** 모험 전투를 서버에 묻거나 전투 화면을 보이는 중 */
  private advBusy = false;
  /** 마지막으로 모험 전투를 서버에 물은 시각(performance.now). 서버 2.5초 간격을 지키려고 */
  private advFoughtAt = -Infinity;
  /** 마지막 전투 창이 닫힌 때(3초 안에 또 싸우면 짧은 소용돌이) */
  private advClosedAt = -Infinity;
  /** 다른 사람의 모험 판 레벨(움직임·접속 상태와 전투 끝 알림으로 옴) */
  private readonly otherRuns = new Map<string, string | null>();
  /** 정보 칸·내 이름표에 그린 판 레벨(바뀔 때만 다시 그림) */
  private shownRunLevel: string | null = null;
  /**
   * 전투가 끝나 판 값을 넣는 동안만 true: 레벨 업 애니메이션은 전투 결과 칸 안에서 이미 보였으니(2026-11-18 사용자 "여기에 애니메이션이 있어야 된다")
   * 맵으로 돌아온 뒤 정보 칸 막대는 다시 돌리지 않고 끝 값으로 맞춘다. 위 HUD 금화는 배경이 걷힌 뒤 오른다(goldDelay, PM이 정함).
   */
  private runQuiet = false;
  /** 누른 몬스터: 옆 칸까지 걸어가 닿으면 싸운다(기획 19장 3번). */
  private advPending: FieldMonster | null = null;
  private me!: Avatar;
  private walk: Walk | null = null;
  /** 방향키 없이 Shift를 누르면 이 방향으로 대시한다. 처음에는 화면 아래를 본다. */
  private lastDir: Dir = { dx: 1, dy: 1 };
  /** 작물 곁 안내 창에 지난번 넣은 값. 모두 같으면 창을 고치지 않는다(docs/balance/farm.md 9.3 '그리는 법'). */
  private readonly farmCard = { plot: null as Plot | null, held: null as ItemId | null, seeds: -1, blocked: false, tick: 0 };
  private level: bigint;
  /** 숨은 방이 보이는지. 그 칸들을 밟고 있는 동안에만 보인다. */
  private hideoutShown = false;
  /** 이동 키 하나를 같은 칸에서 누르고 있는 중: "맵:x:y:키 코드", 그 칸에서 누르기 시작한 시각, 이미 열어 봤는지 */
  private hush: { place: string; since: number; tried: boolean } | null = null;
  /** 숨은 방 그림. 사라지는 중에도 여기 남아 있다가 다 사라지면 지운다. */
  private hideoutImages: Phaser.GameObjects.Image[] = [];
  /** 지금 레벨에서 모은 경험치 */
  private exp: number;
  private readonly others = new Map<string, Avatar>();
  private bullets!: Bullets;
  private ground!: Phaser.GameObjects.Image;
  private ghost!: Phaser.GameObjects.Image;
  private marker!: Phaser.GameObjects.Graphics;
  private range!: Phaser.GameObjects.Graphics;
  private readonly blockImages = new Map<string, Phaser.GameObjects.Image>();
  /** 맵에 박힌 장식 벽 그림 */
  private portalSprites: PortalSprite[] = [];
  /** 포탈과 안내판을 덮는 블록을 반투명하게 한다(src/game/keepClear.ts). */
  private readonly keepClear = new KeepClear();
  private signs: Sign[] = [];
  /** 건물과 자원처럼 맵을 옮길 때 지워야 하는 그림 */
  private mapImages: Phaser.GameObjects.Image[] = [];
  private readonly covers = new CoverFader(this);
  /** 화면 밖 블록 그림을 덩어리째 숨긴다(src/game/blockChunks.ts). */
  private readonly blockChunks = new BlockChunks();
  /** 바깥 맵의 등과 조명 빛(2026-11-16, lights.ts) */
  private glows!: Lights;
  /** 바깥 맵의 KST 시간대 밝기 */
  private daylight!: Daylight;
  /** 전쟁터의 손전등 시야 */
  private flashlight!: Flashlight;
  private gloom!: Gloom;
  private readonly workFx = new WorkFx(this);
  /** 땅에 놓인 메모와 골드 */
  /** 허공 칸(닫힌 숨은 방)의 것은 그리지 않는다. */
  private readonly drops = new GroundItems(this, (x, y) => this.world.isVoid(x, y));
  /** 줍기를 서버에 묻는 중이면 true. F를 연달아 눌러도 한 번만 묻는다. */
  private picking = false;
  /** 메모 위에 서면 뜨는 글: 지난번 본 메모 id(없으면 0)와 칸 */
  private readonly memoPeek = { id: 0, x: -1, y: -1 };
  /** 땅의 메모 id마다 받아 둔 쓴 사람과 글. 메모 글은 바뀌지 않는다. */
  private readonly memoTexts = new Map<number, { author: string; body: string }>();
  /** 글을 서버에 묻는 중인 메모 id */
  private readonly memoReading = new Set<number>();
  /** 메모 글을 서버에 물은 횟수(성능 확인용) */
  memoReads = 0;
  /** 칸별 자원 그림. 작업할 때 흔들린다. */
  private readonly spotImages = new Map<string, Phaser.GameObjects.Image>();
  private chimneySmoke: Phaser.GameObjects.Image[] = [];
  private readonly paintedArt = new Map<string, Art>();
  /** 작업 중이면 시작 시각, 아니면 null */
  /** 작업을 시작한(또는 마지막으로 자원을 얻은) 시각. performance.now 기준이라 탭이 숨어도 흐른다. */
  private workStartedAt: number | null = null;
  /** 일하고 있는 자원 칸 */
  private workSpot: Tile | null = null;
  /** 서버가 작업을 연달아 거절한 횟수 */
  private harvestFails = 0;
  private portalFrame = 0;
  private traveling = false;
  private down = false;
  /** 지금 들고 있는 무기의 단축키 칸 id(기본 권총 'pistol', 자루 'gear:<id>'). 없으면 null */
  private armedWith: ItemId | null = null;
  private nextShotAt = 0;
  /** 사격 번호. 서버가 산탄 한 번을 한 발로 센다(hit_player의 shot). 새로고침해도 겹치지 않게 시각에서 시작한다. */
  private shotSeq = Date.now();
  /** 총마다(단축키 칸 id) 남은 탄과 재장전이 끝나는 시각(this.time.now 기준) */
  private readonly mags = new Map<ItemId, { left: number; reloadUntil: number }>();
  private reloadRing: Phaser.GameObjects.Graphics | null = null;
  private reloadStep = -1;
  private nextNoticeAt = 0;
  private shotsFired = 0;
  private nextMinimapAt = 0;
  /** 미니맵에 지난번 그린 값(그림 번호, 블록 판, 숨은 방, 내 칸, 다른 사람 칸들). 모두 같으면 다시 그리지 않는다. */
  private readonly minimapSeen: number[] = [];
  /** 맵을 옮기거나 미니맵을 펴면 올려서 다음 확인 때 꼭 그리게 한다. */
  private minimapEpoch = 0;
  /** 미니맵을 그린 횟수(성능 확인용) */
  minimapDraws = 0;

  /** 엘리베이터에 탄 층. 버튼판의 내리기를 누르면 이 층으로 나간다. 새로고침하면 1층이다. */
  private elevatorFloor: TowerId = 'tower1';

  /** 휴대폰에서 누른 곳까지 남은 칸. 비어 있으면 걷지 않는다. */
  private route: Tile[] = [];
  private routeGoal: Tile | null = null;
  private routeMarker!: Phaser.GameObjects.Graphics;
  /** 휴대폰에서 다른 플레이어나 몬스터를 눌러 공격을 시작했으면 손을 뗄 때까지 연사한다. */
  private touchFiring = false;
  /**
   * 휴대폰에서 누르고 있는 손가락: 누른 화면 자리, 그 자리의 맵 좌표, 누른 시각, 길게 누르기를 이미 봤는지.
   * 손을 떼면 누르기(걷기, 놓기, 일하기), 오래 누르면 블록 회수다. 맵 좌표는 누를 때 정한다(걷는 동안 화면이 따라 움직여서).
   */
  private press: { x: number; y: number; wx: number; wy: number; at: number; checked: boolean } | null = null;
  /** 휴대폰에서 자원을 눌러 걸어가는 중이면 그 자원 칸. 닿으면 일을 시작한다. */
  private workGoal: Tile | null = null;
  /** 두 손가락으로 화면을 확대·축소하는 중이면 기준 거리(화면 px), 아니면 null */
  private pinch: number | null = null;

  /** 던전 몬스터. 던전이 아니면 null */
  private monsters: MonsterField | null = null;
  private stopMonsterTicker: (() => void) | null = null;
  /** 몬스터 보상을 차례로 받는 줄과 마지막으로 부른 시각 */
  private killClaims: Promise<void> = Promise.resolve();
  private lastKillClaimAt = 0;

  /** 농장 땅과 작물 그림. 농장이 아니면 null */
  private farm: FarmField | null = null;
  private farmBusy = false;

  /** 휠로 다음 배율을 바꿀 수 있는 시각 */
  private nextZoomAt = 0;

  /** 포션을 마시는 중(서버 답을 기다림) */
  private drinking = false;

  /** 마우스가 가리키는 설치된 블록 */
  private hoveredBlock: Tile | null = null;
  /** 마우스가 가리키는 빈 바닥 칸 */
  private hoveredGround: Tile | null = null;

  constructor(
    private readonly inventory: Inventory,
    private readonly hud: Hud,
    private readonly keys: Keys,
    private readonly chat: ChatBox,
    private readonly tags: NameTags,
    private readonly minimap: Minimap,
    private readonly session: GameSession,
    private readonly economy: Economy,
    private readonly office: OfficeWindow,
    private readonly shop: ShopWindow,
    private readonly castle: CastleWindow,
    private readonly fame: FameWindow,
    private readonly elevator: ElevatorWindow,
    private readonly casino: CasinoWindows,
    private readonly notices: NoticeBar,
    private readonly board: BoardWindow,
    private readonly wanted: WantedPanel,
    private readonly exchange: ExchangeWindow,
    private readonly market: Market,
    private readonly groundUi: GroundUi,
    private readonly dungeonWindow: DungeonWindow,
    private readonly monsterKinds: MonsterKind[],
    private readonly coop: CoopWindow,
    private readonly forge: ForgeWindow,
    private readonly adventure: Adventure,
    private readonly adventureWindow: AdventureWindow,
  ) {
    super('game');
    this.mapId = isMapId(session.profile.map) ? session.profile.map : DEFAULT_MAP;
    this.level = BigInt(session.profile.level);
    this.exp = session.profile.exp;
  }

  create() {
    startTicker(WORK_TICK_MS, () => this.updateWork());
    this.createTextures();
    this.ground = this.add.image(0, 0, this.groundTexture(this.mapId)).setOrigin(0, 0).setDepth(DEPTH_GROUND);
    this.daylight = new Daylight(this, DEPTH_DAYLIGHT);
    // 등 빛무리는 밤 덮개 바로 위, 지옥 던전 Gloom(+0.5)보다 아래다. 진하기는 시간대를 따른다.
    this.glows = new Lights(this, DEPTH_DAYLIGHT + 0.2, this.daylight.current);
    this.daylight.onPhase = (phase, fade) => this.glows.setPhase(phase, fade);
    // 블록 덩어리가 화면을 다시 볼 때 켤 플레이어 조명을 다시 고른다.
    this.blockChunks.onView = (view) => this.glows.setView(view);
    this.flashlight = new Flashlight(this, DEPTH_DARKNESS);
    this.gloom = new Gloom(this, DEPTH_DAYLIGHT + 0.5);
    this.showMap(this.mapId);
    this.market.onChange(() => this.paintTickers());
    // 모험 맵: 보스를 처음 잡아 다음 지역이 열리면 포탈을 세우고, 스텟이 바뀌면 입구 맵 포탈 이름표 색을 다시 칠한다.
    this.adventure.onChange(() => this.syncAdventurePortals());
    // 모험 맵에서는 정보 칸과 내 이름표가 판 레벨이다(값이 바뀔 때만 다시 그림).
    this.adventure.onChange(() => this.refreshRunLevel());
    // 레벨 업 막대가 도는 동안 내 이름표 레벨 숫자도 정보 칸과 같은 때에 바뀌고 튄다(다른 사람 이름표는 끝 레벨만, 디자인 adventure-ui.md 15절).
    this.hud.bar.onLevel = (level, pop) => this.showAnimatedLevel(level, pop);
    this.groundUi.placeHeld = (memo) => this.placeHeldMemo(memo);
    this.groundUi.onHintClick = () => {
      if (this.canAct) this.tryPickUp();
    };
    this.groundUi.farm.onAction = () => {
      if (this.canAct) this.farmKey();
    };
    // 미니맵을 펴면 바로 한 번 그린다(접혀 있는 동안은 그리지 않았다).
    this.minimap.fold.onChange((folded) => {
      if (folded) return;
      this.minimapEpoch++;
      this.nextMinimapAt = 0;
    });
    // 숨은 방 안에서 접속을 끊었다면 방이 열린 채로 시작한다.
    const saved = this.session.profile;
    if (this.mapId === HIDEOUT.map && inHideout(saved.x, saved.y)) this.showHideout(false);

    const { id, nickname, hp, max_hp: maxHp, skin } = this.session.profile;
    this.me = new Avatar(this, id, this.startTile(), hp, skin, maxHp);
    this.tags.add(id, nickname);
    this.tags.setHp(id, hp, maxHp);
    this.showLevel(id, this.level);

    this.bullets = new Bullets(this, {
      inBounds: (tx, ty) => this.world.inBounds(tx, ty),
      isSolid: (tx, ty) => this.world.blocksShots(tx, ty),
      targets: () => this.bulletTargets(),
      onImpact: (id, dx, dy) => this.playHit(id, dx, dy),
    });

    this.range = this.add.graphics().setDepth(DEPTH_OVERLAY);
    this.marker = this.add.graphics().setDepth(DEPTH_OVERLAY);
    this.routeMarker = this.add.graphics().setDepth(DEPTH_OVERLAY);
    this.ghost = this.add
      .image(0, 0, `block-${CUBE_IDS[0]}`)
      .setOrigin(CUBE_ORIGIN_X, CUBE_ORIGIN_Y)
      .setVisible(false);

    const cam = this.cameras.main;
    cam.setZoom(savedZoom());
    cam.startFollow(this.me.anchor, true);
    // 카메라가 이번 프레임의 화면 범위를 정한 직후, 그리기 전에 화면 밖 블록 덩어리를 숨기거나 보인다.
    cam.on(Phaser.Cameras.Scene2D.Events.FOLLOW_UPDATE, (camera: Phaser.Cameras.Scene2D.Camera) => this.blockChunks.update(camera.worldView));
    // 마우스 휠로 화면을 넓게 보거나 크게 본다(2026-11-15 사용자 요청). 도트가 뭉개지지 않게 정해 둔 단계로만 바꾸고 이 브라우저에 기억한다.
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => {
      if (dy !== 0) this.stepZoom(dy > 0 ? -1 : 1);
    });
    // 휴대폰은 두 손가락을 벌리거나 모아 같은 단계로 바꾼다(2026-11-18 휴대폰 고치기, 에이전트가 정함). 두 번째 손가락을 받으려고 터치 하나를 더 둔다.
    this.input.addPointer(1);
    this.input.on('pointermove', () => this.updatePinch());

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.canAct && !this.chat.isOpen) return;
      if (pointer.wasTouch) {
        this.touchDown(pointer);
        return;
      }
      this.updateHover();
      if (pointer.rightButtonDown()) void this.collectBlock();
      else if (pointer.leftButtonDown() && !this.clickMonster()) this.useSelectedItem();
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      this.touchFiring = false;
      if (pointer.wasTouch) this.touchUp();
    });
    // 손가락이 화면 밖(창이나 버튼 위)에서 떨어지면 누르기로 치지 않는다.
    this.input.on('pointerupoutside', () => {
      this.touchFiring = false;
      this.press = null;
    });

    this.drawRange();
    void this.session.connect(this);
    if (this.me.isDown) this.goDown();
  }

  /** 저장된 자리에 건물이 들어섰다면 맵 입구에서 시작한다. */
  private startTile(): Tile {
    // 모험 맵은 늘 그 맵 입구에 선다(기획 3장 "새로고침하면 남긴 맵 입구").
    if (isAdventure(this.mapId)) return advEntry(this.mapId);
    const { x, y } = this.session.profile;
    return this.world.isWalkable(x, y) ? { x, y } : respawnTile(this.mapId);
  }

  private createTextures() {
    for (const id of CUBE_IDS) this.textures.addCanvas(`block-${id}`, paintBlock(id));
    for (const id of WEAPON_IDS) this.textures.addCanvas(id, WEAPONS[id].art.paint());
    this.textures.addCanvas('bullet', paintBullet());
    this.textures.addCanvas('smoke', paintSmoke());
    this.textures.addCanvas('jump-shadow', paintJumpShadow());
    this.textures.addSpriteSheet('team', sprite('team'), { frameWidth: TEAM_W, frameHeight: TEAM_H });
    this.textures.addSpriteSheet('team-back', sprite('team-back'), { frameWidth: TEAM_W, frameHeight: TEAM_H });
    this.textures.addSpriteSheet('tiles', sprite('tiles'), { frameWidth: TILE_CELL, frameHeight: TILE_CELL });
    for (const name of SMOKE_FRAMES) this.spriteTexture(name);
    registerMonsterAnims(this, (id) => sprite(`monsters/${id}` as SpriteName));
    registerFarmTextures(this);
  }

  /** 가구 그림(furniture.png 한 장)을 등록하고 가구마다 그 안의 자리를 프레임으로 나눈다. 블록 id가 프레임 이름이다. */
  private furnitureTexture() {
    if (this.textures.exists('furniture')) return;
    const texture = this.textures.addImage('furniture', sprite('furniture'))!;
    for (const [id, { art }] of Object.entries(FURNITURE_BLOCKS)) {
      const [x, y, w, h] = art.frame;
      texture.add(id, 0, x, y, w, h);
    }
  }

  /** public/sprites 이미지를 게임에서 쓸 수 있게 등록한다. */
  private spriteTexture(name: SpriteName) {
    if (!this.textures.exists(name)) this.textures.addImage(name, sprite(name));
    return name;
  }

  /** 맵 바닥 그림은 처음 들어갈 때 한 번만 그린다. 작업장은 길·밭고랑·물가까지 칠한 바닥이다(workGround.ts). */
  private groundTexture(id: MapId) {
    // 모험 맵 자료를 아직 못 읽었으면(읽기 실패) 빈 바닥을 따로 둔다. 읽은 뒤에 들어가면 제대로 그린다.
    // 그 맵 몬스터 그림(새 지역의 두 번째 그림)을 못 읽었을 때도 따로 둔다(몬스터 그림자가 빠진 바닥).
    const key = isAdventure(id) && !adventureMapsReady(id) ? `ground-${id}-empty` : `ground-${id}`;
    if (!this.textures.exists(key)) {
      const map = generateMap(id);
      // 농장도 길·둑·풀밭을 칠한 바닥이다(2026-11-16 농장 꾸밈, workGround.ts).
      const canvas = MAPS[id].work ? paintWorkGround(map, id as WorkId) : id === 'farm' ? paintWorkGround(map, 'farm') : paintGround(map);
      // 모험 맵: 바닥 조각, 일곱 빛, 별, 보스 고리, 떠 있는 몬스터 그림자를 같은 바닥 그림에 한 번 그린다.
      const data = isAdventure(id) ? advMap(id) : undefined;
      if (data) paintAdventureGround(canvas, data, map, monstersOf(id));
      this.textures.addCanvas(key, canvas);
    }
    return key;
  }

  /** Infernus 조각 묶음 그림(2026-11-18). 고해상도 그림을 반으로 줄인 것이라 이 텍스처만 부드럽게 늘린다(PM 제안). */
  private infernusTexture() {
    const art = infernus();
    if (!art) return null;
    if (!this.textures.exists('infernus')) {
      const texture = this.textures.addImage('infernus', art.pieces)!;
      for (const [name, f] of Object.entries(art.meta.props)) texture.add(name, 0, f.x, f.y, f.w, f.h);
      texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    return art;
  }

  /** 모험 맵의 Infernus 조각을 세운다. (x, y)가 맨 앞 칸이고, 그림 안 (ax, ay)를 그 칸 가운데에 맞춘다. */
  private showPieces(map: GameMap) {
    const art = map.pieces.length ? this.infernusTexture() : null;
    if (!art) return;
    for (const { id, x, y } of map.pieces) {
      const f = art.meta.props[id];
      const c = tileCenter(x, y);
      const image = this.add.image(c.x, c.y, 'infernus', id).setOrigin(f.ax / f.w, f.ay / f.h).setDepth(depthOf(x, y));
      this.mapImages.push(image);
      // 막는 칸이 있는 조각은 내 캐릭터를 가리면 반투명해진다(나무와 같음). 떠 있는 섬(fp 0)은 허공 위라 넣지 않는다.
      if (f.fp > 0) this.covers.add([image]);
    }
  }

  private portalTexture(portal: Portal, frame: number) {
    const key = `portal-${portalColor(portal)}-${frame}`;
    if (!this.textures.exists(key)) this.textures.addCanvas(key, paintPortal(portalColor(portal), frame).canvas);
    return key;
  }

  /** 칸 (x, y)에 서 있는 그림을 놓는다. 맵을 옮기면 지워진다. */
  private addMapArt(key: string, paint: () => Art, x: number, y: number) {
    let art = this.paintedArt.get(key);
    if (!art) {
      art = paint();
      this.paintedArt.set(key, art);
      this.textures.addCanvas(key, art.canvas);
    }
    const c = tileCenter(x, y);
    const image = this.add
      .image(c.x, c.y, key)
      .setOrigin(art.ax / art.canvas.width, art.ay / art.canvas.height)
      .setDepth(depthOf(x, y));
    this.mapImages.push(image);
    return image;
  }

  /** 땅에 닿는 지점을 칸 (x, y)에 맞춰 이미지를 세운다. */
  private addSprite(name: SpriteName, x: number, y: number) {
    this.spriteTexture(name);
    const image = sprite(name);
    const foot = groundPoint(name);
    const c = tileCenter(x, y);
    const placed = this.add
      .image(c.x, c.y, name)
      .setOrigin(foot.x / image.width, foot.y / image.height)
      .setDepth(depthOf(x, y));
    this.mapImages.push(placed);
    this.covers.add([placed]);
    return placed;
  }

  /** 덤불이나 바위처럼 칸 위에 서 있는 타일을 놓는다. */
  private addTileProp(tile: number, x: number, y: number) {
    const corner = gridToWorld(x, y);
    const top = corner.y - this.world.map.floorTop - DECOR_LIFT;
    this.mapImages.push(this.add.image(corner.x, top, 'tiles', tile).setOrigin(0.5, 0).setDepth(depthOf(x, y)));
  }

  private showSpots(id: MapId) {
    const trees: SpriteName[] = ['oaktree', 'pinetree', 'firtree'];
    this.world.map.spots.forEach((spot, i) => {
      let image: Phaser.GameObjects.Image | undefined;
      if (id === 'quarry') image = this.addMapArt(`rock-${i % 3}`, () => paintRock(i % 3), spot.x, spot.y);
      if (id === 'fishing') image = this.addMapArt('bobber', paintBobber, spot.x, spot.y);
      if (id === 'logging') image = this.addSprite(trees[i % trees.length], spot.x, spot.y);
      if (id === 'gathering') image = this.addCrops(spot);
      if (image) this.spotImages.set(`${spot.x},${spot.y}`, image);
    });
  }

  /** 작물 밭은 자원 칸을 가운데에 두고 그린다. */
  private addCrops({ x, y }: Tile) {
    this.spriteTexture('crops');
    const image = sprite('crops');
    const c = tileCenter(x, y);
    const placed = this.add
      .image(c.x, c.y, 'crops')
      .setOrigin(CROPS_CENTER.x / image.width, CROPS_CENTER.y / image.height)
      .setDepth(depthOf(x, y));
    this.mapImages.push(placed);
    this.covers.add([placed]);
    return placed;
  }

  /**
   * 건물은 여러 칸을 차지해서 깊이 값 하나로는 앞뒤를 가릴 수 없다.
   * 화면 세로줄 단위로 잘라 줄마다 가장 앞쪽 칸의 깊이를 준다.
   */
  private showBuilding({ sprite: name, x, y, w, d }: Building) {
    this.spriteTexture(name);
    const image = sprite(name);
    const texture = this.textures.get(name);
    const stripW = TILE_W / 2;
    /** 그림 안에서 건물 바닥의 왼쪽 끝 위치. 그림이 바닥보다 넓으면 가운데를 맞춘다. */
    const baseLeft = Math.floor((image.width - (w + d) * stripW) / 2);
    const left = gridToWorld(x, y + d).x - baseLeft;
    const top = gridToWorld(x + w, y + d).y - groundPoint(name).y;

    const frontmost = (column: number) => {
      const c = Math.max(-d, Math.min(w - 1, column));
      let best = 0;
      for (let j = 0; j < d; j++) {
        for (let i = 0; i < w; i++) {
          if (i - j === c || i - j === c + 1) best = Math.max(best, i + j);
        }
      }
      return best;
    };

    const strips: Phaser.GameObjects.Image[] = [];
    for (let edge = (baseLeft % stripW) - stripW; edge < image.width; edge += stripW) {
      const sx = Math.max(edge, 0);
      const width = Math.min(edge + stripW, image.width) - sx;
      if (width <= 0) continue;
      const stripName = `strip-${sx}`;
      if (!texture.has(stripName)) texture.add(stripName, 0, sx, 0, width, image.height);
      const column = Math.round((edge - baseLeft) / stripW) - d;
      const depth = depthOf(x + frontmost(column), y);
      strips.push(this.add.image(left + sx, top, name, stripName).setOrigin(0, 0).setDepth(depth));
    }
    this.mapImages.push(...strips);
    this.covers.add(strips);
    return { left, top };
  }

  /** 노동청과 대장간 굴뚝에서 연기가 피어오른다. */
  private showChimneySmoke(left: number, top: number, at: { x: number; y: number }) {
    const smoke = this.add
      .image(left + at.x, top + at.y, SMOKE_FRAMES[0])
      .setOrigin(0.5, 1)
      .setDepth(depthOf(MAP_SIZE, MAP_SIZE));
    this.chimneySmoke.push(smoke);
    this.mapImages.push(smoke);
  }

  /** 맵 하나를 화면에 올린다. 블록과 다른 플레이어는 서버에서 받아 채운다. */
  private showMap(id: MapId) {
    this.mapId = id;
    this.hideoutShown = false;
    this.hideoutBlocks.clear();
    const info = MAPS[id];
    this.world = new World(generateMap(id), this.visiblePortals(id));
    // 7, 8층처럼 넓은 맵은 월드 범위가 왼쪽 아래로 더 나가서 바닥 그림과 카메라 범위를 맵마다 맞춘다.
    const rect = worldRect(this.world.map.size);
    this.ground.setTexture(this.groundTexture(id)).setPosition(rect.left, 0);
    this.cameras.main.setBounds(
      rect.left - CAMERA_PAD_X,
      -CAMERA_PAD_Y,
      rect.width + CAMERA_PAD_X * 2,
      rect.height + CAMERA_PAD_Y * 2,
    );
    this.minimap.setMap(info.name, info.color, this.world.map.bounds);
    this.minimapEpoch++;
    this.cameras.main.setBackgroundColor(
      info.mood
        ? info.mood.background
        : info.background
          ? info.background
          : info.dark
          ? DARK_BACKGROUND
          : id === 'rooftop' || id === 'stairs'
            ? ROOF_BACKGROUND
            : isTower(id)
              ? INDOOR_BACKGROUND
              : WORLD_BACKGROUND,
    );
    // 바깥 맵은 KST 시간대 색을 덮고, 전쟁터는 늘 어둡고 손전등 빛만 보인다(2026-11-13 사용자 요청).
    this.flashlight.setActive(info.dark === true, this.world.map.size);
    this.daylight.setMap(
      !isTower(id) && !info.dark,
      rect.left - DAYLIGHT_PAD,
      -DAYLIGHT_PAD,
      rect.width + DAYLIGHT_PAD * 2,
      rect.height + DAYLIGHT_PAD * 2,
      info.mood ?? null,
    );
    if (isTower(id)) this.showInterior(id);
    if (isDungeon(id)) this.startMonsters(id);
    if (id === 'farm') this.startFarm();
    if (isAdventure(id)) void this.startAdventureField(id);
    // 모험 맵에서는 이름표 아래 필드 HP 막대를 빼고(CSS), 정보 칸·내 이름표를 판 레벨로 바꾼다. 마을로 돌아오면 마을 것.
    document.getElementById('hud')?.classList.toggle('in-adventure', isAdventure(id));
    this.refreshRunLevel();
    if (id === DEFAULT_MAP) {
      for (const post of GUIDEPOSTS) {
        const c = tileCenter(post.x, post.y);
        this.addSign(post.text, c.x, c.y - 40);
      }
    }
    if (info.mood) this.gloom.show(this.world.map.walls.filter((wall) => wall.id === 'lava'));
    else this.gloom.clear();
    this.chimneySmoke = [];
    for (const building of this.world.map.buildings) {
      const { left, top } = this.showBuilding(building);
      const chimney = id === DEFAULT_MAP ? CHIMNEYS[building.sprite] : undefined;
      if (chimney) this.showChimneySmoke(left, top, chimney);
      if (building.sprite === CASTLE.sprite) this.addSign(CASTLE.name, left + CASTLE_SIGN.x, top + CASTLE_SIGN.y);
      if (building.sprite === SHOP.sprite) this.addSign(SHOP.name, left + SHOP_SIGN.x, top + SHOP_SIGN.y);
      if (building.sprite === EXCHANGE.sprite) this.addSign(EXCHANGE.name, left + EXCHANGE_SIGN.x, top + EXCHANGE_SIGN.y);
      // 모든 건물에 같은 노란 이름표를 단다(2026-11-15 사용자 "어떤 건물은 이름표가 있고 어디는 없다"). 지붕 위 가운데.
      const plain = PLAIN_SIGNS[building.sprite];
      if (plain && id === DEFAULT_MAP) this.addSign(plain.name, left + plain.x, top + plain.y);
    }
    if (id === 'farm') this.showFences();
    // 등 빛: 시간대 덮개가 있는 바깥 맵만(건물 안, 전쟁터, 분위기 색 맵은 뺀다, lantern-glow.md 7-5)
    this.glows.enter(!isTower(id) && !info.dark && !info.mood, this.world.map.buildings);
    this.showSpots(id);
    this.showWalls();
    const boards: Phaser.GameObjects.Image[] = [];
    for (const { sprite, x, y } of this.world.map.trees) {
      const tree = this.addSprite(sprite, x, y);
      if (info.dark) tree.setTint(BURNT_TINT);
      if (sprite === 'board') boards.push(tree);
    }
    for (const { tile, x, y } of this.world.map.props) this.addTileProp(tile, x, y);
    this.showPieces(this.world.map);
    for (const { kind, x, y } of this.world.map.battleProps) {
      const image = this.addMapArt(`battle-${kind}`, BATTLE_ART[kind], x, y);
      if (kind === 'crater') image.setDepth(DEPTH_DECAL);
    }

    this.portalSprites = this.world.portals.map((portal) => this.addPortalSprite(portal));
    // 블록은 이 뒤에 서버에서 받아 놓는다(spawnBlock이 덮는지 본다).
    this.keepClear.guard([...this.portalSprites.map(({ image }) => image), ...boards]);
    this.clearAdventurePortals();
  }

  /**
   * 모험 맵 꾸밈(벽 블록, 나무, Infernus 조각)이 포탈 그림의 보이는 픽셀을 덮으면 반투명하게 둔다. 플레이어가 놓은 블록과 같은 규칙(keepClear,
   * 2026-11-16 사용자 "가려지면 안 된다")을 맵 꾸밈에도 쓴다(2026-11-18 맵 3판 앞 지역 포탈이 앞 줄 산울타리에 조금 가려서, 에이전트가 정함).
   * 디자인 세션이 자료를 고친 뒤(adventure-maps13.md 9절)에는 열세 장 모두 덮는 꾸밈이 0이라 아무것도 바꾸지 않는다. 맵 자료가 다시 바뀔 때를 위한 안전장치로 남긴다(에이전트가 정함).
   * 맵에 들어올 때와 포탈이 새로 보일 때 한 번만 본다(매 프레임 비용 없음). 반투명으로 둔 것은 내 캐릭터 가리기(CoverFader)에서 뺀다.
   */
  private clearAdventurePortals() {
    if (!isAdventure(this.mapId)) return;
    for (const image of this.mapImages) {
      if (image.alpha === KEEP_CLEAR_ALPHA || !this.keepClear.covers(image)) continue;
      this.covers.remove(image);
      image.setAlpha(KEEP_CLEAR_ALPHA);
    }
  }

  private addPortalSprite(portal: Portal): PortalSprite {
    const c = tileCenter(portal.x, portal.y);
    const image = this.add
      .image(c.x, c.y, this.portalTexture(portal, 0))
      .setOrigin(0.5, PORTAL_ORIGIN_Y)
      .setDepth(depthOf(portal.x, portal.y));
    const tag = `portal-${portal.to}-${portal.x}-${portal.y}`;
    this.tags.add(tag, portal.adventure === 'zone' ? '' : `→ ${portalName(portal)}`, 'portal');
    if (portal.adventure === 'zone') this.paintZonePortal(tag, portal);
    return { portal, image, tag };
  }

  /**
   * 모험 맵에서 지금 보일 포탈(2026-11-18 사용자 "맵은 전체가 다 이어져있는 것이기 떄문에 시작맵에 포탈이 열리는 형식은 맞지않다", "판마다 다시 잡기", 앞 지역 포탈 "둔다 (추천)"): 다음 지역 포탈만 이번 판에 이 지역 보스를 잡았을 때(서버 runBosses에 지역 id) 보인다.
   * 새 판이면 다시 숨는다. 처음 잡은 기록(계정)은 보지 않는다. 별 하늘은 보스방이 둘이고 둘 다 같은 지역 보스다.
   * 입구 맵 포탈(평원 1), 같은 지역 앞뒤 맵, 앞 지역 포탈은 늘 열려 있다. 서버 adventure_move도 같은 규칙이다.
   */
  private visiblePortals(id: MapId): Portal[] {
    const all = portalsOf(id);
    if (!isAdventure(id)) return all;
    const view = this.adventure.view;
    if (!view) return [];
    const zone = this.adventure.zoneOfMap(id)?.id;
    const bossDown = zone !== undefined && view.runBosses.includes(zone);
    return all.filter((p) => p.adventure !== 'next' || bossDown);
  }

  /** 서버 값이 바뀌면(이번 판에 지역 보스를 잡음, 새 판) 모험 맵 포탈을 맞춘다. 바뀐 것이 없으면 아무것도 하지 않는다. */
  private syncAdventurePortals() {
    if (!isAdventure(this.mapId) || this.traveling || !this.world) return;
    const want = this.visiblePortals(this.mapId);
    const key = (p: Portal) => `${p.x},${p.y},${p.to}`;
    const have = new Set(this.world.portals.map(key));
    const next = new Set(want.map(key));
    if (have.size === next.size && [...next].every((k) => have.has(k))) {
      for (const { portal, tag } of this.portalSprites) if (portal.adventure === 'zone') this.paintZonePortal(tag, portal);
      return;
    }
    for (const sprite of this.portalSprites.filter(({ portal }) => !next.has(key(portal)))) {
      sprite.image.destroy();
      this.tags.remove(sprite.tag);
    }
    this.portalSprites = this.portalSprites.filter(({ portal }) => next.has(key(portal)));
    for (const portal of want) if (!have.has(key(portal))) this.portalSprites.push(this.addPortalSprite(portal));
    this.world.portals.splice(0, this.world.portals.length, ...want);
    this.keepClear.guard(this.portalSprites.map(({ image }) => image));
    this.clearAdventurePortals();
  }

  /** 입구 맵 지역 포탈 이름표 두 줄(디자인 세션 시안): "1 평원" / "Lv. 1 ~ 5,200". 이길 확률 색은 없앴다(2026-11-18 사용자). */
  private paintZonePortal(tag: string, portal: Portal) {
    const view = this.adventure.view;
    const i = view ? view.zones.findIndex((z) => z.map === portal.to) : -1;
    const zone = view?.zones[i];
    if (!zone) return;
    this.tags.setLines(tag, `${i + 1} ${zone.name}`, `Lv. ${bigText(zone.first)} ~ ${bigText(zone.bossLevel)}`);
  }

  /**
   * 농장 울타리 488조각(2026-11-16 농장 꾸밈, farmLayout.ts). 바뀌지 않는 그림이라 맵에 들어올 때 한 번 놓는다.
   * 1×1 소품처럼 그림 아래 꼭짓점을 칸 앞 꼭짓점에 맞추고, 깊이는 그 칸에 선 사람·작물보다 조금 뒤(depthOf − 5)다.
   * 블록처럼 덩어리(BlockChunks)에 넣어 화면 밖 조각은 표시 목록에서 뺀다.
   */
  private showFences() {
    for (const { x, y, side } of this.world.map.fences) {
      const name = side === 'top' ? 'farm-fence' : 'farm-fence-x';
      this.spriteTexture(name);
      const image = sprite(name);
      const left = gridToWorld(x, y + 1).x - Math.floor((image.width - TILE_W) / 2);
      const top = gridToWorld(x + 1, y + 1).y - image.height;
      const fence = this.add.image(left, top, name).setOrigin(0, 0).setDepth(depthOf(x, y) - 5);
      this.mapImages.push(fence);
      this.blockChunks.add(fence, x, y);
    }
  }

  /** 작업장의 장식 벽 */
  private showWalls() {
    for (const { x, y, id } of this.world.map.walls) {
      this.mapImages.push(this.dressBlock(this.add.image(0, 0, `block-${id}`), id, x, y));
    }
  }

  /** 아이티공간 층 그림: 바닥과 뒤쪽 벽을 한 장에 담았다. 층마다 처음 들어갈 때 한 번만 그린다. */
  private showInterior(id: TowerId) {
    const key = `interior-${id}`;
    if (!this.textures.exists(key)) this.textures.addCanvas(key, paintInterior(id));
    const [x0, y0] = FLOORS[id].area;
    const { left, top } = interiorOrigin(id, gridToWorld(x0, y0));
    this.mapImages.push(this.add.image(left, top, key).setOrigin(0, 0).setDepth(DEPTH_INTERIOR));
    for (const { x, y } of this.world.map.railings) this.addMapArt('railing', paintRailing, x, y);
    this.showPartitions();
    if (id === 'tower1') {
      const sign = gridToWorld(CAFE_SIGN.x + 0.5, CAFE_SIGN.y);
      this.addSign("ITS'room", sign.x, sign.y - CAFE_SIGN.lift);
    }
    if (id === 'casino') {
      const sign = gridToWorld(CASINO_SIGN.x, CASINO_SIGN.y);
      this.addSign(MAPS.casino.name, sign.x, sign.y - CASINO_SIGN.lift);
    }
    if (id === 'exchange') this.showTickers();
    if (id === 'annex') {
      const { lamps, table, rocks } = ANNEX_PROPS;
      for (const { x, y } of lamps) this.addMapArt('hideout-lamp', paintLamp, x, y);
      this.addMapArt('hideout-table', paintLowTable, table.x, table.y);
      rocks.forEach(({ x, y, size }, i) => this.addMapArt(`annex-rock-${i}`, () => paintGardenRock(size), x, y));
    }
  }

  /**
   * 이동 키 하나를 같은 칸에서 HUSH_HOLD_MS 동안 누르고 있으면 그 자리와 키로 암호문을 풀어 본다(src/game/hush.ts).
   * 맞는 자리면 그 사람만 숨은 방으로 옮기고 팝업을 띄운다. 아닌 곳에서는 아무 일도 없다.
   */
  private checkHush(time: number) {
    const code = this.keys.heldMoveKey();
    const still = code !== null && !this.traveling && !this.down && !this.me.moving;
    const place = still ? `${this.mapId}:${this.me.tile.x}:${this.me.tile.y}:${code}` : null;
    if (place !== this.hush?.place) {
      this.hush = place ? { place, since: time, tried: false } : null;
      return;
    }
    if (!this.hush || this.hush.tried || time - this.hush.since < HUSH_HOLD_MS) return;
    this.hush.tried = true;
    void openHush(this.hush.place).then((found) => {
      if (!found || !isMapId(found.map) || this.traveling || place !== this.hush?.place) return;
      this.travel(found.map, () => this.hud.popup(found.popup));
    });
  }

  /** 증권거래소 안: 간판과 큰 시세 전광판. 전광판 숫자는 이름표처럼 화면 위 글씨라 가격이 바뀌면 바로 고친다. */
  private showTickers() {
    const sign = gridToWorld(EXCHANGE_HALL_SIGN.x, EXCHANGE_HALL_SIGN.y);
    this.addSign(MAPS.exchange.name, sign.x, sign.y - EXCHANGE_HALL_SIGN.lift);
    for (const { stock, x } of EXCHANGE_TICKERS) {
      const tag = `ticker-${stock}`;
      this.tags.add(tag, '', 'ticker');
      const at = gridToWorld(x + 0.5, EXCHANGE_HALL[1]);
      this.signs.push({ tag, x: at.x, y: at.y - TICKER_LIFT });
    }
    this.paintTickers();
    void this.market.refresh();
  }

  private paintTickers() {
    if (this.mapId !== 'exchange') return;
    for (const { stock } of EXCHANGE_TICKERS) {
      const quote = this.market.quote(stock);
      const head = document.createElement('span');
      head.className = 'ticker-price';
      const icon = document.createElement('img');
      icon.className = 'ticker-icon';
      icon.alt = '';
      icon.src = STOCK_INFO[stock]?.icon ?? '';
      head.append(icon, quote ? `${quote.price.toLocaleString()}` : '-');
      // 시세판은 좁아서 등락률만 쓴다. 금액까지 보이는 건 거래 창이다.
      const change = document.createElement('span');
      const moved = quote ? priceChange(quote.price, quote.prevPrice) : null;
      change.className = `ticker-change tone-${moved?.tone ?? 'flat'}`;
      change.textContent = moved ? moved.short : '시세 받는 중';
      this.tags.setLabel(`ticker-${stock}`, head, change);
    }
  }

  /** 층 안의 벽. 칸마다 상자 하나를 세우고, 내 캐릭터를 가리면 반투명해지게 한다. */
  private showPartitions() {
    const { partitions, bounds } = this.world.map;
    const kinds = new Map(partitions.map(({ x, y, kind }) => [`${x},${y}`, kind]));
    const thinAt = (x: number, y: number) => {
      const kind = kinds.get(`${x},${y}`);
      return kind !== undefined && THIN_PARTITIONS[kind] !== undefined;
    };
    /** 콘크리트 덩어리나 뒤쪽 벽(바닥 뒤 바깥) */
    const solidAt = (x: number, y: number) => (kinds.has(`${x},${y}`) && !thinAt(x, y)) || x < bounds[0] || y < bounds[1];
    const dirs = [
      [1, 0, NEIGHBOR.px],
      [-1, 0, NEIGHBOR.nx],
      [0, 1, NEIGHBOR.py],
      [0, -1, NEIGHBOR.ny],
    ] as const;
    for (const { x, y, kind } of partitions) {
      const thin = THIN_PARTITIONS[kind];
      let key: string;
      let originY: number;
      if (thin) {
        // 이웃한 얇은 벽과 잇는다. 콘크리트나 뒤쪽 벽은 벽이 그쪽으로 이어질 때만 붙인다.
        // 나란히 지나가는 벽까지 붙이면 칸마다 짧은 팔이 튀어나와 톱니처럼 보인다.
        let mask = 0;
        for (const [dx, dy, bit] of dirs) if (thinAt(x + dx, y + dy)) mask |= bit;
        const line = mask;
        for (const [dx, dy, bit] of dirs) {
          if (solidAt(x + dx, y + dy) && (line === 0 || thinAt(x - dx, y - dy))) mask |= bit;
        }
        key = `partition-${kind}-${mask}`;
        if (!this.textures.exists(key)) this.textures.addCanvas(key, paintThinWall(thin, mask));
        originY = thinWallOriginY(thin);
      } else {
        const { texture, height } = SOLID_PARTITIONS[kind]!;
        key = `partition-${kind}`;
        if (!this.textures.exists(key)) this.textures.addCanvas(key, paintCube(texture, texture, height, false));
        originY = cubeOriginY(height);
      }
      const c = tileCenter(x, y);
      const image = this.add.image(c.x, c.y, key).setOrigin(CUBE_ORIGIN_X, originY).setDepth(depthOf(x, y));
      this.mapImages.push(image);
      this.covers.add([image]);
    }
  }

  /** 숨은 방 통로 한 칸 */
  private readonly passageArea: Area = [HIDEOUT.passage.x, HIDEOUT.passage.y, HIDEOUT.passage.x, HIDEOUT.passage.y];

  /** 숨은 방은 4층 바닥 끝의 정해진 칸이나 통로, 방 안을 밟고 있는 동안에만 보인다. */
  private checkHideout() {
    if (this.mapId !== HIDEOUT.map) return;
    const { x, y } = this.me.tile;
    const inside = (x === HIDEOUT.trigger.x && y === HIDEOUT.trigger.y) || inHideout(x, y);
    if (inside && !this.hideoutShown) this.showHideout(true);
    else if (!inside && this.hideoutShown) this.hideHideout();
  }

  /**
   * 숨은 방 안에 놓인 블록과 가구. 방이 닫혀 있는 동안에는 World와 화면에 두지 않고 여기에만 둔다.
   * World에 두면 방 밖 사람이 허공 칸을 가리켜 회수하거나 위에 쌓고, 미니맵 점과 총알 막힘으로 방 자리가 드러난다.
   */
  private readonly hideoutBlocks = new Map<string, PlacedBlock>();

  private showHideoutBlocks() {
    const blocks = [...this.hideoutBlocks.values()].sort((a, b) => a.z - b.z);
    for (const { x, y, z, id } of blocks) if (!this.world.blockAtLevel(x, y, z)) this.spawnBlock({ x, y }, z, id);
  }

  private hideHideoutBlocks() {
    for (const { x, y, z } of this.hideoutBlocks.values()) this.removeBlockAt(x, y, z);
  }

  /** 숨은 방 안의 칸인지(4층에서만) */
  private inHideoutHere(x: number, y: number) {
    return this.mapId === HIDEOUT.map && inHideout(x, y);
  }

  /** 숨은 방 그림을 지운다. 맵을 옮길 때 지워지도록 mapImages에서도 뺀다. */
  private dropHideoutImages() {
    const images = this.hideoutImages;
    this.hideoutImages = [];
    this.tweens.killTweensOf(images);
    for (const image of images) image.destroy();
    this.mapImages = this.mapImages.filter((image) => !images.includes(image));
  }

  /** 방을 벗어나면 서서히 사라지고 다시 걸을 수 없는 허공이 된다. */
  private hideHideout() {
    this.hideoutShown = false;
    this.hideHideoutBlocks();
    this.world.closeFloor(HIDEOUT.area);
    this.world.closeFloor(this.passageArea);
    this.drops.refresh();
    this.tweens.killTweensOf(this.hideoutImages);
    this.tweens.add({
      targets: this.hideoutImages,
      alpha: 0,
      duration: 500,
      ease: 'Sine.easeIn',
      onComplete: () => {
        if (!this.hideoutShown) this.dropHideoutImages();
      },
    });
  }

  /** 숨은 방을 내 화면에만 드러내고 걸어 들어갈 수 있게 한다. fadeIn이면 천천히 나타난다. */
  private showHideout(fadeIn: boolean) {
    this.dropHideoutImages();
    this.hideoutShown = true;
    this.world.openFloor(HIDEOUT.area, []);
    this.world.openFloor(this.passageArea, []);
    this.drops.refresh();
    const [x0, y0] = HIDEOUT.area;
    const { left, top } = hideoutOrigin(gridToWorld(x0, y0));
    const { passage } = HIDEOUT;
    const bridge = hideoutPassageOrigin(gridToWorld(passage.x, passage.y));
    const texture = (key: string, paint: () => HTMLCanvasElement) => {
      if (!this.textures.exists(key)) this.textures.addCanvas(key, paint());
      return key;
    };
    const floor = this.add.image(left, top, texture('hideout-floor', paintHideoutFloor)).setOrigin(0, 0).setDepth(DEPTH_HIDEOUT);
    // 벽은 방 맨 뒤 칸보다 바로 앞에 그려야 벽 뒤쪽 칸에 선 캐릭터가 벽에 가린다.
    const wall = this.add
      .image(left, top, texture('hideout-wall', paintHideoutWall))
      .setOrigin(0, 0)
      .setDepth(depthOf(x0, y0) - 1);
    const path = this.add
      .image(bridge.left, bridge.top, texture('hideout-passage', paintHideoutPassage))
      .setOrigin(0, 0)
      .setDepth(DEPTH_HIDEOUT);
    this.mapImages.push(floor, wall, path);
    const images = [floor, wall, path];
    this.showHideoutBlocks();
    this.hideoutImages = images;
    this.hud.announce(HIDEOUT.title);
    if (!fadeIn) return;
    for (const image of images) image.setAlpha(0);
    this.tweens.add({ targets: images, alpha: 1, duration: 1600, ease: 'Sine.easeOut' });
  }

  private addSign(name: string, x: number, y: number) {
    const tag = `sign-${name}`;
    this.tags.add(tag, name, 'sign');
    this.signs.push({ tag, x, y });
  }

  private clearMap() {
    for (const [id, avatar] of this.others) {
      avatar.destroy();
      this.tags.remove(id);
    }
    this.others.clear();
    for (const image of this.blockImages.values()) image.destroy();
    this.blockImages.clear();
    this.blockChunks.clear();
    this.glows.clear();
    this.keepClear.clear();
    for (const { image, tag } of this.portalSprites) {
      image.destroy();
      this.tags.remove(tag);
    }
    this.portalSprites = [];
    for (const { tag } of this.signs) this.tags.remove(tag);
    this.signs = [];
    this.covers.clear();
    this.workFx.clear();
    this.spotImages.clear();
    this.tweens.killTweensOf(this.hideoutImages);
    this.hideoutImages = [];
    for (const image of this.mapImages) image.destroy();
    this.mapImages = [];
    this.bullets.clear();
    this.drops.clear();
    this.stopMonsters();
    this.farm?.destroy();
    this.farm = null;
    this.advField?.destroy();
    this.advField = null;
    this.groundUi.setHint(null);
    this.groundUi.setTip(null);
    this.hideFarmPanel();
  }

  update(time: number) {
    // Phaser의 delta는 포커스가 바뀐 뒤 잠시 16.7ms로 묶여 프레임이 낮으면 움직임이 느려진다.
    const delta = Math.min(this.game.loop.rawDelta, MAX_FRAME_MS);
    this.advancePlayer(delta);
    this.updatePress(time);
    this.checkHideout();
    this.checkHush(time);
    for (const avatar of this.others.values()) avatar.update(delta);
    this.updateVision();
    this.bullets.update(delta);
    this.monsters?.update(delta);
    this.farm?.update(time);
    if (this.me) this.gloom.track(this.me.sprite);
    this.updateWork();
    this.workFx.update(delta);
    this.updateAim();
    this.updateReload();
    this.updateAutoFire();
    this.animatePortals(time);
    this.covers.update(time, this.me.sprite);
    this.updateHover();
    const picking = this.updatePickupHint();
    this.updateFarmPanel(picking);
    this.placeNameTags();
    this.updateMinimap(time);
    // 거래소 안에 있으면 시세판을 1분마다 새로 받는다(Market.refresh가 1분 안에는 건너뛴다).
    if (this.mapId === 'exchange') void this.market.refresh();
  }

  private get canAct() {
    const windowOpen =
      this.hud.isOpen ||
      this.office.isOpen ||
      this.dungeonWindow.isOpen ||
      this.coop.isOpen ||
      this.shop.isOpen ||
      this.forge.isOpen ||
      this.castle.isOpen ||
      this.fame.isOpen ||
      this.board.isOpen ||
      this.exchange.isOpen ||
      this.elevator.isOpen ||
      this.casino.isOpen ||
      this.adventureWindow.isOpen ||
      this.chat.isOpen ||
      this.advField?.levelUpOpen === true ||
      anyModalOpen();
    return !windowOpen && !this.traveling && !this.down && !this.advBusy;
  }

  /** 시작마을처럼 공격이 막힌 맵인지 */
  private get isSafeMap() {
    return MAPS[this.mapId].safe === true;
  }

  private get safeName() {
    return this.mapId === DEFAULT_MAP ? '시작마을' : MAPS[this.mapId].name;
  }

  private advancePlayer(delta: number) {
    const wasMoving = this.me.moving;
    this.me.update(delta);
    if (this.traveling || this.down) return;

    // F는 발밑에 주울 것이 있으면 줍고, 없으면 일을 시작하거나 멈춘다.
    if (this.keys.takeWork() && this.canAct && !this.tryPickUp() && !this.farmKey()) this.toggleWork();

    if (this.keys.takeJump() && this.canAct && !this.me.jumping) this.jump();

    if (this.me.moving) {
      this.steer();
      return;
    }

    // 막 도착했을 때만 탄다. 창을 닫은 뒤 그 자리에서 다시 열리지 않게 한다.
    const portal = wasMoving ? this.world.portalAt(this.me.tile.x, this.me.tile.y) : undefined;
    if (portal) {
      if (portal.to === 'office') this.office.open();
      else if (portal.to === 'dungeon') this.dungeonWindow.open();
      else if (portal.to === 'adventure') void this.adventureWindow.open();
      else if (portal.to === 'coop') this.coop.open();
      else if (portal.to === 'shop') this.shop.open();
      else if (portal.to === 'forge-shop') this.forge.openAt('buy');
      else if (portal.to === 'forge-anvil') this.forge.openAt('anvil');
      else if (portal.to === 'counter') this.castle.open();
      else if (portal.to === 'fame') void this.fame.open();
      else if (portal.to === 'board') this.board.open();
      else if (portal.to === 'trade') this.exchange.open();
      else if (portal.to === 'panel') this.elevator.open(this.elevatorFloor);
      else if (isGame(portal.to)) this.casino.open(portal.to);
      else if (isAdventure(portal.to)) void this.goAdventureMap(portal.to);
      else this.travel(portal.to);
      return;
    }
    // 누른 몬스터의 옆 칸에 닿았다: 싸운다.
    if (this.advPending && !this.route.length) {
      const m = this.advPending;
      this.advPending = null;
      if (this.canAct && Math.max(Math.abs(m.x - this.me.tile.x), Math.abs(m.y - this.me.tile.y)) === 1) this.bumpMonster(m);
    }
    const dir = this.keys.takeDirection();
    if (dir && this.canAct) {
      this.clearRoute();
      this.advPending = null;
      this.workGoal = null;
      this.beginStep(this.me.tile, dir);
    } else if (this.route.length && this.canAct) {
      this.followRoute();
    } else if (this.workGoal && this.canAct) {
      this.reachWork();
    }
  }

  /**
   * 휴대폰에서 화면에 손가락을 댔다. 무기를 들고 다른 플레이어(던전은 몬스터)를 누르면 바로 그쪽으로 공격하고 손을 뗄 때까지 연사한다.
   * 그 밖에는 손을 뗄 때(touchUp) 할 일을 정하고, 오래 누르면 블록을 회수한다(updatePress).
   */
  private touchDown(pointer: Phaser.Input.Pointer) {
    const { pointer1, pointer2 } = this.input;
    if (pointer1.isDown && pointer2.isDown) {
      // 두 손가락: 화면 확대·축소만 한다. 누르기와 연사는 멈춘다.
      this.press = null;
      this.touchFiring = false;
      this.pinch = Math.hypot(pointer1.x - pointer2.x, pointer1.y - pointer2.y);
      return;
    }
    const w = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const arm = this.inventory.selectedArm;
    if (arm && !this.isSafeMap && this.workStartedAt === null && this.tappedTarget(w.x, w.y)) {
      this.press = null;
      this.clearRoute();
      this.workGoal = null;
      this.touchFiring = true;
      this.attack(arm);
      return;
    }
    this.press = { x: pointer.x, y: pointer.y, wx: w.x, wy: w.y, at: this.time.now, checked: false };
  }

  private touchUp() {
    const press = this.press;
    this.press = null;
    this.pinch = null;
    if (press && this.canAct) this.tap(press.wx, press.wy);
  }

  /** 두 손가락 사이가 처음보다 PINCH_STEP배 넘게 벌어지거나 좁아지면 배율을 한 단계 바꾸고 그 거리를 새 기준으로 삼는다. */
  private updatePinch() {
    if (this.pinch === null) return;
    const { pointer1, pointer2 } = this.input;
    if (!pointer1.isDown || !pointer2.isDown) {
      this.pinch = null;
      return;
    }
    const distance = Math.hypot(pointer1.x - pointer2.x, pointer1.y - pointer2.y);
    const ratio = distance / Math.max(1, this.pinch);
    if (ratio < PINCH_STEP && ratio > 1 / PINCH_STEP) return;
    if (this.stepZoom(ratio > 1 ? 1 : -1)) this.pinch = distance;
  }

  /** 화면 배율을 정해 둔 단계(ZOOM_LEVELS)로 한 칸 올리거나(1) 내린다(-1). 도트가 뭉개지지 않게 단계로만 바꾸고 이 브라우저에 기억한다. 바꿀 차례였으면 true */
  private stepZoom(step: 1 | -1) {
    if (performance.now() < this.nextZoomAt) return false;
    this.nextZoomAt = performance.now() + ZOOM_STEP_MS;
    const cam = this.cameras.main;
    const at = ZOOM_LEVELS.indexOf(nearestZoom(cam.zoom));
    const next = ZOOM_LEVELS[Math.max(0, Math.min(ZOOM_LEVELS.length - 1, at + step))];
    if (next === cam.zoom) return true;
    cam.setZoom(next);
    try {
      localStorage.setItem(ZOOM_KEY, String(next));
    } catch {
      // 저장하지 못해도 지금 화면에서는 바뀐다.
    }
    return true;
  }

  /** 휴대폰에서 블록을 오래 누르면(손가락을 거의 움직이지 않고 LONG_PRESS_MS) 우클릭처럼 회수한다. 회수할 것이 없으면 손을 뗄 때 누르기로 친다. */
  private updatePress(time: number) {
    const press = this.press;
    if (!press || press.checked || time - press.at < LONG_PRESS_MS) return;
    press.checked = true;
    const pointer = this.input.activePointer;
    if (!pointer.isDown || Math.hypot(pointer.x - press.x, pointer.y - press.y) > PRESS_SLOP_PX || !this.canAct) return;
    this.pointAt(press.wx, press.wy);
    const target = this.hoveredBlock;
    if (!target || !this.reachesBlock(target)) return;
    this.press = null;
    void this.collectBlock();
  }

  /**
   * 휴대폰에서 화면을 눌렀다 뗐다(맵 좌표 wx, wy). 차례로 본다:
   * 메모장을 들고 내 칸 → 메모 쓰기, 작업장의 자원 → 옆으로 가서 일하기, 손 닿는 칸에 든 블록 놓기·농장 심기·거두기,
   * 그 밖에는 그 칸까지 걷는다(낮은 벽 바로 너머 칸이면 넘어 뛴다).
   */
  private tap(wx: number, wy: number) {
    // 모험 맵: 몬스터를 누르면 그 옆 칸까지 걸어가 싸운다(기획 19장 3번). 누른 자리로 본다.
    if (this.clickMonster(wx, wy)) return;
    const g = worldToGrid(wx, wy);
    const goal = { x: Math.floor(g.gx), y: Math.floor(g.gy) };
    this.advPending = null;
    // 메모장을 들고 내 칸을 누르면 메모를 쓴다.
    if (this.inventory.memoSelected && goal.x === this.me.tile.x && goal.y === this.me.tile.y) {
      this.writeMemo();
      return;
    }
    const spot = this.tappedSpot(wx, wy, goal);
    if (spot) {
      this.workAt(spot);
      return;
    }
    if (this.tapUse(wx, wy)) return;
    this.workGoal = null;
    if (!this.tapJump(goal)) this.walkTo(goal);
  }

  /** 누른 칸에 든 것을 쓴다: 농장 칸이면 심기·거두기(좌클릭과 같음), 블록을 들었으면 손 닿는 칸에 놓기. 한 일이 있으면 true */
  private tapUse(wx: number, wy: number) {
    this.pointAt(wx, wy);
    const stack = this.inventory.selectedStack;
    let used = this.farmClick();
    if (!used && stack && isBlockItem(stack.id) && this.placementSpot(stack.id)) {
      this.placeBlock();
      used = true;
    }
    this.hoveredBlock = this.hoveredGround = null;
    return used;
  }

  /** 맵 좌표 (wx, wy)가 가리키는 블록과 빈 바닥 칸을 hoveredBlock·hoveredGround에 넣는다(마우스의 updateHover와 같은 셈, 그리지 않음). */
  private pointAt(wx: number, wy: number) {
    const g = worldToGrid(wx, wy);
    const x = Math.floor(g.gx);
    const y = Math.floor(g.gy);
    let hit: Tile | null = null;
    for (let k = MAX_STACK; k >= 0 && !hit; k--) {
      for (const [cx, cy] of [
        [x + k + 1, y + k + 1],
        [x + k + 1, y + k],
        [x + k, y + k + 1],
        [x + k, y + k],
      ]) {
        if (this.world.heightAt(cx, cy) && this.hitsCube(cx, cy, wx, wy)) {
          hit = { x: cx, y: cy };
          break;
        }
      }
    }
    const owner = hit ? undefined : this.world.ownerOf(x, y);
    this.hoveredBlock = hit ?? owner ?? null;
    this.hoveredGround = !hit && !owner && this.world.inBounds(x, y) ? { x, y } : null;
  }

  /**
   * 작업장에서 누른 자원 칸. 그림의 불투명한 픽셀을 눌렀거나(나무 꼭대기처럼 칸 위로 솟은 곳도) 자원 칸이나 바로 옆 칸을 누르면 그 자원이다.
   * 그림이 겹치면 앞(깊이가 큰) 것을 고른다.
   */
  private tappedSpot(wx: number, wy: number, tile: Tile): Tile | null {
    if (!MAPS[this.mapId].work) return null;
    let best: { spot: Tile; depth: number } | null = null;
    for (const spot of this.world.map.spots) {
      const image = this.spotImages.get(`${spot.x},${spot.y}`);
      if (!image || (best && image.depth <= best.depth)) continue;
      const px = Math.floor(wx - (image.x - image.displayOriginX));
      const py = Math.floor(wy - (image.y - image.displayOriginY));
      if (opaqueAt(image.frame, px, py)) best = { spot, depth: image.depth };
    }
    if (best) return best.spot;
    const near = this.world.map.spots.filter((spot) => inReach(tile, spot));
    near.sort((a, b) => Math.hypot(a.x - tile.x, a.y - tile.y) - Math.hypot(b.x - tile.x, b.y - tile.y));
    return near[0] ?? null;
  }

  /** 휴대폰에서 자원을 눌렀다: 손이 닿으면 바로 일하고, 아니면 옆으로 걸어가서 일한다(reachWork). 그 자원을 이미 하고 있으면 그대로 둔다. */
  private workAt(spot: Tile) {
    if (this.workSpot && this.workSpot.x === spot.x && this.workSpot.y === spot.y) return;
    if (!this.me.moving && inReach(this.me.tile, spot)) {
      this.clearRoute();
      this.workGoal = null;
      this.startWork(spot);
      return;
    }
    this.walkTo(spot);
    this.workGoal = spot;
  }

  /** 자원을 눌러 걸어가다 멈췄다. 손이 닿으면 일을 시작하고, 길이 막혀 닿지 못했으면 알린다. */
  private reachWork() {
    const spot = this.workGoal!;
    this.workGoal = null;
    if (inReach(this.me.tile, spot)) this.startWork(spot);
    else this.hud.toast('손이 안 닿습니다', '자원 바로 옆에 붙어야 합니다');
  }

  /** 누른 곳 가까이에 맞을 수 있는 상대(다른 플레이어, 던전은 몬스터)가 있는지 본다. 몸통을 눌러도 되도록 총알 높이만큼 내려서 잰다. 빛 밖에 숨은 사람은 치지 않는다. */
  private tappedTarget(wx: number, wy: number) {
    const { gx, gy } = worldToGrid(wx, wy + BULLET_HEIGHT);
    const myId = this.session.profile.id;
    return this.bulletTargets().some(({ id, x, y }) => id !== myId && !this.others.get(id)?.isHidden && Math.hypot(x - gx, y - gy) <= TAP_TARGET_TILES);
  }

  /**
   * 휴대폰에서 낮은 벽 바로 너머 칸(두 칸 앞)을 눌렀는데 걸어서는 못 가면 Space처럼 넘어 뛴다. 뛰었으면 true.
   * 걸어갈 길이 있으면 걷는다(벽을 돌아가는 길이 있어도 뛰지 않는다).
   */
  private tapJump(goal: Tile) {
    if (this.me.moving || this.me.jumping) return false;
    const from = this.me.tile;
    const dx = goal.x - from.x;
    const dy = goal.y - from.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== JUMP_TILES || (dx % JUMP_TILES) || (dy % JUMP_TILES)) return false;
    const dir = { dx: dx / JUMP_TILES, dy: dy / JUMP_TILES };
    if (this.world.isWalkable(from.x + dir.dx, from.y + dir.dy)) return false;
    const landing = this.jumpLanding(from, dir);
    if (landing.x !== goal.x || landing.y !== goal.y) return false;
    const path = findPath(this.world, from, goal);
    const last = path[path.length - 1];
    if (last && last.x === goal.x && last.y === goal.y) return false;
    this.jump(dir);
    return true;
  }

  /** 모험 맵에서 몬스터(그림이나 칸)를 눌렀으면 그쪽으로 가 싸운다. 눌렀으면 true. */
  private clickMonster(wx?: number, wy?: number) {
    if (!this.advField || !this.canAct) return false;
    // 휴대폰은 손가락을 댄 자리(wx, wy), 마우스는 지금 가리키는 자리
    const w = wx === undefined || wy === undefined ? this.pointerWorld() : { x: wx, y: wy };
    const g = worldToGrid(w.x, w.y);
    const m = this.advField.monsterAtPoint(w.x, w.y) ?? this.advField.monsterAt({ x: Math.floor(g.gx), y: Math.floor(g.gy) });
    if (!m) return false;
    this.approachMonster(m);
    return true;
  }

  /** 몬스터를 눌렀다: 옆 칸이면 바로, 아니면 가장 가까운 옆 칸까지 걸어가 닿으면 싸운다(기획 19장 3번). */
  private approachMonster(m: FieldMonster) {
    this.clearRoute();
    this.advPending = null;
    const me = this.me.tile;
    if (Math.max(Math.abs(m.x - me.x), Math.abs(m.y - me.y)) === 1) {
      this.bumpMonster(m);
      return;
    }
    let best: Tile[] | null = null;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const t = { x: m.x + dx, y: m.y + dy };
        if (!this.world.isWalkable(t.x, t.y)) continue;
        const path = findPath(this.world, me, t);
        if (path.length && (!best || path.length < best.length)) best = path;
      }
    }
    if (!best) return;
    this.route = best;
    this.routeGoal = best[best.length - 1];
    this.drawRouteMarker();
    this.advPending = m;
  }

  /** 몬스터 쪽을 보고 부딪힌다(싸울 수 있으면 싸움). */
  private bumpMonster(m: Tile) {
    const me = this.me.tile;
    this.me.face(Math.sign(m.x - me.x), Math.sign(m.y - me.y));
    this.advField?.bump(m);
  }

  private walkTo(goal: Tile) {
    const path = findPath(this.world, this.me.tile, goal);
    this.route = path;
    this.routeGoal = path.length ? path[path.length - 1] : null;
    this.drawRouteMarker();
  }

  /** 정한 길로 한 칸 걷는다. 그사이 블록이나 다른 사람이 길을 막았으면 다시 찾는다. */
  private followRoute() {
    const from = this.me.tile;
    const next = this.route[0];
    const dx = next.x - from.x;
    const dy = next.y - from.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1 || !this.world.canStep(from, dx, dy)) {
      const goal = this.routeGoal;
      this.clearRoute();
      if (goal && (goal.x !== from.x || goal.y !== from.y)) this.walkTo(goal);
      return;
    }
    this.route.shift();
    this.lastDir = { dx, dy };
    this.moveTo(next, STEP_MS * Math.hypot(dx, dy), 'walk');
    this.me.face(dx, dy);
    this.walk = { from, dir: { dx, dy } };
    if (!this.route.length) this.clearRoute();
  }

  private clearRoute() {
    this.route = [];
    this.routeGoal = null;
    this.routeMarker?.clear();
  }

  /** 걸어갈 곳을 노란 마름모로 표시한다. */
  private drawRouteMarker() {
    this.routeMarker.clear();
    if (!this.routeGoal) return;
    const { x, y } = this.routeGoal;
    const pts = [gridToWorld(x, y), gridToWorld(x + 1, y), gridToWorld(x + 1, y + 1), gridToWorld(x, y + 1)];
    this.routeMarker.lineStyle(1, 0xffe14d, 0.95).beginPath();
    this.routeMarker.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) this.routeMarker.lineTo(p.x, p.y);
    this.routeMarker.closePath().strokePath();
  }

  /** 칸 이동을 막 시작했다면 새로 누른 방향으로 바로 튼다. 다음 칸까지 기다리지 않아도 된다. */
  private steer() {
    if (!this.walk || this.me.progress > TURN_WINDOW || !this.canAct) return;
    const dir = this.keys.takeDirection();
    if (!dir || (dir.dx === this.walk.dir.dx && dir.dy === this.walk.dir.dy)) return;
    this.clearRoute();
    this.beginStep(this.walk.from, dir);
  }

  private beginStep(from: Tile, dir: Dir) {
    this.lastDir = dir;
    // 모험 맵 몬스터 칸 쪽이면 걷거나 옆으로 미끄러지지 않고 부딪힌다(서 있을 때만, 기획 19장 3번).
    if (this.world.isMonsterTile(from.x + dir.dx, from.y + dir.dy)) {
      if (!this.me.moving) this.bumpMonster({ x: from.x + dir.dx, y: from.y + dir.dy });
      return;
    }
    const canGo = ({ dx, dy }: Dir) => this.world.canStep(from, dx, dy);
    const step = canGo(dir) ? dir : slideOptions(dir).find(canGo);
    if (!step) {
      this.me.face(dir.dx, dir.dy);
      return;
    }
    const running = this.keys.running;
    const ms = (STEP_MS * Math.hypot(step.dx, step.dy)) / (running ? RUN_SPEED : 1);
    this.moveTo({ x: from.x + step.dx, y: from.y + step.dy }, ms, running ? 'run' : 'walk');
    this.me.face(step.dx, step.dy);
    this.walk = { from, dir };
  }

  /** 걸음을 막 뗀 참이면 출발한 칸을 기준으로 삼아, 어디서 써도 점프 거리가 같게 한다. */
  private get actionStart() {
    const justLeft = this.walk && this.me.moving && this.me.progress < TURN_WINDOW;
    return justLeft ? this.walk!.from : this.me.tile;
  }

  /** 방향을 누르고 Space를 누르면 벽 하나를 넘을 수 있다. 벽 앞에서는 방향 없이 눌러도 넘는다. toward는 휴대폰에서 벽 너머를 눌렀을 때의 방향이다. */
  private jump(toward?: Dir) {
    this.clearRoute();
    this.workGoal = null;
    const from = this.actionStart;
    const ahead = { x: from.x + this.lastDir.dx, y: from.y + this.lastDir.dy };
    const facingWall = this.world.inBounds(ahead.x, ahead.y) && !this.world.isWalkable(ahead.x, ahead.y);
    const dir = toward ?? this.keys.takeDirection() ?? (facingWall ? this.lastDir : null);

    this.moveTo(dir ? this.jumpLanding(from, dir) : from, JUMP_MS, 'jump');
    if (dir) {
      this.lastDir = dir;
      this.me.face(dir.dx, dir.dy);
    }
    this.walk = null;
  }

  /**
   * 벽 너머에 설 곳이 있으면 거기로, 없으면 바로 앞이나 제자리로 내린다. 두 개 이상 쌓은 블록과 건물 안 벽은 못 넘는다.
   * 농장 울타리도 못 넘는다(2026-11-16 사용자 "막음"): 넘는 걸음이 있으면 그 너머에 내리지 않는다(farm-decor.md 2-3의 4번).
   */
  private jumpLanding(from: Tile, { dx, dy }: Dir): Tile {
    const near = { x: from.x + dx, y: from.y + dy };
    const far = { x: from.x + dx * JUMP_TILES, y: from.y + dy * JUMP_TILES };
    const toNear = !this.world.crossesFence(from, near);
    if (toNear && !this.world.crossesFence(near, far) && !this.world.blocksJump(near.x, near.y) && this.world.isWalkable(far.x, far.y)) return far;
    return toNear && this.world.isWalkable(near.x, near.y) ? near : from;
  }

  private moveTo(to: Tile, ms: number, motion: Motion = 'walk') {
    this.stopWork();
    if (motion === 'jump') this.me.jumpTo(to, ms);
    else if (motion === 'run') this.me.runTo(to, ms);
    else this.me.stepTo(to, ms);
    this.session.sendMove(to.x, to.y, ms, motion);
    this.session.saveLater(to);
    this.drawRange();
    this.advField?.step(to);
  }

  /** 엘리베이터 안에서 층을 골랐을 때: 그 층에서 문이 열린다. */
  rideElevator(to: TowerId) {
    this.elevator.close();
    this.elevatorFloor = to;
    this.travel(to);
  }

  /** 노동청 창에서 작업장을 골랐을 때 */
  goToWork(place: WorkId) {
    this.office.close();
    this.travel(place);
  }

  goToDungeon(dungeon: DungeonId) {
    this.dungeonWindow.close();
    this.travel(dungeon);
  }

  get currentMap(): MapId {
    return this.mapId;
  }

  /**
   * 모험 창 [들어가기]·[이어 하기](2026-11-18 모험 손보기): 판을 열고(판 중이면 그대로) 그 판이 있는 맵 입구로 간다.
   * 새 판은 입구 맵(adv_gate)에서 시작한다. 맵 자료와 Infernus 그림을 같이 읽는다(처음 한 번).
   */
  async enterAdventure() {
    if (this.traveling || this.advBusy) return;
    this.advBusy = true;
    try {
      const [view] = await Promise.all([adventureStart(), loadAdventureMaps().catch(() => null)]);
      if (typeof view === 'string') {
        this.hud.toast('들어가지 못했습니다', failText(view));
        return;
      }
      this.adventure.set(view);
      const map = view.runMap && isMapId(view.runMap) && isAdventure(view.runMap) ? view.runMap : ADVENTURE_GATE_MAP;
      // 이어 하는 판이 새 지역에 있으면 그 몬스터 그림도 먼저 읽는다.
      await loadAdventureMaps(map).catch(() => null);
      if (!adventureMapsReady(map)) {
        this.hud.toast('들어가지 못했습니다', '모험 맵을 읽지 못했습니다. 잠시 후 다시 해 주세요.');
        return;
      }
      this.adventureWindow.close();
      this.travel(map);
    } finally {
      this.advBusy = false;
    }
  }

  /** 모험 맵 포탈을 탔을 때: 서버에 이 판의 맵을 남기고(앞으로만, adventure_move) 그 맵 입구로 간다. BP는 쓰지 않는다. */
  private async goAdventureMap(to: AdventureMapId) {
    if (this.advBusy) return;
    this.advBusy = true;
    this.clearRoute();
    // 새 지역 맵이면 그 몬스터 그림(두 번째 그림, 처음 한 번)을 서버 옮기기와 함께 받는다.
    const [view] = await Promise.all([adventureMove(to), loadAdventureMaps(to).catch(() => null)]);
    this.advBusy = false;
    if (typeof view === 'string') {
      this.hud.toast('갈 수 없습니다', failText(view));
      return;
    }
    this.adventure.set(view);
    this.travel(to);
  }

  /**
   * 모험 맵에 들어왔다: 서버 값을 읽고(없으면) 띠 글씨와 조우 게이지를 띄운다.
   * 판이 없는데 모험 맵에 있으면(판이 끝난 뒤 새로고침) 시작마을로, 판이 다른 맵에 있으면 그 맵 입구로 보낸다.
   */
  private async startAdventureField(id: AdventureMapId) {
    const pending = this.adventure.view ? null : await this.adventure.refresh();
    // 맵을 올린 뒤 travel이 나를 들어온 칸으로 옮기므로, 한 번 기다린 다음 그 칸에서 시작한다.
    await Promise.resolve();
    const view = this.adventure.view;
    if (this.mapId !== id || this.advField || !view) return;
    if (!view.inRun) {
      if (pending && typeof pending !== 'string') this.showAdventureResult(pending);
      else this.travel(DEFAULT_MAP);
      return;
    }
    if (view.runMap && view.runMap !== id && isMapId(view.runMap) && isAdventure(view.runMap)) {
      const runMap = view.runMap;
      await loadAdventureMaps(runMap).catch(() => null);
      if (this.mapId === id && !this.advField) this.travel(runMap);
      return;
    }
    const data = advMap(id);
    // 맵 자료를 못 읽었으면(새로고침 때 읽기 실패) 시작마을로 보낸다. 판은 서버에 남아 다시 들어가면 이어 한다.
    if (!data) {
      this.travel(DEFAULT_MAP);
      return;
    }
    void loadAdventureArt();
    const zone = this.adventure.zoneOfMap(id) ?? null;
    // 몬스터 이름표는 밤 덮개 바로 아래(나무에 가리지 않게) 둔다.
    this.advField = new AdventureField(this, document.getElementById('hud')!, this.adventure, { id, data, zone }, DEPTH_DAYLIGHT - 1, {
      fight: (monster) => zone && void this.adventureFight(zone.id, monster),
      canFight: () => this.canAct,
      reset: () => this.time.delayedCall(RESET_DELAY_MS, () => this.resetToEntry()),
      leave: () => this.askReturn(),
      // 전투 뒤(runQuiet)면 배경이 걷힌 뒤 금화가 오른다.
      goldDelay: () => (this.runQuiet ? LEAVE_MS : null),
    });
    // 몬스터 칸은 막는다(걷기·점프·길찾기, 부딪히면 싸움).
    this.world.setMonsterTiles(this.advField.monsters);
    this.advField.enter(this.me.tile);
    this.syncAdventurePortals();
    // 전투 중에 새로고침했다면 그 판의 결과가 여기서 한 번 온다.
    if (pending && typeof pending !== 'string') this.showAdventureResult(pending);
  }

  /** 얽힌 숲 되돌림 칸(기획 11장): 밟으면 미로 입구로 옮긴다(같은 맵 안, 맵을 다시 올리지 않음). */
  private resetToEntry() {
    if (!isAdventure(this.mapId) || this.traveling) return;
    const tile = advEntry(this.mapId);
    this.clearRoute();
    this.keys.releaseDirections();
    this.me.teleport(tile);
    this.drawRange();
    this.session.sendMove(tile.x, tile.y, 0);
    this.session.saveLater(tile);
    this.advField?.enter(tile);
    this.hud.toast('미로 입구로 돌아왔습니다.');
  }

  /** [귀환]: 확인 창 뒤 판을 끝낸다(BP 0과 같은 양을 가져감). */
  private askReturn() {
    if (this.advBusy || anyModalOpen() || !this.adventure.view?.inRun) return;
    confirmReturn(document.getElementById('hud')!, () => void this.adventureLeave());
  }

  private async adventureLeave() {
    if (this.advBusy) return;
    this.advBusy = true;
    const view = await adventureReturn();
    this.advBusy = false;
    if (typeof view === 'string') {
      this.hud.toast('귀환하지 못했습니다', failText(view));
      return;
    }
    const { result, ...rest } = view;
    this.adventure.set(rest);
    // 가져온 골드는 결과 화면 뒤 마을에 서면 계정 줄에서 오른다(디자인 adventure-ui.md 16절).
    this.hud.holdGold();
    this.economy.setGold(toGold(rest.townGold, this.economy.gold));
    if (result) this.showAdventureResult(result);
    else this.travel(DEFAULT_MAP, () => this.hud.releaseGold());
  }

  /**
   * 모험 전투 하나(맵 위 몬스터 곁에서 버튼·Enter). 결과는 서버가 정하고(레벨과 구역 보너스도 몬스터 자리로) 여기서는 차례 목록을 그린다.
   * 서버는 직전 전투와 2.5초 안이면 받지 않으므로, 결과 줄을 일찍 닫고 바로 다시 누르면 남은 시간만큼 기다렸다가 부른다.
   * 누르면 서버 요청을 먼저 보내고 그동안 들어가기 소용돌이를 돌린다(battleIntro.ts). 둘 다 끝나면 전투 창을 연다.
   * 소용돌이가 필드를 찍은 뒤부터 전투 창이 닫힐 때까지 뒤의 필드는 그리지 않는다(Phaser 루프를 재움, 기획 13장).
   */
  private async adventureFight(zone: string, monster: FieldMonster) {
    if (this.advBusy) return;
    this.advBusy = true;
    // 정보 칸 레벨 업 막대(마을 레벨 등)나 위 HUD 금화 오르기가 돌고 있으면 끝 모습으로 가고 싸운다.
    this.hud.finishLevel();
    this.advField?.finishGold();
    this.clearRoute();
    const root = document.getElementById('hud')!;
    const before = this.adventure.view;
    const frame = monsterArt(monster.art)?.frame;
    const mapId = this.mapId;
    // 그 맵 전투 배경을 소용돌이 동안 받기 시작한다(같은 그림은 처음 한 번, playBattle이 기다림)
    void loadMapBg(mapId).catch(() => null);
    const request = (async () => {
      const gap = FIGHT_GAP_MS - (performance.now() - this.advFoughtAt);
      if (gap > 0) await new Promise((resolve) => window.setTimeout(resolve, gap));
      this.advFoughtAt = performance.now();
      return adventureBattle(mapId, monster.x, monster.y);
    })().catch(() => 'failed');
    const cam = this.cameras.main;
    const body = this.advField?.bodyOf(monster);
    const view = cam.worldView;
    const at = body ? { x: (body.x - view.x) / view.width, y: (body.y - view.y) / view.height } : { x: 0.5, y: 0.5 };
    const intro = new BattleIntro(this.game, swirlKind(frame?.role ?? (monster.kind === 'normal' ? 'normal' : 'boss'), this.advClosedAt), at);
    const [battle] = await Promise.all([request, intro.done]);
    if (typeof battle === 'string') {
      this.game.loop.wake();
      intro.leave();
      this.keys.releaseDirections();
      this.advBusy = false;
      this.advField?.settle();
      this.hud.toast('싸우지 못했습니다', failText(battle));
      return;
    }
    const zones = before?.zones ?? battle.state.zones;
    const place = zones.findIndex((z) => z.id === zone);
    const main = this.adventure.weapon(battle.state.mainWeapon);
    const dropped = this.adventure.weapon(battle.drop);
    const mini = monster.kind === 'mini' ? zones[place]?.minis.find((m) => m.name === monster.slot) : undefined;
    this.session.sendFight(true);
    const levelBefore = before?.inRun ? before.level : '1';
    // 이긴 전투로 판 레벨이 오르고 판이 이어지며 포인트가 남으면(저절로 나누기 끔) 필드로 돌아온 뒤 레벨 업 창을 띄운다.
    const s = battle.state;
    const levelUp = battle.win && !battle.ended && battle.level !== levelBefore && !s.auto && s.points !== '0';
    try {
      await playBattle(root, battle, {
        zoneName: zones[place]?.name ?? '',
        miniName: mini?.name ?? null,
        foe: frame ? { art: monster.art, name: frame.name ?? '', role: frame.role } : null,
        member: this.session.profile.skin ?? memberOf(this.session.profile.id),
        levelBefore,
        expBefore: before?.inRun ? before.exp : '0',
        weapon: main ? { id: main.id, art: main.art } : null,
        drop: dropped ? { name: dropped.name, star: dropped.star, art: dropped.art } : null,
        onBackdrop: intro.hasBackdrop,
      });
    } finally {
      this.game.loop.wake();
      intro.leave();
      this.advClosedAt = performance.now();
      // 결과 칸이 닫힐 때 누르고 있던 방향 키는 잊는다(손을 떼고 다시 눌러야 걷는다. 방금 싸운 몬스터 쪽이면 저절로 또 싸우게 되므로, 에이전트가 정함).
      this.keys.releaseDirections();
      // 레벨 업 창이 뜰 때까지(장막이 걷히는 동안) 필드 입력은 계속 막는다.
      if (!levelUp) this.advBusy = false;
      // 레벨 막대·금화는 결과 칸에서 보였으니 정보 칸과 위 HUD는 끝 값으로 조용히 맞춘다.
      this.runQuiet = true;
      this.adventure.set(battle.state);
      this.runQuiet = false;
      this.session.sendFight(false);
    }
    this.advField?.settle();
    // BP를 다 써서 모험이 끝났으면 가져온 골드는 결과 화면 뒤 마을에 서면 오른다.
    if (battle.ended) this.hud.holdGold();
    this.economy.setGold(toGold(battle.state.townGold, this.economy.gold));
    if (levelUp) {
      // 장막이 걷힌 뒤(150ms) 레벨 업 창
      await new Promise((resolve) => window.setTimeout(resolve, LEAVE_MS));
      this.advBusy = false;
      this.advField?.openLevelUp(levelBefore, battle.level, battle.points);
    }
    // 판이 끝났으면 결과는 서버에 남아 있고 adventure_state가 한 번 준다(새로고침해도 다음에 뜸).
    if (battle.ended) {
      const result = await this.adventure.refresh();
      if (result && typeof result !== 'string') this.showAdventureResult(result);
      else this.hud.releaseGold(COUNT.gold);
    }
  }

  /** 모험 맵에서 P: 스텟 판을 열고 닫는다. 모험 맵이 아니면 false. */
  adventureStatsKey() {
    if (!this.advField || anyModalOpen()) return false;
    this.advField.toggleStats();
    return true;
  }

  /** 판 결과 화면. 모험 맵에서 끝난 판이면(BP 0, 귀환) [마을로]로 시작마을 모험하기 포탈 앞에 간다. */
  /**
   * 모험 결과 화면. [마을로]면 마을에 선 뒤 붙잡아 둔 계정 줄 골드가 600ms 동안 오른다.
   * 마을로 가지 않고 닫으면(Esc, [확인]) 닫을 때 오른다.
   */
  private showAdventureResult(result: AdvResult) {
    const toVillage = isAdventure(this.mapId) ? () => this.travel(DEFAULT_MAP, () => this.hud.releaseGold()) : undefined;
    showAdventureResult(document.getElementById('hud')!, result, this.adventure, toVillage).whenClosed(() => {
      if (!this.traveling) this.hud.releaseGold();
    });
  }

  /** 가진 자원을 모두 판다. 금액은 서버가 계산한다. */
  async sellEverything() {
    const before = this.economy.gold;
    const gold = await this.session.sellAll();
    if (gold === null) {
      this.hud.toast('정산에 실패했습니다', '잠시 후 다시 시도해 주세요');
      return;
    }
    this.economy.setSold(gold);
    this.hud.toast(`+${goldText(gold - before)}`, '수고하셨습니다. 내일도 나오세요.');
  }

  /** 상점에서 작업 도구를 산다. 효과는 서버의 harvest가 적용한다. */
  async buyTool({ id, name }: ShopTool) {
    const gold = await this.session.buyTool(id);
    if (gold === null) {
      this.hud.toast('살 수 없습니다', '잠시 후 다시 시도해 주세요');
      return;
    }
    this.economy.setToolBought(id, gold);
    this.hud.toast(`${name} 구매 완료`, '가지고 있으면 자동으로 적용됩니다');
  }

  /** ITS'room 카운터에서 스텟을 amount만큼 올린다. */
  async buyStat(id: StatId, amount: number) {
    const bought = await this.session.buyStat(id, amount);
    if (!bought) {
      this.hud.toast('살 수 없습니다', '잠시 후 다시 시도해 주세요');
      return;
    }
    this.economy.setStatBought(id, bought.value, bought.gold);
    if (id === 'hp') this.raiseMaxHp(maxHpOf(bought.value));
  }

  /** HP 스텟을 샀다. 서버처럼 지금 체력도 늘어난 만큼 채우고(쓰러져 있으면 그대로), 같은 맵 사람들에게 새 체력 막대를 알린다. */
  private raiseMaxHp(maxHp: number) {
    const gained = maxHp - this.me.maxHp;
    this.me.maxHp = maxHp;
    this.setMyHp(this.me.isDown ? 0 : this.me.hp + gained);
    const { x, y } = this.me.tile;
    this.session.sendMove(x, y, 0);
  }

  /** F로 작업을 시작하거나 멈춘다. 움직이면 멈춘다. */
  private toggleWork() {
    if (this.workStartedAt !== null) {
      this.stopWork();
      return;
    }
    if (!MAPS[this.mapId].work) {
      this.hud.toast('여기선 할 일이 없습니다', '노동청에 가서 일감을 받으세요');
      return;
    }
    const spot = this.world.spotNear(this.me.tile);
    if (!spot) {
      this.hud.toast('손이 안 닿습니다', '자원 바로 옆에 붙어서 F를 누르세요');
      return;
    }
    this.startWork(spot);
  }

  /** 손이 닿는 자원 칸 spot에서 일을 시작한다(F, 휴대폰은 자원 누르기). 다른 자원을 하고 있었으면 바꾼다. */
  private startWork(spot: Tile) {
    if (!MAPS[this.mapId].work) return;
    this.stopWork();
    this.me.face(Math.sign(spot.x - this.me.tile.x), Math.sign(spot.y - this.me.tile.y));
    this.workStartedAt = performance.now();
    this.workSpot = spot;
    this.harvestFails = 0;
    this.startWorkFx(this.session.profile.id, this.me, spot);
    this.announceWork();
  }

  /** 작업 동작을 그린다. 다른 사람이 일을 시작했을 때도 쓴다. */
  private startWorkFx(id: string, avatar: Avatar, spot: Tile) {
    const place = this.economy.workplace(this.mapId);
    if (!place) return;
    const image = this.spotImages.get(`${spot.x},${spot.y}`) ?? null;
    this.workFx.start(id, place.id, avatar, spot, image, place.gatherMs);
  }

  /** 일을 시작하거나 멈춘 것을 같은 맵 사람들에게 알린다(이동 알림에 일하는 칸이 실린다). */
  private announceWork() {
    const { x, y } = this.me.tile;
    this.session.sendMove(x, y, 0);
  }

  private stopWork() {
    if (this.workStartedAt === null) return;
    this.workStartedAt = null;
    this.workSpot = null;
    this.tags.setProgress(this.session.profile.id, null);
    this.workFx.stop(this.session.profile.id);
    this.announceWork();
  }

  /**
   * 일한 시간이 채집 시간을 넘으면 자원을 하나 얻는다. 화면 갱신(update)과 함께, 창을 내리거나 다른 탭으로 가도
   * 멈추지 않는 시계(startTicker)에서도 부른다(2026-11-11 사용자 요청). 시각은 performance.now라 숨어 있어도 흐른다.
   */
  private updateWork() {
    if (this.workStartedAt === null) return;
    const place = this.economy.workplace(this.mapId);
    if (!place) {
      this.stopWork();
      return;
    }
    const now = performance.now();
    const progress = (now - this.workStartedAt) / place.gatherMs;
    this.tags.setProgress(this.session.profile.id, progress);
    if (progress < 1) return;
    this.workStartedAt = now;
    void this.collectResource();
  }

  private async collectResource() {
    const result = await this.session.harvest();
    if (typeof result === 'string') {
      this.harvestFailed(result);
      return;
    }
    this.harvestFails = 0;
    const info = this.economy.lootItem(result.item);
    if (!info) return;
    const rare = this.economy.isRare(info);
    this.workFx.finish(this.session.profile.id, rare, true);
    this.session.sendHarvest(rare);
    this.economy.add(result.item, result.count);
    const name = result.count > 1 ? `${info.name} ×${result.count}` : info.name;
    this.hud.toast(`${name} 획득 (${info.price}G) · 경험치 +${result.gained}`, info.blurb, this.economy.isRare(info));
    this.gainExp(BigInt(result.level), result.exp);
  }

  /** 서버가 작업을 거절했다. 연달아 거절하면 일을 멈추고 까닭을 알린다. */
  private harvestFailed(reason: HarvestFail) {
    this.harvestFails++;
    if (this.harvestFails < HARVEST_FAILS_TO_STOP || this.workStartedAt === null) return;
    this.stopWork();
    if (reason === 'elsewhere') {
      this.hud.toast('분신술은 아직 못 배웠습니다', '같은 계정이 다른 창에서 다른 곳에 가 있어 일을 멈췄습니다. 다른 창을 닫고 새로고침하세요');
    } else {
      this.hud.toast('일이 손에 안 잡힙니다', byInput('서버가 연달아 받아 주지 않아 일을 멈췄습니다. F로 다시 시작하세요', '서버가 연달아 받아 주지 않아 일을 멈췄습니다. 자원을 눌러 다시 시작하세요'));
    }
  }

  /** 내 레벨과 경험치가 바뀌었다. 작업 결과와 서버 알림이 둘 다 오므로 지금보다 앞설 때만 바꾼다. */
  private gainExp(level: bigint, exp: number) {
    if (level < this.level || (level === this.level && exp <= this.exp)) return;
    const leveled = level > this.level;
    this.level = level;
    this.exp = exp;
    // 레벨이 오르면 정보 칸 막대가 돌고, 그동안 내 이름표 숫자는 막대(showAnimatedLevel)가 맞춘다.
    const animated = this.hud.setLevel(level, exp, leveled);
    if (!leveled) return;
    this.session.refreshPresence();
    if (!animated) this.showLevel(this.session.profile.id, level);
    this.hud.toast(`레벨 업! Lv. ${formatNumber(level)}`, `다음 레벨까지 경험치 ${formatNumber(levelNeed(level))}`);
  }

  /**
   * 이름표 레벨. 모험 맵에서는 판 레벨(연보라 .adv-run, 판이 없으면 이름만)이고 그 밖은 마을 레벨이다
   * (2026-11-18 사용자 "게임에 들어가면 인게임 레벨이 나오도록", 디자인 adventure-ui.md 14절).
   */
  private showLevel(id: string, level: bigint) {
    if (!isAdventure(this.mapId)) {
      this.tags.setLevel(id, `Lv. ${formatNumber(level)}`, false);
      return;
    }
    const run = id === this.session.profile.id ? this.currentRun() : (this.otherRuns.get(id) ?? null);
    this.tags.setLevel(id, run ? `Lv. ${formatNumber(BigInt(run))}` : '', true);
  }

  /**
   * 정보 칸 레벨 업 막대가 도는 동안 보이는 레벨을 내 이름표에도 쓴다(pop이면 같이 튄다). 끝에는 끝 레벨로 한 번 온다.
   * 막대가 마을 것인데 모험 맵에 와 있거나 그 반대면(도는 중에 맵을 옮김) 지금 맵의 레벨을 쓴다.
   */
  private showAnimatedLevel(level: bigint, pop: boolean) {
    const id = this.session.profile.id;
    const run = isAdventure(this.mapId);
    if (this.hud.barMode !== (run ? 'run' : 'town')) {
      this.showLevel(id, this.level);
      return;
    }
    this.tags.setLevel(id, `Lv. ${formatNumber(level)}`, run);
    if (pop) this.tags.popLevel(id);
  }

  /** 모험 맵 판 값을 정보 칸과 내 이름표에 맞춘다. 판 레벨이 오르면 정보 칸 막대가 돌고(내 이름표도 같이) 같은 맵 사람들에게 알린다. */
  private refreshRunLevel() {
    const run = this.currentRun();
    const leveled = !this.runQuiet && run !== null && this.shownRunLevel !== null && BigInt(run) > BigInt(this.shownRunLevel);
    const changed = run !== this.shownRunLevel;
    this.shownRunLevel = run;
    const view = this.adventure.view;
    let animated = false;
    if (!isAdventure(this.mapId)) this.hud.setRun(null);
    else if (!run || !view) this.hud.setRun('none');
    else animated = this.hud.setRun(runStatus(run, view.exp, view.power.hp), leveled);
    if (!changed) return;
    if (!animated) this.showLevel(this.session.profile.id, this.level);
    this.session.refreshPresence();
  }

  /** 포탈을 타면 화면을 어둡게 한 사이에 맵을 바꾼다. */
  private travel(to: MapId, onArrive?: () => void) {
    this.clearRoute();
    this.workGoal = null;
    this.press = null;
    if (to === 'elevator' && isTower(this.mapId)) this.elevatorFloor = this.mapId;
    this.traveling = true;
    this.stopWork();
    const cam = this.cameras.main;
    cam.once('camerafadeoutcomplete', () => {
      const tile = arrivalFor(to, this.mapId);
      this.clearMap();
      this.showMap(to);
      this.me.teleport(tile);
      this.keys.releaseDirections();
      this.drawRange();
      void this.session.changeMap(to, tile.x, tile.y);
      cam.fadeIn(FADE_MS);
      this.traveling = false;
      onArrive?.();
    });
    cam.fadeOut(FADE_MS);
  }

  private animatePortals(time: number) {
    const smokeFrame = Math.floor(time / SMOKE_FRAME_MS) % SMOKE_FRAMES.length;
    for (const smoke of this.chimneySmoke) smoke.setTexture(SMOKE_FRAMES[smokeFrame]);

    const frame = Math.floor(time / PORTAL_FRAME_MS) % PORTAL_FRAMES;
    if (frame === this.portalFrame) return;
    this.portalFrame = frame;
    for (const { portal, image } of this.portalSprites) image.setTexture(this.portalTexture(portal, frame));
  }

  /**
   * 전쟁터: 손전등 빛을 다시 계산한다. 빛 밖의 다른 플레이어는 숨기지 않고 어둠 아래에서 어둡게 보이고, 이름표만 흐리게 한다
   * (2026-11-18 사용자 "시야각 밖에 있어도 어둡게라도 상대방 캐릭터는 보여야 된다. 시야각은 단순히 밝아지는 느낌이다").
   * 4층: 숨은 방 안에 선 다른 사람은 내가 방을 열지 않았으면(내 화면에서 그 칸이 허공이면) 숨긴다(2026-11-15).
   */
  private updateVision() {
    if (!this.flashlight.active) {
      if (this.mapId === HIDEOUT.map) this.hideOthersInVoid();
      return;
    }
    const me = this.me.position();
    const ox = me.x + 0.5;
    const oy = me.y + 0.5;
    this.flashlight.update(
      ox,
      oy,
      this.flashlightAim(ox, oy),
      (x, y) => !this.world.inBounds(x, y) || this.world.blocksShots(x, y),
      this.world.version,
      this.time.now,
    );
    for (const [id, avatar] of this.others) {
      const at = avatar.position();
      this.tags.setDim(id, !this.flashlight.sees(at.x + 0.5, at.y + 0.5));
    }
  }

  /** 내 화면에서 허공인 칸(닫힌 숨은 방)에 선 다른 사람과 이름표, 말풍선을 숨긴다. */
  private hideOthersInVoid() {
    for (const [id, avatar] of this.others) {
      const hidden = this.world.isVoid(avatar.tile.x, avatar.tile.y);
      if (avatar.setHidden(hidden)) this.tags.setHidden(id, hidden);
    }
  }

  /**
   * 손전등이 비출 방향(격자 좌표의 각도): 마우스가 있으면 마우스 쪽(2026-11-13 사용자 요청), 휴대폰처럼 터치로 하거나
   * 마우스를 아직 움직이지 않았거나 캐릭터 바로 위를 가리키면 캐릭터가 바라보는 방향이다.
   */
  private flashlightAim(ox: number, oy: number) {
    const pointer = this.input.activePointer;
    if (!pointer.wasTouch && (pointer.x !== 0 || pointer.y !== 0)) {
      const w = this.pointerWorld();
      const g = worldToGrid(w.x, w.y);
      const dx = g.gx - ox;
      const dy = g.gy - oy;
      if (dx * dx + dy * dy > 0.25) return Math.atan2(dy, dx);
    }
    const { dx, dy } = this.me.gridFacing;
    return Math.atan2(dy, dx);
  }

  private placeNameTags() {
    const cam = this.cameras.main;
    const place = (id: string, x: number, y: number) => {
      this.tags.place(id, (x - cam.worldView.x) * cam.zoom, (y - cam.worldView.y) * cam.zoom);
    };
    const placeAvatar = (id: string, { sprite }: Avatar) => place(id, sprite.x, sprite.y - HEAD_HEIGHT);

    placeAvatar(this.session.profile.id, this.me);
    for (const [id, avatar] of this.others) placeAvatar(id, avatar);
    for (const { image, tag } of this.portalSprites) place(tag, image.x, image.y - PORTAL_TAG_HEIGHT);
    for (const { tag, x, y } of this.signs) place(tag, x, y);
  }

  /**
   * 미니맵. 접혀 있으면 아무것도 하지 않는다. 펼쳐 있으면 0.1초마다 내 칸, 다른 사람 칸, 블록(World.version), 맵이 바뀌었는지만 보고
   * 바뀌었을 때만 블록 목록을 만들어 다시 그린다(2026-11-16 PM "바뀔 때만 그리기", 렌더링 성능 우선).
   */
  private updateMinimap(time: number) {
    if (this.minimap.folded || time < this.nextMinimapAt) return;
    this.nextMinimapAt = time + MINIMAP_INTERVAL_MS;
    // 숨은 방 안의 사람은 방을 열지 않은 사람의 미니맵에 그리지 않는다. 전쟁터도 이제 다른 사람을 그린다(2026-11-18, 빛 밖도 보이게 바꾸며 에이전트가 정함).
    const others = [...this.others.values()].map((avatar) => avatar.tile).filter(({ x, y }) => !this.world.isVoid(x, y));
    const seen = this.minimapSeen;
    let n = 0;
    let changed = false;
    const see = (value: number) => {
      if (seen[n] !== value) {
        seen[n] = value;
        changed = true;
      }
      n++;
    };
    see(this.minimapEpoch);
    see(this.world.version);
    see(this.hideoutShown ? 1 : 0);
    see(this.me.tile.x);
    see(this.me.tile.y);
    for (const { x, y } of others) {
      see(x);
      see(y);
    }
    if (seen.length !== n) {
      seen.length = n;
      changed = true;
    }
    if (!changed) return;
    this.minimapDraws++;
    this.minimap.draw({
      me: this.me.tile,
      others,
      blocks: [...this.world.blockTiles(), ...this.world.map.walls, ...this.world.map.partitions],
      portals: this.world.portals,
    });
  }

  private pointerWorld() {
    const pointer = this.input.activePointer;
    return this.cameras.main.getWorldPoint(pointer.x, pointer.y);
  }

  /** 무기를 들고 있으면 마우스 쪽으로 겨누고 커서를 조준점으로 바꾼다. */
  private updateAim() {
    const arm = this.down || this.isSafeMap || this.workStartedAt !== null ? null : this.inventory.selectedArm;
    const key = arm?.key ?? null;
    if (key !== this.armedWith) {
      this.armedWith = key;
      this.input.setDefaultCursor(arm ? 'crosshair' : 'default');
      if (arm) this.me.setWeapon(arm.kind);
      else this.me.lowerGun();
      this.showAmmo();
    }
    if (!arm) return;
    const w = this.pointerWorld();
    const { x, y } = this.me.sprite;
    this.me.aim(Math.atan2(w.y - (y - BULLET_HEIGHT), w.x - x));
  }

  /** 연사 무기는 누르고 있는 동안 계속 쏜다. */
  private updateAutoFire() {
    const arm = this.inventory.selectedArm;
    if (!arm || !WEAPONS[arm.kind].auto || !this.canAct || this.isSafeMap) return;
    // 휴대폰은 걸으려고 누른 손가락으로 쏘지 않도록 플레이어를 눌렀을 때만 연사한다.
    if (this.input.activePointer.wasTouch && !this.touchFiring) return;
    if (this.input.activePointer.leftButtonDown()) this.attack(arm);
  }

  private useSelectedItem() {
    if (this.inventory.memoSelected) {
      this.writeMemo();
      return;
    }
    const potion = this.inventory.selectedStack?.id;
    if (potion && isPotion(potion)) {
      void this.drinkPotion(potion);
      return;
    }
    if (this.farmClick()) return;
    const arm = this.inventory.selectedArm;
    if (arm && this.isSafeMap) this.notice(`${this.safeName}은 비무장지대입니다`, '이곳에서는 무기를 쓸 수 없습니다.');
    else if (arm) this.attack(arm);
    else if (!isGearRef(this.inventory.selectedStack?.id)) this.placeBlock();
  }

  /** 고른 칸의 포션을 마신다(휴대폰에서 고른 포션 칸을 한 번 더 눌렀을 때). */
  drinkSelectedPotion() {
    const id = this.inventory.selectedStack?.id;
    if (id && isPotion(id) && this.canAct) void this.drinkPotion(id);
  }

  /** 포션 하나를 마신다. 체력과 남은 개수는 서버가 정한다(2026-11-15 사용자 요청). */
  private async drinkPotion(id: PotionId) {
    if (this.down || this.drinking) return;
    if (this.economy.potionCount(id) <= 0) {
      this.notice('포션이 없습니다', '시작마을 상점에서 삽니다.');
      return;
    }
    if (this.me.hp >= this.me.maxHp) {
      this.notice('체력이 가득 찼습니다', '지금은 마실 필요가 없습니다.');
      return;
    }
    this.drinking = true;
    const result = await this.session.usePotion(id);
    this.drinking = false;
    if (typeof result === 'string') {
      if (result === 'none') this.economy.setPotionCount(id, 0);
      if (result === 'fast') this.notice('아직 삼키는 중입니다', '포션은 1초에 하나씩 마십니다.');
      else if (result === 'full') this.notice('체력이 가득 찼습니다', '지금은 마실 필요가 없습니다.');
      else if (result === 'none') this.notice('포션이 없습니다', '시작마을 상점에서 삽니다.');
      else if (result === 'failed') this.notice('마시지 못했습니다', '잠시 후 다시 시도해 주세요.');
      return;
    }
    const myId = this.session.profile.id;
    const healed = result.hp - this.me.hp;
    this.economy.setPotionCount(id, result.count);
    if (healed > 0) this.tags.float(myId, `+${healed}`, 'heal');
    this.onHp(myId, result.hp, null);
  }

  private notice(title: string, detail: string) {
    if (this.time.now < this.nextNoticeAt) return;
    this.nextNoticeAt = this.time.now + NOTICE_MS;
    this.hud.toast(title, detail);
  }

  /** 총의 탄창. 처음 들면 가득 차 있고, 재장전이 끝났으면 채운다. 근접 무기는 null이다. */
  private magOf(arm: Arm) {
    const size = this.economy.weapon(arm.kind)?.magazine ?? null;
    if (size === null) return null;
    let mag = this.mags.get(arm.key);
    if (!mag) {
      mag = { left: size, reloadUntil: 0 };
      this.mags.set(arm.key, mag);
    }
    if (mag.reloadUntil && this.time.now >= mag.reloadUntil) {
      mag.left = size;
      mag.reloadUntil = 0;
    }
    return { mag, size };
  }

  /** 재장전을 시작한다. 이미 하는 중이거나 탄이 가득하면 하지 않는다. */
  private reload(arm: Arm) {
    const found = this.magOf(arm);
    if (!found || found.mag.reloadUntil || found.mag.left >= found.size) return false;
    found.mag.reloadUntil = this.time.now + (this.economy.weapon(arm.kind)?.reloadMs ?? 0);
    this.showAmmo();
    return true;
  }

  /** R: 총을 들었으면 재장전, 아니면 가구 돌리기(weapons.md 6장) */
  reloadOrRotate() {
    const arm = this.inventory.selectedArm;
    if (arm && this.magOf(arm)) {
      if (this.canAct) this.reload(arm);
      return;
    }
    this.inventory.rotateSelected();
  }

  /** 화면 아래 든 것 이름 옆에 남은 탄을 쓴다. 쏠 때, 재장전을 시작하고 끝낼 때, 무기를 바꿀 때만 부른다. */
  private showAmmo() {
    const arm = this.armedWith ? this.inventory.selectedArm : null;
    const found = arm ? this.magOf(arm) : null;
    if (!found) {
      this.hud.setAmmo(null);
      return;
    }
    this.hud.setAmmo(found.mag.reloadUntil ? '재장전 중' : `${found.mag.left} / ${found.size}`);
  }

  /** 재장전 원을 캐릭터 옆에 그린다. 진행이 12단계 가운데 다음 단계로 넘어갈 때만 다시 그린다. */
  private updateReload() {
    const arm = this.armedWith ? this.inventory.selectedArm : null;
    const found = arm ? this.magOf(arm) : null;
    const reloading = found?.mag.reloadUntil ? found.mag.reloadUntil : 0;
    if (!reloading) {
      if (this.reloadStep >= 0) {
        this.reloadRing?.clear();
        this.reloadStep = -1;
        this.showAmmo();
      }
      return;
    }
    const total = this.economy.weapon(arm!.kind)?.reloadMs ?? 1;
    const done = 1 - (reloading - this.time.now) / total;
    const step = Math.min(RELOAD_RING.steps, Math.max(0, Math.floor(done * RELOAD_RING.steps)));
    if (!this.reloadRing) this.reloadRing = this.add.graphics();
    const { x, y } = this.me.sprite;
    this.reloadRing.setPosition(x + RELOAD_RING.dx, y + RELOAD_RING.dy).setDepth(this.me.sprite.depth + 1);
    if (step === this.reloadStep) return;
    this.reloadStep = step;
    const g = this.reloadRing.clear();
    g.fillStyle(0x1f1a24, 0.75).fillCircle(0, 0, RELOAD_RING.radius + 1);
    g.fillStyle(0xffd84d, 1).slice(0, 0, RELOAD_RING.radius, -Math.PI / 2, -Math.PI / 2 + (step / RELOAD_RING.steps) * Math.PI * 2, false).fillPath();
  }

  private attack(arm: Arm) {
    if (this.time.now < this.nextShotAt) return;
    const weapon = arm.kind;
    const found = this.magOf(arm);
    if (found) {
      if (found.mag.reloadUntil) return;
      if (found.mag.left <= 0) {
        this.reload(arm);
        return;
      }
    }
    this.stopWork();
    this.nextShotAt = this.time.now + this.economy.cooldownOf(weapon);

    const { x, y } = this.me.position();
    const fromX = x + 0.5;
    const fromY = y + 0.5;
    // 총알이 떠서 날아가므로 그 높이만큼 내려서 마우스가 가리킨 곳을 지나가게 한다.
    const w = this.pointerWorld();
    const aim = worldToGrid(w.x, w.y + BULLET_HEIGHT);
    const dx = aim.gx - fromX;
    const dy = aim.gy - fromY;
    if (dx === 0 && dy === 0) return;

    this.me.face(Math.sign(dx), Math.sign(dy));
    const myId = this.session.profile.id;
    const { melee, auto, range } = WEAPONS[weapon];
    const level = arm.gear?.level ?? 0;
    const gearId = arm.gear?.id ?? null;
    const shot = ++this.shotSeq;
    if (found) {
      found.mag.left--;
      // 탄이 0이 되면 저절로 재장전한다(weapons.md 6장 이펙트 2).
      if (found.mag.left <= 0) this.reload(arm);
      else this.showAmmo();
    }

    // 몬스터를 맞히면 피해를 몬스터 쪽(src/game/monsters.ts)에 넘기고, 사람을 맞히면 서버가 판정한다.
    // 산탄은 한 번 쏜 것에서 같은 사람에게 맞은 알 수를 한 번에 보낸다(서버가 사격 번호로 한 발로 센다).
    const hit = (target: string, pellets = 1) => {
      if (isMonsterTarget(target)) {
        for (let i = 0; i < pellets; i++) this.monsters?.damage(target, this.economy.monsterDamage(weapon, level));
      } else void this.session.hitPlayer(target, weapon, gearId, shot, pellets);
    };
    if (melee) {
      const target = this.slash(myId, this.me, weapon, { x: fromX, y: fromY }, { x: aim.gx, y: aim.gy });
      if (target) hit(target);
    } else {
      const pellets = this.economy.weapon(weapon)?.pellets ?? 1;
      if (pellets > 1) {
        const counts = new Map<string, number>();
        let left = pellets;
        const done = () => {
          if (--left > 0) return;
          for (const [target, count] of counts) hit(target, count);
        };
        for (const p of this.fan(weapon, pellets, fromX, fromY, aim.gx, aim.gy)) {
          this.bullets.fire(myId, fromX, fromY, p.x, p.y, range, (target) => counts.set(target, (counts.get(target) ?? 0) + 1), done);
        }
      } else {
        const shotAt = this.scatter(weapon, fromX, fromY, aim.gx, aim.gy);
        this.bullets.fire(myId, fromX, fromY, shotAt.x, shotAt.y, range, hit);
      }
    }

    if (!auto || this.shotsFired % BURST === 0) this.session.sendShot(weapon, level, fromX, fromY, aim.gx, aim.gy);
    this.shotsFired++;
  }

  /** 산탄 알들의 목표: 조준한 방향을 가운데로 부채꼴에 고르게 나누고 조금씩 틀어 준다. */
  private fan(weapon: WeaponId, pellets: number, fromX: number, fromY: number, toX: number, toY: number) {
    const width = WEAPONS[weapon].fan ?? 0;
    const center = Math.atan2(toY - fromY, toX - fromX);
    const length = Math.hypot(toX - fromX, toY - fromY);
    return Array.from({ length: pellets }, (_, i) => {
      const angle = center + (pellets > 1 ? (i / (pellets - 1) - 0.5) * width : 0) + (Math.random() - 0.5) * PELLET_JITTER;
      return { x: fromX + Math.cos(angle) * length, y: fromY + Math.sin(angle) * length };
    });
  }

  /** 앞쪽을 베고 맞은 사람의 id를 돌려준다. 다른 플레이어의 공격도 같은 방법으로 보여 준다. */
  private slash(ownerId: string, avatar: Avatar, weapon: WeaponId, from: Tile, to: Tile, holdMs?: number) {
    const start = gridToWorld(from.x, from.y);
    const end = gridToWorld(to.x, to.y);
    avatar.swing(Math.atan2(end.y - start.y, end.x - start.x), holdMs);

    const targets = this.bulletTargets().filter(({ id }) => id !== ownerId);
    const isSolid = (x: number, y: number) => this.world.blocksShots(x, y);
    const { range, arc = 45 } = WEAPONS[weapon];
    const target = meleeTarget(from, to, range, arc, targets, isSolid);
    if (!target) return null;
    this.playHit(target.id, target.x - from.x, target.y - from.y);
    return target.id;
  }

  /** 조준한 방향을 무기의 흩어짐만큼 틀어 준다. */
  private scatter(weapon: WeaponId, fromX: number, fromY: number, toX: number, toY: number) {
    const { spread = 0 } = WEAPONS[weapon];
    const angle = Math.atan2(toY - fromY, toX - fromX) + (Math.random() - 0.5) * spread;
    const length = Math.hypot(toX - fromX, toY - fromY);
    return { x: fromX + Math.cos(angle) * length, y: fromY + Math.sin(angle) * length };
  }

  /** 공격이 날아온 방향으로 맞은 사람을 밀어낸다. 체력은 서버가 따로 처리한다. */
  private playHit(id: string, dx: number, dy: number) {
    if (isMonsterTarget(id)) {
      this.monsters?.flash(id);
      return;
    }
    const avatar = id === this.session.profile.id ? this.me : this.others.get(id);
    if (!avatar) return;
    const screenX = (dx - dy) * (TILE_W / 2);
    const screenY = (dx + dy) * (TILE_H / 2);
    const length = Math.hypot(screenX, screenY);
    if (length > 0) avatar.hitBack(screenX / length, screenY / length);
  }

  private bulletTargets(): BulletTarget[] {
    // 던전에서는 몬스터만 맞는다. 같이 사냥하는 사람끼리 총알이 맞지 않게 한다(에이전트가 정함).
    if (this.monsters) return this.monsters.targets();
    const targets: BulletTarget[] = [];
    const add = (id: string, avatar: Avatar) => {
      if (avatar.isDown) return;
      const { x, y } = avatar.position();
      targets.push({ id, x: x + 0.5, y: y + 0.5 });
    };
    add(this.session.profile.id, this.me);
    for (const [id, avatar] of this.others) add(id, avatar);
    return targets;
  }

  /** 체력이 0이 되면 잠시 뒤 포탈 앞에서 다시 시작한다. */
  private goDown() {
    if (this.down) return;
    this.down = true;
    this.stopWork();
    this.clearRoute();
    this.hud.showDown(true);
    this.time.delayedCall(RESPAWN_MS, () => void this.respawn());
  }

  private async respawn() {
    if (!(await this.session.respawn())) {
      this.time.delayedCall(RESPAWN_RETRY_MS, () => void this.respawn());
      return;
    }
    const tile = respawnTile(this.mapId);
    this.me.teleport(tile);
    this.setMyHp(this.me.maxHp);
    this.down = false;
    this.hud.showDown(false);
    this.drawRange();
    this.session.sendMove(tile.x, tile.y, 0);
    this.session.saveLater(tile);
  }

  private setMyHp(hp: number) {
    this.me.setHp(hp);
    this.hud.setHp(hp, this.me.maxHp);
    this.tags.setHp(this.session.profile.id, hp, this.me.maxHp);
    this.session.refreshPresence();
    if (hp <= 0) this.goDown();
  }

  /** 칸 (x, y)에 쌓인 블록 더미가 화면의 (wx, wy)를 덮는지 */
  private hitsCube(x: number, y: number, wx: number, wy: number) {
    const c = tileCenter(x, y);
    const across = Math.abs(wx - c.x) / (TILE_W / 2);
    if (across > 1) return false;
    const half = (1 - across) * (TILE_H / 2);
    const dy = wy - c.y;
    return dy <= half && dy >= -half - BLOCK_HEIGHT * Math.max(1, this.world.heightAt(x, y));
  }

  private updateHover() {
    // 휴대폰에는 마우스 커서가 없으므로 설치 미리보기를 띄우지 않는다.
    if (this.hud.isOpen || this.input.activePointer.wasTouch) {
      this.hoveredBlock = this.hoveredGround = null;
      this.ghost.setVisible(false);
      this.marker.clear();
      this.groundUi.setTip(null);
      return;
    }

    const w = this.pointerWorld();
    const g = worldToGrid(w.x, w.y);
    const x = Math.floor(g.gx);
    const y = Math.floor(g.gy);

    // 블록은 뒤쪽 칸을 가리므로 화면 앞쪽 칸부터 확인한다. 높이 쌓은 블록은 몇 칸 뒤까지 가린다.
    const candidates: [number, number][] = [];
    for (let k = MAX_STACK; k >= 0; k--) {
      candidates.push([x + k + 1, y + k + 1], [x + k + 1, y + k], [x + k, y + k + 1], [x + k, y + k]);
    }
    const hit = candidates.find(([cx, cy]) => this.world.heightAt(cx, cy) && this.hitsCube(cx, cy, w.x, w.y));
    // 큰 가구가 덮은 칸을 가리키면 그 가구를 가리킨 것으로 본다(우클릭으로 회수).
    const owner = hit ? undefined : this.world.ownerOf(x, y);
    this.hoveredBlock = hit ? { x: hit[0], y: hit[1] } : (owner ?? null);
    this.hoveredGround = !hit && !owner && this.world.inBounds(x, y) ? { x, y } : null;
    this.drawHover();
    this.updateGoldTip();
  }

  /** 땅의 골드에 마우스를 올리면 커서 옆에 액수를 띄운다(2026-11-13 사용자 요청 "호버 시 100G처럼"). */
  private updateGoldTip() {
    const tile = this.canAct ? this.hoveredGround : null;
    const gold = tile ? this.drops.at(tile.x, tile.y).find((item) => item.amount !== null) : undefined;
    const pointer = this.input.activePointer;
    const text = gold ? goldText(gold.amount!) : tile ? this.plotTip(tile.x, tile.y) : null;
    this.groundUi.setTip(text, pointer.x, pointer.y);
  }

  /** 발밑에 주울 것이 있으면 "F키로 줍기" 안내를 띄운다. 여럿이면 맨 나중에 놓인 것부터 줍는다. 띄웠으면 true */
  private updatePickupHint() {
    const items = this.traveling || this.down || this.me.moving ? [] : this.drops.at(this.me.tile.x, this.me.tile.y);
    this.updateMemoPeek(items);
    const [top] = items;
    if (!top) {
      this.groundUi.setHint(null);
      return false;
    }
    const what = top.amount === null ? '메모' : goldText(top.amount);
    this.groundUi.setHint(items.length > 1 ? `${what} 외 ${items.length - 1}개` : what);
    return true;
  }

  /**
   * 작물 곁 안내 창과 F가 다룰 칸(docs/balance/farm.md 9.3): (PC) 마우스로 가리킨 손 닿는 칸, 발밑 칸, 바라보는 앞 칸 차례로 보고
   * 작물이 있거나(누구 것이든) 내 빈 땅인 첫 칸. 없으면 null
   */
  private farmTarget(): Plot | null {
    const farm = this.farm;
    if (!farm) return null;
    const myId = this.session.profile.id;
    const hovered = this.hoveredGround ?? this.hoveredBlock;
    if (hovered && inBuildReach(this.me.tile, hovered)) {
      const plot = farm.at(hovered.x, hovered.y);
      if (showsCard(plot, myId)) return plot;
    }
    const { x, y } = this.me.tile;
    const under = farm.at(x, y);
    if (showsCard(under, myId)) return under;
    const ahead = farm.at(x + this.lastDir.dx, y + this.lastDir.dy);
    return showsCard(ahead, myId) ? ahead : null;
  }

  /** 안내 창 글을 만들 칸 상태. seedId는 단축키 칸에서 고른 씨앗(안 골랐으면 null) */
  private farmSituation(plot: Plot, now = Date.now()) {
    const held = this.inventory.selectedStack?.id ?? null;
    const seedId = held && isSeed(held) ? held : null;
    const situation: PlotSituation = {
      plot,
      crop: plot.crop ? this.farm?.crop(plot.crop) : undefined,
      myId: this.session.profile.id,
      blocked: !!this.world.heightAt(plot.x, plot.y),
      seed: seedId ? { name: itemName(seedId), count: this.economy.seedCount(cropOfSeed(seedId)) } : null,
      now,
    };
    return { situation, seedId };
  }

  /**
   * 작물 곁 안내 창. 서 있을 때만 띄운다(걷는 중, 맵 이동 중, 쓰러짐, 창이 열림, 줍기 안내가 떴으면 숨김).
   * 대상 칸의 Plot 참조, 든 칸과 씨앗 수, 블록 유무, 남은 시간 표시 값이 지난번과 같으면 글을 만들지 않는다.
   */
  private updateFarmPanel(picking: boolean) {
    const plot = !this.farm || picking || this.me.moving || !this.canAct ? null : this.farmTarget();
    if (!plot) {
      this.hideFarmPanel();
      return;
    }
    const held = this.inventory.selectedStack?.id ?? null;
    const seeds = held && isSeed(held) ? this.economy.seedCount(cropOfSeed(held)) : -1;
    const blocked = !!this.world.heightAt(plot.x, plot.y);
    const crop = plot.crop ? this.farm!.crop(plot.crop) : undefined;
    const now = Date.now();
    const tick = crop ? leftTick(ripeAt(plot, crop) - now) : 0;
    const last = this.farmCard;
    if (last.plot === plot && last.held === held && last.seeds === seeds && last.blocked === blocked && last.tick === tick) return;
    last.plot = plot;
    last.held = held;
    last.seeds = seeds;
    last.blocked = blocked;
    last.tick = tick;
    const { situation } = this.farmSituation(plot, now);
    const action = plotAction(situation);
    this.groundUi.farm.set({ lines: plotCardLines(situation), action: action && FARM_DO_LABEL[action] });
  }

  private hideFarmPanel() {
    this.farmCard.plot = null;
    this.groundUi.farm.set(null);
  }

  /**
   * 땅의 메모 위에 서 있으면 맨 나중에 놓인 메모의 쓴 사람과 글을 캐릭터 위에 띄우고, 벗어나면 숨긴다(2026-11-18 사용자 요청).
   * items는 발밑의 것(서 있을 때만, 그리지 않는 칸은 빔). 서 있는 칸이나 그 메모가 바뀔 때만 일하고, 글은 메모마다 한 번 서버에서 받아 다시 쓴다.
   */
  private updateMemoPeek(items: readonly GroundItem[]) {
    const memo = items.find((item) => item.amount === null);
    const id = memo?.id ?? 0;
    const { x, y } = this.me.tile;
    const peek = this.memoPeek;
    if (peek.id === id && (!id || (peek.x === x && peek.y === y))) return;
    peek.id = id;
    peek.x = x;
    peek.y = y;
    if (!memo) {
      this.groundUi.setPeek(null);
      return;
    }
    const known = this.memoTexts.get(id);
    this.groundUi.setPeek(known ?? null);
    if (known || this.memoReading.has(id)) return;
    this.memoReading.add(id);
    this.memoReads++;
    void this.session.readMemo(id).then((text) => {
      this.memoReading.delete(id);
      // 서버가 거절했으면(이미 주워 갔거나 다른 칸) 남겨 두지 않아 다음에 그 칸에 서면 다시 묻는다.
      if (!text) return;
      this.memoTexts.set(id, text);
      if (this.memoPeek.id === id) this.groundUi.setPeek(text);
    });
  }

  /** 발밑에 주울 것이 있으면 하나 줍는다. 주울 것이 있었으면 true(F로 일을 시작하지 않는다). */
  private tryPickUp() {
    if (this.me.moving) return false;
    const [item] = this.drops.at(this.me.tile.x, this.me.tile.y);
    if (!item) return false;
    if (!this.picking) void this.pickUp(item);
    return true;
  }

  private async pickUp(item: GroundItem) {
    this.picking = true;
    const result = await this.session.pickUp(item.id);
    this.picking = false;
    if (!result.ok) {
      if (result.reason === 'gone') {
        this.drops.remove(item.id);
        this.hud.toast('한발 늦었습니다', '누가 먼저 주워 갔습니다');
      } else {
        this.hud.toast('줍지 못했습니다', '잠시 뒤 다시 해 보세요');
      }
      return;
    }
    this.drops.remove(item.id);
    if (result.kind === 'gold') {
      this.economy.setGold(result.gold);
      this.hud.toast(`${goldText(result.amount)} 줍줍`, '주인은 지금쯤 땅을 치고 있습니다', true);
      return;
    }
    this.groundUi.addHeld(result.memo);
    this.groundUi.showMemo(result.memo, true);
  }

  /** 0번 메모장: 쪽지를 써서 지금 선 칸에 놓는다(2026-11-13 사용자 요청). */
  private writeMemo() {
    if (!this.canAct) return;
    this.clearRoute();
    this.groundUi.openWriter(async (body) => {
      if (this.traveling || this.down) return '지금은 놓을 수 없습니다.';
      const { x, y } = this.me.tile;
      const result = await this.session.dropMemo(body, x, y);
      if (!result.ok) return dropFailText(result.reason);
      this.drops.add(result.item);
      this.hud.toast('쪽지를 놓았습니다', byInput('누군가 F로 주워 읽을 겁니다', '누군가 주워 읽을 겁니다'));
      return null;
    });
  }

  /** 인벤토리의 '버리기': 골드를 지금 선 칸에 떨어뜨린다. 실패하면 까닭 문구 */
  async dropGold(amount: number): Promise<string | null> {
    if (this.traveling || this.down) return '지금은 버릴 수 없습니다.';
    const { x, y } = this.me.tile;
    const result = await this.session.dropGold(amount, x, y);
    if (!result.ok) return dropFailText(result.reason);
    this.economy.setGold(result.gold);
    this.drops.add(result.item);
    this.hud.toast(`${goldText(amount)}를 버렸습니다`, '발밑에서 반짝입니다. 먼저 줍는 사람이 임자');
    return null;
  }

  /** 주운 메모를 지금 선 칸에 다시 놓는다. 실패하면 까닭 문구 */
  private async placeHeldMemo(memo: HeldMemo): Promise<string | null> {
    if (this.traveling || this.down) return '지금은 놓을 수 없습니다.';
    const { x, y } = this.me.tile;
    const result = await this.session.placeMemo(memo.id, x, y);
    if (!result.ok) return dropFailText(result.reason);
    this.groundUi.removeHeld(memo.id);
    this.drops.add(result.item);
    this.hud.toast('쪽지를 내려놓았습니다', `${memo.author}의 메모가 다시 땅에서 반짝입니다`);
    return null;
  }

  private canPlaceAt(target: Tile, id: BlockId) {
    if (!this.world.canPlace(target, this.me.tile, id)) return false;
    const tiles = this.world.placeTiles(target, id);
    for (const { tile } of this.others.values()) {
      if (tiles.some(({ x, y }) => tile.x === x && tile.y === y)) return false;
    }
    return true;
  }

  private drawHover() {
    this.marker.clear();
    this.ghost.setVisible(false);

    const stack = this.inventory.selectedStack;
    if (this.hoveredBlock) {
      const { x, y } = this.hoveredBlock;
      const height = this.world.heightAt(x, y);
      const ok = this.reachesBlock(this.hoveredBlock);
      const top = this.world.topAt(x, y);
      const area = top && height === 1 ? footprintOf(top.id, x, y) : { x0: x, y0: y, a: 1, b: 1 };
      keepDepth(this.marker, depthOf(area.x0 + area.a - 1, area.y0 + area.b - 1) + 2);
      this.strokeTile(area.x0, area.y0, ok ? 0xffffff : 0xff6b5e, -BLOCK_HEIGHT * height, area.a, area.b);
      // 블록을 들고 벽 블록을 가리키면 그 위에 쌓일 자리를 미리 보여 준다.
      if (stack && isBlockItem(stack.id) && this.world.canStack(this.hoveredBlock, this.me.tile, stack.id)) {
        this.dressBlock(this.ghost, stack.id, x, y, height).setAlpha(0.7).setTint(0xffffff).setVisible(true);
      }
      return;
    }

    if (!this.hoveredGround) return;
    const id = stack && isBlockItem(stack.id) ? stack.id : undefined;
    if (stack && !id) return;
    const { x, y } = this.hoveredGround;
    const ok = id !== undefined && this.canPlaceAt(this.hoveredGround, id);
    keepDepth(this.marker, DEPTH_OVERLAY);
    // 큰 가구는 차지할 칸 전체를 그린다.
    const area = id !== undefined ? footprintOf(id, x, y) : { x0: x, y0: y, a: 1, b: 1 };
    this.strokeTile(area.x0, area.y0, ok ? 0xffffff : 0xff6b5e, 0, area.a, area.b);

    if (id !== undefined) {
      this.dressBlock(this.ghost, id, x, y)
        .setAlpha(ok ? 0.7 : 0.35)
        .setTint(ok ? 0xffffff : 0xff6b5e)
        .setVisible(true);
    }
  }

  /** 칸 (x, y)부터 x 방향 a칸, y 방향 b칸의 테두리를 긋는다. */
  private strokeTile(x: number, y: number, color: number, lift: number, a = 1, b = 1) {
    const pts = [gridToWorld(x, y), gridToWorld(x + a, y), gridToWorld(x + a, y + b), gridToWorld(x, y + b)];
    this.marker.lineStyle(1, color, 0.95).beginPath();
    this.marker.moveTo(pts[0].x, pts[0].y + lift);
    for (const p of pts.slice(1)) this.marker.lineTo(p.x, p.y + lift);
    this.marker.closePath().strokePath();
  }

  /**
   * 블록을 놓을 수 있는 범위: 둘레 8칸의 마름모와, 그 네 변의 가운데 바깥에 붙은 한 칸씩.
   * 칸마다 옅게 칠하고, 테두리는 범위 밖 칸과 맞닿은 변에만 긋는다. 그래야 마름모와 더 닿는 칸 사이에 금이 생기지 않는다.
   */
  private drawRange() {
    const size = this.world.map.size;
    const me = this.me.tile;
    const far = BUILD_RANGE;
    const reach = new Set<string>();
    for (let dy = -far; dy <= far; dy++) {
      for (let dx = -far; dx <= far; dx++) {
        const tile = { x: me.x + dx, y: me.y + dy };
        if (tile.x < 0 || tile.y < 0 || tile.x >= size || tile.y >= size) continue;
        if (inBuildReach(me, tile)) reach.add(`${tile.x},${tile.y}`);
      }
    }
    const inside = (x: number, y: number) => reach.has(`${x},${y}`);

    this.range.clear();
    this.range.fillStyle(0xffffff, 0.05).lineStyle(1, 0xffffff, 0.5);
    for (const key of reach) {
      const [x, y] = key.split(',').map(Number);
      const corners = [gridToWorld(x, y), gridToWorld(x + 1, y), gridToWorld(x + 1, y + 1), gridToWorld(x, y + 1)];
      this.range.beginPath();
      this.range.moveTo(corners[0].x, corners[0].y);
      for (const p of corners.slice(1)) this.range.lineTo(p.x, p.y);
      this.range.closePath().fillPath();
      // 변마다 바깥 이웃: 위쪽 변은 (x, y-1), 오른쪽은 (x+1, y), 아래쪽은 (x, y+1), 왼쪽은 (x-1, y)
      const neighbors = [
        [x, y - 1],
        [x + 1, y],
        [x, y + 1],
        [x - 1, y],
      ];
      neighbors.forEach(([nx, ny], i) => {
        if (inside(nx, ny)) return;
        const a = corners[i];
        const b = corners[(i + 1) % 4];
        this.range.lineBetween(a.x, a.y, b.x, b.y);
      });
    }
  }


  /** 지금 가리키는 곳에 놓을 자리. 벽 블록을 가리키면 그 위, 빈 바닥을 가리키면 바닥이다. */
  private placementSpot(id: BlockId): (Tile & { z: number }) | null {
    if (this.hoveredBlock) {
      const { x, y } = this.hoveredBlock;
      return this.world.canStack(this.hoveredBlock, this.me.tile, id) ? { x, y, z: this.world.heightAt(x, y) } : null;
    }
    return this.hoveredGround && this.canPlaceAt(this.hoveredGround, id) ? { ...this.hoveredGround, z: 0 } : null;
  }

  private placeBlock() {
    const stack = this.inventory.selectedStack;
    if (!stack || !isBlockItem(stack.id)) return;
    const id = stack.id;
    const spot = this.placementSpot(id);
    if (!spot) {
      const ground = this.hoveredGround;
      if (this.farm && ground && !this.hoveredBlock && isGate(ground.x, ground.y) && inBuildReach(this.me.tile, ground)) {
        this.notice('입구 칸입니다', '입구 칸에는 블록을 놓을 수 없습니다.');
      }
      return;
    }
    const { x, y, z } = spot;

    // 블록은 무제한이라 가방에서 빼지 않는다. 먼저 화면에 놓고, 다른 사람이 먼저 놓아 실패하면 되돌린다.
    const { mapId } = this;
    this.spawnBlock(spot, z, id);
    const hidden = this.inHideoutHere(x, y);
    if (hidden) this.hideoutBlocks.set(`${x},${y},${z}`, { x, y, z, id });
    void this.session.placeBlock(x, y, z, id).then((placed) => {
      if (placed || mapId !== this.mapId) return;
      if (hidden) this.hideoutBlocks.delete(`${x},${y},${z}`);
      this.removeBlockAt(x, y, z);
      void this.session.syncBlocks();
    });
  }

  /** 가리킨 칸의 맨 위 블록을 회수한다. */
  /** 칸 (x, y)의 블록에 손이 닿는지. 큰 가구는 차지한 칸 중 하나에만 닿으면 된다. */
  private reachesBlock(target: Tile) {
    const top = this.world.topAt(target.x, target.y);
    const { x0, y0, a, b } = top && top.z === 0 ? footprintOf(top.id, target.x, target.y) : { x0: target.x, y0: target.y, a: 1, b: 1 };
    for (let y = y0; y < y0 + b; y++) {
      for (let x = x0; x < x0 + a; x++) if (inBuildReach(this.me.tile, { x, y })) return true;
    }
    return false;
  }

  private async collectBlock() {
    const target = this.hoveredBlock;
    if (!target || !this.reachesBlock(target)) return;
    if (this.farm && this.farm.at(target.x, target.y)?.owner !== this.session.profile.id) {
      this.notice('남의 땅입니다', '농장 블록은 땅 주인만 회수합니다.');
      return;
    }
    const top = this.world.topAt(target.x, target.y);
    if (!top) return;

    // 블록은 무제한이라 회수해도 가방은 그대로다. 놓인 것만 치운다.
    const { mapId } = this;
    const removed = await this.session.removeBlock(target.x, target.y, top.z);
    if (!removed) return;
    if (mapId !== this.mapId) return;
    this.hideoutBlocks.delete(`${target.x},${target.y},${top.z}`);
    this.removeBlockAt(target.x, target.y, top.z);
  }

  private spawnBlock({ x, y }: Tile, z: number, id: BlockId) {
    this.world.place(x, y, z, id);
    const image = this.dressBlock(this.add.image(0, 0, 'tiles'), id, x, y, z);
    this.blockImages.set(`${x},${y},${z}`, image);
    this.blockChunks.add(image, x, y);
    this.glows.addBlock(id, x, y, z, image.depth);
    // 포탈이나 안내판을 덮으면 늘 반투명하게 그린다(2026-11-16 사용자 "가려지면 안 된다").
    if (this.keepClear.covers(image)) {
      image.setAlpha(KEEP_CLEAR_ALPHA);
      return;
    }
    const art = blockArt(id);
    // 나무, 가구, 높이 쌓은 상자는 뒤에 선 캐릭터를 가리므로 반투명하게 할 대상에 넣는다.
    if (art.kind === 'sprite' || art.kind === 'cube' || art.kind === 'furniture') this.covers.add([image]);
  }

  /**
   * 블록 그림을 칸 (x, y)의 높이 z에 맞춘다.
   * 위에 쌓인 블록은 한 층마다 BLOCK_HEIGHT만큼 올려 그리고, 같은 칸 안에서는 위층을 나중에 그린다.
   */
  private dressBlock(image: Phaser.GameObjects.Image, id: BlockId, x: number, y: number, z = 0) {
    const art = blockArt(id);
    const lift = z * BLOCK_HEIGHT;
    const depth = depthOf(x, y) + z * STACK_DEPTH;
    if (art.kind === 'cube') {
      const c = tileCenter(x, y);
      return keepDepth(image.setTexture(`block-${id}`).setOrigin(CUBE_ORIGIN_X, CUBE_ORIGIN_Y).setPosition(c.x, c.y - lift), depth);
    }
    if (art.kind === 'furniture') {
      this.furnitureTexture();
      const [, , w, h, ax, ay] = art.frame;
      // 그림의 바닥 가운데를 차지하는 칸들의 가운데에 맞추고, 가장 앞 칸의 깊이로 그린다.
      const { x0, y0, a, b } = footprintOf(id, x, y);
      const c = gridToWorld(x0 + a / 2, y0 + b / 2);
      const front = depthOf(x0 + a - 1, y0 + b - 1) + z * STACK_DEPTH;
      // 카펫, 담요처럼 지나갈 수 있는 가구는 바닥에 깔려 캐릭터가 위로 지나간다.
      return keepDepth(
        image
          .setTexture('furniture', id)
          .setOrigin(ax / w, ay / h)
          .setPosition(c.x, c.y - lift),
        BLOCKS[id].solid || z > 0 ? front : DEPTH_DECAL,
      );
    }
    if (art.kind === 'sprite') {
      this.spriteTexture(art.sprite);
      const source = sprite(art.sprite);
      const foot = groundPoint(art.sprite);
      const c = tileCenter(x, y);
      // 같은 그림을 맵 소품(showBuilding)으로도 쓰면 세로 조각 프레임이 생겨 Phaser가 첫 조각을 기본 프레임으로 삼는다.
      // 블록은 늘 그림 전체(__BASE)를 쓴다(2026-11-16, 가로등이 기둥만 보이던 것).
      return keepDepth(
        image
          .setTexture(art.sprite, '__BASE')
          .setOrigin(foot.x / source.width, foot.y / source.height)
          .setPosition(c.x, c.y - lift),
        depth,
      );
    }
    const corner = gridToWorld(x, y);
    return keepDepth(
      image
        .setTexture('tiles', blockTile(art.tiles, x, y))
        .setOrigin(0.5, 0)
        .setPosition(corner.x, corner.y - this.world.map.floorTop - DECOR_LIFT - lift),
      BLOCKS[id].solid || z > 0 ? depth : DEPTH_DECAL,
    );
  }

  private removeBlockAt(x: number, y: number, z: number) {
    this.world.remove(x, y, z);
    const key = `${x},${y},${z}`;
    const image = this.blockImages.get(key);
    if (image) {
      this.covers.remove(image);
      this.blockChunks.remove(image, x, y);
      image.destroy();
    }
    this.blockImages.delete(key);
    this.glows.removeBlock(x, y, z);
  }

  currentTile() {
    return this.me.tile;
  }

  currentHp() {
    return this.me.hp;
  }

  currentMaxHp() {
    return this.me.maxHp;
  }

  currentWork() {
    return this.workSpot;
  }

  /** 모험 맵에서 판이 있으면 판 레벨(글자), 아니면 null(다른 사람 이름표와 정보 칸에 쓴다) */
  currentRun(): string | null {
    const view = this.adventure.view;
    return isAdventure(this.mapId) && view?.inRun ? view.level : null;
  }

  currentLevel() {
    return this.level;
  }

  onMove({ id, nickname, x, y, ms, hp, maxHp, level, motion, skin, work, run }: PlayerMove) {
    let avatar = this.others.get(id);
    // 모험 맵 이름표의 판 레벨: 바뀌었을 때만 고친다.
    const runChanged = (this.otherRuns.get(id) ?? null) !== run;
    this.otherRuns.set(id, run);
    if (!avatar) {
      avatar = new Avatar(this, id, { x, y }, hp, skin, maxHp);
      this.others.set(id, avatar);
      this.tags.add(id, nickname);
      this.tags.setHp(id, hp, maxHp);
      this.showLevel(id, level);
      this.showRemoteWork(id, avatar, work);
      return;
    }
    if (avatar.maxHp !== maxHp) {
      avatar.maxHp = maxHp;
      this.tags.setHp(id, avatar.hp, maxHp);
    }
    // 닉네임 변경권으로 이름을 바꿨으면 이름표도 바꾼다.
    this.tags.setName(id, nickname);
    if (runChanged && isAdventure(this.mapId)) this.showLevel(id, level);
    this.showRemoteWork(id, avatar, work);
    const { tile } = avatar;
    const reachable = inReach(tile, { x, y }, JUMP_TILES + 1);
    if (motion === 'jump' && reachable) {
      avatar.jumpTo({ x, y }, ms);
      return;
    }
    if (tile.x === x && tile.y === y) return;
    if (!reachable) avatar.teleport({ x, y });
    else if (motion === 'run') avatar.runTo({ x, y }, ms);
    else avatar.stepTo({ x, y }, ms);
  }

  onShot({ id, weapon, fromX, fromY, toX, toY }: PlayerShot) {
    const avatar = this.others.get(id);
    if (!avatar) return;
    avatar.setWeapon(weapon);
    const { melee, auto, range } = WEAPONS[weapon];
    if (melee) {
      this.slash(id, avatar, weapon, { x: fromX, y: fromY }, { x: toX, y: toY }, REMOTE_AIM_MS);
      return;
    }

    const from = gridToWorld(fromX, fromY);
    const to = gridToWorld(toX, toY);
    avatar.aim(Math.atan2(to.y - from.y, to.x - from.x), REMOTE_AIM_MS);

    const pellets = this.economy.weapon(weapon)?.pellets ?? 1;
    if (pellets > 1) {
      for (const p of this.fan(weapon, pellets, fromX, fromY, toX, toY)) this.bullets.fire(id, fromX, fromY, p.x, p.y, range);
      return;
    }
    const cooldown = this.economy.cooldownOf(weapon);
    for (let i = 0; i < (auto ? BURST : 1); i++) {
      this.time.delayedCall(i * cooldown, () => {
        if (this.others.get(id) !== avatar) return;
        const shot = this.scatter(weapon, fromX, fromY, toX, toY);
        this.bullets.fire(id, fromX, fromY, shot.x, shot.y, range);
      });
    }
  }

  onHp(id: string, hp: number, max: number | null) {
    const mine = id === this.session.profile.id;
    const avatar = mine ? this.me : this.others.get(id);
    if (!avatar) return;
    if (hp < avatar.hp) this.tags.float(id, `-${avatar.hp - hp}`, 'damage');
    if (max !== null) avatar.maxHp = max;
    if (mine) {
      this.setMyHp(hp);
      return;
    }
    avatar.setHp(hp);
    this.tags.setHp(id, hp, avatar.maxHp);
  }

  /** 다른 사람의 작업 동작을 알림에 맞춘다: 일하는 칸이 생기면 동작을 시작하고, 없어지면 멈춘다. */
  private showRemoteWork(id: string, avatar: Avatar, work: Tile | null) {
    const current = this.workFx.spotOf(id);
    if (work && current && work.x === current.x && work.y === current.y) return;
    this.workFx.stop(id);
    if (!work) return;
    avatar.face(Math.sign(work.x - avatar.tile.x), Math.sign(work.y - avatar.tile.y));
    this.startWorkFx(id, avatar, work);
  }

  /** 접속 명단으로 아직 안 보이는 사람을 그린다. 이미 보이는 사람은 이동 알림이 더 새로우므로 그대로 둔다. */
  onPresence(move: PlayerMove) {
    if (!this.others.has(move.id)) this.onMove(move);
  }

  onHarvest(id: string, rare: boolean) {
    this.workFx.finish(id, rare);
  }

  /** 같은 모험 필드 친구가 전투 중이면 이름표 위에 작은 칼(기획 11장, 시안 adventure-ui.md 5장) */
  onFight(id: string, on: boolean, run: string | null) {
    if (!this.others.has(id)) return;
    this.tags.setFighting(id, on);
    // 전투가 끝나면 바뀐 판 레벨이 같이 온다(이름표).
    if (!on && (this.otherRuns.get(id) ?? null) !== run) {
      this.otherRuns.set(id, run);
      if (isAdventure(this.mapId)) this.showLevel(id, 0n);
    }
  }

  onNotice(notice: Notice) {
    this.notices.show(notice);
    this.chat.system(noticeText(notice));
    // 누가 쓰러지면 악업이 바뀌므로 현상범 명단을 다시 읽는다.
    if (notice.kind === 'kill') void this.wanted.refresh();
    if (notice.kind === 'rename') this.tags.setName(notice.id, notice.to);
  }

  /** 현상범이 잡혔다. 내가 잡았거나 잡혔으면 골드와 자원을 서버와 같게 맞추고 알려 준다. */
  onBounty({ killer, victim, gold, items }: Bounty) {
    const me = this.session.profile.id;
    if (killer !== me && victim !== me) return;
    const count = items.reduce((sum, { count }) => sum + count, 0);
    const what = [gold > 0n ? goldText(gold) : '', count > 0 ? `자원 ${count.toLocaleString()}개` : '']
      .filter(Boolean)
      .join('와 ');
    if (killer === me) {
      for (const { item, count } of items) this.economy.add(item, count);
      this.economy.setGold(this.economy.gold + gold);
      this.hud.toast('현상금 획득!', what ? `${what}를 받았습니다` : '현상범 주머니가 텅 비어 있었습니다', true);
    } else {
      for (const { item, count } of items) this.economy.take(item, count);
      this.economy.setGold(this.economy.gold > gold ? this.economy.gold - gold : 0n);
      this.hud.toast('현상금을 빼앗겼습니다', what ? `${what}를 잃었습니다` : '다행히 빼앗길 것이 없었습니다');
    }
  }

  onDodge(id: string) {
    if (id === this.session.profile.id || this.others.has(id)) this.tags.float(id, '회피!', 'dodge');
  }

  onLevel(id: string, level: bigint, exp: number) {
    if (id === this.session.profile.id) this.gainExp(level, exp);
    else if (this.others.has(id) && !isAdventure(this.mapId)) this.showLevel(id, level);
  }

  onRoster(ids: Set<string>) {
    this.monsters?.setRoster(ids);
    for (const [id, avatar] of this.others) {
      if (ids.has(id)) continue;
      this.workFx.stop(id);
      avatar.destroy();
      this.others.delete(id);
      this.tags.remove(id);
    }
  }

  onChat(message: ChatMessage) {
    this.chat.show(message);
    // 말풍선은 같은 맵에 보이는 사람에게만 뜬다(다른 맵에서 온 전체 채팅은 기록에만 남음).
    this.tags.say(message.id, message.text);
  }

  onGroundLoaded(items: GroundItem[]) {
    this.drops.set(items);
  }

  onGroundAdded(item: GroundItem) {
    this.drops.add(item);
  }

  onGroundRemoved(id: number) {
    this.drops.remove(id);
  }

  onBlocksLoaded(blocks: PlacedBlock[]) {
    this.hideoutBlocks.clear();
    const wanted = new Set(blocks.map(({ x, y, z }) => `${x},${y},${z}`));
    for (const key of [...this.blockImages.keys()]) {
      if (wanted.has(key)) continue;
      const [x, y, z] = key.split(',').map(Number);
      this.removeBlockAt(x, y, z);
    }
    for (const block of blocks) this.onBlockPlaced(block);
  }

  onBlockPlaced({ x, y, z, id }: PlacedBlock) {
    // 숨은 방 안의 것은 따로 두고, 방이 열려 있을 때만 그린다.
    if (this.inHideoutHere(x, y)) {
      this.hideoutBlocks.set(`${x},${y},${z}`, { x, y, z, id });
      if (!this.hideoutShown) return;
    }
    // 층 구조가 바뀌어 벽이나 바닥 밖이 된 칸의 옛 블록은 그리지 않는다.
    if (!this.world.isOpenGround(x, y)) return;
    if (!this.world.blockAtLevel(x, y, z)) this.spawnBlock({ x, y }, z, id);
  }

  onBlockRemoved(x: number, y: number, z: number) {
    this.hideoutBlocks.delete(`${x},${y},${z}`);
    this.removeBlockAt(x, y, z);
  }

  onMonster(message: MonsterMessage) {
    this.monsters?.onMessage(message);
  }

  /** 던전에 들어왔다: 몬스터를 만들고, 호스트면 멈추지 않는 시계로 움직인다. */
  private startMonsters(id: DungeonId) {
    const kinds = this.monsterKinds.filter((kind) => kind.dungeon === id);
    const myId = this.session.profile.id;
    this.monsters = new MonsterField(
      this,
      kinds,
      {
        myId,
        players: () => {
          const list: { id: string; x: number; y: number }[] = [];
          if (!this.down) list.push({ id: myId, ...this.me.tile });
          for (const [other, avatar] of this.others) if (!avatar.isDown) list.push({ id: other, ...avatar.tile });
          return list;
        },
        walkable: (x, y) => this.world.isWalkable(x, y),
        safe: (x, y) => inSafeZone(id, x, y),
        spawnTiles: spawnCandidates(id),
        send: (message) => this.session.sendMonster(message),
        onKillSeen: (kind, x, y, mine) => {
          const p = gridToWorld(x + 0.5, y + 0.5);
          // 내가 잡은 것은 내 LUK 배율을 붙인 값, 남이 잡은 것은 표의 값이다(남의 LUK는 모른다).
          this.floatGold(`+${goldText(mine ? this.economy.killGold(kind.gold) : kind.gold)}`, p.x, p.y);
        },
        onMyKill: (kind) => this.queueKillClaim(kind),
        onHitMe: (kind) => void this.hitByMonster(kind),
      },
      DEPTH_OVERLAY + 0.5,
    );
    this.stopMonsterTicker = startTicker(MONSTER_TICK_MS, () => this.monsters?.tick());
  }

  private stopMonsters() {
    this.stopMonsterTicker?.();
    this.stopMonsterTicker = null;
    this.monsters?.destroy();
    this.monsters = null;
  }

  /**
   * 내가 마지막 한 방을 친 몬스터의 보상을 받는다. 알림과 골드는 바로 보이고(받을 값은 몬스터 표에 있음),
   * 서버 답이 오면 서버 값으로 맞춘다. 서버가 0.3초 안에 다시 부르면 거절하므로 여러 마리를 한꺼번에 잡으면 차례로 부른다.
   */
  private queueKillClaim(kind: MonsterKind) {
    // 처치 골드 = 몬스터 골드 × (1 + LUK/300)(서버 kill_monster와 같은 식)
    const gold = this.economy.killGold(kind.gold);
    this.economy.setGold(this.economy.gold + gold);
    this.hud.toast(`${kind.name} 처치 · ${goldText(gold)}`, `경험치 +${kind.exp.toLocaleString()}`);
    this.killClaims = this.killClaims.then(() => this.claimKill(kind, gold));
  }

  private async claimKill(kind: MonsterKind, predicted: bigint) {
    const wait = this.lastKillClaimAt + KILL_CLAIM_GAP_MS - performance.now();
    if (wait > 0) await new Promise((resolve) => window.setTimeout(resolve, wait));
    this.lastKillClaimAt = performance.now();
    const reward = await this.session.killMonster(kind.id);
    if (!reward) {
      this.economy.setGold(this.economy.gold > predicted ? this.economy.gold - predicted : 0n);
      this.hud.toast('보상을 받지 못했습니다', '서버가 받아 주지 않았습니다. 던전 안에 살아 있는지 확인해 주세요');
      return;
    }
    this.economy.setGold(reward.gold);
    this.gainExp(BigInt(reward.level), reward.exp);
  }

  /** 몬스터에게 맞았다. 체력은 서버가 정하고, 다른 사람에게도 서버가 알린다. */
  private async hitByMonster(kind: MonsterKind) {
    if (this.down) return;
    const hp = await this.session.monsterHit(kind.id);
    if (hp !== null) this.onHp(this.session.profile.id, hp, null);
  }

  /** 몬스터를 잡은 자리에서 받은 골드가 떠오른다. */
  private floatGold(text: string, x: number, y: number) {
    const label = this.add
      .text(x, y - 24, text, { fontFamily: 'Malgun Gothic, sans-serif', fontSize: '10px', color: '#ffe27a', stroke: '#3a2208', strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH_DAYLIGHT - 1)
      .setResolution(2);
    this.tweens.add({ targets: label, y: y - 44, alpha: 0, duration: 1100, ease: 'Sine.easeOut', onComplete: () => label.destroy() });
  }

  onFarmPlot(plot: Plot) {
    if (!this.farm) return;
    // 실시간 알림에는 닉네임이 없어 아는 것으로 채우고, 모르면 다시 읽는다.
    const known = this.farm.all.find((other) => other.owner === plot.owner)?.nickname;
    plot.nickname = known ?? (plot.owner === this.session.profile.id ? this.session.profile.nickname : '');
    this.farm.upsert(plot);
    if (!known && plot.owner !== this.session.profile.id) void this.reloadFarm();
  }

  onFarmPlotRemoved(x: number, y: number) {
    this.farm?.remove(x, y);
  }

  /** 농장에 들어왔다: 땅을 읽어 그리고, 블록은 내 땅의 빈 칸에만 놓게 한다. 울타리 입구 바로 안쪽 칸에는 놓지 못한다(서버 정책도 같음). */
  private startFarm() {
    const crops = new Map(this.economy.crops.map((crop) => [crop.id, crop]));
    const myId = this.session.profile.id;
    this.farm = new FarmField(this, crops, myId);
    this.world.buildFilter = (x, y) => {
      const plot = this.farm?.at(x, y);
      return !!plot && plot.owner === myId && !plot.crop && !isGate(x, y);
    };
    void this.reloadFarm();
  }

  private async reloadFarm() {
    const plots = await this.session.readFarm();
    if (plots && this.farm && this.mapId === 'farm') this.farm.setAll(plots);
  }

  /** 밭 위에 마우스를 올리면: 주인, 작물, 남은 시간, 칭찬·비난 수 */
  private plotTip(x: number, y: number) {
    if (!this.farm || !isPlot(x, y)) return null;
    const plot = this.farm.at(x, y);
    if (!plot) return '빈 땅 · 농협에서 삽니다';
    const who = `${ownerWord(plot, this.session.profile.id)} 땅`;
    const crop = plot.crop && this.farm.crop(plot.crop);
    if (!crop) return `${who} · 비어 있음`;
    return `${who} · ${cropStateText(plot, crop)} · ${votesText(plot)}`;
  }

  /**
   * 농장에서 F(휴대폰은 안내 창의 버튼): 안내 창이 다루는 칸(farmTarget)에 창에 적힌 일을 한다. 내 다 자란 작물은 거두고,
   * 자라는 작물은 칭찬·비난 창을 열고, 내 빈 땅이면 고른 씨앗을 심는다. 그런 칸이 있으면 할 일이 없어도 true(F로 일을 시작하지 않는다)
   */
  private farmKey() {
    if (!this.farm || !this.canAct) return false;
    const plot = this.farmTarget();
    if (!plot) return false;
    const { situation, seedId } = this.farmSituation(plot);
    const action = plotAction(situation);
    if (action === 'harvest') void this.harvestPlot(plot);
    else if (action === 'vote') this.openVote(plot);
    else if (action === 'plant' && seedId) void this.plantSeed(plot, cropOfSeed(seedId));
    return true;
  }

  /** 농장에서 좌클릭: 마우스로 가리킨 손 닿는 칸(8방위 2칸)이 내 다 자란 작물이면 거두고, 씨앗을 들었으면 심는다. 한 일이 있으면 true */
  private farmClick() {
    if (!this.farm || !this.canAct) return false;
    const tile = this.hoveredGround ?? this.hoveredBlock;
    if (!tile || !isPlot(tile.x, tile.y) || !inBuildReach(this.me.tile, tile)) return false;
    const plot = this.farm.at(tile.x, tile.y);
    const myId = this.session.profile.id;
    const held = this.inventory.selectedStack?.id;
    if (plot?.crop) {
      if (plot.owner === myId && this.farm.isRipe(plot)) {
        void this.harvestPlot(plot);
        return true;
      }
      return false;
    }
    if (held && isSeed(held)) {
      if (!plot || plot.owner !== myId) this.notice('내 땅이 아닙니다', '씨앗은 농협에서 산 내 땅에만 심습니다.');
      else if (this.world.heightAt(tile.x, tile.y)) this.notice('블록이 놓여 있습니다', '블록을 회수한 뒤 심습니다.');
      else void this.plantSeed(plot, cropOfSeed(held));
      return true;
    }
    return false;
  }

  private async plantSeed(plot: Plot, crop: CropId) {
    if (this.farmBusy) return;
    if (this.economy.seedCount(crop) <= 0) {
      this.notice('씨앗이 없습니다', '시작마을 농협에서 삽니다.');
      return;
    }
    this.farmBusy = true;
    const left = await this.session.plantCrop(plot.x, plot.y, crop);
    this.farmBusy = false;
    if (typeof left === 'string') {
      this.notice('심지 못했습니다', left === 'no seed' ? '씨앗이 없습니다.' : '내 빈 땅인지 확인해 주세요.');
      return;
    }
    this.economy.setSeedCount(crop, left);
    this.farm?.upsert({ ...plot, crop, plantedAt: Date.now(), praise: 0, blame: 0 });
  }

  private async harvestPlot(plot: Plot) {
    if (this.farmBusy) return;
    this.farmBusy = true;
    const result = await this.session.harvestPlot(plot.x, plot.y);
    this.farmBusy = false;
    if (typeof result === 'string') {
      this.notice('거두지 못했습니다', result === 'not ripe' ? '아직 다 자라지 않았습니다.' : '잠시 후 다시 시도해 주세요.');
      return;
    }
    this.economy.addCrop(result.crop, result.grade, result.count);
    this.farm?.upsert({ ...plot, crop: null, plantedAt: null, praise: 0, blame: 0 });
    const name = this.economy.cropInfo(result.crop)?.name ?? '작물';
    this.hud.toast(`${GRADE_NAME[result.grade]}${name} ${result.count}개 거둠`, '시작마을 농협에서 팝니다');
  }

  /** 자라는 작물의 칭찬·비난 창. 누가 눌렀는지는 보이지 않고 수만 보인다. 한 사람이 한 작물에 10분에 한 번 */
  private openVote(plot: Plot) {
    const crop = plot.crop && this.farm?.crop(plot.crop);
    if (!crop) return;
    const root = document.getElementById('hud');
    if (!root) return;
    const modal = new Modal(root, 'vote', `${crop.name} 칭찬·비난`);
    const who = plot.owner === this.session.profile.id ? '내 작물' : `${plot.nickname || '누군가'}의 작물`;
    element('modal-note', modal.box).textContent = `${who} · 다 자랄 때까지 ${formatLeft(ripeAt(plot, crop) - Date.now())}`;
    const counts = element('modal-note', modal.box);
    const wait = element('modal-note', modal.box);
    const show = (praise: number, blame: number, next: number | null) => {
      counts.textContent = `칭찬 ${praise} · 비난 ${blame} (다 자랄 때 많은 쪽이 칭찬·비난 작물이 됩니다)`;
      const left = next ? next - Date.now() : 0;
      wait.textContent = left > 0 ? `다음은 ${formatLeft(left)} 뒤에 누를 수 있습니다` : '지금 누를 수 있습니다 (한 작물에 10분에 한 번)';
      good.disabled = bad.disabled = left > 0;
    };
    const vote = async (isGood: boolean) => {
      const result = await this.session.voteCrop(plot.x, plot.y, isGood);
      if (typeof result === 'string') {
        wait.textContent = result === 'too soon' ? '아직 10분이 지나지 않았습니다' : result === 'already ripe' ? '이미 다 자랐습니다' : '누르지 못했습니다';
        return false;
      }
      const updated = { ...plot, praise: result.praise, blame: result.blame };
      this.farm?.upsert(updated);
      show(result.praise, result.blame, Date.parse(result.next_at));
      return false;
    };
    const good = modal.button('칭찬하기', () => vote(true), true);
    const bad = modal.button('비난하기', () => vote(false));
    modal.button('닫기', () => undefined);
    show(plot.praise, plot.blame, null);
    void this.session.myVoteNext(plot.x, plot.y).then((next) => show(plot.praise, plot.blame, next));
  }

  onConnection(connected: boolean, reason: string | null) {
    this.hud.setConnected(connected, reason);
  }
}

/**
 * 정보 칸에 보일 판 값: 판 레벨 L에 닿는 경험치는 50·L·(L − 1)이라(서버 adventure_battle, adventureRules.levelFromExp)
 * 다음 판 레벨까지는 100·L이다. 큰 수라 BigInt로 센다. HP는 판 스텟 HP(전투마다 다 차서 늘 가득).
 */
function runStatus(level: string, exp: string, hp: number): RunStatus {
  let L = 1n;
  let E = 0n;
  try {
    L = BigInt(level);
    E = BigInt(exp);
  } catch {
    // 글자가 이상하면 1, 0으로 둔다.
  }
  if (L < 1n) L = 1n;
  const need = 100n * L;
  let cur = E - 50n * L * (L - 1n);
  if (cur < 0n) cur = 0n;
  if (cur > need) cur = need;
  return {
    level,
    exp: bigText(cur.toString()),
    need: bigText(need.toString()),
    ratio: Number((cur * 1000n) / need) / 1000,
    hp: bigText(Math.round(hp)),
  };
}
