/* Restauración APLICADA en un destino aislado de staging.
 *
 *   1 · DESCIFRADO Y RECONSTRUCCIÓN EN MEMORIA   bytes del bucket → objetos A y B.
 *   2 · RESTAURACIÓN APLICADA                    filas reconstruidas SOLO desde el lote
 *       (src/data/reconstruirDesdeLote.js) y escritas en `restauracion_<lote>`, un esquema
 *       de la base de staging sin permisos para anon, authenticated ni service_role y fuera
 *       de los esquemas que publica la API.
 *   3 · VERIFICACIÓN DESDE LO ESCRITO            se relee por SQL el destino y se compara con
 *       el origen: recursos, Tareas, usuarios, desactivados, permisos, UUID, relaciones,
 *       credenciales, huérfanas y código provisorio.
 *
 * CREDENCIAL NO ES LOGIN. La última sección usa src/data/verificacionCredencialLegacy.js
 * contra `main` y `pins` RELEÍDOS DEL DESTINO, con verifyPin de src/pinHash.js: replica en Node
 * la decisión de App.jsx. Eso es VERIFICACIÓN DE CREDENCIAL. El login real por la app contra lo
 * restaurado queda NO EJERCIDO, porque la app lee `main` y `pins` del origen (SUPA_URL). Se
 * informa aparte y nunca cuenta como PASS.
 *
 * La bóveda original solo se consulta, si existe, para COMPARAR los UUID; nunca para
 * autenticar ni para vincular credenciales. Sin bóveda (modo legacy) no hay UUID que comparar.
 *
 * Fixture: .env.osiris-staging.local (OSIRIS_RESPALDO_FIXTURE_EMAIL y _PIN). El PIN no se
 * imprime. Sin fixture, la verificación positiva queda BLOQUEADA y no se cuenta como PASS.
 *
 * Reglas: no borra ni sobrescribe. Si el esquema del lote ya existe, aborta. Las
 * credenciales se escriben en un SAVEPOINT, se verifican y se revierten: el destino no
 * conserva una segunda copia. No imprime credenciales, hashes, teléfonos ni correos.
 *
 * Uso: SP=<scratchpad con pgclient> node restauracion-aplicada.mjs [lote_id] */
import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require(process.env.SP + "/pgclient/node_modules/pg");
const RAIZ = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra";
const W = RAIZ + "/.claude/worktrees/wt-respaldo-prod";
const t = readFileSync(RAIZ + "/.env.osiris-staging.local", "utf8");
const G = (k) => { const m = t.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const DSN = G("OSIRIS_STAGING_DATABASE_URL"), U = G("OSIRIS_STAGING_SUPABASE_URL"), S = G("OSIRIS_STAGING_SUPABASE_SECRET_KEY");
if (!DSN || !U || [DSN, U].some((x) => x.includes("bywovqayuzodbzwsriet"))) { console.log("ABORT: el destino no es staging"); process.exit(2); }
const FIX_EMAIL = G("OSIRIS_RESPALDO_FIXTURE_EMAIL"), FIX_PIN = G("OSIRIS_RESPALDO_FIXTURE_PIN");

const ident = await import("file:///" + W + "/src/data/respaldoIdentidad.js");
const { restaurarLote } = await import("file:///" + W + "/src/data/restaurarLote.js");
const { reconstruirDesdeLote, evaluarRecuperacion } = await import("file:///" + W + "/src/data/reconstruirDesdeLote.js");
const V = await import("file:///" + W + "/src/data/verificacionCredencialLegacy.js");
const { verifyPin } = await import("file:///" + W + "/src/pinHash.js");

const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const hashLlave = (n) => sha256(Buffer.from(String(n), "utf8"));
const h = (s) => "…" + hashLlave(s).slice(0, 5);
const canon = (x) => Array.isArray(x) ? x.map(canon)
  : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon(x[k])])) : x;
const igual = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));   // jsonb reordena llaves
const leer = (v) => { try { return typeof v === "string" ? JSON.parse(v) : v; } catch (e) { return null; } };
const SUF = /_(h|hist|tel|temp)$/;
const baseDe = (k) => k.replace(SUF, "");
const sufijoDe = (k) => (k.match(SUF) || [""])[0];

let fallas = 0, bloqueos = 0;
const noEjercidos = [];
const chk = (e, ok, d) => { if (!ok) fallas++; console.log("   " + (ok ? "PASS        " : "FALLA       ") + e.padEnd(76) + (d ? " " + d : "")); return ok; };
const bloq = (e, d) => { bloqueos++; console.log("   BLOQUEADO   " + e.padEnd(76) + (d ? " " + d : "")); };
const noEjer = (e, d) => { noEjercidos.push(e); console.log("   NO EJERCIDO " + e.padEnd(76) + (d ? " " + d : "")); };
const nota = (d) => console.log("               " + d);

// ── lote ─────────────────────────────────────────────────────────────────────
const src = new Client({ connectionString: DSN, ssl: { rejectUnauthorized: false } });
await src.connect();
const { rows: [fila] } = process.argv[2]
  ? await src.query("select * from public.respaldo_lote where lote_id = $1", [process.argv[2]])
  : await src.query("select * from public.respaldo_lote where estado = 'READY' and verificado_at is not null order by listo_at desc limit 1");
if (!fila) { console.log("ABORT: no hay lote READY verificado"); process.exit(3); }
console.log(`== RESTAURACIÓN APLICADA · lote ${fila.lote_id} · staging ==\n`);

// ── 1 · memoria ──────────────────────────────────────────────────────────────
console.log("1 · DESCIFRADO Y RECONSTRUCCIÓN EN MEMORIA");
const bajar = async (ruta) => {
  const r = await fetch(`${U}/storage/v1/object/respaldo-osiris-staging/${ruta}`, { headers: { apikey: S, Authorization: "Bearer " + S } });
  return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
};
const mem = await restaurarLote({ fila, bajar, sha256,
  descifrar: (sobre, clave) => ident.descifrar(sobre, { clave, crypto, zlib }),
  claves: { A: Buffer.from(G("BACKUP_ENCRYPTION_KEY_A"), "base64"), B: Buffer.from(G("BACKUP_ENCRYPTION_KEY_B"), "base64") } });
chk("descarga, SHA registrados, descifrado A/B y correlación", mem.ok,
  mem.ok ? `${Object.keys(mem.A.negocio).length} recursos · ${mem.A.padron.total} usuarios · ${mem.B.total} credenciales` : mem.motivo);
if (!mem.ok) process.exit(1);
const { A, B } = mem;
const coberturaNueva = !!A.negocio.main && B.version === "credencial-v3" && ["boveda", "legacy"].includes(B.modo_identidad) && A.modo_identidad === B.modo_identidad;
chk("el lote tiene la cobertura nueva (Tareas, B credencial-v3, modo declarado en A y B)", coberturaNueva,
  `negocio.main ${A.negocio.main ? "sí" : "no"} · B ${B.version} · modo ${B.modo_identidad}`);
if (!coberturaNueva) { console.log("ABORT: el lote es anterior a la corrección; generar uno nuevo (prueba-tramo-completo.mjs)"); process.exit(1); }

// ── origen, en solo lectura y en una sola instantánea ────────────────────────
await src.query("begin transaction isolation level repeatable read read only");
const { rows: filasOrigen } = await src.query("select id, value, updated_at from public.calendario_data");
const { rows: [esq] } = await src.query(`select to_regclass('public.sec_identidad') is not null as identidad,
  to_regclass('public.sec_identidad_alias') is not null as alias`);
const bovedaOrigen = esq.identidad && esq.alias
  ? (await src.query(`select a.llave_hash, a.identity_id::text as identity_id, i.estado
      from public.sec_identidad_alias a join public.sec_identidad i on i.identity_id = a.identity_id
      where a.origen = 'calendario_data_main' and a.vigente_hasta is null`)).rows
  : null;
const fuera = {};
for (const tabla of ["public.iam_usuario", "public.iam_usuario_empresa", "public.iam_rol_capability", "public.sec_identidad",
                     "public.sec_credencial", "public.sec_identidad_auth_vinculo", "auth.users"]) {
  const { rows: [x] } = await src.query("select to_regclass($1) is not null as existe", [tabla]);
  fuera[tabla.replace(/^public\./, "")] = x.existe ? (await src.query(`select count(*)::int as n from ${tabla}`)).rows[0].n : "ausente";
}
await src.query("rollback");
await src.end();
const origen = new Map(filasOrigen.map((r) => [r.id, r]));
const tomado = new Date(A.tomado_at);
const cambioDespues = (id) => origen.has(id) && new Date(origen.get(id).updated_at) > tomado;

// ── 2 · restauración aplicada ────────────────────────────────────────────────
console.log("\n2 · RESTAURACIÓN APLICADA EN DESTINO AISLADO");
const rec = reconstruirDesdeLote({ A, B, hashLlave });
const esquema = "restauracion_" + fila.lote_id.toLowerCase().replace(/[^a-z0-9]/g, "_");
if (!/^restauracion_[a-z0-9_]+$/.test(esquema)) { console.log("ABORT: nombre de esquema inválido"); process.exit(3); }
const dst = new Client({ connectionString: DSN, ssl: { rejectUnauthorized: false } });
await dst.connect();
await dst.query("begin");
if ((await dst.query("select 1 from pg_namespace where nspname = $1", [esquema])).rowCount) {
  await dst.query("rollback");
  console.log(`ABORT: ${esquema} ya existe. No se sobrescribe.`);
  process.exit(3);
}
await dst.query(`create schema ${esquema}`);
await dst.query(`revoke all on schema ${esquema} from public, anon, authenticated, service_role`);
await dst.query(`create table ${esquema}.calendario_data (id text primary key, value jsonb not null, updated_at timestamptz)`);
await dst.query(`create table ${esquema}.manifiesto (lote_id text not null, correlation_id text not null, tomado_at timestamptz,
  sha_a text, sha_b text, aplicado_at timestamptz not null default now(), resultado jsonb)`);
await dst.query(`revoke all on all tables in schema ${esquema} from public, anon, authenticated, service_role`);
for (const [id, r] of Object.entries(rec.filas)) {
  if (id === "pins") continue;
  await dst.query(`insert into ${esquema}.calendario_data (id, value, updated_at) values ($1, $2, $3)`, [id, JSON.stringify(r.value), r.updated_at]);
}
await dst.query("savepoint credenciales");
await dst.query(`insert into ${esquema}.calendario_data (id, value, updated_at) values ('pins', $1, null)`, [JSON.stringify(rec.filas.pins.value)]);

// Todo lo que sigue se RELEE del destino.
const { rows: escritas } = await dst.query(`select id, value from ${esquema}.calendario_data`);
const rest = new Map(escritas.map((r) => [r.id, r.value]));
const mainR = rest.get("main"), pinsR = leer(rest.get("pins")) || {};
chk("filas escritas y releídas por SQL desde el esquema aislado", escritas.length === Object.keys(rec.filas).length, `${escritas.length} filas`);
const { rows: [pv] } = await dst.query(`select bool_or(has_schema_privilege(r, $1, 'USAGE')) as usage
  from unnest(array['anon','authenticated','service_role']) r`, [esquema]);
chk("el esquema no tiene USAGE para anon, authenticated ni service_role", pv.usage === false);

// ── 3 · verificación ──────────────────────────────────────────────────────────
console.log("\n3 · VERIFICACIÓN DESDE LO ESCRITO");
console.log(" recursos y Tareas");
const ids = filasOrigen.map((r) => r.id).filter((id) => id !== "main" && id !== "pins");
const iguales = [], difieren = [], posteriores = [], fueraDelLote = [];
for (const id of ids) {
  if (!rest.has(id)) { fueraDelLote.push(id); continue; }
  if (igual(origen.get(id).value, rest.get(id))) iguales.push(id);
  else (cambioDespues(id) ? posteriores : difieren).push(id);
}
chk("recursos restaurados idénticos al origen", difieren.length === 0,
  `${iguales.length} idénticos · ${posteriores.length} escritos después del snapshot · ${difieren.length} difieren`);
if (fueraDelLote.length) nota(`fuera del lote por allowlist: ${fueraDelLote.join(", ")}`);
const mainO = origen.get("main").value;
const mainOSinPin = { ...mainO, usuarios: (mainO.usuarios || []).map(({ pin, ...u }) => u) };
if (cambioDespues("main")) nota("main cambió después del snapshot: una diferencia puede ser escritura posterior");
const clavesMain = [...new Set([...Object.keys(mainOSinPin), ...Object.keys(mainR)])].filter((k) => !igual(mainOSinPin[k], mainR[k]));
chk("main idéntico al origen salvo el PIN en claro (Tareas y padrón)", clavesMain.length === 0, clavesMain.length ? "difieren: " + clavesMain.join(", ") : "");

console.log(" usuarios, desactivados y permisos");
const UO = mainO.usuarios || [], UR = mainR.usuarios || [];
const mR = new Map(UR.map((u) => [u.nombre, u]));
chk("mismo número de usuarios, nombres y correos", UO.length === UR.length && UO.every((u) => mR.has(u.nombre) &&
  String(u.email || "").toLowerCase() === String(mR.get(u.nombre).email || "").toLowerCase()), `${UO.length} / ${UR.length}`);
const desO = UO.filter((u) => u.desactivado).map((u) => u.nombre);
chk("desactivados preservados", desO.every((n) => mR.get(n)?.desactivado === true) && UR.filter((u) => u.desactivado).length === desO.length,
  `${desO.length} desactivados en origen`);
const AUT = ident.CAMPOS_USUARIO.conservar.filter((k) => !["nombre", "email"].includes(k));
const difPerm = [];
for (const u of UO) for (const k of AUT) if ((k in u || k in (mR.get(u.nombre) || {})) && !igual(u[k], mR.get(u.nombre)?.[k])) difPerm.push(h(u.nombre) + ":" + k);
chk("autorización idéntica (rol, módulos, pestañas, empresas, aprobación, rendiciones)", difPerm.length === 0, difPerm.join(", "));

console.log(" identidad y relaciones");
chk("cada credencial, complemento y marca de reemisión tiene exactamente un dueño", rec.sinDueno.length === 0 && rec.ambiguas.length === 0,
  `${rec.sinDueno.length} sin dueño · ${rec.ambiguas.length} ambiguas · vínculo por llave_hash del lote`);
chk("el modo de identidad del lote corresponde al esquema del origen", (B.modo_identidad === "boveda") === !!bovedaOrigen,
  `lote ${B.modo_identidad} · origen ${bovedaOrigen ? "con" : "sin"} bóveda`);
let uuidMal = [];
if (bovedaOrigen) {
  const vivos = new Map(bovedaOrigen.map((x) => [x.llave_hash, x]));
  const entradas = Object.entries(rec.identidadPorNombre);
  uuidMal = entradas.filter(([n, id]) => vivos.get(hashLlave(n))?.identity_id !== id);
  chk("UUID restaurado = UUID vigente en la bóveda de origen (solo comparación)", uuidMal.length === 0,
    `${entradas.length - uuidMal.length} de ${entradas.length}`);
} else {
  const conUuid = Object.values(rec.identidadPorNombre).filter((id) => id != null).length;
  chk("modo legacy: ninguna entrada trae un UUID", conUuid === 0, `${conUuid} con UUID`);
}
const ctIds = (blob) => { const s = new Set((blob?.contratos || []).map((c) => String(c.id))); let n = 0, ok = 0;
  for (const v of Object.values(blob || {})) if (Array.isArray(v)) for (const r of v) if (r && r.ctId != null) { n++; if (s.has(String(r.ctId))) ok++; }
  return { n, ok }; };
const ctO = ctIds(origen.get("osiris")?.value), ctR = ctIds(rest.get("osiris"));
chk("relaciones ctId de Osiris preservadas", ctO.n === ctR.n && ctR.ok === ctR.n, `${ctR.ok}/${ctR.n}`);
nota("fuera de este lote: " + Object.entries(fuera).map(([k, v]) => `${k} ${v}`).join(" · ") + " · mecanismo alternativo pendiente con el dueño de identidad");

console.log(" material de credenciales");
const pinsO = leer(origen.get("pins").value) || {};
const nombresO = new Set(UO.map((u) => u.nombre));
const legible = (k, v) => {
  if (k.endsWith("_tel")) return typeof v === "string" && v.trim() !== "";
  const x = leer(v);
  if (k.endsWith("_hist")) return Array.isArray(x) && x.map(leer).every((i) => i && typeof i === "object" && i.salt && i.hash);
  return !!(x && typeof x === "object" && x.salt && x.hash);
};
const materialMal = [];
let ilegibles = 0;
for (const k of Object.keys(pinsO).filter((k) => /_(h|hist|tel)$/.test(k) && nombresO.has(baseDe(k)))) {
  if (!legible(k, pinsO[k])) { ilegibles++; if (k in pinsR) materialMal.push(h(baseDe(k)) + sufijoDe(k) + " ilegible copiado"); continue; }
  const a = k.endsWith("_tel") ? pinsO[k] : leer(pinsO[k]), b = k.endsWith("_tel") ? pinsR[k] : leer(pinsR[k]);
  if (!igual(a, b)) materialMal.push(h(baseDe(k)) + sufijoDe(k));
}
chk("`_h` (con fecha y pol), `_hist` y `_tel` del padrón idénticos al origen", materialMal.length === 0 && !cambioDespues("pins"),
  materialMal.length ? "difieren: " + materialMal.join(", ") : cambioDespues("pins") ? "pins cambió después del snapshot" : `${ilegibles} ilegibles declarados`);
const huerfanasO = new Set(Object.keys(pinsO).filter((k) => sufijoDe(k) && !nombresO.has(baseDe(k))).map(baseDe));
const aplicadasSinUsuario = Object.keys(pinsR).filter((k) => !nombresO.has(baseDe(k))).length;
chk("llaves huérfanas (sin usuario en el padrón) no se aplican a nadie", aplicadasSinUsuario === 0,
  `${huerfanasO.size} bases huérfanas en origen · ${B.huerfanas.length} con material en B · ${rec.huerfanasNoAplicadas} no aplicadas`);
const conTempO = [...nombresO].filter((n) => pinsO[n + "_temp"] !== undefined);
const conTempR = [...nombresO].filter((n) => pinsR[n + "_temp"] !== undefined);
const marcasMal = conTempR.filter((n) => { const e = V.estadoTemp(pinsR[n + "_temp"]); return !(e.existe && e.expirado && !e.legacy); });
chk("código provisorio: cada `_temp` del origen vuelve como marca vencida (PIN anterior inhabilitado; se reemite)",
  conTempO.length === conTempR.length && conTempO.every((n) => conTempR.includes(n)) && marcasMal.length === 0,
  `${conTempO.length} en origen · ${conTempR.length} marcas · ${marcasMal.length} mal formadas`);
const planos = Object.keys(pinsO).filter((k) => nombresO.has(k)).length;
nota(`no viajan por diseño: material de _temp ${conTempO.length} (vuelve la marca) · PIN en claro en pins ${planos} (prohibido) · ` +
     `pin en padrón ${UO.filter((u) => String(u.pin || "").trim()).length} (prohibido)`);

console.log(" verificación de credencial contra lo restaurado (réplica en Node de App.jsx · NO es login)");
const decidir = (est, email, pin) => V.decidirAcceso({ ...est, email, pin, verifyPin });
const estR = { usuarios: UR, pins: pinsR }, estO = { usuarios: UO, pins: pinsO };
const ENTRAN = [V.DECISION.ENTRA, V.DECISION.ENTRA_CAMBIA];
if (FIX_EMAIL && FIX_PIN) {
  const fx = UR.find((u) => String(u.email || "").toLowerCase() === FIX_EMAIL.toLowerCase());
  const obtenido = await decidir(estR, FIX_EMAIL, FIX_PIN);
  const esperado = !fx ? "fixture ausente" : fx.desactivado ? V.DECISION.CORREO : V.DECISION.ENTRA;
  chk(`fixture con su PIN custodiado → ${esperado}`, !!fx && (fx.desactivado ? obtenido === V.DECISION.CORREO : ENTRAN.includes(obtenido)), obtenido);
  if (fx && !fx.desactivado && obtenido === V.DECISION.ENTRA_CAMBIA) nota("la credencial verifica, pero la política exige cambio: revisar fecha/pol del fixture");
  chk("fixture con PIN incorrecto → no entra", !ENTRAN.includes(await decidir(estR, FIX_EMAIL, "000000-no")));
  nota("control: la misma verificación contra el origen da " + (await decidir(estO, FIX_EMAIL, FIX_PIN)));
} else bloq("verificación positiva de credencial restaurada", "falta OSIRIS_RESPALDO_FIXTURE_EMAIL/PIN (ver fixture-restauracion.mjs)");
const desR = UR.filter((u) => u.desactivado && u.email);
if (desR.length) {
  const res = await Promise.all(desR.map((u) => decidir(estR, u.email, FIX_PIN || "cualquier-pin")));
  chk("usuarios desactivados no pasan la verificación desde lo restaurado", res.every((x) => x === V.DECISION.CORREO), `${desR.length} probados`);
} else nota("sin usuarios desactivados en el lote: caso no ejercido (usar fixture-restauracion.mjs --desactivar y un lote nuevo)");
const ramaMal = [], ramaDeclarada = [];
for (const u of UO.filter((x) => x.email && !x.desactivado)) {
  const o = V.ramaDe({ ...estO, nombre: u.nombre }), r = V.ramaDe({ ...estR, nombre: u.nombre });
  if (o === r) continue;
  const declarada = (V.pinInhabilitado(o) && V.pinInhabilitado(r))
    || ([V.RAMA.PIN_EN_CLARO, V.RAMA.CREDENCIAL_ILEGIBLE].includes(o) && r === V.RAMA.SIN_CREDENCIAL);
  (declarada ? ramaDeclarada : ramaMal).push(`${h(u.nombre)}: ${o} → ${r}`);
}
chk("cada usuario activo sigue la misma rama que hoy, salvo consecuencias declaradas", ramaMal.length === 0, ramaMal.join(" · "));
if (ramaDeclarada.length) nota("consecuencias declaradas (código vencido a reemitir, PIN en claro o credencial ilegible): " + ramaDeclarada.join(" · "));
noEjer("login real por la app contra lo restaurado", "la app lee main y pins del origen (SUPA_URL); falta un runtime cuyo origen sea lo restaurado");

// ── cierre ────────────────────────────────────────────────────────────────────
await dst.query("rollback to savepoint credenciales");
const { rows: [q] } = await dst.query(`select count(*)::int as n from ${esquema}.calendario_data where id = 'pins'`);
chk("tras revertir el savepoint el destino no conserva credenciales", q.n === 0);
// Una huérfana preservada, una entrada sin dueño, una verificación bloqueada o un tramo no
// ejercido impiden declarar la recuperación COMPLETA, aunque la restauración aplicada pase.
const recuperacion = evaluarRecuperacion(rec);
await dst.query(`insert into ${esquema}.manifiesto (lote_id, correlation_id, tomado_at, sha_a, sha_b, resultado) values ($1,$2,$3,$4,$5,$6)`,
  [fila.lote_id, A.correlationId, A.tomado_at, fila.sha_a, fila.sha_b, JSON.stringify({ fallas, bloqueos, noEjercidos, modo: B.modo_identidad,
    difieren, posteriores, fueraDelLote, clavesMain, difPerm, uuidMal: uuidMal.length, materialMal, huerfanas: huerfanasO.size,
    reemitir: rec.reemitir.length, ramaMal, ramaDeclarada: ramaDeclarada.length, recuperacion })]);
await dst.query("commit");
await dst.end();
const api = await fetch(`${U}/rest/v1/calendario_data?select=id&limit=1`, { headers: { apikey: S, Authorization: "Bearer " + S, "Accept-Profile": esquema } });
chk("la API de staging no publica el esquema aislado", !api.ok, "HTTP " + api.status);

const motivosNo = [...(fallas ? [`${fallas} fallas`] : []), ...recuperacion.motivos,
                   ...(bloqueos ? [`${bloqueos} verificaciones bloqueadas`] : []), ...noEjercidos.map((x) => x + ": no ejercido")];
console.log(`\nRESTAURACIÓN APLICADA · ${fallas === 0 ? "PASS" : "FALLA"} · ${fallas} fallas · ${esquema} conservado sin credenciales`);
console.log(`VERIFICACIÓN DE CREDENCIAL · ${fallas ? "ver fallas" : bloqueos ? `positiva BLOQUEADA (${bloqueos})` : "PASS"}`);
console.log(`LOGIN REAL · NO EJERCIDO`);
console.log(`RECUPERACIÓN COMPLETA · ${motivosNo.length ? "NO DECLARABLE · " + motivosNo.join(" · ") : "DECLARABLE"}`);
process.exit(fallas ? 1 : 0);
