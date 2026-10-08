/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// DOS DEFECTOS DE ATRIBUCIÓN AL REASIGNAR UN MOVIMIENTO
//
// A) `moverRealizacion` conservaba el origen anterior (`movida.origen || …`),
//    así que una realización nacida en la BANDEJA (o en un antecedente)
//    seguía con ese origen al moverla desde una estimación a una cuota:
//    `estRealizadoOriginado` exige `origen.tipo === "estimacion"`, dejaba de
//    atribuirle el monto y la estimación REABRÍA su pendiente. El dinero no
//    cambiaba de total, cambiaba de MES.
//
// B) `estRealizadoOriginado` no filtraba `fueraPresupuesto`, mientras
//    `realizadoDe(delBloque)` sí lo excluye: al mover el movimiento a una
//    cuota de un programa fuera de presupuesto, la estimación lo daba por
//    consumido y el bloque ya no lo restaba. El compromiso desaparecía y la
//    liquidación subía por ese mismo monto.
//
// Los importes esperados están calculados a mano acá, no fotografiados de la
// salida. Datos sintéticos; no se toca producción.
// ═══════════════════════════════════════════════════════════════════
import {
  movimientosLado, resumenLado, estPendiente, moverRealizacion,
  aplicarMovimiento, aplicadoDeMovimiento, origenesRealizacion,
  nuevoMovimientoSinAsignar, MODELO_VERSION,
} from "../programas.js";
import { normalizarAnticipo } from "../anticipos.js";
import { mIdx } from "../horizonte.js";

const KG = 1000000, V = MODELO_VERSION;
const CORTE = mIdx("Oct-26");

const base = (extra = {}) => ({
  lado: "cliente", kgFruta: KG, mIdx, mesIdxActual: CORTE,
  modeloVersion: V, decisionesSinFecha: {}, ...extra,
});
const porMes = (opts) => {
  const { movimientos } = movimientosLado(opts);
  const out = {};
  movimientos.forEach(m => { out[m.mes] = Math.round((out[m.mes] || 0) + m.usd); });
  return out;
};
const r2 = (x) => Math.round(x);

// ── A ─────────────────────────────────────────────────────────────
describe("defecto A · mover una realización no puede cambiarla de mes", () => {
  // Estimación: 1.000.000 kg × US$0,50/kg = 500.000 en Nov-26.
  // Movimiento real de la bandeja: 400.000, aplicado a la estimación.
  // Cuota de WLH: monto 900.000 en Dec-26.
  // Base del lado: 1.500.000 · liquidación en Mar-27.
  const armar = () => {
    const est0 = { id: "e1", mes: "Nov-26", usd_kg: 0.5, v: V, realizaciones: [] };
    const prg = { id: "p1", lado: "cliente", contraparte: "WLH", kilos: KG, cuotas: [
      { id: "c1", modalidad: "monto", monto: 900000, estado: "vigente", v: V,
        mes: "Dec-26", mes_estimado: true, sustituye: [], realizaciones: [] }] };
    const mov = { ...nuevoMovimientoSinAsignar({ fecha: "2026-09-18", usd: 400000,
      referencia: "cartola 881", contraparte: "WLH", lado: "cliente", usuario: "angelo" }), id: "mv1" };
    // La plata entra por la bandeja y se aplica a la estimación: la realización
    // nace con `origen:{tipo:"bandeja"}`. Ese es el caso que rompía.
    const ap = aplicarMovimiento({ movimiento: mov, estimaciones: [est0], programas: [prg],
      usd: 400000, hacia: { tipo: "estimacion", id: "e1" }, usuario: "angelo" });
    return { mov, ...ap };
  };
  const ctx = (e, p, mov) => base({ estimaciones: e, programas: p, sinAsignar: [mov],
    basePresupuesto: 1500000, mesLiquidacion: "Mar-27" });

  test("aplicado a la estimación: Nov-26 = 100.000 (500.000 − 400.000)", () => {
    const { estimaciones, programas, mov } = armar();
    const m = porMes(ctx(estimaciones, programas, mov));
    expect(m["Nov-26"]).toBe(100000);          // 500.000 acordado − 400.000 cobrado
    expect(m["Dec-26"]).toBe(900000);          // cuota todavía sin imputar
    // 1.500.000 base − 400.000 realizado − 1.000.000 compromisos = 100.000
    expect(m["Mar-27"]).toBe(100000);
  });

  test("movido a la cuota: Nov-26 queda en 100.000 y Mar-27 en 500.000", () => {
    const a = armar();
    const mv = moverRealizacion({ estimaciones: a.estimaciones, programas: a.programas,
      reaId: a.realizacion.id, desde: { tipo: "estimacion", id: "e1" },
      hacia: { tipo: "cuota", id: "c1" }, usuario: "angelo" });
    const m = porMes(ctx(mv.estimaciones, mv.programas, a.mov));
    // A mano:
    //   estimación  500.000 − 400.000 originado        = 100.000  (Nov-26)
    //   cuota       900.000 − 400.000 imputado         = 500.000  (Dec-26)
    //   liquidación 1.500.000 − 400.000 − 600.000      = 500.000  (Mar-27)
    expect(m["Nov-26"]).toBe(100000);
    expect(m["Dec-26"]).toBe(500000);
    expect(m["Mar-27"]).toBe(500000);
    // Con el defecto eran Nov-26 = 500.000 y Mar-27 = 100.000: los mismos
    // 400.000 proyectados en el mes equivocado.
    expect(m["Nov-26"]).not.toBe(500000);
    expect(m["Mar-27"]).not.toBe(100000);
    // El total del lado no se mueve ni antes ni después: 1.500.000.
    const r = resumenLado(ctx(mv.estimaciones, mv.programas, a.mov));
    expect(r2(r.realizado + r.pendientes + r.liquidacion)).toBe(1500000);
    expect(r.cuadra).toBe(true);
  });

  test("la estimación sigue dando por consumido su pendiente, no lo reabre", () => {
    const a = armar();
    const mv = moverRealizacion({ estimaciones: a.estimaciones, programas: a.programas,
      reaId: a.realizacion.id, desde: { tipo: "estimacion", id: "e1" },
      hacia: { tipo: "cuota", id: "c1" }, usuario: "angelo" });
    expect(r2(estPendiente(normalizarAnticipo(mv.estimaciones[0]), KG, mv.programas))).toBe(100000);
  });

  test("el origen de bandeja no se pierde: el movimiento no se aplica dos veces", () => {
    const a = armar();
    const mv = moverRealizacion({ estimaciones: a.estimaciones, programas: a.programas,
      reaId: a.realizacion.id, desde: { tipo: "estimacion", id: "e1" },
      hacia: { tipo: "cuota", id: "c1" }, usuario: "angelo" });
    const rea = mv.programas[0].cuotas[0].realizaciones[0];
    expect(rea.origen).toEqual({ tipo: "estimacion", id: "e1" });
    expect(origenesRealizacion(rea)).toEqual([
      { tipo: "estimacion", id: "e1" }, { tipo: "bandeja", id: "mv1" }]);
    // Lo aplicado se sigue contando: la bandeja no vuelve a ofrecer los 400.000.
    expect(r2(aplicadoDeMovimiento("mv1", { estimaciones: mv.estimaciones, programas: mv.programas })))
      .toBe(400000);
    const r = resumenLado(base({ estimaciones: mv.estimaciones, programas: mv.programas,
      sinAsignar: [a.mov], basePresupuesto: 1500000, mesLiquidacion: "Mar-27" }));
    expect(r2(r.sinAsignarUsd)).toBe(0);
    // Y sobrevive al viaje a la base de datos.
    const viaje = (x) => JSON.parse(JSON.stringify(x));
    expect(r2(aplicadoDeMovimiento("mv1",
      { estimaciones: viaje(mv.estimaciones), programas: viaje(mv.programas) }))).toBe(400000);
  });

  test("mover sin identificar origen o destino se rechaza", () => {
    const a = armar();
    expect(() => moverRealizacion({ estimaciones: a.estimaciones, programas: a.programas,
      reaId: a.realizacion.id, desde: { tipo: "estimacion", id: "" },
      hacia: { tipo: "cuota", id: "c1" } })).toThrow(/de dónde sale/);
    expect(() => moverRealizacion({ estimaciones: a.estimaciones, programas: a.programas,
      reaId: a.realizacion.id, desde: { tipo: "estimacion", id: "e1" },
      hacia: { tipo: "cuota", id: "" } })).toThrow(/a dónde va/);
  });
});

// ── B ─────────────────────────────────────────────────────────────
describe("defecto B · fuera de presupuesto no consume una estimación presupuestada", () => {
  // Estimación: 1.000.000 kg × US$0,40/kg = 400.000 en Nov-26, ya cobrada
  // completa. Base del lado 1.000.000, liquidación en Mar-27.
  //   realizado 400.000 + pendiente 0 + liquidación 600.000 = 1.000.000
  const REA = { id: "r1", fecha: "2026-09-18", usd: 400000, nota: "cartola 881",
                usuario: "angelo", origen: { tipo: "bandeja", id: "mv1" } };
  const EST = () => [{ id: "e1", mes: "Nov-26", usd_kg: 0.4, v: V, realizaciones: [REA] }];
  const cuota = () => ({ id: "c1", modalidad: "monto", monto: 400000, estado: "vigente",
    v: V, mes: "Dec-26", mes_estimado: true, sustituye: [], realizaciones: [] });
  const prgFuera = () => [{ id: "pf", lado: "cliente", contraparte: "WLH spot", kilos: KG,
    fueraPresupuesto: true, cuotas: [cuota()] }];
  const prgArchivado = () => [{ id: "pa", lado: "cliente", contraparte: "WLH", kilos: KG,
    archivado: true, motivoArchivo: "se renegoció", cuotas: [cuota()] }];
  const ctx = (e, p) => base({ estimaciones: e, programas: p,
    basePresupuesto: 1000000, mesLiquidacion: "Mar-27" });

  test("punto de partida: liquidación 600.000", () => {
    const r = resumenLado(ctx(EST(), prgFuera()));
    expect(r2(r.realizado)).toBe(400000);
    expect(r2(r.pendientes)).toBe(0);
    expect(r2(r.liquidacion)).toBe(600000);
  });

  test("mover el movimiento a una cuota FUERA de presupuesto no infla el ingreso", () => {
    const mv = moverRealizacion({ estimaciones: EST(), programas: prgFuera(), reaId: "r1",
      desde: { tipo: "estimacion", id: "e1" }, hacia: { tipo: "cuota", id: "c1" }, usuario: "angelo" });
    const r = resumenLado(ctx(mv.estimaciones, mv.programas));
    // El dinero salió del bloque presupuestado (se informa aparte), así que el
    // COMPROMISO de la estimación vuelve a estar vivo. Lo que NO puede pasar es
    // que el compromiso desaparezca y la liquidación se quede con los 400.000:
    // esos mismos 400.000 ya están cobrados y atribuidos a la operación fuera.
    expect(r2(r.liquidacion)).toBe(600000);          // con el defecto: 1.000.000
    expect(r2(r.pendientes)).toBe(400000);           // el compromiso sigue a la vista
    expect(r2(r.realizado)).toBe(0);                 // ya no descuenta en el bloque
    expect(r2(r.realizadoFuera)).toBe(400000);       // se muestra aparte, como manda la regla
    expect(r2(estPendiente(normalizarAnticipo(mv.estimaciones[0]), KG, mv.programas))).toBe(400000);
    expect(r2(r.realizado + r.pendientes + r.liquidacion)).toBe(1000000);
    expect(r.cuadra).toBe(true);
  });

  test("ARCHIVADO es distinto: su realizado sigue descontando y la estimación sí lo da por consumido", () => {
    const mv = moverRealizacion({ estimaciones: EST(), programas: prgArchivado(), reaId: "r1",
      desde: { tipo: "estimacion", id: "e1" }, hacia: { tipo: "cuota", id: "c1" }, usuario: "angelo" });
    const r = resumenLado(ctx(mv.estimaciones, mv.programas));
    expect(r2(r.realizado)).toBe(400000);            // archivar no borra dinero
    expect(r2(r.realizadoArchivado)).toBe(400000);
    expect(r2(r.pendientes)).toBe(0);                // no se reabre: no hay doble conteo
    expect(r2(r.liquidacion)).toBe(600000);
    expect(r2(estPendiente(normalizarAnticipo(mv.estimaciones[0]), KG, mv.programas))).toBe(0);
    expect(r.cuadra).toBe(true);
  });

  test("una cuota fuera de presupuesto tampoco sustituye una estimación presupuestada", () => {
    // Sin realizado: solo la sustitución declarada. Si valiera, el compromiso
    // de 400.000 dejaría de proyectarse sin que nada ocupe su lugar en el bloque.
    const est = [{ id: "e1", mes: "Nov-26", usd_kg: 0.4, v: V, realizaciones: [] }];
    const fuera = [{ id: "pf", lado: "cliente", contraparte: "WLH spot", kilos: KG,
      fueraPresupuesto: true, cuotas: [{ ...cuota(), sustituye: [{ estimacionId: "e1", usd: 400000 }] }] }];
    const r = resumenLado(ctx(est, fuera));
    expect(r2(r.pendientes)).toBe(400000);
    expect(r2(r.liquidacion)).toBe(600000);
    expect(r2(r.sobreSustitucion)).toBe(0);
  });
});
