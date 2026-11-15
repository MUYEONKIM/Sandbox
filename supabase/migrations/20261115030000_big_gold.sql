-- 골드 상한 없애기와 스탯 칸 넓히기(대장간 배포 A, 기획은 docs/balance/weapons.md 7장).
-- 대장간의 높은 단계 판매가가 10^42까지 가서 골드를 integer(약 21억)에서 상한 없는 numeric으로 바꾼다(사용자가 정함).
-- 스탯과 체력은 bigint로 넓히고, 화면이 숫자를 정확히 세는 끝(2^53 - 1, 약 9,007조)에서 멈춘다(에이전트가 정함).
-- 골드를 돌려주는 함수는 골드를 글자로 보낸다. 화면은 BigInt로 읽는다(레벨과 같은 방식).
--
-- ⚠ 되돌리기 어려운 것: 골드·스탯 칸의 형식을 바꾼다. 이 SQL 뒤에 21억이 넘는 골드가 생기면 예전 형식으로 돌릴 수 없다.
--    실행 전에 지금 값을 보려면 아래 줄만 먼저 실행한다.
--    select max(gold) as gold, max(str) as str, max(def) as def, max(agi) as agi, max(luk) as luk, max(max_hp) as max_hp from public.profiles;
--    select count(*) as dropped, coalesce(sum(amount), 0) as gold_on_ground from public.ground_items where amount is not null;
--
-- 한도(에이전트가 정함)
-- - 도박장 한 판은 지금처럼 10만G까지, 주식은 한 번에 100만 주까지, 땅에 버리는 골드는 한 번에 약 21억까지 그대로 둔다.
--   그래서 bets.amount, ground_items.amount(integer)와 holdings.cost(bigint)는 바꾸지 않는다.
-- - 스탯은 한 번에 10억 포인트까지 산다(예전 1,000).
-- - 가격 표 칸(loot, shop_items, tools, weapons, potions, crops, stats, monsters)은 작은 표 값이라 integer로 둔다.
--   개수나 배율을 곱하는 계산은 함수 안에서 numeric으로 한다.
-- - 남는 한계: 작업 한 번의 개수(harvest)와 가방 자원 수(stash.count)는 integer라 LUK가 약 2,100억을 넘으면 작업이 거절된다.
--   거기까지 LUK를 사려면 골드가 약 10^24 필요해서 그대로 둔다.
--
-- 예전 화면(이 SQL 뒤 새 버전을 푸시하기 전)은 골드를 글자로 받아 일부 창의 골드 셈이 잠깐 어긋날 수 있다. 새로고침하면 새 버전이다.

-- ───────── 1. 칸 ─────────
-- numeric(1000, 0): 소수점 아래 없이 1,000자리까지. 글자로 보낼 때 "123.000"처럼 소수점이 붙지 않게 한다.
alter table public.profiles alter column gold type numeric(1000, 0);

alter table public.profiles
  alter column str type bigint,
  alter column def type bigint,
  alter column agi type bigint,
  alter column luk type bigint,
  alter column max_hp type bigint,
  alter column hp type bigint,
  add constraint profiles_stats_cap check (
    str <= 9007199254740991 and def <= 9007199254740991 and agi <= 9007199254740991
    and luk <= 9007199254740991 and max_hp <= 9007199254740991
  );

-- ───────── 2. 돌려주는 형식이 바뀌는 함수(지우고 다시 만든다) ─────────
-- 골드나 체력을 integer로 돌려주던 함수다. 권한은 아래 6에서 다시 준다.
drop function if exists public.sell_all();
drop function if exists public.buy_tool(text);
drop function if exists public.buy_weapon(text);
drop function if exists public.hit_player(uuid, text);
drop function if exists public.monster_hit(text);
drop function if exists public.land_price(integer);

-- n번째 땅 값: 5,000G × 1.08^(n−1)(사용자가 정함). 460번째부터 bigint를 넘어서 numeric으로 돌려준다.
create function public.land_price(n integer) returns numeric
language sql immutable set search_path = ''
as $$
  select round(5000 * power(1.08::numeric, n - 1));
$$;

-- ───────── 3. 상점·작업장 ─────────
-- 가진 자원을 모두 판다. 돌려주는 것은 남은 골드(글자).
create function public.sell_all() returns text
language plpgsql security definer set search_path = ''
as $$
declare
  earned numeric;
  total numeric;
begin
  with sold as (
    delete from public.stash where player = auth.uid() returning item, count
  )
  select coalesce(sum(sold.count::numeric * loot.price), 0) into earned
    from sold join public.loot on loot.item = sold.item;

  update public.profiles set gold = gold + earned where id = auth.uid() returning gold into total;
  return total::text;
end;
$$;

create function public.buy_tool(tool text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  cost integer;
  remaining numeric;
begin
  select * into strict me from public.profiles where id = auth.uid() for update;

  select price into cost from public.tools where id = tool;
  if not found then
    raise exception 'unknown tool';
  end if;
  if tool = any(me.owned_tools) then
    raise exception 'already owned';
  end if;
  if me.gold < cost then
    raise exception 'not enough gold';
  end if;

  update public.profiles
    set gold = gold - cost, owned_tools = array_append(owned_tools, tool)
    where id = me.id
    returning gold into remaining;
  return remaining::text;
end;
$$;

create function public.buy_weapon(weapon text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  cost integer;
  remaining numeric;
begin
  select * into strict me from public.profiles where id = auth.uid() for update;

  select price into cost from public.weapons where id = weapon;
  if not found then
    raise exception 'unknown weapon';
  end if;
  if weapon = any(me.owned_weapons) then
    raise exception 'already owned';
  end if;
  if me.gold < cost then
    raise exception 'not enough gold';
  end if;

  update public.profiles
    set gold = gold - cost, owned_weapons = array_append(owned_weapons, weapon)
    where id = me.id
    returning gold into remaining;
  return remaining::text;
end;
$$;

create or replace function public.buy_item(item text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  goods public.shop_items%rowtype;
  remaining numeric;
begin
  select * into strict me from public.profiles where id = auth.uid() for update;

  select * into goods from public.shop_items where id = item;
  if not found then
    raise exception 'unknown item';
  end if;
  if me.gold < goods.price then
    raise exception 'not enough gold';
  end if;

  update public.profiles set gold = gold - goods.price where id = me.id returning gold into remaining;
  return jsonb_build_object('gold', remaining::text, 'amount', goods.amount);
end;
$$;

create or replace function public.buy_rename_ticket() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  cost constant integer := 100000;
begin
  select * into strict me from public.profiles where id = auth.uid() for update;
  if me.gold < cost then
    raise exception 'not enough gold';
  end if;

  update public.profiles
    set gold = gold - cost, rename_tickets = rename_tickets + 1
    where id = me.id
    returning gold, rename_tickets into me.gold, me.rename_tickets;
  return jsonb_build_object('gold', me.gold::text, 'tickets', me.rename_tickets);
end;
$$;

-- 스탯을 amount포인트(1~10억) 한 번에 산다. 값은 1포인트씩 산 것의 합이다.
create or replace function public.buy_stat(stat text, amount integer default 1) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  info public.stats%rowtype;
  owned bigint;
  cost numeric;
begin
  if amount is null or amount < 1 or amount > 1000000000 then
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
  if owned + amount > 9007199254740991 - 100 then
    raise exception 'stat too high';
  end if;
  -- owned, owned+1, ..., owned+amount-1번째 포인트 값의 합.
  -- amount × (amount − 1)은 늘 짝수라 bigint 나눗셈이 정확하고, numeric 나눗셈과 달리 소수점이 붙지 않는다.
  cost := amount::numeric * info.base_price
    + info.price_step::numeric * (amount::numeric * owned + amount::bigint * (amount - 1) / 2);
  if me.gold < cost then
    raise exception 'not enough gold';
  end if;

  update public.profiles set
    gold = gold - cost,
    str = str + amount * (stat = 'str')::integer,
    def = def + amount * (stat = 'def')::integer,
    agi = agi + amount * (stat = 'agi')::integer,
    luk = luk + amount * (stat = 'luk')::integer,
    max_hp = max_hp + amount * (stat = 'hp')::integer,
    hp = hp + amount * (stat = 'hp' and hp > 0)::integer
    where id = me.id;

  return jsonb_build_object('gold', (me.gold - cost)::text, 'value', owned + amount);
end;
$$;

create or replace function public.buy_potion(kind text, amount integer default 1) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  item public.potions%rowtype;
  cost numeric;
  new_gold numeric;
  new_count integer;
begin
  if amount is null or amount < 1 or amount > 100 then
    raise exception 'bad amount';
  end if;
  select * into item from public.potions where id = kind;
  if not found then
    raise exception 'unknown potion';
  end if;
  cost := item.price::numeric * amount;

  update public.profiles set gold = gold - cost where id = auth.uid() and gold >= cost returning gold into new_gold;
  if not found then
    raise exception 'not enough gold';
  end if;

  insert into public.player_potions (player, potion, count) values (auth.uid(), kind, amount)
    on conflict (player, potion) do update set count = public.player_potions.count + excluded.count
    returning count into new_count;
  return jsonb_build_object('gold', new_gold::text, 'count', new_count);
end;
$$;

-- ───────── 4. 도박장·주식·땅에 버리기 ─────────
create or replace function public.place_bet(game text, pick text, amount integer) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  side text;
  lines text;
  result text;
  rate numeric := 0;
  won integer;
begin
  if amount is null or amount < 10 or amount > 100000 then
    raise exception 'bad amount';
  end if;

  select * into strict me from public.profiles where id = auth.uid() for update;
  if me.map <> 'casino' then
    raise exception 'not at the casino';
  end if;
  if me.gold < amount then
    raise exception 'not enough gold';
  end if;

  if game = 'ladder' then
    if pick is null or pick not in ('L', 'R', '3', '4', 'L3', 'L4', 'R3', 'R4') then
      raise exception 'bad pick';
    end if;
    side := case when random() < 0.5 then 'L' else 'R' end;
    lines := case when random() < 0.5 then '3' else '4' end;
    result := side || lines;
    if length(pick) = 2 then
      rate := case when pick = result then 3.97 else 0 end;
    else
      rate := case when pick in (side, lines) then 1.96 else 0 end;
    end if;
  elsif game = 'oddeven' then
    if pick is null or pick not in ('odd', 'even') then
      raise exception 'bad pick';
    end if;
    result := (1 + floor(random() * 10))::integer::text;
    rate := case when (result::integer % 2 = 1) = (pick = 'odd') then 1.96 else 0 end;
  elsif game = 'snail' then
    if pick is null or pick not in ('1', '2', '3') then
      raise exception 'bad pick';
    end if;
    result := (1 + floor(random() * 3))::integer::text;
    rate := case when pick = result then 2.97 else 0 end;
  else
    raise exception 'unknown game';
  end if;

  won := floor(amount * rate);
  update public.profiles set gold = gold - amount + won where id = me.id;
  insert into public.bets (player, game, pick, amount, outcome, payout) values (me.id, game, pick, amount, result, won);
  return jsonb_build_object('gold', (me.gold - amount + won)::text, 'outcome', result, 'payout', won);
end;
$$;

create or replace function public.trade_stock(stock text, amount integer) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  quote public.stocks%rowtype;
  held public.holdings%rowtype;
  total bigint;
  now_shares bigint;
  now_cost bigint;
begin
  if amount is null or amount = 0 or abs(amount) > 1000000 then
    raise exception 'bad amount';
  end if;

  select * into strict me from public.profiles p where p.id = auth.uid() for update;
  select * into quote from public.stocks s where s.id = trade_stock.stock;
  if not found then
    raise exception 'unknown stock';
  end if;
  select * into held from public.holdings h where h.player = me.id and h.stock = quote.id for update;
  total := abs(amount)::bigint * quote.price;

  if amount > 0 then
    if me.gold < total then
      raise exception 'not enough gold';
    end if;
    update public.profiles p set gold = p.gold - total where p.id = me.id;
    if held.player is null then
      insert into public.holdings (player, stock, shares, cost) values (me.id, quote.id, amount, total);
      now_shares := amount;
      now_cost := total;
    else
      now_shares := held.shares + amount;
      now_cost := held.cost + total;
      update public.holdings h set shares = now_shares, cost = now_cost where h.player = me.id and h.stock = quote.id;
    end if;
  else
    if held.player is null or held.shares < -amount then
      raise exception 'not enough shares';
    end if;
    update public.profiles p set gold = p.gold + total where p.id = me.id;
    now_shares := held.shares + amount;
    if now_shares = 0 then
      now_cost := 0;
      delete from public.holdings h where h.player = me.id and h.stock = quote.id;
    else
      now_cost := held.cost - round(held.cost::numeric * (-amount) / held.shares)::bigint;
      update public.holdings h set shares = now_shares, cost = now_cost where h.player = me.id and h.stock = quote.id;
    end if;
  end if;

  insert into public.trades (player, stock, amount, price) values (me.id, quote.id, amount, quote.price);
  return jsonb_build_object(
    'gold', (case when amount > 0 then me.gold - total else me.gold + total end)::text,
    'shares', now_shares,
    'cost', now_cost,
    'price', quote.price
  );
end;
$$;

create or replace function public.drop_gold(amount integer, map text, x integer, y integer) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  item public.ground_items%rowtype;
begin
  if drop_gold.amount is null or drop_gold.amount < 1 then
    raise exception 'bad amount';
  end if;
  select * into strict me from public.profiles p where p.id = auth.uid() for update;
  if me.map is distinct from drop_gold.map then
    raise exception 'wrong map';
  end if;
  if me.gold < drop_gold.amount then
    raise exception 'not enough gold';
  end if;
  if not public.ground_room_left(me.id) then
    raise exception 'too many';
  end if;
  update public.profiles p set gold = p.gold - drop_gold.amount where p.id = me.id;
  insert into public.ground_items (map, x, y, amount, dropped_by)
  values (me.map, drop_gold.x, drop_gold.y, drop_gold.amount, me.id)
  returning * into item;
  return jsonb_build_object('item', to_jsonb(item), 'gold', (me.gold - drop_gold.amount)::text);
end;
$$;

-- 골드 칸에 상한이 없어서 예전의 21억 넘침 검사('too much gold')는 뺐다.
create or replace function public.pick_up(item bigint) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  got public.ground_items%rowtype;
begin
  select * into strict me from public.profiles p where p.id = auth.uid() for update;
  delete from public.ground_items g where g.id = pick_up.item and g.map = me.map returning * into got;
  if not found then
    raise exception 'gone';
  end if;
  if got.amount is not null then
    update public.profiles p set gold = p.gold + got.amount where p.id = me.id;
    return jsonb_build_object('id', got.id, 'amount', got.amount, 'gold', (me.gold + got.amount)::text);
  end if;
  update public.memos m set holder = me.id where m.id = got.memo;
  return jsonb_build_object(
    'id', got.id,
    'memo', (
      select jsonb_build_object('id', m.id, 'body', m.body, 'author', a.nickname, 'created_at', m.created_at)
      from public.memos m join public.profiles a on a.id = m.author
      where m.id = got.memo
    )
  );
end;
$$;

-- ───────── 5. 전투·던전·농장 ─────────
-- 돌려주는 것은 맞은 사람의 남은 체력(bigint).
create function public.hit_player(target uuid, weapon text default 'pistol') returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  attacker public.profiles%rowtype;
  victim public.profiles%rowtype;
  arm public.weapons%rowtype;
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

  select * into arm from public.weapons where id = weapon;
  if not found then
    raise exception 'unknown weapon';
  end if;

  -- 서로 동시에 맞혀도 교착되지 않도록 항상 같은 순서로 잠근다.
  perform 1 from public.profiles where id in (auth.uid(), target) order by id for update;

  select * into strict attacker from public.profiles where id = auth.uid();
  if attacker.hp <= 0 then
    raise exception 'shooter is down';
  end if;
  if not weapon = any(attacker.owned_weapons) then
    raise exception 'weapon not owned';
  end if;
  -- 네트워크 지연으로 몰려 오는 요청을 감안해 발사 간격의 60%까지 봐준다.
  if attacker.last_hit_at > now() - arm.cooldown_ms * interval '0.6 milliseconds' then
    raise exception 'too fast';
  end if;

  select * into victim from public.profiles where id = target;
  -- 공격 금지: 시작마을과 그 안의 상점(mart)·대장간(smithy) 안 맵(2026-11-15, 안 맵은 에이전트가 정함).
  if not found or victim.map <> attacker.map or victim.hp <= 0 or attacker.map in ('plains', 'mart', 'smithy') then
    return null;
  end if;

  update public.profiles set last_hit_at = now() where id = attacker.id;

  if random() < least(0.6, victim.agi::numeric / (victim.agi + 1000)) then
    perform realtime.send(jsonb_build_object('id', target), 'dodge', 'world-chat', true);
    return victim.hp;
  end if;

  -- 피해는 정수라서 소수점 아래는 그 확률만큼 1을 더한다. 그래야 0.1%씩 쌓인 스텟도 평균에 그대로 반영된다.
  -- 체력보다 큰 피해는 체력만큼으로 줄여 bigint를 넘지 않게 한다.
  damage := least(victim.hp, greatest(1, floor(arm.damage * (1 + attacker.str * 0.001) * 1000 / (1000 + victim.def) + random()::numeric)));

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

create or replace function public.kill_monster(kind text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  m public.monsters%rowtype;
  p public.profiles%rowtype;
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

  update public.profiles set gold = gold + m.gold, last_kill_at = now() where id = p.id returning gold into new_gold;
  leveled := public.gain_exp(p.id, m.exp);
  return leveled || jsonb_build_object('gold', new_gold::text, 'gained_gold', m.gold, 'gained_exp', m.exp);
end;
$$;

-- 몬스터에게 맞은 사람이 부른다. 돌려주는 것은 남은 체력(bigint).
create function public.monster_hit(kind text) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  m public.monsters%rowtype;
  p public.profiles%rowtype;
  dealt bigint;
  remaining bigint;
begin
  select * into m from public.monsters where id = kind;
  if not found then
    raise exception 'unknown monster';
  end if;

  select * into strict p from public.profiles where id = auth.uid() for update;
  if p.map <> m.dungeon or p.hp <= 0 then
    return null;
  end if;
  if m.damage = 0 or p.last_monster_hit_at > now() - interval '150 milliseconds' then
    return p.hp;
  end if;

  update public.profiles set last_monster_hit_at = now() where id = p.id;

  if random() < least(0.6, p.agi::numeric / (p.agi + 1000)) then
    perform realtime.send(jsonb_build_object('id', p.id), 'dodge', 'world-chat', true);
    return p.hp;
  end if;

  dealt := greatest(1, floor(m.damage * 1000 / (1000 + p.def) + random()::numeric));
  update public.profiles set hp = greatest(hp - dealt, 0) where id = p.id returning hp into remaining;
  perform realtime.send(jsonb_build_object('id', p.id, 'hp', remaining, 'max', p.max_hp), 'hp', 'world-chat', true);
  return remaining;
end;
$$;

create or replace function public.respawn() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  full_hp bigint;
begin
  update public.profiles set hp = max_hp where id = auth.uid() and hp = 0 returning hp into full_hp;
  if found then
    perform realtime.send(
      jsonb_build_object('id', auth.uid(), 'hp', full_hp, 'max', full_hp),
      'hp',
      'world-chat',
      true
    );
  end if;
end;
$$;

create or replace function public.use_potion(kind text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  item public.potions%rowtype;
  p public.profiles%rowtype;
  left_count integer;
  new_hp bigint;
begin
  select * into item from public.potions where id = kind;
  if not found then
    raise exception 'unknown potion';
  end if;

  select * into strict p from public.profiles where id = auth.uid() for update;
  if p.hp <= 0 then
    raise exception 'player is down';
  end if;
  if p.hp >= p.max_hp then
    raise exception 'hp is full';
  end if;
  if p.last_potion_at > now() - interval '1 second' then
    raise exception 'too fast';
  end if;

  update public.player_potions set count = count - 1
    where player = p.id and potion = kind and count > 0
    returning count into left_count;
  if not found then
    raise exception 'no potion';
  end if;

  update public.profiles set hp = least(max_hp, hp + item.heal), last_potion_at = now() where id = p.id returning hp into new_hp;
  perform realtime.send(jsonb_build_object('id', p.id, 'hp', new_hp, 'max', p.max_hp), 'hp', 'world-chat', true);
  return jsonb_build_object('hp', new_hp, 'count', left_count);
end;
$$;

-- 땅을 한 번에 여러 칸(1~100) 산다. cells는 [[x, y], ...]. 한 칸이라도 이미 주인이 있거나 골드가 모자라면 전부 취소한다.
create or replace function public.buy_plots(cells jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  want integer;
  owned integer;
  added integer;
  total numeric;
  new_gold numeric;
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
  return jsonb_build_object('gold', new_gold::text, 'owned', owned + want, 'cost', total::text);
end;
$$;

-- 내 빈 땅을 판다. 마지막에 산 칸부터 산 값의 절반을 돌려준다.
create or replace function public.sell_plots(cells jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  want integer;
  owned integer;
  ok integer;
  refund numeric;
  new_gold numeric;
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
  -- 예전 bigint 나눗셈처럼 절반에서 소수점 아래를 버린다.
  select coalesce(sum(floor(public.land_price(owned - i) / 2)), 0) into refund from generate_series(0, want - 1) as i;
  delete from public.farm_plots as f using picked where f.x = picked.x and f.y = picked.y;
  update public.profiles set gold = gold + refund where id = me returning gold into new_gold;
  return jsonb_build_object('gold', new_gold::text, 'owned', owned - want, 'refund', refund::text);
end;
$$;

create or replace function public.buy_seeds(seed text, amount integer) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  c public.crops%rowtype;
  cost numeric;
  new_gold numeric;
  new_count integer;
begin
  if amount is null or amount < 1 or amount > 1000 then
    raise exception 'bad amount';
  end if;
  select * into c from public.crops where id = seed;
  if not found then
    raise exception 'unknown crop';
  end if;
  cost := c.price::numeric * amount;
  update public.profiles set gold = gold - cost where id = auth.uid() and gold >= cost returning gold into new_gold;
  if not found then
    raise exception 'not enough gold';
  end if;
  insert into public.farm_stock as s (player, kind, crop, count) values (auth.uid(), 'seed', c.id, amount)
    on conflict (player, kind, crop) do update set count = s.count + excluded.count
    returning count into new_count;
  return jsonb_build_object('gold', new_gold::text, 'count', new_count);
end;
$$;

create or replace function public.sell_crops() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  earned numeric;
  new_gold numeric;
begin
  select coalesce(sum(s.count * round(c.price * case s.kind when 'praise' then 1.1 when 'blame' then 0.9 else 1 end)), 0)
    into earned
  from public.farm_stock as s
  join public.crops as c on c.id = s.crop
  where s.player = auth.uid() and s.kind <> 'seed';
  delete from public.farm_stock where player = auth.uid() and kind <> 'seed';
  update public.profiles set gold = gold + earned where id = auth.uid() returning gold into new_gold;
  return jsonb_build_object('gold', new_gold::text, 'earned', earned::text);
end;
$$;

-- ───────── 6. 권한 ─────────
-- 다시 만든 함수는 예전처럼 로그인한 사람만 부른다. land_price는 예전처럼 누구나 부른다.
revoke execute on function
  public.sell_all(), public.buy_tool(text), public.buy_weapon(text), public.hit_player(uuid, text), public.monster_hit(text)
from public, anon;
grant execute on function
  public.sell_all(), public.buy_tool(text), public.buy_weapon(text), public.hit_player(uuid, text), public.monster_hit(text)
to authenticated;
