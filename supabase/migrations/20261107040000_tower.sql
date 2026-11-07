-- 행복 아파트(주거단지와 개인 방)를 철거하고 아이티공간 건물 안을 연다.
-- 새 플레이어는 7층에서 태어난다. 1층 카페는 비무장지대이고, 4층, 7층, 8층, 옥상은 블록과 무기를 쓰는 자유 공간이다.
-- 층 이름과 바닥 범위는 src/game/tower.ts와 같으므로 바꾸면 함께 바꾼다.

-- 가입할 때 방을 주지 않는다.
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

drop function public.give_room(uuid);
drop table public.rooms;
drop sequence public.room_numbers;

-- 새 플레이어는 아이티공간 7층 가운데에서 태어난다.
alter table public.profiles
  alter column map set default 'tower7',
  alter column x set default 23,
  alter column y set default 23;

-- 없어진 방과 주거단지에 있던 플레이어도 7층으로 옮긴다.
update public.profiles set map = 'tower7', x = 23, y = 23 where map in ('room', 'residence');

-- 블록은 자유층의 바닥에만 놓는다.
create policy "players place blocks" on public.blocks
  for insert to authenticated with check (
    placed_by = auth.uid()
    and map in ('tower4', 'tower7', 'tower8', 'rooftop')
    and x between 13 and 32
    and y between 13 and 32
  );

-- 시작마을과 1층 카페에서는 공격이 피해를 주지 않는다. 나머지는 20261107020000_slow_stats.sql과 같다.
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
    perform public.raise_level(attacker.id, ceil(attacker.level * 0.5) + 10);
  end if;
  return remaining;
end;
$$;
