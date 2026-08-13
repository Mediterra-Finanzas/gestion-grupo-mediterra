/* eslint-disable */
// src/proceso/ui/estilos.js — tokens visuales del módulo (consume theme.js neutral).
import { theme as T } from "../../theme";

export const C = T; // paleta corporativa neutral (no redefinir colores)

// tono de badge -> {color, bg} desde tokens de theme
export const TONO = {
  neutral: { color: C.muted, bg: C.cardAlt },
  info: { color: C.info, bg: C.infoBg },
  primary: { color: C.primary, bg: C.infoBg },
  success: { color: C.success, bg: C.successBg },
  warning: { color: C.warning, bg: C.warningBg },
  danger: { color: C.danger, bg: C.dangerBg },
  purple: { color: C.purple, bg: C.purpleBg },
};

export const sp = C.sp;
