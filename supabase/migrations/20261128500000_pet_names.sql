-- 펫 이름과 갈색 강아지(2026-11-28, 코드 묶음 7-1·7-2). 사용자 "펫 이름을 설정할 수 있도록 한다.", "강아지는 황토색 강아지, 갈색 강아지 두개로 나눈다."
-- 이름 규칙은 PM이 정함(사용자가 바꿀 수 있음):
--   고를 때·입양할 때 이름을 받는다(화면 처음 값은 종류 이름). 1~8자, 앞뒤 빈칸은 지우고, 빈 이름과 제어 문자는 안 된다.
--   나중에 상태 창에서 바꿀 수 있고 값은 받지 않는다. 다른 사람에게는 보내지 않는다(이동 신호·접속 명단에 싣지 않음).
-- 하는 일:
--   1. pet_care.name(null이면 화면이 종류 이름을 보임. 이미 고른 사람은 null로 시작 = 종류 이름). 잃어도 남아 작별 창에 쓰고, 입양하면 새 이름.
--   2. 속 함수 pet_clean_name(이름 다듬기·검사, 'bad name'), 화면 함수 rename_pet(이름).
--   3. 고친 함수: pet_view(돌려주는 값에 'name'), set_pet(p, pet_name), adopt_pet(p, pet_name).
--      set_pet·adopt_pet은 인자가 하나 늘어 옛 것(text 하나)을 지우고 새로 만든다. pet_name은 기본값 null이라 옛 화면({p}만 보냄)도 그대로 된다.
--   4. 갈색 강아지 dog_brown(8번째 종류, 디자인 세션 12 pets.md 10절): profiles.pet check 제약(profiles_pet_kind)을 다시 만들고,
--      set_pet·adopt_pet의 종류 목록과 pet_food_value(좋아하는 먹이 감자, 강아지 dog와 같음)에 더한다. dog는 이름만 '황토색 강아지'로 바뀌고 서버 값은 그대로.
--   다시 실행해도 된다(if not exists, drop if exists, create or replace).
--
-- ⚠ 되돌리기 어려운 것: 없다. 칸 하나를 더하고(모든 줄 null), check 제약 하나를 넓히고, 함수만 바꾼다.
--
-- 확인 쿼리(운영 DB에서 읽기만, 12칸 모두 true. 뒤 다섯 칸은 권한 규칙 docs/agent/workflow.md 3절):
--   select
--     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pet_care' and column_name = 'name') as has_name_column,
--     exists (select 1 from pg_constraint where conname = 'pet_care_name_len' and conrelid = 'public.pet_care'::regclass) as has_name_check,
--     coalesce((select pg_get_constraintdef(oid) like '%dog_brown%' from pg_constraint where conname = 'profiles_pet_kind' and conrelid = 'public.profiles'::regclass), false)
--       and coalesce(public.pet_food_value('dog_brown', 'potato') ->> 'favorite' = 'true', false) as has_dog_brown,
--     to_regprocedure('public.set_pet(text,text)') is not null and to_regprocedure('public.adopt_pet(text,text)') is not null
--       and to_regprocedure('public.rename_pet(text)') is not null and to_regprocedure('public.set_pet(text)') is null and to_regprocedure('public.adopt_pet(text)') is null as has_functions,
--     coalesce(has_function_privilege('authenticated', to_regprocedure('public.set_pet(text,text)'), 'execute'), false)
--       and coalesce(has_function_privilege('authenticated', to_regprocedure('public.adopt_pet(text,text)'), 'execute'), false)
--       and coalesce(has_function_privilege('authenticated', to_regprocedure('public.rename_pet(text)'), 'execute'), false)
--       and coalesce(not has_function_privilege('anon', to_regprocedure('public.set_pet(text,text)'), 'execute'), false)
--       and coalesce(not has_function_privilege('anon', to_regprocedure('public.adopt_pet(text,text)'), 'execute'), false)
--       and coalesce(not has_function_privilege('anon', to_regprocedure('public.rename_pet(text)'), 'execute'), false)
--       and coalesce(not has_function_privilege('authenticated', to_regprocedure('public.pet_clean_name(text)'), 'execute'), false)
--       and coalesce(not has_function_privilege('authenticated', to_regprocedure('public.pet_view(uuid,public.pet_care)'), 'execute'), false) as function_grants,
--     coalesce(not has_table_privilege('authenticated', 'public.pet_care', 'SELECT,INSERT,UPDATE,DELETE'), false) as pet_care_locked,
--     coalesce((select md5(string_agg(md5(replace(prosrc, E'\r', '')), ',' order by proname)) from pg_proc
--       where pronamespace = 'public'::regnamespace and proname in ('pet_clean_name', 'pet_view', 'set_pet', 'adopt_pet', 'rename_pet', 'pet_food_value')), '') = 'e9db93b3db65e2d60897fae438702be6' as same_name_functions,
--     (select string_agg(attname, ',' order by attname) from pg_attribute where attrelid = 'public.profiles'::regclass and attnum > 0 and not attisdropped
--       and has_column_privilege('authenticated', attrelid, attnum, 'UPDATE')) = 'inventory,map,x,y' as profiles_update_cols,
--     (select string_agg(p, ',') from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
--       where has_table_privilege('authenticated', 'public.profiles', p)) = 'SELECT' as profiles_auth_select_only,
--     not has_table_privilege('anon', 'public.profiles', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as profiles_anon_none,
--     not exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f')
--       and (c.relkind not in ('r', 'p') or not c.relrowsecurity)
--       and (has_table_privilege('anon', c.oid, 'INSERT,UPDATE,DELETE') or has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE')
--         or exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
--           and (has_column_privilege('anon', c.oid, a.attnum, 'INSERT,UPDATE') or has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT,UPDATE'))))) as no_open_writes,
--     (select string_agg(distinct tablename || ':' || cmd, ',' order by tablename || ':' || cmd) from pg_policies
--       where schemaname = 'public' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')) = 'blocks:DELETE,blocks:INSERT,profiles:UPDATE' as same_write_policies;

-- ───────── 1. 칸 ─────────
alter table public.pet_care add column if not exists name text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pet_care_name_len' and conrelid = 'public.pet_care'::regclass) then
    alter table public.pet_care add constraint pet_care_name_len check (name is null or char_length(name) between 1 and 8);
  end if;
end;
$$;

-- 갈색 강아지: 종류 검사에 dog_brown(20261128400000_pets.sql의 목록에 하나 더함)
alter table public.profiles drop constraint if exists profiles_pet_kind;
alter table public.profiles add constraint profiles_pet_kind
  check (pet is null or pet in ('dog', 'cat', 'rabbit', 'fox', 'panda', 'penguin', 'blackcat', 'dog_brown'));

-- ───────── 2. 속 함수 ─────────
-- 이름 다듬기: null이면 null(종류 이름). 앞뒤 빈칸을 지우고, 비었거나 8자를 넘거나 제어 문자가 있으면 'bad name'.
create or replace function public.pet_clean_name(n text) returns text
language plpgsql immutable set search_path = ''
as $$
declare
  t text;
begin
  if n is null then
    return null;
  end if;
  t := regexp_replace(n, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  if t = '' or char_length(t) > 8 or t ~ '[[:cntrl:]]' then
    raise exception 'bad name';
  end if;
  return t;
end;
$$;

-- 먹이 하나의 배부름과 좋아하는지. 20261128400000_pets.sql 본문에 ('dog_brown', 'potato')만 더함(갈색 강아지도 강아지처럼 감자).
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
  from (select (kind, food) in (('dog', 'potato'), ('dog_brown', 'potato'), ('cat', 'rebel_carp'), ('blackcat', 'rebel_carp'), ('rabbit', 'carrot'), ('rabbit', 'roadside_grass'),
    ('fox', 'corn'), ('panda', 'carrot'), ('penguin', 'rebel_carp')) as fav) as f;
$$;

-- 20261128400000_pets.sql의 본문에 'name' 한 칸만 더함.
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
    'name', c.name,
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

-- ───────── 3. 화면이 부르는 함수 ─────────
-- 처음 한 마리(무료). 20261128400000_pets.sql 본문에 이름(pet_name, 없으면 종류 이름)과 종류 dog_brown만 더함.
drop function if exists public.set_pet(text);
create or replace function public.set_pet(p text, pet_name text default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  kind text;
  lost integer;
  n smallint;
  nm text;
  c public.pet_care%rowtype;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  if p is null or p not in ('dog', 'cat', 'rabbit', 'fox', 'panda', 'penguin', 'blackcat', 'dog_brown') then
    raise exception 'bad pet';
  end if;
  nm := public.pet_clean_name(pet_name);
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
  insert into public.pet_care (player, chances, name) values (me, coalesce(n, 2), nm) returning * into c;
  return public.pet_view(me, c);
end;
$$;

-- 입양(잃은 뒤에만, 골드). 20261128400000_pets.sql 본문에 이름(pet_name, 없으면 종류 이름)과 종류 dog_brown만 더함.
drop function if exists public.adopt_pet(text);
create or replace function public.adopt_pet(p text, pet_name text default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  c public.pet_care%rowtype;
  r public.pet_rules%rowtype;
  new_gold numeric;
  nm text;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  nm := public.pet_clean_name(pet_name);
  perform public.pet_settle(auth.uid());
  select * into strict me from public.profiles where id = auth.uid() for update;
  if me.pet is not null then
    raise exception 'has pet';
  end if;
  select * into c from public.pet_care as x where x.player = me.id for update;
  if not found or c.lost_count < 1 then
    raise exception 'first';
  end if;
  if p is null or p not in ('dog', 'cat', 'rabbit', 'fox', 'panda', 'penguin', 'blackcat', 'dog_brown') then
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
    walk_carry = 0, rest_carry = 0, camp_carry = 0, chances = r.chances, rearm = true, zero_at = null, lost_at = null,
    name = nm
  where player = me.id
  returning * into c;
  return public.pet_view(me.id, c) || jsonb_build_object('gold', new_gold::text);
end;
$$;

-- 이름 바꾸기(값 없음). 펫이 있을 때만('no pet'), 이름은 pet_clean_name 규칙('bad name', null도 안 됨).
create or replace function public.rename_pet(pet_name text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  kind text;
  nm text;
  c public.pet_care%rowtype;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  nm := public.pet_clean_name(pet_name);
  if nm is null then
    raise exception 'bad name';
  end if;
  c := public.pet_settle(me);
  select x.pet into kind from public.profiles as x where x.id = me;
  if kind is null or c.player is null then
    raise exception 'no pet';
  end if;
  update public.pet_care set name = nm, seen_at = now() where player = me returning * into c;
  return public.pet_view(me, c);
end;
$$;

-- ───────── 4. 권한 ─────────
revoke execute on function public.pet_clean_name(text) from public, anon, authenticated;
revoke execute on function public.pet_food_value(text, text) from public, anon, authenticated;
revoke execute on function public.pet_view(uuid, public.pet_care) from public, anon, authenticated;
revoke execute on function public.set_pet(text, text) from public, anon;
grant execute on function public.set_pet(text, text) to authenticated;
revoke execute on function public.adopt_pet(text, text) from public, anon;
grant execute on function public.adopt_pet(text, text) to authenticated;
revoke execute on function public.rename_pet(text) from public, anon;
grant execute on function public.rename_pet(text) to authenticated;
