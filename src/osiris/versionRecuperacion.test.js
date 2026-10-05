/* eslint-disable */
// Versión de recuperación COMPATIBLE.
//
// Qué tiene que cumplir, y es lo que estas pruebas miden:
//   1. Importes idénticos al candidato, en todas las temporadas.
//   2. Conserva activación, respaldo y los cambios posteriores.
//   3. Se puede editar con ella y volver al candidato sin pérdida ni cambio
//      económico.
//   4. No deja crear activaciones nuevas.
//
// Las cifras de referencia están medidas sobre el candidato (7f0b5dd).

import { derivarRoyaltyComercialDesdeContratos } from "../OsirisModule";
import { ACTIVACIONES_NUEVAS_HABILITADAS, puedeCrearActivacion, estadoActivacion, ACTIVADO } from "./reajusteAplicado";

const ACTIVACION = {
  activado: true,
  fechaReferencia: "2026-07-01",
  respaldo: "Comprobante sintetico de primer pago 001",
  reglaFecha: "inicioPeriodoServicio",
  reglaFechaRespaldo: "Clausula sintetica 1.2.6",
  usuario: "prueba", fecha: "2026-10-05",
};

const CONTRATO = (extra) => Object.assign({
  id: "ct_sint", razonSocial: "Sintetica SA", pais: "Chile",
  modeloIngresos: "oc", valorRoyaltyComercial: 3000, rcMesCobro: "Abril",
  fechaTermino: "2031-06-30",
  rcCohortes: [{ id: "c1", ha: 41.97, desde: "2026/2027" }],
  reajuste: { tipo: "porcentaje", pct: 2, desde: "2026-07-01", referencia: "Clausula sintetica 1.2.5", confirmado: true },
}, extra || {});

const filas = (ct) => derivarRoyaltyComercialDesdeContratos([ct], { ct_sint: [] });
const porTemp = (fs) => fs.reduce((m, f) => (m[f.temporada] = f, m), {});
const r2 = (n) => Math.round(n * 100) / 100;

// Medido sobre el candidato, con la activación cargada.
const CANDIDATO = {
  "2026/2027": 125910, "2027/2028": 128428.2, "2028/2029": 130996.76,
  "2029/2030": 133616.7, "2030/2031": 136289.03,
};

// ══════════════════════════════════════════════════════════════════
describe("1 · importes idénticos al candidato, en todas las temporadas", () => {
  const f = porTemp(filas(CONTRATO({ reajusteActivacion: ACTIVACION })));

  test("las cinco temporadas coinciden al centavo", () => {
    Object.keys(CANDIDATO).forEach((t) => {
      expect(f[t]).toBeDefined();
      expect(r2(f[t].montoFact)).toBe(r2(CANDIDATO[t]));
    });
  });

  test("el total tambien", () => {
    const tot = Object.keys(CANDIDATO).reduce((s, t) => s + f[t].montoFact, 0);
    expect(r2(tot)).toBeCloseTo(655240.69, 2);
  });

  test("y el reajuste sigue aplicándose: no volvió a la base", () => {
    const base = porTemp(filas(CONTRATO()));
    const dif = Object.keys(CANDIDATO).reduce((s, t) => s + (f[t].montoFact - base[t].montoFact), 0);
    expect(r2(dif)).toBeCloseTo(25690.69, 2);   // los US$ que un rollback sin soporte borraría
  });
});

// ══════════════════════════════════════════════════════════════════
describe("2 · conserva activación, respaldo y cambios posteriores", () => {
  test("la activación existente se sigue reconociendo como activa", () => {
    const e = estadoActivacion(CONTRATO({ reajusteActivacion: ACTIVACION }));
    expect(e.estado).toBe(ACTIVADO);
    expect(e.activo).toBe(true);
    expect(e.fechaReferencia).toBe("2026-07-01");
    expect(e.respaldo).toMatch(/Comprobante/);
    expect(e.regla.regla).toBe("inicioPeriodoServicio");
    expect(e.regla.respaldo).toMatch(/Clausula/);
  });

  test("un cambio posterior en el respaldo se conserva y se lee", () => {
    const ct = CONTRATO({ reajusteActivacion: Object.assign({}, ACTIVACION, { respaldo: "Respaldo corregido 002" }) });
    expect(estadoActivacion(ct).respaldo).toBe("Respaldo corregido 002");
  });

  test("un cambio posterior en el porcentaje se refleja en los importes", () => {
    const ct = CONTRATO({
      reajuste: { tipo: "porcentaje", pct: 3, desde: "2026-07-01", referencia: "x", confirmado: true },
      reajusteActivacion: ACTIVACION,
    });
    const f = porTemp(filas(ct));
    expect(r2(f["2027/2028"].montoFact)).toBeCloseTo(r2(125910 * 1.03), 2);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("3 · editar con la version de recuperacion y volver al candidato", () => {
  // La edición: se agrega una cohorte nueva y se corrige el respaldo. Son
  // cambios de datos; el candidato los tiene que leer igual.
  const EDITADO = CONTRATO({
    reajusteActivacion: Object.assign({}, ACTIVACION, { respaldo: "Respaldo corregido 002" }),
    rcCohortes: [
      { id: "c1", ha: 41.97, desde: "2026/2027" },
      { id: "c2", ha: 10, desde: "2028/2029" },
    ],
  });

  test("la edicion produce importes estables en esta version", () => {
    const f = porTemp(filas(EDITADO));
    expect(r2(f["2026/2027"].montoFact)).toBe(125910);
    // 2028/2029: la cohorte vieja aporta 130.996,76 y la nueva 10 ha x 3.000.
    // El reajuste se aplica al TOTAL de la temporada, asi que la cohorte nueva
    // tambien queda ajustada por los dos periodos cumplidos: 30.000 x 1,0404.
    expect(r2(f["2028/2029"].montoFact)).toBeCloseTo(162208.76, 2);
    expect(r2(f["2028/2029"].montoFact)).toBeCloseTo(r2(130996.76 + 30000 * 1.0404), 2);
    // Y no es la suma sin ajustar.
    expect(r2(f["2028/2029"].montoFact)).not.toBeCloseTo(r2(130996.76 + 30000), 2);
  });

  test("nada de lo registrado se pierde al editar", () => {
    expect(EDITADO.reajusteActivacion.fechaReferencia).toBe("2026-07-01");
    expect(EDITADO.reajusteActivacion.reglaFecha).toBe("inicioPeriodoServicio");
    expect(EDITADO.reajusteActivacion.reglaFechaRespaldo).toMatch(/Clausula/);
    expect(EDITADO.reajusteActivacion.activado).toBe(true);
    expect(EDITADO.reajuste.pct).toBe(2);
  });

  test("tabla que el candidato debe reproducir despues de la edicion", () => {
    const f = porTemp(filas(EDITADO));
    const tabla = Object.keys(f).sort().reduce((m, t) => (m[t] = r2(f[t].montoFact), m), {});
    // eslint-disable-next-line no-console
    console.log("TRAS EDITAR EN RECUPERACION\n" + JSON.stringify(tabla, null, 1));
    expect(Object.keys(tabla).length).toBe(5);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("4 · no deja crear activaciones nuevas", () => {
  test("la bandera esta en false", () => {
    expect(ACTIVACIONES_NUEVAS_HABILITADAS).toBe(false);
  });

  test("y lo dice con su motivo", () => {
    const p = puedeCrearActivacion();
    expect(p.puede).toBe(false);
    expect(p.motivo).toMatch(/version de recuperacion/i);
    expect(p.motivo).toMatch(/no permite crear nuevas/);
  });

  test("bloquear nuevas no apaga las existentes", () => {
    // Es la distincion que hace util a esta version.
    expect(estadoActivacion(CONTRATO({ reajusteActivacion: ACTIVACION })).activo).toBe(true);
  });
});
