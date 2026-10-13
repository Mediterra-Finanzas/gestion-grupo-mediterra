/* eslint-disable */
// Ningún archivo sensible versionado en el árbol (oct-2026). `files.zip` traía un .env y un
// App.jsx viejo con 5 PIN en claro; .gitignore evita agregarlo por descuido, esta prueba
// falla si igual entra (git add -f, o un nombre que .gitignore no cubra).
// Solo mira el árbol ACTUAL: el historial se purga aparte, con autorización.
const { execFileSync } = require("child_process");
const path = require("path");

const raiz = path.resolve(__dirname, "../..");
let archivos = [];
try { archivos = execFileSync("git", ["ls-files"], { cwd: raiz, encoding: "utf8" }).split("\n").filter(Boolean); } catch (e) { archivos = null; }

const PROHIBIDOS = [
  /\.(zip|7z|rar|tar|tgz)$/i, /\.tar\.gz$/i,          // comprimidos
  /(^|\/)\.env(\..*)?$/i,                              // .env, .env.local, …
  /(^|\/)respaldo[^/]*\.json$/i, /(^|\/)backup[^/]*\.json$/i,   // respaldos descargados
];
const PERMITIDOS = [/\.env\.example$/i];

(archivos ? test : test.skip)("el árbol no versiona comprimidos, .env ni respaldos", () => {
  const malos = archivos.filter(f => PROHIBIDOS.some(r => r.test(f)) && !PERMITIDOS.some(r => r.test(f)));
  expect(malos).toEqual([]);
});
