/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// FILA `main` (Seguimiento Tareas, App.jsx) — las DOS salidas del conflicto.
//
// Lo que se fija acá: cuando otra sesión modifica `main`, la fila queda BLOQUEADA
// (conflicto pendiente), ningún auto-save la desbloquea solo, los cambios locales
// siguen en memoria, y la persona tiene DOS salidas explícitas:
//   (a) recuperar la versión del servidor  → se descarta lo local
//   (b) conservar la mía                   → se reemplaza lo del servidor
// Y si una salida falla (red o HTTP), el conflicto NO se limpia.
//
// Todo contra un PostgREST en memoria con `fetch` INYECTADO: ninguna petición sale
// del proceso. Al final se verifica que el único host visto fue el falso.
//
// FIDELIDAD: `aplicarCamposMain` y `guardarAhora` viven dentro del componente
// App.jsx y no se pueden importar; acá se usa un ESPEJO de ese cableado (los
// mismos campos de la fila `main`, el mismo payload de guardado y la misma
// semántica reemplazar/fusionar de App.jsx:2142 y App.jsx:2906). Lo que se ejerce
// de verdad es el contrato + el glue compartido (src/persistencia/conflictoFila.js),
// que es el código nuevo. El panel se prueba aparte en conflictoPanelPantalla.
// ═══════════════════════════════════════════════════════════════════════════════
import { crearPersistencia, MOTIVOS } from "../persistencia/persistContract.js";
import { crearResolucionConflicto, esConflictoPendiente } from "../persistencia/conflictoFila.js";

const URL_FALSA = "https://falso.test";
const silencio = { info() {}, warn() {}, error() {} };

// ── PostgREST en memoria (versiones v1, v2… las asigna el "servidor") ──────────
function servidorFalso(filasIniciales = {}) {
  const filas = {};
  for (const id of Object.keys(filasIniciales)) filas[id] = { ...filasIniciales[id] };
  const peticiones = [];
  let seq = 1;
  const estado = { modo: null, status: 500 };

  const resp = (body, status = 200) => ({
    ok: status >= 200 && status < 300, status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });

  const fetchImpl = async (url, opts = {}) => {
    const metodo = (opts.method || "GET").toUpperCase();
    const u = new URL(String(url));
    const id = decodeURIComponent((/id=eq\.([^&]+)/.exec(u.search) || [])[1] || "");
    peticiones.push({ metodo, host: u.host, id });

    if (estado.modo === "lanza_todo") throw new TypeError("Failed to fetch");
    if (estado.modo === "lanza_escritura" && metodo !== "GET") throw new TypeError("Failed to fetch");
    if (estado.modo === "http_get" && metodo === "GET") return resp({ message: "denegado" }, estado.status);
    if (estado.modo === "http_escritura" && metodo !== "GET") return resp({ message: "denegado" }, estado.status);

    if (metodo === "GET") {
      const f = filas[id];
      return resp(f ? [{ value: f.value, updated_at: f.updated_at }] : []);
    }
    const body = JSON.parse(opts.body || "{}");
    if (metodo === "PATCH") {
      const ver = decodeURIComponent((/updated_at=eq\.([^&]+)/.exec(u.search) || [])[1] || "");
      if (!filas[id] || filas[id].updated_at !== ver) return resp([]); // 0 filas = conflicto
      filas[id] = { value: body.value, updated_at: `v${seq++}` };
      return resp([{ id, value: filas[id].value, updated_at: filas[id].updated_at }]);
    }
    if (metodo === "POST") {
      filas[body.id] = { value: body.value, updated_at: `v${seq++}` };
      return resp([{ id: body.id, value: filas[body.id].value, updated_at: filas[body.id].updated_at }], 201);
    }
    throw new Error("método no soportado: " + metodo);
  };

  const cuenta = (m) => peticiones.filter((p) => p.metodo === m).length;
  const escrituras = () => peticiones.filter((p) => p.metodo !== "GET").length;
  const leer = (id) => {
    const v = filas[id] && filas[id].value;
    return v === undefined ? undefined : (typeof v === "string" ? JSON.parse(v) : v);
  };
  const hosts = () => [...new Set(peticiones.map((p) => p.host))];
  return { filas, fetchImpl, peticiones, cuenta, escrituras, leer, hosts, estado };
}

const sesion = (srv) => crearPersistencia({ fetch: srv.fetchImpl, supaUrl: URL_FALSA, supaKey: "k-falsa", logger: silencio });

// ── Espejo de la pantalla de Tareas (campos de la fila `main`) ────────────────
// `aplicar` replica App.jsx:2142 `aplicarCamposMain(d, o)`:
//   o.reemplazar → el valor del servidor REEMPLAZA lo local (salida (a));
//   por defecto  → se fusiona (sync entrante de siempre).
function pantallaMain(inicial) {
  const p = {
    estados: {}, comentarios: {}, tareasConfig: {}, supervisores: {},
    tareasExtra: [], tareasOverrides: {}, recsDone: {}, recsComentarios: {},
    ...(inicial || {}),
  };
  const aplicar = (d, o) => {
    if (!d) return;
    if (o && o.reemplazar) {
      p.estados = d.estados || {};
      p.comentarios = d.comentarios || {};
      p.tareasConfig = d.tareasConfig || {};
      p.supervisores = d.supervisores || {};
      p.tareasExtra = d.tareasExtra || [];
      p.tareasOverrides = d.tareasOverrides || {};
      p.recsDone = d.recsDone || {};
      p.recsComentarios = d.recsComentarios || {};
      return;
    }
    if (d.estados) p.estados = { ...p.estados, ...d.estados };
    if (d.comentarios) p.comentarios = d.comentarios;
    if (d.tareasConfig) p.tareasConfig = { ...p.tareasConfig, ...d.tareasConfig };
    if (d.supervisores) p.supervisores = { ...p.supervisores, ...d.supervisores };
    if (d.tareasExtra) p.tareasExtra = d.tareasExtra;
    if (d.recsDone) p.recsDone = d.recsDone;
    if (d.recsComentarios) p.recsComentarios = d.recsComentarios;
  };
  // Payload de `guardarAhora` (App.jsx:2906): la foto COMPLETA del estado vivo.
  const payload = () => JSON.parse(JSON.stringify({
    estados: p.estados, comentarios: p.comentarios, tareasConfig: p.tareasConfig,
    supervisores: p.supervisores, tareasExtra: p.tareasExtra,
    tareasOverrides: p.tareasOverrides, recsDone: p.recsDone,
    recsComentarios: p.recsComentarios,
  }));
  return { p, aplicar, payload };
}

// Monta el cableado real: contrato + glue + espejo de pantalla.
function montar(srv, inicial) {
  const persist = sesion(srv);
  const pant = pantallaMain(inicial);
  const ui = { conflicto: null, estado: "idle", aviso: null, estados: [] };
  const guardar = () => persist.saveConfirmed("main", pant.payload(), {});
  const res = crearResolucionConflicto({
    persist, rowId: "main", etiqueta: "las Tareas",
    aplicarValor: (v) => pant.aplicar(v, { reemplazar: true }),
    guardarLocal: guardar,
    setConflicto: (info) => { ui.conflicto = info; },
    setEstado: (e) => { ui.estado = e; ui.estados.push(e); },
    setAviso: (a) => { ui.aviso = a; },
  });
  // Lo que hace el .then del auto-save de Tareas (App.jsx trasGuardarMain).
  const autoSave = async () => {
    ui.estado = "guardando";
    const r = await guardar();
    if (r && r.ok === false) { if (!res.detectar(r)) { ui.estado = "error"; } }
    else ui.estado = "ok";
    return r;
  };
  return { persist, pant, ui, res, autoSave, guardar };
}

const FILA_V0 = { estados: { t1: "gris" }, comentarios: {}, tareasConfig: {}, supervisores: {}, tareasExtra: [], tareasOverrides: {}, recsDone: {}, recsComentarios: {} };
const servidorConMain = () => servidorFalso({ main: { value: JSON.stringify(FILA_V0), updated_at: "v0" } });

// Cada sesión registra la carga como lo hace App.jsx:dbLoad (4 argumentos: SIN
// `valorServidor`, así el guardia de "sin cambios" queda apagado para `main`).
async function cargarComoApp(m) {
  const fila = await m.persist._leerFila("main");
  m.persist.registrarCarga("main", fila.valor, fila.updatedAt, true);
  m.pant.aplicar(fila.valor);
  return fila;
}

describe("fila `main`: el conflicto queda pendiente y no se escribe nada", () => {
  test("la sesión 2 recibe conflicto, reintenta y NO escribe; lo local sigue en memoria", async () => {
    const srv = servidorConMain();
    const s1 = montar(srv), s2 = montar(srv);
    await cargarComoApp(s1);
    await cargarComoApp(s2);

    // La sesión 2 tiene una edición local sin confirmar.
    s2.pant.p.estados = { t1: "verde", t9: "local-2" };
    s2.pant.p.comentarios = { t9: "lo mío" };

    // La sesión 1 guarda primero: el servidor avanza.
    const r1 = await s1.autoSave();
    expect(r1.ok).toBe(true);
    const escriturasTrasS1 = srv.escrituras();
    expect(escriturasTrasS1).toBe(1);

    // La sesión 2 guarda: CONFLICTO. El servidor conserva lo de la sesión 1.
    const r2 = await s2.autoSave();
    expect(r2.ok).toBe(false);
    expect(esConflictoPendiente(r2)).toBe(true);
    expect(s2.persist.conflictoPendiente("main")).toBeTruthy();
    expect(s2.ui.conflicto).toMatchObject({ rowId: "main", etiqueta: "las Tareas" });
    expect(s2.ui.estado).toBe("conflicto");
    expect(s2.ui.aviso.texto).toContain("Tus cambios siguen en pantalla");
    expect(srv.leer("main").estados).toEqual({ t1: "gris" }); // ← lo de la sesión 1

    // Reintentos del auto-save: NO escriben (0 PATCH nuevos) y no resuelven nada.
    // Hasta acá hubo 2 PATCH: el de la sesión 1 (confirmado) y el de la sesión 2
    // (condicionado a la versión vieja → 0 filas → conflicto, no escribió nada).
    const patchAntes = srv.cuenta("PATCH");
    expect(patchAntes).toBe(2);
    expect(escriturasTrasS1).toBe(1);
    const r3 = await s2.autoSave();
    const r4 = await s2.autoSave();
    expect(r3.motivo).toBe(MOTIVOS.CONFLICTO_PENDIENTE);
    expect(r4.motivo).toBe(MOTIVOS.CONFLICTO_PENDIENTE);
    expect(srv.cuenta("PATCH")).toBe(patchAntes);          // esperado 0 PATCH nuevos
    expect(srv.escrituras()).toBe(2);                      // ni un intento más
    expect(s2.persist.conflictoPendiente("main")).toBeTruthy();

    // Los cambios locales de la sesión 2 siguen intactos en memoria.
    expect(s2.pant.p.estados).toEqual({ t1: "verde", t9: "local-2" });
    expect(s2.pant.p.comentarios).toEqual({ t9: "lo mío" });
    expect(srv.hosts()).toEqual(["falso.test"]);
  });

  test("el camino realtime/poll (reconcileIncoming) también ofrece las dos salidas", async () => {
    const srv = servidorConMain();
    const s = montar(srv);
    await cargarComoApp(s);
    s.pant.p.estados = { t1: "verde" };
    s.persist.marcarSucio("main"); // hay edición local sin confirmar

    const ajeno = { ...FILA_V0, estados: { t1: "rojo" } };
    const dec = s.persist.reconcileIncoming("main", ajeno, "v7");
    expect(dec.apply).toBe(false);
    expect(dec.conflictoPendiente).toBe(true);
    expect(s.res.detectar(dec)).toBe(true);
    expect(s.ui.conflicto.rowId).toBe("main");
    expect(s.ui.estado).toBe("conflicto");
    // Lo entrante NO se aplicó encima de lo local.
    expect(s.pant.p.estados).toEqual({ t1: "verde" });
    expect(srv.escrituras()).toBe(0);
  });
});

describe("salida (a) · recuperar la versión del servidor", () => {
  test("la pantalla queda con lo del servidor y el guardado vuelve a funcionar", async () => {
    const srv = servidorConMain();
    const s1 = montar(srv), s2 = montar(srv);
    await cargarComoApp(s1);
    await cargarComoApp(s2);
    s1.pant.p.estados = { t1: "gris", t5: "de-la-1" };
    s1.pant.p.comentarios = { t5: "nota de la 1" };
    await s1.autoSave();

    s2.pant.p.estados = { t1: "verde", t9: "local-2" };
    s2.pant.p.tareasOverrides = { t9: { frecuencia: "Diaria" } };
    await s2.autoSave();
    expect(s2.ui.conflicto).toBeTruthy();

    // Salida (a): se descarta lo local.
    const r = await s2.res.recuperarDelServidor();
    expect(r.ok).toBe(true);
    expect(r.descartaLocal).toBe(true);
    expect(s2.ui.conflicto).toBeNull();
    expect(s2.ui.aviso).toBeNull();
    expect(s2.ui.estado).toBe("ok");
    expect(s2.persist.conflictoPendiente("main")).toBeNull();
    // La pantalla ES la del servidor (calculado aparte: lo que guardó la sesión 1).
    expect(s2.pant.p.estados).toEqual({ t1: "gris", t5: "de-la-1" });
    expect(s2.pant.p.comentarios).toEqual({ t5: "nota de la 1" });
    expect(s2.pant.p.tareasOverrides).toEqual({});   // lo local se descartó de verdad

    // Y el guardado vuelve a funcionar: una edición nueva SÍ se confirma.
    s2.pant.p.estados = { t1: "gris", t5: "de-la-1", t7: "post-recuperacion" };
    const r2 = await s2.autoSave();
    expect(r2.ok).toBe(true);
    expect(srv.leer("main").estados.t7).toBe("post-recuperacion");
    expect(srv.leer("main").estados.t5).toBe("de-la-1");
  });

  test("si la recuperación falla (la red se cae), el conflicto NO se limpia y no se escribe", async () => {
    const srv = servidorConMain();
    const s1 = montar(srv), s2 = montar(srv);
    await cargarComoApp(s1);
    await cargarComoApp(s2);
    await s1.autoSave();
    s2.pant.p.estados = { t1: "verde" };
    await s2.autoSave();
    const escrituras = srv.escrituras();

    srv.estado.modo = "lanza_todo";
    const r = await s2.res.recuperarDelServidor();
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe(MOTIVOS.RED);
    expect(s2.persist.conflictoPendiente("main")).toBeTruthy();
    expect(s2.ui.conflicto).toBeTruthy();   // el panel sigue puesto
    expect(s2.ui.estado).toBe("error");
    srv.estado.modo = null;

    // Sigue bloqueada: un auto-save no escribe.
    const r2 = await s2.autoSave();
    expect(r2.motivo).toBe(MOTIVOS.CONFLICTO_PENDIENTE);
    expect(srv.escrituras()).toBe(escrituras);
    expect(s2.pant.p.estados).toEqual({ t1: "verde" }); // lo local intacto
  });

  test("si la recuperación responde HTTP 500, el conflicto NO se limpia y no se escribe", async () => {
    const srv = servidorConMain();
    const s1 = montar(srv), s2 = montar(srv);
    await cargarComoApp(s1);
    await cargarComoApp(s2);
    await s1.autoSave();
    s2.pant.p.comentarios = { t3: "lo mío" };
    await s2.autoSave();
    const escrituras = srv.escrituras();

    srv.estado.modo = "http_get"; srv.estado.status = 500;
    const r = await s2.res.recuperarDelServidor();
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe(MOTIVOS.HTTP);
    expect(s2.persist.conflictoPendiente("main")).toBeTruthy();
    expect(s2.ui.conflicto).toBeTruthy();
    srv.estado.modo = null;
    expect(srv.escrituras()).toBe(escrituras);
    expect(s2.pant.p.comentarios).toEqual({ t3: "lo mío" });

    // Y después, con el servidor sano, la salida (a) sí funciona.
    const r2 = await s2.res.recuperarDelServidor();
    expect(r2.ok).toBe(true);
    expect(s2.persist.conflictoPendiente("main")).toBeNull();
  });
});

describe("salida (b) · conservar mi versión", () => {
  test("escribe lo local sobre la versión vigente y el servidor queda con lo local", async () => {
    const srv = servidorConMain();
    const s1 = montar(srv), s2 = montar(srv);
    await cargarComoApp(s1);
    await cargarComoApp(s2);
    s1.pant.p.estados = { t1: "de-la-1" };
    await s1.autoSave();
    const versionS1 = srv.filas.main.updated_at;

    const localS2 = { t1: "verde", t9: "local-2" };
    s2.pant.p.estados = { ...localS2 };
    s2.pant.p.comentarios = { t9: "lo mío" };
    await s2.autoSave();
    expect(s2.ui.conflicto).toBeTruthy();

    const r = await s2.res.conservarLocal();
    expect(r.ok).toBe(true);
    expect(s2.ui.conflicto).toBeNull();
    expect(s2.ui.estado).toBe("ok");
    expect(s2.persist.conflictoPendiente("main")).toBeNull();
    // El servidor quedó con lo LOCAL, confirmado y en una versión nueva.
    expect(srv.leer("main").estados).toEqual(localS2);
    expect(srv.leer("main").comentarios).toEqual({ t9: "lo mío" });
    expect(srv.filas.main.updated_at).not.toBe(versionS1);
    expect(s2.persist.isDirty("main")).toBe(false);

    // Y sigue guardando normal después.
    s2.pant.p.estados = { ...localS2, t4: "despues" };
    const r2 = await s2.autoSave();
    expect(r2.ok).toBe(true);
    expect(srv.leer("main").estados.t4).toBe("despues");
  });

  test("si el servidor se movió otra vez en el medio, vuelve a quedar en conflicto (no pisa)", async () => {
    const srv = servidorConMain();
    const s1 = montar(srv), s2 = montar(srv);
    await cargarComoApp(s1);
    await cargarComoApp(s2);
    s1.pant.p.estados = { t1: "primera" };
    await s1.autoSave();
    s2.pant.p.estados = { t1: "local" };
    await s2.autoSave();                       // conflicto pendiente

    // Se desbloquea contra la versión vigente...
    const d = await s2.persist.reconciliarConservandoLocal("main");
    expect(d.ok).toBe(true);
    expect(d.desbloqueado).toBe(true);
    // ...y ANTES de que la sesión 2 escriba, la sesión 1 guarda otra vez.
    s1.pant.p.estados = { t1: "segunda" };
    await s1.autoSave();

    // El PATCH condicionado a la versión vieja no pasa: no se pisa nada y la fila
    // vuelve a quedar bloqueada esperando otra decisión.
    const r = await s2.autoSave();
    expect(r.ok).toBe(false);
    expect(esConflictoPendiente(r)).toBe(true);
    expect(s2.ui.conflicto).toBeTruthy();
    expect(s2.ui.estado).toBe("conflicto");
    expect(srv.leer("main").estados).toEqual({ t1: "segunda" }); // lo de la sesión 1
    expect(s2.pant.p.estados).toEqual({ t1: "local" });          // lo local intacto
  });

  test("si la relectura de la salida (b) falla, no se desbloquea ni se escribe", async () => {
    const srv = servidorConMain();
    const s1 = montar(srv), s2 = montar(srv);
    await cargarComoApp(s1);
    await cargarComoApp(s2);
    await s1.autoSave();
    s2.pant.p.estados = { t1: "local" };
    await s2.autoSave();
    const escrituras = srv.escrituras();

    srv.estado.modo = "lanza_todo";
    const r = await s2.res.conservarLocal();
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe(MOTIVOS.RED);
    expect(s2.persist.conflictoPendiente("main")).toBeTruthy();
    expect(s2.ui.conflicto).toBeTruthy();
    srv.estado.modo = null;
    expect(srv.escrituras()).toBe(escrituras);
    expect(s2.pant.p.estados).toEqual({ t1: "local" });
  });
});
