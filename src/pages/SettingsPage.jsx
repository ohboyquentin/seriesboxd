import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { ALL_GENRES } from "../constants/genres.js";
import { ORANGE } from "../constants/theme.js";
import { resizeImageDataUrl } from "../lib/avatar.js";

// ─── SETTINGS PAGE ────────────────────────────────────────────────────────────

export function SettingsPage({ user, onSave, onClose, watched, authEmail, onChangePassword, onLogout, onExportData, onDeleteAccount, onOpenPrivacy }) {
  const [showDelete, setShowDelete] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const handleExport = async () => {
    setExporting(true); setExportError("");
    try { await onExportData(); }
    catch (e) { console.error("Export :", e); setExportError("L'export a échoué. Réessaie."); }
    setExporting(false);
  };
  const [name,      setName]      = useState(user.name      || "");
  const [pseudo,    setPseudo]    = useState(user.pseudo     || user.name || "");
  const [bio,       setBio]       = useState(user.bio        || "");
  const [location,  setLocation]  = useState(user.location   || "");
  const [website,   setWebsite]   = useState(user.website    || "");
  const [avatar,    setAvatar]    = useState(user.avatar     || null);   // base64 ou null
  const [genres,    setGenres]    = useState(user.favGenres  || []);
  const [favShows,  setFavShows]  = useState(user.favShows   || []);
  const [showGenrePicker, setShowGenrePicker] = useState(false);
  const [showShowPicker,  setShowShowPicker]  = useState(false);
  const fileRef = useRef();

  const toggleGenre = g => {
    setGenres(prev => prev.includes(g) ? prev.filter(x => x !== g) : prev.length < 5 ? [...prev, g] : prev);
  };
  const toggleShow = s => {
    setFavShows(prev => prev.find(x => x.tmdbId === s.tmdbId) ? prev.filter(x => x.tmdbId !== s.tmdbId) : prev.length < 4 ? [...prev, s] : prev);
  };

  const handleAvatar = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      try { setAvatar(await resizeImageDataUrl(ev.target.result)); }
      catch (err) { console.warn("Avatar :", err.message); }
    };
    reader.readAsDataURL(file);
  };

  const canSave = name.trim().length >= 2;
  const handleSave = () => {
    if (!canSave) return;
    onSave({ ...user, name: name.trim(), pseudo, bio, location, website, avatar, favGenres: genres, favShows });
    onClose();
  };

  const inputStyle = { width: "100%", background: "#0e0e0e", border: "1px solid #222", borderRadius: 10, padding: "11px 14px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" };
  const labelStyle = { fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 6, display: "block" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#080808", zIndex: 1000, overflowY: "auto", paddingBottom: 100, maxWidth: 440, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "#080808", padding: "52px 20px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #111" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div onClick={onClose} style={{ width: 36, height: 36, borderRadius: "50%", background: "#111", border: "1px solid #1e1e1e", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif" }}>Modifier le profil</div>
        </div>
        <button onClick={handleSave} disabled={!canSave} title={canSave ? "" : "Le nom doit contenir au moins 2 caractères"} style={{ background: canSave ? ORANGE : "#222", border: "none", borderRadius: 20, padding: "8px 20px", color: canSave ? "#fff" : "#555", fontSize: 13, fontWeight: 700, cursor: canSave ? "pointer" : "default" }}>Enregistrer</button>
      </div>

      <div style={{ padding: "28px 20px", display: "flex", flexDirection: "column", gap: 24 }}>

        {/* Avatar */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div onClick={() => fileRef.current.click()} style={{ position: "relative", cursor: "pointer" }}>
            <div style={{ width: 90, height: 90, borderRadius: "50%", background: "linear-gradient(135deg, #c026d3, #f0abfc)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", border: "3px solid #1a1a1a" }}>
              {avatar
                ? <img src={avatar} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontWeight: 700, fontSize: 32, color: "#fff" }}>{(name || "?")[0].toUpperCase()}</span>
              }
            </div>
            {/* Overlay caméra */}
            <div style={{ position: "absolute", bottom: 0, right: 0, width: 28, height: 28, borderRadius: "50%", background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #080808" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatar} />
          <div style={{ fontSize: 12, color: "#444" }}>Appuie pour changer la photo</div>
        </div>

        {/* Nom complet */}
        <div>
          <label style={labelStyle}>Nom complet</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Ton nom" style={inputStyle} />
        </div>

        {/* Pseudo */}
        <div>
          <label style={labelStyle}>Pseudo</label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#444", fontSize: 14 }}>@</span>
            <input value={pseudo} onChange={e => setPseudo(e.target.value.replace(/\s/g, ""))} placeholder="pseudo" style={{ ...inputStyle, paddingLeft: 28 }} />
          </div>
        </div>

        {/* Bio */}
        <div>
          <label style={labelStyle}>Bio</label>
          <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Parle de toi en quelques mots..." maxLength={150} rows={3} style={{ ...inputStyle, resize: "none", lineHeight: 1.5 }} />
          <div style={{ textAlign: "right", fontSize: 11, color: "#333", marginTop: 4 }}>{bio.length}/150</div>
        </div>

        {/* Location */}
        <div>
          <label style={labelStyle}>Localisation</label>
          <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Paris, France" style={inputStyle} />
        </div>

        {/* Website */}
        <div>
          <label style={labelStyle}>Site web</label>
          <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://..." style={inputStyle} />
        </div>

        {/* Genres favoris */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Genres favoris <span style={{ color: "#333" }}>(max 5)</span></label>
            <span style={{ fontSize: 12, color: ORANGE, cursor: "pointer" }} onClick={() => setShowGenrePicker(v => !v)}>{showGenrePicker ? "Fermer" : "Modifier"}</span>
          </div>
          {/* Tags sélectionnés */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: showGenrePicker ? 12 : 0 }}>
            {genres.length === 0 && !showGenrePicker && <span style={{ fontSize: 13, color: "#333" }}>Aucun genre sélectionné</span>}
            {genres.map(g => (
              <span key={g} onClick={() => toggleGenre(g)} style={{ background: "#1a1a1a", border: `1px solid ${ORANGE}55`, color: ORANGE, fontSize: 12, padding: "5px 12px", borderRadius: 20, cursor: "pointer" }}>
                {g} ×
              </span>
            ))}
          </div>
          {/* Picker */}
          {showGenrePicker && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ALL_GENRES.map(g => {
                const sel = genres.includes(g);
                return (
                  <span key={g} onClick={() => toggleGenre(g)} style={{ background: sel ? "#1a1a1a" : "#0e0e0e", border: `1px solid ${sel ? ORANGE : "#222"}`, color: sel ? ORANGE : "#555", fontSize: 12, padding: "5px 12px", borderRadius: 20, cursor: genres.length >= 5 && !sel ? "default" : "pointer", opacity: genres.length >= 5 && !sel ? 0.4 : 1 }}>
                    {g}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Séries favorites */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Séries favorites <span style={{ color: "#333" }}>(max 4)</span></label>
            <span style={{ fontSize: 12, color: ORANGE, cursor: "pointer" }} onClick={() => setShowShowPicker(v => !v)}>{showShowPicker ? "Fermer" : "Modifier"}</span>
          </div>
          {/* Affiché */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[0,1,2,3].map(i => {
              const s = favShows[i];
              return (
                <div key={i} onClick={() => s && toggleShow(s)} style={{ width: 70, cursor: s ? "pointer" : "default" }}>
                  <div style={{ width: 70, height: 105, borderRadius: 10, overflow: "hidden", background: "#0e0e0e", border: s ? "none" : "1px dashed #1e1e1e", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {s
                      ? <img src={s.poster} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span style={{ fontSize: 20, opacity: 0.15 }}>+</span>
                    }
                  </div>
                  {s && <div style={{ fontSize: 9, color: "#444", marginTop: 4, textAlign: "center", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{s.title}</div>}
                </div>
              );
            })}
          </div>
          {/* Picker : séries vues */}
          {showShowPicker && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: "#444", marginBottom: 8 }}>Sélectionne parmi tes séries vues</div>
              <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
                {watched.map(s => {
                  const sel = favShows.find(x => x.tmdbId === s.tmdbId);
                  return (
                    <div key={s.tmdbId} onClick={() => toggleShow(s)} style={{ flexShrink: 0, width: 70, cursor: "pointer", opacity: favShows.length >= 4 && !sel ? 0.35 : 1 }}>
                      <div style={{ width: 70, height: 105, borderRadius: 10, overflow: "hidden", background: "#0e0e0e", border: sel ? `2px solid ${ORANGE}` : "none" }}>
                        {s.poster ? <img src={s.poster} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📺</div>}
                      </div>
                      <div style={{ fontSize: 9, color: sel ? ORANGE : "#444", marginTop: 4, textAlign: "center", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{s.title}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Section Compte */}
      <div style={{ padding: "0 20px 60px" }}>
        <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12 }}>Compte</div>
        <div style={{ background: "#111", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#555", marginBottom: 12 }}>
          Connecté en tant que <span style={{ color: "#aaa" }}>{authEmail}</span>
        </div>
        <button onClick={onChangePassword} style={{ width: "100%", padding: "13px 16px", background: "#0e0e0e", border: "1px solid #222", borderRadius: 12, color: "#ddd", fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 10 }}>
          🔑 Changer mon mot de passe
        </button>
        <button onClick={onLogout} style={{ width: "100%", padding: "13px 16px", background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 12, color: "#ef4444", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          Se déconnecter
        </button>

        {/* Données personnelles (RGPD) */}
        <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: ".08em", margin: "28px 0 12px" }}>Mes données</div>
        <button onClick={handleExport} disabled={exporting} style={{ width: "100%", padding: "13px 16px", background: "#0e0e0e", border: "1px solid #222", borderRadius: 12, color: "#ddd", fontSize: 14, fontWeight: 600, cursor: exporting ? "default" : "pointer", marginBottom: 10 }}>
          {exporting ? "Préparation du fichier…" : "⬇️ Télécharger mes données"}
        </button>
        {exportError && <div style={{ color: "#f87171", fontSize: 12, marginBottom: 10 }}>{exportError}</div>}
        <button onClick={onOpenPrivacy} style={{ width: "100%", padding: "13px 16px", background: "#0e0e0e", border: "1px solid #222", borderRadius: 12, color: "#ddd", fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 10 }}>
          🔒 Confidentialité
        </button>
        <button onClick={() => setShowDelete(true)} style={{ width: "100%", padding: "13px 16px", background: "transparent", border: "1px solid rgba(239,68,68,.35)", borderRadius: 12, color: "#ef4444", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          Supprimer mon compte
        </button>
      </div>
      {showDelete && <DeleteAccountDialog onCancel={() => setShowDelete(false)} onConfirm={onDeleteAccount} />}
    </div>
  );
}

// ─── Confirmation de suppression du compte ────────────────────────────────────
const CONFIRM_WORD = "SUPPRIMER";

function DeleteAccountDialog({ onCancel, onConfirm }) {
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const canDelete = typed.trim().toUpperCase() === CONFIRM_WORD && !deleting;

  const handle = async () => {
    if (!canDelete) return;
    setDeleting(true); setError("");
    try {
      await onConfirm();
    } catch (e) {
      console.error("Suppression du compte :", e);
      setError("La suppression a échoué, ton compte n'a pas été supprimé. Réessaie plus tard.");
      setDeleting(false);
    }
  };

  // Portail : affiché directement dans <body>, au-dessus de la barre de navigation
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 100002, background: "rgba(0,0,0,.8)", display: "flex", alignItems: "flex-end", justifyContent: "center", fontFamily: "'DM Sans',system-ui,sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 440, background: "#111", borderRadius: "20px 20px 0 0", padding: "24px 20px 36px", border: "1px solid #222" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 10 }}>Supprimer ton compte ?</div>
        <div style={{ fontSize: 13, color: "#aaa", lineHeight: 1.6, marginBottom: 14 }}>
          Ton compte et <b style={{ color: "#ddd" }}>toutes tes données</b> seront supprimés définitivement : profil, séries,
          épisodes, notes, listes, badges, critiques, commentaires, « j'aime » et abonnements.
          <b style={{ color: "#f87171" }}> C'est irréversible.</b> Pense à télécharger tes données avant si tu veux les garder.
        </div>
        <div style={{ fontSize: 12, color: "#777", marginBottom: 8 }}>Pour confirmer, tape <b style={{ color: "#ddd" }}>{CONFIRM_WORD}</b> :</div>
        <input value={typed} onChange={e => setTyped(e.target.value)} placeholder={CONFIRM_WORD} autoCapitalize="characters" autoComplete="off"
          style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 10, color: "#fff", fontSize: 15, outline: "none", marginBottom: 14 }} />
        {error && <div style={{ color: "#f87171", fontSize: 12, marginBottom: 12 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} disabled={deleting} style={{ flex: 1, padding: "13px", borderRadius: 12, background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#aaa", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Annuler</button>
          <button onClick={handle} disabled={!canDelete} style={{ flex: 1, padding: "13px", borderRadius: 12, background: canDelete ? "#dc2626" : "#2a1212", border: "none", color: canDelete ? "#fff" : "#7a4040", fontSize: 14, fontWeight: 700, cursor: canDelete ? "pointer" : "default" }}>
            {deleting ? "Suppression…" : "Supprimer"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
