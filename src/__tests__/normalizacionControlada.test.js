/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// NORMALIZACIÓN CONTROLADA DE IDENTIFICADORES
//
// Los registros antiguos de `allegria_params` se guardaron sin `id`. Los
// normalizadores del modelo acuñaban uno NUEVO en cada render, así que una
// sustitución declarada contra ellos proyectaba el mismo dinero dos veces.
// `normalizarIdentidades` les asigna identidad UNA vez.
//
// Lo que se prueba acá es la INTEGRACIÓN con la persistencia, que es lo que el
// modelo puro no puede probar:
//   · la normalización se guarda por el contrato de concurrencia optimista;
//   · tras una carga FALLIDA no se escribe nada (Regla 9);
//   · si otra sesión escribió en el medio, NO se pisa: queda conflicto pendiente;
//   · recargar devuelve los mismos ids, montos, meses y orden;
//   · correrla de nuevo no escribe (es idempotente).
//
// Datos SINTÉTICOS con la estructura equivalente a la real: 5 temporadas × 3
// frutas, 2 estimaciones con id preexistente mezcladas y 29 sin id, y la fruta de
// carga con 850.000 kg × US$4,5/kg, con las dos estimaciones de US$0,44/kg
// (= US$374.000 cada una) sin identidad.
// Todo contra un PostgREST en memoria: ninguna petición sale a la red.
// ═══════════════════════════════════════════════════════════════════════════════
import { crearPersistencia, MOTIVOS } from "../persistencia/persistContract.js";
import { normalizarIdentidades, resumenLado } from "../programas.js";

const URL_FALSA = "https://falso.test";
const silencio = { info() {}, warn() {}, error() {} };

function servidorFalso(filasIniciales = {}) {
  const filas = { ...filasIniciales };
  const peticiones = [];
  let seq = 1;
  const estado = { modo: null };
  const resp = (body, status = 200) => ({
    ok: status >= 200 && status < 300, status,
    json: async () => body, text: async () => JSON.stringify(body),
  });
  const fetchImpl = async (url, opts = {}) => {
    const metodo = (opts.method || "GET").toUpperCase();
    const u = new URL(String(url));
    const id = decodeURIComponent((/id=eq\.([^&]+)/.exec(u.search) || [])[1] || "");
    peticiones.push({ metodo, host: u.host, id });
    if (estado.modo === "lee_mal" && metodo === "GET") throw new TypeError("Failed to fetch");
    if (metodo === "GET") {
      const f = filas[id];
      return resp(f ? [{ value: f.value, updated_at: f.updated_at }] : []);
    }
    const body = JSON.parse(opts.body || "{}");
    if (metodo === "PATCH") {
      const ver = decodeURIComponent((/updated_at=eq\.([^&]+)/.exec(u.search) || [])[1] || "");
      if (!filas[id] || filas[id].updated_at !== ver) return resp([]);  // 0 filas = conflicto
      filas[id] = { value: body.value, updated_at: `v${seq++}` };
      return resp([{ id, value: filas[id].value, updated_at: filas[id].updated_at }]);
    }
    if (metodo === "POST") {
      filas[body.id] = { value: body.value, updated_at: `v${seq++}` };
      return resp([{ id: body.id, value: filas[body.id].value, updated_at: filas[body.id].updated_at }], 201);
    }
    throw new Error("método no soportado " + metodo);
  };
  const escrituras = () => peticiones.filter(p => p.metodo !== "GET");
  const leer = (id) => { const v = filas[id] && filas[id].value; return v === undefined ? undefined : (typeof v === "string" ? JSON.parse(v) : v); };
  return { filas, fetchImpl, peticiones, escrituras, leer, estado };
}
const sesion = (srv) => crearPersistencia({ fetch: srv.fetchImpl, supaUrl: URL_FALSA, supaKey: "k", logger: silencio });

// ── Datos sintéticos con la estructura real ───────────────────────────────────
const TEMPS = ["2026-2027", "2027-2028", "2028-2029", "2029-2030", "2030-2031"];
const fruta = (extra = {}) => ({
  kg: 0, fob_usd_kg: 0, desc_exp_pct: 0, mat_usd_kg: 0, srv_usd_kg: 0,
  anticipos_cliente: [], anticipos_productor: [], mes_liquidacion: "",
  mes_saldo_productor: "", programas: [], dist_mat: [], dist_srv: [], ...extra,
});
function paramsLegado() {
  const p = {};
  TEMPS.forEach(t => { p[t] = { cerezas: fruta(), ciruelas: fruta(), arandanos: fruta() }; });
  // Temporada de carga: 850.000 kg × US$4,5. E1 CON id y cerrada; E2 y E3 SIN id.
  p["2026-2027"].cerezas = fruta({
    kg: 850000, fob_usd_kg: 4.5, desc_exp_pct: 6, mat_usd_kg: 0.5, srv_usd_kg: 1.2,
    mes_liquidacion: "Mar-27", mes_saldo_productor: "Mar-27",
    anticipos_cliente: [
      { id: "ant_sintetico_a", mes: "Sep-26", usd_kg: 0.25, cerrado: true, realizaciones: [] },
      { mes: "Nov-26", usd_kg: 0.44, realizaciones: [] },
      { mes: "Dec-26", usd_kg: 0.44, realizaciones: [] },
    ],
    anticipos_productor: [
      { mes: "Dec-26", usd_kg: 0.53, realizaciones: [] },
      { id: "ant_sintetico_b", mes: "Nov-26", usd_kg: 0.21, realizaciones: [] },
      { mes: "Sep-26", usd_kg: 0, realizaciones: [] },
    ],
  });
  // Temporadas futuras: valores que solo tienen que SOBREVIVIR intactos.
  TEMPS.slice(1).forEach((t, k) => {
    p[t].cerezas = fruta({
      kg: 0, fob_usd_kg: 0,
      anticipos_cliente: [
        { mes: `Oct-${27 + k}`, usd_kg: 1, realizaciones: [] },
        { mes: `Nov-${27 + k}`, usd_kg: 1, realizaciones: [] },
        { mes: `Dec-${27 + k}`, usd_kg: 0, realizaciones: [] },
        // La primera temporada futura trae una cuarta fila, como el dato real:
        // así el total es 31 estimaciones y 29 sin identidad.
        ...(k === 0 ? [{ mes: "Sep-27", usd_kg: 1, realizaciones: [] }] : []),
      ],
      anticipos_productor: [
        { mes: `Oct-${27 + k}`, usd_kg: 0.5, realizaciones: [] },
        { mes: `Nov-${27 + k}`, usd_kg: 0.5, realizaciones: [] },
        { mes: `Dec-${27 + k}`, usd_kg: 0.5, realizaciones: [] },
      ],
    });
  });
  return p;
}
const blobLegado = () => ({ allegria_params: paramsLegado(), params_emp: {}, sub_lines: {}, added_lines: {} });
const sinId = (params) => {
  let n = 0;
  TEMPS.forEach(t => Object.keys(params[t]).forEach(f => {
    ["anticipos_cliente", "anticipos_productor"].forEach(k =>
      (params[t][f][k] || []).forEach(e => { if (!e.id) n++; }));
  }));
  return n;
};

describe("la estructura de partida es la que se quiere probar", () => {
  test("2 estimaciones con id y 29 sin id, en 5 temporadas", () => {
    const p = paramsLegado();
    expect(sinId(p)).toBe(29);
    const conId = [];
    TEMPS.forEach(t => Object.keys(p[t]).forEach(f =>
      ["anticipos_cliente", "anticipos_productor"].forEach(k =>
        (p[t][f][k] || []).forEach(e => { if (e.id) conId.push(e.id); }))));
    expect(conId.sort()).toEqual(["ant_sintetico_a", "ant_sintetico_b"]);
  });

  test("las dos estimaciones a sustituir valen US$374.000 cada una y no tienen id", () => {
    const c = paramsLegado()["2026-2027"].cerezas;
    const kg = c.kg;
    const e2 = c.anticipos_cliente[1], e3 = c.anticipos_cliente[2];
    expect(kg * e2.usd_kg).toBeCloseTo(374000, 6);
    expect(kg * e3.usd_kg).toBeCloseTo(374000, 6);
    expect(e2.id).toBeUndefined();
    expect(e3.id).toBeUndefined();
  });
});

describe("se guarda por el contrato de concurrencia", () => {
  test("carga → normaliza → guarda confirmado → recarga: 29 ids nuevos, 2 intactos, valores y orden iguales", async () => {
    const srv = servidorFalso({ finanzas: { value: JSON.stringify(blobLegado()), updated_at: "v0" } });
    const s = sesion(srv);
    const cargado = await s.load("finanzas");
    expect(cargado.ok).toBe(true);

    const idn = normalizarIdentidades(cargado.value.allegria_params);
    expect(idn.huboCambios).toBe(true);
    expect(idn.cambios.length).toBe(29);

    const r = await s.saveConfirmed("finanzas", { ...cargado.value, allegria_params: idn.valor }, {});
    expect(r.ok).toBe(true);
    expect(srv.escrituras().length).toBe(1);

    // Recarga desde otra sesión: lo que quedó en el servidor.
    const s2 = sesion(srv);
    const vuelta = await s2.load("finanzas");
    const pv = vuelta.value.allegria_params;
    expect(sinId(pv)).toBe(0);
    const c = pv["2026-2027"].cerezas;
    expect(c.anticipos_cliente[0].id).toBe("ant_sintetico_a");
    expect(c.anticipos_productor[1].id).toBe("ant_sintetico_b");
    // Orden y valores: fila por fila, sin tocar nada más que el id.
    expect(c.anticipos_cliente.map(e => [e.mes, e.usd_kg]))
      .toEqual([["Sep-26", 0.25], ["Nov-26", 0.44], ["Dec-26", 0.44]]);
    expect(c.anticipos_productor.map(e => [e.mes, e.usd_kg]))
      .toEqual([["Dec-26", 0.53], ["Nov-26", 0.21], ["Sep-26", 0]]);
    expect(c.anticipos_cliente[0].cerrado).toBe(true);
    expect([c.kg, c.fob_usd_kg, c.desc_exp_pct, c.mat_usd_kg, c.srv_usd_kg])
      .toEqual([850000, 4.5, 6, 0.5, 1.2]);
    // Identidades únicas.
    const todos = [];
    TEMPS.forEach(t => Object.keys(pv[t]).forEach(f =>
      ["anticipos_cliente", "anticipos_productor"].forEach(k =>
        (pv[t][f][k] || []).forEach(e => todos.push(e.id)))));
    expect(new Set(todos).size).toBe(todos.length);
  });

  test("las temporadas futuras quedan idénticas salvo el id agregado", async () => {
    const srv = servidorFalso({ finanzas: { value: JSON.stringify(blobLegado()), updated_at: "v0" } });
    const s = sesion(srv);
    const cargado = await s.load("finanzas");
    const antes = paramsLegado();
    const idn = normalizarIdentidades(cargado.value.allegria_params);
    await s.saveConfirmed("finanzas", { ...cargado.value, allegria_params: idn.valor }, {});
    const pv = srv.leer("finanzas").allegria_params;
    TEMPS.slice(1).forEach(t => {
      const a = JSON.parse(JSON.stringify(antes[t].cerezas));
      const d = JSON.parse(JSON.stringify(pv[t].cerezas));
      ["anticipos_cliente", "anticipos_productor"].forEach(k => {
        expect(d[k].length).toBe(a[k].length);
        d[k].forEach((e, i) => {
          expect(e.id).toBeTruthy();                 // recibió identidad
          const { id, ...resto } = e;
          const { id: _x, ...restoA } = a[k][i];
          expect(resto).toEqual(expect.objectContaining(restoA)); // nada más cambió
        });
      });
    });
  });

  test("correrla de nuevo NO escribe: es idempotente", async () => {
    const srv = servidorFalso({ finanzas: { value: JSON.stringify(blobLegado()), updated_at: "v0" } });
    const s = sesion(srv);
    const cargado = await s.load("finanzas");
    const idn = normalizarIdentidades(cargado.value.allegria_params);
    await s.saveConfirmed("finanzas", { ...cargado.value, allegria_params: idn.valor }, {});
    const escrituras1 = srv.escrituras().length;

    const otra = normalizarIdentidades(srv.leer("finanzas").allegria_params);
    expect(otra.huboCambios).toBe(false);
    expect(otra.cambios).toEqual([]);
    // Y si se guardara igual, el guardia de "sin cambios" no emite PATCH.
    const r2 = await s.saveConfirmed("finanzas", { ...cargado.value, allegria_params: otra.valor }, {});
    expect(r2.ok).toBe(true);
    expect(srv.escrituras().length).toBe(escrituras1);
  });
});

describe("no se escribe lo que no se pudo leer", () => {
  test("tras una carga FALLIDA no se guarda nada (Regla 9)", async () => {
    const srv = servidorFalso({ finanzas: { value: JSON.stringify(blobLegado()), updated_at: "v0" } });
    srv.estado.modo = "lee_mal";
    const s = sesion(srv);
    await expect(s.load("finanzas")).rejects.toThrow();
    const r = await s.saveConfirmed("finanzas", { allegria_params: {} }, {});
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe(MOTIVOS.SIN_CARGA);
    expect(srv.escrituras().length).toBe(0);
    expect(srv.leer("finanzas").allegria_params["2026-2027"].cerezas.kg).toBe(850000);
  });
});

describe("si otra sesión escribió en el medio, la migración NO pisa", () => {
  test("queda conflicto pendiente y el servidor conserva el trabajo ajeno", async () => {
    const srv = servidorFalso({ finanzas: { value: JSON.stringify(blobLegado()), updated_at: "v0" } });
    const s1 = sesion(srv), s2 = sesion(srv);
    const c1 = await s1.load("finanzas");
    await s2.load("finanzas");

    // La otra sesión guarda un cambio real primero.
    const ajeno = JSON.parse(JSON.stringify(c1.value));
    ajeno.allegria_params["2026-2027"].cerezas.fob_usd_kg = 4.8;
    const rAjeno = await s2.saveConfirmed("finanzas", ajeno, {});
    expect(rAjeno.ok).toBe(true);

    // La migración de la primera sesión intenta guardar su versión.
    const idn = normalizarIdentidades(c1.value.allegria_params);
    const r = await s1.saveConfirmed("finanzas", { ...c1.value, allegria_params: idn.valor }, {});
    expect(r.ok).toBe(false);
    // El PRIMER conflicto se reporta como tal y deja la fila BLOQUEADA; el
    // reintento es el que ya devuelve "conflicto pendiente".
    expect([MOTIVOS.CONFLICTO, MOTIVOS.CONFLICTO_PENDIENTE]).toContain(r.motivo);
    expect(s1.conflictoPendiente("finanzas")).toBeTruthy();
    // El FOB de la otra sesión sobrevive y la migración no quedó a medias.
    expect(srv.leer("finanzas").allegria_params["2026-2027"].cerezas.fob_usd_kg).toBe(4.8);
    expect(sinId(srv.leer("finanzas").allegria_params)).toBe(29);

    // Un reintento NO escribe mientras el conflicto siga sin resolver.
    const escrituras = srv.escrituras().length;
    const r2 = await s1.saveConfirmed("finanzas", { ...c1.value, allegria_params: idn.valor }, {});
    expect(r2.motivo).toBe(MOTIVOS.CONFLICTO_PENDIENTE);
    expect(srv.escrituras().length).toBe(escrituras);

    // Recuperando el estado vigente, la migración se corre sobre ÉL y conserva el 4,8.
    const rec = await s1.recuperarDelServidor("finanzas");
    expect(rec.ok).toBe(true);
    const idn2 = normalizarIdentidades(rec.value.allegria_params);
    const r3 = await s1.saveConfirmed("finanzas", { ...rec.value, allegria_params: idn2.valor }, {});
    expect(r3.ok).toBe(true);
    const fin = srv.leer("finanzas").allegria_params;
    expect(fin["2026-2027"].cerezas.fob_usd_kg).toBe(4.8);
    expect(sinId(fin)).toBe(0);
  });
});

describe("con identidad guardada, la sustitución de US$374.000 no se duplica", () => {
  test("Nov-26 y Dec-26 sustituidas: pendientes 748.000, no 1.122.000", async () => {
    const srv = servidorFalso({ finanzas: { value: JSON.stringify(blobLegado()), updated_at: "v0" } });
    const s = sesion(srv);
    const cargado = await s.load("finanzas");
    const idn = normalizarIdentidades(cargado.value.allegria_params);
    await s.saveConfirmed("finanzas", { ...cargado.value, allegria_params: idn.valor }, {});

    // Se declaran las dos sustituciones contra los ids que quedaron guardados.
    const vuelta = (await sesion(srv).load("finanzas")).value;
    const c = vuelta.allegria_params["2026-2027"].cerezas;
    const [e1, e2, e3] = c.anticipos_cliente;
    c.programas = [{
      id: "prg_x", lado: "cliente", contraparte: "Contraparte Sintética", kilos: c.kg, cuotas: [
        { id: "cuo_1", estado: "vigente", modalidad: "monto", monto: 374000, mes: "Nov-26", v: 2,
          sustituye: [{ estimacionId: e2.id, usd: 374000 }], realizaciones: [] },
        { id: "cuo_2", estado: "vigente", modalidad: "monto", monto: 374000, mes: "Dec-26", v: 2,
          sustituye: [{ estimacionId: e3.id, usd: 374000 }], realizaciones: [] },
      ],
    }];

    const calcular = () => resumenLado({
      lado: "cliente", estimaciones: c.anticipos_cliente, programas: c.programas,
      kgFruta: c.kg, basePresupuesto: c.kg * c.fob_usd_kg, mesLiquidacion: "Mar-27",
      mesIdxActual: 6, modeloVersion: 2,
    });
    const r = calcular();
    // Cada compromiso una sola vez: 374.000 + 374.000. E1 está cerrada (no pendiente).
    expect(Math.round(r.pendientes)).toBe(748000);
    expect(Math.round(r.liquidacion)).toBe(850000 * 4.5 - 748000);   // 3.077.000
    expect(Math.round(r.sobreSustitucion || 0)).toBe(0);
    expect(r.referenciasInvalidas || []).toEqual([]);
    expect(r.cuadra).toBe(true);

    // Varias pasadas de cálculo dan lo mismo (antes cada render acuñaba otro id).
    for (let i = 0; i < 4; i++) expect(Math.round(calcular().pendientes)).toBe(748000);
    // Y tras serializar/recargar también.
    const otra = JSON.parse(JSON.stringify(c));
    const r2 = resumenLado({
      lado: "cliente", estimaciones: otra.anticipos_cliente, programas: otra.programas,
      kgFruta: otra.kg, basePresupuesto: otra.kg * otra.fob_usd_kg, mesLiquidacion: "Mar-27",
      mesIdxActual: 6, modeloVersion: 2,
    });
    expect(Math.round(r2.pendientes)).toBe(748000);
  });

  test("SIN normalizar, la misma declaración duplica: queda constancia de por qué la pantalla la bloquea", () => {
    const c = paramsLegado()["2026-2027"].cerezas;
    // Una estimación sin id da `estimacionId: ""`, que `normalizarCuota` descarta:
    // la sustitución no sustituye nada y el monto queda proyectado dos veces.
    c.programas = [{
      id: "prg_x", lado: "cliente", contraparte: "Contraparte Sintética", kilos: c.kg, cuotas: [
        { id: "cuo_1", estado: "vigente", modalidad: "monto", monto: 374000, mes: "Nov-26", v: 2,
          sustituye: [{ estimacionId: "", usd: 374000 }], realizaciones: [] },
      ],
    }];
    const r = resumenLado({
      lado: "cliente", estimaciones: c.anticipos_cliente, programas: c.programas,
      kgFruta: c.kg, basePresupuesto: c.kg * c.fob_usd_kg, mesLiquidacion: "Mar-27",
      mesIdxActual: 6, modeloVersion: 2,
    });
    // 374.000 de la cuota + 374.000 + 374.000 de las dos estimaciones = 1.122.000.
    expect(Math.round(r.pendientes)).toBe(1122000);
    // Por eso la pantalla no deja declararla: ver `ProgramasComerciales.jsx`,
    // control de sustitución bloqueado cuando la estimación no tiene identidad.
  });
});

describe("aislamiento", () => {
  test("ninguna petición sale a un host real", async () => {
    const srv = servidorFalso({ finanzas: { value: JSON.stringify(blobLegado()), updated_at: "v0" } });
    const s = sesion(srv);
    const cargado = await s.load("finanzas");
    await s.saveConfirmed("finanzas", { ...cargado.value, allegria_params: normalizarIdentidades(cargado.value.allegria_params).valor }, {});
    expect([...new Set(srv.peticiones.map(p => p.host))]).toEqual(["falso.test"]);
  });
});
