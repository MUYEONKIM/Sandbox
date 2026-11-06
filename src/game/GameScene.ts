import Phaser from 'phaser';
import { CHAR_H, CHAR_STEPS, CHAR_W, paintCharacterSheet } from '../art/character';
import { paintSmoke } from '../art/effects';
import { paintGround, WORLD_H, WORLD_W } from '../art/ground';
import { paintPortal, PORTAL_FRAMES, PORTAL_ORIGIN_Y } from '../art/props';
import { paintBullet, paintPistol } from '../art/weapons';
import { BLOCK_IDS, paintBlock, type BlockId } from '../blocks';
import {
  BLOCK_HEIGHT,
  DASH_COOLDOWN_MS,
  DASH_STEP_MS,
  DASH_TILES,
  MAP_SIZE,
  MAX_HP,
  PLACE_RANGE,
  STEP_MS,
  TILE_H,
  TILE_W,
  ZOOM,
} from '../config';
import { depthOf, gridToWorld, tileCenter, worldToGrid } from '../iso';
import { isWeapon, WEAPONS, type WeaponId } from '../items';
import type { ChatMessage, GameSession, PlacedBlock, PlayerMove, PlayerShot, SessionEvents } from '../net/session';
import type { ChatBox } from '../ui/chat';
import type { Hud } from '../ui/hud';
import type { Minimap } from '../ui/minimap';
import type { NameTags } from '../ui/nametags';
import { Avatar } from './avatar';
import { BULLET_HEIGHT, Bullets, type BulletTarget } from './bullets';
import type { Inventory } from './inventory';
import type { Dir, Keys } from './keys';
import { generateMap } from './map';
import { arrivalFor, DEFAULT_MAP, isMapId, MAPS, portalsOf, type MapId, type Portal } from './maps';
import { inReach, World, type Tile } from './world';

const DEPTH_GROUND = 0;
const DEPTH_OVERLAY = 1;

/** 닉네임을 띄울 높이: 발에서 머리 위까지 (아트 픽셀) */
const HEAD_HEIGHT = 30;
const PORTAL_TAG_HEIGHT = 44;
const PORTAL_FRAME_MS = 100;

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
const RESPAWN_MS = 3000;
const RESPAWN_RETRY_MS = 1000;

interface PortalSprite {
  portal: Portal;
  image: Phaser.GameObjects.Image;
  tag: string;
}

/** 지금 하고 있는 한 칸 걸음. 방향을 바꿀 때 출발 칸으로 돌아가 다시 계산한다. */
interface Walk {
  from: Tile;
  dir: Dir;
}

export class GameScene extends Phaser.Scene implements SessionEvents {
  world!: World;
  private mapId: MapId;
  private me!: Avatar;
  private walk: Walk | null = null;
  /** 방향키 없이 Shift를 누르면 이 방향으로 대시한다. 처음에는 화면 아래를 본다. */
  private lastDir: Dir = { dx: 1, dy: 1 };
  private nextDashAt = 0;
  private readonly others = new Map<string, Avatar>();
  private bullets!: Bullets;
  private ground!: Phaser.GameObjects.Image;
  private ghost!: Phaser.GameObjects.Image;
  private marker!: Phaser.GameObjects.Graphics;
  private range!: Phaser.GameObjects.Graphics;
  private readonly blockImages = new Map<string, Phaser.GameObjects.Image>();
  private portalSprites: PortalSprite[] = [];
  private portalFrame = 0;
  private traveling = false;
  private down = false;
  private armed = false;
  private nextShotAt = 0;
  private nextMinimapAt = 0;

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
  ) {
    super('game');
    this.mapId = isMapId(session.profile.map) ? session.profile.map : DEFAULT_MAP;
  }

  create() {
    this.createTextures();
    this.ground = this.add.image(0, 0, this.groundTexture(this.mapId)).setOrigin(0, 0).setDepth(DEPTH_GROUND);
    this.showMap(this.mapId);

    const { id, nickname, x, y, hp } = this.session.profile;
    this.me = new Avatar(this, { x, y }, hp);
    this.tags.add(id, nickname);
    this.tags.setHp(id, hp);

    this.bullets = new Bullets(this, {
      isSolid: (tx, ty) => this.world.blockAt(tx, ty) !== undefined,
      targets: () => this.bulletTargets(),
    });

    this.range = this.add.graphics().setDepth(DEPTH_OVERLAY);
    this.marker = this.add.graphics().setDepth(DEPTH_OVERLAY);
    this.ghost = this.add.image(0, 0, `block-${BLOCK_IDS[0]}`).setOrigin(0.5, 1).setVisible(false);

    const cam = this.cameras.main;
    cam.setZoom(ZOOM);
    cam.setBounds(-CAMERA_PAD_X, -CAMERA_PAD_Y, WORLD_W + CAMERA_PAD_X * 2, WORLD_H + CAMERA_PAD_Y * 2);
    cam.startFollow(this.me.sprite, true);

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.hud.isOpen || this.traveling || this.down) return;
      this.updateHover();
      if (pointer.rightButtonDown()) void this.collectBlock();
      else if (pointer.leftButtonDown()) this.useSelectedItem();
    });

    this.drawRange();
    void this.session.connect(this);
    if (this.me.isDown) this.goDown();
  }

  private createTextures() {
    for (const id of BLOCK_IDS) this.textures.addCanvas(`block-${id}`, paintBlock(id));
    this.textures.addCanvas('pistol', paintPistol());
    this.textures.addCanvas('bullet', paintBullet());
    this.textures.addCanvas('smoke', paintSmoke());

    const sheet = this.textures.addCanvas('player', paintCharacterSheet())!;
    for (let i = 0; i < CHAR_STEPS * 2; i++) {
      const view = i < CHAR_STEPS ? 'front' : 'back';
      sheet.add(`${view}-${i % CHAR_STEPS}`, 0, i * CHAR_W, 0, CHAR_W, CHAR_H);
    }
  }

  /** 맵 바닥 그림은 처음 들어갈 때 한 번만 그린다. */
  private groundTexture(id: MapId) {
    const key = `ground-${id}`;
    if (!this.textures.exists(key)) this.textures.addCanvas(key, paintGround(generateMap(MAPS[id].ground)));
    return key;
  }

  private portalTexture(to: MapId, frame: number) {
    const key = `portal-${to}-${frame}`;
    if (!this.textures.exists(key)) this.textures.addCanvas(key, paintPortal(MAPS[to].accent, frame).canvas);
    return key;
  }

  /** 맵 하나를 화면에 올린다. 블록과 다른 플레이어는 서버에서 받아 채운다. */
  private showMap(id: MapId) {
    this.mapId = id;
    const info = MAPS[id];
    this.world = new World(generateMap(info.ground), portalsOf(id));
    this.ground.setTexture(this.groundTexture(id));
    this.minimap.setMap(info.name, info.ground[2]);

    this.portalSprites = this.world.portals.map((portal) => {
      const c = tileCenter(portal.x, portal.y);
      const image = this.add
        .image(c.x, c.y, this.portalTexture(portal.to, 0))
        .setOrigin(0.5, PORTAL_ORIGIN_Y)
        .setDepth(depthOf(portal.x, portal.y));
      const tag = `portal-${portal.to}`;
      this.tags.add(tag, `→ ${MAPS[portal.to].name}`, true);
      return { portal, image, tag };
    });
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
    this.bullets.clear();
  }

  update(time: number) {
    // Phaser의 delta는 포커스가 바뀐 뒤 잠시 16.7ms로 묶여 프레임이 낮으면 움직임이 느려진다.
    const delta = Math.min(this.game.loop.rawDelta, MAX_FRAME_MS);
    this.advancePlayer(delta);
    for (const avatar of this.others.values()) avatar.update(delta);
    this.bullets.update(delta);
    this.updateAim();
    this.animatePortals(time);
    this.updateHover();
    this.placeNameTags();
    this.updateMinimap(time);
  }

  private get canAct() {
    return !this.hud.isOpen && !this.chat.isOpen && !this.traveling && !this.down;
  }

  private advancePlayer(delta: number) {
    this.me.update(delta);
    if (this.traveling || this.down) return;

    if (this.keys.takeDash() && this.canAct) this.dash();

    if (this.me.moving) {
      this.steer();
      return;
    }

    const portal = this.world.portalAt(this.me.tile.x, this.me.tile.y);
    if (portal) {
      this.travel(portal);
      return;
    }
    const dir = this.keys.takeDirection();
    if (dir && this.canAct) this.beginStep(this.me.tile, dir);
  }

  /** 칸 이동을 막 시작했다면 새로 누른 방향으로 바로 튼다. 다음 칸까지 기다리지 않아도 된다. */
  private steer() {
    if (!this.walk || this.me.progress > TURN_WINDOW || !this.canAct) return;
    const dir = this.keys.takeDirection();
    if (!dir || (dir.dx === this.walk.dir.dx && dir.dy === this.walk.dir.dy)) return;
    this.beginStep(this.walk.from, dir);
  }

  private beginStep(from: Tile, dir: Dir) {
    const { dx, dy } = dir;
    this.lastDir = dir;
    if (!this.world.canStep(from, dx, dy)) {
      this.me.face(dx, dy);
      return;
    }
    this.moveTo({ x: from.x + dx, y: from.y + dy }, STEP_MS * Math.hypot(dx, dy));
    this.me.face(dx, dy);
    this.walk = { from, dir };
  }

  /** 누르고 있는 방향으로 DASH_TILES칸 빠르게 나아간다. 벽이나 포탈을 만나면 거기서 멈춘다. */
  private dash() {
    if (this.time.now < this.nextDashAt) return;
    // 방향 입력을 여기서 비워야 대시가 끝난 뒤 한 칸 더 걷지 않는다.
    const dir = this.keys.takeDirection() ?? this.lastDir;
    const { dx, dy } = dir;
    let tile = this.me.tile;
    let moved = 0;
    while (moved < DASH_TILES && this.world.canStep(tile, dx, dy)) {
      tile = { x: tile.x + dx, y: tile.y + dy };
      moved++;
      if (this.world.portalAt(tile.x, tile.y)) break;
    }
    if (moved === 0) return;
    this.nextDashAt = this.time.now + DASH_COOLDOWN_MS;
    this.moveTo(tile, DASH_STEP_MS * moved * Math.hypot(dx, dy), true);
    this.me.face(dx, dy);
    this.lastDir = dir;
    this.walk = null;
  }

  private moveTo(to: Tile, ms: number, dashing = false) {
    if (dashing) this.me.dashTo(to, ms);
    else this.me.stepTo(to, ms);
    this.session.sendMove(to.x, to.y, ms);
    this.session.saveLater(to);
    this.drawRange();
  }

  /** 포탈을 타면 화면을 어둡게 한 사이에 맵을 바꾼다. */
  private travel(portal: Portal) {
    this.traveling = true;
    const cam = this.cameras.main;
    cam.once('camerafadeoutcomplete', () => {
      const tile = arrivalFor(portal, this.mapId);
      this.clearMap();
      this.showMap(portal.to);
      this.me.teleport(tile);
      this.drawRange();
      void this.session.changeMap(portal.to, tile.x, tile.y);
      cam.fadeIn(FADE_MS);
      this.traveling = false;
    });
    cam.fadeOut(FADE_MS);
  }

  private animatePortals(time: number) {
    const frame = Math.floor(time / PORTAL_FRAME_MS) % PORTAL_FRAMES;
    if (frame === this.portalFrame) return;
    this.portalFrame = frame;
    for (const { portal, image } of this.portalSprites) image.setTexture(this.portalTexture(portal.to, frame));
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
  }

  private updateMinimap(time: number) {
    if (time < this.nextMinimapAt) return;
    this.nextMinimapAt = time + MINIMAP_INTERVAL_MS;
    this.minimap.draw({
      me: this.me.tile,
      others: [...this.others.values()].map((avatar) => avatar.tile),
      blocks: this.world.blockTiles(),
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

  /** 무기를 들고 있으면 총을 마우스 쪽으로 겨누고 커서를 조준점으로 바꾼다. */
  private updateAim() {
    const armed = this.selectedWeapon !== null && !this.down;
    if (armed !== this.armed) {
      this.armed = armed;
      this.input.setDefaultCursor(armed ? 'crosshair' : 'default');
      if (!armed) this.me.lowerGun();
    }
    if (!armed) return;
    const w = this.pointerWorld();
    const { x, y } = this.me.sprite;
    this.me.aim(Math.atan2(w.y - (y - BULLET_HEIGHT), w.x - x));
  }

  private useSelectedItem() {
    const weapon = this.selectedWeapon;
    if (weapon) this.shoot(weapon);
    else this.placeBlock();
  }

  private shoot(weapon: WeaponId) {
    const { cooldownMs, range } = WEAPONS[weapon];
    if (this.time.now < this.nextShotAt) return;
    this.nextShotAt = this.time.now + cooldownMs;

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
    this.bullets.fire(this.session.profile.id, fromX, fromY, aim.gx, aim.gy, range, (target) => {
      void this.session.hitPlayer(target);
    });
    this.session.sendShot(fromX, fromY, aim.gx, aim.gy);
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

  /** 체력이 0이 되면 잠시 뒤 맵 중앙에서 다시 시작한다. */
  private goDown() {
    if (this.down) return;
    this.down = true;
    this.hud.showDown(true);
    this.time.delayedCall(RESPAWN_MS, () => void this.respawn());
  }

  private async respawn() {
    if (!(await this.session.respawn())) {
      this.time.delayedCall(RESPAWN_RETRY_MS, () => void this.respawn());
      return;
    }
    const center = Math.floor(MAP_SIZE / 2);
    const tile = { x: center, y: center };
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
    if (this.hud.isOpen) {
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
    if (!this.hoveredGround || (stack && isWeapon(stack.id))) return;
    const { x, y } = this.hoveredGround;
    const ok = stack !== null && this.canPlaceAt(this.hoveredGround);
    this.marker.setDepth(DEPTH_OVERLAY);
    this.strokeTile(x, y, ok ? 0xffffff : 0xff6b5e, 0);

    if (stack) {
      const c = tileCenter(x, y);
      this.ghost
        .setTexture(`block-${stack.id}`)
        .setPosition(c.x, c.y + TILE_H / 2)
        .setDepth(depthOf(x, y))
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
    const c = tileCenter(x, y);
    const image = this.add
      .image(c.x, c.y + TILE_H / 2, `block-${id}`)
      .setOrigin(0.5, 1)
      .setDepth(depthOf(x, y));
    this.blockImages.set(`${x},${y}`, image);
  }

  private removeBlockAt(x: number, y: number) {
    this.world.remove(x, y);
    const key = `${x},${y}`;
    this.blockImages.get(key)?.destroy();
    this.blockImages.delete(key);
  }

  currentTile() {
    return this.me.tile;
  }

  currentHp() {
    return this.me.hp;
  }

  onMove({ id, nickname, x, y, ms, hp }: PlayerMove) {
    let avatar = this.others.get(id);
    if (!avatar) {
      avatar = new Avatar(this, { x, y }, hp);
      this.others.set(id, avatar);
      this.tags.add(id, nickname);
      this.tags.setHp(id, hp);
      return;
    }
    const { tile } = avatar;
    if (tile.x === x && tile.y === y) return;
    const inRange = inReach(tile, { x, y }, DASH_TILES + 1);
    if (!inRange) avatar.teleport({ x, y });
    else if (inReach(tile, { x, y })) avatar.stepTo({ x, y }, ms);
    else avatar.dashTo({ x, y }, ms);
  }

  onShot({ id, fromX, fromY, toX, toY }: PlayerShot) {
    const avatar = this.others.get(id);
    if (!avatar) return;
    const from = gridToWorld(fromX, fromY);
    const to = gridToWorld(toX, toY);
    avatar.aim(Math.atan2(to.y - from.y, to.x - from.x), REMOTE_AIM_MS);
    this.bullets.fire(id, fromX, fromY, toX, toY, WEAPONS.pistol.range);
  }

  onHp(id: string, hp: number) {
    if (id === this.session.profile.id) {
      this.setMyHp(hp);
      return;
    }
    this.others.get(id)?.setHp(hp);
    this.tags.setHp(id, hp);
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
