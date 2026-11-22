import { useState } from "react";
import { ORANGE } from "../constants/theme.js";
import { supabase } from "../lib/supabase.js";

// ─── NOUVEAU MOT DE PASSE ─────────────────────────────────────────────────────
// Affiché quand on arrive par le lien « mot de passe oublié » (mode "recovery"),
// ou depuis les paramètres pour changer son mot de passe (mode "change").
export function NewPasswordScreen({ mode = "change", onDone, onCancel }) {
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handle = async () => {
    setError("");
    if (password.length < 6) { setError("Mot de passe minimum 6 caractères."); return; }
    if (password !== confirmPw) { setError("Les deux mots de passe ne correspondent pas."); return; }
    setLoading(true);
    const { error: e } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (e) {
      const msgs = {
        "New password should be different from the old password.": "Le nouveau mot de passe doit être différent de l'ancien.",
      };
      setError(msgs[e.message] || e.message);
      return;
    }
    setSuccess(true);
  };

  const inputStyle = { padding: "14px 16px", background: "#111", border: "1px solid #222", borderRadius: 12, color: "#fff", fontSize: 15, outline: "none" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100000, minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'DM Sans',system-ui,sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🔑</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif" }}>
            {mode === "recovery" ? "Choisis un nouveau mot de passe" : "Changer mon mot de passe"}
          </div>
        </div>
        {success ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ color:"#4ade80", fontSize:14, textAlign:"center", background:"rgba(74,222,128,.1)", padding:"12px 14px", borderRadius:10 }}>
              Mot de passe enregistré ✓
            </div>
            <button onClick={onDone}
              style={{ padding:"14px", background:ORANGE, border:"none", borderRadius:12, color:"#000", fontSize:15, fontWeight:700, cursor:"pointer" }}>
              Continuer
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <input type="password" placeholder="Nouveau mot de passe (min. 6 caractères)" value={password} autoComplete="new-password"
              onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key==="Enter" && handle()} style={inputStyle} />
            <input type="password" placeholder="Confirme le mot de passe" value={confirmPw} autoComplete="new-password"
              onChange={e => setConfirmPw(e.target.value)} onKeyDown={e => e.key==="Enter" && handle()} style={inputStyle} />
            {error && <div style={{ color:"#f87171", fontSize:13, textAlign:"center", background:"rgba(248,113,113,.1)", padding:"10px 14px", borderRadius:10 }}>{error}</div>}
            <button onClick={handle} disabled={loading}
              style={{ padding:"14px", background:loading?"#222":ORANGE, border:"none", borderRadius:12, color:loading?"#555":"#000", fontSize:15, fontWeight:700, cursor:loading?"default":"pointer" }}>
              {loading ? "..." : "Enregistrer"}
            </button>
            <button onClick={onCancel}
              style={{ background:"none", border:"none", color:"#555", fontSize:13, cursor:"pointer", textAlign:"center" }}>
              {mode === "recovery" ? "Plus tard" : "Annuler"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
