import { useState, useEffect, useRef } from "react";
import { ORANGE } from "../constants/theme.js";
import { adaptShow, tmdbViaClaude } from "../lib/tmdb.js";

// ─── SIMILAR SERIES ───────────────────────────────────────────────────────────
export function SimilarSeries({ tmdbId, onOpen }) {
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
