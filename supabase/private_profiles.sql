-- ════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 1 : coffre privé « private_profiles »
-- Contient toutes les données d'un compte (comme profiles.data aujourd'hui).
-- Seul le propriétaire peut lire et écrire sa ligne.
-- Script sans risque et relançable : il ne supprime ni ne modifie rien dans profiles.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.private_profiles (
  id          uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.private_profiles enable row level security;

drop policy if exists "private_profiles_select_own" on public.private_profiles;
drop policy if exists "private_profiles_insert_own" on public.private_profiles;
drop policy if exists "private_profiles_update_own" on public.private_profiles;
create policy "private_profiles_select_own" on public.private_profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "private_profiles_insert_own" on public.private_profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "private_profiles_update_own" on public.private_profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Copie des données actuelles (profils complets) dans le coffre
insert into public.private_profiles (id, data, updated_at)
select p.id::uuid, p.data, coalesce(p.updated_at, now())
from public.profiles p
where p.data is not null
  and exists (select 1 from auth.users u where u.id = p.id::uuid)
on conflict (id) do nothing;

-- Vérification
select (select count(*) from public.profiles) as profils,
       (select count(*) from public.private_profiles) as coffres;
