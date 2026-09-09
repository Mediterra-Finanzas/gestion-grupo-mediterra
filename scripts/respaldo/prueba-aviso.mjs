/* El aviso se ejerce contra la SALUD REAL de staging, no contra un objeto de
 * laboratorio. El transporte SMTP se inyecta: aca no hay credenciales de correo,
 * asi que se mide que el mensaje se componga y se entregue al transporte con los
 * destinatarios correctos. La entrega SMTP real queda declarada NO EJERCIDA. */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require(process.env.SP + "/pgclient/node_modules/pg");
const RAIZ = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra";
const t = readFileSync(RAIZ + "/.env.osiris-staging.local", "utf8");
const DSN = t.match(/^OSIRIS_STAGING_DATABASE_URL=(.*)$/m)[1].trim();
if (DSN.includes("bywovqayuzodbzwsriet")) { console.log("ABORT"); process.exit(2); }
const AV = await import("file:///" + process.env.SP + "/mod/avisoRespaldo.js");
let f = 0; const chk = (e, ok, d) => { if (!ok) f++; console.log("   " + (ok ? "PASS " : "FALLA") + " " + e.padEnd(56) + (d || "")); };
const c = new Client({ connectionString: DSN, ssl: { rejectUnauthorized: false } }); await c.connect();
const { rows: [salud] } = await c.query("select * from public.respaldo_salud");
await c.end();

const DEST = ["respaldo-cfo@ejemplo.invalid", "respaldo-ti@ejemplo.invalid"];
const bandeja = [];
const enviar = async (m) => bandeja.push(m);
console.log("== AVISO DE RESPALDO ==");
console.log("   salud real de staging: " + salud.veredicto);

const r1 = await AV.avisar({ salud, ultimoAviso: null, entorno: "staging", destinatarios: DEST, enviar });
chk("falla real -> se envia aviso", r1.enviado && bandeja.length === 1, r1.asunto);
chk("el aviso lleva los dos destinatarios", bandeja[0].to.length === 2, bandeja[0].to.join(", "));
chk("el asunto nombra el veredicto", bandeja[0].subject.includes(salud.veredicto.slice(0, 20)));
const cuerpo = bandeja[0].html + bandeja[0].message;
chk("el aviso no filtra claves ni rutas de objetos", !/BACKUP_ENCRYPTION|sha256\/|supabase\.co|eyJ/.test(cuerpo), "sin secretos ni URLs");
chk("usa el modulo de correo ya operativo", bandeja[0].modulo === "osiris", "modulo=osiris (api/send-email.js)");

const previo = { veredicto: salud.veredicto, clase: "alerta", enviado_at: new Date(Date.now() - 2 * 3600e3).toISOString() };
const r2 = await AV.avisar({ salud, ultimoAviso: previo, entorno: "staging", destinatarios: DEST, enviar });
chk("mismo veredicto dentro de la ventana -> no repite", !r2.enviado, r2.motivo);
const viejo = { ...previo, enviado_at: new Date(Date.now() - 13 * 3600e3).toISOString() };
const r3 = await AV.avisar({ salud, ultimoAviso: viejo, entorno: "staging", destinatarios: DEST, enviar });
chk("pasada la ventana -> vuelve a avisar", r3.enviado, "12 h");

const sano = { ...salud, veredicto: "OK" };
const r4 = await AV.avisar({ salud: sano, ultimoAviso: previo, entorno: "staging", destinatarios: DEST, enviar });
chk("vuelta a OK -> avisa que se normalizo", r4.enviado && r4.clase === "recuperado", r4.asunto);
const r5 = await AV.avisar({ salud: sano, ultimoAviso: { veredicto: "OK", clase: "recuperado", enviado_at: new Date().toISOString() }, entorno: "staging", destinatarios: DEST, enviar });
chk("estando sano no manda correos", !r5.enviado, r5.motivo);
const r6 = await AV.avisar({ salud, ultimoAviso: null, entorno: "staging", destinatarios: [], enviar });
chk("sin destinatarios no finge haber avisado", !r6.enviado && r6.motivo === "sin_destinatarios", r6.motivo);

console.log();
console.log("   correos entregados al transporte: " + bandeja.length);
console.log("   ENTREGA SMTP REAL: NO EJERCIDA (faltan SMTP_*_USER / SMTP_*_PASS, viven en Vercel)");
console.log("AVISO: " + (f === 0 ? "PASS" : "FALLA · " + f));
