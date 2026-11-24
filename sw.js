// Service worker: guarda a "casca" da app para abrir depressa e funcionar como app instalada.
// Os dados (Firebase) e a IA (Groq) vão sempre à rede.
const VERSAO = "kaizen-v1";
const CASCA = [
  "./", "./index.html", "./style.css", "./app.js", "./config.js", "./modelos-oficio.js", "./extenso.js", "./contactos-base.js", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/logo-matosinhos.png", "./icons/logo-kaizen.png", "./icons/mestre-busto.webp", "./icons/mestre-corpo-sem-mao.webp", "./icons/mestre-mao.webp"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  // Rede primeiro (para apanhar versões novas), cache se estiver sem rede.
  e.respondWith(
    fetch(e.request).then((r) => {
      const copia = r.clone();
      caches.open(VERSAO).then((c) => c.put(e.request, copia));
      return r;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});

// Ao clicar numa notificação: abrir (ou trazer para a frente) a app no Trabalho diário.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const d = e.notification.data || {};
  // Notificação com link do Edoc (página da Câmara): abre diretamente o Edoc.
  if (d.url && /^https:\/\/edoc\.cm-matosinhos\.pt\//.test(d.url)) { e.waitUntil(self.clients.openWindow(d.url)); return; }
  const alvo = new URL("./?abrir=diario", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ws) => {
    for (const w of ws) { if ("focus" in w) { w.postMessage({ abrir: "diario", filtro: e.notification.data && e.notification.data.filtro }); return w.focus(); } }
    return self.clients.openWindow(alvo);
  }));
});
