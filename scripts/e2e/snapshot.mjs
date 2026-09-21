/* ─────────────────────────────────────────────────────────────────────────
   SNAPSHOT DE SOLO LECTURA de la base de producción.

   Descarga las filas que la prueba necesita y las deja en un archivo local.
   SOLO hace GET: no escribe, no borra, no crea filas. El archivo resultante
   alimenta la copia aislada en memoria (fake.mjs) para que la app trabaje
   sobre una copia y nunca sobre producción.

     node scripts/e2e/snapshot.mjs /ruta/snapshot.json

   Alternativa sin red: el botón "💾 Respaldo" de la app descarga un JSON con
   las mismas filas; real.mjs también acepta ese archivo.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';

const SUPA_URL = 'https://bywovqayuzodbzwsriet.supabase.co';
const SUPA_KEY = process.env.SUPA_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5d292cWF5dXpvZGJ6d3NyaWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODU1MDgsImV4cCI6MjA5MTI2MTUwOH0.s2x2O_CxE6rl8dBqFuyfQdMyRqSyjJQWXJXesmVGXtk';

const FILAS = ['finanzas', 'finanzas_bancos', 'finanzas_esc_index'];
const destino = process.argv[2] || 'snapshot-real.json';

const out = {};
for (const id of FILAS) {
  const url = `${SUPA_URL}/rest/v1/calendario_data?id=eq.${id}&select=value,updated_at`;
  const r = await fetch(url, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } });
  if (!r.ok) { console.error(`✗ ${id}: HTTP ${r.status}`); process.exit(1); }
  const filas = await r.json();
  if (!filas.length) { console.log(`· ${id}: sin fila`); continue; }
  out[id] = { value: filas[0].value, updated_at: filas[0].updated_at };
  const bytes = JSON.stringify(filas[0].value).length;
  console.log(`✓ ${id}: ${(bytes / 1024).toFixed(0)} KB · v${filas[0].updated_at}`);
}
fs.writeFileSync(destino, JSON.stringify(out));
console.log(`\nSnapshot (solo lectura) en ${destino}`);
console.log('La base de producción no fue modificada: este script solo hace GET.');
