import { useState } from "react";
import { ORANGE, ORANGE_BORDER, ORANGE_DIM } from "../constants/theme.js";

export function ErrorState({ message = "Impossible de charger les données", onRetry, compact = false }) {
  if (compact) return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "#0e0e0e", border: "1px solid #1e1e1e", borderRadius: 12 }}>
      <span style={{ fontSize: 18 }}>⚠️</span>
      <span style={{ fontSize: 12, color: "#555", flex: 1 }}>{message}</span>
      {onRetry && <div onClick={onRetry} style={{ fontSize: 12, color: ORANGE, cursor: "pointer", whiteSpace: "nowrap" }}>Réessayer</div>}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", gap: 12, textAlign: "center" }}>
      <div style={{ fontSize: 36 }}>📡</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#666" }}>{message}</div>
      <div style={{ fontSize: 12, color: "#333" }}>Vérifie ta connexion ou réessaie dans un moment</div>
      {onRetry && (
        <button onClick={onRetry} style={{ marginTop: 8, background: "none", border: `1px solid ${ORANGE}`, borderRadius: 20, padding: "8px 20px", color: ORANGE, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          🔄 Réessayer
        </button>
      )}
    </div>
  );
}

// ─── UI ATOMS ─────────────────────────────────────────────────────────────────

export const StarRating = ({ value, onChange, size = 16 }) => {
  const [hovered, setHovered] = useState(null);

  const handleClick = (e, star) => {
    if (!onChange) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const half = (e.clientX - rect.left) < rect.width / 2;
    onChange(half ? star - 0.5 : star);
  };

  const handleMove = (e, star) => {
    if (!onChange) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const half = (e.clientX - rect.left) < rect.width / 2;
    setHovered(half ? star - 0.5 : star);
  };

  const display = hovered !== null ? hovered : (value || 0);

  const starFill = (star) => {
    if (display >= star) return "full";
    if (display >= star - 0.5) return "half";
    return "empty";
  };

  return (
    <div style={{ display: "flex", gap: 2 }} onMouseLeave={() => setHovered(null)}>
      {[1,2,3,4,5].map(star => {
        const fill = starFill(star);
        return (
          <span
            key={star}
            onClick={e => handleClick(e, star)}
            onMouseMove={e => handleMove(e, star)}
            style={{ fontSize: size, cursor: onChange ? "pointer" : "default", lineHeight: 1, position: "relative", display: "inline-block" }}
          >
            {/* Étoile vide en fond */}
            <span style={{ color: "#333" }}>★</span>
            {/* Remplissage par-dessus */}
            {fill !== "empty" && (
              <span style={{
                position: "absolute", left: 0, top: 0,
                color: ORANGE,
                clipPath: fill === "half" ? "inset(0 50% 0 0)" : "none",
                transition: "clip-path .1s",
              }}>★</span>
            )}
          </span>
        );
      })}
    </div>
  );
};

export const Spinner = ({ size = 28 }) => (
  <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
    <div style={{ width: size, height: size, border: "3px solid #1a1a1a", borderTop: `3px solid ${ORANGE}`, borderRadius: "50%", animation: "spin .8s linear infinite" }} />
  </div>
);

export const PosterCard = ({ series, onOpen, rewatchCount }) => (
  <div onClick={() => onOpen(series)} style={{
    position: "relative", borderRadius: 12, overflow: "hidden", cursor: "pointer",
    aspectRatio: "2/3", background: "#141414", flexShrink: 0,
    boxShadow: "0 8px 24px rgba(0,0,0,.6)", transition: "transform .2s",
  }}
    onMouseEnter={e => e.currentTarget.style.transform = "scale(1.03)"}
    onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
  >
    {series.poster
      ? <img src={series.poster} alt={series.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>📺</div>
    }
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top,rgba(0,0,0,.95) 0%,rgba(0,0,0,.2) 55%,transparent 100%)" }} />
    {series.watched && (
      <div style={{ position: "absolute", top: 8, right: 8, background: ORANGE, borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#000" }}>✓</div>
    )}
    {rewatchCount > 0 && (
      <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.72)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "2px 6px", display: "flex", alignItems: "center", gap: 3 }}>
        <span style={{ fontSize: 9, color: "#ccc" }}>↺</span>
        <span style={{ fontSize: 9, color: "#ccc", fontWeight: 700 }}>{rewatchCount}</span>
      </div>
    )}
    <div style={{ position: "absolute", bottom: 8, left: 8, right: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#fff", lineHeight: 1.2, fontFamily: "'Playfair Display',Georgia,serif" }}>{series.title}</div>
      {series.userRating && <StarRating value={series.userRating} size={10} />}
    </div>
  </div>
);


// ─── CONFIRM DIALOG ───────────────────────────────────────────────────────────
export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel, danger = true }) {
  return (
    <div onClick={onCancel} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
      backdropFilter: "blur(6px)", zIndex: 9999,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      maxWidth: 440, margin: "0 auto",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#0f0f0f", borderRadius: "20px 20px 0 0",
        padding: "24px 24px 40px", width: "100%",
        border: "1px solid #1e1e1e", borderBottom: "none",
      }}>
        <div style={{ width: 36, height: 3, background: "#2a2a2a", borderRadius: 2, margin: "0 auto 20px" }} />
        <div style={{ fontSize: 16, fontWeight: 600, color: "#fff", textAlign: "center", marginBottom: 8, fontFamily: "'Playfair Display',Georgia,serif" }}>
          {title || "Confirmer la suppression"}
        </div>
        <div style={{ fontSize: 14, color: "#777", textAlign: "center", lineHeight: 1.6, marginBottom: 24 }}>
          {message}
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: "14px", borderRadius: 14,
            background: "#1a1a1a", border: "1px solid #2a2a2a",
            color: "#888", fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}>Annuler</button>
          <button onClick={() => { onConfirm(); onCancel(); }} style={{
            flex: 1, padding: "14px", borderRadius: 14,
            background: danger ? "rgba(239,68,68,0.15)" : ORANGE_DIM,
            border: "1px solid " + (danger ? "rgba(239,68,68,0.4)" : ORANGE_BORDER),
            color: danger ? "#ef4444" : ORANGE,
            fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}>{confirmLabel || "Supprimer"}</button>
        </div>
      </div>
    </div>
  );
}
