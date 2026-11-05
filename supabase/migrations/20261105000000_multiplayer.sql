-- 플레이어 프로필: 닉네임, 마지막 위치, 인벤토리
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null unique check (char_length(nickname) between 2 and 12),
  x integer not null default 23 check (x between 0 and 45),
  y integer not null default 23 check (y between 0 and 45),
  inventory jsonb,
  created_at timestamptz not null default now()
);

-- 맵에 설치된 블록. 한 칸에는 블록 하나만 놓을 수 있다.
create table public.blocks (
  x integer not null check (x between 0 and 45),
  y integer not null check (y between 0 and 45),
  block text not null check (char_length(block) <= 32),
  placed_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  placed_at timestamptz not null default now(),
  primary key (x, y)
);

alter table public.profiles enable row level security;
alter table public.blocks enable row level security;

revoke all on public.profiles, public.blocks from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (x, y, inventory) on public.profiles to authenticated;
grant select, insert, delete on public.blocks to authenticated;

create policy "players read own profile" on public.profiles
  for select to authenticated using (id = auth.uid());

create policy "players update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "players read blocks" on public.blocks
  for select to authenticated using (true);

create policy "players place blocks" on public.blocks
  for insert to authenticated with check (placed_by = auth.uid());

create policy "players remove blocks" on public.blocks
  for delete to authenticated using (true);

-- 회원가입할 때 프로필을 만든다. 닉네임이 겹치면 가입 자체가 실패한다.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, new.raw_user_meta_data ->> 'nickname');
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 채팅은 서버 함수로만 보낸다. 닉네임을 서버가 채우므로 다른 사람을 사칭할 수 없다.
create function public.send_chat(message text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  author text;
  body text := btrim(message);
begin
  if body = '' or char_length(body) > 100 then
    raise exception 'invalid message';
  end if;

  select nickname into strict author from public.profiles where id = auth.uid();

  perform realtime.send(
    jsonb_build_object('id', auth.uid(), 'author', author, 'text', body),
    'chat',
    'world-chat',
    true
  );
end;
$$;

revoke execute on function public.send_chat(text) from public, anon;
grant execute on function public.send_chat(text) to authenticated;

-- 실시간 채널은 로그인한 플레이어만 쓴다. world-chat은 읽기만 가능하다.
create policy "players read world channels" on realtime.messages
  for select to authenticated
  using (realtime.topic() in ('world', 'world-chat'));

create policy "players write world channel" on realtime.messages
  for insert to authenticated
  with check (realtime.topic() = 'world');

alter publication supabase_realtime add table public.blocks;
