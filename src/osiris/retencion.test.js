/* eslint-disable */
// Retención tributaria por contrato. Casos sintéticos.
import {
  estadoRetencion, factorNeto, netoValidado, configRetencion,
  transicionHeredada, aplicarTransicion,
  proponerRetencion, validarRetencion, revertirValidacion, puedeValidarRetencion, faltantesValidacion,
  sellarFila, estadoDeFila, factorNetoFila, resumenValidacion, celdaNeto,
  SIN_TRANSICION, HEREDADO, VALIDADA, pctPorPaisLegado,
} from "./retencion";

const admin = { nombre: "Angelo", rol: "admin" };
const cfo = { nombre: "Angelo", rol: "editor", esCFO: true };
const editor = { nombre: "Nicolás", rol: "editor" };

describe("antes de la transición: el motor calcula igual que siempre", () => {
  test("Chile no retiene, el resto retiene 15 %, y nada está validado", () => {
    expect(factorNeto({ pais: "Chile" })).toBe(1);
    expect(factorNeto({ pais: "Peru" })).toBe(0.85);
    expect(estadoRetencion({ pais: "Peru" }).estado).toBe(SIN_TRANSICION);
    expect(netoValidado({ pais: "Peru" })).toBe(false);
  });

  test("sin transición, cambiar el país SÍ mueve el neto: por eso hace falta la transición", () => {
    const ct = { pais: "Chile" };
    expect(factorNeto(ct)).toBe(1);
    expect(factorNeto({ ...ct, pais: "Reino Unido" })).toBe(0.85);
  });

  test("el aviso lo dice con todas las letras", () => {
    expect(estadoRetencion({ pais: "Chile" }).detalle).toMatch(/cambiar el país mueve el neto/);
  });
});

describe("transición explícita: congela lo que ya se aplicaba", () => {
  test("no mueve ningún factor", () => {
    ["Chile", "Peru", "Mexico", "Reino Unido", ""].forEach((pais) => {
      const antes = factorNeto({ pais });
      const despues = factorNeto(transicionHeredada({ pais }, "2026-09-24"));
      expect(despues).toBe(antes);
    });
  });

  test("después de la transición, cambiar el país ya NO mueve el neto", () => {
    const ct = transicionHeredada({ id: "c1", pais: "Chile" }, "2026-09-24");
    expect(factorNeto(ct)).toBe(1);
    expect(factorNeto({ ...ct, pais: "Reino Unido" })).toBe(1);   // la identificación dejó de decidir
    expect(factorNeto({ ...ct, pais: "Peru" })).toBe(1);
  });

  test("lo heredado NO queda validado ni se presenta como tasa aprobada", () => {
    const ct = transicionHeredada({ pais: "Peru" }, "2026-09-24");
    const e = estadoRetencion(ct);
    expect(e.estado).toBe(HEREDADO);
    expect(e.validado).toBe(false);
    expect(e.etiqueta).toBe("heredado, sin validar");
    expect(e.detalle).toMatch(/no una tasa tributaria aprobada/);
  });

  test("es idempotente: repetirla no pisa nada", () => {
    const una = transicionHeredada({ pais: "Peru" }, "2026-09-24");
    const dos = transicionHeredada(una, "2026-12-31");
    expect(dos).toBe(una);
    expect(configRetencion(dos).congeladoEl).toBe("2026-09-24");
  });

  test("sobre una lista informa cuántos migró y que ningún factor se desvió", () => {
    const lista = [{ id: "a", pais: "Chile" }, { id: "b", pais: "Peru" }, transicionHeredada({ id: "c", pais: "Peru" }, "2026-01-01")];
    const r = aplicarTransicion(lista, "2026-09-24");
    expect(r.cambiados).toBe(2);
    expect(r.yaMigrados).toBe(1);
    expect(r.desvios).toEqual([]);
  });

  test("no toca ningún otro campo del contrato", () => {
    const ct = { id: "c1", pais: "Peru", razonSocial: "X", montoContractFee: 30000, rpPlantaCuotas: [{ nFact: "F-1", pagado: true }] };
    const t = transicionHeredada(ct, "2026-09-24");
    expect(t.razonSocial).toBe("X");
    expect(t.montoContractFee).toBe(30000);
    expect(t.rpPlantaCuotas).toBe(ct.rpPlantaCuotas);   // mismas facturas y pagos
  });
});

describe("propuesta y validación", () => {
  const base = transicionHeredada({ id: "c1", pais: "Peru" }, "2026-09-24");

  test("proponer no cambia el cálculo", () => {
    const p = proponerRetencion(base, { pct: 20, respaldo: "CDI Perú-UK art. 12", propuestaPor: "Nicolás", fecha: "2026-09-24" });
    expect(factorNeto(p)).toBe(0.85);            // sigue el heredado
    expect(estadoRetencion(p).estado).toBe(HEREDADO);
    expect(estadoRetencion(p).propuesta.pct).toBe(20);
  });

  test("un editor no puede validar", () => {
    const p = proponerRetencion(base, { pct: 20, respaldo: "CDI", propuestaPor: "Nicolás" });
    expect(puedeValidarRetencion(editor)).toBe(false);
    expect(validarRetencion(p, editor)).toBeNull();
    expect(factorNeto(p)).toBe(0.85);
  });

  test("sin respaldo documental no se valida, aunque quien pida sea autorizado", () => {
    const p = proponerRetencion(base, { pct: 20, propuestaPor: "Nicolás" });
    expect(faltantesValidacion(p)).toEqual(["respaldo documental"]);
    expect(validarRetencion(p, admin)).toBeNull();
  });

  test("sin propuesta no hay nada que validar", () => {
    expect(faltantesValidacion(base)).toEqual(["una tasa propuesta"]);
    expect(validarRetencion(base, admin)).toBeNull();
  });

  test("validada por un usuario autorizado: recién ahí entra al cálculo", () => {
    const p = proponerRetencion(base, { pct: 20, respaldo: "CDI Perú-UK art. 12", propuestaPor: "Nicolás" });
    const v = validarRetencion(p, cfo, "2026-09-25");
    expect(v).not.toBeNull();
    expect(factorNeto(v)).toBe(0.8);
    expect(netoValidado(v)).toBe(true);
    const e = estadoRetencion(v);
    expect(e.etiqueta).toBe("validado");
    expect(e.detalle).toMatch(/validado por Angelo el 2026-09-25/);
    expect(e.detalle).toMatch(/CDI Perú-UK art. 12/);
  });

  test("validada, cambiar el país tampoco mueve el neto", () => {
    const v = validarRetencion(proponerRetencion(base, { pct: 20, respaldo: "CDI" }), admin, "2026-09-25");
    expect(factorNeto({ ...v, pais: "Chile" })).toBe(0.8);
  });

  test("revertir conserva el respaldo como propuesta y saca el neto de validado", () => {
    const v = validarRetencion(proponerRetencion(base, { pct: 20, respaldo: "CDI" }), admin, "2026-09-25");
    const r = revertirValidacion(v, admin);
    expect(netoValidado(r)).toBe(false);
    expect(estadoRetencion(r).estado).toBe(HEREDADO);
    expect(estadoRetencion(r).propuesta).toMatchObject({ pct: 20, respaldo: "CDI" });
    expect(revertirValidacion(v, editor)).toBeNull();
  });
});

describe("avisos en filas, tablas y exportaciones", () => {
  test("la fila queda sellada con el estado del contrato", () => {
    const ct = transicionHeredada({ id: "c1", pais: "Peru" }, "2026-09-24");
    const f = sellarFila({ montoFact: 1000, pais: "Peru" }, ct);
    expect(f.retEstado).toBe(HEREDADO);
    expect(f.netoValidado).toBe(false);
    expect(factorNetoFila(f)).toBe(0.85);
    expect(celdaNeto(f)).toBe("No · heredado, sin validar");
  });

  test("una fila antigua, solo con país, queda sin transición y sin validar", () => {
    const f = { montoFact: 1000, pais: "Mexico" };
    expect(estadoDeFila(f).estado).toBe(SIN_TRANSICION);
    expect(factorNetoFila(f)).toBe(0.85);
    expect(celdaNeto(f)).toBe("No · sin validar (heredado del país)");
  });

  test("heredado y validado NO se muestran igual", () => {
    const ct = transicionHeredada({ id: "c1", pais: "Peru" }, "2026-09-24");
    const v = validarRetencion(proponerRetencion(ct, { pct: 15, respaldo: "CDI" }), admin, "2026-09-25");
    expect(celdaNeto(sellarFila({}, ct))).not.toBe(celdaNeto(sellarFila({}, v)));
    expect(celdaNeto(sellarFila({}, v))).toBe("Sí");
    // Mismo porcentaje, distinto estado: el número coincide y la etiqueta no.
    expect(factorNeto(ct)).toBe(factorNeto(v));
  });

  test("el pie de la tabla resume cuántos netos no están validados", () => {
    const ct = transicionHeredada({ id: "c1", pais: "Peru" }, "2026-09-24");
    const v = validarRetencion(proponerRetencion(ct, { pct: 15, respaldo: "CDI" }), admin);
    const filas = [sellarFila({}, ct), sellarFila({}, v), { pais: "Peru" }];
    const r = resumenValidacion(filas);
    expect(r).toMatchObject({ total: 3, validadas: 1, heredadas: 1, sinTransicion: 1, sinValidar: 2, haySinValidar: true });
    expect(r.nota).toMatch(/2 de 3/);
    expect(r.nota).toMatch(/"Heredado" no es "validado"/);
  });

  test("si todo está validado no hay nota", () => {
    const ct = transicionHeredada({ id: "c1", pais: "Peru" }, "2026-09-24");
    const v = validarRetencion(proponerRetencion(ct, { pct: 15, respaldo: "CDI" }), admin);
    const r = resumenValidacion([sellarFila({}, v)]);
    expect(r.haySinValidar).toBe(false);
    expect(r.nota).toBe("");
  });

  test("el porcentaje legado es el que el motor usa hoy", () => {
    expect(pctPorPaisLegado("Chile")).toBe(0);
    expect(pctPorPaisLegado("Peru")).toBe(15);
    expect(pctPorPaisLegado("Reino Unido")).toBe(15);
  });
});

// ══════════════════════════════════════════════════════════════════
// Las cuatro aclaraciones que pidió el CFO
// ══════════════════════════════════════════════════════════════════
import { efectoCambioPais, registrarCambioPais, efectoRetirarValidacion, REGLA_VALIDACION } from "./retencion";

describe("1 · cambiar el país de un contrato SIN transición no puede ser silencioso", () => {
  test("si mueve el neto, exige confirmación y lo dice con los dos porcentajes", () => {
    const ct = { id: "c1", pais: "Chile" };
    const e = efectoCambioPais(ct, "Reino Unido");
    expect(e.cambiaElNeto).toBe(true);
    expect(e.requiereConfirmacion).toBe(true);
    expect(e.pctAntes).toBe(0);
    expect(e.pctDespues).toBe(15);
    expect(e.detalle).toMatch(/No es solo una corrección de identificación/);
  });

  test("si no mueve el neto, no molesta", () => {
    const e = efectoCambioPais({ id: "c1", pais: "Peru" }, "Mexico");
    expect(e.cambiaElNeto).toBe(false);
    expect(e.requiereConfirmacion).toBe(false);
    expect(e.detalle).toMatch(/el neto no se mueve/);
  });

  test("con la transición hecha, cambiar el país no mueve nada y así se informa", () => {
    const ct = transicionHeredada({ id: "c1", pais: "Chile" }, "2026-09-24");
    const e = efectoCambioPais(ct, "Reino Unido");
    expect(e.cambiaElNeto).toBe(false);
    expect(e.detalle).toMatch(/ya no depende del país/);
  });

  test("el cambio queda registrado con quién, cuándo y si movió el neto", () => {
    const ct = registrarCambioPais({ id: "c1", pais: "Chile" }, "Peru", { nombre: "Angelo" }, "2026-09-24");
    expect(ct.pais).toBe("Peru");
    expect(ct.historialPais).toHaveLength(1);
    expect(ct.historialPais[0]).toMatchObject({ de: "Chile", a: "Peru", pctAntes: 0, pctDespues: 15, movioElNeto: true, usuario: "Angelo" });
  });

  test("el historial se acumula, no se pisa", () => {
    const uno = registrarCambioPais({ id: "c1", pais: "Chile" }, "Peru", { nombre: "A" }, "2026-09-24");
    const dos = registrarCambioPais(uno, "Mexico", { nombre: "B" }, "2026-09-25");
    expect(dos.historialPais).toHaveLength(2);
    expect(dos.historialPais[1].movioElNeto).toBe(false);
  });
});

describe("2 · retirar una validación: qué tasa queda operativa", () => {
  const conTransicion = transicionHeredada({ id: "c1", pais: "Peru" }, "2026-09-24");

  test("vuelve a regir el valor congelado, NO lo que diga el país hoy", () => {
    const v = validarRetencion(proponerRetencion(conTransicion, { pct: 20, respaldo: "CDI" }), admin, "2026-09-25");
    // alguien además corrige el país a Chile mientras la tasa estaba validada
    const conPaisNuevo = { ...v, pais: "Chile" };
    const r = revertirValidacion(conPaisNuevo, admin);
    expect(estadoRetencion(r).pct).toBe(15);        // el congelado, no el 0 de Chile
    expect(estadoRetencion(r).estado).toBe(HEREDADO);
    expect(netoValidado(r)).toBe(false);
  });

  test("la tasa retirada queda como propuesta y NO entra al cálculo", () => {
    const v = validarRetencion(proponerRetencion(conTransicion, { pct: 20, respaldo: "CDI" }), admin, "2026-09-25");
    const r = revertirValidacion(v, admin);
    const e = estadoRetencion(r);
    expect(e.propuesta).toMatchObject({ pct: 20, respaldo: "CDI" });
    expect(e.pct).toBe(15);                          // manda lo heredado, no la propuesta
    expect(factorNeto(r)).toBe(0.85);
    expect(e.etiqueta).toBe("heredado, sin validar");
  });

  test("se puede avisar ANTES qué va a quedar operativo", () => {
    const v = validarRetencion(proponerRetencion(conTransicion, { pct: 20, respaldo: "CDI" }), admin, "2026-09-25");
    const ef = efectoRetirarValidacion(v);
    expect(ef).toMatchObject({ aplica: true, pctAntes: 20, pctDespues: 15, cambiaElNeto: true });
    expect(ef.detalle).toMatch(/NO entra al cálculo/);
  });

  test("si el contrato nunca pasó por la transición, retirar deja el cálculo por país y lo dice", () => {
    const sinTrans = { id: "c2", pais: "Peru" };
    const v = validarRetencion(proponerRetencion(sinTrans, { pct: 20, respaldo: "CDI" }), admin, "2026-09-25");
    const r = revertirValidacion(v, admin);
    expect(estadoRetencion(r).estado).toBe(SIN_TRANSICION);
    expect(estadoRetencion(r).pct).toBe(15);
    expect(estadoRetencion(r).detalle).toMatch(/cambiar el país mueve el neto/);
  });
});

describe("4 · quién puede validar es una regla propuesta, no un permiso aprobado", () => {
  test("la regla se declara explícitamente como no aprobada", () => {
    expect(REGLA_VALIDACION.aprobada).toBe(false);
    expect(REGLA_VALIDACION.nota).toMatch(/pendiente de aprobación/);
    expect(REGLA_VALIDACION.nota).toMatch(/No es un permiso existente/);
  });
});

// ══════════════════════════════════════════════════════════════════
// 5 · Recuperabilidad: paso mínimo de compatibilidad y guarda de rollback
// ══════════════════════════════════════════════════════════════════
import {
  factorNetoCompat, pctRetencionCompat, etiquetaWhtCompat, estadoCompat, factorNetoLegado,
  COMPAT_ROLLBACK, destinoRollbackLeeElCampo, setDestinoRollbackLeeElCampo,
  guardaValidacion, validarRetencionConGuarda,
  guardaCambioPais, registrarCambioPaisConGuarda, decisionCambioPais,
  divergenciaRollback, estadoRecuperabilidad,
  MOTIVO_GUARDA_VALIDAR, MOTIVO_GUARDA_PAIS,
} from "./retencion";

// El `pct()` que hoy corre en producción, copiado tal cual, como oráculo.
function pctProduccion(pais = "") {
  const p = pais.toLowerCase();
  if (p.includes("chile")) return 1.0;
  return 0.85;
}

const PAISES = ["Chile", "chile", "CHILE", "Peru", "Perú", "Mexico", "México", "Reino Unido", "China", ""];

// La bandera es estado de módulo: cada prueba parte del estado real de hoy.
beforeEach(() => setDestinoRollbackLeeElCampo(false));
afterEach(() => setDestinoRollbackLeeElCampo(false));

describe("5.1 · el paso mínimo no mueve ningún importe mientras el campo no esté cargado", () => {
  test("con un país suelto devuelve exactamente lo que devuelve el pct() de producción", () => {
    PAISES.forEach((pais) => {
      expect(factorNetoCompat(pais)).toBe(pctProduccion(pais));
    });
    expect(factorNetoCompat()).toBe(pctProduccion());
    expect(factorNetoCompat(null)).toBe(pctProduccion());
    expect(factorNetoCompat(undefined)).toBe(pctProduccion());
  });

  test("con un contrato SIN el campo cargado devuelve lo mismo que pct(ct.pais)", () => {
    PAISES.forEach((pais) => {
      const ct = { id: "c", pais, razonSocial: "X", montoContractFee: 30000 };
      expect(factorNetoCompat(ct)).toBe(pctProduccion(pais));
      expect(ct.retencionTributaria).toBeUndefined();   // no crea el campo
    });
  });

  test("sobre montos reales, la diferencia contra el código anterior es exactamente cero", () => {
    const montos = [30000, 12345.67, 0.01, 1000000, 0];
    PAISES.forEach((pais) => {
      montos.forEach((m) => {
        const ct = { pais };
        expect(m * factorNetoCompat(ct)).toBe(m * pctProduccion(pais));
      });
    });
  });

  test("el porcentaje y la etiqueta también coinciden con lo que hoy se muestra", () => {
    expect(pctRetencionCompat({ pais: "Chile" })).toBe(0);
    expect(pctRetencionCompat({ pais: "Peru" })).toBe(15);
    expect(etiquetaWhtCompat({ pais: "Chile" })).toBeNull();
    expect(etiquetaWhtCompat({ pais: "Peru" })).toBe("WHT 15%");
    expect(etiquetaWhtCompat("Peru")).toBe("WHT 15%");      // firma antigua, por país
  });

  test("el paso mínimo no valida nada: todo sigue sin validar", () => {
    const e = estadoCompat({ pais: "Peru" });
    expect(e.estado).toBe(SIN_TRANSICION);
    expect(e.validado).toBe(false);
    expect(e.etiqueta).toBe("sin validar (heredado del país)");
  });

  test("factorNetoLegado es el oráculo del código anterior", () => {
    PAISES.forEach((pais) => expect(factorNetoLegado(pais)).toBe(pctProduccion(pais)));
  });
});

describe("5.2 · con el campo cargado, el paso mínimo lo respeta", () => {
  test("respeta el valor congelado por la transición, aunque el país diga otra cosa", () => {
    const ct = transicionHeredada({ id: "c1", pais: "Peru" }, "2026-09-24");
    expect(factorNetoCompat(ct)).toBe(0.85);
    expect(factorNetoCompat({ ...ct, pais: "Chile" })).toBe(0.85);   // el país ya no decide
    expect(pctRetencionCompat({ ...ct, pais: "Chile" })).toBe(15);
  });

  test("respeta una tasa validada distinta de la heredada", () => {
    setDestinoRollbackLeeElCampo(true);
    const base = transicionHeredada({ id: "c1", pais: "Peru" }, "2026-09-24");
    const v = validarRetencion(proponerRetencion(base, { pct: 20, respaldo: "CDI" }), admin, "2026-09-25");
    expect(factorNetoCompat(v)).toBe(0.8);
    expect(pctRetencionCompat(v)).toBe(20);
    expect(etiquetaWhtCompat(v)).toBe("WHT 20%");     // ya no miente diciendo 15
  });

  test("una tasa validada en 0 se respeta y no se confunde con exención por país", () => {
    setDestinoRollbackLeeElCampo(true);
    const base = transicionHeredada({ id: "c1", pais: "Peru" }, "2026-09-24");
    const v = validarRetencion(proponerRetencion(base, { pct: 0, respaldo: "CDI art. 12" }), admin, "2026-09-25");
    expect(factorNetoCompat(v)).toBe(1);
    expect(estadoCompat(v).validado).toBe(true);
  });

  test("respeta una fila ya sellada por el motor", () => {
    const ct = transicionHeredada({ id: "c1", pais: "Peru" }, "2026-09-24");
    const f = sellarFila({ montoFact: 1000, pais: "Chile" }, ct);   // fila con país distinto
    expect(factorNetoCompat(f)).toBe(0.85);
    expect(estadoCompat(f).estado).toBe(HEREDADO);
  });

  test("una propuesta NUNCA entra al cálculo del paso mínimo", () => {
    const base = transicionHeredada({ id: "c1", pais: "Peru" }, "2026-09-24");
    const p = proponerRetencion(base, { pct: 20, respaldo: "CDI" });
    expect(factorNetoCompat(p)).toBe(0.85);
    expect(pctRetencionCompat(p)).toBe(15);
  });
});

describe("5.3 · la guarda bloquea validar mientras la compatibilidad esté en falso", () => {
  const conPropuesta = proponerRetencion(
    transicionHeredada({ id: "c1", pais: "Peru" }, "2026-09-24"),
    { pct: 20, respaldo: "CDI Perú-UK art. 12", propuestaPor: "Nicolás" }
  );

  test("arranca en falso: hoy el destino de rollback no lee el campo", () => {
    expect(COMPAT_ROLLBACK.destinoLeeElCampo).toBe(false);
    expect(destinoRollbackLeeElCampo()).toBe(false);
  });

  test("bloquea aunque el usuario esté autorizado y no falte nada", () => {
    const g = guardaValidacion(conPropuesta, cfo);
    expect(g.conPermiso).toBe(true);
    expect(g.faltantes).toEqual([]);
    expect(g.bloqueada).toBe(true);
    expect(g.permitida).toBe(false);
  });

  test("explica por qué bloquea y cómo se desbloquea", () => {
    const g = guardaValidacion(conPropuesta, admin);
    expect(g.motivo).toBe(MOTIVO_GUARDA_VALIDAR);
    expect(g.motivo).toMatch(/no lee retencionTributaria/);
    expect(g.motivo).toMatch(/seguiría calculando por país/);
    expect(g.comoDesbloquear).toMatch(/Desplegar el paso mínimo/);
  });

  test("recuerda además que la regla de quién valida sigue sin aprobarse", () => {
    expect(guardaValidacion(conPropuesta, admin).reglaAprobada).toBe(false);
  });

  test("bloqueada, validar no cambia el contrato ni el importe", () => {
    const r = validarRetencionConGuarda(conPropuesta, admin, "2026-09-25");
    expect(r.ok).toBe(false);
    expect(r.contrato).toBe(conPropuesta);
    expect(factorNetoCompat(r.contrato)).toBe(0.85);
    expect(netoValidado(r.contrato)).toBe(false);
    expect(r.bloqueo.motivo).toMatch(/rollback seguro/);
  });

  test("bloquea corregir el país de un contrato YA migrado", () => {
    const ct = transicionHeredada({ id: "c1", pais: "Peru" }, "2026-09-24");
    const g = guardaCambioPais(ct, "Chile");
    expect(g.bloqueada).toBe(true);
    expect(g.motivo).toBe(MOTIVO_GUARDA_PAIS);
    expect(g.motivo).toMatch(/sí lo movería al volver al código/);
    const r = registrarCambioPaisConGuarda(ct, "Chile", { nombre: "Angelo" }, "2026-09-25");
    expect(r.ok).toBe(false);
    expect(r.contrato.pais).toBe("Peru");
    expect(r.contrato.historialPais).toBeUndefined();
  });

  test("NO bloquea corregir el país de un contrato sin transición: ahí las dos versiones calculan igual", () => {
    const ct = { id: "c2", pais: "Peru" };
    const g = guardaCambioPais(ct, "Chile");
    expect(g.bloqueada).toBe(false);
    expect(g.cambiaElNeto).toBe(true);              // sigue exigiendo confirmación
    expect(g.requiereConfirmacion).toBe(true);
    const r = registrarCambioPaisConGuarda(ct, "Chile", { nombre: "Angelo" }, "2026-09-25");
    expect(r.ok).toBe(true);
    expect(r.contrato.pais).toBe("Chile");
    expect(r.contrato.historialPais).toHaveLength(1);
  });

  test("tampoco bloquea proponer, ni la transición, ni retirar una validación", () => {
    const base = transicionHeredada({ id: "c1", pais: "Peru" }, "2026-09-24");
    expect(factorNetoCompat(base)).toBe(0.85);                       // transición: cero delta
    const p = proponerRetencion(base, { pct: 20, respaldo: "CDI" });
    expect(configRetencion(p).propuesta.pct).toBe(20);               // proponer: libre
    setDestinoRollbackLeeElCampo(true);
    const v = validarRetencionConGuarda(p, admin, "2026-09-25").contrato;
    setDestinoRollbackLeeElCampo(false);
    expect(revertirValidacion(v, admin)).not.toBeNull();             // retirar: acerca al estado seguro
  });
});

describe("5.4 · habilitada la compatibilidad, el comportamiento es el ya probado", () => {
  const conPropuesta = proponerRetencion(
    transicionHeredada({ id: "c1", pais: "Peru" }, "2026-09-24"),
    { pct: 20, respaldo: "CDI Perú-UK art. 12", propuestaPor: "Nicolás" }
  );

  test("validar con la guarda entrega el mismo contrato que validarRetencion", () => {
    setDestinoRollbackLeeElCampo(true);
    const r = validarRetencionConGuarda(conPropuesta, cfo, "2026-09-25");
    expect(r.ok).toBe(true);
    expect(r.bloqueo).toBeNull();
    expect(r.contrato).toEqual(validarRetencion(conPropuesta, cfo, "2026-09-25"));
    expect(factorNeto(r.contrato)).toBe(0.8);
    expect(netoValidado(r.contrato)).toBe(true);
  });

  test("habilitada, la guarda sigue respetando permiso y respaldo", () => {
    setDestinoRollbackLeeElCampo(true);
    expect(validarRetencionConGuarda(conPropuesta, editor, "2026-09-25").ok).toBe(false);
    const sinRespaldo = proponerRetencion(transicionHeredada({ id: "c3", pais: "Peru" }), { pct: 20 });
    const g = guardaValidacion(sinRespaldo, admin);
    expect(g.bloqueada).toBe(false);
    expect(g.faltantes).toEqual(["respaldo documental"]);
    expect(g.permitida).toBe(false);
    expect(validarRetencionConGuarda(sinRespaldo, admin).ok).toBe(false);
  });

  test("habilitada, corregir el país de un contrato migrado ya no se bloquea", () => {
    setDestinoRollbackLeeElCampo(true);
    const ct = transicionHeredada({ id: "c1", pais: "Peru" }, "2026-09-24");
    const g = guardaCambioPais(ct, "Chile");
    expect(g.bloqueada).toBe(false);
    expect(g.cambiaElNeto).toBe(false);             // el país ya no decide
    const r = registrarCambioPaisConGuarda(ct, "Chile", { nombre: "Angelo" }, "2026-09-25");
    expect(r.ok).toBe(true);
    expect(factorNeto(r.contrato)).toBe(0.85);      // sigue el congelado
  });
});

describe("5.4bis · la decisión del cambio de país vive en un solo lugar", () => {
  // En la revisión en navegador apareció que la pantalla se saltaba la
  // compuerta y el registro cuando el neto no se movía: cambiaba el país de
  // un contrato ya migrado en silencio y sin dejar rastro. La decisión queda
  // acá para que no vuelva a tomarse suelta en el render.
  afterEach(() => setDestinoRollbackLeeElCampo(false));

  test("contrato migrado y rollback inseguro: bloquea aunque el neto no se mueva", () => {
    setDestinoRollbackLeeElCampo(false);
    const ct = transicionHeredada({ id: "c1", pais: "Peru" }, "2026-09-24");
    const d = decisionCambioPais(ct, "Chile");
    expect(d.efecto.cambiaElNeto).toBe(false);   // hoy el neto no se mueve
    expect(d.bloqueada).toBe(true);              // y aun así se bloquea
    expect(d.registrar).toBe(false);
    expect(d.preguntar).toBe(false);             // no se pregunta lo que no se puede hacer
    expect(d.motivo).not.toBe("");
    expect(d.comoDesbloquear).not.toBe("");
  });

  test("contrato sin transición: no bloquea, pregunta y registra", () => {
    const d = decisionCambioPais({ id: "c1", pais: "Peru" }, "Chile");
    expect(d.bloqueada).toBe(false);
    expect(d.preguntar).toBe(true);              // acá el neto SÍ se mueve
    expect(d.registrar).toBe(true);
  });

  test("con el paso mínimo desplegado: no bloquea, no pregunta, pero registra igual", () => {
    setDestinoRollbackLeeElCampo(true);
    const ct = transicionHeredada({ id: "c1", pais: "Peru" }, "2026-09-24");
    const d = decisionCambioPais(ct, "Chile");
    expect(d.bloqueada).toBe(false);
    expect(d.preguntar).toBe(false);
    expect(d.registrar).toBe(true);              // el rastro no es opcional
    const r = registrarCambioPaisConGuarda(ct, "Chile", { nombre: "Angelo" }, "2026-09-25");
    expect(r.ok).toBe(true);
    expect((r.contrato.historialPais || []).length).toBe(1);
    expect(factorNeto(r.contrato)).toBe(0.85);   // y el neto no se mueve
  });
});

describe("5.5 · medir si un rollback movería importes, en vez de discutirlo", () => {
  test("un contrato sin transición no diverge", () => {
    const d = divergenciaRollback({ id: "c1", pais: "Peru" });
    expect(d).toMatchObject({ diverge: false, pctEstaVersion: 15, pctCodigoAnterior: 15 });
  });

  test("solo con la transición aplicada, tampoco: es el escenario de cero diferencia", () => {
    const lista = ["Chile", "Peru", "Mexico", ""].map((pais, i) => transicionHeredada({ id: "c" + i, pais }, "2026-09-24"));
    const r = estadoRecuperabilidad(lista);
    expect(r.divergen).toBe(0);
    expect(r.rollbackSeguro).toBe(true);
    expect(r.nota).toMatch(/hoy volver atrás no movería importes/);
  });

  test("una tasa validada distinta rompe la seguridad del rollback y queda identificada", () => {
    setDestinoRollbackLeeElCampo(true);
    const base = transicionHeredada({ id: "c1", pais: "Peru" }, "2026-09-24");
    const v = validarRetencion(proponerRetencion(base, { pct: 20, respaldo: "CDI" }), admin, "2026-09-25");
    setDestinoRollbackLeeElCampo(false);
    const r = estadoRecuperabilidad([v, { id: "c2", pais: "Chile" }]);
    expect(r.divergen).toBe(1);
    expect(r.rollbackSeguro).toBe(false);
    expect(r.contratos[0]).toMatchObject({ id: "c1", pctEstaVersion: 20, pctCodigoAnterior: 15, factorCodigoAnterior: 0.85 });
    expect(r.nota).toMatch(/los datos no se pierden, se ignoran/);
  });

  test("un país corregido después de la transición también diverge", () => {
    const ct = { ...transicionHeredada({ id: "c1", pais: "Peru" }, "2026-09-24"), pais: "Chile" };
    const d = divergenciaRollback(ct);
    expect(d).toMatchObject({ diverge: true, pctEstaVersion: 15, pctCodigoAnterior: 0, factorCodigoAnterior: 1 });
  });

  test("con el destino leyendo el campo, el rollback vuelve a ser seguro aunque haya divergencia", () => {
    setDestinoRollbackLeeElCampo(true);
    const ct = { ...transicionHeredada({ id: "c1", pais: "Peru" }, "2026-09-24"), pais: "Chile" };
    const r = estadoRecuperabilidad([ct]);
    expect(r.divergen).toBe(1);
    expect(r.rollbackSeguro).toBe(true);
    expect(r.nota).toMatch(/volver atrás no mueve importes/);
  });

  test("lista vacía o no-lista no explota", () => {
    expect(estadoRecuperabilidad([]).rollbackSeguro).toBe(true);
    expect(estadoRecuperabilidad(null).total).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// 6 · La vuelta a la versión compatible
//
// La estrategia expand/contract está PROBADA EN LOCAL, no integrada ni
// desplegada. Lo que se prueba acá es la mitad que faltaba: que volver a la
// versión compatible conserve tasas, importes y los cambios hechos después.
//
// Tres versiones, y no hay que confundirlas:
//
//   · VERSIÓN NUEVA        — el paquete A1–A3: transición, propuesta,
//                            validación, avisos, guarda.
//   · VERSIÓN COMPATIBLE   — el paso mínimo y nada más: LEE
//                            `retencionTributaria` para calcular y rotular,
//                            pero no tiene UI de retención, no sabe aplicar
//                            la transición ni validar una tasa. Es el destino
//                            de recuperación que construye la Opción A.
//   · CÓDIGO ANTERIOR      — el de producción hoy, SIN el paso mínimo: solo
//                            mira el país. Ese sí diverge, y está medido en el
//                            acta sobre copia de datos reales (298.819,50 al
//                            volver con una tasa validada al 20 %, y
//                            2.888.370,75 con un país corregido después de la
//                            transición). Acá la divergencia se reproduce con
//                            montos sintéticos, no con esas cifras.
// ══════════════════════════════════════════════════════════════════

// La versión compatible, expresada como lo que sabe hacer. Nada más que esto.
const versionCompatible = {
  factor: (x) => factorNetoCompat(x),
  pct: (x) => pctRetencionCompat(x),
  etiqueta: (x) => etiquetaWhtCompat(x),
  neto: (x, monto) => monto * factorNetoCompat(x),
  // Guarda el contrato completo. No conoce el campo de retención, pero
  // tampoco lo pisa: persiste la fila tal como la leyó, con sus cambios.
  guardar: (ct, cambios) => ({ ...ct, ...cambios }),
};

// El código anterior SIN el paso mínimo. Solo sabe mirar el país.
const versionAnterior = {
  factor: (ct) => factorNetoLegado(ct && ct.pais),
  neto: (ct, monto) => monto * factorNetoLegado(ct && ct.pais),
};

// Supabase guarda la fila entera como JSON. El ida y vuelta se simula igual,
// para que la versión compatible lea exactamente lo que quedó escrito.
const guardarEnFila = (ct) => JSON.stringify(ct);
const leerDeFila = (s) => JSON.parse(s);

const MONTOS_SINTETICOS = [30000, 12345.67, 987654.32, 0.01];

// Escenario de partida: lo peor que la versión nueva puede dejar escrito.
// Transición aplicada + tasa validada distinta de la heredada + país corregido
// DESPUÉS de la transición. Los tres de una vez.
function escenarioVersionNueva() {
  setDestinoRollbackLeeElCampo(true);   // premisa: el paso mínimo ya está desplegado
  const base = transicionHeredada({ id: "c1", pais: "Peru", razonSocial: "Cliente X", montoContractFee: 30000 }, "2026-09-24");
  const p = proponerRetencion(base, { pct: 20, respaldo: "CDI Perú-UK art. 12", propuestaPor: "Nicolás" });
  const v = validarRetencionConGuarda(p, cfo, "2026-09-25");
  expect(v.ok).toBe(true);
  const c = registrarCambioPaisConGuarda(v.contrato, "Chile", { nombre: "Angelo" }, "2026-09-26");
  expect(c.ok).toBe(true);
  setDestinoRollbackLeeElCampo(false);
  return c.contrato;
}

describe("6 · volver a la versión compatible conserva tasas, importes y lo hecho después", () => {
  test("el escenario de partida es el peor caso: transición + tasa validada + país corregido", () => {
    const ct = escenarioVersionNueva();
    expect(configRetencion(ct).estado).toBe(VALIDADA);
    expect(estadoRetencion(ct).pct).toBe(20);
    expect(ct.pais).toBe("Chile");                       // corregido DESPUÉS de la transición
    expect(ct.historialPais).toHaveLength(1);
    expect(factorNeto(ct)).toBe(0.8);
  });

  test("paso 2-3 · la versión compatible calcula EXACTAMENTE los mismos importes", () => {
    const nuevo = escenarioVersionNueva();
    const leido = leerDeFila(guardarEnFila(nuevo));      // rollback: la fila no cambia, el código sí
    MONTOS_SINTETICOS.forEach((m) => {
      expect(versionCompatible.neto(leido, m)).toBe(m * factorNeto(nuevo));
    });
    expect(versionCompatible.factor(leido)).toBe(factorNeto(nuevo));
  });

  test("paso 3 · conserva la tasa y su respaldo, no solo el número", () => {
    const leido = leerDeFila(guardarEnFila(escenarioVersionNueva()));
    expect(versionCompatible.pct(leido)).toBe(20);
    expect(versionCompatible.etiqueta(leido)).toBe("WHT 20%");   // no dice 15
    const c = configRetencion(leido);
    expect(c).toMatchObject({ estado: VALIDADA, pct: 20, validadoPor: "Angelo", validadoEl: "2026-09-25", respaldo: "CDI Perú-UK art. 12" });
    expect(c.congeladoEl).toBe("2026-09-24");
  });

  test("paso 3 · conserva los cambios hechos DESPUÉS de la transición", () => {
    const leido = leerDeFila(guardarEnFila(escenarioVersionNueva()));
    expect(leido.pais).toBe("Chile");
    expect(leido.historialPais).toHaveLength(1);
    expect(leido.historialPais[0]).toMatchObject({ de: "Peru", a: "Chile", usuario: "Angelo" });
    // Y, justamente porque lee el campo, ese país corregido NO mueve el neto.
    expect(versionCompatible.factor(leido)).toBe(0.8);
    expect(versionCompatible.factor({ ...leido, pais: "Reino Unido" })).toBe(0.8);
  });

  test("paso 4-5 · lo que la versión compatible guarda sobrevive a la vuelta a la nueva", () => {
    const nuevo = escenarioVersionNueva();
    const leido = leerDeFila(guardarEnFila(nuevo));

    // 4 · la versión compatible hace su propio trabajo: carga una factura y su pago.
    const trabajado = versionCompatible.guardar(leido, {
      nFact: "F-2026-118", montoFacturado: 30000, fechaPago: "2026-10-03", pagado: true,
    });
    const fila = guardarEnFila(trabajado);

    // 5 · se vuelve a la versión nueva y no se perdió nada, de ningún lado.
    const devuelta = leerDeFila(fila);
    expect(devuelta.nFact).toBe("F-2026-118");           // lo cargado por la compatible
    expect(devuelta.pagado).toBe(true);
    expect(devuelta.pais).toBe("Chile");                 // el cambio posterior
    expect(devuelta.historialPais).toHaveLength(1);
    expect(configRetencion(devuelta)).toMatchObject({ estado: VALIDADA, pct: 20, respaldo: "CDI Perú-UK art. 12" });
    expect(netoValidado(devuelta)).toBe(true);
    expect(estadoRetencion(devuelta).etiqueta).toBe("validado");
    MONTOS_SINTETICOS.forEach((m) => {
      expect(m * factorNeto(devuelta)).toBe(m * factorNeto(nuevo));
    });
  });

  test("ida y vuelta completa: el contrato vuelve igual, campo por campo", () => {
    const nuevo = escenarioVersionNueva();
    const devuelta = leerDeFila(guardarEnFila(leerDeFila(guardarEnFila(nuevo))));
    expect(devuelta).toEqual(nuevo);
  });

  test("la versión compatible no puede validar ni aplicar la transición: solo lee", () => {
    expect(Object.keys(versionCompatible).sort()).toEqual(["etiqueta", "factor", "guardar", "neto", "pct"]);
    // Lo que sí hace es no mentir sobre lo que encuentra.
    const sinTransicion = { id: "c9", pais: "Peru" };
    expect(versionCompatible.pct(sinTransicion)).toBe(15);
    expect(estadoCompat(sinTransicion).validado).toBe(false);
  });

  test("el CÓDIGO ANTERIOR, sin el paso mínimo, SÍ diverge: es otra cosa", () => {
    const nuevo = escenarioVersionNueva();
    const leido = leerDeFila(guardarEnFila(nuevo));
    // La versión compatible: cero diferencia.
    expect(versionCompatible.factor(leido) - factorNeto(nuevo)).toBe(0);
    // El código anterior: el país corregido vuelve a mandar y el neto se mueve.
    expect(versionAnterior.factor(leido)).toBe(1);
    MONTOS_SINTETICOS.forEach((m) => {
      expect(versionAnterior.neto(leido, m)).not.toBe(m * factorNeto(nuevo));
    });
    expect(divergenciaRollback(leido)).toMatchObject({ diverge: true, pctEstaVersion: 20, pctCodigoAnterior: 0 });
  });

  test("con el destino leyendo el campo, la medición declara el rollback seguro", () => {
    const nuevo = escenarioVersionNueva();
    expect(estadoRecuperabilidad([nuevo]).rollbackSeguro).toBe(false);   // hoy
    setDestinoRollbackLeeElCampo(true);
    const r = estadoRecuperabilidad([nuevo]);
    expect(r.rollbackSeguro).toBe(true);
    expect(r.nota).toMatch(/volver atrás no mueve importes/);
  });
});

// ══════════════════════════════════════════════════════════════════
// 7 · Una sola leyenda para todos los sitios que rotulan la retención
// ══════════════════════════════════════════════════════════════════
import { leyendaRetencion, leyendaRetencionFilas, MARCA_RETENCION } from "./retencion";

describe("7 · la leyenda dice la tasa aplicada y su estado, siempre juntos", () => {
  test("sin transición: el porcentaje del país, marcado como no validado", () => {
    const l = leyendaRetencion({ id: "c1", pais: "Peru" });
    expect(l).toMatchObject({ pct: 15, tasa: "WHT 15%", marca: "por país", validado: false });
    expect(l.badge).toBe("WHT 15% · por país");
    expect(l.sufijo).toBe(" (WHT 15% · por país)");
    expect(l.frase).toMatch(/Se cobra el 85 % de lo facturado/);
    expect(l.frase).toMatch(/sin validar \(heredado del país\)/);
  });

  test("heredado y validado NO se rotulan igual, aunque el número coincida", () => {
    const h = transicionHeredada({ id: "c1", pais: "Peru" }, "2026-09-24");
    const v = validarRetencion(proponerRetencion(h, { pct: 15, respaldo: "CDI" }), admin, "2026-09-25");
    expect(leyendaRetencion(h).pct).toBe(leyendaRetencion(v).pct);
    expect(leyendaRetencion(h).badge).toBe("WHT 15% · heredado");
    expect(leyendaRetencion(v).badge).toBe("WHT 15% · validado");
  });

  test("con una tasa validada distinta, la leyenda NO dice 15", () => {
    const base = transicionHeredada({ id: "c1", pais: "Peru" }, "2026-09-24");
    const v = validarRetencion(proponerRetencion(base, { pct: 20, respaldo: "CDI" }), admin, "2026-09-25");
    const l = leyendaRetencion(v);
    expect(l.tasa).toBe("WHT 20%");
    expect(l.badge).toBe("WHT 20% · validado");
    expect(l.frase).toMatch(/Se cobra el 80 % de lo facturado/);
    expect(l.factor).toBe(0.8);
    expect(l.badge).not.toMatch(/15/);
  });

  test("una tasa validada en 0 no se confunde con la exención de Chile", () => {
    const base = transicionHeredada({ id: "c1", pais: "Peru" }, "2026-09-24");
    const v = validarRetencion(proponerRetencion(base, { pct: 0, respaldo: "CDI art. 12" }), admin, "2026-09-25");
    expect(leyendaRetencion(v).badge).toBe("Sin WHT · validado");
    expect(leyendaRetencion({ pais: "Chile" }).badge).toBe("Sin WHT · por país");
  });

  test("acepta un país suelto y una fila sellada, igual que el paso mínimo", () => {
    expect(leyendaRetencion("Peru").tasa).toBe("WHT 15%");
    expect(leyendaRetencion("Chile").tasa).toBe("Sin WHT");
    const ct = transicionHeredada({ id: "c1", pais: "Peru" }, "2026-09-24");
    expect(leyendaRetencion(sellarFila({ pais: "Chile" }, ct)).badge).toBe("WHT 15% · heredado");
  });

  test("las tres marcas están cubiertas y son cortas", () => {
    expect(Object.keys(MARCA_RETENCION).sort()).toEqual([HEREDADO, SIN_TRANSICION, VALIDADA].sort());
    Object.values(MARCA_RETENCION).forEach((m) => expect(m.length).toBeLessThanOrEqual(10));
  });

  test("la cabecera de tabla enumera las tasas que hay, no inventa una del grupo", () => {
    const ct = transicionHeredada({ id: "c1", pais: "Peru" }, "2026-09-24");
    const v = validarRetencion(proponerRetencion(ct, { pct: 20, respaldo: "CDI" }), admin, "2026-09-25");
    const l = leyendaRetencionFilas([sellarFila({}, { pais: "Chile" }), sellarFila({}, ct), sellarFila({}, v)]);
    expect(l.tasas).toEqual([0, 15, 20]);
    expect(l.frase).toMatch(/rigen 3 tasas: sin retención \/ 15 % \/ 20 %/);
    expect(l.frase).toMatch(/2 de 3 sin validar/);
    expect(l.frase).toMatch(/1 − retención del contrato/);
  });

  test("con todo validado la cabecera no arrastra el aviso, y sin filas no explota", () => {
    const ct = transicionHeredada({ id: "c1", pais: "Peru" }, "2026-09-24");
    const v = validarRetencion(proponerRetencion(ct, { pct: 20, respaldo: "CDI" }), admin, "2026-09-25");
    expect(leyendaRetencionFilas([sellarFila({}, v)]).frase).not.toMatch(/sin validar/);
    expect(leyendaRetencionFilas([]).frase).toMatch(/No hay filas que mostrar/);
    expect(leyendaRetencionFilas(null).tasas).toEqual([]);
  });
});
