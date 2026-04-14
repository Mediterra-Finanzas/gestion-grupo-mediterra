// ============================================================
// OsirisModule.jsx — v4 — Módulo Osiris Plant · Mediterra
// ============================================================
import React, { useState, useCallback, useMemo } from "react";

// ── Paleta ────────────────────────────────────────────────
const C = {
  azul:"#2563eb",    azulBg:"#dbeafe",
  verde:"#16a34a",   verdeBg:"#dcfce7",
  rojo:"#dc2626",    rojoBg:"#fee2e2",
  am:"#d97706",      amBg:"#fef3c7",
  gris:"#64748b",    grisBg:"#f1f5f9",
  mo:"#7c3aed",      moBg:"#ede9fe",
  teal:"#0f766e",    tealBg:"#ccfbf1",
  sl:"#1e293b",
};

const $$ = v => (v!=null&&v!==""&&!isNaN(v))
  ? `$${Number(v).toLocaleString("es-CL",{minimumFractionDigits:0,maximumFractionDigits:2})}`
  : "—";
const N = v => (v!=null&&!isNaN(v)) ? Number(v).toLocaleString("es-CL") : "—";

// Porcentaje cobro según país
function pct(pais="") {
  const p = pais.toLowerCase();
  if(p.includes("chile")) return 1.00;          // Sin WHT
  return 0.85;                                    // Peru/Mexico: WHT 15%
}
function whtLabel(pais="") {
  const p = pais.toLowerCase();
  if(p.includes("chile")) return null;           // Sin WHT
  return "WHT 15%";
}

// Fecha de inicio de trimestre
function fechaInicioTrim(año,trim) {
  const mes = [0,3,6,9][trim-1] ?? 0;
  return new Date(año,mes,1);
}
// Un mes antes del trimestre
function fechaAvisoTrim(año,trim) {
  const f = fechaInicioTrim(año,trim);
  f.setMonth(f.getMonth()-1);
  return f;
}

// ── Componentes base ──────────────────────────────────────
function Th({cols}) {
  return (
    <thead>
      <tr style={{background:"#0f172a",color:"#fff",fontSize:11}}>
        {cols.map((c,i)=>(
          <th key={i} style={{padding:"9px 10px",textAlign:c.c?"center":"left",fontWeight:600,whiteSpace:"nowrap",minWidth:c.w||70}}>
            {c.l}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function Cell({val,onChange,type="text",opts=null,can,ph=""}) {
  const [on,setOn]=useState(false);
  const [tmp,setTmp]=useState(val);
  if(!can) return <span style={{fontSize:12,color:C.sl}}>{val!=null&&val!==""?val:<span style={{color:"#cbd5e1"}}>—</span>}</span>;
  if(on) {
    if(opts) return (
      <select value={tmp} onChange={e=>setTmp(e.target.value)}
        onBlur={()=>{onChange(tmp);setOn(false);}} autoFocus
        style={{fontSize:12,borderRadius:6,border:"1px solid #93c5fd",padding:"3px 6px",background:"#eff6ff",width:"100%"}}>
        {opts.map(o=><option key={o} value={o}>{o}</option>)}
      </select>
    );
    return (
      <input type={type} value={tmp??""} placeholder={ph}
        onChange={e=>setTmp(e.target.value)}
        onBlur={()=>{onChange(type==="number"?(parseFloat(tmp)||0):tmp);setOn(false);}}
        onKeyDown={e=>{if(e.key==="Enter"){onChange(type==="number"?(parseFloat(tmp)||0):tmp);setOn(false);}}}
        autoFocus
        style={{fontSize:12,borderRadius:6,border:"1px solid #93c5fd",padding:"3px 6px",background:"#eff6ff",width:"100%",maxWidth:type==="number"?90:160}}
      />
    );
  }
  return (
    <span onClick={()=>{setTmp(val);setOn(true);}}
      style={{fontSize:12,color:C.sl,cursor:"pointer",borderBottom:"1px dashed #93c5fd",paddingBottom:1}}>
      {val!=null&&val!==""?val:<span style={{color:"#cbd5e1"}}>—</span>}
    </span>
  );
}

function BadgePago({pagado,onChange,can}) {
  const s = pagado
    ? {bg:"#dcfce7",col:"#16a34a",bdr:"#86efac",lbl:"✅ Pagado"}
    : {bg:"#fef3c7",col:"#d97706",bdr:"#fde047",lbl:"⏳ Por cobrar"};
  return (
    <span onClick={()=>can&&onChange(!pagado)}
      style={{background:s.bg,color:s.col,border:`1px solid ${s.bdr}`,borderRadius:20,
        padding:"2px 10px",fontSize:11,fontWeight:700,cursor:can?"pointer":"default",whiteSpace:"nowrap"}}>
      {s.lbl}
    </span>
  );
}

function BadgeFact({nFact}) {
  const ok = nFact&&String(nFact).trim()!=="";
  return (
    <span style={{background:ok?"#dbeafe":"#f1f5f9",color:ok?"#2563eb":"#64748b",
      border:`1px solid ${ok?"#93c5fd":"#d1d5db"}`,borderRadius:20,
      padding:"2px 8px",fontSize:10,fontWeight:700,whiteSpace:"nowrap"}}>
      {ok?"📄 Facturado":"⏸ Pend. facturar"}
    </span>
  );
}



// ── Datos base ────────────────────────────────────────────

const PAISES = ["Peru","Mexico","Chile","Corea","España"];
const VIVEROS = ["Synergia Chile","Synergia Mexico","Agromillora Pe","Agromillora"];
const TIPOS   = ["Anticipo","Entrega","Anticipo/Entrega"];

// Regalías por vivero (US$ por planta) — parametrizable
const REGALIAS_VIVERO_BASE = {
  "Synergia Chile":  0.45,
  "Synergia Mexico": 0.45,
  "Synergiabio":     0.45,
  "Agromillora Pe":  1.15,
  "Agromillora":     1.15,
};

// Calcular trimestre de pago del vivero según trimestre de entrega
// El vivero paga el trimestre SIGUIENTE a la entrega
function trimPagoVivero(trimEntrega, añoEntrega) {
  const t = parseInt(trimEntrega);
  const a = parseInt(añoEntrega);
  if(t < 4) return { trim: t + 1, año: a };
  return { trim: 1, año: a + 1 };
}

// % anticipo por defecto según tipo pago vivero
const PCT_ANTICIPO_DEFAULT = 0.60; // 60% en OC, 40% en despacho

// Helper: selector cliente en modales — desplegable desde maestro + autocompletado país
function SelectorCliente({form,setForm,clientes}){
  return(
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      <label style={{fontSize:11,fontWeight:600,color:"#374151"}}>Cliente *</label>
      {clientes.length>0&&(
        <select value={""} onChange={e=>{
          const cli=clientes.find(c=>c.id===e.target.value);
          if(!cli)return;
          setForm(p=>({...p,
            cliente:cli.razonSocial||p.cliente,
            pais:cli.pais||p.pais,
          }));
        }} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #93c5fd",fontSize:12,boxSizing:"border-box",color:"#2563eb"}}>
          <option value="">🔍 Seleccionar desde maestro de clientes...</option>
          {clientes.map(c=><option key={c.id} value={c.id}>
            {c.razonSocial}{c.nombreComercial&&c.nombreComercial!==c.razonSocial?` (${c.nombreComercial})`:""} — {c.pais}
          </option>)}
        </select>
      )}
      <input type="text" value={form.cliente} onChange={e=>setForm(p=>({...p,cliente:e.target.value}))}
        placeholder="O escribe el nombre..."
        style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
    </div>
  );
}

// Helper: muestra razón social con tooltip/badge de nombre comercial si difiere
function NombreCliente({nombre,clientes,onChange,can}) {
  const cli = clientes.find(c=>c.razonSocial===nombre||c.nombreComercial===nombre);
  const nc = cli?.nombreComercial && cli.nombreComercial!==nombre ? cli.nombreComercial : null;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:2}}>
      <Cell val={nombre} onChange={onChange} can={can}/>
      {nc&&<span style={{fontSize:9,color:"#0f766e",background:"#f0fdfa",borderRadius:10,
        padding:"1px 6px",fontWeight:600,border:"1px solid #99f6e4",whiteSpace:"nowrap"}}>
        {nc}
      </span>}
    </div>
  );
}

// ── Helper: exportar a Excel con tabla nativa, filtros y formato ──
async function exportCSV(rows, headers, nombre) {
  const fecha = new Date().toISOString().slice(0,10);
  const nRows = rows.length;
  const nCols = headers.length;

  // Convertir número de columna a letra Excel (A, B, ..., Z, AA, AB...)
  function colLetter(n) {
    let s = "";
    n++;
    while(n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
    return s;
  }
  const lastCol = colLetter(nCols - 1);
  const lastRow = nRows + 1;
  const tableRef = `A1:${lastCol}${lastRow}`;

  // Detectar columnas monetarias
  const isMoney = i => /mto|monto|usd|us\$|cobro|facturar|cobrar|total osiris|regali/i.test(headers[i]);
  const isNum   = i => /n°\s*plantas|plantar|trim|año/i.test(headers[i]);

  // Anchos de columna (en caracteres × 7 puntos)
  const colWidths = headers.map((h, i) => {
    const maxLen = Math.max(h.length, ...rows.map(r => String(r[i] ?? "").length));
    return Math.min(Math.max(maxLen + 3, 10), 45);
  });

  // ── Generar XML de la hoja ────────────────────────────────
  function escXml(v) {
    return String(v ?? "")
      .replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }
  // Filas de datos
  let rowsXml = "";
  // Fila de encabezado (s=1 = estilo header)
  rowsXml += `<row r="1" ht="22" customHeight="1">`;
  headers.forEach((h, c) => {
    const addr = `${colLetter(c)}1`;
    rowsXml += `<c r="${addr}" t="inlineStr" s="1"><is><t>${escXml(h)}</t></is></c>`;
  });
  rowsXml += `</row>`;

  rows.forEach((row, ri) => {
    const r = ri + 2;
    const sBase = (ri % 2 === 0) ? 0 : 2; // blanco o gris alternado
    rowsXml += `<row r="${r}" ht="18" customHeight="1">`;
    headers.forEach((_, c) => {
      const val = row[c];
      const addr = `${colLetter(c)}${r}`;
      const raw  = val ?? "";
      const isMoneyCol = isMoney(c);
      const isNumCol   = isNum(c);
      const num = (isMoneyCol || isNumCol) && raw !== "" && !isNaN(raw);
      let s;
      if(isMoneyCol) s = num ? 3 : 0;
      else if(c === 0) s = sBase === 0 ? 5 : 6;
      else s = sBase;
      if(num) {
        rowsXml += `<c r="${addr}" s="${s}"><v>${parseFloat(raw)}</v></c>`;
      } else {
        rowsXml += `<c r="${addr}" t="inlineStr" s="${s}"><is><t>${escXml(raw)}</t></is></c>`;
      }
    });
    rowsXml += `</row>`;
  });

  // Definiciones de estilos
  // s=0: normal blanco | s=1: header | s=2: alt gris | s=3: money verde
  // s=4: número normal | s=5: primera col negrita blanca | s=6: primera col negrita gris
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="5">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><sz val="11"/><b/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><sz val="11"/><b/><color rgb="FF15803D"/><name val="Calibri"/></font>
    <font><sz val="11"/><b/><name val="Calibri"/></font>
  </fonts>
  <fills count="5">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F2D4A"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFE2E8F0"/></left>
      <right style="thin"><color rgb="FFE2E8F0"/></right>
      <top style="thin"><color rgb="FFE2E8F0"/></top>
      <bottom style="thin"><color rgb="FFE2E8F0"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="7">
    <xf numFmtId="0"  fontId="0" fillId="0" borderId="1" xfId="0"><alignment vertical="center"/></xf>
    <xf numFmtId="0"  fontId="1" fillId="2" borderId="0" xfId="0"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0"  fontId="0" fillId="3" borderId="1" xfId="0"><alignment vertical="center"/></xf>
    <xf numFmtId="164" fontId="3" fillId="4" borderId="1" xfId="0"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="1"  fontId="0" fillId="0" borderId="1" xfId="0"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0"  fontId="4" fillId="0" borderId="1" xfId="0"><alignment vertical="center"/></xf>
    <xf numFmtId="0"  fontId="4" fillId="3" borderId="1" xfId="0"><alignment vertical="center"/></xf>
  </cellXfs>
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode='"US$" #,##0.00'/>
  </numFmts>
</styleSheet>`;

  // Definiciones de columnas
  const colsXml = `<cols>${colWidths.map((w, i) =>
    `<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1" bestFit="1"/>`
  ).join("")}</cols>`;

  // Tabla nativa con filtros automáticos
  const tableXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  id="1" name="Tabla1" displayName="Tabla1" ref="${tableRef}"
  totalsRowShown="0" headerRowCount="1">
  <autoFilter ref="${tableRef}"/>
  <tableColumns count="${nCols}">
    ${headers.map((h,i)=>`<tableColumn id="${i+1}" name="${escXml(h)}"/>`).join("")}
  </tableColumns>
  <tableStyleInfo name="TableStyleMedium2"
    showFirstColumn="1" showLastColumn="0"
    showRowStripes="1" showColumnStripes="0"/>
</table>`;

  // Sheet XML
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
           xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  ${colsXml}
  <sheetData>${rowsXml}</sheetData>
  <tableParts count="1"><tablePart r:id="rId1"/></tableParts>
</worksheet>`;

  // Workbook XML
  const wbXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView/></bookViews>
  <sheets><sheet name="${escXml(nombre.slice(0,31))}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

  const sheetRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table1.xml"/>
</Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml"           ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml"  ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml"             ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/tables/table1.xml"      ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>
</Types>`;

  const pkgRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  // ── Empaquetar como ZIP (XLSX) ────────────────────────────
  if(!window.JSZip) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  const zip = new window.JSZip();
  zip.file("[Content_Types].xml", contentTypes);
  zip.file("_rels/.rels", pkgRels);
  zip.file("xl/workbook.xml", wbXml);
  zip.file("xl/_rels/workbook.xml.rels", wbRels);
  zip.file("xl/worksheets/sheet1.xml", sheetXml);
  zip.file("xl/worksheets/_rels/sheet1.xml.rels", sheetRels);
  zip.file("xl/styles.xml", stylesXml);
  zip.file("xl/tables/table1.xml", tableXml);

  const blob = await zip.generateAsync({type:"blob", mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `${nombre}_${fecha}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Helper: barra de filtros + exportar reutilizable ──────────
function BarraFiltros({filtros, onExportar, exportLabel="⬇️ Exportar"}) {
  return (
    <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center",
      background:"#f8fafc",borderRadius:10,padding:"8px 12px",border:"1px solid #e2e8f0"}}>
      {filtros.map(({label,opciones,valor,onChange,tipo})=>(
        tipo==="input"
          ? <div key={label} style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:11,color:"#64748b",fontWeight:600}}>{label}:</span>
              <input value={valor} onChange={e=>onChange(e.target.value)} placeholder="Buscar..."
                style={{padding:"4px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:12,
                  outline:"none",width:130}}/>
            </div>
          : <div key={label} style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
              <span style={{fontSize:11,color:"#64748b",fontWeight:600}}>{label}:</span>
              {opciones.map(op=>(
                <button key={op} onClick={()=>onChange(op)}
                  style={{padding:"3px 10px",borderRadius:20,border:"none",cursor:"pointer",
                    fontSize:11,fontWeight:600,
                    background:valor===op?"#1e293b":"#fff",
                    color:valor===op?"#fff":"#475569"}}>
                  {op}
                </button>
              ))}
            </div>
      ))}
      <button onClick={onExportar}
        style={{marginLeft:"auto",background:"#16a34a",color:"#fff",border:"none",
          borderRadius:8,padding:"5px 14px",cursor:"pointer",fontSize:12,fontWeight:700,
          whiteSpace:"nowrap"}}>
        {exportLabel}
      </button>
    </div>
  );
}


// ══════════════════════════════════════════════════════════
// TOTAL PEDIDOS — Registro maestro de negociación
// ══════════════════════════════════════════════════════════
function TotalPedidos({data,setData,rpData,setRpData,rcData,setRcData,fvData,setFvData,can,clientes=[]}) {
  const [filtroPais,setFiltroPais]=useState("Todos");
  const [filtroAño,setFiltroAño]=useState("Todos");
  const [filtroEst,setFiltroEst]=useState("Todos");
  const [filtroCli,setFiltroCli]=useState("");
  const [modal,setModal]=useState(false);
  const [regalias,setRegalias]=useState(REGALIAS_VIVERO_BASE);
  const [showRegalias,setShowRegalias]=useState(false);

  const añoActual = new Date().getFullYear();
  const formVacio = {
    cliente:"",pais:"Peru",vivero:"Synergia Chile",
    fechaPedido:"",añoEntrega:añoActual,trimEntrega:1,
    nPlantas:"",ha:"",estado:"Por confirmar",
    // Fee vivero
    regaliaVivero:"",pctAnticipo:60,
    trimPagoVivero:"",añoPagoVivero:"",
  };
  const [form,setForm]=useState(formVacio);

  // Auto-calcular regalia y trim pago cuando cambia vivero o trim/año entrega
  function calcularDefaults(f) {
    const reg = regalias[f.vivero] ?? 0.45;
    const { trim, año } = trimPagoVivero(f.trimEntrega, f.añoEntrega);
    return { ...f, regaliaVivero: reg, trimPagoVivero: trim, añoPagoVivero: año };
  }

  function setF(c,v) {
    setForm(prev => {
      const next = {...prev,[c]:v};
      if(c==="vivero"||c==="trimEntrega"||c==="añoEntrega") return calcularDefaults(next);
      return next;
    });
  }

  const años=["Todos",...Array.from(new Set(data.map(r=>r.añoEntrega))).sort()];
  const paises=["Todos",...Array.from(new Set(data.map(r=>r.pais).filter(Boolean))).sort()];

  const filtrado=data.filter(r=>
    (filtroPais==="Todos"||r.pais===filtroPais)&&
    (filtroAño==="Todos"||r.añoEntrega===Number(filtroAño))&&
    (filtroEst==="Todos"||r.estado===filtroEst)&&
    (!filtroCli||r.cliente?.toLowerCase().includes(filtroCli.toLowerCase()))
  );

  const totPlantas=filtrado.reduce((s,r)=>s+(Number(r.nPlantas)||0),0);
  const totHa=filtrado.reduce((s,r)=>s+(Number(r.ha)||0),0);
  const confirmados=filtrado.filter(r=>r.estado==="Confirmado").length;

  // Propagar a pestañas hijas cuando se confirma un pedido
  function propagarPedido(pedido) {
    const tpId = pedido.id;

    // 1. Royalty por Planta — crear fila si no existe
    const rpExiste = rpData.some(r=>r.tpId===tpId);
    if(!rpExiste) {
      setRpData(prev=>[...prev,{
        id:`rp_${tpId}`,tpId,
        cliente:pedido.cliente,pais:pedido.pais,vivero:pedido.vivero||"",
        nPlantas:pedido.nPlantas,usdPlanta:"",
        añoEntrega:pedido.añoEntrega,
        nFact:"",pagado:false,fechaPago:"",
      }]);
    }

    // 2. Royalty Comercial — crear fila para el año siguiente si tiene Há
    if(pedido.ha && Number(pedido.ha)>0) {
      const añoRC = (pedido.añoEntrega||añoActual) + 1;
      const rcExiste = rcData.some(r=>r.tpId===tpId);
      if(!rcExiste) {
        setRcData(prev=>[...prev,{
          id:`rc_${tpId}`,tpId,
          cliente:pedido.cliente,pais:pedido.pais,
          ha:pedido.ha,usdHa:3000,
          añoCobro:añoRC,trimCobro:2,
          nFact:"",pagado:false,
          _generado:true,
        }]);
      }
    }

    // 3. Fee Vivero — crear dos filas: Anticipo (OC) + Despacho
    const fvExiste = fvData.some(r=>r.tpId===tpId);
    if(!fvExiste) {
      const reg = pedido.regaliaVivero || regalias[pedido.vivero] || 0.45;
      const nPl = Number(pedido.nPlantas)||0;
      const total = nPl * reg;
      const pctAntic = (Number(pedido.pctAnticipo)||60)/100;
      const montoAntic = total * pctAntic;
      const montoDespac = total * (1 - pctAntic);
      const trimPago = pedido.trimPagoVivero || trimPagoVivero(pedido.trimEntrega,pedido.añoEntrega).trim;
      const añoPago  = pedido.añoPagoVivero  || trimPagoVivero(pedido.trimEntrega,pedido.añoEntrega).año;
      const now = Date.now();
      setFvData(prev=>[...prev,
        {
          id:`fv_oc_${tpId}`,tpId,
          vivero:pedido.vivero||"Synergiabio",empresa:pedido.cliente,pais:pedido.pais,
          proforma:"",nPlantas:nPl,regalia:reg,totalOsiris:total,
          tipoPago:"Anticipo (OC)",montoFact:montoAntic,
          trimPago,añoPago,fechaFact:"",nFact:"",pagado:false,
          _fromPedido:true,
        },
        {
          id:`fv_des_${tpId}`,tpId,
          vivero:pedido.vivero||"Synergiabio",empresa:pedido.cliente,pais:pedido.pais,
          proforma:"",nPlantas:nPl,regalia:reg,totalOsiris:total,
          tipoPago:"Despacho",montoFact:montoDespac,
          trimPago,añoPago,fechaFact:"",nFact:"",pagado:false,
          _fromPedido:true,
        },
      ]);
    }
  }

  // Actualizar estado de un pedido
  function upd(id,c,v) {
    setData(prev=>prev.map(r=>{
      if(r.id!==id) return r;
      const updated = {...r,[c]:v};
      // Si se confirma → propagar automáticamente
      if(c==="estado" && v==="Confirmado") {
        setTimeout(()=>propagarPedido(updated),0);
      }
      return updated;
    }));
  }

  function agregar() {
    if(!form.cliente.trim()){alert("Cliente es obligatorio.");return;}
    if(!form.nPlantas){alert("N° de plantas es obligatorio.");return;}
    const nuevo = {
      ...form,id:`tp_${Date.now()}`,
      nPlantas:parseFloat(form.nPlantas)||0,
      ha:parseFloat(form.ha)||0,
      añoEntrega:parseInt(form.añoEntrega),
      trimEntrega:parseInt(form.trimEntrega),
      regaliaVivero:parseFloat(form.regaliaVivero)||regalias[form.vivero]||0.45,
      pctAnticipo:parseFloat(form.pctAnticipo)||60,
      trimPagoVivero:parseInt(form.trimPagoVivero)||trimPagoVivero(form.trimEntrega,form.añoEntrega).trim,
      añoPagoVivero:parseInt(form.añoPagoVivero)||trimPagoVivero(form.trimEntrega,form.añoEntrega).año,
    };
    setData(prev=>[...prev,nuevo]);
    if(nuevo.estado==="Confirmado") propagarPedido(nuevo);
    setModal(false);
    setForm(formVacio);
  }

  const TRIM_LABEL = ["","T1 Ene-Mar","T2 Abr-Jun","T3 Jul-Sep","T4 Oct-Dic"];

  return (
    <div>
      {/* Mantenedor de regalías */}
      {can&&showRegalias&&(
        <div style={{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:12,padding:"16px 20px",marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:700,color:C.verde,marginBottom:12}}>⚙️ Regalías por Vivero (US$/Planta)</div>
          <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
            {Object.entries(regalias).map(([vivero,val])=>(
              <div key={vivero} style={{background:"#fff",borderRadius:8,padding:"10px 14px",border:"1px solid #bbf7d0",minWidth:200}}>
                <div style={{fontSize:11,color:C.gris,fontWeight:600,marginBottom:6}}>{vivero}</div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:12,color:C.gris}}>US$</span>
                  <input type="number" step="0.01" value={val}
                    onChange={e=>setRegalias(p=>({...p,[vivero]:parseFloat(e.target.value)||0}))}
                    style={{width:80,padding:"5px 8px",borderRadius:6,border:"1px solid #86efac",fontSize:13,textAlign:"right"}}/>
                  <span style={{fontSize:11,color:C.gris}}>/planta</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        {[
          [N(totPlantas),"Total Plantas",C.teal,C.tealBg],
          [N(totHa)+" há","Hectáreas",C.verde,C.verdeBg],
          [confirmados,"Confirmados",C.azul,C.azulBg],
          [filtrado.length-confirmados,"Por confirmar",C.am,C.amBg],
        ].map(([v,l,c,bg])=>(
          <div key={l} style={{background:bg,borderRadius:12,padding:"12px 18px",flex:1,minWidth:110}}>
            <div style={{fontSize:11,color:c,fontWeight:600}}>{l}</div>
            <div style={{fontSize:20,fontWeight:800,color:c}}>{v}</div>
          </div>
        ))}
        <div style={{display:"flex",gap:8,alignSelf:"center",flexWrap:"wrap"}}>
          {can&&<button onClick={()=>setModal(true)}
            style={{background:C.azul,color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontSize:12,fontWeight:700}}>
            + Nuevo Pedido
          </button>}
          {can&&<button onClick={()=>setShowRegalias(v=>!v)}
            style={{background:showRegalias?"#16a34a":"#f1f5f9",color:showRegalias?"#fff":C.sl,border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:12,fontWeight:600}}>
            ⚙️ Regalías
          </button>}
        </div>
      </div>

      <BarraFiltros
        filtros={[
          {label:"Cliente",tipo:"input",valor:filtroCli,onChange:setFiltroCli},
          {label:"País",opciones:paises,valor:filtroPais,onChange:setFiltroPais},
          {label:"Año",opciones:años,valor:filtroAño,onChange:v=>setFiltroAño(String(v))},
          {label:"Estado",opciones:["Todos","Confirmado","Por confirmar"],valor:filtroEst,onChange:setFiltroEst},
        ]}
        onExportar={async ()=>exportCSV(
          filtrado.map(r=>[r.cliente,r.pais,r.vivero||"",r.fechaPedido||"",
            r.añoEntrega,`T${r.trimEntrega}`,r.nPlantas||0,r.ha||0,r.estado||"",
            r.regaliaVivero||"",r.pctAnticipo||60,
            `T${r.trimPagoVivero} ${r.añoPagoVivero}`]),
          ["Cliente","País","Vivero","Fecha Pedido","Año Entrega","Trim.","N° Plantas","Há","Estado",
           "Regalía US$/Pl","% Anticipo","Trim. Pago Vivero"],
          "TotalPedidos"
        )}
      />

      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",background:"#fff",borderRadius:10,overflow:"hidden"}}>
          <Th cols={[
            {l:"Estado",c:true,w:130},{l:"Cliente",w:130},{l:"País",w:70},{l:"Vivero",w:120},
            {l:"Fecha Pedido",c:true,w:110},{l:"Entrega",c:true,w:100},
            {l:"N° Plantas",c:true,w:100},{l:"Há",c:true,w:70},
            {l:"Regalía/Pl",c:true,w:90},{l:"% Antic.",c:true,w:80},{l:"Trim. Pago",c:true,w:100},
            ...(can?[{l:"",c:true,w:40}]:[]),
          ]}/>
          <tbody>
            {filtrado.map((r,i)=>(
              <tr key={r.id} style={{borderBottom:"1px solid #f1f5f9",
                background:r.estado==="Confirmado"?"#f0fdf4":i%2===0?"#fff":"#fffbeb"}}>
                <td style={{padding:"7px 10px",textAlign:"center"}}>
                  {can
                    ? <select value={r.estado||"Por confirmar"} onChange={e=>upd(r.id,"estado",e.target.value)}
                        style={{borderRadius:20,border:`1px solid ${r.estado==="Confirmado"?"#86efac":"#fde047"}`,
                          background:r.estado==="Confirmado"?C.verdeBg:C.amBg,
                          color:r.estado==="Confirmado"?C.verde:C.am,
                          padding:"3px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                        <option value="Por confirmar">⏳ Por confirmar</option>
                        <option value="Confirmado">✅ Confirmado</option>
                      </select>
                    : <span style={{background:r.estado==="Confirmado"?C.verdeBg:C.amBg,
                        color:r.estado==="Confirmado"?C.verde:C.am,
                        borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:700}}>
                        {r.estado==="Confirmado"?"✅ Confirmado":"⏳ Por confirmar"}
                      </span>
                  }
                </td>
                <td style={{padding:"7px 10px",fontWeight:600}}>
                  <NombreCliente nombre={r.cliente} clientes={clientes} onChange={v=>upd(r.id,"cliente",v)} can={can}/>
                </td>
                <td style={{padding:"7px 10px",fontSize:12}}><Cell val={r.pais} onChange={v=>upd(r.id,"pais",v)} opts={PAISES} can={can}/></td>
                <td style={{padding:"7px 10px",fontSize:11}}><Cell val={r.vivero||""} onChange={v=>upd(r.id,"vivero",v)} opts={VIVEROS} can={can}/></td>
                <td style={{padding:"7px 10px",textAlign:"center",fontSize:11}}>
                  <Cell val={r.fechaPedido||""} onChange={v=>upd(r.id,"fechaPedido",v)} type="date" can={can}/>
                </td>
                <td style={{padding:"7px 10px",textAlign:"center",fontWeight:600,color:C.teal,fontSize:12}}>
                  {r.añoEntrega} T{r.trimEntrega}
                </td>
                <td style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:C.teal}}>
                  <Cell val={r.nPlantas} onChange={v=>upd(r.id,"nPlantas",parseFloat(v)||0)} type="number" can={can}/>
                </td>
                <td style={{padding:"7px 10px",textAlign:"right"}}>
                  <Cell val={r.ha||""} onChange={v=>upd(r.id,"ha",parseFloat(v)||0)} type="number" can={can} ph="0"/>
                </td>
                <td style={{padding:"7px 10px",textAlign:"center",fontSize:11}}>
                  <Cell val={r.regaliaVivero||regalias[r.vivero]||0.45} onChange={v=>upd(r.id,"regaliaVivero",parseFloat(v)||0)} type="number" can={can}/>
                </td>
                <td style={{padding:"7px 10px",textAlign:"center",fontSize:11}}>
                  <Cell val={r.pctAnticipo||60} onChange={v=>upd(r.id,"pctAnticipo",parseFloat(v)||60)} type="number" can={can}/>
                  <span style={{fontSize:9,color:C.gris}}>%</span>
                </td>
                <td style={{padding:"7px 10px",textAlign:"center",fontSize:11,color:C.mo,fontWeight:600}}>
                  {r.trimPagoVivero&&r.añoPagoVivero
                    ? <Cell val={`T${r.trimPagoVivero} ${r.añoPagoVivero}`}
                        onChange={v=>{
                          const m=v.match(/T?(\d)\s+(\d{4})/);
                          if(m){upd(r.id,"trimPagoVivero",parseInt(m[1]));upd(r.id,"añoPagoVivero",parseInt(m[2]));}
                        }} can={can}/>
                    : "—"
                  }
                </td>
                {can&&<td style={{padding:"4px 6px",textAlign:"center"}}>
                  <button onClick={()=>{if(window.confirm(`¿Eliminar pedido de "${r.cliente}"?`))setData(prev=>prev.filter(x=>x.id!==r.id));}}
                    style={{background:"#fee2e2",border:"none",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:12,color:"#991b1b",fontWeight:700}}>×</button>
                </td>}
              </tr>
            ))}
            {filtrado.length===0&&<tr><td colSpan={12} style={{textAlign:"center",padding:32,color:C.gris,fontSize:13}}>
              Sin registros.
            </td></tr>}
          </tbody>
        </table>
      </div>

      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#0006",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:16,padding:28,width:560,maxWidth:"95vw",maxHeight:"92vh",overflowY:"auto",boxShadow:"0 8px 32px #0003"}}>
            <h3 style={{margin:"0 0 16px",color:C.sl}}>Nuevo Pedido de Plantas</h3>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {/* Columna izquierda */}
              <div style={{gridColumn:"1/-1"}}>
                <SelectorCliente form={form} setForm={f=>setForm(prev=>calcularDefaults({...prev,...f}))} clientes={clientes}/>
              </div>

              {[
                ["País","pais","select",PAISES],
                ["Estado","estado","select",["Por confirmar","Confirmado"]],
                ["Vivero","vivero","select",VIVEROS],
                ["Fecha Pedido","fechaPedido","date",null],
                ["Año Entrega","añoEntrega","number",null],
                ["Trim. Entrega","trimEntrega","select",["1","2","3","4"]],
                ["N° Plantas","nPlantas","number",null],
                ["Hectáreas a plantar","ha","number",null],
              ].map(([l,c,t,opts])=>(
                <div key={c}>
                  <label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>{l}</label>
                  {opts
                    ? <select value={form[c]||""} onChange={e=>setF(c,e.target.value)}
                        style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}>
                        {opts.map(o=><option key={o}>{o}</option>)}
                      </select>
                    : <input type={t} value={form[c]||""} onChange={e=>setF(c,e.target.value)}
                        style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                  }
                </div>
              ))}
            </div>

            {/* Sección Fee Vivero */}
            <div style={{marginTop:16,background:"#f0fdf4",borderRadius:10,padding:"14px 16px",border:"1px solid #86efac"}}>
              <div style={{fontSize:12,fontWeight:700,color:C.verde,marginBottom:10}}>🏭 Fee Vivero (se genera automáticamente)</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                <div>
                  <label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>Regalía US$/Planta</label>
                  <input type="number" step="0.01" value={form.regaliaVivero||""} onChange={e=>setF("regaliaVivero",e.target.value)}
                    style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #86efac",fontSize:13,boxSizing:"border-box"}}/>
                </div>
                <div>
                  <label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>% Anticipo (OC)</label>
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <input type="number" min="0" max="100" value={form.pctAnticipo||60} onChange={e=>setF("pctAnticipo",e.target.value)}
                      style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #86efac",fontSize:13,boxSizing:"border-box"}}/>
                    <span style={{fontSize:11,color:C.gris}}>%</span>
                  </div>
                </div>
                <div>
                  <label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>% Despacho</label>
                  <input type="text" readOnly value={`${100-(Number(form.pctAnticipo)||60)}%`}
                    style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #e2e8f0",fontSize:13,background:"#f8fafc",color:C.gris,boxSizing:"border-box"}}/>
                </div>
                <div>
                  <label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>Trim. Pago Vivero</label>
                  <select value={form.trimPagoVivero||""} onChange={e=>setF("trimPagoVivero",e.target.value)}
                    style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #86efac",fontSize:13,boxSizing:"border-box"}}>
                    <option value="1">T1 Ene-Mar</option>
                    <option value="2">T2 Abr-Jun</option>
                    <option value="3">T3 Jul-Sep</option>
                    <option value="4">T4 Oct-Dic</option>
                  </select>
                </div>
                <div>
                  <label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>Año Pago Vivero</label>
                  <input type="number" value={form.añoPagoVivero||""} onChange={e=>setF("añoPagoVivero",e.target.value)}
                    style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #86efac",fontSize:13,boxSizing:"border-box"}}/>
                </div>
                {form.nPlantas&&form.regaliaVivero&&(
                  <div style={{display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
                    <div style={{background:"#fff",borderRadius:8,padding:"8px 10px",border:"1px solid #86efac",fontSize:11}}>
                      <div style={{color:C.gris}}>Total regalia:</div>
                      <div style={{fontWeight:800,color:C.verde,fontSize:14}}>
                        US${((Number(form.nPlantas)||0)*(Number(form.regaliaVivero)||0)).toLocaleString("es-CL",{minimumFractionDigits:2,maximumFractionDigits:2})}
                      </div>
                      <div style={{color:C.azul,fontSize:10}}>
                        OC: {form.pctAnticipo||60}% · Despacho: {100-(Number(form.pctAnticipo)||60)}%
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:20}}>
              <button onClick={()=>{setModal(false);setForm(formVacio);}}
                style={{padding:"8px 18px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:14}}>Cancelar</button>
              <button onClick={agregar}
                style={{padding:"8px 18px",borderRadius:8,border:"none",background:C.azul,color:"#fff",cursor:"pointer",fontSize:14,fontWeight:600}}>
                {form.estado==="Confirmado"?"✅ Guardar y propagar":"💾 Guardar pedido"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ROYALTY POR PLANTA — Se alimenta de Total Pedidos
// ══════════════════════════════════════════════════════════
function RoyaltyPlanta({data,setData,tpData,can,clientes=[]}) {
  const [filtroPais,setFiltroPais]=useState("Todos");
  const [filtroAño,setFiltroAño]=useState("Todos");
  const [filtroCobro,setFiltroCobro]=useState("Todos");
  const [filtroFact,setFiltroFact]=useState("Todos");
  const [filtroCli,setFiltroCli]=useState("");
  const [modal,setModal]=useState(false);
  const [form,setForm]=useState({
    tpId:"",cliente:"",pais:"Peru",vivero:"Synergia Chile",
    nPlantas:"",usdPlanta:"",fechaPago:"",
    nFact:"",pagado:false,
  });

  // Sincronizar: agregar automáticamente registros de pedidos que no tienen royalty aún
  // (se hace en el componente padre al navegar)

  const años=["Todos",...Array.from(new Set(data.map(r=>r.añoEntrega||r.año))).sort()];
  const paises=["Todos",...Array.from(new Set(data.map(r=>r.pais).filter(Boolean))).sort()];

  // Sync reactiva: si el registro tiene tpId, actualiza cliente/pais/nPlantas desde Total Pedidos
  const dataConSync = useMemo(()=>{
    const tpMap = {};
    (tpData||[]).forEach(r=>{ tpMap[r.id]=r; });
    return data.map(r=>{
      if(!r.tpId || !tpMap[r.tpId]) return r;
      const tp = tpMap[r.tpId];
      return {...r, cliente:tp.cliente, pais:tp.pais, vivero:tp.vivero||r.vivero,
        nPlantas:r.nPlantas||tp.nPlantas}; // nPlantas del royalty puede diferir del pedido
    });
  },[data,tpData]);

  const calc=useMemo(()=>dataConSync.map(r=>{
    const mf=(Number(r.nPlantas)||0)*(Number(r.usdPlanta)||0);
    return{...r,montoFact:mf,montoCobro:mf*pct(r.pais)};
  }),[dataConSync]);

  const filtrado=calc.filter(r=>
    (filtroPais==="Todos"||r.pais===filtroPais)&&
    (filtroAño==="Todos"||(r.añoEntrega||r.año)===Number(filtroAño))&&
    (filtroCobro==="Todos"||(filtroCobro==="Pagado"?r.pagado:!r.pagado))&&
    (filtroFact==="Todos"||(filtroFact==="Facturado"?r.nFact&&r.nFact.trim()!=="":!r.nFact||r.nFact.trim()===""))&&
    (!filtroCli||r.cliente?.toLowerCase().includes(filtroCli.toLowerCase()))
  );

  const totFact=filtrado.reduce((s,r)=>s+r.montoFact,0);
  const totCobro=filtrado.reduce((s,r)=>s+r.montoCobro,0);
  const totPend=filtrado.filter(r=>!r.pagado).reduce((s,r)=>s+r.montoCobro,0);

  function upd(id,c,v){
    setData(prev=>prev.map(r=>{
      if(r.id!==id) return r;
      const updated={...r,[c]:v};
      // Si se ingresa N° factura, marcar como Facturado automáticamente
      if(c==="nFact"&&v&&String(v).trim()!=="") updated.facturado=true;
      return updated;
    }));
  }

  function agregar(){
    if(!form.cliente.trim()){alert("Cliente es obligatorio.");return;}
    setData(prev=>[...prev,{
      ...form,id:`rp_${Date.now()}`,
      nPlantas:parseFloat(form.nPlantas)||0,
      usdPlanta:parseFloat(form.usdPlanta)||0,
    }]);
    setModal(false);
    setForm({tpId:"",cliente:"",pais:"Peru",vivero:"Synergia Chile",nPlantas:"",usdPlanta:"",fechaPago:"",nFact:"",pagado:false});
  }

  // Pre-llenar form desde Total Pedidos
  function seleccionarPedido(tpId){
    const tp=tpData.find(r=>r.id===tpId);
    if(!tp) return;
    setForm(p=>({...p,tpId,cliente:tp.cliente,pais:tp.pais,vivero:tp.vivero||"",nPlantas:tp.nPlantas}));
  }

  return (
    <div>
      <div style={{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:10,padding:"8px 14px",marginBottom:14,fontSize:12,color:"#15803d"}}>
        💡 <strong>Monto a Facturar</strong> = N° Plantas × US$/Planta &nbsp;·&nbsp;
        <strong>Monto a Cobrar</strong> = Facturar × (100% Chile sin WHT / 85% Perú y México WHT 15%)
      </div>

      <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        {[
          [$$(totFact),"Monto a Facturar",C.azul,C.azulBg],
          [$$(totCobro),"Monto a Cobrar",C.verde,C.verdeBg],
          [$$(totPend),"Por Cobrar",C.am,C.amBg],
          [filtrado.length,"Registros",C.gris,C.grisBg],
        ].map(([v,l,c,bg])=>(
          <div key={l} style={{background:bg,borderRadius:12,padding:"12px 18px",flex:1,minWidth:120}}>
            <div style={{fontSize:11,color:c,fontWeight:600}}>{l}</div>
            <div style={{fontSize:20,fontWeight:800,color:c}}>{v}</div>
          </div>
        ))}
        {can&&<button onClick={()=>setModal(true)}
          style={{background:C.azul,color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",
            cursor:"pointer",fontSize:12,fontWeight:700,alignSelf:"center"}}>
          + Agregar
        </button>}
      </div>

      <BarraFiltros
        filtros={[
          {label:"Cliente",tipo:"input",valor:filtroCli,onChange:setFiltroCli},
          {label:"País",opciones:paises,valor:filtroPais,onChange:setFiltroPais},
          {label:"Año",opciones:años,valor:filtroAño,onChange:v=>setFiltroAño(String(v))},
          {label:"Cobro",opciones:["Todos","Pagado","Por cobrar"],valor:filtroCobro,onChange:setFiltroCobro},
          {label:"Factura",opciones:["Todos","Facturado","Pendiente"],valor:filtroFact,onChange:setFiltroFact},
        ]}
        onExportar={async ()=>exportCSV(
          filtrado.map(r=>[r.cliente,r.pais,r.vivero||"",r.añoEntrega||r.año||"",
            r.nPlantas,r.usdPlanta,r.montoFact.toFixed(2),r.montoCobro.toFixed(2),
            r.nFact||"",r.nFact&&r.nFact.trim()?"Facturado":"Pend. facturar",
            r.pagado?"Pagado":"Por cobrar",r.fechaPago||""]),
          ["Cliente","País","Vivero","Año","N° Plantas","US$/Planta","Mto.Facturar","Mto.Cobrar",
           "N° Factura","Est.Factura","Est.Cobro","Fecha Pago"],
          "RoyaltyPlanta"
        )}
      />

      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",background:"#fff",borderRadius:10,overflow:"hidden"}}>
          <Th cols={[
            {l:"Cliente",w:120},{l:"País",w:80},{l:"Vivero",w:120},{l:"Año",c:true,w:60},
            {l:"N° Plantas",c:true,w:100},{l:"US$/Planta",c:true,w:90},
            {l:"Mto. Facturar",c:true,w:120},{l:"WHT",c:true,w:70},{l:"Mto. Cobrar",c:true,w:120},
            {l:"N° Factura",c:true,w:110},{l:"Est. Factura",c:true,w:130},
            {l:"Estado Cobro",c:true,w:120},{l:"Fecha Pago",c:true,w:110},
            ...(can?[{l:"",c:true,w:40}]:[]),
          ]}/>
          <tbody>
            {filtrado.map((r,i)=>{
              const facturado = r.nFact&&String(r.nFact).trim()!=="";
              return(
                <tr key={r.id} style={{borderBottom:"1px solid #f1f5f9",background:i%2===0?"#fff":"#f8fafc"}}>
                  <td style={{padding:"7px 10px",fontWeight:600}}>
                    <NombreCliente nombre={r.cliente} clientes={clientes} onChange={v=>upd(r.id,"cliente",v)} can={can}/>
                  </td>
                  <td style={{padding:"7px 10px",fontSize:12}}><Cell val={r.pais} onChange={v=>upd(r.id,"pais",v)} opts={PAISES} can={can}/></td>
                  <td style={{padding:"7px 10px",fontSize:11}}><Cell val={r.vivero||""} onChange={v=>upd(r.id,"vivero",v)} opts={VIVEROS} can={can}/></td>
                  <td style={{padding:"7px 10px",textAlign:"center",fontSize:12,color:C.gris}}>{r.añoEntrega||r.año||"—"}</td>
                  <td style={{padding:"7px 10px",textAlign:"right",fontWeight:600}}><Cell val={r.nPlantas} onChange={v=>upd(r.id,"nPlantas",parseFloat(v)||0)} type="number" can={can}/></td>
                  <td style={{padding:"7px 10px",textAlign:"center"}}><Cell val={r.usdPlanta||""} onChange={v=>upd(r.id,"usdPlanta",parseFloat(v)||0)} type="number" can={can} ph="0.00"/></td>
                  <td style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:C.azul}}>{$$(r.montoFact)}</td>
                  <td style={{padding:"7px 10px",textAlign:"center",fontSize:11}}>
                    {whtLabel(r.pais)
                      ? <span style={{background:"#fee2e2",color:"#dc2626",borderRadius:20,padding:"2px 8px",fontSize:10,fontWeight:700}}>{whtLabel(r.pais)}</span>
                      : <span style={{background:"#dcfce7",color:"#16a34a",borderRadius:20,padding:"2px 8px",fontSize:10,fontWeight:700}}>Sin WHT</span>
                    }
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:C.verde}}>{$$(r.montoCobro)}</td>
                  <td style={{padding:"7px 10px",textAlign:"center"}}>
                    <Cell val={r.nFact||""} onChange={v=>upd(r.id,"nFact",v)} can={can} ph="F-001"/>
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"center"}}>
                    <span style={{
                      background:facturado?"#dbeafe":"#fef3c7",
                      color:facturado?"#2563eb":"#d97706",
                      borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"
                    }}>
                      {facturado?"📄 Facturado":"⏸ Pend. facturar"}
                    </span>
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"center"}}>
                    <BadgePago pagado={r.pagado} onChange={v=>upd(r.id,"pagado",v)} can={can}/>
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"center",fontSize:12}}>
                    <Cell val={r.fechaPago||""} onChange={v=>upd(r.id,"fechaPago",v)} type="date" can={can}/>
                  </td>
                  {can&&<td style={{padding:"4px 6px",textAlign:"center"}}>
                    <button onClick={()=>{if(window.confirm(`¿Eliminar royalty de "${r.cliente}"?`))setData(prev=>prev.filter(x=>x.id!==r.id));}}
                      style={{background:"#fee2e2",border:"none",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:12,color:"#991b1b",fontWeight:700}}>×</button>
                  </td>}
                </tr>
              );
            })}
            {filtrado.length===0&&<tr><td colSpan={14} style={{textAlign:"center",padding:32,color:C.gris,fontSize:13}}>
              Sin registros.
            </td></tr>}
          </tbody>
        </table>
      </div>

      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#0006",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:16,padding:28,width:500,maxWidth:"94vw",maxHeight:"90vh",overflowY:"auto",boxShadow:"0 8px 32px #0003"}}>
            <h3 style={{margin:"0 0 14px",color:C.sl}}>Nuevo Royalty por Planta</h3>
            {tpData.length>0&&(
              <div style={{marginBottom:12}}>
                <label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>
                  📦 Importar desde Total Pedidos (opcional)
                </label>
                <select value={form.tpId||""} onChange={e=>seleccionarPedido(e.target.value)}
                  style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #93c5fd",fontSize:12,color:"#2563eb"}}>
                  <option value="">— Seleccionar pedido —</option>
                  {tpData.map(tp=>(
                    <option key={tp.id} value={tp.id}>
                      {tp.cliente} — {tp.pais} — {N(tp.nPlantas)} plantas — {tp.añoEntrega} T{tp.trimEntrega}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <SelectorCliente form={form} setForm={setForm} clientes={clientes}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:12}}>
              {[
                ["País","pais","select",PAISES],
                ["Vivero","vivero","select",VIVEROS],
                ["N° Plantas","nPlantas","number",null],
                ["US$/Planta","usdPlanta","number",null],
                ["N° Factura","nFact","text",null],
                ["Fecha estimada pago","fechaPago","date",null],
              ].map(([l,c,t,opts])=>(
                <div key={c}>
                  <label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>{l}</label>
                  {opts
                    ? <select value={form[c]||""} onChange={e=>setForm(p=>({...p,[c]:e.target.value}))}
                        style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}>
                        {opts.map(o=><option key={o}>{o}</option>)}
                      </select>
                    : <input type={t} value={form[c]||""} onChange={e=>setForm(p=>({...p,[c]:e.target.value}))}
                        style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                  }
                </div>
              ))}
            </div>
            <label style={{display:"flex",alignItems:"center",gap:8,marginTop:12,cursor:"pointer",fontSize:13,fontWeight:600,color:C.verde}}>
              <input type="checkbox" checked={form.pagado||false} onChange={()=>setForm(p=>({...p,pagado:!p.pagado}))}/>
              ✅ Marcar como Pagado
            </label>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:20}}>
              <button onClick={()=>setModal(false)} style={{padding:"8px 18px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:14}}>Cancelar</button>
              <button onClick={agregar} style={{padding:"8px 18px",borderRadius:8,border:"none",background:C.azul,color:"#fff",cursor:"pointer",fontSize:14,fontWeight:600}}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// FEE DE ENTRADA — Auto-generado desde contratos con fee
// ══════════════════════════════════════════════════════════
function FeeEntrada({data,setData,ctData,can,clientes=[]}) {
  const [filtroPais,setFiltroPais]=useState("Todos");
  const [filtroCobro,setFiltroCobro]=useState("Todos");
  const [filtroCli,setFiltroCli]=useState("");

  // Sincronización reactiva con contratos:
  // - Cada contrato con fee genera/actualiza su fila automáticamente
  // - Los datos del contrato (cliente, pais, monto, detalle) SIEMPRE vienen del contrato actual
  // - Solo se preservan las ediciones del usuario: nFact, pagado, fechaPago
  const dataConSync = useMemo(()=>{
    // Mapa de ediciones guardadas por ctId
    const edits = {};
    data.forEach(r=>{
      const key = r.ctId || r.id;
      edits[key] = r;
    });
    // Generar vista desde contratos vigentes
    const fromContracts = (ctData||[])
      .filter(ct=> ct.tipoContractFee && ct.tipoContractFee!=="Sin Contract Fee")
      .map(ct=>{
        const saved = edits[ct.id] || edits[`fe_${ct.id}`] || {};
        return {
          id: saved.id || `fe_${ct.id}`,
          ctId: ct.id,
          // Datos del contrato — siempre actualizados
          cliente: ct.razonSocial,
          pais:    ct.pais,
          montoUSD: ct.montoContractFee || 30000,
          detalle:  ct.tipoContractFee || "",
          // Ediciones del usuario — preservadas
          nFact:    saved.nFact    || "",
          pagado:   saved.pagado   || false,
          fechaPago:saved.fechaPago|| "",
          _fromContract: true,
        };
      });
    // Agregar registros manuales (sin ctId) que el usuario haya creado
    const manuales = data.filter(r=> !r.ctId && !r._fromContract);
    return [...fromContracts, ...manuales];
  },[data,ctData]);

  const filtrado=dataConSync.filter(r=>
    (filtroPais==="Todos"||r.pais===filtroPais)&&
    (filtroCobro==="Todos"||(filtroCobro==="Pagado"?r.pagado:!r.pagado))&&
    (!filtroCli||r.cliente?.toLowerCase().includes(filtroCli.toLowerCase()))
  );

  const totCobrado=filtrado.filter(r=>r.pagado).reduce((s,r)=>s+(r.montoUSD||0),0);
  const totPend=filtrado.filter(r=>!r.pagado).reduce((s,r)=>s+(r.montoUSD||0),0);

  function upd(id,c,v){
    // Si el registro viene de un contrato y aún no está en data, lo agregamos
    const existe = data.find(r=>r.id===id);
    if(!existe){
      const fromSync = dataConSync.find(r=>r.id===id);
      if(fromSync) setData(prev=>[...prev,{...fromSync,[c]:v}]);
      return;
    }
    setData(prev=>prev.map(r=>{
      if(r.id!==id) return r;
      const updated={...r,[c]:v};
      return updated;
    }));
  }

  const paises=["Todos",...Array.from(new Set(dataConSync.map(r=>r.pais).filter(Boolean))).sort()];

  return (
    <div>
      <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:10,padding:"8px 14px",marginBottom:14,fontSize:12,color:"#1d4ed8"}}>
        💡 Los fees de entrada se generan automáticamente desde los contratos que tienen fee. El estado de facturación se actualiza al ingresar el N° de factura.
      </div>

      <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        {[
          [$$(totCobrado),"Cobrado",C.verde,C.verdeBg],
          [$$(totPend),"Por Cobrar",C.am,C.amBg],
          [filtrado.length,"Registros",C.gris,C.grisBg],
        ].map(([v,l,c,bg])=>(
          <div key={l} style={{background:bg,borderRadius:12,padding:"12px 18px",flex:1,minWidth:120}}>
            <div style={{fontSize:11,color:c,fontWeight:600}}>{l}</div>
            <div style={{fontSize:20,fontWeight:800,color:c}}>{v}</div>
          </div>
        ))}
      </div>

      <BarraFiltros
        filtros={[
          {label:"Cliente",tipo:"input",valor:filtroCli,onChange:setFiltroCli},
          {label:"País",opciones:paises,valor:filtroPais,onChange:setFiltroPais},
          {label:"Cobro",opciones:["Todos","Pagado","Por cobrar"],valor:filtroCobro,onChange:setFiltroCobro},
        ]}
        onExportar={async ()=>exportCSV(
          filtrado.map(r=>[r.cliente,r.pais,r.detalle||"",r.montoUSD||0,
            r.nFact||"",r.nFact&&r.nFact.trim()?"Facturado":"Pend. facturar",
            r.pagado?"Pagado":"Por cobrar",r.fechaPago||""]),
          ["Cliente","País","Tipo Fee","Monto US$","N° Factura","Est. Factura","Est. Cobro","Fecha Pago"],
          "FeeEntrada"
        )}
      />

      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",background:"#fff",borderRadius:10,overflow:"hidden"}}>
          <Th cols={[
            {l:"Cliente",w:150},{l:"País",w:80},{l:"Tipo Fee",w:130},
            {l:"Monto US$",c:true,w:110},{l:"N° Factura",c:true,w:110},
            {l:"Est. Factura",c:true,w:140},{l:"Estado Cobro",c:true,w:130},
            {l:"Fecha Pago",c:true,w:110},
          ]}/>
          <tbody>
            {filtrado.map((r,i)=>{
              const facturado=r.nFact&&String(r.nFact).trim()!=="";
              return(
                <tr key={r.id} style={{borderBottom:"1px solid #f1f5f9",background:i%2===0?"#fff":"#f8fafc"}}>
                  <td style={{padding:"8px 12px",fontWeight:600}}>
                    <NombreCliente nombre={r.cliente} clientes={clientes} onChange={v=>upd(r.id,"cliente",v)} can={can}/>
                  </td>
                  <td style={{padding:"8px 12px",fontSize:12,color:C.gris}}>{r.pais}</td>
                  <td style={{padding:"8px 12px",fontSize:12}}>
                    <span style={{background:r.detalle==="Con Devolución"?C.verdeBg:C.amBg,
                      color:r.detalle==="Con Devolución"?C.verde:C.am,
                      borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700}}>
                      {r.detalle||"—"}
                    </span>
                  </td>
                  <td style={{padding:"8px 12px",textAlign:"right",fontWeight:700,color:C.mo}}>
                    <Cell val={r.montoUSD||0} onChange={v=>upd(r.id,"montoUSD",parseFloat(v)||0)} type="number" can={can}/>
                  </td>
                  <td style={{padding:"8px 12px",textAlign:"center"}}>
                    <Cell val={r.nFact||""} onChange={v=>upd(r.id,"nFact",v)} can={can} ph="F-001"/>
                  </td>
                  <td style={{padding:"8px 12px",textAlign:"center"}}>
                    <span style={{
                      background:facturado?"#dbeafe":"#fef3c7",
                      color:facturado?"#2563eb":"#d97706",
                      borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"
                    }}>
                      {facturado?"📄 Facturado":"⏸ Pend. facturar"}
                    </span>
                  </td>
                  <td style={{padding:"8px 12px",textAlign:"center"}}>
                    <BadgePago pagado={r.pagado} onChange={v=>upd(r.id,"pagado",v)} can={can}/>
                  </td>
                  <td style={{padding:"8px 12px",textAlign:"center",fontSize:12}}>
                    <Cell val={r.fechaPago||""} onChange={v=>upd(r.id,"fechaPago",v)} type="date" can={can}/>
                  </td>
                </tr>
              );
            })}
            {filtrado.length===0&&<tr><td colSpan={8} style={{textAlign:"center",padding:32,color:C.gris,fontSize:13}}>
              No hay contratos con fee de entrada registrados.
            </td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ROYALTY COMERCIAL — Se cobra desde 1er año de producción
// ══════════════════════════════════════════════════════════
function RoyaltyComercial({data,setData,tpData,can,clientes=[]}) {
  const [filtroPais,setFiltroPais]=useState("Todos");
  const [filtroAño,setFiltroAño]=useState("Todos");
  const [filtroCobro,setFiltroCobro]=useState("Todos");
  const [filtroCli,setFiltroCli]=useState("");
  const [modal,setModal]=useState(false);
  const [form,setForm]=useState({
    cliente:"",pais:"Peru",
    ha:"",usdHa:3000,
    añoPrimerCobro:"",trimPrimerCobro:"2",
    repetirAños:5,
    nFact:"",pagado:false,
  });

  // Sync reactiva con Total Pedidos si tiene tpId vinculado
  const dataConSync = useMemo(()=>{
    const tpMap = {};
    (tpData||[]).forEach(r=>{ tpMap[r.id]=r; });
    return data.map(r=>{
      if(!r.tpId || !tpMap[r.tpId]) return r;
      const tp = tpMap[r.tpId];
      return {...r, cliente:tp.cliente, pais:tp.pais};
    });
  },[data,tpData]);

  const calc=useMemo(()=>{
    const ahora=new Date();ahora.setHours(0,0,0,0);
    return dataConSync.map(r=>{
      const mf=(Number(r.ha)||0)*(Number(r.usdHa)||3000);
      const mc=mf*pct(r.pais);
      const fAviso=fechaAvisoTrim(r.añoCobro,r.trimCobro);
      const fInicio=fechaInicioTrim(r.añoCobro,r.trimCobro);
      const diasAviso=Math.ceil((fAviso-ahora)/(1000*60*60*24));
      const alertaActiva=ahora>=fAviso&&ahora<fInicio&&!r.nFact;
      return{...r,montoFact:mf,montoCobro:mc,fAviso,fInicio,diasAviso,alertaActiva};
    });
  },[dataConSync]);

  const años=["Todos",...Array.from(new Set(calc.map(r=>r.añoCobro))).sort()];
  const paises=["Todos",...Array.from(new Set(calc.map(r=>r.pais).filter(Boolean))).sort()];

  const filtrado=calc.filter(r=>
    (filtroPais==="Todos"||r.pais===filtroPais)&&
    (filtroAño==="Todos"||r.añoCobro===Number(filtroAño))&&
    (filtroCobro==="Todos"||(filtroCobro==="Pagado"?r.pagado:!r.pagado))&&
    (!filtroCli||r.cliente?.toLowerCase().includes(filtroCli.toLowerCase()))
  );

  const alertas=calc.filter(r=>r.alertaActiva);
  const totFact=filtrado.reduce((s,r)=>s+r.montoFact,0);
  const totCobro=filtrado.reduce((s,r)=>s+r.montoCobro,0);
  const totPend=filtrado.filter(r=>!r.pagado).reduce((s,r)=>s+r.montoCobro,0);

  function upd(id,c,v){setData(prev=>prev.map(r=>r.id===id?{...r,[c]:v}:r));}

  function agregar(){
    if(!form.cliente.trim()){alert("Cliente es obligatorio.");return;}
    if(!form.ha||isNaN(form.ha)){alert("Las hectáreas son obligatorias.");return;}
    if(!form.añoPrimerCobro){alert("El año del primer cobro es obligatorio.");return;}

    const añoBase=parseInt(form.añoPrimerCobro);
    const trimBase=parseInt(form.trimPrimerCobro)||2;
    const nAños=parseInt(form.repetirAños)||5;
    const nuevos=[];
    for(let i=0;i<nAños;i++){
      nuevos.push({
        id:`rc_${Date.now()}_${i}`,
        cliente:form.cliente,pais:form.pais,
        ha:parseFloat(form.ha)||0,
        usdHa:parseFloat(form.usdHa)||3000,
        añoCobro:añoBase+i,trimCobro:trimBase,
        nFact:"",pagado:false,
        _generado:true,
      });
    }
    setData(prev=>[...prev,...nuevos]);
    setModal(false);
    setForm({cliente:"",pais:"Peru",ha:"",usdHa:3000,añoPrimerCobro:"",trimPrimerCobro:"2",repetirAños:5,nFact:"",pagado:false});
  }

  const TRIM_LABELS=["","T1 (Ene-Mar)","T2 (Abr-Jun)","T3 (Jul-Sep)","T4 (Oct-Dic)"];

  return (
    <div>
      {alertas.length>0&&(
        <div style={{marginBottom:16}}>
          {alertas.map(r=>(
            <div key={r.id} style={{background:"#fef3c7",border:"2px solid #fde047",borderRadius:12,
              padding:"12px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:22}}>⚠️</span>
              <div>
                <div style={{fontWeight:700,fontSize:13,color:C.sl}}>Facturar próximamente — {r.cliente}</div>
                <div style={{fontSize:12,color:C.gris}}>
                  Royalty Comercial {TRIM_LABELS[r.trimCobro]} {r.añoCobro} · {$$(r.montoFact)} a facturar
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:10,padding:"8px 14px",marginBottom:14,fontSize:12,color:"#15803d"}}>
        💡 Royalty Comercial = Há productivas × US$/Há (default US$3.000) · Se cobra desde el 1er año de producción, repitiéndose cada año en el mismo trimestre. El usuario ajusta el US$/Há manualmente cada año según inflación.
      </div>

      <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        {[
          [$$(totFact),"Total a Facturar",C.mo,C.moBg],
          [$$(totCobro),"Total a Cobrar",C.verde,C.verdeBg],
          [$$(totPend),"Por Cobrar",C.am,C.amBg],
          [filtrado.length,"Registros",C.gris,C.grisBg],
        ].map(([v,l,c,bg])=>(
          <div key={l} style={{background:bg,borderRadius:12,padding:"12px 18px",flex:1,minWidth:120}}>
            <div style={{fontSize:11,color:c,fontWeight:600}}>{l}</div>
            <div style={{fontSize:20,fontWeight:800,color:c}}>{v}</div>
          </div>
        ))}
        {can&&<button onClick={()=>setModal(true)}
          style={{background:C.azul,color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",
            cursor:"pointer",fontSize:12,fontWeight:700,alignSelf:"center"}}>
          + Agregar
        </button>}
      </div>

      <BarraFiltros
        filtros={[
          {label:"Cliente",tipo:"input",valor:filtroCli,onChange:setFiltroCli},
          {label:"País",opciones:paises,valor:filtroPais,onChange:setFiltroPais},
          {label:"Año cobro",opciones:años,valor:filtroAño,onChange:v=>setFiltroAño(String(v))},
          {label:"Cobro",opciones:["Todos","Pagado","Por cobrar"],valor:filtroCobro,onChange:setFiltroCobro},
        ]}
        onExportar={async ()=>exportCSV(
          filtrado.map(r=>[r.cliente,r.pais,r.ha||0,r.usdHa||3000,
            TRIM_LABELS[r.trimCobro],r.añoCobro,
            r.montoFact.toFixed(2),r.montoCobro.toFixed(2),
            r.nFact||"",r.nFact&&r.nFact.trim()?"Facturado":"Pend. facturar",
            r.pagado?"Pagado":"Por cobrar"]),
          ["Cliente","País","Há","US$/Há","Trimestre","Año Cobro",
           "Mto.Facturar","Mto.Cobrar","N° Factura","Est.Factura","Est.Cobro"],
          "RoyaltyComercial"
        )}
      />

      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",background:"#fff",borderRadius:10,overflow:"hidden"}}>
          <Th cols={[
            {l:"Cliente",w:130},{l:"País",w:80},{l:"Há",c:true,w:80},{l:"US$/Há",c:true,w:90},
            {l:"Trim./Año cobro",c:true,w:130},{l:"Mto.Facturar",c:true,w:120},{l:"WHT",c:true,w:70},
            {l:"Mto.Cobrar",c:true,w:120},{l:"N° Factura",c:true,w:110},
            {l:"Est.Factura",c:true,w:130},{l:"Estado Cobro",c:true,w:120},{l:"Alerta",c:true,w:70},
            ...(can?[{l:"",c:true,w:40}]:[]),
          ]}/>
          <tbody>
            {filtrado.map((r,i)=>{
              const facturado=r.nFact&&String(r.nFact).trim()!=="";
              return(
                <tr key={r.id} style={{borderBottom:"1px solid #f1f5f9",
                  background:r.alertaActiva?"#fffbeb":i%2===0?"#fff":"#f8fafc"}}>
                  <td style={{padding:"7px 10px",fontWeight:600}}>
                    <NombreCliente nombre={r.cliente} clientes={clientes} onChange={v=>upd(r.id,"cliente",v)} can={can}/>
                  </td>
                  <td style={{padding:"7px 10px",fontSize:12,color:C.gris}}>{r.pais}</td>
                  <td style={{padding:"7px 10px",textAlign:"right",fontWeight:600,
                    background:(!r.ha||r.ha===0)&&can?"#fffbeb":"transparent"}}>
                    <Cell val={r.ha||""} onChange={v=>upd(r.id,"ha",parseFloat(v)||0)} type="number" can={can} ph="Ingrese Há"/>
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"center"}}>
                    <Cell val={r.usdHa||3000} onChange={v=>upd(r.id,"usdHa",parseFloat(v)||3000)} type="number" can={can}/>
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"center",fontWeight:600,fontSize:12}}>
                    {TRIM_LABELS[r.trimCobro]} {r.añoCobro}
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:C.mo}}>{$$(r.montoFact)}</td>
                  <td style={{padding:"7px 10px",textAlign:"center",fontSize:11}}>
                    {whtLabel(r.pais)
                      ? <span style={{background:"#fee2e2",color:"#dc2626",borderRadius:20,padding:"2px 8px",fontSize:10,fontWeight:700}}>{whtLabel(r.pais)}</span>
                      : <span style={{background:"#dcfce7",color:"#16a34a",borderRadius:20,padding:"2px 8px",fontSize:10,fontWeight:700}}>Sin WHT</span>
                    }
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:C.verde}}>{$$(r.montoCobro)}</td>
                  <td style={{padding:"7px 10px",textAlign:"center"}}>
                    <Cell val={r.nFact||""} onChange={v=>upd(r.id,"nFact",v)} can={can} ph="F-001"/>
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"center"}}>
                    <span style={{
                      background:facturado?"#dbeafe":"#fef3c7",
                      color:facturado?"#2563eb":"#d97706",
                      borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"
                    }}>
                      {facturado?"📄 Facturado":"⏸ Pend. facturar"}
                    </span>
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"center"}}>
                    <BadgePago pagado={r.pagado} onChange={v=>upd(r.id,"pagado",v)} can={can}/>
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"center"}}>
                    {r.alertaActiva
                      ? <span style={{fontSize:18}} title="Facturar pronto">⚠️</span>
                      : <span style={{fontSize:10,color:C.gris}}>{r.diasAviso>0?`${r.diasAviso}d`:"—"}</span>
                    }
                  </td>
                  {can&&<td style={{padding:"4px 6px",textAlign:"center"}}>
                    <button onClick={()=>{if(window.confirm(`¿Eliminar royalty comercial de "${r.cliente}" ${r.añoCobro}?`))setData(prev=>prev.filter(x=>x.id!==r.id));}}
                      style={{background:"#fee2e2",border:"none",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:12,color:"#991b1b",fontWeight:700}}>×</button>
                  </td>}
                </tr>
              );
            })}
            {filtrado.length===0&&<tr><td colSpan={13} style={{textAlign:"center",padding:32,color:C.gris,fontSize:13}}>
              Sin registros.
            </td></tr>}
          </tbody>
        </table>
      </div>

      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#0006",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:16,padding:28,width:500,maxWidth:"94vw",maxHeight:"90vh",overflowY:"auto",boxShadow:"0 8px 32px #0003"}}>
            <h3 style={{margin:"0 0 14px",color:C.sl}}>Nuevo Royalty Comercial</h3>
            <div style={{background:"#f0fdf4",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:12,color:"#15803d"}}>
              Se generarán registros anuales automáticamente para los años indicados, en el mismo trimestre.
            </div>
            <SelectorCliente form={form} setForm={setForm} clientes={clientes}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:12}}>
              {[
                ["País","pais","select",PAISES],
                ["Hectáreas a cobrar","ha","number",null],
                ["US$/Há (def. 3000)","usdHa","number",null],
                ["Año 1er cobro","añoPrimerCobro","number",null],
                ["Trimestre cobro","trimPrimerCobro","select",["1","2","3","4"]],
                ["Repetir por N años","repetirAños","number",null],
              ].map(([l,c,t,opts])=>(
                <div key={c}>
                  <label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>{l}</label>
                  {opts
                    ? <select value={form[c]||""} onChange={e=>setForm(p=>({...p,[c]:e.target.value}))}
                        style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}>
                        {opts.map(o=><option key={o}>{o}</option>)}
                      </select>
                    : <input type={t} value={form[c]||""} onChange={e=>setForm(p=>({...p,[c]:e.target.value}))}
                        style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                  }
                </div>
              ))}
            </div>
            {form.ha&&form.añoPrimerCobro&&(
              <div style={{marginTop:12,background:"#f0f9ff",borderRadius:8,padding:"10px 14px",fontSize:12,color:C.azul}}>
                📋 Se generarán <strong>{form.repetirAños} registros</strong> · {form.ha} Há × US${form.usdHa}/Há = <strong>US${((Number(form.ha)||0)*(Number(form.usdHa)||3000)).toLocaleString()}/año</strong>
              </div>
            )}
            <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:20}}>
              <button onClick={()=>setModal(false)} style={{padding:"8px 18px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:14}}>Cancelar</button>
              <button onClick={agregar} style={{padding:"8px 18px",borderRadius:8,border:"none",background:C.azul,color:"#fff",cursor:"pointer",fontSize:14,fontWeight:600}}>Generar Registros</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// FEE VIVEROS — Regalías pagadas al vivero (interno)
// ══════════════════════════════════════════════════════════
function FeeViveros({data,setData,can,clientes=[]}) {
  const [filtroPais,setFiltroPais]=useState("Todos");
  const [filtroFact,setFiltroFact]=useState("Todos");
  const [filtroCobro,setFiltroCobro]=useState("Todos");
  const [filtroCli,setFiltroCli]=useState("");
  const [modal,setModal]=useState(false);
  const [form,setForm]=useState({
    vivero:"Synergiabio",empresa:"",pais:"Peru",proforma:"",
    nPlantas:"",regalia:0.45,totalOsiris:"",tipoPago:"Entrega",
    montoFact:"",fechaFact:"",nFact:"",pagado:false,
  });

  const upd=(id,c,v)=>setData(prev=>prev.map(r=>r.id===id?{...r,[c]:v}:r));

  const filtrado=data.filter(r=>{
    if(filtroFact!=="Todos"){
      if(filtroFact==="Facturado"&&!(r.nFact&&r.nFact.trim()!==""))return false;
      if(filtroFact==="Pendiente"&&(r.nFact&&r.nFact.trim()!==""))return false;
    }
    if(filtroPais!=="Todos"&&r.pais!==filtroPais)return false;
    if(filtroCobro!=="Todos"&&(filtroCobro==="Pagado"?!r.pagado:r.pagado))return false;
    if(filtroCli&&!r.empresa?.toLowerCase().includes(filtroCli.toLowerCase()))return false;
    return true;
  });

  const totFact=filtrado.reduce((s,r)=>s+(Number(r.montoFact)||0),0);
  const totPend=filtrado.filter(r=>!r.pagado).reduce((s,r)=>s+(Number(r.montoFact)||0),0);
  const paises=["Todos",...Array.from(new Set(data.map(r=>r.pais).filter(Boolean))).sort()];

  function agregar(){
    if(!form.empresa.trim()){alert("Empresa es obligatoria.");return;}
    setData(prev=>[...prev,{
      ...form,id:`fv_${Date.now()}`,
      nPlantas:parseFloat(form.nPlantas)||0,
      regalia:parseFloat(form.regalia)||0,
      totalOsiris:parseFloat(form.totalOsiris)||0,
      montoFact:parseFloat(form.montoFact)||0,
    }]);
    setModal(false);
    setForm({vivero:"Synergiabio",empresa:"",pais:"Peru",proforma:"",nPlantas:"",regalia:0.45,totalOsiris:"",tipoPago:"Entrega",montoFact:"",fechaFact:"",nFact:"",pagado:false});
  }

  return (
    <div>
      <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        {[
          [$$(totFact),"Total a Pagar Vivero",C.azul,C.azulBg],
          [$$(totPend),"Por Pagar",C.am,C.amBg],
          [filtrado.length,"Registros",C.gris,C.grisBg],
        ].map(([v,l,c,bg])=>(
          <div key={l} style={{background:bg,borderRadius:12,padding:"12px 18px",flex:1,minWidth:120}}>
            <div style={{fontSize:11,color:c,fontWeight:600}}>{l}</div>
            <div style={{fontSize:20,fontWeight:800,color:c}}>{v}</div>
          </div>
        ))}
        {can&&<button onClick={()=>setModal(true)}
          style={{background:C.azul,color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",
            cursor:"pointer",fontSize:12,fontWeight:700,alignSelf:"center"}}>
          + Agregar
        </button>}
      </div>

      <BarraFiltros
        filtros={[
          {label:"Empresa",tipo:"input",valor:filtroCli,onChange:setFiltroCli},
          {label:"País",opciones:paises,valor:filtroPais,onChange:setFiltroPais},
          {label:"Factura",opciones:["Todos","Facturado","Pendiente"],valor:filtroFact,onChange:setFiltroFact},
          {label:"Pago",opciones:["Todos","Pagado","Por pagar"],valor:filtroCobro,onChange:setFiltroCobro},
        ]}
        onExportar={async ()=>exportCSV(
          filtrado.map(r=>[r.vivero||"",r.empresa,r.pais,r.proforma||"",
            r.nPlantas||0,r.regalia||0,r.totalOsiris||0,r.tipoPago||"",
            r.montoFact||0,r.fechaFact||"",r.nFact||"",r.pagado?"Pagado":"Por pagar"]),
          ["Vivero","Empresa","País","Proforma","N° Plantas","Regalía","Total Osiris",
           "Tipo Pago","Mto.Facturar","Fecha Fact.","N° Factura","Estado Pago"],
          "FeeViveros"
        )}
      />

      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",background:"#fff",borderRadius:10,overflow:"hidden"}}>
          <Th cols={[
            {l:"Vivero",w:100},{l:"Empresa",w:140},{l:"País",w:70},{l:"Proforma",w:110},
            {l:"N° Plantas",c:true,w:90},{l:"Regalía",c:true,w:70},{l:"Total",c:true,w:100},
            {l:"Tipo Pago",c:true,w:120},{l:"Trim. Pago",c:true,w:100},{l:"Mto.",c:true,w:100},
            {l:"Fecha Fact.",c:true,w:100},{l:"N° Factura",c:true,w:100},
            {l:"Est. Factura",c:true,w:130},{l:"Estado Pago",c:true,w:110},
            ...(can?[{l:"",c:true,w:40}]:[]),
          ]}/>
          <tbody>
            {filtrado.map((r,i)=>{
              const facturado=r.nFact&&String(r.nFact).trim()!=="";
              return(
                <tr key={r.id} style={{borderBottom:"1px solid #f1f5f9",background:i%2===0?"#fff":"#f8fafc"}}>
                  <td style={{padding:"7px 10px",fontSize:11}}><Cell val={r.vivero||""} onChange={v=>upd(r.id,"vivero",v)} opts={["Synergiabio","Agromillora"]} can={can}/></td>
                  <td style={{padding:"7px 10px",fontWeight:600}}>
                    <NombreCliente nombre={r.empresa} clientes={clientes} onChange={v=>upd(r.id,"empresa",v)} can={can}/>
                  </td>
                  <td style={{padding:"7px 10px",fontSize:11,color:C.gris}}>{r.pais}</td>
                  <td style={{padding:"7px 10px",fontSize:11,color:C.gris}}><Cell val={r.proforma||""} onChange={v=>upd(r.id,"proforma",v)} can={can}/></td>
                  <td style={{padding:"7px 10px",textAlign:"center",fontWeight:600}}>{N(r.nPlantas)}</td>
                  <td style={{padding:"7px 10px",textAlign:"center",fontSize:11}}>{r.regalia?`${(r.regalia*100).toFixed(0)}%`:"—"}</td>
                  <td style={{padding:"7px 10px",textAlign:"right",fontSize:12,color:C.gris}}>{$$(r.totalOsiris)}</td>
                  <td style={{padding:"7px 10px",textAlign:"center",fontSize:11}}>
                    <span style={{background:r.tipoPago==="Anticipo (OC)"||r.tipoPago==="Anticipo"?C.azulBg:C.tealBg,
                      color:r.tipoPago==="Anticipo (OC)"||r.tipoPago==="Anticipo"?C.azul:C.teal,
                      borderRadius:20,padding:"2px 8px",fontSize:10,fontWeight:700}}>
                      {r.tipoPago||"—"}
                    </span>
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"center",fontSize:11,color:C.mo,fontWeight:600}}>
                    {r.trimPago&&r.añoPago?`T${r.trimPago} ${r.añoPago}`:"—"}
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:C.azul}}>
                    <Cell val={r.montoFact||""} onChange={v=>upd(r.id,"montoFact",parseFloat(v)||0)} type="number" can={can}/>
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"center",fontSize:11}}>
                    <Cell val={r.fechaFact||""} onChange={v=>upd(r.id,"fechaFact",v)} type="date" can={can}/>
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"center"}}>
                    <Cell val={r.nFact||""} onChange={v=>upd(r.id,"nFact",v)} can={can} ph="F-001"/>
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"center"}}>
                    <span style={{
                      background:facturado?"#dbeafe":"#fef3c7",
                      color:facturado?"#2563eb":"#d97706",
                      borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"
                    }}>
                      {facturado?"📄 Facturado":"⏸ Pendiente"}
                    </span>
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"center"}}>
                    <BadgePago pagado={r.pagado} onChange={v=>upd(r.id,"pagado",v)} can={can}/>
                  </td>
                  {can&&<td style={{padding:"4px 6px",textAlign:"center"}}>
                    <button onClick={()=>{if(window.confirm(`¿Eliminar fee vivero de "${r.empresa}"?`))setData(prev=>prev.filter(x=>x.id!==r.id));}}
                      style={{background:"#fee2e2",border:"none",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:12,color:"#991b1b",fontWeight:700}}>×</button>
                  </td>}
                </tr>
              );
            })}
            {filtrado.length===0&&<tr><td colSpan={can?15:14} style={{textAlign:"center",padding:32,color:C.gris,fontSize:13}}>
              Sin registros.
            </td></tr>}
          </tbody>
        </table>
      </div>

      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#0006",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:16,padding:28,width:500,maxWidth:"94vw",maxHeight:"90vh",overflowY:"auto",boxShadow:"0 8px 32px #0003"}}>
            <h3 style={{margin:"0 0 16px",color:C.sl}}>Nuevo Fee Vivero</h3>
            <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
              <label style={{fontSize:11,fontWeight:600,color:"#374151"}}>Empresa *</label>
              {clientes.length>0&&(
                <select value={""} onChange={e=>{
                  const cli=clientes.find(c=>c.id===e.target.value);
                  if(!cli)return;
                  setForm(p=>({...p,empresa:cli.razonSocial||p.empresa,pais:cli.pais||p.pais}));
                }} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #93c5fd",fontSize:12,color:"#2563eb"}}>
                  <option value="">🔍 Seleccionar desde maestro...</option>
                  {clientes.map(c=><option key={c.id} value={c.id}>{c.razonSocial} — {c.pais}</option>)}
                </select>
              )}
              <input type="text" value={form.empresa} onChange={e=>setForm(p=>({...p,empresa:e.target.value}))}
                placeholder="O escribe el nombre..."
                style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {[
                ["Vivero","vivero","select",["Synergiabio","Agromillora"]],
                ["País","pais","select",PAISES],
                ["Proforma","proforma","text",null],
                ["N° Plantas","nPlantas","number",null],
                ["Regalía (dec.)","regalia","number",null],
                ["Total Osiris US$","totalOsiris","number",null],
                ["Tipo Pago","tipoPago","select",TIPOS],
                ["Monto a Facturar","montoFact","number",null],
                ["Fecha Facturar","fechaFact","date",null],
                ["N° Factura","nFact","text",null],
              ].map(([l,c,t,opts])=>(
                <div key={c}>
                  <label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>{l}</label>
                  {opts
                    ? <select value={form[c]||""} onChange={e=>setForm(p=>({...p,[c]:e.target.value}))}
                        style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}>
                        {opts.map(o=><option key={o}>{o}</option>)}
                      </select>
                    : <input type={t} value={form[c]||""} onChange={e=>setForm(p=>({...p,[c]:e.target.value}))}
                        style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                  }
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:20}}>
              <button onClick={()=>setModal(false)} style={{padding:"8px 18px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer"}}>Cancelar</button>
              <button onClick={agregar} style={{padding:"8px 18px",borderRadius:8,border:"none",background:C.azul,color:"#fff",cursor:"pointer",fontWeight:600}}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
function GraficosPlantas({tpData,rpData}) {
  // Plantas vendidas (Total Pedidos) por año
  const plantasPorAño = {};
  const plantasPorPais = {};
  const plantasPorCliente = {};
  tpData.forEach(r=>{
    const a = r.año||'?';
    const p = r.pais||'Otro';
    const c = r.cliente||'?';
    const n = Number(r.nPlantas)||0;
    plantasPorAño[a] = (plantasPorAño[a]||0) + n;
    plantasPorPais[p] = (plantasPorPais[p]||0) + n;
    plantasPorCliente[c] = (plantasPorCliente[c]||0) + n;
  });

  // Plantas con royalty pagado vs pendiente
  const rpPagadas = rpData.filter(r=>r.pagado).reduce((s,r)=>s+(Number(r.nPlantas)||0),0);
  const rpPendientes = rpData.filter(r=>!r.pagado).reduce((s,r)=>s+(Number(r.nPlantas)||0),0);
  const totalPlantas = tpData.reduce((s,r)=>s+(Number(r.nPlantas)||0),0);

  const añosOrden = Object.keys(plantasPorAño).sort();
  const maxAnio = Math.max(...añosOrden.map(Number));
  const maxPlantas = Math.max(...Object.values(plantasPorAño),1);

  const paisesOrden = Object.entries(plantasPorPais).sort((a,b)=>b[1]-a[1]);
  const maxPais = paisesOrden[0]?.[1]||1;

  const topClientes = Object.entries(plantasPorCliente).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const maxCli = topClientes[0]?.[1]||1;

  const PAIS_COLOR = {Peru:"#3b82f6",Mexico:"#10b981",Chile:"#f59e0b",Corea:"#8b5cf6",España:"#ef4444"};
  const N = v => v>=1000000?`${(v/1000000).toFixed(1)}M`:v>=1000?`${Math.round(v/1000)}K`:v.toLocaleString("es-CL");

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      {/* KPIs plantas */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:12}}>
        {[
          ["Total Plantas Vendidas", N(totalPlantas), C.teal, C.tealBg],
          ["Con Royalty Pagado", N(rpPagadas), C.verde, C.verdeBg],
          ["Royalty Pendiente", N(rpPendientes), C.am, C.amBg],
          ["Clientes únicos", new Set(tpData.map(r=>r.cliente)).size, C.azul, C.azulBg],
          ["Años con pedidos", añosOrden.length, C.mo, C.moBg],
        ].map(([l,v,c,bg])=>(
          <div key={l} style={{background:bg,borderRadius:12,padding:"14px 16px",border:`1px solid ${c}33`}}>
            <div style={{fontSize:10,color:c,fontWeight:700,marginBottom:4}}>{l}</div>
            <div style={{fontSize:20,fontWeight:800,color:c}}>{v}</div>
          </div>
        ))}
      </div>

      {/* Barras por año */}
      <div style={{background:"#fff",borderRadius:14,padding:20,boxShadow:"0 2px 10px #0001"}}>
        <h4 style={{margin:"0 0 16px",color:C.sl,fontSize:14}}>📅 Plantas vendidas por año</h4>
        <div style={{display:"flex",gap:8,alignItems:"flex-end",height:180,borderBottom:`2px solid ${C.teal}33`,padding:"0 8px 8px"}}>
          {añosOrden.map(año=>{
            const val = plantasPorAño[año];
            const pct = (val/maxPlantas)*100;
            const esActual = Number(año)===maxAnio;
            return(
              <div key={año} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                <div style={{fontSize:9,color:C.teal,fontWeight:700}}>{N(val)}</div>
                <div style={{width:"100%",background:esActual?C.teal:C.tealBg,borderRadius:"4px 4px 0 0",
                  height:`${Math.max(pct,2)}%`,transition:"height 0.4s",
                  border:`1px solid ${C.teal}44`}}/>
                <div style={{fontSize:9,color:C.sl,fontWeight:esActual?800:400,whiteSpace:"nowrap"}}>{año}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Por país */}
      <div style={{background:"#fff",borderRadius:14,padding:20,boxShadow:"0 2px 10px #0001"}}>
        <h4 style={{margin:"0 0 16px",color:C.sl,fontSize:14}}>🌎 Plantas por país</h4>
        {paisesOrden.map(([pais,val])=>(
          <div key={pais} style={{display:"grid",gridTemplateColumns:"90px 1fr 90px",gap:10,alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:12,fontWeight:600,color:PAIS_COLOR[pais]||C.sl}}>{pais}</div>
            <div style={{background:"#f1f5f9",borderRadius:6,height:14,overflow:"hidden"}}>
              <div style={{width:`${(val/maxPais)*100}%`,height:"100%",background:PAIS_COLOR[pais]||C.teal,borderRadius:6,opacity:0.8}}/>
            </div>
            <div style={{textAlign:"right",fontSize:12,fontWeight:700,color:PAIS_COLOR[pais]||C.sl}}>{N(val)}</div>
          </div>
        ))}
      </div>

      {/* Top 10 clientes */}
      <div style={{background:"#fff",borderRadius:14,padding:20,boxShadow:"0 2px 10px #0001"}}>
        <h4 style={{margin:"0 0 16px",color:C.sl,fontSize:14}}>🏆 Top 10 clientes por plantas</h4>
        {topClientes.map(([cli,val],i)=>(
          <div key={cli} style={{display:"grid",gridTemplateColumns:"24px 140px 1fr 90px",gap:8,alignItems:"center",marginBottom:8}}>
            <div style={{fontSize:11,fontWeight:800,color:i<3?C.am:C.gris,textAlign:"center"}}>#{i+1}</div>
            <div style={{fontSize:12,fontWeight:600,color:C.sl,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cli}</div>
            <div style={{background:"#f1f5f9",borderRadius:6,height:12,overflow:"hidden"}}>
              <div style={{width:`${(val/maxCli)*100}%`,height:"100%",background:i===0?C.am:C.teal,borderRadius:6,opacity:0.75}}/>
            </div>
            <div style={{textAlign:"right",fontSize:12,fontWeight:700,color:C.teal}}>{N(val)}</div>
          </div>
        ))}
      </div>

      {/* Tabla anual detallada */}
      <div style={{background:"#fff",borderRadius:14,padding:20,boxShadow:"0 2px 10px #0001"}}>
        <h4 style={{margin:"0 0 14px",color:C.sl,fontSize:14}}>📋 Detalle por año y país</h4>
        <div style={{overflowX:"auto"}}>
          <table style={{borderCollapse:"collapse",width:"100%",fontSize:12}}>
            <thead><tr style={{background:"#f8fafc"}}>
              <th style={{padding:"8px 12px",textAlign:"left",color:C.gris,fontWeight:600}}>Año</th>
              {paisesOrden.map(([p])=><th key={p} style={{padding:"8px 12px",textAlign:"right",color:PAIS_COLOR[p]||C.sl,fontWeight:600}}>{p}</th>)}
              <th style={{padding:"8px 12px",textAlign:"right",color:C.sl,fontWeight:700}}>Total</th>
            </tr></thead>
            <tbody>
              {añosOrden.map((año,i)=>{
                const porPaisAño = {};
                tpData.filter(r=>r.año===Number(año)).forEach(r=>{
                  const p=r.pais||'Otro';
                  porPaisAño[p]=(porPaisAño[p]||0)+(Number(r.nPlantas)||0);
                });
                return(
                  <tr key={año} style={{borderTop:"1px solid #f1f5f9",background:i%2===0?"#fff":"#f8fafc"}}>
                    <td style={{padding:"8px 12px",fontWeight:700,color:C.sl}}>{año}</td>
                    {paisesOrden.map(([p])=><td key={p} style={{padding:"8px 12px",textAlign:"right",color:porPaisAño[p]?PAIS_COLOR[p]||C.teal:C.gris}}>{porPaisAño[p]?N(porPaisAño[p]):"—"}</td>)}
                    <td style={{padding:"8px 12px",textAlign:"right",fontWeight:700,color:C.sl}}>{N(plantasPorAño[año])}</td>
                  </tr>
                );
              })}
              <tr style={{borderTop:"2px solid #e2e8f0",background:"#f0f9ff"}}>
                <td style={{padding:"8px 12px",fontWeight:800,color:C.sl}}>TOTAL</td>
                {paisesOrden.map(([p,v])=><td key={p} style={{padding:"8px 12px",textAlign:"right",fontWeight:700,color:PAIS_COLOR[p]||C.teal}}>{N(v)}</td>)}
                <td style={{padding:"8px 12px",textAlign:"right",fontWeight:800,color:C.teal,fontSize:13}}>{N(totalPlantas)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Resumen({rpData,feData,rcData,fvData,tpData}) {
  const hoy=new Date();hoy.setHours(0,0,0,0);
  const [expandedMes,setExpandedMes]=useState(null);

  const rpCalc=rpData.map(r=>{const mf=(Number(r.nPlantas)||0)*(Number(r.usdPlanta)||0);return{...r,montoFact:mf,montoCobro:mf*pct(r.pais)};});
  const rcCalc=rcData.map(r=>{const mf=(Number(r.ha)||0)*(Number(r.usdHa)||0);const fA=fechaAvisoTrim(r.añoCobro,r.trimCobro);const fI=fechaInicioTrim(r.añoCobro,r.trimCobro);return{...r,montoFact:mf,montoCobro:mf*pct(r.pais),alertaActiva:hoy>=fA&&hoy<fI&&!r.nFact};});

  const totRP_pendFact = rpCalc.filter(r=>!r.nFact||r.nFact.trim()==="").reduce((s,r)=>s+r.montoFact,0);
  const totRP_facturado= rpCalc.filter(r=>r.nFact&&r.nFact.trim()!=="").reduce((s,r)=>s+r.montoFact,0);
  const totRP_porCobrar= rpCalc.filter(r=>!r.pagado).reduce((s,r)=>s+r.montoCobro,0);
  const totRP_cobrado  = rpCalc.filter(r=>r.pagado).reduce((s,r)=>s+r.montoCobro,0);

  const totFE_facturado= feData.filter(r=>r.nFact&&r.nFact.trim()!=="").reduce((s,r)=>s+(r.montoUSD||0),0);
  const totFE_porCobrar= feData.filter(r=>!r.pagado).reduce((s,r)=>s+(r.montoUSD||0),0);

  const totRC_pendFact = rcCalc.filter(r=>!r.nFact||r.nFact.trim()==="").reduce((s,r)=>s+r.montoFact,0);
  const totRC_facturado= rcCalc.filter(r=>r.nFact&&r.nFact.trim()!=="").reduce((s,r)=>s+r.montoFact,0);
  const totRC_porCobrar= rcCalc.filter(r=>!r.pagado).reduce((s,r)=>s+r.montoCobro,0);

  const totFV_pendFact = fvData.filter(r=>!r.nFact||r.nFact.trim()==="").reduce((s,r)=>s+(Number(r.montoFact)||0),0);
  const totFV_facturado= fvData.filter(r=>r.nFact&&r.nFact.trim()!=="").reduce((s,r)=>s+(Number(r.montoFact)||0),0);
  const totFV_porCobrar= fvData.filter(r=>!r.pagado).reduce((s,r)=>s+(Number(r.montoFact)||0),0);

  const grandPendFact  = totRP_pendFact + totFE_porCobrar + totRC_pendFact + totFV_pendFact;
  const grandFacturado = totRP_facturado + totFE_facturado + totRC_facturado + totFV_facturado;
  const grandPorCobrar = totRP_porCobrar + totFE_porCobrar + totRC_porCobrar + totFV_porCobrar;

  const totPlantas=tpData.reduce((s,r)=>s+(Number(r.nPlantas)||0),0);
  const sinConfirmar=tpData.filter(r=>r.estado==="Por confirmar").length;
  const alertasRC=rcCalc.filter(r=>r.alertaActiva);

  const pedidosPorAño={};tpData.forEach(r=>{pedidosPorAño[r.año]=(pedidosPorAño[r.año]||0)+(Number(r.nPlantas)||0);});

  const porCliente={};rpCalc.filter(r=>!r.pagado).forEach(r=>{porCliente[r.cliente]=(porCliente[r.cliente]||0)+r.montoCobro;});
  const topCli=Object.entries(porCliente).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const maxV=topCli[0]?.[1]||1;

  const proximos=rpCalc.filter(r=>{if(!r.fechaPago||r.pagado)return false;const f=new Date(r.fechaPago);const d=(f-hoy)/(1000*60*60*24);return d>=0&&d<=60;}).sort((a,b)=>new Date(a.fechaPago)-new Date(b.fechaPago));

  const MESES_CORTO=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const calendarioCobros={};
  // Mapa de clientes por mes: key → [{cliente, tipo, monto, pagado}]
  const clientesPorMes={};
  function addCobro(fecha,tipo,monto,cliente,pagado){
    if(!fecha||!monto||monto<=0)return;
    const f=new Date(fecha);if(isNaN(f.getTime())||f<hoy)return;
    const key=`${f.getFullYear()}-${String(f.getMonth()+1).padStart(2,'0')}`;
    if(!calendarioCobros[key])calendarioCobros[key]={año:f.getFullYear(),mes:f.getMonth(),rp:0,rc:0,fv:0,fe:0};
    if(!pagado) calendarioCobros[key][tipo]+=monto;
    if(!clientesPorMes[key])clientesPorMes[key]=[];
    clientesPorMes[key].push({cliente:cliente||"—",tipo,monto,pagado:!!pagado});
  }
  rpCalc.filter(r=>r.fechaPago).forEach(r=>addCobro(r.fechaPago,"rp",r.montoCobro,r.cliente,r.pagado));
  rcCalc.forEach(r=>{const f=fechaInicioTrim(r.añoCobro,r.trimCobro);addCobro(f.toISOString().slice(0,10),"rc",r.montoCobro,r.cliente,r.pagado);});
  fvData.filter(r=>r.fechaFact).forEach(r=>addCobro(r.fechaFact,"fv",Number(r.montoFact)||0,r.empresa,r.pagado));
  feData.filter(r=>r.fechaPago).forEach(r=>addCobro(r.fechaPago,"fe",Number(r.montoUSD)||0,r.cliente,r.pagado));
  const calKeys=Object.keys(calendarioCobros).sort();
  const calPorAño={};
  calKeys.forEach(k=>{
    const row=calendarioCobros[k];
    row.total=row.rp+row.rc+row.fv+row.fe;row.key=k;
    if(!calPorAño[row.año])calPorAño[row.año]=[];
    calPorAño[row.año].push(row);
  });
  const totalAnual={};
  Object.entries(calPorAño).forEach(([año,rows])=>{
    totalAnual[año]={rp:0,rc:0,fv:0,fe:0,total:0};
    rows.forEach(r=>{totalAnual[año].rp+=r.rp;totalAnual[año].rc+=r.rc;totalAnual[año].fv+=r.fv;totalAnual[año].fe+=r.fe;totalAnual[año].total+=r.total;});
  });

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      <div style={{background:"#fff",borderRadius:14,padding:20,boxShadow:"0 2px 10px #0001"}}>
        <h3 style={{margin:"0 0 16px",color:C.sl,fontSize:15,display:"flex",alignItems:"center",gap:8}}>
          📅 Calendario de Ingresos por Cobrar
          <span style={{fontSize:11,color:C.gris,fontWeight:400}}>— agrupado por año y mes</span>
        </h3>

        {Object.entries(calPorAño).sort().map(([año,rows])=>(
          <div key={año} style={{marginBottom:24}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,
              background:"linear-gradient(135deg,#1e3a5f,#2563eb)",borderRadius:10,padding:"10px 16px"}}>
              <div style={{fontWeight:800,fontSize:16,color:"#fff"}}>{año}</div>
              <div style={{display:"flex",gap:16,flexWrap:"wrap",alignItems:"center"}}>
                {[["RP",totalAnual[año].rp,"#93c5fd"],["RC",totalAnual[año].rc,"#c4b5fd"],
                  ["FV",totalAnual[año].fv,"#6ee7b7"],["FE",totalAnual[año].fe,"#fde68a"]].map(([l,v,c])=>
                  v>0?<span key={l} style={{fontSize:11,color:c,fontWeight:600}}>{l}: {$$(v)}</span>:null
                )}
                <span style={{fontSize:14,fontWeight:800,color:"#fbbf24"}}>Total: {$$(totalAnual[año].total)}</span>
              </div>
            </div>

            <div style={{overflowX:"auto"}}>
              <table style={{borderCollapse:"collapse",width:"100%",fontSize:12}}>
                <thead>
                  <tr style={{background:"#f8fafc",color:C.gris,fontSize:11}}>
                    {["Mes","Royalty/Planta","Royalty Comercial","Fee Viveros","Fee Entrada","Total Mes"].map(h=>(
                      <th key={h} style={{padding:"8px 12px",textAlign:h==="Mes"?"left":"right",fontWeight:600,whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r,i)=>{
                    const isOpen = expandedMes===r.key;
                    const clientes = clientesPorMes[r.key]||[];
                    const pendientes = clientes.filter(c=>!c.pagado);
                    const pagados = clientes.filter(c=>c.pagado);
                    const TIPO_LABEL={"rp":"Royalty/Planta","rc":"Royalty Comercial","fv":"Fee Viveros","fe":"Fee Entrada"};
                    const TIPO_COLOR={"rp":C.azul,"rc":C.mo,"fv":C.teal,"fe":C.verde};
                    return(
                      <React.Fragment key={r.key}>
                        <tr style={{borderTop:"1px solid #f1f5f9",background:isOpen?"#eff6ff":i%2===0?"#fff":"#f8fafc",
                          cursor:"pointer",transition:"background 0.15s"}}
                          onClick={()=>setExpandedMes(isOpen?null:r.key)}>
                          <td style={{padding:"9px 12px",fontWeight:700,color:C.sl,whiteSpace:"nowrap"}}>
                            <span style={{marginRight:6,fontSize:11,color:isOpen?C.azul:"#94a3b8"}}>{isOpen?"▼":"▶"}</span>
                            {MESES_CORTO[r.mes]} {r.año}
                            {pendientes.length>0&&<span style={{marginLeft:8,fontSize:10,background:C.azulBg,color:C.azul,borderRadius:10,padding:"1px 7px",fontWeight:700}}>{pendientes.length} pendiente{pendientes.length>1?"s":""}</span>}
                          </td>
                          <td style={{padding:"9px 12px",textAlign:"right",color:r.rp>0?C.azul:C.gris}}>{r.rp>0?$$(r.rp):"—"}</td>
                          <td style={{padding:"9px 12px",textAlign:"right",color:r.rc>0?C.mo:C.gris}}>{r.rc>0?$$(r.rc):"—"}</td>
                          <td style={{padding:"9px 12px",textAlign:"right",color:r.fv>0?C.teal:C.gris}}>{r.fv>0?$$(r.fv):"—"}</td>
                          <td style={{padding:"9px 12px",textAlign:"right",color:r.fe>0?C.verde:C.gris}}>{r.fe>0?$$(r.fe):"—"}</td>
                          <td style={{padding:"9px 12px",textAlign:"right",fontWeight:700,color:C.sl,background:"#f0f9ff",fontSize:13}}>{$$(r.total)}</td>
                        </tr>
                        {isOpen&&(
                          <tr>
                            <td colSpan={6} style={{padding:0,background:"#f8fbff",borderBottom:"2px solid #bfdbfe"}}>
                              <div style={{padding:"14px 20px"}}>
                                {pendientes.length>0&&(
                                  <>
                                    <div style={{fontSize:11,fontWeight:700,color:C.azul,marginBottom:8,letterSpacing:1}}>POR COBRAR</div>
                                    <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:12}}>
                                      {pendientes.sort((a,b)=>b.monto-a.monto).map((c,ci)=>(
                                        <div key={ci} style={{display:"flex",alignItems:"center",gap:10,background:"#fff",borderRadius:8,padding:"8px 12px",border:"1px solid #dbeafe"}}>
                                          <span style={{fontSize:11,background:TIPO_COLOR[c.tipo]+"22",color:TIPO_COLOR[c.tipo],borderRadius:6,padding:"2px 8px",fontWeight:700,minWidth:110,textAlign:"center"}}>
                                            {TIPO_LABEL[c.tipo]}
                                          </span>
                                          <span style={{flex:1,fontSize:13,fontWeight:600,color:C.sl}}>{c.cliente}</span>
                                          <span style={{fontSize:13,fontWeight:800,color:C.azul}}>{$$(c.monto)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </>
                                )}
                                {pagados.length>0&&(
                                  <>
                                    <div style={{fontSize:11,fontWeight:700,color:C.verde,marginBottom:8,letterSpacing:1}}>YA COBRADO</div>
                                    <div style={{display:"flex",flexDirection:"column",gap:4}}>
                                      {pagados.sort((a,b)=>b.monto-a.monto).map((c,ci)=>(
                                        <div key={ci} style={{display:"flex",alignItems:"center",gap:10,background:"#f0fdf4",borderRadius:8,padding:"8px 12px",border:"1px solid #bbf7d0",opacity:0.8}}>
                                          <span style={{fontSize:11,background:TIPO_COLOR[c.tipo]+"22",color:TIPO_COLOR[c.tipo],borderRadius:6,padding:"2px 8px",fontWeight:700,minWidth:110,textAlign:"center"}}>
                                            {TIPO_LABEL[c.tipo]}
                                          </span>
                                          <span style={{flex:1,fontSize:13,fontWeight:600,color:"#64748b"}}>{c.cliente}</span>
                                          <span style={{fontSize:12,fontWeight:700,color:C.verde}}>✅ {$$(c.monto)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </>
                                )}
                                {clientes.length===0&&<div style={{color:C.gris,fontSize:12}}>Sin detalle disponible.</div>}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  <tr style={{borderTop:"2px solid #e2e8f0",background:"#f0f9ff"}}>
                    <td style={{padding:"9px 12px",fontWeight:800,color:C.sl}}>Total {año}</td>
                    <td style={{padding:"9px 12px",textAlign:"right",fontWeight:700,color:C.azul}}>{totalAnual[año].rp>0?$$(totalAnual[año].rp):"—"}</td>
                    <td style={{padding:"9px 12px",textAlign:"right",fontWeight:700,color:C.mo}}>{totalAnual[año].rc>0?$$(totalAnual[año].rc):"—"}</td>
                    <td style={{padding:"9px 12px",textAlign:"right",fontWeight:700,color:C.teal}}>{totalAnual[año].fv>0?$$(totalAnual[año].fv):"—"}</td>
                    <td style={{padding:"9px 12px",textAlign:"right",fontWeight:700,color:C.verde}}>{totalAnual[año].fe>0?$$(totalAnual[año].fe):"—"}</td>
                    <td style={{padding:"9px 12px",textAlign:"right",fontWeight:800,color:"#2563eb",fontSize:14}}>{$$(totalAnual[año].total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {calKeys.length===0&&<div style={{textAlign:"center",color:C.gris,fontSize:13,padding:24}}>No hay cobros futuros registrados.</div>}
      </div>

      {alertasRC.length>0&&(
        <div>
          {alertasRC.map(r=>(
            <div key={r.id} style={{background:"#fef3c7",border:"2px solid #fde047",borderRadius:12,padding:"12px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:22}}>⚠️</span>
              <div>
                <div style={{fontWeight:700,fontSize:13,color:C.sl}}>Facturar próximamente — Royalty Comercial · {r.cliente}</div>
                <div style={{fontSize:12,color:C.gris}}>T{r.trimCobro} {r.añoCobro} · {$$(r.montoFact)} a facturar · {$$(r.montoCobro)} a cobrar</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:12}}>
        {[
          ["⏸ Total pendiente de facturar", $$(grandPendFact),  C.azul, C.azulBg],
          ["📄 Total facturado",      $$(grandFacturado), C.mo,   C.moBg],
          ["⏳ Total por cobrar",            $$(grandPorCobrar), C.am,   C.amBg],
        ].map(([l,v,c,bg])=>(
          <div key={l} style={{background:bg,borderRadius:12,padding:"16px 18px",border:`1px solid ${c}33`}}>
            <div style={{fontSize:11,color:c,fontWeight:700,marginBottom:4}}>{l}</div>
            <div style={{fontSize:22,fontWeight:800,color:c}}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(175px,1fr))",gap:10}}>
        {[
          ["Total Plantas",          N(totPlantas),       C.teal,  C.tealBg],
          ["Pedidos por confirmar",  sinConfirmar,        C.am,    C.amBg],
          ["RP Pend. facturar",      $$(totRP_pendFact),  C.azul,  C.azulBg],
          ["RP Facturado",           $$(totRP_facturado), C.mo,    C.moBg],
          ["RP Por cobrar",          $$(totRP_porCobrar), C.am,    C.amBg],
          ["RP Cobrado",             $$(totRP_cobrado),   C.verde, C.verdeBg],
          ["RC Pend. facturar",      $$(totRC_pendFact),  C.azul,  C.azulBg],
          ["RC Facturado",           $$(totRC_facturado), C.mo,    C.moBg],
          ["RC Por cobrar",          $$(totRC_porCobrar), C.am,    C.amBg],
          ["Viveros pend. facturar", $$(totFV_pendFact),  C.azul,  C.azulBg],
          ["Viveros facturado",      $$(totFV_facturado), C.mo,    C.moBg],
          ["Viveros por cobrar",     $$(totFV_porCobrar), C.am,    C.amBg],
          ["Fee Entrada facturado",  $$(totFE_facturado), C.mo,    C.moBg],
          ["Fee Entrada por cobrar", $$(totFE_porCobrar), C.am,    C.amBg],
        ].map(([l,v,c,bg])=>(
          <div key={l} style={{background:bg,borderRadius:10,padding:"12px 14px"}}>
            <div style={{fontSize:10,color:c,fontWeight:600,marginBottom:2}}>{l}</div>
            <div style={{fontSize:15,fontWeight:800,color:c}}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{background:"#fff",borderRadius:14,padding:20}}>
        <h4 style={{margin:"0 0 14px",color:C.sl,fontSize:14}}>🌱 Plantas pedidas por año</h4>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          {Object.entries(pedidosPorAño).sort().map(([año,plantas])=>(
            <div key={año} style={{background:C.tealBg,borderRadius:10,padding:"10px 18px",textAlign:"center"}}>
              <div style={{fontSize:11,color:C.teal,fontWeight:600}}>{año}</div>
              <div style={{fontSize:18,fontWeight:800,color:C.teal}}>{N(plantas)}</div>
            </div>
          ))}
        </div>
      </div>

      {topCli.length>0&&(
        <div style={{background:"#fff",borderRadius:14,padding:20}}>
          <h4 style={{margin:"0 0 14px",color:C.sl,fontSize:14}}>📊 Royalty/Planta por cobrar — Top clientes</h4>
          {topCli.map(([cli,monto])=>(
            <div key={cli} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                <span style={{fontSize:12,fontWeight:600,color:C.sl}}>{cli}</span>
                <span style={{fontSize:12,fontWeight:700,color:C.azul}}>{$$(monto)}</span>
              </div>
              <div style={{background:"#f1f5f9",borderRadius:6,height:8}}>
                <div style={{background:C.azul,borderRadius:6,height:8,width:`${(monto/maxV)*100}%`}}/>
              </div>
            </div>
          ))}
        </div>
      )}

      {proximos.length>0&&(
        <div style={{background:"#fff",borderRadius:14,padding:20}}>
          <h4 style={{margin:"0 0 14px",color:C.sl,fontSize:14}}>🗓️ Próximos cobros Royalty/Planta (60 días)</h4>
          <div style={{overflowX:"auto"}}>
            <table style={{borderCollapse:"collapse",width:"100%",fontSize:12}}>
              <thead><tr style={{background:"#f8fafc",color:C.gris,fontSize:11}}>
                {["Cliente","País","Vivero","Fecha","Monto Cobrar","Facturado"].map(h=>(
                  <th key={h} style={{padding:"7px 12px",textAlign:"left",fontWeight:600}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {proximos.map((r,i)=>{
                  const f=new Date(r.fechaPago);const d=Math.ceil((f-hoy)/(1000*60*60*24));
                  return (
                    <tr key={r.id} style={{borderTop:"1px solid #f1f5f9",background:d<=7?"#fffbeb":"#fff"}}>
                      <td style={{padding:"7px 12px",fontWeight:600}}>{r.cliente}</td>
                      <td style={{padding:"7px 12px",color:C.gris}}>{r.pais}</td>
                      <td style={{padding:"7px 12px",color:C.gris,fontSize:11}}>{r.vivero}</td>
                      <td style={{padding:"7px 12px"}}>
                        <span style={{fontWeight:600,color:d<=7?C.rojo:C.am}}>
                          {r.fechaPago}{d===0?" HOY":d<=7?` (${d}d)`:""}
                        </span>
                      </td>
                      <td style={{padding:"7px 12px",fontWeight:700,color:C.verde}}>{$$(r.montoCobro)}</td>
                      <td style={{padding:"7px 12px"}}><BadgeFact nFact={r.nFact}/></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Logos ─────────────────────────────────────────────────
function OsirisLogo({height=52}) {
  return (
    <img src="/osiris-logo.jpg" alt="Osiris Plant Management"
      style={{height:height, objectFit:"contain", display:"block"}}/>
  );
}

// ════════════════════════════════════════════════════════════
// DATOS CONTRATOS INIT
// ════════════════════════════════════════════════════════════
const TIPOS_FEE=["Con Devolución","Sin Devolución","Sin Contract Fee"];
const MESES_ANO=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const TIPOS_CONTRATO_BASE=["Licencia","Exclusiva","No Exclusiva"];
const TIPOS_ANEXO_BASE=[
  "Extensión período de prueba","Condiciones comerciales",
  "Modificación de hectáreas","Adenda de precio",
  "Prórroga de contrato","Cambio de titular",
];
// Maestro de clientes inicial (compartido entre Contratos e Ingresos)
const CLIENTES_INIT=[
  {id:"cli1",razonSocial:"Agroextiende",nombreComercial:"Agroextiende",taxID:"",pais:"Peru",direccion:"",ciudad:"",repLegal:"",rucRep:"",contactoCobranza:""},
  {id:"cli2",razonSocial:"Allpa Farms",nombreComercial:"Allpa Farms",taxID:"",pais:"Peru",direccion:"",ciudad:"",repLegal:"",rucRep:"",contactoCobranza:""},
  {id:"cli3",razonSocial:"Vanguard",nombreComercial:"Vanguard",taxID:"",pais:"Peru",direccion:"",ciudad:"",repLegal:"",rucRep:"",contactoCobranza:""},
  {id:"cli4",razonSocial:"Mainland Farms SA",nombreComercial:"Mainland",taxID:"",pais:"Mexico",direccion:"",ciudad:"",repLegal:"",rucRep:"",contactoCobranza:""},
  {id:"cli5",razonSocial:"Frusan Agro SAC",nombreComercial:"Frusan",taxID:"",pais:"Peru",direccion:"",ciudad:"",repLegal:"",rucRep:"",contactoCobranza:""},
  {id:"cli6",razonSocial:"Danper Trujillo SAC",nombreComercial:"Danper",taxID:"",pais:"Peru",direccion:"",ciudad:"",repLegal:"",rucRep:"",contactoCobranza:""},
  {id:"cli7",razonSocial:"Hass Peru SA",nombreComercial:"Hass Peru",taxID:"",pais:"Peru",direccion:"",ciudad:"",repLegal:"",rucRep:"",contactoCobranza:""},
  {id:"cli8",razonSocial:"Pura Berries",nombreComercial:"Pura Berries",taxID:"",pais:"Peru",direccion:"",ciudad:"",repLegal:"",rucRep:"",contactoCobranza:""},
  {id:"cli9",razonSocial:"San Clemente",nombreComercial:"San Clemente",taxID:"",pais:"Peru",direccion:"",ciudad:"",repLegal:"",rucRep:"",contactoCobranza:""},
  {id:"cli10",razonSocial:"Fruits Giddings SA de CV",nombreComercial:"Giddings",taxID:"",pais:"Mexico",direccion:"",ciudad:"",repLegal:"",rucRep:"",contactoCobranza:""},
  {id:"cli11",razonSocial:"Frunatural",nombreComercial:"Frunatural",taxID:"",pais:"Mexico",direccion:"",ciudad:"",repLegal:"",rucRep:"",contactoCobranza:""},
];
const MONEDAS=["USD","EUR","CLP","PEN"];
const SECCIONES_CT=[
  {id:"empresa",   label:"🏢 Empresa",         color:"#2563eb"},
  {id:"contrato",  label:"📄 Contrato",         color:"#7c3aed"},
  {id:"rep",       label:"👤 Representante",    color:"#0f766e"},
  {id:"ubicacion", label:"🌱 Ubicación plantas",color:"#16a34a"},
  {id:"factura",   label:"💰 Facturación",      color:"#d97706"},
];

const CONTRATOS_INIT=[
  {id:"ct1",razonSocial:"Agroextiende",taxID:"",pais:"Peru",direccion:"",ciudad:"",tipoContrato:"Licencia",moneda:"USD",fechaContrato:"2024-09-23",fechaTermino:"",firmadoLicenciado:true,firmadoOsiris:true,verDigital:"",anexo1:true,anexo2:false,anexo3:false,nombreRep:"",personeria:"",nombrePredio:"",direccionPredio:"",cuartel:"",region:"",ciudadPredio:"",coordenadas:"",tipoContractFee:"Sin Devolución",montoContractFee:30000,valorRoyaltyPlanta:0.85,valorRoyaltyComercial:3000,royaltyInflacion:false,mesFacuracionRC:"Abril",notas:""},
  {id:"ct2",razonSocial:"Allpa Farms",taxID:"",pais:"Peru",direccion:"",ciudad:"",tipoContrato:"Licencia",moneda:"USD",fechaContrato:"2024-07-15",fechaTermino:"",firmadoLicenciado:true,firmadoOsiris:true,verDigital:"",anexo1:true,anexo2:false,anexo3:false,nombreRep:"",personeria:"",nombrePredio:"",direccionPredio:"",cuartel:"",region:"",ciudadPredio:"",coordenadas:"",tipoContractFee:"Sin Contract Fee",montoContractFee:0,valorRoyaltyPlanta:1.00,valorRoyaltyComercial:3000,royaltyInflacion:false,mesFacuracionRC:"Abril",notas:""},
  {id:"ct3",razonSocial:"Vanguard",taxID:"",pais:"Peru",direccion:"",ciudad:"",tipoContrato:"Licencia",moneda:"USD",fechaContrato:"2024-10-23",fechaTermino:"",firmadoLicenciado:true,firmadoOsiris:true,verDigital:"",anexo1:true,anexo2:false,anexo3:false,nombreRep:"",personeria:"",nombrePredio:"",direccionPredio:"",cuartel:"",region:"",ciudadPredio:"",coordenadas:"",tipoContractFee:"Sin Devolución",montoContractFee:30000,valorRoyaltyPlanta:0.85,valorRoyaltyComercial:3000,royaltyInflacion:false,mesFacuracionRC:"Abril",notas:""},
  {id:"ct4",razonSocial:"Mainland Farms SA",taxID:"",pais:"Mexico",direccion:"",ciudad:"",tipoContrato:"Licencia",moneda:"USD",fechaContrato:"2022-05-01",fechaTermino:"",firmadoLicenciado:true,firmadoOsiris:true,verDigital:"",anexo1:true,anexo2:false,anexo3:false,nombreRep:"",personeria:"",nombrePredio:"",direccionPredio:"",cuartel:"",region:"",ciudadPredio:"",coordenadas:"",tipoContractFee:"Con Devolución",montoContractFee:30000,valorRoyaltyPlanta:0.49,valorRoyaltyComercial:3000,royaltyInflacion:false,mesFacuracionRC:"Julio",notas:""},
  {id:"ct5",razonSocial:"Frusan Agro SAC",taxID:"",pais:"Peru",direccion:"",ciudad:"",tipoContrato:"Licencia",moneda:"USD",fechaContrato:"2023-12-01",fechaTermino:"",firmadoLicenciado:true,firmadoOsiris:true,verDigital:"",anexo1:true,anexo2:false,anexo3:false,nombreRep:"",personeria:"",nombrePredio:"",direccionPredio:"",cuartel:"",region:"",ciudadPredio:"",coordenadas:"",tipoContractFee:"Con Devolución",montoContractFee:30000,valorRoyaltyPlanta:1.00,valorRoyaltyComercial:3000,royaltyInflacion:false,mesFacuracionRC:"Abril",notas:""},
  {id:"ct6",razonSocial:"Danper Trujillo SAC",taxID:"",pais:"Peru",direccion:"",ciudad:"",tipoContrato:"Licencia",moneda:"USD",fechaContrato:"2022-11-10",fechaTermino:"",firmadoLicenciado:true,firmadoOsiris:true,verDigital:"",anexo1:true,anexo2:false,anexo3:false,nombreRep:"",personeria:"",nombrePredio:"",direccionPredio:"",cuartel:"",region:"",ciudadPredio:"",coordenadas:"",tipoContractFee:"Con Devolución",montoContractFee:30000,valorRoyaltyPlanta:0.85,valorRoyaltyComercial:3000,royaltyInflacion:false,mesFacuracionRC:"Abril",notas:""},
  {id:"ct7",razonSocial:"Hass Peru SA",taxID:"",pais:"Peru",direccion:"",ciudad:"",tipoContrato:"Licencia",moneda:"USD",fechaContrato:"2022-08-19",fechaTermino:"",firmadoLicenciado:true,firmadoOsiris:true,verDigital:"",anexo1:true,anexo2:false,anexo3:false,nombreRep:"",personeria:"",nombrePredio:"",direccionPredio:"",cuartel:"",region:"",ciudadPredio:"",coordenadas:"",tipoContractFee:"Con Devolución",montoContractFee:30000,valorRoyaltyPlanta:0.85,valorRoyaltyComercial:3000,royaltyInflacion:false,mesFacuracionRC:"Abril",notas:""},
  {id:"ct8",razonSocial:"Pura Berries",taxID:"",pais:"Peru",direccion:"",ciudad:"",tipoContrato:"Licencia",moneda:"USD",fechaContrato:"2024-12-12",fechaTermino:"",firmadoLicenciado:true,firmadoOsiris:true,verDigital:"",anexo1:true,anexo2:false,anexo3:false,nombreRep:"",personeria:"",nombrePredio:"",direccionPredio:"",cuartel:"",region:"",ciudadPredio:"",coordenadas:"",tipoContractFee:"Sin Contract Fee",montoContractFee:0,valorRoyaltyPlanta:1.00,valorRoyaltyComercial:3000,royaltyInflacion:false,mesFacuracionRC:"Abril",notas:""},
  {id:"ct9",razonSocial:"San Clemente",taxID:"",pais:"Peru",direccion:"",ciudad:"",tipoContrato:"Licencia",moneda:"USD",fechaContrato:"2022-04-26",fechaTermino:"",firmadoLicenciado:true,firmadoOsiris:true,verDigital:"",anexo1:true,anexo2:false,anexo3:false,nombreRep:"",personeria:"",nombrePredio:"",direccionPredio:"",cuartel:"",region:"",ciudadPredio:"",coordenadas:"",tipoContractFee:"Con Devolución",montoContractFee:30000,valorRoyaltyPlanta:1.00,valorRoyaltyComercial:3000,royaltyInflacion:false,mesFacuracionRC:"Junio",notas:""},
  {id:"ct10",razonSocial:"Fruits Giddings SA de CV",taxID:"",pais:"Mexico",direccion:"",ciudad:"",tipoContrato:"Licencia",moneda:"USD",fechaContrato:"2022-07-30",fechaTermino:"",firmadoLicenciado:true,firmadoOsiris:true,verDigital:"",anexo1:true,anexo2:false,anexo3:false,nombreRep:"",personeria:"",nombrePredio:"",direccionPredio:"",cuartel:"",region:"",ciudadPredio:"",coordenadas:"",tipoContractFee:"Con Devolución",montoContractFee:30000,valorRoyaltyPlanta:0.25,valorRoyaltyComercial:3000,royaltyInflacion:false,mesFacuracionRC:"Julio",notas:""},
  {id:"ct11",razonSocial:"Frunatural",taxID:"",pais:"Mexico",direccion:"",ciudad:"",tipoContrato:"Licencia",moneda:"USD",fechaContrato:"2026-03-01",fechaTermino:"",firmadoLicenciado:true,firmadoOsiris:true,verDigital:"",anexo1:false,anexo2:false,anexo3:false,nombreRep:"",personeria:"",nombrePredio:"",direccionPredio:"",cuartel:"",region:"",ciudadPredio:"",coordenadas:"",tipoContractFee:"Sin Devolución",montoContractFee:30000,valorRoyaltyPlanta:1.00,valorRoyaltyComercial:3000,royaltyInflacion:false,mesFacuracionRC:"",notas:""},
];

// ════════════════════════════════════════════════════════════
// CONTROL CONTRATOS
// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
// MAESTRO DE CLIENTES — compartido entre Contratos e Ingresos
// ════════════════════════════════════════════════════════════
// CampoNuevo como componente EXTERNO — evita re-renders que causan pérdida de foco
function CampoNuevo({label,campo,tipo="text",opts=null,fullWidth=false,form,setF}) {
  const val = form?.[campo] ?? "";
  return(
    <div style={fullWidth?{gridColumn:"1/-1"}:{}}>
      <label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>{label}</label>
      {opts
        ? <select value={val} onChange={e=>setF(campo,e.target.value)}
            style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}>
            {opts.map(o=><option key={o}>{o}</option>)}
          </select>
        : tipo==="checkbox"
          ? <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:12,fontWeight:600,color:C.sl}}>
              <input type="checkbox" checked={!!form?.[campo]} onChange={()=>setF(campo,!form?.[campo])}/> {label}
            </label>
          : <input type={tipo} value={val} onChange={e=>setF(campo,e.target.value)}
              style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
      }
    </div>
  );
}

function MaestroClientes({clientes,setClientes,can}){
  const [editId,setEditId]=useState(null);
  const [form,setForm]=useState({razonSocial:"",nombreComercial:"",taxID:"",pais:"Peru",direccion:"",ciudad:"",repLegal:"",rucRep:"",contactoCobranza:""});
  const [showForm,setShowForm]=useState(false);
  const [busq,setBusq]=useState("");

  function guardar(){
    if(!form.razonSocial.trim()){alert("Razón Social es obligatoria.");return;}
    if(editId){
      setClientes(prev=>prev.map(c=>c.id===editId?{...c,...form}:c));
      setEditId(null);
    } else {
      setClientes(prev=>[...prev,{...form,id:`cli_${Date.now()}`}]);
    }
    setForm({razonSocial:"",nombreComercial:"",taxID:"",pais:"Peru",direccion:"",ciudad:"",repLegal:"",rucRep:"",contactoCobranza:""});
    setShowForm(false);
  }
  function iniciarEdicion(c){
    setForm({razonSocial:c.razonSocial||"",nombreComercial:c.nombreComercial||"",taxID:c.taxID||"",pais:c.pais||"Peru",direccion:c.direccion||"",ciudad:c.ciudad||"",repLegal:c.repLegal||"",rucRep:c.rucRep||"",contactoCobranza:c.contactoCobranza||""});
    setEditId(c.id);setShowForm(true);
  }

  const filtrado = clientes.filter(c=>!busq||c.razonSocial.toLowerCase().includes(busq.toLowerCase())||
    (c.nombreComercial||"").toLowerCase().includes(busq.toLowerCase()));
  const CAMPOS=[["Razón Social *","razonSocial","text"],["Nombre Comercial","nombreComercial","text"],["TAX ID / RUC","taxID","text"],["País","pais","select"],["Dirección","direccion","text"],["Ciudad","ciudad","text"],["Representante Legal","repLegal","text"],["RUC Representante","rucRep","text"],["Contacto Cobranza","contactoCobranza","text"]];

  return(
    <div style={{background:"#f0fdfa",border:"1px solid #99f6e4",borderRadius:12,padding:"16px 20px",marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:13,fontWeight:700,color:"#0f766e"}}>👥 Maestro de Clientes</div>
        <div style={{display:"flex",gap:8}}>
          <input value={busq} onChange={e=>setBusq(e.target.value)} placeholder="Buscar..."
            style={{padding:"5px 10px",borderRadius:6,border:"1px solid #99f6e4",fontSize:12,outline:"none"}}/>
          {can&&<button onClick={()=>{setShowForm(v=>!v);setEditId(null);setForm({razonSocial:"",nombreComercial:"",taxID:"",pais:"Peru",direccion:"",ciudad:"",repLegal:"",rucRep:"",contactoCobranza:""}); }}
            style={{padding:"6px 14px",borderRadius:6,background:"#0f766e",color:"#fff",border:"none",cursor:"pointer",fontSize:12,fontWeight:600}}>
            {showForm&&!editId?"✕":"+ Nuevo cliente"}
          </button>}
        </div>
      </div>

      {showForm&&can&&(
        <div style={{background:"#fff",borderRadius:10,padding:"14px 16px",marginBottom:12,border:"1px solid #99f6e4"}}>
          <div style={{fontSize:12,fontWeight:700,color:"#0f766e",marginBottom:10}}>{editId?"Editar cliente":"Nuevo cliente"}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:10,marginBottom:12}}>
            {CAMPOS.map(([lbl,campo,tipo])=>(
              <div key={campo}>
                <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:3}}>{lbl}</div>
                {tipo==="select"
                  ? <select value={form[campo]} onChange={e=>setForm(p=>({...p,[campo]:e.target.value}))}
                      style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,outline:"none"}}>
                      {["Peru","Mexico","Chile","Corea","España"].map(o=><option key={o}>{o}</option>)}
                    </select>
                  : <input type={tipo} value={form[campo]} onChange={e=>setForm(p=>({...p,[campo]:e.target.value}))}
                      style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,outline:"none",boxSizing:"border-box"}}/>
                }
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button onClick={()=>{setShowForm(false);setEditId(null);}} style={{padding:"6px 16px",borderRadius:6,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:12}}>Cancelar</button>
            <button onClick={guardar} style={{padding:"6px 16px",borderRadius:6,background:"#0f766e",color:"#fff",border:"none",cursor:"pointer",fontSize:12,fontWeight:600}}>💾 Guardar</button>
          </div>
        </div>
      )}

      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",background:"#fff",borderRadius:8,overflow:"hidden",fontSize:12}}>
          <thead><tr style={{background:"#0f766e",color:"#fff"}}>
            {["Razón Social","Nombre Comercial","TAX ID","País","Ciudad","Rep. Legal","Contacto Cobranza",""].map(h=>(
              <th key={h} style={{padding:"7px 10px",textAlign:"left",fontWeight:600,fontSize:11,whiteSpace:"nowrap"}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtrado.map((c,i)=>(
              <tr key={c.id} style={{borderBottom:"1px solid #f0fdfa",background:i%2===0?"#fff":"#f0fdfa"}}>
                <td style={{padding:"6px 10px",fontWeight:600,color:"#0f766e"}}>{c.razonSocial}</td>
                <td style={{padding:"6px 10px",color:"#64748b"}}>{c.nombreComercial||"—"}</td>
                <td style={{padding:"6px 10px",color:"#64748b",fontSize:11}}>{c.taxID||"—"}</td>
                <td style={{padding:"6px 10px",color:"#64748b"}}>{c.pais}</td>
                <td style={{padding:"6px 10px",color:"#64748b"}}>{c.ciudad||"—"}</td>
                <td style={{padding:"6px 10px",color:"#64748b",fontSize:11}}>{c.repLegal||"—"}</td>
                <td style={{padding:"6px 10px",color:"#64748b",fontSize:11}}>{c.contactoCobranza||"—"}</td>
                <td style={{padding:"6px 8px",textAlign:"center"}}>
                  {can&&<div style={{display:"flex",gap:4}}>
                    <button onClick={()=>iniciarEdicion(c)} style={{background:"#dbeafe",border:"none",borderRadius:4,padding:"3px 8px",cursor:"pointer",fontSize:11,color:"#1d4ed8",fontWeight:600}}>✏️</button>
                    <button onClick={()=>{if(window.confirm(`¿Eliminar cliente "${c.razonSocial}"?`))setClientes(prev=>prev.filter(x=>x.id!==c.id));}}
                      style={{background:"#fee2e2",border:"none",borderRadius:4,padding:"3px 8px",cursor:"pointer",fontSize:11,color:"#991b1b",fontWeight:600}}>×</button>
                  </div>}
                </td>
              </tr>
            ))}
            {filtrado.length===0&&<tr><td colSpan={8} style={{textAlign:"center",padding:20,color:"#94a3b8"}}>Sin clientes</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Exportar contratos a Excel (.xlsx) con formato ──────────
async function exportarContratos(filtrado) {
  const anx = r => {
    const partes = [];
    [["anexo1","A1"],["anexo2","A2"],["anexo3","A3"]].forEach(([campo,label])=>{
      const a = r[campo];
      if(!a) return;
      const activo = typeof a==="object" ? a.activo : !!a;
      if(!activo) return;
      const tipo  = typeof a==="object" ? (a.tipo||"") : "";
      const fO    = typeof a==="object" ? (a.firmadoOsiris?"Sí":"No") : "—";
      const fL    = typeof a==="object" ? (a.firmadoLicenciado?"Sí":"No") : "—";
      partes.push(`${label}${tipo?": "+tipo:""} (Osiris:${fO}/Lic:${fL})`);
    });
    return partes.join(" | ") || "—";
  };
  const headers = [
    "Razón Social","Nombre Comercial","Tax ID","País","Ciudad",
    "Tipo Contrato","Fecha Contrato","Fecha Término",
    "Firmado Licenciado","Firmado OSIRIS",
    "Año de Prueba","Cantidad Años Prueba",
    "Lleva Multa","Mín. Há Contrato",
    "Anexos",
    "Contract Fee","Tipo Fee","Monto Fee US$",
    "Royalty/Planta US$","Royalty Comercial US$/Há","Sujeto Inflación","Mes Facturación RC",
    "Link Contrato","Notas"
  ];
  const rows = filtrado.map(r=>[
    r.razonSocial||"",
    r.nombreComercial||"",
    r.taxID||"",
    r.pais||"",
    r.ciudad||"",
    r.tipoContrato||"",
    r.fechaContrato||"",
    r.fechaTermino||"",
    r.firmadoLicenciado?"Sí":"No",
    r.firmadoOsiris?"Sí":"No",
    r.tieneAnioPrueba?"Sí":"No",
    r.tieneAnioPrueba?(r.cantAnioPrueba||1):"—",
    r.llevaMulta?"Sí":"No",
    r.llevaMulta?(r.haMinContrato||0):"—",
    anx(r),
    r.tipoContractFee||"",
    r.tipoContractFee==="Sin Contract Fee"?"—":(r.montoContractFee||0),
    r.tipoContractFee==="Sin Contract Fee"?"—":(r.montoContractFee||0),
    r.valorRoyaltyPlanta||"",
    r.valorRoyaltyComercial||"",
    r.royaltyInflacion?"Sí":"No",
    r.mesFacuracionRC||"",
    r.linkContrato||"",
    r.notas||""
  ]);
  await exportCSV(rows, headers, "Contratos_Osiris");
}

function ControlContratos({data,setData,clientes,setClientes,can}){
  const [vista,setVista]=useState("tabla");
  const [sel,setSel]=useState(null);
  const [sec,setSec]=useState("empresa");
  const [busq,setBusq]=useState("");
  const [filtroPais,setFiltroPais]=useState("Todos");
  // Mantenedores
  const [tiposContrato,setTiposContrato]=useState(TIPOS_CONTRATO_BASE);
  const [tiposAnexo,setTiposAnexo]=useState(TIPOS_ANEXO_BASE);
  const [showMantenedor,setShowMantenedor]=useState(false);
  const [showClientes,setShowClientes]=useState(false);
  const [nuevoTipo,setNuevoTipo]=useState("");
  const [nuevoAnexo,setNuevoAnexo]=useState("");
  const [clienteSelId,setClienteSelId]=useState("");

  const formAnexoVacio={activo:false,firmadoOsiris:false,firmadoLicenciado:false,tipo:""};
  const formVacio={
    razonSocial:"",nombreComercial:"",taxID:"",pais:"Peru",direccion:"",ciudad:"",
    tipoContrato:"Licencia",moneda:"USD",fechaContrato:"",fechaTermino:"",
    firmadoLicenciado:false,firmadoOsiris:false,verDigital:"",linkContrato:"",
    anexo1:{...formAnexoVacio},anexo2:{...formAnexoVacio},anexo3:{...formAnexoVacio},
    nombreRep:"",personeria:"",nombrePredio:"",direccionPredio:"",cuartel:"",
    region:"",ciudadPredio:"",coordenadas:"",
    tipoContractFee:"Sin Devolución",montoContractFee:30000,
    valorRoyaltyPlanta:1.00,valorRoyaltyComercial:3000,
    royaltyInflacion:false,mesFacuracionRC:"",notas:"",
    // Nuevos campos
    llevaMulta:false,haMinContrato:0,
    tieneAnioPrueba:false,cantAnioPrueba:1,
  };
  const [form,setForm]=useState(formVacio);

  const upd=(id,c,v)=>setData(prev=>prev.map(r=>r.id===id?{...r,[c]:v}:r));
  const setF=(c,v)=>setForm(p=>({...p,[c]:v}));

  const filtrado=data.filter(r=>
    (filtroPais==="Todos"||r.pais===filtroPais)&&
    (!busq||r.razonSocial.toLowerCase().includes(busq.toLowerCase()))
  );
  const actual=data.find(r=>r.id===sel);
  const totalFirmados=data.filter(r=>r.firmadoLicenciado&&r.firmadoOsiris).length;

  function guardarNuevo(){
    // Campos obligatorios
    if(!form.razonSocial.trim()){alert("Razón Social es obligatoria.");return;}
    if(!form.pais){alert("El País es obligatorio.");return;}
    if(!form.tipoContrato){alert("El Tipo de Contrato es obligatorio.");return;}
    if(!form.fechaContrato){alert("La Fecha de Contrato es obligatoria.");return;}
    if(!form.moneda){alert("La Moneda es obligatoria.");return;}
    setData(prev=>[...prev,{...form,id:`ct_${Date.now()}`}]);
    setVista("tabla");setForm(formVacio);setClienteSelId("");
  }

  function autocompletarCliente(cliId){
    setClienteSelId(cliId);
    const cli=clientes.find(c=>c.id===cliId);
    if(!cli)return;
    setForm(prev=>({
      ...prev,
      razonSocial:cli.razonSocial||prev.razonSocial,
      nombreComercial:cli.nombreComercial||"",
      taxID:cli.taxID||"",
      pais:cli.pais||prev.pais,
      direccion:cli.direccion||"",
      ciudad:cli.ciudad||"",
      nombreRep:cli.repLegal||"",
    }));
  }
  function eliminar(id){
    if(!window.confirm("¿Eliminar este contrato?"))return;
    setData(prev=>prev.filter(r=>r.id!==id));
    if(sel===id){setVista("tabla");setSel(null);}
  }

  function Campo({label,campo,tipo="text",opts=null,r,fullWidth=false}){
    return(
      <div style={fullWidth?{gridColumn:"1/-1"}:{}}>
        <div style={{fontSize:11,color:C.gris,fontWeight:600,marginBottom:4}}>{label}</div>
        {opts
          ? <Cell val={r[campo]} onChange={v=>upd(r.id,campo,v)} opts={opts} can={can}/>
          : <Cell val={r[campo]} onChange={v=>upd(r.id,campo,v)} type={tipo} can={can}/>
        }
      </div>
    );
  }



  if(vista==="detalle"&&actual){
    const r=actual;
    return(
      <div>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"}}>
          <button onClick={()=>{setVista("tabla");setSel(null);}} style={{background:"#f1f5f9",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:13,color:C.sl,fontWeight:600}}>← Volver</button>
          <h2 style={{margin:0,fontSize:17,fontWeight:800,color:C.sl,flex:1}}>{r.razonSocial}</h2>
          <span style={{fontSize:11,background:r.pais==="Peru"?C.verdeBg:r.pais==="Mexico"?C.azulBg:C.amBg,
            color:r.pais==="Peru"?C.verde:r.pais==="Mexico"?C.azul:C.am,borderRadius:20,padding:"3px 12px",fontWeight:700}}>
            {r.pais}
          </span>
          <span style={{fontSize:11,background:r.firmadoLicenciado&&r.firmadoOsiris?C.verdeBg:C.amBg,
            color:r.firmadoLicenciado&&r.firmadoOsiris?C.verde:C.am,borderRadius:20,padding:"3px 12px",fontWeight:700}}>
            {r.firmadoLicenciado&&r.firmadoOsiris?"✅ Firmado completo":"⏳ Pendiente firma"}
          </span>
          {can&&<button onClick={()=>eliminar(r.id)} style={{background:"#fee2e2",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,color:"#991b1b",fontWeight:600}}>🗑 Eliminar</button>}
        </div>

        <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
          {SECCIONES_CT.map(s=>(
            <button key={s.id} onClick={()=>setSec(s.id)}
              style={{padding:"7px 15px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:600,fontSize:12,
                background:sec===s.id?s.color:"#fff",color:sec===s.id?"#fff":C.sl,
                boxShadow:sec===s.id?`0 2px 8px ${s.color}55`:"0 1px 4px #0001"}}>
              {s.label}
            </button>
          ))}
        </div>

        <div style={{background:"#fff",borderRadius:14,padding:24,boxShadow:"0 2px 10px #0001"}}>
          {sec==="empresa"&&(
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:16}}>
              <Campo label="Razón Social" campo="razonSocial" r={r}/>
              <Campo label="Nombre Comercial" campo="nombreComercial" r={r}/>
              <Campo label="Tax ID / RUC" campo="taxID" r={r}/>
              <Campo label="País" campo="pais" opts={PAISES} r={r}/>
              <Campo label="Dirección" campo="direccion" r={r}/>
              <Campo label="Ciudad" campo="ciudad" r={r}/>
            </div>
          )}
          {sec==="contrato"&&(
            <div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))",gap:16,marginBottom:20}}>
                <Campo label="Tipo Contrato" campo="tipoContrato" opts={tiposContrato} r={r}/>
                <Campo label="Moneda" campo="moneda" opts={MONEDAS} r={r}/>
                <Campo label="Fecha Contrato" campo="fechaContrato" tipo="date" r={r}/>
                <Campo label="Fecha Término" campo="fechaTermino" tipo="date" r={r}/>
                <Campo label="Ver Digital (URL)" campo="verDigital" r={r}/>
                <Campo label="📎 Link OneDrive contrato" campo="linkContrato" r={r}/>
              </div>
              {/* Acciones documento */}
              {r.linkContrato&&(
                <div style={{background:"#eff6ff",borderRadius:10,padding:"12px 16px",marginBottom:16,border:"1px solid #bfdbfe",display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                  <span style={{fontSize:12,fontWeight:700,color:C.azul}}>📄 Contrato:</span>
                  <a href={r.linkContrato} target="_blank" rel="noreferrer"
                    style={{background:C.azul,color:"#fff",borderRadius:6,padding:"5px 12px",fontSize:12,fontWeight:600,textDecoration:"none"}}>
                    👁 Ver
                  </a>
                  <a href={r.linkContrato} download
                    style={{background:"#16a34a",color:"#fff",borderRadius:6,padding:"5px 12px",fontSize:12,fontWeight:600,textDecoration:"none"}}>
                    ⬇️ Descargar
                  </a>
                  <button onClick={()=>{const w=window.open(r.linkContrato,"_blank");w&&setTimeout(()=>w.print(),1500);}}
                    style={{background:"#7c3aed",color:"#fff",borderRadius:6,padding:"5px 12px",fontSize:12,fontWeight:600,border:"none",cursor:"pointer"}}>
                    🖨️ Imprimir
                  </button>
                </div>
              )}
              {/* Año de prueba */}
              <div style={{background:"#fefce8",borderRadius:12,padding:16,marginBottom:16,border:"1px solid #fde047"}}>
                <div style={{fontSize:12,fontWeight:700,color:"#854d0e",marginBottom:10}}>🧪 Año de prueba</div>
                <div style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:can?"pointer":"default",fontSize:13,fontWeight:600,color:r.tieneAnioPrueba?"#854d0e":"#94a3b8"}}>
                    <input type="checkbox" checked={r.tieneAnioPrueba||false} disabled={!can} onChange={()=>upd(r.id,"tieneAnioPrueba",!r.tieneAnioPrueba)}/>
                    Tiene año de prueba
                  </label>
                  {r.tieneAnioPrueba&&(
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:12,color:"#854d0e"}}>Duración:</span>
                      {can
                        ? <input type="number" min="1" max="5" value={r.cantAnioPrueba||1}
                            onChange={e=>upd(r.id,"cantAnioPrueba",parseInt(e.target.value)||1)}
                            style={{width:60,padding:"5px 8px",borderRadius:6,border:"1px solid #fde047",fontSize:13,textAlign:"center"}}/>
                        : <span style={{fontWeight:700,color:"#854d0e"}}>{r.cantAnioPrueba||1}</span>
                      }
                      <span style={{fontSize:12,color:"#854d0e"}}>año(s)</span>
                    </div>
                  )}
                </div>
              </div>
              {/* Multa */}
              <div style={{background:"#fff1f2",borderRadius:12,padding:16,marginBottom:16,border:"1px solid #fecdd3"}}>
                <div style={{fontSize:12,fontWeight:700,color:"#9f1239",marginBottom:10}}>⚠️ Multa por incumplimiento</div>
                <div style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:can?"pointer":"default",fontSize:13,fontWeight:600,color:r.llevaMulta?"#9f1239":"#94a3b8"}}>
                    <input type="checkbox" checked={r.llevaMulta||false} disabled={!can} onChange={()=>upd(r.id,"llevaMulta",!r.llevaMulta)}/>
                    Lleva multa
                  </label>
                  {r.llevaMulta&&(
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:12,color:"#9f1239"}}>Mínimo Há según contrato:</span>
                      {can
                        ? <input type="number" min="0" value={r.haMinContrato||0}
                            onChange={e=>upd(r.id,"haMinContrato",parseFloat(e.target.value)||0)}
                            style={{width:90,padding:"5px 8px",borderRadius:6,border:"1px solid #fecdd3",fontSize:13,textAlign:"right"}}/>
                        : <span style={{fontWeight:700,color:"#9f1239"}}>{r.haMinContrato||0}</span>
                      }
                      <span style={{fontSize:12,color:"#9f1239"}}>Há</span>
                    </div>
                  )}
                </div>
              </div>
              {/* Firmas */}
              <div style={{background:"#f8fafc",borderRadius:12,padding:16,marginBottom:16}}>
                <div style={{fontSize:12,fontWeight:700,color:C.sl,marginBottom:12}}>Estado de Firmas del Contrato</div>
                <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                  {[["firmadoLicenciado","Firmado Licenciado"],["firmadoOsiris","Firmado OSIRIS"]].map(([campo,label])=>(
                    <label key={campo} style={{display:"flex",alignItems:"center",gap:8,cursor:can?"pointer":"default",
                      background:r[campo]?C.verdeBg:C.rojoBg,border:`1px solid ${r[campo]?"#86efac":"#fca5a5"}`,
                      borderRadius:10,padding:"9px 18px",fontSize:13,fontWeight:600,color:r[campo]?C.verde:C.rojo}}>
                      <input type="checkbox" checked={r[campo]} disabled={!can} onChange={()=>upd(r.id,campo,!r[campo])} style={{accentColor:r[campo]?"#16a34a":"#dc2626"}}/>
                      {r[campo]?"✅":"❌"} {label}
                    </label>
                  ))}
                </div>
              </div>
              {/* Anexos mejorados */}
              <div style={{background:"#f8fafc",borderRadius:12,padding:16,marginBottom:16}}>
                <div style={{fontSize:12,fontWeight:700,color:C.sl,marginBottom:12}}>Anexos del contrato</div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {[["anexo1","Anexo 1"],["anexo2","Anexo 2"],["anexo3","Anexo 3"]].map(([campo,label])=>{
                    const anx = typeof r[campo]==="object" ? r[campo] : {activo:!!r[campo],firmadoOsiris:false,firmadoLicenciado:false,tipo:""};
                    return(
                      <div key={campo} style={{background:"#fff",borderRadius:8,padding:"10px 14px",border:`1px solid ${anx.activo?"#93c5fd":"#e2e8f0"}`}}>
                        <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                          <label style={{display:"flex",alignItems:"center",gap:6,cursor:can?"pointer":"default",fontSize:13,fontWeight:700,color:anx.activo?C.azul:"#94a3b8",minWidth:80}}>
                            <input type="checkbox" checked={anx.activo} disabled={!can}
                              onChange={()=>upd(r.id,campo,{...anx,activo:!anx.activo})}/>
                            {anx.activo?"📎":"○"} {label}
                          </label>
                          {anx.activo&&(
                            <>
                              <select value={anx.tipo||""} disabled={!can}
                                onChange={e=>upd(r.id,campo,{...anx,tipo:e.target.value})}
                                style={{padding:"5px 8px",borderRadius:6,border:"1px solid #93c5fd",fontSize:12,flex:1,minWidth:180}}>
                                <option value="">— Tipo de anexo —</option>
                                {tiposAnexo.map(t=><option key={t} value={t}>{t}</option>)}
                              </select>
                              <label style={{display:"flex",alignItems:"center",gap:5,fontSize:11,fontWeight:600,color:anx.firmadoOsiris?C.verde:"#94a3b8",cursor:can?"pointer":"default"}}>
                                <input type="checkbox" checked={anx.firmadoOsiris||false} disabled={!can}
                                  onChange={()=>upd(r.id,campo,{...anx,firmadoOsiris:!anx.firmadoOsiris})}/>
                                {anx.firmadoOsiris?"✅":"❌"} OSIRIS
                              </label>
                              <label style={{display:"flex",alignItems:"center",gap:5,fontSize:11,fontWeight:600,color:anx.firmadoLicenciado?C.verde:"#94a3b8",cursor:can?"pointer":"default"}}>
                                <input type="checkbox" checked={anx.firmadoLicenciado||false} disabled={!can}
                                  onChange={()=>upd(r.id,campo,{...anx,firmadoLicenciado:!anx.firmadoLicenciado})}/>
                                {anx.firmadoLicenciado?"✅":"❌"} Licenciado
                              </label>
                            </>
                          )}
                        </div>
                        {anx.activo&&(
                          <div style={{display:"flex",gap:8,alignItems:"center",marginTop:8,paddingTop:8,borderTop:"1px solid #e2e8f0",flexWrap:"wrap"}}>
                            <span style={{fontSize:11,color:C.gris,fontWeight:600}}>📎 Link OneDrive:</span>
                            {can
                              ? <input value={anx.link||""} onChange={e=>upd(r.id,campo,{...anx,link:e.target.value})}
                                  placeholder="https://..." style={{flex:1,minWidth:200,padding:"4px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,outline:"none"}}/>
                              : <span style={{fontSize:11,color:C.gris}}>{anx.link||"—"}</span>
                            }
                            {anx.link&&<>
                              <a href={anx.link} target="_blank" rel="noreferrer"
                                style={{background:C.azul,color:"#fff",borderRadius:5,padding:"3px 10px",fontSize:11,fontWeight:600,textDecoration:"none"}}>👁 Ver</a>
                              <a href={anx.link} download
                                style={{background:"#16a34a",color:"#fff",borderRadius:5,padding:"3px 10px",fontSize:11,fontWeight:600,textDecoration:"none"}}>⬇️</a>
                              <button onClick={()=>{const w=window.open(anx.link,"_blank");w&&setTimeout(()=>w.print(),1500);}}
                                style={{background:"#7c3aed",color:"#fff",borderRadius:5,padding:"3px 10px",fontSize:11,fontWeight:600,border:"none",cursor:"pointer"}}>🖨️</button>
                            </>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <div style={{fontSize:11,color:C.gris,fontWeight:600,marginBottom:6}}>Notas / Observaciones</div>
                {can
                  ? <textarea value={r.notas||""} onChange={e=>upd(r.id,"notas",e.target.value)} rows={3} placeholder="Agrega observaciones del contrato..."
                      style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,resize:"vertical",boxSizing:"border-box"}}/>
                  : <div style={{fontSize:13,color:C.sl,background:"#f8fafc",borderRadius:8,padding:"10px 12px",minHeight:56}}>{r.notas||<span style={{color:"#cbd5e1"}}>Sin notas</span>}</div>
                }
              </div>
            </div>
          )}
          {sec==="rep"&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <Campo label="Nombre Representante Legal" campo="nombreRep" r={r}/>
              <Campo label="Personería" campo="personeria" r={r}/>
            </div>
          )}
          {sec==="ubicacion"&&(
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:16}}>
              <Campo label="Nombre Predio" campo="nombrePredio" r={r}/>
              <Campo label="Dirección Predio" campo="direccionPredio" r={r}/>
              <Campo label="Cuartel" campo="cuartel" r={r}/>
              <Campo label="Región" campo="region" r={r}/>
              <Campo label="Ciudad" campo="ciudadPredio" r={r}/>
              <Campo label="Coordenadas GPS" campo="coordenadas" r={r}/>
            </div>
          )}
          {sec==="factura"&&(
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))",gap:16}}>
              <div>
                <div style={{fontSize:11,color:C.gris,fontWeight:600,marginBottom:4}}>Tipo Contract Fee</div>
                <Cell val={r.tipoContractFee} onChange={v=>upd(r.id,"tipoContractFee",v)} opts={TIPOS_FEE} can={can}/>
              </div>
              <div>
                <div style={{fontSize:11,color:C.gris,fontWeight:600,marginBottom:4}}>Monto Contract Fee (USD)</div>
                <Cell val={r.montoContractFee} onChange={v=>upd(r.id,"montoContractFee",parseFloat(v)||0)} type="number" can={can}/>
              </div>
              <div>
                <div style={{fontSize:11,color:C.gris,fontWeight:600,marginBottom:4}}>Valor Royalty/Planta (USD)</div>
                <Cell val={r.valorRoyaltyPlanta} onChange={v=>upd(r.id,"valorRoyaltyPlanta",parseFloat(v)||0)} type="number" can={can}/>
              </div>
              <div>
                <div style={{fontSize:11,color:C.gris,fontWeight:600,marginBottom:4}}>Valor Royalty Comercial (USD/Há)</div>
                <Cell val={r.valorRoyaltyComercial} onChange={v=>upd(r.id,"valorRoyaltyComercial",parseFloat(v)||0)} type="number" can={can}/>
              </div>
              <div>
                <div style={{fontSize:11,color:C.gris,fontWeight:600,marginBottom:4}}>Mes Facturación Royalty Comercial</div>
                <Cell val={r.mesFacuracionRC||""} onChange={v=>upd(r.id,"mesFacuracionRC",v)} opts={["—",...MESES_ANO]} can={can}/>
              </div>
              <div style={{display:"flex",alignItems:"flex-end",paddingBottom:4}}>
                <label style={{display:"flex",alignItems:"center",gap:8,cursor:can?"pointer":"default",
                  background:r.royaltyInflacion?C.amBg:"#f1f5f9",border:`1px solid ${r.royaltyInflacion?"#fde047":"#d1d5db"}`,
                  borderRadius:10,padding:"9px 14px",fontSize:13,fontWeight:600,
                  color:r.royaltyInflacion?C.am:"#94a3b8"}}>
                  <input type="checkbox" checked={r.royaltyInflacion||false} disabled={!can} onChange={()=>upd(r.id,"royaltyInflacion",!r.royaltyInflacion)} style={{accentColor:"#d97706"}}/>
                  📈 Sujeto a Inflación
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if(vista==="nuevo"){
    return(
      <div>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
          <button onClick={()=>{setVista("tabla");setForm(formVacio);setClienteSelId("");}} style={{background:"#f1f5f9",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:13,color:C.sl,fontWeight:600}}>← Volver</button>
          <h2 style={{margin:0,fontSize:16,fontWeight:800,color:C.sl}}>Nuevo Contrato</h2>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {/* Selector de cliente con autocompletado */}
          <div style={{background:"#eff6ff",borderRadius:12,padding:"14px 20px",border:"1px solid #bfdbfe"}}>
            <div style={{fontSize:12,fontWeight:700,color:C.azul,marginBottom:8}}>🔍 Seleccionar cliente existente (opcional)</div>
            <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
              <select value={clienteSelId} onChange={e=>autocompletarCliente(e.target.value)}
                style={{flex:1,minWidth:200,padding:"8px 12px",borderRadius:8,border:"1px solid #93c5fd",fontSize:13}}>
                <option value="">— Buscar cliente —</option>
                {clientes.map(c=><option key={c.id} value={c.id}>{c.razonSocial}{c.nombreComercial&&c.nombreComercial!==c.razonSocial?` (${c.nombreComercial})`:""}</option>)}
              </select>
              {clienteSelId&&<span style={{fontSize:11,color:C.azul,background:C.azulBg,borderRadius:20,padding:"3px 10px"}}>✓ Datos autocompletados</span>}
            </div>
          </div>
          <div style={{background:"#fff",borderRadius:12,padding:20,boxShadow:"0 1px 6px #0001"}}>
            <div style={{fontSize:13,fontWeight:700,color:C.azul,marginBottom:14}}>🏢 Antecedentes Empresa</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
              <CampoNuevo label="Razón Social *" campo="razonSocial" form={form} setF={setF}/>
              <CampoNuevo label="Nombre Comercial" campo="nombreComercial" form={form} setF={setF}/>
              <CampoNuevo label="Tax ID / RUC" campo="taxID"/>
              <CampoNuevo label="País" campo="pais" opts={PAISES} form={form} setF={setF}/>
              <CampoNuevo label="Dirección" campo="direccion" form={form} setF={setF}/>
              <CampoNuevo label="Ciudad" campo="ciudad" form={form} setF={setF}/>
            </div>
          </div>
          <div style={{background:"#fff",borderRadius:12,padding:20,boxShadow:"0 1px 6px #0001"}}>
            <div style={{fontSize:13,fontWeight:700,color:C.mo,marginBottom:14}}>📄 Datos del Contrato</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
              <CampoNuevo label="Tipo Contrato" campo="tipoContrato" opts={tiposContrato} form={form} setF={setF}/>
              <CampoNuevo label="Moneda" campo="moneda" opts={MONEDAS} form={form} setF={setF}/>
              <CampoNuevo label="Fecha Contrato" campo="fechaContrato" tipo="date" form={form} setF={setF}/>
              <CampoNuevo label="Fecha Término" campo="fechaTermino" tipo="date" form={form} setF={setF}/>
              <CampoNuevo label="Ver Digital (URL)" campo="verDigital" form={form} setF={setF}/>
              <CampoNuevo label="📎 Link OneDrive contrato" campo="linkContrato" form={form} setF={setF}/>
            </div>
            {/* Año de prueba */}
            <div style={{marginTop:14,background:"#fefce8",borderRadius:10,padding:"12px 14px",border:"1px solid #fde047"}}>
              <div style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
                <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:13,fontWeight:600,color:form.tieneAnioPrueba?"#854d0e":"#94a3b8"}}>
                  <input type="checkbox" checked={form.tieneAnioPrueba||false} onChange={()=>setF("tieneAnioPrueba",!form.tieneAnioPrueba)}/>
                  🧪 Tiene año de prueba
                </label>
                {form.tieneAnioPrueba&&(
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:12,color:"#854d0e"}}>Duración:</span>
                    <input type="number" min="1" max="5" value={form.cantAnioPrueba||1}
                      onChange={e=>setF("cantAnioPrueba",parseInt(e.target.value)||1)}
                      style={{width:60,padding:"5px 8px",borderRadius:6,border:"1px solid #fde047",fontSize:13,textAlign:"center"}}/>
                    <span style={{fontSize:12,color:"#854d0e"}}>año(s)</span>
                  </div>
                )}
              </div>
            </div>
            {/* Multa */}
            <div style={{marginTop:10,background:"#fff1f2",borderRadius:10,padding:"12px 14px",border:"1px solid #fecdd3"}}>
              <div style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
                <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:13,fontWeight:600,color:form.llevaMulta?"#9f1239":"#94a3b8"}}>
                  <input type="checkbox" checked={form.llevaMulta||false} onChange={()=>setF("llevaMulta",!form.llevaMulta)}/>
                  ⚠️ Lleva multa por incumplimiento
                </label>
                {form.llevaMulta&&(
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:12,color:"#9f1239"}}>Mínimo Há:</span>
                    <input type="number" min="0" value={form.haMinContrato||0}
                      onChange={e=>setF("haMinContrato",parseFloat(e.target.value)||0)}
                      style={{width:90,padding:"5px 8px",borderRadius:6,border:"1px solid #fecdd3",fontSize:13,textAlign:"right"}}/>
                    <span style={{fontSize:12,color:"#9f1239"}}>Há</span>
                  </div>
                )}
              </div>
            </div>
            {/* Firmas y Anexos mejorados */}
            <div style={{marginTop:14}}>
              <div style={{fontSize:12,fontWeight:700,color:C.sl,marginBottom:8}}>Firmas contrato principal</div>
              <div style={{display:"flex",gap:14,flexWrap:"wrap",marginBottom:14}}>
                {[["firmadoLicenciado","✅ Firmado Licenciado"],["firmadoOsiris","✅ Firmado OSIRIS"]].map(([c,l])=>(
                  <label key={c} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:12,fontWeight:600,color:form[c]?C.verde:"#94a3b8"}}>
                    <input type="checkbox" checked={form[c]||false} onChange={()=>setF(c,!form[c])}/>{l}
                  </label>
                ))}
              </div>
              <div style={{fontSize:12,fontWeight:700,color:C.sl,marginBottom:8}}>Anexos</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {[["anexo1","Anexo 1"],["anexo2","Anexo 2"],["anexo3","Anexo 3"]].map(([c,label])=>{
                  const anx = form[c]||{activo:false,firmadoOsiris:false,firmadoLicenciado:false,tipo:""};
                  return(
                    <div key={c} style={{background:"#f8fafc",borderRadius:8,padding:"10px 14px",border:`1px solid ${anx.activo?"#93c5fd":"#e2e8f0"}`}}>
                      <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                        <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:13,fontWeight:700,color:anx.activo?C.azul:"#94a3b8",minWidth:80}}>
                          <input type="checkbox" checked={anx.activo||false} onChange={()=>setF(c,{...anx,activo:!anx.activo})}/>
                          {anx.activo?"📎":"○"} {label}
                        </label>
                        {anx.activo&&(
                          <>
                            <select value={anx.tipo||""} onChange={e=>setF(c,{...anx,tipo:e.target.value})}
                              style={{padding:"5px 8px",borderRadius:6,border:"1px solid #93c5fd",fontSize:12,flex:1,minWidth:180}}>
                              <option value="">— Tipo de anexo —</option>
                              {tiposAnexo.map(t=><option key={t} value={t}>{t}</option>)}
                            </select>
                            <label style={{display:"flex",alignItems:"center",gap:5,fontSize:11,fontWeight:600,color:anx.firmadoOsiris?C.verde:"#94a3b8",cursor:"pointer"}}>
                              <input type="checkbox" checked={anx.firmadoOsiris||false} onChange={()=>setF(c,{...anx,firmadoOsiris:!anx.firmadoOsiris})}/>
                              {anx.firmadoOsiris?"✅":"❌"} OSIRIS
                            </label>
                            <label style={{display:"flex",alignItems:"center",gap:5,fontSize:11,fontWeight:600,color:anx.firmadoLicenciado?C.verde:"#94a3b8",cursor:"pointer"}}>
                              <input type="checkbox" checked={anx.firmadoLicenciado||false} onChange={()=>setF(c,{...anx,firmadoLicenciado:!anx.firmadoLicenciado})}/>
                              {anx.firmadoLicenciado?"✅":"❌"} Licenciado
                            </label>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <div style={{background:"#fff",borderRadius:12,padding:20,boxShadow:"0 1px 6px #0001"}}>
              <div style={{fontSize:13,fontWeight:700,color:C.teal,marginBottom:14}}>👤 Representante</div>
              <CampoNuevo label="Nombre" campo="nombreRep" form={form} setF={setF}/>
              <div style={{marginTop:12}}><CampoNuevo label="Personería" campo="personeria" form={form} setF={setF}/></div>
            </div>
            <div style={{background:"#fff",borderRadius:12,padding:20,boxShadow:"0 1px 6px #0001"}}>
              <div style={{fontSize:13,fontWeight:700,color:C.verde,marginBottom:14}}>🌱 Ubicación Plantas</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {[["Nombre Predio","nombrePredio"],["Cuartel","cuartel"],["Región","region"],["Coordenadas","coordenadas"]].map(([l,c])=>(
                  <div key={c}><CampoNuevo label={l} campo={c} form={form} setF={setF}/></div>
                ))}
              </div>
            </div>
          </div>
          <div style={{background:"#fff",borderRadius:12,padding:20,boxShadow:"0 1px 6px #0001"}}>
            <div style={{fontSize:13,fontWeight:700,color:C.am,marginBottom:14}}>💰 Facturación</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
              <CampoNuevo label="Tipo Contract Fee" campo="tipoContractFee" opts={TIPOS_FEE} form={form} setF={setF}/>
              <CampoNuevo label="Monto Contract Fee (USD)" campo="montoContractFee" tipo="number" form={form} setF={setF}/>
              <CampoNuevo label="Royalty/Planta (USD)" campo="valorRoyaltyPlanta" tipo="number"/>
              <CampoNuevo label="Royalty Comercial (USD/Há)" campo="valorRoyaltyComercial" tipo="number"/>
              <CampoNuevo label="Mes Facturación RC" campo="mesFacuracionRC" opts={["—",...MESES_ANO]} form={form} setF={setF}/>
              <div style={{display:"flex",alignItems:"flex-end"}}>
                <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12,fontWeight:600,color:C.sl}}>
                  <input type="checkbox" checked={form.royaltyInflacion||false} onChange={()=>setF("royaltyInflacion",!form.royaltyInflacion)}/>
                  📈 Sujeto a Inflación
                </label>
              </div>
            </div>
            <div style={{marginTop:12}}>
              <label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>Notas / Observaciones</label>
              <textarea value={form.notas} onChange={e=>setF("notas",e.target.value)} rows={2} placeholder="Notas adicionales del contrato..."
                style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,resize:"vertical",boxSizing:"border-box"}}/>
            </div>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",paddingBottom:16}}>
            <button onClick={()=>{setVista("tabla");setForm(formVacio);}} style={{padding:"9px 22px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:14}}>Cancelar</button>
            <button onClick={guardarNuevo} style={{padding:"9px 22px",borderRadius:8,border:"none",background:C.azul,color:"#fff",cursor:"pointer",fontSize:14,fontWeight:600}}>Guardar contrato</button>
          </div>
        </div>
      </div>
    );
  }

  return(
    <div>
      <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        {[[data.length,"Total contratos",C.azul,C.azulBg],[totalFirmados,"Firmados completos",C.verde,C.verdeBg],[data.length-totalFirmados,"Pendientes firma",C.am,C.amBg]].map(([v,l,c,bg])=>(
          <div key={l} style={{background:bg,borderRadius:12,padding:"12px 18px",flex:1,minWidth:120}}>
            <div style={{fontSize:11,color:c,fontWeight:600}}>{l}</div>
            <div style={{fontSize:22,fontWeight:800,color:c}}>{v}</div>
          </div>
        ))}
        <div style={{display:"flex",gap:8,alignSelf:"center",flexWrap:"wrap"}}>
          {can&&<button onClick={()=>{setVista("nuevo");setForm(formVacio);setClienteSelId("");}} style={{background:C.azul,color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontSize:13,fontWeight:700}}>+ Nuevo contrato</button>}
          <button onClick={async ()=>exportarContratos(filtrado)}
            style={{background:"#16a34a",color:"#fff",border:"none",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>
            ⬇️ Exportar Excel
          </button>
          {can&&<button onClick={()=>{setShowMantenedor(v=>!v);setShowClientes(false);}}
            style={{background:showMantenedor?"#1e293b":"#f1f5f9",color:showMantenedor?"#fff":"#1e293b",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:12,fontWeight:600}}>
            ⚙️ Tipos
          </button>}
          {can&&<button onClick={()=>{setShowClientes(v=>!v);setShowMantenedor(false);}}
            style={{background:showClientes?"#0f766e":"#f1f5f9",color:showClientes?"#fff":"#1e293b",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:12,fontWeight:600}}>
            👥 Clientes
          </button>}
        </div>
      </div>

      {/* Mantenedor tipos */}
      {showMantenedor&&can&&(
        <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:12,padding:"16px 20px",marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:12}}>⚙️ Mantenedor de tipos</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:C.azul,marginBottom:8}}>Tipos de contrato</div>
              <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:8,maxHeight:160,overflowY:"auto"}}>
                {tiposContrato.map((t,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:6,background:"#fff",borderRadius:6,padding:"5px 10px",border:"1px solid #e2e8f0"}}>
                    <span style={{flex:1,fontSize:12}}>{t}</span>
                    {i>=TIPOS_CONTRATO_BASE.length&&(
                      <button onClick={()=>setTiposContrato(p=>p.filter((_,j)=>j!==i))}
                        style={{background:"none",border:"none",color:C.rojo,cursor:"pointer",fontSize:14,fontWeight:700}}>×</button>
                    )}
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:6}}>
                <input value={nuevoTipo} onChange={e=>setNuevoTipo(e.target.value)} placeholder="Nuevo tipo..."
                  style={{flex:1,padding:"6px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,outline:"none"}}
                  onKeyDown={e=>{if(e.key==="Enter"&&nuevoTipo.trim()&&!tiposContrato.includes(nuevoTipo.trim())){setTiposContrato(p=>[...p,nuevoTipo.trim()]);setNuevoTipo("");}}}/>
                <button onClick={()=>{if(nuevoTipo.trim()&&!tiposContrato.includes(nuevoTipo.trim())){setTiposContrato(p=>[...p,nuevoTipo.trim()]);setNuevoTipo("");}}}
                  style={{padding:"6px 12px",borderRadius:6,background:C.azul,color:"#fff",border:"none",cursor:"pointer",fontSize:12,fontWeight:600}}>+</button>
              </div>
            </div>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:C.mo,marginBottom:8}}>Tipos de anexo</div>
              <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:8,maxHeight:160,overflowY:"auto"}}>
                {tiposAnexo.map((t,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:6,background:"#fff",borderRadius:6,padding:"5px 10px",border:"1px solid #e2e8f0"}}>
                    <span style={{flex:1,fontSize:12}}>{t}</span>
                    {i>=TIPOS_ANEXO_BASE.length&&(
                      <button onClick={()=>setTiposAnexo(p=>p.filter((_,j)=>j!==i))}
                        style={{background:"none",border:"none",color:C.rojo,cursor:"pointer",fontSize:14,fontWeight:700}}>×</button>
                    )}
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:6}}>
                <input value={nuevoAnexo} onChange={e=>setNuevoAnexo(e.target.value)} placeholder="Nuevo tipo de anexo..."
                  style={{flex:1,padding:"6px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,outline:"none"}}
                  onKeyDown={e=>{if(e.key==="Enter"&&nuevoAnexo.trim()&&!tiposAnexo.includes(nuevoAnexo.trim())){setTiposAnexo(p=>[...p,nuevoAnexo.trim()]);setNuevoAnexo("");}}}/>
                <button onClick={()=>{if(nuevoAnexo.trim()&&!tiposAnexo.includes(nuevoAnexo.trim())){setTiposAnexo(p=>[...p,nuevoAnexo.trim()]);setNuevoAnexo("");}}}
                  style={{padding:"6px 12px",borderRadius:6,background:C.mo,color:"#fff",border:"none",cursor:"pointer",fontSize:12,fontWeight:600}}>+</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Maestro clientes inline */}
      {showClientes&&<MaestroClientes clientes={clientes} setClientes={setClientes} can={can}/>}

      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <input value={busq} onChange={e=>setBusq(e.target.value)} placeholder="Buscar empresa..."
          style={{padding:"7px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,minWidth:200}}/>
        {["Todos",...PAISES].map(p=>(
          <button key={p} onClick={()=>setFiltroPais(p)}
            style={{padding:"4px 12px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
              background:filtroPais===p?"#1e293b":"#fff",color:filtroPais===p?"#fff":C.sl}}>
            {p}
          </button>
        ))}
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",background:"#fff",borderRadius:10,overflow:"hidden"}}>
          <Th cols={[{l:"Empresa",w:160},{l:"País",w:80},{l:"Tipo",w:100},{l:"Fecha",c:true,w:100},{l:"Firmas",c:true,w:140},{l:"Anexos",c:true,w:90},{l:"Contract Fee",c:true,w:110},{l:"R./Planta",c:true,w:90},{l:"R./Comercial",c:true,w:110},{l:"",c:true,w:70}]}/>
          <tbody>
            {filtrado.map((r,i)=>(
              <tr key={r.id} style={{borderBottom:"1px solid #f1f5f9",background:i%2===0?"#fff":"#f8fafc",cursor:"pointer"}}
                onClick={()=>{setSel(r.id);setVista("detalle");setSec("empresa");}}>
                <td style={{padding:"9px 12px",fontWeight:700,color:C.sl}}>{r.razonSocial}</td>
                <td style={{padding:"9px 12px",fontSize:12,color:C.gris}}>{r.pais}</td>
                <td style={{padding:"9px 12px",fontSize:11,color:C.gris}}>{r.tipoContrato}</td>
                <td style={{padding:"9px 12px",textAlign:"center",fontSize:11,color:C.gris}}>{r.fechaContrato||"—"}</td>
                <td style={{padding:"9px 12px",textAlign:"center",fontSize:11}}>
                  <span style={{color:r.firmadoLicenciado?C.verde:C.rojo}}>{r.firmadoLicenciado?"✅":"❌"}</span> Lic.&nbsp;
                  <span style={{color:r.firmadoOsiris?C.verde:C.rojo}}>{r.firmadoOsiris?"✅":"❌"}</span> Osiris
                </td>
                <td style={{padding:"9px 12px",textAlign:"center",fontSize:11,color:C.gris}}>
                  {[r.anexo1&&"A1",r.anexo2&&"A2",r.anexo3&&"A3"].filter(Boolean).join(" · ")||"—"}
                </td>
                <td style={{padding:"9px 12px",textAlign:"right",fontSize:12,color:C.mo,fontWeight:600}}>{r.tipoContractFee==="Sin Contract Fee"?"Sin fee":$$(r.montoContractFee)}</td>
                <td style={{padding:"9px 12px",textAlign:"center",fontSize:12}}>{r.valorRoyaltyPlanta?`$${r.valorRoyaltyPlanta}/pl`:"—"}</td>
                <td style={{padding:"9px 12px",textAlign:"center",fontSize:12}}>
                  {r.valorRoyaltyComercial?`$${r.valorRoyaltyComercial}/há`:"—"}
                  {r.royaltyInflacion?<span style={{fontSize:9,color:C.am,marginLeft:4}}>+IPC</span>:null}
                </td>
                <td style={{padding:"9px 12px",textAlign:"center"}} onClick={e=>e.stopPropagation()}>
                  <button onClick={()=>{setSel(r.id);setVista("detalle");setSec("empresa");}}
                    style={{background:C.azulBg,color:C.azul,border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>
                    Ver →
                  </button>
                </td>
              </tr>
            ))}
            {filtrado.length===0&&<tr><td colSpan={10} style={{textAlign:"center",padding:32,color:C.gris}}>Sin contratos</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// BREADCRUMB — componente de navegación visual
// ══════════════════════════════════════════════════════════
function Breadcrumb({items}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:C.gris,flexWrap:"wrap"}}>
      {items.map((item,i)=>(
        <span key={i} style={{display:"flex",alignItems:"center",gap:6}}>
          {i>0&&<span style={{color:"rgba(255,255,255,0.3)",fontSize:10}}>›</span>}
          {item.onClick
            ? <button onClick={item.onClick}
                style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",
                  color:"rgba(255,255,255,0.8)",borderRadius:6,padding:"3px 10px",cursor:"pointer",
                  fontSize:11,fontWeight:600,transition:"all 0.15s"}}
                onMouseEnter={e=>{e.target.style.background="rgba(255,255,255,0.2)";e.target.style.color="#fff";}}
                onMouseLeave={e=>{e.target.style.background="rgba(255,255,255,0.1)";e.target.style.color="rgba(255,255,255,0.8)";}}>
                {item.label}
              </button>
            : <span style={{color:"rgba(255,255,255,0.5)",fontSize:11}}>{item.label}</span>
          }
        </span>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL — Hub Osiris mejorado
// ══════════════════════════════════════════════════════════
export default function OsirisModule({usuarioActual,esAdmin,esSoloConsulta,tabPermisos={},osirisData,setOsirisData,onBack,onLogout}) {
  // subApp: null = hub Osiris | "ingresos" | "contratos"
  const [subApp,setSubApp]=useState(null);
  const [subTab,setSubTab]=useState("resumen");

  // Datos desde Supabase — sin datos de ejemplo (empezar desde cero)
  const ctData  = osirisData?.contratos       ?? CONTRATOS_INIT;
  const clientes= osirisData?.clientes        ?? CLIENTES_INIT;
  const tpData  = osirisData?.totalPedidos    ?? [];
  const rpData  = osirisData?.royaltyPlanta   ?? [];
  const feData  = osirisData?.feeEntrada      ?? [];
  const rcData  = osirisData?.royaltyComercial?? [];
  const fvData  = osirisData?.feeViveros      ?? [];

  const setClientes=useCallback(fn=>setOsirisData(prev=>({...prev,clientes:       typeof fn==="function"?fn(prev?.clientes       ??CLIENTES_INIT):fn})),[setOsirisData]);
  const setCt=useCallback(fn=>setOsirisData(prev=>({...prev,contratos:      typeof fn==="function"?fn(prev?.contratos      ??CONTRATOS_INIT):fn})),[setOsirisData]);
  const setTp=useCallback(fn=>setOsirisData(prev=>({...prev,totalPedidos:   typeof fn==="function"?fn(prev?.totalPedidos   ??[]):fn})),[setOsirisData]);
  const setRp=useCallback(fn=>setOsirisData(prev=>({...prev,royaltyPlanta:  typeof fn==="function"?fn(prev?.royaltyPlanta  ??[]):fn})),[setOsirisData]);
  const setFe=useCallback(fn=>setOsirisData(prev=>({...prev,feeEntrada:     typeof fn==="function"?fn(prev?.feeEntrada     ??[]):fn})),[setOsirisData]);
  const setRc=useCallback(fn=>setOsirisData(prev=>({...prev,royaltyComercial:typeof fn==="function"?fn(prev?.royaltyComercial??[]):fn})),[setOsirisData]);
  const setFv=useCallback(fn=>setOsirisData(prev=>({...prev,feeViveros:     typeof fn==="function"?fn(prev?.feeViveros     ??[]):fn})),[setOsirisData]);

  // PERMISOS OSIRIS
  // can = cualquier usuario que NO sea "consulta" puede editar
  // tabPermisos solo controla acceso a secciones completas, no edición de registros
  const rolActual = usuarioActual?.rol || "editor";
  const esEditorOAdmin = rolActual === "editor" || rolActual === "admin";
  const permContratos = tabPermisos?.contratos || "editar";
  const canVerContratos = permContratos !== "sin_acceso";
  // can = editorOAdmin independiente de tabPermisos (tabPermisos solo oculta secciones)
  const canContratos = esEditorOAdmin;
  const canIngresos  = esEditorOAdmin;
  const can = canIngresos;

  const totPend=
    rpData.map(r=>(Number(r.nPlantas)||0)*(Number(r.usdPlanta)||0)*pct(r.pais)*(r.pagado?0:1)).reduce((a,b)=>a+b,0)+
    feData.filter(r=>!r.pagado).reduce((s,r)=>s+(Number(r.montoUSD)||0),0)+
    fvData.filter(r=>!r.pagado).reduce((s,r)=>s+(Number(r.montoFact)||0),0);

  const hoy=new Date();hoy.setHours(0,0,0,0);
  const alertasRC=rcData.filter(r=>{const fA=fechaAvisoTrim(r.añoCobro,r.trimCobro);const fI=fechaInicioTrim(r.añoCobro,r.trimCobro);return hoy>=fA&&hoy<fI&&!r.nFact;}).length;
  const sinConfirmar=tpData.filter(r=>r.estado==="Por confirmar").length;

  const SUBTABS=[
    {id:"resumen",          label:"📊 Resumen",          badge:0},
    {id:"graficos",         label:"🌿 Plantas",          badge:0},
    {id:"totalPedidos",     label:"📦 Total Pedidos",     badge:sinConfirmar},
    {id:"royaltyPlanta",    label:"🌱 Royalty/Planta",    badge:0},
    {id:"feeEntrada",       label:"📄 Fee Entrada",       badge:0},
    {id:"royaltyComercial", label:"📈 Royalty Comercial", badge:alertasRC},
    {id:"feeViveros",       label:"🏭 Fee Viveros",       badge:0},
  ];

  // ── Barra de navegación compartida ────────────────────────
  // IMPORTANTE: definida antes de cualquier return para que esté disponible en todos los casos
  const NavBar = ({breadcrumbItems, showPorCobrar=false}) => (
    <div style={{
      background:"linear-gradient(135deg,#0f2d4a,#1a5276)",
      borderRadius:14,
      padding:"14px 20px",
      marginBottom:18,
      display:"flex",
      justifyContent:"space-between",
      alignItems:"center",
      flexWrap:"wrap",
      gap:12,
    }}>
      <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
        <OsirisLogo height={44}/>
        <div style={{borderLeft:"1px solid rgba(255,255,255,0.2)",paddingLeft:14}}>
          <Breadcrumb items={breadcrumbItems}/>
        </div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        {showPorCobrar&&(
          <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",textAlign:"right",marginRight:4}}>
            <div style={{fontSize:9,textTransform:"uppercase",letterSpacing:1,marginBottom:1}}>Por cobrar</div>
            <div style={{fontSize:14,fontWeight:800,color:"#fbbf24"}}>{$$(totPend)}</div>
          </div>
        )}
        {/* Solo mostrar "Osiris Hub" si no estamos YA en el hub */}
        {subApp!==null&&(
          <button
            onClick={()=>setSubApp(null)}
            style={{
              background:"rgba(255,255,255,0.12)",
              border:"1px solid rgba(255,255,255,0.25)",
              color:"#fff",borderRadius:8,
              padding:"7px 14px",cursor:"pointer",
              fontSize:12,fontWeight:600,
            }}>
            🏠 Osiris Hub
          </button>
        )}
        <button
          onClick={onBack}
          style={{
            background:"rgba(255,255,255,0.08)",
            border:"1px solid rgba(255,255,255,0.15)",
            color:"rgba(255,255,255,0.7)",borderRadius:8,
            padding:"7px 14px",cursor:"pointer",
            fontSize:12,fontWeight:600,
          }}>
          ← Mediterra
        </button>
        <button
          onClick={onLogout||onBack}
          style={{
            background:"rgba(248,113,113,0.18)",
            border:"1px solid rgba(248,113,113,0.3)",
            color:"#fca5a5",borderRadius:8,
            padding:"7px 14px",cursor:"pointer",
            fontSize:12,
          }}>
          Salir
        </button>
      </div>
    </div>
  );

  // ── HUB INTERNO OSIRIS ─────────────────────────────────────
  if(subApp===null) return(
    <div style={{fontFamily:"sans-serif",background:"#0d1117",minHeight:"100vh",padding:"20px 20px 40px"}}>
      <NavBar breadcrumbItems={[
        {label:"Mediterra", onClick:onBack},
        {label:"Osiris Plant Management"},
      ]}/>

      {/* Tarjetas de módulos */}
      <div style={{textAlign:"center",marginBottom:28}}>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.35)",letterSpacing:3,textTransform:"uppercase",marginBottom:8}}>
          Módulos disponibles
        </div>
        <h2 style={{margin:0,fontSize:20,fontWeight:900,color:"#fff"}}>¿Qué deseas gestionar?</h2>
      </div>

      <div style={{display:"flex",gap:20,justifyContent:"center",flexWrap:"wrap",padding:"0 8px"}}>
        {/* Ingresos */}
        <button onClick={()=>setSubApp("ingresos")}
          style={{
            background:"linear-gradient(135deg,#0f2d4a,#0f766e)",
            border:"1px solid rgba(255,255,255,0.15)",
            borderRadius:20,padding:"32px 36px",
            cursor:"pointer",width:280,textAlign:"left",
            boxShadow:"0 8px 32px rgba(0,0,0,0.3)",
            transition:"transform 0.15s,box-shadow 0.15s",
            position:"relative",
          }}
          onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-4px)";e.currentTarget.style.boxShadow="0 16px 48px rgba(0,0,0,0.4)";}}
          onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="0 8px 32px rgba(0,0,0,0.3)";}}>
          <div style={{fontSize:40,marginBottom:12}}>💰</div>
          <div style={{fontSize:18,fontWeight:800,color:"#fff",marginBottom:6}}>Ingresos Osiris</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.6)",lineHeight:1.5}}>
            Royalties, Fee Viveros, Total Pedidos y Resumen de cobros
          </div>
          {/* badges */}
          <div style={{display:"flex",gap:6,marginTop:14,flexWrap:"wrap"}}>
            {sinConfirmar>0&&(
              <span style={{background:"rgba(251,191,36,0.25)",color:"#fbbf24",borderRadius:20,
                padding:"2px 10px",fontSize:10,fontWeight:700,border:"1px solid rgba(251,191,36,0.4)"}}>
                {sinConfirmar} por confirmar
              </span>
            )}
            {alertasRC>0&&(
              <span style={{background:"rgba(239,68,68,0.25)",color:"#f87171",borderRadius:20,
                padding:"2px 10px",fontSize:10,fontWeight:700,border:"1px solid rgba(239,68,68,0.4)"}}>
                ⚠️ {alertasRC} alerta{alertasRC>1?"s":""}
              </span>
            )}
          </div>
          <div style={{position:"absolute",bottom:18,right:18,fontSize:20,color:"rgba(255,255,255,0.3)"}}>→</div>
        </button>

        {/* Contratos */}
        <button onClick={()=>setSubApp("contratos")}
          style={{
            background:"linear-gradient(135deg,#1e1b4b,#4338ca)",
            border:"1px solid rgba(255,255,255,0.15)",
            borderRadius:20,padding:"32px 36px",
            cursor:"pointer",width:280,textAlign:"left",
            boxShadow:"0 8px 32px rgba(0,0,0,0.3)",
            transition:"transform 0.15s,box-shadow 0.15s",
            position:"relative",
          }}
          onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-4px)";e.currentTarget.style.boxShadow="0 16px 48px rgba(0,0,0,0.4)";}}
          onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="0 8px 32px rgba(0,0,0,0.3)";}}>
          <div style={{fontSize:40,marginBottom:12}}>📋</div>
          <div style={{fontSize:18,fontWeight:800,color:"#fff",marginBottom:6}}>Control Contratos</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.6)",lineHeight:1.5}}>
            Gestión de contratos, firmas, anexos y condiciones comerciales
          </div>
          <div style={{display:"flex",gap:6,marginTop:14}}>
            <span style={{background:"rgba(99,102,241,0.3)",color:"#a5b4fc",borderRadius:20,
              padding:"2px 10px",fontSize:10,fontWeight:700,border:"1px solid rgba(99,102,241,0.4)"}}>
              {ctData.length} contratos
            </span>
            <span style={{background:`rgba(22,163,74,0.25)`,color:"#4ade80",borderRadius:20,
              padding:"2px 10px",fontSize:10,fontWeight:700,border:`1px solid rgba(22,163,74,0.4)`}}>
              {ctData.filter(c=>c.firmadoLicenciado&&c.firmadoOsiris).length} firmados
            </span>
          </div>
          <div style={{position:"absolute",bottom:18,right:18,fontSize:20,color:"rgba(255,255,255,0.3)"}}>→</div>
        </button>
      </div>

      {/* KPI resumen en el hub */}
      <div style={{marginTop:32,display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap",padding:"0 8px"}}>
        {[
          ["💵 Por cobrar",     $$(totPend),          "#fbbf24"],
          ["📦 Pedidos",        tpData.length,         "#60a5fa"],
          ["🌿 Royalty filas",  rpData.length,         "#34d399"],
          ["🌱 Fee Vivero",     fvData.filter(r=>!r.pagado).length+" pend.", "#f87171"],
        ].map(([l,v,c])=>(
          <div key={l} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",
            borderRadius:12,padding:"12px 20px",textAlign:"center",minWidth:120}}>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",marginBottom:4}}>{l}</div>
            <div style={{fontSize:16,fontWeight:800,color:c}}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );

  // ── CONTROL CONTRATOS ──────────────────────────────────────
  if(subApp==="contratos") return(
    <div style={{fontFamily:"sans-serif",background:"#0d1117",minHeight:"100vh",padding:"20px 20px 40px"}}>
      <NavBar breadcrumbItems={[
        {label:"Mediterra", onClick:onBack},
        {label:"Osiris Hub", onClick:()=>setSubApp(null)},
        {label:"Control Contratos"},
      ]}/>
      <div style={{background:"#fff",borderRadius:14,padding:20,boxShadow:"0 2px 10px #0001"}}>
        {canVerContratos
        ? <ControlContratos data={ctData} setData={setCt} clientes={clientes} setClientes={setClientes} can={canContratos}/>
        : <div style={{textAlign:"center",padding:40,color:"#94a3b8"}}>Sin acceso a Contratos</div>
      }
      </div>
    </div>
  );

  // ── INGRESOS OSIRIS ────────────────────────────────────────
  return (
    <div style={{fontFamily:"sans-serif",background:"#0d1117",minHeight:"100vh",padding:"20px 20px 40px"}}>
      <NavBar showPorCobrar breadcrumbItems={[
        {label:"Mediterra", onClick:onBack},
        {label:"Osiris Hub", onClick:()=>setSubApp(null)},
        {label:"Ingresos Osiris"},
      ]}/>

      {/* Sub-tabs */}
      <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
        {SUBTABS.map(({id,label,badge})=>(
          <button key={id} onClick={()=>setSubTab(id)}
            style={{padding:"7px 14px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:600,fontSize:12,
              background:subTab===id?"#0f2d4a":"#fff",color:subTab===id?"#fff":C.sl,
              boxShadow:subTab===id?"0 2px 8px #0f2d4a44":"0 1px 4px #0001",position:"relative"}}>
            {label}
            {badge>0&&<span style={{position:"absolute",top:-4,right:-4,background:"#ef4444",color:"#fff",borderRadius:"50%",width:16,height:16,fontSize:9,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>{badge}</span>}
          </button>
        ))}
      </div>

      {/* Maestro clientes accesible desde Ingresos también */}
      {can&&<div style={{marginBottom:16}}>
        <details style={{background:"#f0fdfa",border:"1px solid #99f6e4",borderRadius:10}}>
          <summary style={{padding:"10px 16px",cursor:"pointer",fontSize:12,fontWeight:700,color:"#0f766e"}}>👥 Maestro de Clientes</summary>
          <div style={{padding:"0 16px 16px"}}><MaestroClientes clientes={clientes} setClientes={setClientes} can={can}/></div>
        </details>
      </div>}
      {/* Contenido */}
      <div style={{background:"#fff",borderRadius:14,padding:20,boxShadow:"0 2px 10px #0001"}}>
        {subTab==="resumen"          &&<Resumen        rpData={rpData} feData={feData} rcData={rcData} fvData={fvData} tpData={tpData}/>}
        {subTab==="graficos"         &&<GraficosPlantas tpData={tpData} rpData={rpData}/>}
        {subTab==="totalPedidos"     &&<TotalPedidos     data={tpData} setData={setTp} rpData={rpData} setRpData={setRp} rcData={rcData} setRcData={setRc} fvData={fvData} setFvData={setFv} can={canIngresos} clientes={clientes}/>}
        {subTab==="royaltyPlanta"    &&<RoyaltyPlanta    data={rpData} setData={setRp} tpData={tpData} can={canIngresos} clientes={clientes}/>}
        {subTab==="feeEntrada"       &&<FeeEntrada       data={feData} setData={setFe} ctData={ctData} can={canIngresos} clientes={clientes}/>}
        {subTab==="royaltyComercial" &&<RoyaltyComercial data={rcData} setData={setRc} tpData={tpData} can={canIngresos} clientes={clientes}/>}
        {subTab==="feeViveros"       &&<FeeViveros       data={fvData} setData={setFv} can={canIngresos} clientes={clientes}/>}
      </div>
    </div>
  );
}
