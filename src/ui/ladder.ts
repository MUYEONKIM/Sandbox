import { assetUrl } from '../assetUrl';
import type { Economy } from '../game/economy';
import { animate, BetWindow, loadImage, STAGE_W, wait, type PlaceBet } from './bet';
import { ellipse, makeCanvas, once, OUT, piece, rect, stamp, textArt } from './pixelArt';

/** 판 높이. 2026-11-16 새 모습에서 다른 두 게임처럼 190으로 키웠다(예전 160). */
const STAGE_H = 190;
/**
 * 판 배경(2026-11-16 새 모습, 디자인 세션 casino-ui.md 2-2): 남색 판자 벽과 색 깃발 줄, 나무 바닥, 왼쪽 간판 "사다리",
 * 금색 테 초록 칠판, 출발 등 "좌"(빨강)·"우"(파랑), 도착 칸 "홀"·"짝", 놋쇠 기둥 둘. 한 장을 그대로 찍는다.
 */
const BACKGROUND = assetUrl('casino/ladder-board.png');
const RAILS = [122, 198];
const TOP = 58;
const BOTTOM = 146;

function rungsOf(lines: number) {
  return Array.from({ length: lines }, (_, i) => TOP + ((i + 1) * (BOTTOM - TOP)) / (lines + 1));
}

/** 가로줄을 가린 나무 덧문과 물음표 */
function shutter() {
  return once('shutter', () => {
    const w = RAILS[1] - RAILS[0] + 40;
    const h = BOTTOM - TOP - 16;
    return piece(w, h, (g) => {
      rect(g, 0, 0, w, h, OUT);
      for (let y = 1; y < h - 1; y += 6) {
        rect(g, 1, y, w - 2, 5, '#7a4e2a');
        rect(g, 1, y, w - 2, 1, '#a06a3a');
      }
      stamp(g, textArt('?', 22, '#f2cf6a'), w / 2, h / 2);
    });
  });
}

/** 돌아가는 금화(4장) */
function coin(k: number) {
  return once(`coin:${k}`, () => {
    const c = makeCanvas(13, 13);
    const g = c.getContext('2d')!;
    const rx = [5.5, 4, 2, 4][k];
    ellipse(g, 6.5, 6.5, rx + 1, 6.5, OUT);
    ellipse(g, 6.5, 6.5, rx, 5.5, '#f2c14e');
    if (rx > 3) ellipse(g, 6.5, 6.5, rx - 2, 3.5, '#ffe08a');
    rect(g, 5, 3, 1, 2, '#fff8d0');
    return c;
  });
}

/** 사다리: 출발(좌, 우)과 가로줄 수(3, 4)를 서버가 정한다. 금화가 위에서 내려오며 가로줄을 만날 때마다 건너간다. */
export class LadderWindow extends BetWindow {
  private background: HTMLImageElement | null = null;
  private readonly assets: Promise<void>;

  constructor(parent: HTMLElement, economy: Economy, placeBet: PlaceBet) {
    super(parent, economy, 'ladder', placeBet, STAGE_H);
    this.assets = loadImage(BACKGROUND)
      .then((image) => {
        this.background = image;
      })
      .catch(() => undefined)
      .then(() => {
        if (!this.busy) this.drawBoard(null, 0, null, null, 0, null);
      });
  }

  /**
   * 한 장면. lines가 null이면 가로줄 자리를 덧문으로 가린다. reveal(0~1)만큼 덧문이 위로 걷힌다.
   * path는 금화가 지나온 길, head는 금화 자리, end는 도착한 칸(홀 0, 짝 1)이다.
   */
  private drawBoard(lines: number | null, reveal: number, path: [number, number][] | null, head: [number, number] | null, frame: number, end: number | null) {
    const { ctx } = this;
    ctx.imageSmoothingEnabled = false;
    if (this.background) ctx.drawImage(this.background, 0, 0, STAGE_W, STAGE_H);
    else this.clear('#1e2a4a');
    if (lines !== null) {
      rungsOf(lines).forEach((y, i) => {
        const yy = Math.round(y);
        rect(ctx, RAILS[0], yy - 2, RAILS[1] - RAILS[0], 5, OUT);
        rect(ctx, RAILS[0] + 1, yy - 1, RAILS[1] - RAILS[0] - 2, 3, '#d8a23a');
        rect(ctx, RAILS[0] + 1, yy - 1, RAILS[1] - RAILS[0] - 2, 1, '#ffe08a');
        stamp(ctx, textArt(String(i + 1), 8, '#e8f0e8'), RAILS[1] + 14, yy);
      });
    }
    if (lines === null || reveal < 1) {
      const art = shutter();
      const y = TOP + 8 - Math.round((lines === null ? 0 : reveal) * (art.height + 20));
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, TOP - 4, STAGE_W, BOTTOM - TOP + 8);
      ctx.clip();
      ctx.drawImage(art, RAILS[0] - 20, y);
      ctx.restore();
    }
    if (path && path.length > 1) {
      // 지나온 길: 분필처럼 밝은 노란 선
      ctx.strokeStyle = '#fff2a0';
      ctx.lineWidth = 3;
      ctx.lineCap = 'square';
      ctx.beginPath();
      ctx.moveTo(path[0][0], path[0][1]);
      for (const [x, y] of path.slice(1)) ctx.lineTo(x, y);
      ctx.stroke();
    }
    if (head) stamp(ctx, coin(frame % 4), head[0], head[1]);
    if (end !== null) {
      const x = RAILS[end];
      const glow = once('ld-end-glow', () => piece(50, 34, (g) => ellipse(g, 25, 17, 24, 16, (px, py) => ((px + py) & 1 ? 'rgba(255,236,150,0.55)' : null))));
      stamp(ctx, glow, x, BOTTOM + 16);
      rect(ctx, x - 15, BOTTOM + 8, 30, 16, '#f2cf6a');
      stamp(ctx, textArt(end === 0 ? '홀' : '짝', 12, '#ffffff'), x, BOTTOM + 16);
      stamp(ctx, textArt(end === 0 ? '홀!' : '짝!', 22, end === 0 ? '#ff8a7a' : '#8ab4ff'), 282, 112);
    }
  }

  /** 연출 순서와 시간은 예전과 같다: 덧문 0.5초, 금화 2.6초, 도착 강조 뒤 0.3초. */
  protected async play(outcome: string) {
    await this.assets;
    const start = outcome[0] === 'L' ? 0 : 1;
    const lines = Number(outcome[1]);
    await animate(500, (t) => this.drawBoard(lines, t, null, null, 0, null));

    // 금화가 지나는 길: 세로로 내려가다 가로줄에서 건너간다.
    const points: [number, number][] = [[RAILS[start], TOP - 6]];
    let rail = start;
    for (const y of rungsOf(lines)) {
      points.push([RAILS[rail], y]);
      rail = 1 - rail;
      points.push([RAILS[rail], y]);
    }
    points.push([RAILS[rail], BOTTOM + 4]);
    const lengths = points.slice(1).map(([x, y], i) => Math.hypot(x - points[i][0], y - points[i][1]));
    const total = lengths.reduce((a, b) => a + b, 0);
    let frame = 0;
    await animate(2600, (t) => {
      let left = t * total;
      const path: [number, number][] = [points[0]];
      let head = points[0];
      for (let i = 0; i < lengths.length && left > 0; i++) {
        const k = Math.min(1, left / lengths[i]);
        const [x0, y0] = points[i];
        const [x1, y1] = points[i + 1];
        head = [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k];
        path.push(head);
        left -= lengths[i];
      }
      this.drawBoard(lines, 1, path, head, Math.floor(++frame / 4), null);
    });
    this.drawBoard(lines, 1, points, null, 0, rail);
    await wait(300);
  }

  protected describe(outcome: string) {
    const start = outcome[0] === 'L' ? 0 : 1;
    const lines = Number(outcome[1]);
    const end = (start + lines) % 2 === 0 ? '홀' : '짝';
    return `${start === 0 ? '좌' : '우'} 출발 · ${lines}줄 → ${end}`;
  }
}
