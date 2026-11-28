import type { Economy } from '../game/economy';
import { formatGrow, formatLeft, GRADE_NAME, landPrice, ripeAt, type CropId, type Plot } from '../game/farm';
import type { PlacedBlock } from '../net/session';
import { LandMap } from './landMap';
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
  /** 농장의 블록(땅 지도에 그리고, 블록이 있는 내 땅은 팔 수 없어 거른다). 실패하면 null */
  loadBlocks(): Promise<PlacedBlock[] | null>;
  buyPlots(cells: [number, number][]): Promise<string | null>;
  sellPlots(cells: [number, number][]): Promise<string | null>;
}

/** 씨앗을 한 번에 살 수 있는 수(서버 buy_seeds와 같음) */
const SEED_MAX = 1000;

/**
 * 농협 창(2026-11-15 사용자 요청 "시작마을에 농협, 땅과 씨앗을 산다", 기획 docs/balance/farm.md).
 * 내 땅 수와 땅 사고팔기 지도, 씨앗 사기(1, 10, 100개), 거둔 작물 전부 팔기. 값은 서버가 정한다.
 */
export class CoopWindow extends PurchaseWindow {
  private readonly landLine: HTMLElement;
  /** 내 밭 숫자 한 줄(2026-11-28 농장 UX 5번): 다 자람·자라는 중·빈 땅 칸 수와 다음 다 자라는 때 */
  private readonly fieldLine: HTMLElement;
  private myField: Plot[] = [];
  private readonly cropList: HTMLElement;
  private readonly sellButton: HTMLButtonElement;
  private myPlots = 0;

  constructor(
    parent: HTMLElement,
    economy: Economy,
    private readonly myId: string,
    private readonly actions: CoopActions,
  ) {
    super(parent, economy, '농협', '땅과 씨앗을 팔고 거둔 작물을 사 드립니다.');
    this.hostRoot = parent;

    element('office-section', this.root).textContent = '내 땅';
    const land = element('shop-stat', this.root);
    const landText = element('shop-stat-text', land);
    element('shop-stat-name', landText).textContent = '땅 사고팔기';
    this.landLine = element('shop-stat-blurb', landText);
    this.fieldLine = element('shop-stat-blurb', landText);
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
    this.myField = plots.filter((plot) => plot.owner === this.myId);
    this.myPlots = this.myField.length;
    this.showLand();
  }

  private showLand() {
    this.landLine.textContent = `내 땅 ${this.myPlots.toLocaleString()}칸 · 다음 칸 ${goldText(landPrice(this.myPlots + 1))} · 되팔면 마지막 칸 값의 절반`;
    // 창을 열 때와 땅 지도에서 사고판 뒤 읽은 땅으로 센다(열려 있는 동안 시간이 흘러도 다시 읽지 않는다).
    const now = Date.now();
    let ripe = 0;
    let growing = 0;
    let next = Infinity;
    for (const plot of this.myField) {
      const crop = plot.crop && this.economy.cropInfo(plot.crop);
      if (!crop) continue;
      const at = ripeAt(plot, crop);
      if (at <= now) ripe++;
      else {
        growing++;
        next = Math.min(next, at);
      }
    }
    const empty = this.myField.length - ripe - growing;
    const parts = [`다 자람 ${ripe}칸`, `자라는 중 ${growing}칸`, `빈 땅 ${empty}칸`];
    if (Number.isFinite(next)) parts.push(`다음 다 자람 ${formatLeft(next - now)}`);
    this.fieldLine.textContent = parts.join(' · ');
    this.fieldLine.hidden = this.myField.length === 0;
  }

  private showCrops() {
    this.cropList.replaceChildren();
    const rows = this.economy.cropStock;
    if (!rows.length) element('office-empty', this.cropList).textContent = '거둔 작물이 없습니다.';
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

  /**
   * 땅 사고팔기 지도(2026-11-16부터 게임과 같은 마름모 농장, src/ui/landMap.ts). 빈 땅을 골라 사거나 내 땅을 골라 판다.
   * 누르면 한 칸, 끌면 두 칸을 모서리로 하는 격자 네모를 고른다. 작물이나 블록이 있는 내 땅, 남의 땅, 길은 건너뛴다.
   */
  private async openLandMap() {
    const [plots, blocks] = await Promise.all([this.actions.loadFarm(), this.actions.loadBlocks()]);
    if (!plots || !blocks) return;
    const modal = new Modal(this.hostRoot, 'land-map', '농장 땅');
    const summary = element('land-summary', modal.box);
    const map = new LandMap(modal.box, {
      myId: this.myId,
      crop: (id) => this.economy.cropInfo(id),
      onPick: () => show(),
    });
    // 개발 중 브라우저 콘솔에서 지도를 재 보는 통로
    if (import.meta.env.DEV) Object.assign(window, { landMap: map });
    // 지도 아래 줄이 합계 줄 위에 오도록 옮긴다.
    modal.box.append(summary);
    const load = (fresh: Plot[], freshBlocks: PlacedBlock[]) => {
      map.setData({ plots: fresh, blocks: freshBlocks });
      this.myField = fresh.filter((plot) => plot.owner === this.myId);
      this.myPlots = map.mine;
    };
    load(plots, blocks);

    const show = () => {
      const cells = map.cells;
      if (map.mode === 'sell') {
        let refund = 0;
        for (let i = 0; i < cells.length; i++) refund += Math.floor(landPrice(this.myPlots - i) / 2);
        summary.textContent = `선택한 내 땅 ${cells.length}칸 · 받는 돈 약 ${goldText(refund)} · 내 땅 ${this.myPlots}칸`;
        action.textContent = '팔기';
      } else {
        let cost = 0;
        for (let i = 1; i <= cells.length; i++) cost += landPrice(this.myPlots + i);
        summary.textContent = `선택한 칸 ${cells.length}개 · 합계 ${goldText(cost)} · 내 땅 ${this.myPlots}칸 · 보유 ${goldText(this.economy.gold)}`;
        action.textContent = '사기';
      }
      action.disabled = cells.length === 0;
      clear.disabled = cells.length === 0;
    };

    const clear = modal.button('모두 취소', () => {
      map.clearPicks();
      return false;
    });
    const action = modal.button(
      '사기',
      async () => {
        const cells = map.cells;
        const fail = map.mode === 'sell' ? await this.actions.sellPlots(cells) : await this.actions.buyPlots(cells);
        const [fresh, freshBlocks] = await Promise.all([this.actions.loadFarm(), this.actions.loadBlocks()]);
        if (fresh && freshBlocks) load(fresh, freshBlocks);
        map.clearPicks();
        if (fail) map.tip.textContent = fail;
        this.render();
        return false;
      },
      true,
    );
    modal.button('닫기', () => undefined);
    modal.whenClosed(() => {
      map.destroy();
      this.render();
    });
    show();
    // 창이 화면에 붙어 크기가 정해진 뒤 전체 배율로 맞춘다.
    requestAnimationFrame(() => map.fit());
  }
}
