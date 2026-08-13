/* eslint-disable */
// Tests de dominio proc_* F3 (node). Ejecutar: node src/proceso/core/procesoF3Domain.test.mjs
import {
  reconciliacionPallet, balanceRepaletizaje, resultadoDisponible, puedeMaterializar,
  puedePalletizar, compatiblePallet, palletEstadoPorSaldo,
} from "./procesoF3Domain.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };
const eq = (a, b, m) => ok(a === b, `${m} (esperado ${b}, obtenido ${a})`);

// Invariante Σ líneas = saldo físico
ok(reconciliacionPallet(2000, 2000).ok, "líneas 2000 = ledger 2000 → ok");
ok(!reconciliacionPallet(2500, 2000).ok, "líneas 2500 ≠ ledger 2000 → invariante rota");

// Balance de repaletizaje (no se crean kilos)
const b = balanceRepaletizaje([{ kg: 2000 }, { kg: 2000 }], [{ kg: 3000 }, { kg: 1000 }]);
ok(b.ok, "repaletizaje 4000 origen = 4000 destino");
eq(b.diff, 0, "diff repaletizaje 0");
ok(!balanceRepaletizaje([{ kg: 2000 }], [{ kg: 2500 }]).ok, "destino > origen (crea kilos) → rechaza");

// Resultado disponible (no sobreasignación)
eq(resultadoDisponible(7800, 7800), 0, "resultado 7800 − 7800 = 0");
ok(puedeMaterializar(0, 100).ok === false, "materializar sobre 0 → rechaza");
ok(puedeMaterializar(200, 200).ok, "materializar 200 sobre 200 → ok");
ok(!puedeMaterializar(200, 201).ok, "materializar 201 sobre 200 → rechaza");

// Palletizar sobre PT
ok(puedePalletizar(4000, 2000).ok, "palletizar 2000 sobre 4000 → ok");
ok(!puedePalletizar(0, 100).ok, "palletizar sobre PT agotado → rechaza");

// Compatibilidad de pallet
const lineas = [{ especie_codigo: "CHE", formato_id: "F1" }];
ok(compatiblePallet({ especie_codigo: "CHE", formato_id: "F1" }, lineas).ok, "misma especie/formato → compatible");
ok(!compatiblePallet({ especie_codigo: "CIR", formato_id: "F1" }, lineas).ok, "especie distinta → incompatible");
ok(compatiblePallet({ especie_codigo: "CIR" }, []).ok, "pallet vacío → siempre compatible");

// Estado de pallet por saldo (Regla 11 — repaletizado no es terminal)
eq(palletEstadoPorSaldo(0, 2000), "agotado", "saldo 0 → agotado");
eq(palletEstadoPorSaldo(1500, 2000), "parcialmente_consumido", "saldo < original → parcialmente_consumido");
eq(palletEstadoPorSaldo(2000, 2000, "armando"), "disponible", "armando lleno → disponible");
eq(palletEstadoPorSaldo(500, 2000, "anulado"), "anulado", "anulado permanece anulado");

console.log(`\nproc_* F3 domain tests: ${pass} pasaron, ${fail} fallaron`);
if (fail > 0) process.exit(1);
console.log("TODOS LOS TESTS PASARON ✓");
