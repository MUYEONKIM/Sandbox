/**
 * 늘 떠 있는 창 접기(2026-11-16 사용자 "기본으로 화면에 뜨는 여러 팝업창들 최소화 버튼이 있으면 좋겠다",
 * 설계는 디자인 세션 공유 노트 ui-minimize.md). 접는 창은 미니맵, 레벨 TOP 10, 현상범, 채팅이고
 * 조작 안내는 예전 H와 'help-closed'를 그대로 쓴다(hud.ts).
 *
 * 접은 창 이름은 이 브라우저의 localStorage 'ui-folded'에 목록으로 남긴다(계정은 나누지 않음, 에이전트가 정함).
 * 아직 저장한 것이 없고 화면 폭이 620px 이하(휴대폰)이면 레벨 TOP 10과 현상범을 접은 채로 시작한다(사용자가 정함).
 * 저장소를 못 쓰면 모두 펼친 채로 시작한다.
 */

export type FoldId = 'minimap' | 'rank' | 'wanted' | 'chat';

const FOLD_IDS: readonly FoldId[] = ['minimap', 'rank', 'wanted', 'chat'];
const STORAGE_KEY = 'ui-folded';
/** 휴대폰 폭. style.css의 휴대폰 배치(@media (max-width: 620px))와 같다. */
const PHONE_QUERY = '(max-width: 620px)';
const PHONE_DEFAULT: readonly FoldId[] = ['rank', 'wanted'];

let folded: Set<FoldId> | null = null;

function load(): Set<FoldId> {
  if (folded) return folded;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) folded = new Set(matchMedia(PHONE_QUERY).matches ? PHONE_DEFAULT : []);
    else {
      const list: unknown = JSON.parse(raw);
      folded = new Set(Array.isArray(list) ? FOLD_IDS.filter((id) => list.includes(id)) : []);
    }
  } catch {
    folded = new Set();
  }
  return folded;
}

export function isFolded(id: FoldId) {
  return load().has(id);
}

/** 사용자가 버튼을 눌러 바꾼 것만 저장한다. 그 뒤로는 휴대폰 첫 기본값을 쓰지 않는다. */
export function saveFolded(id: FoldId, value: boolean) {
  const set = load();
  if (value) set.add(id);
  else set.delete(id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // 저장하지 못해도 지금 화면에서는 바뀐다.
  }
}

/** 접기·펴기 버튼. 눌러도 초점을 가져가지 않아 Space(점프)·Enter(채팅)가 버튼을 다시 누르지 않는다. */
export function foldButton(parent: HTMLElement, onClick: () => void) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'fold-btn';
  button.tabIndex = -1;
  button.title = '접기';
  button.addEventListener('pointerdown', (e) => e.preventDefault());
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  parent.append(button);
  return button;
}

/** 버튼 모양을 접힘(+)·펼침(−)에 맞춘다. */
export function showFoldButton(button: HTMLElement, isFolded: boolean) {
  button.classList.toggle('folded', isFolded);
  button.title = isFolded ? '펴기' : '접기';
}

/**
 * 제목 줄만 남기고 접히는 상자(미니맵, 레벨 TOP 10, 현상범). 상자 오른쪽 위에 버튼을 달고, 접힌 제목 줄을 눌러도 편다.
 * 접힌 내용은 CSS(.folded)가 display: none으로 숨긴다.
 */
export class FoldBox {
  private readonly button: HTMLButtonElement;
  private readonly listeners: ((folded: boolean) => void)[] = [];
  private value: boolean;

  constructor(
    private readonly id: FoldId,
    private readonly box: HTMLElement,
    title: HTMLElement,
  ) {
    box.classList.add('foldable');
    this.button = foldButton(box, () => this.set(!this.value));
    title.addEventListener('click', () => {
      if (this.value) this.set(false);
    });
    this.value = isFolded(id);
    this.apply();
  }

  get folded() {
    return this.value;
  }

  /** 접거나 편 뒤에 부른다. */
  onChange(fn: (folded: boolean) => void) {
    this.listeners.push(fn);
  }

  private set(value: boolean) {
    if (value === this.value) return;
    this.value = value;
    this.apply();
    saveFolded(this.id, value);
    for (const fn of this.listeners) fn(value);
  }

  private apply() {
    this.box.classList.toggle('folded', this.value);
    showFoldButton(this.button, this.value);
  }
}
