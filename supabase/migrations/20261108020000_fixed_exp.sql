-- 레벨을 경험치로 올린다. 한 번 캘 때 얻는 경험치는 작업장마다 정해져 있고 레벨과 상관없다.
-- 다음 레벨에 필요한 경험치가 레벨마다 늘어나서 처음에는 빨리 오르고 갈수록 느려진다.
-- 옛 방식(현재 레벨에 비례해 오름)으로 쌓인 레벨은 따라잡을 수 없어서 모두 Lv.1로 되돌린다(2026-11-08 사용자 결정).
-- 다시 실행해도 되게 했다. 레벨 초기화는 경험치 열을 처음 만들 때 한 번만 한다.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'exp'
  ) then
    alter table public.profiles add column exp bigint not null default 0 check (exp >= 0);
    update public.profiles set level = 1;
  end if;
end;
$$;

-- 작업 한 번의 경험치. 작업 시간 1초에 10이라 어느 작업장이든 빠르기가 같다.
alter table public.workplaces
  add column if not exists exp integer not null default 10 check (exp > 0);

update public.workplaces set exp = case id
  when 'quarry' then 25
  when 'logging' then 30
  when 'gathering' then 15
  when 'fishing' then 50
  else exp
end;

-- 레벨 lv에서 다음 레벨까지 필요한 경험치. 바꾸면 src/game/level.ts의 levelNeed도 같이 바꾼다.
create or replace function public.level_need(lv numeric) returns numeric
language sql immutable set search_path = ''
as $$
  select 100 * lv;
$$;

-- 경험치를 더하고, 모이는 만큼 레벨을 올린 뒤 모두에게 알린다. 다른 서버 함수만 부른다.
create or replace function public.gain_exp(player uuid, amount integer) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  lv numeric;
  xp numeric;
begin
  select level, exp + amount into strict lv, xp from public.profiles where id = player;
  while xp >= public.level_need(lv) loop
    xp := xp - public.level_need(lv);
    lv := lv + 1;
  end loop;

  update public.profiles set level = lv, exp = xp where id = player;
  perform realtime.send(
    jsonb_build_object('id', player, 'level', lv::text, 'exp', xp),
    'level',
    'world-chat',
    true
  );
  return jsonb_build_object('level', lv::text, 'exp', xp);
end;
$$;

revoke execute on function public.gain_exp(uuid, integer) from public, anon, authenticated;

-- 자원을 캐면 작업장의 경험치를 얻는다. 나머지는 20261107020000_slow_stats.sql과 같다.
create or replace function public.harvest() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  place public.workplaces%rowtype;
  roll integer;
  picked text;
  amount integer;
  tool_bonus numeric;
  grown jsonb;
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

  select coalesce(sum(bonus), 0) into tool_bonus
    from public.tools where workplace = place.id and id = any(me.owned_tools);

  amount := 1 + floor(me.luk * 0.001 + tool_bonus + random()::numeric);

  insert into public.stash (player, item, count) values (me.id, picked, amount)
    on conflict (player, item) do update set count = public.stash.count + excluded.count;

  update public.profiles set last_harvest_at = now() where id = me.id;

  grown := public.gain_exp(me.id, place.exp);

  return jsonb_build_object(
    'item', picked,
    'count', amount,
    'level', grown->>'level',
    'exp', grown->'exp',
    'gained', place.exp
  );
end;
$$;

revoke execute on function public.harvest() from public, anon;
grant execute on function public.harvest() to authenticated;

-- 상대를 쓰러뜨리면 경험치 100(작업 10초 몫)을 얻는다. 나머지는 20261107040000_tower.sql과 같다.
create or replace function public.hit_player(target uuid, weapon text default 'pistol') returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  attacker public.profiles%rowtype;
  victim public.profiles%rowtype;
  arm public.weapons%rowtype;
  damage integer;
  remaining integer;
begin
  if target = auth.uid() then
    raise exception 'invalid target';
  end if;

  select * into arm from public.weapons where id = weapon;
  if not found then
    raise exception 'unknown weapon';
  end if;

  -- 서로 동시에 맞혀도 교착되지 않도록 항상 같은 순서로 잠근다.
  perform 1 from public.profiles where id in (auth.uid(), target) order by id for update;

  select * into strict attacker from public.profiles where id = auth.uid();
  if attacker.hp <= 0 then
    raise exception 'shooter is down';
  end if;
  if not weapon = any(attacker.owned_weapons) then
    raise exception 'weapon not owned';
  end if;
  -- 네트워크 지연으로 몰려 오는 요청을 감안해 발사 간격의 60%까지 봐준다.
  if attacker.last_hit_at > now() - arm.cooldown_ms * interval '0.6 milliseconds' then
    raise exception 'too fast';
  end if;

  select * into victim from public.profiles where id = target;
  if not found or victim.map <> attacker.map or victim.hp <= 0 or attacker.map in ('plains', 'tower1') then
    return null;
  end if;

  update public.profiles set last_hit_at = now() where id = attacker.id;

  if random() < least(0.6, victim.agi::numeric / (victim.agi + 1000)) then
    perform realtime.send(jsonb_build_object('id', target), 'dodge', 'world-chat', true);
    return victim.hp;
  end if;

  -- 피해는 정수라서 소수점 아래는 그 확률만큼 1을 더한다. 그래야 0.1%씩 쌓인 스텟도 평균에 그대로 반영된다.
  damage := greatest(1, floor(arm.damage * (1 + attacker.str * 0.001) * 1000 / (1000 + victim.def) + random()::numeric));

  update public.profiles set hp = greatest(hp - damage, 0) where id = target returning hp into remaining;

  -- world-chat은 클라이언트가 쓸 수 없는 채널이라 체력 값을 위조할 수 없다.
  perform realtime.send(
    jsonb_build_object('id', target, 'hp', remaining),
    'hp',
    'world-chat',
    true
  );

  if remaining = 0 then
    perform public.gain_exp(attacker.id, 100);
  end if;
  return remaining;
end;
$$;

-- 옛 함수는 레벨을 직접 더했다. 위의 두 함수가 gain_exp로 바뀌어 더 쓰지 않는다.
drop function if exists public.raise_level(uuid, numeric);

-- 레벨이 같으면 경험치가 많은 사람이 위다.
create or replace function public.top_players(how_many integer) returns table (nickname text, level text)
language sql stable security definer set search_path = ''
as $$
  select p.nickname, p.level::text
  from public.profiles as p
  order by p.level desc, p.exp desc, p.created_at
  limit least(greatest(how_many, 1), 100);
$$;

-- 실제 서버(PostgREST)가 새 열을 바로 알아보게 한다.
notify pgrst, 'reload schema';
