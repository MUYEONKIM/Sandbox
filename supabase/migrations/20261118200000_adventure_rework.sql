-- 모험 다시 손보기(2026-11-18 배포 뒤). 20261117000000_adventure.sql은 실제 DB에 들어가 있어 고치지 않고 이 파일에 바꾼 것만 둔다.
-- 다시 실행해도 된다(create or replace만 씀, 표와 행은 바꾸지 않음).
--
-- 1. 맵 구조(디자인 노트 adventure-maps13.md 8절, adv-maps.json version 3). 사용자 결정(PM 전달):
--    "맵은 전체가 다 이어져있는 것이기 떄문에 시작맵에 포탈이 열리는 형식은 맞지않다" → 입구 맵 포탈은 평원 1로 가는 하나.
--    다음 지역 포탈은 "판마다 다시 잡기" → 이번 판에 지금 지역 보스를 잡았을 때만(run_bosses). 처음 잡은 기록(adventure_bosses)은 보지 않는다.
--    앞 지역 포탈 "둔다 (추천)" → 지역 첫 맵에서 앞 지역 마지막 맵으로 늘 갈 수 있다.
--    처음 잡을 때만 주는 것(보스 금화 5배, 장신구 칸 등)은 지금대로 계정 기록을 쓴다(adventure_battle 그대로).
--    입구 맵 들어오는 자리(26, 26)와 앞 지역 포탈 도착 칸(zoneBack)은 화면 맵 자료에만 있다(서버는 칸을 보지 않음).
--
-- 2. 숫자(기획 세션이 정함, PM 전달). 보스 세기, 가져가는 경험치 5,400, 금화 166은 그대로.
--    - 모험 시작 스텟: 마을 스텟 × 100 → × 10(사용자 "4. 시작 마을 스텟의 *100 으로 시작하니깐 너무 쉽다. 10배로 줄인다."). adventure_power.
--    - 드랍(사용자 "전반적으로 드롭률이 너무 높다. 파격적으로 줄여줘."): 보통 몬스터 0.02 → 0.002(식은 그대로: × (1 + LUC ÷ (LUC + 4L)) × 드랍 방 × (1 + 장착 LUC 드랍)),
--      잡은 보스·중간 보스를 다시 잡을 때(판마다 처음 이길 때) 0.2 → 0.02. 처음 잡으면 반드시 주는 것, 별 무게, 드랍 방 ×3·×2, 장착 +25~75%는 그대로.
--    - 추천 나누기: 마을 AGI와 상관없이 HP 3 : ATK 3 : DEF 1 : AGI 1(저절로 나누기 adventure_battle·adventure_set_auto).
--    세 함수는 20261117000000_adventure.sql의 것을 그대로 옮기고 위 값만 바꿨다.
--
-- 실제 DB 확인(SQL Editor, 실행 뒤, 모두 true):
--   select position('run_bosses' in pg_get_functiondef('public.adventure_move(text)'::regprocedure)) > 0 as move_uses_run_bosses,
--     position('me.str * 10)' in pg_get_functiondef('public.adventure_power(uuid)'::regprocedure)) > 0 as town_x10,
--     position('random() < 0.002 *' in pg_get_functiondef('public.adventure_battle(text, integer, integer)'::regprocedure)) > 0 as drop_002,
--     position('parts := 8;' in pg_get_functiondef('public.adventure_set_auto(boolean)'::regprocedure)) > 0 as split_3311;

-- 포탈로 맵을 옮긴다(이어 하기 자리를 남김). 지금 맵과 같으면 그대로 돌려준다. 갈 수 있는 곳:
--   입구 맵 → 첫 지역(앞 지역이 없는 지역)의 첫 맵
--   같은 지역 안 → 앞뒤 한 장(앞 맵·다음 맵 포탈)
--   지역 마지막 맵 → 다음 지역 첫 맵: 이번 판에 지금 지역 보스를 잡았을 때만(run_bosses에 지역 id, 별 하늘은 보스방 둘 가운데 하나)
--   지역 첫 맵 → 앞 지역 마지막 맵(앞 지역 포탈): 늘
create or replace function public.adventure_move(target text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a public.adventure_players%rowtype;
  z public.adventure_zones%rowtype;
  t public.adventure_maps%rowtype;
  here public.adventure_maps%rowtype;
  here_zone public.adventure_zones%rowtype;
begin
  perform 1 from public.profiles as p where p.id = auth.uid() for update;
  if not found then
    raise exception 'no profile';
  end if;
  a := public.adventure_prepare(auth.uid());
  if not a.in_run then
    raise exception 'no run';
  end if;
  if adventure_move.target is distinct from a.run_map then
    select * into t from public.adventure_maps as x where x.map = adventure_move.target;
    if not found or t.zone is null then
      raise exception 'bad map';
    end if;
    select * into strict z from public.adventure_zones as x where x.id = t.zone;
    select * into here from public.adventure_maps as x where x.map = a.run_map;
    if not found or here.zone is null then
      -- 입구 맵: 포탈은 평원 1로 가는 하나
      if t.idx <> 1 or z.unlock_after is not null then
        raise exception 'bad map';
      end if;
    elsif here.zone = t.zone then
      -- 같은 지역 안: 앞뒤 한 장
      if abs(t.idx - here.idx) <> 1 then
        raise exception 'bad map';
      end if;
    else
      select * into strict here_zone from public.adventure_zones as x where x.id = here.zone;
      if z.unlock_after = here.zone then
        -- 다음 지역: 지금 지역 마지막 맵에서 다음 지역 첫 맵으로, 이번 판에 지금 지역 보스를 잡았을 때만
        if t.idx <> 1 or here.idx <> (select max(x.idx) from public.adventure_maps as x where x.zone = here.zone) then
          raise exception 'bad map';
        end if;
        if not (here.zone = any (a.run_bosses)) then
          raise exception 'zone locked';
        end if;
      elsif here_zone.unlock_after = t.zone then
        -- 앞 지역: 지금 지역 첫 맵에서 앞 지역 마지막 맵으로, 늘
        if here.idx <> 1 or t.idx <> (select max(x.idx) from public.adventure_maps as x where x.zone = t.zone) then
          raise exception 'bad map';
        end if;
      else
        raise exception 'bad map';
      end if;
    end if;
    update public.adventure_players as x set run_map = t.map where x.player = auth.uid();
  end if;
  return public.adventure_view(auth.uid());
end;
$$;

revoke execute on function public.adventure_move(text) from public, anon;
grant execute on function public.adventure_move(text) to authenticated;

-- 지금 전투에 쓰는 스텟(기획 6장, 7장, 9장, 10장). 마을 스텟 × 10(예전 × 100).
-- 스텟 = (처음 값 + (판에서 나눈 포인트 + 마을 스텟 × 10) × 1포인트 효과) × (1 + 컬렉션 + 보석 + 장착) × (1 + 베이스 레벨 × 0.25).
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
begin
  select * into strict me from public.profiles as p where p.id = who;
  select * into strict a from public.adventure_players as x where x.player = who;
  select w.stat, w.equip_pct * (1 + 0.25 * (c.copies - 1)), w.equip_fx, w.equip_fx_value
    into eq_stat, eq_pct, eq_fx, eq_fx_value
    from public.adventure_weapons as w join public.adventure_collection as c on c.weapon = w.id and c.player = who
    where w.id = a.main_weapon;
  if not found then
    eq_stat := null; eq_pct := 0; eq_fx := null; eq_fx_value := 0;
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
    'hp', (100 + (a.run_hp + t_hp * 10) * 5) * (1 + c_hp + full_zones + g_hp) * mul,
    'atk', (10 + (a.run_atk + me.str * 10)) * (1 + c_atk + full_zones + g_atk) * mul,
    'def', (a.run_def + me.def * 10) * 3 * (1 + c_def + full_zones + g_def) * mul,
    'agi', (a.run_agi + me.agi * 10) * (1 + c_agi + full_zones + g_agi) * mul,
    'luc', (a.run_luc + me.luk * 10) * (1 + c_luc + full_zones + g_luc) * mul,
    'base', base_level,
    'mul', mul,
    'town', jsonb_build_object('hp', t_hp, 'atk', me.str, 'def', me.def, 'agi', me.agi, 'luc', me.luk),
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
      'weapon', a.main_weapon, 'stat', eq_stat, 'pct', eq_pct, 'fx', eq_fx, 'value', eq_fx_value
    ) end
  );
end;
$$;

revoke execute on function public.adventure_power(uuid) from public, anon, authenticated;

-- 전투 하나. 20261117000000_adventure.sql의 것과 같고 드랍 두 값과 저절로 나누기 비율만 다르다(위 2번).
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
    -- 경험치: expOf × (보스·중간 보스 3, 이길 때마다) × expFalloff × (1 + 배움의 보석) × 구역 보너스
    gain := round(40 * (lv + 3) ^ 2 * case when is_boss or is_mini then 3 else 1 end
      * case when a.run_level <= lv then 1 else greatest(0, 2 - a.run_level / lv) end
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

    -- 판 금화: 166 × (L ÷ 20,000)^0.08 × lucGold × (1 + 금화 주머니)(2026-11-18 결과 칸 클릭 규칙 뒤 다시 맞춤, 기획 17장 '결과 칸 클릭 규칙의 안', 사용자 "추천안으로"). 보스·중간 보스를 처음 잡을 때만 × 5(금화 방 × 10).
    luc := (pw ->> 'luc')::numeric;
    gold_gain := round(166 * power(lv / 20000, 0.08) * (1 + 3 * luc / (luc + 4 * lv))
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

-- "레벨이 오르면 추천대로 저절로 나누기"를 켜고 끈다. 켤 때 남은 포인트가 있으면 바로 나눈다(adventure_battle과 같은 HP 3 : ATK 3 : DEF 1 : AGI 1).
create or replace function public.adventure_set_auto(enabled boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  a public.adventure_players%rowtype;
  parts integer;
  unit numeric;
begin
  if enabled is null then
    raise exception 'bad value';
  end if;
  select * into me from public.profiles as p where p.id = auth.uid() for update;
  if not found then
    raise exception 'no profile';
  end if;
  a := public.adventure_prepare(me.id);
  parts := 8;
  unit := case when enabled then floor(a.run_points / parts) else 0 end;
  update public.adventure_players as x set
    auto_split = enabled,
    run_hp = x.run_hp + unit * 3, run_atk = x.run_atk + unit * 3, run_def = x.run_def + unit, run_agi = x.run_agi + unit,
    run_points = x.run_points - unit * parts
    where x.player = me.id;
  return public.adventure_view(me.id);
end;
$$;

revoke execute on function public.adventure_set_auto(boolean) from public, anon;
grant execute on function public.adventure_set_auto(boolean) to authenticated;
