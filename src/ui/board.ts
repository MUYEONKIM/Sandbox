import { NOTICE_TITLE, UPDATES } from '../updates';
import { element } from './dom';

export interface BoardPost {
  id: number;
  nickname: string;
  body: string;
  createdAt: Date;
  /** 내가 쓴 글이면 지울 수 있다 */
  mine: boolean;
}

export type WriteResult = 'ok' | 'too_fast' | 'failed';

interface BoardActions {
  load(): Promise<BoardPost[] | null>;
  write(body: string): Promise<WriteResult>;
  remove(id: number): Promise<boolean>;
}

/** 글 한 개의 최대 길이. 서버 write_post의 300과 같다. */
const POST_MAX = 300;
/** 창이 열려 있는 동안 새 글을 다시 읽는 간격 */
const REFRESH_MS = 15_000;
const MINUTE_MS = 60_000;

/** "방금", "5분 전", "3시간 전", 하루가 넘으면 "11월 12일" */
function timeAgo(date: Date) {
  const minutes = Math.floor((Date.now() - date.getTime()) / MINUTE_MS);
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}시간 전`;
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

/** "2026-11-12" → "2026.11.12" */
const dotDate = (date: string) => date.replaceAll('-', '.');

/**
 * 시작마을 게시판 창. 맨 위에 공지(업데이트 내역, src/updates.ts) 한 개가 고정되고,
 * 그 아래 누구나 쓴 글이 새 글부터 보인다. 글쓰기, 길이, 간격 검사는 서버 함수가 한다.
 */
export class BoardWindow {
  private readonly root: HTMLElement;
  private readonly noticeBody: HTMLElement;
  private readonly input: HTMLTextAreaElement;
  private readonly counter: HTMLElement;
  private readonly submit: HTMLButtonElement;
  private readonly message: HTMLElement;
  private readonly list: HTMLElement;
  private refreshTimer = 0;
  private sending = false;

  constructor(
    parent: HTMLElement,
    private readonly actions: BoardActions,
  ) {
    this.root = element('office board', parent);
    this.root.hidden = true;
    element('office-title', this.root).textContent = '게시판';
    element('office-subtitle', this.root).textContent = '아무 말이나 남기세요. 아무도 책임지지 않습니다.';

    this.noticeBody = this.addNotice();

    const form = element('board-form', this.root);
    this.input = element('board-input', form, 'textarea') as HTMLTextAreaElement;
    this.input.maxLength = POST_MAX;
    this.input.rows = 3;
    this.input.placeholder = `아무 말이나 써 보세요 (${POST_MAX}자까지, Ctrl+Enter로 올리기)`;
    const row = element('board-form-row', form);
    this.counter = element('board-counter', row);
    this.submit = element('board-submit', row, 'button') as HTMLButtonElement;
    this.submit.type = 'button';
    this.submit.textContent = '올리기';
    this.submit.addEventListener('click', () => void this.send());
    this.input.addEventListener('input', () => this.renderForm());
    this.input.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void this.send();
      } else if (e.key === 'Escape') {
        this.close();
      }
    });
    this.message = element('board-message', this.root);

    element('office-section', this.root).textContent = '모두의 글';
    this.list = element('board-posts', this.root);

    const close = element('office-close', this.root, 'button') as HTMLButtonElement;
    close.type = 'button';
    close.textContent = '나가기 (Esc)';
    close.addEventListener('click', () => this.close());
    this.renderForm();
  }

  /** 공지 글 하나: 배포마다 덧붙인 업데이트 내역이 오래된 것부터 이어진다. 열면 맨 아래(최신)가 보인다. */
  private addNotice() {
    const notice = element('board-notice', this.root);
    const head = element('board-notice-head', notice);
    element('board-notice-badge', head, 'span').textContent = '공지';
    element('board-notice-title', head, 'span').textContent = NOTICE_TITLE;
    element('board-notice-date', head, 'span').textContent = `마지막 ${dotDate(UPDATES[UPDATES.length - 1].date)}`;

    const body = element('board-notice-body', notice);
    UPDATES.forEach((update, index) => {
      const entry = element(index === UPDATES.length - 1 ? 'board-update latest' : 'board-update', body);
      element('board-update-date', entry).textContent = dotDate(update.date);
      const items = element('board-update-items', entry, 'ul');
      for (const item of update.items) element('board-update-item', items, 'li').textContent = item;
    });
    return body;
  }

  get isOpen() {
    return !this.root.hidden;
  }

  open() {
    this.root.hidden = false;
    this.root.scrollTop = 0;
    this.noticeBody.scrollTop = this.noticeBody.scrollHeight;
    this.say('');
    void this.refresh();
    window.clearInterval(this.refreshTimer);
    this.refreshTimer = window.setInterval(() => void this.refresh(), REFRESH_MS);
  }

  close() {
    this.root.hidden = true;
    this.input.blur();
    window.clearInterval(this.refreshTimer);
  }

  private say(text: string) {
    this.message.textContent = text;
  }

  private renderForm() {
    const length = this.input.value.trim().length;
    this.counter.textContent = `${this.input.value.length} / ${POST_MAX}`;
    this.submit.disabled = this.sending || length === 0;
  }

  private async send() {
    const body = this.input.value.trim();
    if (!body || this.sending) return;
    this.sending = true;
    this.renderForm();
    try {
      const result = await this.actions.write(body);
      if (result === 'ok') {
        this.input.value = '';
        this.say('');
        await this.refresh();
      } else {
        this.say(result === 'too_fast' ? '글은 10초에 한 번 올릴 수 있습니다. 숨 한 번 쉬고 다시 올려 주세요.' : '글을 올리지 못했습니다. 잠시 후 다시 해 주세요.');
      }
    } finally {
      this.sending = false;
      this.renderForm();
    }
  }

  private async refresh() {
    const posts = await this.actions.load();
    if (this.root.hidden) return;
    if (!posts) {
      if (!this.list.childElementCount) this.list.textContent = '글을 불러오지 못했습니다.';
      return;
    }
    this.list.replaceChildren();
    if (!posts.length) {
      element('board-empty', this.list).textContent = '아직 아무 말도 없습니다. 첫 아무말의 주인공이 되어 보세요.';
      return;
    }
    for (const post of posts) this.addPost(post);
  }

  private addPost(post: BoardPost) {
    const item = element(post.mine ? 'board-post mine' : 'board-post', this.list);
    const head = element('board-post-head', item);
    element('board-post-author', head, 'span').textContent = post.nickname;
    element('board-post-time', head, 'span').textContent = timeAgo(post.createdAt);
    if (post.mine) {
      const remove = element('board-post-delete', head, 'button') as HTMLButtonElement;
      remove.type = 'button';
      remove.textContent = '지우기';
      remove.addEventListener('click', async () => {
        remove.disabled = true;
        if (await this.actions.remove(post.id)) item.remove();
        else remove.disabled = false;
      });
    }
    element('board-post-body', item).textContent = post.body;
  }
}
