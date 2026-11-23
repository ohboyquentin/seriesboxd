// « Vitrine » publique d'un compte : ce que les autres utilisateurs peuvent lire dans profiles.data.
// Les données complètes sont dans la table privée private_profiles (lisible par le seul propriétaire).
// ⚠️ Garder en phase avec supabase/profiles_vitrine.sql (même contenu).

// Phase A (false) : on écrit encore le profil complet dans profiles.data, pour que l'ancienne
// version de l'app (qui lit profiles.data) continue de fonctionner pendant la mise en ligne.
// Phase B (true) : une fois cette version en ligne, profiles.data ne contient plus que la vitrine.
export const PUBLIC_VITRINE_ENABLED = false;

const PUBLIC_USER_FIELDS = ["name", "pseudo", "avatar", "bio", "favGenres", "favShows"];
const PUBLIC_ACTIVITY_LIMIT = 30;

export function countWatchedEpisodes(watchedEpisodes = {}) {
  return Object.values(watchedEpisodes || {})
    .reduce((acc, eps) => acc + Object.values(eps || {}).filter(v => v === true).length, 0);
}

export function toPublicProfile(data) {
  const u = data.user || {};
  const user = {};
  PUBLIC_USER_FIELDS.forEach(k => { if (u[k] !== undefined) user[k] = u[k]; });
  return {
    user,
    library: data.library || [],            // séries vues, notes et watchlist (publiques)
    lists: data.lists || [],
    pinnedBadgeIds: data.pinnedBadgeIds || [],
    unlockedBadgeIds: data.unlockedBadgeIds || [],
    activityLog: (data.activityLog || []).slice(0, PUBLIC_ACTIVITY_LIMIT),
    episodesCount: countWatchedEpisodes(data.watchedEpisodes),
    _public: true,
  };
}

// Ce qui est écrit dans profiles.data selon la phase
export function publicDataFor(data) {
  return PUBLIC_VITRINE_ENABLED ? toPublicProfile(data) : data;
}
