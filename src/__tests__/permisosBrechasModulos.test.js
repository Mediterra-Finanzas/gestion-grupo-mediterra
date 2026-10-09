/* Brechas de permisos llevadas desde la rama de diseño (09-10-2026):
   Allegria Service (menú y páginas) y Frisku (Reportería BI configurable).
   Regla: se respeta solo lo EXPLÍCITO; lo no configurado queda como estaba. */
import { paginaServiceVisible, visibilidadReporteriaFrisku, CLAVE_PAGINA_SERVICE } from "../permisos/acciones";

const u = (tabs) => ({ nombre: "X", rol: "editor", tab_permisos: { allegria_service: tabs } });

describe("Allegria Service: página visible salvo «sin_acceso» explícito", () => {
  test("sin configuración: todo visible, incluida Configuración (no se infiere)", () => {
    for (const p of Object.keys(CLAVE_PAGINA_SERVICE)) expect(paginaServiceVisible(u({}), false, p)).toBe(true);
  });
  test("explícito sin_acceso oculta la página y sus detalles", () => {
    const x = u({ lotes: "sin_acceso", despachos: "sin_acceso" });
    expect(paginaServiceVisible(x, false, "lotes")).toBe(false);
    expect(paginaServiceVisible(x, false, "lote_detalle")).toBe(false);
    expect(paginaServiceVisible(x, false, "despacho")).toBe(false);
    expect(paginaServiceVisible(x, false, "ordenes")).toBe(true);
  });
  test("«ver» no oculta (solo impide editar, como ya hacían las páginas)", () => {
    expect(paginaServiceVisible(u({ lotes: "ver" }), false, "lotes")).toBe(true);
  });
  test("páginas sin clave propia no cambian", () => {
    const x = u({ recepciones: "sin_acceso", pallets: "sin_acceso" });
    for (const p of ["envases", "repaletizaje", "clientes", "tarifario", "servicios", "pendientes", "bases", "reportes_diario"])
      expect(paginaServiceVisible(x, false, p)).toBe(true);
  });
  test("admin ve todo", () => {
    expect(paginaServiceVisible(u({ lotes: "sin_acceso" }), true, "lotes")).toBe(true);
  });
});

describe("Frisku: Reportería BI", () => {
  const v = (x) => ({ visible: x });
  const todo = { bi: v(true), reportes: v(true), tablero: v(true), resumen: v(true) };
  const fr = (bi) => ({ rol: "editor", tab_permisos: { frisku: bi === undefined ? {} : { bi } } });
  test("sin «bi» guardada: regla anterior (cualquiera de las cuatro)", () => {
    expect(visibilidadReporteriaFrisku(fr(), false, todo)).toBe(true);
    expect(visibilidadReporteriaFrisku(fr(), false, { bi: v(false), reportes: v(false), tablero: v(false), resumen: v(true) })).toBe(true);
  });
  test("«bi» explícita sin_acceso oculta aunque reportes/tablero/resumen estén abiertos", () => {
    expect(visibilidadReporteriaFrisku(fr("sin_acceso"), false, todo)).toBe(false);
  });
  test("«bi» explícita ver/editar la muestra", () => {
    expect(visibilidadReporteriaFrisku(fr("ver"), false, { bi: v(true), reportes: v(false), tablero: v(false), resumen: v(false) })).toBe(true);
  });
  test("admin siempre", () => {
    expect(visibilidadReporteriaFrisku(fr("sin_acceso"), true, todo)).toBe(true);
  });
});
