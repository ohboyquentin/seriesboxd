import { useState } from "react";
import { ORANGE } from "../constants/theme.js";
import { supabase } from "../lib/supabase.js";

// ─── ONBOARDING ───────────────────────────────────────────────────────────────


// ─── AUTH SCREEN ──────────────────────────────────────────────────────────────
export function AuthScreen({ onOpenPrivacy, notice = "" }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handle = async () => {
    setError(""); setSuccess("");
    if (!email || (!password && mode !== "reset")) { setError("Remplis tous les champs."); return; }
    if (mode !== "reset" && password.length < 6) { setError("Mot de passe minimum 6 caractères."); return; }
    setLoading(true);
    try {
      if (mode === "login") {
        const { error: e } = await supabase.auth.signInWithPassword({ email, password });
        if (e) throw e;
      } else if (mode === "register") {
        const { error: e } = await supabase.auth.signUp({ email, password });
        if (e) throw e;
        setSuccess("Compte créé ! Vérifie ton email pour confirmer.");
      } else {
        const { error: e } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (e) throw e;
        setSuccess("Email de réinitialisation envoyé !");
      }
    } catch (e) {
      const msgs = {
        "Invalid login credentials": "Email ou mot de passe incorrect.",
        "User already registered": "Cet email est déjà utilisé.",
        "Email not confirmed": "Confirme ton email avant de te connecter.",
      };
      setError(msgs[e.message] || e.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'DM Sans',system-ui,sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📺</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif" }}>Seriesboxd</div>
          <div style={{ fontSize: 14, color: "#555", marginTop: 6 }}>Ta bibliothèque de séries</div>
        </div>
        {mode !== "reset" && (
          <div style={{ display: "flex", background: "#111", borderRadius: 14, padding: 4, marginBottom: 28 }}>
            {[["login","Connexion"],["register","Inscription"]].map(([m,l]) => (
              <button key={m} onClick={() => { setMode(m); setError(""); setSuccess(""); }}
                style={{ flex: 1, padding: "10px 0", borderRadius: 10, background: mode===m?"#1e1e1e":"transparent", border: "none", color: mode===m?"#fff":"#555", fontSize: 14, fontWeight: mode===m?600:400, cursor: "pointer" }}>
                {l}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key==="Enter" && handle()}
            style={{ padding: "14px 16px", background: "#111", border: "1px solid #222", borderRadius: 12, color: "#fff", fontSize: 15, outline: "none" }} />
          {mode !== "reset" && (
            <input type="password" placeholder="Mot de passe (min. 6 caractères)" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key==="Enter" && handle()}
              style={{ padding: "14px 16px", background: "#111", border: "1px solid #222", borderRadius: 12, color: "#fff", fontSize: 15, outline: "none" }} />
          )}
          {error   && <div style={{ color:"#f87171", fontSize:13, textAlign:"center", background:"rgba(248,113,113,.1)", padding:"10px 14px", borderRadius:10 }}>{error}</div>}
          {success && <div style={{ color:"#4ade80", fontSize:13, textAlign:"center", background:"rgba(74,222,128,.1)",  padding:"10px 14px", borderRadius:10 }}>{success}</div>}
          <button onClick={handle} disabled={loading}
            style={{ padding:"14px", background:loading?"#222":ORANGE, border:"none", borderRadius:12, color:loading?"#555":"#000", fontSize:15, fontWeight:700, cursor:loading?"default":"pointer" }}>
            {loading ? "..." : mode==="login" ? "Se connecter" : mode==="register" ? "Créer un compte" : "Envoyer le lien"}
          </button>
          {mode === "login" && (
            <button onClick={() => { setMode("reset"); setError(""); setSuccess(""); }}
              style={{ background:"none", border:"none", color:"#555", fontSize:13, cursor:"pointer", textAlign:"center" }}>
              Mot de passe oublié ?
            </button>
          )}
          {mode === "reset" && (
            <button onClick={() => { setMode("login"); setError(""); setSuccess(""); }}
              style={{ background:"none", border:"none", color:"#555", fontSize:13, cursor:"pointer", textAlign:"center" }}>
              ← Retour à la connexion
            </button>
          )}
          {notice && <div style={{ color:"#4ade80", fontSize:13, textAlign:"center", background:"rgba(74,222,128,.1)", padding:"10px 14px", borderRadius:10 }}>{notice}</div>}
          {onOpenPrivacy && (
            <button onClick={onOpenPrivacy}
              style={{ background:"none", border:"none", color:"#444", fontSize:12, cursor:"pointer", textAlign:"center", marginTop: 8, textDecoration: "underline" }}>
              Confidentialité
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
