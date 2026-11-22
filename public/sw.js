// Service worker SeriesBoxd
// - Pages (HTML) : réseau d'abord, cache seulement hors-ligne → jamais bloqué sur une vieille version
// - Fichiers /assets/ (JS/CSS avec un hash dans le nom) : cache d'abord, ils ne changent jamais
// - Icônes / manifest : cache d'abord, mis à jour en arrière-plan
// - TMDB, Supabase, /api : jamais interceptés (toujours le réseau)
const CACHE = "seriesboxd-v2";
const PRECACHE = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Autre domaine (TMDB, Supabase, images…) ou API → on laisse passer
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Navigation (ouverture de l'app / d'une page) : réseau d'abord
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // Fichiers versionnés de Vite : cache d'abord
  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // Autres fichiers statiques (icônes, manifest) : cache, puis mise à jour en arrière-plan
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
