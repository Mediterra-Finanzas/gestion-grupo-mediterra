/* eslint-disable */
// friskuBookmarks.js — Vistas guardadas (bookmarks) del Unified Analysis Workspace.
// Persistencia LOCAL por usuario (localStorage), aislada; sin Supabase; sin compartir.
// Esquema versionado y tolerante (migración/validación al recuperar). Módulo PURO
// (salvo el acceso a localStorage, aislado en read/write con try/catch).

export const BOOKMARK_SCHEMA = 2; // v1: sin locks · v2: + locked[]

const KEY   = (owner)=> `frisku_bi_bookmarks::${owner || "_anon"}`;
const nowIso= ()=> new Date().toISOString();
const genId = ()=> "bm_" + Math.random().toString(36).slice(2,9) + Date.now().toString(36);
const norm  = (s)=> String(s==null?"":s).trim().toLowerCase();

// sel {dimKey:Set|Array} → {dimKey:[valores]} (serializable). Ignora vacíos.
export function serializeSel(sel){
  const o={};
  Object.keys(sel||{}).forEach(k=>{ const s=sel[k]; const arr = s instanceof Set ? [...s] : (Array.isArray(s)?s:[]); if(arr.length) o[k]=arr; });
  return o;
}
// {dimKey:[valores]} → {dimKey:[valores]} depurado (para pasar a applySel, que arma los Set).
export function deserializeSel(obj){
  const o={};
  Object.keys(obj||{}).forEach(k=>{ const arr=Array.isArray(obj[k])?obj[k]:[]; if(arr.length) o[k]=arr; });
  return o;
}

// Construye una vista desde el estado actual del workspace.
export function buildBookmark({ nombre, owner, hoja, preset, viz, panelOpen, sel, locked, obj }){
  return {
    schema: BOOKMARK_SCHEMA, id: genId(),
    nombre: String(nombre||"").trim() || "Vista",
    owner: owner || "", creado: nowIso(), actualizado: nowIso(),
    hoja: hoja || "analisis",
    preset: preset || "libre", viz: viz || "tabla", panelOpen: !!panelOpen,
    sel: serializeSel(sel),
    locked: Array.isArray(locked) ? [...new Set(locked)] : [],
    obj: obj || {},
  };
}

// Defaults seguros por objeto (deben coincidir con los useState de cada componente).
const DEF_TABLA = { dimSel:["cliente"], medSel:["containers","fcl","boxes","friskuCommissionUSD"], sortCol:"med:friskuCommissionUSD", sortDir:"desc" };

// Filtra/repara la config de objeto contra los catálogos vigentes (best-effort, nunca rompe;
// aplica defaults seguros a lo inválido y conserva el resto de la vista).
function validObj(obj, dset, mset, avisos){
  if(!obj || typeof obj!=="object") return {};
  const o = JSON.parse(JSON.stringify(obj));
  const keepDims = (arr)=> Array.isArray(arr) ? arr.filter(d=>{ const ok=dset.has(d); if(!ok) avisos.push(`Dimensión '${d}' ya no existe`); return ok; }) : [];
  const keepMeds = (arr)=> Array.isArray(arr) ? arr.filter(m=>{ const ok=mset.has(m); if(!ok) avisos.push(`Medida '${m}' ya no existe`); return ok; }) : [];
  const valDim = (v)=> (v==null||dset.has(v)) ? v : (avisos.push(`Dimensión '${v}' ya no existe`), null);
  const valMed = (v)=> (v==null||mset.has(v)) ? v : (avisos.push(`Medida '${v}' ya no existe`), null);

  if(o.tabla){
    let ds = keepDims(o.tabla.dimSel); if(ds.length===0){ ds=[...DEF_TABLA.dimSel]; avisos.push("Tabla: sin dimensiones válidas → default"); }
    let ms = keepMeds(o.tabla.medSel); if(ms.length===0){ ms=[...DEF_TABLA.medSel]; avisos.push("Tabla: sin medidas válidas → default"); }
    o.tabla.dimSel = ds; o.tabla.medSel = ms;
    o.tabla.sortDir = (o.tabla.sortDir==="asc"||o.tabla.sortDir==="desc") ? o.tabla.sortDir : "desc";
    const sc = o.tabla.sortCol;
    const okSort = typeof sc==="string" && (sc==="part" || (sc.startsWith("dim:")&&ds.includes(sc.slice(4))) || (sc.startsWith("med:")&&ms.includes(sc.slice(4))));
    if(!okSort){ if(sc) avisos.push("Tabla: columna de orden incompatible → default"); o.tabla.sortCol = "med:"+ms[0]; }
  }
  if(o.pivot){
    const p=o.pivot;
    if(!dset.has(p.row1)){ if(p.row1!=null) avisos.push("Pivot: fila 1 inválida → default"); p.row1="cliente"; }
    if(!dset.has(p.colDim)){ if(p.colDim!=null) avisos.push("Pivot: columna inválida → default"); p.colDim="temporada"; }
    if(!mset.has(p.medKey)){ if(p.medKey!=null) avisos.push("Pivot: medida inválida → default"); p.medKey="fcl"; }
    if(p.row2!=null && !dset.has(p.row2)){ avisos.push("Pivot: fila 2 inválida → sin fila 2"); p.row2=null; }
    if(p.row2!=null && p.row2===p.row1){ avisos.push("Pivot: fila 2 = fila 1 → sin fila 2"); p.row2=null; }
    p.expanded = Array.isArray(p.expanded) ? p.expanded.filter(x=>typeof x==="string") : [];   // Set→array (serializable)
  }
  if(o.drill){
    const d=o.drill;
    if(!mset.has(d.medKey)){ if(d.medKey!=null) avisos.push("Drill: medida inválida → default"); d.medKey="fcl"; }
    if(typeof d.grpKey!=="string") d.grpKey="comercial";   // validez del grupo se afina en runtime (DRILL_GROUPS)
    // La ruta se conserva estructural; el orden por nivel y la existencia del valor se depuran en runtime (sanitizeDrillPath + hechos).
    d.path = Array.isArray(d.path) ? d.path.filter(x=>x&&typeof x==="object"&&typeof x.dimKey==="string").map(x=>({dimKey:x.dimKey, value:x.value, label:x.label})) : [];
  }
  if(o.grafico){
    // El gráfico usa un catálogo POR FUENTE (no FRISKU_DIMS/METRICS): fuenteId/measureId/
    // dim1/dim2 se validan en runtime (clamp de TableroAsociativo). Aquí solo Top N.
    const g=o.grafico;
    if(g.topN!=null && !(Number.isFinite(g.topN)&&g.topN>0)){ avisos.push("Gráfico: Top N inválido → default"); g.topN=12; }
  }
  return o;
}

// Depura la ruta de Drill contra el ORDEN de dimensiones del grupo (Drill State, no Selection State).
// Conserva el prefijo válido; corta en el primer tramo cuya dimensión no coincida con el nivel esperado
// o que exceda la profundidad del grupo. Devuelve {path, truncated}. La existencia del VALOR se depura
// aparte en runtime (contra los hechos), no aquí.
export function sanitizeDrillPath(path, groupDims){
  const gd = Array.isArray(groupDims) ? groupDims : [];
  const arr = Array.isArray(path) ? path : [];
  const out = [];
  for(let i=0;i<arr.length;i++){
    const e = arr[i];
    if(i>=gd.length || !e || e.dimKey!==gd[i]) break;
    out.push({ dimKey:e.dimKey, value:e.value, label:e.label });
  }
  return { path: out, truncated: out.length < arr.length };
}

// Valida/migra una vista recuperada contra dims/medidas vigentes. Devuelve {bm, avisos}.
// Ignora SOLO los campos inválidos; conserva el resto; nunca rompe.
export function validateBookmark(bm, dimKeys, metricKeys){
  const avisos=[]; const dset=new Set(dimKeys||[]); const mset=new Set(metricKeys||[]);
  const out = {
    schema: BOOKMARK_SCHEMA,
    id: bm.id || genId(),
    nombre: bm.nombre || "Vista",
    owner: bm.owner || "",
    creado: bm.creado || nowIso(),
    actualizado: bm.actualizado || bm.creado || nowIso(),
    hoja: bm.hoja || "analisis",
    preset: bm.preset || "libre",
    viz: bm.viz || "tabla",
    panelOpen: bm.panelOpen!==false,
    sel: {},
    locked: [],
    obj: {},
  };
  Object.keys(bm.sel||{}).forEach(k=>{ if(dset.has(k)) out.sel[k]=Array.isArray(bm.sel[k])?bm.sel[k]:[]; else avisos.push(`Filtro '${k}' ya no existe`); });
  (bm.locked||[]).forEach(k=>{ if(dset.has(k)) out.locked.push(k); else avisos.push(`Lock '${k}' ya no existe`); });
  out.obj = validObj(bm.obj, dset, mset, avisos);
  return { bm: out, avisos };
}

// ── Persistencia local por usuario ──
function read(owner){ try{ const a=JSON.parse(localStorage.getItem(KEY(owner))||"[]"); return Array.isArray(a)?a:[]; }catch(e){ return []; } }
function write(owner, list){ try{ localStorage.setItem(KEY(owner), JSON.stringify(list)); return true; }catch(e){ return false; } }

export function listBookmarks(owner){ return read(owner).slice().sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre))); }
export function findByName(owner, nombre){ const n=norm(nombre); return read(owner).find(x=>norm(x.nombre)===n) || null; }
// Guarda: si el id existe → actualiza; si no y el nombre ya existe → actualiza esa vista; si no → agrega.
export function saveBookmark(owner, bm){
  const l=read(owner); const iById=l.findIndex(x=>x.id===bm.id);
  if(iById>=0){ l[iById]={ ...bm, actualizado: nowIso() }; }
  else { const iByName=l.findIndex(x=>norm(x.nombre)===norm(bm.nombre)); if(iByName>=0){ l[iByName]={ ...bm, id:l[iByName].id, creado:l[iByName].creado, actualizado: nowIso() }; } else { l.push(bm); } }
  write(owner,l); return l;
}
export function updateBookmark(owner, id, patch){ const l=read(owner); const i=l.findIndex(x=>x.id===id); if(i>=0){ l[i]={ ...l[i], ...patch, actualizado: nowIso() }; write(owner,l); } return l; }
export function renameBookmark(owner, id, nombre){ return updateBookmark(owner, id, { nombre: String(nombre||"").trim()||"Vista" }); }
export function removeBookmark(owner, id){ const l=read(owner).filter(x=>x.id!==id); write(owner,l); return l; }
