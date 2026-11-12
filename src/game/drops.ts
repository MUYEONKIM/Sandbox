import type Phaser from 'phaser';
import { goldTier, paintGlow, paintGoldPile, paintMemoNote, paintSparkle } from '../art/drops';
import type { Art } from '../art/props';
import { depthOf, tileCenter } from '../iso';
import type { GroundItem } from '../net/session';

/** 별 하나가 켜졌다 꺼지는 시간과, 다시 켜질 때까지 쉬는 시간 (ms) */
const TWINKLE_MS = 420;
const REST_MS = 700;
/** 바닥 빛이 한 번 밝아졌다 어두워지는 시간 (ms) */
const GLOW_MS = 900;
/** 별이 뜨는 범위: 물건 가운데에서 좌우, 위로 (월드 픽셀) */
const SPARKLE_SPREAD_X = 9;
const SPARKLE_SPREAD_UP = 12;

interface Shown {
  item: GroundItem;
  image: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  sparkles: Phaser.GameObjects.Image[];
}

/**
 * 땅에 놓인 메모와 골드(2026-11-13 사용자 요청 "땅바닥에 놓인 아이템은 반짝반짝 빛난다").
 * 물건 둘레에서 별 두 개가 번갈아 켜지고, 켜질 때마다 자리를 옮긴다.
 * 같은 칸에 선 사람보다 뒤에, 뒤쪽 칸 사람보다 앞에 그린다(아바타는 depthOf + 1, 그림자는 depthOf).
 */
export class GroundItems {
  private readonly shown = new Map<number, Shown>();
  private readonly arts = new Map<string, Art>();

  constructor(private readonly scene: Phaser.Scene) {}

  private art(key: string, paint: () => Art) {
    let art = this.arts.get(key);
    if (!art) {
      art = paint();
      this.arts.set(key, art);
      if (!this.scene.textures.exists(key)) this.scene.textures.addCanvas(key, art.canvas);
    }
    return art;
  }

  /** 맵의 것을 모두 바꾼다. 맵에 들어오거나 다시 붙었을 때 서버 목록으로 맞춘다. */
  set(items: GroundItem[]) {
    this.clear();
    for (const item of items) this.add(item);
  }

  add(item: GroundItem) {
    if (this.shown.has(item.id)) return;
    const { amount } = item;
    const key = amount === null ? 'drop-memo' : `drop-gold-${goldTier(amount)}`;
    const art = this.art(key, () => (amount === null ? paintMemoNote() : paintGoldPile(goldTier(amount))));
    if (!this.scene.textures.exists('drop-sparkle')) this.scene.textures.addCanvas('drop-sparkle', paintSparkle());
    if (!this.scene.textures.exists('drop-glow')) this.scene.textures.addCanvas('drop-glow', paintGlow());

    // 한 칸에 여럿 놓이면 조금씩 비켜 보이게 한다.
    const c = tileCenter(item.x, item.y);
    const x = c.x + ((item.id * 7) % 9) - 4;
    const y = c.y + ((item.id * 5) % 5) - 2;
    const depth = depthOf(item.x, item.y) + 0.2;
    const glow = this.scene.add.image(x, y, 'drop-glow').setDepth(depth - 0.05).setAlpha(0.35);
    this.scene.tweens.add({ targets: glow, alpha: 0.9, duration: GLOW_MS, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const image = this.scene.add
      .image(x, y, key)
      .setOrigin(art.ax / art.canvas.width, art.ay / art.canvas.height)
      .setDepth(depth);

    const sparkles = [0, 1].map((i) => {
      const star = this.scene.add.image(x, y, 'drop-sparkle').setDepth(depth + 0.1).setAlpha(0);
      const hop = () =>
        star.setPosition(
          x + Math.round((Math.random() * 2 - 1) * SPARKLE_SPREAD_X),
          y - 2 - Math.round(Math.random() * SPARKLE_SPREAD_UP),
        );
      hop();
      this.scene.tweens.add({
        targets: star,
        alpha: { from: 0, to: 1 },
        scale: { from: 0.5, to: 1.15 },
        duration: TWINKLE_MS,
        yoyo: true,
        repeat: -1,
        repeatDelay: REST_MS,
        delay: i * (TWINKLE_MS + REST_MS / 2) + (item.id % 5) * 90,
        onRepeat: hop,
      });
      return star;
    });
    this.shown.set(item.id, { item, image, glow, sparkles });
  }

  remove(id: number) {
    const shown = this.shown.get(id);
    if (!shown) return;
    this.scene.tweens.killTweensOf([...shown.sparkles, shown.glow]);
    for (const star of shown.sparkles) star.destroy();
    shown.glow.destroy();
    shown.image.destroy();
    this.shown.delete(id);
  }

  clear() {
    for (const id of [...this.shown.keys()]) this.remove(id);
  }

  /** 칸 (x, y)에 놓인 것, 나중에 놓인 것부터 */
  at(x: number, y: number): GroundItem[] {
    const items: GroundItem[] = [];
    for (const { item } of this.shown.values()) if (item.x === x && item.y === y) items.push(item);
    return items.sort((a, b) => b.id - a.id);
  }
}
