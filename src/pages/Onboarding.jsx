import { useState } from "react";
import { ALL_GENRES, ALL_PLATFORMS } from "../constants/genres.js";
import { ORANGE, ORANGE_BORDER, ORANGE_DIM } from "../constants/theme.js";
import { supabase } from "../lib/supabase.js";

export function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState([]);
  const [animDir, setAnimDir] = useState("forward");
  const toggleGenre    = g => setSelectedGenres(p => p.includes(g) ? p.filter(x => x !== g) : [...p, g]);
  const togglePlatform = p => setSelectedPlatforms(p2 => p2.includes(p) ? p2.filter(x => x !== p) : [...p2, p]);
  const goNext = () => { setAnimDir("forward"); setStep(s => s+1); };
  const goBack = () => { setAnimDir("back"); setStep(s => s-1); };
  const canNext = step===1 ? name.trim().length>=2 : step===2 ? selectedGenres.length>=3 : step===3 ? selectedPlatforms.length>=1 : true;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#080808", zIndex: 500, display: "flex", flexDirection: "column", maxWidth: 440, margin: "0 auto" }}>
      <style>{`@keyframes fadeSlideIn{from{opacity:0;transform:translateX(${animDir==="forward"?"24px":"-24px"})}to{opacity:1;transform:translateX(0)}}.ob-step{animation:fadeSlideIn .3s ease}`}</style>
      <div style={{ position: "absolute", top: -100, left: "50%", transform: "translateX(-50%)", width: 400, height: 400, background: `radial-gradient(circle,${ORANGE_DIM} 0%,transparent 70%)`, pointerEvents: "none" }} />
      {step > 0 && <div style={{ display: "flex", justifyContent: "center", gap: 8, paddingTop: 56 }}>{[1,2,3].map(i => <div key={i} style={{ height: 4, borderRadius: 2, transition: "all .3s", width: step>=i?24:8, background: step>=i?ORANGE:"#222" }} />)}</div>}
      {step === 0 && (
        <div className="ob-step" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px", textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 24 }}>📺</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif", lineHeight: 1.1, marginBottom: 16 }}>Series<span style={{ color: ORANGE }}>Boxd</span></div>
          <div style={{ color: "#666", fontSize: 16, lineHeight: 1.6, marginBottom: 48 }}>Suis tes séries, partage tes critiques et découvre ce que regardent tes amis.</div>
          <button onClick={goNext} style={{ width: "100%", padding: "16px", background: ORANGE, border: "none", borderRadius: 16, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>Commencer →</button>
          <div onClick={async () => { await supabase.auth.signOut(); }} style={{ marginTop: 16, color: "#333", fontSize: 13, cursor: "pointer" }}>Déjà un compte ? <span style={{ color: ORANGE }}>Se connecter</span></div>
        </div>
      )}
      {step === 1 && (
        <div className="ob-step" style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 24px 40px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif", marginBottom: 8 }}>Comment tu t'appelles ?</div>
            <div style={{ color: "#555", fontSize: 15, marginBottom: 36 }}>Choisis ton nom d'utilisateur</div>
            <div style={{ position: "relative", marginBottom: 12 }}>
              <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "#444" }}>@</span>
              <input value={name} onChange={e => setName(e.target.value.replace(/\s/g,"_").toLowerCase())} placeholder="ton_pseudo" maxLength={20} style={{ width: "100%", padding: "16px 16px 16px 36px", background: "#111", border: `1px solid ${name.length>=2?ORANGE_BORDER:"#1e1e1e"}`, borderRadius: 14, color: "#fff", fontSize: 18, outline: "none", fontFamily: "'DM Sans',system-ui,sans-serif" }} />
            </div>
            <div style={{ marginTop: 32, padding: "16px", background: "#0e0e0e", borderRadius: 14, border: "1px solid #181818" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: `linear-gradient(135deg, #c026d3, #f0abfc)`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#fff", fontSize: 16 }}>{name?name[0].toUpperCase():"?"}</div>
                <div><div style={{ color: "#fff", fontWeight: 600 }}>{name||"ton_pseudo"}</div><div style={{ color: "#444", fontSize: 12 }}>membre depuis {new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</div></div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={goBack} style={{ padding: "14px 20px", background: "#111", border: "1px solid #222", borderRadius: 14, color: "#666", cursor: "pointer" }}>←</button>
            <button onClick={goNext} disabled={!canNext} style={{ flex: 1, padding: "14px", background: canNext?ORANGE:"#1a1a1a", border: "none", borderRadius: 14, color: canNext?"#fff":"#444", fontSize: 15, fontWeight: 700, cursor: canNext?"pointer":"default" }}>Continuer →</button>
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="ob-step" style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 24px 40px" }}>
          <div style={{ flex: 1, overflowY: "auto" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif", marginBottom: 8 }}>Tes genres préférés</div>
            <div style={{ color: "#555", fontSize: 15, marginBottom: 24 }}>Sélectionne au moins 3</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {ALL_GENRES.map(g => {
                const active = selectedGenres.includes(g);
                const emojis = { Thriller:"🔪",Drame:"🎭","Sci-Fi":"🚀",Fantaisie:"🐉",Comédie:"😂",Horreur:"👻",Crime:"🔍",Historique:"⚔️",Animation:"🎨",Documentaire:"🎬",Romance:"❤️",Action:"💥" };
                return <button key={g} onClick={() => toggleGenre(g)} style={{ padding: "10px 16px", borderRadius: 24, background: active?ORANGE_DIM:"#111", border: `1.5px solid ${active?ORANGE:"#1e1e1e"}`, color: active?ORANGE:"#888", fontSize: 14, fontWeight: active?600:400, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><span>{emojis[g]}</span>{g}{active&&<span style={{ fontSize: 11 }}>✓</span>}</button>;
              })}
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            <button onClick={goBack} style={{ padding: "14px 20px", background: "#111", border: "1px solid #222", borderRadius: 14, color: "#666", cursor: "pointer" }}>←</button>
            <button onClick={goNext} disabled={!canNext} style={{ flex: 1, padding: "14px", background: canNext?ORANGE:"#1a1a1a", border: "none", borderRadius: 14, color: canNext?"#fff":"#444", fontSize: 15, fontWeight: 700, cursor: canNext?"pointer":"default" }}>Continuer →</button>
          </div>
        </div>
      )}
      {step === 3 && (
        <div className="ob-step" style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 24px 40px" }}>
          <div style={{ flex: 1, overflowY: "auto" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif", marginBottom: 8 }}>Tes plateformes</div>
            <div style={{ color: "#555", fontSize: 15, marginBottom: 28 }}>Sur quoi tu regardes tes séries ?</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {ALL_PLATFORMS.map(p => {
                const active = selectedPlatforms.includes(p.id);
                return <button key={p.id} onClick={() => togglePlatform(p.id)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: active?ORANGE_DIM:"#0e0e0e", border: `1.5px solid ${active?ORANGE_BORDER:"#191919"}`, borderRadius: 14, cursor: "pointer" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: active?p.color:"#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900, color: "#fff", flexShrink: 0 }}>{p.logo}</div>
                  <div style={{ color: active?"#fff":"#888", fontSize: 15, fontWeight: active?600:400, flex: 1, textAlign: "left" }}>{p.name}</div>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${active?ORANGE:"#2a2a2a"}`, background: active?ORANGE:"transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>{active&&<span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>✓</span>}</div>
                </button>;
              })}
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            <button onClick={goBack} style={{ padding: "14px 20px", background: "#111", border: "1px solid #222", borderRadius: 14, color: "#666", cursor: "pointer" }}>←</button>
            <button onClick={() => onComplete({ name, genres: selectedGenres, platforms: selectedPlatforms })} disabled={!canNext} style={{ flex: 1, padding: "14px", background: canNext?ORANGE:"#1a1a1a", border: "none", borderRadius: 14, color: canNext?"#fff":"#444", fontSize: 15, fontWeight: 700, cursor: canNext?"pointer":"default" }}>C'est parti ! 🎉</button>
          </div>
        </div>
      )}
    </div>
  );
}
