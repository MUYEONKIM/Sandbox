-- 아이티공간 1층 카페(tower1)에도 블록을 놓게 한다. 1층은 여전히 공격이 막힌 비무장지대다.
-- 놓기 정책만 맵 목록에 tower1을 더해 다시 만든다(아래 블록이 있어야 쌓는 조건은 그대로). 다시 실행해도 된다.
drop policy if exists "players place blocks" on public.blocks;
create policy "players place blocks" on public.blocks
  for insert to authenticated with check (
    placed_by = auth.uid()
    and map in ('tower1', 'tower4', 'tower7', 'tower8', 'rooftop', 'quarry', 'logging', 'gathering', 'fishing')
    and (z = 0 or exists (select 1 from public.blocks below
      where below.map = blocks.map and below.x = blocks.x and below.y = blocks.y and below.z = blocks.z - 1)));

notify pgrst, 'reload schema';
