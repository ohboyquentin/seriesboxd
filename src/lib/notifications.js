// Notifications dans l'app (table « notifications », remplie par la base : voir supabase/notifications.sql)
import { supabase } from "./supabase.js";
import { tmdbViaClaude } from "./tmdb.js";

const LIMIT = 50;

// Nombre de notifications non lues
export async function countUnread(userId) {
  if (!userId) return 0;
  const { count, error } = await supabase.from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId).is("read_at", null);
  if (error) throw error;
  return count || 0;
}

// Dernières notifications, avec le nom/avatar de l'auteur, le titre de la série et le commentaire
export async function fetchNotifications(userId, { library = [], lists = [] } = {}) {
  if (!userId) return [];
  const { data, error } = await supabase.from("notifications")
    .select("id, type, actor_id, review_id, list_id, tmdb_id, created_at, read_at, comment:review_comments(text)")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(LIMIT);
  if (error) throw error;
  const rows = data || [];

  // Auteurs
  const actorIds = [...new Set(rows.map(r => r.actor_id))];
  const actors = {};
  if (actorIds.length) {
    const { data: profiles } = await supabase.from("profiles").select("id, user:data->user").in("id", actorIds);
    (profiles || []).forEach(p => { actors[p.id] = { name: p.user?.name || "Quelqu'un", avatar: p.user?.avatar || null }; });
  }

  // Titres des séries : d'abord ma bibliothèque, sinon TMDB (réponses mises en cache)
  const titles = {};
  library.forEach(s => { titles[s.tmdbId] = s.title; });
  const missing = [...new Set(rows.map(r => r.tmdb_id).filter(id => id && !titles[id]))];
  await Promise.all(missing.map(async id => {
    try { titles[id] = (await tmdbViaClaude(`/tv/${id}`))?.name; } catch { /* titre inconnu */ }
  }));

  return rows.map(r => ({
    id: r.id,
    type: r.type,
    actorId: r.actor_id,
    actor: actors[r.actor_id] || { name: "Quelqu'un", avatar: null },
    reviewId: r.review_id,
    tmdbId: r.tmdb_id,
    seriesTitle: titles[r.tmdb_id] || "une série",
    listId: r.list_id,
    list: lists.find(l => String(l.id) === String(r.list_id)) || null,
    commentText: r.comment?.text || "",
    createdAt: r.created_at,
    unread: !r.read_at,
  }));
}

// Marque toutes mes notifications comme lues
export async function markAllRead(userId) {
  if (!userId) return;
  const { error } = await supabase.from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId).is("read_at", null);
  if (error) throw error;
}

// Phrase affichée après le nom de l'auteur
export function notificationText(n) {
  switch (n.type) {
    case "follow":         return "te suit maintenant";
    case "review_like":    return `a aimé ta critique de ${n.seriesTitle}`;
    case "review_comment": return `a commenté ta critique de ${n.seriesTitle}${n.commentText ? ` : « ${n.commentText} »` : ""}`;
    case "list_like":      return `a aimé ta liste « ${n.list?.name || "sans titre"} »`;
    default:               return "";
  }
}
