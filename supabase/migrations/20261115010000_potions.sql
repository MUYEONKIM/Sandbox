-- 체력 포션 세 가지(2026-11-15 사용자 요청 "포션도 추가하자", 질문에 "체력 회복 3종", "단축키 칸에 넣고 클릭"을 고름).
-- 상점에서 사서 가진 개수는 서버가 세고, 마시면 서버가 체력을 채운다. 회복량과 값은 표 값이라 재배포 없이 바꾼다(임시 값).

create table if not exists public.potions (
  id text primary key,
  name text not null,
  blurb text not null,
  -- 마시면 채우는 체력(최대 체력을 넘지 않음)
  heal integer not null check (heal > 0),
  price integer not null check (price > 0),
  sort integer not null default 0
);

create table if not exists public.player_potions (
  player uuid not null references public.profiles (id) on delete cascade,
  potion text not null references public.potions (id),
  count integer not null check (count >= 0),
  primary key (player, potion)
);

alter table public.potions enable row level security;
alter table public.player_potions enable row level security;
revoke all on public.potions, public.player_potions from anon, authenticated;
grant select on public.potions, public.player_potions to authenticated;

drop policy if exists "players read potions" on public.potions;
create policy "players read potions" on public.potions for select to authenticated using (true);
drop policy if exists "players read own potions" on public.player_potions;
create policy "players read own potions" on public.player_potions for select to authenticated using (player = auth.uid());

-- 임시 값: 체력 1당 5G. 작업장 기본 벌이(분당 약 350G)로 작은 포션 두 개쯤.
insert into public.potions (id, name, blurb, heal, price, sort) values
  ('potion_small', '작은 체력 포션', '체력을 30 채웁니다.', 30, 150, 1),
  ('potion_medium', '체력 포션', '체력을 80 채웁니다.', 80, 400, 2),
  ('potion_large', '큰 체력 포션', '체력을 200 채웁니다.', 200, 1000, 3)
on conflict (id) do nothing;

alter table public.profiles add column if not exists last_potion_at timestamptz not null default 'epoch';

-- 포션을 amount개(1~100) 산다. 새 골드와 그 포션의 개수를 돌려준다.
create or replace function public.buy_potion(kind text, amount integer default 1) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  item public.potions%rowtype;
  cost integer;
  new_gold integer;
  new_count integer;
begin
  if amount is null or amount < 1 or amount > 100 then
    raise exception 'bad amount';
  end if;
  select * into item from public.potions where id = kind;
  if not found then
    raise exception 'unknown potion';
  end if;
  cost := item.price * amount;

  update public.profiles set gold = gold - cost where id = auth.uid() and gold >= cost returning gold into new_gold;
  if not found then
    raise exception 'not enough gold';
  end if;

  insert into public.player_potions (player, potion, count) values (auth.uid(), kind, amount)
    on conflict (player, potion) do update set count = public.player_potions.count + excluded.count
    returning count into new_count;
  return jsonb_build_object('gold', new_gold, 'count', new_count);
end;
$$;

-- 포션 하나를 마신다. 쓰러져 있거나, 체력이 가득 찼거나, 1초 안에 다시 마시면 거절한다.
-- 새 체력과 남은 개수를 돌려주고, 체력 변화는 world-chat으로 모두에게 알린다.
create or replace function public.use_potion(kind text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  item public.potions%rowtype;
  p public.profiles%rowtype;
  left_count integer;
  new_hp integer;
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

revoke execute on function public.buy_potion(text, integer), public.use_potion(text) from public, anon;
grant execute on function public.buy_potion(text, integer), public.use_potion(text) to authenticated;

notify pgrst, 'reload schema';
