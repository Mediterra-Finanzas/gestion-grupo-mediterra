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

import {
  ACTIVACIONES_NUEVAS_HABILITADAS, puedeCrearActivacion, estadoActivacion,
  activar, desactivar, ACTIVADO,
} from "./reajusteAplicado";
import {
  CONTRATO, ACTIVACION, DATOS_ACTIVACION, EDITADO, filas, porTemp, r2,
  TABLA_CANDIDATO, TABLA_EDITADO, TOTAL_CANDIDATO, DIFERENCIA,
} from "./fixturesReajuste";

// Las tablas y los datos vienen de fixturesReajuste.js, identico en las dos
// ramas: una diferencia de importes solo puede venir del codigo.
const CANDIDATO = TABLA_CANDIDATO;

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

  test("un cambio posterior en el porcentaje NO mueve importes: manda el sello", () => {
    // Misma regla que en el candidato. La version de recuperacion no puede
    // ser mas permisiva que el candidato en materia economica.
    const ct = CONTRATO({
      reajuste: { tipo: "porcentaje", pct: 3, desde: "2026-07-01", referencia: "x", confirmado: true },
      reajusteActivacion: ACTIVACION,
    });
    const f = porTemp(filas(ct));
    expect(r2(f["2027/2028"].montoFact)).toBe(r2(CANDIDATO["2027/2028"]));
    expect(estadoActivacion(ct).pct).toBe(2);   // el sellado
  });
});

// ══════════════════════════════════════════════════════════════════
describe("3 · editar con la version de recuperacion y volver al candidato", () => {
  // La edición: se agrega una cohorte nueva y se corrige el respaldo. Son
  // cambios de datos; el candidato los tiene que leer igual.
  const editado = EDITADO();

  test("la edicion produce importes estables en esta version", () => {
    const f = porTemp(filas(editado));
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
    expect(editado.reajusteActivacion.fechaReferencia).toBe("2026-07-01");
    expect(editado.reajusteActivacion.reglaFecha).toBe("inicioPeriodoServicio");
    expect(editado.reajusteActivacion.reglaFechaRespaldo).toMatch(/Clausula/);
    expect(editado.reajusteActivacion.activado).toBe(true);
    expect(editado.reajuste.pct).toBe(2);
  });

  test("tabla que el candidato debe reproducir despues de la edicion", () => {
    const f = porTemp(filas(editado));
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

  test("la ACCION de activar se rechaza, no solo se oculta el boton", () => {
    const res = activar(CONTRATO(), DATOS_ACTIVACION);
    expect(res.ok).toBe(false);
    expect(res.motivo).toMatch(/version de recuperacion/i);
    expect(res.contrato.reajusteActivacion).toBeUndefined();   // no escribio nada
  });

  test("y el contrato devuelto sigue calculando la base", () => {
    const res = activar(CONTRATO(), DATOS_ACTIVACION);
    const f = porTemp(filas(res.contrato));
    expect(r2(f["2027/2028"].montoFact)).toBe(125910);
  });

  test("desactivar una existente SI se puede, con las mismas exigencias", () => {
    // No queda atrapada, pero tampoco se apaga de un clic: permiso, motivo y
    // confirmacion explicita, igual que en el candidato.
    const ct = CONTRATO({ reajusteActivacion: ACTIVACION });
    expect(desactivar(ct, { motivo: "Motivo sintetico" }).ok).toBe(false);          // falta confirmar
    expect(desactivar(ct, { motivo: "", confirmado: true }).ok).toBe(false);        // falta motivo
    expect(desactivar(ct, { motivo: "x", confirmado: true, puedeEditar: false }).ok).toBe(false);  // sin permiso
    expect(desactivar(ct, { motivo: "x", confirmado: true }).ok).toBe(false);                      // sin identidad
    const res = desactivar(ct, { motivo: "Motivo sintetico", usuarioActual: { nombre: "Prueba Sintetica" }, confirmado: true });
    expect(res.ok).toBe(true);
    expect(porTemp(filas(res.contrato))["2027/2028"].montoFact).toBe(125910);
  });

  test("bloquear nuevas no apaga las existentes", () => {
    // Es la distincion que hace util a esta version.
    expect(estadoActivacion(CONTRATO({ reajusteActivacion: ACTIVACION })).activo).toBe(true);
  });
});
