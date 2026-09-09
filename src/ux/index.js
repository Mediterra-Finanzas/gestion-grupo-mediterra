/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// UX EJECUTIVO · ÍNDICE
// ═══════════════════════════════════════════════════════════════════
//
// Punto de entrada del carril. NADA de esto está montado en `src/App.jsx`:
// son prototipos y componentes probados, a la espera de que cierre el trabajo
// de seguridad y persistencia.

export { default as PrototipoUX, DESTINOS } from "./PrototipoUX";
export { default as HomeEjecutivo } from "./HomeEjecutivo";
export { default as RielNavegacion } from "./RielNavegacion";
export { default as BusquedaGlobal } from "./BusquedaGlobal";
export { default as TarjetasKPI } from "./TarjetasKPI";
export { default as PanelAlertas } from "./PanelAlertas";
export { default as TablaDensa } from "./TablaDensa";
export { default as TablerosCobranza } from "./TablerosCobranza";
export { default as Ficha360 } from "./Ficha360";

export { Boton, Panel, Etiqueta, Vacio, SoloLector, useFoco } from "./Primitivos";
export { useResponsive, estadoResponsive, clasificarAncho } from "./useResponsive";
export * from "./selectores";
export * from "./cobranza";
export * from "./tokens";
export { DATOS_EJEMPLO, HOY_EJEMPLO } from "./ejemploDatos";
