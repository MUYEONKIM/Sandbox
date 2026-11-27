import type { Economy } from '../game/economy';
import { goldText } from '../game/gold';
import type { BoxFail, BoxItem, GameSession } from '../net/session';
import { element } from './dom';
import type { GroundUi } from './ground';
import { Modal } from './modal';

/** 상자 하나에 들어가는 수. SQL box_put의 12와 같다. */
const BOX_SIZE = 12;
/** 한 번에 넣는 골드 한도. 땅에 버리는 한도(ui/ground.ts DROP_MAX)와 같다. */
const PUT_MAX = 2_147_483_647;

function failText(reason: BoxFail) {
  if (reason === 'full') return '상자가 가득 찼습니다.';
  if (reason === 'gold') return '골드가 모자랍니다.';
  if (reason === 'gone') return '상자가 없어졌습니다.';
  return '넣지 못했습니다. 잠시 뒤 다시 해 보세요.';
}

/**
 * 상자 가구 창(2026-11-27, 공유 노트 room-rules.md 4.3): 메모와 골드를 넣고 누구나 꺼낸다. 열 때 그 상자 안을 읽고,
 * 넣고 꺼낼 때마다 다시 읽는다(실시간 구독 없음). 남이 먼저 꺼냈으면 "없음"으로 받고 다시 읽는다.
 */
export class BoxUi {
  constructor(
    private readonly root: HTMLElement,
    private readonly session: GameSession,
    private readonly economy: Economy,
    private readonly groundUi: GroundUi,
  ) {}

  open(name: string, x: number, y: number, z: number) {
    const modal = new Modal(this.root, 'box-window', name);
    const count = element('box-count', modal.box);
    const list = element('box-list', modal.box);
    const error = element('modal-error', modal.box);

    const put = element('box-put', modal.box);
    const gold = element('gold-drop-input', put, 'input') as HTMLInputElement;
    gold.type = 'number';
    gold.min = '1';
    gold.step = '1';
    gold.inputMode = 'numeric';
    gold.placeholder = '골드';
    const putGold = element('modal-button', put, 'button') as HTMLButtonElement;
    putGold.type = 'button';
    putGold.textContent = '골드 넣기';
    const memoRow = element('box-put', modal.box);
    const select = element('box-memo-select', memoRow, 'select') as HTMLSelectElement;
    const putMemo = element('modal-button', memoRow, 'button') as HTMLButtonElement;
    putMemo.type = 'button';
    putMemo.textContent = '메모 넣기';

    let busy = false;
    const fillMemos = () => {
      select.replaceChildren();
      for (const memo of this.groundUi.held) {
        const option = element('', select, 'option') as HTMLOptionElement;
        option.value = String(memo.id);
        option.textContent = `${memo.author}: ${memo.body.slice(0, 24)}`;
      }
      memoRow.hidden = this.groundUi.held.length === 0;
    };
    const render = (items: BoxItem[]) => {
      count.textContent = `${items.length} / ${BOX_SIZE}`;
      list.replaceChildren();
      for (const item of items) {
        const row = element('box-row', list);
        if (item.amount !== null) element('box-row-gold', row, 'span').textContent = goldText(BigInt(item.amount));
        else if (item.memo) {
          element('memo-row-author', row, 'span').textContent = item.memo.author;
          element('memo-row-body', row, 'span').textContent = item.memo.body;
        }
        const take = element('modal-button', row, 'button') as HTMLButtonElement;
        take.type = 'button';
        take.textContent = '꺼내기';
        take.addEventListener('click', () => void run(() => this.take(item, error)));
      }
    };
    const reload = async () => {
      const items = await this.session.boxList(x, y, z);
      if (!modal.isOpen) return;
      if (!items) {
        error.textContent = '상자를 읽지 못했습니다.';
        return;
      }
      render(items);
      fillMemos();
    };
    const run = async (action: () => Promise<void>) => {
      if (busy) return;
      busy = true;
      error.textContent = '';
      await action();
      await reload();
      busy = false;
    };

    putGold.addEventListener('click', () =>
      void run(async () => {
        const amount = Number(gold.value);
        if (!Number.isSafeInteger(amount) || amount < 1 || amount > PUT_MAX) {
          error.textContent = '1G 이상 정수로 적어 주세요.';
          return;
        }
        if (BigInt(amount) > this.economy.gold) {
          error.textContent = failText('gold');
          return;
        }
        const result = await this.session.boxPut(x, y, z, { amount });
        if (!result.ok) error.textContent = failText(result.reason);
        else {
          this.economy.setGold(result.gold);
          gold.value = '';
        }
      }),
    );
    gold.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') putGold.click();
    });
    putMemo.addEventListener('click', () =>
      void run(async () => {
        const memo = Number(select.value);
        if (!Number.isSafeInteger(memo) || memo < 1) return;
        const result = await this.session.boxPut(x, y, z, { memo });
        if (!result.ok) error.textContent = failText(result.reason);
        else this.groundUi.removeHeld(memo);
      }),
    );
    modal.button('닫기', () => undefined, true);
    render([]);
    fillMemos();
    void reload();
  }

  private async take(item: BoxItem, error: HTMLElement) {
    const result = await this.session.boxTake(item.id);
    if (!result.ok) {
      error.textContent = result.reason === 'gone' ? '없음: 누가 먼저 꺼냈습니다.' : '꺼내지 못했습니다. 잠시 뒤 다시 해 보세요.';
      return;
    }
    if (result.kind === 'gold') this.economy.setGold(result.gold);
    else this.groundUi.addHeld(result.memo);
  }
}
