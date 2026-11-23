import { useState } from "react";
import { StarRating } from "../components/ui.jsx";
import { ORANGE, ORANGE_BORDER, ORANGE_DIM } from "../constants/theme.js";
import { scrollTopOnMount } from "../lib/dom.js";

// ─── TV SHOWS PAGE ────────────────────────────────────────────────────────────
export function TVShowsPage({ watched, watchHistory, openSeries, rewatchCounts }) {
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
    <div ref={scrollTopOnMount} style={{ position: "fixed", inset: 0, background: "#080808", zIndex: 900, overflowY: "auto", paddingBottom: 90, maxWidth: 440, margin: "0 auto" }}>
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
