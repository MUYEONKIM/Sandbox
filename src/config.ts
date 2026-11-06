/** 마름모 타일 크기 (아트 픽셀). 가로:세로 = 2:1 */
export const TILE_W = 32;
export const TILE_H = 16;

/** 아트 픽셀 1개를 화면 몇 픽셀로 그릴지 */
export const ZOOM = 2;

/** 맵 한 변의 칸 수 */
export const MAP_SIZE = 46;

/** 블록을 놓을 수 있는 거리 (칸). 1이면 캐릭터를 둘러싼 8칸이다. */
export const PLACE_RANGE = 1;

/** 마름모 변을 따라 한 칸 이동하는 시간 (ms). 꼭짓점 방향은 거리만큼 더 걸린다. */
export const STEP_MS = 120;

/** 대시로 나아가는 칸 수 */
export const DASH_TILES = 2;

/** 대시 중 한 칸을 지나는 시간 (ms) */
export const DASH_STEP_MS = 55;

/** 대시를 다시 쓸 수 있을 때까지의 시간 (ms) */
export const DASH_COOLDOWN_MS = 600;

export const MAX_HP = 100;

/** 설치 블록의 높이 (아트 픽셀) */
export const BLOCK_HEIGHT = 16;
