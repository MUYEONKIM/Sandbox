import { BLOCK_IDS, BLOCKS, paintBlock, type BlockId } from '../blocks';
import { BAG_SIZE, HOTBAR_SIZE, type Inventory } from '../game/inventory';
import { element } from './dom';

const ICONS = Object.fromEntries(BLOCK_IDS.map((id) => [id, paintBlock(id).toDataURL()])) as Record<BlockId, string>;

/** 화면 위 UI: 단축키 칸, 인벤토리 창, 조작 안내 */
export class Hud {
  private readonly panel: HTMLElement;
  private readonly label: HTMLElement;
  private readonly dragIcon: HTMLImageElement;
  private readonly slots: HTMLElement[] = [];
  private readonly connection: HTMLElement;
  private dragFrom: number | null = null;

  constructor(
    root: HTMLElement,
    private readonly inventory: Inventory,
    nickname: string,
    onSignOut: () => void,
  ) {
    const account = element('account', root);
    element('account-name', account, 'span').textContent = nickname;
    const signOut = element('account-signout', account, 'button') as HTMLButtonElement;
    signOut.type = 'button';
    signOut.textContent = '로그아웃';
    signOut.addEventListener('click', onSignOut);

    this.connection = element('connection', root);
    this.connection.textContent = '서버에 연결하는 중입니다';

    const help = element('help', root);
    help.innerHTML =
      '<b>이동</b> WASD 또는 방향키 (두 키를 함께 누르면 대각선)<br><b>선택</b> 1~9 &nbsp; <b>인벤토리</b> E &nbsp; <b>채팅</b> Enter<br><b>설치</b> 좌클릭 &nbsp; <b>회수</b> 우클릭';

    this.panel = element('panel', root);
    this.panel.hidden = true;
    element('panel-title', this.panel).textContent = '인벤토리';
    const bag = element('slots bag', this.panel);

    const bottom = element('bottom', root);
    this.label = element('selected-name', bottom);
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
      this.dragIcon.src = ICONS[stack.id];
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
      if (stack) icon.src = ICONS[stack.id];
      count.textContent = stack && !dragged ? String(stack.count) : '';
      slot.classList.toggle('selected', i === this.inventory.selected);
    });
    const selected = this.inventory.selectedStack;
    this.label.textContent = selected ? BLOCKS[selected.id].name : '';
  }
}
