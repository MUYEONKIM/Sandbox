import { assetUrl } from '../assetUrl';
import { GAMES, SNAIL_COLORS } from '../game/casino';
import type { Economy } from '../game/economy';
import type { Color } from '../art/pixels';
import { animate, BetWindow, css, GOLD, loadImage, OUTLINE, STAGE_W, wait, type PlaceBet } from './bet';

/** 사용자가 준 경주 배경(1344×796)과 같은 비율 */
const STAGE_H = 190;
const BACKGROUND = assetUrl('casino/snail-race.webp');
/** 사용자가 준 달팽이 실루엣(1280×1144, 왼쪽을 봄) */
const SNAIL = assetUrl('casino/snail.svg');

/** 배경 속 흙길 세 줄의 높이와 출발, 결승 위치(배경 크기에 대한 비율) */
const LANE_Y = [0.58, 0.722, 0.867].map((v) => v * STAGE_H);
const START_X = 0.075 * STAGE_W;
const FINISH_X = 0.935 * STAGE_W;
/** 화면에 그리는 달팽이 크기 */
const SNAIL_W = 30;
const SNAIL_H = 27;
const RACE_MS = 4200;

/** 달팽이 그림 안에서 껍데기가 차지하는 곳(실루엣 64칸 기준: 목과 껍데기 사이 틈 오른쪽, 발 위) */
const SHELL_LEFT = 18 / 64;
const SHELL_BOTTOM = 41 / 57;
const SHELL_CENTER = [41 / 64, 22 / 57];
const EYE = [8 / 64, 20 / 57];
const BODY = [243, 217, 164];

const PAINT_W = 128;
const PAINT_H = Math.round((PAINT_W * 1144) / 1280);
const PAD = 6;

const rgb = (c: Color) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

function canvasOf(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

/**
 * 받은 달팽이 실루엣을 만화풍으로 칠한다: 껍데기는 번호 색, 몸과 더듬이는 크림색, 굵은 갈색 테두리, 껍데기 소용돌이와 눈.
 * 그림은 원본처럼 왼쪽을 본다. 경주로에서는 뒤집어 오른쪽으로 간다.
 */
function paintSnail(silhouette: HTMLImageElement, shell: Color) {
  const W = PAINT_W;
  const H = PAINT_H;
  const mask = canvasOf(W, H);
  const maskCtx = mask.getContext('2d', { willReadFrequently: true })!;
  maskCtx.drawImage(silhouette, 0, 0, W, H);
  const alpha = maskCtx.getImageData(0, 0, W, H).data;

  const fill = new ImageData(W, H);
  const shellRgb = rgb(shell);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (alpha[i + 3] === 0) continue;
      const inShell = x >= SHELL_LEFT * W && y <= SHELL_BOTTOM * H;
      const light = inShell
        ? 1.2 - 0.38 * Math.min(1, Math.hypot((x - 0.5 * W) / (0.45 * W), (y - 0.15 * H) / (0.6 * H)))
        : 1.05 - 0.25 * (y / H);
      const base = inShell ? shellRgb : BODY;
      for (let c = 0; c < 3; c++) fill.data[i + c] = Math.min(255, Math.round(base[c] * light));
      fill.data[i + 3] = alpha[i + 3];
    }
  }

  // 테두리: 실루엣을 짙은 갈색으로 칠해 둘레로 조금씩 밀어 찍는다.
  maskCtx.globalCompositeOperation = 'source-in';
  maskCtx.fillStyle = OUTLINE;
  maskCtx.fillRect(0, 0, W, H);

  const out = canvasOf(W + PAD * 2, H + PAD * 2);
  const ctx = out.getContext('2d')!;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    ctx.drawImage(mask, PAD + Math.cos(a) * 4, PAD + Math.sin(a) * 4);
  }
  const body = canvasOf(W, H);
  body.getContext('2d')!.putImageData(fill, 0, 0);
  ctx.drawImage(body, PAD, PAD);

  // 껍데기 소용돌이
  const [cx, cy] = [PAD + SHELL_CENTER[0] * W, PAD + SHELL_CENTER[1] * H];
  const turns = 2.6 * Math.PI * 2;
  ctx.strokeStyle = `rgb(${shellRgb.map((v) => Math.round(v * 0.6)).join(',')})`;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let t = 0.4; t <= turns; t += 0.05) {
    const r = (t / turns) * W * 0.27;
    const x = cx + Math.cos(t) * r;
    const y = cy + Math.sin(t) * r * 0.92;
    if (t === 0.4) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // 눈
  const [ex, ey] = [PAD + EYE[0] * W, PAD + EYE[1] * H];
  ctx.fillStyle = OUTLINE;
  ctx.beginPath();
  ctx.arc(ex, ey, 7.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(ex, ey, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = OUTLINE;
  ctx.beginPath();
  ctx.arc(ex - 2, ey + 0.5, 3, 0, Math.PI * 2);
  ctx.fill();
  return out;
}

/** 달팽이 경주: 1등은 서버가 정하고, 나머지 둘은 조금씩 늦게 들어온다. 중간 순위는 매번 다르게 흔든다. */
export class SnailWindow extends BetWindow {
  private background: HTMLImageElement | null = null;
  private snails: HTMLCanvasElement[] = [];
  /** 그림을 다 읽으면 끝난다. 못 읽어도 끝나고, 그때는 그림 없이 동그라미 달팽이로 달린다. */
  private readonly assets: Promise<void>;

  constructor(parent: HTMLElement, economy: Economy, placeBet: PlaceBet) {
    super(parent, economy, 'snail', placeBet, STAGE_H);
    this.drawRace([0, 0, 0], null, 0);
    this.assets = Promise.all([loadImage(BACKGROUND), loadImage(SNAIL)])
      .then(([background, silhouette]) => {
        this.background = background;
        this.snails = SNAIL_COLORS.map((color) => paintSnail(silhouette, color));
      })
      .catch(() => undefined)
      .then(() => this.drawRace([0, 0, 0], null, 0));
  }

  /** progress: 달팽이마다 0(출발)~1(결승), winner: 1등 칸(아직이면 null), ms: 꿈틀거림에 쓰는 시간 */
  private drawRace(progress: number[], winner: number | null, ms: number) {
    const { ctx } = this;
    if (this.background) ctx.drawImage(this.background, 0, 0, STAGE_W, STAGE_H);
    else this.clear('#7a9a3a');

    // 결승선: 체크무늬 띠
    const top = LANE_Y[0] - 14;
    const bottom = LANE_Y[2] + 10;
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(FINISH_X - 1, top - 1, 8, bottom - top + 2);
    for (let y = top, k = 0; y < bottom; y += 3, k++) {
      ctx.fillStyle = k & 1 ? '#1d1d22' : '#f4f4f0';
      ctx.fillRect(FINISH_X, y, 3, Math.min(3, bottom - y));
      ctx.fillStyle = k & 1 ? '#f4f4f0' : '#1d1d22';
      ctx.fillRect(FINISH_X + 3, y, 3, Math.min(3, bottom - y));
    }

    progress.forEach((p, lane) => {
      const x = START_X + (FINISH_X - START_X) * p;
      const foot = LANE_Y[lane] + 6;
      // 기어갈 때는 몸을 늘였다 줄인다.
      const crawl = p > 0 && p < 1 ? Math.sin(ms / 90 + lane * 2) * 0.06 : 0;
      const w = SNAIL_W * (1 + crawl);
      const h = SNAIL_H * (1 - crawl);
      const snail = this.snails[lane];
      if (winner === lane) {
        // 1등은 뒤에 금빛을 깔고, 다른 줄과 겹치지 않게 같은 줄 왼쪽에 글씨를 쓴다.
        const glow = ctx.createRadialGradient(x, foot - h / 2, 2, x, foot - h / 2, 26);
        glow.addColorStop(0, 'rgba(255, 230, 120, 0.9)');
        glow.addColorStop(1, 'rgba(255, 230, 120, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x - 26, foot - h / 2 - 26, 52, 52);
        this.text('1등!', x - w / 2 - 16, foot - h / 2, 13, GOLD, OUTLINE);
      }
      if (snail) {
        ctx.save();
        ctx.translate(x, foot);
        ctx.scale(-1, 1);
        ctx.drawImage(snail, -w / 2, -h, w, h);
        ctx.restore();
        // 껍데기에 번호를 쓴다. 뒤집었으므로 껍데기 가운데는 그림 왼쪽에서 37% 자리다.
        const shellX = x - w / 2 + w * (1 - (PAD + SHELL_CENTER[0] * PAINT_W) / (PAINT_W + PAD * 2));
        const shellY = foot - h + h * ((PAD + SHELL_CENTER[1] * PAINT_H) / (PAINT_H + PAD * 2));
        this.text(String(lane + 1), shellX, shellY, 11, '#ffffff', OUTLINE);
      } else {
        this.circle(x, foot - h / 2, h / 2, OUTLINE);
        this.circle(x, foot - h / 2, h / 2 - 2, css(SNAIL_COLORS[lane]));
        this.text(String(lane + 1), x, foot - h / 2, 11, '#ffffff', OUTLINE);
      }
    });
  }

  /** 들어오는 시간이 다른 세 달팽이의 진행도(0~1). 구간마다 빠르기를 흔들어 엎치락뒤치락하게 한다. */
  private static course(finishMs: number) {
    const parts = Array.from({ length: 10 }, () => 0.4 + Math.random());
    const sum = parts.reduce((a, b) => a + b, 0);
    const marks = [0];
    for (const part of parts) marks.push(marks[marks.length - 1] + part / sum);
    return (ms: number) => {
      const t = Math.min(1, ms / finishMs) * parts.length;
      const i = Math.min(parts.length - 1, Math.floor(t));
      return marks[i] + (marks[i + 1] - marks[i]) * (t - i);
    };
  }

  protected async play(outcome: string) {
    await this.assets;
    const winner = Number(outcome) - 1;
    const gaps = [250 + Math.random() * 300, 600 + Math.random() * 500];
    let k = 0;
    const finishes = [0, 1, 2].map((lane) => (lane === winner ? RACE_MS : RACE_MS + gaps[k++]));
    const courses = finishes.map((ms) => SnailWindow.course(ms));
    const last = Math.max(...finishes) + 200;
    await animate(last, (t) => {
      const ms = t * last;
      this.drawRace(
        courses.map((at) => at(ms)),
        ms >= RACE_MS ? winner : null,
        ms,
      );
    });
    await wait(300);
  }

  protected describe(outcome: string) {
    return `${GAMES.snail.picks[Number(outcome) - 1].label} 1등`;
  }
}
