/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// ABRIR FINANZAS NO ESCRIBE
//
// Abrir el módulo escribía la fila `finanzas` (~4,4 MB en producción) sin que
// nadie editara nada. El guardia canónico del contrato no podía suprimirlo:
// `applyData` re-defaultea el blob al cargarlo (`{...defaultParams(), ...}`,
// `defaultParamsAllegriaService`, `defaultParamsIntegrity`, merge profundo de
// `params_af`, reconstrucción de `params_ap`, `defaultParamsOsiris`,
// `defaultParticipacionAllpa`) y además le quita `saldos_bancos`, así que lo que
// se escribía NO era igual a lo que se había leído.
//
// Criterio: una escritura es legítima si cambia el SIGNIFICADO de lo guardado.
// Un default que se agrega para que la pantalla funcione no lo cambia. Una
// migración de formato sí, pero entonces tiene que ser una escritura DECLARADA.
//
// Lo que se prueba acá es la INTEGRACIÓN (montando el módulo real con `fetch`
// inyectado y un PostgREST en memoria), no un modelo puro: lo que falló estaba
// justo en la costura entre `applyData`, el efecto de auto-save y el contrato.
// Se cuentan las PETICIONES que llegan al servidor falso, por fila y por método.
//
//   1. abrir con datos ya normalizados y sin editar nada → 0 PATCH a `finanzas`
//   2. abrir y hacer UNA edición → exactamente 1 escritura, con el cambio dentro
//   3. `saldos_bancos` en el blob y `finanzas_bancos` vacía → migra la fila nueva
//   4. `finanzas_bancos` ya poblada → no escribe
//   5. registros sin identificador → la migración declarada escribe; la segunda
//      apertura (fila ya migrada) no vuelve a escribir
//   6. formato viejo de la comisión de arándanos → se guarda la migración
//   7. carga fallida → ninguna escritura (gate `cargaOkRef`)
//   8. usuario de Rendiciones (todo lo financiero en `sin_acceso`) → no escribe
//      ni le aparece un aviso
// ═══════════════════════════════════════════════════════════════════════════════

// `persistContract` captura `fetch` al crear la instancia compartida (que se
// crea al importar el módulo), así que la indirección se instala ANTES de
// cualquier require y se intercambia el servidor por prueba.
let SRV = null;
global.fetch = (...a) => SRV.fetchImpl(...a);
// jsdom intentaría abrir el WebSocket de Supabase Realtime contra la red real.
class WSFalso {
  constructor(){ this.readyState = 0; }
  send(){} close(){ this.readyState = 3; }
}
global.WebSocket = WSFalso;
WSFalso.OPEN = 1;
global.WebSocket.OPEN = 1;

const React = require("react");
const { render, screen, act, waitFor, fireEvent } = require("@testing-library/react");

// ── PostgREST en memoria ─────────────────────────────────────────────────────
function servidorFalso(filasIniciales = {}) {
  const filas = JSON.parse(JSON.stringify(filasIniciales));
  const peticiones = [];
  let seq = 1;
  const estado = { leeMal: false };
  const resp = (body, status = 200) => ({
    ok: status >= 200 && status < 300, status,
    json: async () => body, text: async () => JSON.stringify(body),
    headers: { get: () => null },
  });
  const fetchImpl = async (url, opts = {}) => {
    const metodo = (opts.method || "GET").toUpperCase();
    const u = new URL(String(url));
    let id = decodeURIComponent((/id=eq\.([^&]+)/.exec(u.search) || [])[1] || "");
    let body = null;
    try { body = JSON.parse(opts.body || "null"); } catch (_) {}
    if (!id && body && body.id) id = String(body.id);
    peticiones.push({ metodo, id });
    if (estado.leeMal && metodo === "GET") throw new TypeError("Failed to fetch");
    if (metodo === "GET") {
      const f = filas[id];
      return resp(f ? [{ id, value: f.value, updated_at: f.updated_at }] : []);
    }
    if (metodo === "PATCH") {
      const ver = decodeURIComponent((/updated_at=eq\.([^&]+)/.exec(u.search) || [])[1] || "");
      if (!filas[id] || filas[id].updated_at !== ver) return resp([]);   // 0 filas = conflicto
      filas[id] = { value: body.value, updated_at: `v${seq++}` };
      return resp([{ id, value: filas[id].value, updated_at: filas[id].updated_at }]);
    }
    if (metodo === "POST") {
      filas[body.id] = { value: body.value, updated_at: `v${seq++}` };
      return resp([{ id: body.id, value: filas[body.id].value, updated_at: filas[body.id].updated_at }], 201);
    }
    throw new Error("método no soportado " + metodo);
  };
  const escrituras = (id) => peticiones.filter(p => p.metodo !== "GET" && (id === undefined || p.id === id));
  const leer = (id) => {
    const v = filas[id] && filas[id].value;
    return v === undefined ? undefined : (typeof v === "string" ? JSON.parse(v) : v);
  };
  return { filas, fetchImpl, peticiones, escrituras, leer, estado };
}

// ── Datos de la fila `finanzas` con la estructura real ───────────────────────
const TEMPS = ["2026-2027", "2027-2028", "2028-2029", "2029-2030", "2030-2031"];
const fruta = (extra = {}) => ({
  kg: 0, fob_usd_kg: 0, desc_exp_pct: 0, mat_usd_kg: 0, srv_usd_kg: 0,
  anticipos_cliente: [], anticipos_productor: [], mes_liquidacion: "",
  mes_saldo_productor: "", programas: [], dist_mat: [], dist_srv: [], ...extra,
});
function allegriaParams({ conIds = true } = {}) {
  const p = {};
  TEMPS.forEach(t => { p[t] = { cerezas: fruta(), ciruelas: fruta(), arandanos: fruta() }; });
  p["2026-2027"].cerezas = fruta({
    kg: 850000, fob_usd_kg: 4.5, desc_exp_pct: 6, mat_usd_kg: 0.5, srv_usd_kg: 1.2,
    mes_liquidacion: "Mar-27",
    anticipos_cliente: [
      { ...(conIds ? { id: "est_c1" } : {}), mes: "Nov-26", usd_kg: 0.44, realizaciones: [] },
      { ...(conIds ? { id: "est_c2" } : {}), mes: "Dec-26", usd_kg: 0.44, realizaciones: [] },
    ],
  });
  return p;
}
// Lo que la fila `finanzas` trae en producción (claves del blob).
function blobFinanzas(extra = {}) {
  return {
    finanzas_real: {}, allegria_params: allegriaParams(),
    allegria_comision_arandanos: { cobros: [] },
    params_emp: {}, params_as: {}, params_if: {}, params_af: {}, params_ap: {},
    params_osiris: {}, params_participacion: {}, sub_lines: {}, added_lines: {},
    intercompany: [], creditos_data: [], params_frisku: {},
    ...extra,
  };
}
const fila = (value) => ({ value, updated_at: "v0" });

const ADMIN = { nombre: "Angelo Huerta", rol: "admin", email: "a@b.cl" };
// Personal de Rendiciones: todo lo financiero en sin_acceso, solo rendiciones.
const PERMISOS_RENDICIONES = {
  dashboard: "sin_acceso", flujo: "sin_acceso", bancos: "sin_acceso",
  creditos: "sin_acceso", nominas: "sin_acceso", reporte: "sin_acceso",
  eeff: "sin_acceso", rendiciones: "editar",
};

let FinanzasModule, persist;
beforeAll(() => {
  persist = require("../persistencia/instancia.js").persist;
  FinanzasModule = require("../FinanzasModule.jsx").default;
});

function montar(props = {}) {
  let r;
  act(() => {
    r = render(React.createElement(FinanzasModule, {
      onBack: () => {}, onLogout: () => {},
      usuarioActual: ADMIN, tabPermisos: {}, usuarios: [ADMIN],
      ...props,
    }));
  });
  return r;
}

// Deja correr la carga (promesas) y el debounce de 800 ms del auto-save.
async function dejarPasarElDebounce() {
  await act(async () => { jest.advanceTimersByTime(50); await Promise.resolve(); });
  for (let i = 0; i < 12; i++) {
    await act(async () => { jest.advanceTimersByTime(200); await Promise.resolve(); });
  }
  await act(async () => { jest.advanceTimersByTime(3000); await Promise.resolve(); });
}

beforeEach(() => {
  jest.useFakeTimers();
  persist.reset();
  window.auditLog = undefined;
});
afterEach(() => { jest.useRealTimers(); });

// ── 1. Abrir con datos ya normalizados y sin editar nada → 0 escrituras ──────
test("abrir con datos ya normalizados y sin editar nada no escribe la fila finanzas", async () => {
  SRV = servidorFalso({
    finanzas: fila(blobFinanzas()),
    finanzas_bancos: fila({ saldos: { "Allegria Foods||BICE||usd": { monto: 17433, fecha: "2026-09-15", moneda: "usd" } } }),
    finanzas_esc_index: fila({ escenarios: [] }),
  });
  montar();
  await dejarPasarElDebounce();

  expect(SRV.escrituras("finanzas").length).toBe(0);
  expect(SRV.escrituras("finanzas_bancos").length).toBe(0);
  expect(SRV.escrituras("finanzas_esc_index").length).toBe(0);
  expect(SRV.escrituras().length).toBe(0);
  // y la fila quedó byte a byte como estaba
  expect(SRV.filas.finanzas.updated_at).toBe("v0");
});

// ── 2. Abrir y hacer UNA edición → exactamente 1 escritura, con el cambio ────
test("una sola edición del usuario produce exactamente una escritura, con el cambio dentro", async () => {
  SRV = servidorFalso({
    finanzas: fila(blobFinanzas()),
    finanzas_bancos: fila({ saldos: {} }),
    finanzas_esc_index: fila({ escenarios: [] }),
  });
  montar();
  await dejarPasarElDebounce();
  expect(SRV.escrituras("finanzas").length).toBe(0);

  const clic = async (re) => {
    const b = [...document.querySelectorAll("button")].find(x => re.test(x.textContent || ""));
    if (!b) throw new Error("no encontré el botón " + re);
    await act(async () => { fireEvent.click(b); await Promise.resolve(); });
  };
  await clic(/Flujo Empresas/);
  await clic(/Allegria Foods/);
  await clic(/Parámetros/);

  // Edición REAL por la interfaz: el primer campo numérico de los parámetros de
  // la fruta (kilos). InputNumero confirma al salir del campo.
  const campo = document.querySelectorAll("input")[0];
  expect(campo).toBeTruthy();
  await act(async () => {
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: "777777" } });
    fireEvent.blur(campo);
    await Promise.resolve();
  });
  await dejarPasarElDebounce();

  expect(SRV.escrituras("finanzas").length).toBe(1);
  const ap = SRV.leer("finanzas").allegria_params;
  const kilos = JSON.stringify(ap).includes("777777");
  expect(kilos).toBe(true);
  // y lo que ya estaba no se perdió
  expect(ap["2026-2027"].cerezas.anticipos_cliente).toHaveLength(2);
  expect(ap["2026-2027"].cerezas.mes_liquidacion).toBe("Mar-27");
});

// ── 3/4. Migración de saldos_bancos del blob a la fila dedicada ──────────────
test("saldos_bancos en el blob y finanzas_bancos vacía: migra la fila dedicada", async () => {
  const saldos = { "Allegria Foods||BICE||usd": { monto: 17433, fecha: "2026-09-15", moneda: "usd" } };
  SRV = servidorFalso({
    finanzas: fila(blobFinanzas({ saldos_bancos: saldos })),
    finanzas_esc_index: fila({ escenarios: [] }),
    // finanzas_bancos no existe
  });
  montar();
  await dejarPasarElDebounce();

  expect(SRV.escrituras("finanzas_bancos").length).toBe(1);
  expect(SRV.leer("finanzas_bancos").saldos).toEqual(saldos);
  // la migración es de la fila de bancos: el blob del flujo no se reescribe
  expect(SRV.escrituras("finanzas").length).toBe(0);
});

test("finanzas_bancos ya poblada: no se migra nada", async () => {
  const propios = { "Mediterra||Santander||usd": { monto: 999, fecha: "2026-09-30", moneda: "usd" } };
  SRV = servidorFalso({
    finanzas: fila(blobFinanzas({ saldos_bancos: { "Allegria Foods||BICE||usd": { monto: 17433, fecha: "2026-09-15", moneda: "usd" } } })),
    finanzas_bancos: fila({ saldos: propios }),
    finanzas_esc_index: fila({ escenarios: [] }),
  });
  montar();
  await dejarPasarElDebounce();

  expect(SRV.escrituras("finanzas_bancos").length).toBe(0);
  expect(SRV.leer("finanzas_bancos").saldos).toEqual(propios);
  expect(SRV.escrituras("finanzas").length).toBe(0);
});

// ── 5. Migración declarada de identificadores ────────────────────────────────
test("registros sin identificador: la migración declarada escribe, y la segunda apertura no", async () => {
  const sinIds = blobFinanzas({ allegria_params: allegriaParams({ conIds: false }) });
  SRV = servidorFalso({
    finanzas: fila(sinIds),
    finanzas_bancos: fila({ saldos: {} }),
    finanzas_esc_index: fila({ escenarios: [] }),
  });
  const { unmount } = montar();
  await dejarPasarElDebounce();

  // escribió UNA vez, y las identidades quedaron EN EL SERVIDOR
  expect(SRV.escrituras("finanzas").length).toBe(1);
  const guardado = SRV.leer("finanzas").allegria_params["2026-2027"].cerezas.anticipos_cliente;
  expect(guardado).toHaveLength(2);
  guardado.forEach(a => expect(typeof a.id === "string" && a.id.length > 0).toBe(true));
  // y los datos comerciales no se movieron
  expect(guardado.map(a => a.mes)).toEqual(["Nov-26", "Dec-26"]);
  expect(guardado.map(a => a.usd_kg)).toEqual([0.44, 0.44]);

  // ── segunda apertura sobre la fila YA migrada → no vuelve a escribir ──
  act(() => { unmount(); });
  const escriturasAntes = SRV.escrituras("finanzas").length;
  persist.reset();
  montar();
  await dejarPasarElDebounce();
  expect(SRV.escrituras("finanzas").length).toBe(escriturasAntes);
});

// ── 6. Migración de la comisión de arándanos ─────────────────────────────────
test("formato viejo de la comisión de arándanos: la migración queda guardada", async () => {
  const ap = allegriaParams();
  ap["2026-2027"].arandanos = fruta({ kg: 120000, fob_usd_kg: 3.2, desc_exp_pct: 4, mes_liquidacion: "Sep-26" });
  const blob = blobFinanzas({ allegria_params: ap });
  delete blob.allegria_comision_arandanos;   // formato viejo: no existe la clave
  SRV = servidorFalso({
    finanzas: fila(blob),
    finanzas_bancos: fila({ saldos: {} }),
    finanzas_esc_index: fila({ escenarios: [] }),
  });
  montar();
  await dejarPasarElDebounce();

  expect(SRV.escrituras("finanzas").length).toBeGreaterThanOrEqual(1);
  const mig = SRV.leer("finanzas").allegria_comision_arandanos;
  expect(mig).toBeTruthy();
  expect(mig.cobros).toHaveLength(1);
  expect(mig.cobros[0].kgTotal).toBe(120000);
  expect(mig.cobros[0].fobUsdKg).toBe(3.2);
  expect(mig.cobros[0].pagos).toEqual([{ mes: "Sep-26", pct: 100 }]);
});

// ── 7. Carga fallida → ninguna escritura ─────────────────────────────────────
test("si la carga falla no se escribe nada (gate cargaOkRef)", async () => {
  SRV = servidorFalso({
    finanzas: fila(blobFinanzas()),
    finanzas_bancos: fila({ saldos: {} }),
  });
  SRV.estado.leeMal = true;
  montar();
  await dejarPasarElDebounce();
  expect(SRV.escrituras().length).toBe(0);
  // y tampoco se declaró guardado nada
  expect(SRV.filas.finanzas.updated_at).toBe("v0");
});

// ── 8. Personal de Rendiciones: ni escritura ni aviso ────────────────────────
test("usuario de Rendiciones (todo lo financiero en sin_acceso) no escribe ni ve avisos", async () => {
  const sinIds = blobFinanzas({ allegria_params: allegriaParams({ conIds: false }) });
  SRV = servidorFalso({
    finanzas: fila(sinIds),
    finanzas_bancos: fila({ saldos: {} }),
    finanzas_esc_index: fila({ escenarios: [] }),
  });
  montar({ usuarioActual: { nombre: "Michelle", rol: "usuario", email: "m@b.cl" },
           tabPermisos: PERMISOS_RENDICIONES });
  await dejarPasarElDebounce();

  expect(SRV.escrituras("finanzas").length).toBe(0);
  expect(document.body.textContent).not.toMatch(/No se guardó/);
  expect(document.body.textContent).not.toMatch(/No se pudo guardar/);
  expect(document.querySelector('[role="status"]')).toBeNull();
});
