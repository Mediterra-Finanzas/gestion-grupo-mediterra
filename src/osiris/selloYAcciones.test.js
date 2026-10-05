/* eslint-disable */
// Entrega B · El sello de los términos económicos y las acciones.
//
// Lo que se fija acá:
//   · editar porcentaje, fecha de referencia o regla de un reajuste ACTIVO no
//     recalcula nada: manda lo sellado al activar;
//   · esas modificaciones quedan bloqueadas, porque el flujo de confirmación
//     económica no entra en este paquete;
//   · las filas con factura o pago siguen protegidas en todos los casos;
//   · activar y desactivar son acciones con sus propias condiciones.

import { derivarRoyaltyComercialDesdeContratos } from "../OsirisModule";
import {
  activar, desactivar, puedeCrearActivacion, puedeEditarTerminos,
  diferenciasConElSello, estadoActivacion, terminosVigentes,
  ACTIVADO, MODIFICACION_PENDIENTE, ACTIVACIONES_NUEVAS_HABILITADAS,
} from "./reajusteAplicado";
import { CONTRATO, DATOS_ACTIVACION, filas, porTemp, r2, TABLA_CANDIDATO } from "./fixturesReajuste";

// ══════════════════════════════════════════════════════════════════
describe("1 · activar sella los términos", () => {
  test("la acción deja el sello con porcentaje, fecha y regla", () => {
    const res = activar(CONTRATO(), DATOS_ACTIVACION);
    expect(res.ok).toBe(true);
    expect(res.contrato.reajusteActivacion.sello).toEqual({
      pct: 2, fechaReferencia: "2026-07-01", reglaFecha: "inicioPeriodoServicio",
    });
  });

  test("no activa si el antecedente no está confirmado", () => {
    const sinConfirmar = CONTRATO({ reajuste: { tipo: "porcentaje", pct: 2, desde: "2026-07-01", referencia: "x" } });
    const res = activar(sinConfirmar, DATOS_ACTIVACION);
    expect(res.ok).toBe(false);
    expect(res.motivo).toMatch(/no esta confirmado/);
  });

  test("activar no muta el contrato original", () => {
    const ct = CONTRATO();
    const copia = JSON.parse(JSON.stringify(ct));
    activar(ct, DATOS_ACTIVACION);
    expect(ct).toEqual(copia);
  });

  test("el contrato activado calcula la tabla conocida", () => {
    const f = porTemp(filas(activar(CONTRATO(), DATOS_ACTIVACION).contrato));
    Object.keys(TABLA_CANDIDATO).forEach((t) => expect(r2(f[t].montoFact)).toBe(r2(TABLA_CANDIDATO[t])));
  });
});

// ══════════════════════════════════════════════════════════════════
describe("2 · editar los términos NO recalcula", () => {
  const activo = activar(CONTRATO(), DATOS_ACTIVACION).contrato;

  const editado = (cambio) => {
    const c = JSON.parse(JSON.stringify(activo));
    if (cambio.pct !== undefined) c.reajuste.pct = cambio.pct;
    if (cambio.fechaReferencia) c.reajusteActivacion.fechaReferencia = cambio.fechaReferencia;
    if (cambio.reglaFecha) c.reajusteActivacion.reglaFecha = cambio.reglaFecha;
    return c;
  };

  test("subir el porcentaje no mueve un peso", () => {
    const f = porTemp(filas(editado({ pct: 10 })));
    Object.keys(TABLA_CANDIDATO).forEach((t) => expect(r2(f[t].montoFact)).toBe(r2(TABLA_CANDIDATO[t])));
  });

  test("cambiar la fecha de referencia tampoco", () => {
    const f = porTemp(filas(editado({ fechaReferencia: "2024-01-01" })));
    Object.keys(TABLA_CANDIDATO).forEach((t) => expect(r2(f[t].montoFact)).toBe(r2(TABLA_CANDIDATO[t])));
  });

  test("cambiar la regla de fecha tampoco", () => {
    const f = porTemp(filas(editado({ reglaFecha: "emision" })));
    Object.keys(TABLA_CANDIDATO).forEach((t) => expect(r2(f[t].montoFact)).toBe(r2(TABLA_CANDIDATO[t])));
  });

  test("el estado pasa a modificación pendiente y nombra los campos", () => {
    const e = estadoActivacion(editado({ pct: 10, fechaReferencia: "2024-01-01" }));
    expect(e.estado).toBe(MODIFICACION_PENDIENTE);
    expect(e.activo).toBe(true);                      // sigue aplicando lo sellado
    expect(e.pct).toBe(2);                            // el sellado, no el editado
    expect(e.motivo).toMatch(/Los importes NO cambiaron/);
    expect(e.diferencias.map((d) => d.campo).sort()).toEqual(["fecha de referencia", "porcentaje"]);
  });

  test("las diferencias se listan con lo sellado y lo actual", () => {
    const d = diferenciasConElSello(editado({ pct: 10 }));
    expect(d.hay).toBe(true);
    expect(d.campos[0]).toEqual({ campo: "porcentaje", sellado: 2, actual: 10 });
  });

  test("sin edición, no hay diferencia y el estado es activado", () => {
    expect(diferenciasConElSello(activo).hay).toBe(false);
    expect(estadoActivacion(activo).estado).toBe(ACTIVADO);
    expect(terminosVigentes(activo)).toEqual(activo.reajusteActivacion.sello);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("3 · esas modificaciones quedan bloqueadas", () => {
  test("con el reajuste activo no se pueden editar los tres campos", () => {
    const p = puedeEditarTerminos(activar(CONTRATO(), DATOS_ACTIVACION).contrato);
    expect(p.puede).toBe(false);
    expect(p.campos).toEqual(["porcentaje", "fecha de referencia", "regla de fecha"]);
    expect(p.motivo).toMatch(/modificacion economica/);
    expect(p.motivo).toMatch(/no esta en este paquete/);
  });

  test("sin activación, se editan con normalidad", () => {
    expect(puedeEditarTerminos(CONTRATO()).puede).toBe(true);
  });

  test("con una modificación ya pendiente, siguen bloqueados", () => {
    const c = JSON.parse(JSON.stringify(activar(CONTRATO(), DATOS_ACTIVACION).contrato));
    c.reajuste.pct = 7;
    expect(puedeEditarTerminos(c).puede).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("4 · las filas con factura o pago siguen protegidas", () => {
  const activo = activar(CONTRATO(), DATOS_ACTIVACION).contrato;

  test("protegida con la activación limpia", () => {
    const ct = Object.assign({}, activo, { rcPagos: { "2027/2028": { nFact: "123", pagado: true } } });
    const f = porTemp(filas(ct));
    expect(r2(f["2027/2028"].montoFact)).toBe(125910);
    expect(r2(f["2028/2029"].montoFact)).toBe(r2(TABLA_CANDIDATO["2028/2029"]));
  });

  test("protegida también con una modificación pendiente", () => {
    const c = JSON.parse(JSON.stringify(activo));
    c.reajuste.pct = 10;
    c.rcPagos = { "2027/2028": { nFact: "123", pagado: true } };
    const f = porTemp(filas(c));
    expect(r2(f["2027/2028"].montoFact)).toBe(125910);
    // Y las demás siguen con lo sellado, no con el 10 %.
    expect(r2(f["2028/2029"].montoFact)).toBe(r2(TABLA_CANDIDATO["2028/2029"]));
  });
});

// ══════════════════════════════════════════════════════════════════
describe("5 · desactivar es una acción con condiciones", () => {
  const activo = activar(CONTRATO(), DATOS_ACTIVACION).contrato;

  test("exige un motivo", () => {
    const r = desactivar(activo, "", "prueba");
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/hace falta un motivo/);
  });

  test("con motivo, deja rastro y devuelve los importes a la base", () => {
    const r = desactivar(activo, "Se anulo el respaldo del primer pago", "prueba");
    expect(r.ok).toBe(true);
    expect(r.contrato.reajusteActivacion.activado).toBe(false);
    expect(r.contrato.reajusteActivacion.desactivadoMotivo).toMatch(/respaldo/);
    expect(r.contrato.reajusteActivacion.desactivadoPor).toBe("prueba");
    expect(r.contrato.reajusteActivacion.fechaReferencia).toBe("2026-07-01");   // no se pierde
    const f = porTemp(filas(r.contrato));
    expect(r2(f["2027/2028"].montoFact)).toBe(125910);
  });

  test("no se puede desactivar lo que no está activo", () => {
    expect(desactivar(CONTRATO(), "x", "prueba").ok).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("6 · en el candidato se pueden crear activaciones", () => {
  test("la bandera está en true y la acción lo permite", () => {
    expect(ACTIVACIONES_NUEVAS_HABILITADAS).toBe(true);
    expect(puedeCrearActivacion().puede).toBe(true);
    expect(activar(CONTRATO(), DATOS_ACTIVACION).ok).toBe(true);
  });
});
