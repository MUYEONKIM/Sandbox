-- 대장간과 새 전투(대장간 배포 B+C, 2026-11-16). 기획은 docs/balance/weapons.md(1·2·6·7장), forge-items.md(3장), dungeon.md(4장).
-- 무기를 자루 단위(gear 표)로 저장하고, 시작마을 대장간 안(smithy 맵)에서 사고, 강화하고, 판다.
-- 무기 열두 자루의 피해·간격·탄창·재장전, 강화 피해 배율(× 1.03^단계), 던전 몬스터 새 값, 처치 골드의 LUK 배율도 함께 넣는다.
--
-- ⚠ 되돌리기 어려운 것: 지금 가진 검과 기관총을 +0 장검, +0 기관총 한 자루씩으로 옮긴다(gear 표에 한 줄씩).
--    예전 칸(profiles.owned_weapons)은 지우지 않고 남겨 두므로 되돌릴 때 쓴다. 되돌리는 SQL은 따로 받는다.
--    기관총을 3,000G에 산 사람에게 차액(2,000G)은 돌려주지 않는다(에이전트가 정함, weapons.md 6).
--    이 파일은 한 번만 실행한다. 두 번 실행해도 무기가 두 번 옮겨지지는 않지만, 그사이 판 검·기관총은 다시 생긴다.
--
-- 실행 전 확인: 아래 두 줄만 먼저 실행해 숫자를 적어 둔다(맨 끝의 확인 select와 견준다).
--    select count(*) as players, count(*) filter (where 'sword' = any(owned_weapons)) as sword, count(*) filter (where 'machinegun' = any(owned_weapons)) as machinegun from public.profiles;
--    select nickname, owned_weapons from public.profiles where owned_weapons <> array['pistol'] order by nickname;
--
-- 에이전트가 정한 것
-- - 무기 id: 검은 'sword' 그대로 두고 이름만 장검으로 한다(옮기는 칸을 줄이려고). 새 종류는 handgun(대형 권총), sniper, shotgun,
--   dagger, greatsword, scimitar, rapier, club, axe.
-- - 탄창은 서버가 맞힌 발만 센다(빗나간 발은 서버가 모른다). 자루마다 맞힌 발을 세고 탄창 수만큼 맞힌 뒤에는 재장전 시간의
--   80%가 지나야 다음 발을 받는다. 그만큼 쉬었으면(재장전했을 수 있으니) 다시 0발부터 센다. 기본 권총은 profiles에 센다.
-- - 사격 번호(shot): 한 번 쏜 것마다 화면이 붙이는 번호. 같은 번호의 두 번째 부름(산탄 다섯 알이 두 사람에게 맞음)은 발사 간격과
--   탄창을 다시 보지 않고, 그 사격의 알 수 합이 무기의 pellets(산탄총 5, 나머지 1)를 넘지 못한다.
-- - 망치질 간격 3초 × 무기값/1,000은 계정마다 profiles.last_forge_at으로 막는다. 화면은 답을 받은 때부터 세므로 서버는 봐주지 않는다.
-- - 강화비는 판매가의 1%(반올림, 최소 1G), 두루마리 값은 forge-items.md 3장 공식에서 올림(최소 1G)이다.
-- - +35 이상으로 오르면 모두에게 알린다(notice 'forge').
-- - 예전 화면(이 SQL 뒤 새 버전을 푸시하기 전)도 그대로 돌아간다: hit_player는 자루 번호 없이 종류만 와도 그 종류의 자루를
--   찾아 쓰고, buy_weapon은 자루를 한 줄 만든다. 예전 화면의 검은 장검 수치(8피해, 0.5초)로 바뀐다.

-- ───────── 1. 무기 표 ─────────
alter table public.weapons
  add column if not exists magazine integer check (magazine is null or magazine > 0),
  add column if not exists reload_ms integer not null default 0 check (reload_ms >= 0),
  add column if not exists pellets integer not null default 1 check (pellets between 1 and 5);

comment on column public.weapons.magazine is '탄창 발 수. 근접 무기는 비움';
comment on column public.weapons.pellets is '한 번 쏠 때 나가는 알 수(산탄총 5)';

-- weapons.md 6장 "처음 넣는 무기". 값은 모두 1,000G, 기본 권총만 0(파는 물건이 아님).
insert into public.weapons (id, blurb, price, damage, cooldown_ms, magazine, reload_ms, pellets, sort) values
  ('pistol', '기본 지급품입니다. 파는 물건이 아닙니다.', 0, 3, 280, 12, 1500, 1, 0),
  ('handgun', '12발 탄창의 큰 권총입니다.', 1000, 3, 280, 12, 1500, 1, 1),
  ('machinegun', '사격 훈련은 없습니다. 많이 쏘면 언젠가 맞습니다.', 1000, 1, 80, 40, 2500, 1, 2),
  ('sniper', '멀리서 한 발씩 크게 맞힙니다. 탄창은 5발입니다.', 1000, 17, 1800, 5, 2500, 1, 3),
  ('shotgun', '가까이에서 다섯 알이 부채꼴로 퍼집니다.', 1000, 2, 1000, 6, 3000, 5, 4),
  ('dagger', '빠르게 찌르지만 1칸만 닿습니다.', 1000, 4, 250, null, 0, 1, 5),
  ('sword', '손잡이 쪽을 잡으십시오. 반대쪽은 아픕니다.', 1000, 8, 500, null, 0, 1, 6),
  ('greatsword', '느리지만 넓게 벱니다.', 1000, 13, 850, null, 0, 1, 7),
  ('scimitar', '빠르게 휘두르는 굽은 칼입니다.', 1000, 5, 330, null, 0, 1, 8),
  ('rapier', '3칸 앞까지 좁게 찌릅니다.', 1000, 6, 450, null, 0, 1, 9),
  ('club', '1칸 앞을 묵직하게 칩니다.', 1000, 10, 600, null, 0, 1, 10),
  ('axe', '한 방이 가장 큰 무기입니다. 좁게 내려찍습니다.', 1000, 15, 900, null, 0, 1, 11)
on conflict (id) do update set
  blurb = excluded.blurb, price = excluded.price, damage = excluded.damage, cooldown_ms = excluded.cooldown_ms,
  magazine = excluded.magazine, reload_ms = excluded.reload_ms, pellets = excluded.pellets, sort = excluded.sort;

-- ───────── 2. 자루 표 ─────────
-- 한 줄이 한 자루다. 기본 권총은 넣지 않는다(누구나 하나 있고, 강화·판매가 안 됨). 화면은 내 줄만 읽는다.
-- mag_used·mag_at·last_shot·shot_pellets는 hit_player가 쓰는 탄창 셈이다.
create table if not exists public.gear (
  id bigint generated always as identity primary key,
  player uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind <> 'pistol'),
  level integer not null default 0 check (level between 0 and 99),
  mag_used integer not null default 0,
  mag_at timestamptz not null default 'epoch',
  last_shot bigint,
  shot_pellets integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists gear_player on public.gear (player);

alter table public.gear enable row level security;
revoke all on public.gear from anon, authenticated;
grant select on public.gear to authenticated;
drop policy if exists "players read own gear" on public.gear;
create policy "players read own gear" on public.gear for select to authenticated using (player = auth.uid());

-- ───────── 3. 강화 단계표 ─────────
-- level k 줄: +k에서 +(k+1)에 도전할 때의 확률(백만분율: 성공 success, 유지 keep, 하락 fall, 파괴 destroy, 넷의 합 1,000,000)과 +k의 판매가(무기값 1,000G, LUK 0).
-- docs/balance/tools/forge.js의 forge()로 만든 값이고 forge-table.md와 같다. 판매가 = price × 무기값/1,000 × (1 + LUK/300).
create table if not exists public.forge_steps (
  level integer primary key check (level between 0 and 99),
  success integer not null check (success >= 0),
  keep integer not null check (keep >= 0),
  fall integer not null check (fall >= 0),
  destroy integer not null check (destroy >= 0),
  price numeric not null check (price > 0),
  check (level = 99 or success + keep + fall + destroy = 1000000)
);

alter table public.forge_steps enable row level security;
revoke all on public.forge_steps from anon, authenticated;
grant select on public.forge_steps to authenticated;
drop policy if exists "players read forge steps" on public.forge_steps;
create policy "players read forge steps" on public.forge_steps for select to authenticated using (true);

insert into public.forge_steps (level, success, keep, fall, destroy, price) values
  (0, 950000, 50000, 0, 0, 500.00),
  (1, 940000, 60000, 0, 0, 551.75),
  (2, 930000, 70000, 0, 0, 608.91),
  (3, 920000, 80000, 0, 0, 672.07),
  (4, 910000, 90000, 0, 0, 741.86),
  (5, 900000, 100000, 0, 0, 818.98),
  (6, 890000, 110000, 0, 0, 904.22),
  (7, 880000, 120000, 0, 0, 998.44),
  (8, 870000, 130000, 0, 0, 1102.61),
  (9, 860000, 140000, 0, 0, 1217.79),
  (10, 700000, 300000, 0, 0, 1345.17),
  (11, 675000, 220278, 104722, 0, 1425.53),
  (12, 650000, 229444, 120556, 0, 1514.42),
  (13, 625000, 237500, 137500, 0, 1611.03),
  (14, 600000, 244444, 155556, 0, 1716.14),
  (15, 580000, 247333, 172667, 0, 1831.01),
  (16, 560000, 249333, 190667, 0, 1956.78),
  (17, 540000, 250444, 209556, 0, 2095.15),
  (18, 520000, 250667, 229333, 0, 2248.36),
  (19, 500000, 210000, 210000, 80000, 2419.37),
  (20, 490000, 212573, 215427, 82000, 3011.32),
  (21, 480000, 215093, 220907, 84000, 3956.68),
  (22, 470000, 217560, 226440, 86000, 5330.31),
  (23, 460000, 219973, 232027, 88000, 7304.93),
  (24, 450000, 222333, 237667, 90000, 10167.44),
  (25, 440000, 224640, 243360, 92000, 14374.58),
  (26, 430000, 226893, 249107, 94000, 20656.33),
  (27, 420000, 229093, 254907, 96000, 30196.26),
  (28, 410000, 231240, 260760, 98000, 44947.18),
  (29, 400000, 233333, 266667, 100000, 68192.45),
  (30, 394000, 233983, 271017, 101000, 105563.76),
  (31, 388000, 234600, 275400, 102000, 165924.92),
  (32, 382000, 235183, 279817, 103000, 264491.70),
  (33, 376000, 235733, 284267, 104000, 427564.60),
  (34, 370000, 236250, 288750, 105000, 701171.37),
  (35, 364000, 236733, 293267, 106000, 1167012.82),
  (36, 358000, 237183, 297817, 107000, 1972299.75),
  (37, 352000, 237600, 302400, 108000, 3386439.54),
  (38, 346000, 237983, 307017, 109000, 5910461.76),
  (39, 340000, 238333, 311667, 110000, 10491751.20),
  (40, 334000, 238650, 316350, 111000, 18952640.19),
  (41, 328000, 238933, 321067, 112000, 34860932.26),
  (42, 322000, 239183, 325817, 113000, 65330174.46),
  (43, 316000, 239400, 330600, 114000, 124812400.22),
  (44, 310000, 239583, 335417, 115000, 243242705.12),
  (45, 304000, 239733, 340267, 116000, 483876660.48),
  (46, 298000, 239850, 345150, 117000, 983155928.23),
  (47, 292000, 239933, 350067, 118000, 2041684844.44),
  (48, 286000, 239983, 355017, 119000, 4336356233.06),
  (49, 280000, 240000, 360000, 120000, 9426019279.57),
  (50, 275000, 240566, 363934, 120500, 20984662929.84),
  (51, 270000, 241114, 367886, 121000, 47700133219.92),
  (52, 265000, 241644, 371856, 121500, 110649048301.25),
  (53, 260000, 242155, 375845, 122000, 261985444170.43),
  (54, 255000, 242648, 379852, 122500, 633426585342.76),
  (55, 250000, 243122, 383878, 123000, 1564677412124.47),
  (56, 245000, 243579, 387921, 123500, 3950892557751.65),
  (57, 240000, 244016, 391984, 124000, 10203462381754.02),
  (58, 235000, 244436, 396064, 124500, 26966731073778.47),
  (59, 230000, 244837, 400163, 125000, 72977707208005.48),
  (60, 225000, 245219, 404281, 125500, 202345121449005.16),
  (61, 220000, 245584, 408416, 126000, 575178200352237.25),
  (62, 215000, 245930, 412570, 126500, 1677233136863378),
  (63, 210000, 246257, 416743, 127000, 5020514255660018),
  (64, 205000, 246566, 420934, 127500, 15436827519235248),
  (65, 200000, 246857, 425143, 128000, 48789228078615216),
  (66, 195000, 247130, 429370, 128500, 158619777647784384),
  (67, 190000, 247384, 433616, 129000, 530861291325451264),
  (68, 185000, 247619, 437881, 129500, 1830334066802595840),
  (69, 180000, 247837, 442163, 130000, 6506598986450069504),
  (70, 176000, 247610, 445700, 130690, 23867981497833361408),
  (71, 172000, 247372, 449249, 131379, 90003756468538048512),
  (72, 168000, 247118, 452813, 132069, 348773628370621169664),
  (73, 164000, 246852, 456389, 132759, 1389450488710251937792),
  (74, 160000, 246572, 459980, 133448, 5693925608435387203584),
  (75, 156000, 246279, 463583, 134138, 24017440537674124361728),
  (76, 152000, 245971, 467201, 134828, 104346912500963839311872),
  (77, 148000, 245651, 470832, 135517, 467278658808691428425728),
  (78, 144000, 245317, 474476, 136207, 2158419392977535607242752),
  (79, 140000, 244969, 478134, 136897, 10291889265494933951741952),
  (80, 136000, 244609, 481805, 137586, 50699859250972046003273728),
  (81, 132000, 244234, 485490, 138276, 258251293550134921552461824),
  (82, 128000, 243846, 489188, 138966, 1361427669842082851343826944),
  (83, 124000, 243445, 492900, 139655, 7434942786407656896400982016),
  (84, 120000, 243029, 496626, 140345, 42104744680847610442504208384),
  (85, 116000, 242601, 500365, 141034, 247526299780557658546472222720),
  (86, 112000, 242159, 504117, 141724, 1512325117750949345643416518656),
  (87, 108000, 241703, 507883, 142414, 9614625584833529971827474956288),
  (88, 104000, 241235, 511662, 143103, 63686866744083050754537586425856),
  (89, 100000, 240752, 515455, 143793, 440155230967225697311033818873856),
  (90, 96667, 240044, 518806, 144483, 3178738031605424109136947896647680),
  (91, 93333, 239328, 522167, 145172, 23870998981998114047361015292624896),
  (92, 90000, 238598, 525540, 145862, 186500254498777502446587171865362432),
  (93, 86667, 237858, 528923, 146552, 1517780912251346345070866273910390784),
  (94, 83333, 237109, 532317, 147241, 12884216399794530543689240306094440448),
  (95, 80000, 236348, 535721, 147931, 114254736394970919347954345877027422208),
  (96, 76667, 235575, 539137, 148621, 1060127874489496855500168531557199380480),
  (97, 73333, 234794, 542563, 149310, 10310261329784355667988939183521940897792),
  (98, 70000, 234000, 546000, 150000, 105301575456279309608767349314365564125184),
  (99, 0, 0, 0, 0, 1131765554384914842466060728350972225519616)
on conflict (level) do update set
  success = excluded.success, keep = excluded.keep, fall = excluded.fall, destroy = excluded.destroy, price = excluded.price;

-- ───────── 4. 프로필 칸 ─────────
-- last_forge_at: 마지막 망치질. pistol_*: 기본 권총의 탄창 셈(자루 표의 mag_used·mag_at·last_shot·shot_pellets와 같다).
alter table public.profiles
  add column if not exists last_forge_at timestamptz not null default 'epoch',
  add column if not exists pistol_mag integer not null default 0,
  add column if not exists pistol_mag_at timestamptz not null default 'epoch',
  add column if not exists pistol_shot bigint,
  add column if not exists pistol_pellets integer not null default 0;

-- ───────── 5. 가진 무기 옮기기 ─────────
-- 검 → +0 장검('sword'), 기관총 → +0 기관총. 이미 그 종류 자루가 있으면 넣지 않는다(두 번 실행해도 한 번만).
insert into public.gear (player, kind)
select p.id, w.kind
from public.profiles as p
cross join (values ('sword'), ('machinegun')) as w (kind)
where w.kind = any(p.owned_weapons)
  and not exists (select 1 from public.gear as g where g.player = p.id and g.kind = w.kind);

-- ───────── 6. 판매가 ─────────
-- 판매가 = 단계표 값 × 무기값/1,000 × (1 + LUK/300), 소수점 아래는 버린다. 화면(src/game/forge.ts)도 같은 식이다.
create or replace function public.gear_price(lvl integer, base integer, luk bigint) returns numeric
language sql stable set search_path = ''
as $$
  select div(s.price * base * (300 + luk), 300000) from public.forge_steps as s where s.level = lvl
$$;

-- ───────── 7. 사기·팔기·강화 ─────────
-- 무기를 한 자루 산다. 값 = 무기값 × (1 + LUK/300)(버림). 기본 권총 말고 5자루까지.
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
  cost := div(w.price::numeric * (300 + me.luk), 300);
  if me.gold < cost then
    raise exception 'not enough gold';
  end if;
  update public.profiles set gold = gold - cost where id = me.id returning gold into new_gold;
  insert into public.gear (player, kind) values (me.id, w.id) returning id into new_id;
  return jsonb_build_object('id', new_id, 'kind', w.id, 'gold', new_gold::text, 'paid', cost::text);
end;
$$;

-- 예전 화면의 상점이 부른다(새 버전을 푸시하기 전 몇 분). 자루를 한 줄 만들고, 예전 화면이 읽는 owned_weapons에도 넣는다.
create or replace function public.buy_weapon(weapon text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  bought jsonb;
begin
  bought := public.buy_gear(weapon);
  update public.profiles set owned_weapons = array_append(owned_weapons, weapon)
    where id = auth.uid() and not weapon = any(owned_weapons);
  return bought ->> 'gold';
end;
$$;

-- 자루 하나를 지금 판매가에 판다.
create or replace function public.sell_gear(item bigint) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  g public.gear%rowtype;
  w public.weapons%rowtype;
  earned numeric;
  new_gold numeric;
begin
  select * into strict me from public.profiles where id = auth.uid() for update;
  select * into g from public.gear as x where x.id = item and x.player = me.id for update;
  if not found then
    raise exception 'not owned';
  end if;
  select * into strict w from public.weapons as x where x.id = g.kind;
  earned := public.gear_price(g.level, w.price, me.luk);
  delete from public.gear as x where x.id = g.id;
  update public.profiles set gold = gold + earned where id = me.id returning gold into new_gold;
  return jsonb_build_object('gold', new_gold::text, 'earned', earned::text);
end;
$$;

-- 망치질 한 번. 대장간 안(smithy)에 있어야 하고, 3초 × 무기값/1,000마다 한 번이다.
-- 두루마리(forge-items.md 3장): guard 파괴 방지(파괴 → 유지), hold 하락 방지(하락 → 유지), boost 성공(유지 10%p → 성공).
-- 값은 망치질할 때 함께 낸다. 쓸 곳이 없는 단계에서 고르면 거절한다.
-- 돌려주는 것: result(success, keep, drop, destroy), saved(두루마리가 바꿨으면 guard 또는 hold), level(파괴면 null),
-- gold, paid(강화비 + 두루마리), price(새 판매가, 파괴면 0). 골드 셋은 글자다.
create or replace function public.forge_gear(item bigint, guard boolean default false, hold boolean default false, boost boolean default false)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  g public.gear%rowtype;
  w public.weapons%rowtype;
  st public.forge_steps%rowtype;
  sale numeric;
  cost numeric;
  p_success integer;
  p_keep integer;
  roll integer;
  outcome text;
  saved text;
  new_level integer;
  new_gold numeric;
  next_price numeric := 0;
begin
  select * into strict me from public.profiles where id = auth.uid() for update;
  if me.map <> 'smithy' then
    raise exception 'not at the smithy';
  end if;
  select * into g from public.gear as x where x.id = item and x.player = me.id for update;
  if not found then
    raise exception 'not owned';
  end if;
  select * into strict w from public.weapons as x where x.id = g.kind;
  if me.last_forge_at > now() - (3 * w.price) * interval '1 millisecond' then
    raise exception 'too fast';
  end if;
  if g.level >= 99 then
    raise exception 'max level';
  end if;
  select * into strict st from public.forge_steps as x where x.level = g.level;

  sale := public.gear_price(g.level, w.price, me.luk);
  cost := greatest(1, div(sale + 50, 100));
  p_success := st.success;
  p_keep := st.keep;
  if guard then
    if st.destroy = 0 then
      raise exception 'guard not usable';
    end if;
    cost := cost + greatest(1, div(st.destroy * sale * 11 + 9999999, 10000000));
  end if;
  if hold then
    if st.fall = 0 then
      raise exception 'hold not usable';
    end if;
    cost := cost + greatest(1, div(st.fall * (sale - public.gear_price(g.level - 1, w.price, me.luk)) * 11 + 9999999, 10000000));
  end if;
  if boost then
    if st.keep < 100000 then
      raise exception 'boost not usable';
    end if;
    cost := cost + greatest(1, div((public.gear_price(g.level + 1, w.price, me.luk) - sale) * 11 + 99, 100));
    p_success := p_success + 100000;
    p_keep := p_keep - 100000;
  end if;
  if me.gold < cost then
    raise exception 'not enough gold';
  end if;

  roll := floor(random() * 1000000);
  if roll < p_success then
    outcome := 'success';
  elsif roll < p_success + p_keep then
    outcome := 'keep';
  elsif roll < p_success + p_keep + st.fall then
    outcome := 'drop';
  else
    outcome := 'destroy';
  end if;
  if outcome = 'drop' and hold then
    outcome := 'keep';
    saved := 'hold';
  elsif outcome = 'destroy' and guard then
    outcome := 'keep';
    saved := 'guard';
  end if;

  update public.profiles set gold = gold - cost, last_forge_at = now() where id = me.id returning gold into new_gold;
  if outcome = 'destroy' then
    delete from public.gear as x where x.id = g.id;
  else
    new_level := g.level + case outcome when 'success' then 1 when 'drop' then -1 else 0 end;
    update public.gear as x set level = new_level where x.id = g.id;
    next_price := public.gear_price(new_level, w.price, me.luk);
  end if;

  if outcome = 'success' and new_level >= 35 then
    perform realtime.send(
      jsonb_build_object('kind', 'forge', 'name', me.nickname, 'item', g.kind, 'level', new_level),
      'notice',
      'world-chat',
      true
    );
  end if;
  return jsonb_build_object(
    'result', outcome, 'saved', saved, 'level', new_level,
    'gold', new_gold::text, 'paid', cost::text, 'price', next_price::text
  );
end;
$$;

-- ───────── 8. 공격 ─────────
-- 인자: gear(쏜 자루, 기본 권총은 비움), shot(사격 번호), pellets(이 사람에게 맞은 알 수, 산탄총 1~5).
-- 예전 화면은 target과 weapon만 보낸다. 그때는 그 종류의 첫 자루를 쓰고 부를 때마다 새 사격으로 센다.
-- 피해 = 무기 피해 × 알 수 × 1.03^단계 × (1 + STR/1000) × 1000/(1000 + DEF). 돌려주는 것은 맞은 사람의 남은 체력.
drop function if exists public.hit_player(uuid, text);

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
  -- 공격 금지: 시작마을과 그 안의 상점(mart)·대장간(smithy) 안 맵.
  if not found or victim.map <> attacker.map or victim.hp <= 0 or attacker.map in ('plains', 'mart', 'smithy') then
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

-- ───────── 9. 던전 ─────────
-- 몬스터 최종 값(dungeon.md 4장, 던전 세션이 확정하고 사용자가 "넘겨"). 임시 값을 넣었든 안 넣었든 덮어쓴다.
-- 속도, 공격 간격, 거리, 쫓는 거리, 수는 그대로다.
update public.monsters set hp = 65, damage = 4, gold = 290, exp = 25000 where id = 'orc';
update public.monsters set hp = 110, damage = 6, gold = 430, exp = 36000 where id = 'soldier';
update public.monsters set hp = 180, damage = 13, gold = 795, exp = 66000 where id = 'demon';
update public.monsters set hp = 300, damage = 22, gold = 1265, exp = 99000 where id = 'blood';

-- 처치 골드 = round(몬스터 골드 × (1 + LUK/300))(사용자가 정함). 경험치에는 곱하지 않는다. gained_gold도 글자로 보낸다.
create or replace function public.kill_monster(kind text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  m public.monsters%rowtype;
  p public.profiles%rowtype;
  gained numeric;
  new_gold numeric;
  leveled jsonb;
begin
  select * into m from public.monsters where id = kind;
  if not found then
    raise exception 'unknown monster';
  end if;

  select * into strict p from public.profiles where id = auth.uid() for update;
  if p.map <> m.dungeon then
    raise exception 'not in that dungeon';
  end if;
  if p.hp <= 0 then
    raise exception 'player is down';
  end if;
  if p.last_kill_at > now() - interval '300 milliseconds' then
    raise exception 'too fast';
  end if;

  gained := round(m.gold::numeric * (300 + p.luk) / 300);
  update public.profiles set gold = gold + gained, last_kill_at = now() where id = p.id returning gold into new_gold;
  leveled := public.gain_exp(p.id, m.exp);
  return leveled || jsonb_build_object('gold', new_gold::text, 'gained_gold', gained::text, 'gained_exp', m.exp);
end;
$$;

-- ───────── 10. 권한 ─────────
revoke execute on function public.gear_price(integer, integer, bigint) from public, anon, authenticated;
revoke execute on function
  public.buy_gear(text), public.buy_weapon(text), public.sell_gear(bigint), public.forge_gear(bigint, boolean, boolean, boolean),
  public.hit_player(uuid, text, bigint, bigint, integer), public.kill_monster(text)
from public, anon;
grant execute on function
  public.buy_gear(text), public.buy_weapon(text), public.sell_gear(bigint), public.forge_gear(bigint, boolean, boolean, boolean),
  public.hit_player(uuid, text, bigint, bigint, integer), public.kill_monster(text)
to authenticated;

-- ───────── 옮긴 뒤 확인 ─────────
-- 이 SQL을 실행하면 아래 결과가 보인다. sword·machinegun(예전 칸을 가진 사람 수)과 sword_gear·machinegun_gear(옮긴 자루 수)가 같아야 한다.
-- monsters는 orc 65/4/290/25000, soldier 110/6/430/36000, demon 180/13/795/66000, blood 300/22/1265/99000이어야 한다.
select
  (select count(*) from public.profiles where 'sword' = any(owned_weapons)) as sword,
  (select count(*) from public.gear where kind = 'sword') as sword_gear,
  (select count(*) from public.profiles where 'machinegun' = any(owned_weapons)) as machinegun,
  (select count(*) from public.gear where kind = 'machinegun') as machinegun_gear,
  (select count(*) from public.weapons) as weapons,
  (select count(*) from public.forge_steps) as forge_steps,
  (select string_agg(id || ' ' || hp || '/' || damage || '/' || gold || '/' || exp, ', ' order by sort, id) from public.monsters) as monsters;
