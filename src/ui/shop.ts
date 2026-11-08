import { spriteUrl } from '../art/sprites';
import { BLOCKS } from '../blocks';
import type { Economy, ShopItem, ShopTool, ShopWeapon } from '../game/economy';
import { paintItem, WEAPONS, type WeaponId } from '../items';
import { element } from './dom';
import { PLACE_ICONS } from './office';
import { PurchaseWindow } from './purchase';

interface ShopActions {
  onBuyWeapon(id: WeaponId): Promise<void>;
  onBuyTool(tool: ShopTool): Promise<void>;
  onBuyItem(item: ShopItem): Promise<void>;
  onSell(): void;
}

/** 상점 창: 무기, 꾸미기 블록, 작업 도구를 사고 캐 온 전리품을 판다. 실제 거래는 서버가 한다. */
export class ShopWindow extends PurchaseWindow {
  private readonly weaponList: HTMLElement;
  private readonly toolList: HTMLElement;
  private readonly itemList: HTMLElement;
  private readonly stashList: HTMLElement;
  private readonly sellButton: HTMLButtonElement;

  constructor(
    parent: HTMLElement,
    economy: Economy,
    private readonly actions: ShopActions,
  ) {
    super(parent, economy, '상점', '없는 것 빼고 다 팝니다. 캐 온 것도 사 드립니다. 환불은 없습니다.');

    element('office-section', this.root).textContent = '무기';
    this.weaponList = element('shop-weapons', this.root);
    for (const weapon of economy.forSale) this.addWeapon(weapon);

    element('office-section', this.root).textContent = '꾸미기';
    element('shop-note', this.root).textContent = '아이티공간 4·7·8층, 옥상, 작업장에 놓을 수 있습니다.';
    this.itemList = element('shop-items', this.root);
    for (const item of economy.items) this.addItem(item);

    element('office-section', this.root).textContent = '작업 도구';
    this.toolList = element('shop-stats', this.root);
    for (const tool of economy.tools) this.addTool(tool);

    element('office-section', this.root).textContent = '가방 속 전리품';
    this.stashList = element('office-stash', this.root);
    this.sellButton = element('office-sell', this.root, 'button') as HTMLButtonElement;
    this.sellButton.type = 'button';
    this.sellButton.addEventListener('click', () => actions.onSell());
    this.refreshers.push(() => this.showStash());

    this.finish();
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

  private addItem(item: ShopItem) {
    const { id, price, amount } = item;
    const block = BLOCKS[id];
    const row = element('shop-item', this.itemList);
    const icon = element('shop-item-icon', row, 'img') as HTMLImageElement;
    icon.src = paintItem(id).toDataURL();
    icon.alt = '';
    const text = element('shop-item-text', row);
    element('shop-item-name', text).textContent = block.name;
    element('shop-item-blurb', text).textContent = `${amount}개${block.solid ? '' : ' · 밟고 지나감'}`;

    const buy = this.buyButton(row, () => this.actions.onBuyItem(item));
    this.refreshers.push(() => {
      buy.textContent = `${price.toLocaleString()}G`;
      buy.disabled = this.busy || this.economy.gold < price;
    });
  }

  private addTool(tool: ShopTool) {
    const { id, workplace, name, blurb, price } = tool;
    const row = element('shop-stat', this.toolList);
    const icon = element('shop-tool-icon', row, 'img') as HTMLImageElement;
    icon.src = spriteUrl(PLACE_ICONS[workplace]);
    icon.alt = '';

    const text = element('shop-stat-text', row);
    element('shop-stat-name', text).textContent = name;
    element('shop-stat-blurb', text).textContent = blurb;

    const buy = this.buyButton(row, () => this.actions.onBuyTool(tool));
    this.refreshers.push(() => {
      const owned = this.economy.ownsTool(id);
      buy.textContent = owned ? '보유 중' : `${price.toLocaleString()}G`;
      buy.disabled = this.busy || owned || this.economy.gold < price;
    });
  }

  private showStash() {
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
