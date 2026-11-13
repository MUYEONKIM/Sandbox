import { paintMemoPadIcon } from '../art/drops';
import { BLOCK_IDS } from '../blocks';
import { HOTBAR_SIZE, MEMO_SLOT, TABS, type Inventory, type TabId } from '../game/inventory';
import { formatLevel, levelNeed } from '../game/level';
import { itemName, paintItem, WEAPON_IDS, type ItemId } from '../items';
import { element } from './dom';
import type { MyStatus } from './info';

/** 이미지를 읽은 뒤에 그릴 수 있어서 Hud를 만들 때 준비한다. */
function paintIcons() {
  return Object.fromEntries([...BLOCK_IDS, ...WEAPON_IDS].map((id) => [id, paintItem(id).toDataURL()])) as Record<
    ItemId,
    string
  >;
}

const TOAST_MS = 3500;

/** 왼쪽 위 조작 안내: [이름, 키들, 덧붙임] */
const HELP_ROWS: [string, string[], string?][] = [
  ['이동', ['WASD', '방향키'], '두 키는 대각선'],
  ['달리기 · 점프', ['Shift', 'Space']],
  ['선택', ['1~9'], '메모장 0'],
  ['인벤토리 · 채팅', ['I', 'Enter']],
  ['작업 · 줍기', ['F']],
  ['설치 · 공격', ['좌클릭']],
  ['회수', ['우클릭']],
  ['가구 돌리기', ['R']],
  ['맵 이동', ['귀퉁이 포탈']],
];

/** 인벤토리 창의 탭: 블록과 무기 탭(inventory.ts의 TABS) 뒤에 주운 메모 탭 */
type BagTab = TabId | 'memo';
const BAG_TABS: Record<BagTab, string> = { ...TABS, memo: '메모' };

/** 끌고 있는 것: 단축키 칸에서 집었으면 칸 번호, 인벤토리 목록에서 집었으면 그 물건 */
type Drag = { from: number } | { item: ItemId };
const TOAST_LIMIT = 4;

/** I 창의 탭(2026-11-12 사용자 요청 "정보창, 인벤토리 탭으로 나뉜다"). 처음엔 정보창, 그 뒤로는 마지막에 본 탭이 열린다. */
const VIEWS = { info: '정보창', bag: '인벤토리' } as const;
type View = keyof typeof VIEWS;

/** 화면 위 UI: 단축키 칸, 인벤토리 창, 조작 안내 */
export class Hud {
  private readonly panel: HTMLElement;
  /** 화면 왼쪽 위에 세로로 쌓는 칸(조작 안내, 현상범 명단) */
  readonly topLeft: HTMLElement;
  /** 정보창 탭의 내용이 들어가는 칸. 그리는 것은 InfoView다. */
  readonly infoPane: HTMLElement;
  private readonly bagPane: HTMLElement;
  private readonly viewButtons = new Map<View, HTMLButtonElement>();
  private view: View = 'info';
  private renderInfo: (() => void) | null = null;
  /** 정보창에 보일 레벨, 경험치, 체력. setLevel, setHp가 고친다. */
  readonly status: MyStatus = { level: 1n, exp: 0, hp: 0, maxHp: 0 };
  private readonly pickedName: HTMLElement;
  private readonly pickedIcon: HTMLImageElement;
  private readonly levelText: HTMLElement;
  private readonly expFill: HTMLElement;
  private readonly expText: HTMLElement;
  private readonly dragIcon: HTMLImageElement;
  private readonly slots: HTMLElement[] = [];
  /** 0번 키 칸: 언제나 메모장(inventory.ts의 MEMO_SLOT) */
  private readonly memoSlot: HTMLElement;
  private readonly memoIcon = paintMemoPadIcon().toDataURL();
  private readonly bag: HTMLElement;
  private readonly bagHint: HTMLElement;
  /** 인벤토리의 '메모' 탭 내용. 그리는 것은 GroundUi다. */
  private readonly memoPane: HTMLElement;
  private renderMemos: ((pane: HTMLElement) => void) | null = null;
  private readonly bagGold: HTMLElement;
  private readonly tabButtons = new Map<BagTab, HTMLButtonElement>();
  private tab: BagTab = 'tile';
  private readonly icons = paintIcons();
  /** 인벤토리의 골드 '버리기' 버튼을 누르면 부른다(main.ts가 정한다). */
  onDropGold: (() => void) | null = null;
  private readonly connection: HTMLElement;
  private readonly hpFill: HTMLElement;
  private readonly hpText: HTMLElement;
  private readonly downNotice: HTMLElement;
  private readonly gold: HTMLElement;
  private readonly toastBox: HTMLElement;
  private readonly announceBox: HTMLElement;
  private readonly accountName: HTMLElement;
  private popupBox: HTMLElement | null = null;
  private drag: Drag | null = null;

  constructor(
    root: HTMLElement,
    side: HTMLElement,
    private readonly inventory: Inventory,
    nickname: string,
    onSignOut: () => void,
  ) {
    const account = element('account', side);
    this.accountName = element('account-name', account, 'span');
    this.accountName.textContent = nickname;
    this.gold = element('account-gold', account, 'span');
    const signOut = element('account-signout', account, 'button') as HTMLButtonElement;
    signOut.type = 'button';
    signOut.textContent = '로그아웃';
    signOut.addEventListener('click', onSignOut);

    this.toastBox = element('toasts', root);
    this.announceBox = element('announce', root);

    this.connection = element('connection', root);
    this.connection.textContent = '서버에 연결하는 중입니다';

    /** 왼쪽 위 칸: 조작 안내와 그 아래 현상범 명단 */
    this.topLeft = element('top-left', root);
    // 항목마다 한 줄, 키는 키보드 단추 모양(2026-11-13 사용자 "글자만 이어져 있어 가독성이 떨어진다").
    const help = element('help', this.topLeft);
    for (const [label, keys, note] of HELP_ROWS) {
      element('help-label', help, 'span').textContent = label;
      const row = element('help-keys', help, 'span');
      keys.forEach((key, i) => {
        if (i) element('help-or', row, 'span').textContent = '/';
        element('help-key', row, 'kbd').textContent = key;
      });
      if (note) element('help-note', row, 'span').textContent = note;
    }

    this.panel = element('panel', root);
    this.panel.hidden = true;
    const views = element('panel-views', this.panel);
    for (const [id, label] of Object.entries(VIEWS) as [View, string][]) {
      const button = element('panel-view', views, 'button') as HTMLButtonElement;
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => {
        this.view = id;
        this.render();
      });
      this.viewButtons.set(id, button);
    }
    this.infoPane = element('panel-pane', this.panel);
    this.bagPane = element('panel-pane', this.panel);
    // 가진 골드와 버리기 버튼(2026-11-13 사용자 요청 "인벤토리에서 나의 골드 옆에 '버리기' 버튼")
    const goldRow = element('bag-gold', this.bagPane);
    element('bag-gold-label', goldRow, 'span').textContent = '골드';
    this.bagGold = element('bag-gold-amount', goldRow, 'span');
    const dropGold = element('bag-gold-drop', goldRow, 'button') as HTMLButtonElement;
    dropGold.type = 'button';
    dropGold.textContent = '버리기';
    dropGold.addEventListener('click', () => this.onDropGold?.());
    const tabs = element('bag-tabs', this.bagPane);
    for (const [id, label] of Object.entries(BAG_TABS) as [BagTab, string][]) {
      const button = element('bag-tab', tabs, 'button') as HTMLButtonElement;
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => {
        this.tab = id;
        this.render();
      });
      this.tabButtons.set(id, button);
    }
    this.bag = element('slots bag', this.bagPane);
    this.memoPane = element('memo-bag', this.bagPane);
    this.bagHint = element('bag-hint', this.bagPane);
    this.bagHint.textContent =
      '아래 단축키 칸으로 끌어다 놓거나, 누르면 지금 고른 칸에 들어갑니다. 단축키 칸에서 이 창으로 끌면 칸이 비워집니다. 가구는 R(휴대폰은 고른 칸을 한 번 더 누름)로 방향을 돌립니다.';

    this.downNotice = element('down-notice', root);
    this.downNotice.textContent = '쓰러졌습니다. 잠시 후 포탈 앞에서 다시 시작합니다.';
    this.downNotice.hidden = true;

    const bottom = element('bottom', root);

    const status = element('status', bottom);
    this.levelText = element('status-level', status);
    const exp = element('exp', status);
    this.expFill = element('exp-fill', exp);
    this.expText = element('exp-text', exp);
    const hp = element('hp', status);
    this.hpFill = element('hp-fill', hp);
    this.hpText = element('hp-text', hp);

    const picked = element('picked', bottom);
    this.pickedIcon = element('picked-icon', picked, 'img') as HTMLImageElement;
    this.pickedIcon.alt = '';
    this.pickedName = element('picked-name', picked);

    const hotbar = element('slots hotbar', bottom);

    for (let i = 0; i < HOTBAR_SIZE; i++) this.slots.push(this.createSlot(i, hotbar));
    this.memoSlot = element('slot memo-slot', hotbar);
    this.memoSlot.title = '메모장: 좌클릭하면 쪽지를 써서 선 자리에 놓습니다';
    const memoIcon = element('slot-icon', this.memoSlot, 'img') as HTMLImageElement;
    memoIcon.draggable = false;
    memoIcon.alt = '';
    memoIcon.src = this.memoIcon;
    element('slot-key', this.memoSlot).textContent = '0';

    this.dragIcon = element('drag-icon', root, 'img') as HTMLImageElement;
    this.dragIcon.hidden = true;

    root.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.moveDragIcon(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));

    inventory.onChange(() => this.render());
    this.render();
  }

  get isOpen() {
    return !this.panel.hidden;
  }

  /** 끊겼으면 이유를 문구 옆에 작게 쓴다. 원인을 알아보는 데 쓴다. */
  setConnected(connected: boolean, reason: string | null = null) {
    this.connection.hidden = connected;
    this.connection.textContent = reason ? `서버에 연결하는 중입니다 (${reason})` : '서버에 연결하는 중입니다';
  }

  setHp(hp: number, max: number) {
    this.status.hp = hp;
    this.status.maxHp = max;
    this.refreshInfo();
    this.hpFill.style.width = `${Math.min(hp / max, 1) * 100}%`;
    this.hpText.textContent = `HP ${hp} / ${max}`;
  }

  setLevel(level: bigint, exp: number, leveled = false) {
    this.status.level = level;
    this.status.exp = exp;
    this.refreshInfo();
    this.levelText.textContent = `Lv. ${formatLevel(level)}`;
    const need = levelNeed(level);
    this.expFill.style.width = `${Math.min(exp / need, 1) * 100}%`;
    this.expText.textContent = `EXP ${exp.toLocaleString()} / ${need.toLocaleString()}`;
    if (!leveled) return;
    // 클래스를 뗀 상태를 브라우저가 한 번 계산하게 해야 다시 붙일 때 애니메이션이 처음부터 돈다.
    this.levelText.classList.remove('gained');
    void this.levelText.offsetWidth;
    this.levelText.classList.add('gained');
  }

  /** 숨은 장소를 찾았을 때 화면 위쪽 가운데에 이름을 크게 띄웠다가 지운다. */
  announce(text: string) {
    this.announceBox.textContent = text;
    // 클래스를 뗀 상태를 브라우저가 한 번 계산하게 해야 다시 붙일 때 애니메이션이 처음부터 돈다.
    this.announceBox.classList.remove('show');
    void this.announceBox.offsetWidth;
    this.announceBox.classList.add('show');
  }

  /** 화면 가운데 작은 팝업창. 누르거나 8초가 지나면 닫힌다. 숨은 방에 들어간 사람에게만 띄운다. */
  popup(text: string) {
    this.popupBox?.remove();
    const box = element('popup', this.announceBox.parentElement!);
    element('popup-text', box).textContent = text;
    const close = element('popup-close', box, 'button') as HTMLButtonElement;
    close.type = 'button';
    close.textContent = '확인';
    const dismiss = () => {
      box.remove();
      if (this.popupBox === box) this.popupBox = null;
    };
    box.addEventListener('click', dismiss);
    window.setTimeout(dismiss, 8000);
    this.popupBox = box;
  }

  showDown(down: boolean) {
    this.downNotice.hidden = !down;
  }

  /** 닉네임을 바꾸면 오른쪽 위 계정 줄의 이름도 바꾼다. */
  setNickname(nickname: string) {
    this.accountName.textContent = nickname;
  }

  setGold(gold: number) {
    this.gold.textContent = `${gold.toLocaleString()}G`;
    this.bagGold.textContent = `${gold.toLocaleString()}G`;
  }

  /** 인벤토리 '메모' 탭을 그리는 함수를 받는다. */
  setMemoRenderer(render: (pane: HTMLElement) => void) {
    this.renderMemos = render;
    this.refreshMemos();
  }

  /** 주운 메모가 바뀌면 부른다. '메모' 탭이 보이고 있으면 다시 그린다. */
  refreshMemos() {
    if (this.isOpen && this.view === 'bag' && this.tab === 'memo') this.renderMemos?.(this.memoPane);
  }

  /** 정보창 탭을 그리는 함수를 받는다. */
  setInfoRenderer(render: () => void) {
    this.renderInfo = render;
    this.refreshInfo();
  }

  /** 정보창이 보이고 있으면 다시 그린다. 골드, 자원, 주식이 바뀔 때 부른다. */
  refreshInfo() {
    if (this.isOpen && this.view === 'info') this.renderInfo?.();
  }

  /** 화면 아래쪽에 잠깐 뜨는 알림 */
  toast(title: string, detail = '', rare = false) {
    const box = element(rare ? 'toast rare' : 'toast', this.toastBox);
    element('toast-title', box).textContent = title;
    if (detail) element('toast-detail', box).textContent = detail;
    while (this.toastBox.childElementCount > TOAST_LIMIT) this.toastBox.firstElementChild?.remove();
    window.setTimeout(() => box.remove(), TOAST_MS);
  }

  toggle() {
    this.panel.hidden = !this.panel.hidden;
    this.cancelDrag();
    this.render();
  }

  close() {
    this.panel.hidden = true;
    this.cancelDrag();
  }

  private createSlot(index: number, parent: HTMLElement) {
    const slot = element('slot', parent);
    slot.dataset.slot = String(index);
    const icon = element('slot-icon', slot, 'img') as HTMLImageElement;
    icon.draggable = false;
    icon.alt = '';
    element('slot-key', slot).textContent = String(index + 1);
    element('slot-count', slot);
    return slot;
  }

  /** 단축키 칸 번호. 단축키 칸이 아니면 null */
  private slotFrom(target: EventTarget | null) {
    const el = target instanceof Element ? target.closest<HTMLElement>('.slot[data-slot]') : null;
    return el ? Number(el.dataset.slot) : null;
  }

  /** 인벤토리 목록의 물건. 목록이 아니면 null */
  private itemFrom(target: EventTarget | null) {
    const el = target instanceof Element ? target.closest<HTMLElement>('.slot[data-item]') : null;
    return el ? (el.dataset.item as ItemId) : null;
  }

  private onPointerDown(e: PointerEvent) {
    if (e.target instanceof Element && e.target.closest('.memo-slot')) {
      this.inventory.select(MEMO_SLOT);
      return;
    }
    const index = this.slotFrom(e.target);
    const item = this.itemFrom(e.target);
    if (index !== null) {
      const stack = this.inventory.slots[index];
      if (this.isOpen && stack) this.startDrag({ from: index }, stack.id, e);
      // 고른 칸을 한 번 더 누르면 가구를 돌린다(휴대폰에는 R 키가 없어서).
      else if (index === this.inventory.selected) this.inventory.rotateSelected();
      else this.inventory.select(index);
    } else if (item && this.isOpen) {
      this.startDrag({ item }, item, e);
    }
  }

  private startDrag(drag: Drag, id: ItemId, e: PointerEvent) {
    this.drag = drag;
    this.dragIcon.src = this.icons[id];
    this.dragIcon.hidden = false;
    this.moveDragIcon(e);
    this.render();
  }

  private moveDragIcon(e: PointerEvent) {
    if (this.drag === null) return;
    this.dragIcon.style.left = `${e.clientX}px`;
    this.dragIcon.style.top = `${e.clientY}px`;
  }

  private onPointerUp(e: PointerEvent) {
    const drag = this.drag;
    if (drag === null) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const to = this.slotFrom(target);
    this.cancelDrag();
    if ('from' in drag) {
      if (to !== null && to !== drag.from) this.inventory.move(drag.from, to);
      else if (to === drag.from) this.inventory.select(drag.from);
      else if (target?.closest('.panel')) this.inventory.clear(drag.from);
    } else if (to !== null) {
      this.inventory.put(to, drag.item);
    } else if (this.itemFrom(target) === drag.item) {
      // 끌지 않고 누르기만 했으면 지금 고른 단축키 칸에 넣는다.
      this.inventory.put(this.inventory.selected, drag.item);
    }
    this.render();
  }

  private cancelDrag() {
    this.drag = null;
    this.dragIcon.hidden = true;
  }

  /** 지금 탭의 목록. 단축키 칸에 들어 있는 것은 칸 번호를 붙인다. */
  private renderBag() {
    for (const [id, button] of this.tabButtons) button.classList.toggle('chosen', id === this.tab);
    this.bag.replaceChildren();
    const memo = this.tab === 'memo';
    this.bag.hidden = memo;
    this.bagHint.hidden = memo;
    this.memoPane.hidden = !memo;
    if (this.tab === 'memo') {
      this.renderMemos?.(this.memoPane);
      return;
    }
    for (const id of this.inventory.catalog(this.tab)) {
      const cell = element('slot', this.bag);
      cell.dataset.item = id;
      cell.title = itemName(id);
      const icon = element('slot-icon', cell, 'img') as HTMLImageElement;
      icon.draggable = false;
      icon.alt = '';
      icon.src = this.icons[id];
      const at = this.inventory.hotbarIndexOf(id);
      if (at >= 0) {
        cell.classList.add('in-hotbar');
        element('slot-key', cell).textContent = String(at + 1);
      }
    }
  }

  private render() {
    for (const [id, button] of this.viewButtons) button.classList.toggle('chosen', id === this.view);
    this.infoPane.hidden = this.view !== 'info';
    this.bagPane.hidden = this.view !== 'bag';
    if (this.isOpen && this.view === 'bag') this.renderBag();
    this.refreshInfo();
    this.slots.forEach((slot, i) => {
      const stack = this.inventory.slots[i];
      const icon = slot.querySelector<HTMLImageElement>('.slot-icon')!;
      const count = slot.querySelector<HTMLElement>('.slot-count')!;
      const dragged = this.drag !== null && 'from' in this.drag && this.drag.from === i;
      icon.hidden = !stack || dragged;
      if (stack) icon.src = this.icons[stack.id];
      // 블록은 무제한이고 무기는 하나라 개수를 쓰지 않는다.
      count.textContent = '';
      slot.classList.toggle('selected', i === this.inventory.selected);
    });
    this.memoSlot.classList.toggle('selected', this.inventory.memoSelected);
    if (this.inventory.memoSelected) {
      this.pickedName.textContent = '메모장';
      this.pickedIcon.hidden = false;
      this.pickedIcon.src = this.memoIcon;
      return;
    }
    const selected = this.inventory.selectedStack;
    this.pickedName.textContent = selected ? itemName(selected.id) : '빈손';
    this.pickedIcon.hidden = !selected;
    if (selected) this.pickedIcon.src = this.icons[selected.id];
  }
}
