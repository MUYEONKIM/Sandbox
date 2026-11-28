-- profiles 권한 되돌리기(2026-11-28, 코드 묶음 7과 함께). 펫 SQL 운영 확인 때 PM이 찾음.
-- 운영 DB를 자체 운영 Supabase로 옮긴 뒤(2026-11-25) public.profiles의 권한이 기본값으로 돌아가 있었다.
--   운영: authenticated에 표 전체 권한(SELECT·INSERT·UPDATE·DELETE·TRUNCATE·REFERENCES·TRIGGER), anon에도 표 전체 권한.
--   'players update own profile' 정책(id = auth.uid())과 합쳐져 로그인한 사람이 REST로 자기 줄의 모든 칸(gold, level, 스텟, pet, title 등)을 고칠 수 있었다.
--   로컬과 처음 설계(20261105000000_multiplayer.sql, 20261105010000_maps.sql): anon 권한 없음, authenticated는 읽기와 x·y·inventory·map 네 칸 고치기만.
-- 하는 일: 처음 설계대로 되돌린다. 화면이 profiles에 직접 쓰는 것은 session.ts flush()의 위치·맵·인벤토리(ProfilePatch 네 칸)뿐이고,
--   나머지 칸(골드, 스텟, 펫, 칭호 등)은 모두 security definer 함수가 고친다. 화면이 profiles를 읽는 것(auth.ts loadProfile)은 로그인한 뒤뿐이다.
-- PM이 사용자에게 먼저 안내한 SQL(revoke update … from authenticated, grant update 네 칸, revoke all … from anon)보다 넓다:
--   authenticated의 INSERT·DELETE·TRUNCATE·REFERENCES·TRIGGER도 거둔다(지금은 RLS에 넣기·지우기 정책이 없고 REST로 TRUNCATE를 못 해서 열린 구멍은 아니다).
--   그 SQL을 먼저 실행했어도 이 파일을 실행하면 같은 끝 상태가 된다.
-- 다시 실행해도 된다(revoke·grant 세 문장. SQL Editor에서 한 번에 실행하면 한 트랜잭션으로 돈다). 표의 줄은 건드리지 않는다.
--
-- ⚠ 되돌리기 어려운 것: 없다. 줄을 바꾸지 않고 권한만 바꾼다.
--
-- 확인 쿼리(운영 DB에서 읽기만, 5칸 모두 true). 다섯 칸은 앞으로 SQL이 있는 배포마다 확인 쿼리에 붙인다(docs/agent/workflow.md 3절).
--   select
--     (select string_agg(attname, ',' order by attname) from pg_attribute where attrelid = 'public.profiles'::regclass and attnum > 0 and not attisdropped
--       and has_column_privilege('authenticated', attrelid, attnum, 'UPDATE')) = 'inventory,map,x,y' as profiles_update_cols,
--     (select string_agg(p, ',') from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
--       where has_table_privilege('authenticated', 'public.profiles', p)) = 'SELECT' as profiles_auth_select_only,
--     not has_table_privilege('anon', 'public.profiles', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as profiles_anon_none,
--     not exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f')
--       and (c.relkind not in ('r', 'p') or not c.relrowsecurity)
--       and (has_table_privilege('anon', c.oid, 'INSERT,UPDATE,DELETE') or has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE')
--         or exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
--           and (has_column_privilege('anon', c.oid, a.attnum, 'INSERT,UPDATE') or has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT,UPDATE'))))) as no_open_writes,
--     (select string_agg(distinct tablename || ':' || cmd, ',' order by tablename || ':' || cmd) from pg_policies
--       where schemaname = 'public' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')) = 'blocks:DELETE,blocks:INSERT,profiles:UPDATE' as same_write_policies;
--   칸 뜻: profiles_update_cols 화면이 고칠 수 있는 profiles 칸은 네 칸뿐, profiles_auth_select_only 그 밖의 표 권한은 읽기뿐,
--     profiles_anon_none 로그인 안 한 키는 profiles에 아무 권한 없음, no_open_writes RLS가 꺼진 표나 뷰에 화면 쓰기 권한 없음,
--     same_write_policies 화면 쓰기를 허락하는 정책은 지금 셋뿐(새로 더하면 이 값도 함께 고친다).

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (x, y, inventory, map) on public.profiles to authenticated;
