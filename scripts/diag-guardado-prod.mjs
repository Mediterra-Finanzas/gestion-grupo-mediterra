/* INCIDENTE — guardado roto en produccion. DIAGNOSTICO READ-ONLY.
 * Cero escrituras, cero DDL. Todo dentro de BEGIN TRANSACTION READ ONLY ... ROLLBACK.
 * Objetivo: por que el upsert anon sobre calendario_data no persiste.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const CTN = "osiris_t2b1_pg", REF = "bywovqayuzodbzwsriet", STG = "nlvfjpwiecgrosjnwwik";
const ENVF = ".claude/worktrees/osiris-piloto2/.env.osiris-production.local";
const POOLER = "aws-1-sa-east-1.pooler.supabase.com", PORT = "5432";

if (!existsSync(ENVF)) { console.log("ABORT: env productivo ausente en " + ENVF); process.exit(2); }
const env = {};
for (const l of readFileSync(ENVF, "utf8").split(/\r?\n/)) {
  const m = l.replace(/^\s*export\s+/, "").match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m) { let v = m[2].trim(); if (/^".*"$/.test(v)) v = v.slice(1, -1); env[m[1]] = v; }
}
const RAW = env.OSIRIS_PROD_DATABASE_URL || "";
if (!RAW.includes(REF) || JSON.stringify(env).includes(STG)) { console.log("ABORT: identidad no productiva"); process.exit(2); }
const DBURL = "postgresql://postgres." + REF + ":" + new URL(RAW).password + "@" + POOLER + ":" + PORT + "/postgres";

const TAG = /^(BEGIN|COMMIT|ROLLBACK|SET|NOTICE)\b/;
function ro(sql) {
  const p = "scripts/_diagguard.sql";
  writeFileSync(p, "\\set ON_ERROR_STOP on\nBEGIN TRANSACTION READ ONLY;\n" + sql + "\nROLLBACK;\n");
  execFileSync("docker", ["cp", p, CTN + ":/tmp/d.sql"], { stdio: "ignore" });
  const out = execFileSync("docker", ["exec", "-e", "PGURI", CTN, "sh", "-c", 'psql "$PGURI" -tAX -f /tmp/d.sql 2>&1'],
    { env: { ...process.env, PGURI: DBURL }, encoding: "utf8", timeout: 120000 });
  return out.split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !TAG.test(s));
}

console.log("== DIAGNOSTICO: guardado roto en PRODUCCION ==");
console.log("proyecto " + REF.slice(0, 3) + "…" + REF.slice(-3) + " · READ ONLY\n");

const R = ro([
  // privilegios de anon/authenticated sobre calendario_data
  "select 'PRIV|'||grantee||'|'||string_agg(privilege_type,',' order by privilege_type) from information_schema.role_table_grants where table_schema='public' and table_name='calendario_data' and grantee in ('anon','authenticated','service_role','PUBLIC') group by grantee;",
  // RLS y policies
  "select 'RLS|'||c.relrowsecurity::text||'|'||c.relforcerowsecurity::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='calendario_data';",
  "select 'POL|'||policyname||'|'||cmd||'|'||array_to_string(roles,'+')||'|'||coalesce(qual,'-')||'|'||coalesce(with_check,'-') from pg_policies where schemaname='public' and tablename='calendario_data';",
  // estado de la fila osiris y vecinas
  "select 'ROW|'||id||'|'||updated_at::text||'|'||pg_column_size(value) from calendario_data where id in ('osiris','main','finanzas','pins') order by id;",
  // has_table_privilege directo, que es lo que decide el rechazo
  "select 'HAS|anon|'||has_table_privilege('anon','public.calendario_data','SELECT')::text||'|'||has_table_privilege('anon','public.calendario_data','INSERT')::text||'|'||has_table_privilege('anon','public.calendario_data','UPDATE')::text;",
  "select 'HAS|authenticated|'||has_table_privilege('authenticated','public.calendario_data','SELECT')::text||'|'||has_table_privilege('authenticated','public.calendario_data','INSERT')::text||'|'||has_table_privilege('authenticated','public.calendario_data','UPDATE')::text;",
  // hay constraint/trigger que pueda estar rechazando?
  "select 'TRG|'||tgname||'|'||tgenabled from pg_trigger where tgrelid='public.calendario_data'::regclass and not tgisinternal;",
  // ultimas escrituras: si nadie escribe hace horas, confirma el corte
  "select 'ULT|'||to_char(max(updated_at),'YYYY-MM-DD HH24:MI')||'|'||count(*) from calendario_data;",
  "select 'RECIENTE|'||id||'|'||to_char(updated_at,'YYYY-MM-DD HH24:MI') from calendario_data order by updated_at desc limit 8;",
].join("\n"));

const de = (k) => R.filter((l) => l.startsWith(k + "|")).map((l) => l.split("|").slice(1));
const T = (v) => v === "t" || v === "true";

console.log("-- privilegios sobre calendario_data --");
for (const p of de("PRIV")) console.log("  " + p[0].padEnd(15) + " " + p[1]);
if (!de("PRIV").length) console.log("  (ninguno: nadie tiene grants directos)");

console.log("\n-- has_table_privilege (lo que decide el rechazo) --");
for (const h of de("HAS")) {
  console.log("  " + h[0].padEnd(15) + " SELECT=" + (T(h[1]) ? "si" : "NO") +
    "  INSERT=" + (T(h[2]) ? "si" : "NO") + "  UPDATE=" + (T(h[3]) ? "si" : "NO"));
}

const rls = de("RLS")[0] || [];
console.log("\n-- RLS --");
console.log("  rowsecurity=" + (T(rls[0]) ? "ACTIVA" : "inactiva") + "  force=" + (T(rls[1]) ? "si" : "no"));
const pol = de("POL");
console.log("  policies: " + (pol.length || 0));
for (const p of pol) console.log("    " + p[0] + " " + p[1] + " to " + p[2] + " using(" + p[3] + ") check(" + p[4] + ")");
if (T(rls[0]) && pol.length === 0) console.log("    !! RLS activa SIN policies: todo queda denegado para anon/authenticated");

console.log("\n-- triggers --");
console.log("  " + (de("TRG").length ? de("TRG").map((t) => t[0] + "(" + t[1] + ")").join(", ") : "ninguno"));

console.log("\n-- filas clave --");
for (const r of de("ROW")) console.log("  " + r[0].padEnd(10) + " updated " + r[1].slice(0, 19) + "  " + Math.round(Number(r[2]) / 1024) + " KB");

console.log("\n-- ultimas escrituras en toda la tabla --");
const u = de("ULT")[0] || [];
console.log("  filas totales: " + u[1] + " · ultima escritura: " + u[0]);
for (const r of de("RECIENTE")) console.log("    " + r[0].padEnd(22) + " " + r[1]);

console.log("\n== DIAGNOSTICO LEIDO · writes=0 · DDL=0 ==");
