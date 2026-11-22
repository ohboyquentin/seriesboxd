import { useState, useEffect } from "react";
import { Spinner } from "../components/ui.jsx";
import { ORANGE, ORANGE_BORDER, ORANGE_DIM } from "../constants/theme.js";
import { supabase } from "../lib/supabase.js";

// ─── FOLLOW LIST PAGE ─────────────────────────────────────────────────────────
export function FollowListPage({ title, userId, type, currentUserId, onViewProfile }) {
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
      const { data: profiles } = await supabase.from("profiles").select("id, user:data->user, library:data->library").in("id", ids);
      setUsers((profiles || []).map(p => {
        const u = p.user || {};
        return { id: p.id, name: u.name || "Utilisateur", pseudo: u.pseudo || u.name || "user", avatar: u.avatar || null, watched: (p.library || []).filter(s => s.watched).length };
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
