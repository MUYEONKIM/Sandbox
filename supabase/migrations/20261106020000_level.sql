-- 레벨: 능력치 없이 숫자만 끝없이 오른다. 숫자가 크게 커지므로 numeric을 쓴다.
-- 클라이언트의 update 권한은 x, y, map, inventory 컬럼에만 있어 레벨을 직접 고칠 수 없다.
alter table public.profiles
  add column level numeric not null default 1 check (level >= 1);

-- 레벨을 올리고 모두에게 알린다. 다른 서버 함수만 부른다.
create function public.raise_level(player uuid, gain numeric) returns numeric
language plpgsql security definer set search_path = ''
as $$
declare
  raised numeric;
begin
  update public.profiles set level = level + gain where id = player returning level into raised;
  perform realtime.send(
    jsonb_build_object('id', player, 'level', raised::text),
    'level',
    'world-chat',
    true
  );
  return raised;
end;
$$;

revoke execute on function public.raise_level(uuid, numeric) from public, anon, authenticated;

-- 자원을 캐면 현재 레벨에 비례해 레벨이 오른다.
-- 오래 걸리는 작업일수록, 비싼 자원일수록 많이 올라 어느 작업장이든 빠르기가 비슷하다.
drop function public.harvest();

create function public.harvest() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  place public.workplaces%rowtype;
  roll integer;
  picked text;
  worth integer;
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

  insert into public.stash (player, item, count) values (me.id, picked, 1)
    on conflict (player, item) do update set count = public.stash.count + 1;

  update public.profiles set last_harvest_at = now() where id = me.id;

  gain := ceil(
    me.level
    * (place.gather_ms::numeric / 50000)
    * (0.5 + random()::numeric)
    * (1 + worth::numeric / 50)
  ) + worth;
  raised := public.raise_level(me.id, gain);

  return jsonb_build_object('item', picked, 'level', raised::text, 'gained', gain::text);
end;
$$;

revoke execute on function public.harvest() from public, anon;
grant execute on function public.harvest() to authenticated;

-- 상대를 쓰러뜨리면 레벨이 절반만큼 더 오른다.
create or replace function public.hit_player(target uuid) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  shooter public.profiles%rowtype;
  remaining integer;
begin
  if target = auth.uid() then
    raise exception 'invalid target';
  end if;

  -- 서로 동시에 맞혀도 교착되지 않도록 항상 같은 순서로 잠근다.
  perform 1 from public.profiles where id in (auth.uid(), target) order by id for update;

  select * into strict shooter from public.profiles where id = auth.uid();
  if shooter.hp <= 0 then
    raise exception 'shooter is down';
  end if;
  if shooter.last_hit_at > now() - interval '150 milliseconds' then
    raise exception 'too fast';
  end if;

  update public.profiles
    set hp = greatest(hp - 10, 0)
    where id = target and map = shooter.map and hp > 0
    returning hp into remaining;
  if remaining is null then
    return null;
  end if;

  update public.profiles set last_hit_at = now() where id = shooter.id;

  -- world-chat은 클라이언트가 쓸 수 없는 채널이라 체력 값을 위조할 수 없다.
  perform realtime.send(
    jsonb_build_object('id', target, 'hp', remaining),
    'hp',
    'world-chat',
    true
  );

  if remaining = 0 then
    perform public.raise_level(shooter.id, ceil(shooter.level * 0.5) + 10);
  end if;
  return remaining;
end;
$$;
