// Minimal service worker — just enough to make the app installable.
// Not doing offline caching since Jarvis needs a live connection to the backend anyway.
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => self.clients.claim());
self.addEventListener("fetch", (e) => {
  // pass everything straight through to the network
  e.respondWith(fetch(e.request));
});
