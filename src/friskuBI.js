/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// MOTOR BI FRISKU  —  capa reutilizable de reportería
//
//   DATOS FRISKU → MODELO ANALÍTICO → MOTOR DE FILTROS/SELECCIONES
//                → MÉTRICAS/AGREGACIONES → (hojas BI)
//
// Regla: UNA MÉTRICA → UNA DEFINICIÓN. Todas las hojas consumen este motor;
// ninguna reimplementa fórmulas de comisión/venta/kilos por su cuenta.
//
// Granularidad de la tabla de hechos = CONTENEDOR / OE (frisku_embarques),
// con las medidas de dinero traídas desde sus liquidaciones. VERIFICADO-FRISKU.
// ═══════════════════════════════════════════════════════════════════
import React, { createContext, useContext, useMemo, useState, useCallback } from "react";
import { buscarTC, convertirMonto } from "./friskuHelpers.js";

// ── Dimensiones canónicas (verificadas contra el modelo; no se inventan) ──
// key = campo en la fila de hechos · lab = etiqueta UI. Cada key tiene además
// `${key}Lab` en la fila para el texto legible.
export const FRISKU_DIMS = [
  { key:"temporada",    lab:"Temporada" },
  { key:"anioETD",      lab:"Año (ETD)" },
  { key:"semanaETD",    lab:"Semana (ETD)" },
  { key:"especie",      lab:"Especie" },
  { key:"exportadora",  lab:"Exportador" },
  { key:"cliente",      lab:"Cliente" },
  { key:"mercado",      lab:"Mercado" },
  { key:"paisDestino",  lab:"País destino" },
  { key:"puertoOrigen", lab:"Puerto origen" },
  { key:"puertoDestino",lab:"Puerto destino" },
  { key:"via",          lab:"Tipo de embarque" },
  { key:"shippingLine", lab:"Shipping line" },
  { key:"estado",       lab:"Estado" },
  { key:"contenedor",   lab:"Contenedor" },
];

// Agrupa filas por una o varias dimensiones (para Straight Table / Pivot).
// Devuelve grupos {key, dimValues:{dim:valor}, labels:{dim:label}, rows}.
export function groupByDims(rows, dimKeys){
  const dims = (dimKeys||[]).filter(Boolean);
  const m = {};
  rows.forEach(r=>{
    const key = dims.map(d=>r[d]).join(" ‖ ") || "∑";
    if(!m[key]){ const dimValues={}, labels={}; dims.forEach(d=>{ dimValues[d]=r[d]; labels[d]=r[d+"Lab"] ?? r[d]; }); m[key]={key, dimValues, labels, rows:[]}; }
    m[key].rows.push(r);
  });
  return Object.values(m);
}
// NOTA: "variedad" NO es dimensión a nivel contenedor (vive en las líneas del
// Packing List, un contenedor puede tener varias). Queda como brecha (FALTA)
// hasta explotar el PL. No inventar.

// ── Primitivas de medida por liquidación (definición única en USD) ──
// Prioridad: (1) USD nativo, (2) USD ya guardado en la liquidación, (3) fallback EN VIVO
// convirtiendo el monto en moneda base con el TC disponible (triangulado si falta el par
// directo). El fallback SOLO actúa cuando el USD guardado es null y se pasa tcData; sin
// tcData el comportamiento es idéntico al histórico (0 si no había USD guardado). VERIFICADO-FRISKU
export const mComFriskuUSD = (l, tcData)=>{
  if(!l) return 0;
  if(l.monedaBase==="USD") return Number(l.montoComisionFrisku)||0;
  if(l.montoComisionFriskuUSD!=null) return Number(l.montoComisionFriskuUSD)||0;
  const c = tcData ? convertirMonto(Number(l.montoComisionFrisku)||0, l.monedaBase, "USD", l.fechaTC, tcData) : null;
  return Number(c)||0;
};
export const mVentaUSD = (l, tcData)=>{
  if(!l) return 0;
  if(l.ventaTotalUSD!=null) return Number(l.ventaTotalUSD)||0;
  if(l.monedaBase==="USD") return Number(l.ventaTotal!=null?l.ventaTotal:l.baseNeta)||0;
  const base = l.ventaTotal!=null ? l.ventaTotal : l.baseNeta;
  const c = tcData ? convertirMonto(Number(base)||0, l.monedaBase, "USD", l.fechaTC, tcData) : null;
  return Number(c)||0;
};
export const mFobUSD = (l, tcData)=>{
  if(!l) return 0;
  if(l.fobUSD!=null) return Number(l.fobUSD)||0;
  if(l.monedaBase==="USD") return Number(l.fob)||0;
  const c = tcData ? convertirMonto(Number(l.fob)||0, l.monedaBase, "USD", l.fechaTC, tcData) : null;
  return Number(c)||0;
};
// Comisión CLIENTE en USD. La liquidación no guarda su USD precomputado, PERO sí
// guarda la venta convertida (ventaTotalUSD). Ese par venta/ventaTotalUSD es el
// FACTOR FX REAL que la liquidación usó al convertir a USD. La comisión cliente
// está en la misma moneda base, así que se convierte con ese mismo factor → es
// trazable, no un supuesto. Fallback: factor de la comisión Frisku. Si no hay
// ningún factor (raro), devuelve 0 y la liquidación se marca en calidad de datos.
export const mComClienteUSD = (l, tcData)=>{
  const cli = Number(l.montoComisionCliente)||0;
  if(!cli) return 0;
  if(l.monedaBase==="USD") return cli;
  const v=Number(l.ventaTotal)||0, vUSD=Number(l.ventaTotalUSD)||0;
  if(v>0 && vUSD>0) return cli*(vUSD/v);
  const f=Number(l.montoComisionFrisku)||0, fUSD=Number(l.montoComisionFriskuUSD)||0;
  if(f>0 && fUSD>0) return cli*(fUSD/f);
  const c = tcData ? convertirMonto(cli, l.monedaBase, "USD", l.fechaTC, tcData) : null;   // fallback en vivo
  return Number(c)||0;
};
// ¿Se pudo convertir la comisión cliente a USD (factor real de la liquidación o TC en vivo)?
export const comClienteConvertible = (l, tcData)=>{
  if((Number(l.montoComisionCliente)||0)===0) return true;
  if(l.monedaBase==="USD") return true;
  const v=Number(l.ventaTotal)||0, vUSD=Number(l.ventaTotalUSD)||0; if(v>0&&vUSD>0) return true;
  const f=Number(l.montoComisionFrisku)||0, fUSD=Number(l.montoComisionFriskuUSD)||0; if(f>0&&fUSD>0) return true;
  if(tcData && buscarTC(l.monedaBase,"USD",l.fechaTC,tcData)!=null) return true;
  return false;
};

// Peso neto por caja de un formato (maestro tiposEmbalaje). 0 = sin dato.
function _kgCaja(fmt, tiposEmbalaje){
  const t=(tiposEmbalaje||[]).find(x=>x.codigo===fmt||x.descripcion===fmt);
  if(t&&Number(t.pesoNeto)>0) return Number(t.pesoNeto);
  const m=String(`${t?.descripcion||""} ${fmt||""}`).match(/(\d+(?:[.,]\d+)?)\s*kg/i);
  return m?parseFloat(m[1].replace(",",".")):0;
}

// Semana ISO (para dimensión de calendario ETD). Devuelve {anio, semana}.
function isoWeek(fechaISO){
  if(!fechaISO) return { anio:"—", semana:"—" };
  const d = new Date(fechaISO+"T00:00:00");
  if(isNaN(d)) return { anio:"—", semana:"—" };
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yStart = new Date(Date.UTC(t.getUTCFullYear(),0,1));
  const wk = Math.ceil((((t - yStart)/86400000)+1)/7);
  return { anio:String(t.getUTCFullYear()), semana:`S${String(wk).padStart(2,"0")}` };
}

// ── MODELO ANALÍTICO: construye la tabla de hechos a nivel contenedor ──
// Una fila = una OE, con dimensiones resueltas y las medidas ya sumadas desde
// sus liquidaciones. Se calcula UNA vez (memoizado en el provider).
export function buildFriskuFacts({ embarques, liquidaciones, clientes, exportadoras, especies, mercados, tiposEmbalaje, tcData }){
  const cliOf = (id)=>(clientes||[]).find(c=>c.id===id);
  const expOf = (id)=>(exportadoras||[]).find(e=>e.id===id);
  const espOf = (c)=>(especies||[]).find(e=>e.codigo===c);
  const mercOf= (c)=>(mercados||[]).find(m=>m.codigo===c);
  const espLab= (c)=>{ const e=espOf(c); return e?`${e.icono||""} ${e.nombreEs}`.trim():(c||"— s/especie —"); };
  const viaKey= (v)=> (v||"maritimo")==="aereo"?"aereo":"maritimo";
  const viaLab= (v)=> viaKey(v)==="aereo"?"✈ Aéreo":"🚢 Marítimo";
  const kgCaja= (fmt)=>_kgCaja(fmt, tiposEmbalaje);

  // Dinero por OE = suma de sus liquidaciones (una OE puede tener varias).
  const dinero = {};
  (liquidaciones||[]).forEach(l=>{ if(!l.oeId) return; const a=dinero[l.oeId]||(dinero[l.oeId]={venta:0,fob:0,comF:0,comC:0,nLiq:0}); a.venta+=mVentaUSD(l, tcData); a.fob+=mFobUSD(l, tcData); a.comF+=mComFriskuUSD(l, tcData); a.comC+=mComClienteUSD(l, tcData); a.nLiq++; });

  return (embarques||[]).map(o=>{
    const cli=cliOf(o.clienteId); const est=o.estado||"borrador";
    const cajas=Object.entries(o.cajasPorFormato||{}).reduce((s,[,v])=>s+Number(v||0),0);
    const kilos=Object.entries(o.cajasPorFormato||{}).reduce((s,[fmt,v])=>s+Number(v||0)*kgCaja(fmt),0);
    const kgFalta=Object.entries(o.cajasPorFormato||{}).some(([fmt,v])=>Number(v||0)>0 && kgCaja(fmt)===0); // algún formato sin peso neto
    const d=dinero[o.id]||{venta:0,fob:0,comF:0,comC:0,nLiq:0};
    const {anio,semana}=isoWeek(o.fechaDespacho);
    return {
      _id:o.id, _oe:o, _cancel: est==="cancelado", _nLiq:d.nLiq,
      // dimensiones
      temporada:o.temporada||"—",           temporadaLab:o.temporada||"— s/temp —",
      anioETD:anio,                          anioETDLab:anio,
      semanaETD:semana,                      semanaETDLab:semana,
      especie:o.especieCodigo||"—",          especieLab:espLab(o.especieCodigo),
      exportadora:o.exportadoraId||"—",      exportadoraLab:expOf(o.exportadoraId)?.nombre||"— s/exp —",
      cliente:o.clienteId||"—",              clienteLab:cli?.nombre||"— s/cliente —",
      mercado:cli?.mercadoCodigo||"—",       mercadoLab:mercOf(cli?.mercadoCodigo)?.nombre||(cli?.mercadoCodigo||"— s/mercado —"),
      paisDestino:cli?.paisCodigo||cli?.pais||"—", paisDestinoLab:cli?.pais||cli?.paisCodigo||"— s/país —",
      puertoOrigen:o.origen||"—",            puertoOrigenLab:o.origen||"— s/origen —",
      puertoDestino:o.destino||"—",          puertoDestinoLab:o.destino||"— s/destino —",
      via:viaKey(o.tipoEmbarque),            viaLab:viaLab(o.tipoEmbarque),
      shippingLine:o.navieraAerolinea||"—",  shippingLineLab:o.navieraAerolinea||"— s/naviera —",
      estado:est,                            estadoLab:est,
      contenedor:o.numeroContenedor||o.numero||o.id, contenedorLab:o.numeroContenedor||o.numero||"(s/n)",
      // medidas base (a nivel contenedor)
      _cajas:cajas, _kilos:kilos, _kgFalta:kgFalta, _venta:d.venta, _fob:d.fob, _comF:d.comF, _comC:d.comC,
    };
  });
}

// Calidad de datos que afecta a las métricas (para alertas visibles, no silenciar).
export function dataQualityFrisku({ embarques, liquidaciones, tiposEmbalaje }){
  const sinPeso = {};
  (embarques||[]).forEach(o=>{ Object.entries(o.cajasPorFormato||{}).forEach(([fmt,v])=>{ if(Number(v||0)>0 && _kgCaja(fmt,tiposEmbalaje)===0) sinPeso[fmt]=(sinPeso[fmt]||0)+1; }); });
  const liqClienteSinConv = (liquidaciones||[]).filter(l=>!comClienteConvertible(l)).length;
  return { formatosSinPeso:Object.keys(sinPeso), liqClienteSinConv };
}

// ── MÉTRICAS: registro único. calc(rows) → número. ──
const sum=(rs,f)=>rs.reduce((s,r)=>s+(Number(r[f])||0),0);
const distinct=(rs,f)=>new Set(rs.map(r=>r[f]).filter(v=>v&&v!=="—")).size;
const pct=(v)=>`${(Number(v)||0).toFixed(1)}%`;
export const FRISKU_METRICS = [
  { key:"containers",          label:"N° contenedores",       fmt:"int",   calc:rs=>rs.filter(r=>!r._cancel).length },   // OE no canceladas (1 OE = 1 contenedor)  VERIFICADO-FRISKU
  { key:"fcl",                 label:"FCL (marítimo)",        fmt:"int",   calc:rs=>rs.filter(r=>!r._cancel && r.via==="maritimo").length }, // 1 OE marítima no cancelada = 1 FCL
  { key:"boxes",               label:"Cajas",                 fmt:"int",   calc:rs=>sum(rs,"_cajas") },
  { key:"kilograms",           label:"Kilos",                 fmt:"int",   calc:rs=>sum(rs,"_kilos") },                  // Σ cajas × peso neto/caja del formato (maestro)  VERIFICADO-FRISKU
  { key:"destinationSalesUSD", label:"Venta destino (USD)",   fmt:"usd",   calc:rs=>sum(rs,"_venta") },
  { key:"clientCommissionUSD", label:"Comisión cliente (USD)",fmt:"usd",   calc:rs=>sum(rs,"_comC") },                   // comisión que el cliente cobra a la exportadora
  { key:"friskuCommissionUSD", label:"Comisión Frisku (USD)", fmt:"usd",   calc:rs=>sum(rs,"_comF") },                   // participación de Frisku sobre la comisión cliente
  { key:"avgCommissionPct",    label:"% comisión Frisku",     fmt:"pct",   calc:rs=>{ const v=sum(rs,"_venta"); return v>0?sum(rs,"_comF")/v*100:0; } }, // comisión Frisku / venta destino
  { key:"activeClients",       label:"Clientes activos",      fmt:"int",   calc:rs=>distinct(rs.filter(r=>!r._cancel),"cliente") },
  { key:"activeExporters",     label:"Exportadores activos",  fmt:"int",   calc:rs=>distinct(rs.filter(r=>!r._cancel),"exportadora") },
];
export const FRISKU_METRIC = Object.fromEntries(FRISKU_METRICS.map(m=>[m.key,m]));
export const fmtMetric = (fmt, v)=>{
  const n=Number(v)||0;
  if(fmt==="usd") return "$"+new Intl.NumberFormat("es-CL",{maximumFractionDigits:0}).format(n);
  if(fmt==="pct") return pct(n);
  return new Intl.NumberFormat("es-CL",{maximumFractionDigits:0}).format(n);
};

// ── MOTOR DE FILTROS / SELECCIONES (asociativo) ──
// Una fila cumple si respeta la selección de todas las dims (excepto la indicada,
// para calcular los valores "posibles" de esa dim → estado asociativo Qlik).
export function matchFacts(row, sel, exceptKey){
  // Tolerante: una dimensión seleccionada en OTRA superficie BI (que no existe en
  // estas filas) NO filtra aquí — solo se aplican las dims presentes en la fila.
  // Así un solo estado de selección sirve a hojas con hechos de distinta forma.
  for(const k in sel){ if(k===exceptKey) continue; const s=sel[k]; if(!s||!s.size) continue; if(!(k in row)) continue; if(!s.has(row[k])) return false; }
  return true;
}
// Estados asociativos de una dimensión (semántica Qlik), con su medida/frecuencia:
//  - SELECTED    : valor seleccionado en este campo.
//  - POSSIBLE    : compatible con las OTRAS dims y el campo NO tiene selección.
//  - ALTERNATIVE : compatible con las otras dims pero el campo SÍ tiene selección
//                  (sería seleccionable; en Qlik es gris claro).
//  - EXCLUDED    : incompatible por la selección de OTRO campo (gris oscuro).
export function associativeValues(facts, sel, dimKey, metric){
  const rowsX = facts.filter(r=>matchFacts(r, sel, dimKey)); // compatibles ignorando la selección propia
  const grp={};
  rowsX.forEach(r=>{ const v=r[dimKey]; if(v==null||v==="") return; (grp[v]=grp[v]||{value:v,label:r[dimKey+"Lab"]??v,rows:[]}).rows.push(r); });
  const selSet = sel[dimKey] || new Set();
  selSet.forEach(v=>{ if(!grp[v]) grp[v]={value:v,label:v,rows:[]}; });
  const compatible = new Set(Object.keys(grp));
  const allMap={}; facts.forEach(r=>{ const v=r[dimKey]; if(v!=null&&v!==""&&!(v in allMap)) allMap[v]=r[dimKey+"Lab"]??v; });
  const mOf=(v)=> metric ? metric.calc((grp[v]&&grp[v].rows)||[]) : ((grp[v]&&grp[v].rows)||[]).length;
  const hasSel = selSet.size>0;
  const selected=[], possible=[], alternative=[], excluded=[];
  Object.keys(allMap).forEach(v=>{
    const label = grp[v] ? grp[v].label : allMap[v];
    if(selSet.has(v)) selected.push({value:v,label,m:mOf(v)});
    else if(compatible.has(v)) (hasSel?alternative:possible).push({value:v,label,m:mOf(v)});
    else excluded.push({value:v,label});
  });
  const byM=(a,b)=>b.m-a.m || String(a.label).localeCompare(String(b.label));
  selected.sort(byM); possible.sort(byM); alternative.sort(byM);
  excluded.sort((a,b)=>String(a.label).localeCompare(String(b.label)));
  // `possibleAll` = seleccionados + posibles + alternativos (compat. hacia atrás).
  return { selected, possible, alternative, excluded, possibleAll:[...selected,...possible,...alternative] };
}

// ── SET-ANALYSIS HELPERS (equivalentes, sin sintaxis Qlik) ──
// Universo de hechos IGNORANDO la selección de UN campo (Qlik: {<campo=>}).
export function factsIgnoring(facts, sel, dimKey){ return facts.filter(r=>matchFacts(r, sel, dimKey)); }
// Métrica sobre el universo seleccionado ignorando la selección de un campo.
export function metricOverIgnoring(facts, sel, dimKey, metric){ return metric.calc(factsIgnoring(facts, sel, dimKey)); }
// Participación de un subconjunto sobre un denominador, con la MISMA métrica.
export function participacion(subRows, denomRows, metric){ const d=metric.calc(denomRows); return d ? metric.calc(subRows)/d : 0; }
// Invertir selección de un campo: sus valores seleccionables (posibles/alternativos/
// seleccionados) que NO estén seleccionados pasan a estar seleccionados.
export function invertSelection(selectedSet, selectableValues){ const s=selectedSet||new Set(); return selectableValues.filter(v=>!s.has(v)); }

// ── CONTEXTO REACT: estado de selección compartido por todas las hojas ──
const FriskuBIContext = createContext(null);

// ── Reductores PUROS de navegación + lock (P2.2) ──────────────────────────
// Cada entrada del historial es { sel:{dimKey:Set}, locked:Set(dimKey) }.
// El lock marca un CAMPO cuyo valor no se limpia con "Limpiar todo".
export const NAV_HIST_MAX = 60;   // historial de selecciones (back/forward), acotado
export function navPush(nav, entry){
  let base = nav.stack.slice(0, nav.idx+1); base.push(entry);
  if(base.length > NAV_HIST_MAX) base = base.slice(base.length - NAV_HIST_MAX);
  return { stack: base, idx: base.length-1 };
}
export function navSetSel(entry, nextSel){ return { sel: nextSel, locked: entry.locked }; }         // preserva locks
export function navClearAll(entry){ const nsel={}; entry.locked.forEach(d=>{ if(entry.sel[d]) nsel[d]=entry.sel[d]; }); return { sel:nsel, locked:entry.locked }; }
export function navClearDim(entry, dim){ if(entry.locked.has(dim)) return entry; const n={...entry.sel}; delete n[dim]; return { sel:n, locked:entry.locked }; }
export function navToggleLock(entry, dim){ const s=new Set(entry.locked); s.has(dim)?s.delete(dim):s.add(dim); return { sel:entry.sel, locked:s }; }
export function navApplySel(entry, selObj, lockedArr){
  const nsel={}; Object.keys(selObj||{}).forEach(k=>{ const s=new Set(selObj[k]||[]); if(s.size) nsel[k]=s; });
  const nlock = (lockedArr===undefined||lockedArr===null) ? new Set(entry.locked) : new Set(lockedArr);
  return { sel:nsel, locked:nlock };
}

export function FriskuBIProvider({ data, children }){
  // Historial de selecciones: pila de estados + puntero (back/forward tipo Qlik).
  const [nav, setNav] = useState({ stack:[{ sel:{}, locked:new Set() }], idx:0 });
  const entry   = nav.stack[nav.idx];
  const sel     = entry.sel;
  const locked  = entry.locked;                 // Set(dimKey) — campos que "Limpiar todo" no borra
  const canUndo = nav.idx>0;
  const canRedo = nav.idx < nav.stack.length-1;

  const facts = useMemo(()=>buildFriskuFacts(data||{}), [
    data?.embarques, data?.liquidaciones, data?.clientes, data?.exportadoras, data?.especies, data?.mercados, data?.tiposEmbalaje, data?.tcData
  ]);
  const dataQuality = useMemo(()=>dataQualityFrisku(data||{}), [data?.embarques, data?.liquidaciones, data?.tiposEmbalaje]);

  // commit(fn): fn(selActual)→selNuevo; empuja {sel,locked} al historial (preserva locks).
  const commit = useCallback((fn)=>setNav(nav=>navPush(nav, navSetSel(nav.stack[nav.idx], fn(nav.stack[nav.idx].sel)))),[]);
  const toggle  = useCallback((dim,val)=>commit(cur=>{ const s=new Set(cur[dim]||[]); s.has(val)?s.delete(val):s.add(val); const n={...cur}; s.size?n[dim]=s:delete n[dim]; return n; }),[commit]);
  const setOne  = useCallback((dim,val)=>commit(cur=>{ const n={...cur}; if(val==null||val==="") delete n[dim]; else n[dim]=new Set([val]); return n; }),[commit]);
  const setMany = useCallback((dim,vals)=>commit(cur=>{ const n={...cur}; const s=new Set(vals||[]); s.size?n[dim]=s:delete n[dim]; return n; }),[commit]);
  const remove  = useCallback((dim,val)=>commit(cur=>{ const s=new Set(cur[dim]||[]); s.delete(val); const n={...cur}; s.size?n[dim]=s:delete n[dim]; return n; }),[commit]);
  // clearDim respeta lock (no-op si el campo está bloqueado); clearAll conserva los campos bloqueados.
  const clearDim= useCallback((dim)=>setNav(nav=>{ const e=navClearDim(nav.stack[nav.idx], dim); return e===nav.stack[nav.idx]?nav:navPush(nav,e); }),[]);
  const clearAll= useCallback(()=>setNav(nav=>navPush(nav, navClearAll(nav.stack[nav.idx]))),[]);
  const toggleLock = useCallback((dim)=>setNav(nav=>navPush(nav, navToggleLock(nav.stack[nav.idx], dim))),[]);
  const undo    = useCallback(()=>setNav(s=>({...s, idx:Math.max(0,s.idx-1)})),[]);
  const redo    = useCallback(()=>setNav(s=>({...s, idx:Math.min(s.stack.length-1,s.idx+1)})),[]);
  // Aplica selección (y opcionalmente locks) de golpe — bookmarks/vistas guardadas.
  const applySel= useCallback((selObj, lockedArr)=>setNav(nav=>navPush(nav, navApplySel(nav.stack[nav.idx], selObj, lockedArr))),[]);

  const filtered = useMemo(()=>facts.filter(r=>matchFacts(r, sel, null)), [facts, sel]);
  const associative = useCallback((dimKey, metric)=>associativeValues(facts, sel, dimKey, metric), [facts, sel]);
  const ignoring = useCallback((dimKey)=>facts.filter(r=>matchFacts(r, sel, dimKey)), [facts, sel]); // universo ignorando ese campo
  const chips = useMemo(()=> FRISKU_DIMS.flatMap(d=> (sel[d.key]?[...sel[d.key]]:[]).map(v=>{
    const h=facts.find(r=>r[d.key]===v); return { dim:d.key, dimLab:d.lab, value:v, label:h?h[d.key+"Lab"]:v };
  })), [sel, facts]);

  const value = { facts, filtered, dims:FRISKU_DIMS, metrics:FRISKU_METRICS, metric:FRISKU_METRIC, fmtMetric,
                  sel, toggle, setOne, setMany, remove, clearDim, clearAll, associative, ignoring, chips, dataQuality,
                  undo, redo, canUndo, canRedo, applySel, locked, toggleLock };
  return <FriskuBIContext.Provider value={value}>{children}</FriskuBIContext.Provider>;
}
export function useFriskuBI(){
  const ctx = useContext(FriskuBIContext);
  if(!ctx) throw new Error("useFriskuBI debe usarse dentro de <FriskuBIProvider>");
  return ctx;
}
