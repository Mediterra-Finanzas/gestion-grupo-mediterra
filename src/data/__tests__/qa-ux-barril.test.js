/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// QA UX · BARRIL
// ═══════════════════════════════════════════════════════════════════
//
// Por qué existe este archivo, que a primera vista no prueba nada:
//
// `CI=true npm run build` NO compila `src/ux/**`. Webpack sólo empaqueta lo
// que se alcanza desde `src/index.js`, y este carril está deliberadamente
// desconectado de la aplicación. Un build limpio, entonces, no dice nada
// sobre estos archivos.
//
// Quien los compila de verdad es jest, vía babel. Esta prueba importa el
// barril completo para garantizar que TODOS los módulos del carril entren al
// grafo, incluido `index.js`, que ninguna otra prueba toca. Si alguien deja
// un archivo con un error de sintaxis, una exportación mal escrita o una
// dependencia circular, se cae acá y no dentro de seis meses al integrar.

import * as ux from "../../ux";

const COMPONENTES = [
  "PrototipoUX",
  "HomeEjecutivo",
  "RielNavegacion",
  "BusquedaGlobal",
  "TarjetasKPI",
  "PanelAlertas",
  "TablaDensa",
  "Ficha360",
  "Boton",
  "Panel",
  "Etiqueta",
  "Vacio",
  "SoloLector",
];

const FUNCIONES = [
  "useFoco",
  "useResponsive",
  "estadoResponsive",
  "clasificarAncho",
  "kpisEjecutivos",
  "alertasAccionables",
  "resumenAlertas",
  "ordenarPorSeveridad",
  "construirIndice",
  "buscar",
  "normalizar",
  "ficha360",
  "filasContratos",
  "ordenarFilas",
  "formatearValor",
  "diasHasta",
  "aFecha",
  "temporadaDe",
  "contractFeePorCobrar",
  "anexoActivo",
  "pesoSeveridad",
];

const DATOS = ["surface", "ink", "estado", "densidad", "layout", "BREAKPOINTS", "anilloFoco", "soloLector", "PARES_CONTRASTE", "TINTAS_PROHIBIDAS_COMO_TEXTO", "SEVERIDADES", "consultasMedia", "DESTINOS", "DATOS_EJEMPLO", "HOY_EJEMPLO"];

describe("el barril expone todo el carril y todo compila", () => {
  test.each(COMPONENTES)("%s se exporta como componente", (nombre) => {
    expect(typeof ux[nombre]).toBe("function");
  });

  test.each(FUNCIONES)("%s se exporta como función", (nombre) => {
    expect(typeof ux[nombre]).toBe("function");
  });

  test.each(DATOS)("%s se exporta con valor", (nombre) => {
    expect(ux[nombre]).toBeDefined();
  });

  test("no hay exportaciones indefinidas coladas en el barril", () => {
    const indefinidas = Object.keys(ux).filter((k) => ux[k] === undefined);
    expect(indefinidas).toEqual([]);
  });

  test("los ocho destinos del hub están declarados y sin ids repetidos", () => {
    expect(ux.DESTINOS).toHaveLength(8);
    expect(new Set(ux.DESTINOS.map((d) => d.id)).size).toBe(8);
    for (const d of ux.DESTINOS) {
      expect(d.label).toBeTruthy();
      expect(d.icono).toBeTruthy();
    }
  });
});
