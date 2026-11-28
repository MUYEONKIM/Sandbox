# 작업 순서

바꾸기 → 로컬 확인 → (SQL이 있으면) 사용자가 실제 DB에 실행 → 배포 → 실제 사이트 파일 확인 → 사용자에게 테스트 항목 전달. 단계마다 끝나는 조건을 지킨다.

## 1. 로컬 실행

- 로컬 Supabase: `npx supabase start` (Docker 컨테이너 `supabase_db_iso-sandbox`). `.env.local`이 로컬 스택을 가리킨다.
- 개발 서버: `npm run dev -- --host 127.0.0.1` (포트 5173). Claude 앱에서는 `preview_start`의 `iso-sandbox` 설정을 쓴다.
- Claude 앱의 브라우저 패널이 숨겨지면 `requestAnimationFrame`이 멈춰 이동과 맵 전환이 진행되지 않는다. 시험 전에 preview 패널을 표시한다. 바꾼 직후 첫 스크린숏은 예전 화면일 수 있다.
  - 패널을 보일 수 없으면 게임 시간을 손으로 돌린다. 걸음은 `game.loop.rawDelta`로 진행하므로 그 값도 같이 넣어야 한다(`GameScene.update`).
    ```js
    const g = sandbox.scene.game; let t = performance.now();
    const pump = async (ms) => { const end = t + ms; while (t < end) { t += 16.7; g.loop.rawDelta = 16.7; g.step(t, 16.7); await new Promise((r) => setTimeout(r, 0)); } };
    ```

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
- **실제 서버는 2026-11-25부터 이 PC의 자체 운영 Supabase다**(공식 docker compose, 컨테이너 `supabase-db`·`supabase-rest`·`supabase-auth`·`realtime-dev.supabase-realtime` 등, 개발용 로컬 스택 `supabase_*_iso-sandbox`와 따로). 밖에서는 Tailscale Funnel 주소 `https://its-sandbox.tailc69c42.ts.net`로 들어온다(`/auth/v1`, `/rest/v1`, `/realtime/v1`만 열림). 자세한 것은 코드 세션 4의 공유 노트 `self-host-plan.md`. 예전 Supabase 프로젝트 `aodoapomrddwfamvwwzb`는 일시 중지했고 한 달 동안 되돌리기용으로 둔다.
- 사용자에게 파일 경로를 주고 이 PC의 운영 관리 화면(Studio, `http://127.0.0.1:8100`) SQL Editor에서 실행해 달라고 한다. 되돌릴 수 없는 내용(표 삭제, 플레이어 위치 이동)은 미리 말한다.
- 실행 여부는 이 PC에서 운영 DB를 직접 읽어 확인한다(읽기만, 바꾸지 않는다). 확인 쿼리는 파일 맨 위 것을 쓴다.
  ```bash
  docker exec supabase-db psql -U postgres -c "begin read only;" -c "<확인 쿼리>" -c "rollback;"
  ```
  운영 DB에 쓰는 일(SQL 실행, 값 고치기)은 사용자가 관리 화면에서 한다. 개발용 로컬 DB는 지금처럼 `npx supabase migration up`으로만 바꾼다(컨테이너 이름이 다르니 헷갈리지 않는다).
- SQL이 있는 배포마다 확인 쿼리에 권한 다섯 칸을 붙인다(`20261128410000_profiles_grants.sql` 머리말에서 복사: profiles 고칠 칸 네 개, 그 밖엔 읽기만, anon 권한 없음, RLS 꺼진 표·뷰에 쓰기 권한 없음, 쓰기 정책 셋). 2026-11-28에 운영 profiles가 표 전체 권한으로 열려 있던 것을 펫 확인 쿼리가 찾았다(자체 운영으로 옮기며 기본 권한이 다시 붙음). 새 표는 Supabase 기본값 때문에 anon·authenticated에 모든 권한이 붙으니 마이그레이션에서 `revoke all`부터 한다. 화면 쓰기 정책을 새로 더하면 다섯째 칸의 값도 고친다.
- 바깥 주소로 확인할 때의 공개 키는 운영 `prod\.env`의 `ANON_KEY`(= `gh variable list`의 `VITE_SUPABASE_KEY`)다. 문서와 노트에는 키 값을 적지 않는다.
  ```bash
  curl -s "https://its-sandbox.tailc69c42.ts.net/rest/v1/<표>?select=<열>&limit=1" -H "apikey: <공개 키>"
  ```
  함수는 `curl -s -X POST ".../rest/v1/rpc/<함수>" -H "apikey: <공개 키>" -H "Content-Type: application/json" -d '{<인자>}'`.
  `42501`이면 있음(공개 키에 권한 없음), `42703` 열 없음, `PGRST205` 표 없음, `PGRST202` 함수 없음. 공개 키에 읽기 권한이 있고 행 보안이 걸러 내는 표는 오류 없이 `[]`가 온다.

## 4. 배포 (끝: 실행이 success이고 실제 사이트 번들에 새 문구가 있음)

1. 게시판 공지 "업데이트 내역"(`src/updates.ts`의 `UPDATES`) 맨 아래에 이번 배포 항목을 하나 더한다(사용자 요청 2026-11-12, 배포마다 빠짐없이). `date`는 배포하는 날, `items`는 플레이어가 화면에서 알아볼 변화를 한 줄씩 쓴다. 인계 문서만 고친 배포처럼 게임에 변화가 없으면 더하지 않는다.
2. `npm run build`가 통과한다.
3. `git add <경로들>` → `git status --short`로 바뀐 파일이 모두 스테이징됐는지 본다(`art-source/`는 빼고).
4. 커밋 메시지는 영어로, 마지막 줄에 `Co-Authored-By: <그 세션의 모델 이름> <noreply@anthropic.com>`(세션이 알려 주는 서명 줄을 그대로 쓴다).
5. `git push origin main`
6. `gh run list --commit <전체 SHA>`로 실행을 찾고 `gh run watch <id> --exit-status`. 짧은 SHA로는 찾지 못한다.
7. 실제 사이트 확인: `index.html`에서 `assets/*.js`를 찾아 새 문구가 있는지 `grep`, 새 그림은 `curl`로 받아 `cmp`.
8. `docs/agent/status.md`를 고치고(배포 커밋, 테스트 항목, 새 결정) 사용자에게 테스트 항목을 준다. 테스트 항목은 사용자가 화면에서 해 볼 수 있는 동작과 기대 결과로 쓴다.
9. 사용량을 본다: `mcp__ccd_session_mgmt__get_usage`(지연 도구라 ToolSearch `select:mcp__ccd_session_mgmt__get_usage`로 먼저 불러옴). 대화 기억이나 주간 한도가 80%를 넘으면 사용자에게 알린다.

GitHub Pages의 버릇:
- 새 푸시가 진행 중인 배포를 취소한다(`cancel-in-progress`).
- `updating_pages`가 10초~10분 걸리고 10분을 넘기면 취소된다. 취소된 커밋은 `gh run rerun`이 거부되므로 빈 커밋을 푸시한다.
- `index.html`은 10분 캐시된다. 사용자가 예전 화면을 보면 `Ctrl+Shift+R`을 안내한다.
- `public/`의 그림도 10분 캐시되고 이름이 배포해도 그대로다. 그래서 코드에서 그림 주소는 꼭 `src/assetUrl.ts`의 `assetUrl()`로 만든다(빌드마다 바뀌는 `?v=` 표시를 붙임). 2026-11-13에 가구 그림을 바꿔 배포했을 때 브라우저가 옛 그림을 새 좌표로 잘라 가구 아이콘이 깨졌다.

## 5. 그림

- `public/sprites`의 PNG는 `src/art/sprites.ts`의 `NAMES`에 넣어야 읽힌다. 건물은 칸 세로줄 단위로 잘려 그려지므로 그림 너비와 바닥 칸 수가 맞아야 한다(`GameScene.showBuilding`).
- 내가 만든 PNG는 `art-source/` 아래의 Node 스크립트로 만든다(`art-source/tower/make-props.cjs` 등, PNG 쓰기는 같은 폴더의 `png.cjs`). 스크립트는 커밋하지 않는다.
- 아이티공간 층 그림(바닥, 벽, 문)은 PNG가 아니라 `src/art/interior.ts`가 실행 중에 그린다.
- 웹에서 그림을 내려받을 때는 파일 이름, 출처, 크기를 말하고 사용자 허락을 받는다.
