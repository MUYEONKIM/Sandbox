import { formatNumber } from '../game/level';
import { goldText } from '../game/gold';
import type { FameKind, FameRow, RankEntry } from '../net/session';
import { element } from './dom';
import { byInput } from './touch';
import { FoldBox } from './fold';
import { sound } from '../sound/engine';
import { paintTitleChip } from './title/chip';

type LoadRanking = () => Promise<RankEntry[] | null>;
type LoadFame = (kind: FameKind) => Promise<{ rows: FameRow[]; me: FameRow | null } | null>;

/** 명예의 전당 탭(2026-11-28 사용자 결정: 마을·무기·모험·골드·킬, 마을이 처음) */
const FAME_TABS: [FameKind, string][] = [
  ['village', '마을'],
  ['forge', '무기'],
  ['adventure', '모험'],
  ['gold', '골드'],
  ['kills', '킬'],
];

/** 줄에 보이는 값: 마을·모험 Lv., 무기 +단계, 골드 G, 킬 "킬 / 데스" */
function fameValue(kind: FameKind, row: FameRow) {
  const big = BigInt(row.value);
  if (kind === 'forge') return `+${row.value}`;
  if (kind === 'gold') return goldText(big);
  if (kind === 'kills') return `${formatNumber(big)} / ${formatNumber(BigInt(row.extra ?? '0'))}`;
  return `Lv. ${formatNumber(big)}`;
}

/** 칭호 이름 → id(칭호 표). 명예의 전당 줄은 칭호 이름만 받는다. */
type TitleId = (name: string) => string | null;

function showFame(list: HTMLElement, kind: FameKind, rows: FameRow[], me: FameRow | null, titleId: TitleId) {
  list.replaceChildren();
  const add = (row: FameRow) => {
    // 그 부문 1·2·3위 줄(같은 순위가 둘이면 둘 다)은 금·은·동 바탕과 메달(칭호 꾸밈 title-look.md 5절)
    const top = row.rank <= 3 ? ` top-${row.rank}` : '';
    const line = element((row.me ? 'rank-row mine' : 'rank-row') + top, list);
    element('rank-place', line, 'span').textContent = String(row.rank);
    // 칭호는 이름 앞, 폭이 좁으면 칭호 칸이 잘린다(growth-1127.md 8-1). 칸은 이름표와 같은 등급 아이콘과 색 글자, 움직임 없음
    if (row.title || row.rich) {
      const chip = { id: row.title ? titleId(row.title) : null, name: row.title, rich: row.rich };
      paintTitleChip(element('rank-title', line, 'span'), 'rank-title', chip);
    }
    element('rank-name', line, 'span').textContent = row.name;
    element('rank-level', line, 'span').textContent = fameValue(kind, row);
  };
  rows.forEach(add);
  // 내가 보인 줄 밖이면 맨 아래에 내 줄
  if (me && !rows.some((row) => row.me)) {
    element('rank-gap', list).textContent = '…';
    add(me);
  }
  if (!rows.length && !me) element('rank-row', list).textContent = '-';
}

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

/**
 * 명예의 전당 창: 부문 탭 다섯(2026-11-28, SQL ranking). 열 때와 탭을 바꿀 때 한 번 읽는다(실시간 구독 없음).
 * 줄마다 순위·칭호·이름·값, 내가 위 줄 밖이면 맨 아래 내 줄.
 */
export class FameWindow {
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly tabButtons = new Map<FameKind, HTMLButtonElement>();
  /** 늦게 온 답이 다른 탭을 덮지 않게 읽을 때마다 번호를 올린다. */
  private request = 0;
  /** 칭호 이름 → id(칭호 표, main.ts가 넣음). 모르면 null */
  titleId: TitleId = () => null;

  constructor(
    parent: HTMLElement,
    private readonly load: LoadFame,
  ) {
    this.root = element('office fame', parent);
    this.root.hidden = true;

    element('office-title', this.root).textContent = '명예의 전당';
    const tabs = element('board-tabs', this.root);
    for (const [kind, label] of FAME_TABS) {
      const button = element('board-tab', tabs, 'button') as HTMLButtonElement;
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => void this.show(kind));
      this.tabButtons.set(kind, button);
    }
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
    await this.show('village');
  }

  private async show(kind: FameKind) {
    for (const [id, button] of this.tabButtons) button.classList.toggle('chosen', id === kind);
    const request = ++this.request;
    this.list.textContent = '불러오는 중입니다.';
    const result = await this.load(kind);
    if (request !== this.request || this.root.hidden) return;
    if (!result) this.list.textContent = LOAD_FAILED;
    else showFame(this.list, kind, result.rows, result.me, this.titleId);
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
