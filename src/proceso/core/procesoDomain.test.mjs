/* eslint-disable */
// Tests de dominio proc_* (node nativo). Ejecutar: node src/proceso/core/procesoDomain.test.mjs
// Cubre las invariantes críticas F1 (ajuste #16): identidad XOR, kg recepción,
// saldo derivado del ledger, consumo, reversa, holds (disponibilidad ≠ físico),
// conciliación de masa sin doble descuento.
import {
  computeSaldoLote, onHandFromMovimientos, validarKgRecepcion, validarVinculoRef,
  puedeConsumir, reversaNaturaleza, conciliacionMasa, kg3, NATURALEZA, TIPOS_MOV,
} from "./procesoDomain.js";

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + msg); } }
function eq(a, b, msg) { ok(a === b, `${msg} (esperado ${b}, obtenido ${a})`); }

// ── Identidad XOR ────────────────────────────────────────────────────────────
ok(validarVinculoRef({ grupo_empresa_id: "g" }).ok, "vínculo: solo grupo → ok");
ok(validarVinculoRef({ auxiliar_id: "a" }).ok, "vínculo: solo auxiliar → ok");
ok(validarVinculoRef({ pendiente_alta_corporativa: true, nombre_provisional: "X SpA" }).ok, "vínculo: pendiente con nombre → ok");
ok(!validarVinculoRef({ grupo_empresa_id: "g", auxiliar_id: "a" }).ok, "vínculo: grupo + auxiliar → RECHAZA (no doble identidad)");
ok(!validarVinculoRef({}).ok, "vínculo: ninguna identidad → RECHAZA");
ok(!validarVinculoRef({ pendiente_alta_corporativa: true }).ok, "vínculo: pendiente sin nombre → RECHAZA");

// ── kg de recepción ──────────────────────────────────────────────────────────
ok(validarKgRecepcion({ kg_neto: 10000, kg_bruto: 10200 }).ok, "recepción: kg válidos → ok");
ok(!validarKgRecepcion({ kg_neto: 0 }).ok, "recepción: kg_neto 0 → RECHAZA");
ok(!validarKgRecepcion({ kg_neto: -5 }).ok, "recepción: kg_neto negativo → RECHAZA");
ok(!validarKgRecepcion({ kg_neto: 10300, kg_bruto: 10200 }).ok, "recepción: neto > bruto → RECHAZA");

// ── Saldo derivado del ledger (SoT) ──────────────────────────────────────────
const movs = [
  { naturaleza: NATURALEZA.ENTRADA, cantidad: 10000 }, // recepción
  { naturaleza: NATURALEZA.SALIDA,  cantidad: 3000 },  // consumo
];
eq(onHandFromMovimientos(movs), 7000, "on_hand = 10000 − 3000");
const saldo = computeSaldoLote(movs, [{ tipo: "bloqueo", cantidad: 1000, estado: "activo" }, { tipo: "reserva", cantidad: 500, estado: "activo" }]);
eq(saldo.on_hand, 7000, "saldo.on_hand físico");
eq(saldo.bloqueado, 1000, "saldo.bloqueado");
eq(saldo.reservado, 500, "saldo.reservado");
eq(saldo.disponible, 5500, "disponible = 7000 − 1000 − 500 (sin doble descuento)");

// Hold liberado no cuenta.
const saldo2 = computeSaldoLote(movs, [{ tipo: "bloqueo", cantidad: 1000, estado: "liberado" }]);
eq(saldo2.disponible, 7000, "hold liberado no reduce disponibilidad");

// Hold reduce disponibilidad pero NO el físico.
eq(saldo.on_hand, 7000, "hold NO cambia stock físico");

// ── Consumo ──────────────────────────────────────────────────────────────────
ok(puedeConsumir(5500, 5000).ok, "consumo dentro de disponible → ok");
ok(!puedeConsumir(5500, 6000).ok, "consumo > disponible → RECHAZA");
ok(!puedeConsumir(5500, 0).ok, "consumo 0 → RECHAZA");

// ── Reversa: saldo correcto y conserva historia ──────────────────────────────
eq(reversaNaturaleza(NATURALEZA.ENTRADA), NATURALEZA.SALIDA, "reversa de entrada = salida");
const conReversa = [
  { naturaleza: NATURALEZA.ENTRADA, cantidad: 10000 },          // recepción errónea
  { naturaleza: NATURALEZA.SALIDA,  cantidad: 10000, es_reversa: true }, // reversa
  { naturaleza: NATURALEZA.ENTRADA, cantidad: 9800 },           // recepción corregida
];
eq(onHandFromMovimientos(conReversa), 9800, "tras reversa + corrección → on_hand 9800");
eq(conReversa.length, 3, "la historia se conserva (3 movimientos, ningún borrado)");

// ── Conciliación de masa (descarte/merma nacen del proceso, no del lote) ─────
const c = conciliacionMasa(9800, { producto: 7800, descarte: 1700, merma: 300 }, 0.5);
ok(c.ok, "conciliación 7800+1700+300 = 9800 dentro de tolerancia");
eq(c.diff, 0, "diferencia de masa = 0");
const c2 = conciliacionMasa(9800, { producto: 7800, descarte: 1700, merma: 200 }, 0.5);
ok(!c2.ok, "faltan 100 kg (> tolerancia 49) → descuadre detectado");

// ── Precisión numérica ───────────────────────────────────────────────────────
eq(kg3(0.1 + 0.2), 0.3, "kg3 evita ruido de float (0.1+0.2)");

console.log(`\nproc_* domain tests: ${pass} pasaron, ${fail} fallaron`);
if (fail > 0) process.exit(1);
console.log("TODOS LOS TESTS PASARON ✓");
