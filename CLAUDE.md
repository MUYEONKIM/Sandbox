# ITS SandBox

친구들끼리 천천히 오래 하는 웹 아이소메트릭 도트 샌드박스 RPG. Phaser 4 + TypeScript + Vite, 서버는 Supabase(인증, Postgres, Realtime), 배포는 GitHub Pages.

- 실제 사이트: https://muyeonkim.github.io/Sandbox/ (공개 저장소 MUYEONKIM/Sandbox, `main`에 푸시하면 배포된다)
- 실제 Supabase 프로젝트: `aodoapomrddwfamvwwzb`. 로컬은 Docker의 Supabase 스택이고 `.env.local`이 그쪽을 가리킨다.

## 일을 시작할 때

[docs/agent/status.md](docs/agent/status.md)를 먼저 읽는다: 지금 배포된 것, 실제 DB에 들어간 SQL, 사용자가 확인 중인 것, 미결정 사항.

## 사용자와 일하는 법

- 한국어로 답한다. 사용자는 기획자이고 결과를 직접 해 보고 판단한다.
- 커밋과 푸시는 사용자가 배포를 요청할 때만 한다. 배포할 때마다 게시판 공지의 업데이트 내역(`src/updates.ts`)에 이번 배포 항목을 덧붙인다. 배포가 끝나면 사용자가 직접 해 볼 **테스트 항목** 목록을 준다. 실제 사이트 로그인과 확인은 사용자가 한다(테스트 계정을 받아도 내가 비밀번호를 넣지 않는다).
- 문구: 자원, 장소, 안내 문구는 친구가 어이없어 웃을 위트를 살린다. 상점 아이템(무기, 도구)의 이름과 설명은 평범하게 쓴다. 애매하면 평범하게.
- 사용자가 맡기지 않은 세부(좌표, 크기, 기본값)는 내가 정하고 답에 "제가 정한 것"으로 밝힌다. 되돌리기 어렵거나 기획을 바꾸는 선택만 묻는다.
- **사용량 알림**: 배포할 때마다 `get_usage`로 본다. 대화 기억(컨텍스트)이 80%를 넘거나 주간 한도가 80%를 넘으면 사용자에게 바로 알리고, 다른 세션에 넘길 준비가 됐는지 말한다.
- **인계 준비**: 배포하거나 기획이 바뀔 때마다 `docs/agent/status.md`를 고쳐 둔다. 다른 세션이 이 문서들만 읽고 이어받을 수 있어야 한다.

## 되돌리기 어려운 것

- 로컬 DB는 `npx supabase migration up`으로만 바꾼다. `supabase db reset`은 사용자가 만든 로컬 `test` 계정을 지운다.
- 새 SQL이 필요한 변경은 사용자가 실제 DB의 SQL Editor에서 실행했다고 말한 뒤에 푸시한다. 먼저 푸시하면 실제 사이트가 깨진다.
- `art-source/`(원본 그림과 그림 생성 스크립트)는 커밋하지 않는다.
- `git add`에는 경로를 하나씩 쓰고, 커밋 전에 `git status`로 스테이징을 본다.

## 더 볼 문서

- [docs/agent/workflow.md](docs/agent/workflow.md): 로컬 실행과 시험, SQL 적용과 실제 DB 확인, 배포 순서. 코드를 바꾸거나 배포할 때.
- [docs/agent/game.md](docs/agent/game.md): 파일별 역할, 함께 바꿔야 하는 곳, 게임 규칙의 이유. 맵, 건물, 전투, 경제를 바꿀 때.
