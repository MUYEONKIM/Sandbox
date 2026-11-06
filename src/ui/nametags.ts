import { MAX_HP } from '../config';
import { element } from './dom';

const BUBBLE_MS = 4000;

interface Tag {
  root: HTMLElement;
  bubble: HTMLElement;
  hp: HTMLElement | null;
  progress: HTMLElement | null;
  timer: number;
}

/** 캐릭터 머리 위에 뜨는 닉네임과 말풍선 */
export class NameTags {
  private readonly tags = new Map<string, Tag>();

  constructor(private readonly parent: HTMLElement) {}

  add(id: string, nickname: string, portal = false) {
    if (this.tags.has(id)) return;
    const root = element('player-tag', this.parent);
    const bubble = element('bubble', root);
    bubble.hidden = true;
    element(portal ? 'player-name portal-name' : 'player-name', root).textContent = nickname;
    const hp = portal ? null : element('player-hp-fill', element('player-hp', root));
    const progress = portal ? null : element('player-work-fill', element('player-work', root));
    if (progress) progress.parentElement!.hidden = true;
    this.tags.set(id, { root, bubble, hp, progress, timer: 0 });
  }

  setHp(id: string, hp: number) {
    const bar = this.tags.get(id)?.hp;
    if (bar) bar.style.width = `${(hp / MAX_HP) * 100}%`;
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

  remove(id: string) {
    const tag = this.tags.get(id);
    if (!tag) return;
    window.clearTimeout(tag.timer);
    tag.root.remove();
    this.tags.delete(id);
  }
}
