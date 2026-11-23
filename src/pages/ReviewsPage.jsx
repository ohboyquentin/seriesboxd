import { StarRating } from "../components/ui.jsx";
import { ORANGE } from "../constants/theme.js";
import { scrollTopOnMount } from "../lib/dom.js";

// ─── REVIEWS PAGE ─────────────────────────────────────────────────────────────
export function ReviewsPage({ extraReviews, library, openSeries, onDeleteReview, onAskConfirm }) {
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
    <div ref={scrollTopOnMount} style={{ position: "fixed", inset: 0, background: "#080808", zIndex: 900, overflowY: "auto", paddingBottom: 100, maxWidth: 440, margin: "0 auto" }}>
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
