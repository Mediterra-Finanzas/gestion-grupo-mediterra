// ═══════════════════════════════════════════════════════════════════
// LOGOS EN EXPORTACIONES — una sola regla: el logo se encaja en la caja que
// ya tenía (ancho y alto máximos) conservando su proporción real. Nunca se
// estira. Lo usan los PDF (jsPDF) y el Excel de Osiris.
// ═══════════════════════════════════════════════════════════════════

// Medidas que caben en maxW × maxH con la proporción anchoNat:altoNat.
// Sin medidas válidas devuelve null (quien llama decide no dibujar o usar la caja).
export function encajarLogo(anchoNat, altoNat, maxW, maxH) {
  const a = Number(anchoNat), b = Number(altoNat);
  if (!(a > 0 && b > 0 && maxW > 0 && maxH > 0)) return null;
  const s = Math.min(maxW / a, maxH / b);
  return { w: a * s, h: b * s };
}

// jsPDF: lee el tamaño de la imagen con el propio documento (getImageProperties).
export function medidasLogoPDF(doc, dataUrl, maxW, maxH) {
  try {
    const p = doc.getImageProperties(dataUrl);
    return encajarLogo(p.width, p.height, maxW, maxH) || { w: maxW, h: maxH };
  } catch (e) { return { w: maxW, h: maxH }; }
}

// Tamaño en píxeles de un JPEG leyendo su marcador SOF (sin cargar la imagen).
export function tamanoJpeg(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (u[0] !== 0xff || u[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < u.length) {
    if (u[i] !== 0xff) { i++; continue; }
    const m = u[i + 1];
    const largo = (u[i + 2] << 8) | u[i + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { alto: (u[i + 5] << 8) | u[i + 6], ancho: (u[i + 7] << 8) | u[i + 8] };
    }
    i += 2 + largo;
  }
  return null;
}
