import { element } from './dom';

/** 새 배포가 있는지 보는 간격 */
const CHECK_MS = 60_000;
/** 빌드한 index.html이 읽는 게임 코드 파일 이름. 배포마다 뒤의 해시가 바뀐다. */
const BUNDLE = /assets\/index-[\w-]+\.js/;

function bundleIn(html: string) {
  return BUNDLE.exec(html)?.[0] ?? null;
}

/**
 * 접속 중에 새 버전이 배포되면 화면 위에 "F5를 눌러 새로고침" 안내를 띄운다(2026-11-12 사용자 요청).
 * 1분마다, 그리고 탭으로 돌아올 때 index.html을 캐시 없이 다시 받아, 지금 돌고 있는 게임 코드 파일과 이름이 다르면 새 배포다.
 * 개발 서버에는 빌드 파일이 없어 보지 않는다.
 */
export function watchNewVersion(root: HTMLElement) {
  if (import.meta.env.DEV) return;
  const running = bundleIn(document.documentElement.innerHTML);
  if (!running) return;

  const banner = element('new-version', root);
  banner.hidden = true;
  element('new-version-text', banner, 'span').textContent = '새 버전이 배포되었습니다. F5를 눌러 새로고침해 주세요.';
  const reload = element('new-version-button', banner, 'button') as HTMLButtonElement;
  reload.type = 'button';
  reload.textContent = '새로고침';
  reload.addEventListener('click', () => location.reload());

  let found = false;
  const check = async () => {
    if (found) return;
    try {
      const response = await fetch(`./index.html?v=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return;
      const latest = bundleIn(await response.text());
      if (latest && latest !== running) {
        found = true;
        banner.hidden = false;
      }
    } catch {
      // 잠깐 끊긴 것이면 다음 확인 때 다시 본다.
    }
  };
  window.setInterval(() => void check(), CHECK_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
}
