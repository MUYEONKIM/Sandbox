-- 기본 블록 11종을 상점에 내놓고, 모든 플레이어에게 한 번 한 묶음씩 준다(2026-11-10).
-- 상점 품목 id는 src/blocks.ts의 BLOCKS 키와 같다. 이 게임 버전이 모르는 id는 상점에 안 보이므로 배포 전에 실행해도 된다.
-- 다시 실행해도 된다(이미 있는 품목과 표는 건너뛴다).
insert into public.shop_items (id, price, amount, sort) values
  ('cobble', 120, 16, 21),
  ('dirt', 120, 16, 22),
  ('grass', 120, 16, 23),
  ('sand', 120, 16, 24),
  ('glass', 120, 16, 25),
  ('snow', 120, 16, 26),
  ('white_block', 120, 16, 27),
  ('black_block', 120, 16, 28),
  ('red_block', 120, 16, 29),
  ('blue_block', 120, 16, 30),
  ('yellow_block', 120, 16, 31)
on conflict (id) do nothing;

-- 계정마다 한 번만 받는 선물을 적어 둔다. 블록은 클라이언트가 가방에 넣고, 이 표는 두 번 받지 않게만 막는다.
create table if not exists public.gifts (
  player uuid not null references auth.users (id) on delete cascade,
  gift text not null,
  claimed_at timestamptz not null default now(),
  primary key (player, gift)
);

alter table public.gifts enable row level security;
revoke all on public.gifts from anon, authenticated;

-- 선물을 받는다. 처음이면 true, 이미 받았으면 false를 돌려준다.
create or replace function public.claim_gift(gift text) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if gift not in ('basic-blocks') then
    raise exception 'unknown gift';
  end if;
  insert into public.gifts (player, gift) values (auth.uid(), claim_gift.gift) on conflict do nothing;
  return found;
end;
$$;

revoke execute on function public.claim_gift(text) from public, anon;
grant execute on function public.claim_gift(text) to authenticated;

notify pgrst, 'reload schema';
