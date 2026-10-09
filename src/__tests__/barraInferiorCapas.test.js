/* La barra inferior del teléfono debe quedar BAJO todo modal o panel fijo de los
   módulos (si no, tapa sus botones de abajo) y SOBRE los encabezados fijos de las
   tablas (position: sticky). Se lee el código fuente para que un modal nuevo con
   prioridad más baja haga fallar esta prueba. */
import fs from "fs";
import path from "path";
import { Z_BARRA_INF } from "../diseno/Navegacion.jsx";

const SRC = path.join(__dirname, "..");
function archivos(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" || e.name === "diseno" ? [] : archivos(p);
    return /\.(jsx|js)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}
const fuentes = archivos(SRC).map(f => [path.relative(SRC, f), fs.readFileSync(f, "utf8")]);
// Estilo en línea: desde la posición hasta el cierre del objeto (aprox. 300 caracteres).
function capas(tipo) {
  const re = new RegExp(`position:\\s*['"]${tipo}['"]([^}]{0,300})`, "g");
  const out = [];
  for (const [f, src] of fuentes) for (const m of src.matchAll(re)) {
    const z = /zIndex:\s*(\d+)/.exec(m[1]);
    out.push({ f, z: z ? Number(z[1]) : null });
  }
  return out;
}

test("la barra inferior queda bajo todos los modales y paneles fijos con prioridad declarada", () => {
  const fijos = capas("fixed").filter(x => x.z != null);
  expect(fijos.length).toBeGreaterThan(20);
  const bajo = fijos.filter(x => x.z <= Z_BARRA_INF);
  expect(bajo).toEqual([]);
});

test("la barra inferior queda sobre los encabezados fijos de las tablas", () => {
  const sticky = capas("sticky").filter(x => x.z != null);
  expect(Math.max(...sticky.map(x => x.z))).toBeLessThan(Z_BARRA_INF);
});

test("todo elemento fijo anclado abajo deja libre la barra inferior (--mdt-barra-inf)", () => {
  const malos = [];
  for (const [f, src] of fuentes) for (const m of src.matchAll(/position:\s*['"]fixed['"]/g)) {
    const desde = src.lastIndexOf("{", m.index), hasta = src.indexOf("}", m.index);
    const obj = src.slice(desde, hasta + 1);
    if (/inset:\s*0/.test(obj)) continue;                       // modales a pantalla completa
    const b = /bottom:\s*([^,}]+)/.exec(obj);
    if (b && !/--mdt-barra-inf/.test(b[1])) malos.push(`${f}: bottom ${b[1].trim()}`);
  }
  expect(malos).toEqual([]);
});
