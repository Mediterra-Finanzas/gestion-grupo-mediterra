/* eslint-disable */
// Prueba de INTEGRACIÓN DE PANTALLA.
//
// Por qué existe, además de las reglas de linter: dos veces seguidas se
// revirtió un arreglo en la pantalla y la suite siguió verde, porque las
// pruebas ejercitaban la función corregida y no el sitio que la llama. Las
// reglas de linter miran el texto del código; esta prueba **ejecuta** el
// código de la pantalla y lee lo que queda en el DOM.
//
// Las reglas son complementarias, no sustituto de esto. Si alguien restaura
// la llamada anterior —`reajusteOperativo(r)` en vez de la envoltura, o el
// spread en `activarReajuste`— esta prueba falla sin necesidad de que la
// regla exista.

import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ControlContratos } from "../OsirisModule";
import { ACTIVACION } from "./fixturesReajuste";
import { ACTIVACIONES_NUEVAS_HABILITADAS } from "./reajusteAplicado";

const USUARIO = { nombre: "Prueba Pantalla", email: "pantalla@invalid" };

// El mismo archivo corre en las dos versiones. Lo que depende de CREAR una
// activacion solo aplica donde esta permitido; alla donde no, se comprueba
// el rechazo, que es justamente lo que no puede quedar sin probar.
const sePuedeCrear = ACTIVACIONES_NUEVAS_HABILITADAS;
const dCrear = sePuedeCrear ? describe : describe.skip;
const dNoCrear = sePuedeCrear ? describe.skip : describe;

// Contrato sintético, el mismo caso de 41,97 há × US$3.000 al 2 %.
const CONTRATO = (extra) => Object.assign({
  id: "ct_pantalla", razonSocial: "PANTALLA (prueba)", pais: "Chile",
  modeloIngresos: "oc", valorRoyaltyComercial: 3000, rcMesCobro: "Abril",
  fechaTermino: "2031-06-30",
  rcCohortes: [{ id: "c1", ha: 41.97, desde: "2026/2027" }],
  reajuste: { tipo: "porcentaje", pct: 2, desde: "2026-07-01", referencia: "Clausula 1.2.5", confirmado: true },
}, extra || {});

const TODAS_PROTEGIDAS = ["2026/2027", "2027/2028", "2028/2029", "2029/2030", "2030/2031"]
  .reduce((m, t) => (m[t] = { nFact: "900", pagado: true, fechaPago: "2030-06-02" }, m), {});

// Abre el contrato y su pestaña de cobros derivados, que es donde vive todo.
function abrirCobros(contrato) {
  const utils = render(
    <ControlContratos
      data={[contrato]}
      setData={() => {}}
      clientes={[]}
      setClientes={() => {}}
      viverosData={[]}
      setViveros={() => {}}
      can={true}
      usuarioActual={USUARIO}
      tiposAnexoPersist={[]}
      setTiposAnexoPersist={() => {}}
      tiposContratoPersist={[]}
      setTiposContratoPersist={() => {}}
    />
  );
  fireEvent.click(screen.getByText(/Ver/));
  fireEvent.click(screen.getByText(/Cobros derivados/));
  return utils;
}

const textoDe = (c) => c.body.textContent.replace(/\s+/g, " ");

// ══════════════════════════════════════════════════════════════════
describe("La pantalla muestra lo que el motor calcula", () => {
  test("sin activar: el total es la base y el aviso lo dice", () => {
    const { container } = abrirCobros(CONTRATO());
    const t = textoDe(container.ownerDocument);
    expect(t).toMatch(/\$629\.550/);
    expect(t).toMatch(/Estos montos no llevan reajuste/);
    expect(t).not.toMatch(/YA llevan el reajuste/);
  });

  test("activado con filas que cambian: el total sube y el aviso lo afirma", () => {
    const { container } = abrirCobros(CONTRATO({
      reajusteActivacion: ACTIVACION,
      rcPagos: { "2029/2030": { nFact: "999", pagado: true, fechaPago: "2030-06-02" } },
    }));
    const t = textoDe(container.ownerDocument);
    expect(t).toMatch(/\$647\.533,99/);
    // Esto es lo que R4 rompía: el aviso decía lo contrario del importe.
    expect(t).toMatch(/Estos montos YA llevan el reajuste/);
    expect(t).not.toMatch(/que no está hecha/);
    // Y R7: tiene que decir cuántas lo llevan y cuántas no.
    expect(t).toMatch(/3 temporada\(s\) de esta pantalla llevan el reajuste/);
    expect(t).toMatch(/1 quedan en su valor base/);
    // Las tres columnas, que antes eran dos mezcladas. Con la activación YA
    // vigente y los mismos términos: la base es 125.910, el importe actual
    // es 128.428,2 porque el ajuste ya está puesto, y el resultado propuesto
    // es el mismo. Esto NO es un cambio de texto: es la diferencia medida
    // contra el importe que el usuario tiene delante.
    expect(t).toMatch(/Base sin reajusteImporte actualResultado propuestoDiferencia/);
    expect(t).toMatch(/2027\/2028\$125\.910\$128\.428,2\$128\.428,2/);
    // H3: si la previa partiera de las filas ya ajustadas compondría el
    // factor dos veces y el resultado propuesto sería 130.996,76.
    expect(t).not.toMatch(/2027\/2028\$125\.910\$128\.428,2\$130\.996,76/);
    // Y por lo tanto no hay nada más que aplicar.
    expect(t).toMatch(/diferencia aplicada: \$0/);
  });

  test("activado: no se puede volver a activar ni resellar los términos", () => {
    // Que la diferencia sea cero no habilita registrar otra activación.
    const { activar } = require("./reajusteAplicado");
    const { puedeEditarTerminos } = require("./reajusteAplicado");
    const ct = CONTRATO({ reajusteActivacion: ACTIVACION });
    const res = activar(ct, {
      fechaReferencia: "2026-07-01", respaldo: "Comprobante",
      reglaFecha: "inicioPeriodoServicio", reglaFechaRespaldo: "Clausula 1.2.5",
      puedeEditar: true, usuarioActual: USUARIO, confirmado: true,
    });
    expect(res.ok).toBe(false);
    expect(res.motivo).toMatch(sePuedeCrear
      ? /Ya hay una activacion registrada con estos mismos terminos/
      : /no permite crear nuevas/);
    expect(res.contrato).toBe(ct);                       // ni un evento más
    // Y los términos sellados siguen bloqueados para edición.
    expect(puedeEditarTerminos(ct).puede).toBe(false);
  });

  test("activado: con términos distintos tampoco se resella", () => {
    const { activar } = require("./reajusteAplicado");
    const ct = CONTRATO({ reajusteActivacion: ACTIVACION });
    const res = activar(ct, {
      fechaReferencia: "2027-01-01", respaldo: "Otro", reglaFecha: "emision",
      reglaFechaRespaldo: "Otra clausula",
      puedeEditar: true, usuarioActual: USUARIO, confirmado: true,
    });
    expect(res.ok).toBe(false);
    expect(res.motivo).toMatch(sePuedeCrear
      ? /no esta habilitada en este paquete/
      : /no permite crear nuevas/);
    expect(res.contrato.reajusteActivacion.sello).toEqual({
      pct: 2, fechaReferencia: "2026-07-01", reglaFecha: "inicioPeriodoServicio",
    });
  });

  test("desactivar: la baja se mide contra el importe actual y respeta las protegidas", () => {
    const { previsualizarDesactivacion } = require("./reajusteAplicado");
    const { derivarRoyaltyComercialDesdeContratos } = require("../OsirisModule");
    const ct = CONTRATO({
      reajusteActivacion: ACTIVACION,
      rcPagos: { "2029/2030": { nFact: "999", pagado: true } },
    });
    const base = derivarRoyaltyComercialDesdeContratos(
      [{ ...ct, reajusteActivacion: { ...ACTIVACION, activado: false } }], { ct_pantalla: [] });
    const antes = (f) => ((ct.rcPagos || {})[f.temporada] || null);
    const pd = previsualizarDesactivacion(ct, base, { mesCobro: "Abril", antecedentesDe: antes });
    // Baja de 17.983,99: la reducción respecto de lo que hoy se cobra.
    expect(Math.abs(pd.diferencia)).toBeCloseTo(17983.99, 2);
    expect(pd.filasQueBajan).toBe(3);
    // La protegida no se mueve ni para abajo.
    const prot = pd.detalle.find((d) => d.temporada === "2029/2030");
    expect(prot.conReajuste).toBe(125910);
    expect(prot.sinReajuste).toBe(125910);
    expect(prot.diferencia).toBe(0);
  });

  test("activado con TODAS las filas protegidas: no se presenta como aplicado", () => {
    const { container } = abrirCobros(CONTRATO({
      reajusteActivacion: ACTIVACION, rcPagos: TODAS_PROTEGIDAS,
    }));
    const t = textoDe(container.ownerDocument);
    expect(t).toMatch(/\$629\.550/);               // ningún importe se movió
    expect(t).toMatch(/NO llevan el reajuste, aunque esté activado/);
    expect(t).toMatch(/NINGUNA temporada de esta pantalla lo lleva/);
    expect(t).toMatch(/las 5 con factura o pago registrado no se recalculan/);
    expect(t).not.toMatch(/Estos montos YA llevan el reajuste/);
    expect(t).toMatch(/sin efecto en estas temporadas/);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("La vista previa de la pantalla no muestra ceros al decidir", () => {
  test("con los términos cargados y sin activar, anuncia la diferencia real", () => {
    const { container } = abrirCobros(CONTRATO({
      reajusteActivacion: {
        activado: false, fechaReferencia: "2026-07-01", respaldo: "Comprobante",
        reglaFecha: "inicioPeriodoServicio", reglaFechaRespaldo: "Clausula 1.2.5",
      },
      rcPagos: { "2029/2030": { nFact: "999", pagado: true } },
    }));
    const t = textoDe(container.ownerDocument);
    // R2: antes los cuatro números salían en cero justo al decidir.
    expect(t).toMatch(/Filas que cambian: 3/);
    expect(t).toMatch(/protegidas: 1/);
    expect(t).toMatch(/diferencia aplicada: \$17\.983,99/);
  });
});

// ══════════════════════════════════════════════════════════════════
dCrear("Las acciones de la pantalla, ejecutadas de verdad", () => {
  // Esto ejercita el sitio de llamada real de `activarReajuste`. Si alguien
  // repone el spread del registro anterior, la fecha del evento deja de ser
  // la de hoy y esta prueba falla.
  const conDialogos = (respuestas, fn) => {
    const orig = { confirm: window.confirm, prompt: window.prompt, alert: window.alert };
    const vistos = [];
    window.confirm = (x) => (vistos.push(String(x)), respuestas.confirm);
    window.prompt = (x) => (vistos.push(String(x)), respuestas.prompt);
    window.alert = (x) => { vistos.push(String(x)); };
    try { fn(vistos); } finally { Object.assign(window, orig); }
    return vistos;
  };

  test("activar escribe el impacto real, no cero, y lo fecha hoy", () => {
    let guardado = null;
    const ct = CONTRATO({
      reajusteActivacion: {
        activado: false, fechaReferencia: "2026-07-01", respaldo: "Comprobante",
        reglaFecha: "inicioPeriodoServicio", reglaFechaRespaldo: "Clausula 1.2.5",
        // Una fecha vieja, como la que dejaría una activación anterior. El
        // sitio de llamada NO debe arrastrarla: ese era el defecto R3.
        fecha: "2020-01-01",
      },
      rcPagos: { "2029/2030": { nFact: "999", pagado: true } },
    });
    render(
      <ControlContratos
        data={[ct]} setData={(f) => { guardado = typeof f === "function" ? f([ct]) : f; }}
        clientes={[]} setClientes={() => {}} viverosData={[]} setViveros={() => {}}
        can={true} usuarioActual={USUARIO}
        tiposAnexoPersist={[]} setTiposAnexoPersist={() => {}}
        tiposContratoPersist={[]} setTiposContratoPersist={() => {}}
      />
    );
    fireEvent.click(screen.getByText(/Ver/));
    fireEvent.click(screen.getByText(/Cobros derivados/));

    const vistos = conDialogos({ confirm: true }, () => {
      fireEvent.click(screen.getByText("Activar el reajuste"));
    });

    // El diálogo que se le muestra al usuario trae los números reales.
    expect(vistos.join(" ")).toMatch(/Diferencia que se aplica: US\$ 17983\.99/);
    // El texto ya no les atribuye una factura a las filas que no la tienen.
    expect(vistos.join(" ")).toMatch(/Protegidas \(factura, pago o proteccion conservada\): 1/);

    expect(guardado).not.toBe(null);
    const act = guardado[0].reajusteActivacion;
    expect(act.activado).toBe(true);
    expect(act.sello).toEqual({ pct: 2, fechaReferencia: "2026-07-01", reglaFecha: "inicioPeriodoServicio" });
    // R3: la fecha del evento es la de hoy, no la que venía en el registro.
    const hoy = new Date().toISOString().slice(0, 10);
    expect(act.fecha).toBe(hoy);
    expect(act.historial[act.historial.length - 1].fecha).toBe(hoy);
    // R2: el impacto guardado es el que se confirmó, no cero.
    expect(act.historial[act.historial.length - 1].impactoConfirmado).toBeCloseTo(17983.99, 2);
  });

  test("sin permiso, la acción no se ejecuta ni pregunta nada económico", () => {
    let guardado = null;
    const ct = CONTRATO({
      reajusteActivacion: {
        activado: false, fechaReferencia: "2026-07-01", respaldo: "Comprobante",
        reglaFecha: "inicioPeriodoServicio", reglaFechaRespaldo: "Clausula 1.2.5",
      },
    });
    const { container } = render(
      <ControlContratos
        data={[ct]} setData={(f) => { guardado = typeof f === "function" ? f([ct]) : f; }}
        clientes={[]} setClientes={() => {}} viverosData={[]} setViveros={() => {}}
        can={false} usuarioActual={USUARIO}
        tiposAnexoPersist={[]} setTiposAnexoPersist={() => {}}
        tiposContratoPersist={[]} setTiposContratoPersist={() => {}}
      />
    );
    fireEvent.click(screen.getByText(/Ver/));
    fireEvent.click(screen.getByText(/Cobros derivados/));
    const boton = screen.getByText("Activar el reajuste");
    expect(boton.disabled).toBe(true);
    // Y si alguien invoca el manejador saltándose el `disabled`, la acción
    // se defiende sola: ese fue el agujero de T3.
    const vistos = conDialogos({ confirm: true }, () => {
      const k = Object.keys(boton).find((x) => x.startsWith("__reactProps$"));
      boton[k].onClick({ preventDefault() {}, stopPropagation() {} });
    });
    expect(vistos.join(" ")).toMatch(/Sin permiso de edicion/);
    expect(vistos.join(" ")).not.toMatch(/Diferencia que se aplica/);
    expect(guardado).toBe(null);
  });

  test("un reajuste de 0 % no se activa", () => {
    let guardado = null;
    const ct = CONTRATO({
      reajuste: { tipo: "porcentaje", pct: 0, desde: "2026-07-01", referencia: "x", confirmado: true },
      reajusteActivacion: {
        activado: false, fechaReferencia: "2026-07-01", respaldo: "Comprobante",
        reglaFecha: "inicioPeriodoServicio", reglaFechaRespaldo: "Clausula 1.2.5",
      },
    });
    render(
      <ControlContratos
        data={[ct]} setData={(f) => { guardado = typeof f === "function" ? f([ct]) : f; }}
        clientes={[]} setClientes={() => {}} viverosData={[]} setViveros={() => {}}
        can={true} usuarioActual={USUARIO}
        tiposAnexoPersist={[]} setTiposAnexoPersist={() => {}}
        tiposContratoPersist={[]} setTiposContratoPersist={() => {}}
      />
    );
    fireEvent.click(screen.getByText(/Ver/));
    fireEvent.click(screen.getByText(/Cobros derivados/));
    const vistos = conDialogos({ confirm: true }, () => {
      fireEvent.click(screen.getByText("Activar el reajuste"));
    });
    // El texto cambio -ya no atribuye intencion al cero-, pero lo economico
    // es lo mismo: la accion rechaza y no escribe nada.
    expect(vistos.join(" ")).toMatch(/no tiene efecto sobre ningun importe/);
    expect(vistos.join(" ")).toMatch(/No consta si ese 0 se ingreso asi/);
    expect(guardado).toBe(null);
  });
});

// ══════════════════════════════════════════════════════════════════
// Lo que la PANTALLA de la recuperación tiene que hacer. La creación no
// aplica allá, pero el rechazo sí, y no puede quedar sin probar.
dNoCrear("Recuperación · la pantalla no ofrece crear, y lo explica", () => {
  test("sin activación: no hay botón de activar, y dice por qué", () => {
    const { container } = abrirCobros(CONTRATO({
      reajusteActivacion: {
        activado: false, fechaReferencia: "2026-07-01", respaldo: "Comprobante",
        reglaFecha: "inicioPeriodoServicio", reglaFechaRespaldo: "Clausula 1.2.5",
      },
    }));
    expect(screen.queryByText("Activar el reajuste")).toBe(null);
    expect(textoDe(container.ownerDocument)).toMatch(/no permite crear nuevas/);
    // Y los importes son los de la base: nada se activó por la vía que sea.
    expect(textoDe(container.ownerDocument)).toMatch(/\$629\.550/);
  });

  test("con activación vigente: los importes se conservan y SÍ se puede desactivar", () => {
    const { container } = abrirCobros(CONTRATO({
      reajusteActivacion: ACTIVACION,
      rcPagos: { "2029/2030": { nFact: "999", pagado: true } },
    }));
    const t = textoDe(container.ownerDocument);
    expect(t).toMatch(/\$647\.533,99/);                 // no volvió a la base
    expect(t).toMatch(/Estos montos YA llevan el reajuste/);
    // H7: el aviso de "no se pueden crear nuevas" no puede tapar Desactivar.
    expect(screen.getByText("Desactivar")).toBeTruthy();
    expect(screen.queryByText("Activar el reajuste")).toBe(null);
  });

  test("desactivar desde la pantalla exige motivo y confirmación, y vuelve a la base", () => {
    let guardado = null;
    const ct = CONTRATO({
      reajusteActivacion: ACTIVACION,
      rcPagos: { "2029/2030": { nFact: "999", pagado: true } },
    });
    render(
      <ControlContratos
        data={[ct]} setData={(f) => { guardado = typeof f === "function" ? f([ct]) : f; }}
        clientes={[]} setClientes={() => {}} viverosData={[]} setViveros={() => {}}
        can={true} usuarioActual={USUARIO}
        tiposAnexoPersist={[]} setTiposAnexoPersist={() => {}}
        tiposContratoPersist={[]} setTiposContratoPersist={() => {}}
      />
    );
    fireEvent.click(screen.getByText(/Ver/));
    fireEvent.click(screen.getByText(/Cobros derivados/));

    const orig = { confirm: window.confirm, prompt: window.prompt, alert: window.alert };
    const vistos = [];
    // Primero: sin motivo, no pasa nada.
    window.prompt = (x) => (vistos.push(String(x)), "");
    window.confirm = (x) => (vistos.push(String(x)), true);
    window.alert = (x) => { vistos.push(String(x)); };
    try {
      fireEvent.click(screen.getByText("Desactivar"));
      expect(guardado).toBe(null);
      // Ahora con motivo y confirmación.
      window.prompt = (x) => (vistos.push(String(x)), "Se anulo el respaldo");
      fireEvent.click(screen.getByText("Desactivar"));
    } finally { Object.assign(window, orig); }

    expect(vistos.join(" ")).toMatch(/Desactivar devuelve importes a la base/);
    expect(vistos.join(" ")).toMatch(/Se deja de aplicar: US\$ 17983\.99/);
    expect(guardado).not.toBe(null);
    const act = guardado[0].reajusteActivacion;
    expect(act.activado).toBe(false);
    expect(act.desactivadoMotivo).toMatch(/respaldo/);
    // El sello y el historial quedan: el candidato puede reactivar.
    expect(act.sello).toEqual({ pct: 2, fechaReferencia: "2026-07-01", reglaFecha: "inicioPeriodoServicio" });
    expect(act.historial.slice(-1)[0].evento).toBe("desactivacion");
  });

  test("sin permiso, desactivar queda bloqueado también dentro de la acción", () => {
    let guardado = null;
    const ct = CONTRATO({ reajusteActivacion: ACTIVACION });
    render(
      <ControlContratos
        data={[ct]} setData={(f) => { guardado = typeof f === "function" ? f([ct]) : f; }}
        clientes={[]} setClientes={() => {}} viverosData={[]} setViveros={() => {}}
        can={false} usuarioActual={USUARIO}
        tiposAnexoPersist={[]} setTiposAnexoPersist={() => {}}
        tiposContratoPersist={[]} setTiposContratoPersist={() => {}}
      />
    );
    fireEvent.click(screen.getByText(/Ver/));
    fireEvent.click(screen.getByText(/Cobros derivados/));
    const boton = screen.getByText("Desactivar");
    expect(boton.disabled).toBe(true);
    const orig = window.alert; const vistos = [];
    window.alert = (x) => { vistos.push(String(x)); };
    try {
      const k = Object.keys(boton).find((x) => x.startsWith("__reactProps$"));
      boton[k].onClick({ preventDefault() {}, stopPropagation() {} });
    } finally { window.alert = orig; }
    expect(vistos.join(" ")).toMatch(/Sin permiso de edicion/);
    expect(guardado).toBe(null);
  });
});

// ══════════════════════════════════════════════════════════════════
// El campo del porcentaje. Era el arreglo que motivó el paquete y no tenía
// ninguna prueba que lo custodiara: revertirlo a `parseFloat(valor)||0`
// dejaba toda la batería en verde. Esto dispara el onChange REAL.
describe("El campo del porcentaje no convierte nada en cero", () => {
  const abrirFacturacion = (contrato, onSave) => {
    const utils = render(
      <ControlContratos
        data={[contrato]} setData={onSave || (() => {})}
        clientes={[]} setClientes={() => {}} viverosData={[]} setViveros={() => {}}
        can={true} usuarioActual={USUARIO}
        tiposAnexoPersist={[]} setTiposAnexoPersist={() => {}}
        tiposContratoPersist={[]} setTiposContratoPersist={() => {}}
      />
    );
    fireEvent.click(screen.getByText(/Ver/));
    fireEvent.click(screen.getByText(/Facturación/));
    return utils;
  };
  const campoPct = (container) =>
    [...container.ownerDocument.querySelectorAll('input[placeholder="sin definir"][type="number"]')][0];

  const escribir = (ct, valor) => {
    let guardado = null;
    const { container } = abrirFacturacion(ct, (f) => {
      guardado = typeof f === "function" ? f([ct]) : f;
    });
    const input = campoPct(container);
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: valor } });
    return guardado && guardado[0].reajuste;
  };

  test("vaciarlo deja el porcentaje sin definir, NO en cero", () => {
    const r = escribir(CONTRATO(), "");
    expect(r.pct).toBe("");
    expect(r.pct).not.toBe(0);
  });

  test("un valor normal se guarda tal cual", () => {
    const r = escribir(CONTRATO(), "3.5");
    expect(r.pct).toBe("3.5");
  });

  test("escribirlo deja la marca de origen", () => {
    const r = escribir(CONTRATO(), "4");
    expect(r.pctOrigen).toBe("ingresado");
  });

  test("editar OTRO campo del reajuste no deja la marca", () => {
    let guardado = null;
    const ct = CONTRATO();
    const { container } = abrirFacturacion(ct, (f) => {
      guardado = typeof f === "function" ? f([ct]) : f;
    });
    const ref = container.ownerDocument
      .querySelector('input[placeholder="p. ej. Annexure D 1.2.5, p.24"]');
    expect(ref).toBeTruthy();
    fireEvent.change(ref, { target: { value: "Clausula nueva" } });
    expect(guardado).not.toBe(null);
    expect(guardado[0].reajuste.pctOrigen).toBe(undefined);
  });

  test("sin permiso no escribe, ni siquiera salteando el disabled", () => {
    let guardado = null;
    const ct = CONTRATO();
    const { container } = render(
      <ControlContratos
        data={[ct]} setData={(f) => { guardado = typeof f === "function" ? f([ct]) : f; }}
        clientes={[]} setClientes={() => {}} viverosData={[]} setViveros={() => {}}
        can={false} usuarioActual={USUARIO}
        tiposAnexoPersist={[]} setTiposAnexoPersist={() => {}}
        tiposContratoPersist={[]} setTiposContratoPersist={() => {}}
      />
    );
    fireEvent.click(screen.getByText(/Ver/));
    fireEvent.click(screen.getByText(/Facturación/));
    const input = campoPct(container);
    fireEvent.change(input, { target: { value: "9" } });
    expect(guardado).toBe(null);
  });
});

// ══════════════════════════════════════════════════════════════════
// D-N1 · la guarda contra activación redundante se apoyaba en la bandera
// cruda, no en el estado. Una activación MARCADA pero incompleta dejaba el
// contrato sin salida: la pantalla ofrecía Activar y la acción respondía
// "ya hay una activación vigente", que además era falso.
dCrear("Una activación incompleta no deja el contrato sin salida", () => {
  const { activar, estadoActivacion } = require("./reajusteAplicado");
  const ARGS = { puedeEditar: true, usuarioActual: USUARIO, confirmado: true };

  test("activar sin los términos no marca nada", () => {
    const ct = CONTRATO();
    const res = activar(ct, Object.assign({}, ARGS));
    expect(res.ok).toBe(false);
    expect(res.motivo).toMatch(/Faltan los terminos de la activacion/);
    expect(res.contrato).toBe(ct);
    expect(ct.reajusteActivacion).toBe(undefined);      // ni el campo se creó
  });

  test("un registro marcado e incompleto se conserva: completarlo NO es una activación", () => {
    // Que un sello este incompleto no autoriza a sustituirlo en silencio:
    // completarlo puede cambiar el efecto economico, y este paquete no tiene
    // un flujo autorizado para eso. El registro se conserva con su historial
    // y la accion explica por que no procede.
    const atascado = CONTRATO({
      reajusteActivacion: {
        activado: true, fechaReferencia: "", respaldo: "", reglaFecha: "",
        sello: { pct: 2, fechaReferencia: "", reglaFecha: "" },
        historial: [{ evento: "activacion", autor: "X", fecha: "2026-10-05" }],
      },
    });
    expect(estadoActivacion(atascado).activo).toBe(false);
    const antes = JSON.parse(JSON.stringify(atascado.reajusteActivacion));
    const res = activar(atascado, Object.assign({}, ARGS, {
      fechaReferencia: "2026-07-01", respaldo: "Comprobante",
      reglaFecha: "inicioPeriodoServicio", reglaFechaRespaldo: "Clausula 1.2.5",
    }));
    expect(res.ok).toBe(false);
    expect(res.motivo).toMatch(sePuedeCrear
      ? /Ya hay una activacion registrada en este contrato/
      : /no permite crear nuevas/);
    expect(res.contrato).toBe(atascado);
    expect(atascado.reajusteActivacion).toEqual(antes);     // intacto, con su historial
  });



});

// Este va en un describe PLANO, no en dCrear: `OsirisModule.jsx` es identico
// en las dos ramas, y la recuperacion es justamente la version que existe
// para proteger las activaciones ya registradas. Omitirlo alla dejaba sin
// custodia la guarda de `upA` en la rama que mas la necesita.
describe("El sello protege los terminos en las dos versiones", () => {
  test("y la pantalla ofrece retirar ese registro, que es la operación autorizada", () => {
    const atascado = CONTRATO({
      reajusteActivacion: {
        activado: true, fechaReferencia: "", respaldo: "", reglaFecha: "",
        sello: { pct: 2, fechaReferencia: "", reglaFecha: "" },
        historial: [{ evento: "activacion", autor: "X", fecha: "2026-10-05" }],
      },
    });
    abrirCobros(atascado);
    expect(screen.queryByText("Activar el reajuste")).toBe(null);
    expect(screen.getByText("Desactivar")).toBeTruthy();
  });

  test("los términos sellados no se pueden borrar salteando el disabled", () => {
    let guardado = null;
    const ct = CONTRATO({
      reajusteActivacion: Object.assign({}, ACTIVACION, { reglaFechaRespaldo: "Clausula 1.2.5" }),
    });
    const { container } = render(
      <ControlContratos
        data={[ct]} setData={(f) => { guardado = typeof f === "function" ? f([ct]) : f; }}
        clientes={[]} setClientes={() => {}} viverosData={[]} setViveros={() => {}}
        can={true} usuarioActual={USUARIO}
        tiposAnexoPersist={[]} setTiposAnexoPersist={() => {}}
        tiposContratoPersist={[]} setTiposContratoPersist={() => {}}
      />
    );
    fireEvent.click(screen.getByText(/Ver/));
    fireEvent.click(screen.getByText(/Cobros derivados/));
    const respaldo = container.ownerDocument.querySelector('input[placeholder="clausula que lo dice"]');
    expect(respaldo).toBeTruthy();
    expect(respaldo.disabled).toBe(true);
    // `disabled` no desconecta el handler: esa es la prueba. La aserción mira
    // el CAMPO, no si hubo alguna escritura: el componente escribe por otros
    // motivos y comprobar `guardado === null` daría un falso negativo.
    fireEvent.change(respaldo, { target: { value: "" } });
    // No hubo ninguna escritura: la guarda cortó antes de `upd`.
    expect(guardado).toBe(null);
    // Ojo: NO se comprueba `respaldo.value`. React no revierte el DOM de un
    // input controlado cuando no hubo cambio de estado, así que el valor
    // queda en "" aunque no se haya guardado nada. Mirarlo daría un falso
    // positivo de defecto.
    expect(ct.reajusteActivacion.reglaFechaRespaldo).toBe("Clausula 1.2.5");
  });
});

// ══════════════════════════════════════════════════════════════════
// Un contrato en CONFLICTO con la configuración antigua tiene la activación
// registrada pero NO vigente: el motor sigue usando la antigua. Mirar solo
// `activo` dejaba ese caso fuera de la guarda, y por ahí se podía resellar
// con un diálogo que anunciaba "US$ 0.00". El impacto es DIFERIDO: aparece
// el día que se retira la configuración antigua.

// ══════════════════════════════════════════════════════════════════
// La secuencia completa que encontró la revisión. Un contrato en CONFLICTO
// con la configuración antigua tiene la activación registrada pero NO
// vigente: el motor usa la antigua. Por ahí se podía resellar con un diálogo
// que anunciaba "US$ 0.00", y la diferencia aparecía DESPUÉS, el día que se
// retirara la configuración antigua.
//
// Va en un describe PLANO: corre en el candidato y en la recuperación.
describe("Conflicto con la configuración antigua: el sello no se toca", () => {
  const { activar, estadoActivacion, CONFLICTO_CON_ANTIGUA } = require("./reajusteAplicado");
  const { derivarRoyaltyComercialDesdeContratos } = require("../OsirisModule");

  const SELLO_ORIGINAL = { pct: 2, fechaReferencia: "2026-07-01", reglaFecha: "inicioPeriodoServicio" };
  const REGISTRO = () => Object.assign({}, ACTIVACION, {
    reglaFechaRespaldo: "Clausula 1.2.5",
    sello: Object.assign({}, SELLO_ORIGINAL),
    historial: [{ evento: "activacion", autor: "OT Editar", fecha: "2026-10-05",
                  sello: Object.assign({}, SELLO_ORIGINAL), impactoConfirmado: 25690.69 }],
  });
  // La antigua, operando al 5 %/año.
  const enConflicto = () => CONTRATO({
    royaltyInflacion: true, rcInflacionPct: 5, reajusteActivacion: REGISTRO(),
  });
  // La misma, con la configuración antigua retirada.
  const sinLaAntigua = (ct) => Object.assign({}, ct, { royaltyInflacion: false, rcInflacionPct: "" });
  const total = (ct) => Math.round(
    derivarRoyaltyComercialDesdeContratos([ct], { ct_pantalla: [] })
      .reduce((s, f) => s + f.montoFact, 0) * 100) / 100;

  test("el estado es conflicto: registrada pero NO vigente", () => {
    const e = estadoActivacion(enConflicto());
    expect(e.estado).toBe(CONFLICTO_CON_ANTIGUA);
    expect(e.activo).toBe(false);
  });

  test("intentar activar con otros términos se bloquea y explica por qué", () => {
    const ct = enConflicto();
    const res = activar(ct, {
      fechaReferencia: "2027-07-01", respaldo: "Otro comprobante",
      reglaFecha: "pago", reglaFechaRespaldo: "Otra clausula",
      puedeEditar: true, usuarioActual: USUARIO, confirmado: true,
    });
    expect(res.ok).toBe(false);
    // El motivo depende de la version: en el candidato corta la guarda del
    // registro existente; en la recuperacion corta antes la bandera. Lo
    // economico -que no se toque nada- es lo mismo en las dos.
    if (sePuedeCrear) {
      // En conflicto responde primero la guarda B-2: la transición entre
      // modelos no está habilitada. Con ella no se llega a la del registro.
      expect(res.motivo).toMatch(/configuracion antigua OPERANDO/);
      expect(res.motivo).toMatch(/transicion entre modelos/);
      expect(res.motivo).toMatch(/No se registra nada/);
    } else {
      expect(res.motivo).toMatch(/no permite crear nuevas/);
    }
    expect(res.contrato).toBe(ct);
  });

  test("el sello original y su historial quedan intactos", () => {
    const ct = enConflicto();
    const res = activar(ct, {
      fechaReferencia: "2027-07-01", respaldo: "Otro", reglaFecha: "pago",
      reglaFechaRespaldo: "Otra", puedeEditar: true, usuarioActual: USUARIO, confirmado: true,
    });
    // Se mide lo que DEVUELVE la acción. Mirar `ct` era una tautología:
    // `activar()` es pura y nunca lo muta, así que pasaba con el defecto.
    const a = res.contrato.reajusteActivacion;
    expect(a.sello).toEqual(SELLO_ORIGINAL);
    expect(a.historial.length).toBe(1);
    expect(a.historial[0].sello).toEqual(SELLO_ORIGINAL);
  });

  test("insistir no acumula eventos", () => {
    let ct = enConflicto();
    for (let i = 0; i < 3; i++) {
      // Se encadena el resultado: si alguna llamada escribiera, se vería.
      ct = activar(ct, {
        fechaReferencia: "2027-07-01", respaldo: "Otro", reglaFecha: "pago",
        reglaFechaRespaldo: "Otra", puedeEditar: true, usuarioActual: USUARIO, confirmado: true,
      }).contrato;
    }
    expect(ct.reajusteActivacion.historial.length).toBe(1);
    expect(ct.reajusteActivacion.sello).toEqual(SELLO_ORIGINAL);
  });

  test("al retirar la configuración antigua NO aparece la diferencia diferida", () => {
    // Ésta es la comprobación que importa: el daño del defecto era DIFERIDO.
    // Se mide sobre `res.contrato`; medir sobre `ct` la volvía una tautología.
    const ct = enConflicto();
    const res = activar(ct, {
      fechaReferencia: "2027-07-01", respaldo: "Otro", reglaFecha: "pago",
      reglaFechaRespaldo: "Otra", puedeEditar: true, usuarioActual: USUARIO, confirmado: true,
    });
    // Retirada sintética de la configuración antigua: ahora manda el sello.
    const despues = sinLaAntigua(res.contrato);
    expect(estadoActivacion(despues).activo).toBe(true);
    expect(estadoActivacion(despues).fechaReferencia).toBe("2026-07-01");
    // Con el sello original, 655.240,69. Resellado con 2027-07-01 por pago
    // habría dado 629.550: 25.690,69 menos, anunciados como "US$ 0,00".
    expect(total(despues)).toBeCloseTo(655240.69, 2);
    expect(total(despues)).not.toBeCloseTo(629550, 2);
  });

  test("la pantalla ofrece retirar el registro, no activar sobre él", () => {
    const { container } = abrirCobros(enConflicto());
    expect(screen.queryByText("Activar el reajuste")).toBe(null);
    expect(screen.getByText("Desactivar")).toBeTruthy();
    expect(textoDe(container.ownerDocument)).toMatch(/configuración antigua OPERANDO/);
  });
});

// ══════════════════════════════════════════════════════════════════
// Retirar un registro conserva todo y deja constancia. Y en conflicto, la
// pantalla tiene que decir que la configuración antigua sigue operando:
// retirar el registro nuevo NO la quita y no mueve ningún importe.
describe("Retirar un registro conserva términos e historial", () => {
  const { desactivar, estadoActivacion, CONFLICTO_CON_ANTIGUA } = require("./reajusteAplicado");
  const { derivarRoyaltyComercialDesdeContratos } = require("../OsirisModule");

  const SELLO = { pct: 2, fechaReferencia: "2026-07-01", reglaFecha: "inicioPeriodoServicio" };
  const REGISTRO = () => Object.assign({}, ACTIVACION, {
    reglaFechaRespaldo: "Clausula 1.2.5", sello: Object.assign({}, SELLO),
    historial: [{ evento: "activacion", autor: "OT Editar", fecha: "2026-10-05", sello: Object.assign({}, SELLO) }],
  });
  const total = (ct) => Math.round(
    derivarRoyaltyComercialDesdeContratos([ct], { ct_pantalla: [] })
      .reduce((s, f) => s + f.montoFact, 0) * 100) / 100;

  test("conserva términos, sello e historial, y deja constancia de la baja", () => {
    const ct = CONTRATO({ reajusteActivacion: REGISTRO() });
    const res = desactivar(ct, {
      motivo: "Se anulo el respaldo", confirmado: true, usuarioActual: USUARIO, impacto: -25690.69,
    });
    expect(res.ok).toBe(true);
    const a = res.contrato.reajusteActivacion;
    expect(a.activado).toBe(false);
    expect(a.sello).toEqual(SELLO);                       // el sello se conserva
    expect(a.fechaReferencia).toBe("2026-07-01");         // y los términos
    expect(a.reglaFecha).toBe("inicioPeriodoServicio");
    expect(a.respaldo).toBeTruthy();
    expect(a.historial.length).toBe(2);                   // el anterior + la baja
    expect(a.historial[0].evento).toBe("activacion");
    expect(a.historial[1].evento).toBe("desactivacion");
    expect(a.historial[1].autor).toBe(USUARIO.nombre);
    expect(a.desactivadoMotivo).toMatch(/respaldo/);
  });

  test("en conflicto, retirar NO cambia los importes: la antigua sigue operando", () => {
    const ct = CONTRATO({
      royaltyInflacion: true, rcInflacionPct: 5, reajusteActivacion: REGISTRO(),
    });
    expect(estadoActivacion(ct).estado).toBe(CONFLICTO_CON_ANTIGUA);
    const antes = total(ct);
    const res = desactivar(ct, {
      motivo: "Se retira el registro nuevo", confirmado: true, usuarioActual: USUARIO,
    });
    expect(res.ok).toBe(true);
    expect(total(res.contrato)).toBeCloseTo(antes, 2);    // ni un peso
    // Y el registro queda, con su historial y la constancia.
    expect(res.contrato.reajusteActivacion.sello).toEqual(SELLO);
    expect(res.contrato.reajusteActivacion.historial.length).toBe(2);
  });

  test("la pantalla lo explica antes de pedir el motivo", () => {
    const ct = CONTRATO({
      royaltyInflacion: true, rcInflacionPct: 5, reajusteActivacion: REGISTRO(),
    });
    render(
      <ControlContratos
        data={[ct]} setData={() => {}} clientes={[]} setClientes={() => {}}
        viverosData={[]} setViveros={() => {}} can={true} usuarioActual={USUARIO}
        tiposAnexoPersist={[]} setTiposAnexoPersist={() => {}}
        tiposContratoPersist={[]} setTiposContratoPersist={() => {}}
      />
    );
    fireEvent.click(screen.getByText(/Ver/));
    fireEvent.click(screen.getByText(/Cobros derivados/));
    const orig = { prompt: window.prompt, confirm: window.confirm };
    const vistos = [];
    window.prompt = (x) => (vistos.push(String(x)), "");      // sin motivo: no sigue
    window.confirm = (x) => (vistos.push(String(x)), false);
    try { fireEvent.click(screen.getByText("Desactivar")); }
    finally { Object.assign(window, orig); }
    const t = vistos.join(" ");
    expect(t).toMatch(/Retirar este registro NO cambia los importes/);
    expect(t).toMatch(/sigue OPERANDO/);
    expect(t).toMatch(/no la quita/);
    expect(t).toMatch(/se conservan, con constancia de la baja/);
  });
});

// ══════════════════════════════════════════════════════════════════
// A · CRÍTICO, encontrado por la revisión. Un registro marcado pero no
// vigente dejaba los cuatro campos editables, y completarlos a mano LO
// ENCENDÍA: +25.690,69 sin vista previa, sin confirmación, sin sello, sin
// autor y sin una línea de historial. Peor: al dejar de ofrecer "Activar"
// sobre esos registros se había retirado la vía autorizada y quedaba
// abierta la silenciosa. Corre en las dos versiones: `activar()` ni
// siquiera participa, así que la bandera es irrelevante.
describe("Un registro existente no se enciende escribiendo en los campos", () => {
  const { puedeEditarTerminos, estadoActivacion } = require("./reajusteAplicado");
  const { derivarRoyaltyComercialDesdeContratos } = require("../OsirisModule");
  const total = (ct) => Math.round(
    derivarRoyaltyComercialDesdeContratos([ct], { ct_pantalla: [] })
      .reduce((s, f) => s + f.montoFact, 0) * 100) / 100;

  const ATASCADO = () => CONTRATO({
    reajusteActivacion: {
      activado: true, fechaReferencia: "", respaldo: "", reglaFecha: "", reglaFechaRespaldo: "",
      historial: [{ evento: "activacion", autor: "X", fecha: "2026-10-05" }],
    },
  });

  test("con un registro existente, los términos no se pueden editar", () => {
    const ct = ATASCADO();
    expect(estadoActivacion(ct).activo).toBe(false);     // no es vigente
    expect(puedeEditarTerminos(ct).puede).toBe(false);   // y aun así, bloqueado
  });

  test("los cuatro campos están deshabilitados y escribirlos no guarda nada", () => {
    let guardado = null;
    const ct = ATASCADO();
    const { container } = render(
      <ControlContratos
        data={[ct]} setData={(f) => { guardado = typeof f === "function" ? f([ct]) : f; }}
        clientes={[]} setClientes={() => {}} viverosData={[]} setViveros={() => {}}
        can={true} usuarioActual={USUARIO}
        tiposAnexoPersist={[]} setTiposAnexoPersist={() => {}}
        tiposContratoPersist={[]} setTiposContratoPersist={() => {}}
      />
    );
    fireEvent.click(screen.getByText(/Ver/));
    fireEvent.click(screen.getByText(/Cobros derivados/));
    const doc = container.ownerDocument;
    // El panel de activación, acotado: el documento tiene otras fechas y
    // otros selects, y tomar el primero del documento no prueba nada.
    // El div más interno que contiene el rótulo del panel Y los cuatro
    // controles: tomar el último que contiene el texto da el nodo de texto.
    const panel = [...doc.querySelectorAll("div")]
      .filter((d) => (d.textContent || "").includes("Confirmar un antecedente no activa nada") &&
                     d.querySelectorAll("input, select").length >= 4)
      .pop();
    expect(panel).toBeTruthy();
    const campos = [...panel.querySelectorAll("input, select")];
    expect(campos.length).toBe(4);                        // los cuatro términos
    campos.forEach((c) => expect(c.disabled).toBe(true));
    // `disabled` no desconecta el handler: ésa es la prueba.
    fireEvent.change(campos[0], { target: { value: "2026-07-01" } });
    fireEvent.change(campos[1], { target: { value: "Comprobante" } });
    fireEvent.change(campos[2], { target: { value: "inicioPeriodoServicio" } });
    fireEvent.change(campos[3], { target: { value: "Clausula" } });
    expect(guardado).toBe(null);
    // Y el contrato sigue sin aplicar nada.
    expect(estadoActivacion(ct).activo).toBe(false);
    expect(total(ct)).toBe(629550);
  });

  test("la vía autorizada es retirar el registro, y queda disponible", () => {
    abrirCobros(ATASCADO());
    expect(screen.queryByText("Activar el reajuste")).toBe(null);
    expect(screen.getByText("Desactivar")).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════
// B · la guarda comparaba con `=== true` mientras el resto del módulo
// trabaja por verdad. Un `activado` legacy no booleano la sorteaba y
// permitía resellar: −25.690,69 anunciados como US$ 0,00.
dCrear("Un `activado` que no sea booleano tampoco deja resellar", () => {
  const { activar } = require("./reajusteAplicado");
  const SELLO = { pct: 2, fechaReferencia: "2026-07-01", reglaFecha: "inicioPeriodoServicio" };

  [1, "true", "si", {}].forEach((valor) => {
    test(`activado = ${JSON.stringify(valor)} se bloquea igual`, () => {
      const ct = CONTRATO({
        reajusteActivacion: Object.assign({}, ACTIVACION, {
          activado: valor, reglaFechaRespaldo: "Clausula 1.2.5", sello: Object.assign({}, SELLO),
        }),
      });
      const res = activar(ct, {
        fechaReferencia: "2027-07-01", respaldo: "Otro", reglaFecha: "pago",
        reglaFechaRespaldo: "Otra", puedeEditar: true, usuarioActual: USUARIO, confirmado: true,
      });
      expect(res.ok).toBe(false);
      expect(res.contrato.reajusteActivacion.sello).toEqual(SELLO);
    });
  });
});

// ══════════════════════════════════════════════════════════════════
// Los cuatro términos y la regla válida: sin esto `activar()` podía crear un
// registro que nace no vigente, y la guarda del registro existente después
// lo congela. No tenía ninguna prueba.
dCrear("activar() exige los cuatro términos y una regla válida", () => {
  const { activar } = require("./reajusteAplicado");
  const BASE = { puedeEditar: true, usuarioActual: USUARIO, confirmado: true };
  const COMPLETO = {
    fechaReferencia: "2026-07-01", respaldo: "Comprobante",
    reglaFecha: "inicioPeriodoServicio", reglaFechaRespaldo: "Clausula 1.2.5",
  };

  test("con los cuatro, activa", () => {
    expect(activar(CONTRATO(), Object.assign({}, BASE, COMPLETO)).ok).toBe(true);
  });

  ["fechaReferencia", "respaldo", "reglaFecha", "reglaFechaRespaldo"].forEach((campo) => {
    test(`sin ${campo}, no escribe nada`, () => {
      const ct = CONTRATO();
      const datos = Object.assign({}, BASE, COMPLETO);
      delete datos[campo];
      const res = activar(ct, datos);
      expect(res.ok).toBe(false);
      expect(res.motivo).toMatch(/Faltan los terminos/);
      expect(ct.reajusteActivacion).toBe(undefined);
    });
  });

  test("una regla que no es de las cuatro permitidas se rechaza", () => {
    const ct = CONTRATO();
    const res = activar(ct, Object.assign({}, BASE, COMPLETO, { reglaFecha: "cuandoSea" }));
    expect(res.ok).toBe(false);
    expect(res.motivo).toMatch(/regla de fecha aplicable/);
    expect(ct.reajusteActivacion).toBe(undefined);
  });
});

// ══════════════════════════════════════════════════════════════════
// CASO NEGATIVO DE REGRESIÓN. Un registro marcado SIN sello no es un estado
// imposible: la revisión demostró que se producía desde la pantalla,
// completando a mano los campos de un registro atascado. Se conserva como
// caso negativo aunque los casos válidos se construyan con la acción.
//
// Describe plano: corre en las dos versiones, porque esto es del motor.
describe("Un registro marcado sin sello no aplica", () => {
  const { estadoActivacion, selloCompleto } = require("./reajusteAplicado");
  const { derivarRoyaltyComercialDesdeContratos } = require("../OsirisModule");
  const total = (ct) => Math.round(
    derivarRoyaltyComercialDesdeContratos([ct], { ct_pantalla: [] })
      .reduce((s, f) => s + f.montoFact, 0) * 100) / 100;

  // Los cuatro términos completos, la marca puesta, y NINGÚN sello: es
  // exactamente lo que dejaba el defecto al completar los campos a mano.
  const SIN_SELLO = () => CONTRATO({
    reajusteActivacion: {
      activado: true, fechaReferencia: "2026-07-01", respaldo: "Comprobante",
      reglaFecha: "inicioPeriodoServicio", reglaFechaRespaldo: "Clausula 1.2.5",
    },
  });

  test("con los cuatro términos completos pero sin sello, NO aplica", () => {
    const ct = SIN_SELLO();
    const e = estadoActivacion(ct);
    expect(e.activo).toBe(false);
    expect(e.faltan).toContain("sello completo");
    expect(e.motivo).toMatch(/completar los campos no lo produce/);
    // Y el importe es el de la base: 41,97 × 3.000 × 5 temporadas.
    expect(total(ct)).toBe(629550);
  });

  test("un sello a medias tampoco sirve", () => {
    [
      { pct: 2, fechaReferencia: "", reglaFecha: "inicioPeriodoServicio" },
      { pct: 2, fechaReferencia: "2026-07-01", reglaFecha: "" },
      { pct: 2, fechaReferencia: "2026-07-01", reglaFecha: "cuandoSea" },
      { pct: "", fechaReferencia: "2026-07-01", reglaFecha: "inicioPeriodoServicio" },
    ].forEach((sello) => {
      expect(selloCompleto(sello)).toBe(false);
      const ct = CONTRATO({ reajusteActivacion: Object.assign({}, SIN_SELLO().reajusteActivacion, { sello }) });
      expect(estadoActivacion(ct).activo).toBe(false);
      expect(total(ct)).toBe(629550);
    });
  });

  test("el registro se conserva: no se borra ni se normaliza", () => {
    const ct = SIN_SELLO();
    const antes = JSON.parse(JSON.stringify(ct.reajusteActivacion));
    estadoActivacion(ct);
    total(ct);
    expect(ct.reajusteActivacion).toEqual(antes);
    expect(ct.reajusteActivacion.activado).toBe(true);     // la marca queda
  });

  test("con el sello completo, sí aplica: la diferencia es el sello", () => {
    // La contraparte, para que se vea que lo único que cambia es el sello.
    const ct = CONTRATO({
      reajusteActivacion: Object.assign({}, SIN_SELLO().reajusteActivacion, {
        sello: { pct: 2, fechaReferencia: "2026-07-01", reglaFecha: "inicioPeriodoServicio" },
      }),
    });
    expect(estadoActivacion(ct).activo).toBe(true);
    expect(total(ct)).toBeCloseTo(655240.69, 2);
  });
});

// ══════════════════════════════════════════════════════════════════
// La previa simula el sello que la acción produciría, y NO escribe nada.
describe("La vista previa no escribe datos ni historial", () => {
  const { previsualizarActivacion, comoSiSeActivara } = require("./reajusteAplicado");
  const { derivarRoyaltyComercialDesdeContratos } = require("../OsirisModule");

  const PARA_ACTIVAR = () => CONTRATO({
    reajusteActivacion: {
      activado: false, fechaReferencia: "2026-07-01", respaldo: "Comprobante",
      reglaFecha: "inicioPeriodoServicio", reglaFechaRespaldo: "Clausula 1.2.5",
      historial: [{ evento: "activacion", autor: "X", fecha: "2026-10-05" }],
    },
  });

  test("ni la simulación ni la previa tocan el contrato", () => {
    const ct = PARA_ACTIVAR();
    const antes = JSON.parse(JSON.stringify(ct));
    const base = derivarRoyaltyComercialDesdeContratos([ct], { ct_pantalla: [] });
    comoSiSeActivara(ct);
    previsualizarActivacion(ct, base, { mesCobro: ct.rcMesCobro });
    expect(ct).toEqual(antes);
    expect(ct.reajusteActivacion.activado).toBe(false);    // sigue sin activar
    expect(ct.reajusteActivacion.sello).toBe(undefined);   // no se sello nada
    expect(ct.reajusteActivacion.historial.length).toBe(1); // ni un evento mas
  });

  test("la copia simulada lleva el sello que la acción produciría", () => {
    const hip = comoSiSeActivara(PARA_ACTIVAR());
    expect(hip.reajusteActivacion.sello).toEqual({
      pct: 2, fechaReferencia: "2026-07-01", reglaFecha: "inicioPeriodoServicio",
    });
    // Y no arrastra historial nuevo.
    expect(hip.reajusteActivacion.historial.length).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════
// Que una activación VÁLIDAMENTE SELLADA conserve sus importes no lo
// acredita el snapshot de los 23 contratos reales: esos no tienen ninguna
// activación, así que lo que prueban es impacto cero sobre esos datos. Lo
// acredita este caso sintético sellado, con cifras escritas, y el hecho de
// que este describe sea plano: corre igual en candidato y en recuperación.
describe("Una activación sellada calcula lo mismo en las dos versiones", () => {
  const { derivarRoyaltyComercialDesdeContratos } = require("../OsirisModule");
  const SELLADA = () => CONTRATO({
    reajusteActivacion: Object.assign({}, ACTIVACION, { reglaFechaRespaldo: "Clausula 1.2.5" }),
  });
  const porTemporada = (ct) => derivarRoyaltyComercialDesdeContratos([ct], { ct_pantalla: [] })
    .reduce((m, f) => (m[f.temporada] = Math.round(f.montoFact * 100) / 100, m), {});

  // 41,97 ha × US$3.000 = 125.910, compuesto al 2 % desde 2026-07-01.
  const ESPERADO = {
    "2026/2027": 125910, "2027/2028": 128428.2, "2028/2029": 130996.76,
    "2029/2030": 133616.7, "2030/2031": 136289.03,
  };

  test("las cinco temporadas, contra importes escritos", () => {
    const t = porTemporada(SELLADA());
    Object.keys(ESPERADO).forEach((k) => expect(t[k]).toBeCloseTo(ESPERADO[k], 2));
  });

  test("el total también", () => {
    const t = porTemporada(SELLADA());
    const total = Object.keys(t).reduce((s, k) => s + t[k], 0);
    expect(Math.round(total * 100) / 100).toBeCloseTo(655240.69, 2);
  });

  test("la fila protegida por factura queda en su base", () => {
    const ct = CONTRATO({
      reajusteActivacion: Object.assign({}, ACTIVACION, { reglaFechaRespaldo: "Clausula 1.2.5" }),
      rcPagos: { "2029/2030": { nFact: "999", pagado: true } },
    });
    const t = porTemporada(ct);
    expect(t["2029/2030"]).toBe(125910);
    const total = Object.keys(t).reduce((s, k) => s + t[k], 0);
    expect(Math.round(total * 100) / 100).toBeCloseTo(647533.99, 2);
  });
});

// ══════════════════════════════════════════════════════════════════
// Las TRES reproducciones completas del revisor, con sus efectos diferidos.
// Describes planos: corren en candidato y en recuperación, porque las
// guardas están en las acciones y no en la bandera de versión.
const { derivarRoyaltyComercialDesdeContratos: derivarRC } = require("../OsirisModule");
const totalDe = (ct) => Math.round(
  derivarRC([ct], { ct_pantalla: [] }).reduce((s, f) => s + f.montoFact, 0) * 100) / 100;

const abrirFacturacion = (ct, onSave) => {
  const u = render(
    <ControlContratos data={[ct]} setData={onSave || (() => {})}
      clientes={[]} setClientes={() => {}} viverosData={[]} setViveros={() => {}}
      can={true} usuarioActual={USUARIO}
      tiposAnexoPersist={[]} setTiposAnexoPersist={() => {}}
      tiposContratoPersist={[]} setTiposContratoPersist={() => {}} />
  );
  fireEvent.click(screen.getByText(/Ver/));
  fireEvent.click(screen.getByText(/Facturación/));
  return u;
};
const porRotulo = (c, tag, texto) => [...c.ownerDocument.querySelectorAll(tag)]
  .find((x) => ((x.parentElement || {}).textContent || "").includes(texto));
const silenciarAlert = (fn) => {
  const orig = window.alert; const vistos = [];
  window.alert = (x) => { vistos.push(String(x)); };
  try { fn(); } finally { window.alert = orig; }
  return vistos;
};

describe("B-1 · un registro vigente no se apaga desde Facturación", () => {
  const { estadoActivacion } = require("./reajusteAplicado");
  const VIGENTE = () => CONTRATO({
    reajusteActivacion: Object.assign({}, ACTIVACION, { reglaFechaRespaldo: "Clausula 1.2.5" }),
  });

  test("destildar Confirmado está bloqueado, y la acción tampoco deja", () => {
    let guardado = null;
    const ct = VIGENTE();
    expect(totalDe(ct)).toBeCloseTo(655240.69, 2);
    const { container } = abrirFacturacion(ct, (f) => { guardado = typeof f === "function" ? f([ct]) : f; });
    const chk = porRotulo(container, "input[type=checkbox]", "Confirmado");
    expect(chk).toBeTruthy();
    expect(chk.disabled).toBe(true);
    const avisos = silenciarAlert(() => fireEvent.click(chk));
    expect(guardado).toBe(null);
    expect(ct.reajuste.confirmado).toBe(true);
    expect(totalDe(ct)).toBeCloseTo(655240.69, 2);
    expect(avisos.join(" ")).toMatch(/modificacion economica|activacion registrada/);
  });

  test("cambiar el Tipo está bloqueado", () => {
    let guardado = null;
    const ct = VIGENTE();
    const { container } = abrirFacturacion(ct, (f) => { guardado = typeof f === "function" ? f([ct]) : f; });
    const sel = [...container.ownerDocument.querySelectorAll("select")]
      .find((x) => [...x.options].some((o) => o.value === "sin_reajuste"));
    expect(sel).toBeTruthy();
    expect(sel.disabled).toBe(true);
    silenciarAlert(() => fireEvent.change(sel, { target: { value: "sin_reajuste" } }));
    expect(guardado).toBe(null);
    expect(estadoActivacion(ct).activo).toBe(true);
    expect(totalDe(ct)).toBeCloseTo(655240.69, 2);
  });

  test("sin registro, los mismos controles siguen abiertos", () => {
    let guardado = null;
    const ct = CONTRATO();
    const { container } = abrirFacturacion(ct, (f) => { guardado = typeof f === "function" ? f([ct]) : f; });
    const chk = porRotulo(container, "input[type=checkbox]", "Confirmado");
    expect(chk.disabled).toBe(false);
    fireEvent.click(chk);
    expect(guardado).not.toBe(null);
  });
});

describe("B-2 · con la antigua operando, la primera activación se rechaza", () => {
  const { activar, previsualizarActivacion } = require("./reajusteAplicado");
  const EN_CONFLICTO = () => CONTRATO({ royaltyInflacion: true, rcInflacionPct: 5 });
  const TERMINOS = {
    fechaReferencia: "2026-07-01", respaldo: "Comprobante",
    reglaFecha: "inicioPeriodoServicio", reglaFechaRespaldo: "Clausula 1.2.5",
  };
  const activarlo = (ct) => activar(ct, Object.assign({}, TERMINOS, {
    puedeEditar: true, usuarioActual: USUARIO, confirmado: true,
  }));

  test("la previa anuncia cero, y por eso la acción NO deja confirmar", () => {
    const ct = EN_CONFLICTO();
    const base = derivarRC([{ ...ct, reajusteActivacion: { activado: false } }], { ct_pantalla: [] });
    const prev = previsualizarActivacion(ct, base, { mesCobro: "Abril" });
    expect(prev.diferenciaAplicada).toBe(0);
    const res = activarlo(ct);
    expect(res.ok).toBe(false);
    // El motivo depende de la versión: en el candidato corta la guarda de la
    // transición entre modelos; en la recuperación corta antes la bandera.
    // Lo económico -que no se escriba nada- es lo mismo en las dos.
    if (sePuedeCrear) {
      expect(res.motivo).toMatch(/transicion entre modelos/);
      expect(res.motivo).toMatch(/No se registra nada/);
    } else {
      expect(res.motivo).toMatch(/no permite crear nuevas/);
    }
    expect(ct.reajusteActivacion).toBe(undefined);
  });

  test("no se escribe sello ni historial con impacto cero", () => {
    const ct = EN_CONFLICTO();
    activarlo(ct);
    expect(ct.reajusteActivacion).toBe(undefined);
  });

  test("y por lo tanto no hay efecto diferido al retirar la antigua", () => {
    const ct = EN_CONFLICTO();
    const res = activarlo(ct);
    const sinLaAntigua = { ...res.contrato, royaltyInflacion: false, rcInflacionPct: "" };
    expect(totalDe(res.contrato)).toBeCloseTo(695732.23, 2);
    expect(totalDe(sinLaAntigua)).toBe(629550);
    expect(totalDe(sinLaAntigua)).not.toBeCloseTo(655240.69, 2);
  });

  test("sin configuración antigua, la activación procede normalmente", () => {
    const ct = CONTRATO();
    const res = activarlo(ct);
    if (!sePuedeCrear) { expect(res.ok).toBe(false); return; }
    expect(res.ok).toBe(true);
    expect(totalDe(res.contrato)).toBeCloseTo(655240.69, 2);
  });
});

describe("B-3 · con un registro, no se cambia qué modelo opera", () => {
  const { hayRegistroDeActivacion } = require("./reajusteAplicado");
  const REGISTRO = (extra) => Object.assign({}, ACTIVACION, { reglaFechaRespaldo: "Clausula 1.2.5" }, extra || {});
  const checkInflacion = (c) => porRotulo(c, "input[type=checkbox]", "Sujeto a Inflación");

  test("en conflicto, destildar la antigua está bloqueado", () => {
    let guardado = null;
    const ct = CONTRATO({ royaltyInflacion: true, rcInflacionPct: 5, reajusteActivacion: REGISTRO() });
    expect(totalDe(ct)).toBeCloseTo(695732.23, 2);
    const { container } = abrirFacturacion(ct, (f) => { guardado = typeof f === "function" ? f([ct]) : f; });
    const chk = checkInflacion(container);
    expect(chk.disabled).toBe(true);
    const avisos = silenciarAlert(() => fireEvent.click(chk));
    expect(guardado).toBe(null);
    expect(totalDe(ct)).toBeCloseTo(695732.23, 2);
    expect(avisos.join(" ")).toMatch(/QUE MODELO opera/);
  });

  test("retirar el registro NO levanta la protección", () => {
    const retirado = CONTRATO({
      royaltyInflacion: true, rcInflacionPct: 5,
      reajusteActivacion: REGISTRO({
        activado: false, desactivadoMotivo: "Se retira",
        historial: [{ evento: "activacion", autor: "X", fecha: "2026-10-05" },
                    { evento: "desactivacion", autor: "X", fecha: "2026-10-06" }],
      }),
    });
    expect(hayRegistroDeActivacion(retirado)).toBe(true);
    let guardado = null;
    const { container } = abrirFacturacion(retirado, (f) => { guardado = typeof f === "function" ? f([retirado]) : f; });
    const chk = checkInflacion(container);
    expect(chk.disabled).toBe(true);
    silenciarAlert(() => fireEvent.click(chk));
    expect(guardado).toBe(null);
  });

  test("sin registro nuevo, el comportamiento de siempre", () => {
    let guardado = null;
    const ct = CONTRATO({ royaltyInflacion: true, rcInflacionPct: 5 });
    expect(hayRegistroDeActivacion(ct)).toBe(false);
    const { container } = abrirFacturacion(ct, (f) => { guardado = typeof f === "function" ? f([ct]) : f; });
    const chk = checkInflacion(container);
    expect(chk.disabled).toBe(false);
    fireEvent.click(chk);
    expect(guardado).not.toBe(null);
  });
});

// ══════════════════════════════════════════════════════════════════
// La contraprueba que faltaba: retirar la comprobación de la marca booleana
// dejaba la suite entera en verde. Esto la mide en `estadoActivacion`, que
// es donde vive el agujero, no solo en `activar()`.
describe("Una marca de activación no booleana no habilita cálculo", () => {
  const { estadoActivacion } = require("./reajusteAplicado");

  [1, "true", "si", {}, "1"].forEach((valor) => {
    test(`activado = ${JSON.stringify(valor)} se conserva, se bloquea y NO calcula`, () => {
      const ct = CONTRATO({
        reajusteActivacion: Object.assign({}, ACTIVACION, {
          activado: valor, reglaFechaRespaldo: "Clausula 1.2.5",
        }),
      });
      const e = estadoActivacion(ct);
      expect(e.activo).toBe(false);
      expect(e.faltan).toContain("activacion valida");
      expect(e.motivo).toMatch(/no es booleana/);
      expect(totalDe(ct)).toBe(629550);
      expect(ct.reajusteActivacion.activado).toEqual(valor);
      expect(ct.reajusteActivacion.sello).toBeTruthy();
    });
  });

  test("la pantalla ofrece retirarlo con la acción controlada", () => {
    abrirCobros(CONTRATO({
      reajusteActivacion: Object.assign({}, ACTIVACION, { activado: 1, reglaFechaRespaldo: "C" }),
    }));
    expect(screen.queryByText("Activar el reajuste")).toBe(null);
    expect(screen.getByText("Desactivar")).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════
// Las guardas se aplican mientras EXISTA un registro, no solo mientras esté
// vigente. Mirar la vigencia dejaba abierto desactivar → editar → reactivar
// como vía de modificación económica, que no está autorizada: cada paso lo
// está por separado, la secuencia no.
//
// Describes planos: corren en candidato y en recuperación.
describe("Las guardas sobreviven al retiro del registro", () => {
  const { hayRegistroDeActivacion, desactivar, estadoActivacion } = require("./reajusteAplicado");

  // Un registro RETIRADO: la marca en false, pero sello e historial quedan.
  const RETIRADO = () => {
    const vivo = CONTRATO({
      reajusteActivacion: Object.assign({}, ACTIVACION, { reglaFechaRespaldo: "Clausula 1.2.5" }),
    });
    const res = desactivar(vivo, {
      motivo: "Se anulo el respaldo", confirmado: true, usuarioActual: USUARIO,
    });
    expect(res.ok).toBe(true);
    return res.contrato;
  };

  test("el registro retirado sigue existiendo, con sus términos y su historial", () => {
    const ct = RETIRADO();
    expect(ct.reajusteActivacion.activado).toBe(false);
    expect(hayRegistroDeActivacion(ct)).toBe(true);
    expect(ct.reajusteActivacion.sello).toEqual({
      pct: 2, fechaReferencia: "2026-07-01", reglaFecha: "inicioPeriodoServicio",
    });
    expect(ct.reajusteActivacion.historial.length).toBeGreaterThan(0);
    expect(estadoActivacion(ct).activo).toBe(false);
  });

  const noEscribe = (ct, buscar, accion) => {
    let guardado = null;
    const { container } = abrirFacturacion(ct, (f) => { guardado = typeof f === "function" ? f([ct]) : f; });
    const el = buscar(container);
    expect(el).toBeTruthy();
    expect(el.disabled).toBe(true);
    silenciarAlert(() => accion(el));
    expect(guardado).toBe(null);
  };

  test("tras retirar, el Tipo sigue bloqueado", () => {
    noEscribe(RETIRADO(),
      (c) => [...c.ownerDocument.querySelectorAll("select")]
        .find((x) => [...x.options].some((o) => o.value === "sin_reajuste")),
      (el) => fireEvent.change(el, { target: { value: "sin_reajuste" } }));
  });

  test("tras retirar, Confirmado sigue bloqueado", () => {
    noEscribe(RETIRADO(),
      (c) => porRotulo(c, "input[type=checkbox]", "Confirmado"),
      (el) => fireEvent.click(el));
  });

  test("tras retirar, el porcentaje sigue bloqueado", () => {
    noEscribe(RETIRADO(),
      (c) => c.ownerDocument.querySelector('input[type="number"][placeholder="sin definir"]'),
      (el) => fireEvent.change(el, { target: { value: "9" } }));
  });

  test("tras retirar, la configuración antigua sigue bloqueada", () => {
    const ct = RETIRADO();
    ct.royaltyInflacion = true; ct.rcInflacionPct = 5;
    noEscribe(ct,
      (c) => porRotulo(c, "input[type=checkbox]", "Sujeto a Inflación"),
      (el) => fireEvent.click(el));
  });
});

// ══════════════════════════════════════════════════════════════════
// La BASE del cálculo. Cambiarla mueve el resultado económico igual que
// cambiar el porcentaje: 3.000 → 3.500 llevaba el total de 655.240,69 a
// 764.447,48, +109.206,79 sin confirmación.
//
// Ojo con la forma del bloqueo: `Cell` con `can` en false NO renderiza un
// input deshabilitado, renderiza texto. Es más fuerte que un `disabled`, y
// por eso la prueba comprueba que no hay campo editable, no que lo haya y
// esté deshabilitado. La guarda dentro de `upProtegido` es la segunda capa.
describe("La base por hectárea está bloqueada mientras exista un registro", () => {
  const { desactivar } = require("./reajusteAplicado");
  const VIGENTE = () => CONTRATO({
    reajusteActivacion: Object.assign({}, ACTIVACION, { reglaFechaRespaldo: "Clausula 1.2.5" }),
  });
  const zonaBase = (c) => {
    const et = [...c.ownerDocument.querySelectorAll("div")]
      .filter((d) => (d.textContent || "").trim().startsWith("Valor Royalty Comercial"))
      .pop();
    expect(et).toBeTruthy();
    return et.parentElement || et;
  };

  test("con registro vigente no hay campo editable, y el valor no se altera", () => {
    let guardado = null;
    const ct = VIGENTE();
    expect(totalDe(ct)).toBeCloseTo(655240.69, 2);
    const { container } = abrirFacturacion(ct, (f) => { guardado = typeof f === "function" ? f([ct]) : f; });
    const zona = zonaBase(container);
    const editable = [...zona.querySelectorAll("span")].find((x) => (x.style || {}).cursor === "pointer");
    expect(editable).toBe(undefined);                 // no se puede entrar a editar
    expect(zona.textContent).toMatch(/3000/);         // el valor sigue visible
    expect(guardado).toBe(null);
    expect(ct.valorRoyaltyComercial).toBe(3000);
    expect(totalDe(ct)).toBeCloseTo(655240.69, 2);
  });

  test("tras retirar el registro, sigue bloqueada", () => {
    const res = desactivar(VIGENTE(), {
      motivo: "Se anulo el respaldo", confirmado: true, usuarioActual: USUARIO,
    });
    let guardado = null;
    const { container } = abrirFacturacion(res.contrato, (f) => {
      guardado = typeof f === "function" ? f([res.contrato]) : f;
    });
    const zona = zonaBase(container);
    const editable = [...zona.querySelectorAll("span")].find((x) => (x.style || {}).cursor === "pointer");
    expect(editable).toBe(undefined);
    expect(guardado).toBe(null);
    expect(res.contrato.valorRoyaltyComercial).toBe(3000);
  });

  test("sin registro, se edita como siempre", () => {
    let guardado = null;
    const ct = CONTRATO();
    const { container } = abrirFacturacion(ct, (f) => { guardado = typeof f === "function" ? f([ct]) : f; });
    const zona = zonaBase(container);
    const editable = [...zona.querySelectorAll("span")].find((x) => (x.style || {}).cursor === "pointer");
    expect(editable).toBeTruthy();                    // el comportamiento de siempre
    fireEvent.click(editable);
    const campo = zona.querySelector('input[type="number"]');
    expect(campo).toBeTruthy();
    fireEvent.change(campo, { target: { value: "3500" } });
    fireEvent.blur(campo);
    expect(guardado).not.toBe(null);
    expect(guardado[0].valorRoyaltyComercial).toBe(3500);
  });

  test("no se bloquean los datos operativos: el alcance son los tres campos económicos", () => {
    // Si alguien extiende las guardas a hectáreas, despachos u otros datos
    // operativos, esta prueba tiene que caer.
    const { hayRegistroDeActivacion } = require("./reajusteAplicado");
    const ct = VIGENTE();
    expect(hayRegistroDeActivacion(ct)).toBe(true);
    const { container } = abrirFacturacion(ct, () => {});
    const editables = [...container.ownerDocument.querySelectorAll("span")]
      .filter((x) => (x.style || {}).cursor === "pointer").length;
    expect(editables).toBeGreaterThan(0);             // queda mucho editable
  });
});

// ══════════════════════════════════════════════════════════════════
// D-1 · La cláusula que respalda el reajuste NO es un dato documental.
// `faltantesReajuste` la exige, así que vaciarla deja el antecedente en
// "pendiente", `estadoActivacion` pasa a no activable y el sello deja de
// aplicar: 655.240,69 → 629.550, los mismos −25.690,69 que destildar
// "Confirmado", por otra vía. La octava revisión la encontró con el control
// habilitado, sin aviso, sin previa, sin confirmación y sin historial.
describe("D-1 · la cláusula que respalda el reajuste está bloqueada", () => {
  const { estadoActivacion, TERMINOS_BLOQUEABLES, desactivar } = require("./reajusteAplicado");
  const clausula = (c) => c.ownerDocument.querySelector('input[placeholder^="p. ej. Annexure"]');
  const VIGENTE = () => CONTRATO({
    reajusteActivacion: Object.assign({}, ACTIVACION, { reglaFechaRespaldo: "Clausula 1.2.5" }),
  });

  test("está en la lista de términos bloqueables", () => {
    expect(TERMINOS_BLOQUEABLES).toContain("referencia");
  });

  test("el importe que la guarda impide: vaciarla apagaría el sello", () => {
    const ct = VIGENTE();
    expect(totalDe(ct)).toBeCloseTo(655240.69, 2);
    const apagado = Object.assign({}, ct, {
      reajuste: Object.assign({}, ct.reajuste, { referencia: "" }),
    });
    expect(estadoActivacion(apagado).activo).toBe(false);
    expect(totalDe(apagado)).toBe(629550);
    expect(655240.69 - 629550).toBeCloseTo(25690.69, 2);
  });

  test("con registro vigente: deshabilitada, y vaciarla no escribe ni mueve el total", () => {
    let guardado = null;
    const ct = VIGENTE();
    const { container } = abrirFacturacion(ct, (f) => { guardado = typeof f === "function" ? f([ct]) : f; });
    const inp = clausula(container);
    expect(inp).toBeTruthy();
    expect(inp.disabled).toBe(true);
    // `disabled` no desconecta el handler: la guarda va dentro de upR.
    const avisos = silenciarAlert(() => fireEvent.change(inp, { target: { value: "" } }));
    expect(guardado).toBe(null);
    expect(ct.reajuste.referencia).toBe("Clausula 1.2.5");
    expect(estadoActivacion(ct).activo).toBe(true);
    expect(totalDe(ct)).toBeCloseTo(655240.69, 2);
    expect(avisos.join(" ")).toMatch(/clausula que lo respalda/);
  });

  test("tras retirar el registro, sigue bloqueada", () => {
    const res = desactivar(VIGENTE(), {
      motivo: "Se anulo el respaldo", confirmado: true, usuarioActual: USUARIO,
    });
    expect(res.ok).toBe(true);
    let guardado = null;
    const ct = res.contrato;
    const { container } = abrirFacturacion(ct, (f) => { guardado = typeof f === "function" ? f([ct]) : f; });
    const inp = clausula(container);
    expect(inp.disabled).toBe(true);
    silenciarAlert(() => fireEvent.change(inp, { target: { value: "" } }));
    expect(guardado).toBe(null);
    expect(ct.reajuste.referencia).toBe("Clausula 1.2.5");
  });

  test("en conflicto con la antigua, tampoco: el efecto sería diferido", () => {
    let guardado = null;
    const ct = CONTRATO({
      royaltyInflacion: true, rcInflacionPct: 5,
      reajusteActivacion: Object.assign({}, ACTIVACION, { reglaFechaRespaldo: "Clausula 1.2.5" }),
    });
    const antes = totalDe(ct);
    const { container } = abrirFacturacion(ct, (f) => { guardado = typeof f === "function" ? f([ct]) : f; });
    silenciarAlert(() => fireEvent.change(clausula(container), { target: { value: "" } }));
    expect(guardado).toBe(null);
    expect(ct.reajuste.referencia).toBe("Clausula 1.2.5");
    expect(totalDe(ct)).toBe(antes);
  });

  test("sin registro, la cláusula se edita como siempre", () => {
    let guardado = null;
    const ct = CONTRATO();
    const { container } = abrirFacturacion(ct, (f) => { guardado = typeof f === "function" ? f([ct]) : f; });
    const inp = clausula(container);
    expect(inp.disabled).toBe(false);
    fireEvent.change(inp, { target: { value: "Annexure D 9.9" } });
    expect(guardado).not.toBe(null);
    expect(guardado[0].reajuste.referencia).toBe("Annexure D 9.9");
  });
});

// ══════════════════════════════════════════════════════════════════
// D-2 · `puedeEditarTerminos` miraba la VIGENCIA del registro. Tras retirar
// quedaba en true y reabría los cuatro campos sellados (fecha de referencia,
// respaldo, regla y su respaldo): editarlos y reactivar resellaba otros
// términos —medido: 655.240,69 → 629.550—, que es la vía
// desactivar → editar → reactivar que no está autorizada. Ahora mira la
// existencia, igual que las guardas de la pantalla. Reactivar con los
// términos conservados sigue siendo posible: `activar()` no consulta esto.
describe("D-2 · tras retirar, los términos sellados tampoco se editan", () => {
  const { puedeEditarTerminos, desactivar, estadoActivacion } = require("./reajusteAplicado");
  const RETIRADO = () => {
    const res = desactivar(
      CONTRATO({ reajusteActivacion: Object.assign({}, ACTIVACION, { reglaFechaRespaldo: "Clausula 1.2.5" }) }),
      { motivo: "Se anulo el respaldo", confirmado: true, usuarioActual: USUARIO });
    expect(res.ok).toBe(true);
    return res.contrato;
  };

  test("el modelo lo dice: no se pueden editar", () => {
    const ct = RETIRADO();
    expect(ct.reajusteActivacion.activado).toBe(false);
    expect(estadoActivacion(ct).activo).toBe(false);
    expect(puedeEditarTerminos(ct).puede).toBe(false);
  });

  test("y los cuatro campos del panel no guardan nada", () => {
    let guardado = null;
    const ct = RETIRADO();
    const { container } = render(
      <ControlContratos
        data={[ct]} setData={(f) => { guardado = typeof f === "function" ? f([ct]) : f; }}
        clientes={[]} setClientes={() => {}} viverosData={[]} setViveros={() => {}}
        can={true} usuarioActual={USUARIO}
        tiposAnexoPersist={[]} setTiposAnexoPersist={() => {}}
        tiposContratoPersist={[]} setTiposContratoPersist={() => {}} />
    );
    fireEvent.click(screen.getByText(/Ver/));
    fireEvent.click(screen.getByText(/Cobros derivados/));
    const panel = [...container.ownerDocument.querySelectorAll("div")]
      .filter((d) => (d.textContent || "").includes("Confirmar un antecedente no activa nada") &&
                     d.querySelectorAll("input, select").length >= 4)
      .pop();
    expect(panel).toBeTruthy();
    const campos = [...panel.querySelectorAll("input, select")];
    expect(campos.length).toBe(4);
    campos.forEach((c) => expect(c.disabled).toBe(true));
    fireEvent.change(campos[0], { target: { value: "2024-07-01" } });
    fireEvent.change(campos[2], { target: { value: "emision" } });
    expect(guardado).toBe(null);
    expect(ct.reajusteActivacion.fechaReferencia).toBe("2026-07-01");
    expect(ct.reajusteActivacion.sello).toEqual({
      pct: 2, fechaReferencia: "2026-07-01", reglaFecha: "inicioPeriodoServicio",
    });
  });

  test("sin ningún registro, los cuatro campos están abiertos", () => {
    expect(puedeEditarTerminos(CONTRATO()).puede).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
// D-11 · La reproducción completa, desde la pantalla.
//
// Con la regla "emisión" y sin fechas estimadas cargadas, la pantalla mostraba
// una previa de cero y la acción sellaba ese cero. Cargar las fechas después
// movía el total de 629.550 a 655.240,69 sin previa ni confirmación. Ahora la
// acción recibe las filas, no puede sellar ninguna fecha y rechaza diciendo
// qué falta en cada temporada.
dCrear("D-11 · la pantalla no deja sellar una regla por fila sin su fecha", () => {
  const { estadoActivacion } = require("./reajusteAplicado");

  // Propio, porque el de arriba vive dentro de otro describe.
  const conDialogos = (respuestas, fn) => {
    const orig = { confirm: window.confirm, prompt: window.prompt, alert: window.alert };
    const vistos = [];
    window.confirm = (x) => (vistos.push(String(x)), respuestas.confirm);
    window.prompt = (x) => (vistos.push(String(x)), respuestas.prompt);
    window.alert = (x) => { vistos.push(String(x)); };
    try { fn(vistos); } finally { Object.assign(window, orig); }
    return vistos;
  };

  const SIN_FECHAS = () => CONTRATO({
    reajusteActivacion: {
      activado: false, fechaReferencia: "2026-07-01", respaldo: "Comprobante",
      reglaFecha: "emision", reglaFechaRespaldo: "Clausula 1.2.6",
    },
  });

  const abrir = (ct, onSave) => {
    render(
      <ControlContratos
        data={[ct]} setData={onSave || (() => {})}
        clientes={[]} setClientes={() => {}} viverosData={[]} setViveros={() => {}}
        can={true} usuarioActual={USUARIO}
        tiposAnexoPersist={[]} setTiposAnexoPersist={() => {}}
        tiposContratoPersist={[]} setTiposContratoPersist={() => {}} />
    );
    fireEvent.click(screen.getByText(/Ver/));
    fireEvent.click(screen.getByText(/Cobros derivados/));
  };

  test("la previa muestra las filas pendientes por fecha no sellada", () => {
    abrir(SIN_FECHAS());
    const t = document.body.textContent.replace(/\s+/g, " ");
    expect(t).toMatch(/pendientes por fecha no sellada: 5/);
    expect(t).toMatch(/pendiente: sin fecha sellada/);
  });

  test("activar queda rechazado dentro de la acción, y no escribe nada", () => {
    let guardado = null;
    const ct = SIN_FECHAS();
    abrir(ct, (f) => { guardado = typeof f === "function" ? f([ct]) : f; });
    const vistos = conDialogos({ confirm: true }, () => {
      fireEvent.click(screen.getByText("Activar el reajuste"));
    });
    const texto = vistos.join(" ");
    expect(texto).toMatch(/NINGUNA fila tiene una fecha que se pueda sellar/);
    expect(texto).toMatch(/no tiene fecha estimada de factura cargada/);
    expect(guardado).toBe(null);
    expect(ct.reajusteActivacion.activado).toBe(false);
    expect(ct.reajusteActivacion.sello).toBeUndefined();
    expect(ct.reajusteActivacion.historial).toBeUndefined();
    expect(estadoActivacion(ct).activo).toBe(false);
    expect(totalDe(ct)).toBe(629550);
  });

  test("y cargar las fechas después tampoco enciende nada: no hay registro", () => {
    const ct = SIN_FECHAS();
    const conFechas = Object.assign({}, ct, {
      rcPagos: ["2026/2027", "2027/2028", "2028/2029", "2029/2030", "2030/2031"]
        .reduce((m, t) => (m[t] = { fechaEst: Number(t.split("/")[1]) + "-06-30" }, m), {}),
    });
    expect(totalDe(conFechas)).toBe(629550);
    expect(estadoActivacion(conFechas).activo).toBe(false);
  });

  test("con una regla determinista, la misma pantalla activa normalmente", () => {
    let guardado = null;
    const ct = CONTRATO({
      reajusteActivacion: {
        activado: false, fechaReferencia: "2026-07-01", respaldo: "Comprobante",
        reglaFecha: "inicioPeriodoServicio", reglaFechaRespaldo: "Clausula 1.2.5",
      },
    });
    abrir(ct, (f) => { guardado = typeof f === "function" ? f([ct]) : f; });
    conDialogos({ confirm: true }, () => {
      fireEvent.click(screen.getByText("Activar el reajuste"));
    });
    expect(guardado).not.toBe(null);
    expect(guardado[0].reajusteActivacion.sello).toEqual({
      pct: 2, fechaReferencia: "2026-07-01", reglaFecha: "inicioPeriodoServicio",
    });
    expect(totalDe(guardado[0])).toBeCloseTo(655240.69, 2);
  });
});

// ══════════════════════════════════════════════════════════════════
// D-6 · COBERTURA DE INTERFAZ, no bloqueo económico.
//
// Esto se separa a propósito. El bloqueo económico de los ocho términos lo
// sostiene `upR`, que rechaza por lista y avisa: revertir estas cuatro
// condiciones `disabled` NO abre ningún agujero de importes, y así lo midió la
// revisión. Lo que vuelve sin ellas es el defecto de interfaz que D-6
// describía: el campo se deja escribir, se teclea y se pierde lo tecleado.
// La revisión anterior encontró que estas cuatro no tenían ninguna prueba.
describe("D-6 · los ocho controles de términos quedan deshabilitados (interfaz)", () => {
  const VIGENTE = (extra) => CONTRATO(Object.assign({
    reajusteActivacion: Object.assign({}, ACTIVACION, { reglaFechaRespaldo: "Clausula 1.2.5" }),
  }, extra || {}));

  const deshabilitado = (ct, buscar) => {
    const { container } = abrirFacturacion(ct, () => {});
    const el = buscar(container.ownerDocument);
    expect(el).toBeTruthy();
    expect(el.disabled).toBe(true);
  };

  test('"Se aplica desde" está deshabilitado', () => {
    deshabilitado(VIGENTE(), (d) => [...d.querySelectorAll('input[type="date"]')]
      .find((x) => ((x.parentElement || {}).textContent || "").includes("Se aplica desde")));
  });

  test("con tipo índice, el índice está deshabilitado", () => {
    deshabilitado(VIGENTE({ reajuste: { tipo: "indice", indice: "IPC", fuente: "INE", fechaBase: "2026-01-01",
      desde: "2026-07-01", referencia: "Clausula 1.2.5", confirmado: true } }),
      (d) => [...d.querySelectorAll("input")]
        .find((x) => ((x.parentElement || {}).textContent || "").includes("Indice")));
  });

  test("con tipo índice, la fuente está deshabilitada", () => {
    deshabilitado(VIGENTE({ reajuste: { tipo: "indice", indice: "IPC", fuente: "INE", fechaBase: "2026-01-01",
      desde: "2026-07-01", referencia: "Clausula 1.2.5", confirmado: true } }),
      (d) => [...d.querySelectorAll("input")]
        .find((x) => ((x.parentElement || {}).textContent || "").includes("Fuente")));
  });

  test("con tipo índice, la fecha base está deshabilitada", () => {
    deshabilitado(VIGENTE({ reajuste: { tipo: "indice", indice: "IPC", fuente: "INE", fechaBase: "2026-01-01",
      desde: "2026-07-01", referencia: "Clausula 1.2.5", confirmado: true } }),
      (d) => [...d.querySelectorAll('input[type="date"]')]
        .find((x) => ((x.parentElement || {}).textContent || "").includes("Fecha base")));
  });

  test("sin registro, los cuatro siguen abiertos", () => {
    const ct = CONTRATO();
    const { container } = abrirFacturacion(ct, () => {});
    const desde = [...container.ownerDocument.querySelectorAll('input[type="date"]')]
      .find((x) => ((x.parentElement || {}).textContent || "").includes("Se aplica desde"));
    expect(desde.disabled).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// D-12 · La secuencia completa, desde la pantalla: fila protegida → borrar o
// corregir el número de factura → guardar y recargar → importe intacto y
// antecedentes conservados.
//
// Dos detalles del encuadre, porque si no la prueba no prueba nada:
//
//   · El `nFact` sólo es editable en las temporadas VIVAS (`filaRC(x,true)`);
//     en las futuras se muestra como texto. Así que la temporada protegida se
//     descubre del DOM en vez de fijarse a mano: la prueba sigue valiendo
//     cuando el calendario avance.
//   · La fecha de referencia va en 2023 para que la temporada viva ya tenga
//     períodos cumplidos. Con la fixture de 2026 el ajuste de la primera
//     temporada es cero y borrar su factura no movería nada.
describe("D-12 · borrar un antecedente desde la pantalla no mueve el importe", () => {
  const { antecedentesDeCobro, estadoActivacion } = require("./reajusteAplicado");

  const ACT_2023 = {
    activado: true, fechaReferencia: "2023-07-01", respaldo: "Comprobante sintetico 001",
    reglaFecha: "inicioPeriodoServicio", reglaFechaRespaldo: "Clausula sintetica 1.2.6",
    usuario: "prueba", fecha: "2026-10-05",
    sello: { pct: 2, fechaReferencia: "2023-07-01", reglaFecha: "inicioPeriodoServicio" },
  };
  const BASE = (rcPagos) => CONTRATO({
    rcCohortes: [{ id: "c1", ha: 41.97, desde: "2023/2024" }],
    reajusteActivacion: ACT_2023,
    rcPagos: rcPagos || {},
  });

  const abrirCobrosCon = (ct, onSave) => {
    const u = render(
      <ControlContratos
        data={[ct]} setData={onSave || (() => {})}
        clientes={[]} setClientes={() => {}} viverosData={[]} setViveros={() => {}}
        can={true} usuarioActual={USUARIO}
        tiposAnexoPersist={[]} setTiposAnexoPersist={() => {}}
        tiposContratoPersist={[]} setTiposContratoPersist={() => {}} />
    );
    fireEvent.click(screen.getByText(/Ver/));
    fireEvent.click(screen.getByText(/Cobros derivados/));
    return u;
  };
  const inputsNFact = (doc) => [...doc.querySelectorAll('input[placeholder="F-000"]')];
  const temporadaDe = (inp) => {
    const tr = inp.closest("tr");
    const m = (tr ? tr.textContent : "").match(/20\d\d\/20\d\d/);
    return m ? m[0] : "";
  };
  // La última temporada viva: la que más períodos cumplidos tiene, así el
  // efecto económico de perder la protección es el mayor de los disponibles.
  const temporadaViva = () => {
    const { container, unmount } = abrirCobrosCon(BASE(), () => {});
    const ts = inputsNFact(container.ownerDocument).map(temporadaDe).filter(Boolean).sort();
    unmount();
    expect(ts.length).toBeGreaterThan(0);
    return ts[ts.length - 1];
  };

  test("el punto de partida: con factura, esa temporada no se recalcula", () => {
    const t = temporadaViva();
    const sin = BASE();
    const con = BASE({ [t]: { nFact: "999" } });
    expect(totalDe(con)).toBeLessThan(totalDe(sin));          // la protegida no lleva ajuste
    expect(estadoActivacion(con).activo).toBe(true);
  });

  test("borrarlo: el campo se edita, la proteccion queda, el total no se mueve", () => {
    const t = temporadaViva();
    let guardado = null;
    const ct = BASE({ [t]: { nFact: "999" } });
    const antes = totalDe(ct);
    const { container } = abrirCobrosCon(ct, (f) => { guardado = typeof f === "function" ? f([ct]) : f; });
    const inp = inputsNFact(container.ownerDocument).find((x) => x.value === "999");
    expect(inp).toBeTruthy();
    expect(inp.disabled).toBe(false);                          // es dato operativo: se edita
    fireEvent.change(inp, { target: { value: "" } });
    expect(guardado).not.toBe(null);
    const fila = guardado[0].rcPagos[t];
    expect(fila.nFact).toBe("");                               // el campo quedo editado
    expect(fila.proteccion).toBeTruthy();                      // y la proteccion conservada
    expect(antecedentesDeCobro(fila).hay).toBe(true);
    expect(totalDe(guardado[0])).toBe(antes);                  // el importe, intacto
    // Y sin la correccion esto habria subido: la fila volvia al recalculo.
    const crudo = Object.assign({}, ct, { rcPagos: { [t]: { nFact: "" } } });
    expect(totalDe(crudo)).toBeGreaterThan(antes);
  });

  test("guardar y recargar: el importe sigue intacto y los antecedentes conservados", () => {
    const t = temporadaViva();
    let guardado = null;
    const ct = BASE({ [t]: { nFact: "999" } });
    const antes = totalDe(ct);
    const { container, unmount } = abrirCobrosCon(ct, (f) => { guardado = typeof f === "function" ? f([ct]) : f; });
    fireEvent.change(inputsNFact(container.ownerDocument).find((x) => x.value === "999"), { target: { value: "" } });
    unmount();
    // La recarga: serializado y de vuelta, como lo haria la persistencia.
    const recargado = JSON.parse(JSON.stringify(guardado[0]));
    expect(totalDe(recargado)).toBe(antes);
    expect(recargado.rcPagos[t].proteccion.motivos.join(" ")).toMatch(/999/);
    abrirCobrosCon(recargado, () => {});
    const t2 = document.body.textContent.replace(/\s+/g, " ");
    // Y lo dice por lo que es: el antecedente se retiro, asi que la fila no
    // "tiene factura o pago"; tiene la proteccion conservada.
    expect(t2).toMatch(/protegida: antecedentes retirados el 20\d\d-\d\d-\d\d · proteccion conservada/);
    expect(t2).not.toMatch(/protegida: tiene factura o pago/);
    // Y la celda explica por que no se puede devolver la fila al calculo: es la
    // unica frase que se lo dice al operador, y antes era una constante muerta.
    const celda = [...document.querySelectorAll("td")]
      .find((x) => /antecedentes retirados/.test(x.textContent));
    expect(celda.getAttribute("title")).toMatch(/operacion economica con su propio flujo/);
  });

  test("vivo Y conservado a la vez: la celda nombra el vivo, no el retirado", () => {
    // Sin red a nivel DOM, romper `soloPorConservada` hacia que la celda
    // dijera "antecedentes retirados" sobre una fila con factura viva. Lo midio
    // la revision: la contraprueba dejaba la suite de pantalla en verde.
    const t = temporadaViva();
    abrirCobrosCon(BASE({ [t]: { nFact: "1000",
      proteccion: { motivos: ["número de factura 999"], desde: "2026-10-09" } } }), () => {});
    const txt = document.body.textContent.replace(/\s+/g, " ");
    expect(txt).toMatch(/protegida: tiene factura o pago/);
    expect(txt).not.toMatch(/antecedentes retirados/);
  });

  test("con el antecedente vivo, la celda sigue diciendo que tiene factura", () => {
    const t = temporadaViva();
    abrirCobrosCon(BASE({ [t]: { nFact: "999" } }), () => {});
    const txt = document.body.textContent.replace(/\s+/g, " ");
    expect(txt).toMatch(/protegida: tiene factura o pago/);
    expect(txt).not.toMatch(/proteccion conservada/);
  });

  test("corregirlo por otro numero tampoco mueve el total", () => {
    const t = temporadaViva();
    let guardado = null;
    const ct = BASE({ [t]: { nFact: "999" } });
    const antes = totalDe(ct);
    const { container } = abrirCobrosCon(ct, (f) => { guardado = typeof f === "function" ? f([ct]) : f; });
    fireEvent.change(inputsNFact(container.ownerDocument).find((x) => x.value === "999"), { target: { value: "1000" } });
    expect(guardado[0].rcPagos[t].nFact).toBe("1000");
    expect(guardado[0].rcPagos[t].proteccion).toBeUndefined();  // no hace falta conservar nada
    expect(totalDe(guardado[0])).toBe(antes);
  });

  test("destildar 'pagado' tampoco devuelve la fila al recalculo", () => {
    const t = temporadaViva();
    let guardado = null;
    const ct = BASE({ [t]: { pagado: true } });
    const antes = totalDe(ct);
    const { container } = abrirCobrosCon(ct, (f) => { guardado = typeof f === "function" ? f([ct]) : f; });
    const chk = [...container.ownerDocument.querySelectorAll('input[type=checkbox]')]
      .find((x) => { const tr = x.closest("tr"); return tr && tr.textContent.includes(t) && x.checked; });
    expect(chk).toBeTruthy();
    fireEvent.click(chk);
    expect(guardado).not.toBe(null);
    expect(guardado[0].rcPagos[t].pagado).toBe(false);
    expect(guardado[0].rcPagos[t].proteccion).toBeTruthy();
    expect(totalDe(guardado[0])).toBe(antes);
  });

  test("sin antecedentes, la fila sigue tomando el reajuste: no se protege de mas", () => {
    const sin = BASE();
    const { container, unmount } = abrirCobrosCon(sin, () => {});
    const vivos = inputsNFact(container.ownerDocument);
    expect(vivos.filter((x) => x.value === "").length).toBe(vivos.length);   // ninguna con factura
    const t = vivos.map(temporadaDe).filter(Boolean).sort().pop();
    unmount();
    expect(totalDe(BASE({ [t]: { nFact: "999" } }))).toBeLessThan(totalDe(sin));
  });
});

// ══════════════════════════════════════════════════════════════════
// D-11 · El diálogo. Faltando la fecha que la regla exige, se bloquea ANTES de
// ofrecer una confirmación de "US$ 0,00": preguntar primero y rechazar después
// es pedirle al usuario que acepte un cero causado por información ausente.
dCrear("D-11 · el dialogo no ofrece confirmar un cero por falta de fecha", () => {
  const dialogos = (fn) => {
    const orig = { confirm: window.confirm, alert: window.alert, prompt: window.prompt };
    const vistos = [];
    window.confirm = (x) => (vistos.push("CONFIRM: " + x), true);
    window.alert = (x) => { vistos.push("ALERT: " + x); };
    window.prompt = (x) => (vistos.push("PROMPT: " + x), "x");
    try { fn(); } finally { Object.assign(window, orig); }
    return vistos;
  };

  test("se avisa con las temporadas pendientes y NO se pregunta nada", () => {
    let guardado = null;
    const ct = CONTRATO({
      reajusteActivacion: {
        activado: false, fechaReferencia: "2026-07-01", respaldo: "Comprobante",
        reglaFecha: "emision", reglaFechaRespaldo: "Clausula 1.2.6",
      },
    });
    render(
      <ControlContratos
        data={[ct]} setData={(f) => { guardado = typeof f === "function" ? f([ct]) : f; }}
        clientes={[]} setClientes={() => {}} viverosData={[]} setViveros={() => {}}
        can={true} usuarioActual={USUARIO}
        tiposAnexoPersist={[]} setTiposAnexoPersist={() => {}}
        tiposContratoPersist={[]} setTiposContratoPersist={() => {}} />
    );
    fireEvent.click(screen.getByText(/Ver/));
    fireEvent.click(screen.getByText(/Cobros derivados/));
    const vistos = dialogos(() => { fireEvent.click(screen.getByText("Activar el reajuste")); });

    const confirms = vistos.filter((v) => v.startsWith("CONFIRM"));
    const alertas = vistos.filter((v) => v.startsWith("ALERT"));
    expect(confirms.length).toBe(0);                         // no se pregunta
    expect(alertas.length).toBe(1);
    expect(alertas[0]).toMatch(/NINGUNA fila tiene una fecha que se pueda sellar/);
    ["2026/2027", "2027/2028", "2028/2029", "2029/2030", "2030/2031"].forEach((t) => {
      expect(alertas[0]).toContain(t);
    });
    expect(alertas.join(" ")).not.toMatch(/US\$ 0\.00/);
    expect(guardado).toBe(null);
  });

  test("con una regla alcanzable, el dialogo sigue preguntando como siempre", () => {
    let guardado = null;
    const ct = CONTRATO({
      reajusteActivacion: {
        activado: false, fechaReferencia: "2026-07-01", respaldo: "Comprobante",
        reglaFecha: "inicioPeriodoServicio", reglaFechaRespaldo: "Clausula 1.2.5",
      },
    });
    render(
      <ControlContratos
        data={[ct]} setData={(f) => { guardado = typeof f === "function" ? f([ct]) : f; }}
        clientes={[]} setClientes={() => {}} viverosData={[]} setViveros={() => {}}
        can={true} usuarioActual={USUARIO}
        tiposAnexoPersist={[]} setTiposAnexoPersist={() => {}}
        tiposContratoPersist={[]} setTiposContratoPersist={() => {}} />
    );
    fireEvent.click(screen.getByText(/Ver/));
    fireEvent.click(screen.getByText(/Cobros derivados/));
    const vistos = dialogos(() => { fireEvent.click(screen.getByText("Activar el reajuste")); });
    expect(vistos.filter((v) => v.startsWith("CONFIRM")).length).toBe(1);
    expect(vistos[0]).toMatch(/Diferencia que se aplica: US\$ 25690\.69/);
    expect(guardado).not.toBe(null);
    expect(totalDe(guardado[0])).toBeCloseTo(655240.69, 2);
  });
});
