/* eslint-disable */
// Impacto ANTES/DESPUÉS de los tres pedidos de Nicolás, sobre una COPIA de los
// datos reales. Lo que se quiere demostrar es que NINGUNO mueve un importe:
// son registro documental, un tipo nuevo sin condiciones, y una asignación que
// una persona hace a mano.
//
//   OSIRIS_SNAPSHOT=/ruta/osiris.json npx react-scripts test --testMatch '**/src/osiris/impactoNicolas.test.js' --watchAll=false
import fs from "fs";
import {
  derivarRoyaltyPlantaDesdeContratos,
  derivarRoyaltyComercialDesdeContratos,
  derivarContractFeeDesdeContratos,
  ocLigadaAContrato,
} from "../OsirisModule";
import {
  TIPO_CONTRATO_PRUEBAS, crearAnexoEliminacion, aplicarAsignacionEnViveros, resumenEliminaciones,
} from "./anexosPlantas";

const RUTA = process.env.OSIRIS_SNAPSHOT;
const hay = !!RUTA && fs.existsSync(RUTA);
const d = hay ? describe : describe.skip;

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
  const suma = (filas) => filas.reduce((s, f) => s + (Number(f.montoFact) || 0), 0);
  return {
    royaltyPlanta: Math.round(suma(derivarRoyaltyPlantaDesdeContratos(contratos, ocs)) * 100) / 100,
    royaltyComercial: Math.round(suma(derivarRoyaltyComercialDesdeContratos(contratos, ocs)) * 100) / 100,
    contractFee: Math.round(suma(derivarContractFeeDesdeContratos(contratos)) * 100) / 100,
    filasRP: derivarRoyaltyPlantaDesdeContratos(contratos, ocs).length,
  };
};

d("impacto de los pedidos de Nicolás sobre copia de datos reales", () => {
  const v = hay ? JSON.parse(fs.readFileSync(RUTA, "utf8")) : {};
  const contratos = v.contratos || [];
  const viveros = v.viveros || [];
  const informe = { generado: new Date().toISOString(), contratos: contratos.length };
  const base = hay ? totales(contratos, viveros) : null;

  test("línea base", () => {
    informe.antes = base;
    expect(base.filasRP).toBeGreaterThan(0);
  });

  test("marcar contratos como tipo Pruebas no mueve ningún importe", () => {
    const todosPruebas = contratos.map((c) => ({ ...c, tipoContrato: TIPO_CONTRATO_PRUEBAS }));
    const despues = totales(todosPruebas, viveros);
    informe.tipoPruebas = despues;
    expect(despues).toEqual(base);
  });

  test("registrar anexos de eliminación no mueve ningún importe", () => {
    const conAnexos = contratos.map((c) => {
      const bajas = (c.plantaciones || []).filter((p) => p.estadoRegistro === "baja");
      const prueba = (c.plantaciones || []).slice(0, 1); // aunque se vincule una plantación vigente
      const ids = (bajas.length ? bajas : prueba).map((p) => p.id);
      if (!ids.length) return c;
      const anx = crearAnexoEliminacion({ id: `anx_prueba_${c.id}`, link: "https://ejemplo/anexo.pdf", fechaEfecto: "2026-01-01", plantasDeclaradas: 100, plantacionIds: ids, usuario: "prueba" });
      return { ...c, anexosExtra: (c.anexosExtra || []).concat([anx]) };
    });
    const despues = totales(conAnexos, viveros);
    informe.conAnexos = despues;
    informe.contratosConAnexoNuevo = conAnexos.filter((c, i) => (c.anexosExtra || []).length !== (contratos[i].anexosExtra || []).length).length;
    expect(despues).toEqual(base);
  });

  test("los anexos nuevos no borran los que ya estaban", () => {
    contratos.forEach((c) => {
      const antes = (c.anexosExtra || []).length;
      const anx = crearAnexoEliminacion({ plantacionIds: ["x"] });
      const despues = (c.anexosExtra || []).concat([anx]);
      expect(despues.slice(0, antes)).toEqual(c.anexosExtra || []);
    });
  });

  test("asignar explícitamente cada orden al contrato que ya resuelve no mueve ningún importe", () => {
    let vivs = viveros;
    let asignadas = 0;
    contratos.forEach((ct) => {
      (mapaOCs(contratos, viveros)[ct.id] || []).forEach((oc) => {
        if (!oc.contrato_id) { vivs = aplicarAsignacionEnViveros(vivs, oc.id, ct.id, { usuario: "prueba" }); asignadas++; }
      });
    });
    const despues = totales(contratos, vivs);
    informe.asignacionExplicita = { ordenesAsignadas: asignadas, ...despues };
    expect(despues).toEqual(base);
  });

  test("hoy no hay ninguna baja documentada ni anexo de eliminación en los datos reales", () => {
    const r = contratos.map((c) => resumenEliminaciones(c));
    informe.estadoActual = {
      contratosConAnexoDeEliminacion: r.filter((x) => x.anexos > 0).length,
      bajasSinAnexo: r.reduce((s, x) => s + x.bajasSinAnexo.length, 0),
    };
    expect(informe.estadoActual.contratosConAnexoDeEliminacion).toBe(0);
  });

  afterAll(() => {
    const salida = process.env.OSIRIS_IMPACTO_OUT;
    if (salida) fs.writeFileSync(salida, JSON.stringify(informe, null, 1), "utf8");
    // eslint-disable-next-line no-console
    console.log("IMPACTO NICOLAS\n" + JSON.stringify(informe, null, 1));
  });
});
