import type { DungeonInfo, MonsterKind } from '../game/dungeon';
import type { DungeonId } from '../game/maps';
import { element } from './dom';
import { goldText } from '../game/gold';

interface DungeonActions {
  onGo(dungeon: DungeonId): void;
  /** 던전마다 지금 있는 사람. 실패하면 null */
  loadRoster(): Promise<{ dungeon: string; nickname: string }[] | null>;
}

/** 창이 열려 있는 동안 던전 인원을 다시 읽는 간격 */
const ROSTER_REFRESH_MS = 5000;

/**
 * 던전 입장 창(2026-11-15 사용자 요청 "작업장처럼 어느 던전으로 갈지 선택, 누가 있는지"). 노동청 창과 같은 모양이다.
 * 던전마다 나오는 몬스터와 한 마리를 잡을 때 받는 골드, 지금 있는 사람의 수와 닉네임이 보인다.
 */
export class DungeonWindow {
  private readonly root: HTMLElement;
  private readonly rosters = new Map<string, HTMLElement>();
  private rosterTimer = 0;

  constructor(parent: HTMLElement, dungeons: DungeonInfo[], monsters: MonsterKind[], private readonly actions: DungeonActions) {
    this.root = element('office dungeon', parent);
    this.root.hidden = true;

    element('office-title', this.root).textContent = '던전 입장';
    element('office-subtitle', this.root).textContent = '몬스터를 잡으면 골드와 경험치를 받습니다. 같은 던전에 있는 사람과 같은 몬스터를 봅니다.';

    const places = element('office-places', this.root);
    if (!dungeons.length) element('office-empty', places).textContent = '던전 정보를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.';
    for (const dungeon of dungeons) {
      const button = element('office-place', places, 'button') as HTMLButtonElement;
      button.type = 'button';
      element('office-place-name', button).textContent = dungeon.name;
      element('office-place-blurb', button).textContent = dungeon.blurb;
      const kinds = monsters.filter((m) => m.dungeon === dungeon.id);
      element('office-place-rate', button).textContent = kinds.map((m) => `${m.name} ${goldText(m.gold)}`).join(' · ');
      this.rosters.set(dungeon.id, element('office-place-roster', button));
      button.addEventListener('click', () => actions.onGo(dungeon.id));
    }
    element('office-note', this.root).textContent = '인원은 최근 2분 안에 그 던전에서 움직였거나 몬스터를 잡은 사람입니다. 나가는 포탈 앞은 몬스터가 오지 않는 쉼터입니다.';

    const close = element('office-close', this.root, 'button') as HTMLButtonElement;
    close.type = 'button';
    close.textContent = '나가기 (Esc)';
    close.addEventListener('click', () => this.close());
  }

  get isOpen() {
    return !this.root.hidden;
  }

  open() {
    this.root.hidden = false;
    void this.showRoster();
    window.clearInterval(this.rosterTimer);
    this.rosterTimer = window.setInterval(() => void this.showRoster(), ROSTER_REFRESH_MS);
  }

  close() {
    this.root.hidden = true;
    window.clearInterval(this.rosterTimer);
  }

  private async showRoster() {
    const rows = await this.actions.loadRoster();
    if (this.root.hidden) return;
    for (const [dungeon, line] of this.rosters) {
      if (!rows) {
        line.textContent = '인원을 불러오지 못했습니다';
        continue;
      }
      const names = rows.filter((row) => row.dungeon === dungeon).map((row) => row.nickname);
      line.textContent = names.length ? `지금 ${names.length}명 · ${names.join(', ')}` : '지금 아무도 없습니다';
      line.classList.toggle('busy', names.length > 0);
    }
  }
}
