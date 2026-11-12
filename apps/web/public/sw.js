/*
 * opetlife service worker: installable app shell, offline fallback and Web Push.
 *
 * What it caches, and why it is safe:
 * - /_next/static/*  content-hashed build files (JS, CSS, fonts). Public and immutable: cache first.
 * - /brand/*, /images/*  public brand art and illustrations: served from cache, refreshed in the background.
 * - /offline.html  a static page shown when a page cannot load at all.
 * It never caches pages (HTML or RSC), /api/* or anything from another origin, so no member's data is ever stored
 * on the device by this worker, and a shared phone never shows the previous member's screens.
 *
 * Push messages carry only a title and a same-origin link (see apps/api/.../push/web-push.service.ts).
 */
const VERSION = "2026-11-13.1";
const SHELL_CACHE = `opl-shell-${VERSION}`;
const STATIC_CACHE = "opl-static-v1";
const MEDIA_CACHE = "opl-media-v1";
const KEEP = new Set([SHELL_CACHE, STATIC_CACHE, MEDIA_CACHE]);
const OFFLINE_URL = "/offline.html";
const SHELL = [OFFLINE_URL, "/brand/opl/app-icon-192.png", "/brand/opl/mark-color.svg", "/brand/opl/badge-96.png"];
const STATIC_LIMIT = 400;
const MEDIA_LIMIT = 120;

const TAP_HINT = {
  fa: "برای دیدن جزئیات بزنید",
  ar: "اضغط لعرض التفاصيل",
  en: "Tap to see the details",
  de: "Tippe, um die Details zu sehen",
  es: "Toca para ver los detalles",
  nl: "Tik om de details te zien",
};
const FALLBACK_TITLE = {
  fa: "اعلان تازه در اپت لایف",
  ar: "إشعار جديد في opetlife",
  en: "New notification on opetlife",
  de: "Neue Benachrichtigung bei opetlife",
  es: "Nueva notificación en opetlife",
  nl: "Nieuwe melding op opetlife",
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith("opl-") && !KEEP.has(name)).map((name) => caches.delete(name)));
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => undefined);
      await self.clients.claim();
    })(),
  );
});

async function trim(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - limit; i += 1) await cache.delete(keys[i]);
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone());
    trim(STATIC_CACHE, STATIC_LIMIT).catch(() => undefined);
  }
  return response;
}

async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(MEDIA_CACHE);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then(async (response) => {
      if (response.ok && response.type === "basic") {
        await cache.put(request, response.clone());
        trim(MEDIA_CACHE, MEDIA_LIMIT).catch(() => undefined);
      }
      return response;
    })
    .catch(() => undefined);
  if (hit) {
    event.waitUntil(refresh);
    return hit;
  }
  return (await refresh) || Response.error();
}

async function navigate(event) {
  try {
    const preloaded = await event.preloadResponse;
    if (preloaded) return preloaded;
    return await fetch(event.request);
  } catch {
    const offline = await caches.match(OFFLINE_URL);
    return offline || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith(navigate(event));
    return;
  }
  // Range requests (audio/video) and RSC payloads always go to the network untouched.
  if (request.headers.has("range") || request.headers.has("rsc") || url.searchParams.has("_rsc")) return;
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.pathname.startsWith("/brand/") || url.pathname.startsWith("/images/")) {
    event.respondWith(staleWhileRevalidate(event, request));
  }
});

/** Only links on this site are ever opened from a notification. */
function sameOriginUrl(value) {
  try {
    const url = new URL(typeof value === "string" ? value : "/", self.location.origin);
    return url.origin === self.location.origin ? url.href : `${self.location.origin}/`;
  } catch {
    return `${self.location.origin}/`;
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const lang = typeof data.lang === "string" && TAP_HINT[data.lang] ? data.lang : "fa";
  const title = typeof data.title === "string" && data.title.trim() ? data.title.slice(0, 120) : FALLBACK_TITLE[lang];
  event.waitUntil(
    self.registration.showNotification(title, {
      body: TAP_HINT[lang],
      icon: "/brand/opl/app-icon-192.png",
      badge: "/brand/opl/badge-96.png",
      tag: typeof data.id === "string" && data.id ? data.id.slice(0, 80) : "opetlife",
      lang,
      dir: data.dir === "rtl" || data.dir === "ltr" ? data.dir : "auto",
      silent: data.silent === true,
      data: { url: sameOriginUrl(data.url) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = sameOriginUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        if ("navigate" in open) {
          try {
            await open.navigate(target);
            return;
          } catch {
            // An uncontrolled tab cannot be navigated by the worker; open the link in a new window instead.
          }
        } else {
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

/*
 * The push service rotated this browser's subscription. Re-subscribe with the same server key; the page sends the
 * new subscription to the API on the member's next visit (the API needs their session, which a worker cannot prove).
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  const key = event.oldSubscription && event.oldSubscription.options && event.oldSubscription.options.applicationServerKey;
  if (!key) return;
  event.waitUntil(self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }).catch(() => undefined));
});
