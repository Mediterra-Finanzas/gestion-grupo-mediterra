/* eslint-disable */
// Tests del modelo de anticipos con realizaciones — ejecutar:
//   node src/anticipos.test.mjs
import {
  antAcordado, antRealizado, antPendiente, antDescuentoLiq,
  resumenAnticipos, agregarRealizacion, anularRealizacion,
  puedeBorrarAnticipo, normalizarAnticipo,
  clasificarRealizacionVsSaldos, conciliacionRealizaciones,
} from './anticipos.js';

let fallos = 0;
const aprox = (a, b, tol = 0.005) => Math.abs(a - b) <= tol;
function check(nombre, cond, extra = "") {
  console.log(`${cond ? "✓" : "✗ FALLA"}  ${nombre}${extra ? "  — " + extra : ""}`);
  if (!cond) fallos++;
}

// Helpers de armado
const KG = 1000000;                       // 1.000.000 kg
const ant = (usd_kg, reas = [], cerrado = false) =>
  ({ id:"a1", mes:"Nov-26", usd_kg, cerrado, realizaciones: reas.map((u,i)=>({id:`r${i}`, fecha:"2026-09-01", usd:u})) });

// ── (1) EJEMPLO OBLIGATORIO — CLIENTES ────────────────────────────
// Venta 600.000, anticipo acordado 100.000, ya cobrado 60.000
// → flujo futuro = 40.000 (anticipo pendiente) + 500.000 (liquidación)
{
  const a = ant(0.10, [60000]);
  const r = resumenAnticipos([a], KG, 600000);
  check("(1) clientes: acordado 100.000",   aprox(r.acordado, 100000),   `=${r.acordado}`);
  check("(1) clientes: realizado 60.000",   aprox(r.realizado, 60000),   `=${r.realizado}`);
  check("(1) clientes: pendiente 40.000",   aprox(r.pendiente, 40000),   `=${r.pendiente}`);
  check("(1) clientes: liquidación 500.000",aprox(r.liquidacion, 500000),`=${r.liquidacion}`);
  check("(1) clientes: FLUJO FUTURO 540.000", aprox(r.flujoPendiente, 540000), `=${r.flujoPendiente}`);
  check("(1) clientes: sin excedente",      aprox(r.excedente, 0));
}

// ── (2) EJEMPLO OBLIGATORIO — PRODUCTORES ─────────────────────────
// Costo neto 422.000, anticipo acordado 100.000, ya pagado 70.000
// → flujo futuro = 30.000 (anticipo pendiente) + 322.000 (saldo productor)
{
  const a = ant(0.10, [70000]);
  const r = resumenAnticipos([a], KG, 422000);
  check("(2) productor: pendiente 30.000",   aprox(r.pendiente, 30000),   `=${r.pendiente}`);
  check("(2) productor: saldo 322.000",      aprox(r.liquidacion, 322000),`=${r.liquidacion}`);
  check("(2) productor: FLUJO FUTURO 352.000", aprox(r.flujoPendiente, 352000), `=${r.flujoPendiente}`);
}

// ── (3) Anticipo totalmente realizado ─────────────────────────────
{
  const r = resumenAnticipos([ant(0.10, [100000])], KG, 600000);
  check("(3) realizado total: pendiente 0",     aprox(r.pendiente, 0));
  check("(3) realizado total: liq 500.000",     aprox(r.liquidacion, 500000));
  check("(3) realizado total: flujo 500.000",   aprox(r.flujoPendiente, 500000));
}

// ── (4) Múltiples anticipos, uno parcial y otro intacto ───────────
{
  const r = resumenAnticipos([ant(0.10, [60000]), ant(0.05, [])], KG, 600000);
  check("(4) múltiples: pendiente 90.000",  aprox(r.pendiente, 90000),  `=${r.pendiente}`);
  check("(4) múltiples: liq 450.000",       aprox(r.liquidacion, 450000),`=${r.liquidacion}`);
  check("(4) múltiples: flujo 540.000",     aprox(r.flujoPendiente, 540000));
}

// ── (5) Cambian los kilos DESPUÉS de cobrar: el realizado no se mueve ──
{
  const a = ant(0.10, [60000]);
  const antes = antRealizado(a);
  const r = resumenAnticipos([a], 800000, 480000);   // kilos −20%
  check("(5) kg−20%: realizado intacto 60.000", aprox(antRealizado(a), 60000) && aprox(antes, 60000));
  check("(5) kg−20%: acordado baja a 80.000",   aprox(r.acordado, 80000),  `=${r.acordado}`);
  check("(5) kg−20%: pendiente 20.000",         aprox(r.pendiente, 20000), `=${r.pendiente}`);
  check("(5) kg−20%: liq 400.000",              aprox(r.liquidacion, 400000));
}

// ── (6) Realizado > acordado recalculado (sobre-anticipo por línea) ──
{
  const r = resumenAnticipos([ant(0.10, [60000])], 500000, 300000);  // acordado 50.000 < realizado 60.000
  check("(6) sobre-realizado: pendiente 0",   aprox(r.pendiente, 0));
  check("(6) sobre-realizado: descLiq 60.000",aprox(r.descuentoLiq, 60000), `=${r.descuentoLiq}`);
  check("(6) sobre-realizado: liq 240.000",   aprox(r.liquidacion, 240000));
}

// ── (7) Anticipo cerrado con realización parcial ──────────────────
// Se cobraron 30.000 de 100.000 y no se cobrará más → el resto se traslada
// a la liquidación (570.000) y no queda pendiente.
{
  const r = resumenAnticipos([ant(0.10, [30000], true)], KG, 600000);
  check("(7) cerrado parcial: pendiente 0",    aprox(r.pendiente, 0));
  check("(7) cerrado parcial: descLiq 30.000", aprox(r.descuentoLiq, 30000));
  check("(7) cerrado parcial: liq 570.000",    aprox(r.liquidacion, 570000), `=${r.liquidacion}`);
  check("(7) cerrado parcial: flujo 570.000",  aprox(r.flujoPendiente, 570000));
}
// Cerrado sin ninguna realización → todo se traslada a la liquidación.
{
  const r = resumenAnticipos([ant(0.10, [], true)], KG, 600000);
  check("(7b) cerrado sin cobros: liq 600.000", aprox(r.liquidacion, 600000));
  check("(7b) cerrado sin cobros: pendiente 0", aprox(r.pendiente, 0));
}

// ── (8) Sobre-anticipo del TOTAL: se muestra, no se compensa ──────
// Venta 600.000 con anticipos acordados por 700.000.
{
  const r = resumenAnticipos([ant(0.70, [400000])], KG, 600000);
  check("(8) sobreanticipo: descLiq 700.000", aprox(r.descuentoLiq, 700000), `=${r.descuentoLiq}`);
  check("(8) sobreanticipo: liq 0 (no negativa)", aprox(r.liquidacion, 0));
  check("(8) sobreanticipo: excedente 100.000 visible", aprox(r.excedente, 100000), `=${r.excedente}`);
}

// ── (9) REGRESIÓN: datos antiguos (sin realizaciones ni id) ───────
// Debe dar exactamente lo que da el código actual: anticipo íntegro + liq.
{
  const viejo = [{ mes:"Oct-26", usd_kg:0.10 }, { mes:"Nov-26", usd_kg:0.05 }];
  const r = resumenAnticipos(viejo, KG, 600000);
  check("(9) legacy: pendiente = acordado 150.000", aprox(r.pendiente, 150000) && aprox(r.acordado, 150000));
  check("(9) legacy: liq 450.000",                  aprox(r.liquidacion, 450000));
  check("(9) legacy: realizado 0",                  aprox(r.realizado, 0));
  check("(9) legacy: sin mutar el objeto original", viejo[0].realizaciones === undefined);
}
// Lista vacía / undefined
{
  check("(9b) sin anticipos: liq = total", aprox(resumenAnticipos([], KG, 600000).liquidacion, 600000));
  check("(9c) undefined: no rompe",        aprox(resumenAnticipos(undefined, KG, 600000).liquidacion, 600000));
}

// ── (10) Trazabilidad: alta, anulación y borrado protegido ───────
{
  let a = normalizarAnticipo({ mes:"Oct-26", usd_kg:0.10 });
  check("(10) normalizar: crea id",           !!a.id);
  check("(10) borrable sin realizaciones",    puedeBorrarAnticipo(a));
  a = agregarRealizacion(a, { fecha:"2026-09-18", usd:60000, nota:"Transf. BICE", usuario:"angelo" });
  check("(10) alta: realizado 60.000",        aprox(antRealizado(a), 60000));
  check("(10) alta: NO borrable",             !puedeBorrarAnticipo(a));
  check("(10) alta: guarda fecha/nota/usuario",
        a.realizaciones[0].fecha === "2026-09-18" && a.realizaciones[0].nota === "Transf. BICE" &&
        a.realizaciones[0].usuario === "angelo" && !!a.realizaciones[0].ts);
  const reaId = a.realizaciones[0].id;
  a = anularRealizacion(a, reaId, { motivo:"cargada dos veces", usuario:"angelo" });
  check("(10) anulación: realizado vuelve a 0", aprox(antRealizado(a), 0));
  check("(10) anulación: la fila NO se borra",  a.realizaciones.length === 1 && a.realizaciones[0].anulada === true);
  check("(10) anulación: conserva motivo",      a.realizaciones[0].motivoAnulacion === "cargada dos veces");
  check("(10) anulación: vuelve a ser borrable", puedeBorrarAnticipo(a));
  // corrección = anular + registrar la correcta
  a = agregarRealizacion(a, { fecha:"2026-09-18", usd:55000, nota:"monto corregido" });
  check("(10) corrección: realizado 55.000",    aprox(antRealizado(a), 55000));
  check("(10) corrección: histórico de 2 filas", a.realizaciones.length === 2);
}

// ── (11) Conciliación contra saldos bancarios por cuenta ─────────
// Cuentas con fechas distintas: no se usa una sola fecha para afirmar nada.
{
  const cuentas = ["2026-09-05", "2026-09-12"];
  check("(11) anterior a todas las cuentas → incluida",
        clasificarRealizacionVsSaldos("2026-09-01", cuentas) === "incluida");
  check("(11) entre la más atrasada y la más reciente → indeterminada",
        clasificarRealizacionVsSaldos("2026-09-08", cuentas) === "indeterminada");
  check("(11) posterior a todas → no_incluida",
        clasificarRealizacionVsSaldos("2026-09-20", cuentas) === "no_incluida");
  check("(11) sin saldos cargados → sin_saldos",
        clasificarRealizacionVsSaldos("2026-09-20", []) === "sin_saldos");
  check("(11) realización sin fecha → sin_fecha",
        clasificarRealizacionVsSaldos("", cuentas) === "sin_fecha");
  const a = { id:"a1", usd_kg:0.1, realizaciones:[
    { id:"r1", fecha:"2026-09-01", usd:10000 },
    { id:"r2", fecha:"2026-09-08", usd:20000 },
    { id:"r3", fecha:"2026-09-20", usd:30000 },
    { id:"r4", fecha:"2026-09-20", usd:99999, anulada:true },  // anulada: no cuenta
  ]};
  const c = conciliacionRealizaciones([[a]], cuentas);
  check("(11) conciliación incluida 10.000",      aprox(c.incluida, 10000));
  check("(11) conciliación indeterminada 20.000", aprox(c.indeterminada, 20000));
  check("(11) conciliación no_incluida 30.000",   aprox(c.no_incluida, 30000));
  check("(11) conciliación ignora anuladas",      c.detalle.length === 3);
}

// ── (11b) Pendiente sin mes proyectable → cae en la liquidación ──
// Regla de compatibilidad: una fila sin mes (o con mes fuera del horizonte)
// no se proyecta, y su pendiente NO se descuenta de la liquidación, así el
// dinero no desaparece del flujo. Lo realizado sí descuenta siempre.
{
  const sinMes = { id:"a2", mes:"", usd_kg:0.10, realizaciones:[{id:"r1", fecha:"2026-08-01", usd:25000}] };
  const r = resumenAnticipos([sinMes], KG, 600000, { esProyectable: a => !!a.mes });
  check("(11b) sin mes: pendiente proyectado 0",     aprox(r.pendiente, 0));
  check("(11b) sin mes: pendienteSinMes 75.000",     aprox(r.pendienteSinMes, 75000), `=${r.pendienteSinMes}`);
  check("(11b) sin mes: descLiq = solo realizado",   aprox(r.descuentoLiq, 25000));
  check("(11b) sin mes: liq 575.000 (no se pierde caja)", aprox(r.liquidacion, 575000), `=${r.liquidacion}`);
  check("(11b) sin mes: flujo futuro 575.000",       aprox(r.flujoPendiente, 575000));
}

// ── (12) Identidad del modelo: descLiq = realizado + pendiente ────
{
  const casos = [
    ant(0.10, [60000]), ant(0.10, [100000]), ant(0.10, [120000]),
    ant(0.10, [30000], true), ant(0.10, []), ant(0, [5000]),
  ];
  const ok = casos.every(a => aprox(antDescuentoLiq(a, KG), antRealizado(a) + antPendiente(a, KG)));
  check("(12) descLiq = realizado + pendiente en todos los casos", ok);
  const ok2 = casos.every(a => a.cerrado || aprox(antDescuentoLiq(a, KG), Math.max(antAcordado(a, KG), antRealizado(a))));
  check("(12) no cerrado: descLiq = MAX(acordado, realizado)", ok2);
}

console.log(fallos === 0 ? "\nTODOS LOS TESTS PASARON ✓" : `\n${fallos} TEST(S) FALLARON ✗`);
process.exit(fallos === 0 ? 0 : 1);
