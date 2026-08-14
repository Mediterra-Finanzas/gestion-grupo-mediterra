/* eslint-disable */
// pdfText.js — Contrato ÚNICO de salida de texto para los PDF de Frisku (H1).
// jsPDF usa fuentes core WinAnsi/latin-1: las tildes/ñ/ü/ö/ß y —, •, ›, … YA se
// renderizan bien y NO se tocan. Solo se corrige el conjunto auditado que la fuente
// no soporta: emojis decorativos, Δ, Δ%, →. NO es un pdfSafe agresivo: no translitera
// ni degrada nada más. Opera exclusivamente en la capa de presentación PDF (no datos,
// no métricas, no Excel).
//
// Mapeo aprobado (Opción A):
//   Δ%  → "Variación %"
//   Δ   → "Variación"
//   →   → ">"
//   emojis decorativos → eliminados limpiamente

// Regex de emojis pictográficos (preciso; NO matchea →, •, ›, —, …, tildes ni Δ).
// Se construye con try/catch por si el runtime no soporta property escapes.
let EMOJI_RE;
try {
  EMOJI_RE = new RegExp('[\\p{Extended_Pictographic}\\u{FE0F}\\u{200D}\\u{20E3}\\u{1F1E6}-\\u{1F1FF}]', 'gu');
} catch (e) {
  // Fallback por rangos (cubre los iconos de especie y modificadores de emoji).
  EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu;
}

// Transforma UN string para salida PDF. No-strings (números, etc.) pasan intactos.
export function pdfText(v){
  if(typeof v !== 'string') return v;
  let s = v;
  s = s.replace(/Δ%/g, 'Variación %');   // antes que Δ solo, para conservar el espacio
  s = s.replace(/Δ/g, 'Variación');
  s = s.replace(/→/g, '>');
  s = s.replace(EMOJI_RE, '');            // quita emojis decorativos
  s = s.replace(/[ \t]{2,}/g, ' ').replace(/^[ \t]+|[ \t]+$/g, ''); // limpia dobles espacios/bordes
  return s;
}
// Alias semántico (headers/labels).
export const pdfLabel = pdfText;

// Aplica el contrato a un doc jsPDF UNA vez: parcha doc.text y doc.autoTable para que
// TODO el texto que emiten pase por pdfText(). Así no hay reemplazos dispersos en los
// exportadores: basta con que el doc se cree ya configurado.
export function configureFriskuPdf(doc){
  if(!doc || doc.__friskuPatched) return doc;
  const origText = doc.text.bind(doc);
  doc.text = function(text, ...rest){
    const t = Array.isArray(text) ? text.map(pdfText) : pdfText(text);
    return origText(t, ...rest);
  };
  if(typeof doc.autoTable === 'function'){
    const origAuto = doc.autoTable.bind(doc);
    doc.autoTable = function(opts){
      const prevHook = opts && opts.didParseCell;
      const merged = Object.assign({}, opts, {
        didParseCell: (data)=>{
          try { if(data && data.cell && Array.isArray(data.cell.text)) data.cell.text = data.cell.text.map(pdfText); } catch(e){}
          if(typeof prevHook === 'function') prevHook(data);
        }
      });
      return origAuto(merged);
    };
  }
  doc.__friskuPatched = true;
  return doc;
}
