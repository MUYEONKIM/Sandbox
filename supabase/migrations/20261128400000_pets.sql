-- 펫(2026-11-28, 코드 묶음 7). 기획 docs/balance/pet-care-1127.md(기획 세션 4, 사용자 결정 끝) 10.1, 그림·화면 공유 노트 pets.md(디자인 세션 12).
-- 하는 일:
--   1. profiles.pet(7종 가운데 하나, null이면 아직 안 고름이거나 잃음). 화면은 이 칸을 직접 고칠 수 없다(칸 권한이 x·y·map·inventory뿐).
--   2. 표 pet_rules(설정 한 줄: 입양 값 1,000,000G, 기회 2, 다시 세는 값 30, 펫 간식 값 200G), pet_care(사람마다 한 줄: 상태·친밀도·기회·잃음),
--      player_items(사람·물건·개수, 내 줄만 읽힘. 펫 간식 'pet_treat').
--   3. 함수(화면이 부름): pet_state(), pet_act(행동, 먹이), pet_tick(걸은 칸, 쉰 초, 캠프파이어 초), set_pet(종류)(처음 한 마리 무료, 한 번만),
--      adopt_pet(종류)(잃은 뒤에만, 골드), buy_pet_treats(개수).
--      속 함수(화면이 못 부름): pet_settle(흐른 시간 셈), pet_save, pet_view, pet_add, pet_stage, pet_after_adventure, pet_campfire_log.
--   4. 고친 함수 둘(가장 새 본문을 복사해 한 줄씩 더함): adventure_settle(20261119000000_adventure_numbers.sql, 모험 한 번 끝날 때 친밀도 +2·기운 −5),
--      throw_log(20261128100000_village_campfire.sql, 하루 첫 장작에 친밀도 +3).
--   다시 실행해도 된다(if not exists, on conflict, create or replace).
--
-- ⚠ 되돌리기 어려운 것: 없다. 있는 줄을 지우거나 옮기지 않는다. profiles에 칸 하나와 check 제약을 더한다(모든 줄 null로 시작).
--   배포 뒤 처음 접속하는 모든 계정에 펫 고르는 창이 뜬다(고를 때까지 닫히지 않음). 상태는 고른 때부터 100에서 센다.
--
-- 확인 쿼리(운영 DB에서 읽기만, 12칸 모두 true):
--   select
--     to_regclass('public.pet_care') is not null and to_regclass('public.pet_rules') is not null and to_regclass('public.player_items') is not null as has_tables,
--     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'pet') as has_pet_column,
--     exists (select 1 from pg_constraint where conname = 'profiles_pet_kind' and conrelid = 'public.profiles'::regclass) as has_pet_check,
--     coalesce((select adopt_price = 1000000 and chances = 2 and rearm_at = 30 and treat_price = 200 from public.pet_rules where id), false) as rules_row,
--     to_regprocedure('public.pet_state()') is not null and to_regprocedure('public.pet_act(text,text)') is not null
--       and to_regprocedure('public.pet_tick(integer,integer,integer)') is not null and to_regprocedure('public.set_pet(text)') is not null
--       and to_regprocedure('public.adopt_pet(text)') is not null and to_regprocedure('public.buy_pet_treats(integer)') is not null as has_functions,
--     coalesce(not has_function_privilege('anon', to_regprocedure('public.pet_state()'), 'execute'), false) and coalesce(not has_function_privilege('anon', to_regprocedure('public.pet_act(text,text)'), 'execute'), false)
--       and coalesce(not has_function_privilege('anon', to_regprocedure('public.pet_tick(integer,integer,integer)'), 'execute'), false) and coalesce(not has_function_privilege('anon', to_regprocedure('public.set_pet(text)'), 'execute'), false)
--       and coalesce(not has_function_privilege('anon', to_regprocedure('public.adopt_pet(text)'), 'execute'), false) and coalesce(not has_function_privilege('anon', to_regprocedure('public.buy_pet_treats(integer)'), 'execute'), false) as anon_cannot,
--     coalesce(has_function_privilege('authenticated', to_regprocedure('public.pet_state()'), 'execute'), false) and coalesce(has_function_privilege('authenticated', to_regprocedure('public.pet_act(text,text)'), 'execute'), false)
--       and coalesce(has_function_privilege('authenticated', to_regprocedure('public.pet_tick(integer,integer,integer)'), 'execute'), false) and coalesce(has_function_privilege('authenticated', to_regprocedure('public.set_pet(text)'), 'execute'), false)
--       and coalesce(has_function_privilege('authenticated', to_regprocedure('public.adopt_pet(text)'), 'execute'), false) and coalesce(has_function_privilege('authenticated', to_regprocedure('public.buy_pet_treats(integer)'), 'execute'), false) as players_can,
--     coalesce(not has_function_privilege('authenticated', to_regprocedure('public.pet_settle(uuid)'), 'execute'), false) and coalesce(not has_function_privilege('authenticated', to_regprocedure('public.pet_after_adventure(uuid)'), 'execute'), false)
--       and coalesce(not has_function_privilege('authenticated', to_regprocedure('public.pet_campfire_log(uuid)'), 'execute'), false) and coalesce(not has_function_privilege('authenticated', to_regprocedure('public.pet_save(public.pet_care)'), 'execute'), false) as inner_private,
--     coalesce(not has_column_privilege('authenticated', 'public.profiles'::regclass, (select attnum from pg_attribute where attrelid = 'public.profiles'::regclass and attname = 'pet'), 'UPDATE'), false) and coalesce(not has_table_privilege('authenticated', to_regclass('public.pet_care'), 'SELECT'), false)
--       and coalesce(not has_table_privilege('authenticated', to_regclass('public.pet_rules'), 'SELECT'), false) and coalesce(not has_table_privilege('authenticated', to_regclass('public.player_items'), 'INSERT'), false) as tables_locked,
--     coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.adventure_settle(uuid,text)')) = '415fee0b3158ae1e96b609f947305ea5', false) as same_settle,
--     coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.throw_log()')) = 'ced463e517d1047d9f538aabd5424e63', false) as same_throw,
--     coalesce((select md5(string_agg(md5(replace(prosrc, E'\r', '')), ',' order by proname)) from pg_proc
--       where pronamespace = 'public'::regnamespace and proname in ('pet_settle', 'pet_save', 'pet_view', 'pet_add', 'pet_stage', 'pet_state', 'pet_act', 'pet_tick',
--         'set_pet', 'adopt_pet', 'buy_pet_treats', 'pet_after_adventure', 'pet_campfire_log', 'pet_food_value')) = '8b6756ec499dceae4da2970b9e7abb2d', false) as same_pet_functions;

-- ───────── 1. 표 ─────────
alter table public.profiles add column if not exists pet text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_pet_kind' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_pet_kind
      check (pet is null or pet in ('dog', 'cat', 'rabbit', 'fox', 'panda', 'penguin', 'blackcat'));
  end if;
end;
$$;

-- 설정 한 줄(값만 고치면 재배포 없이 바뀐다): 입양 값(정함), 기회 수(정함), 0 뒤 다시 셀 수 있게 되는 값(배부름·함께함 모두 이 값 이상), 펫 간식 한 개 값
create table if not exists public.pet_rules (
  id boolean primary key default true check (id),
  adopt_price numeric not null default 1000000 check (adopt_price >= 0),
  chances smallint not null default 2 check (chances between 0 and 9),
  rearm_at numeric not null default 30 check (rearm_at > 0 and rearm_at <= 100),
  treat_price numeric not null default 200 check (treat_price >= 0)
);
comment on table public.pet_rules is '펫 설정 한 줄(pet_act·adopt_pet·buy_pet_treats가 부를 때마다 읽음). 값만 고친다.';
alter table public.pet_rules enable row level security;
revoke all on table public.pet_rules from anon, authenticated;
insert into public.pet_rules (id) values (true) on conflict (id) do nothing;

-- 사람·물건·개수(life-1127.md 4.4, 담배도 나중에 이 표를 씀). 펫 간식은 'pet_treat'. 고치는 것은 서버 함수만.
create table if not exists public.player_items (
  player uuid not null references public.profiles (id) on delete cascade,
  item text not null,
  count integer not null check (count >= 0),
  primary key (player, item)
);
alter table public.player_items enable row level security;
revoke all on table public.player_items from anon, authenticated;
grant select on table public.player_items to authenticated;
drop policy if exists "players read own items" on public.player_items;
create policy "players read own items" on public.player_items for select to authenticated using (player = auth.uid());

-- 사람마다 한 줄. 상태 값은 vals_at 때의 값(소수)이고, 읽거나 고칠 때마다 흐른 시간으로 센다(pet_settle).
-- seen_at: 마지막으로 화면이 부른 때(틱·돌보기·읽기). 15분 넘게 비었으면 그 사이를 '접속하지 않은 동안'으로 센다.
-- gains: 오늘(한국 시간 day) 길마다 오른 친밀도(걷기·쉬기 등) 또는 친밀도가 든 횟수(돌보기 다섯), acts: 행동마다 마지막 시각(초)
create table if not exists public.pet_care (
  player uuid primary key references public.profiles (id) on delete cascade,
  fullness double precision not null default 100,
  energy double precision not null default 100,
  company double precision not null default 100,
  vals_at timestamptz not null default now(),
  seen_at timestamptz not null default now(),
  bond integer not null default 0 check (bond >= 0),
  best_stage smallint not null default 1,
  cared_at timestamptz not null default now(),
  decay_from timestamptz not null default now(),
  day date not null default ((now() at time zone 'Asia/Seoul')::date),
  gains jsonb not null default '{}',
  acts jsonb not null default '{}',
  walk_carry integer not null default 0,
  rest_carry integer not null default 0,
  camp_carry integer not null default 0,
  chances smallint not null default 2,
  rearm boolean not null default true,
  zero_at timestamptz,
  lost_at timestamptz,
  lost_count integer not null default 0,
  lost_kind text
);
-- 잃은 펫의 종류(작별 창의 뒷모습과 이름). 다시 실행할 때 표가 이미 있으면 칸만 더한다.
alter table public.pet_care add column if not exists lost_kind text;
alter table public.pet_care enable row level security;
revoke all on table public.pet_care from anon, authenticated;

-- ───────── 2. 속 함수 ─────────
-- 친밀도 → 단계(낯가림 0, 익숙함 100, 친함 500, 단짝 1,500, 가족 3,500)
create or replace function public.pet_stage(bond integer) returns smallint
language sql immutable set search_path = ''
as $$
  select (case when bond >= 3500 then 5 when bond >= 1500 then 4 when bond >= 500 then 3 when bond >= 100 then 2 else 1 end)::smallint;
$$;

-- 친밀도 더하기. counted면 하루에 친밀도가 드는 횟수(cap번)를 세고, 아니면 하루에 오르는 양(cap)을 센다. 넘으면 더하지 않는다.
create or replace function public.pet_add(c public.pet_care, path text, amount integer, cap integer, counted boolean) returns public.pet_care
language plpgsql set search_path = ''
as $$
declare
  have integer := coalesce((c.gains ->> path)::integer, 0);
  got integer;
begin
  if counted then
    if have < cap then
      c.bond := c.bond + amount;
      c.gains := c.gains || jsonb_build_object(path, have + 1);
    end if;
  else
    got := least(amount, greatest(0, cap - have));
    if got > 0 then
      c.bond := c.bond + got;
      c.gains := c.gains || jsonb_build_object(path, have + got);
    end if;
  end if;
  return c;
end;
$$;

create or replace function public.pet_save(c public.pet_care) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.pet_care as p set
    fullness = c.fullness, energy = c.energy, company = c.company, vals_at = c.vals_at, seen_at = c.seen_at,
    bond = c.bond, best_stage = c.best_stage, cared_at = c.cared_at, decay_from = c.decay_from, day = c.day,
    gains = c.gains, acts = c.acts, walk_carry = c.walk_carry, rest_carry = c.rest_carry, camp_carry = c.camp_carry,
    chances = c.chances, rearm = c.rearm, zero_at = c.zero_at, lost_at = c.lost_at, lost_count = c.lost_count, lost_kind = c.lost_kind
  where p.player = c.player;
end;
$$;

-- 흐른 시간을 센다(기획 10.1). 프로필 줄과 펫 줄을 잠그고, 고친 펫 줄을 저장해 돌려준다. 펫을 고른 적이 없으면 null.
--   상태(시간당): 접속 중 배부름 −4·함께함 0·기운 +2, 접속하지 않은 동안 배부름 −2·함께함 −2·기운 +10. 0~100.
--   0이 되는 때: 다시 셀 수 있으면(rearm) 배부름이나 함께함이 0이 된 그 시각에 기회 −1. 기회가 0인데 또 0이면 잃음(profiles.pet 비움).
--     돌보기 없이는 값이 줄기만 해서 한 번 셀 때 많아야 한 번이다. 다시 셀 수 있게 되는 것은 pet_act(둘 다 rearm_at 이상)뿐이다.
--   돌봄 보너스: 사이에 지난 첫 0시(한국 시간)에 셋이 모두 70 이상이면 +5. 친밀도: 마지막으로 돌본 뒤 24시간마다 −1(0 아래로는 안 감).
create or replace function public.pet_settle(who uuid) returns public.pet_care
language plpgsql security definer set search_path = ''
as $$
declare
  kind text;
  c public.pet_care%rowtype;
  t timestamptz := now();
  today date := (now() at time zone 'Asia/Seoul')::date;
  h double precision;
  online boolean;
  rf double precision;
  rc double precision;
  re double precision;
  hz double precision;
  zt timestamptz;
  midnight timestamptz;
  hm double precision;
  n integer;
begin
  select p.pet into kind from public.profiles as p where p.id = who for update;
  if not found then
    raise exception 'no profile';
  end if;
  select * into c from public.pet_care as p where p.player = who for update;
  if not found then
    if kind is null then
      return null;
    end if;
    -- 펫을 고른 줄이 없으면(돌보기가 들어오기 전에 고른 계정) 지금부터 100에서 센다.
    insert into public.pet_care (player, chances) values (who, coalesce((select r.chances from public.pet_rules as r where r.id), 2)) returning * into c;
    return c;
  end if;
  if kind is null then
    return c;
  end if;
  h := greatest(0, extract(epoch from (t - c.vals_at)) / 3600);
  online := t - c.seen_at <= interval '15 minutes';
  rf := case when online then 4 else 2 end;
  rc := case when online then 0 else 2 end;
  re := case when online then 2 else 10 end;

  if c.rearm then
    hz := null;
    if c.fullness <= 0 or c.company <= 0 then
      hz := 0;
    else
      hz := c.fullness / rf;
      if rc > 0 then
        hz := least(hz, c.company / rc);
      end if;
    end if;
    if hz <= h then
      zt := c.vals_at + make_interval(secs => hz * 3600);
      c.rearm := false;
      c.zero_at := zt;
      if c.chances > 0 then
        c.chances := c.chances - 1;
      else
        -- 세 번째 0: 그 펫을 다시 볼 수 없다. 친밀도와 기록은 입양 때 새로 둔다.
        c.lost_at := zt;
        c.lost_count := c.lost_count + 1;
        c.lost_kind := kind;
        c.vals_at := t;
        update public.profiles set pet = null where id = who;
        perform public.pet_save(c);
        return c;
      end if;
    end if;
  end if;

  if c.day < today then
    midnight := (c.day + 1)::timestamp at time zone 'Asia/Seoul';
    hm := extract(epoch from (midnight - c.vals_at)) / 3600;
    c.day := today;
    c.gains := '{}';
    if hm >= 0 and hm <= h and c.fullness - rf * hm >= 70 and least(100, c.energy + re * hm) >= 70 and c.company - rc * hm >= 70 then
      c := public.pet_add(c, 'bonus', 5, 5, false);
    end if;
  end if;

  c.fullness := greatest(0, c.fullness - rf * h);
  c.company := greatest(0, c.company - rc * h);
  c.energy := least(100, c.energy + re * h);
  n := floor(extract(epoch from (t - c.decay_from)) / 86400);
  if n > 0 then
    c.bond := greatest(0, c.bond - n);
    c.decay_from := c.decay_from + n * interval '1 day';
  end if;
  c.vals_at := t;
  perform public.pet_save(c);
  return c;
end;
$$;

-- 화면에 돌려주는 값. 상태는 소수 셋째 자리까지(화면이 같은 속도로 줄여 보임), 골드 값은 글자.
create or replace function public.pet_view(who uuid, c public.pet_care) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  kind text;
  r public.pet_rules%rowtype;
  treats integer;
begin
  select p.pet into kind from public.profiles as p where p.id = who;
  select * into r from public.pet_rules as x where x.id;
  select i.count into treats from public.player_items as i where i.player = who and i.item = 'pet_treat';
  return jsonb_build_object(
    'pet', kind,
    'lostCount', coalesce(c.lost_count, 0),
    'lostAt', c.lost_at,
    'lostKind', c.lost_kind,
    'chances', coalesce(c.chances, r.chances),
    'rearm', coalesce(c.rearm, true),
    'fullness', round(coalesce(c.fullness, 100)::numeric, 3),
    'energy', round(coalesce(c.energy, 100)::numeric, 3),
    'company', round(coalesce(c.company, 100)::numeric, 3),
    'bond', coalesce(c.bond, 0),
    'bestStage', coalesce(c.best_stage, 1),
    'greeted', coalesce(c.gains ? 'greet', false),
    'patted', coalesce(c.gains ? 'pat', false),
    'acts', coalesce(c.acts, '{}'),
    'treats', coalesce(treats, 0),
    'treatPrice', r.treat_price::text,
    'adoptPrice', r.adopt_price::text,
    'now', floor(extract(epoch from now()) * 1000)
  );
end;
$$;

-- 먹이 하나의 배부름(펫 간식 50, 좋아하는 것 30, 그 밖 15)과 좋아하는지. 먹지 않는 것이면 null(양파, 토끼·판다가 아닌 펫의 길가의 그냥 풀, 그 밖).
create or replace function public.pet_food_value(kind text, food text) returns jsonb
language sql immutable set search_path = ''
as $$
  select case
    when food is null or kind is null then null
    when food = 'treat' then jsonb_build_object('full', 50, 'favorite', false)
    when food not in ('carrot', 'potato', 'tomato', 'eggplant', 'corn', 'rebel_carp', 'roadside_grass') then null
    when food = 'roadside_grass' and kind not in ('rabbit', 'panda') then null
    else jsonb_build_object('full', case when fav then 30 else 15 end, 'favorite', fav)
  end
  from (select (kind, food) in (('dog', 'potato'), ('cat', 'rebel_carp'), ('blackcat', 'rebel_carp'), ('rabbit', 'carrot'), ('rabbit', 'roadside_grass'),
    ('fox', 'corn'), ('panda', 'carrot'), ('penguin', 'rebel_carp')) as fav) as f;
$$;

-- ───────── 3. 화면이 부르는 함수 ─────────
-- 지금 값(접속할 때, 0이 되는 때에 맞춰 한 번). 부른 때부터 접속 중으로 센다.
create or replace function public.pet_state() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  c public.pet_care%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  c := public.pet_settle(auth.uid());
  if c.player is not null then
    c.seen_at := now();
    update public.pet_care set seen_at = c.seen_at where player = c.player;
  end if;
  return public.pet_view(auth.uid(), c);
end;
$$;

-- 돌보기 다섯(기획 3.2, 간격·하루 횟수·효과는 기획 세션 4가 정한 것). 막히면 ok false와 까닭(soon 간격, zero 0인 동안 놀기,
-- tired 기운 15 아래 놀기, full 배부름 100 먹이, food 먹이 없음)을 돌려준다. 펫이 없으면 'no pet'.
create or replace function public.pet_act(act text, food text default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  kind text;
  c public.pet_care%rowtype;
  r public.pet_rules%rowtype;
  gap integer;
  last double precision;
  t double precision := extract(epoch from now());
  ok boolean := true;
  reason text := null;
  fv jsonb;
  grade text := null;
  left_count integer := null;
  greet boolean := false;
  first_pat boolean := false;
  rearmed boolean := false;
  new_stage smallint := null;
  stage smallint;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  if act is null or act not in ('pat', 'praise', 'feed', 'play', 'talk') then
    raise exception 'bad act';
  end if;
  c := public.pet_settle(me);
  select p.pet into kind from public.profiles as p where p.id = me;
  if kind is null or c.player is null then
    raise exception 'no pet';
  end if;
  select * into r from public.pet_rules as x where x.id;
  c.seen_at := now();
  gap := case act when 'pat' then 30 when 'praise' then 30 when 'play' then 120 when 'talk' then 3 else 0 end;
  last := (c.acts ->> act)::double precision;
  if gap > 0 and last is not null and t - last < gap then
    ok := false;
    reason := 'soon';
  elsif act = 'play' and (c.fullness <= 0 or c.company <= 0) then
    ok := false;
    reason := 'zero';
  elsif act = 'play' and c.energy < 15 then
    ok := false;
    reason := 'tired';
  elsif act = 'feed' and ceil(c.fullness) >= 100 then
    ok := false;
    reason := 'full';
  end if;

  if ok and act = 'feed' then
    fv := public.pet_food_value(kind, food);
    if fv is null then
      raise exception 'bad food';
    end if;
    if food = 'treat' then
      update public.player_items as i set count = i.count - 1 where i.player = me and i.item = 'pet_treat' and i.count > 0 returning i.count into left_count;
    elsif food in ('rebel_carp', 'roadside_grass') then
      update public.stash as s set count = s.count - 1 where s.player = me and s.item = food and s.count > 1 returning s.count into left_count;
      if not found then
        delete from public.stash as s where s.player = me and s.item = food and s.count = 1;
        if found then
          left_count := 0;
        end if;
      end if;
    else
      -- 작물은 일반 → 비난 → 칭찬 차례로 하나 쓴다(파는 값이 높은 칭찬을 마지막에, 제가 정한 것).
      select s.kind into grade from public.farm_stock as s
        where s.player = me and s.crop = food and s.kind in ('normal', 'blame', 'praise') and s.count > 0
        order by case s.kind when 'normal' then 0 when 'blame' then 1 else 2 end
        limit 1 for update;
      if found then
        update public.farm_stock as s set count = s.count - 1 where s.player = me and s.crop = food and s.kind = grade returning s.count into left_count;
      end if;
    end if;
    if left_count is null then
      ok := false;
      reason := 'food';
    end if;
  end if;

  if ok then
    if act = 'pat' then
      first_pat := not (c.gains ? 'pat');
      c.company := least(100, c.company + 6);
      c := public.pet_add(c, 'pat', 2, 10, true);
    elsif act = 'praise' then
      c.company := least(100, c.company + 4);
      c := public.pet_add(c, 'praise', 1, 10, true);
    elsif act = 'feed' then
      c.fullness := least(100, c.fullness + (fv ->> 'full')::integer);
      c := public.pet_add(c, 'feed', case when (fv ->> 'favorite')::boolean then 6 else 3 end, 3, true);
    elsif act = 'play' then
      c.company := least(100, c.company + 10);
      c.energy := greatest(0, c.energy - 10);
      c := public.pet_add(c, 'play', 4, 5, true);
    else
      c.company := least(100, c.company + 2);
      if not (c.gains ? 'greet') then
        greet := true;
        c := public.pet_add(c, 'greet', 10, 1, true);
      else
        c := public.pet_add(c, 'talk', 1, 5, true);
      end if;
    end if;
    c.cared_at := now();
    c.decay_from := now();
    c.acts := c.acts || jsonb_build_object(act, t);
    if not c.rearm and c.fullness >= r.rearm_at and c.company >= r.rearm_at then
      c.rearm := true;
      rearmed := true;
    end if;
    stage := public.pet_stage(c.bond);
    if stage > c.best_stage then
      c.best_stage := stage;
      new_stage := stage;
    end if;
  end if;
  perform public.pet_save(c);
  return public.pet_view(me, c) || jsonb_build_object(
    'ok', ok, 'reason', reason, 'act', act, 'food', food, 'grade', grade, 'left', left_count,
    'favorite', coalesce((fv ->> 'favorite')::boolean, false), 'greet', greet, 'firstPat', first_pat, 'rearmed', rearmed, 'newStage', new_stage
  );
end;
$$;

-- 접속한 동안 10분에 한 번(기획 10.1). 걸은 칸(200칸마다 기운 −1·친밀도 +1), 쉰 초(앉기·눕기, 기운 +20/시간, 5분마다 친밀도 +1),
-- 그 가운데 캠프파이어 곁 초(5분마다 친밀도 +2). 한 번에 넣는 값의 위 끝: 3,000칸, 600초, 600초(쉰 초는 지난 부름 뒤 흐른 초도 넘지 않음).
create or replace function public.pet_tick(walked integer, rest_s integer, camp_s integer) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  kind text;
  c public.pet_care%rowtype;
  prev timestamptz;
  online boolean;
  w integer;
  rs integer;
  cs integer;
  n integer;
  new_stage smallint := null;
  stage smallint;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  select p.seen_at into prev from public.pet_care as p where p.player = me;
  c := public.pet_settle(me);
  select p.pet into kind from public.profiles as p where p.id = me;
  if c.player is null then
    return public.pet_view(me, c);
  end if;
  c.seen_at := now();
  if kind is not null then
    online := prev is not null and now() - prev <= interval '15 minutes';
    w := least(greatest(coalesce(walked, 0), 0), 3000);
    rs := least(greatest(coalesce(rest_s, 0), 0), 600, greatest(0, floor(extract(epoch from (now() - coalesce(prev, now())))))::integer);
    cs := least(greatest(coalesce(camp_s, 0), 0), rs);
    if online and rs > 0 then
      c.energy := least(100, c.energy + 18.0 * rs / 3600);
    end if;
    c.walk_carry := c.walk_carry + w;
    n := c.walk_carry / 200;
    c.walk_carry := c.walk_carry % 200;
    if n > 0 then
      c.energy := greatest(0, c.energy - n);
      c := public.pet_add(c, 'walk', n, 10, false);
    end if;
    c.rest_carry := c.rest_carry + (rs - cs);
    n := c.rest_carry / 300;
    c.rest_carry := c.rest_carry % 300;
    if n > 0 then
      c := public.pet_add(c, 'rest', n, 10, false);
    end if;
    c.camp_carry := c.camp_carry + cs;
    n := c.camp_carry / 300;
    c.camp_carry := c.camp_carry % 300;
    if n > 0 then
      c := public.pet_add(c, 'camp', 2 * n, 10, false);
    end if;
    stage := public.pet_stage(c.bond);
    if stage > c.best_stage then
      c.best_stage := stage;
      new_stage := stage;
    end if;
  end if;
  perform public.pet_save(c);
  return public.pet_view(me, c) || jsonb_build_object('newStage', new_stage);
end;
$$;

-- 처음 한 마리(무료, pets.md 5-4). 이미 펫이 있으면 'already', 잃은 적이 있으면 'adopt'(입양으로만), 7종이 아니면 'bad pet'.
create or replace function public.set_pet(p text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  kind text;
  lost integer;
  n smallint;
  c public.pet_care%rowtype;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  if p is null or p not in ('dog', 'cat', 'rabbit', 'fox', 'panda', 'penguin', 'blackcat') then
    raise exception 'bad pet';
  end if;
  perform public.pet_settle(me);
  select x.pet into kind from public.profiles as x where x.id = me for update;
  if kind is not null then
    raise exception 'already';
  end if;
  select x.lost_count into lost from public.pet_care as x where x.player = me for update;
  if coalesce(lost, 0) >= 1 then
    raise exception 'adopt';
  end if;
  select r.chances into n from public.pet_rules as r where r.id;
  update public.profiles set pet = p where id = me and pet is null;
  delete from public.pet_care where player = me;
  insert into public.pet_care (player, chances) values (me, coalesce(n, 2)) returning * into c;
  return public.pet_view(me, c);
end;
$$;

-- 입양(기획 6.4): 펫을 잃은 뒤에만, adopt_price를 내고 7종 가운데 하나. 상태 100, 친밀도 0, 단계 1, 기회 처음 값, 잃은 횟수는 그대로.
-- 두 번 눌러도 한 번만 빠진다(펫이 생긴 뒤에는 'has pet'). 골드는 글자로 돌려준다.
create or replace function public.adopt_pet(p text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  c public.pet_care%rowtype;
  r public.pet_rules%rowtype;
  new_gold numeric;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  perform public.pet_settle(auth.uid());
  select * into strict me from public.profiles where id = auth.uid() for update;
  if me.pet is not null then
    raise exception 'has pet';
  end if;
  select * into c from public.pet_care as x where x.player = me.id for update;
  if not found or c.lost_count < 1 then
    raise exception 'first';
  end if;
  if p is null or p not in ('dog', 'cat', 'rabbit', 'fox', 'panda', 'penguin', 'blackcat') then
    raise exception 'bad pet';
  end if;
  select * into r from public.pet_rules as x where x.id;
  if me.gold < r.adopt_price then
    raise exception 'gold';
  end if;
  update public.profiles set gold = gold - r.adopt_price, pet = p where id = me.id returning gold into new_gold;
  update public.pet_care set
    fullness = 100, energy = 100, company = 100, vals_at = now(), seen_at = now(), bond = 0, best_stage = 1,
    cared_at = now(), decay_from = now(), day = (now() at time zone 'Asia/Seoul')::date, gains = '{}', acts = '{}',
    walk_carry = 0, rest_carry = 0, camp_carry = 0, chances = r.chances, rearm = true, zero_at = null, lost_at = null
  where player = me.id
  returning * into c;
  return public.pet_view(me.id, c) || jsonb_build_object('gold', new_gold::text);
end;
$$;

-- 펫 간식 사기(상점, 한 번에 1~100개). 값은 pet_rules.treat_price.
create or replace function public.buy_pet_treats(amount integer) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  cost numeric;
  new_gold numeric;
  new_count integer;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if amount is null or amount < 1 or amount > 100 then
    raise exception 'bad amount';
  end if;
  select r.treat_price * amount into cost from public.pet_rules as r where r.id;
  update public.profiles set gold = gold - cost where id = auth.uid() and gold >= cost returning gold into new_gold;
  if not found then
    raise exception 'not enough gold';
  end if;
  insert into public.player_items (player, item, count) values (auth.uid(), 'pet_treat', amount)
    on conflict (player, item) do update set count = public.player_items.count + excluded.count
    returning count into new_count;
  return jsonb_build_object('gold', new_gold::text, 'count', new_count);
end;
$$;

-- 모험 한 번 끝날 때(adventure_settle가 부름): 친밀도 +2(하루 10까지), 기운 −5. 펫이 없으면 아무것도 하지 않는다.
create or replace function public.pet_after_adventure(who uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  c public.pet_care%rowtype;
  stage smallint;
begin
  c := public.pet_settle(who);
  if c.player is null or (select p.pet from public.profiles as p where p.id = who) is null then
    return;
  end if;
  c := public.pet_add(c, 'adv', 2, 10, false);
  c.energy := greatest(0, c.energy - 5);
  stage := public.pet_stage(c.bond);
  if stage > c.best_stage then
    c.best_stage := stage;
  end if;
  perform public.pet_save(c);
end;
$$;

-- 캠프파이어 하루 첫 장작(throw_log가 부름): 친밀도 +3(하루 3까지). 펫이 없으면 아무것도 하지 않는다.
create or replace function public.pet_campfire_log(who uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  c public.pet_care%rowtype;
  stage smallint;
begin
  c := public.pet_settle(who);
  if c.player is null or (select p.pet from public.profiles as p where p.id = who) is null then
    return;
  end if;
  c := public.pet_add(c, 'log', 3, 3, false);
  stage := public.pet_stage(c.bond);
  if stage > c.best_stage then
    c.best_stage := stage;
  end if;
  perform public.pet_save(c);
end;
$$;

-- ───────── 4. 고친 함수 둘 ─────────
-- 판을 끝낸다: 이긴 수 × 5,400 마을 경험치(gain_exp), 판 금화 전부(버림, 예전 50%) 마을 골드. 판 칸을 비우고 결과를 last_result에 남긴다.
-- reason은 끝난 까닭('bp' BP가 0이 됨, 'return' 귀환)이다. 결과는 다음 adventure_state가 한 번 주고 지운다. 판이 없으면 null.
-- 2026-11-28 펫: 판이 끝날 때 pet_after_adventure(친밀도 +2, 기운 −5) 한 줄을 더했다.
create or replace function public.adventure_settle(who uuid, reason text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a public.adventure_players%rowtype;
  town_exp integer;
  town_gold numeric;
  outcome jsonb;
begin
  select * into strict a from public.adventure_players as x where x.player = who for update;
  if not a.in_run then
    return null;
  end if;
  town_exp := a.run_wins * 5400;
  town_gold := floor(a.run_gold);
  if town_exp > 0 then
    perform public.gain_exp(who, town_exp);
  end if;
  if town_gold > 0 then
    update public.profiles as p set gold = p.gold + town_gold where p.id = who;
  end if;
  perform public.pet_after_adventure(who);
  outcome := jsonb_build_object(
    'reason', reason, 'map', a.run_map, 'level', a.run_level::text, 'wins', a.run_wins, 'losses', a.run_losses,
    'exp', a.run_exp::text, 'townExp', town_exp, 'gold', a.run_gold::text, 'townGold', town_gold::text, 'drops', a.run_drops
  );
  update public.adventure_players as x set
    in_run = false, bp = 20, run_map = null, run_bosses = '{}', run_level = 1, run_exp = 0, run_points = 0,
    run_hp = 0, run_atk = 0, run_def = 0, run_agi = 0, run_luc = 0, run_gold = 0, run_wins = 0, run_losses = 0,
    run_drops = '[]', last_result = outcome
    where x.player = who;
  return outcome;
end;
$$;

-- 장작 하나를 넣는다. 캠프파이어 맵에 있어야 하고 간격(60초)이 지나야 한다. 하루(한국 시간) 첫 번이면 누적 +1,
-- 그날 골드 횟수가 남았으면 골드 +100. 누적 수와 넣은 뒤 골드(글자)를 돌려준다. 골드는 화면에 알리지 않는다.
-- 2026-11-28 펫: 하루 첫 번이면 pet_campfire_log(펫 친밀도 +3) 한 줄을 더했다.
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
    perform public.pet_campfire_log(me.id);
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

-- ───────── 5. 권한 ─────────
revoke execute on function public.pet_stage(integer) from public, anon, authenticated;
revoke execute on function public.pet_add(public.pet_care, text, integer, integer, boolean) from public, anon, authenticated;
revoke execute on function public.pet_save(public.pet_care) from public, anon, authenticated;
revoke execute on function public.pet_settle(uuid) from public, anon, authenticated;
revoke execute on function public.pet_view(uuid, public.pet_care) from public, anon, authenticated;
revoke execute on function public.pet_food_value(text, text) from public, anon, authenticated;
revoke execute on function public.pet_after_adventure(uuid) from public, anon, authenticated;
revoke execute on function public.pet_campfire_log(uuid) from public, anon, authenticated;
revoke execute on function public.adventure_settle(uuid, text) from public, anon, authenticated;

revoke execute on function public.pet_state() from public, anon;
grant execute on function public.pet_state() to authenticated;
revoke execute on function public.pet_act(text, text) from public, anon;
grant execute on function public.pet_act(text, text) to authenticated;
revoke execute on function public.pet_tick(integer, integer, integer) from public, anon;
grant execute on function public.pet_tick(integer, integer, integer) to authenticated;
revoke execute on function public.set_pet(text) from public, anon;
grant execute on function public.set_pet(text) to authenticated;
revoke execute on function public.adopt_pet(text) from public, anon;
grant execute on function public.adopt_pet(text) to authenticated;
revoke execute on function public.buy_pet_treats(integer) from public, anon;
grant execute on function public.buy_pet_treats(integer) to authenticated;
revoke execute on function public.throw_log() from public, anon;
grant execute on function public.throw_log() to authenticated;

notify pgrst, 'reload schema';
