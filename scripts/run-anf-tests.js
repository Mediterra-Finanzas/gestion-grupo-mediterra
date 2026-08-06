/* eslint-disable */
/**
 * scripts/run-anf-tests.js
 *
 * Workaround para ejecutar tests desde un worktree ubicado en un directorio con punto
 * (e.g. .claude/worktrees/...). CRA genera testMatch con backslash mixto antes de '.claude'
 * que rompe micromatch. Este script extrae la config de react-scripts, corrige el patrón
 * y llama a jest directamente.
 *
 * Uso:
 *   node scripts/run-anf-tests.js [--coverage]
 *
 * Requiere node_modules con react-scripts disponible (junction o instalación real).
 */

const path = require('path');
const fs = require('fs');

const rootDir = process.cwd();
const coverage = process.argv.includes('--coverage');

// Cargar createJestConfig de react-scripts
const createJestConfig = require(path.join(rootDir, 'node_modules', 'react-scripts', 'scripts', 'utils', 'createJestConfig'));

// Generar config exactamente como lo hace react-scripts/scripts/test.js
const config = createJestConfig(
  relativePath => path.resolve(rootDir, 'node_modules', 'react-scripts', relativePath),
  rootDir,
  false
);

// Corregir testMatch: el worktree está en .claude/worktrees/... — un directorio con punto.
// CRA genera testMatch con <rootDir> que jest luego sustituye por el path absoluto usando
// separadores Windows (\), lo que rompe micromatch. Expandimos <rootDir> aquí con el path
// normalizado a forward-slashes para que micromatch pueda globear correctamente.
const rootDirNorm = rootDir.split('\\').join('/');

function fixPattern(pattern) {
  return pattern
    .replace(/<rootDir>/g, rootDirNorm)  // expandir placeholder con path normalizado
    .split('\\').join('/');               // normalizar cualquier backslash residual
}

if (config.testMatch) {
  config.testMatch = config.testMatch.map(fixPattern);
}
if (config.roots) {
  config.roots = config.roots.map(fixPattern);
}

// Solo ejecutar tests en src/anf/
config.testPathPattern = 'src/anf/.*\\.test\\.js$';

if (coverage) {
  config.collectCoverage = true;
  config.collectCoverageFrom = [
    'src/anf/anfClasificacion.js',
    'src/anf/anfParser.js',
  ];
  config.coverageReporters = ['text', 'lcov'];
}

// Escribir config temporal
const tmpConfig = path.join(rootDir, 'jest.config.tmp.json');
fs.writeFileSync(tmpConfig, JSON.stringify(config, null, 2));

// Llamar jest directamente
const { sync: spawnSync } = require('cross-spawn');

// cross-spawn puede no estar disponible; usar child_process
const { spawnSync: cpSpawnSync } = require('child_process');

// En Windows usar jest.cmd, en Unix usar jest
const isWin = process.platform === 'win32';
const jestBin = path.join(rootDir, 'node_modules', '.bin', isWin ? 'jest.cmd' : 'jest');

const args = [
  '--config', tmpConfig,
  '--watchAll=false',
  '--forceExit',
];

console.log('\n[run-anf-tests] Ejecutando jest con config corregida...');
console.log('[run-anf-tests] testMatch corregido:', JSON.stringify(config.testMatch, null, 2));
console.log('[run-anf-tests] testPathPattern:', config.testPathPattern);
console.log('');

const result = cpSpawnSync(jestBin, args, {
  stdio: 'inherit',
  env: { ...process.env, CI: 'true' },
});

// Limpiar config temporal
try { fs.unlinkSync(tmpConfig); } catch (_) {}

process.exit(result.status ?? 1);
