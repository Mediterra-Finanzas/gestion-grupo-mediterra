/* eslint-disable */
// Pruebas de aceptación de P1–P5. Casos sintéticos: ningún contrato, cliente
// ni cantidad real. Lo que se comprueba es la regla, no los datos de hoy.
import {
  fusionarTandas,
  totalPlantas,
  tieneAntecedentes,
  darDeBajaPlantacion,
  revertirBajaPlantacion,
  esBaja,
  separarPorRegistro,
  puedeEditarFilaRP,
  aplicarCambioFila,
  detectarInconsistencia,
  listarInconsistencias,
  confirmarEstadoFila,
  resolverAtribucionOC,
  ocLigadaAContratoSinDuplicar,
  repartirOrdenes,
  MOTIVOS_PENDIENTE,
} from "./preservacion";

// ──────────────────────────────────────────────────────────────────
// P1 · Regenerar sugerencias conserva lo registrado
// ──────────────────────────────────────────────────────────────────
describe("P1 · regenerar sugerencias", () => {
  const facturada = { id: "c1", descripcion: "Tanda 1", nPlantas: 1000, fechaEvento: "2026-03-01", nFact: "A-1", fechaPago: "2026-04-10", estadoCF: "pagado" };
  const sinRespaldo = { id: "c2", descripcion: "Tanda 2", nPlantas: 500, fechaEvento: "2026-05-01" };

  test("una cuota con factura, fecha y estado queda idéntica campo a campo", () => {
    const { activas } = fusionarTandas([facturada, sinRespaldo], [{ id: "s1", nPlantas: 777, fechaEvento: "2026-09-09" }]);
    expect(activas.find((c) => c.id === "c1")).toEqual(facturada);
    expect(activas.find((c) => c.id === "c2")).toEqual(sinRespaldo);
  });

  test("ninguna cuota existente desaparece, tenga o no antecedentes", () => {
    const { activas } = fusionarTandas([facturada, sinRespaldo], []);
    expect(activas.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  test("la sugerencia idéntica no duplica la cuota ni los importes", () => {
    const antes = totalPlantas([facturada, sinRespaldo]);
    const { activas, resumen } = fusionarTandas([facturada, sinRespaldo], [
      { id: "s1", nPlantas: 1000, fechaEvento: "2026-03-01" },
    ]);
    expect(activas).toHaveLength(2);
    expect(totalPlantas(activas)).toBe(antes);
    expect(resumen.agregadas).toBe(0);
  });

  test("misma fecha y distinta cantidad: la existente se conserva y la sugerencia queda en revisión", () => {
    const { activas, revision } = fusionarTandas([facturada], [{ id: "s1", nPlantas: 1200, fechaEvento: "2026-03-01" }]);
    expect(activas).toHaveLength(1);
    expect(activas[0]).toEqual(facturada);
    expect(revision).toHaveLength(1);
    expect(revision[0]._candidatos[0]).toMatchObject({ id: "c1", conAntecedentes: true });
  });

  test("lo que queda en revisión no es obligación activa ni suma importes", () => {
    const { activas, revision } = fusionarTandas([facturada], [{ id: "s1", nPlantas: 1200, fechaEvento: "2026-03-01" }]);
    expect(totalPlantas(activas)).toBe(1000);
    expect(activas.find((c) => c.id === "s1")).toBeUndefined();
    expect(revision[0]._revision).toBe(true);
  });

  test("una sugerencia sin parecido se agrega como activa", () => {
    const { activas, revision, resumen } = fusionarTandas([facturada], [{ id: "s9", nPlantas: 333, fechaEvento: "2027-01-15" }]);
    expect(activas.map((c) => c.id)).toEqual(["c1", "s9"]);
    expect(revision).toHaveLength(0);
    expect(resumen.agregadas).toBe(1);
  });

  test("dos existentes parecidas: la sugerencia queda en revisión con ambos candidatos", () => {
    const a = { id: "a", nPlantas: 100, fechaEvento: "2026-02-02" };
    const b = { id: "b", nPlantas: 100, fechaEvento: "2026-07-07" };
    const { revision } = fusionarTandas([a, b], [{ id: "s", nPlantas: 100, fechaEvento: "2026-12-12" }]);
    expect(revision).toHaveLength(1);
    expect(revision[0]._candidatos.map((c) => c.id).sort()).toEqual(["a", "b"]);
  });

  test("regenerar dos veces seguidas no acumula duplicados", () => {
    const sug = [{ id: "s1", nPlantas: 900, fechaEvento: "2026-08-01" }];
    const uno = fusionarTandas([facturada], sug);
    const dos = fusionarTandas(uno.activas, sug);
    expect(dos.activas).toHaveLength(uno.activas.length);
    expect(totalPlantas(dos.activas)).toBe(totalPlantas(uno.activas));
  });

  test("tieneAntecedentes distingue lo registrado de lo vacío", () => {
    expect(tieneAntecedentes(facturada)).toBe(true);
    expect(tieneAntecedentes(sinRespaldo)).toBe(false);
    expect(tieneAntecedentes({ pagado: false })).toBe(false);
    expect(tieneAntecedentes({ fechaPago: "2026-01-01" })).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────
// P2 · La baja conserva el registro
// ──────────────────────────────────────────────────────────────────
describe("P2 · baja de plantas", () => {
  const pl = { id: "p1", variedad: "V1", nPlantas: 1200, hectareas: 3, estado: "Plantado" };

  test("la baja no elimina la fila ni cambia sus cantidades", () => {
    const baja = darDeBajaPlantacion(pl, { motivo: "arranque", usuario: "ana", fecha: "2026-09-23" });
    expect(baja.id).toBe("p1");
    expect(baja.nPlantas).toBe(1200);
    expect(baja.hectareas).toBe(3);
    expect(esBaja(baja)).toBe(true);
  });

  test("queda registrado quién, cuándo y por qué, y el historial se acumula", () => {
    const baja = darDeBajaPlantacion(pl, { motivo: "arranque", usuario: "ana", fecha: "2026-09-23", documento: "anexo-1" });
    expect(baja.baja).toMatchObject({ accion: "baja", motivo: "arranque", usuario: "ana", fecha: "2026-09-23", documento: "anexo-1" });
    const vuelta = revertirBajaPlantacion(baja, { motivo: "error de carga", usuario: "ana", fecha: "2026-09-24" });
    expect(vuelta.historial).toHaveLength(2);
  });

  test("la reversión devuelve el registro a su estado anterior sin pérdida", () => {
    const baja = darDeBajaPlantacion(pl, { motivo: "x", usuario: "ana", fecha: "2026-09-23" });
    const vuelta = revertirBajaPlantacion(baja, { usuario: "ana", fecha: "2026-09-24" });
    expect(esBaja(vuelta)).toBe(false);
    expect(vuelta.baja).toBeUndefined();
    const { historial, estadoRegistro, ...resto } = vuelta;
    expect(resto).toEqual(pl);
  });

  test("la baja por sí sola no altera ningún total: sigue en la lista", () => {
    const lista = [pl, { id: "p2", nPlantas: 800, hectareas: 2 }];
    const antes = lista.reduce((s, x) => s + x.nPlantas, 0);
    const despues = lista.map((x) => (x.id === "p1" ? darDeBajaPlantacion(x, { usuario: "ana" }) : x));
    expect(despues.reduce((s, x) => s + x.nPlantas, 0)).toBe(antes);
    const { todas, vigentes, dadasDeBaja } = separarPorRegistro(despues);
    expect(todas).toHaveLength(2);
    expect(vigentes).toHaveLength(1);
    expect(dadasDeBaja).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────────────────────────
// P3 · Edición por fila
// ──────────────────────────────────────────────────────────────────
describe("P3 · edición por fila", () => {
  test("respeta el permiso existente", () => {
    expect(puedeEditarFilaRP(true)).toBe(true);
    expect(puedeEditarFilaRP("editar")).toBe(true);
    expect(puedeEditarFilaRP(false)).toBe(false);
    expect(puedeEditarFilaRP("ver")).toBe(false);
    expect(puedeEditarFilaRP(undefined)).toBe(false);
  });

  test("cambiar una fila no toca las demás", () => {
    const base = { f1: { nFact: "A-1" }, f2: { nFact: "B-2", fechaPago: "2026-01-01" } };
    const next = aplicarCambioFila(base, "f1", { nFact: "A-9" });
    expect(next.f1.nFact).toBe("A-9");
    expect(next.f2).toEqual(base.f2);
    expect(base.f1.nFact).toBe("A-1"); // no muta el original
  });

  test("escribir el número de factura no marca la fila como pagada", () => {
    const next = aplicarCambioFila({}, "f1", { nFact: "A-1" });
    expect(next.f1.pagado).toBeUndefined();
    expect(next.f1.estadoCF).toBeUndefined();
  });

  test("los antecedentes viven en una sola clave por fila", () => {
    let m = aplicarCambioFila({}, "oc1_ev1", { nFact: "A-1" });
    m = aplicarCambioFila(m, "oc1_ev1", { fechaPago: "2026-02-02" });
    expect(Object.keys(m)).toEqual(["oc1_ev1"]);
    expect(m["oc1_ev1"]).toEqual({ nFact: "A-1", fechaPago: "2026-02-02" });
  });
});

// ──────────────────────────────────────────────────────────────────
// P4 · Señalar sin resolver
// ──────────────────────────────────────────────────────────────────
describe("P4 · inconsistencias", () => {
  const conFecha = { cuotaId: "f1", fechaPago: "2026-04-10", estadoCF: "porCobrar" };
  const coherente = { cuotaId: "f2", fechaPago: "2026-04-10", estadoCF: "pagado" };

  test("una fecha de pago con estado por cobrar se señala", () => {
    const i = detectarInconsistencia(conFecha);
    expect(i.tipo).toBe("fechaPagoSinEstadoPagado");
  });

  test("señalar no cambia el estado de la fila", () => {
    const copia = { ...conFecha };
    detectarInconsistencia(copia);
    expect(copia.estadoCF).toBe("porCobrar");
    expect(copia.pagado).toBeUndefined();
  });

  test("una fila coherente no se señala", () => {
    expect(detectarInconsistencia(coherente)).toBeNull();
  });

  test("marcada como pagada sin factura ni fecha también se señala", () => {
    expect(detectarInconsistencia({ cuotaId: "f3", estadoCF: "pagado" }).tipo).toBe("pagadoSinRespaldo");
  });

  test("confirmar una fila deja la otra señalada", () => {
    const filas = [conFecha, { cuotaId: "f4", fechaPago: "2026-05-05", estadoCF: "porCobrar" }];
    expect(listarInconsistencias(filas)).toHaveLength(2);
    const ant = confirmarEstadoFila({}, "f1", "pagado", "ana", "2026-09-23");
    const filasDespues = filas.map((f) => (ant[f.cuotaId] ? { ...f, ...ant[f.cuotaId] } : f));
    const quedan = listarInconsistencias(filasDespues);
    expect(quedan).toHaveLength(1);
    expect(quedan[0].clave).toBe("f4");
  });

  test("la confirmación registra autor y fecha", () => {
    const ant = confirmarEstadoFila({}, "f1", "pagado", "ana", "2026-09-23T10:00:00Z");
    expect(ant.f1).toMatchObject({ estadoCF: "pagado", pagado: true, confirmadoPor: "ana", confirmadoEn: "2026-09-23T10:00:00Z" });
  });
});

// ──────────────────────────────────────────────────────────────────
// P5 · Órdenes ambiguas visibles, nunca duplicadas
// ──────────────────────────────────────────────────────────────────
describe("P5 · atribución de órdenes", () => {
  const ctA = { id: "ctA", clienteId: "cli1", razonSocial: "Cliente Uno" };
  const ctB = { id: "ctB", clienteId: "cli1", razonSocial: "Cliente Uno" };
  const ctC = { id: "ctC", clienteId: "cli2", razonSocial: "Cliente Dos" };

  test("un cliente con un solo contrato: la orden se atribuye igual que hoy", () => {
    const oc = { id: "oc1", cliente_id: "cli2", cliente_nombre: "Cliente Dos" };
    expect(resolverAtribucionOC(oc, [ctA, ctC])).toMatchObject({ contratoId: "ctC", pendiente: false });
  });

  test("el contrato declarado manda", () => {
    const oc = { id: "oc2", contrato_id: "ctB", cliente_id: "cli1" };
    expect(resolverAtribucionOC(oc, [ctA, ctB]).contratoId).toBe("ctB");
  });

  test("un cliente con dos contratos y orden sin contrato: queda pendiente, no se atribuye a ninguno", () => {
    const oc = { id: "oc3", cliente_id: "cli1", cliente_nombre: "Cliente Uno" };
    const r = resolverAtribucionOC(oc, [ctA, ctB]);
    expect(r.pendiente).toBe(true);
    expect(r.contratoId).toBeNull();
    expect(r.motivo).toBe(MOTIVOS_PENDIENTE.AMBIGUA);
    expect(r.candidatos.sort()).toEqual(["ctA", "ctB"]);
    expect(ocLigadaAContratoSinDuplicar(oc, ctA, [ctA, ctB])).toBe(false);
    expect(ocLigadaAContratoSinDuplicar(oc, ctB, [ctA, ctB])).toBe(false);
  });

  test("la orden ambigua conserva su valor: no se muestra en cero", () => {
    const oc = { id: "oc3", cliente_id: "cli1", cantidad_plantas: 4000, fee_total_usd: 1800 };
    const { pendientes } = repartirOrdenes([oc], [ctA, ctB]);
    expect(pendientes[0].oc.cantidad_plantas).toBe(4000);
    expect(pendientes[0].oc.fee_total_usd).toBe(1800);
  });

  test("toda orden queda atribuida o pendiente, nunca en ambas ni en ninguna", () => {
    const ocs = [
      { id: "o1", cliente_id: "cli2" },
      { id: "o2", cliente_id: "cli1" },
      { id: "o3", contrato_id: "ctA" },
      { id: "o4", cliente_nombre: "Nadie" },
      { id: "o5", contrato_id: "ctZ" },
    ];
    const r = repartirOrdenes(ocs, [ctA, ctB, ctC]);
    expect(r.cuadra).toBe(true);
    expect(r.total).toBe(5);
    const atribuidas = Object.values(r.atribuidas).flat().map((o) => o.id);
    const pendientes = r.pendientes.map((p) => p.oc.id);
    expect(atribuidas.sort()).toEqual(["o1", "o3"]);
    expect(pendientes.sort()).toEqual(["o2", "o4", "o5"]);
    expect(atribuidas.filter((id) => pendientes.includes(id))).toHaveLength(0);
  });

  test("al aparecer un segundo contrato del mismo cliente, sus órdenes pasan a pendientes sin duplicarse", () => {
    const oc = { id: "oc9", cliente_id: "cli1", cliente_nombre: "Cliente Uno" };
    const antes = repartirOrdenes([oc], [ctA]);
    expect(antes.pendientes).toHaveLength(0);
    expect(antes.atribuidas.ctA).toHaveLength(1);
    const despues = repartirOrdenes([oc], [ctA, ctB]);
    expect(despues.pendientes).toHaveLength(1);
    expect(Object.keys(despues.atribuidas)).toHaveLength(0);
    expect(despues.cuadra).toBe(true);
  });

  test("una orden que declara un contrato inexistente queda pendiente y visible", () => {
    const r = resolverAtribucionOC({ id: "x", contrato_id: "ctZ" }, [ctA]);
    expect(r).toMatchObject({ pendiente: true, contratoId: null, motivo: MOTIVOS_PENDIENTE.CONTRATO_INEXISTENTE });
  });
});
