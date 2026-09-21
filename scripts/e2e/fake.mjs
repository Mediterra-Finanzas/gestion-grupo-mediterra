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

export function leerFila(store, id) {
  const f = store[id];
  if (!f) return null;
  return typeof f.value === 'string' ? JSON.parse(f.value) : f.value;
}

export async function instalarFake(context, store, log = () => {}) {
  await context.route('**bywovqayuzodbzwsriet.supabase.co/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const metodo = req.method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json',
      headers: { 'content-range': '0-0/1', 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

    if (!url.pathname.startsWith('/rest/v1/calendario_data')) return json({});

    const idm = /id=eq\.([^&]+)/.exec(url.search);
    const id = idm ? decodeURIComponent(idm[1]) : null;
    const verm = /updated_at=eq\.([^&]+)/.exec(url.search);
    const version = verm ? decodeURIComponent(verm[1]) : null;
    let body = null;
    try { body = JSON.parse(req.postData() || 'null'); } catch (_) {}

    if (metodo === 'GET') {
      const f = id ? store[id] : null;
      log(`GET   ${id} → ${f ? 'fila' : 'vacío'}`);
      return json(f ? [{ id, value: f.value, updated_at: f.updated_at }] : []);
    }

    if (metodo === 'PATCH') {
      const f = id ? store[id] : null;
      if (!f) { log(`PATCH ${id} → fila inexistente`); return json([]); }
      if (version && f.updated_at !== version) { log(`PATCH ${id} → CONFLICTO`); return json([]); }
      f.value = body?.value !== undefined ? body.value : f.value;
      f.updated_at = body?.updated_at || new Date().toISOString();
      log(`PATCH ${id} ← guardado`);
      return json([{ id, value: f.value, updated_at: f.updated_at }]);
    }

    if (metodo === 'POST' || metodo === 'PUT') {
      const filas = Array.isArray(body) ? body : body ? [body] : [];
      const out = filas.map(fl => {
        const rid = fl.id || id;
        const updated_at = fl.updated_at || new Date().toISOString();
        store[rid] = { value: fl.value, updated_at };
        log(`${metodo}  ${rid} ← guardado`);
        return { id: rid, value: fl.value, updated_at };
      });
      return json(out, 201);
    }
    return json([]);
  });

  // Endpoints propios (/api/*) y correo: fuera del alcance de esta prueba.
  await context.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
}

export function volcarStore(store, ruta) {
  const plano = {};
  Object.keys(store).forEach(k => { plano[k] = leerFila(store, k); });
  fs.writeFileSync(ruta, JSON.stringify(plano, null, 2));
}
