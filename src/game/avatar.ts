import type Phaser from 'phaser';
import { CHAR_FOOT_Y, CHAR_H } from '../art/character';
import { depthOf, gridToWorld } from '../iso';
import type { Tile } from './world';

/** 맵 위의 캐릭터 하나. 내 캐릭터와 다른 플레이어가 함께 쓴다. */
export class Avatar {
  private readonly image: Phaser.GameObjects.Image;
  private from: Tile;
  private t = 1;
  private ms = 1;
  private view: 'front' | 'back' = 'front';
  private flip = false;
  private leftFoot = true;

  constructor(
    scene: Phaser.Scene,
    public tile: Tile,
  ) {
    this.from = tile;
    this.image = scene.add.image(0, 0, 'player', 'front-0').setOrigin(0.5, CHAR_FOOT_Y / CHAR_H);
    this.sync();
  }

  get sprite() {
    return this.image;
  }

  get moving() {
    return this.t < 1;
  }

  /** 격자 이동 방향으로 몸을 돌린다. 화면에서 위쪽이면 등을, 왼쪽이면 뒤집은 그림을 쓴다. */
  face(dx: number, dy: number) {
    if (!dx && !dy) return;
    this.view = dx + dy < 0 ? 'back' : 'front';
    this.flip = dx - dy < 0;
  }

  stepTo(to: Tile, ms: number) {
    this.face(to.x - this.tile.x, to.y - this.tile.y);
    this.from = this.position();
    this.tile = to;
    this.t = ms > 0 ? 0 : 1;
    this.ms = ms;
    this.leftFoot = !this.leftFoot;
  }

  private position(): Tile {
    return {
      x: this.from.x + (this.tile.x - this.from.x) * this.t,
      y: this.from.y + (this.tile.y - this.from.y) * this.t,
    };
  }

  update(delta: number) {
    if (this.t < 1) this.t = Math.min(1, this.t + delta / this.ms);
    this.sync();
  }

  private sync() {
    const { x, y } = this.position();
    const pos = gridToWorld(x + 0.5, y + 0.5);
    const frame = this.t < 0.5 ? (this.leftFoot ? 1 : 2) : 0;
    this.image
      .setPosition(pos.x, pos.y)
      .setFrame(`${this.view}-${frame}`)
      .setFlipX(this.flip)
      .setDepth(depthOf(x, y) + 1);
  }

  destroy() {
    this.image.destroy();
  }
}
