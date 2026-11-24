// Première lettre en majuscule, "?" si le nom est vide ou absent (évite un plantage)
export const initialOf = (name) => (typeof name === "string" && name.trim() ? name.trim()[0].toUpperCase() : "?");
export function formatTime(m) {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24), r = h % 24;
  return r > 0 ? `${d}j ${r}h` : `${d}j`;
}

export function formatRelativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "À l'instant";
  if (m < 60) return "Il y a " + m + " min";
  const h = Math.floor(m / 60);
  if (h < 24) return "Il y a " + h + "h";
  const d = Math.floor(h / 24);
  if (d < 7) return "Il y a " + d + "j";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
