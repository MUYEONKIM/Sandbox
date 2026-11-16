import type Phaser from 'phaser';
import { alphaMask } from './alphaMask';

/** 포탈이나 안내판을 덮는 블록의 불투명도(CoverFader와 같은 값) */
export const KEEP_CLEAR_ALPHA = 0.5;

/**
 * 플레이어가 놓은 블록이 포탈이나 안내판 그림을 덮으면 그 블록을 반투명하게 그린다(2026-11-16 사용자 "가려지면 안 된다",
 * 반투명은 PM 질문에 사용자가 고름. 방법은 에이전트가 정함). CoverFader처럼 그림의 불투명한 픽셀이 겹치는지 본다.
 * 블록을 놓을 때 한 번만 보므로 매 프레임 드는 비용이 없다. 그림마다 알파 값을 한 번 읽어 두고 다시 쓴다(alphaMask.ts).
 */
export class KeepClear {
  private guarded: Phaser.GameObjects.Image[] = [];

  /** 맵에 들어가 포탈과 안내판을 그린 뒤 부른다. */
  guard(images: Phaser.GameObjects.Image[]) {
    this.guarded = images;
  }

  clear() {
    this.guarded = [];
  }

  /** 이 그림이 지킬 그림보다 앞에 그려지면서 그 보이는 픽셀을 하나라도 덮는지 */
  covers(image: Phaser.GameObjects.Image) {
    return this.guarded.some((kept) => image.depth >= kept.depth && this.overlaps(image, kept));
  }

  private overlaps(a: Phaser.GameObjects.Image, b: Phaser.GameObjects.Image) {
    const ax = Math.round(a.x - a.displayOriginX);
    const ay = Math.round(a.y - a.displayOriginY);
    const bx = Math.round(b.x - b.displayOriginX);
    const by = Math.round(b.y - b.displayOriginY);
    // 테두리 상자부터 본다. 겹치지 않으면 알파 값을 읽지 않는다.
    if (ax >= bx + b.width || bx >= ax + a.width || ay >= by + b.height || by >= ay + a.height) return false;
    const ma = alphaMask(a.frame);
    const mb = alphaMask(b.frame);
    if (!ma || !mb) return false;
    const left = Math.max(ax, bx);
    const top = Math.max(ay, by);
    const right = Math.min(ax + ma.width, bx + mb.width);
    const bottom = Math.min(ay + ma.height, by + mb.height);
    for (let y = top; y < bottom; y++) {
      const rowA = (y - ay) * ma.width - ax;
      const rowB = (y - by) * mb.width - bx;
      for (let x = left; x < right; x++) {
        if (ma.alpha[rowA + x] && mb.alpha[rowB + x]) return true;
      }
    }
    return false;
  }
}
