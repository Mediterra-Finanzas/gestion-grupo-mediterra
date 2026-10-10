/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// FRANJA EJECUTIVA DEL INICIO — prueba de LECTURA SIN EFECTOS DE GUARDADO.
//
// Es la prueba que exige la propuesta (homogeneidad-y-plan.md §5) ANTES de leer
// `finanzas`, `finanzas_bancos` o `maestro_tc` desde el inicio. No hay todavía
// código de producción: el lector de abajo vive en la prueba y fija el contrato.
//
//   1. CONTROL: leer como lo hacen hoy dbLoad / dbLoadBancos de FinanzasModule
//      (fetch + persist.registrarCarga) desde el inicio, con Finanzas en
//      conflicto pendiente, BORRA el conflicto y la marca de cambios: el
//      siguiente auto-save pisa el guardado de la otra sesión.
//   2. LECTOR PROPUESTO: solo GET, no toca el contrato. El estado de guardado de
//      todas las filas queda idéntico, el conflicto sigue bloqueando y no sale
//      ninguna escritura.
//   3. Una lectura fallida se informa como error (nunca como cero ni vacío).
// Todo contra un PostgREST en memoria (fetch inyectado); ninguna petición sale.
// ═══════════════════════════════════════════════════════════════════════════════
import { crearPersistencia, MOTIVOS } from "../persistencia/persistContract.js";

const URL_FALSA = "https://falso.test";
const silencio = { info() {}, warn() {}, error() {} };

// ── PostgREST en memoria ──────────────────────────────────────────────────────
// La versión (`updated_at`) la asigna el SERVIDOR (v1, v2, v3…), como en Postgres:
// así dos escrituras en el mismo milisegundo no comparten versión y la prueba es
// determinista.
function servidorFalso(filasIniciales = {}) {
  const filas = {};
  for (const id of Object.keys(filasIniciales)) filas[id] = { ...filasIniciales[id] };
  const peticiones = [];
  let seq = 1;
  const estado = { modo: null, status: 500, ganchoPrePatch: null };

  const resp = (body, status = 200) => ({
    ok: status >= 200 && status < 300, status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });

  const fetchImpl = async (url, opts = {}) => {
    const metodo = (opts.method || "GET").toUpperCase();
    const u = new URL(String(url));
    const id = decodeURIComponent((/id=eq\.([^&]+)/.exec(u.search) || [])[1] || "");
    peticiones.push({ metodo, host: u.host, path: u.pathname, id, url: String(url) });

    if (estado.modo === "lanza" && metodo !== "GET") throw new TypeError("Failed to fetch");
    if (estado.modo === "lanza_todo") throw new TypeError("Failed to fetch");
    if (estado.modo === "http" && metodo !== "GET") return resp({ message: "denegado" }, estado.status);
    if (estado.modo === "sin_representacion" && metodo !== "GET") return resp([]);
    if (estado.modo === "representacion_vacia" && metodo !== "GET") return resp([{ id }]);

    if (metodo === "GET") {
      const f = filas[id];
      return resp(f ? [{ value: f.value, updated_at: f.updated_at }] : []);
    }
    const body = JSON.parse(opts.body || "{}");
    if (metodo === "PATCH") {
      if (estado.ganchoPrePatch) { const g = estado.ganchoPrePatch; estado.ganchoPrePatch = null; g(filas, () => `v${seq++}`); }
      const ver = decodeURIComponent((/updated_at=eq\.([^&]+)/.exec(u.search) || [])[1] || "");
      if (!filas[id] || filas[id].updated_at !== ver) return resp([]);   // 0 filas = conflicto
      filas[id] = { value: body.value, updated_at: `v${seq++}` };
      return resp([{ id, value: filas[id].value, updated_at: filas[id].updated_at }]);
    }
    if (metodo === "POST") {
      filas[body.id] = { value: body.value, updated_at: `v${seq++}` };
      return resp([{ id: body.id, value: filas[body.id].value, updated_at: filas[body.id].updated_at }], 201);
    }
    throw new Error(`método no soportado: ${metodo}`);
  };

  const cuenta = (m) => peticiones.filter((p) => p.metodo === m).length;
  const escrituras = () => peticiones.filter((p) => p.metodo !== "GET");
  const leer = (id) => { const v = filas[id] && filas[id].value; return v === undefined ? undefined : (typeof v === "string" ? JSON.parse(v) : v); };
  return { filas, fetchImpl, peticiones, cuenta, escrituras, leer, estado };
}

const sesion = (srv) => crearPersistencia({ fetch: srv.fetchImpl, supaUrl: URL_FALSA, supaKey: "k-falsa", logger: silencio });

// Lo que hacen hoy dbLoad("finanzas") / dbLoadBancos(): leer y REGISTRAR la carga.
async function cargaActual(srv, persist, id) {
  const r = await srv.fetchImpl(`${URL_FALSA}/rest/v1/calendario_data?id=eq.${id}&select=value,updated_at`);
  const d = await r.json(); const raw = d?.[0]?.value;
  const v = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : {};
  persist.registrarCarga(id, v, d?.[0]?.updated_at || null, typeof raw === "string");
  return v;
}
// Lector propuesto para el inicio: solo lectura, sin contrato de guardado.
async function leerSoloLectura(fetchImpl, id) {
  const r = await fetchImpl(`${URL_FALSA}/rest/v1/calendario_data?id=eq.${id}&select=value,updated_at`);
  if (!r.ok) throw new Error(`lectura ${id} HTTP ${r.status}`);
  const d = await r.json(); const raw = d?.[0]?.value;
  return { existe: !!d?.length, valor: raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : null, version: d?.[0]?.updated_at || null };
}

const BLOB = { creditos_data: [{ n: 1, empresa: "Osiris", monto: 1000 }], params_emp: { saldo: 0 } };
const BANCOS = { saldos: { Osiris: [{ banco: "Banco ficticio", monto: 500, moneda: "USD", fecha: "2026-10-01" }] } };
const con = (n) => ({ ...BLOB, params_emp: { saldo: n } });

// Deja a la sesión 2 en conflicto pendiente sobre `finanzas`: otra sesión guardó primero.
async function escenarioConflicto() {
  const srv = servidorFalso({ finanzas: { value: JSON.stringify(BLOB), updated_at: "v0" },
    finanzas_bancos: { value: JSON.stringify(BANCOS), updated_at: "b0" } });
  const s1 = sesion(srv), s2 = sesion(srv);
  await s1.load("finanzas"); await s2.load("finanzas"); await s2.load("finanzas_bancos");
  expect((await s1.saveConfirmed("finanzas", con(1000), {})).ok).toBe(true);
  const r = await s2.saveConfirmed("finanzas", con(7777), {});
  expect(r.motivo).toBe(MOTIVOS.CONFLICTO);
  expect(s2.estado("finanzas").conflictoPendiente).toBe(true);
  return { srv, s2 };
}
const huella = (p, ids) => JSON.stringify(ids.map(id => { const e = p.estado(id); return [id, e.version, e.base, e.dirty, e.conflictoPendiente, e.sucio, e.cargaOk]; }));

describe("franja ejecutiva: leer desde el inicio no puede tocar el guardado de Finanzas", () => {
  test("CONTROL: la carga actual (con registrarCarga) borra el conflicto y deja pisar el guardado ajeno", async () => {
    const { srv, s2 } = await escenarioConflicto();
    await cargaActual(srv, s2, "finanzas");                       // el inicio leyendo «como hoy»
    expect(s2.estado("finanzas").conflictoPendiente).toBe(false); // ← el conflicto desapareció
    const r = await s2.saveConfirmed("finanzas", con(7777), {});  // el auto-save de Finanzas
    expect(r.ok).toBe(true);
    expect(srv.leer("finanzas").params_emp.saldo).toBe(7777);     // ← se perdió el 1000 de la otra sesión
  });

  test("lector propuesto: estado de guardado idéntico, conflicto intacto y cero escrituras", async () => {
    const { srv, s2 } = await escenarioConflicto();
    const ids = ["finanzas", "finanzas_bancos", "maestro_tc"];
    const antes = huella(s2, ids);
    const escriturasAntes = srv.escrituras().length;
    const fin = await leerSoloLectura(srv.fetchImpl, "finanzas");
    const ban = await leerSoloLectura(srv.fetchImpl, "finanzas_bancos");
    const tc = await leerSoloLectura(srv.fetchImpl, "maestro_tc");
    expect(fin.valor.params_emp.saldo).toBe(1000);                 // lee lo vigente del servidor
    expect(ban.valor.saldos.Osiris[0].monto).toBe(500);
    expect(tc.existe).toBe(false);                                 // fila ausente ≠ cero: se informa
    expect(huella(s2, ids)).toBe(antes);                           // nada del contrato cambió
    expect(srv.escrituras().length).toBe(escriturasAntes);         // ninguna escritura
    const r = await s2.saveConfirmed("finanzas", con(7777), {});   // Finanzas sigue bloqueado
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe(MOTIVOS.CONFLICTO_PENDIENTE);
    expect(srv.leer("finanzas").params_emp.saldo).toBe(1000);
  });

  test("una lectura fallida se informa como error, no como cifra", async () => {
    const srv = servidorFalso({});
    srv.estado.modo = "lanza_todo";
    await expect(leerSoloLectura(srv.fetchImpl, "finanzas")).rejects.toThrow();
    const http = { fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }) };
    await expect(leerSoloLectura(http.fetchImpl, "finanzas_bancos")).rejects.toThrow(/HTTP 503/);
  });

  test("las peticiones solo van al servidor falso", async () => {
    const { srv } = await escenarioConflicto();
    await leerSoloLectura(srv.fetchImpl, "finanzas");
    expect([...new Set(srv.peticiones.map(p => p.host))]).toEqual(["falso.test"]);
  });
});
