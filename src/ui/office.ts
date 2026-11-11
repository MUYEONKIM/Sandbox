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
}

/** 노동청 창: 일하러 갈 곳을 고른다. */
export class OfficeWindow {
  private readonly root: HTMLElement;

  constructor(parent: HTMLElement, economy: Economy, actions: OfficeActions) {
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
      button.addEventListener('click', () => actions.onGo(place.id));
    }

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
  }

  close() {
    this.root.hidden = true;
  }
}
