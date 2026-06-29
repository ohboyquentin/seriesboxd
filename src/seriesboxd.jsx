import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://sjahjgexkjklzkqglkix.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqYWhqZ2V4a2prbHprcWdsa2l4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDExOTYsImV4cCI6MjA5NjY3NzE5Nn0.h3M2zPDLklFIrMMC2aTEuhtacn1w-cW9SsuUw4e5_t8";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
});

const ORANGE = "#eca6ee";
const ORANGE_DIM = "rgba(192, 28, 207, 0.17)";
const ORANGE_BORDER = "rgba(219, 157, 228, 0.94)";
const IMG = "https://image.tmdb.org/t/p";

// ─── TMDB via proxy local (rapide, sans passer par Claude) ────────────────────

// En local → proxy Express sur :3001 | En production Vercel → même domaine (route /tmdb/*)
const PROXY_URL = import.meta.env.VITE_PROXY_URL
  || (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? `http://${window.location.hostname}:3001`
    : "");

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

async function tmdbViaClaude(path, params = {}) {
  const qs  = new URLSearchParams(params).toString();
  const url = `${PROXY_URL}/tmdb${path}${qs ? "?" + qs : ""}`;
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
    try {
      localStorage.setItem(`tmdb_cache:${cacheKey}`, JSON.stringify({ data, ts: now }));
    } catch (_) { /* localStorage plein, on ignore */ }

    return data;
  } catch (err) {
    // 3. Fallback localStorage si réseau indisponible
    try {
      const stored = localStorage.getItem(`tmdb_cache:${cacheKey}`);
      if (stored) {
        const { data, ts } = JSON.parse(stored);
        // Accepter le cache localStorage même expiré si hors-ligne
        console.warn(`[TMDB] Hors-ligne — données en cache du ${new Date(ts).toLocaleTimeString()} utilisées`);
        return data;
      }
    } catch (_) { /* localStorage illisible */ }
    throw err; // Aucun cache dispo → on laisse remonter l'erreur à ErrorState
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const posterUrl   = (path, size = "w185") => path ? `${IMG}/${size}${path}` : null;
const backdropUrl = (path) => path ? `${IMG}/w780${path}` : null;

function ErrorState({ message = "Impossible de charger les données", onRetry, compact = false }) {
  if (compact) return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "#0e0e0e", border: "1px solid #1e1e1e", borderRadius: 12 }}>
      <span style={{ fontSize: 18 }}>⚠️</span>
      <span style={{ fontSize: 12, color: "#555", flex: 1 }}>{message}</span>
      {onRetry && <div onClick={onRetry} style={{ fontSize: 12, color: ORANGE, cursor: "pointer", whiteSpace: "nowrap" }}>Réessayer</div>}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", gap: 12, textAlign: "center" }}>
      <div style={{ fontSize: 36 }}>📡</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#666" }}>{message}</div>
      <div style={{ fontSize: 12, color: "#333" }}>Vérifie ta connexion ou réessaie dans un moment</div>
      {onRetry && (
        <button onClick={onRetry} style={{ marginTop: 8, background: "none", border: `1px solid ${ORANGE}`, borderRadius: 20, padding: "8px 20px", color: ORANGE, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          🔄 Réessayer
        </button>
      )}
    </div>
  );
}

const GENRE_MAP = {
  10759:"Action",16:"Animation",35:"Comédie",80:"Crime",99:"Documentaire",
  18:"Drame",9648:"Mystère",10765:"Sci-Fi",27:"Horreur",14:"Fantaisie",
  36:"Historique",53:"Thriller",10749:"Romance",37:"Western",10751:"Famille",
};

function tmdbGenre(genres = []) {
  if (!genres.length) return "Série";
  return GENRE_MAP[genres[0]?.id || genres[0]] || genres[0]?.name || "Série";
}
function tmdbStatus(s) {
  if (!s) return "—";
  if (s === "Ended" || s === "Canceled") return "Terminée";
  if (s === "Returning Series" || s === "In Production") return "En cours";
  return s;
}
function adaptShow(t) {
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
    poster: posterUrl(t.poster_path),
    backdrop: backdropUrl(t.backdrop_path),
    episodes: t.number_of_episodes || 0,
    overview: t.overview || "",
    network: t.networks?.[0]?.name || "—",
    creator: t.created_by?.map(c => c.name).join(", ") || "—",
    origin_country: t.origin_country || [],
    watched: false, userRating: null,
  };
}

const PALETTE = ["#EAB308","#A3E635","#34D399","#38BDF8","#A78BFA"];
const ALL_GENRES = ["Thriller","Drame","Sci-Fi","Fantaisie","Comédie","Horreur","Crime","Historique","Animation","Documentaire","Romance","Action"];
const ALL_PLATFORMS = [
  { id: "8",    name: "Netflix",     logo: "N", color: "#E50914" },
  { id: "350",  name: "Apple TV+",   logo: "🍎", color: "#555" },
  { id: "337",  name: "Disney+",     logo: "✦", color: "#0f3992" },
  { id: "1899", name: "Max",         logo: "M", color: "#5822b4" },
  { id: "9",    name: "Prime Video", logo: "P", color: "#00A8E1" },
  { id: "15",   name: "Hulu",        logo: "H", color: "#1CE783" },
];
const profileNavItems = ["TV Shows", "À venir", "Badges", "Reviews", "Lists", "Watchlist", "Tags", "Abonnements", "Abonnés"];
const friends = [
  { name: "Camille", avatar: "C", activity: "a noté Severance", rating: 5, time: "2h" },
  { name: "Théo",    avatar: "T", activity: "a ajouté The Bear", rating: null, time: "5h" },
  { name: "Jade",    avatar: "J", activity: "a noté Andor", rating: 4, time: "1j" },
];

// ─── STATS ────────────────────────────────────────────────────────────────────

function computeStats(w, watchedEps = {}) {
  const totalMins = w.reduce((a, s) => {
    const watchedCount = watchedEps ? (Object.values(watchedEps[s.tmdbId] || {}).filter(Boolean).length) : 0;
    const epCount = watchedCount > 0 ? watchedCount : (s.episodes || 10);
    return a + epCount * 42;
  }, 0);
  const gc = {};
  w.forEach(s => { gc[s.genre] = (gc[s.genre] || 0) + 1; });
  const genreData = Object.entries(gc).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const ratingDist = [1,2,3,4,5].map(r => ({ star: r, count: w.filter(s => s.userRating === r).length }));
  const rated = w.filter(s => s.userRating);
  const avgRating = rated.length ? (rated.reduce((a, s) => a + s.userRating, 0) / rated.length).toFixed(1) : "—";
  return { totalMins, genreData, ratingDist, avgRating };
}
function formatTime(m) {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24), r = h % 24;
  return r > 0 ? `${d}j ${r}h` : `${d}j`;
}

// ─── UI ATOMS ─────────────────────────────────────────────────────────────────

const StarRating = ({ value, onChange, size = 16 }) => {
  const [hovered, setHovered] = useState(null);

  const handleClick = (e, star) => {
    if (!onChange) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const half = (e.clientX - rect.left) < rect.width / 2;
    onChange(half ? star - 0.5 : star);
  };

  const handleMove = (e, star) => {
    if (!onChange) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const half = (e.clientX - rect.left) < rect.width / 2;
    setHovered(half ? star - 0.5 : star);
  };

  const display = hovered !== null ? hovered : (value || 0);

  const starFill = (star) => {
    if (display >= star) return "full";
    if (display >= star - 0.5) return "half";
    return "empty";
  };

  return (
    <div style={{ display: "flex", gap: 2 }} onMouseLeave={() => setHovered(null)}>
      {[1,2,3,4,5].map(star => {
        const fill = starFill(star);
        return (
          <span
            key={star}
            onClick={e => handleClick(e, star)}
            onMouseMove={e => handleMove(e, star)}
            style={{ fontSize: size, cursor: onChange ? "pointer" : "default", lineHeight: 1, position: "relative", display: "inline-block" }}
          >
            {/* Étoile vide en fond */}
            <span style={{ color: "#333" }}>★</span>
            {/* Remplissage par-dessus */}
            {fill !== "empty" && (
              <span style={{
                position: "absolute", left: 0, top: 0,
                color: ORANGE,
                clipPath: fill === "half" ? "inset(0 50% 0 0)" : "none",
                transition: "clip-path .1s",
              }}>★</span>
            )}
          </span>
        );
      })}
    </div>
  );
};

const Spinner = ({ size = 28 }) => (
  <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
    <div style={{ width: size, height: size, border: "3px solid #1a1a1a", borderTop: `3px solid ${ORANGE}`, borderRadius: "50%", animation: "spin .8s linear infinite" }} />
  </div>
);

const PosterCard = ({ series, onOpen, rewatchCount }) => (
  <div onClick={() => onOpen(series)} style={{
    position: "relative", borderRadius: 12, overflow: "hidden", cursor: "pointer",
    aspectRatio: "2/3", background: "#141414", flexShrink: 0,
    boxShadow: "0 8px 24px rgba(0,0,0,.6)", transition: "transform .2s",
  }}
    onMouseEnter={e => e.currentTarget.style.transform = "scale(1.03)"}
    onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
  >
    {series.poster
      ? <img src={series.poster} alt={series.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>📺</div>
    }
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top,rgba(0,0,0,.95) 0%,rgba(0,0,0,.2) 55%,transparent 100%)" }} />
    {series.watched && (
      <div style={{ position: "absolute", top: 8, right: 8, background: ORANGE, borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#000" }}>✓</div>
    )}
    {rewatchCount > 0 && (
      <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.72)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "2px 6px", display: "flex", alignItems: "center", gap: 3 }}>
        <span style={{ fontSize: 9, color: "#ccc" }}>↺</span>
        <span style={{ fontSize: 9, color: "#ccc", fontWeight: 700 }}>{rewatchCount}</span>
      </div>
    )}
    <div style={{ position: "absolute", bottom: 8, left: 8, right: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#fff", lineHeight: 1.2, fontFamily: "'Playfair Display',Georgia,serif" }}>{series.title}</div>
      {series.userRating && <StarRating value={series.userRating} size={10} />}
    </div>
  </div>
);

// ─── GENRE DONUT ──────────────────────────────────────────────────────────────

function GenreDonut({ genreData }) {
  const [hovered, setHovered] = useState(null);
  const size = 140, cx = 70, cy = 70, r = 52, ir = 32;
  const total = genreData.reduce((a, [, n]) => a + n, 0);
  if (!total) return <div style={{ color: "#333", fontSize: 13, textAlign: "center", padding: 20 }}>Pas encore de données</div>;
  let angle = -Math.PI / 2;
  const slices = genreData.map(([genre, count], i) => {
    const sweep = (count / total) * 2 * Math.PI;
    const mk = (rr, a) => [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
    const [x1,y1]=mk(r,angle),[x2,y2]=mk(r,angle+sweep);
    const [ix1,iy1]=mk(ir,angle),[ix2,iy2]=mk(ir,angle+sweep);
    const large = sweep > Math.PI ? 1 : 0;
    const path = `M${ix1},${iy1} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} L${ix2},${iy2} A${ir},${ir} 0 ${large} 0 ${ix1},${iy1}Z`;
    const mid = angle + sweep / 2;
    angle += sweep;
    return { genre, count, path, color: PALETTE[i] || "#555", mid };
  });
  const hov = hovered !== null ? slices[hovered] : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ flexShrink: 0 }}>
        <svg width={size} height={size}>
          {slices.map((s, i) => (
            <path key={i} d={s.path} fill={s.color}
              opacity={hovered === null || hovered === i ? 1 : 0.3}
              style={{ cursor: "pointer", transition: "opacity .2s" }}
              transform={hovered === i ? `translate(${Math.cos(s.mid)*3},${Math.sin(s.mid)*3})` : ""}
              onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}
            />
          ))}
          <text x={cx} y={cy-6} textAnchor="middle" fill="#fff" fontSize="16" fontWeight="700" fontFamily="Georgia,serif">{hov ? hov.count : total}</text>
          <text x={cx} y={cy+10} textAnchor="middle" fill="#666" fontSize="9">{hov ? hov.genre : "séries"}</text>
        </svg>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, opacity: hovered===null||hovered===i?1:.4, transition: "opacity .2s", cursor: "pointer" }}
            onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: "#ccc", flex: 1 }}>{s.genre}</div>
            <div style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>{Math.round(s.count/total*100)}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── RATING BARS ──────────────────────────────────────────────────────────────

function RatingBars({ ratingDist, avgRating }) {
  const maxCount = Math.max(...ratingDist.map(r => r.count), 1);
  const [animated, setAnimated] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setAnimated(true); }, { threshold: .3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ background: ORANGE_DIM, border: `1px solid ${ORANGE_BORDER}`, borderRadius: 12, padding: "8px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: ORANGE, fontSize: 20 }}>★</span>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 24, fontFamily: "'Playfair Display',Georgia,serif" }}>{avgRating}</span>
          <span style={{ color: "#666", fontSize: 12 }}>moyenne</span>
        </div>
        <div style={{ color: "#444", fontSize: 12 }}>{ratingDist.reduce((a, r) => a + r.count, 0)} notes</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[...ratingDist].reverse().map(({ star, count }) => (
          <div key={star} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: ORANGE, fontSize: 11, width: 42, flexShrink: 0 }}>{"★".repeat(star)}</span>
            <div style={{ flex: 1, height: 10, background: "#141414", borderRadius: 6, overflow: "hidden" }}>
              <div style={{ height: "100%", background: `linear-gradient(90deg, #c026d3, #eca6ee)`, borderRadius: 6, width: animated ? `${(count/maxCount)*100}%` : "0%", transition: "width .8s cubic-bezier(.34,1.2,.64,1)", transitionDelay: `${(5-star)*.08}s` }} />
            </div>
            <div style={{ width: 16, textAlign: "right", color: count > 0 ? "#888" : "#333", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{count}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── HOME SECTION (live via Claude→TMDB) ──────────────────────────────────────


// ─── CONTINUE WATCHING SECTION ───────────────────────────────────────────────

function ContinueWatchingSection({ library, watchedEpisodes, onOpen, onSeeAll }) {
  const [showAll, setShowAll] = useState(false);

  const inProgress = library.filter(s => {
    const eps = watchedEpisodes[s.tmdbId];
    const hasCheckedEps = eps && Object.values(eps).some(Boolean);
    return hasCheckedEps && !s.watched;
  });

  if (inProgress.length === 0) return null;

  const getProgress = (s) => {
    const eps = watchedEpisodes[s.tmdbId] || {};
    const allKeys = Object.keys(eps);
    const watchedCount = allKeys.filter(k => eps[k]).length;
    // Total réel = nombre total d'épisodes de la série (TMDB), pas le nombre de clés cochées
    const total = s.episodes > 0 ? s.episodes : (s.seasons ? s.seasons * 10 : Math.max(watchedCount, 10));
    const remaining = Math.max(total - watchedCount, 0);
    const pct = total > 0 ? Math.round((watchedCount / total) * 100) : 0;
    return { watchedCount, total, remaining, pct };
  };

  const displayed = showAll ? inProgress : inProgress.slice(0, 4);

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Header — identique à HomeSection */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0 20px", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>⏳ Keep watching</div>
        <div onClick={onSeeAll} style={{ fontSize: 12, color: ORANGE, cursor: "pointer" }}>Tout voir</div>
      </div>

      {/* Grille — identique à HomeSection */}
      <div style={{ display: "flex", gap: 12, padding: "0 20px", overflowX: showAll ? "visible" : "auto", flexWrap: showAll ? "wrap" : "nowrap" }}>
        {displayed.map(s => {
          const { pct } = getProgress(s);
          return (
            <div key={s.tmdbId} style={{ width: 100, flexShrink: 0 }}>
              <div
                onClick={() => onOpen(s)}
                style={{ position: "relative", borderRadius: 12, overflow: "hidden", cursor: "pointer", aspectRatio: "2/3", background: "#141414", flexShrink: 0, boxShadow: "0 8px 24px rgba(0,0,0,.6)", transition: "transform .2s" }}
                onMouseEnter={e => e.currentTarget.style.transform = "scale(1.03)"}
                onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
              >
                {s.poster
                  ? <img src={s.poster} alt={s.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>📺</div>
                }
                {/* Dégradé sombre en bas pour lisibilité du titre */}
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,.88) 0%, rgba(0,0,0,.2) 45%, transparent 70%)" }} />
                {/* Titre */}
                <div style={{ position: "absolute", bottom: 18, left: 8, right: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#fff", lineHeight: 1.2, fontFamily: "'Playfair Display',Georgia,serif" }}>{s.title}</div>
                </div>
                {/* Barre de progression collée en bas du poster */}
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 4, background: "rgba(255,255,255,.12)" }}>
                  <div style={{
                    height: "100%",
                    width: `${pct}%`,
                    background: "#eca6ee",
                    transition: "width .4s ease",
                  }} />
                </div>
              </div>
              {/* Pourcentage de progression sous le poster */}
              <div style={{ textAlign: "center", marginTop: 5 }}>
                <div style={{ fontSize: 11, color: "#eca6ee", fontWeight: 600 }}>{pct}%</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HomeSection({ title, endpoint, onOpen, onSeeAll }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const fetched = useRef(false);

  const load = useCallback(() => {
    setError(false);
    setLoading(true);
    tmdbViaClaude(endpoint)
      .then(d => { setItems((d.results || []).slice(0, 8).map(adaptShow)); fetched.current = true; })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [endpoint]);

  useEffect(() => {
    if (fetched.current) return;
    load();
  }, [load]);

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0 20px", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>{title}</div>
        <div onClick={onSeeAll} style={{ fontSize: 12, color: ORANGE, cursor: "pointer" }}>Tout voir</div>
      </div>
      {loading && <div style={{ padding: "0 20px" }}><Spinner size={20} /></div>}
      {error && <div style={{ padding: "0 20px" }}><ErrorState message="Impossible de charger cette section" onRetry={load} compact /></div>}
      {!loading && !error && (
        <div style={{ display: "flex", gap: 12, padding: "0 20px", overflowX: "auto" }}>
          {items.map(s => (
            <div key={s.tmdbId} style={{ width: 100, flexShrink: 0 }}>
              <PosterCard series={s} onOpen={onOpen} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── POPULAR WITH FRIENDS ─────────────────────────────────────────────────────

function PopularWithFriends({ friendsActivity, followingIds, onOpen, onSeeAll }) {
  // Retire toute donnée personnelle (note, vu, watchlist) pour n'afficher qu'un poster neutre
  const stripPersonalData = (s) => {
    const { watched, userRating, inWatchlist, ...clean } = s;
    return clean;
  };

  const allItems = useMemo(() => {
    const seen = new Set();
    const result = [];
    const sorted = [...friendsActivity].sort((a, b) => {
      const p = { watch: 2, rate: 2, episode: 1 };
      return (p[b.type] || 0) - (p[a.type] || 0);
    });
    sorted.forEach(a => {
      if (!a.series) return;
      const key = a.series.tmdbId;
      if (!seen.has(key)) { seen.add(key); result.push(stripPersonalData(a.series)); }
    });
    return result;
  }, [friendsActivity]);

  const items = allItems.slice(0, 8);

  if (followingIds.length === 0) return null;

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0 20px", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>👥 Popular with friends</div>
        {allItems.length > 0 && <div onClick={onSeeAll} style={{ fontSize: 12, color: ORANGE, cursor: "pointer" }}>Tout voir</div>}
      </div>
      {items.length === 0 ? (
        <div style={{ padding: "0 20px", color: "#333", fontSize: 13 }}>Tes amis n'ont pas encore d'activité</div>
      ) : (
        <div style={{ display: "flex", gap: 12, padding: "0 20px", overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
          {items.map((s, i) => (
            <div key={s.tmdbId || i} onClick={() => onOpen(s)} style={{ width: 100, flexShrink: 0, cursor: "pointer" }}>
              <div style={{ width: "100%", aspectRatio: "2/3", borderRadius: 10, overflow: "hidden", background: "#1a1a1a" }}>
                {s.poster && <img src={s.poster} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SEE ALL PAGE ─────────────────────────────────────────────────────────────

function SeeAllPage({ title, endpoint, inProgressList, onOpen, onClose }) {
  const [items,       setItems]       = useState([]);
  const [page,        setPage]        = useState(1);
  const [totalPages,  setTotalPages]  = useState(1);
  const [loading,     setLoading]     = useState(!!endpoint);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error,       setError]       = useState(false);
  const sentinelRef = useRef();

  const loadPage = useCallback((p) => {
    if (p === 1) { setLoading(true); setError(false); setItems([]); }
    else setLoadingMore(true);
    tmdbViaClaude(endpoint, { page: p })
      .then(d => {
        setItems(prev => p === 1 ? (d.results || []).map(adaptShow) : [...prev, ...(d.results || []).map(adaptShow)]);
        setTotalPages(d.total_pages || 1);
        setPage(p);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => { setLoading(false); setLoadingMore(false); });
  }, [endpoint]);

  // Chargement initial
  useEffect(() => {
    if (!endpoint) return;
    loadPage(1);
  }, [endpoint, loadPage]);

  // Chargement des pages suivantes
  const loadMore = useCallback(() => {
    if (!endpoint || loadingMore || page >= totalPages || error) return;
    loadPage(page + 1);
  }, [endpoint, loadingMore, page, totalPages, error, loadPage]);

  // IntersectionObserver sur la sentinelle en bas de liste
  useEffect(() => {
    if (!endpoint) return;
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) loadMore();
    }, { threshold: 0.1 });
    if (sentinelRef.current) obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [loadMore, endpoint]);

  const list = endpoint ? items : (inProgressList || []);
  const hasMore = endpoint && page < totalPages;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#080808", zIndex: 900, overflowY: "auto", paddingBottom: 90, maxWidth: 440, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "#080808", padding: "52px 20px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <div onClick={onClose} style={{ width: 36, height: 36, borderRadius: "50%", background: "#111", border: "1px solid #1e1e1e", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif" }}>{title}</div>
          {list.length > 0 && !loading && (
            <div style={{ fontSize: 11, color: "#444", marginTop: 2 }}>
              {list.length} série{list.length > 1 ? "s" : ""}{hasMore ? " · scroll pour en voir plus" : ""}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 60 }}><Spinner size={24} /></div>
      ) : error && items.length === 0 ? (
        <ErrorState message="Impossible de charger les séries" onRetry={() => loadPage(1)} />
      ) : list.length === 0 ? (
        <div style={{ textAlign: "center", color: "#444", fontSize: 14, paddingTop: 60 }}>Aucune série à afficher</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, padding: "0 20px" }}>
            {list.map((s, i) => (
              <div key={`${s.tmdbId}-${i}`}>
                <PosterCard series={s} onOpen={onOpen} />
                <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600, color: "#aaa", lineHeight: 1.3, fontFamily: "'Playfair Display',Georgia,serif", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{s.title}</div>
                {s.userRating
                  ? <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 2 }}>
                      <span style={{ color: ORANGE, fontSize: 9, letterSpacing: 1 }}>{"★".repeat(Math.floor(s.userRating))}{s.userRating % 1 ? "½" : ""}</span>
                      {s._hasReview && <span style={{ fontSize: 10 }}>💬</span>}
                    </div>
                  : s._hasReview
                    ? <div style={{ marginTop: 2 }}><span style={{ fontSize: 10 }}>💬</span></div>
                    : s.rating && !s._hideRating
                      ? <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 2 }}><span style={{ color: ORANGE, fontSize: 9 }}>★</span><span style={{ color: "#555", fontSize: 10 }}>{s.rating}</span></div>
                      : null
                }
              </div>
            ))}
          </div>

          {/* Sentinelle scroll infini */}
          {hasMore && !error && (
            <div ref={sentinelRef} style={{ padding: "28px 0", display: "flex", justifyContent: "center" }}>
              {loadingMore && <Spinner size={20} />}
            </div>
          )}

          {/* Erreur chargement page suivante */}
          {error && items.length > 0 && (
            <div style={{ padding: "0 20px 20px" }}>
              <ErrorState message="Erreur lors du chargement" onRetry={() => loadPage(page + 1)} compact />
            </div>
          )}

          {/* Fin de liste */}
          {!hasMore && list.length > 0 && endpoint && (
            <div style={{ textAlign: "center", color: "#2a2a2a", fontSize: 12, padding: "28px 0" }}>
              — {list.length} séries chargées —
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── SERIES DETAIL PAGE ───────────────────────────────────────────────────────

function SeriesDetailPage({ series, library = [], onClose, onRate, onMarkWatched, onToggleWatchlist, watchHistory, allReviews, onAddReview, onToggleLike, onActivity, watchedEpisodes: initialWatchedEps = {}, onWatchedEpisodesChange, onOpen, rewatchData, onRewatch, onAskConfirm, onSeriesMetaLoaded, onEpPopup, friendsData = [] }) {
  const liveSeries = library.find(s => s.tmdbId === series.tmdbId) || series;
  const [detailTab, setDetailTab] = useState("info");
  const [openSeason, setOpenSeason] = useState(1);
  const [userRating, setUserRating] = useState(series.userRating);
  const [showForm, setShowForm] = useState(false);
  const [reviewText, setReviewText] = useState("");
  const [reviewRating, setReviewRating] = useState(0);
  const [detail, setDetail] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailError, setDetailError] = useState(false);
  const fetched = useRef(false);

  // Suivi par épisode (initialisé depuis les données sauvegardées)
  const [watchedEps, setWatchedEps] = useState(initialWatchedEps);
  const epKey = (seasonN, epN) => `S${seasonN}E${epN}`;

  // Remonte les changements au parent pour sauvegarde
  useEffect(() => {
    onWatchedEpisodesChange?.(watchedEps);
  }, [watchedEps]);

  const toggleEpisode = (seasonN, epN) => {
    const key = epKey(seasonN, epN);
    setWatchedEps(prev => {
      const next = { ...prev, [key]: !prev[key] };
      const season = seasons.find(s => s.n === seasonN);
      if (season) {
        const allWatched = season.episodes.every(ep => next[epKey(seasonN, ep.ep)]);
        if (allWatched) {
          season.episodes.forEach(ep => { next[epKey(seasonN, ep.ep)] = true; });
          if (onActivity) onActivity("episode", `Tu as fini la saison ${seasonN} de ${series.title}`);
        } else if (next[key]) {
          const ep = season.episodes.find(e => e.ep === epN);
          if (onActivity && ep) onActivity("episode", `Tu as vu ${series.title} S${seasonN}E${epN} – ${ep.title}`);
        }
      }
      return next;
    });
  };

  const toggleSeason = (seasonN) => {
    const season = seasons.find(s => s.n === seasonN);
    if (!season) return;
    const allWatched = season.episodes.every(ep => watchedEps[epKey(seasonN, ep.ep)]);
    setWatchedEps(prev => {
      const next = { ...prev };
      season.episodes.forEach(ep => { next[epKey(seasonN, ep.ep)] = !allWatched; });
      return next;
    });
    if (!allWatched && onActivity) onActivity("episode", `Tu as fini la saison ${seasonN} de ${series.title}`);
  };

  const seasonProgress = (seasonN) => {
    const season = seasons.find(s => s.n === seasonN);
    if (!season || season.episodes.length === 0) return { watched: 0, total: 0 };
    const watched = season.episodes.filter(ep => watchedEps[epKey(seasonN, ep.ep)]).length;
    return { watched, total: season.episodes.length };
  };

  const loadDetail = useCallback(() => {
    fetched.current = true;
    setLoading(true);
    setDetailError(false);
    (async () => {
      try {
        const [full, credits, prov] = await Promise.all([
          tmdbViaClaude(`/tv/${series.tmdbId}`),
          tmdbViaClaude(`/tv/${series.tmdbId}/credits`),
          tmdbViaClaude(`/tv/${series.tmdbId}/watch/providers`),
        ]);
        const cast = (credits.cast || []).slice(0, 6).map(c => ({
          name: c.name, role: c.character, avatar: c.name[0],
          photo: c.profile_path ? `${IMG}/w92${c.profile_path}` : null,
        }));
        const fr = prov.results?.FR;
        const streaming = [...(fr?.flatrate || []), ...(fr?.free || [])].map(p => ({
          name: p.provider_name,
          logo: p.logo_path ? `${IMG}/w45${p.logo_path}` : null,
        }));
        const seasonNums = (full.seasons || []).filter(s => s.season_number > 0).map(s => s.season_number);
        const seasonData = await Promise.all(seasonNums.map(n => tmdbViaClaude(`/tv/${series.tmdbId}/season/${n}`)));
        setDetail({ ...full, cast, streaming });
        setSeasons(seasonData.map(sd => ({
          n: sd.season_number,
          episodes: (sd.episodes || []).map(ep => ({
            ep: ep.episode_number, title: ep.name,
            duration: ep.runtime ? `${ep.runtime} min` : "—",
            watched: false,
            still: ep.still_path ? `${IMG}/w300${ep.still_path}` : null,
            overview: ep.overview,
            air_date: ep.air_date || null,
            guest_stars: ep.guest_stars || [],
          })),
        })));
        setOpenSeason(seasonNums[0] || 1);
        // Met à jour le compteur total d'épisodes/saisons dans la library
        // (number_of_episodes n'existe que sur l'endpoint détail, pas sur search/trending)
        if (full.number_of_episodes) {
          const genresArr = (full.genres || []).map(g => GENRE_MAP[g?.id] || g?.name || "").filter(Boolean);
          onSeriesMetaLoaded?.(series.tmdbId, {
            episodes: full.number_of_episodes,
            seasons: full.number_of_seasons || series.seasons,
            genres: genresArr,
            genre: genresArr[0] || series.genre,
            origin_country: full.origin_country || [],
          });
        }
      } catch(e) { setDetailError(true); console.error(e); }
      finally { setLoading(false); }
    })();
  }, [series.tmdbId]);

  useEffect(() => {
    if (fetched.current) return;
    loadDetail();
  }, [loadDetail]);

  const localReviews = allReviews[series.tmdbId] || [];
  const handleSubmit = () => {
    if (!reviewText.trim()) return;
    onAddReview(series.tmdbId, { text: reviewText, rating: reviewRating });
    setReviewText(""); setReviewRating(0); setShowForm(false);
  };
  const backdropSrc = detail?.backdrop_path ? backdropUrl(detail.backdrop_path) : series.backdrop;

  return (
    <div ref={el => el && el.scrollTo(0,0)} style={{ position: "fixed", inset: 0, zIndex: 950, background: "#080808", overflowY: "auto", animation: "slideInRight .28s ease", maxWidth: 440, margin: "0 auto", paddingBottom: 90 }}>
      {/* Hero */}
      <div style={{ position: "relative", height: 300 }}>
        {backdropSrc
          ? <img src={backdropSrc} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg,#1a1a1a,#0a0a0a)" }} />
        }
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom,rgba(8,8,8,.25) 0%,rgba(8,8,8,.97) 100%)" }} />

        {/* Flèche retour */}
        <button onClick={onClose} style={{ position: "absolute", top: 52, left: 16, width: 36, height: 36, borderRadius: "50%", background: "rgba(0,0,0,.55)", border: "1px solid rgba(255,255,255,.12)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 10 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>

        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 20px 20px", display: "flex", gap: 16, alignItems: "flex-end" }}>
          <div style={{ width: 88, flexShrink: 0, borderRadius: 12, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,.8)", aspectRatio: "2/3", background: "#1a1a1a" }}>
            {series.poster && <img src={series.poster} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          </div>
          <div style={{ flex: 1, paddingBottom: 4 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif", lineHeight: 1.1 }}>{series.title}</div>
            <div style={{ fontSize: 12, color: "#aaa", marginTop: 4 }}>{series.year} · {detail?.networks?.[0]?.name || series.network} · {detail?.number_of_seasons || series.seasons} saison{series.seasons > 1 ? "s" : ""}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              {((detail?.genres?.length > 0 ? (detail.genres || []).map(g => GENRE_MAP[g?.id] || g?.name || "").filter(Boolean) : null) || (series.genres && series.genres.length > 0 ? series.genres : [series.genre])).filter(Boolean).map(g => (
                <span key={g} style={{ background: "#1a1a1a", color: "#aaa", fontSize: 11, padding: "3px 8px", borderRadius: 20, border: "1px solid #2a2a2a" }}>{g}</span>
              ))}
              <span style={{ background: series.status === "En cours" ? ORANGE_DIM : "rgba(100,200,100,.1)", color: series.status === "En cours" ? ORANGE : "#6dc86d", fontSize: 11, padding: "3px 8px", borderRadius: 20 }}>{series.status}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ padding: "0 20px 18px", borderBottom: "1px solid #161616" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: ORANGE, fontSize: 18 }}>★</span>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 20 }}>{series.rating}</span>
            <span style={{ color: "#444", fontSize: 13 }}>/5 · communauté</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#555", fontSize: 12 }}>Ta note :</span>
            <StarRating value={userRating} onChange={r => { setUserRating(r); onRate(series.tmdbId, r, series); }} size={20} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => liveSeries.watched && onRewatch && onRewatch(series.title)} style={{ flex: 1, padding: "8px 0", borderRadius: 12, background: rewatchData ? ORANGE_DIM : "#111", border: "1px solid " + (rewatchData ? ORANGE_BORDER : "#222"), color: rewatchData ? ORANGE : liveSeries.watched ? "#777" : "#333", fontSize: 11, cursor: liveSeries.watched ? "pointer" : "default", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, opacity: liveSeries.watched ? 1 : 0.4 }}>
            <span style={{ fontSize: 14 }}>↺</span>
            <span>{rewatchData ? "×" + rewatchData.count : "Rewatch"}</span>
          </button>
          <button onClick={() => { const isNow = !liveSeries.watched; if (isNow && seasons.length > 0) { const a = {}; seasons.forEach(s => s.episodes.forEach(ep => { a[epKey(s.n, ep.ep)] = true; })); setWatchedEps(a); } else if (!isNow) setWatchedEps({}); onMarkWatched(series.tmdbId, series, seasons); }} style={{ flex: 1, padding: "8px 0", borderRadius: 12, background: liveSeries.watched ? ORANGE_DIM : "#111", border: "1px solid " + (liveSeries.watched ? ORANGE_BORDER : "#222"), color: liveSeries.watched ? ORANGE : "#777", fontSize: 11, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <span style={{ fontSize: 14 }}>👁</span>
            <span>{liveSeries.watched ? "Vu ✓" : "Marquer vu"}</span>
          </button>
          <button onClick={() => {
            if (liveSeries.inWatchlist) {
              onAskConfirm("Retirer " + series.title + " de ta Watchlist ?", () => onToggleWatchlist(series.tmdbId, series));
            } else {
              onToggleWatchlist(series.tmdbId, series);
            }
          }} style={{ flex: 1, padding: "8px 0", borderRadius: 12, background: liveSeries.inWatchlist ? ORANGE_DIM : "#111", border: "1px solid " + (liveSeries.inWatchlist ? ORANGE_BORDER : "#222"), color: liveSeries.inWatchlist ? ORANGE : "#777", fontSize: 11, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <span style={{ fontSize: 14 }}>&#128278;</span>
            <span>{liveSeries.inWatchlist ? "Watchlist ✓" : "Watchlist"}</span>
          </button>
          <button onClick={() => { setShowForm(!showForm); setDetailTab("reviews"); }} style={{ flex: 1, padding: "8px 0", borderRadius: 12, background: showForm ? ORANGE_DIM : "#111", border: "1px solid " + (showForm ? ORANGE_BORDER : "#222"), color: showForm ? ORANGE : "#777", fontSize: 11, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <span style={{ fontSize: 14 }}>&#128172;</span>
            <span>Critique</span>
          </button>
        </div>
      </div>

      {/* Bannière amis */}
      {friendsData.length > 0 && (() => {
        const friendsWatched = friendsData.filter(f => f.type === "watch" || f.type === "rate" || f.type === "episode");
        const uniqueFriends = [...new Map(friendsWatched.map(f => [f.userId, f])).values()];
        const friendsRated = friendsData.filter(f => f.type === "rate" && f.series?.userRating);
        const avgRating = friendsRated.length > 0
          ? (friendsRated.reduce((a, f) => a + (f.series?.userRating || 0), 0) / friendsRated.length).toFixed(1)
          : null;
        if (uniqueFriends.length === 0) return null;
        const names = uniqueFriends.slice(0, 2).map(f => f.name).join(", ");
        const extra = uniqueFriends.length > 2 ? ` +${uniqueFriends.length - 2}` : "";
        return (
          <div style={{ margin: "12px 20px 0", padding: "10px 14px", background: "#0e0e0e", border: "1px solid #1a1a1a", borderRadius: 12, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", gap: -4 }}>
              {uniqueFriends.slice(0, 3).map((f, i) => (
                <div key={i} style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(135deg, #c026d3, #f0abfc)", border: "2px solid #080808", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", marginLeft: i > 0 ? -8 : 0, overflow: "hidden" }}>
                  {f.avatar ? <img src={f.avatar} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span>{(f.name||"?")[0].toUpperCase()}</span>}
                </div>
              ))}
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ color: "#ccc", fontSize: 12, fontWeight: 600 }}>{names}{extra}</span>
              <span style={{ color: "#555", fontSize: 12 }}> {uniqueFriends.length > 1 ? "ont" : "a"} vu cette série</span>
              {avgRating && <span style={{ color: "#555", fontSize: 12 }}> · ★ {avgRating} en moyenne</span>}
            </div>
          </div>
        );
      })()}

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #161616" }}>
        {["info","épisodes","reviews"].map(t => (
          <button key={t} onClick={() => setDetailTab(t)} style={{ flex: 1, padding: "13px 0", background: "none", border: "none", borderBottom: detailTab === t ? `2px solid ${ORANGE}` : "2px solid transparent", color: detailTab === t ? "#fff" : "#555", fontSize: 13, fontWeight: detailTab === t ? 600 : 400, cursor: "pointer" }}>
            {t.charAt(0).toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>

      {loading && <Spinner />}

      {!loading && detailError && (
        <div style={{ padding: "20px" }}>
          <ErrorState
            message="Impossible de charger les détails de cette série"
            onRetry={() => { fetched.current = false; loadDetail(); }}
          />
        </div>
      )}

      {/* INFO */}
      {!loading && !detailError && detailTab === "info" && (
        <div style={{ padding: "20px 20px 40px" }}>
          {detail?.overview && (
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Synopsis</div>
              <div style={{ color: "#ccc", fontSize: 14, lineHeight: 1.65 }}>{detail.overview}</div>
            </div>
          )}
          {detail?.created_by?.length > 0 && (
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Créé par</div>
              <div style={{ color: "#fff", fontSize: 14, fontWeight: 500 }}>{detail.created_by.map(c => c.name).join(", ")}</div>
            </div>
          )}
          {detail?.cast?.length > 0 && (
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12 }}>Casting</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {detail.cast.map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 42, height: 42, borderRadius: "50%", overflow: "hidden", background: "#1a1a1a", border: "1px solid #252525", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {c.photo ? <img src={c.photo} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ color: ORANGE, fontWeight: 700, fontSize: 16 }}>{c.avatar}</span>}
                    </div>
                    <div>
                      <div style={{ color: "#fff", fontSize: 14, fontWeight: 500 }}>{c.name}</div>
                      <div style={{ color: "#555", fontSize: 12 }}>{c.role}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12 }}>Disponible sur</div>
            {detail?.streaming?.length > 0 ? (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {detail.streaming.map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#111", border: "1px solid #222", borderRadius: 12 }}>
                    {s.logo ? <img src={s.logo} style={{ width: 24, height: 24, borderRadius: 6 }} /> : <span style={{ fontSize: 18 }}>📺</span>}
                    <span style={{ color: "#ddd", fontSize: 13, fontWeight: 500 }}>{s.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: "#444", fontSize: 13 }}>Non disponible en France pour l'instant</div>
            )}
          </div>

          {/* Séries similaires */}
          <SimilarSeries tmdbId={series.tmdbId} onOpen={onOpen} />
        </div>
      )}

      {/* ÉPISODES */}
      {!loading && !detailError && detailTab === "épisodes" && (
        <div style={{ padding: "16px 0 40px" }}>
          <div style={{ display: "flex", gap: 8, padding: "0 20px", marginBottom: 16, overflowX: "auto" }}>
            {seasons.map(s => {
              const prog = seasonProgress(s.n);
              const allDone = prog.total > 0 && prog.watched === prog.total;
              return (
                <button key={s.n} onClick={() => setOpenSeason(s.n)} style={{ padding: "8px 14px", borderRadius: 20, flexShrink: 0, background: openSeason === s.n ? ORANGE : "#111", border: `1px solid ${openSeason === s.n ? ORANGE : allDone ? "rgba(234,179,8,0.4)" : "#222"}`, color: openSeason === s.n ? "#000" : allDone ? ORANGE : "#666", fontSize: 13, fontWeight: openSeason === s.n ? 700 : 400, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                  {allDone && <span style={{ fontSize: 11 }}>✓</span>}
                  Saison {s.n}
                  {prog.total > 0 && !allDone && <span style={{ fontSize: 10, opacity: .7 }}>{prog.watched}/{prog.total}</span>}
                </button>
              );
            })}
          </div>
          {seasons.filter(s => s.n === openSeason).map(season => {
            const prog = seasonProgress(season.n);
            const allDone = prog.total > 0 && prog.watched === prog.total;
            return (
              <div key={"header-" + season.n} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px 12px" }}>
                <div style={{ flex: 1, marginRight: 16 }}>
                  <div style={{ height: 4, background: "#1a1a1a", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", background: ORANGE, borderRadius: 4, width: prog.total > 0 ? `${(prog.watched / prog.total) * 100}%` : "0%", transition: "width .3s ease" }} />
                  </div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 5 }}>{prog.watched} / {prog.total} épisodes vus</div>
                </div>
                <button onClick={() => toggleSeason(season.n)} style={{ flexShrink: 0, padding: "6px 12px", borderRadius: 20, background: allDone ? ORANGE_DIM : "#111", border: `1px solid ${allDone ? ORANGE_BORDER : "#2a2a2a"}`, color: allDone ? ORANGE : "#666", fontSize: 11, cursor: "pointer" }}>
                  {allDone ? "Tout décocher" : "Tout cocher"}
                </button>
              </div>
            );
          })}
          {seasons.filter(s => s.n === openSeason).map(season => (
            <div key={season.n}>
              {season.episodes.map((ep, i) => {
                const isWatched = !!watchedEps[epKey(season.n, ep.ep)];
                return (
                  <div key={i} style={{ display: "flex", gap: 12, padding: "12px 20px", borderBottom: "1px solid #0e0e0e", alignItems: "flex-start", background: isWatched ? "rgba(234,179,8,0.04)" : "transparent", transition: "background .15s" }}>
                    {/* Thumbnail — clic pour cocher */}
                    <div onClick={() => toggleEpisode(season.n, ep.ep)} style={{ width: 80, height: 46, borderRadius: 8, overflow: "hidden", background: "#141414", flexShrink: 0, position: "relative", cursor: "pointer" }}>
                      {ep.still ? <img src={ep.still} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: isWatched ? 0.45 : 1, transition: "opacity .2s" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#333", fontSize: 16 }}>▶</div>}
                      {isWatched && (
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <div style={{ width: 22, height: 22, borderRadius: "50%", background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#000" }}>✓</div>
                        </div>
                      )}
                    </div>
                    {/* Infos — clic pour cocher aussi */}
                    <div onClick={() => toggleEpisode(season.n, ep.ep)} style={{ flex: 1, cursor: "pointer" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ color: isWatched ? "#666" : "#fff", fontSize: 13, fontWeight: 500, flex: 1, paddingRight: 8, textDecoration: isWatched ? "line-through" : "none", transition: "color .2s" }}>{ep.title}</div>
                        <div style={{ color: "#444", fontSize: 11, flexShrink: 0 }}>{ep.duration}</div>
                      </div>
                      <div style={{ color: "#555", fontSize: 11, marginTop: 2 }}>S{season.n}E{ep.ep}</div>
                      {ep.overview && <div style={{ color: "#444", fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>{ep.overview.slice(0,90)}{ep.overview.length>90?"…":""}</div>}
                    </div>
                    {/* Bouton ℹ discret */}
                    <button onClick={(e) => { e.stopPropagation(); onEpPopup && onEpPopup(ep, season.n); }} style={{ background: "none", border: "none", color: "#333", cursor: "pointer", padding: "2px 4px", fontSize: 13, flexShrink: 0, alignSelf: "center", lineHeight: 1 }}>ℹ</button>
                  </div>
                );
              })}
            </div>
          ))}
          {seasons.length === 0 && <div style={{ textAlign: "center", color: "#333", fontSize: 13, padding: 40 }}>Données non disponibles</div>}
        </div>
      )}

      {/* REVIEWS */}
      {detailTab === "reviews" && (
        <div style={{ padding: "20px 20px 40px" }}>
          {showForm && (
            <div style={{ background: "#0e0e0e", border: "1px solid #1e1e1e", borderRadius: 16, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: "#888", marginBottom: 10 }}>Ta critique</div>
              <div style={{ marginBottom: 12 }}><StarRating value={reviewRating} onChange={setReviewRating} size={22} /></div>
              <textarea value={reviewText} onChange={e => setReviewText(e.target.value)} placeholder="Partage ton avis..." style={{ width: "100%", background: "#141414", border: "1px solid #252525", borderRadius: 10, padding: "12px", color: "#ddd", fontSize: 14, lineHeight: 1.5, minHeight: 100, resize: "none", outline: "none", fontFamily: "'DM Sans',system-ui,sans-serif" }} />
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, background: "#111", border: "1px solid #222", color: "#666", fontSize: 13, cursor: "pointer" }}>Annuler</button>
                <button onClick={handleSubmit} style={{ flex: 2, padding: "10px", borderRadius: 10, background: ORANGE, border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Publier</button>
              </div>
            </div>
          )}
          {!showForm && (
            <button onClick={() => setShowForm(true)} style={{ width: "100%", padding: "13px", marginBottom: 20, background: "transparent", border: "1px dashed #2a2a2a", borderRadius: 12, color: "#555", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              ✏️ Écrire une critique
            </button>
          )}
          <div style={{ fontSize: 13, color: "#444", marginBottom: 14 }}>{localReviews.length} critique{localReviews.length!==1?"s":""}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {localReviews.map((rv, i) => (
              <div key={rv.id||i} style={{ background: "#0d0d0d", border: "1px solid #191919", borderRadius: 16, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#1a1a1a", border: "1px solid #252525", display: "flex", alignItems: "center", justifyContent: "center", color: ORANGE, fontWeight: 700, fontSize: 14 }}>{rv.avatar}</div>
                    <div>
                      <div style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>{rv.user}</div>
                      <div style={{ color: "#444", fontSize: 11 }}>{rv.date}</div>
                    </div>
                  </div>
                  <StarRating value={rv.rating} size={12} />
                </div>
                <div style={{ color: "#bbb", fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>{rv.text}</div>
                <button onClick={() => onToggleLike(series.tmdbId, rv.id||i)} style={{ display: "flex", alignItems: "center", gap: 6, background: rv.liked ? ORANGE_DIM : "transparent", border: `1px solid ${rv.liked ? ORANGE_BORDER : "#252525"}`, borderRadius: 20, padding: "5px 12px", cursor: "pointer", color: rv.liked ? ORANGE : "#555", fontSize: 12 }}>
                  <span>{rv.liked?"♥":"♡"}</span> <span>{rv.likes} J'aime</span>
                </button>
              </div>
            ))}
            {!localReviews.length && <div style={{ textAlign: "center", color: "#333", fontSize: 13, padding: "30px 0" }}>Sois le premier à écrire une critique ✨</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SEARCH PAGE ──────────────────────────────────────────────────────────────

function SearchPage({ onOpen, onViewProfile, currentUserId }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ genres: [], minRating: 0, yearFrom: "", yearTo: "", status: "" });
  const [trending, setTrending] = useState([]);
  const debounceRef = useRef(null);
  const [userResults, setUserResults] = useState([]);
  const [followMapSearch, setFollowMapSearch] = useState({});

  const toggleFollowSearch = async (targetId) => {
    if (!currentUserId) return;
    if (followMapSearch[targetId]) {
      await supabase.from("follows").delete().eq("follower_id", currentUserId).eq("following_id", targetId);
      setFollowMapSearch(p => ({ ...p, [targetId]: false }));
    } else {
      await supabase.from("follows").insert({ follower_id: currentUserId, following_id: targetId });
      setFollowMapSearch(p => ({ ...p, [targetId]: true }));
    }
  };

  const activeCount = filters.genres.length + (filters.minRating > 0 ? 1 : 0) + (filters.yearFrom || filters.yearTo ? 1 : 0) + (filters.status ? 1 : 0);
  const toggleGenre = g => setFilters(f => ({ ...f, genres: f.genres.includes(g) ? f.genres.filter(x => x !== g) : [...f.genres, g] }));
  const clearFilters = () => setFilters({ genres: [], minRating: 0, yearFrom: "", yearTo: "", status: "" });

  useEffect(() => {
    tmdbViaClaude("/trending/tv/week").then(d => setTrending((d.results || []).slice(0, 12).map(adaptShow))).catch(() => {});
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); setUserResults([]); setSearchError(false); return; }
    setLoading(true);
    setSearchError(false);
    debounceRef.current = setTimeout(async () => {
      try {
        const [tmdbData, usersData] = await Promise.all([
          tmdbViaClaude("/search/tv", { query }),
          searchUsers(query),
        ]);
        const filteredUsers = usersData.filter(u => u.id !== currentUserId);
        setUserResults(filteredUsers);
        if (currentUserId && filteredUsers.length > 0) {
          const { data: myF } = await supabase.from("follows").select("following_id").eq("follower_id", currentUserId).in("following_id", filteredUsers.map(u => u.id));
          const map = {};
          (myF || []).forEach(r => { map[r.following_id] = true; });
          setFollowMapSearch(map);
        }
        const data = tmdbData;
        let shows = (data.results || []).map(adaptShow);
        if (filters.minRating > 0) shows = shows.filter(s => s.rating >= filters.minRating);
        if (filters.yearFrom) shows = shows.filter(s => s.year >= parseInt(filters.yearFrom));
        if (filters.yearTo) shows = shows.filter(s => s.year <= parseInt(filters.yearTo));
        if (filters.status) shows = shows.filter(s => s.status === filters.status);
        setResults(shows);
      } catch(e) { setResults([]); setSearchError(true); }
      setLoading(false);
    }, 500);
  }, [query, filters]);

  const showResults = query.length > 0 || activeCount > 0;

  return (
    <div style={{ padding: "0 20px" }}>
      <div style={{ position: "relative", marginBottom: 12 }}>
        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#555", fontSize: 16 }}>🔍</span>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Chercher une série ou un ami..." style={{ width: "100%", padding: "13px 52px 13px 42px", background: "#111", border: `1px solid ${showFilters ? ORANGE_BORDER : "#1e1e1e"}`, borderRadius: 12, color: "#fff", fontSize: 14, outline: "none" }} />
        <button onClick={() => setShowFilters(!showFilters)} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: activeCount > 0 ? ORANGE_DIM : "transparent", border: `1px solid ${activeCount > 0 ? ORANGE_BORDER : "#2a2a2a"}`, borderRadius: 8, padding: "5px 10px", cursor: "pointer", color: activeCount > 0 ? ORANGE : "#555", fontSize: 13, display: "flex", alignItems: "center", gap: 5 }}>
          <span>⚙</span>
          {activeCount > 0 && <span style={{ background: ORANGE, color: "#fff", borderRadius: "50%", width: 16, height: 16, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{activeCount}</span>}
        </button>
      </div>

      {activeCount > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12, overflowX: "auto" }}>
          {filters.genres.map(g => <div key={g} onClick={() => toggleGenre(g)} style={{ padding: "4px 10px", background: ORANGE_DIM, border: `1px solid ${ORANGE_BORDER}`, borderRadius: 20, color: ORANGE, fontSize: 12, cursor: "pointer", flexShrink: 0 }}>{g} ×</div>)}
          {filters.minRating > 0 && <div onClick={() => setFilters(f => ({ ...f, minRating: 0 }))} style={{ padding: "4px 10px", background: ORANGE_DIM, border: `1px solid ${ORANGE_BORDER}`, borderRadius: 20, color: ORANGE, fontSize: 12, cursor: "pointer", flexShrink: 0 }}>★≥{filters.minRating} ×</div>}
          {filters.status && <div onClick={() => setFilters(f => ({ ...f, status: "" }))} style={{ padding: "4px 10px", background: ORANGE_DIM, border: `1px solid ${ORANGE_BORDER}`, borderRadius: 20, color: ORANGE, fontSize: 12, cursor: "pointer", flexShrink: 0 }}>{filters.status} ×</div>}
          <div onClick={clearFilters} style={{ padding: "4px 10px", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 20, color: "#666", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>Tout effacer</div>
        </div>
      )}

      {showFilters && (
        <div style={{ background: "#0c0c0c", border: "1px solid #1a1a1a", borderRadius: 16, padding: 16, marginBottom: 16 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Genre</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {["Thriller","Drame","Sci-Fi","Fantaisie","Comédie","Horreur","Crime","Historique"].map(g => (
                <button key={g} onClick={() => toggleGenre(g)} style={{ padding: "6px 12px", borderRadius: 20, background: filters.genres.includes(g) ? ORANGE_DIM : "#141414", border: `1px solid ${filters.genres.includes(g) ? ORANGE_BORDER : "#222"}`, color: filters.genres.includes(g) ? ORANGE : "#777", fontSize: 12, cursor: "pointer" }}>{g}</button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Note minimum</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[0,3,3.5,4,4.5].map(r => (
                <button key={r} onClick={() => setFilters(f => ({ ...f, minRating: r }))} style={{ flex: 1, padding: "7px 4px", borderRadius: 10, background: filters.minRating === r ? ORANGE_DIM : "#141414", border: `1px solid ${filters.minRating === r ? ORANGE_BORDER : "#222"}`, color: filters.minRating === r ? ORANGE : "#666", fontSize: 11, cursor: "pointer" }}>{r === 0 ? "Toutes" : `★${r}+`}</button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Année</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input value={filters.yearFrom} onChange={e => setFilters(f => ({ ...f, yearFrom: e.target.value }))} placeholder="De" type="number" style={{ flex: 1, padding: "9px 12px", background: "#141414", border: "1px solid #222", borderRadius: 10, color: "#ccc", fontSize: 13, outline: "none" }} />
              <span style={{ color: "#333" }}>—</span>
              <input value={filters.yearTo} onChange={e => setFilters(f => ({ ...f, yearTo: e.target.value }))} placeholder="À" type="number" style={{ flex: 1, padding: "9px 12px", background: "#141414", border: "1px solid #222", borderRadius: 10, color: "#ccc", fontSize: 13, outline: "none" }} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Statut</div>
            <div style={{ display: "flex", gap: 8 }}>
              {["","En cours","Terminée"].map(s => (
                <button key={s} onClick={() => setFilters(f => ({ ...f, status: s }))} style={{ flex: 1, padding: "8px 0", borderRadius: 10, background: filters.status === s ? ORANGE_DIM : "#141414", border: `1px solid ${filters.status === s ? ORANGE_BORDER : "#222"}`, color: filters.status === s ? ORANGE : "#666", fontSize: 12, cursor: "pointer" }}>{s || "Tous"}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showResults ? (
        <div>
          {loading && <Spinner />}
          {!loading && (
            <>
              {searchError ? (
                <ErrorState message="La recherche a échoué" onRetry={() => setQuery(q => q)} />
              ) : (
                <>
                  {userResults.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 12 }}>Utilisateurs</div>
                  {userResults.map(u => (
                    <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #111" }}>
                      <div onClick={() => onViewProfile?.(u.id)} style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg, #c026d3, #f0abfc)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18, color: "#fff", flexShrink: 0, cursor: "pointer", overflow: "hidden" }}>
                        {u.avatar ? <img src={u.avatar} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span>{(u.name||"?")[0].toUpperCase()}</span>}
                      </div>
                      <div onClick={() => onViewProfile?.(u.id)} style={{ flex: 1, cursor: "pointer" }}>
                        <div style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>{u.name}</div>
                        <div style={{ color: "#555", fontSize: 12 }}>@{u.pseudo} · {(u.library||[]).filter(s => s.watched).length} séries vues</div>
                      </div>
                      {currentUserId && (
                        <button onClick={() => toggleFollowSearch(u.id)} style={{ padding: "7px 14px", borderRadius: 16, background: followMapSearch[u.id] ? "#1a1a1a" : ORANGE_DIM, border: "1px solid " + (followMapSearch[u.id] ? "#2a2a2a" : ORANGE_BORDER), color: followMapSearch[u.id] ? "#666" : ORANGE, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                          {followMapSearch[u.id] ? "Suivi ✓" : "Suivre"}
                        </button>
                      )}
                    </div>
                  ))}
                  {results.length > 0 && <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: ".07em", marginTop: 16, marginBottom: 8 }}>Séries</div>}
                </div>
              )}
              <div style={{ fontSize: 12, color: "#444", marginBottom: 12 }}>{results.length} résultat{results.length!==1?"s":""}{activeCount>0&&<span style={{ color: ORANGE }}> · {activeCount} filtre{activeCount>1?"s":""}</span>}</div>
                  {results.length > 0 ? results.map(s => (
                <div key={s.tmdbId} onClick={() => onOpen(s)} style={{ display: "flex", gap: 14, padding: "12px 0", borderBottom: "1px solid #141414", cursor: "pointer" }}>
                  <div style={{ width: 48, height: 72, borderRadius: 8, overflow: "hidden", background: "#1a1a1a", flexShrink: 0 }}>
                    {s.poster && <img src={s.poster} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "#fff", fontWeight: 600, fontFamily: "'Playfair Display',Georgia,serif" }}>{s.title}</div>
                    <div style={{ color: "#555", fontSize: 12, marginTop: 3 }}>{s.year} · {s.genre}</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                      <span style={{ color: ORANGE, fontSize: 12 }}>★</span>
                      <span style={{ color: "#aaa", fontSize: 12, fontWeight: 600 }}>{s.rating}</span>
                      <span style={{ background: s.status === "En cours" ? ORANGE_DIM : "rgba(100,200,100,.1)", color: s.status === "En cours" ? ORANGE : "#6dc86d", padding: "2px 7px", borderRadius: 20, fontSize: 10 }}>{s.status}</span>
                    </div>
                  </div>
                </div>
              )) : <div style={{ textAlign: "center", padding: "40px 0" }}><div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div><div style={{ color: "#444", fontSize: 14 }}>Aucun résultat</div></div>}
                </>
              )}
            </>
          )}
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 12, color: "#444", marginBottom: 14, textTransform: "uppercase", letterSpacing: ".07em" }}>Tendances</div>
          {trending.length === 0 ? <Spinner size={20} /> : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {trending.slice(0, 9).map(s => <div key={s.tmdbId}><PosterCard series={s} onOpen={onOpen} /></div>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ONBOARDING ───────────────────────────────────────────────────────────────


// ─── AUTH SCREEN ──────────────────────────────────────────────────────────────
function AuthScreen() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handle = async () => {
    setError(""); setSuccess("");
    if (!email || (!password && mode !== "reset")) { setError("Remplis tous les champs."); return; }
    if (mode !== "reset" && password.length < 6) { setError("Mot de passe minimum 6 caractères."); return; }
    setLoading(true);
    try {
      if (mode === "login") {
        const { error: e } = await supabase.auth.signInWithPassword({ email, password });
        if (e) throw e;
      } else if (mode === "register") {
        const { error: e } = await supabase.auth.signUp({ email, password });
        if (e) throw e;
        setSuccess("Compte créé ! Vérifie ton email pour confirmer.");
      } else {
        const { error: e } = await supabase.auth.resetPasswordForEmail(email);
        if (e) throw e;
        setSuccess("Email de réinitialisation envoyé !");
      }
    } catch (e) {
      const msgs = {
        "Invalid login credentials": "Email ou mot de passe incorrect.",
        "User already registered": "Cet email est déjà utilisé.",
        "Email not confirmed": "Confirme ton email avant de te connecter.",
      };
      setError(msgs[e.message] || e.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'DM Sans',system-ui,sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📺</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif" }}>Seriesboxd</div>
          <div style={{ fontSize: 14, color: "#555", marginTop: 6 }}>Ta bibliothèque de séries</div>
        </div>
        {mode !== "reset" && (
          <div style={{ display: "flex", background: "#111", borderRadius: 14, padding: 4, marginBottom: 28 }}>
            {[["login","Connexion"],["register","Inscription"]].map(([m,l]) => (
              <button key={m} onClick={() => { setMode(m); setError(""); setSuccess(""); }}
                style={{ flex: 1, padding: "10px 0", borderRadius: 10, background: mode===m?"#1e1e1e":"transparent", border: "none", color: mode===m?"#fff":"#555", fontSize: 14, fontWeight: mode===m?600:400, cursor: "pointer" }}>
                {l}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key==="Enter" && handle()}
            style={{ padding: "14px 16px", background: "#111", border: "1px solid #222", borderRadius: 12, color: "#fff", fontSize: 15, outline: "none" }} />
          {mode !== "reset" && (
            <input type="password" placeholder="Mot de passe (min. 6 caractères)" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key==="Enter" && handle()}
              style={{ padding: "14px 16px", background: "#111", border: "1px solid #222", borderRadius: 12, color: "#fff", fontSize: 15, outline: "none" }} />
          )}
          {error   && <div style={{ color:"#f87171", fontSize:13, textAlign:"center", background:"rgba(248,113,113,.1)", padding:"10px 14px", borderRadius:10 }}>{error}</div>}
          {success && <div style={{ color:"#4ade80", fontSize:13, textAlign:"center", background:"rgba(74,222,128,.1)",  padding:"10px 14px", borderRadius:10 }}>{success}</div>}
          <button onClick={handle} disabled={loading}
            style={{ padding:"14px", background:loading?"#222":ORANGE, border:"none", borderRadius:12, color:loading?"#555":"#000", fontSize:15, fontWeight:700, cursor:loading?"default":"pointer" }}>
            {loading ? "..." : mode==="login" ? "Se connecter" : mode==="register" ? "Créer un compte" : "Envoyer le lien"}
          </button>
          {mode === "login" && (
            <button onClick={() => { setMode("reset"); setError(""); setSuccess(""); }}
              style={{ background:"none", border:"none", color:"#555", fontSize:13, cursor:"pointer", textAlign:"center" }}>
              Mot de passe oublié ?
            </button>
          )}
          {mode === "reset" && (
            <button onClick={() => { setMode("login"); setError(""); setSuccess(""); }}
              style={{ background:"none", border:"none", color:"#555", fontSize:13, cursor:"pointer", textAlign:"center" }}>
              ← Retour à la connexion
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState([]);
  const [animDir, setAnimDir] = useState("forward");
  const toggleGenre    = g => setSelectedGenres(p => p.includes(g) ? p.filter(x => x !== g) : [...p, g]);
  const togglePlatform = p => setSelectedPlatforms(p2 => p2.includes(p) ? p2.filter(x => x !== p) : [...p2, p]);
  const goNext = () => { setAnimDir("forward"); setStep(s => s+1); };
  const goBack = () => { setAnimDir("back"); setStep(s => s-1); };
  const canNext = step===1 ? name.trim().length>=2 : step===2 ? selectedGenres.length>=3 : step===3 ? selectedPlatforms.length>=1 : true;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#080808", zIndex: 500, display: "flex", flexDirection: "column", maxWidth: 440, margin: "0 auto" }}>
      <style>{`@keyframes fadeSlideIn{from{opacity:0;transform:translateX(${animDir==="forward"?"24px":"-24px"})}to{opacity:1;transform:translateX(0)}}.ob-step{animation:fadeSlideIn .3s ease}`}</style>
      <div style={{ position: "absolute", top: -100, left: "50%", transform: "translateX(-50%)", width: 400, height: 400, background: `radial-gradient(circle,${ORANGE_DIM} 0%,transparent 70%)`, pointerEvents: "none" }} />
      {step > 0 && <div style={{ display: "flex", justifyContent: "center", gap: 8, paddingTop: 56 }}>{[1,2,3].map(i => <div key={i} style={{ height: 4, borderRadius: 2, transition: "all .3s", width: step>=i?24:8, background: step>=i?ORANGE:"#222" }} />)}</div>}
      {step === 0 && (
        <div className="ob-step" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px", textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 24 }}>📺</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif", lineHeight: 1.1, marginBottom: 16 }}>Series<span style={{ color: ORANGE }}>Boxd</span></div>
          <div style={{ color: "#666", fontSize: 16, lineHeight: 1.6, marginBottom: 48 }}>Suis tes séries, partage tes critiques et découvre ce que regardent tes amis.</div>
          <button onClick={goNext} style={{ width: "100%", padding: "16px", background: ORANGE, border: "none", borderRadius: 16, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>Commencer →</button>
          <div onClick={async () => { await supabase.auth.signOut(); }} style={{ marginTop: 16, color: "#333", fontSize: 13, cursor: "pointer" }}>Déjà un compte ? <span style={{ color: ORANGE }}>Se connecter</span></div>
        </div>
      )}
      {step === 1 && (
        <div className="ob-step" style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 24px 40px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif", marginBottom: 8 }}>Comment tu t'appelles ?</div>
            <div style={{ color: "#555", fontSize: 15, marginBottom: 36 }}>Choisis ton nom d'utilisateur</div>
            <div style={{ position: "relative", marginBottom: 12 }}>
              <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "#444" }}>@</span>
              <input value={name} onChange={e => setName(e.target.value.replace(/\s/g,"_").toLowerCase())} placeholder="ton_pseudo" maxLength={20} style={{ width: "100%", padding: "16px 16px 16px 36px", background: "#111", border: `1px solid ${name.length>=2?ORANGE_BORDER:"#1e1e1e"}`, borderRadius: 14, color: "#fff", fontSize: 18, outline: "none", fontFamily: "'DM Sans',system-ui,sans-serif" }} />
            </div>
            <div style={{ marginTop: 32, padding: "16px", background: "#0e0e0e", borderRadius: 14, border: "1px solid #181818" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: `linear-gradient(135deg, #c026d3, #f0abfc)`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#fff", fontSize: 16 }}>{name?name[0].toUpperCase():"?"}</div>
                <div><div style={{ color: "#fff", fontWeight: 600 }}>{name||"ton_pseudo"}</div><div style={{ color: "#444", fontSize: 12 }}>membre depuis 2025</div></div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={goBack} style={{ padding: "14px 20px", background: "#111", border: "1px solid #222", borderRadius: 14, color: "#666", cursor: "pointer" }}>←</button>
            <button onClick={goNext} disabled={!canNext} style={{ flex: 1, padding: "14px", background: canNext?ORANGE:"#1a1a1a", border: "none", borderRadius: 14, color: canNext?"#fff":"#444", fontSize: 15, fontWeight: 700, cursor: canNext?"pointer":"default" }}>Continuer →</button>
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="ob-step" style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 24px 40px" }}>
          <div style={{ flex: 1, overflowY: "auto" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif", marginBottom: 8 }}>Tes genres préférés</div>
            <div style={{ color: "#555", fontSize: 15, marginBottom: 24 }}>Sélectionne au moins 3</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {ALL_GENRES.map(g => {
                const active = selectedGenres.includes(g);
                const emojis = { Thriller:"🔪",Drame:"🎭","Sci-Fi":"🚀",Fantaisie:"🐉",Comédie:"😂",Horreur:"👻",Crime:"🔍",Historique:"⚔️",Animation:"🎨",Documentaire:"🎬",Romance:"❤️",Action:"💥" };
                return <button key={g} onClick={() => toggleGenre(g)} style={{ padding: "10px 16px", borderRadius: 24, background: active?ORANGE_DIM:"#111", border: `1.5px solid ${active?ORANGE:"#1e1e1e"}`, color: active?ORANGE:"#888", fontSize: 14, fontWeight: active?600:400, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><span>{emojis[g]}</span>{g}{active&&<span style={{ fontSize: 11 }}>✓</span>}</button>;
              })}
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            <button onClick={goBack} style={{ padding: "14px 20px", background: "#111", border: "1px solid #222", borderRadius: 14, color: "#666", cursor: "pointer" }}>←</button>
            <button onClick={goNext} disabled={!canNext} style={{ flex: 1, padding: "14px", background: canNext?ORANGE:"#1a1a1a", border: "none", borderRadius: 14, color: canNext?"#fff":"#444", fontSize: 15, fontWeight: 700, cursor: canNext?"pointer":"default" }}>Continuer →</button>
          </div>
        </div>
      )}
      {step === 3 && (
        <div className="ob-step" style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 24px 40px" }}>
          <div style={{ flex: 1, overflowY: "auto" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif", marginBottom: 8 }}>Tes plateformes</div>
            <div style={{ color: "#555", fontSize: 15, marginBottom: 28 }}>Sur quoi tu regardes tes séries ?</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {ALL_PLATFORMS.map(p => {
                const active = selectedPlatforms.includes(p.id);
                return <button key={p.id} onClick={() => togglePlatform(p.id)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: active?ORANGE_DIM:"#0e0e0e", border: `1.5px solid ${active?ORANGE_BORDER:"#191919"}`, borderRadius: 14, cursor: "pointer" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: active?p.color:"#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900, color: "#fff", flexShrink: 0 }}>{p.logo}</div>
                  <div style={{ color: active?"#fff":"#888", fontSize: 15, fontWeight: active?600:400, flex: 1, textAlign: "left" }}>{p.name}</div>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${active?ORANGE:"#2a2a2a"}`, background: active?ORANGE:"transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>{active&&<span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>✓</span>}</div>
                </button>;
              })}
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            <button onClick={goBack} style={{ padding: "14px 20px", background: "#111", border: "1px solid #222", borderRadius: 14, color: "#666", cursor: "pointer" }}>←</button>
            <button onClick={() => onComplete({ name, genres: selectedGenres, platforms: selectedPlatforms })} disabled={!canNext} style={{ flex: 1, padding: "14px", background: canNext?ORANGE:"#1a1a1a", border: "none", borderRadius: 14, color: canNext?"#fff":"#444", fontSize: 15, fontWeight: 700, cursor: canNext?"pointer":"default" }}>C'est parti ! 🎉</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SETTINGS PAGE ────────────────────────────────────────────────────────────

function SettingsPage({ user, onSave, onClose, watched, library, authEmail, onLogout }) {
  const [name,      setName]      = useState(user.name      || "");
  const [pseudo,    setPseudo]    = useState(user.pseudo     || user.name || "");
  const [bio,       setBio]       = useState(user.bio        || "");
  const [location,  setLocation]  = useState(user.location   || "");
  const [website,   setWebsite]   = useState(user.website    || "");
  const [avatar,    setAvatar]    = useState(user.avatar     || null);   // base64 ou null
  const [genres,    setGenres]    = useState(user.favGenres  || []);
  const [favShows,  setFavShows]  = useState(user.favShows   || []);
  const [showGenrePicker, setShowGenrePicker] = useState(false);
  const [showShowPicker,  setShowShowPicker]  = useState(false);
  const fileRef = useRef();

  const toggleGenre = g => {
    setGenres(prev => prev.includes(g) ? prev.filter(x => x !== g) : prev.length < 5 ? [...prev, g] : prev);
  };
  const toggleShow = s => {
    setFavShows(prev => prev.find(x => x.tmdbId === s.tmdbId) ? prev.filter(x => x.tmdbId !== s.tmdbId) : prev.length < 4 ? [...prev, s] : prev);
  };

  const handleAvatar = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setAvatar(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    onSave({ ...user, name, pseudo, bio, location, website, avatar, favGenres: genres, favShows });
    onClose();
  };

  const inputStyle = { width: "100%", background: "#0e0e0e", border: "1px solid #222", borderRadius: 10, padding: "11px 14px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" };
  const labelStyle = { fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 6, display: "block" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#080808", zIndex: 1000, overflowY: "auto", paddingBottom: 100, maxWidth: 440, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "#080808", padding: "52px 20px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #111" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div onClick={onClose} style={{ width: 36, height: 36, borderRadius: "50%", background: "#111", border: "1px solid #1e1e1e", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif" }}>Modifier le profil</div>
        </div>
        <button onClick={handleSave} style={{ background: ORANGE, border: "none", borderRadius: 20, padding: "8px 20px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Enregistrer</button>
      </div>

      <div style={{ padding: "28px 20px", display: "flex", flexDirection: "column", gap: 24 }}>

        {/* Avatar */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div onClick={() => fileRef.current.click()} style={{ position: "relative", cursor: "pointer" }}>
            <div style={{ width: 90, height: 90, borderRadius: "50%", background: "linear-gradient(135deg, #c026d3, #f0abfc)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", border: "3px solid #1a1a1a" }}>
              {avatar
                ? <img src={avatar} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontWeight: 700, fontSize: 32, color: "#fff" }}>{(name || "?")[0].toUpperCase()}</span>
              }
            </div>
            {/* Overlay caméra */}
            <div style={{ position: "absolute", bottom: 0, right: 0, width: 28, height: 28, borderRadius: "50%", background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #080808" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatar} />
          <div style={{ fontSize: 12, color: "#444" }}>Appuie pour changer la photo</div>
        </div>

        {/* Nom complet */}
        <div>
          <label style={labelStyle}>Nom complet</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Ton nom" style={inputStyle} />
        </div>

        {/* Pseudo */}
        <div>
          <label style={labelStyle}>Pseudo</label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#444", fontSize: 14 }}>@</span>
            <input value={pseudo} onChange={e => setPseudo(e.target.value.replace(/\s/g, ""))} placeholder="pseudo" style={{ ...inputStyle, paddingLeft: 28 }} />
          </div>
        </div>

        {/* Bio */}
        <div>
          <label style={labelStyle}>Bio</label>
          <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Parle de toi en quelques mots..." maxLength={150} rows={3} style={{ ...inputStyle, resize: "none", lineHeight: 1.5 }} />
          <div style={{ textAlign: "right", fontSize: 11, color: "#333", marginTop: 4 }}>{bio.length}/150</div>
        </div>

        {/* Location */}
        <div>
          <label style={labelStyle}>Localisation</label>
          <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Paris, France" style={inputStyle} />
        </div>

        {/* Website */}
        <div>
          <label style={labelStyle}>Site web</label>
          <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://..." style={inputStyle} />
        </div>

        {/* Genres favoris */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Genres favoris <span style={{ color: "#333" }}>(max 5)</span></label>
            <span style={{ fontSize: 12, color: ORANGE, cursor: "pointer" }} onClick={() => setShowGenrePicker(v => !v)}>{showGenrePicker ? "Fermer" : "Modifier"}</span>
          </div>
          {/* Tags sélectionnés */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: showGenrePicker ? 12 : 0 }}>
            {genres.length === 0 && !showGenrePicker && <span style={{ fontSize: 13, color: "#333" }}>Aucun genre sélectionné</span>}
            {genres.map(g => (
              <span key={g} onClick={() => toggleGenre(g)} style={{ background: "#1a1a1a", border: `1px solid ${ORANGE}55`, color: ORANGE, fontSize: 12, padding: "5px 12px", borderRadius: 20, cursor: "pointer" }}>
                {g} ×
              </span>
            ))}
          </div>
          {/* Picker */}
          {showGenrePicker && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ALL_GENRES.map(g => {
                const sel = genres.includes(g);
                return (
                  <span key={g} onClick={() => toggleGenre(g)} style={{ background: sel ? "#1a1a1a" : "#0e0e0e", border: `1px solid ${sel ? ORANGE : "#222"}`, color: sel ? ORANGE : "#555", fontSize: 12, padding: "5px 12px", borderRadius: 20, cursor: genres.length >= 5 && !sel ? "default" : "pointer", opacity: genres.length >= 5 && !sel ? 0.4 : 1 }}>
                    {g}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Séries favorites */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Séries favorites <span style={{ color: "#333" }}>(max 4)</span></label>
            <span style={{ fontSize: 12, color: ORANGE, cursor: "pointer" }} onClick={() => setShowShowPicker(v => !v)}>{showShowPicker ? "Fermer" : "Modifier"}</span>
          </div>
          {/* Affiché */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[0,1,2,3].map(i => {
              const s = favShows[i];
              return (
                <div key={i} onClick={() => s && toggleShow(s)} style={{ width: 70, cursor: s ? "pointer" : "default" }}>
                  <div style={{ width: 70, height: 105, borderRadius: 10, overflow: "hidden", background: "#0e0e0e", border: s ? "none" : "1px dashed #1e1e1e", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {s
                      ? <img src={s.poster} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span style={{ fontSize: 20, opacity: 0.15 }}>+</span>
                    }
                  </div>
                  {s && <div style={{ fontSize: 9, color: "#444", marginTop: 4, textAlign: "center", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{s.title}</div>}
                </div>
              );
            })}
          </div>
          {/* Picker : séries vues */}
          {showShowPicker && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: "#444", marginBottom: 8 }}>Sélectionne parmi tes séries vues</div>
              <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
                {watched.map(s => {
                  const sel = favShows.find(x => x.tmdbId === s.tmdbId);
                  return (
                    <div key={s.tmdbId} onClick={() => toggleShow(s)} style={{ flexShrink: 0, width: 70, cursor: "pointer", opacity: favShows.length >= 4 && !sel ? 0.35 : 1 }}>
                      <div style={{ width: 70, height: 105, borderRadius: 10, overflow: "hidden", background: "#0e0e0e", border: sel ? `2px solid ${ORANGE}` : "none" }}>
                        {s.poster ? <img src={s.poster} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📺</div>}
                      </div>
                      <div style={{ fontSize: 9, color: sel ? ORANGE : "#444", marginTop: 4, textAlign: "center", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{s.title}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Section Compte */}
      <div style={{ padding: "0 20px 60px" }}>
        <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12 }}>Compte</div>
        <div style={{ background: "#111", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#555", marginBottom: 12 }}>
          Connecté en tant que <span style={{ color: "#aaa" }}>{authEmail}</span>
        </div>
        <button onClick={onLogout} style={{ width: "100%", padding: "13px 16px", background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 12, color: "#ef4444", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          Se déconnecter
        </button>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

const LS_KEY_BASE = "seriesboxd_data";
const getLsKey = (userId) => userId ? `${LS_KEY_BASE}_${userId}` : LS_KEY_BASE;

function loadLocalData(userId) {
  try { const r = localStorage.getItem(getLsKey(userId)); return r ? JSON.parse(r) : {}; }
  catch { return {}; }
}
function saveLocalData(data, userId) {
  try { localStorage.setItem(getLsKey(userId), JSON.stringify(data)); }
  catch (e) { console.warn("localStorage plein :", e.message); }
}

async function loadSavedData(userId) {
  const local = loadLocalData(userId);
  // Vérifie aussi l'ancienne clé sans userId (migration)
  const legacyLocal = loadLocalData(null);
  if (!userId) return local;
  try {
    const { data, error } = await supabase
      .from("profiles").select("data").eq("id", userId).single();
    if (!error && data?.data) {
      const remote = data.data;
      // Prend les données les plus complètes : plus de séries = meilleure source
      const remoteLib = (remote.library || []).length;
      const localLib  = (local.library  || []).length;
      const legacyLib = (legacyLocal.library || []).length;

      let best = remote;
      if (localLib > remoteLib) best = local;
      if (legacyLib > Math.max(remoteLib, localLib)) best = legacyLocal;

      // S'assure qu'onboarded est true si l'une des sources le dit
      if (local.onboarded || remote.onboarded || legacyLocal.onboarded) {
        best = { ...best, onboarded: true };
      }

      // Resauvegarde la meilleure version en Supabase si différente
      saveLocalData(best, userId);
      if (best !== remote) {
        try {
          await supabase.from("profiles").upsert({ id: userId, data: best, updated_at: new Date().toISOString() });
        } catch(e) { console.warn("Supabase resync:", e); }
      }
      return best;
    }
  } catch (e) { console.warn("Supabase load:", e.message); }
  // Pas de données Supabase — utilise local ou legacy
  if (legacyLocal.library?.length > (local.library?.length || 0)) return legacyLocal;
  return local;
}

async function persistData(data, userId) {
  // localStorage : version allégée (sans activityLog ni watchedEpisodes qui sont volumineux)
  const localData = {
    onboarded: data.onboarded,
    user: data.user,
    library: (data.library || []).map(s => ({
      tmdbId: s.tmdbId, title: s.title, poster: s.poster,
      watched: s.watched, userRating: s.userRating, inWatchlist: s.inWatchlist,
      episodes: s.episodes, seasons: s.seasons, genre: s.genre, genres: s.genres,
      year: s.year, status: s.status, origin_country: s.origin_country,
    })),
    watchHistory: data.watchHistory,
    lists: data.lists,
    tags: data.tags,
    pinnedBadgeIds: data.pinnedBadgeIds,
    unlockedBadgeIds: data.unlockedBadgeIds,
    rewatchCounts: data.rewatchCounts,
  };
  try { saveLocalData(localData, userId); } catch(e) {}
  // Supabase : données complètes
  if (!userId) return;
  try {
    await supabase.from("profiles").upsert({ id: userId, data, updated_at: new Date().toISOString() });
  } catch (e) { console.warn("Supabase save:", e.message); }
}


// ─── TV SHOWS PAGE ────────────────────────────────────────────────────────────
function TVShowsPage({ watched, watchHistory, openSeries, rewatchCounts }) {
  const [tvFilters, setTvFilters] = useState({ status: "", minRating: 0, sort: "date" });
  const [tvShowFilters, setTvShowFilters] = useState(false);
  const tvActiveCount = (tvFilters.status ? 1 : 0) + (tvFilters.minRating > 0 ? 1 : 0);
  let tvList = [...watched];
  if (tvFilters.status) tvList = tvList.filter(s => s.status === tvFilters.status);
  if (tvFilters.minRating > 0) tvList = tvList.filter(s => s.userRating >= tvFilters.minRating);
  if (tvFilters.sort === "date") tvList.sort((a,b) => (watchHistory[b.tmdbId]||"").localeCompare(watchHistory[a.tmdbId]||""));
  else if (tvFilters.sort === "rating") tvList.sort((a,b) => (b.userRating||0) - (a.userRating||0));
  else if (tvFilters.sort === "title") tvList.sort((a,b) => a.title.localeCompare(b.title));
  return (
    <div ref={el => el && el.scrollTo(0,0)} style={{ position: "fixed", inset: 0, background: "#080808", zIndex: 900, overflowY: "auto", paddingBottom: 90, maxWidth: 440, margin: "0 auto" }}>
      <div style={{ padding: "52px 20px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif" }}>TV Shows</div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{tvList.length} / {watched.length} série{watched.length !== 1 ? "s" : ""}</div>
        </div>
        <button onClick={() => setTvShowFilters(f => !f)} style={{ background: tvActiveCount > 0 ? ORANGE_DIM : "#111", border: `1px solid ${tvActiveCount > 0 ? ORANGE_BORDER : "#222"}`, borderRadius: 10, padding: "7px 12px", cursor: "pointer", color: tvActiveCount > 0 ? ORANGE : "#555", display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
          {tvActiveCount > 0 && <span style={{ background: ORANGE, color: "#000", borderRadius: "50%", width: 16, height: 16, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{tvActiveCount}</span>}
        </button>
      </div>
      {tvShowFilters && (
        <div style={{ margin: "0 20px 16px", background: "#0c0c0c", border: "1px solid #1a1a1a", borderRadius: 16, padding: 16 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Trier par</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[["date","Date"],["rating","Note"],["title","Titre"]].map(([v,l]) => (
                <button key={v} onClick={() => setTvFilters(f => ({...f, sort: v}))} style={{ flex: 1, padding: "7px 0", borderRadius: 10, background: tvFilters.sort===v ? ORANGE_DIM : "#141414", border: `1px solid ${tvFilters.sort===v ? ORANGE_BORDER : "#222"}`, color: tvFilters.sort===v ? ORANGE : "#666", fontSize: 12, cursor: "pointer" }}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Statut</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[["","Tous"],["En cours","En cours"],["Terminée","Terminée"]].map(([v,l]) => (
                <button key={v} onClick={() => setTvFilters(f => ({...f, status: v}))} style={{ flex: 1, padding: "7px 0", borderRadius: 10, background: tvFilters.status===v ? ORANGE_DIM : "#141414", border: `1px solid ${tvFilters.status===v ? ORANGE_BORDER : "#222"}`, color: tvFilters.status===v ? ORANGE : "#666", fontSize: 11, cursor: "pointer" }}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Note minimum</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[[0,"Toutes"],[3,"★3+"],[3.5,"★3.5+"],[4,"★4+"],[4.5,"★4.5+"]].map(([v,l]) => (
                <button key={v} onClick={() => setTvFilters(f => ({...f, minRating: v}))} style={{ flex: 1, padding: "7px 2px", borderRadius: 10, background: tvFilters.minRating===v ? ORANGE_DIM : "#141414", border: `1px solid ${tvFilters.minRating===v ? ORANGE_BORDER : "#222"}`, color: tvFilters.minRating===v ? ORANGE : "#666", fontSize: 10, cursor: "pointer" }}>{l}</button>
              ))}
            </div>
          </div>
        </div>
      )}
      {watched.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 20px" }}>
          <div style={{ color: "#333", fontSize: 14 }}>Aucune série vue pour l'instant</div>
        </div>
      ) : tvList.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ color: "#333", fontSize: 14 }}>Aucun résultat pour ces filtres</div>
          <button onClick={() => setTvFilters({ status: "", minRating: 0, sort: "date" })} style={{ marginTop: 12, padding: "8px 20px", borderRadius: 20, background: ORANGE_DIM, border: `1px solid ${ORANGE_BORDER}`, color: ORANGE, fontSize: 12, cursor: "pointer" }}>Effacer les filtres</button>
        </div>
      ) : (
        <div style={{ padding: "0 20px" }}>
          {tvList.map(s => (
            <div key={s.tmdbId} onClick={() => openSeries(s)} style={{ display: "flex", gap: 14, padding: "14px 0", borderBottom: "1px solid #111", cursor: "pointer", alignItems: "flex-start" }}>
              <div style={{ width: 56, height: 84, borderRadius: 8, overflow: "hidden", background: "#1a1a1a", flexShrink: 0 }}>
                {s.poster && <img src={s.poster} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: "#fff", fontWeight: 600, fontSize: 14, fontFamily: "'Playfair Display',Georgia,serif", lineHeight: 1.3 }}>{s.title}</div>
                <div style={{ color: "#555", fontSize: 12, marginTop: 4 }}>{s.year}{s.seasons ? ` · ${s.seasons} saison${s.seasons > 1 ? "s" : ""}` : ""}</div>
                {watchHistory[s.tmdbId] && <div style={{ fontSize: 11, color: "#444", marginTop: 3 }}><span style={{ color: ORANGE, marginRight: 4 }}>📅</span>{new Date(watchHistory[s.tmdbId]).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</div>}
                {rewatchCounts?.[s.tmdbId]?.count > 0 && (
                  <div style={{ fontSize: 11, color: "#666", marginTop: 3, display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ color: ORANGE }}>↺</span>
                    <span>{rewatchCounts[s.tmdbId].count} fois revisionnée</span>
                    {rewatchCounts[s.tmdbId].lastDate && <span style={{ color: "#444" }}>· {new Date(rewatchCounts[s.tmdbId].lastDate).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</span>}
                  </div>
                )}
                {s.userRating ? <div style={{ marginTop: 6 }}><StarRating value={s.userRating} size={13} /></div> : <div style={{ fontSize: 11, color: "#444", fontStyle: "italic", marginTop: 6 }}>Non noté</div>}
              </div>
              <span style={{ background: s.status==="En cours"?ORANGE_DIM:"rgba(100,200,100,.1)", color: s.status==="En cours"?ORANGE:"#6dc86d", padding: "3px 8px", borderRadius: 20, fontSize: 10, flexShrink: 0, marginTop: 2 }}>{s.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── WATCHLIST PAGE ───────────────────────────────────────────────────────────
function WatchlistPage({ library, openSeries }) {
  const [wlFilters, setWlFilters] = useState({ status: "", minRating: 0, sort: "title" });
  const [wlShowFilters, setWlShowFilters] = useState(false);
  const wlBase = library.filter(s => s.inWatchlist);
  const wlActiveCount = (wlFilters.status ? 1 : 0) + (wlFilters.minRating > 0 ? 1 : 0);
  let wlList = [...wlBase];
  if (wlFilters.status) wlList = wlList.filter(s => s.status === wlFilters.status);
  if (wlFilters.minRating > 0) wlList = wlList.filter(s => s.userRating >= wlFilters.minRating);
  if (wlFilters.sort === "title") wlList.sort((a,b) => a.title.localeCompare(b.title));
  else if (wlFilters.sort === "rating") wlList.sort((a,b) => (b.userRating||0) - (a.userRating||0));
  else if (wlFilters.sort === "year") wlList.sort((a,b) => (b.year||0) - (a.year||0));
  return (
    <div ref={el => el && el.scrollTo(0,0)} style={{ position: "fixed", inset: 0, background: "#080808", zIndex: 900, overflowY: "auto", paddingBottom: 90, maxWidth: 440, margin: "0 auto" }}>
      <div style={{ padding: "52px 20px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif" }}>Watchlist</div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{wlList.length} / {wlBase.length} série{wlBase.length !== 1 ? "s" : ""}</div>
        </div>
        <button onClick={() => setWlShowFilters(f => !f)} style={{ background: wlActiveCount > 0 ? ORANGE_DIM : "#111", border: `1px solid ${wlActiveCount > 0 ? ORANGE_BORDER : "#222"}`, borderRadius: 10, padding: "7px 12px", cursor: "pointer", color: wlActiveCount > 0 ? ORANGE : "#555", display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
          {wlActiveCount > 0 && <span style={{ background: ORANGE, color: "#000", borderRadius: "50%", width: 16, height: 16, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{wlActiveCount}</span>}
        </button>
      </div>
      {wlShowFilters && (
        <div style={{ margin: "0 20px 16px", background: "#0c0c0c", border: "1px solid #1a1a1a", borderRadius: 16, padding: 16 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Trier par</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[["title","Titre"],["rating","Note"],["year","Année"]].map(([v,l]) => (
                <button key={v} onClick={() => setWlFilters(f => ({...f, sort: v}))} style={{ flex: 1, padding: "7px 0", borderRadius: 10, background: wlFilters.sort===v ? ORANGE_DIM : "#141414", border: `1px solid ${wlFilters.sort===v ? ORANGE_BORDER : "#222"}`, color: wlFilters.sort===v ? ORANGE : "#666", fontSize: 12, cursor: "pointer" }}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Statut</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[["","Tous"],["En cours","En cours"],["Terminée","Terminée"]].map(([v,l]) => (
                <button key={v} onClick={() => setWlFilters(f => ({...f, status: v}))} style={{ flex: 1, padding: "7px 0", borderRadius: 10, background: wlFilters.status===v ? ORANGE_DIM : "#141414", border: `1px solid ${wlFilters.status===v ? ORANGE_BORDER : "#222"}`, color: wlFilters.status===v ? ORANGE : "#666", fontSize: 11, cursor: "pointer" }}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Note minimum</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[[0,"Toutes"],[3,"★3+"],[3.5,"★3.5+"],[4,"★4+"],[4.5,"★4.5+"]].map(([v,l]) => (
                <button key={v} onClick={() => setWlFilters(f => ({...f, minRating: v}))} style={{ flex: 1, padding: "7px 2px", borderRadius: 10, background: wlFilters.minRating===v ? ORANGE_DIM : "#141414", border: `1px solid ${wlFilters.minRating===v ? ORANGE_BORDER : "#222"}`, color: wlFilters.minRating===v ? ORANGE : "#666", fontSize: 10, cursor: "pointer" }}>{l}</button>
              ))}
            </div>
          </div>
        </div>
      )}
      {wlBase.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 20px" }}>
          <div style={{ color: "#333", fontSize: 14 }}>Ta watchlist est vide</div>
          <div style={{ color: "#2a2a2a", fontSize: 12, marginTop: 8 }}>Ajoute des séries depuis leur fiche</div>
        </div>
      ) : wlList.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ color: "#333", fontSize: 14 }}>Aucun résultat pour ces filtres</div>
          <button onClick={() => setWlFilters({ status: "", minRating: 0, sort: "title" })} style={{ marginTop: 12, padding: "8px 20px", borderRadius: 20, background: ORANGE_DIM, border: `1px solid ${ORANGE_BORDER}`, color: ORANGE, fontSize: 12, cursor: "pointer" }}>Effacer les filtres</button>
        </div>
      ) : (
        <div style={{ padding: "0 20px" }}>
          {wlList.map(s => (
            <div key={s.tmdbId} onClick={() => openSeries(s)} style={{ display: "flex", gap: 14, padding: "14px 0", borderBottom: "1px solid #111", cursor: "pointer", alignItems: "flex-start" }}>
              <div style={{ width: 56, height: 84, borderRadius: 8, overflow: "hidden", background: "#1a1a1a", flexShrink: 0 }}>
                {s.poster && <img src={s.poster} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: "#fff", fontWeight: 600, fontSize: 14, fontFamily: "'Playfair Display',Georgia,serif", lineHeight: 1.3 }}>{s.title}</div>
                <div style={{ color: "#555", fontSize: 12, marginTop: 4 }}>{s.year}{s.seasons ? ` · ${s.seasons} saison${s.seasons > 1 ? "s" : ""}` : ""}</div>
                {s.userRating ? <div style={{ marginTop: 6 }}><StarRating value={s.userRating} size={13} /></div> : <div style={{ fontSize: 11, color: "#444", fontStyle: "italic", marginTop: 6 }}>Non noté</div>}
              </div>
              <span style={{ background: s.status==="En cours"?ORANGE_DIM:"rgba(100,200,100,.1)", color: s.status==="En cours"?ORANGE:"#6dc86d", padding: "3px 8px", borderRadius: 20, fontSize: 10, flexShrink: 0, marginTop: 2 }}>{s.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ─── SIMILAR SERIES ───────────────────────────────────────────────────────────
function SimilarSeries({ tmdbId, onOpen }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const fetched = useRef(false);
  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    tmdbViaClaude(`/tv/${tmdbId}/similar`)
      .then(d => setItems((d.results || []).slice(0, 10).map(adaptShow)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tmdbId]);
  if (!loading && items.length === 0) return null;
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 14 }}>Tu pourrais aimer</div>
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
          <div style={{ width: 20, height: 20, border: "2px solid #1a1a1a", borderTop: `2px solid ${ORANGE}`, borderRadius: "50%", animation: "spin .8s linear infinite" }} />
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10, overflowX: "auto", marginLeft: -20, paddingLeft: 20, paddingRight: 20 }}>
          {items.map(s => (
            <div key={s.tmdbId} onClick={() => onOpen(s)} style={{ flexShrink: 0, width: 90, cursor: "pointer" }}>
              <div style={{ width: 90, height: 135, borderRadius: 10, overflow: "hidden", background: "#141414", marginBottom: 6 }}>
                {s.poster
                  ? <img src={s.poster} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>📺</div>
                }
              </div>
              <div style={{ fontSize: 10, color: "#888", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{s.title}</div>
              <div style={{ fontSize: 10, color: ORANGE, marginTop: 2 }}>★ {s.rating}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ─── BADGES ───────────────────────────────────────────────────────────────────

const ALL_BADGES = [
  // 📺 Visionnage
  { id:"premiers_pas",      cat:"Visionnage", icon:"▶️",  name:"Premiers pas",         desc:"Regarder son premier épisode",                    color:"#6b8fa3" },
  { id:"accro",             cat:"Visionnage", icon:"📡",  name:"Accro aux séries",     desc:"Regarder 50 épisodes",                            color:"#6b8fa3" },
  { id:"seriphile",         cat:"Visionnage", icon:"📺",  name:"Sériphile",            desc:"Regarder 100 épisodes",                           color:"#6b8fa3" },
  { id:"binge_master",      cat:"Visionnage", icon:"🎞️",  name:"Binge Master",         desc:"Regarder 200 épisodes",                           color:"#8fa36b" },
  { id:"marathonien",       cat:"Visionnage", icon:"⏱️",  name:"Marathonien",          desc:"Regarder 500 épisodes",                           color:"#8fa36b" },
  { id:"legende_canape",    cat:"Visionnage", icon:"🍿",  name:"Légende du canapé",    desc:"Regarder 1000 épisodes",                          color:"#c2a84b" },
  { id:"oiseau_nuit",       cat:"Visionnage", icon:"🌙",  name:"Oiseau de nuit",       desc:"Regarder un épisode après minuit",                color:"#5b6fa3" },
  { id:"leve_tot",          cat:"Visionnage", icon:"🌅",  name:"Lève-tôt",             desc:"Regarder un épisode entre 4h et 6h",              color:"#c2a84b" },
  { id:"speedrunner",       cat:"Visionnage", icon:"🏃",  name:"Speedrunner",          desc:"Terminer une série en moins de 24h",              color:"#a36b6b" },
  { id:"adieu",             cat:"Visionnage", icon:"🌧️",  name:"Adieu",                desc:"Terminer une série de plus de 100 épisodes",       color:"#5b6fa3" },
  { id:"sprinteur",         cat:"Visionnage", icon:"💨",  name:"Sprinteur",            desc:"Regarder 10 épisodes dans la même journée",       color:"#a36b6b" },
  { id:"weekend",           cat:"Visionnage", icon:"🏠",  name:"Week-end Marathon",    desc:"Regarder au moins 15 épisodes entre vendredi et dimanche",     color:"#8fa36b" },
  { id:"insomniaque",       cat:"Visionnage", icon:"😴",  name:"Insomniaque",          desc:"Regarder des épisodes 7 nuits consécutives",                   color:"#5b6fa3" },
  { id:"session_canap",     cat:"Visionnage", icon:"⏰",  name:"Session canapé",       desc:"Regarder des épisodes pendant 5 heures cumulées dans une journée",              color:"#6b8fa3" },

  // ⭐ Notation
  { id:"premiere_opinion",  cat:"Notation",   icon:"⭐",  name:"Première opinion",     desc:"1 note donnée",                                   color:"#c2a84b" },
  { id:"coup_coeur",        cat:"Notation",   icon:"💛",  name:"Coup de cœur",         desc:"Donner 5 étoiles à 20 séries",                    color:"#a36b8a" },
  { id:"pepite_cachee",     cat:"Notation",   icon:"💎",  name:"Pépite cachée",        desc:"5 étoiles à une série peu populaire",             color:"#6b8fa3" },
  { id:"sans_pitie",        cat:"Notation",   icon:"💉",  name:"Sans pitié",           desc:"Donner 1 étoile à 10 séries",                    color:"#a36b6b" },
  { id:"sévère",            cat:"Notation",   icon:"💣",  name:"Critique sévère",      desc:"Avoir une moyenne de notes inférieur a 2,5 étoiles",  color:"#a36b6b" },
  { id:"equilibre",         cat:"Notation",   icon:"⚖️",  name:"Équilibré",            desc:"Utiliser toutes les notes de 0,5 à 5 étoiles",    color:"#6ba38a" },
  { id:"gout_luxe",         cat:"Notation",   icon:"👑",  name:"Goût de luxe",         desc:"Moyenne de notes supérieure à 4 étoiles",         color:"#c2a84b" },
  { id:"mauvais_gout",      cat:"Notation",   icon:"🎭",  name:"Mauvais goût assumé",  desc:"5 étoiles à une série notée < 2 étoiles",         color:"#8a6ba3" },
  { id:"pourquoi",          cat:"Notation",   icon:"🌡️",  name:"Pourquoi ?",           desc:"Continuer une série après lui avoir mis 1 étoile", color:"#a38a6b" },
  { id:"fond_trou",         cat:"Notation",   icon:"💧",  name:"Au fond du trou",      desc:"5 étoiles à 10 drames",                           color:"#6b7aa3" },

  // ✍️ Critiques
  { id:"premier_mot",       cat:"Critiques",  icon:"✏️",  name:"Premier mot",          desc:"Publier une première critique",                   color:"#6ba38a" },
  { id:"critique_herbe",    cat:"Critiques",  icon:"🌱",  name:"Critique en herbe",    desc:"10 critiques publiées",                           color:"#6ba38a" },
  { id:"chroniqueur",       cat:"Critiques",  icon:"📝",  name:"Chroniqueur",          desc:"25 critiques publiées",                           color:"#6ba38a" },
  { id:"plume_aceree",      cat:"Critiques",  icon:"✒️",  name:"Plume acérée",         desc:"50 critiques publiées",                           color:"#8fa36b" },
  { id:"journaliste",       cat:"Critiques",  icon:"📰",  name:"Journaliste",          desc:"100 critiques publiées",                          color:"#8fa36b" },
  { id:"cineaste",          cat:"Critiques",  icon:"🎬",  name:"Cinéaste du dimanche", desc:"200 critiques publiées",                          color:"#c2a84b" },
  { id:"critique_pop",      cat:"Critiques",  icon:"👏",  name:"Critique populaire",   desc:"Recevoir 50 likes sur une critique",              color:"#a36b8a" },
  { id:"influenceur",       cat:"Critiques",  icon:"📣",  name:"Influenceur",          desc:"Recevoir 500 likes cumulés",                      color:"#a36b8a" },
  { id:"roman",             cat:"Critiques",  icon:"📖",  name:"Roman",                desc:"Publier une critique de plus de 1000 caractères", color:"#6b7aa3" },
  { id:"concis",            cat:"Critiques",  icon:"💬",  name:"Concis mais efficace", desc:"20 likes sur une critique de moins de 100 chars", color:"#6b8fa3" },
  { id:"spoiler",           cat:"Critiques",  icon:"⛔",  name:"Spoiler",              desc:"Commenter un épisode dans l'heure de sa sortie",  color:"#a38a6b" },

  // 🎭 Genres
  { id:"curieux",           cat:"Genres",     icon:"🔍",  name:"Curieux",              desc:"5 genres différents regardés",                    color:"#8a6ba3" },
  { id:"explorateur",       cat:"Genres",     icon:"🧭",  name:"Explorateur",          desc:"10 genres différents",                            color:"#8a6ba3" },
  { id:"cameleon",          cat:"Genres",     icon:"🦎",  name:"Caméléon",             desc:"15 genres différents",                            color:"#6ba38a" },
  { id:"omnivore",          cat:"Genres",     icon:"🌐",  name:"Omnivore",             desc:"Tous les genres vus au moins 1 fois",             color:"#c2a84b" },
  { id:"galactique",        cat:"Genres",     icon:"🌌",  name:"Galactique",           desc:"20 séries dans 10 genres différents",             color:"#5b6fa3" },
  { id:"fan_crime",         cat:"Genres",     icon:"🔪",  name:"Fan de crime",         desc:"50 épisodes de Crime",                            color:"#a36b6b" },
  { id:"profiler",          cat:"Genres",     icon:"🕵",  name:"Profiler",             desc:"10 séries Crime terminées",                       color:"#a36b6b" },
  { id:"spatial",           cat:"Genres",     icon:"🚀",  name:"Explorateur spatial",  desc:"50 épisodes de Science-Fiction",                  color:"#5b6fa3" },
  { id:"seul_mars",         cat:"Genres",     icon:"👽",  name:"Seul sur Mars",        desc:"10 séries Sci-Fi terminées",                      color:"#5b6fa3" },
  { id:"clown",             cat:"Genres",     icon:"🤡",  name:"Clown",                desc:"10 comédies terminées",                           color:"#c2a84b" },
  { id:"detective",         cat:"Genres",     icon:"🔎",  name:"Détective privé",      desc:"50 épisodes de Thriller/Policier",                color:"#6b7aa3" },
  { id:"briseur",           cat:"Genres",     icon:"💔",  name:"Briseur de cœurs",     desc:"10 séries Drame terminées",                       color:"#a36b8a" },
  { id:"ghostbuster",       cat:"Genres",     icon:"👻",  name:"Ghostbuster",          desc:"10 séries Horreur terminées",                     color:"#6b8fa3" },
  { id:"lover",             cat:"Genres",     icon:"💗",  name:"Lover",                desc:"10 séries Romance terminées",                     color:"#a36b8a" },
  { id:"bagarreur",         cat:"Genres",     icon:"🥊",  name:"Bagarreur",            desc:"10 séries Action terminées",                      color:"#a36b6b" },
  { id:"Magicien",          cat:"Genres",     icon:"🐉",  name:"Magicien",             desc:"50 épisodes de Fantasy",                          color:"#8a6ba3" },
  { id:"chirurgien",        cat:"Genres",     icon:"🩺",  name:"Chirurgien",           desc:"5 séries Médicales terminées",                    color:"#6ba38a" },
  { id:"historien",         cat:"Genres",     icon:"📜",  name:"Historien",            desc:"10 séries Historiques terminées",                 color:"#a38a6b" },
  { id:"aventurier",        cat:"Genres",     icon:"✈️",  name:"l'Aventurier",         desc:"Séries de 10 pays différents",                    color:"#6ba38a" },
  { id:"globe_trotter",     cat:"Genres",     icon:"🌐",  name:"Globe-trotter",        desc:"Regarder une série provenant de 20 pays différents",color:"#6ba38a" },

  // 📚 Bibliothèque
  { id:"partez",            cat:"Bibliothèque", icon:"🚀", name:"Partez !",            desc:"Ajouter la première série à la Library",          color:"#6b8fa3" },
  { id:"collectionneur",    cat:"Bibliothèque", icon:"📦", name:"Collectionneur",      desc:"10 séries dans la library",                       color:"#6b8fa3" },
  { id:"bibliothecaire",    cat:"Bibliothèque", icon:"📚", name:"Bibliothécaire",      desc:"50 séries dans la library",                       color:"#6b8fa3" },
  { id:"archiviste",        cat:"Bibliothèque", icon:"📎", name:"Archiviste",           desc:"100 séries dans la library",                      color:"#8fa36b" },
  { id:"conservateur",      cat:"Bibliothèque", icon:"🧠", name:"Conservateur",        desc:"200 séries dans la library",                      color:"#c2a84b" },
  { id:"watchlist_nais",    cat:"Bibliothèque", icon:"🔖", name:"Watchlist naissante", desc:"10 séries en watchlist",                          color:"#6b7aa3" },
  { id:"liste_100",         cat:"Bibliothèque", icon:"💯", name:"Liste 100 fins",      desc:"100 séries en watchlist",                         color:"#6b7aa3" },
  { id:"collection_sec",    cat:"Bibliothèque", icon:"🔐", name:"Collection secrète",  desc:"10 listes personnalisées créées",                 color:"#8a6ba3" },
  { id:"curateur",          cat:"Bibliothèque", icon:"🎨", name:"Curateur",            desc:"Une liste ayant reçu 25 likes",                   color:"#a36b8a" },
  { id:"organise",          cat:"Bibliothèque", icon:"📋", name:"Organisé",            desc:"Toutes les séries de sa watchlist dans des listes", color:"#6ba38a" },

  // ✅ Complétion
  { id:"bienvenue",         cat:"Complétion",  icon:"👋",  name:"Bienvenue",            desc:"Compléter son profil",                            color:"#6ba38a" },
  { id:"jusqu_bout",        cat:"Complétion",  icon:"✔️",  name:"Jusqu'au bout",        desc:"1 série terminée entièrement",                    color:"#6ba38a" },
  { id:"finisseur",         cat:"Complétion",  icon:"🏁",  name:"Finisseur",            desc:"Terminer 10 séries différentes",                  color:"#6ba38a" },
  { id:"sans_repit",        cat:"Complétion",  icon:"🏴",  name:"Sans répit",           desc:"Terminer 25 séries différentes",                  color:"#8fa36b" },
  { id:"papillonneur",      cat:"Complétion",  icon:"🦋",  name:"Le Papillonneur",      desc:"Terminer 50 séries différentes",                  color:"#8fa36b" },
  { id:"collec_fins",       cat:"Complétion",  icon:"🏆",  name:"Collectionneur de fins",desc:"Terminer 100 séries différentes",                color:"#c2a84b" },
  { id:"cent_pourcent",     cat:"Complétion",  icon:"💯",  name:"100%",                 desc:"Toutes les séries de sa bibliothèque terminées",  color:"#c2a84b" },
  { id:"legende",           cat:"Complétion",  icon:"👑",  name:"Légende",              desc:"1000 heures de visionnage cumulées",              color:"#c2a84b" },
  { id:"un_pourcent",       cat:"Complétion",  icon:"🥇",  name:"1%",                   desc:"Badge détenu par moins de 1% des membres",        color:"#8a6ba3" },

  // 💬 Social
  { id:"enchante",          cat:"Social",      icon:"🤝",  name:"Enchanté",             desc:"Avoir 1 ami",                                     color:"#6b8fa3" },
  { id:"reseau",            cat:"Social",      icon:"🌐",  name:"Réseau",               desc:"Suivre 25 membres",                               color:"#6b8fa3" },
  { id:"cercle",            cat:"Social",      icon:"👥",  name:"Cercle de confiance",  desc:"Avoir 10 amis",                                   color:"#6b8fa3" },
  { id:"populaire",         cat:"Social",      icon:"📈",  name:"Populaire",            desc:"Avoir 50 abonnés",                                color:"#8fa36b" },
  { id:"diva",              cat:"Social",      icon:"👸",  name:"Diva",                 desc:"Avoir 100 abonnés",                               color:"#a36b8a" },
  { id:"rok_star",          cat:"Social",      icon:"🎸",  name:"Rok Star",             desc:"Avoir 200 abonnés",                               color:"#a36b6b" },
  { id:"fan",               cat:"Social",      icon:"👍",  name:"Fan",                  desc:"10 likes donnés",                                 color:"#6b8fa3" },
  { id:"ambassadeur",       cat:"Social",      icon:"📣",  name:"Ambassadeur",          desc:"25 likes donnés",                                 color:"#6ba38a" },
  { id:"premier_echange",   cat:"Social",      icon:"💬",  name:"Premier échange",      desc:"Commenter une critique",                          color:"#6b7aa3" },
  { id:"debatteur",         cat:"Social",      icon:"⚡",  name:"Débatteur",            desc:"Commenter 50 critiques",                          color:"#6b7aa3" },
  { id:"prem_interaction",  cat:"Social",      icon:"💚",  name:"Première interaction", desc:"Liker une critique",                              color:"#a36b8a" },

  // 🎯 Spéciaux
  { id:"noctambule",        cat:"Spéciaux",    icon:"🦇",  name:"Noctambule",           desc:"Activité entre minuit et 5h",                     color:"#5b6fa3" },
  { id:"en_bonne_voie",     cat:"Spéciaux",    icon:"🔥",  name:"En bonne voie",        desc:"7 jours consécutifs d'activité",                  color:"#a38a6b" },
  { id:"bonne_reso",        cat:"Spéciaux",    icon:"📅",  name:"Bonne résolution",     desc:"30 jours consécutifs d'activité",                 color:"#a38a6b" },
  { id:"inarretable",       cat:"Spéciaux",    icon:"⚡",  name:"Inarrêtable",          desc:"100 jours consécutifs d'activité",                color:"#c2a84b" },
  { id:"inépuisable",       cat:"Spéciaux",    icon:"💥",  name:"Inépuisable",          desc:"365 jours consécutifs d'activité",                color:"#c2a84b" },
  { id:"fidele",            cat:"Spéciaux",    icon:"📌",  name:"Fidèle",               desc:"Compte créé depuis plus de 30 jours",             color:"#6ba38a" },
  { id:"ancien",            cat:"Spéciaux",    icon:"🎂",  name:"Ancien",               desc:"Membre depuis 1 an",                              color:"#8fa36b" },
  { id:"veteran",           cat:"Spéciaux",    icon:"🏅",  name:"Vétéran",              desc:"Membre depuis 3 ans",                             color:"#c2a84b" },
  { id:"precurseur",        cat:"Spéciaux",    icon:"🌟",  name:"Précurseur",           desc:"Compte créé durant la première année",            color:"#8a6ba3" },
  { id:"survivant",         cat:"Spéciaux",    icon:"💀",  name:"Survivant",            desc:"Terminer 10 séries annulées",                     color:"#a36b6b" },
  { id:"parieur",           cat:"Spéciaux",    icon:"🎲",  name:"Parieur",              desc:"Suivre une série avec < 100 utilisateurs",        color:"#8a6ba3" },
  { id:"testeur",           cat:"Spéciaux",    icon:"🧪",  name:"Testeur pilote",       desc:"Regarder le 1er épisode de 20 séries différentes",  color:"#6b7aa3" },
  { id:"nostalgique",       cat:"Spéciaux",    icon:"🔁",  name:"Nostalgique",          desc:"Revoir 5 séries déjà terminées",                    color:"#6ba38a" },
  { id:"mauvaise_dec",      cat:"Spéciaux",    icon:"🤦",  name:"Mauvaise décision",    desc:"Commencer 50 séries sans en finir une",           color:"#a38a6b" },
  { id:"abandon",           cat:"Spéciaux",    icon:"🚪",  name:"Abandon rapide",       desc:"Arrêter une série après un seul épisode",         color:"#a36b6b" },
  { id:"rewatch",           cat:"Spéciaux",    icon:"🔄",  name:"Rewatch Master",       desc:"Revoir entièrement une série déjà terminée",      color:"#8a6ba3" },
  { id:"printemps",         cat:"Spéciaux",    icon:"🌷",  name:"Printemps des séries", desc:"Regarder au moins une série pendant chaque saison de l'année",          color:"#8fa36b" },
  { id:"automne",           cat:"Spéciaux",    icon:"🍂",  name:"Marathon d'automne",   desc:"Regarder 50 épisodes entre septembre et novembre",     color:"#5b6fa3" },
  { id:"hibernation",       cat:"Spéciaux",    icon:"❄️",  name:"Hibernation",          desc:"Regarder une saison complète en une journée d'hiver",  color:"#6b8fa3" },
  { id:"derniere_min",      cat:"Spéciaux",    icon:"⌚",  name:"Dernière minute",      desc:"Finir une saison le jour de la sortie de la suivante", color:"#a38a6b" },
  { id:"noel",              cat:"Spéciaux",    icon:"🎄",  name:"Noël en série",        desc:"Regarder un épisode le 25 décembre",              color:"#a36b6b" },
  { id:"halloween",         cat:"Spéciaux",    icon:"🎃",  name:"Halloween",            desc:"Regarder 5 épisodes d'horreur en octobre",        color:"#a36b6b" },
  { id:"st_valentin",       cat:"Spéciaux",    icon:"💝",  name:"Saint-Valentin",       desc:"Regarder une romance le 14 février",              color:"#a36b8a" },
  { id:"summer",            cat:"Spéciaux",    icon:"☀️",  name:"Summer Binge",         desc:"100 épisodes vus pendant l'été",                  color:"#c2a84b" },

  // 🔒 Secrets
  { id:"oeuf_paques",    cat:"Secrets", icon:"?", name:"Œuf de Pâques",      desc:"Cliquer 100 fois sur le même poster",                              color:"#7a8a6b", secret:true },
  { id:"encore_reveillé",cat:"Secrets", icon:"?", name:"Encore reveillé ?",  desc:"Regarder un épisode entre 4h et 5h du matin",                      color:"#5b6fa3", secret:true },
  { id:"boucle_inf",     cat:"Secrets", icon:"?", name:"Boucle infinie",     desc:"Revoir trois fois la même série",                                  color:"#8a6ba3", secret:true },
  { id:"amour_eternel",  cat:"Secrets", icon:"?", name:"Amour éternel",      desc:"Mettre 5 étoiles à toutes les saisons d'une série",                color:"#a36b8a", secret:true },
  { id:"couch_potato",   cat:"Secrets", icon:"?", name:"Couch Potato",       desc:"Regarder 20 épisodes en une seule journée",                        color:"#8fa36b", secret:true },
  { id:"call_911",       cat:"Secrets", icon:"?", name:"Call 911",           desc:"Regarder 50 épisodes en 48h",                                      color:"#a36b6b", secret:true },
  { id:"batman",         cat:"Secrets", icon:"?", name:"Batman",             desc:"Regarder un épisode entre 3h00 et 5h00 du matin (lun-jeu)",        color:"#5b6fa3", secret:true },
  { id:"indecis",        cat:"Secrets", icon:"?", name:"Indécis",            desc:"Commencer 20 séries sans en terminer aucune",                      color:"#a38a6b", secret:true },
  { id:"i_did_it",       cat:"Secrets", icon:"?", name:"I did it!",          desc:"Terminer une série notée 1 étoile ou moins",                       color:"#6ba38a", secret:true },
  { id:"guilty_pleasure",cat:"Secrets", icon:"?", name:"Guilty Pleasure",    desc:"5 étoiles à une série dont la note communautaire est < 2 étoiles", color:"#a36b8a", secret:true },
  { id:"le_fidele",      cat:"Secrets", icon:"?", name:"Le fidèle",          desc:"Plus de 50% du temps de visionnage sur une seule série",           color:"#c2a84b", secret:true },
  { id:"le_puriste",     cat:"Secrets", icon:"?", name:"Le Puriste",         desc:"Terminer 20 séries sans jamais en abandonner une",                 color:"#a38a6b", secret:true },
];

const BADGE_CATEGORIES = ["Tous", "Visionnage", "Notation", "Critiques", "Genres", "Bibliothèque", "Complétion", "Social", "Spéciaux", "Secrets"];

// Hexagone SVG
function HexBadge({ badge, unlocked = false, size = 56 }) {
  const w = size, h = size * 1.15;
  const cx = w / 2, cy = h / 2;
  const r = w * 0.46;
  const pts = Array.from({length: 6}, (_, i) => {
    const a = Math.PI / 180 * (60 * i - 30);
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(" ");
  const innerR = r * 0.82;
  const innerPts = Array.from({length: 6}, (_, i) => {
    const a = Math.PI / 180 * (60 * i - 30);
    return `${cx + innerR * Math.cos(a)},${cy + innerR * Math.sin(a)}`;
  }).join(" ");

  const isSecret = badge.secret && !unlocked;
  const col = unlocked ? badge.color : (isSecret ? "#1e1e1e" : "#2a2a2a");
  const bg  = unlocked ? `${badge.color}22` : (isSecret ? "#444444" : "#141414");
  const iconColor = unlocked ? badge.color : (isSecret ? "#252525" : "#333");
  const displayIcon = isSecret ? "?" : badge.icon;
  const displayFontSize = isSecret ? size * 0.28 : size * 0.32;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <polygon points={pts} fill={bg} stroke={col} strokeWidth={unlocked ? 1.5 : (isSecret ? 0.8 : 1)} strokeDasharray={isSecret ? "3 2" : "none"} />
      <polygon points={innerPts} fill="none" stroke={col} strokeWidth={0.5} strokeOpacity={unlocked ? 0.35 : 0.08} />
      <text x={cx} y={cy + size * 0.12} textAnchor="middle" fontSize={displayFontSize} fill={iconColor} fontWeight={isSecret ? "700" : "normal"} style={{ userSelect: "none" }}>{displayIcon}</text>
    </svg>
  );
}

// ─── BADGES PAGE ──────────────────────────────────────────────────────────────
function BadgesPage({ unlockedBadgeIds = [], pinnedBadgeIds = [], onPin, onUnpin }) {
  const [activeCat, setActiveCat] = useState("Tous");
  const [selectedBadge, setSelectedBadge] = useState(null);

  const visible = activeCat === "Tous"
    ? ALL_BADGES
    : ALL_BADGES.filter(b => b.cat === activeCat);

  const unlocked = visible.filter(b => unlockedBadgeIds.includes(b.id));
  const locked   = visible.filter(b => !unlockedBadgeIds.includes(b.id));

  return (
    <div ref={el => el && el.scrollTo(0,0)} style={{ position: "fixed", inset: 0, background: "#080808", zIndex: 900, overflowY: "auto", paddingBottom: 100, maxWidth: 440, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ padding: "52px 20px 16px" }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif" }}>Badges</div>
        <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{unlockedBadgeIds.length} / {ALL_BADGES.length} débloqués</div>
        {/* Progress bar */}
        <div style={{ marginTop: 10, height: 3, background: "#1a1a1a", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(unlockedBadgeIds.length / ALL_BADGES.length) * 100}%`, background: ORANGE, borderRadius: 4, transition: "width .6s ease" }} />
        </div>
      </div>

      {/* Pinned slots */}
      <div style={{ padding: "0 20px 20px", borderBottom: "1px solid #111" }}>
        <div style={{ fontSize: 12, color: "#555", marginBottom: 12, textTransform: "uppercase", letterSpacing: ".06em", fontSize: 10 }}>Badges sur le profil (4 max)</div>
        <div style={{ display: "flex", gap: 12 }}>
          {[0,1,2,3].map(i => {
            const bid = pinnedBadgeIds[i];
            const badge = bid ? ALL_BADGES.find(b => b.id === bid) : null;
            return (
              <div key={i} onClick={() => badge && onUnpin(bid)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: badge ? "pointer" : "default" }}>
                {badge
                  ? <HexBadge badge={badge} unlocked size={44} />
                  : <svg width={44} height={50} viewBox="0 0 44 50">
                      <polygon points="22,2 42,12 42,38 22,48 2,38 2,12" fill="#0e0e0e" stroke="#1e1e1e" strokeWidth="1" strokeDasharray="3 2"/>
                      <text x="22" y="30" textAnchor="middle" fontSize="14" fill="#2a2a2a">+</text>
                    </svg>
                }
                {badge && <span style={{ fontSize: 8, color: "#444", textAlign: "center", lineHeight: 1.2 }}>Retirer</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Category filter */}
      <div style={{ display: "flex", gap: 8, padding: "16px 20px", overflowX: "auto" }}>
        {BADGE_CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setActiveCat(cat)} style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 20, background: activeCat === cat ? ORANGE_DIM : "#111", border: `1px solid ${activeCat === cat ? ORANGE_BORDER : "#1e1e1e"}`, color: activeCat === cat ? ORANGE : "#666", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
            {cat}
          </button>
        ))}
      </div>

      {/* Unlocked */}
      {unlocked.length > 0 && (
        <div style={{ padding: "0 20px 8px" }}>
          <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 16 }}>Débloqués — {unlocked.length}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            {unlocked.map(badge => (
              <div key={badge.id} onClick={() => setSelectedBadge(badge)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, cursor: "pointer" }}>
                <HexBadge badge={badge} unlocked size={56} />
                <span style={{ fontSize: 10, color: "#ccc", textAlign: "center", lineHeight: 1.3, fontWeight: 500 }}>{badge.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Locked */}
      {locked.length > 0 && (
        <div style={{ padding: "24px 20px 8px" }}>
          <div style={{ fontSize: 10, color: "#333", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 16 }}>À débloquer — {locked.length}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            {locked.map(badge => (
              <div key={badge.id} onClick={() => !badge.secret && setSelectedBadge(badge)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, cursor: badge.secret ? "default" : "pointer", opacity: badge.secret ? 0.35 : 0.5 }}>
                <HexBadge badge={badge} unlocked={false} size={56} />
                <span style={{ fontSize: 10, color: badge.secret ? "#252525" : "#444", textAlign: "center", lineHeight: 1.3 }}>{badge.secret ? "???" : badge.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Badge detail modal */}
      {selectedBadge && (() => {
        const isUnlocked = unlockedBadgeIds.includes(selectedBadge.id);
        const isPinned   = pinnedBadgeIds.includes(selectedBadge.id);
        const canPin     = isUnlocked && !isPinned && pinnedBadgeIds.length < 4;
        return (
          <div onClick={() => setSelectedBadge(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", backdropFilter: "blur(6px)", zIndex: 1100, display: "flex", alignItems: "flex-end", justifyContent: "center", maxWidth: 440, margin: "0 auto" }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#0e0e0e", borderRadius: "20px 20px 0 0", padding: "20px 24px 110px", width: "100%", border: "1px solid #1e1e1e", borderBottom: "none" }}>
              <div style={{ width: 36, height: 3, background: "#2a2a2a", borderRadius: 2, margin: "0 auto 20px" }} />
              <div style={{ display: "flex", gap: 20, alignItems: "center", marginBottom: 16 }}>
                <HexBadge badge={selectedBadge} unlocked={isUnlocked} size={70} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: isUnlocked ? "#fff" : "#444", fontFamily: "'Playfair Display',Georgia,serif" }}>
                    {!isUnlocked && selectedBadge.secret ? "Badge secret" : selectedBadge.name}
                  </div>
                  <div style={{ fontSize: 12, color: "#444", marginTop: 4 }}>{selectedBadge.cat}</div>
                  <div style={{ fontSize: 13, color: "#666", marginTop: 6, lineHeight: 1.5 }}>
                    {!isUnlocked && selectedBadge.secret
                      ? "Ce badge est secret. Découvre comment le débloquer par toi-même... 🔒"
                      : selectedBadge.desc}
                  </div>
                </div>
              </div>
              {isUnlocked && (
                <button onClick={() => { isPinned ? onUnpin(selectedBadge.id) : canPin && onPin(selectedBadge.id); setSelectedBadge(null); }}
                  disabled={!isPinned && !canPin}
                  style={{ width: "100%", padding: "13px", borderRadius: 14, background: isPinned ? "#1a1a1a" : (canPin ? ORANGE_DIM : "#111"), border: `1px solid ${isPinned ? "#2a2a2a" : (canPin ? ORANGE_BORDER : "#1a1a1a")}`, color: isPinned ? "#888" : (canPin ? ORANGE : "#333"), fontSize: 14, fontWeight: 600, cursor: (isPinned || canPin) ? "pointer" : "default" }}>
                  {isPinned ? "Retirer du profil" : canPin ? "Épingler sur le profil" : "4 badges déjà épinglés"}
                </button>
              )}
              {!isUnlocked && (
                <div style={{ background: "#111", borderRadius: 14, padding: "13px", textAlign: "center", border: "1px solid #1a1a1a" }}>
                  <span style={{ color: "#444", fontSize: 13 }}>🔒 Badge non débloqué</span>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}


// ─── REVIEWS PAGE ─────────────────────────────────────────────────────────────
function ReviewsPage({ extraReviews, library, openSeries, onDeleteReview, onAskConfirm }) {
  // Flatten all reviews written by the user (user field check) into a list
  const allReviews = [];
  Object.entries(extraReviews).forEach(([tmdbId, reviews]) => {
    const series = library.find(s => String(s.tmdbId) === String(tmdbId));
    reviews.forEach(r => {
      allReviews.push({ ...r, tmdbId: parseInt(tmdbId), series });
    });
  });
  allReviews.sort((a, b) => (b.id || 0) - (a.id || 0));

  return (
    <div ref={el => el && el.scrollTo(0,0)} style={{ position: "fixed", inset: 0, background: "#080808", zIndex: 900, overflowY: "auto", paddingBottom: 100, maxWidth: 440, margin: "0 auto" }}>
      <div style={{ padding: "52px 20px 20px" }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif" }}>Reviews</div>
        <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{allReviews.length} critique{allReviews.length !== 1 ? "s" : ""} publiée{allReviews.length !== 1 ? "s" : ""}</div>
      </div>

      {allReviews.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 20px" }}>
          <div style={{ fontSize: 36, marginBottom: 16, opacity: .3 }}>✎</div>
          <div style={{ color: "#333", fontSize: 14 }}>Aucune critique publiée</div>
          <div style={{ color: "#2a2a2a", fontSize: 12, marginTop: 8 }}>Ouvre une fiche série et partage ton avis</div>
        </div>
      ) : (
        <div style={{ padding: "0 20px" }}>
          {allReviews.map((r, i) => (
            <div key={r.id || i} style={{ marginBottom: 16, background: "#0d0d0d", border: "1px solid #191919", borderRadius: 16, overflow: "hidden" }}>
              {/* Series header */}
              {r.series && (
                <div onClick={() => openSeries(r.series)} style={{ display: "flex", gap: 12, padding: "12px 14px", borderBottom: "1px solid #111", cursor: "pointer", alignItems: "center" }}>
                  <div style={{ width: 36, height: 54, borderRadius: 6, overflow: "hidden", background: "#1a1a1a", flexShrink: 0 }}>
                    {r.series.poster && <img src={r.series.poster} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "#fff", fontWeight: 600, fontSize: 13, fontFamily: "'Playfair Display',Georgia,serif" }}>{r.series.title}</div>
                    <div style={{ color: "#555", fontSize: 11, marginTop: 2 }}>{r.series.year} · {r.series.genre}</div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
              )}
              {/* Review body */}
              <div style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <StarRating value={r.rating} size={13} />
                  <span style={{ fontSize: 11, color: "#444" }}>{r.date}</span>
                </div>
                <div style={{ color: "#ccc", fontSize: 13, lineHeight: 1.6 }}>{r.text}</div>
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: r.likes > 0 ? ORANGE : "#444" }}>♥ {r.likes} j'aime</span>
                  <button onClick={() => onAskConfirm("Supprimer cette critique définitivement ?", () => onDeleteReview(r.tmdbId, r.id || i))} style={{ background: "none", border: "none", color: "#333", cursor: "pointer", fontSize: 12, padding: "2px 6px" }}>🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── TAGS PAGE ────────────────────────────────────────────────────────────────
function TagsPage({ library, tags, onAddTag, onRemoveTag, onAskConfirm, openSeries }) {
  const [newTag, setNewTag] = useState("");
  const [activeTag, setActiveTag] = useState(null);
  const [taggingSeries, setTaggingSeries] = useState(null); // series being tagged

  // All unique tags across all series
  const allTags = [...new Set(Object.values(tags).flat())].sort();

  // Series filtered by active tag
  const filteredSeries = activeTag
    ? library.filter(s => (tags[s.tmdbId] || []).includes(activeTag))
    : [];

  const handleAddTag = (tmdbId, tag) => {
    const t = tag.trim().toLowerCase().replace(/\s+/g, "-");
    if (!t || t.length > 20) return;
    const existing = tags[tmdbId] || [];
    if (existing.includes(t)) return;
    onAddTag(tmdbId, t);
  };

  const SUGGESTED = ["à-revoir", "cozy", "culte", "chef-d'œuvre", "overrated", "underrated", "feelgood", "intense", "lent", "drôle", "triste", "effrayant", "addictif", "décevant"];

  return (
    <div ref={el => el && el.scrollTo(0,0)} style={{ position: "fixed", inset: 0, background: "#080808", zIndex: 900, overflowY: "auto", paddingBottom: 100, maxWidth: 440, margin: "0 auto" }}>
      <div style={{ padding: "52px 20px 20px" }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif" }}>Tags</div>
        <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{allTags.length} tag{allTags.length !== 1 ? "s" : ""} créé{allTags.length !== 1 ? "s" : ""}</div>
      </div>

      {/* All tags cloud */}
      {allTags.length > 0 && (
        <div style={{ padding: "0 20px 20px", borderBottom: "1px solid #111" }}>
          <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 12 }}>Tes tags</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {allTags.map(tag => {
              const count = library.filter(s => (tags[s.tmdbId] || []).includes(tag)).length;
              const isActive = activeTag === tag;
              return (
                <button key={tag} onClick={() => setActiveTag(isActive ? null : tag)} style={{ padding: "6px 12px", borderRadius: 20, background: isActive ? ORANGE_DIM : "#111", border: `1px solid ${isActive ? ORANGE_BORDER : "#222"}`, color: isActive ? ORANGE : "#888", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                  <span>#</span>{tag}
                  <span style={{ background: isActive ? ORANGE_BORDER : "#1e1e1e", color: isActive ? ORANGE : "#555", borderRadius: 10, padding: "1px 6px", fontSize: 10 }}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Filtered series by tag */}
      {activeTag && (
        <div style={{ padding: "16px 20px" }}>
          <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 14 }}>#{activeTag} — {filteredSeries.length} série{filteredSeries.length !== 1 ? "s" : ""}</div>
          {filteredSeries.map(s => (
            <div key={s.tmdbId} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: "1px solid #0e0e0e", alignItems: "center" }}>
              <div onClick={() => openSeries(s)} style={{ display: "flex", gap: 12, flex: 1, alignItems: "center", cursor: "pointer" }}>
                <div style={{ width: 44, height: 66, borderRadius: 8, overflow: "hidden", background: "#1a1a1a", flexShrink: 0 }}>
                  {s.poster && <img src={s.poster} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#fff", fontWeight: 600, fontSize: 13, fontFamily: "'Playfair Display',Georgia,serif" }}>{s.title}</div>
                  <div style={{ color: "#555", fontSize: 11, marginTop: 3 }}>{s.year} · {s.genre}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
                    {(tags[s.tmdbId] || []).map(tag => (
                      <span key={tag} style={{ background: "#111", border: "1px solid #222", color: "#666", fontSize: 10, padding: "2px 7px", borderRadius: 10 }}>#{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
              <button onClick={() => onAskConfirm(`Retirer le tag #${activeTag} de "${s.title}" ?`, () => onRemoveTag(s.tmdbId, activeTag))} style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: 16, padding: "4px 6px" }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* Tag a series section */}
      <div style={{ padding: "20px 20px 0", borderTop: allTags.length > 0 ? "1px solid #111" : "none" }}>
        <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 14 }}>Tagger une série</div>

        {/* Series picker */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "#777", marginBottom: 8 }}>Choisir une série :</div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
            {library.filter(s => s.watched || s.inWatchlist).slice(0, 12).map(s => (
              <div key={s.tmdbId} onClick={() => setTaggingSeries(taggingSeries?.tmdbId === s.tmdbId ? null : s)} style={{ flexShrink: 0, width: 56, cursor: "pointer" }}>
                <div style={{ width: 56, height: 84, borderRadius: 8, overflow: "hidden", background: "#1a1a1a", border: `2px solid ${taggingSeries?.tmdbId === s.tmdbId ? ORANGE : "transparent"}`, transition: "border-color .15s" }}>
                  {s.poster && <img src={s.poster} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                </div>
                <div style={{ fontSize: 9, color: taggingSeries?.tmdbId === s.tmdbId ? ORANGE : "#555", marginTop: 4, textAlign: "center", lineHeight: 1.2, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{s.title}</div>
              </div>
            ))}
          </div>
        </div>

        {taggingSeries && (
          <div style={{ background: "#0c0c0c", border: "1px solid #1a1a1a", borderRadius: 14, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "#777", marginBottom: 10 }}>Tags de <span style={{ color: ORANGE }}>{taggingSeries.title}</span> :</div>

            {/* Current tags on this series */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {(tags[taggingSeries.tmdbId] || []).map(tag => (
                <span key={tag} style={{ display: "flex", alignItems: "center", gap: 4, background: ORANGE_DIM, border: `1px solid ${ORANGE_BORDER}`, color: ORANGE, fontSize: 11, padding: "3px 10px", borderRadius: 20 }}>
                  #{tag}
                  <button onClick={() => onAskConfirm(`Retirer le tag #${tag} ?`, () => onRemoveTag(taggingSeries.tmdbId, tag))} style={{ background: "none", border: "none", color: ORANGE, cursor: "pointer", padding: 0, fontSize: 13, lineHeight: 1 }}>×</button>
                </span>
              ))}
              {(tags[taggingSeries.tmdbId] || []).length === 0 && <span style={{ color: "#333", fontSize: 12 }}>Aucun tag</span>}
            </div>

            {/* Add new tag */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input value={newTag} onChange={e => setNewTag(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                onKeyDown={e => { if (e.key === "Enter") { handleAddTag(taggingSeries.tmdbId, newTag); setNewTag(""); } }}
                placeholder="Ajouter un tag…" maxLength={20}
                style={{ flex: 1, padding: "9px 12px", background: "#141414", border: `1px solid ${newTag ? ORANGE_BORDER : "#222"}`, borderRadius: 10, color: "#fff", fontSize: 13, outline: "none", fontFamily: "'DM Sans',system-ui,sans-serif" }} />
              <button onClick={() => { handleAddTag(taggingSeries.tmdbId, newTag); setNewTag(""); }}
                disabled={!newTag.trim()}
                style={{ padding: "9px 14px", background: newTag.trim() ? ORANGE_DIM : "#111", border: `1px solid ${newTag.trim() ? ORANGE_BORDER : "#222"}`, borderRadius: 10, color: newTag.trim() ? ORANGE : "#444", fontSize: 13, cursor: newTag.trim() ? "pointer" : "default" }}>+</button>
            </div>

            {/* Suggested tags */}
            <div style={{ fontSize: 10, color: "#444", marginBottom: 8 }}>Suggestions :</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SUGGESTED.filter(t => !(tags[taggingSeries.tmdbId] || []).includes(t)).slice(0, 8).map(t => (
                <button key={t} onClick={() => handleAddTag(taggingSeries.tmdbId, t)} style={{ padding: "4px 10px", borderRadius: 20, background: "#141414", border: "1px solid #222", color: "#666", fontSize: 11, cursor: "pointer" }}>#{t}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {allTags.length === 0 && !taggingSeries && (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: 36, marginBottom: 16, opacity: .25 }}>🏷</div>
          <div style={{ color: "#333", fontSize: 14 }}>Aucun tag pour l'instant</div>
          <div style={{ color: "#2a2a2a", fontSize: 12, marginTop: 8 }}>Sélectionne une série ci-dessus pour lui ajouter des tags</div>
        </div>
      )}
    </div>
  );
}


// ─── CONFIRM DIALOG ───────────────────────────────────────────────────────────
function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel, danger = true }) {
  return (
    <div onClick={onCancel} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
      backdropFilter: "blur(6px)", zIndex: 9999,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      maxWidth: 440, margin: "0 auto",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#0f0f0f", borderRadius: "20px 20px 0 0",
        padding: "24px 24px 40px", width: "100%",
        border: "1px solid #1e1e1e", borderBottom: "none",
      }}>
        <div style={{ width: 36, height: 3, background: "#2a2a2a", borderRadius: 2, margin: "0 auto 20px" }} />
        <div style={{ fontSize: 16, fontWeight: 600, color: "#fff", textAlign: "center", marginBottom: 8, fontFamily: "'Playfair Display',Georgia,serif" }}>
          {title || "Confirmer la suppression"}
        </div>
        <div style={{ fontSize: 14, color: "#777", textAlign: "center", lineHeight: 1.6, marginBottom: 24 }}>
          {message}
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: "14px", borderRadius: 14,
            background: "#1a1a1a", border: "1px solid #2a2a2a",
            color: "#888", fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}>Annuler</button>
          <button onClick={() => { onConfirm(); onCancel(); }} style={{
            flex: 1, padding: "14px", borderRadius: 14,
            background: danger ? "rgba(239,68,68,0.15)" : ORANGE_DIM,
            border: "1px solid " + (danger ? "rgba(239,68,68,0.4)" : ORANGE_BORDER),
            color: danger ? "#ef4444" : ORANGE,
            fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}>{confirmLabel || "Supprimer"}</button>
        </div>
      </div>
    </div>
  );
}


// ─── SOCIAL HELPERS ───────────────────────────────────────────────────────────

async function fetchFollows(userId) {
  const [{ data: following }, { data: followers }] = await Promise.all([
    supabase.from("follows").select("following_id").eq("follower_id", userId),
    supabase.from("follows").select("follower_id").eq("following_id", userId),
  ]);
  return {
    followingIds: (following || []).map(r => r.following_id),
    followerIds:  (followers || []).map(r => r.follower_id),
  };
}

async function searchUsers(query) {
  const { data } = await supabase
    .from("profiles")
    .select("id, data, updated_at")
    .limit(50);
  const q = query.toLowerCase();
  return (data || [])
    .filter(row => {
      const u = row.data?.user || {};
      const name   = (u.name   || "").toLowerCase();
      const pseudo = (u.pseudo || "").toLowerCase();
      return name.includes(q) || pseudo.includes(q);
    })
    .map(row => {
      const u = row.data?.user || {};
      return {
        id: row.id,
        name: u.name || "Utilisateur",
        pseudo: u.pseudo || u.name || "user",
        avatar: u.avatar || null,
        bio: u.bio || "",
        favGenres: u.favGenres || [],
        pinnedBadgeIds: row.data?.pinnedBadgeIds || [],
        unlockedBadgeIds: row.data?.unlockedBadgeIds || [],
        library: row.data?.library || [],
        activityLog: row.data?.activityLog || [],
        extraReviews: row.data?.extraReviews || {},
        watchedEpisodes: row.data?.watchedEpisodes || {},
      };
    });
}

async function fetchUserProfile(userId) {
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
    extraReviews: data.data?.extraReviews || {},
    watchedEpisodes: data.data?.watchedEpisodes || {},
    favShows: u.favShows || data.data?.favShows || [],
  };
}

function formatRelativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "A l'instant";
  if (m < 60) return "Il y a " + m + " min";
  const h = Math.floor(m / 60);
  if (h < 24) return "Il y a " + h + "h";
  const d = Math.floor(h / 24);
  if (d < 7) return "Il y a " + d + "j";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// ─── PUBLIC PROFILE PAGE ─────────────────────────────────────────────────────
function PublicProfilePage({ userId, currentUserId, onOpen, onClose, myLibrary = [], myWatchedEpisodes = {} }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  useEffect(() => {
    (async () => {
      const [p, { followingIds, followerIds }] = await Promise.all([
        fetchUserProfile(userId),
        fetchFollows(userId),
      ]);
      setProfile(p);
      setFollowerCount(followerIds.length);
      setFollowingCount(followingIds.length);
      if (currentUserId) {
        const { data } = await supabase.from("follows").select("id")
          .eq("follower_id", currentUserId).eq("following_id", userId).single();
        setIsFollowing(!!data);
      }
      setLoading(false);
    })();
  }, [userId]);

  const handleFollow = async () => {
    if (!currentUserId || followLoading) return;
    setFollowLoading(true);
    if (isFollowing) {
      await supabase.from("follows").delete().eq("follower_id", currentUserId).eq("following_id", userId);
      setIsFollowing(false);
      setFollowerCount(n => n - 1);
    } else {
      await supabase.from("follows").insert({ follower_id: currentUserId, following_id: userId });
      setIsFollowing(true);
      setFollowerCount(n => n + 1);
    }
    setFollowLoading(false);
  };

  if (loading) return (
    <div style={{ position: "fixed", inset: 0, background: "#080808", zIndex: 910, display: "flex", alignItems: "center", justifyContent: "center", maxWidth: 440, margin: "0 auto" }}><Spinner /></div>
  );
  if (!profile) return null;

  const watched = (profile.library || []).filter(s => s.watched);
  const rated   = watched.filter(s => s.userRating);
  const totalEps = Object.values(profile.watchedEpisodes || {}).reduce((a, eps) => a + Object.values(eps).filter(Boolean).length, 0);
  const recentActivity = (profile.activityLog || []).slice(0, 8);
  const favShows = profile.favShows?.length ? profile.favShows : watched.slice(0, 4);

  // ── Calcul de compatibilité ────────────────────────────────────────────────
  const compatibility = currentUserId && currentUserId !== userId ? (() => {
    const myWatched = (myLibrary || []).filter(s => s.watched);
    const theirWatched = (profile.library || []).filter(s => s.watched);

    // 1. Genres en commun (33.3%)
    const getGenres = (lib) => [...new Set(lib.flatMap(s => s.genres?.length ? s.genres : (s.genre ? [s.genre] : [])))];
    const myGenres = getGenres(myWatched);
    const theirGenres = getGenres(theirWatched);
    const commonGenres = myGenres.filter(g => theirGenres.includes(g));
    const totalGenres = new Set([...myGenres, ...theirGenres]).size;
    const genreScore = totalGenres > 0 ? commonGenres.length / totalGenres : 0;

    // 2. Séries en commun (33.3%)
    const myIds = new Set(myWatched.map(s => s.tmdbId));
    const theirIds = new Set(theirWatched.map(s => s.tmdbId));
    const commonSeries = [...myIds].filter(id => theirIds.has(id));
    const totalSeries = new Set([...myIds, ...theirIds]).size;
    const seriesScore = totalSeries > 0 ? commonSeries.length / totalSeries : 0;

    // 3. Notes similaires sur séries communes (33.3%)
    const myRated = myWatched.filter(s => s.userRating);
    const theirRated = theirWatched.filter(s => s.userRating);
    const bothRated = myRated.filter(s => theirRated.find(t => t.tmdbId === s.tmdbId));
    let ratingScore = 0;
    if (bothRated.length > 0) {
      const avgDiff = bothRated.reduce((acc, s) => {
        const theirs = theirRated.find(t => t.tmdbId === s.tmdbId);
        return acc + Math.abs(s.userRating - theirs.userRating);
      }, 0) / bothRated.length;
      ratingScore = Math.max(0, 1 - avgDiff / 5);
    } else if (commonSeries.length === 0) {
      ratingScore = 0;
    } else {
      ratingScore = 0.5; // séries en commun mais aucune notée des deux côtés
    }

    const total = Math.round(((genreScore + seriesScore + ratingScore) / 3) * 100);
    return total;
  })() : null;
  const ic = (sym, size=18) => <span style={{ color: ORANGE, fontSize: size, lineHeight: 1 }}>{sym}</span>;
  const ICONS = { watch: ic("\u25c9"), rate: ic("\u2605",20), review: ic("\u270e"), like: ic("\u2665"), episode: ic("\u25b6",15), watchlist: ic("\u25c8"), list: ic("\u2261"), rewatch: ic("\u21ba") };

  return (
    <div ref={el => el && el.scrollTo(0,0)} style={{ position: "fixed", inset: 0, background: "#080808", zIndex: 910, overflowY: "auto", paddingBottom: 100, maxWidth: 440, margin: "0 auto" }}>
      <div style={{ position: "sticky", top: 0, background: "rgba(8,8,8,0.95)", backdropFilter: "blur(12px)", zIndex: 10, padding: "52px 20px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #111" }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif" }}>Profil</div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>\u00d7</button>
      </div>

      <div style={{ textAlign: "center", padding: "24px 20px 16px" }}>
        <div style={{ width: 80, height: 80, borderRadius: "50%", background: "linear-gradient(135deg, #c026d3, #f0abfc)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 30, color: "#fff", margin: "0 auto 14px", overflow: "hidden", border: "3px solid #1a1a1a" }}>
          {profile.avatar ? <img src={profile.avatar} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span>{(profile.name || "?")[0].toUpperCase()}</span>}
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif" }}>{profile.name}</div>
        <div style={{ fontSize: 12, color: "#555", marginTop: 6 }}>@{profile.pseudo}</div>
        {profile.bio && <div style={{ fontSize: 13, color: "#888", marginTop: 8, lineHeight: 1.5 }}>{profile.bio}</div>}
        {currentUserId && currentUserId !== userId && (
          <button onClick={handleFollow} disabled={followLoading} style={{ marginTop: 16, padding: "10px 28px", borderRadius: 20, background: isFollowing ? "#1a1a1a" : ORANGE_DIM, border: "1.5px solid " + (isFollowing ? "#2a2a2a" : ORANGE_BORDER), color: isFollowing ? "#666" : ORANGE, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            {followLoading ? "..." : isFollowing ? "Ne plus suivre" : "Suivre"}
          </button>
        )}
      </div>

      {/* Compatibilité */}
      {compatibility !== null && (
        <div style={{ margin: "0 20px 16px", padding: "14px 16px", background: "#0e0e0e", border: "1px solid #1a1a1a", borderRadius: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 13, color: "#ccc", fontWeight: 600 }}>🎯 Compatibilité avec {profile.name}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: ORANGE }}>{compatibility}%</div>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: "#1a1a1a", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${compatibility}%`, borderRadius: 3, background: `linear-gradient(to right, ${ORANGE_BORDER}, ${ORANGE})`, transition: "width .6s ease" }} />
          </div>
        </div>
      )}

      {profile.favGenres?.length > 0 && (
        <div style={{ margin: "0 20px 16px", padding: "14px 16px", background: "#1a1a1a", border: "1px solid rgba(219,157,228,0.94)", borderRadius: 14 }}>
          <div style={{ fontSize: 10, color: "#fff", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>\u2726 Genres favoris</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {profile.favGenres.map(g => <span key={g} style={{ background: "#2a2a2a", border: "1px solid " + ORANGE_BORDER, color: "#fff", fontSize: 12, padding: "5px 12px", borderRadius: 20 }}>{g}</span>)}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 8, padding: "0 20px" }}>
        {[{ n: watched.length, label: "Vues" }, { n: totalEps, label: "\u00c9pisodes" }, { n: followerCount, label: "Abonn\u00e9s" }, { n: followingCount, label: "Abonn" }].map((stat, i) => (
          <div key={i} style={{ background: "#0e0e0e", borderRadius: 12, padding: "10px 6px", textAlign: "center", border: "1px solid #181818" }}>
            <div style={{ fontSize: 9, color: "#555", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".04em" }}>{stat.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: ORANGE, fontFamily: "'Playfair Display',Georgia,serif", lineHeight: 1 }}>{stat.n}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 24, padding: "0 20px" }}>
        {[0,1,2,3].map(i => {
          const bid = profile.pinnedBadgeIds?.[i];
          const badge = bid ? ALL_BADGES.find(b => b.id === bid) : null;
          return (
            <div key={i} style={{ background: "#0e0e0e", borderRadius: 12, padding: "10px 6px", border: badge ? "1px solid " + badge.color + "33" : "1px dashed #1e1e1e", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              {badge ? <><HexBadge badge={badge} unlocked size={38} /><div style={{ fontSize: 8, color: badge.color, textAlign: "center", lineHeight: 1.2, fontWeight: 600 }}>{badge.name}</div></> : <span style={{ fontSize: 16, opacity: 0.12 }}>{"\u2b21"}</span>}
            </div>
          );
        })}
      </div>

      {favShows.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 12, padding: "0 20px" }}>Favorite TV Shows</div>
          <div style={{ display: "flex", gap: 10, padding: "0 20px" }}>
            {favShows.slice(0,4).map(s => <div key={s.tmdbId||s.id} style={{ flex: 1 }}><PosterCard series={s} onOpen={onOpen} /></div>)}
          </div>
        </div>
      )}

      {rated.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 12, padding: "0 20px" }}>Derni\u00e8res notes</div>
          <div style={{ display: "flex", gap: 12, padding: "0 20px", overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
            {rated.map(s => <div key={s.tmdbId||s.id} style={{ width: 90, flexShrink: 0 }}><PosterCard series={s} onOpen={onOpen} /></div>)}
          </div>
        </div>
      )}

      {recentActivity.length > 0 && (
        <div style={{ padding: "0 20px 20px" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 12 }}>Activit\u00e9 r\u00e9cente</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {recentActivity.map((entry, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#0e0e0e", borderRadius: 12, border: "1px solid #181818" }}>
                <div style={{ width: 28, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>{ICONS[entry.type] || ic("\u25c9")}</div>
                <div style={{ flex: 1, color: "#ccc", fontSize: 13, lineHeight: 1.4 }}>{entry.label}</div>
                <div style={{ fontSize: 11, color: "#444", flexShrink: 0 }}>{formatRelativeTime(entry.ts)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── FOLLOW LIST PAGE ─────────────────────────────────────────────────────────
function FollowListPage({ title, userId, type, currentUserId, onViewProfile }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [followingMap, setFollowingMap] = useState({});

  useEffect(() => {
    (async () => {
      const col = type === "followers" ? "follower_id" : "following_id";
      const filterCol = type === "followers" ? "following_id" : "follower_id";
      const { data } = await supabase.from("follows").select(col).eq(filterCol, userId);
      const ids = (data || []).map(r => r[col]);
      if (ids.length === 0) { setLoading(false); return; }
      const { data: profiles } = await supabase.from("profiles").select("id,data").in("id", ids);
      setUsers((profiles || []).map(p => {
        const u = p.data?.user || {};
        return { id: p.id, name: u.name || "Utilisateur", pseudo: u.pseudo || u.name || "user", avatar: u.avatar || null, watched: (p.data?.library || []).filter(s => s.watched).length };
      }));
      if (currentUserId) {
        const { data: myF } = await supabase.from("follows").select("following_id").eq("follower_id", currentUserId).in("following_id", ids);
        const map = {};
        (myF || []).forEach(r => { map[r.following_id] = true; });
        setFollowingMap(map);
      }
      setLoading(false);
    })();
  }, [userId, type]);

  const toggleFollow = async (targetId) => {
    if (!currentUserId) return;
    if (followingMap[targetId]) {
      await supabase.from("follows").delete().eq("follower_id", currentUserId).eq("following_id", targetId);
      setFollowingMap(p => ({ ...p, [targetId]: false }));
    } else {
      await supabase.from("follows").insert({ follower_id: currentUserId, following_id: targetId });
      setFollowingMap(p => ({ ...p, [targetId]: true }));
    }
  };

  return (
    <div ref={el => el && el.scrollTo(0,0)} style={{ position: "fixed", inset: 0, background: "#080808", zIndex: 920, overflowY: "auto", paddingBottom: 100, maxWidth: 440, margin: "0 auto" }}>
      <div style={{ padding: "52px 20px 16px" }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif" }}>{title}</div>
        <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{users.length} {type === "followers" ? "abonn\u00e9" : "abonnement"}{users.length !== 1 ? "s" : ""}</div>
      </div>
      {loading ? <Spinner /> : users.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#333", fontSize: 14 }}>Aucun {type === "followers" ? "abonn\u00e9" : "abonnement"} pour l'instant</div>
      ) : (
        <div style={{ padding: "0 20px" }}>
          {users.map(u => (
            <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid #111" }}>
              <div onClick={() => onViewProfile(u.id)} style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg, #c026d3, #f0abfc)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18, color: "#fff", flexShrink: 0, cursor: "pointer", overflow: "hidden" }}>
                {u.avatar ? <img src={u.avatar} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span>{(u.name||"?")[0].toUpperCase()}</span>}
              </div>
              <div onClick={() => onViewProfile(u.id)} style={{ flex: 1, cursor: "pointer" }}>
                <div style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>{u.name}</div>
                <div style={{ color: "#555", fontSize: 12 }}>@{u.pseudo} · {u.watched} séries vues</div>
              </div>
              {currentUserId && currentUserId !== u.id && (
                <button onClick={() => toggleFollow(u.id)} style={{ padding: "7px 14px", borderRadius: 16, background: followingMap[u.id] ? "#1a1a1a" : ORANGE_DIM, border: "1px solid " + (followingMap[u.id] ? "#2a2a2a" : ORANGE_BORDER), color: followingMap[u.id] ? "#666" : ORANGE, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  {followingMap[u.id] ? "Suivi \u2713" : "Suivre"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── UPCOMING PAGE ────────────────────────────────────────────────────────────

function UpcomingPage({ library }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (library.length === 0) { setLoading(false); return; }

    // Toutes les séries avec lesquelles on a interagi
    const candidates = library.filter(s => s.watched || s.inWatchlist);

    (async () => {
      const results = [];
      // On traite par batch de 6 pour ne pas surcharger
      for (let i = 0; i < Math.min(candidates.length, 30); i++) {
        const s = candidates[i];
        try {
          const detail = await tmdbViaClaude(`/tv/${s.tmdbId}`);
          const next = detail.next_episode_to_air;
          if (!next || !next.air_date) continue;

          const airDate = new Date(next.air_date);
          const today   = new Date();
          today.setHours(0, 0, 0, 0);
          const daysLeft = Math.ceil((airDate - today) / (1000 * 60 * 60 * 24));

          if (daysLeft < 0) continue; // déjà sorti

          results.push({
            tmdbId: s.tmdbId,
            title: s.title,
            poster: s.poster,
            episodeNumber: `S${String(next.season_number).padStart(2,"0")}E${String(next.episode_number).padStart(2,"0")}`,
            episodeName: next.name || "",
            airDate,
            daysLeft,
          });
        } catch { /* ignore */ }
      }

      // Tri chronologique
      results.sort((a, b) => a.airDate - b.airDate);
      setItems(results);
      setLoading(false);
    })();
  }, [library.length]);

  const formatDays = (days) => {
    if (days === 0) return "Aujourd'hui";
    if (days === 1) return "Demain";
    return `Dans ${days} jours`;
  };

  return (
    <div ref={el => el && el.scrollTo(0,0)} style={{ position: "fixed", inset: 0, background: "#080808", zIndex: 900, overflowY: "auto", paddingBottom: 100, maxWidth: 440, margin: "0 auto" }}>
      <div style={{ padding: "52px 20px 20px" }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif" }}>À venir</div>
        <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>Prochains épisodes de tes séries</div>
      </div>

      {loading ? (
        <div>
          <Spinner />
          <div style={{ textAlign: "center", color: "#444", fontSize: 12, marginTop: 8 }}>Recherche des prochains épisodes…</div>
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 20px" }}>
          <div style={{ fontSize: 36, marginBottom: 16, opacity: .3 }}>📅</div>
          <div style={{ color: "#333", fontSize: 14 }}>Aucun épisode à venir</div>
          <div style={{ color: "#2a2a2a", fontSize: 12, marginTop: 8 }}>Les séries que tu suis n'ont pas d'épisode prévu prochainement</div>
        </div>
      ) : (
        <div style={{ padding: "0 20px" }}>
          {items.map((item, i) => (
            <div key={item.tmdbId} style={{ display: "flex", gap: 14, padding: "14px 0", borderBottom: "1px solid #111", alignItems: "center" }}>
              {/* Poster */}
              <div style={{ width: 52, height: 78, borderRadius: 8, overflow: "hidden", background: "#1a1a1a", flexShrink: 0 }}>
                {item.poster && <img src={item.poster} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
              </div>

              {/* Infos */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#fff", fontWeight: 600, fontSize: 14, fontFamily: "'Playfair Display',Georgia,serif", lineHeight: 1.3 }}>{item.title}</div>
                <div style={{ color: "#777", fontSize: 12, marginTop: 4 }}>
                  <span style={{ color: ORANGE, fontWeight: 600 }}>{item.episodeNumber}</span>
                  {item.episodeName && <span> · {item.episodeName}</span>}
                </div>
              </div>

              {/* Jours restants */}
              <div style={{ flexShrink: 0, textAlign: "right" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#ccc" }}>{formatDays(item.daysLeft)}</div>
                <div style={{ fontSize: 10, color: "#444", marginTop: 3 }}>
                  {item.airDate.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SeriesBoxd() {
  const [onboarded, setOnboarded] = useState(false);
  const [user, setUser] = useState({ name: "Alex", genres: [], platforms: [] });
  const [tab, setTab] = useState("home");
  const mainScrollRef = useRef(null);
  useEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [tab]);

  const [profileTab, setProfileTab] = useState("TV Shows");
  const [showWatchlistPage, setShowWatchlistPage] = useState(false);
  const [showTVShowsPage, setShowTVShowsPage] = useState(false);
  const [showUpcomingPage, setShowUpcomingPage] = useState(false);
  // { title, endpoint?, inProgressList? }
  const [seeAllPage, setSeeAllPage] = useState(null);
  const [showListsPage, setShowListsPage] = useState(false);
  const [showBadgesPage, setShowBadgesPage] = useState(false);
  const [viewingProfile, setViewingProfile] = useState(null);
  const [showFollowersPage, setShowFollowersPage] = useState(false);
  const [showFollowingPage, setShowFollowingPage] = useState(false);
  const [followingIds, setFollowingIds] = useState([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [friendsActivity, setFriendsActivity] = useState([]);
  const [friendsActivityLoading, setFriendsActivityLoading] = useState(false);
  const [showReviewsPage, setShowReviewsPage] = useState(false);
  const [showSettingsPage, setShowSettingsPage] = useState(false);
  const [showTagsPage, setShowTagsPage] = useState(false);
  const [tags, setTags] = useState({}); // { tmdbId: ["cozy", "culte", ...] }
  const [unlockedBadgeIds, setUnlockedBadgeIds] = useState(["premiers_pas","bienvenue","fidele","premier_mot","enchante"]);
  const [badgeQueue, setBadgeQueue]             = useState([]); // file d'attente des badges à afficher
  const [newlyUnlocked, setNewlyUnlocked]       = useState(null); // badge actuellement affiché en toast
  const prevUnlockedRef = useRef(null);
  const [confirm, setConfirm] = useState(null);
  const [epPopup, setEpPopup] = useState(null); // { ep, seasonN, tmdbId }
  const [rewatchCounts, setRewatchCounts] = useState({}); // { message, onConfirm }
  const askConfirm = (message, onConfirm, opts = {}) => setConfirm({ message, onConfirm, ...opts });

  const [pinnedBadgeIds, setPinnedBadgeIds] = useState([]);
  const [lists, setLists] = useState([]);
  const [showCreateList, setShowCreateList] = useState(false);
  const [viewingList, setViewingList] = useState(null);
  const [library, setLibrary] = useState([]);
  const [detailSeries, setDetailSeries] = useState(null);
  const [extraReviews, setExtraReviews] = useState({});
  const [watchHistory, setWatchHistory] = useState({});
  const [activityLog, setActivityLog] = useState([]);
  const [diaryTab, setDiaryTab] = useState("mine");
  const [watchedEpisodes, setWatchedEpisodes] = useState({}); // { tmdbId: { "S1E3": true } }
  const [dataLoaded, setDataLoaded] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  // ─── Calcul automatique des badges ───────────────────────────────────────────
  useEffect(() => {
    if (!dataLoaded) return;

    // Sources de données
    const totalEpisodes  = Object.values(watchedEpisodes).reduce((acc, eps) => acc + Object.values(eps).filter(Boolean).length, 0);
    const allReviews     = Object.values(extraReviews).flat();
    const totalReviews   = allReviews.length;
    const totalLikesGiven = activityLog.filter(a => a.type === "like").length;
    const watchedSeries  = library.filter(s => s.watched);
    const libSize        = library.filter(s => s.watched).length;
    const watchlistSize  = library.filter(s => s.inWatchlist).length;

    // Genres uniques des séries vues
    // Helper pour récupérer les genres d'une série — tableau si dispo, sinon genre string comme fallback
    const getGenres = (s) => (s.genres && s.genres.length > 0) ? s.genres : (s.genre && s.genre !== "Série" ? [s.genre] : []);

    const genresSeen = [...new Set(watchedSeries.flatMap(s => getGenres(s)))];

    // Séries terminées = tous les épisodes cochés
    const completedSeries = library.filter(s => {
      const eps = watchedEpisodes[s.tmdbId] || {};
      const done = Object.values(eps).filter(Boolean).length;
      const total = s.episodes > 0 ? s.episodes : null;
      if (total !== null) return done >= total && total > 0;
      return s.watched; // fallback si le total réel n'est pas encore connu
    });

    // Séries vues par genre
    const seriesByGenre = (genre) => completedSeries.filter(s => getGenres(s).some(g => g.toLowerCase().includes(genre.toLowerCase())));

    // Notes données
    const ratings      = watchedSeries.filter(s => s.userRating).map(s => s.userRating);
    const avgRating    = ratings.length > 0 ? ratings.reduce((a,b) => a+b, 0) / ratings.length : 0;
    const fiveStars    = watchedSeries.filter(s => s.userRating === 5);
    const oneStar      = watchedSeries.filter(s => s.userRating === 1);
    const allStarValues = [0.5,1,1.5,2,2.5,3,3.5,4,4.5,5];
    const usedRatings  = new Set(ratings);

    // Ancienneté du compte
    const joinDate     = user.joinDate ? new Date(user.joinDate) : new Date();
    const daysSince    = Math.floor((Date.now() - joinDate) / 86400000);

    // Séries "pilote" = 1 seul épisode coché
    const pilotOnly = library.filter(s => {
      const eps = watchedEpisodes[s.tmdbId] || {};
      return Object.values(eps).filter(Boolean).length === 1;
    });

    // Jours d'activité consécutifs
    const activityDays = [...new Set(activityLog.map(a => a.ts?.slice(0,10)))].filter(Boolean).sort();
    const maxStreak = (() => {
      let streak = 1, max = 0;
      for (let i = 1; i < activityDays.length; i++) {
        const diff = (new Date(activityDays[i]) - new Date(activityDays[i-1])) / 86400000;
        if (diff === 1) { streak++; max = Math.max(max, streak); }
        else streak = 1;
      }
      return activityDays.length > 0 ? Math.max(max, streak) : 0;
    })();

    // Heure d'activité (depuis activityLog timestamps)
    const hours = activityLog.map(a => a.ts ? new Date(a.ts).getHours() : -1);
    const hasNightActivity   = hours.some(h => h >= 0 && h < 5);
    const hasEarlyActivity   = hours.some(h => h >= 4 && h <= 6);

    // Pays des séries (via s.origin_country ou s.country)
    const countries = [...new Set(watchedSeries.flatMap(s => s.origin_country || s.countries || []))];

    // Listes
    const listsCount = lists.length;

    // Profil complet
    const profileFilled = !!(user.bio && user.location && user.avatar);

    // ─── Données temporelles supplémentaires ────────────────────────────────
    const epsByDay = {};
    Object.entries(watchedEpisodes).forEach(([sid, eps]) => {
      Object.entries(eps || {}).forEach(([key, watched]) => {
        if (!watched) return;
        const entry = activityLog.find(a => a.label?.includes(sid) || a.label?.includes(key));
        const date = entry ? new Date(entry.ts).toDateString() : new Date().toDateString();
        epsByDay[date] = (epsByDay[date] || 0) + 1;
      });
    });
    const maxEpsInDay = Math.max(0, ...Object.values(epsByDay));

    const epsByWeekday = {};
    activityLog.filter(a => a.type === "episode").forEach(a => {
      const d = new Date(a.ts || 0);
      const day = d.getDay();
      const date = d.toDateString();
      if (!epsByWeekday[date]) epsByWeekday[date] = { day, count: 0 };
      epsByWeekday[date].count++;
    });
    const weekendDays = Object.values(epsByWeekday).filter(d => d.day === 0 || d.day === 5 || d.day === 6);
    const weekendTotal = weekendDays.reduce((a, d) => a + d.count, 0);

    const nightDays = [...new Set(
      activityLog.filter(a => { const h = new Date(a.ts||0).getHours(); return h >= 0 && h < 5; })
        .map(a => new Date(a.ts||0).toDateString())
    )].sort();
    let maxNightStreak = 0, curNightStreak = 0;
    for (let i = 0; i < nightDays.length; i++) {
      if (i === 0) { curNightStreak = 1; continue; }
      const prev = new Date(nightDays[i-1]), cur = new Date(nightDays[i]);
      const diff = (cur - prev) / 86400000;
      curNightStreak = diff === 1 ? curNightStreak + 1 : 1;
      maxNightStreak = Math.max(maxNightStreak, curNightStreak);
    }
    const maxSessionEps = maxEpsInDay;

    const seasonsSeen = new Set();
    activityLog.forEach(a => {
      const m = new Date(a.ts||0).getMonth();
      if (m >= 2 && m <= 4) seasonsSeen.add("printemps");
      else if (m >= 5 && m <= 7) seasonsSeen.add("ete");
      else if (m >= 8 && m <= 10) seasonsSeen.add("automne");
      else seasonsSeen.add("hiver");
    });

    const autumnEps = activityLog.filter(a => {
      const m = new Date(a.ts||0).getMonth();
      return a.type === "episode" && m >= 8 && m <= 10;
    }).length;

    const summerEps = activityLog.filter(a => {
      const m = new Date(a.ts||0).getMonth();
      return a.type === "episode" && m >= 5 && m <= 7;
    }).length;

    const hibernationDone = Object.entries(epsByDay).some(([dateStr, count]) => {
      const m = new Date(dateStr).getMonth();
      return (m === 11 || m === 0 || m === 1) && count >= 8;
    });

    const abandonCount = pilotOnly.length;
    const nostalgicCount = Object.values(rewatchCounts).filter(r => r.count >= 1).length;

    const totalEpsAll = Object.values(watchedEpisodes).reduce((a, eps) => a + Object.values(eps||{}).filter(Boolean).length, 0);
    const maxSingleSeriesEps = Math.max(0, ...Object.values(watchedEpisodes).map(eps => Object.values(eps||{}).filter(Boolean).length));
    const leFideleCondition = totalEpsAll > 0 && (maxSingleSeriesEps / totalEpsAll) >= 0.5;
    const lePuristeCondition = completedSeries.length >= 20 && abandonCount === 0;

    const premiers_pas =   totalEpisodes >= 1;
    const accro =          totalEpisodes >= 50;
    const seriphile =      totalEpisodes >= 100;
    const binge_master =   totalEpisodes >= 200;
    const marathonien =    totalEpisodes >= 500;
    const legende_canape = totalEpisodes >= 1000;
    const oiseau_nuit =    hasNightActivity;
    const leve_tot =       hasEarlyActivity;
    const sprinteur =      maxEpsInDay >= 10;
    const adieu =          completedSeries.some(s => (s.episodes || 0) > 100);
    const speedrunner =    completedSeries.some(s => {
      const seriesActs = activityLog.filter(a => a.label?.includes(s.title));
      if (seriesActs.length < 2) return false;
      const times = seriesActs.map(a => new Date(a.ts||0).getTime()).sort();
      return (times[times.length-1] - times[0]) < 86400000;
    });
    const weekend =        weekendTotal >= 15;
    const insomniaque =    maxNightStreak >= 7;
    const session_canap =  maxSessionEps >= 18;

    const sortedEpActs = [...activityLog].filter(a => a.type === "episode").sort((a,b) => new Date(a.ts||0) - new Date(b.ts||0));
    let count48 = 0;
    for (let i = 0; i < sortedEpActs.length; i++) {
      const start = new Date(sortedEpActs[i].ts||0).getTime();
      const inWindow = sortedEpActs.filter(a => { const t = new Date(a.ts||0).getTime(); return t >= start && t <= start + 172800000; }).length;
      count48 = Math.max(count48, inWindow);
    }
    const call911Condition = count48 >= 50;
    const batHours = activityLog.filter(a => { const d = new Date(a.ts||0); return d.getHours() >= 3 && d.getHours() < 5; }).map(a => new Date(a.ts||0).getDay());
    const batmanCondition = hours.some(h => h >= 3 && h < 5) && batHours.some(d => d >= 1 && d <= 4);

    const rules = {
        // Visionnage
        premiers_pas, accro, seriphile, binge_master, marathonien, legende_canape,
        oiseau_nuit, leve_tot, sprinteur, adieu, speedrunner, weekend, insomniaque, session_canap,

        // Notation
        premiere_opinion: ratings.length >= 1,
        coup_coeur:       fiveStars.length >= 20,
        sans_pitie:       oneStar.length >= 10,
        "sévère":         avgRating > 0 && avgRating < 2.5,
        equilibre:        allStarValues.every(v => usedRatings.has(v)),
        gout_luxe:        avgRating >= 4 && ratings.length >= 5,
        mauvais_gout:     watchedSeries.some(s => s.userRating === 5 && (s.rating || 0) < 4),
        pourquoi:         library.some(s => s.userRating === 1 && watchedEpisodes[s.tmdbId] && Object.values(watchedEpisodes[s.tmdbId]).filter(Boolean).length > 1),
        fond_trou:        fiveStars.filter(s => (s.genres || []).some(g => g.toLowerCase().includes("drame"))).length >= 5,
        pepite_cachee:    fiveStars.some(s => (s.voteCount || s.popularity || 9999) < 500),

        // Critiques
        premier_mot:      totalReviews >= 1,
        critique_herbe:   totalReviews >= 10,
        chroniqueur:      totalReviews >= 25,
        plume_aceree:     totalReviews >= 50,
        journaliste:      totalReviews >= 100,
        cineaste:         totalReviews >= 200,
        roman:            allReviews.some(r => (r.text || "").length > 1000),
        critique_pop:     allReviews.some(r => (r.likes || 0) >= 50),
        influenceur:      allReviews.reduce((a,r) => a + (r.likes||0), 0) >= 500,
        concis:           allReviews.some(r => (r.text||"").length < 100 && (r.likes||0) >= 20),
        spoiler:          (() => {
          const episodeActs = activityLog.filter(a => a.type === "episode" && a.ts);
          const reviewActs  = activityLog.filter(a => a.type === "review" && a.ts);
          return reviewActs.some(r => {
            const rt = new Date(r.ts).getTime();
            return episodeActs.some(e => Math.abs(rt - new Date(e.ts).getTime()) <= 60 * 60 * 1000);
          });
        })(),

        // Genres
        curieux:          genresSeen.length >= 5,
        explorateur:      genresSeen.length >= 10,
        cameleon:         genresSeen.length >= 15,
        omnivore:         genresSeen.length >= 18,
        galactique:       watchedSeries.length >= 20 && genresSeen.length >= 10,
        fan_crime:        (watchedSeries.filter(s => getGenres(s).some(g=>g.toLowerCase().includes("crime"))).reduce((a,s) => a + Object.values(watchedEpisodes[s.tmdbId]||{}).filter(Boolean).length, 0)) >= 50,
        profiler:         seriesByGenre("crime").length >= 10,
        spatial:          (watchedSeries.filter(s => getGenres(s).some(g=>g.toLowerCase().includes("sci"))).reduce((a,s) => a + Object.values(watchedEpisodes[s.tmdbId]||{}).filter(Boolean).length, 0)) >= 50,
        seul_mars:        seriesByGenre("sci").length >= 10,
        clown:            seriesByGenre("comédie").length >= 10,
        detective:        (watchedSeries.filter(s => getGenres(s).some(g=>g.toLowerCase().includes("thriller")||g.toLowerCase().includes("policier"))).reduce((a,s) => a + Object.values(watchedEpisodes[s.tmdbId]||{}).filter(Boolean).length, 0)) >= 50,
        briseur:          seriesByGenre("drame").length >= 10,
        ghostbuster:      seriesByGenre("horreur").length >= 10,
        lover:            seriesByGenre("romance").length >= 10,
        bagarreur:        seriesByGenre("action").length >= 10,
        Magicien:         (watchedSeries.filter(s => getGenres(s).some(g=>g.toLowerCase().includes("fantasy")||g.toLowerCase().includes("fantaisie"))).reduce((a,s) => a + Object.values(watchedEpisodes[s.tmdbId]||{}).filter(Boolean).length, 0)) >= 50,
        chirurgien:       seriesByGenre("médical").length >= 5,
        historien:        seriesByGenre("historique").length >= 10,
        aventurier:       countries.length >= 10,
        globe_trotter:    countries.length >= 20,

        // Bibliothèque
        partez:           libSize >= 1,
        collectionneur:   libSize >= 10,
        bibliothecaire:   libSize >= 50,
        archiviste:       libSize >= 100,
        conservateur:     libSize >= 200,
        watchlist_nais:   watchlistSize >= 10,
        liste_100:        watchlistSize >= 100,
        collection_sec:   listsCount >= 10,
        curateur:         lists.some(l => (l.likes || 0) >= 1),
        organise:         watchlistSize >= 5 && listsCount >= 3,

        // Complétion
        bienvenue:        profileFilled,
        jusqu_bout:       completedSeries.length >= 1,
        finisseur:        completedSeries.length >= 10,
        sans_repit:       completedSeries.length >= 25,
        papillonneur:     completedSeries.length >= 50,
        collec_fins:      completedSeries.length >= 100,
        cent_pourcent:    libSize > 0 && completedSeries.length === libSize,
        legende:          totalEpisodes >= 5000,
        un_pourcent:      false, // badge admin uniquement

        // Social
        enchante:         followingIds.length >= 1,
        reseau:           followingIds.length >= 25,
        cercle:           followingIds.length >= 10,
        populaire:        followerCount >= 50,
        diva:             followerCount >= 100,
        rok_star:         followerCount >= 200,
        fan:              totalLikesGiven >= 10,
        ambassadeur:      totalLikesGiven >= 25,
        premier_echange:  totalReviews >= 1,
        debatteur:        totalReviews >= 50,
        prem_interaction: totalLikesGiven >= 1,

        // Spéciaux
        noctambule:       hasNightActivity,
        en_bonne_voie:    maxStreak >= 7,
        bonne_reso:       maxStreak >= 30,
        inarretable:      maxStreak >= 100,
        inépuisable:      maxStreak >= 365,
        fidele:           daysSince >= 30,
        ancien:           daysSince >= 365,
        veteran:          daysSince >= 1095,
        precurseur:       daysSince <= 365,
        survivant:        completedSeries.filter(s => s.status === "Annulée" || s.cancelled).length >= 10,
        parieur:          library.some(s => (s.voteCount || s.popularity || 9999) < 100),
        testeur:          pilotOnly.length >= 20,
        nostalgique:      nostalgicCount >= 5,
        mauvaise_dec:     library.filter(s => !completedSeries.find(c=>c.tmdbId===s.tmdbId)).length >= 50,
        abandon:          abandonCount >= 1,
        rewatch:          Object.values(rewatchCounts).some(r => r.count >= 1),
        printemps:        seasonsSeen.size >= 4,
        automne:          autumnEps >= 50,
        hibernation:      hibernationDone,
        derniere_min:     false, // nécessite dates de sortie saisons TMDB
        noel:             activityLog.some(a => { const d = new Date(a.ts||0); return d.getDate()===25 && d.getMonth()===11; }),
        halloween:        activityLog.filter(a => {
          const d = new Date(a.ts||0);
          return a.type === "episode" && d.getMonth() === 9 &&
            watchedSeries.find(s => s.tmdbId === a.seriesId && (s.genres||[]).some(g => g.toLowerCase().includes("horreur")));
        }).length >= 5,
        st_valentin:      activityLog.some(a => { const d = new Date(a.ts||0); return d.getDate()===14 && d.getMonth()===1; }),
        summer:           summerEps >= 100,

        // Secrets
        oeuf_paques:      false, // nécessite compteur de clics sur posters
        encore_reveillé:  hours.some(h => h >= 4 && h < 5),
        boucle_inf:       Object.values(rewatchCounts).some(r => r.count >= 3),
        amour_eternel:    false, // nécessite notes par saison
        couch_potato:     maxEpsInDay >= 20,
        call_911:         call911Condition,
        batman:           batmanCondition,
        indecis:          library.filter(s => !completedSeries.find(c=>c.tmdbId===s.tmdbId)).length >= 20,
        i_did_it:         completedSeries.some(s => (s.rating || 0) <= 1 && (s.rating || 0) > 0),
        guilty_pleasure:  watchedSeries.some(s => s.userRating === 5 && (s.rating || 0) < 4),
        le_fidele:        leFideleCondition,
        le_puriste:       lePuristeCondition,
      };

    const newIds = Object.entries(rules).filter(([,v]) => v).map(([k]) => k);

    // Détecter les nouveaux déblocages pour le toast
    // On utilise une ref pour éviter les faux positifs au rechargement
    const prevIds = prevUnlockedRef.current;
    if (prevIds !== null) {
      const justUnlocked = newIds.filter(id => !prevIds.includes(id));
      if (justUnlocked.length > 0) {
        const newBadges = justUnlocked.map(id => ALL_BADGES.find(b => b.id === id)).filter(Boolean);
        if (newBadges.length > 0) setBadgeQueue(prev => [...prev, ...newBadges]);
      }
    }
    prevUnlockedRef.current = newIds;
    setUnlockedBadgeIds(newIds);
  }, [dataLoaded, watchedEpisodes, extraReviews, library, activityLog, lists, user, followingIds.length, followerCount]);

  // ── Auth + chargement initial ────────────────────────────────────────────
  const loadAllDataFor = async (uid) => {
    // Ferme toutes les pages/modales ouvertes pour éviter d'afficher
    // l'état visuel de l'ancien compte pendant le chargement du nouveau
    setShowSettingsPage(false);
    setShowWatchlistPage(false);
    setShowTVShowsPage(false);
    setShowUpcomingPage(false);
    setShowListsPage(false);
    setShowBadgesPage(false);
    setShowReviewsPage(false);
    setShowTagsPage(false);
    setShowCreateList(false);
    setViewingList(null);
    setDetailSeries(null);
    setSeeAllPage(null);
    setViewingProfile(null);
    setShowFollowersPage(false);
    setShowFollowingPage(false);
    setEpPopup(null);
    setConfirm(null);
    setTab("home");

    const saved = await loadSavedData(uid);
    setOnboarded(saved.onboarded || false);
    setUser(saved.user || { name: "Alex", genres: [], platforms: [] });
    setLibrary(saved.library || []);
    setExtraReviews(saved.extraReviews || {});
    setWatchHistory(saved.watchHistory || {});
    setActivityLog(saved.activityLog || []);
    setWatchedEpisodes(saved.watchedEpisodes || {});
    setLists(saved.lists || []);
    setTags(saved.tags || {});
    setUnlockedBadgeIds(saved.unlockedBadgeIds || ["premiers_pas","bienvenue","fidele","premier_mot","enchante"]);
    setPinnedBadgeIds(saved.pinnedBadgeIds || []);
    setRewatchCounts(saved.rewatchCounts || {});
    prevUnlockedRef.current = null; // évite un faux toast de badges au changement de compte
    if (uid) {
      try {
        const { followingIds: fids, followerIds } = await fetchFollows(uid);
        setFollowingIds(fids);
        setFollowerCount(followerIds.length);
      } catch(e) { console.warn("fetchFollows:", e); }
    } else {
      setFollowingIds([]);
      setFollowerCount(0);
      setFriendsActivity([]);
    }
    setDataLoaded(true);
  };

  const currentUidRef = useRef(undefined); // undefined = pas encore initialisé

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id || null;
      currentUidRef.current = uid;
      setAuthUser(session?.user || null);
      setAuthReady(true);
      await loadAllDataFor(uid);
    };
    init();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_e, session) => {
      const newUid = session?.user?.id || null;
      setAuthUser(session?.user || null);
      if (newUid !== currentUidRef.current) {
        currentUidRef.current = newUid;
        setDataLoaded(false);
        await loadAllDataFor(newUid);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Sauvegarde automatique dans localStorage ───────────────────────────────
  useEffect(() => {
    if (!dataLoaded) return; // Ne pas écraser avec des valeurs vides au 1er render
    persistData({ onboarded, user, library, extraReviews, watchHistory, activityLog, watchedEpisodes, lists, tags, unlockedBadgeIds, pinnedBadgeIds, rewatchCounts }, authUser?.id);
  }, [onboarded, user, library, extraReviews, watchHistory, activityLog, watchedEpisodes, lists, tags, unlockedBadgeIds, pinnedBadgeIds, rewatchCounts, dataLoaded]);

  useEffect(() => {
    if (!authUser?.id || followingIds.length === 0) { setFriendsActivity([]); return; }
    setFriendsActivityLoading(true);
    (async () => {
      try {
        const { data: profiles } = await supabase.from("profiles").select("id, data").in("id", followingIds);
        const acts = [];
        (profiles || []).forEach(p => {
          const u      = p.data?.user || {};
          const name   = u.name || "Utilisateur";
          const avatar = u.avatar || null;
          const lib    = p.data?.library || [];
          (p.data?.activityLog || []).slice(0, 15).forEach(a => {
            const series = lib.find(s => s.title && a.label?.includes(s.title)) || null;
            acts.push({ userId: p.id, name, avatar, series, ...a });
          });
        });
        acts.sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0));
        setFriendsActivity(acts.slice(0, 30));
      } catch(e) { console.warn("Friends activity:", e); }
      setFriendsActivityLoading(false);
    })();
  }, [authUser?.id, JSON.stringify(followingIds)]);

  const addActivity = (type, label) => {
    setActivityLog(prev => [{
      id: Date.now() + Math.random(),
      type,
      label,
      ts: new Date().toISOString(),
    }, ...prev]);
  };

  const handleRate = (id, rating, seriesData) => {
    setLibrary(prev => {
      const exists = prev.find(s => s.tmdbId === id);
      const base = exists ? prev : [...prev, { ...seriesData, tmdbId: id }];
      const updated = base.map(s => s.tmdbId === id ? { ...s, userRating: rating } : s);
      const series = updated.find(s => s.tmdbId === id);
      if (series) addActivity("rate", `Tu as noté ${series.title} ${"★".repeat(Math.floor(rating))}${rating % 1 ? "½" : ""}`);
      return updated;
    });
  };
  const handleMarkWatched = (id, seriesData, seasonsData) => {
    setLibrary(prev => {
      const exists = prev.find(s => s.tmdbId === id);
      const base = exists ? prev : [...prev, { ...seriesData, tmdbId: id }];
      const isCurrentlyWatched = exists?.watched || false;
      const updated = base.map(s => s.tmdbId === id ? { ...s, watched: !isCurrentlyWatched } : s);
      const series = updated.find(s => s.tmdbId === id);
      if (series?.watched) addActivity("watch", `Tu as vu ${series.title}`);
      return updated;
    });
    setWatchHistory(prev => {
      const isCurrentlyWatched = library.find(s => s.tmdbId === id)?.watched || false;
      if (isCurrentlyWatched) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: new Date().toISOString().slice(0, 10) };
    });
    // Coche automatiquement tous les épisodes si on marque comme vu
    if (seasonsData && seasonsData.length > 0) {
      const isCurrentlyWatched = library.find(s => s.tmdbId === id)?.watched || false;
      if (!isCurrentlyWatched) {
        const allEps = {};
        seasonsData.forEach(season => {
          season.episodes.forEach(ep => {
            allEps[`S${season.n}E${ep.ep}`] = true;
          });
        });
        setWatchedEpisodes(prev => ({ ...prev, [id]: allEps }));
      } else {
        // On dé-marque : vider les épisodes aussi
        setWatchedEpisodes(prev => { const next = { ...prev }; delete next[id]; return next; });
      }
    }
  };
  const handleToggleWatchlist = (id, seriesData) => {
    setLibrary(prev => {
      const exists = prev.find(s => s.tmdbId === id);
      if (exists) {
        const updated = prev.map(s => s.tmdbId === id ? { ...s, inWatchlist: !s.inWatchlist } : s);
        const series = updated.find(s => s.tmdbId === id);
        if (series?.inWatchlist) addActivity("watchlist", `Tu as ajouté ${series.title} à ta Watchlist`);
        else addActivity("watchlist", `Tu as retiré ${series.title} de ta Watchlist`);
        return updated;
      } else if (seriesData) {
        addActivity("watchlist", `Tu as ajouté ${seriesData.title} à ta Watchlist`);
        return [...prev, { ...seriesData, inWatchlist: true }];
      }
      return prev;
    });
  };
  const openSeries = useCallback(s => {
    const existing = library.find(l => l.tmdbId === s.tmdbId);
    setDetailSeries(existing || s);
  }, [library]);
  const handleAddReview = (sid, review) => {
    const cur = extraReviews[sid] || [];
    const series = library.find(s => s.tmdbId === sid);
    setExtraReviews(p => ({ ...p, [sid]: [...cur, { id: Date.now(), user: user.name, avatar: user.name[0].toUpperCase(), rating: review.rating, text: review.text, likes: 0, liked: false, date: "Aujourd'hui" }] }));
    if (series) addActivity("review", `Tu as review ${series.title}`);
  };
  const handleSeriesMetaLoaded = (tmdbId, meta) => {
    setLibrary(prev => prev.map(s => s.tmdbId === tmdbId ? { ...s, ...meta } : s));
  };

  const handleRewatch = (id, title) => {
    setRewatchCounts(prev => {
      const cur = prev[id] || { count: 0, lastDate: null };
      return { ...prev, [id]: { count: cur.count + 1, lastDate: new Date().toISOString().slice(0, 10) } };
    });
    addActivity("rewatch", "Tu as rewatch" + title);
  };

  const handleDeleteReview = (sid, rid) => {
    setExtraReviews(prev => ({
      ...prev,
      [sid]: (prev[sid] || []).filter((r, i) => (r.id || i) !== rid),
    }));
  };

  const handleToggleLike = (sid, rid) => {
    const cur = extraReviews[sid] || [];
    const review = cur.find(r => r.id === rid);
    const series = library.find(s => s.tmdbId === sid);
    const alreadyLiked = review?.liked;
    setExtraReviews(p => ({ ...p, [sid]: cur.map(r => r.id===rid ? { ...r, liked: !r.liked, likes: r.liked?r.likes-1:r.likes+1 } : r) }));
    if (!alreadyLiked && series) addActivity("like", `Tu as aimé la critique de ${review?.user || "quelqu'un"} sur ${series.title}`);
  };

  const handleAddTag = (tmdbId, tag) => {
    setTags(prev => {
      const existing = prev[tmdbId] || [];
      if (existing.includes(tag)) return prev;
      return { ...prev, [tmdbId]: [...existing, tag] };
    });
  };
  const handleRemoveTag = (tmdbId, tag) => {
    setTags(prev => ({ ...prev, [tmdbId]: (prev[tmdbId] || []).filter(t => t !== tag) }));
  };

  // Défile les badges un par un — 3 secondes par badge, 0.5s entre chaque
  useEffect(() => {
    if (badgeQueue.length === 0 || newlyUnlocked) return;
    const next = badgeQueue[0];
    setNewlyUnlocked(next);
    setBadgeQueue(prev => prev.slice(1));
    const timer = setTimeout(() => setNewlyUnlocked(null), 3000);
    return () => clearTimeout(timer);
  }, [badgeQueue, newlyUnlocked]);

  const watched = library.filter(s => s.watched);
  const NAV_ICONS = {
    home: (a) => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a?ORANGE:"#444"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>),
    diary: (a) => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a?ORANGE:"#444"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>),
    search: (a) => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a?ORANGE:"#444"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>),
    profile: (a) => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a?ORANGE:"#444"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>),
  };
  const tabs = [
    { id: "home",    label: "Accueil" },
    { id: "diary",   label: "Diary" },
    { id: "search",  label: "Chercher" },
    { id: "profile", label: "Profil" },
  ];

  if (!authReady || (authUser && !dataLoaded)) return (
    <div style={{ height:"100vh", background:"#080808", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <Spinner size={32} />
    </div>
  );

  if (!authUser) return (
    <div style={{ position: "fixed", inset: 0, zIndex: 99999 }}>
      <AuthScreen />
    </div>
  );

  if (!onboarded) return (
    <div style={{ height: "100vh", background: "#080808", display: "flex", justifyContent: "center", fontFamily: "'DM Sans',system-ui,sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@300;400;500;600;700&display=swap');*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{display:none}input::placeholder{color:#444}`}</style>
      <Onboarding onComplete={d => { setUser({ ...d, joinDate: new Date().toISOString() }); setOnboarded(true); }} />
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#080808", display: "flex", justifyContent: "center", fontFamily: "'DM Sans',system-ui,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        @keyframes slideInRight{from{transform:translateX(30px);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes slideInUp{from{transform:translateX(-50%) translateY(20px);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}
        @keyframes spin{to{transform:rotate(360deg)}}
        *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
        ::-webkit-scrollbar{display:none}
        input::placeholder,textarea::placeholder{color:#444}
      `}</style>

      <div style={{ width: "100%", maxWidth: 440, position: "relative", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {detailSeries && <SeriesDetailPage series={detailSeries} library={library} onClose={() => setDetailSeries(null)} onRate={handleRate} onMarkWatched={handleMarkWatched} onToggleWatchlist={handleToggleWatchlist} watchHistory={watchHistory} allReviews={extraReviews} onAddReview={handleAddReview} onToggleLike={handleToggleLike} onActivity={addActivity} watchedEpisodes={watchedEpisodes[detailSeries?.tmdbId] || {}} rewatchData={rewatchCounts[detailSeries?.tmdbId] || null} onRewatch={(title) => askConfirm('Veux-tu ajouter un rewatch pour ' + title + ' ?', () => handleRewatch(detailSeries.tmdbId, title), { title: 'Rewatch', confirmLabel: 'Confirmer', danger: false })} onAskConfirm={askConfirm} onSeriesMetaLoaded={handleSeriesMetaLoaded} onEpPopup={(ep, seasonN) => setEpPopup({ ep, seasonN, tmdbId: detailSeries?.tmdbId })} friendsData={friendsActivity.filter(f => f.series?.tmdbId === detailSeries?.tmdbId)} onWatchedEpisodesChange={(eps) => {
          setWatchedEpisodes(prev => ({ ...prev, [detailSeries.tmdbId]: eps }));
          // Auto-ajouter à la library si pas encore présente et qu'on coche un épisode
          const hasAny = Object.values(eps).some(Boolean);
          if (hasAny) {
            setLibrary(prev => {
              if (prev.find(s => s.tmdbId === detailSeries.tmdbId)) return prev;
              return [...prev, { ...detailSeries }];
            });
          }
        }} onOpen={openSeries} />}

        {/* Header — fixed */}
        <div style={{ position: "fixed", top: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 440, zIndex: 40, background: "#080808", padding: "52px 20px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif", letterSpacing: "-.5px" }}>Series<span style={{ color: ORANGE }}>Boxd</span></div>
            {tab === "home" && <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>Bienvenue, {user.name} 👋</div>}
          </div>
          {tab === "profile" && (
          <div onClick={() => setShowSettingsPage(true)} style={{ width: 38, height: 38, borderRadius: "50%", background: "#111", border: "1px solid #1e1e1e", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#eca6ee" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </div>
        )}  
        </div>

        <div ref={mainScrollRef} style={{ flex: 1, overflowY: "auto", paddingBottom: 90, paddingTop: 96 }}>

          {/* HOME */}
          {tab === "home" && (
            <div style={{ paddingTop: 16 }}>

              <ContinueWatchingSection library={library} watchedEpisodes={watchedEpisodes} onOpen={openSeries} onSeeAll={() => setSeeAllPage({ title: "⏳ En cours de visionnage", inProgressList: library.filter(s => { const eps = watchedEpisodes[s.tmdbId]; return eps && Object.values(eps).some(Boolean) && !s.watched; }) })} />
              <HomeSection title="🔥 Popular this week" endpoint="/trending/tv/week" onOpen={openSeries} onSeeAll={() => setSeeAllPage({ title: "🔥 Popular this week", endpoint: "/trending/tv/week" })} />
              <HomeSection title="⭐ Best rated"  endpoint="/tv/top_rated"     onOpen={openSeries} onSeeAll={() => setSeeAllPage({ title: "⭐ Best rated", endpoint: "/tv/top_rated" })} />
              <HomeSection title="📡 Nouveautés"        endpoint="/tv/on_the_air"    onOpen={openSeries} onSeeAll={() => setSeeAllPage({ title: "📡 Nouveautés", endpoint: "/tv/on_the_air" })} />
              <PopularWithFriends friendsActivity={friendsActivity} followingIds={followingIds} onOpen={openSeries} onSeeAll={() => setSeeAllPage({ title: "👥 Popular with friends", inProgressList: friendsActivity.reduce((acc, a) => { if (a.series && !acc.find(s => s.tmdbId === a.series.tmdbId)) { const { watched, userRating, inWatchlist, ...clean } = a.series; acc.push(clean); } return acc; }, []) })} />
            </div>
          )}

          {/* DIARY */}
          {tab === "diary" && (() => {
            const ic = (symbol, size=18) => <span style={{color:ORANGE,fontSize:size,lineHeight:1}}>{symbol}</span>;
            const ICONS = { watch: ic("◉"), rate: ic("★",20), review: ic("✎"), like: ic("♥"), episode: ic("▶",15), watchlist: ic("◈"), list: ic("≡") };
            const formatRelative = (iso) => {
              const diff = Date.now() - new Date(iso).getTime();
              const m = Math.floor(diff / 60000);
              if (m < 1) return "À l'instant";
              if (m < 60) return `Il y a ${m} min`;
              const h = Math.floor(m / 60);
              if (h < 24) return `Il y a ${h}h`;
              const d = Math.floor(h / 24);
              if (d < 7) return `Il y a ${d}j`;
              return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
            };
            return (
              <div>
                {/* Onglets Mine / Friends */}
                <div style={{ display: "flex", borderBottom: "1px solid #161616", marginBottom: 0 }}>
                  {["mine", "friends"].map(t => (
                    <button key={t} onClick={() => setDiaryTab(t)} style={{ flex: 1, padding: "14px 0", background: "none", border: "none", borderBottom: diaryTab === t ? `2px solid ${ORANGE}` : "2px solid transparent", color: diaryTab === t ? "#fff" : "#555", fontSize: 14, fontWeight: diaryTab === t ? 700 : 400, cursor: "pointer", letterSpacing: ".02em" }}>
                      {t === "mine" ? "Mine" : "Friends"}
                    </button>
                  ))}
                </div>

                {/* MINE */}
                {diaryTab === "mine" && (
                  <div style={{ padding: "12px 20px 40px" }}>
                    {activityLog.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "60px 0" }}>
                        <div style={{ fontSize: 36, marginBottom: 16 }}>📖</div>
                        <div style={{ color: "#333", fontSize: 14 }}>Ton activité apparaîtra ici</div>
                        <div style={{ color: "#2a2a2a", fontSize: 12, marginTop: 8 }}>Note une série, coche des épisodes...</div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {activityLog.map((entry, i) => (
                          <div key={entry.id || i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "#0e0e0e", borderRadius: 12, border: "1px solid #181818" }}>
                            {/* Avatar */}
                            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #c026d3, #f0abfc)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: "#fff", flexShrink: 0, overflow: "hidden" }}>
                              {user.avatar ? <img src={user.avatar} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span>{(user.name||"?")[0].toUpperCase()}</span>}
                            </div>
                            {/* Contenu */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{user.pseudo || user.name}</span>
                              <span style={{ color: "#666", fontSize: 13 }}> {entry.label}</span>
                            </div>
                            {/* Temps */}
                            <div style={{ fontSize: 11, color: "#444", flexShrink: 0 }}>{formatRelative(entry.ts)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* FRIENDS */}
                {diaryTab === "friends" && (
                  <div style={{ padding: "12px 20px 40px" }}>
                    {followingIds.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "60px 0" }}>
                        <div style={{ fontSize: 36, marginBottom: 16 }}>👥</div>
                        <div style={{ color: "#333", fontSize: 14 }}>Suis des amis pour voir leur activité</div>
                        <div style={{ color: "#2a2a2a", fontSize: 12, marginTop: 8 }}>Recherche des amis dans l'onglet Chercher</div>
                      </div>
                    ) : friendsActivityLoading ? (
                      <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
                        <div style={{ width: 22, height: 22, border: "2px solid #1a1a1a", borderTop: `2px solid ${ORANGE}`, borderRadius: "50%", animation: "spin .8s linear infinite" }} />
                      </div>
                    ) : friendsActivity.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "60px 0" }}>
                        <div style={{ color: "#333", fontSize: 14 }}>Aucune activité récente de tes amis</div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {friendsActivity.map((f, i) => (
                          <div key={i} onClick={() => setViewingProfile({ userId: f.userId })} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "#0e0e0e", borderRadius: 12, border: "1px solid #181818", cursor: "pointer" }}>
                            {/* Avatar */}
                            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #c026d3, #f0abfc)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 14, flexShrink: 0, overflow: "hidden" }}>
                              {f.avatar ? <img src={f.avatar} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span>{(f.name||"?")[0].toUpperCase()}</span>}
                            </div>
                            {/* Contenu */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{f.name}</span>
                              <span style={{ color: "#666", fontSize: 13 }}> {(f.label || "").replace(/^Tu as /, "a ").replace(/^Tu /, "")}</span>
                            </div>
                            {/* Temps */}
                            <div style={{ fontSize: 11, color: "#444", flexShrink: 0 }}>{formatRelativeTime(f.ts)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

                    {/* SEARCH */}
          {tab === "search" && <SearchPage onOpen={openSeries} onViewProfile={uid => setViewingProfile({ userId: uid })} currentUserId={authUser?.id} />}

          {/* PROFILE */}
          {tab === "profile" && (
            <div>
              <div style={{ textAlign: "center", marginBottom: 20, padding: "0 20px" }}>
                {/* Avatar */}
                <div style={{ width: 80, height: 80, borderRadius: "50%", background: "linear-gradient(135deg, #c026d3, #f0abfc)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 30, color: "#fff", margin: "0 auto 14px", overflow: "hidden", border: "3px solid #1a1a1a" }}>
                  {user.avatar
                    ? <img src={user.avatar} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <span>{user.name[0].toUpperCase()}</span>
                  }
                </div>
                {/* Nom complet */}
                <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif" }}>{user.name}</div>
                {/* Bio */}
                {user.bio && <div style={{ fontSize: 13, color: "#888", marginTop: 8, lineHeight: 1.5, maxWidth: 280, margin: "8px auto 0" }}>{user.bio}</div>}
                {/* Pseudo + membre depuis */}
                <div style={{ fontSize: 12, color: "#555", marginTop: 8 }}>
                  @{user.pseudo || user.name}
                  {user.location && <span style={{ color: "#444" }}> · 📍 {user.location}</span>}
                  <span style={{ color: "#444" }}> · membre depuis 2025</span>
                </div>
                {/* Website */}
                {user.website && <div style={{ marginTop: 6 }}><a href={user.website} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: ORANGE, textDecoration: "none" }}>{user.website.replace(/^https?:\/\//, "")}</a></div>}
              </div>

              {/* Genres favoris encart — au-dessus des stats */}
              {(user.favGenres || user.genres || []).length > 0 && (
                <div style={{ margin: "0 20px 16px", padding: "14px 16px", background: "#1a1a1a", border: "1px solid rgba(219, 157, 228, 0.94)", borderRadius: 14 }}>
                  <div style={{ fontSize: 10, color: "#fff", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>✦ Genres favoris</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                    {(user.favGenres || user.genres || []).map(g => (
                      <span key={g} style={{ background: "#2a2a2a", border: `1px solid ${ORANGE_BORDER}`, color: "#fff", fontSize: 12, padding: "5px 12px", borderRadius: 20, fontWeight: 500 }}>{g}</span>
                    ))}
                  </div>
                </div>
              )}

              {(() => {
                const stats = computeStats(watched, watchedEpisodes);
                return (
                  <>
                    {/* Stats */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 8, padding: "0 20px" }}>
                      {[
                        { n: watched.length, label: "Vues" },
                        { n: Object.values(watchedEpisodes).reduce((acc, eps) => acc + Object.values(eps).filter(Boolean).length, 0), label: "Épisodes" },
                        { n: formatTime(stats.totalMins), label: "Temps" },
                        { n: "12", label: "Abonnés" },
                      ].map((stat, i) => (
                        <div key={i} style={{ background: "#0e0e0e", borderRadius: 12, padding: "10px 6px", textAlign: "center", border: "1px solid #181818" }}>
                          <div style={{ fontSize: 9, color: "#555", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".04em" }}>{stat.label}</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: ORANGE, fontFamily: "'Playfair Display',Georgia,serif", lineHeight: 1 }}>{stat.n}</div>
                        </div>
                      ))}
                    </div>
                    {/* Badges épinglés */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 24, padding: "0 20px" }}>
                      {[0,1,2,3].map(i => {
                        const bid = pinnedBadgeIds[i];
                        const badge = bid ? ALL_BADGES.find(b => b.id === bid) : null;
                        return (
                          <div key={i} onClick={() => setShowBadgesPage(true)} style={{ background: "#0e0e0e", borderRadius: 12, padding: "10px 6px", border: badge ? `1px solid ${badge.color}33` : "1px dashed #1e1e1e", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }}>
                            {badge
                              ? <><HexBadge badge={badge} unlocked size={38} /><div style={{ fontSize: 8, color: badge.color, textAlign: "center", lineHeight: 1.2, fontWeight: 600 }}>{badge.name}</div></>
                              : <><span style={{ fontSize: 16, opacity: 0.12 }}>⬡</span><div style={{ fontSize: 8, color: "#2a2a2a", textTransform: "uppercase", letterSpacing: ".04em" }}>Vide</div></>
                            }
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}

              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 12, padding: "0 20px" }}>Favorite TV Shows</div>
                {(() => {
                  const favs = (user.favShows && user.favShows.length > 0) ? user.favShows : watched.slice(0,4);
                  return favs.length === 0
                    ? <div style={{ padding: "0 20px", color: "#333", fontSize: 13 }}>Marque des séries comme vues pour les afficher ici</div>
                    : <div style={{ display: "flex", gap: 10, padding: "0 20px" }}>{favs.map(s => <div key={s.tmdbId} style={{ flex: 1 }}><PosterCard series={s} onOpen={openSeries} /></div>)}</div>;
                })()}
              </div>

              <div style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0 20px", marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>Activités récentes</div>
                  {(() => {
                    const activityMap = {};
                    activityLog.filter(a => ["watch","rate","review"].includes(a.type)).forEach(a => {
                      const series = library.find(s => a.label?.includes(s.title));
                      if (!series) return;
                      const key = series.tmdbId;
                      if (!activityMap[key]) activityMap[key] = { series, watched: false, rated: false, reviewed: false, ts: a.ts };
                      if (a.type === "watch")  activityMap[key].watched  = true;
                      if (a.type === "rate")   activityMap[key].rated    = true;
                      if (a.type === "review") activityMap[key].reviewed = true;
                      if (a.ts > activityMap[key].ts) activityMap[key].ts = a.ts;
                    });
                    const allItems = Object.values(activityMap).sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));
                    if (allItems.length <= 4) return null;
                    return (
                      <div onClick={() => setSeeAllPage({ title: "Activités récentes", inProgressList: allItems.map(i => ({ ...i.series, _hasReview: i.reviewed, _hideRating: true })) })} style={{ fontSize: 12, color: ORANGE, cursor: "pointer" }}>Tout voir</div>
                    );
                  })()}
                </div>
                {(() => {
                  const activityMap = {};
                  activityLog.filter(a => ["watch","rate","review"].includes(a.type)).forEach(a => {
                    const series = library.find(s => a.label?.includes(s.title));
                    if (!series) return;
                    const key = series.tmdbId;
                    if (!activityMap[key]) activityMap[key] = { series, watched: false, rated: false, reviewed: false, ts: a.ts };
                    if (a.type === "watch")  activityMap[key].watched  = true;
                    if (a.type === "rate")   activityMap[key].rated    = true;
                    if (a.type === "review") activityMap[key].reviewed = true;
                    if (a.ts > activityMap[key].ts) activityMap[key].ts = a.ts;
                  });
                  const recentItems = Object.values(activityMap).sort((a, b) => (b.ts || "").localeCompare(a.ts || "")).slice(0, 4);

                  if (recentItems.length === 0) {
                    return <div style={{ padding: "0 20px", color: "#333", fontSize: 13 }}>Aucune activité pour l'instant</div>;
                  }

                  return (
                    <div style={{ display: "flex", gap: 12, padding: "0 20px", overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
                      {recentItems.map(({ series: s, rated, reviewed }) => (
                        <div key={s.tmdbId} style={{ width: 90, flexShrink: 0 }}>
                          <div onClick={() => openSeries(s)} style={{ width: 90, height: 135, borderRadius: 10, overflow: "hidden", background: "#1a1a1a", cursor: "pointer" }}>
                            {s.poster && <img src={s.poster} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                          </div>
                          {(rated || reviewed) && (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 5 }}>
                              {rated && s.userRating && (
                                <span style={{ color: ORANGE, fontSize: 11, letterSpacing: 1 }}>
                                  {"★".repeat(Math.floor(s.userRating))}{s.userRating % 1 ? "½" : ""}
                                </span>
                              )}
                              {reviewed && <span style={{ fontSize: 11 }}>💬</span>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {(() => {
                const stats = computeStats(watched, watchedEpisodes);
                return (
                  <>
                    <div style={{ marginBottom: 24, padding: "0 20px" }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 4 }}>Genres regardés</div>
                      <div style={{ fontSize: 11, color: "#555", marginBottom: 16 }}>Répartition de tes séries vues</div>
                      <div style={{ background: "#0c0c0c", borderRadius: 16, padding: "18px 16px", border: "1px solid #181818" }}>
                        {stats.genreData.length > 0 ? <GenreDonut genreData={stats.genreData} /> : <div style={{ color: "#333", fontSize: 13, textAlign: "center", padding: "16px 0" }}>Aucune série vue pour l'instant</div>}
                      </div>
                    </div>
                    <div style={{ marginBottom: 24, padding: "0 20px" }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 4 }}>Distribution des notes</div>
                      <div style={{ fontSize: 11, color: "#555", marginBottom: 16 }}>Comment tu notes tes séries</div>
                      <div style={{ background: "#0c0c0c", borderRadius: 16, padding: "18px 16px", border: "1px solid #181818" }}>
                        <RatingBars ratingDist={stats.ratingDist} avgRating={stats.avgRating} />
                      </div>
                    </div>
                  </>
                );
              })()}

              <div style={{ borderTop: "1px solid #161616", marginBottom: 4 }}>
                {profileNavItems.map(item => {
                  const isActive = profileTab === item;

                  // Compteur par onglet
                  const countMap = {
                    "TV Shows":     watched.length,
                    "Watchlist":    library.filter(s => s.inWatchlist).length,
                    "Badges":       unlockedBadgeIds.length,
                    "Reviews":      Object.values(extraReviews).flat().length,
                    "Lists":        lists.length,
                    "Tags":         [...new Set(Object.values(tags).flat())].length,
                    "Abonnements":  followingIds.length,
                    "Abonnés":      followerCount,
                  };
                  const count = countMap[item] ?? 0;

                  return (
                    <button key={item} onClick={() => {
                      if (item === "Watchlist") { setShowWatchlistPage(true); return; }
                      if (item === "TV Shows")  { setShowTVShowsPage(true);  return; }
                      if (item === "À venir")   { setShowUpcomingPage(true); return; }
                      if (item === "Lists")    { setShowListsPage(true);    return; }
                      if (item === "Badges")   { setShowBadgesPage(true);  return; }
                      if (item === "Reviews")  { setShowReviewsPage(true); return; }
                      if (item === "Tags")        { setShowTagsPage(true);      return; }
                      if (item === "Abonn\u00e9s")    { setShowFollowersPage(true); return; }
                      if (item === "Abonnements") { setShowFollowingPage(true); return; }
                      setProfileTab(item);
                    }} style={{
                      display: "flex", alignItems: "center", width: "100%",
                      padding: "14px 20px", background: "none", border: "none",
                      borderBottom: "1px solid #111",
                      borderLeft: `3px solid ${isActive ? ORANGE : "transparent"}`,
                      cursor: "pointer", transition: "border-color .15s",
                    }}>
                      <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? "#fff" : "#555", flex: 1, textAlign: "left" }}>{item}</span>
                      {count > 0 && <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? "#fff" : "#555", marginRight: 10 }}>{count}</span>}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isActive ? ORANGE : "#2a2a2a"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  );
                })}
              </div>

            </div>
          )}
        </div>

        {/* TV Shows Page */}
        {/* Toast badge débloqué */}
        {newlyUnlocked && (
          <div onClick={() => setNewlyUnlocked(null)} style={{ position: "fixed", bottom: 100, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: "#111", border: `1px solid ${newlyUnlocked.color}66`, borderRadius: 16, padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, boxShadow: `0 8px 32px rgba(0,0,0,.8), 0 0 20px ${newlyUnlocked.color}33`, maxWidth: 320, cursor: "pointer", animation: "slideInUp .3s ease", width: "calc(100% - 40px)" }}>
            <HexBadge badge={newlyUnlocked} unlocked size={44} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: newlyUnlocked.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>Badge débloqué 🎉</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginTop: 2 }}>{newlyUnlocked.name}</div>
              <div style={{ fontSize: 11, color: "#555", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{newlyUnlocked.desc}</div>
            </div>
            {badgeQueue.length > 0 && (
              <div style={{ background: newlyUnlocked.color + "33", border: `1px solid ${newlyUnlocked.color}66`, borderRadius: 12, padding: "3px 8px", fontSize: 11, color: newlyUnlocked.color, fontWeight: 700, flexShrink: 0 }}>+{badgeQueue.length}</div>
            )}
          </div>
        )}
        {showSettingsPage && <SettingsPage user={user} onSave={u => { setUser(u); }} onClose={() => setShowSettingsPage(false)} watched={watched} library={library} authEmail={authUser?.email} onLogout={async () => { await supabase.auth.signOut(); }} />}
        {seeAllPage && <SeeAllPage title={seeAllPage.title} endpoint={seeAllPage.endpoint} inProgressList={seeAllPage.inProgressList} onOpen={(s) => openSeries(s)} onClose={() => setSeeAllPage(null)} />}
        {showUpcomingPage && <UpcomingPage library={library} />}
        {showTVShowsPage && <TVShowsPage watched={watched} watchHistory={watchHistory} openSeries={openSeries} rewatchCounts={rewatchCounts} />}

        {/* Watchlist Page */}
        {showWatchlistPage && <WatchlistPage library={library} openSeries={openSeries} />}


        {/* ── LISTS PAGE ──────────────────────────────────────────────── */}
        {showListsPage && !showCreateList && !viewingList && (
          <div ref={el => el && el.scrollTo(0,0)} style={{ position: "fixed", inset: 0, background: "#080808", zIndex: 900, overflowY: "auto", paddingBottom: 90, maxWidth: 440, margin: "0 auto" }}>
            {/* Header */}
            <div style={{ padding: "52px 20px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif" }}>Lists</div>
                <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{lists.length} liste{lists.length !== 1 ? "s" : ""}</div>
              </div>
              <button onClick={() => setShowCreateList(true)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
            </div>

            {lists.length === 0 ? (
              <div />
            ) : (
              <div style={{ padding: "0 20px" }}>
                {lists.map(list => (
                  <div key={list.id} onClick={() => setViewingList(list)} style={{ padding: "16px 0", borderBottom: "1px solid #111", cursor: "pointer" }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      {/* Mini poster collage */}
                      <div style={{ width: 72, height: 72, borderRadius: 12, overflow: "hidden", background: "#111", flexShrink: 0, display: "grid", gridTemplateColumns: list.items.length >= 2 ? "1fr 1fr" : "1fr", gridTemplateRows: list.items.length >= 3 ? "1fr 1fr" : "1fr", gap: 1 }}>
                        {list.items.length === 0
                          ? <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "#2a2a2a", fontSize: 22 }}>☰</div>
                          : list.items.slice(0, 4).map((s, i) => (
                            <div key={i} style={{ overflow: "hidden", background: "#1a1a1a" }}>
                              {s.poster ? <img src={s.poster} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", background: "#1a1a1a" }} />}
                            </div>
                          ))
                        }
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#fff", fontWeight: 600, fontSize: 15, fontFamily: "'Playfair Display',Georgia,serif", lineHeight: 1.3 }}>{list.name}</div>
                        {list.description ? <div style={{ color: "#555", fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>{list.description}</div> : null}
                        <div style={{ color: "#444", fontSize: 11, marginTop: 6 }}>{list.items.length} série{list.items.length !== 1 ? "s" : ""} · {new Date(list.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</div>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 4, flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── CREATE LIST PAGE ─────────────────────────────────────────── */}
        {showListsPage && showCreateList && (() => {
          const CreateListView = () => {
            const [listName, setListName] = useState("");
            const [listDesc, setListDesc] = useState("");
            const [searchQ, setSearchQ] = useState("");
            const [searchResults, setSearchResults] = useState([]);
            const [searching, setSearching] = useState(false);
            const [selectedItems, setSelectedItems] = useState([]);
            const debounceRef = useRef(null);

            useEffect(() => {
              clearTimeout(debounceRef.current);
              if (!searchQ.trim()) { setSearchResults([]); return; }
              setSearching(true);
              debounceRef.current = setTimeout(async () => {
                try {
                  const data = await tmdbViaClaude("/search/tv", { query: searchQ, language: "fr-FR" });
                  setSearchResults((data.results || []).slice(0, 8).map(adaptShow));
                } catch { setSearchResults([]); }
                setSearching(false);
              }, 450);
            }, [searchQ]);

            const toggleItem = (s) => {
              setSelectedItems(prev =>
                prev.find(i => i.tmdbId === s.tmdbId)
                  ? prev.filter(i => i.tmdbId !== s.tmdbId)
                  : [...prev, s]
              );
            };

            const handleSave = () => {
              if (!listName.trim()) return;
              const newList = {
                id: Date.now(),
                name: listName.trim(),
                description: listDesc.trim(),
                items: selectedItems,
                createdAt: new Date().toISOString(),
              };
              setLists(prev => [newList, ...prev]);
              addActivity("list", `Tu as créé la liste "${newList.name}"`);
              setShowCreateList(false);
            };

            const canSave = listName.trim().length > 0;

            return (
              <div ref={el => el && el.scrollTo(0,0)} style={{ position: "fixed", inset: 0, background: "#080808", zIndex: 910, overflowY: "auto", paddingBottom: 100, maxWidth: 440, margin: "0 auto" }}>
                {/* Header */}
                <div style={{ padding: "52px 20px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif" }}>Nouvelle liste</div>
                  <button onClick={handleSave} disabled={!canSave} style={{ padding: "8px 18px", background: canSave ? ORANGE_DIM : "#111", border: `1px solid ${canSave ? ORANGE_BORDER : "#222"}`, borderRadius: 20, color: canSave ? ORANGE : "#444", fontSize: 13, fontWeight: 600, cursor: canSave ? "pointer" : "default", transition: "all .2s" }}>
                    Enregistrer
                  </button>
                </div>

                <div style={{ padding: "0 20px" }}>
                  {/* List name */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 8 }}>List name</div>
                    <input
                      value={listName}
                      onChange={e => setListName(e.target.value)}
                      placeholder="Ex. Séries à regarder cet hiver…"
                      style={{ width: "100%", padding: "14px 16px", background: "#0e0e0e", border: `1px solid ${listName.trim() ? ORANGE_BORDER : "#1e1e1e"}`, borderRadius: 14, color: "#fff", fontSize: 15, outline: "none", fontFamily: "'DM Sans',system-ui,sans-serif", transition: "border-color .2s" }}
                    />
                  </div>

                  {/* Description */}
                  <div style={{ marginBottom: 28 }}>
                    <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 8 }}>Add description</div>
                    <textarea
                      value={listDesc}
                      onChange={e => setListDesc(e.target.value)}
                      placeholder="Décris ta liste en quelques mots…"
                      rows={3}
                      style={{ width: "100%", padding: "14px 16px", background: "#0e0e0e", border: "1px solid #1e1e1e", borderRadius: 14, color: "#fff", fontSize: 14, outline: "none", resize: "none", fontFamily: "'DM Sans',system-ui,sans-serif", lineHeight: 1.5 }}
                    />
                  </div>

                  {/* Selected items preview */}
                  {selectedItems.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 10 }}>{selectedItems.length} série{selectedItems.length > 1 ? "s" : ""} ajoutée{selectedItems.length > 1 ? "s" : ""}</div>
                      <div style={{ display: "flex", gap: 10, overflowX: "auto" }}>
                        {selectedItems.map(s => (
                          <div key={s.tmdbId} style={{ flexShrink: 0, position: "relative", width: 64 }}>
                            <div style={{ width: 64, height: 96, borderRadius: 10, overflow: "hidden", background: "#1a1a1a" }}>
                              {s.poster ? <img src={s.poster} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", background: "#1a1a1a" }} />}
                            </div>
                            <button onClick={() => toggleItem(s)} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: "#c026d3", border: "none", color: "#fff", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>×</button>
                            <div style={{ fontSize: 9, color: "#888", marginTop: 4, textAlign: "center", lineHeight: 1.2, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{s.title}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Search */}
                  <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 10 }}>Ajouter des séries</div>
                  <div style={{ position: "relative", marginBottom: 16 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>
                    <input
                      value={searchQ}
                      onChange={e => setSearchQ(e.target.value)}
                      placeholder="Chercher une série à ajouter…"
                      style={{ width: "100%", padding: "12px 14px 12px 40px", background: "#0e0e0e", border: "1px solid #1e1e1e", borderRadius: 12, color: "#fff", fontSize: 14, outline: "none", fontFamily: "'DM Sans',system-ui,sans-serif" }}
                    />
                  </div>

                  {/* Search results */}
                  {searching && (
                    <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
                      <div style={{ width: 22, height: 22, border: "2px solid #1a1a1a", borderTop: `2px solid ${ORANGE}`, borderRadius: "50%", animation: "spin .8s linear infinite" }} />
                    </div>
                  )}
                  {!searching && searchResults.map(s => {
                    const added = !!selectedItems.find(i => i.tmdbId === s.tmdbId);
                    return (
                      <div key={s.tmdbId} onClick={() => toggleItem(s)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #0e0e0e", cursor: "pointer" }}>
                        <div style={{ width: 44, height: 66, borderRadius: 8, overflow: "hidden", background: "#1a1a1a", flexShrink: 0 }}>
                          {s.poster && <img src={s.poster} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: "#fff", fontWeight: 600, fontSize: 14, fontFamily: "'Playfair Display',Georgia,serif" }}>{s.title}</div>
                          <div style={{ color: "#555", fontSize: 12, marginTop: 2 }}>{s.year} · {s.genre}</div>
                        </div>
                        <div style={{ width: 26, height: 26, borderRadius: "50%", background: added ? ORANGE_DIM : "#111", border: `1.5px solid ${added ? ORANGE_BORDER : "#2a2a2a"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .2s" }}>
                          {added
                            ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          }
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          };
          return <CreateListView />;
        })()}

        {/* ── VIEW LIST PAGE ───────────────────────────────────────────── */}
        {showListsPage && viewingList && !showCreateList && (() => {
          const list = lists.find(l => l.id === viewingList.id) || viewingList;
          return (
            <div ref={el => el && el.scrollTo(0,0)} style={{ position: "fixed", inset: 0, background: "#080808", zIndex: 910, overflowY: "auto", paddingBottom: 90, maxWidth: 440, margin: "0 auto" }}>
              <div style={{ padding: "52px 20px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif" }}>{list.name}</div>
                  <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{list.items.length} série{list.items.length !== 1 ? "s" : ""}</div>
                </div>
                <button onClick={() => askConfirm(`Supprimer la liste "${list.name}" ?`, () => { setLists(prev => prev.filter(l => l.id !== list.id)); setViewingList(null); })} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                </button>
              </div>
              {list.description ? (
                <div style={{ padding: "0 20px 20px", color: "#666", fontSize: 13, lineHeight: 1.6, borderBottom: "1px solid #111" }}>{list.description}</div>
              ) : null}
              {list.items.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 20px", color: "#333", fontSize: 14 }}>Cette liste est vide</div>
              ) : (
                <div style={{ padding: "0 20px" }}>
                  {list.items.map((s, idx) => (
                    <div key={s.tmdbId} onClick={() => { openSeries(s); }} style={{ display: "flex", gap: 14, padding: "14px 0", borderBottom: "1px solid #111", cursor: "pointer", alignItems: "flex-start" }}>
                      <div style={{ width: 12, color: "#333", fontSize: 13, fontWeight: 600, paddingTop: 4, flexShrink: 0, textAlign: "right" }}>{idx + 1}</div>
                      <div style={{ width: 52, height: 78, borderRadius: 8, overflow: "hidden", background: "#1a1a1a", flexShrink: 0 }}>
                        {s.poster && <img src={s.poster} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#fff", fontWeight: 600, fontSize: 14, fontFamily: "'Playfair Display',Georgia,serif", lineHeight: 1.3 }}>{s.title}</div>
                        <div style={{ color: "#555", fontSize: 12, marginTop: 4 }}>{s.year} · {s.genre}</div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
                          <span style={{ color: ORANGE, fontSize: 11 }}>★</span>
                          <span style={{ color: "#888", fontSize: 12 }}>{s.rating}</span>
                          <span style={{ background: s.status === "En cours" ? ORANGE_DIM : "rgba(100,200,100,.1)", color: s.status === "En cours" ? ORANGE : "#6dc86d", padding: "2px 7px", borderRadius: 20, fontSize: 10 }}>{s.status}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Reviews Page */}
        {showReviewsPage && (
          <ReviewsPage extraReviews={extraReviews} library={library} openSeries={(s) => { setShowReviewsPage(false); openSeries(s); }} onDeleteReview={handleDeleteReview} onAskConfirm={askConfirm} />
        )}

        {/* Tags Page */}
        {showTagsPage && (
          <TagsPage library={library} tags={tags} onAddTag={handleAddTag} onRemoveTag={handleRemoveTag} onAskConfirm={askConfirm} openSeries={(s) => { setShowTagsPage(false); openSeries(s); }} />
        )}

        {/* Episode Popup */}
        {epPopup && (() => {
          const { ep, seasonN, tmdbId } = epPopup;
          const eps = watchedEpisodes[tmdbId] || {};
          const key = `S${seasonN}E${ep.ep}`;
          const isWatched = !!eps[key];
          const airDate = ep.air_date ? new Date(ep.air_date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : null;
          const handleToggle = () => {
            const newEps = { ...eps, [key]: !isWatched };
            if (!newEps[key]) delete newEps[key];
            setWatchedEpisodes(prev => ({ ...prev, [tmdbId]: newEps }));
            setEpPopup(null);
          };
          return (
            <div onClick={() => setEpPopup(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", zIndex: 9998, display: "flex", alignItems: "flex-end", justifyContent: "center", maxWidth: 440, margin: "0 auto" }}>
              <div onClick={e => e.stopPropagation()} style={{ background: "#0f0f0f", borderRadius: "20px 20px 0 0", width: "100%", border: "1px solid #1e1e1e", borderBottom: "none", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
                {ep.still && <img src={ep.still} style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", borderRadius: "20px 20px 0 0", flexShrink: 0 }} />}
                <div style={{ overflowY: "auto", flex: 1, padding: "20px 20px 0" }}>
                  <div style={{ width: 36, height: 3, background: "#2a2a2a", borderRadius: 2, margin: "0 auto 20px" }} />
                  <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif", lineHeight: 1.3, marginBottom: 4 }}>{ep.title}</div>
                  <div style={{ fontSize: 12, color: "#555", marginBottom: airDate ? 8 : 12 }}>S{seasonN}E{ep.ep}{ep.duration ? ` · ${ep.duration}` : ""}</div>
                  {airDate && <div style={{ fontSize: 12, color: "#555", marginBottom: 12 }}>📅 {airDate}</div>}
                  {ep.overview && <div style={{ fontSize: 13, color: "#999", lineHeight: 1.7, marginBottom: 16 }}>{ep.overview}</div>}
                  {ep.guest_stars?.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Guest stars</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {ep.guest_stars.slice(0, 8).map((g, i) => (
                          <span key={i} style={{ background: "#141414", border: "1px solid #222", color: "#777", fontSize: 11, padding: "4px 10px", borderRadius: 20 }}>{g.name}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ padding: "12px 20px 44px", flexShrink: 0 }}>
                  <button onClick={handleToggle} style={{ display: "block", margin: "0 auto", padding: "9px 24px", borderRadius: 20, background: "none", border: `1px solid ${isWatched ? "#2a2a2a" : ORANGE_BORDER}`, color: isWatched ? "#444" : ORANGE, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    {isWatched ? "✓ Vu" : "Marquer comme vu"}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Confirm Dialog */}
        {confirm && (
          <ConfirmDialog
            title={confirm.title}
            message={confirm.message}
            confirmLabel={confirm.confirmLabel}
            danger={confirm.danger !== false}
            onConfirm={confirm.onConfirm}
            onCancel={() => setConfirm(null)}
          />
        )}

        {/* Public Profile */}
        {viewingProfile && (
          <PublicProfilePage userId={viewingProfile.userId} currentUserId={authUser?.id} onOpen={openSeries} onClose={() => setViewingProfile(null)} myLibrary={library} myWatchedEpisodes={watchedEpisodes} />
        )}
        {/* Followers Page */}
        {showFollowersPage && (
          <FollowListPage title="Abonnés" userId={authUser?.id} type="followers" currentUserId={authUser?.id} onViewProfile={uid => { setShowFollowersPage(false); setViewingProfile({ userId: uid }); }} />
        )}
        {/* Following Page */}
        {showFollowingPage && (
          <FollowListPage title="Abonnements" userId={authUser?.id} type="following" currentUserId={authUser?.id} onViewProfile={uid => { setShowFollowingPage(false); setViewingProfile({ userId: uid }); }} />
        )}

        {/* Badges Page */}
        {showBadgesPage && (
          <BadgesPage
            unlockedBadgeIds={unlockedBadgeIds}
            pinnedBadgeIds={pinnedBadgeIds}
            onPin={id => setPinnedBadgeIds(p => [...p, id])}
            onUnpin={id => setPinnedBadgeIds(p => p.filter(x => x !== id))}
          />
        )}

        {/* Bottom Nav */}
        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 440, background: "rgba(8,8,8,.96)", backdropFilter: "blur(20px)", borderTop: "1px solid #1a1a1a", display: "flex", padding: "8px 0 24px", zIndex: 1000 }}>
          {tabs.map(t => { const active = tab===t.id; return (
            <button key={t.id} onClick={() => { setTab(t.id); setShowWatchlistPage(false); setShowTVShowsPage(false); setShowUpcomingPage(false); setShowListsPage(false); setShowBadgesPage(false); setShowReviewsPage(false); setShowTagsPage(false); setShowCreateList(false); setViewingList(null); setDetailSeries(null); setSeeAllPage(null); setShowSettingsPage(false); setViewingProfile(null); setShowFollowersPage(false); setShowFollowingPage(false); }} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: "6px 0" }}>
              {NAV_ICONS[t.id]?.(active)}
              <span style={{ fontSize: 9, color: active?ORANGE:"#444", fontWeight: active?600:400, letterSpacing: ".04em", textTransform: "uppercase" }}>{t.label}</span>
            </button>
          );})}
        </div>
      </div>
    </div>
  );
}
