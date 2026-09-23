/* Servidor local para revisar el candidato de preservación en un destino AISLADO.
 *
 * - Sirve un build de la app cuyo destino ya apunta a este servidor (nunca a producción).
 * - /rest/v1/* se reenvía a un PostgREST local. Las cabeceras `apikey` y `authorization`
 *   NO se reenvían: el destino aislado no comparte el secreto de firma de producción y
 *   aquí no hace falta ninguna credencial. Así tampoco viaja ninguna clave real.
 * - /api/send-email cae en un buzón local (archivo). /__prueba/codigo devuelve el último
 *   código provisorio de un correo, para poder entrar sin conocer ningún PIN.
 * - Deja registro de cada petición en registro.jsonl (método, ruta, estado, destino).
 *
 * Uso: node scripts/osiris/servidor-revision.mjs --puerto=3070 --build=<dir> --pgrst=http://127.0.0.1:3068 --dir=<evidencia>
 */
import http from "node:http";
import { readFileSync, existsSync, appendFileSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";

const arg = (n) => { const m = process.argv.find((a) => a.startsWith(`--${n}=`)); return m ? m.slice(n.length + 3) : ""; };
const PUERTO = Number(arg("puerto") || 3070);
const BUILD = arg("build");
const PGRST = arg("pgrst") || "http://127.0.0.1:3068";
const DIR = arg("dir") || ".";
if (!BUILD || !existsSync(BUILD)) { console.error("ABORT: falta --build o no existe"); process.exit(2); }
mkdirSync(DIR, { recursive: true });
const REG = path.join(DIR, "registro.jsonl");
const BUZON = path.join(DIR, "buzon.jsonl");

const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".map": "application/json" };

// Ninguna credencial cruza hacia el destino aislado.
const NO_REENVIAR = new Set(["host", "connection", "content-length", "apikey", "authorization", "origin", "referer",
  "accept-encoding", "sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest"]);

const leerCuerpo = (req) => new Promise((res) => { const p = []; req.on("data", (c) => p.push(c)); req.on("end", () => res(Buffer.concat(p))); });

const servidor = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PUERTO}`);
  const fin = (status, headers, cuerpo, extra = {}) => {
    appendFileSync(REG, JSON.stringify({ ts: new Date().toISOString(), metodo: req.method, ruta: u.pathname, consulta: u.search || undefined, status, ...extra }) + "\n");
    res.writeHead(status, { "Cache-Control": "no-store", ...headers });
    res.end(cuerpo);
  };
  try {
    if (u.pathname === "/__prueba/codigo") {
      const para = String(u.searchParams.get("to") || "").toLowerCase();
      const lineas = existsSync(BUZON) ? readFileSync(BUZON, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
      const ult = lineas.filter((x) => String(x.to || "").toLowerCase() === para).pop();
      const cod = ult && (String(ult.message).match(/c[óo]digo provisorio es:\s*(\d{6})/i) || [])[1];
      return fin(cod ? 200 : 404, { "Content-Type": "text/plain" }, cod || "", { prueba: "codigo" });
    }
    if (u.pathname === "/api/send-email") {
      if (req.method !== "POST") return fin(405, {}, "");
      const b = JSON.parse((await leerCuerpo(req)).toString("utf8") || "{}");
      appendFileSync(BUZON, JSON.stringify({ ts: new Date().toISOString(), to: b.to, subject: b.subject, message: b.message }) + "\n");
      return fin(200, { "Content-Type": "application/json" }, JSON.stringify({ success: true, messageId: "buzon-local" }));
    }
    if (u.pathname.startsWith("/api/")) return fin(404, {}, "");
    if (u.pathname.startsWith("/rest/v1/")) {
      const cuerpo = ["GET", "HEAD", "OPTIONS"].includes(req.method) ? undefined : await leerCuerpo(req);
      const h = {};
      for (const [k, v] of Object.entries(req.headers)) if (!NO_REENVIAR.has(k)) h[k] = v;
      const r = await fetch(PGRST + u.pathname.slice("/rest/v1".length) + u.search, { method: req.method, headers: h, body: cuerpo });
      const out = Buffer.from(await r.arrayBuffer());
      const rh = {};
      for (const k of ["content-type", "content-range", "preference-applied", "location"]) if (r.headers.get(k)) rh[k] = r.headers.get(k);
      return fin(r.status, rh, out, { destino: "postgrest-local" });
    }
    let rel = u.pathname === "/" ? "/index.html" : u.pathname;
    let archivo = path.join(BUILD, rel);
    if (!existsSync(archivo) || statSync(archivo).isDirectory()) archivo = path.join(BUILD, "index.html");
    const ext = path.extname(archivo).toLowerCase();
    return fin(200, { "Content-Type": TIPOS[ext] || "application/octet-stream" }, readFileSync(archivo));
  } catch (e) {
    return fin(500, { "Content-Type": "text/plain" }, String((e && e.message) || e));
  }
});
servidor.listen(PUERTO, "127.0.0.1", () => console.log(`revision aislada en http://127.0.0.1:${PUERTO} · datos: ${PGRST} · evidencia: ${DIR}`));
