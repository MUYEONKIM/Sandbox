import { adventureArt, itemIcon } from '../art/adventureArt';
import type { Adventure } from '../game/adventure';
import { ADV_STATS, PER_POINT, type AdvStat } from '../game/adventureRules';
import { formatNumber } from '../game/level';
import { adventureEquipWeapon, type AdvItem, type AdvView, type AdvWeapon } from '../net/adventure';
import { adventureCall, button, equipEffects, floatTip, STAT_NAME, weaponCanvas, weaponCard, weaponSlot } from './adventure';
import { element } from './dom';

/**
 * 모험 장비창(2026-11-21, 디자인 adventure-ui.md 23절, 시안 gear-board.png). 모험 맵에서 I(HUD [스텟])로 스텟 판과 함께 연다.
 * 사용자: "모험에서의 인벤토리 즉 스텟창을 열면 스텟창과 함께, 화면 중앙에 장비창을 같이 뜨게 한다."
 *         "거기서는 지금 탭별로 나눠놓은 atk, def, agi 등등으로 있는 무기들이 뜨도록 한다." "미수집된 아이템도 마찬가지로 해당창에 ?로 스켈레톤이 뜨게한다."
 *         "현재 낀 장신구가 어떤게 있는지 함꼐 보였으면 좋겠다." "마우스를 호버하면 효능이 뜬다." "무기도 띄워"
 * 위에서부터: 낀 무기 칸 → 낀 장신구 띠 → 스텟 탭 [HP][ATK][DEF][AGI][LUC] + 모은 수 → 그 스텟 무기 모두(못 모은 것은 점선 ? 칸) → 고른 무기 카드.
 * 마우스(PC): 모은 무기 칸·낀 무기 칸에 올리면 버튼 없는 무기 카드, 장신구 칸에 올리면 효능 숫자. 터치는 누를 때마다 열고 닫는다.
 * 누르기: 모은 무기를 누르면 고르고 아래에 카드 + [장착](낀 무기면 [빼기]). 같은 칸을 다시 누르면 닫는다.
 * 문구는 숫자 상태 값과 버튼 이름뿐이다.
 *
 * 그리는 일: 창 전체는 gearKey(낀 무기, 가진 무기와 수, 낀 장신구, 그림)가 바뀔 때만 다시 그린다(AdventureField).
 * 탭을 누르면 격자만, 무기를 누르면 아래 카드만 다시 그린다. 마우스 올림 카드는 칸을 넘을 때만 만든다.
 */

/** 장비창의 화면 상태(창을 다시 그려도 남긴다, AdventureField가 가짐). 창을 닫으면 처음으로 돌린다. */
export interface GearUi {
  /** 스텟 탭. null이면 낀 무기의 스텟(없으면 ATK) */
  tab: AdvStat | null;
  /** 누른 무기 */
  sel: string | null;
}

/** 장비창을 다시 그릴지 가르는 값: 낀 무기, 가진 무기와 수, 열린 장신구 칸과 낀 장신구, 무기 목록, 그림 */
export function gearKey(adv: Adventure, view: AdvView) {
  let key = `${view.mainWeapon}|${view.slots}|${adv.weapons.length}|${adventureArt ? 1 : 0}|`;
  for (const c of view.collection) key += `${c.weapon}:${c.copies},`;
  key += '|';
  for (const o of view.owned) if (o.slot) key += `${o.item}@${o.slot},`;
  return key;
}

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

/**
 * 장신구 효능 한 줄(숫자 상태 값만, 디자인 23절 3번 표). 상점·장신구 탭의 itemEffect 글은 그대로 두고 이 띠에서만 쓴다.
 * 보석은 그 스텟 고정 포인트 × 1포인트 효과(HP × 5, DEF × 3)다.
 */
export function trinketStat(t: AdvItem) {
  switch (t.kind) {
    case 'gem': {
      const s = t.stat ?? 'hp';
      return `${STAT_NAME[s]} +${formatNumber(t.value * PER_POINT[s])}`;
    }
    case 'learn':
      return `경험치 +${pct(t.value)}`;
    case 'pouch':
      return `금화 +${pct(t.value)}`;
    case 'combo':
      return `콤보 +${pct(t.value)}p · 상한 ${pct(t.value2 ?? 0.5)}`;
    case 'sharp':
      return `크리티컬 피해 ×${t.value}`;
    case 'leech':
      return `흡혈 ${pct(t.value)}`;
    case 'endure':
      return `버팀 ${pct(Math.min(1, t.value))}`;
  }
}

/**
 * 낀 장신구 띠(디자인 23절 3번): 열린 칸(view.slots)만 칸 번호 차례로. 낀 칸은 아이콘, 빈 칸은 점선. 앞에 "장신구".
 * 마우스를 올리면 띠 바로 아래에 이름·단계와 효능 숫자가 뜬다. 터치는 누를 때마다 열고 닫는다(다른 칸이면 그 칸으로).
 */
function trinketStrip(parent: HTMLElement, view: AdvView) {
  const box = element('adv-trinkets', parent);
  element('adv-trinkets-key', box).textContent = '장신구';
  const row = element('adv-trinkets-row', box);
  // 뜨는 칸은 띠에 하나(처음 보일 때 만들고, 칸을 옮기면 글만 바꾼다)
  let tip: HTMLElement | null = null;
  let tipName: HTMLElement | null = null;
  let tipStat: HTMLElement | null = null;
  let onCell: HTMLElement | null = null;
  const show = (cell: HTMLElement | null, t: AdvItem | null) => {
    onCell?.classList.remove('on');
    onCell = cell;
    if (!cell || !t) {
      if (tip) tip.hidden = true;
      return;
    }
    if (!tip) {
      tip = element('adv-trinket-tip', box);
      tipName = element('adv-trinket-tip-name', tip);
      tipStat = element('adv-trinket-tip-stat', tip);
    }
    cell.classList.add('on');
    tipName!.textContent = `${t.name} ${t.tier}단계`;
    tipStat!.textContent = trinketStat(t);
    // 꼬리는 그 칸 가운데를 가리킨다(띠 안쪽 기준 px)
    tip.style.setProperty('--ax', `${cell.offsetLeft + cell.offsetWidth / 2}px`);
    tip.hidden = false;
  };
  for (let s = 1; s <= view.slots; s++) {
    const worn = view.owned.find((o) => o.slot === s);
    const t = worn ? view.shop.find((i) => i.id === worn.item) : undefined;
    const cell = element(`adv-trinket${t ? '' : ' empty'}`, row);
    if (!t) continue;
    cell.appendChild(itemIcon(t.kind, t.stat));
    cell.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') show(cell, t);
    });
    cell.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') show(null, null);
    });
    // 마우스로 누르면 그대로 보이고, 터치는 누를 때마다 열고 닫는다.
    cell.addEventListener('click', (e) => {
      show((e as PointerEvent).pointerType === 'mouse' || onCell !== cell ? cell : null, t);
    });
  }
  return box;
}

/** 무기 종류 차례: 일반 → 중간 보스 → 보스 */
const kindRank = (w: AdvWeapon) => (w.boss ? 2 : w.mini ? 1 : 0);

/**
 * 장비창을 win 안에 그린다(win은 비어 있어야 한다). ui는 탭과 고른 무기를 남기는 곳.
 * [장착]/[빼기]는 adventure_equip_weapon을 부르고, 서버 값이 바뀌면 AdventureField가 창을 다시 그린다.
 */
export function gearWindow(win: HTMLElement, adv: Adventure, view: AdvView, ui: GearUi) {
  const copiesOf = new Map(view.collection.map((c) => [c.weapon, c.copies]));
  const copies = (id: string) => copiesOf.get(id) ?? 0;
  const eq = view.mainWeapon && copies(view.mainWeapon) ? adv.weapon(view.mainWeapon) : undefined;
  const tab: AdvStat = (ui.tab ??= eq?.stat ?? 'atk');
  const msg = element('adv-message', document.createElement('div'));
  const say = (text: string) => (msg.textContent = text);

  // 1. 낀 무기 칸([바꾸기] 없음: 무기는 아래 목록에서 바로 고른다). 그림에 마우스를 올리면 카드, 터치는 누를 때마다 열고 닫기.
  const slot = element('adv-equip-slot', element('adv-equip', win));
  const icon = element('adv-equip-icon', slot);
  const info = element('adv-equip-info', slot);
  const head = element('adv-equip-head', info);
  if (eq) {
    icon.appendChild(weaponCanvas(eq.art, 40));
    element('adv-wcard-star', head, 'span').textContent = '★'.repeat(eq.star);
    const n = copies(eq.id);
    if (n > 1) element('adv-wcard-plus', head, 'span').textContent = ` +${n - 1}`;
    element('adv-equip-fx', info).textContent = equipEffects(adv, eq, n);
    const eqTip = floatTip(win, adv);
    const showEq = (on: boolean) => (on ? eqTip.show(eq, slot, false) : eqTip.hide());
    icon.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') showEq(true);
    });
    icon.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') showEq(false);
    });
    icon.addEventListener('click', (e) => showEq((e as PointerEvent).pointerType === 'mouse' || !eqTip.open));
  } else {
    element('', head, 'b').textContent = '장검';
    element('adv-equip-fx dim', info).textContent = '-';
  }

  // 2. 낀 장신구 띠
  trinketStrip(win, view);

  // 3. 스텟 탭 + 그 탭에서 모은 수(숫자만)
  const tabs = element('adv-gear-tabs', win);
  const chips = new Map<AdvStat, HTMLButtonElement>();
  for (const k of ADV_STATS) {
    chips.set(k, button(`adv-chip${k === tab ? ' on' : ''}`, tabs, STAT_NAME[k], () => {
      if (ui.tab === k) return;
      ui.tab = k;
      ui.sel = null;
      for (const [s, chip] of chips) chip.classList.toggle('on', s === k);
      paintGrid();
    }));
  }
  const count = element('adv-gear-count', tabs, 'span');

  // 4. 그 스텟 무기 모두. 지역 차례, 같은 지역은 일반 무기 별 낮은 것부터, 그다음 중간 보스·보스 무기(모아도 자리가 바뀌지 않음).
  const wrap = element('adv-gear-gridwrap', win);
  const grid = element('adv-gear-grid', wrap);
  const tip = floatTip(wrap, adv);
  const selHost = element('adv-equip-sel', win);
  win.append(msg);
  const zoneAt = new Map(view.zones.map((z, i) => [z.id, i]));
  const zoneOf = (w: AdvWeapon) => zoneAt.get(w.zone) ?? zoneAt.size;

  const act = (w: AdvWeapon, on: boolean) => {
    // 되면 서버 값이 바뀌어 창을 다시 그린다. 그때 카드는 닫혀 있게 먼저 고르기를 푼다(안 되면 되돌림).
    const before = ui.sel;
    ui.sel = null;
    void adventureCall(adv, () => adventureEquipWeapon(on ? null : w.id), say, '', 'equip').then((ok) => {
      if (!ok) ui.sel = before;
    });
  };
  /** 고른 무기 카드. reveal이면 창이 스크롤될 때 카드가 보이게 민다. */
  const showSel = (reveal = false) => {
    selHost.replaceChildren();
    const w = adv.weapon(ui.sel);
    selHost.hidden = !w;
    if (!w) return;
    const on = w.id === view.mainWeapon;
    weaponCard(selHost, adv, w, on ? 'equipped' : 'pick', () => act(w, on));
    if (reveal) selHost.scrollIntoView({ block: 'nearest' });
  };
  const paintGrid = () => {
    grid.replaceChildren();
    tip.hide();
    const k = ui.tab ?? tab;
    const list = adv.weapons
      .filter((w) => w.stat === k)
      .sort((a, b) => zoneOf(a) - zoneOf(b) || kindRank(a) - kindRank(b) || a.star - b.star || Number(a.art) - Number(b.art));
    let have = 0;
    let chosen: HTMLElement | null = null;
    for (const w of list) {
      const n = copies(w.id);
      if (!n) {
        // 못 모은 무기: 그림 없이 점선 빈 칸 가운데 "?". 누르거나 올려도 아무것도 뜨지 않는다.
        element('adv-weapon-q', element('adv-weapon q', grid)).textContent = '?';
        continue;
      }
      have++;
      const cell = weaponSlot(grid, w, { plus: n - 1, chosen: w.id === ui.sel, equipped: w.id === view.mainWeapon });
      if (w.id === ui.sel) chosen = cell;
      cell.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'mouse' && w.id !== ui.sel) tip.show(w, cell, cell.offsetTop + 18 > grid.clientHeight / 2);
      });
      cell.addEventListener('pointerleave', (e) => {
        if (e.pointerType === 'mouse') tip.hide();
      });
      cell.addEventListener('click', () => {
        tip.hide();
        chosen?.classList.remove('chosen');
        if (ui.sel === w.id) {
          ui.sel = null;
          chosen = null;
        } else {
          ui.sel = w.id;
          chosen = cell;
          cell.classList.add('chosen');
        }
        showSel(ui.sel !== null);
      });
    }
    count.textContent = `${have} / ${list.length}`;
    showSel();
  };
  paintGrid();
}
