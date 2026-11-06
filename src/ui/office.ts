import type { Economy } from '../game/economy';
import type { WorkId } from '../game/maps';
import { element } from './dom';

interface OfficeActions {
  onGo(place: WorkId): void;
  onSell(): void;
}

/** 노동청 창: 일하러 갈 곳을 고르고, 캐 온 자원을 판다. */
export class OfficeWindow {
  private readonly root: HTMLElement;
  private readonly stashList: HTMLElement;
  private readonly sellButton: HTMLButtonElement;

  constructor(
    parent: HTMLElement,
    private readonly economy: Economy,
    actions: OfficeActions,
  ) {
    this.root = element('office', parent);
    this.root.hidden = true;

    element('office-title', this.root).textContent = '노동청';
    element('office-subtitle', this.root).textContent = '근로계약서는 없습니다. 오늘은 어디로 끌려가시겠습니까?';

    const places = element('office-places', this.root);
    for (const place of economy.workplaces) {
      const button = element('office-place', places, 'button') as HTMLButtonElement;
      button.type = 'button';
      element('office-place-name', button).textContent = place.name;
      element('office-place-blurb', button).textContent = place.blurb;
      element('office-place-rate', button).textContent =
        `${(place.gatherMs / 1000).toFixed(1)}초에 하나 · 분당 약 ${Math.round(economy.goldPerMinute(place) / 10) * 10}G`;
      button.addEventListener('click', () => actions.onGo(place.id));
    }

    element('office-section', this.root).textContent = '가방 속 수확물';
    this.stashList = element('office-stash', this.root);
    this.sellButton = element('office-sell', this.root, 'button') as HTMLButtonElement;
    this.sellButton.type = 'button';
    this.sellButton.addEventListener('click', () => actions.onSell());

    const close = element('office-close', this.root, 'button') as HTMLButtonElement;
    close.type = 'button';
    close.textContent = '나가기 (Esc)';
    close.addEventListener('click', () => this.close());

    economy.onChange(() => this.render());
    this.render();
  }

  get isOpen() {
    return !this.root.hidden;
  }

  open() {
    this.render();
    this.root.hidden = false;
  }

  close() {
    this.root.hidden = true;
  }

  private render() {
    this.stashList.replaceChildren();
    const entries = this.economy.entries();
    if (!entries.length) {
      element('office-empty', this.stashList).textContent = '아직 아무것도 없습니다. 일을 하십시오.';
    }
    for (const { name, price, count } of entries) {
      const row = element('office-stash-row', this.stashList);
      element('office-stash-name', row, 'span').textContent = `${name} x${count}`;
      element('office-stash-price', row, 'span').textContent = `${(price * count).toLocaleString()}G`;
    }
    const value = this.economy.stashValue;
    this.sellButton.disabled = value === 0;
    this.sellButton.textContent = value ? `전부 팔기 (+${value.toLocaleString()}G)` : '팔 것이 없습니다';
  }
}
