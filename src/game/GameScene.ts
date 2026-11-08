import Phaser from 'phaser';
import { paintJumpShadow, paintSmoke } from '../art/effects';
import { DECOR_LIFT, paintGround, TILE_CELL, WORLD_H, WORLD_W } from '../art/ground';
import {
  hideoutOrigin,
  interiorOrigin,
  paintHideoutFloor,
  paintHideoutWall,
  paintInterior,
  paintLamp,
  paintLowTable,
  paintRailing,
} from '../art/interior';
import { paintBobber, paintPortal, paintRock, PORTAL_FRAMES, PORTAL_ORIGIN_Y, type Art } from '../art/props';
import { groundPoint, sprite, type SpriteName } from '../art/sprites';
import { WALL_ORIGIN_X, WALL_ORIGIN_Y, WALL_VARIANTS, wallVariant } from '../art/walls';
import { paintBullet } from '../art/weapons';
import { blockArt, blockTile, BLOCKS, paintBlock, WALL_IDS, type BlockId } from '../blocks';
import {
  BLOCK_HEIGHT,
  JUMP_MS,
  JUMP_TILES,
  MAP_SIZE,
  MAX_HP,
  PLACE_RANGE,
  RUN_SPEED,
  STEP_MS,
  TILE_H,
  TILE_W,
  ZOOM,
} from '../config';
import { depthOf, gridToWorld, tileCenter, worldToGrid } from '../iso';
import { isWeapon, WEAPON_IDS, WEAPONS, type WeaponId } from '../items';
import type {
  ChatMessage,
  GameSession,
  Motion,
  PlacedBlock,
  PlayerMove,
  PlayerShot,
  SessionEvents,
} from '../net/session';
import type { ChatBox } from '../ui/chat';
import type { Hud } from '../ui/hud';
import type { Minimap } from '../ui/minimap';
import type { NameTags } from '../ui/nametags';
import type { CastleWindow } from '../ui/castle';
import type { ElevatorWindow } from '../ui/elevator';
import type { FameWindow } from '../ui/fame';
import type { OfficeWindow } from '../ui/office';
import type { ShopWindow } from '../ui/shop';
import { Avatar, TEAM_H, TEAM_W } from './avatar';
import { BULLET_HEIGHT, Bullets, type BulletTarget } from './bullets';
import { CoverFader } from './covers';
import type { Economy, ShopItem, ShopTool } from './economy';
import type { Inventory } from './inventory';
import type { Dir, Keys } from './keys';
import { formatLevel, levelNeed } from './level';
import { generateMap, type Building } from './map';
import {
  arrivalFor,
  CASTLE,
  DEFAULT_MAP,
  isInside,
  isMapId,
  MAPS,
  OFFICE,
  portalColor,
  portalName,
  portalsOf,
  respawnTile,
  SHOP,
  type MapId,
  type Portal,
  type WorkId,
} from './maps';
import { meleeTarget } from './melee';
import { findPath } from './path';
import { CAFE_SIGN, FLOORS, HIDEOUT, hideoutSolid, isTower, type TowerId } from './tower';
import type { StatId } from './stats';
import { WorkFx } from './workFx';
import { inReach, World, type Tile } from './world';

const DEPTH_GROUND = 0;
const DEPTH_OVERLAY = 1;

/** 닉네임을 띄울 높이: 발에서 머리 위까지 (아트 픽셀) */
const HEAD_HEIGHT = 40;
const PORTAL_TAG_HEIGHT = 44;
const PORTAL_FRAME_MS = 100;

/** 노동청 굴뚝 꼭대기의 위치 (건물 그림 기준 픽셀)와 연기 그림 수 */
const CHIMNEY = { x: 56, y: 14 };
const SMOKE_FRAMES = ['Smoke0000', 'Smoke0001', 'Smoke0002'] as const;
const SMOKE_FRAME_MS = 240;
/** 클릭을 연달아 해도 안내가 쌓이지 않게 하는 간격 */
const NOTICE_MS = 2000;

/** 아이티공간 간판을 다는 위치 (건물 그림 기준 픽셀). 정문 앞에서도 보이는 높이다. */
const CASTLE_SIGN = { x: 176, y: 205 };
/** 상점 간판을 다는 위치 (건물 그림 기준 픽셀) */
const SHOP_SIGN = { x: 115, y: 40 };
/** 층 그림은 바닥보다 위, 블록 설치 범위 표시보다 아래에 그린다. */
const DEPTH_INTERIOR = 0.5;
/** 밟고 지나가는 꽃과 풀 블록은 바닥 바로 위에 그려 캐릭터를 가리지 않는다. */
const DEPTH_DECAL = 0.6;
/** 4층 숨은 방 바닥은 층 그림 바로 위에 그린다. */
const DEPTH_HIDEOUT = 0.55;
const WORLD_BACKGROUND = '#2c6f93';
const INDOOR_BACKGROUND = '#14141c';
const ROOF_BACKGROUND = '#8fcfee';

/** 작물 밭은 칸 하나가 아니라 4칸 너비로 그려진다. 그림에서 밭 가운데 위치 */
const CROPS_CENTER = { x: 64, y: 58 };

/** 맵 가장자리에서도 캐릭터가 화면 UI에 가리지 않도록 카메라에 주는 여백 (아트 픽셀) */
const CAMERA_PAD_X = 80;
const CAMERA_PAD_Y = 110;

const FADE_MS = 200;
const MINIMAP_INTERVAL_MS = 100;

/** 프레임이 오래 끊겼을 때 캐릭터가 순간이동하지 않도록 한 프레임의 시간을 제한한다. */
const MAX_FRAME_MS = 100;

/** 칸 이동의 이 지점까지는 방향을 바꿀 수 있다. */
const TURN_WINDOW = 0.5;

/** 총을 쏜 다른 플레이어의 총이 보이는 시간 */
const REMOTE_AIM_MS = 700;
/** 연사 무기는 이 수만큼 쏠 때 한 번만 알린다. 받는 쪽이 그만큼 나눠 그려서 통신량을 줄인다. */
const BURST = 3;
const RESPAWN_MS = 3000;
/** 휴대폰에서 다른 플레이어를 눌렀다고 보는 거리 (칸) */
const TAP_TARGET_TILES = 1.5;
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
  private me!: Avatar;
  private walk: Walk | null = null;
  /** 방향키 없이 Shift를 누르면 이 방향으로 대시한다. 처음에는 화면 아래를 본다. */
  private lastDir: Dir = { dx: 1, dy: 1 };
  private level: bigint;
  /** 지금 층에서 숨은 방을 찾았는지. 층을 옮기면 다시 숨는다. */
  private hideoutShown = false;
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
  private readonly wallImages = new Map<string, Phaser.GameObjects.Image>();
  private portalSprites: PortalSprite[] = [];
  private signs: Sign[] = [];
  /** 건물과 자원처럼 맵을 옮길 때 지워야 하는 그림 */
  private mapImages: Phaser.GameObjects.Image[] = [];
  private readonly covers = new CoverFader(this);
  private readonly workFx = new WorkFx(this);
  /** 칸별 자원 그림. 작업할 때 흔들린다. */
  private readonly spotImages = new Map<string, Phaser.GameObjects.Image>();
  private chimneySmoke: Phaser.GameObjects.Image | null = null;
  private readonly paintedArt = new Map<string, Art>();
  /** 작업 중이면 시작 시각, 아니면 null */
  private workStartedAt: number | null = null;
  private portalFrame = 0;
  private traveling = false;
  private down = false;
  /** 지금 들고 있는 무기. 없으면 null */
  private armedWith: WeaponId | null = null;
  private nextShotAt = 0;
  private nextNoticeAt = 0;
  private shotsFired = 0;
  private nextMinimapAt = 0;

  /** 엘리베이터에 탄 층. 버튼판의 내리기를 누르면 이 층으로 나간다. 새로고침하면 1층이다. */
  private elevatorFloor: TowerId = 'tower1';

  /** 휴대폰에서 누른 곳까지 남은 칸. 비어 있으면 걷지 않는다. */
  private route: Tile[] = [];
  private routeGoal: Tile | null = null;
  private routeMarker!: Phaser.GameObjects.Graphics;
  /** 휴대폰에서 다른 플레이어를 눌러 공격을 시작했으면 손을 뗄 때까지 연사한다. */
  private touchFiring = false;

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
  ) {
    super('game');
    this.mapId = isMapId(session.profile.map) ? session.profile.map : DEFAULT_MAP;
    this.level = BigInt(session.profile.level);
    this.exp = session.profile.exp;
  }

  create() {
    this.createTextures();
    this.ground = this.add.image(0, 0, this.groundTexture(this.mapId)).setOrigin(0, 0).setDepth(DEPTH_GROUND);
    this.showMap(this.mapId);
    // 숨은 방 안에서 접속을 끊었다면 방이 열린 채로 시작한다.
    const saved = this.session.profile;
    if (this.mapId === HIDEOUT.map && isInside(HIDEOUT.area, saved.x, saved.y)) this.showHideout(false);

    const { id, nickname, hp, skin } = this.session.profile;
    this.me = new Avatar(this, id, this.startTile(), hp, skin);
    this.tags.add(id, nickname);
    this.tags.setHp(id, hp);
    this.showLevel(id, this.level);

    this.bullets = new Bullets(this, {
      isSolid: (tx, ty) => this.world.blocksShots(tx, ty),
      targets: () => this.bulletTargets(),
      onImpact: (id, dx, dy) => this.playHit(id, dx, dy),
    });

    this.range = this.add.graphics().setDepth(DEPTH_OVERLAY);
    this.marker = this.add.graphics().setDepth(DEPTH_OVERLAY);
    this.routeMarker = this.add.graphics().setDepth(DEPTH_OVERLAY);
    this.ghost = this.add
      .image(0, 0, `block-${WALL_IDS[0]}-0`)
      .setOrigin(WALL_ORIGIN_X, WALL_ORIGIN_Y)
      .setVisible(false);

    const cam = this.cameras.main;
    cam.setZoom(ZOOM);
    cam.setBounds(-CAMERA_PAD_X, -CAMERA_PAD_Y, WORLD_W + CAMERA_PAD_X * 2, WORLD_H + CAMERA_PAD_Y * 2);
    cam.startFollow(this.me.anchor, true);

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.canAct && !this.chat.isOpen) return;
      if (pointer.wasTouch) {
        this.tap();
        return;
      }
      this.updateHover();
      if (pointer.rightButtonDown()) void this.collectBlock();
      else if (pointer.leftButtonDown()) this.useSelectedItem();
    });
    this.input.on('pointerup', () => {
      this.touchFiring = false;
    });

    this.drawRange();
    void this.session.connect(this);
    if (this.me.isDown) this.goDown();
  }

  /** 저장된 자리에 건물이 들어섰다면 맵 입구에서 시작한다. */
  private startTile(): Tile {
    const { x, y } = this.session.profile;
    return this.world.isWalkable(x, y) ? { x, y } : respawnTile(this.mapId);
  }

  private createTextures() {
    for (const id of WALL_IDS) {
      for (let v = 0; v < WALL_VARIANTS; v++) this.textures.addCanvas(`block-${id}-${v}`, paintBlock(id, v));
    }
    for (const id of WEAPON_IDS) this.textures.addCanvas(id, WEAPONS[id].art.paint());
    this.textures.addCanvas('bullet', paintBullet());
    this.textures.addCanvas('smoke', paintSmoke());
    this.textures.addCanvas('jump-shadow', paintJumpShadow());
    this.textures.addSpriteSheet('team', sprite('team'), { frameWidth: TEAM_W, frameHeight: TEAM_H });
    this.textures.addSpriteSheet('team-back', sprite('team-back'), { frameWidth: TEAM_W, frameHeight: TEAM_H });
    this.textures.addSpriteSheet('tiles', sprite('tiles'), { frameWidth: TILE_CELL, frameHeight: TILE_CELL });
    for (const name of SMOKE_FRAMES) this.spriteTexture(name);
  }

  /** public/sprites 이미지를 게임에서 쓸 수 있게 등록한다. */
  private spriteTexture(name: SpriteName) {
    if (!this.textures.exists(name)) this.textures.addImage(name, sprite(name));
    return name;
  }

  /** 맵 바닥 그림은 처음 들어갈 때 한 번만 그린다. */
  private groundTexture(id: MapId) {
    const key = `ground-${id}`;
    if (!this.textures.exists(key)) this.textures.addCanvas(key, paintGround(generateMap(id)));
    return key;
  }

  private portalTexture(portal: Portal, frame: number) {
    const key = `portal-${portal.to}-${frame}`;
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
    this.covers.add(name, [placed]);
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
    this.covers.add('crops', [placed]);
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
    this.covers.add(name, strips);
    return { left, top };
  }

  /** 노동청 굴뚝에서 연기가 피어오른다. */
  private showChimneySmoke(left: number, top: number) {
    this.chimneySmoke = this.add
      .image(left + CHIMNEY.x, top + CHIMNEY.y, SMOKE_FRAMES[0])
      .setOrigin(0.5, 1)
      .setDepth(depthOf(MAP_SIZE, MAP_SIZE));
    this.mapImages.push(this.chimneySmoke);
  }

  /** 맵 하나를 화면에 올린다. 블록과 다른 플레이어는 서버에서 받아 채운다. */
  private showMap(id: MapId) {
    this.mapId = id;
    this.hideoutShown = false;
    const info = MAPS[id];
    this.world = new World(generateMap(id), portalsOf(id));
    this.ground.setTexture(this.groundTexture(id));
    this.minimap.setMap(info.name, info.color, this.world.map.bounds);
    this.cameras.main.setBackgroundColor(
      id === 'rooftop' || id === 'stairs' ? ROOF_BACKGROUND : isTower(id) ? INDOOR_BACKGROUND : WORLD_BACKGROUND,
    );
    this.updateGuide(id);
    if (isTower(id)) this.showInterior(id);
    this.chimneySmoke = null;
    for (const building of this.world.map.buildings) {
      const { left, top } = this.showBuilding(building);
      if (building.sprite === OFFICE.sprite) this.showChimneySmoke(left, top);
      if (building.sprite === CASTLE.sprite) this.addSign(CASTLE.name, left + CASTLE_SIGN.x, top + CASTLE_SIGN.y);
      if (building.sprite === SHOP.sprite) this.addSign(SHOP.name, left + SHOP_SIGN.x, top + SHOP_SIGN.y);
    }
    this.showSpots(id);
    this.showWalls();
    for (const { sprite, x, y } of this.world.map.trees) this.addSprite(sprite, x, y);
    for (const { tile, x, y } of this.world.map.props) this.addTileProp(tile, x, y);

    this.portalSprites = this.world.portals.map((portal) => {
      const c = tileCenter(portal.x, portal.y);
      const image = this.add
        .image(c.x, c.y, this.portalTexture(portal, 0))
        .setOrigin(0.5, PORTAL_ORIGIN_Y)
        .setDepth(depthOf(portal.x, portal.y));
      const tag = `portal-${portal.to}`;
      this.tags.add(tag, `→ ${portalName(portal)}`, 'portal');
      return { portal, image, tag };
    });
  }

  /** 작업장의 장식 벽. 다 놓은 뒤 이웃끼리 잇는다. */
  private showWalls() {
    for (const { x, y, id } of this.world.map.walls) {
      const c = tileCenter(x, y);
      const image = this.add.image(c.x, c.y, `block-${id}-0`).setOrigin(WALL_ORIGIN_X, WALL_ORIGIN_Y).setDepth(depthOf(x, y));
      this.wallImages.set(`${x},${y}`, image);
      this.mapImages.push(image);
    }
    for (const { x, y } of this.world.map.walls) this.connectWalls(x, y);
  }

  /** 아이티공간 층 그림: 바닥과 뒤쪽 벽을 한 장에 담았다. 층마다 처음 들어갈 때 한 번만 그린다. */
  private showInterior(id: TowerId) {
    const key = `interior-${id}`;
    if (!this.textures.exists(key)) this.textures.addCanvas(key, paintInterior(id));
    const [x0, y0] = FLOORS[id].area;
    const { left, top } = interiorOrigin(id, gridToWorld(x0, y0));
    this.mapImages.push(this.add.image(left, top, key).setOrigin(0, 0).setDepth(DEPTH_INTERIOR));
    for (const { x, y } of this.world.map.railings) this.addMapArt('railing', paintRailing, x, y);
    if (id === 'tower1') {
      const sign = gridToWorld(CAFE_SIGN.x + 0.5, CAFE_SIGN.y);
      this.addSign("ITS'room", sign.x, sign.y - CAFE_SIGN.lift);
    }
  }

  /** 4층 바닥 끝의 정해진 칸을 밟으면 숨은 방이 드러난다. */
  private checkHideout() {
    if (this.hideoutShown || this.mapId !== HIDEOUT.map) return;
    const { x, y } = this.me.tile;
    if (x === HIDEOUT.trigger.x && y === HIDEOUT.trigger.y) this.showHideout(true);
  }

  /** 숨은 방을 내 화면에만 드러내고 걸어 들어갈 수 있게 한다. fadeIn이면 천천히 나타난다. */
  private showHideout(fadeIn: boolean) {
    this.hideoutShown = true;
    this.world.openFloor(HIDEOUT.area, hideoutSolid());
    const [x0, y0] = HIDEOUT.area;
    const { left, top } = hideoutOrigin(gridToWorld(x0, y0));
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
    this.mapImages.push(floor, wall);
    const { lamp, table, plant } = HIDEOUT;
    const images = [
      floor,
      wall,
      this.addMapArt('hideout-lamp', paintLamp, lamp.x, lamp.y),
      this.addMapArt('hideout-table', paintLowTable, table.x, table.y),
      this.addSprite('plant', plant.x, plant.y),
    ];
    this.hud.announce(HIDEOUT.title);
    if (!fadeIn) return;
    for (const image of images) image.setAlpha(0);
    this.tweens.add({ targets: images, alpha: 1, duration: 1600, ease: 'Sine.easeOut' });
  }

  /** 아이티공간에서 태어난 플레이어에게 시작마을에 처음 닿기 전까지 가는 법을 띄워 둔다. */
  private updateGuide(id: MapId) {
    const key = `its-sandbox:arrived:${this.session.profile.id}`;
    if (id === DEFAULT_MAP) localStorage.setItem(key, '1');
    this.hud.showGuide(isTower(id) && !localStorage.getItem(key));
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
    this.wallImages.clear();
    for (const image of this.mapImages) image.destroy();
    this.mapImages = [];
    this.bullets.clear();
  }

  update(time: number) {
    // Phaser의 delta는 포커스가 바뀐 뒤 잠시 16.7ms로 묶여 프레임이 낮으면 움직임이 느려진다.
    const delta = Math.min(this.game.loop.rawDelta, MAX_FRAME_MS);
    this.advancePlayer(delta);
    this.checkHideout();
    for (const avatar of this.others.values()) avatar.update(delta);
    this.bullets.update(delta);
    this.updateWork();
    this.workFx.update(delta);
    this.updateAim();
    this.updateAutoFire();
    this.animatePortals(time);
    this.covers.update(time, this.me.sprite);
    this.updateHover();
    this.placeNameTags();
    this.updateMinimap(time);
  }

  private get canAct() {
    const windowOpen =
      this.hud.isOpen ||
      this.office.isOpen ||
      this.shop.isOpen ||
      this.castle.isOpen ||
      this.fame.isOpen ||
      this.elevator.isOpen ||
      this.chat.isOpen;
    return !windowOpen && !this.traveling && !this.down;
  }

  /** 시작마을처럼 공격이 막힌 맵인지 */
  private get isSafeMap() {
    return MAPS[this.mapId].safe === true;
  }

  private get safeName() {
    return this.mapId === DEFAULT_MAP ? '시작마을' : MAPS[this.mapId].name;
  }

  /** 이 맵에 블록 설치 구역이 있는지 */
  private get canBuildHere() {
    return this.world.map.buildZones.length > 0;
  }

  private advancePlayer(delta: number) {
    const wasMoving = this.me.moving;
    this.me.update(delta);
    if (this.traveling || this.down) return;

    if (this.keys.takeWork() && this.canAct) this.toggleWork();

    if (this.keys.takeJump() && this.canAct && !this.me.jumping) this.jump();

    if (this.me.moving) {
      this.steer();
      return;
    }

    // 막 도착했을 때만 탄다. 창을 닫은 뒤 그 자리에서 다시 열리지 않게 한다.
    const portal = wasMoving ? this.world.portalAt(this.me.tile.x, this.me.tile.y) : undefined;
    if (portal) {
      if (portal.to === 'office') this.office.open();
      else if (portal.to === 'shop') this.shop.open();
      else if (portal.to === 'counter') this.castle.open();
      else if (portal.to === 'fame') void this.fame.open();
      else if (portal.to === 'panel') this.elevator.open(this.elevatorFloor);
      else this.travel(portal.to);
      return;
    }
    const dir = this.keys.takeDirection();
    if (dir && this.canAct) {
      this.clearRoute();
      this.beginStep(this.me.tile, dir);
    } else if (this.route.length && this.canAct) {
      this.followRoute();
    }
  }

  /**
   * 휴대폰에서 화면을 누르면 그 칸까지 걸어간다.
   * 무기를 들고 다른 플레이어를 누르면 걷지 않고 그쪽으로 공격한다.
   */
  private tap() {
    const w = this.pointerWorld();
    const weapon = this.selectedWeapon;
    if (weapon && !this.isSafeMap && this.workStartedAt === null && this.tappedPlayer(w.x, w.y)) {
      this.clearRoute();
      this.touchFiring = true;
      this.attack(weapon);
      return;
    }
    const g = worldToGrid(w.x, w.y);
    this.walkTo({ x: Math.floor(g.gx), y: Math.floor(g.gy) });
  }

  /** 누른 곳 가까이에 쓰러지지 않은 다른 플레이어가 있는지 본다. 몸통을 눌러도 되도록 총알 높이만큼 내려서 잰다. */
  private tappedPlayer(wx: number, wy: number) {
    const { gx, gy } = worldToGrid(wx, wy + BULLET_HEIGHT);
    for (const avatar of this.others.values()) {
      if (avatar.isDown) continue;
      const { x, y } = avatar.position();
      if (Math.hypot(x + 0.5 - gx, y + 0.5 - gy) <= TAP_TARGET_TILES) return true;
    }
    return false;
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

  /** 방향을 누르고 Space를 누르면 벽 하나를 넘을 수 있다. 벽 앞에서는 방향 없이 눌러도 넘는다. */
  private jump() {
    this.clearRoute();
    const from = this.actionStart;
    const ahead = { x: from.x + this.lastDir.dx, y: from.y + this.lastDir.dy };
    const facingWall = this.world.inBounds(ahead.x, ahead.y) && !this.world.isWalkable(ahead.x, ahead.y);
    const dir = this.keys.takeDirection() ?? (facingWall ? this.lastDir : null);

    this.moveTo(dir ? this.jumpLanding(from, dir) : from, JUMP_MS, 'jump');
    if (dir) {
      this.lastDir = dir;
      this.me.face(dir.dx, dir.dy);
    }
    this.walk = null;
  }

  /** 벽 너머에 설 곳이 있으면 거기로, 없으면 바로 앞이나 제자리로 내린다. */
  private jumpLanding(from: Tile, { dx, dy }: Dir): Tile {
    const far = { x: from.x + dx * JUMP_TILES, y: from.y + dy * JUMP_TILES };
    if (this.world.isWalkable(far.x, far.y)) return far;
    const near = { x: from.x + dx, y: from.y + dy };
    return this.world.isWalkable(near.x, near.y) ? near : from;
  }

  private moveTo(to: Tile, ms: number, motion: Motion = 'walk') {
    this.stopWork();
    if (motion === 'jump') this.me.jumpTo(to, ms);
    else if (motion === 'run') this.me.runTo(to, ms);
    else this.me.stepTo(to, ms);
    this.session.sendMove(to.x, to.y, ms, motion);
    this.session.saveLater(to);
    this.drawRange();
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

  /** 가진 자원을 모두 판다. 금액은 서버가 계산한다. */
  async sellEverything() {
    const before = this.economy.gold;
    const gold = await this.session.sellAll();
    if (gold === null) {
      this.hud.toast('정산에 실패했습니다', '잠시 후 다시 시도해 주세요');
      return;
    }
    this.economy.setSold(gold);
    this.hud.toast(`+${(gold - before).toLocaleString()}G`, '수고하셨습니다. 내일도 나오세요.');
  }

  /** 상점에서 무기를 산다. 가격과 골드는 서버가 확인한다. */
  async buyWeapon(id: WeaponId) {
    if (!this.inventory.canAdd(id)) {
      this.hud.toast('가방이 꽉 찼습니다', '칸을 비우고 다시 오세요');
      return;
    }
    const gold = await this.session.buyWeapon(id);
    if (gold === null) {
      this.hud.toast('살 수 없습니다', '잠시 후 다시 시도해 주세요');
      return;
    }
    this.economy.setWeaponBought(id, gold);
    this.inventory.add(id);
    this.hud.toast(`${WEAPONS[id].name} 구매 완료`, '가방이나 단축키 칸을 확인하세요');
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

  /** 상점에서 꾸미기 블록 한 묶음을 산다. 가방에 다 들어갈 때만 산다. */
  async buyItem({ id, amount }: ShopItem) {
    if (this.inventory.room(id) < amount) {
      this.hud.toast('가방이 꽉 찼습니다', '칸을 비우고 다시 오세요');
      return;
    }
    const bought = await this.session.buyItem(id);
    if (!bought) {
      this.hud.toast('살 수 없습니다', '잠시 후 다시 시도해 주세요');
      return;
    }
    this.economy.setItemBought(bought.gold);
    for (let i = 0; i < bought.amount; i++) this.inventory.add(id);
    this.hud.toast(`${BLOCKS[id].name} ${bought.amount}개 구매 완료`, '가방이나 단축키 칸을 확인하세요');
  }

  /** ITS'room 카운터에서 스텟을 1 올린다. */
  async buyStat(id: StatId) {
    const bought = await this.session.buyStat(id);
    if (!bought) {
      this.hud.toast('살 수 없습니다', '잠시 후 다시 시도해 주세요');
      return;
    }
    this.economy.setStatBought(id, bought.value, bought.gold);
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
    this.me.face(Math.sign(spot.x - this.me.tile.x), Math.sign(spot.y - this.me.tile.y));
    this.workStartedAt = this.time.now;
    const place = this.economy.workplace(this.mapId);
    if (place) {
      const image = this.spotImages.get(`${spot.x},${spot.y}`) ?? null;
      this.workFx.start(place.id, this.me, spot, image, place.gatherMs);
    }
  }

  private stopWork() {
    if (this.workStartedAt === null) return;
    this.workStartedAt = null;
    this.tags.setProgress(this.session.profile.id, null);
    this.workFx.stop();
  }

  private updateWork() {
    if (this.workStartedAt === null) return;
    const place = this.economy.workplace(this.mapId);
    if (!place) {
      this.stopWork();
      return;
    }
    const progress = (this.time.now - this.workStartedAt) / place.gatherMs;
    this.tags.setProgress(this.session.profile.id, progress);
    if (progress < 1) return;
    this.workStartedAt = this.time.now;
    void this.collectResource();
  }

  private async collectResource() {
    const result = await this.session.harvest();
    const info = result ? this.economy.lootItem(result.item) : undefined;
    if (!result || !info) return;
    this.workFx.finish(this.economy.isRare(info));
    this.economy.add(result.item, result.count);
    const name = result.count > 1 ? `${info.name} ×${result.count}` : info.name;
    this.hud.toast(`${name} 획득 (${info.price}G) · 경험치 +${result.gained}`, info.blurb, this.economy.isRare(info));
    this.gainExp(BigInt(result.level), result.exp);
  }

  /** 내 레벨과 경험치가 바뀌었다. 작업 결과와 서버 알림이 둘 다 오므로 지금보다 앞설 때만 바꾼다. */
  private gainExp(level: bigint, exp: number) {
    if (level < this.level || (level === this.level && exp <= this.exp)) return;
    const leveled = level > this.level;
    this.level = level;
    this.exp = exp;
    this.hud.setLevel(level, exp, leveled);
    if (!leveled) return;
    this.showLevel(this.session.profile.id, level);
    this.hud.toast(`레벨 업! Lv. ${formatLevel(level)}`, `다음 레벨까지 경험치 ${levelNeed(level).toLocaleString()}`);
  }

  private showLevel(id: string, level: bigint) {
    this.tags.setLevel(id, `Lv.${formatLevel(level, true)}`);
  }

  /** 포탈을 타면 화면을 어둡게 한 사이에 맵을 바꾼다. */
  private travel(to: MapId) {
    this.clearRoute();
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
    });
    cam.fadeOut(FADE_MS);
  }

  private animatePortals(time: number) {
    const smokeFrame = Math.floor(time / SMOKE_FRAME_MS) % SMOKE_FRAMES.length;
    this.chimneySmoke?.setTexture(SMOKE_FRAMES[smokeFrame]);

    const frame = Math.floor(time / PORTAL_FRAME_MS) % PORTAL_FRAMES;
    if (frame === this.portalFrame) return;
    this.portalFrame = frame;
    for (const { portal, image } of this.portalSprites) image.setTexture(this.portalTexture(portal, frame));
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

  private updateMinimap(time: number) {
    if (time < this.nextMinimapAt) return;
    this.nextMinimapAt = time + MINIMAP_INTERVAL_MS;
    this.minimap.draw({
      me: this.me.tile,
      others: [...this.others.values()].map((avatar) => avatar.tile),
      blocks: [...this.world.blockTiles(), ...this.world.map.walls],
      portals: this.world.portals,
    });
  }

  private pointerWorld() {
    const pointer = this.input.activePointer;
    return this.cameras.main.getWorldPoint(pointer.x, pointer.y);
  }

  private get selectedWeapon(): WeaponId | null {
    const stack = this.inventory.selectedStack;
    return stack && isWeapon(stack.id) ? stack.id : null;
  }

  /** 무기를 들고 있으면 마우스 쪽으로 겨누고 커서를 조준점으로 바꾼다. */
  private updateAim() {
    const weapon = this.down || this.isSafeMap || this.workStartedAt !== null ? null : this.selectedWeapon;
    if (weapon !== this.armedWith) {
      this.armedWith = weapon;
      this.input.setDefaultCursor(weapon ? 'crosshair' : 'default');
      if (weapon) this.me.setWeapon(weapon);
      else this.me.lowerGun();
    }
    if (!weapon) return;
    const w = this.pointerWorld();
    const { x, y } = this.me.sprite;
    this.me.aim(Math.atan2(w.y - (y - BULLET_HEIGHT), w.x - x));
  }

  /** 연사 무기는 누르고 있는 동안 계속 쏜다. */
  private updateAutoFire() {
    const weapon = this.selectedWeapon;
    if (!weapon || !WEAPONS[weapon].auto || !this.canAct || this.isSafeMap) return;
    // 휴대폰은 걸으려고 누른 손가락으로 쏘지 않도록 플레이어를 눌렀을 때만 연사한다.
    if (this.input.activePointer.wasTouch && !this.touchFiring) return;
    if (this.input.activePointer.leftButtonDown()) this.attack(weapon);
  }

  private useSelectedItem() {
    const weapon = this.selectedWeapon;
    if (weapon && this.isSafeMap) this.notice(`${this.safeName}은 비무장지대입니다`, '이곳에서는 무기를 쓸 수 없습니다.');
    else if (weapon) this.attack(weapon);
    else if (this.canBuildHere) this.placeBlock();
    else if (this.inventory.selectedStack) this.notice('블록을 놓을 수 없습니다', '정해진 구역에만 놓을 수 있습니다.');
  }

  private notice(title: string, detail: string) {
    if (this.time.now < this.nextNoticeAt) return;
    this.nextNoticeAt = this.time.now + NOTICE_MS;
    this.hud.toast(title, detail);
  }

  private attack(weapon: WeaponId) {
    if (this.time.now < this.nextShotAt) return;
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

    if (melee) {
      const target = this.slash(myId, this.me, weapon, { x: fromX, y: fromY }, { x: aim.gx, y: aim.gy });
      if (target) void this.session.hitPlayer(target, weapon);
    } else {
      const shot = this.scatter(weapon, fromX, fromY, aim.gx, aim.gy);
      this.bullets.fire(myId, fromX, fromY, shot.x, shot.y, range, (target) => {
        void this.session.hitPlayer(target, weapon);
      });
    }

    if (!auto || this.shotsFired % BURST === 0) this.session.sendShot(weapon, fromX, fromY, aim.gx, aim.gy);
    this.shotsFired++;
  }

  /** 앞쪽을 베고 맞은 사람의 id를 돌려준다. 다른 플레이어의 공격도 같은 방법으로 보여 준다. */
  private slash(ownerId: string, avatar: Avatar, weapon: WeaponId, from: Tile, to: Tile, holdMs?: number) {
    const start = gridToWorld(from.x, from.y);
    const end = gridToWorld(to.x, to.y);
    avatar.swing(Math.atan2(end.y - start.y, end.x - start.x), holdMs);

    const targets = this.bulletTargets().filter(({ id }) => id !== ownerId);
    const isSolid = (x: number, y: number) => this.world.blocksShots(x, y);
    const target = meleeTarget(from, to, WEAPONS[weapon].range, targets, isSolid);
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
    const avatar = id === this.session.profile.id ? this.me : this.others.get(id);
    if (!avatar) return;
    const screenX = (dx - dy) * (TILE_W / 2);
    const screenY = (dx + dy) * (TILE_H / 2);
    const length = Math.hypot(screenX, screenY);
    if (length > 0) avatar.hitBack(screenX / length, screenY / length);
  }

  private bulletTargets(): BulletTarget[] {
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
    this.setMyHp(MAX_HP);
    this.down = false;
    this.hud.showDown(false);
    this.drawRange();
    this.session.sendMove(tile.x, tile.y, 0);
    this.session.saveLater(tile);
  }

  private setMyHp(hp: number) {
    this.me.setHp(hp);
    this.hud.setHp(hp);
    this.tags.setHp(this.session.profile.id, hp);
    if (hp <= 0) this.goDown();
  }

  private hitsCube(x: number, y: number, wx: number, wy: number) {
    const c = tileCenter(x, y);
    const across = Math.abs(wx - c.x) / (TILE_W / 2);
    if (across > 1) return false;
    const half = (1 - across) * (TILE_H / 2);
    const dy = wy - c.y;
    return dy <= half && dy >= -half - BLOCK_HEIGHT;
  }

  private updateHover() {
    // 휴대폰에는 마우스 커서가 없으므로 설치 미리보기를 띄우지 않는다.
    if (this.hud.isOpen || this.input.activePointer.wasTouch) {
      this.hoveredBlock = this.hoveredGround = null;
      this.ghost.setVisible(false);
      this.marker.clear();
      return;
    }

    const w = this.pointerWorld();
    const g = worldToGrid(w.x, w.y);
    const x = Math.floor(g.gx);
    const y = Math.floor(g.gy);

    // 블록은 뒤쪽 칸을 가리므로 화면 앞쪽 칸부터 확인한다.
    const candidates = [
      [x + 1, y + 1],
      [x + 1, y],
      [x, y + 1],
      [x, y],
    ];
    const hit = candidates.find(([cx, cy]) => this.world.blockAt(cx, cy) && this.hitsCube(cx, cy, w.x, w.y));
    this.hoveredBlock = hit ? { x: hit[0], y: hit[1] } : null;
    this.hoveredGround = !hit && this.world.inBounds(x, y) ? { x, y } : null;
    this.drawHover();
  }

  private canPlaceAt(target: Tile) {
    if (!this.world.canPlace(target, this.me.tile)) return false;
    for (const { tile } of this.others.values()) {
      if (tile.x === target.x && tile.y === target.y) return false;
    }
    return true;
  }

  private drawHover() {
    this.marker.clear();
    this.ghost.setVisible(false);

    if (this.hoveredBlock) {
      const { x, y } = this.hoveredBlock;
      const ok = inReach(this.me.tile, this.hoveredBlock);
      this.marker.setDepth(depthOf(x, y) + 2);
      this.strokeTile(x, y, ok ? 0xffffff : 0xff6b5e, -BLOCK_HEIGHT);
      return;
    }

    const stack = this.inventory.selectedStack;
    if (!this.hoveredGround || !this.canBuildHere || (stack && isWeapon(stack.id))) return;
    const { x, y } = this.hoveredGround;
    const ok = stack !== null && this.canPlaceAt(this.hoveredGround);
    this.marker.setDepth(DEPTH_OVERLAY);
    this.strokeTile(x, y, ok ? 0xffffff : 0xff6b5e, 0);

    if (stack && !isWeapon(stack.id)) {
      this.dressBlock(this.ghost, stack.id, x, y)
        .setAlpha(ok ? 0.7 : 0.35)
        .setTint(ok ? 0xffffff : 0xff6b5e)
        .setVisible(true);
    }
  }

  private strokeTile(x: number, y: number, color: number, lift: number) {
    const pts = [gridToWorld(x, y), gridToWorld(x + 1, y), gridToWorld(x + 1, y + 1), gridToWorld(x, y + 1)];
    this.marker.lineStyle(1, color, 0.95).beginPath();
    this.marker.moveTo(pts[0].x, pts[0].y + lift);
    for (const p of pts.slice(1)) this.marker.lineTo(p.x, p.y + lift);
    this.marker.closePath().strokePath();
  }

  /** 블록을 놓을 수 있는 범위를 마름모로 표시한다. */
  private drawRange() {
    const clamp = (v: number) => Math.max(0, Math.min(MAP_SIZE, v));
    const { x, y } = this.me.tile;
    const x0 = clamp(x - PLACE_RANGE);
    const y0 = clamp(y - PLACE_RANGE);
    const x1 = clamp(x + PLACE_RANGE + 1);
    const y1 = clamp(y + PLACE_RANGE + 1);
    const pts = [gridToWorld(x0, y0), gridToWorld(x1, y0), gridToWorld(x1, y1), gridToWorld(x0, y1)];

    this.range.clear();
    if (!this.canBuildHere) return;
    this.range.fillStyle(0xffffff, 0.05).lineStyle(1, 0xffffff, 0.5).beginPath();
    this.range.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) this.range.lineTo(p.x, p.y);
    this.range.closePath().fillPath().strokePath();
  }

  private placeBlock() {
    const target = this.hoveredGround;
    const stack = this.inventory.selectedStack;
    if (!target || !stack || isWeapon(stack.id) || !this.canPlaceAt(target)) return;
    const id = stack.id;
    this.inventory.takeSelected();

    // 먼저 화면에 놓고, 다른 사람이 먼저 놓아 실패하면 되돌린다.
    const { mapId } = this;
    this.spawnBlock(target, id);
    void this.session.placeBlock(target.x, target.y, id).then((placed) => {
      if (placed) return;
      this.inventory.add(id);
      if (mapId !== this.mapId) return;
      this.removeBlockAt(target.x, target.y);
      void this.session.syncBlocks();
    });
  }

  private async collectBlock() {
    const target = this.hoveredBlock;
    if (!target || !inReach(this.me.tile, target)) return;
    const id = this.world.blockAt(target.x, target.y);
    if (!id || !this.inventory.canAdd(id)) return;

    const { mapId } = this;
    const removed = await this.session.removeBlock(target.x, target.y);
    if (!removed) return;
    this.inventory.add(removed);
    if (mapId === this.mapId) this.removeBlockAt(target.x, target.y);
  }

  private spawnBlock({ x, y }: Tile, id: BlockId) {
    this.world.place(x, y, id);
    const image = this.dressBlock(this.add.image(0, 0, 'tiles'), id, x, y);
    this.blockImages.set(`${x},${y}`, image);
    const art = blockArt(id);
    // 나무와 가구는 키가 커서 뒤에 선 캐릭터를 가리므로 반투명하게 할 대상에 넣는다.
    if (art.kind === 'sprite') this.covers.add(art.sprite, [image]);
    this.connectWalls(x, y);
  }

  /** 블록 그림을 칸 (x, y)에 맞춘다. 벽은 이웃에 따라 connectWalls가 그림을 다시 고른다. */
  private dressBlock(image: Phaser.GameObjects.Image, id: BlockId, x: number, y: number) {
    const art = blockArt(id);
    if (art.kind === 'wall') {
      const c = tileCenter(x, y);
      return image.setTexture(`block-${id}-0`).setOrigin(WALL_ORIGIN_X, WALL_ORIGIN_Y).setPosition(c.x, c.y).setDepth(depthOf(x, y));
    }
    if (art.kind === 'sprite') {
      this.spriteTexture(art.sprite);
      const source = sprite(art.sprite);
      const foot = groundPoint(art.sprite);
      const c = tileCenter(x, y);
      return image
        .setTexture(art.sprite)
        .setOrigin(foot.x / source.width, foot.y / source.height)
        .setPosition(c.x, c.y)
        .setDepth(depthOf(x, y));
    }
    const corner = gridToWorld(x, y);
    return image
      .setTexture('tiles', blockTile(art.tiles, x, y))
      .setOrigin(0.5, 0)
      .setPosition(corner.x, corner.y - this.world.map.floorTop - DECOR_LIFT)
      .setDepth(BLOCKS[id].solid ? depthOf(x, y) : DEPTH_DECAL);
  }

  /** 벽이 이웃과 이어져 보이도록 자기와 주변 벽의 그림을 고른다. 장식 벽과 설치한 블록도 서로 잇는다. */
  private connectWalls(x: number, y: number) {
    const wallAt = (wx: number, wy: number) => this.world.wallAt(wx, wy);
    for (const [tx, ty] of [
      [x, y],
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      const id = wallAt(tx, ty);
      if (!id) continue;
      const neighbors =
        (wallAt(tx + 1, ty) ? 1 : 0) |
        (wallAt(tx - 1, ty) ? 2 : 0) |
        (wallAt(tx, ty + 1) ? 4 : 0) |
        (wallAt(tx, ty - 1) ? 8 : 0);
      const key = `${tx},${ty}`;
      (this.blockImages.get(key) ?? this.wallImages.get(key))?.setTexture(`block-${id}-${wallVariant(neighbors)}`);
    }
  }

  private removeBlockAt(x: number, y: number) {
    this.world.remove(x, y);
    const key = `${x},${y}`;
    const image = this.blockImages.get(key);
    if (image) {
      this.covers.remove(image);
      image.destroy();
    }
    this.blockImages.delete(key);
    this.connectWalls(x, y);
  }

  currentTile() {
    return this.me.tile;
  }

  currentHp() {
    return this.me.hp;
  }

  currentLevel() {
    return this.level;
  }

  onMove({ id, nickname, x, y, ms, hp, level, motion, skin }: PlayerMove) {
    let avatar = this.others.get(id);
    if (!avatar) {
      avatar = new Avatar(this, id, { x, y }, hp, skin);
      this.others.set(id, avatar);
      this.tags.add(id, nickname);
      this.tags.setHp(id, hp);
      this.showLevel(id, level);
      return;
    }
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

    const cooldown = this.economy.cooldownOf(weapon);
    for (let i = 0; i < (auto ? BURST : 1); i++) {
      this.time.delayedCall(i * cooldown, () => {
        if (this.others.get(id) !== avatar) return;
        const shot = this.scatter(weapon, fromX, fromY, toX, toY);
        this.bullets.fire(id, fromX, fromY, shot.x, shot.y, range);
      });
    }
  }

  onHp(id: string, hp: number) {
    const mine = id === this.session.profile.id;
    const before = mine ? this.me.hp : this.others.get(id)?.hp;
    if (before !== undefined && hp < before) this.tags.float(id, `-${before - hp}`, 'damage');
    if (mine) {
      this.setMyHp(hp);
      return;
    }
    this.others.get(id)?.setHp(hp);
    this.tags.setHp(id, hp);
  }

  onDodge(id: string) {
    if (id === this.session.profile.id || this.others.has(id)) this.tags.float(id, '회피!', 'dodge');
  }

  onLevel(id: string, level: bigint, exp: number) {
    if (id === this.session.profile.id) this.gainExp(level, exp);
    else if (this.others.has(id)) this.showLevel(id, level);
  }

  onRoster(ids: Set<string>) {
    for (const [id, avatar] of this.others) {
      if (ids.has(id)) continue;
      avatar.destroy();
      this.others.delete(id);
      this.tags.remove(id);
    }
  }

  onChat({ id, author, text }: ChatMessage) {
    this.chat.show({ id, author, text });
    this.tags.say(id, text);
  }

  onBlocksLoaded(blocks: PlacedBlock[]) {
    const wanted = new Set(blocks.map(({ x, y }) => `${x},${y}`));
    for (const key of [...this.blockImages.keys()]) {
      if (wanted.has(key)) continue;
      const [x, y] = key.split(',').map(Number);
      this.removeBlockAt(x, y);
    }
    for (const block of blocks) this.onBlockPlaced(block);
  }

  onBlockPlaced({ x, y, id }: PlacedBlock) {
    if (!this.world.blockAt(x, y)) this.spawnBlock({ x, y }, id);
  }

  onBlockRemoved(x: number, y: number) {
    this.removeBlockAt(x, y);
  }

  onConnection(connected: boolean) {
    this.hud.setConnected(connected);
  }
}
