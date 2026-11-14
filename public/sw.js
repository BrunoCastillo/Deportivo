/* Service worker de Rebote: precachea toda la app para que funcione sin internet. */
importScripts("/precache-manifest.js");
const VERSION = self.__REB_VERSION || "dev";
const CACHE = "rebote-" + VERSION;
const PRECACHE = self.__REB_PRECACHE || ["/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      // Se cachea de a uno para que un archivo fallido no aborte la instalación
      await Promise.all(PRECACHE.map((u) => cache.add(new Request(u, { cache: "reload" })).catch(() => {})));
    }).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("rebote-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!isSameOrigin(url)) return; // Supabase y otros: siempre red

  // Navegaciones: red primero, si falla => HTML cacheado de esa ruta (sin query) => inicio
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(url.pathname, copy));
          return res;
        })
        .catch(async () => {
          const c = await caches.open(CACHE);
          const path = url.pathname.endsWith("/") ? url.pathname : url.pathname + "/";
          return (await c.match(path)) || (await c.match(path + "index.html")) || (await c.match("/")) || Response.error();
        }),
    );
    return;
  }

  // Archivos estáticos con hash y RSC: caché primero
  event.respondWith(
    caches.match(req, { ignoreSearch: url.pathname.endsWith(".txt") }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
