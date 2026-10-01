/* eslint-disable */
// Condiciones configurables por contrato. Casos sintéticos: ningún contrato ni
// cantidad real. Lo que se comprueba es que nada se aplique sin estar confirmado
// y que lo que falta se muestre como pendiente, nunca como cero.
import {
  configBeneficio, faltantesBeneficio, estadoBeneficio, grupoDelBeneficio, consumoCupo, gruposDeBeneficio,
  configReajuste, faltantesReajuste, estadoReajuste, previsualizarReajuste,
  paisesConReinoUnido, territorioDe, resolverRetencion, cambiarPais, REINO_UNIDO, PENDIENTE,
} from "./condicionesConfigurables";

const pctPorPais = (p) => (p === "Chile" ? 1 : 0.85);   // igual que el motor de hoy

// ──────────────────────────────────────────────────────────────────
// A · Beneficio del contract fee
// ──────────────────────────────────────────────────────────────────
describe("beneficio del contract fee", () => {
  const completo = {
    id: "ctA", beneficioFee: {
      declarado: true, plantasCubiertas: 30000, alcance: "solo_este",
      referencia: "Annex 1 b), p.12", consumoPrevio: 0, consumoPrevioConocido: true, confirmado: true,
    },
  };

  test("un contrato sin beneficio declarado no queda pendiente de nada", () => {
    expect(estadoBeneficio({ id: "x" })).toBe("sinBeneficio");
    const c = consumoCupo({ id: "x" }, [], {});
    expect(c.aplica).toBe(false);
    expect(c.disponible).toBeNull();
  });

  test("declarado pero incompleto: pendiente, con la lista de lo que falta", () => {
    const ct = { id: "ctA", beneficioFee: { declarado: true, plantasCubiertas: 30000 } };
    expect(estadoBeneficio(ct)).toBe("pendiente");
    expect(faltantesBeneficio(ct)).toEqual(["cláusula que lo respalda", "historial de entregas anteriores", "confirmación"]);
  });

  test("sin historial de entregas el beneficio NO aplica y el saldo no es cero: es nulo", () => {
    const ct = { id: "ctA", beneficioFee: { declarado: true, plantasCubiertas: 30000, referencia: "Annex 1", confirmado: true, consumoPrevioConocido: false } };
    const c = consumoCupo(ct, [ct], { ctA: 12000 });
    expect(c.estado).toBe("pendiente");
    expect(c.aplica).toBe(false);
    expect(c.disponible).toBeNull();
    expect(c.consumido).toBeNull();
    expect(c.entregadasRegistradas).toBe(12000);   // lo que sí se puede contar
    expect(c.faltan).toContain("historial de entregas anteriores");
  });

  test("confirmado y completo: se puede mostrar el consumo", () => {
    const c = consumoCupo(completo, [completo], { ctA: 12000 });
    expect(c.estado).toBe("confirmado");
    expect(c.aplica).toBe(true);
    expect(c.consumido).toBe(12000);
    expect(c.disponible).toBe(18000);
    expect(c.excedido).toBe(false);
  });

  test("el consumo previo conocido se suma al registrado", () => {
    const ct = { ...completo, beneficioFee: { ...completo.beneficioFee, consumoPrevio: 5000 } };
    const c = consumoCupo(ct, [ct], { ctA: 12000 });
    expect(c.consumido).toBe(17000);
    expect(c.disponible).toBe(13000);
  });

  test("si se pasa del cupo, se avisa y el disponible no se vuelve negativo", () => {
    const c = consumoCupo(completo, [completo], { ctA: 42000 });
    expect(c.excedido).toBe(true);
    expect(c.disponible).toBe(0);
  });

  test("con alcance de grupo, el cupo se cuenta UNA vez y el consumo suma a todos", () => {
    const a = { id: "ctA", beneficioFee: { declarado: true, plantasCubiertas: 30000, alcance: "grupo", contratosDelGrupo: ["ctB"], referencia: "Annex 1", consumoPrevioConocido: true, consumoPrevio: 0, confirmado: true } };
    // El otro contrato del grupo también declara su historial: sin eso, el
    // consumo del grupo quedaría pendiente (ver acoplamiento.test.js).
    const b = { id: "ctB", beneficioFee: { consumoPrevioConocido: true, consumoPrevio: 0 } };
    const c = consumoCupo(a, [a, b], { ctA: 12000, ctB: 10000 });
    expect(c.consumido).toBe(22000);
    expect(c.disponible).toBe(8000);
    expect(c.compartidoCon).toEqual(["ctB"]);
    // el grupo aparece una sola vez, no una por contrato
    expect(gruposDeBeneficio([a, b])).toHaveLength(1);
  });

  test("el grupo ignora contratos que no existen", () => {
    const a = { id: "ctA", beneficioFee: { declarado: true, alcance: "grupo", contratosDelGrupo: ["ctB", "fantasma"] } };
    expect(grupoDelBeneficio(a, [a, { id: "ctB" }])).toEqual(["ctA", "ctB"]);
  });

  test("declarar el beneficio no toca ninguna condición económica del contrato", () => {
    const ct = { id: "ctA", valorRoyaltyPlanta: 1, montoContractFee: 30000, tipoContractFee: "Sin Devolución", beneficioFee: { declarado: true } };
    consumoCupo(ct, [ct], { ctA: 5000 });
    expect(ct.valorRoyaltyPlanta).toBe(1);
    expect(ct.montoContractFee).toBe(30000);
    expect(ct.tipoContractFee).toBe("Sin Devolución");
  });
});

// ──────────────────────────────────────────────────────────────────
// B · Reajuste por inflación
// ──────────────────────────────────────────────────────────────────
describe("reajuste por inflación", () => {
  test("la marca antigua sin datos queda pendiente, no en cero", () => {
    const ct = { royaltyInflacion: true, rcInflacionPct: 0 };
    expect(estadoReajuste(ct)).toBe("pendiente");
  });

  test("un contrato sin marca ni configuración no declara nada", () => {
    expect(estadoReajuste({})).toBe("noDeclarado");
  });

  test("porcentaje incompleto: pendiente con lo que falta", () => {
    const ct = { reajuste: { tipo: "porcentaje" } };
    expect(estadoReajuste(ct)).toBe("pendiente");
    expect(faltantesReajuste(ct)).toEqual(["porcentaje", "desde cuándo se aplica", "cláusula que lo respalda", "confirmación"]);
  });

  test("porcentaje confirmado: la comprobación muestra el factor por período", () => {
    const ct = { reajuste: { tipo: "porcentaje", pct: 2, desde: "2026-04-15", referencia: "Annexure D 1.2.5, p.24", confirmado: true } };
    expect(estadoReajuste(ct)).toBe("confirmado");
    const p = previsualizarReajuste(ct, 3000, 3);
    expect(p.filas).toHaveLength(4);
    expect(p.filas[0]).toMatchObject({ periodo: 0, factor: 1, valor: 3000 });
    expect(p.filas[1].valor).toBe(3060);
    expect(p.filas[3].valor).toBe(3183.62);
  });

  test("índice confirmado: no se proyecta ningún valor, se explica por qué", () => {
    const ct = { reajuste: { tipo: "indice", indice: "UIT", fuente: "SUNAT", fechaBase: "2025-01-01", desde: "2026-09-04", referencia: "Annexure D 1.2.4, p.34", confirmado: true } };
    expect(estadoReajuste(ct)).toBe("confirmado");
    const p = previsualizarReajuste(ct, 3000, 3);
    expect(p.filas).toHaveLength(0);
    expect(p.motivo).toMatch(/no proyecta valores de un índice/);
  });

  test("sin reajuste, confirmado, es un estado propio y no una laguna", () => {
    expect(estadoReajuste({ reajuste: { tipo: "sin_reajuste", confirmado: true } })).toBe("sinReajuste");
  });

  test("la comprobación no devuelve nada si no está confirmado", () => {
    const p = previsualizarReajuste({ reajuste: { tipo: "porcentaje", pct: 2 } }, 3000, 3);
    expect(p.estado).toBe("pendiente");
    expect(p.filas).toHaveLength(0);
  });

  test("configurar el reajuste no toca el valor del royalty comercial", () => {
    const ct = { valorRoyaltyComercial: 3000, reajuste: { tipo: "porcentaje", pct: 2, desde: "x", referencia: "y", confirmado: true } };
    previsualizarReajuste(ct, ct.valorRoyaltyComercial, 5);
    expect(ct.valorRoyaltyComercial).toBe(3000);
  });
});

// ──────────────────────────────────────────────────────────────────
// C · País, territorio y retención
// ──────────────────────────────────────────────────────────────────
describe("país del cliente, territorio y retención", () => {
  test("Reino Unido se agrega a la lista sin desplazar los existentes", () => {
    const l = paisesConReinoUnido(["Peru", "Mexico", "Chile"]);
    expect(l).toEqual(["Peru", "Mexico", "Chile", REINO_UNIDO]);
    expect(paisesConReinoUnido(l).filter((x) => x === REINO_UNIDO)).toHaveLength(1);
  });

  test("el territorio es un dato propio: si falta, es pendiente y no se copia del país", () => {
    expect(territorioDe({ pais: "Peru" })).toEqual({ valor: "", estado: PENDIENTE });
    expect(territorioDe({ pais: REINO_UNIDO, territorio: "Perú" })).toEqual({ valor: "Perú", estado: "declarado" });
  });

  // Consolidado: la tasa la resuelve el modelo publicado (retencion.js). Acá
  // solo se comprueba que esta pantalla lee de ahí y no de una tabla propia.
  test("la tasa sale del modelo publicado, no de una tabla de esta pantalla", () => {
    expect(resolverRetencion({ pais: "Chile" })).toMatchObject({ pct: 0, validado: false });
    expect(resolverRetencion({ pais: "Peru" })).toMatchObject({ pct: 15, validado: false });
  });

  test("un país sin tratamiento conocido no inventa nada: muestra lo que el motor aplica", () => {
    const r = resolverRetencion({ pais: REINO_UNIDO });
    expect(r.pct).toBe(15);            // es lo que el motor cobra hoy, y se dice
    expect(r.definitivo).toBe(false);  // sin validar
    expect(r.etiqueta).toMatch(/sin validar/);
  });

  test("`retencionPct` ya no lo lee nadie: era la segunda fuente que se eliminó", () => {
    // Campo del diseño anterior a la retención publicada. No se escribe desde
    // ninguna pantalla y en producción no hay ningún contrato que lo tenga.
    // Se conserva si estuviera cargado, pero NO decide la tasa.
    const ct = { pais: "Peru", retencionPct: 20 };
    expect(resolverRetencion(ct).pct).toBe(15);        // manda el modelo publicado
    expect(resolverRetencion(ct).definitivo).toBe(false);
    expect(cambiarPais(ct, "Chile").retencionPct).toBe(20);  // el dato no se pierde
  });

  test("cambiar el país no asigna ni cambia ninguna retención", () => {
    const antes = { id: "c1", pais: "Peru", territorio: "Perú" };
    const despues = cambiarPais(antes, REINO_UNIDO);
    expect(despues.pais).toBe(REINO_UNIDO);
    expect(despues.retencionPct).toBeUndefined();
    expect(despues.territorio).toBe("Perú");          // el territorio no se toca
    expect(antes.pais).toBe("Peru");                   // no muta el original
    expect(resolverRetencion(despues).validado).toBe(false);
  });

  test("cambiar el país conserva los datos del contrato que no son suyos", () => {
    const d = cambiarPais({ id: "c1", pais: "Peru", retencionPct: 10, territorio: "Perú" }, REINO_UNIDO);
    expect(d.retencionPct).toBe(10);     // se conserva aunque no decida nada
    expect(d.territorio).toBe("Perú"); // el territorio es otra cosa y no se toca
  });

  test("cambiar al mismo país no crea un objeto nuevo", () => {
    const ct = { id: "c1", pais: "Peru" };
    expect(cambiarPais(ct, "Peru")).toBe(ct);
  });
});
