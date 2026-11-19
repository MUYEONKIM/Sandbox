-- 모험 평원 1 수문장, 지역 잠금 없앰, 높은 지역 포탈 한쪽으로, 얻는 경험치 50%(2026-11-19 사용자가 코드 세션에 직접). 실제 DB에 들어간 앞 migration은 고치지 않고
-- 바뀐 행과 함수만 둔다. 다시 실행해도 된다(제약 다시 만들기, insert … on conflict, create or replace).
--
-- 사용자: "1. 첫 숲맵에서 화산폭풍으로 들어갈 경우 몬스터와 싸우려고 하면, 아직 열리지 않은 지역입니다. 하고 못싸우는데, 싸움이 가능해야 한다.
--   2. 대신 숲 맵에서 화산폭풍로 바로가는 포탈을 탈 시, 통로에 길을 막고 있는 화산폭풍의 일반몹 수문장이 하나 있도록한다.
--   3. 화산폭풍 맵으로 들어오면 해당 맵만 다시 첫 숲맵으로 돌아가는 포털은 없도록한다. 단방향으로 한다."
-- 1. adventure_battle: 지역 잠금(계정이 앞 지역 보스를 잡았는지)을 없앤다. 판이 그 맵에 있으면 싸운다(맵은 adventure_move가 정함).
-- 2. 수문장: 평원 1(adv_1a)의 높은 지역 포탈 칸 (16, 30)에 화산 폭풍 보통 몬스터(Lv 6,300,000, 화산 폭풍 세기 7.0, 그림은 화산 폭풍 첫 몬스터) 하나.
--    몬스터 종류 'gate'. 이기면 이번 판에 run_bosses에 'gate:adv_1a'가 붙고 화면은 수문장을 치우고 그 칸에 포탈을 세운다(새 판이면 다시 섬).
--    경험치·금화·드랍은 화산 폭풍 보통 몬스터와 같다(드랍은 화산 폭풍 무기). BP는 없다(에이전트가 정함).
-- 3. adventure_move: 평원 1 → 화산 폭풍 1은 이번 판에 수문장을 이겼을 때만, 화산 폭풍 1 → 입구 맵 길은 없앤다(화면 맵 자료의 '→ 입구' 포탈도 뺌).
-- 4. 경험치(같은 날 사용자 "모험에서 얻는 경험치를 지금에서 50%를 줄이거나, 아니면 레벨업에 필요한 경험치를 2배로 늘리거나 해라. 레벨이 너무 심하게 빨리 오른다."):
--    adventure_battle의 얻는 경험치 40 × (L + 3)² → 20 × (L + 3)². 에이전트가 고름: 같은 전투 수에서 판 레벨은 두 방법 모두 약 71%이고,
--    필요 경험치를 늘리면 진행 중인 판이 쌓은 경험치로는 지금 레벨에 못 미쳐 한동안 레벨이 멈춘다. 마을로 가져가는 경험치(이긴 수 × 5,400)는 그대로.
--
-- 실제 DB 확인(SQL Editor, 실행 뒤, 모두 true):
--   select (select count(*) from public.adventure_spots where kind = 'gate' and map = 'adv_1a' and x = 16 and y = 30 and level = 6300000 and zone = 'adv_14') = 1 as gate_spot,
--     (select count(*) from public.adventure_spots) = 138 as spots,
--     position('zone locked' in pg_get_functiondef('public.adventure_battle(text, integer, integer)'::regprocedure)) = 0 as battle_no_zone_lock,
--     position('gate:' in pg_get_functiondef('public.adventure_battle(text, integer, integer)'::regprocedure)) > 0 as battle_gate,
--     position('20 * (lv + 3)' in pg_get_functiondef('public.adventure_battle(text, integer, integer)'::regprocedure)) > 0 as exp_half,
--     position('gate:adv_1a' in pg_get_functiondef('public.adventure_move(text)'::regprocedure)) > 0 as move_needs_gate,
--     position('adv_gate' in pg_get_functiondef('public.adventure_move(text)'::regprocedure)) = 0 as no_return_path;

-- 몬스터 종류에 수문장('gate')을 더한다.
alter table public.adventure_spots drop constraint if exists adventure_spots_kind_check;
alter table public.adventure_spots add constraint adventure_spots_kind_check check (kind in ('normal', 'mini', 'boss', 'gate'));

-- 평원 1 수문장(칸은 화면 맵 자료 adv_1a monsters의 gate 줄과 같다). 지역은 화산 폭풍(세기·드랍).
insert into public.adventure_spots (map, zone, x, y, kind, art, level, mini, bonus) values
  ('adv_1a', 'adv_14', 16, 30, 'gate', 'Gate_Hellfire_Knight_01', 6300000, null, null)
on conflict (map, x, y) do update set
  zone = excluded.zone, kind = excluded.kind, art = excluded.art, level = excluded.level, mini = excluded.mini, bonus = excluded.bonus;

-- 전투 하나. 20261119200000_adventure_expansion.sql의 것에서 지역 잠금을 빼고 수문장 열기를 더했다(위 1·2번).
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
    -- 얻는 경험치 40 → 20(2026-11-19 사용자 "모험에서 얻는 경험치를 지금에서 50%를 줄이거나, 아니면 레벨업에 필요한 경험치를 2배로 늘리거나 해라.", 에이전트가 고름)
    gain := round(20 * (lv + 3) ^ 2 * case when is_boss or is_mini then 3 else 1 end
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
    -- 수문장(평원 1, 2026-11-19 사용자 "통로에 길을 막고 있는 화산폭풍의 일반몹 수문장"): 이기면 이번 판에 그 맵의 높은 지역 포탈이 열린다('gate:맵'). BP는 없다.
    if s.kind = 'gate' and not (('gate:' || s.map) = any (a.run_bosses)) then
      a.run_bosses := a.run_bosses || ('gate:' || s.map);
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

-- 포탈로 맵을 옮긴다. 20261119200000_adventure_expansion.sql의 것에서 높은 지역 포탈을 수문장 뒤로, '→ 입구' 길을 뺐다(위 3번).
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
    -- 높은 지역 포탈(평원 1 adv_1a → 화산 폭풍 1 adv_14a): 이번 판에 평원 1 수문장을 이겼을 때만(run_bosses에 'gate:adv_1a', 2026-11-19 사용자).
    -- 한쪽으로만 간다: 화산 폭풍 1에서 입구로 가는 길은 없앴다(사용자 "단방향으로 한다").
    if a.run_map = 'adv_1a' and adventure_move.target = 'adv_14a' then
      if not ('gate:adv_1a' = any (a.run_bosses)) then
        raise exception 'zone locked';
      end if;
      update public.adventure_players as x set run_map = adventure_move.target where x.player = auth.uid();
      return public.adventure_view(auth.uid());
    end if;
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
