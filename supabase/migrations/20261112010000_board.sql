-- 시작마을 아무말 게시판(2026-11-12 사용자 요청 "마을 중앙에 게시판, 누구나 글을 쓸 수 있도록").
-- 맨 위 공지(업데이트 내역)는 DB가 아니라 src/updates.ts에 있고 배포와 함께 바뀐다. 여기는 플레이어 글만 둔다.
-- 표는 클라이언트가 직접 읽거나 쓰지 못하고, 아래 함수 셋으로만 쓴다(닉네임, 글 길이, 쓰는 간격을 서버가 본다).
-- 다시 실행해도 되게 했다.

create table if not exists public.board_posts (
  id bigint generated always as identity primary key,
  author uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);

create index if not exists board_posts_created_at on public.board_posts (created_at desc);
create index if not exists board_posts_author on public.board_posts (author, created_at desc);

-- 행 보안을 켜고 정책을 두지 않아 클라이언트는 표에 직접 손댈 수 없다.
alter table public.board_posts enable row level security;
revoke all on public.board_posts from anon, authenticated;

-- 글을 쓴다. 앞뒤 공백을 지우고 1~300자, 같은 사람은 10초에 한 번. 새 글 번호를 돌려준다.
-- 길이와 간격을 바꾸면 src/ui/board.ts의 POST_MAX, 안내 문구도 함께 바꾼다.
create or replace function public.write_post(body text) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  text_ text := btrim(body);
  new_id bigint;
begin
  if text_ is null or char_length(text_) < 1 or char_length(text_) > 300 then
    raise exception 'bad length';
  end if;
  if exists (
    select 1 from public.board_posts
    where author = auth.uid() and created_at > now() - interval '10 seconds'
  ) then
    raise exception 'too fast';
  end if;

  insert into public.board_posts (author, body) values (auth.uid(), text_) returning id into new_id;
  return new_id;
end;
$$;

-- 최근 글을 how_many개(최대 100) 새 글부터 읽는다. mine은 내가 쓴 글이라 지울 수 있다는 뜻이다.
create or replace function public.read_board(how_many integer)
returns table (id bigint, nickname text, body text, created_at timestamptz, mine boolean)
language sql stable security definer set search_path = ''
as $$
  select b.id, p.nickname, b.body, b.created_at, b.author = auth.uid()
  from public.board_posts as b
  join public.profiles as p on p.id = b.author
  order by b.created_at desc, b.id desc
  limit least(greatest(how_many, 1), 100);
$$;

-- 내가 쓴 글만 지운다. 지웠으면 true.
create or replace function public.delete_post(post_id bigint) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.board_posts where id = post_id and author = auth.uid();
  return found;
end;
$$;

revoke execute on function public.write_post(text) from public, anon;
revoke execute on function public.read_board(integer) from public, anon;
revoke execute on function public.delete_post(bigint) from public, anon;
grant execute on function public.write_post(text) to authenticated;
grant execute on function public.read_board(integer) to authenticated;
grant execute on function public.delete_post(bigint) to authenticated;

notify pgrst, 'reload schema';
