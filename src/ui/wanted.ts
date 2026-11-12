import { element } from './dom';

export interface WantedEntry {
  id: string;
  nickname: string;
  /** 지금의 악업 1~5 */
  karma: number;
}

/** 악업 단계마다 현상범이 죽을 때 죽인 사람에게 넘어가는 몫. 서버 hit_player와 같다. */
export const BOUNTY_SHARE = [0, 0.01, 0.05, 0.1, 0.2, 0.3];
/** 명단을 다시 읽는 간격. 악업은 30분마다 저절로 줄어 서버가 알려 주지 않으므로 이따금 다시 읽는다. */
const REFRESH_MS = 60_000;

/**
 * 화면 왼쪽 위 현상범 명단(2026-11-12 사용자 요청 "악업 수치를 가진 캐릭터는 좌측 상단 현상범들에 기록").
 * 악업은 서버(wanted_list)가 기준이고, 이름 색도 이 명단으로 칠한다. 현상범이 없으면 숨는다.
 */
export class WantedPanel {
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private karma = new Map<string, number>();
  private readonly listeners: ((karma: ReadonlyMap<string, number>) => void)[] = [];

  constructor(
    parent: HTMLElement,
    private readonly me: string,
    private readonly load: () => Promise<WantedEntry[] | null>,
  ) {
    this.root = element('wanted', parent);
    this.root.hidden = true;
    element('wanted-title', this.root).textContent = '현상범';
    this.list = element('wanted-list', this.root);
    void this.refresh();
    window.setInterval(() => void this.refresh(), REFRESH_MS);
  }

  /** 명단이 바뀔 때마다 (플레이어 id → 악업)을 받는다. */
  onChange(fn: (karma: ReadonlyMap<string, number>) => void) {
    this.listeners.push(fn);
    fn(this.karma);
  }

  async refresh() {
    const entries = await this.load();
    if (!entries) return;
    this.karma = new Map(entries.map(({ id, karma }) => [id, karma]));
    this.root.hidden = entries.length === 0;
    this.list.replaceChildren();
    for (const { id, nickname, karma } of entries) {
      const row = element(`wanted-row karma-${karma}${id === this.me ? ' mine' : ''}`, this.list);
      element('wanted-name', row, 'span').textContent = nickname;
      element('wanted-level', row, 'span').textContent = `악업 ${karma} · 현상금 ${Math.round(BOUNTY_SHARE[karma] * 100)}%`;
    }
    for (const fn of this.listeners) fn(this.karma);
  }
}
