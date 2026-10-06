/* Inspección OFFLINE del saneo, antes de activar el cron: qué rutas quitaría el
   respaldo auto-v4 de un archivo real. No se conecta a nada.
   Entrada: el JSON del botón "💾 Respaldo" de la app o el de scripts/e2e/snapshot.mjs.
   Salida: por fila, n° de rutas quitadas y sus nombres (NUNCA los valores), y si
   quedó algún rastro de credencial.
   Uso:  node scripts/respaldo/inspeccionar.mjs ruta/al/respaldo.json */
import fs from "fs";
import R from "../../api/_respaldo.js";
const archivo = process.argv[2];
if (!archivo) { console.error("Uso: node scripts/respaldo/inspeccionar.mjs respaldo.json"); process.exit(2); }
const j = JSON.parse(fs.readFileSync(archivo, "utf8"));
// formato botón: { tablas: { id: { data, updated_at } } } · formato snapshot: { id: valor }
const filas = j.tablas
  ? Object.entries(j.tablas).map(([id, t]) => ({ id, value: t.data, updated_at: t.updated_at }))
  : Object.entries(j).map(([id, v]) => ({ id, value: v, updated_at: null }));
const { manifiesto, gz } = R.construirPaquete(filas);
manifiesto.filas.forEach((m) => {
  const generico = m.rutasQuitadas.map((r) => r.replace(/\[[^\]]+\]/g, "[]"));
  const unicos = [...new Set(generico)];
  console.log(`${m.id.padEnd(28)} ${String(m.rutasQuitadas.length).padStart(4)} rutas quitadas${unicos.length ? "  → " + unicos.slice(0, 8).join(", ") + (unicos.length > 8 ? " …" : "") : ""}`);
});
console.log(`excluidas completas: ${manifiesto.excluidas.join(", ") || "(ninguna)"}`);
const fugas = R.buscarFugas(JSON.stringify(Object.fromEntries(filas.filter((f) => !R.filaExcluida(f.id)).map((f) => [f.id, R.sanear(typeof f.value === "string" ? (() => { try { return JSON.parse(f.value); } catch { return f.value; } })() : f.value).valor]))));
console.log(fugas.length ? `ATENCIÓN, quedan rastros: ${fugas.join("; ")}` : "Sin rastros de credenciales tras el saneo.");
console.log(`tamaño comprimido: ${(gz.length / 1024).toFixed(1)} KB`);
