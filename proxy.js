import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const app = express();
const PORT = process.env.PORT || 3001;
const TMDB_API_KEY = process.env.TMDB_API_KEY || "7b93f0fa13f72fcb119edf78b8d384b4";
const IS_PROD = process.env.NODE_ENV === "production";
const ALLOWED_ORIGINS = IS_PROD ? (process.env.ALLOWED_ORIGIN || "*") : "*";

// Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json({ limit: "5mb" }));

// ─── Routes données ───────────────────────────────────────────────────────────

app.get("/data", async (req, res) => {
  const userId = req.query.userId || "default";
  const { data, error } = await supabase
    .from("user_data")
    .select("data")
    .eq("user_id", userId)
    .single();
  if (error && error.code !== "PGRST116") return res.status(500).json({ error: error.message });
  res.json(data?.data || {});
});

app.post("/data", async (req, res) => {
  const userId = req.query.userId || "default";
  const { error } = await supabase
    .from("user_data")
    .upsert({ user_id: userId, data: req.body, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ─── Route proxy TMDB ─────────────────────────────────────────────────────────

app.get("/tmdb/*path", async (req, res) => {
  try {
    const path = Array.isArray(req.params.path) ? req.params.path.join("/") : req.params.path;
    const query = { ...req.query, api_key: TMDB_API_KEY, language: "fr-FR" };
    const qs = new URLSearchParams(query).toString();
    const url = `https://api.themoviedb.org/3/${path}?${qs}`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Erreur lors de la requête TMDB" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Proxy démarré sur http://localhost:${PORT}`);
});
