# 작업 순서

바꾸기 → 로컬 확인 → (SQL이 있으면) 사용자가 실제 DB에 실행 → 배포 → 실제 사이트 파일 확인 → 사용자에게 테스트 항목 전달. 단계마다 끝나는 조건을 지킨다.

## 1. 로컬 실행

- 로컬 Supabase: `npx supabase start` (Docker 컨테이너 `supabase_db_iso-sandbox`). `.env.local`이 로컬 스택을 가리킨다.
- 개발 서버: `npm run dev -- --host 127.0.0.1` (포트 5173). Claude 앱에서는 `preview_start`의 `iso-sandbox` 설정을 쓴다.
- Claude 앱의 브라우저 패널이 숨겨지면 `requestAnimationFrame`이 멈춰 이동과 맵 전환이 진행되지 않는다. 시험 전에 preview 패널을 표시한다. 바꾼 직후 첫 스크린숏은 예전 화면일 수 있다.

## 2. 바꾼 뒤 확인 (끝: 타입 검사 통과, 바꾼 동작을 브라우저에서 직접 봄, 시험 계정 정리)

1. `npx tsc --noEmit`
2. SQL을 바꿨으면 `npx supabase migration up`
3. 브라우저(창 크기 1024×768, 휴대폰은 mobile 프리셋)에서 시험 계정으로 가입한다. 이메일은 항상 `look-<무작위>@example.test`로 만들어 정리할 때 한 번에 지운다.
   ```js
   const { supabase } = await import('/src/net/supabase.ts');
   const tag = Math.random().toString(36).slice(2, 8);
   await supabase.auth.signUp({ email: `look-${tag}@example.test`, password: crypto.randomUUID(), options: { data: { nickname: `lk${tag}`, skin: 2 } } });
   location.reload();
   ```
4. 개발 모드에는 `window.sandbox`(`scene`, `inventory`, `hud`, `chat`, `session`, `economy`, `office`, `shop`, `castle`, `fame`, `elevator`)가 있다.
   - 순간이동: `s.me.teleport({x, y}); s.me.sync?.()`. 포탈은 걸어서 밟아야 타므로 옆 칸에서 `s.beginStep(s.me.tile, {dx, dy})`.
   - 맵 이동: `s.travel('tower7')`
   - 방향키 누르고 있기: `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp' }))` 뒤 `keyup`
   - 휴대폰 터치: 브라우저 패널의 클릭은 마우스로 들어가므로 캔버스에 터치 이벤트를 직접 보낸다. 좌표는 화면(뷰포트) 픽셀이다.
     ```js
     const tap = (x, y) => {
       const canvas = document.querySelector('#game canvas');
       const touch = new Touch({ identifier: 7, target: canvas, clientX: x, clientY: y, pageX: x, pageY: y });
       const send = (type, touches) =>
         canvas.dispatchEvent(new TouchEvent(type, { touches, targetTouches: touches, changedTouches: [touch], bubbles: true, cancelable: true }));
       send('touchstart', [touch]);
       setTimeout(() => send('touchend', []), 80);
     };
     ```
5. 서버 규칙은 롤백되는 트랜잭션으로 시험한다. 가짜 사용자를 넣으면 가입 트리거가 프로필을 만든다.
   ```sql
   begin;
   insert into auth.users (id, email, raw_user_meta_data, aud, role)
   values ('00000000-0000-0000-0000-00000000a001', 'look-a@example.test', '{"nickname":"lookA"}', 'authenticated', 'authenticated');
   select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}', true);
   set local role authenticated;
   -- 시험할 insert, rpc 호출. 실패를 기대하는 줄은 savepoint로 감싼다.
   reset role;
   rollback;
   ```
   `docker exec -i supabase_db_iso-sandbox psql -U postgres < 파일.sql`
6. 정리: `await sandbox.session.flush(); localStorage.clear(); location.reload()`, 그다음 `docker exec supabase_db_iso-sandbox psql -U postgres -tAc "delete from auth.users where email like 'look-%@example.test'"`. 로컬 프로필이 사용자의 `test` 하나만 남았는지 본다. 창 크기를 desktop으로 되돌린다.
7. `npm run build`

## 3. SQL이 있는 변경 (끝: 사용자가 실행했다고 말하고, 확인 가능한 것은 확인함)

- 새 파일 `supabase/migrations/<YYYYMMDDHHMMSS>_<이름>.sql`. 함수를 고칠 때는 이전 마이그레이션의 본문을 복사해 필요한 줄만 바꾸고, `diff`로 바뀐 줄만 확인한다.
- 사용자에게 파일 경로를 주고 Supabase SQL Editor에서 실행해 달라고 한다. 되돌릴 수 없는 내용(표 삭제, 플레이어 위치 이동)은 미리 말한다.
- 실행 여부는 공개 키로 일부만 확인할 수 있다. 공개 키는 `gh variable list`의 `VITE_SUPABASE_KEY`다.
  ```bash
  curl -s "https://aodoapomrddwfamvwwzb.supabase.co/rest/v1/<표>?select=<열>&limit=1" -H "apikey: <공개 키>"
  ```
  함수는 `curl -s -X POST ".../rest/v1/rpc/<함수>" -H "apikey: <공개 키>" -H "Content-Type: application/json" -d '{<인자>}'`.
  `42501`이면 있음(공개 키에 권한 없음), `42703` 열 없음, `PGRST205` 표 없음, `PGRST202` 함수 없음. 공개 키에 읽기 권한이 있고 행 보안이 걸러 내는 표는 오류 없이 `[]`가 온다. 정책과 함수 본문은 확인할 수 없으므로 "확인 못 함"으로 보고한다.

## 4. 배포 (끝: 실행이 success이고 실제 사이트 번들에 새 문구가 있음)

1. `npm run build`가 통과한다.
2. `git add <경로들>` → `git status --short`로 바뀐 파일이 모두 스테이징됐는지 본다(`art-source/`는 빼고).
3. 커밋 메시지는 영어로, 마지막 줄에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
4. `git push origin main`
5. `gh run list --commit <전체 SHA>`로 실행을 찾고 `gh run watch <id> --exit-status`. 짧은 SHA로는 찾지 못한다.
6. 실제 사이트 확인: `index.html`에서 `assets/*.js`를 찾아 새 문구가 있는지 `grep`, 새 그림은 `curl`로 받아 `cmp`.
7. `docs/agent/status.md`를 고치고(배포 커밋, 테스트 항목, 새 결정) 사용자에게 테스트 항목을 준다. 테스트 항목은 사용자가 화면에서 해 볼 수 있는 동작과 기대 결과로 쓴다.
8. 사용량을 본다: `mcp__ccd_session_mgmt__get_usage`(지연 도구라 ToolSearch `select:mcp__ccd_session_mgmt__get_usage`로 먼저 불러옴). 대화 기억이나 주간 한도가 80%를 넘으면 사용자에게 알린다.

GitHub Pages의 버릇:
- 새 푸시가 진행 중인 배포를 취소한다(`cancel-in-progress`).
- `updating_pages`가 10초~10분 걸리고 10분을 넘기면 취소된다. 취소된 커밋은 `gh run rerun`이 거부되므로 빈 커밋을 푸시한다.
- `index.html`은 10분 캐시된다. 사용자가 예전 화면을 보면 `Ctrl+Shift+R`을 안내한다.

## 5. 그림

- `public/sprites`의 PNG는 `src/art/sprites.ts`의 `NAMES`에 넣어야 읽힌다. 건물은 칸 세로줄 단위로 잘려 그려지므로 그림 너비와 바닥 칸 수가 맞아야 한다(`GameScene.showBuilding`).
- 내가 만든 PNG는 `art-source/` 아래의 Node 스크립트로 만든다(`art-source/tower/make-props.cjs` 등, PNG 쓰기는 같은 폴더의 `png.cjs`). 스크립트는 커밋하지 않는다.
- 아이티공간 층 그림(바닥, 벽, 문)은 PNG가 아니라 `src/art/interior.ts`가 실행 중에 그린다.
- 웹에서 그림을 내려받을 때는 파일 이름, 출처, 크기를 말하고 사용자 허락을 받는다.
