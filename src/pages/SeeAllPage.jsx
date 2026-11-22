import { useState, useEffect, useRef, useCallback } from "react";
import { ErrorState, PosterCard, Spinner } from "../components/ui.jsx";
import { ORANGE } from "../constants/theme.js";
import { adaptShow, tmdbViaClaude } from "../lib/tmdb.js";

// ─── SEE ALL PAGE ─────────────────────────────────────────────────────────────

export function SeeAllPage({ title, endpoint, inProgressList, onOpen, onClose }) {
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
