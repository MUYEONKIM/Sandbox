import type { Economy } from '../game/economy';
import { formatGrow, GRADE_NAME, isPlot, landPrice, type CropId, type Plot } from '../game/farm';
import { paintItem, type SeedId } from '../items';
import { element } from './dom';
import { Modal } from './modal';
import { PurchaseWindow } from './purchase';
import { goldText } from '../game/gold';

interface CoopActions {
  onBuySeeds(crop: CropId, amount: number): Promise<void>;
  onSellCrops(): Promise<void>;
  /** 농장의 모든 땅. 실패하면 null */
  loadFarm(): Promise<Plot[] | null>;
  buyPlots(cells: [number, number][]): Promise<string | null>;
  sellPlots(cells: [number, number][]): Promise<string | null>;
}

const MAP_CELLS = 46;
const CELL_PX = 9;
const MAX_PICK = 100;
/** 씨앗을 한 번에 살 수 있는 수(서버 buy_seeds와 같음) */
const SEED_MAX = 1000;
const COLORS = { road: '#9c7b55', empty: '#7fae4a', mine: '#e8b73a', other: '#7a4a2c', picked: '#fff3a0', grid: 'rgba(40, 24, 10, 0.25)' };

/**
 * 농협 창(2026-11-15 사용자 요청 "시작마을에 농협, 땅과 씨앗을 산다", 기획 docs/balance/farm.md).
 * 내 땅 수와 땅 사고팔기 지도, 씨앗 사기(1, 10, 100개), 거둔 작물 전부 팔기. 값은 서버가 정한다.
 */
export class CoopWindow extends PurchaseWindow {
  private readonly landLine: HTMLElement;
  private readonly cropList: HTMLElement;
  private readonly sellButton: HTMLButtonElement;
  private myPlots = 0;

  constructor(
    parent: HTMLElement,
    economy: Economy,
    private readonly myId: string,
    private readonly actions: CoopActions,
  ) {
    super(parent, economy, '농협', '땅과 씨앗을 팔고 거둔 작물을 사 드립니다. 농장은 시작마을 오른쪽 포탈입니다.');
    this.hostRoot = parent;

    element('office-section', this.root).textContent = '내 땅';
    const land = element('shop-stat', this.root);
    const landText = element('shop-stat-text', land);
    element('shop-stat-name', landText).textContent = '땅 사고팔기';
    this.landLine = element('shop-stat-blurb', landText);
    const mapButton = element('shop-buy', land, 'button') as HTMLButtonElement;
    mapButton.type = 'button';
    mapButton.textContent = '지도 열기';
    mapButton.addEventListener('click', () => void this.openLandMap());

    element('office-section', this.root).textContent = '씨앗';
    const seedList = element('shop-stats', this.root);
    if (!economy.crops.length) element('office-empty', seedList).textContent = '농협 정보를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.';
    for (const crop of economy.crops) {
      const row = element('shop-stat', seedList);
      const icon = element('shop-tool-icon', row, 'img') as HTMLImageElement;
      icon.src = paintItem(`seed_${crop.id}` as SeedId).toDataURL();
      icon.alt = '';
      const text = element('shop-stat-text', row);
      element('shop-stat-name', text).textContent = `${crop.name} 씨앗`;
      const note = element('shop-stat-blurb', text);
      // 버튼과 직접 입력 칸은 이름 아래 한 줄에 둔다(이름 칸이 좁아지지 않게).
      const buy = element('coop-actions', row);
      const buttons = [1, 10, 100].map((amount) => ({ amount, button: this.buyButton(buy, () => actions.onBuySeeds(crop.id, amount)) }));
      // 직접 입력(2026-11-15 사용자 요청, 증권거래소 수량 칸처럼): 숫자만 받고 Enter로 산다. 한 번에 1~1,000개(서버 buy_seeds).
      const field = element('casino-field exchange-field coop-field', buy, 'label');
      element('casino-field-label', field, 'span').textContent = '직접 입력';
      const input = element('casino-input', field, 'input') as HTMLInputElement;
      input.type = 'text';
      input.inputMode = 'numeric';
      input.autocomplete = 'off';
      input.maxLength = 4;
      input.placeholder = '개수';
      element('casino-unit', field, 'span').textContent = '개';
      input.addEventListener('focus', () => input.select());
      input.addEventListener('input', () => {
        const digits = input.value.replace(/\D/g, '');
        if (digits !== input.value) input.value = digits;
      });
      input.addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter' || this.busy) return;
        e.preventDefault();
        const amount = Math.min(Number(input.value) || 0, SEED_MAX);
        if (amount < 1) return;
        this.busy = true;
        this.render();
        try {
          await actions.onBuySeeds(crop.id, amount);
        } finally {
          this.busy = false;
          this.render();
        }
      });
      this.refreshers.push(() => {
        note.textContent = `${formatGrow(crop.growSeconds)}에 다 자람 · 작물 1개 ${goldText(crop.price)} · 가진 씨앗 ${economy.seedCount(crop.id).toLocaleString()}개`;
        for (const { amount, button } of buttons) {
          button.textContent = `${amount}개 ${goldText(crop.price * amount)}`;
          button.disabled = this.busy || economy.gold < crop.price * amount;
        }
      });
    }

    element('office-section', this.root).textContent = '거둔 작물';
    this.sellButton = element('office-sell', this.root, 'button') as HTMLButtonElement;
    this.sellButton.type = 'button';
    this.sellButton.addEventListener('click', async () => {
      this.sellButton.disabled = true;
      await actions.onSellCrops();
    });
    this.cropList = element('office-stash', this.root);
    this.refreshers.push(() => this.showCrops());
    this.refreshers.push(() => this.showLand());

    this.finish();
  }

  private readonly hostRoot: HTMLElement;

  override open() {
    super.open();
    void this.refreshLand();
  }

  private async refreshLand() {
    const plots = await this.actions.loadFarm();
    if (!plots) return;
    this.myPlots = plots.filter((plot) => plot.owner === this.myId).length;
    this.showLand();
  }

  private showLand() {
    this.landLine.textContent = `내 땅 ${this.myPlots.toLocaleString()}칸 · 다음 칸 ${goldText(landPrice(this.myPlots + 1))} · 되팔면 마지막 칸 값의 절반`;
  }

  private showCrops() {
    this.cropList.replaceChildren();
    const rows = this.economy.cropStock;
    if (!rows.length) element('office-empty', this.cropList).textContent = '거둔 작물이 없습니다. 농장의 내 땅에 씨앗을 심어 거둡니다.';
    let total = 0;
    for (const { crop, grade, count, value } of rows) {
      const row = element('office-stash-row', this.cropList);
      element('office-stash-name', row, 'span').textContent = `${GRADE_NAME[grade]}${crop.name} x${count}`;
      element('office-stash-price', row, 'span').textContent = goldText(value);
      total += value;
    }
    this.sellButton.disabled = total === 0;
    this.sellButton.textContent = total ? `작물 전부 팔기 (+${goldText(total)})` : '팔 작물이 없습니다';
  }

  /** 농장을 위에서 본 지도. 빈 땅을 골라 사거나 내 땅을 골라 판다. 끌면 네모 안의 칸이 한꺼번에 골라진다. */
  private async openLandMap() {
    const plots = await this.actions.loadFarm();
    if (!plots) return;
    const modal = new Modal(this.hostRoot, 'land-map', '농장 땅');
    const owner = new Map<string, Plot>();
    const k = (x: number, y: number) => `${x},${y}`;
    const load = (list: Plot[]) => {
      owner.clear();
      for (const plot of list) owner.set(k(plot.x, plot.y), plot);
      this.myPlots = list.filter((plot) => plot.owner === this.myId).length;
    };
    load(plots);

    element('modal-note', modal.box).textContent = '빈 땅(초록)을 고르면 사고, 내 땅(노랑)을 고르면 팝니다. 누르면 고르고 다시 누르면 취소, 끌면 네모 안을 한꺼번에 고릅니다.';
    const canvas = element('land-canvas', modal.box, 'canvas') as HTMLCanvasElement;
    canvas.width = MAP_CELLS * CELL_PX;
    canvas.height = MAP_CELLS * CELL_PX;
    const tip = element('land-tip', modal.box);
    const summary = element('land-summary', modal.box);
    const picked = new Set<string>();
    let mode: 'buy' | 'sell' | null = null;

    const kindOf = (x: number, y: number) => {
      if (!isPlot(x, y)) return 'road';
      const plot = owner.get(k(x, y));
      if (!plot) return 'empty';
      return plot.owner === this.myId ? 'mine' : 'other';
    };
    const draw = () => {
      const ctx = canvas.getContext('2d')!;
      for (let y = 0; y < MAP_CELLS; y++) {
        for (let x = 0; x < MAP_CELLS; x++) {
          ctx.fillStyle = picked.has(k(x, y)) ? COLORS.picked : COLORS[kindOf(x, y)];
          ctx.fillRect(x * CELL_PX, y * CELL_PX, CELL_PX, CELL_PX);
          ctx.strokeStyle = COLORS.grid;
          ctx.strokeRect(x * CELL_PX + 0.5, y * CELL_PX + 0.5, CELL_PX - 1, CELL_PX - 1);
        }
      }
      const cells = [...picked].map((c) => c.split(',').map(Number) as [number, number]);
      if (mode === 'sell') {
        let refund = 0;
        for (let i = 0; i < cells.length; i++) refund += Math.floor(landPrice(this.myPlots - i) / 2);
        summary.textContent = `고른 내 땅 ${cells.length}칸 · 받는 돈 약 ${goldText(refund)} · 내 땅 ${this.myPlots}칸`;
        action.textContent = '팔기';
      } else {
        let cost = 0;
        for (let i = 1; i <= cells.length; i++) cost += landPrice(this.myPlots + i);
        summary.textContent = `고른 칸 ${cells.length}개 · 합계 ${goldText(cost)} · 내 땅 ${this.myPlots}칸 · 보유 ${goldText(this.economy.gold)}`;
        action.textContent = '사기';
      }
      action.disabled = cells.length === 0;
    };

    const cellAt = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor(((e.clientX - rect.left) / rect.width) * MAP_CELLS);
      const y = Math.floor(((e.clientY - rect.top) / rect.height) * MAP_CELLS);
      return x >= 0 && y >= 0 && x < MAP_CELLS && y < MAP_CELLS ? { x, y } : null;
    };
    /** 고를 수 있는 칸: 아무것도 안 골랐으면 빈 땅이나 내 땅, 고르기 시작했으면 같은 종류만 */
    const pickable = (x: number, y: number) => {
      const kind = kindOf(x, y);
      if (mode === 'buy') return kind === 'empty';
      if (mode === 'sell') return kind === 'mine' && !owner.get(k(x, y))?.crop;
      return kind === 'empty' || (kind === 'mine' && !owner.get(k(x, y))?.crop);
    };
    const toggle = (x: number, y: number, on?: boolean) => {
      if (!pickable(x, y)) return;
      const id = k(x, y);
      const next = on ?? !picked.has(id);
      if (next && picked.size >= MAX_PICK) return;
      if (next) {
        mode ??= kindOf(x, y) === 'mine' ? 'sell' : 'buy';
        picked.add(id);
      } else picked.delete(id);
      if (!picked.size) mode = null;
    };

    let dragFrom: { x: number; y: number } | null = null;
    canvas.addEventListener('pointerdown', (e) => {
      dragFrom = cellAt(e);
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointerup', (e) => {
      const to = cellAt(e);
      if (dragFrom && to) {
        if (dragFrom.x === to.x && dragFrom.y === to.y) toggle(to.x, to.y);
        else {
          for (let y = Math.min(dragFrom.y, to.y); y <= Math.max(dragFrom.y, to.y); y++) {
            for (let x = Math.min(dragFrom.x, to.x); x <= Math.max(dragFrom.x, to.x); x++) toggle(x, y, true);
          }
        }
        draw();
      }
      dragFrom = null;
    });
    canvas.addEventListener('pointermove', (e) => {
      const at = cellAt(e);
      const plot = at && owner.get(k(at.x, at.y));
      if (!at || !isPlot(at.x, at.y)) tip.textContent = at ? '길' : '';
      else if (!plot) tip.textContent = `빈 땅 (${at.x}, ${at.y})`;
      else tip.textContent = `${plot.owner === this.myId ? '내 땅' : `${plot.nickname}의 땅`} (${at.x}, ${at.y})${plot.crop ? ' · 작물이 자라는 중' : ''}`;
    });

    const action = modal.button(
      '사기',
      async () => {
        const cells = [...picked].map((c) => c.split(',').map(Number) as [number, number]);
        const fail = mode === 'sell' ? await this.actions.sellPlots(cells) : await this.actions.buyPlots(cells);
        const fresh = await this.actions.loadFarm();
        if (fresh) load(fresh);
        picked.clear();
        mode = null;
        if (fail) tip.textContent = fail;
        draw();
        this.render();
        return false;
      },
      true,
    );
    modal.button('닫기', () => undefined);
    modal.whenClosed(() => this.render());
    draw();
  }
}
