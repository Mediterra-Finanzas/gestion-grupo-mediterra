/* Restauración desde un respaldo auto-v4. Se corre en el equipo de un administrador,
   NUNCA desde el navegador. Por defecto SIMULA y muestra el plan; escribe solo con --aplicar.

   Variables (no se pasan por chat ni se guardan en el repo):
     SUPABASE_URL                 (opcional; por defecto producción)
     SUPABASE_SERVICE_ROLE_KEY    llave de servicio

   Uso:
     node scripts/respaldo/restaurar.mjs --listar
     node scripts/respaldo/restaurar.mjs --archivo diario/2026-10-06.json.gz --filas finanzas
     node scripts/respaldo/restaurar.mjs --archivo diario/2026-10-06.json.gz --filas finanzas --aplicar

   Garantías: verifica SHA-256 antes de usar el respaldo; `pins` nunca se restaura;
   las credenciales actuales se reinyectan; guarda una foto previa saneada (deshacer);
   cada escritura exige que la fila no haya cambiado desde la lectura (updated_at). */
import respaldo from "../../api/_respaldo.js";

const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const supaUrl = process.env.SUPABASE_URL || "https://bywovqayuzodbzwsriet.supabase.co";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) { console.error("Falta SUPABASE_SERVICE_ROLE_KEY en el entorno."); process.exit(2); }

if (args.includes("--listar")) {
  const c = respaldo.cliente({ supaUrl, serviceKey });
  (await c.listar(respaldo.PREFIJO_DIARIO)).filter((x) => x.endsWith(".json.gz")).forEach((x) => console.log(x));
  process.exit(0);
}
const archivo = arg("--archivo");
if (!archivo) { console.error("Indica --archivo (usa --listar para ver los disponibles)."); process.exit(2); }
const ids = (arg("--filas") || "").split(",").map((s) => s.trim()).filter(Boolean);
const r = await respaldo.restaurar({ supaUrl, serviceKey, archivo, ids, aplicar: args.includes("--aplicar") });
console.log(JSON.stringify(r, null, 2));
if (!r.simulacion && r.resultados.some((x) => /conflicto/.test(x.resultado))) process.exit(1);
