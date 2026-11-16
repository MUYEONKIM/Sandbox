import type { WorkProp } from './workLayouts';

/**
 * 농장 꾸밈(2026-11-16 사용자 "농장도 꾸며졌으면 좋겠다. 섹터마다 울타리, 채집장처럼 논밭의 느낌", 설계는 디자인 세션 farm-decor.md).
 * 소품은 작업장 소품처럼 건물로 놓고 차지하는 칸을 막는다. 구획 사이 길과 둘레 길(x·y 40~41), 포탈 둘레 ±2칸,
 * 도착 칸 둘레 ±1칸은 비우고 맵 앞쪽 풀밭 띠(x 42~45, y 42~45)에만 둔다(자리와 그림은 디자인 세션이 정함).
 * 울타리는 구획 25개의 네 변과 맵 뒤쪽 두 변에 서고, 칸이 아니라 칸 사이 변을 막는다(사용자 "지나갈 수 없게", 막는 방식은 PM이 정함).
 * 변마다 가운데 2칸(3·4번째 칸)이 입구다.
 */

/** 구획(6×6칸 땅 25개)의 왼쪽 위 칸 */
export const SECTOR_STARTS = [2, 10, 18, 26, 34] as const;
/** 각 변에서 울타리를 비우는 입구 칸(변의 3·4번째 칸) */
const GATE = [2, 3];
const FARM_SIZE = 46;

const at = (sprite: string, x: number, y: number, w = 1, d = 1): WorkProp => ({ sprite: sprite as WorkProp['sprite'], x, y, w, d });

/** 소품 26개, 33칸. 이 칸에 있던 플레이어 블록은 화면에 그리지 않는다(GameScene.onBlockPlaced의 isOpenGround). */
export const FARM_PROPS: WorkProp[] = [
  // 오른쪽 앞 풀밭(x 42~45): 위에서부터 건초 마당, 우물, 허수아비, 짚 묶음, 등
  at('farm-haystack', 43, 3),
  at('farm-haystack', 44, 6),
  at('farm-bales-x', 44, 9, 1, 2),
  at('work-lantern', 43, 13),
  at('farm-well', 43, 18),
  at('work-basket', 44, 20),
  at('work-scarecrow', 44, 23),
  at('farm-haystack', 44, 27),
  at('work-lantern', 43, 29),
  at('work-wheelbarrow-x', 43, 33),
  at('farm-bales-x', 44, 35, 1, 2),
  at('work-scarecrow', 44, 38),
  // 앞쪽 모퉁이: 창고와 짚 묶음
  at('farm-shed', 44, 44, 2, 2),
  at('farm-haystack', 42, 44),
  at('farm-bales-x', 45, 42, 1, 2),
  // 왼쪽 앞 풀밭(y 42~45): 포탈 쪽부터 등, 과일나무, 짚, 허수아비, 수레, 덤불
  at('work-lantern', 7, 43),
  at('work-fruittree', 10, 44),
  at('work-fruittree', 13, 44),
  at('farm-bales', 18, 44, 2, 1),
  at('farm-haystack', 21, 43),
  at('work-scarecrow', 24, 44),
  at('work-lantern', 29, 43),
  at('work-wheelbarrow', 32, 44),
  at('work-basket', 34, 43),
  at('work-bush', 37, 44),
  at('work-bush', 39, 43),
];

/**
 * 울타리 한 조각이 막는 변. 'top'은 칸 (x, y)와 (x, y − 1) 사이(화면에서 칸의 뒤-오른쪽 변, 그림 farm-fence),
 * 'left'는 칸 (x, y)와 (x − 1, y) 사이(뒤-왼쪽 변, 그림 farm-fence-x). 구획 앞쪽 두 변은 앞 칸의 뒤쪽 변으로 적는다.
 * 그림 조각과 변이 1:1이다.
 */
export interface FenceEdge {
  x: number;
  y: number;
  side: 'top' | 'left';
}

/** 농장 울타리 488조각: 구획 400과 맵 뒤쪽 경계 88(맵 밖과의 변이라 막아도 달라지는 것은 없다) */
export function farmFences(): FenceEdge[] {
  const out: FenceEdge[] = [];
  for (const x0 of SECTOR_STARTS) {
    for (const y0 of SECTOR_STARTS) {
      for (let k = 0; k < 6; k++) {
        if (GATE.includes(k)) continue;
        out.push({ x: x0 + k, y: y0, side: 'top' }); // 뒤-오른쪽 변
        out.push({ x: x0, y: y0 + k, side: 'left' }); // 뒤-왼쪽 변
        out.push({ x: x0 + k, y: y0 + 6, side: 'top' }); // 앞-왼쪽 변 = 앞 길 칸의 뒤
        out.push({ x: x0 + 6, y: y0 + k, side: 'left' }); // 앞-오른쪽 변
      }
    }
  }
  // 맵 뒤쪽 두 변 경계 울타리(포탈 쪽 y 42~45는 비움)
  for (let i = 0; i < FARM_SIZE; i++) {
    out.push({ x: i, y: 0, side: 'top' });
    if (i < 42) out.push({ x: 0, y: i, side: 'left' });
  }
  return out;
}

/**
 * 입구 바로 안쪽 땅 칸(구획마다 네 변의 3·4번째 칸, 모두 200칸). 블록을 놓으면 입구가 닫힐 수 있어 블록을 못 놓는다.
 * 땅은 그대로 사고팔고 심는다. 서버 SQL farm_is_gate(20261116040000_farm_gate.sql)와 같아야 한다.
 */
export function isGate(x: number, y: number) {
  if (x < 2 || x > 39 || y < 2 || y > 39) return false;
  const lx = (x - 2) % 8;
  const ly = (y - 2) % 8;
  if (lx >= 6 || ly >= 6) return false;
  return ((lx === 2 || lx === 3) && (ly === 0 || ly === 5)) || ((ly === 2 || ly === 3) && (lx === 0 || lx === 5));
}
