/* Runtime de prueba AISLADO: login REAL de App.jsx contra datos restaurados.
 *
 *   /                 build de App (origin/main) compilado con REACT_APP_SUPA_URL = este origen.
 *   /rest/v1/*        proxy a un PostgREST local cuya base se cargó SOLO desde un lote
 *                     (scripts/respaldo/aislado/cargar-lote-aislado.mjs).
 *   /api/send-email   buzón local: guarda {to, subject, message} en un archivo. Sin SMTP ni red.
 *   /__csp            reportes de violación de CSP: cada intento de salir queda registrado.
 *
 * Por qué no puede consultar el origen: toda respuesta lleva Content-Security-Policy con
 * connect-src 'self' e img-src 'self' data: blob:. El navegador bloquea fetch, XHR, WebSocket e
 * imágenes hacia producción, staging o EmailJS, aunque un módulo tenga la URL fija en el código.
 *
 * Es infraestructura de prueba local: solo escucha en 127.0.0.1 y no forma parte del runtime de
 * Vercel ni de producción. No altera App: el login que corre es el del build.
 *
 * Uso: AISLADO_BUILD=<build> AISLADO_PGRST=http://127.0.0.1:<p> AISLADO_DIR=<evidencia> node servidor-aislado.mjs */
import http from "node:http";
import { readFileSync, existsSync, statSync, appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || "").slice(k.length + 3);
const PUERTO = Number(arg("puerto") || process.env.AISLADO_PUERTO || 3055);
const BUILD = arg("build") || process.env.AISLADO_BUILD ? path.resolve(arg("build") || process.env.AISLADO_BUILD) : "";
const PGRST = arg("pgrst") || process.env.AISLADO_PGRST || "", DIR = arg("dir") || process.env.AISLADO_DIR || "";
if (!BUILD || !existsSync(path.join(BUILD, "index.html")) || !/^http:\/\/127\.0\.0\.1:\d+$/.test(PGRST) || !DIR) {
  console.log("ABORT: faltan AISLADO_BUILD, AISLADO_PGRST (127.0.0.1) o AISLADO_DIR"); process.exit(2);
}
mkdirSync(DIR, { recursive: true });
const BUZON = path.join(DIR, "buzon.jsonl"), REGISTRO = path.join(DIR, "registro.jsonl"), CSPLOG = path.join(DIR, "csp.jsonl");
const CSP = [
  "default-src 'self'", "connect-src 'self'", "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:", "frame-src 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'",
  "report-uri /__csp",
].join("; ");
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain", ".woff2": "font/woff2" };
const leerCuerpo = (req) => new Promise((ok) => { const b = []; req.on("data", (c) => b.push(c)); req.on("end", () => ok(Buffer.concat(b))); });
const registrar = (o) => appendFileSync(REGISTRO, JSON.stringify({ ts: new Date().toISOString(), ...o }) + "\n");
const NO_REENVIAR = new Set(["host", "connection", "content-length", "origin", "referer", "accept-encoding"]);

http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PUERTO}`);
  const fin = (status, headers, body, extra) => {
    res.writeHead(status, { "Content-Security-Policy": CSP, "Cache-Control": "no-store", ...headers });
    res.end(body);
    registrar({ metodo: req.method, ruta: u.pathname, consulta: u.pathname.startsWith("/rest/") ? u.search.slice(0, 120) : undefined, status, ...extra });
  };
  try {
    if (u.pathname === "/__csp") {
      appendFileSync(CSPLOG, (await leerCuerpo(req)).toString("utf8") + "\n");
      return fin(204, {}, "");
    }
    // Solo para la prueba: la automatización lee el PIN custodiado del fixture y el último código
    // que llegó al buzón local para un correo, sin que esos valores pasen por la conversación.
    if (u.pathname === "/__prueba/pin-fixture" && arg("env-fixture")) {
      const m = readFileSync(arg("env-fixture"), "utf8").match(/^OSIRIS_RESPALDO_FIXTURE_PIN=(.*)$/m);
      return fin(m ? 200 : 404, { "Content-Type": "text/plain" }, m ? m[1].trim() : "", { prueba: "pin-fixture" });
    }
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
      appendFileSync(BUZON, JSON.stringify({ ts: new Date().toISOString(), to: b.to, subject: b.subject, message: b.message, modulo: b.modulo }) + "\n");
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
    // Destino de persistContract. Su URL es `(typeof process !== "undefined" && process.env &&
    // process.env.REACT_APP_SUPA_URL) || <url productiva>`. CRA reemplaza la variable por el valor
    // del build, pero en el navegador `process` no existe y la expresión cae a la URL productiva
    // fija (medido: el CSP bloqueó sus lecturas a producción). Este shim solo define `process` para
    // que la expresión YA COMPILADA resuelva al valor inyectado en el build. No cambia el algoritmo
    // y no abre salida: el CSP sigue en `connect-src 'self'`.
    if (u.pathname === "/__aislado/process-shim.js")
      return fin(200, { "Content-Type": "application/javascript" }, "window.process = window.process || { env: {} };");
    let f = path.resolve(BUILD, "." + path.posix.normalize(decodeURIComponent(u.pathname)));
    if (!f.startsWith(BUILD) || !existsSync(f) || statSync(f).isDirectory()) f = path.join(BUILD, "index.html");
    let cuerpo = readFileSync(f);
    if (f.endsWith("index.html")) cuerpo = Buffer.from(cuerpo.toString("utf8").replace("<head>", '<head><script src="/__aislado/process-shim.js"></script>'), "utf8");
    return fin(200, { "Content-Type": TIPOS[path.extname(f)] || "application/octet-stream" }, cuerpo);
  } catch (e) {
    return fin(502, { "Content-Type": "text/plain" }, "error: " + String(e.message).slice(0, 120));
  }
}).listen(PUERTO, "127.0.0.1", () => console.log(`runtime aislado en http://127.0.0.1:${PUERTO} · PostgREST ${PGRST} · evidencia ${DIR}`));
