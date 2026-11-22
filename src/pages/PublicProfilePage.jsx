import { useState, useEffect } from "react";
import { HexBadge } from "../components/HexBadge.jsx";
import { PosterCard, Spinner } from "../components/ui.jsx";
import { ALL_BADGES } from "../constants/badges.js";
import { ORANGE, ORANGE_BORDER, ORANGE_DIM } from "../constants/theme.js";
import { formatRelativeTime } from "../lib/format.js";
import { fetchFollows, fetchUserProfile } from "../lib/social.js";
import { computeCompatibility } from "../lib/stats.js";
import { supabase } from "../lib/supabase.js";

// ─── PUBLIC PROFILE PAGE ─────────────────────────────────────────────────────
export function PublicProfilePage({ userId, currentUserId, onOpen, onClose, myLibrary = [], listLikeCounts = {}, likedListKeys = new Set(), onToggleListLike, onRefreshListLikes }) {
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
      if (p?.lists?.length > 0) onRefreshListLikes?.(userId, p.lists.map(l => l.id));
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
  const compatibility = currentUserId && currentUserId !== userId
    ? computeCompatibility((myLibrary || []).filter(s => s.watched), (profile.library || []).filter(s => s.watched))
    : null;
  const ic = (sym, size=18) => <span style={{ color: ORANGE, fontSize: size, lineHeight: 1 }}>{sym}</span>;
  const ICONS = { watch: ic("◉"), rate: ic("★",20), review: ic("✎"), like: ic("♥"), episode: ic("▶",15), watchlist: ic("◈"), list: ic("≡"), rewatch: ic("↺") };

  return (
    <div ref={el => el && el.scrollTo(0,0)} style={{ position: "fixed", inset: 0, background: "#080808", zIndex: 910, overflowY: "auto", paddingBottom: 100, maxWidth: 440, margin: "0 auto" }}>
      <div style={{ position: "sticky", top: 0, background: "rgba(8,8,8,0.95)", backdropFilter: "blur(12px)", zIndex: 10, padding: "52px 20px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #111" }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif" }}>Profil</div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
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
          <div style={{ fontSize: 10, color: "#fff", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>✦ Genres favoris</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {profile.favGenres.map(g => <span key={g} style={{ background: "#2a2a2a", border: "1px solid " + ORANGE_BORDER, color: "#fff", fontSize: 12, padding: "5px 12px", borderRadius: 20 }}>{g}</span>)}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 8, padding: "0 20px" }}>
        {[{ n: watched.length, label: "Vues" }, { n: totalEps, label: "Épisodes" }, { n: followerCount, label: "Abonnés" }, { n: followingCount, label: "Abonn" }].map((stat, i) => (
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
              {badge ? <><HexBadge badge={badge} unlocked size={38} /><div style={{ fontSize: 8, color: badge.color, textAlign: "center", lineHeight: 1.2, fontWeight: 600 }}>{badge.name}</div></> : <span style={{ fontSize: 16, opacity: 0.12 }}>{"⬡"}</span>}
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
          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 12, padding: "0 20px" }}>Dernières notes</div>
          <div style={{ display: "flex", gap: 12, padding: "0 20px", overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
            {rated.map(s => <div key={s.tmdbId||s.id} style={{ width: 90, flexShrink: 0 }}><PosterCard series={s} onOpen={onOpen} /></div>)}
          </div>
        </div>
      )}

      {(profile.lists || []).length > 0 && (
        <div style={{ marginBottom: 24, padding: "0 20px" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 12 }}>Listes</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {profile.lists.map(list => {
              const key = `${userId}:${list.id}`;
              const liked = likedListKeys.has(key);
              const count = listLikeCounts[key] || 0;
              return (
                <div key={list.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: "#0e0e0e", borderRadius: 12, border: "1px solid #181818" }}>
                  <div style={{ width: 48, height: 48, borderRadius: 10, overflow: "hidden", background: "#111", flexShrink: 0, display: "grid", gridTemplateColumns: (list.items||[]).length >= 2 ? "1fr 1fr" : "1fr", gap: 1 }}>
                    {(list.items||[]).length === 0
                      ? <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "#2a2a2a", fontSize: 16 }}>☰</div>
                      : list.items.slice(0, 4).map((s, i) => (
                        <div key={i} style={{ overflow: "hidden", background: "#1a1a1a" }}>
                          {s.poster && <img src={s.poster} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                        </div>
                      ))
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "#fff", fontWeight: 600, fontSize: 13, fontFamily: "'Playfair Display',Georgia,serif" }}>{list.name}</div>
                    <div style={{ color: "#555", fontSize: 11, marginTop: 2 }}>{(list.items||[]).length} série{(list.items||[]).length !== 1 ? "s" : ""}</div>
                  </div>
                  {currentUserId && (
                    <button onClick={() => onToggleListLike?.(userId, list.id)} style={{ display: "flex", alignItems: "center", gap: 5, background: liked ? ORANGE_DIM : "transparent", border: `1px solid ${liked ? ORANGE_BORDER : "#252525"}`, borderRadius: 20, padding: "6px 12px", cursor: "pointer", color: liked ? ORANGE : "#555", fontSize: 12, flexShrink: 0 }}>
                      <span>{liked ? "♥" : "♡"}</span><span>{count}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {recentActivity.length > 0 && (
        <div style={{ padding: "0 20px 20px" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 12 }}>Activité récente</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {recentActivity.map((entry, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#0e0e0e", borderRadius: 12, border: "1px solid #181818" }}>
                <div style={{ width: 28, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>{ICONS[entry.type] || ic("◉")}</div>
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
