import { RENAME_PRICE, type Economy } from '../game/economy';
import { formatLevel, levelNeed } from '../game/level';
import { profitText, STOCK_INFO, type Market } from '../game/market';
import { statEffect } from '../game/stats';
import { element } from './dom';

/** 정보창에 보일 내 상태. HUD가 서버에서 받은 값을 들고 있다. */
export interface MyStatus {
  level: bigint;
  exp: number;
  hp: number;
  maxHp: number;
}

/**
 * I 창의 정보창 탭(2026-11-12 사용자 요청 "닉네임, 레벨, HP, 스텟, 보유자원, 보유 주식").
 * 값은 모두 서버가 정한 것의 사본이고, 보일 때마다 새로 그린다.
 */
export class InfoView {
  constructor(
    private readonly root: HTMLElement,
    /** 내 닉네임. 바꿀 수 있어서 그릴 때마다 묻는다. */
    private readonly nickname: () => string,
    private readonly economy: Economy,
    private readonly market: Market,
    private readonly status: () => MyStatus,
    /** '닉네임 바꾸기'를 누르면 부른다. */
    private readonly onRename: () => void,
  ) {
    root.classList.add('info');
  }

  render() {
    const { level, exp, hp, maxHp } = this.status();
    this.root.replaceChildren();

    const head = element('info-head', this.root);
    element('info-name', head, 'span').textContent = this.nickname();
    element('info-level', head, 'span').textContent = `Lv. ${formatLevel(level)}`;

    // 닉네임 변경권(2026-11-13 사용자 요청 "처음 한 번은 무료, 이후 상점에서 10만 골드")
    const tickets = this.economy.renameTickets;
    const rename = element('info-rename', this.root);
    element('info-rename-count', rename, 'span').textContent = tickets
      ? `닉네임 변경권 ${tickets.toLocaleString()}장`
      : `닉네임 변경권 없음 · 상점에서 ${RENAME_PRICE.toLocaleString()}G`;
    const change = element('info-rename-button', rename, 'button') as HTMLButtonElement;
    change.type = 'button';
    change.textContent = '닉네임 바꾸기';
    change.disabled = tickets < 1;
    change.addEventListener('click', () => this.onRename());

    const basics = element('info-grid', this.root);
    const line = (label: string, value: string) => {
      element('info-label', basics, 'span').textContent = label;
      element('info-value', basics, 'span').textContent = value;
    };
    line('경험치', `${exp.toLocaleString()} / ${levelNeed(level).toLocaleString()}`);
    line('HP', `${hp.toLocaleString()} / ${maxHp.toLocaleString()}`);
    line('골드', `${this.economy.gold.toLocaleString()}G`);

    element('info-section', this.root).textContent = '스텟';
    const stats = element('info-stats', this.root);
    for (const { id, name } of this.economy.stats) {
      const value = this.economy.stat(id);
      const row = element('info-stat', stats);
      element('info-stat-id', row, 'span').textContent = id.toUpperCase();
      element('info-stat-value', row, 'span').textContent = value.toLocaleString();
      element('info-stat-effect', row, 'span').textContent = `${name} · ${statEffect(id, value)}`;
    }

    const loot = this.economy.entries();
    const lootTitle = element('info-section', this.root);
    lootTitle.textContent = loot.length ? `보유 자원 · 상점에 팔면 ${this.economy.stashValue.toLocaleString()}G` : '보유 자원';
    const lootList = element('info-list', this.root);
    if (!loot.length) element('info-empty', lootList).textContent = '주머니가 텅 비었습니다. 노동청에서 일거리를 찾아보세요.';
    for (const { name, count, price } of loot) {
      const row = element('info-row', lootList);
      element('info-row-name', row, 'span').textContent = name;
      element('info-row-count', row, 'span').textContent = `${count.toLocaleString()}개`;
      element('info-row-value', row, 'span').textContent = `${(price * count).toLocaleString()}G`;
    }

    const owned = this.market.owned();
    const stockTitle = element('info-section', this.root);
    stockTitle.textContent = owned.length ? `보유 주식 · 지금 팔면 ${this.market.value.toLocaleString()}G` : '보유 주식';
    const stockList = element('info-list', this.root);
    if (!owned.length) element('info-empty', stockList).textContent = '가진 주식이 없습니다. 증권거래소는 게시판 아래쪽에 있습니다.';
    for (const { quote, shares, cost } of owned) {
      const row = element('info-row info-stock', stockList);
      const icon = element('info-stock-icon', row, 'img') as HTMLImageElement;
      icon.alt = '';
      icon.src = STOCK_INFO[quote.id]?.icon ?? '';
      element('info-row-name', row, 'span').textContent = quote.name;
      element('info-row-count', row, 'span').textContent = `${shares.toLocaleString()}주`;
      const profit = profitText(quote.price * shares, cost);
      element(`info-row-value tone-${profit.tone}`, row, 'span').textContent = profit.text;
    }
  }
}
