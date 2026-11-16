import Phaser from 'phaser';

/** 덩어리 한 변의 칸 수. 46칸 맵이면 12 × 12 = 144덩어리다. */
const CHUNK = 4;
/** 카메라가 이만큼(월드 픽셀) 움직일 때마다 덩어리를 다시 본다. */
const STEP = 32;
/** 화면 밖 이만큼까지는 미리 그린다. STEP보다 넉넉히 커야 다시 보기 전에 화면에 들어온 덩어리가 비지 않는다. */
const MARGIN = 64;

interface Chunk {
  images: Set<Phaser.GameObjects.Image>;
  /** 덩어리 그림들을 모두 덮는 월드 사각형. 그림이 늘 때 넓히고 줄 때는 그대로 둔다(넉넉한 쪽). */
  left: number;
  top: number;
  right: number;
  bottom: number;
  shown: boolean;
}

/**
 * 블록 그림을 맵 칸 덩어리(CHUNK × CHUNK)로 묶어, 화면 밖 덩어리는 덩어리째 장면의 표시 목록에서 뺀다(2026-11-16, 블록이 많은 맵의 렉 고치기).
 * Phaser는 화면 밖 그림도 모두 그리려 하고, 캐릭터가 걸어 깊이가 바뀔 때마다 표시 목록 전체를 정렬한다. 블록이 6,190개인 벌목장에서
 * 그리기 3ms, 걸을 때 정렬 1.2ms가 들었다(화면 안은 468개). 목록에서 빼면 그리기와 정렬이 함께 줄어든다.
 * 매 프레임 블록마다 보지 않는다. 카메라가 STEP만큼 움직였거나 화면 크기가 바뀌었거나 덩어리가 새로 생기거나 넓어졌을 때만
 * 덩어리 사각형을 화면과 견준다. 빠진 그림은 지우지 않으므로 다시 넣으면 그대로 그려진다(깊이는 Phaser가 다시 정렬한다).
 */
export class BlockChunks {
  private readonly chunks = new Map<number, Chunk>();
  private readonly bounds = new Phaser.Geom.Rectangle();
  private viewKey = '';
  /** 화면 범위를 다시 볼 때 부른다(등 빛이 켤 플레이어 조명을 다시 고른다, lights.ts). */
  onView: ((view: Phaser.Geom.Rectangle) => void) | null = null;

  add(image: Phaser.GameObjects.Image, x: number, y: number) {
    const key = Math.floor(x / CHUNK) * 1000 + Math.floor(y / CHUNK);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = { images: new Set(), left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity, shown: true };
      this.chunks.set(key, chunk);
    }
    chunk.images.add(image);
    const b = image.getBounds(this.bounds);
    if (b.x < chunk.left || b.y < chunk.top || b.x + b.width > chunk.right || b.y + b.height > chunk.bottom) {
      chunk.left = Math.min(chunk.left, b.x);
      chunk.top = Math.min(chunk.top, b.y);
      chunk.right = Math.max(chunk.right, b.x + b.width);
      chunk.bottom = Math.max(chunk.bottom, b.y + b.height);
      // 새 덩어리이거나 넓어졌으면 화면에 걸치는지가 바뀔 수 있으니 이번 프레임 그리기 전에(FOLLOW_UPDATE) 다시 본다.
      this.viewKey = '';
    }
    if (!chunk.shown) image.removeFromDisplayList();
  }

  remove(image: Phaser.GameObjects.Image, x: number, y: number) {
    this.chunks.get(Math.floor(x / CHUNK) * 1000 + Math.floor(y / CHUNK))?.images.delete(image);
  }

  /** 맵을 떠날 때 부른다(그림은 부르는 쪽이 지운다). */
  clear() {
    this.chunks.clear();
    this.viewKey = '';
  }

  /** 카메라가 이번 프레임의 화면 범위를 정한 뒤(FOLLOW_UPDATE) 부른다. 범위가 STEP 안에서만 움직였으면 아무것도 하지 않는다. */
  update(view: Phaser.Geom.Rectangle) {
    const key = `${Math.floor(view.x / STEP)},${Math.floor(view.y / STEP)},${Math.round(view.width)},${Math.round(view.height)}`;
    if (key === this.viewKey) return;
    this.viewKey = key;
    const left = view.x - MARGIN;
    const top = view.y - MARGIN;
    const right = view.x + view.width + MARGIN;
    const bottom = view.y + view.height + MARGIN;
    let added: Phaser.GameObjects.Image | null = null;
    for (const chunk of this.chunks.values()) {
      const show = chunk.right >= left && chunk.left <= right && chunk.bottom >= top && chunk.top <= bottom;
      if (show === chunk.shown) continue;
      chunk.shown = show;
      for (const image of chunk.images) {
        if (show) {
          image.addToDisplayList();
          added = image;
        } else image.removeFromDisplayList();
      }
    }
    // Phaser는 이 프레임의 깊이 정렬을 카메라 준비(이 함수)보다 먼저 끝낸다. 다시 넣은 그림이 목록 끝에서 맨 앞에 그려지지 않게 바로 정렬한다.
    added?.scene.children.depthSort();
    this.onView?.(view);
  }
}
