// ═══════════════════════════════════════════════════════════════════
// TEMA CENTRAL — paleta clara "Mediterra"
// ═══════════════════════════════════════════════════════════════════
//
// Estructura preparada para un futuro toggle dark/light:
//   - lightTheme define la paleta clara actual.
//   - theme = lightTheme por ahora; cuando se agregue darkTheme, esta
//     constante pasa a ser dinámica (por contexto, prefs del usuario, etc.).
//
// Convención: cada módulo importa `theme` y construye su `C` local con
// spread + alias para mantener los nombres de tokens preexistentes
// (C.azul, C.green, C.yellow, C.bg2, etc.) sin tener que tocar las
// referencias en el JSX. Ver FriskuModule.jsx para el patrón.
//
// Cualquier cambio de paleta se hace ACÁ. Los módulos no deben definir
// colores hardcoded.

export const lightTheme = {
  // ── Fondos ──────────────────────────────────────────────────────
  bg:        "#dfe5ee",   // fondo principal de la app (gris azulado con cuerpo)
  bg2:       "#eaeef4",   // alias tonal secundario (hovers, zonas alternas)
  card:      "#ffffff",   // tarjetas y paneles
  cardAlt:   "#eaeef4",   // card hover / input bg
  border:    "#c5cedb",   // bordes estándar
  border2:   "#aab6c6",   // bordes destacados
  rowAlt:    "#eef2f8",   // zebra striping (contraste visible vs card #ffffff)

  // ── Texto ───────────────────────────────────────────────────────
  text:      "#1e2733",   // texto principal
  muted:     "#5b6b7f",   // texto secundario
  muted2:    "#8a97a8",   // texto muy tenue

  // ── Primario / Acento ───────────────────────────────────────────
  primary:     "#1E2761", // brand color (azul marino Mediterra)
  primaryText: "#ffffff", // texto sobre primary
  accent:      "#D4A574", // acento dorado (CTAs secundarios, destacados)
  accent2:     "#0f766e", // acento verdoso/teal (badges, etiquetas)
  accent2Bg:   "#ccfbf1", // background light del accent2

  // ── Estados ─────────────────────────────────────────────────────
  success:   "#1e8449", successBg: "#ecf8f0",
  danger:    "#c0392b", dangerBg:  "#fdecea",
  warning:   "#d97706", warningBg: "#fef3c7",
  info:      "#2a3578", infoBg:    "#eef3ff",

  // ── Otros acentos para badges/categorías ────────────────────────
  purple:    "#7c3aed", purpleBg:  "#ede9fe",

  // ── Sombras ─────────────────────────────────────────────────────
  shadow:    "0 2px 8px rgba(16,24,40,0.10), 0 1px 3px rgba(16,24,40,0.06)",
  shadowSm:  "0 1px 3px rgba(16,24,40,0.08)",

  // ── Tipografía (Dirección A) ────────────────────────────────────
  // Stack de fuente. La carga real es global (public/index.html + index.css);
  // este token queda disponible para usarlo explícito en JSX si se quiere.
  font: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",

  // ── Escala de espaciado (base 4px) ──────────────────────────────
  // Reemplaza los gaps ad-hoc (5,6,7,10,14,18…) por una escala consistente.
  sp: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },

  // ── Radios de borde ─────────────────────────────────────────────
  radius: { sm: 6, md: 8, lg: 12, xl: 20 },

  // ── Foco ────────────────────────────────────────────────────────
  focusRing: "0 0 0 2px rgba(30,39,97,0.18)",
};

export const theme = lightTheme;
