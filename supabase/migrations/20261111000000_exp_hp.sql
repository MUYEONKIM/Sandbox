-- 경험치를 100배로 올리고(2026-11-11 사용자 요청 "경험치가 너무 적게 들어온다"), 스텟에 HP를 더한다.
-- HP 1포인트는 최대 체력 +1이다. 최대 체력은 profiles.max_hp에 두고, 산 포인트는 max_hp - 100이다.
-- 다시 실행해도 되게 했다.

-- 작업 한 번의 경험치. 작업 시간 1초에 1000이라 어느 작업장이든 빠르기가 같다.
update public.workplaces set exp = case id
  when 'quarry' then 2500
  when 'logging' then 3000
  when 'gathering' then 1500
  when 'fishing' then 5000
  else exp
end;

-- 최대 체력. 바꾸면 src/config.ts의 BASE_HP도 같이 바꾼다.
alter table public.profiles
  add column if not exists max_hp integer not null default 100 check (max_hp >= 100);

alter table public.profiles
  drop constraint if exists profiles_hp_check,
  drop constraint if exists profiles_hp_range,
  add constraint profiles_hp_range check (hp between 0 and max_hp);

alter table public.stats
  drop constraint if exists stats_id_check,
  add constraint stats_id_check check (id in ('str', 'def', 'agi', 'luk', 'hp'));

insert into public.stats (id, name, blurb, base_price, price_step, sort) values
  ('hp', '체력', '월요일 아침을 버텨 내는 몸입니다.', 200, 100, 5)
  on conflict (id) do nothing;

-- 스텟을 1 올린다. HP는 최대 체력과 지금 체력을 함께 1 올린다(쓰러져 있으면 지금 체력은 그대로). 나머지는 20261106030000_shop.sql과 같다.
create or replace function public.buy_stat(stat text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  info public.stats%rowtype;
  owned integer;
  cost integer;
begin
  select * into strict me from public.profiles where id = auth.uid() for update;

  select * into info from public.stats where id = stat;
  if not found then
    raise exception 'unknown stat';
  end if;

  owned := case stat
    when 'str' then me.str
    when 'def' then me.def
    when 'agi' then me.agi
    when 'luk' then me.luk
    when 'hp' then me.max_hp - 100
  end;
  cost := info.base_price + info.price_step * owned;
  if me.gold < cost then
    raise exception 'not enough gold';
  end if;

  update public.profiles set
    gold = gold - cost,
    str = str + (stat = 'str')::integer,
    def = def + (stat = 'def')::integer,
    agi = agi + (stat = 'agi')::integer,
    luk = luk + (stat = 'luk')::integer,
    max_hp = max_hp + (stat = 'hp')::integer,
    hp = hp + (stat = 'hp' and hp > 0)::integer
    where id = me.id;

  return jsonb_build_object('gold', me.gold - cost, 'value', owned + 1);
end;
$$;

-- 쓰러진 플레이어만 체력을 되찾는다. 최대 체력까지 채우고, 다른 사람의 체력 막대를 위해 최대 체력도 알린다.
create or replace function public.respawn() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  full_hp integer;
begin
  update public.profiles set hp = max_hp where id = auth.uid() and hp = 0 returning hp into full_hp;
  if found then
    perform realtime.send(
      jsonb_build_object('id', auth.uid(), 'hp', full_hp, 'max', full_hp),
      'hp',
      'world-chat',
      true
    );
  end if;
end;
$$;

-- 상대를 쓰러뜨리면 경험치 10000(작업 10초 몫)을 얻고, 체력 알림에 최대 체력을 함께 보낸다. 나머지는 20261108020000_fixed_exp.sql과 같다.
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
    jsonb_build_object('id', target, 'hp', remaining, 'max', victim.max_hp),
    'hp',
    'world-chat',
    true
  );

  if remaining = 0 then
    perform public.gain_exp(attacker.id, 10000);
  end if;
  return remaining;
end;
$$;

-- 실제 서버(PostgREST)가 새 열을 바로 알아보게 한다.
notify pgrst, 'reload schema';
