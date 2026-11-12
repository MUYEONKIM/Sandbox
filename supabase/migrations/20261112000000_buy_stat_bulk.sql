-- 스텟을 한 번에 여러 포인트 산다(2026-11-12 사용자 요청 "+10, +100, +1000도 살 수 있게").
-- 값은 1포인트씩 산 것과 똑같다: 한 포인트마다 price_step씩 비싸지므로 그 합(등차수열의 합)을 한 번에 낸다.
-- amount를 빼고 부르면 1이라, 이 SQL을 실행한 뒤에도 지금 실제 사이트(1씩 사는 버전)가 그대로 동작한다.
-- 다시 실행해도 되게 했다.

-- 인자가 바뀌므로 예전 함수(stat 하나만 받는)를 지운다. 남겨 두면 PostgREST가 둘 중 무엇을 부를지 못 고른다.
drop function if exists public.buy_stat(text);

-- 스텟을 amount(1~1000)만큼 올린다. HP는 최대 체력과 지금 체력을 함께 올린다(쓰러져 있으면 지금 체력은 그대로).
-- 나머지는 20261111000000_exp_hp.sql과 같다. 가격 계산은 src/game/economy.ts의 statPrice와 같아야 한다.
create or replace function public.buy_stat(stat text, amount integer default 1) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  info public.stats%rowtype;
  owned integer;
  cost bigint;
begin
  if amount is null or amount < 1 or amount > 1000 then
    raise exception 'bad amount';
  end if;

  select * into strict me from public.profiles where id = auth.uid() for update;

  select * into info from public.stats where id = stat;
  if not found then
    raise exception 'unknown stat';
  end if;

  owned := case stat
    when 'str' then me.str
    when 'def' then me.def
    when 'agi' then me.agi
    when 'luk' then me.luk
    when 'hp' then me.max_hp - 100
  end;
  -- owned, owned+1, ..., owned+amount-1번째 포인트 값의 합
  cost := amount::bigint * info.base_price
    + info.price_step::bigint * (amount::bigint * owned + amount::bigint * (amount - 1) / 2);
  if me.gold < cost then
    raise exception 'not enough gold';
  end if;

  update public.profiles set
    gold = gold - cost::integer,
    str = str + amount * (stat = 'str')::integer,
    def = def + amount * (stat = 'def')::integer,
    agi = agi + amount * (stat = 'agi')::integer,
    luk = luk + amount * (stat = 'luk')::integer,
    max_hp = max_hp + amount * (stat = 'hp')::integer,
    hp = hp + amount * (stat = 'hp' and hp > 0)::integer
    where id = me.id;

  return jsonb_build_object('gold', me.gold - cost, 'value', owned + amount);
end;
$$;

revoke execute on function public.buy_stat(text, integer) from public, anon;
grant execute on function public.buy_stat(text, integer) to authenticated;

notify pgrst, 'reload schema';
