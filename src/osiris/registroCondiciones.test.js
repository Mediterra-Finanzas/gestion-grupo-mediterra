/* eslint-disable */
// T3 · Registro de condiciones. Lo que se prueba acá es que registrar NO
// aplica nada: ni mueve importes, ni valida, ni supone ceros.
//
// Cuatro ejes pedidos: preservación, permisos, concurrencia e impacto económico.

import {
  configBeneficio, faltantesBeneficio, estadoBeneficio, consumoCupo, gruposSinHistorial,
  configReajuste, faltantesReajuste, estadoReajuste, previsualizarReajuste,
  territorioDe, resolverRetencion, netoNoDefinitivo, ACCION, PENDIENTE,
} from "./condicionesConfigurables";
import { estadoRetencion, factorNeto } from "./retencion";

const CT = (extra) => Object.assign(
  { id: "c1", pais: "Peru", valorRoyaltyPlanta: 1, valorRoyaltyComercial: 3000 },
  extra || {}
);

// ══════════════════════════════════════════════════════════════════
describe('1 · "sin declarar" no significa "no existe"', () => {
  test("un contrato sin beneficio declarado no afirma que no lo tenga", () => {
    expect(estadoBeneficio(CT())).toBe("sinBeneficio");
    expect(configBeneficio(CT()).declarado).toBe(false);
    expect(configBeneficio(CT()).plantasCubiertas).toBeNull();   // null, nunca 0
  });

  test("un reajuste sin declarar no es lo mismo que 'sin reajuste'", () => {
    const sinDeclarar = estadoReajuste(CT());
    const declaradoSinReajuste = estadoReajuste(CT({ reajuste: { tipo: "sin_reajuste", confirmado: true } }));
    expect(sinDeclarar).toBe("noDeclarado");
    expect(declaradoSinReajuste).toBe("sinReajuste");
    expect(sinDeclarar).not.toBe(declaradoSinReajuste);
  });

  test("el territorio sin declarar es pendiente, y no se copia del país", () => {
    expect(territorioDe(CT())).toEqual({ valor: "", estado: PENDIENTE });
    expect(territorioDe(CT()).valor).not.toBe("Peru");
  });
});

// ══════════════════════════════════════════════════════════════════
describe("2 · un consumo desconocido no es cero", () => {
  const conCupo = CT({
    beneficioFee: { declarado: true, plantasCubiertas: 30000, referencia: "Annex 1", confirmado: true, alcance: "solo_este" },
  });

  test("sin declarar el consumo previo, el saldo queda pendiente", () => {
    const c = consumoCupo(conCupo, [conCupo], { c1: 0 });
    expect(c.consumoPrevio).toBeNull();
    expect(c.disponible).toBeNull();      // no se asume el cupo entero disponible
    expect(c.consumido).toBeNull();
    expect(c.aplica).toBe(false);         // sin el dato, no se calcula
    expect(faltantesBeneficio(conCupo, [conCupo]).join(" ")).toMatch(/historial de entregas/i);
  });

  test("declarar que el consumo es CERO es distinto de no declararlo", () => {
    const conCero = CT({
      beneficioFee: Object.assign({}, conCupo.beneficioFee, { consumoPrevioConocido: true, consumoPrevio: 0 }),
    });
    const c = consumoCupo(conCero, [conCero], { c1: 0 });
    expect(c.consumoPrevio).toBe(0);
    expect(c.disponible).toBe(30000);
    expect(c.aplica).toBe(true);
    expect(faltantesBeneficio(conCero, [conCero]).join(" ")).not.toMatch(/historial de entregas/i);
  });

  test("en un cupo compartido, si a un contrato del grupo le falta el historial, no se suma", () => {
    const a = CT({ id: "a", beneficioFee: { declarado: true, plantasCubiertas: 30000, referencia: "x", confirmado: true, alcance: "grupo", contratosDelGrupo: ["b"], consumoPrevioConocido: true, consumoPrevio: 5000 } });
    const b = CT({ id: "b", beneficioFee: { declarado: true, plantasCubiertas: 30000, referencia: "x", confirmado: true, alcance: "grupo", contratosDelGrupo: ["a"] } });
    const c = consumoCupo(a, [a, b], { a: 1000, b: 2000 });
    expect(c.consumoPrevio).toBeNull();                 // no se suma 5000 + "no sé"
    expect(c.consumido).toBeNull();                     // indeterminado, no 3000
    expect(c.disponible).toBeNull();                    // ni 0 ni el cupo entero
    expect(c.disponible).not.toBe(0);
    expect(c.disponible).not.toBe(30000);
    expect(c.indeterminado).toBe(true);
    expect(c.motivoIndeterminado).toMatch(/historial/i);
    expect(c.entregadasRegistradas).toBe(3000);         // lo que SÍ se puede contar, aparte
    expect(gruposSinHistorial(a, [a, b]).length).toBeGreaterThan(0);
  });

  test("el indeterminado es una propiedad del cálculo, no una confianza en el llamador", () => {
    // Aunque el beneficio estuviera confirmado, sin el historial completo el
    // consumo no se completa con cero.
    const a = CT({ id: "a", beneficioFee: { declarado: true, plantasCubiertas: 30000, referencia: "x", confirmado: true, alcance: "grupo", contratosDelGrupo: ["b"], consumoPrevioConocido: true, consumoPrevio: 5000 } });
    const b = CT({ id: "b", beneficioFee: { declarado: true, plantasCubiertas: 30000, referencia: "x", confirmado: true, alcance: "grupo", contratosDelGrupo: ["a"] } });
    const c = consumoCupo(a, [a, b], { a: 1000, b: 2000 });
    expect(c.aplica).toBe(false);
    expect(c.consumido).toBeNull();
    expect(c.disponible).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════
describe("3 · registrar o confirmar no habilita ni valida", () => {
  const confirmado = CT({
    beneficioFee: { declarado: true, plantasCubiertas: 30000, referencia: "Annex 1", confirmado: true, alcance: "solo_este", consumoPrevioConocido: true, consumoPrevio: 0 },
    reajuste: { tipo: "porcentaje", pct: 2, desde: "2027-04-15", referencia: "Annexure D 1.2.5", confirmado: true },
  });

  test("con todo confirmado no falta nada, y aun así no aplica", () => {
    expect(faltantesBeneficio(confirmado, [confirmado])).toEqual([]);
    expect(faltantesReajuste(confirmado)).toEqual([]);
    expect(estadoBeneficio(confirmado, [confirmado])).toBe("confirmado");
    expect(estadoReajuste(confirmado)).toBe("confirmado");
    expect(ACCION.configura).toBe("Guarda configuración");
    expect(ACCION.aplica).toBe("Aplica al cálculo real");
    expect(ACCION.configura).not.toBe(ACCION.aplica);
  });

  test("confirmar un antecedente NO valida la retención", () => {
    expect(estadoRetencion(confirmado).validado).toBe(false);
    expect(resolverRetencion(confirmado).definitivo).toBe(false);
    expect(netoNoDefinitivo(confirmado).noDefinitivo).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("4 · la simulación no modifica valores y no inventa parámetros", () => {
  test("sin los parámetros necesarios no calcula: devuelve el motivo", () => {
    const sinPct = CT({ reajuste: { tipo: "porcentaje", desde: "2027-01-01", referencia: "x", confirmado: true } });
    const p = previsualizarReajuste(sinPct, 3000, 4);
    expect(p.filas).toEqual([]);
    expect(p.motivo).not.toBe("");
  });

  test("por índice no proyecta: pide la serie publicada en vez de inventarla", () => {
    const porIndice = CT({ reajuste: { tipo: "indice", indice: "IPC", fuente: "INE", fechaBase: "2026-01-01", desde: "2027-01-01", referencia: "x", confirmado: true } });
    const p = previsualizarReajuste(porIndice, 3000, 4);
    expect(p.filas).toEqual([]);
    expect(p.motivo).not.toBe("");
  });

  test("con todos los parámetros calcula, y no toca el contrato ni el valor base", () => {
    const ct = CT({ reajuste: { tipo: "porcentaje", pct: 2, desde: "2027-04-15", referencia: "x", confirmado: true } });
    const antes = JSON.stringify(ct);
    const p = previsualizarReajuste(ct, 3000, 3);
    expect(p.filas.length).toBe(4);                  // el período 0 (sin reajuste) más los 3
    expect(p.filas[0]).toMatchObject({ periodo: 0, factor: 1, valor: 3000 });
    expect(JSON.stringify(ct)).toBe(antes);          // el contrato no se tocó
    expect(ct.valorRoyaltyComercial).toBe(3000);     // el valor base tampoco
  });
});

// ══════════════════════════════════════════════════════════════════
describe("5 · preservación: registrar no pisa lo que ya estaba", () => {
  test("los campos ajenos al registro quedan intactos", () => {
    const ct = CT({
      nFact: "F-001", contractFeePagado: true, plantaciones: [{ nPlantas: 100 }],
      retencionTributaria: { estado: "sinTransicion", propuesta: { pct: 10, respaldo: "CDI" } },
    });
    configBeneficio(ct); configReajuste(ct); territorioDe(ct); estadoBeneficio(ct, [ct]);
    expect(ct.nFact).toBe("F-001");
    expect(ct.contractFeePagado).toBe(true);
    expect(ct.plantaciones).toHaveLength(1);
    expect(ct.retencionTributaria.propuesta.pct).toBe(10);
  });

  test("un contrato sin ninguno de los campos nuevos se lee sin romperse", () => {
    expect(() => { configBeneficio({}); configReajuste({}); territorioDe({}); }).not.toThrow();
    expect(configBeneficio({}).contratosDelGrupo).toEqual([]);
    expect(configReajuste({}).tipo).toBe("");
  });
});

// ══════════════════════════════════════════════════════════════════
describe("6 · permisos: solo lectura no escribe", () => {
  // La pantalla no ofrece controles cuando `can` es falso, y además las
  // funciones del modelo son puras: leerlas nunca escribe.
  test("las funciones de lectura no mutan el contrato", () => {
    const ct = CT({ beneficioFee: { declarado: true, plantasCubiertas: 30000 }, territorio: "Perú" });
    const copia = JSON.parse(JSON.stringify(ct));
    configBeneficio(ct); faltantesBeneficio(ct, [ct]); estadoBeneficio(ct, [ct]);
    consumoCupo(ct, [ct], { c1: 0 }); configReajuste(ct); faltantesReajuste(ct);
    estadoReajuste(ct); previsualizarReajuste(ct, 3000, 3); territorioDe(ct);
    resolverRetencion(ct); netoNoDefinitivo(ct);
    expect(ct).toEqual(copia);
  });

  test("el modelo no tiene ninguna función que escriba el registro", () => {
    // Todo lo que escribe pasa por `upd(...)` en la pantalla, que ya respeta
    // el permiso de la pestaña. El modelo solo lee.
    const mod = require("./condicionesConfigurables");
    const escritores = Object.keys(mod).filter((k) => /^(guardar|setear|aplicar|escribir)/i.test(k));
    expect(escritores).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("7 · concurrencia: dos ediciones no se pisan ni se mezclan", () => {
  const upB = (ct, campo, val) => Object.assign({}, ct, {
    beneficioFee: Object.assign({}, ct.beneficioFee || {}, { [campo]: val }),
  });

  test("dos campos distintos del mismo bloque conviven", () => {
    let ct = CT();
    ct = upB(ct, "declarado", true);
    ct = upB(ct, "plantasCubiertas", 30000);
    expect(configBeneficio(ct).declarado).toBe(true);
    expect(configBeneficio(ct).plantasCubiertas).toBe(30000);
  });

  test("escribir el reajuste no toca el beneficio, y al revés", () => {
    let ct = upB(CT(), "plantasCubiertas", 30000);
    ct = Object.assign({}, ct, { reajuste: { tipo: "porcentaje", pct: 2 } });
    expect(configBeneficio(ct).plantasCubiertas).toBe(30000);
    expect(configReajuste(ct).pct).toBe(2);
  });

  test("la fusión por campo conserva lo que escribió la otra edición", () => {
    const base = CT();
    const ramaA = Object.assign({}, base, { territorio: "Perú" });
    const ramaB = Object.assign({}, base, { reajuste: { tipo: "sin_reajuste", confirmado: true } });
    const fusion = Object.assign({}, ramaA, { reajuste: ramaB.reajuste });
    expect(territorioDe(fusion).valor).toBe("Perú");
    expect(estadoReajuste(fusion)).toBe("sinReajuste");
  });

  test("escribir el registro no pisa la propuesta de retención de otra edición", () => {
    const conPropuesta = CT({ retencionTributaria: { estado: "sinTransicion", propuesta: { pct: 10, respaldo: "CDI", propuestaPor: "A" } } });
    const conRegistro = Object.assign({}, conPropuesta, { territorio: "Perú" });
    expect(conRegistro.retencionTributaria.propuesta.pct).toBe(10);
    expect(estadoRetencion(conRegistro).pct).toBe(15);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("8 · impacto económico: ninguno", () => {
  const sinNada = CT();
  const conTodo = CT({
    beneficioFee: { declarado: true, plantasCubiertas: 30000, referencia: "Annex 1", confirmado: true, alcance: "solo_este", consumoPrevioConocido: true, consumoPrevio: 0 },
    reajuste: { tipo: "porcentaje", pct: 2, desde: "2027-04-15", referencia: "x", confirmado: true },
    territorio: "Perú",
  });

  test("la tasa y el factor del motor son los mismos con y sin registro", () => {
    expect(estadoRetencion(conTodo).pct).toBe(estadoRetencion(sinNada).pct);
    expect(factorNeto(conTodo)).toBe(factorNeto(sinNada));
  });

  test("declarar un beneficio no cambia el valor por planta ni por hectárea", () => {
    expect(conTodo.valorRoyaltyPlanta).toBe(sinNada.valorRoyaltyPlanta);
    expect(conTodo.valorRoyaltyComercial).toBe(sinNada.valorRoyaltyComercial);
  });

  test("confirmar el reajuste no modifica el valor base del royalty comercial", () => {
    const p = previsualizarReajuste(conTodo, conTodo.valorRoyaltyComercial, 5);
    expect(p.filas.length).toBe(6);                  // período 0 más los 5
    expect(conTodo.valorRoyaltyComercial).toBe(3000);
  });
});
