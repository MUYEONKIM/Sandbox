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

  /** 이름 줄 내용을 바꾼다. 거래소 시세판이 가격이 바뀔 때 쓴다. */
  setLabel(id: string, ...nodes: (Node | string)[]) {
    this.tags.get(id)?.label.replaceChildren(...nodes);
  }

  setLevel(id: string, text: string) {
    const label = this.tags.get(id)?.level;
    if (label) label.textContent = text;
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
  float(id: string, text: string, kind: 'damage' | 'dodge') {
    const tag = this.tags.get(id);
    if (!tag) return;
    const label = element(`float-text ${kind}`, tag.root);
    label.textContent = text;
    label.addEventListener('animationend', () => label.remove());
  }

  remove(id: string) {
    const tag = this.tags.get(id);
    if (!tag) return;
    window.clearTimeout(tag.timer);
    tag.root.remove();
    this.tags.delete(id);
  }
}
