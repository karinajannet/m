/* MARIPOSA 0909 — funciona sin internet una vez abierto.

   Dos politicas, segun lo que se pide:

   · index.html y datos.js  → primero la red. Asi, si cambias el contenido
     y vuelves a subir la carpeta, se ve lo nuevo enseguida.
   · fotos, icono, manifest → primero el cache. Nunca cambian sin cambiar
     de nombre, asi que la segunda visita no espera a la red: entra sola.
     Por detras se refrescan sin que nadie lo note.
   · audios y videos        → directo a la red, sin tocar. Asi el navegador
     puede pedir trozos (Range) y adelantar sin bajar el archivo entero.

   El repuesto index.html es SOLO para navegaciones. Antes se devolvia a
   cualquier peticion que fallara, asi que con mala conexion el navegador
   recibia la pagina entera donde esperaba una imagen o el manifest, y se
   quejaba de que no era una imagen valida. Eso ya no pasa.
*/
var CACHE = 'mariposa-0909-v8';
var FOTOS = /\.(webp|png|jpe?g|gif|svg|woff2?)$/i;

self.addEventListener('install', function(e){ self.skipWaiting(); });

self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.map(function(k){ return k === CACHE ? null : caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

function guardar(req, res){
  if (res && res.status === 200 && res.type === 'basic'){
    var copia = res.clone();
    caches.open(CACHE).then(function(c){ c.put(req, copia); });
  }
  return res;
}

self.addEventListener('fetch', function(e){
  var r = e.request;
  if (r.method !== 'GET') return;
  var u;
  try { u = new URL(r.url); } catch (err) { return; }
  if (u.origin !== location.origin) return;          // nada externo

  /* medios: que los gestione el navegador, con sus rangos y su adelanto */
  if (r.destination === 'video' || r.destination === 'audio') return;
  if (r.headers.get('range')) return;
  if (/\/(videos|audios)\//.test(u.pathname)) return;

  /* Los sonidos son otra cosa: medio mega entre los cinco —la puerta,
     la ventana, el latido, los fuegos y la atmosfera de la esfera—, no
     cambian nunca sin cambiar de nombre, y tienen que estar puestos
     ANTES de que hagan falta. Esos si van del cache, como las fotos.
     La pagina los pide con fetch nada mas cargar, asi que llegan aqui
     como destination "empty" y no como "audio": por eso caen en esta
     rama y no en la de medios de arriba, que es justo lo que queremos. */
  var UI = /\/sonidos\/.+\.mp3$/i.test(u.pathname);

  /* El manifest y sus iconos NO se tocan. No los pide la pagina: los pide
     el propio navegador por su cuenta, con una peticion distinta, y si el
     worker se mete por medio acaba quejandose de que el manifest no se
     entiende o de que el icono no es una imagen valida. Pesan cuatro
     kilos entre todos y se piden una vez. Que los sirva la red. */
  if (r.destination === 'manifest') return;
  if (/(app\.webmanifest|^\/?icon(-\d+)?\.(png|svg))$/.test(u.pathname.replace(/^.*\//,''))) return;

  /* las fotos: del cache, y se refrescan por detras */
  if (UI || FOTOS.test(u.pathname)){
    e.respondWith(
      caches.match(r).then(function(hit){
        if (hit){
          /* el refresco sigue por detras; hay que pedirle al navegador que
             no apague el worker antes de que termine */
          e.waitUntil(fetch(r).then(function(res){ guardar(r, res); }).catch(function(){}));
          return hit;
        }
        /* Sin copia: a la red. Y si la red falla hay que devolver una
           respuesta de verdad; devolver undefined desde respondWith es
           justo lo que provoca un "Download error" en el navegador. */
        return fetch(r).then(function(res){ return guardar(r, res); })
                       .catch(function(){ return Response.error(); });
      })
    );
    return;
  }

  /* lo demas: la red manda, el cache es el repuesto */
  e.respondWith(
    fetch(r).then(function(res){ return guardar(r, res); })
      .catch(function(){
        return caches.match(r).then(function(hit){
          if (hit) return hit;
          /* el repuesto de la pagina entera SOLO vale para navegaciones */
          if (r.mode === 'navigate' || r.destination === 'document')
            return caches.match('index.html');
          return Response.error();
        });
      })
  );
});
