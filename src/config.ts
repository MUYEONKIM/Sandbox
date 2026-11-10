/** 마름모 타일 크기 (아트 픽셀). 가로:세로 = 2:1 */
export const TILE_W = 32;
export const TILE_H = 16;

/** 아트 픽셀 1개를 화면 몇 픽셀로 그릴지 */
export const ZOOM = 2;

/** 기본 맵 한 변의 칸 수. 넓은 층은 바닥에 맞춰 더 크다(`map.ts`의 `mapSize`). */
export const MAP_SIZE = 46;

/** 서버가 받는 좌표의 칸 수. profiles와 blocks 표의 x, y 검사(0~99)와 같아야 한다. */
export const MAX_MAP_SIZE = 100;

/** 블록을 놓을 수 있는 거리 (칸). 1이면 캐릭터를 둘러싼 8칸이다. */
export const PLACE_RANGE = 1;

/** 마름모 변을 따라 한 칸 이동하는 시간 (ms). 꼭짓점 방향은 거리만큼 더 걸린다. */
export const STEP_MS = 120;

/** Shift를 누르고 달릴 때의 속도 배율 */
export const RUN_SPEED = 1.7;

/** 점프로 나아가는 칸 수. 벽 하나를 넘어 그 뒤 칸에 내린다. */
export const JUMP_TILES = 2;

/** 점프 한 번에 걸리는 시간 (ms) */
export const JUMP_MS = 340;

export const MAX_HP = 100;

/** 고를 수 있는 기본 캐릭터 수 */
export const TEAM_SIZE = 7;

/** 설치 블록의 높이 (아트 픽셀) */
export const BLOCK_HEIGHT = 18;

/** 한 칸에 쌓을 수 있는 블록 수. blocks 표의 z 검사(0~4)와 같아야 한다. */
export const MAX_STACK = 5;
