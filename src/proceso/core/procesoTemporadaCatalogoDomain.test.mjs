/* eslint-disable */
// procesoTemporadaCatalogoDomain.test.mjs — ejecutar: node src/proceso/core/procesoTemporadaCatalogoDomain.test.mjs
//
// Decisión CFO (PRE-RC): la creación de operaciones dependientes de temporada debe validar contra
// el CATÁLOGO AUTORITATIVO de temporadas del tenant (existe + está ABIERTA), no sólo "NOT NULL".
// Esto cierra el hueco de MS-G1 (que sólo exigía que el selector no fuera "Toda temporada").
//
// Parte A — dominio: temporadaParaCrear(temporada, catalogo) rechaza una temporada NOT-NULL pero
//           cerrada/anulada/inexistente, y acepta una abierta. (autoritativo vs NOT NULL).
// Parte B — cableado: los 6 create-paths (Ordenes/Programa/Despachos/BasesCobro/ProductoTerminado/
//           Repaletizaje) pasan el catálogo `temporadas` a temporadaParaCrear (no queda ninguna
//           llamada de creación "NOT-NULL-only" `temporadaParaCrear(temporada)` sin catálogo).
//           Espeja el estilo de inspección de fuente de src/data/__tests__/qa-ux-*.

import { temporadaParaCrear, temporadaSeleccionableParaCrear, MSG_TEMPORADA_REQUERIDA } from "./procesoF7Domain.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAGES_DIR = join(__dirname, "..", "ui", "pages");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };

// ── Parte A · dominio: autoritativo (catálogo) vs NOT NULL ───────────────────
{
  const cat = [
    { empresa_id: "E1", codigo: "2026/2027", estado: "activa" },
    { empresa_id: "E1", codigo: "2027/2028", estado: "planificada" },
    { empresa_id: "E1", codigo: "2025/2026", estado: "cerrada" },
    { empresa_id: "E1", codigo: "2024/2025", estado: "anulada" },
    { empresa_id: "E1", codigo: "2019/2020", estado: "activa", deleted_at: "2020-01-01" },
  ];

  // NOT NULL pero NO autoritativa → BLOQUEA (este es el hueco que cierra la decisión CFO)
  ok(temporadaParaCrear("2025/2026", cat).error, "A: cerrada (NOT NULL) → bloquea con catálogo");
  ok(temporadaParaCrear("2024/2025", cat).error, "A: anulada (NOT NULL) → bloquea con catálogo");
  ok(temporadaParaCrear("2099/2100", cat).error, "A: inexistente (NOT NULL) → bloquea con catálogo");
  ok(temporadaParaCrear("2019/2020", cat).error, "A: borrada (deleted_at) → tratada como inexistente");

  // Abiertas → PASA
  ok(temporadaParaCrear("2026/2027", cat).codigo === "2026/2027", "A: activa → pasa");
  ok(temporadaParaCrear("2027/2028", cat).codigo === "2027/2028", "A: planificada → pasa");

  // Selector vacío → siempre requerida (NOT NULL sigue vigente como primer gate)
  ok(temporadaParaCrear("", cat).error === MSG_TEMPORADA_REQUERIDA, "A: vacío → requerida");
  ok(temporadaParaCrear(null, cat).error === MSG_TEMPORADA_REQUERIDA, "A: null → requerida");

  // Compat MS-G1: sin catálogo (o catálogo vacío) → sólo valida NOT NULL, no menos estricto que antes
  ok(temporadaParaCrear("2025/2026").codigo === "2025/2026", "A: sin catálogo → compat NOT-NULL (no rompe fallback seguro)");
  ok(temporadaParaCrear("2025/2026", []).codigo === "2025/2026", "A: catálogo vacío → compat NOT-NULL");

  // Coherencia con la primitiva de catálogo
  ok(temporadaSeleccionableParaCrear(cat, "2025/2026").error, "A: temporadaSeleccionableParaCrear cerrada → error");
  ok(temporadaSeleccionableParaCrear(cat, "2026/2027").codigo === "2026/2027", "A: temporadaSeleccionableParaCrear activa → ok");
}

// ── Parte B · cableado: los 6 create-paths pasan el catálogo `temporadas` ─────
{
  const PAGES = ["Ordenes", "Programa", "Despachos", "BasesCobro", "ProductoTerminado", "Repaletizaje"];
  for (const p of PAGES) {
    const src = readFileSync(join(PAGES_DIR, p + ".jsx"), "utf8");
    // 1) destructura `temporadas` del contexto
    ok(/const\s*\{[^}]*\btemporadas\b[^}]*\}\s*=\s*useService\(\)/.test(src),
       `B: ${p} destructura 'temporadas' de useService`);
    // 2) toda llamada de creación temporadaParaCrear(...) incluye el catálogo (2do arg)
    const llamadas = src.match(/temporadaParaCrear\s*\([^)]*\)/g) || [];
    ok(llamadas.length > 0, `B: ${p} llama a temporadaParaCrear`);
    for (const call of llamadas) {
      // debe tener 2 argumentos (coma de tope) y el 2do ser `temporadas`
      ok(/temporadaParaCrear\s*\(\s*temporada\s*,\s*temporadas\s*\)/.test(call),
         `B: ${p} pasa catálogo → ${call}`);
    }
  }
}

console.log(`\nproc_* Temporada-Catálogo (CFO PRE-RC) tests: ${pass} pasaron, ${fail} fallaron`);
if (fail > 0) process.exit(1);
console.log("TODOS LOS TESTS PASARON ✓");
