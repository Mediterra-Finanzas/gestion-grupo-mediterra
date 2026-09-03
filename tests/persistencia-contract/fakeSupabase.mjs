/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// fakeSupabase.mjs — PostgREST en memoria para ejercer persistContract OFFLINE.
//
// Entiende exactamente los 3 verbos que usa el contrato:
//   GET   ?id=eq.X&select=value,updated_at
//   PATCH ?id=eq.X&updated_at=eq.<version>   (Prefer: return=representation)
//   POST  (Prefer: resolution=merge-duplicates,return=representation)
//
// El `updated_at` lo asigna el SERVIDOR de forma estrictamente monótona (como haría
// un trigger BEFORE UPDATE real). Así el bloqueo optimista `updated_at=eq.<version>`
// distingue una versión de la siguiente sin depender del reloj del cliente.
//
// CODIFICACIÓN FÍSICA (F0-C). La columna `value` es jsonb. Una fila puede estar
// string-encoded (un JSON string DENTRO del jsonb) u objeto jsonb. Este fake
// almacena el valor EXACTAMENTE como lo manda el cliente (string u objeto) y lo
// devuelve tal cual en el GET / en la representación — igual que PostgREST sobre
// jsonb. Así el contrato ejerce el round-trip real de cada codificación.
//   - Semilla: `{ id: { value:<obj>, encoding:'string'|'object' } }`. `encoding`
//     por defecto = 'string' (formato legacy dominante en las filas vivas), lo que
//     conserva intacto el comportamiento del harness PERSIST-01..15.
//   - `db.leer(id)`   → { value:<obj decodificado>, updated_at }  (lector normal)
//   - `db.rawValue(id)` → el físico crudo EN DISCO (string u objeto)  (para asserts)
//   - `db.encoding(id)` → 'string' | 'object' | null                 (para asserts)
//
// Modos de fallo (db.modo):
//   "ok"        normal
//   "network"   fetch lanza (offline/timeout)         → req 08/13
//   "401"/"403" RLS/JWT: status ≠ 2xx                  → req 09/12/13
//   "slow"      demora db.slowMs antes de responder    → req 10
//   "mismatch"  2xx pero SIN representation (body sin updated_at) → req 14
// ═══════════════════════════════════════════════════════════════════════════════

const _esString = (v) => typeof v === "string";
// Decodifica el físico (string u objeto) al objeto que vería un lector normal.
function _decodificar(fisico) {
  return _esString(fisico) ? JSON.parse(fisico) : fisico;
}

export function crearFakeSupabase(seed = {}) {
  const filas = new Map(); // id -> { fisico:<string|object>, updated_at:<string> }
  const db = {
    filas, modo: "ok", slowMs: 0, _seq: 0,
    _ts() { // monótono, con forma ISO reconocible
      this._seq += 1;
      const ms = String(this._seq).padStart(6, "0");
      return `2026-09-02T12:00:${ms.slice(0, 2)}.${ms.slice(2)}Z`;
    },
    // Lectura decodificada (como haría el código de la app).
    leer(id) { const f = filas.get(id); return f ? { value: _decodificar(f.fisico), updated_at: f.updated_at } : null; },
    // El físico EN DISCO, sin decodificar (string-encoded → string; jsonb → objeto).
    rawValue(id) { const f = filas.get(id); return f ? f.fisico : undefined; },
    // La codificación física de la fila.
    encoding(id) { const f = filas.get(id); return f ? (_esString(f.fisico) ? "string" : "object") : null; },
  };
  for (const [id, v] of Object.entries(seed)) {
    const tieneValue = v && typeof v === "object" && Object.prototype.hasOwnProperty.call(v, "value");
    const obj = tieneValue ? v.value : v;
    const enc = (v && v.encoding) || "string"; // legacy-dominante por defecto (compat PERSIST-*)
    const fisico = enc === "object" ? obj : JSON.stringify(obj);
    filas.set(id, { fisico, updated_at: (v && v.updated_at) || db._ts() });
  }

  async function fakeFetch(url, init = {}) {
    if (db.modo === "network") throw new TypeError("Failed to fetch");
    if (db.modo === "slow" && db.slowMs) await new Promise(r => setTimeout(r, db.slowMs));
    if (db.modo === "401") return resp(false, 401, "JWT expired");
    if (db.modo === "403") return resp(false, 403, "RLS: new row violates policy");

    const method = (init.method || "GET").toUpperCase();

    if (method === "GET") {
      const id = idDeUrl(url);
      const f = id ? filas.get(id) : null;
      // Devuelve el físico TAL CUAL (string u objeto) → así lo hace PostgREST sobre jsonb.
      return resp(true, 200, "", () => (f ? [{ id, value: f.fisico, updated_at: f.updated_at }] : []));
    }

    if (method === "POST") {
      const body = JSON.parse(init.body);
      const rec = Array.isArray(body) ? body[0] : body;
      // 2xx pero SIN updated_at en la representación (fila/versión no confirmada) → req 14.
      // No se muta la fila: el cliente NO puede declarar éxito con esto.
      if (db.modo === "mismatch") return resp(true, 200, "", () => [{ id: rec.id, value: rec.value }]);
      const ts = db._ts();
      // Se almacena el físico EXACTAMENTE como lo envió el cliente (string u objeto),
      // preservando su codificación — como un INSERT jsonb real.
      filas.set(rec.id, { fisico: rec.value, updated_at: ts });
      return resp(true, 201, "", () => [{ id: rec.id, value: filas.get(rec.id).fisico, updated_at: ts }]);
    }

    if (method === "PATCH") {
      const id = idDeUrl(url);
      const cond = condDeUrl(url); // updated_at exigido
      const f = id ? filas.get(id) : null;
      // Bloqueo optimista: solo actualiza si la versión coincide.
      if (!f || (cond != null && f.updated_at !== cond)) return resp(true, 200, "", () => []); // 0 filas = conflicto
      const body = JSON.parse(init.body);
      // 2xx pero SIN updated_at en la representación → req 14. No se muta la fila.
      if (db.modo === "mismatch") return resp(true, 200, "", () => [{ id, value: body.value }]);
      const ts = db._ts();
      // Se conserva el físico como lo envió el cliente (string u objeto).
      filas.set(id, { fisico: body.value, updated_at: ts });
      return resp(true, 200, "", () => [{ id, value: filas.get(id).fisico, updated_at: ts }]);
    }

    return resp(false, 405, "method not allowed");
  }

  return { db, fetch: fakeFetch };
}

function idDeUrl(url) { const m = /id=eq\.([^&]+)/.exec(url); return m ? decodeURIComponent(m[1]) : null; }
function condDeUrl(url) { const m = /updated_at=eq\.([^&]+)/.exec(url); return m ? decodeURIComponent(m[1]) : null; }
function resp(ok, status, text, json) {
  return { ok, status, text: async () => text || "", json: async () => (json ? json() : []) };
}
