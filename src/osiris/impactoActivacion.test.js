/* eslint-disable */
// Impacto de la entrega B sobre una COPIA de los contratos reales.
//
// Lo que tiene que demostrar: mientras no haya ninguna activación en los
// datos, el paquete no mueve un peso. Y que efectivamente no hay ninguna.
//
//   OSIRIS_SNAPSHOT=/ruta/osiris.json npx react-scripts test --testMatch '**/src/osiris/impactoActivacion.test.js' --watchAll=false

import fs from "fs";
import { derivarRoyaltyComercialDesdeContratos, ocLigadaAContrato } from "../OsirisModule";
import {
  estadoActivacion, puedeCrearActivacion, puedeEditarTerminos,
  antecedentesDeCobro, ACTIVADO, MODIFICACION_PENDIENTE, CONFLICTO_CON_ANTIGUA,
} from "./reajusteAplicado";

const RUTA = process.env.OSIRIS_SNAPSHOT;
const hay = !!RUTA && fs.existsSync(RUTA);
const d = hay ? describe : describe.skip;
const r2 = (n) => Math.round(n * 100) / 100;

d("impacto de la activación sobre los contratos reales", () => {
  const v = hay ? JSON.parse(fs.readFileSync(RUTA, "utf8")) : {};
  const contratos = (v.contratos || []).filter((c) => c.id !== "ct_sintetico_b");
  const viveros = v.viveros || [];
  const informe = { contratos: contratos.length };

  const ocsPorContrato = () => {
    const todas = [];
    viveros.forEach((vv) => (vv.ordenesCompra || []).forEach((o) => todas.push(o)));
    const m = {};
    contratos.forEach((ct) => { m[ct.id] = todas.filter((o) => ocLigadaAContrato(o, ct, contratos)); });
    return m;
  };
  const ocs = ocsPorContrato();
  const totales = (lista) => {
    const filas = derivarRoyaltyComercialDesdeContratos(lista, ocs);
    // Nombres honestos: son importes CALCULADOS por el motor, no facturacion
    // emitida ni cobros acreditados.
    return {
      filas: filas.length,
      brutoCalculado: r2(filas.reduce((s, f) => s + (f.montoFact || 0), 0)),
      netoCalculado: r2(filas.reduce((s, f) => s + (f.montoCobro || 0), 0)),
    };
  };

  test("hay contratos para medir", () => {
    expect(contratos.length).toBeGreaterThan(0);
  });

  test("hoy NINGÚN contrato real tiene activación", () => {
    const conActivacion = contratos.filter((c) => c.reajusteActivacion && c.reajusteActivacion.activado);
    informe.conActivacion = conActivacion.map((c) => c.razonSocial);
    expect(conActivacion).toEqual([]);
  });

  test("y ninguno queda en estado activado, con modificación pendiente ni en conflicto", () => {
    const porEstado = {};
    contratos.forEach((c) => { const e = estadoActivacion(c).estado; porEstado[e] = (porEstado[e] || 0) + 1; });
    informe.porEstado = porEstado;
    expect(porEstado[ACTIVADO] || 0).toBe(0);
    expect(porEstado[MODIFICACION_PENDIENTE] || 0).toBe(0);
    expect(porEstado[CONFLICTO_CON_ANTIGUA] || 0).toBe(0);
  });

  test("los totales calculados del royalty comercial no se mueven", () => {
    // Importes BRUTOS y NETOS calculados por el motor. No son facturas
    // emitidas ni cobros acreditados: el motor no sabe nada de eso.
    const base = totales(contratos);
    informe.totales = base;
    // Mirar el estado de activación de cada contrato no puede cambiar nada.
    contratos.forEach((c) => { estadoActivacion(c); puedeEditarTerminos(c); });
    const despues = totales(contratos);
    expect(despues).toEqual(base);
  });

  test("ningún contrato se muta al evaluarlo", () => {
    const copia = JSON.parse(JSON.stringify(contratos));
    contratos.forEach((c) => { estadoActivacion(c); puedeEditarTerminos(c); antecedentesDeCobro((c.rcPagos || {})["2026/2027"]); });
    expect(contratos).toEqual(copia);
  });

  test("todos los contratos pueden editar sus términos: no hay ninguno bloqueado", () => {
    // El bloqueo solo aparece con una activación. Hoy no hay.
    const bloqueados = contratos.filter((c) => !puedeEditarTerminos(c).puede);
    informe.bloqueados = bloqueados.map((c) => c.razonSocial);
    expect(bloqueados).toEqual([]);
  });

  test("las temporadas con antecedentes de factura o pago quedan identificadas", () => {
    // No cambia nada hoy, pero es la lista que quedaría protegida el día que
    // se active algo. Conviene saber cuántas son.
    const protegidas = [];
    contratos.forEach((c) => {
      Object.keys(c.rcPagos || {}).forEach((t) => {
        const a = antecedentesDeCobro(c.rcPagos[t]);
        if (a.hay) protegidas.push({ contrato: c.razonSocial, temporada: t, motivos: a.motivos });
      });
    });
    informe.filasProtegidas = protegidas;
    expect(Array.isArray(protegidas)).toBe(true);
  });

  test("la versión dice lo que hace con la creación de activaciones", () => {
    // Esta suite corre en las dos versiones cuando hay snapshot, así que la
    // afirmación tiene que depender de la bandera, no darla por supuesta.
    const { ACTIVACIONES_NUEVAS_HABILITADAS } = require("./reajusteAplicado");
    expect(puedeCrearActivacion().puede).toBe(ACTIVACIONES_NUEVAS_HABILITADAS);
    if (!ACTIVACIONES_NUEVAS_HABILITADAS) {
      expect(puedeCrearActivacion().motivo).toMatch(/no permite crear nuevas/);
    }
  });

  afterAll(() => {
    // eslint-disable-next-line no-console
    console.log("IMPACTO ACTIVACION\n" + JSON.stringify(informe, null, 1));
  });
});
