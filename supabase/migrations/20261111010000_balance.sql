-- 작업 획득량을 2배로, LUK 1포인트 효과를 0.5%로 올리고, 스텟 가격을 1/10로 내린다(2026-11-11 사용자 요청).
-- 한 번 캘 때 평균 2 × (1 + LUK × 0.005 + 도구 보너스)개를 얻는다. 바꾸면 src/game/economy.ts의 HARVEST_COUNT와 src/game/stats.ts의 LUK 설명도 함께 바꾼다.
-- 다시 실행해도 되게 했다.

update public.stats set base_price = 20, price_step = 10;

-- 획득 개수만 바뀌었다. 나머지는 20261108020000_fixed_exp.sql과 같다.
create or replace function public.harvest() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  place public.workplaces%rowtype;
  roll integer;
  picked text;
  amount integer;
  tool_bonus numeric;
  grown jsonb;
begin
  select * into strict me from public.profiles where id = auth.uid() for update;

  select * into place from public.workplaces where id = me.map;
  if not found then
    raise exception 'not at a workplace';
  end if;
  if me.hp <= 0 then
    raise exception 'player is down';
  end if;
  -- 네트워크 지연을 감안해 10%는 봐준다.
  if me.last_harvest_at > now() - place.gather_ms * interval '0.9 milliseconds' then
    raise exception 'too fast';
  end if;

  select floor(random() * sum(weight))::integer into roll
    from public.loot where workplace = place.id;

  select item into picked from (
    select item, sum(weight) over (order by item) as upto
    from public.loot where workplace = place.id
  ) as ranges
  where upto > roll
  order by upto
  limit 1;

  select coalesce(sum(bonus), 0) into tool_bonus
    from public.tools where workplace = place.id and id = any(me.owned_tools);

  -- 소수점 아래는 그 확률만큼 1을 더해 평균이 정확히 2배가 되게 한다.
  amount := 2 + floor(2 * (me.luk * 0.005 + tool_bonus) + random()::numeric);

  insert into public.stash (player, item, count) values (me.id, picked, amount)
    on conflict (player, item) do update set count = public.stash.count + excluded.count;

  update public.profiles set last_harvest_at = now() where id = me.id;

  grown := public.gain_exp(me.id, place.exp);

  return jsonb_build_object(
    'item', picked,
    'count', amount,
    'level', grown->>'level',
    'exp', grown->'exp',
    'gained', place.exp
  );
end;
$$;

revoke execute on function public.harvest() from public, anon;
grant execute on function public.harvest() to authenticated;

notify pgrst, 'reload schema';
