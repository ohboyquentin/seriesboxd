-- ════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 3 : réduire profiles.data à la « vitrine » publique
-- ⚠️ À exécuter UNIQUEMENT quand la version de l'app qui lit private_profiles est en ligne
--    (sinon l'ancienne version chargerait une vitrine incomplète et l'enregistrerait).
-- Relançable : les profils déjà réduits (_public = true) ne sont pas retouchés.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Si un compte a été modifié via l'ancienne version après la copie, on rafraîchit son coffre
update public.private_profiles pp
set data = p.data, updated_at = p.updated_at
from public.profiles p
where pp.id = p.id::uuid
  and coalesce((p.data->>'_public')::boolean, false) = false
  and p.updated_at > pp.updated_at;

-- 2. Réduction à la vitrine (même contenu que toPublicProfile() dans src/lib/publicProfile.js)
update public.profiles p
set data = jsonb_build_object(
      'user', coalesce((
        select jsonb_object_agg(e.key, e.value)
        from jsonb_each(coalesce(p.data->'user', '{}'::jsonb)) e
        where e.key in ('name', 'pseudo', 'avatar', 'bio', 'favGenres', 'favShows')
      ), '{}'::jsonb),
      'library',          coalesce(p.data->'library', '[]'::jsonb),
      'lists',            coalesce(p.data->'lists', '[]'::jsonb),
      'pinnedBadgeIds',   coalesce(p.data->'pinnedBadgeIds', '[]'::jsonb),
      'unlockedBadgeIds', coalesce(p.data->'unlockedBadgeIds', '[]'::jsonb),
      'activityLog', coalesce((
        select jsonb_agg(a.value order by a.ord)
        from jsonb_array_elements(coalesce(p.data->'activityLog', '[]'::jsonb)) with ordinality a(value, ord)
        where a.ord <= 30
      ), '[]'::jsonb),
      'episodesCount', (
        select count(*)
        from jsonb_each(coalesce(p.data->'watchedEpisodes', '{}'::jsonb)) s
        cross join lateral jsonb_each(case when jsonb_typeof(s.value) = 'object' then s.value else '{}'::jsonb end) e
        where e.value = 'true'::jsonb
      ),
      '_public', true
    ),
    updated_at = now()
where coalesce((p.data->>'_public')::boolean, false) = false
  and exists (select 1 from public.private_profiles pp where pp.id = p.id::uuid);

-- Vérification : taille de chaque vitrine
select data->'user'->>'name' as nom,
       pg_size_pretty(pg_column_size(data)::bigint) as taille,
       data ? 'watchedEpisodes' as contient_episodes
from public.profiles;
