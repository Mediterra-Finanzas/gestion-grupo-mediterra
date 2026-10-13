/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// INICIO · LECTURA DE CONSULTA (src/diseno/lecturaConsulta.js) — sin efectos sobre
// el guardado de ningún módulo.
//
// Se prueba con las instancias REALES que usan los módulos: el contrato compartido
// `persist` (Finanzas: finanzas, finanzas_bancos) y el registro de friskuHelpers
// (Rendiciones y maestro_tc vía dbLoadGeneric). El fetch global apunta a un
// PostgREST en memoria: ninguna petición sale.
//
//   CONTROL  · las cargas de los módulos (registrarCarga, dbLoadGeneric) SÍ cambian
//              ese estado: borran el conflicto pendiente / reemplazan versión y base.
//   LECTOR   · después de consultar rendiciones, nóminas, finanzas, bancos y TC, el
//              estado de guardado de todas esas filas es idéntico, el conflicto de
//              Finanzas sigue bloqueando y no salió ninguna escritura.
// ═══════════════════════════════════════════════════════════════════════════════

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


let srv;
global.fetch = (...a) => srv.fetchImpl(...a);
const { persist, MOTIVOS } = require("../persistencia/instancia.js");
const { dbLoadGeneric, _estadoPersistencia } = require("../friskuHelpers");
const { crearLectorConsulta, lectorConsulta } = require("../diseno/lecturaConsulta.js");

const BLOB = { creditos_data: [{ n: 1, empresa: "Osiris", monto: 1000 }], params_emp: { saldo: 0 } };
const con = (n) => ({ ...BLOB, params_emp: { saldo: n } });
const NOM = (id, empresa, estado) => ({ id, empresa, estado, semana: 40, items: [] });
const FILAS_NOM = [{ empresa: "Osiris", fila: "nominas_osiris" }, { empresa: "Mediterra", fila: "nominas_mediterra" }];
const IDS = ["finanzas", "finanzas_bancos", "maestro_tc", "rendiciones", "nominas_osiris", "nominas_mediterra"];

function filasIniciales() {
  return {
    finanzas: { value: JSON.stringify(BLOB), updated_at: "v0" },
    finanzas_bancos: { value: JSON.stringify({ saldos: { Osiris: [{ monto: 500, moneda: "USD" }] } }), updated_at: "b0" },
    maestro_tc: { value: JSON.stringify({ "USD-CLP": [{ fecha: "2026-10-01", valor: 950, fuente: "manual" }] }), updated_at: "t0" },
    rendiciones: { value: JSON.stringify([{ id: "r1", estado: "enviada" }]), updated_at: "r0" },
    nominas_v2_done: { value: JSON.stringify({ migrado: true }), updated_at: "n0" },
    nominas_osiris: { value: JSON.stringify({ nominas: [NOM("A", "Osiris", "aprobada1")] }), updated_at: "o0" },
    nominas_mediterra: { value: JSON.stringify({ nominas: [NOM("B", "Mediterra", "revision")] }), updated_at: "m0" },
  };
}
// Finanzas en conflicto pendiente (otra sesión guardó primero) y Rendiciones ya
// cargada por su módulo, como en la app real antes de volver al inicio.
async function escenario() {
  srv = servidorFalso(filasIniciales());
  persist.reset && persist.reset();
  await persist.load("finanzas"); await persist.load("finanzas_bancos");
  await dbLoadGeneric("rendiciones"); await dbLoadGeneric("maestro_tc");
  srv.filas.finanzas = { value: JSON.stringify(con(1000)), updated_at: "v1" };   // la otra sesión
  const r = await persist.saveConfirmed("finanzas", con(7777), {});
  expect(r.motivo).toBe(MOTIVOS.CONFLICTO);
  expect(persist.conflictoPendiente("finanzas")).toBeTruthy();
}
const huella = () => JSON.stringify(IDS.map(id => {
  const e = persist.estado(id) || {};
  return [id, e.version, e.base, e.dirty, e.sucio, e.conflictoPendiente, e.cargaOk, _estadoPersistencia(id)];
}));

describe("inicio: el lector de consulta no toca el guardado de ningún módulo", () => {
  test("CONTROL: cargar como los módulos borra el conflicto de Finanzas y cambia el registro de Rendiciones", async () => {
    await escenario();
    const antesRend = JSON.stringify(_estadoPersistencia("rendiciones"));
    srv.filas.rendiciones = { value: JSON.stringify([]), updated_at: "r1" };
    await dbLoadGeneric("rendiciones");
    expect(JSON.stringify(_estadoPersistencia("rendiciones"))).not.toBe(antesRend);
    const r = await srv.fetchImpl("https://x/rest/v1/calendario_data?id=eq.finanzas&select=value,updated_at");
    const d = await r.json();
    persist.registrarCarga("finanzas", JSON.parse(d[0].value), d[0].updated_at, true);   // lo que hace dbLoad
    expect(persist.conflictoPendiente("finanzas")).toBeFalsy();                            // ← se perdió el bloqueo
  });

  test("consultar todo lo del inicio deja idéntico el estado de guardado y el conflicto sigue bloqueando", async () => {
    await escenario();
    const antes = huella();
    const escr = srv.escrituras().length;
    const lect = crearLectorConsulta({ fetchImpl: (...a) => srv.fetchImpl(...a), url: "https://falso.test" });
    const rend = await lect.rendiciones();
    const nom = await lect.nominas(FILAS_NOM);
    const fin = await lect.fila("finanzas"); const ban = await lect.fila("finanzas_bancos"); const tc = await lect.fila("maestro_tc");
    expect(rend).toEqual([{ id: "r1", estado: "enviada" }]);
    expect(nom.nominas.map(n => n.id).sort()).toEqual(["A", "B"]);
    expect(nom.filas.nominas_osiris.estado).toBe("ok");
    expect(fin.valor.params_emp.saldo).toBe(1000);
    expect(ban.valor.saldos.Osiris[0].monto).toBe(500);
    expect(tc.valor["USD-CLP"][0].valor).toBe(950);
    expect(huella()).toBe(antes);                                    // nada del contrato ni del registro cambió
    expect(srv.escrituras().length).toBe(escr);                      // ninguna escritura
    expect(srv.peticiones.slice(-8).every(p => p.metodo === "GET")).toBe(true);
    const r = await persist.saveConfirmed("finanzas", con(7777), {});   // Finanzas sigue bloqueado
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe(MOTIVOS.CONFLICTO_PENDIENTE);
    expect(srv.leer("finanzas").params_emp.saldo).toBe(1000);
  });

  test("la instancia por defecto usa el fetch global y tampoco registra nada", async () => {
    await escenario();
    const antes = huella();
    await lectorConsulta.rendiciones();
    await lectorConsulta.nominas(FILAS_NOM);
    expect(huella()).toBe(antes);
  });

  test("errores: HTTP o red lanzan; una fila de nóminas que falla queda en «error» y las demás se leen", async () => {
    srv = servidorFalso(filasIniciales());
    const http = crearLectorConsulta({ fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }) });
    await expect(http.rendiciones()).rejects.toThrow(/HTTP 503/);
    srv.estado.modo = "lanza_todo";
    await expect(lectorConsulta.fila("finanzas")).rejects.toThrow();
    srv.estado.modo = null;
    srv.filas.nominas_mediterra = { value: JSON.stringify({ otra: 1 }), updated_at: "m1" };
    const nom = await lectorConsulta.nominas(FILAS_NOM);
    expect(nom.filas.nominas_mediterra.estado).toBe("error");
    expect(nom.nominas.map(n => n.id)).toEqual(["A"]);
  });

  test("sin migración v2 lee la fila heredada y filtra por empresa", async () => {
    const f = filasIniciales(); delete f.nominas_v2_done;
    f.nominas = { value: JSON.stringify({ nominas: [NOM("X", "Osiris", "revision"), NOM("Y", "Frisku Foods", "revision")] }), updated_at: "l0" };
    srv = servidorFalso(f);
    const nom = await lectorConsulta.nominas(FILAS_NOM, ["Osiris"]);
    expect(nom).toEqual({ nominas: [NOM("X", "Osiris", "revision")], filas: {}, legado: true });
  });
});
