/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// FriskuComercialModule.jsx — Módulo comercial Frisku Foods (Fase 2)
// Tabs: Dashboard · Clientes · Exportadoras · Contratos · Programa
//       · Embarques · Liquidaciones · Maestros (embed) · TC
// Persistencia: tabla calendario_data ids: frisku_clientes,
//   frisku_exportadoras, frisku_contratos, frisku_programa,
//   frisku_embarques, frisku_liquidaciones
// ═══════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import FriskuModule, {
  PAISES_DEFAULT, MERCADOS_DEFAULT, MONEDAS_DEFAULT,
  ESPECIES_DEFAULT, TIPOS_EMBALAJE_DEFAULT, CIUDADES_DEFAULT,
  TEMPORADAS_DEFAULT,
  PUERTOS_DEFAULT, AEROPUERTOS_DEFAULT,
  SHIPPING_LINES_DEFAULT, LINEAS_AEREAS_DEFAULT,
} from "./FriskuModule.jsx";
import {
  dbLoadGeneric, dbSaveGeneric,
  calcularComisionFrisku, resolverPorcentajesComision,
  formatearMonto, buscarTC, convertirMonto,
  uploadArchivoFrisku, pathDesdeUrlStorage,
} from "./friskuHelpers.js";
import { FriskuBIProvider, useFriskuBI, FRISKU_DIMS, FRISKU_METRICS, fmtMetric,
         mComFriskuUSD, mVentaUSD, mFobUSD, mComClienteUSD, groupByDims, invertSelection } from "./friskuBI.js";
import { normalizarNombre, buscarDuplicado } from "./nombreCanonico.js";
import { configureFriskuPdf } from "./pdfText.js";
import { buildBookmark, validateBookmark, deserializeSel, listBookmarks, saveBookmark, renameBookmark, removeBookmark, sanitizeDrillPath } from "./friskuBookmarks.js";
import { compararEstados } from "./friskuCompare.js";
import { theme } from "./theme";

// ── Paleta Frisku ──
// Re-exporta los tokens del tema central + alias para preservar los
// nombres usados en este módulo. Cualquier cambio de paleta se hace
// en src/theme.js.
const C = {
  ...theme,
  card2:  theme.cardAlt,
  blue:   theme.primary,
  green:  theme.success,
  yellow: theme.warning,
  accent: theme.danger,
  teal:   theme.accent2,
};

const inputSt = {
  width:"100%", padding:"6px 10px", borderRadius:6, border:`1px solid ${C.border}`,
  background:C.card2, color:C.text, fontSize:12, boxSizing:"border-box", outline:"none"
};
const lblSt = { fontSize:10, color:C.muted, fontWeight:600, marginBottom:3, textTransform:"uppercase", letterSpacing:0.4 };
const btnSt = (color=C.blue, ghost=false) => ({
  padding:"6px 12px", borderRadius:6, border:ghost?`1px solid ${color}`:"none",
  background:ghost?"transparent":color, color:ghost?color:"#fff",
  fontWeight:600, fontSize:11, cursor:"pointer"
});

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

// Especies seleccionables para closures/OE: se derivan de los FORMATOS que
// existen (no del maestro de especies), para que sea imposible elegir una
// especie sin formatos (bloqueo "sin formatos") y para que un formato huérfano
// —cuya especie no esté en el maestro— siga siendo utilizable (fallback al
// código). Si `incluir` (código actual en edición) no está, se agrega igual.
function especiesConFormatos(especies, tiposEmbalaje, incluir) {
  const cods = new Set();
  (tiposEmbalaje||[]).forEach(t=>{ if(t.especieCodigo) cods.add(t.especieCodigo); });
  if(incluir) cods.add(incluir);
  return Array.from(cods).map(cod=>{
    const e = (especies||[]).find(x=>x.codigo===cod);
    return e || { codigo:cod, nombreEs:cod, icono:"⚠" };
  }).sort((a,b)=>(a.nombreEs||"").localeCompare(b.nombreEs||""));
}

// Select buscable genérico (dropdown propio, NO <datalist> nativo). options:
// [{value,label}]. value "" = sin selección. Al enfocar abre y muestra TODAS
// las opciones; escribir filtra; se puede reemplazar la selección sin limpiar
// primero (el <datalist> nativo filtraba la lista al texto ya elegido y no
// dejaba ver el resto). "— Todos —" o la × limpian.
function SelectBuscable({ value, onChange, options, placeholder, listId, style }) {
  const [open, setOpen] = useState(false);
  const [txt, setTxt]   = useState("");
  const boxRef = useRef(null);
  const labelDe = (v)=> (options.find(o=>String(o.value)===String(v))?.label) || "";
  useEffect(()=>{
    if(!open) return;
    const h=(e)=>{ if(boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown",h);
    return ()=>document.removeEventListener("mousedown",h);
  },[open]);
  const q = txt.trim().toLowerCase();
  const filtered = q ? options.filter(o=>String(o.label).toLowerCase().includes(q)) : options;
  const display = open ? txt : labelDe(value);
  const pick = (v)=>{ onChange(v); setOpen(false); setTxt(""); };
  // El contenedor hereda el tamaño (flex/anchos) del style; el input toma el resto.
  const wrap = { position:"relative" };
  if(style){ ["flex","minWidth","maxWidth","width"].forEach(k=>{ if(style[k]!=null) wrap[k]=style[k]; }); }
  if(wrap.flex==null && wrap.width==null && wrap.maxWidth==null) wrap.minWidth = wrap.minWidth||150;
  const inputSt2 = { ...(style||{}), width:"100%", flex:undefined, minWidth:undefined, maxWidth:undefined, margin:undefined, paddingRight:22 };
  return (
    <div ref={boxRef} style={wrap}>
      <input value={display} placeholder={placeholder}
        onFocus={()=>{ setOpen(true); setTxt(""); }}
        onChange={e=>{ setTxt(e.target.value); if(!open) setOpen(true); }}
        style={inputSt2}/>
      {value && !open && (
        <span onMouseDown={e=>{ e.preventDefault(); onChange(""); }} title="Quitar"
          style={{position:"absolute", right:7, top:"50%", transform:"translateY(-50%)", cursor:"pointer", color:"#94a3b8", fontSize:13, fontWeight:700}}>×</span>
      )}
      {open && (
        <div style={{position:"absolute", zIndex:40, top:"calc(100% + 2px)", left:0, right:0, background:C.card, border:`1px solid ${C.border}`, borderRadius:8, maxHeight:240, overflowY:"auto", boxShadow:C.shadowSm||"0 8px 24px rgba(0,0,0,.18)"}}>
          <div onMouseDown={e=>{ e.preventDefault(); pick(""); }}
            style={{padding:"7px 10px", fontSize:12, cursor:"pointer", color:C.muted, borderBottom:`1px solid ${C.border}`}}>— Todos —</div>
          {filtered.map(o=>(
            <div key={o.value} onMouseDown={e=>{ e.preventDefault(); pick(o.value); }}
              style={{padding:"7px 10px", fontSize:12, cursor:"pointer", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
                      background:String(o.value)===String(value)?`${C.blue}18`:"transparent", fontWeight:String(o.value)===String(value)?700:400}}>{o.label}</div>
          ))}
          {filtered.length===0 && <div style={{padding:"7px 10px", fontSize:11, color:C.muted2}}>Sin coincidencias</div>}
        </div>
      )}
    </div>
  );
}

// Combo de N° de semana: muestra "S32" por defecto, tiene dropdown (datalist)
// para elegir, y permite digitar/sobrescribir el número (acepta "32" o "S32").
// Al enfocar selecciona todo (reemplazo rápido) y NO reformatea mientras se
// escribe (evita que el campo salte a "S03" en cada tecla). value = número|undefined.
function WeekNumPicker({ value, onChange, listId, style }) {
  const fmt = (n)=> n ? `S${String(n).padStart(2,"0")}` : "";
  const parse = (s)=>{ const d=String(s).replace(/[^\d]/g,""); if(!d) return undefined; let n=Math.round(Number(d)); if(n<1)n=1; if(n>53)n=53; return n; };
  const [txt, setTxt] = useState(()=>fmt(value));
  const foco = useRef(false);
  useEffect(()=>{ if(!foco.current) setTxt(fmt(value)); },[value]);
  return (
    <input list={listId} value={txt} placeholder="S—" inputMode="numeric"
      onFocus={e=>{ foco.current=true; e.target.select(); }}
      onChange={e=>{ setTxt(e.target.value); onChange(parse(e.target.value)); }}
      onBlur={e=>{ foco.current=false; const n=parse(e.target.value); onChange(n); setTxt(fmt(n)); }}
      style={style}/>
  );
}

// Selector escribible de exportadora (typeahead con datalist). value/onChange
// operan sobre el id; el input muestra el nombre y permite buscar tecleando.
function ExportadoraPicker({ value, exportadoras, onChange, style }) {
  const activas = useMemo(()=>(exportadoras||[]).filter(e=>e.activo!==false)
    .slice().sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||"")),[exportadoras]);
  const nombreDe = (id)=> (exportadoras||[]).find(e=>e.id===id)?.nombre || "";
  const [txt, setTxt] = useState(()=>nombreDe(value));
  const foco = useRef(false);
  useEffect(()=>{ if(!foco.current) setTxt(nombreDe(value)); },[value, exportadoras]);
  const exacto  = (v)=> activas.find(e=>(e.nombre||"").trim().toLowerCase()===String(v).trim().toLowerCase());
  const parcial = (v)=>{ const s=String(v).trim().toLowerCase(); return s ? activas.find(e=>(e.nombre||"").toLowerCase().includes(s)) : null; };
  return (
    <>
      <input list="fr-exportadora-list" value={txt} placeholder="Escribe la exportadora…"
        onFocus={e=>{ foco.current=true; e.target.select(); }}
        onChange={e=>{ const raw=e.target.value; setTxt(raw); if(raw===""){ onChange(""); return; } const m=exacto(raw); if(m) onChange(m.id); }}
        onBlur={e=>{ foco.current=false; const raw=e.target.value; if(raw.trim()===""){ onChange(""); setTxt(""); return; } const m=exacto(raw)||parcial(raw); onChange(m?m.id:value); setTxt(m?m.nombre:nombreDe(value)); }}
        style={style}/>
      <datalist id="fr-exportadora-list">
        {activas.map(e=><option key={e.id} value={e.nombre}/>)}
      </datalist>
    </>
  );
}

// ── Loaders CDN ──────────────────────────────────────────────────
let _plJsPDFLoaded = false;
async function pl_loadJsPDF() {
  // Contrato PDF Frisku (H1): cada `new JsPDF(...)` sale ya configurado con
  // configureFriskuPdf → todo el texto/autoTable pasa por pdfText (emojis/Δ/→).
  // Punto único; los exportadores no cambian.
  const _friskuWrap = (Real)=> function(...args){ return configureFriskuPdf(new Real(...args)); };
  if(_plJsPDFLoaded && window.jspdf) return _friskuWrap(window.jspdf.jsPDF);
  await new Promise((res,rej)=>{
    const s1=document.createElement("script");
    s1.src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s1.onload=()=>{
      const s2=document.createElement("script");
      s2.src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js";
      s2.onload=()=>{ _plJsPDFLoaded=true; res(); };
      s2.onerror=rej; document.head.appendChild(s2);
    };
    s1.onerror=rej; document.head.appendChild(s1);
  });
  return _friskuWrap(window.jspdf.jsPDF);
}
async function pl_loadJSZip() {
  if(window.JSZip) return;
  await new Promise((res,rej)=>{ const s=document.createElement("script"); s.src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
}

// ── Logo Frisku para reportes (mismo patrón que RendicionesModule) ────
const FRISKU_LOGO = `${process.env.PUBLIC_URL||""}/frisku.png`;
async function fr_urlToDataURL(url){
  const r = await fetch(url); if(!r.ok) throw new Error("fetch "+r.status);
  const b = await r.blob();
  return await new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(b); });
}
function fr_imgSize(src){
  return new Promise((res)=>{ const im=new Image(); im.onload=()=>res({w:im.naturalWidth,h:im.naturalHeight}); im.onerror=()=>res(null); im.src=src; });
}
// Agrega el logo Frisku a un doc jsPDF (dentro de la banda navy). Devuelve el ancho usado en mm.
async function fr_logoPDF(doc, xRight, y, maxW, maxH){
  try{
    const dataUrl = await fr_urlToDataURL(FRISKU_LOGO);
    const sz = await fr_imgSize(dataUrl);
    let w=maxW, h=maxH;
    if(sz && sz.w>0 && sz.h>0){ const s=Math.min(maxW/sz.w, maxH/sz.h); w=sz.w*s; h=sz.h*s; }
    const fmt = /png/i.test(dataUrl.slice(0,20)) ? "PNG" : "PNG";
    doc.addImage(dataUrl, fmt, xRight-w, y, w, h, undefined, "FAST");
    return w;
  }catch(e){ return 0; }
}
// ExcelJS vía CDN (embebe imágenes; xlsx-js-style no puede)
let _fr_exceljsP = null;
function fr_loadExcelJS(){
  if(window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if(_fr_exceljsP) return _fr_exceljsP;
  _fr_exceljsP = new Promise((resolve,reject)=>{
    const s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js";
    s.onload=()=>resolve(window.ExcelJS); s.onerror=reject; document.body.appendChild(s);
  });
  return _fr_exceljsP;
}
// Inserta el logo Frisku flotando sobre el encabezado de una hoja ExcelJS.
async function fr_logoExcel(wb, ws){
  try{
    const dataUrl = await fr_urlToDataURL(FRISKU_LOGO);
    const base64 = dataUrl.split(",")[1];
    let ext = dataUrl.substring(dataUrl.indexOf("/")+1, dataUrl.indexOf(";")).toLowerCase();
    if(ext==="jpg") ext="jpeg";
    if(ext!=="png" && ext!=="jpeg") return;
    const imgId = wb.addImage({ base64, extension: ext });
    const sz = await fr_imgSize(dataUrl);
    let w=150,h=50; if(sz&&sz.w&&sz.h){ const s=Math.min(160/sz.w, 50/sz.h); w=Math.round(sz.w*s); h=Math.round(sz.h*s); }
    ws.addImage(imgId, { tl:{col:0.15,row:0.15}, ext:{width:w,height:h} });
  }catch(e){}
}
// Construye una hoja branded (banda navy + tabla). moneyCols/intCols: índices 0-based.
function fr_sheetTabla(ws, {titulo, subtitulo, headers, rows, totalRow=null, colWidths=null, moneyCols=[], intCols=[], headerHex="1E2761"}){
  const argb=(h)=>"FF"+h, ncol=headers.length;
  ws.views=[{showGridLines:false}];
  if(colWidths) ws.columns = colWidths.map(w=>({width:w}));
  ws.mergeCells(1,1,1,ncol); ws.getRow(1).height=44;
  const t=ws.getCell(1,1); t.value=titulo; t.font={name:"Calibri",bold:true,size:15,color:{argb:argb(headerHex)}}; t.alignment={vertical:"middle",horizontal:"right",indent:1};
  ws.mergeCells(2,1,2,ncol); const st=ws.getCell(2,1); st.value=subtitulo; st.font={name:"Calibri",size:10,color:{argb:"FF5A5A5A"}}; st.alignment={horizontal:"right",indent:1};
  const hr=4;
  headers.forEach((h,i)=>{ const c=ws.getCell(hr,i+1); c.value=h; c.font={bold:true,color:{argb:"FFFFFFFF"}}; c.fill={type:"pattern",pattern:"solid",fgColor:{argb:argb(headerHex)}}; c.alignment={horizontal:i===0?"left":"right",vertical:"middle"}; });
  ws.getRow(hr).height=18;
  const fmtDe = (ci)=> moneyCols.includes(ci) ? '$#,##0' : (intCols.includes(ci) ? '#,##0' : null);
  rows.forEach((r,ri)=>{ r.forEach((v,ci)=>{ const c=ws.getCell(hr+1+ri,ci+1); c.value=v; c.alignment={horizontal:ci===0?"left":"right"}; const nf=fmtDe(ci); if(nf) c.numFmt=nf; if(ri%2) c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFF6F8FB"}}; }); });
  if(totalRow){ const tr=hr+1+rows.length; totalRow.forEach((v,ci)=>{ const c=ws.getCell(tr,ci+1); c.value=v; c.font={bold:true}; c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFDCE3F0"}}; c.alignment={horizontal:ci===0?"left":"right"}; const nf=fmtDe(ci); if(nf) c.numFmt=nf; }); }
}
async function fr_descargarWB(wb, filename){
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url);
}

// ── Exportar Packing List → PDF ──────────────────────────────────
async function exportarPL_PDF(oe, pl, exportadora, cliente, especie, tiposEmbalaje) {
  const JsPDF = await pl_loadJsPDF();
  const doc = new JsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
  const W=210, m=14;

  // Header
  doc.setFillColor(30,37,51); doc.rect(0,0,W,28,"F");
  doc.setTextColor(255,255,255);
  doc.setFontSize(16); doc.setFont("helvetica","bold"); doc.text("PACKING LIST",m,11);
  doc.setFontSize(9); doc.setFont("helvetica","normal");
  doc.text(`Frisku Foods - ${especie?.nombreEs||""}`,m,18);
  if(oe.numero) doc.text(`OE: ${oe.numero}`,W-m,11,{align:"right"});
  doc.text(new Date().toLocaleDateString("es-CL"),W-m,18,{align:"right"});

  let y=36;
  doc.setTextColor(40,40,40);

  // Info OE
  doc.autoTable({
    startY:y,
    theme:"grid",
    headStyles:{fillColor:[45,58,82],textColor:255,fontStyle:"bold",fontSize:8},
    styles:{fontSize:8,cellPadding:3},
    head:[["Campo","Detalle","Campo","Detalle"]],
    body:[
      ["Exportadora",exportadora?.nombre||"—","Cliente",cliente?.nombre||"—"],
      ["Origen",oe.origen||"—","Destino",oe.destino||"—"],
      ["Naviera/Aerolínea",oe.navieraAerolinea||"—","N° Contenedor/Vuelo",oe.numeroContenedor||"—"],
      ["Tipo embarque",oe.tipoEmbarque==="maritimo"?"Marítimo":"Aéreo","Temporada",oe.temporada||"—"],
      ["Fecha despacho real",pl.fechaDespReal||"—","B/L o AWB",pl.blAwb||"—"],
      ["N° Sello",pl.sello||"—","Temperatura",pl.temperaturaC!=null&&pl.temperaturaC!==""?`${pl.temperaturaC}°C`:"—"],
    ],
    margin:{left:m,right:m},
  });
  y = doc.lastAutoTable.finalY + 8;

  if(oe.notify?.nombre) {
    doc.setFontSize(8); doc.setTextColor(100,100,100);
    doc.text(`Notify: ${oe.notify.nombre}${oe.notify.direccion?" · "+oe.notify.direccion:""}${oe.notify.contacto?" · "+oe.notify.contacto:""}`,m,y);
    y+=7;
  }

  // Pallets table
  const totalCajas   = (pl.pallets||[]).reduce((s,p)=>s+Number(p.cajas||0),0);
  const totalNetoKg  = (pl.pallets||[]).reduce((s,p)=>s+Number(p.pesoNetoKg||0),0);
  const totalBrutoKg = (pl.pallets||[]).reduce((s,p)=>s+Number(p.pesoBrutoKg||0),0);
  const body = (pl.pallets||[]).map((p,i)=>[
    i+1,
    nombreFormato(p.formato, tiposEmbalaje),
    p.variedad||"—",
    p.calibre||"—",
    p.palletNum||"—",
    Number(p.cajas||0).toLocaleString("es-CL"),
    Number(p.pesoNetoKg||0).toLocaleString("es-CL"),
    Number(p.pesoBrutoKg||0).toLocaleString("es-CL"),
  ]);
  body.push(["","TOTAL","","","",totalCajas.toLocaleString("es-CL"),totalNetoKg.toLocaleString("es-CL"),totalBrutoKg.toLocaleString("es-CL")]);

  doc.autoTable({
    startY:y,
    theme:"striped",
    headStyles:{fillColor:[20,184,166],textColor:255,fontStyle:"bold",fontSize:8},
    styles:{fontSize:8,cellPadding:3},
    footStyles:{fillColor:[240,240,240],fontStyle:"bold"},
    head:[["#","Formato","Variedad","Calibre","N° Pallet","Cajas","Peso Neto (kg)","Peso Bruto (kg)"]],
    body,
    columnStyles:{0:{halign:"center",cellWidth:8},3:{halign:"center",cellWidth:16},4:{halign:"center",cellWidth:16},5:{halign:"right",cellWidth:18},6:{halign:"right",cellWidth:24},7:{halign:"right",cellWidth:24}},
    margin:{left:m,right:m},
    didDrawRow:(data)=>{
      if(data.row.index===body.length-1){
        doc.setFont("helvetica","bold");
      }
    },
  });

  if(pl.observ) {
    const finalY = doc.lastAutoTable.finalY + 6;
    doc.setFontSize(8); doc.setTextColor(100,100,100);
    doc.text(`Observaciones: ${pl.observ}`,m,finalY);
  }

  const nombre = `PL_${oe.numero||oe.id}_${new Date().toISOString().slice(0,10)}.pdf`;
  doc.save(nombre);
}

// ── Exportar Packing List → Excel ────────────────────────────────
async function exportarPL_Excel(oe, pl, exportadora, cliente, especie, tiposEmbalaje) {
  await pl_loadJSZip();
  const pallets = pl.pallets||[];
  const totalCajas   = pallets.reduce((s,p)=>s+Number(p.cajas||0),0);
  const totalNetoKg  = pallets.reduce((s,p)=>s+Number(p.pesoNetoKg||0),0);
  const totalBrutoKg = pallets.reduce((s,p)=>s+Number(p.pesoBrutoKg||0),0);

  function esc(s){ return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  function cell(v,bold=false,bg=""){
    const s = bold?`<Font Bold="1"/>`:"";
    const fill = bg?`<Interior ss:Color="${bg}" ss:Pattern="Solid"/>`:"";
    return `<Cell><ss:Data ss:Type="String">${esc(v)}</ss:Data>${s||fill?`<ss:Style>${s}${fill}</ss:Style>`:""}</Cell>`;
  }
  function numCell(v,bold=false){
    const s=bold?`<ss:Style><Font Bold="1"/></ss:Style>`:"";
    return `<Cell${s?` ss:StyleID="bold"`:""}><ss:Data ss:Type="Number">${Number(v)||0}</ss:Data></Cell>`;
  }

  const infoRows = [
    ["Exportadora",exportadora?.nombre||"—","Cliente",cliente?.nombre||"—"],
    ["Especie",especie?`${especie.icono} ${especie.nombreEs}`:"—","Temporada",oe.temporada||"—"],
    ["Origen",oe.origen||"—","Destino",oe.destino||"—"],
    ["Naviera/Aerolinea",oe.navieraAerolinea||"—","N° Contenedor/Vuelo",oe.numeroContenedor||"—"],
    ["Fecha despacho real",pl.fechaDespReal||"—","B/L o AWB",pl.blAwb||"—"],
    ["N° Sello",pl.sello||"—","Temperatura",pl.temperaturaC!=null&&pl.temperaturaC!==""?`${pl.temperaturaC}°C`:"—"],
  ].map(r=>`<Row>${r.map(v=>cell(v)).join("")}</Row>`).join("");

  const palletRows = pallets.map((p,i)=>`<Row>
    <Cell><ss:Data ss:Type="Number">${i+1}</ss:Data></Cell>
    ${cell(nombreFormato(p.formato, tiposEmbalaje))}
    ${cell(p.variedad||"")}
    ${cell(p.calibre||"")}
    <Cell><ss:Data ss:Type="Number">${Number(p.palletNum)||0}</ss:Data></Cell>
    <Cell><ss:Data ss:Type="Number">${Number(p.cajas)||0}</ss:Data></Cell>
    <Cell><ss:Data ss:Type="Number">${Number(p.pesoNetoKg)||0}</ss:Data></Cell>
    <Cell><ss:Data ss:Type="Number">${Number(p.pesoBrutoKg)||0}</ss:Data></Cell>
  </Row>`).join("");

  const totalRow = `<Row>
    ${cell("")}${cell("TOTAL",true)}${cell("")}${cell("")}${cell("")}
    <Cell><ss:Data ss:Type="Number">${totalCajas}</ss:Data></Cell>
    <Cell><ss:Data ss:Type="Number">${totalNetoKg}</ss:Data></Cell>
    <Cell><ss:Data ss:Type="Number">${totalBrutoKg}</ss:Data></Cell>
  </Row>`;

  const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Packing List"><Table>
  <Row><Cell ss:MergeAcross="7"><ss:Data ss:Type="String">PACKING LIST — ${esc(oe.numero||oe.id)}</ss:Data></Cell></Row>
  <Row/>
  ${infoRows}
  <Row/>
  <Row>${["#","Formato","Variedad","Calibre","N° Pallet","Cajas","Peso Neto (kg)","Peso Bruto (kg)"].map(h=>cell(h,true)).join("")}</Row>
  ${palletRows}
  ${totalRow}
  ${pl.observ?`<Row/><Row>${cell("Observaciones:",true)}${cell(pl.observ)}</Row>`:""}
</Table></Worksheet></Workbook>`;

  const blob = new Blob([xml],{type:"application/vnd.ms-excel;charset=utf-8"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href=url; a.download=`PL_${oe.numero||oe.id}_${new Date().toISOString().slice(0,10)}.xlsx`; a.click();
  URL.revokeObjectURL(url);
}

// Peso neto por caja (kg) para un formato del PL. Busca en el maestro por
// código o descripción; si no lo encuentra o no tiene peso, intenta extraer
// los kg del texto del formato (ej. "AVO-10 KG", "Caja Palta 10kg" → 10).
function pesoNetoPorCaja(formatoVal, tiposEmbalaje) {
  const t = (tiposEmbalaje||[]).find(x=>x.codigo===formatoVal || x.descripcion===formatoVal);
  if(t && Number(t.pesoNeto)>0) return Number(t.pesoNeto);
  const fuente = `${t?.descripcion||""} ${formatoVal||""}`;
  const m = String(fuente).match(/(\d+(?:[.,]\d+)?)\s*kg/i);
  return m ? parseFloat(m[1].replace(",",".")) : 0;
}
// Peso bruto por caja si el formato lo define en el maestro (0 = sin dato).
function pesoBrutoPorCaja(formatoVal, tiposEmbalaje) {
  const t = (tiposEmbalaje||[]).find(x=>x.codigo===formatoVal || x.descripcion===formatoVal);
  return t && Number(t.pesoBruto)>0 ? Number(t.pesoBruto) : 0;
}
// Nombre legible de un formato. El maestro guarda `descripcion` (los items
// importados del Excel NO traen `nombre`), así que se prioriza la descripción
// para no mostrar códigos crípticos como "PA2" en vez de "PALTA GRANEL 10 Kg".
function nombreFormato(formatoVal, tiposEmbalaje) {
  const t = (tiposEmbalaje||[]).find(x=>x.codigo===formatoVal || x.descripcion===formatoVal);
  return t?.descripcion || t?.nombre || formatoVal || "—";
}

// ── PackingListPanel ─────────────────────────────────────────────
function PackingListPanel({ oe, tiposEmbalaje, especies, exportadoras, clientes, onGuardar, canEdit }) {
  const [pl, setPl] = useState(()=>JSON.parse(JSON.stringify(oe.packingList||{fechaDespReal:"",blAwb:"",sello:"",temperaturaC:"",pallets:[],observ:""})));
  const [dirty, setDirty] = useState(false);
  const [exporting, setExporting] = useState(false);

  const exportadora = exportadoras.find(e=>e.id===oe.exportadoraId);
  const cliente     = clientes.find(c=>c.id===oe.clienteId);
  const especie     = especies.find(e=>e.codigo===oe.especieCodigo);
  const formatosOE  = Object.entries(oe.cajasPorFormato||{}).filter(([,v])=>Number(v)>0).map(([cod])=>cod);
  const calibresEsp = calibresDeEspecie(especie);
  // Formatos disponibles en el PL: los de la OE + todos los de la especie en el maestro
  // (así se pueden despachar formatos —ej. cajas de 10 kg— que no se cargaron en la OE).
  const formatosEspecie = (tiposEmbalaje||[])
    .filter(t=>t.especieCodigo===oe.especieCodigo || (especie && t.especie===especie.nombreEs))
    .map(t=>t.codigo);
  const formatosPL  = [...new Set([...formatosOE, ...formatosEspecie])];

  function upd(k,v){ setPl(p=>({...p,[k]:v})); setDirty(true); }
  function addPallet(){
    const fmt0 = formatosOE[0]||"";
    const cal0 = (oe.calibrePorFormato||{})[fmt0]||"";
    const fmtName = tiposEmbalaje.find(x=>x.codigo===fmt0)?.descripcion || fmt0;  // guarda el nombre legible
    setPl(p=>({...p,pallets:[...(p.pallets||[]),{id:uid(),formato:fmtName,variedad:"",calibre:cal0,palletNum:(p.pallets||[]).length+1,cajas:0,pesoNetoKg:0,pesoBrutoKg:0}]}));
    setDirty(true);
  }
  // Actualiza un pallet. Al cambiar cajas o formato recalcula el peso neto
  // (y bruto si el formato lo define) = cajas × peso por caja. El peso queda
  // editable: el usuario puede sobrescribirlo después manualmente.
  function updPallet(idx,k,v){
    setPl(p=>{
      const ps=[...p.pallets];
      const row={...ps[idx],[k]:v};
      if(k==="cajas" || k==="formato"){
        const cajas = Number(k==="cajas"?v:row.cajas)||0;
        const pn = pesoNetoPorCaja(row.formato, tiposEmbalaje);
        const pb = pesoBrutoPorCaja(row.formato, tiposEmbalaje);
        if(pn>0) row.pesoNetoKg  = Math.round(cajas*pn*100)/100;
        if(pb>0) row.pesoBrutoKg = Math.round(cajas*pb*100)/100;
      }
      ps[idx]=row;
      return {...p,pallets:ps};
    });
    setDirty(true);
  }
  function delPallet(idx){ setPl(p=>({...p,pallets:p.pallets.filter((_,i)=>i!==idx)})); setDirty(true); }

  const totalCajas   = (pl.pallets||[]).reduce((s,p)=>s+Number(p.cajas||0),0);
  const totalNetoKg  = (pl.pallets||[]).reduce((s,p)=>s+Number(p.pesoNetoKg||0),0);
  const totalBrutoKg = (pl.pallets||[]).reduce((s,p)=>s+Number(p.pesoBrutoKg||0),0);

  function handleGuardar(){ onGuardar(pl); setDirty(false); }

  async function handlePDF(){
    setExporting(true);
    try{ await exportarPL_PDF(oe,pl,exportadora,cliente,especie,tiposEmbalaje); }
    catch(e){ alert("Error generando PDF: "+e.message); }
    finally{ setExporting(false); }
  }
  async function handleExcel(){
    setExporting(true);
    try{ await exportarPL_Excel(oe,pl,exportadora,cliente,especie,tiposEmbalaje); }
    catch(e){ alert("Error generando Excel: "+e.message); }
    finally{ setExporting(false); }
  }

  const numSt = {...inputSt,width:70,textAlign:"right",padding:"4px 6px"};
  const hasPallets = (pl.pallets||[]).length > 0;

  return (
    <div style={{marginTop:12,padding:14,background:`${C.bg}bb`,borderRadius:10,border:`1px solid ${C.teal}44`}}>
      <div style={{fontSize:12,fontWeight:700,color:C.teal,marginBottom:12}}>📋 Packing List</div>

      {/* Meta */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10,marginBottom:14}}>
        {[["Fecha despacho real","fechaDespReal","date"],["B/L o AWB","blAwb","text"],["N° Sello","sello","text"],["Temperatura (°C)","temperaturaC","number"]].map(([lbl,k,type])=>(
          <div key={k}>
            <div style={lblSt}>{lbl}</div>
            <input type={type} value={pl[k]||""} onChange={e=>upd(k,e.target.value)} style={inputSt} disabled={!canEdit}/>
          </div>
        ))}
      </div>

      {/* Tabla pallets */}
      <datalist id={`fmt-list-${oe.id}`}>
        {formatosPL.map(cod=>{ const t=tiposEmbalaje.find(x=>x.codigo===cod); return <option key={cod} value={t?.descripcion||cod}/>; })}
      </datalist>
      <div style={{overflowX:"auto",marginBottom:10}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead>
            <tr style={{background:C.primary}}>
              {["#","Formato","Variedad","Calibre","N° Pallet","Cajas","Peso Neto kg","Peso Bruto kg",canEdit?"✕":""].map((h,i)=>(
                <th key={i} style={{padding:"6px 8px",textAlign:(h==="#"||h==="N° Pallet"||h==="Cajas")?"center":"left",color:C.primaryText,fontWeight:700,fontSize:10,whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(pl.pallets||[]).map((p,idx)=>(
              <tr key={p.id||idx} style={{borderBottom:`1px solid ${C.border}22`, background:idx%2===0?C.card:C.rowAlt}}>
                <td style={{padding:"4px 8px",textAlign:"center",color:C.muted2,fontFamily:"monospace",fontSize:10}}>{idx+1}</td>
                <td style={{padding:"4px 4px"}}>
                  {canEdit
                    ? <input list={`fmt-list-${oe.id}`} value={p.formato||""} onChange={e=>updPallet(idx,"formato",e.target.value)}
                        placeholder="Formato…" style={{...inputSt,padding:"4px 6px",width:170}}/>
                    : <span style={{color:C.text}}>{nombreFormato(p.formato, tiposEmbalaje)}</span>}
                </td>
                <td style={{padding:"4px 4px"}}>
                  {canEdit
                    ? <input value={p.variedad||""} onChange={e=>updPallet(idx,"variedad",e.target.value)} placeholder="—" style={{...inputSt,padding:"4px 6px",width:110}}/>
                    : <span style={{color:C.text}}>{p.variedad||"—"}</span>}
                </td>
                <td style={{padding:"4px 4px"}}>
                  {canEdit
                    ? (calibresEsp.length>0
                        ? <select value={p.calibre||""} onChange={e=>updPallet(idx,"calibre",e.target.value)} style={{...inputSt,padding:"4px 6px",width:90}}>
                            <option value="">—</option>
                            {calibresEsp.map(cal=><option key={cal} value={cal}>{cal}</option>)}
                            {p.calibre && !calibresEsp.includes(p.calibre) && <option value={p.calibre}>{p.calibre}</option>}
                          </select>
                        : <input value={p.calibre||""} onChange={e=>updPallet(idx,"calibre",e.target.value)} style={{...inputSt,padding:"4px 6px",width:75}}/>)
                    : <span style={{color:C.text}}>{p.calibre||"—"}</span>}
                </td>
                <td style={{padding:"4px 4px",textAlign:"center"}}>
                  {canEdit
                    ? <input type="number" value={p.palletNum||""} onChange={e=>updPallet(idx,"palletNum",Number(e.target.value)||0)} style={{...numSt,width:55}}/>
                    : <span style={{fontFamily:"monospace",color:C.text}}>{p.palletNum||"—"}</span>}
                </td>
                {["cajas","pesoNetoKg","pesoBrutoKg"].map(k=>(
                  <td key={k} style={{padding:"4px 4px"}}>
                    {canEdit
                      ? <input type="number" value={p[k]||""} onChange={e=>updPallet(idx,k,Number(e.target.value)||0)} style={numSt}/>
                      : <span style={{fontFamily:"monospace",color:C.text}}>{Number(p[k]||0).toLocaleString("es-CL")}</span>}
                  </td>
                ))}
                <td style={{padding:"4px 4px"}}>
                  {canEdit && <button onClick={()=>delPallet(idx)} style={{...btnSt(C.accent,true),padding:"2px 6px",fontSize:11}}>×</button>}
                </td>
              </tr>
            ))}
            {hasPallets && (
              <tr style={{borderTop:`1px solid ${C.border}`,background:`${C.bg}66`}}>
                <td colSpan={4} style={{padding:"6px 8px",fontSize:10,color:C.muted,fontWeight:700,textAlign:"right"}}>TOTAL</td>
                <td style={{padding:"6px 8px",textAlign:"center",fontWeight:700,color:C.text,fontFamily:"monospace"}}>{(pl.pallets||[]).length}</td>
                <td style={{padding:"6px 8px",textAlign:"center",fontWeight:700,color:C.text,fontFamily:"monospace"}}>{totalCajas.toLocaleString("es-CL")}</td>
                <td style={{padding:"6px 8px",fontWeight:700,color:C.text,fontFamily:"monospace"}}>{totalNetoKg.toLocaleString("es-CL")}</td>
                <td style={{padding:"6px 8px",fontWeight:700,color:C.text,fontFamily:"monospace"}}>{totalBrutoKg.toLocaleString("es-CL")}</td>
                <td/>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <button onClick={addPallet} style={{...btnSt(C.teal,true),marginBottom:12,fontSize:11}}>+ Agregar pallet</button>
      )}

      <div style={{marginBottom:12}}>
        <div style={lblSt}>Observaciones</div>
        <textarea value={pl.observ||""} onChange={e=>upd("observ",e.target.value)}
          rows={2} style={{...inputSt,resize:"vertical"}} disabled={!canEdit}/>
      </div>

      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        {canEdit && dirty && <button onClick={handleGuardar} style={btnSt(C.green)}>💾 Guardar</button>}
        {canEdit && !dirty && hasPallets && <span style={{fontSize:11,color:C.green}}>✓ Guardado</span>}
        {hasPallets && !exporting && (
          <>
            <button onClick={handlePDF}   style={btnSt(C.accent,true)}>📄 PDF</button>
            <button onClick={handleExcel} style={btnSt(C.green,true)}>📊 Excel</button>
          </>
        )}
        {exporting && <span style={{fontSize:11,color:C.muted}}>Generando…</span>}
      </div>
    </div>
  );
}

const TIPOS_DOC_CLIENTE = [
  "Packing List", "Certificado Fitosanitario", "Factura Exportación",
  "Invoice", "QC Destino", "Otro",
];
// Tipos que generan alerta si el cliente activo no los tiene cargados con URL
const TIPOS_DOC_MINIMOS = ["Packing List", "Certificado Fitosanitario", "Factura Exportación", "Invoice", "QC Destino"];

// ═══════════════════════════════════════════════════════════════════
// IMPORTADOR DE EXCEL — clientes_frisku.xlsx (155 entidades)
// Reparte filas a 4 categorías. Merge NO destructivo: conserva los
// campos Frisku de los registros existentes (comisiones, especies...).
// ═══════════════════════════════════════════════════════════════════

const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const claveCmp = (v) => norm(v).toUpperCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "");

function categoriaDestino(catRaw) {
  const c = claveCmp(catRaw);
  if(c === "EXPORTADORA")      return {destino:"exportadoras", subtipo:null};
  if(c === "CONSIGNEE")        return {destino:"consignatarios", subtipo:null};
  if(c === "CLIENTE")          return {destino:"clientes", subtipo:null};
  if(c === "NOTIFY")           return {destino:"notify", subtipo:"generico"};
  if(c === "NOTIFY MARITIMO")  return {destino:"notify", subtipo:"maritimo"};
  if(c === "NOTIFY AEREO")     return {destino:"notify", subtipo:"aereo"};
  return {destino:null, subtipo:null};
}

async function leerExcelEntidades(file) {
  const XLSX = await import("xlsx-js-style");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, {type:"array"});
  const hoja = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(hoja, {defval:""});
  return filas.map(f => {
    const o = {};
    for(const k in f) o[norm(k).toLowerCase()] = norm(f[k]);
    return o;
  });
}

function contactoDesdeExcel(row) {
  const nombre = row.nombre_representante || "";
  const email = row.email || "";
  const fono = row.fono || "";
  if(!nombre && !email && !fono) return null;
  return {nombre, email, fono, cargo:"", principal:true};
}

function procesarFilas(filasRaw) {
  const porDestino = {clientes:[], exportadoras:[], notify:[], consignatarios:[]};
  const errores = [];
  filasRaw.forEach((row, i) => {
    const fila = i + 2;
    const codigo = norm(row.codigo_entidad);
    const cat = norm(row.categoria);
    if(!codigo) { errores.push(`Fila ${fila}: sin codigo_entidad — omitida`); return; }
    const {destino, subtipo} = categoriaDestino(cat);
    if(!destino) { errores.push(`Fila ${fila}: categoría desconocida "${cat}" — omitida`); return; }
    porDestino[destino].push({
      codigoEntidad: codigo,
      razonSocial:   norm(row.razon_social),
      nombre:        norm(row.nombre) || norm(row.razon_social),
      rut:           norm(row.rut_entidad),
      rutRepresentante: norm(row.rut_representante),
      nombreRepresentante: norm(row.nombre_representante),
      email:         norm(row.email),
      fono:          norm(row.fono),
      pais:          norm(row.pais),
      provincia:     norm(row.provincia),
      comuna:        norm(row.comuna),
      ciudad:        norm(row.ciudad),
      direccion:     norm(row.direccion),
      subtipo,
    });
  });
  return {porDestino, errores};
}

function mergeClientes(existentes, entrantes) {
  const res = existentes.map(c => ({...c}));
  let creados = 0, actualizados = 0;
  const idxPorCodigo = {}, idxPorNombre = {};
  res.forEach((c, i) => {
    if(c.codigoEntidad) idxPorCodigo[claveCmp(c.codigoEntidad)] = i;
    if(c.nombre) idxPorNombre[claveCmp(c.nombre)] = i;
  });
  entrantes.forEach(e => {
    let i = idxPorCodigo[claveCmp(e.codigoEntidad)];
    if(i === undefined) i = idxPorNombre[claveCmp(e.nombre)];
    if(i !== undefined) {
      const prev = res[i];
      res[i] = {
        ...prev,
        codigoEntidad: e.codigoEntidad,
        nombre: e.nombre || prev.nombre,
        razonSocial: e.razonSocial || prev.razonSocial || "",
        rut: e.rut || prev.rut || "",
        paisCodigo: prev.paisCodigo || e.paisCodigo || "",
        pais: e.pais || prev.pais || "",
        ciudad: e.ciudad || prev.ciudad || "",
        direccion: e.direccion || prev.direccion || "",
        contactos: (prev.contactos && prev.contactos.length)
          ? prev.contactos
          : [contactoDesdeExcel(e)].filter(Boolean),
        fechaActualizacion: new Date().toISOString(),
      };
      actualizados++;
    } else {
      res.push({
        id: uid(),
        codigoEntidad: e.codigoEntidad,
        nombre: e.nombre,
        razonSocial: e.razonSocial,
        paisCodigo: e.paisCodigo || "",
        pais: e.pais,
        ciudad: e.ciudad,
        direccion: e.direccion,
        rut: e.rut,
        mercadoCodigo: "",
        monedaCodigo: "USD",
        contactos: [contactoDesdeExcel(e)].filter(Boolean),
        especiesCodigos: [],
        comisionGlobalSobreFOB: 8,
        comisionFriskuSobreClienteGlobal: 25,
        comisionOverrides: {},
        activo: true,
        observ: "",
        fechaCreacion: new Date().toISOString(),
        fechaActualizacion: new Date().toISOString(),
      });
      creados++;
    }
  });
  return {datos:res, creados, actualizados};
}

function mergeExportadoras(existentes, entrantes) {
  const res = existentes.map(x => ({...x}));
  let creados = 0, actualizados = 0;
  const idxPorCodigo = {}, idxPorNombre = {};
  res.forEach((x, i) => {
    if(x.codigoEntidad) idxPorCodigo[claveCmp(x.codigoEntidad)] = i;
    if(x.nombre) idxPorNombre[claveCmp(x.nombre)] = i;
  });
  entrantes.forEach(e => {
    let i = idxPorCodigo[claveCmp(e.codigoEntidad)];
    if(i === undefined) i = idxPorNombre[claveCmp(e.nombre)];
    if(i !== undefined) {
      const prev = res[i];
      res[i] = {
        ...prev,
        codigoEntidad: e.codigoEntidad,
        nombre: e.nombre || prev.nombre,
        razonSocial: e.razonSocial || prev.razonSocial || "",
        rut: e.rut || prev.rut || "",
        paisCodigo: prev.paisCodigo || e.paisCodigo || "",
        pais: e.pais || prev.pais || "",
        ciudad: e.ciudad || prev.ciudad || "",
        direccion: e.direccion || prev.direccion || "",
        contactos: (prev.contactos && prev.contactos.length)
          ? prev.contactos
          : [contactoDesdeExcel(e)].filter(Boolean),
        fechaActualizacion: new Date().toISOString(),
      };
      actualizados++;
    } else {
      res.push({
        id: uid(),
        codigoEntidad: e.codigoEntidad,
        nombre: e.nombre,
        razonSocial: e.razonSocial,
        rut: e.rut,
        paisCodigo: e.paisCodigo || "",
        pais: e.pais,
        ciudad: e.ciudad,
        direccion: e.direccion,
        monedaCodigo: "USD",
        contactos: [contactoDesdeExcel(e)].filter(Boolean),
        especiesProduce: [],
        certificaciones: "",
        activo: true,
        observ: "",
        fechaCreacion: new Date().toISOString(),
        fechaActualizacion: new Date().toISOString(),
      });
      creados++;
    }
  });
  return {datos:res, creados, actualizados};
}

function mergeSimple(existentes, entrantes) {
  const res = existentes.map(x => ({...x}));
  let creados = 0, actualizados = 0;
  const idxPorCodigo = {};
  res.forEach((x, i) => { if(x.codigo) idxPorCodigo[claveCmp(x.codigo)] = i; });
  entrantes.forEach(e => {
    const reg = {
      codigo: e.codigoEntidad,
      razonSocial: e.razonSocial,
      nombre: e.nombre,
      rut: e.rut,
      email: e.email,
      fono: e.fono,
      nombreContacto: e.nombreRepresentante,
      paisCodigo: e.paisCodigo || "",
      pais: e.pais,
      ciudad: e.ciudad,
      direccion: e.direccion,
      observ: "",
    };
    if(e.subtipo) reg.subtipo = e.subtipo;
    const i = idxPorCodigo[claveCmp(e.codigoEntidad)];
    if(i !== undefined) {
      res[i] = {...res[i], ...reg};
      actualizados++;
    } else {
      res.push(reg);
      idxPorCodigo[claveCmp(e.codigoEntidad)] = res.length - 1;
      creados++;
    }
  });
  return {datos:res, creados, actualizados};
}


function Card({children, title, icon, action}) {
  return (
    <div style={{background:C.card, borderRadius:14, padding:18, border:`1px solid ${C.border}`, boxShadow:C.shadow}}>
      {title && (
        <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:14, borderBottom:`1px solid ${C.border}`, paddingBottom:10}}>
          {icon && <span style={{fontSize:18}}>{icon}</span>}
          <h3 style={{margin:0, color:C.text, fontSize:14, fontWeight:700, flex:1}}>{title}</h3>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

// Sección colapsable usada por ClienteForm y ExportadoraForm.
// IMPORTANTE: este componente debe declararse FUERA de los Forms
// para que React no lo recree en cada keystroke y los inputs no
// pierdan el foco. (Sí, eso pasó. Sí, fue mi error la primera vez.)
function Seccion({id, titulo, icono, abierta, onToggle, children}) {
  return (
    <div style={{marginBottom:10, border:`1px solid ${C.border}`, borderRadius:8, overflow:"hidden"}}>
      <button onClick={onToggle}
        style={{width:"100%", padding:"10px 14px", background:abierta?C.card2:C.card, border:"none",
          color:C.text, textAlign:"left", cursor:"pointer", display:"flex", alignItems:"center",
          gap:8, fontSize:12, fontWeight:700}}>
        <span>{icono}</span>
        <span style={{flex:1}}>{titulo}</span>
        <span style={{color:C.muted, fontSize:10}}>{abierta?"▼":"▶"}</span>
      </button>
      {abierta && <div style={{padding:14, background:C.card2}}>{children}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CLIENTE FORM — editor expandible con secciones
// ═══════════════════════════════════════════════════════════════════
function ClienteForm({cliente, especies, paises, ciudades, monedas, mercados, tiposEmbalaje, onGuardar, onCancelar}) {
  const [buf, setBuf] = useState(()=>JSON.parse(JSON.stringify(cliente)));
  const [seccionAbierta, setSeccionAbierta] = useState("basico");

  // Ciudades del maestro filtradas por el país seleccionado.
  // Si no hay país elegido aún, sugiere todas.
  const ciudadesSugeridas = useMemo(()=>{
    if(!Array.isArray(ciudades) || !ciudades.length) return [];
    if(!buf.paisCodigo) return ciudades;
    return ciudades.filter(c => c.paisCodigo === buf.paisCodigo);
  },[ciudades, buf.paisCodigo]);

  const setCampo = (k, v) => setBuf(prev => ({...prev, [k]:v}));
  const toggleEspecie = (codigo) => {
    setBuf(prev => {
      const arr = prev.especiesCodigos || [];
      return {...prev, especiesCodigos: arr.includes(codigo) ? arr.filter(c=>c!==codigo) : [...arr, codigo]};
    });
  };

  const setContacto = (idx, k, v) => {
    setBuf(prev => {
      const list = [...(prev.contactos||[])];
      list[idx] = {...list[idx], [k]:v};
      return {...prev, contactos:list};
    });
  };
  const addContacto = () => setBuf(prev => ({...prev, contactos:[...(prev.contactos||[]), {nombre:"", cargo:"", email:"", telefono:""}]}));
  const delContacto = (idx) => setBuf(prev => ({...prev, contactos:(prev.contactos||[]).filter((_,i)=>i!==idx)}));

  const setOverride = (clave, sub, valor) => {
    setBuf(prev => {
      const ov = {...(prev.comisionOverrides||{})};
      ov[clave] = {...(ov[clave]||{}), [sub]: valor === "" ? null : Number(valor)};
      // Si ambos campos son null, eliminar la clave
      if(ov[clave].cliente == null && ov[clave].frisku == null) delete ov[clave];
      return {...prev, comisionOverrides:ov};
    });
  };
  const delOverride = (clave) => {
    setBuf(prev => {
      const ov = {...(prev.comisionOverrides||{})};
      delete ov[clave];
      return {...prev, comisionOverrides:ov};
    });
  };

  const addDoc = () => setBuf(prev => ({...prev, documentos:[...(prev.documentos||[]), {id:uid(), tipo:"", nombre:"", url:"", fecha:"", vencimiento:"", observ:""}]}));
  const setDoc = (idx, k, v) => setBuf(prev => { const list=[...(prev.documentos||[])]; list[idx]={...list[idx],[k]:v}; return {...prev, documentos:list}; });
  const delDoc = (idx) => setBuf(prev => ({...prev, documentos:(prev.documentos||[]).filter((_,i)=>i!==idx)}));

  const [uploadingDocs, setUploadingDocs] = useState(new Set());
  const handleUploadDoc = async (idx, file) => {
    if (!file) return;
    const doc = (buf.documentos||[])[idx];
    if (!doc) return;
    const ext  = file.name.split(".").pop();
    const docId = doc.id || uid();
    const path = `clientes/${buf.id||"nuevo"}/${docId}/${Date.now()}.${ext}`;
    setUploadingDocs(prev => new Set(prev).add(idx));
    const url = await uploadArchivoFrisku(file, path);
    setUploadingDocs(prev => { const s = new Set(prev); s.delete(idx); return s; });
    if (url) {
      setDoc(idx, "url", url);
      if (!doc.nombre) setDoc(idx, "nombre", file.name);
    } else {
      alert("Error al subir el archivo. Verifica tu conexión o pega el link manualmente.");
    }
  };

  const handleGuardar = () => {
    if(!buf.nombre?.trim()) { alert("Nombre es requerido"); return; }
    onGuardar({...buf, fechaActualizacion: new Date().toISOString()});
  };

  const toggle = (id) => setSeccionAbierta(prev => prev === id ? "" : id);

  const especiesActivas = (buf.especiesCodigos||[]);
  const overrides = buf.comisionOverrides || {};
  const especiesParaOverride = especies.filter(e => especiesActivas.includes(e.codigo));
  const hoyDoc = new Date().toISOString().slice(0,10);
  const docsFaltantes = TIPOS_DOC_MINIMOS.filter(t => !(buf.documentos||[]).some(d=>d.tipo===t&&d.url));

  return (
    <div style={{background:`${C.blue}11`, padding:16, borderRadius:8, border:`1px solid ${C.blue}44`, marginBottom:14}}>
      <h3 style={{margin:"0 0 14px", color:C.blue, fontSize:14, display:"flex", alignItems:"center", gap:8}}>
        <span>{cliente.id ? "✎" : "+"}</span>
        <span>{cliente.id ? `Editando: ${buf.nombre || "(sin nombre)"}` : "Nuevo cliente"}</span>
      </h3>

      <Seccion id="basico" titulo="Datos básicos" icono="🏢" abierta={seccionAbierta==="basico"} onToggle={()=>toggle("basico")}>
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap:10}}>
          <div>
            <div style={lblSt}>Nombre *</div>
            <input value={buf.nombre||""} onChange={e=>setCampo("nombre", e.target.value)} placeholder="Disney, Driscoll's..." style={inputSt}/>
          </div>
          <div>
            <div style={lblSt}>País</div>
            <select value={buf.paisCodigo||""} onChange={e=>setCampo("paisCodigo", e.target.value)} style={inputSt}>
              <option value="">— seleccionar —</option>
              {paises.map(p => <option key={p.codigo} value={p.codigo}>{p.flag} {p.nombreEs}</option>)}
            </select>
          </div>
          <div>
            <div style={lblSt}>Ciudad</div>
            <input
              value={buf.ciudad||""}
              onChange={e=>setCampo("ciudad", e.target.value)}
              list="ciudades-cliente-list"
              placeholder={buf.paisCodigo ? "Empezá a tipear o elegí…" : "Selecciona país primero o tipea libre"}
              style={inputSt}
              autoComplete="off"
            />
            <datalist id="ciudades-cliente-list">
              {ciudadesSugeridas.map(c => (
                <option key={c.codigo} value={c.nombre}>{c.paisCodigo}</option>
              ))}
            </datalist>
          </div>
          <div>
            <div style={lblSt}>Mercado</div>
            <select value={buf.mercadoCodigo||""} onChange={e=>setCampo("mercadoCodigo", e.target.value)} style={inputSt}>
              <option value="">— seleccionar —</option>
              {mercados.map(m => <option key={m.codigo} value={m.codigo}>{m.nombre}</option>)}
            </select>
          </div>
          <div>
            <div style={lblSt}>Moneda principal</div>
            <select value={buf.monedaCodigo||"USD"} onChange={e=>setCampo("monedaCodigo", e.target.value)} style={inputSt}>
              {monedas.map(m => <option key={m.codigo} value={m.codigo}>{m.simbolo} {m.codigo} — {m.nombre}</option>)}
            </select>
          </div>
          <div>
            <div style={lblSt}>Estado</div>
            <select value={buf.activo===false?"no":"si"} onChange={e=>setCampo("activo", e.target.value==="si")} style={inputSt}>
              <option value="si">● Activo</option>
              <option value="no">○ Inactivo</option>
            </select>
          </div>
        </div>
        <div style={{marginTop:10}}>
          <div style={lblSt}>Observaciones</div>
          <textarea value={buf.observ||""} onChange={e=>setCampo("observ", e.target.value)}
            rows={2} style={{...inputSt, resize:"vertical", fontFamily:"inherit"}}/>
        </div>
      </Seccion>

      <Seccion id="contactos" titulo={`Contactos (${(buf.contactos||[]).length})`} icono="👥" abierta={seccionAbierta==="contactos"} onToggle={()=>toggle("contactos")}>
        {(buf.contactos||[]).map((co, i) => (
          <div key={i} style={{display:"grid", gridTemplateColumns:"1.2fr 1fr 1.5fr 1fr 36px", gap:8, marginBottom:8}}>
            <input value={co.nombre||""} onChange={e=>setContacto(i,"nombre",e.target.value)} placeholder="Nombre" style={inputSt}/>
            <input value={co.cargo||""} onChange={e=>setContacto(i,"cargo",e.target.value)} placeholder="Cargo" style={inputSt}/>
            <input value={co.email||""} onChange={e=>setContacto(i,"email",e.target.value)} placeholder="email@x.com" type="email" style={inputSt}/>
            <input value={co.telefono||""} onChange={e=>setContacto(i,"telefono",e.target.value)} placeholder="Teléfono" style={inputSt}/>
            <button onClick={()=>delContacto(i)} style={{...btnSt(C.accent, true), padding:"4px 8px"}}>×</button>
          </div>
        ))}
        <button onClick={addContacto} style={btnSt(C.green, true)}>+ Agregar contacto</button>
      </Seccion>

      <Seccion id="especies" titulo={`Especies que compra (${especiesActivas.length}/${especies.length})`} icono="🍒" abierta={seccionAbierta==="especies"} onToggle={()=>toggle("especies")}>
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(150px, 1fr))", gap:6}}>
          {especies.map(e => {
            const activa = especiesActivas.includes(e.codigo);
            return (
              <label key={e.codigo} style={{
                display:"flex", alignItems:"center", gap:6, padding:"6px 10px",
                background: activa ? `${C.green}22` : C.card,
                border:`1px solid ${activa?C.green:C.border}`,
                borderRadius:6, cursor:"pointer", fontSize:11,
              }}>
                <input type="checkbox" checked={activa} onChange={()=>toggleEspecie(e.codigo)}/>
                <span style={{fontSize:14}}>{e.icono}</span>
                <span style={{color:C.text}}>{e.nombreEs}</span>
              </label>
            );
          })}
        </div>
        {especies.length === 0 && (
          <div style={{padding:14, color:C.muted, fontSize:11}}>
            Sin especies en el maestro. Ve a Maestros → Especies para cargarlas.
          </div>
        )}
      </Seccion>

      <Seccion id="comisiones" titulo="Comisión Frisku" icono="💰" abierta={seccionAbierta==="comisiones"} onToggle={()=>toggle("comisiones")}>
        <div style={{background:C.card, padding:12, borderRadius:6, marginBottom:12, fontSize:11, color:C.muted, lineHeight:1.5}}>
          <strong style={{color:C.text}}>Modelo:</strong> el cliente cobra <em>X% sobre la base neta en destino</em> (venta en destino − gastos en destino).
          Frisku recibe <em>Y%</em> de esa comisión.<br/>
          <span style={{color:C.yellow}}>Ejemplo Disney: cliente 8% × Frisku 25% = Frisku se queda con 2% de la base neta.</span>
        </div>

        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:14}}>
          <div>
            <div style={lblSt}>% Cliente s/ base neta destino</div>
            <div style={{position:"relative"}}>
              <input type="number" step="0.01" value={buf.comisionGlobalSobreFOB ?? ""}
                onChange={e=>setCampo("comisionGlobalSobreFOB", e.target.value === "" ? null : Number(e.target.value))}
                placeholder="8.0" style={inputSt}/>
            </div>
          </div>
          <div>
            <div style={lblSt}>% Frisku sobre comisión cliente</div>
            <input type="number" step="0.01" value={buf.comisionFriskuSobreClienteGlobal ?? ""}
              onChange={e=>setCampo("comisionFriskuSobreClienteGlobal", e.target.value === "" ? null : Number(e.target.value))}
              placeholder="25.0" style={inputSt}/>
          </div>
          <div>
            <div style={lblSt}>% Frisku efectivo s/ base neta</div>
            <div style={{...inputSt, background:C.bg2, color:C.green, fontFamily:"monospace", fontWeight:700, display:"flex", alignItems:"center"}}>
              {(((Number(buf.comisionGlobalSobreFOB)||0) * (Number(buf.comisionFriskuSobreClienteGlobal)||0)) / 100).toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Overrides por especie y especie+formato */}
        {especiesParaOverride.length > 0 && (
          <div style={{marginTop:14, paddingTop:14, borderTop:`1px solid ${C.border}`}}>
            <div style={{fontSize:11, color:C.muted, marginBottom:10}}>
              <strong style={{color:C.text}}>Overrides</strong> — define % diferente para una especie o especie+formato.
              Si está vacío, se usa el global de arriba.
            </div>
            {especiesParaOverride.map(esp => {
              const formatos = (tiposEmbalaje||[]).filter(t =>
                t.especieCodigo === esp.codigo || t.especie === esp.nombreEs
              );
              const claveEsp = esp.codigo;
              const ovEsp = overrides[claveEsp];
              return (
                <div key={esp.codigo} style={{marginBottom:10, background:C.card, padding:10, borderRadius:6, border:`1px solid ${C.border}`}}>
                  <div style={{display:"grid", gridTemplateColumns:"170px 1fr 1fr 90px 36px", gap:8, alignItems:"center", marginBottom:formatos.length?8:0}}>
                    <div style={{color:C.text, fontWeight:600, fontSize:12}}>
                      {esp.icono} {esp.nombreEs}
                    </div>
                    <div>
                      <input type="number" step="0.01" value={ovEsp?.cliente ?? ""}
                        onChange={e=>setOverride(claveEsp, "cliente", e.target.value)}
                        placeholder="(global)" style={inputSt}/>
                      <div style={{fontSize:9, color:C.muted, marginTop:2}}>% cliente</div>
                    </div>
                    <div>
                      <input type="number" step="0.01" value={ovEsp?.frisku ?? ""}
                        onChange={e=>setOverride(claveEsp, "frisku", e.target.value)}
                        placeholder="(global)" style={inputSt}/>
                      <div style={{fontSize:9, color:C.muted, marginTop:2}}>% frisku</div>
                    </div>
                    <div style={{fontSize:10, color:C.green, textAlign:"right", fontFamily:"monospace", fontWeight:700}}>
                      {ovEsp ? `${((Number(ovEsp.cliente||0)*Number(ovEsp.frisku||0))/100).toFixed(2)}%` : "—"}
                    </div>
                    <button onClick={()=>delOverride(claveEsp)} style={{...btnSt(C.muted, true), padding:"4px 8px"}} title="Limpiar override">×</button>
                  </div>
                  {/* Overrides por formato (solo si hay formatos para esta especie) */}
                  {formatos.length > 0 && (
                    <div style={{marginLeft:14, paddingLeft:14, borderLeft:`2px solid ${C.border}`}}>
                      {formatos.map(fmt => {
                        const clave = `${esp.codigo}::${fmt.codigo}`;
                        const ov = overrides[clave];
                        return (
                          <div key={fmt.codigo} style={{display:"grid", gridTemplateColumns:"170px 1fr 1fr 90px 36px", gap:8, alignItems:"center", marginTop:6}}>
                            <div style={{color:C.muted, fontSize:10}}>
                              ↳ {fmt.nombre} <span style={{color:C.muted2}}>({fmt.codigo})</span>
                            </div>
                            <div>
                              <input type="number" step="0.01" value={ov?.cliente ?? ""}
                                onChange={e=>setOverride(clave, "cliente", e.target.value)}
                                placeholder={ovEsp?.cliente != null ? `(${ovEsp.cliente})` : "(global)"} style={inputSt}/>
                            </div>
                            <div>
                              <input type="number" step="0.01" value={ov?.frisku ?? ""}
                                onChange={e=>setOverride(clave, "frisku", e.target.value)}
                                placeholder={ovEsp?.frisku != null ? `(${ovEsp.frisku})` : "(global)"} style={inputSt}/>
                            </div>
                            <div style={{fontSize:10, color:C.green, textAlign:"right", fontFamily:"monospace", fontWeight:700}}>
                              {ov ? `${((Number(ov.cliente||0)*Number(ov.frisku||0))/100).toFixed(2)}%` : "—"}
                            </div>
                            <button onClick={()=>delOverride(clave)} style={{...btnSt(C.muted, true), padding:"4px 8px"}}>×</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {especiesActivas.length === 0 && (
          <div style={{padding:14, color:C.muted, fontSize:11, fontStyle:"italic"}}>
            Selecciona especies en la sección anterior para definir overrides específicos.
          </div>
        )}
      </Seccion>

      <Seccion id="documentos" titulo={`Documentos (${(buf.documentos||[]).length})`} icono="📁" abierta={seccionAbierta==="documentos"} onToggle={()=>toggle("documentos")}>
        {docsFaltantes.length > 0 && (
          <div style={{background:`${C.accent}11`, border:`1px solid ${C.accent}44`, borderRadius:6, padding:"8px 12px", marginBottom:10, fontSize:11, color:C.accent}}>
            Obligatorios faltantes: {docsFaltantes.join(" · ")}
          </div>
        )}
        {(buf.documentos||[]).map((doc, i) => {
          const vencDoc    = doc.vencimiento && doc.vencimiento < hoyDoc;
          const subiendo   = uploadingDocs.has(i);
          const esStorage  = !!pathDesdeUrlStorage(doc.url);
          const fileNombre = esStorage ? doc.url.split("/").pop() : null;
          const fileInputId = `fdoc-${doc.id||i}`;
          return (
            <div key={doc.id||i} style={{background:C.card, padding:10, borderRadius:6, marginBottom:8, border:`1px solid ${vencDoc ? C.accent : C.border}`}}>
              <div style={{display:"grid", gridTemplateColumns:"160px 1fr", gap:8, marginBottom:6}}>
                <div>
                  <div style={lblSt}>Tipo</div>
                  <input value={doc.tipo||""} onChange={e=>setDoc(i,"tipo",e.target.value)}
                    list="tipos-doc-list" placeholder="Tipo de documento" style={inputSt} autoComplete="off"/>
                </div>
                <div>
                  <div style={lblSt}>Nombre / descripción</div>
                  <input value={doc.nombre||""} onChange={e=>setDoc(i,"nombre",e.target.value)}
                    placeholder="Contrato Marco 2026-2027" style={inputSt}/>
                </div>
              </div>
              <div style={{display:"grid", gridTemplateColumns:"1fr 130px 130px 36px", gap:8, alignItems:"flex-end"}}>
                <div>
                  <div style={lblSt}>URL / Archivo</div>
                  {/* Input oculto para selección de archivo */}
                  <input type="file" id={fileInputId} style={{display:"none"}}
                    onChange={e=>{ handleUploadDoc(i, e.target.files[0]); e.target.value=""; }}/>
                  {esStorage && fileNombre ? (
                    /* Chip de archivo subido a Storage */
                    <div style={{display:"flex", gap:4, alignItems:"center"}}>
                      <span style={{
                        flex:1, padding:"5px 10px", borderRadius:6, fontSize:11,
                        background:`${C.teal}18`, border:`1px solid ${C.teal}44`, color:C.teal,
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                      }} title={doc.url}>📎 {fileNombre}</span>
                      <button onClick={()=>window.open(doc.url,"_blank")}
                        style={{...btnSt(C.blue,true), padding:"5px 8px", flexShrink:0}} title="Abrir archivo">↗</button>
                      <button onClick={()=>document.getElementById(fileInputId)?.click()}
                        disabled={subiendo}
                        style={{...btnSt(C.muted,true), padding:"5px 8px", flexShrink:0}} title="Reemplazar archivo">
                        {subiendo ? "…" : "↺"}
                      </button>
                    </div>
                  ) : (
                    /* URL manual + botón subir */
                    <div style={{display:"flex", gap:4}}>
                      <input value={doc.url||""} onChange={e=>setDoc(i,"url",e.target.value)}
                        placeholder="https://... o sube un archivo →" style={{...inputSt, flex:1}}/>
                      {doc.url && !esStorage && (
                        <button onClick={()=>window.open(doc.url,"_blank")}
                          style={{...btnSt(C.blue,true), padding:"6px 8px", flexShrink:0}} title="Abrir link">↗</button>
                      )}
                      <button onClick={()=>document.getElementById(fileInputId)?.click()}
                        disabled={subiendo}
                        style={{...btnSt(C.teal,true), padding:"6px 8px", flexShrink:0}} title="Subir archivo a Supabase">
                        {subiendo ? "…" : "📎"}
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <div style={lblSt}>Fecha doc.</div>
                  <input type="date" value={doc.fecha||""} onChange={e=>setDoc(i,"fecha",e.target.value)} style={inputSt}/>
                </div>
                <div>
                  <div style={lblSt}>Vencimiento{vencDoc ? " ⚠" : ""}</div>
                  <input type="date" value={doc.vencimiento||""} onChange={e=>setDoc(i,"vencimiento",e.target.value)}
                    style={{...inputSt, borderColor: vencDoc ? C.accent : C.border}}/>
                </div>
                <button onClick={()=>delDoc(i)} style={{...btnSt(C.accent,true), padding:"6px 8px", marginTop:14}}>×</button>
              </div>
            </div>
          );
        })}
        <datalist id="tipos-doc-list">
          {TIPOS_DOC_CLIENTE.map(t=><option key={t} value={t}/>)}
        </datalist>
        <button onClick={addDoc} style={btnSt(C.blue,true)}>+ Agregar documento</button>
      </Seccion>

      <div style={{display:"flex", gap:8, justifyContent:"flex-end", marginTop:14}}>
        <button onClick={onCancelar} style={btnSt(C.muted, true)}>Cancelar</button>
        <button onClick={handleGuardar} style={btnSt(C.green)}>✓ Guardar cliente</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CLIENTE CARD — vista compacta
// ═══════════════════════════════════════════════════════════════════
function ClienteCard({cliente, especies, paises, monedas, mercados, onEditar, onEliminar, canEdit}) {
  const pais = paises.find(p => p.codigo === cliente.paisCodigo);
  const mercado = mercados.find(m => m.codigo === cliente.mercadoCodigo);
  const monedaSimb = monedas.find(m => m.codigo === cliente.monedaCodigo)?.simbolo || cliente.monedaCodigo;

  const especiesNombres = (cliente.especiesCodigos||[])
    .map(c => especies.find(e=>e.codigo===c))
    .filter(Boolean);

  const friSobreBaseNeta = (Number(cliente.comisionGlobalSobreFOB)||0) * (Number(cliente.comisionFriskuSobreClienteGlobal)||0) / 100;
  const numOverrides = Object.keys(cliente.comisionOverrides||{}).length;
  const hoyCard = new Date().toISOString().slice(0,10);
  const docsFaltantesCard = TIPOS_DOC_MINIMOS.filter(t => !(cliente.documentos||[]).some(d=>d.tipo===t&&d.url));
  const docsVencidosCard = (cliente.documentos||[]).filter(d => d.vencimiento && d.vencimiento < hoyCard).length;
  const tieneAlertaDocs = (docsFaltantesCard.length > 0 || docsVencidosCard > 0) && cliente.activo !== false;

  return (
    <div style={{
      background:C.card2, padding:14, borderRadius:10,
      border:`1px solid ${tieneAlertaDocs ? C.accent+"66" : cliente.activo===false ? C.border : C.green+"66"}`,
      boxShadow:C.shadow,
      opacity: cliente.activo===false ? 0.65 : 1,
    }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, marginBottom:10}}>
        <div style={{flex:1}}>
          <div style={{fontSize:14, fontWeight:700, color:C.text, display:"flex", alignItems:"center", gap:8}}>
            {cliente.activo===false && <span style={{fontSize:9, padding:"2px 6px", borderRadius:4, background:C.border, color:C.muted}}>INACTIVO</span>}
            {cliente.nombre}
          </div>
          <div style={{fontSize:11, color:C.muted, marginTop:3, display:"flex", gap:8, flexWrap:"wrap"}}>
            {pais && <span>{pais.flag} {cliente.ciudad ? `${cliente.ciudad}, ` : ""}{pais.nombreEs}</span>}
            {mercado && <span>· 🎯 {mercado.nombre}</span>}
            <span>· 💱 {monedaSimb}</span>
          </div>
          {tieneAlertaDocs && (
            <div style={{marginTop:4, display:"flex", gap:4, flexWrap:"wrap"}}>
              {docsFaltantesCard.length > 0 && (
                <span style={{fontSize:9, padding:"2px 8px", borderRadius:4, background:`${C.accent}22`, color:C.accent, border:`1px solid ${C.accent}44`}}>
                  {docsFaltantesCard.length} doc{docsFaltantesCard.length>1?"s":""} obligatorio{docsFaltantesCard.length>1?"s":""} faltante{docsFaltantesCard.length>1?"s":""}
                </span>
              )}
              {docsVencidosCard > 0 && (
                <span style={{fontSize:9, padding:"2px 8px", borderRadius:4, background:`${C.yellow}22`, color:C.yellow, border:`1px solid ${C.yellow}44`}}>
                  {docsVencidosCard} doc{docsVencidosCard>1?"s":""} vencido{docsVencidosCard>1?"s":""}
                </span>
              )}
            </div>
          )}
        </div>
        {canEdit && (
          <div style={{display:"flex", gap:6}}>
            <button onClick={onEditar} style={{...btnSt(C.blue, true), padding:"4px 10px"}}>✎ Editar</button>
            <button onClick={onEliminar} style={{...btnSt(C.accent, true), padding:"4px 10px"}}>×</button>
          </div>
        )}
      </div>

      {especiesNombres.length > 0 && (
        <div style={{display:"flex", flexWrap:"wrap", gap:4, marginBottom:10}}>
          {especiesNombres.map(e => (
            <span key={e.codigo} style={{
              padding:"2px 8px", borderRadius:4, fontSize:10,
              background:`${C.teal}22`, color:C.teal, border:`1px solid ${C.teal}44`
            }}>{e.icono} {e.nombreEs}</span>
          ))}
        </div>
      )}

      <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:8, padding:"10px 0", borderTop:`1px solid ${C.border}`, fontSize:11}}>
        <div>
          <div style={{color:C.muted, fontSize:9, textTransform:"uppercase"}}>Cliente s/base neta</div>
          <div style={{color:C.text, fontWeight:700, fontFamily:"monospace"}}>{(cliente.comisionGlobalSobreFOB??0).toFixed(2)}%</div>
        </div>
        <div>
          <div style={{color:C.muted, fontSize:9, textTransform:"uppercase"}}>Frisku s/cliente</div>
          <div style={{color:C.text, fontWeight:700, fontFamily:"monospace"}}>{(cliente.comisionFriskuSobreClienteGlobal??0).toFixed(2)}%</div>
        </div>
        <div>
          <div style={{color:C.muted, fontSize:9, textTransform:"uppercase"}}>Frisku s/base neta</div>
          <div style={{color:C.green, fontWeight:700, fontFamily:"monospace"}}>
            {friSobreBaseNeta.toFixed(2)}%
            {numOverrides > 0 && <span style={{color:C.yellow, fontSize:9, marginLeft:4}}>(+{numOverrides} override{numOverrides>1?"s":""})</span>}
          </div>
        </div>
      </div>

      {cliente.observ && (
        <div style={{marginTop:8, paddingTop:8, borderTop:`1px solid ${C.border}`, fontSize:11, color:C.muted, fontStyle:"italic"}}>
          {cliente.observ}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DOCUMENTOS TAB — vista agregada de todos los docs de todos los clientes
// ═══════════════════════════════════════════════════════════════════
// BIBLIOTECA DOCUMENTAL TRANSVERSAL — indexa los documentos de todo Frisku
// (documentos de clientes + Carpeta COMEX + QC de embarques) SIN duplicar el
// archivo físico: cada fila apunta a la misma URL de storage. Permite Ver /
// descargar, filtrar/buscar e ir al registro origen. Rutas locales del PC
// (C:\..., file://) se marcan "Requiere recarga".
function DocumentosTab({ clientes, embarques=[], exportadoras=[], especies=[], onVerEmbarque }) {
  const [fEntidad, setFEntidad] = useState("");  // "" | Cliente | Embarque
  const [fTipo,    setFTipo]    = useState("");
  const [fEstado,  setFEstado]  = useState("todos"); // todos | cargado | recarga | pendiente | vencido
  // Filtros de la vista Cobertura (por temporada/cliente/exportador/especie/estado docal)
  const [cTemp, setCTemp] = useState(""); const [cCli, setCCli] = useState(""); const [cExp, setCExp] = useState(""); const [cEsp, setCEsp] = useState(""); const [cEstado, setCEstado] = useState("incompletos");
  const [q,        setQ]        = useState("");
  const hoy = new Date().toISOString().slice(0,10);
  const espName=(c)=>{ const e=especies.find(x=>x.codigo===c); return e?e.nombreEs:(c||""); };

  const filas = useMemo(()=>{
    const rows=[];
    // Documentos de clientes
    (clientes||[]).forEach(c=>{
      (c.documentos||[]).forEach(d=>{
        rows.push({ id:`cli-${c.id}-${d.id||d.tipo}`, tipo:d.tipo||"Documento", url:d.url||"", nombre:d.nombre, fecha:d.fecha, vencimiento:d.vencimiento,
          entidadTipo:"Cliente", entidadLabel:c.nombre, cliente:c.nombre, temporada:"", especie:"" });
      });
    });
    // Documentos COMEX + QC de embarques
    (embarques||[]).forEach(oe=>{
      const cli=clientes.find(c=>c.id===oe.clienteId)?.nombre||"—";
      const esp=espName(oe.especieCodigo);
      (oe.carpetaComex?.docs||[]).forEach(d=>{
        if(!(d.url||d.tipo)) return;
        rows.push({ id:`oe-${oe.id}-${d.id||d.tipo}`, tipo:d.tipo||"Documento", url:d.url||"", nombre:d.nombre, fecha:d.fechaCarga,
          entidadTipo:"Embarque", entidadLabel:oe.numero||oe.numeroContenedor||"OE", oe, cliente:cli, temporada:oe.temporada||"", especie:esp });
      });
      (oe.carpetaComex?.qcDestino?.docsQC||[]).forEach(d=>{
        if(!d.url) return;
        rows.push({ id:`qc-${oe.id}-${d.id}`, tipo:d.nombre?`QC · ${d.nombre}`:"QC Destino", url:d.url, nombre:d.nombre, fecha:d.fecha,
          entidadTipo:"Embarque", entidadLabel:oe.numero||"OE", oe, cliente:cli, temporada:oe.temporada||"", especie:esp });
      });
    });
    return rows.map(r=>{
      const adjunto = esArchivoSubido(r.url);
      const estado = adjunto ? "cargado" : (r.url ? "recarga" : "pendiente");
      const vencido = r.vencimiento && r.vencimiento < hoy;
      return { ...r, adjunto, estado, vencido };
    });
  },[clientes, embarques, especies, hoy]);

  const tiposExistentes = [...new Set(filas.map(d=>d.tipo).filter(Boolean))].sort();
  const qq = q.trim().toLowerCase();
  const filtrados = useMemo(()=>filas.filter(d=>{
    if(fEntidad && d.entidadTipo!==fEntidad) return false;
    if(fTipo && d.tipo!==fTipo) return false;
    if(fEstado==="cargado"   && d.estado!=="cargado") return false;
    if(fEstado==="recarga"   && d.estado!=="recarga") return false;
    if(fEstado==="pendiente" && d.estado!=="pendiente") return false;
    if(fEstado==="vencido"   && !d.vencido) return false;
    if(qq){ const hay=`${d.tipo} ${d.entidadLabel} ${d.cliente} ${d.especie} ${d.temporada}`.toLowerCase(); if(!hay.includes(qq)) return false; }
    return true;
  }).sort((a,b)=>{
    // primero los que requieren atención (recarga / vencidos)
    const wa=(a.estado==="recarga"||a.vencido)?0:1, wb=(b.estado==="recarga"||b.vencido)?0:1;
    return wa-wb || String(b.fecha||"").localeCompare(String(a.fecha||""));
  }),[filas, fEntidad, fTipo, fEstado, qq]);

  const nRecarga = filas.filter(d=>d.estado==="recarga").length;
  const badge=(estado,vencido)=>{
    if(vencido) return {t:"⚠ Vencido", c:C.accent};
    if(estado==="cargado") return {t:"✓ Cargado", c:C.green};
    if(estado==="recarga") return {t:"⚠ Requiere recarga", c:C.warning};
    return {t:"Pendiente", c:C.muted2};
  };
  const td={padding:"8px 12px", borderTop:`1px solid ${C.border}`, verticalAlign:"middle"};

  // Cobertura documental COMEX (obligatorios PL/Full Set/QC) por embarque,
  // analizable por temporada/cliente/exportador/especie/estado documental.
  const [docView, setDocView] = useState("biblioteca");   // biblioteca | cobertura
  const embActivos = (embarques||[]).filter(o=>(o.estado||"borrador")!=="cancelado");
  const faltantesDe = (o)=>{ const docs=o.carpetaComex?.docs||[]; return DOCS_COMEX_OBLIG.filter(t=>!docs.some(d=>d.tipo===t && esArchivoSubido(d.url))); };
  const embCov = embActivos.filter(o=>{
    if(cTemp && (o.temporada||"")!==cTemp) return false;
    if(cCli  && (o.clienteId||"")!==cCli)  return false;
    if(cExp  && (o.exportadoraId||"")!==cExp) return false;
    if(cEsp  && (o.especieCodigo||"")!==cEsp) return false;
    return true;
  });
  const embCovRows = embCov.map(o=>{ const falt=faltantesDe(o); return {o, falt, completo:falt.length===0}; });
  const embCompletos = embCovRows.filter(x=>x.completo).length;
  const embIncompletos = embCovRows.filter(x=>!x.completo);
  const covPct = embCov.length ? Math.round(embCompletos/embCov.length*100) : 0;
  const covRowsShown = cEstado==="completos" ? embCovRows.filter(x=>x.completo) : cEstado==="incompletos" ? embIncompletos : embCovRows;
  const tempsCov = [...new Set(embActivos.map(o=>o.temporada).filter(Boolean))].sort().reverse();

  return (
    <div>
      {/* Toggle biblioteca / cobertura */}
      <div style={{display:"flex", gap:6, marginBottom:12}}>
        {[["biblioteca","📚 Biblioteca"],["cobertura","✅ Cobertura documental"]].map(([k,l])=>(
          <button key={k} onClick={()=>setDocView(k)} style={{...btnSt(docView===k?C.blue:C.muted, docView!==k), fontSize:12, padding:"7px 14px"}}>{l}</button>
        ))}
      </div>

      {docView==="cobertura" ? (
        <div>
          {/* Filtros de cobertura */}
          <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
            <select value={cTemp} onChange={e=>setCTemp(e.target.value)} style={{...inputSt,maxWidth:150}}><option value="">Toda temporada</option>{tempsCov.map(t=><option key={t} value={t}>{t}</option>)}</select>
            <SelectBuscable value={cCli} onChange={setCCli} placeholder="🔍 Todos los clientes" style={{...inputSt,maxWidth:180}} options={clientes.filter(c=>c.activo!==false).slice().sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||"")).map(c=>({value:c.id,label:c.nombre}))}/>
            <SelectBuscable value={cExp} onChange={setCExp} placeholder="🔍 Todas las exportadoras" style={{...inputSt,maxWidth:180}} options={exportadoras.filter(e=>e.activo!==false).slice().sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||"")).map(e=>({value:e.id,label:e.nombre}))}/>
            <SelectBuscable value={cEsp} onChange={setCEsp} placeholder="🔍 Todas las especies" style={{...inputSt,maxWidth:160}} options={especies.slice().sort((a,b)=>(a.nombreEs||"").localeCompare(b.nombreEs||"")).map(e=>({value:e.codigo,label:e.nombreEs}))}/>
            <select value={cEstado} onChange={e=>setCEstado(e.target.value)} style={{...inputSt,maxWidth:150}}><option value="incompletos">⚠ Incompletos</option><option value="completos">✓ Completos</option><option value="todos">Todos</option></select>
            {(cTemp||cCli||cExp||cEsp) && <button onClick={()=>{setCTemp("");setCCli("");setCExp("");setCEsp("");}} style={{...btnSt(C.muted,true),fontSize:11}}>✕ Limpiar</button>}
          </div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:12, marginBottom:16}}>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 15px"}}><div style={{fontSize:10,color:C.muted,fontWeight:600,textTransform:"uppercase"}}>Documentación completa</div><div style={{fontSize:22,fontWeight:800,color:covPct===100?C.green:C.text,marginTop:3}}>{embCompletos}/{embCov.length}</div><div style={{fontSize:11,color:C.muted}}>embarques ({covPct}%)</div></div>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 15px"}}><div style={{fontSize:10,color:C.muted,fontWeight:600,textTransform:"uppercase"}}>Con documentos faltantes</div><div style={{fontSize:22,fontWeight:800,color:embIncompletos.length>0?C.warning:C.green,marginTop:3}}>{embIncompletos.length}</div><div style={{fontSize:11,color:C.muted}}>embarques (con estos filtros)</div></div>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 15px"}}><div style={{fontSize:10,color:C.muted,fontWeight:600,textTransform:"uppercase"}}>Rutas locales a resubir</div><div style={{fontSize:22,fontWeight:800,color:nRecarga>0?C.warning:C.green,marginTop:3}}>{nRecarga}</div><div style={{fontSize:11,color:C.muted}}>documentos (total)</div></div>
          </div>
          <div style={{fontSize:11,color:C.muted2,marginBottom:8}}>Obligatorios COMEX (config): {DOCS_COMEX_OBLIG.join(", ")}. La regla de bloqueo por transición aún no está configurada — solo semáforo/cobertura.</div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5,minWidth:760}}>
              <thead><tr style={{background:C.card2,color:C.muted,textAlign:"left"}}>
                <th style={{padding:"8px 12px"}}>N° OE</th><th style={{padding:"8px 12px"}}>Cliente</th><th style={{padding:"8px 12px"}}>Exportador</th><th style={{padding:"8px 12px"}}>Especie</th><th style={{padding:"8px 12px"}}>Temporada</th><th style={{padding:"8px 12px"}}>Documentación</th><th style={{padding:"8px 12px",textAlign:"right"}}></th>
              </tr></thead>
              <tbody>
                {covRowsShown.length===0 && <tr><td colSpan={7} style={{padding:24,textAlign:"center",color:C.muted2,fontSize:12}}>{cEstado==="incompletos"?"✓ Ningún embarque incompleto con estos filtros.":"Sin embarques con estos filtros."}</td></tr>}
                {covRowsShown.map(({o,falt,completo})=>{ const esp=especies.find(e=>e.codigo===o.especieCodigo); const cli=clientes.find(c=>c.id===o.clienteId); const ex=exportadoras.find(e=>e.id===o.exportadoraId);
                  return <tr key={o.id}>
                    <td style={{...td,fontFamily:"monospace",color:C.blue,whiteSpace:"nowrap"}}>{o.numero||"—"}</td>
                    <td style={{...td,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:160}}>{cli?.nombre||"—"}</td>
                    <td style={{...td,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:160}}>{ex?.nombre||"—"}</td>
                    <td style={{...td,whiteSpace:"nowrap"}}>{esp?`${esp.icono||""} ${esp.nombreEs}`:(o.especieCodigo||"—")}</td>
                    <td style={{...td,whiteSpace:"nowrap"}}>{o.temporada||"—"}</td>
                    <td style={{...td}}>{completo ? <span style={{fontSize:9,padding:"2px 8px",borderRadius:8,background:`${C.green}22`,color:C.green,border:`1px solid ${C.green}55`,fontWeight:700}}>✓ Completo</span> : falt.map(f=><span key={f} style={{fontSize:9,marginRight:4,padding:"2px 7px",borderRadius:8,background:`${C.warning}22`,color:C.warning,border:`1px solid ${C.warning}55`,fontWeight:700,whiteSpace:"nowrap"}}>⚠ {f}</span>)}</td>
                    <td style={{...td,textAlign:"right"}}>{onVerEmbarque && <button onClick={()=>onVerEmbarque(o)} style={{...btnSt(C.blue,true),padding:"3px 8px",fontSize:10}}>→ Ver embarque</button>}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
      <div>
      {nRecarga>0 && (
        <div style={{background:`${C.warning}11`, border:`1px solid ${C.warning}44`, borderRadius:10, padding:"10px 14px", marginBottom:14, fontSize:12, color:C.warning}}>
          ⚠ {nRecarga} documento{nRecarga>1?"s":""} con ruta local del PC (no accesible por otros usuarios) — requiere{nRecarga>1?"n":""} volver a subirse al storage. Filtra por "Requiere recarga".
        </div>
      )}

      {/* Filtros / búsqueda */}
      <div style={{display:"flex", gap:8, marginBottom:14, flexWrap:"wrap", alignItems:"center"}}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar documento, entidad, cliente, especie…" style={{...inputSt, flex:"1 1 240px", maxWidth:320}}/>
        <select value={fEntidad} onChange={e=>setFEntidad(e.target.value)} style={{...inputSt, maxWidth:150}}>
          <option value="">Toda entidad</option>
          <option value="Embarque">🚢 Embarque</option>
          <option value="Cliente">👥 Cliente</option>
        </select>
        <select value={fTipo} onChange={e=>setFTipo(e.target.value)} style={{...inputSt, maxWidth:180}}>
          <option value="">— Todos los tipos —</option>
          {tiposExistentes.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
        <select value={fEstado} onChange={e=>setFEstado(e.target.value)} style={{...inputSt, maxWidth:180}}>
          <option value="todos">Todos los estados</option>
          <option value="cargado">✓ Cargados</option>
          <option value="recarga">⚠ Requiere recarga</option>
          <option value="pendiente">Pendientes</option>
          <option value="vencido">Vencidos</option>
        </select>
        <span style={{fontSize:11, color:C.muted}}>{filtrados.length} de {filas.length}</span>
      </div>

      {filtrados.length === 0 ? (
        <div style={{padding:50, textAlign:"center", color:C.muted, fontSize:13, background:C.card, borderRadius:14}}>
          {filas.length === 0 ? "Aún no hay documentos en Frisku." : "Sin resultados con esos filtros."}
        </div>
      ) : (
        <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, overflowX:"auto"}}>
          <table style={{width:"100%", borderCollapse:"collapse", fontSize:11.5, minWidth:820}}>
            <thead><tr style={{background:C.card2, color:C.muted, textAlign:"left"}}>
              <th style={{padding:"8px 12px"}}>Documento</th>
              <th style={{padding:"8px 12px"}}>Entidad</th>
              <th style={{padding:"8px 12px"}}>Cliente</th>
              <th style={{padding:"8px 12px"}}>Especie</th>
              <th style={{padding:"8px 12px"}}>Temporada</th>
              <th style={{padding:"8px 12px", textAlign:"center"}}>Estado</th>
              <th style={{padding:"8px 12px", textAlign:"right"}}>Acciones</th>
            </tr></thead>
            <tbody>
              {filtrados.map(d=>{
                const b=badge(d.estado, d.vencido);
                return (
                  <tr key={d.id}>
                    <td style={{...td, fontWeight:600, whiteSpace:"nowrap"}}>{d.tipo}{d.vencimiento?<span style={{color:d.vencido?C.accent:C.muted2, fontWeight:400, marginLeft:6}}>· vence {d.vencimiento}</span>:null}</td>
                    <td style={{...td, whiteSpace:"nowrap"}}>{d.entidadTipo==="Embarque"?"🚢":"👥"} {d.entidadLabel}</td>
                    <td style={{...td, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:180}}>{d.cliente}</td>
                    <td style={{...td, whiteSpace:"nowrap"}}>{d.especie||"—"}</td>
                    <td style={{...td, whiteSpace:"nowrap"}}>{d.temporada||"—"}</td>
                    <td style={{...td, textAlign:"center"}}><span style={{fontSize:9, padding:"2px 8px", borderRadius:10, background:`${b.c}22`, color:b.c, border:`1px solid ${b.c}44`, fontWeight:700, whiteSpace:"nowrap"}}>{b.t}</span></td>
                    <td style={{...td, textAlign:"right", whiteSpace:"nowrap"}}>
                      {d.adjunto
                        ? <button onClick={()=>window.open(d.url,"_blank")} style={{...btnSt(C.teal,true), padding:"3px 8px", fontSize:10, marginRight:3}}>📎 Ver / descargar</button>
                        : <span style={{fontSize:10, color:d.estado==="recarga"?C.warning:C.muted2, marginRight:6}}>{d.estado==="recarga"?"⚠ recargar":"sin archivo"}</span>}
                      {d.entidadTipo==="Embarque" && onVerEmbarque && (
                        <button onClick={()=>onVerEmbarque(d.oe)} title="Ir al embarque" style={{...btnSt(C.blue,true), padding:"3px 8px", fontSize:10}}>→ Ver embarque</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTADORA FORM — editor con 3 secciones
// ═══════════════════════════════════════════════════════════════════
function ExportadoraForm({exportadora, especies, paises, ciudades, monedas, onGuardar, onCancelar}) {
  const [buf, setBuf] = useState(()=>JSON.parse(JSON.stringify(exportadora)));
  const [seccionAbierta, setSeccionAbierta] = useState("basico");

  const ciudadesSugeridas = useMemo(()=>{
    if(!Array.isArray(ciudades) || !ciudades.length) return [];
    if(!buf.paisCodigo) return ciudades;
    return ciudades.filter(c => c.paisCodigo === buf.paisCodigo);
  },[ciudades, buf.paisCodigo]);

  const setCampo = (k, v) => setBuf(prev => ({...prev, [k]:v}));
  const toggleEspecie = (codigo) => {
    setBuf(prev => {
      const arr = prev.especiesProduce || [];
      return {...prev, especiesProduce: arr.includes(codigo) ? arr.filter(c=>c!==codigo) : [...arr, codigo]};
    });
  };

  const setContacto = (idx, k, v) => {
    setBuf(prev => {
      const list = [...(prev.contactos||[])];
      list[idx] = {...list[idx], [k]:v};
      return {...prev, contactos:list};
    });
  };
  const addContacto = () => setBuf(prev => ({...prev, contactos:[...(prev.contactos||[]), {nombre:"", cargo:"", email:"", telefono:""}]}));
  const delContacto = (idx) => setBuf(prev => ({...prev, contactos:(prev.contactos||[]).filter((_,i)=>i!==idx)}));

  const handleGuardar = () => {
    if(!buf.nombre?.trim()) { alert("Nombre es requerido"); return; }
    onGuardar({...buf, fechaActualizacion: new Date().toISOString()});
  };

  const toggle = (id) => setSeccionAbierta(prev => prev === id ? "" : id);

  const especiesActivas = (buf.especiesProduce||[]);

  return (
    <div style={{background:`${C.teal}11`, padding:16, borderRadius:8, border:`1px solid ${C.teal}44`, marginBottom:14}}>
      <h3 style={{margin:"0 0 14px", color:C.teal, fontSize:14, display:"flex", alignItems:"center", gap:8}}>
        <span>{exportadora.id ? "✎" : "+"}</span>
        <span>{exportadora.id ? `Editando: ${buf.nombre || "(sin nombre)"}` : "Nueva exportadora"}</span>
      </h3>

      <Seccion id="basico" titulo="Datos básicos" icono="🏭" abierta={seccionAbierta==="basico"} onToggle={()=>toggle("basico")}>
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap:10}}>
          <div>
            <div style={lblSt}>Nombre *</div>
            <input value={buf.nombre||""} onChange={e=>setCampo("nombre", e.target.value)} placeholder="Allegria Foods..." style={inputSt}/>
          </div>
          <div>
            <div style={lblSt}>RUT / ID Fiscal</div>
            <input value={buf.rut||""} onChange={e=>setCampo("rut", e.target.value)} placeholder="76.123.456-7" style={inputSt}/>
          </div>
          <div>
            <div style={lblSt}>País</div>
            <select value={buf.paisCodigo||""} onChange={e=>setCampo("paisCodigo", e.target.value)} style={inputSt}>
              <option value="">— seleccionar —</option>
              {paises.map(p => <option key={p.codigo} value={p.codigo}>{p.flag} {p.nombreEs}</option>)}
            </select>
          </div>
          <div>
            <div style={lblSt}>Ciudad</div>
            <input
              value={buf.ciudad||""}
              onChange={e=>setCampo("ciudad", e.target.value)}
              list="ciudades-exportadora-list"
              placeholder={buf.paisCodigo ? "Empezá a tipear o elegí…" : "Selecciona país primero o tipea libre"}
              style={inputSt}
              autoComplete="off"
            />
            <datalist id="ciudades-exportadora-list">
              {ciudadesSugeridas.map(c => (
                <option key={c.codigo} value={c.nombre}>{c.paisCodigo}</option>
              ))}
            </datalist>
          </div>
          <div>
            <div style={lblSt}>Moneda principal</div>
            <select value={buf.monedaCodigo||"USD"} onChange={e=>setCampo("monedaCodigo", e.target.value)} style={inputSt}>
              {monedas.map(m => <option key={m.codigo} value={m.codigo}>{m.simbolo} {m.codigo} — {m.nombre}</option>)}
            </select>
          </div>
          <div>
            <div style={lblSt}>Estado</div>
            <select value={buf.activo===false?"no":"si"} onChange={e=>setCampo("activo", e.target.value==="si")} style={inputSt}>
              <option value="si">● Activo</option>
              <option value="no">○ Inactivo</option>
            </select>
          </div>
        </div>
        <div style={{marginTop:10}}>
          <div style={lblSt}>Dirección</div>
          <input value={buf.direccion||""} onChange={e=>setCampo("direccion", e.target.value)} placeholder="Av Principal 123" style={inputSt}/>
        </div>
        <div style={{marginTop:10}}>
          <div style={lblSt}>Certificaciones (separadas por coma)</div>
          <input value={buf.certificaciones||""} onChange={e=>setCampo("certificaciones", e.target.value)}
            placeholder="GlobalGAP, BRC, SMETA" style={inputSt}/>
        </div>
        <div style={{marginTop:10}}>
          <div style={lblSt}>Observaciones</div>
          <textarea value={buf.observ||""} onChange={e=>setCampo("observ", e.target.value)}
            rows={2} style={{...inputSt, resize:"vertical", fontFamily:"inherit"}}/>
        </div>
      </Seccion>

      <Seccion id="contactos" titulo={`Contactos (${(buf.contactos||[]).length})`} icono="👥" abierta={seccionAbierta==="contactos"} onToggle={()=>toggle("contactos")}>
        {(buf.contactos||[]).map((co, i) => (
          <div key={i} style={{display:"grid", gridTemplateColumns:"1.2fr 1fr 1.5fr 1fr 36px", gap:8, marginBottom:8}}>
            <input value={co.nombre||""} onChange={e=>setContacto(i,"nombre",e.target.value)} placeholder="Nombre" style={inputSt}/>
            <input value={co.cargo||""} onChange={e=>setContacto(i,"cargo",e.target.value)} placeholder="Cargo" style={inputSt}/>
            <input value={co.email||""} onChange={e=>setContacto(i,"email",e.target.value)} placeholder="email@x.com" type="email" style={inputSt}/>
            <input value={co.telefono||""} onChange={e=>setContacto(i,"telefono",e.target.value)} placeholder="Teléfono" style={inputSt}/>
            <button onClick={()=>delContacto(i)} style={{...btnSt(C.accent, true), padding:"4px 8px"}}>×</button>
          </div>
        ))}
        <button onClick={addContacto} style={btnSt(C.green, true)}>+ Agregar contacto</button>
      </Seccion>

      <Seccion id="especies" titulo={`Especies que produce (${especiesActivas.length}/${especies.length})`} icono="🍒" abierta={seccionAbierta==="especies"} onToggle={()=>toggle("especies")}>
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(150px, 1fr))", gap:6}}>
          {especies.map(e => {
            const activa = especiesActivas.includes(e.codigo);
            return (
              <label key={e.codigo} style={{
                display:"flex", alignItems:"center", gap:6, padding:"6px 10px",
                background: activa ? `${C.teal}22` : C.card,
                border:`1px solid ${activa?C.teal:C.border}`,
                borderRadius:6, cursor:"pointer", fontSize:11,
              }}>
                <input type="checkbox" checked={activa} onChange={()=>toggleEspecie(e.codigo)}/>
                <span style={{fontSize:14}}>{e.icono}</span>
                <span style={{color:C.text}}>{e.nombreEs}</span>
              </label>
            );
          })}
        </div>
        {especies.length === 0 && (
          <div style={{padding:14, color:C.muted, fontSize:11}}>
            Sin especies en el maestro. Ve a Maestros → Especies para cargarlas.
          </div>
        )}
      </Seccion>

      <div style={{display:"flex", gap:8, justifyContent:"flex-end", marginTop:14}}>
        <button onClick={onCancelar} style={btnSt(C.muted, true)}>Cancelar</button>
        <button onClick={handleGuardar} style={btnSt(C.green)}>✓ Guardar exportadora</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTADORA CARD — vista compacta
// ═══════════════════════════════════════════════════════════════════
function ExportadoraCard({exportadora, especies, paises, monedas, onEditar, onEliminar, canEdit}) {
  const pais = paises.find(p => p.codigo === exportadora.paisCodigo);
  const monedaSimb = monedas.find(m => m.codigo === exportadora.monedaCodigo)?.simbolo || exportadora.monedaCodigo;
  const especiesNombres = (exportadora.especiesProduce||[])
    .map(c => especies.find(e=>e.codigo===c))
    .filter(Boolean);
  const certifs = (exportadora.certificaciones||"").split(",").map(s=>s.trim()).filter(Boolean);

  return (
    <div style={{
      background:C.card2, padding:14, borderRadius:10,
      border:`1px solid ${exportadora.activo===false?C.border:C.teal+"66"}`,
      boxShadow:C.shadow,
      opacity: exportadora.activo===false ? 0.65 : 1,
    }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, marginBottom:10}}>
        <div style={{flex:1}}>
          <div style={{fontSize:14, fontWeight:700, color:C.text, display:"flex", alignItems:"center", gap:8}}>
            {exportadora.activo===false && <span style={{fontSize:9, padding:"2px 6px", borderRadius:4, background:C.border, color:C.muted}}>INACTIVO</span>}
            {exportadora.nombre}
          </div>
          <div style={{fontSize:11, color:C.muted, marginTop:3, display:"flex", gap:8, flexWrap:"wrap"}}>
            {pais && <span>{pais.flag} {exportadora.ciudad ? `${exportadora.ciudad}, ` : ""}{pais.nombreEs}</span>}
            {exportadora.rut && <span>· {exportadora.rut}</span>}
            <span>· 💱 {monedaSimb}</span>
          </div>
        </div>
        {canEdit && (
          <div style={{display:"flex", gap:6}}>
            <button onClick={onEditar} style={{...btnSt(C.blue, true), padding:"4px 10px"}}>✎ Editar</button>
            <button onClick={onEliminar} style={{...btnSt(C.accent, true), padding:"4px 10px"}}>×</button>
          </div>
        )}
      </div>

      {especiesNombres.length > 0 && (
        <div style={{display:"flex", flexWrap:"wrap", gap:4, marginBottom:certifs.length?6:0}}>
          {especiesNombres.map(e => (
            <span key={e.codigo} style={{
              padding:"2px 8px", borderRadius:4, fontSize:10,
              background:`${C.teal}22`, color:C.teal, border:`1px solid ${C.teal}44`
            }}>{e.icono} {e.nombreEs}</span>
          ))}
        </div>
      )}

      {certifs.length > 0 && (
        <div style={{display:"flex", flexWrap:"wrap", gap:4, marginTop:6}}>
          {certifs.map((c, i) => (
            <span key={i} style={{
              padding:"2px 8px", borderRadius:4, fontSize:10,
              background:`${C.purple}22`, color:C.purple, border:`1px solid ${C.purple}44`
            }}>✓ {c}</span>
          ))}
        </div>
      )}

      {(exportadora.contactos||[]).length > 0 && (
        <div style={{marginTop:10, paddingTop:10, borderTop:`1px solid ${C.border}`, fontSize:11, color:C.muted}}>
          👥 {(exportadora.contactos||[]).length} contacto{exportadora.contactos.length>1?"s":""}
          {exportadora.contactos[0]?.nombre && <span> · <span style={{color:C.text}}>{exportadora.contactos[0].nombre}</span>
            {exportadora.contactos[0].cargo && <span style={{color:C.muted}}> ({exportadora.contactos[0].cargo})</span>}
          </span>}
        </div>
      )}

      {exportadora.observ && (
        <div style={{marginTop:8, paddingTop:8, borderTop:`1px solid ${C.border}`, fontSize:11, color:C.muted, fontStyle:"italic"}}>
          {exportadora.observ}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// BUSINESS CLOSURE FORM
// ═══════════════════════════════════════════════════════════════════
function ClosureForm({closure, exportadoras, clientes, especies, tiposEmbalaje, monedas, temporadas, onGuardar, onCancelar}) {
  const [buf, setBuf] = useState(()=>JSON.parse(JSON.stringify(closure)));
  const setCampo = (k, v) => setBuf(prev=>({...prev, [k]:v}));

  const setCajas = (fmtCodigo, val) => setBuf(prev=>{
    const cpf = {...(prev.cajasPorFormato||{})};
    const n = Number(val);
    if(!val || n===0) delete cpf[fmtCodigo]; else cpf[fmtCodigo]=n;
    return {...prev, cajasPorFormato:cpf};
  });

  const especieObj   = especies.find(e=>e.codigo===buf.especieCodigo);
  const formatosDisp = tiposEmbalaje.filter(t=>
    t.especieCodigo===buf.especieCodigo || (especieObj && t.especie===especieObj.nombreEs)
  );
  const totalCajas = Object.values(buf.cajasPorFormato||{}).reduce((s,v)=>s+Number(v||0),0);

  const handleGuardar = () => {
    if(!buf.exportadoraId)   { alert("Selecciona exportadora"); return; }
    if(!buf.clienteId)       { alert("Selecciona cliente"); return; }
    if(!buf.especieCodigo)   { alert("Selecciona especie"); return; }
    if(!buf.temporada?.trim()){ alert("Ingresa la temporada"); return; }
    if(totalCajas===0)       { alert("Ingresa cajas en al menos un formato"); return; }
    onGuardar({...buf, fechaActualizacion:new Date().toISOString()});
  };

  return (
    <div style={{background:`${C.blue}11`, padding:16, borderRadius:8, border:`1px solid ${C.blue}44`, marginBottom:14}}>
      <h3 style={{margin:"0 0 14px", color:C.blue, fontSize:14, display:"flex", alignItems:"center", gap:8}}>
        <span>{closure.id?"✎":"+"}</span>
        <span>{closure.id?"Editando Business Closure":"Nuevo Business Closure"}</span>
      </h3>

      {/* Temporada · Código · Estado */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 200px 140px", gap:10, marginBottom:10}}>
        <div>
          <div style={lblSt}>Temporada *</div>
          <select value={buf.temporada||""} style={inputSt}
            onChange={e=>{
              const val = e.target.value;
              const [a1, a2] = val.split("-");
              const inicio = a1 ? `${a1}-07-01` : "";
              const fin    = a2 ? `${a2}-06-30` : "";
              setBuf(prev=>({...prev, temporada:val,
                fechaInicio: prev.fechaInicio||inicio,
                fechaFin:    prev.fechaFin   ||fin,
              }));
            }}>
            <option value="">— seleccionar —</option>
            {(temporadas||[]).map(t=><option key={t} value={t}>Temporada {t}</option>)}
          </select>
        </div>
        <div>
          <div style={lblSt}>Código (opcional)</div>
          <input value={buf.codigo||""} onChange={e=>setCampo("codigo",e.target.value)}
            placeholder="BC-CHE-2026-001" style={inputSt}/>
        </div>
        <div>
          <div style={lblSt}>Estado</div>
          <select value={buf.estado||"activo"} onChange={e=>setCampo("estado",e.target.value)} style={inputSt}>
            <option value="activo">● Activo</option>
            <option value="cerrado">✓ Cerrado</option>
            <option value="cancelado">✗ Cancelado</option>
          </select>
        </div>
      </div>

      {/* Exportadora · Cliente */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10}}>
        <div>
          <div style={lblSt}>Exportadora *</div>
          <ExportadoraPicker value={buf.exportadoraId} exportadoras={exportadoras} onChange={id=>setCampo("exportadoraId",id)} style={inputSt}/>
        </div>
        <div>
          <div style={lblSt}>Cliente *</div>
          <select value={buf.clienteId||""} onChange={e=>setCampo("clienteId",e.target.value)} style={inputSt}>
            <option value="">— seleccionar —</option>
            {clientes.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
      </div>

      {/* Especie · Precio · Moneda · Condiciones */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 110px 120px 130px", gap:10, marginBottom:10}}>
        <div>
          <div style={lblSt}>Especie *</div>
          <select value={buf.especieCodigo||""}
            onChange={e=>setBuf(prev=>({...prev, especieCodigo:e.target.value, cajasPorFormato:{}}))}
            style={inputSt}>
            <option value="">— seleccionar —</option>
            {especiesConFormatos(especies, tiposEmbalaje, buf.especieCodigo).map(e=><option key={e.codigo} value={e.codigo}>{e.icono} {e.nombreEs}</option>)}
          </select>
        </div>
        <div>
          <div style={lblSt}>Precio ref.</div>
          <input type="number" step="0.01" value={buf.precioRef??""} placeholder="8.50"
            onChange={e=>setCampo("precioRef", e.target.value===""?null:Number(e.target.value))}
            style={inputSt}/>
        </div>
        <div>
          <div style={lblSt}>Moneda</div>
          <select value={buf.monedaCodigo||"USD"} onChange={e=>setCampo("monedaCodigo",e.target.value)} style={inputSt}>
            {monedas.map(m=><option key={m.codigo} value={m.codigo}>{m.simbolo} {m.codigo}</option>)}
          </select>
        </div>
        <div>
          <div style={lblSt}>Condiciones</div>
          <select value={buf.condiciones||"FOB"} onChange={e=>setCampo("condiciones",e.target.value)} style={inputSt}>
            {["FOB","CIF","CFR","EXW","DAP"].map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Fechas */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10}}>
        <div>
          <div style={lblSt}>Inicio temporada</div>
          <input type="date" value={buf.fechaInicio||""} onChange={e=>setCampo("fechaInicio",e.target.value)} style={inputSt}/>
        </div>
        <div>
          <div style={lblSt}>Fin temporada</div>
          <input type="date" value={buf.fechaFin||""} onChange={e=>setCampo("fechaFin",e.target.value)} style={inputSt}/>
        </div>
      </div>

      {/* Cajas por formato */}
      {buf.especieCodigo && (
        <div style={{marginBottom:10}}>
          <div style={{...lblSt, marginBottom:6, display:"flex", alignItems:"center", gap:10}}>
            Cajas comprometidas por formato
            {totalCajas>0 && <span style={{color:C.green, fontWeight:700, fontSize:11, textTransform:"none"}}>
              Total: {totalCajas.toLocaleString("es-CL")} cajas
            </span>}
          </div>
          {formatosDisp.length===0 ? (
            <div style={{color:C.muted, fontSize:11, fontStyle:"italic", padding:"8px 12px", background:C.card, borderRadius:6}}>
              Sin formatos para esta especie. Agrégalos en Maestros → Tipos de Embalaje.
            </div>
          ) : (
            <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(175px, 1fr))", gap:8}}>
              {formatosDisp.map(fmt=>{
                const val = (buf.cajasPorFormato||{})[fmt.codigo];
                return (
                  <div key={fmt.codigo} style={{background:C.card, padding:10, borderRadius:6, border:`1px solid ${val?C.blue:C.border}`}}>
                    <div style={{fontSize:11, color:C.text, fontWeight:600, marginBottom:2}}>{fmt.nombre}</div>
                    <div style={{fontSize:9, color:C.muted, marginBottom:6}}>{fmt.codigo}</div>
                    <input type="number" min="0" step="1" value={val??""} placeholder="cajas"
                      onChange={e=>setCajas(fmt.codigo, e.target.value)} style={inputSt}/>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Observaciones */}
      <div style={{marginBottom:14}}>
        <div style={lblSt}>Observaciones</div>
        <textarea value={buf.observ||""} onChange={e=>setCampo("observ",e.target.value)}
          rows={2} style={{...inputSt, resize:"vertical", fontFamily:"inherit"}}/>
      </div>

      <div style={{display:"flex", gap:8, justifyContent:"flex-end"}}>
        <button onClick={onCancelar} style={btnSt(C.muted,true)}>Cancelar</button>
        <button onClick={handleGuardar} style={btnSt(C.green)}>✓ Guardar Business Closure</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// BUSINESS CLOSURE CARD
// ═══════════════════════════════════════════════════════════════════
function ClosureCard({closure, exportadoras, clientes, especies, tiposEmbalaje, monedas, onEditar, onEliminar, canEdit}) {
  const exportadora = exportadoras.find(e=>e.id===closure.exportadoraId);
  const cliente     = clientes.find(c=>c.id===closure.clienteId);
  const especie     = especies.find(e=>e.codigo===closure.especieCodigo);
  const moneda      = monedas.find(m=>m.codigo===closure.monedaCodigo);
  const totalCajas  = Object.values(closure.cajasPorFormato||{}).reduce((s,v)=>s+Number(v||0),0);

  const formatosConCajas = Object.entries(closure.cajasPorFormato||{})
    .map(([cod, cajas])=>({ fmt: tiposEmbalaje.find(t=>t.codigo===cod)||{nombre:cod,codigo:cod}, cajas:Number(cajas) }))
    .filter(x=>x.cajas>0);

  const estadoColor = {activo:C.green, cerrado:C.blue, cancelado:C.muted}[closure.estado||"activo"] || C.muted;
  const estadoLabel = {activo:"● Activo", cerrado:"✓ Cerrado", cancelado:"✗ Cancelado"}[closure.estado||"activo"];

  return (
    <div style={{
      background:C.card2, padding:14, borderRadius:10,
      border:`1px solid ${closure.estado==="activo"?C.blue+"55":C.border}`,
      opacity: closure.estado==="cancelado"?0.6:1,
    }}>
      {/* Exportadora → Cliente */}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, marginBottom:10}}>
        <div style={{flex:1}}>
          <div style={{fontSize:13, fontWeight:700, color:C.text, display:"flex", alignItems:"center", gap:6, flexWrap:"wrap"}}>
            <span>{exportadora?.nombre||<em style={{color:C.muted}}>—</em>}</span>
            <span style={{color:C.muted, fontSize:11, fontWeight:400}}>→</span>
            <span>{cliente?.nombre||<em style={{color:C.muted}}>—</em>}</span>
          </div>
          <div style={{fontSize:11, color:C.muted, marginTop:3, display:"flex", gap:8, flexWrap:"wrap", alignItems:"center"}}>
            {especie && <span>{especie.icono} {especie.nombreEs}</span>}
            <span>· {closure.temporada}</span>
            {closure.codigo && <span style={{color:C.muted2}}>· {closure.codigo}</span>}
          </div>
        </div>
        <div style={{display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4}}>
          <span style={{fontSize:9, padding:"2px 8px", borderRadius:4, background:`${estadoColor}22`, color:estadoColor, border:`1px solid ${estadoColor}44`, fontWeight:700}}>
            {estadoLabel}
          </span>
          {canEdit && (
            <div style={{display:"flex", gap:4, marginTop:2}}>
              <button onClick={onEditar} style={{...btnSt(C.blue,true), padding:"3px 8px", fontSize:10}}>✎</button>
              <button onClick={onEliminar} style={{...btnSt(C.accent,true), padding:"3px 8px", fontSize:10}}>×</button>
            </div>
          )}
        </div>
      </div>

      {/* Formatos y cajas */}
      {formatosConCajas.length>0 && (
        <div style={{display:"flex", flexWrap:"wrap", gap:4, marginBottom:10}}>
          {formatosConCajas.map(({fmt,cajas})=>(
            <span key={fmt.codigo} style={{padding:"3px 10px", borderRadius:4, fontSize:10, background:`${C.teal}22`, color:C.teal, border:`1px solid ${C.teal}33`}}>
              {fmt.nombre}: {cajas.toLocaleString("es-CL")} cjs
            </span>
          ))}
        </div>
      )}

      {/* KPIs */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, padding:"8px 0", borderTop:`1px solid ${C.border}`, fontSize:11}}>
        <div>
          <div style={{color:C.muted, fontSize:9, textTransform:"uppercase"}}>Total cajas</div>
          <div style={{color:C.text, fontWeight:700, fontFamily:"monospace"}}>{totalCajas.toLocaleString("es-CL")}</div>
        </div>
        <div>
          <div style={{color:C.muted, fontSize:9, textTransform:"uppercase"}}>Precio ref.</div>
          <div style={{color:C.text, fontWeight:700, fontFamily:"monospace"}}>
            {closure.precioRef!=null ? `${moneda?.simbolo||closure.monedaCodigo} ${Number(closure.precioRef).toFixed(2)}` : "—"}
          </div>
        </div>
        <div>
          <div style={{color:C.muted, fontSize:9, textTransform:"uppercase"}}>Condiciones</div>
          <div style={{color:C.blue, fontWeight:700}}>{closure.condiciones||"—"}</div>
        </div>
      </div>

      {(closure.fechaInicio||closure.fechaFin) && (
        <div style={{fontSize:10, color:C.muted, marginTop:6, display:"flex", gap:10}}>
          {closure.fechaInicio && <span>Inicio: {closure.fechaInicio}</span>}
          {closure.fechaFin    && <span>Fin: {closure.fechaFin}</span>}
        </div>
      )}
      {closure.observ && (
        <div style={{marginTop:8, fontSize:11, color:C.muted, fontStyle:"italic", borderTop:`1px solid ${C.border}`, paddingTop:6}}>
          {closure.observ}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PROGRAMA COMERCIAL — helpers y componentes
// ═══════════════════════════════════════════════════════════════════

// Retorna el lunes de la semana de una fecha YYYY-MM-DD
function getMondayStr(dateStr) {
  if(!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0,10);
}

// "2026-05-11" → "lun 11 may 2026"
function formatFechaSemana(dateStr) {
  if(!dateStr) return "—";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("es-CL", {weekday:"short", day:"numeric", month:"short", year:"numeric"});
}

// N° de semana calendario ISO-8601 (lunes como primer día) de una fecha YYYY-MM-DD
function getSemanaISO(dateStr) {
  if(!dateStr) return null;
  const d = new Date(dateStr + "T12:00:00");
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;          // domingo=7
  t.setUTCDate(t.getUTCDate() + 4 - day);  // jueves de la semana ISO
  const anio = t.getUTCFullYear();
  const inicioAnio = new Date(Date.UTC(anio, 0, 1));
  const semana = Math.ceil((((t - inicioAnio) / 86400000) + 1) / 7);
  return {semana, anio};
}

// "2026-W20" formateado para mostrar
function formatSemanaISO(dateStr) {
  const w = getSemanaISO(dateStr);
  return w ? `S${String(w.semana).padStart(2,"0")} · ${w.anio}` : "";
}

// Inverso de getSemanaISO: (semana ISO, año ISO) → lunes de esa semana (YYYY-MM-DD).
// Jan 4 siempre cae en la semana 1; se toma el lunes de esa semana y se suman
// las semanas que faltan.
function lunesDeSemanaISO(semana, anio) {
  const s = Number(semana), y = Number(anio);
  if(!s || !y) return "";
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const lunesS1 = new Date(jan4); lunesS1.setUTCDate(jan4.getUTCDate() - day + 1);
  const lunes = new Date(lunesS1); lunes.setUTCDate(lunesS1.getUTCDate() + (s - 1) * 7);
  return lunes.toISOString().slice(0, 10);
}

// Rango legible de una semana a partir de su lunes: "03 – 09 ago 2026"
function rangoSemana(lunesStr) {
  if(!lunesStr) return "";
  const lun = new Date(lunesStr + "T12:00:00");
  const dom = new Date(lun); dom.setDate(lun.getDate() + 6);
  const fmtDia = (d, conMes) => d.toLocaleDateString("es-CL", conMes ? {day:"numeric", month:"short", year:"numeric"} : {day:"numeric"});
  return `${fmtDia(lun, false)} – ${fmtDia(dom, true)}`;
}

// Token identificador de una entidad a partir de su código, quitando el
// prefijo de tipo (CNEE-, CLI-, NOT-M-, NOT-AIR-, NOT-, EXP-/_). Permite
// emparejar un cliente con sus notify guardados (ej. CNEE-IDEAL ↔ NOT-M-IDEAL).
function tokenEntidad(cod) {
  if(!cod) return "";
  let s = String(cod).trim().toUpperCase();
  s = s.replace(/^(CNEE|CLI|CONS)[-_]/, "");
  s = s.replace(/^NOT[-_](M|AIR|MARITIMO|AEREO)[-_]/, "");
  s = s.replace(/^NOT[-_]/, "");
  s = s.replace(/^EXP[-_]/, "");
  return s.trim();
}

// Mapea un registro de maestro_notify al objeto notify de la OE
function notifyDesdeMaestro(n) {
  return {
    nombre:    n.nombre || n.razonSocial || "",
    direccion: n.direccion || "",
    contacto:  [n.nombreContacto, n.fono].filter(Boolean).join(" · "),
  };
}

// Formulario para agregar/editar una semana del programa
function ProgramaSemanaForm({semana, closure, tiposEmbalaje, onGuardar, onCancelar}) {
  const [buf, setBuf] = useState(()=>{
    const b = JSON.parse(JSON.stringify(semana));
    // Compat: semana de ETD desde etd/fechaSemana/semanaNum viejos
    if(!b.etdSemanaNum || !b.etdSemanaAnio){
      const w = getSemanaISO(b.etd || b.fechaSemana);
      b.etdSemanaNum  = b.etdSemanaNum  || b.semanaNum  || (w?w.semana:undefined);
      b.etdSemanaAnio = b.etdSemanaAnio || b.semanaAnio || (w?w.anio:undefined);
    }
    // Compat: semana de ETA desde eta; si no hay, igual a la de ETD
    if(!b.etaSemanaNum || !b.etaSemanaAnio){
      const w = b.eta ? getSemanaISO(b.eta) : null;
      b.etaSemanaNum  = b.etaSemanaNum  || (w?w.semana:b.etdSemanaNum);
      b.etaSemanaAnio = b.etaSemanaAnio || (w?w.anio:b.etdSemanaAnio);
    }
    return b;
  });
  const setSemanaETD = (num, anio) => setBuf(prev=>({...prev,
    etdSemanaNum: num!=null ? Number(num) : prev.etdSemanaNum,
    etdSemanaAnio: anio!=null ? Number(anio) : prev.etdSemanaAnio }));
  const setSemanaETA = (num, anio) => setBuf(prev=>({...prev,
    etaSemanaNum: num!=null ? Number(num) : prev.etaSemanaNum,
    etaSemanaAnio: anio!=null ? Number(anio) : prev.etaSemanaAnio }));
  // Años ofrecidos: los de la temporada del closure (+ los ya elegidos).
  const aniosSemana = (()=>{
    const set = new Set();
    String(closure?.temporada||"").split("-").map(Number).forEach(y=>{ if(y) set.add(y); });
    if(buf.etdSemanaAnio) set.add(Number(buf.etdSemanaAnio));
    if(buf.etaSemanaAnio) set.add(Number(buf.etaSemanaAnio));
    if(!set.size){ const y=new Date().getFullYear(); set.add(y); set.add(y+1); }
    return Array.from(set).sort();
  })();
  const lunesETD = lunesDeSemanaISO(buf.etdSemanaNum, buf.etdSemanaAnio);
  const lunesETA = lunesDeSemanaISO(buf.etaSemanaNum, buf.etaSemanaAnio);
  const diasTransito = (lunesETD && lunesETA) ? Math.round((new Date(lunesETA)-new Date(lunesETD))/86400000) : null;

  const setCajas = (fmtCodigo, val) => setBuf(prev=>{
    const cpf = {...(prev.cajasPorFormato||{})};
    const n = Number(val);
    if(!val || n===0) delete cpf[fmtCodigo]; else cpf[fmtCodigo]=n;
    return {...prev, cajasPorFormato:cpf};
  });

  const formatosClosure = Object.keys(closure?.cajasPorFormato||{});
  const totalCajas = Object.values(buf.cajasPorFormato||{}).reduce((s,v)=>s+Number(v||0),0);

  const handleGuardar = () => {
    if(!lunesETD){ alert("Selecciona la semana de ETD (N° y año)"); return; }
    if(!lunesETA){ alert("Selecciona la semana de ETA (N° y año)"); return; }
    if(lunesETA < lunesETD){ alert("La semana de ETA no puede ser anterior a la de ETD"); return; }
    const esAereo = buf.tipoEmbarque==="aereo";
    const fclVal = esAereo ? 0 : (Number(buf.contenedoresFCL)||0);
    const palVal = esAereo ? (Number(buf.pallets)||0) : 0;
    if(totalCajas===0 && fclVal<=0 && palVal<=0){
      alert(esAereo ? "Ingresa cajas por formato o la cantidad de pallets" : "Ingresa cajas por formato o la cantidad de contenedores (FCL)");
      return;
    }
    onGuardar({...buf, fechaSemana:lunesETD,
      etdSemanaNum: Number(buf.etdSemanaNum)||null, etdSemanaAnio: Number(buf.etdSemanaAnio)||null,
      etaSemanaNum: Number(buf.etaSemanaNum)||null, etaSemanaAnio: Number(buf.etaSemanaAnio)||null,
      etd: lunesETD, eta: lunesETA,
      semanaNum:null, semanaAnio:null,  // campos viejos deprecados
      tipoEmbarque: buf.tipoEmbarque||"maritimo", contenedoresFCL: fclVal, pallets: palVal});
  };

  return (
    <div style={{background:`${C.teal}11`, padding:14, borderRadius:8, border:`1px solid ${C.teal}44`, marginBottom:10}}>
      <h4 style={{margin:"0 0 12px", color:C.teal, fontSize:13, display:"flex", alignItems:"center", gap:8}}>
        <span>{semana.id?"✎":"+"}</span>
        <span>{semana.id?"Editar semana":"Nueva semana de programa"}</span>
        <span style={{fontSize:10, color:C.muted, fontWeight:400}}>
          — Semana de despacho (ETD) y de llegada (ETA)
        </span>
      </h4>

      {(() => {
        const esAereo = buf.tipoEmbarque==="aereo";
        const weekSel = (id, lbl, num, anio, setter, lunes, color) => (
          <div style={{flex:"1 1 300px", background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 10px"}}>
            <div style={{...lblSt, color}}>{lbl} *</div>
            <div style={{display:"flex", gap:8}}>
              <div style={{flex:"1 1 auto"}}>
                <WeekNumPicker listId="wk-nums" value={num||undefined} onChange={n=>setter(n??null, null)}
                  style={{...inputSt, width:"100%", textAlign:"right", fontFamily:"monospace"}}/>
              </div>
              <select value={anio||""} style={{...inputSt, flex:"0 1 92px"}} onChange={e=>setter(null, e.target.value||null)}>
                <option value="">Año —</option>
                {aniosSemana.map(y=><option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div style={{fontSize:11, color: lunes?color:C.muted, fontWeight:600, marginTop:5}}>
              {lunes ? `📅 ${formatSemanaISO(lunes)} · ${rangoSemana(lunes)}` : "Escribe o elige el N° de semana y el año"}
            </div>
          </div>
        );
        return (<>
        {/* Vía + Estado + FCL/Pallets */}
        <div style={{display:"flex", flexWrap:"wrap", gap:10, marginBottom:10}}>
          <div style={{flex:"0 1 150px"}}>
            <div style={lblSt}>Vía *</div>
            <select value={buf.tipoEmbarque||"maritimo"} style={inputSt}
              onChange={e=>setBuf(prev=>({...prev, tipoEmbarque:e.target.value}))}>
              <option value="maritimo">🚢 Marítimo</option>
              <option value="aereo">✈ Aéreo</option>
            </select>
          </div>
          <div style={{flex:"0 1 150px"}}>
            <div style={lblSt}>Estado</div>
            <select value={buf.estado||"borrador"} style={inputSt}
              onChange={e=>setBuf(prev=>({...prev, estado:e.target.value}))}>
              <option value="borrador">◌ Borrador</option>
              <option value="confirmado">✓ Confirmado</option>
            </select>
          </div>
          {esAereo ? (
            <div style={{flex:"0 1 130px"}}>
              <div style={lblSt}>Pallets</div>
              <input type="number" min="0" step="1" placeholder="0" value={buf.pallets ?? ""}
                style={{...inputSt, textAlign:"right", fontFamily:"monospace"}}
                onChange={e=>setBuf(prev=>({...prev, pallets: e.target.value===""? "" : Number(e.target.value)}))}/>
              <div style={{fontSize:9, color:C.muted2, marginTop:3}}>aéreo · cajas abajo</div>
            </div>
          ) : (
            <div style={{flex:"0 1 140px"}}>
              <div style={lblSt}>Contenedores (FCL)</div>
              <input type="number" min="0" step="1" placeholder="0" value={buf.contenedoresFCL ?? ""}
                style={{...inputSt, textAlign:"right", fontFamily:"monospace"}}
                onChange={e=>setBuf(prev=>({...prev, contenedoresFCL: e.target.value===""? "" : Number(e.target.value)}))}/>
              <div style={{fontSize:9, color:C.muted2, marginTop:3}}>solo marítimo</div>
            </div>
          )}
        </div>

        {/* Semana ETD + Semana ETA */}
        <div style={{display:"flex", flexWrap:"wrap", gap:10, marginBottom:6}}>
          {weekSel("etd", "ETD · fecha despacho", buf.etdSemanaNum, buf.etdSemanaAnio, setSemanaETD, lunesETD, C.teal)}
          {weekSel("eta", "ETA · fecha llegada", buf.etaSemanaNum, buf.etaSemanaAnio, setSemanaETA, lunesETA, C.blue)}
          <datalist id="wk-nums">{Array.from({length:53},(_,i)=>i+1).map(n=><option key={n} value={`S${String(n).padStart(2,"0")}`}/>)}</datalist>
        </div>
        {diasTransito!=null && (
          <div style={{fontSize:11, color:C.muted, marginBottom:12}}>
            🕒 {Math.max(0, diasTransito)} días de tránsito ({Math.max(0, Math.round(diasTransito/7))} semana{Math.round(diasTransito/7)!==1?"s":""})
          </div>
        )}
        </>); })()}

      {/* Cajas por formato */}
      <div style={{marginBottom:12}}>
        <div style={lblSt}>Cajas por formato *</div>
        {formatosClosure.length === 0 ? (
          <div style={{color:C.muted, fontSize:11}}>El Business Closure no tiene formatos definidos.</div>
        ) : (
          <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:8}}>
            {formatosClosure.map(fmtCodigo=>{
              const fmtObj = tiposEmbalaje.find(t=>t.codigo===fmtCodigo);
              const ppto = Number(closure.cajasPorFormato[fmtCodigo]||0);
              return (
                <div key={fmtCodigo} style={{background:C.card, padding:8, borderRadius:6, border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:10, color:C.muted, marginBottom:4}}>{fmtObj?.nombre||fmtCodigo}</div>
                  <div style={{fontSize:9, color:C.muted2, marginBottom:4}}>Ppto: {ppto.toLocaleString("es-CL")} cjs</div>
                  <input type="number" min="0" step="1"
                    value={buf.cajasPorFormato?.[fmtCodigo]||""}
                    placeholder="0"
                    style={{...inputSt, padding:"4px 8px", fontSize:13, fontFamily:"monospace", textAlign:"right"}}
                    onChange={e=>setCajas(fmtCodigo, e.target.value)}/>
                </div>
              );
            })}
          </div>
        )}
        {totalCajas > 0 && (
          <div style={{fontSize:11, color:C.teal, marginTop:6, fontFamily:"monospace"}}>
            Total semana: {totalCajas.toLocaleString("es-CL")} cjs
          </div>
        )}
      </div>

      {/* Observ */}
      <div style={{marginBottom:12}}>
        <div style={lblSt}>Observaciones</div>
        <textarea value={buf.observ||""} rows={2}
          style={{...inputSt, resize:"vertical", fontFamily:"inherit"}}
          onChange={e=>setBuf(prev=>({...prev, observ:e.target.value}))}/>
      </div>

      <div style={{display:"flex", gap:8, justifyContent:"flex-end"}}>
        <button onClick={onCancelar} style={btnSt(C.muted,true)}>Cancelar</button>
        <button onClick={handleGuardar} style={btnSt(C.teal)}>✓ Guardar semana</button>
      </div>
    </div>
  );
}

// Panel de programa por Business Closure
// PROGRAMA — vista por perspectiva (Especie / Cliente / Exportador). Un solo
// modelo (semanas ↔ closure), distintas agrupaciones. Drill progresivo:
// grupo resumido → expandir → Business Closures (relaciones) → semanas → detalle.
// Semántica preservada del panel por closure: Presupuesto = cajas del closure,
// Real = Σ cajas de las semanas programadas, Avance = Real/Presupuesto.
function ProgramaPerspectiva({ perspectiva, closures, semanasPorClosure, exportadoras, clientes, especies }) {
  const [expG, setExpG] = useState(()=>new Set());
  const [expC, setExpC] = useState(()=>new Set());
  const espOf=(c)=>especies.find(e=>e.codigo===c);
  const espLab=(c)=>{ const e=espOf(c); return e?`${e.icono||""} ${e.nombreEs}`.trim():(c||"—"); };
  const cliName=(id)=>clientes.find(c=>c.id===id)?.nombre||"—";
  const expName=(id)=>exportadoras.find(e=>e.id===id)?.nombre||"—";
  const sumObj=(o)=>Object.values(o||{}).reduce((s,v)=>s+Number(v||0),0);
  const wk=(bc)=>semanasPorClosure[bc.id]||[];
  const pptoDe=(bc)=>sumObj(bc.cajasPorFormato);
  const realDe=(bc)=>wk(bc).reduce((s,x)=>s+sumObj(x.cajasPorFormato),0);
  const fclDe=(bc)=>wk(bc).reduce((s,x)=>s+(Number(x.contenedoresFCL)||0),0);
  const semDe=(bc)=>wk(bc).length;
  const keyOf=(bc)=> perspectiva==="especie"?(bc.especieCodigo||"—") : perspectiva==="cliente"?(bc.clienteId||"—") : (bc.exportadoraId||"—");
  const labOf=(bc)=> perspectiva==="especie"?espLab(bc.especieCodigo) : perspectiva==="cliente"?cliName(bc.clienteId) : expName(bc.exportadoraId);

  const grupos = useMemo(()=>{
    const m={};
    closures.forEach(bc=>{ const k=keyOf(bc); (m[k]=m[k]||{key:k,label:labOf(bc),closures:[]}).closures.push(bc); });
    return Object.values(m).map(g=>{
      const ppto=g.closures.reduce((s,bc)=>s+pptoDe(bc),0);
      const real=g.closures.reduce((s,bc)=>s+realDe(bc),0);
      const fcl =g.closures.reduce((s,bc)=>s+fclDe(bc),0);
      const sem =g.closures.reduce((s,bc)=>s+semDe(bc),0);
      const clis=new Set(), exps=new Set(), esps=new Set();
      g.closures.forEach(bc=>{ if(bc.clienteId)clis.add(bc.clienteId); if(bc.exportadoraId)exps.add(bc.exportadoraId); if(bc.especieCodigo)esps.add(bc.especieCodigo); });
      return {...g, ppto, real, fcl, sem, nClo:g.closures.length, clis:clis.size, exps:exps.size, esps:esps.size, avance: ppto>0?Math.round(real/ppto*100):0};
    }).sort((a,b)=>b.real-a.real || String(a.label).localeCompare(String(b.label)));
  },[closures, semanasPorClosure, perspectiva]);

  const toggleG=(k)=>setExpG(p=>{const n=new Set(p);n.has(k)?n.delete(k):n.add(k);return n;});
  const toggleC=(id)=>setExpC(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;});
  const relLabel=(g)=> perspectiva==="especie"?`${g.exps} exp · ${g.clis} cli` : perspectiva==="cliente"?`${g.exps} exp · ${g.esps} esp` : `${g.clis} cli · ${g.esps} esp`;

  return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        <button onClick={()=>setExpG(new Set(grupos.map(g=>g.key)))} style={{...btnSt(C.muted,true),fontSize:11}}>Expandir todo</button>
        <button onClick={()=>{setExpG(new Set());setExpC(new Set());}} style={{...btnSt(C.muted,true),fontSize:11}}>Contraer todo</button>
      </div>
      {grupos.length===0 && <div style={{padding:40,textAlign:"center",color:C.muted,fontSize:13}}>Sin datos para esta perspectiva/filtros.</div>}
      {grupos.map(g=>{
        const open=expG.has(g.key);
        return (
          <div key={g.key} style={{background:C.card2,border:`1px solid ${C.border}`,borderRadius:10,marginBottom:10,overflow:"hidden"}}>
            <div onClick={()=>toggleG(g.key)} style={{padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",background:open?`${C.blue}0a`:"transparent"}}>
              <span style={{color:C.muted}}>{open?"▾":"▸"}</span>
              <span style={{fontSize:13,fontWeight:700,flex:1,minWidth:120}}>{g.label}</span>
              <span style={{fontSize:11,color:C.muted}}>{relLabel(g)} · {g.nClo} BC · {g.sem} sem</span>
              <span style={{fontSize:11,fontFamily:"monospace"}}>
                <b style={{color:C.teal}}>{g.real.toLocaleString("es-CL")}</b> cjs · {g.fcl} FCL · ppto {g.ppto.toLocaleString("es-CL")} · <b style={{color:C.text}}>{g.avance}%</b>
              </span>
            </div>
            {open && (
              <div style={{padding:"0 14px 12px"}}>
                {g.closures.map(bc=>{
                  const co=expC.has(bc.id);
                  const otras = perspectiva==="especie"?`${expName(bc.exportadoraId)} → ${cliName(bc.clienteId)}`
                    : perspectiva==="cliente"?`${expName(bc.exportadoraId)} · ${espLab(bc.especieCodigo)}`
                    : `${cliName(bc.clienteId)} · ${espLab(bc.especieCodigo)}`;
                  const ppto=pptoDe(bc), real=realDe(bc);
                  return (
                    <div key={bc.id} style={{borderTop:`1px solid ${C.border}`}}>
                      <div onClick={()=>toggleC(bc.id)} style={{padding:"7px 4px",cursor:"pointer",display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                        <span style={{color:C.muted,fontSize:11}}>{co?"▾":"▸"}</span>
                        <span style={{fontSize:12,flex:1,minWidth:150}}>{otras} <span style={{color:C.muted2}}>· {bc.temporada}</span></span>
                        <span style={{fontSize:11,fontFamily:"monospace",color:C.muted}}>{real.toLocaleString("es-CL")}/{ppto.toLocaleString("es-CL")} cjs · {fclDe(bc)} FCL · {semDe(bc)} sem · {ppto>0?Math.round(real/ppto*100):0}%</span>
                      </div>
                      {co && (
                        <div style={{overflowX:"auto",paddingBottom:8}}>
                          <table style={{borderCollapse:"collapse",width:"100%",fontSize:11,minWidth:420}}>
                            <thead><tr style={{color:C.muted,textAlign:"left"}}>
                              <th style={{padding:"4px 8px"}}>Semana (lunes ETD)</th><th style={{padding:"4px 8px"}}>Vía</th><th style={{padding:"4px 8px",textAlign:"right"}}>Cajas</th><th style={{padding:"4px 8px",textAlign:"right"}}>FCL/Pallets</th><th style={{padding:"4px 8px"}}>Estado</th>
                            </tr></thead>
                            <tbody>
                              {wk(bc).slice().sort((a,b)=>(a.fechaSemana||"").localeCompare(b.fechaSemana||"")).map(s=>{
                                const tot=sumObj(s.cajasPorFormato); const aereo=(s.tipoEmbarque||"maritimo")==="aereo";
                                return <tr key={s.id||s.fechaSemana} style={{borderTop:`1px solid ${C.border}`}}>
                                  <td style={{padding:"4px 8px",whiteSpace:"nowrap"}}>{s.fechaSemana||"—"}</td>
                                  <td style={{padding:"4px 8px"}}>{aereo?"✈":"🚢"}</td>
                                  <td style={{padding:"4px 8px",textAlign:"right",fontFamily:"monospace"}}>{tot.toLocaleString("es-CL")}</td>
                                  <td style={{padding:"4px 8px",textAlign:"right",fontFamily:"monospace"}}>{aereo?`${Number(s.pallets)||0} pal`:`${Number(s.contenedoresFCL)||0} FCL`}</td>
                                  <td style={{padding:"4px 8px"}}>{s.estado||"borrador"}</td>
                                </tr>;
                              })}
                              {wk(bc).length===0 && <tr><td colSpan={5} style={{padding:8,color:C.muted2}}>Sin semanas programadas.</td></tr>}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// PROGRAMA — perspectiva por SEMANA (agrupa las semanas de todos los closures
// filtrados por su semana ETD). Resumen operacional por semana → expandir a las
// relaciones (exportador→cliente·especie·closure) de esa semana.
function ProgramaPorSemana({ closures, semanasPorClosure, exportadoras, clientes, especies }) {
  const [exp, setExp] = useState(()=>new Set());
  const espLab=(c)=>{ const e=especies.find(x=>x.codigo===c); return e?`${e.icono||""} ${e.nombreEs}`.trim():(c||"—"); };
  const cliName=(id)=>clientes.find(c=>c.id===id)?.nombre||"—";
  const expName=(id)=>exportadoras.find(e=>e.id===id)?.nombre||"—";
  const sumObj=(o)=>Object.values(o||{}).reduce((s,v)=>s+Number(v||0),0);
  const semanas = useMemo(()=>{
    const wk={};
    closures.forEach(bc=>{ (semanasPorClosure[bc.id]||[]).forEach(s=>{ const k=s.fechaSemana||"—"; (wk[k]=wk[k]||{key:k,items:[]}).items.push({s,bc}); }); });
    return Object.values(wk).map(w=>{ let cajas=0,fcl=0,pal=0; const clis=new Set(),exps=new Set(),esps=new Set();
      w.items.forEach(({s,bc})=>{ cajas+=sumObj(s.cajasPorFormato); fcl+=Number(s.contenedoresFCL)||0; pal+=Number(s.pallets)||0; if(bc.clienteId)clis.add(bc.clienteId); if(bc.exportadoraId)exps.add(bc.exportadoraId); if(bc.especieCodigo)esps.add(bc.especieCodigo); });
      return {...w, cajas, fcl, pal, clis:clis.size, exps:exps.size, esps:esps.size}; })
      .sort((a,b)=>String(a.key).localeCompare(String(b.key)));
  },[closures, semanasPorClosure]);
  const t=(k)=>setExp(p=>{const n=new Set(p);n.has(k)?n.delete(k):n.add(k);return n;});
  return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        <button onClick={()=>setExp(new Set(semanas.map(w=>w.key)))} style={{...btnSt(C.muted,true),fontSize:11}}>Expandir todo</button>
        <button onClick={()=>setExp(new Set())} style={{...btnSt(C.muted,true),fontSize:11}}>Contraer todo</button>
      </div>
      {semanas.length===0 && <div style={{padding:40,textAlign:"center",color:C.muted,fontSize:13}}>Sin semanas de programa para estos filtros.</div>}
      {semanas.map(w=>{ const o=exp.has(w.key); return (
        <div key={w.key} style={{background:C.card2,border:`1px solid ${C.border}`,borderRadius:10,marginBottom:8,overflow:"hidden"}}>
          <div onClick={()=>t(w.key)} style={{padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",background:o?`${C.blue}0a`:"transparent"}}>
            <span style={{color:C.muted}}>{o?"▾":"▸"}</span>
            <span style={{fontSize:13,fontWeight:700,flex:1,minWidth:120}}>Semana {w.key}</span>
            <span style={{fontSize:11,color:C.muted}}>{w.exps} exp · {w.clis} cli · {w.esps} esp</span>
            <span style={{fontSize:11,fontFamily:"monospace"}}><b style={{color:C.teal}}>{w.fcl}</b> FCL{w.pal?` · ${w.pal} pal`:""} · <b>{w.cajas.toLocaleString("es-CL")}</b> cjs</span>
          </div>
          {o && (
            <div style={{padding:"0 14px 12px"}}>
              {w.items.slice().sort((a,b)=>expName(a.bc.exportadoraId).localeCompare(expName(b.bc.exportadoraId))).map(({s,bc},i)=>{
                const tot=sumObj(s.cajasPorFormato); const aereo=(s.tipoEmbarque||"maritimo")==="aereo";
                return <div key={s.id||i} style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",padding:"6px 4px",borderTop:`1px solid ${C.border}`,fontSize:11.5}}>
                  <span style={{flex:1,minWidth:180}}>{expName(bc.exportadoraId)} → {cliName(bc.clienteId)} <span style={{color:C.muted2}}>· {espLab(bc.especieCodigo)}</span></span>
                  <span style={{fontFamily:"monospace",color:C.muted}}>{tot.toLocaleString("es-CL")} cjs · {aereo?`${Number(s.pallets)||0} pal`:`${Number(s.contenedoresFCL)||0} FCL`} · {aereo?"✈":"🚢"} · {s.estado||"borrador"}</span>
                </div>;
              })}
            </div>
          )}
        </div>
      ); })}
    </div>
  );
}

function ClosureProgramaPanel({closure, semanas, tiposEmbalaje, exportadoras, clientes, especies,
  canEdit, editandoSemana, closureIdParaSemana,
  onAgregarSemana, onEditarSemana, onEliminarSemana, onGuardarSemana, onCancelarSemana
}) {
  const exportadora = exportadoras.find(e=>e.id===closure.exportadoraId);
  const cliente     = clientes.find(c=>c.id===closure.clienteId);
  const especie     = especies.find(e=>e.codigo===closure.especieCodigo);

  const formatosClosure = Object.keys(closure.cajasPorFormato||{});
  const totalPpto = Object.values(closure.cajasPorFormato||{}).reduce((s,v)=>s+Number(v||0),0);

  // Acumulado real por formato
  const acumReal = {};
  semanas.forEach(s=>{
    Object.entries(s.cajasPorFormato||{}).forEach(([cod,v])=>{
      acumReal[cod] = (acumReal[cod]||0) + Number(v||0);
    });
  });
  const totalReal = Object.values(acumReal).reduce((s,v)=>s+v,0);
  const totalVariacion = totalPpto - totalReal;

  const semanasOrdenadas = [...semanas].sort((a,b)=>(a.fechaSemana||"").localeCompare(b.fechaSemana||""));
  const esEditandoEste   = closureIdParaSemana === closure.id;

  return (
    <div style={{
      background:C.card2, borderRadius:10, border:`1px solid ${C.blue}44`,
      marginBottom:14, overflow:"hidden",
    }}>
      {/* Header del closure */}
      <div style={{padding:"10px 14px", background:`${C.blue}0a`, borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8}}>
        <div>
          <div style={{fontSize:13, fontWeight:700, color:C.text, display:"flex", alignItems:"center", gap:6}}>
            {exportadora?.nombre||"—"}
            <span style={{color:C.muted, fontSize:11}}>→</span>
            {cliente?.nombre||"—"}
          </div>
          <div style={{fontSize:11, color:C.muted, marginTop:2, display:"flex", gap:8, alignItems:"center"}}>
            {especie && <span>{especie.icono} {especie.nombreEs}</span>}
            <span>· Temporada {closure.temporada}</span>
            {closure.codigo && <span style={{color:C.muted2}}>· {closure.codigo}</span>}
          </div>
        </div>
        {/* KPIs compactos */}
        <div style={{display:"flex", gap:16, fontSize:11, fontFamily:"monospace"}}>
          <div style={{textAlign:"center"}}>
            <div style={{color:C.muted, fontSize:9, textTransform:"uppercase"}}>Presup.</div>
            <div style={{color:C.blue, fontWeight:700}}>{totalPpto.toLocaleString("es-CL")}</div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{color:C.muted, fontSize:9, textTransform:"uppercase"}}>Real</div>
            <div style={{color:C.teal, fontWeight:700}}>{totalReal.toLocaleString("es-CL")}</div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{color:C.muted, fontSize:9, textTransform:"uppercase"}}>Variación</div>
            <div style={{color: totalVariacion<0?C.accent:totalVariacion===0?C.green:C.yellow, fontWeight:700}}>
              {totalVariacion>0?"+":""}{totalVariacion.toLocaleString("es-CL")}
            </div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{color:C.muted, fontSize:9, textTransform:"uppercase"}}>Avance</div>
            <div style={{color:C.text, fontWeight:700}}>
              {totalPpto>0?Math.round(totalReal/totalPpto*100):0}%
            </div>
          </div>
        </div>
      </div>

      {/* Tabla de semanas */}
      <div style={{padding:14}}>
        {semanasOrdenadas.length > 0 ? (
          <div style={{overflowX:"auto", marginBottom:10}}>
            <table style={{borderCollapse:"collapse", width:"100%", fontSize:11}}>
              <thead>
                <tr style={{background:C.primary}}>
                  <th style={{padding:"6px 10px", textAlign:"left", color:C.primaryText, fontWeight:600, whiteSpace:"nowrap"}}>Semana · ETD → ETA</th>
                  {formatosClosure.map(cod=>{
                    const fmt = tiposEmbalaje.find(t=>t.codigo===cod);
                    return (
                      <th key={cod} style={{padding:"6px 8px", textAlign:"right", color:C.primaryText, fontWeight:600, whiteSpace:"nowrap", fontSize:10}}>
                        {fmt?.nombre||cod}
                      </th>
                    );
                  })}
                  <th style={{padding:"6px 8px", textAlign:"right", color:C.primaryText, fontWeight:600}}>Total cjs</th>
                  <th style={{padding:"6px 8px", textAlign:"right", color:C.primaryText, fontWeight:600}}>FCL/Pal</th>
                  <th style={{padding:"6px 8px", textAlign:"center", color:C.primaryText, fontWeight:600}}>Estado</th>
                  {canEdit && <th/>}
                </tr>
              </thead>
              <tbody>
                {semanasOrdenadas.map((sem,i)=>{
                  const totalSem = Object.values(sem.cajasPorFormato||{}).reduce((s,v)=>s+Number(v||0),0);
                  const wISO = getSemanaISO(sem.fechaSemana);
                  const wEtd = sem.etdSemanaNum ? {semana:sem.etdSemanaNum, anio:sem.etdSemanaAnio} : getSemanaISO(sem.etd);
                  const wEta = sem.etaSemanaNum ? {semana:sem.etaSemanaNum, anio:sem.etaSemanaAnio} : getSemanaISO(sem.eta);
                  const fmtW = (w)=> w ? `S${String(w.semana).padStart(2,"0")}·${String(w.anio).slice(2)}` : "—";
                  return (
                    <tr key={sem.id||i} style={{background: i%2===0?C.card:C.rowAlt}}>
                      <td style={{padding:"6px 10px", border:`1px solid ${C.border}`, whiteSpace:"nowrap"}}>
                        <div>
                          <span title="Semana ISO · año (la misma fecha cae en distinta semana según el año)"
                            style={{display:"inline-block", background:`${C.blue}22`, color:C.blue, fontWeight:700, fontFamily:"monospace", borderRadius:4, padding:"1px 6px", marginRight:6}}>
                            {wISO ? `S${String(wISO.semana).padStart(2,"0")}·${String(wISO.anio).slice(2)}` : "—"}
                          </span>
                          {formatFechaSemana(sem.fechaSemana)}
                        </div>
                        <div style={{fontSize:10, color:C.muted, marginTop:2}}>
                          {(sem.tipoEmbarque||"maritimo")==="aereo" ? "✈ Aéreo" : "🚢 Marítimo"} · ETD {fmtW(wEtd)} → ETA {fmtW(wEta)}
                        </div>
                      </td>
                      {formatosClosure.map(cod=>(
                        <td key={cod} style={{padding:"6px 8px", textAlign:"right", border:`1px solid ${C.border}`, fontFamily:"monospace"}}>
                          {sem.cajasPorFormato?.[cod]!=null ? Number(sem.cajasPorFormato[cod]).toLocaleString("es-CL") : "—"}
                        </td>
                      ))}
                      <td style={{padding:"6px 8px", textAlign:"right", border:`1px solid ${C.border}`, fontFamily:"monospace", fontWeight:700}}>
                        {totalSem.toLocaleString("es-CL")}
                      </td>
                      <td style={{padding:"6px 8px", textAlign:"right", border:`1px solid ${C.border}`, fontFamily:"monospace", fontWeight:700, color:C.teal}}>
                        {(sem.tipoEmbarque==="aereo")
                          ? (sem.pallets ? `${Number(sem.pallets).toLocaleString("es-CL")} pal` : "—")
                          : (sem.contenedoresFCL ? Number(sem.contenedoresFCL).toLocaleString("es-CL") : "—")}
                      </td>
                      <td style={{padding:"6px 8px", textAlign:"center", border:`1px solid ${C.border}`}}>
                        <span style={{
                          fontSize:9, padding:"2px 6px", borderRadius:4, fontWeight:600,
                          background:sem.estado==="confirmado"?`${C.green}22`:`${C.yellow}22`,
                          color:sem.estado==="confirmado"?C.green:C.yellow,
                        }}>
                          {sem.estado==="confirmado"?"✓ Conf.":"◌ Bor."}
                        </span>
                      </td>
                      {canEdit && (
                        <td style={{padding:"4px 6px", border:`1px solid ${C.border}`, whiteSpace:"nowrap"}}>
                          <button onClick={()=>onEditarSemana(sem)} style={{...btnSt(C.blue,true), padding:"2px 6px", fontSize:10, marginRight:3}}>✎</button>
                          <button onClick={()=>onEliminarSemana(sem)} style={{...btnSt(C.accent,true), padding:"2px 6px", fontSize:10}}>×</button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {/* Fila de totales acumulados */}
                <tr style={{background:`${C.teal}0a`, fontWeight:700}}>
                  <td style={{padding:"6px 10px", border:`1px solid ${C.border}`, color:C.teal, fontSize:10, textTransform:"uppercase"}}>Acumulado real</td>
                  {formatosClosure.map(cod=>(
                    <td key={cod} style={{padding:"6px 8px", textAlign:"right", border:`1px solid ${C.border}`, fontFamily:"monospace", color:C.teal}}>
                      {acumReal[cod]!=null ? acumReal[cod].toLocaleString("es-CL") : "—"}
                    </td>
                  ))}
                  <td style={{padding:"6px 8px", textAlign:"right", border:`1px solid ${C.border}`, fontFamily:"monospace", color:C.teal}}>
                    {totalReal.toLocaleString("es-CL")}
                  </td>
                  <td style={{padding:"6px 8px", textAlign:"right", border:`1px solid ${C.border}`, fontFamily:"monospace", color:C.muted2}}>—</td>
                  <td colSpan={canEdit?2:1} style={{border:`1px solid ${C.border}`}}/>
                </tr>
                {/* Fila de variación */}
                <tr style={{background:`${C.blue}0a`}}>
                  <td style={{padding:"6px 10px", border:`1px solid ${C.border}`, color:C.blue, fontSize:10, textTransform:"uppercase"}}>Presupuesto BC</td>
                  {formatosClosure.map(cod=>{
                    const ppto = Number(closure.cajasPorFormato?.[cod]||0);
                    const real = acumReal[cod]||0;
                    const vari = ppto - real;
                    return (
                      <td key={cod} style={{padding:"6px 8px", textAlign:"right", border:`1px solid ${C.border}`, fontFamily:"monospace"}}>
                        <div style={{color:C.blue, fontSize:10}}>{ppto.toLocaleString("es-CL")}</div>
                        {semanasOrdenadas.length>0 && (
                          <div style={{fontSize:9, color:vari<0?C.accent:vari===0?C.green:C.yellow}}>
                            {vari>0?"+":""}{vari.toLocaleString("es-CL")}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td style={{padding:"6px 8px", textAlign:"right", border:`1px solid ${C.border}`, fontFamily:"monospace"}}>
                    <div style={{color:C.blue}}>{totalPpto.toLocaleString("es-CL")}</div>
                    {semanasOrdenadas.length>0 && (
                      <div style={{fontSize:9, color:totalVariacion<0?C.accent:totalVariacion===0?C.green:C.yellow}}>
                        {totalVariacion>0?"+":""}{totalVariacion.toLocaleString("es-CL")}
                      </div>
                    )}
                  </td>
                  <td style={{padding:"6px 8px", textAlign:"right", border:`1px solid ${C.border}`, fontFamily:"monospace", fontWeight:700, color:C.teal}}>
                    {semanasOrdenadas.reduce((s,x)=>s+(Number(x.contenedoresFCL)||0),0).toLocaleString("es-CL")}
                  </td>
                  <td colSpan={canEdit?2:1} style={{border:`1px solid ${C.border}`}}/>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{color:C.muted, fontSize:12, fontStyle:"italic", marginBottom:10}}>
            Aún no hay semanas ingresadas para este Business Closure.
          </div>
        )}

        {/* Form inline */}
        {esEditandoEste && editandoSemana && (
          <ProgramaSemanaForm
            semana={editandoSemana}
            closure={closure}
            tiposEmbalaje={tiposEmbalaje}
            onGuardar={onGuardarSemana}
            onCancelar={onCancelarSemana}
          />
        )}

        {canEdit && !esEditandoEste && (
          <button onClick={()=>onAgregarSemana(closure.id)}
            style={{...btnSt(C.teal), fontSize:13, fontWeight:700, padding:"9px 18px", marginTop:4,
              display:"inline-flex", alignItems:"center", gap:7, boxShadow:C.shadowSm}}>
            <span style={{fontSize:16, lineHeight:1}}>＋</span> Agregar semana de programa
          </button>
        )}
      </div>
    </div>
  );
}

// Calibres por defecto por especie (fallback si el maestro no los define).
// El usuario puede sobrescribir en Maestros → Especies (campo "Calibres").
const CALIBRES_DEFAULT = {
  AVO:"12,14,16,18,20,22,24,26,28,30,32",
  CHE:"L,XL,J,XJ,2J,3J,4J",
  BLB:"+12,+14,+18,+20",
  GRP:"M,L,XL,J",
  PLM:"30,35,40,45,50,55,60",
  KWI:"18,22,25,27,30,33,36,39,42",
  MNG:"6,7,8,9,10,12,14",
  POM:"8,10,12,14,16",
};
// "12,14 / 16" → ["12","14","16"]
function parseCalibres(str){
  return String(str||"").split(/[,/;|]+/).map(s=>s.trim()).filter(Boolean);
}
function calibresDeEspecie(especieObj){
  const raw = especieObj?.calibres || CALIBRES_DEFAULT[especieObj?.codigo] || "";
  return parseCalibres(raw);
}

// ═══════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════
// ORDEN DE EMBARQUE — FORM
// ═══════════════════════════════════════════════════════════════════
function OEForm({oe, exportadoras, clientes, notifys=[], especies, tiposEmbalaje, contratos,
  puertos, aeropuertos, shippingLines, lineasAereas, temporadas,
  onGuardar, onCancelar}) {
  const [buf, setBuf] = useState(()=>JSON.parse(JSON.stringify(oe)));
  const set = (k,v) => setBuf(prev=>({...prev,[k]:v}));
  const setNotify = (k,v) => setBuf(prev=>({...prev,notify:{...(prev.notify||{}), [k]:v}}));

  // Notify guardados del cliente seleccionado (match por token de código).
  // Un cliente puede tener varios (marítimo/aéreo/destino distinto).
  const tokenCli = tokenEntidad(clientes.find(c=>c.id===buf.clienteId)?.codigoEntidad);
  const notifysCliente = tokenCli
    ? notifys.filter(n=>tokenEntidad(n.codigo)===tokenCli)
    : [];
  const aplicarNotify = (n) => { if(n) setBuf(prev=>({...prev, notify:notifyDesdeMaestro(n)})); };
  const notifyVacio = !(buf.notify?.nombre||buf.notify?.direccion||buf.notify?.contacto);

  // Autocompletar al elegir cliente / tipo de embarque, sólo si el notify
  // está vacío: prioriza el que calce con el tipo de embarque.
  useEffect(()=>{
    if(!notifyVacio || notifysCliente.length===0) return;
    const sub = buf.tipoEmbarque==="aereo" ? "aereo" : buf.tipoEmbarque==="maritimo" ? "maritimo" : null;
    const pick = (sub && notifysCliente.find(n=>n.subtipo===sub)) || notifysCliente[0];
    aplicarNotify(pick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[buf.clienteId, buf.tipoEmbarque]);
  const setCajas = (cod,val) => setBuf(prev=>{
    const cpf = {...(prev.cajasPorFormato||{})};
    const n = Number(val);
    if(!val||n===0) delete cpf[cod]; else cpf[cod]=n;
    return {...prev,cajasPorFormato:cpf};
  });
  const setCalibre = (cod,val) => setBuf(prev=>{
    const cal = {...(prev.calibrePorFormato||{})};
    if(!val) delete cal[cod]; else cal[cod]=val;
    return {...prev,calibrePorFormato:cal};
  });

  const esMar = buf.tipoEmbarque==="maritimo";
  const esAer = buf.tipoEmbarque==="aereo";
  const totalCajas = Object.values(buf.cajasPorFormato||{}).reduce((s,v)=>s+Number(v||0),0);

  // Formatos disponibles según especie seleccionada
  const especieObj = especies.find(e=>e.codigo===buf.especieCodigo);
  const formatosDisp = tiposEmbalaje.filter(t=>
    t.especieCodigo===buf.especieCodigo || (especieObj && t.especie===especieObj.nombreEs)
  );
  const calibresDisp = calibresDeEspecie(especieObj);

  // Al seleccionar BC, auto-completa campos desde el closure
  const handleClosureChange = (closureId) => {
    if(!closureId) { set("closureId",""); return; }
    const bc = contratos.find(c=>c.id===closureId);
    if(!bc) { set("closureId",""); return; }
    setBuf(prev=>({
      ...prev,
      closureId,
      temporada:    prev.temporada    || bc.temporada,
      exportadoraId:prev.exportadoraId|| bc.exportadoraId,
      clienteId:    prev.clienteId    || bc.clienteId,
      especieCodigo:prev.especieCodigo|| bc.especieCodigo,
    }));
  };

  const handleGuardar = () => {
    if(!buf.exportadoraId){ alert("Selecciona exportadora"); return; }
    if(!buf.clienteId)    { alert("Selecciona cliente"); return; }
    if(!buf.especieCodigo){ alert("Selecciona especie"); return; }
    if(!buf.tipoEmbarque) { alert("Selecciona tipo de embarque"); return; }
    if(!buf.origen?.trim()){ alert("Ingresa origen"); return; }
    if(!buf.destino?.trim()){ alert("Ingresa destino"); return; }
    onGuardar({...buf, fechaActualizacion:new Date().toISOString()});
  };

  const origenDestOptions = esMar ? puertos : esAer ? aeropuertos : [];

  return (
    <div style={{background:`${C.blue}0d`,padding:16,borderRadius:8,border:`1px solid ${C.blue}44`,marginBottom:14}}>
      <h3 style={{margin:"0 0 14px",color:C.blue,fontSize:14,display:"flex",alignItems:"center",gap:8}}>
        <span>{oe.id?"✎":"+"}</span>
        <span>{oe.id?"Editando Orden de Embarque":"Nueva Orden de Embarque"}</span>
      </h3>

      {/* Número + Estado */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 160px",gap:10,marginBottom:10}}>
        <div>
          <div style={lblSt}>N° Embarque</div>
          <input value={buf.numero||""} onChange={e=>set("numero",e.target.value)}
            style={inputSt}/>
        </div>
        <div>
          <div style={lblSt}>Estado</div>
          <select value={buf.estado||"borrador"} onChange={e=>set("estado",e.target.value)} style={inputSt}>
            <option value="borrador">◌ Borrador</option>
            <option value="confirmado">✓ Confirmado</option>
            <option value="despachado">🚢 Despachado</option>
            <option value="cancelado">✗ Cancelado</option>
          </select>
        </div>
      </div>

      {/* BC (opcional) */}
      <div style={{marginBottom:10}}>
        <div style={lblSt}>Vincular a Business Closure (opcional)</div>
        <select value={buf.closureId||""} onChange={e=>handleClosureChange(e.target.value)} style={inputSt}>
          <option value="">— sin vincular —</option>
          {contratos.filter(c=>(c.estado||"activo")==="activo").map(c=>{
            const exp=exportadoras.find(x=>x.id===c.exportadoraId)?.nombre||"?";
            const cli=clientes.find(x=>x.id===c.clienteId)?.nombre||"?";
            const esp=especies.find(x=>x.codigo===c.especieCodigo)?.nombreEs||c.especieCodigo||"?";
            return <option key={c.id} value={c.id}>{c.temporada} · {exp} → {cli} ({esp})</option>;
          })}
        </select>
      </div>

      {/* Temporada + Exportadora + Cliente + Especie */}
      <div style={{display:"grid",gridTemplateColumns:"150px 1fr 1fr 1fr",gap:10,marginBottom:10}}>
        <div>
          <div style={lblSt}>Temporada</div>
          <select value={buf.temporada||""} onChange={e=>set("temporada",e.target.value)} style={inputSt}>
            <option value="">— —</option>
            {temporadas.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <div style={lblSt}>Exportadora *</div>
          <ExportadoraPicker value={buf.exportadoraId} exportadoras={exportadoras} onChange={id=>set("exportadoraId",id)} style={inputSt}/>
        </div>
        <div>
          <div style={lblSt}>Cliente *</div>
          <select value={buf.clienteId||""} onChange={e=>set("clienteId",e.target.value)} style={inputSt}>
            <option value="">— seleccionar —</option>
            {clientes.filter(c=>c.activo!==false).map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div>
          <div style={lblSt}>Especie *</div>
          <select value={buf.especieCodigo||""} onChange={e=>set("especieCodigo",e.target.value)} style={inputSt}>
            <option value="">— seleccionar —</option>
            {especiesConFormatos(especies, tiposEmbalaje, buf.especieCodigo).map(e=><option key={e.codigo} value={e.codigo}>{e.icono} {e.nombreEs}</option>)}
          </select>
        </div>
      </div>

      {/* Tipo embarque + Naviera/Aerolinea + Contenedor */}
      <div style={{display:"grid",gridTemplateColumns:"160px 1fr 200px",gap:10,marginBottom:10}}>
        <div>
          <div style={lblSt}>Tipo embarque *</div>
          <select value={buf.tipoEmbarque||""} onChange={e=>set("tipoEmbarque",e.target.value)} style={inputSt}>
            <option value="">— —</option>
            <option value="maritimo">🚢 Marítimo</option>
            <option value="aereo">✈ Aéreo</option>
          </select>
        </div>
        <div>
          <div style={lblSt}>{esAer?"Aerolínea":"Naviera"}</div>
          <input list="oe-naviera-list" value={buf.navieraAerolinea||""}
            onChange={e=>set("navieraAerolinea",e.target.value)}
            style={inputSt}/>
          <datalist id="oe-naviera-list">
            {(esAer?lineasAereas:shippingLines).map(x=>(
              <option key={x.codigo} value={x.nombre}>{x.codigo} — {x.nombre}</option>
            ))}
          </datalist>
        </div>
        <div>
          <div style={lblSt}>{esAer?"N° Vuelo":"N° Contenedor"}</div>
          <input value={buf.numeroContenedor||""} onChange={e=>set("numeroContenedor",e.target.value)}
            style={inputSt}/>
        </div>
      </div>

      {/* Origen + Destino */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <div>
          <div style={lblSt}>Origen *</div>
          <input list="oe-origen-list" value={buf.origen||""}
            onChange={e=>set("origen",e.target.value)}
            style={inputSt}/>
          <datalist id="oe-origen-list">
            {origenDestOptions.map(p=>(
              <option key={p.codigo} value={p.nombre||p.codigo}>{p.codigo} — {p.nombre||p.ciudad}</option>
            ))}
          </datalist>
        </div>
        <div>
          <div style={lblSt}>Destino *</div>
          <input list="oe-destino-list" value={buf.destino||""}
            onChange={e=>set("destino",e.target.value)}
            style={inputSt}/>
          <datalist id="oe-destino-list">
            {origenDestOptions.map(p=>(
              <option key={p.codigo} value={p.nombre||p.codigo}>{p.codigo} — {p.nombre||p.ciudad}</option>
            ))}
          </datalist>
        </div>
      </div>

      {/* Notify */}
      <div style={{background:C.card,padding:10,borderRadius:6,border:`1px solid ${C.border}`,marginBottom:10}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:8,flexWrap:"wrap"}}>
          <div style={{fontSize:11,fontWeight:700,color:C.muted}}>Notify</div>
          {notifys.length>0 && (
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:10,color:C.muted}}>Elegir del maestro:</span>
              <select
                value=""
                onChange={e=>{ const n=notifys.find(x=>x.codigo===e.target.value); aplicarNotify(n); e.target.value=""; }}
                style={{...inputSt, padding:"3px 8px", fontSize:11, maxWidth:280}}>
                <option value="">— elegir / autocompletar —</option>
                {notifysCliente.length>0 && (
                  <optgroup label="Del cliente">
                    {notifysCliente.map(n=>(
                      <option key={"c_"+n.codigo} value={n.codigo}>
                        {n.subtipo==="aereo"?"✈ ":n.subtipo==="maritimo"?"🚢 ":""}{n.nombre} ({n.codigo})
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Todos los notify">
                  {notifys.map(n=>(
                    <option key={n.codigo} value={n.codigo}>
                      {n.subtipo==="aereo"?"✈ ":n.subtipo==="maritimo"?"🚢 ":""}{n.nombre} ({n.codigo})
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          )}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          <div>
            <div style={lblSt}>Nombre / Empresa</div>
            <input value={buf.notify?.nombre||""} onChange={e=>setNotify("nombre",e.target.value)}
              style={inputSt}/>
          </div>
          <div>
            <div style={lblSt}>Dirección</div>
            <input value={buf.notify?.direccion||""} onChange={e=>setNotify("direccion",e.target.value)}
              style={inputSt}/>
          </div>
          <div>
            <div style={lblSt}>Contacto / Teléfono</div>
            <input value={buf.notify?.contacto||""} onChange={e=>setNotify("contacto",e.target.value)}
              style={inputSt}/>
          </div>
        </div>
      </div>

      {/* Cajas por formato */}
      <div style={{marginBottom:10}}>
        <div style={lblSt}>Cajas por formato</div>
        {formatosDisp.length===0 ? (
          <div style={{fontSize:11,color:C.muted,fontStyle:"italic"}}>
            {buf.especieCodigo?"No hay formatos para esta especie en el maestro.":"Selecciona una especie primero."}
          </div>
        ) : (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:8}}>
            {formatosDisp.map(fmt=>(
              <div key={fmt.codigo} style={{background:C.card,padding:8,borderRadius:6,border:`1px solid ${C.border}`}}>
                <div style={{fontSize:10,color:C.muted,marginBottom:4}}>{fmt.nombre||fmt.codigo}</div>
                <input type="number" min="0" step="1"
                  value={buf.cajasPorFormato?.[fmt.codigo]||""}
                  placeholder="Cajas"
                  style={{...inputSt,padding:"4px 8px",fontSize:13,fontFamily:"monospace",textAlign:"right"}}
                  onChange={e=>setCajas(fmt.codigo,e.target.value)}/>
                {calibresDisp.length>0 ? (
                  <select
                    value={buf.calibrePorFormato?.[fmt.codigo]||""}
                    title="Calibre de este formato (según especie)"
                    style={{...inputSt,padding:"4px 8px",fontSize:12,marginTop:4}}
                    onChange={e=>setCalibre(fmt.codigo,e.target.value)}>
                    <option value="">Calibre…</option>
                    {calibresDisp.map(cal=><option key={cal} value={cal}>{cal}</option>)}
                    {/* preserva un calibre custom previo que no esté en la lista */}
                    {buf.calibrePorFormato?.[fmt.codigo] && !calibresDisp.includes(buf.calibrePorFormato[fmt.codigo]) && (
                      <option value={buf.calibrePorFormato[fmt.codigo]}>{buf.calibrePorFormato[fmt.codigo]}</option>
                    )}
                  </select>
                ) : (
                  <input type="text"
                    value={buf.calibrePorFormato?.[fmt.codigo]||""}
                    placeholder="Calibre"
                    title="Define los calibres de esta especie en Maestros → Especies"
                    style={{...inputSt,padding:"4px 8px",fontSize:12,marginTop:4}}
                    onChange={e=>setCalibre(fmt.codigo,e.target.value)}/>
                )}
              </div>
            ))}
          </div>
        )}
        {totalCajas>0 && (
          <div style={{fontSize:11,color:C.blue,marginTop:6,fontFamily:"monospace"}}>
            Total: {totalCajas.toLocaleString("es-CL")} cjs
          </div>
        )}
      </div>

      {/* Fechas */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <div>
          <div style={lblSt}>Fecha estimada despacho (ETD)</div>
          <input type="date" value={buf.fechaDespacho||""} onChange={e=>set("fechaDespacho",e.target.value)} style={inputSt}/>
        </div>
        <div>
          <div style={lblSt}>Fecha estimada llegada (ETA)</div>
          <input type="date" value={buf.fechaETA||""} onChange={e=>set("fechaETA",e.target.value)} style={inputSt}/>
        </div>
      </div>

      {/* Observaciones */}
      <div style={{marginBottom:12}}>
        <div style={lblSt}>Observaciones</div>
        <textarea value={buf.observ||""} rows={2}
          style={{...inputSt,resize:"vertical",fontFamily:"inherit"}}
          onChange={e=>set("observ",e.target.value)}/>
      </div>

      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
        <button onClick={onCancelar} style={btnSt(C.muted,true)}>Cancelar</button>
        <button onClick={handleGuardar} style={btnSt(C.blue)}>✓ Guardar OE</button>
      </div>
    </div>
  );
}

// ── Carpeta COMEX ────────────────────────────────────────────────
// Documentos COMEX concentrados: un Packing List, un Full Set (set completo
// de docs de embarque en un solo archivo) y el QC. Se pueden agregar más con
// el botón "+ Documento" si hiciera falta.
const DOCS_COMEX_DEFAULT = [
  "Packing List","Full Set","QC",
];

function defaultCarpetaComex() {
  return {
    docs: DOCS_COMEX_DEFAULT.map(tipo=>({id:uid(),tipo,nombre:"",url:"",fuente:"manual",fechaCarga:"",estado:"pendiente"})),
    qcDestino:{fechaRecepcion:"",temperaturaLlegada:"",pesoVerificadoKg:"",observ:"",fotos:[],docsQC:[]},
  };
}

// Mecanismo CONFIGURABLE de documentos obligatorios por entidad/transición.
// Hoy solo define los obligatorios de la carpeta COMEX (semáforo documental).
// El BLOQUEO por transición de estado queda PREPARADO pero SIN regla de negocio
// hardcodeada: cuando se defina "al pasar a estado X se exige [docs]", se agrega
// en `bloqueos` y docsFaltantesParaTransicion() lo aplica sin tocar el resto.
const DOCS_OBLIGATORIOS_CONFIG = {
  embarque: {
    semaforo: ["Packing List","Full Set","QC"],   // cuentan para el estado documental
    bloqueos: {},                                 // { <nuevoEstado>: [tipos...] } — VACÍO = sin bloqueo (no se inventa la regla)
  },
};
// Estado de documentos COMEX de un embarque: cuántos cargados, cuántos faltan.
const DOCS_COMEX_OBLIG = DOCS_OBLIGATORIOS_CONFIG.embarque.semaforo;
// Un documento se considera adjunto solo si tiene un archivo REAL subido
// (URL http/https). Una ruta local del PC ("C:\...") no cuenta.
const esArchivoSubido = (u)=> /^https?:\/\//i.test(String(u||""));
// Documentos obligatorios faltantes para pasar `entidad` a `nuevoEstado` según la
// config. Devuelve [] si no hay regla configurada para esa transición (no bloquea
// nada todavía). Punto único para activar bloqueos cuando el negocio los defina.
function docsFaltantesParaTransicion(entidad, nuevoEstado, docsPresentes){
  const req = DOCS_OBLIGATORIOS_CONFIG[entidad]?.bloqueos?.[nuevoEstado] || [];
  return req.filter(t => !(docsPresentes||[]).some(d=>d.tipo===t && esArchivoSubido(d.url)));
}

function comexEstado(oe) {
  const docs = oe?.carpetaComex?.docs || [];
  const ok = DOCS_COMEX_OBLIG.filter(t => docs.some(d=>d.tipo===t && esArchivoSubido(d.url))).length;
  const total = DOCS_COMEX_OBLIG.length;
  return { ok, total, faltan: total - ok, completo: (total - ok)===0 };
}

function CarpetaComexPanel({ oe, onGuardar, canEdit }) {
  const [cx, setCx] = useState(()=>{
    const saved = oe.carpetaComex;
    if(!saved) return defaultCarpetaComex();
    // Docs que se consolidan en el "Full Set" y ya no van como slot propio.
    const DOCS_DEPRECADOS = ["BL / AWB","Invoice Comercial","Certificado Fitosanitario","Certificado de Origen"];
    // Migración: "Seguro de Carga" → "QC" (preserva el archivo cargado)
    let docsMig = (saved.docs||[]).map(d=> d.tipo==="Seguro de Carga" ? {...d, tipo:"QC"} : d);
    // Eliminar los deprecados que NO tengan un archivo REAL subido (http). Una ruta
    // local del PC ("file:///C:\...") es basura, así que también se descarta. Solo se
    // conserva un deprecado si tiene un archivo de verdad, para no perder nada.
    docsMig = docsMig.filter(d=> !(DOCS_DEPRECADOS.includes(d.tipo) && !esArchivoSubido(d.url)));
    const savedTipos = docsMig.map(d=>d.tipo);
    const missing = DOCS_COMEX_DEFAULT.filter(t=>!savedTipos.includes(t))
      .map(tipo=>({id:uid(),tipo,nombre:"",url:"",fuente:"manual",fechaCarga:"",estado:"pendiente"}));
    return { ...saved, docs:[...docsMig,...missing], qcDestino:{...defaultCarpetaComex().qcDestino,...(saved.qcDestino||{})} };
  });
  const [dirty,    setDirty]    = useState(false);
  const [uploading,setUploading]= useState(new Set());
  const [subTab,   setSubTab]   = useState("docs");

  function updDoc(idx,k,v){ setCx(p=>{ const d=[...p.docs]; d[idx]={...d[idx],[k]:v}; return {...p,docs:d}; }); setDirty(true); }
  function addDoc(){ setCx(p=>({...p,docs:[...p.docs,{id:uid(),tipo:"Otro",nombre:"",url:"",fuente:"manual",fechaCarga:"",estado:"pendiente"}]})); setDirty(true); }
  function delDoc(idx){ setCx(p=>({...p,docs:p.docs.filter((_,i)=>i!==idx)})); setDirty(true); }
  function updQC(k,v){ setCx(p=>({...p,qcDestino:{...p.qcDestino,[k]:v}})); setDirty(true); }
  function addFoto(){ setCx(p=>({...p,qcDestino:{...p.qcDestino,fotos:[...(p.qcDestino.fotos||[]),{id:uid(),url:"",fuente:"manual",fecha:""}]}})); setDirty(true); }
  function updFoto(idx,k,v){ setCx(p=>{ const f=[...(p.qcDestino.fotos||[])]; f[idx]={...f[idx],[k]:v}; return {...p,qcDestino:{...p.qcDestino,fotos:f}}; }); setDirty(true); }
  function delFoto(idx){ setCx(p=>({...p,qcDestino:{...p.qcDestino,fotos:(p.qcDestino.fotos||[]).filter((_,i)=>i!==idx)}})); setDirty(true); }
  function addDocQC(){ setCx(p=>({...p,qcDestino:{...p.qcDestino,docsQC:[...(p.qcDestino.docsQC||[]),{id:uid(),nombre:"",url:"",fecha:""}]}})); setDirty(true); }
  function updDocQC(idx,k,v){ setCx(p=>{ const d=[...(p.qcDestino.docsQC||[])]; d[idx]={...d[idx],[k]:v}; return {...p,qcDestino:{...p.qcDestino,docsQC:d}}; }); setDirty(true); }
  function delDocQC(idx){ setCx(p=>({...p,qcDestino:{...p.qcDestino,docsQC:(p.qcDestino.docsQC||[]).filter((_,i)=>i!==idx)}})); setDirty(true); }

  async function handleUploadDoc(idx, file) {
    const doc = cx.docs[idx];
    const ext = file.name.split(".").pop();
    const path = `embarques/${oe.id}/comex/${doc.id||uid()}/${Date.now()}.${ext}`;
    setUploading(p=>new Set(p).add(idx));
    const url = await uploadArchivoFrisku(file, path);
    setUploading(p=>{ const s=new Set(p); s.delete(idx); return s; });
    if(url){ updDoc(idx,"url",url); updDoc(idx,"fuente","storage"); updDoc(idx,"nombre",file.name); updDoc(idx,"fechaCarga",new Date().toISOString().slice(0,10)); updDoc(idx,"estado","cargado"); }
  }
  async function handleUploadFoto(idx, file) {
    const foto = (cx.qcDestino.fotos||[])[idx];
    const ext  = file.name.split(".").pop();
    const path = `embarques/${oe.id}/comex/qc/${foto?.id||uid()}/${Date.now()}.${ext}`;
    const key  = `foto_${idx}`;
    setUploading(p=>new Set(p).add(key));
    const url = await uploadArchivoFrisku(file, path);
    setUploading(p=>{ const s=new Set(p); s.delete(key); return s; });
    if(url){ updFoto(idx,"url",url); updFoto(idx,"fuente","storage"); updFoto(idx,"fecha",new Date().toISOString().slice(0,10)); }
  }
  async function handleUploadDocQC(idx, file) {
    const doc = (cx.qcDestino.docsQC||[])[idx];
    const ext = file.name.split(".").pop();
    const path = `embarques/${oe.id}/comex/qc-docs/${doc?.id||uid()}/${Date.now()}.${ext}`;
    const key = `qcdoc_${idx}`;
    setUploading(p=>new Set(p).add(key));
    const url = await uploadArchivoFrisku(file, path);
    setUploading(p=>{ const s=new Set(p); s.delete(key); return s; });
    if(url){ updDocQC(idx,"url",url); updDocQC(idx,"nombre",file.name); updDocQC(idx,"fecha",new Date().toISOString().slice(0,10)); }
  }

  const docsCargados = cx.docs.filter(d=>esArchivoSubido(d.url)).length;
  const obligOk = DOCS_COMEX_OBLIG.filter(t=>cx.docs.some(d=>d.tipo===t && esArchivoSubido(d.url))).length;
  const pct = Math.round(obligOk/DOCS_COMEX_OBLIG.length*100);
  const ECOL = { pendiente:C.yellow, cargado:C.blue, aprobado:C.green };

  return (
    <div style={{marginTop:12,padding:14,background:`${C.bg}bb`,borderRadius:10,border:`1px solid ${C.purple}44`}}>
      {/* Cabecera */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{fontSize:12,fontWeight:700,color:C.purple}}>
          📁 Carpeta COMEX
          <span title="Obligatorios: Packing List, Full Set, QC" style={{marginLeft:10,fontSize:10,background:`${pct===100?C.green:C.purple}22`,color:pct===100?C.green:C.purple,borderRadius:20,padding:"2px 8px",fontWeight:700}}>
            {obligOk}/{DOCS_COMEX_OBLIG.length} oblig. · {pct}%
          </span>
        </div>
        <div style={{display:"flex",gap:5}}>
          {[["docs","📄 Docs"],["qc","🔍 QC Destino"]].map(([t,lbl])=>(
            <button key={t} onClick={()=>setSubTab(t)} style={{...btnSt(C.purple,subTab!==t),padding:"4px 10px",fontSize:10}}>{lbl}</button>
          ))}
        </div>
      </div>
      {/* Progress bar */}
      <div style={{background:C.border,borderRadius:4,height:4,marginBottom:12,overflow:"hidden"}}>
        <div style={{width:`${pct}%`,background:pct===100?C.green:C.purple,height:"100%",borderRadius:4,transition:"width 0.3s"}}/>
      </div>

      {/* Documentos */}
      {subTab==="docs" && (
        <div>
          <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:10}}>
            {cx.docs.map((doc,idx)=>{
              const adjunto = esArchivoSubido(doc.url);       // archivo real subido (http)
              const rutaLocal = doc.url && !adjunto;          // pegaron una ruta local del PC
              const oblig = DOCS_COMEX_OBLIG.includes(doc.tipo);
              const estadoEf = adjunto ? (doc.estado==="aprobado"?"aprobado":"cargado") : "pendiente";
              const isUploading = uploading.has(idx);
              const ec = ECOL[estadoEf]||C.yellow;
              const isDefault = DOCS_COMEX_DEFAULT.includes(doc.tipo);
              return (
                <div key={doc.id||idx} style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",padding:"7px 10px",background:C.card,borderRadius:8,border:`1px solid ${adjunto?C.border:C.border+"44"}`}}>
                  <div style={{flex:1,minWidth:0}}>
                    {canEdit && !isDefault
                      ? <input value={doc.tipo==="Otro"?"":doc.tipo} onChange={e=>updDoc(idx,"tipo",e.target.value||"Otro")}
                          placeholder="Nombre del documento" autoFocus={doc.tipo==="Otro"}
                          style={{...inputSt,padding:"3px 6px",fontSize:11,fontWeight:600,width:"100%"}}/>
                      : <div style={{fontSize:11,fontWeight:600,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{doc.tipo}{oblig&&<span title="Obligatorio" style={{color:C.accent,marginLeft:4}}>*</span>}</div>}
                    {doc.nombre&&doc.nombre!==doc.tipo&&adjunto&&<div style={{fontSize:9,color:C.muted,marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{doc.nombre}</div>}
                    {doc.fechaCarga&&adjunto&&<div style={{fontSize:9,color:C.muted2}}>{doc.fechaCarga}</div>}
                    {rutaLocal&&<div style={{fontSize:9,color:C.accent,marginTop:1,fontWeight:600}}>⚠ Ruta local del PC — vuelve a subir el archivo</div>}
                  </div>
                  {canEdit && adjunto
                    ? <select value={estadoEf} onChange={e=>updDoc(idx,"estado",e.target.value)}
                        style={{...inputSt,padding:"3px 5px",width:88,fontSize:10,color:ec,border:`1px solid ${ec}44`,flexShrink:0}}>
                        <option value="cargado">Cargado</option>
                        <option value="aprobado">Aprobado</option>
                      </select>
                    : <span style={{fontSize:9,padding:"2px 7px",borderRadius:4,background:`${ec}22`,color:ec,border:`1px solid ${ec}44`,fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>
                        {adjunto?(estadoEf==="aprobado"?"Aprobado":"Cargado"):"Pendiente"}
                      </span>
                  }
                  {adjunto && (
                    <a href={doc.url} target="_blank" rel="noreferrer"
                      style={{...btnSt(C.teal,true),padding:"3px 8px",fontSize:10,textDecoration:"none",flexShrink:0}}>📎 Ver</a>
                  )}
                  {canEdit && !adjunto && (
                    <input value={doc.url||""} onChange={e=>{ const v=e.target.value; updDoc(idx,"url",v); updDoc(idx,"fuente","manual"); updDoc(idx,"estado", esArchivoSubido(v)?"cargado":"pendiente"); }}
                      placeholder="o pega un link http…" style={{...inputSt,width:150,padding:"3px 6px",fontSize:10,flexShrink:0}}/>
                  )}
                  {canEdit && (
                    <>
                      <input type="file" id={`comex_${oe.id}_${idx}`} style={{display:"none"}}
                        onChange={e=>{ if(e.target.files[0]) handleUploadDoc(idx,e.target.files[0]); e.target.value=""; }}/>
                      <button onClick={()=>document.getElementById(`comex_${oe.id}_${idx}`)?.click()}
                        disabled={isUploading} title="Subir archivo (PDF, imagen)"
                        style={{...btnSt(C.purple),padding:"3px 9px",fontSize:10,flexShrink:0,whiteSpace:"nowrap"}}>
                        {isUploading?"⏳ Subiendo…":adjunto?"📎 Reemplazar":"📎 Subir"}
                      </button>
                      {doc.url && (
                        <button onClick={()=>{ updDoc(idx,"url",""); updDoc(idx,"nombre",""); updDoc(idx,"fuente","manual"); updDoc(idx,"estado","pendiente"); }}
                          style={{...btnSt(C.accent,true),padding:"3px 6px",fontSize:10,flexShrink:0}}>✕</button>
                      )}
                      {!isDefault && (
                        <button onClick={()=>delDoc(idx)} style={{...btnSt(C.accent,true),padding:"3px 6px",fontSize:10,flexShrink:0}}>×</button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {canEdit && <button onClick={addDoc} style={{...btnSt(C.purple,true),fontSize:11}}>+ Agregar documento</button>}
        </div>
      )}

      {/* QC Destino */}
      {subTab==="qc" && (
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:14}}>
            {[["Fecha recepción","fechaRecepcion","date"],["Temperatura llegada °C","temperaturaLlegada","number"],["Peso verificado kg","pesoVerificadoKg","number"]].map(([lbl,k,type])=>(
              <div key={k}>
                <div style={lblSt}>{lbl}</div>
                <input type={type} value={cx.qcDestino[k]||""} onChange={e=>updQC(k,e.target.value)} style={inputSt} disabled={!canEdit}/>
              </div>
            ))}
            <div style={{gridColumn:"1/-1"}}>
              <div style={lblSt}>Observaciones QC</div>
              <textarea value={cx.qcDestino.observ||""} onChange={e=>updQC("observ",e.target.value)} rows={2} style={{...inputSt,resize:"vertical"}} disabled={!canEdit}/>
            </div>
          </div>
          <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:8}}>📷 Fotos de llegada</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:10,marginBottom:10}}>
            {(cx.qcDestino.fotos||[]).map((foto,idx)=>{
              const isUploading = uploading.has(`foto_${idx}`);
              return (
                <div key={foto.id||idx} style={{position:"relative",width:96,height:96,borderRadius:8,overflow:"hidden",border:`1px solid ${C.border}`,background:C.card,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {foto.url ? (
                    <>
                      <a href={foto.url} target="_blank" rel="noreferrer" style={{display:"block",width:"100%",height:"100%"}}>
                        <img src={foto.url} alt="QC" style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.target.style.display="none";}}/>
                        <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,0.55)",fontSize:8,color:"#fff",padding:"2px 4px",textAlign:"center"}}>↗ Ver</div>
                      </a>
                      {canEdit && <button onClick={()=>delFoto(idx)} style={{position:"absolute",top:3,right:3,background:"rgba(239,68,68,0.85)",border:"none",color:"#fff",borderRadius:"50%",width:18,height:18,fontSize:10,cursor:"pointer",lineHeight:"18px",textAlign:"center"}}>×</button>}
                    </>
                  ) : isUploading ? <span style={{fontSize:22}}>⏳</span> : (
                    <>
                      <input type="file" accept="image/*" id={`qcf_${oe.id}_${idx}`} style={{display:"none"}}
                        onChange={e=>{ if(e.target.files[0]) handleUploadFoto(idx,e.target.files[0]); e.target.value=""; }}/>
                      <button onClick={()=>document.getElementById(`qcf_${oe.id}_${idx}`)?.click()}
                        style={{background:"none",border:"none",cursor:"pointer",color:C.purple,fontSize:26,lineHeight:1}}>📎</button>
                    </>
                  )}
                </div>
              );
            })}
            {canEdit && (
              <button onClick={addFoto} style={{width:96,height:96,borderRadius:8,border:`1px dashed ${C.purple}`,background:"transparent",color:C.purple,fontSize:28,cursor:"pointer",flexShrink:0}}>+</button>
            )}
          </div>

          {/* Documentos QC (cualquier archivo, no solo imágenes) */}
          <div style={{fontSize:11,fontWeight:700,color:C.text,margin:"14px 0 8px"}}>📄 Documentos QC</div>
          <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:10}}>
            {(cx.qcDestino.docsQC||[]).map((d,idx)=>{
              const up = uploading.has(`qcdoc_${idx}`);
              return (
                <div key={d.id||idx} style={{display:"flex",alignItems:"center",gap:8,fontSize:12}}>
                  {d.url ? (
                    <>
                      <a href={d.url} target="_blank" rel="noreferrer" style={{color:C.blue,textDecoration:"none",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        📎 {d.nombre||"documento"}{d.fecha?<span style={{color:C.muted,fontSize:10}}> · {d.fecha}</span>:null}
                      </a>
                      {canEdit && <button onClick={()=>delDocQC(idx)} style={{...btnSt(C.accent,true),padding:"2px 8px",fontSize:11}}>×</button>}
                    </>
                  ) : up ? <span style={{color:C.muted}}>⏳ Subiendo…</span> : (
                    <>
                      <input type="file" id={`qcd_${oe.id}_${idx}`} style={{display:"none"}}
                        onChange={e=>{ if(e.target.files[0]) handleUploadDocQC(idx,e.target.files[0]); e.target.value=""; }}/>
                      <button onClick={()=>document.getElementById(`qcd_${oe.id}_${idx}`)?.click()} style={{...btnSt(C.purple,true),fontSize:11,padding:"4px 12px"}}>📎 Subir archivo</button>
                      {canEdit && <button onClick={()=>delDocQC(idx)} style={{...btnSt(C.muted,true),padding:"2px 8px",fontSize:11}}>×</button>}
                    </>
                  )}
                </div>
              );
            })}
            {canEdit && (
              <button onClick={addDocQC} style={{...btnSt(C.purple,true),fontSize:11,padding:"5px 12px",alignSelf:"flex-start"}}>+ Documento</button>
            )}
          </div>
        </div>
      )}

      <div style={{display:"flex",gap:8,alignItems:"center",marginTop:4}}>
        {canEdit&&dirty&&<button onClick={()=>{onGuardar(cx);setDirty(false);}} style={btnSt(C.green)}>💾 Guardar</button>}
        {canEdit&&!dirty&&docsCargados>0&&<span style={{fontSize:11,color:C.green}}>✓ Guardado</span>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ORDEN DE EMBARQUE — CARD
// ═══════════════════════════════════════════════════════════════════
function OECard({oe, exportadoras, clientes, especies, tiposEmbalaje, onEditar, onEliminar, onGuardarPL, onGuardarCOMEX, canEdit}) {
  const [showPL,    setShowPL]    = useState(false);
  const [showCOMEX, setShowCOMEX] = useState(false);
  const exportadora = exportadoras.find(e=>e.id===oe.exportadoraId);
  const cliente     = clientes.find(c=>c.id===oe.clienteId);
  const especie     = especies.find(e=>e.codigo===oe.especieCodigo);
  const totalCajas  = Object.values(oe.cajasPorFormato||{}).reduce((s,v)=>s+Number(v||0),0);
  const formatosConCajas = Object.entries(oe.cajasPorFormato||{})
    .map(([cod,cajas])=>({fmt:tiposEmbalaje.find(t=>t.codigo===cod)||{nombre:cod,codigo:cod},cajas:Number(cajas),calibre:(oe.calibrePorFormato||{})[cod]||""}))
    .filter(x=>x.cajas>0);

  const ESTADO_COLOR = {borrador:C.yellow,confirmado:C.green,despachado:C.blue,cancelado:C.muted};
  const ESTADO_LABEL = {borrador:"◌ Borrador",confirmado:"✓ Confirmado",despachado:"🚢 Despachado",cancelado:"✗ Cancelado"};
  const estadoColor = ESTADO_COLOR[oe.estado||"borrador"]||C.muted;

  return (
    <div style={{
      background:C.card2,padding:14,borderRadius:10,
      border:`1px solid ${oe.estado==="despachado"?C.blue+"55":oe.estado==="cancelado"?C.border:C.teal+"44"}`,
      opacity:oe.estado==="cancelado"?0.6:1,
      gridColumn:(showPL||showCOMEX)?"1/-1":undefined,
    }}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:10}}>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:700,color:C.text,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            {oe.numero && <span style={{fontFamily:"monospace",color:C.blue,fontSize:12}}>{oe.numero}</span>}
            {oe.numero && <span style={{color:C.muted,fontSize:11}}>·</span>}
            <span>{exportadora?.nombre||"—"}</span>
            <span style={{color:C.muted,fontSize:11}}>→</span>
            <span>{cliente?.nombre||"—"}</span>
          </div>
          <div style={{fontSize:11,color:C.muted,marginTop:3,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            {especie && <span>{especie.icono} {especie.nombreEs}</span>}
            {oe.temporada && <span>· {oe.temporada}</span>}
            {oe.tipoEmbarque && <span>· {oe.tipoEmbarque==="maritimo"?"🚢 Marítimo":"✈ Aéreo"}</span>}
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
          <span style={{fontSize:9,padding:"2px 8px",borderRadius:4,background:`${estadoColor}22`,color:estadoColor,border:`1px solid ${estadoColor}44`,fontWeight:700}}>
            {ESTADO_LABEL[oe.estado||"borrador"]}
          </span>
          {canEdit && (
            <div style={{display:"flex",gap:4,marginTop:2}}>
              <button onClick={onEditar} style={{...btnSt(C.blue,true),padding:"3px 8px",fontSize:10}}>✎</button>
              <button onClick={onEliminar} style={{...btnSt(C.accent,true),padding:"3px 8px",fontSize:10}}>×</button>
            </div>
          )}
        </div>
      </div>

      {/* Ruta + Naviera */}
      {(oe.origen||oe.destino||oe.navieraAerolinea) && (
        <div style={{fontSize:11,color:C.text,marginBottom:8,display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
          {oe.origen && <span style={{color:C.teal,fontWeight:600}}>{oe.origen}</span>}
          {(oe.origen&&oe.destino) && <span style={{color:C.muted}}>→</span>}
          {oe.destino && <span style={{color:C.teal,fontWeight:600}}>{oe.destino}</span>}
          {oe.navieraAerolinea && <span style={{color:C.muted}}>· {oe.navieraAerolinea}</span>}
          {oe.numeroContenedor && <span style={{fontFamily:"monospace",fontSize:10,color:C.muted2}}>· {oe.numeroContenedor}</span>}
        </div>
      )}

      {/* Notify */}
      {oe.notify?.nombre && (
        <div style={{fontSize:10,color:C.muted,marginBottom:8}}>
          Notify: <span style={{color:C.text}}>{oe.notify.nombre}</span>
          {oe.notify.contacto && <span> · {oe.notify.contacto}</span>}
        </div>
      )}

      {/* Formatos */}
      {formatosConCajas.length>0 && (
        <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:8}}>
          {formatosConCajas.map(({fmt,cajas,calibre})=>(
            <span key={fmt.codigo||fmt.nombre} style={{padding:"3px 10px",borderRadius:4,fontSize:10,background:`${C.blue}22`,color:C.blue,border:`1px solid ${C.blue}33`}}>
              {fmt.nombre}: {cajas.toLocaleString("es-CL")} cjs{calibre?` · cal ${calibre}`:""}
            </span>
          ))}
        </div>
      )}

      {/* KPIs + botón PL */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,padding:"8px 0",borderTop:`1px solid ${C.border}`,fontSize:11}}>
        <div>
          <div style={{color:C.muted,fontSize:9,textTransform:"uppercase"}}>Total cajas</div>
          <div style={{color:C.text,fontWeight:700,fontFamily:"monospace"}}>{totalCajas>0?totalCajas.toLocaleString("es-CL"):"—"}</div>
        </div>
        <div>
          <div style={{color:C.muted,fontSize:9,textTransform:"uppercase"}}>ETD</div>
          <div style={{color:C.text,fontWeight:700}}>{oe.fechaDespacho||"—"}</div>
        </div>
        <div>
          <div style={{color:C.muted,fontSize:9,textTransform:"uppercase"}}>ETA</div>
          <div style={{color:C.text,fontWeight:700}}>{oe.fechaETA||"—"}</div>
        </div>
      </div>

      {oe.observ && (
        <div style={{marginTop:8,fontSize:11,color:C.muted,fontStyle:"italic",borderTop:`1px solid ${C.border}`,paddingTop:6}}>
          {oe.observ}
        </div>
      )}

      {/* Botones PL + COMEX */}
      <div style={{marginTop:10,paddingTop:8,borderTop:`1px solid ${C.border}`,display:"flex",gap:8,flexWrap:"wrap"}}>
        <button onClick={()=>{ setShowPL(v=>!v); setShowCOMEX(false); }}
          style={{...btnSt(C.teal,!showPL),fontSize:11,display:"flex",alignItems:"center",gap:5}}>
          📋 Packing List
          {oe.packingList?.pallets?.length>0 && (
            <span style={{background:`${C.teal}33`,borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:700}}>
              {oe.packingList.pallets.length} pallets
            </span>
          )}
          <span style={{fontSize:10,opacity:0.7}}>{showPL?"▲":"▼"}</span>
        </button>
        <button onClick={()=>{ setShowCOMEX(v=>!v); setShowPL(false); }}
          style={{...btnSt(C.purple,!showCOMEX),fontSize:11,display:"flex",alignItems:"center",gap:5}}>
          📁 COMEX
          {(()=>{
            const { ok, total, faltan, completo } = comexEstado(oe);
            const col = completo ? C.green : C.warning;
            return (
              <span style={{background:`${col}22`,color:col,border:`1px solid ${col}55`,borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:700}}>
                {completo ? `✓ ${ok}/${total}` : `⚠ faltan ${faltan}`}
              </span>
            );
          })()}
          <span style={{fontSize:10,opacity:0.7}}>{showCOMEX?"▲":"▼"}</span>
        </button>
      </div>

      {showPL && (
        <PackingListPanel oe={oe} tiposEmbalaje={tiposEmbalaje} especies={especies}
          exportadoras={exportadoras} clientes={clientes} onGuardar={onGuardarPL} canEdit={canEdit}/>
      )}
      {showCOMEX && (
        <CarpetaComexPanel oe={oe} onGuardar={onGuardarCOMEX} canEdit={canEdit}/>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// FILA DE LISTA de una OE (vista compacta tipo tabla, expandible a
// Packing List / Carpeta COMEX). Reutiliza los mismos paneles que la card.
// ═══════════════════════════════════════════════════════════════════
function OERow({oe, exportadoras, clientes, especies, onVer, onEditar, onEliminar, canEdit}) {
  const exportadora = exportadoras.find(e=>e.id===oe.exportadoraId);
  const cliente     = clientes.find(c=>c.id===oe.clienteId);
  const especie     = especies.find(e=>e.codigo===oe.especieCodigo);
  const totalCajas  = Object.values(oe.cajasPorFormato||{}).reduce((s,v)=>s+Number(v||0),0);
  const ESTADO_COLOR = {borrador:C.yellow,confirmado:C.green,despachado:C.blue,cancelado:C.muted};
  const ESTADO_LABEL = {borrador:"◌ Borrador",confirmado:"✓ Confirmado",despachado:"🚢 Despachado",cancelado:"✗ Cancelado"};
  const estadoColor = ESTADO_COLOR[oe.estado||"borrador"]||C.muted;
  const cx = comexEstado(oe);
  const via = (oe.tipoEmbarque||"maritimo")==="aereo" ? "✈" : "🚢";
  const td = {padding:"7px 10px",borderTop:`1px solid ${C.border}`,verticalAlign:"middle"};
  return (
    <tr onClick={()=>onVer(oe)} title="Ver detalle del embarque"
      style={{opacity:oe.estado==="cancelado"?0.55:1, cursor:"pointer"}}>
      <td style={{...td,textAlign:"center",color:C.muted}}>›</td>
      <td style={{...td,fontFamily:"monospace",color:C.blue,whiteSpace:"nowrap"}}>{oe.numero||"—"}</td>
      <td style={{...td,whiteSpace:"nowrap"}}>{especie?`${especie.icono||""} ${especie.nombreEs}`:(oe.especieCodigo||"—")}</td>
      <td style={{...td}}>
        <div style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:260}}>
          <span style={{fontWeight:600}}>{exportadora?.nombre||"—"}</span>
          <span style={{color:C.muted}}> → </span>
          <span>{cliente?.nombre||"—"}</span>
        </div>
        {(oe.origen||oe.destino) && <div style={{fontSize:9.5,color:C.muted2,whiteSpace:"nowrap"}}>{oe.origen||"—"} → {oe.destino||"—"}{oe.numeroContenedor?` · ${oe.numeroContenedor}`:""}</div>}
      </td>
      <td style={{...td,textAlign:"center",fontSize:13}} title={(oe.tipoEmbarque||"maritimo")==="aereo"?"Aéreo":"Marítimo"}>{via}</td>
      <td style={{...td,textAlign:"right",fontFamily:"monospace",fontWeight:700}}>{totalCajas>0?totalCajas.toLocaleString("es-CL"):"—"}</td>
      <td style={{...td,whiteSpace:"nowrap"}}>{oe.fechaDespacho||"—"}</td>
      <td style={{...td,whiteSpace:"nowrap"}}>{oe.fechaETA||"—"}</td>
      <td style={{...td,textAlign:"center"}}>
        <span style={{fontSize:9,padding:"2px 7px",borderRadius:4,background:`${estadoColor}22`,color:estadoColor,border:`1px solid ${estadoColor}44`,fontWeight:700,whiteSpace:"nowrap"}}>{ESTADO_LABEL[oe.estado||"borrador"]}</span>
      </td>
      <td style={{...td,textAlign:"center"}}>
        <span title="Documentos COMEX obligatorios (Packing List, Full Set, QC)" style={{fontSize:9,padding:"2px 7px",borderRadius:10,fontWeight:700,whiteSpace:"nowrap",background:`${cx.completo?C.green:C.warning}22`,color:cx.completo?C.green:C.warning,border:`1px solid ${cx.completo?C.green:C.warning}55`}}>
          {cx.completo?`✓ ${cx.ok}/${cx.total}`:`⚠ ${cx.ok}/${cx.total}`}
        </span>
      </td>
      <td style={{...td,textAlign:"right",whiteSpace:"nowrap"}} onClick={e=>e.stopPropagation()}>
        <button onClick={()=>onVer(oe)} title="Ver detalle" style={{...btnSt(C.teal,true),padding:"3px 8px",fontSize:10,marginRight:3}}>👁 Ver</button>
        {canEdit && <button onClick={onEditar} title="Editar" style={{...btnSt(C.blue,true),padding:"3px 7px",fontSize:10,marginRight:3}}>✎</button>}
        {canEdit && <button onClick={onEliminar} title="Eliminar" style={{...btnSt(C.accent,true),padding:"3px 7px",fontSize:10}}>×</button>}
      </td>
    </tr>
  );
}

// DETALLE DE EMBARQUE — página completa con secciones (General / Packing List /
// Documentos COMEX + QC / Liquidación). Reemplaza la expansión gigante en la fila.
function OEDetalle({ oe, exportadoras, clientes, especies, tiposEmbalaje, contratos, liquidaciones, onBack, onEditar, onGuardarPL, onGuardarCOMEX, canEdit }) {
  const [sec, setSec] = useState("general");
  const exportadora = exportadoras.find(e=>e.id===oe.exportadoraId);
  const cliente     = clientes.find(c=>c.id===oe.clienteId);
  const especie     = especies.find(e=>e.codigo===oe.especieCodigo);
  const closure     = (contratos||[]).find(c=>c.id===oe.closureId);
  const cx = comexEstado(oe);
  const totalCajas  = Object.values(oe.cajasPorFormato||{}).reduce((s,v)=>s+Number(v||0),0);
  const liqs = (liquidaciones||[]).filter(l=>l.oeId===oe.id);
  const ESTADO_LABEL = {borrador:"◌ Borrador",confirmado:"✓ Confirmado",despachado:"🚢 Despachado",cancelado:"✗ Cancelado"};
  const nPallets = oe.packingList?.pallets?.length||0;
  const secs = [
    {k:"general",  l:"General"},
    {k:"pl",       l:`📋 Packing List${nPallets?` (${nPallets})`:""}`},
    {k:"comex",    l:`📁 Documentos / QC ${cx.completo?"✓":`⚠ ${cx.ok}/${cx.total}`}`},
    {k:"liq",      l:`💰 Liquidación${liqs.length?` (${liqs.length})`:""}`},
  ];
  const Campo = ({lab,val})=>(
    <div><div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:0.3}}>{lab}</div><div style={{fontSize:12,color:C.text,fontWeight:600}}>{val||"—"}</div></div>
  );
  return (
    <div>
      {/* Cabecera de detalle + volver */}
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12,flexWrap:"wrap"}}>
        <button onClick={onBack} style={{...btnSt(C.muted,true),fontSize:12}}>← Volver a Embarques</button>
        {canEdit && <button onClick={()=>onEditar(oe)} style={{...btnSt(C.blue),fontSize:12}}>✎ Editar</button>}
        <div style={{marginLeft:"auto",fontSize:13,fontWeight:700}}>
          <span style={{fontFamily:"monospace",color:C.blue}}>{oe.numero||"OE"}</span> · {exportadora?.nombre||"—"} → {cliente?.nombre||"—"}
          <span style={{marginLeft:8,fontSize:10,padding:"2px 8px",borderRadius:4,background:`${C.blue}22`,color:C.blue,border:`1px solid ${C.blue}44`}}>{ESTADO_LABEL[oe.estado||"borrador"]}</span>
        </div>
      </div>
      {/* Sub-secciones */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",borderBottom:`1px solid ${C.border}`,paddingBottom:10,marginBottom:14}}>
        {secs.map(s=>(
          <button key={s.k} onClick={()=>setSec(s.k)} style={{...btnSt(sec===s.k?C.blue:C.muted, sec!==s.k),fontSize:11,padding:"6px 11px"}}>{s.l}</button>
        ))}
      </div>

      {sec==="general" && (
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:15}}>
            <div style={{fontSize:12,fontWeight:700,marginBottom:10}}>Comercial</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12}}>
              <Campo lab="Exportador" val={exportadora?.nombre}/>
              <Campo lab="Cliente" val={cliente?.nombre}/>
              <Campo lab="Especie" val={especie?`${especie.icono||""} ${especie.nombreEs}`:oe.especieCodigo}/>
              <Campo lab="Temporada" val={oe.temporada}/>
              <Campo lab="Business Closure" val={closure?`${closure.codigo||closure.temporada}`:"—"}/>
              <Campo lab="Total cajas" val={totalCajas>0?totalCajas.toLocaleString("es-CL"):"—"}/>
            </div>
          </div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:15}}>
            <div style={{fontSize:12,fontWeight:700,marginBottom:10}}>Logística</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12}}>
              <Campo lab="Vía" val={(oe.tipoEmbarque||"maritimo")==="aereo"?"✈ Aéreo":"🚢 Marítimo"}/>
              <Campo lab="Origen" val={oe.origen}/>
              <Campo lab="Destino" val={oe.destino}/>
              <Campo lab="ETD" val={oe.fechaDespacho}/>
              <Campo lab="ETA" val={oe.fechaETA}/>
              <Campo lab="Naviera / Aerolínea" val={oe.navieraAerolinea}/>
              <Campo lab="N° Contenedor / Vuelo" val={oe.numeroContenedor}/>
              <Campo lab="Notify" val={oe.notify?.nombre}/>
            </div>
          </div>
          {oe.observ && <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:15,fontSize:12,color:C.muted,fontStyle:"italic"}}>{oe.observ}</div>}
          <div style={{fontSize:10,color:C.muted2}}>
            {oe.fechaCreacion && <span>Creado: {String(oe.fechaCreacion).slice(0,10)} · </span>}
            {oe.fechaActualizacion && <span>Actualizado: {String(oe.fechaActualizacion).slice(0,10)}</span>}
          </div>
        </div>
      )}
      {sec==="pl"    && <PackingListPanel oe={oe} tiposEmbalaje={tiposEmbalaje} especies={especies} exportadoras={exportadoras} clientes={clientes} onGuardar={onGuardarPL} canEdit={canEdit}/>}
      {sec==="comex" && <CarpetaComexPanel oe={oe} onGuardar={onGuardarCOMEX} canEdit={canEdit}/>}
      {sec==="liq"   && (
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflowX:"auto"}}>
          {liqs.length===0 ? <div style={{padding:24,textAlign:"center",color:C.muted2,fontSize:12}}>Este embarque aún no tiene liquidaciones. Se crean en 💰 Liquidaciones.</div> :
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5,minWidth:520}}>
            <thead><tr style={{background:C.card2,color:C.muted,textAlign:"left"}}>
              <th style={{padding:"8px 10px"}}>Fecha</th><th style={{padding:"8px 10px"}}>Estado</th><th style={{padding:"8px 10px",textAlign:"right"}}>Venta USD</th><th style={{padding:"8px 10px",textAlign:"right"}}>Comisión Frisku USD</th>
            </tr></thead>
            <tbody>
              {liqs.map(l=>(
                <tr key={l.id} style={{borderTop:`1px solid ${C.border}`}}>
                  <td style={{padding:"7px 10px",whiteSpace:"nowrap"}}>{l.fechaLiquidacion||"—"}</td>
                  <td style={{padding:"7px 10px"}}>{l.estado||"borrador"}</td>
                  <td style={{padding:"7px 10px",textAlign:"right",fontFamily:"monospace"}}>{fmtUSD0(mVentaUSD(l))}</td>
                  <td style={{padding:"7px 10px",textAlign:"right",fontFamily:"monospace",color:C.green,fontWeight:700}}>{fmtUSD0(mComFriskuUSD(l))}</td>
                </tr>
              ))}
            </tbody>
          </table>}
        </div>
      )}
    </div>
  );
}

// EMBARQUES — perspectiva agrupada (Semana ETD / Cliente / Exportador / Especie /
// Estado) sobre la misma lista filtrada. Resumen por grupo → expandir a los
// embarques → Ver detalle. Operacional (no duplica datos).
function OEPerspectiva({ dim, embarques, exportadoras, clientes, especies, tiposEmbalaje=[], onVer }) {
  const [exp,setExp]=useState(()=>new Set());
  const espLab=(c)=>{ const e=especies.find(x=>x.codigo===c); return e?`${e.icono||""} ${e.nombreEs}`.trim():(c||"—"); };
  const cliName=(id)=>clientes.find(c=>c.id===id)?.nombre||"—";
  const expName=(id)=>exportadoras.find(e=>e.id===id)?.nombre||"—";
  const cajasDe=(oe)=>Object.values(oe.cajasPorFormato||{}).reduce((s,v)=>s+Number(v||0),0);
  const kilosDe=(oe)=>Object.entries(oe.cajasPorFormato||{}).reduce((s,[fmt,v])=>s+Number(v||0)*pesoNetoPorCaja(fmt,tiposEmbalaje),0);
  const keyLab=(oe)=>{
    if(dim==="semana"){ const k=oe.fechaDespacho?getMondayStr(oe.fechaDespacho):"—"; return {k, lab:k==="—"?"Sin ETD":`Semana ${k}`}; }
    if(dim==="cliente")    return {k:oe.clienteId||"—", lab:cliName(oe.clienteId)};
    if(dim==="exportador") return {k:oe.exportadoraId||"—", lab:expName(oe.exportadoraId)};
    if(dim==="especie")    return {k:oe.especieCodigo||"—", lab:espLab(oe.especieCodigo)};
    return {k:oe.estado||"borrador", lab:(oe.estado||"borrador")};
  };
  const grupos = useMemo(()=>{
    const m={};
    embarques.forEach(oe=>{ const {k,lab}=keyLab(oe); (m[k]=m[k]||{key:k,lab,oes:[]}).oes.push(oe); });
    return Object.values(m).map(g=>{ let cajas=0,fcl=0,kilos=0; const clis=new Set(),exps=new Set(),esps=new Set();
      g.oes.forEach(oe=>{ cajas+=cajasDe(oe); kilos+=kilosDe(oe); if((oe.tipoEmbarque||"maritimo")!=="aereo"&&(oe.estado||"borrador")!=="cancelado")fcl++;
        if(oe.clienteId)clis.add(oe.clienteId); if(oe.exportadoraId)exps.add(oe.exportadoraId); if(oe.especieCodigo)esps.add(oe.especieCodigo); });
      return {...g, n:g.oes.length, cajas, fcl, kilos, clis:clis.size, exps:exps.size, esps:esps.size}; })
      .sort((a,b)=> dim==="semana" ? String(a.key).localeCompare(String(b.key)) : (b.n-a.n));
  },[embarques,dim,exportadoras,clientes,especies,tiposEmbalaje]);
  const relLabel=(g)=> dim==="cliente" ? `${g.exps} exp · ${g.esps} esp` : dim==="exportador" ? `${g.clis} cli · ${g.esps} esp` : dim==="especie" ? `${g.exps} exp · ${g.clis} cli` : `${g.exps} exp · ${g.clis} cli · ${g.esps} esp`;
  const t=(k)=>setExp(p=>{const n=new Set(p);n.has(k)?n.delete(k):n.add(k);return n;});
  return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        <button onClick={()=>setExp(new Set(grupos.map(g=>g.key)))} style={{...btnSt(C.muted,true),fontSize:11}}>Expandir todo</button>
        <button onClick={()=>setExp(new Set())} style={{...btnSt(C.muted,true),fontSize:11}}>Contraer todo</button>
      </div>
      {grupos.length===0 && <div style={{padding:40,textAlign:"center",color:C.muted,fontSize:13}}>Sin embarques para esta vista/filtros.</div>}
      {grupos.map(g=>{ const o=exp.has(g.key); return (
        <div key={g.key} style={{background:C.card2,border:`1px solid ${C.border}`,borderRadius:10,marginBottom:8,overflow:"hidden"}}>
          <div onClick={()=>t(g.key)} style={{padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",background:o?`${C.blue}0a`:"transparent"}}>
            <span style={{color:C.muted}}>{o?"▾":"▸"}</span>
            <span style={{fontSize:13,fontWeight:700,flex:1,minWidth:140,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{g.lab}</span>
            <span style={{fontSize:11,color:C.muted}}>{relLabel(g)}</span>
            <span style={{fontSize:11,fontFamily:"monospace"}}><b>{g.n}</b> OE · <b style={{color:C.teal}}>{g.fcl}</b> FCL · {g.cajas.toLocaleString("es-CL")} cjs · {fmtN0(g.kilos)} kg</span>
          </div>
          {o && (
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:640}}>
                <tbody>
                  {g.oes.slice().sort((a,b)=>String(a.fechaDespacho||"").localeCompare(String(b.fechaDespacho||""))).map(oe=>{ const esp=especies.find(e=>e.codigo===oe.especieCodigo); const cx=comexEstado(oe);
                    return <tr key={oe.id} onClick={()=>onVer(oe)} title="Ver detalle" style={{cursor:"pointer",borderTop:`1px solid ${C.border}`}}>
                      <td style={{padding:"6px 12px",fontFamily:"monospace",color:C.blue,whiteSpace:"nowrap"}}>{oe.numero||"—"}</td>
                      <td style={{padding:"6px 8px",whiteSpace:"nowrap"}}>{esp?`${esp.icono||""} ${esp.nombreEs}`:(oe.especieCodigo||"—")}</td>
                      <td style={{padding:"6px 8px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:220}}>{expName(oe.exportadoraId)} → {cliName(oe.clienteId)}</td>
                      <td style={{padding:"6px 8px",whiteSpace:"nowrap"}}>{oe.fechaDespacho||"—"}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"monospace"}}>{cajasDe(oe).toLocaleString("es-CL")}</td>
                      <td style={{padding:"6px 8px",textAlign:"center"}}><span style={{fontSize:9,padding:"1px 6px",borderRadius:8,fontWeight:700,background:`${cx.completo?C.green:C.warning}22`,color:cx.completo?C.green:C.warning,border:`1px solid ${cx.completo?C.green:C.warning}55`}}>{cx.ok}/{cx.total}</span></td>
                      <td style={{padding:"6px 12px",textAlign:"right"}}><button onClick={(e)=>{e.stopPropagation();onVer(oe);}} style={{...btnSt(C.teal,true),padding:"3px 8px",fontSize:10}}>👁 Ver</button></td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ); })}
    </div>
  );
}

// LIQUIDACIONES — perspectiva agrupada (Cliente / Exportador / Estado / Temporada)
// sobre la misma lista filtrada. Preparada aunque hoy haya poca data. Montos con
// las primitivas únicas del motor.
function LiqPerspectiva({ dim, liqs, embarques, exportadoras, clientes, especies, onVer }) {
  const [exp,setExp]=useState(()=>new Set());
  const cliName=(id)=>clientes.find(c=>c.id===id)?.nombre||"—";
  const expName=(id)=>exportadoras.find(e=>e.id===id)?.nombre||"—";
  const oeOf=(l)=>embarques.find(e=>e.id===l.oeId);
  const keyLab=(l)=>{ const oe=oeOf(l);
    if(dim==="cliente")    return {k:oe?.clienteId||"—", lab:cliName(oe?.clienteId)};
    if(dim==="exportador") return {k:oe?.exportadoraId||"—", lab:expName(oe?.exportadoraId)};
    if(dim==="temporada")  return {k:l.temporada||"—", lab:l.temporada||"— s/temp —"};
    return {k:l.estado||"borrador", lab:(l.estado||"borrador")};
  };
  const grupos = useMemo(()=>{
    const m={};
    liqs.forEach(l=>{ const {k,lab}=keyLab(l); (m[k]=m[k]||{key:k,lab,liqs:[]}).liqs.push(l); });
    return Object.values(m).map(g=>{ let venta=0,comF=0,comC=0; g.liqs.forEach(l=>{ venta+=mVentaUSD(l); comF+=mComFriskuUSD(l); comC+=mComClienteUSD(l); });
      return {...g, n:g.liqs.length, venta, comF, comC}; })
      .sort((a,b)=> dim==="temporada" ? String(b.key).localeCompare(String(a.key)) : (b.comF-a.comF)||(b.n-a.n));
  },[liqs,dim,embarques,exportadoras,clientes]);
  const t=(k)=>setExp(p=>{const n=new Set(p);n.has(k)?n.delete(k):n.add(k);return n;});
  return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        <button onClick={()=>setExp(new Set(grupos.map(g=>g.key)))} style={{...btnSt(C.muted,true),fontSize:11}}>Expandir todo</button>
        <button onClick={()=>setExp(new Set())} style={{...btnSt(C.muted,true),fontSize:11}}>Contraer todo</button>
      </div>
      {grupos.length===0 && <div style={{padding:40,textAlign:"center",color:C.muted,fontSize:13}}>Sin liquidaciones para esta vista/filtros.</div>}
      {grupos.map(g=>{ const o=exp.has(g.key); return (
        <div key={g.key} style={{background:C.card2,border:`1px solid ${C.border}`,borderRadius:10,marginBottom:8,overflow:"hidden"}}>
          <div onClick={()=>t(g.key)} style={{padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",background:o?`${C.blue}0a`:"transparent"}}>
            <span style={{color:C.muted}}>{o?"▾":"▸"}</span>
            <span style={{fontSize:13,fontWeight:700,flex:1,minWidth:140,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{g.lab}</span>
            <span style={{fontSize:11,fontFamily:"monospace"}}><b>{g.n}</b> liq · venta {fmtUSD0(g.venta)} · com. cliente {fmtUSD0(g.comC)} · <b style={{color:C.green}}>{fmtUSD0(g.comF)}</b> com. Frisku</span>
          </div>
          {o && (
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:560}}>
                <tbody>
                  {g.liqs.slice().sort((a,b)=>String(b.fechaLiquidacion||"").localeCompare(String(a.fechaLiquidacion||""))).map(l=>{ const oe=oeOf(l);
                    return <tr key={l.id} onClick={()=>onVer(l)} title="Ver detalle" style={{cursor:"pointer",borderTop:`1px solid ${C.border}`}}>
                      <td style={{padding:"6px 12px",whiteSpace:"nowrap"}}>{l.fechaLiquidacion||"—"}</td>
                      <td style={{padding:"6px 8px",fontFamily:"monospace",color:C.blue,whiteSpace:"nowrap"}}>{oe?.numero||"—"}</td>
                      <td style={{padding:"6px 8px",whiteSpace:"nowrap"}}>{l.estado||"borrador"}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"monospace"}}>{fmtUSD0(mVentaUSD(l))}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"monospace",color:C.green,fontWeight:700}}>{fmtUSD0(mComFriskuUSD(l))}</td>
                      <td style={{padding:"6px 12px",textAlign:"right"}}><button onClick={(e)=>{e.stopPropagation();onVer(l);}} style={{...btnSt(C.teal,true),padding:"3px 8px",fontSize:10}}>👁 Ver</button></td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ); })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PLACEHOLDER GENÉRICO — tabs que se construyen en fases siguientes
// ═══════════════════════════════════════════════════════════════════
function Placeholder({titulo, icono, fase, descripcion}) {
  return (
    <div style={{padding:40, textAlign:"center", background:C.card, borderRadius:14, border:`1px dashed ${C.border}`}}>
      <div style={{fontSize:48, marginBottom:14}}>{icono}</div>
      <h3 style={{margin:"0 0 8px", color:C.text, fontSize:18}}>{titulo}</h3>
      <div style={{color:C.muted, fontSize:12, marginBottom:14, maxWidth:500, margin:"0 auto 14px"}}>{descripcion}</div>
      <span style={{
        padding:"4px 12px", borderRadius:12, background:`${C.yellow}22`,
        color:C.yellow, fontSize:11, fontWeight:600, border:`1px solid ${C.yellow}44`,
      }}>{fase}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MODAL IMPORTADOR DE EXCEL
// Flujo: seleccionar archivo -> preview con desglose y conflictos
//        -> confirmar -> guarda en Supabase las 4 categorías
// ═══════════════════════════════════════════════════════════════════
function ImportadorExcelModal({clientes, exportadoras, onAplicar, onCerrar}) {
  const [etapa, setEtapa] = useState("seleccion"); // seleccion | preview | aplicando | listo
  const [error, setError] = useState("");
  const [plan, setPlan] = useState(null);
  const fileRef = useRef(null);

  const cargarArchivo = async (file) => {
    if(!file) return;
    setError("");
    try {
      const filasRaw = await leerExcelEntidades(file);
      if(!filasRaw.length) { setError("El archivo no tiene filas de datos."); return; }
      const {porDestino, errores} = procesarFilas(filasRaw);

      // Cargar notify, consignatarios y maestro de países desde Supabase
      const [ntActual, cnActual, paisesActual] = await Promise.all([
        dbLoadGeneric("maestro_notify"),
        dbLoadGeneric("maestro_consignatarios"),
        dbLoadGeneric("maestro_paises"),
      ]);

      // Mapa nombre/código del país (es/en/ISO) -> código ISO.
      // El Excel trae el país como texto plano ("CHILE", "Perú", "China"),
      // así que sin esto las entidades importadas se muestran sin bandera.
      const paisesList = Array.isArray(paisesActual) ? paisesActual : [];
      const paisIdx = {};
      paisesList.forEach(p => {
        if(!p.codigo) return;
        paisIdx[claveCmp(p.codigo)] = p.codigo;
        if(p.nombreEs) paisIdx[claveCmp(p.nombreEs)] = p.codigo;
        if(p.nombreEn) paisIdx[claveCmp(p.nombreEn)] = p.codigo;
      });
      const traducirPais = (txt) => paisIdx[claveCmp(txt)] || "";

      ["clientes","exportadoras","notify","consignatarios"].forEach(d => {
        porDestino[d].forEach(e => { e.paisCodigo = traducirPais(e.pais); });
      });
      const sinPais = [];
      ["clientes","exportadoras","notify","consignatarios"].forEach(d => {
        porDestino[d].forEach(e => {
          if(e.pais && !e.paisCodigo) sinPais.push(`${e.codigoEntidad} → "${e.pais}"`);
        });
      });
      if(sinPais.length) {
        errores.push(`${sinPais.length} entidad(es) con país sin código ISO mapeado (se importan sin bandera): ${sinPais.slice(0,5).join(", ")}${sinPais.length>5?"…":""}`);
      }

      const rCli = mergeClientes(clientes, porDestino.clientes);
      const rExp = mergeExportadoras(exportadoras, porDestino.exportadoras);
      const rNot = mergeSimple(Array.isArray(ntActual)?ntActual:[], porDestino.notify);
      const rCon = mergeSimple(Array.isArray(cnActual)?cnActual:[], porDestino.consignatarios);

      setPlan({
        totalFilas: filasRaw.length,
        errores,
        clientes:       {...rCli, entrantes:porDestino.clientes.length},
        exportadoras:   {...rExp, entrantes:porDestino.exportadoras.length},
        notify:         {...rNot, entrantes:porDestino.notify.length},
        consignatarios: {...rCon, entrantes:porDestino.consignatarios.length},
      });
      setEtapa("preview");
    } catch(e) {
      console.error("[Importador] Error:", e);
      setError("No se pudo leer el archivo. Verifica que sea un .xlsx válido. Detalle: " + e.message);
    }
  };

  const confirmar = async () => {
    setEtapa("aplicando");
    try {
      await dbSaveGeneric("maestro_notify", plan.notify.datos);
      await dbSaveGeneric("maestro_consignatarios", plan.consignatarios.datos);
      onAplicar({
        clientes: plan.clientes.datos,
        exportadoras: plan.exportadoras.datos,
      });
      setEtapa("listo");
    } catch(e) {
      console.error("[Importador] Error al aplicar:", e);
      setError("Error guardando en Supabase: " + e.message);
      setEtapa("preview");
    }
  };

  const ov = {position:"fixed", inset:0, background:"rgba(16,24,40,0.55)", zIndex:1000,
    display:"flex", alignItems:"center", justifyContent:"center", padding:20};
  const box = {background:C.card, borderRadius:14, border:`1px solid ${C.border}`,
    width:"100%", maxWidth:620, maxHeight:"85vh", overflowY:"auto", padding:22};

  const FilaResumen = ({icono, label, r}) => (
    <div style={{display:"flex", alignItems:"center", gap:10, padding:"10px 12px",
      background:C.card2, borderRadius:8, marginBottom:8}}>
      <span style={{fontSize:20}}>{icono}</span>
      <div style={{flex:1}}>
        <div style={{color:C.text, fontWeight:700, fontSize:13}}>{label}</div>
        <div style={{color:C.muted, fontSize:11}}>{r.entrantes} en el Excel</div>
      </div>
      <div style={{textAlign:"right", fontSize:11}}>
        <div style={{color:C.green, fontWeight:700}}>+{r.creados} nuevos</div>
        <div style={{color:C.yellow, fontWeight:700}}>~{r.actualizados} actualizados</div>
      </div>
    </div>
  );

  return (
    <div style={ov} onClick={(e)=>{ if(e.target===e.currentTarget && etapa!=="aplicando") onCerrar(); }}>
      <div style={box}>
        <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:16,
          borderBottom:`1px solid ${C.border}`, paddingBottom:12}}>
          <span style={{fontSize:22}}>📥</span>
          <h3 style={{margin:0, color:C.text, fontSize:16, flex:1}}>Importar entidades desde Excel</h3>
          {etapa!=="aplicando" && (
            <button onClick={onCerrar} style={btnSt(C.muted, true)}>✕ Cerrar</button>
          )}
        </div>

        {error && (
          <div style={{padding:"10px 12px", background:`${C.accent}22`, border:`1px solid ${C.accent}66`,
            borderRadius:8, color:C.text, fontSize:12, marginBottom:14}}>⚠️ {error}</div>
        )}

        {etapa === "seleccion" && (
          <div>
            <div style={{color:C.muted, fontSize:12, lineHeight:1.7, marginBottom:16}}>
              Selecciona el archivo <strong style={{color:C.text}}>clientes_frisku.xlsx</strong>.
              El importador detecta la columna <code>categoria</code> y reparte cada fila a
              Clientes, Exportadoras, Notify o Consignatarios automáticamente.
              <br/><br/>
              <strong style={{color:C.green}}>Merge no destructivo:</strong> si un cliente o
              exportadora ya existe, se actualizan solo los datos de identidad y contacto.
              Las comisiones, especies y certificaciones que ya configuraste se conservan intactas.
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls"
              onChange={e=>cargarArchivo(e.target.files?.[0])}
              style={{display:"none"}}/>
            <button onClick={()=>fileRef.current?.click()} style={{...btnSt(C.blue), padding:"12px 20px", fontSize:13}}>
              📂 Seleccionar archivo Excel
            </button>
          </div>
        )}

        {etapa === "preview" && plan && (
          <div>
            <div style={{color:C.muted, fontSize:12, marginBottom:14}}>
              Se leyeron <strong style={{color:C.text}}>{plan.totalFilas}</strong> filas.
              Revisa el desglose antes de confirmar:
            </div>
            <FilaResumen icono="👥" label="Clientes"       r={plan.clientes}/>
            <FilaResumen icono="🏭" label="Exportadoras"   r={plan.exportadoras}/>
            <FilaResumen icono="🔔" label="Notify"         r={plan.notify}/>
            <FilaResumen icono="📦" label="Consignatarios" r={plan.consignatarios}/>

            {plan.errores.length > 0 && (
              <div style={{marginTop:12, padding:"10px 12px", background:`${C.yellow}18`,
                border:`1px solid ${C.yellow}55`, borderRadius:8}}>
                <div style={{color:C.yellow, fontWeight:700, fontSize:12, marginBottom:6}}>
                  ⚠️ {plan.errores.length} fila(s) con observaciones:
                </div>
                <ul style={{margin:0, paddingLeft:18, color:C.muted, fontSize:11, lineHeight:1.6}}>
                  {plan.errores.slice(0,8).map((e,i)=><li key={i}>{e}</li>)}
                  {plan.errores.length>8 && <li>… y {plan.errores.length-8} más</li>}
                </ul>
              </div>
            )}

            <div style={{marginTop:14, padding:"10px 12px", background:C.card2, borderRadius:8,
              fontSize:11, color:C.muted, lineHeight:1.6}}>
              💡 Los registros marcados <span style={{color:C.yellow}}>~actualizados</span> conservan
              sus comisiones y especies. Notify y Consignatarios se guardan en el tab Maestros
              (los verás al entrar a esa pestaña).
            </div>

            <div style={{display:"flex", gap:10, marginTop:18, justifyContent:"flex-end"}}>
              <button onClick={()=>{setEtapa("seleccion"); setPlan(null);}} style={btnSt(C.muted, true)}>
                ← Elegir otro archivo
              </button>
              <button onClick={confirmar} style={{...btnSt(C.green), padding:"8px 18px"}}>
                ✓ Confirmar importación
              </button>
            </div>
          </div>
        )}

        {etapa === "aplicando" && (
          <div style={{padding:30, textAlign:"center", color:C.muted}}>
            💾 Guardando en Supabase…
          </div>
        )}

        {etapa === "listo" && plan && (
          <div style={{padding:20, textAlign:"center"}}>
            <div style={{fontSize:42, marginBottom:10}}>✅</div>
            <h3 style={{margin:"0 0 8px", color:C.text}}>Importación completada</h3>
            <div style={{color:C.muted, fontSize:12, lineHeight:1.7, marginBottom:16}}>
              {plan.clientes.creados + plan.exportadoras.creados +
               plan.notify.creados + plan.consignatarios.creados} registros nuevos ·{" "}
              {plan.clientes.actualizados + plan.exportadoras.actualizados +
               plan.notify.actualizados + plan.consignatarios.actualizados} actualizados.
            </div>
            <button onClick={onCerrar} style={{...btnSt(C.blue), padding:"8px 20px"}}>Cerrar</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// LIQUIDACIONES — Fase 6
// ═══════════════════════════════════════════════════════════════════

const LIQ_ESTADOS = {
  borrador: { label:"Borrador", color:"#f59e0b" },
  enviada:  { label:"Enviada",  color:"#3b82f6" },
  pagada:   { label:"Pagada",   color:"#22c55e" },
};
const LIQ_ESTADO_SIG = { borrador:"enviada", enviada:"pagada" };

function LiquidacionForm({ liq, embarques, clientes, exportadoras, especies, monedas, tiposEmbalaje=[], tcData, onGuardar, onCancelar }) {
  const hoyISO = new Date().toISOString().slice(0,10);
  const [form, setForm] = useState({
    oeId:             liq?.oeId             || "",
    estado:           liq?.estado           || "borrador",
    fechaLiquidacion: liq?.fechaLiquidacion || hoyISO,
    baseNetaManual:   liq?.baseNetaManual != null ? String(liq.baseNetaManual)
                       : (liq?.ventaTotal == null && liq?.baseNeta != null ? String(liq.baseNeta) : ""),
    monedaBase:       liq?.monedaBase       || "USD",
    fechaTC:          liq?.fechaTC          || hoyISO,
    numeroFactura:    liq?.numeroFactura    || "",
    fechaFactura:     liq?.fechaFactura     || "",
    observ:           liq?.observ           || "",
  });
  const [ventaPorPallet, setVentaPorPallet] = useState(()=> ({...(liq?.ventaPorPallet||{})}) );
  const [mermaPorPallet, setMermaPorPallet] = useState(()=> ({...(liq?.mermaPorPallet||{})}) );
  const [gastosDestino,  setGastosDestino]  = useState(()=> Array.isArray(liq?.gastosDestino) ? liq.gastosDestino.map(g=>({...g})) : [] );
  const [anticipo,       setAnticipo]       = useState(()=> liq?.anticipo!=null ? String(liq.anticipo) : "");
  const f = k => e => setForm(p=>({...p,[k]:e.target.value}));
  const [buscarOE, setBuscarOE] = useState("");

  // Al elegir/cambiar la OE, la moneda de liquidación toma la del cliente
  // (ej. Global Fruit Point → EUR). No pisa la moneda guardada al abrir a editar.
  const primeraCargaLiq = useRef(true);
  useEffect(()=>{
    if(primeraCargaLiq.current){ primeraCargaLiq.current = false; return; }
    const oe  = embarques.find(e=>e.id===form.oeId);
    const cli = clientes.find(c=>c.id===oe?.clienteId);
    if(cli?.monedaCodigo) setForm(p=>({...p, monedaBase: cli.monedaCodigo}));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[form.oeId]);

  const oeSeleccionada  = embarques.find(e=>e.id===form.oeId);
  const clienteOE       = clientes.find(c=>c.id===oeSeleccionada?.clienteId);
  const exportadoraOE   = exportadoras.find(e=>e.id===oeSeleccionada?.exportadoraId);
  const especieOE       = especies.find(e=>e.codigo===oeSeleccionada?.especieCodigo);
  const monedasMap      = Object.fromEntries(monedas.map(m=>[m.codigo,m]));
  const tiposEmbMap     = Object.fromEntries((tiposEmbalaje||[]).map(t=>[t.codigo,t]));

  const pallets   = oeSeleccionada?.packingList?.pallets || [];
  const hayPallets = pallets.length > 0;
  const setVentaPallet = (pid, v) => setVentaPorPallet(prev=>({...prev, [pid]: v===""? "" : Number(v)}));
  const setMermaPallet = (pid, v) => setMermaPorPallet(prev=>({...prev, [pid]: v===""? "" : Number(v)}));

  const ventaPallets   = pallets.reduce((s,p)=> s + (Number(ventaPorPallet[p.id])||0), 0);
  const baseNetaManual = parseFloat(String(form.baseNetaManual).replace(/[^\d.\-]/g,"")) || 0;
  const ventaTotal     = hayPallets ? ventaPallets : baseNetaManual;

  // Cajas y merma
  const cajasEmbarcadas = pallets.reduce((s,p)=> s + (Number(p.cajas)||0), 0);
  const cajasMerma      = pallets.reduce((s,p)=> s + (Number(mermaPorPallet[p.id])||0), 0);
  const cajasVendidas   = Math.max(0, cajasEmbarcadas - cajasMerma);
  const precioPromCaja  = cajasVendidas>0 ? ventaTotal / cajasVendidas : 0;

  const addGasto = () => setGastosDestino(prev=>[...prev, {id:uid(), concepto:"", monto:""}]);
  const updGasto = (idx,k,v) => setGastosDestino(prev=>{ const a=[...prev]; a[idx]={...a[idx],[k]:v}; return a; });
  const delGasto = (idx) => setGastosDestino(prev=>prev.filter((_,i)=>i!==idx));
  const gastosTotal = gastosDestino.reduce((s,g)=> s + (Number(g.monto)||0), 0);
  const fob = ventaTotal - gastosTotal;
  const anticipoNum = parseFloat(String(anticipo).replace(/[^\d.\-]/g,"")) || 0;
  const saldoLiquidacion = fob - anticipoNum;   // saldo a liquidar al exportador (comisión Frisku es aparte)

  const tcCalculado = form.monedaBase==="USD" ? 1
    : buscarTC(form.monedaBase, "USD", form.fechaTC, tcData);
  const aUSD = (v) => v==null ? null : (form.monedaBase==="USD" ? v : (tcCalculado!=null ? v*tcCalculado : null));
  const ventaTotalUSD = aUSD(ventaTotal);
  const fobUSD        = aUSD(fob);

  // Comisión Frisku sobre el PRECIO DE VENTA (base = venta destino)
  const comision = (clienteOE && ventaTotal>0)
    ? calcularComisionFrisku(clienteOE, oeSeleccionada?.especieCodigo, "", ventaTotal)
    : null;
  const montoFriskuUSD = comision ? aUSD(comision.montoComisionFrisku) : null;

  const handleGuardar = () => {
    if(!form.oeId)       { alert("Selecciona una OE"); return; }
    if(!(ventaTotal>0))  { alert("Ingresa la venta (por pallet o base manual)"); return; }
    // Aviso: moneda ≠ USD sin TC → los montos en USD quedarán vacíos (no suman al total ni al BI).
    if(form.monedaBase!=="USD" && tcCalculado==null){
      if(!window.confirm(`No hay tipo de cambio ${form.monedaBase}→USD para la fecha ${form.fechaTC||"(hoy)"}.\n\nLa venta y la comisión en USD quedarán en blanco (no sumarán al Total Frisku ni a la Reportería) hasta que cargues la tasa en Maestros → Tipo de Cambio y vuelvas a guardar esta liquidación.\n\n¿Guardar de todas formas?`)) return;
    }
    onGuardar({
      ...liq,
      id: liq?.id || uid(),
      oeId: form.oeId,
      temporada: oeSeleccionada?.temporada || "",
      estado: form.estado,
      fechaLiquidacion: form.fechaLiquidacion,
      // Detalle por pallet + venta/gastos/FOB
      ventaPorPallet: {...ventaPorPallet},
      ventaTotal,
      ventaTotalUSD,
      // Cajas / merma / precio por caja
      mermaPorPallet: {...mermaPorPallet},
      cajasEmbarcadas,
      cajasMerma,
      cajasVendidas,
      precioPromCaja,
      precioPromCajaUSD: aUSD(precioPromCaja),
      gastosDestino: gastosDestino.map(g=>({...g, monto:Number(g.monto)||0})),
      gastosDestinoTotal: gastosTotal,
      fob,
      fobUSD,
      // Anticipo y saldo a liquidar al exportador (independiente de la comisión Frisku)
      anticipo: anticipoNum,
      anticipoUSD: aUSD(anticipoNum),
      saldoLiquidacion,
      saldoLiquidacionUSD: aUSD(saldoLiquidacion),
      baseNetaManual: hayPallets ? null : baseNetaManual,
      // baseNeta = venta total (base de la comisión) — compat con tarjetas/agregados
      baseNeta: ventaTotal,
      baseNetaUSD: ventaTotalUSD,
      monedaBase: form.monedaBase,
      fechaTC: form.fechaTC,
      tcUsado: tcCalculado,
      cliPct:               comision?.cliPct               ?? 0,
      friPct:               comision?.friPct               ?? 0,
      friSobreBaseNeta:     comision?.friSobreBaseNeta      ?? 0,
      montoComisionCliente: comision?.montoComisionCliente  ?? 0,
      montoComisionFrisku:  comision?.montoComisionFrisku   ?? 0,
      montoComisionFriskuUSD: montoFriskuUSD,
      numeroFactura: form.numeroFactura,
      fechaFactura:  form.fechaFactura,
      observ:        form.observ,
      fechaCreacion:      liq?.fechaCreacion || new Date().toISOString(),
      fechaActualizacion: new Date().toISOString(),
    });
  };

  const fmt = (v) => formatearMonto(v, form.monedaBase, monedasMap);

  return (
    <div style={{background:C.card, borderRadius:14, padding:20, marginBottom:20, border:`1px solid ${C.border}`}}>
      <h3 style={{margin:"0 0 16px", fontSize:14, color:C.text, fontWeight:700}}>
        {liq?.id ? "Editar liquidación" : "Nueva liquidación"}
      </h3>
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px,1fr))", gap:12}}>

        {/* OE */}
        <div style={{gridColumn:"1/-1"}}>
          <div style={lblSt}>Orden de embarque *</div>
          <input value={buscarOE} onChange={e=>setBuscarOE(e.target.value)}
            placeholder="🔍 Filtrar por N° contenedor o N° embarque…"
            style={{...inputSt, marginBottom:6}}/>
          <select value={form.oeId} onChange={f("oeId")} style={inputSt}>
            <option value="">— Selecciona una OE —</option>
            {[...embarques]
              .filter(oe=>{
                const q=buscarOE.trim().toLowerCase(); if(!q) return true;
                return (oe.numeroContenedor||"").toLowerCase().includes(q)
                  || (oe.numero||"").toLowerCase().includes(q);
              })
              .sort((a,b)=>(b.fechaCreacion||"").localeCompare(a.fechaCreacion||"")).map(oe=>{
              const exp = exportadoras.find(e=>e.id===oe.exportadoraId);
              const cli = clientes.find(c=>c.id===oe.clienteId);
              const esp = especies.find(e=>e.codigo===oe.especieCodigo);
              return (
                <option key={oe.id} value={oe.id}>
                  {oe.numero||oe.id.slice(-6)} · {oe.numeroContenedor||"s/cont"} — {exp?.nombre||"?"} → {cli?.nombre||"?"} {esp?.icono||""} T{oe.temporada||"?"} [{oe.estado||"borrador"}]
                </option>
              );
            })}
          </select>
          {oeSeleccionada && (
            <div style={{fontSize:11, color:C.muted, marginTop:4}}>
              {exportadoraOE?.nombre} → {clienteOE?.nombre} · {especieOE?.icono} {especieOE?.nombreEs} · T{oeSeleccionada.temporada}
              {!clienteOE && <span style={{color:C.accent}}> — cliente no encontrado, verificar la OE</span>}
            </div>
          )}
        </div>

        {/* Moneda + TC */}
        <div>
          <div style={lblSt}>Moneda</div>
          <select value={form.monedaBase} onChange={f("monedaBase")} style={inputSt}>
            {monedas.length
              ? monedas.map(m=><option key={m.codigo} value={m.codigo}>{m.simbolo} {m.codigo}</option>)
              : <><option value="USD">USD</option><option value="EUR">EUR</option><option value="CLP">CLP</option></>}
          </select>
        </div>
        {form.monedaBase!=="USD" && (<>
          <div>
            <div style={lblSt}>Fecha TC</div>
            <input type="date" value={form.fechaTC} onChange={f("fechaTC")} style={inputSt}/>
          </div>
          <div>
            <div style={lblSt}>TC {form.monedaBase}→USD</div>
            <input
              value={tcCalculado!=null ? tcCalculado.toFixed(6) : "sin datos en maestro TC"}
              readOnly
              style={{...inputSt, background:C.bg, color:tcCalculado!=null ? C.green : C.accent, fontStyle:"italic"}}
            />
          </div>
        </>)}

        {/* Detalle por pallet (packing list) */}
        {form.oeId && (
          <div style={{gridColumn:"1/-1"}}>
            <div style={{fontSize:12, fontWeight:700, color:C.teal, marginBottom:6}}>
              Detalle por pallet (packing list) — venta en {form.monedaBase}
            </div>
            {hayPallets ? (
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%", borderCollapse:"collapse", fontSize:11}}>
                  <thead>
                    <tr style={{background:C.primary}}>
                      {["#","Formato","Calibre","Cajas","Merma (cjs)","Venta ("+form.monedaBase+")","€/caja"].map((h,i)=>(
                        <th key={i} style={{padding:"6px 8px", textAlign:(i===0||i===3||i===4)?"center":(i===5||i===6)?"right":"left", color:C.primaryText, fontWeight:700, fontSize:10, whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pallets.map((p,idx)=>{
                      const cajasP = Number(p.cajas||0);
                      const mermaP = Number(mermaPorPallet[p.id]||0);
                      const vendidasP = Math.max(0, cajasP - mermaP);
                      const ventaP = Number(ventaPorPallet[p.id]||0);
                      const precioCajaP = vendidasP>0 ? ventaP/vendidasP : 0;
                      return (
                      <tr key={p.id||idx} style={{borderBottom:`1px solid ${C.border}22`, background:idx%2===0?C.card:C.rowAlt}}>
                        <td style={{padding:"4px 8px", textAlign:"center", color:C.muted2, fontFamily:"monospace", fontSize:10}}>{p.palletNum||idx+1}</td>
                        <td style={{padding:"4px 8px", color:C.text}}>{tiposEmbMap[p.formato]?.nombre||p.formato||"—"}</td>
                        <td style={{padding:"4px 8px", color:C.text}}>{p.calibre||"—"}</td>
                        <td style={{padding:"4px 8px", textAlign:"center", fontFamily:"monospace", color:C.text}}>{cajasP.toLocaleString("es-CL")}</td>
                        <td style={{padding:"4px 4px", textAlign:"center"}}>
                          <input type="number" step="1" min="0" value={mermaPorPallet[p.id] ?? ""}
                            onChange={e=>setMermaPallet(p.id, e.target.value)}
                            placeholder="0"
                            style={{...inputSt, width:70, textAlign:"center", padding:"4px 6px", fontFamily:"monospace"}}/>
                        </td>
                        <td style={{padding:"4px 4px", textAlign:"right"}}>
                          <input type="number" step="0.01" value={ventaPorPallet[p.id] ?? ""}
                            onChange={e=>setVentaPallet(p.id, e.target.value)}
                            style={{...inputSt, width:120, textAlign:"right", padding:"4px 6px", fontFamily:"monospace"}}/>
                        </td>
                        <td style={{padding:"4px 8px", textAlign:"right", fontFamily:"monospace", color:precioCajaP>0?C.teal:C.muted, fontSize:10}}>{precioCajaP>0?fmt(precioCajaP):"—"}</td>
                      </tr>
                      );
                    })}
                    <tr style={{borderTop:`1px solid ${C.border}`, background:`${C.bg}66`}}>
                      <td colSpan={3} style={{padding:"6px 8px", textAlign:"right", fontWeight:700, color:C.muted, fontSize:10}}>TOTAL VENTA</td>
                      <td style={{padding:"6px 8px", textAlign:"center", fontWeight:700, fontFamily:"monospace", color:C.text}}>{cajasEmbarcadas.toLocaleString("es-CL")}</td>
                      <td style={{padding:"6px 8px", textAlign:"center", fontWeight:700, fontFamily:"monospace", color:cajasMerma>0?C.accent:C.muted}}>{cajasMerma>0?cajasMerma.toLocaleString("es-CL"):"—"}</td>
                      <td style={{padding:"6px 8px", textAlign:"right", fontWeight:700, fontFamily:"monospace", color:C.green}}>{fmt(ventaTotal)}</td>
                      <td style={{padding:"6px 8px", textAlign:"right", fontWeight:700, fontFamily:"monospace", color:C.teal, fontSize:10}}>{precioPromCaja>0?fmt(precioPromCaja):"—"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{background:C.bg2, borderRadius:8, padding:10, border:`1px dashed ${C.border}`}}>
                <div style={{fontSize:11, color:C.muted, marginBottom:6}}>
                  Esta OE no tiene packing list cargado. Ingresa la venta total manualmente:
                </div>
                <input value={form.baseNetaManual} onChange={f("baseNetaManual")} style={{...inputSt, maxWidth:200}} placeholder="Venta total"/>
              </div>
            )}
          </div>
        )}

        {/* Gastos en destino */}
        {form.oeId && (
          <div style={{gridColumn:"1/-1"}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6}}>
              <div style={{fontSize:12, fontWeight:700, color:C.accent}}>Gastos en destino</div>
              <button onClick={addGasto} style={{...btnSt(C.accent,true), fontSize:11, padding:"3px 8px"}}>+ Agregar gasto</button>
            </div>
            {gastosDestino.length===0 ? (
              <div style={{fontSize:11, color:C.muted, fontStyle:"italic"}}>Sin gastos en destino.</div>
            ) : (
              <div style={{display:"flex", flexDirection:"column", gap:5}}>
                {gastosDestino.map((g,idx)=>(
                  <div key={g.id||idx} style={{display:"flex", gap:6, alignItems:"center"}}>
                    <input value={g.concepto} onChange={e=>updGasto(idx,"concepto",e.target.value)}
                      list="gastos-destino-list" placeholder="Concepto (flete, handling, comisión destino…)"
                      style={{...inputSt, flex:1, padding:"4px 8px", fontSize:11}}/>
                    <input type="number" step="0.01" value={g.monto} onChange={e=>updGasto(idx,"monto",e.target.value)}
                      placeholder="0.00" style={{...inputSt, width:120, textAlign:"right", padding:"4px 6px", fontFamily:"monospace"}}/>
                    <button onClick={()=>delGasto(idx)} style={{...btnSt(C.accent,true), padding:"3px 8px", fontSize:11}}>×</button>
                  </div>
                ))}
                <datalist id="gastos-destino-list">
                  {["Flete marítimo","Flete aéreo","Handling","Comisión destino","Inspección / QC","Almacenaje","Transporte interno","Aduana destino","Otros"].map(c=>(
                    <option key={c} value={c}/>
                  ))}
                </datalist>
                <div style={{display:"flex", justifyContent:"flex-end", gap:8, fontSize:11, marginTop:2}}>
                  <span style={{color:C.muted}}>Total gastos destino:</span>
                  <span style={{fontWeight:700, color:C.accent, fontFamily:"monospace"}}>{fmt(gastosTotal)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Anticipo */}
        {form.oeId && (
          <div>
            <div style={lblSt}>Anticipo ({form.monedaBase})</div>
            <input type="number" step="0.01" value={anticipo} onChange={e=>setAnticipo(e.target.value)}
              placeholder="0.00" style={{...inputSt, textAlign:"right", fontFamily:"monospace"}}/>
            <div style={{fontSize:9, color:C.muted, marginTop:2}}>Adelanto ya pagado — se descuenta del saldo a liquidar</div>
          </div>
        )}

        {/* Resumen Venta / FOB / Comisión */}
        {form.oeId && ventaTotal>0 && (
          <div style={{gridColumn:"1/-1", background:C.bg2, borderRadius:10, padding:12, border:`1px solid ${C.border}`}}>
            <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(150px,1fr))", gap:10, fontSize:12}}>
              <div>
                <div style={{color:C.muted, fontSize:10}}>Precio de venta</div>
                <div style={{fontWeight:700, color:C.green}}>{fmt(ventaTotal)}</div>
                {form.monedaBase!=="USD" && ventaTotalUSD!=null && <div style={{fontSize:10, color:C.muted}}>≈ USD {ventaTotalUSD.toLocaleString("es-CL",{maximumFractionDigits:2})}</div>}
              </div>
              {cajasVendidas>0 && (
                <div>
                  <div style={{color:C.muted, fontSize:10}}>Cajas vendidas{cajasMerma>0?` (−${cajasMerma} merma)`:""}</div>
                  <div style={{fontWeight:700, color:C.text, fontFamily:"monospace"}}>{cajasVendidas.toLocaleString("es-CL")}</div>
                </div>
              )}
              {precioPromCaja>0 && (
                <div>
                  <div style={{color:C.muted, fontSize:10}}>Precio prom / caja</div>
                  <div style={{fontWeight:700, color:C.teal, fontFamily:"monospace"}}>{fmt(precioPromCaja)}</div>
                </div>
              )}
              <div>
                <div style={{color:C.muted, fontSize:10}}>(−) Gastos destino</div>
                <div style={{fontWeight:700, color:C.accent}}>{fmt(gastosTotal)}</div>
              </div>
              <div>
                <div style={{color:C.muted, fontSize:10}}>(=) FOB</div>
                <div style={{fontWeight:700, color:C.blue}}>{fmt(fob)}</div>
                {form.monedaBase!=="USD" && fobUSD!=null && <div style={{fontSize:10, color:C.muted}}>≈ USD {fobUSD.toLocaleString("es-CL",{maximumFractionDigits:2})}</div>}
              </div>
              {anticipoNum>0 && (<>
                <div>
                  <div style={{color:C.muted, fontSize:10}}>(−) Anticipo</div>
                  <div style={{fontWeight:700, color:C.accent}}>{fmt(anticipoNum)}</div>
                </div>
                <div>
                  <div style={{color:C.muted, fontSize:10}}>(=) Saldo a liquidar</div>
                  <div style={{fontWeight:700, color:C.yellow}}>{fmt(saldoLiquidacion)}</div>
                </div>
              </>)}
            </div>
            {comision && (
              <div style={{marginTop:10, paddingTop:10, borderTop:`1px solid ${C.border}`}}>
                <div style={{fontSize:11, fontWeight:700, color:C.teal, marginBottom:6}}>Comisión Frisku (base = precio de venta)</div>
                <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(160px,1fr))", gap:8, fontSize:11}}>
                  <div><span style={{color:C.muted}}>% cliente: </span><span>{comision.cliPct}%</span></div>
                  <div><span style={{color:C.muted}}>% Frisku s/cli: </span><span>{comision.friPct}%</span></div>
                  <div><span style={{color:C.muted}}>% Frisku s/venta: </span><span style={{color:C.yellow, fontWeight:700}}>{comision.friSobreBaseNeta.toFixed(4)}%</span></div>
                  <div><span style={{color:C.muted}}>Com. cliente: </span><span>{fmt(comision.montoComisionCliente)}</span></div>
                  <div><span style={{color:C.muted}}>Com. Frisku: </span><span style={{color:C.green, fontWeight:700}}>{fmt(comision.montoComisionFrisku)}</span></div>
                  {form.monedaBase!=="USD" && montoFriskuUSD!=null &&
                    <div><span style={{color:C.muted}}>Frisku USD: </span><span style={{color:C.green, fontWeight:700}}>USD {montoFriskuUSD.toLocaleString("es-CL",{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>}
                </div>
              </div>
            )}
          </div>
        )}
        {!clienteOE && form.oeId && (
          <div style={{gridColumn:"1/-1", color:C.accent, fontSize:11}}>
            No se encontró el cliente para esta OE. No se puede calcular la comisión.
          </div>
        )}

        {/* Estado y fecha liq */}
        <div>
          <div style={lblSt}>Estado</div>
          <select value={form.estado} onChange={f("estado")} style={inputSt}>
            <option value="borrador">Borrador</option>
            <option value="enviada">Enviada</option>
            <option value="pagada">Pagada</option>
          </select>
        </div>
        <div>
          <div style={lblSt}>Fecha liquidación</div>
          <input type="date" value={form.fechaLiquidacion} onChange={f("fechaLiquidacion")} style={inputSt}/>
        </div>

        {/* Facturación */}
        <div>
          <div style={lblSt}>N° factura</div>
          <input value={form.numeroFactura} onChange={f("numeroFactura")} style={inputSt} placeholder="001-2026"/>
        </div>
        <div>
          <div style={lblSt}>Fecha factura</div>
          <input type="date" value={form.fechaFactura} onChange={f("fechaFactura")} style={inputSt}/>
        </div>

        {/* Observaciones */}
        <div style={{gridColumn:"1/-1"}}>
          <div style={lblSt}>Observaciones</div>
          <textarea value={form.observ} onChange={f("observ")}
            style={{...inputSt, minHeight:56, resize:"vertical"}} placeholder="Notas adicionales..."/>
        </div>
      </div>

      <div style={{display:"flex", gap:8, marginTop:14}}>
        <button onClick={handleGuardar} style={btnSt(C.green)}>Guardar</button>
        <button onClick={onCancelar} style={btnSt(C.muted, true)}>Cancelar</button>
      </div>
    </div>
  );
}

function LiquidacionCard({ liq, embarques, clientes, exportadoras, especies, monedas, onEditar, onEliminar, onAvanzarEstado, canEdit }) {
  const oe          = embarques.find(e=>e.id===liq.oeId);
  const cliente     = clientes.find(c=>c.id===oe?.clienteId);
  const exportadora = exportadoras.find(e=>e.id===oe?.exportadoraId);
  const especie     = especies.find(e=>e.codigo===oe?.especieCodigo);
  const monedasMap  = Object.fromEntries(monedas.map(m=>[m.codigo,m]));
  const estadoInfo  = LIQ_ESTADOS[liq.estado] || {label:liq.estado, color:"#94a3b8"};
  const estadoSig   = LIQ_ESTADO_SIG[liq.estado];

  return (
    <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:16, display:"flex", flexDirection:"column", gap:10}}>
      {/* Header */}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8}}>
        <div>
          <div style={{fontSize:13, fontWeight:700, color:C.text}}>
            {oe?.numero || `OE …${liq.oeId?.slice(-6)||"?"}`}
          </div>
          <div style={{fontSize:11, color:C.muted, marginTop:2}}>
            {especie?.icono} {especie?.nombreEs||"—"} · T{liq.temporada||oe?.temporada||"—"}
          </div>
        </div>
        <span style={{
          fontSize:10, padding:"2px 9px", borderRadius:10, whiteSpace:"nowrap",
          background:`${estadoInfo.color}22`, color:estadoInfo.color,
          fontWeight:700, border:`1px solid ${estadoInfo.color}44`,
        }}>
          {estadoInfo.label}
        </span>
      </div>

      {/* Empresas */}
      <div style={{fontSize:11, color:C.muted}}>
        <span style={{color:C.text, fontWeight:600}}>{exportadora?.nombre||"?"}</span>
        {" → "}
        <span style={{color:C.text, fontWeight:600}}>{cliente?.nombre||"?"}</span>
      </div>

      {/* Montos */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11}}>
        <div>
          <div style={{color:C.muted, marginBottom:2}}>Precio de venta</div>
          <div style={{color:C.text, fontWeight:600}}>{formatearMonto(liq.ventaTotal!=null?liq.ventaTotal:liq.baseNeta, liq.monedaBase, monedasMap)}</div>
          {liq.monedaBase!=="USD" && (liq.ventaTotalUSD ?? liq.baseNetaUSD)!=null && (
            <div style={{color:C.muted, fontSize:10}}>≈ USD {(liq.ventaTotalUSD ?? liq.baseNetaUSD).toLocaleString("es-CL",{maximumFractionDigits:0})}</div>
          )}
          {liq.precioPromCaja>0 && (
            <div style={{color:C.teal, fontSize:10}}>{formatearMonto(liq.precioPromCaja, liq.monedaBase, monedasMap)}/caja{liq.cajasVendidas>0?` · ${liq.cajasVendidas.toLocaleString("es-CL")} cjs`:""}{liq.cajasMerma>0?` · ${liq.cajasMerma} merma`:""}</div>
          )}
        </div>
        <div>
          <div style={{color:C.muted, marginBottom:2}}>Comisión Frisku</div>
          <div style={{color:C.green, fontWeight:700}}>{formatearMonto(liq.montoComisionFrisku, liq.monedaBase, monedasMap)}</div>
          {liq.monedaBase!=="USD" && liq.montoComisionFriskuUSD!=null && (
            <div style={{color:C.green, fontSize:10}}>≈ USD {liq.montoComisionFriskuUSD.toLocaleString("es-CL",{maximumFractionDigits:0})}</div>
          )}
        </div>
      </div>

      {/* Gastos destino + FOB */}
      {(liq.gastosDestinoTotal>0 || liq.fob!=null) && (
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11, borderTop:`1px solid ${C.border}`, paddingTop:8}}>
          <div>
            <div style={{color:C.muted, marginBottom:2}}>(−) Gastos destino</div>
            <div style={{color:C.accent, fontWeight:600}}>{formatearMonto(liq.gastosDestinoTotal||0, liq.monedaBase, monedasMap)}</div>
          </div>
          <div>
            <div style={{color:C.muted, marginBottom:2}}>(=) FOB</div>
            <div style={{color:C.blue, fontWeight:700}}>{formatearMonto(liq.fob!=null?liq.fob:((liq.ventaTotal||liq.baseNeta||0)-(liq.gastosDestinoTotal||0)), liq.monedaBase, monedasMap)}</div>
          </div>
        </div>
      )}

      {/* Anticipo + saldo a liquidar */}
      {liq.anticipo>0 && (
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11}}>
          <div>
            <div style={{color:C.muted, marginBottom:2}}>(−) Anticipo</div>
            <div style={{color:C.accent, fontWeight:600}}>{formatearMonto(liq.anticipo||0, liq.monedaBase, monedasMap)}</div>
          </div>
          <div>
            <div style={{color:C.muted, marginBottom:2}}>(=) Saldo a liquidar</div>
            <div style={{color:C.yellow, fontWeight:700}}>{formatearMonto(liq.saldoLiquidacion!=null?liq.saldoLiquidacion:((liq.fob||0)-(liq.anticipo||0)), liq.monedaBase, monedasMap)}</div>
          </div>
        </div>
      )}

      {/* % aplicados */}
      <div style={{fontSize:10, color:C.muted}}>
        {liq.cliPct}% cliente × {liq.friPct}% Frisku =&nbsp;
        <span style={{color:C.yellow}}>{(liq.friSobreBaseNeta||0).toFixed(4)}% s/venta</span>
      </div>

      {/* Fechas y factura */}
      {(liq.fechaLiquidacion||liq.numeroFactura) && (
        <div style={{fontSize:10, color:C.muted, borderTop:`1px solid ${C.border}`, paddingTop:8}}>
          {liq.fechaLiquidacion && <span>{liq.fechaLiquidacion}</span>}
          {liq.numeroFactura    && <span> · Fact. {liq.numeroFactura}</span>}
          {liq.fechaFactura     && <span> ({liq.fechaFactura})</span>}
        </div>
      )}
      {liq.observ && (
        <div style={{fontSize:10, color:C.muted, fontStyle:"italic"}}>{liq.observ}</div>
      )}

      {/* Actions */}
      {canEdit && (
        <div style={{display:"flex", gap:6, flexWrap:"wrap", marginTop:2}}>
          <button onClick={onEditar} style={{...btnSt(C.blue,true), fontSize:10, padding:"3px 10px"}}>Editar</button>
          {estadoSig && (
            <button
              onClick={()=>onAvanzarEstado(liq, estadoSig)}
              style={{...btnSt(LIQ_ESTADOS[estadoSig]?.color||C.blue, true), fontSize:10, padding:"3px 10px"}}
            >
              → {LIQ_ESTADOS[estadoSig]?.label}
            </button>
          )}
          <button onClick={onEliminar} style={{...btnSt(C.accent,true), fontSize:10, padding:"3px 10px", marginLeft:"auto"}}>Eliminar</button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PO — Nota de cobro al cliente (agrupa comisiones de varios embarques)
// ═══════════════════════════════════════════════════════════════════
const PO_ESTADOS = {
  borrador: { label:"Borrador", color:"#f59e0b" },
  emitida:  { label:"Emitida",  color:"#3b82f6" },
  pagada:   { label:"Pagada",   color:"#22c55e" },
};
const PO_ESTADO_SIG = { borrador:"emitida", emitida:"pagada" };

// Comisión Frisku de una liquidación expresada en USD
function comisionFriskuUSD(liq) {
  if(!liq) return 0;
  if(liq.monedaBase==="USD") return Number(liq.montoComisionFrisku)||0;
  return Number(liq.montoComisionFriskuUSD)||0;
}

// Carga una imagen del /public como dataURL (para el logo del PDF)
async function po_urlToDataURL(url) {
  const resp = await fetch(url);
  const blob = await resp.blob();
  return await new Promise((res,rej)=>{
    const r = new FileReader();
    r.onloadend = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}
const PO_MESES_ES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function po_fechaLarga(iso){
  if(!iso) iso = new Date().toISOString().slice(0,10);
  const [y,mo,d] = String(iso).split("-").map(Number);
  if(!y||!mo||!d) return iso;
  return `${String(d).padStart(2,"0")} de ${PO_MESES_ES[mo-1]} de ${y}`;
}

// Factura de exportación (nota de cobro de comisión = "PO"), replica el formato real de Frisku.
async function exportarPO_PDF(po, cliente, lineas, paises=[]) {
  const JsPDF = await pl_loadJsPDF();
  const doc = new JsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
  const W=210, m=14;
  const BAND=[91,155,213], BANDTXT=[255,255,255], DARK=[55,55,55];
  const moneda = po.moneda || "USD";
  const total = (lineas||[]).reduce((s,l)=>s+(Number(l.comision)||0),0);
  const fmt = v => Number(v||0).toLocaleString("es-CL",{minimumFractionDigits:2,maximumFractionDigits:2});

  const band = (txt, y, h=8) => {
    doc.setFillColor(...BAND); doc.rect(0,y,W,h,"F");
    doc.setTextColor(...BANDTXT); doc.setFont("helvetica","bold"); doc.setFontSize(11);
    doc.text(txt, W/2, y+h/2+1.6, {align:"center"});
  };

  // 1) Banda título
  band("FACTURA DE EXPORTACION", 0, 10);

  // 2) Datos emisor (izq) + logo (der)
  let y = 16;
  doc.setTextColor(...DARK); doc.setFont("helvetica","normal"); doc.setFontSize(10);
  const emisor = ["Frisku Foods SPA","76.758.722-8","Candelaria Goyenechea 3868","sales@friskufoods.cl"];
  emisor.forEach((l,i)=>doc.text(l, m, y+6+i*5));
  try {
    const logo = await po_urlToDataURL(process.env.PUBLIC_URL + "/frisku.png");
    doc.addImage(logo, "PNG", W-m-46, y+2, 46, 22, undefined, "FAST");
  } catch(e){ /* sin logo */ }
  y += 6 + emisor.length*5 + 4;

  // 3) Banda fecha
  band(`Santiago, ${po_fechaLarga(po.fecha)}`, y, 9); y += 9 + 4;

  // 4) Datos cliente
  const paisCli = paises.find(p=>p.codigo===cliente?.paisCodigo)?.nombre || cliente?.pais || "";
  doc.setTextColor(...DARK); doc.setFont("helvetica","normal"); doc.setFontSize(10);
  const cliLineas = [cliente?.razonSocial||cliente?.nombre||"—", cliente?.direccion||"", paisCli].filter(Boolean);
  cliLineas.forEach((l,i)=>doc.text(l, m, y+5+i*5));
  y += 5 + cliLineas.length*5 + 3;

  // 5) Banda concepto
  band("CONCEPTO: COMISION POR VENTAS", y, 9); y += 9 + 3;

  // 6) Tabla de embarques
  const head = [["Exporter","Vessel Name","Container #","Commodity",`Comisión ${moneda}`]];
  const body = (lineas||[]).map(l=>[
    l.exporter||"—", l.vessel||"—", l.container||"—", l.commodity||"—", fmt(l.comision),
  ]);
  doc.autoTable({
    startY:y, theme:"grid",
    headStyles:{fillColor:BAND,textColor:255,fontStyle:"bold",fontSize:9,halign:"center"},
    styles:{fontSize:9,cellPadding:2.4,textColor:DARK,lineColor:[200,200,200],lineWidth:0.1},
    bodyStyles:{halign:"center"},
    head, body,
    columnStyles:{0:{halign:"center"},1:{halign:"center"},2:{halign:"center"},3:{halign:"center"},4:{halign:"right"}},
    margin:{left:m,right:m},
  });
  y = doc.lastAutoTable.finalY;

  // Fila total
  doc.autoTable({
    startY:y, theme:"grid",
    styles:{fontSize:9,cellPadding:2.4,fontStyle:"bold",textColor:DARK,lineColor:[200,200,200],lineWidth:0.1},
    body:[["Total Comisión a pagar", `${moneda} ${fmt(total)}`]],
    columnStyles:{0:{halign:"center",cellWidth:W-2*m-42},1:{halign:"right",cellWidth:42}},
    margin:{left:m,right:m},
  });
  y = doc.lastAutoTable.finalY + 10;

  // 7) Banda info bancaria
  band("FRISKU FOODS BANK INFORMATION", y, 9); y += 9 + 5;
  doc.setTextColor(...DARK); doc.setFont("helvetica","normal"); doc.setFontSize(10);
  const banco = [
    "Bank Name: Banco BICE",
    "Bank Address: Teatinos 220, Santiago, Chile",
    "US DOLLAR Account Number: 013-01-05173-1",
    "EURO Account Number: 14-20-100863-9",
    "Swift Code: BICECLRM",
    "Rut: 76.758.722-8",
  ];
  banco.forEach((l,i)=>doc.text(l, m, y+i*5));
  y += banco.length*5 + 6;

  if(po.observ){
    doc.setFontSize(9); doc.setTextColor(110,110,110);
    doc.text(`Observaciones: ${po.observ}`, m, y); y += 6;
  }

  // 8) Pie
  const py = Math.max(y, 280);
  doc.setDrawColor(200,200,200); doc.line(m, py, m, py+8);
  doc.setTextColor(...DARK); doc.setFontSize(10);
  doc.text("Company Name: Frisku Foods Spa", m+3, py+5);

  doc.save(`PO_${po.numero||po.id}_${cliente?.nombre?cliente.nombre.replace(/\s+/g,"_").slice(0,20):"cliente"}.pdf`);
}

function POForm({ po, clientes, liquidaciones, embarques, especies, exportadoras=[], monedas=[], paises=[], tcData, pos, onGuardar, onCancelar }) {
  const hoyISO = new Date().toISOString().slice(0,10);
  const [form, setForm] = useState({
    clienteId: po?.clienteId || "",
    numero:    po?.numero    || "",
    fecha:     po?.fecha     || hoyISO,
    estado:    po?.estado    || "borrador",
    observ:    po?.observ    || "",
  });
  const clienteSel = clientes.find(c=>c.id===form.clienteId);
  const poMoneda = clienteSel?.monedaCodigo || "USD";  // factura se emite en la moneda del cliente
  const [sel, setSel] = useState(()=> new Set(po?.liqIds || (po?.lineas||[]).map(l=>l.liqId)) );
  const f = k => e => setForm(p=>({...p,[k]:e.target.value}));

  // liqId → poId, para marcar las ya asignadas a OTRO po
  const asignadas = useMemo(()=>{
    const map = {};
    (pos||[]).forEach(p=>{ if(p.id!==po?.id) (p.liqIds||(p.lineas||[]).map(l=>l.liqId)||[]).forEach(id=>{ map[id]=p.numero||p.id; }); });
    return map;
  },[pos, po]);

  // Liquidaciones del cliente seleccionado
  const liqsCliente = useMemo(()=>{
    if(!form.clienteId) return [];
    return liquidaciones.filter(liq=>{
      const oe = embarques.find(e=>e.id===liq.oeId);
      return oe && oe.clienteId===form.clienteId;
    }).sort((a,b)=>(b.fechaLiquidacion||"").localeCompare(a.fechaLiquidacion||""));
  },[liquidaciones, embarques, form.clienteId]);

  const toggle = (id) => setSel(prev=>{ const s=new Set(prev); s.has(id)?s.delete(id):s.add(id); return s; });

  // Comisión Frisku de una liq expresada en la moneda de la factura (poMoneda)
  const comisionEnMoneda = (liq) => {
    if(!liq) return 0;
    if(liq.monedaBase===poMoneda) return Number(liq.montoComisionFrisku)||0;
    const usd = comisionFriskuUSD(liq);
    if(poMoneda==="USD") return usd;
    const conv = convertirMonto(usd, "USD", poMoneda, form.fecha, tcData);
    return conv!=null ? conv : usd;  // si no hay TC, deja USD (se marca aparte)
  };

  const lineas = useMemo(()=> liqsCliente.filter(liq=>sel.has(liq.id)).map(liq=>{
    const oe = embarques.find(e=>e.id===liq.oeId);
    const esp = especies.find(e=>e.codigo===oe?.especieCodigo);
    const exp = exportadoras.find(x=>x.id===oe?.exportadoraId);
    return {
      liqId: liq.id, oeId: liq.oeId, oeNumero: oe?.numero||oe?.id?.slice(-6)||"?",
      exporter: exp?.nombre||exp?.razonSocial||"—",
      vessel: oe?.navieraAerolinea||"—",
      container: oe?.numeroContenedor||oe?.contenedor||oe?.vuelo||"—",
      commodity: (esp?.nombreEs||esp?.nombreEn||oe?.especieCodigo||"—").toUpperCase(),
      especieNombre: [esp?.icono, esp?.nombreEs].filter(Boolean).join(" "),
      ventaTotal: liq.ventaTotal!=null?liq.ventaTotal:liq.baseNeta, monedaBase: liq.monedaBase,
      cliPct: liq.cliPct, friPct: liq.friPct,
      montoComisionFrisku: liq.montoComisionFrisku, comisionUSD: comisionFriskuUSD(liq),
      comision: comisionEnMoneda(liq),
    };
  }),[liqsCliente, sel, embarques, especies, exportadoras, poMoneda, form.fecha, tcData]);

  const totalUSD     = lineas.reduce((s,l)=>s+(Number(l.comisionUSD)||0),0);
  const totalMoneda  = lineas.reduce((s,l)=>s+(Number(l.comision)||0),0);

  const handleGuardar = () => {
    if(!form.clienteId) { alert("Selecciona un cliente"); return; }
    if(lineas.length===0) { alert("Selecciona al menos un embarque"); return; }
    onGuardar({
      ...po,
      id: po?.id || uid(),
      clienteId: form.clienteId,
      numero: form.numero,
      fecha: form.fecha,
      estado: form.estado,
      observ: form.observ,
      moneda: poMoneda,
      liqIds: lineas.map(l=>l.liqId),
      lineas,
      totalComisionUSD: totalUSD,
      totalComisionMoneda: totalMoneda,
      fechaCreacion: po?.fechaCreacion || new Date().toISOString(),
      fechaActualizacion: new Date().toISOString(),
    });
  };

  return (
    <div style={{background:C.card, borderRadius:14, padding:20, marginBottom:20, border:`1px solid ${C.border}`}}>
      <h3 style={{margin:"0 0 16px", fontSize:14, color:C.text, fontWeight:700}}>
        {po?.id ? "Editar PO (nota de cobro)" : "Nuevo PO (nota de cobro)"}
      </h3>
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px,1fr))", gap:12, marginBottom:14}}>
        <div style={{gridColumn:"1/-1"}}>
          <div style={lblSt}>Cliente *</div>
          <select value={form.clienteId} onChange={e=>{ setForm(p=>({...p,clienteId:e.target.value})); setSel(new Set()); }} style={inputSt}>
            <option value="">— Selecciona un cliente —</option>
            {[...clientes].filter(c=>c.activo!==false).sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||"")).map(c=>(
              <option key={c.id} value={c.id}>{c.nombre}{c.codigoEntidad?` (${c.codigoEntidad})`:""}</option>
            ))}
          </select>
        </div>
        <div>
          <div style={lblSt}>N° PO</div>
          <input value={form.numero} onChange={f("numero")} style={inputSt}/>
        </div>
        <div>
          <div style={lblSt}>Fecha</div>
          <input type="date" value={form.fecha} onChange={f("fecha")} style={inputSt}/>
        </div>
        <div>
          <div style={lblSt}>Estado</div>
          <select value={form.estado} onChange={f("estado")} style={inputSt}>
            <option value="borrador">Borrador</option>
            <option value="emitida">Emitida</option>
            <option value="pagada">Pagada</option>
          </select>
        </div>
      </div>

      {/* Selección de embarques liquidados del cliente */}
      {form.clienteId && (
        <div style={{marginBottom:14}}>
          <div style={{fontSize:12, fontWeight:700, color:C.teal, marginBottom:6}}>
            Embarques liquidados del cliente — selecciona los que cobrarás
          </div>
          {liqsCliente.length===0 ? (
            <div style={{fontSize:11, color:C.muted, fontStyle:"italic"}}>
              Este cliente no tiene liquidaciones cargadas. Crea primero las liquidaciones por embarque.
            </div>
          ) : (
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%", borderCollapse:"collapse", fontSize:11}}>
                <thead>
                  <tr style={{background:C.primary}}>
                    {["","OE","Especie","Venta","% com.","Comisión Frisku (USD)","Estado liq."].map((h,i)=>(
                      <th key={i} style={{padding:"6px 8px", textAlign:i>=3&&i<=5?"right":"left", color:C.primaryText, fontWeight:700, fontSize:10, whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {liqsCliente.map((liq,idx)=>{
                    const oe = embarques.find(e=>e.id===liq.oeId);
                    const esp = especies.find(e=>e.codigo===oe?.especieCodigo);
                    const yaEn = asignadas[liq.id];
                    const checked = sel.has(liq.id);
                    return (
                      <tr key={liq.id} style={{borderBottom:`1px solid ${C.border}22`, background:checked?`${C.teal}11`:(idx%2===0?C.card:C.rowAlt)}}>
                        <td style={{padding:"4px 8px", textAlign:"center"}}>
                          <input type="checkbox" checked={checked} onChange={()=>toggle(liq.id)}/>
                        </td>
                        <td style={{padding:"4px 8px", color:C.text}}>
                          {oe?.numero||liq.oeId?.slice(-6)}
                          {yaEn && <div style={{fontSize:9, color:C.accent}}>ya en PO {yaEn}</div>}
                        </td>
                        <td style={{padding:"4px 8px", color:C.text}}>{esp?.icono} {esp?.nombreEs||"—"}</td>
                        <td style={{padding:"4px 8px", textAlign:"right", fontFamily:"monospace", color:C.text}}>{Number(liq.ventaTotal!=null?liq.ventaTotal:liq.baseNeta||0).toLocaleString("es-CL",{maximumFractionDigits:0})} {liq.monedaBase}</td>
                        <td style={{padding:"4px 8px", textAlign:"right", color:C.muted}}>{liq.cliPct||0}%×{liq.friPct||0}%</td>
                        <td style={{padding:"4px 8px", textAlign:"right", fontFamily:"monospace", color:C.green, fontWeight:700}}>{comisionFriskuUSD(liq).toLocaleString("es-CL",{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                        <td style={{padding:"4px 8px"}}><span style={{fontSize:9, color:LIQ_ESTADOS[liq.estado]?.color||C.muted}}>{LIQ_ESTADOS[liq.estado]?.label||liq.estado}</span></td>
                      </tr>
                    );
                  })}
                  <tr style={{borderTop:`1px solid ${C.border}`, background:`${C.bg}66`}}>
                    <td colSpan={5} style={{padding:"6px 8px", textAlign:"right", fontWeight:700, color:C.muted, fontSize:10}}>TOTAL A COBRAR ({sel.size} embarque{sel.size===1?"":"s"}) · factura en {poMoneda}</td>
                    <td style={{padding:"6px 8px", textAlign:"right", fontWeight:700, fontFamily:"monospace", color:C.green}}>
                      {poMoneda} {totalMoneda.toLocaleString("es-CL",{minimumFractionDigits:2,maximumFractionDigits:2})}
                      {poMoneda!=="USD" && <div style={{fontSize:9, color:C.muted, fontWeight:400}}>≈ USD {totalUSD.toLocaleString("es-CL",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>}
                    </td>
                    <td/>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div style={{marginBottom:14}}>
        <div style={lblSt}>Observaciones</div>
        <textarea value={form.observ} onChange={f("observ")} style={{...inputSt, minHeight:50, resize:"vertical"}}/>
      </div>

      <div style={{display:"flex", gap:8}}>
        <button onClick={handleGuardar} style={btnSt(C.green)}>Guardar PO</button>
        <button onClick={onCancelar} style={btnSt(C.muted, true)}>Cancelar</button>
      </div>
    </div>
  );
}

function POCard({ po, clientes, paises=[], onEditar, onEliminar, onAvanzarEstado, canEdit }) {
  const cliente = clientes.find(c=>c.id===po.clienteId);
  const lineas = po.lineas||[];
  const moneda = po.moneda || "USD";
  const total = po.totalComisionMoneda!=null ? po.totalComisionMoneda
              : (po.totalComisionUSD!=null ? po.totalComisionUSD : lineas.reduce((s,l)=>s+(Number(l.comision)||Number(l.comisionUSD)||0),0));
  const estadoInfo = PO_ESTADOS[po.estado] || {label:po.estado, color:"#94a3b8"};
  const estadoSig  = PO_ESTADO_SIG[po.estado];
  const [exporting, setExporting] = useState(false);
  const handlePDF = async () => {
    setExporting(true);
    try{ await exportarPO_PDF(po, cliente, lineas, paises); }
    catch(e){ alert("Error generando PDF: "+e.message); }
    finally{ setExporting(false); }
  };
  return (
    <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:16, display:"flex", flexDirection:"column", gap:10}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8}}>
        <div>
          <div style={{fontSize:13, fontWeight:700, color:C.text}}>{po.numero || `PO …${po.id?.slice(-6)||"?"}`}</div>
          <div style={{fontSize:11, color:C.muted, marginTop:2}}>{cliente?.nombre||"?"} · {po.fecha||"—"}</div>
        </div>
        <span style={{fontSize:10, padding:"2px 9px", borderRadius:10, whiteSpace:"nowrap", background:`${estadoInfo.color}22`, color:estadoInfo.color, fontWeight:700, border:`1px solid ${estadoInfo.color}44`}}>{estadoInfo.label}</span>
      </div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11}}>
        <div>
          <div style={{color:C.muted, marginBottom:2}}>Embarques</div>
          <div style={{color:C.text, fontWeight:600}}>{lineas.length}</div>
        </div>
        <div>
          <div style={{color:C.muted, marginBottom:2}}>Total a cobrar</div>
          <div style={{color:C.green, fontWeight:700}}>{moneda} {total.toLocaleString("es-CL",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
        </div>
      </div>
      {lineas.length>0 && (
        <div style={{fontSize:10, color:C.muted, borderTop:`1px solid ${C.border}`, paddingTop:8, maxHeight:80, overflowY:"auto"}}>
          {lineas.map((l,i)=>(
            <div key={i} style={{display:"flex", justifyContent:"space-between", gap:6}}>
              <span style={{overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{l.oeNumero} · {l.especieNombre||l.commodity}</span>
              <span style={{fontFamily:"monospace", color:C.green, flexShrink:0}}>{(Number(l.comision)||Number(l.comisionUSD)||0).toLocaleString("es-CL",{maximumFractionDigits:2})}</span>
            </div>
          ))}
        </div>
      )}
      {po.observ && <div style={{fontSize:10, color:C.muted, fontStyle:"italic"}}>{po.observ}</div>}
      <div style={{display:"flex", gap:6, flexWrap:"wrap", marginTop:2}}>
        <button onClick={handlePDF} disabled={exporting} style={{...btnSt(C.accent,true), fontSize:10, padding:"3px 10px"}}>{exporting?"…":"📄 PDF"}</button>
        {canEdit && <button onClick={onEditar} style={{...btnSt(C.blue,true), fontSize:10, padding:"3px 10px"}}>Editar</button>}
        {canEdit && estadoSig && (
          <button onClick={()=>onAvanzarEstado(po, estadoSig)} style={{...btnSt(PO_ESTADOS[estadoSig]?.color||C.blue, true), fontSize:10, padding:"3px 10px"}}>→ {PO_ESTADOS[estadoSig]?.label}</button>
        )}
        {canEdit && <button onClick={onEliminar} style={{...btnSt(C.accent,true), fontSize:10, padding:"3px 10px", marginLeft:"auto"}}>Eliminar</button>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// REPORTES BI — Ingreso Frisku por temporada (Fase 8, reporte #1)
// Tabla de hechos = liquidaciones (comisión Frisku ya normalizada a USD),
// enlazada a embarques → especie/cliente/exportadora.
// Todo agregado en USD. Exportable a Excel (xlsx-js-style) y PDF (jsPDF).
// ═══════════════════════════════════════════════════════════════════

// Colores por especie (validados CVD, tema claro). Fallback al azul brand.
const ESP_COLORS = {
  CHE:"#d55e00", BLB:"#0072b2", GRP:"#7c3aed", UVA:"#7c3aed", PLM:"#e69f00",
  KWI:"#009e73", AVO:"#2e7d32", MNG:"#e0913c", POM:"#c0392b", GLB:"#c98a18",
};
// Orden temporada agrícola Jul → Jun
const MESES_TEMP = [
  {m:7,lab:"Jul"},{m:8,lab:"Ago"},{m:9,lab:"Sep"},{m:10,lab:"Oct"},
  {m:11,lab:"Nov"},{m:12,lab:"Dic"},{m:1,lab:"Ene"},{m:2,lab:"Feb"},
  {m:3,lab:"Mar"},{m:4,lab:"Abr"},{m:5,lab:"May"},{m:6,lab:"Jun"},
];

const fmtUSD0 = (v) => "$" + new Intl.NumberFormat("es-CL",{maximumFractionDigits:0}).format(Number(v)||0);
const fmtUSD2 = (v) => "$" + new Intl.NumberFormat("es-CL",{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v)||0);
const fmtN0   = (v) => new Intl.NumberFormat("es-CL",{maximumFractionDigits:0}).format(Number(v)||0);

// FILTRO MULTI-SELECCIÓN ASOCIATIVO (estilo Qlik) para toda Reportería BI.
// OR dentro de la dimensión (toggle) + AND entre dimensiones (motor). Muestra
// SELECCIONADO (☑) / POSIBLE (☐) / EXCLUIDO (tachado, por la selección actual).
// Al abrir con un valor ya elegido se ven todas las alternativas (reemplazar/
// agregar/quitar sin limpiar). Cuenta de registros por valor (frecuencia Qlik).
// FILTRO MULTI (listbox de dimensión estilo Qlik) con los 4 estados asociativos:
// SELECTED (verde ☑) / POSSIBLE (neutro ☐) / ALTERNATIVE (gris claro ☐) /
// EXCLUDED (gris oscuro tachado). OR intra-dim (toggle) + AND entre dims (motor).
// Búsqueda, frecuencia y acciones (seleccionar todo compatible / limpiar).
function FiltroMultiBI({ dimKey, label }) {
  const bi = useFriskuBI();
  const { sel, toggle, clearDim, setMany, associative } = bi;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef(null);
  useEffect(()=>{ if(!open) return; const h=(e)=>{ if(boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown",h); return ()=>document.removeEventListener("mousedown",h); },[open]);
  const selSet = sel[dimKey] || new Set();
  const { selected, possible, alternative, excluded } = associative(dimKey);
  const qq = q.trim().toLowerCase();
  const fil=(arr)=> qq? arr.filter(x=>String(x.label).toLowerCase().includes(qq)) : arr;
  const fSel=fil(selected), fPos=fil(possible), fAlt=fil(alternative), fExc=fil(excluded);
  const n = selSet.size;
  const resumen = n===0 ? "Todos" : (n===1 ? (selected[0]?.label || [...selSet][0]) : `${n} seleccionados`);
  const compatibles = [...selected, ...possible, ...alternative].map(x=>x.value);
  const Fila = ({x, estado})=>{
    const on = estado==="sel";
    const col = estado==="sel"?C.accent2 : estado==="pos"?C.text : estado==="alt"?C.muted : C.muted2;
    const bg  = estado==="sel"?`${C.accent2}18` : estado==="alt"?`${C.muted}10` : "transparent";
    return <div onClick={()=>toggle(dimKey,x.value)} title={estado==="exc"?"Excluido por el contexto — clic para forzar":estado==="alt"?"Alternativo (compatible; el campo tiene selección)":""}
      style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center",padding:"4px 9px",cursor:"pointer",fontSize:11.5,background:bg}}>
      <span style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",color:col,fontWeight:on?700:400,textDecoration:estado==="exc"?"line-through":"none",opacity:estado==="exc"?0.75:1}}>{on?"☑":"☐"} {x.label}</span>
      {x.m!=null && <span style={{fontSize:9.5,color:C.muted2}}>{fmtN0(x.m)}</span>}
    </div>;
  };
  const Hdr = ({t})=><div style={{padding:"5px 9px 3px",fontSize:9,color:C.muted2,textTransform:"uppercase",borderTop:`1px dashed ${C.border}`}}>{t}</div>;
  return (
    <div ref={boxRef} style={{position:"relative", minWidth:150, flex:"1 1 150px"}}>
      <div style={lblSt}>{label}</div>
      <div onClick={()=>setOpen(o=>!o)} style={{...inputSt, width:"100%", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center", gap:6}}>
        <span style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis", color:n?C.text:C.muted2, fontWeight:n?600:400}}>{resumen}</span>
        <span style={{color:C.muted, fontSize:10, whiteSpace:"nowrap"}}>{n>0 && <span onClick={(e)=>{e.stopPropagation(); clearDim(dimKey);}} title="Limpiar dimensión" style={{marginRight:6,color:C.accent,fontWeight:700}}>×</span>}▾</span>
      </div>
      {open && (
        <div style={{position:"absolute", zIndex:60, top:"calc(100% + 2px)", left:0, right:0, background:C.card, border:`1px solid ${C.border}`, borderRadius:8, maxHeight:320, overflowY:"auto", boxShadow:C.shadowSm||"0 8px 24px rgba(0,0,0,.18)"}}>
          <div style={{padding:6, position:"sticky", top:0, background:C.card, borderBottom:`1px solid ${C.border}`, zIndex:1}}>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar…" style={{...inputSt, width:"100%", padding:"4px 7px", fontSize:11}}/>
            <div style={{display:"flex",gap:6,marginTop:5}}>
              <button onClick={()=>setMany(dimKey, compatibles)} style={{...btnSt(C.muted,true),fontSize:9.5,padding:"2px 7px"}}>Sel. compatibles</button>
              {n>0 && <button onClick={()=>clearDim(dimKey)} style={{...btnSt(C.muted,true),fontSize:9.5,padding:"2px 7px"}}>Limpiar</button>}
            </div>
          </div>
          {fSel.map(x=><Fila key={x.value} x={x} estado="sel"/>)}
          {fPos.map(x=><Fila key={x.value} x={x} estado="pos"/>)}
          {fAlt.length>0 && <Hdr t={`Alternativos (${fAlt.length})`}/>}
          {fAlt.map(x=><Fila key={x.value} x={x} estado="alt"/>)}
          {fExc.length>0 && <Hdr t={`Excluidos (${fExc.length})`}/>}
          {fExc.slice(0,60).map(x=><Fila key={x.value} x={x} estado="exc"/>)}
          {fSel.length+fPos.length+fAlt.length+fExc.length===0 && <div style={{padding:10,fontSize:11,color:C.muted2,textAlign:"center"}}>Sin valores</div>}
        </div>
      )}
    </div>
  );
}

// BREADCRUMB analítico: la ruta de selección en orden jerárquico. Cada crumb se
// puede quitar (vuelve a ese nivel). Convive con los filtros globales.
function BreadcrumbBI() {
  const bi = useFriskuBI();
  const { chips, remove, clearAll } = bi;
  if(!chips.length) return null;
  const ORD = ["temporada","anioETD","semanaETD","mercado","paisDestino","especie","exportadora","cliente","via","estado","puertoOrigen","puertoDestino","shippingLine"];
  const ordered = [...chips].sort((a,b)=>{ const ia=ORD.indexOf(a.dim), ib=ORD.indexOf(b.dim); return (ia<0?99:ia)-(ib<0?99:ib); });
  return (
    <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap",marginBottom:10,fontSize:11.5}}>
      <span style={{color:C.muted,fontWeight:700,fontSize:10,textTransform:"uppercase"}}>Ruta</span>
      <span onClick={clearAll} style={{color:C.muted,cursor:"pointer"}} title="Volver a Todo">Todo</span>
      {ordered.map((c,i)=>(
        <span key={i} style={{display:"inline-flex",alignItems:"center",gap:5}}>
          <span style={{color:C.muted2}}>›</span>
          <span onClick={()=>remove(c.dim,c.value)} title={`Quitar ${c.dimLab}`} style={{cursor:"pointer",fontWeight:600,color:C.accent2,background:`${C.accent2}14`,borderRadius:8,padding:"1px 8px"}}>{c.label}<span style={{opacity:.6,marginLeft:4}}>×</span></span>
        </span>
      ))}
    </div>
  );
}

// HOJA ANALÍTICA por dimensión (Clientes / Exportadores / Especies / Mercados /
// Comisiones / Embarques). Todas usan el MISMO provider, métricas y selección.
// Drill-down: clic en una fila filtra todo el BI (agregado→detalle). El detalle
// muestra los contenedores fuente con "→ Ver embarque" (BI↔operación).
function HojaBIDim({ dimDefault, orderDefault="friskuCommissionUSD", onVerEmbarque }) {
  const bi = useFriskuBI();
  const { filtered, metric, sel, setOne, remove, associative, chips, clearAll } = bi;
  const [groupDim, setGroupDim] = useState(dimDefault);
  const [orderKey, setOrderKey] = useState(orderDefault);
  const [topN, setTopN] = useState(dimDefault==="semanaETD"?"all":"20");
  const FLT = ["temporada","especie","exportadora","cliente","mercado","paisDestino","estado","via","semanaETD"];
  const FIN_KEYS = ["destinationSalesUSD","clientCommissionUSD","friskuCommissionUSD","avgCommissionPct"];
  const COLS = [
    {k:"containers",lab:"Contenedores",fmt:"int"},
    {k:"fcl",lab:"FCL",fmt:"int"},
    {k:"boxes",lab:"Cajas",fmt:"int"},
    {k:"kilograms",lab:"Kilos",fmt:"int"},
    {k:"destinationSalesUSD",lab:"Venta USD",fmt:"usd"},
    {k:"clientCommissionUSD",lab:"Com. cliente USD",fmt:"usd"},
    {k:"friskuCommissionUSD",lab:"Com. Frisku USD",fmt:"usd"},
    {k:"avgCommissionPct",lab:"% Frisku",fmt:"pct"},
  ];
  const grupos = useMemo(()=>{ const m={}; filtered.forEach(r=>{ const v=r[groupDim]; (m[v]=m[v]||{key:v,lab:r[groupDim+"Lab"],rows:[]}).rows.push(r); });
    return Object.values(m).map(g=>{ const o={key:g.key,lab:g.lab,_fin:g.rows.filter(r=>r._nLiq>0).length}; COLS.forEach(c=>o[c.k]=metric[c.k].calc(g.rows)); o.ord=metric[orderKey].calc(g.rows); return o; })
      .sort((a,b)=>b.ord-a.ord); },[filtered,groupDim,orderKey]);
  const totComF = grupos.reduce((s,g)=>s+g.friskuCommissionUSD,0)||1;
  const gruposShown = topN==="all" ? grupos : grupos.slice(0, Number(topN));
  const dimLab = FRISKU_DIMS.find(d=>d.key===groupDim)?.lab||groupDim;
  const [detQ,setDetQ] = useState(""); const [detSort,setDetSort] = useState({k:"comF",dir:"desc"});
  const detAll = useMemo(()=>{
    const qq=detQ.trim().toLowerCase();
    const hay=(r)=>{ const s=`${r._oe?r._oe.numero||"":""} ${r.especieLab} ${r.exportadoraLab} ${r.clienteLab} ${r._oe?r._oe.origen||"":""} ${r._oe?r._oe.destino||"":""} ${r.temporada} ${r.semanaETD}`; return s.toLowerCase().includes(qq); };
    const base = qq ? filtered.filter(hay) : filtered.slice();
    const valOf=(r)=>{ const map={ numero:(r._oe&&r._oe.numero)||"", especie:r.especieLab, expcli:`${r.exportadoraLab} ${r.clienteLab}`, etd:(r._oe&&r._oe.fechaDespacho)||"", cajas:r._cajas, kilos:r._kilos, comF:r._comF, temporada:r.temporada, semana:r.semanaETD, estado:r.estado }; return map[detSort.k]; };
    base.sort((x,y)=>{ const vx=valOf(x), vy=valOf(y); const c=(typeof vx==="number"&&typeof vy==="number")?vx-vy:String(vx).localeCompare(String(vy)); return detSort.dir==="desc"?-c:c; });
    return base;
  },[filtered,detQ,detSort]);
  const detalle = detAll.slice(0,200);
  const cobFin = { n: filtered.filter(r=>r._nLiq>0).length, tot: filtered.length };   // cobertura financiera de la selección
  const dq = bi.dataQuality || {formatosSinPeso:[], liqClienteSinConv:0};
  const kgParcial = filtered.some(r=>r._kgFalta);   // hay contenedores con formato sin peso neto → kilos incompletos
  const [expX,setExpX] = useState(false); const [expP,setExpP] = useState(false);
  const filtrosTxt = chips.length ? chips.map(c=>`${c.dimLab}=${c.label}`).join(", ") : "sin filtros";
  const subTxt = ()=>`Por ${dimLab} · orden ${COLS.find(c=>c.k===orderKey)?.lab||orderKey} · Filtros: ${filtrosTxt}${kgParcial?" · KILOS PARCIALES":""} · ${new Date().toLocaleString("es-CL")}`;
  const numRow = (g)=>[g.lab, ...COLS.map(c=> (c.fmt==="usd"||c.fmt==="int")?Math.round(g[c.k]) : Number((g[c.k]||0).toFixed(1))), Number((g.friskuCommissionUSD/totComF*100).toFixed(1))];
  const exportExcel = async ()=>{ setExpX(true); try{
    const ExcelJS = await fr_loadExcelJS(); const wb = new ExcelJS.Workbook(); wb.creator="Grupo Mediterra — Frisku Foods";
    const ws = wb.addWorksheet("BI");
    fr_sheetTabla(ws, { titulo:`FRISKU FOODS — BI por ${dimLab}`, subtitulo:subTxt(),
      headers:[dimLab, ...COLS.map(c=>c.k==="kilograms"&&kgParcial?"Kilos (parcial)":c.lab), "Part.%"],
      colWidths:[26, ...COLS.map(()=>15), 9], rows: grupos.map(numRow),
      moneyCols: COLS.map((c,i)=>c.fmt==="usd"?i+1:-1).filter(i=>i>0),
      intCols:   COLS.map((c,i)=>c.fmt==="int"?i+1:-1).filter(i=>i>0) });
    await fr_logoExcel(wb, ws);
    await fr_descargarWB(wb, `Frisku_BI_${groupDim}_${new Date().toISOString().slice(0,10)}.xlsx`);
  }catch(e){ console.error("[HojaBI] Excel:",e); alert("No se pudo generar el Excel: "+e.message); } setExpX(false); };
  const exportPDF = async ()=>{ setExpP(true); try{
    const JsPDF = await pl_loadJsPDF(); const doc = new JsPDF({orientation:"landscape",unit:"mm",format:"a4"}); const W=297,m=12;
    doc.setFillColor(30,39,97); doc.rect(0,0,W,24,"F"); doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(13);
    doc.text(`Frisku Foods — BI por ${dimLab}`, m, 11); doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.text(subTxt().slice(0,170), m, 18);
    await fr_logoPDF(doc, W-m, 4, 40, 15);
    doc.autoTable({ startY:28, head:[[dimLab, ...COLS.map(c=>c.k==="kilograms"&&kgParcial?"Kilos (parcial)":c.lab), "Part.%"]],
      body: grupos.map(g=>[g.lab, ...COLS.map(c=>fmtMetric(c.fmt,g[c.k])), (g.friskuCommissionUSD/totComF*100).toFixed(1)+"%"]),
      theme:"striped", styles:{fontSize:7.5}, headStyles:{fillColor:[30,39,97]}, margin:{left:m,right:m} });
    doc.save(`Frisku_BI_${groupDim}_${new Date().toISOString().slice(0,10)}.pdf`);
  }catch(e){ console.error("[HojaBI] PDF:",e); alert("No se pudo generar el PDF: "+e.message); } setExpP(false); };
  const QUICK = [
    {k:"cliente",lab:"Clientes"},{k:"exportadora",lab:"Exportadores"},{k:"especie",lab:"Especies"},
    {k:"mercado",lab:"Mercados"},{k:"paisDestino",lab:"País"},{k:"semanaETD",lab:"Semana ETD"},
  ];
  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:10}}>
        <span style={{fontSize:10.5,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:0.4,marginRight:2}}>Ver por</span>
        {QUICK.map(d=><button key={d.k} onClick={()=>setGroupDim(d.k)} style={{...btnSt(groupDim===d.k?C.blue:C.muted, groupDim!==d.k),fontSize:11.5,padding:"5px 11px"}}>{d.lab}</button>)}
        <span style={{fontSize:10.5,color:C.muted2,marginLeft:4}}>· o cualquier dimensión en «Agrupar por» ↓</span>
      </div>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:12,marginBottom:12,display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
        {FLT.map(dk=><FiltroMultiBI key={dk} dimKey={dk} label={FRISKU_DIMS.find(d=>d.key===dk)?.lab||dk}/>)}
        <div><div style={lblSt}>Agrupar por</div><select value={groupDim} onChange={e=>setGroupDim(e.target.value)} style={{...inputSt}}>{FRISKU_DIMS.map(d=><option key={d.key} value={d.key}>{d.lab}</option>)}</select></div>
        <div><div style={lblSt}>Ordenar por</div><select value={orderKey} onChange={e=>setOrderKey(e.target.value)} style={{...inputSt}}>{COLS.map(c=><option key={c.k} value={c.k}>{c.lab}</option>)}</select></div>
        <div><div style={lblSt}>Top</div><select value={topN} onChange={e=>setTopN(e.target.value)} style={{...inputSt,width:88}}><option value="5">Top 5</option><option value="10">Top 10</option><option value="20">Top 20</option><option value="all">Todos</option></select></div>
        {chips.length>0 && <button onClick={clearAll} style={{...btnSt(C.muted,true),fontSize:11,padding:"7px 10px"}}>Limpiar</button>}
        <div style={{display:"flex",gap:6,marginLeft:"auto"}}>
          <button onClick={exportExcel} disabled={expX} style={{...btnSt(C.green),fontSize:11,padding:"7px 10px"}}>{expX?"⏳":"⬇ Excel"}</button>
          <button onClick={exportPDF} disabled={expP} style={{...btnSt(C.accent),fontSize:11,padding:"7px 10px"}}>{expP?"⏳":"⬇ PDF"}</button>
        </div>
      </div>
      {(kgParcial || dq.liqClienteSinConv>0) && (
        <div style={{marginBottom:10,fontSize:11,color:C.warning,background:`${C.warning}14`,border:`1px solid ${C.warning}44`,borderRadius:8,padding:"7px 10px"}}>
          ⚠ Calidad de datos:{kgParcial && <span> Kilos <b>PARCIALES</b> — hay formatos sin peso neto en Maestros ({dq.formatosSinPeso.slice(0,6).join(", ")}); sus kilos cuentan 0.</span>}{dq.liqClienteSinConv>0 && <span> {dq.liqClienteSinConv} liquidación(es) con comisión cliente no convertible a USD de forma trazable.</span>}
        </div>
      )}
      {cobFin.tot>0 && cobFin.n===0 && (
        <div style={{marginBottom:10,fontSize:11.5,color:C.warning,background:`${C.warning}14`,border:`1px solid ${C.warning}44`,borderRadius:8,padding:"8px 11px",fontWeight:600}}>
          Sin datos financieros suficientes para esta selección — {cobFin.tot} contenedor{cobFin.tot>1?"es":""} sin liquidación. Venta y comisión aparecerán automáticamente al cargar las liquidaciones. (Los contadores logísticos sí son reales.)
        </div>
      )}
      {cobFin.tot>0 && cobFin.n>0 && cobFin.n<cobFin.tot && (
        <div style={{marginBottom:10,fontSize:11,color:C.muted,background:C.card2,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 10px"}}>
          ℹ Cobertura financiera: <b>{cobFin.n} de {cobFin.tot}</b> contenedores con liquidación ({Math.round(cobFin.n/cobFin.tot*100)}%). Venta y comisión reflejan solo esa parte; "—" = sin dato financiero todavía (no es 0 real).
        </div>
      )}

      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5,minWidth:900}}>
          <thead><tr style={{background:C.card2,color:C.muted,textAlign:"left"}}>
            <th style={{padding:"8px 10px"}}>{dimLab}</th>
            {COLS.map(c=><th key={c.k} style={{padding:"8px 10px",textAlign:"right",color:c.k==="kilograms"&&kgParcial?C.warning:undefined}}>{c.lab}{c.k==="kilograms"&&kgParcial?" ⚠":""}</th>)}
            <th style={{padding:"8px 10px",textAlign:"right"}}>Part.%</th>
          </tr></thead>
          <tbody>
            {gruposShown.map(g=>{ const isSel=sel[groupDim]&&sel[groupDim].has(g.key);
              return <tr key={g.key} onClick={()=>bi.toggle(groupDim, g.key)} title="Clic para (de)seleccionar y filtrar todo el BI (multi-selección)"
                style={{cursor:"pointer",borderTop:`1px solid ${C.border}`,background:isSel?`${C.accent2}10`:"transparent"}}>
                <td style={{padding:"7px 10px",fontWeight:isSel?700:500,color:isSel?C.accent2:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:220}}>{isSel?"☑ ":""}{g.lab}</td>
                {COLS.map(c=>{ const sinDato = FIN_KEYS.includes(c.k) && g._fin===0;
                  return <td key={c.k} style={{padding:"7px 10px",textAlign:"right",fontFamily:"monospace",color:sinDato?C.muted2:undefined}}>{sinDato?"—":fmtMetric(c.fmt,g[c.k])}</td>; })}
                <td style={{padding:"7px 10px",textAlign:"right",color:C.muted}}>{(g.friskuCommissionUSD/totComF*100).toFixed(1)}%</td>
              </tr>; })}
            {grupos.length>gruposShown.length && <tr><td colSpan={COLS.length+2} style={{padding:"6px 10px",fontSize:10.5,color:C.muted2}}>+{grupos.length-gruposShown.length} más — sube el Top para verlos</td></tr>}
            {grupos.length===0 && <tr><td colSpan={COLS.length+2} style={{padding:20,textAlign:"center",color:C.muted2}}>Sin datos para la selección.</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={{display:"flex",alignItems:"center",gap:10,margin:"16px 0 8px",flexWrap:"wrap"}}>
        <span style={{fontSize:12,fontWeight:700}}>Detalle — contenedores {detAll.length>200?`(200 de ${detAll.length})`:`(${detAll.length})`}</span>
        <input value={detQ} onChange={e=>setDetQ(e.target.value)} placeholder="Buscar OE, especie, empresa, puerto…" style={{...inputSt,maxWidth:280,fontSize:11}}/>
      </div>
      {(()=>{ const sortTh=(k,label,align)=><th onClick={()=>setDetSort(s=>({k, dir:s.k===k&&s.dir==="desc"?"asc":"desc"}))} style={{padding:"7px 10px",textAlign:align||"left",cursor:"pointer",whiteSpace:"nowrap"}} title="Ordenar">{label}{detSort.k===k?(detSort.dir==="desc"?" ▼":" ▲"):""}</th>;
      return (
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:1040}}>
          <thead><tr style={{background:C.card2,color:C.muted,textAlign:"left"}}>
            {sortTh("temporada","Temp.")}{sortTh("semana","Sem.")}{sortTh("numero","N° OE")}{sortTh("especie","Especie")}{sortTh("expcli","Exportador → Cliente")}{sortTh("etd","ETD")}
            <th style={{padding:"7px 10px"}}>Ruta</th>{sortTh("cajas","Cajas","right")}{sortTh("kilos","Kilos","right")}{sortTh("estado","Estado")}{sortTh("comF","Com. Frisku","right")}<th style={{padding:"7px 10px"}}></th>
          </tr></thead>
          <tbody>
            {detalle.map(r=>{ const sinFin=r._nLiq===0;
              return <tr key={r._id} style={{borderTop:`1px solid ${C.border}`}}>
                <td style={{padding:"6px 10px",whiteSpace:"nowrap"}}>{r.temporada}</td>
                <td style={{padding:"6px 10px",whiteSpace:"nowrap"}}>{r.semanaETD}</td>
                <td style={{padding:"6px 10px",fontFamily:"monospace",color:C.blue,whiteSpace:"nowrap"}}>{r._oe?.numero||"—"}</td>
                <td style={{padding:"6px 10px",whiteSpace:"nowrap"}}>{r.especieLab}</td>
                <td style={{padding:"6px 10px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:210}}>{r.exportadoraLab} → {r.clienteLab}</td>
                <td style={{padding:"6px 10px",whiteSpace:"nowrap"}}>{r._oe?.fechaDespacho||"—"}</td>
                <td style={{padding:"6px 10px",whiteSpace:"nowrap",color:C.muted2}}>{r._oe?.origen||"—"} → {r._oe?.destino||"—"}</td>
                <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"monospace"}}>{fmtN0(r._cajas)}</td>
                <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"monospace",color:r._kgFalta?C.warning:undefined}}>{fmtN0(r._kilos)}{r._kgFalta?" ⚠":""}</td>
                <td style={{padding:"6px 10px",whiteSpace:"nowrap"}}>{r.estado}</td>
                <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"monospace",color:sinFin?C.muted2:C.green,fontWeight:sinFin?400:700}}>{sinFin?"—":fmtUSD0(r._comF)}</td>
                <td style={{padding:"6px 10px",textAlign:"right"}}>{onVerEmbarque && r._oe && <button onClick={()=>onVerEmbarque(r._oe)} title="Ir al embarque operacional" style={{...btnSt(C.blue,true),padding:"3px 8px",fontSize:10}}>→ Ver</button>}</td>
              </tr>; })}
            {detalle.length===0 && <tr><td colSpan={12} style={{padding:16,textAlign:"center",color:C.muted2}}>Sin contenedores en la selección.</td></tr>}
          </tbody>
        </table>
      </div>); })()}
    </div>
  );
}

// HOJA COMERCIAL — mirada RELACIONAL Exportador → Cliente → Especie → embarques.
// Responde "quién trabaja con quién, cuánto embarca, qué especies, cuántos FCL".
// No duplica Clientes/Exportadores (esas son rankings); esta es el árbol de la
// relación comercial, sobre el mismo motor/selección. Drill progresivo.
function HojaComercial({ onVerEmbarque, chromeless, panelEl, fullscreen, onExitFull, exportReq }) {
  const bi = useFriskuBI();
  const { filtered, metric, chips } = bi;
  const [expE, setExpE] = useState(()=>new Set());
  const [expC, setExpC] = useState(()=>new Set());
  const [expS, setExpS] = useState(()=>new Set());
  const FLT = ["temporada","especie","exportadora","cliente","mercado","via"];
  const M = (rows,k)=>metric[k].calc(rows);
  const tree = useMemo(()=>{
    const e={};
    filtered.forEach(r=>{
      const ek=r.exportadora; const ex=e[ek]=e[ek]||{key:ek,lab:r.exportadoraLab,rows:[],cli:{}}; ex.rows.push(r);
      const ck=r.cliente; const c=ex.cli[ck]=ex.cli[ck]||{key:ck,lab:r.clienteLab,rows:[],esp:{}}; c.rows.push(r);
      const sk=r.especie; const s=c.esp[sk]=c.esp[sk]||{key:sk,lab:r.especieLab,rows:[]}; s.rows.push(r);
    });
    const byCont=(a,b)=>M(b.rows,"containers")-M(a.rows,"containers");
    return Object.values(e).map(ex=>({ ...ex,
      clientes:Object.values(ex.cli).map(c=>({ ...c, especies:Object.values(c.esp).sort(byCont) })).sort(byCont)
    })).sort(byCont);
  },[filtered]);
  const totCont = filtered.filter(r=>!r._cancel).length||1;
  const resumen = (rows)=>{ const clis=new Set(rows.map(r=>r.cliente)), esps=new Set(rows.map(r=>r.especie)), merc=new Set(rows.map(r=>r.mercado));
    return `${M(rows,"containers")} cont · ${M(rows,"fcl")} FCL · ${fmtN0(M(rows,"boxes"))} cjs · ${clis.size} cli · ${esps.size} esp · ${merc.size} merc`; };
  const pct = (rows)=>`${(M(rows,"containers")/totCont*100).toFixed(0)}%`;
  const tE=(k)=>setExpE(p=>{const n=new Set(p);n.has(k)?n.delete(k):n.add(k);return n;});
  const tC=(k)=>setExpC(p=>{const n=new Set(p);n.has(k)?n.delete(k):n.add(k);return n;});
  const tS=(k)=>setExpS(p=>{const n=new Set(p);n.has(k)?n.delete(k):n.add(k);return n;});
  const filtrosTxt = chips.length ? chips.map(c=>`${c.dimLab}=${c.label}`).join(", ") : "sin filtros";
  // Export coherente: aplana el árbol Exportador→Cliente→Especie (mismos cálculos).
  const flat = ()=>{ const out=[]; tree.forEach(ex=>ex.clientes.forEach(c=>c.especies.forEach(s=>out.push([ex.lab,c.lab,s.lab,M(s.rows,"containers"),M(s.rows,"fcl"),M(s.rows,"boxes")])))); return out; };
  const exportExcel = async ()=>{ try{
    const ExcelJS=await fr_loadExcelJS(); const wb=new ExcelJS.Workbook(); wb.creator="Grupo Mediterra — Frisku Foods";
    const ws=wb.addWorksheet("Comercial");
    fr_sheetTabla(ws,{titulo:"FRISKU FOODS — Comercial (Exportador → Cliente → Especie)", subtitulo:`Filtros: ${filtrosTxt} · ${new Date().toLocaleString("es-CL")}`,
      headers:["Exportador","Cliente","Especie","Contenedores","FCL","Cajas"], colWidths:[22,22,18,13,8,10], rows:flat(), intCols:[3,4,5]});
    await fr_logoExcel(wb,ws); await fr_descargarWB(wb,`Frisku_Comercial_${new Date().toISOString().slice(0,10)}.xlsx`);
  }catch(e){ console.error("[Comercial] Excel:",e); alert("No se pudo generar el Excel: "+e.message); } };
  const exportPDF = async ()=>{ try{
    const JsPDF=await pl_loadJsPDF(); const doc=new JsPDF({orientation:"landscape",unit:"mm",format:"a4"}); const W=297,m=12;
    doc.setFillColor(30,39,97); doc.rect(0,0,W,24,"F"); doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(13);
    doc.text("Frisku Foods — Comercial", m, 11); doc.setFont("helvetica","normal"); doc.setFontSize(7.5);
    doc.text(`Exportador → Cliente → Especie · Filtros: ${filtrosTxt} · ${new Date().toLocaleString("es-CL")}`.slice(0,175), m, 18); await fr_logoPDF(doc,W-m,4,40,15);
    doc.autoTable({ startY:28, head:[["Exportador","Cliente","Especie","Cont.","FCL","Cajas"]],
      body: flat().map(r=>[r[0],r[1],r[2],fmtN0(r[3]),fmtN0(r[4]),fmtN0(r[5])]),
      theme:"striped", styles:{fontSize:7.5}, headStyles:{fillColor:[30,39,97]}, margin:{left:m,right:m} });
    doc.save(`Frisku_Comercial_${new Date().toISOString().slice(0,10)}.pdf`);
  }catch(e){ console.error("[Comercial] PDF:",e); alert("No se pudo generar el PDF: "+e.message); } };
  useExportTrigger(exportReq, {excel:exportExcel, pdf:exportPDF});
  const pLbl = {fontSize:10,fontWeight:800,color:C.muted,textTransform:"uppercase",letterSpacing:0.4,margin:"2px 0 5px"};
  const row = (open, indent, label, right, onClick, color)=>(
    <div onClick={onClick} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",paddingLeft:10+indent*18,cursor:"pointer",borderTop:`1px solid ${C.border}`,background:open?`${C.blue}08`:"transparent"}}>
      <span style={{color:C.muted,fontSize:11,width:10}}>{onClick?(open?"▾":"▸"):""}</span>
      <span style={{flex:1,fontSize:indent===0?12.5:11.5,fontWeight:indent===0?700:500,color:color||C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{label}</span>
      <span style={{fontSize:10.5,color:C.muted,fontFamily:"monospace",whiteSpace:"nowrap"}}>{right}</span>
    </div>
  );
  const treeEl = (
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden"}}>
      {tree.length===0 && <div style={{padding:24,textAlign:"center",color:C.muted2,fontSize:12}}>Sin datos para la selección.</div>}
      {tree.map(ex=>{ const oe=expE.has(ex.key); return (
        <div key={ex.key}>
          {row(oe,0,ex.lab,`${resumen(ex.rows)} · ${pct(ex.rows)}`,()=>tE(ex.key))}
          {oe && ex.clientes.map(c=>{ const ck=`${ex.key}|${c.key}`; const oc=expC.has(ck); return (
            <div key={ck}>
              {row(oc,1,`→ ${c.lab}`,resumen(c.rows),()=>tC(ck))}
              {oc && c.especies.map(s=>{ const sk=`${ck}|${s.key}`; const os=expS.has(sk); return (
                <div key={sk}>
                  {row(os,2,`• ${s.lab}`,`${M(s.rows,"containers")} cont · ${M(s.rows,"fcl")} FCL · ${fmtN0(M(s.rows,"boxes"))} cjs`,()=>tS(sk))}
                  {os && (
                    <div style={{paddingLeft:64,paddingRight:10,paddingBottom:8}}>
                      <table style={{width:"100%",borderCollapse:"collapse",fontSize:10.5}}>
                        <tbody>
                          {s.rows.slice(0,20).map(r=>(
                            <tr key={r._id} style={{borderTop:`1px solid ${C.border}`}}>
                              <td style={{padding:"4px 6px",fontFamily:"monospace",color:C.blue,whiteSpace:"nowrap"}}>{r._oe?.numero||"—"}</td>
                              <td style={{padding:"4px 6px",whiteSpace:"nowrap"}}>{r._oe?.fechaDespacho||"—"}</td>
                              <td style={{padding:"4px 6px",textAlign:"right",fontFamily:"monospace"}}>{fmtN0(r._cajas)} cjs</td>
                              <td style={{padding:"4px 6px",textAlign:"right"}}>{onVerEmbarque&&r._oe&&<button onClick={()=>onVerEmbarque(r._oe)} style={{...btnSt(C.blue,true),padding:"2px 7px",fontSize:9.5}}>→ Ver</button>}</td>
                            </tr>
                          ))}
                          {s.rows.length>20 && <tr><td colSpan={4} style={{padding:"4px 6px",color:C.muted2,fontSize:9.5}}>+{s.rows.length-20} más</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ); })}
            </div>
          ); })}
        </div>
      ); })}
    </div>
  );
  const notaEl = <div style={{fontSize:10.5,color:C.muted2,marginTop:10}}>Árbol relacional Exportador → Cliente → Especie → embarques. Reacciona a los filtros globales. % sobre contenedores de la selección.</div>;
  const expandBtns = (
    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
      <button onClick={()=>setExpE(new Set(tree.map(x=>x.key)))} style={{...btnSt(C.muted,true),fontSize:11,padding:"5px 9px"}}>Expandir exp.</button>
      <button onClick={()=>{setExpE(new Set());setExpC(new Set());setExpS(new Set());}} style={{...btnSt(C.muted,true),fontSize:11,padding:"5px 9px"}}>Contraer</button>
    </div>
  );

  // ── Modo workspace (chromeless): jerarquía al panel; filtros comunes; ⛶/export por toolbar ──
  if(chromeless){
    const controls = (
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div><div style={pLbl}>Jerarquía</div>{expandBtns}</div>
        <div style={{fontSize:10.5,color:C.muted2}}>Preset relacional: Exportador → Cliente → Especie → embarque, sobre la selección global.</div>
      </div>
    );
    return (<>
      {panelEl && createPortal(controls, panelEl)}
      <div style={{maxHeight:"72vh",overflow:"auto"}}>{treeEl}{notaEl}</div>
      <FullscreenBI open={!!fullscreen} onClose={onExitFull} title="Comercial — Exportador → Cliente → Especie">{treeEl}</FullscreenBI>
    </>);
  }

  // ── Modo legacy (standalone) ──
  return (
    <div>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:12,marginBottom:12,display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
        {FLT.map(dk=><FiltroMultiBI key={dk} dimKey={dk} label={FRISKU_DIMS.find(d=>d.key===dk)?.lab||dk}/>)}
        <div style={{marginLeft:"auto"}}>{expandBtns}</div>
      </div>
      {treeEl}
      {notaEl}
    </div>
  );
}

// HOJA SEMANAL — serie temporal por semana ETD (dimensión real: filtra/agrupa/
// drill/export). Reacciona a los filtros globales. Distingue "sin dato" financiero.
function HojaSemanal({ onVerEmbarque, chromeless, panelEl, fullscreen, onExitFull, exportReq }) {
  const bi = useFriskuBI();
  const { filtered, metric, sel, toggle, chips } = bi;
  const [mk, setMk] = useState("containers");
  const FLT = ["temporada","especie","exportadora","cliente","mercado","via"];
  const METS = ["containers","fcl","boxes","kilograms","destinationSalesUSD","friskuCommissionUSD"];
  const MET_FIN = ["destinationSalesUSD","friskuCommissionUSD"];
  const weekNum = (s)=>{ const m=String(s).match(/(\d+)/); return m?parseInt(m[1]):0; };
  const semanas = useMemo(()=>{
    const m={};
    filtered.forEach(r=>{ if(!r.semanaETD || r.semanaETD==="—") return; const k=`${r.anioETD}·${r.semanaETD}`;
      (m[k]=m[k]||{key:k, anio:r.anioETD, sem:r.semanaETD, rows:[]}).rows.push(r); });
    return Object.values(m).map(g=>{ const o={key:g.key, anio:g.anio, sem:g.sem, lab:`${g.sem}·${String(g.anio).slice(2)}`, fin:g.rows.filter(r=>r._nLiq>0).length};
      METS.forEach(k=>o[k]=metric[k].calc(g.rows)); return o; })
      .sort((a,b)=> (Number(a.anio)-Number(b.anio)) || (weekNum(a.sem)-weekNum(b.sem)) );
  },[filtered]);
  const met = metric[mk];
  const esFin = MET_FIN.includes(mk);
  const finTot = filtered.filter(r=>r._nLiq>0).length;
  const sinDatoFin = esFin && finTot===0;
  const vals = semanas.map(s=>Number(s[mk])||0);
  const W = Math.max(360, semanas.length*48), H=210, padL=10, padR=10, padT=16, padB=42;
  const maxV = Math.max(1, ...vals), minV = Math.min(0, ...vals);
  const x = (i)=> padL + (semanas.length<=1 ? (W-padL-padR)/2 : i*(W-padL-padR)/(semanas.length-1));
  const y = (v)=> padT + (H-padT-padB)*(1-(v-minV)/((maxV-minV)||1));
  const line = semanas.map((s,i)=>`${i===0?"M":"L"} ${x(i).toFixed(1)} ${y(vals[i]).toFixed(1)}`).join(" ");
  const area = semanas.length ? `${line} L ${x(semanas.length-1).toFixed(1)} ${y(minV).toFixed(1)} L ${x(0).toFixed(1)} ${y(minV).toFixed(1)} Z` : "";
  const filtrosTxt = chips.length ? chips.map(c=>`${c.dimLab}=${c.label}`).join(", ") : "sin filtros";
  // Export coherente: la SERIE por semana ETD (todas las medidas) sobre la selección.
  const exportExcel = async ()=>{ try{
    const ExcelJS=await fr_loadExcelJS(); const wb=new ExcelJS.Workbook(); wb.creator="Grupo Mediterra — Frisku Foods";
    const ws=wb.addWorksheet("Semanal");
    fr_sheetTabla(ws,{titulo:"FRISKU FOODS — Serie semanal (ETD)", subtitulo:`Medida destacada: ${met.label} · Filtros: ${filtrosTxt} · ${new Date().toLocaleString("es-CL")}`,
      headers:["Semana ETD","Año", ...METS.map(k=>metric[k].label)], colWidths:[14,8,...METS.map(()=>13)],
      rows: semanas.map(s=>[s.sem, s.anio, ...METS.map(k=>(MET_FIN.includes(k)&&s.fin===0)?"":Math.round((Number(s[k])||0)*100)/100)]),
      moneyCols: METS.map((k,i)=>metric[k].fmt==="usd"?i+2:-1).filter(i=>i>=2),
      intCols: METS.map((k,i)=>metric[k].fmt==="int"?i+2:-1).filter(i=>i>=2) });
    await fr_logoExcel(wb,ws); await fr_descargarWB(wb,`Frisku_Semanal_${new Date().toISOString().slice(0,10)}.xlsx`);
  }catch(e){ console.error("[Semanal] Excel:",e); alert("No se pudo generar el Excel: "+e.message); } };
  const exportPDF = async ()=>{ try{
    const JsPDF=await pl_loadJsPDF(); const doc=new JsPDF({orientation:"landscape",unit:"mm",format:"a4"}); const W2=297,m=12;
    doc.setFillColor(30,39,97); doc.rect(0,0,W2,24,"F"); doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(13);
    doc.text("Frisku Foods — Serie semanal (ETD)", m, 11); doc.setFont("helvetica","normal"); doc.setFontSize(7.5);
    doc.text(`Medida: ${met.label} · Filtros: ${filtrosTxt} · ${new Date().toLocaleString("es-CL")}`.slice(0,175), m, 18); await fr_logoPDF(doc,W2-m,4,40,15);
    doc.autoTable({ startY:28, head:[["Semana","Año", ...METS.map(k=>metric[k].label)]],
      body: semanas.map(s=>[s.sem, s.anio, ...METS.map(k=>(MET_FIN.includes(k)&&s.fin===0)?"—":fmtMetric(metric[k].fmt,s[k]))]),
      theme:"striped", styles:{fontSize:7}, headStyles:{fillColor:[30,39,97]}, margin:{left:m,right:m} });
    doc.save(`Frisku_Semanal_${new Date().toISOString().slice(0,10)}.pdf`);
  }catch(e){ console.error("[Semanal] PDF:",e); alert("No se pudo generar el PDF: "+e.message); } };
  useExportTrigger(exportReq, {excel:exportExcel, pdf:exportPDF});
  const pLbl = {fontSize:10,fontWeight:800,color:C.muted,textTransform:"uppercase",letterSpacing:0.4,margin:"2px 0 5px"};

  const chartEl = sinDatoFin ? (
    <div style={{padding:30,textAlign:"center",color:C.warning,background:`${C.warning}10`,border:`1px solid ${C.warning}44`,borderRadius:12,fontSize:12,fontWeight:600}}>
      Sin datos financieros suficientes para la serie de {met.label}. Aparecerá al cargar liquidaciones. Prueba una medida logística (contenedores, FCL, cajas, kilos).
    </div>
  ) : semanas.length===0 ? (
    <div style={{padding:30,textAlign:"center",color:C.muted2,fontSize:12,background:C.card,borderRadius:12,border:`1px solid ${C.border}`}}>Sin semanas ETD en la selección.</div>
  ) : (
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:14,overflowX:"auto"}}>
      <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>{met.label} por semana ETD</div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{minWidth:Math.min(W,360)}}>
        <path d={area} fill={`${C.blue}14`}/>
        <path d={line} fill="none" stroke={C.blue} strokeWidth="2.5" strokeLinejoin="round"/>
        {semanas.map((s,i)=>{ const isSel=sel.semanaETD&&sel.semanaETD.has(s.sem);
          return <g key={s.key} style={{cursor:"pointer"}} onClick={()=>toggle("semanaETD", s.sem)}>
            <circle cx={x(i)} cy={y(vals[i])} r={isSel?6:4} fill={isSel?C.accent2:C.blue} stroke={C.card} strokeWidth="2"><title>{s.sem} {s.anio}: {fmtMetric(met.fmt,vals[i])}</title></circle>
            <text x={x(i)} y={y(vals[i])-9} textAnchor="middle" style={{fontSize:9,fill:C.text,fontWeight:700}}>{fmtMetric(met.fmt,vals[i])}</text>
            <text x={x(i)} y={H-padB+15} textAnchor="end" transform={`rotate(-40 ${x(i)} ${H-padB+15})`} style={{fontSize:9,fill:C.muted}}>{s.lab}</text>
          </g>; })}
      </svg>
      <div style={{fontSize:10,color:C.muted2,marginTop:4}}>Clic en un punto = filtrar por esa semana (multi). Semana = semana ETD (despacho).</div>
    </div>
  );
  const tableEl = (
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5,minWidth:720}}>
        <thead><tr style={{background:C.card2,color:C.muted,textAlign:"left"}}>
          <th style={{padding:"8px 10px",position:"sticky",top:0,background:C.card2}}>Semana ETD</th>
          {METS.map(k=><th key={k} style={{padding:"8px 10px",textAlign:"right",position:"sticky",top:0,background:C.card2}}>{metric[k].label}</th>)}
        </tr></thead>
        <tbody>
          {semanas.map(s=>{ const isSel=sel.semanaETD&&sel.semanaETD.has(s.sem);
            return <tr key={s.key} onClick={()=>toggle("semanaETD", s.sem)} style={{cursor:"pointer",borderTop:`1px solid ${C.border}`,background:isSel?`${C.accent2}10`:"transparent"}}>
              <td style={{padding:"7px 10px",fontWeight:600,whiteSpace:"nowrap"}}>{isSel?"☑ ":""}{s.sem} <span style={{color:C.muted2}}>{s.anio}</span></td>
              {METS.map(k=>{ const sinDato=MET_FIN.includes(k)&&s.fin===0;
                return <td key={k} style={{padding:"7px 10px",textAlign:"right",fontFamily:"monospace",color:sinDato?C.muted2:undefined}}>{sinDato?"—":fmtMetric(metric[k].fmt,s[k])}</td>; })}
            </tr>; })}
          {semanas.length===0 && <tr><td colSpan={METS.length+1} style={{padding:16,textAlign:"center",color:C.muted2}}>Sin semanas.</td></tr>}
        </tbody>
      </table>
    </div>
  );
  const medSelEl = <select value={mk} onChange={e=>setMk(e.target.value)} style={{...inputSt,width:"100%"}}>{METS.map(k=><option key={k} value={k}>{metric[k].label}</option>)}</select>;

  // ── Modo workspace (chromeless): Medida al panel; filtros comunes; ⛶/export por toolbar ──
  if(chromeless){
    const controls = (
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div><div style={pLbl}>Medida</div>{medSelEl}</div>
        <div style={{fontSize:10.5,color:C.muted2}}>Tendencia por semana ETD sobre la selección global. Clic en un punto/fila filtra esa semana.</div>
      </div>
    );
    return (<>
      {panelEl && createPortal(controls, panelEl)}
      <div style={{maxHeight:"72vh",overflow:"auto",display:"flex",flexDirection:"column",gap:12}}>{chartEl}{tableEl}</div>
      <FullscreenBI open={!!fullscreen} onClose={onExitFull} title={`Semanal · ${met.label}`}><div style={{display:"flex",flexDirection:"column",gap:12}}>{chartEl}{tableEl}</div></FullscreenBI>
    </>);
  }

  // ── Modo legacy (standalone) ──
  return (
    <div>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:12,marginBottom:12,display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
        {FLT.map(dk=><FiltroMultiBI key={dk} dimKey={dk} label={FRISKU_DIMS.find(d=>d.key===dk)?.lab||dk}/>)}
        <div><div style={lblSt}>Medida</div><select value={mk} onChange={e=>setMk(e.target.value)} style={{...inputSt}}>{METS.map(k=><option key={k} value={k}>{metric[k].label}</option>)}</select></div>
      </div>
      <div style={{marginBottom:12}}>{chartEl}</div>
      {tableEl}
    </div>
  );
}

// HOJA COMPARATIVO — temporada actual vs anterior (valor, comparativo, Δ, Δ%).
// e5: respeta la selección global (excepto la dimensión temporada, que este preset
// controla) usando bi.ignoring("temporada"). Comparador fijo (no alternate states).
function HojaComparativo({ chromeless, panelEl, fullscreen, onExitFull, exportReq }) {
  const bi = useFriskuBI();
  const { facts, metric, ignoring, chips } = bi;
  // Año de inicio de la temporada ("2026-2027" → 2026). Ordena por año, no lexicográfico.
  const startY = (t)=>{ const m=String(t).match(/(\d{4})/); return m?parseInt(m[1]):0; };
  const temps = useMemo(()=>[...new Set(facts.map(r=>r.temporada).filter(t=>t&&t!=="—"))].sort((a,b)=>startY(b)-startY(a)),[facts]);
  // Regla temporada precedente: la que empieza un año antes (año_inicio − 1); si esa
  // temporada no existe (hueco), la siguiente más baja presente.
  const anteriorDe = (t)=>{ const y=startY(t); return temps.find(x=>startY(x)===y-1) || temps.find(x=>startY(x)<y) || ""; };
  const [actual, setActual] = useState("");
  const [anterior, setAnterior] = useState("");
  useEffect(()=>{ setActual(a=>a||temps[0]||""); },[temps.join("|")]);
  useEffect(()=>{ if(actual) setAnterior(anteriorDe(actual)); /* eslint-disable-next-line */ },[actual, temps.join("|")]);
  // Universo que respeta TODA la selección global salvo temporada (la maneja este preset).
  const baseSel = ignoring("temporada");
  const rowsA = baseSel.filter(r=>r.temporada===actual);
  const rowsB = baseSel.filter(r=>r.temporada===anterior);
  const KPIS = ["containers","fcl","boxes","kilograms","destinationSalesUSD","clientCommissionUSD","friskuCommissionUSD","activeClients","activeExporters"];
  const selSt={...inputSt, maxWidth:160};
  const filtrosTxt = chips.length ? chips.map(c=>`${c.dimLab}=${c.label}`).join(", ") : "sin filtros";
  const rowsExp = ()=>KPIS.map(k=>{ const m=metric[k]; const a=m.calc(rowsA), b=m.calc(rowsB); const va=a-b; const vp=b!==0?va/b*100:(a>0?100:0);
    return { lab:m.label, fmt:m.fmt, a, b, va, vp }; });
  const exportExcel = async ()=>{ try{
    const ExcelJS=await fr_loadExcelJS(); const wb=new ExcelJS.Workbook(); wb.creator="Grupo Mediterra — Frisku Foods";
    const ws=wb.addWorksheet("Comparativo");
    const rowsX = rowsExp().map(r=>[r.lab, Math.round(r.a*100)/100, anterior?Math.round(r.b*100)/100:"", anterior?Math.round(r.va*100)/100:"", (anterior&&r.fmt!=="pct")?Math.round(r.vp):""]);
    fr_sheetTabla(ws,{titulo:"FRISKU FOODS — Comparativo de temporadas", subtitulo:`${actual||"A"} vs ${anterior||"B"} · Filtros: ${filtrosTxt} · ${new Date().toLocaleString("es-CL")}`,
      headers:["Indicador", actual||"A", anterior||"B", "Δ", "Δ%"], colWidths:[26,15,15,13,9], rows:rowsX});
    await fr_logoExcel(wb,ws); await fr_descargarWB(wb,`Frisku_Comparativo_${new Date().toISOString().slice(0,10)}.xlsx`);
  }catch(e){ console.error("[Comparativo] Excel:",e); alert("No se pudo generar el Excel: "+e.message); } };
  const exportPDF = async ()=>{ try{
    const JsPDF=await pl_loadJsPDF(); const doc=new JsPDF({orientation:"landscape",unit:"mm",format:"a4"}); const W=297,m=12;
    doc.setFillColor(30,39,97); doc.rect(0,0,W,24,"F"); doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(13);
    doc.text("Frisku Foods — Comparativo de temporadas", m, 11); doc.setFont("helvetica","normal"); doc.setFontSize(7.5);
    doc.text(`${actual||"A"} vs ${anterior||"B"} · Filtros: ${filtrosTxt} · ${new Date().toLocaleString("es-CL")}`.slice(0,175), m, 18); await fr_logoPDF(doc,W-m,4,40,15);
    doc.autoTable({ startY:28, head:[["Indicador", actual||"A", anterior||"B", "Δ", "Δ%"]],
      body: rowsExp().map(r=>[r.lab, fmtMetric(r.fmt,r.a), anterior?fmtMetric(r.fmt,r.b):"—",
        anterior?(r.fmt==="pct"?`${r.va>0?"+":""}${r.va.toFixed(1)} pts`:`${r.va>0?"+":""}${fmtMetric(r.fmt,r.va)}`):"—",
        (anterior&&r.fmt!=="pct")?`${r.vp>0?"+":""}${r.vp.toFixed(0)}%`:"—"]),
      theme:"striped", styles:{fontSize:8}, headStyles:{fillColor:[30,39,97]}, margin:{left:m,right:m} });
    doc.save(`Frisku_Comparativo_${new Date().toISOString().slice(0,10)}.pdf`);
  }catch(e){ console.error("[Comparativo] PDF:",e); alert("No se pudo generar el PDF: "+e.message); } };
  useExportTrigger(exportReq, {excel:exportExcel, pdf:exportPDF});
  const pLbl = {fontSize:10,fontWeight:800,color:C.muted,textTransform:"uppercase",letterSpacing:0.4,margin:"2px 0 5px"};

  const tablaEl = (
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:620}}>
        <thead><tr style={{background:C.card2,color:C.muted,textAlign:"left"}}>
          <th style={{padding:"9px 12px"}}>Indicador</th>
          <th style={{padding:"9px 12px",textAlign:"right"}}>Período A · {actual||"Actual"}</th>
          <th style={{padding:"9px 12px",textAlign:"right"}}>Período B · {anterior||"Anterior"}</th>
          <th style={{padding:"9px 12px",textAlign:"right"}}>Δ</th>
          <th style={{padding:"9px 12px",textAlign:"right"}}>Δ%</th>
        </tr></thead>
        <tbody>
          {rowsExp().map((r,i)=>{ const col=r.va>0?C.green:r.va<0?C.accent:C.muted;
            return <tr key={i} style={{borderTop:`1px solid ${C.border}`}}>
              <td style={{padding:"8px 12px",fontWeight:600}}>{r.lab}</td>
              <td style={{padding:"8px 12px",textAlign:"right",fontFamily:"monospace",fontWeight:700}}>{fmtMetric(r.fmt,r.a)}</td>
              <td style={{padding:"8px 12px",textAlign:"right",fontFamily:"monospace",color:C.muted}}>{anterior?fmtMetric(r.fmt,r.b):"—"}</td>
              <td style={{padding:"8px 12px",textAlign:"right",fontFamily:"monospace",color:col}}>{anterior?(r.fmt==="pct"?`${r.va>0?"+":""}${r.va.toFixed(1)} pts`:`${r.va>0?"+":""}${fmtMetric(r.fmt,r.va)}`):"—"}</td>
              <td style={{padding:"8px 12px",textAlign:"right",fontFamily:"monospace",color:col,fontWeight:700}}>{anterior&&r.fmt!=="pct"?`${r.vp>0?"+":""}${r.vp.toFixed(0)}%`:"—"}</td>
            </tr>; })}
        </tbody>
      </table>
    </div>
  );
  const notaEl = <div style={{fontSize:10.5,color:C.muted2,marginTop:10}}>Δ = A − B. La temporada anterior se determina por año de inicio (año − 1); si falta, la siguiente presente más baja. Respeta la selección global (salvo la dimensión temporada, que controlan los selectores).</div>;
  const selectoresEl = (
    <>
      <div><div style={lblSt}>Período A (actual)</div><select value={actual} onChange={e=>setActual(e.target.value)} style={selSt}>{temps.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
      <div><div style={lblSt}>Período B (anterior)</div><select value={anterior} onChange={e=>setAnterior(e.target.value)} style={selSt}><option value="">—</option>{temps.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
    </>
  );

  // ── Modo workspace (chromeless): períodos al panel; filtros comunes; ⛶/export por toolbar ──
  if(chromeless){
    const controls = (
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div><div style={pLbl}>Período A (actual)</div><select value={actual} onChange={e=>setActual(e.target.value)} style={{...inputSt,width:"100%"}}>{temps.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
        <div><div style={pLbl}>Período B (anterior)</div><select value={anterior} onChange={e=>setAnterior(e.target.value)} style={{...inputSt,width:"100%"}}><option value="">—</option>{temps.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
        <div style={{fontSize:10.5,color:C.muted2}}>Comparador fijo A/B por temporada. Respeta la selección global (salvo temporada).</div>
      </div>
    );
    return (<>
      {panelEl && createPortal(controls, panelEl)}
      <div style={{maxHeight:"74vh",overflow:"auto"}}>{tablaEl}{notaEl}</div>
      <FullscreenBI open={!!fullscreen} onClose={onExitFull} title={`Comparativo · ${actual||"A"} vs ${anterior||"B"}`}>{tablaEl}</FullscreenBI>
    </>);
  }

  // ── Modo legacy (standalone) ──
  return (
    <div>
      <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-end",marginBottom:14}}>{selectoresEl}</div>
      {tablaEl}
      {notaEl}
    </div>
  );
}

// COMPARADOR A/B (Alternate States real, P2.3). Dos selecciones INDEPENDIENTES
// capturadas de la barra global (snapshots), evaluadas sobre la MISMA tabla de
// hechos con las MISMAS métricas (metric.calc). No reemplaza el preset Comparativo
// (que es fijo por temporada). Δ = A − B; Δ% relativo a |B| (— si B=0); distingue
// cero real de "Sin datos suficientes"; count-distinct recalculado por estado.
function ComparadorAB({ chromeless, panelEl, fullscreen, onExitFull, exportReq }) {
  const bi = useFriskuBI();
  const { facts, metric } = bi;
  const [selA, setSelA] = useState({});    // {dimKey:Set}
  const [selB, setSelB] = useState({});
  const cloneSel  = (s)=>{ const o={}; Object.keys(s||{}).forEach(k=>{ if(s[k]&&s[k].size) o[k]=new Set(s[k]); }); return o; };
  const selToArr  = (s)=>{ const o={}; Object.keys(s||{}).forEach(k=>{ if(s[k]&&s[k].size) o[k]=[...s[k]]; }); return o; };
  const isEmpty   = (s)=> !s || Object.keys(s).every(k=>!s[k]||!s[k].size);
  const labOf     = (dim,v)=>{ const h=facts.find(r=>r[dim]===v); return h?(h[dim+"Lab"]??v):v; };
  const dimLab    = (dim)=> (FRISKU_DIMS.find(d=>d.key===dim)?.lab)||dim;
  const selChips  = (s)=> Object.keys(s||{}).filter(k=>s[k]&&s[k].size).map(k=>({dim:k, lab:dimLab(k), vals:[...s[k]].map(v=>labOf(k,v))}));
  const defTxt    = (s)=> isEmpty(s) ? "Todo el universo" : selChips(s).map(c=>`${c.lab}=${c.vals.join("/")}`).join(" · ");

  const KPIS = ["containers","fcl","boxes","kilograms","destinationSalesUSD","clientCommissionUSD","friskuCommissionUSD","avgCommissionPct","activeClients","activeExporters"];
  const mets = KPIS.map(k=>metric[k]).filter(Boolean);
  const rows = compararEstados(facts, selA, selB, mets);

  const fijarA = ()=> setSelA(cloneSel(bi.sel));
  const fijarB = ()=> setSelB(cloneSel(bi.sel));
  const swap   = ()=> { setSelA(cloneSel(selB)); setSelB(cloneSel(selA)); };
  const copyAB = ()=> setSelB(cloneSel(selA));
  const copyBA = ()=> setSelA(cloneSel(selB));
  const editarA= ()=> bi.applySel(selToArr(selA));
  const editarB= ()=> bi.applySel(selToArr(selB));

  const dCell = (r)=> (r.sinDatosA||r.sinDatosB) ? "—" : (r.fmt==="pct" ? `${r.dif>0?"+":""}${r.dif.toFixed(1)} pts` : `${r.dif>0?"+":""}${fmtMetric(r.fmt,r.dif)}`);
  const pCell = (r)=> (r.sinDatosA||r.sinDatosB||r.fmt==="pct"||r.difPct===null) ? "—" : `${r.difPct>0?"+":""}${r.difPct.toFixed(0)}%`;
  const colOf = (r)=> (r.sinDatosA||r.sinDatosB) ? C.muted : (r.dif>0?C.green:r.dif<0?C.accent:C.muted);

  const exportExcel = async ()=>{ try{
    const ExcelJS=await fr_loadExcelJS(); const wb=new ExcelJS.Workbook(); wb.creator="Grupo Mediterra — Frisku Foods";
    const ws=wb.addWorksheet("Comparador A-B");
    const rowsX = rows.map(r=>[ r.label,
      r.sinDatosA?"Sin datos":Math.round(r.A*100)/100,
      r.sinDatosB?"Sin datos":Math.round(r.B*100)/100,
      (r.sinDatosA||r.sinDatosB)?"":Math.round(r.dif*100)/100,
      (r.sinDatosA||r.sinDatosB||r.fmt==="pct"||r.difPct===null)?"":Math.round(r.difPct) ]);
    fr_sheetTabla(ws,{titulo:"FRISKU FOODS — Comparador A/B", subtitulo:`A: ${defTxt(selA)}  |  B: ${defTxt(selB)} · ${new Date().toLocaleString("es-CL")}`,
      headers:["Indicador","Estado A","Estado B","Δ","Δ%"], colWidths:[28,18,18,14,9], rows:rowsX});
    await fr_logoExcel(wb,ws); await fr_descargarWB(wb,`Frisku_ComparadorAB_${new Date().toISOString().slice(0,10)}.xlsx`);
  }catch(e){ console.error("[ComparadorAB] Excel:",e); alert("No se pudo generar el Excel: "+e.message); } };
  const exportPDF = async ()=>{ try{
    const JsPDF=await pl_loadJsPDF(); const doc=new JsPDF({orientation:"landscape",unit:"mm",format:"a4"}); const W=297,m=12;
    doc.setFillColor(30,39,97); doc.rect(0,0,W,24,"F"); doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(13);
    doc.text("Frisku Foods — Comparador A/B", m, 11); doc.setFont("helvetica","normal"); doc.setFontSize(7.5);
    doc.text(`A: ${defTxt(selA)}  |  B: ${defTxt(selB)} · ${new Date().toLocaleString("es-CL")}`.slice(0,175), m, 18); await fr_logoPDF(doc,W-m,4,40,15);
    doc.autoTable({ startY:28, head:[["Indicador","Estado A","Estado B","Δ","Δ%"]],
      body: rows.map(r=>[ r.label,
        r.sinDatosA?"Sin datos":fmtMetric(r.fmt,r.A),
        r.sinDatosB?"Sin datos":fmtMetric(r.fmt,r.B),
        dCell(r), pCell(r) ]),
      theme:"striped", styles:{fontSize:8}, headStyles:{fillColor:[30,39,97]}, margin:{left:m,right:m} });
    doc.save(`Frisku_ComparadorAB_${new Date().toISOString().slice(0,10)}.pdf`);
  }catch(e){ console.error("[ComparadorAB] PDF:",e); alert("No se pudo generar el PDF: "+e.message); } };
  useExportTrigger(exportReq, {excel:exportExcel, pdf:exportPDF});

  const pLbl = {fontSize:10,fontWeight:800,color:C.muted,textTransform:"uppercase",letterSpacing:0.4,margin:"2px 0 5px"};
  const abBtn = (bg)=>({...btnSt(bg),fontSize:11,padding:"6px 9px",width:"100%",textAlign:"left"});
  const defBox = (titulo, s, color)=>(
    <div style={{border:`1px solid ${color}55`,background:`${color}0e`,borderRadius:9,padding:"7px 9px"}}>
      <div style={{fontSize:10,fontWeight:800,color,letterSpacing:0.4}}>{titulo}</div>
      {isEmpty(s) ? <div style={{fontSize:11,color:C.muted2,marginTop:3}}>Todo el universo</div>
        : <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:4}}>{selChips(s).map(c=>(
            <span key={c.dim} style={{fontSize:10,background:C.card2,border:`1px solid ${C.border}`,borderRadius:6,padding:"1px 6px"}}><b style={{color:C.muted}}>{c.lab}:</b> {c.vals.join(", ")}</span>
          ))}</div>}
    </div>
  );
  const controls = (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div style={pLbl}>Definir estados</div>
      <button onClick={fijarA} style={abBtn(C.blue)}>Fijar selección actual → A</button>
      <button onClick={fijarB} style={abBtn(C.teal||C.blue)}>Fijar selección actual → B</button>
      <div style={{display:"flex",gap:6}}>
        <button onClick={swap} title="Intercambiar A y B" style={{...btnSt(C.muted,true),fontSize:11,padding:"6px 8px",flex:1}}>A ⇄ B</button>
        <button onClick={copyAB} title="Copiar A en B" style={{...btnSt(C.muted,true),fontSize:11,padding:"6px 8px",flex:1}}>A→B</button>
        <button onClick={copyBA} title="Copiar B en A" style={{...btnSt(C.muted,true),fontSize:11,padding:"6px 8px",flex:1}}>B→A</button>
      </div>
      <div style={{display:"flex",gap:6}}>
        <button onClick={editarA} title="Cargar A en la barra global para editarlo" style={{...btnSt(C.muted,true),fontSize:11,padding:"6px 8px",flex:1}}>Editar A</button>
        <button onClick={editarB} title="Cargar B en la barra global para editarlo" style={{...btnSt(C.muted,true),fontSize:11,padding:"6px 8px",flex:1}}>Editar B</button>
      </div>
      <div style={{display:"flex",gap:6}}>
        <button onClick={()=>setSelA({})} style={{...btnSt(C.muted,true),fontSize:11,padding:"6px 8px",flex:1}}>Limpiar A</button>
        <button onClick={()=>setSelB({})} style={{...btnSt(C.muted,true),fontSize:11,padding:"6px 8px",flex:1}}>Limpiar B</button>
      </div>
      <div style={{fontSize:10.5,color:C.muted2}}>A y B son selecciones independientes (no la barra global). Compón una selección arriba y fíjala como A o B. Δ = A − B.</div>
    </div>
  );

  const tablaEl = (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>{defBox("ESTADO A", selA, C.blue)}{defBox("ESTADO B", selB, C.teal||C.blue)}</div>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:620}}>
          <thead><tr style={{background:C.card2,color:C.muted,textAlign:"left"}}>
            <th style={{padding:"9px 12px"}}>Indicador</th>
            <th style={{padding:"9px 12px",textAlign:"right"}}>Estado A</th>
            <th style={{padding:"9px 12px",textAlign:"right"}}>Estado B</th>
            <th style={{padding:"9px 12px",textAlign:"right"}}>Δ</th>
            <th style={{padding:"9px 12px",textAlign:"right"}}>Δ%</th>
          </tr></thead>
          <tbody>
            {rows.map((r,i)=>(
              <tr key={i} style={{borderTop:`1px solid ${C.border}`}}>
                <td style={{padding:"8px 12px",fontWeight:600}}>{r.label}</td>
                <td style={{padding:"8px 12px",textAlign:"right",fontFamily:"monospace",fontWeight:700}}>{r.sinDatosA?<span style={{color:C.muted2,fontFamily:"inherit",fontWeight:400,fontSize:11}}>Sin datos suficientes</span>:fmtMetric(r.fmt,r.A)}</td>
                <td style={{padding:"8px 12px",textAlign:"right",fontFamily:"monospace",color:C.muted}}>{r.sinDatosB?<span style={{color:C.muted2,fontFamily:"inherit",fontWeight:400,fontSize:11}}>Sin datos suficientes</span>:fmtMetric(r.fmt,r.B)}</td>
                <td style={{padding:"8px 12px",textAlign:"right",fontFamily:"monospace",color:colOf(r)}}>{dCell(r)}</td>
                <td style={{padding:"8px 12px",textAlign:"right",fontFamily:"monospace",color:colOf(r),fontWeight:700}}>{pCell(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{fontSize:10.5,color:C.muted2}}>Δ = A − B. Δ% relativo a |B| (— si B = 0). "Sin datos suficientes" = el estado no tiene hechos; distinto de un cero real. Clientes/Exportadores activos y demás recuentos se recalculan por estado (no se suman subtotales).</div>
    </div>
  );

  if(chromeless){
    return (<>
      {panelEl && createPortal(controls, panelEl)}
      <div style={{maxHeight:"74vh",overflow:"auto"}}>{tablaEl}</div>
      <FullscreenBI open={!!fullscreen} onClose={onExitFull} title="Comparador A/B">{tablaEl}</FullscreenBI>
    </>);
  }
  return (<div><div style={{display:"flex",gap:16,flexWrap:"wrap",alignItems:"flex-start"}}><div style={{width:240}}>{controls}</div><div style={{flex:1,minWidth:0}}>{tablaEl}</div></div></div>);
}

// FILTER PANE — un campo (listbox persistente) con los 4 estados asociativos +
// menú ⋯ de acciones Qlik (seleccionar posibles/alternativos/excluidos, invertir,
// limpiar). Compacto, colapsable, con búsqueda y scroll.
function FilterFieldBI({ dimKey, label }) {
  const bi = useFriskuBI();
  const { sel, toggle, setMany, clearDim, associative } = bi;
  const [q,setQ]=useState(""); const [menu,setMenu]=useState(false); const [col,setCol]=useState(false);
  const menuRef=useRef(null);
  useEffect(()=>{ const h=(e)=>{ if(menuRef.current&&!menuRef.current.contains(e.target))setMenu(false); }; document.addEventListener("mousedown",h); return ()=>document.removeEventListener("mousedown",h); },[]);
  const { selected, possible, alternative, excluded } = associative(dimKey);
  const selSet = sel[dimKey]||new Set();
  const selectable = [...selected,...possible,...alternative].map(x=>x.value);
  const qq=q.trim().toLowerCase(); const fil=(a)=>qq?a.filter(x=>String(x.label).toLowerCase().includes(qq)):a;
  const Fila=({x,estado})=>{ const on=estado==="sel"; const c=estado==="sel"?C.accent2:estado==="pos"?C.text:estado==="alt"?C.muted:C.muted2; const bg=estado==="sel"?`${C.accent2}18`:estado==="alt"?`${C.muted}10`:"transparent";
    return <div onClick={()=>toggle(dimKey,x.value)} style={{display:"flex",justifyContent:"space-between",gap:6,alignItems:"center",padding:"2px 7px",cursor:"pointer",fontSize:11,background:bg}}>
      <span style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",color:c,fontWeight:on?700:400,textDecoration:estado==="exc"?"line-through":"none",opacity:estado==="exc"?0.75:1}}>{on?"☑":"☐"} {x.label}</span>
      {x.m!=null && <span style={{fontSize:9,color:C.muted2}}>{fmtN0(x.m)}</span>}
    </div>; };
  const item=(label,fn)=><div onClick={()=>{fn();setMenu(false);}} style={{padding:"5px 9px",cursor:"pointer",fontSize:11}}>{label}</div>;
  const n=selSet.size;
  return (
    <div style={{border:`1px solid ${C.border}`,borderRadius:8,background:C.card,display:"flex",flexDirection:"column",minWidth:0}}>
      <div style={{display:"flex",alignItems:"center",gap:4,padding:"5px 7px",borderBottom:col?"none":`1px solid ${C.border}`}}>
        <span onClick={()=>setCol(c=>!c)} style={{cursor:"pointer",color:C.muted,fontSize:10}}>{col?"▸":"▾"}</span>
        <span style={{flex:1,fontSize:11,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{label}{n>0&&<span style={{color:C.accent2}}> · {n}</span>}</span>
        <div ref={menuRef} style={{position:"relative"}}>
          <span onClick={()=>setMenu(m=>!m)} title="Acciones" style={{cursor:"pointer",color:C.muted,fontSize:12,padding:"0 3px"}}>⋯</span>
          {menu && <div style={{position:"absolute",zIndex:70,top:"100%",right:0,background:C.card,border:`1px solid ${C.border}`,borderRadius:7,boxShadow:C.shadowSm||"0 8px 24px rgba(0,0,0,.18)",minWidth:170}}>
            {item("Seleccionar posibles",()=>setMany(dimKey,[...selected,...possible].map(x=>x.value)))}
            {item("Seleccionar alternativos",()=>setMany(dimKey,alternative.map(x=>x.value)))}
            {item("Seleccionar excluidos",()=>setMany(dimKey,excluded.map(x=>x.value)))}
            {item("Invertir selección",()=>setMany(dimKey,invertSelection(selSet,selectable)))}
            {item("Limpiar campo",()=>clearDim(dimKey))}
          </div>}
        </div>
      </div>
      {!col && <>
        <div style={{padding:"4px 6px"}}><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar…" style={{...inputSt,width:"100%",padding:"3px 6px",fontSize:10.5}}/></div>
        <div style={{maxHeight:150,overflowY:"auto",paddingBottom:4}}>
          {fil(selected).map(x=><Fila key={x.value} x={x} estado="sel"/>)}
          {fil(possible).map(x=><Fila key={x.value} x={x} estado="pos"/>)}
          {fil(alternative).map(x=><Fila key={x.value} x={x} estado="alt"/>)}
          {fil(excluded).slice(0,40).map(x=><Fila key={x.value} x={x} estado="exc"/>)}
          {selected.length+possible.length+alternative.length+excluded.length===0 && <div style={{padding:8,fontSize:10.5,color:C.muted2,textAlign:"center"}}>Sin valores</div>}
        </div>
      </>}
    </div>
  );
}
// Panel de filtros colapsable con varias dimensiones (estilo Qlik).
function FilterPaneBI({ open }) {
  const bi = useFriskuBI();
  const DIMS = ["temporada","especie","exportadora","cliente","mercado","paisDestino","estado","via","semanaETD"];
  const activas = DIMS.filter(d=>bi.sel[d]&&bi.sel[d].size>0).length;
  if(!open) return null;
  return (
    <div style={{background:C.card2,border:`1px solid ${C.border}`,borderRadius:10,padding:"8px 10px 10px",marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <span style={{fontSize:10.5,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:0.4}}>Panel de filtros</span>
        <span style={{fontSize:10.5,color:C.muted2}}>{activas>0?`${activas} con selección`:"asociativo · clic para acotar"}</span>
        {activas>0 && <button onClick={()=>bi.clearAll()} style={{...btnSt(C.muted,true),fontSize:10,padding:"2px 8px",marginLeft:"auto"}}>Limpiar todo</button>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(186px,1fr))",gap:7}}>
        {DIMS.map(d=><FilterFieldBI key={d} dimKey={d} label={FRISKU_DIMS.find(x=>x.key===d)?.lab||d}/>)}
      </div>
    </div>
  );
}

// Overlay de pantalla completa para objetos densos (Straight Table / Pivot / Explorador).
function FullscreenBI({ open, title, onClose, children }) {
  if(!open) return null;
  return (
    <div style={{position:"fixed",inset:0,zIndex:200,background:C.bg,display:"flex",flexDirection:"column",padding:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <span style={{fontSize:14,fontWeight:800}}>{title}</span>
        <button onClick={onClose} style={{...btnSt(C.muted,true),fontSize:12}}>✕ Cerrar pantalla completa</button>
      </div>
      <div style={{flex:1,overflow:"auto"}}>{children}</div>
    </div>
  );
}

// STRAIGHT TABLE configurable (estilo Qlik). Elige dimensiones + medidas del
// catálogo (FRISKU_DIMS/FRISKU_METRICS), ordena por cualquier columna, busca,
// selecciona (clic en celda de dimensión → filtra todo el BI), % participación,
// totales, export Excel/PDF y pantalla completa. Mismo motor/selección; sin
// fórmulas nuevas (usa metric.calc). % participación = valor fila / total mostrado.
// P1.9e-h1: dispara el export del objeto ACTIVO cuando cambia exportReq, usando
// SIEMPRE las funciones del render más reciente (latest-ref) → el export consume
// exactamente el estado/dataset que alimenta el objeto visible (selección global
// vigente), sin depender de un closure de useEffect que pueda quedar rezagado
// (AnalysisWorkspace no consume el contexto BI, así que su render no acompaña los
// cambios de selección). No cambia cálculos ni motor.
function useExportTrigger(exportReq, exporters){
  const latest = useRef(exporters);
  latest.current = exporters;                 // cada render → funciones actuales
  const lastN = useRef(exportReq?.n);
  useEffect(()=>{
    if(!exportReq || exportReq.n===lastN.current) return;
    lastN.current = exportReq.n;
    const f = latest.current;
    (exportReq.type==="pdf" ? f.pdf : f.excel)?.();
  }, [exportReq]); // eslint-disable-line react-hooks/exhaustive-deps
}

function StraightTableBI({ onVerEmbarque, chromeless, panelEl, fullscreen, onExitFull, exportReq, initialConfig, onConfig }) {
  const bi = useFriskuBI();
  const { filtered, dims, metrics, metric, sel, toggle } = bi;
  // P2.1b: semilla desde bookmark (initialConfig). Sin initialConfig → defaults idénticos a hoy.
  const ic = initialConfig||{};
  const [dimSel, setDimSel] = useState(()=> Array.isArray(ic.dimSel)&&ic.dimSel.length ? ic.dimSel : ["cliente"]);
  const [medSel, setMedSel] = useState(()=> Array.isArray(ic.medSel)&&ic.medSel.length ? ic.medSel : ["containers","fcl","boxes","friskuCommissionUSD"]);
  const [sortCol, setSortCol] = useState(()=> typeof ic.sortCol==="string" ? ic.sortCol : "med:friskuCommissionUSD");
  const [sortDir, setSortDir] = useState(()=> (ic.sortDir==="asc"||ic.sortDir==="desc") ? ic.sortDir : "desc");
  // Reporta config vigente (canal lateral hacia el workspace; no re-renderiza → no hay loop).
  useEffect(()=>{ onConfig && onConfig({ dimSel, medSel, sortCol, sortDir }); }, [dimSel, medSel, sortCol, sortDir]);
  const [q, setQ] = useState("");
  const [cfgOpen, setCfgOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [full, setFull] = useState(false);
  const [expX,setExpX]=useState(false), [expP,setExpP]=useState(false);
  const [detQ,setDetQ]=useState(""); const [detSort,setDetSort]=useState({k:"comF",dir:"desc"});
  const cfgRef=useRef(null), menuRef=useRef(null);
  useEffect(()=>{ const h=(e)=>{ if(cfgRef.current&&!cfgRef.current.contains(e.target))setCfgOpen(false); if(menuRef.current&&!menuRef.current.contains(e.target))setMenuOpen(false); }; document.addEventListener("mousedown",h); return ()=>document.removeEventListener("mousedown",h); },[]);
  const FIN = new Set(["destinationSalesUSD","clientCommissionUSD","friskuCommissionUSD","avgCommissionPct"]);
  const toggleDim=(k)=>setDimSel(s=>s.includes(k)?s.filter(x=>x!==k):[...s,k]);
  const toggleMed=(k)=>setMedSel(s=>s.includes(k)?s.filter(x=>x!==k):[...s,k]);

  const rows = useMemo(()=>{
    const groups = groupByDims(filtered, dimSel);
    return groups.map(g=>{ const o={key:g.key, dimValues:g.dimValues, labels:g.labels, _rows:g.rows, _fin:g.rows.filter(r=>r._nLiq>0).length};
      medSel.forEach(mk=>o[mk]=metric[mk].calc(g.rows)); return o; });
  },[filtered, dimSel.join(","), medSel.join(",")]);
  const primary = medSel[0]||"containers";
  const totPrimary = rows.reduce((s,r)=>s+(r[primary]||0),0)||1;
  const valOf=(r,col)=>{ if(col.startsWith("dim:")) return String(r.labels[col.slice(4)]??""); if(col==="part") return r[primary]/totPrimary; return Number(r[col.slice(4)])||0; };
  const sorted = useMemo(()=>{
    const qq=q.trim().toLowerCase();
    let a = qq ? rows.filter(r=>dimSel.map(d=>r.labels[d]).join(" ").toLowerCase().includes(qq)) : rows.slice();
    const col = sortCol;
    a.sort((x,y)=>{ const vx=valOf(x,col), vy=valOf(y,col); const c=(typeof vx==="number"&&typeof vy==="number")?vx-vy:String(vx).localeCompare(String(vy)); return sortDir==="desc"?-c:c; });
    return a;
  },[rows, q, sortCol, sortDir, dimSel.join(","), primary]);
  const totalsRow = useMemo(()=>{ const o={}; medSel.forEach(mk=>o[mk]=metric[mk].calc(filtered)); return o; },[filtered, medSel.join(",")]);
  const setSort=(col)=>{ if(sortCol===col) setSortDir(d=>d==="desc"?"asc":"desc"); else { setSortCol(col); setSortDir(col.startsWith("dim:")?"asc":"desc"); } };
  const filtrosTxt = bi.chips.length ? bi.chips.map(c=>`${c.dimLab}=${c.label}`).join(", ") : "sin filtros";

  const exportExcel = async ()=>{ setExpX(true); try{
    const ExcelJS=await fr_loadExcelJS(); const wb=new ExcelJS.Workbook(); wb.creator="Grupo Mediterra — Frisku Foods";
    const headers=[...dimSel.map(d=>dims.find(x=>x.key===d)?.lab||d), ...medSel.map(m=>metric[m].label), "% part."];
    const rowsX=sorted.map(r=>[...dimSel.map(d=>r.labels[d]), ...medSel.map(m=> (FIN.has(m)&&r._fin===0)?"" : Math.round((metric[m].fmt==="pct"? r[m] : r[m])*100)/100), Number((r[primary]/totPrimary*100).toFixed(1))]);
    const money=medSel.map((m,i)=>metric[m].fmt==="usd"?dimSel.length+i:-1).filter(i=>i>=dimSel.length);
    const ws=wb.addWorksheet("Tabla");
    fr_sheetTabla(ws,{titulo:"FRISKU FOODS — Tabla analítica", subtitulo:`Dims: ${dimSel.join(", ")} · Filtros: ${filtrosTxt} · ${new Date().toLocaleString("es-CL")}`,
      headers, colWidths:headers.map((h,i)=>i<dimSel.length?22:14), rows:rowsX, moneyCols:money});
    await fr_logoExcel(wb,ws);
    await fr_descargarWB(wb,`Frisku_Tabla_${new Date().toISOString().slice(0,10)}.xlsx`);
  }catch(e){ console.error("[Tabla] Excel:",e); alert("No se pudo generar el Excel: "+e.message); } setExpX(false); setMenuOpen(false); };
  const exportPDF = async ()=>{ setExpP(true); try{
    const JsPDF=await pl_loadJsPDF(); const doc=new JsPDF({orientation:"landscape",unit:"mm",format:"a4"}); const W=297,m=12;
    doc.setFillColor(30,39,97); doc.rect(0,0,W,24,"F"); doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(13);
    doc.text("Frisku Foods — Tabla analítica", m, 11); doc.setFont("helvetica","normal"); doc.setFontSize(7.5);
    doc.text(`Dims: ${dimSel.join(", ")} · Filtros: ${filtrosTxt}`.slice(0,170), m, 18); await fr_logoPDF(doc,W-m,4,40,15);
    const headers=[...dimSel.map(d=>dims.find(x=>x.key===d)?.lab||d), ...medSel.map(m=>metric[m].label), "% part."];
    doc.autoTable({ startY:28, head:[headers],
      body: sorted.map(r=>[...dimSel.map(d=>r.labels[d]), ...medSel.map(m=>(FIN.has(m)&&r._fin===0)?"—":fmtMetric(metric[m].fmt,r[m])), (r[primary]/totPrimary*100).toFixed(1)+"%"]),
      theme:"striped", styles:{fontSize:7}, headStyles:{fillColor:[30,39,97]}, margin:{left:m,right:m} });
    doc.save(`Frisku_Tabla_${new Date().toISOString().slice(0,10)}.pdf`);
  }catch(e){ console.error("[Tabla] PDF:",e); alert("No se pudo generar el PDF: "+e.message); } setExpP(false); setMenuOpen(false); };
  useExportTrigger(exportReq, {excel:exportExcel, pdf:exportPDF});

  const th=(col,label,align)=>{ const act=sortCol===col; return <th onClick={()=>setSort(col)} style={{padding:"6px 10px",textAlign:align||"left",cursor:"pointer",whiteSpace:"nowrap",background:C.card2,color:act?C.blue:C.muted,fontWeight:act?800:700,position:"sticky",top:0,zIndex:1}} title="Ordenar">{label}{act?(sortDir==="desc"?" ▼":" ▲"):<span style={{opacity:0.35}}> ⇅</span>}</th>; };
  const tablaEl = (maxH)=>(
    <div style={{border:`1px solid ${C.border}`,borderRadius:10,overflowX:"auto",maxHeight:maxH,overflowY:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5,minWidth:640}}>
        <thead><tr style={{color:C.muted,textAlign:"left"}}>
          {dimSel.map(d=>th("dim:"+d, dims.find(x=>x.key===d)?.lab||d))}
          {medSel.map(m=>th("med:"+m, metric[m].label, "right"))}
          {th("part","% part.","right")}
          {dimSel.length>0 && <th style={{padding:"6px 10px",background:C.card2,position:"sticky",top:0,zIndex:1}}></th>}
        </tr></thead>
        <tbody>
          {sorted.map(r=>{ const oe1 = dimSel.includes("contenedor") && r._rows.length===1 ? r._rows[0]._oe : null;
            return <tr key={r.key} style={{borderTop:`1px solid ${C.border}`}}>
              {dimSel.map(d=>{ const isSel = sel[d] && sel[d].has(r.dimValues[d]);
                return <td key={d} onClick={()=>toggle(d, r.dimValues[d])} title="Clic para (de)seleccionar" style={{padding:"4px 10px",cursor:"pointer",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:220,color:isSel?C.accent2:C.text,fontWeight:isSel?700:500,background:isSel?`${C.accent2}10`:"transparent"}}>{isSel?"☑ ":""}{r.labels[d]}</td>; })}
              {medSel.map(m=>{ const sinDato=FIN.has(m)&&r._fin===0; return <td key={m} style={{padding:"4px 10px",textAlign:"right",fontFamily:"monospace",color:sinDato?C.muted2:undefined}}>{sinDato?"—":fmtMetric(metric[m].fmt,r[m])}</td>; })}
              <td style={{padding:"4px 10px",textAlign:"right",color:C.muted}}>{(r[primary]/totPrimary*100).toFixed(1)}%</td>
              {dimSel.length>0 && <td style={{padding:"2px 10px",textAlign:"right"}}>{onVerEmbarque && oe1 && <button onClick={()=>onVerEmbarque(oe1)} style={{...btnSt(C.blue,true),padding:"2px 7px",fontSize:9.5}}>→ Ver</button>}</td>}
            </tr>; })}
          {sorted.length===0 && <tr><td colSpan={dimSel.length+medSel.length+2} style={{padding:20,textAlign:"center",color:C.muted2}}>Sin datos para la selección.</td></tr>}
        </tbody>
        {sorted.length>0 && <tfoot><tr style={{fontWeight:800}}>
          <td style={{padding:"7px 10px",position:"sticky",bottom:0,background:C.card2,borderTop:`2px solid ${C.border}`}} colSpan={Math.max(1,dimSel.length)}>TOTAL ({sorted.length})</td>
          {medSel.map(m=><td key={m} style={{padding:"7px 10px",textAlign:"right",fontFamily:"monospace",position:"sticky",bottom:0,background:C.card2,borderTop:`2px solid ${C.border}`}}>{fmtMetric(metric[m].fmt,totalsRow[m])}</td>)}
          <td style={{padding:"7px 10px",textAlign:"right",position:"sticky",bottom:0,background:C.card2,borderTop:`2px solid ${C.border}`}}>100%</td>
          {dimSel.length>0 && <td style={{position:"sticky",bottom:0,background:C.card2,borderTop:`2px solid ${C.border}`}}/>}
        </tr></tfoot>}
      </table>
    </div>
  );
  const tabla = tablaEl(560);

  // ── Fusión HojaBIDim: calidad/cobertura financiera + detalle de contenedores ──
  const cobFin = { n: filtered.filter(r=>r._nLiq>0).length, tot: filtered.length };
  const dq = bi.dataQuality || {formatosSinPeso:[], liqClienteSinConv:0};
  const kgParcial = filtered.some(r=>r._kgFalta);
  const detAll = useMemo(()=>{
    const qq=detQ.trim().toLowerCase();
    const hay=(r)=>{ const s=`${r._oe?r._oe.numero||"":""} ${r.especieLab} ${r.exportadoraLab} ${r.clienteLab} ${r._oe?r._oe.origen||"":""} ${r._oe?r._oe.destino||"":""} ${r.temporada} ${r.semanaETD}`; return s.toLowerCase().includes(qq); };
    const base = qq ? filtered.filter(hay) : filtered.slice();
    const vOf=(r)=>{ const map={ numero:(r._oe&&r._oe.numero)||"", especie:r.especieLab, expcli:`${r.exportadoraLab} ${r.clienteLab}`, etd:(r._oe&&r._oe.fechaDespacho)||"", cajas:r._cajas, kilos:r._kilos, comF:r._comF, temporada:r.temporada, semana:r.semanaETD, estado:r.estado }; return map[detSort.k]; };
    base.sort((x,y)=>{ const vx=vOf(x), vy=vOf(y); const c=(typeof vx==="number"&&typeof vy==="number")?vx-vy:String(vx).localeCompare(String(vy)); return detSort.dir==="desc"?-c:c; });
    return base;
  },[filtered,detQ,detSort]);
  const detalle = detAll.slice(0,200);
  const warnings = (<>
    {(kgParcial || dq.liqClienteSinConv>0) && (
      <div style={{fontSize:11,color:C.warning,background:`${C.warning}14`,border:`1px solid ${C.warning}44`,borderRadius:8,padding:"7px 10px"}}>
        ⚠ Calidad de datos:{kgParcial && <span> Kilos <b>PARCIALES</b> — formatos sin peso neto en Maestros ({dq.formatosSinPeso.slice(0,6).join(", ")}); cuentan 0.</span>}{dq.liqClienteSinConv>0 && <span> {dq.liqClienteSinConv} liquidación(es) con comisión cliente no convertible a USD trazable.</span>}
      </div>)}
    {cobFin.tot>0 && cobFin.n===0 && (
      <div style={{fontSize:11.5,color:C.warning,background:`${C.warning}14`,border:`1px solid ${C.warning}44`,borderRadius:8,padding:"8px 11px",fontWeight:600}}>
        Sin datos financieros para esta selección — {cobFin.tot} contenedor{cobFin.tot>1?"es":""} sin liquidación. Los contadores logísticos sí son reales.
      </div>)}
    {cobFin.tot>0 && cobFin.n>0 && cobFin.n<cobFin.tot && (
      <div style={{fontSize:11,color:C.muted,background:C.card2,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 10px"}}>
        ℹ Cobertura financiera: <b>{cobFin.n} de {cobFin.tot}</b> contenedores con liquidación ({Math.round(cobFin.n/cobFin.tot*100)}%). "—" = sin dato financiero todavía (no es 0 real).
      </div>)}
  </>);
  const dSortTh=(k,label,align)=><th onClick={()=>setDetSort(s=>({k, dir:s.k===k&&s.dir==="desc"?"asc":"desc"}))} style={{padding:"6px 10px",textAlign:align||"left",cursor:"pointer",whiteSpace:"nowrap",position:"sticky",top:0,zIndex:1,background:C.card2,color:detSort.k===k?C.blue:C.muted,fontWeight:700}} title="Ordenar">{label}{detSort.k===k?(detSort.dir==="desc"?" ▼":" ▲"):<span style={{opacity:0.35}}> ⇅</span>}</th>;
  const detail = (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,margin:"2px 0 8px",flexWrap:"wrap"}}>
        <span style={{fontSize:12,fontWeight:700}}>Detalle — contenedores {detAll.length>200?`(200 de ${detAll.length})`:`(${detAll.length})`}</span>
        <input value={detQ} onChange={e=>setDetQ(e.target.value)} placeholder="Buscar OE, especie, empresa, puerto…" style={{...inputSt,maxWidth:280,fontSize:11}}/>
      </div>
      <div style={{border:`1px solid ${C.border}`,borderRadius:10,overflowX:"auto",maxHeight:chromeless?"34vh":420,overflowY:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:1040}}>
          <thead><tr style={{color:C.muted,textAlign:"left"}}>
            {dSortTh("temporada","Temp.")}{dSortTh("semana","Sem.")}{dSortTh("numero","N° OE")}{dSortTh("especie","Especie")}{dSortTh("expcli","Exportador → Cliente")}{dSortTh("etd","ETD")}
            <th style={{padding:"6px 10px",position:"sticky",top:0,zIndex:1,background:C.card2,color:C.muted,fontWeight:700}}>Ruta</th>{dSortTh("cajas","Cajas","right")}{dSortTh("kilos","Kilos","right")}{dSortTh("estado","Estado")}{dSortTh("comF","Com. Frisku","right")}<th style={{padding:"6px 10px",position:"sticky",top:0,zIndex:1,background:C.card2}}></th>
          </tr></thead>
          <tbody>
            {detalle.map(r=>{ const sinFin=r._nLiq===0;
              return <tr key={r._id} style={{borderTop:`1px solid ${C.border}`}}>
                <td style={{padding:"4px 10px",whiteSpace:"nowrap"}}>{r.temporada}</td>
                <td style={{padding:"4px 10px",whiteSpace:"nowrap"}}>{r.semanaETD}</td>
                <td style={{padding:"4px 10px",fontFamily:"monospace",color:C.blue,whiteSpace:"nowrap"}}>{r._oe?.numero||"—"}</td>
                <td style={{padding:"4px 10px",whiteSpace:"nowrap"}}>{r.especieLab}</td>
                <td style={{padding:"4px 10px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:210}}>{r.exportadoraLab} → {r.clienteLab}</td>
                <td style={{padding:"4px 10px",whiteSpace:"nowrap"}}>{r._oe?.fechaDespacho||"—"}</td>
                <td style={{padding:"4px 10px",whiteSpace:"nowrap",color:C.muted2}}>{r._oe?.origen||"—"} → {r._oe?.destino||"—"}</td>
                <td style={{padding:"4px 10px",textAlign:"right",fontFamily:"monospace"}}>{fmtN0(r._cajas)}</td>
                <td style={{padding:"4px 10px",textAlign:"right",fontFamily:"monospace",color:r._kgFalta?C.warning:undefined}}>{fmtN0(r._kilos)}{r._kgFalta?" ⚠":""}</td>
                <td style={{padding:"4px 10px",whiteSpace:"nowrap"}}>{r.estado}</td>
                <td style={{padding:"4px 10px",textAlign:"right",fontFamily:"monospace",color:sinFin?C.muted2:C.green,fontWeight:sinFin?400:700}}>{sinFin?"—":fmtUSD0(r._comF)}</td>
                <td style={{padding:"3px 10px",textAlign:"right"}}>{onVerEmbarque && r._oe && <button onClick={()=>onVerEmbarque(r._oe)} title="Ir al embarque operacional" style={{...btnSt(C.blue,true),padding:"2px 8px",fontSize:10}}>→ Ver</button>}</td>
              </tr>; })}
            {detalle.length===0 && <tr><td colSpan={12} style={{padding:16,textAlign:"center",color:C.muted2}}>Sin contenedores en la selección.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );

  const chkList = (items, sel, on)=>items.map(it=><label key={it.key} style={{display:"flex",gap:6,alignItems:"center",fontSize:11.5,padding:"2px 0",cursor:"pointer"}}><input type="checkbox" checked={sel.includes(it.key)} onChange={()=>on(it.key)}/>{it.label||it.lab}</label>);
  const pLbl = {fontSize:10,fontWeight:800,color:C.muted,textTransform:"uppercase",letterSpacing:0.4,margin:"2px 0 5px"};
  const controls = (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div><div style={pLbl}>Dimensiones</div>{chkList(dims, dimSel, toggleDim)}</div>
      <div><div style={pLbl}>Medidas</div>{chkList(metrics, medSel, toggleMed)}</div>
      <div><div style={pLbl}>Buscar (agregado)</div><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Filtrar filas…" style={{...inputSt,width:"100%",fontSize:11}}/></div>
    </div>
  );

  // ── Modo workspace (chromeless): controles al panel; canvas = tabla + detalle ──
  // Export/fullscreen los controla la toolbar del workspace (exportReq / fullscreen).
  if(chromeless){
    return (<>
      {panelEl && createPortal(controls, panelEl)}
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {warnings}
        {dimSel.length===0 && <div style={{fontSize:11,color:C.muted2}}>Sin dimensiones: total del universo. Agrégalas en el panel de propiedades.</div>}
        {tablaEl("42vh")}
        {detail}
      </div>
      <FullscreenBI open={!!fullscreen} title="Tabla analítica" onClose={onExitFull}>{tablaEl("82vh")}</FullscreenBI>
    </>);
  }

  // ── Modo legacy (standalone) ──
  return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
        <div ref={cfgRef} style={{position:"relative"}}>
          <button onClick={()=>setCfgOpen(o=>!o)} style={{...btnSt(C.blue,true),fontSize:12,padding:"7px 12px"}}>⚙ Columnas ▾</button>
          {cfgOpen && (
            <div style={{position:"absolute",zIndex:60,top:"calc(100% + 4px)",left:0,background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:10,minWidth:320,boxShadow:C.shadowSm||"0 8px 24px rgba(0,0,0,.18)",display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div><div style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",marginBottom:5}}>Dimensiones</div>
                {dims.map(d=><label key={d.key} style={{display:"flex",gap:6,alignItems:"center",fontSize:11.5,padding:"2px 0",cursor:"pointer"}}><input type="checkbox" checked={dimSel.includes(d.key)} onChange={()=>toggleDim(d.key)}/>{d.lab}</label>)}
              </div>
              <div><div style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",marginBottom:5}}>Medidas</div>
                {metrics.map(m=><label key={m.key} style={{display:"flex",gap:6,alignItems:"center",fontSize:11.5,padding:"2px 0",cursor:"pointer"}}><input type="checkbox" checked={medSel.includes(m.key)} onChange={()=>toggleMed(m.key)}/>{m.label}</label>)}
              </div>
            </div>
          )}
        </div>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar en la tabla…" style={{...inputSt,maxWidth:240,fontSize:11}}/>
        <div ref={menuRef} style={{position:"relative",marginLeft:"auto"}}>
          <button onClick={()=>setMenuOpen(o=>!o)} style={{...btnSt(C.muted,true),fontSize:13,padding:"6px 12px"}}>⋯</button>
          {menuOpen && (
            <div style={{position:"absolute",zIndex:60,top:"calc(100% + 4px)",right:0,background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:5,minWidth:170,boxShadow:C.shadowSm||"0 8px 24px rgba(0,0,0,.18)"}}>
              <div onClick={exportExcel} style={{padding:"7px 10px",cursor:"pointer",fontSize:12}}>{expX?"⏳":"⬇ Exportar Excel"}</div>
              <div onClick={exportPDF} style={{padding:"7px 10px",cursor:"pointer",fontSize:12}}>{expP?"⏳":"⬇ Exportar PDF"}</div>
              <div onClick={()=>{setFull(true);setMenuOpen(false);}} style={{padding:"7px 10px",cursor:"pointer",fontSize:12,borderTop:`1px solid ${C.border}`}}>⛶ Pantalla completa</div>
            </div>
          )}
        </div>
      </div>
      {dimSel.length===0 && <div style={{fontSize:11,color:C.muted2,marginBottom:8}}>Sin dimensiones: se muestra el total del universo seleccionado. Agrega dimensiones en ⚙ Columnas.</div>}
      {tabla}
      <div style={{fontSize:10.5,color:C.muted2,marginTop:8}}>Clic en una celda de dimensión = seleccionar (filtra todo el BI). % part. = valor de la fila / total mostrado. Financiero "—" = sin liquidación.</div>
      <FullscreenBI open={full} title="Tabla analítica" onClose={()=>setFull(false)}>{tabla}</FullscreenBI>
    </div>
  );
}

// PIVOT TABLE controlada (estilo Qlik). Filas (1-2 dims jerárquicas) × 1 columna ×
// 1 medida, del catálogo. Expandir/contraer, totales de fila/columna/general,
// selección desde dims, export y fullscreen. Mismo motor. CRÍTICO: cada celda y
// total se RECALCULA con metric.calc(rows) — nunca suma subtotales (correcto para
// count-distinct: contenedores/FCL/clientes/exportadores).
function PivotTableBI(_pivotProps={}) {
  const { chromeless, panelEl, fullscreen, onExitFull, exportReq, initialConfig, onConfig } = _pivotProps;
  const bi = useFriskuBI();
  const { filtered, dims, metrics, metric, sel, toggle, chips } = bi;
  // P2.1b: semilla desde bookmark. Sin initialConfig → defaults idénticos a hoy.
  const ic = initialConfig||{};
  const [row1, setRow1] = useState(()=> typeof ic.row1==="string" ? ic.row1 : "cliente");
  const [row2, setRow2] = useState(()=> (ic.row2===null||typeof ic.row2==="string") ? ic.row2 : "especie");
  const [colDim, setColDim] = useState(()=> typeof ic.colDim==="string" ? ic.colDim : "temporada");
  const [medKey, setMedKey] = useState(()=> typeof ic.medKey==="string" ? ic.medKey : "fcl");
  const [expanded, setExpanded] = useState(()=> new Set(Array.isArray(ic.expanded)?ic.expanded:[]));
  // Reporta config vigente (expanded serializado Set→array).
  useEffect(()=>{ onConfig && onConfig({ row1, row2, colDim, medKey, expanded:[...expanded] }); }, [row1, row2, colDim, medKey, expanded]);
  const [full, setFull] = useState(false);
  const [expX, setExpX] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef=useRef(null);
  useEffect(()=>{ const h=(e)=>{ if(menuRef.current&&!menuRef.current.contains(e.target))setMenuOpen(false); }; document.addEventListener("mousedown",h); return ()=>document.removeEventListener("mousedown",h); },[]);
  const M = metric[medKey];
  const FIN = new Set(["destinationSalesUSD","clientCommissionUSD","friskuCommissionUSD","avgCommissionPct"]);
  const isFin = FIN.has(medKey);
  const cellTxt = (rows, colValue)=>{ const sub = colValue==null ? rows : rows.filter(r=>r[colDim]===colValue);
    if(isFin && sub.filter(r=>r._nLiq>0).length===0) return "—"; return fmtMetric(M.fmt, M.calc(sub)); };
  const colVals = useMemo(()=>{ const s={}; filtered.forEach(r=>{ const v=r[colDim]; if(v!=null&&v!=="") s[v]=r[colDim+"Lab"]??v; }); return Object.entries(s).map(([value,label])=>({value,label})).sort((a,b)=>String(a.label).localeCompare(String(b.label))); },[filtered,colDim]);
  const groups = useMemo(()=>{
    const g1 = groupByDims(filtered, [row1]);
    const out = g1.map(g=>({ key:g.key, dimValue:g.dimValues[row1], label:g.labels[row1], rows:g.rows,
      subs: (row2 && row2!==row1) ? groupByDims(g.rows, [row2]).map(s=>({key:g.key+"|"+s.key, dimValue:s.dimValues[row2], label:s.labels[row2], rows:s.rows})).sort((a,b)=>M.calc(b.rows)-M.calc(a.rows)) : [] }));
    return out.sort((a,b)=>M.calc(b.rows)-M.calc(a.rows));
  },[filtered,row1,row2,medKey]);
  const tE=(k)=>setExpanded(p=>{const n=new Set(p);n.has(k)?n.delete(k):n.add(k);return n;});
  const dimSel = (val,set,extra)=><select value={val} onChange={e=>set(e.target.value)} style={{...inputSt}}>{extra}{dims.map(d=><option key={d.key} value={d.key}>{d.lab}</option>)}</select>;
  const filtrosTxt = chips.length ? chips.map(c=>`${c.dimLab}=${c.label}`).join(", ") : "sin filtros";
  const hasR2 = row2 && row2!==row1;

  const exportExcel = async ()=>{ setExpX(true); try{
    const ExcelJS=await fr_loadExcelJS(); const wb=new ExcelJS.Workbook(); wb.creator="Grupo Mediterra — Frisku Foods";
    const headers=[dims.find(d=>d.key===row1)?.lab||row1, ...(hasR2?[dims.find(d=>d.key===row2)?.lab||row2]:[]), ...colVals.map(c=>c.label), "Total"];
    const rowsX=[];
    groups.forEach(g=>{
      rowsX.push([g.label, ...(hasR2?[""]:[]), ...colVals.map(c=>M.calc(g.rows.filter(r=>r[colDim]===c.value))), M.calc(g.rows)]);
      if(hasR2) g.subs.forEach(s=>rowsX.push(["", s.label, ...colVals.map(c=>M.calc(s.rows.filter(r=>r[colDim]===c.value))), M.calc(s.rows)]));
    });
    rowsX.push(["TOTAL", ...(hasR2?[""]:[]), ...colVals.map(c=>M.calc(filtered.filter(r=>r[colDim]===c.value))), M.calc(filtered)]);
    const nDim = hasR2?2:1; const numCols = headers.map((h,i)=>i>=nDim?i:-1).filter(i=>i>=nDim);
    const ws=wb.addWorksheet("Pivot");
    fr_sheetTabla(ws,{titulo:`FRISKU FOODS — Pivot (${M.label})`, subtitulo:`Filas ${row1}${hasR2?" → "+row2:""} · Columna ${colDim} · Filtros: ${filtrosTxt} · ${new Date().toLocaleString("es-CL")}`,
      headers, colWidths:headers.map((h,i)=>i<nDim?20:13), rows:rowsX, moneyCols:M.fmt==="usd"?numCols:[], intCols:M.fmt==="int"?numCols:[]});
    await fr_logoExcel(wb,ws);
    await fr_descargarWB(wb,`Frisku_Pivot_${new Date().toISOString().slice(0,10)}.xlsx`);
  }catch(e){ console.error("[Pivot] Excel:",e); alert("No se pudo generar el Excel: "+e.message); } setExpX(false); setMenuOpen(false); };
  const exportPDF = async ()=>{ try{
    const JsPDF=await pl_loadJsPDF(); const doc=new JsPDF({orientation:"landscape",unit:"mm",format:"a4"}); const W=297,m=12;
    doc.setFillColor(30,39,97); doc.rect(0,0,W,24,"F"); doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(13);
    doc.text(`Frisku Foods — Pivot (${M.label})`, m, 11); doc.setFont("helvetica","normal"); doc.setFontSize(7.5);
    doc.text(`Filas ${row1}${hasR2?" › "+row2:""} · Columna ${colDim} · ${new Date().toLocaleString("es-CL")}`.slice(0,175), m, 18);
    doc.setFontSize(7); doc.text(`Filtros: ${filtrosTxt}`.slice(0,175), m, 22.5); await fr_logoPDF(doc,W-m,4,40,15);
    const head=[[dims.find(d=>d.key===row1)?.lab||row1, ...(hasR2?[dims.find(d=>d.key===row2)?.lab||row2]:[]), ...colVals.map(c=>c.label), "Total"]];
    const body=[]; groups.forEach(g=>{
      body.push([g.label, ...(hasR2?[""]:[]), ...colVals.map(c=>cellTxt(g.rows,c.value)), cellTxt(g.rows,null)]);
      if(hasR2) g.subs.forEach(s=>body.push(["", "  "+s.label, ...colVals.map(c=>cellTxt(s.rows,c.value)), cellTxt(s.rows,null)]));
    });
    body.push(["TOTAL", ...(hasR2?[""]:[]), ...colVals.map(c=>cellTxt(filtered,c.value)), cellTxt(filtered,null)]);
    doc.autoTable({ startY:28, head, body, theme:"striped", styles:{fontSize:7}, headStyles:{fillColor:[30,39,97]}, margin:{left:m,right:m} });
    doc.save(`Frisku_Pivot_${new Date().toISOString().slice(0,10)}.pdf`);
  }catch(e){ console.error("[Pivot] PDF:",e); alert("No se pudo generar el PDF: "+e.message); } setMenuOpen(false); };
  useExportTrigger(exportReq, {excel:exportExcel, pdf:exportPDF});

  const td={padding:"4px 9px",borderTop:`1px solid ${C.border}`,textAlign:"right",fontFamily:"monospace",whiteSpace:"nowrap"};
  const thPiv={padding:"6px 9px",position:"sticky",top:0,zIndex:1,background:C.card2,fontWeight:700};
  const tablaEl = (maxH)=>(
    <div style={{border:`1px solid ${C.border}`,borderRadius:10,overflowX:"auto",maxHeight:maxH,overflowY:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5,minWidth:560}}>
        <thead><tr style={{color:C.muted,textAlign:"left"}}>
          <th style={{...thPiv,textAlign:"left"}}>{dims.find(d=>d.key===row1)?.lab||row1}{hasR2?` › ${dims.find(d=>d.key===row2)?.lab||row2}`:""}</th>
          {colVals.map(c=><th key={c.value} onClick={()=>toggle(colDim,c.value)} title="Clic para seleccionar esta columna" style={{...thPiv,textAlign:"right",cursor:"pointer",whiteSpace:"nowrap",color:(sel[colDim]&&sel[colDim].has(c.value))?C.accent2:C.muted}}>{c.label}</th>)}
          <th style={{...thPiv,textAlign:"right",fontWeight:800}}>Total</th>
        </tr></thead>
        <tbody>
          {groups.map(g=>{ const op=expanded.has(g.key); const isSel=sel[row1]&&sel[row1].has(g.dimValue);
            const bandBg = isSel?`${C.accent2}12`:(hasR2?`${C.blue}07`:"transparent");
            return <React.Fragment key={g.key}>
              <tr style={{borderTop:`1px solid ${C.border}`,background:bandBg}}>
                <td style={{padding:"5px 9px",whiteSpace:"nowrap",cursor:"pointer",fontWeight:isSel?700:600}}>
                  {hasR2 && <span onClick={()=>tE(g.key)} title={op?"Contraer":"Expandir"} style={{display:"inline-block",width:16,color:C.blue,marginRight:4,cursor:"pointer",fontWeight:700}}>{op?"▾":"▸"}</span>}
                  <span onClick={()=>toggle(row1,g.dimValue)} title="Seleccionar" style={{color:isSel?C.accent2:C.text}}>{isSel?"☑ ":""}{g.label}</span>
                </td>
                {colVals.map(c=><td key={c.value} style={{...td,background:bandBg}}>{cellTxt(g.rows,c.value)}</td>)}
                <td style={{...td,fontWeight:800,color:C.text,background:bandBg}}>{cellTxt(g.rows,null)}</td>
              </tr>
              {op && hasR2 && g.subs.map(s=>{ const isS2=sel[row2]&&sel[row2].has(s.dimValue);
                return <tr key={s.key} style={{borderTop:`1px solid ${C.border}`}}>
                  <td style={{padding:"3px 9px 3px 12px",whiteSpace:"nowrap",cursor:"pointer",borderLeft:`2px solid ${C.blue}33`}} onClick={()=>toggle(row2,s.dimValue)}><span style={{color:C.muted2,marginRight:5}}>↳</span><span style={{color:isS2?C.accent2:C.muted,fontWeight:isS2?700:400}}>{isS2?"☑ ":""}{s.label}</span></td>
                  {colVals.map(c=><td key={c.value} style={{...td,color:C.muted}}>{cellTxt(s.rows,c.value)}</td>)}
                  <td style={{...td,color:C.muted,fontWeight:700}}>{cellTxt(s.rows,null)}</td>
                </tr>; })}
            </React.Fragment>; })}
          {groups.length===0 && <tr><td colSpan={colVals.length+2} style={{padding:20,textAlign:"center",color:C.muted2}}>Sin datos para la selección.</td></tr>}
        </tbody>
        {groups.length>0 && <tfoot><tr style={{fontWeight:800}}>
          <td style={{padding:"7px 9px",position:"sticky",bottom:0,background:C.card2,borderTop:`2px solid ${C.border}`}}>TOTAL</td>
          {colVals.map(c=><td key={c.value} style={{...td,position:"sticky",bottom:0,background:C.card2,borderTop:`2px solid ${C.border}`}}>{cellTxt(filtered,c.value)}</td>)}
          <td style={{...td,color:C.text,position:"sticky",bottom:0,background:C.card2,borderTop:`2px solid ${C.border}`}}>{cellTxt(filtered,null)}</td>
        </tr></tfoot>}
      </table>
    </div>
  );
  const tabla = tablaEl(560);

  const pLbl = {fontSize:10,fontWeight:800,color:C.muted,textTransform:"uppercase",letterSpacing:0.4,margin:"2px 0 5px"};
  const controls = (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div><div style={pLbl}>Fila 1</div><select value={row1} onChange={e=>setRow1(e.target.value)} style={{...inputSt,width:"100%"}}>{dims.map(d=><option key={d.key} value={d.key}>{d.lab}</option>)}</select></div>
      <div><div style={pLbl}>Fila 2 (opcional)</div><select value={row2} onChange={e=>setRow2(e.target.value)} style={{...inputSt,width:"100%"}}><option value="">— ninguna —</option>{dims.map(d=><option key={d.key} value={d.key}>{d.lab}</option>)}</select></div>
      <div><div style={pLbl}>Columna</div><select value={colDim} onChange={e=>setColDim(e.target.value)} style={{...inputSt,width:"100%"}}>{dims.map(d=><option key={d.key} value={d.key}>{d.lab}</option>)}</select></div>
      <div><div style={pLbl}>Medida</div><select value={medKey} onChange={e=>setMedKey(e.target.value)} style={{...inputSt,width:"100%"}}>{metrics.map(m=><option key={m.key} value={m.key}>{m.label}</option>)}</select></div>
      {hasR2 && <div><div style={pLbl}>Jerarquía</div><div style={{display:"flex",gap:6}}>
        <button onClick={()=>setExpanded(new Set(groups.map(g=>g.key)))} style={{...btnSt(C.muted,true),fontSize:11,padding:"5px 9px"}}>Expandir todo</button>
        <button onClick={()=>setExpanded(new Set())} style={{...btnSt(C.muted,true),fontSize:11,padding:"5px 9px"}}>Contraer</button>
      </div></div>}
    </div>
  );

  // ── Modo workspace (chromeless): controles al panel; canvas = pivote full-height ──
  // Export/fullscreen los controla la toolbar del workspace.
  if(chromeless){
    return (<>
      {panelEl && createPortal(controls, panelEl)}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {tablaEl("72vh")}
        <div style={{fontSize:10.5,color:C.muted2}}>Cada celda/total se recalcula con la métrica (no suma subtotales) → correcto para count-distinct. Clic en dimensión o columna = seleccionar. "—" = sin liquidación.</div>
      </div>
      <FullscreenBI open={!!fullscreen} title={`Pivot — ${M.label}`} onClose={onExitFull}>{tablaEl("82vh")}</FullscreenBI>
    </>);
  }

  // ── Modo legacy (standalone) ──
  return (
    <div>
      <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap",alignItems:"flex-end"}}>
        <div><div style={lblSt}>Fila 1</div>{dimSel(row1,setRow1)}</div>
        <div><div style={lblSt}>Fila 2 (opcional)</div><select value={row2} onChange={e=>setRow2(e.target.value)} style={{...inputSt}}><option value="">— ninguna —</option>{dims.map(d=><option key={d.key} value={d.key}>{d.lab}</option>)}</select></div>
        <div><div style={lblSt}>Columna</div>{dimSel(colDim,setColDim)}</div>
        <div><div style={lblSt}>Medida</div><select value={medKey} onChange={e=>setMedKey(e.target.value)} style={{...inputSt}}>{metrics.map(m=><option key={m.key} value={m.key}>{m.label}</option>)}</select></div>
        {hasR2 && <div style={{display:"flex",gap:6}}>
          <button onClick={()=>setExpanded(new Set(groups.map(g=>g.key)))} style={{...btnSt(C.muted,true),fontSize:11,padding:"7px 9px"}}>Expandir todo</button>
          <button onClick={()=>setExpanded(new Set())} style={{...btnSt(C.muted,true),fontSize:11,padding:"7px 9px"}}>Contraer</button>
        </div>}
        <div ref={menuRef} style={{position:"relative",marginLeft:"auto"}}>
          <button onClick={()=>setMenuOpen(o=>!o)} style={{...btnSt(C.muted,true),fontSize:13,padding:"6px 12px"}}>⋯</button>
          {menuOpen && (
            <div style={{position:"absolute",zIndex:60,top:"calc(100% + 4px)",right:0,background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:5,minWidth:170,boxShadow:C.shadowSm||"0 8px 24px rgba(0,0,0,.18)"}}>
              <div onClick={exportExcel} style={{padding:"7px 10px",cursor:"pointer",fontSize:12}}>{expX?"⏳":"⬇ Exportar Excel"}</div>
              <div onClick={()=>{setFull(true);setMenuOpen(false);}} style={{padding:"7px 10px",cursor:"pointer",fontSize:12,borderTop:`1px solid ${C.border}`}}>⛶ Pantalla completa</div>
            </div>
          )}
        </div>
      </div>
      {tabla}
      <div style={{fontSize:10.5,color:C.muted2,marginTop:8}}>Cada celda/total se recalcula con la métrica (no suma subtotales) → correcto para contenedores/FCL/count-distinct. Clic en una dimensión o columna = seleccionar. Financiero "—" = sin liquidación.</div>
      <FullscreenBI open={full} title={`Pivot — ${M.label}`} onClose={()=>setFull(false)}>{tabla}</FullscreenBI>
    </div>
  );
}

// SELECTIONS BAR global (estilo Qlik): back/forward de selecciones + selecciones
// activas agrupadas por dimensión (quitar valor/dimensión) + limpiar todo.
function SelectionBarBI() {
  const bi = useFriskuBI();
  const { chips, remove, clearDim, clearAll, undo, redo, canUndo, canRedo, dims, locked, toggleLock } = bi;
  const byDim = {};
  chips.forEach(c=>{ (byDim[c.dim]=byDim[c.dim]||{dimLab:c.dimLab, vals:[]}).vals.push(c); });
  const groups = dims.map(d=>byDim[d.key] && {key:d.key, ...byDim[d.key]}).filter(Boolean);
  const hayLock = groups.some(g=>locked.has(g.key));
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",padding:"6px 10px",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,marginBottom:12,maxHeight:76,overflowY:"auto"}}>
      <div style={{display:"flex",gap:4,position:"sticky",left:0}}>
        <button onClick={undo} disabled={!canUndo} title="Selección anterior" style={{...btnSt(C.muted,true),fontSize:13,padding:"3px 9px",opacity:canUndo?1:0.35,cursor:canUndo?"pointer":"default"}}>←</button>
        <button onClick={redo} disabled={!canRedo} title="Selección siguiente" style={{...btnSt(C.muted,true),fontSize:13,padding:"3px 9px",opacity:canRedo?1:0.35,cursor:canRedo?"pointer":"default"}}>→</button>
      </div>
      <div style={{width:1,height:20,background:C.border}}/>
      <span style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase"}}>Selecciones</span>
      {groups.length===0 ? <span style={{fontSize:11.5,color:C.muted2}}>ninguna — todo el universo</span> :
        groups.map(g=>{
          const isLk = locked.has(g.key);
          return (
          <span key={g.key} title={isLk?"Campo bloqueado — no se limpia con «Limpiar todo»":undefined}
            style={{display:"inline-flex",alignItems:"center",gap:4,background:isLk?`${C.blue}14`:`${C.accent2}12`,border:`1px solid ${isLk?C.blue+"66":C.accent2+"44"}`,borderRadius:8,padding:"2px 5px 2px 8px"}}>
            <span onClick={()=>toggleLock(g.key)} title={isLk?"Desbloquear campo":"Bloquear campo (conserva la selección)"} style={{cursor:"pointer",fontSize:10.5,marginRight:1}}>{isLk?"🔒":"🔓"}</span>
            <span style={{fontSize:10,color:C.muted,fontWeight:600}}>{g.dimLab}:</span>
            {g.vals.map((c,i)=><span key={i} onClick={()=>remove(c.dim,c.value)} title="Quitar valor" style={{fontSize:11,fontWeight:600,color:isLk?C.blue:C.accent2,cursor:"pointer"}}>{c.label}{i<g.vals.length-1?", ":""}</span>)}
            {!isLk && <span onClick={()=>clearDim(g.key)} title="Quitar dimensión" style={{cursor:"pointer",color:C.muted,fontSize:11,marginLeft:3}}>✕</span>}
          </span>
        );})}
      {groups.length>0 && <button onClick={clearAll} title={hayLock?"Limpia los campos no bloqueados":"Limpia toda la selección"} style={{...btnSt(C.muted,true),fontSize:10,padding:"3px 8px",marginLeft:"auto"}}>Limpiar todo</button>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ANÁLISIS — superficie de exploración ÚNICA (estilo Qlik "analysis mode").
// Un solo lugar donde el usuario elige el OBJETO con el que mira la MISMA
// tabla de hechos y la MISMA selección global: Dimensiones (ranking+detalle),
// Tabla (straight configurable), Pivot (dinámica), Drill (jerarquías) y
// Explorador (ad-hoc dim×medida×gráfico). Reemplaza 5 pestañas por 1 hoja con
// selector de objeto. Ningún objeto reimplementa métricas ni selección.
// ═══════════════════════════════════════════════════════════════════
// UNIFIED ANALYSIS WORKSPACE (P1.9e) — un solo instrumento BI. El usuario cambia
// QUÉ analiza (Preset) y CÓMO lo ve (Visualización); no "entra a un módulo".
//   · Selection Bar permanente (arriba, en ReporteriaBI) — estado global inmutable.
//   · Panel lateral colapsable: FILTROS (asociativos) + PROPIEDADES del objeto.
//   · Canvas dimensionado al viewport; al colapsar el panel, se expande.
//   · Preset "Libre" = viz configurable (Tabla|Pivot|Barras|Dona|Tendencia|Drill).
//     Presets curados (Comercial|Semanal|Comparativo) usan su renderer propio →
//     el selector Visualización queda deshabilitado (Ajuste B).
// e1 = shell + selectores + panel (FILTROS activo, PROPIEDADES llega en e2). Los
// objetos se montan tal cual; Barras/Dona/Tendencia reutilizan los renderers de
// TableroAsociativo (mismo motor, sin duplicar métricas) vía initialChart.
function AnalysisWorkspace({ data, permTablero, onVerEmbarque, bmOwner }) {
  const bi = useFriskuBI();                               // motor asociativo (selección + applySel) para bookmarks
  const [preset, setPreset]       = useState("libre");   // libre | comercial | semanal | comp
  const [viz, setViz]             = useState("tabla");    // tabla | pivot | barras | dona | tendencia | drill
  const [panelOpen, setPanelOpen] = useState(true);
  const [propsEl, setPropsEl]     = useState(null);       // destino portal de PROPIEDADES
  const [full, setFull]           = useState(false);      // fullscreen del objeto activo (control único)
  const [exportReq, setExportReq] = useState(null);       // {type, n} → dispara export del objeto activo
  const fireExport = (type)=> setExportReq(r=>({type, n:(r?.n||0)+1}));

  // ── P2.1 Bookmarks / Vistas guardadas (localStorage por usuario; sin Supabase) ──
  const dimKeys = FRISKU_DIMS.map(d=>d.key);
  const metKeys = FRISKU_METRICS.map(m=>m.key);
  const [bmList, setBmList] = useState([]);
  const [bmOpen, setBmOpen] = useState(false);
  const [bmName, setBmName] = useState("");
  const [bmMsg,  setBmMsg]  = useState("");               // aviso discreto (campos descartados al restaurar)
  // ── P2.1b Config intraobjeto: captura/restauración por tipo de objeto ──
  // objCfgRef = última config SERIALIZABLE reportada por cada objeto (persiste aunque el objeto no esté montado).
  // seeded = true tras la primera restauración → habilita sembrar initialConfig (antes: comportamiento idéntico al actual).
  // restoreNonce = fuerza remount SOLO al recuperar una vista (no en navegación/preset/viz normal).
  const objCfgRef = useRef({});
  const [seeded, setSeeded] = useState(false);
  const [restoreNonce, setRestoreNonce] = useState(0);
  const reportCfg = useCallback((type,cfg)=>{ objCfgRef.current = { ...objCfgRef.current, [type]: cfg }; }, []);
  const objSeed = (type)=> seeded ? objCfgRef.current[type] : undefined;
  useEffect(()=>{ setBmList(listBookmarks(bmOwner)); }, [bmOwner]);
  const refreshBm = ()=> setBmList(listBookmarks(bmOwner));
  const guardarVista = ()=>{
    const nombre=(bmName||"").trim(); if(!nombre) return;
    const bm=buildBookmark({ nombre, owner:bmOwner, hoja:"analisis", preset, viz, panelOpen, sel:bi.sel, locked:[...(bi.locked||[])], obj:objCfgRef.current });
    saveBookmark(bmOwner, bm); setBmName(""); setBmMsg(`Guardada “${nombre}”`); refreshBm();
  };
  const restaurarVista = (bm)=>{
    const { bm:v, avisos } = validateBookmark(bm, dimKeys, metKeys);
    // Restauración atómica (React 18 agrupa estos setState en un solo render):
    // selección + preset + viz + panel + config de objeto, y un remount único (restoreNonce).
    objCfgRef.current = { ...objCfgRef.current, ...(v.obj||{}) };   // recuerda config incluso de objetos no montados
    setSeeded(true); setRestoreNonce(n=>n+1);
    setPreset(v.preset); if(v.preset==="libre") setViz(v.viz); setPanelOpen(v.panelOpen!==false);
    bi.applySel(deserializeSel(v.sel), v.locked||[]);
    setBmMsg(avisos.length ? `Restaurada (${avisos.length} campo(s) ya no existen y se omitieron)` : `Restaurada “${v.nombre}”`);
    setBmOpen(false);
  };
  const renombrarVista = (bm)=>{
    const nn=window.prompt("Nuevo nombre de la vista:", bm.nombre); if(nn==null) return;
    if(!nn.trim()) return; renameBookmark(bmOwner, bm.id, nn); refreshBm();
  };
  const eliminarVista = (bm)=>{ if(!window.confirm(`¿Eliminar la vista “${bm.nombre}”?`)) return; removeBookmark(bmOwner, bm.id); refreshBm(); };
  const charts = permTablero?.visible!==false;            // Barras/Dona/Tendencia usan el motor del Explorador
  const libre  = preset==="libre";
  const exportable = true;                                // e5: todos los objetos (libre + presets curados) exportan/⛶ coherentemente
  const VIZ = [
    {k:"tabla", lab:"▦ Tabla"}, {k:"pivot", lab:"⊞ Pivot"},
    charts && {k:"barras", lab:"▮ Barras"}, charts && {k:"dona", lab:"◔ Dona"}, charts && {k:"tendencia", lab:"📈 Tendencia"},
    {k:"drill", lab:"⛏ Drill"},
  ].filter(Boolean);
  const PRESETS = [
    {k:"libre", lab:"Libre"}, {k:"comercial", lab:"🤝 Comercial"}, {k:"semanal", lab:"📅 Semanal"}, {k:"comp", lab:"📊 Comparativo"}, {k:"ab", lab:"⇆ A/B"},
  ];
  const FILT = ["temporada","especie","exportadora","cliente","mercado","paisDestino","estado","via","semanaETD"];
  const lblIn = {fontSize:10.5,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:0.4};
  const seg = {display:"inline-flex",gap:2,padding:3,background:C.card2,border:`1px solid ${C.border}`,borderRadius:9,flexWrap:"wrap"};
  const segBtn = (on,dis)=>({fontSize:12,padding:"6px 11px",borderRadius:6,cursor:dis?"default":"pointer",border:"none",fontWeight:700,
    background:on?C.blue:"transparent",color:on?"#fff":(dis?C.muted2:C.muted),opacity:dis?0.5:1});

  const propsInPanel = preset==="libre" ? ["tabla","pivot","barras","dona","tendencia","drill"].includes(viz) : true;
  const objProps = { chromeless:true, panelEl:propsEl, fullscreen:full, onExitFull:()=>setFull(false), exportReq };
  const canvas = ()=>{
    if(preset==="comercial") return <HojaComercial {...objProps} onVerEmbarque={onVerEmbarque}/>;
    if(preset==="semanal")   return <HojaSemanal {...objProps} onVerEmbarque={onVerEmbarque}/>;
    if(preset==="comp")      return <HojaComparativo {...objProps}/>;
    if(preset==="ab")        return <ComparadorAB {...objProps}/>;
    if(viz==="tabla")        return <StraightTableBI key={`tabla#${restoreNonce}`} {...objProps} onVerEmbarque={onVerEmbarque} initialConfig={objSeed("tabla")} onConfig={cfg=>reportCfg("tabla",cfg)}/>;
    if(viz==="pivot")        return <PivotTableBI key={`pivot#${restoreNonce}`} {...objProps} initialConfig={objSeed("pivot")} onConfig={cfg=>reportCfg("pivot",cfg)}/>;
    if(viz==="drill")        return <DrillGroupsBI key={`drill#${restoreNonce}`} {...objProps} onVerEmbarque={onVerEmbarque} initialConfig={objSeed("drill")} onConfig={cfg=>reportCfg("drill",cfg)}/>;
    const vizChart = viz==="dona"?"torta":viz==="tendencia"?"tendencia":"barras";
    return <TableroAsociativo key={`grafico#${restoreNonce}`} {...objProps} vizChart={vizChart} {...data} initialConfig={objSeed("grafico")} onConfig={cfg=>reportCfg("grafico",cfg)}/>;
  };

  return (
    <div>
      {/* ② Toolbar superior del workspace */}
      <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${C.border}`}}>
        <button onClick={()=>setPanelOpen(o=>!o)} title={panelOpen?"Ocultar panel (más canvas)":"Mostrar panel"} style={{...btnSt(panelOpen?C.blue:C.muted,!panelOpen),fontSize:12,padding:"6px 10px"}}>{panelOpen?"◧ Panel":"▤ Panel"}</button>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={lblIn}>Preset</span>
          <div style={seg}>{PRESETS.map(p=><button key={p.k} onClick={()=>setPreset(p.k)} style={segBtn(preset===p.k,false)}>{p.lab}</button>)}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{...lblIn,opacity:libre?1:0.5}}>Visualización</span>
          <div style={{...seg,opacity:libre?1:0.6}}>{VIZ.map(v=><button key={v.k} disabled={!libre} onClick={()=>libre&&setViz(v.k)} title={libre?"":"La vista curada usa su propio renderer"} style={segBtn(libre&&viz===v.k,!libre)}>{v.lab}</button>)}</div>
        </div>
        {!libre && <span style={{fontSize:10.5,color:C.muted2}}>Vista curada · renderer propio</span>}

        {/* Vistas guardadas (bookmarks) — P2.1 */}
        <div style={{position:"relative"}}>
          <button onClick={()=>{ setBmOpen(o=>!o); setBmMsg(""); }} title="Guardar y recuperar vistas (selección + preset + visualización), por usuario"
            style={{...btnSt(bmOpen?C.blue:C.muted,!bmOpen),fontSize:12,padding:"6px 10px"}}>★ Vistas {bmList.length?`(${bmList.length})`:""}</button>
          {bmOpen && (
            <div style={{position:"absolute",top:"calc(100% + 6px)",left:0,zIndex:50,width:320,background:C.card,border:`1px solid ${C.border}`,borderRadius:10,boxShadow:"0 10px 30px rgba(0,0,0,.28)",padding:10}}>
              <div style={{fontSize:10,fontWeight:800,color:C.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>Guardar vista actual</div>
              <div style={{display:"flex",gap:6,marginBottom:8}}>
                <input value={bmName} onChange={e=>setBmName(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter") guardarVista(); }}
                  placeholder="Nombre de la vista…" style={{flex:1,minWidth:0,fontSize:12,padding:"7px 9px",borderRadius:7,border:`1px solid ${C.border}`,background:C.card2,color:C.text}}/>
                <button onClick={guardarVista} disabled={!bmName.trim()} style={{...btnSt(C.green,!bmName.trim()),fontSize:12,padding:"7px 11px",opacity:bmName.trim()?1:0.5}}>Guardar</button>
              </div>
              <div style={{fontSize:10,fontWeight:800,color:C.muted,textTransform:"uppercase",letterSpacing:0.5,margin:"4px 0 6px",borderTop:`1px solid ${C.border}`,paddingTop:8}}>Mis vistas</div>
              {bmList.length===0
                ? <div style={{fontSize:11.5,color:C.muted2,padding:"4px 2px"}}>Sin vistas guardadas todavía.</div>
                : <div style={{maxHeight:220,overflowY:"auto",display:"flex",flexDirection:"column",gap:4}}>
                    {bmList.map(bm=>(
                      <div key={bm.id} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 6px",borderRadius:7,background:C.card2,border:`1px solid ${C.border}`}}>
                        <button onClick={()=>restaurarVista(bm)} title="Restaurar esta vista" style={{flex:1,minWidth:0,textAlign:"left",background:"transparent",border:"none",cursor:"pointer",color:C.text,fontSize:12,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {bm.nombre} <span style={{fontWeight:500,color:C.muted2,fontSize:10.5}}>· {bm.preset==="libre"?bm.viz:bm.preset}</span>
                        </button>
                        <button onClick={()=>renombrarVista(bm)} title="Renombrar" style={{background:"transparent",border:"none",cursor:"pointer",color:C.muted,fontSize:12}}>✎</button>
                        <button onClick={()=>eliminarVista(bm)} title="Eliminar" style={{background:"transparent",border:"none",cursor:"pointer",color:C.muted,fontSize:13}}>🗑</button>
                      </div>
                    ))}
                  </div>}
              {bmMsg && <div style={{fontSize:10.5,color:C.muted,marginTop:8}}>{bmMsg}</div>}
            </div>
          )}
        </div>

        {/* Controles ÚNICOS del workspace (⛶ | Excel | PDF), alineados a la derecha */}
        <div style={{marginLeft:"auto",display:"flex",gap:6}}>
          <button onClick={()=>setFull(true)} disabled={!exportable} title={exportable?"Pantalla completa del objeto":"Disponible en presets libres (e5 para vistas curadas)"} style={{...btnSt(C.blue,true),fontSize:12,padding:"6px 10px",opacity:exportable?1:0.45}}>⛶ Pantalla completa</button>
          <button onClick={()=>fireExport("excel")} disabled={!exportable} title="Excel del dataset/resultado de la visualización activa (respeta selección y filtros)" style={{...btnSt(C.green),fontSize:12,padding:"6px 10px",opacity:exportable?1:0.45}}>↓ Excel</button>
          <button onClick={()=>fireExport("pdf")} disabled={!exportable} title="PDF de la visualización activa (con contexto: título, fecha, selecciones, preset)" style={{...btnSt(C.accent),fontSize:12,padding:"6px 10px",opacity:exportable?1:0.45}}>↓ PDF</button>
        </div>
      </div>

      {/* ③ Panel lateral + ④ Canvas (alto = viewport − chrome) */}
      <div style={{display:"flex",gap:12,alignItems:"stretch",height:"calc(100vh - 250px)",minHeight:460}}>
        {panelOpen && (
          <div style={{width:264,flexShrink:0,overflowY:"auto",border:`1px solid ${C.border}`,borderRadius:10,background:C.card2,padding:8}}>
            <div style={{fontSize:10,fontWeight:800,color:C.muted,textTransform:"uppercase",letterSpacing:0.5,margin:"2px 2px 7px"}}>Filtros</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {FILT.map(dk=><FilterFieldBI key={dk} dimKey={dk} label={FRISKU_DIMS.find(d=>d.key===dk)?.lab||dk}/>)}
            </div>
            <div style={{fontSize:10,fontWeight:800,color:C.muted,textTransform:"uppercase",letterSpacing:0.5,margin:"14px 2px 6px",borderTop:`1px solid ${C.border}`,paddingTop:10}}>Propiedades</div>
            {propsInPanel
              ? <div ref={setPropsEl} style={{padding:"0 2px"}}/>
              : <div style={{fontSize:10.5,color:C.muted2,padding:"0 2px"}}>Vista curada: su configuración vive en el propio objeto (los presets se integran en e5).</div>}
          </div>
        )}
        <div style={{flex:1,minWidth:0,overflow:"auto"}}>
          {canvas()}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// REPORTERÍA BI — punto de entrada analítico único. Hojas: Resumen, Comercial,
// Análisis (superficie de exploración con selector de objeto), Semanal,
// Comparativo y Reportes. TODO usa el mismo motor: una selección, unas métricas.
// ═══════════════════════════════════════════════════════════════════
function ReporteriaBI({ data, permResumen, permReportes, permTablero, onVerEmbarque, bmOwner }) {
  const hojas = [
    (permResumen?.visible!==false) && { id:"exec",     lab:"📈 Resumen" },
    { id:"analisis",   lab:"🔬 Análisis" },
    (permReportes?.visible!==false) && { id:"reportes", lab:"📋 Reportes" },
  ].filter(Boolean);
  const [hoja, setHoja] = useState(hojas[0]?.id || "exec");
  const [paneOpen, setPaneOpen] = useState(false);
  const enAnalisis = hoja==="analisis";   // en Análisis los filtros viven en el panel del workspace
  return (
    <div>
      <SelectionBarBI/>
      {!enAnalisis && <FilterPaneBI open={paneOpen}/>}
      <div style={{display:"flex", gap:6, marginBottom:14, flexWrap:"wrap", borderBottom:`1px solid ${C.border}`, paddingBottom:10, alignItems:"center"}}>
        {!enAnalisis && <>
          <button onClick={()=>setPaneOpen(o=>!o)} title="Panel de filtros (varias dimensiones, 4 estados)"
            style={{...btnSt(paneOpen?C.accent2:C.muted, !paneOpen), fontSize:12, padding:"7px 12px"}}>🔎 Filtros</button>
          <span style={{width:1, alignSelf:"stretch", background:C.border, margin:"0 2px"}}/>
        </>}
        {hojas.map(h=>(
          <button key={h.id} onClick={()=>setHoja(h.id)}
            style={{...btnSt(hoja===h.id?C.blue:C.muted, hoja!==h.id), fontSize:12, padding:"7px 12px"}}>{h.lab}</button>
        ))}
      </div>
      {hoja==="exec"     && <ResumenEjecutivo/>}
      {hoja==="analisis" && <AnalysisWorkspace data={data} permTablero={permTablero} onVerEmbarque={onVerEmbarque} bmOwner={bmOwner}/>}
      {hoja==="reportes" && <ReportesTab {...data}/>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DRILL-DOWN GROUPS (estilo Qlik) — jerarquías que AVANZAN de nivel.
// A diferencia de una selección global, el drill es NAVEGACIÓN LOCAL: al bajar
// por un valor se acota SOLO esta tabla (respeta la selección global vigente
// pero NO la modifica) y se muestra con su PROPIO breadcrumb, separado de la
// Barra de Selección. Botón para "promover" la ruta de drill a selección real.
// Métricas count-distinct recalculadas con metric.calc (nunca suma subtotales).
// ═══════════════════════════════════════════════════════════════════
const DRILL_GROUPS = {
  comercial: { lab:"Comercial", dims:["exportadora","cliente","especie","contenedor"] },
  logistico: { lab:"Logístico", dims:["temporada","semanaETD","cliente","contenedor"] },
  mercado:   { lab:"Mercado",   dims:["mercado","paisDestino","puertoDestino","cliente","contenedor"] },
};
function DrillGroupsBI({ onVerEmbarque, chromeless, panelEl, fullscreen, onExitFull, exportReq, initialConfig, onConfig }) {
  const bi = useFriskuBI();
  const { filtered, metrics, metric, setMany, chips } = bi;
  // P2.1b: semilla desde bookmark. grpKey validado contra DRILL_GROUPS; path depurado por
  // orden de grupo (sanitizeDrillPath) y luego por EXISTENCIA del valor en los hechos del prefijo.
  // Drill State ≠ Selection State: restaurar la ruta NO toca la selección global.
  const ic = initialConfig||{};
  const g0 = (typeof ic.grpKey==="string" && DRILL_GROUPS[ic.grpKey]) ? ic.grpKey : "comercial";
  const [grpKey, setGrpKey] = useState(g0);
  const [medKey, setMedKey] = useState(()=> typeof ic.medKey==="string" ? ic.medKey : "fcl");
  const [path, setPath] = useState(()=>{
    const estructural = sanitizeDrillPath(ic.path, DRILL_GROUPS[g0]?.dims||[]).path;
    const out=[];
    for(const e of estructural){ // corta en el primer tramo cuyo valor no exista en los hechos del prefijo
      const existe = filtered.some(r=> out.every(p=>String(r[p.dimKey])===String(p.value)) && String(r[e.dimKey])===String(e.value));
      if(!existe) break; out.push(e);
    }
    return out;
  });
  useEffect(()=>{ onConfig && onConfig({ grpKey, medKey, path }); }, [grpKey, medKey, path]);
  const grp = DRILL_GROUPS[grpKey];
  const M = metric[medKey];
  const FIN = new Set(["destinationSalesUSD","clientCommissionUSD","friskuCommissionUSD","avgCommissionPct"]);
  const isFin = FIN.has(medKey);
  // Al cambiar de grupo, reinicia la ruta de drill.
  const cambiarGrupo = (k)=>{ setGrpKey(k); setPath([]); };
  // Filas del nivel: selección global (filtered) ∩ ruta de drill.
  const rows = useMemo(()=>filtered.filter(r=>path.every(p=>String(r[p.dimKey])===String(p.value))), [filtered, path]);
  const lvl = path.length;
  const curDim = grp.dims[lvl]; // dimensión del nivel actual (undefined si se agotó)
  const enHoja = !curDim; // ruta completa → detalle de contenedores
  const grupos = useMemo(()=>{
    if(!curDim) return [];
    return groupByDims(rows, [curDim]).map(g=>({ value:g.dimValues[curDim], label:g.labels[curDim], rows:g.rows }))
      .sort((a,b)=>M.calc(b.rows)-M.calc(a.rows));
  }, [rows, curDim, medKey]);
  const bajar = (g)=>{ if(curDim==="contenedor"){ const oe=g.rows[0]?._oe; if(oe&&onVerEmbarque) onVerEmbarque(oe); return; }
    setPath(p=>[...p, {dimKey:curDim, value:g.value, label:g.label}]); };
  const irNivel = (i)=>setPath(p=>p.slice(0,i)); // breadcrumb: truncar
  const promover = ()=>{ path.forEach(p=>setMany(p.dimKey, [p.value])); };
  const dimLab = (k)=>(FRISKU_DIMS.find(d=>d.key===k)?.lab)||k;
  const filtrosTxt = chips.length ? chips.map(c=>`${c.dimLab}=${c.label}`).join(", ") : "sin filtros";
  const rutaTxt = [grp.lab, ...path.map(p=>p.label)].join(" › ");

  // ── Export del NIVEL/RUTA actual (reutiliza helpers fr_*/jsPDF) ──
  const exportExcel = async ()=>{ try{
    const ExcelJS=await fr_loadExcelJS(); const wb=new ExcelJS.Workbook(); wb.creator="Grupo Mediterra — Frisku Foods";
    const ws=wb.addWorksheet("Drill"); const tot=M.calc(rows);
    if(grupos.length){
      const rowsX=grupos.map(g=>{ const val=M.calc(g.rows); const sinDato=isFin&&g.rows.filter(r=>r._nLiq>0).length===0; return [g.label, sinDato?"":val, (!isFin&&tot>0)?Number((val/tot*100).toFixed(1)):""]; });
      fr_sheetTabla(ws,{titulo:`FRISKU FOODS — Drill ${grp.lab}`, subtitulo:`Ruta: ${rutaTxt} · Nivel: ${dimLab(curDim)} · Filtros: ${filtrosTxt} · ${new Date().toLocaleString("es-CL")}`,
        headers:[dimLab(curDim), M.label, "%"], colWidths:[30,16,9], rows:rowsX, totalRow:[`TOTAL (${grupos.length})`, tot, ""],
        moneyCols:M.fmt==="usd"?[1]:[], intCols:M.fmt==="int"?[1]:[]});
    } else {
      const rowsX=rows.map(r=>[r._oe?.numero||"—", r.especieLab, r.clienteLab, r.exportadoraLab, r._cajas, r._kilos]);
      fr_sheetTabla(ws,{titulo:`FRISKU FOODS — Drill ${grp.lab}`, subtitulo:`Ruta: ${rutaTxt} · Contenedores · Filtros: ${filtrosTxt} · ${new Date().toLocaleString("es-CL")}`,
        headers:["N° OE","Especie","Cliente","Exportador","Cajas","Kilos"], colWidths:[14,16,20,20,10,10], rows:rowsX, intCols:[4,5]});
    }
    await fr_logoExcel(wb,ws);
    await fr_descargarWB(wb,`Frisku_Drill_${grpKey}_${new Date().toISOString().slice(0,10)}.xlsx`);
  }catch(e){ console.error("[Drill] Excel:",e); alert("No se pudo generar el Excel: "+e.message); } };
  const exportPDF = async ()=>{ try{
    const JsPDF=await pl_loadJsPDF(); const doc=new JsPDF({orientation:"landscape",unit:"mm",format:"a4"}); const W=297,m=12;
    doc.setFillColor(30,39,97); doc.rect(0,0,W,24,"F"); doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(13);
    doc.text(`Frisku Foods — Drill ${grp.lab}`, m, 11); doc.setFont("helvetica","normal"); doc.setFontSize(7.5);
    doc.text(`Ruta: ${rutaTxt} · Nivel: ${curDim?dimLab(curDim):"contenedores"} · ${new Date().toLocaleString("es-CL")}`.slice(0,175), m, 18);
    doc.setFontSize(7); doc.text(`Filtros: ${filtrosTxt}`.slice(0,175), m, 22.5); await fr_logoPDF(doc,W-m,4,40,15);
    const tot=M.calc(rows);
    const head = grupos.length ? [[dimLab(curDim), M.label, "%"]] : [["N° OE","Especie","Cliente","Exportador","Cajas","Kilos"]];
    const body = grupos.length
      ? grupos.map(g=>{ const val=M.calc(g.rows); const sinDato=isFin&&g.rows.filter(r=>r._nLiq>0).length===0; return [g.label, sinDato?"—":fmtMetric(M.fmt,val), (!isFin&&tot>0)?(val/tot*100).toFixed(1)+"%":"—"]; })
      : rows.map(r=>[r._oe?.numero||"—", r.especieLab, r.clienteLab, r.exportadoraLab, fmtN0(r._cajas), fmtN0(r._kilos)]);
    doc.autoTable({ startY:28, head, body, theme:"striped", styles:{fontSize:7.5}, headStyles:{fillColor:[30,39,97]}, margin:{left:m,right:m} });
    doc.save(`Frisku_Drill_${grpKey}_${new Date().toISOString().slice(0,10)}.pdf`);
  }catch(e){ console.error("[Drill] PDF:",e); alert("No se pudo generar el PDF: "+e.message); } };
  useExportTrigger(exportReq, {excel:exportExcel, pdf:exportPDF});

  const Tab=({on,onClick,children})=>(<button onClick={onClick} style={{...btnSt(on?C.blue:C.muted,!on), fontSize:12, padding:"6px 12px"}}>{children}</button>);
  const pLbl = {fontSize:10,fontWeight:800,color:C.muted,textTransform:"uppercase",letterSpacing:0.4,margin:"2px 0 5px"};

  // Breadcrumb de DRILL (ruta local, dentro del canvas — separado de la Barra global)
  const breadcrumbEl = (
    <div style={{display:"flex", gap:6, flexWrap:"wrap", alignItems:"center", marginBottom:12, padding:"8px 10px", background:`${C.blue}0c`, border:`1px solid ${C.border}`, borderRadius:9}}>
      <span style={{fontSize:11, color:C.muted, fontWeight:700}}>⛏ Ruta:</span>
      <span onClick={()=>irNivel(0)} style={{cursor:"pointer", fontSize:12, fontWeight:700, color:lvl===0?C.text:C.blue}}>{grp.lab}</span>
      {path.map((p,i)=>(<React.Fragment key={i}>
        <span style={{color:C.muted2, fontSize:11}}>›</span>
        <span onClick={()=>irNivel(i+1)} style={{cursor:"pointer", fontSize:12, color:i===lvl-1?C.text:C.blue, fontWeight:i===lvl-1?700:500}}
              title={`${dimLab(p.dimKey)}: ${p.label}`}>{p.label}</span>
      </React.Fragment>))}
      {curDim && <span style={{fontSize:11, color:C.muted2, marginLeft:4}}>· nivel actual: <b>{dimLab(curDim)}</b></span>}
      <span style={{flex:1}}/>
      {path.length>0 && <>
        <button onClick={promover} title="Convertir la ruta de drill en selección global (Barra de Selección)"
          style={{...btnSt(C.accent2,true), fontSize:11, padding:"4px 9px"}}>↥ Aplicar como selección</button>
        <button onClick={()=>setPath([])} style={{...btnSt(C.muted,true), fontSize:11, padding:"4px 9px"}}>Reiniciar drill</button>
      </>}
    </div>
  );

  const tablaEl = (maxH)=> enHoja ? (
    <div style={{fontSize:12.5, color:C.muted, padding:"14px 4px", border:`1px solid ${C.border}`, borderRadius:10}}>Ruta completa. {rows.length} contenedor(es) en el detalle — usa el breadcrumb para subir de nivel.</div>
  ) : (
    <div style={{border:`1px solid ${C.border}`, borderRadius:10, overflowX:"auto", maxHeight:maxH, overflowY:"auto"}}>
      <table style={{width:"100%", borderCollapse:"collapse", fontSize:11.5}}>
        <thead><tr style={{color:C.muted, textAlign:"left"}}>
          <th style={{padding:"6px 10px", position:"sticky", top:0, zIndex:1, background:C.card2, fontWeight:700}}>{dimLab(curDim)}</th>
          <th style={{padding:"6px 10px", textAlign:"right", position:"sticky", top:0, zIndex:1, background:C.card2, fontWeight:700}}>{M.label}</th>
          <th style={{padding:"6px 10px", textAlign:"right", width:80, position:"sticky", top:0, zIndex:1, background:C.card2, fontWeight:700}}>%</th>
          <th style={{padding:"6px 10px", width:36, position:"sticky", top:0, zIndex:1, background:C.card2}}></th>
        </tr></thead>
        <tbody>
          {(()=>{ const tot=M.calc(rows); return grupos.map((g,i)=>{
            const val=M.calc(g.rows); const sinDato=isFin && g.rows.filter(r=>r._nLiq>0).length===0;
            const pct = tot>0 && !isFin ? (val/tot*100) : null;
            const esHoja = curDim==="contenedor";
            return (<tr key={g.value+"_"+i} onClick={()=>bajar(g)} style={{borderTop:`1px solid ${C.border}`, cursor:"pointer"}}
              title={esHoja?"Ver embarque":"Bajar un nivel"}>
              <td style={{padding:"4px 10px", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:320}}>
                <span style={{color:C.blue}}>{esHoja?"→ ":"▸ "}</span>{g.label}</td>
              <td style={{padding:"4px 10px", textAlign:"right", fontFamily:"monospace", color:sinDato?C.muted2:undefined}}>{sinDato?"—":fmtMetric(M.fmt, val)}</td>
              <td style={{padding:"4px 10px", textAlign:"right", fontFamily:"monospace", color:C.muted2}}>{pct==null?"—":pct.toFixed(1)+"%"}</td>
              <td style={{padding:"4px 10px", textAlign:"center", color:C.muted2}}>{esHoja?"🚢":"⤵"}</td>
            </tr>); }); })()}
        </tbody>
        <tfoot><tr style={{fontWeight:800}}>
            <td style={{padding:"7px 10px", position:"sticky", bottom:0, background:C.card2, borderTop:`2px solid ${C.border}`}}>TOTAL ({grupos.length})</td>
            <td style={{padding:"7px 10px", textAlign:"right", fontFamily:"monospace", position:"sticky", bottom:0, background:C.card2, borderTop:`2px solid ${C.border}`}}>{fmtMetric(M.fmt, M.calc(rows))}</td>
            <td colSpan={2} style={{padding:"7px 10px", textAlign:"right", color:C.muted2, fontWeight:400, fontSize:11, position:"sticky", bottom:0, background:C.card2, borderTop:`2px solid ${C.border}`}}>recalculado (no suma subtotales)</td>
        </tr></tfoot>
      </table>
    </div>
  );
  const notaEl = (
    <div style={{fontSize:11, color:C.muted2, marginTop:8}}>
      El drill es local: acota esta tabla sin tocar la Barra de Selección. Usa <b>↥ Aplicar como selección</b> para promover la ruta a selección global.
    </div>
  );

  // ── Modo workspace (chromeless): Grupo+Medida al panel; canvas = ruta + tabla ──
  if(chromeless){
    const controls = (
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div><div style={pLbl}>Grupo de drill</div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {Object.entries(DRILL_GROUPS).map(([k,g])=><button key={k} onClick={()=>cambiarGrupo(k)} title={g.dims.map(d=>dimLab(d)).join(" → ")} style={{...btnSt(grpKey===k?C.blue:C.muted,grpKey!==k),fontSize:11.5,padding:"5px 9px",textAlign:"left"}}>{g.lab}</button>)}
          </div>
        </div>
        <div><div style={pLbl}>Medida</div><select value={medKey} onChange={e=>setMedKey(e.target.value)} style={{...inputSt,width:"100%"}}>{metrics.map(m=><option key={m.key} value={m.key}>{m.label}</option>)}</select></div>
      </div>
    );
    return (<>
      {panelEl && createPortal(controls, panelEl)}
      <div>{breadcrumbEl}{tablaEl("58vh")}{notaEl}</div>
      <FullscreenBI open={!!fullscreen} onClose={onExitFull} title={`Drill · ${grp.lab}`}><div>{breadcrumbEl}{tablaEl("78vh")}</div></FullscreenBI>
    </>);
  }

  // ── Modo legacy (standalone) ──
  return (
    <div>
      <div style={{display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:10}}>
        <span style={{fontSize:12, color:C.muted, fontWeight:700}}>Grupo:</span>
        {Object.entries(DRILL_GROUPS).map(([k,g])=><Tab key={k} on={grpKey===k} onClick={()=>cambiarGrupo(k)}>{g.lab}</Tab>)}
        <span style={{width:1, alignSelf:"stretch", background:C.border, margin:"0 2px"}}/>
        <span style={{fontSize:12, color:C.muted, fontWeight:700}}>Medida:</span>
        <select value={medKey} onChange={e=>setMedKey(e.target.value)} style={{...inputSt, maxWidth:230}}>
          {metrics.map(m=><option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
      </div>
      {breadcrumbEl}
      {tablaEl(560)}
      {notaEl}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// EXPLORADOR BI (estilo Qlik) — self-service sobre TODA la data de Frisku.
// El usuario elige: (1) qué FUENTE de datos explorar (liquidaciones,
// embarques, programa, cobranza), (2) qué MEDIR, (3) cómo AGRUPAR (una o
// dos dimensiones), y (4) cómo VERLO (barras, tabla, torta, tendencia).
// Los filtros son ASOCIATIVOS: clic en cualquier elemento acota todo el
// tablero (verde=seleccionado / normal=posible / tachado=excluido), como
// las selecciones de Qlik. Todo con SVG/CSS propio, sin dependencias.
// ═══════════════════════════════════════════════════════════════════

// Paleta categórica para segmentos (desglose 2ª dimensión / torta).
const PAL_BI = ["#2563eb","#16a34a","#f59e0b","#db2777","#7c3aed","#0891b2","#dc2626","#65a30d","#ea580c","#0d9488","#9333ea","#ca8a04"];

// ═══════════════════════════════════════════════════════════════════
// HOJA 1 — RESUMEN EJECUTIVO (réplica Qlik, hoja fija)
// Tabla de hechos = frisku_embarques (granularidad contenedor/OE), unida a
// liquidaciones para las medidas de dinero (venta/comisión).  VERIFICADO-FRISKU.
// Filtros globales COMPARTIDOS por toda la hoja (temporada/especie/exportador/
// cliente/origen/destino), asociativos entre sí: las opciones de cada filtro se
// recalculan según los otros, simulando la selección cruzada del motor de Qlik.
//   Fuente del patrón asociativo: help.qlik.com/.../associative-selection-model  // HIPOTESIS-QLIK
// Export on-demand Excel + PDF con logo Frisku (sin scheduling; Frisku no usa
// NPrinting).  VERIFICADO (confirmado por Angelo).
// ═══════════════════════════════════════════════════════════════════
function ResumenEjecutivo() {
  // Consume el MOTOR BI (friskuBI): filas de hechos, selección compartida,
  // métricas de definición única y opciones asociativas. La hoja no reimplementa
  // ninguna fórmula ni estado de filtro propio.
  const bi = useFriskuBI();
  const { filtered:rows, sel, setOne, toggle, clearAll, remove, chips, associative, metric, dataQuality } = bi;
  const [expXls, setExpXls] = useState(false);
  const [expPdf, setExpPdf] = useState(false);
  const mF = metric.friskuCommissionUSD;   // medida principal de dinero (comisión Frisku)

  // Agrupa las filas por una dimensión y evalúa una métrica del motor.
  const groupBy = (dimKey, met)=>{
    const m={}; rows.forEach(r=>{ const v=r[dimKey]; (m[v]=m[v]||{key:v, lab:r[dimKey+"Lab"], rows:[]}).rows.push(r); });
    return Object.values(m).map(g=>({ key:g.key, lab:g.lab, v:met.calc(g.rows) }));
  };

  // KPIs = métricas del registro único (sobre las filas filtradas).
  const KPIS = ["containers","boxes","kilograms","destinationSalesUSD","clientCommissionUSD","friskuCommissionUSD","avgCommissionPct","activeClients","activeExporters"];
  const kpiColor = { containers:C.teal, destinationSalesUSD:C.blue, friskuCommissionUSD:C.accent2, avgCommissionPct:C.green };

  // Gráficos (todos derivados de las mismas filas + métrica única).
  const porTemp = useMemo(()=> groupBy("temporada", mF).sort((a,b)=>String(a.lab).localeCompare(String(b.lab))), [rows]);
  const maxTemp = Math.max(1,...porTemp.map(x=>x.v));
  const porCli = useMemo(()=>{ const a=groupBy("cliente",mF).filter(x=>x.v>0).sort((x,y)=>y.v-x.v); const tot=a.reduce((s,x)=>s+x.v,0)||1; let acc=0; return a.map(x=>{ acc+=x.v; return {...x,pctAcum:acc/tot*100}; }); }, [rows]);
  const maxCli = Math.max(1,...porCli.map(x=>x.v));
  const porEsp = useMemo(()=> groupBy("especie",mF).filter(x=>x.v>0).map(x=>({...x,color:ESP_COLORS[x.key]||C.blue})).sort((a,b)=>b.v-a.v), [rows]);
  const totEsp = porEsp.reduce((s,x)=>s+x.v,0)||1;
  const PIPE=[{id:"borrador",lab:"Borrador",color:C.yellow},{id:"confirmado",lab:"Confirmado",color:C.green},{id:"despachado",lab:"Despachado",color:C.blue},{id:"cancelado",lab:"Cancelado",color:C.muted}];
  const pipe = useMemo(()=>{ const m={}; rows.forEach(r=>{ m[r.estado]=(m[r.estado]||0)+1; }); return m; },[rows]);
  const maxPipe = Math.max(1,...PIPE.map(p=>pipe[p.id]||0));

  const filtrosTxt = chips.length ? chips.map(c=>`${c.dimLab}=${c.label}`).join(" · ") : "sin filtros";

  // Detalle a nivel contenedor (para el Excel). Columnas del spec.
  const detalle = useMemo(()=> rows.map(r=>{ const o=r._oe; const cal=Object.entries(o.calibrePorFormato||{}).filter(([,v])=>v).map(([k,v])=>`${k}:${v}`).join("; ");
    return { contenedor:o.numeroContenedor||o.numero||"", naviera:o.navieraAerolinea||"", especie:o.especieCodigo||"", calibre:cal,
      exportador:r.exportadoraLab, cliente:r.clienteLab, origen:o.origen||"", destino:o.destino||"", etd:o.fechaDespacho||"", eta:o.fechaETA||"",
      kilos:r._kilos, venta:r._venta, comCli:r._comC, com:r._comF, pct:r._venta>0?r._comF/r._venta*100:0 };
  }).sort((a,b)=>String(b.etd).localeCompare(String(a.etd))), [rows]);

  // ── Export Excel (ExcelJS · logo Frisku) ──
  const exportarExcel = async ()=>{
    setExpXls(true);
    try{
      const ExcelJS = await fr_loadExcelJS();
      const wb = new ExcelJS.Workbook(); wb.creator="Grupo Mediterra — Frisku Foods";
      const sub = `Resumen ejecutivo · Filtros: ${filtrosTxt} · ${new Date().toLocaleString("es-CL")}`;
      const wsR = wb.addWorksheet("Resumen");
      fr_sheetTabla(wsR, { titulo:"FRISKU FOODS — Resumen ejecutivo", subtitulo:sub, headers:["Indicador","Valor"], colWidths:[34,20],
        rows: KPIS.map(k=>{ const m=metric[k]; const v=m.calc(rows); return [m.label, m.fmt==="pct"?Number(v.toFixed(2)):Math.round(v)]; }) });
      await fr_logoExcel(wb, wsR);
      const ws = wb.addWorksheet("Detalle por contenedor");
      fr_sheetTabla(ws, { titulo:"FRISKU FOODS — Detalle por contenedor", subtitulo:sub,
        headers:["Contenedor","Naviera/Aerolínea","Especie","Calibre/Formato","Exportador","Cliente","Origen","Destino","ETD","ETA","Kilos","Venta destino USD","Comisión cliente USD","Comisión Frisku USD","% comisión"],
        colWidths:[16,20,10,18,22,22,14,14,12,12,12,16,16,16,10],
        rows: detalle.map(d=>[d.contenedor,d.naviera,d.especie,d.calibre,d.exportador,d.cliente,d.origen,d.destino,d.etd,d.eta,Math.round(d.kilos),Math.round(d.venta),Math.round(d.comCli),Math.round(d.com),Number(d.pct.toFixed(1))]),
        moneyCols:[11,12,13], intCols:[10] });
      await fr_logoExcel(wb, ws);
      await fr_descargarWB(wb, `Frisku_Resumen_${new Date().toISOString().slice(0,10)}.xlsx`);
    }catch(e){ console.error("[Resumen] Excel:",e); alert("No se pudo generar el Excel: "+e.message); }
    setExpXls(false);
  };

  // ── Export PDF (jsPDF · logo Frisku · maquetado, no captura) ──
  const exportarPDF = async ()=>{
    setExpPdf(true);
    try{
      const JsPDF = await pl_loadJsPDF();
      const doc = new JsPDF({orientation:"portrait", unit:"mm", format:"a4"});
      const W=210, m=14;
      doc.setFillColor(30,39,97); doc.rect(0,0,W,26,"F");
      doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(14);
      doc.text("Frisku Foods — Resumen ejecutivo", m, 12);
      doc.setFont("helvetica","normal"); doc.setFontSize(8.5);
      doc.text(`${new Date().toLocaleString("es-CL")}`, m, 19);
      doc.setFontSize(7.5); doc.text(`Filtros: ${filtrosTxt}`.slice(0,120), m, 23.5);
      await fr_logoPDF(doc, W-m, 5, 42, 16);
      doc.autoTable({ startY:31, head:[["Indicador","Valor"]], theme:"grid", styles:{fontSize:8.5}, headStyles:{fillColor:[30,39,97]},
        body: KPIS.map(k=>{ const mt=metric[k]; return [mt.label, fmtMetric(mt.fmt, mt.calc(rows))]; }), margin:{left:m,right:W/2} });
      doc.autoTable({ startY:31, head:[["Estado (pipeline)","OE"]], theme:"grid", styles:{fontSize:8.5}, headStyles:{fillColor:[30,39,97]},
        body: PIPE.map(p=>[p.lab, fmtN0(pipe[p.id]||0)]), margin:{left:W/2+2,right:m} });
      let y=doc.lastAutoTable.finalY+6;
      doc.setTextColor(20,20,20); doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.text("Top clientes por comisión Frisku",m,y); y+=2;
      doc.autoTable({ startY:y, head:[["Cliente","Comisión USD","% acum."]], theme:"striped", styles:{fontSize:8}, headStyles:{fillColor:[30,39,97]},
        body: porCli.slice(0,12).map(x=>[x.lab,fmtUSD0(x.v),x.pctAcum.toFixed(0)+"%"]), margin:{left:m,right:m} });
      y=doc.lastAutoTable.finalY+6;
      doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.text("Comisión por especie",m,y); y+=2;
      doc.autoTable({ startY:y, head:[["Especie","Comisión USD","%"]], theme:"striped", styles:{fontSize:8}, headStyles:{fillColor:[30,39,97]},
        body: porEsp.map(x=>[x.lab,fmtUSD0(x.v),(totEsp>0?x.v/totEsp*100:0).toFixed(0)+"%"]), margin:{left:m,right:m} });
      const ph=doc.internal.pageSize.getHeight();
      doc.setFontSize(7.5); doc.setTextColor(120,120,120);
      doc.text(`Grupo Mediterra · Frisku Foods · generado ${new Date().toLocaleString("es-CL")}`, m, ph-8);
      doc.save(`Frisku_Resumen_${new Date().toISOString().slice(0,10)}.pdf`);
    }catch(e){ console.error("[Resumen] PDF:",e); alert("No se pudo generar el PDF: "+e.message); }
    setExpPdf(false);
  };

  const kpiCard = (lab,val,color,sub)=>(
    <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"12px 15px", boxShadow:C.shadowSm}}>
      <div style={{fontSize:10, color:C.muted, fontWeight:600, textTransform:"uppercase", letterSpacing:0.3, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{lab}</div>
      <div style={{fontSize:22, fontWeight:800, color:color||C.text, marginTop:4, lineHeight:1}}>{val}</div>
      {sub && <div style={{fontSize:10, color:C.muted2, marginTop:3}}>{sub}</div>}
    </div>
  );
  const Panel = ({titulo, children})=>(
    <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:15, boxShadow:C.shadowSm}}>
      <div style={{fontSize:13, fontWeight:700, marginBottom:12}}>{titulo}</div>
      {children}
    </div>
  );
  // Dona (SVG propio).
  let accEsp=0;
  const arc = (f0,f1,R,r,cx,cy)=>{ const a0=f0*2*Math.PI-Math.PI/2, a1=f1*2*Math.PI-Math.PI/2;
    const x0=cx+R*Math.cos(a0), y0=cy+R*Math.sin(a0), x1=cx+R*Math.cos(a1), y1=cy+R*Math.sin(a1);
    const xi1=cx+r*Math.cos(a1), yi1=cy+r*Math.sin(a1), xi0=cx+r*Math.cos(a0), yi0=cy+r*Math.sin(a0);
    const big=(f1-f0)>0.5?1:0; return `M ${x0} ${y0} A ${R} ${R} 0 ${big} 1 ${x1} ${y1} L ${xi1} ${yi1} A ${r} ${r} 0 ${big} 0 ${xi0} ${yi0} Z`; };

  // Filtro global: single-select por dimensión, opciones asociativas del motor.
  const flt = (dimKey, lab)=> <FiltroMultiBI key={dimKey} dimKey={dimKey} label={lab}/>;   // multi-selección asociativa
  const finN = rows.filter(r=>r._nLiq>0).length;   // contenedores con liquidación (cobertura financiera)
  const FIN_KEYS_R = ["destinationSalesUSD","clientCommissionUSD","friskuCommissionUSD","avgCommissionPct"];

  return (
    <div>
      {/* Barra de filtros globales (motor compartido) + export */}
      <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:14, boxShadow:C.shadowSm, marginBottom:12}}>
        <div style={{display:"flex", gap:10, flexWrap:"wrap", alignItems:"flex-end"}}>
          {flt("temporada","Temporada")}
          {flt("anioETD","Año")}
          {flt("semanaETD","Semana")}
          {flt("especie","Especie")}
          {flt("exportadora","Exportador")}
          {flt("cliente","Cliente")}
          {flt("mercado","Mercado")}
          {flt("paisDestino","País destino")}
          {flt("puertoOrigen","Puerto origen")}
          {flt("puertoDestino","Puerto destino")}
          {flt("via","Tipo embarque")}
          {flt("shippingLine","Shipping line")}
          {flt("estado","Estado")}
          <div style={{display:"flex", gap:6, alignItems:"flex-end"}}>
            <button onClick={exportarExcel} disabled={expXls} style={{...btnSt(C.green), fontSize:11, padding:"7px 11px"}}>{expXls?"⏳":"⬇ Excel"}</button>
            <button onClick={exportarPDF} disabled={expPdf} style={{...btnSt(C.accent), fontSize:11, padding:"7px 11px"}}>{expPdf?"⏳":"⬇ PDF"}</button>
          </div>
        </div>
        {/* Selecciones activas (chips) */}
        <div style={{display:"flex", gap:6, flexWrap:"wrap", alignItems:"center", marginTop:10, minHeight:24}}>
          <span style={{fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase"}}>Selecciones:</span>
          {chips.length===0 ? <span style={{fontSize:11, color:C.muted2}}>ninguna · los filtros afectan a toda la hoja (motor asociativo)</span> :
            chips.map((c,i)=>(
              <span key={i} onClick={()=>remove(c.dim,c.value)} title="Quitar"
                style={{fontSize:11, fontWeight:600, background:C.accent2, color:"#fff", borderRadius:14, padding:"3px 10px", cursor:"pointer", display:"inline-flex", gap:6, alignItems:"center"}}>
                <span style={{opacity:0.8, fontWeight:400}}>{c.dimLab}:</span>{c.label}<span style={{opacity:0.85}}>×</span>
              </span>
            ))}
          {chips.length>0 && <button onClick={clearAll} style={{...btnSt(C.muted,true), fontSize:10, padding:"3px 8px"}}>Limpiar todo</button>}
        </div>
        <div style={{fontSize:11, color:C.muted2, marginTop:8}}>
          Hoja fija sobre el motor BI · {rows.length} de {bi.facts.length} contenedores en la selección.
        </div>
        {/* Calidad de datos: no silenciar problemas que afectan las métricas */}
        {(dataQuality.formatosSinPeso.length>0 || dataQuality.liqClienteSinConv>0) && (
          <div style={{marginTop:8, fontSize:11, color:C.warning, background:`${C.warning}14`, border:`1px solid ${C.warning}44`, borderRadius:8, padding:"7px 10px"}}>
            ⚠ Calidad de datos:
            {dataQuality.formatosSinPeso.length>0 && <span> {dataQuality.formatosSinPeso.length} formato(s) sin peso neto en Maestros ({dataQuality.formatosSinPeso.slice(0,6).join(", ")}) → sus kilos cuentan como 0.</span>}
            {dataQuality.liqClienteSinConv>0 && <span> {dataQuality.liqClienteSinConv} liquidación(es) sin factor de conversión para comisión cliente en USD.</span>}
          </div>
        )}
      </div>

      {/* KPIs (métricas de definición única) */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(150px,1fr))", gap:12, marginBottom:16}}>
        {KPIS.map(k=>{ const mt=metric[k]; const fin=FIN_KEYS_R.includes(k); const parcial=k==="kilograms"&&rows.some(r=>r._kgFalta);
          const val = (fin && finN===0) ? "Sin datos" : fmtMetric(mt.fmt, mt.calc(rows))+(parcial?" ⚠":"");
          const sub = fin && rows.length ? `cobertura ${finN}/${rows.length}${finN<rows.length?" ⚠":""}` : (parcial?"parcial":undefined);
          const color = (fin&&finN===0)?C.muted2 : parcial?C.warning : (k==="friskuCommissionUSD"?C.accent2:(kpiColor[k]||C.text));
          return kpiCard(mt.label, val, color, sub); })}
      </div>

      {/* Gráficos */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(320px,1fr))", gap:14}}>
        <Panel titulo="Comisión Frisku por temporada">
          {porTemp.length===0 ? <div style={{color:C.muted2,fontSize:12,textAlign:"center",padding:16}}>Sin datos</div> :
            porTemp.map(x=>(
              <div key={x.key} onClick={()=>toggle("temporada", x.key)} title="Clic para filtrar por esta temporada"
                style={{display:"grid",gridTemplateColumns:"80px 1fr auto",gap:8,alignItems:"center",marginBottom:6,cursor:"pointer"}}>
                <span style={{fontSize:11,color:C.text,fontWeight:600}}>{x.lab}</span>
                <div style={{height:12,background:C.cardAlt,borderRadius:4,overflow:"hidden"}}><div style={{width:`${x.v/maxTemp*100}%`,height:"100%",background:C.blue,borderRadius:4}}/></div>
                <span style={{fontSize:11,fontWeight:700,minWidth:72,textAlign:"right"}}>{fmtUSD0(x.v)}</span>
              </div>
            ))}
        </Panel>

        <Panel titulo="Top clientes (Pareto) por comisión Frisku">
          {porCli.length===0 ? <div style={{color:C.muted2,fontSize:12,textAlign:"center",padding:16}}>Sin datos</div> :
            porCli.slice(0,10).map(x=>(
              <div key={x.key} onClick={()=>toggle("cliente", x.key)} title="Clic para filtrar por este cliente"
                style={{display:"grid",gridTemplateColumns:"1fr auto",gap:8,alignItems:"center",marginBottom:5,cursor:"pointer"}}>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:11,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",marginBottom:2}}>{x.lab}</div>
                  <div style={{height:10,background:C.cardAlt,borderRadius:4,overflow:"hidden"}}><div style={{width:`${x.v/maxCli*100}%`,height:"100%",background:C.accent2,borderRadius:4}}/></div>
                </div>
                <span style={{fontSize:11,fontWeight:700,minWidth:96,textAlign:"right"}}>{fmtUSD0(x.v)} <span style={{color:C.muted2,fontWeight:500}}>· {x.pctAcum.toFixed(0)}%</span></span>
              </div>
            ))}
        </Panel>

        <Panel titulo="Comisión Frisku por especie">
          {porEsp.length===0 ? <div style={{color:C.muted2,fontSize:12,textAlign:"center",padding:16}}>Sin datos</div> :
            <div style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
              <svg width="150" height="150" viewBox="0 0 180 180" style={{flexShrink:0}}>
                {porEsp.map((x)=>{ const f0=accEsp/totEsp, f1=(accEsp+x.v)/totEsp; accEsp+=x.v; return <path key={x.key} d={arc(f0,f1,70,42,90,90)} fill={x.color} stroke={C.card} strokeWidth="1.5" style={{cursor:"pointer"}} onClick={()=>toggle("especie", x.key)}><title>{x.lab}: {fmtUSD0(x.v)}</title></path>; })}
                <text x="90" y="86" textAnchor="middle" style={{fontSize:9,fill:C.muted,fontWeight:600}}>Comisión</text>
                <text x="90" y="100" textAnchor="middle" style={{fontSize:12,fill:C.text,fontWeight:800}}>{fmtUSD0(totEsp)}</text>
              </svg>
              <div style={{flex:1,minWidth:150,display:"flex",flexDirection:"column",gap:4}}>
                {porEsp.slice(0,8).map(x=>(
                  <div key={x.key} onClick={()=>toggle("especie", x.key)} style={{display:"flex",gap:7,alignItems:"center",fontSize:11,cursor:"pointer"}}>
                    <span style={{width:11,height:11,borderRadius:3,background:x.color,flexShrink:0}}/>
                    <span style={{flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{x.lab}</span>
                    <span style={{fontWeight:700,color:C.muted}}>{(x.v/totEsp*100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>}
        </Panel>

        <Panel titulo="Pipeline de embarques por estado">
          {PIPE.map(p=>(
            <div key={p.id} onClick={()=>toggle("estado", p.id)} title="Clic para filtrar por estado"
              style={{display:"grid",gridTemplateColumns:"90px 1fr auto",gap:8,alignItems:"center",marginBottom:8,cursor:"pointer"}}>
              <span style={{fontSize:11,color:C.text,fontWeight:600}}>{p.lab}</span>
              <div style={{height:14,background:C.cardAlt,borderRadius:4,overflow:"hidden"}}><div style={{width:`${(pipe[p.id]||0)/maxPipe*100}%`,height:"100%",background:p.color,borderRadius:4}}/></div>
              <span style={{fontSize:12,fontWeight:700,minWidth:34,textAlign:"right"}}>{fmtN0(pipe[p.id]||0)}</span>
            </div>
          ))}
        </Panel>
      </div>

      <div style={{fontSize:10.5, color:C.muted2, marginTop:14, textAlign:"center"}}>
        Resumen ejecutivo sobre el motor BI Frisku · métricas de definición única (friskuBI.js) · filtros globales asociativos · export on-demand con logo.
      </div>
    </div>
  );
}

function TableroAsociativo({ liquidaciones, embarques, clientes, exportadoras, especies, mercados, programa, contratos, pos, initialChart, chromeless, panelEl, vizChart, fullscreen, onExitFull, exportReq, initialConfig, onConfig }) {
  // P2.1b: semilla desde bookmark. fuenteId validado contra las fuentes conocidas; measureId/
  // dim1/dim2 los reajusta el clamp por-fuente existente al montar; sin initialConfig → defaults de hoy.
  const ic = initialConfig||{};
  const FUENTE_IDS = ["liq","emb","prog","po"];
  const [fuenteId, setFuenteId] = useState(()=> (typeof ic.fuenteId==="string"&&FUENTE_IDS.includes(ic.fuenteId)) ? ic.fuenteId : "liq");
  const [measureId, setMeasureId] = useState(()=> typeof ic.measureId==="string" ? ic.measureId : "");
  const [dim1, setDim1] = useState(()=> typeof ic.dim1==="string" ? ic.dim1 : "");
  const [dim2, setDim2] = useState(()=> typeof ic.dim2==="string" ? ic.dim2 : "");
  const [chartState, setChartState] = useState(initialChart||"barras");   // barras | tabla | torta | tendencia
  const chart = chromeless ? (vizChart||initialChart||"barras") : chartState; // en workspace el tipo lo controla la Visualización
  const setChart = setChartState;
  const biCtx = useFriskuBI();                    // selección BI COMPARTIDA (un solo motor: Resumen/Reportes/Explorador)
  const sel = biCtx.sel;                          // {dimKey: Set(valores)}
  const [topN, setTopN] = useState(()=> (Number.isFinite(ic.topN)&&ic.topN>0) ? ic.topN : 12);
  // Reporta config vigente (tras el clamp por-fuente measureId/dim1/dim2 ya son válidos).
  useEffect(()=>{ onConfig && onConfig({ fuenteId, measureId, dim1, dim2, topN }); }, [fuenteId, measureId, dim1, dim2, topN]);
  const [full, setFull] = useState(false);        // pantalla completa del objeto (P1.7)

  // Lookups compartidos
  const cliOf  = (id)=>clientes.find(c=>c.id===id);
  const expOf  = (id)=>exportadoras.find(e=>e.id===id);
  const espOf  = (c)=>especies.find(e=>e.codigo===c);
  const mercOf = (c)=>mercados.find(m=>m.codigo===c);
  const espLab = (c)=>{ const e=espOf(c); return e?`${e.icono||""} ${e.nombreEs}`.trim():(c||"— s/especie —"); };
  const viaKey = (v)=> (v||"maritimo")==="aereo"?"aereo":"maritimo";
  const viaLab = (v)=> viaKey(v)==="aereo"?"✈ Aéreo":"🚢 Marítimo";
  const mesLabOf = (m)=> MESES_TEMP.find(x=>x.m===m)?.lab || "—";
  const sum = (rs,f)=>rs.reduce((s,r)=>s+(Number(r[f])||0),0);

  // ── Definición de las 4 fuentes (tabla de hechos + dims + medidas) ──
  const FUENTES = useMemo(()=>{
    // 1) LIQUIDACIONES
    const liqRows = (liquidaciones||[]).map(l=>{
      const oe=(embarques||[]).find(e=>e.id===l.oeId); const cli=cliOf(oe?.clienteId);
      const mes=Number((l.fechaLiquidacion||"").slice(5,7))||0;
      return {
        _k:l.id, oeId:l.oeId,
        especie:oe?.especieCodigo||"—", especieLab:espLab(oe?.especieCodigo),
        cliente:oe?.clienteId||"—", clienteLab:cli?.nombre||"— s/cliente —",
        exportadora:oe?.exportadoraId||"—", exportadoraLab:expOf(oe?.exportadoraId)?.nombre||"— s/exp —",
        mercado:cli?.mercadoCodigo||"—", mercadoLab:mercOf(cli?.mercadoCodigo)?.nombre||(cli?.mercadoCodigo||"— s/mercado —"),
        pais:cli?.paisCodigo||cli?.pais||"—", paisLab:cli?.pais||cli?.paisCodigo||"— s/país —",
        via:viaKey(oe?.tipoEmbarque), viaLab:viaLab(oe?.tipoEmbarque),
        estado:l.estado||"borrador", estadoLab:l.estado||"borrador",
        temporada:l.temporada||"—", temporadaLab:l.temporada||"— s/temp —",
        mes, mesLab:mesLabOf(mes),
        _com:mComFriskuUSD(l), _venta:mVentaUSD(l), _fob:mFobUSD(l),  // definición única (motor friskuBI)
        _cajas:Number(l.cajasVendidas)||0,
      };
    });
    // 2) EMBARQUES (OE)
    const embRows = (embarques||[]).map(oe=>{
      const cli=cliOf(oe.clienteId);
      const via=viaKey(oe.tipoEmbarque); const est=oe.estado||"borrador";
      const cajas=Object.values(oe.cajasPorFormato||{}).reduce((s,v)=>s+Number(v||0),0);
      return {
        _k:oe.id, oeId:oe.id,
        especie:oe.especieCodigo||"—", especieLab:espLab(oe.especieCodigo),
        cliente:oe.clienteId||"—", clienteLab:cli?.nombre||"— s/cliente —",
        exportadora:oe.exportadoraId||"—", exportadoraLab:expOf(oe.exportadoraId)?.nombre||"— s/exp —",
        mercado:cli?.mercadoCodigo||"—", mercadoLab:mercOf(cli?.mercadoCodigo)?.nombre||(cli?.mercadoCodigo||"— s/mercado —"),
        via, viaLab:viaLab(oe.tipoEmbarque),
        estado:est, estadoLab:est,
        temporada:oe.temporada||"—", temporadaLab:oe.temporada||"— s/temp —",
        origen:oe.origen||"—", origenLab:oe.origen||"— s/origen —",
        destino:oe.destino||"—", destinoLab:oe.destino||"— s/destino —",
        _cajas:cajas,
        _fcl:(via!=="aereo" && est!=="cancelado")?1:0,
      };
    });
    // 3) PROGRAMA (semana ↔ closure)
    const progRows = (programa||[]).map((sem,i)=>{
      const clo=(contratos||[]).find(c=>c.id===sem.closureId);
      const via=viaKey(sem.tipoEmbarque);
      const cajas=Object.values(sem.cajasPorFormato||{}).reduce((s,v)=>s+Number(v||0),0);
      return {
        _k:sem.id||`sem${i}`,
        especie:clo?.especieCodigo||"—", especieLab:espLab(clo?.especieCodigo),
        cliente:clo?.clienteId||"—", clienteLab:cliOf(clo?.clienteId)?.nombre||"— s/cliente —",
        exportadora:clo?.exportadoraId||"—", exportadoraLab:expOf(clo?.exportadoraId)?.nombre||"— s/exp —",
        via, viaLab:viaLab(sem.tipoEmbarque),
        temporada:clo?.temporada||"—", temporadaLab:clo?.temporada||"— s/temp —",
        _fcl:Number(sem.contenedoresFCL)||0,
        _cajas:cajas,
        _pallets:Number(sem.pallets)||0,
      };
    });
    // 4) COBRANZA (PO)
    const hoy = Date.now();
    const poRows = (pos||[]).map(po=>{
      const cli=cliOf(po.clienteId); const est=po.estado||"borrador";
      let dias=null; if(po.fecha){ const t=new Date(po.fecha+"T00:00:00").getTime(); if(!isNaN(t)) dias=Math.floor((hoy-t)/86400000); }
      let aging="—";
      if(est==="emitida"){ aging = (dias==null||dias<=30)?"0–30": dias<=60?"31–60": dias<=90?"61–90":">90"; }
      return {
        _k:po.id,
        cliente:po.clienteId||"—", clienteLab:cli?.nombre||"— s/cliente —",
        estado:est, estadoLab:est,
        aging, agingLab:aging,
        _com:Number(po.totalComisionUSD)||0,
      };
    });

    return {
      liq:{ id:"liq", lab:"💰 Liquidaciones", nota:"1 fila = 1 liquidación", rows:liqRows,
        dims:[
          {key:"especie",lab:"Especie"},{key:"cliente",lab:"Cliente"},{key:"exportadora",lab:"Exportadora"},
          {key:"mercado",lab:"Mercado"},{key:"pais",lab:"País"},{key:"via",lab:"Vía"},
          {key:"estado",lab:"Estado"},{key:"temporada",lab:"Temporada"},{key:"mes",lab:"Mes (liq.)"},
        ],
        measures:[
          {key:"com",lab:"Comisión Frisku (USD)",fmt:fmtUSD0,calc:rs=>sum(rs,"_com")},
          {key:"venta",lab:"Venta destino (USD)",fmt:fmtUSD0,calc:rs=>sum(rs,"_venta")},
          {key:"fob",lab:"FOB (USD)",fmt:fmtUSD0,calc:rs=>sum(rs,"_fob")},
          {key:"cajas",lab:"Cajas vendidas",fmt:fmtN0,calc:rs=>sum(rs,"_cajas")},
          {key:"nliq",lab:"N° liquidaciones",fmt:fmtN0,calc:rs=>rs.length},
          {key:"nemb",lab:"N° embarques",fmt:fmtN0,calc:rs=>new Set(rs.map(r=>r.oeId).filter(Boolean)).size},
          {key:"precio",lab:"Precio USD/caja",fmt:fmtUSD2,calc:rs=>{const c=sum(rs,"_cajas");return c>0?sum(rs,"_venta")/c:0;}},
          {key:"pctfob",lab:"% comisión s/FOB",fmt:v=>`${(Number(v)||0).toFixed(1)}%`,calc:rs=>{const f=sum(rs,"_fob");return f>0?sum(rs,"_com")/f*100:0;}},
        ] },
      emb:{ id:"emb", lab:"📦 Embarques (OE)", nota:"1 fila = 1 orden de embarque", rows:embRows,
        dims:[
          {key:"especie",lab:"Especie"},{key:"cliente",lab:"Cliente"},{key:"exportadora",lab:"Exportadora"},
          {key:"mercado",lab:"Mercado"},{key:"via",lab:"Vía"},{key:"estado",lab:"Estado"},
          {key:"temporada",lab:"Temporada"},{key:"origen",lab:"Origen"},{key:"destino",lab:"Destino"},
        ],
        measures:[
          {key:"noe",lab:"N° embarques (OE)",fmt:fmtN0,calc:rs=>rs.length},
          {key:"cajas",lab:"Cajas embarcadas",fmt:fmtN0,calc:rs=>sum(rs,"_cajas")},
          {key:"fcl",lab:"Contenedores (FCL)",fmt:fmtN0,calc:rs=>sum(rs,"_fcl")},
        ] },
      prog:{ id:"prog", lab:"🗓️ Programa", nota:"1 fila = 1 semana de programa", rows:progRows,
        dims:[
          {key:"especie",lab:"Especie"},{key:"cliente",lab:"Cliente"},{key:"exportadora",lab:"Exportadora"},
          {key:"via",lab:"Vía"},{key:"temporada",lab:"Temporada"},
        ],
        measures:[
          {key:"fcl",lab:"FCL programados",fmt:fmtN0,calc:rs=>sum(rs,"_fcl")},
          {key:"cajas",lab:"Cajas programadas",fmt:fmtN0,calc:rs=>sum(rs,"_cajas")},
          {key:"pallets",lab:"Pallets programados",fmt:fmtN0,calc:rs=>sum(rs,"_pallets")},
          {key:"nsem",lab:"N° semanas-programa",fmt:fmtN0,calc:rs=>rs.length},
        ] },
      po:{ id:"po", lab:"🧾 Cobranza (PO)", nota:"1 fila = 1 nota de cobro", rows:poRows,
        dims:[
          {key:"cliente",lab:"Cliente"},{key:"estado",lab:"Estado"},{key:"aging",lab:"Aging"},
        ],
        measures:[
          {key:"com",lab:"Comisión PO (USD)",fmt:fmtUSD0,calc:rs=>sum(rs,"_com")},
          {key:"npo",lab:"N° PO",fmt:fmtN0,calc:rs=>rs.length},
        ] },
    };
  },[liquidaciones, embarques, clientes, exportadoras, especies, mercados, programa, contratos, pos]);

  const fuente = FUENTES[fuenteId] || FUENTES.liq;
  const dims = fuente.dims;
  const measures = fuente.measures;

  // Clamp de selección al cambiar de fuente (dims/medidas válidas).
  useEffect(()=>{
    const mOk = measures.some(m=>m.key===measureId);
    if(!mOk) setMeasureId(measures[0].key);
    if(!dims.some(d=>d.key===dim1)) setDim1(dims[0].key);
    if(dim2 && !dims.some(d=>d.key===dim2)) setDim2("");
    // No se limpia la selección al cambiar de fuente: es compartida y global (Qlik).
  // eslint-disable-next-line
  },[fuenteId]);

  const measure = measures.find(m=>m.key===measureId) || measures[0];
  const measFmt = measure.fmt;
  const d1 = dims.find(d=>d.key===dim1) || dims[0];
  const d2 = dim2 ? dims.find(d=>d.key===dim2) : null;
  const labField = (dk)=> dk+"Lab";

  // ── Filtros asociativos (motor compartido del provider) ──
  const toggle = biCtx.toggle;
  const quitar = biCtx.remove;
  const limpiar = biCtx.clearAll;
  const matchRow = (row, except)=> dims.every(d=>{ if(d.key===except) return true; const s=sel[d.key]; if(!s||!s.size) return true; return s.has(row[d.key]); });
  const labelOf = (dk, v)=>{ const h=fuente.rows.find(r=>r[dk]===v); return h? h[labField(dk)] : v; };

  const filteredRows = useMemo(()=> fuente.rows.filter(r=>matchRow(r,null)), [fuente, sel, dims]);
  const totalMeasure = measure.calc(filteredRows);

  // Orden natural para tendencia (mes por calendario agrícola, resto por medida).
  const ordenNatural = (arr, dk)=>{
    if(dk==="mes"){ const ord=MESES_TEMP.map(x=>x.m); return [...arr].sort((a,b)=>ord.indexOf(Number(a.val))-ord.indexOf(Number(b.val))); }
    if(dk==="aging"){ const ord=["0–30","31–60","61–90",">90","—"]; return [...arr].sort((a,b)=>ord.indexOf(a.val)-ord.indexOf(b.val)); }
    return [...arr].sort((a,b)=>b.m-a.m);
  };

  // Agregación asociativa por la dimensión primaria (posibles/excluidos + valor).
  const aggPrimary = useMemo(()=>{
    const rowsX = fuente.rows.filter(r=>matchRow(r, d1.key));
    const map = {};
    rowsX.forEach(r=>{ const v=r[d1.key]; (map[v]=map[v]||{val:v, lab:r[labField(d1.key)], rows:[]}).rows.push(r); });
    (sel[d1.key]?[...sel[d1.key]]:[]).forEach(v=>{ if(!map[v]) map[v]={val:v, lab:labelOf(d1.key,v), rows:[]}; });
    let arr = Object.values(map).map(g=>({...g, m:measure.calc(g.rows)}));
    arr = ordenNatural(arr, d1.key);
    const posSet = new Set(arr.map(x=>x.val));
    const excluded = [...new Set(fuente.rows.map(r=>r[d1.key]))].filter(v=>!posSet.has(v)).map(v=>({val:v, lab:labelOf(d1.key,v)}));
    return { arr, excluded, max:Math.max(1, ...arr.map(x=>Math.abs(x.m))) };
  },[fuente, sel, dim1, measureId, dims]);

  // Segmentos de la 2ª dimensión (para stacked / leyenda / pivote).
  const seg2 = useMemo(()=>{
    if(!d2) return { keys:[], colorDe:()=>C.blue };
    const tot={};
    filteredRows.forEach(r=>{ const v=r[d2.key]; tot[v]=(tot[v]||0)+ (measure.calc([r])||0); });
    const keys = Object.keys(tot).sort((a,b)=>tot[b]-tot[a]);
    const idx = Object.fromEntries(keys.map((k,i)=>[k,i]));
    return { keys, labDe:(v)=>labelOf(d2.key,v), colorDe:(v)=> PAL_BI[(idx[v]??0)%PAL_BI.length] };
  },[filteredRows, dim2, measureId]);

  const chips = dims.flatMap(d=> (sel[d.key]?[...sel[d.key]]:[]).map(v=>({dim:d.key, dimLab:d.lab, v, lab:labelOf(d.key,v)})));

  const kpiCard = (lab,val,color)=>(
    <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"10px 13px", boxShadow:C.shadowSm}}>
      <div style={{fontSize:10, color:C.muted, fontWeight:600, textTransform:"uppercase", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{lab}</div>
      <div style={{fontSize:19, fontWeight:800, color:color||C.text, marginTop:3, lineHeight:1}}>{val}</div>
    </div>
  );

  const hayDatos = (fuente.rows||[]).length>0;

  // ── Sub-vistas de visualización ──
  const groupRowsBy2 = (rows)=>{ const m={}; rows.forEach(r=>{ const v=d2?r[d2.key]:"_"; (m[v]=m[v]||[]).push(r); }); return m; };

  const VistaBarras = ()=>{
    const items = aggPrimary.arr.slice(0, topN);
    const selSet = sel[d1.key] || new Set();
    const hayFiltro = selSet.size>0;
    return (
      <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16, boxShadow:C.shadowSm}}>
        {items.length===0 && <div style={{color:C.muted2, fontSize:12, textAlign:"center", padding:20}}>Sin datos para la selección.</div>}
        {items.map(x=>{
          const isSel = selSet.has(x.val);
          const atten = hayFiltro && !isSel;
          const segs = d2 ? groupRowsBy2(x.rows) : null;
          const wpct = Math.abs(x.m)/aggPrimary.max*100;
          return (
            <div key={x.val} onClick={()=>toggle(d1.key,x.val)} title="Clic para filtrar"
              style={{display:"grid", gridTemplateColumns:"minmax(120px, 220px) 1fr auto", gap:10, alignItems:"center", cursor:"pointer", padding:"5px 4px", borderRadius:7, background:isSel?`${C.accent2}12`:"transparent"}}>
              <div style={{fontSize:12, color:isSel?C.accent2:C.text, fontWeight:isSel?700:500, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", opacity:atten?0.6:1}}>
                {isSel?"✓ ":""}{x.lab}
              </div>
              <div style={{height:15, borderRadius:5, background:C.cardAlt, overflow:"hidden", display:"flex", opacity:atten?0.55:1}}>
                {d2
                  ? seg2.keys.map(k=>{ const rs=segs[k]; if(!rs) return null; const mv=measure.calc(rs); const w=mv/aggPrimary.max*100; if(w<=0) return null; return <div key={k} title={`${seg2.labDe(k)}: ${measFmt(mv)}`} style={{width:`${w}%`, height:"100%", background:seg2.colorDe(k)}}/>; })
                  : <div style={{width:`${wpct}%`, height:"100%", background:isSel?C.accent2:C.blue, borderRadius:5}}/>}
              </div>
              <span style={{fontSize:12, fontWeight:700, color:isSel?C.accent2:C.text, minWidth:76, textAlign:"right"}}>{measFmt(x.m)}</span>
            </div>
          );
        })}
        {aggPrimary.arr.length>topN && <div style={{fontSize:11, color:C.muted2, marginTop:6, textAlign:"center"}}>+{aggPrimary.arr.length-topN} más · sube el Top N para verlos</div>}
        {d2 && seg2.keys.length>0 && (
          <div style={{display:"flex", flexWrap:"wrap", gap:8, marginTop:12, paddingTop:10, borderTop:`1px solid ${C.border}`}}>
            {seg2.keys.slice(0,12).map(k=>(
              <span key={k} style={{fontSize:10.5, color:C.text, display:"inline-flex", gap:5, alignItems:"center"}}>
                <span style={{width:10, height:10, borderRadius:3, background:seg2.colorDe(k)}}/>{seg2.labDe(k)}
              </span>
            ))}
          </div>
        )}
        {aggPrimary.excluded.length>0 && (
          <div style={{marginTop:12, paddingTop:8, borderTop:`1px dashed ${C.border}`, display:"flex", flexWrap:"wrap", gap:5, alignItems:"center"}}>
            <span style={{fontSize:10, color:C.muted2, fontWeight:600}}>Excluidos:</span>
            {aggPrimary.excluded.slice(0,14).map(x=>(
              <span key={x.val} onClick={()=>toggle(d1.key,x.val)} title="Clic para incluir"
                style={{fontSize:10, color:C.muted2, background:C.cardAlt, borderRadius:10, padding:"1px 8px", cursor:"pointer", textDecoration:"line-through"}}>{x.lab}</span>
            ))}
            {aggPrimary.excluded.length>14 && <span style={{fontSize:10, color:C.muted2}}>+{aggPrimary.excluded.length-14}</span>}
          </div>
        )}
      </div>
    );
  };

  const VistaTorta = ()=>{
    const items = aggPrimary.arr.filter(x=>x.m>0);
    const top = items.slice(0, topN);
    const restoM = items.slice(topN).reduce((s,x)=>s+x.m,0);
    const data = restoM>0 ? [...top, {val:"__resto__", lab:`Otros (${items.length-topN})`, m:restoM, resto:true}] : top;
    const tot = data.reduce((s,x)=>s+x.m,0) || 1;
    const R=70, r=42, cx=90, cy=90; let acc=0;
    const arc = (frac0, frac1)=>{ const a0=frac0*2*Math.PI-Math.PI/2, a1=frac1*2*Math.PI-Math.PI/2;
      const x0=cx+R*Math.cos(a0), y0=cy+R*Math.sin(a0), x1=cx+R*Math.cos(a1), y1=cy+R*Math.sin(a1);
      const xi1=cx+r*Math.cos(a1), yi1=cy+r*Math.sin(a1), xi0=cx+r*Math.cos(a0), yi0=cy+r*Math.sin(a0);
      const big=(frac1-frac0)>0.5?1:0;
      return `M ${x0} ${y0} A ${R} ${R} 0 ${big} 1 ${x1} ${y1} L ${xi1} ${yi1} A ${r} ${r} 0 ${big} 0 ${xi0} ${yi0} Z`; };
    return (
      <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16, boxShadow:C.shadowSm, display:"flex", gap:20, flexWrap:"wrap", alignItems:"center"}}>
        {data.length===0 ? <div style={{color:C.muted2, fontSize:12, padding:20}}>Sin datos para la selección.</div> : <>
        <svg width="180" height="180" viewBox="0 0 180 180" style={{flexShrink:0}}>
          {data.map((x,i)=>{ const f0=acc/tot, f1=(acc+x.m)/tot; acc+=x.m; const col=x.resto?C.muted2:PAL_BI[i%PAL_BI.length];
            return <path key={x.val} d={arc(f0,f1)} fill={col} stroke={C.card} strokeWidth="1.5" style={{cursor:x.resto?"default":"pointer"}} onClick={()=>!x.resto&&toggle(d1.key,x.val)}><title>{x.lab}: {measFmt(x.m)} ({(x.m/tot*100).toFixed(1)}%)</title></path>; })}
          <text x={cx} y={cy-4} textAnchor="middle" style={{fontSize:9, fill:C.muted, fontWeight:600}}>{measure.lab.split(" ")[0]}</text>
          <text x={cx} y={cy+11} textAnchor="middle" style={{fontSize:12, fill:C.text, fontWeight:800}}>{measFmt(tot)}</text>
        </svg>
        <div style={{flex:1, minWidth:200, display:"grid", gridTemplateColumns:"1fr 1fr", gap:"4px 14px"}}>
          {data.map((x,i)=>(
            <div key={x.val} onClick={()=>!x.resto&&toggle(d1.key,x.val)} style={{display:"flex", gap:7, alignItems:"center", fontSize:11.5, cursor:x.resto?"default":"pointer"}}>
              <span style={{width:11, height:11, borderRadius:3, background:x.resto?C.muted2:PAL_BI[i%PAL_BI.length], flexShrink:0}}/>
              <span style={{flex:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", color:C.text}}>{x.lab}</span>
              <span style={{fontWeight:700, color:C.muted}}>{(x.m/tot*100).toFixed(0)}%</span>
            </div>
          ))}
        </div></>}
      </div>
    );
  };

  const VistaTendencia = ()=>{
    const pts = aggPrimary.arr;   // ya viene en orden natural (mes/aging por calendario)
    if(pts.length===0) return <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:20, textAlign:"center", color:C.muted2, fontSize:12}}>Sin datos para la selección.</div>;
    const W=Math.max(320, pts.length*70), H=200, padL=8, padB=34, padT=14, padR=8;
    const maxV=Math.max(1,...pts.map(p=>p.m)), minV=Math.min(0,...pts.map(p=>p.m));
    const x=(i)=> padL + (pts.length===1?W/2:(i*(W-padL-padR)/(pts.length-1)));
    const y=(v)=> padT + (H-padT-padB) * (1-(v-minV)/((maxV-minV)||1));
    const line = pts.map((p,i)=>`${i===0?"M":"L"} ${x(i).toFixed(1)} ${y(p.m).toFixed(1)}`).join(" ");
    const area = `${line} L ${x(pts.length-1).toFixed(1)} ${y(minV).toFixed(1)} L ${x(0).toFixed(1)} ${y(minV).toFixed(1)} Z`;
    return (
      <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16, boxShadow:C.shadowSm, overflowX:"auto"}}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{maxWidth:"100%", minWidth:Math.min(W,320)}}>
          <path d={area} fill={`${C.blue}18`}/>
          <path d={line} fill="none" stroke={C.blue} strokeWidth="2.5" strokeLinejoin="round"/>
          {pts.map((p,i)=>{ const isSel=(sel[d1.key]||new Set()).has(p.val);
            return <g key={p.val} style={{cursor:"pointer"}} onClick={()=>toggle(d1.key,p.val)}>
              <circle cx={x(i)} cy={y(p.m)} r={isSel?6:4.5} fill={isSel?C.accent2:C.blue} stroke={C.card} strokeWidth="2"><title>{p.lab}: {measFmt(p.m)}</title></circle>
              <text x={x(i)} y={y(p.m)-9} textAnchor="middle" style={{fontSize:9.5, fill:C.text, fontWeight:700}}>{measFmt(p.m)}</text>
              <text x={x(i)} y={H-padB+16} textAnchor="middle" style={{fontSize:10, fill:C.muted}}>{String(p.lab).length>10?String(p.lab).slice(0,9)+"…":p.lab}</text>
            </g>; })}
        </svg>
      </div>
    );
  };

  const VistaTabla = ()=>{
    const rows = aggPrimary.arr;
    if(!d2){
      return (
        <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:14, boxShadow:C.shadowSm, overflowX:"auto"}}>
          <table style={{width:"100%", borderCollapse:"collapse", fontSize:12}}>
            <thead><tr style={{background:C.cardAlt}}>
              <th style={{textAlign:"left", padding:"8px 12px", fontWeight:700}}>{d1.lab}</th>
              <th style={{textAlign:"right", padding:"8px 12px", fontWeight:700}}>{measure.lab}</th>
              <th style={{textAlign:"right", padding:"8px 12px", fontWeight:700, width:70}}>%</th>
            </tr></thead>
            <tbody>
              {rows.map(x=>{ const isSel=(sel[d1.key]||new Set()).has(x.val);
                return <tr key={x.val} onClick={()=>toggle(d1.key,x.val)} style={{cursor:"pointer", borderTop:`1px solid ${C.border}`, background:isSel?`${C.accent2}10`:"transparent"}}>
                  <td style={{padding:"7px 12px", color:isSel?C.accent2:C.text, fontWeight:isSel?700:500}}>{isSel?"✓ ":""}{x.lab}</td>
                  <td style={{padding:"7px 12px", textAlign:"right", fontWeight:700}}>{measFmt(x.m)}</td>
                  <td style={{padding:"7px 12px", textAlign:"right", color:C.muted}}>{totalMeasure?((x.m/totalMeasure)*100).toFixed(1):"0"}%</td>
                </tr>; })}
              {rows.length===0 && <tr><td colSpan={3} style={{padding:20, textAlign:"center", color:C.muted2}}>Sin datos para la selección.</td></tr>}
            </tbody>
            {rows.length>0 && <tfoot><tr style={{background:C.cardAlt, fontWeight:800}}>
              <td style={{padding:"8px 12px"}}>TOTAL</td>
              <td style={{padding:"8px 12px", textAlign:"right"}}>{measFmt(totalMeasure)}</td>
              <td style={{padding:"8px 12px", textAlign:"right"}}>100%</td>
            </tr></tfoot>}
          </table>
        </div>
      );
    }
    // Pivote dim1 (filas) × dim2 (columnas)
    const cols = seg2.keys;
    return (
      <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:14, boxShadow:C.shadowSm, overflowX:"auto"}}>
        <table style={{width:"100%", borderCollapse:"collapse", fontSize:11.5, minWidth:480}}>
          <thead><tr style={{background:C.cardAlt}}>
            <th style={{textAlign:"left", padding:"8px 10px", fontWeight:700, position:"sticky", left:0, background:C.cardAlt}}>{d1.lab} \ {d2.lab}</th>
            {cols.map(c=><th key={c} style={{textAlign:"right", padding:"8px 10px", fontWeight:700, whiteSpace:"nowrap"}}>{seg2.labDe(c)}</th>)}
            <th style={{textAlign:"right", padding:"8px 10px", fontWeight:800}}>Total</th>
          </tr></thead>
          <tbody>
            {rows.map(x=>{ const byc=groupRowsBy2(x.rows);
              return <tr key={x.val} style={{borderTop:`1px solid ${C.border}`}}>
                <td onClick={()=>toggle(d1.key,x.val)} style={{padding:"6px 10px", fontWeight:600, cursor:"pointer", position:"sticky", left:0, background:C.card, whiteSpace:"nowrap"}}>{x.lab}</td>
                {cols.map(c=>{ const rs=byc[c]; const v=rs?measure.calc(rs):0; return <td key={c} style={{padding:"6px 10px", textAlign:"right", color:v?C.text:C.muted2}}>{v?measFmt(v):"·"}</td>; })}
                <td style={{padding:"6px 10px", textAlign:"right", fontWeight:700}}>{measFmt(x.m)}</td>
              </tr>; })}
            {rows.length===0 && <tr><td colSpan={cols.length+2} style={{padding:20, textAlign:"center", color:C.muted2}}>Sin datos para la selección.</td></tr>}
          </tbody>
        </table>
      </div>
    );
  };

  // ── Datos agregados (para tabla visible y export) ──
  const tablaAgg = ()=>{
    const rows = aggPrimary.arr;
    if(!d2){
      return { modo:"simple", headers:[d1.lab, measure.lab, "%"],
        rows: rows.map(x=>[x.lab, x.m, totalMeasure?x.m/totalMeasure*100:0]),
        total:["TOTAL", totalMeasure, 100] };
    }
    const cols = seg2.keys;
    return { modo:"pivote", headers:[`${d1.lab} \\ ${d2.lab}`, ...cols.map(c=>seg2.labDe(c)), "Total"],
      rows: rows.map(x=>{ const byc=groupRowsBy2(x.rows); return [x.lab, ...cols.map(c=>{const rs=byc[c]; return rs?measure.calc(rs):0;}), x.m]; }),
      total:["TOTAL", ...cols.map(c=>measure.calc(filteredRows.filter(r=>r[d2.key]===c))), totalMeasure] };
  };
  const esMoney = /USD|\$/.test(measure.lab);
  const filtrosTxt = chips.length ? chips.map(c=>`${c.dimLab}=${c.lab}`).join(", ") : "sin filtros";

  const exportBIExcel = async ()=>{
    try{
      const ExcelJS = await fr_loadExcelJS();
      const wb = new ExcelJS.Workbook(); wb.creator="Grupo Mediterra — Frisku Foods";
      const sub = `${fuente.lab.replace(/^\S+\s/,"")} · ${measure.lab} por ${d1.lab}${d2?` × ${d2.lab}`:""} · Filtros: ${filtrosTxt} · ${new Date().toLocaleDateString("es-CL")}`;
      const wsR = wb.addWorksheet("Resumen");
      fr_sheetTabla(wsR, { titulo:"FRISKU FOODS — BI", subtitulo:sub, headers:["Indicador","Valor"], colWidths:[36,20],
        rows: measures.map(m=>[m.lab, Math.round((m.calc(filteredRows))*100)/100]) });
      await fr_logoExcel(wb, wsR);
      const t = tablaAgg();
      const numCols = t.headers.map((_,i)=>i).filter(i=>i>0 && !(t.modo==="simple" && i===2));
      const ws = wb.addWorksheet("Detalle");
      fr_sheetTabla(ws, { titulo:"FRISKU FOODS — BI", subtitulo:sub, headers:t.headers,
        colWidths:t.headers.map((h,i)=>i===0?32:16), rows:t.rows, totalRow:t.total,
        moneyCols: esMoney?numCols:[], intCols: esMoney?[]:numCols });
      await fr_logoExcel(wb, ws);
      await fr_descargarWB(wb, `BI_Frisku_${d1.key}_${measure.key}.xlsx`);
    }catch(e){ console.error("[BI] Excel:",e); alert("No se pudo generar el Excel: "+e.message); }
  };

  const exportBIPDF = async ()=>{
    try{
      const JsPDF = await pl_loadJsPDF();
      const doc = new JsPDF({orientation:"landscape", unit:"mm", format:"a4"});
      const W=297, m=12;
      doc.setFillColor(30,39,97); doc.rect(0,0,W,26,"F");
      doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(14);
      doc.text("Frisku Foods — Explorador BI", m, 12);
      doc.setFont("helvetica","normal"); doc.setFontSize(9);
      doc.text(`${measure.lab} por ${d1.lab}${d2?` x ${d2.lab}`:""} · ${new Date().toLocaleDateString("es-CL")}`, m, 19);
      doc.setFontSize(7.5); doc.text(`Filtros: ${filtrosTxt}`.slice(0,140), m, 23.5);
      await fr_logoPDF(doc, W-m, 5, 42, 16);
      doc.autoTable({ startY:31, head:[["Indicador","Valor"]],
        body: measures.map(m2=>[m2.lab, m2.fmt(m2.calc(filteredRows))]),
        theme:"grid", styles:{fontSize:8}, headStyles:{fillColor:[30,39,97]}, tableWidth:110, margin:{left:m} });
      const t = tablaAgg();
      const fmtCell = (v,i)=> i===0?String(v):(typeof v==="number" ? (t.modo==="simple"&&i===2 ? (Number(v).toFixed(1)+"%") : (esMoney?fmtUSD0(v):fmtN0(v))) : String(v));
      doc.autoTable({ startY:31, head:[t.headers], body: t.rows.map(r=>r.map(fmtCell)),
        foot:[t.total.map(fmtCell)], theme:"striped", styles:{fontSize:7.5}, headStyles:{fillColor:[30,39,97]},
        footStyles:{fillColor:[220,227,240], textColor:20, fontStyle:"bold"}, margin:{left:m+114, right:m} });
      doc.save(`BI_Frisku_${d1.key}_${measure.key}.pdf`);
    }catch(e){ console.error("[BI] PDF:",e); alert("No se pudo generar el PDF: "+e.message); }
  };

  // ── Listbox asociativo (panel de filtros estilo Qlik) ──
  const ListBox = ({d})=>{
    const [q,setQ] = useState("");
    const selSet = sel[d.key] || new Set();
    const rowsX = fuente.rows.filter(r=>matchRow(r, d.key));
    const grp = {};
    rowsX.forEach(r=>{ const v=r[d.key]; (grp[v]=grp[v]||{val:v, lab:r[labField(d.key)], rows:[]}).rows.push(r); });
    const possible = Object.values(grp).map(g=>({val:g.val, lab:g.lab, m:measure.calc(g.rows)}));
    (selSet.size?[...selSet]:[]).forEach(v=>{ if(!grp[v]) possible.push({val:v, lab:labelOf(d.key,v), m:0}); });
    possible.sort((a,b)=>{ const as=selSet.has(a.val)?1:0, bs=selSet.has(b.val)?1:0; return bs-as || b.m-a.m; });
    const posSet = new Set(possible.map(x=>x.val));
    const allMap = {}; fuente.rows.forEach(r=>{ if(!(r[d.key] in allMap)) allMap[r[d.key]]=r[labField(d.key)]; });
    const excluded = Object.keys(allMap).filter(v=>!posSet.has(v)).map(v=>({val:v, lab:allMap[v]}));
    const qq=q.trim().toLowerCase(); const fil=(a)=> qq? a.filter(x=>String(x.lab).toLowerCase().includes(qq)) : a;
    const pos=fil(possible), exc=fil(excluded);
    return (
      <div style={{border:`1px solid ${C.border}`, borderRadius:10, background:C.card, marginBottom:8, boxShadow:C.shadowSm}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 9px", borderBottom:`1px solid ${C.border}`}}>
          <span style={{fontSize:11.5, fontWeight:700}}>{d.lab}{selSet.size>0 && <span style={{color:C.accent2}}> · {selSet.size}</span>}</span>
          {selSet.size>0 && <span onClick={()=>biCtx.clearDim(d.key)} title="Quitar selección" style={{fontSize:10, color:C.accent, cursor:"pointer", fontWeight:700}}>✕</span>}
        </div>
        <div style={{padding:"6px 7px 4px"}}>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar…" style={{...inputSt, width:"100%", padding:"3px 7px", fontSize:11}}/>
        </div>
        <div style={{maxHeight:168, overflowY:"auto", padding:"0 6px 6px"}}>
          {pos.map(x=>{ const isSel=selSet.has(x.val);
            return <div key={x.val} onClick={()=>toggle(d.key,x.val)} title="Clic para (de)seleccionar"
              style={{display:"flex", justifyContent:"space-between", gap:6, alignItems:"center", cursor:"pointer", padding:"3px 6px", borderRadius:5, background:isSel?C.accent2:"transparent", color:isSel?"#fff":C.text, marginBottom:1}}>
              <span style={{fontSize:11, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{isSel?"✓ ":""}{x.lab}</span>
              <span style={{fontSize:9.5, opacity:0.75, whiteSpace:"nowrap", fontWeight:600}}>{measFmt(x.m)}</span>
            </div>; })}
          {exc.slice(0,60).map(x=>(
            <div key={x.val} onClick={()=>toggle(d.key,x.val)} title="Excluido por la selección actual (clic para forzar)"
              style={{padding:"3px 6px", borderRadius:5, cursor:"pointer", color:C.muted2, background:C.cardAlt, marginBottom:1, opacity:0.7}}>
              <span style={{fontSize:11, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", textDecoration:"line-through", display:"block"}}>{x.lab}</span>
            </div>
          ))}
          {(pos.length+exc.length)===0 && <div style={{fontSize:10.5, color:C.muted2, textAlign:"center", padding:8}}>Sin valores</div>}
        </div>
      </div>
    );
  };

  const gBtn = (activo)=>({ fontSize:11, padding:"6px 9px", borderRadius:7, cursor:"pointer", fontWeight:700,
    border:`1px solid ${activo?C.blue:C.border}`, background:activo?C.blue:C.card, color:activo?"#fff":C.muted });

  // ── Modo workspace (chromeless): config al panel; canvas = SOLO el gráfico ──
  const pLbl = {fontSize:10,fontWeight:800,color:C.muted,textTransform:"uppercase",letterSpacing:0.4,margin:"2px 0 5px"};
  const controls = (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div><div style={pLbl}>Fuente de datos</div><select value={fuenteId} onChange={e=>setFuenteId(e.target.value)} style={{...inputSt,width:"100%",fontWeight:700}}>{Object.values(FUENTES).map(f=><option key={f.id} value={f.id}>{f.lab}</option>)}</select></div>
      <div><div style={pLbl}>Medir</div><select value={measureId} onChange={e=>setMeasureId(e.target.value)} style={{...inputSt,width:"100%"}}>{measures.map(m=><option key={m.key} value={m.key}>{m.lab}</option>)}</select></div>
      <div><div style={pLbl}>Ver por</div><select value={dim1} onChange={e=>setDim1(e.target.value)} style={{...inputSt,width:"100%"}}>{dims.map(d=><option key={d.key} value={d.key}>{d.lab}</option>)}</select></div>
      <div><div style={pLbl}>Desglosar por</div><select value={dim2} onChange={e=>setDim2(e.target.value)} style={{...inputSt,width:"100%"}}><option value="">— (ninguno)</option>{dims.filter(d=>d.key!==dim1).map(d=><option key={d.key} value={d.key}>{d.lab}</option>)}</select></div>
      {(chart==="barras"||chart==="torta") && <div><div style={pLbl}>Top N</div><select value={topN} onChange={e=>setTopN(Number(e.target.value))} style={{...inputSt,width:96}}>{[6,8,10,12,15,20,30].map(n=><option key={n} value={n}>{n}</option>)}</select></div>}
      <div style={{fontSize:10.5,color:C.muted2}}>{fuente.nota} · {fuente.rows.length} registros{d2?` · desglose por ${d2.lab.toLowerCase()}`:""}</div>
    </div>
  );
  useExportTrigger(exportReq, {excel:exportBIExcel, pdf:exportBIPDF});
  if(chromeless){
    return (<>
      {panelEl && createPortal(controls, panelEl)}
      {!hayDatos
        ? <div style={{padding:40,textAlign:"center",color:C.muted,fontSize:13,border:`1px solid ${C.border}`,borderRadius:10}}>Aún no hay datos en <b>{fuente.lab}</b>. Elige otra fuente en el panel de propiedades.</div>
        : <div>
            {chart==="barras"     && <VistaBarras/>}
            {chart==="torta"      && <VistaTorta/>}
            {chart==="tendencia"  && <VistaTendencia/>}
            {chart==="tabla"      && <VistaTabla/>}
            <div style={{fontSize:11,color:C.muted2,marginTop:12,textAlign:"center"}}>Explorador · {filteredRows.length} de {fuente.rows.length} registros en la selección · midiendo <b>{measure.lab}</b> por <b>{d1.lab}</b>{d2?` × ${d2.lab}`:""}. Verde = seleccionado · tachado = excluido.</div>
          </div>}
      <FullscreenBI open={!!fullscreen} onClose={onExitFull} title={`Explorador · ${measure.lab} por ${d1.lab}${d2?` × ${d2.lab}`:""}`}>
        {chart==="barras"     && <VistaBarras/>}
        {chart==="torta"      && <VistaTorta/>}
        {chart==="tendencia"  && <VistaTendencia/>}
        {chart==="tabla"      && <VistaTabla/>}
      </FullscreenBI>
    </>);
  }

  return (
    <div>
      {/* ── Barra de configuración: fuente / medida / dims / gráfico / export ── */}
      <div style={{background:C.card2, border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 12px", marginBottom:12}}>
        <div style={{display:"flex", gap:12, flexWrap:"wrap", alignItems:"flex-end"}}>
          <div>
            <div style={lblSt}>Fuente de datos</div>
            <select value={fuenteId} onChange={e=>setFuenteId(e.target.value)} style={{...inputSt, minWidth:180, fontWeight:700}}>
              {Object.values(FUENTES).map(f=><option key={f.id} value={f.id}>{f.lab}</option>)}
            </select>
          </div>
          <div>
            <div style={lblSt}>Medir</div>
            <select value={measureId} onChange={e=>setMeasureId(e.target.value)} style={{...inputSt, minWidth:190}}>
              {measures.map(m=><option key={m.key} value={m.key}>{m.lab}</option>)}
            </select>
          </div>
          <div>
            <div style={lblSt}>Ver por</div>
            <select value={dim1} onChange={e=>setDim1(e.target.value)} style={{...inputSt, minWidth:150}}>
              {dims.map(d=><option key={d.key} value={d.key}>{d.lab}</option>)}
            </select>
          </div>
          <div>
            <div style={lblSt}>Desglosar por</div>
            <select value={dim2} onChange={e=>setDim2(e.target.value)} style={{...inputSt, minWidth:150}}>
              <option value="">— (ninguno)</option>
              {dims.filter(d=>d.key!==dim1).map(d=><option key={d.key} value={d.key}>{d.lab}</option>)}
            </select>
          </div>
          <div>
            <div style={lblSt}>Gráfico</div>
            <div style={{display:"flex", gap:4}}>
              {[{k:"barras",i:"▦ Barras"},{k:"tabla",i:"▤ Tabla"},{k:"torta",i:"◔ Torta"},{k:"tendencia",i:"📈 Tendencia"}].map(g=>(
                <button key={g.k} onClick={()=>setChart(g.k)} style={gBtn(chart===g.k)}>{g.i}</button>
              ))}
            </div>
          </div>
          {(chart==="barras"||chart==="torta") && (
            <div>
              <div style={lblSt}>Top N</div>
              <select value={topN} onChange={e=>setTopN(Number(e.target.value))} style={{...inputSt, width:76}}>
                {[6,8,10,12,15,20,30].map(n=><option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          )}
          <div style={{marginLeft:"auto"}}>
            <div style={lblSt}>Objeto</div>
            <div style={{display:"flex", gap:5}}>
              <button onClick={()=>setFull(true)} disabled={!hayDatos} title="Pantalla completa de la visualización" style={{...btnSt(C.blue,true), fontSize:11, padding:"6px 10px", opacity:hayDatos?1:0.5}}>⛶ Ampliar</button>
              <button onClick={exportBIExcel} disabled={!hayDatos} title="Excel de la vista actual (con logo)" style={{...btnSt(C.green), fontSize:11, padding:"6px 10px", opacity:hayDatos?1:0.5}}>⬇ Excel</button>
              <button onClick={exportBIPDF} disabled={!hayDatos} title="PDF de la vista actual (con logo)" style={{...btnSt(C.accent), fontSize:11, padding:"6px 10px", opacity:hayDatos?1:0.5}}>⬇ PDF</button>
            </div>
          </div>
        </div>
        <div style={{fontSize:11, color:C.muted2, marginTop:8}}>{fuente.nota} · {fuente.rows.length} registros en total{d2?` · desglose por ${d2.lab.toLowerCase()}`:""}</div>
      </div>

      {!hayDatos ? (
        <div style={{padding:50, textAlign:"center", color:C.muted, fontSize:13, background:C.card, borderRadius:14}}>
          Aún no hay datos en <b>{fuente.lab}</b>. Elige otra fuente o carga registros en el módulo.
        </div>
      ) : <>

      {/* ── Selecciones activas (breadcrumb) ── */}
      <div style={{display:"flex", gap:8, marginBottom:12, flexWrap:"wrap", alignItems:"center", minHeight:30}}>
        <span style={{fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase"}}>Selecciones:</span>
        {chips.length===0 ? <span style={{fontSize:11.5, color:C.muted2}}>Ninguna. Usa el panel de filtros de la izquierda o haz clic en el gráfico (se combinan, estilo Qlik).</span> :
          chips.map((c,i)=>(
            <span key={i} onClick={()=>quitar(c.dim,c.v)} title="Quitar"
              style={{fontSize:11, fontWeight:600, background:C.accent2, color:"#fff", borderRadius:14, padding:"3px 10px", cursor:"pointer", display:"inline-flex", gap:6, alignItems:"center"}}>
              <span style={{opacity:0.8, fontWeight:400}}>{c.dimLab}:</span>{c.lab}<span style={{opacity:0.85}}>×</span>
            </span>
          ))}
        {chips.length>0 && <button onClick={limpiar} style={{...btnSt(C.muted,true), fontSize:10, padding:"3px 8px"}}>Limpiar todo</button>}
      </div>

      {/* ── KPIs de todas las medidas de la fuente (sobre la selección) ── */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(140px,1fr))", gap:10, marginBottom:14}}>
        {measures.map((m,i)=> kpiCard(m.lab, m.fmt(m.calc(filteredRows)), m.key===measureId?C.accent2:(i===0?C.blue:C.text)))}
      </div>

      {/* ── Layout Qlik: panel de filtros (listboxes) + visualización ── */}
      <div style={{display:"grid", gridTemplateColumns:"minmax(0, 250px) minmax(0, 1fr)", gap:14, alignItems:"start"}}>
        <div>
          <div style={{fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase", marginBottom:6}}>Panel de filtros</div>
          {dims.map(d=><ListBox key={d.key} d={d}/>)}
        </div>
        <div>
          {chart==="barras"     && <VistaBarras/>}
          {chart==="tabla"      && <VistaTabla/>}
          {chart==="torta"      && <VistaTorta/>}
          {chart==="tendencia"  && <VistaTendencia/>}
          <div style={{fontSize:11, color:C.muted2, marginTop:14, textAlign:"center"}}>
            Explorador BI · {filteredRows.length} de {fuente.rows.length} registros en la selección · midiendo <b>{measure.lab}</b> por <b>{d1.lab}</b>{d2?` × ${d2.lab}`:""}.
            Verde = seleccionado · tachado = excluido por la combinación actual.
          </div>
        </div>
      </div>
      </>}
      <FullscreenBI open={full} onClose={()=>setFull(false)}
        title={`Explorador · ${measure.lab} por ${d1.lab}${d2?` × ${d2.lab}`:""}`}>
        {chart==="barras"     && <VistaBarras/>}
        {chart==="tabla"      && <VistaTabla/>}
        {chart==="torta"      && <VistaTorta/>}
        {chart==="tendencia"  && <VistaTendencia/>}
      </FullscreenBI>
    </div>
  );
}

function ReportesTab({ liquidaciones, embarques, clientes, exportadoras, especies, mercados, paises, temporadas, programa, contratos, pos }) {
  const [rep, setRep]       = useState("ingreso");   // "ingreso" | "rentabilidad" | "fcl"
  const [groupBy, setGroupBy] = useState("especie"); // especie | mercado | cliente (reporte #2)
  const [fclGroup, setFclGroup] = useState("ambos"); // especie | cliente | ambos (reporte #3)
  const [estado, setEstado] = useState("");   // estado de LIQUIDACIÓN (distinto del estado de OE) — local
  // Filtros compartidos con el motor BI (misma selección que Resumen/Explorador):
  const biR = useFriskuBI();
  const oneR = (dim)=> biR.sel[dim] ? [...biR.sel[dim]][0] : "";
  const temp = oneR("temporada"), fExp = oneR("exportadora"), fCli = oneR("cliente"), fEsp = oneR("especie");
  const setTemp = (v)=>biR.setOne("temporada", v);
  const setFExp = (v)=>biR.setOne("exportadora", v);
  const setFCli = (v)=>biR.setOne("cliente", v);
  const setFEsp = (v)=>biR.setOne("especie", v);
  const [expPdf, setExpPdf] = useState(false);
  const [expXls, setExpXls] = useState(false);

  // Comisión Frisku en USD por liquidación (misma lógica que el KPI existente)
  // Definición ÚNICA de métricas (motor friskuBI). Reportes ya no redefine fórmulas.
  const comUSD = mComFriskuUSD, ventaUSD = mVentaUSD, fobUSDv = mFobUSD;
  const oeDe     = (liq) => embarques.find(e=>e.id===liq.oeId);

  // Temporadas presentes en las liquidaciones (para el selector)
  const tempsDisponibles = useMemo(()=>{
    const s = new Set();
    liquidaciones.forEach(l => { if(l.temporada) s.add(l.temporada); });
    return Array.from(s).sort().reverse();
  },[liquidaciones]);

  const liqs = useMemo(()=>liquidaciones.filter(l=>{
    if(temp   && l.temporada !== temp) return false;
    if(estado && (l.estado||"borrador") !== estado) return false;
    if(fExp || fCli || fEsp){
      const oe = embarques.find(e=>e.id===l.oeId);
      if(fExp && oe?.exportadoraId !== fExp) return false;
      if(fCli && oe?.clienteId     !== fCli) return false;
      if(fEsp && oe?.especieCodigo !== fEsp) return false;
    }
    return true;
  }),[liquidaciones, temp, estado, fExp, fCli, fEsp, embarques]);

  // ── KPIs ──
  const kpi = useMemo(()=>{
    let comision=0, venta=0, fob=0, cajas=0;
    const oes = new Set();
    liqs.forEach(l=>{
      comision += comUSD(l);
      venta    += ventaUSD(l);
      fob      += fobUSDv(l);
      cajas    += Number(l.cajasVendidas)||0;
      if(l.oeId) oes.add(l.oeId);
    });
    return {
      comision, venta, fob, cajas,
      nLiq: liqs.length,
      nEmb: oes.size,
      precioProm: cajas>0 ? venta/cajas : 0,
      pctFob: fob>0 ? comision/fob*100 : 0,
    };
  },[liqs]);

  // ── Por mes (temporada agrícola) ──
  const porMes = useMemo(()=>{
    const acc = Object.fromEntries(MESES_TEMP.map(x=>[x.m,0]));
    liqs.forEach(l=>{
      const mm = Number((l.fechaLiquidacion||"").slice(5,7));
      if(acc[mm] != null) acc[mm] += comUSD(l);
    });
    return MESES_TEMP.map(x=>({lab:x.lab, monto:acc[x.m]}));
  },[liqs]);
  const maxMes = Math.max(1, ...porMes.map(x=>x.monto));

  // ── Por especie ──
  const porEspecie = useMemo(()=>{
    const acc = {};
    liqs.forEach(l=>{
      const cod = oeDe(l)?.especieCodigo || "—";
      acc[cod] = (acc[cod]||0) + comUSD(l);
    });
    return Object.entries(acc)
      .map(([cod,monto])=>{ const e=especies.find(x=>x.codigo===cod); return {cod, monto, nombre:e?`${e.icono||""} ${e.nombreEs}`:cod, color:ESP_COLORS[cod]||C.blue}; })
      .filter(x=>x.monto>0).sort((a,b)=>b.monto-a.monto);
  },[liqs, especies, embarques]);

  // ── Por cliente ──
  const porCliente = useMemo(()=>{
    const acc = {};
    liqs.forEach(l=>{
      const cid = oeDe(l)?.clienteId || "—";
      acc[cid] = (acc[cid]||0) + comUSD(l);
    });
    return Object.entries(acc)
      .map(([cid,monto])=>{ const c=clientes.find(x=>x.id===cid); return {cid, monto, nombre:c?.nombre||"— sin cliente —"}; })
      .filter(x=>x.monto>0).sort((a,b)=>b.monto-a.monto);
  },[liqs, clientes, embarques]);

  const totalCom = kpi.comision || 1;
  const maxEsp = Math.max(1, ...porEspecie.map(x=>x.monto));
  const maxCli = Math.max(1, ...porCliente.map(x=>x.monto));
  const tituloTemp = temp || "todas las temporadas";

  // ── Detalle plano (para Excel) ──
  const detalle = useMemo(()=>liqs.map(l=>{
    const oe = oeDe(l);
    const esp = especies.find(x=>x.codigo===oe?.especieCodigo);
    const cli = clientes.find(x=>x.id===oe?.clienteId);
    const exp = exportadoras.find(x=>x.id===oe?.exportadoraId);
    return {
      fecha: l.fechaLiquidacion||"", temporada: l.temporada||"",
      oe: oe?.numero||"", estado: l.estado||"borrador",
      cliente: cli?.nombre||"", exportadora: exp?.nombre||"",
      especie: esp?.nombreEs||oe?.especieCodigo||"",
      cajasVend: Number(l.cajasVendidas)||0,
      ventaUSD: ventaUSD(l), fobUSD: fobUSDv(l),
      cliPct: Number(l.cliPct)||0, friPct: Number(l.friPct)||0,
      comisionUSD: comUSD(l),
    };
  }).sort((a,b)=>(b.fecha).localeCompare(a.fecha)),[liqs, especies, clientes, exportadoras, embarques]);

  // ── Reporte #2: Rentabilidad por especie / mercado / cliente ──
  const GROUP_LABEL = {especie:"especie", mercado:"mercado", cliente:"cliente"};
  const rentRows = useMemo(()=>{
    const acc = {};
    liqs.forEach(l=>{
      const oe = oeDe(l);
      let key, label;
      if(groupBy==="mercado"){
        const cli = clientes.find(c=>c.id===oe?.clienteId);
        const mc = cli?.mercadoCodigo || "";
        key = mc || "—";
        label = mercados.find(m=>m.codigo===mc)?.nombre || (cli?.pais ? `(${cli.pais})` : "— sin mercado —");
      } else if(groupBy==="cliente"){
        const cli = clientes.find(c=>c.id===oe?.clienteId);
        key = cli?.id || "—"; label = cli?.nombre || "— sin cliente —";
      } else {
        const cod = oe?.especieCodigo || "—";
        const e = especies.find(x=>x.codigo===cod);
        key = cod; label = e ? `${e.icono||""} ${e.nombreEs}` : cod;
      }
      const a = acc[key] || (acc[key] = {label, cajas:0, ventaUSD:0, comisionUSD:0, fobUSD:0, color: groupBy==="especie" ? (ESP_COLORS[key]||C.blue) : C.blue});
      a.cajas       += Number(l.cajasVendidas)||0;
      a.ventaUSD    += ventaUSD(l);
      a.comisionUSD += comUSD(l);
      a.fobUSD      += fobUSDv(l);
    });
    return Object.values(acc).map(a=>({
      ...a,
      precioCaja: a.cajas>0 ? a.ventaUSD/a.cajas : 0,
      pctFob:     a.fobUSD>0 ? a.comisionUSD/a.fobUSD*100 : 0,
    })).sort((x,y)=>y.comisionUSD-x.comisionUSD);
  },[liqs, groupBy, especies, clientes, mercados, embarques]);
  const maxPrecio = Math.max(1, ...rentRows.map(x=>x.precioCaja));

  // ── Reporte #3: Programa vs Real en FCL (contenedores) ──
  // Plan = FCL programados (frisku_programa.contenedoresFCL) por especie/cliente
  //   del Business Closure de cada semana.
  // Real = OEs marítimas embarcadas (cada OE marítima no cancelada = 1 FCL).
  const FCL_GLBL = {especie:"especie", cliente:"cliente", ambos:"especie y cliente"};
  const fclGlab = FCL_GLBL[fclGroup];
  const fclRows = useMemo(()=>{
    const plan = {}, real = {}, meta = {};
    const clave = (espCod, cliId) => {
      const esp = especies.find(x=>x.codigo===espCod);
      const cli = clientes.find(c=>c.id===cliId);
      const eLab = esp ? `${esp.icono||""} ${esp.nombreEs}` : (espCod||"—");
      const cLab = cli?.nombre || "— sin cliente —";
      if(fclGroup==="cliente") return { k: cliId||"—", label: cLab, ec:null };
      if(fclGroup==="ambos")   return { k:`${espCod||"—"}|${cliId||"—"}`, label:`${eLab} · ${cLab}`, ec:espCod };
      return { k: espCod||"—", label: eLab, ec:espCod };
    };
    (programa||[]).forEach(sem=>{
      if(sem.tipoEmbarque==="aereo") return; // FCL = solo marítimo
      const clo = (contratos||[]).find(c=>c.id===sem.closureId);
      if(temp && clo?.temporada && clo.temporada!==temp) return;
      if(fExp && clo?.exportadoraId!==fExp) return;
      if(fCli && clo?.clienteId!==fCli) return;
      if(fEsp && clo?.especieCodigo!==fEsp) return;
      const {k,label,ec} = clave(clo?.especieCodigo, clo?.clienteId);
      plan[k] = (plan[k]||0) + (Number(sem.contenedoresFCL)||0);
      if(!meta[k]) meta[k] = { label, color: ec ? (ESP_COLORS[ec]||C.blue) : C.blue };
    });
    (embarques||[]).forEach(oe=>{
      if((oe.estado||"borrador")==="cancelado") return;
      if(oe.tipoEmbarque && oe.tipoEmbarque!=="maritimo") return; // FCL = marítimo
      if(temp && oe.temporada && oe.temporada!==temp) return;
      if(fExp && oe.exportadoraId!==fExp) return;
      if(fCli && oe.clienteId!==fCli) return;
      if(fEsp && oe.especieCodigo!==fEsp) return;
      const {k,label,ec} = clave(oe.especieCodigo, oe.clienteId);
      real[k] = (real[k]||0) + 1;
      if(!meta[k]) meta[k] = { label, color: ec ? (ESP_COLORS[ec]||C.blue) : C.blue };
    });
    const keys = new Set([...Object.keys(plan), ...Object.keys(real)]);
    return Array.from(keys).map(k=>{
      const p = plan[k]||0, r = real[k]||0;
      return { cod:k, nombre:meta[k]?.label||k, color:meta[k]?.color||C.blue,
               plan:p, real:r, brecha:r-p, cumpl: p>0 ? r/p*100 : (r>0?100:0) };
    }).filter(x=>x.plan>0||x.real>0).sort((a,b)=>(b.plan-a.plan)||(b.real-a.real));
  },[programa, contratos, embarques, especies, clientes, temp, fclGroup, fExp, fCli, fEsp]);
  const fclTot = useMemo(()=>{
    const plan = fclRows.reduce((s,x)=>s+x.plan,0);
    const real = fclRows.reduce((s,x)=>s+x.real,0);
    return { plan, real, brecha:real-plan, cumpl: plan>0 ? real/plan*100 : (real>0?100:0) };
  },[fclRows]);
  const maxFcl = Math.max(1, ...fclRows.map(x=>Math.max(x.plan,x.real)));

  // ── Reporte #4: Pipeline de embarques (operativo) ──
  const embFiltrados = useMemo(()=>(embarques||[]).filter(oe=>{
    if(temp && oe.temporada!==temp) return false;
    if(fExp && oe.exportadoraId!==fExp) return false;
    if(fCli && oe.clienteId!==fCli) return false;
    if(fEsp && oe.especieCodigo!==fEsp) return false;
    return true;
  }),[embarques, temp, fExp, fCli, fEsp]);
  const PIPE_ESTADOS = [
    {id:"borrador",   lab:"Borrador",   color:C.muted2},
    {id:"confirmado", lab:"Confirmado", color:C.blue},
    {id:"despachado", lab:"Despachado", color:C.green},
    {id:"cancelado",  lab:"Cancelado",  color:C.accent},
  ];
  const pipe = useMemo(()=>{
    const est = {borrador:0, confirmado:0, despachado:0, cancelado:0};
    let maritimo=0, aereo=0, fcl=0, cajas=0;
    embFiltrados.forEach(oe=>{
      const e = oe.estado||"borrador"; est[e] = (est[e]||0)+1;
      const via = oe.tipoEmbarque||"maritimo";
      if(via==="aereo") aereo++; else maritimo++;
      if(via!=="aereo" && e!=="cancelado") fcl++;
      cajas += Object.values(oe.cajasPorFormato||{}).reduce((s,v)=>s+Number(v||0),0);
    });
    return { est, maritimo, aereo, fcl, cajas, total:embFiltrados.length };
  },[embFiltrados]);
  const proximos = useMemo(()=>embFiltrados
    .filter(oe=>(oe.estado||"borrador")!=="cancelado")
    .map(oe=>{
      const cli = clientes.find(c=>c.id===oe.clienteId);
      const exp = exportadoras.find(x=>x.id===oe.exportadoraId);
      const esp = especies.find(x=>x.codigo===oe.especieCodigo);
      return {
        numero: oe.numero||"—", temporada:oe.temporada||"",
        cliente: cli?.nombre||"—", exportadora: exp?.nombre||"—",
        especie: esp?`${esp.icono||""} ${esp.nombreEs}`:(oe.especieCodigo||"—"),
        via: (oe.tipoEmbarque||"maritimo")==="aereo"?"Aéreo":"Marítimo",
        cont: oe.numeroContenedor||"—", origen:oe.origen||"—", destino:oe.destino||"—",
        etd: oe.fechaDespacho||"", eta: oe.fechaETA||"", estado: oe.estado||"borrador",
      };
    })
    .sort((a,b)=>(a.etd||"9999").localeCompare(b.etd||"9999")),
  [embFiltrados, clientes, exportadoras, especies]);
  const maxEst = Math.max(1, ...PIPE_ESTADOS.map(e=>pipe.est[e.id]||0));

  // ── Reporte #5: Ranking de exportadoras ──
  // Base = liquidaciones filtradas (respeta temporada + estado), enlazadas a
  // su OE para obtener la exportadora. Merma desde cajasMerma/cajasEmbarcadas.
  const expRows = useMemo(()=>{
    const acc = {};
    liqs.forEach(l=>{
      const oe = oeDe(l);
      const eid = oe?.exportadoraId || "—";
      const a = acc[eid] || (acc[eid]={comisionUSD:0, ventaUSD:0, cajasVend:0, cajasEmb:0, cajasMerma:0, oeIds:new Set()});
      a.comisionUSD += comUSD(l);
      a.ventaUSD    += ventaUSD(l);
      a.cajasVend   += Number(l.cajasVendidas)||0;
      a.cajasEmb    += Number(l.cajasEmbarcadas)||0;
      a.cajasMerma  += Number(l.cajasMerma)||0;
      if(l.oeId) a.oeIds.add(l.oeId);
    });
    return Object.entries(acc).map(([eid,a])=>{
      const exp = exportadoras.find(x=>x.id===eid);
      return {
        eid, nombre: exp?.nombre || "— sin exportadora —",
        comisionUSD:a.comisionUSD, ventaUSD:a.ventaUSD, cajasVend:a.cajasVend,
        pctMerma: a.cajasEmb>0 ? a.cajasMerma/a.cajasEmb*100 : 0,
        precioCaja: a.cajasVend>0 ? a.ventaUSD/a.cajasVend : 0,
        nEmb: a.oeIds.size,
      };
    }).filter(x=>x.comisionUSD>0||x.ventaUSD>0).sort((a,b)=>b.comisionUSD-a.comisionUSD);
  },[liqs, exportadoras, embarques]);
  const maxExpCom = Math.max(1, ...expRows.map(x=>x.comisionUSD));

  // ── Reporte #6: Cobranza / aging de comisión (PO) ──
  // Fact = PO (notas de cobro al cliente). Cobrado = pagada; por cobrar =
  // emitida; aging por días desde la fecha de emisión. Comisión en USD.
  const COBR_BUCKETS = [
    {id:"b1", lab:"0–30 días",  color:C.green},
    {id:"b2", lab:"31–60 días", color:C.yellow},
    {id:"b3", lab:"61–90 días", color:C.warning},
    {id:"b4", lab:">90 días",   color:C.accent},
  ];
  const cobr = useMemo(()=>{
    const diasDesde = (f)=>{ if(!f) return null; const t=new Date(f+"T00:00:00").getTime(); if(isNaN(t)) return null; return Math.floor((Date.now()-t)/86400000); };
    const est = {borrador:{n:0,usd:0}, emitida:{n:0,usd:0}, pagada:{n:0,usd:0}};
    const aging = {b1:0,b2:0,b3:0,b4:0};
    const porCli = {};
    let riesgo = 0;
    (pos||[]).forEach(po=>{
      if(fCli && po.clienteId!==fCli) return;
      const e = po.estado||"borrador";
      const usd = Number(po.totalComisionUSD)||0;
      if(!est[e]) est[e]={n:0,usd:0};
      est[e].n++; est[e].usd += usd;
      if(e==="emitida"){
        const d = diasDesde(po.fecha);
        if(d==null || d<=30) aging.b1+=usd;
        else if(d<=60) aging.b2+=usd;
        else if(d<=90) aging.b3+=usd;
        else aging.b4+=usd;
        if(d!=null && d>60) riesgo += usd;
        const cli = clientes.find(c=>c.id===po.clienteId);
        const k = po.clienteId||"—";
        porCli[k] = porCli[k] || {nombre:cli?.nombre||"— sin cliente —", usd:0, n:0, maxDias:0};
        porCli[k].usd += usd; porCli[k].n++;
        if(d!=null && d>porCli[k].maxDias) porCli[k].maxDias = d;
      }
    });
    return {
      est, aging, riesgo,
      porCliente: Object.values(porCli).sort((a,b)=>b.usd-a.usd),
      totalUSD: est.borrador.usd+est.emitida.usd+est.pagada.usd,
      cobrado: est.pagada.usd, porCobrar: est.emitida.usd, enBorrador: est.borrador.usd,
    };
  },[pos, clientes, fCli]);
  const cobrAgingTot = cobr.aging.b1+cobr.aging.b2+cobr.aging.b3+cobr.aging.b4;
  const maxCobrCli = Math.max(1, ...cobr.porCliente.map(x=>x.usd));

  // ── Export Excel (ExcelJS · con logo Frisku) ──
  const exportarExcel = async () => {
    setExpXls(true);
    try {
      const ExcelJS = await fr_loadExcelJS();
      const wb = new ExcelJS.Workbook();
      wb.creator = "Grupo Mediterra — Frisku Foods";
      const sub = `Ingreso Frisku por temporada · ${tituloTemp}${estado?" · "+estado:""} · ${new Date().toLocaleDateString("es-CL")}`;

      // Resumen (con logo)
      const wsR = wb.addWorksheet("Resumen");
      fr_sheetTabla(wsR, {
        titulo:"FRISKU FOODS", subtitulo:sub,
        headers:["Indicador","Valor"], colWidths:[30,22], moneyCols:[],
        rows:[
          ["Comisión Frisku (USD)", Math.round(kpi.comision)],
          ["Venta destino (USD)", Math.round(kpi.venta)],
          ["FOB (USD)", Math.round(kpi.fob)],
          ["Cajas vendidas", kpi.cajas],
          ["Precio prom. USD/caja", Number(kpi.precioProm.toFixed(2))],
          ["% efectivo s/FOB", Number(kpi.pctFob.toFixed(2))],
          ["N° liquidaciones", kpi.nLiq],
          ["N° embarques", kpi.nEmb],
        ],
      });
      wsR.getCell("B5").numFmt='$#,##0'; wsR.getCell("B6").numFmt='$#,##0'; wsR.getCell("B7").numFmt='$#,##0';
      wsR.getCell("B8").numFmt='#,##0'; wsR.getCell("B9").numFmt='$#,##0.00';
      await fr_logoExcel(wb, wsR);

      // Por mes
      fr_sheetTabla(wb.addWorksheet("Por mes"), {
        titulo:"Comisión Frisku por mes", subtitulo:sub,
        headers:["Mes","Comisión Frisku (USD)"], colWidths:[12,24], moneyCols:[1],
        rows: porMes.map(x=>[x.lab, Math.round(x.monto)]),
        totalRow:["TOTAL", Math.round(kpi.comision)],
      });
      // Por especie
      fr_sheetTabla(wb.addWorksheet("Por especie"), {
        titulo:"Comisión por especie", subtitulo:sub,
        headers:["Especie","Comisión (USD)","% del total"], colWidths:[24,18,12], moneyCols:[1],
        rows: porEspecie.map(x=>[x.nombre, Math.round(x.monto), Number((x.monto/totalCom*100).toFixed(1))]),
      });
      // Por cliente
      fr_sheetTabla(wb.addWorksheet("Por cliente"), {
        titulo:"Comisión por cliente", subtitulo:sub,
        headers:["Cliente","Comisión (USD)","% del total"], colWidths:[30,18,12], moneyCols:[1],
        rows: porCliente.map(x=>[x.nombre, Math.round(x.monto), Number((x.monto/totalCom*100).toFixed(1))]),
      });
      // Detalle
      fr_sheetTabla(wb.addWorksheet("Detalle"), {
        titulo:"Detalle de liquidaciones", subtitulo:sub,
        headers:["Fecha","Temp.","OE","Estado","Cliente","Exportadora","Especie","Cajas vend.","Venta USD","FOB USD","Cli %","Frisku %","Comisión USD"],
        colWidths:[11,10,12,10,22,22,14,11,12,12,7,9,13], moneyCols:[8,9,12], intCols:[7],
        rows: detalle.map(d=>[d.fecha,d.temporada,d.oe,d.estado,d.cliente,d.exportadora,d.especie,d.cajasVend,Math.round(d.ventaUSD),Math.round(d.fobUSD),d.cliPct,d.friPct,Math.round(d.comisionUSD)]),
      });

      await fr_descargarWB(wb, `Frisku_IngresoTemporada_${(temp||"todas").replace(/\W+/g,"-")}_${new Date().toISOString().slice(0,10)}.xlsx`);
    } catch(e){ console.error("[Reportes] Excel:",e); alert("No se pudo generar el Excel: "+e.message); }
    setExpXls(false);
  };

  // ── Export PDF (jsPDF + autoTable) ──
  const exportarPDF = async () => {
    setExpPdf(true);
    try {
      const JsPDF = await pl_loadJsPDF();
      const doc = new JsPDF({orientation:"portrait", unit:"mm", format:"a4"});
      const W=210, m=14;
      doc.setFillColor(30,39,97); doc.rect(0,0,W,26,"F");
      await fr_logoPDF(doc, W-m, 5, 46, 16);
      doc.setTextColor(255,255,255); doc.setFontSize(15); doc.setFont("helvetica","bold");
      doc.text("Frisku · Ingreso por temporada",m,12);
      doc.setFontSize(9); doc.setFont("helvetica","normal");
      doc.text(`Temporada: ${tituloTemp}${estado?" · Estado: "+estado:""} · ${new Date().toLocaleDateString("es-CL")}`,m,19);

      // KPIs
      doc.autoTable({
        startY:32, theme:"grid",
        headStyles:{fillColor:[45,58,82],textColor:255,fontStyle:"bold",fontSize:8},
        styles:{fontSize:9,cellPadding:2.5},
        head:[["Indicador","Valor","Indicador","Valor"]],
        body:[
          ["Comisión Frisku", fmtUSD0(kpi.comision), "Venta destino", fmtUSD0(kpi.venta)],
          ["FOB", fmtUSD0(kpi.fob), "% efectivo s/FOB", kpi.pctFob.toFixed(2)+"%"],
          ["Cajas vendidas", fmtN0(kpi.cajas), "Precio prom./caja", fmtUSD2(kpi.precioProm)],
          ["N° liquidaciones", String(kpi.nLiq), "N° embarques", String(kpi.nEmb)],
        ],
        margin:{left:m,right:m},
      });
      let y = doc.lastAutoTable.finalY + 6;

      doc.setTextColor(30,39,97); doc.setFontSize(10); doc.setFont("helvetica","bold");
      doc.text("Comisión por especie",m,y); y+=2;
      doc.autoTable({
        startY:y, theme:"striped",
        headStyles:{fillColor:[15,118,110],textColor:255,fontSize:8},
        styles:{fontSize:8,cellPadding:2},
        head:[["Especie","Comisión USD","% total"]],
        body: porEspecie.length ? porEspecie.map(x=>[x.nombre, fmtUSD0(x.monto), (x.monto/totalCom*100).toFixed(1)+"%"]) : [["Sin datos","",""]],
        columnStyles:{1:{halign:"right"},2:{halign:"right"}}, margin:{left:m,right:m},
      });
      y = doc.lastAutoTable.finalY + 6;

      doc.setTextColor(30,39,97); doc.setFontSize(10); doc.setFont("helvetica","bold");
      doc.text("Top clientes por comisión",m,y); y+=2;
      doc.autoTable({
        startY:y, theme:"striped",
        headStyles:{fillColor:[30,39,97],textColor:255,fontSize:8},
        styles:{fontSize:8,cellPadding:2},
        head:[["Cliente","Comisión USD","% total"]],
        body: porCliente.length ? porCliente.slice(0,12).map(x=>[x.nombre, fmtUSD0(x.monto), (x.monto/totalCom*100).toFixed(1)+"%"]) : [["Sin datos","",""]],
        columnStyles:{1:{halign:"right"},2:{halign:"right"}}, margin:{left:m,right:m},
      });

      doc.save(`Frisku_IngresoTemporada_${(temp||"todas").replace(/\W+/g,"-")}_${new Date().toISOString().slice(0,10)}.pdf`);
    } catch(e){ console.error("[Reportes] PDF:",e); alert("No se pudo generar el PDF: "+e.message); }
    setExpPdf(false);
  };

  // ── Export reporte #2 (Rentabilidad) → Excel (ExcelJS · con logo) ──
  const exportarRentExcel = async () => {
    setExpXls(true);
    try {
      const ExcelJS = await fr_loadExcelJS();
      const wb = new ExcelJS.Workbook();
      wb.creator = "Grupo Mediterra — Frisku Foods";
      const g = GROUP_LABEL[groupBy], G = g.charAt(0).toUpperCase()+g.slice(1);
      const sub = `Rentabilidad por ${g} · ${tituloTemp}${estado?" · "+estado:""} · ${new Date().toLocaleDateString("es-CL")}`;
      const ws = wb.addWorksheet(`Por ${g}`);
      fr_sheetTabla(ws, {
        titulo:"FRISKU FOODS", subtitulo:sub,
        headers:[G,"Cajas vendidas","Venta USD","Comisión Frisku USD","Precio USD/caja","% s/FOB"],
        colWidths:[28,15,14,20,15,10], moneyCols:[2,3], intCols:[1],
        rows: rentRows.map(x=>[x.label, x.cajas, Math.round(x.ventaUSD), Math.round(x.comisionUSD), Number(x.precioCaja.toFixed(2)), Number(x.pctFob.toFixed(2))]),
        totalRow:["TOTAL", kpi.cajas, Math.round(kpi.venta), Math.round(kpi.comision), Number(kpi.precioProm.toFixed(2)), Number(kpi.pctFob.toFixed(2))],
      });
      // formato USD/caja (col 5 = índice 4)
      for(let r=5;r<=5+rentRows.length;r++){ ws.getCell(r,5).numFmt='$#,##0.00'; }
      await fr_logoExcel(wb, ws);
      await fr_descargarWB(wb, `Frisku_Rentabilidad_${g}_${(temp||"todas").replace(/\W+/g,"-")}_${new Date().toISOString().slice(0,10)}.xlsx`);
    } catch(e){ console.error("[Reportes] Excel rent:",e); alert("No se pudo generar el Excel: "+e.message); }
    setExpXls(false);
  };

  // ── Export reporte #2 (Rentabilidad) → PDF ──
  const exportarRentPDF = async () => {
    setExpPdf(true);
    try {
      const JsPDF = await pl_loadJsPDF();
      const doc = new JsPDF({orientation:"portrait", unit:"mm", format:"a4"});
      const W=210, m=14, g=GROUP_LABEL[groupBy];
      doc.setFillColor(30,39,97); doc.rect(0,0,W,26,"F");
      await fr_logoPDF(doc, W-m, 5, 46, 16);
      doc.setTextColor(255,255,255); doc.setFontSize(15); doc.setFont("helvetica","bold");
      doc.text(`Frisku · Rentabilidad por ${g}`,m,12);
      doc.setFontSize(9); doc.setFont("helvetica","normal");
      doc.text(`Temporada: ${tituloTemp}${estado?" · Estado: "+estado:""} · ${new Date().toLocaleDateString("es-CL")}`,m,19);
      doc.autoTable({
        startY:32, theme:"striped",
        headStyles:{fillColor:[15,118,110],textColor:255,fontSize:8},
        styles:{fontSize:8,cellPadding:2},
        footStyles:{fillColor:[234,238,244],textColor:30,fontStyle:"bold"},
        head:[[g.charAt(0).toUpperCase()+g.slice(1),"Cajas","Venta USD","Comisión USD","USD/caja","% s/FOB"]],
        body: rentRows.length ? rentRows.map(x=>[x.label, fmtN0(x.cajas), fmtUSD0(x.ventaUSD), fmtUSD0(x.comisionUSD), fmtUSD2(x.precioCaja), x.pctFob.toFixed(1)+"%"]) : [["Sin datos","","","","",""]],
        foot: [["TOTAL", fmtN0(kpi.cajas), fmtUSD0(kpi.venta), fmtUSD0(kpi.comision), fmtUSD2(kpi.precioProm), kpi.pctFob.toFixed(1)+"%"]],
        columnStyles:{1:{halign:"right"},2:{halign:"right"},3:{halign:"right"},4:{halign:"right"},5:{halign:"right"}},
        margin:{left:m,right:m},
      });
      doc.save(`Frisku_Rentabilidad_${g}_${(temp||"todas").replace(/\W+/g,"-")}_${new Date().toISOString().slice(0,10)}.pdf`);
    } catch(e){ console.error("[Reportes] PDF rent:",e); alert("No se pudo generar el PDF: "+e.message); }
    setExpPdf(false);
  };

  // ── Export reporte #3 (Programa vs Real FCL) → Excel ──
  const exportarFclExcel = async () => {
    setExpXls(true);
    try {
      const ExcelJS = await fr_loadExcelJS();
      const wb = new ExcelJS.Workbook();
      wb.creator = "Grupo Mediterra — Frisku Foods";
      const sub = `Programa vs Real en FCL · por ${fclGlab} · ${tituloTemp} · ${new Date().toLocaleDateString("es-CL")}`;
      const ws = wb.addWorksheet("Programa vs Real FCL");
      fr_sheetTabla(ws, {
        titulo:"FRISKU FOODS", subtitulo:sub,
        headers:[fclGlab.charAt(0).toUpperCase()+fclGlab.slice(1),"FCL programados","FCL reales","Brecha","% cumplimiento"],
        colWidths:[30,18,14,12,16], intCols:[1,2,3],
        rows: fclRows.map(x=>[x.nombre, x.plan, x.real, x.brecha, Number(x.cumpl.toFixed(1))]),
        totalRow:["TOTAL", fclTot.plan, fclTot.real, fclTot.brecha, Number(fclTot.cumpl.toFixed(1))],
      });
      await fr_logoExcel(wb, ws);
      await fr_descargarWB(wb, `Frisku_ProgramaVsReal_FCL_${(temp||"todas").replace(/\W+/g,"-")}_${new Date().toISOString().slice(0,10)}.xlsx`);
    } catch(e){ console.error("[Reportes] Excel fcl:",e); alert("No se pudo generar el Excel: "+e.message); }
    setExpXls(false);
  };
  // ── Export reporte #3 (Programa vs Real FCL) → PDF ──
  const exportarFclPDF = async () => {
    setExpPdf(true);
    try {
      const JsPDF = await pl_loadJsPDF();
      const doc = new JsPDF({orientation:"portrait", unit:"mm", format:"a4"});
      const W=210, m=14;
      doc.setFillColor(30,39,97); doc.rect(0,0,W,26,"F");
      await fr_logoPDF(doc, W-m, 5, 46, 16);
      doc.setTextColor(255,255,255); doc.setFontSize(15); doc.setFont("helvetica","bold");
      doc.text("Frisku · Programa vs Real (FCL)",m,12);
      doc.setFontSize(9); doc.setFont("helvetica","normal");
      doc.text(`Por ${fclGlab} · Temporada: ${tituloTemp} · ${new Date().toLocaleDateString("es-CL")}`,m,19);
      doc.autoTable({
        startY:32, theme:"striped",
        headStyles:{fillColor:[30,39,97],textColor:255,fontSize:8},
        styles:{fontSize:8,cellPadding:2},
        footStyles:{fillColor:[234,238,244],textColor:30,fontStyle:"bold"},
        head:[[fclGlab.charAt(0).toUpperCase()+fclGlab.slice(1),"FCL prog.","FCL real","Brecha","% cumpl."]],
        body: fclRows.length ? fclRows.map(x=>[x.nombre, fmtN0(x.plan), fmtN0(x.real), (x.brecha>0?"+":"")+fmtN0(x.brecha), x.cumpl.toFixed(1)+"%"]) : [["Sin datos","","","",""]],
        foot: [["TOTAL", fmtN0(fclTot.plan), fmtN0(fclTot.real), (fclTot.brecha>0?"+":"")+fmtN0(fclTot.brecha), fclTot.cumpl.toFixed(1)+"%"]],
        columnStyles:{1:{halign:"right"},2:{halign:"right"},3:{halign:"right"},4:{halign:"right"}},
        margin:{left:m,right:m},
      });
      const fy = doc.lastAutoTable.finalY + 6;
      doc.setFontSize(8); doc.setTextColor(120,120,120);
      doc.text("FCL real = órdenes de embarque marítimas no canceladas (1 OE = 1 contenedor). Plan = contenedores del programa comercial.", m, fy, {maxWidth:W-2*m});
      doc.save(`Frisku_ProgramaVsReal_FCL_${(temp||"todas").replace(/\W+/g,"-")}_${new Date().toISOString().slice(0,10)}.pdf`);
    } catch(e){ console.error("[Reportes] PDF fcl:",e); alert("No se pudo generar el PDF: "+e.message); }
    setExpPdf(false);
  };

  // ── Export reporte #4 (Pipeline de embarques) → Excel ──
  const exportarPipeExcel = async () => {
    setExpXls(true);
    try {
      const ExcelJS = await fr_loadExcelJS();
      const wb = new ExcelJS.Workbook();
      wb.creator = "Grupo Mediterra — Frisku Foods";
      const sub = `Pipeline de embarques · ${tituloTemp} · ${new Date().toLocaleDateString("es-CL")}`;
      // Resumen
      const wsR = wb.addWorksheet("Resumen");
      fr_sheetTabla(wsR, {
        titulo:"FRISKU FOODS", subtitulo:sub,
        headers:["Indicador","Valor"], colWidths:[26,16], intCols:[1],
        rows:[
          ["Embarques totales", pipe.total],
          ["Marítimos", pipe.maritimo],
          ["Aéreos", pipe.aereo],
          ["Contenedores (FCL)", pipe.fcl],
          ["Cajas totales", pipe.cajas],
          ["Borrador", pipe.est.borrador||0],
          ["Confirmado", pipe.est.confirmado||0],
          ["Despachado", pipe.est.despachado||0],
          ["Cancelado", pipe.est.cancelado||0],
        ],
      });
      await fr_logoExcel(wb, wsR);
      // Detalle
      fr_sheetTabla(wb.addWorksheet("Embarques"), {
        titulo:"Embarques", subtitulo:sub,
        headers:["N°","Temp.","Cliente","Exportadora","Especie","Vía","Contenedor","Origen","Destino","ETD","ETA","Estado"],
        colWidths:[12,10,22,22,16,10,14,14,14,11,11,11],
        rows: proximos.map(x=>[x.numero,x.temporada,x.cliente,x.exportadora,x.especie,x.via,x.cont,x.origen,x.destino,x.etd,x.eta,x.estado]),
      });
      await fr_descargarWB(wb, `Frisku_Pipeline_Embarques_${(temp||"todas").replace(/\W+/g,"-")}_${new Date().toISOString().slice(0,10)}.xlsx`);
    } catch(e){ console.error("[Reportes] Excel pipe:",e); alert("No se pudo generar el Excel: "+e.message); }
    setExpXls(false);
  };
  // ── Export reporte #4 (Pipeline) → PDF ──
  const exportarPipePDF = async () => {
    setExpPdf(true);
    try {
      const JsPDF = await pl_loadJsPDF();
      const doc = new JsPDF({orientation:"landscape", unit:"mm", format:"a4"});
      const W=297, m=12;
      doc.setFillColor(30,39,97); doc.rect(0,0,W,24,"F");
      await fr_logoPDF(doc, W-m, 4, 42, 15);
      doc.setTextColor(255,255,255); doc.setFontSize(15); doc.setFont("helvetica","bold");
      doc.text("Frisku · Pipeline de embarques",m,11);
      doc.setFontSize(9); doc.setFont("helvetica","normal");
      doc.text(`Temporada: ${tituloTemp} · ${new Date().toLocaleDateString("es-CL")}`,m,18);
      doc.autoTable({
        startY:28, theme:"grid",
        headStyles:{fillColor:[45,58,82],textColor:255,fontStyle:"bold",fontSize:8},
        styles:{fontSize:8,cellPadding:2},
        head:[["Total","Marítimo","Aéreo","FCL","Cajas","Borrador","Confirmado","Despachado","Cancelado"]],
        body:[[fmtN0(pipe.total),fmtN0(pipe.maritimo),fmtN0(pipe.aereo),fmtN0(pipe.fcl),fmtN0(pipe.cajas),
               fmtN0(pipe.est.borrador||0),fmtN0(pipe.est.confirmado||0),fmtN0(pipe.est.despachado||0),fmtN0(pipe.est.cancelado||0)]],
        margin:{left:m,right:m}, columnStyles:Object.fromEntries([0,1,2,3,4,5,6,7,8].map(i=>[i,{halign:"right"}])),
      });
      let y = doc.lastAutoTable.finalY + 6;
      doc.setTextColor(30,39,97); doc.setFontSize(10); doc.setFont("helvetica","bold");
      doc.text("Detalle de embarques (por ETD)",m,y); y+=2;
      doc.autoTable({
        startY:y, theme:"striped",
        headStyles:{fillColor:[30,39,97],textColor:255,fontSize:7.5},
        styles:{fontSize:7.5,cellPadding:1.6},
        head:[["N°","Cliente","Exportadora","Especie","Vía","Contenedor","Origen","Destino","ETD","ETA","Estado"]],
        body: proximos.length ? proximos.map(x=>[x.numero,x.cliente,x.exportadora,x.especie,x.via,x.cont,x.origen,x.destino,x.etd,x.eta,x.estado]) : [["Sin embarques","","","","","","","","","",""]],
        margin:{left:m,right:m},
      });
      doc.save(`Frisku_Pipeline_Embarques_${(temp||"todas").replace(/\W+/g,"-")}_${new Date().toISOString().slice(0,10)}.pdf`);
    } catch(e){ console.error("[Reportes] PDF pipe:",e); alert("No se pudo generar el PDF: "+e.message); }
    setExpPdf(false);
  };

  // ── Export reporte #5 (Ranking exportadoras) → Excel ──
  const exportarExpExcel = async () => {
    setExpXls(true);
    try {
      const ExcelJS = await fr_loadExcelJS();
      const wb = new ExcelJS.Workbook();
      wb.creator = "Grupo Mediterra — Frisku Foods";
      const sub = `Ranking de exportadoras · ${tituloTemp}${estado?" · "+estado:""} · ${new Date().toLocaleDateString("es-CL")}`;
      const ws = wb.addWorksheet("Ranking exportadoras");
      fr_sheetTabla(ws, {
        titulo:"FRISKU FOODS", subtitulo:sub,
        headers:["Exportadora","Comisión USD","Venta USD","Cajas vend.","Precio USD/caja","% merma","N° emb."],
        colWidths:[28,16,14,12,16,10,9], moneyCols:[1,2], intCols:[3,6],
        rows: expRows.map(x=>[x.nombre, Math.round(x.comisionUSD), Math.round(x.ventaUSD), x.cajasVend, Number(x.precioCaja.toFixed(2)), Number(x.pctMerma.toFixed(1)), x.nEmb]),
        totalRow:["TOTAL", Math.round(kpi.comision), Math.round(kpi.venta), kpi.cajas, Number(kpi.precioProm.toFixed(2)), "", ""],
      });
      for(let r=5;r<=5+expRows.length;r++){ ws.getCell(r,5).numFmt='$#,##0.00'; }
      await fr_logoExcel(wb, ws);
      await fr_descargarWB(wb, `Frisku_RankingExportadoras_${(temp||"todas").replace(/\W+/g,"-")}_${new Date().toISOString().slice(0,10)}.xlsx`);
    } catch(e){ console.error("[Reportes] Excel exp:",e); alert("No se pudo generar el Excel: "+e.message); }
    setExpXls(false);
  };
  // ── Export reporte #5 (Ranking exportadoras) → PDF ──
  const exportarExpPDF = async () => {
    setExpPdf(true);
    try {
      const JsPDF = await pl_loadJsPDF();
      const doc = new JsPDF({orientation:"portrait", unit:"mm", format:"a4"});
      const W=210, m=14;
      doc.setFillColor(30,39,97); doc.rect(0,0,W,26,"F");
      await fr_logoPDF(doc, W-m, 5, 46, 16);
      doc.setTextColor(255,255,255); doc.setFontSize(15); doc.setFont("helvetica","bold");
      doc.text("Frisku · Ranking de exportadoras",m,12);
      doc.setFontSize(9); doc.setFont("helvetica","normal");
      doc.text(`Temporada: ${tituloTemp}${estado?" · Estado: "+estado:""} · ${new Date().toLocaleDateString("es-CL")}`,m,19);
      doc.autoTable({
        startY:32, theme:"striped",
        headStyles:{fillColor:[15,118,110],textColor:255,fontSize:8},
        styles:{fontSize:8,cellPadding:2},
        footStyles:{fillColor:[234,238,244],textColor:30,fontStyle:"bold"},
        head:[["Exportadora","Comisión USD","Venta USD","Cajas","USD/caja","% merma","Emb."]],
        body: expRows.length ? expRows.map(x=>[x.nombre, fmtUSD0(x.comisionUSD), fmtUSD0(x.ventaUSD), fmtN0(x.cajasVend), fmtUSD2(x.precioCaja), x.pctMerma.toFixed(1)+"%", String(x.nEmb)]) : [["Sin datos","","","","","",""]],
        foot: [["TOTAL", fmtUSD0(kpi.comision), fmtUSD0(kpi.venta), fmtN0(kpi.cajas), fmtUSD2(kpi.precioProm), "", ""]],
        columnStyles:{1:{halign:"right"},2:{halign:"right"},3:{halign:"right"},4:{halign:"right"},5:{halign:"right"},6:{halign:"right"}},
        margin:{left:m,right:m},
      });
      doc.save(`Frisku_RankingExportadoras_${(temp||"todas").replace(/\W+/g,"-")}_${new Date().toISOString().slice(0,10)}.pdf`);
    } catch(e){ console.error("[Reportes] PDF exp:",e); alert("No se pudo generar el PDF: "+e.message); }
    setExpPdf(false);
  };

  // ── Export reporte #6 (Cobranza / aging) → Excel ──
  const exportarCobrExcel = async () => {
    setExpXls(true);
    try {
      const ExcelJS = await fr_loadExcelJS();
      const wb = new ExcelJS.Workbook();
      wb.creator = "Grupo Mediterra — Frisku Foods";
      const sub = `Cobranza de comisión (PO) · ${new Date().toLocaleDateString("es-CL")}`;
      // Resumen
      const wsR = wb.addWorksheet("Resumen");
      fr_sheetTabla(wsR, {
        titulo:"FRISKU FOODS", subtitulo:sub,
        headers:["Indicador","USD"], colWidths:[26,18], moneyCols:[1],
        rows:[
          ["Comisión total (PO)", Math.round(cobr.totalUSD)],
          ["Cobrado (pagada)", Math.round(cobr.cobrado)],
          ["Por cobrar (emitida)", Math.round(cobr.porCobrar)],
          ["En borrador", Math.round(cobr.enBorrador)],
          ["En riesgo (>60 días)", Math.round(cobr.riesgo)],
          ["Aging 0–30", Math.round(cobr.aging.b1)],
          ["Aging 31–60", Math.round(cobr.aging.b2)],
          ["Aging 61–90", Math.round(cobr.aging.b3)],
          ["Aging >90", Math.round(cobr.aging.b4)],
        ],
      });
      await fr_logoExcel(wb, wsR);
      // Por cliente (por cobrar)
      fr_sheetTabla(wb.addWorksheet("Por cobrar x cliente"), {
        titulo:"Por cobrar por cliente", subtitulo:sub,
        headers:["Cliente","Por cobrar USD","N° PO","Días máx."], colWidths:[28,16,9,10], moneyCols:[1], intCols:[2,3],
        rows: cobr.porCliente.map(x=>[x.nombre, Math.round(x.usd), x.n, x.maxDias]),
        totalRow:["TOTAL", Math.round(cobr.porCobrar), cobr.est.emitida.n, ""],
      });
      await fr_descargarWB(wb, `Frisku_Cobranza_${new Date().toISOString().slice(0,10)}.xlsx`);
    } catch(e){ console.error("[Reportes] Excel cobr:",e); alert("No se pudo generar el Excel: "+e.message); }
    setExpXls(false);
  };
  // ── Export reporte #6 (Cobranza) → PDF ──
  const exportarCobrPDF = async () => {
    setExpPdf(true);
    try {
      const JsPDF = await pl_loadJsPDF();
      const doc = new JsPDF({orientation:"portrait", unit:"mm", format:"a4"});
      const W=210, m=14;
      doc.setFillColor(30,39,97); doc.rect(0,0,W,26,"F");
      await fr_logoPDF(doc, W-m, 5, 46, 16);
      doc.setTextColor(255,255,255); doc.setFontSize(15); doc.setFont("helvetica","bold");
      doc.text("Frisku · Cobranza de comisión",m,12);
      doc.setFontSize(9); doc.setFont("helvetica","normal");
      doc.text(`Notas de cobro (PO) · ${new Date().toLocaleDateString("es-CL")}`,m,19);
      doc.autoTable({
        startY:32, theme:"grid",
        headStyles:{fillColor:[45,58,82],textColor:255,fontStyle:"bold",fontSize:8},
        styles:{fontSize:9,cellPadding:2.5},
        head:[["Indicador","USD","Aging","USD"]],
        body:[
          ["Comisión total (PO)", fmtUSD0(cobr.totalUSD), "0–30 días", fmtUSD0(cobr.aging.b1)],
          ["Cobrado (pagada)", fmtUSD0(cobr.cobrado), "31–60 días", fmtUSD0(cobr.aging.b2)],
          ["Por cobrar (emitida)", fmtUSD0(cobr.porCobrar), "61–90 días", fmtUSD0(cobr.aging.b3)],
          ["En riesgo (>60 días)", fmtUSD0(cobr.riesgo), ">90 días", fmtUSD0(cobr.aging.b4)],
        ],
        margin:{left:m,right:m}, columnStyles:{1:{halign:"right"},3:{halign:"right"}},
      });
      let y = doc.lastAutoTable.finalY + 6;
      doc.setTextColor(30,39,97); doc.setFontSize(10); doc.setFont("helvetica","bold");
      doc.text("Por cobrar por cliente",m,y); y+=2;
      doc.autoTable({
        startY:y, theme:"striped",
        headStyles:{fillColor:[30,39,97],textColor:255,fontSize:8},
        styles:{fontSize:8,cellPadding:2},
        head:[["Cliente","Por cobrar USD","N° PO","Días máx."]],
        body: cobr.porCliente.length ? cobr.porCliente.map(x=>[x.nombre, fmtUSD0(x.usd), String(x.n), String(x.maxDias)]) : [["Sin PO por cobrar","","",""]],
        columnStyles:{1:{halign:"right"},2:{halign:"right"},3:{halign:"right"}}, margin:{left:m,right:m},
      });
      doc.save(`Frisku_Cobranza_${new Date().toISOString().slice(0,10)}.pdf`);
    } catch(e){ console.error("[Reportes] PDF cobr:",e); alert("No se pudo generar el PDF: "+e.message); }
    setExpPdf(false);
  };

  // Dispatchers según el reporte activo
  const doExcel = () => rep==="ingreso" ? exportarExcel() : rep==="rentabilidad" ? exportarRentExcel() : rep==="fcl" ? exportarFclExcel() : rep==="pipeline" ? exportarPipeExcel() : rep==="exportadoras" ? exportarExpExcel() : exportarCobrExcel();
  const doPDF   = () => rep==="ingreso" ? exportarPDF()   : rep==="rentabilidad" ? exportarRentPDF()   : rep==="fcl" ? exportarFclPDF()   : rep==="pipeline" ? exportarPipePDF()   : rep==="exportadoras" ? exportarExpPDF()   : exportarCobrPDF();

  const kpiCard = (lab, val, color, sub) => (
    <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"12px 14px", boxShadow:C.shadowSm}}>
      <div style={{fontSize:10.5, color:C.muted, fontWeight:600, textTransform:"uppercase", letterSpacing:0.3}}>{lab}</div>
      <div style={{fontSize:23, fontWeight:800, color:color||C.text, marginTop:5, lineHeight:1}}>{val}</div>
      {sub && <div style={{fontSize:11, color:C.muted, marginTop:4}}>{sub}</div>}
    </div>
  );

  const sinDatos = rep==="fcl"
    ? ((programa||[]).length===0 && (embarques||[]).length===0)
    : rep==="pipeline"
    ? (embarques||[]).length===0
    : rep==="cobranza"
    ? (pos||[]).length===0
    : liquidaciones.length === 0;
  const msgVacio = rep==="fcl"
    ? "Aún no hay programa ni embarques cargados. El reporte se puebla al registrar semanas de programa (con FCL) y órdenes de embarque marítimas."
    : rep==="pipeline"
    ? "Aún no hay órdenes de embarque cargadas. El pipeline se puebla desde la pestaña 🚢 Embarques."
    : rep==="cobranza"
    ? "Aún no hay notas de cobro (PO) generadas. Se crean desde 💰 Liquidaciones → PO y alimentan el aging de cobranza."
    : "Aún no hay liquidaciones cargadas. El reporte se puebla automáticamente a medida que se registran liquidaciones en la pestaña 💰 Liquidaciones.";

  return (
    <div>
      {/* Selector de reporte */}
      <div style={{display:"flex", gap:6, marginBottom:14, flexWrap:"wrap"}}>
        {[{id:"ingreso",lab:"💰 Ingreso por temporada"},{id:"rentabilidad",lab:"📊 Rentabilidad"},{id:"fcl",lab:"🚢 Programa vs Real (FCL)"},{id:"pipeline",lab:"📦 Pipeline embarques"},{id:"exportadoras",lab:"🏭 Ranking exportadoras"},{id:"cobranza",lab:"🧾 Cobranza (aging)"}].map(r=>(
          <button key={r.id} onClick={()=>setRep(r.id)} style={{
            padding:"7px 14px", borderRadius:8, cursor:"pointer", fontSize:12, fontWeight:rep===r.id?700:500,
            border:`1px solid ${rep===r.id?C.blue:C.border}`,
            background: rep===r.id ? C.blue : C.card, color: rep===r.id ? "#fff" : C.muted,
          }}>{r.lab}</button>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems:"flex-end"}}>
        {rep!=="cobranza" && (
          <div>
            <div style={lblSt}>Temporada</div>
            <select value={temp} onChange={e=>setTemp(e.target.value)} style={{...inputSt, minWidth:170}}>
              <option value="">— Todas —</option>
              {(tempsDisponibles.length?tempsDisponibles:temporadas.map(t=>t.codigo||t)).map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}
        {(rep==="ingreso"||rep==="rentabilidad"||rep==="exportadoras") && (
          <div>
            <div style={lblSt}>Estado</div>
            <select value={estado} onChange={e=>setEstado(e.target.value)} style={{...inputSt, minWidth:140}}>
              <option value="">— Todos —</option>
              <option value="borrador">Borrador</option>
              <option value="enviada">Enviada</option>
              <option value="pagada">Pagada</option>
            </select>
          </div>
        )}
        {rep!=="cobranza" && (
          <div>
            <div style={lblSt}>Exportadora</div>
            <SelectBuscable listId="rep-flt-exp" value={fExp} onChange={setFExp}
              placeholder="🔍 Todas" style={{...inputSt, minWidth:170}}
              options={exportadoras.filter(e=>e.activo!==false).slice().sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||"")).map(e=>({value:e.id, label:e.nombre}))}/>
          </div>
        )}
        <div>
          <div style={lblSt}>Cliente</div>
          <SelectBuscable listId="rep-flt-cli" value={fCli} onChange={setFCli}
            placeholder="🔍 Todos" style={{...inputSt, minWidth:170}}
            options={clientes.filter(c=>c.activo!==false).slice().sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||"")).map(c=>({value:c.id, label:c.nombre}))}/>
        </div>
        {rep!=="cobranza" && (
          <div>
            <div style={lblSt}>Especie</div>
            <SelectBuscable listId="rep-flt-esp" value={fEsp} onChange={setFEsp}
              placeholder="🔍 Todas" style={{...inputSt, minWidth:150}}
              options={especies.slice().sort((a,b)=>(a.nombreEs||"").localeCompare(b.nombreEs||"")).map(e=>({value:e.codigo, label:e.nombreEs}))}/>
          </div>
        )}
        {(fExp||fCli||fEsp) && (
          <button onClick={()=>{setFExp("");setFCli("");setFEsp("");}} style={{...btnSt(C.muted,true), fontSize:11}}>✕ Limpiar filtros</button>
        )}
        {rep==="rentabilidad" && (
          <div>
            <div style={lblSt}>Agrupar por</div>
            <select value={groupBy} onChange={e=>setGroupBy(e.target.value)} style={{...inputSt, minWidth:140}}>
              <option value="especie">Especie</option>
              <option value="mercado">Mercado</option>
              <option value="cliente">Cliente</option>
            </select>
          </div>
        )}
        {rep==="fcl" && (
          <div>
            <div style={lblSt}>Agrupar por</div>
            <select value={fclGroup} onChange={e=>setFclGroup(e.target.value)} style={{...inputSt, minWidth:160}}>
              <option value="ambos">Especie + Cliente</option>
              <option value="especie">Especie</option>
              <option value="cliente">Cliente</option>
            </select>
          </div>
        )}
        <div style={{marginLeft:"auto", display:"flex", gap:8, alignItems:"flex-end"}}>
          <button onClick={doExcel} disabled={expXls||sinDatos} style={{...btnSt(C.green), opacity:(expXls||sinDatos)?0.5:1}}>
            {expXls?"Generando…":"▦ Excel"}
          </button>
          <button onClick={doPDF} disabled={expPdf||sinDatos} style={{...btnSt(C.accent), opacity:(expPdf||sinDatos)?0.5:1}}>
            {expPdf?"Generando…":"▤ PDF"}
          </button>
        </div>
      </div>

      {sinDatos ? (
        <div style={{padding:50, textAlign:"center", color:C.muted, fontSize:13, background:C.card, borderRadius:14}}>
          {msgVacio}
        </div>
      ) : rep==="ingreso" ? (
      <>
        {/* KPIs */}
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(150px,1fr))", gap:12, marginBottom:16}}>
          {kpiCard("Comisión Frisku", fmtUSD0(kpi.comision), C.accent2, `${kpi.pctFob.toFixed(1)}% del FOB`)}
          {kpiCard("Venta destino", fmtUSD0(kpi.venta), C.blue)}
          {kpiCard("Cajas vendidas", fmtN0(kpi.cajas), C.text)}
          {kpiCard("Precio prom.", fmtUSD2(kpi.precioProm), C.text, "por caja")}
          {kpiCard("Liquidaciones", String(kpi.nLiq), C.text, `${kpi.nEmb} embarques`)}
        </div>

        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(320px,1fr))", gap:14}}>
          {/* Comisión por mes */}
          <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16, boxShadow:C.shadowSm}}>
            <div style={{fontSize:14, fontWeight:700, marginBottom:2}}>Comisión Frisku por mes</div>
            <div style={{fontSize:11, color:C.muted, marginBottom:12}}>Temporada agrícola Jul → Jun · USD</div>
            <svg viewBox="0 0 640 210" width="100%" role="img" aria-label="Comisión por mes">
              {[0,0.25,0.5,0.75,1].map((f,i)=>(
                <line key={i} x1="34" y1={20+f*150} x2="628" y2={20+f*150} stroke={C.border} strokeWidth="1"/>
              ))}
              {porMes.map((x,i)=>{
                const bw=40, gap=(628-34-bw*12)/12, xx=34+gap/2+i*(bw+gap);
                const h=x.monto/maxMes*150, yy=170-h;
                return (
                  <g key={i}>
                    <rect x={xx} y={yy} width={bw} height={Math.max(0,h)} rx="3" fill={C.accent2}>
                      <title>{x.lab}: {fmtUSD0(x.monto)}</title>
                    </rect>
                    <text x={xx+bw/2} y="186" textAnchor="middle" fontSize="10" fill={C.muted2}>{x.lab}</text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Comisión por especie */}
          <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16, boxShadow:C.shadowSm}}>
            <div style={{fontSize:14, fontWeight:700, marginBottom:2}}>Comisión por especie</div>
            <div style={{fontSize:11, color:C.muted, marginBottom:12}}>participación sobre {fmtUSD0(kpi.comision)}</div>
            {porEspecie.length===0 ? <div style={{color:C.muted, fontSize:12, padding:"20px 0"}}>Sin datos por especie (¿liquidaciones sin embarque asociado?).</div> :
              porEspecie.map(x=>(
                <div key={x.cod} style={{display:"grid", gridTemplateColumns:"120px 1fr auto", alignItems:"center", gap:10, padding:"5px 0"}}>
                  <span style={{fontSize:12.5, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{x.nombre}</span>
                  <div style={{height:15, borderRadius:5, background:C.cardAlt, overflow:"hidden"}}>
                    <div style={{width:`${x.monto/maxEsp*100}%`, height:"100%", background:x.color, borderRadius:5}}/>
                  </div>
                  <span style={{fontSize:12.5, fontWeight:700, textAlign:"right", minWidth:96}}>{fmtUSD0(x.monto)} <span style={{color:C.muted, fontWeight:500}}>{(x.monto/totalCom*100).toFixed(0)}%</span></span>
                </div>
              ))
            }
          </div>

          {/* Top clientes */}
          <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16, boxShadow:C.shadowSm}}>
            <div style={{fontSize:14, fontWeight:700, marginBottom:2}}>Top clientes por comisión</div>
            <div style={{fontSize:11, color:C.muted, marginBottom:12}}>USD · {tituloTemp}</div>
            {porCliente.slice(0,10).map((x,i)=>(
              <div key={x.cid} style={{display:"grid", gridTemplateColumns:"130px 1fr auto", alignItems:"center", gap:10, padding:"5px 0"}}>
                <span style={{fontSize:12.5, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{x.nombre}</span>
                <div style={{height:15, borderRadius:5, background:C.cardAlt, overflow:"hidden"}}>
                  <div style={{width:`${x.monto/maxCli*100}%`, height:"100%", background:C.blue, borderRadius:5}}/>
                </div>
                <span style={{fontSize:12.5, fontWeight:700, textAlign:"right", minWidth:80}}>{fmtUSD0(x.monto)}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{fontSize:11, color:C.muted2, marginTop:14, textAlign:"center"}}>
          Fuente: {kpi.nLiq} liquidación{kpi.nLiq!==1?"es":""} · comisión Frisku normalizada a USD vía TC. Reporte #1 de la Fase 8 (Dashboards CFO).
        </div>
      </>
      ) : rep==="rentabilidad" ? (
      <>
        {/* KPIs (rentabilidad) */}
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(150px,1fr))", gap:12, marginBottom:16}}>
          {kpiCard("Comisión Frisku", fmtUSD0(kpi.comision), C.accent2)}
          {kpiCard("Venta destino", fmtUSD0(kpi.venta), C.blue)}
          {kpiCard("Cajas vendidas", fmtN0(kpi.cajas), C.text)}
          {kpiCard("Precio prom.", fmtUSD2(kpi.precioProm), C.text, "por caja")}
          {kpiCard("% s/FOB", kpi.pctFob.toFixed(1)+"%", C.accent2, "comisión efectiva")}
        </div>

        {/* Tabla pivote */}
        <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16, boxShadow:C.shadowSm, marginBottom:14, overflowX:"auto"}}>
          <div style={{fontSize:14, fontWeight:700, marginBottom:2}}>Rentabilidad por {GROUP_LABEL[groupBy]}</div>
          <div style={{fontSize:11, color:C.muted, marginBottom:12}}>{tituloTemp} · USD</div>
          {rentRows.length===0 ? <div style={{color:C.muted, fontSize:12, padding:"18px 0"}}>Sin datos.</div> : (
          <table style={{width:"100%", borderCollapse:"collapse", fontSize:12.5, fontVariantNumeric:"tabular-nums"}}>
            <thead><tr style={{background:C.primary}}>
              {[GROUP_LABEL[groupBy].charAt(0).toUpperCase()+GROUP_LABEL[groupBy].slice(1),"Cajas","Venta USD","Comisión USD","USD/caja","% s/FOB"].map((h,i)=>(
                <th key={h} style={{padding:"7px 10px", textAlign:i===0?"left":"right", color:C.primaryText, fontWeight:700, fontSize:10.5}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rentRows.map((x,i)=>(
                <tr key={i} style={{background:i%2?C.rowAlt:C.card, borderBottom:`1px solid ${C.border}`}}>
                  <td style={{padding:"7px 10px", color:C.text, display:"flex", alignItems:"center", gap:7}}>
                    <span style={{width:9, height:9, borderRadius:2, background:x.color, flex:"none"}}/>{x.label}
                  </td>
                  <td style={{padding:"7px 10px", textAlign:"right"}}>{fmtN0(x.cajas)}</td>
                  <td style={{padding:"7px 10px", textAlign:"right"}}>{fmtUSD0(x.ventaUSD)}</td>
                  <td style={{padding:"7px 10px", textAlign:"right", fontWeight:700}}>{fmtUSD0(x.comisionUSD)}</td>
                  <td style={{padding:"7px 10px", textAlign:"right"}}>{fmtUSD2(x.precioCaja)}</td>
                  <td style={{padding:"7px 10px", textAlign:"right", color:C.muted}}>{x.pctFob.toFixed(1)}%</td>
                </tr>
              ))}
              <tr style={{background:C.cardAlt, fontWeight:800}}>
                <td style={{padding:"8px 10px"}}>TOTAL</td>
                <td style={{padding:"8px 10px", textAlign:"right"}}>{fmtN0(kpi.cajas)}</td>
                <td style={{padding:"8px 10px", textAlign:"right"}}>{fmtUSD0(kpi.venta)}</td>
                <td style={{padding:"8px 10px", textAlign:"right"}}>{fmtUSD0(kpi.comision)}</td>
                <td style={{padding:"8px 10px", textAlign:"right"}}>{fmtUSD2(kpi.precioProm)}</td>
                <td style={{padding:"8px 10px", textAlign:"right"}}>{kpi.pctFob.toFixed(1)}%</td>
              </tr>
            </tbody>
          </table>
          )}
        </div>

        {/* Precio promedio USD/caja por grupo */}
        <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16, boxShadow:C.shadowSm}}>
          <div style={{fontSize:14, fontWeight:700, marginBottom:2}}>Precio promedio USD/caja por {GROUP_LABEL[groupBy]}</div>
          <div style={{fontSize:11, color:C.muted, marginBottom:12}}>venta destino ÷ cajas vendidas</div>
          {rentRows.length===0 ? <div style={{color:C.muted, fontSize:12, padding:"18px 0"}}>Sin datos.</div> :
            rentRows.map((x,i)=>(
              <div key={i} style={{display:"grid", gridTemplateColumns:"150px 1fr auto", alignItems:"center", gap:10, padding:"5px 0"}}>
                <span style={{fontSize:12.5, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{x.label}</span>
                <div style={{height:15, borderRadius:5, background:C.cardAlt, overflow:"hidden"}}>
                  <div style={{width:`${x.precioCaja/maxPrecio*100}%`, height:"100%", background:x.color, borderRadius:5}}/>
                </div>
                <span style={{fontSize:12.5, fontWeight:700, textAlign:"right", minWidth:80}}>{fmtUSD2(x.precioCaja)}</span>
              </div>
            ))
          }
        </div>

        <div style={{fontSize:11, color:C.muted2, marginTop:14, textAlign:"center"}}>
          Reporte #2 de la Fase 8 · agrupa {kpi.nLiq} liquidación{kpi.nLiq!==1?"es":""} por {GROUP_LABEL[groupBy]}. % s/FOB = comisión Frisku efectiva sobre FOB.
        </div>
      </>
      ) : rep==="fcl" ? (
      <>
        {/* KPIs (FCL) */}
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(150px,1fr))", gap:12, marginBottom:16}}>
          {kpiCard("FCL programados", fmtN0(fclTot.plan), C.blue, "contenedores plan")}
          {kpiCard("FCL reales", fmtN0(fclTot.real), C.teal, "OEs marítimas")}
          {kpiCard("Brecha", (fclTot.brecha>0?"+":"")+fmtN0(fclTot.brecha), fclTot.brecha<0?C.accent:C.green, "real − plan")}
          {kpiCard("Cumplimiento", fclTot.cumpl.toFixed(0)+"%", fclTot.cumpl>=100?C.green:fclTot.cumpl>=80?C.yellow:C.accent)}
        </div>

        {/* Gráfico Plan vs Real por {fclGlab} */}
        <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16, boxShadow:C.shadowSm, marginBottom:14}}>
          <div style={{fontSize:14, fontWeight:700, marginBottom:2}}>Programa vs Real por {fclGlab}</div>
          <div style={{fontSize:11, color:C.muted, marginBottom:12}}>contenedores (FCL) · {tituloTemp}</div>
          {fclRows.length===0 ? <div style={{color:C.muted, fontSize:12, padding:"18px 0"}}>Sin datos de programa ni embarques marítimos.</div> :
            fclRows.map(x=>(
              <div key={x.cod} style={{marginBottom:12}}>
                <div style={{display:"flex", justifyContent:"space-between", fontSize:12.5, marginBottom:4}}>
                  <span style={{color:C.text, display:"flex", gap:6, alignItems:"center"}}>
                    <span style={{width:9, height:9, borderRadius:2, background:x.color}}/>{x.nombre}
                  </span>
                  <span style={{color:C.muted}}>
                    <b style={{color:C.text}}>{fmtN0(x.real)}</b> / {fmtN0(x.plan)} FCL · <span style={{color:x.cumpl>=100?C.green:x.cumpl>=80?C.yellow:C.accent, fontWeight:700}}>{x.cumpl.toFixed(0)}%</span>
                  </span>
                </div>
                {/* barra plan (fondo tenue) + real (color) */}
                <div style={{position:"relative", height:20, borderRadius:5, background:C.cardAlt, overflow:"hidden"}}>
                  <div style={{position:"absolute", left:0, top:0, height:"100%", width:`${x.plan/maxFcl*100}%`, background:`${x.color}33`}}/>
                  <div style={{position:"absolute", left:0, top:0, height:"100%", width:`${x.real/maxFcl*100}%`, background:x.color, borderRadius:5}}/>
                </div>
              </div>
            ))
          }
          {fclRows.length>0 && (
            <div style={{display:"flex", gap:16, marginTop:6, fontSize:11, color:C.muted}}>
              <span style={{display:"flex", gap:6, alignItems:"center"}}><span style={{width:12, height:10, borderRadius:2, background:`${C.blue}33`}}/>Programado (plan)</span>
              <span style={{display:"flex", gap:6, alignItems:"center"}}><span style={{width:12, height:10, borderRadius:2, background:C.blue}}/>Real embarcado</span>
            </div>
          )}
        </div>

        {/* Tabla FCL */}
        <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16, boxShadow:C.shadowSm, overflowX:"auto"}}>
          <div style={{fontSize:14, fontWeight:700, marginBottom:10}}>Detalle por {fclGlab}</div>
          <table style={{width:"100%", borderCollapse:"collapse", fontSize:12.5, fontVariantNumeric:"tabular-nums"}}>
            <thead><tr style={{background:C.primary}}>
              {[fclGlab.charAt(0).toUpperCase()+fclGlab.slice(1),"FCL prog.","FCL real","Brecha","% cumpl."].map((h,i)=>(
                <th key={h} style={{padding:"7px 10px", textAlign:i===0?"left":"right", color:C.primaryText, fontWeight:700, fontSize:10.5}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {fclRows.map((x,i)=>(
                <tr key={x.cod} style={{background:i%2?C.rowAlt:C.card, borderBottom:`1px solid ${C.border}`}}>
                  <td style={{padding:"7px 10px", color:C.text}}>{x.nombre}</td>
                  <td style={{padding:"7px 10px", textAlign:"right"}}>{fmtN0(x.plan)}</td>
                  <td style={{padding:"7px 10px", textAlign:"right", fontWeight:700}}>{fmtN0(x.real)}</td>
                  <td style={{padding:"7px 10px", textAlign:"right", color:x.brecha<0?C.accent:C.green}}>{x.brecha>0?"+":""}{fmtN0(x.brecha)}</td>
                  <td style={{padding:"7px 10px", textAlign:"right", color:x.cumpl>=100?C.green:x.cumpl>=80?C.yellow:C.accent, fontWeight:700}}>{x.cumpl.toFixed(0)}%</td>
                </tr>
              ))}
              <tr style={{background:C.cardAlt, fontWeight:800}}>
                <td style={{padding:"8px 10px"}}>TOTAL</td>
                <td style={{padding:"8px 10px", textAlign:"right"}}>{fmtN0(fclTot.plan)}</td>
                <td style={{padding:"8px 10px", textAlign:"right"}}>{fmtN0(fclTot.real)}</td>
                <td style={{padding:"8px 10px", textAlign:"right", color:fclTot.brecha<0?C.accent:C.green}}>{fclTot.brecha>0?"+":""}{fmtN0(fclTot.brecha)}</td>
                <td style={{padding:"8px 10px", textAlign:"right"}}>{fclTot.cumpl.toFixed(0)}%</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{fontSize:11, color:C.muted2, marginTop:14, textAlign:"center"}}>
          Reporte #3 de la Fase 8 · agrupado por {fclGlab} · FCL real = OEs marítimas no canceladas (1 OE = 1 contenedor). Plan = contenedores del programa comercial.
        </div>
      </>
      ) : rep==="pipeline" ? (
      <>
        {/* KPIs (pipeline) */}
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(140px,1fr))", gap:12, marginBottom:16}}>
          {kpiCard("Embarques", fmtN0(pipe.total), C.text)}
          {kpiCard("Marítimos", fmtN0(pipe.maritimo), C.blue, `${fmtN0(pipe.aereo)} aéreos`)}
          {kpiCard("Contenedores", fmtN0(pipe.fcl), C.teal, "FCL activos")}
          {kpiCard("Cajas", fmtN0(pipe.cajas), C.text)}
          {kpiCard("Despachados", fmtN0(pipe.est.despachado||0), C.green, `${fmtN0(pipe.est.confirmado||0)} confirmados`)}
        </div>

        {/* Embudo por estado + vía */}
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(300px,1fr))", gap:14, marginBottom:14}}>
          <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16, boxShadow:C.shadowSm}}>
            <div style={{fontSize:14, fontWeight:700, marginBottom:12}}>Embarques por estado</div>
            {PIPE_ESTADOS.map(e=>{
              const n = pipe.est[e.id]||0;
              return (
                <div key={e.id} style={{display:"grid", gridTemplateColumns:"110px 1fr auto", alignItems:"center", gap:10, padding:"5px 0"}}>
                  <span style={{fontSize:12.5, color:C.text}}>{e.lab}</span>
                  <div style={{height:16, borderRadius:5, background:C.cardAlt, overflow:"hidden"}}>
                    <div style={{width:`${n/maxEst*100}%`, height:"100%", background:e.color, borderRadius:5}}/>
                  </div>
                  <span style={{fontSize:12.5, fontWeight:700, textAlign:"right", minWidth:36}}>{fmtN0(n)}</span>
                </div>
              );
            })}
          </div>
          <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16, boxShadow:C.shadowSm}}>
            <div style={{fontSize:14, fontWeight:700, marginBottom:12}}>Vía de embarque</div>
            {[{lab:"🚢 Marítimo",n:pipe.maritimo,color:C.blue},{lab:"✈️ Aéreo",n:pipe.aereo,color:C.teal}].map((v,i)=>{
              const tot = pipe.maritimo+pipe.aereo || 1;
              return (
                <div key={i} style={{display:"grid", gridTemplateColumns:"110px 1fr auto", alignItems:"center", gap:10, padding:"5px 0"}}>
                  <span style={{fontSize:12.5, color:C.text}}>{v.lab}</span>
                  <div style={{height:16, borderRadius:5, background:C.cardAlt, overflow:"hidden"}}>
                    <div style={{width:`${v.n/tot*100}%`, height:"100%", background:v.color, borderRadius:5}}/>
                  </div>
                  <span style={{fontSize:12.5, fontWeight:700, textAlign:"right", minWidth:60}}>{fmtN0(v.n)} <span style={{color:C.muted, fontWeight:500}}>{(v.n/tot*100).toFixed(0)}%</span></span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tabla de embarques */}
        <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16, boxShadow:C.shadowSm, overflowX:"auto"}}>
          <div style={{fontSize:14, fontWeight:700, marginBottom:10}}>Embarques (orden por ETD)</div>
          <table style={{width:"100%", borderCollapse:"collapse", fontSize:12, fontVariantNumeric:"tabular-nums", whiteSpace:"nowrap"}}>
            <thead><tr style={{background:C.primary}}>
              {["N°","Cliente","Especie","Vía","Contenedor","Origen → Destino","ETD","ETA","Estado"].map((h,i)=>(
                <th key={h} style={{padding:"7px 9px", textAlign:"left", color:C.primaryText, fontWeight:700, fontSize:10.5}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {proximos.length===0 ? <tr><td colSpan={9} style={{padding:16, color:C.muted, textAlign:"center"}}>Sin embarques activos.</td></tr> :
                proximos.map((x,i)=>{
                  const est = PIPE_ESTADOS.find(e=>e.id===x.estado);
                  return (
                    <tr key={i} style={{background:i%2?C.rowAlt:C.card, borderBottom:`1px solid ${C.border}`}}>
                      <td style={{padding:"6px 9px", fontFamily:"monospace", fontWeight:700, color:C.text}}>{x.numero}</td>
                      <td style={{padding:"6px 9px", color:C.text}}>{x.cliente}</td>
                      <td style={{padding:"6px 9px"}}>{x.especie}</td>
                      <td style={{padding:"6px 9px"}}>{x.via}</td>
                      <td style={{padding:"6px 9px", fontFamily:"monospace", color:C.muted}}>{x.cont}</td>
                      <td style={{padding:"6px 9px", color:C.muted}}>{x.origen} → {x.destino}</td>
                      <td style={{padding:"6px 9px", fontFamily:"monospace"}}>{x.etd||"—"}</td>
                      <td style={{padding:"6px 9px", fontFamily:"monospace"}}>{x.eta||"—"}</td>
                      <td style={{padding:"6px 9px"}}>
                        <span style={{fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:10, background:`${est?.color||C.muted}22`, color:est?.color||C.muted}}>{est?.lab||x.estado}</span>
                      </td>
                    </tr>
                  );
                })
              }
            </tbody>
          </table>
        </div>

        <div style={{fontSize:11, color:C.muted2, marginTop:14, textAlign:"center"}}>
          Reporte #4 de la Fase 8 · pipeline operativo de {pipe.total} embarque{pipe.total!==1?"s":""} de la temporada. Cancelados excluidos del detalle.
        </div>
      </>
      ) : rep==="exportadoras" ? (
      <>
        {/* KPIs (ranking exportadoras) */}
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(150px,1fr))", gap:12, marginBottom:16}}>
          {kpiCard("Exportadoras", String(expRows.length), C.text, "con liquidación")}
          {kpiCard("Comisión Frisku", fmtUSD0(kpi.comision), C.accent2)}
          {kpiCard("Venta destino", fmtUSD0(kpi.venta), C.blue)}
          {kpiCard("Cajas vendidas", fmtN0(kpi.cajas), C.text)}
        </div>

        {/* Ranking por comisión */}
        <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16, boxShadow:C.shadowSm, marginBottom:14}}>
          <div style={{fontSize:14, fontWeight:700, marginBottom:2}}>Ranking por comisión Frisku</div>
          <div style={{fontSize:11, color:C.muted, marginBottom:12}}>USD · {tituloTemp}</div>
          {expRows.length===0 ? <div style={{color:C.muted, fontSize:12, padding:"18px 0"}}>Sin liquidaciones con exportadora asociada.</div> :
            expRows.map((x,i)=>(
              <div key={x.eid} style={{display:"grid", gridTemplateColumns:"170px 1fr auto", alignItems:"center", gap:10, padding:"5px 0"}}>
                <span style={{fontSize:12.5, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{i+1}. {x.nombre}</span>
                <div style={{height:15, borderRadius:5, background:C.cardAlt, overflow:"hidden"}}>
                  <div style={{width:`${x.comisionUSD/maxExpCom*100}%`, height:"100%", background:C.accent2, borderRadius:5}}/>
                </div>
                <span style={{fontSize:12.5, fontWeight:700, textAlign:"right", minWidth:80}}>{fmtUSD0(x.comisionUSD)}</span>
              </div>
            ))
          }
        </div>

        {/* Tabla detalle exportadoras */}
        <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16, boxShadow:C.shadowSm, overflowX:"auto"}}>
          <div style={{fontSize:14, fontWeight:700, marginBottom:10}}>Detalle por exportadora</div>
          <table style={{width:"100%", borderCollapse:"collapse", fontSize:12.5, fontVariantNumeric:"tabular-nums", whiteSpace:"nowrap"}}>
            <thead><tr style={{background:C.primary}}>
              {["Exportadora","Comisión USD","Venta USD","Cajas","USD/caja","% merma","Emb."].map((h,i)=>(
                <th key={h} style={{padding:"7px 10px", textAlign:i===0?"left":"right", color:C.primaryText, fontWeight:700, fontSize:10.5}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {expRows.map((x,i)=>(
                <tr key={x.eid} style={{background:i%2?C.rowAlt:C.card, borderBottom:`1px solid ${C.border}`}}>
                  <td style={{padding:"7px 10px", color:C.text}}>{x.nombre}</td>
                  <td style={{padding:"7px 10px", textAlign:"right", fontWeight:700}}>{fmtUSD0(x.comisionUSD)}</td>
                  <td style={{padding:"7px 10px", textAlign:"right"}}>{fmtUSD0(x.ventaUSD)}</td>
                  <td style={{padding:"7px 10px", textAlign:"right"}}>{fmtN0(x.cajasVend)}</td>
                  <td style={{padding:"7px 10px", textAlign:"right"}}>{fmtUSD2(x.precioCaja)}</td>
                  <td style={{padding:"7px 10px", textAlign:"right", color:x.pctMerma>5?C.accent:C.muted}}>{x.pctMerma.toFixed(1)}%</td>
                  <td style={{padding:"7px 10px", textAlign:"right", color:C.muted}}>{x.nEmb}</td>
                </tr>
              ))}
              <tr style={{background:C.cardAlt, fontWeight:800}}>
                <td style={{padding:"8px 10px"}}>TOTAL</td>
                <td style={{padding:"8px 10px", textAlign:"right"}}>{fmtUSD0(kpi.comision)}</td>
                <td style={{padding:"8px 10px", textAlign:"right"}}>{fmtUSD0(kpi.venta)}</td>
                <td style={{padding:"8px 10px", textAlign:"right"}}>{fmtN0(kpi.cajas)}</td>
                <td style={{padding:"8px 10px", textAlign:"right"}}>{fmtUSD2(kpi.precioProm)}</td>
                <td style={{padding:"8px 10px", textAlign:"right"}}>—</td>
                <td style={{padding:"8px 10px", textAlign:"right"}}>—</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{fontSize:11, color:C.muted2, marginTop:14, textAlign:"center"}}>
          Reporte #5 de la Fase 8 · {expRows.length} exportadora{expRows.length!==1?"s":""} con liquidación. % merma = cajas merma / cajas embarcadas.
        </div>
      </>
      ) : (
      <>
        {/* KPIs (cobranza) */}
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(150px,1fr))", gap:12, marginBottom:16}}>
          {kpiCard("Comisión total (PO)", fmtUSD0(cobr.totalUSD), C.text)}
          {kpiCard("Cobrado", fmtUSD0(cobr.cobrado), C.green, "PO pagadas")}
          {kpiCard("Por cobrar", fmtUSD0(cobr.porCobrar), C.blue, "PO emitidas")}
          {kpiCard("En riesgo", fmtUSD0(cobr.riesgo), cobr.riesgo>0?C.accent:C.muted, ">60 días")}
        </div>

        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(300px,1fr))", gap:14, marginBottom:14}}>
          {/* Aging */}
          <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16, boxShadow:C.shadowSm}}>
            <div style={{fontSize:14, fontWeight:700, marginBottom:2}}>Aging de por cobrar</div>
            <div style={{fontSize:11, color:C.muted, marginBottom:12}}>PO emitidas · días desde emisión</div>
            {cobrAgingTot===0 ? <div style={{color:C.muted, fontSize:12, padding:"16px 0"}}>Sin PO emitidas pendientes.</div> : (<>
              <div style={{display:"flex", height:22, borderRadius:6, overflow:"hidden", marginBottom:10}}>
                {COBR_BUCKETS.map(b=>{
                  const v = cobr.aging[b.id]||0; if(v===0) return null;
                  return <div key={b.id} title={`${b.lab}: ${fmtUSD0(v)}`} style={{width:`${v/cobrAgingTot*100}%`, background:b.color}}/>;
                })}
              </div>
              {COBR_BUCKETS.map(b=>(
                <div key={b.id} style={{display:"grid", gridTemplateColumns:"90px 1fr auto", alignItems:"center", gap:10, padding:"3px 0"}}>
                  <span style={{fontSize:12, color:C.text, display:"flex", gap:6, alignItems:"center"}}><span style={{width:9,height:9,borderRadius:2,background:b.color}}/>{b.lab}</span>
                  <div style={{height:12, borderRadius:4, background:C.cardAlt, overflow:"hidden"}}>
                    <div style={{width:`${(cobr.aging[b.id]||0)/cobrAgingTot*100}%`, height:"100%", background:b.color, borderRadius:4}}/>
                  </div>
                  <span style={{fontSize:12, fontWeight:700, textAlign:"right", minWidth:70}}>{fmtUSD0(cobr.aging[b.id]||0)}</span>
                </div>
              ))}
            </>)}
          </div>
          {/* Estado */}
          <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16, boxShadow:C.shadowSm}}>
            <div style={{fontSize:14, fontWeight:700, marginBottom:12}}>Comisión por estado de PO</div>
            {[{id:"pagada",lab:"Pagada",color:C.green},{id:"emitida",lab:"Emitida",color:C.blue},{id:"borrador",lab:"Borrador",color:C.muted2}].map(e=>{
              const usd = cobr.est[e.id]?.usd||0;
              const pct = cobr.totalUSD>0 ? usd/cobr.totalUSD*100 : 0;
              return (
                <div key={e.id} style={{display:"grid", gridTemplateColumns:"90px 1fr auto", alignItems:"center", gap:10, padding:"5px 0"}}>
                  <span style={{fontSize:12.5, color:C.text}}>{e.lab}</span>
                  <div style={{height:16, borderRadius:5, background:C.cardAlt, overflow:"hidden"}}>
                    <div style={{width:`${pct}%`, height:"100%", background:e.color, borderRadius:5}}/>
                  </div>
                  <span style={{fontSize:12.5, fontWeight:700, textAlign:"right", minWidth:80}}>{fmtUSD0(usd)} <span style={{color:C.muted, fontWeight:500}}>{pct.toFixed(0)}%</span></span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Por cobrar por cliente */}
        <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16, boxShadow:C.shadowSm, overflowX:"auto"}}>
          <div style={{fontSize:14, fontWeight:700, marginBottom:10}}>Por cobrar por cliente</div>
          <table style={{width:"100%", borderCollapse:"collapse", fontSize:12.5, fontVariantNumeric:"tabular-nums"}}>
            <thead><tr style={{background:C.primary}}>
              {["Cliente","Por cobrar USD","N° PO","Días máx."].map((h,i)=>(
                <th key={h} style={{padding:"7px 10px", textAlign:i===0?"left":"right", color:C.primaryText, fontWeight:700, fontSize:10.5}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {cobr.porCliente.length===0 ? <tr><td colSpan={4} style={{padding:16, color:C.muted, textAlign:"center"}}>Sin PO por cobrar.</td></tr> :
                cobr.porCliente.map((x,i)=>(
                  <tr key={i} style={{background:i%2?C.rowAlt:C.card, borderBottom:`1px solid ${C.border}`}}>
                    <td style={{padding:"7px 10px", color:C.text}}>{x.nombre}</td>
                    <td style={{padding:"7px 10px", textAlign:"right", fontWeight:700}}>{fmtUSD0(x.usd)}</td>
                    <td style={{padding:"7px 10px", textAlign:"right", color:C.muted}}>{x.n}</td>
                    <td style={{padding:"7px 10px", textAlign:"right", color:x.maxDias>60?C.accent:C.muted}}>{x.maxDias} d</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>

        <div style={{fontSize:11, color:C.muted2, marginTop:14, textAlign:"center"}}>
          Reporte #6 de la Fase 8 · cobranza sobre notas de cobro (PO), comisión en USD. Aging por fecha de emisión. Abarca todas las temporadas.
        </div>
      </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════
export default function FriskuComercialModule({
  usuarioActual, esAdmin, esSoloConsulta, tabPermisos,
  onBack, onLogout,
}) {
  // Resolver permisos: App.jsx pasa esAdmin/esSoloConsulta como FUNCIONES
  // (rol-checkers que reciben el nombre del usuario). Soportar también booleans
  // por si se invoca el componente desde otro contexto (tests, storybook).
  const nombreUsuario = usuarioActual?.nombre;
  const admin = typeof esAdmin === "function" ? esAdmin(nombreUsuario) : !!esAdmin;
  const consulta = typeof esSoloConsulta === "function" ? esSoloConsulta(nombreUsuario) : !!esSoloConsulta;
  const canEditGlobal = admin || !consulta;

  // Permisos finos por tab. tabPermisos = {tabId: "editar"|"ver"|"sin_acceso"}
  // Admin siempre puede editar todo. Si no hay info para un tab, default = "editar".
  const permTab = (tabId) => {
    if (admin) return { visible: true, canEdit: canEditGlobal };
    const nivel = tabPermisos?.[tabId] || "editar";
    return {
      visible: nivel !== "sin_acceso",
      canEdit: canEditGlobal && nivel === "editar",
    };
  };

  // Datos comerciales
  const [clientes,       setClientes]       = useState([]);
  const [exportadoras,   setExportadoras]   = useState([]);
  const [contratos,      setContratos]      = useState([]);
  const [programa,       setPrograma]       = useState([]);
  const [embarques,      setEmbarques]      = useState([]);
  const [liquidaciones,  setLiquidaciones]  = useState([]);
  const [pos,            setPos]            = useState([]);  // PO / notas de cobro al cliente

  // Maestros (solo lectura para los selects del form). Se re-fetchan cada
  // vez que el usuario entra a un tab que los necesita, así reflejan
  // ediciones recientes en Maestros sin necesidad de recargar la página.
  const [especies,       setEspecies]       = useState([]);
  const [paises,         setPaises]         = useState([]);
  const [monedas,        setMonedas]        = useState([]);
  const [mercados,       setMercados]       = useState([]);
  const [tiposEmbalaje,  setTiposEmbalaje]  = useState([]);
  const [ciudades,       setCiudades]       = useState([]);
  const [temporadas,     setTemporadas]     = useState(TEMPORADAS_DEFAULT);
  const [puertos,        setPuertos]        = useState(PUERTOS_DEFAULT);
  const [aeropuertos,    setAeropuertos]    = useState(AEROPUERTOS_DEFAULT);
  const [shippingLines,  setShippingLines]  = useState(SHIPPING_LINES_DEFAULT);
  const [lineasAereas,   setLineasAereas]   = useState(LINEAS_AEREAS_DEFAULT);
  const [notifys,        setNotifys]        = useState([]);
  const [tcData,         setTcData]         = useState({});

  // UI Órdenes de Embarque
  const [editandoOE,      setEditandoOE]      = useState(null);
  const [creandoOE,       setCreandoOE]       = useState(false);
  const [busquedaOE,      setBusquedaOE]      = useState("");
  const [filtroExpOE,     setFiltroExpOE]     = useState("");
  const [filtroCliOE,     setFiltroCliOE]     = useState("");
  const [filtroEspOE,     setFiltroEspOE]     = useState("");
  const [filtroEstadoOE,  setFiltroEstadoOE]  = useState("");
  const [filtroTempOE,    setFiltroTempOE]    = useState("");
  const [filtroViaOE,     setFiltroViaOE]     = useState("");
  const [vistaOE,         setVistaOE]         = useState("lista"); // "lista" | "cards"
  const [verOE,           setVerOE]           = useState(null);    // detalle (Ver) de un embarque
  const [soloDocsIncompletos, setSoloDocsIncompletos] = useState(false); // filtro: solo OE con docs COMEX faltantes

  const [cargando, setCargando] = useState(true);
  // GUARD anti-borrado: solo se guarda tras una carga EXITOSA.
  const cargaOkRef = useRef(false);
  const [tab, setTab] = useState("clientes");
  const [guardando, setGuardando] = useState({});
  const [importando, setImportando] = useState(false);

  // UI Clientes
  const [busquedaCli, setBusquedaCli] = useState("");
  const [filtroMercadoCli, setFiltroMercadoCli] = useState("");
  const [filtroEspecieCli, setFiltroEspecieCli] = useState("");
  const [filtroActivoCli, setFiltroActivoCli] = useState("activos");
  const [editandoCli, setEditandoCli] = useState(null); // cliente en edición (objeto) o null
  const [creandoCli, setCreandoCli] = useState(false);

  // UI Exportadoras
  const [busquedaExp, setBusquedaExp] = useState("");
  const [filtroPaisExp, setFiltroPaisExp] = useState("");
  const [filtroEspecieExp, setFiltroEspecieExp] = useState("");
  const [filtroActivoExp, setFiltroActivoExp] = useState("activos");
  const [editandoExp, setEditandoExp] = useState(null);
  const [creandoExp, setCreandoExp] = useState(false);

  // UI Business Closures
  const [busquedaClosure, setBusquedaClosure]         = useState("");
  const [filtroExpClosure, setFiltroExpClosure]       = useState("");
  const [filtroCliClosure, setFiltroCliClosure]       = useState("");
  const [filtroEspClosure, setFiltroEspClosure]       = useState("");
  const [filtroEstadoClosure, setFiltroEstadoClosure] = useState("activo");
  const [editandoClosure, setEditandoClosure]         = useState(null);
  const [creandoClosure, setCreandoClosure]           = useState(false);
  const [verClosure, setVerClosure]                   = useState(null);   // detalle (Ver) de un Business Closure

  // UI Liquidaciones
  const [editandoLiq,    setEditandoLiq]    = useState(null);
  const [creandoLiq,     setCreandoLiq]     = useState(false);
  const [verLiq,         setVerLiq]         = useState(null);   // detalle (Ver) de una liquidación
  const [vistaLiq,       setVistaLiq]       = useState("lista"); // lista | cliente | exportador | estado | temporada
  const [verPO,          setVerPO]          = useState(null);   // detalle (Ver) de un PO
  const [filtroEstadoLiq, setFiltroEstadoLiq] = useState("");
  const [filtroExpLiq,   setFiltroExpLiq]   = useState("");
  const [filtroCliLiq,   setFiltroCliLiq]   = useState("");
  const [filtroTempLiq,  setFiltroTempLiq]  = useState("");
  // UI Liquidaciones — sub-vista: "liq" (por embarque) | "po" (cobro al cliente)
  const [liqView,        setLiqView]        = useState("liq");
  const [editandoPO,     setEditandoPO]     = useState(null);
  const [creandoPO,      setCreandoPO]      = useState(false);
  const [filtroCliPO,    setFiltroCliPO]    = useState("");
  const [filtroEstadoPO, setFiltroEstadoPO] = useState("");

  // ── Carga inicial ──
  useEffect(()=>{
    let alive = true;
    (async ()=>{
     try {
      const [cli, exp, con, pro, emb, liq, po, esp, pa, mo, me, tb, ci, tmp, pu, ae, sl, la, nt, tc] = await Promise.all([
        dbLoadGeneric("frisku_clientes"),
        dbLoadGeneric("frisku_exportadoras"),
        dbLoadGeneric("frisku_contratos"),
        dbLoadGeneric("frisku_programa"),
        dbLoadGeneric("frisku_embarques"),
        dbLoadGeneric("frisku_liquidaciones"),
        dbLoadGeneric("frisku_po"),
        dbLoadGeneric("maestro_especies"),
        dbLoadGeneric("maestro_paises"),
        dbLoadGeneric("maestro_monedas"),
        dbLoadGeneric("maestro_mercados"),
        dbLoadGeneric("maestro_tipos_embalaje"),
        dbLoadGeneric("maestro_ciudades"),
        dbLoadGeneric("maestro_temporadas"),
        dbLoadGeneric("maestro_puertos"),
        dbLoadGeneric("maestro_aeropuertos"),
        dbLoadGeneric("maestro_shipping_lines"),
        dbLoadGeneric("maestro_lineas_aereas"),
        dbLoadGeneric("maestro_notify"),
        dbLoadGeneric("maestro_tc"),
      ]);
      if(!alive) return;
      setClientes(Array.isArray(cli) ? cli : []);
      setExportadoras(Array.isArray(exp) ? exp : []);
      setContratos(Array.isArray(con) ? con : []);
      setPrograma(Array.isArray(pro) ? pro : []);
      setEmbarques(Array.isArray(emb) ? emb : []);
      setLiquidaciones(Array.isArray(liq) ? liq : []);
      setPos(Array.isArray(po) ? po : []);
      // Fallback a los DEFAULT cuando Supabase aún no tiene la fila del
      // maestro o está vacía. Mantiene el mismo comportamiento que
      // FriskuModule (Maestros) para que el form de Cliente nunca aparezca
      // con selects vacíos en una instalación nueva.
      setEspecies(Array.isArray(esp) && esp.length ? esp : ESPECIES_DEFAULT);
      setPaises(Array.isArray(pa) && pa.length ? pa : PAISES_DEFAULT);
      setMonedas(Array.isArray(mo) && mo.length ? mo : MONEDAS_DEFAULT);
      setMercados(Array.isArray(me) && me.length ? me : MERCADOS_DEFAULT);
      setTiposEmbalaje(Array.isArray(tb) && tb.length ? tb : TIPOS_EMBALAJE_DEFAULT);
      setCiudades(Array.isArray(ci) && ci.length ? ci : CIUDADES_DEFAULT);
      if(Array.isArray(tmp) && tmp.length) setTemporadas(tmp);
      setPuertos(Array.isArray(pu) && pu.length ? pu : PUERTOS_DEFAULT);
      setAeropuertos(Array.isArray(ae) && ae.length ? ae : AEROPUERTOS_DEFAULT);
      setShippingLines(Array.isArray(sl) && sl.length ? sl : SHIPPING_LINES_DEFAULT);
      setLineasAereas(Array.isArray(la) && la.length ? la : LINEAS_AEREAS_DEFAULT);
      setNotifys(Array.isArray(nt) ? nt : []);
      if(tc && typeof tc === "object") setTcData(tc);
      cargaOkRef.current = true; // carga exitosa → habilita auto-save
     } catch(e) {
      // Carga fallida: NO habilitar guardado (evita sobrescribir clientes/
      // exportadoras/etc. con listas vacías ante un parpadeo de conexión).
      console.error("[FriskuComercial] Carga falló — GUARDADO DESHABILITADO esta sesión:", e);
     }
     if(alive) setCargando(false);
    })();
    return ()=>{alive=false;};
  },[]);

  // ── Recarga manual de maestros ──
  // Se ejecuta al navegar a tabs que dependen de los selects (Clientes,
  // Exportadoras). Garantiza que las altas/cambios hechos en el módulo
  // de Maestros se reflejen sin necesidad de recargar la página.
  const recargarMaestros = useCallback(async ()=>{
   try {
    const [esp, pa, mo, me, tb, ci, tmp, pu, ae, sl, la, nt, tc] = await Promise.all([
      dbLoadGeneric("maestro_especies"),
      dbLoadGeneric("maestro_paises"),
      dbLoadGeneric("maestro_monedas"),
      dbLoadGeneric("maestro_mercados"),
      dbLoadGeneric("maestro_tipos_embalaje"),
      dbLoadGeneric("maestro_ciudades"),
      dbLoadGeneric("maestro_temporadas"),
      dbLoadGeneric("maestro_puertos"),
      dbLoadGeneric("maestro_aeropuertos"),
      dbLoadGeneric("maestro_shipping_lines"),
      dbLoadGeneric("maestro_lineas_aereas"),
      dbLoadGeneric("maestro_notify"),
      dbLoadGeneric("maestro_tc"),
    ]);
    setEspecies(Array.isArray(esp) && esp.length ? esp : ESPECIES_DEFAULT);
    setPaises(Array.isArray(pa) && pa.length ? pa : PAISES_DEFAULT);
    setMonedas(Array.isArray(mo) && mo.length ? mo : MONEDAS_DEFAULT);
    setMercados(Array.isArray(me) && me.length ? me : MERCADOS_DEFAULT);
    setTiposEmbalaje(Array.isArray(tb) && tb.length ? tb : TIPOS_EMBALAJE_DEFAULT);
    setCiudades(Array.isArray(ci) && ci.length ? ci : CIUDADES_DEFAULT);
    if(Array.isArray(tmp) && tmp.length) setTemporadas(tmp);
    setPuertos(Array.isArray(pu) && pu.length ? pu : PUERTOS_DEFAULT);
    setAeropuertos(Array.isArray(ae) && ae.length ? ae : AEROPUERTOS_DEFAULT);
    setShippingLines(Array.isArray(sl) && sl.length ? sl : SHIPPING_LINES_DEFAULT);
    setLineasAereas(Array.isArray(la) && la.length ? la : LINEAS_AEREAS_DEFAULT);
    setNotifys(Array.isArray(nt) ? nt : []);
    if(tc && typeof tc === "object") setTcData(tc);
   } catch(e) {
    // Recarga de maestros falló (solo lectura para selects): mantener lo que
    // ya estaba en memoria. No afecta el guardado de datos comerciales.
    console.error("[FriskuComercial] Recarga de maestros falló:", e);
   }
  },[]);

  // Refrescar maestros al entrar a tabs que los necesitan
  useEffect(()=>{
    if (cargando) return;
    // "maestros" cubre lo que antes eran sub-tabs separados (clientes/exportadoras)
    if (tab === "maestros" || tab === "contratos" || tab === "embarques" || tab === "liquidaciones" || tab === "bi") {
      recargarMaestros();
    }
  },[tab, cargando, recargarMaestros]);

  // ── Auto-save genérico ──
  const useAutoSave = (id, valor, listo=true) => {
    const timer = useRef(null);
    const primero = useRef(true);
    useEffect(()=>{
      if(cargando || !listo || !cargaOkRef.current) return;
      if(primero.current) { primero.current = false; return; }
      if(timer.current) clearTimeout(timer.current);
      setGuardando(g => ({...g, [id]:true}));
      timer.current = setTimeout(async ()=>{
        await dbSaveGeneric(id, valor);
        setGuardando(g => ({...g, [id]:false}));
      }, 1000);
    },[valor]);
  };
  useAutoSave("frisku_clientes", clientes);
  useAutoSave("frisku_exportadoras", exportadoras);
  useAutoSave("frisku_contratos", contratos);
  useAutoSave("frisku_programa", programa);
  useAutoSave("frisku_embarques", embarques);
  useAutoSave("frisku_liquidaciones", liquidaciones);
  useAutoSave("frisku_po", pos);

  // ── Filtrado de clientes ──
  const clientesFiltrados = useMemo(()=>{
    const q = busquedaCli.trim().toLowerCase();
    return clientes.filter(c => {
      if(filtroActivoCli === "activos" && c.activo === false) return false;
      if(filtroActivoCli === "inactivos" && c.activo !== false) return false;
      if(filtroMercadoCli && c.mercadoCodigo !== filtroMercadoCli) return false;
      if(filtroEspecieCli && !(c.especiesCodigos||[]).includes(filtroEspecieCli)) return false;
      if(q) {
        const txt = `${c.nombre||""} ${c.ciudad||""} ${c.observ||""}`.toLowerCase();
        if(!txt.includes(q)) return false;
      }
      return true;
    }).sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||""));
  },[clientes, busquedaCli, filtroMercadoCli, filtroEspecieCli, filtroActivoCli]);

  // ── Handlers clientes ──
  const handleNuevoCliente = () => {
    setCreandoCli(true);
    setEditandoCli({
      id: "",
      nombre: "",
      paisCodigo: "",
      ciudad: "",
      mercadoCodigo: "",
      monedaCodigo: "USD",
      contactos: [],
      especiesCodigos: [],
      comisionGlobalSobreFOB: 8,
      comisionFriskuSobreClienteGlobal: 25,
      comisionOverrides: {},
      documentos: [],
      activo: true,
      observ: "",
      fechaCreacion: new Date().toISOString(),
      fechaActualizacion: new Date().toISOString(),
    });
  };
  const handleEditarCliente = (cliente) => {
    setCreandoCli(false);
    setEditandoCli(cliente);
  };
  const handleEliminarCliente = (cliente) => {
    if(!window.confirm(`¿Eliminar cliente "${cliente.nombre}"? Esta acción no se puede deshacer.`)) return;
    setClientes(prev => prev.filter(c => c.id !== cliente.id));
  };
  const handleGuardarCliente = (cli) => {
    // Prevención de calidad: normalización canónica en origen + detección de duplicados.
    const canon = normalizarNombre(cli.nombre || "");
    const dup = buscarDuplicado(canon, clientes, cli.id);   // mismo tipo (clientes), excluye el propio id
    if(dup){
      const usar = window.confirm(
        `Ya existe un cliente equivalente por nombre normalizado:\n\n  "${dup.nombre}"  (ID …${String(dup.id).slice(-6)})\n\n`+
        `Aceptar = abrir/editar ese registro existente (recomendado).\nCancelar = volver a este formulario para ajustarlo.`);
      if(usar){ setCreandoCli(false); setEditandoCli(dup); }
      return; // no se crea/guarda un duplicado automáticamente
    }
    if(canon !== String(cli.nombre||"").trim()){
      if(!window.confirm(`El nombre se guardará normalizado:\n\n  "${cli.nombre}"  →  "${canon}"\n\n¿Confirmar?`)) return;
    }
    const cliCanon = { ...cli, nombre: canon };   // se guarda YA normalizado (fuente de verdad)
    if(creandoCli) {
      setClientes(prev => [...prev, {...cliCanon, id: uid()}]);
    } else {
      setClientes(prev => prev.map(c => c.id === cli.id ? cliCanon : c));
    }
    setEditandoCli(null);
    setCreandoCli(false);
  };

  const totalClientesActivos = clientes.filter(c => c.activo !== false).length;

  // Permisos derivados por tab del módulo comercial
  const permDashboard     = permTab("dashboard");
  const permClientes      = permTab("clientes");
  const permExportadoras  = permTab("exportadoras");
  const permDocumentos    = permTab("documentos");
  const permContratos     = permTab("contratos");
  const permPrograma      = permTab("programa");
  const permEmbarques     = permTab("embarques");
  const permLiquidaciones = permTab("liquidaciones");
  const permResumen       = permTab("resumen");
  const permReportes      = permTab("reportes");
  const permTablero       = permTab("tablero");
  const permReporteria    = permTab("bi");     // Reportería BI (consolida Dashboard+Reportes+Tablero)
  const permMaestros      = permTab("maestros");

  // ── Filtrado de exportadoras ──
  const exportadorasFiltradas = useMemo(()=>{
    const q = busquedaExp.trim().toLowerCase();
    return exportadoras.filter(e => {
      if(filtroActivoExp === "activos" && e.activo === false) return false;
      if(filtroActivoExp === "inactivos" && e.activo !== false) return false;
      if(filtroPaisExp && e.paisCodigo !== filtroPaisExp) return false;
      if(filtroEspecieExp && !(e.especiesProduce||[]).includes(filtroEspecieExp)) return false;
      if(q) {
        const txt = `${e.nombre||""} ${e.ciudad||""} ${e.rut||""} ${e.observ||""}`.toLowerCase();
        if(!txt.includes(q)) return false;
      }
      return true;
    }).sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||""));
  },[exportadoras, busquedaExp, filtroPaisExp, filtroEspecieExp, filtroActivoExp]);

  // ── Handlers exportadoras ──
  const handleNuevaExportadora = () => {
    setCreandoExp(true);
    setEditandoExp({
      id: "",
      nombre: "",
      rut: "",
      paisCodigo: "",
      ciudad: "",
      direccion: "",
      monedaCodigo: "USD",
      contactos: [],
      especiesProduce: [],
      certificaciones: "",
      activo: true,
      observ: "",
      fechaCreacion: new Date().toISOString(),
      fechaActualizacion: new Date().toISOString(),
    });
  };
  const handleEditarExportadora = (exp) => {
    setCreandoExp(false);
    setEditandoExp(exp);
  };
  const handleEliminarExportadora = (exp) => {
    if(!window.confirm(`¿Eliminar exportadora "${exp.nombre}"? Esta acción no se puede deshacer.`)) return;
    setExportadoras(prev => prev.filter(e => e.id !== exp.id));
  };
  const handleGuardarExportadora = (exp) => {
    // Prevención de calidad: normalización canónica en origen + detección de duplicados.
    const canon = normalizarNombre(exp.nombre || "");
    const dup = buscarDuplicado(canon, exportadoras, exp.id);   // mismo tipo (exportadoras), excluye el propio id
    if(dup){
      const usar = window.confirm(
        `Ya existe una exportadora equivalente por nombre normalizado:\n\n  "${dup.nombre}"  (ID …${String(dup.id).slice(-6)})\n\n`+
        `Aceptar = abrir/editar ese registro existente (recomendado).\nCancelar = volver a este formulario para ajustarlo.`);
      if(usar){ setCreandoExp(false); setEditandoExp(dup); }
      return; // no se crea/guarda un duplicado automáticamente
    }
    if(canon !== String(exp.nombre||"").trim()){
      if(!window.confirm(`El nombre se guardará normalizado:\n\n  "${exp.nombre}"  →  "${canon}"\n\n¿Confirmar?`)) return;
    }
    const expCanon = { ...exp, nombre: canon };   // se guarda YA normalizado (fuente de verdad)
    if(creandoExp) {
      setExportadoras(prev => [...prev, {...expCanon, id: uid()}]);
    } else {
      setExportadoras(prev => prev.map(e => e.id === exp.id ? expCanon : e));
    }
    setEditandoExp(null);
    setCreandoExp(false);
  };

  const totalExportadorasActivas = exportadoras.filter(e => e.activo !== false).length;

  // ── Handler importación Excel ──
  const handleAplicarImport = ({clientes:cliNuevos, exportadoras:expNuevas}) => {
    setClientes(cliNuevos);
    setExportadoras(expNuevas);
  };

  // ── Filtrado y handlers Business Closures ──
  const closuresFiltrados = useMemo(()=>{
    const q = busquedaClosure.trim().toLowerCase();
    return contratos.filter(bc=>{
      if(filtroExpClosure && bc.exportadoraId !== filtroExpClosure) return false;
      if(filtroCliClosure && bc.clienteId     !== filtroCliClosure) return false;
      if(filtroEspClosure && bc.especieCodigo !== filtroEspClosure) return false;
      if(filtroEstadoClosure !== "todos" && (bc.estado||"activo") !== filtroEstadoClosure) return false;
      if(q){
        const exp = exportadoras.find(e=>e.id===bc.exportadoraId)?.nombre||"";
        const cli = clientes.find(c=>c.id===bc.clienteId)?.nombre||"";
        const txt = `${bc.temporada||""} ${bc.codigo||""} ${exp} ${cli}`.toLowerCase();
        if(!txt.includes(q)) return false;
      }
      return true;
    }).sort((a,b)=>(b.fechaCreacion||"").localeCompare(a.fechaCreacion||""));
  },[contratos, busquedaClosure, filtroExpClosure, filtroCliClosure, filtroEspClosure, filtroEstadoClosure, exportadoras, clientes]);

  const handleNuevoClosure = () => {
    setCreandoClosure(true);
    setEditandoClosure({
      id:"", codigo:"", temporada:"", exportadoraId:"", clienteId:"",
      especieCodigo:"", cajasPorFormato:{}, precioRef:null,
      monedaCodigo:"USD", condiciones:"FOB",
      fechaInicio:"", fechaFin:"", estado:"activo", observ:"",
      fechaCreacion:new Date().toISOString(), fechaActualizacion:new Date().toISOString(),
    });
  };
  const handleEditarClosure  = (bc) => { setCreandoClosure(false); setEditandoClosure(bc); };
  const handleEliminarClosure = (bc) => {
    if(!window.confirm(`¿Eliminar Business Closure "${bc.temporada}"?`)) return;
    setContratos(prev=>prev.filter(c=>c.id!==bc.id));
  };
  const handleGuardarClosure = (bc) => {
    if(creandoClosure) setContratos(prev=>[...prev, {...bc, id:uid()}]);
    else               setContratos(prev=>prev.map(c=>c.id===bc.id?bc:c));
    setEditandoClosure(null); setCreandoClosure(false);
  };
  const totalClosuresActivos = contratos.filter(c=>(c.estado||"activo")==="activo").length;

  // ── UI Programa Comercial ──
  const [filtroProgramaTemp, setFiltroProgramaTemp] = useState("");
  const [filtroProgramaExp,  setFiltroProgramaExp]  = useState("");
  const [filtroProgramaCli,  setFiltroProgramaCli]  = useState("");
  const [filtroProgramaEsp,  setFiltroProgramaEsp]  = useState("");
  const [filtroProgramaClosure, setFiltroProgramaClosure] = useState(""); // selector directo de un closure
  const [perspProg,          setPerspProg]          = useState("closure"); // closure | especie | cliente | exportador
  const [editandoSemana,     setEditandoSemana]     = useState(null);
  const [closureIdParaSemana,setClosureIdParaSemana]= useState(null);

  // Closures que pasan los filtros temp/exp/cli/esp (alimentan la lista desplegable)
  const closuresOpciones = useMemo(()=>{
    return contratos.filter(bc=>{
      if(filtroProgramaTemp && bc.temporada    !== filtroProgramaTemp) return false;
      if(filtroProgramaExp  && bc.exportadoraId!== filtroProgramaExp)  return false;
      if(filtroProgramaCli  && bc.clienteId    !== filtroProgramaCli)  return false;
      if(filtroProgramaEsp  && bc.especieCodigo!== filtroProgramaEsp)  return false;
      return true;
    }).sort((a,b)=>{
      if(b.temporada !== a.temporada) return (b.temporada||"").localeCompare(a.temporada||"");
      const eA = exportadoras.find(e=>e.id===a.exportadoraId)?.nombre||"";
      const eB = exportadoras.find(e=>e.id===b.exportadoraId)?.nombre||"";
      return eA.localeCompare(eB);
    });
  },[contratos, filtroProgramaTemp, filtroProgramaExp, filtroProgramaCli, filtroProgramaEsp, exportadoras]);
  // Si además se eligió un closure puntual en la lista desplegable, mostrar solo ese
  const closuresParaPrograma = useMemo(()=>
    filtroProgramaClosure ? closuresOpciones.filter(bc=>bc.id===filtroProgramaClosure) : closuresOpciones,
  [closuresOpciones, filtroProgramaClosure]);

  const semanasPorClosure = useMemo(()=>{
    const mapa = {};
    programa.forEach(s=>{
      if(!mapa[s.closureId]) mapa[s.closureId]=[];
      mapa[s.closureId].push(s);
    });
    return mapa;
  },[programa]);

  const handleAgregarSemana = (closureId) => {
    const hoyLocal = new Date().toISOString().slice(0,10);
    setClosureIdParaSemana(closureId);
    setEditandoSemana({
      id:"", closureId,
      tipoEmbarque:"maritimo", etd:"", eta:"", fechaSemana: getMondayStr(hoyLocal),
      cajasPorFormato:{}, contenedoresFCL:0, pallets:0, estado:"borrador", observ:"",
      fechaCreacion: new Date().toISOString(),
    });
  };
  const handleEditarSemana  = (sem) => { setClosureIdParaSemana(sem.closureId); setEditandoSemana(sem); };
  const handleEliminarSemana = (sem) => {
    if(!window.confirm("¿Eliminar esta semana del programa?")) return;
    setPrograma(prev=>prev.filter(s=>s.id!==sem.id));
  };
  const handleGuardarSemana = (sem) => {
    const semFinal = {...sem, fechaSemana:getMondayStr(sem.fechaSemana), fechaActualizacion:new Date().toISOString()};
    if(!sem.id) setPrograma(prev=>[...prev, {...semFinal, id:uid()}]);
    else        setPrograma(prev=>prev.map(s=>s.id===sem.id?semFinal:s));
    setEditandoSemana(null); setClosureIdParaSemana(null);
  };
  const handleCancelarSemana = () => { setEditandoSemana(null); setClosureIdParaSemana(null); };

  // ── Handlers Órdenes de Embarque ──
  const handleNuevaOE = () => {
    setCreandoOE(true);
    setEditandoOE({
      id:"", numero:"", temporada:"",
      closureId:"", exportadoraId:"", clienteId:"", especieCodigo:"",
      tipoEmbarque:"maritimo",
      origen:"", destino:"",
      navieraAerolinea:"", vuelo:"", contenedor:"",
      etd:"", eta:"", fechaCierre:"",
      notify:{ nombre:"", direccion:"", ciudad:"", pais:"", email:"", telefono:"" },
      cajasPorFormato:{},
      observ:"", estado:"borrador",
      fechaCreacion: new Date().toISOString(),
      fechaActualizacion: new Date().toISOString(),
    });
  };
  const handleEditarOE = (oe) => {
    setCreandoOE(false);
    setEditandoOE(oe);
  };
  const handleEliminarOE = (oe) => {
    if(!window.confirm(`¿Eliminar la orden de embarque "${oe.numero||oe.id}"?`)) return;
    setEmbarques(prev=>prev.filter(e=>e.id!==oe.id));
  };
  const handleGuardarOE = (oe) => {
    const oeFinal = {...oe, fechaActualizacion: new Date().toISOString()};
    if(creandoOE) setEmbarques(prev=>[...prev, {...oeFinal, id:uid()}]);
    else          setEmbarques(prev=>prev.map(e=>e.id===oe.id?oeFinal:e));
    setEditandoOE(null); setCreandoOE(false);
  };

  // ── Handlers Liquidaciones ──
  const handleNuevaLiq = () => { setCreandoLiq(true); setEditandoLiq(null); };
  const handleEditarLiq = (liq) => { setCreandoLiq(false); setEditandoLiq(liq); };
  const handleEliminarLiq = (liq) => {
    const oe = embarques.find(e=>e.id===liq.oeId);
    if(!window.confirm(`¿Eliminar liquidación de OE "${oe?.numero||liq.oeId?.slice(-6)}"? Esta acción no se puede deshacer.`)) return;
    setLiquidaciones(prev=>prev.filter(l=>l.id!==liq.id));
  };
  const handleGuardarLiq = (liq) => {
    if(creandoLiq) setLiquidaciones(prev=>[...prev, liq]);
    else           setLiquidaciones(prev=>prev.map(l=>l.id===liq.id?liq:l));
    setEditandoLiq(null); setCreandoLiq(false);
  };
  const handleAvanzarEstadoLiq = (liq, nuevoEstado) => {
    setLiquidaciones(prev=>prev.map(l=>l.id===liq.id
      ? {...l, estado:nuevoEstado, fechaActualizacion:new Date().toISOString()}
      : l));
  };

  // ── Filtros Liquidaciones ──
  const liqFiltradas = useMemo(()=>{
    return liquidaciones.filter(liq=>{
      if(filtroEstadoLiq && liq.estado !== filtroEstadoLiq) return false;
      if(filtroTempLiq   && liq.temporada !== filtroTempLiq) return false;
      if(filtroExpLiq || filtroCliLiq) {
        const oe = embarques.find(e=>e.id===liq.oeId);
        if(filtroExpLiq && oe?.exportadoraId !== filtroExpLiq) return false;
        if(filtroCliLiq && oe?.clienteId     !== filtroCliLiq) return false;
      }
      return true;
    }).sort((a,b)=>(b.fechaLiquidacion||"").localeCompare(a.fechaLiquidacion||""));
  },[liquidaciones, filtroEstadoLiq, filtroExpLiq, filtroCliLiq, filtroTempLiq, embarques]);

  const totalComisionFriskuUSD = useMemo(()=>{
    return liqFiltradas.reduce((acc,liq)=>{
      const v = liq.monedaBase==="USD" ? liq.montoComisionFrisku : liq.montoComisionFriskuUSD;
      return acc + (Number(v)||0);
    },0);
  },[liqFiltradas]);
  // Liquidaciones en moneda ≠ USD sin conversión guardada (faltaba TC al guardar):
  // su comisión NO entra al Total en USD. Se avisa para no leer el $0 como cero real.
  const nLiqSinTC = useMemo(()=>
    liqFiltradas.filter(l=>l.monedaBase!=="USD" && l.montoComisionFriskuUSD==null).length
  ,[liqFiltradas]);

  // ── Handlers PO (notas de cobro al cliente) ──
  const handleNuevoPO = () => { setCreandoPO(true); setEditandoPO(null); };
  const handleEditarPO = (po) => { setCreandoPO(false); setEditandoPO(po); };
  const handleEliminarPO = (po) => {
    if(!window.confirm(`¿Eliminar PO "${po.numero||po.id?.slice(-6)}"? Esta acción no se puede deshacer.`)) return;
    setPos(prev=>prev.filter(p=>p.id!==po.id));
  };
  const handleGuardarPO = (po) => {
    if(creandoPO) setPos(prev=>[...prev, po]);
    else          setPos(prev=>prev.map(p=>p.id===po.id?po:p));
    setEditandoPO(null); setCreandoPO(false);
  };
  const handleAvanzarEstadoPO = (po, nuevoEstado) => {
    setPos(prev=>prev.map(p=>p.id===po.id
      ? {...p, estado:nuevoEstado, fechaActualizacion:new Date().toISOString()}
      : p));
  };

  const posFiltrados = useMemo(()=>{
    return pos.filter(po=>{
      if(filtroCliPO    && po.clienteId !== filtroCliPO)    return false;
      if(filtroEstadoPO && po.estado    !== filtroEstadoPO) return false;
      return true;
    }).sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||""));
  },[pos, filtroCliPO, filtroEstadoPO]);

  // ── Filtros Órdenes de Embarque ──
  const embarquesFiltrados = useMemo(()=>{
    const q = busquedaOE.toLowerCase();
    return embarques.filter(oe=>{
      if(filtroExpOE   && oe.exportadoraId !== filtroExpOE)   return false;
      if(filtroCliOE   && oe.clienteId     !== filtroCliOE)   return false;
      if(filtroEspOE   && oe.especieCodigo !== filtroEspOE)   return false;
      if(filtroEstadoOE && (oe.estado||"borrador") !== filtroEstadoOE) return false;
      if(filtroTempOE  && oe.temporada     !== filtroTempOE)  return false;
      if(filtroViaOE   && (oe.tipoEmbarque||"maritimo") !== filtroViaOE) return false;
      if(soloDocsIncompletos && !((oe.estado||"borrador")!=="cancelado" && comexEstado(oe).faltan>0)) return false;
      if(q) {
        const exp = exportadoras.find(e=>e.id===oe.exportadoraId)?.nombre||"";
        const cli = clientes.find(c=>c.id===oe.clienteId)?.nombre||"";
        const hayMatch = (oe.numero||"").toLowerCase().includes(q)
          || (oe.numeroContenedor||"").toLowerCase().includes(q)
          || exp.toLowerCase().includes(q)
          || cli.toLowerCase().includes(q)
          || (oe.origen||"").toLowerCase().includes(q)
          || (oe.destino||"").toLowerCase().includes(q)
          || (oe.navieraAerolinea||"").toLowerCase().includes(q);
        if(!hayMatch) return false;
      }
      return true;
    });
  },[embarques, filtroExpOE, filtroCliOE, filtroEspOE, filtroEstadoOE, filtroTempOE, filtroViaOE, soloDocsIncompletos, busquedaOE, exportadoras, clientes]);

  // Embarques (no cancelados) con documentos COMEX faltantes — para el contador/alerta
  const embarquesDocsIncompletos = useMemo(()=>
    embarques.filter(oe=>(oe.estado||"borrador")!=="cancelado" && comexEstado(oe).faltan>0).length,
  [embarques]);

  const hoy = new Date().toISOString().slice(0,10);
  const clientesConDocsFaltantes = clientes.filter(c =>
    c.activo !== false && TIPOS_DOC_MINIMOS.some(t => !(c.documentos||[]).some(d=>d.tipo===t&&d.url))
  ).length;

  // ── Tabs (lista filtrada por permisos) ──
  // Se declara antes de los early returns para que el useEffect siguiente
  // respete las rules of hooks.
  // Clientes y Exportadoras se renderizan dentro de Maestros como sub-tabs.
  // Los permisos permClientes/permExportadoras se siguen evaluando aquí y
  // se aplican dentro de los render-props que se pasan a FriskuModule.
  const renderClientesTab = () => (
    <div>
      {/* Toolbar */}
      <div style={{display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems:"center"}}>
        <input value={busquedaCli} onChange={e=>setBusquedaCli(e.target.value)}
          placeholder="Buscar cliente..." style={{...inputSt, flex:"1 1 240px", maxWidth:300}}/>
        <select value={filtroMercadoCli} onChange={e=>setFiltroMercadoCli(e.target.value)} style={{...inputSt, maxWidth:200}}>
          <option value="">— Todos los mercados —</option>
          {mercados.map(m => <option key={m.codigo} value={m.codigo}>{m.nombre}</option>)}
        </select>
        <select value={filtroEspecieCli} onChange={e=>setFiltroEspecieCli(e.target.value)} style={{...inputSt, maxWidth:200}}>
          <option value="">— Todas las especies —</option>
          {especies.map(e => <option key={e.codigo} value={e.codigo}>{e.icono} {e.nombreEs}</option>)}
        </select>
        <select value={filtroActivoCli} onChange={e=>setFiltroActivoCli(e.target.value)} style={{...inputSt, maxWidth:140}}>
          <option value="activos">● Activos</option>
          <option value="inactivos">○ Inactivos</option>
          <option value="todos">Todos</option>
        </select>
        <span style={{fontSize:11, color:C.muted}}>
          {clientesFiltrados.length} de {clientes.length}
        </span>
        {permClientes.canEdit && !editandoCli && (
          <button onClick={handleNuevoCliente} style={{...btnSt(C.green), marginLeft:"auto"}}>
            + Nuevo cliente
          </button>
        )}
        {!permClientes.canEdit && (
          <span style={{fontSize:10, padding:"3px 8px", borderRadius:4, background:`${C.blue}22`, color:C.blue, border:`1px solid ${C.blue}44`}}>
            👁 Solo lectura
          </span>
        )}
      </div>

      {/* Form de edición/creación */}
      {editandoCli && (
        <ClienteForm
          cliente={editandoCli}
          especies={especies}
          paises={paises}
          ciudades={ciudades}
          monedas={monedas}
          mercados={mercados}
          tiposEmbalaje={tiposEmbalaje}
          onGuardar={handleGuardarCliente}
          onCancelar={()=>{setEditandoCli(null); setCreandoCli(false);}}
        />
      )}

      {/* Grid de cards */}
      {!editandoCli && (
        clientesFiltrados.length === 0 ? (
          <div style={{padding:50, textAlign:"center", color:C.muted, fontSize:13, background:C.card, borderRadius:14}}>
            {clientes.length === 0
              ? "Aún no hay clientes. Click \"+ Nuevo cliente\" para crear el primero."
              : "Sin resultados con esos filtros."}
          </div>
        ) : (
          <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(380px, 1fr))", gap:14}}>
            {clientesFiltrados.map(c => (
              <ClienteCard key={c.id}
                cliente={c}
                especies={especies}
                paises={paises}
                monedas={monedas}
                mercados={mercados}
                onEditar={()=>handleEditarCliente(c)}
                onEliminar={()=>handleEliminarCliente(c)}
                canEdit={permClientes.canEdit}
              />
            ))}
          </div>
        )
      )}
    </div>
  );

  const renderExportadorasTab = () => (
    <div>
      {/* Toolbar */}
      <div style={{display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems:"center"}}>
        <input value={busquedaExp} onChange={e=>setBusquedaExp(e.target.value)}
          placeholder="Buscar exportadora..." style={{...inputSt, flex:"1 1 240px", maxWidth:300}}/>
        <select value={filtroPaisExp} onChange={e=>setFiltroPaisExp(e.target.value)} style={{...inputSt, maxWidth:200}}>
          <option value="">— Todos los países —</option>
          {paises.map(p => <option key={p.codigo} value={p.codigo}>{p.flag} {p.nombreEs}</option>)}
        </select>
        <select value={filtroEspecieExp} onChange={e=>setFiltroEspecieExp(e.target.value)} style={{...inputSt, maxWidth:200}}>
          <option value="">— Todas las especies —</option>
          {especies.map(e => <option key={e.codigo} value={e.codigo}>{e.icono} {e.nombreEs}</option>)}
        </select>
        <select value={filtroActivoExp} onChange={e=>setFiltroActivoExp(e.target.value)} style={{...inputSt, maxWidth:140}}>
          <option value="activos">● Activas</option>
          <option value="inactivos">○ Inactivas</option>
          <option value="todos">Todas</option>
        </select>
        <span style={{fontSize:11, color:C.muted}}>
          {exportadorasFiltradas.length} de {exportadoras.length}
        </span>
        {permExportadoras.canEdit && !editandoExp && (
          <button onClick={handleNuevaExportadora} style={{...btnSt(C.green), marginLeft:"auto"}}>
            + Nueva exportadora
          </button>
        )}
        {!permExportadoras.canEdit && (
          <span style={{fontSize:10, padding:"3px 8px", borderRadius:4, background:`${C.blue}22`, color:C.blue, border:`1px solid ${C.blue}44`}}>
            👁 Solo lectura
          </span>
        )}
      </div>

      {/* Form de edición/creación */}
      {editandoExp && (
        <ExportadoraForm
          exportadora={editandoExp}
          especies={especies}
          paises={paises}
          ciudades={ciudades}
          monedas={monedas}
          onGuardar={handleGuardarExportadora}
          onCancelar={()=>{setEditandoExp(null); setCreandoExp(false);}}
        />
      )}

      {/* Grid de cards */}
      {!editandoExp && (
        exportadorasFiltradas.length === 0 ? (
          <div style={{padding:50, textAlign:"center", color:C.muted, fontSize:13, background:C.card, borderRadius:14}}>
            {exportadoras.length === 0
              ? "Aún no hay exportadoras. Click \"+ Nueva exportadora\" para crear la primera."
              : "Sin resultados con esos filtros."}
          </div>
        ) : (
          <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(380px, 1fr))", gap:14}}>
            {exportadorasFiltradas.map(e => (
              <ExportadoraCard key={e.id}
                exportadora={e}
                especies={especies}
                paises={paises}
                monedas={monedas}
                onEditar={()=>handleEditarExportadora(e)}
                onEliminar={()=>handleEliminarExportadora(e)}
                canEdit={permExportadoras.canEdit}
              />
            ))}
          </div>
        )
      )}
    </div>
  );

  // Reportería BI consolida Dashboard + Reportes + Tablero BI (hojas internas).
  // Visible si el usuario tiene acceso a cualquiera de esas capacidades.
  const permReporteriaVis = { visible: permReporteria.visible || permReportes.visible || permTablero.visible || permResumen.visible };
  const tabsAll = [
    {id:"resumen",       label:"🏠 Resumen",        count:null,                              perm:permResumen},
    {id:"documentos",    label:"📁 Documentos",    count:clientesConDocsFaltantes||null,    perm:permDocumentos},
    {id:"contratos",     label:"📄 Contratos",     count:totalClosuresActivos||null,        perm:permContratos},
    {id:"programa",      label:"📅 Programa",      count:programa.length||null,             perm:permPrograma},
    {id:"embarques",     label:"🚢 Embarques",     count:embarques.length||null,            perm:permEmbarques},
    {id:"liquidaciones", label:"💰 Liquidaciones", count:liquidaciones.length||null,        perm:permLiquidaciones},
    {id:"bi",            label:"📊 Reportería BI", count:null,                              perm:permReporteriaVis},
    {id:"maestros",      label:"🗂️ Maestros + TC", count:null,                              perm:permMaestros},
  ];
  const tabs = tabsAll.filter(t => t.perm.visible);

  // Si el tab activo no es visible para este usuario, saltar al primero accesible
  useEffect(()=>{
    if (cargando) return;
    if (!tabs.find(t => t.id === tab) && tabs.length) {
      setTab(tabs[0].id);
    }
  },[tabs, tab, cargando]);

  // ── Render ──
  if(cargando) {
    return (
      <div style={{padding:40, textAlign:"center", color:C.muted, background:C.bg, minHeight:"100vh"}}>
        Cargando módulo Frisku Foods…
      </div>
    );
  }

  if (!tabs.length) {
    return (
      <div style={{padding:40, textAlign:"center", color:C.muted, background:C.bg, minHeight:"100vh"}}>
        Sin acceso a ningún tab de Frisku Foods. Contacta al administrador.
        {onBack && <div style={{marginTop:14}}><button onClick={onBack} style={btnSt(C.muted, true)}>← Volver</button></div>}
      </div>
    );
  }

  return (
   <FriskuBIProvider data={{ embarques, liquidaciones, clientes, exportadoras, especies, mercados, tiposEmbalaje }}>
    <div style={{background:C.bg, minHeight:"100vh", color:C.text}}>
      {/* Header */}
      <div style={{padding:"14px 20px", borderBottom:"1px solid rgba(255,255,255,0.10)", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10, background:"#1E2761", boxShadow:"0 4px 16px rgba(16,24,40,0.20)"}}>
        <div onClick={()=>setTab("resumen")} title="Ir al inicio de Frisku"
          style={{display:"flex", alignItems:"center", gap:14, cursor:"pointer"}}>
          <img
            src={`${process.env.PUBLIC_URL}/frisku.png`}
            alt="Frisku Foods"
            style={{height:44, objectFit:"contain", borderRadius:6}}
          />
          <div>
            <h2 style={{margin:0, fontSize:18, fontWeight:800, color:"#fff", lineHeight:1.2}}>Frisku Foods</h2>
            <div style={{fontSize:11, color:"rgba(255,255,255,0.6)", fontWeight:400}}>Connecting Quality</div>
          </div>
        </div>
        <div style={{display:"flex", alignItems:"center", gap:10, fontSize:11, color:"rgba(255,255,255,0.7)"}}>
          {Object.values(guardando).some(Boolean)
            ? <span style={{color:"#fde68a"}}>💾 Guardando...</span>
            : <span style={{color:"#6ee7b7"}}>● Sincronizado</span>}
          {tab!=="resumen" && (
            <button onClick={()=>setTab("resumen")} style={{background:"rgba(255,255,255,0.10)",border:"1px solid rgba(255,255,255,0.22)",color:"#fff",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:600}}>🏠 Inicio Frisku</button>
          )}
          {onBack && <button onClick={onBack} style={{background:"rgba(255,255,255,0.10)",border:"1px solid rgba(255,255,255,0.22)",color:"#fff",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:600}}>← Mediterra</button>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex", flexWrap:"wrap", gap:4, padding:"0 20px", borderBottom:`2px solid ${C.border}`, background:C.bg2}}>
        {tabs.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)}
            className={`mdt-tab${tab===t.id?" mdt-tab--active":""}`}
            style={{
              padding:"11px 16px", border:"none", cursor:"pointer", fontSize:12,
              background: tab===t.id ? C.card : "transparent",
              color: tab===t.id ? C.text : C.muted,
              fontWeight: tab===t.id ? 700 : 500,
              borderBottom: tab===t.id ? `3px solid ${C.blue}` : "3px solid transparent",
              marginBottom:-2, borderRadius:"6px 6px 0 0",
              display:"flex", alignItems:"center", gap:6,
            }}>
            <span>{t.label}</span>
            {t.count != null && (
              <span style={{
                fontSize:9, padding:"1px 6px", borderRadius:8,
                background: t.id==="documentos" ? C.accent : tab===t.id ? C.blue : C.border,
                color: (t.id==="documentos" || tab===t.id) ? "#fff" : C.muted, fontWeight:700,
              }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div style={{padding: tab==="maestros" ? 0 : 20}}>

        {tab === "resumen" && (()=>{
          // HOME OPERACIONAL — "qué necesita mi atención". El análisis del negocio
          // vive en 📊 Reportería BI (no se duplica aquí).
          const hoyStr = new Date().toISOString().slice(0,10);
          const proximos = embarques
            .filter(e=>(e.estado||"borrador")!=="cancelado" && (e.fechaDespacho||"")>=hoyStr)
            .sort((a,b)=>(a.fechaDespacho||"").localeCompare(b.fechaDespacho||"")).slice(0,6);
          const liqPend = liquidaciones.filter(l=>(l.estado||"borrador")!=="pagada").length;
          const alerta = (icon,titulo,detalle,valor,color,onClick)=>(
            <div onClick={onClick} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:C.card,border:`1px solid ${C.border}`,borderRadius:12,cursor:onClick?"pointer":"default",boxShadow:C.shadowSm}}>
              <div style={{fontSize:22}}>{icon}</div>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:700,color:C.text}}>{titulo}</div><div style={{fontSize:11,color:C.muted}}>{detalle}</div></div>
              <div style={{fontSize:24,fontWeight:800,color}}>{valor}</div>
            </div>
          );
          return (
            <div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,marginBottom:18}}>
                <Card title="Clientes activos" icon="👥"><div style={{fontSize:30,fontWeight:800,color:C.green}}>{totalClientesActivos}</div><div style={{color:C.muted,fontSize:11}}>de {clientes.length} totales</div></Card>
                <Card title="Exportadoras" icon="🏭"><div style={{fontSize:30,fontWeight:800,color:C.blue}}>{totalExportadorasActivas}</div><div style={{color:C.muted,fontSize:11}}>de {exportadoras.length} totales</div></Card>
                <Card title="Embarques activos" icon="🚢"><div style={{fontSize:30,fontWeight:800,color:C.teal}}>{embarques.filter(e=>(e.estado||"borrador")!=="cancelado").length}</div><div style={{color:C.muted,fontSize:11}}>{embarques.filter(e=>e.estado==="confirmado"||e.estado==="despachado").length} conf./desp.</div></Card>
                <Card title="Especies" icon="🍒"><div style={{fontSize:30,fontWeight:800,color:C.yellow}}>{especies.length}</div><div style={{color:C.muted,fontSize:11}}>en maestro</div></Card>
              </div>

              <div style={{fontSize:13,fontWeight:700,margin:"4px 0 10px"}}>Qué necesita tu atención</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(270px,1fr))",gap:10,marginBottom:20}}>
                {alerta("📁","Clientes sin documentos obligatorios","Ir a Documentos →",clientesConDocsFaltantes,clientesConDocsFaltantes>0?C.accent:C.green,()=>setTab("documentos"))}
                {alerta("⚠","Embarques con docs COMEX incompletos","Ver pendientes →",embarquesDocsIncompletos,embarquesDocsIncompletos>0?C.warning:C.green,()=>{ setSoloDocsIncompletos(true); setTab("embarques"); })}
                {alerta("💰","Liquidaciones no pagadas","Ir a Liquidaciones →",liqPend,liqPend>0?C.blue:C.green,()=>setTab("liquidaciones"))}
              </div>

              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",margin:"4px 0 10px"}}>
                <span style={{fontSize:13,fontWeight:700}}>Próximos embarques (ETD)</span>
                <button onClick={()=>setTab("embarques")} style={{...btnSt(C.muted,true),fontSize:11,padding:"4px 10px"}}>Ver todos →</button>
              </div>
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflowX:"auto",marginBottom:18}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5,minWidth:560}}>
                  <thead><tr style={{background:C.card2,color:C.muted,textAlign:"left"}}>
                    <th style={{padding:"8px 10px"}}>ETD</th><th style={{padding:"8px 10px"}}>N° OE</th><th style={{padding:"8px 10px"}}>Especie</th><th style={{padding:"8px 10px"}}>Exportador → Cliente</th><th style={{padding:"8px 10px"}}>Estado</th><th style={{padding:"8px 10px",textAlign:"center"}}>Docs</th>
                  </tr></thead>
                  <tbody>
                    {proximos.length===0 ? <tr><td colSpan={6} style={{padding:20,textAlign:"center",color:C.muted2}}>Sin embarques con ETD futura.</td></tr> :
                      proximos.map(oe=>{ const esp=especies.find(e=>e.codigo===oe.especieCodigo); const cx=comexEstado(oe);
                        return <tr key={oe.id} onClick={()=>setTab("embarques")} style={{cursor:"pointer",borderTop:`1px solid ${C.border}`}}>
                          <td style={{padding:"7px 10px",whiteSpace:"nowrap"}}>{oe.fechaDespacho||"—"}</td>
                          <td style={{padding:"7px 10px",fontFamily:"monospace",color:C.blue}}>{oe.numero||"—"}</td>
                          <td style={{padding:"7px 10px",whiteSpace:"nowrap"}}>{esp?`${esp.icono||""} ${esp.nombreEs}`:(oe.especieCodigo||"—")}</td>
                          <td style={{padding:"7px 10px"}}>{(exportadoras.find(x=>x.id===oe.exportadoraId)?.nombre||"—")} → {(clientes.find(c=>c.id===oe.clienteId)?.nombre||"—")}</td>
                          <td style={{padding:"7px 10px"}}>{oe.estado||"borrador"}</td>
                          <td style={{padding:"7px 10px",textAlign:"center"}}><span style={{fontSize:9,padding:"2px 7px",borderRadius:10,fontWeight:700,background:`${cx.completo?C.green:C.warning}22`,color:cx.completo?C.green:C.warning,border:`1px solid ${cx.completo?C.green:C.warning}55`}}>{cx.ok}/{cx.total}</span></td>
                        </tr>; })}
                  </tbody>
                </table>
              </div>

              <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                {canEditGlobal && <button onClick={()=>setImportando(true)} style={{...btnSt(C.blue),padding:"8px 14px",fontSize:12}}>📥 Importar Excel (Clientes/Exportadoras)</button>}
                <span style={{fontSize:11,color:C.muted2}}>Resumen = qué necesita tu atención. El análisis del negocio (KPIs, gráficos, exploración) está en <b>📊 Reportería BI</b>.</span>
              </div>
            </div>
          );
        })()}

        {tab === "documentos" && (
          <DocumentosTab
            clientes={clientes}
            embarques={embarques}
            exportadoras={exportadoras}
            especies={especies}
            onVerEmbarque={(oe)=>{ setVerOE(oe); setTab("embarques"); }}
          />
        )}

        {tab === "contratos" && (
          <div>
            {/* Toolbar */}
            <div style={{display:"flex", gap:8, marginBottom:16, flexWrap:"wrap", alignItems:"center"}}>
              <input value={busquedaClosure} onChange={e=>setBusquedaClosure(e.target.value)}
                placeholder="Buscar temporada, código, empresa…" style={{...inputSt, flex:"1 1 220px", maxWidth:280}}/>
              <SelectBuscable listId="flt-clo-exp" value={filtroExpClosure} onChange={setFiltroExpClosure}
                placeholder="🔍 Exportadora" style={{...inputSt, maxWidth:190}}
                options={exportadoras.filter(e=>e.activo!==false).slice().sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||"")).map(e=>({value:e.id, label:e.nombre}))}/>
              <SelectBuscable listId="flt-clo-cli" value={filtroCliClosure} onChange={setFiltroCliClosure}
                placeholder="🔍 Cliente" style={{...inputSt, maxWidth:190}}
                options={clientes.filter(c=>c.activo!==false).slice().sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||"")).map(c=>({value:c.id, label:c.nombre}))}/>
              <SelectBuscable listId="flt-clo-esp" value={filtroEspClosure} onChange={setFiltroEspClosure}
                placeholder="🔍 Especie" style={{...inputSt, maxWidth:170}}
                options={especies.slice().sort((a,b)=>(a.nombreEs||"").localeCompare(b.nombreEs||"")).map(e=>({value:e.codigo, label:e.nombreEs}))}/>
              <select value={filtroEstadoClosure} onChange={e=>setFiltroEstadoClosure(e.target.value)} style={{...inputSt, maxWidth:130}}>
                <option value="activo">● Activos</option>
                <option value="cerrado">✓ Cerrados</option>
                <option value="cancelado">✗ Cancelados</option>
                <option value="todos">Todos</option>
              </select>
              <span style={{fontSize:11, color:C.muted}}>{closuresFiltrados.length} de {contratos.length}</span>
              {permContratos.canEdit && !editandoClosure && (
                <button onClick={handleNuevoClosure} style={{...btnSt(C.green), marginLeft:"auto"}}>
                  + Nuevo Business Closure
                </button>
              )}
              {!permContratos.canEdit && (
                <span style={{fontSize:10, padding:"3px 8px", borderRadius:4, background:`${C.blue}22`, color:C.blue, border:`1px solid ${C.blue}44`}}>
                  👁 Solo lectura
                </span>
              )}
            </div>

            {/* Form */}
            {editandoClosure && (
              <ClosureForm
                closure={editandoClosure}
                exportadoras={exportadoras}
                clientes={clientes}
                especies={especies}
                tiposEmbalaje={tiposEmbalaje}
                monedas={monedas}
                temporadas={temporadas}
                onGuardar={handleGuardarClosure}
                onCancelar={()=>{setEditandoClosure(null); setCreandoClosure(false);}}
              />
            )}

            {/* Detalle (Ver) — solo lectura; conserva los filtros del listado */}
            {!editandoClosure && verClosure && (
              <div>
                <div style={{display:"flex", gap:8, alignItems:"center", marginBottom:12, flexWrap:"wrap"}}>
                  <button onClick={()=>setVerClosure(null)} style={{...btnSt(C.muted,true), fontSize:12}}>← Volver a Contratos</button>
                  {permContratos.canEdit && <button onClick={()=>{ const bc=verClosure; setVerClosure(null); handleEditarClosure(bc); }} style={{...btnSt(C.blue), fontSize:12}}>✎ Editar</button>}
                  {permContratos.canEdit && <button onClick={()=>{ handleEliminarClosure(verClosure); setVerClosure(null); }} style={{...btnSt(C.accent,true), fontSize:12}}>× Eliminar</button>}
                </div>
                <div style={{maxWidth:520}}>
                  <ClosureCard closure={verClosure} exportadoras={exportadoras} clientes={clientes} especies={especies} tiposEmbalaje={tiposEmbalaje} monedas={monedas} onEditar={()=>{}} onEliminar={()=>{}} canEdit={false}/>
                </div>
              </div>
            )}

            {/* Listado compacto (click fila = Ver) */}
            {!editandoClosure && !verClosure && (
              closuresFiltrados.length===0 ? (
                <div style={{padding:50, textAlign:"center", color:C.muted, fontSize:13, background:C.card, borderRadius:14}}>
                  {contratos.length===0
                    ? "Sin Business Closures. Click \"+ Nuevo Business Closure\" para crear el primero."
                    : "Sin resultados con esos filtros."}
                </div>
              ) : (
                <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:12, overflowX:"auto"}}>
                  <table style={{width:"100%", borderCollapse:"collapse", fontSize:11.5, minWidth:820}}>
                    <thead><tr style={{background:C.card2, color:C.muted, textAlign:"left"}}>
                      <th style={{padding:"8px 10px"}}>Exportador → Cliente</th>
                      <th style={{padding:"8px 10px"}}>Especie</th>
                      <th style={{padding:"8px 10px"}}>Temporada</th>
                      <th style={{padding:"8px 10px", textAlign:"right"}}>Cajas</th>
                      <th style={{padding:"8px 10px"}}>Condición</th>
                      <th style={{padding:"8px 10px", textAlign:"center"}}>Estado</th>
                      <th style={{padding:"8px 10px", textAlign:"right"}}>Acciones</th>
                    </tr></thead>
                    <tbody>
                      {closuresFiltrados.map(bc=>{
                        const exp=exportadoras.find(e=>e.id===bc.exportadoraId), cli=clientes.find(c=>c.id===bc.clienteId), esp=especies.find(e=>e.codigo===bc.especieCodigo);
                        const cajas=Object.values(bc.cajasPorFormato||{}).reduce((s,v)=>s+Number(v||0),0);
                        const fmts=Object.entries(bc.cajasPorFormato||{}).filter(([,v])=>Number(v)>0).map(([cod])=>(tiposEmbalaje.find(t=>t.codigo===cod)?.nombre||cod)).join(", ");
                        const ec={activo:C.green,cerrado:C.blue,cancelado:C.muted}[bc.estado||"activo"]||C.muted;
                        const el={activo:"● Activo",cerrado:"✓ Cerrado",cancelado:"✗ Cancelado"}[bc.estado||"activo"];
                        const td={padding:"7px 10px", borderTop:`1px solid ${C.border}`, verticalAlign:"middle"};
                        return (
                          <tr key={bc.id} onClick={()=>setVerClosure(bc)} title="Ver detalle"
                            style={{cursor:"pointer", opacity:bc.estado==="cancelado"?0.6:1}}>
                            <td style={{...td}}>
                              <div style={{fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:280}}>{exp?.nombre||"—"} <span style={{color:C.muted}}>→</span> {cli?.nombre||"—"}</div>
                              {(bc.codigo||fmts) && <div style={{fontSize:9.5, color:C.muted2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:280}}>{bc.codigo?`${bc.codigo} · `:""}{fmts}</div>}
                            </td>
                            <td style={{...td, whiteSpace:"nowrap"}}>{esp?`${esp.icono||""} ${esp.nombreEs}`:(bc.especieCodigo||"—")}</td>
                            <td style={{...td, whiteSpace:"nowrap"}}>{bc.temporada||"—"}</td>
                            <td style={{...td, textAlign:"right", fontFamily:"monospace", fontWeight:700}}>{cajas>0?cajas.toLocaleString("es-CL"):"—"}</td>
                            <td style={{...td, color:C.blue, fontWeight:600, whiteSpace:"nowrap"}}>{bc.condiciones||"—"}</td>
                            <td style={{...td, textAlign:"center"}}><span style={{fontSize:9, padding:"2px 7px", borderRadius:4, background:`${ec}22`, color:ec, border:`1px solid ${ec}44`, fontWeight:700, whiteSpace:"nowrap"}}>{el}</span></td>
                            <td style={{...td, textAlign:"right", whiteSpace:"nowrap"}} onClick={e=>e.stopPropagation()}>
                              <button onClick={()=>setVerClosure(bc)} title="Ver" style={{...btnSt(C.teal,true), padding:"3px 8px", fontSize:10, marginRight:3}}>👁 Ver</button>
                              {permContratos.canEdit && <button onClick={()=>handleEditarClosure(bc)} title="Editar" style={{...btnSt(C.blue,true), padding:"3px 7px", fontSize:10, marginRight:3}}>✎</button>}
                              {permContratos.canEdit && <button onClick={()=>handleEliminarClosure(bc)} title="Eliminar" style={{...btnSt(C.accent,true), padding:"3px 7px", fontSize:10}}>×</button>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        )}
        {tab === "programa" && (
          <div>
            {/* Perspectiva (misma data, distinta agrupación) */}
            <div style={{display:"flex", gap:6, marginBottom:12, flexWrap:"wrap", alignItems:"center"}}>
              <span style={{fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase", marginRight:2}}>Ver por</span>
              {[{k:"closure",l:"📄 Business Closure"},{k:"especie",l:"🍒 Especie"},{k:"cliente",l:"👥 Cliente"},{k:"exportador",l:"🏭 Exportador"},{k:"semana",l:"📅 Semana"}].map(p=>(
                <button key={p.k} onClick={()=>setPerspProg(p.k)}
                  style={{fontSize:11,fontWeight:700,padding:"6px 11px",borderRadius:7,cursor:"pointer",border:`1px solid ${perspProg===p.k?C.blue:C.border}`,background:perspProg===p.k?C.blue:C.card,color:perspProg===p.k?"#fff":C.muted}}>{p.l}</button>
              ))}
            </div>
            {/* Filtros */}
            <div style={{display:"flex", flexWrap:"wrap", gap:8, marginBottom:16, alignItems:"center"}}>
              <SelectBuscable listId="flt-prog-temp" value={filtroProgramaTemp} onChange={setFiltroProgramaTemp}
                placeholder="🔍 Todas las temporadas" style={{...inputSt, maxWidth:160, fontSize:11}}
                options={temporadas.map(t=>({value:t, label:`Temporada ${t}`}))}/>
              <SelectBuscable listId="flt-prog-exp" value={filtroProgramaExp} onChange={setFiltroProgramaExp}
                placeholder="🔍 Todas las exportadoras" style={{...inputSt, maxWidth:190, fontSize:11}}
                options={exportadoras.filter(e=>e.activo!==false).sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||"")).map(e=>({value:e.id, label:e.nombre}))}/>
              <SelectBuscable listId="flt-prog-cli" value={filtroProgramaCli} onChange={setFiltroProgramaCli}
                placeholder="🔍 Todos los clientes" style={{...inputSt, maxWidth:190, fontSize:11}}
                options={clientes.filter(c=>c.activo!==false).sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||"")).map(c=>({value:c.id, label:c.nombre}))}/>
              <SelectBuscable listId="flt-prog-esp" value={filtroProgramaEsp} onChange={setFiltroProgramaEsp}
                placeholder="🔍 Todas las especies" style={{...inputSt, maxWidth:150, fontSize:11}}
                options={especies.map(e=>({value:e.codigo, label:e.nombreEs}))}/>
              <SelectBuscable listId="flt-prog-closure" value={filtroProgramaClosure} onChange={setFiltroProgramaClosure}
                placeholder="🔍 Ir a un Business Closure" style={{...inputSt, maxWidth:300, fontSize:11}}
                options={closuresOpciones.map(bc=>{
                  const exp = exportadoras.find(e=>e.id===bc.exportadoraId)?.nombre||"?";
                  const cli = clientes.find(c=>c.id===bc.clienteId)?.nombre||"?";
                  const esp = especies.find(e=>e.codigo===bc.especieCodigo);
                  return {value:bc.id, label:`${exp} → ${cli} · ${esp?esp.nombreEs:bc.especieCodigo} · ${bc.temporada}`};
                })}/>
              {(filtroProgramaTemp||filtroProgramaExp||filtroProgramaCli||filtroProgramaEsp||filtroProgramaClosure) && (
                <button onClick={()=>{setFiltroProgramaTemp(""); setFiltroProgramaExp(""); setFiltroProgramaCli(""); setFiltroProgramaEsp(""); setFiltroProgramaClosure("");}}
                  style={{...btnSt(C.muted,true), fontSize:11}}>✕ Limpiar</button>
              )}
              <span style={{marginLeft:"auto", fontSize:11, color:C.muted}}>
                {closuresParaPrograma.length} Business Closure{closuresParaPrograma.length!==1?"s":""}
              </span>
            </div>

            {/* Perspectiva por Semana */}
            {perspProg==="semana" && (
              <ProgramaPorSemana closures={closuresParaPrograma} semanasPorClosure={semanasPorClosure}
                exportadoras={exportadoras} clientes={clientes} especies={especies}/>
            )}

            {/* Perspectivas agrupadas (Especie / Cliente / Exportador) — misma data */}
            {(perspProg==="especie"||perspProg==="cliente"||perspProg==="exportador") && (
              <ProgramaPerspectiva perspectiva={perspProg} closures={closuresParaPrograma}
                semanasPorClosure={semanasPorClosure} exportadoras={exportadoras} clientes={clientes} especies={especies}/>
            )}

            {/* Paneles por closure (perspectiva por defecto, editable) */}
            {perspProg==="closure" && (closuresParaPrograma.length === 0 ? (
              contratos.length === 0 ? (
                <div style={{padding:40, textAlign:"center", color:C.muted, fontSize:13}}>
                  No hay Business Closures registrados. Crea uno en el tab "📄 Contratos".
                </div>
              ) : (
                <div style={{padding:40, textAlign:"center", color:C.muted, fontSize:13}}>
                  Ningún Business Closure coincide con los filtros seleccionados.
                </div>
              )
            ) : (
              closuresParaPrograma.map(bc=>(
                <ClosureProgramaPanel
                  key={bc.id}
                  closure={bc}
                  semanas={semanasPorClosure[bc.id]||[]}
                  tiposEmbalaje={tiposEmbalaje}
                  exportadoras={exportadoras}
                  clientes={clientes}
                  especies={especies}
                  canEdit={permPrograma.canEdit}
                  editandoSemana={editandoSemana}
                  closureIdParaSemana={closureIdParaSemana}
                  onAgregarSemana={handleAgregarSemana}
                  onEditarSemana={handleEditarSemana}
                  onEliminarSemana={handleEliminarSemana}
                  onGuardarSemana={handleGuardarSemana}
                  onCancelarSemana={handleCancelarSemana}
                />
              ))
            ))}
          </div>
        )}
        {tab === "embarques" && (
          <div>
            {/* Formulario */}
            {(creandoOE || editandoOE) && (
              <OEForm
                oe={editandoOE}
                exportadoras={exportadoras}
                clientes={clientes}
                notifys={notifys}
                especies={especies}
                tiposEmbalaje={tiposEmbalaje}
                contratos={contratos}
                puertos={puertos}
                aeropuertos={aeropuertos}
                shippingLines={shippingLines}
                lineasAereas={lineasAereas}
                temporadas={temporadas}
                onGuardar={handleGuardarOE}
                onCancelar={()=>{ setEditandoOE(null); setCreandoOE(false); }}
              />
            )}

            {/* Detalle de embarque (Ver) — conserva filtros/búsqueda del listado */}
            {!creandoOE && !editandoOE && verOE && (
              <OEDetalle oe={verOE} exportadoras={exportadoras} clientes={clientes} especies={especies} tiposEmbalaje={tiposEmbalaje}
                contratos={contratos} liquidaciones={liquidaciones}
                onBack={()=>setVerOE(null)}
                onEditar={(o)=>{ setVerOE(null); handleEditarOE(o); }}
                onGuardarPL={(pl)=>{ setEmbarques(prev=>prev.map(e=>e.id===verOE.id?{...e,packingList:pl,estado:pl.pallets?.length>0&&e.estado==="confirmado"?"despachado":e.estado}:e)); setVerOE(v=>v&&({...v,packingList:pl})); }}
                onGuardarCOMEX={(cx)=>{ setEmbarques(prev=>prev.map(e=>e.id===verOE.id?{...e,carpetaComex:cx}:e)); setVerOE(v=>v&&({...v,carpetaComex:cx})); }}
                canEdit={permEmbarques.canEdit}/>
            )}

            {!creandoOE && !editandoOE && !verOE && (
              <>
                {/* Toolbar */}
                <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:14}}>
                  <input
                    value={busquedaOE} onChange={e=>setBusquedaOE(e.target.value)}
                    placeholder="Buscar número, empresa, ruta..."
                    style={{flex:1,minWidth:180,padding:"6px 10px",background:C.input,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:12}}
                  />
                  <select value={filtroTempOE} onChange={e=>setFiltroTempOE(e.target.value)}
                    style={{padding:"6px 8px",background:C.input,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:12}}>
                    <option value="">Todas las temp.</option>
                    {temporadas.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                  {(() => { const fltSt={padding:"6px 8px",background:C.input,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:12}; return (<>
                  <SelectBuscable listId="flt-oe-exp" value={filtroExpOE} onChange={setFiltroExpOE}
                    placeholder="🔍 Todas las exp." style={fltSt}
                    options={exportadoras.filter(e=>e.activo!==false).slice().sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||"")).map(e=>({value:e.id, label:e.nombre}))}/>
                  <SelectBuscable listId="flt-oe-cli" value={filtroCliOE} onChange={setFiltroCliOE}
                    placeholder="🔍 Todos los clientes" style={fltSt}
                    options={clientes.filter(c=>c.activo!==false).slice().sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||"")).map(c=>({value:c.id, label:c.nombre}))}/>
                  <SelectBuscable listId="flt-oe-esp" value={filtroEspOE} onChange={setFiltroEspOE}
                    placeholder="🔍 Todas las especies" style={fltSt}
                    options={especies.slice().sort((a,b)=>(a.nombreEs||"").localeCompare(b.nombreEs||"")).map(e=>({value:e.codigo, label:e.nombreEs}))}/>
                  </>); })()}
                  <select value={filtroEstadoOE} onChange={e=>setFiltroEstadoOE(e.target.value)}
                    style={{padding:"6px 8px",background:C.input,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:12}}>
                    <option value="">Todos los estados</option>
                    <option value="borrador">Borrador</option>
                    <option value="confirmado">Confirmado</option>
                    <option value="despachado">Despachado</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                  <select value={filtroViaOE} onChange={e=>setFiltroViaOE(e.target.value)}
                    style={{padding:"6px 8px",background:C.input,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:12}}>
                    <option value="">Toda vía</option>
                    <option value="maritimo">🚢 Marítimo</option>
                    <option value="aereo">✈ Aéreo</option>
                  </select>
                  {permEmbarques.canEdit && (
                    <button onClick={handleNuevaOE} style={{...btnSt(C.blue), marginLeft:"auto", whiteSpace:"nowrap"}}>
                      + Nueva OE
                    </button>
                  )}
                </div>

                {/* Conteo + alerta de documentos */}
                <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:10}}>
                  <span style={{fontSize:11,color:C.muted}}>
                    {embarquesFiltrados.length} orden{embarquesFiltrados.length!==1?"es":""} de embarque
                    {embarquesFiltrados.length !== embarques.length && ` (${embarques.length} total)`}
                  </span>
                  <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
                    <span style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase"}}>Ver por</span>
                    {[["lista","☰ Lista"],["cards","▦ Tarjetas"],["semana","📅 Semana ETD"],["cliente","👥 Cliente"],["exportador","🏭 Exportador"],["especie","🍒 Especie"],["estado","◔ Estado"]].map(([k,l])=>(
                      <button key={k} onClick={()=>setVistaOE(k)} title={l}
                        style={{padding:"4px 9px",fontSize:11,fontWeight:700,cursor:"pointer",borderRadius:6,border:`1px solid ${vistaOE===k?C.blue:C.border}`,background:vistaOE===k?C.blue:"transparent",color:vistaOE===k?"#fff":C.muted}}>{l}</button>
                    ))}
                  </div>
                  {embarquesDocsIncompletos > 0 && (
                    <button
                      onClick={()=>setSoloDocsIncompletos(v=>!v)}
                      title="Mostrar solo los embarques con documentos COMEX por cargar"
                      style={{
                        display:"inline-flex",alignItems:"center",gap:6,cursor:"pointer",
                        fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,
                        background: soloDocsIncompletos ? C.warning : `${C.warning}22`,
                        color: soloDocsIncompletos ? "#fff" : C.warning,
                        border:`1px solid ${C.warning}${soloDocsIncompletos?"":"55"}`,
                      }}>
                      ⚠ {embarquesDocsIncompletos} con docs incompletos
                      {soloDocsIncompletos && <span style={{opacity:0.85}}>· quitar filtro</span>}
                    </button>
                  )}
                </div>

                {/* Lista o tarjetas */}
                {(()=>{
                  const onPL = (oe)=>(pl)=>setEmbarques(prev=>prev.map(e=>e.id===oe.id?{...e,packingList:pl,estado:pl.pallets?.length>0&&e.estado==="confirmado"?"despachado":e.estado}:e));
                  const onCX = (oe)=>(cx)=>setEmbarques(prev=>prev.map(e=>e.id===oe.id?{...e,carpetaComex:cx}:e));
                  if(embarquesFiltrados.length === 0){
                    return <div style={{textAlign:"center",padding:40,color:C.muted,fontSize:13}}>
                      {embarques.length === 0 ? "No hay órdenes de embarque. Crea la primera con + Nueva OE." : "No hay OE que coincidan con los filtros."}
                    </div>;
                  }
                  if(vistaOE==="cards"){
                    return <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:14}}>
                      {embarquesFiltrados.map(oe=>(
                        <OECard key={oe.id} oe={oe} exportadoras={exportadoras} clientes={clientes} especies={especies} tiposEmbalaje={tiposEmbalaje}
                          onEditar={()=>handleEditarOE(oe)} onEliminar={()=>handleEliminarOE(oe)}
                          onGuardarPL={onPL(oe)} onGuardarCOMEX={onCX(oe)} canEdit={permEmbarques.canEdit}/>
                      ))}
                    </div>;
                  }
                  if(["semana","cliente","exportador","especie","estado"].includes(vistaOE)){
                    return <OEPerspectiva dim={vistaOE} embarques={embarquesFiltrados} exportadoras={exportadoras} clientes={clientes} especies={especies} tiposEmbalaje={tiposEmbalaje} onVer={(oe)=>setVerOE(oe)}/>;
                  }
                  // Vista lista (tabla compacta, filas expandibles)
                  return <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5,minWidth:920}}>
                      <thead>
                        <tr style={{background:C.card2,color:C.muted,textAlign:"left"}}>
                          <th style={{padding:"8px 10px",fontWeight:700,width:26}}></th>
                          <th style={{padding:"8px 10px",fontWeight:700}}>N° OE</th>
                          <th style={{padding:"8px 10px",fontWeight:700}}>Especie</th>
                          <th style={{padding:"8px 10px",fontWeight:700}}>Exportadora → Cliente</th>
                          <th style={{padding:"8px 10px",fontWeight:700,textAlign:"center"}}>Vía</th>
                          <th style={{padding:"8px 10px",fontWeight:700,textAlign:"right"}}>Cajas</th>
                          <th style={{padding:"8px 10px",fontWeight:700}}>ETD</th>
                          <th style={{padding:"8px 10px",fontWeight:700}}>ETA</th>
                          <th style={{padding:"8px 10px",fontWeight:700,textAlign:"center"}}>Estado</th>
                          <th style={{padding:"8px 10px",fontWeight:700,textAlign:"center"}}>Docs</th>
                          <th style={{padding:"8px 10px",fontWeight:700,textAlign:"right"}}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {embarquesFiltrados.map(oe=>(
                          <OERow key={oe.id} oe={oe} exportadoras={exportadoras} clientes={clientes} especies={especies}
                            onVer={()=>setVerOE(oe)} onEditar={()=>handleEditarOE(oe)} onEliminar={()=>handleEliminarOE(oe)} canEdit={permEmbarques.canEdit}/>
                        ))}
                      </tbody>
                    </table>
                  </div>;
                })()}
              </>
            )}
          </div>
        )}
        {tab === "liquidaciones" && (
          <div>
            {/* Toggle de vista: Liquidaciones | PO (cobro cliente) */}
            <div style={{display:"flex", gap:6, marginBottom:16}}>
              <button
                onClick={()=>setLiqView("liq")}
                style={{
                  ...btnSt(liqView==="liq"?C.blue:C.muted, liqView!=="liq"),
                  fontSize:13, padding:"8px 18px"
                }}
              >Liquidaciones</button>
              <button
                onClick={()=>setLiqView("po")}
                style={{
                  ...btnSt(liqView==="po"?C.teal:C.muted, liqView!=="po"),
                  fontSize:13, padding:"8px 18px"
                }}
              >PO · Cobro cliente</button>
            </div>

            {liqView==="liq" && (<>
            {/* Form */}
            {(creandoLiq || editandoLiq) && (
              <LiquidacionForm
                liq={editandoLiq}
                embarques={embarques}
                clientes={clientes}
                exportadoras={exportadoras}
                especies={especies}
                monedas={monedas}
                tiposEmbalaje={tiposEmbalaje}
                tcData={tcData}
                onGuardar={handleGuardarLiq}
                onCancelar={()=>{setEditandoLiq(null); setCreandoLiq(false);}}
              />
            )}

            {!creandoLiq && !editandoLiq && (
              <>
                {/* Toolbar */}
                <div style={{display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:14}}>
                  <select value={filtroEstadoLiq} onChange={e=>setFiltroEstadoLiq(e.target.value)} style={{...inputSt, maxWidth:140}}>
                    <option value="">Todos los estados</option>
                    <option value="borrador">Borrador</option>
                    <option value="enviada">Enviada</option>
                    <option value="pagada">Pagada</option>
                  </select>
                  <select value={filtroTempLiq} onChange={e=>setFiltroTempLiq(e.target.value)} style={{...inputSt, maxWidth:150}}>
                    <option value="">Todas las temp.</option>
                    {temporadas.map(t=><option key={t} value={t}>T{t}</option>)}
                  </select>
                  <SelectBuscable listId="flt-liq-exp" value={filtroExpLiq} onChange={setFiltroExpLiq}
                    placeholder="🔍 Todas las exp." style={{...inputSt, maxWidth:180}}
                    options={exportadoras.filter(e=>e.activo!==false).slice().sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||"")).map(e=>({value:e.id, label:e.nombre}))}/>
                  <SelectBuscable listId="flt-liq-cli" value={filtroCliLiq} onChange={setFiltroCliLiq}
                    placeholder="🔍 Todos los clientes" style={{...inputSt, maxWidth:180}}
                    options={clientes.filter(c=>c.activo!==false).slice().sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||"")).map(c=>({value:c.id, label:c.nombre}))}/>
                  {(filtroEstadoLiq||filtroTempLiq||filtroExpLiq||filtroCliLiq) && (
                    <button
                      onClick={()=>{setFiltroEstadoLiq(""); setFiltroTempLiq(""); setFiltroExpLiq(""); setFiltroCliLiq("");}}
                      style={{...btnSt(C.muted,true), fontSize:11}}
                    >✕ Limpiar</button>
                  )}
                  <span style={{fontSize:11, color:C.muted}}>{liqFiltradas.length} de {liquidaciones.length}</span>
                  <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
                    <span style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase"}}>Ver por</span>
                    {[["lista","☰ Lista"],["cliente","👥 Cliente"],["exportador","🏭 Exportador"],["estado","◔ Estado"],["temporada","🗓 Temporada"]].map(([k,l])=>(
                      <button key={k} onClick={()=>setVistaLiq(k)} title={l}
                        style={{padding:"4px 9px",fontSize:11,fontWeight:700,cursor:"pointer",borderRadius:6,border:`1px solid ${vistaLiq===k?C.blue:C.border}`,background:vistaLiq===k?C.blue:"transparent",color:vistaLiq===k?"#fff":C.muted}}>{l}</button>
                    ))}
                  </div>
                  {(totalComisionFriskuUSD>0 || nLiqSinTC>0) && (
                    <span style={{fontSize:12, fontWeight:700, color:C.green, marginLeft:4}}>
                      Total Frisku: USD {totalComisionFriskuUSD.toLocaleString("es-CL",{minimumFractionDigits:2,maximumFractionDigits:2})}
                      {nLiqSinTC>0 && <span style={{color:C.accent, fontWeight:600}} title="Liquidaciones en otra moneda sin TC cargado: no suman al total en USD"> · {nLiqSinTC} sin TC</span>}
                    </span>
                  )}
                  {permLiquidaciones.canEdit && (
                    <button onClick={handleNuevaLiq} style={{...btnSt(C.green), marginLeft:"auto", whiteSpace:"nowrap"}}>
                      + Nueva liquidación
                    </button>
                  )}
                  {!permLiquidaciones.canEdit && (
                    <span style={{fontSize:10, padding:"3px 8px", borderRadius:4, background:`${C.blue}22`, color:C.blue, border:`1px solid ${C.blue}44`}}>
                      👁 Solo lectura
                    </span>
                  )}
                </div>

                {/* Detalle (Ver) — solo lectura; conserva filtros del listado */}
                {verLiq && (
                  <div>
                    <div style={{display:"flex", gap:8, alignItems:"center", marginBottom:12, flexWrap:"wrap"}}>
                      <button onClick={()=>setVerLiq(null)} style={{...btnSt(C.muted,true), fontSize:12}}>← Volver a Liquidaciones</button>
                      {permLiquidaciones.canEdit && <button onClick={()=>{ const l=verLiq; setVerLiq(null); handleEditarLiq(l); }} style={{...btnSt(C.blue), fontSize:12}}>✎ Editar</button>}
                    </div>
                    <div style={{maxWidth:420}}>
                      <LiquidacionCard liq={verLiq} embarques={embarques} clientes={clientes} exportadoras={exportadoras} especies={especies} monedas={monedas} onEditar={()=>{}} onEliminar={()=>{}} onAvanzarEstado={()=>{}} canEdit={false}/>
                    </div>
                  </div>
                )}

                {/* Perspectiva agrupada de liquidaciones */}
                {!verLiq && vistaLiq!=="lista" && (
                  <LiqPerspectiva dim={vistaLiq} liqs={liqFiltradas} embarques={embarques} exportadoras={exportadoras} clientes={clientes} especies={especies} onVer={(l)=>setVerLiq(l)}/>
                )}

                {/* Listado compacto (click fila = Ver) */}
                {!verLiq && vistaLiq==="lista" && (liqFiltradas.length===0 ? (
                  <div style={{padding:50, textAlign:"center", color:C.muted, fontSize:13, background:C.card, borderRadius:14}}>
                    {liquidaciones.length===0
                      ? 'Sin liquidaciones. Click "+ Nueva liquidación" para crear la primera.'
                      : "Sin resultados con esos filtros."}
                  </div>
                ) : (
                  <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:12, overflowX:"auto"}}>
                    <table style={{width:"100%", borderCollapse:"collapse", fontSize:11.5, minWidth:760}}>
                      <thead><tr style={{background:C.card2, color:C.muted, textAlign:"left"}}>
                        <th style={{padding:"8px 10px"}}>Fecha</th>
                        <th style={{padding:"8px 10px"}}>OE</th>
                        <th style={{padding:"8px 10px"}}>Exportador → Cliente</th>
                        <th style={{padding:"8px 10px"}}>Especie</th>
                        <th style={{padding:"8px 10px", textAlign:"right"}}>Venta USD</th>
                        <th style={{padding:"8px 10px", textAlign:"right"}}>Comisión Frisku</th>
                        <th style={{padding:"8px 10px", textAlign:"center"}}>Estado</th>
                        <th style={{padding:"8px 10px", textAlign:"right"}}>Acciones</th>
                      </tr></thead>
                      <tbody>
                        {liqFiltradas.map(liq=>{
                          const oe=embarques.find(e=>e.id===liq.oeId), cli=clientes.find(c=>c.id===oe?.clienteId), exp=exportadoras.find(e=>e.id===oe?.exportadoraId), esp=especies.find(e=>e.codigo===oe?.especieCodigo);
                          const ei=LIQ_ESTADOS[liq.estado]||{label:liq.estado,color:C.muted2};
                          const td={padding:"7px 10px", borderTop:`1px solid ${C.border}`, verticalAlign:"middle"};
                          return (
                            <tr key={liq.id} onClick={()=>setVerLiq(liq)} title="Ver detalle" style={{cursor:"pointer"}}>
                              <td style={{...td, whiteSpace:"nowrap"}}>{liq.fechaLiquidacion||"—"}</td>
                              <td style={{...td, fontFamily:"monospace", color:C.blue, whiteSpace:"nowrap"}}>{oe?.numero||"—"}</td>
                              <td style={{...td}}><div style={{whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:240}}>{exp?.nombre||"—"} <span style={{color:C.muted}}>→</span> {cli?.nombre||"—"}</div></td>
                              <td style={{...td, whiteSpace:"nowrap"}}>{esp?`${esp.icono||""} ${esp.nombreEs}`:(oe?.especieCodigo||"—")}</td>
                              <td style={{...td, textAlign:"right", fontFamily:"monospace"}}>{(liq.monedaBase!=="USD" && liq.ventaTotalUSD==null) ? <span style={{color:C.muted2}} title={`Sin TC ${liq.monedaBase}→USD para esta fecha`}>—</span> : fmtUSD0(mVentaUSD(liq))}</td>
                              <td style={{...td, textAlign:"right", fontFamily:"monospace", color:C.green, fontWeight:700}}>{(liq.monedaBase!=="USD" && liq.montoComisionFriskuUSD==null) ? <span style={{color:C.muted2, fontWeight:400}} title={`Sin TC ${liq.monedaBase}→USD para esta fecha`}>—</span> : fmtUSD0(mComFriskuUSD(liq))}</td>
                              <td style={{...td, textAlign:"center"}}><span style={{fontSize:9, padding:"2px 8px", borderRadius:10, background:`${ei.color}22`, color:ei.color, border:`1px solid ${ei.color}44`, fontWeight:700, whiteSpace:"nowrap"}}>{ei.label}</span></td>
                              <td style={{...td, textAlign:"right", whiteSpace:"nowrap"}} onClick={e=>e.stopPropagation()}>
                                <button onClick={()=>setVerLiq(liq)} title="Ver" style={{...btnSt(C.teal,true), padding:"3px 8px", fontSize:10, marginRight:3}}>👁 Ver</button>
                                {permLiquidaciones.canEdit && <button onClick={()=>handleEditarLiq(liq)} title="Editar" style={{...btnSt(C.blue,true), padding:"3px 7px", fontSize:10, marginRight:3}}>✎</button>}
                                {permLiquidaciones.canEdit && <button onClick={()=>handleEliminarLiq(liq)} title="Eliminar" style={{...btnSt(C.accent,true), padding:"3px 7px", fontSize:10}}>×</button>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
              </>
            )}
            </>)}

            {liqView==="po" && (<>
              {(creandoPO || editandoPO) ? (
                <POForm
                  po={editandoPO}
                  clientes={clientes}
                  liquidaciones={liquidaciones}
                  embarques={embarques}
                  especies={especies}
                  exportadoras={exportadoras}
                  monedas={monedas}
                  paises={paises}
                  tcData={tcData}
                  pos={pos}
                  onGuardar={handleGuardarPO}
                  onCancelar={()=>{setEditandoPO(null); setCreandoPO(false);}}
                />
              ) : (
                <>
                  {/* Toolbar PO */}
                  <div style={{display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:14}}>
                    <select value={filtroCliPO} onChange={e=>setFiltroCliPO(e.target.value)} style={{...inputSt, maxWidth:180}}>
                      <option value="">Todos los clientes</option>
                      {clientes.filter(c=>c.activo!==false).sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||"")).map(c=>(
                        <option key={c.id} value={c.id}>{c.nombre}</option>
                      ))}
                    </select>
                    <select value={filtroEstadoPO} onChange={e=>setFiltroEstadoPO(e.target.value)} style={{...inputSt, maxWidth:140}}>
                      <option value="">Todos los estados</option>
                      <option value="borrador">Borrador</option>
                      <option value="emitida">Emitida</option>
                      <option value="pagada">Pagada</option>
                    </select>
                    {(filtroCliPO||filtroEstadoPO) && (
                      <button
                        onClick={()=>{setFiltroCliPO(""); setFiltroEstadoPO("");}}
                        style={{...btnSt(C.muted,true), fontSize:11}}
                      >✕ Limpiar</button>
                    )}
                    <span style={{fontSize:11, color:C.muted}}>{posFiltrados.length} de {pos.length}</span>
                    {permLiquidaciones.canEdit && (
                      <button onClick={handleNuevoPO} style={{...btnSt(C.teal), marginLeft:"auto", whiteSpace:"nowrap"}}>
                        + Nuevo PO
                      </button>
                    )}
                    {!permLiquidaciones.canEdit && (
                      <span style={{fontSize:10, padding:"3px 8px", borderRadius:4, background:`${C.blue}22`, color:C.blue, border:`1px solid ${C.blue}44`}}>
                        👁 Solo lectura
                      </span>
                    )}
                  </div>

                  {/* Detalle (Ver) PO — solo lectura */}
                  {verPO && (
                    <div>
                      <div style={{display:"flex", gap:8, alignItems:"center", marginBottom:12, flexWrap:"wrap"}}>
                        <button onClick={()=>setVerPO(null)} style={{...btnSt(C.muted,true), fontSize:12}}>← Volver a PO</button>
                        {permLiquidaciones.canEdit && <button onClick={()=>{ const p=verPO; setVerPO(null); handleEditarPO(p); }} style={{...btnSt(C.blue), fontSize:12}}>✎ Editar</button>}
                      </div>
                      <div style={{maxWidth:440}}>
                        <POCard po={verPO} clientes={clientes} paises={paises} onEditar={()=>{}} onEliminar={()=>{}} onAvanzarEstado={()=>{}} canEdit={false}/>
                      </div>
                    </div>
                  )}

                  {/* Listado compacto (click fila = Ver) */}
                  {!verPO && (posFiltrados.length===0 ? (
                    <div style={{padding:50, textAlign:"center", color:C.muted, fontSize:13, background:C.card, borderRadius:14}}>
                      {pos.length===0
                        ? 'Sin notas de cobro (PO). Click "+ Nuevo PO" para emitir la primera.'
                        : "Sin resultados con esos filtros."}
                    </div>
                  ) : (
                    <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:12, overflowX:"auto"}}>
                      <table style={{width:"100%", borderCollapse:"collapse", fontSize:11.5, minWidth:620}}>
                        <thead><tr style={{background:C.card2, color:C.muted, textAlign:"left"}}>
                          <th style={{padding:"8px 10px"}}>N° PO</th>
                          <th style={{padding:"8px 10px"}}>Cliente</th>
                          <th style={{padding:"8px 10px"}}>Fecha emisión</th>
                          <th style={{padding:"8px 10px", textAlign:"right"}}>Comisión USD</th>
                          <th style={{padding:"8px 10px", textAlign:"center"}}>Estado</th>
                          <th style={{padding:"8px 10px", textAlign:"right"}}>Acciones</th>
                        </tr></thead>
                        <tbody>
                          {posFiltrados.map(po=>{
                            const cli=clientes.find(c=>c.id===po.clienteId);
                            const est=po.estado||"borrador";
                            const ec={borrador:C.muted2,emitida:C.blue,pagada:C.green}[est]||C.muted2;
                            const td={padding:"7px 10px", borderTop:`1px solid ${C.border}`, verticalAlign:"middle"};
                            return (
                              <tr key={po.id} onClick={()=>setVerPO(po)} title="Ver detalle" style={{cursor:"pointer"}}>
                                <td style={{...td, fontFamily:"monospace", color:C.blue, whiteSpace:"nowrap"}}>{po.numero||po.id?.slice(-6)||"—"}</td>
                                <td style={{...td}}><div style={{whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:240}}>{cli?.nombre||"—"}</div></td>
                                <td style={{...td, whiteSpace:"nowrap"}}>{po.fecha||"—"}</td>
                                <td style={{...td, textAlign:"right", fontFamily:"monospace", color:C.green, fontWeight:700}}>{fmtUSD0(Number(po.totalComisionUSD)||0)}</td>
                                <td style={{...td, textAlign:"center"}}><span style={{fontSize:9, padding:"2px 8px", borderRadius:10, background:`${ec}22`, color:ec, border:`1px solid ${ec}44`, fontWeight:700, whiteSpace:"nowrap"}}>{est}</span></td>
                                <td style={{...td, textAlign:"right", whiteSpace:"nowrap"}} onClick={e=>e.stopPropagation()}>
                                  <button onClick={()=>setVerPO(po)} title="Ver" style={{...btnSt(C.teal,true), padding:"3px 8px", fontSize:10, marginRight:3}}>👁 Ver</button>
                                  {permLiquidaciones.canEdit && <button onClick={()=>handleEditarPO(po)} title="Editar" style={{...btnSt(C.blue,true), padding:"3px 7px", fontSize:10, marginRight:3}}>✎</button>}
                                  {permLiquidaciones.canEdit && <button onClick={()=>handleEliminarPO(po)} title="Eliminar" style={{...btnSt(C.accent,true), padding:"3px 7px", fontSize:10}}>×</button>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </>
              )}
            </>)}
          </div>
        )}

        {tab === "bi" && (
          <ReporteriaBI
            data={{ liquidaciones, embarques, clientes, exportadoras, especies, mercados, paises, temporadas, programa, contratos, pos }}
            permResumen={permResumen} permReportes={permReportes} permTablero={permTablero}
            onVerEmbarque={(oe)=>{ setVerOE(oe); setTab("embarques"); }}
            bmOwner={nombreUsuario}
          />
        )}

        {tab === "maestros" && (
          <FriskuModule
            canEdit={permMaestros.canEdit}
            usuarioActual={usuarioActual}
            esAdmin={esAdmin}
            esSoloConsulta={esSoloConsulta}
            tabPermisos={tabPermisos}
            onBack={null}
            onLogout={onLogout}
            renderClientesTab={permClientes.visible ? renderClientesTab : undefined}
            renderExportadorasTab={permExportadoras.visible ? renderExportadorasTab : undefined}
            clientesCount={totalClientesActivos}
            exportadorasCount={totalExportadorasActivas}
          />
        )}
      </div>

      {importando && (
        <ImportadorExcelModal
          clientes={clientes}
          exportadoras={exportadoras}
          onAplicar={handleAplicarImport}
          onCerrar={()=>setImportando(false)}
        />
      )}
    </div>
   </FriskuBIProvider>
  );
}
