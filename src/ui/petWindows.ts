import { goldText, type Gold } from '../game/gold';
import { cleanPetName, josa, PET_FRAMES, PET_KINDS, PET_NAME_MAX, PET_NAMES, PET_PICK_ORDER, petNameOf, type PetFrame, type PetKind } from '../game/pets';
import { element } from './dom';
import { Modal } from './modal';
import { setPetArtVars } from './petPanel';

/** 서버가 이름을 받지 않았을 때 */
export const BAD_NAME = '쓸 수 없는 이름입니다';

/** '이름' 칸(고르는 확인 창·입양 확인 창·이름 바꾸기 창). 쓸 수 없는 이름이면 onValid(false) */
function nameField(parent: HTMLElement, initial: string, onValid: (ok: boolean) => void, onEnter: () => void) {
  const row = element('pet-name-field', parent, 'label');
  element('', row, 'span').textContent = '이름';
  const input = element('rename-input', row, 'input') as HTMLInputElement;
  input.type = 'text';
  input.autocomplete = 'off';
  input.maxLength = PET_NAME_MAX;
  input.value = initial;
  input.addEventListener('input', () => onValid(cleanPetName(input.value) !== null));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onEnter();
  });
  return input;
}

/**
 * 펫 창들(2026-11-28 코드 묶음 7, 디자인 세션 12 시안 pets.md 4절·9-4·9-5): 처음 고르는 창(고를 때까지 닫히지 않음, 사용자 결정 ⑤)과 주의 창(⑥),
 * 입양 창(처음 창 + [닫기])과 입양 확인 창, 작별 창. 글은 시안과 기획 세션 4의 것만 쓴다(하는 법 안내 없음).
 */
export function petArt(parent: HTMLElement, kind: PetKind, frame: PetFrame, big = false) {
  const art = element(big ? 'pet-art big' : 'pet-art', parent, 'span');
  art.style.setProperty('--c', String(PET_FRAMES.indexOf(frame)));
  art.style.setProperty('--r', String(PET_KINDS.indexOf(kind)));
  return art;
}

export interface PickOptions {
  /** 입양(잃은 뒤): 닫기 단추가 있고 확인 창에 값과 보유 골드 */
  adopt: { price: Gold; gold: () => Gold } | null;
  /** 확인을 누르면 부른다(이름은 다듬은 것). 거절 글(창 안에 띄움)이나 null(성공, 두 창을 닫음) */
  choose: (kind: PetKind, name: string) => Promise<string | null>;
}

export class PetPickWindow {
  private readonly modal: Modal;
  private readonly cards = new Map<PetKind, HTMLElement>();
  private confirm: Modal | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly options: PickOptions,
  ) {
    setPetArtVars();
    this.modal = new Modal(root, 'pet-pick', '펫');
    // 처음 고르는 창은 고를 때까지 닫히지 않는다(Esc도 안 됨).
    this.modal.locked = !options.adopt;
    const grid = element('pet-grid', this.modal.box);
    for (const kind of PET_PICK_ORDER) {
      const card = element('pet-card', grid, 'button') as HTMLButtonElement;
      card.type = 'button';
      petArt(card, kind, 'sit');
      element('pet-name', card, 'span').textContent = PET_NAMES[kind];
      card.addEventListener('click', () => this.ask(kind));
      this.cards.set(kind, card);
    }
    if (options.adopt) this.modal.button('닫기', () => undefined);
  }

  get isOpen() {
    return this.modal.isOpen;
  }

  private ask(kind: PetKind) {
    if (this.confirm?.isOpen) return;
    for (const [k, card] of this.cards) card.classList.toggle('chosen', k === kind);
    const name = PET_NAMES[kind];
    const confirm = new Modal(this.root, 'pet-confirm', name);
    this.confirm = confirm;
    (confirm.box.parentElement as HTMLElement).style.background = 'rgb(0 0 0 / 20%)';
    petArt(confirm.box, kind, 'stand', true);
    const warn = element('pet-warn', confirm.box);
    const adopt = this.options.adopt;
    if (adopt) {
      element('', warn, 'p').textContent = `${goldText(adopt.price)}를 내고 ${name}${josa(name, '를', '을')} 입양합니다.`;
      element('', warn, 'p').textContent = '한 번 고른 펫은 바꿀 수 없습니다.';
      const gold = adopt.gold();
      const short = gold < adopt.price;
      element(short ? 'pet-have short' : 'pet-have', confirm.box).textContent = `보유 ${goldText(gold)}`;
    } else {
      element('', warn, 'p').textContent = '한 번 고른 펫은 바꿀 수 없습니다.';
      element('', warn, 'p').textContent = '이 펫으로 할까요?';
    }
    const short = !!adopt && adopt.gold() < adopt.price;
    // 이름(처음 값은 종류 이름). 쓸 수 없는 이름이면 확인 단추가 흐려진다.
    const input = nameField(
      confirm.box,
      name,
      (valid) => (ok.disabled = short || !valid),
      () => ok.click(),
    );
    const error = element('modal-error', confirm.box);
    error.hidden = true;
    const ok = confirm.button(
      adopt ? '입양한다' : '확인',
      async () => {
        const petName = cleanPetName(input.value);
        if (!petName) return false;
        const fail = await this.options.choose(kind, petName);
        if (fail) {
          error.textContent = fail;
          error.hidden = false;
          return false;
        }
        this.close();
        return undefined;
      },
      true,
    );
    if (short) ok.disabled = true;
    confirm.button(adopt ? '그만둔다' : '취소', () => undefined);
    confirm.whenClosed(() => {
      if (this.confirm === confirm) this.confirm = null;
      for (const card of this.cards.values()) card.classList.remove('chosen');
    });
  }

  /** 두 창을 닫는다(골랐거나, 다른 기기에서 이미 정했을 때). */
  close() {
    this.confirm?.close();
    this.modal.locked = false;
    this.modal.close();
  }
}

/** 작별 창(기획 6.3): 제목 '펫', 그 펫의 뒷모습, "보리가 떠났습니다."(이름, 없으면 종류 이름), [확인]. 한 번만 뜬다(부르는 쪽이 정함). */
export function openFarewell(root: HTMLElement, kind: PetKind | null, petName: string | null) {
  setPetArtVars();
  const modal = new Modal(root, 'pet-farewell', '펫');
  if (kind) {
    petArt(modal.box, kind, 'standBack', true);
    const name = petNameOf(kind, petName);
    element('line', modal.box).textContent = `${name}${josa(name, '가', '이')} 떠났습니다.`;
  }
  modal.button('확인', () => undefined, true);
  return modal;
}

/** 이름 바꾸기 창(상태 창 이름을 누름, 값 없음). rename은 바꿨으면 null, 아니면 거절 글 */
export function openPetRename(root: HTMLElement, current: string, rename: (name: string) => Promise<string | null>) {
  const modal = new Modal(root, 'pet-rename', '펫 이름');
  const input = nameField(
    modal.box,
    current,
    (valid) => (ok.disabled = !valid),
    () => ok.click(),
  );
  const error = element('modal-error', modal.box);
  error.hidden = true;
  modal.button('취소', () => undefined);
  const ok = modal.button(
    '바꾸기',
    async () => {
      const name = cleanPetName(input.value);
      if (!name) return false;
      if (name === current) return undefined;
      const fail = await rename(name);
      if (fail) {
        error.textContent = fail;
        error.hidden = false;
        return false;
      }
      return undefined;
    },
    true,
  );
  window.setTimeout(() => {
    input.focus();
    input.select();
  }, 0);
  return modal;
}
