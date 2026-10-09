/* ─────────────────────────────────────────────────────────────────────────
   Supabase FALSO y AISLADO para la prueba de navegador.

   La app real (build de la rama) corre sin modificaciones; lo único que se
   cambia es a dónde van sus llamadas de red: todo lo que apunte a
   bywovqayuzodbzwsriet.supabase.co se responde desde este store en memoria.
   La base de PRODUCCIÓN no se lee ni se escribe en ningún momento.

   Emula PostgREST lo suficiente para el contrato de persistencia de la app:
     GET   ?id=eq.X&select=value,updated_at        → [{value, updated_at}] | []
     PATCH ?id=eq.X&updated_at=eq.V  (return=representation)
              → [] si la versión no coincide (conflicto), si no la fila escrita
     POST  (merge-duplicates, return=representation) → fila creada/actualizada
   Por defecto se comporta como PRODUCCIÓN HOY: no existe la función
   nominas_guardar (404, como PostgREST) ni el trigger que exige versión. La app
   guarda nóminas con PATCH condicionado a updated_at y POST sin merge-duplicates.
   Con `store.__propuestaNominas = true` emula además la propuesta NO aplicada
   (supabase/propuesta_nominas_version_obligatoria.sql): la función (PARTE 1) y la
   regla del trigger (PARTE 2), que rechaza con 400 la escritura directa de una
   fila nominas_<empresa> o de la fila antigua `nominas`.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';

export const EMAIL = 'ahuerta@grupomediterra.cl';
export const PIN = '482913';
const CRED = {"v":1,"iter":100000,"salt":"8db28853c3e6e11c4085136f641af071","hash":"e05f0f63955d08250a19abb1d83649416ee7c2fe605f654c35f18435da3adb4b","pol":"6dig","fecha":"2026-09-21T11:29:59.976Z"};

// Fecha del saldo bancario de la prueba (corte conocido).
export const FECHA_SALDO = '2026-09-15';
export const SALDO_INI = 17433;

const ts = (ms) => new Date(Date.now() - ms).toISOString();

export function nuevoStore() {
  return {
    main:            { value: { usuarios: [], estados: {} },                 updated_at: ts(50000) },
    pins:            { value: { "Angelo Huerta_h": JSON.stringify(CRED) },   updated_at: ts(49000) },
    audit_log:       { value: [],                                            updated_at: ts(48000) },
    finanzas:        { value: {
                         finanzas_real: {}, allegria_params: {},
                         params_emp: {}, params_as: {}, params_if: {}, params_af: {},
                         params_ap: {}, params_osiris: {}, params_participacion: {},
                         sub_lines: {}, added_lines: {}, intercompany: [], creditos_data: [],
                       },                                                    updated_at: ts(47000) },
    finanzas_bancos: { value: { saldos: {
                         "Allegria Foods||BICE||usd": { monto: SALDO_INI, fecha: FECHA_SALDO, moneda: "usd" },
                       } },                                                  updated_at: ts(46000) },
    finanzas_esc_index: { value: { escenarios: [] },                         updated_at: ts(45000) },
  };
}

// Igual que public.nominas_fila_protegida (PARTE 1 de la propuesta SQL).
export function filaNominaProtegida(id) {
  return typeof id === 'string' && id.startsWith('nominas_')
    && !['nominas_v2_done', 'nominas_tipos_doc', 'nominas_correlativos'].includes(id) && !id.startsWith('nominas_respaldo');
}

export function leerFila(store, id) {
  const f = store[id];
  if (!f) return null;
  return typeof f.value === 'string' ? JSON.parse(f.value) : f.value;
}

export async function instalarFake(context, store, log = () => {}) {
  // Diálogos: las pruebas anteriores responden prompt/confirm nativos (page.on('dialog')).
  // Las pruebas del sistema de diseño ponen store.__dialogosApp = true y usan los de la app.
  if (!store.__dialogosApp) await context.addInitScript(() => { window.__MDT_DIALOGOS_NATIVOS = true; });
  // La app consulta la portada de producción para detectar versiones nuevas: en las
  // pruebas no sale (y queda registrado si se intenta).
  await context.route(/gestion-grupo-mediterra\.vercel\.app/, (route) => { (store.__salidasProduccion = store.__salidasProduccion || []).push(route.request().url()); return route.abort(); });
  await context.route('**bywovqayuzodbzwsriet.supabase.co/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const metodo = req.method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json',
      headers: { 'content-range': '0-0/1', 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

    let body = null;
    try { body = JSON.parse(req.postData() || 'null'); } catch (_) {}
    const registrar = (rid, m) => { (store.__escrituras = store.__escrituras || []).push({ metodo: m || metodo, id: rid }); };
    const error400 = (message) => route.fulfill({ status: 400, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ code: 'P0001', details: null, hint: null, message }) });
    // Interceptor opcional por prueba: (metodo, id, body) → null (seguir) |
    // 'red' (sin respuesta) | { status, body } (respuesta de error simulada) |
    // 'perdida' (el servidor APLICA la escritura pero la respuesta no llega).
    // La llamada a nominas_guardar se le presenta como PATCH (con versión) o POST (creación).
    const interceptar = (m, rid) => {
      if (store.__interceptar) {
        const x = store.__interceptar(m, rid, body);
        if (x === 'perdida') return { perder: true };
        if (x === 'red') { log(`${m} ${rid} → SIN RED (simulado)`); return { respuesta: route.abort('failed') }; }
        if (x) { log(`${m} ${rid} → HTTP ${x.status} (simulado)`); return { respuesta: route.fulfill({ status: x.status, contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' }, body: typeof x.body === 'string' ? x.body : JSON.stringify(x.body || {}) }) }; }
      }
      if (store.__fallarEscrituras) {
        log(`${m} ${rid} → RECHAZADO (simulado)`);
        return { respuesta: route.fulfill({ status: 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"message":"fallo simulado"}' }) };
      }
      return {};
    };

    if (url.pathname === '/rest/v1/rpc/nominas_guardar' && metodo === 'POST' && !store.__propuestaNominas) {
      (store.__llamadasRpcInexistente = store.__llamadasRpcInexistente || []).push(body && body.p_id);
      log('POST  rpc/nominas_guardar → 404 (la función no existe, como en producción)');
      return route.fulfill({ status: 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
        body: '{"code":"PGRST202","message":"Could not find the function public.nominas_guardar"}' });
    }
    if (url.pathname === '/rest/v1/rpc/nominas_guardar' && metodo === 'POST') {
      const rid = body && body.p_id, ver = (body && body.p_version_leida) || null;
      const mEq = ver ? 'PATCH' : 'POST';
      const ic = interceptar(mEq, rid);
      if (ic.respuesta) return ic.respuesta;
      if (!filaNominaProtegida(rid)) return error400(`MEDITERRA_NOMINAS_FILA_NO_VALIDA: "${rid}" no es una fila de nóminas por empresa`);
      let contenido = null;
      try { contenido = typeof body.p_value === 'string' ? JSON.parse(body.p_value) : null; } catch (_) {}
      if (!contenido || !Array.isArray(contenido.nominas)) return error400('MEDITERRA_NOMINAS_FORMATO: el valor debe ser el texto JSON de la fila');
      let r;
      if (!ver) {
        if (store[rid]) r = { resultado: 'existe' };
        else { const v = new Date().toISOString(); store[rid] = { value: body.p_value, updated_at: v }; registrar(rid, mEq); r = { resultado: 'ok', version: v }; }
      } else {
        const f = store[rid];
        if (!f) r = { resultado: 'no_existe' };
        else if (f.updated_at !== ver) r = { resultado: 'conflicto', version_actual: f.updated_at };
        else {
          const v = new Date(Math.max(Date.now(), new Date(ver).getTime() + 1)).toISOString();
          f.value = body.p_value; f.updated_at = v; registrar(rid, mEq); r = { resultado: 'ok', version: v };
        }
      }
      log(`RPC nominas_guardar ${rid} (${ver ? 'con versión' : 'crear'}) → ${r.resultado}`);
      if (ic.perder && r.resultado === 'ok') { log(`RPC ${rid} → respuesta PERDIDA (simulado)`); return route.abort('failed'); }
      return json(r);
    }

    if (!url.pathname.startsWith('/rest/v1/calendario_data')) return json({});

    const idm = /id=eq\.([^&]+)/.exec(url.search);
    const id = idm ? decodeURIComponent(idm[1]) : null;
    const verm = /updated_at=eq\.([^&]+)/.exec(url.search);
    const version = verm ? decodeURIComponent(verm[1]) : null;

    // Lecturas fallidas simuladas por fila: (id) → null | 'red' | { status, body }.
    if (store.__interceptarLectura && metodo === 'GET') {
      const x = store.__interceptarLectura(id);
      if (x === 'red') return route.abort('failed');
      if (x) return route.fulfill({ status: x.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(x.body || {}) });
    }
    if (metodo === 'GET') {
      const f = id ? store[id] : null;
      log(`GET   ${id} → ${f ? 'fila' : 'vacío'}`);
      return json(f ? [{ id, value: f.value, updated_at: f.updated_at }] : []);
    }

    // Regla del trigger (PARTE 2): sin pasar por nominas_guardar no se escribe una fila de nóminas.
    const ridDirecto = id || (body && !Array.isArray(body) && body.id) || (Array.isArray(body) && body[0] && body[0].id) || null;
    if (store.__propuestaNominas && (filaNominaProtegida(ridDirecto) || ridDirecto === 'nominas')) {
      (store.__rechazosTrigger = store.__rechazosTrigger || []).push({ metodo, id: ridDirecto });
      log(`${metodo} ${ridDirecto} → 400 SIN VERSIÓN (regla del trigger)`);
      return error400(ridDirecto === 'nominas'
        ? 'MEDITERRA_NOMINAS_LEGADO: la fila antigua "nominas" es de solo lectura. Recarga la página.'
        : `MEDITERRA_NOMINAS_SIN_VERSION: "${ridDirecto}" solo se guarda indicando la versión leída. Tu página tiene una versión antigua de la app: recárgala.`);
    }
    const ic = interceptar(metodo, ridDirecto);
    if (ic.respuesta) return ic.respuesta;
    const perderRespuesta = !!ic.perder;

    if (metodo === 'PATCH') {
      const f = id ? store[id] : null;
      if (!f) { log(`PATCH ${id} → fila inexistente`); return json([]); }
      if (version && f.updated_at !== version) { log(`PATCH ${id} → CONFLICTO`); return json([]); }
      f.value = body?.value !== undefined ? body.value : f.value;
      f.updated_at = body?.updated_at || new Date().toISOString();
      registrar(id);
      log(`PATCH ${id} ← guardado`);
      if (perderRespuesta) { log(`PATCH ${id} → respuesta PERDIDA (simulado)`); return route.abort('failed'); }
      return json([{ id, value: f.value, updated_at: f.updated_at }]);
    }

    if (metodo === 'POST' || metodo === 'PUT') {
      const filas = Array.isArray(body) ? body : body ? [body] : [];
      // Como PostgREST: sin "resolution=merge-duplicates", insertar una fila que ya
      // existe es un error de clave duplicada (409).
      const prefer = String(req.headers()['prefer'] || '');
      if (metodo === 'POST' && !/merge-duplicates|ignore-duplicates/.test(prefer) && filas.some(fl => store[fl.id || id])) {
        log(`POST ${filas.map(fl => fl.id).join(',')} → 409 ya existe`);
        return route.fulfill({ status: 409, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"code":"23505","message":"duplicate key value violates unique constraint"}' });
      }
      const out = filas.map(fl => {
        const rid = fl.id || id;
        const updated_at = fl.updated_at || new Date().toISOString();
        store[rid] = { value: fl.value, updated_at };
        registrar(rid);
        log(`${metodo}  ${rid} ← guardado`);
        return { id: rid, value: fl.value, updated_at };
      });
      if (perderRespuesta) return route.abort('failed');
      return json(out, 201);
    }
    return json([]);
  });

  // El tiempo real de Supabase (WebSocket) apunta a PRODUCCIÓN y context.route
  // no intercepta WebSockets: se reemplaza por un socket inerte en la página.
  await context.addInitScript(() => {
    const WSReal = window.WebSocket;
    window.WebSocket = function (url, prot) {
      if (String(url).includes('bywovqayuzodbzwsriet.supabase.co')) {
        window.__WS_BLOQUEADOS = (window.__WS_BLOQUEADOS || 0) + 1;
        return { readyState: 0, url: String(url), send() {}, close() { this.readyState = 3; }, addEventListener() {}, removeEventListener() {} };
      }
      return prot !== undefined ? new WSReal(url, prot) : new WSReal(url);
    };
    ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach((k, i) => { window.WebSocket[k] = i; });
  });

  // Endpoints propios (/api/*) y correo: fuera del alcance de esta prueba.
  await context.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
}

export function volcarStore(store, ruta) {
  const plano = {};
  Object.keys(store).forEach(k => { plano[k] = leerFila(store, k); });
  fs.writeFileSync(ruta, JSON.stringify(plano, null, 2));
}
