import type Phaser from 'phaser';
import { sprite, type SpriteName } from '../art/sprites';
import type { Portal } from './maps';
import type { Tile } from './world';

/**
 * 걸어서 지나가는 문(2026-11-27 사용자 "비밀의 방 발코니 가는 포탈은 놓지 않는다. 그냥 자연스럽게 해당 발코니 문으로 가면
 * 문열리는 애니메이션과 함께 자연스럽게 발코니로 나가진다."). 그림과 시간은 디자인 세션 8 balcony-door.json이다.
 * - 그림은 30 × 65 네 장을 가로로 이은 것이고 0 닫힘 → 3 열림이다. 여닫을 때 한 장씩 70ms로 넘겨 다 열리고 닫히는 데 210ms다.
 * - 서버 상태는 없다. 사람마다 제 화면에서 여닫는다(문 앞 칸에서 문 쪽을 보는 사람이 있으면 열림, GameScene.updateWalkDoor).
 * - 프레임을 넘길 때만 그림을 바꾸고, 멈춰 있을 때는 update가 비교 두 번으로 끝난다.
 * 포탈 자료(maps.ts Portal.door): 문 칸(벽 칸)이 x·y, 문 앞 바닥 칸이 landing이다.
 * 2026-11-28 마을 건물 문·건물 안 나가는 문(디자인 세션 13 doors-npc.json)부터 문마다 넘어가는 쪽(문 앞 칸 → 문 칸, walkDir)과
 * 그림 크기·조각이 다르다. 여닫는 시간·한 걸음·열어 두는 시간은 같다.
 */
export const WALK_DOOR_SIZE = { w: 30, h: 65, frames: 4 } as const;
const FRAME_MS = 70;
const OPEN = WALK_DOOR_SIZE.frames - 1;
/** 문 칸으로 들어가고 나오는 한 걸음(ms): 보통 걸음보다 조금 느리게(제가 정한 것) */
export const WALK_DOOR_STEP_MS = 180;
/** 건너편에서 문 앞 칸까지 걸어 나온 뒤 닫기 전까지(ms, 디자인 holdOpenMs) */
export const WALK_DOOR_HOLD_MS = 250;

/** 문 그림 텍스처에 장마다 프레임 '0'~'3'을 단다(처음 한 번). */
export function ensureWalkDoorTexture(scene: Phaser.Scene, name: SpriteName) {
  if (!scene.textures.exists(name)) scene.textures.addImage(name, sprite(name));
  const texture = scene.textures.get(name);
  if (!texture.has(String(OPEN))) {
    for (let i = 0; i < WALK_DOOR_SIZE.frames; i++) texture.add(String(i), 0, i * WALK_DOOR_SIZE.w, 0, WALK_DOOR_SIZE.w, WALK_DOOR_SIZE.h);
  }
  return name;
}

/** 문 포탈의 넘어가는 쪽(문 앞 칸 → 문 칸). 벽 문은 dy −1, 마을 건물 문은 dy −1·dx −1, 건물 안 나가는 문은 dx +1·dy +1이다. */
export function walkDir(portal: Portal) {
  return { dx: portal.x - portal.landing.x, dy: portal.y - portal.landing.y };
}

/** dir로 걷거나 보면 이 문으로 넘어가는지: 넘어가는 쪽 성분의 부호가 같으면 된다(대각선 포함, 벽 문은 예전처럼 dy < 0). */
export function intoDoor(portal: Portal, dir: { dx: number; dy: number }) {
  const w = walkDir(portal);
  return dir.dx * w.dx + dir.dy * w.dy > 0;
}

export class WalkDoor {
  private frame = 0;
  private target = 0;
  private nextAt = 0;
  /** 이 시각까지는 열어 둔다(건너편에서 막 넘어왔을 때) */
  private holdUntil = 0;

  constructor(
    /** 문 그림. 마을 건물 문은 건물 띠에 맞춰 자른 조각 여럿이고, 그 밖의 문은 한 장이다. */
    readonly images: readonly Phaser.GameObjects.Image[],
    /** 이 문의 칸들(두 짝 문이면 둘). 차례는 벽을 따라 같은 쪽부터라 건너편 문과 짝이 맞는다. */
    readonly portals: readonly Portal[],
    /** 장 번호와 조각 번호로 프레임 이름을 준다. 한 장짜리 문은 '0'~'3'이다. */
    private readonly frameName: (frame: number, piece: number) => string = (frame) => String(frame),
    /** 한 장 크기(휴대폰에서 누른 곳을 볼 때). 첫 조각의 왼쪽 위부터 잰다. */
    private readonly size: { w: number; h: number } = WALK_DOOR_SIZE,
  ) {
    this.paint();
  }

  /** 지금 장을 조각마다 그린다(장이 바뀔 때만 부름). */
  private paint() {
    this.images.forEach((image, i) => image.setFrame(this.frameName(this.frame, i)));
  }

  /** tile이 문 앞 칸이면 그 칸의 문 포탈 */
  portalInFront(tile: Tile) {
    return this.portals.find((p) => p.landing.x === tile.x && p.landing.y === tile.y);
  }

  /** 다 열렸는지 */
  get isOpen() {
    return this.frame === OPEN;
  }

  /** 지금 열어 둘 차례인지(막 넘어와 잠시 열어 두는 동안) */
  held(time: number) {
    return time < this.holdUntil;
  }

  /** 다 연 채로 보이고 until까지 열어 둔다(건너편에서 막 넘어왔을 때). */
  showOpen(until: number) {
    this.frame = this.target = OPEN;
    this.nextAt = 0;
    this.holdUntil = until;
    this.paint();
  }

  /** 열거나 닫기로 한다. 바뀌는 중이면 지금 장에서 이어 간다. 여닫기가 새로 정해졌으면 true(문 소리를 낸다). */
  want(open: boolean, time: number) {
    const target = open ? OPEN : 0;
    if (target === this.target) return false;
    this.target = target;
    if (this.frame !== target && !this.nextAt) this.nextAt = time + FRAME_MS;
    return true;
  }

  /** 바꿀 때가 됐으면 한 장 넘긴다. */
  update(time: number) {
    if (!this.nextAt || time < this.nextAt) return;
    this.frame += Math.sign(this.target - this.frame);
    this.paint();
    this.nextAt = this.frame === this.target ? 0 : time + FRAME_MS;
  }

  /** 화면 점 (wx, wy)가 문 그림 위인지(휴대폰에서 문을 눌렀을 때) */
  contains(wx: number, wy: number) {
    const { x, y } = this.images[0];
    return wx >= x && wx < x + this.size.w && wy >= y && wy < y + this.size.h;
  }
}
