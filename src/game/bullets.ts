import type Phaser from 'phaser';
import { MAP_SIZE } from '../config';
import { depthOf, gridToWorld } from '../iso';

/** 총알이 땅에서 떠 있는 높이 (아트 픽셀) */
export const BULLET_HEIGHT = 14;

/** 초당 날아가는 칸 수 */
const SPEED = 16;
/** 한 번에 검사하는 거리. 프레임이 끊겨도 벽이나 사람을 뚫지 않게 잘게 나눈다. */
const CHECK_STEP = 0.2;
const HIT_RADIUS = 0.55;

export interface BulletTarget {
  id: string;
  x: number;
  y: number;
}

export interface BulletWorld {
  isSolid(x: number, y: number): boolean;
  targets(): BulletTarget[];
}

interface Bullet {
  x: number;
  y: number;
  dx: number;
  dy: number;
  left: number;
  ownerId: string;
  onHit?: (targetId: string) => void;
  image: Phaser.GameObjects.Image;
}

/** 날아가는 총알 전체. 격자 좌표로 움직이고, 벽이나 사람에 닿으면 사라진다. */
export class Bullets {
  private bullets: Bullet[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: BulletWorld,
  ) {}

  /** (fromX, fromY)에서 (toX, toY) 쪽으로 쏜다. onHit은 내가 쏜 총알에만 준다. */
  fire(
    ownerId: string,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    range: number,
    onHit?: (targetId: string) => void,
  ) {
    const length = Math.hypot(toX - fromX, toY - fromY);
    if (length === 0) return;
    const dx = (toX - fromX) / length;
    const dy = (toY - fromY) / length;

    const start = gridToWorld(fromX, fromY);
    const ahead = gridToWorld(fromX + dx, fromY + dy);
    const image = this.scene.add.image(0, 0, 'bullet');
    image.setRotation(Math.atan2(ahead.y - start.y, ahead.x - start.x));

    const bullet = { x: fromX, y: fromY, dx, dy, left: range, ownerId, onHit, image };
    this.bullets.push(bullet);
    this.place(bullet);
  }

  private place(bullet: Bullet) {
    const pos = gridToWorld(bullet.x, bullet.y);
    bullet.image
      .setPosition(pos.x, pos.y - BULLET_HEIGHT)
      .setDepth(depthOf(bullet.x - 0.5, bullet.y - 0.5) + 2);
  }

  update(delta: number) {
    const travel = (SPEED * delta) / 1000;
    this.bullets = this.bullets.filter((bullet) => {
      const alive = this.advance(bullet, travel);
      if (alive) this.place(bullet);
      else bullet.image.destroy();
      return alive;
    });
  }

  /** 총알을 움직이고, 계속 날아가면 true를 돌려준다. */
  private advance(bullet: Bullet, distance: number) {
    for (let moved = 0; moved < distance; moved += CHECK_STEP) {
      bullet.x += bullet.dx * CHECK_STEP;
      bullet.y += bullet.dy * CHECK_STEP;
      bullet.left -= CHECK_STEP;

      const inside = bullet.x >= 0 && bullet.y >= 0 && bullet.x < MAP_SIZE && bullet.y < MAP_SIZE;
      if (!inside || bullet.left <= 0) return false;
      if (this.world.isSolid(Math.floor(bullet.x), Math.floor(bullet.y))) return false;

      for (const target of this.world.targets()) {
        if (target.id === bullet.ownerId) continue;
        if (Math.hypot(bullet.x - target.x, bullet.y - target.y) > HIT_RADIUS) continue;
        bullet.onHit?.(target.id);
        return false;
      }
    }
    return true;
  }

  clear() {
    for (const bullet of this.bullets) bullet.image.destroy();
    this.bullets = [];
  }
}
