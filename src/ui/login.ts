import type { User } from '@supabase/supabase-js';
import { spriteUrl } from '../art/sprites';
import { TEAM_SIZE } from '../config';
import { signIn, signUp } from '../net/auth';
import { element } from './dom';

const MIN_NICKNAME = 2;
const MAX_NICKNAME = 12;

/** team.png의 한 칸을 화면에 그리는 크기와 줄마다 놓인 칸 수 */
const SKIN_W = 44;
const SKIN_H = 80;
const SKIN_COLUMNS = 4;
/** 캐릭터 한 명이 차지하는 칸 수 */
const SKIN_FRAMES = 2;

/** 캐릭터 고르기. 고른 번호를 돌려주는 함수와 줄 전체를 돌려준다. */
function skinPicker(parent: HTMLElement) {
  const row = element('login-field', parent);
  element('login-label', row, 'span').textContent = '캐릭터';
  const list = element('login-skins', row);
  let picked = 0;

  const buttons = Array.from({ length: TEAM_SIZE }, (_, skin) => {
    const button = element('login-skin', list, 'button') as HTMLButtonElement;
    button.type = 'button';
    button.setAttribute('aria-label', `캐릭터 ${skin + 1}`);
    const frame = skin * SKIN_FRAMES;
    const face = element('login-skin-face', button);
    face.style.backgroundImage = `url(${spriteUrl('team')})`;
    face.style.backgroundPosition = `${-(frame % SKIN_COLUMNS) * SKIN_W}px ${-Math.floor(frame / SKIN_COLUMNS) * SKIN_H}px`;
    button.addEventListener('click', () => pick(skin));
    return button;
  });

  const pick = (skin: number) => {
    picked = skin;
    buttons.forEach((button, index) => button.setAttribute('aria-pressed', String(index === skin)));
  };
  pick(0);

  return { row, picked: () => picked };
}

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
    element('login-title', form, 'h1').textContent = 'ITS SandBox';

    const email = field(form, '이메일', 'email', 'email');
    const password = field(form, '비밀번호', 'password', 'current-password');
    password.input.minLength = 6;
    const nickname = field(form, `닉네임 (${MIN_NICKNAME}~${MAX_NICKNAME}자)`, 'text', 'off');
    nickname.input.minLength = MIN_NICKNAME;
    nickname.input.maxLength = MAX_NICKNAME;
    const skin = skinPicker(form);

    const message = element('login-message', form);
    const submit = element('login-submit', form, 'button') as HTMLButtonElement;
    submit.type = 'submit';
    const toggle = element('login-toggle', form, 'button') as HTMLButtonElement;
    toggle.type = 'button';

    let joining = false;
    const render = () => {
      nickname.row.hidden = !joining;
      nickname.input.required = joining;
      skin.row.hidden = !joining;
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
          ? await signUp(email.input.value.trim(), password.input.value, nickname.input.value.trim(), skin.picked())
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
