export const IMG = "https://image.tmdb.org/t/p";

// ─── TMDB via proxy local (rapide, sans passer par Claude) ────────────────────

// En local → proxy Express sur :3001 | En production Vercel → même domaine (route /tmdb/*)
const PROXY_URL = import.meta.env.VITE_PROXY_URL
  || (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? `http://${window.location.hostname}:3001`
    : "");

// Cache localStorage (secours hors-ligne) — borné pour ne jamais saturer le stockage
const TMDB_LS_PREFIX = "tmdb_cache:";
const TMDB_LS_MAX_ENTRIES = 150;
const TMDB_LS_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 jours
let _tmdbWritesSincePrune = 0;

// Supprime les entrées trop vieilles et ne garde que les plus récentes.
// keep = 0 → vide entièrement le cache TMDB (utilisé quand le stockage est plein).
export function pruneTmdbCache(keep = TMDB_LS_MAX_ENTRIES) {
  try {
    const now = Date.now();
    const entries = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(TMDB_LS_PREFIX)) continue;
      let ts = 0;
      try { ts = JSON.parse(localStorage.getItem(k))?.ts || 0; } catch { /* entrée corrompue → ts 0 */ }
      entries.push({ k, ts });
    }
    entries.sort((a, b) => b.ts - a.ts);
    entries.forEach((e, i) => {
      if (i >= keep || now - e.ts > TMDB_LS_MAX_AGE) localStorage.removeItem(e.k);
    });
  } catch { /* localStorage indisponible */ }
}
pruneTmdbCache();

function storeTmdbCache(cacheKey, data, ts) {
  const value = JSON.stringify({ data, ts });
  try {
    localStorage.setItem(TMDB_LS_PREFIX + cacheKey, value);
  } catch {
    // Stockage plein → on fait de la place dans le cache TMDB et on réessaie une fois
    pruneTmdbCache(Math.floor(TMDB_LS_MAX_ENTRIES / 2));
    try { localStorage.setItem(TMDB_LS_PREFIX + cacheKey, value); } catch { /* tant pis, c'est juste un cache */ }
  }
  if (++_tmdbWritesSincePrune >= 20) { _tmdbWritesSincePrune = 0; pruneTmdbCache(); }
}

// Cache mémoire (session) — vidé au refresh
const _memCache = new Map();

// Durées de cache par type d'endpoint (en millisecondes)
const CACHE_TTL = {
  "/trending":  5  * 60 * 1000,  // 5 min  — change souvent
  "/tv/top_rated": 30 * 60 * 1000, // 30 min
  "/tv/on_the_air": 15 * 60 * 1000, // 15 min
  "/search":    2  * 60 * 1000,  // 2 min
  "/tv/":      60  * 60 * 1000,  // 1h    — détails série
  default:     10  * 60 * 1000,  // 10 min
};

function getCacheTTL(path) {
  for (const [key, ttl] of Object.entries(CACHE_TTL)) {
    if (key !== "default" && path.startsWith(key)) return ttl;
  }
  return CACHE_TTL.default;
}

export async function tmdbViaClaude(path, params = {}) {
  const qs  = new URLSearchParams(params).toString();
  const base = PROXY_URL ? `${PROXY_URL}/tmdb` : "/api/tmdb";
  const url = `${base}${path}${qs ? "?" + qs : ""}`;
  const cacheKey = url;
  const ttl = getCacheTTL(path);
  const now = Date.now();

  // 1. Cache mémoire (le plus rapide)
  const mem = _memCache.get(cacheKey);
  if (mem && now - mem.ts < ttl) return mem.data;

  // 2. Tenter le réseau
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Erreur proxy : ${res.status}`);
    const data = await res.json();

    // Stocker en mémoire
    _memCache.set(cacheKey, { data, ts: now });

    // Stocker dans localStorage comme fallback hors-ligne (max ~4MB)
    storeTmdbCache(cacheKey, data, now);

    return data;
  } catch (err) {
    // 3. Fallback localStorage si réseau indisponible
    try {
      const stored = localStorage.getItem(TMDB_LS_PREFIX + cacheKey);
      if (stored) {
        const { data, ts } = JSON.parse(stored);
        // Accepter le cache localStorage même expiré si hors-ligne
        console.warn(`[TMDB] Hors-ligne — données en cache du ${new Date(ts).toLocaleTimeString()} utilisées`);
        return data;
      }
    } catch { /* localStorage illisible */ }
    throw err; // Aucun cache dispo → on laisse remonter l'erreur à ErrorState
  }
}

const posterUrl   = (path, size = "w185") => path ? `${IMG}/${size}${path}` : null;
export const backdropUrl = (path) => path ? `${IMG}/w780${path}` : null;

export const GENRE_MAP = {
  10759:"Action",16:"Animation",35:"Comédie",80:"Crime",99:"Documentaire",
  18:"Drame",9648:"Mystère",10765:"Sci-Fi",27:"Horreur",14:"Fantaisie",
  36:"Historique",53:"Thriller",10749:"Romance",37:"Western",10751:"Famille",
};

function tmdbGenre(genres = []) {
  if (!genres.length) return "Série";
  return GENRE_MAP[genres[0]?.id || genres[0]] || genres[0]?.name || "Série";
}
export function tmdbStatus(s) {
  if (!s) return "—";
  if (s === "Ended" || s === "Canceled") return "Terminée";
  if (s === "Returning Series" || s === "In Production") return "En cours";
  return s;
}
export function adaptShow(t) {
  const genreInput = t.genres
    ? t.genres
    : (t.genre_ids || []).map(id => ({ id }));
  const genresArr = genreInput.map(g => GENRE_MAP[g?.id] || g?.name || "").filter(Boolean);
  return {
    tmdbId: t.id, id: t.id,
    title: t.name || t.original_name || "—",
    year: t.first_air_date ? parseInt(t.first_air_date) : "—",
    seasons: t.number_of_seasons || 1,
    rating: t.vote_average ? parseFloat((t.vote_average / 2).toFixed(1)) : 0,
    genre: tmdbGenre(genreInput),
    genres: genresArr,
    status: tmdbStatus(t.status),
    rawStatus: t.status || null,
    poster: posterUrl(t.poster_path),
    backdrop: backdropUrl(t.backdrop_path),
    episodes: t.number_of_episodes || 0,
    voteCount: typeof t.vote_count === "number" ? t.vote_count : null,
    overview: t.overview || "",
    network: t.networks?.[0]?.name || "—",
    creator: t.created_by?.map(c => c.name).join(", ") || "—",
    origin_country: t.origin_country || [],
    watched: false, userRating: null,
  };
}
