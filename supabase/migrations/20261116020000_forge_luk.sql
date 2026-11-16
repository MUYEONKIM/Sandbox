-- 대장간 무기를 사는 값을 LUK와 상관없이 고정한다(2026-11-16). 사용자가 고른 안 "B: 사는 값만 고정, 산 값을 넘는 몫에만 LUK".
-- 기획: docs/balance/forge-luk.md, PM 공유 노트 forge-plan.md의 "LUK와 상관없는 사는 값 (B, 정함)".
-- - 사는 값 = 무기값(buy_gear). 지금은 모든 무기가 1,000G다.
-- - 판매가 = div(무기값 × (300 × p + LUK × greatest(p − 1000, 0)), 300000), p는 forge_steps.price(무기값 1,000G, LUK 0의 판매가).
--   +0~+7은 LUK와 상관없고 +8부터 무기값을 넘는 몫에만 LUK 배율이 붙는다. 강화비(판매가 1%)와 두루마리 값은 forge_gear가
--   gear_price를 부르므로 따라 바뀐다. 화면 src/game/forge.ts도 같은 식이다.
-- - 바뀌지 않는 것: 확률, +10 바닥, 망치질 간격, 강화 피해 배율, kill_monster의 LUK 배율.
--
-- 보상(에이전트가 정함): 이미 가진 자루는 판매가가 줄어드는 만큼(예전 판매가 − 새 판매가, 이 SQL을 실행할 때의 LUK) 골드를 한 번 준다.
-- 그래서 가진 무기는 바뀌기 전 규칙으로 팔았을 때와 같은 골드가 된다. 팔았거나 부서진 무기는 돌려주지 않는다(forge-luk.md 4장).
-- forge_luk_refunds 표에 사람마다 한 줄을 남겨, 이 파일을 두 번 실행해도 두 번째에는 주지 않는다.
--
-- 이 파일은 통째로 한 번에 실행한다. 순서는 에이전트가 정했다: 받을 사람과 그 자루를 먼저 잠그고, 함수를 바꾼 뒤, 보상을 준다.
-- 잠근 동안 그 사람의 사기·팔기·망치질은 끝날 때까지 기다렸다가 새 값으로 돈다. 그래서 예전 값으로 팔고 보상도 받는 일이 없다.
-- 중간에 오류가 나면 고친 뒤 다시 통째로 실행하면 된다(함수 바꾸기는 다시 해도 같고, 보상은 표에 있는 사람을 건너뛴다).
-- 함수를 바꾸기 전에 보상을 주는 순서는 쓰지 않았다. 보상만 들어가고 함수가 그대로면 예전 값으로 팔아 두 번 받을 수 있어서다.
--
-- 실행 전 확인(읽기만, 이 아래 select만 따로 먼저 실행): LUK가 있고 무기를 가진 사람마다 보상액이 보인다. 맨 끝 확인 select의
-- refunded_players·refunded_gold가 이 결과의 사람 수·합과 같아야 한다(그사이 팔거나 산 사람이 있으면 조금 다를 수 있다).
--   select p.nickname, p.luk, count(*) as gear,
--     sum(div(s.price * w.price * (300 + p.luk), 300000) - div(w.price * (300 * s.price + p.luk * greatest(s.price - 1000, 0)), 300000)) as refund
--   from public.profiles as p join public.gear as g on g.player = p.id join public.weapons as w on w.id = g.kind
--   join public.forge_steps as s on s.level = g.level
--   where p.luk > 0 group by p.id, p.nickname, p.luk order by refund desc;

-- ───────── 1. 보상 기록 표 ─────────
-- 한 사람에 한 줄: 받은 골드와 때. 클라이언트는 읽지도 쓰지도 않는다.
create table if not exists public.forge_luk_refunds (
  player uuid primary key references public.profiles (id) on delete cascade,
  amount numeric not null check (amount > 0),
  created_at timestamptz not null default now()
);
alter table public.forge_luk_refunds enable row level security;
revoke all on public.forge_luk_refunds from anon, authenticated;

-- ───────── 2. 받을 사람과 자루를 잠근다 ─────────
-- buy_gear·sell_gear·forge_gear는 profiles 줄을 먼저, gear 줄을 다음에 잠근다. 같은 순서로 잠가 서로 기다리다 멈추지 않는다.
select 1 from public.profiles as p where p.luk > 0 and exists (select 1 from public.gear as g where g.player = p.id) order by p.id for update;
select 1 from public.gear as g where g.player in (select p.id from public.profiles as p where p.luk > 0) order by g.id for update;

-- ───────── 3. 판매가 ─────────
-- 판매가 = div(무기값 × (300 × p + LUK × greatest(p − 1000, 0)), 300000), p = 단계표 값. 소수점 아래는 버린다.
-- 무기값 이하인 몫(+0~+7)은 LUK와 상관없고, 무기값을 넘는 몫에만 (1 + LUK/300)이 붙는다. 함수 모양과 권한은 그대로다.
create or replace function public.gear_price(lvl integer, base integer, luk bigint) returns numeric
language sql stable set search_path = ''
as $$
  select div(base * (300 * s.price + luk * greatest(s.price - 1000, 0)), 300000) from public.forge_steps as s where s.level = lvl
$$;

-- ───────── 4. 사기 ─────────
-- 무기를 한 자루 산다. 값 = 무기값(LUK와 상관없음). 기본 권총 말고 5자루까지. 돌려주는 모양은 그대로다.
create or replace function public.buy_gear(weapon text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  w public.weapons%rowtype;
  cost numeric;
  held integer;
  new_id bigint;
  new_gold numeric;
begin
  select * into strict me from public.profiles where id = auth.uid() for update;
  select * into w from public.weapons as x where x.id = weapon;
  if not found or w.price <= 0 then
    raise exception 'unknown weapon';
  end if;
  -- D 배포에서 방어구가 같은 표에 들어오므로 무기 종류만 센다.
  select count(*) into held from public.gear as g where g.player = me.id and g.kind in (select x.id from public.weapons as x);
  if held >= 5 then
    raise exception 'too many';
  end if;
  cost := w.price;
  if me.gold < cost then
    raise exception 'not enough gold';
  end if;
  update public.profiles set gold = gold - cost where id = me.id returning gold into new_gold;
  insert into public.gear (player, kind) values (me.id, w.id) returning id into new_id;
  return jsonb_build_object('id', new_id, 'kind', w.id, 'gold', new_gold::text, 'paid', cost::text);
end;
$$;

-- ───────── 5. 보상 ─────────
-- 가진 자루마다 (예전 판매가 − 새 판매가)를 지금 LUK로 셈해 더한 값. 표에 없는 사람에게만 넣고, 넣은 만큼 골드를 더한다.
with owed as (
  select p.id as player,
    sum(div(s.price * w.price * (300 + p.luk), 300000) - div(w.price * (300 * s.price + p.luk * greatest(s.price - 1000, 0)), 300000)) as amount
  from public.profiles as p
  join public.gear as g on g.player = p.id
  join public.weapons as w on w.id = g.kind
  join public.forge_steps as s on s.level = g.level
  where p.luk > 0
  group by p.id
),
given as (
  insert into public.forge_luk_refunds (player, amount)
  select o.player, o.amount from owed as o where o.amount > 0
  on conflict (player) do nothing
  returning player, amount
)
update public.profiles as p set gold = p.gold + given.amount from given where p.id = given.player;

notify pgrst, 'reload schema';

-- ───────── 확인 ─────────
-- refunded_players·refunded_gold: 보상을 받은 사람 수와 준 골드 합(두 번째 실행에도 같아야 한다).
-- 판매가 표본: p0_luk300 500, p7_luk300 998, p10_luk300 1690, p10_luk1000 2495, p30_luk300 210127이어야 한다(예전 식이면 1000, 1996, 2690, 5829, 211127).
select
  (select count(*) from public.forge_luk_refunds) as refunded_players,
  (select coalesce(sum(amount), 0) from public.forge_luk_refunds) as refunded_gold,
  public.gear_price(0, 1000, 300) as p0_luk300,
  public.gear_price(7, 1000, 300) as p7_luk300,
  public.gear_price(10, 1000, 300) as p10_luk300,
  public.gear_price(10, 1000, 1000) as p10_luk1000,
  public.gear_price(30, 1000, 300) as p30_luk300;
