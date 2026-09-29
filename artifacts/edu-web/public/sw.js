const VERSION = "easyedu-web-__EASYEDU_BUILD_VERSION__";
const APP_SHELL = [
  "./",
  "./manifest.webmanifest",
  "./icon-192.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.pathname.includes("/api/")) return;

  const isAppShell =
    request.mode === "navigate" ||
    url.pathname.includes("/_expo/static/js/web/");
  const networkRequest = isAppShell
    ? new Request(request, { cache: "no-store" })
    : request;

  event.respondWith(
    fetch(networkRequest)
      .then((response) => {
        const copy = response.clone();
        caches.open(VERSION).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("./")))
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  let pushData = payload.data;
  if (typeof pushData === "string") {
    try {
      pushData = JSON.parse(pushData);
    } catch {
      pushData = {};
    }
  }
  if (!pushData || typeof pushData !== "object" || Array.isArray(pushData)) {
    pushData = payload;
  }

  const title = payload.title || pushData.title || "EasyEdu";
  const options = {
    body: payload.body || payload.content || pushData.body || "Bạn có một cập nhật mới.",
    icon: "./icon-192.png",
    tag: payload.tag || "easyedu-notification",
    data: pushData
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const destination = new URL("./", self.registration.scope);
  destination.searchParams.set("push", JSON.stringify(data));

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url.startsWith(self.registration.scope));
      if (existing) {
        existing.postMessage({
          type: "EASYEDU_PUSH_CLICK",
          data
        });
        return existing.focus();
      }
      return self.clients.openWindow(destination.toString());
    })
  );
});