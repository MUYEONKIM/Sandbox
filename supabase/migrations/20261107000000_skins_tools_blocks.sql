-- 블록은 정해진 구역에만 놓는다. 구역이 정해질 때까지는 어느 맵에도 놓을 수 없다.
-- 구역을 정하면 이 정책을 다시 만들고 src/game/maps.ts의 buildZones도 함께 바꾼다.
drop policy "players place blocks" on public.blocks;

-- 회원가입 때 고른 캐릭터와 산 작업 도구. 클라이언트의 update 권한 밖이라 서버만 바꿀 수 있다.
-- 캐릭터를 고른 적 없는 옛 계정의 skin은 null이고, 클라이언트가 id로 정한다.
alter table public.profiles
  add column skin smallint check (skin between 0 and 6),
  add column owned_tools text[] not null default '{}';

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
  return new;
end;
$$;

-- 작업 도구: 가지고 있으면 해당 작업장의 자원 획득량이 bonus만큼 늘어난다. 0.5는 평균 50%다.
-- 이름, 가격, 효과는 이 표가 기준이라 재배포 없이 바꿀 수 있다. 효과를 바꾸면 설명도 함께 바꾼다.
create table public.tools (
  id text primary key,
  workplace text not null references public.workplaces (id),
  name text not null,
  blurb text not null,
  price integer not null check (price > 0),
  bonus numeric not null check (bonus > 0),
  sort integer not null default 0
);

insert into public.tools (id, workplace, name, blurb, price, bonus, sort) values
  ('pickaxe', 'quarry', '강철 곡괭이', '채석장 자원 획득량이 평균 50% 늘어납니다.', 1500, 0.5, 1),
  ('axe', 'logging', '강철 도끼', '벌목장 자원 획득량이 평균 50% 늘어납니다.', 1500, 0.5, 2),
  ('sickle', 'gathering', '강철 낫', '채집장 자원 획득량이 평균 50% 늘어납니다.', 1500, 0.5, 3),
  ('fishing_rod', 'fishing', '고급 낚싯대', '낚시터 자원 획득량이 평균 50% 늘어납니다.', 1500, 0.5, 4);

alter table public.tools enable row level security;

revoke all on public.tools from anon, authenticated;
grant select on public.tools to authenticated;

create policy "players read tools" on public.tools
  for select to authenticated using (true);

-- 작업 도구를 산다. 새 골드를 돌려준다.
create function public.buy_tool(tool text) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  cost integer;
  remaining integer;
begin
  select * into strict me from public.profiles where id = auth.uid() for update;

  select price into cost from public.tools where id = tool;
  if not found then
    raise exception 'unknown tool';
  end if;
  if tool = any(me.owned_tools) then
    raise exception 'already owned';
  end if;
  if me.gold < cost then
    raise exception 'not enough gold';
  end if;

  update public.profiles
    set gold = gold - cost, owned_tools = array_append(owned_tools, tool)
    where id = me.id
    returning gold into remaining;
  return remaining;
end;
$$;

revoke execute on function public.buy_tool(text) from public, anon;
grant execute on function public.buy_tool(text) to authenticated;

-- LUK 1당 평균 10%, 작업 도구는 bonus만큼 자원을 더 캔다.
create or replace function public.harvest() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  place public.workplaces%rowtype;
  roll integer;
  picked text;
  worth integer;
  amount integer;
  tool_bonus numeric;
  gain numeric;
  raised numeric;
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

  select price into strict worth from public.loot where item = picked;

  select coalesce(sum(bonus), 0) into tool_bonus
    from public.tools where workplace = place.id and id = any(me.owned_tools);

  amount := 1 + floor(me.luk * 0.1 + tool_bonus + random()::numeric);

  insert into public.stash (player, item, count) values (me.id, picked, amount)
    on conflict (player, item) do update set count = public.stash.count + excluded.count;

  update public.profiles set last_harvest_at = now() where id = me.id;

  gain := ceil(
    me.level
    * (place.gather_ms::numeric / 50000)
    * (0.5 + random()::numeric)
    * (1 + worth::numeric / 50)
  ) + worth;
  raised := public.raise_level(me.id, gain);

  return jsonb_build_object('item', picked, 'count', amount, 'level', raised::text, 'gained', gain::text);
end;
$$;
