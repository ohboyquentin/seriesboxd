import { useState } from "react";
import { HexBadge } from "../components/HexBadge.jsx";
import { ALL_BADGES, BADGE_CATEGORIES } from "../constants/badges.js";
import { ORANGE, ORANGE_BORDER, ORANGE_DIM } from "../constants/theme.js";
import { scrollTopOnMount } from "../lib/dom.js";

// ─── BADGES PAGE ──────────────────────────────────────────────────────────────
export function BadgesPage({ unlockedBadgeIds = [], pinnedBadgeIds = [], onPin, onUnpin }) {
  const [activeCat, setActiveCat] = useState("Tous");
  const [selectedBadge, setSelectedBadge] = useState(null);

  const visible = activeCat === "Tous"
    ? ALL_BADGES
    : ALL_BADGES.filter(b => b.cat === activeCat);

  const unlocked = visible.filter(b => unlockedBadgeIds.includes(b.id));
  const locked   = visible.filter(b => !unlockedBadgeIds.includes(b.id));

  return (
    <div ref={scrollTopOnMount} style={{ position: "fixed", inset: 0, background: "#080808", zIndex: 900, overflowY: "auto", paddingBottom: 100, maxWidth: 440, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ padding: "52px 20px 16px" }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif" }}>Badges</div>
        <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{unlockedBadgeIds.length} / {ALL_BADGES.length} débloqués</div>
        {/* Progress bar */}
        <div style={{ marginTop: 10, height: 3, background: "#1a1a1a", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(unlockedBadgeIds.length / ALL_BADGES.length) * 100}%`, background: ORANGE, borderRadius: 4, transition: "width .6s ease" }} />
        </div>
      </div>

      {/* Pinned slots */}
      <div style={{ padding: "0 20px 20px", borderBottom: "1px solid #111" }}>
        <div style={{ color: "#555", marginBottom: 12, textTransform: "uppercase", letterSpacing: ".06em", fontSize: 10 }}>Badges sur le profil (4 max)</div>
        <div style={{ display: "flex", gap: 12 }}>
          {[0,1,2,3].map(i => {
            const bid = pinnedBadgeIds[i];
            const badge = bid ? ALL_BADGES.find(b => b.id === bid) : null;
            return (
              <div key={i} onClick={() => badge && onUnpin(bid)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: badge ? "pointer" : "default" }}>
                {badge
                  ? <HexBadge badge={badge} unlocked size={44} />
                  : <svg width={44} height={50} viewBox="0 0 44 50">
                      <polygon points="22,2 42,12 42,38 22,48 2,38 2,12" fill="#0e0e0e" stroke="#1e1e1e" strokeWidth="1" strokeDasharray="3 2"/>
                      <text x="22" y="30" textAnchor="middle" fontSize="14" fill="#2a2a2a">+</text>
                    </svg>
                }
                {badge && <span style={{ fontSize: 8, color: "#444", textAlign: "center", lineHeight: 1.2 }}>Retirer</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Category filter */}
      <div style={{ display: "flex", gap: 8, padding: "16px 20px", overflowX: "auto" }}>
        {BADGE_CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setActiveCat(cat)} style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 20, background: activeCat === cat ? ORANGE_DIM : "#111", border: `1px solid ${activeCat === cat ? ORANGE_BORDER : "#1e1e1e"}`, color: activeCat === cat ? ORANGE : "#666", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
            {cat}
          </button>
        ))}
      </div>

      {/* Unlocked */}
      {unlocked.length > 0 && (
        <div style={{ padding: "0 20px 8px" }}>
          <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 16 }}>Débloqués — {unlocked.length}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            {unlocked.map(badge => (
              <div key={badge.id} onClick={() => setSelectedBadge(badge)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, cursor: "pointer" }}>
                <HexBadge badge={badge} unlocked size={56} />
                <span style={{ fontSize: 10, color: "#ccc", textAlign: "center", lineHeight: 1.3, fontWeight: 500 }}>{badge.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Locked */}
      {locked.length > 0 && (
        <div style={{ padding: "24px 20px 8px" }}>
          <div style={{ fontSize: 10, color: "#333", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 16 }}>À débloquer — {locked.length}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            {locked.map(badge => (
              <div key={badge.id} onClick={() => !badge.secret && setSelectedBadge(badge)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, cursor: badge.secret ? "default" : "pointer", opacity: badge.secret ? 0.35 : 0.5 }}>
                <HexBadge badge={badge} unlocked={false} size={56} />
                <span style={{ fontSize: 10, color: badge.secret ? "#252525" : "#444", textAlign: "center", lineHeight: 1.3 }}>{badge.secret ? "???" : badge.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Badge detail modal */}
      {selectedBadge && (() => {
        const isUnlocked = unlockedBadgeIds.includes(selectedBadge.id);
        const isPinned   = pinnedBadgeIds.includes(selectedBadge.id);
        const canPin     = isUnlocked && !isPinned && pinnedBadgeIds.length < 4;
        return (
          <div onClick={() => setSelectedBadge(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", backdropFilter: "blur(6px)", zIndex: 1100, display: "flex", alignItems: "flex-end", justifyContent: "center", maxWidth: 440, margin: "0 auto" }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#0e0e0e", borderRadius: "20px 20px 0 0", padding: "20px 24px 110px", width: "100%", border: "1px solid #1e1e1e", borderBottom: "none" }}>
              <div style={{ width: 36, height: 3, background: "#2a2a2a", borderRadius: 2, margin: "0 auto 20px" }} />
              <div style={{ display: "flex", gap: 20, alignItems: "center", marginBottom: 16 }}>
                <HexBadge badge={selectedBadge} unlocked={isUnlocked} size={70} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: isUnlocked ? "#fff" : "#444", fontFamily: "'Playfair Display',Georgia,serif" }}>
                    {!isUnlocked && selectedBadge.secret ? "Badge secret" : selectedBadge.name}
                  </div>
                  <div style={{ fontSize: 12, color: "#444", marginTop: 4 }}>{selectedBadge.cat}</div>
                  <div style={{ fontSize: 13, color: "#666", marginTop: 6, lineHeight: 1.5 }}>
                    {!isUnlocked && selectedBadge.secret
                      ? "Ce badge est secret. Découvre comment le débloquer par toi-même... 🔒"
                      : selectedBadge.desc}
                  </div>
                </div>
              </div>
              {isUnlocked && (
                <button onClick={() => { isPinned ? onUnpin(selectedBadge.id) : canPin && onPin(selectedBadge.id); setSelectedBadge(null); }}
                  disabled={!isPinned && !canPin}
                  style={{ width: "100%", padding: "13px", borderRadius: 14, background: isPinned ? "#1a1a1a" : (canPin ? ORANGE_DIM : "#111"), border: `1px solid ${isPinned ? "#2a2a2a" : (canPin ? ORANGE_BORDER : "#1a1a1a")}`, color: isPinned ? "#888" : (canPin ? ORANGE : "#333"), fontSize: 14, fontWeight: 600, cursor: (isPinned || canPin) ? "pointer" : "default" }}>
                  {isPinned ? "Retirer du profil" : canPin ? "Épingler sur le profil" : "4 badges déjà épinglés"}
                </button>
              )}
              {!isUnlocked && (
                <div style={{ background: "#111", borderRadius: 14, padding: "13px", textAlign: "center", border: "1px solid #1a1a1a" }}>
                  <span style={{ color: "#444", fontSize: 13 }}>🔒 Badge non débloqué</span>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
