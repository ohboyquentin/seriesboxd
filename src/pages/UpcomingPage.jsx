import { useState, useEffect } from "react";
import { Spinner } from "../components/ui.jsx";
import { ORANGE } from "../constants/theme.js";
import { tmdbViaClaude } from "../lib/tmdb.js";

// ─── UPCOMING PAGE ────────────────────────────────────────────────────────────

export function UpcomingPage({ library, watchedEpisodes = {} }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (library.length === 0) { setLoading(false); return; }

    // Séries vues, en cours de visionnage ("Keep watching"), ou en watchlist
    const isInProgress = (s) => {
      const eps = watchedEpisodes[s.tmdbId];
      return eps && Object.values(eps).some(Boolean) && !s.watched;
    };
    const candidates = library.filter(s => s.watched || isInProgress(s) || s.inWatchlist);

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
    // Volontaire : on n'interroge TMDB à nouveau que si le nombre de séries change (évite des dizaines de requêtes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          {items.map((item) => (
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
