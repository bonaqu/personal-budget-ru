"use strict";

const CACHE_NAME = "personal-budget-shell-v15-20260717-backup-reminder";
const BUILD_ASSETS = ["__VITE_BUILD_ASSETS__"];
const APP_SHELL = BUILD_ASSETS.length === 1 && BUILD_ASSETS[0] === "__VITE_BUILD_ASSETS__" ? [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/app-icon.svg?v=2",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./vendor/chart.umd.min.js",
  "./styles/00-foundation.css",
  "./styles/10-foundation-responsive.css",
  "./styles/20-analytics.css",
  "./styles/40-months.css",
  "./styles/50-settings.css",
  "./styles/60-budget.css",
  "./styles/70-auth.css",
  "./styles/80-product-polish.css",
  "./app.bundle.js"
] : BUILD_ASSETS;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
    self.clients.claim()
  ]));
});

self.addEventListener("message", (event) => {
  const sourceUrl = event.source?.url ? new URL(event.source.url) : null;
  const scope = new URL(self.registration.scope);
  if (event.origin !== self.location.origin || !sourceUrl || sourceUrl.origin !== scope.origin || !sourceUrl.pathname.startsWith(scope.pathname)) {
    return;
  }
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy)));
      return response;
    }).catch(() => caches.match("./index.html")));
    return;
  }

  event.respondWith(caches.match(request).then((cached) => {
    const refresh = fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
      }
      return response;
    }).catch(() => cached || Response.error());
    return cached || refresh;
  }));
});
