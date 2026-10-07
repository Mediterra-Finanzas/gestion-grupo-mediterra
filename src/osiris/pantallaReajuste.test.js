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
    expect(t).toMatch(/las 5 que hay tienen factura o pago/);
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
    expect(vistos.join(" ")).toMatch(/Protegidas por factura o pago: 1/);

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
    expect(res.motivo).toMatch(/Ya hay una activacion registrada en este contrato/);
    expect(res.contrato).toBe(atascado);
    expect(atascado.reajusteActivacion).toEqual(antes);     // intacto, con su historial
  });

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

});

// Este va en un describe PLANO, no en dCrear: `OsirisModule.jsx` es identico
// en las dos ramas, y la recuperacion es justamente la version que existe
// para proteger las activaciones ya registradas. Omitirlo alla dejaba sin
// custodia la guarda de `upA` en la rama que mas la necesita.
describe("El sello protege los terminos en las dos versiones", () => {
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
    expect(res.motivo).toMatch(/Ya hay una activacion registrada en este contrato/);
    expect(res.motivo).toMatch(/no esta habilitada en este paquete/);
    expect(res.motivo).toMatch(/se conservan tal como estan/);
    expect(res.contrato).toBe(ct);
  });

  test("el sello original y su historial quedan intactos", () => {
    const ct = enConflicto();
    activar(ct, {
      fechaReferencia: "2027-07-01", respaldo: "Otro", reglaFecha: "pago",
      reglaFechaRespaldo: "Otra", puedeEditar: true, usuarioActual: USUARIO, confirmado: true,
    });
    expect(ct.reajusteActivacion.sello).toEqual(SELLO_ORIGINAL);
    expect(ct.reajusteActivacion.historial.length).toBe(1);
    expect(ct.reajusteActivacion.historial[0].sello).toEqual(SELLO_ORIGINAL);
  });

  test("insistir no acumula eventos", () => {
    const ct = enConflicto();
    for (let i = 0; i < 3; i++) {
      activar(ct, {
        fechaReferencia: "2027-07-01", respaldo: "Otro", reglaFecha: "pago",
        reglaFechaRespaldo: "Otra", puedeEditar: true, usuarioActual: USUARIO, confirmado: true,
      });
    }
    expect(ct.reajusteActivacion.historial.length).toBe(1);
  });

  test("al retirar la configuración antigua NO aparece la diferencia diferida", () => {
    // Ésta es la comprobación que importa: el daño del defecto era DIFERIDO.
    const ct = enConflicto();
    activar(ct, {
      fechaReferencia: "2027-07-01", respaldo: "Otro", reglaFecha: "pago",
      reglaFechaRespaldo: "Otra", puedeEditar: true, usuarioActual: USUARIO, confirmado: true,
    });
    // Retirada sintética de la configuración antigua: ahora manda el sello.
    const despues = sinLaAntigua(ct);
    expect(estadoActivacion(despues).activo).toBe(true);
    expect(estadoActivacion(despues).fechaReferencia).toBe("2026-07-01");
    // Con el sello original: 655.240,69. Con el resellado habría sido
    // 644.861,66, es decir 10.379,03 menos, anunciados como "US$ 0,00".
    expect(total(despues)).toBeCloseTo(655240.69, 2);
    expect(total(despues)).not.toBeCloseTo(644861.66, 2);
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
