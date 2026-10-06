/* eslint-disable */
// Pruebas de INTEGRACIÓN que reproducen los defectos que la revisión
// independiente encontró. No alcanzaba con ampliar las del modelo: estos
// fallaban en el cableado al motor y en la pantalla.
//
// Cada describe nombra el hallazgo que cubre.

import fs from "fs";
import path from "path";
import { derivarRoyaltyComercialDesdeContratos } from "../OsirisModule";
import {
  activar, desactivar, estadoActivacion, historialActivacion, identidadDe,
  previsualizarActivacion, previsualizarDesactivacion,
} from "./reajusteAplicado";
import { DATOS_ACTIVACION, filas, porTemp, r2, TABLA_CANDIDATO } from "./fixturesReajuste";

const USUARIO = { nombre: "Prueba Sintetica", email: "prueba@invalid" };
const ACTIVAR = (ct) => activar(ct, Object.assign({}, DATOS_ACTIVACION, {
  usuarioActual: USUARIO, puedeEditar: true, confirmado: true, impacto: 25690.69,
})).contrato;

// Contrato LEGACY: sin cohortes y sin modelo OC, así que el motor lo resuelve
// por la rama de plantaciones × temporadas. Es la rama por la que van los
// contratos reales, Olmos incluido.
const LEGACY = (extra) => Object.assign({
  id: "ct_legacy", razonSocial: "Legacy SA", pais: "Chile",
  valorRoyaltyComercial: 3000, rcMesCobro: "Abril",
  rcInicioTemporada: "2026/2027", fechaTermino: "2031-06-30",
  plantaciones: [{ id: "p1", hectareas: 41.97, tipoPlantacion: "Comercial" }],
  reajuste: { tipo: "porcentaje", pct: 2, desde: "2026-07-01", referencia: "Clausula sintetica", confirmado: true },
}, extra || {});

const filasDe = (ct) => derivarRoyaltyComercialDesdeContratos([ct], { [ct.id]: [] });

// ══════════════════════════════════════════════════════════════════
describe("H2 · la rama legacy del motor también aplica el reajuste", () => {
  test("el contrato de prueba efectivamente va por la rama legacy", () => {
    // Si algún día declara cohortes, esta prueba avisa que dejó de cubrir legacy.
    const ct = LEGACY();
    expect(ct.modeloIngresos).toBeUndefined();
    expect(ct.rcCohortes).toBeUndefined();
    expect(filasDe(ct).length).toBeGreaterThan(2);
  });

  test("sin activación, la base es 41,97 × 3.000 en todas las temporadas", () => {
    const f = porTemp(filasDe(LEGACY()));
    expect(r2(f["2026/2027"].montoFact)).toBe(125910);
    expect(r2(f["2027/2028"].montoFact)).toBe(125910);
  });

  test("con activación, los importes se mueven igual que en la rama OC", () => {
    const f = porTemp(filasDe(ACTIVAR(LEGACY())));
    Object.keys(TABLA_CANDIDATO).forEach((t) => {
      if (!f[t]) return;
      expect(r2(f[t].montoFact)).toBe(r2(TABLA_CANDIDATO[t]));
    });
    expect(r2(f["2027/2028"].montoFact)).toBe(128428.2);
    expect(r2(f["2028/2029"].montoFact)).toBe(130996.76);
  });

  test("la fila legacy trae de dónde sale el número", () => {
    const f = porTemp(filasDe(ACTIVAR(LEGACY())));
    const x = f["2027/2028"];
    expect(r2(x.montoBaseSinReajuste)).toBe(125910);
    expect(x.reajusteFactor).toBeCloseTo(1.02, 10);
    expect(r2(x.reajusteAjuste)).toBe(2518.2);
    expect(r2(x.montoBaseSinReajuste + x.reajusteAjuste)).toBe(r2(x.montoFact));
  });

  test("y la rama OC sigue cuadrando igual", () => {
    const { CONTRATO } = require("./fixturesReajuste");
    const f = porTemp(filas(ACTIVAR(CONTRATO())));
    const x = f["2027/2028"];
    expect(r2(x.montoBaseSinReajuste + x.reajusteAjuste)).toBe(r2(x.montoFact));
    expect(r2(x.montoFact)).toBe(128428.2);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("H3 · la vista previa no compone dos veces", () => {
  const { CONTRATO } = require("./fixturesReajuste");
  const activo = ACTIVAR(CONTRATO());
  // Lo que hace la pantalla: recalcula la base con la activación apagada.
  const baseDe = (ct) => filas(Object.assign({}, ct, {
    reajusteActivacion: Object.assign({}, ct.reajusteActivacion, { activado: false }),
  }));

  test("partir de las filas YA ajustadas daría un número inflado", () => {
    // Reproduce el defecto, para que se note si alguien vuelve a hacerlo.
    const yaAjustadas = filas(activo);
    const malo = previsualizarActivacion(activo, yaAjustadas, {});
    const f = malo.detalle.find((d) => d.temporada === "2027/2028");
    expect(r2(f.base)).toBe(128428.2);          // base equivocada: ya venía ajustada
    expect(r2(f.ajustado)).toBe(130996.76);     // y se compone otra vez
  });

  test("partiendo de la base, el antes/después/diferencia son los reales", () => {
    const bueno = previsualizarActivacion(activo, baseDe(activo), {});
    const f = bueno.detalle.find((d) => d.temporada === "2027/2028");
    expect(r2(f.base)).toBe(125910);
    expect(r2(f.ajustado)).toBe(128428.2);
    expect(r2(f.diferencia)).toBe(2518.2);
  });

  test("lo que la vista previa promete es lo que el motor guarda", () => {
    const bueno = previsualizarActivacion(activo, baseDe(activo), {});
    const reales = porTemp(filas(activo));
    bueno.detalle.forEach((d) => {
      expect(r2(reales[d.temporada].montoFact)).toBe(r2(d.ajustado));
    });
    const difReal = bueno.detalle.reduce((s, d) => s + d.diferencia, 0);
    expect(r2(difReal)).toBe(25690.69);
  });

  test("la vista previa de desactivar también parte de la base", () => {
    const pd = previsualizarDesactivacion(activo, baseDe(activo), {});
    expect(r2(Math.abs(pd.diferencia))).toBe(25690.69);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("H4 · permiso dentro de activar, desactivar y reactivar", () => {
  const { CONTRATO } = require("./fixturesReajuste");

  test("activar sin permiso de edición se rechaza y no escribe", () => {
    const res = activar(CONTRATO(), Object.assign({}, DATOS_ACTIVACION, {
      usuarioActual: USUARIO, puedeEditar: false, confirmado: true,
    }));
    expect(res.ok).toBe(false);
    expect(res.motivo).toMatch(/Sin permiso/);
    expect(res.contrato.reajusteActivacion).toBeUndefined();
  });

  test("activar sin confirmación explícita se rechaza", () => {
    const res = activar(CONTRATO(), Object.assign({}, DATOS_ACTIVACION, {
      usuarioActual: USUARIO, puedeEditar: true,
    }));
    expect(res.ok).toBe(false);
    expect(res.motivo).toMatch(/confirmacion explicita/);
  });

  test("desactivar sin permiso se rechaza", () => {
    const res = desactivar(ACTIVAR(CONTRATO()), { motivo: "x", confirmado: true, usuarioActual: USUARIO, puedeEditar: false });
    expect(res.ok).toBe(false);
  });

  test("reactivar también exige permiso", () => {
    const apagado = desactivar(ACTIVAR(CONTRATO()), { motivo: "x", confirmado: true, usuarioActual: USUARIO }).contrato;
    const res = activar(apagado, Object.assign({}, DATOS_ACTIVACION, {
      usuarioActual: USUARIO, puedeEditar: false, confirmado: true,
    }));
    expect(res.ok).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("H5/H6 · identidad canónica e historial que no se pisa", () => {
  const { CONTRATO } = require("./fixturesReajuste");

  test("sin identidad válida, la acción NO se ejecuta", () => {
    expect(identidadDe({}).valida).toBe(false);
    expect(identidadDe(undefined).valida).toBe(false);
    const res = activar(CONTRATO(), Object.assign({}, DATOS_ACTIVACION, { puedeEditar: true, confirmado: true }));
    expect(res.ok).toBe(false);
    expect(res.motivo).toMatch(/Sin identidad valida/);
    expect(res.contrato.reajusteActivacion).toBeUndefined();
  });

  test("el autor queda registrado, no vacío", () => {
    const ct = ACTIVAR(CONTRATO());
    expect(ct.reajusteActivacion.usuario).toBe("Prueba Sintetica");
    expect(historialActivacion(ct)[0].autor).toBe("Prueba Sintetica");
    expect(historialActivacion(ct)[0].email).toBe("prueba@invalid");
  });

  test("desactivar deja su evento con autor, motivo e impacto", () => {
    const ct = desactivar(ACTIVAR(CONTRATO()), {
      motivo: "Se anulo el respaldo", confirmado: true, usuarioActual: USUARIO, impacto: -25690.69,
    }).contrato;
    expect(ct.reajusteActivacion.desactivadoPor).toBe("Prueba Sintetica");
    const h = historialActivacion(ct);
    expect(h.length).toBe(2);
    expect(h[1].evento).toBe("desactivacion");
    expect(h[1].motivo).toMatch(/respaldo/);
    expect(r2(h[1].impactoConfirmado)).toBe(-25690.69);
  });

  test("reactivar NO borra los eventos anteriores", () => {
    const apagado = desactivar(ACTIVAR(CONTRATO()), {
      motivo: "Se anulo el respaldo", confirmado: true, usuarioActual: USUARIO,
    }).contrato;
    const reactivado = activar(apagado, Object.assign({}, DATOS_ACTIVACION, {
      usuarioActual: USUARIO, puedeEditar: true, confirmado: true,
    })).contrato;
    const h = historialActivacion(reactivado);
    expect(h.length).toBe(3);
    expect(h.map((x) => x.evento)).toEqual(["activacion", "desactivacion", "reactivacion"]);
    expect(h[2].motivoAnterior).toMatch(/respaldo/);
    expect(h[0].sello.pct).toBe(2);               // el sello original sigue ahí
  });

  test("el historial guarda los términos sellados de cada evento", () => {
    const ct = ACTIVAR(CONTRATO());
    expect(historialActivacion(ct)[0].sello).toEqual({
      pct: 2, fechaReferencia: "2026-07-01", reglaFecha: "inicioPeriodoServicio",
    });
  });
});

// ══════════════════════════════════════════════════════════════════
describe("H1 · referencias no definidas en el código modificado", () => {
  // El build NO detecta esto: OsirisModule.jsx empieza con /* eslint-disable */,
  // que apaga no-undef. Esta prueba sí.
  const leer = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");

  test("todo lo que se usa de reajusteAplicado está importado", () => {
    const mod = leer("reajusteAplicado.js");
    const src = leer("../OsirisModule.jsx");
    const exportados = (mod.match(/export (?:function|const) (\w+)/g) || [])
      .map((m) => m.replace(/export (?:function|const) /, ""));
    const bloque = (src.match(/import \{[^}]*\} from "\.\/osiris\/reajusteAplicado";/) || [""])[0];
    const faltan = exportados.filter((n) => {
      if (!new RegExp("(?:^|[^\\w.])" + n + "\\s*\\(").test(src)) return false;   // no se usa
      return bloque.indexOf(n) < 0;                                               // se usa y no está importado
    });
    expect(faltan).toEqual([]);
  });

  test("el mismo control para condicionesConfigurables", () => {
    const mod = leer("condicionesConfigurables.js");
    const src = leer("../OsirisModule.jsx");
    const exportados = (mod.match(/export (?:function|const) (\w+)/g) || [])
      .map((m) => m.replace(/export (?:function|const) /, ""));
    const bloque = (src.match(/import \{[^}]*\} from "\.\/osiris\/condicionesConfigurables";/) || [""])[0];
    const faltan = exportados.filter((n) =>
      new RegExp("(?:^|[^\\w.])" + n + "\\s*\\(").test(src) && bloque.indexOf(n) < 0);
    expect(faltan).toEqual([]);
  });

  test("no quedó ninguna lectura del global que nadie asigna", () => {
    // `window.__usuarioOsiris` no se escribe en ningún lado: el rastro quedaba
    // sin autor. La identidad sale de `usuarioActual`.
    const src = leer("../OsirisModule.jsx");
    const enElPanel = src.slice(src.indexOf("Activacion del reajuste"));
    expect(enElPanel.indexOf("__usuarioOsiris")).toBe(-1);
  });
});
