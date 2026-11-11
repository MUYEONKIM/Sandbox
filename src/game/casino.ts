import type { Color } from '../art/pixels';

/**
 * 시작마을 도박장의 게임(2026-11-11 사용자 요청). 결과와 배당은 서버 함수 place_bet이 정하고,
 * 여기 값은 창에 보여 줄 사본이다. 배당이나 거는 돈 범위를 바꾸면 SQL도 함께 바꾼다.
 */
export type GameId = 'ladder' | 'oddeven' | 'snail';

export const GAME_IDS: GameId[] = ['ladder', 'oddeven', 'snail'];

export function isGame(value: unknown): value is GameId {
  return GAME_IDS.includes(value as GameId);
}

/** 한 판에 걸 수 있는 골드 */
export const BET_MIN = 10;
export const BET_MAX = 100_000;

export interface BetPick {
  /** 서버에 보내는 값 */
  id: string;
  label: string;
  odds: number;
}

export interface GameInfo {
  name: string;
  accent: Color;
  blurb: string;
  picks: BetPick[];
}

/** 사다리: 출발(좌, 우)이나 줄 수(3, 4) 하나를 맞히면 1.96배, 둘 다 맞히면 3.97배 */
const ONE = 1.96;
const BOTH = 3.97;

export const GAMES: Record<GameId, GameInfo> = {
  ladder: {
    name: '사다리',
    accent: 0x6fb7ff,
    blurb: '좌냐 우냐, 3줄이냐 4줄이냐. 인생도 결국 사다리 타기입니다.',
    picks: [
      { id: 'L', label: '좌', odds: ONE },
      { id: 'R', label: '우', odds: ONE },
      { id: '3', label: '3줄', odds: ONE },
      { id: '4', label: '4줄', odds: ONE },
      { id: 'L3', label: '좌 3줄', odds: BOTH },
      { id: 'L4', label: '좌 4줄', odds: BOTH },
      { id: 'R3', label: '우 3줄', odds: BOTH },
      { id: 'R4', label: '우 4줄', odds: BOTH },
    ],
  },
  oddeven: {
    name: '홀짝',
    accent: 0xff7a7a,
    blurb: '그릇 속 구슬이 홀이면 홀, 짝이면 짝. 딜러 손이 생각보다 빠릅니다.',
    picks: [
      { id: 'odd', label: '홀', odds: 1.96 },
      { id: 'even', label: '짝', odds: 1.96 },
    ],
  },
  snail: {
    name: '달팽이 경주',
    accent: 0x8be08b,
    blurb: '세 마리가 사력을 다해 기어갑니다. 응원해도 빨라지지는 않습니다.',
    picks: [
      { id: '1', label: '1번 출근 달팽이', odds: 2.97 },
      { id: '2', label: '2번 야근 달팽이', odds: 2.97 },
      { id: '3', label: '3번 칼퇴 달팽이', odds: 2.97 },
    ],
  },
};

/** 달팽이 1, 2, 3번의 껍데기 색. 도박장 경주로 그림과 경주 창이 함께 쓴다. */
export const SNAIL_COLORS: Color[] = [0xff9a3c, 0xa07ae8, 0x4fc3e8];

/** 서버가 돌려주는 한 판의 결과 */
export interface BetResult {
  /** 결과가 반영된 골드 */
  gold: number;
  /** 사다리는 'L3'처럼 출발과 줄 수, 홀짝은 구슬 개수(1~10), 달팽이 경주는 1등 번호 */
  outcome: string;
  /** 돌려받은 골드(건 돈 포함). 지면 0이다. */
  payout: number;
}
