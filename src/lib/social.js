import { supabase } from "./supabase.js";

// ─── SOCIAL HELPERS ───────────────────────────────────────────────────────────

export const listLikeKey = (ownerId, listId) => `${ownerId}:${listId}`;

export async function fetchListLikes(ownerId, listIds) {
  // Table dédiée "list_likes" (voir instructions SQL) : sépare les likes du profil du propriétaire,
  // ce qui évite d'avoir à écrire dans la ligne Supabase d'un autre utilisateur.
  if (!ownerId || !listIds || listIds.length === 0) return { counts: {}, rows: [] };
  const { data, error } = await supabase.from("list_likes").select("list_id, user_id").eq("owner_id", ownerId).in("list_id", listIds.map(String));
  if (error) { console.warn("fetchListLikes:", error.message); return { counts: {}, rows: [] }; }
  const counts = {};
  listIds.forEach(id => { counts[listLikeKey(ownerId, id)] = 0; });
  (data || []).forEach(r => { const k = listLikeKey(ownerId, r.list_id); counts[k] = (counts[k] || 0) + 1; });
  return { counts, rows: data || [] };
}

export async function fetchFollows(userId) {
  const [{ data: following }, { data: followers }] = await Promise.all([
    supabase.from("follows").select("following_id").eq("follower_id", userId),
    supabase.from("follows").select("follower_id").eq("following_id", userId),
  ]);
  return {
    followingIds: (following || []).map(r => r.following_id),
    followerIds:  (followers || []).map(r => r.follower_id),
  };
}

export async function searchUsers(query) {
  // Recherche faite côté Supabase (nom ou pseudo), sans limite au nombre d'inscrits.
  // On retire les caractères qui ont un sens dans la syntaxe de filtre.
  const q = query.replace(/[,()*%\\"']/g, " ").trim();
  if (!q) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, user:data->user, library:data->library")
    .or(`data->user->>name.ilike.*${q}*,data->user->>pseudo.ilike.*${q}*`)
    .limit(30);
  if (error) { console.warn("searchUsers:", error.message); return []; }
  return (data || []).map(row => {
    const u = row.user || {};
    return {
      id: row.id,
      name: u.name || "Utilisateur",
      pseudo: u.pseudo || u.name || "user",
      avatar: u.avatar || null,
      library: row.library || [],
    };
  });
}

export async function fetchUserProfile(userId) {
  const { data } = await supabase
    .from("profiles").select("id, data, updated_at").eq("id", userId).single();
  if (!data) return null;
  const u = data.data?.user || {};
  return {
    id: data.id,
    name: u.name || "Utilisateur",
    pseudo: u.pseudo || u.name || "user",
    avatar: u.avatar || null,
    bio: u.bio || "",
    favGenres: u.favGenres || [],
    pinnedBadgeIds: data.data?.pinnedBadgeIds || [],
    unlockedBadgeIds: data.data?.unlockedBadgeIds || [],
    library: data.data?.library || [],
    activityLog: data.data?.activityLog || [],
    watchedEpisodes: data.data?.watchedEpisodes || {},
    favShows: u.favShows || data.data?.favShows || [],
    lists: data.data?.lists || [],
  };
}
