import { Pixels } from './pixels';

export const CHAR_W = 24;
export const CHAR_H = 34;
/** 프레임 안에서 발이 닿는 높이 */
export const CHAR_FOOT_Y = 31;

/** 걸음 프레임 수: 0 서 있음, 1 왼발, 2 오른발 */
export const CHAR_STEPS = 3;

const SKIN = 0xf4cda6;
const SKIN_D = 0xdba67e;
const HAIR = 0x8a4b24;
const HAIR_D = 0x6a3518;
const HAIR_L = 0xb9763c;
const TUNIC = 0x3f74b8;
const TUNIC_D = 0x2d5590;
const SCARF = 0xd04b3f;
const SCARF_D = 0xa33530;
const BELT = 0xe3bc5a;
const PANTS = 0x4b3a2e;
const BOOT = 0x33283a;
const EYE = 0x2a2030;

function legs(rect: (x: number, y: number, w: number, h: number, c: number) => void, step: number) {
  const left = step === 1 ? 1 : step === 2 ? -1 : 0;
  const right = -left;
  for (const [x, shift] of [
    [8, left],
    [13, right],
  ] as const) {
    const foot = 30 + shift;
    rect(x, 26, 3, foot - 27, PANTS);
    rect(x, foot - 1, 3, 2, BOOT);
  }
}

/** 앞을 보는 프레임 (오른쪽 아래를 바라봄) */
function paintFront(p: Pixels, ox: number, step: number) {
  const rect = (x: number, y: number, w: number, h: number, c: number) => p.rect(ox + x, y, w, h, c);
  const bob = step ? -1 : 0;

  legs(rect, step);

  // 몸통
  rect(7, 18 + bob, 10, 9, TUNIC);
  rect(14, 18 + bob, 3, 9, TUNIC_D);
  rect(7, 24 + bob, 10, 1, BELT);
  const swing = step === 1 ? 1 : step === 2 ? -1 : 0;
  rect(5, 18 + bob, 2, 6 + swing, TUNIC_D);
  rect(5, 24 + bob + swing, 2, 1, SKIN);
  rect(17, 18 + bob, 2, 6 - swing, TUNIC);
  rect(17, 24 + bob - swing, 2, 1, SKIN_D);

  // 머리
  const y = 5 + bob;
  rect(5, y, 14, 12, HAIR);
  rect(6, y + 4, 13, 9, SKIN);
  rect(5, y + 1, 14, 3, HAIR);
  rect(5, y + 4, 3, 5, HAIR_D);
  rect(9, y + 4, 2, 1, HAIR);
  rect(14, y + 4, 3, 1, HAIR);
  rect(8, y + 1, 6, 1, HAIR_L);
  rect(6, y - 1, 3, 1, HAIR);
  rect(11, y - 1, 4, 1, HAIR);
  rect(10, y + 6, 2, 3, EYE);
  rect(15, y + 6, 2, 3, EYE);
  rect(10, y + 6, 1, 1, 0xffffff);
  rect(15, y + 6, 1, 1, 0xffffff);
  rect(13, y + 10, 2, 1, SKIN_D);

  // 스카프
  rect(7, 17 + bob, 11, 2, SCARF);
  rect(7, 19 + bob, 3, 2, SCARF_D);
}

/** 등을 보이는 프레임 (오른쪽 위를 바라봄) */
function paintBack(p: Pixels, ox: number, step: number) {
  const rect = (x: number, y: number, w: number, h: number, c: number) => p.rect(ox + x, y, w, h, c);
  const bob = step ? -1 : 0;

  legs(rect, step);

  rect(7, 18 + bob, 10, 9, TUNIC_D);
  rect(7, 24 + bob, 10, 1, BELT);
  const swing = step === 1 ? 1 : step === 2 ? -1 : 0;
  rect(5, 18 + bob, 2, 6 + swing, TUNIC_D);
  rect(5, 24 + bob + swing, 2, 1, SKIN_D);
  rect(17, 18 + bob, 2, 6 - swing, TUNIC_D);
  rect(17, 24 + bob - swing, 2, 1, SKIN_D);

  // 머리 뒤쪽
  const y = 5 + bob;
  rect(5, y, 14, 12, HAIR);
  rect(6, y - 1, 3, 1, HAIR);
  rect(11, y - 1, 4, 1, HAIR);
  rect(8, y + 1, 7, 1, HAIR_L);
  rect(7, y + 3, 3, 1, HAIR_L);
  rect(5, y + 8, 14, 4, HAIR_D);

  // 스카프와 망토 자락
  rect(7, 17 + bob, 10, 2, SCARF);
  rect(9, 19 + bob, 6, 5, SCARF);
  rect(12, 19 + bob, 3, 5, SCARF_D);
}

/** 앞모습 3장, 뒷모습 3장을 가로로 이어 붙인 시트를 만든다. */
export function paintCharacterSheet(): HTMLCanvasElement {
  const p = new Pixels(CHAR_W * CHAR_STEPS * 2, CHAR_H);
  for (let step = 0; step < CHAR_STEPS; step++) {
    paintFront(p, CHAR_W * step, step);
    paintBack(p, CHAR_W * (CHAR_STEPS + step), step);
  }
  p.outlineOuter(0x2a2030);
  for (let i = 0; i < CHAR_STEPS * 2; i++) {
    const cx = CHAR_W * i + CHAR_W / 2;
    for (let x = -6; x <= 6; x++) {
      for (let y = 31; y <= 33; y++) {
        if ((x / 7) ** 2 + ((y - 31.5) / 2.2) ** 2 <= 1) p.set(cx + x, y, 0x1a2a1a, 80);
      }
    }
  }
  return p.toCanvas();
}
