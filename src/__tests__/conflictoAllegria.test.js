/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// FILA `allegria` (AllegriaModule.jsx) — la misma batería que `main`.
//
// La fila `allegria` es un blob (objeto con arreglos dentro) que se guarda como
// VALOR, así que ante un conflicto queda BLOQUEADA igual que `main`. Hasta
// oct-2026 el módulo mostraba el aviso y no había cómo salir sin recargar.
//
// `fetch` INYECTADO: ninguna petición sale del proceso.
//
// FIDELIDAD: el aplicador real (`aplicarDatosAllegria`, AllegriaModule.jsx) es
// `setData(d)` + el reseteo de los contadores anti-pérdida; el guardado real es
// `dbSaveAllegria` = guardia anti-pérdida + `persist.saveConfirmed("allegria",
// valor)`. Acá se reproducen los dos (incluido el guardia de los 3 arreglos
// caídos) porque viven dentro del módulo y no se exportan. Lo que se ejerce de
// verdad es el contrato + el glue compartido.
// ═══════════════════════════════════════════════════════════════════════════════
import { crearPersistencia, MOTIVOS } from "../persistencia/persistContract.js";
import { crearResolucionConflicto, esConflictoPendiente } from "../persistencia/conflictoFila.js";

const URL_FALSA = "https://falso.test";
const silencio = { info() {}, warn() {}, error() {} };

function servidorFalso(filasIniciales = {}) {
  const filas = {};
  for (const id of Object.keys(filasIniciales)) filas[id] = { ...filasIniciales[id] };
  const peticiones = [];
  let seq = 1;
  const estado = { modo: null, status: 500 };
  const resp = (body, status = 200) => ({
    ok: status >= 200 && status < 300, status,
    json: async () => body, text: async () => JSON.stringify(body),
  });
  const fetchImpl = async (url, opts = {}) => {
    const metodo = (opts.method || "GET").toUpperCase();
    const u = new URL(String(url));
    const id = decodeURIComponent((/id=eq\.([^&]+)/.exec(u.search) || [])[1] || "");
    peticiones.push({ metodo, host: u.host, id });
    if (estado.modo === "lanza_todo") throw new TypeError("Failed to fetch");
    if (estado.modo === "http_get" && metodo === "GET") return resp({ message: "denegado" }, estado.status);
    if (metodo === "GET") {
      const f = filas[id];
      return resp(f ? [{ value: f.value, updated_at: f.updated_at }] : []);
    }
    const body = JSON.parse(opts.body || "{}");
    if (metodo === "PATCH") {
      const ver = decodeURIComponent((/updated_at=eq\.([^&]+)/.exec(u.search) || [])[1] || "");
      if (!filas[id] || filas[id].updated_at !== ver) return resp([]);
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

// Claves que vigila el guardia anti-pérdida de dbSaveAllegria.
const CLAVES = ["clientes", "productores", "embarques", "liquidaciones", "liqCliente", "anticipos",
  "cobranza", "recepciones", "stockPT", "materiales", "recetas", "programaComercial"];

function montar(srv) {
  const persist = crearPersistencia({ fetch: srv.fetchImpl, supaUrl: URL_FALSA, supaKey: "k", logger: silencio });
  const pant = { data: { clientes: [], productores: [], embarques: [] }, contadores: {} };
  // Espejo de `aplicarDatosAllegria` (AllegriaModule.jsx).
  const aplicar = (d) => {
    if (!d) return;
    pant.data = d;
    pant.contadores = {};
    CLAVES.forEach((k) => { if (Array.isArray(d[k])) pant.contadores[k] = d[k].length; });
  };
  // Espejo de `dbSaveAllegria`: guardia anti-pérdida + saveConfirmed por VALOR.
  const guardar = () => {
    const value = pant.data;
    let caidas = 0;
    CLAVES.forEach((k) => {
      const nc = Array.isArray(value[k]) ? value[k].length : -1;
      const pc = pant.contadores[k] || 0;
      if (nc >= 0 && pc > 0 && nc < pc) caidas++;
    });
    if (caidas >= 3) return Promise.resolve({ ok: false, motivo: "anti_perdida" });
    CLAVES.forEach((k) => { if (Array.isArray(value[k])) pant.contadores[k] = value[k].length; });
    return persist.saveConfirmed("allegria", JSON.parse(JSON.stringify(value)), {});
  };
  const ui = { conflicto: null, estado: "idle", aviso: null };
  const res = crearResolucionConflicto({
    persist, rowId: "allegria", etiqueta: "Allegria Foods",
    aplicarValor: aplicar, guardarLocal: guardar,
    setConflicto: (info) => { ui.conflicto = info; },
    setEstado: (e) => { ui.estado = e; },
    setAviso: (a) => { ui.aviso = a; },
  });
  const autoSave = async () => {
    ui.estado = "guardando";
    const r = await guardar();
    if (r && r.ok === false) { if (!res.detectar(r)) ui.estado = "error"; }
    else ui.estado = "ok";
    return r;
  };
  return { persist, pant, ui, res, autoSave, aplicar };
}

const FILA_V0 = { clientes: [{ id: "c1", nombre: "Disney" }], productores: [], embarques: [] };
const servidorConAllegria = () => servidorFalso({ allegria: { value: JSON.stringify(FILA_V0), updated_at: "v0" } });

// Como lo hace dbLoadAllegria (4 argumentos: sin `valorServidor`).
async function cargarComoModulo(m) {
  const fila = await m.persist._leerFila("allegria");
  m.persist.registrarCarga("allegria", fila.valor, fila.updatedAt, true);
  m.aplicar(fila.valor);
  return fila;
}

describe("fila `allegria`: conflicto pendiente", () => {
  test("la sesión 2 recibe conflicto, reintenta y NO escribe; lo local sigue en memoria", async () => {
    const srv = servidorConAllegria();
    const s1 = montar(srv), s2 = montar(srv);
    await cargarComoModulo(s1);
    await cargarComoModulo(s2);

    s1.pant.data = { ...FILA_V0, clientes: [...FILA_V0.clientes, { id: "c2", nombre: "de la 1" }] };
    const r1 = await s1.autoSave();
    expect(r1.ok).toBe(true);

    s2.pant.data = { ...FILA_V0, clientes: [...FILA_V0.clientes, { id: "c9", nombre: "local 2" }] };
    const r2 = await s2.autoSave();
    expect(r2.ok).toBe(false);
    expect(esConflictoPendiente(r2)).toBe(true);
    expect(s2.ui.conflicto).toMatchObject({ rowId: "allegria", etiqueta: "Allegria Foods" });
    expect(s2.ui.estado).toBe("conflicto");
    expect(s2.ui.aviso.texto).toContain("Allegria Foods");
    expect(s2.ui.aviso.texto).toContain("Tus cambios siguen en pantalla");

    // El servidor conserva lo de la sesión 1 (2 clientes: c1 + c2).
    expect(srv.leer("allegria").clientes.map((c) => c.id)).toEqual(["c1", "c2"]);

    const patchAntes = srv.cuenta("PATCH");
    expect(patchAntes).toBe(2);               // 1 confirmado + 1 rechazado
    const r3 = await s2.autoSave();
    const r4 = await s2.autoSave();
    expect(r3.motivo).toBe(MOTIVOS.CONFLICTO_PENDIENTE);
    expect(r4.motivo).toBe(MOTIVOS.CONFLICTO_PENDIENTE);
    expect(srv.cuenta("PATCH")).toBe(patchAntes);   // 0 PATCH nuevos
    expect(srv.escrituras()).toBe(2);
    expect(s2.pant.data.clientes.map((c) => c.id)).toEqual(["c1", "c9"]); // lo local intacto
    expect(srv.hosts()).toEqual(["falso.test"]);
  });

  test("salida (a): la pantalla queda con lo del servidor y el guardado vuelve a funcionar", async () => {
    const srv = servidorConAllegria();
    const s1 = montar(srv), s2 = montar(srv);
    await cargarComoModulo(s1);
    await cargarComoModulo(s2);
    s1.pant.data = { ...FILA_V0, clientes: [{ id: "c1", nombre: "Disney" }, { id: "c2", nombre: "de la 1" }] };
    await s1.autoSave();
    s2.pant.data = { ...FILA_V0, clientes: [{ id: "c9", nombre: "local 2" }] };
    await s2.autoSave();
    expect(s2.ui.conflicto).toBeTruthy();

    const r = await s2.res.recuperarDelServidor();
    expect(r.ok).toBe(true);
    expect(s2.ui.conflicto).toBeNull();
    expect(s2.ui.estado).toBe("ok");
    expect(s2.persist.conflictoPendiente("allegria")).toBeNull();
    expect(s2.pant.data.clientes.map((c) => c.id)).toEqual(["c1", "c2"]);
    // Los contadores anti-pérdida se rehacen con los largos del servidor.
    expect(s2.pant.contadores.clientes).toBe(2);

    s2.pant.data = { ...s2.pant.data, productores: [{ id: "p1" }] };
    const r2 = await s2.autoSave();
    expect(r2.ok).toBe(true);
    expect(srv.leer("allegria").productores).toEqual([{ id: "p1" }]);
    expect(srv.leer("allegria").clientes.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  test("salida (b): se escribe lo local sobre la versión vigente", async () => {
    const srv = servidorConAllegria();
    const s1 = montar(srv), s2 = montar(srv);
    await cargarComoModulo(s1);
    await cargarComoModulo(s2);
    s1.pant.data = { ...FILA_V0, clientes: [{ id: "c1" }, { id: "c2" }] };
    await s1.autoSave();
    const local = { clientes: [{ id: "c1" }, { id: "c9", nombre: "local 2" }], productores: [], embarques: [] };
    s2.pant.data = JSON.parse(JSON.stringify(local));
    await s2.autoSave();
    expect(s2.ui.conflicto).toBeTruthy();

    const r = await s2.res.conservarLocal();
    expect(r.ok).toBe(true);
    expect(s2.ui.conflicto).toBeNull();
    expect(s2.persist.conflictoPendiente("allegria")).toBeNull();
    expect(srv.leer("allegria")).toEqual(local);
    expect(s2.persist.isDirty("allegria")).toBe(false);
  });

  test("si la recuperación falla (red y HTTP 500), el conflicto NO se limpia y no se escribe", async () => {
    const srv = servidorConAllegria();
    const s1 = montar(srv), s2 = montar(srv);
    await cargarComoModulo(s1);
    await cargarComoModulo(s2);
    s1.pant.data = { ...FILA_V0, embarques: [{ id: "e1" }] };
    await s1.autoSave();
    s2.pant.data = { ...FILA_V0, embarques: [{ id: "local" }] };
    await s2.autoSave();
    const escrituras = srv.escrituras();

    srv.estado.modo = "lanza_todo";
    const r = await s2.res.recuperarDelServidor();
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe(MOTIVOS.RED);
    expect(s2.persist.conflictoPendiente("allegria")).toBeTruthy();
    expect(s2.ui.conflicto).toBeTruthy();

    srv.estado.modo = "http_get"; srv.estado.status = 500;
    const r2 = await s2.res.recuperarDelServidor();
    expect(r2.ok).toBe(false);
    expect(r2.motivo).toBe(MOTIVOS.HTTP);
    expect(s2.persist.conflictoPendiente("allegria")).toBeTruthy();
    srv.estado.modo = null;

    expect(srv.escrituras()).toBe(escrituras);
    expect(s2.pant.data.embarques).toEqual([{ id: "local" }]);
    // Y el servidor sigue con lo de la sesión 1.
    expect(srv.leer("allegria").embarques).toEqual([{ id: "e1" }]);
  });

  test("el guardia anti-pérdida sigue vivo y no se confunde con un conflicto", async () => {
    const srv = servidorConAllegria();
    const s = montar(srv);
    await cargarComoModulo(s);
    // El módulo arranca con contadores del servidor; se simula el crash que hace
    // caer 3 arreglos a la vez (el caso que dbSaveAllegria bloquea).
    s.pant.contadores = { clientes: 5, productores: 4, embarques: 3 };
    s.pant.data = { clientes: [], productores: [], embarques: [] };
    const r = await s.autoSave();
    expect(r).toEqual({ ok: false, motivo: "anti_perdida" });
    expect(s.ui.conflicto).toBeNull();      // no es conflicto: no se pinta el panel
    expect(s.ui.estado).toBe("error");
    expect(srv.escrituras()).toBe(0);
  });
});
