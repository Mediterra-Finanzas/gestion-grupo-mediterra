// ═══════════════════════════════════════════════════════════════════
// DISEÑO — tipografía, espaciado y cortes de pantalla del hub y la navegación.
// Los colores salen del tema central (src/theme.js); acá solo se fijan las
// medidas para que el texto sea legible en las cuatro clases de equipo.
// ═══════════════════════════════════════════════════════════════════
import { theme as C } from "../theme";

export const FUENTE = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

// Escala tipográfica (px). Mínimo 12 para rótulos; el cuerpo va en 15.
export const TXT = {
  rotulo: 12,   // rótulos en mayúscula, notas al pie
  chico: 13,    // texto secundario
  cuerpo: 15,   // texto normal
  destacado: 17,
  titulo: 21,
  saludo: 26,
  cifra: 28,    // contadores
};

export const ESP = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 };

// Clases de ventana: compacta (teléfono), media (tablet), expandida (laptop y computador).
export const CORTE_MEDIA = 600;
export const CORTE_EXPANDIDA = 1024;

export const ANCHO_LATERAL = 248;   // barra lateral (expandida)
export const ANCHO_RIEL = 84;       // riel (media)
export const ALTO_BARRA_INF = 64;   // barra inferior (compacta)
export const TACTIL = 44;           // alto mínimo de un control táctil

export const COL = {
  fondo: "#f3f5f9",
  superficie: C.card,
  borde: "#d9dfe8",
  texto: C.text,
  texto2: C.muted,
  marca: C.primary,
  marcaTexto: C.primaryText,
  acento: C.accent2,
  acentoFondo: C.accent2Bg,
  peligro: C.danger, peligroFondo: C.dangerBg,
  aviso: "#b45309", avisoFondo: C.warningBg,
  ok: C.success, okFondo: C.successBg,
  info: C.info, infoFondo: C.infoBg,
  lateral: "#141b4d",          // fondo de la barra lateral / riel
  lateralTexto: "rgba(255,255,255,0.86)",
  lateralTenue: "rgba(255,255,255,0.58)",
  lateralActivo: "rgba(255,255,255,0.14)",
};

export const SOMBRA = "0 1px 2px rgba(16,24,40,0.06), 0 1px 3px rgba(16,24,40,0.08)";
