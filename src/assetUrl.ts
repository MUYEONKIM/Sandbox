/** vite.config.ts가 빌드할 때마다 새로 정하는 값 */
declare const __BUILD_ID__: string;

/**
 * public 폴더 파일(그림)의 주소. 게임 코드 파일과 달리 이름이 배포해도 그대로라, 실제 사이트가 주는 캐시 10분 동안
 * 브라우저가 옛 그림을 쓴다. 그러면 새 코드가 옛 그림을 새 좌표로 잘라 가구가 깨져 보였다(2026-11-13 사용자 보고).
 * 그래서 배포마다 바뀌는 표시를 주소 뒤에 붙인다.
 */
export function assetUrl(path: string) {
  return `${path}?v=${__BUILD_ID__}`;
}
