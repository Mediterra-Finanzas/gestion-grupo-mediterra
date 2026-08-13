/* eslint-disable */
// Tests de dominio proc_* F4 (node). Ejecutar: node src/proceso/core/procesoF4Domain.test.mjs
import {
  disponiblePallet, puedeReservar, puedeDespachar, conciliacionDespacho,
  transicionDespachoValida, despachoEditable, saldoTrasDespacho, palletSigueOperable,
} from "./procesoF4Domain.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };
const eq = (a, b, m) => ok(a === b, `${m} (esperado ${b}, obtenido ${a})`);

// Reserva reduce libre, no físico
eq(disponiblePallet(3000, 3000, 0), 0, "físico 3000, reservado 3000 → disponible 0");
ok(puedeReservar(3000, 3000).ok, "reservar 3000 de 3000 → ok");
ok(!puedeReservar(0, 100).ok, "reservar sobre disponible 0 → rechaza");
ok(!puedeReservar(3000, 5000).ok, "reservar > disponible → rechaza");

// Despacho
ok(puedeDespachar(3000, 3000).ok, "despachar 3000 de 3000 → ok");
ok(!puedeDespachar(1000, 2000).ok, "despachar > disponible → rechaza");

// Conciliación despacho (Σ líneas = Σ movimientos)
ok(conciliacionDespacho(2000, 2000).ok, "líneas 2000 = movimientos 2000");
ok(!conciliacionDespacho(2000, 1500).ok, "líneas ≠ movimientos → descuadre");

// Máquina de estados
ok(transicionDespachoValida("borrador", "preparando"), "borrador→preparando");
ok(transicionDespachoValida("cargando", "despachado"), "cargando→despachado");
ok(!transicionDespachoValida("listo", "despachado"), "listo→despachado RECHAZA (pasa por cargando)");
ok(transicionDespachoValida("despachado", "cancelado"), "despachado→cancelado (reversa)");
ok(!transicionDespachoValida("despachado", "despachado"), "despachado no editable");
ok(!transicionDespachoValida("cancelado", "borrador"), "cancelado terminal");
ok(!despachoEditable("despachado"), "despachado no editable libremente");
ok(!despachoEditable("cancelado"), "cancelado no editable");
ok(despachoEditable("preparando"), "preparando editable");

// Despacho parcial: pallet conserva saldo e identidad
eq(saldoTrasDespacho(3800, 2000), 1800, "3800 − 2000 = 1800 saldo");
ok(palletSigueOperable(1800), "pallet con saldo 1800 sigue operable");
ok(!palletSigueOperable(0), "pallet en 0 no operable (agotado)");

console.log(`\nproc_* F4 domain tests: ${pass} pasaron, ${fail} fallaron`);
if (fail > 0) process.exit(1);
console.log("TODOS LOS TESTS PASARON ✓");
