import { GAME_IDS, type GameId } from '../game/casino';
import type { Economy } from '../game/economy';
import type { BetWindow, PlaceBet } from './bet';
import { LadderWindow } from './ladder';
import { OddEvenWindow } from './oddeven';
import { SnailWindow } from './snail';

export type { PlaceBet } from './bet';

/** 도박장의 게임 창 셋. 게임판 앞 포탈을 밟으면 그 게임 창이 열린다. */
export class CasinoWindows {
  private readonly windows: Record<GameId, BetWindow>;

  constructor(parent: HTMLElement, economy: Economy, placeBet: PlaceBet) {
    this.windows = {
      ladder: new LadderWindow(parent, economy, placeBet),
      oddeven: new OddEvenWindow(parent, economy, placeBet),
      snail: new SnailWindow(parent, economy, placeBet),
    };
  }

  get isOpen() {
    return GAME_IDS.some((id) => this.windows[id].isOpen);
  }

  open(game: GameId) {
    this.close();
    this.windows[game].open();
  }

  close() {
    for (const id of GAME_IDS) this.windows[id].close();
  }
}
