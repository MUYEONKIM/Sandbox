import type { Economy } from '../game/economy';
import type { ForgeTable } from '../game/forge';
import { goldText } from '../game/gold';
import type { Inventory } from '../game/inventory';
import { isGearRef, WEAPONS, type ItemId, type WeaponId } from '../items';
import { element } from './dom';
import './tips.css';

/** 휴대폰에서 이만큼 누르고 있으면 무기 정보를 띄운다(에이전트가 정함, 게임 화면의 블록 회수와 같은 길이). */
const LONG_PRESS_MS = 450;
/** 길게 누르는 동안 손가락이 이만큼(px) 넘게 움직이면 끌기로 본다. */
const PRESS_SLOP_PX = 10;
/** 창과 화면 가장자리·가리킨 칸 사이 여백 */
const GAP_PX = 8;

/** 정보를 띄울 무기: 기본 권총 'pistol'이나 자루 'gear:<id>' */
type WeaponRef = ItemId;

/**
 * 무기 정보 창(2026-11-18 사용자 "무기위에 마우스를 올리면 무기에 대한 정보 (공격력, 판매가격) 등이 뜬다").
 * 단축키 칸과 인벤토리 무기 탭의 무기에 마우스를 올리면 그 칸 바로 위에 이름, 공격력, 강화, 판매가가 뜨고 벗어나면 꺼진다.
 * 대장간 창에는 띄우지 않는다(2026-11-18 사용자 "무기정보는 상점창에서는 안 떠도 괜찮다. 인벤토리에서를 말하는 것이다").
 * 휴대폰은 0.45초 길게 누르면 뜨고 화면을 다시 누르면 꺼진다(한 번 누르기는 칸 고르기·넣기라 겹치지 않게, 에이전트가 정함).
 * 마우스는 칸에 들어가고 나갈 때(pointerover·pointerout)만 일하고, 창은 다른 무기나 값일 때만 다시 쓴다.
 * 판매가는 대장간 팔기와 같은 ForgeTable.sale(LUK 배율 포함, 서버 gear_price와 같은 식)이다.
 * 공격력은 한 번 맞힐 때의 평균 피해: 무기 피해 × 1.03^단계 × (1 + STR × 0.1%)이다(서버 hit_player와 같은 식, 상대 DEF를 빼기 전).
 */
export class WeaponTip {
  private readonly root: HTMLElement;
  private readonly name: HTMLElement;
  private readonly rows: HTMLElement;
  /** 창이 붙어 있는 칸 */
  private anchor: Element | null = null;
  /** 지금 창에 쓴 것(무기와 값). 같으면 다시 쓰지 않는다. */
  private shownKey = '';
  /** 휴대폰에서 누르고 있는 칸 */
  private press: { x: number; y: number; target: Element; timer: number } | null = null;
  /** 휴대폰에서 길게 눌러 창을 띄웠다. 손을 떼어도 칸 고르기·끌어 놓기를 하지 않게 HUD가 끌기를 멈춘다. */
  onLongPress: (() => void) | null = null;
  /** 창을 다시 쓴 횟수(성능 확인용) */
  writes = 0;

  constructor(
    parent: HTMLElement,
    private readonly economy: Economy,
    private readonly inventory: Inventory,
    private readonly table: ForgeTable,
  ) {
    this.root = element('weapon-tip', parent);
    this.name = element('weapon-tip-name', this.root);
    this.rows = element('weapon-tip-rows', this.root);
    this.root.hidden = true;

    parent.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse' || e.buttons) return;
      const found = this.weaponAt(e.target);
      if (found) this.show(found.el, found.ref);
      else this.hide();
    });
    parent.addEventListener('pointerout', (e) => {
      if (e.pointerType !== 'mouse' || !this.anchor) return;
      const to = e.relatedTarget;
      if (!(to instanceof Node && this.anchor.contains(to))) this.hide();
    });
    // 어디든 누르면 창을 닫는다. 휴대폰은 무기 칸이면 길게 누르기를 잰다.
    window.addEventListener(
      'pointerdown',
      (e) => {
        this.hide();
        this.cancelPress();
        if (e.pointerType === 'mouse') return;
        const found = this.weaponAt(e.target);
        if (!found) return;
        const timer = window.setTimeout(() => {
          this.press = null;
          // 인벤토리 목록은 누르는 순간 다시 그려져 누른 칸이 새 칸으로 바뀐다. 같은 무기의 새 칸을 찾는다.
          const el = found.el.isConnected ? found.el : parent.querySelector(`.slot[data-item="${CSS.escape(found.ref)}"]`);
          if (!el) return;
          this.onLongPress?.();
          this.show(el, found.ref);
        }, LONG_PRESS_MS);
        this.press = { x: e.clientX, y: e.clientY, target: found.el, timer };
      },
      true,
    );
    window.addEventListener('pointermove', (e) => {
      const press = this.press;
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > PRESS_SLOP_PX) this.cancelPress();
    });
    window.addEventListener('pointerup', () => this.cancelPress());
    window.addEventListener('pointercancel', () => this.cancelPress());
    // 키를 누르면(I 창 닫기, 칸 고르기) 칸이 바뀌거나 사라지므로 닫는다.
    window.addEventListener('keydown', () => this.hide());
  }

  hide() {
    if (!this.anchor) return;
    this.anchor = null;
    this.root.hidden = true;
  }

  private cancelPress() {
    if (!this.press) return;
    window.clearTimeout(this.press.timer);
    this.press = null;
  }

  /** 가리킨 곳의 무기: 단축키 칸(data-slot)이나 인벤토리 목록(data-item). 무기가 아니면 null */
  private weaponAt(target: EventTarget | null): { el: Element; ref: WeaponRef } | null {
    if (!(target instanceof Element)) return null;
    const el = target.closest<HTMLElement>('.hotbar .slot[data-slot], .panel .slot[data-item]');
    if (!el) return null;
    const ref = (el.dataset.slot !== undefined ? this.inventory.slots[Number(el.dataset.slot)]?.id : el.dataset.item) as WeaponRef | undefined;
    return ref && (ref === 'pistol' || isGearRef(ref)) ? { el, ref } : null;
  }

  /** 무기 ref의 정보 줄. 모르는 무기면 null */
  private describe(ref: WeaponRef): { name: string; rows: [string, string][] } | null {
    const str = this.economy.stat('str');
    const luk = this.economy.stat('luk');
    const attack = (kind: WeaponId, level: number) => {
      const info = this.economy.weapon(kind);
      if (!info) return '';
      const value = Number((info.damage * 1.03 ** level * (1 + str * 0.001)).toFixed(1)).toLocaleString();
      return info.pellets > 1 ? `${value} × ${info.pellets}알` : value;
    };
    const price = (kind: WeaponId) => this.economy.weapon(kind)?.price ?? 0;
    if (ref === 'pistol') {
      return {
        name: WEAPONS.pistol.name,
        rows: [
          ['공격력', attack('pistol', 0)],
          ['강화', '안 됨'],
          ['판매가', '팔 수 없음'],
        ],
      };
    }
    const gear = isGearRef(ref) ? this.inventory.gearOf(ref) : undefined;
    if (!gear) return null;
    return {
      name: WEAPONS[gear.kind].name,
      rows: [
        ['공격력', attack(gear.kind, gear.level)],
        ['강화', `+${gear.level}`],
        ['판매가', goldText(this.table.sale(gear.level, price(gear.kind), luk))],
      ],
    };
  }

  private show(el: Element, ref: WeaponRef) {
    const view = this.describe(ref);
    if (!view) {
      this.hide();
      return;
    }
    const key = `${view.name}|${view.rows.map((row) => row.join(':')).join('|')}`;
    if (key !== this.shownKey) {
      this.shownKey = key;
      this.writes++;
      this.name.textContent = view.name;
      this.rows.replaceChildren();
      for (const [label, value] of view.rows) {
        const row = element('weapon-tip-row', this.rows);
        element('weapon-tip-label', row, 'span').textContent = label;
        element('weapon-tip-value', row, 'span').textContent = value;
      }
    }
    if (el === this.anchor && !this.root.hidden) return;
    this.anchor = el;
    this.root.hidden = false;
    // 가리킨 칸 바로 위 가운데. 위가 모자라면 아래에 두고, 화면 밖으로 나가지 않게 한다.
    const box = el.getBoundingClientRect();
    const width = this.root.offsetWidth;
    const height = this.root.offsetHeight;
    const left = Math.min(Math.max(GAP_PX, box.left + box.width / 2 - width / 2), window.innerWidth - width - GAP_PX);
    const above = box.top - height - GAP_PX;
    this.root.style.left = `${Math.round(left)}px`;
    this.root.style.top = `${Math.round(above >= GAP_PX ? above : box.bottom + GAP_PX)}px`;
  }
}
