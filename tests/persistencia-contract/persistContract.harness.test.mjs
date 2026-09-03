/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// persistContract.harness.test.mjs — PERSIST-01..15 contra el CONTRATO NUEVO.
//
// Ejecutar:  node tests/persistencia-contract/persistContract.harness.test.mjs
//
// A diferencia de tests/persistencia/ (que porta el código MALO y sale ROJO a
// propósito), este harness ejercita src/persistencia/persistContract.js y debe salir
// 15/15 VERDE. Cada caso afirma el invariante:
//   UI "guardado" = el backend confirmó la persistencia autoritativa; ante fallo el
//   estado queda dirty, el usuario se entera, nada se descarta, retry seguro, sin
//   overwrite silencioso.
//
// PERSIST-13 además reproduce el DEFECTO VIEJO (ventana post-carga que devolvía
// resolve(true) sin escribir) y verifica que en el contrato nuevo es IMPOSIBLE.
// ═══════════════════════════════════════════════════════════════════════════════

import { crearPersistencia, MOTIVOS, construirAvisoDesde } from "../../src/persistencia/persistContract.js";
import { crearFakeSupabase } from "./fakeSupabase.mjs";

let pass = 0, fail = 0; const fallos = [];
function check(id, desc, cond, nota = "") {
  if (cond) { pass++; console.log(`✓ ${id}  ${desc}`); }
  else { fail++; fallos.push(id); console.log(`✗ FALLA ${id}  ${desc}${nota ? "  — " + nota : ""}`); }
}
// logger mudo para no ensuciar la salida del harness con los console.error esperados
const mudo = { info: () => {}, warn: () => {}, error: () => {} };

// ── modelo del blob del flujo ────────────────────────────────────────────────
const seedFin = () => ({ finanzas: { value: { finanzas_real: { Holding: { "5": { "0": { ing: 100 } } } } } } });
function setCell(blob, emp, mes, sem, vals) {
  const b = JSON.parse(JSON.stringify(blob || {}));
  if (!b.finanzas_real) b.finanzas_real = {};
  if (!b.finanzas_real[emp]) b.finanzas_real[emp] = {};
  if (!b.finanzas_real[emp][mes]) b.finanzas_real[emp][mes] = {};
  b.finanzas_real[emp][mes][sem] = vals;
  return b;
}
const cell = (db, emp, mes, sem) => db.leer("finanzas")?.value?.finanzas_real?.[emp]?.[mes]?.[sem]?.ing;

// ── PERSIST-01 · guardar manual → recargar persiste ──────────────────────────
{
  const { db, fetch } = crearFakeSupabase(seedFin());
  const P = crearPersistencia({ fetch, logger: mudo });
  const l = await P.load("finanzas");
  const r = await P.saveConfirmed("finanzas", setCell(l.value, "Holding", "5", "0", { ing: 999 }));
  check("PERSIST-01", "guardar manual → confirma y persiste; recarga lo ve",
    r.ok === true && cell(db, "Holding", "5", "0") === 999);
}

// ── PERSIST-02 · autosave → recarga (instancia nueva) persiste ───────────────
{
  const { db, fetch } = crearFakeSupabase(seedFin());
  const A = crearPersistencia({ fetch, logger: mudo });
  const la = await A.load("finanzas");
  await A.saveConfirmed("finanzas", setCell(la.value, "Holding", "5", "0", { ing: 555 }));
  const B = crearPersistencia({ fetch, logger: mudo });
  const lb = await B.load("finanzas");
  check("PERSIST-02", "autosave persiste y una recarga lo ve",
    lb.value?.finanzas_real?.Holding?.["5"]?.["0"]?.ing === 555);
}

// ── PERSIST-03 · navegar a otro módulo y volver → edición inmediata persiste ──
// El defecto viejo (R2) descartaba las ediciones en los 10 s post-montaje. Aquí,
// remontar = nueva instancia + load(); una edición inmediata DEBE persistir.
{
  const { db, fetch } = crearFakeSupabase(seedFin());
  const P = crearPersistencia({ fetch, logger: mudo });
  const l = await P.load("finanzas"); // "recién montado"
  const r = await P.saveConfirmed("finanzas", setCell(l.value, "Holding", "5", "0", { ing: 321 }));
  check("PERSIST-03", "edición al volver al módulo persiste (sin ventana ciega)",
    r.ok === true && cell(db, "Holding", "5", "0") === 321);
}

// ── PERSIST-04 · cerrar/reabrir persiste ─────────────────────────────────────
{
  const { db, fetch } = crearFakeSupabase(seedFin());
  const A = crearPersistencia({ fetch, logger: mudo });
  const la = await A.load("finanzas");
  await A.saveConfirmed("finanzas", setCell(la.value, "Holding", "5", "0", { ing: 42 }));
  const B = crearPersistencia({ fetch, logger: mudo }); // proceso nuevo
  const lb = await B.load("finanzas");
  check("PERSIST-04", "cerrar y reabrir conserva el cambio",
    lb.value?.finanzas_real?.Holding?.["5"]?.["0"]?.ing === 42);
}

// ── PERSIST-05 · dos pestañas, celdas distintas → ambas sobreviven ───────────
// Cada pestaña tiene su copia local. La 2ª choca por versión y RECOMPUTA su celda
// sobre la base fresca del servidor (computeNext en forma función). Nadie se pisa.
{
  const { db, fetch } = crearFakeSupabase(seedFin());
  const T1 = crearPersistencia({ fetch, logger: mudo }); await T1.load("finanzas");
  const T2 = crearPersistencia({ fetch, logger: mudo }); await T2.load("finanzas");
  const r1 = await T1.saveConfirmed("finanzas", (base) => setCell(base, "Holding", "5", "0", { ing: 111 }));
  const r2 = await T2.saveConfirmed("finanzas", (base) => setCell(base, "Holding", "5", "1", { ing: 222 }));
  check("PERSIST-05", "dos pestañas editan celdas distintas → ambas sobreviven",
    r1.ok && r2.ok && cell(db, "Holding", "5", "0") === 111 && cell(db, "Holding", "5", "1") === 222,
    `c0=${cell(db, "Holding", "5", "0")} c1=${cell(db, "Holding", "5", "1")}`);
}

// ── PERSIST-06 · dos usuarios, empresas distintas → ambas sobreviven ──────────
{
  const { db, fetch } = crearFakeSupabase(seedFin());
  const U1 = crearPersistencia({ fetch, logger: mudo }); await U1.load("finanzas");
  const U2 = crearPersistencia({ fetch, logger: mudo }); await U2.load("finanzas");
  await U1.saveConfirmed("finanzas", (base) => setCell(base, "Holding", "5", "0", { ing: 700 }));
  await U2.saveConfirmed("finanzas", (base) => setCell(base, "Allegria", "6", "0", { ing: 800 }));
  check("PERSIST-06", "dos usuarios editan empresas distintas → ambas sobreviven",
    cell(db, "Holding", "5", "0") === 700 && cell(db, "Allegria", "6", "0") === 800);
}

// ── PERSIST-07 · realtime entrante durante edición local sucia → sin clobber ──
{
  const { db, fetch } = crearFakeSupabase(seedFin());
  const P = crearPersistencia({ fetch, logger: mudo });
  await P.load("finanzas");
  P.marcarSucio("finanzas"); // el usuario está editando, aún sin confirmar
  const remoto = db.leer("finanzas");
  const dec = P.reconcileIncoming("finanzas", remoto.value, remoto.updated_at);
  check("PERSIST-07", "un cambio entrante NO se aplica sobre edición local sucia",
    dec.apply === false && dec.dirty === true);
}

// ── PERSIST-08 · fallo de red → NO "guardado", queda dirty ───────────────────
{
  const { db, fetch } = crearFakeSupabase(seedFin());
  const P = crearPersistencia({ fetch, logger: mudo });
  const l = await P.load("finanzas");
  db.modo = "network";
  const r = await P.saveConfirmed("finanzas", setCell(l.value, "Holding", "5", "0", { ing: 1 }));
  const aviso = construirAvisoDesde("finanzas", r);
  check("PERSIST-08", "red caída → ok:false, dirty, aviso de error (nunca guardado)",
    r.ok === false && r.motivo === MOTIVOS.RED && P.isDirty("finanzas") && aviso?.tipo === "error");
}

// ── PERSIST-09 · 401/403 → NO "guardado" ─────────────────────────────────────
{
  const { db, fetch } = crearFakeSupabase(seedFin());
  const P = crearPersistencia({ fetch, logger: mudo });
  const l = await P.load("finanzas");
  db.modo = "403";
  const r = await P.saveConfirmed("finanzas", setCell(l.value, "Holding", "5", "0", { ing: 1 }));
  check("PERSIST-09", "401/403 (RLS) → ok:false HTTP, no persiste, queda dirty",
    r.ok === false && r.motivo === MOTIVOS.HTTP && r.status === 403 && P.isDirty("finanzas") &&
    cell(db, "Holding", "5", "0") === 100);
}

// ── PERSIST-10 · guardado lento + segundo cambio → ninguno se pierde ──────────
// El estado local se acumula (como un ref de React). Dos autosaves rápidos: el 2º
// coalesce con el 1º; el último valor (con ambas celdas) es el que persiste.
{
  const { db, fetch } = crearFakeSupabase(seedFin());
  const P = crearPersistencia({ fetch, logger: mudo });
  const l = await P.load("finanzas");
  db.modo = "slow"; db.slowMs = 30;
  let local = setCell(l.value, "Holding", "5", "0", { ing: 10 });
  const p1 = P.saveConfirmed("finanzas", local);      // en vuelo
  local = setCell(local, "Holding", "5", "1", { ing: 20 }); // llega otra edición
  const p2 = P.saveConfirmed("finanzas", local);      // debe coalescer, no perder
  await Promise.all([p1, p2]);
  db.modo = "ok";
  local = setCell(local, "Holding", "5", "2", { ing: 30 });
  await P.saveConfirmed("finanzas", local);           // flush final
  check("PERSIST-10", "save lento + 2º cambio → ambos persisten (coalescencia)",
    cell(db, "Holding", "5", "0") === 10 && cell(db, "Holding", "5", "1") === 20 && cell(db, "Holding", "5", "2") === 30,
    `c0=${cell(db, "Holding", "5", "0")} c1=${cell(db, "Holding", "5", "1")} c2=${cell(db, "Holding", "5", "2")}`);
}

// ── PERSIST-11 · pestaña vieja no pisa el dato nuevo del servidor ─────────────
{
  const { db, fetch } = crearFakeSupabase(seedFin());
  const vieja = crearPersistencia({ fetch, logger: mudo }); await vieja.load("finanzas"); // cargó estado viejo
  const nueva = crearPersistencia({ fetch, logger: mudo }); await nueva.load("finanzas");
  await nueva.saveConfirmed("finanzas", (base) => setCell(base, "Allegria", "6", "0", { ing: 9000 })); // dato nuevo
  await vieja.saveConfirmed("finanzas", (base) => setCell(base, "Holding", "5", "0", { ing: 5 }));       // copia vieja
  check("PERSIST-11", "pestaña vieja no borra el dato nuevo del servidor",
    cell(db, "Allegria", "6", "0") === 9000 && cell(db, "Holding", "5", "0") === 5,
    `allegria=${cell(db, "Allegria", "6", "0")}`);
}

// ── PERSIST-12 · RLS: permitido persiste; denegado no reporta éxito ──────────
{
  const { db: d1, fetch: f1 } = crearFakeSupabase(seedFin());
  const A = crearPersistencia({ fetch: f1, logger: mudo }); const la = await A.load("finanzas");
  const rOk = await A.saveConfirmed("finanzas", setCell(la.value, "Holding", "5", "0", { ing: 77 }));
  const { db: d2, fetch: f2 } = crearFakeSupabase(seedFin());
  const B = crearPersistencia({ fetch: f2, logger: mudo }); const lb = await B.load("finanzas");
  d2.modo = "403";
  const rDen = await B.saveConfirmed("finanzas", setCell(lb.value, "Holding", "5", "0", { ing: 77 }));
  check("PERSIST-12", "RLS permitido persiste; denegado → ok:false y no persiste",
    rOk.ok && cell(d1, "Holding", "5", "0") === 77 && rDen.ok === false && cell(d2, "Holding", "5", "0") === 100);
}

// ── PERSIST-13 · la falsa-éxito post-carga es IMPOSIBLE ───────────────────────
// Defecto viejo (FinanzasModule.jsx:11679-11682): en los 10 s tras montar/cambiar
// de Modelo, persistAll devolvía Promise.resolve(true) SIN escribir → "✅ Guardado"
// falso. Reproducción del contrato viejo vs nuevo:
{
  // (a) contrato VIEJO reproducido inline → devuelve true sin tocar el backend:
  const viejoPersistAll = (finLoadTime) => {
    if (finLoadTime && (Date.now() - finLoadTime) < 10000) return true; // :11679-11682
    return "habría escrito";
  };
  const viejoFingeExito = viejoPersistAll(Date.now()) === true;

  // (b) contrato NUEVO: inmediatamente tras load(), un save con la red caída NO puede
  // devolver éxito (no hay ventana que lo enmascare).
  const { db, fetch } = crearFakeSupabase(seedFin());
  const P = crearPersistencia({ fetch, logger: mudo });
  const l = await P.load("finanzas"); // recién "montado": la ventana vieja estaría abierta
  db.modo = "network";
  const r = await P.saveConfirmed("finanzas", setCell(l.value, "Holding", "5", "0", { ing: 8 }));
  check("PERSIST-13", "la ventana de falso-éxito post-carga es imposible en el contrato nuevo",
    viejoFingeExito === true && r.ok === false && P.isDirty("finanzas"),
    `viejo fingió=${viejoFingeExito}, nuevo ok=${r.ok}`);
}

// ── PERSIST-14 · HTTP 2xx pero fila/versión no confirmada → NO saved ─────────
{
  const { db, fetch } = crearFakeSupabase(seedFin());
  const P = crearPersistencia({ fetch, logger: mudo });
  const l = await P.load("finanzas");
  db.modo = "mismatch"; // el servidor responde 2xx pero sin representación válida
  const r = await P.saveConfirmed("finanzas", setCell(l.value, "Holding", "5", "0", { ing: 3 }));
  check("PERSIST-14", "2xx sin confirmación de fila/versión → ok:false (sin_confirmacion), dirty",
    r.ok === false && r.motivo === MOTIVOS.SIN_CONFIRMACION && P.isDirty("finanzas"));
}

// ── PERSIST-15 · un error fire-and-forget no se puede ocultar ────────────────
// Aunque el caller IGNORE el resultado de saveConfirmed, el estado dirty persiste y
// flush() reporta el fallo real. No hay `.catch(()=>{})` que trague nada.
{
  const { db, fetch } = crearFakeSupabase(seedFin());
  const P = crearPersistencia({ fetch, logger: mudo });
  const l = await P.load("finanzas");
  db.modo = "network";
  P.saveConfirmed("finanzas", setCell(l.value, "Holding", "5", "0", { ing: 9 })); // resultado IGNORADO
  const f = await P.flush("finanzas");
  check("PERSIST-15", "error fire-and-forget queda visible: dirty + flush().ok=false",
    P.isDirty("finanzas") === true && f.ok === false && f.pendiente === true);
}

// ── EXTRA · filas-colección (rendiciones/maestros): fusión por ítem ──────────
// El mismo contrato debe cubrir las filas que son ARREGLO de ítems con `id`.
// Dos usuarios agregan ítems distintos → ambos sobreviven vía fusión, sin conflicto.
{
  const seedCol = { rendiciones: { value: [{ id: "r1", monto: 10 }] } };
  const { db, fetch } = crearFakeSupabase(seedCol);
  const U1 = crearPersistencia({ fetch, logger: mudo }); const l1 = await U1.load("rendiciones");
  const U2 = crearPersistencia({ fetch, logger: mudo }); const l2 = await U2.load("rendiciones");
  await U1.saveConfirmed("rendiciones", [...l1.value, { id: "r2", monto: 20 }], { merge: true });
  const r2 = await U2.saveConfirmed("rendiciones", [...l2.value, { id: "r3", monto: 30 }], { merge: true });
  const ids = (db.leer("rendiciones")?.value || []).map(x => x.id).sort().join(",");
  check("PERSIST-EXTRA-COL", "filas-colección: dos altas concurrentes → fusión sin pérdida",
    r2.ok && r2.fusionado && ids === "r1,r2,r3", `ids=${ids}`);
}
// reconcileIncoming con merge: edición local sucia + entrante ajeno → se combinan.
{
  const seedCol = { rendiciones: { value: [{ id: "r1", monto: 10 }] } };
  const { db, fetch } = crearFakeSupabase(seedCol);
  const P = crearPersistencia({ fetch, logger: mudo }); const l = await P.load("rendiciones");
  P.marcarSucio("rendiciones");
  const local = [...l.value, { id: "rLocal", monto: 99 }];       // mi edición sin guardar
  const remoto = [{ id: "r1", monto: 10 }, { id: "rAjeno", monto: 5 }]; // llegó de otro
  const dec = P.reconcileIncoming("rendiciones", remoto, "vX", { merge: true, localValue: local });
  const ids = (dec.value || []).map(x => x.id).sort().join(",");
  check("PERSIST-EXTRA-RT", "realtime + dirty en colección → fusión no destructiva",
    dec.apply === true && dec.fusionado && ids === "r1,rAjeno,rLocal", `ids=${ids}`);
}

console.log(`\n${pass} OK · ${fail} FALLA`);
if (fail) { console.log(`\nCasos en rojo: ${fallos.join(", ")}`); process.exitCode = 1; }
else console.log(`\n✅ 15/15 — el contrato nuevo cumple el invariante en todos los casos.`);
