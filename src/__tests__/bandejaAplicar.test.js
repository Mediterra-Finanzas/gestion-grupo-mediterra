/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// APLICAR UN MOVIMIENTO DE LA BANDEJA
//
// Distinto de una reasignación: un movimiento sin asignar todavía NO
// descontaba ninguna liquidación. Al aplicarlo, el realizado aplicado y
// el saldo económico SÍ cambian. Lo que no aumenta es el total del
// dinero registrado: el movimiento se consume, no se duplica.
//
// Los resultados esperados van escritos a mano, no tomados de lo que
// devuelve el componente ni del propio modelo.
// ═══════════════════════════════════════════════════════════════════
import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import ProgramasPanel from "../ProgramasComerciales.jsx";
import {
  aplicarMovimiento, aplicadoDeMovimiento, sinAplicarDeMovimiento,
  anularMovimientoSinAsignar, nuevoMovimientoSinAsignar, resumenLado, MODELO_VERSION,
} from "../programas.js";
import { anularRealizacion, realizacionesVigentes, normalizarAnticipo } from "../anticipos.js";
import { MESES, mIdx } from "../horizonte.js";

const KG = 500000, BASE = 1000000, V = MODELO_VERSION;
const MOV = { id:"mov1", fecha:"2026-08-14", usd:100000, referencia:"cartola 7731",
              lado:"cliente", aplicaciones:[] };
const est = (id, mes, usd, reas=[]) => ({ id, mes, usd_kg:usd/KG, v:V, realizaciones:reas });
const cuota = (id, mes, monto, reas=[]) => ({ id, modalidad:"monto", monto, estado:"vigente", v:V,
  fecha_prevista:"", mes, mes_estimado:true, sustituye:[], realizaciones:reas });
const prog = (id, nombre, cuotas) => ({ id, lado:"cliente", contraparte:nombre, kilos:KG, cuotas });
const res = (e,pr,sa=[]) => resumenLado({ estimaciones:e, programas:pr, lado:"cliente", kgFruta:KG,
  basePresupuesto:BASE, mIdx, mesIdxActual:mIdx("Oct-26"), mesLiquidacion:"Mar-27",
  modeloVersion:V, decisionesSinFecha:{}, sinAsignar:sa });

describe("bandeja · aplicar a una estimación o cuota", () => {
  test("ESPERADO: antes de aplicar no descuenta nada", () => {
    const E=[est("e1","Nov-26",200000)], P=[prog("p1","WLH",[cuota("c1","Nov-26",120000)])];
    const r=res(E,P,[MOV]);
    expect(Math.round(r.realizado)).toBe(0);              // nada cobrado
    expect(Math.round(r.pendientes)).toBe(320000);        // 200.000 + 120.000
    expect(Math.round(r.liquidacion)).toBe(680000);       // 1.000.000 − 320.000
    expect(Math.round(r.sinAsignarUsd)).toBe(100000);     // la bandeja, entera
  });

  test("aplicar 60.000 a la cuota: ESPERADO realizado 60.000, cuota pendiente 60.000, liq 680.000", () => {
    const E=[est("e1","Nov-26",200000)], P=[prog("p1","WLH",[cuota("c1","Nov-26",120000)])];
    const ap=aplicarMovimiento({ movimiento:MOV, estimaciones:E, programas:P, usd:60000,
      hacia:{tipo:"cuota",id:"c1"}, usuario:"angelo" });
    const r=res(ap.estimaciones, ap.programas, [MOV]);
    expect(Math.round(r.realizado)).toBe(60000);
    expect(Math.round(r.pendientes)).toBe(260000);        // 200.000 + (120.000 − 60.000)
    expect(Math.round(r.liquidacion)).toBe(680000);       // 1.000.000 − 60.000 − 260.000
    expect(Math.round(r.saldoEconomico)).toBe(940000);    // 1.000.000 − 60.000
    // Y la bandeja ahora muestra solo lo que queda.
    expect(Math.round(ap.aplicado)).toBe(60000);
    expect(Math.round(ap.sinAplicar)).toBe(40000);
    expect(Math.round(r.sinAsignarUsd)).toBe(40000);
  });

  test("la realización conserva identidad, fecha, referencia y origen", () => {
    const E=[est("e1","Nov-26",200000)], P=[prog("p1","WLH",[cuota("c1","Nov-26",120000)])];
    const ap=aplicarMovimiento({ movimiento:MOV, estimaciones:E, programas:P, usd:60000,
      hacia:{tipo:"estimacion",id:"e1"}, usuario:"angelo" });
    const r=realizacionesVigentes(normalizarAnticipo(ap.estimaciones[0]))[0];
    expect(r.usd).toBe(60000);
    expect(r.fecha).toBe("2026-08-14");                   // la del movimiento, no hoy
    expect(r.nota).toBe("bandeja · cartola 7731");        // la referencia viaja
    expect(r.origen).toEqual({ tipo:"bandeja", id:"mov1" });
    expect(r.usuario).toBe("angelo");
    expect(typeof r.ts).toBe("string");
  });

  test("el mismo dinero NO se aplica dos veces", () => {
    const E=[est("e1","Nov-26",200000)], P=[prog("p1","WLH",[cuota("c1","Nov-26",120000)])];
    const a1=aplicarMovimiento({ movimiento:MOV, estimaciones:E, programas:P, usd:60000,
      hacia:{tipo:"cuota",id:"c1"}, usuario:"a" });
    // Queda 40.000: aplicar 50.000 tiene que fallar.
    expect(() => aplicarMovimiento({ movimiento:MOV, estimaciones:a1.estimaciones,
      programas:a1.programas, usd:50000, hacia:{tipo:"estimacion",id:"e1"}, usuario:"a" }))
      .toThrow(/no se aplica dos veces/i);
    // Los 40.000 exactos sí.
    const a2=aplicarMovimiento({ movimiento:MOV, estimaciones:a1.estimaciones,
      programas:a1.programas, usd:40000, hacia:{tipo:"estimacion",id:"e1"}, usuario:"a" });
    expect(Math.round(a2.aplicado)).toBe(100000);
    expect(Math.round(a2.sinAplicar)).toBe(0);
    // Y el dinero registrado total es el del movimiento, ni un peso más.
    expect(Math.round(res(a2.estimaciones, a2.programas, [MOV]).realizado)).toBe(100000);
  });

  test("anular la realización libera el monto: no quedan datos huérfanos", () => {
    const E=[est("e1","Nov-26",200000)], P=[prog("p1","WLH",[cuota("c1","Nov-26",120000)])];
    const ap=aplicarMovimiento({ movimiento:MOV, estimaciones:E, programas:P, usd:60000,
      hacia:{tipo:"estimacion",id:"e1"}, usuario:"a" });
    expect(Math.round(aplicadoDeMovimiento("mov1", { estimaciones:ap.estimaciones, programas:ap.programas }))).toBe(60000);
    const reaId=realizacionesVigentes(normalizarAnticipo(ap.estimaciones[0]))[0].id;
    const estAnulada=anularRealizacion(ap.estimaciones[0], reaId, { motivo:"error de carga", usuario:"a" });
    const ctx={ estimaciones:[estAnulada], programas:ap.programas };
    expect(Math.round(aplicadoDeMovimiento("mov1", ctx))).toBe(0);
    expect(Math.round(sinAplicarDeMovimiento(MOV, ctx))).toBe(100000);   // vuelve entero a la bandeja
  });

  test("anular el movimiento exige motivo y se bloquea si tiene aplicaciones", () => {
    const E=[est("e1","Nov-26",200000)], P=[prog("p1","WLH",[cuota("c1","Nov-26",120000)])];
    expect(() => anularMovimientoSinAsignar(MOV, { motivo:"", estimaciones:E, programas:P }))
      .toThrow(/necesita un motivo/i);
    const ap=aplicarMovimiento({ movimiento:MOV, estimaciones:E, programas:P, usd:60000,
      hacia:{tipo:"cuota",id:"c1"}, usuario:"a" });
    expect(() => anularMovimientoSinAsignar(MOV, { motivo:"me equivoqué",
      estimaciones:ap.estimaciones, programas:ap.programas }))
      .toThrow(/ya aplicados|descuentos activos/i);
    // Sin aplicaciones sí, y NO se borra: queda con su motivo.
    const anu=anularMovimientoSinAsignar(MOV, { motivo:"duplicado de cartola", usuario:"angelo",
      estimaciones:E, programas:P });
    expect(anu.anulada).toBe(true);
    expect(anu.motivoAnulacion).toBe("duplicado de cartola");
    expect(anu.anuladaPor).toBe("angelo");
    expect(anu.usd).toBe(100000);                       // el dato original se conserva
    expect(Math.round(res(E,P,[anu]).sinAsignarUsd)).toBe(0);   // deja de contar
  });

  test("un movimiento anulado no se puede aplicar", () => {
    const anu=anularMovimientoSinAsignar(MOV, { motivo:"x", estimaciones:[], programas:[] });
    expect(() => aplicarMovimiento({ movimiento:anu, estimaciones:[], programas:[], usd:1,
      hacia:{tipo:"cuota",id:"c1"} })).toThrow(/anulado/i);
  });

  test("guardado y recarga: lo aplicado sobrevive al viaje a la base", () => {
    const E=[est("e1","Nov-26",200000)], P=[prog("p1","WLH",[cuota("c1","Nov-26",120000)])];
    const ap=aplicarMovimiento({ movimiento:MOV, estimaciones:E, programas:P, usd:60000,
      hacia:{tipo:"cuota",id:"c1"}, usuario:"angelo" });
    const antes=res(ap.estimaciones, ap.programas, [MOV]);
    const viaje=(x)=>JSON.parse(JSON.stringify(x));
    const E2=viaje(ap.estimaciones), P2=viaje(ap.programas), M2=viaje([MOV]);
    const despues=res(E2,P2,M2);
    for (const k of ["realizado","pendientes","liquidacion","saldoEconomico","sinAsignarUsd"])
      expect(Math.round(despues[k])).toBe(Math.round(antes[k]));
    expect(Math.round(aplicadoDeMovimiento("mov1", { estimaciones:E2, programas:P2 }))).toBe(60000);
  });
});

describe("bandeja · la pantalla", () => {
  const C = new Proxy({}, { get: () => "#808080" });
  const $$ = v => new Intl.NumberFormat("es-CL").format(Math.round(Number(v)||0));
  const pintar = (readOnly) => {
    const onChange=jest.fn(), onEst=jest.fn(), onSin=jest.fn();
    render(<ProgramasPanel programas={[prog("p1","WLH",[cuota("c1","Nov-26",120000)])]}
      estimaciones={{cliente:[est("e1","Nov-26",200000)], productor:[]}}
      sinAsignar={[MOV]} onSinAsignar={onSin}
      onChange={onChange} onEstimaciones={onEst} meses={MESES} kgFruta={KG}
      readOnly={readOnly} usuario="angelo" C={C} $$={$$} />);
    return { onChange, onEst, onSin };
  };

  test("muestra aplicado y sin asignar, con su efecto, y ya no existe «quitar»", () => {
    pintar(false);
    expect(screen.getByText(/aplicado 0/)).toBeInTheDocument();
    // Sin nada aplicado, el único importe que no descuenta es el total.
    expect(screen.getByText(/sin asignar 100\.000 · solo este importe no descuenta/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^quitar$/i })).toBeNull();
    expect(screen.getByRole("button", { name: /^aplicar$/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^anular$/i }).length).toBeGreaterThan(0);
  });

  test("el formulario de aplicar ofrece estimación Y cuota como destino", () => {
    const { onChange, onEst, onSin } = pintar(false);
    fireEvent.click(screen.getByRole("button", { name: /^aplicar$/i }));
    expect(screen.getByText(/estimación Nov-26 · acordado 200\.000/)).toBeInTheDocument();
    expect(screen.getByText(/cuota Nov-26 · WLH · acordado 120\.000/)).toBeInTheDocument();
    expect(screen.getByText(/Mientras está sin asignar, el movimiento no descuenta/i)).toBeInTheDocument();
    expect(screen.getByText(/descuenta de SU liquidación/i)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(onEst).not.toHaveBeenCalled();
    expect(onSin).not.toHaveBeenCalled();
  });

  test("cancelar no guarda nada", () => {
    const { onChange, onEst, onSin } = pintar(false);
    fireEvent.click(screen.getByRole("button", { name: /^aplicar$/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /^Cancelar$/i })[0]);
    expect(onChange).not.toHaveBeenCalled();
    expect(onEst).not.toHaveBeenCalled();
    expect(onSin).not.toHaveBeenCalled();
  });

  test("en solo lectura no hay aplicar ni anular", () => {
    pintar(true);
    expect(screen.getByText(/sin asignar 100\.000/)).toBeInTheDocument();   // se ve
    expect(screen.queryByRole("button", { name: /^aplicar$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^anular$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^quitar$/i })).toBeNull();
  });
});
