/* Correos de cobranza contra STAGING, con destinatarios sinteticos y el historial
 * persistido en osiris_aviso_envio. El transporte SMTP se inyecta: aca no hay
 * credenciales de correo, asi que la entrega real queda NO EJERCIDA. */
import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require(process.env.SP + "/pgclient/node_modules/pg");
const RAIZ = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra";
const W = RAIZ + "/.claude/worktrees/wt-respaldo-prod";
const t = readFileSync(RAIZ + "/.env.osiris-staging.local", "utf8");
const DSN = t.match(/^OSIRIS_STAGING_DATABASE_URL=(.*)$/m)[1].trim();
if (DSN.includes("bywovqayuzodbzwsriet")) { console.log("ABORT"); process.exit(2); }
const COB = await import("file:///" + W + "/src/ux/coberturaContratos.js");
const AV = await import("file:///" + W + "/src/ux/avisoCobranza.js");
let f = 0; const chk = (e, ok, d) => { if (!ok) f++; console.log("   " + (ok ? "PASS " : "FALLA") + " " + e.padEnd(58) + (d || "")); };
const sha = (s) => crypto.createHash("sha256").update(String(s).toLowerCase()).digest("hex");

const c = new Client({ connectionString: DSN, ssl: { rejectUnauthorized: false } }); await c.connect();
const { rows: [os] } = await c.query("select value from public.calendario_data where id='osiris'");
const ev = COB.evaluarContratos(os.value);

// Directorio SINTETICO: los contratos de staging no tienen responsable interno, asi que se
// asigna uno de prueba a dos contratos pendientes para ejercer el correo por responsable.
const pend = ev.contratos.filter((x) => x.clase === COB.CLASE.PENDIENTE_CONFIRMADO).slice(0, 2);
for (const p of pend) p.responsable = "Responsable Prueba";
const directorio = { "Responsable Prueba": "responsable.prueba@ejemplo.invalid" };
const cfo = "cfo.prueba@ejemplo.invalid";
const FECHA = "2026-09-10";
await c.query("delete from public.osiris_aviso_envio where fecha_civil = $1 and modo='prueba'", [FECHA]);

const leerHist = async () => new Set((await c.query("select clave from public.osiris_aviso_envio where fecha_civil=$1", [FECHA])).rows.map((r) => r.clave));
const bandeja = [];
const enviar = async (m) => bandeja.push(m);
async function corrida() {
  const hist = await leerHist();
  const plan = AV.planificarEnvios({ evaluacion: ev, directorio, cfo, fecha: FECHA, historial: hist, modoPrueba: true });
  if (!plan.ok) return plan;
  for (const m of plan.correos) await enviar({ to: [m.para], subject: m.asunto, html: m.html, message: m.texto, modulo: m.modulo });
  for (const k of plan.clavesNuevas) {
    const [fecha, dest, contrato, concepto, clase] = k.split("|");
    const esCierre = dest === "cierre";
    await c.query(`insert into public.osiris_aviso_envio(clave, fecha_civil, destinatario_sha, contrato_id, concepto, clase, tipo, modo)
                   values($1,$2,$3,$4,$5,$6,$7,'prueba') on conflict (clave) do nothing`,
      [k, fecha, esCierre ? null : sha(dest), esCierre ? contrato : contrato, esCierre ? concepto : concepto, esCierre ? null : clase, esCierre ? "cierre" : "linea"]);
  }
  return plan;
}

console.log("== CORREOS DE COBRANZA · STAGING · destinatarios sinteticos ==");
console.log("   contratos evaluados: " + ev.conteos.contratosEvaluados + " · por clase: " +
  Object.entries(ev.porClase).map(([k, n]) => COB.ETIQUETA[k] + "=" + n).join(" · "));

const bloqueo = AV.planificarEnvios({ evaluacion: ev, directorio: { "Responsable Prueba": "alguien@grupomediterra.cl" }, cfo, fecha: FECHA });
chk("destinatario real en modo prueba -> no se planifica nada", !bloqueo.ok && bloqueo.correos.length === 0, bloqueo.errores && bloqueo.errores[0].replace(/@.*/, "@…"));

const p1 = await corrida();
chk("primera corrida planifica correos", p1.ok && p1.correos.length >= 1, p1.correos.length + " correos");
const porResp = bandeja.filter((m) => m.to[0] === directorio["Responsable Prueba"]);
const cons = bandeja.filter((m) => m.to[0] === cfo);
chk("un correo para el responsable sintetico", porResp.length === 1);
chk("un consolidado para el CFO sintetico", cons.length === 1);
const conflictos = ev.contratos.filter((x) => x.clase === COB.CLASE.CONFLICTO);
chk("ningun correo nombra un contrato en conflicto",
    conflictos.every((x) => bandeja.every((m) => !m.html.includes(x.cliente))), conflictos.length + " en conflicto");
chk("el consolidado declara la exclusion por conflicto", cons[0] && /en conflicto excluidas/.test(cons[0].html));
chk("el consolidado lista tareas de configuracion", cons[0] && /Tareas de configuración/.test(cons[0].html), p1.tareasConfiguracion + " lineas sin responsable");
chk("todos los destinatarios son sinteticos", bandeja.every((m) => m.to.every(AV.esDestinatarioDePrueba)));
chk("los importes van rotulados como contractuales", bandeja.every((m) => /importes son contractuales/i.test(m.html)));
const { rows: [h1] } = await c.query("select count(*)::int n from public.osiris_aviso_envio where fecha_civil=$1", [FECHA]);
chk("historial persistido en staging", h1.n === p1.clavesNuevas.length, h1.n + " claves");
const { rows: [pii] } = await c.query("select count(*)::int n from public.osiris_aviso_envio where destinatario_sha like '%@%'");
chk("el historial no guarda correos en claro", pii.n === 0);

const antes = bandeja.length;
const p2 = await corrida();
const lineas2 = p2.correos.reduce((s, m) => s + m.lineas + m.configuracion, 0);
chk("segunda corrida del mismo dia no reenvia lineas", lineas2 === 0, "lineas nuevas=" + lineas2 + " · correos=" + (bandeja.length - antes));
const { rows: [h2] } = await c.query("select count(*)::int n from public.osiris_aviso_envio where fecha_civil=$1", [FECHA]);
chk("el historial no crece con el reintento", h2.n === h1.n, h1.n + " -> " + h2.n);

await c.query("delete from public.osiris_aviso_envio where fecha_civil = $1 and modo='prueba'", [FECHA]);
await c.end();
console.log();
console.log("   ENTREGA SMTP REAL: NO EJERCIDA (credenciales en Vercel; destinatarios reales pendientes de aprobacion)");
console.log("CORREOS: " + (f === 0 ? "PASS" : "FALLA · " + f));
