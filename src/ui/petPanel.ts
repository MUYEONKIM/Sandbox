import './pet.css';
import { spriteUrl } from '../art/sprites';
import type { Grade } from '../game/farm';
import { formatNumber } from '../game/level';
import { CARE_LINES, CHANCE_LINE, careLine, isPraiseText, JOY_LINE, REARM_LINE, replyTo, talkLine, ZERO_LINES, type TalkContext } from '../game/petLines';
import { PET_KINDS, PET_MOODS, PET_STAGES, petNameOf, type PetFood, type PetKind, type PetMood } from '../game/pets';
import type { PetCare } from '../game/petCare';
import type { PetAct, PetActResult } from '../net/pets';
import { sound } from '../sound/engine';
import { element } from './dom';
import { foldButton, showFoldButton } from './fold';

/**
 * 펫 상태 창(오른쪽 아래, 디자인 세션 12 시안 pets.md 8-5·9-3·9-5, 규칙 pet-care-1127.md 3·4·8·9장).
 * 얼굴·이름(누르면 이름 바꾸기)·친밀도 하트·단계 숫자·기회 발바닥·막대 넷·돌보기 넷·마지막 말·말 칸.
 * 접으면 얼굴·이름·단계와 친밀도·작은 막대 셋(배부름·기운·함께함, 2026-11-28 코드 묶음 7-1). 잃은 뒤에는 빈 방석과 [입양하기].
 * 얼굴은 부드러운 그림(⑦), 처음 모양은 PC 펼침·휴대폰 접음(⑧) — 2026-11-28 사용자 결정.
 * DOM은 값이 바뀔 때만 고친다(put이 앞 값과 견줌). 매 프레임 하는 일은 없다.
 */
export interface PetFoodRow {
  food: PetFood;
  name: string;
  icon: string;
  count: number;
  full: number;
  favorite: boolean;
}

export interface PetPanelHost {
  /** 돌볼 수 있는 때(다른 창이 열렸거나 쓰러졌거나 맵을 옮기는 중이면 false) */
  canCare(): boolean;
  /** 펫이 주인 무릎·침대 위에서 자는 중(쓰다듬기·칭찬·말 걸기만 됨) */
  asleep(): boolean;
  /** 맵 위 펫의 돌보기 동작(hearts: 하트를 띄움) */
  playCare(kind: 'pat' | 'praise' | 'feed' | 'shake' | 'shakeOnly' | 'play', hearts: boolean): void;
  /** 맵 위 펫 머리 위 말풍선(내 화면에만) */
  petSay(text: string): void;
  talkContext(): Pick<TalkContext, 'place' | 'hour'>;
  /** 가진 먹이(1개 이상) */
  foods(kind: PetKind): PetFoodRow[];
  /** 먹이를 먹었다: 가진 수를 서버 값으로 맞춘다. */
  fed(food: PetFood, grade: Grade | null, left: number | null): void;
  /** [입양하기] */
  adopt(): void;
  /** 이름을 눌렀다(이름 바꾸기 창) */
  rename(): void;
  /** 그 종류가 좋아하는 먹이의 보이는 이름(감자, 말 안 듣는 붕어 …) */
  favorites(kind: PetKind): string[];
}

const FOLD_KEY = 'pet-folded';
const PHONE_QUERY = '(max-width: 620px)';
const BIG_MS = 2000;
const LAST_FOOD_KEY = 'pet-last-food';
const ACTS = [
  ['pat', '쓰다듬기'],
  ['praise', '칭찬하기'],
  ['feed', '먹이주기'],
  ['play', '놀아주기'],
] as const;
const BARS = [
  ['fullness', '배부름', '#e08a3c'],
  ['energy', '기운', '#5aa85e'],
  ['company', '함께함', '#9a7ac8'],
  ['happy', '행복', '#e8566e'],
] as const;

let varsSet = false;
/**
 * 그림 주소(배포마다 바뀌는 ?v=)를 :root 변수로 넣는다. 처음 한 번.
 * 주소는 문서 기준 절대 주소로 바꿔 넣는다: CSS 변수 속 상대 url()은 그 변수를 쓰는 CSS 파일 자리(배포 사이트의 /Sandbox/assets/)에서
 * 풀려 그림을 못 찾는다(2026-11-28 실제 사이트에서 고르는 창·접은 칸 그림이 비었던 까닭, 개발 서버는 CSS가 문서 안이라 드러나지 않음).
 */
export function setPetArtVars() {
  if (varsSet) return;
  varsSet = true;
  const style = document.documentElement.style;
  const url = (name: string) => `url("${new URL(spriteUrl(name), document.baseURI).href}")`;
  style.setProperty('--pet-sheet', url('pets/pets'));
  style.setProperty('--pet-faces', url('pets/faces-soft'));
  style.setProperty('--pet-chance', url('pets/pet-chance'));
  style.setProperty('--pet-cushion', url('pets/pet-cushion-soft'));
  style.setProperty('--pet-cushion-icon', url('pets/pet-cushion-32'));
}

/** 얼굴 칸(시트 줄 = 종류, 칸 = 표정) */
export function petFace(parent: HTMLElement, size: number) {
  const face = element('pet-face', parent, 'span');
  face.style.setProperty('--fs', `${size}px`);
  return face;
}

function setFace(face: HTMLElement, kind: PetKind, mood: PetMood) {
  face.style.setProperty('--fk', String(PET_KINDS.indexOf(kind)));
  face.style.setProperty('--fe', String(PET_MOODS.indexOf(mood)));
}

/** 눌러도 초점을 가져가지 않는 단추(접기 단추와 같음): 남아 있으면 Space·Enter가 단추를 다시 누른다. */
function noFocus<T extends HTMLElement>(button: T) {
  button.tabIndex = -1;
  button.addEventListener('pointerdown', (e) => e.preventDefault());
  return button;
}

function readFolded() {
  try {
    const v = localStorage.getItem(FOLD_KEY);
    if (v !== null) return v === '1';
  } catch {
    // 저장소를 못 쓰면 기본값
  }
  return matchMedia(PHONE_QUERY).matches;
}

export class PetPanel {
  private readonly box: HTMLElement;
  private readonly chip: HTMLElement;
  private readonly noneBox: HTMLElement;
  private readonly noneChip: HTMLElement;
  private readonly face: HTMLElement;
  private readonly chipFace: HTMLElement;
  private readonly name: HTMLElement;
  private readonly hearts: HTMLElement[] = [];
  private readonly bondNum: HTMLElement;
  private readonly paws: HTMLElement[] = [];
  private readonly bars = new Map<string, { fill: HTMLElement; num: HTMLElement }>();
  private readonly buttons = new Map<PetAct, HTMLButtonElement>();
  private readonly favorite: HTMLElement;
  private readonly chipName: HTMLElement;
  private readonly chipBond: HTMLElement;
  private readonly chipBars = new Map<string, { fill: HTMLElement; label: HTMLElement }>();
  private readonly log: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly talkButton: HTMLButtonElement;
  private readonly ring: HTMLElement;
  private readonly chipRing: HTMLElement;
  private readonly food: HTMLElement;
  private folded = readFolded();
  private busy = false;
  private lastLine = '';
  private big: HTMLElement | null = null;
  private bigTimer = 0;
  private coolTimers = new Map<PetAct, number>();
  /** 앞에 그린 값(같으면 DOM을 고치지 않음) */
  private readonly drawn = new Map<string, string>();
  /** 1초에 DOM을 고친 수(성능 재기용) */
  static writes = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly care: PetCare,
    private readonly host: PetPanelHost,
  ) {
    setPetArtVars();
    // ── 펼친 창 ──
    this.box = element('pet-skin pet-status', root);
    foldButton(this.box, () => this.setFolded(true));
    const head = element('pet-head', this.box);
    this.face = petFace(head, 48);
    this.face.addEventListener('click', () => void this.doAct('pat'));
    const right = element('', head);
    const top = element('pet-bond', right);
    this.name = element('pet-name', top);
    this.name.addEventListener('click', () => this.host.rename());
    const hearts = element('pet-hearts', top);
    for (let i = 0; i < 5; i++) this.hearts.push(element('', hearts, 'i'));
    this.bondNum = element('pet-bond-num', right);
    const chance = element('pet-chance', right);
    element('', chance, 'span').textContent = '기회';
    const paws = element('pet-chances', chance, 'span');
    for (let i = 0; i < 2; i++) this.paws.push(element('', paws, 'i'));
    const bars = element('pet-bars', this.box);
    for (const [key, label, color] of BARS) {
      element('label', bars, 'span').textContent = label;
      const bar = element('bar', bars, 'span');
      const fill = element('', bar, 'b');
      fill.style.background = color;
      const num = element('num', bars, 'span');
      this.bars.set(key, { fill, num });
    }
    // 좋아하는 음식(2026-11-28 사용자 "펫 상태창에 좋아하는 음식 : 감자, 가지 처럼 상태창에 적어줘", 펼친 창에만)
    this.favorite = element('pet-favorite', this.box);
    const acts = element('pet-acts', this.box);
    for (const [act, label] of ACTS) {
      const button = noFocus(element('', acts, 'button') as HTMLButtonElement);
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => (act === 'feed' ? this.toggleFood() : void this.doAct(act)));
      this.buttons.set(act, button);
    }
    const talk = element('pet-talk', this.box);
    this.log = element('pet-talk-log', talk);
    const entry = element('pet-talk-entry', talk);
    this.input = element('', entry, 'input') as HTMLInputElement;
    this.input.type = 'text';
    this.input.maxLength = 40;
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void this.talk();
      } else if (e.key === 'Escape') this.input.blur();
      e.stopPropagation();
    });
    this.talkButton = noFocus(element('', entry, 'button') as HTMLButtonElement);
    this.talkButton.type = 'button';
    this.talkButton.textContent = '말 걸기';
    this.talkButton.addEventListener('click', () => void this.talk());
    this.buttons.set('talk', this.talkButton);
    this.ring = element('pet-warn-ring', this.box);
    this.food = element('pet-skin pet-food', this.box);
    this.food.hidden = true;

    // ── 접은 칸(2026-11-28 사용자 "+ 버튼과 함께 내 펫의 사진, 친밀도, 펫 상태 간략히"): 얼굴 · 이름과 단계·친밀도 · 작은 막대 셋 ──
    // 얼굴을 누르면 쓰다듬기, 그 밖을 누르면 펼친다.
    this.chip = element('pet-skin pet-chip', root);
    const chipFold = foldButton(this.chip, () => this.setFolded(false));
    showFoldButton(chipFold, true);
    this.chip.addEventListener('click', () => this.setFolded(false));
    this.chipFace = petFace(this.chip, 44);
    this.chipFace.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.doAct('pat');
    });
    const col = element('pet-chip-col', this.chip);
    this.chipName = element('pet-chip-name', col);
    const chipBars = element('pet-chip-bars', col);
    element('label', chipBars, 'span').textContent = '친밀도';
    this.chipBond = element('pet-chip-bond', chipBars, 'span');
    for (const [key, label, color] of BARS) {
      if (key === 'happy') continue;
      const name = element('label', chipBars, 'span');
      name.textContent = label;
      const fill = element('', element('bar', chipBars, 'span'), 'b');
      fill.style.background = color;
      this.chipBars.set(key, { fill, label: name });
    }
    this.chipRing = element('pet-warn-ring', this.chip);

    // ── 펫을 잃은 뒤: 빈 방석 + [입양하기] / 접으면 빈 방석만 ──
    this.noneBox = element('pet-skin pet-status pet-none', root);
    foldButton(this.noneBox, () => this.setFolded(true));
    const noneRow = element('pet-none-row', this.noneBox);
    element('pet-cushion', noneRow, 'span').style.setProperty('--fs', '48px');
    const adopt = noFocus(element('', element('pet-acts', noneRow), 'button') as HTMLButtonElement);
    adopt.type = 'button';
    adopt.textContent = '입양하기';
    adopt.addEventListener('click', () => this.host.adopt());
    this.noneChip = element('pet-skin pet-chip', root);
    showFoldButton(foldButton(this.noneChip, () => this.setFolded(false)), true);
    element('pet-cushion', this.noneChip, 'span').style.setProperty('--fs', '48px');

    for (const e of [this.box, this.chip, this.noneBox, this.noneChip]) e.hidden = true;
    document.addEventListener('pointerdown', (e) => {
      if (!this.food.hidden && e.target instanceof Node && !this.food.contains(e.target) && e.target !== this.buttons.get('feed')) this.closeFood();
    });
    care.onRearmed = () => window.setTimeout(() => this.say(REARM_LINE), 600);
    this.render();
  }

  private put(key: string, value: string, write: () => void) {
    if (this.drawn.get(key) === value) return;
    this.drawn.set(key, value);
    PetPanel.writes++;
    write();
  }

  private setFolded(folded: boolean) {
    if (folded === this.folded) return;
    this.folded = folded;
    if (folded) this.closeFood();
    try {
      localStorage.setItem(FOLD_KEY, folded ? '1' : '0');
    } catch {
      // 지금 화면에서는 바뀐다.
    }
    this.render();
  }

  get isFolded() {
    return this.folded;
  }

  /** 값이 바뀌었을 때 부른다. 바뀐 칸만 고친다. */
  render() {
    const care = this.care;
    const s = care.state;
    const mode = !s || care.unavailable || care.needsPick ? 'off' : care.lostPet ? 'none' : 'pet';
    this.put('mode', `${mode}|${this.folded}`, () => {
      this.box.hidden = !(mode === 'pet' && !this.folded);
      this.chip.hidden = !(mode === 'pet' && this.folded);
      this.noneBox.hidden = !(mode === 'none' && !this.folded);
      this.noneChip.hidden = !(mode === 'none' && this.folded);
    });
    if (mode !== 'pet' || !s?.pet) return;
    const kind = s.pet;
    const v = care.values();
    const mood = care.mood();
    const stage = care.stage;
    const face = this.folded ? this.chipFace : this.face;
    this.put(this.folded ? 'chipFace' : 'face', `${kind}|${mood}`, () => setFace(face, kind, mood));
    const zero = v.fullness === 0 || v.company === 0;
    this.put('ring', String(zero), () => {
      this.ring.hidden = !zero;
      this.chipRing.hidden = !zero;
    });
    this.put('paws', String(s.chances), () => {
      this.paws.forEach((p, i) => p.classList.toggle('off', i >= s.chances));
    });
    const name = petNameOf(kind, s.name);
    if (this.folded) {
      this.put('chipName', name, () => (this.chipName.textContent = name));
      const chipBond = `${PET_STAGES[stage - 1].name} ${formatNumber(s.bond)}`;
      this.put('chipBond', chipBond, () => (this.chipBond.textContent = chipBond));
      for (const [key, bar] of this.chipBars) {
        const value = v[key as keyof typeof v];
        this.put(`chipBar:${key}`, String(value), () => {
          bar.fill.style.transform = `scaleX(${value / 100})`;
          bar.label.classList.toggle('low', value < 30);
        });
      }
      return;
    }
    this.put('name', name, () => (this.name.textContent = name));
    const favorite = `좋아하는 음식 : ${this.host.favorites(kind).join(', ')}`;
    this.put('favorite', favorite, () => (this.favorite.textContent = favorite));
    this.put('hearts', String(stage), () => this.hearts.forEach((h, i) => h.classList.toggle('on', i < stage)));
    const next = PET_STAGES[stage]?.min;
    const bondText = `${PET_STAGES[stage - 1].name} ${formatNumber(s.bond)}${next !== undefined ? ` / ${formatNumber(next)}` : ''}`;
    this.put('bond', bondText, () => (this.bondNum.textContent = bondText));
    for (const [key] of BARS) {
      const value = v[key];
      const bar = this.bars.get(key)!;
      this.put(`bar:${key}`, String(value), () => {
        bar.fill.style.transform = `scaleX(${value / 100})`;
        bar.num.textContent = String(value);
        bar.num.classList.toggle('low', value < 30);
      });
    }
    const asleep = this.host.asleep();
    this.put('acts', `${asleep}|${zero}`, () => {
      this.buttons.get('feed')!.disabled = asleep;
      this.buttons.get('play')!.disabled = asleep || zero;
    });
    this.put('log', `${name}|${this.lastLine}`, () => {
      this.log.replaceChildren();
      if (!this.lastLine) return;
      element('', this.log, 'b').textContent = name;
      this.log.append(`: ${this.lastLine}`);
      this.log.title = this.lastLine;
    });
  }

  /** 맵 위 펫이나 접은 칸 얼굴을 눌렀을 때(쓰다듬기) */
  pat() {
    void this.doAct('pat');
  }

  /** 펫의 말: 상태 창 마지막 말 한 줄 + 맵 위 말풍선 */
  say(line: string) {
    this.lastLine = line;
    this.host.petSay(line);
    this.render();
  }

  /** 행동 간격이 남은 단추를 흐리게(남은 시간이 지나면 되돌림) */
  private markCool(act: PetAct) {
    const button = this.buttons.get(act);
    const left = this.care.cooldown(act);
    if (!button || left <= 0) return;
    button.classList.add('cool');
    window.clearTimeout(this.coolTimers.get(act));
    this.coolTimers.set(
      act,
      window.setTimeout(() => button.classList.remove('cool'), left + 50),
    );
  }

  private ctx(greet = false): TalkContext {
    const v = this.care.values();
    return { stage: this.care.stage, zero: v.fullness === 0 || v.company === 0, greet, fullness: v.fullness, energy: v.energy, company: v.company, ...this.host.talkContext() };
  }

  private async doAct(act: 'pat' | 'praise' | 'play', reply?: string) {
    if (this.busy || !this.care.kind || !this.host.canCare()) return;
    if (act === 'play' && this.host.asleep()) return;
    if (this.care.cooldown(act) > 0) return;
    this.busy = true;
    const r = await this.care.act(act);
    this.busy = false;
    if (typeof r === 'string') return;
    this.markCool(act);
    this.react(act, r, reply);
  }

  /** 서버 답에 맞춰 맵 위 동작·얼굴·말·큰 화면(기획 8장) */
  private react(act: PetAct, r: PetActResult, reply?: string) {
    const stage = this.care.stage;
    if (!r.ok) {
      if (r.reason === 'full') {
        this.host.playCare('shake', false);
        this.say(CARE_LINES.full);
      } else if (r.reason === 'tired') {
        this.host.playCare('shakeOnly', false);
        this.say(CARE_LINES.tired);
      } else if (r.reason === 'zero') this.say(ZERO_LINES[2]);
      else if (r.reason === 'food') this.render();
      return;
    }
    const hearts = this.care.takeHeart();
    this.care.joy();
    if (act === 'pat') {
      this.host.playCare('pat', hearts);
      this.say(reply ?? careLine('pat', stage));
      if (r.firstPat && this.care.takeBig(false)) this.showBig(null);
    } else if (act === 'praise') {
      this.host.playCare('praise', hearts);
      this.say(reply ?? careLine('praise', stage));
    } else if (act === 'play') {
      this.host.playCare('play', hearts);
      this.say(careLine('play', stage));
    } else if (act === 'feed') {
      this.host.playCare('feed', hearts);
      this.say(careLine(r.favorite ? 'favorite' : 'feed', stage));
      if (r.favorite && this.care.takeBig(false)) this.showBig(null);
    }
  }

  private async talk() {
    if (this.busy || !this.care.kind || !this.host.canCare()) return;
    const text = this.input.value.trim();
    // 칭찬 낱말은 칭찬하기로 친다(간격·횟수도 칭찬과 같이 셈)
    if (text && isPraiseText(text)) {
      if (this.care.cooldown('praise') > 0) return;
      this.input.value = '';
      this.input.blur();
      await this.doAct('praise', careLine('praise', this.care.stage));
      return;
    }
    if (this.care.cooldown('talk') > 0) return;
    this.busy = true;
    const r = await this.care.act('talk');
    this.busy = false;
    if (typeof r === 'string' || !r.ok) return;
    this.input.value = '';
    // 보낸 뒤에는 글 칸에서 나온다(이동 키가 다시 게임으로 감).
    this.input.blur();
    this.markCool('talk');
    const ctx = this.ctx(r.greet);
    if (r.greet) {
      this.care.joy();
      this.host.playCare('praise', this.care.takeHeart());
    }
    this.say(text ? replyTo(text, ctx) : talkLine(ctx));
  }

  // ── 먹이 ──
  private toggleFood() {
    if (!this.food.hidden) return this.closeFood();
    if (!this.care.kind || !this.host.canCare() || this.host.asleep()) return;
    this.openFood();
  }

  private openFood() {
    const kind = this.care.kind;
    if (!kind) return;
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST_FOOD_KEY);
    } catch {
      last = null;
    }
    const rows = this.host.foods(kind).sort((a, b) => Number(b.food === last) - Number(a.food === last));
    this.food.replaceChildren();
    if (!rows.length) element('pet-food-empty', this.food).textContent = '가진 먹이 없음';
    for (const row of rows) {
      const button = noFocus(element('pet-food-row', this.food, 'button') as HTMLButtonElement);
      button.type = 'button';
      const icon = element('', button, 'img') as HTMLImageElement;
      icon.src = row.icon;
      icon.alt = '';
      element('', button, 'span').textContent = row.name;
      element('count', button, 'span').textContent = `${formatNumber(row.count)}개`;
      element(row.favorite ? 'plus fav' : 'plus', button, 'span').textContent = `+${row.full}`;
      button.addEventListener('click', () => void this.feed(row.food));
    }
    this.food.hidden = false;
    sound.play('ui_open');
  }

  private closeFood() {
    if (this.food.hidden) return;
    this.food.hidden = true;
    sound.play('ui_close');
  }

  private async feed(food: PetFood) {
    if (this.busy || !this.host.canCare()) return;
    this.closeFood();
    try {
      localStorage.setItem(LAST_FOOD_KEY, food);
    } catch {
      // 다음에 차례만 달라진다.
    }
    this.busy = true;
    const r = await this.care.act('feed', food);
    this.busy = false;
    if (typeof r === 'string') return;
    if (r.ok) this.host.fed(food, r.grade, r.left);
    this.react('feed', r);
  }

  // ── 기회·큰 화면 ──
  /** 기회가 줄었다(기획 6.2): 접혀 있으면 펼치고, 그 발바닥이 0.6초 흐려진다. 접속해 있는 동안이면 펫이 말한다. */
  loseChance(left: number, online: boolean) {
    this.setFolded(false);
    this.render();
    const paw = this.paws[left];
    if (paw) {
      paw.classList.add('losing');
      window.setTimeout(() => paw.classList.remove('losing'), 700);
    }
    if (online) this.say(CHANCE_LINE);
  }

  /** 기분 좋은 화면 큰 화면(2초, 클릭을 막지 않음). stage면 단계 이름을 함께 */
  showBig(stage: number | null) {
    const kind = this.care.kind;
    if (!kind) return;
    window.clearTimeout(this.bigTimer);
    this.big?.remove();
    const big = element('pet-joy', this.root);
    setFace(petFace(big, 160), kind, 'joy');
    element('say', big).textContent = JOY_LINE;
    if (stage) element('stage', big).textContent = PET_STAGES[stage - 1].name;
    this.big = big;
    this.bigTimer = window.setTimeout(() => {
      big.remove();
      if (this.big === big) this.big = null;
    }, BIG_MS);
  }

  /** 지금 화면에 보이는 펫 창(시험·자리 확인용) */
  get element() {
    return this.folded ? this.chip : this.box;
  }
}
