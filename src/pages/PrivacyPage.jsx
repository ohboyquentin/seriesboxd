import { ORANGE } from "../constants/theme.js";
import { scrollTopOnMount } from "../lib/dom.js";

// Adresse de contact affichée sur la page (à renseigner quand elle sera créée)
const PRIVACY_CONTACT_EMAIL = "";
const LAST_UPDATE = "23 novembre 2026";

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 26 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: "0 0 10px" }}>{title}</h2>
      <div style={{ fontSize: 13, color: "#aaa", lineHeight: 1.65 }}>{children}</div>
    </section>
  );
}

const li = { marginBottom: 6 };

export function PrivacyPage({ onClose }) {
  return (
    <div ref={scrollTopOnMount} style={{ position: "fixed", inset: 0, zIndex: 100001, background: "#080808", overflowY: "auto", maxWidth: 440, margin: "0 auto", fontFamily: "'DM Sans',system-ui,sans-serif" }}>
      <div style={{ position: "sticky", top: 0, background: "#080808", padding: "52px 20px 16px", display: "flex", alignItems: "center", gap: 14, borderBottom: "1px solid #111", zIndex: 1 }}>
        <button onClick={onClose} aria-label="Fermer" style={{ background: "none", border: "none", color: "#888", fontSize: 22, cursor: "pointer", padding: 0, lineHeight: 1 }}>←</button>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif" }}>Confidentialité</div>
          <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>Mise à jour : {LAST_UPDATE}</div>
        </div>
      </div>

      <div style={{ padding: "22px 20px 80px" }}>
        <Section title="En bref">
          SeriesBoxd sert à suivre tes séries et à les partager avec tes amis. Tes données ne servent qu'à faire
          fonctionner l'app : pas de publicité, pas de revente, pas d'outil de pistage ou de statistiques.
        </Section>

        <Section title="Ce que nous enregistrons">
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            <li style={li}><b style={{ color: "#ddd" }}>Ton compte</b> : adresse e-mail et mot de passe (le mot de passe est chiffré, personne ne peut le lire).</li>
            <li style={li}><b style={{ color: "#ddd" }}>Ton profil</b> : nom, pseudo, photo, bio, ville, site web, genres et séries préférés, plateformes.</li>
            <li style={li}><b style={{ color: "#ddd" }}>Ton suivi</b> : séries vues, en cours et en watchlist, épisodes cochés, notes, dates de visionnage, rewatchs, tags, listes, badges, journal d'activité.</li>
            <li style={li}><b style={{ color: "#ddd" }}>Tes échanges</b> : critiques, commentaires, « j'aime », abonnements.</li>
            <li style={li}><b style={{ color: "#ddd" }}>Sur ton appareil</b> : une copie de tes données et des fiches de séries déjà consultées, pour que l'app soit rapide et fonctionne hors connexion.</li>
          </ul>
        </Section>

        <Section title="Qui voit quoi">
          <p style={{ margin: "0 0 8px" }}><b style={{ color: "#ddd" }}>Visible par les autres utilisateurs</b> (ton profil public) :
            nom, pseudo, photo, bio, genres et séries préférés, bibliothèque (séries vues, notes, watchlist), listes, badges,
            tes 30 dernières activités, nombre total d'épisodes vus, critiques, commentaires, « j'aime » et abonnements.</p>
          <p style={{ margin: 0 }}><b style={{ color: "#ddd" }}>Visible par toi seul</b> : e-mail, ville, site web, plateformes,
            détail des épisodes cochés, journal d'activité complet, tags, dates de visionnage, rewatchs.</p>
        </Section>

        <Section title="Services utilisés">
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            <li style={li}><b style={{ color: "#ddd" }}>Supabase</b> : comptes et base de données.</li>
            <li style={li}><b style={{ color: "#ddd" }}>Vercel</b> : hébergement de l'app.</li>
            <li style={li}><b style={{ color: "#ddd" }}>TMDB</b> (The Movie Database) : informations et affiches des séries. Les affiches sont chargées directement depuis TMDB, qui reçoit donc ton adresse IP.</li>
            <li style={li}><b style={{ color: "#ddd" }}>Google Fonts</b> : polices d'écriture, chargées depuis les serveurs de Google, qui reçoit aussi ton adresse IP.</li>
          </ul>
          <p style={{ margin: "8px 0 0" }}>Ces services peuvent conserver des journaux techniques (adresse IP, date de connexion) selon leurs propres règles.</p>
        </Section>

        <Section title="Combien de temps">
          Tes données sont gardées tant que ton compte existe. Quand tu supprimes ton compte, elles sont effacées
          immédiatement de la base. Les sauvegardes techniques de l'hébergeur peuvent en garder une copie pendant une durée limitée.
        </Section>

        <Section title="Tes droits">
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            <li style={li}><b style={{ color: "#ddd" }}>Modifier</b> ton profil : Paramètres.</li>
            <li style={li}><b style={{ color: "#ddd" }}>Télécharger</b> toutes tes données : Paramètres → « Télécharger mes données ».</li>
            <li style={li}><b style={{ color: "#ddd" }}>Supprimer</b> ton compte et toutes tes données : Paramètres → « Supprimer mon compte ».</li>
          </ul>
          <p style={{ margin: "8px 0 0" }}>Tu peux aussi adresser une réclamation à la CNIL (cnil.fr).</p>
        </Section>

        <Section title="Contact">
          {PRIVACY_CONTACT_EMAIL
            ? <>Pour toute question sur tes données : <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} style={{ color: ORANGE }}>{PRIVACY_CONTACT_EMAIL}</a></>
            : <>Une adresse de contact sera bientôt indiquée ici. En attendant, tu peux exporter ou supprimer tes données directement depuis les paramètres.</>}
        </Section>
      </div>
    </div>
  );
}
