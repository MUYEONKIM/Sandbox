import {
  BET_MAX,
  BET_MIN,
  GAME_IDS,
  GAMES,
  SNAIL_COLORS,
  type BetPick,
  type BetResult,
  type GameId,
} from '../game/casino';
import type { Economy } from '../game/economy';
import type { Color } from '../art/pixels';
import { element } from './dom';
import { PurchaseWindow } from './purchase';

export type PlaceBet = (game: GameId, pick: string, amount: number) => Promise<BetResult | null>;

/** 게임 화면 크기. 글씨가 뭉개지지 않게 두 배 해상도로 그린다. */
const STAGE_W = 320;
const STAGE_H = 160;
const STAGE_SCALE = 2;
const FONT = "'Malgun Gothic', 'Apple SD Gothic Neo', system-ui, sans-serif";

const FELT = '#1f4a32';
const INK = '#f7ecd6';
const DIM = '#b9a88c';
const GOLD = '#f2cf6a';
const RED = '#d8413b';
const BLUE = '#2f5fa8';

/** 거는 돈에 더하는 버튼 */
const CHIPS = [100, 1_000, 10_000];
const DEFAULT_BET = 100;

const css = (c: Color) => `#${c.toString(16).padStart(6, '0')}`;

/** duration(ms) 동안 frame(0~1)을 부른다. 탭이 숨으면 멈췄다가 돌아오면 이어서 끝난다. */
function animate(duration: number, frame: (t: number) => void) {
  return new Promise<void>((resolve) => {
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      frame(t);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * 도박장 게임 창의 공통 틀: 게임 화면, 걸 곳 버튼, 거는 돈, 걸기 버튼, 결과 한 줄.
 * 결과는 서버가 정하고, 창은 받은 결과에 맞춰 연출만 한다. 건 돈은 바로 빠진 것처럼 보이고 연출이 끝나면 딴 돈이 들어온다.
 */
abstract class BetWindow extends PurchaseWindow {
  protected readonly ctx: CanvasRenderingContext2D;
  private pick: BetPick | null = null;
  private amount = DEFAULT_BET;
  private readonly input: HTMLInputElement;
  private readonly message: HTMLElement;

  protected constructor(
    parent: HTMLElement,
    economy: Economy,
    private readonly game: GameId,
    private readonly placeBet: PlaceBet,
  ) {
    const info = GAMES[game];
    super(parent, economy, info.name, info.blurb);
    this.root.classList.add('casino');

    const canvas = element('casino-stage', this.root, 'canvas') as HTMLCanvasElement;
    canvas.width = STAGE_W * STAGE_SCALE;
    canvas.height = STAGE_H * STAGE_SCALE;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.scale(STAGE_SCALE, STAGE_SCALE);
    this.message = element('casino-message', this.root);

    element('office-section', this.root).textContent = '어디에 거시겠습니까';
    const picks = element(`casino-picks casino-picks-${game}`, this.root);
    for (const pick of info.picks) {
      const button = element('casino-pick', picks, 'button') as HTMLButtonElement;
      button.type = 'button';
      element('casino-pick-label', button).textContent = pick.label;
      element('casino-pick-odds', button).textContent = `${pick.odds}배`;
      button.addEventListener('click', () => {
        this.pick = pick;
        this.render();
      });
      this.refreshers.push(() => {
        button.classList.toggle('chosen', this.pick === pick);
        button.disabled = this.busy;
      });
    }

    element('office-section', this.root).textContent = `거는 돈 (${BET_MIN}G ~ ${BET_MAX.toLocaleString()}G)`;
    const row = element('casino-amount', this.root);
    this.input = element('casino-input', row, 'input') as HTMLInputElement;
    this.input.type = 'number';
    this.input.min = String(BET_MIN);
    this.input.max = String(BET_MAX);
    this.input.step = '10';
    this.input.value = String(this.amount);
    this.input.addEventListener('input', () => {
      this.amount = Math.floor(Number(this.input.value)) || 0;
      this.render();
    });
    const chip = (label: string, next: () => number) => {
      const button = element('casino-chip', row, 'button') as HTMLButtonElement;
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => this.setAmount(next()));
      this.refreshers.push(() => {
        button.disabled = this.busy;
      });
    };
    for (const add of CHIPS) chip(`+${add.toLocaleString()}`, () => this.amount + add);
    chip('최대', () => Math.min(this.economy.gold, BET_MAX));
    chip('지우기', () => 0);
    this.refreshers.push(() => {
      this.input.disabled = this.busy;
    });

    const bet = element('office-sell', this.root, 'button') as HTMLButtonElement;
    bet.type = 'button';
    bet.addEventListener('click', () => void this.bet());
    this.refreshers.push(() => {
      const problem = this.problem();
      bet.disabled = this.busy || problem !== null;
      if (this.busy) bet.textContent = '결과를 기다리는 중...';
      else bet.textContent = problem ?? `${this.pick!.label}에 ${this.amount.toLocaleString()}G 걸기`;
    });

    this.finish();
  }

  /** 서버가 정한 결과를 연출한다. 끝나면 돌아온다. */
  protected abstract play(outcome: string): Promise<void>;
  /** 결과를 한 줄로 */
  protected abstract describe(outcome: string): string;

  private setAmount(amount: number) {
    this.amount = Math.max(0, Math.min(amount, BET_MAX));
    this.input.value = String(this.amount);
    this.render();
  }

  /** 걸 수 없는 이유. 걸 수 있으면 null */
  private problem() {
    if (!this.pick) return '걸 곳을 먼저 고르세요';
    if (this.amount < BET_MIN) return `${BET_MIN}G부터 걸 수 있습니다`;
    if (this.amount > BET_MAX) return `한 판에 ${BET_MAX.toLocaleString()}G까지입니다`;
    if (this.amount > this.economy.gold) return '골드가 모자랍니다';
    return null;
  }

  private say(text: string, kind: 'win' | 'lose' | '' = '') {
    this.message.textContent = text;
    this.message.className = `casino-message ${kind}`;
  }

  private async bet() {
    const { pick, amount } = this;
    if (!pick || this.problem() || this.busy) return;
    this.busy = true;
    this.say('');
    this.render();
    try {
      const result = await this.placeBet(this.game, pick.id, amount);
      if (!result) {
        this.say('판이 엎어졌습니다. 잠시 후 다시 걸어 주세요.', 'lose');
        return;
      }
      this.economy.setGold(result.gold - result.payout);
      await this.play(result.outcome);
      const text = this.describe(result.outcome);
      if (result.payout > 0) this.say(`${text} · ${result.payout.toLocaleString()}G를 받았습니다!`, 'win');
      else this.say(`${text} · ${amount.toLocaleString()}G를 잃었습니다`, 'lose');
      this.economy.setGold(result.gold);
    } finally {
      this.busy = false;
      this.render();
    }
  }

  protected clear(color = FELT) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  }

  protected text(text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center') {
    const { ctx } = this;
    ctx.font = `bold ${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  protected circle(x: number, y: number, r: number, color: string) {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 사다리: 출발(좌, 우)과 가로줄 수(3, 4)를 서버가 정한다. 공이 위에서 내려오며 가로줄을 만날 때마다 건너간다. */
class LadderWindow extends BetWindow {
  private static readonly RAILS = [110, 210];
  private static readonly TOP = 34;
  private static readonly BOTTOM = 128;

  constructor(parent: HTMLElement, economy: Economy, placeBet: PlaceBet) {
    super(parent, economy, 'ladder', placeBet);
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

/** 홀짝: 딜러가 그릇을 흔들고 들어 올리면 구슬(1~10개)이 하나씩 굴러 나온다. */
class OddEvenWindow extends BetWindow {
  constructor(parent: HTMLElement, economy: Economy, placeBet: PlaceBet) {
    super(parent, economy, 'oddeven', placeBet);
    this.drawTable(0, 0, 0);
  }

  /** shake: 그릇 흔들림(-1~1), lift: 그릇이 들린 정도(0~1), marbles: 보이는 구슬 수 */
  private drawTable(shake: number, lift: number, marbles: number) {
    const { ctx } = this;
    this.clear();
    ctx.fillStyle = '#2a5c40';
    ctx.beginPath();
    ctx.ellipse(160, 104, 120, 36, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < marbles; i++) {
      const x = 160 + ((i % 5) - 2) * 22;
      const y = 92 + Math.floor(i / 5) * 22;
      this.circle(x, y, 8, '#d6dce4');
      this.circle(x - 3, y - 3, 3, '#ffffff');
    }
    if (marbles > 0) this.text(`${marbles}개`, 290, 24, 16, GOLD, 'right');
    // 엎어 둔 그릇
    const bx = 160 + shake * 10;
    const by = 100 - lift * 44;
    ctx.fillStyle = '#7a3a2a';
    ctx.beginPath();
    ctx.ellipse(bx, by, 62, 50, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#5a2a1e';
    ctx.fillRect(bx - 64, by - 4, 128, 8);
    ctx.fillStyle = '#9a4a34';
    ctx.fillRect(bx - 34, by - 40, 16, 6);
    if (lift === 0 && marbles === 0) this.text('?', bx, by - 22, 24, GOLD);
  }

  protected async play(outcome: string) {
    const count = Number(outcome);
    await animate(900, (t) => this.drawTable(Math.sin(t * Math.PI * 10) * (1 - t), 0, 0));
    await animate(350, (t) => this.drawTable(0, t, 0));
    for (let i = 1; i <= count; i++) {
      this.drawTable(0, 1, i);
      await wait(140);
    }
    this.text(count % 2 ? '홀' : '짝', 40, 30, 28, count % 2 ? '#ff8a7a' : '#8ab8ff');
    await wait(300);
  }

  protected describe(outcome: string) {
    const count = Number(outcome);
    return `구슬 ${count}개 · ${count % 2 ? '홀' : '짝'}`;
  }
}

/** 달팽이 경주: 1등은 서버가 정하고, 나머지 둘은 조금씩 늦게 들어온다. 중간 순위는 매번 다르게 흔든다. */
class SnailWindow extends BetWindow {
  private static readonly START = 34;
  private static readonly FINISH = 288;
  private static readonly RACE_MS = 4200;

  constructor(parent: HTMLElement, economy: Economy, placeBet: PlaceBet) {
    super(parent, economy, 'snail', placeBet);
    this.drawRace([0, 0, 0], null);
  }

  private static laneY(lane: number) {
    return 38 + lane * 42;
  }

  private drawRace(progress: number[], winner: number | null) {
    const { START, FINISH } = SnailWindow;
    const { ctx } = this;
    this.clear('#3f7a34');
    for (let lane = 0; lane < 3; lane++) {
      const y = SnailWindow.laneY(lane);
      ctx.fillStyle = lane & 1 ? '#4f8a3c' : '#5a9a44';
      ctx.fillRect(0, y - 20, STAGE_W, 40);
      this.text(String(lane + 1), 12, y, 14, INK);
    }
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(START - 2, 18, 2, 126);
    for (let k = 0; k < 21; k++) {
      ctx.fillStyle = k & 1 ? '#1d1d22' : '#f4f4f0';
      ctx.fillRect(FINISH, 18 + k * 6, 6, 6);
      ctx.fillStyle = k & 1 ? '#f4f4f0' : '#1d1d22';
      ctx.fillRect(FINISH + 6, 18 + k * 6, 6, 6);
    }
    progress.forEach((p, lane) => {
      const x = START + (FINISH - START) * p;
      const y = SnailWindow.laneY(lane);
      ctx.fillStyle = '#e8d8a8';
      ctx.fillRect(x - 12, y + 4, 24, 7);
      ctx.fillRect(x + 8, y - 4, 4, 9);
      this.circle(x - 2, y, 10, css(SNAIL_COLORS[lane]));
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x - 2, y, 5, 0, Math.PI * 1.5);
      ctx.stroke();
      if (winner === lane) this.text('1등!', x - 4, y - 16, 12, GOLD);
    });
    if (winner === null && progress.every((p) => p === 0)) this.text('출발 대기 중', 160, 150, 11, DIM);
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
    const winner = Number(outcome) - 1;
    const { RACE_MS } = SnailWindow;
    const gaps = [250 + Math.random() * 300, 600 + Math.random() * 500];
    let k = 0;
    const finishes = [0, 1, 2].map((lane) => (lane === winner ? RACE_MS : RACE_MS + gaps[k++]));
    const courses = finishes.map((ms) => SnailWindow.course(ms));
    const last = Math.max(...finishes);
    await animate(last + 200, (t) => {
      const ms = t * (last + 200);
      this.drawRace(
        courses.map((at) => at(ms)),
        ms >= RACE_MS ? winner : null,
      );
    });
    await wait(300);
  }

  protected describe(outcome: string) {
    return `${GAMES.snail.picks[Number(outcome) - 1].label} 1등`;
  }
}

/** 도박장의 게임 창 셋. 게임판 앞 포탈을 밟으면 그 게임 창이 열린다. */
export class CasinoWindows {
  private readonly windows: Record<GameId, BetWindow>;

  constructor(parent: HTMLElement, economy: Economy, placeBet: PlaceBet) {
    this.windows = {
      ladder: new LadderWindow(parent, economy, placeBet),
      oddeven: new OddEvenWindow(parent, economy, placeBet),
      snail: new SnailWindow(parent, economy, placeBet),
    };
  }

  get isOpen() {
    return GAME_IDS.some((id) => this.windows[id].isOpen);
  }

  open(game: GameId) {
    this.close();
    this.windows[game].open();
  }

  close() {
    for (const id of GAME_IDS) this.windows[id].close();
  }
}
