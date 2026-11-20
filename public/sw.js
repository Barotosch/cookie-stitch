const CACHE='cookie-stitch-local-0.3.3';
const ASSETS=['./','index.html','style.css?v=0.3.3','i18n.mjs?v=0.3.3','app.mjs?v=0.3.3','progress.mjs?v=0.3.3','project-store.mjs?v=0.3.3','achievements.mjs?v=0.3.3','celebrations.mjs?v=0.3.3','local-project.mjs?v=0.3.3','local-boot.mjs?v=0.3.3','cookie-icon-32.png','cookie-icon-180.png','cookie-icon-192.png','cookie-icon-512.png','cookie-icon-maskable.png','manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('cookie-stitch-local-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',e=>{if(e.data?.type==='CHECK_OFFLINE')e.waitUntil(caches.open(CACHE).then(async c=>e.ports[0]?.postMessage({ready:(await Promise.all(ASSETS.map(a=>c.match(a)))).every(Boolean)})));});
async function navigate(request){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),3000);
 try{
  const response=await fetch(request,{signal:controller.signal});
  if(response.status>=500)throw Error('Host unavailable');
  return response;
 }catch{
  return (await (await caches.open(CACHE)).match('index.html'))||Response.error();
 }finally{clearTimeout(timer);}
}
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;
 if(e.request.mode==='navigate'){e.respondWith(navigate(e.request));return;}
 e.respondWith(caches.open(CACHE).then(async c=>(await c.match(e.request))||fetch(e.request)));
});
