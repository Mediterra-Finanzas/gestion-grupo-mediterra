/* eslint-disable */
// F-02 · Tests del ciclo de vida de RESERVAS de despacho (node, sin navegador).
// Ejecutar: node src/proceso/core/procesoF7Reservas.test.mjs
// Cubre: (1) el montaje rehidrata la carga desde los holds del servidor (mock),
// (2) reservar es idempotente, (3) liberar libera, (4) un F5/reload no deja pallets
// varados ni duplica disponibilidad. La DB es la autoridad; acá se prueba la lógica
// pura que la UI (Despacho.jsx) usa para reconstruir/mantener la carga.
import {
  mapReservasACarga, agregarReservaIdempotente, quitarReservaDeCarga,
} from "./procesoF7Domain.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };
const eq = (a, b, m) => ok(a === b, `${m} (esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)})`);

const DESP = "desp-1";
// Holds tal como los devolvería proc_v_pallet_hold para este despacho.
const holdsServidor = [
  { id: "h1", pallet_id: "pA", tipo: "reserva", estado: "activo", cantidad: 500, ref_tipo: "despacho", ref_id: DESP, despacho_folio: "DES-2627-000001" },
  { id: "h2", pallet_id: "pB", tipo: "reserva", estado: "activo", cantidad: 300, ref_tipo: "despacho", ref_id: DESP, despacho_folio: "DES-2627-000001" },
];
const codigoMap = { pA: "PAL-A", pB: "PAL-B" };

// ── (1) MONTAJE: rehidrata la carga desde los holds del servidor ──────────────
const rehidratada = mapReservasACarga(holdsServidor, codigoMap);
eq(rehidratada.length, 2, "rehidrata 2 pallets reservados desde el servidor");
eq(rehidratada[0].palletId, "pA", "rehidrata palletId pA");
eq(rehidratada[0].codigo, "PAL-A", "resuelve codigo desde el mapa de bodega");
eq(rehidratada[0].kg, 500, "kg viene de la cantidad del hold (autoridad)");
eq(rehidratada[1].kg, 300, "kg del segundo pallet");
ok(rehidratada.every((r) => r.rehidratada === true), "marca las filas como rehidratadas");
ok(rehidratada.every((r) => r.cajas === 0), "cajas=0 (no se persisten en el hold)");
// total rehidratado == suma reservada en el servidor (no se pierde ni se dobla)
eq(rehidratada.reduce((a, r) => a + r.kg, 0), 800, "total carga rehidratada = total reservado servidor");

// Holds liberados/otros tipos NO entran a la carga.
const mezcla = [
  ...holdsServidor,
  { id: "h3", pallet_id: "pC", tipo: "reserva", estado: "liberado", cantidad: 100, ref_tipo: "despacho", ref_id: DESP },
  { id: "h4", pallet_id: "pD", tipo: "bloqueo", estado: "activo", cantidad: 50, ref_tipo: "bodega", ref_id: null },
];
eq(mapReservasACarga(mezcla, codigoMap).length, 2, "ignora holds liberados y de tipo bloqueo");

// Sin codigo en el mapa → codigo null (la UI cae a palletId, no rompe).
eq(mapReservasACarga(holdsServidor, {})[0].codigo, null, "codigo null si el pallet no está en bodega");

// Múltiples holds activos del mismo pallet (bug histórico) → 1 fila, kg sumado, duplicado=true.
const dobles = [
  { id: "h1", pallet_id: "pA", tipo: "reserva", estado: "activo", cantidad: 500, ref_tipo: "despacho", ref_id: DESP },
  { id: "h1b", pallet_id: "pA", tipo: "reserva", estado: "activo", cantidad: 200, ref_tipo: "despacho", ref_id: DESP },
];
const colapsado = mapReservasACarga(dobles, codigoMap);
eq(colapsado.length, 1, "colapsa holds duplicados del mismo pallet a una fila");
eq(colapsado[0].kg, 700, "kg de la fila = suma de holds (cuadra con reservado de saldos)");
ok(colapsado[0].duplicado === true, "marca duplicado=true cuando había >1 hold");

// ── (2) RESERVAR es IDEMPOTENTE ───────────────────────────────────────────────
let carga = [];
let r1 = agregarReservaIdempotente(carga, { palletId: "pA", codigo: "PAL-A", kg: 500, cajas: 10 });
carga = r1.carga;
eq(carga.length, 1, "primer reserva agrega el pallet");
ok(r1.duplicada === false, "primer reserva no es duplicada");
let r2 = agregarReservaIdempotente(carga, { palletId: "pA", codigo: "PAL-A", kg: 500, cajas: 10 });
eq(r2.carga.length, 1, "reservar el MISMO pallet no lo duplica (idempotente)");
ok(r2.duplicada === true, "segunda reserva del mismo pallet marca duplicada=true");
// doble click / doble montaje sobre carga rehidratada tampoco duplica
const rehid = mapReservasACarga(holdsServidor, codigoMap);
eq(agregarReservaIdempotente(rehid, { palletId: "pA", kg: 500 }).carga.length, 2,
  "no re-agrega un pallet que ya vino rehidratado del servidor");

// ── (3) LIBERAR libera ────────────────────────────────────────────────────────
let cargaL = mapReservasACarga(holdsServidor, codigoMap); // [pA, pB]
cargaL = quitarReservaDeCarga(cargaL, "pA");
eq(cargaL.length, 1, "liberar pA deja solo pB");
eq(cargaL[0].palletId, "pB", "queda pB tras liberar pA");
// idempotente: liberar algo que no está no rompe
eq(quitarReservaDeCarga(cargaL, "pZ").length, 1, "liberar un pallet ausente es no-op");

// ── (4) RELOAD no deja varados ni duplica disponibilidad ──────────────────────
// Escenario: el usuario reservó pA (hold activo en el servidor) y recarga (F5).
// ANTES del fix la carga arrancaba en [] → pA quedaba varado (reservado invisible).
// Con el fix, el montaje rehidrata desde el servidor y la carga vuelve a mostrar pA.
const cargaTrasReload = mapReservasACarga(
  [{ id: "h1", pallet_id: "pA", tipo: "reserva", estado: "activo", cantidad: 500, ref_tipo: "despacho", ref_id: DESP }],
  codigoMap,
);
eq(cargaTrasReload.length, 1, "F5: la carga se reconstruye desde el hold (no queda varado)");
eq(cargaTrasReload[0].palletId, "pA", "F5: el pallet reservado reaparece en la carga");
// Y volver a intentar reservarlo tras el reload NO crea un segundo hold (no dobla disponible).
ok(agregarReservaIdempotente(cargaTrasReload, { palletId: "pA", kg: 500 }).duplicada === true,
  "F5: reintentar reservar el mismo pallet es rechazado en cliente (no dobla el hold)");

// bordes
eq(mapReservasACarga(null, null).length, 0, "mapReservasACarga tolera null");
eq(mapReservasACarga([], {}).length, 0, "mapReservasACarga con [] → []");
eq(agregarReservaIdempotente(null, { palletId: "x" }).carga.length, 1, "agregar tolera carga null");
eq(quitarReservaDeCarga(null, "x").length, 0, "quitar tolera carga null");

console.log(`\nF-02 reservas despacho tests: ${pass} pasaron, ${fail} fallaron`);
if (fail > 0) { console.error("HAY TESTS FALLIDOS ✗"); process.exit(1); }
else console.log("TODOS LOS TESTS PASARON ✓");
