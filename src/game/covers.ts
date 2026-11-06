import type Phaser from 'phaser';

/** 가리는 동안의 불투명도 */
const FADED_ALPHA = 0.5;
const FADE_MS = 120;

/** 가리는 것을 다시 찾는 간격. 한 칸을 걷는 시간(120ms)보다 조금 짧으면 충분하다. */
const CHECK_MS = 100;

/** 발에서 위로 몸통과 머리까지의 높이 (아트 픽셀). 발만 가려질 때는 흐리게 하지 않는다. */
const BODY_HEIGHTS = [16, 30];

/** 화면 위로 솟아 캐릭터를 가릴 수 있는 것. 건물은 세로 띠 여러 장, 나무는 한 장이다. */
interface Cover {
  textureKey: string;
  images: Phaser.GameObjects.Image[];
}

/** 내 캐릭터를 가리는 건물과 나무를 반투명하게 만든다. 그림의 투명도만 바꾸므로 메모리를 더 쓰지 않는다. */
export class CoverFader {
  private covers: Cover[] = [];
  private readonly faded = new Set<Cover>();
  private nextCheckAt = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  add(textureKey: string, images: Phaser.GameObjects.Image[]) {
    this.covers.push({ textureKey, images });
  }

  /** 맵을 떠날 때 부른다. */
  clear() {
    for (const { images } of this.covers) this.scene.tweens.killTweensOf(images);
    this.covers = [];
    this.faded.clear();
  }

  update(time: number, avatar: Phaser.GameObjects.Image) {
    if (time < this.nextCheckAt) return;
    this.nextCheckAt = time + CHECK_MS;

    for (const cover of this.covers) {
      const hides = this.hides(cover, avatar);
      if (hides === this.faded.has(cover)) continue;
      if (hides) this.faded.add(cover);
      else this.faded.delete(cover);
      this.scene.tweens.killTweensOf(cover.images);
      this.scene.tweens.add({ targets: cover.images, alpha: hides ? FADED_ALPHA : 1, duration: FADE_MS });
    }
  }

  /** 캐릭터보다 앞에 그려지는 그림의 불투명한 픽셀이 몸통이나 머리를 덮는지 본다. */
  private hides({ textureKey, images }: Cover, avatar: Phaser.GameObjects.Image) {
    return images.some((image) => {
      if (image.depth <= avatar.depth) return false;
      const left = image.x - image.displayOriginX;
      const top = image.y - image.displayOriginY;
      const px = Math.floor(avatar.x - left);
      if (px < 0 || px >= image.width) return false;
      return BODY_HEIGHTS.some((height) => {
        const py = Math.floor(avatar.y - height - top);
        if (py < 0 || py >= image.height) return false;
        return this.scene.textures.getPixelAlpha(px, py, textureKey, image.frame.name) > 0;
      });
    });
  }
}
