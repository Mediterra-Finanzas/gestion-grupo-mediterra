/* eslint-disable */
/* Guardia de la rama `runtime/staging-respaldo`.
 *
 * El riesgo no es teorico: el 2026-09-09 levantar el servidor de desarrollo en
 * un arbol que importaba `App.jsx` escribio las filas `main` y `pins` de
 * PRODUCCION, porque la URL productiva esta incrustada en las constantes de los
 * modulos. Configurar variables de entorno no alcanza cuando el destino viaja
 * en el codigo.
 *
 * Estas pruebas fallan si alguien vuelve a meter la aplicacion, una funcion
 * ajena o un cron de otro carril en esta rama. */

const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..", "..", "..");
const REF_PRODUCCION = "bywovqayuzodbzwsriet";
const leer = (p) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const existe = (p) => fs.existsSync(path.join(RAIZ, p));

/* Recorre el grafo de imports desde un archivo y devuelve los modulos locales
 * alcanzables. Es el unico criterio que importa: un archivo puede tener la URL
 * productiva y ser inofensivo si nadie lo importa. */
function alcanzables(entrada) {
  const visto = new Set();
  const resolver = (desde, esp) => {
    if (!esp.startsWith(".")) return null;
    const p = path.resolve(path.dirname(desde), esp);
    for (const ext of ["", ".js", ".jsx", "/index.js", "/index.jsx"])
      if (fs.existsSync(p + ext) && fs.statSync(p + ext).isFile()) return p + ext;
    return null;
  };
  (function rec(f) {
    if (!f || visto.has(f)) return;
    visto.add(f);
    const s = fs.readFileSync(f, "utf8");
    for (const m of s.matchAll(/from\s+["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)|import\(\s*["']([^"']+)["']\s*\)/g))
      rec(resolver(f, m[1] || m[2] || m[3]));
  })(path.join(RAIZ, entrada));
  return [...visto];
}

describe("runtime de staging · el frontend no puede alcanzar produccion", () => {
  test("el punto de entrada no importa App", () => {
    const s = leer("src/index.js");
    expect(s).not.toMatch(/from\s+["']\.\/App["']/);
    expect(s).not.toMatch(/import\(\s*["']\.\/App["']/);
  });

  test("la aplicacion solo se monta con la variable del build, no con un parametro de URL", () => {
    const s = leer("src/index.js");
    expect(s).toContain("REACT_APP_UX_SOLO");
    // Un `?ux=1` se pierde en la primera navegacion y la app arranca igual.
    expect(s).not.toMatch(/URLSearchParams|location\.search/);
  });

  test("ningun modulo alcanzable trae una URL de Supabase incrustada", () => {
    const conUrl = alcanzables("src/index.js")
      .filter((f) => /https:\/\/[a-z0-9]+\.supabase\.co/.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(RAIZ, f));
    expect(conUrl).toEqual([]);
  });

  test("el harness se niega a leer si la URL apunta a produccion", () => {
    const s = leer("src/ux/HarnessStaging.jsx");
    expect(s).toContain(REF_PRODUCCION);
    expect(s).toMatch(/apunta-a-produccion/);
  });
});

describe("runtime de staging · el backend solo trae lo del respaldo", () => {
  const permitidas = ["_reportingScheduler.js", "_reportingScheduler.test.mjs",
                      "osiris-respaldo-cron.js", "send-email.js"];

  test("no viajan funciones de otros carriles", () => {
    const hay = fs.readdirSync(path.join(RAIZ, "api"));
    expect(hay.sort()).toEqual(permitidas.sort());
    for (const f of ["api/login.js", "api/informe.js", "api/storage.js", "api/_auth.js",
                     "api/proc-reporting-daily-cron.js", "api/db"])
      expect(existe(f)).toBe(false);
  });

  test("la unica referencia a produccion en api/ es la del guardia", () => {
    const hallazgos = [];
    for (const f of fs.readdirSync(path.join(RAIZ, "api"))) {
      for (const [i, l] of leer("api/" + f).split("\n").entries())
        if (l.includes(REF_PRODUCCION)) hallazgos.push(`api/${f}:${i + 1} ${l.trim()}`);
    }
    expect(hallazgos).toHaveLength(1);
    expect(hallazgos[0]).toMatch(/REF_PRODUCCION\s*=/);
  });

  test("ningun modulo alcanzable desde el handler trae la URL productiva", () => {
    const conUrl = alcanzables("api/osiris-respaldo-cron.js")
      .filter((f) => !f.endsWith("osiris-respaldo-cron.js"))
      .filter((f) => new RegExp(REF_PRODUCCION).test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(RAIZ, f));
    expect(conUrl).toEqual([]);
  });
});

describe("runtime de staging · el cron es solo el del respaldo", () => {
  const v = JSON.parse(leer("vercel.json"));

  test("un unico cron, el del respaldo", () => {
    expect(v.crons).toHaveLength(1);
    expect(v.crons[0].path).toBe("/api/osiris-respaldo-cron");
  });

  test("no arrastra el cron del informe diario de otro carril", () => {
    expect(JSON.stringify(v)).not.toContain("proc-reporting-daily-cron");
  });

  test("el horario es UTC y diario, como lo declara Vercel", () => {
    expect(v.crons[0].schedule).toBe("0 7 * * *");
  });

  test("no queda el archivo de configuracion aparte", () => {
    expect(existe("vercel.staging.json")).toBe(false);
  });
});
