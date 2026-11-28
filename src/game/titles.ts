/**
 * 칭호(2026-11-28, 기획 growth-1127.md 8-1~8-3, 랭킹 칭호 ranking-titles.md). 하나만 달고, 이름표·정보창·채팅·명예의 전당에 보인다.
 * 가진 칭호와 단 칭호는 서버(my_titles, set_title)가 정한다. 랭킹 칭호는 매시 정각에 서버가 다시 정하므로 그때 한 번 다시 읽는다.
 * 골드 1위 '갑부'(kind rich)는 칭호 칸을 쓰지 않고 단 칭호 옆에 늘 함께 보인다.
 */
export type TitleKind = 'forge' | 'rank' | 'rich';

export interface Title {
  id: string;
  name: string;
  kind: TitleKind;
  /** 모험 판 경험치(무기 1위 0.75) */
  exp: number;
  /** 모험 판 금화(모험 1~3위) */
  gold: number;
  /** 사람에게 받는 피해를 줄이는 몫(킬 1~3위) */
  cut: number;
}

/** 서버 my_titles의 답 */
export interface MyTitles {
  titles: Title[];
  worn: string | null;
  /** 최고 강화 기록 */
  best: number;
}

/** 이름표·채팅·명예의 전당의 칭호 글: "명장 · 갑부", 달지 않았으면 "갑부", 둘 다 없으면 빈 글(제가 정한 꼴, growth-1127.md 8-3) */
export function titleLabel(name: string | null, rich: boolean) {
  if (name && rich) return `${name} · 갑부`;
  return name ?? (rich ? '갑부' : '');
}

const pct = (value: number) => `${Math.round(value * 1000) / 10}%`;

/** 정보창 칭호 목록의 효과 숫자(ranking-titles.md 6장). 효과가 없으면 빈 글 */
export function titleEffect(title: Title) {
  if (title.exp > 0) return `모험 경험치 +${pct(title.exp)}`;
  if (title.gold > 0) return `판 금화 +${pct(title.gold)}`;
  if (title.cut > 0) return `사람에게 받는 피해 −${pct(title.cut)}`;
  return '';
}

/** 칭호 id 꼴(다른 사람이 접속 명단에 실어 보낸 값을 믿지 않고 본다) */
export const isTitleId = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9_]{1,40}$/.test(value);

/** 내 칭호와 칭호 이름 표. 바뀌면 onChange를 부른다. */
export class Titles {
  /** 모든 칭호의 이름(다른 사람 이름표의 칭호 id를 이름으로 바꿈). 접속할 때 한 번 읽는다. */
  private readonly names = new Map<string, string>();
  owned: Title[] = [];
  worn: string | null = null;
  best = 0;
  /** 서버 답을 한 번이라도 받았는지(처음 받은 것은 얻음·잃음 알림을 띄우지 않음) */
  loaded = false;
  private readonly listeners: (() => void)[] = [];

  setNames(rows: { id: string; name: string }[]) {
    for (const { id, name } of rows) this.names.set(id, name);
  }

  nameOf(id: string | null) {
    return id ? (this.names.get(id) ?? null) : null;
  }

  get rich() {
    return this.owned.some((t) => t.kind === 'rich');
  }

  get wornName() {
    return this.owned.find((t) => t.id === this.worn)?.name ?? null;
  }

  onChange(listener: () => void) {
    this.listeners.push(listener);
  }

  /** 서버 답으로 바꾸고 그 전과 견줘 얻은 것과 잃은 것을 돌려준다. */
  apply(mine: MyTitles) {
    const before = new Set(this.owned.map((t) => t.id));
    const after = new Set(mine.titles.map((t) => t.id));
    const gained = this.loaded ? mine.titles.filter((t) => !before.has(t.id)) : [];
    const lost = this.loaded ? this.owned.filter((t) => !after.has(t.id)) : [];
    for (const t of mine.titles) this.names.set(t.id, t.name);
    this.owned = mine.titles;
    this.worn = mine.worn;
    this.best = mine.best;
    this.loaded = true;
    this.changed();
    return { gained, lost };
  }

  setWorn(id: string | null) {
    this.worn = id;
    this.changed();
  }

  setBest(best: number) {
    if (best <= this.best) return;
    this.best = best;
    this.changed();
  }

  private changed() {
    for (const listener of this.listeners) listener();
  }
}
