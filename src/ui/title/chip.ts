import { RICH_NAME, TITLE_ICON, TITLE_SHINE, titleGrade, type TitleGrade } from '../../game/titles';

/**
 * 칭호 칸(2026-11-28 칭호 꾸밈, title-look.md 3~6절): 이름표·채팅·명예의 전당·정보창 목록이 같이 쓴다.
 * 칸 안은 [아이콘][이름], 갑부가 함께 붙으면 뒤에 · [금화][갑부]. 색은 칸에 단 등급 class(tg-*)가 정한다(style.css).
 */
export interface TitleChip {
  /** 단 칭호 id. 이름만 받는 곳(채팅·명예의 전당)은 칭호 표에서 찾고, 모르면 null */
  id: string | null;
  /** 단 칭호 이름. 없으면 null */
  name: string | null;
  rich: boolean;
}

/** 칸의 등급: 단 칭호 등급, 갑부만이면 갑부. 이름은 있는데 id를 모르면 null(등급 없는 옅은 금색, 제가 정한 것) */
export function chipGrade({ id, name, rich }: TitleChip): TitleGrade | null {
  if (name) return id ? titleGrade(id) : null;
  return rich ? 'rich' : null;
}

/** 등급 아이콘(18px, big이면 정보창 카드의 36px) */
export function titleIcon(grade: TitleGrade, big = false) {
  const i = document.createElement('i');
  i.className = `title-icon ti-${TITLE_ICON[grade]}${big ? ' big' : ''}`;
  return i;
}

function text(className: string, value: string) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = value;
  return span;
}

/** 칸 안 [아이콘][이름] 노드들. 등급을 모르면 아이콘 없이 */
function titleNodes(grade: TitleGrade | null, name: string): Node[] {
  return grade ? [titleIcon(grade), text('title-text', name)] : [text('title-text', name)];
}

/** 이름 뒤에 붙는 [금화][갑부] 칸(색은 갑부 등급) */
export function richNodes(className = 'title-rich') {
  const box = document.createElement('span');
  box.className = `${className} tg-rich`;
  box.append(titleIcon('rich'), text('title-text', RICH_NAME));
  return box;
}

/**
 * box의 class를 base + 등급으로 바꾸고 안을 칭호 칸으로 채운다. 칭호가 없으면 비운다.
 * shine이면 윗등급(갑부가 붙은 칸 포함)에 반짝임 띠 class를 단다(이름표만). 등급을 돌려준다.
 */
export function paintTitleChip(box: HTMLElement, base: string, chip: TitleChip, shine = false) {
  const grade = chipGrade(chip);
  const top = grade !== null && (TITLE_SHINE.has(grade) || chip.rich);
  box.className = base + (grade ? ` tg-${grade}` : '') + (shine && top ? ' shine' : '');
  const nodes: Node[] = [];
  if (chip.name) {
    nodes.push(...titleNodes(grade, chip.name));
    if (chip.rich) nodes.push(text('title-sep', ' · '), richNodes());
  } else if (chip.rich) {
    nodes.push(...titleNodes('rich', RICH_NAME));
  }
  box.replaceChildren(...nodes);
  return grade;
}
