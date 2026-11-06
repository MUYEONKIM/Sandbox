-- 스텟은 오래 쌓는 값이라 1포인트의 효과를 0.1%로 낮춘다.
-- STR 1당 피해 +0.1%, DEF는 피해에 1000 / (1000 + DEF)를 곱하고,
-- AGI의 회피 확률은 AGI / (AGI + 1000)이며 60%가 상한이고, LUK 1당 자원이 평균 0.1% 늘어난다.
-- 이 공식을 바꾸면 src/game/stats.ts의 설명도 함께 바꾼다.
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
  if not found or victim.map <> attacker.map or victim.hp <= 0 or attacker.map = 'plains' then
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
    perform public.raise_level(attacker.id, ceil(attacker.level * 0.5) + 10);
  end if;
  return remaining;
end;
$$;

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

  amount := 1 + floor(me.luk * 0.001 + tool_bonus + random()::numeric);

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
