// Critiques stockées dans les tables Supabase reviews / review_likes / review_comments
// (voir supabase/reviews.sql). Tout le monde peut lire ; chacun n'écrit que ses propres lignes.
import { supabase } from "./supabase.js";
import { initialOf } from "./format.js";

const REVIEW_SELECT =
  "id, user_id, tmdb_id, rating, text, created_at, review_likes(user_id), review_comments(id, user_id, text, created_at)";

const formatShortDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "";

// Nom et avatar des auteurs (critiques + commentaires), en une seule requête
async function fetchAuthors(userIds) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return {};
  const { data, error } = await supabase.from("profiles").select("id, user:data->user").in("id", ids);
  if (error) { console.warn("Auteurs des critiques :", error.message); return {}; }
  const map = {};
  (data || []).forEach(p => {
    const name = p.user?.name || "Utilisateur";
    map[p.id] = { name, initial: initialOf(name), avatarUrl: p.user?.avatar || null };
  });
  return map;
}

// Met une ligne de la base au format utilisé par les écrans
function toReview(row, authors, myId) {
  const a = authors[row.user_id] || { name: "Utilisateur", initial: "?", avatarUrl: null };
  const likes = row.review_likes || [];
  const comments = [...(row.review_comments || [])]
    .sort((x, y) => new Date(x.created_at) - new Date(y.created_at))
    .map(c => {
      const ca = authors[c.user_id] || { name: "Utilisateur", initial: "?", avatarUrl: null };
      return { id: c.id, userId: c.user_id, user: ca.name, avatar: ca.initial, avatarUrl: ca.avatarUrl, text: c.text, ts: c.created_at, isMine: c.user_id === myId };
    });
  return {
    id: row.id,
    tmdbId: row.tmdb_id,
    userId: row.user_id,
    isMine: row.user_id === myId,
    user: a.name,
    avatar: a.initial,
    avatarUrl: a.avatarUrl,
    rating: row.rating === null ? 0 : Number(row.rating),
    text: row.text,
    createdAt: row.created_at,
    date: formatShortDate(row.created_at),
    likes: likes.length,
    liked: !!myId && likes.some(l => l.user_id === myId),
    comments,
  };
}

async function toReviews(rows, myId) {
  const authorIds = rows.flatMap(r => [r.user_id, ...(r.review_comments || []).map(c => c.user_id)]);
  const authors = await fetchAuthors(authorIds);
  return rows.map(r => toReview(r, authors, myId));
}

// Toutes les critiques d'une série (de tout le monde)
export async function fetchSeriesReviews(tmdbId, myId) {
  const { data, error } = await supabase.from("reviews").select(REVIEW_SELECT)
    .eq("tmdb_id", tmdbId).order("created_at", { ascending: false });
  if (error) throw error;
  return toReviews(data || [], myId);
}

// Toutes les critiques écrites par un utilisateur
export async function fetchUserReviews(userId) {
  if (!userId) return [];
  const { data, error } = await supabase.from("reviews").select(REVIEW_SELECT)
    .eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw error;
  return toReviews(data || [], userId);
}

export async function createReview({ tmdbId, rating, text }) {
  const { data, error } = await supabase.from("reviews")
    .insert({ tmdb_id: tmdbId, rating: rating > 0 ? rating : null, text: text.trim() })
    .select("id").single();
  if (error) throw error;
  return data.id;
}

export async function deleteReview(reviewId) {
  const { error } = await supabase.from("reviews").delete().eq("id", reviewId);
  if (error) throw error;
}

export async function setReviewLike(reviewId, userId, like) {
  const { error } = like
    ? await supabase.from("review_likes").insert({ review_id: reviewId })
    : await supabase.from("review_likes").delete().eq("review_id", reviewId).eq("user_id", userId);
  if (error) throw error;
}

export async function addReviewComment(reviewId, text) {
  const { error } = await supabase.from("review_comments").insert({ review_id: reviewId, text: text.trim() });
  if (error) throw error;
}

export async function deleteReviewComment(commentId) {
  const { error } = await supabase.from("review_comments").delete().eq("id", commentId);
  if (error) throw error;
}

// Regroupe les critiques par série : { [tmdbId]: [critique, …] }
// (format attendu par les règles de badges et l'écran « Mes critiques »)
export function groupReviewsBySeries(reviews) {
  const out = {};
  reviews.forEach(r => { (out[r.tmdbId] = out[r.tmdbId] || []).push(r); });
  return out;
}
