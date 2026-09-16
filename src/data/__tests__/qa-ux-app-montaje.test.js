/* eslint-disable */
/* Montaje de la vista previa del inicio ejecutivo dentro de OsirisModule.
 * Estas pruebas son estáticas: la prueba integrada (navegación, permisos, carga,
 * guardado, alertas, concurrencia) queda pendiente hasta que la aplicación pueda
 * apuntar a staging sin escribir en producción. */
const fs = require("fs");
const path = require("path");
const RAIZ = path.resolve(__dirname, "..", "..", "..");
const osiris = fs.readFileSync(path.join(RAIZ, "src/OsirisModule.jsx"), "utf8");

describe("vista previa del inicio ejecutivo · montaje detrás de bandera", () => {
  test("la sub-pestaña solo existe con REACT_APP_OSIRIS_UX_PREVIEW=1", () => {
    const i = osiris.indexOf('id:"inicioEjecutivo"');
    expect(i).toBeGreaterThan(0);
    const linea = osiris.slice(osiris.lastIndexOf("\n", i), osiris.indexOf("\n", i));
    expect(linea).toMatch(/process\.env\.REACT_APP_OSIRIS_UX_PREVIEW==="1"\s*\?/);
  });

  test("el render también exige la bandera y respeta el permiso de Royalties", () => {
    const i = osiris.indexOf('subTab==="inicioEjecutivo"');
    const bloque = osiris.slice(i - 80, i + 400);
    expect(bloque).toMatch(/REACT_APP_OSIRIS_UX_PREVIEW==="1" && subTab==="inicioEjecutivo"/);
    expect(bloque).toMatch(/canVerRoyalties/);
    expect(bloque).toMatch(/Sin acceso a esta vista/);
  });

  test("las pestañas existentes siguen sin cambios", () => {
    for (const id of ["resumen", "dashboard", "graficos", "totalPedidos", "royaltyPlanta", "feeEntrada",
                      "royaltyComercial", "feeViveros", "pagoObtentores", "reconciliacionIQ"])
      expect(osiris).toContain(`{id:"${id}",`);
  });

  test("ningún componente del carril UX escribe datos", () => {
    const dir = path.join(RAIZ, "src/ux");
    for (const f of fs.readdirSync(dir)) {
      const s = fs.readFileSync(path.join(dir, f), "utf8");
      expect([f, /dbSaveOsiris|dbSave[A-Z]\w*\(|method:\s*["'](POST|PATCH|PUT|DELETE)["']/.test(s)]).toEqual([f, false]);
    }
  });

  test("el punto de entrada sigue montando la aplicación", () => {
    const idx = fs.readFileSync(path.join(RAIZ, "src/index.js"), "utf8");
    expect(idx).toMatch(/import App from/);
    expect(idx).not.toMatch(/REACT_APP_UX_SOLO/);
  });
});
