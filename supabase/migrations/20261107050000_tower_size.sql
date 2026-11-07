-- 4, 7, 8층과 옥상 바닥을 넓혔다. 블록은 이 네 맵에만 놓을 수 있다.
-- 칸 범위는 blocks 표의 검사(0~45)가 막고, 바닥 안인지는 클라이언트가 본다.
-- 그래서 바닥 크기를 다시 바꿔도 이 정책은 그대로 둔다.
drop policy "players place blocks" on public.blocks;

create policy "players place blocks" on public.blocks
  for insert to authenticated with check (
    placed_by = auth.uid()
    and map in ('tower4', 'tower7', 'tower8', 'rooftop')
  );
