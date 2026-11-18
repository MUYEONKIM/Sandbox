import { popLevel } from './levelUpAnim';
import { element } from './dom';

const BUBBLE_MS = 4000;

export type TagKind = 'player' | 'portal' | 'sign' | 'ticker';

interface Tag {
  root: HTMLElement;
  /** 이름 줄 */
  label: HTMLElement;
  /** 플레이어 이름표의 이름 줄. 악업에 따라 빨개진다. */
  name: HTMLElement | null;
  wanted: HTMLElement | null;
  bubble: HTMLElement;
  level: HTMLElement | null;
  hp: HTMLElement | null;
  progress: HTMLElement | null;
  timer: number;
}

/** 캐릭터 머리 위에 뜨는 닉네임과 말풍선, 포탈과 건물의 이름표 */
export class NameTags {
  private readonly tags = new Map<string, Tag>();
  /** 플레이어 id → 악업(현상범 명단). 이름표를 새로 만들 때도 쓴다. */
  private karma: ReadonlyMap<string, number> = new Map();

  constructor(private readonly parent: HTMLElement) {}

  add(id: string, nickname: string, kind: TagKind = 'player') {
    if (this.tags.has(id)) return;
    const isPlayer = kind === 'player';
    const root = element('player-tag', this.parent);
    const bubble = element('bubble', root);
    bubble.hidden = true;
    const name = element(isPlayer ? 'player-name' : `player-name ${kind}-name`, root);
    const level = isPlayer ? element('player-level', name, 'span') : null;
    name.append(nickname);
    const wanted = isPlayer ? element('player-wanted', name, 'span') : null;
    if (wanted) wanted.textContent = ' (현상범)';
    const hp = isPlayer ? element('player-hp-fill', element('player-hp', root)) : null;
    const progress = isPlayer ? element('player-work-fill', element('player-work', root)) : null;
    if (progress) progress.parentElement!.hidden = true;
    const tag = { root, label: name, name: isPlayer ? name : null, wanted, bubble, level, hp, progress, timer: 0 };
    this.tags.set(id, tag);
    this.paintKarma(id, tag);
  }

  /** 현상범 명단이 바뀌면 이름 색과 "(현상범)"을 다시 칠한다(2026-11-12 사용자 요청). */
  setKarma(karma: ReadonlyMap<string, number>) {
    this.karma = karma;
    for (const [id, tag] of this.tags) this.paintKarma(id, tag);
  }

  private paintKarma(id: string, { name, wanted }: Tag) {
    if (!name || !wanted) return;
    const karma = this.karma.get(id) ?? 0;
    for (let k = 1; k <= 5; k++) name.classList.toggle(`karma-${k}`, k === karma);
    wanted.hidden = karma === 0;
  }

  /**
   * 포탈 이름표를 두 줄로 쓴다(모험 입구 맵 지역 포탈, 2026-11-18 디자인 세션 시안). 이길 확률 색은 없앴다(2026-11-18 사용자).
   * 글이 그대로면 DOM을 고치지 않는다.
   */
  setLines(id: string, first: string, second: string) {
    const label = this.tags.get(id)?.label;
    if (!label) return;
    const key = `${first}|${second}`;
    if (label.dataset.lines === key) return;
    label.dataset.lines = key;
    label.replaceChildren();
    element('', label, 'span').textContent = first;
    element('portal-line2', label, 'span').textContent = second;
  }

  /** 플레이어 이름표의 닉네임을 바꾼다(닉네임 변경권, 2026-11-13). 같으면 그대로 둔다. */
  setName(id: string, nickname: string) {
    const name = this.tags.get(id)?.name;
    const text = name && [...name.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
    if (text && text.textContent !== nickname) text.textContent = nickname;
  }

  /** 모험 전투 중인 사람의 이름표 위에 작은 도트 칼을 띄운다(2026-11-17, 시안 6×5 2배). 처음 켤 때 한 번 그린다. */
  setFighting(id: string, on: boolean) {
    const tag = this.tags.get(id);
    if (!tag?.name) return;
    let sword = tag.root.querySelector<HTMLCanvasElement>('.player-fight');
    if (!sword && on) {
      // 6×5 칼에 검은 테두리 1칸을 둘러 8×7로 그린다(풀밭 위에서도 보이게).
      sword = document.createElement('canvas');
      sword.className = 'player-fight';
      sword.width = 8;
      sword.height = 7;
      const g = sword.getContext('2d')!;
      const pixels: [number, number, string][] = [
        [5, 0, '#e8eef4'],
        [4, 1, '#e8eef4'],
        [3, 2, '#e8eef4'],
        [2, 3, '#f2cf6a'],
        [1, 2, '#f2cf6a'],
        [3, 4, '#f2cf6a'],
        [1, 4, '#8a5a3c'],
        [0, 4, '#5a3a24'],
      ];
      g.fillStyle = '#1b120d';
      for (const [x, y] of pixels) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!dx !== !dy) g.fillRect(x + 1 + dx, y + 1 + dy, 1, 1);
      for (const [x, y, c] of pixels) {
        g.fillStyle = c;
        g.fillRect(x + 1, y + 1, 1, 1);
      }
      tag.root.prepend(sword);
    }
    if (sword) sword.hidden = !on;
  }

  /** 이름 줄 내용을 바꾼다. 거래소 시세판이 가격이 바뀔 때 쓴다. */
  setLabel(id: string, ...nodes: (Node | string)[]) {
    this.tags.get(id)?.label.replaceChildren(...nodes);
  }

  /** 이름표 레벨 글. run이면 모험 판 레벨(연보라 .adv-run, 2026-11-18). 글이 비면 레벨 칸을 숨긴다. */
  setLevel(id: string, text: string, run = false) {
    const label = this.tags.get(id)?.level;
    if (!label) return;
    if (label.textContent !== text) label.textContent = text;
    label.classList.toggle('adv-run', run);
    label.hidden = text === '';
  }

  /** 레벨 업 때 레벨 글을 튀어 오르게 한다(정보 칸 숫자와 같은 CSS .lv-pop, levelUpAnim.ts). */
  popLevel(id: string) {
    const label = this.tags.get(id)?.level;
    if (label) popLevel(label);
  }

  setHp(id: string, hp: number, max: number) {
    const bar = this.tags.get(id)?.hp;
    if (bar) bar.style.width = `${Math.min(hp / max, 1) * 100}%`;
  }

  /** 작업 진행도(0~1)를 표시한다. null이면 숨긴다. */
  setProgress(id: string, ratio: number | null) {
    const bar = this.tags.get(id)?.progress;
    if (!bar) return;
    bar.parentElement!.hidden = ratio === null;
    if (ratio !== null) bar.style.width = `${Math.min(ratio, 1) * 100}%`;
  }

  /** 화면 좌표 (x, y) 위로 옮긴다. */
  place(id: string, x: number, y: number) {
    const tag = this.tags.get(id);
    if (!tag) return;
    tag.root.style.left = `${x}px`;
    tag.root.style.top = `${y}px`;
  }

  say(id: string, text: string) {
    const tag = this.tags.get(id);
    if (!tag) return;
    tag.bubble.textContent = text;
    tag.bubble.hidden = false;
    window.clearTimeout(tag.timer);
    tag.timer = window.setTimeout(() => {
      tag.bubble.hidden = true;
    }, BUBBLE_MS);
  }

  /** 머리 위로 글자가 떠올랐다가 사라진다. */
  float(id: string, text: string, kind: 'damage' | 'dodge' | 'heal') {
    const tag = this.tags.get(id);
    if (!tag) return;
    const label = element(`float-text ${kind}`, tag.root);
    label.textContent = text;
    label.addEventListener('animationend', () => label.remove());
  }

  /** 전쟁터에서 빛 밖에 있는 사람의 이름표를 숨긴다. */
  /** 전쟁터 손전등 빛 밖의 사람: 이름표를 흐리게 한다(2026-11-18, 에이전트가 정함). 바뀔 때만 DOM을 고친다. */
  setDim(id: string, dim: boolean) {
    const root = this.tags.get(id)?.root;
    if (!root || root.classList.contains('dim') === dim) return;
    root.classList.toggle('dim', dim);
  }

  setHidden(id: string, hidden: boolean) {
    const tag = this.tags.get(id);
    if (tag) tag.root.style.visibility = hidden ? 'hidden' : '';
  }

  remove(id: string) {
    const tag = this.tags.get(id);
    if (!tag) return;
    window.clearTimeout(tag.timer);
    tag.root.remove();
    this.tags.delete(id);
  }
}
