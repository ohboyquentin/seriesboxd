// Fil d'activité : chaque entrée enregistre l'ACTION (act, tmdbId, title…) en plus d'une phrase
// « Tu as… » (label, gardée pour la compatibilité et les règles de badges).
// La phrase affichée est construite selon qui regarde :
//   "self"    → « Tu as vu X »            (ma propre activité, phrase complète)
//   "name"    → « a vu X »                (précédée du nom : journal, fil des amis)
//   "profile" → « A vu X »                (profil public de quelqu'un d'autre)

const stars = (rating) => "★".repeat(Math.floor(rating || 0)) + ((rating || 0) % 1 ? "½" : "");

// Phrases à partir de l'action. `as` = « Tu as » / « a » / « A », `ta` = « ta » / « sa »
const PHRASES = {
  watch:            (e, as)     => `${as} vu ${e.title}`,
  rate:             (e, as)     => `${as} noté ${e.title} ${stars(e.rating)}`.trim(),
  watchlist_add:    (e, as, ta) => `${as} ajouté ${e.title} à ${ta} watchlist`,
  watchlist_remove: (e, as, ta) => `${as} retiré ${e.title} de ${ta} watchlist`,
  rewatch:          (e, as)     => `${as} revu ${e.title}`,
  list_create:      (e, as)     => `${as} créé la liste « ${e.listName} »`,
  season_done:      (e, as)     => `${as} fini la saison ${e.season} de ${e.title}`,
  episode:          (e, as)     => `${as} vu ${e.title} ${e.episodeCode}${e.episodeTitle ? ` – ${e.episodeTitle}` : ""}`,
  review:           (e, as)     => `${as} publié une critique de ${e.title}`,
  like:             (e, as)     => `${as} aimé la critique de ${e.otherUser} sur ${e.title}`,
  comment:          (e, as)     => `${as} commenté la critique de ${e.otherUser} sur ${e.title}`,
};

// Anciennes entrées (phrase seule) : on adapte le texte « Tu as … »
function convertLegacyLabel(label, as, ta) {
  let s = (label || "")
    .replace(/ à ta Watchlist$/i, ` à ${ta} watchlist`)
    .replace(/ de ta Watchlist$/i, ` de ${ta} watchlist`)
    .replace(/^Tu as rewatch ?/, "Tu as revu ")
    .replace(/^Tu as review /, "Tu as publié une critique de ");
  if (/^Tu as /.test(s)) return s.replace(/^Tu as /, `${as} `);
  if (/^Tu /.test(s)) return s.replace(/^Tu /, as === "Tu as" ? "Tu " : "");
  return s;
}

export function activityText(entry, mode = "self") {
  const as = mode === "self" ? "Tu as" : mode === "profile" ? "A" : "a";
  const ta = mode === "self" ? "ta" : "sa";
  const phrase = entry?.act && PHRASES[entry.act];
  if (phrase && (entry.title || entry.listName)) return phrase(entry, as, ta);
  return convertLegacyLabel(entry?.label, as, ta);
}

// Série concernée par une activité : par son identifiant, sinon (anciennes entrées)
// par le titre le plus long trouvé dans la phrase (évite « Lost » pour « Lost Girl »)
export function activitySeries(entry, library = []) {
  if (entry?.tmdbId != null) {
    const byId = library.find(s => s.tmdbId === entry.tmdbId);
    if (byId) return byId;
  }
  const label = entry?.label || "";
  let best = null;
  for (const s of library) {
    if (s.title && label.includes(s.title) && (!best || s.title.length > best.title.length)) best = s;
  }
  return best;
}
