/* ─────────────────────────────────────────────────────────────────────────
   VISTA PREVIA — Supabase simulado DENTRO del navegador.

   Se carga ANTES del bundle de la app (build real, sin modificar). Reemplaza
   window.fetch solo para:
     · bywovqayuzodbzwsriet.supabase.co → store en memoria (+ localStorage del
       navegador). PRODUCCIÓN NO SE LEE NI SE ESCRIBE.
     · /api/* (funciones de Vercel) y api.emailjs.com → respuesta vacía: no se
       envían correos.
     · WebSocket de tiempo real de Supabase → socket inerte (no conecta).
   Lo demás (mindicador.cl, frankfurter.app) va a la red real si el navegador
   lo permite: así se puede probar en vivo la descarga de UF.

   Emula de PostgREST lo que usa la app (igual que scripts/e2e/fake.mjs):
     GET   ?id=eq.X                → [{id, value, updated_at}] | []
     GET   ?select=…&id=not.like.backup_*  → todas las filas (respaldo)
     PATCH ?id=eq.X&updated_at=eq.V → [] si la versión no coincide
     POST  (upsert)                 → filas escritas
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  var CLAVE = 'mediterra_vista_previa_store_v1';
  var HOST = 'bywovqayuzodbzwsriet.supabase.co';
  var fetchReal = window.fetch.bind(window);

  function leerLS() { try { var t = localStorage.getItem(CLAVE); return t ? JSON.parse(t) : null; } catch (e) { return null; } }
  function guardarLS(s) { try { localStorage.setItem(CLAVE, JSON.stringify(s)); } catch (e) { /* sin almacenamiento: queda en memoria */ } }
  var store = leerLS() || window.__VP_SEMILLA();
  guardarLS(store);
  window.__VP_STORE = store;
  window.__VP_REINICIAR = function () { try { localStorage.removeItem(CLAVE); } catch (e) {} location.reload(); };

  function resp(body, status) {
    return Promise.resolve(new Response(typeof body === 'string' ? body : JSON.stringify(body),
      { status: status || 200, headers: { 'content-type': 'application/json', 'content-range': '0-0/1' } }));
  }

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    var metodo = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    if (url.indexOf(HOST) >= 0) {
      var u = new URL(url);
      if (u.pathname.indexOf('/rest/v1/calendario_data') !== 0) return resp({});
      var q = decodeURIComponent(u.search);
      var mId = /id=eq\.([^&]+)/.exec(q), id = mId ? mId[1] : null;
      var mV = /updated_at=eq\.([^&]+)/.exec(q), version = mV ? mV[1] : null;
      var body = null;
      try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) {}
      if (metodo === 'GET') {
        if (id) { var f = store[id]; return resp(f ? [{ id: id, value: f.value, updated_at: f.updated_at }] : []); }
        return resp(Object.keys(store).filter(function (k) { return k.indexOf('backup_') !== 0; })
          .map(function (k) { return { id: k, value: store[k].value, updated_at: store[k].updated_at }; }));
      }
      if (metodo === 'PATCH') {
        var fp = id ? store[id] : null;
        if (!fp) return resp([]);
        if (version && fp.updated_at !== version) return resp([]);
        fp.value = body && body.value !== undefined ? body.value : fp.value;
        fp.updated_at = (body && body.updated_at) || new Date().toISOString();
        guardarLS(store);
        return resp([{ id: id, value: fp.value, updated_at: fp.updated_at }]);
      }
      if (metodo === 'POST' || metodo === 'PUT') {
        var filas = Array.isArray(body) ? body : body ? [body] : [];
        var out = filas.map(function (fl) {
          var rid = fl.id || id; var ua = fl.updated_at || new Date().toISOString();
          store[rid] = { value: fl.value, updated_at: ua };
          return { id: rid, value: fl.value, updated_at: ua };
        });
        guardarLS(store);
        return resp(out, 201);
      }
      return resp([]);
    }
    if (url.indexOf('api.emailjs.com') >= 0) return resp('OK');
    // Detector de versión de producción: en la vista previa no aplica (evita recargas).
    if (url.indexOf('gestion-grupo-mediterra.vercel.app') >= 0) return resp('', 404);
    try { var uu = new URL(url, location.href); if (uu.origin === location.origin && uu.pathname.indexOf('/api/') === 0) return resp({}); } catch (e) {}
    return fetchReal(input, init);
  };

  // El tiempo real de Supabase (WebSocket) apunta a PRODUCCIÓN: traería cambios
  // reales a esta sesión. Se reemplaza por un socket inerte que nunca conecta.
  var WSReal = window.WebSocket;
  window.WebSocket = function (url, prot) {
    if (String(url).indexOf(HOST) >= 0) {
      window.__VP_WS_BLOQUEADOS = (window.__VP_WS_BLOQUEADOS || 0) + 1;
      return { readyState: 0, url: String(url), send: function () {}, close: function () { this.readyState = 3; },
        addEventListener: function () {}, removeEventListener: function () {} };
    }
    return prot !== undefined ? new WSReal(url, prot) : new WSReal(url);
  };
  ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k, i) { window.WebSocket[k] = i; });

  // ── Avisos en pantalla ───────────────────────────────────────────────
  function toast(txt) {
    var c = document.getElementById('vp-toasts');
    if (!c) { c = document.createElement('div'); c.id = 'vp-toasts';
      c.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:99999;display:flex;flex-direction:column;gap:6px;max-width:420px;font:12px/1.4 Inter,system-ui,sans-serif';
      document.body.appendChild(c); }
    var d = document.createElement('div');
    d.style.cssText = 'background:#1E2761;color:#fff;border-radius:8px;padding:8px 12px;box-shadow:0 4px 14px rgba(0,0,0,.25);white-space:pre-wrap';
    d.textContent = txt; c.appendChild(d);
    setTimeout(function () { d.remove(); }, 9000);
  }
  window.__VP_TOAST = toast;

  // Dentro del visor de Artifacts los diálogos nativos no se muestran
  // (confirm devuelve false y prompt null). Ahí se responden solos y se avisa.
  if (window.__VP_DIALOGOS_AUTO) {
    window.alert = function (m) { toast(String(m)); };
    window.confirm = function (m) { toast('Confirmación respondida "Aceptar" automáticamente (vista previa):\n' + String(m).slice(0, 300)); return true; };
    window.prompt = function (m, def) {
      var r = def ? String(def) : (/Ingrese 1 o 2/.test(m) ? '1' : 'Motivo de prueba (vista previa)');
      toast('Diálogo respondido automáticamente con "' + r + '" (vista previa):\n' + String(m).slice(0, 300));
      return r;
    };
  }

  // Logos con ruta absoluta (/med.png) → relativa, para servirse junto a la página.
  new MutationObserver(function (muts) {
    muts.forEach(function (m) { (m.addedNodes || []).forEach(function (n) {
      if (!n.querySelectorAll) return;
      [n].concat([].slice.call(n.querySelectorAll('img'))).forEach(function (img) {
        var s = img.getAttribute && img.getAttribute('src');
        if (img.tagName === 'IMG' && s && s.charAt(0) === '/' && s.charAt(1) !== '/') img.setAttribute('src', '.' + s);
      });
    }); });
  }).observe(document.documentElement, { childList: true, subtree: true });

  // ── Barra de la vista previa ─────────────────────────────────────────
  function barra() {
    var b = document.createElement('div');
    b.id = 'vp-barra';
    b.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99998;background:#fef3c7;color:#78350f;border:1px solid #f59e0b;border-radius:10px;padding:8px 12px;font:12px/1.45 Inter,system-ui,sans-serif;max-width:min(560px,calc(100vw - 24px));box-shadow:0 4px 14px rgba(0,0,0,.18)';
    b.innerHTML = '<strong>VISTA PREVIA · DATOS SIMULADOS</strong> · nada se lee ni se escribe en producción; no se envían correos.<br>' +
      'Ingreso: <code>ahuerta@grupomediterra.cl</code> · PIN <code>482913</code> → Flujo de Caja → Créditos. ' +
      (window.__VP_DIALOGOS_AUTO ? 'Los diálogos (motivo, confirmación) se responden solos; las descargas Excel no funcionan aquí. ' : '') +
      '<button id="vp-reset" style="margin-left:4px;padding:2px 8px;border-radius:6px;border:1px solid #b45309;background:#fff;color:#78350f;cursor:pointer;font:inherit">Reiniciar datos</button> ' +
      '<button id="vp-min" style="padding:2px 8px;border-radius:6px;border:1px solid #b45309;background:#fff;color:#78350f;cursor:pointer;font:inherit">Ocultar</button>';
    document.body.appendChild(b);
    document.getElementById('vp-reset').onclick = function () { window.__VP_REINICIAR(); };
    document.getElementById('vp-min').onclick = function () { b.style.display = 'none'; toast('Barra oculta. Recarga la página para verla de nuevo.'); };
  }
  if (document.body) barra(); else document.addEventListener('DOMContentLoaded', barra);
})();
