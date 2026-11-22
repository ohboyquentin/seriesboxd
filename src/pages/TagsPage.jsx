import { useState } from "react";
import { ORANGE, ORANGE_BORDER, ORANGE_DIM } from "../constants/theme.js";

// ─── TAGS PAGE ────────────────────────────────────────────────────────────────
export function TagsPage({ library, tags, onAddTag, onRemoveTag, onAskConfirm, openSeries }) {
  const [newTag, setNewTag] = useState("");
  const [activeTag, setActiveTag] = useState(null);
  const [taggingSeries, setTaggingSeries] = useState(null); // series being tagged

  // All unique tags across all series
  const allTags = [...new Set(Object.values(tags).flat())].sort();

  // Series filtered by active tag
  const filteredSeries = activeTag
    ? library.filter(s => (tags[s.tmdbId] || []).includes(activeTag))
    : [];

  const handleAddTag = (tmdbId, tag) => {
    const t = tag.trim().toLowerCase().replace(/\s+/g, "-");
    if (!t || t.length > 20) return;
    const existing = tags[tmdbId] || [];
    if (existing.includes(t)) return;
    onAddTag(tmdbId, t);
  };

  const SUGGESTED = ["à-revoir", "cozy", "culte", "chef-d'œuvre", "overrated", "underrated", "feelgood", "intense", "lent", "drôle", "triste", "effrayant", "addictif", "décevant"];

  return (
    <div ref={el => el && el.scrollTo(0,0)} style={{ position: "fixed", inset: 0, background: "#080808", zIndex: 900, overflowY: "auto", paddingBottom: 100, maxWidth: 440, margin: "0 auto" }}>
      <div style={{ padding: "52px 20px 20px" }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif" }}>Tags</div>
        <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{allTags.length} tag{allTags.length !== 1 ? "s" : ""} créé{allTags.length !== 1 ? "s" : ""}</div>
      </div>

      {/* All tags cloud */}
      {allTags.length > 0 && (
        <div style={{ padding: "0 20px 20px", borderBottom: "1px solid #111" }}>
          <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 12 }}>Tes tags</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {allTags.map(tag => {
              const count = library.filter(s => (tags[s.tmdbId] || []).includes(tag)).length;
              const isActive = activeTag === tag;
              return (
                <button key={tag} onClick={() => setActiveTag(isActive ? null : tag)} style={{ padding: "6px 12px", borderRadius: 20, background: isActive ? ORANGE_DIM : "#111", border: `1px solid ${isActive ? ORANGE_BORDER : "#222"}`, color: isActive ? ORANGE : "#888", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                  <span>#</span>{tag}
                  <span style={{ background: isActive ? ORANGE_BORDER : "#1e1e1e", color: isActive ? ORANGE : "#555", borderRadius: 10, padding: "1px 6px", fontSize: 10 }}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Filtered series by tag */}
      {activeTag && (
        <div style={{ padding: "16px 20px" }}>
          <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 14 }}>#{activeTag} — {filteredSeries.length} série{filteredSeries.length !== 1 ? "s" : ""}</div>
          {filteredSeries.map(s => (
            <div key={s.tmdbId} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: "1px solid #0e0e0e", alignItems: "center" }}>
              <div onClick={() => openSeries(s)} style={{ display: "flex", gap: 12, flex: 1, alignItems: "center", cursor: "pointer" }}>
                <div style={{ width: 44, height: 66, borderRadius: 8, overflow: "hidden", background: "#1a1a1a", flexShrink: 0 }}>
                  {s.poster && <img src={s.poster} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#fff", fontWeight: 600, fontSize: 13, fontFamily: "'Playfair Display',Georgia,serif" }}>{s.title}</div>
                  <div style={{ color: "#555", fontSize: 11, marginTop: 3 }}>{s.year} · {s.genre}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
                    {(tags[s.tmdbId] || []).map(tag => (
                      <span key={tag} style={{ background: "#111", border: "1px solid #222", color: "#666", fontSize: 10, padding: "2px 7px", borderRadius: 10 }}>#{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
              <button onClick={() => onAskConfirm(`Retirer le tag #${activeTag} de "${s.title}" ?`, () => onRemoveTag(s.tmdbId, activeTag))} style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: 16, padding: "4px 6px" }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* Tag a series section */}
      <div style={{ padding: "20px 20px 0", borderTop: allTags.length > 0 ? "1px solid #111" : "none" }}>
        <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 14 }}>Tagger une série</div>

        {/* Series picker */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "#777", marginBottom: 8 }}>Choisir une série :</div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
            {library.filter(s => s.watched || s.inWatchlist).slice(0, 12).map(s => (
              <div key={s.tmdbId} onClick={() => setTaggingSeries(taggingSeries?.tmdbId === s.tmdbId ? null : s)} style={{ flexShrink: 0, width: 56, cursor: "pointer" }}>
                <div style={{ width: 56, height: 84, borderRadius: 8, overflow: "hidden", background: "#1a1a1a", border: `2px solid ${taggingSeries?.tmdbId === s.tmdbId ? ORANGE : "transparent"}`, transition: "border-color .15s" }}>
                  {s.poster && <img src={s.poster} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                </div>
                <div style={{ fontSize: 9, color: taggingSeries?.tmdbId === s.tmdbId ? ORANGE : "#555", marginTop: 4, textAlign: "center", lineHeight: 1.2, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{s.title}</div>
              </div>
            ))}
          </div>
        </div>

        {taggingSeries && (
          <div style={{ background: "#0c0c0c", border: "1px solid #1a1a1a", borderRadius: 14, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "#777", marginBottom: 10 }}>Tags de <span style={{ color: ORANGE }}>{taggingSeries.title}</span> :</div>

            {/* Current tags on this series */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {(tags[taggingSeries.tmdbId] || []).map(tag => (
                <span key={tag} style={{ display: "flex", alignItems: "center", gap: 4, background: ORANGE_DIM, border: `1px solid ${ORANGE_BORDER}`, color: ORANGE, fontSize: 11, padding: "3px 10px", borderRadius: 20 }}>
                  #{tag}
                  <button onClick={() => onAskConfirm(`Retirer le tag #${tag} ?`, () => onRemoveTag(taggingSeries.tmdbId, tag))} style={{ background: "none", border: "none", color: ORANGE, cursor: "pointer", padding: 0, fontSize: 13, lineHeight: 1 }}>×</button>
                </span>
              ))}
              {(tags[taggingSeries.tmdbId] || []).length === 0 && <span style={{ color: "#333", fontSize: 12 }}>Aucun tag</span>}
            </div>

            {/* Add new tag */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input value={newTag} onChange={e => setNewTag(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                onKeyDown={e => { if (e.key === "Enter") { handleAddTag(taggingSeries.tmdbId, newTag); setNewTag(""); } }}
                placeholder="Ajouter un tag…" maxLength={20}
                style={{ flex: 1, padding: "9px 12px", background: "#141414", border: `1px solid ${newTag ? ORANGE_BORDER : "#222"}`, borderRadius: 10, color: "#fff", fontSize: 13, outline: "none", fontFamily: "'DM Sans',system-ui,sans-serif" }} />
              <button onClick={() => { handleAddTag(taggingSeries.tmdbId, newTag); setNewTag(""); }}
                disabled={!newTag.trim()}
                style={{ padding: "9px 14px", background: newTag.trim() ? ORANGE_DIM : "#111", border: `1px solid ${newTag.trim() ? ORANGE_BORDER : "#222"}`, borderRadius: 10, color: newTag.trim() ? ORANGE : "#444", fontSize: 13, cursor: newTag.trim() ? "pointer" : "default" }}>+</button>
            </div>

            {/* Suggested tags */}
            <div style={{ fontSize: 10, color: "#444", marginBottom: 8 }}>Suggestions :</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SUGGESTED.filter(t => !(tags[taggingSeries.tmdbId] || []).includes(t)).slice(0, 8).map(t => (
                <button key={t} onClick={() => handleAddTag(taggingSeries.tmdbId, t)} style={{ padding: "4px 10px", borderRadius: 20, background: "#141414", border: "1px solid #222", color: "#666", fontSize: 11, cursor: "pointer" }}>#{t}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {allTags.length === 0 && !taggingSeries && (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: 36, marginBottom: 16, opacity: .25 }}>🏷</div>
          <div style={{ color: "#333", fontSize: 14 }}>Aucun tag pour l'instant</div>
          <div style={{ color: "#2a2a2a", fontSize: 12, marginTop: 8 }}>Sélectionne une série ci-dessus pour lui ajouter des tags</div>
        </div>
      )}
    </div>
  );
}
