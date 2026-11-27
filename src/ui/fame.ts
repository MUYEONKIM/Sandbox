import { formatNumber } from '../game/level';
import type { RankEntry } from '../net/session';
import { element } from './dom';
import { byInput } from './touch';
import { FoldBox } from './fold';
import { sound } from '../sound/engine';

type LoadRanking = () => Promise<RankEntry[] | null>;

const HOUR_MS = 60 * 60 * 1000;
const LOAD_FAILED = '순위를 불러오지 못했습니다.';

function showRanks(list: HTMLElement, entries: RankEntry[], me: string) {
  list.replaceChildren();
  entries.forEach(({ nickname, level }, index) => {
    const row = element(nickname === me ? 'rank-row mine' : 'rank-row', list);
    element('rank-place', row, 'span').textContent = String(index + 1);
    element('rank-name', row, 'span').textContent = nickname;
    element('rank-level', row, 'span').textContent = `Lv. ${formatNumber(level)}`;
  });
}

/** 명예의 전당 창: 포탈을 탈 때마다 지금의 레벨 순위를 읽어 온다. */
export class FameWindow {
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;

  constructor(
    parent: HTMLElement,
    /** 내 닉네임. 바꿀 수 있어서 그릴 때마다 묻는다. */
    private readonly me: () => string,
    private readonly load: LoadRanking,
  ) {
    this.root = element('office', parent);
    this.root.hidden = true;

    element('office-title', this.root).textContent = '명예의 전당';
    element('office-subtitle', this.root).textContent = '현재 레벨 순위입니다.';
    this.list = element('rank-list', this.root);

    const close = element('office-close', this.root, 'button') as HTMLButtonElement;
    close.type = 'button';
    close.textContent = byInput('나가기 (Esc)', '나가기');
    close.addEventListener('click', () => this.close());
  }

  get isOpen() {
    return !this.root.hidden;
  }

  async open() {
    if (this.root.hidden) sound.play('ui_open');
    this.root.hidden = false;
    this.list.textContent = '불러오는 중입니다.';
    const entries = await this.load();
    if (!entries) this.list.textContent = LOAD_FAILED;
    else showRanks(this.list, entries, this.me());
  }

  close() {
    if (!this.root.hidden) sound.play('ui_close');
    this.root.hidden = true;
  }
}

/** 미니맵 밑의 레벨 순위: 접속할 때 읽고, 그 뒤로는 매시 정각에 다시 읽는다. */
export class RankPanel {
  private readonly list: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly me: () => string,
    private readonly load: LoadRanking,
  ) {
    const box = element('rank-panel', parent);
    const title = element('rank-panel-title', box);
    title.textContent = '레벨 TOP 10';
    this.list = element('rank-list', box);
    element('rank-panel-note', box).textContent = '매시 정각 갱신';
    // 접으면 제목 줄만 남는다. 매시 정각 읽기는 그대로 한다(1시간에 한 번).
    new FoldBox('rank', box, title);
    void this.refresh();
  }

  private async refresh() {
    const entries = await this.load();
    if (entries) showRanks(this.list, entries, this.me());
    else if (!this.list.childElementCount) this.list.textContent = LOAD_FAILED;
    window.setTimeout(() => void this.refresh(), HOUR_MS - (Date.now() % HOUR_MS));
  }
}
