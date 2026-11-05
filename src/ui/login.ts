import type { User } from '@supabase/supabase-js';
import { signIn, signUp } from '../net/auth';
import { element } from './dom';

const MIN_NICKNAME = 2;
const MAX_NICKNAME = 12;

function field(parent: HTMLElement, label: string, type: string, autocomplete: AutoFill) {
  const row = element('login-field', parent, 'label');
  element('login-label', row, 'span').textContent = label;
  const input = element('login-input', row, 'input') as HTMLInputElement;
  input.type = type;
  input.autocomplete = autocomplete;
  input.required = true;
  return { row, input };
}

/** 로그인 또는 회원가입이 끝나면 사용자를 돌려준다. */
export function showLogin(parent: HTMLElement): Promise<User> {
  return new Promise((resolve) => {
    const screen = element('login', parent);
    const form = element('login-panel', screen, 'form') as HTMLFormElement;
    element('login-title', form, 'h1').textContent = '아이소 샌드박스';

    const email = field(form, '이메일', 'email', 'email');
    const password = field(form, '비밀번호', 'password', 'current-password');
    password.input.minLength = 6;
    const nickname = field(form, `닉네임 (${MIN_NICKNAME}~${MAX_NICKNAME}자)`, 'text', 'off');
    nickname.input.minLength = MIN_NICKNAME;
    nickname.input.maxLength = MAX_NICKNAME;

    const message = element('login-message', form);
    const submit = element('login-submit', form, 'button') as HTMLButtonElement;
    submit.type = 'submit';
    const toggle = element('login-toggle', form, 'button') as HTMLButtonElement;
    toggle.type = 'button';

    let joining = false;
    const render = () => {
      nickname.row.hidden = !joining;
      nickname.input.required = joining;
      password.input.autocomplete = joining ? 'new-password' : 'current-password';
      submit.textContent = joining ? '회원가입' : '로그인';
      toggle.textContent = joining ? '이미 계정이 있습니다' : '처음이신가요? 회원가입';
      message.textContent = '';
    };
    render();
    email.input.focus();

    toggle.addEventListener('click', () => {
      joining = !joining;
      render();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      submit.disabled = true;
      message.textContent = '';
      try {
        const user = joining
          ? await signUp(email.input.value.trim(), password.input.value, nickname.input.value.trim())
          : await signIn(email.input.value.trim(), password.input.value);
        if (user) {
          screen.remove();
          resolve(user);
          return;
        }
        message.textContent = '메일함에서 확인 링크를 누른 뒤 로그인해 주세요.';
      } catch (error) {
        message.textContent = error instanceof Error ? error.message : '로그인하지 못했습니다.';
      }
      submit.disabled = false;
    });
  });
}
