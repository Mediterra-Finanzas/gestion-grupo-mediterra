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

  // ── Modo RESPALDO REAL (solo versión local) ───────────────────────────
  // El respaldo descargado de la app ("💾 Respaldo") se carga en IndexedDB de
  // ESTE navegador: una copia ORIGINAL que nunca se modifica (texto exacto +
  // SHA-256) y una COPIA DE TRABAJO sobre la que opera la app. El archivo del
  // disco solo se lee. Nada sale del equipo.
  var MODO_LS = 'mediterra_vista_previa_modo';
  var modoRespaldo = false;
  try { modoRespaldo = localStorage.getItem(MODO_LS) === 'respaldo' && !!window.__VP_PERMITIR_RESPALDO; } catch (e) {}
  function idb() {
    return new Promise(function (ok, mal) {
      var r = indexedDB.open('mediterra_vista_previa', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
      r.onsuccess = function () { ok(r.result); }; r.onerror = function () { mal(r.error); };
    });
  }
  function idbGet(k) { return idb().then(function (db) { return new Promise(function (ok, mal) {
    var q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = function () { ok(q.result); }; q.onerror = function () { mal(q.error); }; }); }); }
  function idbPut(k, v) { return idb().then(function (db) { return new Promise(function (ok, mal) {
    var t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = function () { ok(); }; t.onerror = function () { mal(t.error); }; }); }); }
  function idbDel(k) { return idb().then(function (db) { return new Promise(function (ok) {
    var t = db.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k); t.oncomplete = function () { ok(); }; t.onerror = function () { ok(); }; }); }); }
  var colaGuardado = Promise.resolve();

  var store = null;
  function guardar() {
    if (modoRespaldo) { var copia = JSON.parse(JSON.stringify(store)); colaGuardado = colaGuardado.then(function () { return idbPut('trabajo', copia); }); return; }
    guardarLS(store);
  }
  var listo = modoRespaldo
    ? idbGet('trabajo').then(function (t) {
        if (!t) { try { localStorage.removeItem(MODO_LS); } catch (e) {} modoRespaldo = false; store = leerLS() || window.__VP_SEMILLA(); }
        else store = t;
        window.__VP_STORE = store;
      })
    : Promise.resolve().then(function () { store = leerLS() || window.__VP_SEMILLA(); guardarLS(store); window.__VP_STORE = store; });
  window.__VP_LISTO = listo;
  window.__VP_MODO = function () { return modoRespaldo ? 'respaldo' : 'simulado'; };
  window.__VP_REINICIAR = function () { try { localStorage.removeItem(CLAVE); } catch (e) {} location.reload(); };

  function resp(body, status) {
    return Promise.resolve(new Response(typeof body === 'string' ? body : JSON.stringify(body),
      { status: status || 200, headers: { 'content-type': 'application/json', 'content-range': '0-0/1' } }));
  }

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    var metodo = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    if (url.indexOf(HOST) >= 0) return listo.then(function () { return manejarSupabase(url, metodo, init); });
    if (url.indexOf('api.emailjs.com') >= 0) return resp('OK');
    // Detector de versión de producción: en la vista previa no aplica (evita recargas).
    if (url.indexOf('gestion-grupo-mediterra.vercel.app') >= 0) return resp('', 404);
    try { var uu = new URL(url, location.href); if (uu.origin === location.origin && uu.pathname.indexOf('/api/') === 0) return resp({}); } catch (e) {}
    return fetchReal(input, init);
  };

  function manejarSupabase(url, metodo, init) {
    {
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
        guardar();
        return resp([{ id: id, value: fp.value, updated_at: fp.updated_at }]);
      }
      if (metodo === 'POST' || metodo === 'PUT') {
        var filas = Array.isArray(body) ? body : body ? [body] : [];
        var out = filas.map(function (fl) {
          var rid = fl.id || id; var ua = fl.updated_at || new Date().toISOString();
          store[rid] = { value: fl.value, updated_at: ua };
          return { id: rid, value: fl.value, updated_at: ua };
        });
        guardar();
        return resp(out, 201);
      }
      return resp([]);
    }
  }

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

  // ── Visor de Artifacts: diálogos y descargas ─────────────────────────
  // El visor NO muestra los diálogos nativos (confirm devuelve false y prompt
  // null) y bloquea las descargas. En ese modo:
  //   · Cada diálogo se muestra DENTRO de la página: el usuario escribe el
  //     motivo y acepta o cancela. Nada se responde solo. Como los diálogos
  //     nativos son síncronos, la primera llamada devuelve "cancelar" (la app
  //     no hace nada); al aceptar, se guarda la respuesta y se repite el
  //     mismo clic, y la app recibe ahora la respuesta escrita. Las
  //     respuestas valen solo para esa acción: se descartan a los pocos
  //     segundos de terminar o al cancelar.
  //   · Las descargas (Excel, PDF, ZIP) pasan por la capacidad "downloads"
  //     del visor, que pide confirmación antes de guardar.
  if (window.__VP_DIALOGOS_EN_PAGINA) {
    var ultimoClic = null, reproduciendo = false, respuestas = {}, timerLimpieza = null;
    document.addEventListener('click', function (e) {
      if (reproduciendo) return;
      if (e.target && e.target.closest && e.target.closest('#vp-dialogo, #vp-barra, #vp-toasts')) return;
      ultimoClic = { el: e.target, ts: Date.now() };
    }, true);
    var limpiarLuego = function (ms) { clearTimeout(timerLimpieza); timerLimpieza = setTimeout(function () { respuestas = {}; }, ms); };
    var reproducir = function () {
      var c = ultimoClic;
      if (!c || !c.el || !c.el.isConnected || Date.now() - c.ts > 10 * 60 * 1000) {
        toast('Respuesta guardada. Vuelve a ejecutar la acción para aplicarla.'); limpiarLuego(60000); return;
      }
      reproduciendo = true;
      try { c.el.click(); } finally { reproduciendo = false; }
      limpiarLuego(4000);
    };
    var dialogo = function (tipo, msg, def) {
      clearTimeout(timerLimpieza);
      var viejo = document.getElementById('vp-dialogo'); if (viejo) viejo.remove();
      var fondo = document.createElement('div'); fondo.id = 'vp-dialogo';
      fondo.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(16,24,40,.5);display:flex;align-items:center;justify-content:center;padding:16px;font:13px/1.5 Inter,system-ui,sans-serif';
      var caja = document.createElement('div');
      caja.style.cssText = 'background:#fff;color:#1e2733;border-radius:10px;border:1px solid #1E2761;max-width:560px;width:100%;padding:16px;box-shadow:0 10px 30px rgba(0,0,0,.3)';
      var t = document.createElement('div'); t.style.cssText = 'font-weight:800;margin-bottom:8px';
      t.textContent = tipo === 'prompt' ? 'La aplicación pide un dato' : tipo === 'confirm' ? 'La aplicación pide confirmar' : 'Aviso de la aplicación';
      var m = document.createElement('div'); m.style.cssText = 'white-space:pre-wrap;margin-bottom:10px;max-height:40vh;overflow:auto'; m.textContent = String(msg);
      caja.appendChild(t); caja.appendChild(m);
      var campo = null;
      if (tipo === 'prompt') {
        campo = document.createElement('textarea'); campo.id = 'vp-respuesta'; campo.rows = 3; campo.value = def != null ? String(def) : '';
        campo.style.cssText = 'width:100%;box-sizing:border-box;border:1px solid #aab6c6;border-radius:8px;padding:8px;font:inherit;margin-bottom:10px';
        caja.appendChild(campo);
      }
      var pie = document.createElement('div'); pie.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
      var boton = function (txt, id, primario, fn) {
        var b = document.createElement('button'); b.id = id; b.textContent = txt;
        b.style.cssText = 'padding:7px 16px;border-radius:8px;cursor:pointer;font:inherit;font-weight:700;' + (primario ? 'background:#1E2761;color:#fff;border:none' : 'background:#fff;color:#5b6b7f;border:1px solid #c5cedb');
        b.onclick = function () { fondo.remove(); fn(); }; pie.appendChild(b);
      };
      if (tipo === 'alert') boton('Entendido', 'vp-aceptar', true, function () {});
      else {
        boton('Cancelar', 'vp-cancelar', false, function () { respuestas = {}; toast('Operación cancelada: no se registró nada.'); });
        boton('Aceptar', 'vp-aceptar', true, function () { respuestas[tipo + '|' + msg] = tipo === 'prompt' ? campo.value : true; reproducir(); });
      }
      caja.appendChild(pie); fondo.appendChild(caja); document.body.appendChild(fondo);
      if (campo) campo.focus();
    };
    window.alert = function (m) { dialogo('alert', m); };
    window.confirm = function (m) {
      var k = 'confirm|' + m; if (k in respuestas) return respuestas[k] === true;
      setTimeout(function () { dialogo('confirm', m); }, 0); return false;
    };
    window.prompt = function (m, def) {
      var k = 'prompt|' + m; if (k in respuestas) return respuestas[k];
      setTimeout(function () { dialogo('prompt', m, def); }, 0); return null;
    };

    // Descargas → capacidad "downloads" del visor (confirmación antes de guardar).
    var dl = null;
    try { if (window.claude && window.claude.use) window.claude.use('downloads').then(function (x) { dl = x; }, function () {}); } catch (e) {}
    var ofrecer = function (nombre, datos) {
      if (!dl) { toast('Este visor no permite guardar archivos. Usa la versión local de la vista previa para descargar "' + nombre + '".'); return; }
      dl.save({ filename: nombre, data: datos }).then(function () { toast('Guardado: ' + nombre); },
        function (err) { toast((err && err.code === 'declined') ? 'Descarga cancelada.' : 'No se pudo guardar ' + nombre + (err && err.code ? ' (' + err.code + ')' : '') + '.'); });
    };
    window.saveAs = function (blob, nombre) { ofrecer(nombre || 'archivo', blob); };
    var clickReal = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.hasAttribute('download') && /^(blob:|data:)/.test(this.href || '')) {
        var nombre = this.getAttribute('download') || 'archivo';
        fetchReal(this.href).then(function (r) { return r.blob(); }).then(function (b) { ofrecer(nombre, b); },
          function () { toast('No se pudo preparar la descarga de ' + nombre + '.'); });
        return;
      }
      return clickReal.apply(this, arguments);
    };
    var dispatchReal = HTMLAnchorElement.prototype.dispatchEvent;
    HTMLAnchorElement.prototype.dispatchEvent = function (ev) {
      if (ev && ev.type === 'click' && this.hasAttribute('download') && /^(blob:|data:)/.test(this.href || '')) { this.click(); return false; }
      return dispatchReal.apply(this, arguments);
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

  // ── Respaldo real: cargar, exportar, salir ───────────────────────────
  function sha256(texto) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    });
  }
  function descargar(nombre, contenido, tipo) {
    var url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    var a = document.createElement('a'); a.href = url; a.download = nombre; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 2000);
  }
  // Store de trabajo a partir del respaldo, salvo los PIN: se reemplazan por la
  // credencial de prueba (los PIN reales no se cargan en el navegador).
  // Formato de cada fila: el respaldo de la app parsea todas las filas (pierde si
  // eran texto JSON u objeto), así que se usa el formato de PRODUCCIÓN: las filas
  // de nóminas por empresa como texto JSON y el resto como objeto. Antes todo iba
  // como texto y la app no lee `main` (Tareas) en texto: partía vacía y su
  // guardado automático borraba estados y comentarios en la copia de trabajo
  // (detectado el 2026-10-07 con un respaldo real; producción no se vio afectada).
  function storeDesdeRespaldo(r) {
    var semilla = window.__VP_SEMILLA();
    var st = {};
    Object.keys(r.tablas).forEach(function (id) {
      if (/^backup_/.test(id)) return;
      var t = r.tablas[id] || {};
      var comoTexto = /^nominas_/.test(id) && id !== 'nominas_correlativos';
      var v = t.data;
      if (comoTexto && typeof v !== 'string') v = JSON.stringify(v);
      if (!comoTexto && typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { /* texto plano: se deja */ } }
      st[id] = { value: v, updated_at: t.updated_at || r.fecha };
    });
    st.pins = semilla.pins;
    return st;
  }
  function cargarRespaldo(archivo) {
    var lector = new FileReader();
    lector.onload = function () {
      var texto = String(lector.result), r;
      try { r = JSON.parse(texto); } catch (e) { alert('El archivo no es un JSON válido.'); return; }
      if (!r || !r.tablas || !/Mediterra Hub Backup/.test(r.version || '') || !r.tablas.finanzas) {
        alert('El archivo no es un respaldo de la app (falta "version: Mediterra Hub Backup" o la fila "finanzas").'); return;
      }
      sha256(texto).then(function (h) {
        var n = Object.keys(r.tablas).length;
        if (!confirm('Cargar el respaldo REAL en esta vista previa local\n\nArchivo: ' + archivo.name + ' (' + Math.round(archivo.size / 1024) + ' KB, ' + n + ' filas)\n' +
          'Fecha del respaldo: ' + (r.fecha || 's/f') + ' · ' + (r.usuario || '') + '\nSHA-256: ' + h.slice(0, 16) + '…\n\n' +
          '· El archivo solo se lee; se guarda una copia ORIGINAL intacta y una copia de TRABAJO en este navegador.\n' +
          '· No se conecta a producción ni envía correos.\n· Ingresas con el usuario de prueba (PIN 482913); los PIN reales no se cargan.\n\n¿Continuar?')) return;
        var original = { archivo: archivo.name, tamano: archivo.size, sha256: h, texto: texto, fechaRespaldo: r.fecha || null, usuario: r.usuario || null,
          cargado: new Date().toISOString() };
        idbPut('original', original).then(function () { return idbPut('trabajo', storeDesdeRespaldo(r)); }).then(function () {
          try { localStorage.setItem(MODO_LS, 'respaldo'); sessionStorage.clear(); } catch (e) {}
          location.reload();
        }, function (e) { alert('No se pudo guardar el respaldo en el navegador: ' + e.message); });
      });
    };
    lector.readAsText(archivo);
  }
  function comparacion() {
    return Promise.all([idbGet('original'), colaGuardado]).then(function (x) {
      var o = x[0]; if (!o) throw new Error('No hay respaldo original cargado.');
      return sha256(o.texto).then(function (h) {
        if (h !== o.sha256) throw new Error('El respaldo original guardado no coincide con su SHA-256. No se exporta.');
        var r = JSON.parse(o.texto);
        return { o: o, r: r, c: window.VPDiff.comparar(r, store) };
      });
    });
  }
  function sello() { return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'); }
  function exportarResultado() {
    comparacion().then(function (x) {
      var fv = store.finanzas ? store.finanzas.value : null;
      while (typeof fv === 'string') { try { fv = JSON.parse(fv); } catch (e) { fv = null; } }
      var out = {
        formato: 'mediterra-conciliacion-creditos-v1',
        advertencia: 'Resultado de una conciliación hecha en la VISTA PREVIA LOCAL. No aplicar a producción sin revisión y sin el procedimiento acordado (operaciones con verificación de "antes", nunca reemplazando la fila completa).',
        generado: new Date().toISOString(),
        respaldo: { archivo: x.o.archivo, tamano: x.o.tamano, sha256: x.o.sha256, verificacionSha256: 'coincide', fecha: x.o.fechaRespaldo, usuario: x.o.usuario,
          versionesFilas: Object.keys(x.r.tablas).reduce(function (a, k) { if (!/^backup_|^pins$/.test(k)) a[k] = x.r.tablas[k].updated_at || null; return a; }, {}) },
        resumen: x.c.resumen, alertas: x.c.alertas, operaciones: x.c.operaciones, filasConCambios: x.c.filas,
        referencia: fv ? { creditos_data: fv.creditos_data, creditos_saldos_informados: fv.creditos_saldos_informados, creditos_config: fv.creditos_config } : null,
      };
      descargar('conciliacion_creditos_' + sello() + '.json', JSON.stringify(out, null, 2), 'application/json');
      toast('Resultado exportado: ' + x.c.operaciones.length + ' operación(es)' + (x.c.alertas ? ' · ' + x.c.alertas + ' ALERTA(S) a revisar' : '') + '.');
    }, function (e) { alert(e.message); });
  }
  function exportarDetalle() {
    comparacion().then(function (x) {
      descargar('detalle_cambios_' + sello() + '.csv', window.VPDiff.csv(x.c.detalle, x.c.operaciones), 'text/csv;charset=utf-8');
      toast('Detalle exportado: ' + x.c.operaciones.length + ' operación(es) y ' + x.c.detalle.length + ' diferencia(s).');
    }, function (e) { alert(e.message); });
  }
  function verResumen() {
    comparacion().then(function (x) {
      var l = Object.keys(x.c.resumen).map(function (k) { return k + ': ' + x.c.resumen[k]; });
      alert('Cambios respecto del respaldo original (' + x.o.archivo + ')\n\n' + (l.length ? l.join('\n') : 'Sin cambios de Créditos.') +
        '\n\nDiferencias totales (incluye auto-guardado de la app): ' + x.c.detalle.length + (x.c.alertas ? '\nALERTAS: ' + x.c.alertas : ''));
    }, function (e) { alert(e.message); });
  }
  function salirRespaldo() {
    if (!confirm('Salir del modo respaldo real.\n\nSe BORRAN de este navegador la copia original y la copia de trabajo (el archivo de tu disco no se toca).\n¿Ya exportaste el resultado y el detalle?')) return;
    Promise.all([idbDel('original'), idbDel('trabajo')]).then(function () {
      try { localStorage.removeItem(MODO_LS); sessionStorage.clear(); } catch (e) {}
      location.reload();
    });
  }

  // ── Barra de la vista previa ─────────────────────────────────────────
  var BTN = 'margin:2px 4px 0 0;padding:2px 8px;border-radius:6px;border:1px solid #b45309;background:#fff;color:#78350f;cursor:pointer;font:inherit';
  function barra() {
    var b = document.createElement('div');
    b.id = 'vp-barra';
    var real = modoRespaldo;
    b.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99998;background:' + (real ? '#fee2e2' : '#fef3c7') + ';color:' + (real ? '#7f1d1d' : '#78350f') +
      ';border:1px solid ' + (real ? '#dc2626' : '#f59e0b') + ';border-radius:10px;padding:8px 12px;font:12px/1.45 Inter,system-ui,sans-serif;max-width:min(600px,calc(100vw - 24px));box-shadow:0 4px 14px rgba(0,0,0,.18)';
    if (real) {
      b.innerHTML = '<strong>VISTA PREVIA LOCAL · RESPALDO REAL</strong> <span id="vp-info"></span><br>' +
        'Los cambios quedan solo en este navegador. Producción no se lee ni se escribe; no se envían correos. Ingreso: <code>ahuerta@grupomediterra.cl</code> · PIN <code>482913</code>.<br>' +
        '<button id="vp-resumen" style="' + BTN + '">Ver resumen de cambios</button>' +
        '<button id="vp-exp-json" style="' + BTN + '">Exportar resultado (JSON)</button>' +
        '<button id="vp-exp-csv" style="' + BTN + '">Exportar detalle (CSV)</button>' +
        '<button id="vp-salir" style="' + BTN + '">Salir del modo respaldo</button>' +
        '<button id="vp-min" style="' + BTN + '">Ocultar</button>';
      document.body.appendChild(b);
      idbGet('original').then(function (o) { if (o) document.getElementById('vp-info').textContent = '· ' + o.archivo + ' · respaldo del ' + (o.fechaRespaldo || 's/f').slice(0, 16).replace('T', ' ') + ' · SHA-256 ' + o.sha256.slice(0, 12) + '…'; });
      document.getElementById('vp-resumen').onclick = verResumen;
      document.getElementById('vp-exp-json').onclick = exportarResultado;
      document.getElementById('vp-exp-csv').onclick = exportarDetalle;
      document.getElementById('vp-salir').onclick = salirRespaldo;
    } else {
      b.innerHTML = '<strong>VISTA PREVIA · DATOS SIMULADOS</strong> · nada se lee ni se escribe en producción; no se envían correos.<br>' +
        'Ingreso: <code>ahuerta@grupomediterra.cl</code> · PIN <code>482913</code> → Flujo de Caja → Créditos. ' +
        (window.__VP_DIALOGOS_EN_PAGINA ? 'Los motivos y confirmaciones se piden en un cuadro de esta página; las descargas piden tu confirmación. ' : '') +
        '<button id="vp-reset" style="' + BTN + '">Reiniciar datos</button>' +
        (window.__VP_PERMITIR_RESPALDO ? '<button id="vp-cargar" style="' + BTN + '">Cargar respaldo real…</button><input id="vp-archivo" type="file" accept=".json,application/json" style="display:none">' : '') +
        '<button id="vp-min" style="' + BTN + '">Ocultar</button>';
      document.body.appendChild(b);
      document.getElementById('vp-reset').onclick = function () { window.__VP_REINICIAR(); };
      if (window.__VP_PERMITIR_RESPALDO) {
        var inp = document.getElementById('vp-archivo');
        document.getElementById('vp-cargar').onclick = function () { inp.click(); };
        inp.onchange = function () { if (inp.files && inp.files[0]) cargarRespaldo(inp.files[0]); inp.value = ''; };
      }
    }
    document.getElementById('vp-min').onclick = function () { b.style.display = 'none'; toast('Barra oculta. Recarga la página para verla de nuevo.'); };
  }
  if (document.body) barra(); else document.addEventListener('DOMContentLoaded', barra);
})();
