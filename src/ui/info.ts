import { RENAME_PRICE, type Economy } from '../game/economy';
import { GRADE_NAME } from '../game/farm';
import { formatNumber, levelNeed } from '../game/level';
import { profitText, STOCK_INFO, type Market } from '../game/market';
import { statEffect } from '../game/stats';
import { element } from './dom';
import { goldText } from '../game/gold';
import { titleEffect, titleLabel, type Titles } from '../game/titles';

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
    /** 휴대폰의 '킬/데스 순위'를 누르면 부른다(키보드의 Tab). 버튼은 손가락 화면에만 보인다(touch.css). */
    private readonly onKillBoard: () => void = () => undefined,
    /** 칭호(2026-11-28). 가진 칭호와 단 칭호, 달기(null이면 떼기) */
    private readonly titles: { store: Titles; wear: (id: string | null) => void } | null = null,
  ) {
    root.classList.add('info');
  }

  /** 칭호 목록을 펼쳤는지. 다시 그려도 그대로 둔다. */
  private titlesOpen = false;

  /**
   * '칭호' 줄: 단 칭호(갑부면 함께), 누르면 가진 칭호 목록과 '달지 않음'(growth-1127.md 8-1). 못 얻은 칭호와 조건은 보이지 않는다.
   * 목록에는 이름과 효과 숫자만(ranking-titles.md 6장). 갑부는 고를 수 없는 줄이다.
   */
  private renderTitles({ store, wear }: { store: Titles; wear: (id: string | null) => void }) {
    const row = element('info-rename info-title', this.root);
    element('info-label', row, 'span').textContent = '칭호';
    const pick = element('info-rename-button info-title-button', row, 'button') as HTMLButtonElement;
    pick.type = 'button';
    pick.textContent = titleLabel(store.wornName, store.rich) || '없음';
    pick.disabled = !store.owned.some((t) => t.kind !== 'rich') && !store.worn;
    pick.addEventListener('click', () => {
      this.titlesOpen = !this.titlesOpen;
      this.render();
    });
    if (!this.titlesOpen || pick.disabled) return;

    const list = element('info-list info-titles', this.root);
    const choose = (id: string | null) => {
      this.titlesOpen = false;
      wear(id);
    };
    for (const title of store.owned) {
      const effect = titleEffect(title);
      if (title.kind === 'rich') {
        const fixed = element('info-title-row fixed', list);
        element('info-title-name', fixed, 'span').textContent = title.name;
        continue;
      }
      const button = element(title.id === store.worn ? 'info-title-row chosen' : 'info-title-row', list, 'button') as HTMLButtonElement;
      button.type = 'button';
      element('info-title-name', button, 'span').textContent = title.name;
      if (effect) element('info-title-effect', button, 'span').textContent = effect;
      button.addEventListener('click', () => choose(title.id));
    }
    const none = element(store.worn === null ? 'info-title-row chosen' : 'info-title-row', list, 'button') as HTMLButtonElement;
    none.type = 'button';
    element('info-title-name', none, 'span').textContent = '달지 않음';
    none.addEventListener('click', () => choose(null));
  }

  render() {
    const { level, exp, hp, maxHp } = this.status();
    this.root.replaceChildren();

    const head = element('info-head', this.root);
    element('info-name', head, 'span').textContent = this.nickname();
    element('info-level', head, 'span').textContent = `Lv. ${formatNumber(level)}`;
    const killBoard = element('info-killboard', head, 'button') as HTMLButtonElement;
    killBoard.type = 'button';
    killBoard.textContent = '킬/데스 순위';
    killBoard.addEventListener('click', () => this.onKillBoard());

    // 닉네임 변경권(2026-11-13 사용자 요청 "처음 한 번은 무료, 이후 상점에서 10만 골드")
    const tickets = this.economy.renameTickets;
    const rename = element('info-rename', this.root);
    element('info-rename-count', rename, 'span').textContent = tickets
      ? `닉네임 변경권 ${tickets.toLocaleString()}장`
      : `닉네임 변경권 없음 · 상점에서 ${goldText(RENAME_PRICE)}`;
    const change = element('info-rename-button', rename, 'button') as HTMLButtonElement;
    change.type = 'button';
    change.textContent = '닉네임 바꾸기';
    change.disabled = tickets < 1;
    change.addEventListener('click', () => this.onRename());

    if (this.titles) this.renderTitles(this.titles);

    const basics = element('info-grid', this.root);
    const line = (label: string, value: string) => {
      element('info-label', basics, 'span').textContent = label;
      element('info-value', basics, 'span').textContent = value;
    };
    line('경험치', `${exp.toLocaleString()} / ${levelNeed(level).toLocaleString()}`);
    line('HP', `${hp.toLocaleString()} / ${maxHp.toLocaleString()}`);
    line('골드', goldText(this.economy.gold));
    // 캠프파이어에 태운 장작 누적 수(2026-11-28 사용자 "정보창에 태운 장작 누적 수가 남고", 하루 첫 번만 1씩 늘어남)
    line('태운 장작', `${this.economy.campfireLogs.toLocaleString()}개`);

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
    lootTitle.textContent = loot.length ? `보유 자원 · 상점에 팔면 ${goldText(this.economy.stashValue)}` : '보유 자원';
    const lootList = element('info-list', this.root);
    if (!loot.length) element('info-empty', lootList).textContent = '주머니가 텅 비었습니다. 노동청에서 일거리를 찾아보세요.';
    for (const { name, count, price } of loot) {
      const row = element('info-row', lootList);
      element('info-row-name', row, 'span').textContent = name;
      element('info-row-count', row, 'span').textContent = `${count.toLocaleString()}개`;
      element('info-row-value', row, 'span').textContent = goldText(price * count);
    }

    // 거둔 농장 작물(2026-11-15 사용자 요청 "I 창에서도 보이게"). 칭찬·일반·비난이 따로 쌓인다. 씨앗은 인벤토리 '씨앗' 탭에 있다.
    const crops = this.economy.cropStock;
    const cropTitle = element('info-section', this.root);
    const cropValue = crops.reduce((sum, row) => sum + row.value, 0);
    cropTitle.textContent = crops.length ? `거둔 작물 · 농협에 팔면 ${goldText(cropValue)}` : '거둔 작물';
    const cropList = element('info-list', this.root);
    if (!crops.length) element('info-empty', cropList).textContent = '거둔 작물이 없습니다.';
    for (const { crop, grade, count, value } of crops) {
      const row = element('info-row', cropList);
      element('info-row-name', row, 'span').textContent = `${GRADE_NAME[grade]}${crop.name}`;
      element('info-row-count', row, 'span').textContent = `${count.toLocaleString()}개`;
      element('info-row-value', row, 'span').textContent = goldText(value);
    }

    const owned = this.market.owned();
    const stockTitle = element('info-section', this.root);
    stockTitle.textContent = owned.length ? `보유 주식 · 지금 팔면 ${goldText(this.market.value)}` : '보유 주식';
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
