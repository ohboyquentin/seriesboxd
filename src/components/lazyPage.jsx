import { lazy, Suspense } from "react";

const RELOAD_FLAG = "seriesboxd_chunk_reload";

// Charge un écran seulement quand il est ouvert pour la première fois (code séparé du bundle principal).
// Usage : const BadgesPage = lazyPage(() => import("../pages/BadgesPage.jsx"), "BadgesPage");
// Pendant le chargement (une fraction de seconde), rien n'est affiché à la place de l'écran.
export function lazyPage(load, exportName) {
  const Page = lazy(() =>
    load()
      .then((m) => {
        try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* indisponible */ }
        return { default: m[exportName] };
      })
      .catch((err) => {
        // Cas typique : une nouvelle version a été déployée pendant que l'app était ouverte,
        // l'ancien fichier de l'écran n'existe plus → on recharge une fois pour prendre la nouvelle version.
        let alreadyReloaded = false;
        try { alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG) === "1"; sessionStorage.setItem(RELOAD_FLAG, "1"); } catch { /* indisponible */ }
        if (!alreadyReloaded) window.location.reload();
        throw err;
      })
  );
  function LazyPage(props) {
    return (
      <Suspense fallback={null}>
        <Page {...props} />
      </Suspense>
    );
  }
  LazyPage.displayName = `Lazy(${exportName})`;
  return LazyPage;
}
