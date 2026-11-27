-- 방 꾸미기 새 거리의 서버 규칙(2026-11-27, 기획 세션 2 공유 노트 room-rules.md 9절 S1~S3, PM 전달).
-- 다시 실행해도 된다: create table if not exists, create or replace, drop … if exists 뒤 다시 만듦. 놓인 블록과 땅의 것은 건드리지 않는다.
-- 예전 화면(배포 전)과 함께 돌아도 된다: 예전 화면은 천장 자리(z 9) 줄과 모르는 블록 id, blocks의 UPDATE 알림을 그냥 넘긴다.
--
-- S1. 블록 상태 바꾸기(등 켜고 끄기, 커튼 여닫기): toggle_block이 그 줄의 block id만 짝 id로 바꾼다. 그 맵에 있는 사람만 부른다.
--     짝은 표가 아니라 id 이름 규칙으로 본다(코드 세션 5가 정함: 그림이 늘 때마다 SQL을 다시 실행하지 않게).
--     두 id에서 상태 토막(_on, _off, _open, _shut)을 뺀 나머지가 같고 두 id가 다르면 짝이다.
--     예: rd_laptop_on_1 ↔ rd_laptop_off_1, rd_lamp_desk ↔ rd_lamp_desk_off, rd_window_wood_open_1 ↔ rd_window_wood_shut_1.
--     바뀐 줄은 blocks의 UPDATE로 그 맵 사람들에게 간다(Realtime, 누를 때 1개).
-- S2. 상자 안(box_items): 상자 가구 블록 자리(맵, x, y, z)에 메모나 골드를 12개까지 넣는다. 누구나 꺼낸다.
--     box_list(읽기), box_put(내 메모 하나 또는 골드), box_take(한 줄 꺼내기). 그 맵에 있는 사람만 부른다. 칸 거리는 화면이 본다.
--     그 자리에 블록 줄이 있는지만 서버가 본다(어느 가구가 상자인지는 화면이 정함, 코드 세션 5가 정함).
--     상자 블록을 치우면(blocks DELETE) 안의 것이 그 칸 땅(ground_items)으로 떨어진다(트리거). 떨어진 것은 누구 것도 아니다(dropped_by null).
-- S3. 천장 자리: blocks.z에 9를 더한다(0~4는 바닥 쌓기 그대로). 천장 자리는 아래 블록 없이 놓고, 아래 것을 치워도 남는다.
--     치우기 정책('바로 위 z + 1이 없을 때만')은 그대로다: z 4 위는 5라 천장 자리(9)에 막히지 않고, z 9 위는 10이라 늘 치워진다.
-- 모험 값, 사용자가 실제 DB에서 직접 바꾼 값은 건드리지 않는다.
--
-- 실제 DB 확인(SQL Editor, 실행 뒤, 모두 true):
--   select
--     to_regprocedure('public.toggle_block(text, integer, integer, integer, text)') is not null as s1_toggle,
--     public.block_state_base('rd_laptop_on_1') = public.block_state_base('rd_laptop_off_1')
--       and public.block_state_base('rd_lamp_desk_off') = 'rd_lamp_desk'
--       and public.block_state_base('rd_window_wood_shut_2') = public.block_state_base('rd_window_wood_open_2')
--       and public.block_state_base('rd_sofa_1') <> public.block_state_base('rd_sofa_2') as s1_pairs,
--     to_regclass('public.box_items') is not null
--       and (select c.relrowsecurity from pg_class as c where c.oid = 'public.box_items'::regclass) as s2_table,
--     to_regprocedure('public.box_list(text, integer, integer, integer)') is not null
--       and to_regprocedure('public.box_put(text, integer, integer, integer, bigint, integer)') is not null
--       and to_regprocedure('public.box_take(bigint)') is not null as s2_functions,
--     exists (select 1 from pg_trigger as t where t.tgrelid = 'public.blocks'::regclass and t.tgname = 'blocks_spill_box') as s2_trigger,
--     (select pg_get_constraintdef(c.oid) from pg_constraint as c
--        where c.conrelid = 'public.blocks'::regclass and c.conname = 'blocks_z_check') like '%9%' as s3_z_check,
--     (select pg_get_expr(p.polwithcheck, p.polrelid) from pg_policy as p
--        where p.polrelid = 'public.blocks'::regclass and p.polname = 'players place blocks') like '%z = 9%' as s3_place_policy,
--     (select pg_get_expr(p.polwithcheck, p.polrelid) from pg_policy as p
--        where p.polrelid = 'public.blocks'::regclass and p.polname = 'players place blocks') like '%farm_is_gate%'
--       and (select pg_get_expr(p.polwithcheck, p.polrelid) from pg_policy as p
--        where p.polrelid = 'public.blocks'::regclass and p.polname = 'players place blocks') like '%adv_%' as place_rules_kept;

-- ───────── S1. 블록 상태 바꾸기 ─────────

-- 블록 id에서 상태 토막을 뺀 것. 짝인 두 id는 이 값이 같다.
create or replace function public.block_state_base(id text) returns text
language sql immutable set search_path = ''
as $$
  select regexp_replace(block_state_base.id, '_(on|off|open|shut)(?=_|$)', '', 'g');
$$;

revoke execute on function public.block_state_base(text) from public, anon;
grant execute on function public.block_state_base(text) to authenticated;

-- (map, x, y, z)의 블록을 짝 id next로 바꾸고 바뀐 id를 돌려준다.
-- 'wrong map': 내가 그 맵에 없음. 'gone': 그 자리에 블록이 없음. 'bad state': next가 지금 id의 짝이 아님(남이 먼저 바꿨을 때도).
create or replace function public.toggle_block(map text, x integer, y integer, z integer, next text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  now_id text;
begin
  select * into strict me from public.profiles p where p.id = auth.uid();
  if me.map is distinct from toggle_block.map then
    raise exception 'wrong map';
  end if;
  select b.block into now_id from public.blocks b
  where b.map = toggle_block.map and b.x = toggle_block.x and b.y = toggle_block.y and b.z = toggle_block.z
  for update;
  if not found then
    raise exception 'gone';
  end if;
  if toggle_block.next is null or char_length(toggle_block.next) > 32 or toggle_block.next = now_id
    or public.block_state_base(toggle_block.next) <> public.block_state_base(now_id) then
    raise exception 'bad state';
  end if;
  update public.blocks b set block = toggle_block.next
  where b.map = toggle_block.map and b.x = toggle_block.x and b.y = toggle_block.y and b.z = toggle_block.z;
  return toggle_block.next;
end;
$$;

revoke execute on function public.toggle_block(text, integer, integer, integer, text) from public, anon;
grant execute on function public.toggle_block(text, integer, integer, integer, text) to authenticated;

-- ───────── S2. 상자 안 ─────────

create table if not exists public.box_items (
  id bigint generated always as identity primary key,
  map text not null check (char_length(map) <= 32),
  x integer not null check (x between 0 and 99),
  y integer not null check (y between 0 and 99),
  z integer not null check (z between 0 and 9),
  -- 메모면 memo, 골드면 amount 하나만 있다(ground_items와 같음).
  memo bigint unique references public.memos (id) on delete cascade,
  amount integer check (amount > 0),
  put_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((memo is null) <> (amount is null))
);

create index if not exists box_items_place on public.box_items (map, x, y, z);

-- 표는 직접 읽고 쓰지 못한다. 아래 함수로만 다룬다.
alter table public.box_items enable row level security;
revoke all on public.box_items from anon, authenticated;

-- 상자 안의 것, 넣은 차례. 메모는 꺼내기 전에도 글을 읽는다.
-- [{ id, amount(골드면 수, 메모면 null), memo: { id, body, author } 또는 null }]
create or replace function public.box_list(map text, x integer, y integer, z integer) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
begin
  select * into strict me from public.profiles p where p.id = auth.uid();
  if me.map is distinct from box_list.map then
    raise exception 'wrong map';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id,
      'amount', i.amount,
      'memo', case when i.memo is null then null else (
        select jsonb_build_object('id', m.id, 'body', m.body, 'author', a.nickname)
        from public.memos m join public.profiles a on a.id = m.author
        where m.id = i.memo
      ) end
    ) order by i.id)
    from public.box_items i
    where i.map = box_list.map and i.x = box_list.x and i.y = box_list.y and i.z = box_list.z
  ), '[]'::jsonb);
end;
$$;

-- 상자에 내 메모 하나(memo) 또는 골드(amount)를 넣는다. 둘 중 하나만 준다. 돌려주는 것: { id, gold(넣은 뒤 내 골드, 글자) }
-- 'wrong map', 'no box'(그 자리에 블록 없음), 'full'(12개), 'not your memo', 'bad amount', 'not enough gold'
create or replace function public.box_put(map text, x integer, y integer, z integer, memo bigint, amount integer) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  new_id bigint;
begin
  if (box_put.memo is null) = (box_put.amount is null) then
    raise exception 'bad item';
  end if;
  select * into strict me from public.profiles p where p.id = auth.uid() for update;
  if me.map is distinct from box_put.map then
    raise exception 'wrong map';
  end if;
  -- 상자 블록 줄을 잠가 두 사람이 한꺼번에 넣어도 12개를 넘지 않게 한다.
  perform 1 from public.blocks b
  where b.map = box_put.map and b.x = box_put.x and b.y = box_put.y and b.z = box_put.z
  for update;
  if not found then
    raise exception 'no box';
  end if;
  if (select count(*) from public.box_items i
      where i.map = box_put.map and i.x = box_put.x and i.y = box_put.y and i.z = box_put.z) >= 12 then
    raise exception 'full';
  end if;
  if box_put.memo is not null then
    update public.memos m set holder = null where m.id = box_put.memo and m.holder = me.id;
    if not found then
      raise exception 'not your memo';
    end if;
  else
    if box_put.amount < 1 then
      raise exception 'bad amount';
    end if;
    if me.gold < box_put.amount then
      raise exception 'not enough gold';
    end if;
    update public.profiles p set gold = p.gold - box_put.amount where p.id = me.id;
    me.gold := me.gold - box_put.amount;
  end if;
  insert into public.box_items (map, x, y, z, memo, amount, put_by)
  values (box_put.map, box_put.x, box_put.y, box_put.z, box_put.memo, box_put.amount, me.id)
  returning id into new_id;
  return jsonb_build_object('id', new_id, 'gold', me.gold::text);
end;
$$;

-- 상자 안의 한 줄을 꺼낸다. 먼저 꺼낸 사람만 받고, 늦은 사람은 'gone'.
-- 골드면 { id, amount, gold(꺼낸 뒤 내 골드, 글자) }, 메모면 { id, memo: { id, body, author } } (pick_up과 같은 꼴)
create or replace function public.box_take(item bigint) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  got public.box_items%rowtype;
begin
  select * into strict me from public.profiles p where p.id = auth.uid() for update;
  delete from public.box_items i where i.id = box_take.item and i.map = me.map returning * into got;
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

revoke execute on function public.box_list(text, integer, integer, integer) from public, anon;
revoke execute on function public.box_put(text, integer, integer, integer, bigint, integer) from public, anon;
revoke execute on function public.box_take(bigint) from public, anon;
grant execute on function public.box_list(text, integer, integer, integer) to authenticated;
grant execute on function public.box_put(text, integer, integer, integer, bigint, integer) to authenticated;
grant execute on function public.box_take(bigint) to authenticated;

-- 상자 블록이 치워지면 안의 것을 그 칸 땅으로 옮긴다. 땅의 것은 ground_items INSERT로 그 맵 사람들에게 보인다.
create or replace function public.spill_box() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  with gone as (
    delete from public.box_items i
    where i.map = old.map and i.x = old.x and i.y = old.y and i.z = old.z
    returning i.memo, i.amount, i.id
  )
  insert into public.ground_items (map, x, y, memo, amount, dropped_by)
  select old.map, old.x, old.y, g.memo, g.amount, null from gone g order by g.id;
  return old;
end;
$$;

revoke execute on function public.spill_box() from public, anon, authenticated;

drop trigger if exists blocks_spill_box on public.blocks;
create trigger blocks_spill_box after delete on public.blocks
for each row execute function public.spill_box();

-- ───────── S3. 천장 자리 ─────────

alter table public.blocks drop constraint if exists blocks_z_check;
alter table public.blocks add constraint blocks_z_check check ((z between 0 and 4) or z = 9);

-- 20261117000000_adventure.sql의 "players place blocks"에서 천장 자리(z 9)는 아래 블록 없이 놓는다는 조건만 더했다.
drop policy if exists "players place blocks" on public.blocks;
create policy "players place blocks" on public.blocks for insert to authenticated
with check (
  placed_by = auth.uid()
  and (
    z = 0
    or z = 9
    or exists (
      select 1 from public.blocks as below
      where below.map = blocks.map and below.x = blocks.x and below.y = blocks.y and below.z = blocks.z - 1
    )
  )
  and (
    map <> 'farm'
    or (
      exists (select 1 from public.farm_plots as f where f.x = blocks.x and f.y = blocks.y and f.owner = auth.uid())
      and not public.farm_is_gate(blocks.x, blocks.y)
    )
  )
  and left(map, 4) <> 'adv_'
);
