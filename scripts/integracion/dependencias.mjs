/* Dependencias CONCRETAS entre commits de la rama (no "comparten archivo").
   Para cada commit sin merge de BASE..HEAD que toca src/ o api/:
     - define: funciones/constantes/exports que AGREGA (líneas "+").
     - usa:    identificadores de commits ANTERIORES que aparecen en sus líneas agregadas.
   Una arista A → B significa "B usa algo que A introdujo": B no se puede integrar sin A.
   Es una aproximación textual (no un análisis del AST): se revisa a mano antes de decidir.
   Uso: node scripts/integracion/dependencias.mjs [BASE] [--md]               */
import { execFileSync } from 'child_process';

const BASE = process.argv.find((a, i) => i >= 2 && !a.startsWith('--')) || 'origin/main';
const MD = process.argv.includes('--md');
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 28 });
const commits = git('log', '--no-merges', '--reverse', '--format=%h %s', `${BASE}..HEAD`).trim().split('\n').filter(Boolean)
  .map(l => ({ h: l.slice(0, 7), s: l.slice(8) }));
// Solo definiciones de NIVEL SUPERIOR: funciones y constantes declaradas al inicio de línea
// (sin sangría) o exportadas. Las variables locales generan falsos positivos.
const RE_DEF = /^\+(?:export\s+)?(?:async\s+)?(?:function\s+([A-Za-z_]\w{4,})|const\s+([A-Za-z_]\w{4,})\s*=)/;
// Un nombre que ya existía en BASE no es una dependencia nueva.
const existeEnBase = (n) => { try { git('grep', '-q', '-w', n, BASE, '--', 'src', 'api'); return true; } catch { return false; } };
const COMUNES = new Set(['default', 'props', 'value', 'valor', 'datos', 'data', 'items', 'lista', 'total', 'fecha', 'texto', 'estado', 'filas', 'resultado']);

const info = [];
for (const c of commits) {
  const diff = git('show', '--format=', '--unified=0', c.h, '--', 'src', 'api');
  const add = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'));
  const archivos = git('show', '--format=', '--name-only', c.h).trim().split('\n').filter(Boolean);
  const define = new Set();
  for (const l of add) { const m = l.match(RE_DEF); const n = m && (m[1] || m[2]); if (n && !COMUNES.has(n) && !existeEnBase(n)) define.add(n); }
  info.push({ ...c, add: add.join('\n'), define, archivos, src: archivos.some(f => /^(src|api)\//.test(f)) });
}
const aristas = [];
info.forEach((b, j) => {
  if (!b.src) return;
  for (let i = 0; i < j; i++) {
    const a = info[i];
    // Usos en código nuevo de B de algo que A definió y que B no redefine
    const usados = [...a.define].filter(n => !b.define.has(n) && new RegExp(`\\b${n}\\b`).test(b.add));
    if (usados.length) aristas.push({ de: a.h, a: b.h, usados });
  }
});
if (MD) {
  console.log('| Commit | Asunto | Depende de (símbolos) |\n|---|---|---|');
  for (const c of info.filter(x => x.src)) {
    const d = aristas.filter(e => e.a === c.h).map(e => `${e.de} (${e.usados.slice(0, 4).join(', ')}${e.usados.length > 4 ? '…' : ''})`);
    console.log(`| ${c.h} | ${c.s.slice(0, 70)} | ${d.join('; ') || '—'} |`);
  }
  const solo = info.filter(x => !x.src).map(x => x.h);
  console.log(`\nSin código de app (solo docs, scripts o pruebas fuera de src/): ${solo.join(', ')}`);
} else console.log(JSON.stringify({ base: BASE, commits: info.map(({ add, define, ...r }) => ({ ...r, define: [...define] })), aristas }, null, 1));
