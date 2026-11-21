import { paintMemoPadIcon } from '../art/drops';
import { BLOCK_IDS } from '../blocks';
import { HOTBAR_SIZE, MEMO_SLOT, TABS, type Inventory, type TabId } from '../game/inventory';
import { formatNumber, levelNeed } from '../game/level';
import { goldText, type Gold } from '../game/gold';
import { isPotion, isSeed, paintItem, POTION_IDS, SEED_IDS, WEAPON_IDS, type GearRef, type ItemId, type PotionId, type SeedId } from '../items';
import { element } from './dom';
import { foldButton } from './fold';
import type { MyStatus } from './info';
import { COUNT, countUp, type Counting } from './countUp';
import { LevelBar, type LevelPlayOptions } from './levelUpAnim';
import './touch.css';

/** 이미지를 읽은 뒤에 그릴 수 있어서 Hud를 만들 때 준비한다. */
function paintIcons() {
  return Object.fromEntries([...BLOCK_IDS, ...WEAPON_IDS, ...POTION_IDS, ...SEED_IDS].map((id) => [id, paintItem(id).toDataURL()])) as Record<
    Exclude<ItemId, GearRef>,
    string
  >;
}

const TOAST_MS = 3500;

/** 왼쪽 위 조작 안내: [이름, 키들, 덧붙임] */
const HELP_ROWS: [string, string[], string?][] = [
  ['이동', ['WASD', '방향키'], '두 키는 대각선'],
  ['달리기 · 점프', ['Shift', 'Space']],
  ['선택', ['1~9'], '메모장 0'],
  ['인벤토리 · 채팅', ['I', 'Enter']],
  ['작업 · 줍기', ['F']],
  ['설치 · 공격', ['좌클릭']],
  ['회수', ['우클릭']],
  ['재장전 · 가구 돌리기', ['R']],
  ['맵 이동', ['귀퉁이 포탈']],
  ['이 안내 닫기', ['H']],
];

/** 조작 안내를 닫아 두었는지 브라우저에 남기는 이름(2026-11-13 사용자 요청 "단축키 화면은 H로 여닫기") */
const HELP_CLOSED_KEY = 'help-closed';

/** 인벤토리 창의 탭: 블록과 무기 탭(inventory.ts의 TABS) 뒤에 주운 메모 탭 */
type BagTab = TabId | 'memo';
const BAG_TABS: Record<BagTab, string> = { ...TABS, memo: '메모' };

/** 끌고 있는 것: 단축키 칸에서 집었으면 칸 번호, 인벤토리 목록에서 집었으면 그 물건 */
type Drag = { from: number } | { item: ItemId };
const TOAST_LIMIT = 4;

/** I 창의 탭(2026-11-12 사용자 요청 "정보창, 인벤토리 탭으로 나뉜다"). 처음엔 정보창, 그 뒤로는 마지막에 본 탭이 열린다. */
const VIEWS = { info: '정보창', bag: '인벤토리' } as const;
type View = keyof typeof VIEWS;

/** 화면 위 UI: 단축키 칸, 인벤토리 창, 조작 안내 */
/** 정보 칸에 보일 판 값(글은 부르는 쪽이 bigText로 만든다) */
export interface RunStatus {
  level: string;
  exp: string;
  need: string;
  /** 다음 판 레벨까지 찬 몫(0~1) */
  ratio: number;
  hp: string;
}

export class Hud {
  private readonly panel: HTMLElement;
  /** 화면 왼쪽 위에 세로로 쌓는 칸(조작 안내, 현상범 명단) */
  readonly topLeft: HTMLElement;
  private help!: HTMLElement;
  private helpClosed!: HTMLElement;
  /** 정보창 탭의 내용이 들어가는 칸. 그리는 것은 InfoView다. */
  readonly infoPane: HTMLElement;
  private readonly bagPane: HTMLElement;
  private readonly viewButtons = new Map<View, HTMLButtonElement>();
  private view: View = 'info';
  private renderInfo: (() => void) | null = null;
  /** 정보창에 보일 레벨, 경험치, 체력. setLevel, setHp가 고친다. */
  readonly status: MyStatus = { level: 1n, exp: 0, hp: 0, maxHp: 0 };
  private readonly pickedName: HTMLElement;
  private readonly pickedIcon: HTMLImageElement;
  /** 휴대폰에서 인벤토리를 여닫는 버튼 */
  private readonly bagButton: HTMLButtonElement;
  /** 든 총의 남은 탄("12 / 12", 재장전 중). 든 것 이름 옆에 쓴다. */
  private ammo: string | null = null;
  private readonly levelText: HTMLElement;
  /** 레벨 글 안의 숫자(.lv-num). 레벨 업 때 숫자만 튀어 오른다. 글 모양(마을, 모험, 쉬는 중)이 바뀔 때 새로 만든다. */
  private levelNum!: HTMLElement;
  private labelMode: 'town' | 'run' | 'none' | '' = '';
  /** 정보 칸 막대에 지금 보이는(애니메이션이 끝나면 보일) 레벨과 몫. 레벨 업 애니메이션이 여기서 시작한다. 글 모양이 바뀌면 비운다. */
  private shownBar: { level: bigint; ratio: number } | null = null;
  /** 정보 칸 EXP 막대와 레벨 업 애니메이션(levelUpAnim.ts). onLevel은 GameScene이 내 이름표에 잇는다. */
  readonly bar: LevelBar;
  private readonly statusBox: HTMLElement;
  /**
   * 모험 맵에 있는 동안 정보 칸에 보일 판 값(2026-11-18 사용자 "게임에 들어가면 인게임 레벨이 나오도록", 디자인 adventure-ui.md 14절).
   * null이면 마을 값, 'none'이면 모험 맵이지만 판이 없음. 마을 값은 그동안에도 status에 모아 두었다가 돌아오면 다시 그린다.
   */
  private run: RunStatus | 'none' | null = null;
  private shownRun = '';
  private readonly expFill: HTMLElement;
  private readonly expText: HTMLElement;
  private readonly dragIcon: HTMLImageElement;
  private readonly slots: HTMLElement[] = [];
  /** 0번 키 칸: 언제나 메모장(inventory.ts의 MEMO_SLOT) */
  private readonly memoSlot: HTMLElement;
  private readonly memoIcon = paintMemoPadIcon().toDataURL();
  private readonly bag: HTMLElement;
  private readonly bagHint: HTMLElement;
  /** 인벤토리의 '메모' 탭 내용. 그리는 것은 GroundUi다. */
  private readonly memoPane: HTMLElement;
  private renderMemos: ((pane: HTMLElement) => void) | null = null;
  private readonly bagGold: HTMLElement;
  private readonly tabButtons = new Map<BagTab, HTMLButtonElement>();
  private tab: BagTab = 'tile';
  private readonly icons = paintIcons();
  /** 가진 포션 개수(main에서 economy로 이음) */
  potionCount: (id: PotionId) => number = () => 0;
  /** 가진 씨앗 개수(main에서 economy로 이음) */
  seedCount: (id: SeedId) => number = () => 0;
  /** 휴대폰에서 고른 포션 칸을 한 번 더 눌렀다 */
  onUsePotion?: () => void;
  /** 고른 칸을 한 번 더 눌렀을 때(포션 말고): 총은 재장전, 가구는 돌리기. 없으면 가구만 돌린다. */
  onReselect?: () => void;
  /** 인벤토리의 골드 '버리기' 버튼을 누르면 부른다(main.ts가 정한다). */
  onDropGold: (() => void) | null = null;
  private readonly connection: HTMLElement;
  private readonly hpFill: HTMLElement;
  private readonly hpText: HTMLElement;
  private readonly downNotice: HTMLElement;
  private readonly gold: HTMLElement;
  /** 계정 줄 골드: 보이는(오르기가 끝나면 보일) 값, 받은 값, 오르는 중, 붙잡음(모험 결과 화면 동안, 마을에 서면 오름) */
  private goldShown: Gold | null = null;
  private goldTarget: Gold | null = null;
  private goldCount: Counting | null = null;
  private goldHeld = false;
  /** 정보 칸 EXP 글이 오르는 중(마을 경험치가 같은 레벨에서 늘 때) */
  private expCount: Counting | null = null;
  private readonly toastBox: HTMLElement;
  private readonly announceBox: HTMLElement;
  private readonly accountName: HTMLElement;
  private popupBox: HTMLElement | null = null;
  private drag: Drag | null = null;

  constructor(
    root: HTMLElement,
    side: HTMLElement,
    private readonly inventory: Inventory,
    nickname: string,
    onSignOut: () => void,
  ) {
    const account = element('account', side);
    this.accountName = element('account-name', account, 'span');
    this.accountName.textContent = nickname;
    this.gold = element('account-gold', account, 'span');
    const signOut = element('account-signout', account, 'button') as HTMLButtonElement;
    signOut.type = 'button';
    signOut.textContent = '로그아웃';
    signOut.addEventListener('click', onSignOut);

    this.toastBox = element('toasts', root);
    this.announceBox = element('announce', root);

    this.connection = element('connection', root);
    this.connection.textContent = '서버에 연결하는 중입니다';

    /** 왼쪽 위 칸: 조작 안내와 그 아래 현상범 명단 */
    this.topLeft = element('top-left', root);
    // 항목마다 한 줄, 키는 키보드 단추 모양(2026-11-13 사용자 "글자만 이어져 있어 가독성이 떨어진다").
    const help = element('help', this.topLeft);
    this.help = help;
    for (const [label, keys, note] of HELP_ROWS) {
      element('help-label', help, 'span').textContent = label;
      const row = element('help-keys', help, 'span');
      keys.forEach((key, i) => {
        if (i) element('help-or', row, 'span').textContent = '/';
        element('help-key', row, 'kbd').textContent = key;
      });
      if (note) element('help-note', row, 'span').textContent = note;
    }
    // 열린 안내 오른쪽 위의 접기 버튼(2026-11-16 창 접기, ui-minimize.md). H와 같은 일을 한다.
    help.classList.add('foldable');
    foldButton(help, () => this.toggleHelp());
    // 닫아 두면 다시 여는 키만 작게 보인다.
    this.helpClosed = element('help help-closed', this.topLeft);
    element('help-label', this.helpClosed, 'span').textContent = '조작 안내';
    element('help-key', element('help-keys', this.helpClosed, 'span'), 'kbd').textContent = 'H';
    this.helpClosed.addEventListener('click', () => this.toggleHelp());
    let closed = false;
    try {
      closed = localStorage.getItem(HELP_CLOSED_KEY) === '1';
    } catch {
      // 저장소를 못 쓰면 늘 열린 채로 시작한다.
    }
    this.showHelp(!closed);

    this.panel = element('panel', root);
    this.panel.hidden = true;
    const views = element('panel-views', this.panel);
    for (const [id, label] of Object.entries(VIEWS) as [View, string][]) {
      const button = element('panel-view', views, 'button') as HTMLButtonElement;
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => {
        this.view = id;
        this.render();
      });
      this.viewButtons.set(id, button);
    }
    this.infoPane = element('panel-pane', this.panel);
    this.bagPane = element('panel-pane', this.panel);
    // 가진 골드와 버리기 버튼(2026-11-13 사용자 요청 "인벤토리에서 나의 골드 옆에 '버리기' 버튼")
    const goldRow = element('bag-gold', this.bagPane);
    element('bag-gold-label', goldRow, 'span').textContent = '골드';
    this.bagGold = element('bag-gold-amount', goldRow, 'span');
    const dropGold = element('bag-gold-drop', goldRow, 'button') as HTMLButtonElement;
    dropGold.type = 'button';
    dropGold.textContent = '버리기';
    dropGold.addEventListener('click', () => this.onDropGold?.());
    const tabs = element('bag-tabs', this.bagPane);
    for (const [id, label] of Object.entries(BAG_TABS) as [BagTab, string][]) {
      const button = element('bag-tab', tabs, 'button') as HTMLButtonElement;
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => {
        this.tab = id;
        this.render();
      });
      this.tabButtons.set(id, button);
    }
    this.bag = element('slots bag', this.bagPane);
    this.memoPane = element('memo-bag', this.bagPane);
    this.bagHint = element('bag-hint', this.bagPane);
    this.bagHint.textContent =
      '아래 단축키 칸으로 끌어다 놓거나, 누르면 지금 고른 칸에 들어갑니다. 단축키 칸에서 이 창으로 끌면 칸이 비워집니다. 가구는 R(휴대폰은 고른 칸을 한 번 더 누름)로 방향을 돌립니다.';

    this.downNotice = element('down-notice', root);
    this.downNotice.textContent = '쓰러졌습니다. 잠시 후 포탈 앞에서 다시 시작합니다.';
    this.downNotice.hidden = true;

    const bottom = element('bottom', root);

    const status = (this.statusBox = element('status', bottom));
    this.levelText = element('status-level', status);
    const exp = element('exp', status);
    this.expFill = element('exp-fill', exp);
    const flash = element('lv-flash', exp);
    this.expText = element('exp-text', exp);
    this.bar = new LevelBar(exp, this.expFill, flash);
    this.labelFor('town');
    const hp = element('hp', status);
    this.hpFill = element('hp-fill', hp);
    this.hpText = element('hp-text', hp);

    const picked = element('picked', bottom);
    this.pickedIcon = element('picked-icon', picked, 'img') as HTMLImageElement;
    this.pickedIcon.alt = '';
    this.pickedName = element('picked-name', picked);

    // 휴대폰에는 I 키가 없어 아래 막대에 인벤토리를 여닫는 버튼을 둔다(에이전트가 정함). 마우스 화면에서는 숨긴다(style.css).
    this.bagButton = element('bag-button', bottom, 'button') as HTMLButtonElement;
    this.bagButton.type = 'button';
    this.bagButton.textContent = '인벤토리';
    this.bagButton.addEventListener('click', () => this.toggle());

    const hotbar = element('slots hotbar', bottom);

    for (let i = 0; i < HOTBAR_SIZE; i++) this.slots.push(this.createSlot(i, hotbar));
    this.memoSlot = element('slot memo-slot', hotbar);
    this.memoSlot.title = '메모장: 좌클릭하면 쪽지를 써서 선 자리에 놓습니다';
    const memoIcon = element('slot-icon', this.memoSlot, 'img') as HTMLImageElement;
    memoIcon.draggable = false;
    memoIcon.alt = '';
    memoIcon.src = this.memoIcon;
    element('slot-key', this.memoSlot).textContent = '0';

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

  /** 끊겼으면 이유를 문구 옆에 작게 쓴다. 원인을 알아보는 데 쓴다. */
  setConnected(connected: boolean, reason: string | null = null) {
    this.connection.hidden = connected;
    this.connection.textContent = reason ? `서버에 연결하는 중입니다 (${reason})` : '서버에 연결하는 중입니다';
  }

  setHp(hp: number, max: number) {
    this.status.hp = hp;
    this.status.maxHp = max;
    this.refreshInfo();
    if (this.run) return;
    this.hpFill.style.width = `${Math.min(hp / max, 1) * 100}%`;
    this.hpText.textContent = `HP ${hp} / ${max}`;
  }

  /**
   * 마을 레벨과 경험치. leveled면 막대가 차고 번쩍이며 숫자가 오르는 애니메이션을 돌리고 true를 준다
   * (그때 내 이름표 숫자는 bar.onLevel이 같은 때에 바꾼다). 모험 맵에 있으면 값만 모아 둔다.
   */
  setLevel(level: bigint, exp: number, leveled = false, options?: LevelPlayOptions) {
    const before = this.status;
    const grew = !leveled && this.labelMode === 'town' && level === before.level && exp > before.exp;
    const fromExp = before.exp;
    this.status.level = level;
    this.status.exp = exp;
    this.refreshInfo();
    if (this.run) return false;
    const need = levelNeed(level);
    const needText = formatNumber(need);
    const expText = (n: bigint) => `EXP ${formatNumber(n)} / ${needText}`;
    this.expCount?.finish();
    this.expCount = null;
    // 같은 레벨에서 경험치가 늘면(일·노동) EXP 글도 450ms 동안 오른다(PM 2026-11-18 "마을 일·노동으로 얻는 골드·경험치에도 같은 오르기").
    this.expText.style.fontSize = expFontSize(expText(BigInt(exp)));
    if (grew) this.expCount = countUp([{ el: this.expText, from: BigInt(fromExp), to: BigInt(exp), fmt: expText }], COUNT.gold);
    else this.expText.textContent = expText(BigInt(exp));
    return this.showBar('town', level, Math.min(exp / need, 1), leveled, options);
  }

  /**
   * 모험 맵에서는 정보 칸을 모험 값으로 바꾼다: "모험" 보라 표 + 연보라 "Lv 1,234", 보라 EXP 막대(다음 모험 레벨까지), 늘 가득인 모험 HP.
   * 'none'(모험 중이 아님)이면 "쉬는 중"과 빈 막대, null이면 마을 값으로 돌아간다. 글이 바뀔 때만 DOM을 고친다.
   * leveled면 레벨 업 애니메이션을 돌리고 true를 준다(setLevel과 같음).
   */
  setRun(run: RunStatus | 'none' | null, leveled = false, options?: LevelPlayOptions) {
    const key = run === null || run === 'none' ? String(run) : `${run.level}|${run.exp}|${run.hp}`;
    if (key === this.shownRun && !leveled) return false;
    const wasRun = this.run !== null;
    this.shownRun = key;
    this.run = run;
    this.statusBox.classList.toggle('adv-run', run !== null);
    if (run === null) {
      if (wasRun) {
        // 마을 값으로 다시 그린다.
        const { level, exp, hp, maxHp } = this.status;
        this.setLevel(level, exp);
        if (maxHp) this.setHp(hp, maxHp);
      }
      return false;
    }
    this.expCount?.finish();
    this.expCount = null;
    if (run === 'none') {
      this.bar.finish();
      this.shownBar = null;
      this.labelFor('none');
      this.bar.set(0);
      this.expText.textContent = '';
      this.expText.style.fontSize = '';
      this.hpFill.style.width = '0%';
      this.hpText.textContent = '';
      return false;
    }
    this.expText.textContent = `EXP ${run.exp} / ${run.need}`;
    this.expText.style.fontSize = expFontSize(this.expText.textContent);
    this.hpFill.style.width = '100%';
    this.hpText.textContent = `HP ${run.hp}`;
    let level = 1n;
    try {
      level = BigInt(run.level);
    } catch {
      // 글자가 이상하면 1로 둔다.
    }
    return this.showBar('run', level, run.ratio, leveled, options);
  }

  /** 정보 칸 레벨 글의 지금 모양(마을, 모험, 쉬는 중) */
  get barMode() {
    return this.labelMode;
  }

  /** 레벨 업 애니메이션이 끝날 때(건너뛰어도) 풀린다. 돌고 있지 않으면 바로. */
  levelShown() {
    return this.bar.done();
  }

  /** 레벨 업 애니메이션을 곧바로 끝 모습으로(다음 전투를 시작할 때) */
  finishLevel() {
    this.bar.finish();
  }

  /** 정보 칸의 레벨 숫자와 막대. 같은 글 모양에서 레벨이 올랐으면 애니메이션, 아니면 바로(막대는 CSS transition 0.15s). */
  private showBar(mode: 'town' | 'run', level: bigint, ratio: number, leveled: boolean, options?: LevelPlayOptions) {
    const before = this.labelMode === mode ? this.shownBar : null;
    this.shownBar = { level, ratio };
    this.bar.finish();
    this.labelFor(mode);
    this.levelText.style.fontSize = levelFontSize(formatNumber(level));
    if (leveled && before && level > before.level) {
      this.bar.play(before.level, level, before.ratio, ratio, { label: this.levelNum, fmt: formatNumber }, options);
      return true;
    }
    this.levelNum.textContent = formatNumber(level);
    this.bar.set(ratio);
    return false;
  }

  /** 레벨 글의 모양: 마을 "Lv. 숫자", 모험 [모험] "Lv. 숫자", 모험 중이 아님 [모험] "쉬는 중". 모양이 바뀔 때만 다시 만든다. */
  private labelFor(mode: 'town' | 'run' | 'none') {
    if (this.labelMode === mode) return;
    this.labelMode = mode;
    this.levelText.style.fontSize = '';
    this.levelText.replaceChildren();
    this.levelText.classList.toggle('empty', mode === 'none');
    if (mode !== 'town') {
      const badge = document.createElement('span');
      badge.className = 'adv-run-badge';
      badge.textContent = '모험';
      this.levelText.append(badge);
    }
    if (mode === 'none') {
      this.levelText.append('쉬는 중');
      return;
    }
    this.levelText.append('Lv. ');
    this.levelNum = document.createElement('span');
    this.levelNum.className = 'lv-num';
    this.levelText.append(this.levelNum);
  }

  /** 숨은 장소를 찾았을 때 화면 위쪽 가운데에 이름을 크게 띄웠다가 지운다. */
  announce(text: string) {
    this.announceBox.textContent = text;
    // 클래스를 뗀 상태를 브라우저가 한 번 계산하게 해야 다시 붙일 때 애니메이션이 처음부터 돈다.
    this.announceBox.classList.remove('show');
    void this.announceBox.offsetWidth;
    this.announceBox.classList.add('show');
  }

  /** 화면 가운데 작은 팝업창. 누르거나 8초가 지나면 닫힌다. 숨은 방에 들어간 사람에게만 띄운다. */
  popup(text: string) {
    this.popupBox?.remove();
    const box = element('popup', this.announceBox.parentElement!);
    element('popup-text', box).textContent = text;
    const close = element('popup-close', box, 'button') as HTMLButtonElement;
    close.type = 'button';
    close.textContent = '확인';
    const dismiss = () => {
      box.remove();
      if (this.popupBox === box) this.popupBox = null;
    };
    box.addEventListener('click', dismiss);
    window.setTimeout(dismiss, 8000);
    this.popupBox = box;
  }

  showDown(down: boolean) {
    this.downNotice.hidden = !down;
  }

  /** 닉네임을 바꾸면 오른쪽 위 계정 줄의 이름도 바꾼다. */
  setNickname(nickname: string) {
    this.accountName.textContent = nickname;
  }

  /**
   * 계정 줄 골드. 늘면 앞 값에서 새 값으로 450ms 동안 오르고 튄다(디자인 adventure-ui.md 16절, 사용자 "숫자 오르는 애니메이션은 골드도 마찬가지").
   * 줄면(사고 버림) 바로 바뀐다(에이전트가 정함). 붙잡혀 있으면(holdGold) 값만 받아 두었다가 releaseGold에서 오른다. 인벤토리 골드 줄은 늘 바로.
   */
  setGold(gold: Gold) {
    this.bagGold.textContent = goldText(gold);
    if (gold === this.goldTarget) return;
    this.goldTarget = gold;
    if (!this.goldHeld) this.showGold(COUNT.gold);
  }

  /** 모험 결과 화면 동안 계정 줄 골드를 앞 값에 붙잡아 둔다(가져온 골드는 마을에 선 뒤 오른다). */
  holdGold() {
    this.goldHeld = true;
  }

  /** 붙잡은 골드를 풀어 앞 값에서 새 값으로 ms 동안 올린다(마을에 서면 600ms). 붙잡지 않았으면 아무것도 안 한다. */
  releaseGold(ms = COUNT.village) {
    if (!this.goldHeld) return;
    this.goldHeld = false;
    this.showGold(ms);
  }

  private showGold(ms: number) {
    const to = this.goldTarget;
    if (to === null) return;
    this.goldCount?.finish();
    this.goldCount = null;
    const from = this.goldShown;
    this.goldShown = to;
    if (from === null || to <= from) {
      this.gold.textContent = goldText(to);
      return;
    }
    this.goldCount = countUp([{ el: this.gold, from, to, fmt: (n) => goldText(n) }], ms, { lockWidth: true, pop: true });
  }

  /** 인벤토리 '메모' 탭을 그리는 함수를 받는다. */
  setMemoRenderer(render: (pane: HTMLElement) => void) {
    this.renderMemos = render;
    this.refreshMemos();
  }

  /** 주운 메모가 바뀌면 부른다. '메모' 탭이 보이고 있으면 다시 그린다. */
  refreshMemos() {
    if (this.isOpen && this.view === 'bag' && this.tab === 'memo') this.renderMemos?.(this.memoPane);
  }

  /** 정보창 탭을 그리는 함수를 받는다. */
  setInfoRenderer(render: () => void) {
    this.renderInfo = render;
    this.refreshInfo();
  }

  /** 정보창이 보이고 있으면 다시 그린다. 골드, 자원, 주식이 바뀔 때 부른다. */
  refreshInfo() {
    if (this.isOpen && this.view === 'info') this.renderInfo?.();
  }

  /** 화면 아래쪽에 잠깐 뜨는 알림 */
  toast(title: string, detail = '', rare = false) {
    const box = element(rare ? 'toast rare' : 'toast', this.toastBox);
    element('toast-title', box).textContent = title;
    if (detail) element('toast-detail', box).textContent = detail;
    while (this.toastBox.childElementCount > TOAST_LIMIT) this.toastBox.firstElementChild?.remove();
    window.setTimeout(() => box.remove(), TOAST_MS);
  }

  /** 포션 개수가 바뀌면 칸의 숫자를 다시 쓴다. */
  refreshCounts() {
    this.render();
  }

  toggle() {
    this.panel.hidden = !this.panel.hidden;
    this.cancelDrag();
    this.render();
  }

  close() {
    this.panel.hidden = true;
    this.cancelDrag();
    this.bagButton.classList.remove('chosen');
  }

  /** H: 왼쪽 위 조작 안내를 열고 닫는다. 닫은 상태는 이 브라우저에 남긴다. */
  toggleHelp() {
    const open = this.help.hidden === true;
    this.showHelp(open);
    try {
      localStorage.setItem(HELP_CLOSED_KEY, open ? '0' : '1');
    } catch {
      // 저장하지 못해도 지금 화면에서는 바뀐다.
    }
  }

  private showHelp(open: boolean) {
    this.help.hidden = !open;
    this.helpClosed.hidden = open;
  }

  private createSlot(index: number, parent: HTMLElement) {
    const slot = element('slot', parent);
    slot.dataset.slot = String(index);
    const icon = element('slot-icon', slot, 'img') as HTMLImageElement;
    icon.draggable = false;
    icon.alt = '';
    element('slot-key', slot).textContent = String(index + 1);
    element('slot-count', slot);
    return slot;
  }

  /** 단축키 칸 번호. 단축키 칸이 아니면 null */
  private slotFrom(target: EventTarget | null) {
    const el = target instanceof Element ? target.closest<HTMLElement>('.slot[data-slot]') : null;
    return el ? Number(el.dataset.slot) : null;
  }

  /** 인벤토리 목록의 물건. 목록이 아니면 null */
  private itemFrom(target: EventTarget | null) {
    const el = target instanceof Element ? target.closest<HTMLElement>('.slot[data-item]') : null;
    return el ? (el.dataset.item as ItemId) : null;
  }

  private onPointerDown(e: PointerEvent) {
    if (e.target instanceof Element && e.target.closest('.memo-slot')) {
      this.inventory.select(MEMO_SLOT);
      return;
    }
    const index = this.slotFrom(e.target);
    const item = this.itemFrom(e.target);
    if (index !== null) {
      const stack = this.inventory.slots[index];
      if (this.isOpen && stack) this.startDrag({ from: index }, stack.id, e);
      // 고른 칸을 한 번 더 누르면 R처럼 총은 재장전하고 가구는 돌리며(휴대폰에는 R 키가 없어서), 포션이면 마신다.
      else if (index === this.inventory.selected && stack && isPotion(stack.id)) this.onUsePotion?.();
      else if (index === this.inventory.selected) (this.onReselect ?? (() => this.inventory.rotateSelected()))();
      else this.inventory.select(index);
    } else if (item && this.isOpen) {
      this.startDrag({ item }, item, e);
    }
  }

  private startDrag(drag: Drag, id: ItemId, e: PointerEvent) {
    this.drag = drag;
    this.dragIcon.src = this.iconOf(id);
    this.dragIcon.hidden = false;
    this.moveDragIcon(e);
    this.render();
  }

  private moveDragIcon(e: PointerEvent) {
    if (this.drag === null) return;
    this.dragIcon.style.left = `${e.clientX}px`;
    this.dragIcon.style.top = `${e.clientY}px`;
  }

  private onPointerUp(e: PointerEvent) {
    const drag = this.drag;
    if (drag === null) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const to = this.slotFrom(target);
    this.cancelDrag();
    if ('from' in drag) {
      if (to !== null && to !== drag.from) this.inventory.move(drag.from, to);
      else if (to === drag.from) this.inventory.select(drag.from);
      else if (target?.closest('.panel')) this.inventory.clear(drag.from);
    } else if (to !== null) {
      this.inventory.put(to, drag.item);
    } else if (this.itemFrom(target) === drag.item) {
      // 끌지 않고 누르기만 했으면 지금 고른 단축키 칸에 넣는다.
      this.inventory.put(this.inventory.selected, drag.item);
    }
    this.render();
  }

  private cancelDrag() {
    this.drag = null;
    this.dragIcon.hidden = true;
  }

  /** 끌기를 멈추고 칸을 다시 그린다. 휴대폰에서 무기를 길게 눌러 정보를 띄웠을 때 손을 떼도 넣기·옮기기를 하지 않게 한다. */
  stopDrag() {
    if (this.drag === null) return;
    this.cancelDrag();
    this.render();
  }

  /** 지금 탭의 목록. 단축키 칸에 들어 있는 것은 칸 번호를 붙인다. */
  private renderBag() {
    for (const [id, button] of this.tabButtons) button.classList.toggle('chosen', id === this.tab);
    this.bag.replaceChildren();
    const memo = this.tab === 'memo';
    this.bag.hidden = memo;
    this.bagHint.hidden = memo;
    this.memoPane.hidden = !memo;
    if (this.tab === 'memo') {
      this.renderMemos?.(this.memoPane);
      return;
    }
    for (const id of this.inventory.catalog(this.tab)) {
      const cell = element('slot', this.bag);
      cell.dataset.item = id;
      cell.title = this.inventory.nameOf(id);
      const icon = element('slot-icon', cell, 'img') as HTMLImageElement;
      icon.draggable = false;
      icon.alt = '';
      icon.src = this.iconOf(id);
      const at = this.inventory.hotbarIndexOf(id);
      if (at >= 0) {
        cell.classList.add('in-hotbar');
        element('slot-key', cell).textContent = String(at + 1);
      }
      if (isPotion(id)) element('slot-count', cell).textContent = String(this.potionCount(id));
      if (isSeed(id)) element('slot-count', cell).textContent = String(this.seedCount(id));
      const gear = this.inventory.gearOf(id);
      if (gear) element('slot-count', cell).textContent = `+${gear.level}`;
    }
  }

  private render() {
    this.bagButton.classList.toggle('chosen', this.isOpen);
    for (const [id, button] of this.viewButtons) button.classList.toggle('chosen', id === this.view);
    this.infoPane.hidden = this.view !== 'info';
    this.bagPane.hidden = this.view !== 'bag';
    if (this.isOpen && this.view === 'bag') this.renderBag();
    this.refreshInfo();
    this.slots.forEach((slot, i) => {
      const stack = this.inventory.slots[i];
      const icon = slot.querySelector<HTMLImageElement>('.slot-icon')!;
      const count = slot.querySelector<HTMLElement>('.slot-count')!;
      const dragged = this.drag !== null && 'from' in this.drag && this.drag.from === i;
      icon.hidden = !stack || dragged;
      if (stack) icon.src = this.iconOf(stack.id);
      // 블록은 무제한이고 무기는 하나라 개수를 쓰지 않는다. 포션과 씨앗은 가진 개수, 대장간 무기는 강화 단계를 쓴다.
      count.textContent = !stack ? '' : this.countText(stack.id);
      slot.classList.toggle('selected', i === this.inventory.selected);
    });
    this.memoSlot.classList.toggle('selected', this.inventory.memoSelected);
    if (this.inventory.memoSelected) {
      this.pickedName.textContent = '메모장';
      this.pickedIcon.hidden = false;
      this.pickedIcon.src = this.memoIcon;
      return;
    }
    const selected = this.inventory.selectedStack;
    this.showPickedName();
    this.pickedIcon.hidden = !selected;
    if (selected) this.pickedIcon.src = this.iconOf(selected.id);
  }

  private iconOf(id: ItemId) {
    return this.icons[this.inventory.iconKey(id)];
  }

  private countText(id: ItemId) {
    if (isPotion(id)) return String(this.potionCount(id));
    if (isSeed(id)) return String(this.seedCount(id));
    const gear = this.inventory.gearOf(id);
    return gear ? `+${gear.level}` : '';
  }

  private showPickedName() {
    if (this.inventory.memoSelected) return;
    const selected = this.inventory.selectedStack;
    const name = selected ? this.inventory.nameOf(selected.id) : '빈손';
    this.pickedName.textContent = this.ammo ? `${name} · ${this.ammo}` : name;
  }

  /** 든 총의 남은 탄. 쏠 때와 재장전이 끝날 때만 부른다. 총이 아니면 null */
  setAmmo(text: string | null) {
    if (text === this.ammo) return;
    this.ammo = text;
    this.showPickedName();
  }
}

/**
 * 정보 칸(190px)의 EXP 글과 레벨 글은 숫자를 줄여 쓰지 않아(2026-11-18 사용자 "Lv. 15,000 이렇게 표기로") 모험 레벨 B안(2026-11-21, 판 레벨 120억대)에서
 * 한 줄을 넘는다. 글자 수로 글씨를 줄여 한 줄에 넣는다(제가 정한 것). 글이 바뀔 때만 부른다.
 * - EXP: 12px에서 8px까지. tabular-nums 굵은 12px 글에서 잰 한 글자 폭 약 0.52em로, 막대 안 186px에 들어가는 크기(37자 9px, 41자 8px).
 * - 레벨: CSS 19px 그대로 11자(999,999,999)까지, 13자 17px, 15자 15px, 그보다 길면 14px("모험" 표와 "Lv. "를 더해 190px 안).
 */
const EXP_FIT = 354;
function expFontSize(text: string) {
  const size = Math.max(8, Math.min(12, Math.floor(EXP_FIT / Math.max(1, text.length))));
  return size === 12 ? '' : `${size}px`;
}
function levelFontSize(num: string) {
  const n = num.length;
  return n <= 11 ? '' : n <= 13 ? '17px' : n <= 15 ? '15px' : '14px';
}
