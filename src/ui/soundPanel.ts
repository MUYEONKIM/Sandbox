import { sound } from '../sound/engine';
import type { SoundSettings } from '../sound/settings';
import { element } from './dom';
import './soundPanel.css';

/**
 * 소리 설정(2026-11-27). 계정 줄의 '소리' 버튼이 그 아래에 작은 판을 연다(자리는 에이전트가 정함:
 * 계정 줄은 마을·모험·휴대폰 어디서나 늘 보이고 접히지 않는다. I 창은 모험에서 스텟 판이 되어 못 쓴다).
 * 판에는 이름표와 숫자만 둔다(BGM, 효과음 크기 0~100, 끄기).
 */
export class SoundPanel {
  private readonly button: HTMLButtonElement;
  private readonly box: HTMLElement;
  private readonly mute: HTMLButtonElement;
  private readonly rows: { key: 'bgm' | 'sfx'; input: HTMLInputElement; value: HTMLElement }[] = [];

  constructor(account: HTMLElement) {
    account.classList.add('sound-host');
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'account-sound';
    account.insertBefore(this.button, account.querySelector('.account-signout'));
    this.button.addEventListener('click', () => this.toggle());

    this.box = element('sound-panel', account);
    this.box.hidden = true;
    for (const [key, label] of [
      ['bgm', 'BGM'],
      ['sfx', '효과음'],
    ] as const) {
      const row = element('sound-row', this.box, 'label');
      element('sound-label', row, 'span').textContent = label;
      const input = element('sound-range', row, 'input') as HTMLInputElement;
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.step = '1';
      const value = element('sound-value', row, 'span');
      input.addEventListener('input', () => sound.set({ [key]: Number(input.value) } as Partial<SoundSettings>));
      // 놓은 뒤 방향키가 다시 캐릭터를 움직이게 초점을 돌려준다.
      input.addEventListener('change', () => input.blur());
      this.rows.push({ key, input, value });
    }
    this.mute = element('sound-mute', this.box, 'button') as HTMLButtonElement;
    this.mute.type = 'button';
    this.mute.addEventListener('click', () => sound.set({ mute: !sound.state.mute }));

    // 판 밖을 누르면 닫는다.
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (!this.box.hidden && e.target instanceof Node && !this.box.contains(e.target) && !this.button.contains(e.target)) this.close();
      },
      { capture: true },
    );
    sound.onChange(() => this.show());
    this.show();
  }

  get isOpen() {
    return !this.box.hidden;
  }

  toggle() {
    this.box.hidden = !this.box.hidden;
    this.button.classList.toggle('chosen', !this.box.hidden);
  }

  close() {
    this.box.hidden = true;
    this.button.classList.remove('chosen');
  }

  private show() {
    const state = sound.state;
    this.button.textContent = state.mute ? '소리 꺼짐' : '소리';
    for (const { key, input, value } of this.rows) {
      if (input.value !== String(state[key])) input.value = String(state[key]);
      value.textContent = String(state[key]);
      input.disabled = state.mute;
    }
    this.mute.textContent = state.mute ? '켜기' : '끄기';
    this.mute.classList.toggle('chosen', state.mute);
  }
}
