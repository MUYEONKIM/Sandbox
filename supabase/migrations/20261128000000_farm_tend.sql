-- 농장 구획 돌보기(2026-11-28, 기획 docs/balance/life-1127.md 2.2 '구획 돌보기', 사용자가 "구획 한꺼번에"로 정함).
-- 한 칸을 주면 그 칸이 든 6×6 구획의 내 땅을 한 번에 돌본다: 다 자란 것을 거두고, 빈 칸에 든 씨앗을 심고,
-- 자라는 것(방금 심은 것 포함)을 칭찬한다. 칭찬은 한 작물에 10분에 한 번(vote_crop과 같음)이다.
-- 남의 작물 비난은 그대로 한 칸씩 vote_crop으로 한다.
--
-- 새 표는 없고 함수 하나만 더한다. 되돌릴 것이 없다.
--
-- 확인 쿼리(운영 DB에서 읽기만, 5칸 모두 true):
--   select
--     to_regprocedure('public.tend_plots(integer,integer,text)') is not null as has_fn,
--     coalesce((select prosecdef from pg_proc where oid = to_regprocedure('public.tend_plots(integer,integer,text)')), false) as definer,
--     coalesce(has_function_privilege('authenticated', 'public.tend_plots(integer,integer,text)', 'execute'), false) as auth_can,
--     coalesce(not has_function_privilege('anon', 'public.tend_plots(integer,integer,text)', 'execute'), false) as anon_cannot,
--     coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.tend_plots(integer,integer,text)')) = '844d529d899294d94a10a183d2773ce8', false) as same_body;

create or replace function public.tend_plots(px integer, py integer, seed text default null) returns jsonb
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
begin
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
  if seed is not null then
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
    if ripe then
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
    if new_crop is null and seeds > 0
      and not exists (select 1 from public.blocks as b where b.map = 'farm' and b.x = r.x and b.y = r.y) then
      new_crop := seed;
      new_at := now();
      new_praise := 0;
      new_blame := 0;
      seeds := seeds - 1;
      planted := planted + 1;
      changed := true;
    end if;

    -- 3. 자라는 것을 칭찬한다. 내가 10분 안에 누른 작물은 건너뛴다(vote_crop과 같음).
    if new_crop is not null then
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
    'seeds', case when seed is null then null else seeds end,
    'plots', plots
  );
end;
$$;

revoke execute on function public.tend_plots(integer, integer, text) from public, anon;
grant execute on function public.tend_plots(integer, integer, text) to authenticated;

notify pgrst, 'reload schema';
