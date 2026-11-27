-- 시작마을 빌라(2026-11-27 코드 세션 8, 디자인 세션 11 villa.md): 2층 방 201~210호의 주인 표와 '내 방으로 하기' 함수, 빌라 맵 공격 금지.
-- - villa_rooms: 방 하나에 주인 한 사람, 한 사람에 방 하나(owner unique). 누구나 읽는다. 쓰기는 claim_villa_room으로만 한다(정책 없음).
-- - claim_villa_room(room): 빈 방이고 부른 사람이 아직 방이 없을 때만 주인이 된다. 동시에 눌러도 한 사람만 된다(기본 키·unique + on conflict do nothing).
--   돌려주는 값: 'ok'(주인이 됨), 'taken'(그새 다른 사람이 가져감), 'have'(이미 내 방이 있음).
-- - villa_room_list(): 방마다 주인 id와 닉네임(profiles는 본인 것만 읽혀서 security definer로 닉네임을 붙여 준다).
-- - 방을 비우거나 바꾸는 길은 없다(요청에 없음). 계정이 지워지면 그 방은 빈 방이 된다(on delete cascade).
-- - 블록·벽걸이: 지금 블록 놓기 정책(players place blocks)이 맵 이름을 farm·adv_만 보므로 빌라 맵(villa1·villa2·villa3·villa201~villa210)에 누구나 놓고 고친다. 바꿀 것 없음.
-- - hit_player: 20261117000000_adventure.sql의 본문을 그대로 옮기고 공격 금지 맵에 빌라(이름이 villa로 시작)를 더한다(주석 한 줄과 조건 한 줄만 바뀜).
-- 새로 만드는 것뿐이라 다시 실행해도 된다(create table if not exists, create or replace, 정책은 지우고 다시 만듦).
--
-- 확인 쿼리(실행 뒤 모두 true, 6칸):
-- select
--   to_regclass('public.villa_rooms') is not null as table_ok,
--   (select relrowsecurity from pg_class where oid = 'public.villa_rooms'::regclass) as rls_on,
--   has_function_privilege('authenticated', 'public.claim_villa_room(smallint)', 'execute') as claim_fn,
--   not has_function_privilege('anon', 'public.claim_villa_room(smallint)', 'execute') as claim_not_anon,
--   has_function_privilege('authenticated', 'public.villa_room_list()', 'execute') as list_fn,
--   position('''villa''' in pg_get_functiondef('public.hit_player(uuid, text, bigint, bigint, integer)'::regprocedure)) > 0 as hit_villa_safe;

create table if not exists public.villa_rooms (
  room smallint primary key check (room between 201 and 210),
  owner uuid not null unique references auth.users (id) on delete cascade,
  claimed_at timestamptz not null default now()
);

alter table public.villa_rooms enable row level security;

drop policy if exists "anyone reads villa rooms" on public.villa_rooms;
create policy "anyone reads villa rooms" on public.villa_rooms for select to anon, authenticated using (true);

create or replace function public.claim_villa_room(p_room smallint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  if p_room is null or p_room not between 201 and 210 then
    raise exception 'no such room';
  end if;
  if exists (select 1 from public.villa_rooms where owner = me) then
    return 'have';
  end if;
  insert into public.villa_rooms (room, owner) values (p_room, me) on conflict do nothing;
  if found then
    return 'ok';
  end if;
  if exists (select 1 from public.villa_rooms where owner = me) then
    return 'have';
  end if;
  return 'taken';
end;
$$;

revoke execute on function public.claim_villa_room(smallint) from public, anon;
grant execute on function public.claim_villa_room(smallint) to authenticated;

create or replace function public.villa_room_list()
returns table (room smallint, owner uuid, nickname text)
language sql
stable
security definer
set search_path = public
as $$
  select v.room, v.owner, p.nickname
  from public.villa_rooms as v
  left join public.profiles as p on p.id = v.owner
  order by v.room;
$$;

revoke execute on function public.villa_room_list() from public, anon;
grant execute on function public.villa_room_list() to authenticated;

-- ───────── 빌라 공격 금지 ─────────
-- 20261117000000_adventure.sql의 hit_player에서 공격 금지 맵 주석 한 줄과 조건 한 줄만 바꾼다.
create or replace function public.hit_player(
  target uuid, weapon text default 'pistol', gear bigint default null, shot bigint default null, pellets integer default 1
) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  attacker public.profiles%rowtype;
  victim public.profiles%rowtype;
  arm public.weapons%rowtype;
  g public.gear%rowtype;
  lvl integer := 0;
  cur_mag integer;
  cur_mag_at timestamptz;
  cur_shot bigint;
  cur_pellets integer;
  damage bigint;
  remaining bigint;
  victim_karma integer;
  attacker_karma integer;
  share numeric;
  loot record;
  take integer;
  taken jsonb := '[]'::jsonb;
  gold_take numeric := 0;
begin
  if target = auth.uid() then
    raise exception 'invalid target';
  end if;

  select * into arm from public.weapons as x where x.id = weapon;
  if not found then
    raise exception 'unknown weapon';
  end if;
  if pellets is null or pellets < 1 or pellets > arm.pellets then
    raise exception 'too many pellets';
  end if;

  -- 서로 동시에 맞혀도 교착되지 않도록 항상 같은 순서로 잠근다.
  perform 1 from public.profiles where id in (auth.uid(), target) order by id for update;

  select * into strict attacker from public.profiles where id = auth.uid();
  if attacker.hp <= 0 then
    raise exception 'shooter is down';
  end if;
  if weapon = 'pistol' then
    cur_mag := attacker.pistol_mag;
    cur_mag_at := attacker.pistol_mag_at;
    cur_shot := attacker.pistol_shot;
    cur_pellets := attacker.pistol_pellets;
  else
    if hit_player.gear is null then
      select * into g from public.gear as x where x.player = attacker.id and x.kind = weapon order by x.id limit 1 for update;
    else
      select * into g from public.gear as x where x.id = hit_player.gear and x.player = attacker.id and x.kind = weapon for update;
    end if;
    if not found then
      raise exception 'weapon not owned';
    end if;
    lvl := g.level;
    cur_mag := g.mag_used;
    cur_mag_at := g.mag_at;
    cur_shot := g.last_shot;
    cur_pellets := g.shot_pellets;
  end if;

  select * into victim from public.profiles where id = target;
  -- 공격 금지: 시작마을과 그 안의 상점(mart)·대장간(smithy)·노동청(labor)·농협(farmcoop) 안 맵, 모험 맵(id가 adv_로 시작), 빌라(id가 villa로 시작, 2026-11-27).
  if not found or victim.map <> attacker.map or victim.hp <= 0 or attacker.map in ('plains', 'mart', 'smithy', 'labor', 'farmcoop')
    or left(attacker.map, 4) = 'adv_' or left(attacker.map, 5) = 'villa' then
    return null;
  end if;

  if shot is not null and shot = cur_shot then
    -- 같은 사격의 다른 사람(산탄): 간격과 탄창은 이미 셌다. 알 수 합만 본다.
    if cur_pellets + pellets > arm.pellets then
      raise exception 'too many pellets';
    end if;
    cur_pellets := cur_pellets + pellets;
  else
    -- 네트워크 지연으로 몰려 오는 요청을 감안해 발사 간격의 60%까지 봐준다.
    if attacker.last_hit_at > now() - arm.cooldown_ms * interval '0.6 milliseconds' then
      raise exception 'too fast';
    end if;
    if arm.magazine is not null then
      -- 재장전 시간의 80%를 쉬었으면 재장전했을 수 있으니 새 탄창으로 센다.
      if cur_mag_at <= now() - arm.reload_ms * interval '0.8 milliseconds' then
        cur_mag := 0;
      end if;
      if cur_mag >= arm.magazine then
        raise exception 'reloading';
      end if;
      cur_mag := cur_mag + 1;
      cur_mag_at := now();
    end if;
    cur_shot := shot;
    cur_pellets := pellets;
    update public.profiles set last_hit_at = now() where id = attacker.id;
  end if;

  if weapon = 'pistol' then
    update public.profiles
      set pistol_mag = cur_mag, pistol_mag_at = cur_mag_at, pistol_shot = cur_shot, pistol_pellets = cur_pellets
      where id = attacker.id;
  else
    update public.gear as x
      set mag_used = cur_mag, mag_at = cur_mag_at, last_shot = cur_shot, shot_pellets = cur_pellets
      where x.id = g.id;
  end if;

  if random() < least(0.6, victim.agi::numeric / (victim.agi + 1000)) then
    perform realtime.send(jsonb_build_object('id', target), 'dodge', 'world-chat', true);
    return victim.hp;
  end if;

  -- 피해는 정수라서 소수점 아래는 그 확률만큼 1을 더한다. 체력보다 큰 피해는 체력만큼으로 줄여 bigint를 넘지 않게 한다.
  damage := least(victim.hp, greatest(1, floor(
    arm.damage * pellets * power(1.03::numeric, lvl) * (1 + attacker.str * 0.001) * 1000 / (1000 + victim.def) + random()::numeric
  )));

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

    victim_karma := public.karma_now(victim.karma, victim.karma_at);
    attacker_karma := public.karma_now(attacker.karma, attacker.karma_at);

    if victim_karma > 0 then
      -- 현상범을 잡았다: 현상금을 넘기고 현상범의 악업을 1 내린다. 잡은 사람의 악업은 그대로다.
      share := case victim_karma when 1 then 0.01 when 2 then 0.05 when 3 then 0.10 when 4 then 0.20 else 0.30 end;
      for loot in select item, count from public.stash where player = target loop
        take := floor(loot.count * share);
        continue when take <= 0;
        -- share가 1보다 작아 take는 늘 count보다 작으므로 0개가 남는 일은 없다.
        update public.stash set count = count - take where player = target and item = loot.item;
        insert into public.stash (player, item, count) values (attacker.id, loot.item, take)
          on conflict (player, item) do update set count = public.stash.count + excluded.count;
        taken := taken || jsonb_build_object('item', loot.item, 'count', take);
      end loop;
      gold_take := floor(victim.gold * share);
      update public.profiles set gold = gold - gold_take, karma = victim_karma - 1, karma_at = now() where id = target;
      update public.profiles set gold = gold + gold_take where id = attacker.id;
      perform realtime.send(
        jsonb_build_object('killer', attacker.id, 'victim', target, 'gold', gold_take::text, 'items', taken),
        'bounty',
        'world-chat',
        true
      );
    else
      update public.profiles set karma = least(attacker_karma + 1, 5), karma_at = now() where id = attacker.id;
    end if;

    -- wanted는 잡힌 사람의 악업 단계(0이면 현상범이 아니었음). 받은 클라이언트는 현상범 명단을 다시 읽는다.
    perform realtime.send(
      jsonb_build_object('kind', 'kill', 'killer', attacker.nickname, 'victim', victim.nickname, 'wanted', victim_karma),
      'notice',
      'world-chat',
      true
    );
  end if;
  return remaining;
end;
$$;

revoke execute on function public.hit_player(uuid, text, bigint, bigint, integer) from public, anon;
grant execute on function public.hit_player(uuid, text, bigint, bigint, integer) to authenticated;
