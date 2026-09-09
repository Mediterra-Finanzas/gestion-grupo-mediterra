/* Misma RUTA EXACTA, dos identidades. Primero se confirma que el objeto EXISTE
 * (descarga backend OK); recien entonces el resultado anonimo significa algo.
 * Solo GET/HEAD. Ninguna escritura. */
import { readFileSync } from "node:fs";
const RAIZ = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra";
const gp = (f, k) => readFileSync(RAIZ + "/" + f, "utf8").match(new RegExp("^" + k + "=(.*)$", "m"))[1].trim();

async function medir(nombre, U, backendKey, anonKey, buckets) {
  console.log("\n=== " + nombre + " ===");
  for (const b of buckets) {
    // 1 · encontrar un objeto real
    const l = await fetch(`${U}/storage/v1/object/list/${b}`, { method: "POST",
      headers: { apikey: backendKey, Authorization: "Bearer " + backendKey, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: "", limit: 100, offset: 0, sortBy: { column: "name", order: "asc" } }) });
    if (!l.ok) { console.log(`  ${b}: listado backend HTTP ${l.status}`); continue; }
    let it = await l.json(), ruta = null, prefijo = "";
    for (let d = 0; d < 6 && !ruta; d++) {
      const arch = it.find((x) => x.id);
      if (arch) { ruta = prefijo + arch.name; break; }
      const dir = it.find((x) => x.id === null);
      if (!dir) break;
      prefijo += dir.name + "/";
      const r2 = await fetch(`${U}/storage/v1/object/list/${b}`, { method: "POST",
        headers: { apikey: backendKey, Authorization: "Bearer " + backendKey, "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: prefijo, limit: 100, offset: 0, sortBy: { column: "name", order: "asc" } }) });
      it = r2.ok ? await r2.json() : [];
    }
    if (!ruta) { console.log(`  ${b}: sin objeto de muestra`); continue; }

    // 2 · descarga BACKEND sobre esa ruta exacta -> prueba que el objeto EXISTE
    const back = await fetch(`${U}/storage/v1/object/${b}/${ruta}`, { headers: { apikey: backendKey, Authorization: "Bearer " + backendKey } });
    const bBytes = back.ok ? (await back.arrayBuffer()).byteLength : 0;

    // 3 · MISMA RUTA EXACTA, identidad anonima (sin ningun encabezado de autorizacion)
    const sinLlave = await fetch(`${U}/storage/v1/object/${b}/${ruta}`);
    const cuerpoSin = await sinLlave.text().catch(() => "");
    // 4 · MISMA RUTA EXACTA, con la anon key publicable
    const conAnon = await fetch(`${U}/storage/v1/object/${b}/${ruta}`, { headers: { apikey: anonKey, Authorization: "Bearer " + anonKey } });
    const nAnon = conAnon.ok ? (await conAnon.arrayBuffer()).byteLength : 0;
    const cuerpoAnon = conAnon.ok ? "" : await conAnon.text().catch(() => "");
    // 5 · ruta publica
    const pub = await fetch(`${U}/storage/v1/object/public/${b}/${ruta}`);
    const nPub = pub.ok ? (await pub.arrayBuffer()).byteLength : 0;

    const cod = (s) => { try { const j = JSON.parse(s); return `statusCode=${j.statusCode} error=${j.error} code=${j.code||"-"}`; } catch { return (s||"").slice(0,80); } };
    console.log(`  bucket ${b} · objeto de prueba: …/${ruta.split("/").pop()}`);
    console.log(`    backend           HTTP ${back.status}  ${bBytes} bytes  -> EL OBJETO EXISTE: ${back.ok ? "SI" : "NO CONFIRMADO"}`);
    console.log(`    sin credencial    HTTP ${sinLlave.status}  ${sinLlave.ok ? "descarga" : cod(cuerpoSin)}`);
    console.log(`    con anon key      HTTP ${conAnon.status}  ${conAnon.ok ? nAnon + " bytes DESCARGA" : cod(cuerpoAnon)}`);
    console.log(`    ruta publica      HTTP ${pub.status}  ${pub.ok ? nPub + " bytes DESCARGA" : "no publico"}`);
    if (back.ok) {
      const veredicto = conAnon.ok && nAnon === bBytes ? "EXPUESTO a la anon key (mismos bytes que el backend)"
        : conAnon.ok ? "descarga anonima OK pero distinto tamano" : "denegado a la anon key";
      console.log(`    VEREDICTO: ${veredicto}${pub.ok ? " · Y ADEMAS descargable SIN credencial alguna" : ""}`);
    }
  }
}

// staging: contraprueba con el bucket privado que si sabemos cerrado
await medir("STAGING nlvfjpwiecgrosjnwwik",
  gp(".env.osiris-staging.local", "OSIRIS_STAGING_SUPABASE_URL"),
  gp(".env.osiris-staging.local", "OSIRIS_STAGING_SUPABASE_SECRET_KEY"),
  gp(".env.osiris-staging.local", "OSIRIS_STAGING_SUPABASE_PUBLISHABLE_KEY"),
  ["respaldo-osiris-staging"]);
