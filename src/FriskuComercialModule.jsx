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

// ── Paleta Frisku — Slate neutro ──
const C = {
  bg:"#1e2533", bg2:"#263044", card:"#2d3a52", card2:"#334158", border:"#3d4f6e",
  text:"#e2e8f0", muted:"#94a3b8", muted2:"#5a6a80",
  blue:"#3b82f6", green:"#22c55e", yellow:"#f59e0b", accent:"#ef4444",
  teal:"#14b8a6", purple:"#a855f7",
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

// ── Loaders CDN ──────────────────────────────────────────────────
let _plJsPDFLoaded = false;
async function pl_loadJsPDF() {
  if(_plJsPDFLoaded && window.jspdf) return window.jspdf.jsPDF;
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
  return window.jspdf.jsPDF;
}
async function pl_loadJSZip() {
  if(window.JSZip) return;
  await new Promise((res,rej)=>{ const s=document.createElement("script"); s.src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
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
  doc.text(`Frisku Foods — ${especie?.icono||""} ${especie?.nombreEs||""}`,m,18);
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
    tiposEmbalaje.find(t=>t.codigo===p.formato)?.nombre||p.formato||"—",
    p.palletNum||"—",
    Number(p.cajas||0).toLocaleString("es-CL"),
    Number(p.pesoNetoKg||0).toLocaleString("es-CL"),
    Number(p.pesoBrutoKg||0).toLocaleString("es-CL"),
  ]);
  body.push(["","TOTAL","",totalCajas.toLocaleString("es-CL"),totalNetoKg.toLocaleString("es-CL"),totalBrutoKg.toLocaleString("es-CL")]);

  doc.autoTable({
    startY:y,
    theme:"striped",
    headStyles:{fillColor:[20,184,166],textColor:255,fontStyle:"bold",fontSize:8},
    styles:{fontSize:8,cellPadding:3},
    footStyles:{fillColor:[240,240,240],fontStyle:"bold"},
    head:[["#","Formato","N° Pallet","Cajas","Peso Neto (kg)","Peso Bruto (kg)"]],
    body,
    columnStyles:{0:{halign:"center",cellWidth:8},2:{halign:"center",cellWidth:18},3:{halign:"right",cellWidth:20},4:{halign:"right",cellWidth:26},5:{halign:"right",cellWidth:26}},
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
    ${cell(tiposEmbalaje.find(t=>t.codigo===p.formato)?.nombre||p.formato||"")}
    <Cell><ss:Data ss:Type="Number">${Number(p.palletNum)||0}</ss:Data></Cell>
    <Cell><ss:Data ss:Type="Number">${Number(p.cajas)||0}</ss:Data></Cell>
    <Cell><ss:Data ss:Type="Number">${Number(p.pesoNetoKg)||0}</ss:Data></Cell>
    <Cell><ss:Data ss:Type="Number">${Number(p.pesoBrutoKg)||0}</ss:Data></Cell>
  </Row>`).join("");

  const totalRow = `<Row>
    ${cell("")}${cell("TOTAL",true)}${cell("")}
    <Cell><ss:Data ss:Type="Number">${totalCajas}</ss:Data></Cell>
    <Cell><ss:Data ss:Type="Number">${totalNetoKg}</ss:Data></Cell>
    <Cell><ss:Data ss:Type="Number">${totalBrutoKg}</ss:Data></Cell>
  </Row>`;

  const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Packing List"><Table>
  <Row><Cell ss:MergeAcross="5"><ss:Data ss:Type="String">PACKING LIST — ${esc(oe.numero||oe.id)}</ss:Data></Cell></Row>
  <Row/>
  ${infoRows}
  <Row/>
  <Row>${["#","Formato","N° Pallet","Cajas","Peso Neto (kg)","Peso Bruto (kg)"].map(h=>cell(h,true)).join("")}</Row>
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

// ── PackingListPanel ─────────────────────────────────────────────
function PackingListPanel({ oe, tiposEmbalaje, especies, exportadoras, clientes, onGuardar, canEdit }) {
  const [pl, setPl] = useState(()=>JSON.parse(JSON.stringify(oe.packingList||{fechaDespReal:"",blAwb:"",sello:"",temperaturaC:"",pallets:[],observ:""})));
  const [dirty, setDirty] = useState(false);
  const [exporting, setExporting] = useState(false);

  const exportadora = exportadoras.find(e=>e.id===oe.exportadoraId);
  const cliente     = clientes.find(c=>c.id===oe.clienteId);
  const especie     = especies.find(e=>e.codigo===oe.especieCodigo);
  const formatosOE  = Object.entries(oe.cajasPorFormato||{}).filter(([,v])=>Number(v)>0).map(([cod])=>cod);

  function upd(k,v){ setPl(p=>({...p,[k]:v})); setDirty(true); }
  function addPallet(){
    setPl(p=>({...p,pallets:[...(p.pallets||[]),{id:uid(),formato:formatosOE[0]||"",palletNum:(p.pallets||[]).length+1,cajas:0,pesoNetoKg:0,pesoBrutoKg:0}]}));
    setDirty(true);
  }
  function updPallet(idx,k,v){ setPl(p=>{ const ps=[...p.pallets]; ps[idx]={...ps[idx],[k]:v}; return {...p,pallets:ps}; }); setDirty(true); }
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
      <div style={{overflowX:"auto",marginBottom:10}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead>
            <tr style={{borderBottom:`1px solid ${C.border}`}}>
              {["#","Formato","N° Pallet","Cajas","Peso Neto kg","Peso Bruto kg",canEdit?"✕":""].map((h,i)=>(
                <th key={i} style={{padding:"6px 8px",textAlign:i===0||i===2||i===3?"center":"left",color:C.muted,fontWeight:700,fontSize:10,whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(pl.pallets||[]).map((p,idx)=>(
              <tr key={p.id||idx} style={{borderBottom:`1px solid ${C.border}22`}}>
                <td style={{padding:"4px 8px",textAlign:"center",color:C.muted2,fontFamily:"monospace",fontSize:10}}>{idx+1}</td>
                <td style={{padding:"4px 4px"}}>
                  {canEdit
                    ? <select value={p.formato} onChange={e=>updPallet(idx,"formato",e.target.value)} style={{...inputSt,padding:"4px 6px",width:130}}>
                        {formatosOE.map(cod=><option key={cod} value={cod}>{tiposEmbalaje.find(t=>t.codigo===cod)?.nombre||cod}</option>)}
                        {!formatosOE.includes(p.formato)&&p.formato&&<option value={p.formato}>{p.formato}</option>}
                      </select>
                    : <span style={{color:C.text}}>{tiposEmbalaje.find(t=>t.codigo===p.formato)?.nombre||p.formato||"—"}</span>}
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
                <td colSpan={2} style={{padding:"6px 8px",fontSize:10,color:C.muted,fontWeight:700,textAlign:"right"}}>TOTAL</td>
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


function Card({children, title, icon, action}) {
  return (
    <div style={{background:C.card, borderRadius:14, padding:18, border:`1px solid ${C.border}`}}>
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
function DocumentosTab({clientes}) {
  const [filtroCli,    setFiltroCli]    = useState("");
  const [filtroTipo,   setFiltroTipo]   = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const hoy = new Date().toISOString().slice(0,10);
  const en30 = new Date(Date.now()+30*24*3600*1000).toISOString().slice(0,10);

  const clientesFaltantes = useMemo(()=>
    clientes.filter(c => c.activo !== false &&
      TIPOS_DOC_MINIMOS.some(t => !(c.documentos||[]).some(d=>d.tipo===t&&d.url)))
  ,[clientes]);

  const todos = useMemo(()=>{
    const rows = [];
    clientes.forEach(c => {
      (c.documentos||[]).forEach(d => {
        rows.push({...d, clienteId:c.id, clienteNombre:c.nombre});
      });
    });
    return rows.sort((a,b)=>{
      const aV = a.vencimiento && a.vencimiento < hoy;
      const bV = b.vencimiento && b.vencimiento < hoy;
      if(aV && !bV) return -1;
      if(!aV && bV) return 1;
      return (b.fecha||"").localeCompare(a.fecha||"");
    });
  },[clientes, hoy]);

  const filtrados = useMemo(()=>todos.filter(d=>{
    if(filtroCli && d.clienteId !== filtroCli) return false;
    if(filtroTipo && d.tipo !== filtroTipo) return false;
    if(filtroEstado==="vencidos" && !(d.vencimiento && d.vencimiento < hoy)) return false;
    if(filtroEstado==="vigentes" && d.vencimiento && d.vencimiento < hoy) return false;
    return true;
  }),[todos, filtroCli, filtroTipo, filtroEstado, hoy]);

  const tiposExistentes = [...new Set(todos.map(d=>d.tipo).filter(Boolean))].sort();

  return (
    <div>
      {/* Alerta clientes con docs obligatorios faltantes */}
      {clientesFaltantes.length > 0 && (
        <div style={{background:`${C.accent}11`, border:`1px solid ${C.accent}44`, borderRadius:10, padding:14, marginBottom:16}}>
          <div style={{fontWeight:700, color:C.accent, marginBottom:8, fontSize:12}}>
            Documentos obligatorios faltantes — {clientesFaltantes.length} cliente{clientesFaltantes.length>1?"s":""}
          </div>
          <div style={{display:"flex", flexWrap:"wrap", gap:8}}>
            {clientesFaltantes.map(c => {
              const falt = TIPOS_DOC_MINIMOS.filter(t => !(c.documentos||[]).some(d=>d.tipo===t&&d.url));
              return (
                <div key={c.id} style={{background:C.card, padding:"6px 12px", borderRadius:6, fontSize:11}}>
                  <strong style={{color:C.text}}>{c.nombre}</strong>
                  <span style={{color:C.muted, marginLeft:6}}>falta: {falt.join(", ")}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div style={{display:"flex", gap:10, marginBottom:14, flexWrap:"wrap", alignItems:"center"}}>
        <select value={filtroCli} onChange={e=>setFiltroCli(e.target.value)} style={{...inputSt, maxWidth:220}}>
          <option value="">— Todos los clientes —</option>
          {clientes.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)} style={{...inputSt, maxWidth:200}}>
          <option value="">— Todos los tipos —</option>
          {tiposExistentes.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filtroEstado} onChange={e=>setFiltroEstado(e.target.value)} style={{...inputSt, maxWidth:180}}>
          <option value="todos">Todos</option>
          <option value="vencidos">Vencidos</option>
          <option value="vigentes">Vigentes / sin venc.</option>
        </select>
        <span style={{fontSize:11, color:C.muted}}>{filtrados.length} documento{filtrados.length!==1?"s":""}</span>
      </div>

      {/* Tabla */}
      {filtrados.length === 0 ? (
        <div style={{padding:50, textAlign:"center", color:C.muted, fontSize:13, background:C.card, borderRadius:14}}>
          {todos.length === 0
            ? "Sin documentos cargados. Abre un cliente, sección Documentos, y agrega links."
            : "Sin resultados con esos filtros."}
        </div>
      ) : (
        <div style={{background:C.card, borderRadius:14, border:`1px solid ${C.border}`, overflow:"hidden"}}>
          <table style={{width:"100%", borderCollapse:"collapse", fontSize:12}}>
            <thead>
              <tr style={{background:C.card2, borderBottom:`1px solid ${C.border}`}}>
                {["Cliente","Tipo","Nombre","Fecha","Vencimiento","Link"].map(h=>(
                  <th key={h} style={{padding:"10px 14px", textAlign:"left", color:C.muted, fontWeight:600, fontSize:10, textTransform:"uppercase"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((d,i)=>{
                const vencido  = d.vencimiento && d.vencimiento < hoy;
                const porVenc  = d.vencimiento && !vencido && d.vencimiento <= en30;
                return (
                  <tr key={d.id||i} style={{borderBottom:`1px solid ${C.border}`, background: vencido ? `${C.accent}09` : "transparent"}}>
                    <td style={{padding:"10px 14px", color:C.text, fontWeight:600}}>{d.clienteNombre}</td>
                    <td style={{padding:"10px 14px"}}>
                      <span style={{
                        padding:"2px 8px", borderRadius:4, fontSize:10,
                        background: TIPOS_DOC_MINIMOS.includes(d.tipo) ? `${C.blue}22` : C.border,
                        color: TIPOS_DOC_MINIMOS.includes(d.tipo) ? C.blue : C.muted,
                        border: TIPOS_DOC_MINIMOS.includes(d.tipo) ? `1px solid ${C.blue}44` : "none",
                      }}>{d.tipo||"—"}</span>
                    </td>
                    <td style={{padding:"10px 14px", color:C.text}}>{d.nombre||"—"}</td>
                    <td style={{padding:"10px 14px", color:C.muted, fontFamily:"monospace", fontSize:11}}>{d.fecha||"—"}</td>
                    <td style={{padding:"10px 14px", fontFamily:"monospace", fontSize:11}}>
                      {d.vencimiento ? (
                        <span style={{color: vencido ? C.accent : porVenc ? C.yellow : C.green, fontWeight: vencido||porVenc ? 700 : 400}}>
                          {d.vencimiento}
                          {vencido  && <span style={{marginLeft:4, fontSize:9}}>VENCIDO</span>}
                          {porVenc  && <span style={{marginLeft:4, fontSize:9}}>⚠ pronto</span>}
                        </span>
                      ) : <span style={{color:C.muted2}}>—</span>}
                    </td>
                    <td style={{padding:"10px 14px"}}>
                      {d.url ? (
                        pathDesdeUrlStorage(d.url)
                          ? <button onClick={()=>window.open(d.url,"_blank")} style={{...btnSt(C.teal,true), padding:"4px 10px", fontSize:10}}>📎 Descargar</button>
                          : <button onClick={()=>window.open(d.url,"_blank")} style={{...btnSt(C.blue,true), padding:"4px 10px", fontSize:10}}>↗ Abrir</button>
                      ) : <span style={{color:C.muted2, fontSize:10}}>Sin link</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
          <select value={buf.exportadoraId||""} onChange={e=>setCampo("exportadoraId",e.target.value)} style={inputSt}>
            <option value="">— seleccionar —</option>
            {exportadoras.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
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
            {especies.map(e=><option key={e.codigo} value={e.codigo}>{e.icono} {e.nombreEs}</option>)}
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

// Formulario para agregar/editar una semana del programa
function ProgramaSemanaForm({semana, closure, tiposEmbalaje, onGuardar, onCancelar}) {
  const [buf, setBuf] = useState(()=>JSON.parse(JSON.stringify(semana)));

  const setCajas = (fmtCodigo, val) => setBuf(prev=>{
    const cpf = {...(prev.cajasPorFormato||{})};
    const n = Number(val);
    if(!val || n===0) delete cpf[fmtCodigo]; else cpf[fmtCodigo]=n;
    return {...prev, cajasPorFormato:cpf};
  });

  const formatosClosure = Object.keys(closure?.cajasPorFormato||{});
  const totalCajas = Object.values(buf.cajasPorFormato||{}).reduce((s,v)=>s+Number(v||0),0);

  const handleGuardar = () => {
    const fecha = getMondayStr(buf.fechaSemana);
    if(!fecha){ alert("Ingresa la fecha de la semana"); return; }
    if(totalCajas===0){ alert("Ingresa cajas en al menos un formato"); return; }
    onGuardar({...buf, fechaSemana:fecha});
  };

  return (
    <div style={{background:`${C.teal}11`, padding:14, borderRadius:8, border:`1px solid ${C.teal}44`, marginBottom:10}}>
      <h4 style={{margin:"0 0 12px", color:C.teal, fontSize:13, display:"flex", alignItems:"center", gap:8}}>
        <span>{semana.id?"✎":"+"}</span>
        <span>{semana.id?"Editar semana":"Nueva semana de programa"}</span>
        <span style={{fontSize:10, color:C.muted, fontWeight:400}}>
          — La fecha se ajusta al lunes de la semana elegida
        </span>
      </h4>

      {/* Fecha + Estado */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 160px", gap:10, marginBottom:12}}>
        <div>
          <div style={lblSt}>Semana (fecha de inicio) *</div>
          <input type="date" value={buf.fechaSemana||""} style={inputSt}
            onChange={e=>setBuf(prev=>({...prev, fechaSemana:e.target.value}))}
            onBlur={e=>setBuf(prev=>({...prev, fechaSemana:getMondayStr(e.target.value)}))}/>
          {buf.fechaSemana && (
            <div style={{fontSize:10, color:C.teal, marginTop:3}}>
              Lunes: {formatFechaSemana(getMondayStr(buf.fechaSemana))}
            </div>
          )}
        </div>
        <div>
          <div style={lblSt}>Estado</div>
          <select value={buf.estado||"borrador"} style={inputSt}
            onChange={e=>setBuf(prev=>({...prev, estado:e.target.value}))}>
            <option value="borrador">◌ Borrador</option>
            <option value="confirmado">✓ Confirmado</option>
          </select>
        </div>
      </div>

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
                <tr style={{background:C.bg2}}>
                  <th style={{padding:"6px 10px", textAlign:"left", color:C.muted, fontWeight:600, border:`1px solid ${C.border}`, whiteSpace:"nowrap"}}>Semana (lunes)</th>
                  {formatosClosure.map(cod=>{
                    const fmt = tiposEmbalaje.find(t=>t.codigo===cod);
                    return (
                      <th key={cod} style={{padding:"6px 8px", textAlign:"right", color:C.muted, fontWeight:600, border:`1px solid ${C.border}`, whiteSpace:"nowrap", fontSize:10}}>
                        {fmt?.nombre||cod}
                      </th>
                    );
                  })}
                  <th style={{padding:"6px 8px", textAlign:"right", color:C.muted, fontWeight:600, border:`1px solid ${C.border}`}}>Total cjs</th>
                  <th style={{padding:"6px 8px", textAlign:"center", color:C.muted, fontWeight:600, border:`1px solid ${C.border}`}}>Estado</th>
                  {canEdit && <th style={{border:`1px solid ${C.border}`}}/>}
                </tr>
              </thead>
              <tbody>
                {semanasOrdenadas.map((sem,i)=>{
                  const totalSem = Object.values(sem.cajasPorFormato||{}).reduce((s,v)=>s+Number(v||0),0);
                  return (
                    <tr key={sem.id||i} style={{background: i%2===0?C.card:C.card2}}>
                      <td style={{padding:"6px 10px", border:`1px solid ${C.border}`, whiteSpace:"nowrap"}}>
                        {formatFechaSemana(sem.fechaSemana)}
                      </td>
                      {formatosClosure.map(cod=>(
                        <td key={cod} style={{padding:"6px 8px", textAlign:"right", border:`1px solid ${C.border}`, fontFamily:"monospace"}}>
                          {sem.cajasPorFormato?.[cod]!=null ? Number(sem.cajasPorFormato[cod]).toLocaleString("es-CL") : "—"}
                        </td>
                      ))}
                      <td style={{padding:"6px 8px", textAlign:"right", border:`1px solid ${C.border}`, fontFamily:"monospace", fontWeight:700}}>
                        {totalSem.toLocaleString("es-CL")}
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
          <button onClick={()=>onAgregarSemana(closure.id)} style={{...btnSt(C.teal,true), fontSize:11, padding:"5px 12px"}}>
            + Agregar semana
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════
// ORDEN DE EMBARQUE — FORM
// ═══════════════════════════════════════════════════════════════════
function OEForm({oe, exportadoras, clientes, especies, tiposEmbalaje, contratos,
  puertos, aeropuertos, shippingLines, lineasAereas, temporadas,
  onGuardar, onCancelar}) {
  const [buf, setBuf] = useState(()=>JSON.parse(JSON.stringify(oe)));
  const set = (k,v) => setBuf(prev=>({...prev,[k]:v}));
  const setNotify = (k,v) => setBuf(prev=>({...prev,notify:{...(prev.notify||{}), [k]:v}}));
  const setCajas = (cod,val) => setBuf(prev=>{
    const cpf = {...(prev.cajasPorFormato||{})};
    const n = Number(val);
    if(!val||n===0) delete cpf[cod]; else cpf[cod]=n;
    return {...prev,cajasPorFormato:cpf};
  });

  const esMar = buf.tipoEmbarque==="maritimo";
  const esAer = buf.tipoEmbarque==="aereo";
  const totalCajas = Object.values(buf.cajasPorFormato||{}).reduce((s,v)=>s+Number(v||0),0);

  // Formatos disponibles según especie seleccionada
  const especieObj = especies.find(e=>e.codigo===buf.especieCodigo);
  const formatosDisp = tiposEmbalaje.filter(t=>
    t.especieCodigo===buf.especieCodigo || (especieObj && t.especie===especieObj.nombreEs)
  );

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
            placeholder="OE-2026-001" style={inputSt}/>
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
          <select value={buf.exportadoraId||""} onChange={e=>set("exportadoraId",e.target.value)} style={inputSt}>
            <option value="">— seleccionar —</option>
            {exportadoras.filter(e=>e.activo!==false).map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
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
            {especies.map(e=><option key={e.codigo} value={e.codigo}>{e.icono} {e.nombreEs}</option>)}
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
            placeholder={esAer?"LATAM Cargo":"Maersk Line"} style={inputSt}/>
          <datalist id="oe-naviera-list">
            {(esAer?lineasAereas:shippingLines).map(x=>(
              <option key={x.codigo} value={x.nombre}>{x.codigo} — {x.nombre}</option>
            ))}
          </datalist>
        </div>
        <div>
          <div style={lblSt}>{esAer?"N° Vuelo":"N° Contenedor"}</div>
          <input value={buf.numeroContenedor||""} onChange={e=>set("numeroContenedor",e.target.value)}
            placeholder={esAer?"LA800":"MSKU1234567"} style={inputSt}/>
        </div>
      </div>

      {/* Origen + Destino */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <div>
          <div style={lblSt}>Origen *</div>
          <input list="oe-origen-list" value={buf.origen||""}
            onChange={e=>set("origen",e.target.value)}
            placeholder={esMar?"Puerto Montt":"SCL"} style={inputSt}/>
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
            placeholder={esMar?"Rotterdam":"AMS"} style={inputSt}/>
          <datalist id="oe-destino-list">
            {origenDestOptions.map(p=>(
              <option key={p.codigo} value={p.nombre||p.codigo}>{p.codigo} — {p.nombre||p.ciudad}</option>
            ))}
          </datalist>
        </div>
      </div>

      {/* Notify */}
      <div style={{background:C.card,padding:10,borderRadius:6,border:`1px solid ${C.border}`,marginBottom:10}}>
        <div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:8}}>Notify</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          <div>
            <div style={lblSt}>Nombre / Empresa</div>
            <input value={buf.notify?.nombre||""} onChange={e=>setNotify("nombre",e.target.value)}
              placeholder="Importador destino" style={inputSt}/>
          </div>
          <div>
            <div style={lblSt}>Dirección</div>
            <input value={buf.notify?.direccion||""} onChange={e=>setNotify("direccion",e.target.value)}
              placeholder="123 Main St, Rotterdam" style={inputSt}/>
          </div>
          <div>
            <div style={lblSt}>Contacto / Teléfono</div>
            <input value={buf.notify?.contacto||""} onChange={e=>setNotify("contacto",e.target.value)}
              placeholder="+31 6 00000000" style={inputSt}/>
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
                  placeholder="0"
                  style={{...inputSt,padding:"4px 8px",fontSize:13,fontFamily:"monospace",textAlign:"right"}}
                  onChange={e=>setCajas(fmt.codigo,e.target.value)}/>
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
const DOCS_COMEX_DEFAULT = [
  "BL / AWB","Invoice Comercial","Packing List",
  "Certificado Fitosanitario","Certificado de Origen","Seguro de Carga",
];

function defaultCarpetaComex() {
  return {
    docs: DOCS_COMEX_DEFAULT.map(tipo=>({id:uid(),tipo,nombre:"",url:"",fuente:"manual",fechaCarga:"",estado:"pendiente"})),
    qcDestino:{fechaRecepcion:"",temperaturaLlegada:"",pesoVerificadoKg:"",observ:"",fotos:[]},
  };
}

function CarpetaComexPanel({ oe, onGuardar, canEdit }) {
  const [cx, setCx] = useState(()=>{
    const saved = oe.carpetaComex;
    if(!saved) return defaultCarpetaComex();
    const savedTipos = (saved.docs||[]).map(d=>d.tipo);
    const missing = DOCS_COMEX_DEFAULT.filter(t=>!savedTipos.includes(t))
      .map(tipo=>({id:uid(),tipo,nombre:"",url:"",fuente:"manual",fechaCarga:"",estado:"pendiente"}));
    return { ...saved, docs:[...(saved.docs||[]),...missing], qcDestino:{...defaultCarpetaComex().qcDestino,...(saved.qcDestino||{})} };
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

  const docsCargados = cx.docs.filter(d=>d.url&&d.estado!=="pendiente").length;
  const pct = cx.docs.length>0 ? Math.round(docsCargados/cx.docs.length*100) : 0;
  const ECOL = { pendiente:C.yellow, cargado:C.blue, aprobado:C.green };

  return (
    <div style={{marginTop:12,padding:14,background:`${C.bg}bb`,borderRadius:10,border:`1px solid ${C.purple}44`}}>
      {/* Cabecera */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{fontSize:12,fontWeight:700,color:C.purple}}>
          📁 Carpeta COMEX
          <span style={{marginLeft:10,fontSize:10,background:`${C.purple}22`,color:C.purple,borderRadius:20,padding:"2px 8px",fontWeight:700}}>
            {docsCargados}/{cx.docs.length} · {pct}%
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
              const isStorage = doc.fuente==="storage" && doc.url;
              const isUploading = uploading.has(idx);
              const ec = ECOL[doc.estado||"pendiente"]||C.yellow;
              const isDefault = DOCS_COMEX_DEFAULT.includes(doc.tipo);
              return (
                <div key={doc.id||idx} style={{display:"flex",gap:6,alignItems:"center",padding:"7px 10px",background:C.card,borderRadius:8,border:`1px solid ${doc.url?C.border:C.border+"44"}`}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:11,fontWeight:600,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{doc.tipo}</div>
                    {doc.nombre&&doc.nombre!==doc.tipo&&<div style={{fontSize:9,color:C.muted,marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{doc.nombre}</div>}
                    {doc.fechaCarga&&<div style={{fontSize:9,color:C.muted2}}>{doc.fechaCarga}</div>}
                  </div>
                  {canEdit
                    ? <select value={doc.estado||"pendiente"} onChange={e=>updDoc(idx,"estado",e.target.value)}
                        style={{...inputSt,padding:"3px 5px",width:85,fontSize:10,color:ec,border:`1px solid ${ec}44`,flexShrink:0}}>
                        <option value="pendiente">Pendiente</option>
                        <option value="cargado">Cargado</option>
                        <option value="aprobado">Aprobado</option>
                      </select>
                    : <span style={{fontSize:9,padding:"2px 7px",borderRadius:4,background:`${ec}22`,color:ec,border:`1px solid ${ec}44`,fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>
                        {doc.estado==="pendiente"?"Pendiente":doc.estado==="cargado"?"Cargado":"Aprobado"}
                      </span>
                  }
                  {doc.url && (
                    <a href={doc.url} target="_blank" rel="noreferrer"
                      style={{...btnSt(isStorage?C.teal:C.blue,true),padding:"3px 8px",fontSize:10,textDecoration:"none",flexShrink:0}}>
                      {isStorage?"📎":"↗"}
                    </a>
                  )}
                  {canEdit && !doc.url && (
                    <input value={doc.url||""} onChange={e=>{ updDoc(idx,"url",e.target.value); if(e.target.value){updDoc(idx,"fuente","manual");updDoc(idx,"estado","cargado");} }}
                      placeholder="URL…" style={{...inputSt,width:130,padding:"3px 6px",fontSize:10,flexShrink:0}}/>
                  )}
                  {canEdit && (
                    <>
                      <input type="file" id={`comex_${oe.id}_${idx}`} style={{display:"none"}}
                        onChange={e=>{ if(e.target.files[0]) handleUploadDoc(idx,e.target.files[0]); e.target.value=""; }}/>
                      <button onClick={()=>document.getElementById(`comex_${oe.id}_${idx}`)?.click()}
                        disabled={isUploading} style={{...btnSt(C.purple,true),padding:"3px 8px",fontSize:10,flexShrink:0}}>
                        {isUploading?"⏳":"📎"}
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
    .map(([cod,cajas])=>({fmt:tiposEmbalaje.find(t=>t.codigo===cod)||{nombre:cod},cajas:Number(cajas)}))
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
          {formatosConCajas.map(({fmt,cajas})=>(
            <span key={fmt.codigo||fmt.nombre} style={{padding:"3px 10px",borderRadius:4,fontSize:10,background:`${C.blue}22`,color:C.blue,border:`1px solid ${C.blue}33`}}>
              {fmt.nombre}: {cajas.toLocaleString("es-CL")} cjs
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
          {(()=>{ const cx=oe.carpetaComex; if(!cx) return null; const ok=(cx.docs||[]).filter(d=>d.url&&d.estado!=="pendiente").length; return ok>0?<span style={{background:`${C.purple}33`,borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:700}}>{ok}/{(cx.docs||[]).length}</span>:null; })()}
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
// LIQUIDACIONES — Fase 6
// ═══════════════════════════════════════════════════════════════════

const LIQ_ESTADOS = {
  borrador: { label:"Borrador", color:"#f59e0b" },
  enviada:  { label:"Enviada",  color:"#3b82f6" },
  pagada:   { label:"Pagada",   color:"#22c55e" },
};
const LIQ_ESTADO_SIG = { borrador:"enviada", enviada:"pagada" };

function LiquidacionForm({ liq, embarques, clientes, exportadoras, especies, monedas, tcData, onGuardar, onCancelar }) {
  const hoyISO = new Date().toISOString().slice(0,10);
  const [form, setForm] = useState({
    oeId:             liq?.oeId             || "",
    estado:           liq?.estado           || "borrador",
    fechaLiquidacion: liq?.fechaLiquidacion || hoyISO,
    baseNeta:         liq?.baseNeta != null ? String(liq.baseNeta) : "",
    monedaBase:       liq?.monedaBase       || "USD",
    fechaTC:          liq?.fechaTC          || hoyISO,
    numeroFactura:    liq?.numeroFactura    || "",
    fechaFactura:     liq?.fechaFactura     || "",
    observ:           liq?.observ           || "",
  });
  const f = k => e => setForm(p=>({...p,[k]:e.target.value}));

  const oeSeleccionada  = embarques.find(e=>e.id===form.oeId);
  const clienteOE       = clientes.find(c=>c.id===oeSeleccionada?.clienteId);
  const exportadoraOE   = exportadoras.find(e=>e.id===oeSeleccionada?.exportadoraId);
  const especieOE       = especies.find(e=>e.codigo===oeSeleccionada?.especieCodigo);
  const baseNetaNum     = parseFloat(String(form.baseNeta).replace(/[^\d.\-]/g,"")) || 0;
  const monedasMap      = Object.fromEntries(monedas.map(m=>[m.codigo,m]));

  const tcCalculado = form.monedaBase==="USD" ? 1
    : buscarTC(form.monedaBase, "USD", form.fechaTC, tcData);
  const baseNetaUSD = form.monedaBase==="USD" ? baseNetaNum
    : (tcCalculado!=null ? baseNetaNum*tcCalculado : null);

  const comision = (clienteOE && baseNetaNum>0)
    ? calcularComisionFrisku(clienteOE, oeSeleccionada?.especieCodigo, "", baseNetaNum)
    : null;
  const montoFriskuUSD = comision
    ? (form.monedaBase==="USD" ? comision.montoComisionFrisku
      : (tcCalculado!=null ? comision.montoComisionFrisku*tcCalculado : null))
    : null;

  const handleGuardar = () => {
    if(!form.oeId)       { alert("Selecciona una OE"); return; }
    if(!baseNetaNum)     { alert("Ingresa la base neta"); return; }
    onGuardar({
      ...liq,
      id: liq?.id || uid(),
      oeId: form.oeId,
      temporada: oeSeleccionada?.temporada || "",
      estado: form.estado,
      fechaLiquidacion: form.fechaLiquidacion,
      baseNeta: baseNetaNum,
      monedaBase: form.monedaBase,
      fechaTC: form.fechaTC,
      tcUsado: tcCalculado,
      baseNetaUSD,
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

  return (
    <div style={{background:C.card, borderRadius:14, padding:20, marginBottom:20, border:`1px solid ${C.border}`}}>
      <h3 style={{margin:"0 0 16px", fontSize:14, color:C.text, fontWeight:700}}>
        {liq?.id ? "Editar liquidación" : "Nueva liquidación"}
      </h3>
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px,1fr))", gap:12}}>

        {/* OE */}
        <div style={{gridColumn:"1/-1"}}>
          <div style={lblSt}>Orden de embarque *</div>
          <select value={form.oeId} onChange={f("oeId")} style={inputSt}>
            <option value="">— Selecciona una OE —</option>
            {[...embarques].sort((a,b)=>(b.fechaCreacion||"").localeCompare(a.fechaCreacion||"")).map(oe=>{
              const exp = exportadoras.find(e=>e.id===oe.exportadoraId);
              const cli = clientes.find(c=>c.id===oe.clienteId);
              const esp = especies.find(e=>e.codigo===oe.especieCodigo);
              return (
                <option key={oe.id} value={oe.id}>
                  {oe.numero||oe.id.slice(-6)} — {exp?.nombre||"?"} → {cli?.nombre||"?"} {esp?.icono||""} T{oe.temporada||"?"} [{oe.estado||"borrador"}]
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

        {/* Base neta + moneda */}
        <div>
          <div style={lblSt}>Base neta *</div>
          <input value={form.baseNeta} onChange={f("baseNeta")} style={inputSt} placeholder="0.00"/>
        </div>
        <div>
          <div style={lblSt}>Moneda</div>
          <select value={form.monedaBase} onChange={f("monedaBase")} style={inputSt}>
            {monedas.length
              ? monedas.map(m=><option key={m.codigo} value={m.codigo}>{m.simbolo} {m.codigo}</option>)
              : <><option value="USD">USD</option><option value="EUR">EUR</option><option value="CLP">CLP</option></>}
          </select>
        </div>

        {/* TC — solo si moneda != USD */}
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

        {/* Preview comisión */}
        {comision && (
          <div style={{gridColumn:"1/-1", background:C.bg2, borderRadius:10, padding:12, border:`1px solid ${C.border}`}}>
            <div style={{fontSize:11, fontWeight:700, color:C.teal, marginBottom:8}}>Preview comisión</div>
            <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(170px,1fr))", gap:8, fontSize:11}}>
              <div><span style={{color:C.muted}}>Base neta: </span><span style={{fontWeight:600}}>{formatearMonto(baseNetaNum, form.monedaBase, monedasMap)}</span></div>
              {form.monedaBase!=="USD" && baseNetaUSD!=null &&
                <div><span style={{color:C.muted}}>Base USD: </span><span style={{fontWeight:600}}>USD {baseNetaUSD.toLocaleString("es-CL",{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>}
              <div><span style={{color:C.muted}}>% cliente: </span><span>{comision.cliPct}%</span></div>
              <div><span style={{color:C.muted}}>% Frisku s/cli: </span><span>{comision.friPct}%</span></div>
              <div><span style={{color:C.muted}}>Frisku s/base: </span><span style={{color:C.yellow, fontWeight:700}}>{comision.friSobreBaseNeta.toFixed(4)}%</span></div>
              <div><span style={{color:C.muted}}>Com. cliente: </span><span>{formatearMonto(comision.montoComisionCliente, form.monedaBase, monedasMap)}</span></div>
              <div><span style={{color:C.muted}}>Com. Frisku: </span><span style={{color:C.green, fontWeight:700}}>{formatearMonto(comision.montoComisionFrisku, form.monedaBase, monedasMap)}</span></div>
              {form.monedaBase!=="USD" && montoFriskuUSD!=null &&
                <div><span style={{color:C.muted}}>Frisku USD: </span><span style={{color:C.green, fontWeight:700}}>USD {montoFriskuUSD.toLocaleString("es-CL",{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>}
            </div>
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
          <div style={{color:C.muted, marginBottom:2}}>Base neta</div>
          <div style={{color:C.text, fontWeight:600}}>{formatearMonto(liq.baseNeta, liq.monedaBase, monedasMap)}</div>
          {liq.monedaBase!=="USD" && liq.baseNetaUSD!=null && (
            <div style={{color:C.muted, fontSize:10}}>≈ USD {liq.baseNetaUSD.toLocaleString("es-CL",{maximumFractionDigits:0})}</div>
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

      {/* % aplicados */}
      <div style={{fontSize:10, color:C.muted}}>
        {liq.cliPct}% cliente × {liq.friPct}% Frisku =&nbsp;
        <span style={{color:C.yellow}}>{(liq.friSobreBaseNeta||0).toFixed(4)}% s/base</span>
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

  const [cargando, setCargando] = useState(true);
  const [tab, setTab] = useState("clientes");
  const [guardando, setGuardando] = useState({});

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

  // UI Liquidaciones
  const [editandoLiq,    setEditandoLiq]    = useState(null);
  const [creandoLiq,     setCreandoLiq]     = useState(false);
  const [filtroEstadoLiq, setFiltroEstadoLiq] = useState("");
  const [filtroExpLiq,   setFiltroExpLiq]   = useState("");
  const [filtroCliLiq,   setFiltroCliLiq]   = useState("");
  const [filtroTempLiq,  setFiltroTempLiq]  = useState("");

  // ── Carga inicial ──
  useEffect(()=>{
    let alive = true;
    (async ()=>{
      const [cli, exp, con, pro, emb, liq, esp, pa, mo, me, tb, ci, tmp, pu, ae, sl, la, tc] = await Promise.all([
        dbLoadGeneric("frisku_clientes"),
        dbLoadGeneric("frisku_exportadoras"),
        dbLoadGeneric("frisku_contratos"),
        dbLoadGeneric("frisku_programa"),
        dbLoadGeneric("frisku_embarques"),
        dbLoadGeneric("frisku_liquidaciones"),
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
        dbLoadGeneric("maestro_tc"),
      ]);
      if(!alive) return;
      setClientes(Array.isArray(cli) ? cli : []);
      setExportadoras(Array.isArray(exp) ? exp : []);
      setContratos(Array.isArray(con) ? con : []);
      setPrograma(Array.isArray(pro) ? pro : []);
      setEmbarques(Array.isArray(emb) ? emb : []);
      setLiquidaciones(Array.isArray(liq) ? liq : []);
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
      if(tc && typeof tc === "object") setTcData(tc);
      setCargando(false);
    })();
    return ()=>{alive=false;};
  },[]);

  // ── Recarga manual de maestros ──
  // Se ejecuta al navegar a tabs que dependen de los selects (Clientes,
  // Exportadoras). Garantiza que las altas/cambios hechos en el módulo
  // de Maestros se reflejen sin necesidad de recargar la página.
  const recargarMaestros = useCallback(async ()=>{
    const [esp, pa, mo, me, tb, ci, tmp, pu, ae, sl, la, tc] = await Promise.all([
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
    if(tc && typeof tc === "object") setTcData(tc);
  },[]);

  // Refrescar maestros al entrar a tabs que los necesitan
  useEffect(()=>{
    if (cargando) return;
    if (tab === "clientes" || tab === "exportadoras" || tab === "contratos" || tab === "embarques" || tab === "liquidaciones") {
      recargarMaestros();
    }
  },[tab, cargando, recargarMaestros]);

  // ── Auto-save genérico ──
  const useAutoSave = (id, valor, listo=true) => {
    const timer = useRef(null);
    const primero = useRef(true);
    useEffect(()=>{
      if(cargando || !listo) return;
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
    if(creandoCli) {
      const nuevo = {...cli, id: uid()};
      setClientes(prev => [...prev, nuevo]);
    } else {
      setClientes(prev => prev.map(c => c.id === cli.id ? cli : c));
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
    if(creandoExp) {
      const nueva = {...exp, id: uid()};
      setExportadoras(prev => [...prev, nueva]);
    } else {
      setExportadoras(prev => prev.map(e => e.id === exp.id ? exp : e));
    }
    setEditandoExp(null);
    setCreandoExp(false);
  };

  const totalExportadorasActivas = exportadoras.filter(e => e.activo !== false).length;

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
  const [editandoSemana,     setEditandoSemana]     = useState(null);
  const [closureIdParaSemana,setClosureIdParaSemana]= useState(null);

  const closuresParaPrograma = useMemo(()=>{
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
      fechaSemana: getMondayStr(hoyLocal),
      cajasPorFormato:{}, estado:"borrador", observ:"",
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
    setEditandoOE(null);
    setCreandoOE(true);
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

  // ── Filtros Órdenes de Embarque ──
  const embarquesFiltrados = useMemo(()=>{
    const q = busquedaOE.toLowerCase();
    return embarques.filter(oe=>{
      if(filtroExpOE   && oe.exportadoraId !== filtroExpOE)   return false;
      if(filtroCliOE   && oe.clienteId     !== filtroCliOE)   return false;
      if(filtroEspOE   && oe.especieCodigo !== filtroEspOE)   return false;
      if(filtroEstadoOE && (oe.estado||"borrador") !== filtroEstadoOE) return false;
      if(filtroTempOE  && oe.temporada     !== filtroTempOE)  return false;
      if(q) {
        const exp = exportadoras.find(e=>e.id===oe.exportadoraId)?.nombre||"";
        const cli = clientes.find(c=>c.id===oe.clienteId)?.nombre||"";
        const hayMatch = (oe.numero||"").toLowerCase().includes(q)
          || exp.toLowerCase().includes(q)
          || cli.toLowerCase().includes(q)
          || (oe.origen||"").toLowerCase().includes(q)
          || (oe.destino||"").toLowerCase().includes(q)
          || (oe.navieraAerolinea||"").toLowerCase().includes(q);
        if(!hayMatch) return false;
      }
      return true;
    });
  },[embarques, filtroExpOE, filtroCliOE, filtroEspOE, filtroEstadoOE, filtroTempOE, busquedaOE, exportadoras, clientes]);

  const hoy = new Date().toISOString().slice(0,10);
  const clientesConDocsFaltantes = clientes.filter(c =>
    c.activo !== false && TIPOS_DOC_MINIMOS.some(t => !(c.documentos||[]).some(d=>d.tipo===t&&d.url))
  ).length;

  // ── Tabs (lista filtrada por permisos) ──
  // Se declara antes de los early returns para que el useEffect siguiente
  // respete las rules of hooks.
  const tabsAll = [
    {id:"dashboard",     label:"📊 Dashboard",     count:null,                              perm:permDashboard},
    {id:"clientes",      label:"👥 Clientes",      count:totalClientesActivos,              perm:permClientes},
    {id:"exportadoras",  label:"🏭 Exportadoras",  count:totalExportadorasActivas,          perm:permExportadoras},
    {id:"documentos",    label:"📁 Documentos",    count:clientesConDocsFaltantes||null,    perm:permDocumentos},
    {id:"contratos",     label:"📄 Contratos",     count:totalClosuresActivos||null,        perm:permContratos},
    {id:"programa",      label:"📅 Programa",      count:programa.length||null,             perm:permPrograma},
    {id:"embarques",     label:"🚢 Embarques",     count:embarques.length||null,            perm:permEmbarques},
    {id:"liquidaciones", label:"💰 Liquidaciones", count:liquidaciones.length||null,        perm:permLiquidaciones},
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
    <div style={{background:C.bg, minHeight:"100vh", color:C.text}}>
      {/* Header */}
      <div style={{padding:"12px 20px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10, background:C.bg2}}>
        <div style={{display:"flex", alignItems:"center", gap:14}}>
          <img
            src={`${process.env.PUBLIC_URL}/frisku.png`}
            alt="Frisku Foods"
            style={{height:44, objectFit:"contain", borderRadius:6}}
          />
          <div>
            <h2 style={{margin:0, fontSize:18, fontWeight:800, color:C.text, lineHeight:1.2}}>Frisku Foods</h2>
            <div style={{fontSize:11, color:C.muted, fontWeight:400}}>Connecting Quality</div>
          </div>
        </div>
        <div style={{display:"flex", alignItems:"center", gap:10, fontSize:11, color:C.muted}}>
          {Object.values(guardando).some(Boolean)
            ? <span style={{color:C.yellow}}>💾 Guardando...</span>
            : <span style={{color:C.green}}>● Sincronizado</span>}
          {onBack && <button onClick={onBack} style={btnSt(C.muted, true)}>← Volver</button>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex", flexWrap:"wrap", gap:4, padding:"0 20px", borderBottom:`2px solid ${C.border}`, background:C.bg2}}>
        {tabs.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)}
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
                color:"#fff", fontWeight:700,
              }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div style={{padding: tab==="maestros" ? 0 : 20}}>

        {tab === "dashboard" && (
          <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:14}}>
            <Card title="Clientes" icon="👥">
              <div style={{fontSize:32, fontWeight:800, color:C.green}}>{totalClientesActivos}</div>
              <div style={{color:C.muted, fontSize:11}}>activos de {clientes.length} totales</div>
            </Card>
            <Card title="Exportadoras" icon="🏭">
              <div style={{fontSize:32, fontWeight:800, color:C.blue}}>{totalExportadorasActivas}</div>
              <div style={{color:C.muted, fontSize:11}}>activas de {exportadoras.length} totales</div>
            </Card>
            <Card title="Embarques" icon="🚢">
              <div style={{fontSize:32, fontWeight:800, color:C.teal}}>{embarques.filter(e=>(e.estado||"borrador")!=="cancelado").length}</div>
              <div style={{color:C.muted, fontSize:11}}>{embarques.filter(e=>e.estado==="confirmado"||e.estado==="despachado").length} confirmados/despachados</div>
            </Card>
            <Card title="Especies cargadas" icon="🍒">
              <div style={{fontSize:32, fontWeight:800, color:C.yellow}}>{especies.length}</div>
              <div style={{color:C.muted, fontSize:11}}>en maestro</div>
            </Card>
            <Card title="Documentos faltantes" icon="📁">
              <div style={{fontSize:32, fontWeight:800, color: clientesConDocsFaltantes > 0 ? C.accent : C.green}}>
                {clientesConDocsFaltantes}
              </div>
              <div style={{color:C.muted, fontSize:11}}>
                cliente{clientesConDocsFaltantes!==1?"s":""} sin docs obligatorios
              </div>
            </Card>
            <Card title="Plan Frisku" icon="🗺️">
              <div style={{fontSize:11, color:C.text, lineHeight:1.6}}>
                <div>✅ Fase 1 — Maestros</div>
                <div>✅ Fase 2 — Clientes + TC</div>
                <div>✅ Fase 3 — Documentos</div>
                <div>✅ Fase 4 — Embarques + PL</div>
                <div>✅ Fase 5 — COMEX</div>
                <div>✅ Fase 6 — Liquidaciones</div>
                <div style={{color:C.muted}}>⏳ Fase 7 — Carga histórica</div>
                <div style={{color:C.muted}}>⏳ Fase 8 — Dashboards CFO</div>
              </div>
            </Card>
          </div>
        )}

        {tab === "clientes" && (
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
        )}

        {tab === "exportadoras" && (
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
        )}
        {tab === "documentos" && (
          <DocumentosTab
            clientes={clientes}
            canEdit={permDocumentos.canEdit}
          />
        )}

        {tab === "contratos" && (
          <div>
            {/* Toolbar */}
            <div style={{display:"flex", gap:8, marginBottom:16, flexWrap:"wrap", alignItems:"center"}}>
              <input value={busquedaClosure} onChange={e=>setBusquedaClosure(e.target.value)}
                placeholder="Buscar temporada, código, empresa…" style={{...inputSt, flex:"1 1 220px", maxWidth:280}}/>
              <select value={filtroExpClosure} onChange={e=>setFiltroExpClosure(e.target.value)} style={{...inputSt, maxWidth:190}}>
                <option value="">— Exportadora —</option>
                {exportadoras.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
              <select value={filtroCliClosure} onChange={e=>setFiltroCliClosure(e.target.value)} style={{...inputSt, maxWidth:190}}>
                <option value="">— Cliente —</option>
                {clientes.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              <select value={filtroEspClosure} onChange={e=>setFiltroEspClosure(e.target.value)} style={{...inputSt, maxWidth:170}}>
                <option value="">— Especie —</option>
                {especies.map(e=><option key={e.codigo} value={e.codigo}>{e.icono} {e.nombreEs}</option>)}
              </select>
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

            {/* Grid de cards */}
            {!editandoClosure && (
              closuresFiltrados.length===0 ? (
                <div style={{padding:50, textAlign:"center", color:C.muted, fontSize:13, background:C.card, borderRadius:14}}>
                  {contratos.length===0
                    ? "Sin Business Closures. Click \"+ Nuevo Business Closure\" para crear el primero."
                    : "Sin resultados con esos filtros."}
                </div>
              ) : (
                <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(400px, 1fr))", gap:14}}>
                  {closuresFiltrados.map(bc=>(
                    <ClosureCard key={bc.id}
                      closure={bc}
                      exportadoras={exportadoras}
                      clientes={clientes}
                      especies={especies}
                      tiposEmbalaje={tiposEmbalaje}
                      monedas={monedas}
                      onEditar={()=>handleEditarClosure(bc)}
                      onEliminar={()=>handleEliminarClosure(bc)}
                      canEdit={permContratos.canEdit}
                    />
                  ))}
                </div>
              )
            )}
          </div>
        )}
        {tab === "programa" && (
          <div>
            {/* Filtros */}
            <div style={{display:"flex", flexWrap:"wrap", gap:8, marginBottom:16, alignItems:"center"}}>
              <select value={filtroProgramaTemp} onChange={e=>setFiltroProgramaTemp(e.target.value)} style={{...inputSt, maxWidth:160, fontSize:11}}>
                <option value="">Todas las temporadas</option>
                {temporadas.map(t=><option key={t} value={t}>Temporada {t}</option>)}
              </select>
              <select value={filtroProgramaExp} onChange={e=>setFiltroProgramaExp(e.target.value)} style={{...inputSt, maxWidth:180, fontSize:11}}>
                <option value="">Todas las exportadoras</option>
                {exportadoras.filter(e=>e.activo!==false).sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||"")).map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
              <select value={filtroProgramaCli} onChange={e=>setFiltroProgramaCli(e.target.value)} style={{...inputSt, maxWidth:180, fontSize:11}}>
                <option value="">Todos los clientes</option>
                {clientes.filter(c=>c.activo!==false).sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||"")).map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              <select value={filtroProgramaEsp} onChange={e=>setFiltroProgramaEsp(e.target.value)} style={{...inputSt, maxWidth:140, fontSize:11}}>
                <option value="">Todas las especies</option>
                {especies.map(e=><option key={e.codigo} value={e.codigo}>{e.icono} {e.nombreEs}</option>)}
              </select>
              {(filtroProgramaTemp||filtroProgramaExp||filtroProgramaCli||filtroProgramaEsp) && (
                <button onClick={()=>{setFiltroProgramaTemp(""); setFiltroProgramaExp(""); setFiltroProgramaCli(""); setFiltroProgramaEsp("");}}
                  style={{...btnSt(C.muted,true), fontSize:11}}>✕ Limpiar</button>
              )}
              <span style={{marginLeft:"auto", fontSize:11, color:C.muted}}>
                {closuresParaPrograma.length} Business Closure{closuresParaPrograma.length!==1?"s":""}
              </span>
            </div>

            {/* Paneles por closure */}
            {closuresParaPrograma.length === 0 ? (
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
            )}
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

            {!creandoOE && !editandoOE && (
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
                  <select value={filtroExpOE} onChange={e=>setFiltroExpOE(e.target.value)}
                    style={{padding:"6px 8px",background:C.input,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:12}}>
                    <option value="">Todas las exp.</option>
                    {exportadoras.filter(e=>e.activo!==false).map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
                  </select>
                  <select value={filtroCliOE} onChange={e=>setFiltroCliOE(e.target.value)}
                    style={{padding:"6px 8px",background:C.input,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:12}}>
                    <option value="">Todos los clientes</option>
                    {clientes.filter(c=>c.activo!==false).map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                  <select value={filtroEspOE} onChange={e=>setFiltroEspOE(e.target.value)}
                    style={{padding:"6px 8px",background:C.input,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:12}}>
                    <option value="">Todas las especies</option>
                    {especies.map(e=><option key={e.codigo} value={e.codigo}>{e.icono} {e.nombreEs}</option>)}
                  </select>
                  <select value={filtroEstadoOE} onChange={e=>setFiltroEstadoOE(e.target.value)}
                    style={{padding:"6px 8px",background:C.input,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:12}}>
                    <option value="">Todos los estados</option>
                    <option value="borrador">Borrador</option>
                    <option value="confirmado">Confirmado</option>
                    <option value="despachado">Despachado</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                  {permEmbarques.canEdit && (
                    <button onClick={handleNuevaOE} style={{...btnSt(C.blue), marginLeft:"auto", whiteSpace:"nowrap"}}>
                      + Nueva OE
                    </button>
                  )}
                </div>

                {/* Conteo */}
                <div style={{fontSize:11,color:C.muted,marginBottom:10}}>
                  {embarquesFiltrados.length} orden{embarquesFiltrados.length!==1?"es":""} de embarque
                  {embarquesFiltrados.length !== embarques.length && ` (${embarques.length} total)`}
                </div>

                {/* Grid de cards */}
                {embarquesFiltrados.length === 0 ? (
                  <div style={{textAlign:"center",padding:40,color:C.muted,fontSize:13}}>
                    {embarques.length === 0
                      ? "No hay órdenes de embarque. Crea la primera con + Nueva OE."
                      : "No hay OE que coincidan con los filtros."}
                  </div>
                ) : (
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:14}}>
                    {embarquesFiltrados.map(oe=>(
                      <OECard
                        key={oe.id}
                        oe={oe}
                        exportadoras={exportadoras}
                        clientes={clientes}
                        especies={especies}
                        tiposEmbalaje={tiposEmbalaje}
                        onEditar={()=>handleEditarOE(oe)}
                        onEliminar={()=>handleEliminarOE(oe)}
                        onGuardarPL={(pl)=>setEmbarques(prev=>prev.map(e=>e.id===oe.id?{...e,packingList:pl,estado:pl.pallets?.length>0&&e.estado==="confirmado"?"despachado":e.estado}:e))}
                        onGuardarCOMEX={(cx)=>setEmbarques(prev=>prev.map(e=>e.id===oe.id?{...e,carpetaComex:cx}:e))}
                        canEdit={permEmbarques.canEdit}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {tab === "liquidaciones" && (
          <div>
            {/* Form */}
            {(creandoLiq || editandoLiq) && (
              <LiquidacionForm
                liq={editandoLiq}
                embarques={embarques}
                clientes={clientes}
                exportadoras={exportadoras}
                especies={especies}
                monedas={monedas}
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
                  <select value={filtroExpLiq} onChange={e=>setFiltroExpLiq(e.target.value)} style={{...inputSt, maxWidth:180}}>
                    <option value="">Todas las exp.</option>
                    {exportadoras.filter(e=>e.activo!==false).sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||"")).map(e=>(
                      <option key={e.id} value={e.id}>{e.nombre}</option>
                    ))}
                  </select>
                  <select value={filtroCliLiq} onChange={e=>setFiltroCliLiq(e.target.value)} style={{...inputSt, maxWidth:180}}>
                    <option value="">Todos los clientes</option>
                    {clientes.filter(c=>c.activo!==false).sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||"")).map(c=>(
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                  {(filtroEstadoLiq||filtroTempLiq||filtroExpLiq||filtroCliLiq) && (
                    <button
                      onClick={()=>{setFiltroEstadoLiq(""); setFiltroTempLiq(""); setFiltroExpLiq(""); setFiltroCliLiq("");}}
                      style={{...btnSt(C.muted,true), fontSize:11}}
                    >✕ Limpiar</button>
                  )}
                  <span style={{fontSize:11, color:C.muted}}>{liqFiltradas.length} de {liquidaciones.length}</span>
                  {totalComisionFriskuUSD>0 && (
                    <span style={{fontSize:12, fontWeight:700, color:C.green, marginLeft:4}}>
                      Total Frisku: USD {totalComisionFriskuUSD.toLocaleString("es-CL",{minimumFractionDigits:2,maximumFractionDigits:2})}
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

                {/* Grid de cards */}
                {liqFiltradas.length===0 ? (
                  <div style={{padding:50, textAlign:"center", color:C.muted, fontSize:13, background:C.card, borderRadius:14}}>
                    {liquidaciones.length===0
                      ? 'Sin liquidaciones. Click "+ Nueva liquidación" para crear la primera.'
                      : "Sin resultados con esos filtros."}
                  </div>
                ) : (
                  <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(320px,1fr))", gap:14}}>
                    {liqFiltradas.map(liq=>(
                      <LiquidacionCard
                        key={liq.id}
                        liq={liq}
                        embarques={embarques}
                        clientes={clientes}
                        exportadoras={exportadoras}
                        especies={especies}
                        monedas={monedas}
                        onEditar={()=>handleEditarLiq(liq)}
                        onEliminar={()=>handleEliminarLiq(liq)}
                        onAvanzarEstado={handleAvanzarEstadoLiq}
                        canEdit={permLiquidaciones.canEdit}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
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
          />
        )}
      </div>
    </div>
  );
}
