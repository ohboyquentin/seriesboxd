import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import { readFileSync, writeFileSync, existsSync } from "fs";

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = "./seriesboxd-data.json";

// ─── Clé TMDB : variable d'environnement en prod, valeur par défaut en local ──
const TMDB_API_KEY = process.env.TMDB_API_KEY || "7b93f0fa13f72fcb119edf78b8d384b4";

// ─── Détection local / prod ───────────────────────────────────────────────────
const IS_PROD = process.env.NODE_ENV === "production";
const ALLOWED_ORIGINS = IS_PROD
  ? (process.env.ALLOWED_ORIGIN || "*")   // en prod : restreindre si besoin
  : "*";                                  // en local : tout autoriser

app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json({ limit: "5mb" }));

if (!TMDB_API_KEY) {
  console.error("❌ TMDB_API_KEY manquante — relance avec : TMDB_API_KEY=ta_clé node proxy.js");
  process.exit(1);
}

// ─── Helpers JSON ──────────────────────────────────────────────────────────────

function loadData() {
  if (!existsSync(DATA_FILE)) return {};
  try { return JSON.parse(readFileSync(DATA_FILE, "utf-8")); }
  catch { return {}; }
}

function saveData(data) {
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

// ─── Routes sauvegarde ────────────────────────────────────────────────────────

app.get("/data", (req, res) => {
  res.json(loadData());
});

app.post("/data", (req, res) => {
  try {
    saveData(req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Route proxy TMDB ─────────────────────────────────────────────────────────

app.get("/tmdb/*path", async (req, res) => {
  try {
    const path = Array.isArray(req.params.path)
      ? req.params.path.join("/")
      : req.params.path;
    const query = { ...req.query, api_key: TMDB_API_KEY, language: "fr-FR" };
    const qs = new URLSearchParams(query).toString();
    const url = `https://api.themoviedb.org/3/${path}?${qs}`;
    if (!IS_PROD) console.log("→ TMDB:", url);
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Erreur proxy TMDB :", err.message);
    res.status(500).json({ error: "Erreur lors de la requête TMDB" });
  }
});

// ─── Démarrage ────────────────────────────────────────────────────────────────

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Proxy démarré sur http://localhost:${PORT}`);
  console.log(`🌍 Environnement : ${IS_PROD ? "production" : "local"}`);
  console.log(`💾 Données : ${DATA_FILE}`);
  if (!IS_PROD) console.log(`🔑 Clé TMDB : ${TMDB_API_KEY.slice(0, 6)}...`);
});
