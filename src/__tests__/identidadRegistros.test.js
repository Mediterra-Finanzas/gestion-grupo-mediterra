/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// IDENTIDAD DE LOS REGISTROS GUARDADOS
//
// Los normalizadores corrían en cada render y en cada cálculo y acuñaban id
// (`id: base.id || uid(...)`). Un registro guardado SIN id recibía uno nuevo
// por pasada, así que una sustitución declarada contra él apuntaba a un id
// que ya no existía: la sustitución no sustituía nada, la estimación seguía
// proyectando su pendiente completo y el mismo dinero se proyectaba dos veces,
// sin ningún aviso.
//
// Ahora:
//   · los normalizadores NO acuñan identidad;
//   · lo nuevo nace con id (`nuevoId*`);
//   · lo antiguo se arregla UNA vez con `normalizarIdentidades`, determinista
//     e idempotente;
//   · una referencia a un id inexistente se muestra (`referenciasInvalidas`).
//
// DATOS SINTÉTICOS. La ESTRUCTURA es la del dato guardado (5 temporadas × 3
// frutas, estimaciones con y sin id mezcladas) porque es lo que hace válida la
// prueba; los ids y las contrapartes son inventados.
// ═══════════════════════════════════════════════════════════════════
import {
  normalizarIdentidades, referenciasInvalidas, resumenLado, movimientosLado,
  normalizarCuota, normalizarPrograma, normalizarAntecedente, normalizarSaldo,
  estPendiente, estSustituido, nuevoIdPrograma, nuevoIdCuota, MODELO_VERSION,
} from "../programas.js";
import { normalizarAnticipo, nuevoIdAnticipo } from "../anticipos.js";
import { mIdx } from "../horizonte.js";

const V = MODELO_VERSION;
const r2 = (x) => Math.round(x);
const clonar = (x) => JSON.parse(JSON.stringify(x));

// ── Fixture: la estructura del dato guardado, con cifras sintéticas ──
// Temporada que se carga: 850.000 kg, FOB US$4,5/kg → base cliente 3.825.000.
// Las dos estimaciones a sustituir (Nov y Dec, US$0,44/kg = 374.000 cada una)
// llegan SIN id; la tercera (Sep, cerrada) es la única del lado cliente con id.
const ID_A = "ant_sintetico_a";     // preexistente, lado cliente, cerrada
const ID_B = "ant_sintetico_b";     // preexistente, lado productor
const SEASONS = ["2026-2027", "2027-2028", "2028-2029", "2029-2030", "2030-2031"];

const est = (mes, usd_kg, extra = {}) => ({ mes, usd_kg, ...extra });
const fruta = (o = {}) => ({
  kg: 0, fob_usd_kg: 0, desc_exp_pct: 8,
  anticipos_cliente: [], mes_liquidacion: "",
  anticipos_productor: [], mes_saldo_productor: "",
  programas: [], mat_usd_kg: 0, srv_usd_kg: 0, dist_mat: [], dist_srv: [], ...o,
});

function paramsGuardados() {
  const p = {};
  SEASONS.forEach(sk => { p[sk] = { cerezas: fruta(), ciruelas: fruta(), arandanos: fruta(),
                                    rebate: { usdKg: 0.12, pctKilos: 100, pagos: [] } }; });
  // Temporada que se carga.
  p["2026-2027"].cerezas = fruta({
    kg: 850000, fob_usd_kg: 4.5, mes_liquidacion: "Mar-27", mes_saldo_productor: "Mar-27",
    anticipos_cliente: [
      est("Sep-26", 0.25, { id: ID_A, cerrado: true }),   // CON id, cerrada
      est("Nov-26", 0.44),                               // SIN id → 374.000
      est("Dec-26", 0.44),                               // SIN id → 374.000
    ],
    anticipos_productor: [
      est("Dec-26", 0.53),                               // SIN id
      est("Nov-26", 0.21, { id: ID_B }),                 // CON id
      est("Sep-26", 0),                                  // SIN id, US$/kg en 0
    ],
  });
  p["2026-2027"].ciruelas  = fruta({ kg: 120000, fob_usd_kg: 2.1,
    anticipos_cliente: [est("Oct-26", 0.3)], anticipos_productor: [est("Nov-26", 0.2)] });
  p["2026-2027"].arandanos = fruta({ anticipos_cliente: [est("Dec-26", 0.5)] });
  // Temporadas futuras: valores de relleno (incluidos US$/kg 1, 0,5 y 0).
  // No se interpretan ni se corrigen: solo tienen que sobrevivir intactas.
  const relleno = {
    "2027-2028": { cerezas: [["Sep-27", 1], ["Nov-27", 0.5], ["Dec-27", 1], ["Jan-28", 0]],
                   ciruelas: [["Oct-27", 0.5]], arandanos: [] },
    "2028-2029": { cerezas: [["Sep-28", 1], ["Nov-28", 0.5], ["Dec-28", 1], ["Jan-29", 0]],
                   ciruelas: [["Oct-28", 0.5]], arandanos: [] },
    "2029-2030": { cerezas: [["Sep-29", 1], ["Nov-29", 0.5], ["Dec-29", 1], ["Jan-30", 0]],
                   ciruelas: [["Oct-29", 0.5]], arandanos: [] },
    "2030-2031": { cerezas: [["Sep-30", 1], ["Nov-30", 0.5], ["Dec-30", 1], ["Jan-31", 0], ["Feb-31", 0.5]],
                   ciruelas: [["Oct-30", 0.5]], arandanos: [["Dec-30", 1]] },
  };
  Object.keys(relleno).forEach(sk => {
    ["cerezas", "ciruelas", "arandanos"].forEach(fr => {
      const filas = relleno[sk][fr];
      p[sk][fr] = fruta({ kg: 500000, fob_usd_kg: 4,
        anticipos_cliente: filas.map(([m, u]) => est(m, u)) });
    });
  });
  return p;
}

const todasLasEstimaciones = (p) => {
  const out = [];
  Object.keys(p).forEach(sk => Object.keys(p[sk]).forEach(fr => {
    const f = p[sk][fr];
    if (!f || !Array.isArray(f.anticipos_cliente)) return;
    ["anticipos_cliente", "anticipos_productor"].forEach(k =>
      (f[k] || []).forEach((e, i) => out.push({ sk, fr, k, i, e })));
  }));
  return out;
};

describe("fixture · la estructura que se va a cargar", () => {
  test("5 temporadas × 3 frutas, 31 estimaciones, 2 con id y 29 sin id", () => {
    const p = paramsGuardados();
    expect(Object.keys(p)).toEqual(SEASONS);
    SEASONS.forEach(sk => expect(Object.keys(p[sk])).toEqual(
      ["cerezas", "ciruelas", "arandanos", "rebate"]));
    const todas = todasLasEstimaciones(p);
    expect(todas.length).toBe(31);
    expect(todas.filter(x => x.e.id).map(x => x.e.id).sort()).toEqual([ID_A, ID_B]);
    expect(todas.filter(x => !x.e.id).length).toBe(29);
    // 850.000 × 0,44 = 374.000 exactos, dos veces, y las dos SIN id.
    const cli = p["2026-2027"].cerezas.anticipos_cliente;
    expect(850000 * cli[1].usd_kg).toBe(374000);
    expect(850000 * cli[2].usd_kg).toBe(374000);
    expect(cli[1].id).toBeUndefined();
    expect(cli[2].id).toBeUndefined();
  });
});

describe("los normalizadores no acuñan identidad", () => {
  test("una estimación, cuota, programa, antecedente y saldo sin id salen sin id, estable", () => {
    expect(normalizarAnticipo({ mes: "Nov-26" }).id).toBe("");
    expect(normalizarCuota({ modalidad: "monto", monto: 1 }).id).toBe("");
    expect(normalizarPrograma({ lado: "cliente" }).id).toBe("");
    expect(normalizarAntecedente({ usd: 10 }).id).toBe("");
    expect(normalizarSaldo({ usd: 10 }).id).toBe("");
    // Dos pasadas seguidas (dos renders) no inventan nada ni cambian nada.
    const a = normalizarAnticipo({ mes: "Nov-26", usd_kg: 0.44 });
    expect(normalizarAnticipo(a)).toEqual(a);
  });
  test("al crear sí nace con id", () => {
    expect(normalizarAnticipo({ id: nuevoIdAnticipo() }).id).toMatch(/^ant_/);
    expect(normalizarCuota({ id: nuevoIdCuota() }).id).toMatch(/^cuo_/);
    expect(normalizarPrograma({ id: nuevoIdPrograma() }).id).toMatch(/^prg_/);
  });
});

describe("normalizarIdentidades · una sola pasada", () => {
  test("conserva los 2 ids preexistentes y asigna los 29 que faltan, en TODAS las temporadas y frutas", () => {
    const { valor, cambios, huboCambios } = normalizarIdentidades(paramsGuardados());
    expect(huboCambios).toBe(true);
    expect(cambios.length).toBe(29);
    expect(cambios.every(c => c.de === "" && /^mig_est_/.test(c.a))).toBe(true);
    const todas = todasLasEstimaciones(valor);
    expect(todas.length).toBe(31);
    expect(todas.every(x => !!x.e.id)).toBe(true);
    expect(valor["2026-2027"].cerezas.anticipos_cliente[0].id).toBe(ID_A);
    expect(valor["2026-2027"].cerezas.anticipos_productor[1].id).toBe(ID_B);
    // Ninguna temporada ni fruta queda afuera.
    SEASONS.forEach(sk => ["cerezas", "ciruelas", "arandanos"].forEach(fr => {
      (valor[sk][fr].anticipos_cliente || []).forEach(e => expect(e.id).toBeTruthy());
      (valor[sk][fr].anticipos_productor || []).forEach(e => expect(e.id).toBeTruthy());
    }));
    // Y los ids asignados son todos distintos entre sí.
    const ids = todas.map(x => x.e.id);
    expect(new Set(ids).size).toBe(31);
  });

  test("idempotente: la segunda pasada no cambia nada", () => {
    const uno = normalizarIdentidades(paramsGuardados());
    const dos = normalizarIdentidades(uno.valor);
    expect(dos.huboCambios).toBe(false);
    expect(dos.cambios).toEqual([]);
    expect(dos.valor).toBe(uno.valor);                   // misma referencia
    expect(dos.valor).toEqual(uno.valor);
    // Tres pasadas sobre el JSON recargado tampoco mueven nada.
    const tres = normalizarIdentidades(clonar(uno.valor));
    expect(tres.huboCambios).toBe(false);
    expect(tres.valor).toEqual(uno.valor);
  });

  test("determinista: dos corridas sobre el mismo dato dan los mismos ids", () => {
    const a = normalizarIdentidades(paramsGuardados()).valor;
    const b = normalizarIdentidades(paramsGuardados()).valor;
    expect(b).toEqual(a);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  test("conserva TODO: solo cambian los `id` esperados", () => {
    const antes = paramsGuardados();
    const { valor, cambios } = normalizarIdentidades(clonar(antes));
    // Quitar los ids a los dos lados tiene que dar exactamente lo mismo.
    const sinIds = (x) => JSON.parse(JSON.stringify(x, (k, v) =>
      (k === "id" && typeof v === "string" && v.startsWith("mig_")) ? undefined : v));
    expect(sinIds(valor)).toEqual(sinIds(antes));
    // Y mes / US$/kg / cerrado / orden siguen idénticos, fila por fila.
    todasLasEstimaciones(antes).forEach(({ sk, fr, k, i, e }) => {
      const d = valor[sk][fr][k][i];
      expect(d.mes).toBe(e.mes);
      expect(d.usd_kg).toBe(e.usd_kg);
      expect(d.cerrado).toBe(e.cerrado);
      expect(Object.keys(d).filter(x => x !== "id")).toEqual(Object.keys(e).filter(x => x !== "id"));
    });
    expect(cambios.every(c => c.motivo === "registro guardado sin id")).toBe(true);
  });

  test("las temporadas futuras salen idénticas salvo el id agregado", () => {
    const antes = paramsGuardados();
    const { valor } = normalizarIdentidades(clonar(antes));
    ["2027-2028", "2028-2029", "2029-2030", "2030-2031"].forEach(sk => {
      ["cerezas", "ciruelas", "arandanos"].forEach(fr => {
        const a = clonar(antes[sk][fr]), d = clonar(valor[sk][fr]);
        (d.anticipos_cliente || []).forEach((e, i) => {
          expect(e.id).toMatch(/^mig_est_/);
          delete e.id;                                   // lo único que se agregó
          expect(e).toEqual(a.anticipos_cliente[i]);     // US$/kg 1, 0,5 y 0 incluidos
        });
        expect(d).toEqual(a);
      });
      expect(valor[sk].rebate).toEqual(antes[sk].rebate);
    });
  });

  test("el orden es parte de la identidad: se conserva, y moverlas cambia el id", () => {
    const p = paramsGuardados();
    const { valor } = normalizarIdentidades(clonar(p));
    const orden = (x, sk, fr, k) => (x[sk][fr][k] || []).map(e => `${e.mes}|${e.usd_kg}`);
    SEASONS.forEach(sk => ["cerezas", "ciruelas", "arandanos"].forEach(fr =>
      ["anticipos_cliente", "anticipos_productor"].forEach(k =>
        expect(orden(valor, sk, fr, k)).toEqual(orden(p, sk, fr, k)))));
    // Mismo contenido en otra posición = otro registro, así que otro id.
    const movido = clonar(p);
    const cli = movido["2026-2027"].cerezas.anticipos_cliente;
    [cli[1], cli[2]] = [cli[2], cli[1]];
    const v2 = normalizarIdentidades(movido).valor;
    expect(v2["2026-2027"].cerezas.anticipos_cliente[1].id)
      .not.toBe(valor["2026-2027"].cerezas.anticipos_cliente[1].id);
  });

  test("no inventa ids para lo que ya los tiene, ni los repite al desduplicar", () => {
    const p = paramsGuardados();
    p["2026-2027"].cerezas.anticipos_productor[0].id = ID_B;   // id duplicado guardado
    const { valor, cambios } = normalizarIdentidades(p);
    const prod = valor["2026-2027"].cerezas.anticipos_productor;
    expect(prod[0].id).toBe(ID_B);                             // el primero conserva el suyo
    expect(prod[1].id).not.toBe(ID_B);                         // el segundo recibe uno propio
    expect(cambios.some(c => c.motivo === "id duplicado dentro del conjunto")).toBe(true);
    expect(normalizarIdentidades(valor).huboCambios).toBe(false);
  });
});

// ── El caso antiguo sin id, de punta a punta ──────────────────────
describe("sustitución de US$374.000 contra una estimación guardada sin id", () => {
  const CTX = { lado: "cliente", kgFruta: 850000, mIdx, mesIdxActual: mIdx("Oct-26"),
                basePresupuesto: 850000 * 4.5, mesLiquidacion: "Mar-27",
                modeloVersion: 1, decisionesSinFecha: {} };

  // Carga → normalización de identidades → se declaran las dos sustituciones
  // (Nov y Dec, 374.000 cada una) con cuotas creadas CON id, como hace la app.
  const cargar = () => {
    const crudo = clonar(paramsGuardados());              // lo que trae la base
    const { valor } = normalizarIdentidades(crudo);
    const f = valor["2026-2027"].cerezas;
    const idNov = f.anticipos_cliente[1].id;
    const idDec = f.anticipos_cliente[2].id;
    const programas = [{
      id: nuevoIdPrograma(), lado: "cliente", contraparte: "Importador Sintético",
      kilos: 850000, cuotas: [
        { id: nuevoIdCuota(), modalidad: "monto", monto: 374000, estado: "vigente", v: V,
          fecha_prevista: "2026-11-20", mes: "Nov-26", sustituye: [{ estimacionId: idNov, usd: 374000 }],
          realizaciones: [] },
        { id: nuevoIdCuota(), modalidad: "monto", monto: 374000, estado: "vigente", v: V,
          fecha_prevista: "2026-12-20", mes: "Dec-26", sustituye: [{ estimacionId: idDec, usd: 374000 }],
          realizaciones: [] },
      ],
    }];
    return { valor, idNov, idDec, programas,
             estimaciones: f.anticipos_cliente };
  };
  const res = (e, pr) => resumenLado({ ...CTX, estimaciones: e, programas: pr });
  const porMes = (e, pr) => {
    const out = {};
    movimientosLado({ ...CTX, estimaciones: e, programas: pr })
      .movimientos.forEach(m => { out[m.mes] = r2((out[m.mes] || 0) + m.usd); });
    return out;
  };

  test("cada compromiso se cuenta UNA vez: Nov-26 y Dec-26 en 374.000, no 748.000", () => {
    const { estimaciones, programas } = cargar();
    const m = porMes(estimaciones, programas);
    // A mano: la estimación de Nov queda sustituida (pendiente 0) y el mes lleva
    // solo la cuota: 374.000. Con el id inestable la estimación no se enteraba
    // de la sustitución y el mes llevaba 374.000 + 374.000 = 748.000.
    expect(m["Nov-26"]).toBe(374000);
    expect(m["Dec-26"]).toBe(374000);
    expect(m["Nov-26"]).not.toBe(748000);
    expect(m["Dec-26"]).not.toBe(748000);
    const r = res(estimaciones, programas);
    expect(r2(r.pendientes)).toBe(748000);               // 374.000 + 374.000, una vez cada uno
    // 3.825.000 base − 0 realizado − 748.000 compromisos = 3.077.000
    expect(r2(r.liquidacion)).toBe(3077000);
    expect(m["Mar-27"]).toBe(3077000);
    expect(r2(r.sobreSustitucion)).toBe(0);
    expect(r.referenciasInvalidas).toEqual([]);
    expect(r.cuadra).toBe(true);
  });

  test("aguanta VARIOS renders y el viaje a la base de datos", () => {
    const { valor, idNov, programas } = cargar();
    const f = valor["2026-2027"].cerezas;
    f.programas = programas;
    const esperado = { pendientes: 748000, liquidacion: 3077000, realizado: 0 };
    const medir = (fr) => {
      const r = res(fr.anticipos_cliente, fr.programas);
      return { pendientes: r2(r.pendientes), liquidacion: r2(r.liquidacion), realizado: r2(r.realizado) };
    };
    // 4 pasadas de cálculo sobre el MISMO valor (la app normaliza en cada
    // render y en cada export).
    for (let i = 0; i < 4; i++) expect(medir(f)).toEqual(esperado);
    // Guardado y recarga: JSON de ida y vuelta + normalización otra vez.
    const recargado = normalizarIdentidades(clonar(valor));
    expect(recargado.huboCambios).toBe(false);
    const f2 = recargado.valor["2026-2027"].cerezas;
    expect(f2.anticipos_cliente[1].id).toBe(idNov);
    for (let i = 0; i < 3; i++) expect(medir(f2)).toEqual(esperado);
    // La estimación sustituida sigue en cero, no reabre nada.
    expect(r2(estSustituido(f2.anticipos_cliente[1], f2.programas))).toBe(374000);
    expect(r2(estPendiente(f2.anticipos_cliente[1], 850000, f2.programas))).toBe(0);
  });

  test("sin identidad estable el mismo dinero se proyectaba dos veces", () => {
    // Reproducción del defecto: la sustitución quedó guardada contra un id que
    // el render siguiente ya no asigna (id efímero). Nadie avisaba.
    const { estimaciones, programas } = cargar();
    const roto = clonar(programas);
    roto[0].cuotas[0].sustituye = [{ estimacionId: "ant_efimero_de_otro_render", usd: 374000 }];
    const m = porMes(estimaciones, roto);
    expect(m["Nov-26"]).toBe(748000);                    // el doble conteo
    const r = res(estimaciones, roto);
    expect(r2(r.pendientes)).toBe(1122000);
    // Ahora SÍ se avisa: la referencia inválida se declara con su monto.
    expect(r.referenciasInvalidas.length).toBe(1);
    expect(r.referenciasInvalidas[0]).toMatchObject({
      tipo: "sustitucion", clase: "estimacion", idHuerfano: "ant_efimero_de_otro_render",
      usd: 374000, vigente: true, contraparte: "Importador Sintético",
    });
    expect(r.referenciasInvalidas[0].mensaje).toMatch(/no sustituye nada/);
  });
});

describe("referenciasInvalidas · lo que apunta a nada se ve", () => {
  test("un origen huérfano se declara con su monto", () => {
    const programas = [{ id: "p1", lado: "cliente", contraparte: "Importador Sintético",
      kilos: 850000, cuotas: [{ id: "c1", modalidad: "monto", monto: 374000, estado: "vigente",
        v: V, mes: "Nov-26", sustituye: [], realizaciones: [
          { id: "r1", fecha: "2026-11-20", usd: 100000, origen: { tipo: "estimacion", id: "no_existe" } }] }] }];
    const malas = referenciasInvalidas({ estimaciones: [], programas, lado: "cliente" });
    expect(malas.length).toBe(1);
    expect(malas[0]).toMatchObject({ tipo: "origen", clase: "estimacion",
      idHuerfano: "no_existe", usd: 100000, cuotaId: "c1" });
  });
  test("un origen que sí existe no se reporta", () => {
    const estimaciones = [{ id: "e1", mes: "Nov-26", usd_kg: 0.44 }];
    const programas = [{ id: "p1", lado: "cliente", contraparte: "x", kilos: 850000,
      cuotas: [{ id: "c1", modalidad: "monto", monto: 1, estado: "vigente", v: V, mes: "Nov-26",
        realizaciones: [{ id: "r1", usd: 1, origen: { tipo: "estimacion", id: "e1" } }] }] }];
    expect(referenciasInvalidas({ estimaciones, programas, lado: "cliente" })).toEqual([]);
  });
});
