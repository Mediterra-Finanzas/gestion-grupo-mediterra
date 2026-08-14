/* eslint-disable */
// nombreCanonico.js — Regla canónica ÚNICA para nombres de maestros Cliente/Exportador.
// Es EXACTAMENTE la regla aprobada en FASE 2 (la misma que normalizó los 138 maestros
// existentes) → idempotente: normalizarNombre(nombre_ya_canónico) === nombre.
// Prevención en creación/edición: normalizar en origen + detectar duplicados por clave.
// No usa CSS/display; la fuente de verdad queda corregida en el maestro.

// (1) Sufijos societarios: clave (sin puntos/comas, minúscula) → forma canónica.
export const SUFIJOS = {
  sa:"S.A.", sac:"S.A.C.", sas:"S.A.S.", sl:"S.L.", srl:"S.R.L.",
  spa:"SpA", ltda:"Ltda.", ltd:"Ltd.", inc:"Inc.", gmbh:"GmbH", co:"Co."
};
// (2) Tildes: diccionario CERRADO de términos inequívocos (whole token, minúscula → Title con tilde).
export const TILDES = { agricola:"Agrícola", peru:"Perú", compania:"Compañía", "compañia":"Compañía" };
// (3) Acrónimos/marcas preservados en MAYÚSCULA (inequívocos + excepciones aprobadas).
//     GT/MSC/CMA/CGM = acrónimos base; TYT/RVR = marcas aprobadas por el CFO. 3P y C&L se
//     preservan por regla estructural (dígito / &), no requieren estar aquí.
export const ACRONIMOS = new Set(["GT","MSC","CMA","CGM","TYT","RVR"]);
// (4) Conectores en minúscula mid-nombre. El/La/Los/Las NO se bajan (nombre propio).
export const CONECTORES = new Set(["y","e","o","de","del","and","of"]);

const titleWord = (w)=> w.length ? w[0].toUpperCase()+w.slice(1).toLowerCase() : w;

// Limpieza de calidad (no cambia entidad): espacio tras coma; sin guion/puntos colgantes al final.
function preclean(s){
  let x = String(s==null?"":s).replace(/\s+/g,' ').trim();
  x = x.replace(/,(?=\S)/g, ', ');            // "Co.,Ltd." -> "Co., Ltd."
  x = x.replace(/[\s.,-]*[-–][\s.,-]*$/,'');   // guion residual final ("LTDA.-" -> "LTDA")
  return x.replace(/\s+/g,' ').trim();
}

export function normalizarNombre(raw){
  const toks = preclean(raw).split(' ');
  if(toks.length===1 && toks[0]==='') return '';
  const out = toks.map((tok,i)=>{
    const m = tok.match(/^([("¿¡«]*)(.*?)([)",.;:»]*)$/);
    let pre=m?m[1]:'', core=m?m[2]:tok, post=m?m[3]:'';
    if(!core) return tok;
    const bare = core.replace(/[.,]/g,'').toLowerCase();
    const keepComma = post.includes(',');
    if(SUFIJOS[bare]) return pre+SUFIJOS[bare]+(keepComma?',':'');                 // sufijo societario
    if(/^([A-Za-z]\.){1,}[A-Za-z]?\.?$/.test(core)) return pre+core.toUpperCase()+post; // iniciales C.H.
    if(core==='&') return pre+core+post;
    if(core.includes('&')) return pre+core.toUpperCase()+post;                      // C&L
    if(i>0 && CONECTORES.has(bare)) return pre+bare+post;                           // conector mid-nombre
    if(ACRONIMOS.has(core.toUpperCase())) return pre+core.toUpperCase()+post;       // acrónimo/marca aprobada
    if(TILDES[bare]) return pre+TILDES[bare]+post;                                  // tilde de diccionario
    // dígito o sin vocales (posible acrónimo/marca no listado) → se PRESERVA tal cual
    if(/^[A-Z0-9]{2,5}$/.test(core) && (/[0-9]/.test(core) || !/[AEIOU]/.test(core))) return pre+core+post;
    return pre+titleWord(core)+post;                                                // Title Case por defecto
  });
  return out.join(' ').replace(/\s+/g,' ').trim();
}

// Clave normalizada para detección de duplicados (sin tildes/puntuación/espacios/caso).
export function claveNormalizada(s){
  return String(s==null?"":s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]/g,'');
}

// Busca un registro ACTIVO del mismo tipo con la misma clave normalizada (excluye exceptId, p.ej. al editar).
export function buscarDuplicado(nombre, lista, exceptId){
  const k = claveNormalizada(normalizarNombre(nombre));
  if(!k) return null;
  return (lista||[]).find(o => o && o.id!==exceptId && o.activo!==false && claveNormalizada(o.nombre)===k) || null;
}
