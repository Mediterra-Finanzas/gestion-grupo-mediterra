/* ─────────────────────────────────────────────────────────────────────────
   PRUEBA AISLADA del respaldo seguro (auto-v4). No toca producción: REST y
   Storage de Supabase se emulan en memoria con un fetch inyectado.

   Recorre el ciclo completo y sale con código 1 si algo falla:
     1. Ejecución: respaldo diario + verificación de ida y vuelta.
     2. Exclusión de credenciales: ningún PIN, hash, token ni JWT en Storage.
     3. Retención: 400 días simulados → 30 diarios + 12 mensuales.
     4. Recuperación: se "pierde" la fila finanzas y se restaura; el contenido
        vuelve idéntico, las credenciales ACTUALES se conservan, pins no se toca.
     5. Seguridad: conflicto de versión no escribe; respaldo corrupto se rechaza;
        el cron sin CRON_SECRET responde 401.
   Uso:  node scripts/respaldo/prueba-aislada.mjs  [OUT_DIR=/ruta para el informe]
   ───────────────────────────────────────────────────────────────────────── */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import R from "../../api/_respaldo.js";

let ok = 0, fallos = 0; const log = [];
const check = (n, c, extra = "") => { (c ? ok++ : fallos++); log.push(`${c ? "✓" : "✗ FALLA"}  ${n}${extra ? "  — " + extra : ""}`); };

// ── Datos de prueba con credenciales sembradas a propósito ────────────────
const SECRETOS = { pinPlano: "482913", pinTemporal: "771100", jwt: "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2VjcmV0b2Zpcm1h",
  sal: "8db28853c3e6e11c4085136f641af071", hash: "e05f0f63955d08250a19abb1d83649416ee7c2fe605f654c35f18435da3adb4b", spToken: "sp-refresh-9f8e7d6c5b4a" };
const CRED = JSON.stringify({ v: 1, iter: 100000, salt: SECRETOS.sal, hash: SECRETOS.hash });
const t0 = "2026-10-01T10:00:00.000Z";
function filasIniciales() {
  return {
    main: { value: { usuarios: [
      { nombre: "Angelo Huerta", email: "a@x.cl", rol: "admin", pin: SECRETOS.pinPlano },
      { nombre: "Carol", email: "c@x.cl", rol: "editor", pin: "", pin_temporal: SECRETOS.pinTemporal },
    ], estados: { m14: "ok" } }, updated_at: t0 },
    pins: { value: { "Angelo Huerta_h": CRED, "Angelo Huerta_hist": [CRED], "Carol_tel": "+56911111111" }, updated_at: t0 },
    finanzas: { value: JSON.stringify({ finanzas_real: { Mediterra: { _proyOverrides: { "egr_fijo::Gastos Varios": { 7: 12345 } } } },
      creditos_data: [{ n: 1, empresa: "Mediterra", cuota: 120000 }], nominas: [{ id: "n1", docs: [{ nombre: "f.pdf", hash: "abc123docsha" }] }] }), updated_at: t0 },
    frisku_sp: { value: { tenant: "mediterra", refresh_token: SECRETOS.spToken, ultimo: "2026-09-30" }, updated_at: t0 },
    osiris: { value: { contratos: [{ id: "c1", apiKey: "k-123", nota: SECRETOS.jwt, royalty: 0.07 }] }, updated_at: t0 },
    backup_2026_09_01: { value: { viejo: true, pins: { x: CRED } }, updated_at: t0 },
  };
}

// ── Supabase falso: REST calendario_data + Storage bucket "respaldos" ─────
function supabaseFalso() {
  const db = filasIniciales(); const storage = new Map(); const escrituras = [];
  const resp = (status, body, raw = false) => new Response(raw ? body : JSON.stringify(body), { status, headers: { "content-type": raw ? "application/octet-stream" : "application/json" } });
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(url); const m = (opts.method || "GET").toUpperCase();
    if (!/Bearer srv-key-de-prueba/.test(opts.headers?.Authorization || "")) return resp(401, { error: "sin llave" });
    if (u.pathname === "/rest/v1/calendario_data") {
      const q = decodeURIComponent(u.search);
      if (m === "GET") {
        let ids = Object.keys(db);
        const inm = /id=in\.\(([^)]*)\)/.exec(q);
        if (inm) ids = inm[1].split(",").filter((id) => db[id]); else if (/id=not\.like\.backup_\*/.test(q)) ids = ids.filter((id) => !id.startsWith("backup_"));
        return resp(200, ids.map((id) => ({ id, value: db[id].value, updated_at: db[id].updated_at })));
      }
      if (m === "PATCH") {
        const id = /id=eq\.([^&]+)/.exec(q)[1]; const ver = (/updated_at=eq\.([^&]+)/.exec(q) || [])[1];
        if (!db[id] || (ver && db[id].updated_at !== ver)) return resp(200, []);
        const b = JSON.parse(opts.body); db[id] = { value: b.value, updated_at: b.updated_at }; escrituras.push(`PATCH ${id}`);
        return resp(200, [{ id, ...db[id] }]);
      }
      if (m === "POST") {
        const b = JSON.parse(opts.body); if (db[b.id]) return resp(409, { error: "duplicado" });
        db[b.id] = { value: b.value, updated_at: b.updated_at }; escrituras.push(`POST ${b.id}`); return resp(201, [b]);
      }
    }
    const so = /^\/storage\/v1\/object\/(list\/)?respaldos\/?(.*)$/.exec(u.pathname);
    if (so) {
      const ruta = so[2];
      if (so[1] && m === "POST") { const { prefix } = JSON.parse(opts.body); return resp(200, [...storage.keys()].filter((k) => k.startsWith(prefix)).sort().map((k) => ({ name: k.slice(prefix.length) }))); }
      if (m === "POST") {
        if (storage.has(ruta) && opts.headers["x-upsert"] !== "true") return resp(409, { error: "existe" });
        storage.set(ruta, Buffer.from(opts.body)); return resp(200, { Key: ruta });
      }
      if (m === "GET") return storage.has(ruta) ? resp(200, storage.get(ruta), true) : resp(404, { error: "no existe" });
      if (m === "DELETE") { JSON.parse(opts.body).prefixes.forEach((p) => storage.delete(p)); return resp(200, []); }
    }
    return resp(404, { error: "ruta no emulada " + u.pathname });
  };
  return { db, storage, escrituras, fetchImpl };
}
const SUPA = "https://falso.supabase.co", KEY = "srv-key-de-prueba";

// ── 1. Ejecución ───────────────────────────────────────────────────────────
const F = supabaseFalso();
const hoy = new Date("2026-10-06T23:00:00Z");
const est = await R.ejecutarRespaldo({ supaUrl: SUPA, serviceKey: KEY, fetchImpl: F.fetchImpl, ahora: hoy });
check("el respaldo se ejecuta y queda verificado", est.ok && est.archivo === "diario/2026-10-06.json.gz", JSON.stringify({ archivo: est.archivo, filas: est.filas, bytesGzip: est.bytesGzip }));
check("no hay escrituras en la base durante el respaldo", F.escrituras.length === 0, F.escrituras.join(","));
const paq0 = JSON.parse(zlib.gunzipSync(F.storage.get("diario/2026-10-06.json.gz")).toString());
check("pins y backup_* quedan fuera", est.excluidas.includes("pins") && !("backup_2026_09_01" in paq0.filas) && !("pins" in paq0.filas) && est.filas === 4,
  `filas: ${Object.keys(paq0.filas).join(", ")} · excluidas: ${est.excluidas.join(", ")}`);
check("el estado queda publicado (estado/ultimo.json)", F.storage.has("estado/ultimo.json"));
const repetido = await R.ejecutarRespaldo({ supaUrl: SUPA, serviceKey: KEY, fetchImpl: F.fetchImpl, ahora: hoy });
check("una segunda corrida el mismo día no sobrescribe", repetido.archivo === "diario/2026-10-06-2.json.gz");

// ── 2. Credenciales ────────────────────────────────────────────────────────
const textoStorage = [...F.storage.entries()].map(([k, v]) => k.endsWith(".gz") ? zlib.gunzipSync(v).toString() : v.toString()).join("\n");
const fugas = R.buscarFugas(textoStorage, Object.values(SECRETOS).concat(["k-123"]));
check("ningún PIN, hash, salt, token ni JWT en Storage", fugas.length === 0, fugas.join("; "));
const man = JSON.parse(F.storage.get("diario/2026-10-06.manifiesto.json").toString());
const rutas = Object.fromEntries(man.filas.map((m) => [m.id, m.rutasQuitadas]));
check("el manifiesto dice qué rutas se quitaron (sin valores)", JSON.stringify(rutas.main) === JSON.stringify(["usuarios[email=a@x.cl].pin", "usuarios[email=c@x.cl].pin", "usuarios[email=c@x.cl].pin_temporal"]), JSON.stringify(rutas));
check("se conservan los hashes de documentos (no son credenciales)", textoStorage.includes("abc123docsha"));
check("se conserva el dato de negocio junto a un token quitado", textoStorage.includes('"royalty":0.07') && textoStorage.includes('"tenant":"mediterra"'));

// ── 3. Retención: 400 días simulados ───────────────────────────────────────
const G = supabaseFalso();
for (let d = 0; d < 400; d++) {
  await R.ejecutarRespaldo({ supaUrl: SUPA, serviceKey: KEY, fetchImpl: G.fetchImpl, ahora: new Date(Date.UTC(2026, 0, 1 + d, 23)) });
}
const quedan = [...G.storage.keys()].filter((k) => /^diario\/.*\.json\.gz$/.test(k)).sort();
const ult = new Date(Date.UTC(2026, 0, 400, 23));
const diarios = quedan.filter((k) => (ult - new Date(k.slice(7, 17) + "T23:00:00Z")) / 86400000 < 30);
const mensuales = quedan.filter((k) => !diarios.includes(k));
check("retención: 30 diarios", diarios.length === 30, `${diarios[0]} … ${diarios[diarios.length - 1]}`);
check("retención: mensuales = primer día de cada mes, máximo 12 meses", mensuales.every((k) => k.slice(15, 17) === "01") && quedan.map((k) => k.slice(7, 14)).filter((v, i, a) => a.indexOf(v) === i).length <= 13, mensuales.join(", "));
check("cada respaldo conservado tiene su manifiesto", quedan.every((k) => G.storage.has(k.replace(".json.gz", ".manifiesto.json"))));

// ── 4. Recuperación ────────────────────────────────────────────────────────
const originalFinanzas = F.db.finanzas.value;
F.db.finanzas = { value: JSON.stringify({ finanzas_real: {} }), updated_at: "2026-10-07T09:00:00.000Z" };   // pérdida
F.db.main.value.usuarios[0].pin = "999000";   // el PIN cambió DESPUÉS del respaldo
F.db.main.value.estados = {};                  // y se perdió el estado de tareas
F.db.main.updated_at = "2026-10-07T09:00:00.000Z";
const pinsAntes = JSON.stringify(F.db.pins);
const sim = await R.restaurar({ supaUrl: SUPA, serviceKey: KEY, fetchImpl: F.fetchImpl, archivo: "diario/2026-10-06.json.gz", ids: ["finanzas", "main", "pins"] });
check("la simulación no escribe", F.escrituras.length === 0 && sim.simulacion);
check("la simulación excluye pins", sim.plan.find((p) => p.id === "pins").accion === "excluida");
const ap = await R.restaurar({ supaUrl: SUPA, serviceKey: KEY, fetchImpl: F.fetchImpl, archivo: "diario/2026-10-06.json.gz", ids: ["finanzas", "main", "pins"], aplicar: true, ahora: new Date("2026-10-07T10:00:00Z") });
check("finanzas vuelve idéntica al original", F.db.finanzas.value === originalFinanzas);
check("main recupera los estados de tareas", JSON.stringify(F.db.main.value.estados) === '{"m14":"ok"}');
check("main conserva el PIN ACTUAL (no el del respaldo, que no existe)", F.db.main.value.usuarios[0].pin === "999000" && F.db.main.value.usuarios[1].pin_temporal === SECRETOS.pinTemporal);
check("pins no se tocó", JSON.stringify(F.db.pins) === pinsAntes);
check("hay foto previa saneada para deshacer", F.storage.has(ap.previo) && R.buscarFugas(zlib.gunzipSync(F.storage.get(ap.previo)).toString(), ["999000", SECRETOS.pinTemporal]).length === 0);
const deshacer = await R.restaurar({ supaUrl: SUPA, serviceKey: KEY, fetchImpl: F.fetchImpl, archivo: ap.previo, ids: ["finanzas"], aplicar: true });
check("el deshacer devuelve finanzas al estado previo a la restauración", JSON.parse(F.db.finanzas.value).finanzas_real && Object.keys(JSON.parse(F.db.finanzas.value).finanzas_real).length === 0, JSON.stringify(deshacer.resultados));
delete F.db.osiris;
await R.restaurar({ supaUrl: SUPA, serviceKey: KEY, fetchImpl: F.fetchImpl, archivo: "diario/2026-10-06.json.gz", ids: ["osiris"], aplicar: true });
check("una fila borrada se vuelve a crear (sin el token quitado)", F.db.osiris && F.db.osiris.value.contratos[0].royalty === 0.07 && !("apiKey" in F.db.osiris.value.contratos[0]));

// ── 5. Seguridad ───────────────────────────────────────────────────────────
// conflicto: la fila cambia entre la lectura y la escritura
const H = supabaseFalso();
await R.ejecutarRespaldo({ supaUrl: SUPA, serviceKey: KEY, fetchImpl: H.fetchImpl, ahora: hoy });
H.db.finanzas = { value: "{}", updated_at: "2026-10-07T00:00:00Z" };
const carrera = async (url, opts) => { if ((opts?.method || "GET") === "PATCH") H.db.finanzas.updated_at = "2026-10-07T00:00:01Z"; return H.fetchImpl(url, opts); };
const conf = await R.restaurar({ supaUrl: SUPA, serviceKey: KEY, fetchImpl: carrera, archivo: "diario/2026-10-06.json.gz", ids: ["finanzas"], aplicar: true });
check("conflicto de versión: no escribe y lo informa", H.db.finanzas.value === "{}" && /conflicto/.test(conf.resultados[0].resultado));
// respaldo corrupto
const gz = H.storage.get("diario/2026-10-06.json.gz"); const p = JSON.parse(zlib.gunzipSync(gz).toString()); p.filas.finanzas.valor = { manipulado: true };
H.storage.set("diario/2026-10-06.json.gz", zlib.gzipSync(Buffer.from(JSON.stringify(p))));
let rechazado = false; try { await R.restaurar({ supaUrl: SUPA, serviceKey: KEY, fetchImpl: H.fetchImpl, archivo: "diario/2026-10-06.json.gz", ids: ["finanzas"] }); } catch (e) { rechazado = /verificación/.test(e.message); }
check("un respaldo alterado se rechaza por SHA-256", rechazado);
// endpoint
const handler = (await import("../../api/_respaldo-diario.js")).default;
const res = { s: 0, b: null, status(x) { this.s = x; return this; }, json(b) { this.b = b; return this; } };
delete process.env.CRON_SECRET; await handler({ headers: { authorization: "Bearer x" } }, res);
check("cron sin CRON_SECRET → 401 (fail-closed)", res.s === 401);
process.env.CRON_SECRET = "s3"; await handler({ headers: { authorization: "Bearer otro" } }, res);
check("cron con secreto incorrecto → 401", res.s === 401);
delete process.env.SUPABASE_SERVICE_ROLE_KEY; await handler({ headers: { authorization: "Bearer s3" } }, res);
check("cron sin llave de servicio → 500 sin tocar nada", res.s === 500);
let sinLlave = false; try { await R.ejecutarRespaldo({ supaUrl: SUPA, serviceKey: "", fetchImpl: F.fetchImpl }); } catch (e) { sinLlave = true; }
check("ejecutarRespaldo sin llave lanza error", sinLlave);

console.log(log.join("\n"));
console.log(`\n${ok} correctas, ${fallos} fallas`);
if (process.env.OUT_DIR) {
  fs.mkdirSync(process.env.OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.OUT_DIR, "prueba-respaldo.txt"), log.join("\n") + `\n\n${ok} correctas, ${fallos} fallas\n`);
  fs.writeFileSync(path.join(process.env.OUT_DIR, "manifiesto-ejemplo.json"), JSON.stringify(man, null, 2));
}
process.exit(fallos ? 1 : 0);
