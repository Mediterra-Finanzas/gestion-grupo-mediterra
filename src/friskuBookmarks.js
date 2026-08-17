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

// Filtra referencias de dims/medidas dentro de la config de objeto (best-effort, no rompe).
function validObj(obj, dset, mset, avisos){
  if(!obj || typeof obj!=="object") return {};
  const o = JSON.parse(JSON.stringify(obj));
  const keepDims = (arr)=> Array.isArray(arr) ? arr.filter(d=>{ const ok=dset.has(d); if(!ok) avisos.push(`Dimensión '${d}' ya no existe`); return ok; }) : arr;
  const keepMeds = (arr)=> Array.isArray(arr) ? arr.filter(m=>{ const ok=mset.has(m); if(!ok) avisos.push(`Medida '${m}' ya no existe`); return ok; }) : arr;
  const valDim = (v)=> (v==null||dset.has(v)) ? v : (avisos.push(`Dimensión '${v}' ya no existe`), null);
  const valMed = (v)=> (v==null||mset.has(v)) ? v : (avisos.push(`Medida '${v}' ya no existe`), null);
  if(o.tabla){ o.tabla.dimSel=keepDims(o.tabla.dimSel); o.tabla.medSel=keepMeds(o.tabla.medSel); }
  if(o.pivot){ o.pivot.row1=valDim(o.pivot.row1); o.pivot.row2=(o.pivot.row2?valDim(o.pivot.row2):o.pivot.row2); o.pivot.colDim=valDim(o.pivot.colDim); o.pivot.medKey=valMed(o.pivot.medKey); }
  if(o.drill){ o.drill.medKey=valMed(o.drill.medKey); }
  if(o.grafico){ o.grafico.dim1=valDim(o.grafico.dim1); o.grafico.dim2=(o.grafico.dim2?valDim(o.grafico.dim2):o.grafico.dim2); }
  return o;
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
