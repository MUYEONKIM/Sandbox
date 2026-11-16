import type { SpriteName } from '../art/sprites';
import type { WorkId } from './maps';

/**
 * 작업장 꾸밈 배치(2026-11-16 사용자 "작업장들도 디자인을 제대로", 자리와 그림은 디자인 세션이 정함).
 * 소품은 모두 건물처럼 놓는다: (x, y)는 차지하는 칸의 위쪽 모서리, w·d는 칸 수, 그림은 바닥 아래 꼭짓점에 맞춘다
 * (GameScene.showBuilding, 시작마을 건물·상점 소품과 같은 방식). 차지하는 칸은 막힌다.
 * 자원 칸과 그 둘레 8칸, 작업장 건물, 포탈 둘레(±2칸), 도착 칸 둘레(±1칸)는 피했다.
 * 플레이어가 쌓은 블록은 자리를 정할 때 따지지 않는다. 소품 칸에 있는 블록은 지운다(2026-11-16 사용자 "소품이 우선이다").
 * water가 true인 소품(선착장, 배)은 원래 막힌 연못 물 위에 놓여 걸을 땅을 줄이지 않는다.
 * 지금의 장식 벽(map.ts WORK_WALLS)은 이 소품들로 바꾼다(removeWalls). 길과 밭고랑은 src/art/workGround.ts의 바닥 그림이다.
 */
export interface WorkProp {
  sprite: SpriteName;
  x: number;
  y: number;
  w: number;
  d: number;
  water?: true;
}

export interface WorkLayout {
  props: WorkProp[];
  /** map.ts의 WORK_WALLS를 쓰지 않는다. */
  removeWalls: boolean;
}

const at = (sprite: string, x: number, y: number, w = 1, d = 1, water = false): WorkProp =>
  ({ sprite: sprite as SpriteName, x, y, w, d, ...(water ? { water: true as const } : {}) });

/** 레일이 끝나는 뒤쪽 귀퉁이에 이어 세운 깎인 바위 벽(y = 0 줄 x 2~17, x = 0 줄 y 2~13) */
const cliffs = [
  ...[2, 6, 10, 14].map((x) => at('work-cliff', x, 0, 4, 1)),
  ...[2, 6, 10].map((y) => at('work-cliff-x', 0, y, 1, 4)),
];

export const WORK_LAYOUTS: Record<WorkId, WorkLayout> = {
  // 채석장: 뒤쪽 바위 벽, 레일 끝의 도르래 기중기와 돌 수레, 돌 더미와 다듬은 돌, 길가 등 기둥
  quarry: {
    removeWalls: true,
    props: [
      ...cliffs,
      at('work-crane', 7, 1, 2, 2),
      at('work-cart', 13, 7, 2, 1),
      at('work-rubble', 4, 2),
      at('work-blocks', 5, 2),
      at('work-rubble', 24, 2),
      at('work-blocks', 25, 2),
      at('work-rubble', 30, 2),
      at('work-blocks', 36, 42),
      at('work-rubble', 37, 43),
      at('work-rubble', 33, 38),
      at('work-lantern', 45, 38),
      at('work-lantern', 40, 31),
      at('work-lantern', 33, 26),
      at('work-lantern', 27, 22),
      at('work-lantern', 25, 14),
      at('work-lantern', 18, 11),
      at('work-lantern', 9, 3),
    ],
  },
  // 벌목장: 오두막 옆 통나무 더미·톱질대·장작·도끼 꽂힌 그루터기, 오솔길 옆 모닥불 쉼터, 숲속 그루터기, 길가 등 기둥
  logging: {
    removeWalls: true,
    props: [
      at('work-logpile', 33, 43, 2, 1),
      at('work-logpile-x', 37, 35, 1, 2),
      at('work-sawhorse', 32, 40, 2, 1),
      at('work-firewood', 37, 42),
      at('work-stump', 34, 42),
      at('work-campfire', 34, 22),
      at('work-stump', 33, 23),
      at('work-stump', 34, 23),
      at('work-stump', 18, 27),
      at('work-stump', 42, 19),
      at('work-stump', 9, 13),
      at('work-stump', 22, 42),
      at('work-logpile', 10, 1, 2, 1),
      at('work-logpile', 23, 2, 2, 1),
      at('work-lantern', 44, 38),
      at('work-lantern', 39, 30),
      at('work-lantern', 30, 21),
      at('work-lantern', 19, 12),
      at('work-lantern', 6, 2),
    ],
  },
  // 채집장: 뒤쪽 두 변의 사과나무 과수원, 길가 열매 덤불, 밭고랑의 허수아비와 바구니, 과일 가게 옆 수레, 등 기둥
  gathering: {
    removeWalls: true,
    props: [
      ...[3, 9, 15, 21, 27, 33, 39].map((x) => at('work-fruittree', x, 1)),
      ...[7, 13, 19, 25, 31, 37].map((y) => at('work-fruittree', 1, y)),
      at('work-bush', 44, 34),
      at('work-bush', 37, 25),
      at('work-bush', 24, 19),
      at('work-bush', 12, 13),
      at('work-bush', 35, 8),
      at('work-scarecrow', 8, 27),
      at('work-scarecrow', 22, 33),
      at('work-scarecrow', 33, 16),
      at('work-basket', 13, 26),
      at('work-basket', 19, 32),
      at('work-basket', 31, 15),
      at('work-basket', 36, 38),
      at('work-wheelbarrow-x', 37, 40),
      at('work-lantern', 44, 40),
      at('work-lantern', 39, 25),
      at('work-lantern', 25, 18),
      at('work-lantern', 13, 16),
    ],
  },
  // 낚시터: 물가 길 끝 선착장과 매어 둔 배, 뒤쪽 물가 의자 둘, 미끼 가게 옆 낚싯대 걸이·미끼통·생선 말리는 대, 등 기둥
  fishing: {
    removeWalls: true,
    props: [
      at('work-dock', 30, 30, 4, 1, true),
      at('work-boat', 31, 31, 2, 1, true),
      at('work-bench-x', 8, 22, 1, 2),
      at('work-bench', 22, 8, 2, 1),
      at('work-rodrack', 37, 42),
      at('work-tackle', 35, 42),
      at('work-dryrack', 34, 39, 2, 1),
      at('work-lantern', 44, 39),
      at('work-lantern', 40, 33),
      at('work-lantern', 36, 28),
      at('work-lantern', 8, 26),
      at('work-lantern', 26, 8),
    ],
  },
};
