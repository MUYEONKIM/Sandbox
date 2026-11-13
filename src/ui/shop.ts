import { spriteUrl } from '../art/sprites';
import { RENAME_PRICE, type Economy, type ShopTool, type ShopWeapon } from '../game/economy';
import { paintItem, WEAPONS, type WeaponId } from '../items';
import { element } from './dom';
import { PLACE_ICONS } from './office';
import { PurchaseWindow } from './purchase';

interface ShopActions {
  onBuyWeapon(id: WeaponId): Promise<void>;
  onBuyTool(tool: ShopTool): Promise<void>;
  onBuyRenameTicket(): Promise<void>;
  onSell(): void;
}

/** 상점 창: 캐 온 전리품을 팔고(맨 위), 무기와 작업 도구를 산다. 블록과 꾸미기는 누구나 무제한으로 가져서 팔지 않는다. 실제 거래는 서버가 한다. */
export class ShopWindow extends PurchaseWindow {
  private readonly weaponList: HTMLElement;
  private readonly toolList: HTMLElement;
  private readonly stashList: HTMLElement;
  private readonly sellButton: HTMLButtonElement;

  constructor(
    parent: HTMLElement,
    economy: Economy,
    private readonly actions: ShopActions,
  ) {
    super(parent, economy, '상점', '없는 것 빼고 다 팝니다. 캐 온 것도 사 드립니다. 환불은 없습니다.');

    // 가장 자주 쓰는 전리품 팔기를 맨 위에 둔다(2026-11-11 사용자 요청).
    this.sellButton = element('office-sell', this.root, 'button') as HTMLButtonElement;
    this.sellButton.type = 'button';
    this.sellButton.addEventListener('click', () => actions.onSell());
    element('office-section', this.root).textContent = '가방 속 전리품';
    this.stashList = element('office-stash', this.root);
    this.refreshers.push(() => this.showStash());

    element('office-section', this.root).textContent = '무기';
    this.weaponList = element('shop-weapons', this.root);
    for (const weapon of economy.forSale) this.addWeapon(weapon);

    element('office-section', this.root).textContent = '작업 도구';
    this.toolList = element('shop-stats', this.root);
    for (const tool of economy.tools) this.addTool(tool);

    element('office-section', this.root).textContent = '기타';
    this.addRenameTicket(element('shop-stats', this.root));

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

  /** 닉네임 변경권(2026-11-13 사용자 요청). 여러 장 사 둘 수 있고 I 창 정보창에서 쓴다. */
  private addRenameTicket(list: HTMLElement) {
    const row = element('shop-stat', list);
    const badge = element('shop-stat-badge', row);
    element('shop-stat-id', badge).textContent = '보유';
    const owned = element('shop-stat-value', badge);

    const text = element('shop-stat-text', row);
    element('shop-stat-name', text).textContent = '닉네임 변경권';
    element('shop-stat-blurb', text).textContent = '닉네임을 한 번 바꿉니다. I 창 정보창에서 씁니다.';

    const buy = this.buyButton(row, () => this.actions.onBuyRenameTicket());
    this.refreshers.push(() => {
      owned.textContent = `${this.economy.renameTickets.toLocaleString()}장`;
      buy.textContent = `${RENAME_PRICE.toLocaleString()}G`;
      buy.disabled = this.busy || this.economy.gold < RENAME_PRICE;
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
