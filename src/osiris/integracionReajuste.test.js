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
    expect(ro.aviso).toMatch(/las 5 que hay tienen factura o pago/);
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
