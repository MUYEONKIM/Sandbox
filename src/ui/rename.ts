import { element } from './dom';
import { Modal } from './modal';

/** 닉네임 길이. 서버 profiles.nickname의 검사(2~12자), 가입 창(login.ts)과 같다. */
const MIN_NICKNAME = 2;
const MAX_NICKNAME = 12;

/**
 * 닉네임 바꾸기 창(2026-11-13 사용자 요청 "닉네임 변경권"). I 창 정보창의 '닉네임 바꾸기'로 연다.
 * change는 서버에 바꾸기를 요청하고, 못 바꾸면 까닭 문구를, 바꾸면 null을 돌려준다.
 */
export function openRenameDialog(root: HTMLElement, current: string, tickets: number, change: (name: string) => Promise<string | null>) {
  const modal = new Modal(root, 'rename', '닉네임 바꾸기');
  element('modal-note', modal.box).textContent =
    `지금 닉네임은 ${current}입니다. 바꾸면 변경권 1장을 씁니다(가진 변경권 ${tickets.toLocaleString()}장).`;
  const input = element('rename-input', modal.box, 'input') as HTMLInputElement;
  input.type = 'text';
  input.autocomplete = 'off';
  input.maxLength = MAX_NICKNAME;
  input.placeholder = `새 닉네임 (${MIN_NICKNAME}~${MAX_NICKNAME}자)`;
  const error = element('modal-error', modal.box);
  modal.button('취소', () => undefined);
  const ok = modal.button(
    '바꾸기',
    async () => {
      const name = input.value.trim();
      if (name.length < MIN_NICKNAME || name.length > MAX_NICKNAME) {
        error.textContent = `닉네임은 ${MIN_NICKNAME}~${MAX_NICKNAME}자로 적어 주세요.`;
        return false;
      }
      if (name === current) {
        error.textContent = '지금 닉네임과 같습니다.';
        return false;
      }
      const fail = await change(name);
      if (fail) error.textContent = fail;
      return fail ? false : undefined;
    },
    true,
  );
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') ok.click();
  });
  window.setTimeout(() => input.focus(), 0);
}
