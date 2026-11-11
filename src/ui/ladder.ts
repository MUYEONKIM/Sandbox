import type { Economy } from '../game/economy';
import { animate, BetWindow, BLUE, GOLD, RED, wait, type PlaceBet } from './bet';

const STAGE_H = 160;

/** 사다리: 출발(좌, 우)과 가로줄 수(3, 4)를 서버가 정한다. 공이 위에서 내려오며 가로줄을 만날 때마다 건너간다. */
export class LadderWindow extends BetWindow {
  private static readonly RAILS = [110, 210];
  private static readonly TOP = 34;
  private static readonly BOTTOM = 128;

  constructor(parent: HTMLElement, economy: Economy, placeBet: PlaceBet) {
    super(parent, economy, 'ladder', placeBet, STAGE_H);
    this.drawBoard(null, 0);
  }

  /** lines가 null이면 가로줄 자리를 가린다. */
  private drawBoard(lines: number | null, reveal: number) {
    const { RAILS, TOP, BOTTOM } = LadderWindow;
    const { ctx } = this;
    this.clear('#f4f1ea');
    this.text('좌', RAILS[0], 16, 14, RED);
    this.text('우', RAILS[1], 16, 14, BLUE);
    this.text('홀', RAILS[0], 146, 14, RED);
    this.text('짝', RAILS[1], 146, 14, BLUE);
    ctx.fillStyle = '#2c2430';
    for (const x of RAILS) ctx.fillRect(x - 2, TOP, 4, BOTTOM - TOP);
    if (lines === null) {
      ctx.fillStyle = '#3b2a20';
      ctx.fillRect(RAILS[0] - 20, TOP + 14, RAILS[1] - RAILS[0] + 40, BOTTOM - TOP - 28);
      this.text('?', (RAILS[0] + RAILS[1]) / 2, (TOP + BOTTOM) / 2, 28, GOLD);
      return;
    }
    LadderWindow.rungs(lines).forEach((y, i) => {
      ctx.fillStyle = i & 1 ? BLUE : RED;
      const width = (RAILS[1] - RAILS[0]) * reveal;
      ctx.fillRect(RAILS[0], y - 2, width, 4);
    });
  }

  private static rungs(lines: number) {
    const { TOP, BOTTOM } = LadderWindow;
    return Array.from({ length: lines }, (_, i) => TOP + ((i + 1) * (BOTTOM - TOP)) / (lines + 1));
  }

  protected async play(outcome: string) {
    const { RAILS, TOP, BOTTOM } = LadderWindow;
    const start = outcome[0] === 'L' ? 0 : 1;
    const lines = Number(outcome[1]);
    await animate(500, (t) => this.drawBoard(lines, t));

    // 공이 지나는 길: 세로로 내려가다 가로줄에서 건너간다.
    const points: [number, number][] = [[RAILS[start], TOP]];
    let rail = start;
    for (const y of LadderWindow.rungs(lines)) {
      points.push([RAILS[rail], y]);
      rail = 1 - rail;
      points.push([RAILS[rail], y]);
    }
    points.push([RAILS[rail], BOTTOM]);
    const lengths = points.slice(1).map(([x, y], i) => Math.hypot(x - points[i][0], y - points[i][1]));
    const total = lengths.reduce((a, b) => a + b, 0);

    await animate(2600, (t) => {
      this.drawBoard(lines, 1);
      let left = t * total;
      const { ctx } = this;
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(...points[0]);
      let head = points[0];
      for (let i = 0; i < lengths.length && left > 0; i++) {
        const k = Math.min(1, left / lengths[i]);
        const [x0, y0] = points[i];
        const [x1, y1] = points[i + 1];
        head = [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k];
        ctx.lineTo(...head);
        left -= lengths[i];
      }
      ctx.stroke();
      this.circle(head[0], head[1], 7, '#ffb84d');
    });
    this.text(rail === 0 ? '홀' : '짝', RAILS[rail], 146, 16, GOLD);
    await wait(300);
  }

  protected describe(outcome: string) {
    const start = outcome[0] === 'L' ? 0 : 1;
    const lines = Number(outcome[1]);
    const end = (start + lines) % 2 === 0 ? '홀' : '짝';
    return `${start === 0 ? '좌' : '우'} 출발 · ${lines}줄 → ${end}`;
  }
}
