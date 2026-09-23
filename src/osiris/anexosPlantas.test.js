/* eslint-disable */
// Pruebas de los tres pedidos de Nicolás. Casos sintéticos: ningún contrato,
// cliente ni cantidad real. Lo que se comprueba es la regla.
import {
  TIPO_ANEXO_ELIMINACION, TIPO_CONTRATO_PRUEBAS,
  catalogoConEliminacion, catalogoConPruebas,
  crearAnexoEliminacion, vincularPlantaciones, retirarAnexo, tieneRespaldo,
  esAnexoEliminacion, esContratoDePruebas,
  anexosDeLaPlantacion, resumenEliminaciones,
  asignarOrdenAContrato, desasignarOrden, aplicarAsignacionEnViveros,
} from "./anexosPlantas";

// ──────────────────────────────────────────────────────────────────
// 1 · Anexo de eliminación de plantas
// ──────────────────────────────────────────────────────────────────
describe("anexo de eliminación de plantas", () => {
  test("el tipo se agrega al catálogo guardado sin tocar los demás", () => {
    const guardado = ["Extensión período de prueba", "Adenda de precio"];
    const conNuevo = catalogoConEliminacion(guardado);
    expect(conNuevo.slice(0, 2)).toEqual(guardado);
    expect(conNuevo).toContain(TIPO_ANEXO_ELIMINACION);
    expect(guardado).toHaveLength(2); // no muta el original
  });

  test("no se duplica si el catálogo ya lo trae", () => {
    const c = catalogoConEliminacion(["Adenda de precio", TIPO_ANEXO_ELIMINACION]);
    expect(c.filter((x) => x === TIPO_ANEXO_ELIMINACION)).toHaveLength(1);
  });

  test("el anexo queda con documento, fecha de efecto, plantas y plantaciones vinculadas", () => {
    const a = crearAnexoEliminacion({
      link: "https://ejemplo/anexo.pdf", fechaEfecto: "2026-03-01", plantasDeclaradas: 1500,
      plantacionIds: ["p1", "p2"], usuario: "ana", fecha: "2026-09-23T10:00:00Z", observacion: "arranque",
    });
    expect(esAnexoEliminacion(a)).toBe(true);
    expect(a).toMatchObject({ link: "https://ejemplo/anexo.pdf", fechaEfecto: "2026-03-01", plantasDeclaradas: 1500, observacion: "arranque" });
    expect(a.plantacionIds).toEqual(["p1", "p2"]);
    expect(a.historial).toEqual([{ accion: "alta", usuario: "ana", fecha: "2026-09-23T10:00:00Z" }]);
  });

  test("cambiar los vínculos conserva el documento y deja rastro", () => {
    const a = crearAnexoEliminacion({ link: "https://x/a.pdf", plantacionIds: ["p1"], usuario: "ana", fecha: "2026-09-23T10:00:00Z" });
    const b = vincularPlantaciones(a, ["p1", "p3"], { usuario: "ana", fecha: "2026-09-24T10:00:00Z" });
    expect(b.link).toBe("https://x/a.pdf");
    expect(b.plantacionIds).toEqual(["p1", "p3"]);
    expect(b.historial).toHaveLength(2);
    expect(b.historial[1]).toMatchObject({ accion: "vinculo", antes: ["p1"], despues: ["p1", "p3"] });
  });

  test("vincular lo mismo no agrega ruido al historial", () => {
    const a = crearAnexoEliminacion({ plantacionIds: ["p1", "p2"] });
    expect(vincularPlantaciones(a, ["p2", "p1"], {})).toBe(a);
  });

  test("retirar un anexo no lo borra: conserva documento, vínculos e historial", () => {
    const a = crearAnexoEliminacion({ link: "https://x/a.pdf", plantacionIds: ["p1"], usuario: "ana" });
    const r = retirarAnexo(a, { motivo: "cargado dos veces", usuario: "ana", fecha: "2026-09-25T10:00:00Z" });
    expect(r.activo).toBe(false);
    expect(r.estadoRegistro).toBe("retirado");
    expect(r.link).toBe("https://x/a.pdf");
    expect(r.plantacionIds).toEqual(["p1"]);
    expect(r.historial[r.historial.length - 1]).toMatchObject({ accion: "retiro", motivo: "cargado dos veces" });
  });

  test("tieneRespaldo distingue un anexo con documento o vínculos de uno vacío", () => {
    expect(tieneRespaldo(crearAnexoEliminacion({ link: "https://x/a.pdf" }))).toBe(true);
    expect(tieneRespaldo(crearAnexoEliminacion({ plantacionIds: ["p1"] }))).toBe(true);
    expect(tieneRespaldo(crearAnexoEliminacion({}))).toBe(false);
  });

  test("desde una plantación se ven sus anexos de eliminación", () => {
    const a1 = crearAnexoEliminacion({ id: "a1", plantacionIds: ["p1"] });
    const a2 = crearAnexoEliminacion({ id: "a2", plantacionIds: ["p2", "p1"] });
    const otro = { id: "a3", tipo: "Adenda de precio", plantacionIds: ["p1"] };
    const enc = anexosDeLaPlantacion("p1", [a1, a2, otro]);
    expect(enc.map((x) => x.id)).toEqual(["a1", "a2"]);
  });

  test("el resumen no toca importes y señala las bajas sin anexo", () => {
    const ct = {
      plantaciones: [
        { id: "p1", nPlantas: 1420, estadoRegistro: "baja" },
        { id: "p2", nPlantas: 1450, estadoRegistro: "baja" },
        { id: "p3", nPlantas: 900 },
      ],
      anexosExtra: [crearAnexoEliminacion({ id: "a1", plantacionIds: ["p1"], plantasDeclaradas: 1420 })],
    };
    const r = resumenEliminaciones(ct);
    expect(r).toMatchObject({ anexos: 1, anexosActivos: 1, plantacionesVinculadas: 1, plantasDeclaradas: 1420, sinEfectoEconomico: true });
    expect(r.bajasSinAnexo).toEqual(["p2"]);
  });

  test("un anexo retirado deja de contar como respaldo de la baja", () => {
    const a = retirarAnexo(crearAnexoEliminacion({ id: "a1", plantacionIds: ["p1"] }), { usuario: "ana" });
    const r = resumenEliminaciones({ plantaciones: [{ id: "p1", estadoRegistro: "baja" }], anexosExtra: [a] });
    expect(r.anexos).toBe(1);
    expect(r.anexosActivos).toBe(0);
    expect(r.bajasSinAnexo).toEqual(["p1"]);
  });
});

// ──────────────────────────────────────────────────────────────────
// 2 · Tipo de contrato "Pruebas"
// ──────────────────────────────────────────────────────────────────
describe("tipo de contrato de pruebas", () => {
  test("se agrega al catálogo sin desplazar los existentes", () => {
    const c = catalogoConPruebas(["Licencia", "Exclusiva", "No Exclusiva"]);
    expect(c).toEqual(["Licencia", "Exclusiva", "No Exclusiva", TIPO_CONTRATO_PRUEBAS]);
  });

  test("no se duplica", () => {
    expect(catalogoConPruebas(["Licencia", TIPO_CONTRATO_PRUEBAS]).filter((x) => x === TIPO_CONTRATO_PRUEBAS)).toHaveLength(1);
  });

  test("reconoce el contrato de pruebas y no infiere nada más", () => {
    const ct = { id: "ct1", tipoContrato: TIPO_CONTRATO_PRUEBAS, tipoContractFee: "Sin Devolución", montoContractFee: 30000, valorRoyaltyPlanta: 1 };
    expect(esContratoDePruebas(ct)).toBe(true);
    // El tipo no toca ninguna condición económica del contrato.
    expect(ct.tipoContractFee).toBe("Sin Devolución");
    expect(ct.montoContractFee).toBe(30000);
    expect(ct.valorRoyaltyPlanta).toBe(1);
  });

  test("un contrato con otro tipo no se confunde", () => {
    expect(esContratoDePruebas({ tipoContrato: "Licencia" })).toBe(false);
    expect(esContratoDePruebas({})).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
// 3 · Asignación explícita de órdenes
// ──────────────────────────────────────────────────────────────────
describe("asignación explícita de una orden", () => {
  const oc = { id: "oc1", n_oc: "OC-1", cliente_id: "cli1", cantidad_plantas: 500, despachos: [{ id: "d1" }], facturasRP: [{ nFact: "F-1" }] };

  test("asignar conserva todo lo demás de la orden", () => {
    const a = asignarOrdenAContrato(oc, "ctA", { usuario: "ana", fecha: "2026-09-23T10:00:00Z" });
    expect(a.contrato_id).toBe("ctA");
    expect(a.despachos).toEqual(oc.despachos);
    expect(a.facturasRP).toEqual(oc.facturasRP);
    expect(a.cantidad_plantas).toBe(500);
    expect(a.historialAsignacion).toEqual([{ accion: "asignacion", desde: "", hacia: "ctA", usuario: "ana", fecha: "2026-09-23T10:00:00Z" }]);
    expect(oc.contrato_id).toBeUndefined(); // no muta el original
  });

  test("reasignar deja el rastro de dónde venía", () => {
    const a = asignarOrdenAContrato(oc, "ctA", { usuario: "ana" });
    const b = asignarOrdenAContrato(a, "ctB", { usuario: "ana" });
    expect(b.contrato_id).toBe("ctB");
    expect(b.historialAsignacion).toHaveLength(2);
    expect(b.historialAsignacion[1]).toMatchObject({ desde: "ctA", hacia: "ctB" });
  });

  test("asignar al mismo contrato no hace nada", () => {
    const a = asignarOrdenAContrato(oc, "ctA", {});
    expect(asignarOrdenAContrato(a, "ctA", {})).toBe(a);
  });

  test("quitar la asignación devuelve la orden a pendiente y conserva el historial", () => {
    const a = asignarOrdenAContrato(oc, "ctA", { usuario: "ana" });
    const d = desasignarOrden(a, { usuario: "ana" });
    expect(d.contrato_id).toBeUndefined();
    expect(d.historialAsignacion).toHaveLength(2);
    expect(d.despachos).toEqual(oc.despachos);
  });

  test("dentro de viveros solo cambia la orden elegida", () => {
    const viveros = [
      { id: "v1", viverista: "V1", ordenesCompra: [{ id: "oc1", n_oc: "A" }, { id: "oc2", n_oc: "B" }] },
      { id: "v2", viverista: "V2", ordenesCompra: [{ id: "oc3", n_oc: "C" }] },
    ];
    const r = aplicarAsignacionEnViveros(viveros, "oc1", "ctA", { usuario: "ana" });
    expect(r[0].ordenesCompra[0].contrato_id).toBe("ctA");
    expect(r[0].ordenesCompra[1]).toEqual(viveros[0].ordenesCompra[1]);
    expect(r[1]).toEqual(viveros[1]);
    expect(viveros[0].ordenesCompra[0].contrato_id).toBeUndefined();
  });

  test("nada se reasigna solo: sin id de orden no cambia ninguna", () => {
    const viveros = [{ id: "v1", ordenesCompra: [{ id: "oc1" }, { id: "oc2" }] }];
    expect(aplicarAsignacionEnViveros(viveros, "", "ctA", {})).toEqual(viveros);
    expect(aplicarAsignacionEnViveros(viveros, "no-existe", "ctA", {})).toEqual(viveros);
  });

  test("un cliente puede tener un contrato comercial y otro de pruebas, cada uno con sus órdenes", () => {
    const comercial = { id: "ctC", clienteId: "cli1", tipoContrato: "Licencia" };
    const pruebas = { id: "ctP", clienteId: "cli1", tipoContrato: TIPO_CONTRATO_PRUEBAS };
    let viveros = [{ id: "v1", ordenesCompra: [{ id: "oc1", cliente_id: "cli1" }, { id: "oc2", cliente_id: "cli1" }] }];
    viveros = aplicarAsignacionEnViveros(viveros, "oc1", comercial.id, { usuario: "ana" });
    viveros = aplicarAsignacionEnViveros(viveros, "oc2", pruebas.id, { usuario: "ana" });
    const ocs = viveros[0].ordenesCompra;
    expect(ocs[0].contrato_id).toBe("ctC");
    expect(ocs[1].contrato_id).toBe("ctP");
    // Cada orden queda en un solo contrato: ninguna cuenta dos veces.
    expect(new Set(ocs.map((o) => o.contrato_id)).size).toBe(2);
  });
});
