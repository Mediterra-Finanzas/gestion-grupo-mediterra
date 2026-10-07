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
  activar, desactivar, puedeDesactivar, previsualizarDesactivacion,
  puedeCrearActivacion, puedeEditarTerminos,
  diferenciasConElSello, estadoActivacion, terminosVigentes,
  ACTIVADO, MODIFICACION_PENDIENTE, ACTIVACIONES_NUEVAS_HABILITADAS,
} from "./reajusteAplicado";
import { CONTRATO, ACTIVACION, DATOS_ACTIVACION, filas, porTemp, r2, TABLA_CANDIDATO } from "./fixturesReajuste";

// El mismo archivo corre en el candidato y en la version de recuperacion.
// Lo que depende de CREAR una activacion solo aplica donde esta permitido;
// todo lo demas —el sello, el bloqueo de edicion, la proteccion de filas—
// tiene que comportarse igual en las dos.
const sePuedeCrear = ACTIVACIONES_NUEVAS_HABILITADAS;
const dCrear = sePuedeCrear ? describe : describe.skip;
// Contrato ya activado, sin pasar por la accion: sirve en las dos versiones.
const ACTIVO = () => CONTRATO({ reajusteActivacion: ACTIVACION });
// activar() exige permiso, identidad canonica y confirmacion explicita.
const USUARIO = { nombre: "Prueba Sintetica", email: "prueba@invalid" };
const ACT_ARGS = Object.assign({}, DATOS_ACTIVACION, {
  usuarioActual: USUARIO, puedeEditar: true, confirmado: true,
});

// ══════════════════════════════════════════════════════════════════
dCrear("1 · activar sella los términos", () => {
  test("la acción deja el sello con porcentaje, fecha y regla", () => {
    const res = activar(CONTRATO(), ACT_ARGS);
    expect(res.ok).toBe(true);
    expect(res.contrato.reajusteActivacion.sello).toEqual({
      pct: 2, fechaReferencia: "2026-07-01", reglaFecha: "inicioPeriodoServicio",
    });
  });

  test("no activa si el antecedente no está confirmado", () => {
    const sinConfirmar = CONTRATO({ reajuste: { tipo: "porcentaje", pct: 2, desde: "2026-07-01", referencia: "x" } });
    const res = activar(sinConfirmar, ACT_ARGS);
    expect(res.ok).toBe(false);
    expect(res.motivo).toMatch(/no esta confirmado/);
  });

  test("activar no muta el contrato original", () => {
    const ct = CONTRATO();
    const copia = JSON.parse(JSON.stringify(ct));
    activar(ct, ACT_ARGS);
    expect(ct).toEqual(copia);
  });

  test("el contrato activado calcula la tabla conocida", () => {
    const f = porTemp(filas(activar(CONTRATO(), ACT_ARGS).contrato));
    Object.keys(TABLA_CANDIDATO).forEach((t) => expect(r2(f[t].montoFact)).toBe(r2(TABLA_CANDIDATO[t])));
  });
});

// ══════════════════════════════════════════════════════════════════
describe("2 · editar los términos NO recalcula", () => {
  const activo = ACTIVO();

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
    const p = puedeEditarTerminos(ACTIVO());
    expect(p.puede).toBe(false);
    expect(p.campos).toEqual(["porcentaje", "fecha de referencia", "regla de fecha"]);
    expect(p.motivo).toMatch(/modificacion economica/);
    expect(p.motivo).toMatch(/no esta habilitada en este paquete/);
    // Y no propone desactivar como via para eludir el sello.
    expect(p.motivo).toMatch(/operacion economica independiente/);
  });

  test("sin activación, se editan con normalidad", () => {
    expect(puedeEditarTerminos(CONTRATO()).puede).toBe(true);
  });

  test("con una modificación ya pendiente, siguen bloqueados", () => {
    const c = JSON.parse(JSON.stringify(ACTIVO()));
    c.reajuste.pct = 7;
    expect(puedeEditarTerminos(c).puede).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("4 · las filas con factura o pago siguen protegidas", () => {
  const activo = ACTIVO();

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
describe("5 · desactivar exige permiso, vista previa y confirmacion", () => {
  const activo = ACTIVO();
  const FILAS = [{ temporada: "2026/2027", montoFact: 125910 }, { temporada: "2027/2028", montoFact: 125910 }];

  test("sin permiso de edicion, bloqueada", () => {
    expect(puedeDesactivar(activo, { puedeEditar: false }).puede).toBe(false);
    expect(desactivar(activo, { motivo: "x", confirmado: true, puedeEditar: false }).ok).toBe(false);
  });

  test("exige un motivo", () => {
    const r = desactivar(activo, { motivo: "", confirmado: true });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/hace falta un motivo/);
  });

  test("exige confirmacion explicita, no alcanza el motivo", () => {
    const r = desactivar(activo, { motivo: "Se anulo el respaldo" });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/confirmacion explicita/);
    expect(r.contrato.reajusteActivacion.activado).toBe(true);   // no apago nada
  });

  test("la vista previa dice fila por fila cuanto baja", () => {
    const pd = previsualizarDesactivacion(activo, FILAS, {});
    expect(pd.filasQueBajan).toBe(1);                 // la primera no cumple periodo
    const f2 = pd.detalle.find((d) => d.temporada === "2027/2028");
    expect(r2(f2.conReajuste)).toBeCloseTo(128428.2, 2);
    expect(r2(f2.sinReajuste)).toBe(125910);
    expect(r2(f2.diferencia)).toBeCloseTo(-2518.2, 2);
    expect(r2(pd.diferencia)).toBeCloseTo(-2518.2, 2);
  });

  test("con permiso, motivo y confirmacion: deja rastro y vuelve a la base", () => {
    const r = desactivar(activo, { motivo: "Se anulo el respaldo del primer pago", usuarioActual: USUARIO, confirmado: true, impacto: -2518.2 });
    expect(r.ok).toBe(true);
    expect(r.contrato.reajusteActivacion.desactivadoImpacto).toBeCloseTo(-2518.2, 2);
    expect(r.contrato.reajusteActivacion.activado).toBe(false);
    expect(r.contrato.reajusteActivacion.desactivadoMotivo).toMatch(/respaldo/);
    expect(r.contrato.reajusteActivacion.desactivadoPor).toBe("Prueba Sintetica");
    expect(r.contrato.reajusteActivacion.fechaReferencia).toBe("2026-07-01");   // no se pierde
    const f = porTemp(filas(r.contrato));
    expect(r2(f["2027/2028"].montoFact)).toBe(125910);
  });

  test("no se puede desactivar lo que no está activo", () => {
    expect(desactivar(CONTRATO(), { motivo: "x", confirmado: true }).ok).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
dCrear("6 · en el candidato se pueden crear activaciones", () => {
  test("la bandera está en true y la acción lo permite", () => {
    expect(ACTIVACIONES_NUEVAS_HABILITADAS).toBe(true);
    expect(puedeCrearActivacion().puede).toBe(true);
    expect(activar(CONTRATO(), ACT_ARGS).ok).toBe(true);
  });
});
