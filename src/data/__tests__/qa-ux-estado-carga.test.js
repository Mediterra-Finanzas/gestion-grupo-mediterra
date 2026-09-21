/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// QA UX · ESTADO DE CARGA Y TEXTOS DE ALERTAS (candidato diseño + alertas)
// ═══════════════════════════════════════════════════════════════════
//
// C-2 · falso verde: con el módulo cargando o con la carga fallida, el panel
// decía "No hay nada pendiente de decisión" sobre datos vacíos. Ahora hay tres
// estados y solo la carga exitosa sin alertas afirma que no hay pendientes.

import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
const fs = require("fs");
const path = require("path");

import PanelAlertas, { TEXTO_CARGA, normalizarEstadoCarga } from "../../ux/PanelAlertas";
import HomeEjecutivo from "../../ux/HomeEjecutivo";
import { alertasAccionables, ficha360, feeEntradaDeContrato, INSUF } from "../../ux/selectores";
import { DATOS_EJEMPLO, HOY_EJEMPLO } from "../../ux/ejemploDatos";

const NADA = /No hay nada pendiente de decisión/;

describe("PanelAlertas · tres estados de carga", () => {
  test("cargando: no afirma nada, anuncia la carga y no muestra filtros", () => {
    render(<PanelAlertas alertas={[]} estadoCarga="cargando" />);
    expect(screen.getByRole("status")).toHaveTextContent(TEXTO_CARGA.cargando);
    expect(screen.queryByText(NADA)).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /Filtrar alertas/i })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Alertas accionables" })).toHaveAttribute("aria-busy", "true");
  });

  test("error de carga: lo declara y no dice que no haya pendientes", () => {
    render(<PanelAlertas alertas={[]} estadoCarga="error" />);
    const aviso = screen.getByRole("alert");
    expect(aviso).toHaveTextContent(/No se pudieron cargar los datos/);
    expect(aviso).toHaveTextContent(/NO significa que no haya pendientes/);
    expect(screen.queryByText(NADA)).not.toBeInTheDocument();
  });

  test("carga exitosa sin alertas: recién ahí dice que no hay nada pendiente", () => {
    render(<PanelAlertas alertas={[]} estadoCarga="ok" />);
    expect(screen.getByText(NADA)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("error de carga con alertas viejas en memoria: tampoco las muestra como vigentes", () => {
    const alertas = alertasAccionables(DATOS_EJEMPLO, HOY_EJEMPLO);
    render(<PanelAlertas alertas={alertas} estadoCarga="error" maximo={99} />);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  test("fail-closed: sin estadoCarga o con un valor desconocido se trata como cargando", () => {
    expect(normalizarEstadoCarga(undefined)).toBe("cargando");
    expect(normalizarEstadoCarga("listo")).toBe("cargando");
    render(<PanelAlertas alertas={[]} />);
    expect(screen.queryByText(NADA)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("HomeEjecutivo · tres estados de carga", () => {
  test("cargando: sin indicadores ni tabla, y sin 'nada pendiente'", () => {
    render(<HomeEjecutivo datos={{}} usuario="Angelo" hoy={HOY_EJEMPLO} estadoCarga="cargando" />);
    expect(screen.getByRole("status")).toHaveTextContent(TEXTO_CARGA.cargando);
    expect(screen.queryByText(NADA)).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Indicadores del negocio")).not.toBeInTheDocument();
  });

  test("error: declara el fallo, sin indicadores en cero", () => {
    render(<HomeEjecutivo datos={{}} usuario="Angelo" hoy={HOY_EJEMPLO} estadoCarga="error" />);
    expect(screen.getByRole("alert")).toHaveTextContent(/No se pudieron cargar los datos/);
    expect(screen.queryByText(NADA)).not.toBeInTheDocument();
    expect(screen.queryAllByRole("article")).toHaveLength(0);
  });

  test("ok sin datos: afirma que no hay nada pendiente", () => {
    render(<HomeEjecutivo datos={{}} usuario="Angelo" hoy={HOY_EJEMPLO} estadoCarga="ok" />);
    expect(screen.getByText(NADA)).toBeInTheDocument();
  });

  test("ok con datos: muestra las alertas", () => {
    render(<HomeEjecutivo datos={DATOS_EJEMPLO} usuario="Angelo" hoy={HOY_EJEMPLO} estadoCarga="ok" />);
    expect(screen.queryByText(NADA)).not.toBeInTheDocument();
    expect(screen.getAllByText(/falta la firma/).length).toBeGreaterThan(0);
  });
});

describe("montaje · OsirisModule pasa la señal real de carga", () => {
  test("estadoCarga sale de cargandoOsiris y osirisCargaOk", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "..", "..", "OsirisModule.jsx"), "utf8");
    expect(src).toMatch(/<HomeEjecutivo [^>]*estadoCarga=\{cargandoOsiris\?"cargando":\(osirisCargaOk\?"ok":"error"\)\}/);
  });
});

describe("textos · alertas y ficha", () => {
  const alertas = alertasAccionables(DATOS_EJEMPLO, HOY_EJEMPLO);

  test("ninguna alerta dice 'devengando'", () => {
    for (const a of alertas) expect(`${a.titulo} ${a.porQue}`).not.toMatch(/deveng/i);
  });

  test("la ficha rotula 'Marcado pagado en el contrato' y ya no 'Contract fee pagado'", () => {
    const eco = ficha360(DATOS_EJEMPLO, "contrato", "ct1").secciones.find((s) => s.titulo === "Economía");
    const etiquetas = eco.campos.map((c) => c.etiqueta);
    expect(etiquetas).toContain("Marcado pagado en el contrato");
    expect(etiquetas).not.toContain("Contract fee pagado");
  });

  test("sin fila en Fee Entrada y contrato no marcado pagado: no se afirma coincidencia", () => {
    const b = JSON.parse(JSON.stringify(DATOS_EJEMPLO));
    b.contratos[0].contractFeePagado = false;
    b.feeEntrada = [];
    const eco = ficha360(b, "contrato", "ct1").secciones.find((s) => s.titulo === "Economía");
    expect(eco.campos.find((c) => c.etiqueta === "Contrato vs Fee Entrada").valor).toBe("Sin registro en Fee Entrada");
  });

  test("discrepancia contrato vs Fee Entrada: ct1 marcado pagado, sin fila en Fee Entrada", () => {
    const fe = feeEntradaDeContrato(DATOS_EJEMPLO, DATOS_EJEMPLO.contratos[0]);
    expect(fe).toMatchObject({ aplica: true, hayFila: false, pagadoFila: false, marcadoContrato: true, discrepa: true });
    const eco = ficha360(DATOS_EJEMPLO, "contrato", "ct1").secciones.find((s) => s.titulo === "Economía");
    expect(eco.campos.find((c) => c.etiqueta === "Contrato vs Fee Entrada").valor).toMatch(/Discrepan/);
    const a = alertas.find((x) => x.id === "fee_discrepancia:ct1");
    expect(a).toBeTruthy();
    expect(a.porQue).toMatch(/no se afirma pago ni deuda/);
    expect(a.porQue).not.toMatch(/\d{2}\.\d{3}/); // sin montos
  });

  test("Fee Entrada con fila pagada coincide y no alerta; la búsqueda usa ctId, id y fe_<id>", () => {
    for (const fila of [{ id: "x1", ctId: "ct1", pagado: true }, { id: "ct1", pagado: true }, { id: "fe_ct1", pagado: true }]) {
      const b = { ...DATOS_EJEMPLO, feeEntrada: [fila] };
      expect(feeEntradaDeContrato(b, b.contratos[0]).discrepa).toBe(false);
      expect(alertasAccionables(b, HOY_EJEMPLO).find((x) => x.id === "fee_discrepancia:ct1")).toBeUndefined();
    }
  });

  test("sin contract fee no aplica la comparación", () => {
    expect(feeEntradaDeContrato(DATOS_EJEMPLO, DATOS_EJEMPLO.contratos[2]).aplica).toBe(false);
  });

  test("dato ausente: las alertas declaran información insuficiente", () => {
    const b = {
      contratos: [{ id: "cx", razonSocial: "Sin Datos", plantaciones: [{ id: "p" }], valorRoyaltyComercial: 3000 }],
      obtentores: [{ id: "ox", obtentor: "Obt Sin Datos" }],
      viveros: [{ id: "vx", viverista: "Viv Sin Datos" }],
    };
    const al = alertasAccionables(b, HOY_EJEMPLO);
    const porId = (id) => al.find((x) => x.id === id);
    for (const id of ["firma_sindato:cx", "vigencia_sindato:cx", "tarifa_rp:cx", "mes_rc:cx", "plantas_sindato:cx",
                      "anexo1:cx", "participacion:ox", "obt_vigencia_sindato:ox", "pbr:ox", "viv_vigencia_sindato:vx"]) {
      expect([id, !!porId(id)]).toEqual([id, true]);
      expect([id, porId(id).porQue.startsWith(INSUF)]).toEqual([id, true]);
    }
  });

  test("dato explícito (cero o falso) no se rotula como insuficiente", () => {
    const al = alertasAccionables(DATOS_EJEMPLO, HOY_EJEMPLO);
    expect(al.find((x) => x.id === "tarifa_rp:ct3").porQue.startsWith(INSUF)).toBe(false);
    expect(al.find((x) => x.id === "firma:ct2").porQue).not.toMatch(/insuficiente/);
    expect(al.find((x) => x.id === "anexo1:ct2").porQue.startsWith(INSUF)).toBe(false);
  });
});
