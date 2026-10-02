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
  check("(58) liquidación 0 y excedente a la vista",
    aprox(r.liquidacion, 0) && aprox(r.excedente, 100000), `exc=${r.excedente}`);
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

console.log(`\n${fallos === 0 ? "TODOS LOS TESTS PASARON ✓" : `${fallos} TEST(S) FALLARON ✗`}`);
process.exit(fallos === 0 ? 0 : 1);
