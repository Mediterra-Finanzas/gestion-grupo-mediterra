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

// ── Logo de cada empresa (una sola tabla para las exportaciones) ────────────
// Acepta los dos nombres que circulan en la app: la clave corta del flujo y de
// nóminas ("Mediterra", "Osiris", "Allpa Farms") y el nombre de presentación del
// reporte ("Mediterra Holding", "Osiris Plant Management", "Allpa Farms Chile").
const LOGOS_EMPRESA = {
  "Mediterra": "/med.png", "Mediterra Holding": "/med.png", "Grupo Mediterra": "/med.png",
  "Allegria Foods": "/allegria-logo.jpg",
  "Allegria Service": "/allegria-service-logo.png",
  "Frisku Foods": "/frisku.png", "Frisku Foods Perú": "/frisku.png",
  "Osiris": "/osiris-logo.jpg", "Osiris Plant Management": "/osiris-logo.jpg",
  "Integrity Farms": "/integrity-logo.png",
  "Allpa Farms": "/allpa-chile-logo.png", "Allpa Farms Chile": "/allpa-chile-logo.png",
  "Allpa Farms Perú": "/allpa-peru-logo.png",
};
export function rutaLogoEmpresa(nombre) { return LOGOS_EMPRESA[String(nombre || "").trim()] || null; }

// Formato de imagen para jsPDF a partir de un data URL ("PNG" | "JPEG").
export function formatoDataUrl(dataUrl) { return /^data:image\/jpe?g/i.test(String(dataUrl || "")) ? "JPEG" : "PNG"; }

// Tamaño en píxeles de un PNG (cabecera IHDR).
export function tamanoPng(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (u.length < 24 || u[0] !== 0x89 || u[1] !== 0x50 || u[2] !== 0x4e || u[3] !== 0x47) return null;
  const n = (i) => ((u[i] << 24) | (u[i + 1] << 16) | (u[i + 2] << 8) | u[i + 3]) >>> 0;
  return { ancho: n(16), alto: n(20) };
}
export function tamanoImagen(bytes) { return tamanoPng(bytes) || tamanoJpeg(bytes); }

// ── Logo en un Excel armado a mano (OOXML con JSZip) ───────────────────────
// Agrega el logo en las filas de título, con alto fijo y su proporción real:
// a la derecha del texto del título (`minIzquierdaPx`, que estima quien llama) y
// dentro de la primera pantalla (`limiteDerechoPx`): en una hoja ancha, pegado al
// extremo derecho del área usada quedaría fuera de la vista. No tapa cifras: las
// filas de título no tienen otras celdas. Devuelve false (y no toca el archivo) si la imagen no se
// pudo leer. La hoja debe terminar en `</worksheet>` sin elementos posteriores
// a <mergeCells> (así son los Excel armados a mano de la app).
const EMU_PX = 9525, EMU_PT = 12700;
const pxDeAncho = (w) => Math.trunc(Number(w) * 7 + 5);   // ancho de columna en caracteres → px
export async function agregarLogoHoja(zip, { bytes, colWidths = [], altoPt = 50, hoja = 1, margenPx = 8, limiteDerechoPx = 980, minIzquierdaPx = 0 } = {}) {
  const dim = tamanoImagen(bytes);
  if (!dim || !dim.ancho || !dim.alto) return false;
  const ext = tamanoPng(bytes) ? "png" : "jpeg";
  const cy = Math.round(altoPt * EMU_PT);
  const cx = Math.round(cy * dim.ancho / dim.alto);
  const anchos = colWidths.map(pxDeAncho);
  const total = anchos.reduce((a, b) => a + b, 0);
  const anchoLogo = Math.round(cx / EMU_PX);
  // Borde derecho: el menor entre el área usada y la primera pantalla; nunca encima del título.
  let x = Math.min(total, limiteDerechoPx) - anchoLogo - margenPx;
  if (x < minIzquierdaPx) x = Math.min(minIzquierdaPx, Math.max(0, total - anchoLogo - margenPx));
  x = Math.max(0, x);
  let col = 0;
  while (col < anchos.length - 1 && x >= anchos[col]) { x -= anchos[col]; col++; }
  const sheetPath = `xl/worksheets/sheet${hoja}.xml`;
  const sheetXml = await zip.file(sheetPath).async("string");
  if (!/<\/worksheet>\s*$/.test(sheetXml) || /<drawing\b/.test(sheetXml)) return false;
  zip.file(`xl/media/logo_empresa.${ext}`, bytes);
  zip.file("xl/drawings/drawing1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <xdr:oneCellAnchor>
    <xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>${x * EMU_PX}</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>${3 * EMU_PX}</xdr:rowOff></xdr:from>
    <xdr:ext cx="${cx}" cy="${cy}"/>
    <xdr:pic>
      <xdr:nvPicPr><xdr:cNvPr id="2" name="Logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>
      <xdr:blipFill><a:blip r:embed="rIdImg1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
      <xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>
    </xdr:pic>
    <xdr:clientData/>
  </xdr:oneCellAnchor>
</xdr:wsDr>`);
  zip.file("xl/drawings/_rels/drawing1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo_empresa.${ext}"/></Relationships>`);
  const relsPath = `xl/worksheets/_rels/sheet${hoja}.xml.rels`;
  const relDibujo = `<Relationship Id="rIdLogo1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>`;
  const relsPrev = zip.file(relsPath) ? await zip.file(relsPath).async("string") : null;
  zip.file(relsPath, relsPrev ? relsPrev.replace("</Relationships>", `${relDibujo}</Relationships>`)
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relDibujo}</Relationships>`);
  zip.file(sheetPath, sheetXml.replace(/<\/worksheet>\s*$/, `<drawing r:id="rIdLogo1"/></worksheet>`));
  let ct = await zip.file("[Content_Types].xml").async("string");
  const mime = ext === "png" ? "image/png" : "image/jpeg";
  if (!new RegExp(`Extension="${ext}"`, "i").test(ct)) ct = ct.replace("<Default ", `<Default Extension="${ext}" ContentType="${mime}"/><Default `);
  if (!/drawings\/drawing1\.xml/.test(ct)) ct = ct.replace("</Types>", `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
  zip.file("[Content_Types].xml", ct);
  return true;
}

// Bytes de un logo de /public (null si no se pudo leer: la exportación sigue sin logo).
export async function cargarBytesLogo(ruta) {
  if (!ruta) return null;
  try { const r = await fetch(ruta); if (!r.ok) return null; return new Uint8Array(await r.arrayBuffer()); }
  catch (e) { return null; }
}
