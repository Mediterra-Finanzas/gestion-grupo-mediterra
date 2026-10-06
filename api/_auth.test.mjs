// Prueba del aislamiento de URL: una Preview nunca cae a producción.
import A from "./_auth.js";
let pass = 0, fail = 0;
const eq = (a, b, m) => { if (a === b) { pass++; console.log("  ✓ " + m); } else { fail++; console.error(`  ✗ ${m} (esp ${b}, obt ${a})`); } };
const PROD = "https://bywovqayuzodbzwsriet.supabase.co";
eq(A.urlSupabase({ VERCEL_ENV: "production" }), PROD, "producción sin SUPABASE_URL → URL de producción (sin cambio)");
eq(A.urlSupabase({}), PROD, "fuera de Vercel sin SUPABASE_URL → producción (comportamiento previo)");
eq(A.urlSupabase({ VERCEL_ENV: "preview" }), "", "Preview sin SUPABASE_URL → sin URL (503), nunca producción");
eq(A.urlSupabase({ VERCEL_ENV: "development" }), "", "development sin SUPABASE_URL → sin URL");
eq(A.urlSupabase({ VERCEL_ENV: "preview", SUPABASE_URL: "https://staging.example" }), "https://staging.example", "Preview con SUPABASE_URL → esa URL");
console.log(`\n_auth: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
