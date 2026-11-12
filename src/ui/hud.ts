import { BLOCK_IDS } from '../blocks';
import { HOTBAR_SIZE, TABS, type Inventory, type TabId } from '../game/inventory';
import { formatLevel, levelNeed } from '../game/level';
import { itemName, paintItem, WEAPON_IDS, type ItemId } from '../items';
import { element } from './dom';

/** 이미지를 읽은 뒤에 그릴 수 있어서 Hud를 만들 때 준비한다. */
function paintIcons() {
  return Object.fromEntries([...BLOCK_IDS, ...WEAPON_IDS].map((id) => [id, paintItem(id).toDataURL()])) as Record<
    ItemId,
    string
  >;
}

const TOAST_MS = 3500;

/** 끌고 있는 것: 단축키 칸에서 집었으면 칸 번호, 인벤토리 목록에서 집었으면 그 물건 */
type Drag = { from: number } | { item: ItemId };
const TOAST_LIMIT = 4;

/** 화면 위 UI: 단축키 칸, 인벤토리 창, 조작 안내 */
export class Hud {
  private readonly panel: HTMLElement;
  private readonly panelStats: HTMLElement;
  private readonly pickedName: HTMLElement;
  private readonly pickedIcon: HTMLImageElement;
  private readonly levelText: HTMLElement;
  private readonly expFill: HTMLElement;
  private readonly expText: HTMLElement;
  private readonly dragIcon: HTMLImageElement;
  private readonly slots: HTMLElement[] = [];
  private readonly bag: HTMLElement;
  private readonly tabButtons = new Map<TabId, HTMLButtonElement>();
  private tab: TabId = 'tile';
  private readonly icons = paintIcons();
  private readonly connection: HTMLElement;
  private readonly hpFill: HTMLElement;
  private readonly hpText: HTMLElement;
  private readonly downNotice: HTMLElement;
  private readonly gold: HTMLElement;
  private readonly toastBox: HTMLElement;
  private readonly announceBox: HTMLElement;
  private drag: Drag | null = null;

  constructor(
    root: HTMLElement,
    side: HTMLElement,
    private readonly inventory: Inventory,
    nickname: string,
    onSignOut: () => void,
  ) {
    const account = element('account', side);
    element('account-name', account, 'span').textContent = nickname;
    this.gold = element('account-gold', account, 'span');
    const signOut = element('account-signout', account, 'button') as HTMLButtonElement;
    signOut.type = 'button';
    signOut.textContent = '로그아웃';
    signOut.addEventListener('click', onSignOut);

    this.toastBox = element('toasts', root);
    this.announceBox = element('announce', root);

    this.connection = element('connection', root);
    this.connection.textContent = '서버에 연결하는 중입니다';

    const help = element('help', root);
    help.innerHTML =
      '<b>이동</b> WASD 또는 방향키 (두 키를 함께 누르면 대각선)<br><b>선택</b> 1~9 &nbsp; <b>인벤토리</b> I &nbsp; <b>채팅</b> Enter<br><b>달리기</b> Shift 누르기 &nbsp; <b>점프</b> Space &nbsp; <b>작업</b> F<br><b>설치 / 공격</b> 좌클릭 &nbsp; <b>회수</b> 우클릭 &nbsp; <b>맵 이동</b> 귀퉁이 포탈';

    this.panel = element('panel', root);
    this.panel.hidden = true;
    element('panel-title', this.panel).textContent = '인벤토리';
    this.panelStats = element('panel-stats', this.panel);
    const tabs = element('bag-tabs', this.panel);
    for (const [id, label] of Object.entries(TABS) as [TabId, string][]) {
      const button = element('bag-tab', tabs, 'button') as HTMLButtonElement;
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => {
        this.tab = id;
        this.render();
      });
      this.tabButtons.set(id, button);
    }
    this.bag = element('slots bag', this.panel);
    element('bag-hint', this.panel).textContent =
      '아래 단축키 칸으로 끌어다 놓거나, 누르면 지금 고른 칸에 들어갑니다. 단축키 칸에서 이 창으로 끌면 칸이 비워집니다.';

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
    this.hpFill.style.width = `${Math.min(hp / max, 1) * 100}%`;
    this.hpText.textContent = `HP ${hp} / ${max}`;
  }

  setLevel(level: bigint, exp: number, leveled = false) {
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

  showDown(down: boolean) {
    this.downNotice.hidden = !down;
  }

  setGold(gold: number) {
    this.gold.textContent = `${gold.toLocaleString()}G`;
  }

  setStats(text: string) {
    this.panelStats.textContent = text;
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
    const index = this.slotFrom(e.target);
    const item = this.itemFrom(e.target);
    if (index !== null) {
      const stack = this.inventory.slots[index];
      if (this.isOpen && stack) this.startDrag({ from: index }, stack.id, e);
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
    if (this.isOpen) this.renderBag();
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
    const selected = this.inventory.selectedStack;
    this.pickedName.textContent = selected ? itemName(selected.id) : '빈손';
    this.pickedIcon.hidden = !selected;
    if (selected) this.pickedIcon.src = this.icons[selected.id];
  }
}
