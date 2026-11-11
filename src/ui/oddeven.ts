import type { Economy } from '../game/economy';
import { animate, BetWindow, BLUE, GOLD, OUTLINE, RED, STAGE_W, wait, type PlaceBet } from './bet';

const STAGE_H = 190;

/** 엎어 둔 그릇의 테 가운데. 들어 올리면 오른쪽 위로 비켜 선다. */
const BOWL_DOWN = { x: 160, y: 152 };
const BOWL_UP = { x: 268, y: 106 };
const BOWL_W = 92;
const BOWL_H = 52;

/** 홀(왼쪽)과 짝(오른쪽) 자리 */
const PLATES = [
  { x: 58, y: 150, label: '홀', color: RED, light: '#ff7a6e' },
  { x: 262, y: 152, label: '짝', color: BLUE, light: '#6f9cff' },
];

/** 그릇 아래 구슬 자리. 개수만큼 앞에서부터 쓴다. */
const MARBLE_AT = [
  [0, 0],
  [-17, 1],
  [17, 1],
  [-9, -9],
  [9, -9],
  [-26, -7],
  [26, -7],
  [-9, 10],
  [9, 10],
  [0, -17],
];
const MARBLE_CENTER = { x: 160, y: 140 };
const MARBLE_R = 9;
/** 구슬이 커진 만큼 자리 간격도 넓힌다. */
const MARBLE_SPREAD = 1.25;
const MARBLE_COLORS = ['#8fd3ff', '#ff9ec7', '#a8f0a0', '#ffe27a', '#c9a8ff'];

const easeOut = (t: number) => 1 - (1 - t) ** 3;

interface Scene {
  /** 그릇 위치와 기울기 */
  bowlX: number;
  bowlY: number;
  tilt: number;
  /** 보이는 구슬 수 */
  marbles: number;
  /** 지금까지 센 구슬 수. 마지막으로 센 구슬이 커진다. */
  counted: number;
  /** 결과가 나왔으면 홀(0) 또는 짝(1) */
  result: number | null;
  /** 결과 강조가 깜빡이는 정도(0~1) */
  glow: number;
}

const RESTING: Scene = { bowlX: BOWL_DOWN.x, bowlY: BOWL_DOWN.y, tilt: 0, marbles: 0, counted: 0, result: null, glow: 0 };

/** 홀짝: 딜러가 놋그릇을 흔들고 들어 올리면 구슬(1~10개)이 나오고, 하나씩 센 뒤 홀이나 짝 자리에 불이 들어온다. */
export class OddEvenWindow extends BetWindow {
  constructor(parent: HTMLElement, economy: Economy, placeBet: PlaceBet) {
    super(parent, economy, 'oddeven', placeBet, STAGE_H);
    this.draw(RESTING);
  }

  private draw(scene: Scene) {
    this.drawRoom();
    this.drawTable();
    PLATES.forEach((plate, i) => this.drawPlate(plate, scene.result === null ? 0 : scene.result === i ? 1 : -1, scene.glow));
    this.drawMarbles(scene.marbles, scene.counted);
    this.drawBowl(scene);
    if (scene.counted > 0) this.text(`구슬 ${scene.counted}개`, 160, 178, 13, '#ffffff', OUTLINE);
    if (scene.result !== null) {
      const plate = PLATES[scene.result];
      this.text(`${plate.label}!`, 160, 84, 30 + scene.glow * 3, plate.light, OUTLINE);
    }
    this.drawSign();
  }

  /** 뒤 벽: 붉은 커튼 주름과 위쪽 금색 띠 */
  private drawRoom() {
    const { ctx } = this;
    for (let x = 0; x < STAGE_W; x += 20) {
      const fold = ctx.createLinearGradient(x, 0, x + 20, 0);
      fold.addColorStop(0, '#7a1c34');
      fold.addColorStop(0.5, '#5e1428');
      fold.addColorStop(1, '#42101e');
      ctx.fillStyle = fold;
      ctx.fillRect(x, 0, 20, STAGE_H);
    }
    ctx.fillStyle = '#b8862b';
    ctx.fillRect(0, 0, STAGE_W, 5);
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(0, 5, STAGE_W, 2);
  }

  /** 아래쪽 반을 채우는 둥근 펠트 탁자. 나무 테와 금색 선을 둘렀다. */
  private drawTable() {
    const { ctx } = this;
    const ellipse = (rx: number, ry: number, fill: string | CanvasGradient) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.ellipse(160, 236, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    ellipse(196, 157, OUTLINE);
    ellipse(193, 154, '#8a5a34');
    ellipse(184, 145, '#5e3a20');
    const felt = ctx.createRadialGradient(160, 150, 10, 160, 180, 170);
    felt.addColorStop(0, '#3fae68');
    felt.addColorStop(1, '#1f6a3c');
    ellipse(181, 142, felt);
    ctx.strokeStyle = 'rgba(242, 207, 106, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(160, 236, 172, 133, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** 홀, 짝 자리. state 1이면 불이 들어오고, -1이면 어두워진다. */
  private drawPlate(plate: (typeof PLATES)[number], state: number, glow: number) {
    const { ctx } = this;
    const { x, y } = plate;
    if (state === 1) {
      const halo = ctx.createRadialGradient(x, y, 10, x, y, 52);
      halo.addColorStop(0, `rgba(255, 236, 150, ${0.55 + glow * 0.35})`);
      halo.addColorStop(1, 'rgba(255, 236, 150, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.ellipse(x, y, 56, 36, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const disc = (rx: number, ry: number, fill: string | CanvasGradient) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    disc(35, 21, OUTLINE);
    disc(32, 18, GOLD);
    const face = ctx.createLinearGradient(x, y - 15, x, y + 15);
    face.addColorStop(0, plate.light);
    face.addColorStop(1, plate.color);
    disc(27, 14, face);
    this.text(plate.label, x, y, 18, '#ffffff', OUTLINE);
    if (state === -1) disc(35, 21, 'rgba(20, 10, 10, 0.5)');
  }

  private drawMarbles(count: number, counted: number) {
    const { ctx } = this;
    const order = MARBLE_AT.slice(0, count)
      .map(([dx, dy], i) => ({ x: MARBLE_CENTER.x + dx * MARBLE_SPREAD, y: MARBLE_CENTER.y + dy * MARBLE_SPREAD, i }))
      .sort((a, b) => a.y - b.y);
    for (const { x, y, i } of order) {
      const current = i === counted - 1;
      const r = MARBLE_R * (current ? 1.3 : 1);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.beginPath();
      ctx.ellipse(x + 1, y + r * 0.8, r, r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      const base = MARBLE_COLORS[i % MARBLE_COLORS.length];
      const glass = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, 1, x, y, r);
      glass.addColorStop(0, '#ffffff');
      glass.addColorStop(0.45, base);
      glass.addColorStop(1, '#3a4a66');
      ctx.fillStyle = glass;
      ctx.strokeStyle = current ? GOLD : OUTLINE;
      ctx.lineWidth = current ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x - r * 0.35, y - r * 0.4, r * 0.25, 0, Math.PI * 2);
      ctx.fill();
      if (i < counted) this.text(String(i + 1), x, y - r - 6, 9, '#ffffff', OUTLINE);
    }
  }

  /** 엎어 둔 놋그릇: 반달 모양 몸통, 붉은 띠, 꼭지, 테. 바닥에 그림자가 진다. */
  private drawBowl({ bowlX: x, bowlY: y, tilt, marbles }: Scene) {
    const { ctx } = this;
    const lift = Math.min(1, Math.hypot(x - BOWL_DOWN.x, y - BOWL_DOWN.y) / 40);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.3 * (1 - lift)})`;
    ctx.beginPath();
    ctx.ellipse(BOWL_DOWN.x, BOWL_DOWN.y + 4, BOWL_W / 2 + 6, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    const dome = () => {
      ctx.beginPath();
      ctx.ellipse(0, 0, BOWL_W / 2, BOWL_H, 0, Math.PI, 0);
      ctx.closePath();
    };
    ctx.lineJoin = 'round';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 6;
    dome();
    ctx.stroke();
    const brass = ctx.createLinearGradient(-BOWL_W / 2, 0, BOWL_W / 2, 0);
    brass.addColorStop(0, '#fff0a8');
    brass.addColorStop(0.35, '#f2c14e');
    brass.addColorStop(1, '#9a6a1e');
    ctx.fillStyle = brass;
    dome();
    ctx.fill();
    // 붉은 띠와 빛
    ctx.save();
    dome();
    ctx.clip();
    ctx.fillStyle = '#b23a3a';
    ctx.fillRect(-BOWL_W / 2, -20, BOWL_W, 7);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.ellipse(-20, -32, 7, 15, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // 테와 꼭지
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(-BOWL_W / 2 - 6, -3, BOWL_W + 12, 10);
    ctx.fillStyle = '#c8962e';
    ctx.fillRect(-BOWL_W / 2 - 4, -1, BOWL_W + 8, 6);
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(-9, -BOWL_H - 8, 18, 10);
    ctx.fillStyle = '#f2c14e';
    ctx.fillRect(-7, -BOWL_H - 6, 14, 6);
    ctx.restore();
    if (lift === 0 && marbles === 0) this.text('?', x, y - 30, 20, '#ffffff', OUTLINE);
  }

  /** 사슬에 매달린 간판 */
  private drawSign() {
    const { ctx } = this;
    for (const cx of [104, 216]) {
      for (let y = 0; y < 18; y += 6) {
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 3;
        ctx.strokeRect(cx - 2, y, 4, 6);
        ctx.strokeStyle = '#8a929c';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(cx - 2, y, 4, 6);
      }
    }
    const board = (inset: number) => {
      const [x0, x1, y0, y1, cut] = [86 + inset, 234 - inset, 14 + inset, 52 - inset, 10];
      ctx.beginPath();
      ctx.moveTo(x0 + cut, y0);
      ctx.lineTo(x1 - cut, y0);
      ctx.lineTo(x1, y0 + cut);
      ctx.lineTo(x1, y1 - cut);
      ctx.lineTo(x1 - cut, y1);
      ctx.lineTo(x0 + cut, y1);
      ctx.lineTo(x0, y1 - cut);
      ctx.lineTo(x0, y0 + cut);
      ctx.closePath();
    };
    ctx.fillStyle = OUTLINE;
    board(-3);
    ctx.fill();
    ctx.fillStyle = '#7a5a3a';
    board(0);
    ctx.fill();
    ctx.fillStyle = '#16110e';
    board(4);
    ctx.fill();
    for (const [bx, by] of [
      [104, 20],
      [216, 20],
      [104, 46],
      [216, 46],
    ]) {
      ctx.fillStyle = '#8a929c';
      ctx.fillRect(bx - 3, by - 3, 6, 6);
    }
    this.text('홀짝 게임', 160, 33, 19, GOLD, OUTLINE);
  }

  protected async play(outcome: string) {
    const count = Number(outcome);
    const scene = { ...RESTING };
    await animate(1000, (t) => {
      const wobble = Math.sin(t * Math.PI * 12);
      this.draw({ ...scene, bowlX: BOWL_DOWN.x + wobble * 6 * (1 - t * 0.4), tilt: wobble * 0.08 });
    });
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
