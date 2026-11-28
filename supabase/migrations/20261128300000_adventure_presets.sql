-- 모험 나누기 프리셋 셋과 스텟 창 전투 수치(2026-11-28, 코드 세션 묶음 4-2).
-- 기획: docs/balance/growth-1127.md 5장(5-B), 8-5절, 9장(기준 레벨은 9-2 A "지금 판 레벨", B·C는 넣지 않음).
-- - adventure_players에 나누기 셋(presets: [{name, hp, atk, def, agi, luc} × 3], 처음 값 모두 '나누기 1~3' · 3 : 3 : 1 : 1 : 0)과
--   저절로 나누기에 쓸 것(auto_preset: 0 추천대로, 1~3 나누기 1~3)을 더한다. 판이 끝나도 남는다(adventure_settle·adventure_start는 이 칸을 쓰지 않음).
-- - adventure_save_preset(slot, name, hp, atk, def, agi, luc): slot 1~3, 이름 1~8자(앞뒤 빈칸 뺌), 스텟마다 0~10 정수, 합 1 이상. 어기면 오류. adventure_view를 돌려준다.
-- - adventure_set_auto(enabled, preset default null): 예전 화면처럼 enabled 하나로 불러도 된다. preset(0~3)이 오면 auto_preset을 바꾼다.
--   켤 때 남은 포인트를 고른 비율로 나눈다(예전과 같음, 비율만 고른 것).
-- - adventure_battle: 저절로 나누기를 auto_preset의 비율로(LUC도 나눔). parts = 다섯 합, unit = floor(남은 포인트 / parts), 나머지는 남긴다. 나머지 본문은 그대로.
-- - adventure_view: presets, autoPreset, combat(전투 수치: level, crit, combo, taken, goldMul, goldLuc, dropMul, dropLuc)을 더한다.
--   combat은 adventure_combat이 adventure_battle과 같은 식으로 셈한다(기준 레벨 = 지금 판 레벨, 받는 피해는 판이 있는 맵 지역의 보통 몬스터).
--   판이 없으면 여덟 칸 모두 null, 지역이 없는 맵(입구 맵)이면 taken만 null.
-- - adventure_power: fx에 칭호 몫 titleExp·titleGold를 따로 더한다(fx.exp·fx.gold는 예전처럼 장신구 + 칭호 합, 전투 식은 그대로).
-- - 버튼으로 나누기는 지금 adventure_assign을 그대로 쓴다(바꾸지 않음).
-- - 값 표(adventure_items, adventure_zones, adventure_tuning)는 읽기만 하고 넣거나 바꾸지 않는다(사용자가 운영 DB에서 직접 바꾼 값을 그대로 둠).
-- 칸 더하기(if not exists)와 함수 다시 만들기뿐이라 다시 실행해도 된다.
--
-- ⚠ 되돌리기 어려운 것(운영 DB):
--   1. adventure_players에 칸 둘(presets, auto_preset)이 생긴다. 지금 있는 사람(2026-11-28 운영 DB 읽기: 8명)은 처음 값(나누기 1~3 모두 3 : 3 : 1 : 1 : 0, 추천대로)을 받는다.
--      저절로 나누기를 켠 사람(같은 읽기: 7명)은 이 SQL 뒤에도 예전과 같은 비율(추천대로)로 나뉜다.
--   2. adventure_set_auto(boolean)를 지우고 adventure_set_auto(boolean, smallint)로 만든다. 예전 화면이 {enabled} 하나로 부르는 것은 그대로 된다.
--
-- 확인 쿼리(운영 DB에서 읽기만, 모든 칸 true):
--   select
--     (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'adventure_players'
--       and column_name in ('presets', 'auto_preset')) = 2 as has_columns,
--     not exists (select 1 from public.adventure_players as a
--       where case when jsonb_typeof(a.presets) = 'array' then jsonb_array_length(a.presets) <> 3 else true end
--         or a.auto_preset not between 0 and 3) as values_ok,
--     to_regprocedure('public.adventure_set_auto(boolean)') is null as old_auto_gone,
--     coalesce(has_function_privilege('authenticated', to_regprocedure('public.adventure_save_preset(integer,text,integer,integer,integer,integer,integer)'), 'execute')
--       and not has_function_privilege('anon', to_regprocedure('public.adventure_save_preset(integer,text,integer,integer,integer,integer,integer)'), 'execute')
--       and has_function_privilege('authenticated', to_regprocedure('public.adventure_set_auto(boolean,smallint)'), 'execute')
--       and not has_function_privilege('anon', to_regprocedure('public.adventure_set_auto(boolean,smallint)'), 'execute')
--       and has_function_privilege('authenticated', to_regprocedure('public.adventure_battle(text,integer,integer)'), 'execute')
--       and not has_function_privilege('anon', to_regprocedure('public.adventure_battle(text,integer,integer)'), 'execute')
--       and not has_function_privilege('authenticated', to_regprocedure('public.adventure_combat(boolean,numeric,text,jsonb)'), 'execute')
--       and not has_function_privilege('authenticated', to_regprocedure('public.adventure_split_ratio(jsonb,smallint)'), 'execute')
--       and not has_function_privilege('authenticated', to_regprocedure('public.adventure_view(uuid)'), 'execute')
--       and not has_function_privilege('authenticated', to_regprocedure('public.adventure_power(uuid)'), 'execute'), false) as grants_ok,
--     coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.adventure_split_ratio(jsonb,smallint)')) = '301abadfd7e49047b0beb48ada1ba167', false) as f_ratio,
--     coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.adventure_power(uuid)')) = 'e2a7bdef763486c7ee6aca6ea7286ad3', false) as f_power,
--     coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.adventure_combat(boolean,numeric,text,jsonb)')) = '3e501d44db4b87ed96c54ec7c2c6ca44', false) as f_combat,
--     coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.adventure_view(uuid)')) = 'cfcd7a63d8fc73f2a2a3cd9c400e2dc4', false) as f_view,
--     coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.adventure_save_preset(integer,text,integer,integer,integer,integer,integer)')) = '57041a185cf9bbd4ec5a6509d418d8be', false) as f_save,
--     coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.adventure_set_auto(boolean,smallint)')) = '3fd0437806a44094dea5f3958f5f72c6', false) as f_auto,
--     coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.adventure_battle(text,integer,integer)')) = 'b72643551d1d1feda98c5e71effe82fc', false) as f_battle;

-- ───────── 1. 나누기 셋과 저절로 나누기에 쓸 것 ─────────
-- presets: 나누기 1~3(배열 셋, 차례가 칸 번호). 쓰기는 adventure_save_preset으로만 한다(adventure_players는 클라이언트가 직접 읽거나 쓰지 않음).
-- auto_preset: 저절로 나누기(adventure_battle, adventure_set_auto)와 레벨 업 창 "나누고 닫기"(화면)가 쓰는 비율. 0 추천대로, 1~3 나누기 1~3.
alter table public.adventure_players add column if not exists presets jsonb not null
  default '[{"name": "나누기 1", "hp": 3, "atk": 3, "def": 1, "agi": 1, "luc": 0},
            {"name": "나누기 2", "hp": 3, "atk": 3, "def": 1, "agi": 1, "luc": 0},
            {"name": "나누기 3", "hp": 3, "atk": 3, "def": 1, "agi": 1, "luc": 0}]'::jsonb
  check (case when jsonb_typeof(presets) = 'array' then jsonb_array_length(presets) = 3 else false end);
alter table public.adventure_players add column if not exists auto_preset smallint not null default 0
  check (auto_preset between 0 and 3);

-- ───────── 2. 고른 비율 ─────────
-- 저절로 나누기의 비율 [HP, ATK, DEF, AGI, LUC]. pick 0(또는 읽을 수 없는 칸, 합 0)은 추천대로 3 : 3 : 1 : 1 : 0(화면 adventureRules.ts SPLIT).
-- adventure_battle과 adventure_set_auto가 함께 쓴다. 화면 statRows도 같은 비율로 나누기 버튼을 셈한다.
create or replace function public.adventure_split_ratio(presets jsonb, pick smallint) returns integer[]
language plpgsql immutable set search_path = ''
as $$
declare
  p jsonb;
  r integer[];
begin
  if pick between 1 and 3 then
    p := presets -> (pick - 1);
  end if;
  if jsonb_typeof(p) = 'object' then
    r := array[
      coalesce((p ->> 'hp')::integer, 0), coalesce((p ->> 'atk')::integer, 0), coalesce((p ->> 'def')::integer, 0),
      coalesce((p ->> 'agi')::integer, 0), coalesce((p ->> 'luc')::integer, 0)
    ];
    if r[1] + r[2] + r[3] + r[4] + r[5] > 0 then
      return r;
    end if;
  end if;
  return array[3, 3, 1, 1, 0];
end;
$$;

-- ───────── 3. 전투 세기(칭호 몫을 따로 보냄) ─────────
-- adventure_power: 20261128200000_titles_ranking.sql 본문 + fx에 titleExp·titleGold(값은 그대로 fx.exp·fx.gold에도 든다).
create or replace function public.adventure_power(who uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  a public.adventure_players%rowtype;
  base_level numeric;
  mul numeric;
  c_hp numeric; c_atk numeric; c_def numeric; c_agi numeric; c_luc numeric;
  full_zones numeric;
  g_hp numeric; g_atk numeric; g_def numeric; g_agi numeric; g_luc numeric;
  combo_add numeric := 0;
  combo_max numeric := 0.5;
  crit_mul numeric := 2;
  leech numeric := 0;
  exp_bonus numeric := 0;
  gold_bonus numeric := 0;
  endure jsonb := '[]';
  it record;
  t_hp numeric;
  -- 장착 무기(main_weapon, 가진 것만): 스텟, 그 스텟에 더할 몫, 특수 효과와 값
  eq_stat text;
  eq_pct numeric := 0;
  eq_fx text;
  eq_fx_value numeric := 0;
  guard numeric := 0;
  drop_bonus numeric := 0;
  -- 무기 고정 수치(포인트, 2026-11-19 사용자 "이대로 (추천)", 기획 10장 '고정 수치'): 스텟마다 컬렉션 몫 + 장착 몫
  f_hp numeric := 0; f_atk numeric := 0; f_def numeric := 0; f_agi numeric := 0; f_luc numeric := 0;
  eq_flat numeric := 0;
  t_exp numeric := 0;
  t_gold numeric := 0;
begin
  select * into strict me from public.profiles as p where p.id = who;
  select * into strict a from public.adventure_players as x where x.player = who;
  -- 장착 몫 고정 포인트 = floor(장착 % × 2 × 그 무기 지역 보스 레벨)
  select w.stat, w.equip_pct * (1 + 0.25 * (c.copies - 1)), w.equip_fx, w.equip_fx_value,
      floor(w.equip_pct * (1 + 0.25 * (c.copies - 1)) * 2 * z.boss_level)
    into eq_stat, eq_pct, eq_fx, eq_fx_value, eq_flat
    from public.adventure_weapons as w join public.adventure_collection as c on c.weapon = w.id and c.player = who
    join public.adventure_zones as z on z.id = w.zone
    where w.id = a.main_weapon;
  if not found then
    eq_stat := null; eq_pct := 0; eq_fx := null; eq_fx_value := 0; eq_flat := 0;
  end if;
  base_level := floor(me.level / 1000);
  mul := 1 + base_level * 0.25;

  select
    coalesce(sum(w.star * 0.01 * c.copies) filter (where w.stat = 'hp'), 0),
    coalesce(sum(w.star * 0.01 * c.copies) filter (where w.stat = 'atk'), 0),
    coalesce(sum(w.star * 0.01 * c.copies) filter (where w.stat = 'def'), 0),
    coalesce(sum(w.star * 0.01 * c.copies) filter (where w.stat = 'agi'), 0),
    coalesce(sum(w.star * 0.01 * c.copies) filter (where w.stat = 'luc'), 0)
  into c_hp, c_atk, c_def, c_agi, c_luc
  from public.adventure_collection as c join public.adventure_weapons as w on w.id = c.weapon
  where c.player = who;
  -- 컬렉션 몫 고정 포인트: 가진 무기마다 floor(★ × 1% × 가진 수 × 2 × 그 무기 지역 보스 레벨)(무기마다 버림, 계산기 flatOf)
  select
    coalesce(sum(floor(w.star * 0.01 * c.copies * 2 * z.boss_level)) filter (where w.stat = 'hp'), 0),
    coalesce(sum(floor(w.star * 0.01 * c.copies * 2 * z.boss_level)) filter (where w.stat = 'atk'), 0),
    coalesce(sum(floor(w.star * 0.01 * c.copies * 2 * z.boss_level)) filter (where w.stat = 'def'), 0),
    coalesce(sum(floor(w.star * 0.01 * c.copies * 2 * z.boss_level)) filter (where w.stat = 'agi'), 0),
    coalesce(sum(floor(w.star * 0.01 * c.copies * 2 * z.boss_level)) filter (where w.stat = 'luc'), 0)
  into f_hp, f_atk, f_def, f_agi, f_luc
  from public.adventure_collection as c
  join public.adventure_weapons as w on w.id = c.weapon
  join public.adventure_zones as z on z.id = w.zone
  where c.player = who;
  case eq_stat
    when 'hp' then f_hp := f_hp + eq_flat;
    when 'atk' then f_atk := f_atk + eq_flat;
    when 'def' then f_def := f_def + eq_flat;
    when 'agi' then f_agi := f_agi + eq_flat;
    when 'luc' then f_luc := f_luc + eq_flat;
    else null;
  end case;
  -- 장착 무기 스텟은 컬렉션 보너스와 따로 더한다(계산기 statsWith의 col[stat] += …).
  case eq_stat
    when 'hp' then c_hp := c_hp + eq_pct;
    when 'atk' then c_atk := c_atk + eq_pct;
    when 'def' then c_def := c_def + eq_pct;
    when 'agi' then c_agi := c_agi + eq_pct;
    when 'luc' then c_luc := c_luc + eq_pct;
    else null;
  end case;

  -- '지역 무기 다 모음 +5%'는 지역 여덟(sort 1~8)만 센다(기획 10장, 새 지역 무기 셋은 모두 반드시 얻어 세면 거저 붙음)
  select 0.05 * count(*) into full_zones from (
    select w.zone from public.adventure_weapons as w
    join public.adventure_zones as z on z.id = w.zone
    left join public.adventure_collection as c on c.weapon = w.id and c.player = who
    where z.sort <= 8
    group by w.zone having count(c.weapon) = count(*)
  ) as done;

  -- 보석: 그 스텟 고정 포인트(2026-11-19 사용자 "보석은 %로 하지않고, 절대값으로 한다.", 기획 9장). 예전은 % 합
  select
    coalesce(sum(i.value) filter (where i.stat = 'hp'), 0),
    coalesce(sum(i.value) filter (where i.stat = 'atk'), 0),
    coalesce(sum(i.value) filter (where i.stat = 'def'), 0),
    coalesce(sum(i.value) filter (where i.stat = 'agi'), 0),
    coalesce(sum(i.value) filter (where i.stat = 'luc'), 0)
  into g_hp, g_atk, g_def, g_agi, g_luc
  from public.adventure_owned as o join public.adventure_items as i on i.id = o.item
  where o.player = who and o.slot is not null and i.kind = 'gem';

  for it in
    select i.kind, i.value, i.value2 from public.adventure_owned as o join public.adventure_items as i on i.id = o.item
    where o.player = who and o.slot is not null and i.kind <> 'gem'
  loop
    if it.kind = 'learn' then
      exp_bonus := exp_bonus + it.value;
    elsif it.kind = 'pouch' then
      gold_bonus := gold_bonus + it.value;
    elsif it.kind = 'combo' then
      combo_add := combo_add + it.value;
      combo_max := greatest(combo_max, it.value2);
    elsif it.kind = 'sharp' then
      crit_mul := greatest(crit_mul, it.value);
    elsif it.kind = 'leech' then
      leech := greatest(leech, it.value);
    elsif it.kind = 'endure' then
      endure := endure || jsonb_build_array(jsonb_build_array(it.value, coalesce(it.value2, 0)));
    end if;
  end loop;
  -- 장착 무기 특수 효과는 장신구에 더한다(날카로운 반지 ×2.5 + 0.5 = ×3, 연타 반지 상한 60% + 10%p = 70%).
  if eq_fx = 'crit' then
    crit_mul := crit_mul + eq_fx_value;
  elsif eq_fx = 'combo' then
    combo_add := combo_add + eq_fx_value;
    combo_max := combo_max + eq_fx_value;
  elsif eq_fx = 'leech' then
    leech := leech + eq_fx_value;
  elsif eq_fx = 'guard' then
    guard := eq_fx_value;
  elsif eq_fx = 'drop' then
    drop_bonus := eq_fx_value;
  end if;

  -- 단 칭호 효과(2026-11-28, ranking-titles.md 3-2·3-3): 무기 1위 판 경험치 +75%, 모험 1~3위 판 금화 +10·6·3%. 장신구 효과와 같은 괄호에 더한다.
  select coalesce(max(f.fx_exp), 0), coalesce(max(f.fx_gold), 0) into t_exp, t_gold from public.worn_title_fx(who) as f;
  exp_bonus := exp_bonus + t_exp;
  gold_bonus := gold_bonus + t_gold;

  t_hp := greatest(0, me.max_hp - 100);
  return jsonb_build_object(
    'hp', (100 + (a.run_hp + t_hp * 10 + f_hp + g_hp) * 5) * (1 + c_hp + full_zones) * mul,
    'atk', (10 + (a.run_atk + me.str * 10 + f_atk + g_atk)) * (1 + c_atk + full_zones) * mul,
    'def', (a.run_def + me.def * 10 + f_def + g_def) * 3 * (1 + c_def + full_zones) * mul,
    'agi', (a.run_agi + me.agi * 10 + f_agi + g_agi) * (1 + c_agi + full_zones) * mul,
    'luc', (a.run_luc + me.luk * 10 + f_luc + g_luc) * (1 + c_luc + full_zones) * mul,
    'base', base_level,
    'mul', mul,
    'town', jsonb_build_object('hp', t_hp, 'atk', me.str, 'def', me.def, 'agi', me.agi, 'luc', me.luk),
    -- 무기 고정 포인트(스텟마다 컬렉션 + 장착, 포인트라 HP는 × 5, DEF는 × 3으로 보임)
    'flat', jsonb_build_object('hp', f_hp, 'atk', f_atk, 'def', f_def, 'agi', f_agi, 'luc', f_luc),
    -- 낀 보석 고정 포인트(스텟마다 합, 포인트라 HP는 × 5, DEF는 × 3으로 보임)
    'gem', jsonb_build_object('hp', g_hp, 'atk', g_atk, 'def', g_def, 'agi', g_agi, 'luc', g_luc),
    'bonus', jsonb_build_object(
      'hp', c_hp + full_zones, 'atk', c_atk + full_zones, 'def', c_def + full_zones,
      'agi', c_agi + full_zones, 'luc', c_luc + full_zones
    ),
    'fx', jsonb_build_object(
      'comboAdd', combo_add, 'comboMax', combo_max, 'critMul', crit_mul, 'leech', leech, 'endure', endure,
      'exp', exp_bonus, 'gold', gold_bonus, 'guard', guard, 'drop', drop_bonus,
      -- 칭호 몫(위 exp·gold에 이미 들어 있음, 2026-11-28 기획 growth-1127.md 9-3): 스텟 창 괄호에 장신구 몫과 나눠 보인다
      'titleExp', t_exp, 'titleGold', t_gold
    ),
    -- 화면에 보일 장착 효과(숫자만). 장착이 없거나 가진 무기가 아니면 null
    'equip', case when eq_stat is null then null else jsonb_build_object(
      'weapon', a.main_weapon, 'stat', eq_stat, 'pct', eq_pct, 'flat', eq_flat, 'fx', eq_fx, 'value', eq_fx_value
    ) end
  );
end;
$$;

-- ───────── 4. 스텟 창 전투 수치 ─────────
-- 기획 growth-1127.md 9-1·9-3(기준 레벨 L = 지금 판 레벨). 식은 adventure_battle의 것을 그대로 옮긴다:
--   crit 크리티컬 = min(0.5, (AGI + LUC) ÷ (AGI + LUC + 4L)), combo 연속 공격 = min(comboMax, AGI ÷ (AGI + 4L) + comboAdd),
--   taken 받는 피해 비율 = mATK ÷ (mATK + DEF) × (1 − 막기)(mATK = 판이 있는 맵 지역 세기 × (5 + 1.5L) × foe_atk_x × foe_x, 보통 몬스터, 구역 보너스 없음.
--     전투의 받는 피해 mATK² ÷ (mATK + DEF) × (1 − 막기)를 DEF·막기가 없을 때의 mATK로 나눈 값),
--   goldLuc = 1 + 3 × LUC ÷ (LUC + 4L), goldMul = goldLuc × (1 + fx.gold), dropLuc = 1 + LUC ÷ (LUC + 4L), dropMul = dropLuc × (1 + fx.drop).
-- 판이 없으면 여덟 칸 모두 null, 판이 있는 맵에 지역이 없으면(입구 맵) taken만 null. 화면 src/ui/adventure.ts combatRows가 숫자로 보인다.
create or replace function public.adventure_combat(in_run boolean, run_level numeric, run_map text, pw jsonb) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  lv numeric := adventure_combat.run_level;
  p_def double precision; p_agi double precision; p_luc double precision;
  luc numeric;
  d numeric;
  t_foe_atk numeric; t_foe numeric;
  m_atk double precision;
  taken double precision;
  gold_luc numeric;
  drop_luc numeric;
begin
  if not coalesce(adventure_combat.in_run, false) or lv is null or lv < 1 then
    return jsonb_build_object('level', null, 'crit', null, 'combo', null, 'taken', null,
      'goldMul', null, 'goldLuc', null, 'dropMul', null, 'dropLuc', null);
  end if;
  p_def := (pw ->> 'def')::double precision;
  p_agi := (pw ->> 'agi')::double precision;
  p_luc := (pw ->> 'luc')::double precision;
  luc := (pw ->> 'luc')::numeric;
  select z.strength into d
    from public.adventure_maps as m join public.adventure_zones as z on z.id = m.zone
    where m.map = adventure_combat.run_map;
  select max(q.value) filter (where q.key = 'foe_atk_x'), max(q.value) filter (where q.key = 'foe_x')
    into t_foe_atk, t_foe from public.adventure_tuning as q;
  if d is not null and t_foe_atk is not null and t_foe is not null then
    -- adventure_battle의 m_atk(보통 몬스터라 atk_mul 1)
    m_atk := d * (5 + 1.5 * lv) * (1::double precision) * t_foe_atk * t_foe;
    taken := m_atk / (m_atk + p_def) * (1 - coalesce((pw -> 'fx' ->> 'guard')::double precision, 0));
  end if;
  gold_luc := 1 + 3 * luc / (luc + 4 * lv);
  drop_luc := 1 + luc / (luc + 4 * lv);
  return jsonb_build_object(
    'level', lv::text,
    'crit', least(0.5, (p_agi + p_luc) / (p_agi + p_luc + lv * 4)),
    'combo', least((pw -> 'fx' ->> 'comboMax')::double precision, p_agi / (p_agi + lv * 4) + (pw -> 'fx' ->> 'comboAdd')::double precision),
    'taken', taken,
    'goldMul', gold_luc * (1 + (pw -> 'fx' ->> 'gold')::numeric),
    'goldLuc', gold_luc,
    'dropMul', drop_luc * (1 + coalesce((pw -> 'fx' ->> 'drop')::numeric, 0)),
    'dropLuc', drop_luc
  );
end;
$$;

-- ───────── 5. 모험 창 값 ─────────
-- adventure_view: 20261117000000_adventure.sql 본문 + presets·autoPreset·combat. adventure_power는 한 번만 부른다.
create or replace function public.adventure_view(who uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'bp', a.bp, 'inRun', a.in_run, 'runMap', a.run_map, 'runBosses', to_jsonb(a.run_bosses),
    'level', a.run_level::text, 'exp', a.run_exp::text, 'points', a.run_points::text,
    'spent', jsonb_build_object('hp', a.run_hp::text, 'atk', a.run_atk::text, 'def', a.run_def::text, 'agi', a.run_agi::text, 'luc', a.run_luc::text),
    'runGold', a.run_gold::text, 'wins', a.run_wins, 'losses', a.run_losses, 'drops', a.run_drops,
    'auto', a.auto_split, 'autoPreset', a.auto_preset, 'presets', a.presets, 'slots', a.slots, 'mainWeapon', a.main_weapon,
    'bosses', (select coalesce(jsonb_agg(b.zone order by b.zone), '[]') from public.adventure_bosses as b where b.player = who),
    'zones', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', z.id, 'name', z.name, 'map', z.map, 'strength', z.strength,
        'first', (select min(s.level) from public.adventure_spots as s where s.zone = z.id and s.kind = 'normal'),
        'maps', (select coalesce(jsonb_agg(mp.map order by mp.idx), '[]') from public.adventure_maps as mp where mp.zone = z.id),
        'bossLevel', z.boss_level, 'bossStrength', z.boss_strength,
        'open', z.unlock_after is null or exists (select 1 from public.adventure_bosses as b where b.player = who and b.zone = z.unlock_after),
        'minis', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'idx', m.idx, 'name', m.name, 'level', m.level, 'strength', m.strength, 'gold', m.gold, 'weapon', m.weapon,
            'killed', exists (select 1 from public.adventure_mini_kills as k where k.player = who and k.zone = m.zone and k.idx = m.idx)
          ) order by m.idx), '[]')
          from public.adventure_minis as m where m.zone = z.id
        )
      ) order by z.sort), '[]')
      from public.adventure_zones as z
    ),
    'shop', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'kind', i.kind, 'stat', i.stat, 'tier', i.tier, 'name', i.name, 'value', i.value, 'value2', i.value2,
        'price', i.price::text, 'opens', i.opens, 'stack', i.stack
      ) order by i.sort), '[]')
      from public.adventure_items as i
    ),
    'owned', (
      select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'item', o.item, 'slot', o.slot, 'paid', o.paid::text) order by o.id), '[]')
      from public.adventure_owned as o where o.player = who
    ),
    'collection', (
      select coalesce(jsonb_agg(jsonb_build_object('weapon', c.weapon, 'copies', c.copies) order by c.weapon), '[]')
      from public.adventure_collection as c where c.player = who
    ),
    'power', w.pw,
    -- 전투 수치(기준 레벨은 지금 판 레벨, 2026-11-28 기획 growth-1127.md 9-3)
    'combat', public.adventure_combat(a.in_run, a.run_level, a.run_map, w.pw),
    'townLevel', p.level::text,
    'townGold', p.gold::text
  )
  from public.adventure_players as a join public.profiles as p on p.id = a.player
  -- adventure_power를 한 번만 부른다(offset 0: 위로 풀려 power와 combat에서 두 번 셈하지 않게)
  cross join lateral (select public.adventure_power(who) as pw offset 0) as w
  where a.player = who;
$$;

-- ───────── 6. 나누기 저장 ─────────
-- 나누기 칸 하나(slot 1~3)의 이름과 비율을 바꾼다. 판 중이든 아니든, 필드에서도 된다. 다른 칸은 그대로 둔다.
-- 이름은 앞뒤 빈칸을 빼고 1~8자(제어 문자 없음), 스텟마다 0~10 정수, 합 1 이상(기획 8-5). 어기면 오류를 내고 아무것도 바꾸지 않는다.
create or replace function public.adventure_save_preset(slot integer, name text, hp integer, atk integer, def integer, agi integer, luc integer) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  label text := btrim(adventure_save_preset.name);
begin
  if adventure_save_preset.slot is null or adventure_save_preset.slot not between 1 and 3 then
    raise exception 'bad slot';
  end if;
  if label is null or char_length(label) not between 1 and 8 or label ~ '[[:cntrl:]]' then
    raise exception 'bad preset name';
  end if;
  if adventure_save_preset.hp is null or adventure_save_preset.atk is null or adventure_save_preset.def is null
    or adventure_save_preset.agi is null or adventure_save_preset.luc is null
    or least(adventure_save_preset.hp, adventure_save_preset.atk, adventure_save_preset.def, adventure_save_preset.agi, adventure_save_preset.luc) < 0
    or greatest(adventure_save_preset.hp, adventure_save_preset.atk, adventure_save_preset.def, adventure_save_preset.agi, adventure_save_preset.luc) > 10
    or adventure_save_preset.hp + adventure_save_preset.atk + adventure_save_preset.def + adventure_save_preset.agi + adventure_save_preset.luc < 1 then
    raise exception 'bad preset';
  end if;
  perform 1 from public.profiles as p where p.id = auth.uid() for update;
  if not found then
    raise exception 'no profile';
  end if;
  perform public.adventure_prepare(auth.uid());
  update public.adventure_players as x set presets = (
    select jsonb_agg(case when i = adventure_save_preset.slot
      then jsonb_build_object('name', label, 'hp', adventure_save_preset.hp, 'atk', adventure_save_preset.atk,
        'def', adventure_save_preset.def, 'agi', adventure_save_preset.agi, 'luc', adventure_save_preset.luc)
      else coalesce(x.presets -> (i - 1), jsonb_build_object('name', '나누기 ' || i, 'hp', 3, 'atk', 3, 'def', 1, 'agi', 1, 'luc', 0))
      end order by i)
    from generate_series(1, 3) as i
  )
  where x.player = auth.uid();
  return public.adventure_view(auth.uid());
end;
$$;

-- ───────── 7. 저절로 나누기 켜고 끄기, 비율 고르기 ─────────
-- adventure_set_auto: 20261118200000_adventure_rework.sql 본문 + preset 인자(0~3, 없으면 그대로)와 고른 비율(LUC도).
-- 인자가 바뀌어 예전 것(boolean 하나)을 지우고 다시 만든다. preset에 기본값이 있어 예전 화면의 {enabled} 하나로 부르는 것도 된다.
drop function if exists public.adventure_set_auto(boolean);
create or replace function public.adventure_set_auto(enabled boolean, preset smallint default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  a public.adventure_players%rowtype;
  ratio integer[];
  parts integer;
  unit numeric;
begin
  if enabled is null or (preset is not null and preset not between 0 and 3) then
    raise exception 'bad value';
  end if;
  select * into me from public.profiles as p where p.id = auth.uid() for update;
  if not found then
    raise exception 'no profile';
  end if;
  a := public.adventure_prepare(me.id);
  -- preset이 오면 저절로 나누기에 쓸 것을 바꾼다(0 추천대로, 1~3 나누기 1~3). 켤 때는 남은 포인트를 그 비율로 나눈다(LUC도).
  a.auto_preset := coalesce(preset, a.auto_preset);
  ratio := public.adventure_split_ratio(a.presets, a.auto_preset);
  parts := ratio[1] + ratio[2] + ratio[3] + ratio[4] + ratio[5];
  unit := case when enabled then floor(a.run_points / parts) else 0 end;
  update public.adventure_players as x set
    auto_split = enabled, auto_preset = a.auto_preset,
    run_hp = x.run_hp + unit * ratio[1], run_atk = x.run_atk + unit * ratio[2], run_def = x.run_def + unit * ratio[3],
    run_agi = x.run_agi + unit * ratio[4], run_luc = x.run_luc + unit * ratio[5],
    run_points = x.run_points - unit * parts
    where x.player = me.id;
  return public.adventure_view(me.id);
end;
$$;

-- ───────── 8. 전투 ─────────
-- adventure_battle: 20261128200000_titles_ranking.sql 본문 + 저절로 나누기를 auto_preset의 비율로(LUC도 나누고 run_luc를 씀).
create or replace function public.adventure_battle(map text, x integer, y integer) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  z public.adventure_zones%rowtype;
  a public.adventure_players%rowtype;
  s public.adventure_spots%rowtype;
  m public.adventure_minis%rowtype;
  is_boss boolean;
  is_mini boolean;
  boss_key text;
  fresh boolean := false;
  first_kill boolean := false;
  bp_gain integer := 0;
  lv numeric;
  d numeric;
  hp_mul double precision := 1;
  atk_mul double precision := 1;
  exp_mul numeric := 1;
  drop_mul numeric := 1;
  pw jsonb;
  p_hp double precision; p_atk double precision; p_def double precision; p_agi double precision; p_luc double precision;
  m_hp double precision; m_atk double precision;
  combo double precision; crit double precision; hit double precision; crit_mul double precision; leech double precision;
  saves jsonb;
  save_left integer;
  saved boolean;
  back double precision;
  my double precision;
  mon double precision;
  dmg double precision;
  is_crit boolean;
  hits integer;
  turns jsonb := '[]';
  won boolean := false;
  luc numeric;
  gain numeric := 0;
  new_level numeric;
  got_points numeric := 0;
  gold_gain numeric := 0;
  parts integer;
  unit numeric;
  ratio integer[];
  dropped text;
  drop_copies integer := 0;
  roll double precision;
  settled jsonb;
  -- 설정 표 값(위 1번의 key)
  t_drop_normal numeric; t_drop_boss numeric; t_exp_base numeric; t_exp_boss numeric;
  t_foe_hp numeric; t_foe_atk numeric; t_foe numeric;
  t_exp3 numeric; t_exp2 numeric; t_exp15 numeric; t_drop3 numeric; t_drop2 numeric; t_foe_hp_half numeric; t_foe_atk_half numeric;
  t_bp_boss numeric; t_bp_mini numeric;
begin
  -- 정각이 지났으면 랭킹 칭호를 먼저 다시 정한다(프로필을 잠그기 전에, 2026-11-28). 칭호 효과는 adventure_power가 본다.
  perform public.refresh_rank_titles();
  select * into me from public.profiles as p where p.id = auth.uid() for update;
  if not found then
    raise exception 'no profile';
  end if;
  select * into s from public.adventure_spots as q where q.map = adventure_battle.map and q.x = adventure_battle.x and q.y = adventure_battle.y;
  if not found then
    raise exception 'no monster';
  end if;
  select * into strict z from public.adventure_zones as q where q.id = s.zone;
  if me.map <> s.map then
    raise exception 'not in the field';
  end if;
  a := public.adventure_prepare(me.id);
  if not a.in_run then
    raise exception 'no run';
  end if;
  if a.run_map is distinct from s.map then
    raise exception 'not in the field';
  end if;
  -- 지역 잠금(앞 지역 보스를 계정이 잡았는지)은 보지 않는다(2026-11-19 사용자 "싸움이 가능해야 한다"). 판이 갈 수 있는 맵은 adventure_move가 정하고
  -- (다음 지역은 이번 판에 보스를 잡아야), 그 맵에 있으면 싸운다. 높은 지역 포탈로 간 판이 화산 폭풍과 앞 지역 포탈로 걸어 돌아간 곳에서 싸울 수 있다.
  is_boss := s.kind = 'boss';
  is_mini := s.kind = 'mini';
  if is_mini then
    select * into strict m from public.adventure_minis as q where q.zone = z.id and q.idx = s.mini;
  end if;
  lv := s.level;
  d := case when is_mini then m.strength when is_boss then z.boss_strength else z.strength end;
  if lv is null then
    raise exception 'no monster';
  end if;
  -- 보스·중간 보스는 판마다 한 번(2026-11-21 사용자 "중간보스, 보스 는 게임 한판 당 한번씩만 잡을수있게"): 이번 판에 이긴 것(run_bosses에 키)과는 싸우지 않는다.
  -- 수문장도 같다(화면은 이긴 뒤 숨김). 별 하늘 보스 둘은 키가 하나('adv_7')라 하나를 이기면 둘 다 못 싸운다. 진 싸움은 키가 붙지 않아 다시 싸운다.
  -- BP·last_battle_at을 쓰기 전에 돌려보낸다. 키는 이긴 뒤 붙이는 것과 같다(보스 'adv_N', 중간 보스 'adv_N#idx', 수문장 'gate:맵').
  boss_key := case when is_boss then z.id when is_mini then z.id || '#' || m.idx end;
  if coalesce(boss_key, case when s.kind = 'gate' then 'gate:' || s.map end) = any (a.run_bosses) then
    raise exception 'already won';
  end if;
  if a.bp <= 0 then
    raise exception 'no bp';
  end if;
  -- 너무 빨리 누름 막기(기획 8장, 연출과 결과 줄을 합한 가장 짧은 시간)
  if a.last_battle_at > now() - interval '2.5 seconds' then
    raise exception 'too fast';
  end if;
  -- 숫자 설정 표(2026-11-23 사용자 "옮겨"): 전투 한 번에 한 번 읽는다(16줄, bp_boss·bp_mini는 2026-11-24). 줄이 빠졌으면 싸우지 않는다.
  select
    max(q.value) filter (where q.key = 'drop_normal'), max(q.value) filter (where q.key = 'drop_boss'),
    max(q.value) filter (where q.key = 'exp_base'), max(q.value) filter (where q.key = 'exp_boss_x'),
    max(q.value) filter (where q.key = 'foe_hp_x'), max(q.value) filter (where q.key = 'foe_atk_x'), max(q.value) filter (where q.key = 'foe_x'),
    max(q.value) filter (where q.key = 'bonus_exp3'), max(q.value) filter (where q.key = 'bonus_exp2'), max(q.value) filter (where q.key = 'bonus_exp15'),
    max(q.value) filter (where q.key = 'bonus_drop3'), max(q.value) filter (where q.key = 'bonus_drop2'),
    max(q.value) filter (where q.key = 'bonus_foe_hp'), max(q.value) filter (where q.key = 'bonus_foe_atk'),
    max(q.value) filter (where q.key = 'bp_boss'), max(q.value) filter (where q.key = 'bp_mini')
  into t_drop_normal, t_drop_boss, t_exp_base, t_exp_boss, t_foe_hp, t_foe_atk, t_foe,
    t_exp3, t_exp2, t_exp15, t_drop3, t_drop2, t_foe_hp_half, t_foe_atk_half, t_bp_boss, t_bp_mini
  from public.adventure_tuning as q;
  if t_drop_normal is null or t_drop_boss is null or t_exp_base is null or t_exp_boss is null or t_foe_hp is null or t_foe_atk is null or t_foe is null
    or t_exp3 is null or t_exp2 is null or t_exp15 is null or t_drop3 is null or t_drop2 is null or t_foe_hp_half is null or t_foe_atk_half is null
    or t_bp_boss is null or t_bp_mini is null then
    raise exception 'no tuning';
  end if;
  -- 구역 보너스는 일반 몬스터 자리에만 있다(일곱 빛 들판의 빛, 지옥 첫 띠 경험치 방). 배수는 설정 표 bonus_*(처음 값 3, 2, 1.5, 3, 2, 0.5, 0.5).
  case s.bonus
    when 'exp3' then exp_mul := t_exp3;
    when 'exp2' then exp_mul := t_exp2;
    when 'exp15' then exp_mul := t_exp15;
    when 'drop3' then drop_mul := t_drop3;
    when 'drop2' then drop_mul := t_drop2;
    when 'foeHp' then hp_mul := t_foe_hp_half;
    when 'foeAtk' then atk_mul := t_foe_atk_half;
    else null;
  end case;
  -- 몬스터 체력 × 2, 공격 × 1.5(2026-11-20 사용자 "공격 1.5, 체력 *2 로", 보통·중간 보스·보스·수문장 모두). 지역 세기는 그대로 두고 여기서 곱한다(에이전트가 정함).
  -- 그 위에 × 0.8(2026-11-23 사용자 "몬스터들의 세기를 지금보다 20% 약하게 만든다.", 체력·공격 모두, 보통·중간 보스·보스·수문장 모두).
  -- 표의 세기 값과 레벨은 그대로 두고 여기서 곱한다(기획이 정함). 결과의 'mon' 체력·공격도 줄어든 값이다.
  -- 2와 1.5는 설정 표 foe_hp_x·foe_atk_x, 0.8은 foe_x(2026-11-23 사용자 "옮겨"). 곱하는 차례는 예전 식과 같다.
  m_hp := d * (30 + 10 * lv) * hp_mul * t_foe_hp * t_foe;
  m_atk := d * (5 + 1.5 * lv) * atk_mul * t_foe_atk * t_foe;

  pw := public.adventure_power(me.id);
  p_hp := (pw ->> 'hp')::double precision;
  p_atk := (pw ->> 'atk')::double precision;
  p_def := (pw ->> 'def')::double precision;
  p_agi := (pw ->> 'agi')::double precision;
  p_luc := (pw ->> 'luc')::double precision;
  crit_mul := (pw -> 'fx' ->> 'critMul')::double precision;
  leech := (pw -> 'fx' ->> 'leech')::double precision;
  saves := pw -> 'fx' -> 'endure';
  save_left := jsonb_array_length(saves);

  -- 전투(dungeon-run.js fightOnce). 콤보·크리티컬 식의 몬스터 레벨 × 2 → × 4(2026-11-19 사용자 "agi 의 효과를 줄이고 세기는 5%만 낮춘다.", 기획 17장 'AGI와 장신구 조정의 안' 1)
  combo := least((pw -> 'fx' ->> 'comboMax')::double precision, p_agi / (p_agi + lv * 4) + (pw -> 'fx' ->> 'comboAdd')::double precision);
  crit := least(0.5, (p_agi + p_luc) / (p_agi + p_luc + lv * 4));
  -- 받는 피해 = 몬스터 ATK² ÷ (몬스터 ATK + 내 DEF) × (1 − 장착 무기의 받는 피해 줄임)(기획 5장, 19장 '컬렉션 무기 장착')
  hit := m_atk * m_atk / (m_atk + p_def) * (1 - coalesce((pw -> 'fx' ->> 'guard')::double precision, 0));
  my := p_hp;
  mon := m_hp;
  <<fight>>
  for turn in 1..20 loop
    hits := 1;
    while hits < 5 and random() < combo loop
      hits := hits + 1;
    end loop;
    for h in 1..hits loop
      is_crit := random() < crit;
      dmg := least(mon, p_atk * (0.9 + 0.2 * random()) * case when is_crit then crit_mul else 1 end);
      mon := mon - dmg;
      if mon > 0 and leech > 0 then
        my := least(p_hp, my + dmg * leech);
      end if;
      turns := turns || jsonb_build_array(jsonb_build_array(0, round(dmg), is_crit::integer, ceil(my), ceil(greatest(mon, 0))));
      if mon <= 0 then
        won := true;
        exit fight;
      end if;
    end loop;
    dmg := hit * (0.9 + 0.2 * random());
    my := my - dmg;
    turns := turns || jsonb_build_array(jsonb_build_array(1, round(dmg), 0, ceil(greatest(my, 0)), ceil(mon)));
    if my <= 0 then
      saved := false;
      while not saved and save_left > 0 loop
        saved := random() < (saves -> (save_left - 1) ->> 0)::double precision;
        back := (saves -> (save_left - 1) ->> 1)::double precision;
        save_left := save_left - 1;
      end loop;
      exit fight when not saved;
      my := greatest(1, p_hp * back);
      turns := turns || jsonb_build_array(jsonb_build_array(2, 0, 0, ceil(my), ceil(mon)));
    end if;
  end loop;

  if won then
    a.bp := greatest(0, a.bp - 1);
    a.run_wins := a.run_wins + 1;
    -- 경험치: expOf × (보스·중간 보스 3, 이길 때마다) × (1 + 배움의 보석) × 구역 보너스. 판 레벨로 줄지 않는다(2026-11-18 사용자 "레벨의 2배가 되더라도, 경험치 못얻거나, 아이템 못얻는건 없다. 무조건 얻는다").
    -- 얻는 경험치 40 → 20(2026-11-19 사용자 "…50%를 줄이거나…") → 10(2026-11-20 사용자 "레벨업 경험치 얻는량을 지금 보다 다시 50% 줄여라", 보통·중간 보스·보스·수문장 모두)
    -- 10과 보스·중간 보스 3은 설정 표 exp_base·exp_boss_x(2026-11-23 사용자 "옮겨").
    gain := round(t_exp_base * (lv + 3) ^ 2 * case when is_boss or is_mini then t_exp_boss else 1 end
      * (1 + (pw -> 'fx' ->> 'exp')::numeric) * exp_mul);
    a.run_exp := a.run_exp + gain;
    -- levelFromExp: 레벨 n까지 쌓인 경험치가 50n(n − 1)
    new_level := floor((1 + sqrt(1 + 8 * a.run_exp / 100)) / 2);
    if new_level > a.run_level then
      got_points := (new_level - a.run_level) * 5;
      a.run_points := a.run_points + got_points;
      a.run_level := new_level;
      if a.auto_split then
        -- 저절로 나누기는 auto_preset의 비율(0 추천대로 HP 3 : ATK 3 : DEF 1 : AGI 1 : LUC 0, 1~3 나누기 1~3, 2026-11-28 기획 growth-1127.md 8-5).
        -- LUC도 나눈다. parts = 다섯 합, 나눈 나머지는 남긴다. 예전: 추천대로만(parts 8, 2026-11-18 사용자 결정).
        ratio := public.adventure_split_ratio(a.presets, a.auto_preset);
        parts := ratio[1] + ratio[2] + ratio[3] + ratio[4] + ratio[5];
        unit := floor(a.run_points / parts);
        a.run_hp := a.run_hp + unit * ratio[1];
        a.run_atk := a.run_atk + unit * ratio[2];
        a.run_def := a.run_def + unit * ratio[3];
        a.run_agi := a.run_agi + unit * ratio[4];
        a.run_luc := a.run_luc + unit * ratio[5];
        a.run_points := a.run_points - unit * parts;
      end if;
    end if;

    if is_boss then
      boss_key := z.id;
      first_kill := not exists (select 1 from public.adventure_bosses as b where b.player = me.id and b.zone = z.id);
      insert into public.adventure_bosses (player, zone) values (me.id, z.id)
        on conflict on constraint adventure_bosses_pkey do update set kills = public.adventure_bosses.kills + 1;
      -- 보스 BP(2026-11-24 사용자 "보스를 잡으면 bp+3 (즉 bp1 소모되니깐 bp+2)", 예전 5): 설정 표 bp_boss(처음 값 3, 정수로 반올림).
      bp_gain := round(t_bp_boss)::integer;
    elsif is_mini then
      boss_key := z.id || '#' || m.idx;
      first_kill := not exists (
        select 1 from public.adventure_mini_kills as k where k.player = me.id and k.zone = z.id and k.idx = m.idx
      );
      insert into public.adventure_mini_kills (player, zone, idx) values (me.id, z.id, m.idx)
        on conflict on constraint adventure_mini_kills_pkey do update set kills = public.adventure_mini_kills.kills + 1;
      -- 중간 보스 BP(같은 날 "중간보스를 잡으면 bp + 2 ( bp1 소모되니깐 bp + 1)", 예전과 같음): 설정 표 bp_mini(처음 값 2).
      bp_gain := round(t_bp_mini)::integer;
    end if;
    fresh := boss_key is not null and not (boss_key = any (a.run_bosses));

    -- 판 금화: 332 × (L ÷ 20,000)^0.08 × lucGold × (1 + 금화 주머니)(166 → 332, 2026-11-19 사용자 "가져오는 재화는 100%로 같게하고, 금화를 현재보다 2배로 늘려라."). 예전: 166(2026-11-18 결과 칸 클릭 규칙 뒤 다시 맞춤, 기획 17장 '결과 칸 클릭 규칙의 안', 사용자 "추천안으로"). 보스·중간 보스를 처음 잡을 때만 × 5(금화 방 × 10).
    luc := (pw ->> 'luc')::numeric;
    gold_gain := round(332 * power(lv / 20000, 0.08) * (1 + 3 * luc / (luc + 4 * lv))
      * case when first_kill then 5 * coalesce(m.gold, 1) else 1 end
      * (1 + (pw -> 'fx' ->> 'gold')::numeric));
    a.run_gold := a.run_gold + gold_gain;

    if boss_key is not null then
      -- 보스·중간 보스 무기: 일반 몬스터 드랍 식에서 0.002만 0.15로, 이길 때마다(이제 판마다 한 번). 2026-11-21 사용자 "보스 한판당 한번이니깐 드롭률을 15% 정도로 올려라.",
      -- "LUC, 장착무기의 드랍효과는 적용되야한다."(중간 보스도 같음은 PM이 정함). 상한은 두지 않는다(가장 높으면 약 0.15 × 2 × 1.75 ≈ 52%).
      -- 예전: 0.002(같은 날 "안 2: 일반 몹과 같은 식 (추천)", 처음 잡을 때 반드시 주던 것과 판마다 처음 이길 때만(fresh) 2%는 없앴다).
      -- 보스 자리에는 구역 보너스가 없어 drop_mul은 1이다. 처음 잡을 때 금화 × 5, BP, firstBoss·firstMini·firstKill, 나오는 무기, 가진 수 5에서 멈춤은 그대로다.
      -- 0.15는 설정 표 drop_boss(2026-11-23 사용자 "옮겨").
      if random() < t_drop_boss * (1 + luc / (luc + 4 * lv)) * drop_mul * (1 + coalesce((pw -> 'fx' ->> 'drop')::numeric, 0)) then
        if is_boss then
          select w.id into dropped from public.adventure_weapons as w where w.zone = z.id and w.boss order by w.id limit 1;
        else
          dropped := m.weapon;
        end if;
      end if;
    elsif random() < t_drop_normal * (1 + luc / (luc + 4 * lv)) * drop_mul * (1 + coalesce((pw -> 'fx' ->> 'drop')::numeric, 0)) then
      -- 0.08은 설정 표 drop_normal(2026-11-23 사용자 "옮겨").
      -- 보통 몬스터 무기 기본값 8%(2026-11-23 사용자 "일반 몬스터 무기 드랍 비율을 지금의 10배로 올린다." 뒤 "일반 몬스터 무기 드롭률 8%로 올리자.", 예전 0.2%).
      -- LUC 몫, 구역 drop_mul(일곱 빛 드롭 방 × 2·× 3), 장착 무기 드랍 효과는 그대로 곱한다(가장 높으면 약 0.08 × 2 × 3 × 1.75 ≈ 84%, 1을 넘지 않음).
      -- 장착 무기 드랍 +25~75%는 보통 몬스터 드랍과 보스·중간 보스 무기에 똑같이 붙는다(2026-11-21부터, 위 식)
      -- 별 비율(★1 40, ★2 30, ★3 18, ★4 9, ★5 3) × 0.55^가진 수. 다 모은(+4) 무기와 지역 보스 무기는 빠진다(중간 보스 무기는 들어감).
      roll := random();
      with pool as (
        select w.id, (case w.star when 1 then 40 when 2 then 30 when 3 then 18 when 4 then 9 else 3 end)
          * power(0.55::double precision, coalesce(c.copies, 0)) as weight
        from public.adventure_weapons as w
        left join public.adventure_collection as c on c.weapon = w.id and c.player = me.id
        where w.zone = z.id and not w.boss and coalesce(c.copies, 0) < 5
      ), ranges as (
        select pool.id, sum(pool.weight) over (order by pool.id) as upto, sum(pool.weight) over () as total from pool
      )
      select ranges.id into dropped from ranges where ranges.upto > roll * ranges.total order by ranges.upto limit 1;
    end if;
    -- 수문장(평원 1, 2026-11-19 사용자 "통로에 길을 막고 있는 화산폭풍의 일반몹 수문장"): 이기면 이번 판에 그 맵의 높은 지역 포탈이 열린다('gate:맵'). BP는 없다.
    if s.kind = 'gate' and not (('gate:' || s.map) = any (a.run_bosses)) then
      a.run_bosses := a.run_bosses || ('gate:' || s.map);
    end if;
    -- 보스 BP는 한 판에 보스마다 한 번(위에서 이긴 보스와는 싸우지 않으므로 fresh는 늘 참이다)
    if fresh then
      a.run_bosses := a.run_bosses || boss_key;
      a.bp := a.bp + bp_gain;
    else
      bp_gain := 0;
    end if;
    if dropped is not null then
      insert into public.adventure_collection (player, weapon) values (me.id, dropped)
        on conflict (player, weapon) do update set copies = public.adventure_collection.copies + 1
        where public.adventure_collection.copies < 5;
      if found then
        a.run_drops := a.run_drops || to_jsonb(dropped);
        select c.copies into drop_copies from public.adventure_collection as c where c.player = me.id and c.weapon = dropped;
      else
        dropped := null;
      end if;
    end if;
  else
    a.bp := greatest(0, a.bp - 3);
    a.run_losses := a.run_losses + 1;
  end if;

  update public.adventure_players as q set
    bp = a.bp, run_level = a.run_level, run_exp = a.run_exp, run_points = a.run_points,
    run_hp = a.run_hp, run_atk = a.run_atk, run_def = a.run_def, run_agi = a.run_agi, run_luc = a.run_luc,
    run_gold = a.run_gold, run_wins = a.run_wins, run_losses = a.run_losses, run_drops = a.run_drops,
    run_bosses = a.run_bosses, last_battle_at = now(),
    -- 최고 레벨: 판 레벨이 지금까지보다 오르면 함께 올린다(같은 레벨이면 먼저 닿은 때를 남김).
    best_level = greatest(q.best_level, a.run_level),
    best_at = case when a.run_level > q.best_level then now() else q.best_at end
    where q.player = me.id;

  if a.bp = 0 then
    -- 판 끝. 결과는 last_result에 남고, 화면은 연출 뒤 adventure_state로 한 번 받는다(새로고침해도 남음).
    settled := public.adventure_settle(me.id, 'bp');
  end if;

  return jsonb_build_object(
    'win', won,
    'turns', turns,
    'me', jsonb_build_object('hp', p_hp, 'atk', p_atk, 'def', p_def, 'agi', p_agi, 'luc', p_luc),
    'mon', jsonb_build_object(
      'map', s.map, 'zone', z.id, 'x', s.x, 'y', s.y, 'kind', s.kind, 'art', s.art, 'mini', s.mini, 'bonus', s.bonus,
      'level', lv, 'boss', is_boss or is_mini, 'hp', m_hp, 'atk', m_atk
    ),
    'exp', gain::text,
    'level', a.run_level::text,
    'points', got_points::text,
    'gold', gold_gain::text,
    'drop', dropped,
    'dropCopies', drop_copies,
    'firstBoss', is_boss and first_kill,
    'firstMini', is_mini and first_kill,
    'firstKill', first_kill,
    'bpGain', bp_gain,
    'ended', settled is not null,
    'state', public.adventure_view(me.id)
  );
end;
$$;

-- ───────── 9. 권한 ─────────
-- 안에서만 쓰는 함수는 아무도 직접 부르지 못한다(security definer 함수가 부름). 고친 함수는 예전 권한 그대로.
revoke execute on function public.adventure_split_ratio(jsonb, smallint) from public, anon, authenticated;
revoke execute on function public.adventure_combat(boolean, numeric, text, jsonb) from public, anon, authenticated;
revoke execute on function public.adventure_power(uuid) from public, anon, authenticated;
revoke execute on function public.adventure_view(uuid) from public, anon, authenticated;
revoke execute on function public.adventure_save_preset(integer, text, integer, integer, integer, integer, integer) from public, anon;
grant execute on function public.adventure_save_preset(integer, text, integer, integer, integer, integer, integer) to authenticated;
revoke execute on function public.adventure_set_auto(boolean, smallint) from public, anon;
grant execute on function public.adventure_set_auto(boolean, smallint) to authenticated;
revoke execute on function public.adventure_battle(text, integer, integer) from public, anon;
grant execute on function public.adventure_battle(text, integer, integer) to authenticated;
