// Droits RGPD : export des données et suppression du compte
import { supabase } from "./supabase.js";
import { clearLocalData, resumeSyncFor, stopSyncFor } from "./storage.js";

// Rassemble tout ce qui concerne le compte connecté
export async function exportMyData(userId) {
  const q = async (promise) => {
    const { data, error } = await promise;
    if (error) throw error;
    return data;
  };
  const [{ data: { user } }, priv, reviews, myComments, myReviewLikes, following, followers, listLikesGiven, listLikesReceived] = await Promise.all([
    supabase.auth.getUser(),
    q(supabase.from("private_profiles").select("data, updated_at").eq("id", userId).maybeSingle()),
    q(supabase.from("reviews").select("id, tmdb_id, rating, text, created_at, review_likes(user_id, created_at), review_comments(user_id, text, created_at)").eq("user_id", userId)),
    q(supabase.from("review_comments").select("review_id, text, created_at").eq("user_id", userId)),
    q(supabase.from("review_likes").select("review_id, created_at").eq("user_id", userId)),
    q(supabase.from("follows").select("following_id, created_at").eq("follower_id", userId)),
    q(supabase.from("follows").select("follower_id, created_at").eq("following_id", userId)),
    q(supabase.from("list_likes").select("owner_id, list_id, created_at").eq("user_id", userId)),
    q(supabase.from("list_likes").select("user_id, list_id, created_at").eq("owner_id", userId)),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    account: { id: userId, email: user?.email || null, createdAt: user?.created_at || null },
    profile: priv?.data || {},
    reviews,
    commentsWritten: myComments,
    reviewLikesGiven: myReviewLikes,
    following,
    followers,
    listLikesGiven,
    listLikesReceived,
  };
}

// Propose le fichier JSON au téléchargement
export function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Supprime définitivement le compte connecté (voir supabase/delete_account.sql)
export async function deleteMyAccount(userId) {
  stopSyncFor(userId);                       // plus aucune sauvegarde pour ce compte
  const { error } = await supabase.rpc("delete_my_account");
  if (error) {
    resumeSyncFor(userId);                   // échec : le compte existe toujours, on reprend les sauvegardes
    throw error;
  }
  clearLocalData(userId);                    // copie sur l'appareil
  await supabase.auth.signOut();             // session locale
}
