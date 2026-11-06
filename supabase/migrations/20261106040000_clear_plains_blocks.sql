-- 시작마을을 새로 꾸미면서 테스트로 깔아 둔 블록을 치운다. 다른 맵의 블록은 그대로 둔다.
delete from public.blocks where map = 'plains';
