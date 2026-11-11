import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined;

export const isConfigured = Boolean(url && key);

/**
 * 실시간 연결의 유지 신호를 워커에서 보낸다. 브라우저는 숨은 탭의 타이머를 늦추는데, 그러면 연결이 끊겨
 * 다른 탭에서 작업 중인 사람이 남에게 안 보일 수 있다. 워커 스크립트는 라이브러리 안에 들어 있다.
 */
export const supabase = createClient(url || 'http://localhost', key || 'unset', { realtime: { worker: true } });
