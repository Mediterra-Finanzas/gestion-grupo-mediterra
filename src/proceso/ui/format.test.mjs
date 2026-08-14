/* eslint-disable */
// Tests de normalización + formateo (node). node src/proceso/ui/format.test.mjs
import { normalizarNombre, claveNormalizada, sonMismaEntidad, sugerenciaCercana, formatKg, formatPct, formatFecha, formatFechaHora, formatNum, formatTarifa, formatMoneda } from "./format.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };
const eq = (a, b, m) => ok(a === b, `${m} (esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)})`);

// Normalización de nombres (§43)
eq(normalizarNombre("AGROKASA"), "Agrokasa", "AGROKASA -> Agrokasa");
eq(normalizarNombre("agrokasa"), "Agrokasa", "agrokasa -> Agrokasa");
eq(normalizarNombre("AgroKasa"), "Agrokasa", "AgroKasa -> Agrokasa");
eq(normalizarNombre("AGRICOLA RIO BLANCO SPA"), "Agricola Rio Blanco SpA", "sufijo SpA + title (sin inventar acentos)");
eq(normalizarNombre("ANTON DÜRBECK GMBH"), "Anton Dürbeck GmbH", "acentos preservados + GmbH");
eq(normalizarNombre("anton dürbeck gmbh"), "Anton Dürbeck GmbH", "lower -> Anton Dürbeck GmbH");
eq(normalizarNombre("agroindustrias del pacifico s.a.c."), "Agroindustrias del Pacifico SAC", "conector 'del' minúscula + SAC");
eq(normalizarNombre("  export   frut  "), "Export Frut", "colapsa espacios + trim");
eq(normalizarNombre("frigorifico rio-blanco ltda"), "Frigorifico Rio-Blanco Ltda.", "guion interno + Ltda.");

// Idempotencia (§43)
const casos = ["AGROKASA", "agrokasa", "AGRICOLA RIO BLANCO SPA", "ANTON DÜRBECK GMBH", "agroindustrias del pacifico s.a.c."];
for (const c of casos) eq(normalizarNombre(normalizarNombre(c)), normalizarNombre(c), `idempotente: ${c}`);

// Dedup por clave normalizada (§44)
ok(sonMismaEntidad("AGROKASA", "Agrokasa"), "AGROKASA == Agrokasa (misma entidad)");
ok(sonMismaEntidad("Anton Dürbeck GmbH", "anton durbeck gmbh"), "acento-insensible en clave");
ok(!sonMismaEntidad("Agrokasa", "Agrofresh"), "distintas no colapsan");
eq(claveNormalizada("Anton Dürbeck GmbH"), "anton durbeck gmbh", "clave normalizada");

// Sugerencia cercana (§17/§44) — NO auto-merge
const cands = [{ id: 1, nombre: "Anton Dürbeck GmbH" }, { id: 2, nombre: "Agrokasa" }];
ok(sugerenciaCercana("Anton Durbeck", cands)?.candidato?.id === 1, "'Anton Durbeck' sugiere Anton Dürbeck GmbH");
ok(sugerenciaCercana("Totalmente Otra Cosa", cands) == null, "sin cercano -> null");
ok(sugerenciaCercana("Anton Dürbeck GmbH", cands) == null, "idéntico no se sugiere a sí mismo");

// Formatters
eq(formatKg(125400), "125.400 kg", "formatKg miles");
eq(formatKg(9800.5), "9.800,5 kg", "formatKg decimal");
eq(formatPct(0.7959), "79,6%", "formatPct");
eq(formatNum(1560), "1.560", "formatNum miles");
eq(formatFecha("2026-08-14T10:30:00Z"), "14-08-2026", "formatFecha dd-mm-yyyy");
ok(/14-08-2026 \d{2}:\d{2}/.test(formatFechaHora("2026-08-14T10:30:00")), "formatFechaHora");
eq(formatKg(null), "—", "null -> guion");
eq(formatTarifa(0.3, "USD"), "USD 0,30", "tarifa 2 decimales mínimo");
eq(formatTarifa(0.3005, "USD"), "USD 0,3005", "tarifa preserva 4 decimales");
eq(formatMoneda(2940, "USD"), "USD 2.940,00", "monto moneda");

console.log(`\nproc_* F7.6.1 format/normalización tests: ${pass} pasaron, ${fail} fallaron`);
if (fail > 0) process.exit(1);
console.log("TODOS LOS TESTS PASARON ✓");
