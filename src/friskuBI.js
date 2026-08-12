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
];
// NOTA: "variedad" NO es dimensión a nivel contenedor (vive en las líneas del
// Packing List, un contenedor puede tener varias). Queda como brecha (FALTA)
// hasta explotar el PL. No inventar.

// ── Primitivas de medida por liquidación (definición única en USD) ──
export const mComFriskuUSD = (l)=> Number(l.monedaBase==="USD" ? l.montoComisionFrisku : l.montoComisionFriskuUSD) || 0;   // VERIFICADO-FRISKU
export const mVentaUSD     = (l)=> Number(l.ventaTotalUSD ?? (l.monedaBase==="USD" ? l.ventaTotal : 0)) || 0;              // VERIFICADO-FRISKU
export const mFobUSD       = (l)=> Number(l.fobUSD ?? (l.monedaBase==="USD" ? l.fob : 0)) || 0;                             // VERIFICADO-FRISKU
// Comisión CLIENTE en USD. La liquidación no guarda su USD precomputado, PERO sí
// guarda la venta convertida (ventaTotalUSD). Ese par venta/ventaTotalUSD es el
// FACTOR FX REAL que la liquidación usó al convertir a USD. La comisión cliente
// está en la misma moneda base, así que se convierte con ese mismo factor → es
// trazable, no un supuesto. Fallback: factor de la comisión Frisku. Si no hay
// ningún factor (raro), devuelve 0 y la liquidación se marca en calidad de datos.
export const mComClienteUSD = (l)=>{
  const cli = Number(l.montoComisionCliente)||0;
  if(!cli) return 0;
  if(l.monedaBase==="USD") return cli;
  const v=Number(l.ventaTotal)||0, vUSD=Number(l.ventaTotalUSD)||0;
  if(v>0 && vUSD>0) return cli*(vUSD/v);
  const f=Number(l.montoComisionFrisku)||0, fUSD=Number(l.montoComisionFriskuUSD)||0;
  if(f>0 && fUSD>0) return cli*(fUSD/f);
  return 0;
};
// ¿Se pudo convertir la comisión cliente a USD con un factor REAL de la liquidación?
export const comClienteConvertible = (l)=>{
  if((Number(l.montoComisionCliente)||0)===0) return true;
  if(l.monedaBase==="USD") return true;
  const v=Number(l.ventaTotal)||0, vUSD=Number(l.ventaTotalUSD)||0; if(v>0&&vUSD>0) return true;
  const f=Number(l.montoComisionFrisku)||0, fUSD=Number(l.montoComisionFriskuUSD)||0; if(f>0&&fUSD>0) return true;
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
export function buildFriskuFacts({ embarques, liquidaciones, clientes, exportadoras, especies, mercados, tiposEmbalaje }){
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
  (liquidaciones||[]).forEach(l=>{ if(!l.oeId) return; const a=dinero[l.oeId]||(dinero[l.oeId]={venta:0,fob:0,comF:0,comC:0,nLiq:0}); a.venta+=mVentaUSD(l); a.fob+=mFobUSD(l); a.comF+=mComFriskuUSD(l); a.comC+=mComClienteUSD(l); a.nLiq++; });

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
// Valores posibles de una dimensión dada la selección actual (asociativo), con su
// medida agregada opcional, y los excluidos.
export function associativeValues(facts, sel, dimKey, metric){
  const rowsX = facts.filter(r=>matchFacts(r, sel, dimKey));
  const grp={};
  rowsX.forEach(r=>{ const v=r[dimKey]; if(v==null||v==="") return; (grp[v]=grp[v]||{value:v,label:r[dimKey+"Lab"]??v,rows:[]}).rows.push(r); });
  const selSet=sel[dimKey];
  if(selSet) selSet.forEach(v=>{ if(!grp[v]) grp[v]={value:v,label:v,rows:[]}; });
  const possible=Object.values(grp).map(g=>({value:g.value,label:g.label,m:metric?metric.calc(g.rows):g.rows.length}));
  possible.sort((a,b)=>b.m-a.m || String(a.label).localeCompare(String(b.label)));
  const posSet=new Set(possible.map(x=>x.value));
  const allMap={}; facts.forEach(r=>{ const v=r[dimKey]; if(v!=null&&v!==""&&!(v in allMap)) allMap[v]=r[dimKey+"Lab"]??v; });
  const excluded=Object.keys(allMap).filter(v=>!posSet.has(v)).map(v=>({value:v,label:allMap[v]}));
  return { possible, excluded };
}

// ── CONTEXTO REACT: estado de selección compartido por todas las hojas ──
const FriskuBIContext = createContext(null);
export function FriskuBIProvider({ data, children }){
  const [sel, setSel] = useState({});   // { dimKey: Set(valores) }

  const facts = useMemo(()=>buildFriskuFacts(data||{}), [
    data?.embarques, data?.liquidaciones, data?.clientes, data?.exportadoras, data?.especies, data?.mercados, data?.tiposEmbalaje
  ]);
  const dataQuality = useMemo(()=>dataQualityFrisku(data||{}), [data?.embarques, data?.liquidaciones, data?.tiposEmbalaje]);

  const toggle = useCallback((dim,val)=>setSel(p=>{ const s=new Set(p[dim]||[]); s.has(val)?s.delete(val):s.add(val); const n={...p}; s.size?n[dim]=s:delete n[dim]; return n; }),[]);
  const setOne = useCallback((dim,val)=>setSel(p=>{ const n={...p}; if(val==null||val==="") delete n[dim]; else n[dim]=new Set([val]); return n; }),[]);
  const remove = useCallback((dim,val)=>setSel(p=>{ const s=new Set(p[dim]||[]); s.delete(val); const n={...p}; s.size?n[dim]=s:delete n[dim]; return n; }),[]);
  const clearDim = useCallback((dim)=>setSel(p=>{ const n={...p}; delete n[dim]; return n; }),[]);
  const clearAll = useCallback(()=>setSel({}),[]);

  const filtered = useMemo(()=>facts.filter(r=>matchFacts(r, sel, null)), [facts, sel]);
  const associative = useCallback((dimKey, metric)=>associativeValues(facts, sel, dimKey, metric), [facts, sel]);
  const chips = useMemo(()=> FRISKU_DIMS.flatMap(d=> (sel[d.key]?[...sel[d.key]]:[]).map(v=>{
    const h=facts.find(r=>r[d.key]===v); return { dim:d.key, dimLab:d.lab, value:v, label:h?h[d.key+"Lab"]:v };
  })), [sel, facts]);

  const value = { facts, filtered, dims:FRISKU_DIMS, metrics:FRISKU_METRICS, metric:FRISKU_METRIC, fmtMetric,
                  sel, toggle, setOne, remove, clearDim, clearAll, associative, chips, dataQuality };
  return <FriskuBIContext.Provider value={value}>{children}</FriskuBIContext.Provider>;
}
export function useFriskuBI(){
  const ctx = useContext(FriskuBIContext);
  if(!ctx) throw new Error("useFriskuBI debe usarse dentro de <FriskuBIProvider>");
  return ctx;
}
