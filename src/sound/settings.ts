/**
 * 소리 설정(2026-11-27 사용자 "모든 부분에 효과음, bgm"). 브라우저 localStorage에 계정 구분 없이 남는다.
 * 크기는 0~100 정수, 기본값 BGM 50·효과음 80(sound-plan.md 2절이 권한 0.5·0.8).
 */
export interface SoundSettings {
  bgm: number;
  sfx: number;
  mute: boolean;
}

const KEY = 'sound-settings';
export const DEFAULT_SOUND: SoundSettings = { bgm: 50, sfx: 80, mute: false };

const level = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : fallback;

export function loadSoundSettings(): SoundSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<SoundSettings> | null;
    if (!saved || typeof saved !== 'object') return { ...DEFAULT_SOUND };
    return { bgm: level(saved.bgm, DEFAULT_SOUND.bgm), sfx: level(saved.sfx, DEFAULT_SOUND.sfx), mute: saved.mute === true };
  } catch {
    return { ...DEFAULT_SOUND };
  }
}

export function saveSoundSettings(settings: SoundSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // 저장소를 못 쓰면 이번 접속 동안만 남는다.
  }
}
