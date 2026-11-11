/**
 * 탭이 숨거나 창을 내려도 멈추지 않는 시계. 브라우저는 숨은 탭의 화면 갱신(requestAnimationFrame)을 멈추고
 * 일반 타이머도 크게 늦추지만, 워커 안의 타이머는 그대로 돌아서 그 신호로 작업을 이어 간다.
 * 워커를 못 만드는 브라우저에서는 일반 타이머로 대신한다. 정지 함수를 돌려준다.
 */
export function startTicker(ms: number, tick: () => void) {
  try {
    const source = `setInterval(() => postMessage(0), ${ms});`;
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = () => tick();
    return () => worker.terminate();
  } catch {
    const timer = window.setInterval(tick, ms);
    return () => window.clearInterval(timer);
  }
}
