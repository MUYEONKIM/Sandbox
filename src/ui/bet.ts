import { BET_MAX, BET_MIN, GAMES, type BetPick, type BetResult, type GameId } from '../game/casino';
import type { Economy } from '../game/economy';
import type { Color } from '../art/pixels';
import { element } from './dom';
import { PurchaseWindow } from './purchase';

export type PlaceBet = (game: GameId, pick: string, amount: number) => Promise<BetResult | null>;

/** 게임 화면 너비. 높이는 게임마다 다르다. 글씨가 뭉개지지 않게 두 배 해상도로 그린다. */
export const STAGE_W = 320;
const STAGE_SCALE = 2;
const FONT = "'Malgun Gothic', 'Apple SD Gothic Neo', system-ui, sans-serif";

/** 만화풍 그림의 테두리색 */
export const OUTLINE = '#2a1a10';
export const GOLD = '#f2cf6a';
export const RED = '#d8413b';
export const BLUE = '#2f5fa8';

/** 거는 돈에 더하는 버튼 */
const CHIPS = [100, 1_000, 10_000];
const DEFAULT_BET = 100;

export const css = (c: Color) => `#${c.toString(16).padStart(6, '0')}`;

/** duration(ms) 동안 frame(0~1)을 부른다. 탭이 숨으면 멈췄다가 돌아오면 이어서 끝난다. */
export function animate(duration: number, frame: (t: number) => void) {
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

export const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** public 폴더의 그림을 읽는다. 실제 사이트는 하위 경로에서 열리므로 상대 경로로 쓴다. */
export function loadImage(path: string) {
  const image = new Image();
  image.src = path;
  return image.decode().then(() => image);
}

/**
 * 도박장 게임 창의 공통 틀: 게임 화면, 걸 곳 버튼, 거는 돈, 걸기 버튼, 결과 한 줄.
 * 결과는 서버가 정하고, 창은 받은 결과에 맞춰 연출만 한다. 건 돈은 바로 빠진 것처럼 보이고 연출이 끝나면 딴 돈이 들어온다.
 */
export abstract class BetWindow extends PurchaseWindow {
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
    protected readonly stageH: number,
  ) {
    const info = GAMES[game];
    super(parent, economy, info.name, info.blurb);
    this.root.classList.add('casino');

    const canvas = element('casino-stage', this.root, 'canvas') as HTMLCanvasElement;
    canvas.width = STAGE_W * STAGE_SCALE;
    canvas.height = stageH * STAGE_SCALE;
    canvas.style.aspectRatio = `${STAGE_W} / ${stageH}`;
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

  protected clear(color: string) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, STAGE_W, this.stageH);
  }

  /** 글씨를 쓴다. stroke를 주면 그 색으로 굵은 테두리를 두른다. */
  protected text(text: string, x: number, y: number, size: number, color: string, stroke?: string) {
    const { ctx } = this;
    ctx.font = `bold ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = Math.max(2, size / 4);
      ctx.lineJoin = 'round';
      ctx.strokeText(text, x, y);
    }
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
