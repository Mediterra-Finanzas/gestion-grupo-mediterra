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
  previsualizarActivacion, previsualizarDesactivacion, puedeCrearActivacion,
  ACTIVACIONES_NUEVAS_HABILITADAS,
} from "./reajusteAplicado";
import { ACTIVACION, DATOS_ACTIVACION, filas, porTemp, r2, TABLA_CANDIDATO } from "./fixturesReajuste";

const USUARIO = { nombre: "Prueba Sintetica", email: "prueba@invalid" };
const ARGS = Object.assign({}, DATOS_ACTIVACION, {
  usuarioActual: USUARIO, puedeEditar: true, confirmado: true, impacto: 25690.69,
});

// El mismo archivo corre en el candidato y en la version de recuperacion.
// Lo que prueba el MOTOR usa un contrato ya activado, armado desde la fixture,
// asi que vale en las dos. Lo que prueba la ACCION de crear una activacion
// solo aplica donde esta permitida, y alla se comprueba el rechazo.
const sePuedeCrear = ACTIVACIONES_NUEVAS_HABILITADAS;
const dCrear = sePuedeCrear ? describe : describe.skip;
const ACTIVAR = (ct) => Object.assign({}, ct, { reajusteActivacion: Object.assign({}, ACTIVACION) });

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
dCrear("H4 · permiso dentro de activar, desactivar y reactivar", () => {
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
dCrear("H5/H6 · identidad canónica e historial que no se pisa", () => {
  const { CONTRATO } = require("./fixturesReajuste");
  // Estas pruebas miran lo que deja la ACCION, asi que tienen que pasar por
  // ella y no por la fixture ya sellada.
  const ACTIVAR = (ct) => activar(ct, ARGS).contrato;

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
  // que apaga no-undef. Y la primera versión de este control comparaba cadenas,
  // así que se le escapaban los imports con alias —justo donde viven
  // `activarReajuste`, `desactivarReajuste` y `reajusteActivadoDeFila`— y las
  // constantes, que no se usan en posición de llamada. Acá corre no-undef de
  // verdad sobre el archivo entero, con `noInlineConfig` para que el
  // /* eslint-disable */ de la cabecera no lo apague. No cambia la
  // configuración de lint del proyecto: es un linter en memoria, solo para
  // este archivo y solo con estas dos reglas.
  const leer = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");

  const revisor = () => {
    const { Linter } = require("eslint");
    const linter = new Linter();
    linter.defineParser("babel", require("@babel/eslint-parser"));
    // R1: en TEXTO JSX una secuencia de escape no se decodifica, se imprime
    // literal. Dentro de una cadena o un template literal sí se decodifica.
    // Esta regla mira exactamente los nodos de texto.
    linter.defineRule("escape-en-texto-jsx", {
      create: (ctx) => ({
        JSXText(node) {
          const m = (node.value || "").match(/\\u[0-9a-fA-F]{4}/g);
          if (m) ctx.report({ node, message: "escape literal en texto JSX: " + m.join(" ") });
        },
      }),
    });
    const cfg = {
      parser: "babel",
      parserOptions: {
        requireConfigFile: false, ecmaVersion: 2020, sourceType: "module",
        babelOptions: { presets: [require.resolve("@babel/preset-react")] },
        ecmaFeatures: { jsx: true },
      },
      env: { browser: true, es2021: true, node: true },
      noInlineConfig: true,
      rules: { "no-undef": "error", "escape-en-texto-jsx": "error" },
    };
    return (src, regla) => linter.verify(src, cfg)
      .filter((m) => m.ruleId === regla)
      .map((m) => m.line + ": " + m.message);
  };

  test("ninguna referencia no definida en OsirisModule.jsx", () => {
    expect(revisor()(leer("../OsirisModule.jsx"), "no-undef")).toEqual([]);
  });

  test("el control detecta un import retirado, con alias y sin alias", () => {
    // Si esta prueba no fallara al retirar un import, no estaría controlando nada.
    const ver = revisor();
    const src = leer("../OsirisModule.jsx");
    expect(ver(src.replace("activar as activarReajuste, ", ""), "no-undef").length)
      .toBeGreaterThan(0);                                   // con alias
    expect(ver(src.replace("historialActivacion, ", ""), "no-undef").length)
      .toBeGreaterThan(0);                                   // sin alias
    expect(ver(src.replace("REAJ_ACTIVADO", "REAJ_ACTIVADO_QUE_NO_EXISTE"), "no-undef").length)
      .toBeGreaterThan(0);                                   // constante, no función
  });

  test("ninguna secuencia de escape literal en texto JSX", () => {
    expect(revisor()(leer("../OsirisModule.jsx"), "escape-en-texto-jsx")).toEqual([]);
  });

  test("el control de escapes detecta uno reintroducido", () => {
    const src = leer("../OsirisModule.jsx").replace(
      "Sellado: {act.pct} % ·",
      "Sellado: {act.pct} % " + String.fromCharCode(92) + "u00b7");
    expect(revisor()(src, "escape-en-texto-jsx").length).toBeGreaterThan(0);
  });

  test("no quedó ninguna lectura del global que nadie asigna", () => {
    // `window.__usuarioOsiris` no se escribe en ningún lado: el rastro quedaba
    // sin autor. La identidad sale de `usuarioActual`.
    const src = leer("../OsirisModule.jsx");
    const enElPanel = src.slice(src.indexOf("Activacion del reajuste"));
    expect(enElPanel.indexOf("__usuarioOsiris")).toBe(-1);
  });
});

// ═════════════════════════════════════════════════════════════════
describe("version: crear activaciones", () => {
  const { CONTRATO } = require("./fixturesReajuste");

  if (sePuedeCrear) {
    test("en el candidato, la accion crea y sella", () => {
      const res = activar(CONTRATO(), ARGS);
      expect(res.ok).toBe(true);
      expect(res.contrato.reajusteActivacion.sello.pct).toBe(2);
    });
  } else {
    test("en la version de recuperacion, la accion se rechaza y no escribe", () => {
      expect(puedeCrearActivacion().puede).toBe(false);
      const res = activar(CONTRATO(), ARGS);
      expect(res.ok).toBe(false);
      expect(res.contrato.reajusteActivacion).toBeUndefined();
    });

    test("pero una activacion existente SIGUE calculando igual", () => {
      const f = porTemp(filas(ACTIVAR(CONTRATO())));
      Object.keys(TABLA_CANDIDATO).forEach((t) => expect(r2(f[t].montoFact)).toBe(r2(TABLA_CANDIDATO[t])));
    });

    test("y se puede desactivar, con sus exigencias", () => {
      const res = desactivar(ACTIVAR(CONTRATO()), {
        motivo: "Motivo sintetico", confirmado: true, usuarioActual: USUARIO,
      });
      expect(res.ok).toBe(true);
      expect(historialActivacion(res.contrato).length).toBeGreaterThan(0);
    });
  }
});

// ══════════════════════════════════════════════════════════════════
// Defectos que encontró la SEGUNDA revisión independiente, sobre la
// reescritura del bloque de acciones. Los tres son de pantalla, y los dos
// primeros los dejó pasar la primera tanda de pruebas porque ninguna
// reproducía la forma de los argumentos que la pantalla realmente pasa.
describe("R2 · la vista previa no puede mostrar cero justo cuando hay que decidir", () => {
  const { CONTRATO } = require("./fixturesReajuste");
  // Así llega el contrato a la pantalla: los cuatro campos cargados y
  // `activado` todavía en falso, porque activar es justo lo que se va a
  // confirmar. La base se calcula con la activación apagada (H3).
  const porActivar = () => CONTRATO({
    reajusteActivacion: {
      activado: false,
      fechaReferencia: "2026-07-01", respaldo: "Comprobante del primer pago",
      reglaFecha: "inicioPeriodoServicio", reglaFechaRespaldo: "Clausula 1.2.5",
    },
  });
  const base = (ct) => derivarRoyaltyComercialDesdeContratos(
    [{ ...ct, reajusteActivacion: { ...(ct.reajusteActivacion || {}), activado: false } }], { ct_sint: [] });

  test("la previa anuncia la diferencia real, no 0", () => {
    const ct = porActivar();
    const prev = previsualizarActivacion(ct, base(ct), { mesCobro: ct.rcMesCobro });
    expect(prev.filasQueCambian).toBe(4);
    expect(prev.diferenciaAplicada).toBeCloseTo(25690.69, 2);
  });

  test("y cuenta las filas protegidas por factura o pago", () => {
    const ct = porActivar();
    const antes = (f) => (f.temporada === "2027/2028" ? { nFact: "123", pagado: true } : null);
    const prev = previsualizarActivacion(ct, base(ct), { mesCobro: ct.rcMesCobro, antecedentesDe: antes });
    expect(prev.filasIntocables).toBe(1);
    expect(prev.diferenciaAplicada).toBeCloseTo(25690.69 - 2518.2, 2);
  });

  test("el impacto que se guarda en el historial es el que se confirmó", () => {
    const ct = porActivar();
    const prev = previsualizarActivacion(ct, base(ct), { mesCobro: ct.rcMesCobro });
    const res = activar(ct, {
      fechaReferencia: "2026-07-01", respaldo: "Comprobante del primer pago",
      reglaFecha: "inicioPeriodoServicio", reglaFechaRespaldo: "Clausula 1.2.5",
      puedeEditar: true, usuarioActual: USUARIO, confirmado: true,
      impacto: prev.diferenciaAplicada,
    });
    if (!sePuedeCrear) { expect(res.ok).toBe(false); return; }
    expect(res.ok).toBe(true);
    expect(historialActivacion(res.contrato)[0].impactoConfirmado).toBeCloseTo(25690.69, 2);
  });

  test("lo que la previa anuncia es lo que el motor termina calculando", () => {
    const ct = porActivar();
    const prev = previsualizarActivacion(ct, base(ct), { mesCobro: ct.rcMesCobro });
    const activo = { ...ct, reajusteActivacion: { ...ct.reajusteActivacion, activado: true } };
    const real = filas(activo).reduce((s, f) => s + f.montoFact, 0);
    expect(r2(real)).toBeCloseTo(r2(prev.totalAplicado), 2);
  });

  test("sin fecha de referencia la previa no inventa nada", () => {
    const ct = CONTRATO({ reajusteActivacion: { activado: false } });
    const prev = previsualizarActivacion(ct, base(ct), { mesCobro: ct.rcMesCobro });
    expect(prev.diferenciaAplicada).toBe(0);
    expect(prev.activacion.motivo).toMatch(/[Ff]alta/);
  });
});

// ══════════════════════════════════════════════════════════════════
dCrear("R3 · reactivar desde la pantalla no puede quedar fechado hacia atrás", () => {
  const { CONTRATO } = require("./fixturesReajuste");
  const hoy = new Date().toISOString().slice(0, 10);

  // La pantalla pasa SOLO los términos declarados. Antes hacía un spread de
  // `reajusteActivacion` entero, que arrastraba la `fecha` de la activación
  // anterior: la reactivación quedaba fechada antes de la desactivación que
  // la precede.
  const comoLaPantalla = (ct) => ({
    fechaReferencia: (ct.reajusteActivacion || {}).fechaReferencia,
    respaldo: (ct.reajusteActivacion || {}).respaldo,
    reglaFecha: (ct.reajusteActivacion || {}).reglaFecha,
    reglaFechaRespaldo: (ct.reajusteActivacion || {}).reglaFechaRespaldo,
    puedeEditar: true, usuarioActual: USUARIO, confirmado: true, impacto: 25690.69,
  });

  test("el evento de reactivación lleva la fecha de hoy", () => {
    const uno = activar(CONTRATO(), Object.assign({}, DATOS_ACTIVACION, {
      usuarioActual: USUARIO, puedeEditar: true, confirmado: true, fecha: "2026-10-05",
    }));
    const dos = desactivar(uno.contrato, {
      motivo: "Se anulo el respaldo", usuarioActual: USUARIO, confirmado: true, impacto: -25690.69,
    });
    const tres = activar(dos.contrato, comoLaPantalla(dos.contrato));
    expect(tres.ok).toBe(true);
    const h = historialActivacion(tres.contrato);
    expect(h.length).toBe(3);
    expect(h[2].evento).toBe("reactivacion");
    expect(h[2].fecha).toBe(hoy);
    // Y el historial queda en orden: cada evento, igual o posterior al anterior.
    expect(h[2].fecha >= h[1].fecha).toBe(true);
    expect(h[1].fecha >= h[0].fecha).toBe(true);
  });

  test("reactivar conserva los dos eventos anteriores y el motivo de la baja", () => {
    const uno = activar(CONTRATO(), Object.assign({}, DATOS_ACTIVACION, {
      usuarioActual: USUARIO, puedeEditar: true, confirmado: true,
    }));
    const dos = desactivar(uno.contrato, {
      motivo: "Se anulo el respaldo del primer pago", usuarioActual: USUARIO, confirmado: true,
    });
    const tres = activar(dos.contrato, comoLaPantalla(dos.contrato));
    const h = historialActivacion(tres.contrato);
    expect(h.map((e) => e.evento)).toEqual(["activacion", "desactivacion", "reactivacion"]);
    expect(h[2].motivoAnterior).toMatch(/respaldo/);
    expect(h[2].anterior).toEqual({ pct: 2, fechaReferencia: "2026-07-01", reglaFecha: "inicioPeriodoServicio" });
  });
});
