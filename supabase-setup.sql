-- =====================================================================
-- 뉴영덕연합회 홈페이지 관리자 기능 설정 (한 번만 실행)
-- Supabase 대시보드 > SQL Editor > New query 에 전체를 붙여넣고 Run 을 누르세요.
-- 여러 번 실행해도 안전합니다 (이미 있는 것은 건너뜁니다).
-- =====================================================================

-- 1) 관리자 목록 ------------------------------------------------------------
create table if not exists public.site_admins (
  email text primary key
);
-- 현재 Supabase에 등록된 로그인 계정(공지사항 관리자)을 관리자로 등록
insert into public.site_admins(email)
  select lower(email) from auth.users where email is not null
  on conflict do nothing;

create or replace function public.is_site_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.site_admins
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- 2) 메인 화면 문구·사진 -----------------------------------------------------
create table if not exists public.site_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

-- 3) 행사 사진첩 -------------------------------------------------------------
create table if not exists public.albums (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_date date,
  description text,
  cover_url text,
  created_at timestamptz not null default now()
);
create table if not exists public.album_photos (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums(id) on delete cascade,
  url text not null,
  caption text,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists album_photos_album_idx on public.album_photos(album_id, sort);

-- 4) 게시판 (활동소식·언론보도·자료실 등) --------------------------------------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  board text not null,
  title text not null,
  body text,
  images jsonb not null default '[]'::jsonb,
  link_url text,
  file_url text,
  file_name text,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists posts_board_idx on public.posts(board, created_at desc);

-- 5) 조직도 ------------------------------------------------------------------
create table if not exists public.org_units (
  id uuid primary key default gen_random_uuid(),
  section text not null,          -- leader(회장단) / branch(지회) / committee(위원회)
  tier integer not null default 0, -- 회장단 줄 번호 (같은 번호는 한 줄에 표시)
  title text not null,             -- 직책 또는 지회·위원회 이름
  leader text,                     -- 지회장·위원장 이름
  members text,                    -- 회원 이름 (쉼표로 구분)
  featured boolean not null default false,
  wide boolean not null default false,
  sort integer not null default 0
);

-- 6) 회원 명단 (회원검색) ------------------------------------------------------
create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  "group" text,
  business text,
  sort integer not null default 0
);

-- 7) 보안 규칙: 누구나 보기 가능, 관리자만 수정 ------------------------------------
do $$
declare t text;
begin
  foreach t in array array['site_settings','albums','album_photos','posts','org_units','members'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('create policy "public read" on public.%I for select using (true)', t);
    execute format('drop policy if exists "admin write" on public.%I', t);
    execute format('create policy "admin write" on public.%I for all to authenticated using (public.is_site_admin()) with check (public.is_site_admin())', t);
  end loop;
end $$;
alter table public.site_admins enable row level security;

-- 8) 사진 저장소 --------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('site-media', 'site-media', true)
  on conflict (id) do update set public = true;

drop policy if exists "site-media public read" on storage.objects;
create policy "site-media public read" on storage.objects
  for select using (bucket_id = 'site-media');
drop policy if exists "site-media admin insert" on storage.objects;
create policy "site-media admin insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'site-media' and public.is_site_admin());
drop policy if exists "site-media admin update" on storage.objects;
create policy "site-media admin update" on storage.objects
  for update to authenticated using (bucket_id = 'site-media' and public.is_site_admin());
drop policy if exists "site-media admin delete" on storage.objects;
create policy "site-media admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'site-media' and public.is_site_admin());

-- 9) 현재 홈페이지의 조직도·회원 명단을 그대로 옮겨 넣기 (처음 한 번만) --------------
insert into public.org_units (section, tier, title, leader, members, featured, wide, sort)
select * from (values
  ('leader', 1, '회장', '', '서병환', true, false, 1),
  ('leader', 2, '감사', '', '이화동 · 김여규 · 신재민', false, false, 2),
  ('leader', 3, '수석부회장', '', '박승욱', false, false, 3),
  ('leader', 3, '총괄부회장', '', '전병만', false, false, 4),
  ('leader', 3, '실무부회장', '', '박윤식', false, false, 5),
  ('leader', 4, '사무국', '', '국장 권순용 · 차장 조주현 · 강유호 · 경민호 · 간사 이정호', false, true, 6),
  ('branch', 0, '영덕읍지회', '지회장 윤상필', '김도준, 김태완, 김형대, 민경환, 백민규, 신규철, 신재익, 유성준, 이동균, 이창희, 최대윤', false, false, 7),
  ('branch', 0, '강구면지회', '지회장 김주홍', '하일규, 김철수, 최재혁, 박민수, 이원준, 전성욱, 임구곤, 김동진, 김형만', false, false, 8),
  ('branch', 0, '남정면지회', '지회장 유원일', '이상태, 박주영, 김창동, 김태윤, 권영욱, 천민수, 이성민, 김유성, 박해찬', false, false, 9),
  ('branch', 0, '지품·달산면지회', '지회장 박임식', '', false, false, 10),
  ('branch', 0, '축산면지회', '지회장 김수용', '박상욱, 이동길, 장상철', false, false, 11),
  ('branch', 0, '영해면지회', '지회장 강인구', '유상준, 최동훈, 한성철, 홍태진, 황창현', false, false, 12),
  ('branch', 0, '창수면지회', '지회장 이길호', '김민규, 박동규', false, false, 13),
  ('branch', 0, '병곡면지회', '지회장 강신기', '김구준, 김종대', false, false, 14),
  ('committee', 0, '조직위원장', '고재광', '고민성, 김동언, 김태환, 이진근, 황정모, 황정인', false, false, 15),
  ('committee', 0, '미디어위원장', '윤태원', '류현준, 윤덕규, 윤기원, 이지훈, 정영창', false, false, 16),
  ('committee', 0, '대외협력위원장', '정성조', '권순석, 김도수, 류기백, 신정우, 이상화', false, false, 17),
  ('committee', 0, '정책위원장', '김철규', '권정훈, 김태한, 이강우, 장민우, 정은호', false, false, 18),
  ('committee', 0, '지역개발위원장', '박춘현', '김상범, 남경훈, 이중호, 이충호, 최태욱', false, false, 19),
  ('committee', 0, '원전위원장', '신승민', '권병수, 권용성, 문종대, 신병문, 신승기, 신철호, 오영환, 정상현', false, false, 20),
  ('committee', 0, '홍보위원장', '장진성', '박소연, 유영진, 장일성, 이세형, 김대용, 박일석, 이준근, 경관두, 류광태, 우신동, 한승엽, 정재학', false, false, 21),
  ('committee', 0, '체육봉사위원장', '김종훈', '', false, false, 22),
  ('committee', 0, '직능위원장', '주찬혁', '김일광, 김희태, 정태영, 한해규', false, false, 23),
  ('committee', 0, '차세대위원장(남부)', '정보빈', '공영웅, 김강함, 김경민, 김병서, 남지웅, 박수현, 박시형, 신호업, 윤용수, 이동화, 임성엽, 장지호, 주재홍, 최진혁, 최하늘, 하기철, 황남진', false, false, 24),
  ('committee', 0, '차세대위원장(북부)', '김준일', '권대홍, 김영석, 정현석', false, false, 25),
  ('committee', 0, '여성위원장', '강정임', '신유정, 고영임, 권미옥, 김미경, 김은숙, 김현주, 박종숙, 백은희, 손미정, 이미자, 이영희, 임수정, 정애연, 최미경', false, false, 26)
) as v(section, tier, title, leader, members, featured, wide, sort)
where not exists (select 1 from public.org_units);

insert into public.members (name, role, "group", business, sort)
select * from (values
  ('서병환', '회장', '임원단', '', 1),
  ('이화동', '감사', '임원단', '', 2),
  ('김여규', '감사', '임원단', '', 3),
  ('신재민', '감사', '임원단', '', 4),
  ('박승욱', '수석부회장', '임원단', '', 5),
  ('전병만', '총괄부회장', '임원단', '', 6),
  ('박윤식', '실무부회장', '임원단', '', 7),
  ('권순용', '국장', '사무국', '', 8),
  ('이정호', '간사', '사무국', '', 9),
  ('조주현', '차장', '사무국', '', 10),
  ('강유호', '차장', '사무국', '', 11),
  ('경민호', '차장', '사무국', '', 12),
  ('윤상필', '지회장', '영덕읍지회', '', 13),
  ('김도준', '회원', '영덕읍지회', '', 14),
  ('김태완', '회원', '영덕읍지회', '', 15),
  ('김형대', '회원', '영덕읍지회', '', 16),
  ('민경환', '회원', '영덕읍지회', '', 17),
  ('백민규', '회원', '영덕읍지회', '', 18),
  ('신규철', '회원', '영덕읍지회', '', 19),
  ('신재익', '회원', '영덕읍지회', '', 20),
  ('유성준', '회원', '영덕읍지회', '', 21),
  ('이동균', '회원', '영덕읍지회', '', 22),
  ('이창희', '회원', '영덕읍지회', '', 23),
  ('최대윤', '회원', '영덕읍지회', '', 24),
  ('김주홍', '지회장', '강구면지회', '', 25),
  ('하일규', '회원', '강구면지회', '', 26),
  ('김철수', '회원', '강구면지회', '', 27),
  ('최재혁', '회원', '강구면지회', '', 28),
  ('박민수', '회원', '강구면지회', '', 29),
  ('이원준', '회원', '강구면지회', '', 30),
  ('전성욱', '회원', '강구면지회', '', 31),
  ('임구곤', '회원', '강구면지회', '', 32),
  ('김동진', '회원', '강구면지회', '', 33),
  ('김형만', '회원', '강구면지회', '', 34),
  ('유원일', '지회장', '남정면지회', '', 35),
  ('이상태', '회원', '남정면지회', '', 36),
  ('박주영', '회원', '남정면지회', '', 37),
  ('김창동', '회원', '남정면지회', '', 38),
  ('김태윤', '회원', '남정면지회', '', 39),
  ('권영욱', '회원', '남정면지회', '', 40),
  ('천민수', '회원', '남정면지회', '', 41),
  ('이성민', '회원', '남정면지회', '', 42),
  ('김유성', '회원', '남정면지회', '', 43),
  ('박해찬', '회원', '남정면지회', '', 44),
  ('박임식', '지회장', '지품·달산면지회', '', 45),
  ('김수용', '지회장', '축산면지회', '', 46),
  ('박상욱', '회원', '축산면지회', '', 47),
  ('이동길', '회원', '축산면지회', '', 48),
  ('장상철', '회원', '축산면지회', '', 49),
  ('강인구', '지회장', '영해면지회', '', 50),
  ('유상준', '회원', '영해면지회', '', 51),
  ('최동훈', '회원', '영해면지회', '', 52),
  ('한성철', '회원', '영해면지회', '', 53),
  ('홍태진', '회원', '영해면지회', '', 54),
  ('황창현', '회원', '영해면지회', '', 55),
  ('이길호', '지회장', '창수면지회', '', 56),
  ('김민규', '회원', '창수면지회', '', 57),
  ('박동규', '회원', '창수면지회', '', 58),
  ('강신기', '지회장', '병곡면지회', '', 59),
  ('김구준', '회원', '병곡면지회', '', 60),
  ('김종대', '회원', '병곡면지회', '', 61),
  ('정보빈', '차세대위원장(남부)', '차세대위원회(남부)', '', 62),
  ('공영웅', '회원', '차세대위원회(남부)', '', 63),
  ('김강함', '회원', '차세대위원회(남부)', '', 64),
  ('김경민', '회원', '차세대위원회(남부)', '', 65),
  ('김병서', '회원', '차세대위원회(남부)', '', 66),
  ('남지웅', '회원', '차세대위원회(남부)', '', 67),
  ('박수현', '회원', '차세대위원회(남부)', '', 68),
  ('박시형', '회원', '차세대위원회(남부)', '', 69),
  ('신호업', '회원', '차세대위원회(남부)', '', 70),
  ('윤용수', '회원', '차세대위원회(남부)', '', 71),
  ('이동화', '회원', '차세대위원회(남부)', '', 72),
  ('임성엽', '회원', '차세대위원회(남부)', '', 73),
  ('장지호', '회원', '차세대위원회(남부)', '', 74),
  ('주재홍', '회원', '차세대위원회(남부)', '', 75),
  ('최진혁', '회원', '차세대위원회(남부)', '', 76),
  ('최하늘', '회원', '차세대위원회(남부)', '', 77),
  ('하기철', '회원', '차세대위원회(남부)', '', 78),
  ('황남진', '회원', '차세대위원회(남부)', '', 79),
  ('고재광', '조직위원장', '조직위원회', '', 80),
  ('고민성', '회원', '조직위원회', '', 81),
  ('김동언', '회원', '조직위원회', '', 82),
  ('김태환', '회원', '조직위원회', '', 83),
  ('이진근', '회원', '조직위원회', '', 84),
  ('황정모', '회원', '조직위원회', '', 85),
  ('황정인', '회원', '조직위원회', '', 86),
  ('정성조', '대외협력위원장', '대외협력위원회', '', 87),
  ('권순석', '회원', '대외협력위원회', '', 88),
  ('김도수', '회원', '대외협력위원회', '', 89),
  ('류기백', '회원', '대외협력위원회', '', 90),
  ('신정우', '회원', '대외협력위원회', '', 91),
  ('이상화', '회원', '대외협력위원회', '', 92),
  ('김철규', '정책위원장', '정책위원회', '', 93),
  ('권정훈', '회원', '정책위원회', '', 94),
  ('김태한', '회원', '정책위원회', '', 95),
  ('이강우', '회원', '정책위원회', '', 96),
  ('장민우', '회원', '정책위원회', '', 97),
  ('정은호', '회원', '정책위원회', '', 98),
  ('박춘현', '지역개발위원장', '지역개발위원회', '', 99),
  ('김상범', '회원', '지역개발위원회', '', 100),
  ('남경훈', '회원', '지역개발위원회', '', 101),
  ('이중호', '회원', '지역개발위원회', '', 102),
  ('이충호', '회원', '지역개발위원회', '', 103),
  ('최태욱', '회원', '지역개발위원회', '', 104),
  ('신승민', '원전위원장', '원전위원회', '', 105),
  ('권병수', '회원', '원전위원회', '', 106),
  ('권용성', '회원', '원전위원회', '', 107),
  ('문종대', '회원', '원전위원회', '', 108),
  ('신병문', '회원', '원전위원회', '', 109),
  ('신승기', '회원', '원전위원회', '', 110),
  ('신철호', '회원', '원전위원회', '', 111),
  ('오영환', '회원', '원전위원회', '', 112),
  ('정상현', '회원', '원전위원회', '', 113),
  ('장진성', '홍보위원장', '홍보위원회', '', 114),
  ('박소연', '회원', '홍보위원회', '', 115),
  ('유영진', '회원', '홍보위원회', '', 116),
  ('장일성', '회원', '홍보위원회', '', 117),
  ('이세형', '회원', '홍보위원회', '', 118),
  ('김대용', '회원', '홍보위원회', '', 119),
  ('박일석', '회원', '홍보위원회', '', 120),
  ('이준근', '회원', '홍보위원회', '', 121),
  ('경관두', '회원', '홍보위원회', '', 122),
  ('류광태', '회원', '홍보위원회', '', 123),
  ('우신동', '회원', '홍보위원회', '', 124),
  ('한승엽', '회원', '홍보위원회', '', 125),
  ('정재학', '회원', '홍보위원회', '', 126),
  ('김종훈', '체육봉사위원장', '체육봉사위원회', '', 127),
  ('주찬혁', '직능위원장', '직능위원회', '', 128),
  ('김일광', '회원', '직능위원회', '', 129),
  ('김희태', '회원', '직능위원회', '', 130),
  ('정태영', '회원', '직능위원회', '', 131),
  ('한해규', '회원', '직능위원회', '', 132),
  ('윤태원', '미디어위원장', '미디어위원회', '', 133),
  ('류현준', '회원', '미디어위원회', '', 134),
  ('윤덕규', '회원', '미디어위원회', '', 135),
  ('윤기원', '회원', '미디어위원회', '', 136),
  ('이지훈', '회원', '미디어위원회', '', 137),
  ('정영창', '회원', '미디어위원회', '', 138),
  ('김준일', '차세대위원장(북부)', '차세대위원회(북부)', '', 139),
  ('권대홍', '회원', '차세대위원회(북부)', '', 140),
  ('김영석', '회원', '차세대위원회(북부)', '', 141),
  ('정현석', '회원', '차세대위원회(북부)', '', 142),
  ('신유정', '여성위원장', '여성위원회', '', 143),
  ('강정임', '회원', '여성위원회', '', 144),
  ('고영임', '회원', '여성위원회', '', 145),
  ('권미옥', '회원', '여성위원회', '', 146),
  ('김미경', '회원', '여성위원회', '', 147),
  ('김은숙', '회원', '여성위원회', '', 148),
  ('김현주', '회원', '여성위원회', '', 149),
  ('박종숙', '회원', '여성위원회', '', 150),
  ('백은희', '회원', '여성위원회', '', 151),
  ('손미정', '회원', '여성위원회', '', 152),
  ('이미자', '회원', '여성위원회', '', 153),
  ('이영희', '회원', '여성위원회', '', 154),
  ('임수정', '회원', '여성위원회', '', 155),
  ('정애연', '회원', '여성위원회', '', 156),
  ('최미경', '회원', '여성위원회', '', 157)
) as v(name, role, "group", business, sort)
where not exists (select 1 from public.members);

-- 완료! 'Success. No rows returned' 가 보이면 정상입니다.
