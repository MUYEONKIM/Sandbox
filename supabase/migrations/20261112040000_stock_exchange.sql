-- 증권거래소(2026-11-12 사용자 요청): 삼성전자, SK하이닉스, 한화는 실제 주가를 1시간마다 한 번 받아오고,
-- 상장하지 않은 아이티공간은 10,000원에서 시작해 대체로 내려가게 서버가 1시간마다 움직인다.
-- 1원 = 1G. 매수와 매도만 있고(지정가, 예약 없음) 지금 가격에 바로 체결된다.
-- 다시 실행해도 되게 했다(가격과 보유 주식은 그대로 두고 종목 설정만 고친다).

-- 서버가 직접 주가를 받아오는 데(http, 응답을 그 자리에서 받음)와 1시간마다 부르는 데(pg_cron) 쓴다.
create extension if not exists http with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- 종목. code가 있으면 실제 상장 종목(한국거래소 종목 코드)이고 없으면 서버가 만든 가격이다.
-- drift, swing은 상장하지 않은 종목만 쓴다: 한 시간마다 가격에 (1 + drift ± swing)을 곱한다(± 안에서 고르게 무작위).
create table if not exists public.stocks (
  id text primary key,
  name text not null,
  code text unique,
  price integer not null check (price > 0),
  -- 바로 전 갱신 때의 가격. 창에 "1시간 전보다"로 보인다.
  prev_price integer not null check (prev_price > 0),
  updated_at timestamptz not null default now(),
  drift double precision not null default 0,
  swing double precision not null default 0 check (swing >= 0),
  sort smallint not null default 0
);

-- 시작 가격은 2026-11-12 17시 42분에 네이버 증권에서 받은 값이다. 실행 끝에 실제 가격을 한 번 받아 덮어쓴다.
-- 아이티공간: 한 시간에 -3% ~ +2.5%(평균 -0.25%). 하루면 평균 6%쯤 내려가고, 오르는 날도 가끔 있다.
insert into public.stocks (id, name, code, price, prev_price, drift, swing, sort) values
  ('samsung', '삼성전자', '005930', 208000, 208000, 0, 0, 1),
  ('hynix', 'SK하이닉스', '000660', 1252000, 1252000, 0, 0, 2),
  ('hanwha', '한화', '000880', 77800, 77800, 0, 0, 3),
  ('itspace', '아이티공간', null, 10000, 10000, -0.0025, 0.0275, 4)
on conflict (id) do update set
  name = excluded.name,
  code = excluded.code,
  drift = excluded.drift,
  swing = excluded.swing,
  sort = excluded.sort;

-- 플레이어가 가진 주식. cost는 지금 가진 주식을 사는 데 쓴 골드(평균 단가 = cost / shares).
create table if not exists public.holdings (
  player uuid not null references auth.users (id) on delete cascade,
  stock text not null references public.stocks (id),
  shares bigint not null check (shares > 0),
  cost bigint not null check (cost >= 0),
  primary key (player, stock)
);

-- 거래 기록. 클라이언트는 못 읽는다(나중에 문제가 생기면 살펴보는 용도).
create table if not exists public.trades (
  id bigint generated always as identity primary key,
  player uuid not null references auth.users (id) on delete cascade,
  stock text not null references public.stocks (id),
  -- 산 주식 수(판 것은 음수)
  amount integer not null,
  price integer not null,
  at timestamptz not null default now()
);

alter table public.stocks enable row level security;
alter table public.holdings enable row level security;
alter table public.trades enable row level security;
revoke all on public.stocks, public.holdings, public.trades from anon, authenticated;

-- 상장 종목의 지금 가격을 받아온다. 네이버 증권이 답하지 않거나 이상한 값을 주면 가격을 그대로 둔다.
create or replace function public.fetch_listed_prices() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  codes text;
  response extensions.http_response;
  item jsonb;
  quote integer;
begin
  select string_agg(code, ',' order by sort) into codes from public.stocks where code is not null;
  if codes is null then
    return;
  end if;

  begin
    response := extensions.http_get('https://polling.finance.naver.com/api/realtime/domestic/stock/' || codes);
    if response.status <> 200 then
      raise warning 'stock prices: http %', response.status;
      return;
    end if;
    for item in select jsonb_array_elements(response.content::jsonb -> 'datas') loop
      -- closePrice는 "208,000"처럼 쉼표가 든 글자다.
      quote := nullif(regexp_replace(coalesce(item ->> 'closePrice', ''), '[^0-9]', '', 'g'), '')::integer;
      if quote > 0 then
        update public.stocks set prev_price = price, price = quote, updated_at = now()
          where code = item ->> 'itemCode';
      end if;
    end loop;
  exception when others then
    raise warning 'stock prices: %', sqlerrm;
  end;
end;
$$;

-- 상장하지 않은 종목(아이티공간)을 한 걸음 움직인다. 1원 밑으로는 안 내려간다.
create or replace function public.step_unlisted_prices() returns void
language sql security definer set search_path = ''
as $$
  update public.stocks set
    prev_price = price,
    price = greatest(1, round(price * (1 + drift + swing * (2 * random() - 1))))::integer,
    updated_at = now()
    where code is null;
$$;

-- 매시 정각에 pg_cron이 부른다.
create or replace function public.refresh_stock_prices() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.step_unlisted_prices();
  perform public.fetch_listed_prices();
end;
$$;

revoke execute on function public.fetch_listed_prices() from public, anon, authenticated;
revoke execute on function public.step_unlisted_prices() from public, anon, authenticated;
revoke execute on function public.refresh_stock_prices() from public, anon, authenticated;

select cron.schedule('stock-prices', '0 * * * *', 'select public.refresh_stock_prices()');

-- 종목과 지금 가격. 실제 주가라 비밀이 아니어서 로그인하지 않아도 읽는다(배포 뒤 공개 키로 갱신 여부를 확인하는 데도 쓴다).
create or replace function public.stock_quotes()
returns table (id text, name text, price integer, prev_price integer, updated_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.name, s.price, s.prev_price, s.updated_at from public.stocks s order by s.sort;
$$;

revoke execute on function public.stock_quotes() from public;
grant execute on function public.stock_quotes() to anon, authenticated;

-- 내가 가진 주식
create or replace function public.my_holdings()
returns table (stock text, shares bigint, cost bigint)
language sql stable security definer set search_path = ''
as $$
  select h.stock, h.shares, h.cost from public.holdings h where h.player = auth.uid();
$$;

revoke execute on function public.my_holdings() from public, anon;
grant execute on function public.my_holdings() to authenticated;

-- 주식을 지금 가격에 산다(amount > 0) 또는 판다(amount < 0). 한 번에 1~1,000,000주.
-- 팔면 판 비율만큼 산 값(cost)도 덜어 내서 평균 단가가 그대로다.
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
    update public.profiles p set gold = p.gold - total::integer where p.id = me.id;
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
    -- 골드 열(integer)이 넘치지 않게 한다.
    if me.gold::bigint + total > 2147483647 then
      raise exception 'too much gold';
    end if;
    update public.profiles p set gold = p.gold + total::integer where p.id = me.id;
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
    'gold', me.gold - sign(amount)::bigint * total,
    'shares', now_shares,
    'cost', now_cost,
    'price', quote.price
  );
end;
$$;

revoke execute on function public.trade_stock(text, integer) from public, anon;
grant execute on function public.trade_stock(text, integer) to authenticated;

-- 실행하자마자 실제 가격을 한 번 받아 둔다(아이티공간은 그대로 10,000원에서 시작).
select public.fetch_listed_prices();

notify pgrst, 'reload schema';
