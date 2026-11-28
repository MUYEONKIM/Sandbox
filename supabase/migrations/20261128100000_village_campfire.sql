-- 시작마을 배치와 캠프파이어(2026-11-28, 코드 세션 9 묶음 2). 사용자 결정: 아이티공간 (0, 11)·상점 (3, 30)·증권거래소 (26, 34)로 이사,
-- 가운데 2×2칸 캠프파이어("광장 원 안에는 블록을 못 놓게"), 새 건물 자리에 걸리는 플레이어 블록은 "배포 SQL로 치움",
-- 캠프파이어 맵(campfire)과 장작 넣기(공짜, 1분에 한 번, 누적 수, 하루 첫 번 펫 친밀도 +3, 넣을 때마다 100G·하루 10번).
-- 값은 디자인 세션 14 art-source/campfire/final/campfire.json·camp-map.json, 규칙은 기획 4 docs/balance/life-1127.md 4-1.
--
-- ⚠ 되돌릴 수 없는 것:
--   1. 새 건물·광장·산길 칸에 놓인 플레이어 블록을 지운다(2026-11-28 운영 DB 읽기: (12, 16) 가로등 하나). 블록은 누구나 무제한이라 잃는 것은 없다.
--   2. 새로 막히는 칸(새 건물 바닥, 화덕·통나무·장작더미, 산길 아치, 옮긴 소나무)에 서 있던 사람을 일어나는 칸 (30, 23)으로 옮긴다(운영 DB 읽기: 1명).
--   3. 그 칸들에 버려진 골드와 메모는 놓은 사람에게 돌려준다(운영 DB 읽기: 0개).
-- 펫 친밀도 +3은 펫 묶음(펫 표가 생길 때)에서 throw_log에 더한다. 이 함수는 '하루 첫 번'만 누적 수에 센다.
--
-- 확인 쿼리(운영 DB에서 읽기만, 8칸 모두 true):
--   select
--     to_regprocedure('public.throw_log()') is not null as has_throw,
--     to_regprocedure('public.plains_reserved(integer,integer)') is not null as has_reserved,
--     (select count(*) from public.campfire_tuning) = 3 as tuning_rows,
--     coalesce(not has_function_privilege('anon', 'public.throw_log()', 'execute'), false) as anon_cannot,
--     (select count(*) from public.blocks b where b.map = 'plains' and (public.plains_reserved(b.x, b.y) or (b.x between 0 and 10 and b.y between 11 and 21) or (b.x between 3 and 8 and b.y between 30 and 37) or (b.x between 26 and 31 and b.y between 34 and 39) or (b.x, b.y) in ((12, 16), (17, 20), (17, 21), (18, 20), (18, 21)))) = 0 as cells_clear,
--     position('''campfire''' in (select prosrc from pg_proc where oid = to_regprocedure('public.hit_player(uuid,text,bigint,bigint,integer)'))) > 0 as hit_safe,
--     position('plains_reserved' in (select pg_get_expr(polwithcheck, polrelid) from pg_policy where polname = 'players place blocks' and polrelid = 'public.blocks'::regclass)) > 0 as policy_new,
--     coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.throw_log()')) = '5d47f02479c82a86ee0b63d57361aa6a', false) as same_throw;

-- ───────── 1. 새 건물·캠프파이어·산길 칸 정리 ─────────
-- 새로 막히는 칸: 새 건물 바닥(아이티공간 0~10 × 11~21, 상점 3~8 × 30~37, 증권거래소 26~31 × 34~39), 화덕·통나무(22~25 × 22~25 안 12칸),
-- 장작더미 (26, 22), 산길 아치 (17, 20~21), 옮긴 소나무 (18, 17).
create or replace function pg_temp.newly_solid(px integer, py integer) returns boolean
language sql immutable
as $$
  select (px between 0 and 10 and py between 11 and 21)
    or (px between 3 and 8 and py between 30 and 37)
    or (px between 26 and 31 and py between 34 and 39)
    or (px between 23 and 24 and py between 22 and 25)
    or (px in (22, 25) and py between 23 and 24)
    or (px, py) in ((26, 22), (17, 20), (17, 21), (18, 17));
$$;

-- 블록을 못 두는 칸(정리할 칸): 새로 막히는 칸 + 광장 원·일어나는 칸 + 문·문 앞 길·도착 칸 + 산길 입구 칸
create or replace function pg_temp.clear_cell(px integer, py integer) returns boolean
language sql immutable
as $$
  select pg_temp.newly_solid(px, py)
    or (px, py) in (
      (22, 21), (23, 21), (24, 21), (25, 21), (21, 22), (22, 22), (25, 22), (21, 23), (26, 23), (21, 24), (26, 24),
      (21, 25), (22, 25), (25, 25), (26, 25), (22, 26), (23, 26), (24, 26), (25, 26), (30, 23),
      (11, 16), (13, 17), (3, 38), (4, 40), (28, 40), (29, 42), (18, 20), (18, 21), (20, 21)
    )
    or (px between 11 and 13 and py between 15 and 17)
    or (px between 3 and 4 and py between 39 and 40);
$$;

update public.profiles as p
set gold = p.gold + g.total
from (
  select dropped_by, sum(amount) as total
  from public.ground_items
  where map = 'plains' and pg_temp.newly_solid(x, y) and amount is not null and dropped_by is not null
  group by dropped_by
) as g
where p.id = g.dropped_by;

update public.memos as m
set holder = g.dropped_by
from public.ground_items as g
where g.memo = m.id and g.map = 'plains' and pg_temp.newly_solid(g.x, g.y) and g.dropped_by is not null;

delete from public.ground_items where map = 'plains' and pg_temp.newly_solid(x, y);
delete from public.blocks where map = 'plains' and pg_temp.clear_cell(x, y);
update public.profiles set x = 30, y = 23 where map = 'plains' and pg_temp.newly_solid(x, y);

-- ───────── 2. 시작마을 캠프파이어 광장 원: 블록 못 놓음 ─────────
-- 광장 원 32칸(가운데 (24, 24), 반지름 3.3)과 일어나는 칸 (30, 23). src/game/campfire.ts의 CAMP_RESERVED와 같아야 한다.
create or replace function public.plains_reserved(px integer, py integer) returns boolean
language sql immutable set search_path = ''
as $$
  select (py = 21 and px between 22 and 25)
    or (py between 22 and 25 and px between 21 and 26)
    or (py = 26 and px between 22 and 25)
    or (px = 30 and py = 23);
$$;

-- 20261127000000_room_use.sql의 "players place blocks"에 시작마을 광장 원과 캠프파이어 맵 조건만 더했다.
drop policy if exists "players place blocks" on public.blocks;
create policy "players place blocks" on public.blocks for insert to authenticated
with check (
  placed_by = auth.uid()
  and (
    z = 0
    or z = 9
    or exists (
      select 1 from public.blocks as below
      where below.map = blocks.map and below.x = blocks.x and below.y = blocks.y and below.z = blocks.z - 1
    )
  )
  and (
    map <> 'farm'
    or (
      exists (select 1 from public.farm_plots as f where f.x = blocks.x and f.y = blocks.y and f.owner = auth.uid())
      and not public.farm_is_gate(blocks.x, blocks.y)
    )
  )
  and left(map, 4) <> 'adv_'
  and (map <> 'plains' or not public.plains_reserved(blocks.x, blocks.y))
  and map <> 'campfire'
);

-- ───────── 3. 캠프파이어 맵 공격 금지 ─────────
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
  -- 공격 금지: 시작마을과 그 안의 상점(mart)·대장간(smithy)·노동청(labor)·농협(farmcoop) 안 맵, 캠프파이어 맵(campfire, 2026-11-28), 모험 맵(id가 adv_로 시작), 빌라(id가 villa로 시작, 2026-11-27).
  if not found or victim.map <> attacker.map or victim.hp <= 0 or attacker.map in ('plains', 'mart', 'smithy', 'labor', 'farmcoop', 'campfire')
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

-- ───────── 4. 장작 넣기 ─────────
-- 설정(값만 고치면 재배포 없이 바뀐다): 넣을 때마다 골드, 하루 골드 받는 횟수, 넣는 간격(초)
create table if not exists public.campfire_tuning (
  key text primary key,
  value numeric not null check (value >= 0),
  note text not null default ''
);
comment on table public.campfire_tuning is '캠프파이어 장작 넣기 숫자(throw_log가 부를 때마다 읽음). value만 고친다.';
alter table public.campfire_tuning enable row level security;
revoke all on table public.campfire_tuning from anon, authenticated;
insert into public.campfire_tuning (key, value, note) values
  ('gold', 100, '넣을 때마다 받는 골드'),
  ('gold_times', 10, '하루(한국 시간)에 골드를 받는 횟수'),
  ('gap_seconds', 60, '장작을 넣는 간격(초)')
on conflict (key) do nothing;

-- 사람마다 한 줄: 태운 장작 누적 수(하루 첫 번만 1씩), 마지막으로 넣은 시각, 마지막 날짜(한국 시간), 그날 골드 받은 횟수
create table if not exists public.campfire_stats (
  player uuid primary key references public.profiles (id) on delete cascade,
  total integer not null default 0 check (total >= 0),
  last_at timestamptz,
  last_day date,
  gold_times integer not null default 0 check (gold_times >= 0)
);
alter table public.campfire_stats enable row level security;
revoke all on table public.campfire_stats from anon, authenticated;
grant select on table public.campfire_stats to authenticated;
drop policy if exists "players read own campfire" on public.campfire_stats;
create policy "players read own campfire" on public.campfire_stats for select to authenticated using (player = auth.uid());

-- 장작 하나를 넣는다. 캠프파이어 맵에 있어야 하고 간격(60초)이 지나야 한다. 하루(한국 시간) 첫 번이면 누적 +1,
-- 그날 골드 횟수가 남았으면 골드 +100. 누적 수와 넣은 뒤 골드(글자)를 돌려준다. 골드는 화면에 알리지 않는다.
create or replace function public.throw_log() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  st public.campfire_stats%rowtype;
  today date := (now() at time zone 'Asia/Seoul')::date;
  pay numeric;
  times integer;
  gap numeric;
  new_gold numeric;
begin
  select * into strict me from public.profiles where id = auth.uid() for update;
  if me.map <> 'campfire' then
    raise exception 'not here';
  end if;
  select value into pay from public.campfire_tuning where key = 'gold';
  select value into times from public.campfire_tuning where key = 'gold_times';
  select value into gap from public.campfire_tuning where key = 'gap_seconds';
  insert into public.campfire_stats (player) values (me.id) on conflict (player) do nothing;
  select * into st from public.campfire_stats where player = me.id for update;
  if st.last_at is not null and st.last_at > now() - coalesce(gap, 60) * interval '1 second' then
    raise exception 'too soon';
  end if;
  if st.last_day is distinct from today then
    st.total := st.total + 1;
    st.gold_times := 0;
    st.last_day := today;
  end if;
  new_gold := me.gold;
  if st.gold_times < coalesce(times, 10) then
    st.gold_times := st.gold_times + 1;
    update public.profiles set gold = gold + coalesce(pay, 100) where id = me.id returning gold into new_gold;
  end if;
  update public.campfire_stats
    set total = st.total, last_at = now(), last_day = st.last_day, gold_times = st.gold_times
    where player = me.id;
  return jsonb_build_object('total', st.total, 'gold', new_gold::text);
end;
$$;

revoke execute on function public.throw_log() from public, anon;
grant execute on function public.throw_log() to authenticated;
revoke execute on function public.plains_reserved(integer, integer) from public, anon;
grant execute on function public.plains_reserved(integer, integer) to authenticated;

notify pgrst, 'reload schema';
