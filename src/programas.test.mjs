/* eslint-disable */
// Tests del modelo de programas comerciales — ejecutar:
//   node src/programas.test.mjs
//
// DATOS SINTÉTICOS. Ninguna contraparte, kilo ni importe de acá corresponde
// a un acuerdo real de Allegria Foods.
import {
  normalizarPrograma, acordadoAnticipo, pendienteAnticipo, realizadoAnticipo,
  totalPrograma, resumenPrograma, movimientosPrograma, resumenLado,
  validarActivacion, proyeccionLado, ladoActivo, cuadreActivacion,
  agregarAntecedente, completarAntecedente, referenciaAnticipo, esDato,
} from "./programas.js";
import { agregarRealizacion, anularRealizacion } from "./anticipos.js";

let fallos = 0;
const aprox = (a, b, tol = 0.005) => Math.abs(a - b) <= tol;
function check(nombre, cond, extra = "") {
  console.log(`${cond ? "✓" : "✗ FALLA"}  ${nombre}${extra ? "  — " + extra : ""}`);
  if (!cond) fallos++;
}

// ── Armado sintético ──────────────────────────────────────────────
const prg = (over = {}) => normalizarPrograma({
  lado: "cliente", contraparte: "Cliente Norte",
  kilos: 200000, precio_modo: "usd_kg", precio_usd_kg: 4,
  mes_liquidacion: "Mar-27", anticipos: [], ...over,
});
const ant = (over = {}) => ({ modalidad: "usd_kg", usd_kg: 0.2, mes: "Nov-26", ...over });

// ═══ 1. El dato que falta vale null, nunca 0 ═══════════════════════
{
  const a = acordadoAnticipo(ant({ usd_kg: null }), 200000);
  check("(1) sin tarifa → acordado null, no 0", a.valor === null && a.faltantes.includes("tarifa US$/kg"));

  const b = acordadoAnticipo(ant({ modalidad: "usd_kg" }), null);
  check("(2) sin kilos del programa → acordado null", b.valor === null && b.faltantes.includes("kilos del programa"));

  const c = acordadoAnticipo({ modalidad: "monto", monto: 161920 }, null);
  check("(3) monto fijo no necesita kilos", c.valor === 161920 && c.faltantes.length === 0);

  const d = acordadoAnticipo({ modalidad: "por_confirmar", monto: 138000 }, 200000);
  check("(4) modalidad por confirmar NO se vuelve contractual", d.valor === null);
  check("(5) pero el importe del calendario queda a la vista",
    referenciaAnticipo({ modalidad: "por_confirmar", monto: 138000 }, 200000) === 138000);

  check("(6) cero cargado a mano SÍ es dato", esDato(0) === true && esDato(null) === false && esDato("") === false);
}

// ═══ 2. Los 850.000 kg globales no son la base de ningún acuerdo ═══
{
  const p = prg({ kilos: 120000, anticipos: [ant({ usd_kg: 0.5 })] });
  const r = resumenPrograma(p);
  check("(7) acordado usa los kilos del programa, no los de la fruta", aprox(r.acordado, 60000), `${r.acordado}`);
}

// ═══ 3. Realizado fijo en USD ══════════════════════════════════════
{
  let p = prg({ anticipos: [ant({ usd_kg: 0.5 })] });                 // acordado 100.000
  p.anticipos[0] = agregarRealizacion(p.anticipos[0], { fecha: "2026-09-24", usd: 40000 });
  let r = resumenPrograma(p);
  check("(8) pendiente = acordado − realizado", aprox(r.acordado, 100000) && aprox(r.realizado, 40000) && aprox(r.pendiente, 60000));

  p = normalizarPrograma({ ...p, kilos: 100000 });                    // bajan los kilos
  r = resumenPrograma(p);
  check("(9) bajar kilos mueve el acordado, nunca el realizado",
    aprox(r.acordado, 50000) && aprox(r.realizado, 40000) && aprox(r.pendiente, 10000));

  p.anticipos[0] = anularRealizacion(p.anticipos[0], p.anticipos[0].realizaciones[0].id, { motivo: "cartola equivocada" });
  r = resumenPrograma(p);
  check("(10) anular devuelve el pendiente y conserva el historial",
    aprox(r.realizado, 0) && aprox(r.pendiente, 50000) && p.anticipos[0].realizaciones.length === 1);
}

// ═══ 4. Excedente contra el TOTAL, no contra el calendario ═════════
{
  // Programa de productor: costo neto 500.000, calendario de anticipos 300.000,
  // pagado 400.000. Se pasó del calendario, NO del costo.
  let p = prg({ lado: "productor", contraparte: "Productor Sur", kilos: 200000,
                precio_usd_kg: 2.5, anticipos: [ant({ usd_kg: 1.5, mes: "Dic-26" })] });
  p.anticipos[0] = agregarRealizacion(p.anticipos[0], { fecha: "2026-08-10", usd: 400000 });
  const r = resumenPrograma(p);
  check("(11) pasarse del calendario de anticipos no deja la liquidación en cero",
    aprox(r.total, 500000) && aprox(r.realizado, 400000) && aprox(r.pendiente, 0) && aprox(r.liquidacion, 100000),
    `liq=${r.liquidacion}`);
  check("(12) y no hay excedente mientras no se supere el total", r.excedente === 0);

  p.anticipos[0] = agregarRealizacion(p.anticipos[0], { fecha: "2026-09-10", usd: 150000 });
  const r2 = resumenPrograma(p);
  check("(13) recién al superar el total aparece el excedente",
    aprox(r2.liquidacion, 0) && aprox(r2.excedente, 50000), `exc=${r2.excedente}`);
}

// ═══ 5. Programa sin anticipos ═════════════════════════════════════
{
  const p = prg({ contraparte: "Cliente Sin Anticipos", anticipos: [] });
  const r = resumenPrograma(p);
  check("(14) programa sin anticipos es válido y liquida el total",
    r.completo && aprox(r.total, 800000) && aprox(r.liquidacion, 800000) && r.acordado === 0);
  const v = validarActivacion(p, { kgPresupuesto: 850000, totalPresupuesto: 3825000 });
  check("(15) y se puede activar", v.puede === true, JSON.stringify(v.faltantes));
}

// ═══ 6. Registrar ≠ activar ════════════════════════════════════════
{
  const p = prg({ activo: false, anticipos: [ant()] });
  check("(16) un programa registrado no entra al cálculo", ladoActivo([p]) === false);
  const proy = proyeccionLado([p], { totalPresupuesto: 3825000, mesLiquidacionFruta: "Mar-27" });
  check("(17) y no aporta ningún movimiento", proy.movimientos.length === 0 && proy.hayActivos === false);

  const act = normalizarPrograma({ ...p, activo: true });
  check("(18) activado sí entra", ladoActivo([act]) === true);
}

// ═══ 7. Activación bloqueada ═══════════════════════════════════════
{
  const incompleto = prg({ contraparte: "", kilos: null, anticipos: [ant({ modalidad: "por_confirmar", monto: 1000 })] });
  const v = validarActivacion(incompleto, { kgPresupuesto: 850000, totalPresupuesto: 3825000 });
  check("(19) no se activa con datos faltantes y los enumera",
    v.puede === false && v.faltantes.length >= 2, JSON.stringify(v.faltantes));

  const grande = prg({ kilos: 900000, precio_usd_kg: 4.5 });
  const v2 = validarActivacion(grande, { kgPresupuesto: 850000, totalPresupuesto: 3825000 });
  check("(20) no se activa si se pasa de los kilos de presupuesto",
    v2.puede === false && v2.bloqueos.some(b => b.includes("kilos")));

  const a1 = prg({ id: "p1", kilos: 400000, precio_usd_kg: 4.5, activo: true });   // 1.800.000
  const a2 = prg({ id: "p2", kilos: 400000, precio_usd_kg: 6 });                   // 2.400.000
  const v3 = validarActivacion(a2, { kgPresupuesto: 850000, totalPresupuesto: 3825000, otrosActivos: [a1] });
  check("(21) ni si los programas activos se pasan del presupuesto del lado",
    v3.puede === false && v3.bloqueos.some(b => b.includes("techo")));
}

// ═══ 8. Proyección del lado: el presupuesto es el techo ════════════
{
  const p = prg({ id: "p1", kilos: 200000, precio_usd_kg: 4.5, activo: true,   // total 900.000
                  mes_liquidacion: "Mar-27", anticipos: [ant({ usd_kg: 0.5, mes: "Nov-26" })] });  // acordado 100.000
  const proy = proyeccionLado([p], { totalPresupuesto: 3825000, mesLiquidacionFruta: "Mar-27" });
  const porMes = m => proy.movimientos.filter(x => x.mes === m).reduce((s, x) => s + x.usd, 0);
  check("(22) el anticipo pendiente se proyecta en su mes", aprox(porMes("Nov-26"), 100000));
  check("(23) liquidación del programa + resto presupuestario en el mes de la fruta",
    aprox(porMes("Mar-27"), 800000 + 2925000), `${porMes("Mar-27")}`);
  check("(24) el total del lado es exactamente el presupuesto",
    aprox(proy.totalProyectado, 3825000), `${proy.totalProyectado}`);

  // Con un cobro ya recibido, ese monto sale del flujo futuro pero sigue
  // descontando de la liquidación del programa.
  const q = normalizarPrograma(p);
  q.anticipos[0] = agregarRealizacion(q.anticipos[0], { fecha: "2026-07-15", usd: 60000 });
  const proy2 = proyeccionLado([q], { totalPresupuesto: 3825000, mesLiquidacionFruta: "Mar-27" });
  check("(25) lo ya cobrado deja de proyectarse",
    aprox(proy2.totalProyectado, 3825000 - 60000), `${proy2.totalProyectado}`);
  check("(26) y sigue descontado de la liquidación del programa",
    aprox(resumenPrograma(q).liquidacion, 900000 - 100000), `${resumenPrograma(q).liquidacion}`);
}

// ═══ 9. Los dos lados son independientes ═══════════════════════════
{
  const cli  = prg({ lado: "cliente",   kilos: 300000, activo: true });
  const prod = prg({ lado: "productor", kilos: 500000, precio_usd_kg: 2.5, activo: true });
  const rc = resumenLado([cli],  { kgPresupuesto: 850000 });
  const rp = resumenLado([prod], { kgPresupuesto: 850000 });
  check("(27) cada lado cuenta sus propios kilos contra el presupuesto",
    rc.kilosAsignados === 300000 && rc.kilosLibres === 550000 &&
    rp.kilosAsignados === 500000 && rp.kilosLibres === 350000);
}

// ═══ 10. Variación contra el presupuesto, sin forzar el cuadre ═════
{
  const p1 = prg({ kilos: 400000, precio_usd_kg: 5 });     // 2.000.000
  const p2 = prg({ kilos: 400000, precio_usd_kg: 4 });     // 1.600.000
  const r = resumenLado([p1, p2], { kgPresupuesto: 850000, totalPresupuesto: 3825000 });
  check("(28) la variación se muestra, no se absorbe",
    aprox(r.totalProgramas, 3600000) && aprox(r.variacion, -225000), `var=${r.variacion}`);
  check("(29) y los kilos sin asignar quedan visibles", r.kilosLibres === 50000);
}

// ═══ 11. Antecedentes: informados, no contabilizados ═══════════════
{
  let p = prg({ lado: "productor", precio_usd_kg: 2.5, anticipos: [ant({ usd_kg: 1, mes: "Dic-26" })] });
  p = agregarAntecedente(p, { usd: 255000, nota: "pago informado, falta fecha" });
  p = agregarAntecedente(p, { usd: 89890, nota: "pago informado, falta fecha" });
  const r = resumenPrograma(p);
  check("(30) un antecedente NO cuenta como pagado", aprox(r.realizado, 0) && r.antecedentes === 2);
  check("(31) no descuenta de la liquidación", aprox(r.liquidacion, 500000 - 200000), `${r.liquidacion}`);
  check("(32) pero su monto queda informado", aprox(r.antecedentesUsd, 344890));

  const anteId = p.antecedentes[0].id;
  let err = null;
  try { completarAntecedente(p, anteId, { anticipoId: p.anticipos[0].id, fecha: "" }); }
  catch (e) { err = e; }
  check("(33) no se puede completar sin fecha real", !!err);

  const q = completarAntecedente(p, anteId, { anticipoId: p.anticipos[0].id, fecha: "2026-07-15" });
  const rq = resumenPrograma(q);
  check("(34) al completarlo pasa a ser movimiento con fecha", aprox(rq.realizado, 255000) && rq.antecedentes === 1);
  check("(35) y el antecedente queda marcado, no borrado",
    q.antecedentes.length === 2 && !!q.antecedentes.find(x => x.id === anteId).convertidoEn);
}

// ═══ 12. Un anticipo sin mes no se proyecta, pero lo realizado sí descuenta ═
{
  let p = prg({ kilos: 200000, precio_usd_kg: 4, anticipos: [ant({ usd_kg: 0.5, mes: "" })] });
  p.anticipos[0] = agregarRealizacion(p.anticipos[0], { fecha: "2026-08-01", usd: 30000 });
  const r = resumenPrograma(p);
  check("(36) sin mes: el pendiente no se descuenta de la liquidación",
    aprox(r.pendienteSinMes, 70000) && aprox(r.descuento, 30000), `desc=${r.descuento}`);
  check("(37) y no aparece en los movimientos",
    movimientosPrograma({ ...p, activo: true }).filter(m => m.tipo === "anticipo").length === 0);
}

// ═══ 13. Cerrar un anticipo pasa el pendiente a la liquidación ═════
{
  let p = prg({ kilos: 200000, precio_usd_kg: 4, anticipos: [ant({ usd_kg: 0.5, cerrado: true })] });
  p.anticipos[0] = agregarRealizacion(p.anticipos[0], { fecha: "2026-08-01", usd: 30000 });
  const r = resumenPrograma(p);
  check("(38) cerrado: pendiente 0 y solo descuenta lo realizado",
    aprox(r.pendiente, 0) && aprox(r.descuento, 30000) && aprox(r.liquidacion, 770000));
}

// ═══ 14. Cuadre antes/después ══════════════════════════════════════
{
  const estim = [{ mes: "Sep-26", usd: 212500 }, { mes: "Nov-26", usd: 374000 }, { mes: "Mar-27", usd: 3238500 }];
  const p = prg({ kilos: 200000, precio_usd_kg: 4.5, activo: true, anticipos: [ant({ usd_kg: 0.5 })] });
  const c = cuadreActivacion({ movimientosEstimacion: estim, programas: [p],
                               totalPresupuesto: 3825000, mesLiquidacionFruta: "Mar-27" });
  check("(39) el cuadre muestra el antes y el después", aprox(c.antes.total, 3825000) && aprox(c.despues.total, 3825000));
  check("(40) y la diferencia del lado es cero cuando el presupuesto no cambia", aprox(c.diferencia, 0));
  check("(41) identificando qué parte queda sin programa", aprox(c.resto, 3825000 - 900000));
}

// ═══ 15. Totales por monto fijo ════════════════════════════════════
{
  const p = prg({ precio_modo: "monto", monto_total: 750000, kilos: null,
                  anticipos: [{ modalidad: "monto", monto: 100000, mes: "Nov-26" }] });
  const r = resumenPrograma(p);
  check("(42) un programa cerrado en USD no necesita kilos",
    r.completo && aprox(r.total, 750000) && aprox(r.liquidacion, 650000));
}

console.log(`\n${fallos === 0 ? "TODOS LOS TESTS PASARON ✓" : `${fallos} TEST(S) FALLARON ✗`}`);
process.exit(fallos === 0 ? 1 && 0 : 1);
