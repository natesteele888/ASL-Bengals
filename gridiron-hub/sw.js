// Lets the app install and open with a weak signal. Pages always load fresh when online.
const CACHE="gridiron-hub-v2";
// Save the page itself at install. Without this, the first visit caches nothing
// (the page loaded before the worker existed), so opening it offline right after
// installing fails. Each file is added on its own so one miss can't block install.
const SHELL=["./","index.html","manifest.json","assets/css/styles.css","assets/js/nav.js","assets/js/theme.js"];
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>Promise.all(SHELL.map(u=>c.add(new Request(u,{cache:"reload"})).catch(()=>{})))))});
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith("gridiron-hub-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{const r=e.request;if(r.method!=="GET"||new URL(r.url).origin!==location.origin)return;
  e.respondWith(fetch(r).then(res=>{if(res.ok){const c=res.clone();caches.open(CACHE).then(x=>x.put(r,c))}return res}).catch(()=>caches.match(r).then(m=>m||caches.match("./"))))});
