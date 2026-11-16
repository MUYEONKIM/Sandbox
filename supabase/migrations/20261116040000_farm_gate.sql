-- 농장 울타리 입구 칸에는 블록을 놓지 못한다(2026-11-16). 사용자: 입구 칸 블록 금지를 서버 정책에도 넣는다.
-- 설계: 디자인 세션 farm-decor.md 2-3의 6번.
--
-- 농장 구획 25개의 네 변 가운데 2칸(3·4번째 칸)이 울타리 입구다. 입구 바로 안쪽 땅 칸(구획마다 8칸, 모두 200칸)에
-- 블록을 놓으면 입구가 닫힐 수 있어서, 이 칸에 새로 놓는 것을 막는다. 땅은 그대로 사고팔고 심을 수 있다.
-- farm_is_gate는 src/game/farmLayout.ts의 isGate와 같아야 한다.
-- 블록 놓기 정책 "players place blocks"의 마지막 정의는 20261115020000_farm.sql 5장이다.
--   농장 조건에 "and not public.farm_is_gate(blocks.x, blocks.y)"만 더해 통째로 다시 만든다. 나머지 조건은 그대로다.
-- 이미 입구 칸에 놓인 블록은 지우지 않는다. 막는 것은 새로 놓는 것뿐이다(놓인 블록은 PM이 확인 SQL로 따로 본다).
-- 다시 실행해도 된다(create or replace, drop policy if exists).
--
-- 실행한 뒤 확인(읽기만 한다). 네 값이 차례로 true, true, false, 200이어야 한다:
--   select public.farm_is_gate(4, 2), public.farm_is_gate(2, 4), public.farm_is_gate(3, 3),
--     (select count(*) from generate_series(0, 45) as x, generate_series(0, 45) as y where public.farm_is_gate(x, y));
-- 정책이 바뀌었는지(읽기만 한다). with_check에 farm_is_gate가 들어 있어야 한다:
--   select with_check from pg_policies where schemaname = 'public' and tablename = 'blocks' and policyname = 'players place blocks';

create or replace function public.farm_is_gate(px integer, py integer) returns boolean
language sql immutable set search_path = ''
as $$
  select public.farm_is_plot(px, py) and (
    ((px - 2) % 8 in (2, 3) and (py - 2) % 8 in (0, 5))
    or ((py - 2) % 8 in (2, 3) and (px - 2) % 8 in (0, 5))
  );
$$;

drop policy if exists "players place blocks" on public.blocks;
create policy "players place blocks" on public.blocks for insert to authenticated
with check (
  placed_by = auth.uid()
  and (
    z = 0
    or exists (
      select 1 from public.blocks as below
      where below.map = blocks.map and below.x = blocks.x and below.y = blocks.y and below.z = blocks.z - 1
    )
  )
  and (
    map <> 'farm'
    or (
      exists (select 1 from public.farm_plots as f where f.x = blocks.x and f.y = blocks.y and f.owner = auth.uid())
      and not public.farm_is_gate(blocks.x, blocks.y)
    )
  )
);
