/* Inventario de lo que hay que respaldar, SEGÚN EL REPOSITORIO (no consulta producción).
   Uso: node scripts/respaldo/inventario-repo.mjs [--json]
   - Tablas definidas en archivos .sql (CREATE TABLE), por archivo y carácter del archivo
     (esquema / borrador / solo desarrollo / pruebas).
   - Tablas usadas por el código (rest/v1/<tabla>, .from("<tabla>"), rpc).
   - Buckets de Storage usados por el código.
   El uso por el código es una búsqueda de patrones: puede no ser exhaustivo.
   Lo que el código usa pero ningún .sql define debe existir en producción sin
   definición versionada: hay que confirmarlo con la consulta de docs/plan-recuperacion.md. */
import fs from 'fs';
import path from 'path';

const RAIZ = process.cwd();
const ign = new Set(['node_modules', '.git', 'build']);
function archivos(dir, ext, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ign.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) archivos(p, ext, out); else if (ext.some(x => e.name.endsWith(x))) out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(RAIZ, p);
const caracter = (f) => /DEV_ONLY|seed_|_DEV|UAT/i.test(f) ? 'solo desarrollo/UAT'
  : /validation\/|_tests?\.sql|test_suite|preflight|staging\//i.test(f) ? 'pruebas/verificación'
  : /draft/i.test(f) ? 'borrador' : 'esquema';

const definidas = {};
for (const f of archivos(RAIZ, ['.sql'])) {
  const txt = fs.readFileSync(f, 'utf8');
  for (const m of txt.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?((?:"?[a-z_]+"?\.)?"?[a-z_][a-z0-9_]*"?)/gi)) {
    const nombre = m[1].replace(/"/g, '').replace(/^public\./, '');
    (definidas[nombre] ||= new Set()).add(`${rel(f)} [${caracter(rel(f))}]`);
  }
}
const usadas = {}, buckets = {};
for (const f of archivos(path.join(RAIZ, 'src'), ['.js', '.jsx', '.mjs']).concat(archivos(path.join(RAIZ, 'api'), ['.js', '.mjs']))) {
  if (/__tests__|\.test\./.test(f)) continue;
  const txt = fs.readFileSync(f, 'utf8');
  for (const m of txt.matchAll(/rest\/v1\/(rpc\/)?([a-z_][a-z0-9_]*)/g)) (usadas[(m[1] ? 'rpc:' : '') + m[2]] ||= new Set()).add(rel(f));
  for (const m of txt.matchAll(/from\(\s*['"]([a-z_][a-z0-9_]*)['"]\s*\)/g)) (usadas[m[1]] ||= new Set()).add(rel(f));
  // capa de datos de Proceso: { tabla: "proc_x" }
  for (const m of txt.matchAll(/\btabla\s*:\s*['"]([a-z_][a-z0-9_]*)['"]/g)) (usadas[m[1]] ||= new Set()).add(rel(f));
  for (const m of txt.matchAll(/(?:BUCKET[A-Z_]*\s*=\s*|[bB]ucket(?:_id)?\s*[:=]\s*)['"]([a-z][a-z0-9-]+)['"]/g)) (buckets[m[1]] ||= new Set()).add(rel(f));
  for (const m of txt.matchAll(/storage\/v1\/object\/(?:public\/|sign\/|list\/)?([a-z][a-z0-9-]+)\//g)) if (!['public', 'sign', 'list', 'upload'].includes(m[1])) (buckets[m[1]] ||= new Set()).add(rel(f));
}
const esquemaReal = Object.keys(definidas).filter(t => [...definidas[t]].some(x => x.endsWith('[esquema]')));
const soloNoEsquema = Object.keys(definidas).filter(t => !esquemaReal.includes(t));
const usadasTablas = Object.keys(usadas).filter(t => !t.startsWith('rpc:'));
const usadasSinDef = usadasTablas.filter(t => !definidas[t]);
const r = {
  tablasDefinidasEnEsquemas: esquemaReal.sort(),
  tablasSoloEnBorradoresOPruebas: soloNoEsquema.sort(),
  tablasUsadasPorElCodigo: usadasTablas.sort(),
  tablasUsadasSinDefinicionEnElRepo: usadasSinDef.sort(),
  rpc: Object.keys(usadas).filter(t => t.startsWith('rpc:')).sort(),
  buckets: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, [...v]])),
};
if (process.argv.includes('--json')) console.log(JSON.stringify({ ...r, definidas: Object.fromEntries(Object.entries(definidas).map(([k, v]) => [k, [...v]])) }, null, 2));
else {
  console.log(`Tablas definidas en archivos de esquema: ${r.tablasDefinidasEnEsquemas.length}`);
  console.log(`Tablas que solo aparecen en borradores/pruebas/UAT: ${r.tablasSoloEnBorradoresOPruebas.length}`);
  console.log(`Tablas usadas por el código: ${r.tablasUsadasPorElCodigo.length} (sin definición en el repo: ${r.tablasUsadasSinDefinicionEnElRepo.length}: ${r.tablasUsadasSinDefinicionEnElRepo.join(', ')})`);
  console.log(`RPC: ${r.rpc.join(', ')}`);
  console.log(`Buckets: ${Object.keys(r.buckets).join(', ')}`);
}
