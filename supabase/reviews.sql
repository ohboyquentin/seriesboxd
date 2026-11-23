-- ════════════════════════════════════════════════════════════════════════════
-- Critiques en tables : reviews, review_likes, review_comments
-- À exécuter dans Supabase → SQL Editor. Le script peut être relancé sans risque
-- (tables créées si absentes, règles recréées, migration sans doublons).
-- ════════════════════════════════════════════════════════════════════════════

-- ── Tables ──────────────────────────────────────────────────────────────────
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tmdb_id     integer not null,
  rating      numeric(2,1) check (rating is null or (rating >= 0 and rating <= 5)),
  text        text not null check (char_length(text) between 1 and 5000),
  created_at  timestamptz not null default now(),
  legacy_id   text unique  -- identifiant de l'ancienne critique (migration), null pour les nouvelles
);
create index if not exists reviews_tmdb_id_idx on public.reviews (tmdb_id);
create index if not exists reviews_user_id_idx on public.reviews (user_id);

create table if not exists public.review_likes (
  review_id   uuid not null references public.reviews(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (review_id, user_id)
);

create table if not exists public.review_comments (
  id          uuid primary key default gen_random_uuid(),
  review_id   uuid not null references public.reviews(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text        text not null check (char_length(text) between 1 and 2000),
  created_at  timestamptz not null default now(),
  legacy_id   text unique
);
create index if not exists review_comments_review_id_idx on public.review_comments (review_id);


-- ── Règles d'accès : tout le monde lit, chacun n'écrit que ses propres lignes ─
alter table public.reviews         enable row level security;
alter table public.review_likes    enable row level security;
alter table public.review_comments enable row level security;

drop policy if exists "reviews_select_all"  on public.reviews;
drop policy if exists "reviews_insert_own"  on public.reviews;
drop policy if exists "reviews_update_own"  on public.reviews;
drop policy if exists "reviews_delete_own"  on public.reviews;
create policy "reviews_select_all" on public.reviews for select using (true);
create policy "reviews_insert_own" on public.reviews for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "reviews_update_own" on public.reviews for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "reviews_delete_own" on public.reviews for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "review_likes_select_all" on public.review_likes;
drop policy if exists "review_likes_insert_own" on public.review_likes;
drop policy if exists "review_likes_delete_own" on public.review_likes;
create policy "review_likes_select_all" on public.review_likes for select using (true);
create policy "review_likes_insert_own" on public.review_likes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "review_likes_delete_own" on public.review_likes for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "review_comments_select_all" on public.review_comments;
drop policy if exists "review_comments_insert_own" on public.review_comments;
drop policy if exists "review_comments_delete_own" on public.review_comments;
create policy "review_comments_select_all" on public.review_comments for select using (true);
create policy "review_comments_insert_own" on public.review_comments for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "review_comments_delete_own" on public.review_comments for delete to authenticated using ((select auth.uid()) = user_id);


-- ── Migration des anciennes critiques (profiles.data.extraReviews) ──────────
-- Ancien format : { "<tmdbId>": [ { id, text, rating, liked, comments: [ { id, text, ts } ] } ] }
-- Les anciens likes/commentaires ne pouvaient venir que de l'auteur lui-même.
insert into public.reviews (user_id, tmdb_id, rating, text, created_at, legacy_id)
select p.id::uuid,
       s.key::integer,
       nullif((r.value->>'rating')::numeric, 0),
       r.value->>'text',
       coalesce(to_timestamp(((r.value->>'id')::bigint) / 1000.0), now()),
       p.id::text || ':' || (r.value->>'id')
from public.profiles p
cross join lateral jsonb_each(coalesce(p.data->'extraReviews', '{}'::jsonb)) s
cross join lateral jsonb_array_elements(case when jsonb_typeof(s.value) = 'array' then s.value else '[]'::jsonb end) r
where coalesce(r.value->>'text', '') <> ''
  and s.key ~ '^[0-9]+$'
  and exists (select 1 from auth.users u where u.id = p.id::uuid)
on conflict (legacy_id) do nothing;

insert into public.review_likes (review_id, user_id)
select rv.id, rv.user_id
from public.profiles p
cross join lateral jsonb_each(coalesce(p.data->'extraReviews', '{}'::jsonb)) s
cross join lateral jsonb_array_elements(case when jsonb_typeof(s.value) = 'array' then s.value else '[]'::jsonb end) r
join public.reviews rv on rv.legacy_id = p.id::text || ':' || (r.value->>'id')
where (r.value->>'liked')::boolean is true
on conflict do nothing;

insert into public.review_comments (review_id, user_id, text, created_at, legacy_id)
select rv.id, rv.user_id, c.value->>'text',
       coalesce((c.value->>'ts')::timestamptz, now()),
       rv.legacy_id || ':' || coalesce(c.value->>'id', c.ordinality::text)
from public.profiles p
cross join lateral jsonb_each(coalesce(p.data->'extraReviews', '{}'::jsonb)) s
cross join lateral jsonb_array_elements(case when jsonb_typeof(s.value) = 'array' then s.value else '[]'::jsonb end) r
join public.reviews rv on rv.legacy_id = p.id::text || ':' || (r.value->>'id')
cross join lateral jsonb_array_elements(coalesce(r.value->'comments', '[]'::jsonb)) with ordinality c
where coalesce(c.value->>'text', '') <> ''
on conflict (legacy_id) do nothing;

-- Vérification
select (select count(*) from public.reviews) as critiques,
       (select count(*) from public.review_likes) as likes,
       (select count(*) from public.review_comments) as commentaires;
