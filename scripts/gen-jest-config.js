/* eslint-disable */
// Genera jest.config.tmp.json con testMatch corregido para worktrees en paths con punto
const path = require('path');
const fs = require('fs');

const rootDir = process.cwd();
const rootDirNorm = rootDir.split('\\').join('/');

const createJestConfig = require(path.join(rootDir, 'node_modules', 'react-scripts', 'scripts', 'utils', 'createJestConfig'));

const config = createJestConfig(
  rel => path.resolve(rootDir, 'node_modules', 'react-scripts', rel),
  rootDir,
  false
);

// Expandir <rootDir> con path normalizado a forward-slashes
function fix(p) {
  return p.replace(/<rootDir>/g, rootDirNorm).split('\\').join('/');
}

if (config.testMatch) config.testMatch = config.testMatch.map(fix);
if (config.roots) config.roots = config.roots.map(fix);

// Agregar cobertura si se pide
if (process.argv.includes('--coverage')) {
  config.collectCoverage = true;
  // Paths relativos desde rootDir — jest los resuelve respecto a rootDir del config
  config.collectCoverageFrom = [
    'src/anf/anfClasificacion.js',
    'src/anf/anfParser.js',
  ];
  config.coverageReporters = ['text', 'lcov'];
  // rootDir explícito en el config para que jest lo use correctamente
  config.rootDir = rootDirNorm;
}

const outPath = path.join(rootDir, 'jest.config.tmp.json');
fs.writeFileSync(outPath, JSON.stringify(config, null, 2));

console.log('jest.config.tmp.json escrito');
console.log('testMatch:', JSON.stringify(config.testMatch, null, 2));
if (config.roots) console.log('roots:', JSON.stringify(config.roots, null, 2));
