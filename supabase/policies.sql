-- ════════════════════════════════════════════════════════════════════════════
-- Règles d'accès (Row Level Security) pour SeriesBoxd
-- À exécuter dans Supabase → SQL Editor. Le script peut être relancé sans risque.
--
-- Principe : tout le monde peut LIRE (nécessaire pour les profils publics,
-- les critiques, les abonnés et les likes), mais chacun ne peut ÉCRIRE
-- que ses propres lignes.
-- ════════════════════════════════════════════════════════════════════════════

-- ── ÉTAPE 0 (à faire AVANT) : regarder les règles déjà en place ─────────────
-- Les règles Supabase s'additionnent : si une ancienne règle autorise déjà
-- "tout le monde peut modifier", celles de ce fichier ne servent à rien.
-- Lance cette requête et supprime (drop policy) toute règle trop permissive
-- qui n'est pas créée par ce fichier.
--
--   select tablename, policyname, cmd, roles, qual, with_check
--   from pg_policies
--   where schemaname = 'public' and tablename in ('profiles', 'follows', 'list_likes');


-- ── profiles : une ligne par utilisateur (id = id du compte) ────────────────
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_all"  on public.profiles;
drop policy if exists "profiles_insert_own"  on public.profiles;
drop policy if exists "profiles_update_own"  on public.profiles;

create policy "profiles_select_all" on public.profiles
  for select using (true);

create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check (auth.uid()::text = id::text);

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (auth.uid()::text = id::text)
  with check (auth.uid()::text = id::text);
-- Pas de règle DELETE : personne ne peut supprimer un profil depuis l'app.


-- ── follows : je ne peux créer / supprimer que MES abonnements ──────────────
alter table public.follows enable row level security;

drop policy if exists "follows_select_all"  on public.follows;
drop policy if exists "follows_insert_own"  on public.follows;
drop policy if exists "follows_delete_own"  on public.follows;

create policy "follows_select_all" on public.follows
  for select using (true);

create policy "follows_insert_own" on public.follows
  for insert to authenticated
  with check (auth.uid()::text = follower_id::text);

create policy "follows_delete_own" on public.follows
  for delete to authenticated
  using (auth.uid()::text = follower_id::text);


-- ── list_likes : je ne peux ajouter / retirer que MES likes ─────────────────
alter table public.list_likes enable row level security;

drop policy if exists "list_likes_select_all"  on public.list_likes;
drop policy if exists "list_likes_insert_own"  on public.list_likes;
drop policy if exists "list_likes_delete_own"  on public.list_likes;

create policy "list_likes_select_all" on public.list_likes
  for select using (true);

create policy "list_likes_insert_own" on public.list_likes
  for insert to authenticated
  with check (auth.uid()::text = user_id::text);

create policy "list_likes_delete_own" on public.list_likes
  for delete to authenticated
  using (auth.uid()::text = user_id::text);


-- ── Ancienne table user_data (utilisée par l'ancien proxy, plus par l'app) ──
-- Si elle existe encore, la verrouiller : RLS activé sans aucune règle = aucun accès.
-- (Ou la supprimer après avoir vérifié qu'elle ne contient rien d'utile.)
-- alter table public.user_data enable row level security;
