import { HARVEST_COUNT, type Economy } from '../game/economy';
import type { WorkId } from '../game/maps';
import { spriteUrl } from '../art/sprites';
import { element } from './dom';

/** 작업장 버튼에 붙이는 그림 */
export const PLACE_ICONS: Record<WorkId, string> = {
  quarry: 'buttons0012',
  logging: 'buttons0002',
  gathering: 'buttons0001',
  fishing: 'buttons0007',
};

interface OfficeActions {
  onGo(place: WorkId): void;
  /** 작업장마다 지금 있는 사람. 실패하면 null */
  loadRoster(): Promise<{ workplace: string; nickname: string }[] | null>;
}

/** 창이 열려 있는 동안 작업장 인원을 다시 읽는 간격 */
const ROSTER_REFRESH_MS = 5000;

/** 노동청 창: 일하러 갈 곳을 고른다. 작업장마다 지금 일하는 사람 수와 닉네임도 보인다. */
export class OfficeWindow {
  private readonly root: HTMLElement;
  private readonly rosters = new Map<string, HTMLElement>();
  private rosterTimer = 0;

  constructor(
    parent: HTMLElement,
    economy: Economy,
    private readonly actions: OfficeActions,
  ) {
    this.root = element('office', parent);
    this.root.hidden = true;

    element('office-title', this.root).textContent = '노동청';
    element('office-subtitle', this.root).textContent = '근로계약서는 없습니다. 오늘은 어디로 끌려가시겠습니까?';

    const places = element('office-places', this.root);
    for (const place of economy.workplaces) {
      const button = element('office-place', places, 'button') as HTMLButtonElement;
      button.type = 'button';
      const icon = element('office-place-icon', button, 'img') as HTMLImageElement;
      icon.src = spriteUrl(PLACE_ICONS[place.id]);
      icon.alt = '';
      element('office-place-name', button).textContent = place.name;
      element('office-place-blurb', button).textContent = place.blurb;
      element('office-place-rate', button).textContent =
        `${(place.gatherMs / 1000).toFixed(1)}초에 ${HARVEST_COUNT}개 · 분당 약 ${Math.round(economy.goldPerMinute(place) / 10) * 10}G`;
      this.rosters.set(place.id, element('office-place-roster', button));
      button.addEventListener('click', () => actions.onGo(place.id));
    }
    element('office-note', this.root).textContent = '인원은 최근 2분 안에 그 작업장에서 일했거나 움직인 사람입니다.';

    const close = element('office-close', this.root, 'button') as HTMLButtonElement;
    close.type = 'button';
    close.textContent = '나가기 (Esc)';
    close.addEventListener('click', () => this.close());
  }

  get isOpen() {
    return !this.root.hidden;
  }

  open() {
    this.root.hidden = false;
    void this.showRoster();
    window.clearInterval(this.rosterTimer);
    this.rosterTimer = window.setInterval(() => void this.showRoster(), ROSTER_REFRESH_MS);
  }

  close() {
    this.root.hidden = true;
    window.clearInterval(this.rosterTimer);
  }

  private async showRoster() {
    const rows = await this.actions.loadRoster();
    if (this.root.hidden) return;
    for (const [place, line] of this.rosters) {
      if (!rows) {
        line.textContent = '인원을 불러오지 못했습니다';
        continue;
      }
      const names = rows.filter((row) => row.workplace === place).map((row) => row.nickname);
      line.textContent = names.length ? `지금 ${names.length}명 · ${names.join(', ')}` : '지금 아무도 없습니다';
      line.classList.toggle('busy', names.length > 0);
    }
  }
}
