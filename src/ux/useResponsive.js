/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// UX EJECUTIVO · RESPONSIVE
// ═══════════════════════════════════════════════════════════════════
//
// Osiris hoy no tiene ni un `matchMedia` (ver TECH-01-WIREFRAMES §0). Este
// hook es la única fuente de verdad del tamaño para todo `src/ux/**`, de modo
// que el layout se decida en JS igual que los colores, y no a punta de
// `!important` en `index.css`.
//
// Devuelve un objeto y no un string suelto porque en el JSX se lee mejor
// `if (bp.esMovil)` que `if (bp === "movil")`, y porque agregar un campo
// derivado (densidad sugerida) no rompe a los consumidores.

import { useState, useEffect } from "react";
import { BREAKPOINTS, densidad } from "./tokens";

export function clasificarAncho(ancho) {
  if (ancho <= BREAKPOINTS.movil) return "movil";
  if (ancho <= BREAKPOINTS.tablet) return "tablet";
  return "escritorio";
}

// Estado derivado de un ancho. Puro: se puede probar sin montar nada.
export function estadoResponsive(ancho) {
  const tamano = clasificarAncho(ancho);
  const esMovil = tamano === "movil";
  const esTablet = tamano === "tablet";
  return {
    ancho,
    tamano,
    esMovil,
    esTablet,
    esEscritorio: tamano === "escritorio",
    // El riel se colapsa a íconos en tablet y desaparece a barra inferior en
    // teléfono. En escritorio va con etiquetas.
    modoNavegacion: esMovil ? "barra" : esTablet ? "iconos" : "etiquetas",
    // Tacto necesita filas más altas; el mouse no.
    densidad: esMovil || esTablet ? densidad.comoda : densidad.compacta,
    nombreDensidad: esMovil || esTablet ? "comoda" : "compacta",
    // Las tablas anchas colapsan a lista de tarjetas en teléfono en vez de
    // obligar a un scroll horizontal con texto truncado.
    tablaComoTarjetas: esMovil,
  };
}

function anchoActual() {
  if (typeof window === "undefined") return BREAKPOINTS.tablet + 1;
  return window.innerWidth || BREAKPOINTS.tablet + 1;
}

export function useResponsive() {
  const [ancho, setAncho] = useState(anchoActual);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let raf = null;
    const alCambiar = () => {
      if (raf != null) return;
      raf = (window.requestAnimationFrame || ((f) => setTimeout(f, 16)))(() => {
        raf = null;
        setAncho(anchoActual());
      });
    };
    window.addEventListener("resize", alCambiar);
    // Una lectura inmediata: entre el primer render y el efecto la ventana
    // pudo cambiar (rotación de tablet, panel lateral del navegador).
    setAncho(anchoActual());
    return () => window.removeEventListener("resize", alCambiar);
  }, []);

  return estadoResponsive(ancho);
}

// Respeta `prefers-reduced-motion`. Las transiciones de este carril son
// mínimas, pero si el sistema pide cero movimiento, se lo damos.
export function usaMovimientoReducido() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {
    return false;
  }
}

export default useResponsive;
