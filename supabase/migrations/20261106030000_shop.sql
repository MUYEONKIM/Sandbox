-- 아이티공간: 무기와 스텟을 골드로 산다.
-- 무기의 가격, 피해량, 발사 간격과 스텟 가격은 아래 표가 기준이라 재배포 없이 바꿀 수 있다.
-- 클라이언트의 update 권한은 x, y, map, inventory 컬럼에만 있어 스텟과 보유 무기를 직접 고칠 수 없다.
alter table public.profiles
  add column str integer not null default 0 check (str >= 0),
  add column def integer not null default 0 check (def >= 0),
  add column agi integer not null default 0 check (agi >= 0),
  add column luk integer not null default 0 check (luk >= 0),
  add column owned_weapons text[] not null default array['pistol'];

-- 평원 가운데에 성이 들어서므로 새 플레이어는 정문 앞에서 시작한다.
alter table public.profiles
  alter column x set default 31,
  alter column y set default 24;

-- 성 자리와 정문 앞에 있던 블록을 치운다.
delete from public.blocks
  where map = 'plains'
    and ((x between 18 and 28 and y between 18 and 28) or (x, y) in ((29, 23), (31, 24)));

create table public.weapons (
  id text primary key,
  blurb text not null,
  price integer not null check (price >= 0),
  damage integer not null check (damage > 0),
  cooldown_ms integer not null check (cooldown_ms > 0),
  sort integer not null default 0
);

create table public.stats (
  id text primary key check (id in ('str', 'def', 'agi', 'luk')),
  name text not null,
  blurb text not null,
  base_price integer not null check (base_price > 0),
  price_step integer not null check (price_step >= 0),
  sort integer not null default 0
);

insert into public.weapons (id, blurb, price, damage, cooldown_ms, sort) values
  ('pistol', '기본 지급품입니다. 파는 물건이 아닙니다.', 0, 10, 250, 0),
  ('sword', '손잡이 쪽을 잡으십시오. 반대쪽은 아픕니다.', 800, 30, 450, 1),
  ('machinegun', '사격 훈련은 없습니다. 많이 쏘면 언젠가 맞습니다.', 3000, 6, 100, 2);

insert into public.stats (id, name, blurb, base_price, price_step, sort) values
  ('str', '공격력', '3개월 끊고 이틀 나간 헬스장 근육입니다.', 200, 100, 1),
  ('def', '방어력', '부장님 잔소리로 단련된 맷집입니다.', 200, 100, 2),
  ('agi', '회피', '회식 자리에서 조용히 사라지는 기술입니다.', 200, 100, 3),
  ('luk', '자원수급량', '길바닥에서 에어팟을 줍는 기운입니다.', 200, 100, 4);

alter table public.weapons enable row level security;
alter table public.stats enable row level security;

revoke all on public.weapons, public.stats from anon, authenticated;
grant select on public.weapons, public.stats to authenticated;

create policy "players read weapons" on public.weapons
  for select to authenticated using (true);

create policy "players read stats" on public.stats
  for select to authenticated using (true);

-- 무기를 산다. 새 골드를 돌려준다.
create function public.buy_weapon(weapon text) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  cost integer;
  remaining integer;
begin
  select * into strict me from public.profiles where id = auth.uid() for update;

  select price into cost from public.weapons where id = weapon;
  if not found then
    raise exception 'unknown weapon';
  end if;
  if weapon = any(me.owned_weapons) then
    raise exception 'already owned';
  end if;
  if me.gold < cost then
    raise exception 'not enough gold';
  end if;

  update public.profiles
    set gold = gold - cost, owned_weapons = array_append(owned_weapons, weapon)
    where id = me.id
    returning gold into remaining;
  return remaining;
end;
$$;

-- 스텟을 1 올린다. 가격은 기본가에 지금 스텟만큼 더 붙는다. 새 골드와 스텟 값을 돌려준다.
create function public.buy_stat(stat text) returns jsonb
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
    luk = luk + (stat = 'luk')::integer
    where id = me.id;

  return jsonb_build_object('gold', me.gold - cost, 'value', owned + 1);
end;
$$;

-- 무기별 피해량에 스텟을 반영한다. weapon을 빼면 권총으로 친다.
-- STR 1당 피해 +10%, DEF는 피해에 10 / (10 + DEF)를 곱하고, AGI의 회피 확률은 AGI / (AGI + 25)이며 60%가 상한이다.
-- 이 공식을 바꾸면 src/game/stats.ts의 설명도 함께 바꾼다.
drop function public.hit_player(uuid);

create function public.hit_player(target uuid, weapon text default 'pistol') returns integer
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
  if not found or victim.map <> attacker.map or victim.hp <= 0 then
    return null;
  end if;

  update public.profiles set last_hit_at = now() where id = attacker.id;

  if random() < least(0.6, victim.agi::numeric / (victim.agi + 25)) then
    perform realtime.send(jsonb_build_object('id', target), 'dodge', 'world-chat', true);
    return victim.hp;
  end if;

  damage := greatest(1, round(arm.damage * (1 + attacker.str * 0.1) * 10 / (10 + victim.def)));

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

-- LUK 1당 자원을 평균 10% 더 캔다. 레벨 상승량은 스텟과 상관없다.
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

  amount := 1 + floor(me.luk * 0.1 + random()::numeric);

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

revoke execute on function public.buy_weapon(text) from public, anon;
revoke execute on function public.buy_stat(text) from public, anon;
revoke execute on function public.hit_player(uuid, text) from public, anon;
grant execute on function public.buy_weapon(text) to authenticated;
grant execute on function public.buy_stat(text) to authenticated;
grant execute on function public.hit_player(uuid, text) to authenticated;
