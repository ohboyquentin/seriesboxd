import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ErrorState, PosterCard, Spinner } from "./ui.jsx";
import { ORANGE } from "../constants/theme.js";
import { adaptShow, tmdbViaClaude } from "../lib/tmdb.js";

// ─── HOME SECTION (live via Claude→TMDB) ──────────────────────────────────────


// ─── CONTINUE WATCHING SECTION ───────────────────────────────────────────────

export function ContinueWatchingSection({ library, watchedEpisodes, onOpen, onSeeAll }) {
  const [showAll] = useState(false);

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

export function HomeSection({ title, endpoint, onOpen, onSeeAll }) {
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

export function PopularWithFriends({ friendsActivity, followingIds, onOpen, onSeeAll }) {
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
