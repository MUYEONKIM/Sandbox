-- 모험 숫자 다시 맞추기(2026-11-19, 기획 dungeon-rework.md 19장 '모험 숫자 다시 맞추기'). 실제 DB에 들어간
-- 20261117000000_adventure.sql·20261118200000_adventure_rework.sql은 고치지 않고 바뀐 함수만 가장 새 것을 옮겨 아래만 바꾼다.
-- 다시 실행해도 된다(create or replace만 씀, 표와 행은 바꾸지 않음).
--
-- 1. 경험치 줄어듦 없애기(2026-11-18 사용자 "레벨의 2배가 되더라도, 경험치 못얻거나, 아이템 못얻는건 없다. 무조건 얻는다"): adventure_battle에서 판 레벨이 몬스터 레벨보다 높을 때 줄던 몫을 없앤다(늘 다 줌).
-- 2. 금화(2026-11-19 사용자 "가져오는 재화는 100%로 같게하고, 금화를 현재보다 2배로 늘려라."): 판 금화 앞 숫자 166 → 332(adventure_battle), 판이 끝날 때 마을 골드로 가져가는 몫 50% → 100%(adventure_settle).
-- 3. 무기 고정 수치(2026-11-19 사용자 "이대로 (추천)", 기획 10장 '고정 수치'): 고정 포인트 = 그 몫의 % × 2 × 무기 지역의 보스 레벨(무기마다 버림), 컬렉션 몫과 장착 몫 둘 다.
--    판 포인트·마을 스텟 × 10과 같은 자리에 더한다(adventure_power). 돌려주는 값에 스텟마다 flat, 장착에 flat을 더한다.
-- 4. 보스·중간 보스 세기(2026-11-19 사용자 "이대로", 기획 17장 '레벨로 맞춘 보스 세기', 11장 표): 맨 아래 update 둘(adventure_zones.boss_strength, adventure_minis.strength).
--
-- 실제 DB 확인(SQL Editor, 실행 뒤, 모두 true):
--   select position('332 * power' in pg_get_functiondef('public.adventure_battle(text, integer, integer)'::regprocedure)) > 0 as gold_332,
--     position('2 - a.run_level / lv' in pg_get_functiondef('public.adventure_battle(text, integer, integer)'::regprocedure)) = 0 as no_falloff,
--     position('floor(a.run_gold)' in pg_get_functiondef('public.adventure_settle(uuid, text)'::regprocedure)) > 0 as take_all_gold,
--     position('boss_level' in pg_get_functiondef('public.adventure_power(uuid)'::regprocedure)) > 0 as weapon_flat,
--     (select boss_strength from public.adventure_zones where id = 'adv_2') = 7.5 as boss_strength,
--     (select strength from public.adventure_minis where zone = 'adv_6' and idx = 4) = 8.6 as mini_strength;

-- 지금 전투에 쓰는 스텟. 스텟 = (처음 값 + (판 포인트 + 마을 스텟 × 10 + 무기 고정 포인트) × 1포인트 효과) × (1 + 컬렉션 + 보석 + 장착) × (1 + 베이스 레벨 × 0.25).
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

  select 0.05 * count(*) into full_zones from (
    select w.zone from public.adventure_weapons as w
    left join public.adventure_collection as c on c.weapon = w.id and c.player = who
    group by w.zone having count(c.weapon) = count(*)
  ) as done;

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

  t_hp := greatest(0, me.max_hp - 100);
  return jsonb_build_object(
    'hp', (100 + (a.run_hp + t_hp * 10 + f_hp) * 5) * (1 + c_hp + full_zones + g_hp) * mul,
    'atk', (10 + (a.run_atk + me.str * 10 + f_atk)) * (1 + c_atk + full_zones + g_atk) * mul,
    'def', (a.run_def + me.def * 10 + f_def) * 3 * (1 + c_def + full_zones + g_def) * mul,
    'agi', (a.run_agi + me.agi * 10 + f_agi) * (1 + c_agi + full_zones + g_agi) * mul,
    'luc', (a.run_luc + me.luk * 10 + f_luc) * (1 + c_luc + full_zones + g_luc) * mul,
    'base', base_level,
    'mul', mul,
    'town', jsonb_build_object('hp', t_hp, 'atk', me.str, 'def', me.def, 'agi', me.agi, 'luc', me.luk),
    -- 무기 고정 포인트(스텟마다 컬렉션 + 장착, 포인트라 HP는 × 5, DEF는 × 3으로 보임)
    'flat', jsonb_build_object('hp', f_hp, 'atk', f_atk, 'def', f_def, 'agi', f_agi, 'luc', f_luc),
    'bonus', jsonb_build_object(
      'hp', c_hp + full_zones + g_hp, 'atk', c_atk + full_zones + g_atk, 'def', c_def + full_zones + g_def,
      'agi', c_agi + full_zones + g_agi, 'luc', c_luc + full_zones + g_luc
    ),
    'fx', jsonb_build_object(
      'comboAdd', combo_add, 'comboMax', combo_max, 'critMul', crit_mul, 'leech', leech, 'endure', endure,
      'exp', exp_bonus, 'gold', gold_bonus, 'guard', guard, 'drop', drop_bonus
    ),
    -- 화면에 보일 장착 효과(숫자만). 장착이 없거나 가진 무기가 아니면 null
    'equip', case when eq_stat is null then null else jsonb_build_object(
      'weapon', a.main_weapon, 'stat', eq_stat, 'pct', eq_pct, 'flat', eq_flat, 'fx', eq_fx, 'value', eq_fx_value
    ) end
  );
end;
$$;

revoke execute on function public.adventure_power(uuid) from public, anon, authenticated;

-- 전투 하나. 20261118200000_adventure_rework.sql의 것과 같고 경험치 줄어듦을 없애고 판 금화 앞 숫자만 다르다(위 1·2번).
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
  dropped text;
  drop_copies integer := 0;
  roll double precision;
  settled jsonb;
begin
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
  if z.unlock_after is not null
    and not exists (select 1 from public.adventure_bosses as b where b.player = me.id and b.zone = z.unlock_after) then
    raise exception 'zone locked';
  end if;
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
  if a.bp <= 0 then
    raise exception 'no bp';
  end if;
  -- 너무 빨리 누름 막기(기획 8장, 연출과 결과 줄을 합한 가장 짧은 시간)
  if a.last_battle_at > now() - interval '2.5 seconds' then
    raise exception 'too fast';
  end if;
  -- 구역 보너스는 일반 몬스터 자리에만 있다(일곱 빛 들판의 빛, 지옥 첫 띠 경험치 방).
  case s.bonus
    when 'exp3' then exp_mul := 3;
    when 'exp2' then exp_mul := 2;
    when 'exp15' then exp_mul := 1.5;
    when 'drop3' then drop_mul := 3;
    when 'drop2' then drop_mul := 2;
    when 'foeHp' then hp_mul := 0.5;
    when 'foeAtk' then atk_mul := 0.5;
    else null;
  end case;
  m_hp := d * (30 + 10 * lv) * hp_mul;
  m_atk := d * (5 + 1.5 * lv) * atk_mul;

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

  -- 전투(dungeon-run.js fightOnce)
  combo := least((pw -> 'fx' ->> 'comboMax')::double precision, p_agi / (p_agi + lv * 2) + (pw -> 'fx' ->> 'comboAdd')::double precision);
  crit := least(0.5, (p_agi + p_luc) / (p_agi + p_luc + lv * 2));
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
    gain := round(40 * (lv + 3) ^ 2 * case when is_boss or is_mini then 3 else 1 end
      * (1 + (pw -> 'fx' ->> 'exp')::numeric) * exp_mul);
    a.run_exp := a.run_exp + gain;
    -- levelFromExp: 레벨 n까지 쌓인 경험치가 50n(n − 1)
    new_level := floor((1 + sqrt(1 + 8 * a.run_exp / 100)) / 2);
    if new_level > a.run_level then
      got_points := (new_level - a.run_level) * 5;
      a.run_points := a.run_points + got_points;
      a.run_level := new_level;
      if a.auto_split then
        -- 추천대로 나누기 HP 3 : ATK 3 : DEF 1 : AGI 1(마을 AGI와 상관없이, 2026-11-18 사용자 결정). 나눈 나머지는 남긴다.
        parts := 8;
        unit := floor(a.run_points / parts);
        a.run_hp := a.run_hp + unit * 3;
        a.run_atk := a.run_atk + unit * 3;
        a.run_def := a.run_def + unit;
        a.run_agi := a.run_agi + unit;
        a.run_points := a.run_points - unit * parts;
      end if;
    end if;

    if is_boss then
      boss_key := z.id;
      first_kill := not exists (select 1 from public.adventure_bosses as b where b.player = me.id and b.zone = z.id);
      insert into public.adventure_bosses (player, zone) values (me.id, z.id)
        on conflict on constraint adventure_bosses_pkey do update set kills = public.adventure_bosses.kills + 1;
      bp_gain := 5;
    elsif is_mini then
      boss_key := z.id || '#' || m.idx;
      first_kill := not exists (
        select 1 from public.adventure_mini_kills as k where k.player = me.id and k.zone = z.id and k.idx = m.idx
      );
      insert into public.adventure_mini_kills (player, zone, idx) values (me.id, z.id, m.idx)
        on conflict on constraint adventure_mini_kills_pkey do update set kills = public.adventure_mini_kills.kills + 1;
      bp_gain := 2;
    end if;
    fresh := boss_key is not null and not (boss_key = any (a.run_bosses));

    -- 판 금화: 332 × (L ÷ 20,000)^0.08 × lucGold × (1 + 금화 주머니)(166 → 332, 2026-11-19 사용자 "가져오는 재화는 100%로 같게하고, 금화를 현재보다 2배로 늘려라."). 예전: 166(2026-11-18 결과 칸 클릭 규칙 뒤 다시 맞춤, 기획 17장 '결과 칸 클릭 규칙의 안', 사용자 "추천안으로"). 보스·중간 보스를 처음 잡을 때만 × 5(금화 방 × 10).
    luc := (pw ->> 'luc')::numeric;
    gold_gain := round(332 * power(lv / 20000, 0.08) * (1 + 3 * luc / (luc + 4 * lv))
      * case when first_kill then 5 * coalesce(m.gold, 1) else 1 end
      * (1 + (pw -> 'fx' ->> 'gold')::numeric));
    a.run_gold := a.run_gold + gold_gain;

    if boss_key is not null then
      -- 보스·중간 보스 무기: 처음 잡으면 반드시, 다시 잡으면 판마다 처음 이길 때만 2%(20% → 2%, 사용자 "전반적으로 드롭률이 너무 높다. 파격적으로 줄여줘.")
      if first_kill or (fresh and random() < 0.02) then
        if is_boss then
          select w.id into dropped from public.adventure_weapons as w where w.zone = z.id and w.boss order by w.id limit 1;
        else
          dropped := m.weapon;
        end if;
      end if;
    elsif random() < 0.002 * (1 + luc / (luc + 4 * lv)) * drop_mul * (1 + coalesce((pw -> 'fx' ->> 'drop')::numeric, 0)) then
      -- 장착 무기 드랍 +25~75%는 보통 몬스터 드랍에만(보스 무기 2%에는 안 붙음, 계산기 drop과 같음)
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
    -- 보스 BP는 한 판에 보스마다 한 번
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
    run_hp = a.run_hp, run_atk = a.run_atk, run_def = a.run_def, run_agi = a.run_agi,
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

revoke execute on function public.adventure_battle(text, integer, integer) from public, anon;
grant execute on function public.adventure_battle(text, integer, integer) to authenticated;

-- 판을 끝낸다: 이긴 수 × 5,400 마을 경험치(gain_exp), 판 금화 전부(버림, 예전 50%) 마을 골드. 판 칸을 비우고 결과를 last_result에 남긴다.
-- reason은 끝난 까닭('bp' BP가 0이 됨, 'return' 귀환)이다. 결과는 다음 adventure_state가 한 번 주고 지운다. 판이 없으면 null.
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

revoke execute on function public.adventure_settle(uuid, text) from public, anon, authenticated;

-- 보스 세기(2026-11-19 사용자 "이대로"): 보스 레벨 L이면 판 레벨 2L에서 보통 50%로 맞춘 값(기획 17장, 무기 고정 수치를 넣고 셈, 경험치 줄어듦 없음).
-- 평원 2.4는 그대로. 예전 값: 지옥 17.8, 얽힌 숲 32.5, 벼랑길 58.1, 일곱 빛 들판 75.3, 구름 정원 82.1, 별 하늘 79.9, 그늘 동굴 130.8.
update public.adventure_zones as z set boss_strength = v.s
  from (values ('adv_2', 7.5), ('adv_3', 8.1), ('adv_4', 8.3), ('adv_5', 8.4), ('adv_6', 8.6), ('adv_7', 11.8), ('adv_8', 17.0)) as v (id, s)
  where z.id = v.id;

-- 중간 보스 세기(같은 기준): 얽힌 숲 가운데 빈터 9 → 7.8, 구름 정원 서쪽·동쪽·북서쪽·북동쪽 섬(Lv 48,000, 58,000, 70,000, 85,000) 19.5 → 8.3, 8.4, 8.4, 8.6.
-- 평원(3)과 지옥(6)은 그대로.
update public.adventure_minis as m set strength = v.s
  from (values ('adv_3', 1, 7.8), ('adv_6', 1, 8.3), ('adv_6', 2, 8.4), ('adv_6', 3, 8.4), ('adv_6', 4, 8.6)) as v (zone, idx, s)
  where m.zone = v.zone and m.idx = v.idx;
