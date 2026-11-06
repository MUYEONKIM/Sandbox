import type { Economy, ShopStat, ShopWeapon } from '../game/economy';
import { statEffect, type StatId } from '../game/stats';
import { paintItem, WEAPONS, type WeaponId } from '../items';
import { element } from './dom';

interface ShopActions {
  onBuyWeapon(id: WeaponId): Promise<void>;
  onBuyStat(id: StatId): Promise<void>;
}

/** 상점 창: 무기와 스텟을 골드로 산다. 실제 결제는 서버가 한다. */
export class ShopWindow {
  private readonly root: HTMLElement;
  private readonly wallet: HTMLElement;
  private readonly weaponList: HTMLElement;
  private readonly statList: HTMLElement;
  private readonly refreshers: (() => void)[] = [];
  /** 결제가 끝나기 전에 또 눌러 두 번 사는 일이 없도록 버튼을 막아 둔다. */
  private busy = false;

  constructor(
    parent: HTMLElement,
    private readonly economy: Economy,
    private readonly actions: ShopActions,
  ) {
    this.root = element('office', parent);
    this.root.hidden = true;

    element('office-title', this.root).textContent = '상점';
    element('office-subtitle', this.root).textContent = '없는 것 빼고 다 팝니다. 환불은 없습니다.';
    this.wallet = element('shop-wallet', this.root);

    element('office-section', this.root).textContent = '무기';
    this.weaponList = element('shop-weapons', this.root);
    element('office-section', this.root).textContent = '능력치';
    this.statList = element('shop-stats', this.root);

    const close = element('office-close', this.root, 'button') as HTMLButtonElement;
    close.type = 'button';
    close.textContent = '나가기 (Esc)';
    close.addEventListener('click', () => this.close());

    for (const weapon of economy.forSale) this.addWeapon(weapon);
    for (const stat of economy.stats) this.addStat(stat);

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

  private buyButton(parent: HTMLElement, buy: () => Promise<void>) {
    const button = element('shop-buy', parent, 'button') as HTMLButtonElement;
    button.type = 'button';
    button.addEventListener('click', async () => {
      this.busy = true;
      this.render();
      try {
        await buy();
      } finally {
        this.busy = false;
        this.render();
      }
    });
    return button;
  }

  private addWeapon(weapon: ShopWeapon) {
    const { id, blurb, damage, price, cooldownMs } = weapon;
    const info = WEAPONS[id];
    const row = element('shop-weapon', this.weaponList);
    const icon = element('shop-weapon-icon', row, 'img') as HTMLImageElement;
    icon.src = paintItem(id).toDataURL();
    icon.alt = '';
    element('shop-weapon-name', row).textContent = info.name;
    element('shop-weapon-blurb', row).textContent = blurb;
    element('shop-weapon-spec', row).textContent = info.melee
      ? `피해 ${damage} · 근접`
      : `피해 ${damage} · 초당 ${Math.round(1000 / cooldownMs)}발`;

    const buy = this.buyButton(row, () => this.actions.onBuyWeapon(id));
    this.refreshers.push(() => {
      const owned = this.economy.owns(id);
      buy.textContent = owned ? '보유 중' : `${price.toLocaleString()}G`;
      buy.disabled = this.busy || owned || this.economy.gold < price;
    });
  }

  private addStat(stat: ShopStat) {
    const { id, name, blurb } = stat;
    const row = element('shop-stat', this.statList);
    const badge = element('shop-stat-badge', row);
    element('shop-stat-id', badge).textContent = id.toUpperCase();
    const value = element('shop-stat-value', badge);

    const text = element('shop-stat-text', row);
    const title = element('shop-stat-name', text);
    element('shop-stat-blurb', text).textContent = blurb;

    const buy = this.buyButton(row, () => this.actions.onBuyStat(id));
    this.refreshers.push(() => {
      const owned = this.economy.stat(id);
      const price = this.economy.statPrice(stat);
      value.textContent = String(owned);
      title.textContent = `${name} · ${statEffect(id, owned)}`;
      buy.textContent = `+1 · ${price.toLocaleString()}G`;
      buy.disabled = this.busy || this.economy.gold < price;
    });
  }

  private render() {
    this.wallet.textContent = `보유 골드 ${this.economy.gold.toLocaleString()}G`;
    for (const refresh of this.refreshers) refresh();
  }
}
