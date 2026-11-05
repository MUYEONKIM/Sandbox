import Phaser from 'phaser';
import { paintCharacterSheet, CHAR_FOOT_Y, CHAR_H, CHAR_STEPS, CHAR_W } from '../art/character';
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
import type { ChatBox } from '../ui/chat';
import type { Hud } from '../ui/hud';
import type { Inventory } from './inventory';
import type { Dir, Keys } from './keys';
import { generateMap, type House } from './map';
import { inReach, World, type Tile } from './world';

const DEPTH_GROUND = 0;
const DEPTH_OVERLAY = 1;

/** 말풍선을 띄울 높이: 발에서 머리 위까지 (아트 픽셀) */
const HEAD_HEIGHT = 30;

interface Step {
  from: Tile;
  to: Tile;
  t: number;
  ms: number;
}

export class GameScene extends Phaser.Scene {
  readonly world = new World(generateMap());
  private player!: Phaser.GameObjects.Image;
  private ghost!: Phaser.GameObjects.Image;
  private marker!: Phaser.GameObjects.Graphics;
  private range!: Phaser.GameObjects.Graphics;
  private readonly blockImages = new Map<string, Phaser.GameObjects.Image>();

  tile: Tile = { ...this.world.map.spawn };
  private step: Step | null = null;
  private facing: Pick<Dir, 'view' | 'flip'> = { view: 'front', flip: false };
  private leftFoot = true;

  /** 마우스가 가리키는 설치된 블록 */
  private hoveredBlock: Tile | null = null;
  /** 마우스가 가리키는 빈 바닥 칸 */
  private hoveredGround: Tile | null = null;

  constructor(
    private readonly inventory: Inventory,
    private readonly hud: Hud,
    private readonly keys: Keys,
    private readonly chat: ChatBox,
  ) {
    super('game');
  }

  create() {
    this.createTextures();
    this.add.image(0, 0, 'ground').setOrigin(0, 0).setDepth(DEPTH_GROUND);
    if (this.world.map.house) this.createHouse(this.world.map.house);
    this.createProps();

    this.player = this.add.image(0, 0, 'player', 'front-0').setOrigin(0.5, CHAR_FOOT_Y / CHAR_H);
    this.range = this.add.graphics().setDepth(DEPTH_OVERLAY);
    this.marker = this.add.graphics().setDepth(DEPTH_OVERLAY);
    this.ghost = this.add.image(0, 0, `block-${BLOCK_IDS[0]}`).setOrigin(0.5, 1).setVisible(false);

    const cam = this.cameras.main;
    cam.setZoom(ZOOM);
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.startFollow(this.player, true);

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.hud.isOpen) return;
      this.updateHover();
      if (pointer.rightButtonDown()) this.collectBlock();
      else if (pointer.leftButtonDown()) this.placeBlock();
    });

    this.drawRange();
    this.syncPlayer();
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
    this.updateHover();

    const cam = this.cameras.main;
    this.chat.moveBubble(
      (this.player.x - cam.worldView.x) * cam.zoom,
      (this.player.y - HEAD_HEIGHT - cam.worldView.y) * cam.zoom,
    );
  }

  private advancePlayer(delta: number) {
    if (this.step) {
      this.step.t += delta / this.step.ms;
      if (this.step.t >= 1) this.step = null;
    }
    if (!this.step) {
      const dir = this.keys.takeDirection();
      if (dir && !this.hud.isOpen && !this.chat.isOpen) this.beginStep(dir);
    }
    this.syncPlayer();
  }

  private beginStep(dir: Dir) {
    this.facing = dir;
    if (!this.world.canStep(this.tile, dir.dx, dir.dy)) return;
    const to = { x: this.tile.x + dir.dx, y: this.tile.y + dir.dy };
    this.step = { from: this.tile, to, t: 0, ms: STEP_MS * Math.hypot(dir.dx, dir.dy) };
    this.tile = to;
    this.leftFoot = !this.leftFoot;
    this.drawRange();
  }

  private syncPlayer() {
    const s = this.step;
    const gx = s ? s.from.x + (s.to.x - s.from.x) * s.t : this.tile.x;
    const gy = s ? s.from.y + (s.to.y - s.from.y) * s.t : this.tile.y;
    const pos = gridToWorld(gx + 0.5, gy + 0.5);
    const frame = s && s.t < 0.5 ? (this.leftFoot ? 1 : 2) : 0;
    this.player
      .setPosition(pos.x, pos.y)
      .setFrame(`${this.facing.view}-${frame}`)
      .setFlipX(this.facing.flip)
      .setDepth(depthOf(gx, gy) + 1);
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

  private drawHover() {
    this.marker.clear();
    this.ghost.setVisible(false);

    if (this.hoveredBlock) {
      const { x, y } = this.hoveredBlock;
      const ok = inReach(this.tile, this.hoveredBlock);
      this.marker.setDepth(depthOf(x, y) + 2);
      this.strokeTile(x, y, ok ? 0xffffff : 0xff6b5e, -BLOCK_HEIGHT);
      return;
    }

    if (!this.hoveredGround) return;
    const { x, y } = this.hoveredGround;
    const stack = this.inventory.selectedStack;
    const ok = stack !== null && this.world.canPlace(this.hoveredGround, this.tile);
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
    const x0 = clamp(this.tile.x - PLACE_RANGE);
    const y0 = clamp(this.tile.y - PLACE_RANGE);
    const x1 = clamp(this.tile.x + PLACE_RANGE + 1);
    const y1 = clamp(this.tile.y + PLACE_RANGE + 1);
    const pts = [gridToWorld(x0, y0), gridToWorld(x1, y0), gridToWorld(x1, y1), gridToWorld(x0, y1)];

    this.range.clear();
    this.range.fillStyle(0xffffff, 0.05).lineStyle(1, 0xffffff, 0.5).beginPath();
    this.range.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) this.range.lineTo(p.x, p.y);
    this.range.closePath().fillPath().strokePath();
  }

  private placeBlock() {
    const target = this.hoveredGround;
    if (!target || !this.inventory.selectedStack) return;
    if (!this.world.canPlace(target, this.tile)) return;
    const id = this.inventory.takeSelected();
    if (id) this.spawnBlock(target, id);
  }

  private collectBlock() {
    const target = this.hoveredBlock;
    if (!target || !inReach(this.tile, target)) return;
    const id = this.world.blockAt(target.x, target.y);
    if (!id || !this.inventory.add(id)) return;
    this.world.remove(target.x, target.y);
    const key = `${target.x},${target.y}`;
    this.blockImages.get(key)?.destroy();
    this.blockImages.delete(key);
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
}
