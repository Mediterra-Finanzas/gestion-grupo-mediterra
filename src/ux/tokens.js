/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// UX EJECUTIVO · TOKENS
// ═══════════════════════════════════════════════════════════════════
//
// Capa de diseño sobre `src/theme.js`. NO define una paleta nueva: toma la
// paleta Mediterra que ya existe y le agrega lo que faltaba para una app
// financiera densa — escala de densidad, tintas legibles sobre los fondos de
// estado, breakpoints y un anillo de foco visible.
//
// Regla de oro de este carril: cada color que se use como TEXTO tiene que
// declarar aquí sobre qué fondo va, y `PARES_CONTRASTE` lo deja auditable.
// La prueba `qa-ux-a11y.test.js` calcula el ratio WCAG real de cada par; si
// alguien introduce una combinación ilegible, la suite se cae.
//
// Hallazgo que motivó las "tintas": tres tokens de estado del tema NO pasan
// AA sobre su propio fondo claro y se estaban usando como texto:
//   theme.warning  #d97706 sobre #fef3c7  →  2,86 : 1   (mínimo 4,5)
//   theme.success  #1e8449 sobre #ecf8f0  →  4,33 : 1
//   theme.muted2   #8a97a8 sobre #ffffff  →  2,97 : 1
// Se conservan para bordes/íconos y se agregan `ink*` para texto.

import { theme } from "../theme";

// ── Superficies ────────────────────────────────────────────────────
export const surface = {
  app:      theme.bg,        // #dfe5ee
  panel:    theme.card,      // #ffffff
  panelAlt: theme.cardAlt,   // #eaeef4
  row:      theme.card,
  rowAlt:   theme.rowAlt,    // #eef2f8
  rail:     theme.primary,   // #1E2761 — el riel es la única zona oscura
  railDeep: "#161C48",       // hover/fondo del ítem activo dentro del riel
};

// ── Tinta (texto) ──────────────────────────────────────────────────
// `faint` no se usa nunca como texto: existe para separadores e íconos.
export const ink = {
  strong:  theme.text,    // #1e2733 sobre panel  → 14,6:1
  soft:    theme.muted,   // #5b6b7f sobre panel  →  5,4:1
  onRail:  "#ffffff",     //         sobre rail   → 13,8:1
  onRailSoft: "#b9c2e2",  //         sobre rail   →  7,8:1
  faint:   theme.muted2,  // NO TEXTO. Íconos decorativos y hairlines.
};

// ── Tintas de estado, legibles sobre su propio fondo ───────────────
export const estado = {
  critico: { fg: "#8c2318", bg: theme.dangerBg,  borde: theme.danger  },
  alto:    { fg: "#92400e", bg: theme.warningBg, borde: theme.warning },
  ok:      { fg: "#14532d", bg: theme.successBg, borde: theme.success },
  info:    { fg: theme.info,   bg: theme.infoBg,    borde: theme.info   },
  neutro:  { fg: theme.muted,  bg: theme.cardAlt,   borde: theme.border },
  foco:    { fg: "#5b21b6", bg: theme.purpleBg,  borde: theme.purple  },
  activo:  { fg: "#0b544e", bg: theme.accent2Bg, borde: theme.accent2 },
};

// Orden de severidad. Único lugar donde se decide qué es "más urgente".
export const SEVERIDADES = ["critico", "alto", "info", "ok"];

export const pesoSeveridad = (s) => {
  const i = SEVERIDADES.indexOf(s);
  return i === -1 ? SEVERIDADES.length : i;
};

// ── Densidad ───────────────────────────────────────────────────────
// Una app financiera se lee mejor apretada. `compacta` es el default de
// escritorio; `comoda` existe para tacto (tablet/teléfono).
export const densidad = {
  compacta: { fila: 28, celdaY: 4, celdaX: 8,  fuente: 12, cabecera: 26 },
  comoda:   { fila: 40, celdaY: 9, celdaX: 12, fuente: 14, cabecera: 36 },
};

// ── Layout ─────────────────────────────────────────────────────────
export const layout = {
  railAncho: 60,          // riel de íconos (escritorio angosto)
  railAnchoAbierto: 232,  // riel con etiquetas
  barraSuperior: 52,
  radio: theme.radius,
  sp: theme.sp,
  font: theme.font,
  fontMono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
  borde: theme.border,
  bordeFuerte: theme.border2,
  sombra: theme.shadowSm,
};

// ── Breakpoints ────────────────────────────────────────────────────
// Tres, no cinco. Cada uno cambia el layout de verdad, no solo el padding.
export const BREAKPOINTS = { movil: 700, tablet: 1100 };

export const consultasMedia = {
  movil:  `(max-width: ${BREAKPOINTS.movil}px)`,
  tablet: `(min-width: ${BREAKPOINTS.movil + 1}px) and (max-width: ${BREAKPOINTS.tablet}px)`,
  escritorio: `(min-width: ${BREAKPOINTS.tablet + 1}px)`,
};

// ── Foco ───────────────────────────────────────────────────────────
// Visible sobre claro y sobre el riel oscuro. Se aplica con `:focus-visible`
// para no molestar al mouse, y nunca se anula con outline:none sin reemplazo.
export const anilloFoco = {
  claro: `0 0 0 2px ${surface.panel}, 0 0 0 4px ${theme.primary}`,
  oscuro: `0 0 0 2px ${surface.rail}, 0 0 0 4px ${theme.accent}`,
};

// Sólo lectura para lectores de pantalla. Sin `display:none`, que los oculta.
export const soloLector = {
  position: "absolute", width: 1, height: 1, padding: 0, margin: -1,
  overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0,
};

// ── Auditoría de contraste ─────────────────────────────────────────
// `min` es el umbral WCAG 2.1 que corresponde al uso real del par:
//   4.5 → texto normal (AA)   3 → texto grande o borde de control (AA)
// Todo par declarado aquí se verifica en `qa-ux-a11y.test.js`.
export const PARES_CONTRASTE = [
  { uso: "texto principal en panel",     fg: ink.strong,       bg: surface.panel,    min: 4.5 },
  { uso: "texto principal en fila alt",  fg: ink.strong,       bg: surface.rowAlt,   min: 4.5 },
  { uso: "texto secundario en panel",    fg: ink.soft,         bg: surface.panel,    min: 4.5 },
  { uso: "texto secundario en fila alt", fg: ink.soft,         bg: surface.rowAlt,   min: 4.5 },
  { uso: "texto secundario en panelAlt", fg: ink.soft,         bg: surface.panelAlt, min: 4.5 },
  { uso: "riel · ítem activo",           fg: ink.onRail,       bg: surface.rail,     min: 4.5 },
  { uso: "riel · ítem inactivo",         fg: ink.onRailSoft,   bg: surface.rail,     min: 4.5 },
  { uso: "riel · ítem sobre hover",      fg: ink.onRail,       bg: surface.railDeep, min: 4.5 },
  { uso: "riel · marca de activo",       fg: theme.accent,     bg: surface.rail,     min: 3   },
  { uso: "riel · contador de pendientes", fg: "#2b1c05",       bg: theme.accent,     min: 4.5 },
  { uso: "badge crítico",                fg: estado.critico.fg, bg: estado.critico.bg, min: 4.5 },
  { uso: "badge alto",                   fg: estado.alto.fg,    bg: estado.alto.bg,    min: 4.5 },
  { uso: "badge ok",                     fg: estado.ok.fg,      bg: estado.ok.bg,      min: 4.5 },
  { uso: "badge info",                   fg: estado.info.fg,    bg: estado.info.bg,    min: 4.5 },
  { uso: "badge neutro",                 fg: estado.neutro.fg,  bg: estado.neutro.bg,  min: 4.5 },
  { uso: "badge foco",                   fg: estado.foco.fg,    bg: estado.foco.bg,    min: 4.5 },
  { uso: "badge activo",                 fg: estado.activo.fg,  bg: estado.activo.bg,  min: 4.5 },
  { uso: "botón primario",               fg: theme.primaryText, bg: theme.primary,     min: 4.5 },
  { uso: "anillo de foco sobre panel",   fg: theme.primary,     bg: surface.panel,     min: 3   },
];

// Tokens que están PROHIBIDOS como color de texto. La prueba los verifica
// contra el código de `src/ux/**` para que no se cuelen por descuido.
export const TINTAS_PROHIBIDAS_COMO_TEXTO = [theme.muted2, theme.accent];

export default { surface, ink, estado, densidad, layout, BREAKPOINTS, anilloFoco };
