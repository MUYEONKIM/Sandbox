-- 땅에 놓는 메모와 골드(2026-11-13 사용자 요청).
-- 메모: 0번 칸 메모장으로 글을 써서 선 자리에 놓는다. 누가 그 칸에서 F로 주우면 땅에서 사라지고 주운 사람의 메모가 된다.
--       주운 메모는 인벤토리에서 다시 읽고 다른 곳에 놓을 수 있다.
-- 골드: 인벤토리의 '버리기'로 선 자리에 놓는다. 누구든 F로 주우면 그 사람 골드가 된다.
-- 땅의 것(ground_items)은 모두 읽을 수 있고 Realtime으로 나타나고 사라진다.
-- 메모 글(memos)은 표를 직접 읽을 수 없고, 주울 때 pick_up이 돌려주거나 들고 있는 사람이 my_memos로 읽는다.

create table public.memos (
  id bigint generated always as identity primary key,
  author uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 200),
  -- 들고 있는 사람. 땅에 있으면 null이다.
  holder uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index memos_holder on public.memos (holder);

create table public.ground_items (
  id bigint generated always as identity primary key,
  map text not null check (char_length(map) <= 32),
  x integer not null check (x between 0 and 99),
  y integer not null check (y between 0 and 99),
  -- 메모면 memo, 골드면 amount 하나만 있다.
  memo bigint unique references public.memos (id) on delete cascade,
  amount integer check (amount > 0),
  dropped_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((memo is null) <> (amount is null))
);

create index ground_items_map on public.ground_items (map);
create index ground_items_dropped_by on public.ground_items (dropped_by);

alter table public.memos enable row level security;
alter table public.ground_items enable row level security;
revoke all on public.memos, public.ground_items from anon, authenticated;
grant select on public.ground_items to authenticated;

create policy "players see ground items" on public.ground_items
  for select to authenticated using (true);

alter publication supabase_realtime add table public.ground_items;

-- 한 사람이 땅에 둘 수 있는 것(메모와 골드 합쳐) 수. 넘으면 'too many'.
create or replace function public.ground_room_left(player uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select count(*) < 20 from public.ground_items g where g.dropped_by = player;
$$;

revoke execute on function public.ground_room_left(uuid) from public, anon, authenticated;

-- 메모를 써서 지금 선 칸(x, y)에 놓는다. map은 화면이 아는 지금 맵이고, 서버의 맵과 다르면 'wrong map'.
create or replace function public.drop_memo(body text, map text, x integer, y integer) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  trimmed text := btrim(coalesce(drop_memo.body, ''));
  new_memo bigint;
  item public.ground_items%rowtype;
begin
  select * into strict me from public.profiles p where p.id = auth.uid() for update;
  if me.map is distinct from drop_memo.map then
    raise exception 'wrong map';
  end if;
  if char_length(trimmed) not between 1 and 200 then
    raise exception 'bad memo';
  end if;
  if not public.ground_room_left(me.id) then
    raise exception 'too many';
  end if;
  insert into public.memos (author, body) values (me.id, trimmed) returning id into new_memo;
  insert into public.ground_items (map, x, y, memo, dropped_by)
  values (me.map, drop_memo.x, drop_memo.y, new_memo, me.id)
  returning * into item;
  return to_jsonb(item);
end;
$$;

-- 들고 있던 메모를 지금 선 칸에 다시 놓는다.
create or replace function public.place_memo(memo bigint, map text, x integer, y integer) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  item public.ground_items%rowtype;
begin
  select * into strict me from public.profiles p where p.id = auth.uid() for update;
  if me.map is distinct from place_memo.map then
    raise exception 'wrong map';
  end if;
  if not public.ground_room_left(me.id) then
    raise exception 'too many';
  end if;
  update public.memos m set holder = null where m.id = place_memo.memo and m.holder = me.id;
  if not found then
    raise exception 'not your memo';
  end if;
  insert into public.ground_items (map, x, y, memo, dropped_by)
  values (me.map, place_memo.x, place_memo.y, place_memo.memo, me.id)
  returning * into item;
  return to_jsonb(item);
end;
$$;

-- 골드를 amount만큼 지금 선 칸에 버린다. 돌려주는 것은 놓인 것(item)과 남은 골드(gold).
create or replace function public.drop_gold(amount integer, map text, x integer, y integer) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  item public.ground_items%rowtype;
begin
  if drop_gold.amount is null or drop_gold.amount < 1 then
    raise exception 'bad amount';
  end if;
  select * into strict me from public.profiles p where p.id = auth.uid() for update;
  if me.map is distinct from drop_gold.map then
    raise exception 'wrong map';
  end if;
  if me.gold < drop_gold.amount then
    raise exception 'not enough gold';
  end if;
  if not public.ground_room_left(me.id) then
    raise exception 'too many';
  end if;
  update public.profiles p set gold = p.gold - drop_gold.amount where p.id = me.id;
  insert into public.ground_items (map, x, y, amount, dropped_by)
  values (me.map, drop_gold.x, drop_gold.y, drop_gold.amount, me.id)
  returning * into item;
  return jsonb_build_object('item', to_jsonb(item), 'gold', me.gold - drop_gold.amount);
end;
$$;

-- 땅의 것을 줍는다. 먼저 주운 사람만 받고, 늦은 사람은 'gone'.
-- 골드면 { id, amount, gold(주운 뒤 내 골드) }, 메모면 { id, memo: { id, body, author(쓴 사람 닉네임), created_at } }.
create or replace function public.pick_up(item bigint) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  got public.ground_items%rowtype;
begin
  select * into strict me from public.profiles p where p.id = auth.uid() for update;
  delete from public.ground_items g where g.id = pick_up.item and g.map = me.map returning * into got;
  if not found then
    raise exception 'gone';
  end if;
  if got.amount is not null then
    -- 골드 열(integer)이 넘치지 않게 한다. 예외가 나면 지운 것도 되돌아간다.
    if me.gold::bigint + got.amount > 2147483647 then
      raise exception 'too much gold';
    end if;
    update public.profiles p set gold = p.gold + got.amount where p.id = me.id;
    return jsonb_build_object('id', got.id, 'amount', got.amount, 'gold', me.gold + got.amount);
  end if;
  update public.memos m set holder = me.id where m.id = got.memo;
  return jsonb_build_object(
    'id', got.id,
    'memo', (
      select jsonb_build_object('id', m.id, 'body', m.body, 'author', a.nickname, 'created_at', m.created_at)
      from public.memos m join public.profiles a on a.id = m.author
      where m.id = got.memo
    )
  );
end;
$$;

-- 내가 들고 있는 메모(새것부터 100개)
create or replace function public.my_memos() returns table (id bigint, body text, author text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select m.id, m.body, a.nickname, m.created_at
  from public.memos m join public.profiles a on a.id = m.author
  where m.holder = auth.uid()
  order by m.id desc
  limit 100;
$$;

revoke execute on function public.drop_memo(text, text, integer, integer) from public, anon;
revoke execute on function public.place_memo(bigint, text, integer, integer) from public, anon;
revoke execute on function public.drop_gold(integer, text, integer, integer) from public, anon;
revoke execute on function public.pick_up(bigint) from public, anon;
revoke execute on function public.my_memos() from public, anon;
grant execute on function public.drop_memo(text, text, integer, integer) to authenticated;
grant execute on function public.place_memo(bigint, text, integer, integer) to authenticated;
grant execute on function public.drop_gold(integer, text, integer, integer) to authenticated;
grant execute on function public.pick_up(bigint) to authenticated;
grant execute on function public.my_memos() to authenticated;
