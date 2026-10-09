/* Capas de estilo: el sistema (src/diseno/sistema.css) y una capa heredada que solo
   puede achicarse (src/diseno/legado.css). Evita volver a acumular excepciones. */
import fs from "fs";
import path from "path";

const SRC = path.join(__dirname, "..");
const leer = (f) => fs.readFileSync(path.join(SRC, f), "utf8");
const sinComentarios = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
function archivos(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : archivos(p);
    return /\.(css|js|jsx)$/.test(e.name) ? [p] : [];
  });
}

// Reglas de la capa heredada al 09-10-2026. Solo puede BAJAR: al retirar una regla,
// bajar este número en el mismo cambio.
const MAX_REGLAS_LEGADO = 20;

test("la capa heredada no crece", () => {
  const css = sinComentarios(leer("diseno/legado.css"));
  const reglas = (css.match(/\{[^{}]*\}/g) || []).length;
  expect(reglas).toBeLessThanOrEqual(MAX_REGLAS_LEGADO);
});

test("toda regla por atributo de la capa heredada va dentro de :where() (no compite con el sistema)", () => {
  const css = sinComentarios(leer("diseno/legado.css"));
  const selectores = (css.match(/[^{}@]+\{/g) || []).map(s => s.replace(/\{$/, "").trim()).filter(s => s.includes("[style"));
  const fuera = selectores.filter(s => !s.startsWith(":where("));
  expect(fuera).toEqual([]);
});

test("no hay selectores por atributo style fuera de la capa heredada", () => {
  const fuera = archivos(SRC).filter(f => !f.endsWith(path.join("diseno", "legado.css")))
    .filter(f => /\[style\*=/.test(fs.readFileSync(f, "utf8")));
  expect(fuera.map(f => path.relative(SRC, f))).toEqual([]);
});

test("App.jsx ya no inyecta la hoja responsive en tiempo de ejecución", () => {
  expect(leer("App.jsx")).not.toMatch(/mediterra-responsive-css/);
});

test("la capa heredada se carga ANTES que el sistema", () => {
  const idx = leer("index.js");
  expect(idx.indexOf("./diseno/legado.css")).toBeGreaterThan(-1);
  expect(idx.indexOf("./diseno/legado.css")).toBeLessThan(idx.indexOf("./diseno/sistema.css"));
});
