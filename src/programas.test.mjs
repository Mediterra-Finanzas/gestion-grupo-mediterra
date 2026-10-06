/* eslint-disable */
// Tests del modelo de liquidación con anticipos — ejecutar:
//   node src/programas.test.mjs
//
// DATOS SINTÉTICOS. Ninguna contraparte, kilo ni importe corresponde a un
// acuerdo real de Allegria Foods.
import {
  normalizarPrograma, normalizarCuota, cuotaAcordado, cuotaPendiente, cuotaRealizado,
  estAcordado, estPendiente, estDisponible, estSobreSustituida, estRealizadoOriginado,
  resumenLado, movimientosLado, efectoImputacion, imputarMovimiento,
  moverRealizacion, archivarPrograma, tieneHistorial,
  nuevoMovimientoSinAsignar, puedeAplicar, esDato,
} from "./programas.js";
import { agregarRealizacion, anularRealizacion } from "./anticipos.js";

let fallos = 0;
const aprox = (a, b, tol = 0.005) => Math.abs(a - b) <= tol;
function check(nombre, cond, extra = "") {
  console.log(`${cond ? "✓" : "✗ FALLA"}  ${nombre}${extra ? "  — " + extra : ""}`);
  if (!cond) fallos++;
}
const MESES = ["Jul-26","Aug-26","Sep-26","Oct-26","Nov-26","Dec-26","Jan-27","Feb-27","Mar-27"];
const mIdx = (m) => MESES.indexOf(m);
const est = (o) => ({ id: "e1", mes: "Nov-26", realizaciones: [], ...o });
const rea = (id, fecha, usd, extra = {}) => ({ id, fecha, usd, nota: "", ...extra });

// Lado con base presupuestaria; helper para no repetir
const lado = (o = {}) => resumenLado({
  lado: "cliente", kgFruta: 0, basePresupuesto: 1000000,
  mIdx, mesIdxActual: mIdx("Oct-26"), mesLiquidacion: "Mar-27", ...o,
});

// ═══ 1. Identidad del saldo ════════════════════════════════════════
{
  // Venta 500.000 · recibidos 100.000 · pendientes futuros 50.000
  const e = est({ monto: 150000, realizaciones: [rea("r1", "2026-08-01", 100000)] });
  const r = resumenLado({ estimaciones: [e], basePresupuesto: 500000, mIdx, mesIdxActual: 0 });
  check("(1) realizado 100.000", aprox(r.realizado, 100000));
  check("(2) pendientes 50.000", aprox(r.pendientes, 50000));
  check("(3) liquidación 350.000", aprox(r.liquidacion, 350000), `${r.liquidacion}`);
  check("(4) saldo total 400.000 = 50.000 + 350.000", aprox(r.saldoTotal, 400000));
}
{
  // Al cobrarse el pendiente, pasa a realizado y la liquidación NO se mueve
  const e = est({ monto: 150000, realizaciones: [rea("r1","2026-08-01",100000), rea("r2","2026-11-01",50000)] });
  const r = resumenLado({ estimaciones: [e], basePresupuesto: 500000, mIdx, mesIdxActual: 0 });
  check("(5) realizado 150.000 · pendientes 0", aprox(r.realizado, 150000) && aprox(r.pendientes, 0));
  check("(6) la liquidación sigue en 350.000", aprox(r.liquidacion, 350000), `${r.liquidacion}`);
  check("(7) saldo total 350.000", aprox(r.saldoTotal, 350000));
}

// ═══ 2. Un movimiento descuenta aunque no haya cuota ni programa ═══
{
  const sin = est({ monto: 0, realizaciones: [rea("r1","2026-07-15",80000)] });
  const r = resumenLado({ estimaciones: [sin], basePresupuesto: 500000, mIdx, mesIdxActual: 0 });
  check("(8) un cobro sin calendario descuenta igual",
    aprox(r.realizado, 80000) && aprox(r.liquidacion, 420000));
}
{
  // Supera lo acordado: el exceso no se pierde ni se recorta
  const e = est({ monto: 50000, realizaciones: [rea("r1","2026-07-15",80000)] });
  const r = resumenLado({ estimaciones: [e], basePresupuesto: 500000, mIdx, mesIdxActual: 0 });
  check("(9) cobrado > acordado: pendiente 0 y descuenta lo realizado",
    aprox(r.pendientes, 0) && aprox(r.realizado, 80000) && aprox(r.liquidacion, 420000));
}

// ═══ 3. Ejemplo A — imputar no modifica el acuerdo ═════════════════
// Presupuesto 1.000.000 · estimación 100.000 en Nov · cobrado 10.000
{
  const base = () => est({ monto: 100000, realizaciones: [rea("r1","2026-08-20",10000)] });
  const r0 = lado({ estimaciones: [base()] });
  check("(10) A0 · cobrado 10.000 · estimado 90.000 · liquidación 900.000",
    aprox(r0.realizado,10000) && aprox(r0.pendienteEstimado,90000) && aprox(r0.liquidacion,900000));

  // Lectura 1: el programa acuerda 40.000 TOTALES, incluidos los 10.000.
  const cuotaInc = normalizarCuota({ id:"c1", mes:"Oct-26", modalidad:"monto", monto:40000,
    estado:"vigente", sustituye:[{estimacionId:"e1", usd:30000}],
    realizaciones:[rea("r1","2026-08-20",10000,{origen:{tipo:"estimacion",id:"e1"}})] });
  const p1 = normalizarPrograma({ id:"p1", lado:"cliente", contraparte:"Cliente A", cuotas:[cuotaInc] });
  const estSinRea = est({ monto:100000, realizaciones: [] });   // el cobro se movió a la cuota
  const r1 = lado({ estimaciones:[estSinRea], programas:[p1] });
  check("(11) A1 incluido · cobrado 10.000", aprox(r1.realizado, 10000));
  check("(12) A1 incluido · estimado 60.000", aprox(r1.pendienteEstimado, 60000), `${r1.pendienteEstimado}`);
  check("(13) A1 incluido · calendarizado 30.000", aprox(r1.pendienteCalendarizado, 30000), `${r1.pendienteCalendarizado}`);
  check("(14) A1 incluido · liquidación 900.000", aprox(r1.liquidacion, 900000), `${r1.liquidacion}`);

  // Lectura 2: sustituye 40.000 PENDIENTES y además incluye los 10.000 → total 50.000
  const cuotaAd = normalizarCuota({ ...cuotaInc, monto:50000, sustituye:[{estimacionId:"e1", usd:40000}] });
  const p2 = normalizarPrograma({ id:"p1", lado:"cliente", contraparte:"Cliente A", cuotas:[cuotaAd] });
  const r2 = lado({ estimaciones:[estSinRea], programas:[p2] });
  check("(15) A2 adicional · estimado 50.000", aprox(r2.pendienteEstimado, 50000), `${r2.pendienteEstimado}`);
  check("(16) A2 adicional · calendarizado 40.000", aprox(r2.pendienteCalendarizado, 40000));
  check("(17) A2 adicional · liquidación 900.000, igual que la otra lectura", aprox(r2.liquidacion, 900000));
  check("(18) los dos cuadran contra el presupuesto",
    aprox(r1.realizado + r1.pendientes + r1.liquidacion, 1000000) &&
    aprox(r2.realizado + r2.pendientes + r2.liquidacion, 1000000));
}

// ═══ 4. Efecto de la imputación, antes de confirmar ════════════════
{
  const c = normalizarCuota({ id:"c1", modalidad:"monto", monto:40000, estado:"vigente" });
  const inc = efectoImputacion({ cuota:c, kilosPrograma:null, usd:10000, incluido:true });
  const adi = efectoImputacion({ cuota:c, kilosPrograma:null, usd:10000, incluido:false });
  check("(19) incluido: el total no cambia y el pendiente baja",
    inc.acordadoDespues === 40000 && inc.pendienteDespues === 30000 && inc.deltaPendiente === -10000);
  check("(20) adicional: el total sube y el pendiente se conserva",
    adi.acordadoDespues === 50000 && adi.pendienteDespues === 40000 && adi.deltaPendiente === 0);

  const cInc = imputarMovimiento(c, null, { fecha:"2026-08-20", usd:10000, incluido:true });
  const cAdi = imputarMovimiento(c, null, { fecha:"2026-08-20", usd:10000, incluido:false });
  check("(21) imputar incluido deja pendiente 30.000", aprox(cuotaPendiente(cInc, null), 30000));
  check("(22) imputar adicional deja pendiente 40.000 y acordado 50.000",
    aprox(cuotaPendiente(cAdi, null), 40000) && aprox(cuotaAcordado(cAdi, null).valor, 50000));
  check("(23) la tarifa/monto pactado no se toca", cAdi.monto === 40000 && cAdi.extra_acordado === 10000);
}

// ═══ 5. Ejemplo B — borrador, vigencia y reversión ═════════════════
{
  const estB = est({ id:"e1", monto:100000, realizaciones:[] });
  const cA = normalizarCuota({ id:"cA", mes:"Oct-26", modalidad:"monto", monto:40000, estado:"vigente",
    sustituye:[{estimacionId:"e1", usd:30000}],
    realizaciones:[rea("r1","2026-08-20",10000,{origen:{tipo:"estimacion",id:"e1"}})] });
  const pA = normalizarPrograma({ id:"pA", lado:"cliente", contraparte:"A", cuotas:[cA] });
  const mk = (estadoEne, reaEne) => normalizarPrograma({ id:"pB", lado:"cliente", contraparte:"B", cuotas:[
    normalizarCuota({ id:"cB1", mes:"Nov-26", modalidad:"monto", monto:15000, estado:"vigente",
                      sustituye:[{estimacionId:"e1", usd:15000}] }),
    normalizarCuota({ id:"cB2", mes:"Jan-27", modalidad:"monto", monto:25000, estado:estadoEne,
                      sustituye:[{estimacionId:"e1", usd:25000}], realizaciones: reaEne || [] }),
    normalizarCuota({ id:"cB3", mes:"Feb-27", modalidad:"monto", monto:10000, estado:"borrador",
                      sustituye:[{estimacionId:"e1", usd:10000}] }),
  ]});

  const b1 = lado({ estimaciones:[estB], programas:[pA, mk("borrador")] });
  check("(24) B1 · estimado 45.000 · calendarizado 45.000 · liquidación 900.000",
    aprox(b1.pendienteEstimado,45000) && aprox(b1.pendienteCalendarizado,45000) && aprox(b1.liquidacion,900000),
    `${b1.pendienteEstimado}/${b1.pendienteCalendarizado}/${b1.liquidacion}`);

  // B2a · el cobro de 5.000 cumple la cuota en BORRADOR
  const b2a = lado({ estimaciones:[estB], programas:[pA, mk("borrador",[rea("r5","2026-12-20",5000)])] });
  check("(25) B2a · realizado 15.000 · estimado 45.000 · calendarizado 45.000",
    aprox(b2a.realizado,15000) && aprox(b2a.pendienteEstimado,45000) && aprox(b2a.pendienteCalendarizado,45000),
    `${b2a.realizado}/${b2a.pendienteEstimado}/${b2a.pendienteCalendarizado}`);
  check("(26) B2a · el realizado del borrador descuenta igual", aprox(b2a.liquidacion, 895000), `${b2a.liquidacion}`);

  // B2b · el mismo cobro declarado sobre la ESTIMACIÓN
  const estConRea = est({ id:"e1", monto:100000, realizaciones:[rea("r5","2026-12-20",5000)] });
  const b2b = lado({ estimaciones:[estConRea], programas:[pA, mk("borrador")] });
  check("(27) B2b · baja la estimación en vez de la cuota",
    aprox(b2b.pendienteEstimado,40000) && aprox(b2b.pendienteCalendarizado,45000) && aprox(b2b.realizado,15000),
    `${b2b.pendienteEstimado}/${b2b.pendienteCalendarizado}`);

  // B3 · la cuota de enero pasa a vigente
  const b3 = lado({ estimaciones:[estB], programas:[pA, mk("vigente",[rea("r5","2026-12-20",5000)])] });
  check("(28) B3 · estimado 20.000 · calendarizado 65.000",
    aprox(b3.pendienteEstimado,20000) && aprox(b3.pendienteCalendarizado,65000),
    `${b3.pendienteEstimado}/${b3.pendienteCalendarizado}`);

  // B4 · vuelve a borrador: la estimación recupera 25.000, no 30.000
  const b4 = lado({ estimaciones:[estB], programas:[pA, mk("borrador",[rea("r5","2026-12-20",5000)])] });
  check("(29) B4 · vuelve exactamente a B2a",
    aprox(b4.pendienteEstimado,45000) && aprox(b4.pendienteCalendarizado,45000) &&
    aprox(b4.realizado,15000) && aprox(b4.liquidacion,895000));
  check("(30) y los 5.000 cobrados no resucitan como pendiente",
    aprox(b4.realizado + b4.pendientes + b4.liquidacion, 1000000));
}

// ═══ 6. Mover una realización no reabre el pendiente de origen ═════
{
  const e = est({ id:"e1", monto:100000, realizaciones:[rea("r1","2026-08-20",10000)] });
  const c = normalizarCuota({ id:"c1", mes:"Oct-26", modalidad:"monto", monto:40000, estado:"vigente",
                              sustituye:[{estimacionId:"e1", usd:30000}] });
  const p = normalizarPrograma({ id:"p1", lado:"cliente", contraparte:"A", cuotas:[c] });

  const antes = lado({ estimaciones:[e], programas:[p] });
  const mv = moverRealizacion({ estimaciones:[e], programas:[p], reaId:"r1",
    desde:{tipo:"estimacion", id:"e1"}, hacia:{tipo:"cuota", id:"c1"}, usuario:"qa" });
  const despues = lado({ estimaciones:mv.estimaciones, programas:mv.programas });

  check("(31) la realización cambió de contenedor, no se copió",
    mv.estimaciones[0].realizaciones.length === 0 &&
    mv.programas[0].cuotas[0].realizaciones.length === 1 &&
    mv.programas[0].cuotas[0].realizaciones[0].id === "r1");
  check("(32) conserva su identidad y guarda de dónde viene",
    mv.movida.origen.tipo === "estimacion" && mv.movida.origen.id === "e1" && mv.movida.movidaPor === "qa");
  check("(33) el realizado global no cambia", aprox(antes.realizado, despues.realizado));
  check("(34) la estimación NO reabre los 10.000",
    aprox(antes.pendienteEstimado, despues.pendienteEstimado), `${antes.pendienteEstimado} vs ${despues.pendienteEstimado}`);
  check("(35) el realizado originado sigue contándose en la estimación",
    aprox(estRealizadoOriginado(mv.estimaciones[0], mv.programas), 10000));
}

// ═══ 7. Anular quita el efecto en todo ═════════════════════════════
{
  const e0 = est({ id:"e1", monto:100000, realizaciones:[rea("r1","2026-08-20",10000)] });
  const e1 = anularRealizacion(e0, "r1", { motivo:"cartola equivocada", usuario:"qa" });
  const r = lado({ estimaciones:[e1] });
  check("(36) anulada: no cuenta en el realizado", aprox(r.realizado, 0));
  check("(37) y la estimación recupera su capacidad", aprox(r.pendienteEstimado, 100000));
  check("(38) el historial queda", (e1.realizaciones || []).length === 1 && e1.realizaciones[0].anulada === true);
}

// ═══ 8. Sobre-sustitución: se detecta, no se recorta ═══════════════
{
  const e = est({ id:"e1", monto:50000, realizaciones:[] });
  const c = normalizarCuota({ id:"c1", mes:"Oct-26", modalidad:"monto", monto:80000, estado:"vigente",
                              sustituye:[{estimacionId:"e1", usd:80000}] });
  const p = normalizarPrograma({ id:"p1", lado:"cliente", cuotas:[c] });
  const r = lado({ estimaciones:[e], programas:[p] });
  check("(39) la estimación no proyecta y el exceso queda a la vista",
    aprox(r.pendienteEstimado, 0) && aprox(r.sobreSustitucion, 30000), `${r.sobreSustitucion}`);
  check("(40) disponible para sustituir = 0", aprox(estDisponible(e, 0, [p]), 0));
}
{
  const e = est({ id:"e1", monto:100000, realizaciones:[rea("r1","2026-08-01",10000)] });
  check("(41) disponible descuenta lo ya cobrado", aprox(estDisponible(e, 0, []), 90000));
  const cerrada = est({ id:"e2", monto:100000, cerrado:true });
  check("(42) una estimación cerrada no se puede sustituir", aprox(estDisponible(cerrada, 0, []), 0));
}

// ═══ 9. Fuera de presupuesto ═══════════════════════════════════════
{
  const p = normalizarPrograma({ id:"pX", lado:"cliente", contraparte:"Nuevo", fueraPresupuesto:true,
    cuotas:[ normalizarCuota({ id:"cx", mes:"Nov-26", modalidad:"monto", monto:60000, estado:"vigente",
                               realizaciones:[rea("rx","2026-09-01",20000)] }) ]});
  const r = lado({ estimaciones:[], programas:[p] });
  check("(43) no proyecta ni descuenta de la liquidación presupuestada",
    aprox(r.pendientes, 0) && aprox(r.realizado, 0) && aprox(r.liquidacion, 1000000));
  check("(44) pero su dinero real se muestra aparte", aprox(r.realizadoFuera, 20000));
}

// ═══ 10. Archivar conserva historial ═══════════════════════════════
{
  const c = normalizarCuota({ id:"c1", mes:"Oct-26", modalidad:"monto", monto:40000, estado:"vigente",
    sustituye:[{estimacionId:"e1", usd:40000}], realizaciones:[rea("r1","2026-08-20",10000)] });
  const p = normalizarPrograma({ id:"p1", lado:"cliente", contraparte:"A", cuotas:[c] });
  const e = est({ id:"e1", monto:100000, realizaciones:[] });
  check("(45) un programa con historial no se puede borrar", tieneHistorial(p) === true);
  let err = null; try { archivarPrograma(p, { motivo:"" }); } catch (x) { err = x; }
  check("(46) archivar exige motivo", !!err);
  const arch = archivarPrograma(p, { motivo:"acuerdo anulado", usuario:"qa" });
  const r = lado({ estimaciones:[e], programas:[arch] });
  check("(47) archivado: la estimación recupera su pendiente", aprox(r.pendienteEstimado, 100000));
  check("(48) y las realizaciones no se pierden",
    arch.cuotas[0].realizaciones.length === 1 && arch.motivoArchivo === "acuerdo anulado");
}

// ═══ 11. Vencido aparte del futuro ═════════════════════════════════
{
  const e1 = est({ id:"e1", mes:"Aug-26", monto:30000 });     // anterior al corte
  const e2 = est({ id:"e2", mes:"Nov-26", monto:50000 });     // futuro
  const r = lado({ estimaciones:[e1, e2] });
  check("(49) el pendiente vencido no se suma al futuro",
    aprox(r.pendienteVencido, 30000) && aprox(r.pendienteFuturo, 50000) && r.vencidos.length === 1);
  check("(50) pero sigue dentro del saldo total por cobrar", aprox(r.pendientes, 80000));
}

// ═══ 12. Sin mes: no proyecta y no descuenta ═══════════════════════
{
  const e = est({ id:"e1", mes:"", monto:40000 });
  const r = lado({ estimaciones:[e] });
  check("(51) sin mes: no proyecta, se cobra en la liquidación",
    aprox(r.pendienteSinMes, 40000) && aprox(r.pendientes, 0) && aprox(r.liquidacion, 1000000));
}

// ═══ 13. Movimientos al flujo ══════════════════════════════════════
{
  const e = est({ id:"e1", mes:"Nov-26", monto:60000 });
  const c = normalizarCuota({ id:"c1", mes:"Oct-26", modalidad:"monto", monto:40000, estado:"vigente" });
  const p = normalizarPrograma({ id:"p1", lado:"cliente", contraparte:"A", cuotas:[c] });
  const { movimientos, resumen } = movimientosLado({ estimaciones:[e], programas:[p],
    basePresupuesto:1000000, mIdx, mesIdxActual:mIdx("Oct-26"), mesLiquidacion:"Mar-27" });
  const porMes = (m) => movimientos.filter(x => x.mes === m).reduce((s,x)=>s+x.usd,0);
  check("(52) cada pendiente en su mes", aprox(porMes("Oct-26"),40000) && aprox(porMes("Nov-26"),60000));
  check("(53) la liquidación en su mes", aprox(porMes("Mar-27"), 900000));
  check("(54) el total proyectado = base − realizado",
    aprox(movimientos.reduce((s,m)=>s+m.usd,0), 1000000 - resumen.realizado));
}

// ═══ 14. Liquidación definitiva ════════════════════════════════════
{
  // acordado 150.000 con 100.000 cobrados → 50.000 de pendiente
  const e = est({ id:"e1", mes:"Nov-26", monto:150000, realizaciones:[rea("r1","2026-08-01",100000)] });
  const r = resumenLado({ estimaciones:[e], basePresupuesto:500000,
    liquidacionDefinitiva:{ total:520000 }, mIdx, mesIdxActual:0 });
  check("(55) la definitiva reemplaza la base", aprox(r.base, 520000));
  check("(56) liquidación = definitiva − realizado − pendientes", aprox(r.liquidacion, 520000-100000-50000));
  check("(57) y conserva el presupuesto para la variación",
    aprox(r.basePresupuesto, 500000) && aprox(r.variacionBase, 20000));
}

// ═══ 15. Excedente explícito ═══════════════════════════════════════
{
  // se anticipó más que el total de la operación
  const e = est({ id:"e1", mes:"Nov-26", monto:200000, realizaciones:[rea("r1","2026-08-01",400000)] });
  const r = resumenLado({ estimaciones:[e], basePresupuesto:300000, mIdx, mesIdxActual:0 });
  // 400.000 cobrados contra una base de 300.000 → excedente REAL de 100.000.
  // El campo mezclado `excedente` se retiró: la regla prohíbe sumar excedente
  // real con exceso de compromisos.
  check("(58) liquidación 0 y excedente REAL a la vista",
    aprox(r.liquidacion, 0) && aprox(r.excedenteReal, 100000) &&
    aprox(r.excesoCompromisos, 0) && r.excedente === undefined,
    `real=${r.excedenteReal} exceso=${r.excesoCompromisos} mezclado=${r.excedente}`);
}

// ═══ 16. Bandeja de conciliación ═══════════════════════════════════
{
  const m = nuevoMovimientoSinAsignar({ fecha:"2026-07-15", usd:50000, referencia:"cartola 123" });
  const r = lado({ estimaciones:[], sinAsignar:[m] });
  check("(59) un movimiento sin asignar no descuenta de ninguna liquidación",
    aprox(r.realizado, 0) && aprox(r.liquidacion, 1000000) && aprox(r.sinAsignarUsd, 50000));
  check("(60) no se puede aplicar más de su monto",
    puedeAplicar(m, 50000) === true && puedeAplicar(m, 50001) === false);
  let err = null; try { nuevoMovimientoSinAsignar({ usd:100 }); } catch (e2) { err = e2; }
  check("(61) un movimiento sin fecha real no se registra", !!err);
}

// ═══ 17. Ejemplo completo CLIENTE ══════════════════════════════════
{
  const BASE = 500000;
  const paso = (estimaciones, programas, definitiva) => resumenLado({
    estimaciones, programas, basePresupuesto: BASE, liquidacionDefinitiva: definitiva || null,
    mIdx, mesIdxActual: mIdx("Oct-26"), lado:"cliente" });

  let e = est({ id:"e1", mes:"Nov-26", monto:100000, realizaciones:[] });
  let r = paso([e], []);
  check("(62) C0 · estimado 100.000 · liquidación 400.000",
    aprox(r.pendienteEstimado,100000) && aprox(r.liquidacion,400000) && aprox(r.saldoTotal,500000));

  e = agregarRealizacion(e, { fecha:"2026-07-15", usd:60000 });
  r = paso([e], []);
  check("(63) C1 · cobrado 60.000 · estimado 40.000 · liquidación 400.000",
    aprox(r.realizado,60000) && aprox(r.pendienteEstimado,40000) && aprox(r.liquidacion,400000) && aprox(r.saldoTotal,440000));

  const pA = normalizarPrograma({ id:"pA", lado:"cliente", contraparte:"Cliente A", cuotas:[
    normalizarCuota({ id:"ca1", mes:"Oct-26", modalidad:"monto", monto:50000, estado:"vigente",
                      sustituye:[{estimacionId:"e1", usd:40000}] }),
    normalizarCuota({ id:"ca2", mes:"Dec-26", modalidad:"monto", monto:50000, estado:"vigente" }),
  ]});
  r = paso([e], [pA]);
  check("(64) C2 · estimado 0 · calendarizado 100.000 · liquidación 340.000",
    aprox(r.pendienteEstimado,0) && aprox(r.pendienteCalendarizado,100000) &&
    aprox(r.liquidacion,340000) && aprox(r.saldoTotal,440000), `${r.liquidacion}`);

  const pA3 = { ...pA, cuotas:[ imputarMovimiento(pA.cuotas[0], null,
      { fecha:"2026-10-10", usd:30000, incluido:true }), pA.cuotas[1] ] };
  r = paso([e], [pA3]);
  check("(65) C3 · cobrado 90.000 · calendarizado 70.000 · liquidación 340.000",
    aprox(r.realizado,90000) && aprox(r.pendienteCalendarizado,70000) &&
    aprox(r.liquidacion,340000) && aprox(r.saldoTotal,410000));

  // C4 · anticipo adicional realmente adicional
  const pA4 = { ...pA3, cuotas:[ pA3.cuotas[0], imputarMovimiento(pA3.cuotas[1], null,
      { fecha:"2026-11-05", usd:20000, incluido:false }), ] };
  r = paso([e], [pA4]);
  check("(66) C4 adicional · cobrado 110.000 · pendientes 70.000 · liquidación 320.000",
    aprox(r.realizado,110000) && aprox(r.pendientes,70000) &&
    aprox(r.liquidacion,320000) && aprox(r.saldoTotal,390000), `${r.liquidacion}`);

  // C4bis · el mismo monto, declarado como pago de la cuota existente
  const pA4b = { ...pA3, cuotas:[ pA3.cuotas[0], imputarMovimiento(pA3.cuotas[1], null,
      { fecha:"2026-11-05", usd:20000, incluido:true }), ] };
  const rb = paso([e], [pA4b]);
  check("(67) C4bis incluido · pendientes 50.000 · liquidación 340.000",
    aprox(rb.realizado,110000) && aprox(rb.pendientes,50000) &&
    aprox(rb.liquidacion,340000) && aprox(rb.saldoTotal,390000), `${rb.liquidacion}`);

  // C5 · liquidación definitiva 520.000
  r = paso([e], [pA4], { total:520000 });
  check("(68) C5 · definitiva 520.000 → liquidación 340.000 y variación +20.000",
    aprox(r.liquidacion,340000) && aprox(r.variacionBase,20000), `${r.liquidacion}`);
}

// ═══ 18. Ejemplo completo PRODUCTOR ════════════════════════════════
// kg 100.000 · FOB 4,00 · desc 6% · mat 0,50 · srv 1,20 → neto 2,06 → 206.000
{
  const KG = 100000, FOB = 4, DESC = 0.06, MAT = 0.5, SRV = 1.2;
  const neto = Math.max(0, FOB * (1 - DESC) - MAT - SRV);
  check("(69) precio neto productor 2,06", aprox(neto, 2.06), `${neto}`);
  const BASE = KG * neto;
  check("(70) retorno al productor 206.000", aprox(BASE, 206000));

  const paso = (estimaciones, programas, definitiva) => resumenLado({
    estimaciones, programas, lado:"productor", basePresupuesto: BASE,
    liquidacionDefinitiva: definitiva || null, mIdx, mesIdxActual: mIdx("Oct-26") });

  let e = est({ id:"ep", mes:"Dec-26", monto:60000, realizaciones:[] });
  let r = paso([e], []);
  check("(71) P0 · estimado 60.000 · saldo productor 146.000",
    aprox(r.pendienteEstimado,60000) && aprox(r.liquidacion,146000) && aprox(r.saldoTotal,206000));

  e = agregarRealizacion(e, { fecha:"2026-08-20", usd:25000 });
  r = paso([e], []);
  check("(72) P1 · pagado 25.000 · estimado 35.000 · saldo 146.000",
    aprox(r.realizado,25000) && aprox(r.pendienteEstimado,35000) &&
    aprox(r.liquidacion,146000) && aprox(r.saldoTotal,181000));

  // P2 · programa con total 80.000 que imputa los 25.000 ya pagados
  const mv = moverRealizacion({ estimaciones:[e], programas:[normalizarPrograma({
      id:"pp", lado:"productor", contraparte:"Productor P", cuotas:[
        normalizarCuota({ id:"cp1", mes:"Nov-26", modalidad:"monto", monto:80000, estado:"vigente",
                          sustituye:[{estimacionId:"ep", usd:35000}] })]})],
    reaId: e.realizaciones[0].id, desde:{tipo:"estimacion", id:"ep"}, hacia:{tipo:"cuota", id:"cp1"} });
  r = paso(mv.estimaciones, mv.programas);
  check("(73) P2 · pagado 25.000 · estimado 0 · calendarizado 55.000 · saldo productor 126.000",
    aprox(r.realizado,25000) && aprox(r.pendienteEstimado,0) &&
    aprox(r.pendienteCalendarizado,55000) && aprox(r.liquidacion,126000) && aprox(r.saldoTotal,181000),
    `${r.pendienteCalendarizado}/${r.liquidacion}`);

  // P3 · pago parcial de 30.000 sobre la cuota
  const progs3 = mv.programas.map(p => ({ ...p, cuotas:[ imputarMovimiento(p.cuotas[0], p.kilos,
    { fecha:"2026-11-10", usd:30000, incluido:true }) ]}));
  r = paso(mv.estimaciones, progs3);
  check("(74) P3 · pagado 55.000 · calendarizado 25.000 · saldo 126.000",
    aprox(r.realizado,55000) && aprox(r.pendienteCalendarizado,25000) &&
    aprox(r.liquidacion,126000) && aprox(r.saldoTotal,151000));

  // P4 · anticipo adicional pagado 15.000
  const progs4 = progs3.map(p => ({ ...p, cuotas:[ imputarMovimiento(p.cuotas[0], p.kilos,
    { fecha:"2026-12-01", usd:15000, incluido:false }) ]}));
  r = paso(mv.estimaciones, progs4);
  check("(75) P4 adicional · pagado 70.000 · calendarizado 25.000 · saldo productor 111.000",
    aprox(r.realizado,70000) && aprox(r.pendienteCalendarizado,25000) &&
    aprox(r.liquidacion,111000) && aprox(r.saldoTotal,136000), `${r.liquidacion}`);

  // P5 · definitiva con 95.000 kg reales
  const definitiva = { total: 95000 * neto };
  r = paso(mv.estimaciones, progs4, definitiva);
  check("(76) P5 · definitiva 195.700 → saldo productor 100.700",
    aprox(r.base,195700) && aprox(r.liquidacion,100700) && aprox(r.variacionBase,-10300), `${r.liquidacion}`);
}


// ═══════════════════════════════════════════════════════════════════
// ETAPA 2 · FECHAS, POSICIONES, COMPATIBILIDAD Y SALDOS A FAVOR
//
// El horizonte y el corte salen de src/horizonte.js, no de un mes fijado
// a mano: si la app cambia su horizonte, estas pruebas lo siguen.
// ═══════════════════════════════════════════════════════════════════
import { MESES as HORIZONTE, mIdx as mIdxReal, mesIdxActual as cortReal, mesActual } from "./horizonte.js";
import {
  cuadrePosicion, cubetaTemporal, esItemLegacy, tratoSinFecha,
  registrarDecisionSinFecha, MODELO_VERSION,
  normalizarSaldo, resumenSaldo, puedeReconocer, agregarAplicacion,
  ejecutarAplicacion, aplicarCompensacion, aplazarAplicacion, anularAplicacion,
  movimientosSaldos, baseDesdeDocumento,
} from "./programas.js";

const CORTE = cortReal();
const MES_VENCIDO   = HORIZONTE[Math.max(0, CORTE - 2)];
const MES_FUTURO    = HORIZONTE[CORTE + 1];
const MES_FUTURO_2  = HORIZONTE[CORTE + 2];
const MES_LIQ       = HORIZONTE[CORTE + 5];
const MES_FUERA     = "Dec-99";                       // no existe en el horizonte
console.log(`\n── horizonte real: ${HORIZONTE[0]} a ${HORIZONTE[HORIZONTE.length-1]} · corte ${mesActual()} (idx ${CORTE}) ──`);
check("(H1) el corte está dentro del horizonte", CORTE >= 0, `${mesActual()}`);
check("(H2) el mes de fuera no pertenece al horizonte", mIdxReal(MES_FUERA) < 0);

const pos = (o) => cuadrePosicion({ mIdx: mIdxReal, mesIdxActual: CORTE, ...o });

// ═══ Cubetas excluyentes ═══════════════════════════════════════════
{
  const q = pos({ base: 1000000, realizado: 0, mesLiquidacion: MES_LIQ, pendientes: [
    { id: "a", mes: MES_VENCIDO, usd: 10000 },
    { id: "b", mes: MES_FUTURO,  usd: 20000 },
    { id: "c", mes: MES_FUERA,   usd: 30000 },
    { id: "d", mes: "",          usd: 40000, trato: "reservado" },
  ]});
  check("(77) cada pendiente cae en una sola cubeta",
    q.cubetas.vencido === 10000 && q.cubetas.horizonte === 20000 &&
    q.cubetas.fuera_horizonte === 30000 && q.cubetas.sin_fecha === 40000);
  check("(78) nada se cuenta dos veces ni se pierde", aprox(q.compromisos, 100000));
  check("(79) la liquidación toma el resto", aprox(q.liquidacion, 900000));
  check("(80) la identidad del cuadre se cumple", q.cuadra === true);
  check("(81) a la caja del horizonte solo llegan el mes futuro y la liquidación",
    aprox(q.cajaEnHorizonte, 20000 + 900000), `${q.cajaEnHorizonte}`);
}

// ═══ Los cuatro casos acordados ════════════════════════════════════
{
  const c1 = pos({ base:500000, realizado:100000, mesLiquidacion:MES_LIQ,
                   pendientes:[{ id:"x", mes:MES_FUTURO, usd:50000 }] });
  check("(82) caso 1 · normal: saldo 400.000 · liq 350.000 · exceso 0",
    aprox(c1.saldoEconomico,400000) && aprox(c1.liquidacion,350000) &&
    aprox(c1.totalCalendarizado,400000) && aprox(c1.excedenteReal,0) && aprox(c1.excesoCompromisos,0));

  const c2 = pos({ base:100000, realizado:80000, mesLiquidacion:MES_LIQ,
                   pendientes:[{ id:"x", mes:MES_FUTURO, usd:40000 }] });
  check("(83) caso 2 · calendario excede sin sobrepago: exceso 20.000, sin deuda",
    aprox(c2.saldoEconomico,20000) && aprox(c2.liquidacion,0) &&
    aprox(c2.totalCalendarizado,40000) && aprox(c2.excedenteReal,0) && aprox(c2.excesoCompromisos,20000));
  check("(84) caso 2 · la diferencia queda explicada, no forzada a cero", c2.cuadra === true);

  const c3 = pos({ base:100000, realizado:120000, mesLiquidacion:MES_LIQ,
                   pendientes:[{ id:"x", mes:MES_FUTURO_2, usd:30000 }] });
  check("(85) caso 3 · sobrepago real 20.000 y exceso de calendario 30.000",
    aprox(c3.saldoEconomico,0) && aprox(c3.liquidacion,0) && aprox(c3.totalCalendarizado,30000) &&
    aprox(c3.excedenteReal,20000) && aprox(c3.excesoCompromisos,30000));
  check("(86) caso 3 · no es una obligación de 50.000", !aprox(c3.excedenteReal, 50000));
}
{
  // caso 4 · bloque excedido conviviendo con una operación individual
  const estim = est({ id:"eb", mes:MES_FUTURO, monto:850000,
                      realizaciones:[rea("rb","2026-08-01",850000)] });   // pendiente 0
  const indiv = normalizarPrograma({ id:"pA", lado:"cliente", contraparte:"A",
    presupuesto_asignado:200000, importe_definitivo:180000,
    mes_liquidacion:MES_FUTURO, cuotas:[] });
  const r = resumenLado({ estimaciones:[estim], programas:[indiv], lado:"cliente",
    basePresupuesto:1000000, mIdx:mIdxReal, mesIdxActual:CORTE, mesLiquidacion:MES_LIQ });
  const A = r.posiciones[0];
  check("(87) caso 4 · la operación individual cobra sus 180.000",
    aprox(A.base,180000) && aprox(A.liquidacion,180000) && aprox(A.variacionBase,-20000));
  check("(88) caso 4 · el bloque queda en 800.000 con excedente de 50.000",
    aprox(r.bloque.base,800000) && aprox(r.bloque.liquidacion,0) && aprox(r.bloque.excedenteReal,50000));
  check("(89) caso 4 · el total NO netea: 180.000 por cobrar",
    aprox(r.liquidacion,180000) && aprox(r.saldoEconomico,180000), `${r.liquidacion}`);
  check("(90) caso 4 · el excedente del bloque va aparte", aprox(r.excedenteReal,50000));
}

// ═══ Posiciones individuales sin neteo: A y B ══════════════════════
{
  const mk = (lado) => [
    normalizarPrograma({ id:"pA", lado, contraparte:"A", presupuesto_asignado:100000,
      importe_definitivo:100000, mes_liquidacion:MES_FUTURO, cuotas:[
      normalizarCuota({ id:"ca", mes:MES_FUTURO, modalidad:"monto", monto:120000, estado:"vigente",
        realizaciones:[rea("ra","2026-08-01",120000)] })]}),
    normalizarPrograma({ id:"pB", lado, contraparte:"B", presupuesto_asignado:100000,
      importe_definitivo:100000, mes_liquidacion:MES_FUTURO_2, cuotas:[] }),
  ];
  ["cliente","productor"].forEach((lado,i) => {
    const r = resumenLado({ estimaciones:[], programas:mk(lado), lado,
      basePresupuesto:200000, mIdx:mIdxReal, mesIdxActual:CORTE, mesLiquidacion:MES_LIQ });
    const A = r.posiciones.find(p=>p.contraparte==="A"), B = r.posiciones.find(p=>p.contraparte==="B");
    check(`(9${1+i}) ${lado} · A con 20.000 a su favor y B debe 100.000`,
      aprox(A.excedenteReal,20000) && aprox(A.liquidacion,0) && aprox(B.liquidacion,100000));
    check(`(9${3+i}) ${lado} · el flujo muestra 100.000, no 80.000`,
      aprox(r.liquidacion,100000) && aprox(r.excedenteReal,20000), `${r.liquidacion}`);
  });
}

// ═══ Fechas · los dos ejemplos ═════════════════════════════════════
{
  // 1 · liquidación calculada pero sin mes
  const q = pos({ base:500000, realizado:100000, mesLiquidacion:"",
                  pendientes:[{ id:"x", mes:MES_FUTURO, usd:50000 }] });
  check("(95) liquidación sin mes: calendarizado 50.000 y 350.000 por calendarizar",
    aprox(q.saldoEconomico,400000) && aprox(q.totalCalendarizado,50000) &&
    aprox(q.pendienteDeCalendarizar,350000) && aprox(q.liquidacion,350000));
  check("(96) y no se inventa fecha: nada de eso llega a la caja del horizonte",
    aprox(q.cajaEnHorizonte,50000), `${q.cajaEnHorizonte}`);
}
{
  // 2 · anticipo sin fecha, acordado vs trasladado
  const acordado = pos({ base:500000, realizado:100000, mesLiquidacion:MES_LIQ,
                         pendientes:[{ id:"x", mes:"", usd:50000, trato:"reservado" }] });
  check("(97) anticipo acordado sin fecha: reserva 50.000 y liquidación 350.000",
    aprox(acordado.cubetas.sin_fecha,50000) && aprox(acordado.liquidacion,350000) &&
    aprox(acordado.saldoEconomico,400000));
  const trasladado = pos({ base:500000, realizado:100000, mesLiquidacion:MES_LIQ,
                           pendientes:[{ id:"x", mes:"", usd:50000, trato:"en_liquidacion" }] });
  check("(98) trasladado a liquidación: anticipo separado 0 y liquidación 400.000",
    aprox(trasladado.cubetas.sin_fecha,0) && aprox(trasladado.liquidacion,400000));
  check("(99) en los dos casos el saldo económico es el mismo",
    aprox(acordado.saldoEconomico, trasladado.saldoEconomico));
}

// ═══ Compatibilidad de registros antiguos ══════════════════════════
{
  const viejo = { id:"v1", mes:"", usd_kg:0 };                       // sin marca de versión
  const nuevo = { id:"n1", mes:"", usd_kg:0, v: MODELO_VERSION };
  check("(100) la regla de versión no se basa solo en la fecha vacía",
    esItemLegacy(viejo,1) === true && esItemLegacy(nuevo,1) === false &&
    esItemLegacy(viejo,MODELO_VERSION) === false);
  check("(101) antiguo sin decisión conserva el tratamiento de antes",
    tratoSinFecha(viejo,{modeloVersion:1,decisiones:{}}) === "en_liquidacion");
  check("(102) uno nuevo sin fecha queda pendiente de calendarizar",
    tratoSinFecha(nuevo,{modeloVersion:1,decisiones:{}}) === "reservado");

  let dec = registrarDecisionSinFecha({}, "v1", "acordado_sin_fecha", { usuario:"qa", nota:"sigue acordado" });
  check("(103) la decisión queda con usuario y fecha",
    dec.v1.trato === "acordado_sin_fecha" && dec.v1.usuario === "qa" && !!dec.v1.ts);
  check("(104) y cambia el tratamiento",
    tratoSinFecha(viejo,{modeloVersion:1,decisiones:dec}) === "reservado");
  dec = registrarDecisionSinFecha(dec, "v1", "trasladar_liquidacion", { usuario:"qa", nota:"corrijo" });
  check("(105) cambiar de opinión deja el historial",
    dec.v1.historial.length === 1 && dec.v1.historial[0].trato === "acordado_sin_fecha");
  const round = JSON.parse(JSON.stringify(dec));
  check("(106) la decisión sobrevive a serializar y recargar",
    tratoSinFecha(viejo,{modeloVersion:1,decisiones:round}) === "en_liquidacion" &&
    round.v1.historial.length === 1);

  // El flujo no cambia mientras no haya decisión
  const estVieja = est({ id:"v1", mes:"", monto:50000 });
  const antes = resumenLado({ estimaciones:[estVieja], basePresupuesto:500000,
    mIdx:mIdxReal, mesIdxActual:CORTE, mesLiquidacion:MES_LIQ, modeloVersion:1 });
  check("(107) sin decisión, la liquidación es la de siempre (500.000)",
    aprox(antes.liquidacion,500000), `${antes.liquidacion}`);
  check("(108) y el registro queda listado para decidir",
    antes.avisosCompatibilidad.length === 1 && antes.avisosCompatibilidad[0].id === "v1");
  const despues = resumenLado({ estimaciones:[estVieja], basePresupuesto:500000,
    mIdx:mIdxReal, mesIdxActual:CORTE, mesLiquidacion:MES_LIQ, modeloVersion:1,
    decisionesSinFecha: registrarDecisionSinFecha({}, "v1", "acordado_sin_fecha", { usuario:"qa" }) });
  check("(109) al decidir 'sigue acordado' la liquidación baja 50.000",
    aprox(despues.liquidacion,450000) && aprox(despues.pendienteSinFechaReservado,50000), `${despues.liquidacion}`);
  check("(110) y el saldo económico no se mueve",
    aprox(antes.saldoEconomico, despues.saldoEconomico));
}

// ═══ Saldos a favor ════════════════════════════════════════════════
{
  check("(111) reconocer exige respaldo",
    puedeReconocer({}).puede === false &&
    puedeReconocer({ importeDefinitivo: 200000 }).puede === true &&
    puedeReconocer({ respaldo:{ tipo:"documento", referencia:"LIQ-1", fecha:"2027-04-01" } }).puede === true);

  // A · productor, exceso 40.000 recuperado en dos cuotas de 20.000
  let s = normalizarSaldo({ id:"s1", lado:"productor", contraparte:"P", usd:40000, estado:"reconocido" });
  s = agregarAplicacion(s, { tipo:"recuperacion", usd:20000, mes:MES_FUTURO,  usuario:"qa" });
  s = agregarAplicacion(s, { tipo:"recuperacion", usd:20000, mes:MES_FUTURO_2, usuario:"qa" });
  let r = resumenSaldo(s);
  check("(112) A · programar no extingue: pendiente 40.000, programado 40.000, disponible 0, resuelto 0",
    aprox(r.pendienteReal,40000) && aprox(r.programado,40000) && aprox(r.disponible,0) && aprox(r.resuelto,0));
  let err = null;
  try { agregarAplicacion(s, { tipo:"recuperacion", usd:1, mes:MES_FUTURO }); } catch (e) { err = e; }
  check("(113) A · no se puede usar dos veces el mismo monto", !!err);

  s = ejecutarAplicacion(s, s.aplicaciones[0].id, { fecha:"2026-12-05", usuario:"qa" });
  r = resumenSaldo(s);
  check("(114) A · tras cobrar la primera: pendiente 20.000, programado 20.000, resuelto 20.000",
    aprox(r.pendienteReal,20000) && aprox(r.programado,20000) && aprox(r.resuelto,20000));
  const movs = movimientosSaldos([s], { mIdx: mIdxReal });
  check("(115) A · el flujo proyecta solo la cuota que falta",
    movs.length === 1 && aprox(movs[0].usd,20000) && movs[0].signo === 1 && movs[0].mes === MES_FUTURO_2);

  // aplazar la que queda
  s = aplazarAplicacion(s, s.aplicaciones[1].id, { mes:MES_LIQ, motivo:"acordado con el productor", usuario:"qa" });
  const movs2 = movimientosSaldos([s], { mIdx: mIdxReal });
  check("(116) A · aplazar cambia el mes sin duplicar la cuota",
    movs2.length === 1 && movs2[0].mes === MES_LIQ &&
    s.aplicaciones[1].historial.length === 1);
  check("(117) A · y no toca lo ya cobrado", aprox(resumenSaldo(s).resuelto,20000));

  // anular la programación pendiente
  let err2 = null;
  try { anularAplicacion(s, s.aplicaciones[0].id, { motivo:"x" }); } catch (e) { err2 = e; }
  check("(118) A · una aplicación ya ejecutada no se anula desde acá", !!err2);
  s = anularAplicacion(s, s.aplicaciones[1].id, { motivo:"se renegoció", usuario:"qa" });
  r = resumenSaldo(s);
  check("(119) A · anular libera la reserva y conserva lo cobrado",
    aprox(r.programado,0) && aprox(r.disponible,20000) && aprox(r.resuelto,20000) && aprox(r.pendienteReal,20000));
  check("(120) A · el movimiento ejecutado sigue en el historial",
    s.aplicaciones.filter(a=>a.estado==="ejecutada").length === 1);
}
{
  // B · compensación reservada y después aplicada
  let s = normalizarSaldo({ id:"s2", lado:"productor", contraparte:"P", usd:40000, estado:"reconocido" });
  s = agregarAplicacion(s, { tipo:"compensacion", usd:40000, destino:{ temporada:"2027-2028", contraparte:"P" }, usuario:"qa" });
  let r = resumenSaldo(s);
  check("(121) B · reservada: ocupa disponible y todavía NO resuelve",
    aprox(r.programado,40000) && aprox(r.resuelto,0) && aprox(r.pendienteReal,40000) && aprox(r.disponible,0));
  check("(122) B · una reserva no manda nada al flujo", movimientosSaldos([s],{mIdx:mIdxReal}).length === 0);
  const ap = aplicarCompensacion(s, s.aplicaciones[0].id, { saldoDestino:100000, usuario:"qa" });
  r = resumenSaldo(ap.saldo);
  check("(123) B · aplicada contra 100.000: absorbe 40.000 y el pago final queda en 60.000",
    aprox(ap.absorbido,40000) && aprox(ap.remanente,0) && aprox(r.resuelto,40000) && aprox(r.pendienteReal,0));
  check("(124) B · sin ingreso ficticio", movimientosSaldos([ap.saldo],{mIdx:mIdxReal}).length === 0);

  // destino que solo absorbe una parte
  let s3 = normalizarSaldo({ id:"s3", lado:"productor", contraparte:"Q", usd:40000, estado:"reconocido" });
  s3 = agregarAplicacion(s3, { tipo:"compensacion", usd:40000, destino:{ contraparte:"Q" }, usuario:"qa" });
  const parcial = aplicarCompensacion(s3, s3.aplicaciones[0].id, { saldoDestino:15000 });
  const r3 = resumenSaldo(parcial.saldo);
  check("(125) B · si el destino solo absorbe parte, el remanente queda visible",
    aprox(parcial.absorbido,15000) && aprox(parcial.remanente,25000) &&
    aprox(r3.resuelto,15000) && aprox(r3.pendienteReal,25000) && aprox(r3.disponible,25000));
}
{
  // C y D · cliente
  let s = normalizarSaldo({ id:"s4", lado:"cliente", contraparte:"A", usd:50000, estado:"reconocido" });
  s = agregarAplicacion(s, { tipo:"devolucion", usd:50000, mes:MES_FUTURO, usuario:"qa" });
  const m = movimientosSaldos([s], { mIdx: mIdxReal });
  check("(126) C · devolución al cliente: egreso en su mes",
    m.length === 1 && m[0].signo === -1 && aprox(m[0].usd,50000) && m[0].mes === MES_FUTURO);
  let s2 = normalizarSaldo({ id:"s5", lado:"cliente", contraparte:"A", usd:50000, estado:"reconocido" });
  s2 = agregarAplicacion(s2, { tipo:"compensacion", usd:50000, destino:{ nota:"venta nueva" }, usuario:"qa" });
  const ap = aplicarCompensacion(s2, s2.aplicaciones[0].id, { saldoDestino:200000 });
  check("(127) D · aplicada a una venta de 200.000: quedan 150.000 por cobrar",
    aprox(ap.absorbido,50000) && aprox(200000 - ap.absorbido,150000) &&
    movimientosSaldos([ap.saldo],{mIdx:mIdxReal}).length === 0);
}
{
  // E · exceso proyectado por cambio de presupuesto: no crea saldo
  const q = pos({ base:400000, realizado:450000, mesLiquidacion:MES_LIQ, pendientes:[] });
  check("(128) E · baja el presupuesto: excedente real 50.000 sobre base presupuestaria",
    aprox(q.excedenteReal,50000) && aprox(q.liquidacion,0));
  check("(129) E · pero sin liquidación definitiva no se puede reconocer deuda",
    puedeReconocer({}).puede === false);
}

// ═══ Documento neto ════════════════════════════════════════════════
{
  const d = baseDesdeDocumento({ neto:300000, deducciones:[
    { tipo:"comercial", usd:50000, detalle:"comisión y servicios" },
    { tipo:"anticipo",  usd:150000 },
  ]});
  check("(130) base liquidable 450.000, no 500.000", aprox(d.base,450000) && d.cuadra === true);

  const sinClasificar = baseDesdeDocumento({ neto:300000, deducciones:[{ usd:150000 }] });
  check("(131) sin clasificar la deducción no se infiere nada",
    sinClasificar.base === null && sinClasificar.faltantes.length > 0);

  // una cuota futura que el documento NO descontó no entra en la reconstrucción
  const conFutura = baseDesdeDocumento({ neto:300000, deducciones:[
    { tipo:"comercial", usd:50000 }, { tipo:"anticipo", usd:150000 },
  ]});
  check("(132) una cuota futura ajena al documento no se suma", aprox(conFutura.base,450000));

  const conOtros = baseDesdeDocumento({ neto:300000, deducciones:[
    { tipo:"comercial", usd:50000 }, { tipo:"anticipo", usd:150000 },
    { tipo:"otro", usd:10000, detalle:"castigo de calidad" },
  ]});
  check("(133) los otros ajustes quedan descontados", aprox(conOtros.base,450000));
}


// ═══ ETAPA 3 · origen del excedente y compensación con destino real ═══
import {
  excedentePorReconocer, reconocerDesdePosicion, inconsistenciasSaldos,
  destinosCompensacion, previaCompensacion, saldosDePosicion,
} from "./programas.js";

{
  const posicion = { programaId: "pP", contraparte: "P", lado: "productor",
    base: 200000, realizado: 240000, excedenteReal: 40000, liquidacion: 0 };
  const e0 = excedentePorReconocer(posicion, []);
  check("(134) el excedente por reconocer sale del cuadre", aprox(e0.porReconocer, 40000));

  const s1 = reconocerDesdePosicion(posicion, [], { usd: 25000, usuario: "qa" });
  check("(135) reconocer deja constancia del origen",
    s1.origen.tipo === "liquidacion_individual" && s1.origen.programaId === "pP" &&
    aprox(s1.origen.base, 200000) && aprox(s1.usd, 25000) && s1.estado === "reconocido");
  const e1 = excedentePorReconocer(posicion, [s1]);
  check("(136) y descuenta lo ya reconocido", aprox(e1.yaReconocido, 25000) && aprox(e1.porReconocer, 15000));

  let err = null;
  try { reconocerDesdePosicion(posicion, [s1], { usd: 20000 }); } catch (e) { err = e; }
  check("(137) no se reconoce dos veces el mismo excedente", !!err, err?.message?.slice(0, 60));

  const s2 = reconocerDesdePosicion(posicion, [s1], { usuario: "qa" });   // sin monto = el resto
  check("(138) sin monto reconoce exactamente lo que queda", aprox(s2.usd, 15000));
  check("(139) los dos saldos quedan ligados a su posición",
    saldosDePosicion([s1, s2], "pP").length === 2);

  // La liquidación se corrige y el excedente baja: inconsistencia a resolver
  const corregida = { ...posicion, base: 230000, realizado: 240000, excedenteReal: 10000 };
  const inc = inconsistenciasSaldos([corregida], [s1, s2]);
  check("(140) si el excedente se achica, la inconsistencia se detecta",
    inc.length === 1 && aprox(inc[0].sobra, 30000), JSON.stringify(inc[0]?.sobra));
  const programado = agregarAplicacion(s1, { tipo: "recuperacion", usd: 25000, mes: MES_FUTURO, usuario: "qa" });
  const conMovimiento = ejecutarAplicacion(programado, programado.aplicaciones[0].id, { fecha: "2026-12-01" });
  check("(141a) el movimiento quedó ejecutado", aprox(resumenSaldo(conMovimiento).resuelto, 25000));
  const incMov = inconsistenciasSaldos([corregida], [conMovimiento, s2]);
  check("(141) la inconsistencia nombra lo ya movido y no lo borra",
    incMov.length === 1 && aprox(incMov[0].resuelto, 25000) &&
    incMov[0].mensaje.includes("no se borran") &&
    resumenSaldo(conMovimiento).aplicaciones.length === 1,
    incMov[0]?.mensaje);
  check("(142) sin excedente no se puede reconocer nada",
    (() => { try { reconocerDesdePosicion({ ...posicion, excedenteReal: 0 }, [], { usd: 1 }); return false; }
             catch (e) { return true; } })());
}

{
  // Destinos de compensación: salen del cuadre, no se escriben a mano
  const resumen = {
    posiciones: [
      { programaId: "pA", contraparte: "A", liquidacion: 0, liquidacionMes: MES_FUTURO },
      { programaId: "pB", contraparte: "B", liquidacion: 100000, liquidacionMes: MES_FUTURO_2 },
    ],
    bloque: { etiqueta: "Bloque presupuestario", liquidacion: 300000, liquidacionMes: MES_LIQ },
  };
  const d = destinosCompensacion(resumen, { excluirProgramaId: "pA" });
  check("(143) solo se ofrecen destinos con saldo que absorber",
    d.length === 2 && d[0].programaId === "pB" && aprox(d[0].absorbe, 100000) && d[1].programaId === null);

  const saldo = normalizarSaldo({ id: "s9", lado: "productor", contraparte: "A", usd: 40000, estado: "reconocido" });
  const pv = previaCompensacion({ saldo, destino: d[0], usd: 40000 });
  check("(144) la previa muestra los dos lados y el mes que cambia",
    pv.valido && aprox(pv.aplicado, 40000) && aprox(pv.remanenteSaldo, 0) &&
    aprox(pv.remanenteDestino, 60000) && pv.cambioFlujo[0].mes === MES_FUTURO_2 &&
    aprox(pv.cambioFlujo[0].delta, -40000));

  const pvParcial = previaCompensacion({ saldo, destino: { etiqueta: "C", absorbe: 15000, mes: MES_FUTURO }, usd: 40000 });
  check("(145) si el destino absorbe menos, el remanente del saldo queda visible",
    aprox(pvParcial.aplicado, 15000) && aprox(pvParcial.remanenteSaldo, 25000));

  const conReserva = agregarAplicacion(saldo, { tipo: "compensacion", usd: 40000,
    destino: { programaId: "pB" }, usuario: "qa" });
  const pvSinCupo = previaCompensacion({ saldo: conReserva, destino: d[0], usd: 10000 });
  check("(146) una reserva vigente ocupa disponible y bloquea otra aplicación",
    pvSinCupo.valido === false && pvSinCupo.motivo.includes("disponibles"));
}

// ═══ ETAPA 4 · antecedentes: montos informados sin fecha ═══
import {
  agregarAntecedente, completarAntecedente, anularAntecedente,
  resumenAntecedentes, antecedenteFaltantes, normalizarPrograma as normPrg,
} from "./programas.js";

{
  // Don Alberto: seis pagos informados, ninguna fecha. El monto es dato real;
  // la fecha es un pendiente de datos, no una excusa para no cargarlos.
  const MONTOS = [255000, 89890, 17110, 119000, 119000, 79000];
  let prg = normPrg({ id: "pDA", lado: "productor", contraparte: "Don Alberto", kilos: 200000 });
  MONTOS.forEach((usd, k) => {
    prg = agregarAntecedente(prg, { usd, referencia: `informado ${k + 1}`, usuario: "qa" });
  });
  check("(147) se cargan los seis montos informados sin inventar fecha",
    prg.antecedentes.length === 6 && prg.antecedentes.every(a => a.fecha === ""));
  const rs = resumenAntecedentes([prg], "productor");
  check("(148) el total informado es US$679.000", aprox(rs.totalInformado, 679000));
  check("(149) dice exactamente qué falta por movimiento",
    rs.sinFecha === 6 && rs.sinRespaldo === 6 &&
    antecedenteFaltantes(prg.antecedentes[0]).join("|")
      .includes("fecha real del movimiento"));
  check("(150) nunca se afirma conciliación bancaria", rs.conciliadoConBancos === false);

  // No descuenta nada: ni realizado, ni pendiente, ni liquidación
  const r = resumenLado({ programas: [prg], lado: "productor", basePresupuesto: 1000000,
    mIdx: mIdxReal, mesIdxActual: cortReal(), mesLiquidacion: MES_LIQ });
  check("(151) un antecedente NO cuenta como pagado",
    aprox(r.realizado, 0) && aprox(r.pendientes, 0) && aprox(r.liquidacion, 1000000));
  check("(152) pero viaja en el resumen para verlo",
    aprox(r.antecedentes.totalInformado, 679000) && r.antecedentes.cuentaPendientes === 6);

  let err = null;
  try { completarAntecedente(prg, prg.antecedentes[0].id, { fecha: "" }); } catch (e) { err = e; }
  check("(153) convertir sin fecha real está prohibido",
    !!err && err.message.includes("No se inventa"), err?.message);

  // Con la fecha recuperada y sin saber la operación: bandeja de conciliación
  const conv = completarAntecedente(prg, prg.antecedentes[1].id,
    { fecha: "2026-08-14", usuario: "qa" });
  check("(154) con fecha real sale a la bandeja, sin descontar",
    aprox(conv.movimiento.usd, 89890) && conv.movimiento.fecha === "2026-08-14" &&
    conv.movimiento.origen.tipo === "antecedente");
  check("(155) el antecedente no se borra: queda convertido y apuntando",
    conv.programa.antecedentes.length === 6 &&
    conv.programa.antecedentes[1].estado === "convertido" &&
    conv.programa.antecedentes[1].convertidoEn.id === conv.movimiento.id);
  const rs2 = resumenAntecedentes([conv.programa], "productor");
  check("(156) lo convertido sale del total informado y no se cuenta dos veces",
    aprox(rs2.totalInformado, 679000 - 89890) && rs2.convertidos === 1);
  let err2 = null;
  try { completarAntecedente(conv.programa, conv.programa.antecedentes[1].id, { fecha: "2026-09-01" }); }
  catch (e) { err2 = e; }
  check("(157) un antecedente convertido no se vuelve a registrar", !!err2, err2?.message);

  // Con la fecha y la cuota conocidas: se imputa como cualquier pago
  const conCuota = normPrg({ ...conv.programa, cuotas: [
    { id: "cDA1", modalidad: "monto", monto: 255000, estado: "vigente", mes: MES_FUTURO,
      fecha_prevista: "2026-07-01" }] });
  const imp = completarAntecedente(conCuota, conCuota.antecedentes[0].id,
    { fecha: "2026-07-05", cuotaId: "cDA1", incluido: true, usuario: "qa" });
  const rImp = resumenLado({ programas: [imp.programa], lado: "productor",
    basePresupuesto: 1000000, mIdx: mIdxReal, mesIdxActual: cortReal(), mesLiquidacion: MES_LIQ });
  check("(158) imputado a su cuota recién cuenta como pagado",
    aprox(rImp.realizado, 255000) && aprox(rImp.pendientes, 0) &&
    aprox(rImp.liquidacion, 745000));
  check("(159) y el antecedente queda ligado a la realización",
    imp.programa.antecedentes[0].convertidoEn.tipo === "cuota" &&
    !!imp.programa.antecedentes[0].convertidoEn.realizacionId);

  // Un monto informado equivocado se anula con motivo, no se borra
  let err3 = null;
  try { anularAntecedente(prg, prg.antecedentes[2].id, { motivo: "" }); } catch (e) { err3 = e; }
  check("(160) anular un antecedente exige motivo", !!err3);
  const anul = anularAntecedente(prg, prg.antecedentes[2].id,
    { motivo: "el productor corrigió el monto", usuario: "qa" });
  check("(161) anulado deja de sumar y conserva el motivo",
    aprox(resumenAntecedentes([anul], "productor").totalInformado, 679000 - 17110) &&
    anul.antecedentes[2].motivoAnulacion.includes("corrigió"));
  let err4 = null;
  try { anularAntecedente(imp.programa, imp.programa.antecedentes[0].id, { motivo: "x" }); }
  catch (e) { err4 = e; }
  check("(162) lo ya convertido se corrige anulando la realización, no el antecedente",
    !!err4 && err4.message.includes("anulando la realización"), err4?.message);
}


// ═══ ETAPA 5 · doble aplicación de una compensación ═══
{
  const saldo = normalizarSaldo({ id: "sX", lado: "productor", contraparte: "P",
    usd: 50000, estado: "reconocido" });
  const conRes = agregarAplicacion(saldo, { tipo: "compensacion", usd: 30000,
    destino: { programaId: "pDest" }, usuario: "qa" });
  const apId = conRes.aplicaciones[0].id;
  const ap1 = aplicarCompensacion(conRes, apId, { saldoDestino: 100000, usuario: "qa" });
  check("(163) la compensación se aplica una vez y resuelve 30.000",
    aprox(resumenSaldo(ap1.saldo).resuelto, 30000) &&
    aprox(resumenSaldo(ap1.saldo).programado, 0));
  let err = null;
  try { aplicarCompensacion(ap1.saldo, apId, { saldoDestino: 100000 }); } catch (e) { err = e; }
  check("(164) aplicarla de nuevo está prohibido: no se descuenta dos veces",
    !!err && err.message.includes("reservada"), err?.message);

  // Sin saldo en el destino no se aplica, ni queda a medias.
  let err2 = null;
  const otra = agregarAplicacion(saldo, { tipo: "compensacion", usd: 10000,
    destino: { programaId: "pDest" }, usuario: "qa" });
  try { aplicarCompensacion(otra, otra.aplicaciones[0].id, { saldoDestino: 0 }); } catch (e) { err2 = e; }
  check("(165) un destino sin saldo que absorber no aplica nada", !!err2, err2?.message);
  let err3 = null;
  try { aplicarCompensacion(otra, otra.aplicaciones[0].id, { saldoDestino: null }); } catch (e) { err3 = e; }
  check("(166) y sin el saldo del destino tampoco: no se escribe a mano",
    !!err3 && err3.message.includes("Falta el saldo"), err3?.message);
}


// ═══ ETAPA 6 · registro histórico y fechas estimadas ═══
import { normalizarCuota as normCuota } from "./programas.js";

{
  // WLH: tres cobros ya recibidos + tres cuotas futuras de 160.000.
  const wlh = () => ({
    id: "pWLH", lado: "cliente", contraparte: "WLH", kilos: null,
    mes_liquidacion: MES_LIQ,
    cuotas: [
      { id: "cHist", historico: true, modalidad: "por_confirmar", mes: "",
        nota: "anticipos históricos WLH",
        realizaciones: [
          { id: "h1", fecha: "2026-07-15", usd: 362000 },
          { id: "h2", fecha: "2026-08-24", usd: 39980 },
          { id: "h3", fecha: "2026-09-16", usd: 197980 },
        ] },
      { id: "w1", estado: "vigente", modalidad: "monto", monto: 160000, mes: MES_FUTURO },
      { id: "w2", estado: "vigente", modalidad: "monto", monto: 160000, mes: MES_FUTURO_2 },
    ],
  });
  const opts = (progs) => ({ programas: progs, lado: "cliente", basePresupuesto: 3825000,
    mIdx: mIdxReal, mesIdxActual: cortReal(), mesLiquidacion: MES_LIQ,
    modeloVersion: MODELO_VERSION });

  const r = resumenLado(opts([wlh()]));
  check("(167) los tres movimientos históricos se cuentan UNA vez",
    aprox(r.realizado, 599960), String(r.realizado));
  check("(168) y conservan sus fechas",
    r.historicos[0].movimientos.map(m => m.fecha).join("|") === "2026-07-15|2026-08-24|2026-09-16",
    JSON.stringify(r.historicos[0].movimientos));
  check("(169) el registro histórico no proyecta nada propio",
    aprox(r.pendientes, 320000) && r.detalle.every(d => d.id !== "cHist"),
    `pendientes ${r.pendientes}`);
  check("(170) las cuotas futuras quedan intactas",
    r.detalle.filter(d => aprox(d.usd, 160000)).length === 2);

  // No se puede activar: ni editando el estado a mano en el dato.
  const forzado = normCuota({ ...wlh().cuotas[0], estado: "vigente" });
  check("(171) un registro histórico se fuerza a borrador: no se activa ni a mano",
    forzado.estado === "borrador" && forzado.historico === true);
  const progForzado = wlh();
  // El monto forzado es DISTINTO del realizado a propósito: si fuera igual,
  // MAX(0, 599.960 − 599.960) daría 0 y la prueba pasaría incluso si el
  // forzado a borrador se rompiera.
  progForzado.cuotas[0] = { ...progForzado.cuotas[0], estado: "vigente", modalidad: "monto", monto: 700000 };
  const r2 = resumenLado(opts([progForzado]));
  check("(172) y con monto y estado forzados tampoco genera otra proyección",
    aprox(r2.pendientes, 320000) && aprox(r2.realizado, 599960) &&
    aprox(r2.liquidacion, 3825000 - 599960 - 320000),
    `pend ${r2.pendientes} · liq ${r2.liquidacion}`);
  check("(173) un histórico no admite marca de fecha estimada",
    normCuota({ historico: true, mes_estimado: true }).mes_estimado === false);

  // Fechas estimadas: proyectan, pero se cuentan aparte.
  const conEstimada = wlh();
  conEstimada.cuotas[1] = { ...conEstimada.cuotas[1], mes_estimado: true };
  const r3 = resumenLado(opts([conEstimada]));
  check("(174) una fecha estimada proyecta igual",
    aprox(r3.pendientes, 320000), String(r3.pendientes));
  check("(175) pero queda separada como proyección sobre fecha estimada",
    aprox(r3.proyeccionEstimada, 160000) && aprox(r.proyeccionEstimada, 0),
    `${r3.proyeccionEstimada} vs ${r.proyeccionEstimada}`);

  // Cuadre global del lado cliente con SNF realizado incluido.
  const snf = { id: "pSNF", lado: "cliente", contraparte: "SNF", kilos: null,
    mes_liquidacion: MES_LIQ, cuotas: [
      { id: "sHist", historico: true, modalidad: "por_confirmar", mes: "",
        realizaciones: [{ id: "s1", fecha: "2026-09-24", usd: 161920 }] }] };
  const r4 = resumenLado(opts([wlh(), snf]));
  check("(176) realizado del lado = 599.960 + 161.920",
    aprox(r4.realizado, 761880), String(r4.realizado));
  check("(177) el residual descuenta realizado y futuro una sola vez",
    aprox(r4.liquidacion, 3825000 - 761880 - 320000), String(r4.liquidacion));
}


// ═══ ETAPA 7 · estimación de caja: dos fechas, motivo y usuario ═══
import {
  registrarEstimacionCaja, quitarEstimacionCaja, mesProyeccion,
  cuotaEstimada, cuotaVencidaContractual,
} from "./programas.js";

{
  // TUNGSHING: 138.000 pactados para una fecha YA PASADA, no recibidos.
  const MES_PASADO = HORIZONTE[Math.max(0, cortReal() - 1)];
  const MES_PROX   = HORIZONTE[cortReal() + 2];
  const cuotaVenc = { id: "cT", estado: "vigente", modalidad: "monto", monto: 138000,
    mes: MES_PASADO, fecha_prevista: "2026-09-29" };
  const prog = (cuotas) => [{ id: "pT", lado: "cliente", contraparte: "TUNGSHING",
    kilos: null, mes_liquidacion: MES_LIQ, cuotas }];
  const opts = (cuotas) => ({ programas: prog(cuotas), lado: "cliente",
    basePresupuesto: 3825000, mIdx: mIdxReal, mesIdxActual: cortReal(),
    mesLiquidacion: MES_LIQ, modeloVersion: MODELO_VERSION });

  const r0 = resumenLado(opts([cuotaVenc]));
  check("(178) sin estimación, el compromiso vencido se ve vencido",
    aprox(r0.pendienteVencido, 138000) && aprox(r0.vencidoContractual, 138000),
    `vencido ${r0.pendienteVencido} · contractual ${r0.vencidoContractual}`);
  check("(179) y no entra al saldo acumulado del horizonte",
    aprox(r0.cajaEnHorizonte, r0.liquidacion), `${r0.cajaEnHorizonte} vs ${r0.liquidacion}`);

  // Estimación de caja: exige mes y motivo, y no toca la fecha contractual
  let e1 = null;
  try { registrarEstimacionCaja(cuotaVenc, { mes: MES_PROX }); } catch (e) { e1 = e; }
  check("(180) la estimación exige motivo", !!e1 && e1.message.includes("motivo"), e1?.message);
  let e2 = null;
  try { registrarEstimacionCaja(cuotaVenc, { motivo: "x" }); } catch (e) { e2 = e; }
  check("(181) y exige el mes estimado", !!e2, e2?.message);
  let e3 = null;
  try { registrarEstimacionCaja({ ...cuotaVenc, historico: true }, { mes: MES_PROX, motivo: "x" }); }
  catch (e) { e3 = e; }
  check("(182) un registro histórico no se estima", !!e3, e3?.message);
  let e4 = null;
  try { registrarEstimacionCaja({ ...cuotaVenc, mes: "" }, { mes: MES_PROX, motivo: "x" }); }
  catch (e) { e4 = e; }
  check("(183) sin fecha contractual no hay dos fechas que preservar",
    !!e4 && e4.message.includes("dos fechas"), e4?.message);

  const conEst = registrarEstimacionCaja(cuotaVenc,
    { mes: MES_PROX, motivo: "el cliente avisó reprogramación verbal", usuario: "angelo" });
  check("(184) la fecha contractual se conserva intacta",
    conEst.mes === MES_PASADO && conEst.fecha_prevista === "2026-09-29");
  check("(185) la estimación guarda mes, motivo, usuario y fecha del registro",
    conEst.estimacion_caja.mes === MES_PROX &&
    conEst.estimacion_caja.motivo.includes("reprogramación") &&
    conEst.estimacion_caja.usuario === "angelo" && !!conEst.estimacion_caja.ts,
    JSON.stringify(conEst.estimacion_caja));
  check("(186) se proyecta en el mes estimado", mesProyeccion(conEst) === MES_PROX);
  check("(187) y sigue vencida contractualmente",
    cuotaVencidaContractual(conEst, mIdxReal, cortReal()) === true &&
    cuotaEstimada(conEst) === true);

  const r1 = resumenLado(opts([conEst]));
  check("(188) el flujo la mueve al mes estimado",
    r1.detalle.some(d => d.mes === MES_PROX && aprox(d.usd, 138000)) &&
    aprox(r1.pendienteVencido, 0),
    JSON.stringify(r1.detalle.map(d => `${d.mes} ${d.usd}`)));
  check("(189) PERO el vencido contractual sigue declarado",
    aprox(r1.vencidoContractual, 138000) &&
    r1.vencidosContractuales[0].mesContractual === MES_PASADO &&
    r1.vencidosContractuales[0].mesProyectado === MES_PROX,
    JSON.stringify(r1.vencidosContractuales[0]));
  check("(190) y la proyección estimada se informa aparte",
    aprox(r1.proyeccionEstimada, 138000));
  check("(191) el total del lado no cambia por estimar",
    aprox(r1.pendientes + r1.liquidacion, r0.pendientes + r0.liquidacion),
    `${r1.pendientes + r1.liquidacion} vs ${r0.pendientes + r0.liquidacion}`);

  // Cambiar la estimación conserva la anterior en el historial
  const conEst2 = registrarEstimacionCaja(conEst,
    { mes: HORIZONTE[cortReal() + 3], motivo: "segunda reprogramación", usuario: "angelo" });
  check("(192) cambiar la estimación conserva la anterior en el historial",
    conEst2.estimacion_caja.historial.length === 1 &&
    conEst2.estimacion_caja.historial[0].mes === MES_PROX,
    JSON.stringify(conEst2.estimacion_caja.historial));

  // Quitarla devuelve la cuota a su mes contractual, y queda el rastro
  const sinEst = quitarEstimacionCaja(conEst2, { motivo: "no se confirmó", usuario: "angelo" });
  check("(193) quitarla la devuelve a su mes contractual",
    mesProyeccion(sinEst) === MES_PASADO && sinEst.estimacion_caja === null &&
    sinEst.estimaciones_retiradas.length === 1);
  const r2 = resumenLado(opts([sinEst]));
  check("(194) y vuelve a proyectarse vencida",
    aprox(r2.pendienteVencido, 138000) && aprox(r2.proyeccionEstimada, 0));
}


// ═══ ETAPA 8 · correcciones de la revisión de cierre ═══
import { archivarPrograma as archPrg, moverRealizacion as moverRea,
  cuadrePosicion as cuadrePos, normalizarCuota as normC } from "./programas.js";

{
  const MES_F = HORIZONTE[cortReal() + 2];
  const o = (progs, extra = {}) => ({ programas: progs, lado: "cliente",
    basePresupuesto: 1000000, mIdx: mIdxReal, mesIdxActual: cortReal(),
    mesLiquidacion: MES_LIQ, modeloVersion: MODELO_VERSION, ...extra });

  // ── A. Archivar no borra el dinero ya movido ──
  const conPlata = { id: "pA", lado: "cliente", contraparte: "A", kilos: null,
    mes_liquidacion: MES_LIQ, cuotas: [{ id: "c1", estado: "vigente", modalidad: "monto",
      monto: 300000, mes: MES_F, realizaciones: [{ id: "r1", fecha: "2026-08-01", usd: 200000 }] }] };
  const antes = resumenLado(o([conPlata]));
  check("(195) antes de archivar: realizado 200.000 y liquidación 700.000",
    aprox(antes.realizado, 200000) && aprox(antes.pendientes, 100000) && aprox(antes.liquidacion, 700000));
  const arch = resumenLado(o([archPrg(conPlata, { motivo: "qa", usuario: "qa" })]));
  check("(196) archivado: las cuotas dejan de proyectar PERO el realizado sigue descontando",
    aprox(arch.realizado, 200000) && aprox(arch.pendientes, 0) && aprox(arch.liquidacion, 800000),
    `realizado ${arch.realizado} · liq ${arch.liquidacion}`);
  const movArch = movimientosLado(o([archPrg(conPlata, { motivo: "qa", usuario: "qa" })])).movimientos;
  check("(197) y realizado + proyectado sigue siendo la base",
    aprox(arch.realizado + movArch.reduce((a, m) => a + m.usd, 0), 1000000),
    String(arch.realizado + movArch.reduce((a, m) => a + m.usd, 0)));
  check("(198) el realizado de lo archivado se informa aparte",
    aprox(arch.realizadoArchivado, 200000));

  // ── B. Una posición sale del bloque ENTERA, también sin presupuesto asignado ──
  const soloDef = [{ id: "pB", lado: "cliente", contraparte: "B", kilos: null,
    importe_definitivo: 300000, mes_liquidacion: MES_F, cuotas: [] }];
  const rB = resumenLado(o(soloDef));
  const mB = movimientosLado(o(soloDef)).movimientos.reduce((a, m) => a + m.usd, 0);
  check("(199) posición 300.000 + bloque 700.000 = la base, no 1.300.000",
    aprox(rB.posiciones[0].base, 300000) && aprox(rB.bloque.base, 700000) && aprox(mB, 1000000),
    `pos ${rB.posiciones[0].base} + bloque ${rB.bloque.base} = proyectado ${mB}`);
  const conAsig = [{ ...soloDef[0], presupuesto_asignado: 250000 }];
  check("(200) con presupuesto asignado se retira ese, no el definitivo",
    aprox(resumenLado(o(conAsig)).bloque.base, 750000),
    String(resumenLado(o(conAsig)).bloque.base));

  // ── C. Reconocer un excedente sabe de qué lado es ──
  const posCli = resumenLado(o([{ id: "pC", lado: "cliente", contraparte: "C", kilos: null,
    presupuesto_asignado: 200000, importe_definitivo: 200000, mes_liquidacion: MES_F,
    cuotas: [{ id: "cC", estado: "vigente", modalidad: "monto", monto: 240000, mes: MES_F,
      realizaciones: [{ id: "rC", fecha: "2026-08-01", usd: 240000 }] }] }])).posiciones[0];
  check("(201) la posición declara su lado", posCli.lado === "cliente");
  const sCli = reconocerDesdePosicion(posCli, [], { usd: 40000, usuario: "qa" });
  check("(202) un excedente de CLIENTE nace como saldo del cliente (devolución, no recuperación)",
    sCli.lado === "cliente", `lado ${sCli.lado}`);
  let errLado = null;
  try { reconocerDesdePosicion({ ...posCli, lado: undefined }, [], { usd: 1000 }); }
  catch (e) { errLado = e; }
  check("(203) sin lado no se reconoce nada: no se adivina",
    !!errLado && errLado.message.includes("de qué lado"), errLado?.message?.slice(0, 50));

  // ── D. El exceso de compromisos cuenta lo compensado ──
  const q = cuadrePos({ etiqueta: "D", base: 300000, realizado: 0,
    pendientes: [{ tipo: "cuota", id: "x", mes: MES_F, usd: 290000 }],
    mesLiquidacion: MES_LIQ, mIdx: mIdxReal, mesIdxActual: cortReal(), compensaciones: 40000 });
  check("(204) compromisos 290.000 + compensado 40.000 sobre base 300.000 → exceso 30.000",
    aprox(q.excesoCompromisos, 30000) && aprox(q.excedenteReal, 0),
    `exceso ${q.excesoCompromisos}`);
  check("(205) y la identidad de cuadre cierra",
    q.cuadra === true &&
    aprox(q.saldoEconomico, q.totalCalendarizado + q.pendienteDeCalendarizar + q.compensado - q.excesoCompromisos),
    `${q.saldoEconomico} vs ${q.totalCalendarizado + q.pendienteDeCalendarizar + q.compensado - q.excesoCompromisos}`);
  const qReal = cuadrePos({ etiqueta: "E", base: 200000, realizado: 300000,
    pendientes: [], mesLiquidacion: MES_LIQ, mIdx: mIdxReal, mesIdxActual: cortReal(),
    compensaciones: 50000 });
  check("(206) con realizado > base, el excedente real no se mezcla con el exceso",
    aprox(qReal.excedenteReal, 100000) && aprox(qReal.excesoCompromisos, 50000),
    `real ${qReal.excedenteReal} exceso ${qReal.excesoCompromisos}`);

  // ── E. Mover entre estimaciones reabriría el pendiente de origen ──
  let errMov = null;
  try {
    moverRea({ estimaciones: [{ id: "e1", mes: MES_F, usd_kg: 0.1,
      realizaciones: [{ id: "rm", fecha: "2026-08-01", usd: 50000 }] }, { id: "e2", mes: MES_F, usd_kg: 0.1 }],
      programas: [], reaId: "rm", desde: { tipo: "estimacion", id: "e1" },
      hacia: { tipo: "estimacion", id: "e2" }, usuario: "qa" });
  } catch (e) { errMov = e; }
  check("(207) mover de estimación a estimación está prohibido",
    !!errMov && errMov.message.includes("reabriría"), errMov?.message?.slice(0, 50));

  // ── F. Un histórico no admite estimación de caja ni por el dato ──
  check("(208) un registro histórico descarta la estimación de caja",
    normC({ historico: true, mes: MES_F, estimacion_caja: { mes: MES_LIQ, motivo: "x" } })
      .estimacion_caja === null);

  // ── G. La marca de versión al crear hace alcanzable el default reservado ──
  const nueva = normC({ id: "cV", estado: "vigente", modalidad: "monto", monto: 50000, mes: "", v: MODELO_VERSION });
  const rV = resumenLado(o([{ id: "pV", lado: "cliente", contraparte: "V", kilos: null,
    mes_liquidacion: MES_LIQ, cuotas: [nueva] }], { modeloVersion: 1 }));
  check("(209) una cuota creada hoy queda reservada aunque la fruta siga en versión 1",
    aprox(rV.pendienteDeCalendarizar, 50000) && aprox(rV.liquidacion, 950000) &&
    rV.avisosCompatibilidad.length === 0,
    `reservado ${rV.pendienteDeCalendarizar} · liq ${rV.liquidacion} · avisos ${rV.avisosCompatibilidad.length}`);
  const vieja = normC({ id: "cO", estado: "vigente", modalidad: "monto", monto: 50000, mes: "" });
  const rO = resumenLado(o([{ id: "pO", lado: "cliente", contraparte: "O", kilos: null,
    mes_liquidacion: MES_LIQ, cuotas: [vieja] }], { modeloVersion: 1 }));
  check("(210) y un registro guardado antes conserva su comportamiento histórico",
    aprox(rO.liquidacion, 1000000) && rO.avisosCompatibilidad.length === 1,
    `liq ${rO.liquidacion} · avisos ${rO.avisosCompatibilidad.length}`);
}


console.log(`\n${fallos === 0 ? "TODOS LOS TESTS PASARON ✓" : `${fallos} TEST(S) FALLARON ✗`}`);
process.exit(fallos === 0 ? 0 : 1);
