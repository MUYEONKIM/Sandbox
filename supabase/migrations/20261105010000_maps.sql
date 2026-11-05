-- 맵을 여러 개로 나눈다. 기존 데이터는 평원(plains) 맵에 남는다.
alter table public.profiles
  add column map text not null default 'plains' check (char_length(map) <= 32);

alter table public.blocks
  add column map text not null default 'plains' check (char_length(map) <= 32);

alter table public.blocks drop constraint blocks_pkey;
alter table public.blocks add primary key (map, x, y);

grant update (map) on public.profiles to authenticated;

-- 실시간 채널을 맵마다 나눈다: world:plains, world:desert ...
drop policy "players read world channels" on realtime.messages;
drop policy "players write world channel" on realtime.messages;

create policy "players read world channels" on realtime.messages
  for select to authenticated
  using (realtime.topic() = 'world-chat' or realtime.topic() like 'world:%');

create policy "players write world channel" on realtime.messages
  for insert to authenticated
  with check (realtime.topic() like 'world:%');
