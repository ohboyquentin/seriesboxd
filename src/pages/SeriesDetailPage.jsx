import { useState, useEffect, useRef, useCallback } from "react";
import { SimilarSeries } from "../components/SimilarSeries.jsx";
import { ErrorState, Spinner, StarRating } from "../components/ui.jsx";
import { ORANGE, ORANGE_BORDER, ORANGE_DIM } from "../constants/theme.js";
import { initialOf } from "../lib/format.js";
import { fetchCommunityReviews } from "../lib/social.js";
import { GENRE_MAP, IMG, backdropUrl, tmdbStatus, tmdbViaClaude } from "../lib/tmdb.js";

// ─── SERIES DETAIL PAGE ───────────────────────────────────────────────────────

export function SeriesDetailPage({ series, library = [], onClose, onRate, onMarkWatched, onToggleWatchlist, allReviews, onAddReview, onToggleLike, onAddComment, onActivity, watchedEpisodes: initialWatchedEps = {}, onWatchedEpisodesChange, onOpen, rewatchData, onRewatch, onAskConfirm, onSeriesMetaLoaded, onEpPopup, friendsData = [], currentUserId }) {
  const liveSeries = library.find(s => s.tmdbId === series.tmdbId) || series;
  const [detailTab, setDetailTab] = useState("info");
  const [openSeason, setOpenSeason] = useState(1);
  const [userRating, setUserRating] = useState(series.userRating);
  const [showForm, setShowForm] = useState(false);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [communityReviews, setCommunityReviews] = useState([]);
  const [communityReviewsLoading, setCommunityReviewsLoading] = useState(true);
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
    // Volontaire : le parent recrée cette fonction à chaque rendu ; l'ajouter relancerait l'effet en boucle
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          if (onActivity && ep) onActivity("episode", `Tu as vu ${series.title} S${seasonN}E${epN} – ${ep.title}`, { airDate: ep.air_date || null, durationMin: ep.durationMin || null });
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
          name: c.name, role: c.character, avatar: initialOf(c.name),
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
            durationMin: ep.runtime || null,
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
            voteCount: typeof full.vote_count === "number" ? full.vote_count : series.voteCount,
            status: full.status ? tmdbStatus(full.status) : series.status,
            rawStatus: full.status || series.rawStatus,
          });
        }
      } catch(e) { setDetailError(true); console.error(e); }
      finally { setLoading(false); }
    })();
    // Volontaire : on ne recharge la fiche que si on change de série (les autres champs servent de repli)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series.tmdbId]);

  useEffect(() => {
    if (fetched.current) return;
    loadDetail();
  }, [loadDetail]);

  const localReviews = allReviews[series.tmdbId] || [];

  useEffect(() => {
    let cancelled = false;
    setCommunityReviewsLoading(true);
    fetchCommunityReviews(series.tmdbId, currentUserId)
      .then(rs => { if (!cancelled) setCommunityReviews(rs); })
      .catch(e => { console.error("Chargement des critiques communautaires:", e); if (!cancelled) setCommunityReviews([]); })
      .finally(() => { if (!cancelled) setCommunityReviewsLoading(false); });
    return () => { cancelled = true; };
  }, [series.tmdbId, currentUserId]);

  const allDisplayReviews = [
    ...localReviews.map(r => ({ ...r, isMine: true })),
    ...communityReviews.map(r => ({ ...r, isMine: false })),
  ];
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
                    {/* Thumbnail — clic pour voir le détail */}
                    <div onClick={() => onEpPopup && onEpPopup(ep, season.n)} style={{ width: 80, height: 46, borderRadius: 8, overflow: "hidden", background: "#141414", flexShrink: 0, position: "relative", cursor: "pointer" }}>
                      {ep.still ? <img src={ep.still} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: isWatched ? 0.45 : 1, transition: "opacity .2s" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#333", fontSize: 16 }}>▶</div>}
                      {isWatched && (
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <div style={{ width: 22, height: 22, borderRadius: "50%", background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#000" }}>✓</div>
                        </div>
                      )}
                    </div>
                    {/* Infos — clic pour voir le détail aussi */}
                    <div onClick={() => onEpPopup && onEpPopup(ep, season.n)} style={{ flex: 1, cursor: "pointer" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ color: isWatched ? "#666" : "#fff", fontSize: 13, fontWeight: 500, flex: 1, paddingRight: 8, textDecoration: isWatched ? "line-through" : "none", transition: "color .2s" }}>{ep.title}</div>
                        <div style={{ color: "#444", fontSize: 11, flexShrink: 0 }}>{ep.duration}</div>
                      </div>
                      <div style={{ color: "#555", fontSize: 11, marginTop: 2 }}>S{season.n}E{ep.ep}</div>
                      {ep.overview && <div style={{ color: "#444", fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>{ep.overview.slice(0,90)}{ep.overview.length>90?"…":""}</div>}
                    </div>
                    {/* Cercle à cocher — remplace l'ancien bouton ℹ */}
                    <button onClick={(e) => { e.stopPropagation(); toggleEpisode(season.n, ep.ep); }} style={{ width: 24, height: 24, borderRadius: "50%", background: isWatched ? ORANGE : "transparent", border: `1.5px solid ${isWatched ? ORANGE : "#333"}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, flexShrink: 0, alignSelf: "center", transition: "background .15s, border-color .15s" }}>
                      {isWatched && <span style={{ color: "#000", fontSize: 12, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                    </button>
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
          <div style={{ fontSize: 13, color: "#444", marginBottom: 14 }}>{allDisplayReviews.length} critique{allDisplayReviews.length!==1?"s":""}{communityReviewsLoading && <span style={{ color: "#333" }}> · chargement…</span>}</div>
          {(() => {
            const sortedReviews = [...allDisplayReviews].sort((a, b) => (b.likes || 0) - (a.likes || 0));
            const displayedReviews = showAllReviews ? sortedReviews : sortedReviews.slice(0, 3);
            const remaining = sortedReviews.length - displayedReviews.length;
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {displayedReviews.map((rv, i) => (
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
                    {rv.isMine ? (
                      <>
                        <button onClick={() => onToggleLike(series.tmdbId, rv.id||i)} style={{ display: "flex", alignItems: "center", gap: 6, background: rv.liked ? ORANGE_DIM : "transparent", border: `1px solid ${rv.liked ? ORANGE_BORDER : "#252525"}`, borderRadius: 20, padding: "5px 12px", cursor: "pointer", color: rv.liked ? ORANGE : "#555", fontSize: 12 }}>
                          <span>{rv.liked?"♥":"♡"}</span> <span>{rv.likes} J'aime</span>
                        </button>
                        <ReviewComments review={rv} onAddComment={(text) => onAddComment(series.tmdbId, rv.id||i, text)} />
                      </>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#444", fontSize: 12 }}>
                        <span>{rv.likes > 0 ? "♥" : "♡"}</span> <span>{rv.likes || 0} J'aime</span>
                        {rv.comments?.length > 0 && <span style={{ marginLeft: 8 }}>💬 {rv.comments.length}</span>}
                      </div>
                    )}
                  </div>
                ))}
                {!allDisplayReviews.length && !communityReviewsLoading && <div style={{ textAlign: "center", color: "#333", fontSize: 13, padding: "30px 0" }}>Sois le premier à écrire une critique ✨</div>}
                {!showAllReviews && remaining > 0 && (
                  <button onClick={() => setShowAllReviews(true)} style={{ width: "100%", padding: "12px", background: "#0e0e0e", border: "1px solid #1e1e1e", borderRadius: 12, color: ORANGE, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                    Voir plus de critiques ({remaining})
                  </button>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function ReviewComments({ review, onAddComment }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const comments = review.comments || [];
  const submit = () => {
    if (!text.trim()) return;
    onAddComment(text.trim());
    setText("");
  };
  return (
    <div style={{ marginTop: 10 }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: "#555", fontSize: 12 }}>
        <span>💬</span><span>{comments.length > 0 ? `${comments.length} commentaire${comments.length > 1 ? "s" : ""}` : "Commenter"}</span>
      </div>
      {open && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {comments.map((c, i) => (
            <div key={c.id || i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#1a1a1a", border: "1px solid #252525", display: "flex", alignItems: "center", justifyContent: "center", color: ORANGE, fontWeight: 700, fontSize: 10, flexShrink: 0 }}>{c.avatar}</div>
              <div style={{ flex: 1 }}>
                <span style={{ color: "#ccc", fontSize: 12, fontWeight: 600 }}>{c.user}</span>
                <span style={{ color: "#888", fontSize: 12 }}> {c.text}</span>
              </div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} placeholder="Ajouter un commentaire…" style={{ flex: 1, padding: "8px 12px", background: "#141414", border: "1px solid #222", borderRadius: 20, color: "#fff", fontSize: 12, outline: "none", fontFamily: "'DM Sans',system-ui,sans-serif" }} />
            <button onClick={submit} disabled={!text.trim()} style={{ padding: "8px 14px", borderRadius: 20, background: text.trim() ? ORANGE_DIM : "#111", border: `1px solid ${text.trim() ? ORANGE_BORDER : "#222"}`, color: text.trim() ? ORANGE : "#444", fontSize: 12, cursor: text.trim() ? "pointer" : "default", flexShrink: 0 }}>Envoyer</button>
          </div>
        </div>
      )}
    </div>
  );
}
