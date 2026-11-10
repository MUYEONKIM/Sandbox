-- 블록을 위로 쌓는다(2026-11-09). z는 쌓인 높이이고 0이 바닥이다. 한 칸에 다섯 개(0~4)까지 쌓는다.
-- 상한은 클라이언트 config.ts의 MAX_STACK과 같다. 기존 블록은 모두 z 0이 된다. 다시 실행해도 된다.

alter table public.blocks
  add column if not exists z integer not null default 0 check (z between 0 and 4);

alter table public.blocks drop constraint if exists blocks_pkey;
alter table public.blocks add primary key (map, x, y, z);

-- 놓기: 바닥(z 0)이거나 바로 아래에 블록이 있어야 한다. 어떤 블록 위에 쌓을 수 있는지는 클라이언트가 본다.
drop policy if exists "players place blocks" on public.blocks;
create policy "players place blocks" on public.blocks
  for insert to authenticated with check (
    placed_by = auth.uid()
    and map in ('tower4', 'tower7', 'tower8', 'rooftop', 'quarry', 'logging', 'gathering', 'fishing')
    and (
      z = 0
      or exists (
        select 1 from public.blocks below
        where below.map = blocks.map and below.x = blocks.x and below.y = blocks.y and below.z = blocks.z - 1
      )
    )
  );

-- 회수: 맨 위 블록만 뺄 수 있다. 가운데를 빼면 위 블록이 떠 버린다.
drop policy if exists "players remove blocks" on public.blocks;
create policy "players remove blocks" on public.blocks
  for delete to authenticated using (
    not exists (
      select 1 from public.blocks above
      where above.map = blocks.map and above.x = blocks.x and above.y = blocks.y and above.z = blocks.z + 1
    )
  );

notify pgrst, 'reload schema';
