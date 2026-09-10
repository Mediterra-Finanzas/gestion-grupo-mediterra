/* eslint-disable */
/* APLICACIÓN SOBRE UN DESTINO EXISTENTE · auditoría, copias y cambios del equipo quedan intactos. */
const path = require("path");
const P = require(path.resolve(__dirname, "..", "aplicarRestauracion.js"));

const TOMADO = "2026-09-10T12:00:00.000Z";
const antes = "2026-09-09T12:00:00.000Z", despues = "2026-09-10T13:00:00.000Z";
const rec = {
  filas: { osiris: { value: { contratos: [{ id: "c1" }] } }, main: { value: { usuarios: [] } }, finanzas: { value: "{}" }, nueva: { value: { a: 1 } } },
  excluidas: ["audit_log", "backup_2026-09-09"],
};
const destino = [
  { id: "osiris", updated_at: antes }, { id: "main", updated_at: antes }, { id: "finanzas", updated_at: despues },
  { id: "audit_log", updated_at: antes }, { id: "backup_2026-09-09", updated_at: antes }, { id: "frisku_clientes", updated_at: antes },
];

describe("Plan de aplicación sobre un destino existente", () => {
  const plan = P.planificarAplicacion({ destino, rec, tomadoAt: TOMADO });

  test("escribe negocio en versión anterior al snapshot y crea lo que falta", () => {
    expect(plan.escribir.map((p) => [p.id, p.crear])).toEqual([["osiris", false], ["main", false], ["nueva", true]]);
  });

  test("CONTRAPRUEBA · un cambio del equipo posterior al snapshot no se pisa: es conflicto", () => {
    expect(plan.conflictos).toEqual([{ id: "finanzas", motivo: P.MOTIVO_APLICACION.POSTERIOR }]);
    expect(plan.escribir.some((p) => p.id === "finanzas")).toBe(false);
  });

  test("auditoría y copias quedan intactas y nunca aparecen en lo que se escribe", () => {
    expect(plan.excluidasIntactas.sort()).toEqual(["audit_log", "backup_2026-09-09"]);
    expect(plan.escribir.some((p) => rec.excluidas.includes(p.id))).toBe(false);
  });

  test("las filas del destino que no vienen en el lote quedan intactas", () => {
    expect(plan.intactas).toEqual(["frisku_clientes"]);
  });

  test("un excluido que llegara por error entre las filas tampoco se escribe", () => {
    const p = P.planificarAplicacion({ destino, rec: { ...rec, filas: { ...rec.filas, audit_log: { value: {} } } }, tomadoAt: TOMADO });
    expect(p.escribir.some((x) => x.id === "audit_log")).toBe(false);
  });

  test("sin tomadoAt válido no hay plan", () => {
    expect(() => P.planificarAplicacion({ destino, rec, tomadoAt: "no" })).toThrow();
  });

  test("las sentencias son condicionadas: UPDATE por versión e INSERT sin sobrescribir", () => {
    const up = P.sentenciaDe({ id: "osiris", value: {}, crear: false }, TOMADO);
    expect(up.text).toMatch(/where id = \$1 and \(updated_at is null or updated_at <= \$3::timestamptz\)/);
    expect(up.values[2]).toBe(TOMADO);
    const ins = P.sentenciaDe({ id: "nueva", value: {}, crear: true }, TOMADO);
    expect(ins.text).toMatch(/on conflict \(id\) do nothing/);
    expect(ins.text).not.toMatch(/do update/);
  });
});
