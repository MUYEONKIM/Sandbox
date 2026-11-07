-- 행복 아파트: 가입하면 방이 하나씩 생기고, 새 플레이어는 자기 방에서 시작한다.
-- 한 동은 5층, 한 층은 5세대라서 25번째 방까지 101동이고 그다음은 102동이다. 호수는 101~105, 201~205 ... 501~505다.
create sequence public.room_numbers;

create table public.rooms (
  owner uuid primary key references auth.users (id) on delete cascade,
  dong integer not null check (dong >= 101),
  ho integer not null check (ho between 101 and 505),
  created_at timestamptz not null default now(),
  unique (dong, ho)
);

alter table public.rooms enable row level security;

revoke all on public.rooms from anon, authenticated;
grant select on public.rooms to authenticated;

create policy "players read own room" on public.rooms
  for select to authenticated using (owner = auth.uid());

create function public.give_room(player uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  n integer := nextval('public.room_numbers') - 1;
  unit integer := n % 25;
begin
  insert into public.rooms (owner, dong, ho)
  values (player, 101 + n / 25, (unit / 5 + 1) * 100 + unit % 5 + 1);
end;
$$;

revoke execute on function public.give_room(uuid) from public, anon, authenticated;

-- 이미 있는 계정도 가입한 순서대로 방을 받는다. 위치는 그대로 둔다.
select public.give_room(id) from public.profiles order by created_at;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  picked text := new.raw_user_meta_data ->> 'skin';
begin
  insert into public.profiles (id, nickname, skin)
  values (
    new.id,
    new.raw_user_meta_data ->> 'nickname',
    case when picked ~ '^[0-6]$' then picked::smallint end
  );
  perform public.give_room(new.id);
  return new;
end;
$$;

-- 새 플레이어는 자기 방 가운데에서 태어난다.
alter table public.profiles
  alter column map set default 'room',
  alter column x set default 23,
  alter column y set default 22;
