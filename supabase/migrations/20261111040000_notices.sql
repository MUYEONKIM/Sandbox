-- 전체 알림과 킬/데스(2026-11-11 사용자 요청): 접속하면 "누가 입장했습니다", 쓰러뜨리면 "누가 누구를 죽였습니다"를 모두에게 띄우고,
-- 쓰러뜨린 수와 쓰러진 수를 세어 Tab 순위표(상위 10명)에 보인다. 알림은 클라이언트가 쓸 수 없는 world-chat 채널로 서버가 보낸다.
-- 다시 실행해도 되게 했다.

alter table public.profiles
  add column if not exists kills integer not null default 0 check (kills >= 0),
  add column if not exists deaths integer not null default 0 check (deaths >= 0),
  add column if not exists joined_notice_at timestamptz;

-- 접속했다고 모두에게 알린다. 새로고침을 거듭해도 알림이 쏟아지지 않게 같은 사람은 1분에 한 번만 알린다.
create or replace function public.announce_join() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
begin
  select * into strict me from public.profiles where id = auth.uid() for update;
  if me.joined_notice_at > now() - interval '1 minute' then
    return;
  end if;
  update public.profiles set joined_notice_at = now() where id = me.id;
  perform realtime.send(
    jsonb_build_object('kind', 'join', 'name', me.nickname),
    'notice',
    'world-chat',
    true
  );
end;
$$;

revoke execute on function public.announce_join() from public, anon;
grant execute on function public.announce_join() to authenticated;

-- 쓰러뜨린 수 순위. 같으면 덜 쓰러진 사람, 그다음 먼저 가입한 사람이 위다.
create or replace function public.top_killers(how_many integer) returns table (nickname text, kills integer, deaths integer)
language sql stable security definer set search_path = ''
as $$
  select p.nickname, p.kills, p.deaths
  from public.profiles as p
  order by p.kills desc, p.deaths, p.created_at
  limit least(greatest(how_many, 1), 50);
$$;

revoke execute on function public.top_killers(integer) from public, anon;
grant execute on function public.top_killers(integer) to authenticated;

-- 쓰러뜨리면 킬/데스를 세고 모두에게 알린다. 나머지는 20261111030000_open_world.sql과 같다.
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
    jsonb_build_object('id', target, 'hp', remaining, 'max', victim.max_hp),
    'hp',
    'world-chat',
    true
  );

  if remaining = 0 then
    perform public.gain_exp(attacker.id, 10000);
    update public.profiles set kills = kills + 1 where id = attacker.id;
    update public.profiles set deaths = deaths + 1 where id = target;
    perform realtime.send(
      jsonb_build_object('kind', 'kill', 'killer', attacker.nickname, 'victim', victim.nickname),
      'notice',
      'world-chat',
      true
    );
  end if;
  return remaining;
end;
$$;

notify pgrst, 'reload schema';
