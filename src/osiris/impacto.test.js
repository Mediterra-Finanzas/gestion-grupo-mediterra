/* eslint-disable */
// Medición de impacto ANTES/DESPUÉS sobre una COPIA de los datos reales.
//
// No se conecta a ninguna base: lee un archivo JSON con la copia de la fila
// `osiris`, indicado en la variable de entorno OSIRIS_SNAPSHOT. Sin esa
// variable la medición se omite, para que la suite normal siga siendo
// sintética.
//
//   OSIRIS_SNAPSHOT=/ruta/osiris.json npx react-scripts test --testMatch '**/src/osiris/impacto.test.js' --watchAll=false
//
// Mide lo único que puede mover importes: P5, la atribución de órdenes. P1 y
// P2 se miden como conservación (cuántos antecedentes habrían desaparecido con
// el comportamiento anterior).
import fs from "fs";
import { repartirOrdenes, fusionarTandas, tieneAntecedentes, esBaja } from "./preservacion";

const RUTA = process.env.OSIRIS_SNAPSHOT;
const hay = !!RUTA && fs.existsSync(RUTA);
const d = hay ? describe : describe.skip;

// Atribución ANTERIOR, copiada tal cual de OsirisModule.jsx antes del cambio.
function ocLigadaAntes(oc, ct) {
  if (!oc || !ct) return false;
  if (oc.contrato_id) return oc.contrato_id === ct.id;
  if (oc.cliente_id && ct.clienteId && oc.cliente_id === ct.clienteId) return true;
  const norm = (s) => (s || "").toString().toLowerCase().trim();
  const ocNom = norm(oc.cliente_nombre);
  if (ocNom && (ocNom === norm(ct.razonSocial) || ocNom === norm(ct.cliente))) return true;
  return false;
}

d("impacto sobre copia de datos reales", () => {
  const v = hay ? JSON.parse(fs.readFileSync(RUTA, "utf8")) : {};
  const contratos = v.contratos || [];
  const ocs = [];
  (v.viveros || []).forEach((viv) => (viv.ordenesCompra || []).forEach((oc) => ocs.push(oc)));
  const informe = { generado: new Date().toISOString(), contratos: contratos.length, ordenes: ocs.length };

  test("P5 · atribución de órdenes antes y después", () => {
    // ANTES: una orden podía calzar con varios contratos a la vez.
    const antes = {};
    let vecesAtribuida = 0;
    contratos.forEach((ct) => {
      const suyas = ocs.filter((oc) => ocLigadaAntes(oc, ct));
      if (suyas.length) antes[ct.id] = suyas.map((o) => o.id);
      vecesAtribuida += suyas.length;
    });
    const ocsDuplicadas = ocs.filter((oc) => contratos.filter((ct) => ocLigadaAntes(oc, ct)).length > 1);
    const ocsHuerfanas = ocs.filter((oc) => contratos.every((ct) => !ocLigadaAntes(oc, ct)));

    // DESPUÉS
    const despues = repartirOrdenes(ocs, contratos);
    const nDespues = Object.values(despues.atribuidas).reduce((s, a) => s + a.length, 0);

    // Diferencia por contrato
    const cambios = [];
    contratos.forEach((ct) => {
      const a = (antes[ct.id] || []).slice().sort().join(",");
      const b = (despues.atribuidas[ct.id] || []).map((o) => o.id).slice().sort().join(",");
      if (a !== b) {
        const plantasAntes = (antes[ct.id] || []).reduce((s, id) => s + (Number((ocs.find((o) => o.id === id) || {}).cantidad_plantas) || 0), 0);
        const plantasDespues = (despues.atribuidas[ct.id] || []).reduce((s, o) => s + (Number(o.cantidad_plantas) || 0), 0);
        cambios.push({ contrato: ct.razonSocial, id: ct.id, ordenesAntes: (antes[ct.id] || []).length, ordenesDespues: (despues.atribuidas[ct.id] || []).length, plantasAntes, plantasDespues });
      }
    });

    informe.p5 = {
      atribucionesAntes: vecesAtribuida,
      atribucionesDespues: nDespues,
      pendientesDespues: despues.pendientes.length,
      ordenesAtribuidasADosOMasAntes: ocsDuplicadas.length,
      ordenesSinContratoAntes: ocsHuerfanas.length,
      contratosConCambio: cambios,
      plantasPendientes: despues.pendientes.reduce((s, x) => s + (Number(x.oc.cantidad_plantas) || 0), 0),
      feePendienteUSD: despues.pendientes.reduce((s, x) => s + (Number(x.oc.fee_total_usd) || 0), 0),
    };

    // Invariante: ninguna orden se pierde ni se cuenta dos veces.
    expect(despues.cuadra).toBe(true);
    expect(nDespues + despues.pendientes.length).toBe(ocs.length);
  });

  test("P1 · antecedentes que el comportamiento anterior habría borrado", () => {
    let cuotas = 0, conAnt = 0, borradasAntes = 0, enRevision = 0, agregadas = 0;
    contratos.forEach((ct) => {
      const existentes = ct.rpPlantaCuotas || [];
      cuotas += existentes.length;
      conAnt += existentes.filter(tieneAntecedentes).length;
      // Sugerencias que produciría el botón, con las OC de ESTE contrato.
      const suyas = repartirOrdenes(ocs, contratos).atribuidas[ct.id] || [];
      const sug = [];
      suyas.forEach((oc) => (oc.despachos || []).forEach((dp) => {
        if (dp.tipo === "Prueba") return;
        const pl = Number(dp.cantidad_despachada) || 0;
        if (pl <= 0) return;
        sug.push({ id: `s_${sug.length}`, nPlantas: pl, fechaEvento: dp.fecha_despacho || "" });
      }));
      if (!sug.length) return;
      borradasAntes += existentes.length; // el botón anterior reemplazaba todas
      const res = fusionarTandas(existentes, sug);
      enRevision += res.revision.length;
      agregadas += res.resumen.agregadas;
      expect(res.activas.filter(tieneAntecedentes).length).toBe(existentes.filter(tieneAntecedentes).length);
    });
    informe.p1 = { cuotasTotales: cuotas, conAntecedentes: conAnt, cuotasQueElBotonAnteriorHabriaReemplazado: borradasAntes, sugerenciasEnRevisionAhora: enRevision, sugerenciasNuevasAhora: agregadas };
  });

  test("P2 · plantaciones y totales no cambian", () => {
    let plantaciones = 0, plantas = 0, bajas = 0;
    contratos.forEach((ct) => {
      (ct.plantaciones || []).forEach((p) => {
        plantaciones++;
        plantas += Number(p.nPlantas) || 0;
        if (esBaja(p)) bajas++;
      });
    });
    informe.p2 = { plantaciones, plantas, dadasDeBajaConElCampoNuevo: bajas };
    expect(bajas).toBe(0); // dato real actual: nadie usa todavía el campo nuevo
  });

  afterAll(() => {
    const salida = process.env.OSIRIS_IMPACTO_OUT;
    if (salida) fs.writeFileSync(salida, JSON.stringify(informe, null, 1), "utf8");
    // eslint-disable-next-line no-console
    console.log("IMPACTO\n" + JSON.stringify(informe, null, 1));
  });
});
