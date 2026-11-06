import type Phaser from 'phaser';
import { paintFish, paintTool, type ToolArt } from '../art/tools';
import { tileCenter } from '../iso';
import type { Avatar } from './avatar';
import type { WorkId } from './maps';
import type { Tile } from './world';

const PIXEL = 'work-pixel';
const FISH = 'work-fish';

/** 한 번에 화면에 띄우는 조각 수의 상한 */
const MAX_PARTICLES = 120;
/** 건물이나 나무에 가리지 않도록 효과는 맵의 모든 것보다 앞에 그린다. */
const FX_DEPTH = 5000;
const FADE_MS = 140;

/** 바닥과 자원에 묻히지 않도록 밝은 색과 어두운 색을 섞는다. */
const STONE = [0xf0f0f6, 0xc8c8d2, 0x4a4a55];
const SPARK = [0xffb52e, 0xfff07a];
const DUST = [0xf5efe2, 0xe0d8c6];
const WOOD = [0xf0c98a, 0xc98f4e, 0x7b4d2c];
const LEAF = [0x8fdc5a, 0x4fb03f, 0x2f7a33];
const GRAIN = [0xffe46a, 0xf2c23e, 0xb7e05a];
const SOIL = [0x9c6a3f, 0x5f3f28];
const WATER = [0xffffff, 0xd6f4fb, 0x8fd8ee];
const GOLD = [0xffe14d, 0xffd24a, 0xffffff];

/** 도구를 휘두르는 동작. 각도는 위가 0이고 앞쪽이 양수다. */
interface Swing {
  strikeMs: number;
  rest: number;
  raised: number;
  hit: number;
  /** 내리칠 때 몸이 앞으로 나가는 거리 (아트 픽셀) */
  lunge: number;
}

const SWINGS: Record<Exclude<WorkId, 'fishing'>, Swing> = {
  quarry: { strikeMs: 520, rest: 0.6, raised: -1.25, hit: 1.75, lunge: 3 },
  logging: { strikeMs: 600, rest: 0.5, raised: -1.1, hit: 1.45, lunge: 3 },
  gathering: { strikeMs: 420, rest: 0.3, raised: -0.5, hit: 1.5, lunge: 2 },
};

/** 한 번의 동작에서 다시 내리기 시작하는 지점과 맞는 지점 (0~1) */
const WINDUP_END = 0.5;
const IMPACT = 0.68;

const SHAKE_MS = 170;

/** 낚싯대를 던지는 시간과, 찌를 무는 때 (채집 시간에 대한 비율) */
const CAST_MS = 340;
const BITE_FROM = 0.72;
const RIPPLE_MS = 800;
const BITE_RIPPLE_MS = 200;

interface Burst {
  colors: number[];
  count: number;
  speed: number;
  up?: number;
  gravity?: number;
  life?: number;
  size?: number;
  /** 튕겨 오를 바닥 높이 */
  floor?: number;
  spread?: number;
}

interface Particle {
  image: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  life: number;
  floor: number | null;
  /** 있으면 캐릭터에게 날아간다. */
  flight: { fromX: number; fromY: number; total: number; to: Avatar } | null;
}

interface Job {
  place: WorkId;
  avatar: Avatar;
  center: { x: number; y: number };
  target: Phaser.GameObjects.Image | null;
  base: { x: number; y: number };
  gatherMs: number;
  tool: ToolArt;
  elapsed: number;
  hits: number;
  shake: number;
  nextRipple: number;
  cast: boolean;
}

const pick = (colors: number[]) => colors[Math.floor(Math.random() * colors.length)];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - (1 - t) ** 2;
const easeIn = (t: number) => t ** 2;

/** 채집 동작: 도구를 휘두르고, 자원이 흔들리고, 주변 지형에서 조각이 튄다. 그림은 코드로 그린 작은 점들이다. */
export class WorkFx {
  private job: Job | null = null;
  private tool: Phaser.GameObjects.Image | null = null;
  private line: Phaser.GameObjects.Graphics | null = null;
  private particles: Particle[] = [];
  private readonly pool: Phaser.GameObjects.Image[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  private texture(key: string, paint: () => HTMLCanvasElement) {
    if (!this.scene.textures.exists(key)) this.scene.textures.addCanvas(key, paint());
    return key;
  }

  start(place: WorkId, avatar: Avatar, spot: Tile, target: Phaser.GameObjects.Image | null, gatherMs: number) {
    this.stop();
    const tool = paintTool(place);
    this.texture(PIXEL, () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#fff';
      context.fillRect(0, 0, 1, 1);
      return canvas;
    });
    const key = this.texture(`work-tool-${place}`, () => tool.canvas);
    this.tool ??= this.scene.add.image(0, 0, key);
    this.tool
      .setTexture(key)
      .setOrigin(tool.grip.x / tool.canvas.width, tool.grip.y / tool.canvas.height)
      .setVisible(true);
    this.line ??= this.scene.add.graphics();

    this.job = {
      place,
      avatar,
      center: tileCenter(spot.x, spot.y),
      target,
      base: target ? { x: target.x, y: target.y } : { x: 0, y: 0 },
      gatherMs,
      tool,
      elapsed: 0,
      hits: 0,
      shake: 0,
      nextRipple: CAST_MS + RIPPLE_MS,
      cast: false,
    };
  }

  stop() {
    const { job } = this;
    if (!job) return;
    this.job = null;
    job.avatar.pose(0, 0, 0);
    job.target?.setPosition(job.base.x, job.base.y).setRotation(0);
    this.tool?.setVisible(false);
    this.line?.clear();
  }

  /** 맵을 떠날 때 부른다. */
  clear() {
    this.stop();
    for (const { image } of this.particles) this.release(image);
    this.particles = [];
  }

  update(delta: number) {
    this.stepParticles(delta);
    const { job } = this;
    if (!job) return;
    job.elapsed += delta;
    if (job.place === 'fishing') this.fish(job);
    else this.strike(job, SWINGS[job.place], delta);
  }

  /** 자원을 얻었을 때 터지는 마무리 효과 */
  finish(rare: boolean) {
    const { job } = this;
    if (!job) return;
    const { x, y } = job.place === 'fishing' ? job.base : job.center;
    const from = { x, y: y - 8 };
    if (job.place === 'fishing') {
      this.burst(from.x, from.y, { colors: WATER, count: 22, speed: 90, up: 120, life: 620, floor: y, size: 3 });
      this.ring(x, y, 46, WATER);
      this.fly(job, from, FISH);
    } else {
      const colors = { quarry: STONE, logging: WOOD, gathering: GRAIN }[job.place];
      this.burst(from.x, from.y, { colors, count: 16, speed: 90, up: 110, size: 3, floor: y + 8, life: 560 });
      this.fly(job, from, PIXEL, colors[0]);
    }
    if (!rare) return;
    this.burst(from.x, from.y, { colors: GOLD, count: 22, speed: 100, up: 130, gravity: 130, life: 720, size: 2 });
    this.scene.cameras.main.shake(120, 0.004);
  }

  private strike(job: Job, swing: Swing, delta: number) {
    const count = job.elapsed / swing.strikeMs;
    const phase = count % 1;
    const hit = Math.floor(count + (1 - IMPACT));
    if (hit > job.hits) {
      job.hits = hit;
      job.shake = SHAKE_MS;
      this.impact(job);
    }

    const { rest, raised, hit: down, lunge } = swing;
    let angle: number;
    let forward: number;
    if (phase < WINDUP_END) {
      const t = easeOut(phase / WINDUP_END);
      angle = lerp(rest, raised, t);
      forward = -t;
    } else if (phase < IMPACT) {
      const t = easeIn((phase - WINDUP_END) / (IMPACT - WINDUP_END));
      angle = lerp(raised, down, t);
      forward = lerp(-1, lunge, t);
    } else {
      const t = (phase - IMPACT) / (1 - IMPACT);
      angle = lerp(down, rest, t);
      forward = lerp(lunge, 0, t);
    }

    const side = job.avatar.facing;
    job.avatar.pose(side * forward, phase < WINDUP_END ? -1 : 0, side * forward * 0.03);
    this.placeTool(job, angle);

    job.shake = Math.max(0, job.shake - delta);
    const { target, base } = job;
    if (!target) return;
    const wobble = Math.sin((job.shake / SHAKE_MS) * Math.PI * 4) * (job.shake / SHAKE_MS);
    if (job.place === 'logging') target.setRotation(wobble * 0.05);
    else target.setPosition(Math.round(base.x + wobble * 2), base.y);
  }

  /** 도구가 닿는 순간: 자원에서 조각이 튀고 캐릭터 주변 땅이 들썩인다. */
  private impact(job: Job) {
    const { x, y } = job.center;
    const foot = job.avatar.sprite;
    if (job.place === 'quarry') {
      this.burst(x, y - 10, { colors: STONE, count: 10, speed: 80, up: 95, size: 3, floor: y + 8, life: 520 });
      this.burst(x, y - 10, { colors: SPARK, count: 6, speed: 110, up: 60, life: 260, gravity: 60, size: 2 });
      this.ring(x, y, 46, DUST);
      this.hopGround(foot, STONE);
    } else if (job.place === 'logging') {
      this.burst(x, y - 8, { colors: WOOD, count: 10, speed: 75, up: 85, size: 3, floor: y + 8, life: 520 });
      this.burst(x, y - 46, { colors: LEAF, count: 7, speed: 16, up: -6, gravity: 30, life: 1000, size: 3, spread: 26 });
      this.ring(x, y, 40, DUST);
      this.hopGround(foot, SOIL);
    } else {
      this.burst(x, y - 6, { colors: GRAIN, count: 10, speed: 60, up: 85, gravity: 120, floor: y + 8, size: 2, life: 520 });
      this.burst(x, y, { colors: LEAF, count: 6, speed: 45, up: 60, size: 3, floor: y + 8, spread: 12 });
      this.hopGround(foot, SOIL);
    }
  }

  /** 캐릭터를 둘러싼 칸의 작은 흙과 돌이 튀어 올라 땅이 울리는 것처럼 보인다. */
  private hopGround(foot: { x: number; y: number }, colors: number[]) {
    for (let i = 0; i < 5; i++) {
      const angle = Math.random() * Math.PI * 2;
      const x = foot.x + Math.cos(angle) * (12 + Math.random() * 14);
      const y = foot.y + Math.sin(angle) * (6 + Math.random() * 7);
      this.spawn(x, y, pick(colors), 2, {
        vx: Math.cos(angle) * 8,
        vy: -50 - Math.random() * 40,
        gravity: 260,
        life: 340,
        floor: y,
      });
    }
  }

  private fish(job: Job) {
    const { elapsed, gatherMs, base, target, avatar } = job;
    if (!job.cast && elapsed >= CAST_MS) {
      job.cast = true;
      this.burst(base.x, base.y, { colors: WATER, count: 12, speed: 50, up: 85, life: 440, floor: base.y, size: 2 });
      this.ring(base.x, base.y, 30, WATER);
    }

    const cycle = (elapsed % gatherMs) / gatherMs;
    const biting = job.cast && cycle > BITE_FROM;
    let bob = Math.sin(elapsed / 420);
    if (biting) bob = 3 * Math.abs(Math.sin(elapsed / 55));
    target?.setPosition(base.x, Math.round(base.y + bob));

    if (biting) job.nextRipple = Math.min(job.nextRipple, elapsed + BITE_RIPPLE_MS);
    if (job.cast && elapsed >= job.nextRipple) {
      job.nextRipple = elapsed + (biting ? BITE_RIPPLE_MS : RIPPLE_MS);
      this.ring(base.x, base.y, biting ? 26 : 18, WATER);
      if (biting) this.burst(base.x, base.y, { colors: WATER, count: 5, speed: 36, up: 60, life: 320, floor: base.y, size: 2 });
    }

    let angle: number;
    if (job.cast) angle = 0.95 + (biting ? Math.sin(elapsed / 60) * 0.22 : Math.sin(elapsed / 520) * 0.04);
    else angle = lerp(-1.1, 0.95, easeIn(elapsed / CAST_MS));
    avatar.pose(biting ? avatar.facing * -1 : 0, 0, biting ? avatar.facing * -0.05 : 0);

    const tip = this.placeTool(job, angle);
    const line = this.line!;
    line.clear();
    if (job.cast) {
      line.setDepth(FX_DEPTH);
      line.lineStyle(1, 0xf2f2f2, 0.8).lineBetween(tip.x, tip.y, base.x, base.y + bob - 8);
    }
  }

  /** 도구를 손에 쥐어 그리고, 끝 위치를 돌려준다. */
  private placeTool({ avatar, tool }: Job, angle: number) {
    const { sprite: body, facing } = avatar;
    const x = body.x + facing * 6;
    const y = body.y - 13;
    const rotation = facing * angle;
    this.tool!.setPosition(x, y).setRotation(rotation).setFlipX(facing < 0).setDepth(FX_DEPTH);
    return { x: x + Math.sin(rotation) * tool.reach, y: y - Math.cos(rotation) * tool.reach };
  }

  private burst(x: number, y: number, burst: Burst) {
    const { colors, count, speed, up = 0, gravity = 240, life = 420, size = 1, floor, spread = 3 } = burst;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const power = speed * (0.4 + Math.random() * 0.6);
      this.spawn(x + (Math.random() - 0.5) * spread * 2, y + (Math.random() - 0.5) * spread, pick(colors), size, {
        vx: Math.cos(angle) * power,
        vy: Math.sin(angle) * power * 0.5 - up * (0.5 + Math.random() * 0.5),
        gravity,
        life: life * (0.7 + Math.random() * 0.3),
        floor,
      });
    }
  }

  /** 점들이 땅을 따라 퍼지는 마름모꼴 고리. 먼지와 물결에 쓴다. */
  private ring(x: number, y: number, speed: number, colors: number[]) {
    const dots = 18;
    for (let i = 0; i < dots; i++) {
      const angle = (i / dots) * Math.PI * 2;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle) * 0.5;
      this.spawn(x + dx * 4, y + dy * 4, pick(colors), 2, {
        vx: dx * speed,
        vy: dy * speed,
        gravity: 0,
        life: 460,
      });
    }
  }

  /** 얻은 자원이 캐릭터에게 날아간다. */
  private fly(job: Job, from: { x: number; y: number }, key: string, color?: number) {
    if (key === FISH) this.texture(FISH, paintFish);
    const particle = this.spawn(from.x, from.y, color ?? null, color === undefined ? 1 : 4, {
      vx: 0,
      vy: 0,
      gravity: 0,
      life: 420,
      texture: key,
    });
    if (particle) particle.flight = { fromX: from.x, fromY: from.y, total: 420, to: job.avatar };
  }

  private spawn(
    x: number,
    y: number,
    color: number | null,
    size: number,
    motion: { vx: number; vy: number; gravity: number; life: number; floor?: number; texture?: string },
  ) {
    if (this.particles.length >= MAX_PARTICLES) return null;
    const image = this.pool.pop() ?? this.scene.add.image(0, 0, PIXEL);
    image.setTexture(motion.texture ?? PIXEL).setScale(size).setDepth(FX_DEPTH).setAlpha(1).setRotation(0).setVisible(true);
    if (color === null) image.clearTint();
    else image.setTint(color);
    const { vx, vy, gravity, life, floor = null } = motion;
    const particle: Particle = { image, x, y, vx, vy, gravity, life, floor, flight: null };
    this.particles.push(particle);
    return particle;
  }

  private release(image: Phaser.GameObjects.Image) {
    image.setVisible(false);
    this.pool.push(image);
  }

  private stepParticles(delta: number) {
    const seconds = delta / 1000;
    this.particles = this.particles.filter((p) => {
      p.life -= delta;
      if (p.life <= 0) {
        this.release(p.image);
        return false;
      }
      if (p.flight) {
        const { fromX, fromY, total, to } = p.flight;
        const t = 1 - p.life / total;
        p.x = lerp(fromX, to.sprite.x, t);
        p.y = lerp(fromY, to.sprite.y - 16, t) - Math.sin(t * Math.PI) * 26;
        p.image.setRotation(t * 6);
      } else {
        p.vy += p.gravity * seconds;
        p.x += p.vx * seconds;
        p.y += p.vy * seconds;
        if (p.floor !== null && p.y > p.floor) {
          p.y = p.floor;
          p.vy *= -0.35;
          p.vx *= 0.6;
        }
      }
      p.image.setPosition(Math.round(p.x), Math.round(p.y));
      if (p.life < FADE_MS) p.image.setAlpha(0.5);
      return true;
    });
  }
}
