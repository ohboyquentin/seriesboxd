import { ORANGE, ORANGE_DIM } from "../constants/theme.js";
import { scrollTopOnMount } from "../lib/dom.js";
import { formatRelativeTime, initialOf } from "../lib/format.js";
import { notificationText } from "../lib/notifications.js";
import { Spinner } from "../components/ui.jsx";

const ICON = { follow: "👤", review_like: "♥", review_comment: "💬", list_like: "♥" };

export function NotificationsPage({ notifications, loading, onClose, onOpenNotification }) {
  return (
    <div ref={scrollTopOnMount} style={{ position: "fixed", inset: 0, zIndex: 900, background: "#080808", overflowY: "auto", maxWidth: 440, margin: "0 auto", paddingBottom: 100 }}>
      <div style={{ position: "sticky", top: 0, background: "#080808", padding: "52px 20px 16px", display: "flex", alignItems: "center", gap: 14, borderBottom: "1px solid #111", zIndex: 1 }}>
        <button onClick={onClose} aria-label="Fermer" style={{ background: "none", border: "none", color: "#888", fontSize: 22, cursor: "pointer", padding: 0, lineHeight: 1 }}>←</button>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif" }}>Notifications</div>
      </div>

      <div style={{ padding: "12px 16px" }}>
        {loading && notifications.length === 0 && (
          <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Spinner /></div>
        )}
        {!loading && notifications.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#444", fontSize: 14 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🔔</div>
            Aucune notification pour l'instant.
            <div style={{ fontSize: 12, color: "#333", marginTop: 6 }}>Tu recevras une notification quand quelqu'un te suit, aime ou commente tes critiques, ou aime tes listes.</div>
          </div>
        )}
        {notifications.map(n => (
          <div key={n.id} onClick={() => onOpenNotification(n)}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px", marginBottom: 6, borderRadius: 12, cursor: "pointer",
              background: n.unread ? ORANGE_DIM : "#0e0e0e", border: `1px solid ${n.unread ? "rgba(219,157,228,.35)" : "#181818"}` }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, #c026d3, #f0abfc)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, overflow: "hidden" }}>
                {n.actor.avatar ? <img src={n.actor.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initialOf(n.actor.name)}
              </div>
              <div style={{ position: "absolute", right: -4, bottom: -4, width: 20, height: 20, borderRadius: "50%", background: "#111", border: "1px solid #222", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: ORANGE }}>
                {ICON[n.type]}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.45 }}>
              <span style={{ color: "#fff", fontWeight: 600 }}>{n.actor.name}</span>
              <span style={{ color: "#aaa" }}> {notificationText(n)}</span>
              <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>{formatRelativeTime(n.createdAt)}</div>
            </div>
            {n.unread && <div style={{ width: 8, height: 8, borderRadius: "50%", background: ORANGE, flexShrink: 0 }} />}
          </div>
        ))}
      </div>
    </div>
  );
}
