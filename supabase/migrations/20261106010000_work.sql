-- 노동청: 작업장에서 자원을 얻고 골드로 판다.
-- 자원 목록은 이 표가 기준이다. 항목을 추가하면 게임에 바로 반영된다.
alter table public.profiles
  add column gold integer not null default 0 check (gold >= 0),
  add column last_harvest_at timestamptz;

create table public.workplaces (
  id text primary key,
  name text not null,
  blurb text not null,
  gather_ms integer not null check (gather_ms > 0),
  sort integer not null default 0
);

create table public.loot (
  item text primary key,
  workplace text not null references public.workplaces (id),
  name text not null,
  blurb text not null,
  weight integer not null check (weight > 0),
  price integer not null check (price > 0)
);

create table public.stash (
  player uuid not null references auth.users (id) on delete cascade,
  item text not null references public.loot (item),
  count integer not null check (count > 0),
  primary key (player, item)
);

insert into public.workplaces (id, name, blurb, gather_ms, sort) values
  ('quarry', '채석장', '돌을 캡니다. 돌만 나옵니다. 가끔 돌이 아닌 것도.', 2500, 1),
  ('logging', '벌목장', '나무를 벱니다. 허리도 같이 나갑니다.', 3000, 2),
  ('gathering', '채집장', '땅에 떨어진 건 다 내 것입니다.', 1500, 3),
  ('fishing', '낚시터', '기다림의 미학. 사실 그냥 멍때리기.', 5000, 4);

insert into public.loot (item, workplace, name, blurb, weight, price) values
  ('plain_rock', 'quarry', '그냥 돌', '진짜 그냥 돌입니다.', 50, 3),
  ('chewed_rock', 'quarry', '누가 씹다 뱉은 돌', '아직 따뜻합니다.', 28, 5),
  ('boss_rock', 'quarry', '부장님 머리 같은 돌', '반질반질하고 말이 안 통합니다.', 15, 9),
  ('used_kidney_stone', 'quarry', '중고 신장결석', '전 주인의 눈물이 묻어 있습니다.', 6, 18),
  ('maybe_diamond', 'quarry', '다이아몬드(아마도)', '유리일 확률 98%.', 1, 120),

  ('wet_firewood', 'logging', '젖은 장작', '불이 안 붙습니다. 마음도요.', 50, 4),
  ('old_chopstick', 'logging', '3년 쓴 나무젓가락', '끝이 많이 지쳐 있습니다.', 28, 7),
  ('silent_friend', 'logging', '말 없는 나무 친구', '속 얘기를 다 들어 줍니다.', 15, 12),
  ('ikea_manual', 'logging', '이케아 설명서(나사 없음)', '나무로 만든 절망입니다.', 6, 25),
  ('lumberjack_disc', 'logging', '벌목공의 허리디스크', '산재 처리는 안 됩니다.', 1, 150),

  ('roadside_grass', 'gathering', '길가의 그냥 풀', '먹어 봤는데 맛없습니다.', 55, 2),
  ('lone_sock', 'gathering', '양말 한 짝', '나머지 한 짝은 영원히 못 찾습니다.', 27, 3),
  ('unknown_mushroom', 'gathering', '이름 모를 버섯', '먹어 봐야 압니다. 한 번만요.', 12, 6),
  ('chicken_radish', 'gathering', '치킨무 한 조각', '국물이 아직 살아 있습니다.', 5, 12),
  ('one_airpod', 'gathering', '에어팟 한 쪽', '주인은 지금도 찾고 있습니다.', 1, 80),

  ('empty_bottle', 'fishing', '빈 페트병', '오늘의 월척입니다.', 40, 5),
  ('torn_boot', 'fishing', '찢어진 장화', '안에 물고기는 없습니다. 있길 바랐죠?', 30, 10),
  ('rebel_carp', 'fishing', '말 안 듣는 붕어', '잡혀 놓고 눈을 안 마주칩니다.', 20, 20),
  ('wet_lotto', 'fishing', '젖은 로또', '한 끗 차이였습니다. 아마도요.', 9, 45),
  ('dragon_king_memo', 'fishing', '용왕님 결재 서류', '반려 사유: 그냥.', 1, 400);

alter table public.workplaces enable row level security;
alter table public.loot enable row level security;
alter table public.stash enable row level security;

revoke all on public.workplaces, public.loot, public.stash from anon, authenticated;
grant select on public.workplaces, public.loot, public.stash to authenticated;

create policy "players read workplaces" on public.workplaces
  for select to authenticated using (true);

create policy "players read loot" on public.loot
  for select to authenticated using (true);

create policy "players read own stash" on public.stash
  for select to authenticated using (player = auth.uid());

-- 자원 하나를 캔다. 어떤 자원이 나올지와 작업 간격은 서버가 정한다.
create function public.harvest() returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  place public.workplaces%rowtype;
  roll integer;
  picked text;
begin
  select * into strict me from public.profiles where id = auth.uid() for update;

  select * into place from public.workplaces where id = me.map;
  if not found then
    raise exception 'not at a workplace';
  end if;
  if me.hp <= 0 then
    raise exception 'player is down';
  end if;
  -- 네트워크 지연을 감안해 10%는 봐준다.
  if me.last_harvest_at > now() - place.gather_ms * interval '0.9 milliseconds' then
    raise exception 'too fast';
  end if;

  select floor(random() * sum(weight))::integer into roll
    from public.loot where workplace = place.id;

  select item into picked from (
    select item, sum(weight) over (order by item) as upto
    from public.loot where workplace = place.id
  ) as ranges
  where upto > roll
  order by upto
  limit 1;

  insert into public.stash (player, item, count) values (me.id, picked, 1)
    on conflict (player, item) do update set count = public.stash.count + 1;

  update public.profiles set last_harvest_at = now() where id = me.id;
  return picked;
end;
$$;

-- 가진 자원을 모두 팔고 새 골드를 돌려준다.
create function public.sell_all() returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  earned integer;
  total integer;
begin
  with sold as (
    delete from public.stash where player = auth.uid() returning item, count
  )
  select coalesce(sum(sold.count * loot.price), 0) into earned
    from sold join public.loot on loot.item = sold.item;

  update public.profiles set gold = gold + earned where id = auth.uid() returning gold into total;
  return total;
end;
$$;

revoke execute on function public.harvest() from public, anon;
revoke execute on function public.sell_all() from public, anon;
grant execute on function public.harvest() to authenticated;
grant execute on function public.sell_all() to authenticated;
