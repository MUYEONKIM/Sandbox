import { NOTICE_TITLE, UPDATES } from '../updates';
import { element } from './dom';
import { Modal } from './modal';

/** 한 번에 보여 줄 업데이트 항목 수. 더 밀린 것은 게시판 공지에서 본다. */
const MAX_SHOWN = 3;

/**
 * 접속하거나 새로고침했을 때 아직 안 본 업데이트 내역을 창으로 띄운다(2026-11-13 사용자 요청).
 * 본 개수는 이 브라우저의 localStorage에 사람마다 남긴다. 처음 들어온 사람에게는 가장 최근 항목만 보인다.
 */
export function showWhatsNew(root: HTMLElement, playerId: string) {
  const key = `seen-updates:${playerId}`;
  let seen: number | null = null;
  try {
    const saved = localStorage.getItem(key);
    if (saved !== null && Number.isFinite(Number(saved))) seen = Number(saved);
  } catch {
    // 저장소를 못 쓰는 브라우저면 매번 가장 최근 항목만 보인다.
  }
  const total = UPDATES.length;
  if (seen !== null && seen >= total) return;

  const from = seen === null ? total - 1 : Math.max(seen, total - MAX_SHOWN);
  const fresh = UPDATES.slice(from).reverse();
  const modal = new Modal(root, 'whats-new', '자리 비운 사이 바뀐 것');
  const list = element('whats-new-list', modal.box);
  // 같은 날 배포가 여러 번이면 날짜 아래에 한 목록으로 모은다.
  let ul: HTMLElement | null = null;
  let lastDate = '';
  for (const { date, items } of fresh) {
    if (!ul || date !== lastDate) {
      element('whats-new-date', list).textContent = date;
      ul = element('whats-new-items', list, 'ul');
      lastDate = date;
    }
    for (const item of items) element('', ul, 'li').textContent = item;
  }
  const older = from - (seen ?? from);
  element('whats-new-more', modal.box).textContent =
    older > 0 ? `이보다 앞선 ${older}건은 게시판 공지 "${NOTICE_TITLE}"에서 볼 수 있습니다.` : `지난 내역은 게시판 공지 "${NOTICE_TITLE}"에 다 있습니다.`;
  modal.button('확인', () => undefined, true);
  modal.whenClosed(() => {
    try {
      localStorage.setItem(key, String(total));
    } catch {
      // 못 남기면 다음에 또 보인다.
    }
  });
}
