import type { KillEntry } from '../net/session';
import { element } from './dom';

/** Tab을 누르고 있는 동안 보이는 킬/데스 순위(상위 10명). 열 때마다 서버에서 새로 읽는다. */
export class KillBoard {
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
  /** 늦게 온 응답이 닫은 뒤의 창을 그리지 않게 열 때마다 번호를 올린다. */
  private request = 0;

  constructor(
    parent: HTMLElement,
    /** 내 닉네임. 바꿀 수 있어서 그릴 때마다 묻는다. */
    private readonly myName: () => string,
    private readonly fetchRanking: () => Promise<KillEntry[] | null>,
  ) {
    this.root = element('killboard', parent);
    this.root.hidden = true;
    element('killboard-title', this.root).textContent = '킬/데스 순위';
    const head = element('killboard-row killboard-head', this.root);
    for (const text of ['순위', '닉네임', '킬', '데스']) element('killboard-cell', head, 'span').textContent = text;
    this.list = element('killboard-list', this.root);
  }

  get isOpen() {
    return !this.root.hidden;
  }

  async show() {
    if (this.isOpen) return;
    this.root.hidden = false;
    const request = ++this.request;
    this.list.replaceChildren();
    element('killboard-empty', this.list).textContent = '불러오는 중...';
    const entries = await this.fetchRanking();
    if (request !== this.request || !this.isOpen) return;
    this.list.replaceChildren();
    if (!entries) {
      element('killboard-empty', this.list).textContent = '순위를 불러오지 못했습니다';
      return;
    }
    entries.forEach(({ nickname, kills, deaths }, i) => {
      const row = element(nickname === this.myName() ? 'killboard-row me' : 'killboard-row', this.list);
      for (const text of [String(i + 1), nickname, String(kills), String(deaths)]) {
        element('killboard-cell', row, 'span').textContent = text;
      }
    });
  }

  hide() {
    this.request++;
    this.root.hidden = true;
  }
}
