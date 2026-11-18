import type Phaser from 'phaser';

/**
 * 등과 조명의 빛 그림(2026-11-16 사용자 "가로등 장식품은 많이 있는데 빛이 나지 않는다", 설계는 디자인 세션 lantern-glow.md).
 * 실시간 조명 대신 미리 그린 두 장을 가산 혼합으로 얹는다: 바닥 빛 웅덩이(아이소 타원)와 빛무리(원).
 * 도트 그림처럼 알파를 4계단으로 끊고 계단 사이는 4×4 바이어 무늬로 섞는다. 그림은 처음 쓸 때 아틀라스 한 장으로 만든다.
 * 색, 크기, 높이, 깜빡임 깊이는 디자인 세션이 정했다(lantern-glow.md 7-1).
 */

export interface GlowLook {
  color: number;
  /** 바닥 웅덩이 가로 반지름(px). 세로는 절반 */
  pool: number;
  /** 빛무리 반지름(px) */
  halo: number;
  /** 칸 가운데에서 빛무리 가운데까지 올라간 높이(px). 쌓은 높이 z × BLOCK_HEIGHT는 따로 더한다. */
  head: number;
  /** 진하기를 이만큼까지 낮췄다 올린다. */
  flicker: number;
  /** 불(모닥불, 벽난로, 호박등, 난로, 용암)은 1초에 1.5번, 등과 전기 조명은 0.5번 깜빡인다. */
  fire: boolean;
}

/** 빛 모양. 같은 모양을 쓰는 블록은 하나로 묶는다. */
export const GLOW_LOOKS = {
  lamp: { color: 0xfff0c0, pool: 60, halo: 22, head: 11, flicker: 0.05, fire: false },
  jack_lantern: { color: 0xff9a3c, pool: 52, halo: 18, head: 9, flicker: 0.18, fire: true },
  fireplace: { color: 0xff7a3c, pool: 56, halo: 16, head: 5, flicker: 0.2, fire: true },
  lava: { color: 0xff5a2a, pool: 40, halo: 12, head: 12, flicker: 0.1, fire: true },
  lamp_arc: { color: 0xffd890, pool: 52, halo: 16, head: 11, flicker: 0.05, fire: false },
  lamp_small: { color: 0xffd890, pool: 36, halo: 12, head: 5, flicker: 0.05, fire: false },
  lamp_simple: { color: 0xffd890, pool: 36, halo: 12, head: 8, flicker: 0.05, fire: false },
  heater_round: { color: 0xff8a3a, pool: 48, halo: 14, head: 18, flicker: 0.15, fire: true },
  heater_rect: { color: 0xff8a3a, pool: 48, halo: 14, head: 14, flicker: 0.1, fire: true },
  // 맵에 고정된 소품(작업장·농장 등 기둥, 벌목장 모닥불)
  lantern: { color: 0xffc070, pool: 72, halo: 24, head: 37, flicker: 0.08, fire: false },
  campfire: { color: 0xff8a3a, pool: 84, halo: 28, head: 16, flicker: 0.2, fire: true },
  // 시작마을 동굴 횃불(2026-11-17): 색과 크기는 등 기둥과 같고, 빛무리를 불꽃 가운데(땅에서 21px)에 두고 불처럼 깜빡인다(에이전트가 정함).
  torch: { color: 0xffc070, pool: 72, halo: 24, head: 21, flicker: 0.15, fire: true },
} satisfies Record<string, GlowLook>;
export type GlowLookId = keyof typeof GLOW_LOOKS;

/** 빛을 내는 블록·가구 id → 빛 모양. TV와 꺼진 난로는 뺐다(lantern-glow.md 7-1). */
export const LIGHT_BLOCKS: Readonly<Record<string, GlowLookId>> = {
  lamp: 'lamp',
  jack_lantern: 'jack_lantern',
  fireplace: 'fireplace',
  lava: 'lava',
  f_lamp_arc_1: 'lamp_arc',
  f_lamp_arc_2: 'lamp_arc',
  f_lamp_arc_3: 'lamp_arc',
  f_lamp_arc_4: 'lamp_arc',
  f_lamp_small: 'lamp_small',
  f_lamp_simple_1: 'lamp_simple',
  f_lamp_simple_2: 'lamp_simple',
  f_heater_round_on_1: 'heater_round',
  f_heater_round_on_2: 'heater_round',
  f_heater_rect_on_1: 'heater_rect',
  f_heater_rect_on_2: 'heater_rect',
  // 2026-11-16 사용자 "가로등을 플레이어도 설치": 작업장·농장 등 기둥과 같은 그림과 빛
  street_lamp: 'lantern',
};

export interface FixedLight {
  look: GlowLookId;
  /** 그림이 덮는 땅 안의 빛 자리(칸 좌표, 그림 왼쪽 위 칸에서) */
  gx: number;
  gy: number;
}

/** 맵 소품·건물 그림 → 빛 자리들. 높이는 모양의 head다. 그림 하나에 빛이 여럿일 수 있다(동굴 횃불 둘). */
export const FIXED_LIGHTS: Readonly<Record<string, readonly FixedLight[]>> = {
  'work-lantern': [{ look: 'lantern', gx: 0.78, gy: 0.51 }],
  'work-campfire': [{ look: 'campfire', gx: 0.5, gy: 0.5 }],
  // 시작마을 동굴 입구의 횃불 둘(2026-11-17 사용자 "빛나게 하기", 자리는 디자인 세션 adventure-cave.md 5장)
  'cave-x': [
    { look: 'torch', gx: 3.28, gy: 0.64 },
    { look: 'torch', gx: 3.28, gy: 2.36 },
  ],
};

export const GLOW_TEXTURE = 'glow-atlas';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
/** 알파 계단 */
const STEPS = [0, 0.18, 0.36, 0.6, 0.9];

function stepped(t: number, x: number, y: number) {
  const f = t * (STEPS.length - 1);
  const i = Math.floor(f);
  const pick = f - i > BAYER[(x & 3) + (y & 3) * 4] ? i + 1 : i;
  return STEPS[Math.min(STEPS.length - 1, pick)];
}

/** (left, top)부터 w×h 칸에 빛 한 장을 칠한다. dist는 가운데에서의 거리(0~1, 1 이상이면 칠하지 않음), power는 가장자리로 갈수록 옅어지는 정도. */
function paint(data: ImageData, left: number, top: number, w: number, h: number, color: number, power: number, dist: (x: number, y: number) => number) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = dist(x + 0.5, y + 0.5);
      if (d >= 1) continue;
      const a = stepped((1 - d) ** power, x, y);
      const i = ((top + y) * data.width + left + x) * 4;
      data.data[i] = (color >> 16) & 255;
      data.data[i + 1] = (color >> 8) & 255;
      data.data[i + 2] = color & 255;
      data.data[i + 3] = Math.round(a * 255);
    }
  }
}

/** 빛 아틀라스를 한 번 만들어 등록한다. 프레임 이름은 `pool:<모양>`, `halo:<모양>`이다. */
export function ensureGlowTexture(scene: Phaser.Scene) {
  if (scene.textures.exists(GLOW_TEXTURE)) return;
  const looks = Object.entries(GLOW_LOOKS) as [GlowLookId, GlowLook][];
  const GAP = 2;
  const poolRowH = Math.max(...looks.map(([, l]) => l.pool)) + GAP;
  const width = Math.max(
    looks.reduce((sum, [, l]) => sum + l.pool * 2 + GAP, 0),
    looks.reduce((sum, [, l]) => sum + l.halo * 2 + GAP, 0),
  );
  const height = poolRowH + Math.max(...looks.map(([, l]) => l.halo * 2));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const data = ctx.createImageData(width, height);
  const frames: [string, number, number, number, number][] = [];
  let px = 0;
  let hx = 0;
  for (const [id, look] of looks) {
    const rx = look.pool;
    const ry = Math.round(rx / 2);
    paint(data, px, 0, rx * 2, ry * 2, look.color, 1.4, (x, y) => Math.hypot((x - rx) / rx, (y - ry) / ry));
    frames.push([`pool:${id}`, px, 0, rx * 2, ry * 2]);
    px += rx * 2 + GAP;
    const r = look.halo;
    paint(data, hx, poolRowH, r * 2, r * 2, look.color, 1.8, (x, y) => Math.hypot(x - r, y - r) / r);
    frames.push([`halo:${id}`, hx, poolRowH, r * 2, r * 2]);
    hx += r * 2 + GAP;
  }
  ctx.putImageData(data, 0, 0);
  const texture = scene.textures.addCanvas(GLOW_TEXTURE, canvas)!;
  for (const [name, x, y, w, h] of frames) texture.add(name, 0, x, y, w, h);
}
