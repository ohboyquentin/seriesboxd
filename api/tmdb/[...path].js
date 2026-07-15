export default async function handler(req, res) {
  const path = req.query.path?.join("/") || "";
  const query = new URLSearchParams(req.query);
  query.delete("path");
  query.set("api_key", process.env.TMDB_KEY);
  query.set("language", "fr-FR");

  const url = `https://api.themoviedb.org/3/${path}?${query.toString()}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(response.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
