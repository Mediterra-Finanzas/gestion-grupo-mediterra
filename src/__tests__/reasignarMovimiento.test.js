/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// REASIGNAR UN MOVIMIENTO YA REGISTRADO
//
// Las tres direcciones que el modelo soporta, con la identidad del
// movimiento intacta y el realizado total sin moverse. Datos sintéticos.
// ═══════════════════════════════════════════════════════════════════
import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import ProgramasPanel from "../ProgramasComerciales.jsx";
import { moverRealizacion, resumenLado, estPendiente, MODELO_VERSION } from "../programas.js";
import { realizacionesVigentes, normalizarAnticipo } from "../anticipos.js";
import { MESES, mIdx } from "../horizonte.js";

const KG = 500000, BASE = 1000000, V = MODELO_VERSION;
const REA = { id:"r1", fecha:"2026-07-15", usd:120000, nota:"cartola 881", usuario:"angelo" };

const est = (id, mes, usd, reas=[]) => ({ id, mes, usd_kg:usd/KG, v:V, realizaciones:reas });
const cuota = (id, mes, monto, reas=[]) => ({ id, modalidad:"monto", monto, estado:"vigente", v:V,
  fecha_prevista:"", mes, mes_estimado:true, sustituye:[], realizaciones:reas });
const prog = (id, nombre, cuotas) => ({ id, lado:"cliente", contraparte:nombre, kilos:KG, cuotas });

const ctx = { lado:"cliente", kgFruta:KG, basePresupuesto:BASE, mIdx,
  mesIdxActual:mIdx("Oct-26"), mesLiquidacion:"Mar-27", modeloVersion:V,
  decisionesSinFecha:{}, temporada:"2026-2027", fruta:"cerezas" };
const res = (e,pr) => resumenLado({ ...ctx, estimaciones:e, programas:pr });
const buscarRea = (e, pr, id) => {
  for (const x of e.map(normalizarAnticipo)) { const r = realizacionesVigentes(x).find(z=>z.id===id); if (r) return { r, en:{tipo:"estimacion", id:x.id} }; }
  for (const x of pr) for (const c of x.cuotas) { const r=(c.realizaciones||[]).find(z=>z&&z.id===id&&!z.anulada); if (r) return { r, en:{tipo:"cuota", id:c.id} }; }
  return null;
};
const identidadIgual = (a,b) => a.id===b.id && a.usd===b.usd && a.fecha===b.fecha && a.nota===b.nota;

describe("reasignar · las tres direcciones del modelo", () => {
  test("estimación → cuota: identidad intacta, realizado igual, pendientes se corrigen", () => {
    const E=[est("e1","Nov-26",200000,[REA])], P=[prog("p1","WLH",[cuota("c1","Nov-26",120000)])];
    const antes=res(E,P);
    const mv=moverRealizacion({ estimaciones:E, programas:P, reaId:"r1",
      desde:{tipo:"estimacion",id:"e1"}, hacia:{tipo:"cuota",id:"c1"}, usuario:"angelo" });
    const d=res(mv.estimaciones, mv.programas);
    const enc=buscarRea(mv.estimaciones, mv.programas, "r1");
    expect(enc.en).toEqual({tipo:"cuota", id:"c1"});
    expect(identidadIgual(enc.r, REA)).toBe(true);
    expect(enc.r.origen).toEqual({tipo:"estimacion", id:"e1"});     // historial del movimiento
    expect(Math.round(d.realizado)).toBe(Math.round(antes.realizado));   // el dinero no se mueve
    expect(Math.round(d.realizado)).toBe(120000);
    // La estimación de origen NO reabre su pendiente: sigue en 80.000 (200.000
    // acordados menos los 120.000 que originó, estén donde estén).
    const estDesp = mv.estimaciones.map(normalizarAnticipo).find(x=>x.id==="e1");
    expect(Math.round(estPendiente(estDesp, KG, mv.programas))).toBe(80000);
    // Y la cuota destino queda cubierta: era el pendiente fantasma.
    expect(Math.round(antes.pendientes)).toBe(200000);   // est 80.000 + cuota 120.000
    expect(Math.round(d.pendientes)).toBe(80000);        // est 80.000 + cuota 0
  });

  test("cuota → estimación: lo que la pantalla NO permitía", () => {
    const E=[est("e1","Nov-26",200000)], P=[prog("p1","WLH",[cuota("c1","Nov-26",120000,[REA])])];
    const antes=res(E,P);
    const mv=moverRealizacion({ estimaciones:E, programas:P, reaId:"r1",
      desde:{tipo:"cuota",id:"c1"}, hacia:{tipo:"estimacion",id:"e1"}, usuario:"angelo" });
    const d=res(mv.estimaciones, mv.programas);
    const enc=buscarRea(mv.estimaciones, mv.programas, "r1");
    expect(enc.en).toEqual({tipo:"estimacion", id:"e1"});
    expect(identidadIgual(enc.r, REA)).toBe(true);
    expect(enc.r.origen).toEqual({tipo:"cuota", id:"c1"});
    expect(Math.round(d.realizado)).toBe(Math.round(antes.realizado));
    expect(Math.round(d.realizado)).toBe(120000);
    // Cambia QUÉ pendiente se corrige: la estimación baja, la cuota vuelve a su acordado.
    expect(Math.round(antes.pendientes)).toBe(200000);   // est 200.000 + cuota 0
    expect(Math.round(d.pendientes)).toBe(200000);       // est 80.000 + cuota 120.000
  });

  test("cuota → cuota: entre contrapartes distintas", () => {
    const E=[], P=[prog("p1","WLH",[cuota("c1","Nov-26",120000,[REA])]),
                   prog("p2","SNF",[cuota("c2","Dec-26",120000)])];
    const antes=res(E,P);
    const mv=moverRealizacion({ estimaciones:E, programas:P, reaId:"r1",
      desde:{tipo:"cuota",id:"c1"}, hacia:{tipo:"cuota",id:"c2"}, usuario:"angelo" });
    const d=res(mv.estimaciones, mv.programas);
    const enc=buscarRea(mv.estimaciones, mv.programas, "r1");
    expect(enc.en).toEqual({tipo:"cuota", id:"c2"});
    expect(identidadIgual(enc.r, REA)).toBe(true);
    expect(Math.round(d.realizado)).toBe(Math.round(antes.realizado));
    expect(Math.round(d.realizado)).toBe(120000);
  });

  test("estimación → estimación sigue prohibido", () => {
    const E=[est("e1","Nov-26",200000,[REA]), est("e2","Dec-26",200000)];
    expect(() => moverRealizacion({ estimaciones:E, programas:[], reaId:"r1",
      desde:{tipo:"estimacion",id:"e1"}, hacia:{tipo:"estimacion",id:"e2"}, usuario:"a" }))
      .toThrow(/no se pasa de una estimación a otra/i);
  });

  // El número que la pantalla muestra antes de confirmar sale del MISMO
  // `resumenLado` que alimenta el flujo y el Excel. Esta prueba fija eso:
  // si alguien lo reemplaza por una regla replicada, falla.
  test.each([
    ["est → cuota",            [est("e1","Nov-26",200000,[REA])], [prog("p1","WLH",[cuota("c1","Nov-26",120000)])], {tipo:"estimacion",id:"e1"}, {tipo:"cuota",id:"c1"}],
    ["cuota → est",            [est("e1","Nov-26",200000)],       [prog("p1","WLH",[cuota("c1","Nov-26",120000,[REA])])], {tipo:"cuota",id:"c1"}, {tipo:"estimacion",id:"e1"}],
    ["cuota → cuota con mes",  [],                                [prog("p1","WLH",[cuota("c1","Nov-26",120000,[REA])]), prog("p2","SNF",[cuota("c2","Dec-26",120000)])], {tipo:"cuota",id:"c1"}, {tipo:"cuota",id:"c2"}],
    ["cuota → cuota SIN mes",  [],                                [prog("p1","WLH",[cuota("c1","Nov-26",120000,[REA]), cuota("c2","",120000)])], {tipo:"cuota",id:"c1"}, {tipo:"cuota",id:"c2"}],
    ["est → cuota SIN mes",    [est("e1","Nov-26",200000,[REA])], [prog("p1","WLH",[cuota("c1","",120000)])], {tipo:"estimacion",id:"e1"}, {tipo:"cuota",id:"c1"}],
  ])("el efecto mostrado es el del modelo · %s", (_n, E, P, desde, hacia) => {
    const antes=res(E,P);
    const mv=moverRealizacion({ estimaciones:E, programas:P, reaId:"r1", desde, hacia, usuario:"a" });
    const d=res(mv.estimaciones, mv.programas);
    // Lo que la pantalla afirma en el diálogo:
    expect(Math.round(d.realizado)).toBe(Math.round(antes.realizado));   // realizado total intacto
    expect(Math.round(d.realizado)).toBe(120000);
    // Y el delta de liquidación que muestra es exactamente este:
    const dLiq = d.liquidacion - antes.liquidacion;
    expect(Number.isFinite(dLiq)).toBe(true);
    // El cuadre del lado sigue cerrando después de mover.
    expect(Math.round(d.realizado + d.pendientes + d.pendienteDeCalendarizar + d.liquidacion))
      .toBe(Math.round(antes.realizado + antes.pendientes + antes.pendienteDeCalendarizar + antes.liquidacion));
  });
});

describe("reasignar · guardado y recarga", () => {
  test("lo reasignado sobrevive al viaje a la base y vuelve igual", () => {
    const E=[est("e1","Nov-26",200000,[REA])], P=[prog("p1","WLH",[cuota("c1","Nov-26",120000)])];
    const mv=moverRealizacion({ estimaciones:E, programas:P, reaId:"r1",
      desde:{tipo:"estimacion",id:"e1"}, hacia:{tipo:"cuota",id:"c1"}, usuario:"angelo" });
    const antesDeGuardar=res(mv.estimaciones, mv.programas);
    // Lo que se guarda en `calendario_data` es JSON. Ida y vuelta completa.
    const viaje = (x) => JSON.parse(JSON.stringify(x));
    const E2=viaje(mv.estimaciones), P2=viaje(mv.programas);
    const despuesDeCargar=res(E2,P2);
    for (const k of ["realizado","pendientes","liquidacion","saldoEconomico",
                     "totalCalendarizado","pendienteDeCalendarizar"])
      expect(Math.round(despuesDeCargar[k])).toBe(Math.round(antesDeGuardar[k]));
    // La identidad y el historial del movimiento sobreviven al viaje.
    const enc=buscarRea(E2,P2,"r1");
    expect(enc.en).toEqual({tipo:"cuota", id:"c1"});
    expect(identidadIgual(enc.r, REA)).toBe(true);
    expect(enc.r.origen).toEqual({tipo:"estimacion", id:"e1"});
    expect(enc.r.movidaPor).toBe("angelo");
    expect(typeof enc.r.movidaTs).toBe("string");
    // Y no quedó copia en la estimación de origen.
    expect(realizacionesVigentes(normalizarAnticipo(E2[0])).length).toBe(0);
  });

  test("reasignar dos veces no multiplica el dinero", () => {
    const E=[est("e1","Nov-26",200000,[REA])],
          P=[prog("p1","WLH",[cuota("c1","Nov-26",120000)]), prog("p2","SNF",[cuota("c2","Dec-26",120000)])];
    const m1=moverRealizacion({ estimaciones:E, programas:P, reaId:"r1",
      desde:{tipo:"estimacion",id:"e1"}, hacia:{tipo:"cuota",id:"c1"}, usuario:"a" });
    const m2=moverRealizacion({ estimaciones:m1.estimaciones, programas:m1.programas, reaId:"r1",
      desde:{tipo:"cuota",id:"c1"}, hacia:{tipo:"cuota",id:"c2"}, usuario:"a" });
    const d=res(m2.estimaciones, m2.programas);
    expect(Math.round(d.realizado)).toBe(120000);          // sigue contado UNA vez
    const enc=buscarRea(m2.estimaciones, m2.programas, "r1");
    expect(enc.en).toEqual({tipo:"cuota", id:"c2"});
    expect(identidadIgual(enc.r, REA)).toBe(true);
    // El origen registrado es el primero: la trazabilidad no se pisa.
    expect(enc.r.origen).toEqual({tipo:"estimacion", id:"e1"});
  });
});

describe("reasignar · la pantalla", () => {
  const C = new Proxy({}, { get: () => "#808080" });
  const $$ = v => new Intl.NumberFormat("es-CL").format(Math.round(Number(v)||0));
  const pintar = (readOnly) => {
    const E=[est("e1","Nov-26",200000,[REA])];
    const P=[prog("p1","WLH",[cuota("c1","Nov-26",120000)])];
    const onChange=jest.fn(), onEst=jest.fn();
    render(<ProgramasPanel programas={P} estimaciones={{cliente:E, productor:[]}}
      onChange={onChange} onEstimaciones={onEst} meses={MESES} kgFruta={KG}
      readOnly={readOnly} usuario="angelo" C={C} $$={$$} />);
    return { onChange, onEst };
  };

  test("en solo lectura no aparece el botón de reasignar", () => {
    pintar(true);
    expect(screen.queryByRole("button", { name: /asociar|reasignar/i })).toBeNull();
    expect(screen.queryByText(/Reasignar un movimiento ya registrado/i)).toBeNull();
  });

  test("en edición el formulario ofrece origen y destino, y no escribe hasta confirmar", () => {
    const { onChange, onEst } = pintar(false);
    fireEvent.click(screen.getByRole("button", { name: /asociar/i }));
    expect(screen.getByText(/Reasignar un movimiento ya registrado/i)).toBeInTheDocument();
    // El origen ofrece el movimiento que está en la estimación.
    expect(screen.getByText(/estimación Nov-26 · 2026-07-15 · 120\.000/)).toBeInTheDocument();
    // El destino ofrece la estimación Y la cuota: las dos direcciones.
    expect(screen.getByText(/estimación Nov-26 · acordado 200\.000/)).toBeInTheDocument();
    expect(screen.getByText(/cuota Nov-26 · WLH · acordado 120\.000/)).toBeInTheDocument();
    // Abrir el formulario no guarda nada.
    expect(onChange).not.toHaveBeenCalled();
    expect(onEst).not.toHaveBeenCalled();
  });

  test("cancelar no guarda nada", () => {
    const { onChange, onEst } = pintar(false);
    fireEvent.click(screen.getByRole("button", { name: /asociar/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Cancelar$/i }));
    expect(onChange).not.toHaveBeenCalled();
    expect(onEst).not.toHaveBeenCalled();
  });
});
