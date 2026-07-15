export default async function handler(req, res) {
  // Extraire le chemin depuis l'URL directement
  const fullPath = req.url || "";
  const tmdbPath = fullPath.replace(/^\/api\/tmdb\/?/, "").split("?")[0];
  
  const query = new URLSearchParams(req.query);
  query.delete("path");
  query.set("api_key", process.env.TMDB_KEY || "");
  query.set("language", "fr-FR");

  const url = `https://api.themoviedb.org/3/${tmdbPath}?${query.toString()}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(response.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
