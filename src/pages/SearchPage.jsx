import { useState, useEffect, useRef } from "react";
import { ErrorState, PosterCard, Spinner } from "../components/ui.jsx";
import { ORANGE, ORANGE_BORDER, ORANGE_DIM } from "../constants/theme.js";
import { searchUsers } from "../lib/social.js";
import { supabase } from "../lib/supabase.js";
import { adaptShow, tmdbViaClaude } from "../lib/tmdb.js";

// ─── SEARCH PAGE ──────────────────────────────────────────────────────────────

export function SearchPage({ onOpen, onViewProfile, currentUserId }) {
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
    let cancelled = false; // passe à true si la recherche change avant la réponse
    debounceRef.current = setTimeout(async () => {
      try {
        const [tmdbData, usersData] = await Promise.all([
          tmdbViaClaude("/search/tv", { query }),
          searchUsers(query),
        ]);
        if (cancelled) return; // réponse d'une ancienne recherche → ignorée
        const filteredUsers = usersData.filter(u => u.id !== currentUserId);
        setUserResults(filteredUsers);
        if (currentUserId && filteredUsers.length > 0) {
          const { data: myF } = await supabase.from("follows").select("following_id").eq("follower_id", currentUserId).in("following_id", filteredUsers.map(u => u.id));
          const map = {};
          (myF || []).forEach(r => { map[r.following_id] = true; });
          if (cancelled) return;
          setFollowMapSearch(map);
        }
        const data = tmdbData;
        let shows = (data.results || []).map(adaptShow);
        if (filters.minRating > 0) shows = shows.filter(s => s.rating >= filters.minRating);
        if (filters.yearFrom) shows = shows.filter(s => s.year >= parseInt(filters.yearFrom));
        if (filters.yearTo) shows = shows.filter(s => s.year <= parseInt(filters.yearTo));
        if (filters.status) shows = shows.filter(s => s.status === filters.status);
        setResults(shows);
      } catch { if (!cancelled) { setResults([]); setSearchError(true); } }
      if (!cancelled) setLoading(false);
    }, 500);
    return () => { cancelled = true; clearTimeout(debounceRef.current); };
  }, [query, filters, currentUserId]);

  const showResults = query.length > 0 || activeCount > 0;

  return (
    <div style={{ padding: "0 20px" }}>
      <div style={{ position: "relative", marginBottom: 12 }}>
        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#555", fontSize: 16 }}>🔍</span>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Chercher une série ou un ami..." style={{ width: "100%", padding: "13px 88px 13px 42px", background: "#111", border: `1px solid ${showFilters ? ORANGE_BORDER : "#1e1e1e"}`, borderRadius: 12, color: "#fff", fontSize: 14, outline: "none" }} />
        <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 6 }}>
          {query.length > 0 && (
            <button onClick={() => setQuery("")} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#555", fontSize: 16, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              ×
            </button>
          )}
          <button onClick={() => setShowFilters(!showFilters)} style={{ background: activeCount > 0 ? ORANGE_DIM : "transparent", border: `1px solid ${activeCount > 0 ? ORANGE_BORDER : "#2a2a2a"}`, borderRadius: 8, padding: "5px 10px", cursor: "pointer", color: activeCount > 0 ? ORANGE : "#555", fontSize: 13, display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
            <span>⚙</span>
            {activeCount > 0 && <span style={{ background: ORANGE, color: "#fff", borderRadius: "50%", width: 16, height: 16, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{activeCount}</span>}
          </button>
        </div>
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
