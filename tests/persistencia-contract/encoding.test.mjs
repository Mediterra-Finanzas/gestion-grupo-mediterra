/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// encoding.test.mjs — ENC-01..07 · backward-compat de codificación física (F0-C).
//
// Ejecutar:  node tests/persistencia-contract/encoding.test.mjs
//
// CONTEXTO. F0-B enrutó los writers por la capability, pero la capability escribía
// `value` como OBJETO jsonb, mientras las filas VIVAS están string-encoded (un JSON
// string dentro del jsonb). Una pestaña en el bundle VIEJO que leyera una fila
// migrada con `JSON.parse(value)` incondicional se rompería (parse sobre un objeto),
// y un rollback del frontend sería inseguro. F0-C preserva la codificación FÍSICA de
// CADA fila en cada escritura, sin migración incidental de formato.
//
// El fake almacena `value` EXACTAMENTE como lo manda el cliente (string u objeto),
// como jsonb real, y expone `db.rawValue(id)` (físico en disco) y `db.encoding(id)`.
// ═══════════════════════════════════════════════════════════════════════════════

import { crearPersistencia, MOTIVOS } from "../../src/persistencia/persistContract.js";
import { crearFakeSupabase } from "./fakeSupabase.mjs";

let pass = 0, fail = 0; const fallos = [];
function check(id, desc, cond, nota = "") {
  if (cond) { pass++; console.log(`✓ ${id}  ${desc}`); }
  else { fail++; fallos.push(id); console.log(`✗ FALLA ${id}  ${desc}${nota ? "  — " + nota : ""}`); }
}
const mudo = { info: () => {}, warn: () => {}, error: () => {} };

// Emula el LECTOR VIEJO (bundle previo a F0): hacía JSON.parse(value) SIN condicionar
// al tipo. Sobre un físico string devuelve el objeto; sobre un objeto jsonb LANZA.
function lectorViejoJSONParse(fisico) { return JSON.parse(fisico); }

// ── ENC-01 · fila leída como STRING → guardar → sigue STRING en disco ────────────
{
  const { db, fetch } = crearFakeSupabase({ finanzas: { value: { a: 1 }, encoding: "string" } });
  const P = crearPersistencia({ fetch, logger: mudo });
  const l = await P.load("finanzas");
  const r = await P.saveConfirmed("finanzas", { ...l.value, a: 2 });
  check("ENC-01", "fila string-encoded → save preserva STRING en disco",
    r.ok === true && db.encoding("finanzas") === "string" && typeof db.rawValue("finanzas") === "string" &&
    db.leer("finanzas").value.a === 2 && P.estado("finanzas").encoding === "string",
    `enc=${db.encoding("finanzas")} raw=${typeof db.rawValue("finanzas")}`);
}

// ── ENC-02 · fila leída como OBJETO → guardar → sigue OBJETO ─────────────────────
{
  const { db, fetch } = crearFakeSupabase({ main: { value: { u: ["x"] }, encoding: "object" } });
  const P = crearPersistencia({ fetch, logger: mudo });
  const l = await P.load("main");
  const r = await P.saveConfirmed("main", { ...l.value, u: ["x", "y"] });
  check("ENC-02", "fila objeto jsonb → save preserva OBJETO en disco",
    r.ok === true && db.encoding("main") === "object" && typeof db.rawValue("main") === "object" &&
    db.leer("main").value.u.length === 2 && P.estado("main").encoding === "object",
    `enc=${db.encoding("main")} raw=${typeof db.rawValue("main")}`);
}

// ── ENC-03 · lector legacy (JSON.parse) lee el resultado de un save string ───────
{
  const { db, fetch } = crearFakeSupabase({ finanzas: { value: { a: 1 }, encoding: "string" } });
  const P = crearPersistencia({ fetch, logger: mudo });
  const l = await P.load("finanzas");
  await P.saveConfirmed("finanzas", { ...l.value, a: 7, b: 8 });
  const fisico = db.rawValue("finanzas");
  const leidoViejo = lectorViejoJSONParse(fisico); // como el bundle viejo
  check("ENC-03", "lector legacy JSON.parse(value) lee bien un save string-encoded",
    typeof fisico === "string" && leidoViejo && leidoViejo.a === 7 && leidoViejo.b === 8,
    `raw=${typeof fisico}`);
}

// ── ENC-04 · rollback-safety: JSON.parse incondicional NO lanza tras un save ─────
// Un save sobre una fila string-encoded debe dejar el disco como STRING, de modo que
// el bundle VIEJO (JSON.parse incondicional) siga funcionando tras un rollback.
{
  const { db, fetch } = crearFakeSupabase({ finanzas: { value: { seccion: { c: 1 } }, encoding: "string" } });
  const P = crearPersistencia({ fetch, logger: mudo });
  const l = await P.load("finanzas");
  await P.saveConfirmed("finanzas", { seccion: { c: 99 } });
  let lanzo = false, valor = null;
  try { valor = lectorViejoJSONParse(db.rawValue("finanzas")); } catch { lanzo = true; }
  check("ENC-04", "rollback: lector viejo (JSON.parse incondicional) NO lanza tras el save",
    lanzo === false && valor && valor.seccion.c === 99,
    `lanzo=${lanzo}`);
}

// ── ENC-05 · conflicto optimista sigue funcionando Y preserva la codificación ────
// Dos instancias string-encoded: la 2ª choca por versión. Con `next` función el
// contrato recomputa sobre la base fresca y reintenta; el disco queda STRING.
{
  const { db, fetch } = crearFakeSupabase({ finanzas: { value: { real: {} }, encoding: "string" } });
  const T1 = crearPersistencia({ fetch, logger: mudo }); await T1.load("finanzas");
  const T2 = crearPersistencia({ fetch, logger: mudo }); await T2.load("finanzas");
  const r1 = await T1.saveConfirmed("finanzas", (base) => ({ ...base, real: { ...(base.real || {}), h: 1 } }));
  const r2 = await T2.saveConfirmed("finanzas", (base) => ({ ...base, real: { ...(base.real || {}), a: 2 } }));
  const disco = db.leer("finanzas").value.real;
  check("ENC-05", "conflicto optimista OK + disco sigue STRING (ambas ediciones sobreviven)",
    r1.ok && r2.ok && r2.fusionado === true && disco.h === 1 && disco.a === 2 &&
    db.encoding("finanzas") === "string",
    `enc=${db.encoding("finanzas")} disco=${JSON.stringify(disco)}`);
}

// ── ENC-06 · sin doble-stringify: el físico string es UN solo JSON.stringify ─────
// El disco debe ser el JSON del OBJETO (parseable a objeto en un paso), NO un string
// stringificado dos veces (que parsearía a un string).
{
  const { db, fetch } = crearFakeSupabase({ finanzas: { value: { a: 1 }, encoding: "string" } });
  const P = crearPersistencia({ fetch, logger: mudo });
  const l = await P.load("finanzas");
  await P.saveConfirmed("finanzas", { ...l.value, a: 5 });
  const fisico = db.rawValue("finanzas");
  const unParse = JSON.parse(fisico); // un solo parse → debe dar OBJETO, no string
  check("ENC-06", "sin doble-stringify: un JSON.parse del físico da un OBJETO",
    typeof fisico === "string" && typeof unParse === "object" && unParse !== null &&
    !Array.isArray(unParse) && unParse.a === 5,
    `unParse tipo=${typeof unParse}`);
}

// ── ENC-07 · sin corrupción / sin null accidental en el save ─────────────────────
{
  const original = { real: { Holding: { "5": { "0": { ing: 100 } } } }, meta: { v: 1 } };
  const { db, fetch } = crearFakeSupabase({ finanzas: { value: original, encoding: "string" } });
  const P = crearPersistencia({ fetch, logger: mudo });
  const l = await P.load("finanzas");
  const next = JSON.parse(JSON.stringify(l.value));
  next.real.Holding["5"]["0"].ing = 250;
  const r = await P.saveConfirmed("finanzas", next);
  const disco = db.leer("finanzas");
  const fisico = db.rawValue("finanzas");
  check("ENC-07", "save sin corrupción ni null: fila íntegra, versión nueva, codificación intacta",
    r.ok === true && fisico != null && disco != null && disco.value != null &&
    disco.value.real.Holding["5"]["0"].ing === 250 && disco.value.meta.v === 1 &&
    typeof disco.updated_at === "string" && disco.updated_at.length > 0 &&
    db.encoding("finanzas") === "string",
    `disco=${JSON.stringify(disco.value?.meta)}`);
}

console.log(`\n${pass} OK · ${fail} FALLA`);
if (fail) { console.log(`\nCasos en rojo: ${fallos.join(", ")}`); process.exitCode = 1; }
else console.log(`\n✅ ENC-01..07 — la codificación física se preserva; el rollback del frontend es seguro.`);
