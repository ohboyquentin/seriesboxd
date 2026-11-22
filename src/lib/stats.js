// ─── STATS ────────────────────────────────────────────────────────────────────

export function computeStats(w, watchedEps = {}) {
  const totalMins = w.reduce((a, s) => {
    const watchedCount = watchedEps ? (Object.values(watchedEps[s.tmdbId] || {}).filter(Boolean).length) : 0;
    const epCount = watchedCount > 0 ? watchedCount : (s.episodes || 10);
    return a + epCount * 42;
  }, 0);
  const gc = {};
  w.forEach(s => {
    const genres = (s.genres && s.genres.length > 0) ? s.genres : (s.genre && s.genre !== "Série" ? [s.genre] : []);
    genres.forEach(g => { gc[g] = (gc[g] || 0) + 1; });
  });
  const genreData = Object.entries(gc).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const ratingDist = [1,2,3,4,5].map(r => ({ star: r, count: w.filter(s => s.userRating === r).length }));
  const rated = w.filter(s => s.userRating);
  const avgRating = rated.length ? (rated.reduce((a, s) => a + s.userRating, 0) / rated.length).toFixed(1) : "—";
  return { totalMins, genreData, ratingDist, avgRating };
}

export function computeCompatibility(myWatched, theirWatched) {
  // 1. Genres en commun (33.3%)
  const getGenres = (lib) => [...new Set(lib.flatMap(s => s.genres?.length ? s.genres : (s.genre ? [s.genre] : [])))];
  const myGenres = getGenres(myWatched);
  const theirGenres = getGenres(theirWatched);
  const commonGenres = myGenres.filter(g => theirGenres.includes(g));
  const totalGenres = new Set([...myGenres, ...theirGenres]).size;
  const genreScore = totalGenres > 0 ? commonGenres.length / totalGenres : 0;

  // 2. Séries en commun (33.3%)
  const myIds = new Set(myWatched.map(s => s.tmdbId));
  const theirIds = new Set(theirWatched.map(s => s.tmdbId));
  const commonSeries = [...myIds].filter(id => theirIds.has(id));
  const totalSeries = new Set([...myIds, ...theirIds]).size;
  const seriesScore = totalSeries > 0 ? commonSeries.length / totalSeries : 0;

  // 3. Notes similaires sur séries communes (33.3%)
  const myRated = myWatched.filter(s => s.userRating);
  const theirRated = theirWatched.filter(s => s.userRating);
  const bothRated = myRated.filter(s => theirRated.find(t => t.tmdbId === s.tmdbId));
  let ratingScore;
  if (bothRated.length > 0) {
    const avgDiff = bothRated.reduce((acc, s) => {
      const theirs = theirRated.find(t => t.tmdbId === s.tmdbId);
      return acc + Math.abs(s.userRating - theirs.userRating);
    }, 0) / bothRated.length;
    ratingScore = Math.max(0, 1 - avgDiff / 5);
  } else if (commonSeries.length === 0) {
    ratingScore = 0;
  } else {
    ratingScore = 0.5; // séries en commun mais aucune notée des deux côtés
  }

  return Math.round(((genreScore + seriesScore + ratingScore) / 3) * 100);
}
