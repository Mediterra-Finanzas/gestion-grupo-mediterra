/* eslint-disable */
// Entrega A · El reajuste que no se aplica deja de ser silencioso.
//
// Lo que estas pruebas fijan:
//   · que se avise cuando un contrato está marcado y no reajusta nada;
//   · que NO se toque ningún importe al decirlo;
//   · que una configuración antigua que SÍ está operando siga operando, y no
//     se la confunda con un caso pendiente.

import {
  reajusteOperativo, pctReajusteDelMotor, contratosConReajusteSinDefinir,
  REAJUSTE_APLICANDO, REAJUSTE_REGISTRADO_SIN_APLICAR,
  REAJUSTE_MARCADO_SIN_DEFINICION, REAJUSTE_SIN_MARCA,
  estadoReajuste,
} from "./condicionesConfigurables";

const CT = (extra) => Object.assign(
  { id: "c1", pais: "Peru", valorRoyaltyPlanta: 1, valorRoyaltyComercial: 3000 },
  extra || {}
);

// Reproduce lo que hace el motor hoy, para comprobar que el aviso no lo mueve.
const factorDelMotor = (ct, idx) => Math.pow(1 + pctReajusteDelMotor(ct) / 100, idx);
const montoRC = (ct, ha, idx) => ha * (Number(ct.valorRoyaltyComercial) || 0) * factorDelMotor(ct, idx);

// ══════════════════════════════════════════════════════════════════
describe("1 · el caso de los 17: marcado y sin definición", () => {
  test("se avisa, y el aviso dice que no se está aplicando y por qué", () => {
    const ct = CT({ royaltyInflacion: true });
    const ro = reajusteOperativo(ct);
    expect(ro.estado).toBe(REAJUSTE_MARCADO_SIN_DEFINICION);
    expect(ro.aplica).toBe(false);
    expect(ro.aviso).toMatch(/no se está aplicando ningún reajuste por falta de definición/);
    expect(ro.aviso).toMatch(/sin ajustar/);
  });

  test("un porcentaje cargado en cero es lo mismo que ninguno", () => {
    expect(reajusteOperativo(CT({ royaltyInflacion: true, rcInflacionPct: 0 })).estado)
      .toBe(REAJUSTE_MARCADO_SIN_DEFINICION);
    expect(reajusteOperativo(CT({ royaltyInflacion: true, rcInflacionPct: "" })).estado)
      .toBe(REAJUSTE_MARCADO_SIN_DEFINICION);
    expect(reajusteOperativo(CT({ royaltyInflacion: true, rcInflacionPct: null })).estado)
      .toBe(REAJUSTE_MARCADO_SIN_DEFINICION);
  });

  test("el aviso enumera lo que falta", () => {
    expect(reajusteOperativo(CT({ royaltyInflacion: true })).aviso).toMatch(/Falta: tipo de reajuste/);
  });

  test("sin la marca y sin configuración, no hay nada que avisar", () => {
    const ro = reajusteOperativo(CT());
    expect(ro.estado).toBe(REAJUSTE_SIN_MARCA);
    expect(ro.aviso).toBe("");
  });

  test("la lista cuenta solo los marcados sin definición", () => {
    const lista = [
      CT({ id: "a", royaltyInflacion: true }),                        // avisa
      CT({ id: "b", royaltyInflacion: true, rcInflacionPct: 2 }),     // opera
      CT({ id: "c" }),                                                // nada
      CT({ id: "d", royaltyInflacion: true, rcInflacionPct: 0 }),     // avisa
    ];
    expect(contratosConReajusteSinDefinir(lista).map((c) => c.id)).toEqual(["a", "d"]);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("2 · lo que ya opera sigue operando", () => {
  test("un contrato con 5 % cargado se declara aplicando, no pendiente", () => {
    const ct = CT({ royaltyInflacion: true, rcInflacionPct: 5 });
    const ro = reajusteOperativo(ct);
    expect(ro.estado).toBe(REAJUSTE_APLICANDO);
    expect(ro.aplica).toBe(true);
    expect(ro.pct).toBe(5);
    expect(ro.aviso).toBe("");          // no se le pone un aviso amarillo encima
    expect(ro.titulo).toBe("Reajuste aplicándose: 5 %/año");
  });

  test("el porcentaje que informa es EXACTAMENTE el que usa el motor", () => {
    [0, 1, 2, 5, 12.5].forEach((p) => {
      const ct = CT({ royaltyInflacion: true, rcInflacionPct: p });
      expect(pctReajusteDelMotor(ct)).toBe(p > 0 ? p : 0);
      expect(reajusteOperativo(ct).pct).toBe(p > 0 ? p : 0);
    });
  });

  test("la marca apagada ignora el porcentaje, igual que el motor", () => {
    const ct = CT({ royaltyInflacion: false, rcInflacionPct: 7 });
    expect(pctReajusteDelMotor(ct)).toBe(0);
    expect(reajusteOperativo(ct).estado).toBe(REAJUSTE_SIN_MARCA);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("3 · registrado en el bloque nuevo, pero el motor no lo lee todavía", () => {
  const CONFIRMADO = {
    reajuste: { tipo: "porcentaje", pct: 2, desde: "2027-01-01", referencia: "Annexure D 1.2.5", confirmado: true },
  };

  test("se dice que está registrado y que NO se aplica", () => {
    const ct = CT(CONFIRMADO);
    expect(estadoReajuste(ct)).toBe("confirmado");         // el antecedente, completo
    const ro = reajusteOperativo(ct);
    expect(ro.estado).toBe(REAJUSTE_REGISTRADO_SIN_APLICAR);
    expect(ro.aplica).toBe(false);
    expect(ro.aviso).toMatch(/no se está aplicando/);
    expect(ro.aviso).toMatch(/activación explícita/);
  });

  test("confirmar el antecedente no enciende nada: el motor sigue en factor 1", () => {
    const sin = CT();
    const con = CT(CONFIRMADO);
    expect(pctReajusteDelMotor(con)).toBe(0);
    [0, 1, 2, 3].forEach((i) => expect(montoRC(con, 10, i)).toBe(montoRC(sin, 10, i)));
  });

  test("si además hay una configuración antigua operando, manda la que opera", () => {
    // No se puede decir "no se aplica" cuando sí se está aplicando algo.
    const ct = CT(Object.assign({ royaltyInflacion: true, rcInflacionPct: 3 }, CONFIRMADO));
    expect(reajusteOperativo(ct).estado).toBe(REAJUSTE_APLICANDO);
    expect(reajusteOperativo(ct).pct).toBe(3);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("4 · decirlo no cambia ningún importe", () => {
  const CASOS = [
    ["marcado sin definición", CT({ royaltyInflacion: true })],
    ["con 5 % operando", CT({ royaltyInflacion: true, rcInflacionPct: 5 })],
    ["registrado sin aplicar", CT({ reajuste: { tipo: "porcentaje", pct: 2, desde: "2027-01-01", referencia: "x", confirmado: true } })],
    ["sin marca", CT()],
  ];

  CASOS.forEach(([nombre, ct]) => {
    test(`${nombre}: el monto por temporada es el mismo antes y después de preguntar`, () => {
      const antes = [0, 1, 2, 3, 4].map((i) => montoRC(ct, 41.97, i));
      reajusteOperativo(ct);
      pctReajusteDelMotor(ct);
      contratosConReajusteSinDefinir([ct]);
      const despues = [0, 1, 2, 3, 4].map((i) => montoRC(ct, 41.97, i));
      expect(despues).toEqual(antes);
    });

    test(`${nombre}: preguntar no muta el contrato`, () => {
      const copia = JSON.parse(JSON.stringify(ct));
      reajusteOperativo(ct);
      contratosConReajusteSinDefinir([ct]);
      expect(ct).toEqual(copia);
    });
  });

  test("los números del caso real no se mueven: 41,97 ha × US$3.000", () => {
    // Supuesto de temporada completa. No son cobros acreditados.
    const marcado = CT({ royaltyInflacion: true });                       // los 17
    const operando = CT({ royaltyInflacion: true, rcInflacionPct: 2 });   // si alguien lo cargara
    expect(montoRC(marcado, 41.97, 0)).toBeCloseTo(125910, 2);
    expect(montoRC(marcado, 41.97, 1)).toBeCloseTo(125910, 2);   // sin definición: no compone
    expect(montoRC(operando, 41.97, 1)).toBeCloseTo(128428.2, 2); // 125.910 + 2.518,20
    expect(montoRC(operando, 41.97, 1) - montoRC(operando, 41.97, 0)).toBeCloseTo(2518.2, 2);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("5 · el aviso no se contradice con el antecedente", () => {
  test("pendiente como antecedente y sin aplicar como efecto conviven sin chocar", () => {
    const ct = CT({ royaltyInflacion: true });
    expect(estadoReajuste(ct)).toBe("pendiente");                      // qué falta declarar
    expect(reajusteOperativo(ct).estado).toBe(REAJUSTE_MARCADO_SIN_DEFINICION); // qué hace el motor
  });

  test("declarado \"sin reajuste\" y confirmado no dispara ningún aviso", () => {
    const ct = CT({ reajuste: { tipo: "sin_reajuste", confirmado: true } });
    expect(estadoReajuste(ct)).toBe("sinReajuste");
    expect(reajusteOperativo(ct).aviso).toBe("");
  });
});
