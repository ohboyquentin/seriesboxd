import { supabase } from "./supabase.js";
import { pruneTmdbCache } from "./tmdb.js";

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

const LS_KEY_BASE = "seriesboxd_data";
const getLsKey = (userId) => userId ? `${LS_KEY_BASE}_${userId}` : LS_KEY_BASE;

function loadLocalData(userId) {
  try { const r = localStorage.getItem(getLsKey(userId)); return r ? JSON.parse(r) : {}; }
  catch { return {}; }
}
function saveLocalData(data, userId) {
  const value = JSON.stringify(data);
  try { localStorage.setItem(getLsKey(userId), value); }
  catch {
    // Stockage plein : tes données passent avant le cache TMDB → on le vide et on réessaie
    pruneTmdbCache(0);
    try { localStorage.setItem(getLsKey(userId), value); }
    catch (e) { console.warn("localStorage plein :", e.message); }
  }
}

// Champs présents dans la copie locale (allégée). Les champs absents de cette liste
// (activityLog, watchedEpisodes, extraReviews…) n'existent QUE dans Supabase :
// la copie locale ne doit donc jamais remplacer les données Supabase en bloc.
const LOCAL_FIELDS = [
  "onboarded", "user", "library", "watchHistory", "lists", "tags",
  "pinnedBadgeIds", "unlockedBadgeIds", "rewatchCounts", "posterClicks", "watchlistPeak",
];

// Fusionne une copie locale plus récente (modifs pas encore envoyées) par-dessus
// les données complètes de Supabase, sans toucher aux champs « lourds ».
function mergeLocalIntoRemote(remote, local) {
  const merged = { ...remote };
  LOCAL_FIELDS.forEach(f => { if (f !== "library" && local[f] !== undefined) merged[f] = local[f]; });
  if (Array.isArray(local.library)) {
    // Les séries locales sont allégées : on garde les infos complètes de Supabase
    // et on applique par-dessus l'état local (vu, note, watchlist…).
    const remoteById = new Map((remote.library || []).map(s => [s.tmdbId, s]));
    merged.library = local.library.map(s => ({ ...(remoteById.get(s.tmdbId) || {}), ...s }));
  }
  return merged;
}

// Renvoie { data, remoteOk }.
// remoteOk = false → Supabase n'a pas pu être lu : l'app ne doit RIEN y écrire
// pendant cette session, sinon elle écraserait les données complètes avec la copie allégée.
export async function loadSavedData(userId) {
  const local = loadLocalData(userId);
  // Ancienne clé sans userId (migration des toutes premières versions)
  const legacyLocal = loadLocalData(null);
  const bestLocal = (legacyLocal.library?.length || 0) > (local.library?.length || 0) ? legacyLocal : local;
  if (!userId) return { data: local, remoteOk: false };

  let remote;
  try {
    const { data, error } = await supabase
      .from("profiles").select("data").eq("id", userId).maybeSingle();
    if (error) throw error;
    remote = data?.data || null;
  } catch (e) {
    console.warn("Supabase load — mode hors-ligne pour cette session :", e.message);
    return { data: bestLocal, remoteOk: false };
  }

  // Aucun profil en ligne (nouveau compte) → on part des données locales
  if (!remote) return { data: bestLocal, remoteOk: true };

  // Supabase est la référence. La copie locale ne gagne que si elle contient
  // des modifications plus récentes qui n'ont pas pu être envoyées.
  let result = remote;
  if (local._dirty && (local._savedAt || 0) > (remote._savedAt || 0)) {
    result = mergeLocalIntoRemote(remote, local);
  }
  if (local.onboarded || remote.onboarded) result = { ...result, onboarded: true };
  return { data: result, remoteOk: true };
}

// ── Envoi vers Supabase : regroupé (debounce) et jamais deux envois en parallèle ──
const REMOTE_SAVE_DELAY = 1500;
const REMOTE_RETRY_DELAY = 30000;
let _pendingSave = null;   // { data, userId } — dernière version à envoyer
let _saveTimer = null;
let _saveInFlight = false;

function scheduleRemoteSave(delay = REMOTE_SAVE_DELAY) {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(flushRemoteSave, delay);
}

async function flushRemoteSave() {
  clearTimeout(_saveTimer);
  if (_saveInFlight || !_pendingSave) return;
  const { data, userId } = _pendingSave;
  _pendingSave = null;
  _saveInFlight = true;
  let ok = false;
  try {
    const { error } = await supabase.from("profiles")
      .upsert({ id: userId, data, updated_at: new Date().toISOString() });
    if (error) throw error;
    ok = true;
    // La copie locale correspond à ce qui est en ligne → plus rien en attente
    const local = loadLocalData(userId);
    if (local._savedAt === data._savedAt) saveLocalData({ ...local, _dirty: false }, userId);
  } catch (e) {
    console.warn("Supabase save — nouvel essai plus tard :", e.message);
    if (!_pendingSave) _pendingSave = { data, userId }; // une version plus récente a priorité
  } finally {
    _saveInFlight = false;
    if (_pendingSave) scheduleRemoteSave(ok ? REMOTE_SAVE_DELAY : REMOTE_RETRY_DELAY);
  }
}

if (typeof window !== "undefined") {
  // Réseau revenu → on retente tout de suite
  window.addEventListener("online", () => { flushRemoteSave(); });
  // App mise en arrière-plan / fermée → on envoie sans attendre le délai
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushRemoteSave();
  });
}

export function persistData(data, userId, remoteOk) {
  const savedAt = Date.now();
  // localStorage : version allégée (sans activityLog ni watchedEpisodes qui sont volumineux)
  const localData = {
    _savedAt: savedAt,
    _dirty: true, // repassera à false une fois l'envoi Supabase confirmé
    onboarded: data.onboarded,
    user: data.user,
    library: (data.library || []).map(s => ({
      tmdbId: s.tmdbId, title: s.title, poster: s.poster,
      watched: s.watched, userRating: s.userRating, inWatchlist: s.inWatchlist,
      episodes: s.episodes, seasons: s.seasons, genre: s.genre, genres: s.genres,
      year: s.year, status: s.status, rawStatus: s.rawStatus, origin_country: s.origin_country, voteCount: s.voteCount,
    })),
    watchHistory: data.watchHistory,
    lists: data.lists,
    tags: data.tags,
    pinnedBadgeIds: data.pinnedBadgeIds,
    unlockedBadgeIds: data.unlockedBadgeIds,
    rewatchCounts: data.rewatchCounts,
    posterClicks: data.posterClicks,
    watchlistPeak: data.watchlistPeak,
  };
  saveLocalData(localData, userId);
  // Supabase : données complètes — seulement si on a pu lire Supabase au chargement
  if (!userId || !remoteOk) return;
  _pendingSave = { data: { ...data, _savedAt: savedAt }, userId };
  scheduleRemoteSave();
}
