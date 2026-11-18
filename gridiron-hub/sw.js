// Lets the app install and open with no signal or one weak bar. Pages load fresh when the network answers.
const CACHE="gridiron-hub-v7";
// Save the page itself at install. Without this, the first visit caches nothing
// (the page loaded before the worker existed), so opening it offline right after
// installing fails. Each file is added on its own so one miss can't block install.
const SHELL=["./","index.html","manifest.json","assets/css/styles.css","assets/js/nav.js","assets/js/theme.js"];
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>Promise.all(SHELL.map(u=>c.add(new Request(u,{cache:"reload"})).catch(()=>{})))))});
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith("gridiron-hub-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{const r=e.request;if(r.method!=="GET"||new URL(r.url).origin!==location.origin)return;
  const saved=()=>caches.match(r).then(m=>m||caches.match("./"));
  const net=fetch(r);
  // Refresh the saved copy from the network's answer. waitUntil is called now, while the event runs:
  // a call made later, after the saved copy has gone out, can be refused and the copy never refreshes.
  e.waitUntil(net.then(res=>{if(res.ok){const c=res.clone();return caches.open(CACHE).then(x=>x.put(r,c))}},()=>{}));
  // One weak bar of signal: a fetch can hang a long time without failing. After 3 seconds the saved
  // copy shows instead (if there is one); with nothing saved, keep waiting for the network.
  e.respondWith(new Promise(resolve=>{let done=false;const give=res=>{if(!done&&res){done=true;resolve(res)}};
    const t=setTimeout(()=>saved().then(give),3000);
    net.then(res=>{clearTimeout(t);give(res)},()=>{clearTimeout(t);saved().then(m=>{give(m);if(!done){done=true;resolve(Response.error())}})})}))});
