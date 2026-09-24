/* eslint-disable */
// Correo del Informe Técnico de Osiris: asunto, cuerpo y vista previa.
//
// Todo acá es función pura. El módulo NO envía nada y NO hace ninguna llamada de
// red (no hay fetch, ni emailjs, ni /api/send-email): quien envía sigue siendo
// `enviarPorEmail` en OsirisModule.jsx. Acá solo se arma el texto, para poder
// revisarlo en pantalla y probarlo sin tocar el correo real.
//
// El cuerpo replica carácter por carácter el que ya se envía hoy (viñetas "•",
// guion largo "—", el bloque del link y la nota de Ctrl+P) y le agrega una sola
// cosa: la frase de responsabilidad que pidió el CFO, separada del resto y
// siempre presente, con o sin link y con o sin variedades.

// La frase va exacta. No reformular, no agregar comillas ni negritas.
export const FRASE_RESPONSABILIDAD =
  "Tomar todas las recomendaciones realizadas como una guía, la decisión de utilizarlas queda totalmente bajo su criterio y responsabilidad.";

// Lo que se escribe cuando un dato no viene: el mismo guion largo de siempre.
const SIN_DATO = "—";

// Texto limpio o "—". Nunca inventa contenido.
function texto(v) {
  if (v === null || v === undefined) return SIN_DATO;
  const s = String(v).trim();
  return s === "" ? SIN_DATO : s;
}

// Destinatarios: separa por coma, recorta espacios y descarta vacíos.
// Igual que hoy hace enviarPorEmail.
export function normalizarDestinatarios(texto_) {
  if (texto_ === null || texto_ === undefined) return [];
  const bruto = Array.isArray(texto_) ? texto_.join(",") : String(texto_);
  return bruto
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

// Forma mínima de un correo: algo@algo.algo, sin espacios ni comas.
function pareceEmail(e) {
  return /^[^\s@,]+@[^\s@,]+\.[^\s@,]{2,}$/.test(e);
}

// ¿Se puede enviar? Devuelve los destinatarios válidos y, si no, el motivo.
export function validarDestinatarios(texto_) {
  const lista = normalizarDestinatarios(texto_);
  if (lista.length === 0) {
    return { ok: false, destinatarios: [], motivo: "Ingresa al menos un email." };
  }
  const validos = lista.filter(pareceEmail);
  const invalidos = lista.filter((e) => !pareceEmail(e));
  if (validos.length === 0) {
    return {
      ok: false,
      destinatarios: [],
      motivo: "Ningún destinatario tiene forma de email: " + invalidos.join(", "),
    };
  }
  if (invalidos.length > 0) {
    return {
      ok: false,
      destinatarios: validos,
      motivo: "Hay destinatarios con forma inválida: " + invalidos.join(", "),
    };
  }
  return { ok: true, destinatarios: validos, motivo: "" };
}

// Asunto: idéntico al que ya se usa.
export function asuntoCorreoInforme(informe) {
  const inf = informe || {};
  const titulo = String(inf.titulo || "").trim() || "Visita";
  return `📄 Informe Técnico: ${titulo} — Osiris`;
}

// La parte de variedades de la línea de Especie.
// Si viene la lista nueva (selección múltiple) se listan todas; si no, se usa el
// campo `variedad` de siempre.
function sufijoVariedades(informe, variedades) {
  const lista = Array.isArray(variedades)
    ? variedades.map((v) => String(v == null ? "" : v).trim()).filter(Boolean)
    : [];
  if (lista.length > 0) return " · " + lista.join(", ");
  const legacy = String((informe && informe.variedad) || "").trim();
  return legacy ? " · " + legacy : "";
}

// Cuerpo completo del correo.
// opciones: { cliente, linkInforme, variedades }
export function cuerpoCorreoInforme(informe, opciones) {
  const inf = informe || {};
  const op = opciones || {};
  const link = String(op.linkInforme || "").trim();

  const bloqueLink = link
    ? `
📎 Ver y descargar informe completo:
${link}

(Para guardar como PDF: Ctrl+P → "Guardar como PDF")
`
    : "";

  return `📄 INFORME TÉCNICO — Osiris Plant Management

Estimado(a),

Le enviamos el Informe Técnico correspondiente a:

• Título: ${texto(inf.titulo)}
• Cliente: ${texto(op.cliente)}
• Campo: ${texto(inf.lugar)}
• Especie: ${texto(inf.especie)}${sufijoVariedades(inf, op.variedades)}
• Fecha: ${texto(inf.fecha)}
• Responsable: ${texto(inf.responsable)}
${bloqueLink}
${FRASE_RESPONSABILIDAD}

— Osiris Plant Management · Grupo Mediterra`;
}

// Vista previa para revisar en pantalla. No envía nada: solo devuelve el texto.
export function vistaPreviaCorreo(informe, opciones) {
  const op = opciones || {};
  return {
    para: normalizarDestinatarios(op.emails !== undefined ? op.emails : op.para).join(", "),
    asunto: asuntoCorreoInforme(informe),
    cuerpo: cuerpoCorreoInforme(informe, op),
    esVistaPrevia: true,
  };
}
