/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// MIGRACIÓN DECLARADA DE IDENTIFICADORES — LO QUE TERMINA EN EL SERVIDOR
//
// `normalizarIdentidades` (modelo puro) ya está probada. Lo que había roto era la
// INTEGRACIÓN: `applyData` normaliza EN MEMORIA y mete el resultado en `params`,
// así que `normalizarIdentidadesAhora` recalculaba sobre un estado YA normalizado,
// obtenía `huboCambios:false`, limpiaba el banner y volvía SIN ESCRIBIR. La
// identidad quedaba solo en memoria y la pantalla decía que había funcionado. En
// producción el CFO abrió el módulo y las 29 estimaciones de Allegria siguieron
// sin `id` en la base.
//
// Por eso estas pruebas miran EL SERVIDOR (la fila del PostgREST falso), no la
// pantalla, y usan la estructura de producción: 31 estimaciones de cerezas
// repartidas en 5 temporadas, 2 con `id` y 29 sin.
// ═══════════════════════════════════════════════════════════════════════════════

let SRV = null;
global.fetch = (...a) => SRV.fetchImpl(...a);
class WSFalso { constructor(){ this.readyState = 0; } send(){} close(){ this.readyState = 3; } }
global.WebSocket = WSFalso; global.WebSocket.OPEN = 1;

const React = require("react");
const { render, act, fireEvent } = require("@testing-library/react");

function servidorFalso(filasIniciales = {}) {
  const filas = JSON.parse(JSON.stringify(filasIniciales));
  const peticiones = [];
  let seq = 1;
  const estado = { rechazaEscrituras: false };
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
    if (metodo === "GET") {
      const f = filas[id];
      return resp(f ? [{ id, value: f.value, updated_at: f.updated_at }] : []);
    }
    if (estado.rechazaEscrituras) return resp({ message: "fallo simulado" }, 500);
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
    throw new Error("método no soportado " + metodo);
  };
  const escrituras = (id) => peticiones.filter(p => p.metodo !== "GET" && (id === undefined || p.id === id));
  const leer = (id) => {
    const v = filas[id] && filas[id].value;
    return v === undefined ? undefined : (typeof v === "string" ? JSON.parse(v) : v);
  };
  return { filas, fetchImpl, peticiones, escrituras, leer, estado };
}

// ── Estructura de producción: 31 estimaciones, 2 con id y 29 sin ─────────────
const TEMPS = ["2026-2027", "2027-2028", "2028-2029", "2029-2030", "2030-2031"];
const fruta = (extra = {}) => ({
  kg: 0, fob_usd_kg: 0, desc_exp_pct: 0, mat_usd_kg: 0, srv_usd_kg: 0,
  anticipos_cliente: [], anticipos_productor: [], mes_liquidacion: "",
  mes_saldo_productor: "", programas: [], dist_mat: [], dist_srv: [], ...extra,
});
const MESES = ["Nov-26","Dec-26","Jan-27","Feb-27","Mar-27"];
// 31 estimaciones: las 2 de US$0,44/kg (= US$374.000 sobre 850.000 kg) CON id en
// la variante "ya migrada", y SIN id en la variante de producción.
function paramsAllegria({ conIds }) {
  const p = {};
  TEMPS.forEach(t => { p[t] = { cerezas: fruta(), ciruelas: fruta(), arandanos: fruta() }; });
  let n = 0;
  const est = (i, forzarId) => {
    n++;
    const o = { mes: MESES[i % MESES.length], usd_kg: 0.44, realizaciones: [] };
    if (forzarId || conIds) o.id = `est_${n}`;
    return o;
  };
  // temporada de carga: 850.000 kg × US$4,5; 2 estimaciones que SIEMPRE tienen id
  p["2026-2027"].cerezas = fruta({
    kg: 850000, fob_usd_kg: 4.5, desc_exp_pct: 6, mat_usd_kg: 0.5, srv_usd_kg: 1.2,
    mes_liquidacion: "Mar-27",
    anticipos_cliente: [
      { id: "est_pre_1", mes: "Nov-26", usd_kg: 0.44, realizaciones: [] },
      { id: "est_pre_2", mes: "Dec-26", usd_kg: 0.44, realizaciones: [] },
      ...Array.from({ length: 10 }, (_, i) => est(i)),
    ],
  });
  // 19 más repartidas en las otras temporadas → 29 sin id en total
  let resto = 19;
  TEMPS.slice(1).forEach((t, k) => {
    const cuantas = k === 3 ? resto : Math.min(5, resto);
    resto -= cuantas;
    p[t].cerezas = fruta({ kg: 100000 + k * 1000, fob_usd_kg: 4, mes_liquidacion: "Mar-27",
      anticipos_cliente: Array.from({ length: cuantas }, (_, i) => est(i)) });
  });
  return p;
}
const CUANTAS_SIN_ID = 29;
const CUANTAS_CON_ID = 2;

function blobFinanzas(ap) {
  return {
    finanzas_real: {}, allegria_params: ap, allegria_comision_arandanos: { cobros: [] },
    params_emp: {}, params_as: {}, params_if: {}, params_af: {}, params_ap: {},
    params_osiris: {}, params_participacion: {}, sub_lines: {}, added_lines: {},
    intercompany: [], creditos_data: [], params_frisku: {},
  };
}
const fila = (value) => ({ value, updated_at: "v0" });
const ADMIN = { nombre: "Angelo Huerta", rol: "admin", email: "a@b.cl" };

let FinanzasModule, persist;
beforeAll(() => {
  persist = require("../persistencia/instancia.js").persist;
  FinanzasModule = require("../FinanzasModule.jsx").default;
});

function montar() {
  let r;
  act(() => {
    r = render(React.createElement(FinanzasModule, {
      onBack: () => {}, onLogout: () => {},
      usuarioActual: ADMIN, tabPermisos: {}, usuarios: [ADMIN],
    }));
  });
  return r;
}
async function dejarPasar() {
  for (let i = 0; i < 14; i++) {
    await act(async () => { jest.advanceTimersByTime(200); await Promise.resolve(); });
  }
  await act(async () => { jest.advanceTimersByTime(3000); await Promise.resolve(); });
}
function todasLasEstimaciones(ap) {
  const out = [];
  TEMPS.forEach(t => ["cerezas","ciruelas","arandanos"].forEach(f => {
    (ap?.[t]?.[f]?.anticipos_cliente || []).forEach(a => out.push(a));
    (ap?.[t]?.[f]?.anticipos_productor || []).forEach(a => out.push(a));
  }));
  return out;
}

let auditados;
beforeEach(() => {
  jest.useFakeTimers();
  persist.reset();
  auditados = [];
  window.auditLog = (e) => auditados.push(e);
});
afterEach(() => { jest.useRealTimers(); delete window.auditLog; });

// ── El fixture es el que dice ser ────────────────────────────────────────────
test("el fixture tiene 31 estimaciones, 2 con identificador y 29 sin", () => {
  const todas = todasLasEstimaciones(paramsAllegria({ conIds: false }));
  expect(todas).toHaveLength(CUANTAS_SIN_ID + CUANTAS_CON_ID);
  expect(todas.filter(a => a.id).length).toBe(CUANTAS_CON_ID);
  expect(todas.filter(a => !a.id).length).toBe(CUANTAS_SIN_ID);
});

// ── 1. El servidor TERMINA con las 31 identidades ────────────────────────────
test("la migración declarada deja las 31 identidades EN EL SERVIDOR, aunque el recálculo no encuentre nada más", async () => {
  SRV = servidorFalso({
    finanzas: fila(blobFinanzas(paramsAllegria({ conIds: false }))),
    finanzas_bancos: fila({ saldos: {} }),
    finanzas_esc_index: fila({ escenarios: [] }),
  });
  montar();
  await dejarPasar();

  // escribió (no se quedó en memoria)
  expect(SRV.escrituras("finanzas").length).toBe(1);
  const guardadas = todasLasEstimaciones(SRV.leer("finanzas").allegria_params);
  expect(guardadas).toHaveLength(31);
  expect(guardadas.filter(a => typeof a.id === "string" && a.id.length > 0)).toHaveLength(31);
  // las 2 preexistentes quedaron INTACTAS
  expect(guardadas.filter(a => a.id === "est_pre_1")).toHaveLength(1);
  expect(guardadas.filter(a => a.id === "est_pre_2")).toHaveLength(1);
  // meses y US$/kg sin mover
  expect(guardadas.every(a => a.usd_kg === 0.44)).toBe(true);
  expect(guardadas.filter(a => a.mes === "Nov-26").length).toBeGreaterThan(0);
  const kgCarga = SRV.leer("finanzas").allegria_params["2026-2027"].cerezas;
  expect(kgCarga.kg).toBe(850000);
  expect(kgCarga.fob_usd_kg).toBe(4.5);
  expect(kgCarga.mes_liquidacion).toBe("Mar-27");

  // el banner se retiró y la cuenta que se muestra es la de la CARGA (29), no la
  // del recálculo (que da 0 porque la memoria ya venía normalizada)
  expect(document.body.textContent).not.toMatch(/registros guardados sin identificador propio/);
  expect(document.body.textContent).toMatch(new RegExp(`${CUANTAS_SIN_ID} registros quedaron con identificador propio`));
  const ev = auditados.find(e => e && e.accion === "normalizar_identidades");
  expect(ev).toBeTruthy();
  expect(ev.cambios).toHaveLength(CUANTAS_SIN_ID);
  expect(ev.detalle).toMatch(new RegExp(`^${CUANTAS_SIN_ID} registros`));
});

// ── 2. Sin confirmación del servidor, el banner NO se retira ────────────────
test("si el servidor rechaza, el banner queda puesto con su botón y el reintento sí escribe", async () => {
  SRV = servidorFalso({
    finanzas: fila(blobFinanzas(paramsAllegria({ conIds: false }))),
    finanzas_bancos: fila({ saldos: {} }),
    finanzas_esc_index: fila({ escenarios: [] }),
  });
  SRV.estado.rechazaEscrituras = true;
  montar();
  await dejarPasar();

  // no se declaró hecho: el banner sigue, con la cuenta de la carga
  expect(document.body.textContent).toMatch(new RegExp(`${CUANTAS_SIN_ID} registros guardados sin identificador propio`));
  expect(document.body.textContent).not.toMatch(/quedaron con identificador propio/);
  // y en el servidor siguen sin id
  expect(todasLasEstimaciones(SRV.leer("finanzas").allegria_params).filter(a => !a.id))
    .toHaveLength(CUANTAS_SIN_ID);
  expect(auditados.find(e => e && e.accion === "normalizar_identidades")).toBeFalsy();

  // reintento por el botón del banner (no se reintenta solo, a propósito)
  SRV.estado.rechazaEscrituras = false;
  const boton = [...document.querySelectorAll("button")]
    .find(b => /Normalizar y guardar los identificadores/.test(b.textContent || ""));
  expect(boton).toBeTruthy();
  await act(async () => { fireEvent.click(boton); await Promise.resolve(); });
  await dejarPasar();

  const guardadas = todasLasEstimaciones(SRV.leer("finanzas").allegria_params);
  expect(guardadas.filter(a => !a.id)).toHaveLength(0);
  expect(document.body.textContent).not.toMatch(/registros guardados sin identificador propio/);
});

// ── 3. Fila ya migrada: abrir no escribe ni muestra banner ──────────────────
test("fila ya migrada: abrir no escribe nada ni muestra el banner", async () => {
  SRV = servidorFalso({
    finanzas: fila(blobFinanzas(paramsAllegria({ conIds: true }))),
    finanzas_bancos: fila({ saldos: {} }),
    finanzas_esc_index: fila({ escenarios: [] }),
  });
  montar();
  await dejarPasar();
  expect(SRV.escrituras().length).toBe(0);
  expect(document.body.textContent).not.toMatch(/sin identificador propio/);
});
