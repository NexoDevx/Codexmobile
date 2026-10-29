const V='cm-v28',A=['./','index.html','provedores.js','downloads.js','app.js','vsh.js','vsh2.js','extras.js','occore.js','oc.js','ext.js','ext2.js','img.js','apkcore.js','apksign.js','execore.js','pkgcore.js','pkg.js','reserva.js','nucleo.js','localcore.js','local.js','ocplus.js','style.css','brand.css','manifest.webmanifest','icon.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(A)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!=V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!='GET'||u.origin!=location.origin||u.pathname.startsWith('/gh/')||u.pathname.startsWith('/api/')||u.pathname.startsWith('/cm-'))return;
e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(V).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request)))});
