// Proxy TMDB pour le développement local (en production, ce sont les fonctions /api de Vercel).
// La clé est lue depuis le fichier .env (voir .env.example) — ne jamais l'écrire ici.
import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3001;
const TMDB_API_KEY = process.env.TMDB_KEY || process.env.TMDB_API_KEY;
const IS_PROD = process.env.NODE_ENV === "production";
const ALLOWED_ORIGINS = IS_PROD ? (process.env.ALLOWED_ORIGIN || "*") : "*";

if (!TMDB_API_KEY) {
  console.error("❌ Clé TMDB manquante : ajoute TMDB_KEY=... dans le fichier .env (voir .env.example).");
  process.exit(1);
}

app.use(cors({ origin: ALLOWED_ORIGINS }));

// ─── Route proxy TMDB ─────────────────────────────────────────────────────────

app.get("/tmdb/*path", async (req, res) => {
  try {
    const path = Array.isArray(req.params.path) ? req.params.path.join("/") : req.params.path;
    const query = { ...req.query, api_key: TMDB_API_KEY, language: "fr-FR" };
    const qs = new URLSearchParams(query).toString();
    const url = `https://api.themoviedb.org/3/${path}?${qs}`;
    const response = await fetch(url);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch {
    res.status(500).json({ error: "Erreur lors de la requête TMDB" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Proxy démarré sur http://localhost:${PORT}`);
});
