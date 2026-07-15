export default async function handler(req, res) {
  const hasKey = !!process.env.TMDB_KEY;
  const keyPreview = process.env.TMDB_KEY ? process.env.TMDB_KEY.slice(0, 4) + "..." : "MISSING";
  
  const path = req.query.path?.join("/") || "";
  const query = new URLSearchParams(req.query);
  query.delete("path");
  query.set("api_key", process.env.TMDB_KEY || "");
  query.set("language", "fr-FR");

  const url = `https://api.themoviedb.org/3/${path}?${query.toString()}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(response.status).json({ ...data, _debug: { hasKey, keyPreview, path } });
  } catch (e) {
    res.status(500).json({ error: e.message, _debug: { hasKey, keyPreview } });
  }
}
