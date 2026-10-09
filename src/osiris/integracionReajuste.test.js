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
    // Vale igual para los ATRIBUTOS: en JSX, la cadena de un atributo tampoco
    // decodifica escapes. La primera version de esta regla solo miraba el
    // texto y dejaba ese punto ciego.
    // Solo las secuencias unicode y hexadecimal. Se probo incluir \\n, \\t y
    // \\r, y daban falsos positivos sobre literales legitimos: una ruta de
    // Windows en un title, o una expresion regular mostrada como texto. La
    // clase real del defecto (R1) es \\uXXXX, que nadie escribe a proposito
    // dentro de JSX.
    const ESCAPES = /\\u[0-9a-fA-F]{4}|\\x[0-9a-fA-F]{2}/g;
    linter.defineRule("escape-en-texto-jsx", {
      create: (ctx) => ({
        JSXText(node) {
          const m = (node.value || "").match(ESCAPES);
          if (m) ctx.report({ node, message: "escape literal en texto JSX: " + m.join(" ") });
        },
        JSXAttribute(node) {
          const v = node.value;
          if (!v || v.type !== "Literal" || typeof v.value !== "string") return;
          const m = v.value.match(ESCAPES);
          if (m) ctx.report({ node, message: "escape literal en atributo JSX: " + m.join(" ") });
        },
      }),
    });
    // R3 no tenia control: la prueba de abajo replica los argumentos de la
    // pantalla, pero no mira la pantalla. Restaurar el spread en el sitio de
    // llamada dejaba la suite en verde. Esta regla mira el sitio real.
    // R4: `reajusteOperativo` no sabe nada de activaciones, asi que despues de
    // activar seguia diciendo "estos montos no llevan reajuste" encima de un
    // total que si lo llevaba. La pantalla tiene que usar la envoltura.
    linter.defineRule("aviso-con-activacion", {
      create: (ctx) => ({
        CallExpression(node) {
          if (node.callee && node.callee.name === "reajusteOperativo") {
            ctx.report({ node, message: "la pantalla debe usar reajusteOperativoConActivacion" });
          }
        },
      }),
    });
    linter.defineRule("sin-spread-al-activar", {
      create: (ctx) => ({
        CallExpression(node) {
          if (!node.callee || node.callee.name !== "activarReajuste") return;
          const arg = node.arguments[1];
          if (!arg || arg.type !== "ObjectExpression") return;
          if (arg.properties.some((p) => p.type === "SpreadElement" || p.type === "ExperimentalSpreadProperty")) {
            ctx.report({ node, message: "activarReajuste recibe un spread: arrastra la fecha de la activacion anterior" });
          }
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
      rules: { "no-undef": "error", "escape-en-texto-jsx": "error",
        "sin-spread-al-activar": "error", "aviso-con-activacion": "error" },
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

  test("la pantalla no le pasa un spread a activarReajuste", () => {
    expect(revisor()(leer("../OsirisModule.jsx"), "sin-spread-al-activar")).toEqual([]);
  });

  test("y el control lo detecta si alguien lo repone", () => {
    const src = leer("../OsirisModule.jsx")
      .replace("activarReajuste(r, {", "activarReajuste(r, {...(r.reajusteActivacion||{}),");
    expect(revisor()(src, "sin-spread-al-activar").length).toBeGreaterThan(0);
  });

  test("el control de escapes también mira los atributos JSX", () => {
    const con = '<div><input placeholder="a ' + String.fromCharCode(92) + 'u00b7 b" /></div>;';
    expect(revisor()(con, "escape-en-texto-jsx").length).toBeGreaterThan(0);
  });

  test("el control de escapes detecta uno reintroducido", () => {
    const src = leer("../OsirisModule.jsx").replace(
      "Sellado: {act.pct} % ·",
      "Sellado: {act.pct} % " + String.fromCharCode(92) + "u00b7");
    expect(revisor()(src, "escape-en-texto-jsx").length).toBeGreaterThan(0);
  });

  test("la pantalla usa el aviso que sabe de la activación", () => {
    expect(revisor()(leer("../OsirisModule.jsx"), "aviso-con-activacion")).toEqual([]);
  });

  test("y el control lo detecta si alguien vuelve al aviso ciego", () => {
    const src = leer("../OsirisModule.jsx").replace("reajusteOperativoConActivacion(r)", "reajusteOperativo(r)");
    expect(revisor()(src, "aviso-con-activacion").length).toBeGreaterThan(0);
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
    // Se activa con la ACCION, no levantando la bandera a mano. Levantarla no
    // produce un sello, y desde que el motor lo exige eso ya no aplica nada:
    // la prueba habria comparado la previa contra un contrato que no calcula.
    // Usar la accion es ademas lo que hace la pantalla.
    const res = activar(ct, {
      fechaReferencia: "2026-07-01", respaldo: "Comprobante",
      reglaFecha: "inicioPeriodoServicio", reglaFechaRespaldo: "Clausula 1.2.5",
      puedeEditar: true, usuarioActual: USUARIO, confirmado: true,
    });
    if (!sePuedeCrear) { expect(res.ok).toBe(false); return; }
    expect(res.ok).toBe(true);
    const real = filas(res.contrato).reduce((s, f) => s + f.montoFact, 0);
    // Comparar la previa contra el motor es necesario pero no suficiente: los
    // dos usan el mismo cálculo, así que un error común pasaría. Las cifras
    // esperadas van escritas, independientes de ese cálculo: 41,97 ha ×
    // US$3.000 compuesto al 2 % anual desde 2026-07-01.
    expect(r2(real)).toBeCloseTo(655240.69, 2);
    expect(r2(prev.totalAplicado)).toBeCloseTo(655240.69, 2);
    expect(r2(real)).toBeCloseTo(r2(prev.totalAplicado), 2);
    // Y fila por fila, contra los importes escritos.
    const f = porTemp(filas(res.contrato));
    Object.keys(TABLA_CANDIDATO).forEach((t) =>
      expect(r2(f[t].montoFact)).toBe(r2(TABLA_CANDIDATO[t])));
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

// ══════════════════════════════════════════════════════════════════
// R4 · encontrado en la revisión en navegador, no por las pruebas: con el
// reajuste ya activado y $647.533,99 en pantalla, el encabezado seguía
// diciendo "Estos montos no llevan reajuste (...) la activación no está
// hecha". El aviso es de la entrega A y nunca contempló que la activación
// pudiera existir.
describe("R4 · el aviso no puede contradecir al importe", () => {
  const { CONTRATO } = require("./fixturesReajuste");
  const {
    reajusteOperativoConActivacion,
  } = require("./reajusteAplicado");
  const {
    reajusteOperativo, REAJUSTE_ACTIVADO_APLICANDO, REAJUSTE_REGISTRADO_SIN_APLICAR,
  } = require("./condicionesConfigurables");

  test("sin activar sigue diciendo que no se aplica", () => {
    const ro = reajusteOperativoConActivacion(CONTRATO());
    expect(ro.estado).toBe(REAJUSTE_REGISTRADO_SIN_APLICAR);
    expect(ro.aplica).toBe(false);
    expect(ro.aviso).toMatch(/no se está aplicando/);
  });

  test("activado dice que SÍ se aplica, con el porcentaje sellado", () => {
    const ro = reajusteOperativoConActivacion(CONTRATO({ reajusteActivacion: ACTIVACION }));
    expect(ro.estado).toBe(REAJUSTE_ACTIVADO_APLICANDO);
    expect(ro.aplica).toBe(true);
    expect(ro.pct).toBe(2);
    // El texto exacto lo fija R7: sin el detalle de filas no puede afirmar
    // que los importes de la pantalla lleven el ajuste. Lo que R4 custodia
    // es que NO siga diciendo lo contrario.
    expect(ro.aviso).toMatch(/El reajuste está activado/);
    expect(ro.aviso).toMatch(/2026-07-01/);
    // Y no puede quedar ni rastro de la afirmación contraria.
    expect(ro.aviso).not.toMatch(/no se está aplicando/);
    expect(ro.aviso).not.toMatch(/que no está hecha/);
  });

  test("avisa que las filas con factura o pago no se recalculan", () => {
    const ro = reajusteOperativoConActivacion(CONTRATO({ reajusteActivacion: ACTIVACION }));
    expect(ro.aviso).toMatch(/factura o pago/);
  });

  test("la función vieja sigue intacta: es la envoltura la que decide", () => {
    // `reajusteOperativo` no cambió. Quien no le pase por la envoltura sigue
    // viendo lo de antes, que es justamente el defecto; por eso hay un
    // control de código que lo impide en la pantalla.
    const ct = CONTRATO({ reajusteActivacion: ACTIVACION });
    expect(reajusteOperativo(ct).estado).toBe(REAJUSTE_REGISTRADO_SIN_APLICAR);
  });

  test("una activación incompleta no se anuncia como aplicándose", () => {
    const ro = reajusteOperativoConActivacion(CONTRATO({
      reajusteActivacion: { activado: true },        // sin fecha ni respaldo
    }));
    expect(ro.estado).toBe(REAJUSTE_REGISTRADO_SIN_APLICAR);
    expect(ro.aplica).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// R7 · el mismo error que R4, cometido al corregir R4: un aviso que afirma
// algo sobre los importes sin mirar los importes. Con TODAS las temporadas
// protegidas por factura o pago, ninguna lleva el ajuste y el total es el de
// la base, pero el aviso decía "estos montos YA lo llevan".
describe("R7 · el aviso solo afirma lo que puede saber", () => {
  const { CONTRATO } = require("./fixturesReajuste");
  const { reajusteOperativoConActivacion } = require("./reajusteAplicado");

  const activo = () => CONTRATO({ reajusteActivacion: ACTIVACION });

  test("sin el detalle de filas no afirma nada sobre los importes", () => {
    const ro = reajusteOperativoConActivacion(activo());
    expect(ro.llevanElAjuste).toBe(null);
    expect(ro.aviso).not.toMatch(/YA lo incluyen/);
    expect(ro.aviso).toMatch(/las que lo tengan quedan en su valor base/);
  });

  test("con filas que cambian, dice cuántas", () => {
    const ro = reajusteOperativoConActivacion(activo(), { filas: { cambian: 3, protegidas: 1 } });
    expect(ro.llevanElAjuste).toBe(3);
    expect(ro.aviso).toMatch(/^3 temporada\(s\) de esta pantalla llevan el reajuste/);
    expect(ro.aviso).toMatch(/1 quedan en su valor base/);
  });

  test("con todas protegidas, dice que NINGUNA lo lleva", () => {
    const ro = reajusteOperativoConActivacion(activo(), { filas: { cambian: 0, protegidas: 5 } });
    expect(ro.llevanElAjuste).toBe(0);
    expect(ro.aviso).toMatch(/NINGUNA temporada de esta pantalla lo lleva/);
    expect(ro.aviso).toMatch(/las 5 con factura o pago registrado no se recalculan/);
    expect(ro.titulo).toMatch(/sin efecto/);
  });

  test("y en ese caso el importe efectivo es el de la base", () => {
    // La comprobación que ata el aviso al número: si ninguna fila cambia, el
    // total con la activación encendida tiene que ser igual al de la base.
    const ct = CONTRATO({
      reajusteActivacion: ACTIVACION,
      rcPagos: ["2026/2027", "2027/2028", "2028/2029", "2029/2030", "2030/2031"]
        .reduce((m, t) => (m[t] = { nFact: "9", pagado: true }, m), {}),
    });
    const total = filas(ct).reduce((s, f) => s + f.montoFact, 0);
    expect(r2(total)).toBe(629550);
    const apagado = { ...ct, reajusteActivacion: { ...ACTIVACION, activado: false } };
    expect(r2(filas(apagado).reduce((s, f) => s + f.montoFact, 0))).toBe(629550);
  });
});

// ══════════════════════════════════════════════════════════════════
// D2 · un reajuste del 0 % no es un reajuste. `faltantesReajuste` lo acepta
// como configuración completa, y el campo de la pantalla hace
// parseFloat(...)||0, así que cualquier tecla no numérica deja 0.
dCrear("D2 · no se activa un reajuste de 0 %", () => {
  const { CONTRATO } = require("./fixturesReajuste");
  const CERO = () => CONTRATO({
    reajuste: { tipo: "porcentaje", pct: 0, desde: "2026-07-01", referencia: "x", confirmado: true },
  });

  test("la acción lo rechaza y no escribe nada", () => {
    const ct = CERO();
    const res = activar(ct, Object.assign({}, DATOS_ACTIVACION, {
      usuarioActual: USUARIO, puedeEditar: true, confirmado: true,
    }));
    expect(res.ok).toBe(false);
    expect(res.motivo).toMatch(/no tiene efecto sobre ningun importe/);
    // Y no se le atribuye una intencion que no consta.
    expect(res.motivo).toMatch(/No consta si ese 0 se ingreso asi/);
    expect(res.motivo).not.toMatch(/este contrato no reajusta/);
    expect(res.contrato).toBe(ct);                 // ni una copia modificada
  });

  test("un porcentaje normal sigue activándose", () => {
    expect(activar(CONTRATO(), Object.assign({}, DATOS_ACTIVACION, {
      usuarioActual: USUARIO, puedeEditar: true, confirmado: true,
    })).ok).toBe(true);
  });
});

describe("D2 · una activación al 0 % que viniera de los datos se nombra", () => {
  const { CONTRATO } = require("./fixturesReajuste");
  const { reajusteOperativoConActivacion } = require("./reajusteAplicado");

  test("el aviso dice que no mueve importes", () => {
    const ct = CONTRATO({
      reajuste: { tipo: "porcentaje", pct: 0, desde: "2026-07-01", referencia: "x", confirmado: true },
      reajusteActivacion: Object.assign({}, ACTIVACION, { sello: { pct: 0, fechaReferencia: "2026-07-01", reglaFecha: "inicioPeriodoServicio" } }),
    });
    const ro = reajusteOperativoConActivacion(ct);
    expect(ro.aplica).toBe(false);
    expect(ro.llevanElAjuste).toBe(0);
    expect(ro.aviso).toMatch(/No cambia ningun importe/);
    expect(ro.titulo).toMatch(/0 % registrado: sin efecto de reajuste/);
    // Y desde que el sello exige porcentaje positivo, el motor tampoco lo
    // da por activo: el registro se conserva y no calcula.
    const { estadoActivacion } = require("./reajusteAplicado");
    expect(estadoActivacion(ct).activo).toBe(false);
    // No se le atribuye respaldo ni intencion.
    expect(ro.aviso).toMatch(/no se le atribuye un respaldo que no consta/);
  });
});

// ══════════════════════════════════════════════════════════════════
// El origen del cero. Antes de corregir el campo, un vacío o un valor
// inválido se guardaba como 0, así que un cero histórico puede ser
// cualquiera de las tres cosas y no se le atribuye intención.
describe("El origen de un cero solo consta si se ingresó con el campo corregido", () => {
  const { CONTRATO } = require("./fixturesReajuste");
  const { estadoPct, configReajuste } = require("./condicionesConfigurables");
  const CERO = (extra) => CONTRATO({
    reajuste: Object.assign({ tipo: "porcentaje", pct: 0, desde: "2026-07-01",
      referencia: "x", confirmado: true }, extra || {}),
  });

  test("un cero histórico queda con origen desconocido", () => {
    const e = estadoPct(CERO());
    expect(e.estado).toBe("cero");
    expect(e.origen).toBe("noConsta");
  });

  test("un cero escrito con el campo corregido lleva su marca", () => {
    const e = estadoPct(CERO({ pctOrigen: "ingresado" }));
    expect(e.estado).toBe("cero");
    expect(e.origen).toBe("ingresado");
  });

  test("la marca no aparece por leer ni por guardar otro campo", () => {
    // configReajuste es lo que la pantalla lee en cada render: no escribe.
    const ct = CERO();
    configReajuste(ct);
    configReajuste(ct);
    expect(ct.reajuste.pctOrigen).toBe(undefined);
    // Y editar otro campo del reajuste no la introduce: el patrón de la
    // pantalla es extender lo que ya hay y tocar una sola clave.
    const trasEditarOtro = Object.assign({}, ct, {
      reajuste: Object.assign({}, ct.reajuste, { desde: "2027-01-01" }),
    });
    expect(trasEditarOtro.reajuste.pctOrigen).toBe(undefined);
    expect(estadoPct(trasEditarOtro).origen).toBe("noConsta");
  });

  test("el valor no se migra ni se reinterpreta: sigue siendo 0", () => {
    const ct = CERO();
    expect(configReajuste(ct).pct).toBe(0);
    expect(configReajuste(ct).pctCrudo).toBe("0");
    // Y sigue contando como configuración completa, no como dato faltante.
    const { faltantesReajuste } = require("./condicionesConfigurables");
    expect(faltantesReajuste(ct)).toEqual([]);
  });

  test("un valor inválido NO se convierte en cero: queda sin definir", () => {
    const ct = CERO({ pct: "dos por ciento" });
    const e = estadoPct(ct);
    expect(e.estado).toBe("invalido");
    expect(e.valor).toBe(null);
    const { faltantesReajuste } = require("./condicionesConfigurables");
    expect(faltantesReajuste(ct).join(" ")).toMatch(/no es un numero/);
  });
});

// ══════════════════════════════════════════════════════════════════
// Lo que tiene que correr EN LA RECUPERACIÓN. Allá no se puede crear una
// activación, así que la creación exitosa se omite; lo que NO puede omitirse
// es la prueba negativa: que el intento se rechace dentro de la acción, sin
// tocar datos ni historial. Y que lo ya activo se conserve y se pueda
// desactivar con autorización.
const dNoCrear = sePuedeCrear ? describe.skip : describe;

dNoCrear("Recuperación · el rechazo ocurre dentro de la acción", () => {
  const { CONTRATO } = require("./fixturesReajuste");
  const ARGS_OK = Object.assign({}, DATOS_ACTIVACION, {
    usuarioActual: USUARIO, puedeEditar: true, confirmado: true,
  });

  test("activar se rechaza y no devuelve un contrato modificado", () => {
    const ct = CONTRATO();
    const res = activar(ct, ARGS_OK);
    expect(res.ok).toBe(false);
    expect(res.motivo).toMatch(/no permite crear nuevas/);
    expect(res.contrato).toBe(ct);                      // la misma referencia
    expect(ct.reajusteActivacion).toBe(undefined);      // ni se creó el campo
  });

  test("reactivar tampoco: un contrato dado de baja no se puede volver a encender", () => {
    // Un contrato que estuvo activo y se desactivó: conserva sello e historial.
    const dado = Object.assign({}, CONTRATO(), {
      reajusteActivacion: Object.assign({}, ACTIVACION, {
        activado: false, desactivadoMotivo: "Se anulo el respaldo",
        historial: [{ evento: "activacion", autor: "X", fecha: "2026-10-05" },
                    { evento: "desactivacion", autor: "X", fecha: "2026-10-06" }],
      }),
    });
    const antes = JSON.parse(JSON.stringify(dado));
    const res = activar(dado, ARGS_OK);
    expect(res.ok).toBe(false);
    expect(res.contrato).toBe(dado);
    // Ni un evento más, ni un campo movido.
    expect(dado).toEqual(antes);
    expect(historialActivacion(dado).length).toBe(2);
  });

  test("los importes de una activación vigente se conservan", () => {
    const activo = CONTRATO({ reajusteActivacion: ACTIVACION });
    const f = porTemp(filas(activo));
    Object.keys(TABLA_CANDIDATO).forEach((t) =>
      expect(r2(f[t].montoFact)).toBe(r2(TABLA_CANDIDATO[t])));
  });

  test("desactivar sí está permitido, con sus tres exigencias", () => {
    const activo = CONTRATO({ reajusteActivacion: ACTIVACION });
    // Sin motivo, no.
    expect(desactivar(activo, { confirmado: true, usuarioActual: USUARIO }).ok).toBe(false);
    // Sin confirmación, no.
    expect(desactivar(activo, { motivo: "x", usuarioActual: USUARIO }).ok).toBe(false);
    // Sin permiso, no.
    expect(desactivar(activo, { motivo: "x", confirmado: true, usuarioActual: USUARIO, puedeEditar: false }).ok).toBe(false);
    // Con las tres, sí, y los importes vuelven a la base.
    const res = desactivar(activo, {
      motivo: "Se anulo el respaldo del primer pago", confirmado: true,
      usuarioActual: USUARIO, impacto: -25690.69,
    });
    expect(res.ok).toBe(true);
    const f = porTemp(filas(res.contrato));
    Object.keys(TABLA_CANDIDATO).forEach((t) => expect(r2(f[t].montoFact)).toBe(125910));
    // Y el rastro queda.
    expect(historialActivacion(res.contrato).slice(-1)[0].evento).toBe("desactivacion");
  });
});

// ══════════════════════════════════════════════════════════════════
// Desde que la diferencia se mide contra el importe actual, puede ser
// negativa. Hoy no hay un camino que lo produzca —el motor y la previa usan
// el mismo sello—, así que esto fija la semántica del modelo, no el render.
// La pantalla se cambió para no esconder una baja, y ese cambio es
// defensivo: no tiene prueba porque el estado no es alcanzable.
describe("La diferencia contra el actual puede ser negativa", () => {
  const { reajusteDeFila } = require("./reajusteAplicado");
  const { CONTRATO } = require("./fixturesReajuste");

  test("si el actual fuera mayor que el propuesto, la diferencia baja", () => {
    const ct = CONTRATO({ reajusteActivacion: ACTIVACION });
    const d = reajusteDeFila(ct, { temporada: "2027/2028", montoFact: 125910 },
      { mesCobro: "Abril", actual: 140000 });
    expect(d.base).toBe(125910);
    expect(d.actual).toBe(140000);
    expect(d.ajustado).toBeCloseTo(128428.2, 2);
    expect(d.diferencia).toBeCloseTo(-11571.8, 2);
  });

  test("sin pasar el actual, se asume la base y la diferencia es la de siempre", () => {
    const ct = CONTRATO({ reajusteActivacion: ACTIVACION });
    const d = reajusteDeFila(ct, { temporada: "2027/2028", montoFact: 125910 }, { mesCobro: "Abril" });
    expect(d.actual).toBe(125910);
    expect(d.diferencia).toBeCloseTo(2518.2, 2);
  });
});

// ══════════════════════════════════════════════════════════════════
// Encontrado en el navegador, en la secuencia activar → desactivar →
// cambiar la fecha → activar: el diálogo anunciaba "Filas que cambian: 0 ·
// Diferencia US$ 0.00" y el total se movía 17.983,99. La previa simulaba la
// activación conservando el SELLO ANTERIOR, mientras que `activar()` vuelve
// a sellar con los términos cargados. Previa y acción calculaban cosas
// distintas, y lo que el CFO confirmaba no era lo que se aplicaba.
describe("La previa de una reactivación usa los términos de hoy, no el sello viejo", () => {
  const { CONTRATO } = require("./fixturesReajuste");
  const { previsualizarActivacion, activar, estadoActivacion } = require("./reajusteAplicado");

  // Dado de baja, con un sello viejo que NO sirve, y términos nuevos cargados.
  const conSelloViejo = () => CONTRATO({
    reajusteActivacion: {
      activado: false,
      sello: { pct: 2, fechaReferencia: "", reglaFecha: "" },   // sello inservible
      fechaReferencia: "2026-07-01", respaldo: "Comprobante",
      reglaFecha: "inicioPeriodoServicio", reglaFechaRespaldo: "Clausula 1.2.5",
      historial: [{ evento: "activacion", autor: "X", fecha: "2026-10-05" },
                  { evento: "desactivacion", autor: "X", fecha: "2026-10-06" }],
    },
  });
  const base = (ct) => derivarRoyaltyComercialDesdeContratos(
    [{ ...ct, reajusteActivacion: { ...(ct.reajusteActivacion || {}), activado: false } }], { ct_sint: [] });

  test("la previa anuncia la diferencia real, no cero", () => {
    const ct = conSelloViejo();
    const prev = previsualizarActivacion(ct, base(ct), { mesCobro: ct.rcMesCobro });
    expect(prev.filasQueCambian).toBe(4);
    expect(prev.diferenciaAplicada).toBeCloseTo(25690.69, 2);
  });

  dCrear("y lo que se aplica coincide con lo anunciado", () => {
    test("activar mueve exactamente lo que la previa dijo", () => {
      const ct = conSelloViejo();
      const prev = previsualizarActivacion(ct, base(ct), { mesCobro: ct.rcMesCobro });
      const res = activar(ct, {
        fechaReferencia: "2026-07-01", respaldo: "Comprobante",
        reglaFecha: "inicioPeriodoServicio", reglaFechaRespaldo: "Clausula 1.2.5",
        puedeEditar: true, usuarioActual: USUARIO, confirmado: true,
        impacto: prev.diferenciaAplicada,
      });
      expect(res.ok).toBe(true);
      // El sello nuevo, no el viejo.
      expect(res.contrato.reajusteActivacion.sello.fechaReferencia).toBe("2026-07-01");
      expect(estadoActivacion(res.contrato).activo).toBe(true);
      const antes = base(ct).reduce((s, f) => s + f.montoFact, 0);
      const despues = filas(res.contrato).reduce((s, f) => s + f.montoFact, 0);
      expect(r2(despues - antes)).toBeCloseTo(prev.diferenciaAplicada, 2);
    });
  });
});

// ══════════════════════════════════════════════════════════════════
// BARRIDO de las rutas de escritura que alimentan este cálculo. No es una
// auditoría del repositorio: son exactamente los campos que deciden qué
// aplica el motor, y el control comprueba que ninguno se escriba por fuera
// de una función con guarda. Es el mismo patrón que T3 dejó para el bloque
// del registro de condiciones.
describe("Barrido · ninguna ruta de escritura evita las guardas", () => {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "..", "OsirisModule.jsx"), "utf8");
  const lineas = src.split("\n");
  // Las líneas que escriben cada campo, sin contar la definición del propio
  // helper con guarda ni los comentarios.
  const escrituras = (patron) => lineas
    .map((l, i) => ({ n: i + 1, l }))
    .filter(({ l }) => patron.test(l) && !/^\s*\/\//.test(l));

  test("`reajuste` solo se escribe desde upR", () => {
    const w = escrituras(/upd\([^,]*,\s*"reajuste"/);
    expect(w.length).toBe(1);
    expect(w[0].l).toMatch(/const upR|upd\(r\.id,"reajuste",\{\.\.\.\(r\.reajuste\|\|\{\}\),\.\.\.cambios\}\)/);
    // Y upR lleva la guarda de los términos bloqueables.
    expect(src).toMatch(/TERMINOS_BLOQUEABLES\.indexOf\(k\)>=0/);
  });

  test("`reajusteActivacion` solo se escribe desde upA o desde el resultado de una acción", () => {
    const w = escrituras(/upd\([^,]*,\s*"reajusteActivacion"/);
    expect(w.length).toBe(3);
    const texto = w.map((x) => x.l).join("\n");
    // upA, con su guarda; y los dos resultados de activar/desactivar.
    expect(texto).toMatch(/const upA = \(campo,val\)=>\{ if\(!can \|\| !edit\.puede\) return;/);
    expect((texto.match(/res\.contrato\.reajusteActivacion/g) || []).length).toBe(2);
  });

  test("la configuración antigua y la base solo se escriben desde upProtegido", () => {
    // En la ficha. El alta usa `setF`, que escribe un formulario local: ahí
    // no hay registro de activación por definición.
    const campos = /"royaltyInflacion"|"rcInflacionPct"|"valorRoyaltyComercial"/;
    const w = lineas
      .map((l, i) => ({ n: i + 1, l }))
      .filter(({ l }) => campos.test(l) && !/^\s*\/\//.test(l));
    expect(w.length).toBeGreaterThan(0);
    w.forEach(({ l }) => {
      // El alta escribe un formulario local con `setF`, donde no hay registro
      // de activacion por definicion. `campo="..."` NO alcanza como escape:
      // <Campo campo="valorRoyaltyComercial" r={r}/> escribe con upd(r.id,...)
      // SIN guarda, y con ese escape el barrido lo habria dado por alta.
      const esAlta = /setF[=(]/.test(l);
      const esGuardada = /upProtegido\(/.test(l) || /const upProtegido=/.test(l) ||
        /const MOT_(ANTIGUA|BASE)=/.test(l);
      expect(esAlta || esGuardada).toBe(true);
    });
    expect(src).toMatch(/const upProtegido=\(r,campo,val,motivo\)=>\{ if\(!can\) return;/);
    expect(src).toMatch(/if\(hayRegistroDeActivacion\(r\)\)\{ window\.alert\(motivo\); return; \}/);
  });

  test("las guardas miran si el registro EXISTE, no si está vigente", () => {
    // Mirar la vigencia dejaba abierto desactivar → editar → reactivar como
    // vía de modificación económica, que no está autorizada.
    expect(src).toMatch(/const hayRegistro = hayRegistroDeActivacion\(r\);/);
    expect(src).not.toMatch(/const hayRegistro = hayRegistroVigente\(r\);/);
    // Y la base por hectárea se bloquea con el mismo criterio.
    const lineaBase = lineas.find((l) => l.indexOf("valorRoyaltyComercial") >= 0 &&
      l.indexOf("upProtegido(") >= 0);
    expect(lineaBase).toBeTruthy();
    expect(lineaBase.indexOf("can={can&&!hayRegistroDeActivacion(r)}")).toBeGreaterThan(-1);
  });

  test("cada helper declara su guarda de permiso en la misma línea", () => {
    // El título anterior decía "siguen siendo de una sola línea" y sólo
    // comprobaba que la declaración existiera: no verificaba ni la guarda ni
    // la forma. Y el control de T3 ya no depende del formato —recorta el
    // cuerpo del helper por balance de llaves—, así que lo que importa es
    // que la guarda esté, no que la línea sea una.
    expect(src).toMatch(/const upR = \(campo,val\)=>\{ if\(!can\) return;/);
    expect(src).toMatch(/const upB = \(campo,val\)=>\{ if\(!can\) return;/);
    expect(src).toMatch(/const upA = \(campo,val\)=>\{ if\(!can \|\| !edit\.puede\) return;/);
    expect(src).toMatch(/const upProtegido=\(r,campo,val,motivo\)=>\{ if\(!can\) return;/);
  });
});

// ══════════════════════════════════════════════════════════════════
// D-3 · El aviso del porcentaje no positivo leía la configuración de HOY y se
// adelantaba a `reajusteOperativo`. Con la configuración antigua operando al
// 5 %/año anunciaba "0 % registrado: sin efecto de reajuste" encima de un
// total de 695.732,23 que sí llevaba reajuste; y con sello 2 % y la
// configuración editada a −2 % anunciaba "0 % registrado" mientras el sello
// aplicaba 2 %. Ahora lee el SELLO y cede el aviso cuando la antigua opera.
// No mueve importes: esta función es de presentación.
describe("D-3 · el aviso del porcentaje no positivo no tapa nada", () => {
  const { CONTRATO } = require("./fixturesReajuste");
  const { reajusteOperativoConActivacion, estadoActivacion, selloCompleto } = require("./reajusteAplicado");
  const total = (ct) => r2(filasDe(ct).reduce((s, f) => s + f.montoFact, 0));
  const SELLO = (pct) => ({ pct, fechaReferencia: "2026-07-01", reglaFecha: "inicioPeriodoServicio" });

  test("con la antigua al 5 %/año, el aviso habla de la antigua y no de 'sin efecto'", () => {
    const ct = CONTRATO({
      royaltyInflacion: true, rcInflacionPct: 5,
      reajuste: { tipo: "porcentaje", pct: 0, desde: "2026-07-01", referencia: "Clausula", confirmado: true },
      reajusteActivacion: Object.assign({}, ACTIVACION, { sello: SELLO(0) }),
    });
    expect(total(ct)).toBeCloseTo(695732.23, 2);
    const ro = reajusteOperativoConActivacion(ct);
    expect(ro.titulo).toBe("Reajuste aplicándose: 5 %/año");
    expect(ro.titulo).not.toMatch(/sin efecto de reajuste/);
    expect(ro.aplica).toBe(true);
  });

  test("sin la antigua, el 0 % sí se nombra por lo que es", () => {
    const ct = CONTRATO({
      reajuste: { tipo: "porcentaje", pct: 0, desde: "2026-07-01", referencia: "Clausula", confirmado: true },
      reajusteActivacion: Object.assign({}, ACTIVACION, { sello: SELLO(0) }),
    });
    expect(total(ct)).toBe(629550);
    const ro = reajusteOperativoConActivacion(ct);
    expect(ro.titulo).toBe("0 % registrado: sin efecto de reajuste");
    expect(ro.llevanElAjuste).toBe(0);
  });

  test("sello 2 % con la configuración editada a −2 %: el aviso no dice 0 %", () => {
    const ct = CONTRATO({
      reajuste: { tipo: "porcentaje", pct: -2, desde: "2026-07-01", referencia: "Clausula", confirmado: true },
      reajusteActivacion: Object.assign({}, ACTIVACION),
    });
    const ro = reajusteOperativoConActivacion(ct);
    expect(ro.titulo).not.toMatch(/0 % registrado/);
    // Y el importe no se mueve por una edición posterior del antecedente.
    expect(total(ct)).toBe(629550);
  });

  // CP7 · El sello negativo no tenía ninguna red. `selloCompleto` exige
  // porcentaje > 0, así que un sello deflacionario dejó de calcular: contra
  // la base 9d90ed2 eso son +24.683,38 (604.866,62 → 629.550) en un dato que
  // `activar()` no puede crear —rechaza pct ≤ 0— y que en el snapshot
  // congelado no existe (0 casos). Queda pinchado en las dos versiones.
  test("un sello con −2 % se conserva, no calcula, y el importe es la base", () => {
    const ct = CONTRATO({ reajusteActivacion: Object.assign({}, ACTIVACION, { sello: SELLO(-2) }) });
    expect(selloCompleto(SELLO(-2))).toBe(false);
    const e = estadoActivacion(ct);
    expect(e.activo).toBe(false);
    expect(e.registroBloqueado).toBe(true);
    expect(ct.reajusteActivacion.sello.pct).toBe(-2);     // se conserva, no se normaliza
    expect(total(ct)).toBe(629550);
    const ro = reajusteOperativoConActivacion(ct);
    expect(ro.titulo).toBe("Porcentaje registrado no positivo (-2 %): sin efecto de reajuste");
  });

  test("un sello con 2 % sí calcula: la red no bloquea lo legítimo", () => {
    const ct = CONTRATO({ reajusteActivacion: Object.assign({}, ACTIVACION) });
    expect(estadoActivacion(ct).activo).toBe(true);
    expect(total(ct)).toBeCloseTo(655240.69, 2);
  });
});

// ══════════════════════════════════════════════════════════════════
// D-11 · La fecha que manda queda SELLADA, fila por fila.
//
// El defecto: el sello guardaba la REGLA y no la FECHA a la que resuelve, y
// dos de las cuatro reglas leen su fecha de un campo editable del cobro
// (`emision` lee `rcPagos[t].fechaEst`, `pago` lee `rcPagos[t].fechaPago`).
// Con la regla "emision" sellada y sin fechas cargadas, la previa anunciaba
// cero, la accion sellaba impacto confirmado 0 y cargarlas despues movia el
// total de 629.550 a 655.240,69 (+25.690,69) sin previa ni confirmacion; mover
// una sola fecha a 2099 lo llevaba a 1.050.741,67.
//
// Ahora: la activacion sella la fecha concreta de cada fila con su procedencia,
// el motor calcula con esa fecha, y una fila sin fecha sellada queda PENDIENTE.
describe("D-11 · el motor calcula con la fecha sellada, no con el campo", () => {
  const { CONTRATO } = require("./fixturesReajuste");
  const {
    estadoActivacion, reajusteDeFila, previsualizarActivacion, sellarTerminos,
    fechasSelladasDeFilas, REGLAS_POR_FILA, reajusteOperativoConActivacion,
  } = require("./reajusteAplicado");
  const { configReajuste } = require("./condicionesConfigurables");

  const TEMPS = ["2026/2027", "2027/2028", "2028/2029", "2029/2030", "2030/2031"];
  const total = (ct) => r2(filasDe(ct).reduce((s, f) => s + f.montoFact, 0));
  const antesDe = (ct) => (f) => ((ct.rcPagos || {})[f.temporada] || null);
  const conEst = (ct, fn) => Object.assign({}, ct, {
    rcPagos: TEMPS.reduce((m, t, i) => (m[t] = Object.assign({}, (ct.rcPagos || {})[t], { fechaEst: fn(t, i) }), m), {}),
  });
  // Una activacion con la regla "emision" y las fechas YA SELLADAS. Se arma a
  // mano porque la accion hoy rechaza crearla (ver el describe siguiente): el
  // punto de estas pruebas es el MOTOR, que tiene que respetar el sello venga
  // de donde venga.
  const SELLADA = () => CONTRATO({
    reajusteActivacion: Object.assign({}, ACTIVACION, {
      reglaFecha: "emision", reglaFechaRespaldo: "Clausula sintetica 1.2.6",
      sello: {
        pct: 2, fechaReferencia: "2026-07-01", reglaFecha: "emision",
        fechasPorFila: TEMPS.reduce((m, t) => (m[t] = {
          fecha: Number(t.split("/")[1]) + "-06-30",
          origen: "emision", respaldo: "numero de factura sintetico",
        }, m), {}),
      },
    }),
  });
  const HEREDADA = () => CONTRATO({
    reajusteActivacion: Object.assign({}, ACTIVACION, {
      reglaFecha: "emision", reglaFechaRespaldo: "Clausula",
      sello: { pct: 2, fechaReferencia: "2026-07-01", reglaFecha: "emision" },
    }),
  });

  test("las dos reglas por fila estan declaradas como tales", () => {
    expect(REGLAS_POR_FILA).toEqual(["emision", "pago"]);
  });

  test("con las fechas selladas, el motor aplica y da un importe estable", () => {
    const ct = SELLADA();
    expect(estadoActivacion(ct).activo).toBe(true);
    expect(total(ct)).toBeGreaterThan(629550);
    const d = reajusteDeFila(ct, filasDe(ct)[1], { mesCobro: ct.rcMesCobro, antecedentes: null });
    expect(d.fechaSellada).toBe("2028-06-30");
    expect(d.origenFechaSellada).toBe("emision");
    expect(d.fechaNoSellada).toBe(false);
  });

  test("editar fechaEst despues NO mueve el importe sellado, ni con 2099", () => {
    const ct = SELLADA();
    const antes = total(ct);
    expect(total(conEst(ct, () => "2024-01-15"))).toBe(antes);
    expect(total(conEst(ct, (t, i) => (i === 1 ? "2099-06-30" : "2024-01-15")))).toBe(antes);
    expect(total(conEst(ct, () => ""))).toBe(antes);
    const dosmil99 = conEst(ct, (t, i) => (i === 1 ? "2099-06-30" : "2024-01-15"));
    expect(dosmil99.reajusteActivacion.sello.fechasPorFila["2027/2028"].fecha).toBe("2028-06-30");
  });

  test("un sello con la regla por fila y SIN fechas: todas las filas pendientes", () => {
    const ct = HEREDADA();
    expect(estadoActivacion(ct).activo).toBe(true);
    expect(total(ct)).toBe(629550);
    expect(total(conEst(ct, (t) => Number(t.split("/")[1]) + "-06-30"))).toBe(629550);
    const prev = previsualizarActivacion(ct, filasDe(ct), { mesCobro: ct.rcMesCobro, antecedentesDe: antesDe(ct) });
    expect(prev.filasSinFechaSellada).toBe(5);
    expect(prev.filasQueCambian).toBe(0);
    expect(prev.detalle[0].fechaNoSellada).toBe(true);
    expect(prev.detalle[0].motivo).toMatch(/pendiente de aplicacion/);
  });

  test("el aviso nombra las pendientes como pendientes, no como protegidas", () => {
    const ro = reajusteOperativoConActivacion(HEREDADA(), { filas: { cambian: 0, protegidas: 0, pendientes: 5 } });
    expect(ro.aviso).toMatch(/pendientes porque su fecha no quedo sellada/);
    expect(ro.aviso).not.toMatch(/tienen factura o pago registrado y no se recalculan/);
  });

  test("una temporada fuera del sello queda pendiente, no se suma sola", () => {
    const ct = SELLADA();
    expect(total(ct)).toBeGreaterThan(629550);
    const sinSello = Object.assign({}, ct, {
      reajusteActivacion: Object.assign({}, ct.reajusteActivacion, {
        sello: Object.assign({}, ct.reajusteActivacion.sello, {
          fechasPorFila: { "2026/2027": { fecha: "2027-06-30", origen: "emision", respaldo: "x" } },
        }),
      }),
    });
    const prev = previsualizarActivacion(sinSello, filasDe(sinSello),
      { mesCobro: ct.rcMesCobro, antecedentesDe: antesDe(sinSello) });
    expect(prev.filasSinFechaSellada).toBe(4);
    expect(r2(prev.totalAplicado)).toBe(r2(prev.totalBase));
  });

  test("las reglas deterministas no cambian: su fecha sale de la temporada", () => {
    // `inicioPeriodoServicio` y `finPeriodoServicio` resuelven con
    // `limitesTemporada`, que es funcion del rotulo de la temporada. No hay
    // campo editable detras, asi que no se sellan por fila.
    const ct = CONTRATO({ reajusteActivacion: Object.assign({}, ACTIVACION) });
    expect(ct.reajusteActivacion.sello.reglaFecha).toBe("inicioPeriodoServicio");
    expect(ct.reajusteActivacion.sello.fechasPorFila).toBeUndefined();
    expect(total(ct)).toBeCloseTo(655240.69, 2);
    expect(fechasSelladasDeFilas({ reglaFecha: "inicioPeriodoServicio" }, { filas: filasDe(ct) })).toBe(null);
    expect(fechasSelladasDeFilas({ reglaFecha: "finPeriodoServicio" }, { filas: filasDe(ct) })).toBe(null);
    const sello = sellarTerminos(configReajuste(ct), ct.reajusteActivacion,
      { filas: filasDe(ct), antecedentesDe: antesDe(ct), mesCobro: ct.rcMesCobro });
    expect(sello.fechasPorFila).toBeUndefined();
  });

  // La revisión anterior midió que esta prueba era tautológica: comparaba
  // `sellarTerminos` con `fechasSelladasDeFilas`, y la primera LLAMA a la
  // segunda con esos mismos argumentos. No probaba la afirmación que
  // respaldaba. Se reemplaza por dos que sí pueden fallar.
  dCrear("la previa y la accion dicen lo mismo del mismo contrato", () => {
    const antesDeC = (ct) => (f) => ((ct.rcPagos || {})[f.temporada] || null);

    test("con una regla alcanzable: lo que anuncia la previa es lo que queda", () => {
      // Regla determinista, que es la que hoy se puede activar. Si
      // `comoSiSeActivara` sellara distinto de lo que sella `activar`, los
      // importes de la previa y los de despues dejarian de coincidir.
      const ct = CONTRATO({
        reajusteActivacion: {
          activado: false, fechaReferencia: "2026-07-01", respaldo: "Comprobante",
          reglaFecha: "inicioPeriodoServicio", reglaFechaRespaldo: "Clausula",
        },
        rcPagos: { "2029/2030": { nFact: "999", pagado: true } },
      });
      const filas = filasDe(ct);
      const prev = previsualizarActivacion(ct, filas,
        { mesCobro: ct.rcMesCobro, antecedentesDe: antesDeC(ct) });

      const res = activar(ct, Object.assign({}, DATOS_ACTIVACION, {
        reglaFecha: "inicioPeriodoServicio", usuarioActual: USUARIO, puedeEditar: true,
        confirmado: true, impacto: prev.diferenciaAplicada,
        filas, antecedentesDe: antesDeC(ct), mesCobro: ct.rcMesCobro,
      }));
      expect(res.ok).toBe(true);

      // Fila por fila, el importe que la previa anuncio es el que el motor
      // calcula despues de activar de verdad.
      const despues = filasDe(res.contrato);
      const porTemporada = despues.reduce((m, f) => (m[f.temporada] = r2(f.montoFact), m), {});
      prev.detalle.forEach((d) => {
        expect(porTemporada[d.temporada]).toBe(r2(d.ajustado));
      });
      // Y el total, y la diferencia que se confirmo.
      const totalDespues = r2(despues.reduce((s, f) => s + f.montoFact, 0));
      expect(totalDespues).toBe(r2(prev.totalAplicado));
      expect(r2(totalDespues - prev.totalActual)).toBe(r2(prev.diferenciaAplicada));
      // El sello es el que la previa simulo.
      expect(res.contrato.reajusteActivacion.sello.reglaFecha).toBe("inicioPeriodoServicio");
      expect(res.contrato.reajusteActivacion.sello.fechasPorFila).toBeUndefined();
    });

    test("con una regla por fila: si la previa las deja pendientes, la accion rechaza", () => {
      // La agreement que importa para D-11: las dos miran el mismo contexto de
      // filas, asi que no puede pasar que la previa anuncie pendientes y la
      // accion selle igual.
      const ct = CONTRATO({
        reajusteActivacion: {
          activado: false, fechaReferencia: "2026-07-01", respaldo: "Comprobante",
          reglaFecha: "emision", reglaFechaRespaldo: "Clausula",
        },
      });
      const filas = filasDe(ct);
      const prev = previsualizarActivacion(ct, filas,
        { mesCobro: ct.rcMesCobro, antecedentesDe: antesDeC(ct) });
      expect(prev.filasSinFechaSellada).toBe(filas.length);
      expect(prev.diferenciaAplicada).toBe(0);

      const res = activar(ct, Object.assign({}, DATOS_ACTIVACION, {
        reglaFecha: "emision", usuarioActual: USUARIO, puedeEditar: true,
        confirmado: true, impacto: prev.diferenciaAplicada,
        filas, antecedentesDe: antesDeC(ct), mesCobro: ct.rcMesCobro,
      }));
      expect(res.ok).toBe(false);
      expect(res.faltan.length).toBe(filas.length);
      // Las temporadas que la previa marco pendientes son las mismas que la
      // accion nombra como faltantes.
      const pendientes = prev.detalle.filter((d) => d.fechaNoSellada).map((d) => d.temporada).sort();
      expect(res.faltan.map((x) => x.temporada).sort()).toEqual(pendientes);
    });
  });
});

// ══════════════════════════════════════════════════════════════════
// D-11 · C · La accion RECHAZA lo que no puede sellar. Un impacto cero
// causado por informacion ausente no se acepta.
dCrear("D-11 · activar rechaza una regla por fila sin fecha que sellar", () => {
  const { CONTRATO } = require("./fixturesReajuste");
  const { activar } = require("./reajusteAplicado");
  const TEMPS = ["2026/2027", "2027/2028", "2028/2029", "2029/2030", "2030/2031"];
  const antesDe = (ct) => (f) => ((ct.rcPagos || {})[f.temporada] || null);
  const base = (rcPagos) => CONTRATO(rcPagos ? { rcPagos } : undefined);
  const args = (ct, regla) => Object.assign({}, DATOS_ACTIVACION, {
    reglaFecha: regla, usuarioActual: USUARIO, puedeEditar: true, confirmado: true, impacto: 0,
    filas: filasDe(ct), antecedentesDe: antesDe(ct), mesCobro: ct.rcMesCobro,
  });

  test("sin ninguna fecha estimada cargada: rechazada, y dice que falta en cada temporada", () => {
    const ct = base();
    const res = activar(ct, args(ct, "emision"));
    expect(res.ok).toBe(false);
    expect(res.motivo).toMatch(/NINGUNA fila tiene una fecha que se pueda sellar/);
    expect(res.motivo).toMatch(/no tiene fecha estimada de factura cargada/);
    expect(res.motivo).toMatch(/impacto de cero causado por informacion ausente/);
    expect(res.faltan.length).toBe(5);
    expect(res.contrato.reajusteActivacion).toBeUndefined();
  });

  test("con fecha estimada pero sin respaldo: rechazada, y lo dice", () => {
    const ct = base(TEMPS.reduce((m, t) => (m[t] = { fechaEst: Number(t.split("/")[1]) + "-06-30" }, m), {}));
    const res = activar(ct, args(ct, "emision"));
    expect(res.ok).toBe(false);
    expect(res.motivo).toMatch(/es una estimacion, no la fecha efectiva de emision/);
    expect(res.contrato.reajusteActivacion).toBeUndefined();
  });

  test("con fecha estimada Y respaldo: rechazada por la Regla 4", () => {
    const ct = base(TEMPS.reduce((m, t) => (m[t] = {
      fechaEst: Number(t.split("/")[1]) + "-06-30", nFact: "900" + t.slice(2, 4) }, m), {}));
    const res = activar(ct, args(ct, "emision"));
    expect(res.ok).toBe(false);
    expect(res.motivo).toMatch(/por la Regla 4 no se recalcula/);
  });

  test("la regla de pago tambien: su fecha es a su vez un antecedente", () => {
    const ct = base(TEMPS.reduce((m, t) => (m[t] = { fechaPago: Number(t.split("/")[1]) + "-07-15" }, m), {}));
    const res = activar(ct, args(ct, "pago"));
    expect(res.ok).toBe(false);
    expect(res.motivo).toMatch(/Regla 4/);
    expect(res.contrato.reajusteActivacion).toBeUndefined();
  });

  test("sin pasarle las filas, la accion no sella la regla sola: rechaza", () => {
    const ct = base();
    const sinFilas = Object.assign({}, args(ct, "emision"));
    delete sinFilas.filas;
    const res = activar(ct, sinFilas);
    expect(res.ok).toBe(false);
    expect(res.motivo).toMatch(/no recibio las filas/);
  });

  test("una regla determinista sigue activando igual que siempre", () => {
    const ct = base();
    const res = activar(ct, args(ct, "inicioPeriodoServicio"));
    expect(res.ok).toBe(true);
    expect(res.contrato.reajusteActivacion.sello.reglaFecha).toBe("inicioPeriodoServicio");
    expect(res.contrato.reajusteActivacion.sello.fechasPorFila).toBeUndefined();
    expect(r2(filasDe(res.contrato).reduce((s, f) => s + f.montoFact, 0))).toBeCloseTo(655240.69, 2);
  });
});

// ══════════════════════════════════════════════════════════════════
// D-12 · La protección de la Regla 4 no se pierde porque se vacíe un campo.
//
// El defecto: `antecedentesDeCobro` se evaluaba en vivo sobre `rcPagos`, así
// que borrar el número de factura de una fila protegida la devolvía al
// recálculo y le aplicaba el reajuste sin vista previa ni confirmación.
// Medido: 647.533,99 → 655.240,69 (+7.706,70) borrando el `nFact` de
// 2029/2030. Es otro mecanismo que D-11: no mueve el ancla, quita la
// protección.
//
// Ahora la protección queda CONSERVADA en `rcPagos[t].proteccion`. El campo se
// puede editar o corregir —es tarea normal—, pero el importe no vuelve al
// recálculo. Levantarla es una operación económica con su propio flujo, que no
// está en este paquete.
describe("D-12 · la proteccion de la Regla 4 se conserva", () => {
  const { CONTRATO } = require("./fixturesReajuste");
  const {
    antecedentesDeCobro, conProteccionConservada, reajusteDeFila, estadoActivacion,
  } = require("./reajusteAplicado");

  const total = (ct) => r2(filasDe(ct).reduce((s, f) => s + f.montoFact, 0));
  const ACTIVA = (rcPagos) => CONTRATO({
    reajusteActivacion: Object.assign({}, ACTIVACION),
    rcPagos: rcPagos || {},
  });
  // Los cinco antecedentes que `antecedentesDeCobro` reconoce, cada uno con el
  // valor que lo activa y el valor que lo borraria.
  const ANTECEDENTES = [
    { campo: "nFact", puesto: "999", vacio: "" },
    { campo: "pagado", puesto: true, vacio: false },
    { campo: "fechaPago", puesto: "2030-06-02", vacio: "" },
    { campo: "montoFacturado", puesto: "125910", vacio: "" },
    { campo: "parciales", puesto: [{ id: "p1", nFact: "901", monto: "100" }], vacio: [] },
  ];

  test("el caso que el defecto movia: con factura, la fila no se recalcula", () => {
    const con = ACTIVA({ "2029/2030": { nFact: "999" } });
    expect(total(con)).toBeCloseTo(647533.99, 2);
    // Sin la correccion, vaciarla devolvia la fila al recalculo.
    const crudo = ACTIVA({ "2029/2030": {} });
    expect(total(crudo)).toBeCloseTo(655240.69, 2);
    expect(r2(total(crudo) - total(con))).toBeCloseTo(7706.7, 2);
  });

  ANTECEDENTES.forEach(({ campo, puesto, vacio }) => {
    test("borrar " + campo + " conserva la proteccion y el importe", () => {
      const antes = { [campo]: puesto };
      expect(antecedentesDeCobro(antes).hay).toBe(true);
      const despues = conProteccionConservada(antes, { [campo]: vacio }, "2026-10-09");
      // El campo queda editado, y la proteccion conservada.
      expect(despues[campo]).toEqual(vacio);
      expect(despues.proteccion).toBeTruthy();
      expect(despues.proteccion.desde).toBe("2026-10-09");
      expect(antecedentesDeCobro(despues).hay).toBe(true);
      expect(antecedentesDeCobro(despues).conservada).toBe(true);
      // Y el importe de la fila no se mueve.
      const ct = ACTIVA({ "2029/2030": despues });
      expect(total(ct)).toBeCloseTo(647533.99, 2);
      const d = reajusteDeFila(ct, filasDe(ct)[3], { mesCobro: ct.rcMesCobro, antecedentes: despues });
      expect(d.intocable).toBe(true);
      expect(d.motivo).toMatch(/proteccion conservada/);
    });
  });

  test("corregir el numero de factura no necesita conservar nada: sigue vivo", () => {
    const antes = { nFact: "999" };
    const despues = conProteccionConservada(antes, { nFact: "1000" }, "2026-10-09");
    expect(despues.nFact).toBe("1000");
    expect(despues.proteccion).toBeUndefined();      // no hace falta: el antecedente esta
    expect(antecedentesDeCobro(despues).hay).toBe(true);
    const ct = ACTIVA({ "2029/2030": despues });
    expect(total(ct)).toBeCloseTo(647533.99, 2);
  });

  test("una fila que nunca tuvo antecedentes no gana proteccion de la nada", () => {
    const despues = conProteccionConservada({}, { fechaEst: "2030-04-01" }, "2026-10-09");
    expect(despues.proteccion).toBeUndefined();
    expect(antecedentesDeCobro(despues).hay).toBe(false);
    // Y el contrato activo sigue aplicando en esa fila.
    expect(total(ACTIVA({ "2029/2030": despues }))).toBeCloseTo(655240.69, 2);
  });

  test("la proteccion conservada sobrevive al viaje de ida y vuelta", () => {
    const despues = conProteccionConservada({ nFact: "999" }, { nFact: "" }, "2026-10-09");
    const ct = ACTIVA({ "2029/2030": despues });
    const ida = JSON.parse(JSON.stringify(ct));           // guardar y recargar
    expect(ida.rcPagos["2029/2030"].proteccion.motivos.join(" ")).toMatch(/número de factura 999/);
    expect(total(ida)).toBeCloseTo(647533.99, 2);
    expect(estadoActivacion(ida).activo).toBe(true);
  });

  // Esta prueba afirmaba que la fecha se refrescaba en cualquier edicion, y lo
  // hacia pasando una fila SIN `proteccion`, que no es lo que produce la
  // pantalla: `updRcPago` hace {...antes, [campo]:val}. Con la forma real no se
  // refrescaba, asi que la prueba daba una impresion falsa. Lo encontro la
  // revision. Ahora se mide lo que corresponde: la fecha se actualiza cuando se
  // retira un antecedente vivo, y no cuando no se retira ninguno.
  test("una edicion que no retira nada no mueve la fecha del registro", () => {
    const uno = conProteccionConservada({ nFact: "999" }, { nFact: "" }, "2026-10-09");
    // Forma real de la pantalla: se parte del antes y se cambia un campo.
    const dos = conProteccionConservada(uno, Object.assign({}, uno, { fechaEst: "2030-04-01" }), "2026-11-20");
    expect(dos.proteccion.motivos).toEqual(uno.proteccion.motivos);
    expect(dos.proteccion.desde).toBe("2026-10-09");          // no se retiro nada
    expect(antecedentesDeCobro(dos).hay).toBe(true);
  });

  test("y cada retiro nuevo se acumula con su fecha", () => {
    const uno = conProteccionConservada({ nFact: "999" }, { nFact: "" }, "2026-10-09");
    expect(uno.proteccion).toEqual({ motivos: ["número de factura 999"], desde: "2026-10-09" });
    // Se corrige el numero: la fila queda protegida por el vivo.
    const vuelve = Object.assign({}, uno, { nFact: "1000" });
    expect(antecedentesDeCobro(vuelve).soloPorConservada).toBe(false);
    // Y se borra otra vez, mas tarde: se acumula el 1000 y la fecha es la nueva.
    const tres = conProteccionConservada(vuelve, Object.assign({}, vuelve, { nFact: "" }), "2026-11-20");
    expect(tres.proteccion.motivos).toEqual(["número de factura 999", "número de factura 1000"]);
    expect(tres.proteccion.desde).toBe("2026-11-20");
    const a = antecedentesDeCobro(tres);
    expect(a.soloPorConservada).toBe(true);
    expect(a.motivos[0]).toMatch(/999; número de factura 1000 \(ultimo retiro el 2026-11-20\)/);
    expect(total(ACTIVA({ "2029/2030": tres }))).toBeCloseTo(647533.99, 2);
  });

});

// ══════════════════════════════════════════════════════════════════
// Los hallazgos de la undécima revisión sobre D-12.
describe("D-12 · lo que la revision encontro del propio arreglo", () => {
  const { CONTRATO } = require("./fixturesReajuste");
  const {
    antecedentesDeCobro, conProteccionConservada, MOTIVO_PROTECCION_CONSERVADA,
  } = require("./reajusteAplicado");
  const total = (ct) => r2(filasDe(ct).reduce((s, f) => s + f.montoFact, 0));
  const ACTIVA = (rcPagos) => CONTRATO({
    reajusteActivacion: Object.assign({}, ACTIVACION), rcPagos: rcPagos || {},
  });

  // R-1 · `upd` audita cada cambio con JSON.stringify(...).slice(0,200). Con el
  // parrafo explicativo guardado DENTRO de cada fila, la bitacora de cualquier
  // edicion de cobros quedaba truncada hasta ser inutil: la revision midio 275
  // caracteres por fila conservada y 823 con tres. El texto vive ahora en una
  // constante y la fila guarda solo los motivos y la fecha.
  test("la fila conservada no se come la ventana de 200 de la bitacora", () => {
    const una = conProteccionConservada({ nFact: "999" }, { nFact: "" }, "2026-10-09");
    // Lo que agrega la conservacion, por fila, medido.
    const sinProteccion = JSON.stringify({ nFact: "" }).length;
    const conProteccion = JSON.stringify(una).length;
    expect(conProteccion - sinProteccion).toBeLessThan(90);        // el parrafo sumaba 240
    expect(JSON.stringify({ "2029/2030": una }).length).toBeLessThan(200);
    expect(JSON.stringify(una)).not.toContain("operacion economica");
    // Lo que NO se afirma: un `rcPagos` con varias temporadas conservadas
    // sigue pasandose de 200. Eso es la deuda del audit, que corta a 200 y es
    // anterior a esto; lo que este arreglo evita es agravarla por fila.
    const tres = ["2027/2028", "2028/2029", "2029/2030"].reduce((m, t) => (m[t] = una, m), {});
    expect(JSON.stringify(tres).length).toBeGreaterThan(200);
  });

  test("el motivo explicativo existe, exportado, para que lo muestre quien deba", () => {
    expect(MOTIVO_PROTECCION_CONSERVADA).toMatch(/operacion economica con su propio flujo/);
  });

  // R-3 · Si el antecedente vuelve, la fila esta protegida por el vivo y el
  // conservado no se nombra: repetirlo dejaba dos motivos para una sola fila.
  // El registro se conserva igual, por si el vivo se retira otra vez.
  test("cuando el antecedente vuelve, el conservado no se nombra dos veces", () => {
    const conservada = conProteccionConservada({ nFact: "999" }, { nFact: "" }, "2026-10-09");
    const vuelve = Object.assign({}, conservada, { nFact: "1000" });
    const a = antecedentesDeCobro(vuelve);
    expect(a.hay).toBe(true);
    expect(a.motivos.length).toBe(1);
    expect(a.motivos[0]).toMatch(/1000/);
    expect(a.motivos.join(" ")).not.toMatch(/proteccion conservada/);
    expect(a.conservada).toBe(true);              // el registro sigue ahi
    expect(a.soloPorConservada).toBe(false);      // pero no es la razon de hoy
    expect(total(ACTIVA({ "2029/2030": vuelve }))).toBeCloseTo(647533.99, 2);
  });

  test("y si el vivo se retira otra vez, el conservado vuelve a ser la razon", () => {
    const conservada = conProteccionConservada({ nFact: "999" }, { nFact: "" }, "2026-10-09");
    const vuelve = Object.assign({}, conservada, { nFact: "1000" });
    const otraVez = conProteccionConservada(vuelve, Object.assign({}, vuelve, { nFact: "" }), "2026-11-20");
    const a = antecedentesDeCobro(otraVez);
    expect(a.soloPorConservada).toBe(true);
    expect(a.hay).toBe(true);
    expect(total(ACTIVA({ "2029/2030": otraVez }))).toBeCloseTo(647533.99, 2);
  });

  // La prueba anterior de "nada levanta la proteccion" era un grep de nombres
  // exportados: un `limpiarProteccion` habria pasado. Esto mide comportamiento.
  test("ninguna edicion de la fila quita una proteccion ya conservada", () => {
    const partida = conProteccionConservada({ nFact: "999" }, { nFact: "" }, "2026-10-09");
    const ediciones = [
      ["nFact", ""], ["nFact", "1000"], ["pagado", false], ["pagado", true],
      ["fechaPago", ""], ["fechaPago", "2030-01-01"], ["montoFacturado", ""],
      ["parciales", []], ["fechaEst", "2030-04-01"], ["fechaEst", ""],
      ["haCobrar", ""], ["haCobrar", "30"], ["proteccion", undefined],
    ];
    ediciones.forEach(([campo, val]) => {
      const despues = conProteccionConservada(partida, Object.assign({}, partida, { [campo]: val }));
      expect(despues.proteccion).toBeTruthy();
      expect(antecedentesDeCobro(despues).hay).toBe(true);
      // El importe queda igual salvo con `haCobrar`, que es un override de
      // hectareas y nunca estuvo cubierto por la Regla 4: baja la fila por
      // otra razon, con la proteccion intacta. Queda dicho, no tapado.
      const esperado = campo === "haCobrar" && String(val) !== "" ? 611623.99 : 647533.99;
      expect(total(ACTIVA({ "2029/2030": despues }))).toBeCloseTo(esperado, 2);
    });
  });

  test("y el modulo no exporta nada que la quite, por nombre", () => {
    // Complementa a la de arriba: no la reemplaza.
    const mod = require("./reajusteAplicado");
    const quitan = Object.keys(mod).filter((k) =>
      /(levantar|quitar|borrar|limpiar|retirar|eliminar|resetear|desproteger)/i.test(k) &&
      /proteccion/i.test(k));
    expect(quitan).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════
// Lo que la última pasada encontró del arreglo del registro.
describe("D-12 · el registro acumula con tope y por clase de antecedente", () => {
  const { CONTRATO } = require("./fixturesReajuste");
  const {
    antecedentesDeCobro, conProteccionConservada, reajusteOperativoConActivacion,
    MAX_MOTIVOS_CONSERVADOS,
  } = require("./reajusteAplicado");
  const total = (ct) => r2(filasDe(ct).reduce((s, f) => s + f.montoFact, 0));
  const ACTIVA = (rcPagos) => CONTRATO({
    reajusteActivacion: Object.assign({}, ACTIVACION), rcPagos: rcPagos || {},
  });

  // 2.b · Antes se cortaba cuando todavía quedaba un antecedente vivo, así que
  // el que se retiraba primero no se registraba nunca.
  test("un antecedente retirado mientras queda otro vivo SI se registra", () => {
    const inicial = { nFact: "999", pagado: true };
    expect(antecedentesDeCobro(inicial).motivos.length).toBe(2);
    // Se borra la factura: queda "pagado" vivo, y la 999 tiene que constar.
    const uno = conProteccionConservada(inicial, Object.assign({}, inicial, { nFact: "" }), "2026-10-09");
    expect(uno.proteccion.motivos).toEqual(["número de factura 999"]);
    expect(antecedentesDeCobro(uno).soloPorConservada).toBe(false);   // sigue el pagado
    // Y se destilda pagado: se acumula, y ahora la conservada es la razon.
    const dos = conProteccionConservada(uno, Object.assign({}, uno, { pagado: false }), "2026-11-20");
    expect(dos.proteccion.motivos).toEqual(["número de factura 999", "marcada como pagada"]);
    expect(dos.proteccion.desde).toBe("2026-11-20");
    const a = antecedentesDeCobro(dos);
    expect(a.soloPorConservada).toBe(true);
    expect(a.motivos[0]).toMatch(/999; marcada como pagada/);
    expect(total(ACTIVA({ "2029/2030": dos }))).toBeCloseTo(647533.99, 2);
  });

  // Y la otra cara: corregir el número NO es retirar nada, porque se compara
  // por clase de antecedente y no por valor. Si se comparara por valor, cada
  // corrección quedaría registrada como un retiro y el acumulado crecería con
  // el trabajo normal.
  test("corregir el numero no registra un retiro: se compara por clase", () => {
    const uno = conProteccionConservada({ nFact: "999" }, { nFact: "1000" }, "2026-10-09");
    expect(uno.proteccion).toBeUndefined();
    const conPago = { nFact: "999", fechaPago: "2030-01-01" };
    const dos = conProteccionConservada(conPago, Object.assign({}, conPago, { fechaPago: "2030-02-01" }), "2026-10-09");
    expect(dos.proteccion).toBeUndefined();
  });

  // 2.a · Sin tope, cada valor distinto retirado agregaba un motivo y nada los
  // recortaba: a los seis retiros el `rcPagos` de una sola fila pasaba los 200
  // caracteres que audita la bitacora -el defecto de R-1, de vuelta por otra
  // via- y el rotulo de la celda llegaba a 540 caracteres.
  test("el acumulado tiene tope y la fila sigue entrando en la bitacora", () => {
    let fila = { nFact: "F-0" };
    for (let i = 1; i <= 20; i++) {
      fila = conProteccionConservada(fila, Object.assign({}, fila, { nFact: "" }), "2026-10-0" + (i % 9 + 1));
      fila = Object.assign({}, fila, { nFact: "F-" + i });
    }
    fila = conProteccionConservada(fila, Object.assign({}, fila, { nFact: "" }), "2026-11-20");
    const pr = fila.proteccion;
    expect(pr.motivos.length).toBe(MAX_MOTIVOS_CONSERVADOS);
    expect(pr.motivos[0]).toMatch(/^\d+ retiros anteriores$/);       // el resto, contado
    expect(JSON.stringify({ "2029/2030": fila }).length).toBeLessThan(200);
    // Y sigue protegiendo.
    expect(antecedentesDeCobro(fila).soloPorConservada).toBe(true);
    expect(total(ACTIVA({ "2029/2030": fila }))).toBeCloseTo(647533.99, 2);
    // El rotulo que se pinta queda acotado.
    expect(antecedentesDeCobro(fila).motivos[0].length).toBeLessThan(180);
  });

  test("el conteo de retiros anteriores no se duplica al seguir acumulando", () => {
    let fila = { nFact: "F-0" };
    for (let i = 1; i <= 8; i++) {
      fila = conProteccionConservada(fila, Object.assign({}, fila, { nFact: "" }), "2026-10-01");
      fila = Object.assign({}, fila, { nFact: "F-" + i });
    }
    fila = conProteccionConservada(fila, Object.assign({}, fila, { nFact: "" }), "2026-11-20");
    const c = /^(\d+) retiros anteriores$/.exec(fila.proteccion.motivos[0]);
    expect(c).toBeTruthy();
    // 9 retiros en total: 4 guardados con su texto + 5 contados.
    expect(Number(c[1]) + (fila.proteccion.motivos.length - 1)).toBe(9);
  });

  // 2.c y el aviso: no se les atribuye factura a las filas que no la tienen.
  test("el aviso cuenta aparte las protegidas por antecedente retirado", () => {
    const ro = reajusteOperativoConActivacion(
      CONTRATO({ reajusteActivacion: Object.assign({}, ACTIVACION) }),
      { filas: { cambian: 0, protegidas: 3, protegidasConservadas: 1, pendientes: 0 } });
    expect(ro.aviso).toMatch(/3 con factura, pago o proteccion conservada \(1 por antecedentes ya retirados\)/);
    expect(ro.aviso).not.toMatch(/3 con factura o pago registrado/);
  });

  test("y si ninguna es conservada, el aviso dice lo de siempre", () => {
    const ro = reajusteOperativoConActivacion(
      CONTRATO({ reajusteActivacion: Object.assign({}, ACTIVACION) }),
      { filas: { cambian: 0, protegidas: 3, protegidasConservadas: 0, pendientes: 0 } });
    expect(ro.aviso).toMatch(/las 3 con factura o pago registrado no se recalculan/);
    expect(ro.aviso).not.toMatch(/proteccion conservada/);
  });

  test("el resumen de filas cuenta las conservadas aparte", () => {
    const { previsualizarActivacion } = require("./reajusteAplicado");
    const conservada = conProteccionConservada({ nFact: "999" }, { nFact: "" }, "2026-10-09");
    const ct = ACTIVA({ "2029/2030": conservada, "2030/2031": { nFact: "777" } });
    const prev = previsualizarActivacion(ct, filasDe(ct),
      { mesCobro: ct.rcMesCobro, antecedentesDe: (f) => ((ct.rcPagos || {})[f.temporada] || null) });
    expect(prev.filasIntocables).toBe(2);
    expect(prev.filasProtegidasConservadas).toBe(1);
  });
});
