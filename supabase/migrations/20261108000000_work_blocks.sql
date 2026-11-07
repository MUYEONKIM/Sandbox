-- 노동청에서 가는 작업장 4곳(채석장, 벌목장, 채집장, 낚시터)에도 블록을 놓을 수 있다.
-- 칸 범위는 blocks 표의 검사(0~45)가 막고, 놓을 수 있는 칸인지는 클라이언트가 본다.
-- 공격은 원래 작업장에서도 되므로 hit_player는 그대로다.
drop policy "players place blocks" on public.blocks;

create policy "players place blocks" on public.blocks
  for insert to authenticated with check (
    placed_by = auth.uid()
    and map in ('tower4', 'tower7', 'tower8', 'rooftop', 'quarry', 'logging', 'gathering', 'fishing')
  );
