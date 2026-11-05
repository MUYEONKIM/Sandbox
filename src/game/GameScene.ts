import Phaser from 'phaser';
import { CHAR_H, CHAR_STEPS, CHAR_W, paintCharacterSheet } from '../art/character';
import { paintGround, WORLD_H, WORLD_W } from '../art/ground';
import { paintPortal, PORTAL_FRAMES, PORTAL_ORIGIN_Y } from '../art/props';
import { BLOCK_IDS, paintBlock, type BlockId } from '../blocks';
import { BLOCK_HEIGHT, MAP_SIZE, PLACE_RANGE, STEP_MS, TILE_H, TILE_W, ZOOM } from '../config';
import { depthOf, gridToWorld, tileCenter, worldToGrid } from '../iso';
import type { ChatMessage, GameSession, PlacedBlock, PlayerMove, SessionEvents } from '../net/session';
import type { ChatBox } from '../ui/chat';
import type { Hud } from '../ui/hud';
import type { Minimap } from '../ui/minimap';
import type { NameTags } from '../ui/nametags';
import { Avatar } from './avatar';
import type { Inventory } from './inventory';
import type { Dir, Keys } from './keys';
import { generateMap } from './map';
import { arrivalFor, DEFAULT_MAP, isMapId, MAPS, portalsOf, type MapId, type Portal } from './maps';
import { inReach, World, type Tile } from './world';

const DEPTH_GROUND = 0;
const DEPTH_OVERLAY = 1;

/** 닉네임을 띄울 높이: 발에서 머리 위까지 (아트 픽셀) */
const HEAD_HEIGHT = 30;
const PORTAL_TAG_HEIGHT = 48;
const PORTAL_FRAME_MS = 140;

/** 맵 가장자리에서도 캐릭터가 화면 UI에 가리지 않도록 카메라에 주는 여백 (아트 픽셀) */
const CAMERA_PAD_X = 80;
const CAMERA_PAD_Y = 110;

const FADE_MS = 200;
const MINIMAP_INTERVAL_MS = 100;

interface PortalSprite {
  portal: Portal;
  image: Phaser.GameObjects.Image;
  tag: string;
}

export class GameScene extends Phaser.Scene implements SessionEvents {
  world!: World;
  private mapId: MapId;
  private me!: Avatar;
  private readonly others = new Map<string, Avatar>();
  private ground!: Phaser.GameObjects.Image;
  private ghost!: Phaser.GameObjects.Image;
  private marker!: Phaser.GameObjects.Graphics;
  private range!: Phaser.GameObjects.Graphics;
  private readonly blockImages = new Map<string, Phaser.GameObjects.Image>();
  private portalSprites: PortalSprite[] = [];
  private portalFrame = 0;
  private traveling = false;
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

    const { id, nickname, x, y } = this.session.profile;
    this.me = new Avatar(this, { x, y });
    this.tags.add(id, nickname);

    this.range = this.add.graphics().setDepth(DEPTH_OVERLAY);
    this.marker = this.add.graphics().setDepth(DEPTH_OVERLAY);
    this.ghost = this.add.image(0, 0, `block-${BLOCK_IDS[0]}`).setOrigin(0.5, 1).setVisible(false);

    const cam = this.cameras.main;
    cam.setZoom(ZOOM);
    cam.setBounds(-CAMERA_PAD_X, -CAMERA_PAD_Y, WORLD_W + CAMERA_PAD_X * 2, WORLD_H + CAMERA_PAD_Y * 2);
    cam.startFollow(this.me.sprite, true);

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.hud.isOpen || this.traveling) return;
      this.updateHover();
      if (pointer.rightButtonDown()) void this.collectBlock();
      else if (pointer.leftButtonDown()) this.placeBlock();
    });

    this.drawRange();
    void this.session.connect(this);
  }

  private createTextures() {
    for (const id of BLOCK_IDS) this.textures.addCanvas(`block-${id}`, paintBlock(id));

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
  }

  update(time: number, delta: number) {
    this.advancePlayer(delta);
    for (const avatar of this.others.values()) avatar.update(delta);
    this.animatePortals(time);
    this.updateHover();
    this.placeNameTags();
    this.updateMinimap(time);
  }

  private advancePlayer(delta: number) {
    this.me.update(delta);
    if (this.me.moving || this.traveling) return;

    const portal = this.world.portalAt(this.me.tile.x, this.me.tile.y);
    if (portal) {
      this.travel(portal);
      return;
    }
    const dir = this.keys.takeDirection();
    if (dir && !this.hud.isOpen && !this.chat.isOpen) this.beginStep(dir);
  }

  private beginStep({ dx, dy }: Dir) {
    const from = this.me.tile;
    if (!this.world.canStep(from, dx, dy)) {
      this.me.face(dx, dy);
      return;
    }
    const to = { x: from.x + dx, y: from.y + dy };
    const ms = STEP_MS * Math.hypot(dx, dy);
    this.me.stepTo(to, ms);
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

    if (!this.hoveredGround) return;
    const { x, y } = this.hoveredGround;
    const stack = this.inventory.selectedStack;
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
    if (!target || !this.inventory.selectedStack || !this.canPlaceAt(target)) return;
    const id = this.inventory.takeSelected();
    if (!id) return;

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

  onMove({ id, nickname, x, y, ms }: PlayerMove) {
    let avatar = this.others.get(id);
    if (!avatar) {
      avatar = new Avatar(this, { x, y });
      this.others.set(id, avatar);
      this.tags.add(id, nickname);
      return;
    }
    const { tile } = avatar;
    if (tile.x === x && tile.y === y) return;
    const adjacent = inReach(tile, { x, y });
    avatar.stepTo({ x, y }, adjacent ? ms : 0);
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
