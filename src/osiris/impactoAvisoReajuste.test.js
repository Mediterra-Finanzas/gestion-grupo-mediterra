/* eslint-disable */
// Impacto del aviso de reajuste sobre una COPIA de los contratos reales.
// Decir que algo no se aplica no puede cambiar lo que se aplica.
//
//   OSIRIS_SNAPSHOT=/ruta/osiris.json npx react-scripts test --testMatch '**/src/osiris/impactoAvisoReajuste.test.js' --watchAll=false

import fs from "fs";
import {
  reajusteOperativo, pctReajusteDelMotor, contratosConReajusteSinDefinir,
  REAJUSTE_APLICANDO, REAJUSTE_MARCADO_SIN_DEFINICION,
} from "./condicionesConfigurables";

const RUTA = process.env.OSIRIS_SNAPSHOT;
const hay = !!RUTA && fs.existsSync(RUTA);
const d = hay ? describe : describe.skip;

// El factor que el motor compone hoy, replicado acá para medir sin tocarlo.
const factor = (ct, idx) => Math.pow(1 + pctReajusteDelMotor(ct) / 100, idx);

d("impacto del aviso de reajuste sobre los contratos reales", () => {
  const v = hay ? JSON.parse(fs.readFileSync(RUTA, "utf8")) : {};
  const contratos = v.contratos || [];
  const informe = { contratos: contratos.length };

  test("hay contratos para medir", () => {
    expect(contratos.length).toBeGreaterThan(0);
  });

  test("el reparto: marcados, operando y sin marca", () => {
    const porEstado = {};
    contratos.forEach((c) => {
      const e = reajusteOperativo(c).estado;
      porEstado[e] = (porEstado[e] || 0) + 1;
    });
    informe.porEstado = porEstado;
    informe.marcadosSinDefinir = contratosConReajusteSinDefinir(contratos).map((c) => c.razonSocial);

    // Lo que se midió al preparar la entrega: 18 con la casilla puesta, de los
    // cuales uno tiene porcentaje. Si esto cambia, el aviso lo refleja solo.
    const marcados = contratos.filter((c) => !!c.royaltyInflacion).length;
    const operando = contratos.filter((c) => reajusteOperativo(c).estado === REAJUSTE_APLICANDO).length;
    const sinDefinir = (porEstado[REAJUSTE_MARCADO_SIN_DEFINICION] || 0);
    expect(sinDefinir + operando).toBe(marcados);
    expect(sinDefinir).toBeGreaterThan(0);        // si fuera 0, el aviso sobra
  });

  test("ningún factor del motor cambia por mirar el contrato", () => {
    const antes = contratos.map((c) => [0, 1, 2, 3, 4].map((i) => factor(c, i)));
    contratos.forEach((c) => { reajusteOperativo(c); });
    contratosConReajusteSinDefinir(contratos);
    const despues = contratos.map((c) => [0, 1, 2, 3, 4].map((i) => factor(c, i)));
    expect(despues).toEqual(antes);
  });

  test("los contratos sin definición tienen factor 1 en todas las temporadas", () => {
    // Es exactamente lo que el aviso afirma. Si alguno compusiera, el aviso mentiría.
    contratosConReajusteSinDefinir(contratos).forEach((c) => {
      [0, 1, 2, 5, 10].forEach((i) => expect(factor(c, i)).toBe(1));
    });
  });

  test("el que está operando conserva su factor compuesto", () => {
    const operando = contratos.filter((c) => reajusteOperativo(c).estado === REAJUSTE_APLICANDO);
    informe.operando = operando.map((c) => ({ contrato: c.razonSocial, pct: pctReajusteDelMotor(c) }));
    operando.forEach((c) => {
      const p = pctReajusteDelMotor(c);
      expect(p).toBeGreaterThan(0);
      expect(factor(c, 1)).toBeCloseTo(1 + p / 100, 10);
      expect(factor(c, 2)).toBeCloseTo(Math.pow(1 + p / 100, 2), 10);
    });
  });

  test("mirar la cartera entera no muta ningún contrato", () => {
    const copia = JSON.parse(JSON.stringify(contratos));
    contratos.forEach((c) => reajusteOperativo(c));
    expect(contratos).toEqual(copia);
  });

  afterAll(() => {
    // eslint-disable-next-line no-console
    console.log("IMPACTO AVISO REAJUSTE\n" + JSON.stringify(informe, null, 1));
  });
});
