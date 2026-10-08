/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// CONFLICTO PENDIENTE — un conflicto de fila-blob NO se puede olvidar.
//
// Secuencia que se reproduce (la que pisaba el trabajo ajeno en silencio):
//   1. dos sesiones cargan `finanzas` en la MISMA versión
//   2. la sesión 1 guarda → confirma, nueva updated_at
//   3. la sesión 2 guarda su estado → CONFLICTO (fila-blob, no fusionable)
//   4. la sesión 2 VUELVE A INTENTAR el mismo estado obsoleto
// Antes, el paso 3 adelantaba `_version` a la versión del servidor y el paso 4
// pasaba el PATCH condicionado, borrando el guardado de la sesión 1.
//
// Todo contra un PostgREST en memoria (fetch inyectado). NINGUNA petición sale a
// la red: el transporte se apunta a `https://falso.test` y al final se verifica
// que el único host visto fue ése.
// ═══════════════════════════════════════════════════════════════════════════════
import { crearPersistencia, construirAvisoDesde, MOTIVOS } from "../persistencia/persistContract.js";

const URL_FALSA = "https://falso.test";
const HOSTS_REALES = ["bywovqayuzodbzwsriet.supabase.co", "supabase.co", "mindicador.cl", "api.frankfurter.app"];
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

// Blob de flujo (fila no fusionable: objeto anidado).
const BLOB_V1 = { params_emp: { "Allegria Foods": { kg: 100 } }, sub_lines: {}, added_lines: {} };
const conSaldo = (blob, n) => JSON.parse(JSON.stringify({ ...blob, params_emp: { ...blob.params_emp, saldo: n } }));

describe("secuencia de 4 pasos: el segundo intento NO escribe", () => {
  // Esta prueba NO mira el estado interno ni ninguna API nueva: solo mira el
  // ALMACÉN. Es la que falla contra el contrato anterior (el servidor terminaba con
  // 7777, el estado obsoleto de la sesión 2, y con 3 PATCH en vez de 2).
  test("REGRESIÓN: el estado obsoleto de la sesión 2 no puede pisar el guardado de la sesión 1", async () => {
    const srv = servidorFalso({ finanzas: { value: JSON.stringify(BLOB_V1), updated_at: "v0" } });
    const s1 = sesion(srv), s2 = sesion(srv);
    await s1.load("finanzas");
    await s2.load("finanzas");
    await s1.saveConfirmed("finanzas", conSaldo(BLOB_V1, 1000), {});       // paso 2
    const r2 = await s2.saveConfirmed("finanzas", conSaldo(BLOB_V1, 7777), {}); // paso 3
    expect(r2.ok).toBe(false);
    expect(srv.leer("finanzas").params_emp.saldo).toBe(1000);
    const r3 = await s2.saveConfirmed("finanzas", conSaldo(BLOB_V1, 7777), {}); // paso 4
    expect(r3.ok).toBe(false);
    expect(srv.leer("finanzas").params_emp.saldo).toBe(1000);              // ← acá se perdía
    expect(srv.cuenta("PATCH")).toBe(2);                                   // ← y acá iba el 3º
  });

  test("la sesión 2 queda en conflicto pendiente y el servidor conserva lo de la sesión 1", async () => {
    const srv = servidorFalso({ finanzas: { value: JSON.stringify(BLOB_V1), updated_at: "v0" } });
    const s1 = sesion(srv), s2 = sesion(srv);

    // 1. las dos cargan la misma versión
    const c1 = await s1.load("finanzas");
    const c2 = await s2.load("finanzas");
    expect(c1.version).toBe("v0");
    expect(c2.version).toBe("v0");

    // 2. la sesión 1 guarda → confirmado, versión nueva
    const deS1 = conSaldo(BLOB_V1, 1000);
    const r1 = await s1.saveConfirmed("finanzas", deS1, {});
    expect(r1.ok).toBe(true);
    expect(r1.version).toBe("v1");
    expect(srv.leer("finanzas")).toEqual(deS1);

    // 3. la sesión 2 guarda su propio estado (obsoleto) → CONFLICTO
    const deS2 = conSaldo(BLOB_V1, 7777);
    const r2 = await s2.saveConfirmed("finanzas", deS2, {});
    expect(r2.ok).toBe(false);
    expect(r2.motivo).toBe(MOTIVOS.CONFLICTO);
    expect(r2.conflictoPendiente).toBe(true);
    expect(r2.valorServidor).toEqual(deS1);
    expect(srv.leer("finanzas")).toEqual(deS1);              // nada se pisó

    // La versión conocida de la sesión 2 NO avanzó (acá estaba el defecto)
    expect(s2.estado("finanzas").version).toBe("v0");
    // y su base sigue siendo la que cargó: lo local no se descartó ni se fusionó
    expect(s2.estado("finanzas").base).toEqual(BLOB_V1);
    expect(s2.isDirty("finanzas")).toBe(true);
    expect(s2.estado("finanzas").conflictoPendiente).toBe(true);
    expect(s2.conflictoPendiente("finanzas").valorServidor).toEqual(deS1);
    expect(s2.idsSucios()).toEqual(["finanzas"]);
    expect(s2.idsEnConflicto()).toEqual(["finanzas"]);

    const patchesAntes = srv.cuenta("PATCH");                 // 2: el de s1 y el rechazado de s2
    expect(patchesAntes).toBe(2);

    // 4. la sesión 2 vuelve a intentar el MISMO estado obsoleto → no escribe
    const r3 = await s2.saveConfirmed("finanzas", deS2, {});
    expect(r3.ok).toBe(false);
    expect(r3.motivo).toBe(MOTIVOS.CONFLICTO_PENDIENTE);
    expect(r3.valorServidor).toEqual(deS1);
    expect(srv.cuenta("PATCH")).toBe(patchesAntes);            // ni un PATCH más
    expect(srv.leer("finanzas")).toEqual(deS1);                // el guardado de s1 sigue entero
    expect(srv.leer("finanzas").params_emp.saldo).toBe(1000);  // NO 7777

    // El aviso para la pantalla dice que hay que decidir, no que se guardó
    const aviso = construirAvisoDesde("finanzas", r3, "el Flujo de Caja");
    expect(aviso.tipo).toBe("conflicto");
    expect(aviso.conflictoPendiente).toBe(true);
    expect(aviso.texto).toMatch(/No se guardó/);
    expect(aviso.texto).toMatch(/elegir/);

    // Y la sesión 1 sigue trabajando normal (su conflicto no existe)
    const r4 = await s1.saveConfirmed("finanzas", conSaldo(BLOB_V1, 1001), {});
    expect(r4.ok).toBe(true);
    expect(srv.leer("finanzas").params_emp.saldo).toBe(1001);
  });

  test("un auto-save repetido mientras hay conflicto pendiente NO escribe NUNCA", async () => {
    const srv = servidorFalso({ finanzas: { value: JSON.stringify(BLOB_V1), updated_at: "v0" } });
    const s1 = sesion(srv), s2 = sesion(srv);
    await s1.load("finanzas"); await s2.load("finanzas");
    await s1.saveConfirmed("finanzas", conSaldo(BLOB_V1, 1), {});
    await s2.saveConfirmed("finanzas", conSaldo(BLOB_V1, 2), {});   // deja el conflicto puesto
    expect(s2.estado("finanzas").conflictoPendiente).toBe(true);

    const patches = srv.cuenta("PATCH");
    const posts = srv.cuenta("POST");
    // 10 ciclos de auto-save con valores que cambian (como teclear en el flujo)
    const resultados = [];
    for (let i = 0; i < 10; i++) resultados.push(await s2.saveConfirmed("finanzas", conSaldo(BLOB_V1, 100 + i), {}));
    // y 5 encolados a la vez (coalescencia): la cola tampoco se vacía escribiendo
    const juntos = await Promise.all([0, 1, 2, 3, 4].map((i) => s2.saveConfirmed("finanzas", conSaldo(BLOB_V1, 200 + i), {})));

    expect(srv.cuenta("PATCH")).toBe(patches);
    expect(srv.cuenta("POST")).toBe(posts);
    expect(resultados.every((r) => r.ok === false)).toBe(true);
    expect(resultados.every((r) => r.motivo === MOTIVOS.CONFLICTO_PENDIENTE)).toBe(true);
    // los encolados: o quedaron superados por el último, o bloqueados; ninguno escribió
    expect(juntos.filter((r) => r.motivo === MOTIVOS.CONFLICTO_PENDIENTE).length).toBeGreaterThanOrEqual(1);
    expect(juntos.every((r) => r.ok === false || r.superseded === true)).toBe(true);
    expect(srv.leer("finanzas").params_emp.saldo).toBe(1);

    // flush no vacía la cola escribiendo lo obsoleto: avisa que quedó pendiente
    const f = await s2.flush("finanzas");
    expect(f.ok).toBe(false);
    expect(f.confirmado).toBe(false);
    expect(f.pendiente).toBe(true);
    expect(f.conflicto).toBe(true);
    expect(f.motivo).toBe(MOTIVOS.CONFLICTO_PENDIENTE);
    expect(srv.cuenta("PATCH")).toBe(patches);
  });
});

describe("salida (a): recuperar el estado vigente del servidor", () => {
  test("devuelve el valor del servidor, limpia el conflicto y el guardado vuelve a funcionar", async () => {
    const srv = servidorFalso({ finanzas: { value: JSON.stringify(BLOB_V1), updated_at: "v0" } });
    const s1 = sesion(srv), s2 = sesion(srv);
    await s1.load("finanzas"); await s2.load("finanzas");
    const deS1 = conSaldo(BLOB_V1, 500);
    await s1.saveConfirmed("finanzas", deS1, {});
    await s2.saveConfirmed("finanzas", conSaldo(BLOB_V1, 999), {});
    expect(s2.estado("finanzas").conflictoPendiente).toBe(true);

    const rec = await s2.recuperarDelServidor("finanzas");
    expect(rec.ok).toBe(true);
    expect(rec.descartaLocal).toBe(true);
    expect(rec.value).toEqual(deS1);                       // lo que el caller debe aplicar
    expect(rec.version).toBe("v1");
    expect(s2.estado("finanzas").conflictoPendiente).toBe(false);
    expect(s2.isDirty("finanzas")).toBe(false);
    expect(s2.idsSucios()).toEqual([]);

    // ahora sí: sobre la versión vigente, con confirmación del servidor
    const nuevo = conSaldo(deS1, 650);
    const r = await s2.saveConfirmed("finanzas", nuevo, {});
    expect(r.ok).toBe(true);
    expect(r.version).toBe("v2");
    expect(srv.leer("finanzas")).toEqual(nuevo);
    expect(srv.leer("finanzas").params_emp.saldo).toBe(650);
    const f = await s2.flush("finanzas");
    expect(f.ok).toBe(true);
    expect(f.confirmado).toBe(true);
    expect(f.conflicto).toBe(false);
  });

  test("si la relectura falla, el conflicto NO se limpia y sigue bloqueando", async () => {
    const srv = servidorFalso({ finanzas: { value: JSON.stringify(BLOB_V1), updated_at: "v0" } });
    const s1 = sesion(srv), s2 = sesion(srv);
    await s1.load("finanzas"); await s2.load("finanzas");
    await s1.saveConfirmed("finanzas", conSaldo(BLOB_V1, 5), {});
    await s2.saveConfirmed("finanzas", conSaldo(BLOB_V1, 6), {});

    srv.estado.modo = "lanza_todo";
    const rec = await s2.recuperarDelServidor("finanzas");
    expect(rec.ok).toBe(false);
    expect(rec.motivo).toBe(MOTIVOS.RED);
    srv.estado.modo = null;
    expect(s2.estado("finanzas").conflictoPendiente).toBe(true);
    const patches = srv.cuenta("PATCH");
    const r = await s2.saveConfirmed("finanzas", conSaldo(BLOB_V1, 6), {});
    expect(r.motivo).toBe(MOTIVOS.CONFLICTO_PENDIENTE);
    expect(srv.cuenta("PATCH")).toBe(patches);
  });
});

describe("salida (b): reconciliar conservando lo local", () => {
  test("escribe sobre la versión vigente y el servidor queda con lo local, confirmado", async () => {
    const srv = servidorFalso({ finanzas: { value: JSON.stringify(BLOB_V1), updated_at: "v0" } });
    const s1 = sesion(srv), s2 = sesion(srv);
    await s1.load("finanzas"); await s2.load("finanzas");
    await s1.saveConfirmed("finanzas", conSaldo(BLOB_V1, 11), {});   // servidor v1
    const deS2 = conSaldo(BLOB_V1, 22);
    await s2.saveConfirmed("finanzas", deS2, {});                    // conflicto pendiente
    expect(srv.leer("finanzas").params_emp.saldo).toBe(11);

    const r = await s2.reconciliarConservandoLocal("finanzas", deS2, {});
    expect(r.ok).toBe(true);
    expect(r.version).toBe("v2");                                    // confirmación del servidor
    expect(srv.leer("finanzas")).toEqual(deS2);
    expect(srv.leer("finanzas").params_emp.saldo).toBe(22);
    expect(srv.filas.finanzas.updated_at).toBe("v2");
    expect(s2.estado("finanzas").conflictoPendiente).toBe(false);
    expect(s2.isDirty("finanzas")).toBe(false);
    // escribió condicionado a la versión vigente (v1), no a la vieja (v0)
    const ultimoPatch = srv.peticiones.filter((p) => p.metodo === "PATCH").pop();
    expect(ultimoPatch.url).toContain("updated_at=eq.v1");
  });

  test("sin valor solo desbloquea: el guardado siguiente escribe sobre la versión vigente", async () => {
    const srv = servidorFalso({ finanzas: { value: JSON.stringify(BLOB_V1), updated_at: "v0" } });
    const s1 = sesion(srv), s2 = sesion(srv);
    await s1.load("finanzas"); await s2.load("finanzas");
    await s1.saveConfirmed("finanzas", conSaldo(BLOB_V1, 31), {});
    const deS2 = conSaldo(BLOB_V1, 32);
    await s2.saveConfirmed("finanzas", deS2, {});

    const d = await s2.reconciliarConservandoLocal("finanzas");
    expect(d.ok).toBe(true);
    expect(d.desbloqueado).toBe(true);
    expect(d.version).toBe("v1");
    expect(d.valorServidor.params_emp.saldo).toBe(31);
    expect(s2.isDirty("finanzas")).toBe(true);        // lo local sigue sin guardar
    const r = await s2.saveConfirmed("finanzas", deS2, {});
    expect(r.ok).toBe(true);
    expect(srv.leer("finanzas").params_emp.saldo).toBe(32);
  });

  test("si el servidor se mueve OTRA VEZ entre la relectura y el PATCH, vuelve a quedar en conflicto (no pisa)", async () => {
    const srv = servidorFalso({ finanzas: { value: JSON.stringify(BLOB_V1), updated_at: "v0" } });
    const s1 = sesion(srv), s2 = sesion(srv);
    await s1.load("finanzas"); await s2.load("finanzas");
    await s1.saveConfirmed("finanzas", conSaldo(BLOB_V1, 41), {});
    const deS2 = conSaldo(BLOB_V1, 42);
    await s2.saveConfirmed("finanzas", deS2, {});

    // una tercera escritura ajena cae justo antes del PATCH de la reconciliación
    const ajeno = conSaldo(BLOB_V1, 43);
    srv.estado.ganchoPrePatch = (filas, nuevaVer) => { filas.finanzas = { value: JSON.stringify(ajeno), updated_at: nuevaVer() }; };
    const r = await s2.reconciliarConservandoLocal("finanzas", deS2, {});
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe(MOTIVOS.CONFLICTO);
    expect(r.conflictoPendiente).toBe(true);
    expect(srv.leer("finanzas")).toEqual(ajeno);           // el ajeno sigue intacto
    expect(s2.estado("finanzas").conflictoPendiente).toBe(true);
  });

  test("sin carga previa exitosa, reconciliar está bloqueado igual que guardar (Regla 9)", async () => {
    const srv = servidorFalso({ finanzas: { value: JSON.stringify(BLOB_V1), updated_at: "v0" } });
    const p = sesion(srv);
    const r = await p.reconciliarConservandoLocal("finanzas", BLOB_V1, {});
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe(MOTIVOS.SIN_CARGA);
    expect(srv.escrituras()).toEqual([]);
  });
});

describe("reconcileIncoming (realtime/poll) deja el mismo conflicto pendiente", () => {
  test("no aplica encima de lo local, no adelanta la versión y bloquea el próximo guardado", async () => {
    const srv = servidorFalso({ finanzas: { value: JSON.stringify(BLOB_V1), updated_at: "v0" } });
    const p = sesion(srv);
    await p.load("finanzas");
    p.marcarSucio("finanzas");                              // hay edición local sin confirmar

    const remoto = conSaldo(BLOB_V1, 77);
    srv.filas.finanzas = { value: JSON.stringify(remoto), updated_at: "v9" };
    const dec = p.reconcileIncoming("finanzas", remoto, "v9");
    expect(dec.apply).toBe(false);
    expect(dec.dirty).toBe(true);
    expect(dec.conflictoPendiente).toBe(true);
    expect(dec.valorServidor).toEqual(remoto);              // el caller puede aplicarlo o comparar
    expect(dec.version).toBe("v9");
    expect(p.estado("finanzas").version).toBe("v0");        // NO se adelantó la versión
    expect(p.estado("finanzas").conflictoPendiente).toBe(true);

    const patches = srv.cuenta("PATCH");
    const r = await p.saveConfirmed("finanzas", conSaldo(BLOB_V1, 1), {});
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe(MOTIVOS.CONFLICTO_PENDIENTE);
    expect(srv.cuenta("PATCH")).toBe(patches);              // 0 PATCH
    expect(srv.leer("finanzas")).toEqual(remoto);

    // y se sale por la puerta explícita
    const rec = await p.recuperarDelServidor("finanzas");
    expect(rec.value).toEqual(remoto);
    const ok = await p.saveConfirmed("finanzas", conSaldo(remoto, 78), {});
    expect(ok.ok).toBe(true);
    expect(srv.leer("finanzas").params_emp.saldo).toBe(78);
  });

  test("sin edición local el estado entrante se adopta como antes (apply:true)", async () => {
    const srv = servidorFalso({ finanzas: { value: JSON.stringify(BLOB_V1), updated_at: "v0" } });
    const p = sesion(srv);
    await p.load("finanzas");
    const remoto = conSaldo(BLOB_V1, 3);
    const dec = p.reconcileIncoming("finanzas", remoto, "v5");
    expect(dec.apply).toBe(true);
    expect(dec.value).toEqual(remoto);
    expect(p.estado("finanzas").version).toBe("v5");
    expect(p.estado("finanzas").conflictoPendiente).toBe(false);
  });
});

describe("fallos de red y HTTP: ninguno es éxito, ninguno queda en conflicto pendiente", () => {
  const casos = [
    ["fetch que lanza", { modo: "lanza" }, MOTIVOS.RED],
    ["HTTP 401", { modo: "http", status: 401 }, MOTIVOS.HTTP],
    ["HTTP 403", { modo: "http", status: 403 }, MOTIVOS.HTTP],
    ["HTTP 500", { modo: "http", status: 500 }, MOTIVOS.HTTP],
    ["2xx sin representación (PATCH devuelve [] con versión conocida)", { modo: "sin_representacion" }, MOTIVOS.CONFLICTO],
    ["2xx con representación sin updated_at", { modo: "representacion_vacia" }, MOTIVOS.SIN_CONFIRMACION],
  ];
  casos.forEach(([nombre, modo, esperado]) => {
    test(nombre, async () => {
      const srv = servidorFalso({ finanzas: { value: JSON.stringify(BLOB_V1), updated_at: "v0" } });
      const p = sesion(srv);
      await p.load("finanzas");
      Object.assign(srv.estado, modo);
      const r = await p.saveConfirmed("finanzas", conSaldo(BLOB_V1, 9), {});
      expect(r.ok).not.toBe(true);
      expect(r.ok).toBe(false);
      expect(r.motivo).toBe(esperado);
      expect(p.isDirty("finanzas")).toBe(true);                 // sigue sucio: no se declaró guardado
      expect(srv.leer("finanzas")).toEqual(BLOB_V1);            // el servidor no cambió
      const aviso = construirAvisoDesde("finanzas", r, "el Flujo de Caja");
      expect(aviso).not.toBeNull();
      expect(aviso.texto).toMatch(/No se (pudo|guardó)/);
      // un 2xx que devuelve 0 filas en un PATCH condicionado ES un conflicto real
      expect(p.estado("finanzas").conflictoPendiente).toBe(esperado === MOTIVOS.CONFLICTO);
    });
  });

  test("2xx sin representación en una fila NUEVA (POST) es sin_confirmacion, no éxito", async () => {
    const srv = servidorFalso({});
    const p = sesion(srv);
    p.registrarCarga("fila_nueva", null, null, "string");
    srv.estado.modo = "sin_representacion";
    const r = await p.saveConfirmed("fila_nueva", { a: 1 }, {});
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe(MOTIVOS.SIN_CONFIRMACION);
    expect(p.isDirty("fila_nueva")).toBe(true);
  });

  test("el error HTTP no bloquea la fila: cuando la red vuelve, el guardado confirma", async () => {
    const srv = servidorFalso({ finanzas: { value: JSON.stringify(BLOB_V1), updated_at: "v0" } });
    const p = sesion(srv);
    await p.load("finanzas");
    srv.estado.modo = "http"; srv.estado.status = 500;
    const malo = await p.saveConfirmed("finanzas", conSaldo(BLOB_V1, 4), {});
    expect(malo.ok).toBe(false);
    srv.estado.modo = null;
    const bueno = await p.saveConfirmed("finanzas", conSaldo(BLOB_V1, 4), {});
    expect(bueno.ok).toBe(true);
    expect(srv.leer("finanzas").params_emp.saldo).toBe(4);
  });
});

describe("filas-colección: la fusión por ítem sigue funcionando", () => {
  const lista = (items) => items;
  test("dos sesiones tocan ítems DISTINTOS → fusiona, confirma y no entra en conflicto pendiente", async () => {
    const srv = servidorFalso({ rendiciones: { value: JSON.stringify([{ id: "A", n: 1 }, { id: "B", n: 1 }]), updated_at: "v0" } });
    const s1 = sesion(srv), s2 = sesion(srv);
    const c1 = await s1.load("rendiciones");
    const c2 = await s2.load("rendiciones");

    const r1 = await s1.saveConfirmed("rendiciones", [{ id: "A", n: 2 }, { id: "B", n: 1 }], { merge: true });
    expect(r1.ok).toBe(true);

    // s2 edita SOLO B (su copia es la vieja)
    const r2 = await s2.saveConfirmed("rendiciones", [{ id: "A", n: 1 }, { id: "B", n: 9 }], { merge: true });
    expect(r2.ok).toBe(true);
    expect(r2.fusionado).toBe(true);
    expect(s2.estado("rendiciones").conflictoPendiente).toBe(false);
    const enSrv = srv.leer("rendiciones");
    expect(enSrv.find((x) => x.id === "A").n).toBe(2);   // el cambio de s1 sobrevivió
    expect(enSrv.find((x) => x.id === "B").n).toBe(9);   // y el de s2 también
  });

  test("dos sesiones tocan el MISMO ítem → conflicto_item, el servidor queda intacto y la fila se bloquea", async () => {
    const srv = servidorFalso({ rendiciones: { value: JSON.stringify([{ id: "A", n: 1 }]), updated_at: "v0" } });
    const s1 = sesion(srv), s2 = sesion(srv);
    await s1.load("rendiciones"); await s2.load("rendiciones");
    await s1.saveConfirmed("rendiciones", [{ id: "A", n: 2 }], { merge: true });
    const r2 = await s2.saveConfirmed("rendiciones", [{ id: "A", n: 3 }], { merge: true });
    expect(r2.ok).toBe(false);
    expect(r2.motivo).toBe(MOTIVOS.CONFLICTO_ITEM);
    expect(r2.conflictos).toEqual(["A"]);
    expect(srv.leer("rendiciones")).toEqual([{ id: "A", n: 2 }]);
    // y el reintento tampoco escribe hasta que se resuelva
    const patches = srv.cuenta("PATCH");
    const r3 = await s2.saveConfirmed("rendiciones", [{ id: "A", n: 3 }], { merge: true });
    expect(r3.motivo).toBe(MOTIVOS.CONFLICTO_PENDIENTE);
    expect(srv.cuenta("PATCH")).toBe(patches);
    expect(srv.leer("rendiciones")).toEqual([{ id: "A", n: 2 }]);
  });
});

describe("compatibilidad: las firmas que ya usan App/EEFF/permisos/Allegria/Finanzas", () => {
  test("computeNext como FUNCIÓN recomputa contra la versión fresca y confirma (sin conflicto pendiente)", async () => {
    const srv = servidorFalso({ maestro_plan_cuentas: { value: JSON.stringify({ a: 1 }), updated_at: "v0" } });
    const s1 = sesion(srv), s2 = sesion(srv);
    await s1.load("maestro_plan_cuentas"); await s2.load("maestro_plan_cuentas");
    await s1.saveConfirmed("maestro_plan_cuentas", { a: 1, deS1: true }, {});
    // la forma función ES la política de fusión: se recomputa sobre lo fresco
    const r = await s2.saveConfirmed("maestro_plan_cuentas", (base) => ({ ...(base || {}), deS2: true }), {});
    expect(r.ok).toBe(true);
    expect(srv.leer("maestro_plan_cuentas")).toEqual({ a: 1, deS1: true, deS2: true });
    expect(s2.estado("maestro_plan_cuentas").conflictoPendiente).toBe(false);
  });

  test("registrarCarga(id, valor, version, encoding) de 4 argumentos sigue habilitando el guardado", async () => {
    const srv = servidorFalso({ main: { value: JSON.stringify({ t: 1 }), updated_at: "v0" } });
    const p = sesion(srv);
    p.registrarCarga("main", { t: 1 }, "v0", true);
    const r = await p.saveConfirmed("main", { t: 2 }, {});
    expect(r.ok).toBe(true);
    expect(srv.leer("main")).toEqual({ t: 2 });
    expect(typeof srv.filas.main.value).toBe("string");   // F0-C: codificación preservada
  });

  test("flush de una fila sin cola ni cambios dice confirmado", async () => {
    const srv = servidorFalso({ pins: { value: JSON.stringify({}), updated_at: "v0" } });
    const p = sesion(srv);
    await p.load("pins");
    const f = await p.flush("pins");
    expect(f).toMatchObject({ ok: true, confirmado: true, pendiente: false, conflicto: false, id: "pins" });
  });
});

describe("lo que la pantalla necesita (guardando / guardado / error)", () => {
  test("estado por fila, idsSucios y flush que espera la cola", async () => {
    const srv = servidorFalso({
      finanzas: { value: JSON.stringify(BLOB_V1), updated_at: "v0" },
      pins: { value: JSON.stringify({ p: 1 }), updated_at: "v0" },
    });
    const p = sesion(srv);
    await p.load("finanzas");
    await p.load("pins");
    expect(p.estado("finanzas")).toMatchObject({ cargaOk: true, dirty: false, sucio: false, conflictoPendiente: false, ultimoMotivo: null, enVuelo: false, servidorConocido: true, version: "v0" });
    expect(p.idsSucios()).toEqual([]);

    // guardando: encolado pero sin esperar
    const prom = p.saveConfirmed("finanzas", conSaldo(BLOB_V1, 1), {});
    expect(p.estado("finanzas").enVuelo).toBe(true);
    expect(p.estado("finanzas").sucio).toBe(true);
    expect(p.idsSucios()).toEqual(["finanzas"]);
    // flush espera a que la cola de ESA fila termine y dice si quedó confirmado
    const f = await p.flush("finanzas");
    expect(await prom).toMatchObject({ ok: true });
    expect(f).toMatchObject({ ok: true, confirmado: true, pendiente: false, conflicto: false });
    expect(p.estado("finanzas").enVuelo).toBe(false);
    expect(p.idsSucios()).toEqual([]);

    // error: queda el último motivo para la UI
    srv.estado.modo = "http"; srv.estado.status = 401;
    const r = await p.saveConfirmed("pins", { p: 2 }, {});
    expect(r.ok).toBe(false);
    expect(p.estado("pins")).toMatchObject({ sucio: true, ultimoMotivo: MOTIVOS.HTTP, conflictoPendiente: false });
    expect(p.idsSucios()).toEqual(["pins"]);
    const fp = await p.flush("pins");
    expect(fp).toMatchObject({ ok: false, confirmado: false, pendiente: true, conflicto: false, motivo: MOTIVOS.HTTP });
  });
});

describe("aislamiento: ninguna petición sale a la red real", () => {
  test("todas las URLs vistas son del transporte falso y los hosts reales tienen 0 peticiones", async () => {
    const srv = servidorFalso({ finanzas: { value: JSON.stringify(BLOB_V1), updated_at: "v0" } });
    const s1 = sesion(srv), s2 = sesion(srv);
    await s1.load("finanzas"); await s2.load("finanzas");
    await s1.saveConfirmed("finanzas", conSaldo(BLOB_V1, 1), {});
    await s2.saveConfirmed("finanzas", conSaldo(BLOB_V1, 2), {});
    await s2.saveConfirmed("finanzas", conSaldo(BLOB_V1, 2), {});
    await s2.recuperarDelServidor("finanzas");
    await s2.reconciliarConservandoLocal("finanzas", conSaldo(BLOB_V1, 3), {});

    expect(srv.peticiones.length).toBeGreaterThan(0);
    const hosts = [...new Set(srv.peticiones.map((p) => p.host))];
    expect(hosts).toEqual(["falso.test"]);
    HOSTS_REALES.forEach((h) => {
      expect(srv.peticiones.filter((p) => p.host === h).length).toBe(0);
    });
    const paths = [...new Set(srv.peticiones.map((p) => p.path))];
    expect(paths).toEqual(["/rest/v1/calendario_data"]);
    expect(srv.peticiones.every((p) => p.url.startsWith(URL_FALSA + "/rest/v1/calendario_data"))).toBe(true);
    const metodos = [...new Set(srv.peticiones.map((p) => p.metodo))].sort();
    expect(metodos).toEqual(["GET", "PATCH"]);
  });
});
