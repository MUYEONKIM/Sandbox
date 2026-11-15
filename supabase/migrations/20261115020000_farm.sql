-- 농장(2026-11-15 사용자 요청, 기획은 docs/balance/farm.md). 시작마을 오른쪽 포탈이 새 맵 농장(farm)으로 가고,
-- 농협에서 땅과 씨앗을 사서 내 땅에 심고 거둬 판다. 사막(desert)과 화산(volcano) 맵은 없앤다.
--
-- ⚠ 되돌릴 수 없는 것: 사막과 화산 맵에 놓인 블록을 모두 지운다(사용자가 정함).
--    실행 전에 지워질 개수를 보려면 아래 한 줄만 먼저 실행한다.
--    select map, count(*) from public.blocks where map in ('desert', 'volcano') group by map;
--    두 맵 땅에 버려진 골드와 메모는 지우기 전에 놓은 사람에게 돌려준다(골드는 골드로, 메모는 인벤토리 '메모' 탭으로).
--    두 맵에 마지막으로 있던 사람은 시작마을 오른쪽 포탈 앞으로 옮긴다.
--
-- 골드는 지금 integer 칸이다. 대장간 계획(docs/balance/weapons.md)으로 골드 칸을 상한 없는 수로 바꿀 때 아래 함수의 골드 형식도 함께 바꾼다.

-- ───────── 1. 사막과 화산 정리 ─────────
update public.profiles as p
set gold = p.gold + g.total
from (
  select dropped_by, sum(amount) as total
  from public.ground_items
  where map in ('desert', 'volcano') and amount is not null and dropped_by is not null
  group by dropped_by
) as g
where p.id = g.dropped_by;

update public.memos as m
set holder = g.dropped_by
from public.ground_items as g
where g.memo = m.id and g.map in ('desert', 'volcano') and g.dropped_by is not null;

delete from public.ground_items where map in ('desert', 'volcano');
delete from public.blocks where map in ('desert', 'volcano');
update public.profiles set map = 'plains', x = 42, y = 1 where map in ('desert', 'volcano');

-- ───────── 2. 표 ─────────
-- 작물: 자라는 시간(초), 작물 1개 값(= 씨앗 값), 한 번 거둘 때 기본 개수. 표 값이라 재배포 없이 바꾼다.
create table if not exists public.crops (
  id text primary key,
  name text not null,
  grow_seconds integer not null check (grow_seconds > 0),
  price integer not null check (price > 0),
  yield integer not null default 4 check (yield > 0),
  sort integer not null default 0
);

insert into public.crops (id, name, grow_seconds, price, yield, sort) values
  ('carrot', '당근', 600, 10, 4, 1),
  ('potato', '감자', 3600, 40, 4, 2),
  ('onion', '양파', 14400, 80, 4, 3),
  ('tomato', '토마토', 28800, 130, 4, 4),
  ('eggplant', '가지', 43200, 170, 4, 5),
  ('corn', '옥수수', 86400, 260, 4, 6)
on conflict (id) do nothing;

-- 땅 한 칸에 한 줄. 칭찬 수와 비난 수는 누구나 보지만, 누가 눌렀는지(crop_votes)는 아무도 못 읽는다.
create table if not exists public.farm_plots (
  x integer not null,
  y integer not null,
  owner uuid not null references public.profiles (id) on delete cascade,
  crop text references public.crops (id),
  planted_at timestamptz,
  praise integer not null default 0,
  blame integer not null default 0,
  primary key (x, y),
  check ((crop is null) = (planted_at is null))
);
create index if not exists farm_plots_owner on public.farm_plots (owner);

-- 내 씨앗과 거둔 작물. kind: seed(씨앗), normal(일반), praise(칭찬), blame(비난)
create table if not exists public.farm_stock (
  player uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('seed', 'normal', 'praise', 'blame')),
  crop text not null references public.crops (id),
  count integer not null check (count >= 0),
  primary key (player, kind, crop)
);

-- 칭찬·비난을 누른 기록. 한 사람이 한 작물(같은 칸, 같은 심은 시각)에 10분에 한 번.
create table if not exists public.crop_votes (
  x integer not null,
  y integer not null,
  planted_at timestamptz not null,
  voter uuid not null references public.profiles (id) on delete cascade,
  voted_at timestamptz not null,
  primary key (x, y, planted_at, voter)
);

alter table public.crops enable row level security;
alter table public.farm_plots enable row level security;
alter table public.farm_stock enable row level security;
alter table public.crop_votes enable row level security;
revoke all on public.crops, public.farm_plots, public.farm_stock, public.crop_votes from anon, authenticated;
grant select on public.crops, public.farm_plots, public.farm_stock to authenticated;

drop policy if exists "players read crops" on public.crops;
create policy "players read crops" on public.crops for select to authenticated using (true);
drop policy if exists "players read plots" on public.farm_plots;
create policy "players read plots" on public.farm_plots for select to authenticated using (true);
drop policy if exists "players read own farm stock" on public.farm_stock;
create policy "players read own farm stock" on public.farm_stock for select to authenticated using (player = auth.uid());

-- 땅을 사고팔고 심고 거두면 같은 맵 사람 화면에 바로 보이게 한다.
alter publication supabase_realtime add table public.farm_plots;

-- ───────── 3. 땅 모양과 값 ─────────
-- 농장 46×46칸에서 땅은 2칸 흙길로 나뉜 6×6칸 구획 25개(900칸)다. src/game/farm.ts의 isPlot과 같아야 한다.
create or replace function public.farm_is_plot(px integer, py integer) returns boolean
language sql immutable set search_path = ''
as $$
  select px between 2 and 39 and py between 2 and 39 and (px - 2) % 8 < 6 and (py - 2) % 8 < 6;
$$;

-- n번째 땅 값: 5,000G × 1.08^(n−1)(사용자가 정함)
create or replace function public.land_price(n integer) returns bigint
language sql immutable set search_path = ''
as $$
  select round(5000 * power(1.08::numeric, n - 1))::bigint;
$$;

-- ───────── 4. 함수 ─────────
-- 땅을 한 번에 여러 칸(1~100) 산다. cells는 [[x, y], ...]. 한 칸이라도 이미 주인이 있거나 골드가 모자라면 전부 취소한다.
create or replace function public.buy_plots(cells jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  want integer;
  owned integer;
  added integer;
  total bigint;
  new_gold integer;
begin
  if jsonb_typeof(cells) is distinct from 'array' then
    raise exception 'bad cells';
  end if;
  create temp table if not exists picked (x integer, y integer) on commit drop;
  -- API로 부를 때는 WHERE 없는 DELETE가 막혀 있어(pg_safeupdate) where true를 붙인다.
  delete from picked where true;
  insert into picked select distinct (c ->> 0)::integer, (c ->> 1)::integer from jsonb_array_elements(cells) as c;
  select count(*) into want from picked;
  if want < 1 or want > 100 then
    raise exception 'bad count';
  end if;
  if exists (select 1 from picked where not public.farm_is_plot(picked.x, picked.y)) then
    raise exception 'not a plot';
  end if;

  -- 같은 사람이 동시에 두 번 사도 값이 맞게 내 줄을 잠근다.
  perform 1 from public.profiles where id = me for update;
  select count(*) into owned from public.farm_plots where owner = me;
  select coalesce(sum(public.land_price(owned + i)), 0) into total from generate_series(1, want) as i;

  insert into public.farm_plots (x, y, owner) select picked.x, picked.y, me from picked on conflict do nothing;
  get diagnostics added = row_count;
  if added < want then
    raise exception 'taken';
  end if;

  update public.profiles set gold = gold - total where id = me and gold >= total returning gold into new_gold;
  if not found then
    raise exception 'not enough gold';
  end if;
  return jsonb_build_object('gold', new_gold, 'owned', owned + want, 'cost', total);
end;
$$;

-- 내 땅을 되판다. 받는 돈은 내 마지막 칸 값의 절반이고, 여러 칸이면 비싼 칸부터 차례로 절반씩 더한다.
-- 작물이 있거나 블록이 놓인 칸은 못 판다.
create or replace function public.sell_plots(cells jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  want integer;
  owned integer;
  ok integer;
  refund bigint;
  new_gold integer;
begin
  if jsonb_typeof(cells) is distinct from 'array' then
    raise exception 'bad cells';
  end if;
  create temp table if not exists picked (x integer, y integer) on commit drop;
  -- API로 부를 때는 WHERE 없는 DELETE가 막혀 있어(pg_safeupdate) where true를 붙인다.
  delete from picked where true;
  insert into picked select distinct (c ->> 0)::integer, (c ->> 1)::integer from jsonb_array_elements(cells) as c;
  select count(*) into want from picked;
  if want < 1 or want > 100 then
    raise exception 'bad count';
  end if;

  perform 1 from public.profiles where id = me for update;
  select count(*) into ok
  from picked
  join public.farm_plots as f on f.x = picked.x and f.y = picked.y
  where f.owner = me and f.crop is null
    and not exists (select 1 from public.blocks as b where b.map = 'farm' and b.x = picked.x and b.y = picked.y);
  if ok < want then
    raise exception 'cannot sell';
  end if;

  select count(*) into owned from public.farm_plots where owner = me;
  select coalesce(sum(public.land_price(owned - i) / 2), 0) into refund from generate_series(0, want - 1) as i;
  delete from public.farm_plots as f using picked where f.x = picked.x and f.y = picked.y;
  update public.profiles set gold = gold + refund where id = me returning gold into new_gold;
  return jsonb_build_object('gold', new_gold, 'owned', owned - want, 'refund', refund);
end;
$$;

-- 씨앗을 amount개(1~1,000) 산다. 씨앗 값은 작물 1개 값이다.
create or replace function public.buy_seeds(seed text, amount integer) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  c public.crops%rowtype;
  cost bigint;
  new_gold integer;
  new_count integer;
begin
  if amount is null or amount < 1 or amount > 1000 then
    raise exception 'bad amount';
  end if;
  select * into c from public.crops where id = seed;
  if not found then
    raise exception 'unknown crop';
  end if;
  cost := c.price::bigint * amount;
  update public.profiles set gold = gold - cost where id = auth.uid() and gold >= cost returning gold into new_gold;
  if not found then
    raise exception 'not enough gold';
  end if;
  insert into public.farm_stock as s (player, kind, crop, count) values (auth.uid(), 'seed', c.id, amount)
    on conflict (player, kind, crop) do update set count = s.count + excluded.count
    returning count into new_count;
  return jsonb_build_object('gold', new_gold, 'count', new_count);
end;
$$;

-- 내 빈 땅에 씨앗 하나를 심는다. 농장에 있어야 한다. 남은 씨앗 수를 돌려준다.
create or replace function public.plant_crop(px integer, py integer, seed text) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  left_count integer;
begin
  select * into strict me from public.profiles where id = auth.uid();
  if me.map <> 'farm' then
    raise exception 'not on the farm';
  end if;
  update public.farm_stock set count = count - 1
    where player = me.id and kind = 'seed' and farm_stock.crop = seed and count > 0
    returning count into left_count;
  if not found then
    raise exception 'no seed';
  end if;
  update public.farm_plots set crop = seed, planted_at = now(), praise = 0, blame = 0
    where x = px and y = py and owner = me.id and farm_plots.crop is null;
  if not found then
    raise exception 'cannot plant';
  end if;
  return left_count;
end;
$$;

-- 다 자란 내 작물을 거둔다. 칭찬이 많으면 칭찬 작물, 비난이 많으면 비난 작물, 같으면 일반 작물.
-- 개수는 기본 개수 × (1 + LUK/400)이고 소수점 아래는 그 확률로 1개 더 준다.
create or replace function public.harvest_plot(px integer, py integer) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  f public.farm_plots%rowtype;
  c public.crops%rowtype;
  grade text;
  got integer;
begin
  select * into strict me from public.profiles where id = auth.uid();
  if me.map <> 'farm' then
    raise exception 'not on the farm';
  end if;
  select * into f from public.farm_plots where x = px and y = py for update;
  if not found or f.owner <> me.id or f.crop is null then
    raise exception 'nothing to harvest';
  end if;
  select * into strict c from public.crops where id = f.crop;
  if now() < f.planted_at + c.grow_seconds * interval '1 second' then
    raise exception 'not ripe';
  end if;

  grade := case when f.praise > f.blame then 'praise' when f.blame > f.praise then 'blame' else 'normal' end;
  got := floor(c.yield * (1 + me.luk / 400.0) + random());
  insert into public.farm_stock as s (player, kind, crop, count) values (me.id, grade, c.id, got)
    on conflict (player, kind, crop) do update set count = s.count + excluded.count;
  delete from public.crop_votes where x = px and y = py and planted_at = f.planted_at;
  update public.farm_plots set crop = null, planted_at = null, praise = 0, blame = 0 where x = px and y = py;
  return jsonb_build_object('crop', c.id, 'grade', grade, 'count', got);
end;
$$;

-- 자라는 작물을 칭찬하거나 비난한다. 주인도 누를 수 있고, 한 사람이 한 작물에 10분에 한 번이다.
-- 다 자란 뒤에는 못 누른다. 지금 칭찬 수, 비난 수와 다음에 누를 수 있는 시각을 돌려준다.
create or replace function public.vote_crop(px integer, py integer, good boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  f public.farm_plots%rowtype;
  c public.crops%rowtype;
  last_at timestamptz;
begin
  select * into strict me from public.profiles where id = auth.uid();
  if me.map <> 'farm' then
    raise exception 'not on the farm';
  end if;
  select * into f from public.farm_plots where x = px and y = py for update;
  if not found or f.crop is null then
    raise exception 'nothing growing';
  end if;
  select * into strict c from public.crops where id = f.crop;
  if now() >= f.planted_at + c.grow_seconds * interval '1 second' then
    raise exception 'already ripe';
  end if;
  select voted_at into last_at from public.crop_votes where x = px and y = py and planted_at = f.planted_at and voter = me.id;
  if last_at is not null and last_at > now() - interval '10 minutes' then
    raise exception 'too soon';
  end if;

  insert into public.crop_votes (x, y, planted_at, voter, voted_at) values (px, py, f.planted_at, me.id, now())
    on conflict (x, y, planted_at, voter) do update set voted_at = excluded.voted_at;
  if good then
    update public.farm_plots set praise = praise + 1 where x = px and y = py returning * into f;
  else
    update public.farm_plots set blame = blame + 1 where x = px and y = py returning * into f;
  end if;
  return jsonb_build_object('praise', f.praise, 'blame', f.blame, 'next_at', now() + interval '10 minutes');
end;
$$;

-- 이 작물에 내가 다시 누를 수 있는 시각(누른 적 없으면 null). 누가 눌렀는지는 알려 주지 않는다.
create or replace function public.my_vote_next(px integer, py integer) returns timestamptz
language sql stable security definer set search_path = ''
as $$
  select v.voted_at + interval '10 minutes'
  from public.crop_votes as v
  join public.farm_plots as f on f.x = v.x and f.y = v.y and f.planted_at = v.planted_at
  where v.x = px and v.y = py and v.voter = auth.uid();
$$;

-- 거둔 작물을 모두 판다. 칭찬 작물은 10% 비싸게, 비난 작물은 10% 싸게(1개 값을 반올림). 씨앗은 팔지 않는다.
create or replace function public.sell_crops() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  earned bigint;
  new_gold integer;
begin
  select coalesce(sum(s.count * round(c.price * case s.kind when 'praise' then 1.1 when 'blame' then 0.9 else 1 end)), 0)
    into earned
  from public.farm_stock as s
  join public.crops as c on c.id = s.crop
  where s.player = auth.uid() and s.kind <> 'seed';
  delete from public.farm_stock where player = auth.uid() and kind <> 'seed';
  update public.profiles set gold = gold + earned where id = auth.uid() returning gold into new_gold;
  return jsonb_build_object('gold', new_gold, 'earned', earned);
end;
$$;

-- 농장의 모든 땅과 주인 닉네임. 땅 사기 지도와 농장 화면이 쓴다.
create or replace function public.read_farm()
returns table (x integer, y integer, owner uuid, nickname text, crop text, planted_at timestamptz, praise integer, blame integer)
language sql stable security definer set search_path = ''
as $$
  select f.x, f.y, f.owner, p.nickname, f.crop, f.planted_at, f.praise, f.blame
  from public.farm_plots as f
  join public.profiles as p on p.id = f.owner;
$$;

revoke execute on function
  public.buy_plots(jsonb), public.sell_plots(jsonb), public.buy_seeds(text, integer), public.plant_crop(integer, integer, text),
  public.harvest_plot(integer, integer), public.vote_crop(integer, integer, boolean), public.my_vote_next(integer, integer),
  public.sell_crops(), public.read_farm()
from public, anon;
grant execute on function
  public.buy_plots(jsonb), public.sell_plots(jsonb), public.buy_seeds(text, integer), public.plant_crop(integer, integer, text),
  public.harvest_plot(integer, integer), public.vote_crop(integer, integer, boolean), public.my_vote_next(integer, integer),
  public.sell_crops(), public.read_farm()
to authenticated;

-- ───────── 5. 농장 블록: 내 땅에만 놓고, 회수도 땅 주인만 ─────────
drop policy if exists "players place blocks" on public.blocks;
create policy "players place blocks" on public.blocks for insert to authenticated
with check (
  placed_by = auth.uid()
  and (
    z = 0
    or exists (
      select 1 from public.blocks as below
      where below.map = blocks.map and below.x = blocks.x and below.y = blocks.y and below.z = blocks.z - 1
    )
  )
  and (
    map <> 'farm'
    or exists (select 1 from public.farm_plots as f where f.x = blocks.x and f.y = blocks.y and f.owner = auth.uid())
  )
);

drop policy if exists "players remove blocks" on public.blocks;
create policy "players remove blocks" on public.blocks for delete to authenticated
using (
  not exists (
    select 1 from public.blocks as above
    where above.map = blocks.map and above.x = blocks.x and above.y = blocks.y and above.z = blocks.z + 1
  )
  and (
    map <> 'farm'
    or exists (select 1 from public.farm_plots as f where f.x = blocks.x and f.y = blocks.y and f.owner = auth.uid())
  )
);

notify pgrst, 'reload schema';
