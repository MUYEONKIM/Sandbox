import { assetUrl } from '../assetUrl';
import type { Economy } from '../game/economy';
import { animate, BetWindow, loadImage, STAGE_W, wait, type PlaceBet } from './bet';
import { ellipse, once, OUT, piece, rect, ring, stamp, textArt } from './pixelArt';
import { sound } from '../sound/engine';

const STAGE_H = 190;
/**
 * 판 배경(2026-11-16 새 모습, 디자인 세션 casino-ui.md 2-1): 짙은 나무 판자 벽, 금색 띠, 양쪽 벽등, 사슬에 매단 "홀 짝" 간판,
 * 나무 테 초록 펠트 탁자, 홀(빨강)·짝(파랑) 고리, 그릇 받침, 번호 1~10 구슬 받침. 한 장을 그대로 찍는다.
 */
const BACKGROUND = assetUrl('casino/oddeven-table.png');

/** 엎어 둔 그릇의 테 가운데. 들어 올리면 오른쪽 위로 비켜 선다. */
const BOWL_DOWN = { x: 160, y: 152 };
const BOWL_UP = { x: 268, y: 106 };

/** 홀(왼쪽)과 짝(오른쪽) 고리. 배경 그림의 자리와 같다. */
const ODD = { x: 66, y: 128, label: '홀', light: '#ff8a7a' };
const EVEN = { x: 254, y: 128, label: '짝', light: '#8ab4ff' };
/** 그릇 받침 가운데 */
const MAT = { x: 160, y: 126 };
/** 센 구슬이 옮겨 가는 구슬 받침 10칸 */
const TRAY = { x0: 62, y: 172, step: 20 };
const MARBLE_COLORS = [
  ['#e8f4ff', '#9fd0ff', '#4a7ab8'],
  ['#ffe8f2', '#ff9ec7', '#b84a7a'],
  ['#ecffe8', '#a8f0a0', '#4a9a4a'],
  ['#fff8e0', '#ffe27a', '#b8902a'],
  ['#f2ecff', '#c9a8ff', '#6a4ab8'],
];
/** 엎어 둔 그릇 아래 구슬 자리. 개수만큼 앞에서부터 쓴다. */
const UNDER = [
  [0, 0],
  [-10, 1],
  [10, 1],
  [-5, -5],
  [5, -5],
  [-15, -3],
  [15, -3],
  [-5, 6],
  [5, 6],
  [0, -9],
];

const easeOut = (t: number) => 1 - (1 - t) ** 3;

interface Scene {
  /** 그릇 위치와 기울기 */
  bowlX: number;
  bowlY: number;
  tilt: number;
  /** 보이는 구슬 수 */
  marbles: number;
  /** 지금까지 센 구슬 수. 센 구슬은 받침 칸으로 옮기고, 마지막으로 센 구슬이 커진다. */
  counted: number;
  /** 결과가 나왔으면 홀(0) 또는 짝(1) */
  result: number | null;
  /** 결과 강조가 깜빡이는 정도(0~1) */
  glow: number;
}

const RESTING: Scene = { bowlX: BOWL_DOWN.x, bowlY: BOWL_DOWN.y, tilt: 0, marbles: 0, counted: 0, result: null, glow: 0 };

/** 구슬 한 알 */
function marble(i: number, big = false) {
  return once(`marble:${i}:${big}`, () => {
    const r = big ? 6 : 4.5;
    const s = Math.ceil(r * 2) + 2;
    return piece(s, s, (g) => {
      const [hi, mid, lo] = MARBLE_COLORS[i % MARBLE_COLORS.length];
      ellipse(g, s / 2, s / 2, r + 1, r + 1, OUT);
      ellipse(g, s / 2, s / 2, r, r, (x, y) => {
        const t = (x - s / 2 + y - s / 2) / (r * 2);
        return t < -0.35 ? hi : t < 0.25 ? mid : lo;
      });
      rect(g, Math.round(s / 2 - r / 2), Math.round(s / 2 - r / 2), 2, 2, '#ffffff');
    });
  });
}

/** 놋그릇(엎어 둔 모양): 붉은 띠, 꼭지 */
function bowl() {
  return once('bowl', () =>
    piece(66, 44, (g) => {
      const cx = 33;
      const base = 36;
      for (let y = 4; y <= base; y++) {
        const t = (base - y) / 32;
        const half = Math.round(30 * Math.sqrt(Math.max(0, 1 - t * t)));
        rect(g, cx - half - 1, y, half * 2 + 2, 1, OUT);
      }
      for (let y = 5; y <= base - 1; y++) {
        const t = (base - y) / 32;
        const half = Math.round(30 * Math.sqrt(Math.max(0, 1 - t * t))) - 1;
        for (let x = -half; x <= half; x++) {
          const u = x / (half + 0.01);
          rect(g, cx + x, y, 1, 1, u < -0.55 ? '#fff0a8' : u < -0.1 ? '#f2c14e' : u < 0.5 ? '#d8a23a' : '#9a6a1e');
        }
      }
      rect(g, cx - 28, 22, 56, 4, '#b23a3a');
      rect(g, cx - 28, 22, 56, 1, '#d85a4a');
      rect(g, cx - 17, 10, 3, 8, '#fff8d0');
      rect(g, cx - 33, base - 1, 66, 7, OUT);
      rect(g, cx - 32, base, 64, 5, '#c8962e');
      rect(g, cx - 32, base, 64, 1, '#f2c14e');
      rect(g, cx - 6, 0, 12, 6, OUT);
      rect(g, cx - 5, 1, 10, 4, '#f2c14e');
    }),
  );
}

/** 이긴 자리 강조: 바둑판 무늬 빛, 밝은 고리, 흰 글자 */
function winArt(p: typeof ODD, pulse: boolean) {
  return once(`oe-win:${p.label}:${pulse}`, () =>
    piece(108, 70, (g) => {
      ellipse(g, 54, 35, 52, 33, (x, y) => ((x + y) & 1 ? (pulse ? 'rgba(255,236,150,0.5)' : 'rgba(255,236,150,0.3)') : null));
      ring(g, 54, 35, 46, 28, 4, pulse ? '#fff6d8' : '#f2cf6a');
      stamp(g, textArt(p.label, 22, '#ffffff'), 54, 34);
    }),
  );
}

/** 홀짝: 딜러가 놋그릇을 흔들고 들어 올리면 구슬(1~10개)이 나오고, 하나씩 센 뒤 홀이나 짝 자리에 불이 들어온다. */
export class OddEvenWindow extends BetWindow {
  private background: HTMLImageElement | null = null;
  /** 배경을 다 읽으면 끝난다. 못 읽어도 끝나고, 그때는 배경 없이 그린다. */
  private readonly assets: Promise<void>;

  constructor(parent: HTMLElement, economy: Economy, placeBet: PlaceBet) {
    super(parent, economy, 'oddeven', placeBet, STAGE_H);
    this.assets = loadImage(BACKGROUND)
      .then((image) => {
        this.background = image;
      })
      .catch(() => undefined)
      .then(() => {
        if (!this.busy) this.draw(RESTING);
      });
  }

  /** 한 장면. 가만히 있을 때는 부르지 않고, 연출(animate)이 도는 동안만 매 프레임 부른다. */
  private draw(s: Scene) {
    const { ctx } = this;
    ctx.imageSmoothingEnabled = false;
    if (this.background) ctx.drawImage(this.background, 0, 0, STAGE_W, STAGE_H);
    else this.clear('#2a1810');
    // 결과 자리: 이긴 쪽 고리가 밝게 깜빡이고 진 쪽은 어두워진다.
    if (s.result !== null) {
      const win = s.result === 0 ? ODD : EVEN;
      const lose = s.result === 0 ? EVEN : ODD;
      stamp(ctx, winArt(win, s.glow > 0.5), win.x, win.y);
      stamp(ctx, once('oe-dim', () => piece(98, 62, (g) => ellipse(g, 49, 31, 48, 30, 'rgba(10,6,4,0.45)'))), lose.x, lose.y);
    }
    // 구슬: 센 것은 받침 칸으로, 아직 안 센 것은 그릇 자리에
    for (let i = 0; i < s.marbles; i++) {
      if (i < s.counted) stamp(ctx, marble(i, i === s.counted - 1), TRAY.x0 + i * TRAY.step, TRAY.y - 2);
      else {
        const [dx, dy] = UNDER[i];
        stamp(ctx, marble(i), MAT.x + dx * 1.2, MAT.y + dy * 1.2);
      }
    }
    // 그릇 그림자는 들린 정도를 5단계로 끊어 만들어 둔 것을 쓴다.
    const lift = Math.min(1, Math.hypot(s.bowlX - BOWL_DOWN.x, s.bowlY - BOWL_DOWN.y) / 40);
    const step = Math.round(lift * 4);
    if (step < 4) {
      const shadow = once(`oe-shadow:${step}`, () =>
        piece(72, 16, (g) => ellipse(g, 36, 8, 34 - step * 2, 7, `rgba(0,0,0,${(0.35 * (1 - step / 4)).toFixed(2)})`)),
      );
      stamp(ctx, shadow, MAT.x, MAT.y + 6);
    }
    ctx.save();
    ctx.translate(Math.round(s.bowlX), Math.round(s.bowlY - 24));
    ctx.rotate(s.tilt);
    ctx.drawImage(bowl(), -33, -40);
    ctx.restore();
    if (lift === 0 && s.marbles === 0) stamp(ctx, textArt('?', 16, '#ffffff'), s.bowlX, s.bowlY - 46);
    if (s.counted > 0 && s.result === null) stamp(ctx, textArt(`${s.counted}`, 18, '#ffffff'), 160, 96);
    if (s.result !== null) {
      const label = s.result === 0 ? '홀' : '짝';
      stamp(ctx, textArt(`${s.counted}개 · ${label}`, 18, s.result === 0 ? ODD.light : EVEN.light), 160, 96);
    }
  }

  protected async play(outcome: string) {
    await this.assets;
    const count = Number(outcome);
    const scene = { ...RESTING };
    sound.play('bowl_shake');
    await animate(1000, (t) => {
      const wobble = Math.sin(t * Math.PI * 12);
      this.draw({ ...scene, bowlX: BOWL_DOWN.x + wobble * 6 * (1 - t * 0.4), tilt: wobble * 0.08 });
    });
    sound.play('bowl_lift');
    await animate(450, (t) => {
      const k = easeOut(t);
      this.draw({
        ...scene,
        bowlX: BOWL_DOWN.x + (BOWL_UP.x - BOWL_DOWN.x) * k,
        bowlY: BOWL_DOWN.y + (BOWL_UP.y - BOWL_DOWN.y) * k,
        tilt: 0.3 * k,
        marbles: count,
      });
    });
    const lifted = { ...scene, bowlX: BOWL_UP.x, bowlY: BOWL_UP.y, tilt: 0.3, marbles: count };
    for (let counted = 1; counted <= count; counted++) {
      this.draw({ ...lifted, counted });
      sound.play('marble', { rate: 1 + 0.03 * (counted - 1) });
      await wait(170);
    }
    const result = count % 2 ? 0 : 1;
    await animate(700, (t) => this.draw({ ...lifted, counted: count, result, glow: Math.abs(Math.sin(t * Math.PI * 2)) }));
    this.draw({ ...lifted, counted: count, result, glow: 0 });
    await wait(200);
  }

  protected describe(outcome: string) {
    const count = Number(outcome);
    return `구슬 ${count}개 · ${count % 2 ? '홀' : '짝'}`;
  }
}
