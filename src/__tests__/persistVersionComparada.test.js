/* eslint-disable */
// «Guardar mi borrador» vuelve a comprobar la versión del servidor: si otra sesión
// escribió DESPUÉS de que la persona abrió la comparación, no se escribe encima.
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

const sesion = (srv) => crearPersistencia({ fetch: srv.fetchImpl, supaUrl: URL_FALSA, supaKey: "k", logger: silencio });
const BLOB = { params_emp: { saldo: 0 } };
const con = (n) => ({ params_emp: { saldo: n } });

async function aEnConflicto() {
  const srv = servidorFalso({ finanzas: { value: JSON.stringify(BLOB), updated_at: "v0" } });
  const A = sesion(srv), B = sesion(srv), C = sesion(srv);
  await A.load("finanzas"); await B.load("finanzas");
  expect((await B.saveConfirmed("finanzas", con(1000), {})).ok).toBe(true);        // B guarda
  const r = await A.saveConfirmed("finanzas", con(7777), {});                     // A choca
  expect(r.conflictoPendiente).toBe(true);
  return { srv, A, C, vistaPorA: r.version, valorVisto: r.valorServidor };      // lo que A compara
}

test("otra sesión escribe después de la comparación: no se pisa y el conflicto sigue, contra la versión nueva", async () => {
  const { srv, A, C, vistaPorA, valorVisto } = await aEnConflicto();
  expect(valorVisto).toEqual(con(1000));
  await C.load("finanzas");
  expect((await C.saveConfirmed("finanzas", con(2222), {})).ok).toBe(true);       // C guarda DESPUÉS
  const r = await A.reconciliarConservandoLocal("finanzas", con(7777), { versionEsperada: vistaPorA });
  expect(r.ok).toBe(false);
  expect(r.cambioDesdeComparacion).toBe(true);
  expect(r.valorServidor).toEqual(con(2222));                                     // lo nuevo se devuelve para comparar
  expect(srv.leer("finanzas")).toEqual(con(2222));                                // nada se pisó
  expect(A.estado("finanzas").conflictoPendiente).toBe(true);                     // sigue bloqueada
  expect((await A.saveConfirmed("finanzas", con(7777), {})).motivo).toBe(MOTIVOS.CONFLICTO_PENDIENTE);
  expect(srv.leer("finanzas")).toEqual(con(2222));
  // Con la comparación nueva (versión de C) la decisión sí se aplica
  const r2 = await A.reconciliarConservandoLocal("finanzas", con(7777), { versionEsperada: r.version });
  expect(r2.ok).toBe(true);
  expect(srv.leer("finanzas")).toEqual(con(7777));
});

test("sin escrituras nuevas desde la comparación: guardar el borrador escribe una vez", async () => {
  const { srv, A, vistaPorA } = await aEnConflicto();
  const antes = srv.escrituras().length;
  const r = await A.reconciliarConservandoLocal("finanzas", con(7777), { versionEsperada: vistaPorA });
  expect(r.ok).toBe(true);
  expect(srv.leer("finanzas")).toEqual(con(7777));
  expect(srv.escrituras().length).toBe(antes + 1);
});

test("versión vista desconocida: nunca se escribe a ciegas", async () => {
  const { srv, A } = await aEnConflicto();
  const r = await A.reconciliarConservandoLocal("finanzas", con(7777), { versionEsperada: "__desconocida__" });
  expect(r.ok).toBe(false);
  expect(r.cambioDesdeComparacion).toBe(true);
  expect(srv.leer("finanzas")).toEqual(con(1000));
});

test("compatibilidad: sin versionEsperada, reconciliar se comporta como antes", async () => {
  const { srv, A } = await aEnConflicto();
  const r = await A.reconciliarConservandoLocal("finanzas");
  expect(r).toMatchObject({ ok: true, desbloqueado: true });
  expect(srv.leer("finanzas")).toEqual(con(1000));
});
