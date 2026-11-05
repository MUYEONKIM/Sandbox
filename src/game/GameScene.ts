import Phaser from 'phaser';
import { CHAR_H, CHAR_STEPS, CHAR_W, paintCharacterSheet } from '../art/character';
import { paintGround, WORLD_H, WORLD_W } from '../art/ground';
import {
  paintBanner,
  paintBarrel,
  paintCrate,
  paintFence,
  paintHouse,
  paintPine,
  paintTree,
  type Art,
} from '../art/props';
import { BLOCK_IDS, paintBlock, type BlockId } from '../blocks';
import { BLOCK_HEIGHT, MAP_SIZE, PLACE_RANGE, STEP_MS, TILE_H, TILE_W, ZOOM } from '../config';
import { depthOf, gridToWorld, tileCenter, worldToGrid } from '../iso';
import type { ChatMessage, GameSession, PlacedBlock, PlayerMove, SessionEvents } from '../net/session';
import type { ChatBox } from '../ui/chat';
import type { Hud } from '../ui/hud';
import type { NameTags } from '../ui/nametags';
import { Avatar } from './avatar';
import type { Inventory } from './inventory';
import type { Dir, Keys } from './keys';
import { generateMap, type House } from './map';
import { inReach, World, type Tile } from './world';

const DEPTH_GROUND = 0;
const DEPTH_OVERLAY = 1;

/** 닉네임을 띄울 높이: 발에서 머리 위까지 (아트 픽셀) */
const HEAD_HEIGHT = 30;

export class GameScene extends Phaser.Scene implements SessionEvents {
  readonly world = new World(generateMap());
  private me!: Avatar;
  private readonly others = new Map<string, Avatar>();
  private ghost!: Phaser.GameObjects.Image;
  private marker!: Phaser.GameObjects.Graphics;
  private range!: Phaser.GameObjects.Graphics;
  private readonly blockImages = new Map<string, Phaser.GameObjects.Image>();

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
    private readonly session: GameSession,
  ) {
    super('game');
  }

  create() {
    this.createTextures();
    this.add.image(0, 0, 'ground').setOrigin(0, 0).setDepth(DEPTH_GROUND);
    if (this.world.map.house) this.createHouse(this.world.map.house);
    this.createProps();

    const { id, nickname, x, y } = this.session.profile;
    this.me = new Avatar(this, { x, y });
    this.tags.add(id, nickname);

    this.range = this.add.graphics().setDepth(DEPTH_OVERLAY);
    this.marker = this.add.graphics().setDepth(DEPTH_OVERLAY);
    this.ghost = this.add.image(0, 0, `block-${BLOCK_IDS[0]}`).setOrigin(0.5, 1).setVisible(false);

    const cam = this.cameras.main;
    cam.setZoom(ZOOM);
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.startFollow(this.me.sprite, true);

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.hud.isOpen) return;
      this.updateHover();
      if (pointer.rightButtonDown()) void this.collectBlock();
      else if (pointer.leftButtonDown()) this.placeBlock();
    });

    this.drawRange();
    void this.session.connect(this);
  }

  private createTextures() {
    const map = this.world.map;
    this.textures.addCanvas('ground', paintGround(map));
    for (const id of BLOCK_IDS) this.textures.addCanvas(`block-${id}`, paintBlock(id));

    const sheet = this.textures.addCanvas('player', paintCharacterSheet())!;
    for (let i = 0; i < CHAR_STEPS * 2; i++) {
      const view = i < CHAR_STEPS ? 'front' : 'back';
      sheet.add(`${view}-${i % CHAR_STEPS}`, 0, i * CHAR_W, 0, CHAR_W, CHAR_H);
    }
  }

  private addArt(key: string, art: Art, x: number, y: number) {
    if (!this.textures.exists(key)) this.textures.addCanvas(key, art.canvas);
    const c = tileCenter(x, y);
    this.add
      .image(c.x, c.y, key)
      .setOrigin(art.ax / art.canvas.width, art.ay / art.canvas.height)
      .setDepth(depthOf(x, y));
  }

  private createProps() {
    const paint = {
      tree: paintTree,
      pine: paintPine,
      barrel: paintBarrel,
      crate: paintCrate,
      banner: paintBanner,
    };
    for (const prop of this.world.map.props) {
      const key = `${prop.kind}-${prop.variant}`;
      this.addArt(key, paint[prop.kind](prop.variant), prop.x, prop.y);
    }
    for (const fence of this.world.map.fences) {
      this.addArt(`fence-${fence.mask}`, paintFence(fence.mask), fence.x, fence.y);
    }
  }

  /**
   * 집은 여러 칸을 차지해서 깊이 값 하나로는 앞뒤를 가릴 수 없다.
   * 화면 세로줄 단위로 잘라 줄마다 가장 앞쪽 칸의 깊이를 준다.
   */
  private createHouse(house: House) {
    const art = paintHouse(house.w, house.d);
    const texture = this.textures.addCanvas('house', art.canvas)!;
    const stripW = TILE_W / 2;
    const corner = gridToWorld(house.x, house.y);
    const left = corner.x - art.ox;
    const top = corner.y - art.oy;
    const firstColumn = -house.d;
    const lastColumn = house.w;

    const frontmost = (column: number) => {
      const c = Math.max(firstColumn, Math.min(lastColumn - 1, column));
      let best = 0;
      for (let j = 0; j < house.d; j++) {
        for (let i = 0; i < house.w; i++) {
          if (i - j === c || i - j === c + 1) best = Math.max(best, i + j);
        }
      }
      return best;
    };

    for (let sx = 0; sx < art.canvas.width; sx += stripW) {
      const column = Math.floor((sx - art.ox) / stripW);
      const name = `strip-${sx}`;
      texture.add(name, 0, sx, 0, stripW, art.canvas.height);
      this.add
        .image(left + sx, top, 'house', name)
        .setOrigin(0, 0)
        .setDepth(depthOf(house.x + frontmost(column), house.y));
    }
  }

  update(_time: number, delta: number) {
    this.advancePlayer(delta);
    for (const avatar of this.others.values()) avatar.update(delta);
    this.updateHover();
    this.placeNameTags();
  }

  private advancePlayer(delta: number) {
    this.me.update(delta);
    if (this.me.moving) return;
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

  private placeNameTags() {
    const cam = this.cameras.main;
    const place = (id: string, avatar: Avatar) => {
      const x = (avatar.sprite.x - cam.worldView.x) * cam.zoom;
      const y = (avatar.sprite.y - HEAD_HEIGHT - cam.worldView.y) * cam.zoom;
      this.tags.place(id, x, y);
    };
    place(this.session.profile.id, this.me);
    for (const [id, avatar] of this.others) place(id, avatar);
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
    this.spawnBlock(target, id);
    void this.session.placeBlock(target.x, target.y, id).then((placed) => {
      if (placed) return;
      this.removeBlockAt(target.x, target.y);
      this.inventory.add(id);
      void this.session.syncBlocks();
    });
  }

  private async collectBlock() {
    const target = this.hoveredBlock;
    if (!target || !inReach(this.me.tile, target)) return;
    const id = this.world.blockAt(target.x, target.y);
    if (!id || !this.inventory.canAdd(id)) return;

    const removed = await this.session.removeBlock(target.x, target.y);
    if (!removed) return;
    this.removeBlockAt(target.x, target.y);
    this.inventory.add(removed);
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
