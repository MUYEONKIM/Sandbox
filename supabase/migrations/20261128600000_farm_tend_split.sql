-- 농장 버튼 셋(2026-11-28, 농장 1-1). 사용자 "농장에 구획돌보기 라는 버튼 하나로만 있으니 무슨말인지 모르겠다.
-- 한 번에 심기, 한 번에 칭찬하기 로 이름을 확실하게 해줘" → "버튼 셋으로 (추천)": [한 번에 거두기] [한 번에 심기] [한 번에 칭찬하기].
-- 하는 일: tend_plots에 무엇을 할지 고르는 인자 act를 더한다(함수 셋으로 나누지 않고 한 본문을 그대로 쓴다, 제가 정한 것).
--   act null = 지금처럼 거두기 → 심기 → 칭찬(배포 전 화면과 PC의 F 길게 누르기), 'harvest' 다 자란 내 작물만 거둠,
--   'plant' 빈 내 땅에 든 씨앗만 심음(거두지 않음), 'praise' 자라는 내 작물만 칭찬(한 작물에 10분에 한 번, 다 자란 것은 건너뜀).
--   다루는 땅은 그대로 그 칸이 든 6×6 구획의 내 땅. 본문은 20261128000000_farm_tend.sql에서 복사해 act로 나누는 줄만 바꿨다.
--   인자가 늘어 옛 함수(integer, integer, text)를 지우고 새로 만든다. act 기본값이 null이라 옛 화면({px, py, seed})도 그대로 된다.
--   다시 실행해도 된다(drop if exists, create or replace).
--
-- ⚠ 되돌리기 어려운 것: 없다. 표·줄을 바꾸지 않고 함수만 바꾼다.
--
-- 확인 쿼리(운영 DB에서 읽기만, 10칸 모두 true. 뒤 다섯 칸은 권한 규칙 docs/agent/workflow.md 3절):
--   select
--     to_regprocedure('public.tend_plots(integer,integer,text,text)') is not null and to_regprocedure('public.tend_plots(integer,integer,text)') is null as has_fn,
--     coalesce((select prosecdef from pg_proc where oid = to_regprocedure('public.tend_plots(integer,integer,text,text)')), false) as definer,
--     coalesce(has_function_privilege('authenticated', to_regprocedure('public.tend_plots(integer,integer,text,text)'), 'execute'), false) as auth_can,
--     coalesce(not has_function_privilege('anon', to_regprocedure('public.tend_plots(integer,integer,text,text)'), 'execute'), false) as anon_cannot,
--     coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.tend_plots(integer,integer,text,text)')) = '08fb498d7917e5a1c2c4c44ee2b4822a', false) as same_body,
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

drop function if exists public.tend_plots(integer, integer, text);
create or replace function public.tend_plots(px integer, py integer, seed text default null, act text default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  sx integer;
  sy integer;
  seeds integer := 0;
  planted integer := 0;
  praised integer := 0;
  r record;
  ripe boolean;
  grade text;
  got integer;
  piles jsonb := '{}'::jsonb;
  pile text;
  new_crop text;
  new_at timestamptz;
  new_praise integer;
  new_blame integer;
  changed boolean;
  last_at timestamptz;
  harvested jsonb;
  plots jsonb;
  do_harvest boolean;
  do_plant boolean;
  do_praise boolean;
begin
  -- 무엇을 할지(2026-11-28 농장 1-1): null이면 셋 다(옛 화면), 'harvest' 거두기만, 'plant' 심기만, 'praise' 칭찬만.
  if act is not null and act not in ('harvest', 'plant', 'praise') then
    raise exception 'bad act';
  end if;
  do_harvest := act is null or act = 'harvest';
  do_plant := act is null or act = 'plant';
  do_praise := act is null or act = 'praise';
  select * into strict me from public.profiles where id = auth.uid();
  if me.map <> 'farm' then
    raise exception 'not on the farm';
  end if;
  if px is null or py is null or not public.farm_is_plot(px, py) then
    raise exception 'not a plot';
  end if;
  -- 구획의 왼쪽 위 칸(farm_is_plot: 2~39칸 안에서 8칸마다 6칸이 땅)
  sx := 2 + (px - 2) / 8 * 8;
  sy := 2 + (py - 2) / 8 * 8;

  -- 씨앗: 줄을 잠그고 가진 수를 읽는다(plant_crop과 같은 차례: 씨앗 줄 → 땅 줄).
  if seed is not null and do_plant then
    if not exists (select 1 from public.crops where id = seed) then
      raise exception 'unknown crop';
    end if;
    select s.count into seeds from public.farm_stock as s
      where s.player = me.id and s.kind = 'seed' and s.crop = seed
      for update;
    seeds := coalesce(seeds, 0);
  end if;

  -- 칸마다 마지막 모습을 셈해 한 번만 고친다(실시간 알림이 칸마다 하나).
  for r in
    select f.x, f.y, f.crop, f.planted_at, f.praise, f.blame, c.yield, c.grow_seconds
    from public.farm_plots as f
    left join public.crops as c on c.id = f.crop
    where f.owner = me.id and f.x between sx and sx + 5 and f.y between sy and sy + 5
    order by f.y, f.x
    for update of f
  loop
    new_crop := r.crop;
    new_at := r.planted_at;
    new_praise := r.praise;
    new_blame := r.blame;
    changed := false;

    -- 1. 다 자란 것을 거둔다(harvest_plot과 같은 식).
    ripe := r.crop is not null and now() >= r.planted_at + r.grow_seconds * interval '1 second';
    if ripe and do_harvest then
      grade := case when r.praise > r.blame then 'praise' when r.blame > r.praise then 'blame' else 'normal' end;
      got := floor(r.yield * (1 + me.luk / 400.0) + random());
      pile := r.crop || ':' || grade;
      piles := jsonb_set(piles, array[pile], to_jsonb(coalesce((piles ->> pile)::integer, 0) + got));
      delete from public.crop_votes as v where v.x = r.x and v.y = r.y and v.planted_at = r.planted_at;
      new_crop := null;
      new_at := null;
      new_praise := 0;
      new_blame := 0;
      changed := true;
    end if;

    -- 2. 빈 칸에 든 씨앗을 심는다. 블록이 놓인 칸은 건너뛴다.
    if do_plant and new_crop is null and seeds > 0
      and not exists (select 1 from public.blocks as b where b.map = 'farm' and b.x = r.x and b.y = r.y) then
      new_crop := seed;
      new_at := now();
      new_praise := 0;
      new_blame := 0;
      seeds := seeds - 1;
      planted := planted + 1;
      changed := true;
    end if;

    -- 3. 자라는 것을 칭찬한다. 내가 10분 안에 누른 작물과 거두지 않은 다 자란 작물은 건너뛴다(vote_crop과 같음).
    if do_praise and new_crop is not null and not (ripe and new_at = r.planted_at) then
      last_at := null;
      if new_at = r.planted_at then
        select v.voted_at into last_at from public.crop_votes as v
          where v.x = r.x and v.y = r.y and v.planted_at = new_at and v.voter = me.id;
      end if;
      if last_at is null or last_at <= now() - interval '10 minutes' then
        insert into public.crop_votes (x, y, planted_at, voter, voted_at) values (r.x, r.y, new_at, me.id, now())
          on conflict (x, y, planted_at, voter) do update set voted_at = excluded.voted_at;
        new_praise := new_praise + 1;
        praised := praised + 1;
        changed := true;
      end if;
    end if;

    if changed then
      update public.farm_plots
        set crop = new_crop, planted_at = new_at, praise = new_praise, blame = new_blame
        where x = r.x and y = r.y;
    end if;
  end loop;

  -- 거둔 것을 쌓고, 쓴 씨앗을 뺀다.
  for pile in select jsonb_object_keys(piles) loop
    insert into public.farm_stock as s (player, kind, crop, count)
      values (me.id, split_part(pile, ':', 2), split_part(pile, ':', 1), (piles ->> pile)::integer)
      on conflict (player, kind, crop) do update set count = s.count + excluded.count;
  end loop;
  if planted > 0 then
    update public.farm_stock as s set count = seeds where s.player = me.id and s.kind = 'seed' and s.crop = seed;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('crop', split_part(key, ':', 1), 'grade', split_part(key, ':', 2), 'count', value::integer)), '[]'::jsonb)
    into harvested
  from jsonb_each_text(piles);
  select coalesce(jsonb_agg(jsonb_build_object('x', f.x, 'y', f.y, 'crop', f.crop, 'planted_at', f.planted_at, 'praise', f.praise, 'blame', f.blame)), '[]'::jsonb)
    into plots
  from public.farm_plots as f
  where f.owner = me.id and f.x between sx and sx + 5 and f.y between sy and sy + 5;

  return jsonb_build_object(
    'harvested', harvested,
    'planted', planted,
    'praised', praised,
    'seeds', case when seed is null or not do_plant then null else seeds end,
    'plots', plots
  );
end;
$$;

revoke execute on function public.tend_plots(integer, integer, text, text) from public, anon;
grant execute on function public.tend_plots(integer, integer, text, text) to authenticated;

notify pgrst, 'reload schema';
