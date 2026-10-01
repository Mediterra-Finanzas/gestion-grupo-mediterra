/* eslint-disable */
// Impacto ANTES/DESPUÉS de las condiciones configurables, sobre COPIA de datos
// reales. Ninguna de las tres puede mover un importe mientras no se confirme,
// y aun confirmada, configurar no recalcula nada por sí solo.
//
//   OSIRIS_SNAPSHOT=/ruta/osiris.json npx react-scripts test --testMatch '**/src/osiris/impactoCondiciones.test.js' --watchAll=false
import fs from "fs";
import {
  derivarRoyaltyPlantaDesdeContratos,
  derivarRoyaltyComercialDesdeContratos,
  ocLigadaAContrato,
} from "../OsirisModule";
import { estadoBeneficio, estadoReajuste, resolverRetencion, territorioDe, cambiarPais, REINO_UNIDO } from "./condicionesConfigurables";

const RUTA = process.env.OSIRIS_SNAPSHOT;
const hay = !!RUTA && fs.existsSync(RUTA);
const d = hay ? describe : describe.skip;
const pctPorPais = (p) => (p === "Chile" ? 1 : 0.85);

const mapaOCs = (contratos, viveros) => {
  const todas = [];
  (viveros || []).forEach((v) => (v.ordenesCompra || []).forEach((o) => todas.push(o)));
  const m = {};
  (contratos || []).forEach((ct) => {
    const suyas = todas.filter((o) => ocLigadaAContrato(o, ct, contratos));
    if (suyas.length) m[ct.id] = suyas;
  });
  return m;
};
const totales = (contratos, viveros) => {
  const ocs = mapaOCs(contratos, viveros);
  const suma = (f) => Math.round(f.reduce((s, x) => s + (Number(x.montoFact) || 0), 0) * 100) / 100;
  const sumaNeto = (f) => Math.round(f.reduce((s, x) => s + (Number(x.montoCobro) || 0), 0) * 100) / 100;
  const rp = derivarRoyaltyPlantaDesdeContratos(contratos, ocs);
  const rc = derivarRoyaltyComercialDesdeContratos(contratos, ocs);
  return { rpFact: suma(rp), rpNeto: sumaNeto(rp), rcFact: suma(rc), rcNeto: sumaNeto(rc), filas: rp.length + rc.length };
};

d("impacto de las condiciones configurables", () => {
  const v = hay ? JSON.parse(fs.readFileSync(RUTA, "utf8")) : {};
  const contratos = v.contratos || [];
  const viveros = v.viveros || [];
  const base = hay ? totales(contratos, viveros) : null;
  const informe = { generado: new Date().toISOString(), contratos: contratos.length };

  test("línea base", () => { informe.antes = base; expect(base.filas).toBeGreaterThan(0); });

  test("hoy ningún contrato tiene estas condiciones cargadas", () => {
    informe.estadoActual = {
      conBeneficioDeclarado: contratos.filter((c) => estadoBeneficio(c) !== "sinBeneficio").length,
      reajustePendiente: contratos.filter((c) => estadoReajuste(c) === "pendiente").length,
      reajusteNoDeclarado: contratos.filter((c) => estadoReajuste(c) === "noDeclarado").length,
      territorioSinDeclarar: contratos.filter((c) => territorioDe(c).estado === "pendiente").length,
      retencionPendiente: contratos.filter((c) => resolverRetencion(c, pctPorPais).estado === "pendiente").length,
    };
    expect(informe.estadoActual.conBeneficioDeclarado).toBe(0);
    // Las 18 marcas antiguas de inflación quedan visibles como pendientes, no en cero.
    expect(informe.estadoActual.reajustePendiente).toBeGreaterThan(0);
    // Ningún cliente es de un país sin tratamiento: hoy no hay retenciones pendientes.
    expect(informe.estadoActual.retencionPendiente).toBe(0);
  });

  test("declarar el beneficio del fee sin confirmarlo no mueve ningún importe", () => {
    const con = contratos.map((c) => ({ ...c, beneficioFee: { declarado: true, plantasCubiertas: 30000, alcance: "solo_este" } }));
    informe.conBeneficioDeclarado = totales(con, viveros);
    expect(informe.conBeneficioDeclarado).toEqual(base);
    expect(con.every((c) => estadoBeneficio(c) === "pendiente")).toBe(true);
  });

  test("configurar y confirmar un reajuste no recalcula nada por sí solo", () => {
    const con = contratos.map((c) => ({ ...c, reajuste: { tipo: "porcentaje", pct: 2, desde: "2026-04-15", referencia: "prueba", confirmado: true } }));
    informe.conReajusteConfirmado = totales(con, viveros);
    expect(informe.conReajusteConfirmado).toEqual(base);
  });

  test("declarar el territorio contractual no mueve ningún importe", () => {
    const con = contratos.map((c) => ({ ...c, territorio: "Perú" }));
    informe.conTerritorio = totales(con, viveros);
    expect(informe.conTerritorio).toEqual(base);
  });

  test("cambiar un cliente a Reino Unido no asigna retención: queda pendiente y el neto deja de ser definitivo", () => {
    const primero = contratos[0];
    const cambiado = cambiarPais(primero, REINO_UNIDO);
    const r = resolverRetencion(cambiado, pctPorPais);
    expect(r.estado).toBe("pendiente");
    expect(r.pct).toBeNull();
    expect(r.definitivo).toBe(false);
    expect(cambiado.retencionPct).toBeUndefined();
    informe.reinoUnido = { contrato: primero.razonSocial, estadoRetencion: r.estado, pctVigenteDelMotor: r.pctVigente, definitivo: r.definitivo };
  });

  afterAll(() => {
    const salida = process.env.OSIRIS_IMPACTO_OUT;
    if (salida) fs.writeFileSync(salida, JSON.stringify(informe, null, 1), "utf8");
    // eslint-disable-next-line no-console
    console.log("IMPACTO CONDICIONES\n" + JSON.stringify(informe, null, 1));
  });
});
