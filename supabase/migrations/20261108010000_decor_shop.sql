-- 상점에서 꾸미기 블록(벽, 나무, 꽃, 바위, 가구 등)을 판다. 공격 무기는 이 표에 넣지 않는다.
-- id는 src/blocks.ts의 BLOCKS 키와 같아야 하고, price골드에 amount개를 준다.
-- 가격과 묶음 수는 이 표가 기준이라 재배포 없이 바꿀 수 있다.
-- 중간까지만 실행된 상태에서 다시 실행해도 되도록, 이미 있는 것은 건너뛰고 빠진 것만 채운다.
create table if not exists public.shop_items (
  id text primary key,
  price integer not null check (price > 0),
  amount integer not null check (amount between 1 and 64),
  sort integer not null default 0
);

insert into public.shop_items (id, price, amount, sort) values
  ('stone', 120, 16, 1),
  ('brick', 120, 16, 2),
  ('wood', 120, 16, 3),
  ('hedge', 120, 16, 4),
  ('oak', 300, 1, 5),
  ('pine', 300, 1, 6),
  ('fir', 300, 1, 7),
  ('flower', 30, 1, 8),
  ('weed', 20, 1, 9),
  ('rock', 80, 1, 10),
  ('log', 80, 1, 11),
  ('bush', 60, 1, 12),
  ('cafe_table', 250, 1, 13),
  ('plant', 150, 1, 14)
on conflict (id) do nothing;

alter table public.shop_items enable row level security;

revoke all on public.shop_items from anon, authenticated;
grant select on public.shop_items to authenticated;

drop policy if exists "players read shop items" on public.shop_items;
create policy "players read shop items" on public.shop_items
  for select to authenticated using (true);

-- 꾸미기 블록 한 묶음을 산다. 새 골드와 받은 개수를 돌려준다. 블록은 클라이언트 인벤토리에 들어간다.
create or replace function public.buy_item(item text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  goods public.shop_items%rowtype;
  remaining integer;
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
  return jsonb_build_object('gold', remaining, 'amount', goods.amount);
end;
$$;

revoke execute on function public.buy_item(text) from public, anon;
grant execute on function public.buy_item(text) to authenticated;

-- 실제 서버(PostgREST)가 새 표와 함수를 바로 알아보게 한다.
notify pgrst, 'reload schema';
