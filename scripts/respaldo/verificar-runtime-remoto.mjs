/* Comprobacion POSTERIOR a crear el proyecto de Vercel. Cuatro estados separados,
 * que nunca se combinan en uno solo:
 *
 *   1 · RUN MANUAL        invocacion desde el boton Run del panel
 *   2 · DISPARO AUTOMATICO invocacion por el horario 0 7 * * *, sin intervencion
 *   3 · DESCARGA, DESCIFRADO Y RESTAURACION del lote creado por el runtime remoto
 *   4 · ENTREGA REAL DEL CORREO DE PRUEBA
 *
 * Solo lectura sobre staging, salvo la restauracion, que es en memoria.
 * Uso:  node verificar-runtime-remoto.mjs [--correo-recibido]
 *       --correo-recibido lo pasa quien vio el correo en la bandeja de prueba:
 *       un SMTP que acepta no prueba que llego. */
import { readFileSync } from "node:fs";
import crypto from "node:crypto"; import zlib from "node:zlib";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require(process.env.SP + "/pgclient/node_modules/pg");
const RAIZ = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra";
const W = RAIZ + "/.claude/worktrees/wt-respaldo-prod";
const t = readFileSync(RAIZ + "/.env.osiris-staging.local", "utf8");
const G = (k) => t.match(new RegExp("^" + k + "=(.*)$", "m"))[1].trim();
const DSN = G("OSIRIS_STAGING_DATABASE_URL"), U = G("OSIRIS_STAGING_SUPABASE_URL"), S = G("OSIRIS_STAGING_SUPABASE_SECRET_KEY");
if (DSN.includes("bywovqayuzodbzwsriet") || U.includes("bywovqayuzodbzwsriet")) { console.log("ABORT: produccion"); process.exit(2); }
const correoRecibido = process.argv.includes("--correo-recibido");
// --sha=<commit completo>: el SHA que se confirmó en el panel antes del Run.
const shaEsperado = (process.argv.find((a) => a.startsWith("--sha=")) || "").slice(6) || null;
const ident = await import("file:///" + W + "/src/data/respaldoIdentidad.js");
const { restaurarLote } = await import("file:///" + W + "/src/data/restaurarLote.js");
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");

// Ventana del horario. En Pro dispara dentro del minuto; en Hobby, en cualquier
// minuto de la hora. Se usa la hora completa y se pide NO pulsar Run en esa hora.
const enVentana = (d) => d.getUTCHours() === 7;
const esVercelCron = (ua) => /vercel-cron/i.test(String(ua || ""));

const c = new Client({ connectionString: DSN, ssl: { rejectUnauthorized: false } }); await c.connect();
const { rows: inv } = await c.query("select * from public.respaldo_invocacion order by recibido_at");
const estado = (ok, txt) => (ok ? "OBSERVADO   " : "NO OBSERVADO") + " · " + txt;

console.log("== RUNTIME REMOTO · verificacion por estados separados ==");
console.log("invocaciones registradas: " + inv.length);
console.log();

// 0 · Commit ejecutado: cada invocacion de Vercel registra el SHA del deployment que corrio.
// Un estado observado con otro commit no cuenta: no es el codigo que se reviso.
const deVercel = inv.filter((i) => esVercelCron(i.user_agent));
const conSha = deVercel.filter((i) => i.commit_sha);
const shas = [...new Set(conSha.map((i) => i.commit_sha))];
const shaOk = !!shaEsperado && shas.length === 1 && shas[0] === shaEsperado && conSha.length === deVercel.length;
console.log("0 · COMMIT EJECUTADO");
console.log("   " + (deVercel.length === 0 ? "sin invocaciones de Vercel todavia"
  : `${conSha.length} de ${deVercel.length} invocaciones con SHA · distintos: ${shas.map((s) => s.slice(0, 7)).join(", ") || "ninguno"} · ` +
    (shaEsperado ? `esperado ${shaEsperado.slice(0, 7)}: ${shaOk ? "COINCIDE" : "NO COINCIDE"}` : "falta --sha=<commit> para comparar")));
if (conSha.length) console.log("   entorno: " + [...new Set(conSha.map((i) => i.vercel_env))].join(", ") + " · rama: " + [...new Set(conSha.map((i) => i.commit_ref))].join(", "));
console.log();

// 1 · Run manual: invocacion de Vercel fuera de la ventana del horario, o declarada manual.
const manuales = inv.filter((i) => (esVercelCron(i.user_agent) && !enVentana(new Date(i.recibido_at))) || i.origen_declarado === "manual");
const manualOk = manuales.filter((i) => ["READY_VERIFICADO", "READY"].includes(i.estado));
console.log("1 · RUN MANUAL");
console.log("   " + estado(manualOk.length > 0, manuales.length + " invocaciones manuales · " + manualOk.length + " terminaron en READY" +
            (manuales[0] ? " · ultima " + new Date(manuales[manuales.length - 1].recibido_at).toISOString().slice(0, 16) + " UTC" : "")));

// 2 · Disparo automatico: invocacion de Vercel DENTRO de la ventana, sin marca manual.
const auto = inv.filter((i) => esVercelCron(i.user_agent) && enVentana(new Date(i.recibido_at)) && i.origen_declarado !== "manual");
const autoOk = auto.filter((i) => ["READY_VERIFICADO", "READY", "ya_existia"].includes(i.estado) || /READY/.test(String(i.estado)));
console.log("2 · DISPARO AUTOMATICO POR HORARIO (07:00-07:59 UTC)");
console.log("   " + estado(autoOk.length > 0, auto.length + " invocaciones en ventana · encabezado de horario presente en " +
            auto.filter((i) => i.cron_schedule).length + (autoOk[0] ? " · primera " + new Date(autoOk[0].recibido_at).toISOString().slice(0, 16) + " UTC" : "")));
if (auto.length && !autoOk.length) console.log("   hubo invocaciones en ventana pero ninguna termino en READY: revisar estado");

// 3 · Descarga, descifrado y restauracion de un lote creado por el runtime remoto
const lotesRemotos = [...new Set(inv.filter((i) => esVercelCron(i.user_agent) && i.lote_id).map((i) => i.lote_id))];
let restauradoOk = false, detalle = "sin lote creado por el runtime remoto";
for (const lote of lotesRemotos.reverse()) {
  const { rows: [fila] } = await c.query("select * from public.respaldo_lote where lote_id=$1 and estado='READY'", [lote]);
  if (!fila) continue;
  const bajar = async (ruta) => { const r = await fetch(`${U}/storage/v1/object/respaldo-osiris-staging/${ruta}`, { headers: { apikey: S, Authorization: "Bearer " + S } });
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null; };
  const res = await restaurarLote({ fila, bajar, sha256,
    descifrar: (sobre, clave) => ident.descifrar(sobre, { clave, crypto, zlib }),
    claves: { A: Buffer.from(G("BACKUP_ENCRYPTION_KEY_A"), "base64"), B: Buffer.from(G("BACKUP_ENCRYPTION_KEY_B"), "base64") } });
  restauradoOk = res.ok;
  detalle = res.ok ? `lote ${lote} · ${Object.keys(res.A.negocio || {}).length} recursos · ${res.A.padron.total} usuarios · ${res.B.total} credenciales · mismo snapshot=${res.A.tomado_at === res.B.tomado_at}`
                   : `lote ${lote} rechazado: ${res.motivo} ${res.detalle || ""}`;
  break;
}
// Esto es reconstruccion EN MEMORIA. La restauracion aplicada en un destino aislado, con
// usuarios, permisos, relaciones y login verificados desde lo escrito, es otro script:
// scripts/respaldo/restauracion-aplicada.mjs. Un PASS aqui no la reemplaza.
console.log("3 · DESCARGA, DESCIFRADO Y RECONSTRUCCION EN MEMORIA DEL LOTE REMOTO");
console.log("   " + estado(restauradoOk, detalle));

// 4 · Entrega real del correo de prueba
const correos = inv.filter((i) => i.correo_prueba);
const aceptados = correos.filter((i) => i.correo_prueba && i.correo_prueba.aceptado === true);
console.log("4 · ENTREGA REAL DEL CORREO DE PRUEBA");
console.log("   aceptado por SMTP: " + estado(aceptados.length > 0, aceptados.length + " de " + correos.length + " intentos"));
console.log("   recibido en la bandeja de prueba: " + estado(aceptados.length > 0 && correoRecibido,
            correoRecibido ? "confirmado por quien reviso la bandeja" : "falta confirmacion (--correo-recibido)"));
await c.end();

console.log();
const todos = manualOk.length > 0 && autoOk.length > 0 && restauradoOk && aceptados.length > 0 && correoRecibido;
console.log("AUTOMATIZACION COMPLETA = " + (autoOk.length > 0 && restauradoOk ? "EJERCIDA (disparo automatico + restauracion del lote remoto)" : "NO EJERCIDA"));
console.log("Los cuatro estados se informan por separado; ninguno se infiere de otro." + (todos ? "" : ""));
