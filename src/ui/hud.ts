import { BLOCK_IDS } from '../blocks';
import { BAG_SIZE, HOTBAR_SIZE, type Inventory } from '../game/inventory';
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
  private readonly icons = paintIcons();
  private readonly connection: HTMLElement;
  private readonly hpFill: HTMLElement;
  private readonly hpText: HTMLElement;
  private readonly downNotice: HTMLElement;
  private readonly gold: HTMLElement;
  private readonly toastBox: HTMLElement;
  private readonly announceBox: HTMLElement;
  private dragFrom: number | null = null;

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
    const bag = element('slots bag', this.panel);

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

    for (let i = 0; i < HOTBAR_SIZE + BAG_SIZE; i++) {
      this.slots.push(this.createSlot(i, i < HOTBAR_SIZE ? hotbar : bag));
    }

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

  setConnected(connected: boolean) {
    this.connection.hidden = connected;
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
    if (index < HOTBAR_SIZE) element('slot-key', slot).textContent = String(index + 1);
    element('slot-count', slot);
    return slot;
  }

  private slotFrom(target: EventTarget | null) {
    const el = target instanceof Element ? target.closest<HTMLElement>('.slot') : null;
    return el ? Number(el.dataset.slot) : null;
  }

  private onPointerDown(e: PointerEvent) {
    const index = this.slotFrom(e.target);
    if (index === null) return;
    const stack = this.inventory.slots[index];
    if (this.isOpen && stack) {
      this.dragFrom = index;
      this.dragIcon.src = this.icons[stack.id];
      this.dragIcon.hidden = false;
      this.moveDragIcon(e);
      this.render();
    } else if (index < HOTBAR_SIZE) {
      this.inventory.select(index);
    }
  }

  private moveDragIcon(e: PointerEvent) {
    if (this.dragFrom === null) return;
    this.dragIcon.style.left = `${e.clientX}px`;
    this.dragIcon.style.top = `${e.clientY}px`;
  }

  private onPointerUp(e: PointerEvent) {
    if (this.dragFrom === null) return;
    const from = this.dragFrom;
    const to = this.slotFrom(document.elementFromPoint(e.clientX, e.clientY));
    this.cancelDrag();
    if (to !== null && to !== from) this.inventory.move(from, to);
    else if (to === from && from < HOTBAR_SIZE) this.inventory.select(from);
    this.render();
  }

  private cancelDrag() {
    this.dragFrom = null;
    this.dragIcon.hidden = true;
  }

  private render() {
    this.slots.forEach((slot, i) => {
      const stack = this.inventory.slots[i];
      const icon = slot.querySelector<HTMLImageElement>('.slot-icon')!;
      const count = slot.querySelector<HTMLElement>('.slot-count')!;
      const dragged = this.dragFrom === i;
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
