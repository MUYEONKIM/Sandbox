import { paintMemoPadIcon, paintNoteIcon } from '../art/drops';
import type { DropFail, HeldMemo } from '../net/session';
import { element } from './dom';
import { Modal } from './modal';

/** 메모 한 장에 쓸 수 있는 글자 수. SQL memos.body와 같다. */
export const MEMO_MAX = 200;

export function dropFailText(reason: DropFail) {
  if (reason === 'wrong-map') return '맵을 옮기는 중입니다. 잠시 뒤 다시 해 보세요.';
  if (reason === 'too-many') return '땅에 둔 것이 벌써 20개입니다. 몇 개는 주워 오세요.';
  if (reason === 'gold') return '골드가 모자랍니다.';
  return '놓지 못했습니다. 잠시 뒤 다시 해 보세요.';
}

/**
 * 메모와 골드를 땅에 놓고 줍는 화면(2026-11-13 사용자 요청): 메모 쓰기와 읽기 창, 골드 버리기 창,
 * 발밑에 주울 것이 있을 때 뜨는 "F키로 줍기" 안내, 골드에 마우스를 올리면 뜨는 액수, 인벤토리의 주운 메모 목록.
 * 땅의 그림과 서버 호출은 GameScene이 하고, 여기는 화면만 맡는다.
 */
export class GroundUi {
  readonly memoPadIcon = paintMemoPadIcon().toDataURL();
  private readonly noteIcon = paintNoteIcon().toDataURL();
  private memos: HeldMemo[] = [];
  private readonly listeners: (() => void)[] = [];
  private readonly hint: HTMLElement;
  private readonly hintText: HTMLElement;
  private hintShown: string | null = null;
  private readonly tip: HTMLElement;
  /** 들고 있는 메모를 지금 선 자리에 놓는다. 실패하면 까닭 문구. GameScene이 정한다. */
  placeHeld: ((memo: HeldMemo) => Promise<string | null>) | null = null;
  /** 안내를 누르면 줍는다(휴대폰에는 F 키가 없다). GameScene이 정한다. */
  onHintClick: (() => void) | null = null;

  constructor(private readonly root: HTMLElement) {
    this.hint = element('pickup-hint', root, 'button');
    (this.hint as HTMLButtonElement).type = 'button';
    element('pickup-key', this.hint, 'span').textContent = 'F';
    this.hintText = element('pickup-text', this.hint, 'span');
    this.hint.hidden = true;
    this.hint.addEventListener('click', () => this.onHintClick?.());
    this.tip = element('ground-tip', root);
    this.tip.hidden = true;
  }

  get held(): readonly HeldMemo[] {
    return this.memos;
  }

  onChange(fn: () => void) {
    this.listeners.push(fn);
  }

  private changed() {
    for (const fn of this.listeners) fn();
  }

  setHeld(memos: HeldMemo[]) {
    this.memos = memos;
    this.changed();
  }

  addHeld(memo: HeldMemo) {
    this.memos = [memo, ...this.memos.filter((m) => m.id !== memo.id)];
    this.changed();
  }

  removeHeld(id: number) {
    this.memos = this.memos.filter((m) => m.id !== id);
    this.changed();
  }

  /** 메모 쓰기 창. place가 실패 문구를 돌려주면 창을 닫지 않고 그 문구를 보인다. */
  openWriter(place: (body: string) => Promise<string | null>) {
    const modal = new Modal(this.root, 'memo-writer', '메모 쓰기');
    element('modal-note', modal.box).textContent = '지금 선 자리에 놓습니다. 주운 사람이 읽고 가져갑니다.';
    const area = element('memo-input', modal.box, 'textarea') as HTMLTextAreaElement;
    area.maxLength = MEMO_MAX;
    area.rows = 5;
    area.placeholder = '남길 말을 쓰세요';
    const foot = element('memo-foot', modal.box);
    const error = element('modal-error', foot);
    const count = element('memo-count', foot);
    const update = () => (count.textContent = `${area.value.length} / ${MEMO_MAX}`);
    area.addEventListener('input', update);
    update();
    modal.button('취소', () => undefined);
    modal.button(
      '여기에 놓기',
      async () => {
        const body = area.value.trim();
        if (!body) {
          error.textContent = '빈 쪽지는 놓을 수 없습니다.';
          return false;
        }
        const fail = await place(body);
        if (fail) error.textContent = fail;
        return fail ? false : undefined;
      },
      true,
    );
    window.setTimeout(() => area.focus(), 0);
  }

  /** 메모를 읽는 창. 막 주웠으면 picked, 인벤토리에서 열었으면 '여기에 놓기' 버튼을 단다. */
  showMemo(memo: HeldMemo, picked: boolean) {
    const modal = new Modal(this.root, 'memo-reader', `${memo.author}의 메모`);
    element('memo-body', modal.box).textContent = memo.body;
    if (picked) element('modal-note', modal.box).textContent = '주운 메모는 인벤토리 "메모" 탭에 들어갔습니다.';
    const error = element('modal-error', modal.box);
    const place = this.placeHeld;
    if (!picked && place) {
      modal.button('여기에 놓기', async () => {
        const fail = await place(memo);
        if (fail) error.textContent = fail;
        return fail ? false : undefined;
      });
    }
    modal.button('확인', () => undefined, true);
  }

  /** 골드 버리기 창. 얼마를 버릴지 적는다. */
  openGoldDrop(gold: number, drop: (amount: number) => Promise<string | null>) {
    const modal = new Modal(this.root, 'gold-drop', '골드 버리기');
    element('modal-note', modal.box).textContent = `가진 골드 ${gold.toLocaleString()}G. 지금 선 자리에 떨어뜨리고, 먼저 줍는 사람이 임자입니다.`;
    const input = element('gold-drop-input', modal.box, 'input') as HTMLInputElement;
    input.type = 'number';
    input.min = '1';
    input.max = String(gold);
    input.step = '1';
    input.inputMode = 'numeric';
    input.placeholder = '버릴 골드';
    const error = element('modal-error', modal.box);
    modal.button('취소', () => undefined);
    const ok = modal.button(
      '버리기',
      async () => {
        const amount = Number(input.value);
        if (!Number.isSafeInteger(amount) || amount < 1) {
          error.textContent = '1G 이상 정수로 적어 주세요.';
          return false;
        }
        if (amount > gold) {
          error.textContent = '가진 것보다 많이 버릴 수는 없습니다.';
          return false;
        }
        const fail = await drop(amount);
        if (fail) error.textContent = fail;
        return fail ? false : undefined;
      },
      true,
    );
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') ok.click();
    });
    window.setTimeout(() => input.focus(), 0);
  }

  /** 발밑에 주울 것이 있으면 "F키로 줍기" 안내를 띄운다. what은 '메모', '120G' 같은 말이고, null이면 숨긴다. */
  setHint(what: string | null) {
    if (what === this.hintShown) return;
    this.hintShown = what;
    this.hint.hidden = what === null;
    if (what !== null) this.hintText.textContent = `키로 줍기 · ${what}`;
  }

  /** 골드에 마우스를 올리면 커서 옆에 액수를 띄운다. (x, y)는 화면 좌표다. */
  setTip(text: string | null, x = 0, y = 0) {
    this.tip.hidden = text === null;
    if (text === null) return;
    if (this.tip.textContent !== text) this.tip.textContent = text;
    this.tip.style.left = `${x}px`;
    this.tip.style.top = `${y}px`;
  }

  /** 인벤토리 '메모' 탭: 주운 메모 목록. 누르면 읽는 창이 열린다. */
  renderBag(pane: HTMLElement) {
    pane.replaceChildren();
    if (!this.memos.length) {
      element('memo-empty', pane).textContent = '주운 메모가 없습니다. 땅에서 반짝이는 쪽지를 찾아 F로 주워 보세요.';
      return;
    }
    for (const memo of this.memos) {
      const row = element('memo-row', pane, 'button') as HTMLButtonElement;
      row.type = 'button';
      const icon = element('memo-row-icon', row, 'img') as HTMLImageElement;
      icon.src = this.noteIcon;
      icon.alt = '';
      element('memo-row-author', row, 'span').textContent = memo.author;
      element('memo-row-body', row, 'span').textContent = memo.body;
      row.addEventListener('click', () => this.showMemo(memo, false));
    }
  }
}
