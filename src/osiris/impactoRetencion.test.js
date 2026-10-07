/* eslint-disable */
// Impacto de A1–A3 sobre COPIA de los datos reales.
//
// Lo que tiene que probar: que cambiar el motor de `pct(pais)` a la retención
// por contrato NO mueve ningún importe, ni antes ni después de la transición, y
// que después de la transición el país deja de mover el neto.
//
//   OSIRIS_SNAPSHOT=/ruta/osiris.json npx react-scripts test --testMatch '**/src/osiris/impactoRetencion.test.js' --watchAll=false
import fs from "fs";
import {
  derivarRoyaltyPlantaDesdeContratos,
  derivarRoyaltyComercialDesdeContratos,
  derivarContractFeeDesdeContratos,
  ocLigadaAContrato,
} from "../OsirisModule";
import {
  aplicarTransicion, factorNeto, estadoRetencion, netoValidado,
  proponerRetencion, validarRetencion, resumenValidacion, sellarFila,
  HEREDADO, VALIDADA, SIN_TRANSICION, pctPorPaisLegado,
} from "./retencion";

const RUTA = process.env.OSIRIS_SNAPSHOT;
const hay = !!RUTA && fs.existsSync(RUTA);
const d = hay ? describe : describe.skip;
const admin = { nombre: "Angelo", rol: "admin" };

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
const suma = (f, campo) => Math.round(f.reduce((s, x) => s + (Number(x[campo]) || 0), 0) * 100) / 100;
const totales = (contratos, viveros) => {
  const ocs = mapaOCs(contratos, viveros);
  const rp = derivarRoyaltyPlantaDesdeContratos(contratos, ocs);
  const rc = derivarRoyaltyComercialDesdeContratos(contratos, ocs);
  const cf = derivarContractFeeDesdeContratos(contratos);
  return {
    rpFact: suma(rp, "montoFact"), rpNeto: suma(rp, "montoCobro"),
    rcFact: suma(rc, "montoFact"), rcNeto: suma(rc, "montoCobro"),
    cfBruto: suma(cf, "montoUSD"), cfNeto: suma(cf, "montoNeto"),
    filas: rp.length + rc.length + cf.length,
  };
};
const antecedentes = (contratos) => {
  let nFact = 0, pagos = 0, pagados = 0;
  (contratos || []).forEach((ct) => {
    [...(ct.rpPlantaCuotas || []), ...(ct.rcCohortes || []), ...(ct.rpPagos ? Object.values(ct.rpPagos) : [])].forEach((c) => {
      if (c && c.nFact) nFact++;
      if (c && c.fechaPago) pagos++;
      if (c && c.pagado) pagados++;
    });
    if (ct.contractFeeNFact) nFact++;
    if (ct.contractFeeFechaPago) pagos++;
  });
  return { nFact, pagos, pagados };
};

d("impacto de la retención por contrato (A1–A3)", () => {
  const v = hay ? JSON.parse(fs.readFileSync(RUTA, "utf8")) : {};
  const contratos = v.contratos || [];
  const viveros = v.viveros || [];
  const base = hay ? totales(contratos, viveros) : null;
  const informe = { generado: new Date().toISOString(), contratos: contratos.length };

  test("línea base con el motor nuevo", () => {
    informe.antes = base;
    expect(base.filas).toBeGreaterThan(0);
  });

  test("hoy ningún contrato pasó por la transición y ningún neto está validado", () => {
    informe.estadoActual = {
      sinTransicion: contratos.filter((c) => estadoRetencion(c).estado === SIN_TRANSICION).length,
      heredados: contratos.filter((c) => estadoRetencion(c).estado === HEREDADO).length,
      validados: contratos.filter((c) => netoValidado(c)).length,
    };
    expect(informe.estadoActual.sinTransicion).toBe(contratos.length);
    expect(informe.estadoActual.validados).toBe(0);
  });

  test("la transición NO mueve ningún importe", () => {
    const r = aplicarTransicion(contratos, "2026-09-24");
    informe.transicion = { cambiados: r.cambiados, yaMigrados: r.yaMigrados, desvios: r.desvios.length };
    informe.despues = totales(r.contratos, viveros);
    expect(r.desvios).toEqual([]);
    expect(informe.despues).toEqual(base);
  });

  test("la transición no toca facturas, pagos ni antecedentes", () => {
    const r = aplicarTransicion(contratos, "2026-09-24");
    informe.antecedentes = { antes: antecedentes(contratos), despues: antecedentes(r.contratos) };
    expect(informe.antecedentes.despues).toEqual(informe.antecedentes.antes);
  });

  test("después de la transición, cambiar el país ya no mueve el neto", () => {
    const r = aplicarTransicion(contratos, "2026-09-24");
    const aReinoUnido = r.contratos.map((c) => ({ ...c, pais: "Reino Unido" }));
    informe.paisCambiadoDespues = totales(aReinoUnido, viveros);
    expect(informe.paisCambiadoDespues).toEqual(base);
  });

  test("sin la transición, cambiar el país SÍ lo mueve: eso es lo que se corrige", () => {
    const aReinoUnido = contratos.map((c) => ({ ...c, pais: "Reino Unido" }));
    const t = totales(aReinoUnido, viveros);
    informe.paisCambiadoAntes = t;
    const chilenos = contratos.filter((c) => pctPorPaisLegado(c.pais) === 0).length;
    informe.contratosChilenos = chilenos;
    if (chilenos > 0) expect(t).not.toEqual(base);
    else expect(t).toEqual(base);   // si no hay contratos chilenos, el 15 % es el mismo
  });

  test("una propuesta no mueve nada; validada sí, y solo ese contrato", () => {
    const r = aplicarTransicion(contratos, "2026-09-24");
    const propuestos = r.contratos.map((c) => proponerRetencion(c, { pct: 20, respaldo: "prueba sintética", propuestaPor: "prueba" }));
    informe.conPropuesta = totales(propuestos, viveros);
    expect(informe.conPropuesta).toEqual(base);

    const uno = propuestos.findIndex((c) => (c.rpPlantaCuotas || []).length > 0 || (c.rcCohortes || []).length > 0);
    if (uno >= 0) {
      const validados = propuestos.slice();
      validados[uno] = validarRetencion(validados[uno], admin, "2026-09-25");
      const t = totales(validados, viveros);
      informe.unoValidado = { contrato: validados[uno].razonSocial, antes: base.rpNeto + base.rcNeto, despues: t.rpNeto + t.rcNeto };
      expect(t.rpFact).toBe(base.rpFact);   // lo facturado no cambia nunca
      expect(t.rcFact).toBe(base.rcFact);
      expect(netoValidado(validados[uno])).toBe(true);
    }
  });

  test("todas las filas quedan marcadas como no validadas", () => {
    const r = aplicarTransicion(contratos, "2026-09-24");
    const ocs = mapaOCs(r.contratos, viveros);
    const filas = [
      ...derivarRoyaltyPlantaDesdeContratos(r.contratos, ocs),
      ...derivarRoyaltyComercialDesdeContratos(r.contratos, ocs),
      ...derivarContractFeeDesdeContratos(r.contratos),
    ];
    const res = resumenValidacion(filas);
    informe.marcado = { total: res.total, sinValidar: res.sinValidar, validadas: res.validadas };
    expect(res.validadas).toBe(0);
    expect(res.sinValidar).toBe(res.total);
    expect(res.nota).toMatch(/SIN VALIDAR/);
  });

  // El código anterior NO conoce `retencionTributaria`: calcula con pct(pais).
  // Preservar el campo no prueba que lo use, así que comparamos los resultados.
  test("qué calcularía el código anterior en cada escenario", () => {
    const legado = (cts) => {
      // Reproduce exactamente lo que hace el código anterior: el país y nada más.
      const comoAntes = cts.map((c) => {
        const copia = { ...c };
        delete copia.retencionTributaria;   // el código viejo ni lo mira
        return copia;
      });
      return totales(comoAntes, viveros);
    };
    const r = aplicarTransicion(contratos, "2026-09-24");

    // (i) sólo con la transición: el valor congelado coincide con el del país
    const conTransicion = totales(r.contratos, viveros);
    const viejoTrasTransicion = legado(r.contratos);
    expect(viejoTrasTransicion).toEqual(conTransicion);

    // (ii) con una tasa validada distinta: el código anterior la ignora
    const uno = r.contratos.findIndex((c) => (c.rpPlantaCuotas || []).length > 0);
    const conValidada = r.contratos.slice();
    conValidada[uno] = validarRetencion(
      proponerRetencion(conValidada[uno], { pct: 20, respaldo: "prueba sintética" }), admin, "2026-09-25");
    const nuevoValidado = totales(conValidada, viveros);
    const viejoValidado = legado(conValidada);

    // (iii) país corregido después de la transición: el nuevo lo ignora, el viejo lo sigue
    const conPaisCorregido = r.contratos.map((c) => ({ ...c, pais: "Chile" }));
    const nuevoPais = totales(conPaisCorregido, viveros);
    const viejoPais = legado(conPaisCorregido);

    informe.codigoAnterior = {
      trasTransicion: { nuevo: conTransicion.rpNeto + conTransicion.rcNeto, viejo: viejoTrasTransicion.rpNeto + viejoTrasTransicion.rcNeto, iguales: true },
      conTasaValidada: {
        contrato: conValidada[uno].razonSocial,
        nuevo: nuevoValidado.rpNeto + nuevoValidado.rcNeto,
        viejo: viejoValidado.rpNeto + viejoValidado.rcNeto,
        diferencia: Math.round((nuevoValidado.rpNeto + nuevoValidado.rcNeto - viejoValidado.rpNeto - viejoValidado.rcNeto) * 100) / 100,
      },
      conPaisCorregidoATodosChile: {
        nuevo: nuevoPais.rpNeto + nuevoPais.rcNeto,
        viejo: viejoPais.rpNeto + viejoPais.rcNeto,
        diferencia: Math.round((nuevoPais.rpNeto + nuevoPais.rcNeto - viejoPais.rpNeto - viejoPais.rcNeto) * 100) / 100,
      },
    };

    // Lo facturado nunca difiere: la diferencia es solo del neto.
    expect(viejoValidado.rpFact).toBe(nuevoValidado.rpFact);
    expect(viejoPais.rpFact).toBe(nuevoPais.rpFact);
    // Y las diferencias de neto existen y hay que declararlas.
    expect(informe.codigoAnterior.conTasaValidada.diferencia).not.toBe(0);
    expect(informe.codigoAnterior.conPaisCorregidoATodosChile.diferencia).not.toBe(0);
  });

  afterAll(() => {
    const salida = process.env.OSIRIS_IMPACTO_OUT;
    if (salida) fs.writeFileSync(salida, JSON.stringify(informe, null, 1), "utf8");
    // eslint-disable-next-line no-console
    console.log("IMPACTO RETENCION\n" + JSON.stringify(informe, null, 1));
  });
});
