/* eslint-disable */
// ============================================================
// OsirisModule.jsx — v4 — Módulo Osiris Plant · Mediterra
// ============================================================
import React, { useState, useCallback, useMemo, useEffect } from "react";

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
  // Sincronizar cuando val cambia externamente — solo si no estamos editando
  React.useEffect(()=>{if(!on) setTmp(val);},[val,on]);
  if(!can) return <span style={{fontSize:12,color:C.sl,wordBreak:"break-all"}}>{val!=null&&val!==""?val:<span style={{color:"#cbd5e1"}}>—</span>}</span>;
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
        onPaste={e=>{
          // Forzar guardado inmediato al pegar (especialmente para links)
          setTimeout(()=>{
            const pasted = e.target.value;
            setTmp(pasted);
            onChange(type==="number"?(parseFloat(pasted)||0):pasted);
          },50);
        }}
        onBlur={()=>{onChange(type==="number"?(parseFloat(tmp)||0):tmp);setOn(false);}}
        onKeyDown={e=>{if(e.key==="Enter"){onChange(type==="number"?(parseFloat(tmp)||0):tmp);setOn(false);}}}
        autoFocus
        style={{fontSize:12,borderRadius:6,border:"1px solid #93c5fd",padding:"3px 6px",background:"#eff6ff",width:"100%",maxWidth:type==="number"?90:400}}
      />
    );
  }
  return (
    <span onClick={()=>{setTmp(val);setOn(true);}}
      style={{fontSize:12,color:C.sl,cursor:"pointer",borderBottom:"1px dashed #93c5fd",paddingBottom:1,wordBreak:"break-all"}}>
      {val!=null&&val!==""?val:<span style={{color:"#cbd5e1"}}>—</span>}
    </span>
  );
}

function BadgePago({pagado,onChange,can,onFechaPago}) {
  const s = pagado
    ? {bg:"#dcfce7",col:"#16a34a",bdr:"#86efac",lbl:"✅ Pagado"}
    : {bg:"#fef3c7",col:"#d97706",bdr:"#fde047",lbl:"⏳ Por cobrar"};
  function handleClick(){
    if(!can) return;
    if(!pagado){
      // Cambiando a Pagado → pedir fecha
      const fecha = prompt("Fecha de pago (YYYY-MM-DD):",new Date().toISOString().slice(0,10));
      if(!fecha) return; // canceló
      onChange(true);
      if(onFechaPago) onFechaPago(fecha);
    } else {
      // Cambiando a Por cobrar
      onChange(false);
      if(onFechaPago) onFechaPago("");
    }
  }
  return (
    <span onClick={handleClick}
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

// Helper: selector cliente en modales — desplegable desde maestro + autocompletado país
function SelectorCliente({form,setForm,clientes,onSelect}){
  // Estado local para el valor del select — evita que re-renders del padre cierren el dropdown
  const [selVal,setSelVal]=useState("");
  return(
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      <label style={{fontSize:11,fontWeight:600,color:"#374151"}}>Cliente *</label>
      {clientes.length>0&&(
        <select value={selVal} onChange={e=>{
          setSelVal(e.target.value);
          const cli=clientes.find(c=>c.id===e.target.value);
          if(!cli)return;
          if(onSelect){
            onSelect(cli);
          } else {
            setForm(p=>({...p,
              cliente:cli.razonSocial||p.cliente,
              pais:cli.pais||p.pais,
            }));
          }
          // Reset después de seleccionar
          setTimeout(()=>setSelVal(""),50);
        }} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #93c5fd",fontSize:12,boxSizing:"border-box",color:"#2563eb"}}>
          <option value="">🔍 Seleccionar desde maestro de clientes...</option>
          {clientes.map(c=><option key={c.id} value={c.id}>
            {c.razonSocial}{c.nombreComercial&&c.nombreComercial!==c.razonSocial?` (${c.nombreComercial})`:""} — {c.pais}
          </option>)}
        </select>
      )}
      <input type="text" value={form.cliente||""} onChange={e=>setForm(p=>({...p,cliente:e.target.value}))}
        placeholder="O escribe el nombre del cliente..."
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

// ── Helper: fetch logo Osiris como base64 (una vez) ───────────────
let _logoCache = null;
async function getLogoBase64() {
  if(_logoCache) return _logoCache;
  try {
    const res = await fetch("/osiris-logo.jpg");
    if(!res.ok) return null;
    const blob = await res.blob();
    const b64 = await new Promise(resolve => {
      const r = new FileReader();
      r.onload = () => resolve(r.result.split(",")[1]);
      r.readAsDataURL(blob);
    });
    // Convertir base64 a ArrayBuffer para JSZip
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) buf[i] = bin.charCodeAt(i);
    _logoCache = {buffer: buf, ext: "jpeg"};
    return _logoCache;
  } catch { return null; }
}

// ── Helper: cargar JSZip una vez ──────────────────────────────────
async function ensureJSZip() {
  if(window.JSZip) return;
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

// ── Helper: exportar a Excel con logo, título, tabla y formato ──
// sections puede ser:
//   - {rows, headers, titulo}  (una sección simple, compatibilidad con llamadas viejas)
//   - Array de {titulo, rows, headers, subtitulo}  (múltiples secciones)
async function exportCSV(rowsOrSections, headers, nombre, opts={}) {
  const fecha = new Date().toISOString().slice(0,10);
  const fechaLarga = new Date().toLocaleDateString("es-CL", {year:"numeric",month:"long",day:"numeric"});

  // Normalizar entrada: soportar el formato antiguo (rows, headers, nombre)
  // o el nuevo (sections[], null, nombre, opts)
  let sections;
  if(Array.isArray(rowsOrSections) && headers && Array.isArray(headers)) {
    // Formato antiguo: (rows, headers, nombre)
    sections = [{titulo: nombre, rows: rowsOrSections, headers}];
  } else {
    sections = rowsOrSections;
  }

  const tituloDoc = opts.tituloDoc || nombre.replace(/_/g," ");
  const subtituloDoc = opts.subtituloDoc || "Osiris Plant Management · Grupo Mediterra";
  const filtrosInfo = opts.filtros || "";

  function colLetter(n) {
    let s = "";
    n++;
    while(n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
    return s;
  }

  function escXml(v) {
    return String(v ?? "")
      .replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  // Intentar cargar el logo
  const logo = await getLogoBase64().catch(()=>null);

  // ── Construir filas XML ───────────────────────────────────
  let rowsXml = "";
  let currentRow = 1;
  const tableParts = []; // [{ref, id, name, headers}]
  const merges = []; // cells merged ranges

  // Fila 1-4: espacio para logo + título
  // Fila 1 (vacía para logo), Fila 2 = título grande, Fila 3 = subtítulo, Fila 4 = fecha
  const maxCols = Math.max(...sections.map(s => s.headers.length));
  const lastTitleCol = colLetter(maxCols - 1);

  // Fila de logo (height alta para dejar espacio)
  rowsXml += `<row r="1" ht="58" customHeight="1"></row>`;
  currentRow = 2;

  // Fila Título
  rowsXml += `<row r="${currentRow}" ht="26" customHeight="1">`;
  rowsXml += `<c r="A${currentRow}" t="inlineStr" s="10"><is><t>${escXml(tituloDoc)}</t></is></c>`;
  rowsXml += `</row>`;
  merges.push(`A${currentRow}:${lastTitleCol}${currentRow}`);
  currentRow++;

  // Fila Subtítulo
  rowsXml += `<row r="${currentRow}" ht="18" customHeight="1">`;
  rowsXml += `<c r="A${currentRow}" t="inlineStr" s="11"><is><t>${escXml(subtituloDoc)}</t></is></c>`;
  rowsXml += `</row>`;
  merges.push(`A${currentRow}:${lastTitleCol}${currentRow}`);
  currentRow++;

  // Fila Fecha / Filtros
  const metaTxt = `Exportado: ${fechaLarga}${filtrosInfo?` · ${filtrosInfo}`:""}`;
  rowsXml += `<row r="${currentRow}" ht="16" customHeight="1">`;
  rowsXml += `<c r="A${currentRow}" t="inlineStr" s="12"><is><t>${escXml(metaTxt)}</t></is></c>`;
  rowsXml += `</row>`;
  merges.push(`A${currentRow}:${lastTitleCol}${currentRow}`);
  currentRow++;

  // Fila separadora
  rowsXml += `<row r="${currentRow}" ht="10" customHeight="1"></row>`;
  currentRow++;

  // ── Procesar cada sección ──
  sections.forEach((sec, sidx) => {
    const {titulo: secTitulo, rows: secRows, headers: secHeaders} = sec;
    const nCols = secHeaders.length;

    // Detectar columnas
    const isMoney = i => /mto|monto|usd|us\$|cobro|facturar|cobrar|total osiris|regali|iq|wht|neto|fact\b/i.test(secHeaders[i]);
    const isNum   = i => /n°\s*plantas|plantar|trim|año\b/i.test(secHeaders[i]);

    // Título de sección (si aplica)
    if(secTitulo && sections.length > 1) {
      rowsXml += `<row r="${currentRow}" ht="22" customHeight="1">`;
      rowsXml += `<c r="A${currentRow}" t="inlineStr" s="13"><is><t>${escXml(secTitulo)}</t></is></c>`;
      rowsXml += `</row>`;
      const lastSecCol = colLetter(nCols - 1);
      merges.push(`A${currentRow}:${lastSecCol}${currentRow}`);
      currentRow++;
    }

    // Headers de tabla
    const headerRow = currentRow;
    rowsXml += `<row r="${currentRow}" ht="22" customHeight="1">`;
    secHeaders.forEach((h, c) => {
      const addr = `${colLetter(c)}${currentRow}`;
      rowsXml += `<c r="${addr}" t="inlineStr" s="1"><is><t>${escXml(h)}</t></is></c>`;
    });
    rowsXml += `</row>`;
    currentRow++;

    // Data rows
    secRows.forEach((row, ri) => {
      const r = currentRow;
      const sBase = (ri % 2 === 0) ? 0 : 2;
      rowsXml += `<row r="${r}" ht="18" customHeight="1">`;
      secHeaders.forEach((_, c) => {
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
      currentRow++;
    });

    // Registrar tabla para esta sección (con filtros nativos)
    if(secRows.length > 0) {
      const lastCol = colLetter(nCols - 1);
      const tableRef = `A${headerRow}:${lastCol}${currentRow - 1}`;
      tableParts.push({
        id: sidx + 1,
        name: `Tabla${sidx + 1}`,
        ref: tableRef,
        headers: secHeaders,
      });
    }

    // Separador entre secciones
    if(sidx < sections.length - 1) {
      rowsXml += `<row r="${currentRow}" ht="12" customHeight="1"></row>`;
      currentRow++;
    }
  });

  // ── Anchos de columnas (basado en la sección más ancha) ──
  const colWidths = [];
  for(let c = 0; c < maxCols; c++) {
    let maxLen = 0;
    sections.forEach(sec => {
      if(c < sec.headers.length) {
        maxLen = Math.max(maxLen, String(sec.headers[c] ?? "").length);
        sec.rows.forEach(r => {
          maxLen = Math.max(maxLen, String(r[c] ?? "").length);
        });
      }
    });
    colWidths.push(Math.min(Math.max(maxLen + 3, 12), 45));
  }

  // ── Estilos ──
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="9">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><sz val="11"/><b/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><sz val="11"/><b/><color rgb="FF15803D"/><name val="Calibri"/></font>
    <font><sz val="11"/><b/><name val="Calibri"/></font>
    <font><sz val="20"/><b/><color rgb="FF0F2D4A"/><name val="Calibri"/></font>
    <font><sz val="12"/><i/><color rgb="FF64748B"/><name val="Calibri"/></font>
    <font><sz val="10"/><color rgb="FF94A3B8"/><name val="Calibri"/></font>
    <font><sz val="13"/><b/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
  </fonts>
  <fills count="7">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F2D4A"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE0F2F1"/></patternFill></fill>
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
  <cellXfs count="14">
    <xf numFmtId="0"  fontId="0" fillId="0" borderId="1" xfId="0"><alignment vertical="center"/></xf>
    <xf numFmtId="0"  fontId="1" fillId="2" borderId="0" xfId="0"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0"  fontId="0" fillId="3" borderId="1" xfId="0"><alignment vertical="center"/></xf>
    <xf numFmtId="164" fontId="3" fillId="4" borderId="1" xfId="0"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="1"  fontId="0" fillId="0" borderId="1" xfId="0"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0"  fontId="4" fillId="0" borderId="1" xfId="0"><alignment vertical="center"/></xf>
    <xf numFmtId="0"  fontId="4" fillId="3" borderId="1" xfId="0"><alignment vertical="center"/></xf>
    <xf numFmtId="0"  fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0"  fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0"  fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0"  fontId="5" fillId="0" borderId="0" xfId="0"><alignment horizontal="left" vertical="center" indent="1"/></xf>
    <xf numFmtId="0"  fontId="6" fillId="0" borderId="0" xfId="0"><alignment horizontal="left" vertical="center" indent="1"/></xf>
    <xf numFmtId="0"  fontId="7" fillId="0" borderId="0" xfId="0"><alignment horizontal="left" vertical="center" indent="1"/></xf>
    <xf numFmtId="0"  fontId="8" fillId="5" borderId="0" xfId="0"><alignment horizontal="left" vertical="center" indent="1"/></xf>
  </cellXfs>
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode='"US$" #,##0.00'/>
  </numFmts>
</styleSheet>`;

  const colsXml = `<cols>${colWidths.map((w, i) =>
    `<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`
  ).join("")}</cols>`;

  // Merges XML
  const mergesXml = merges.length > 0
    ? `<mergeCells count="${merges.length}">${merges.map(m=>`<mergeCell ref="${m}"/>`).join("")}</mergeCells>`
    : "";

  // Drawing reference (si hay logo)
  const drawingRef = logo ? `<drawing r:id="rId100"/>` : "";

  // Table parts XML
  const tablePartsXml = tableParts.length > 0
    ? `<tableParts count="${tableParts.length}">${tableParts.map((t,i)=>`<tablePart r:id="rId${200+i}"/>`).join("")}</tableParts>`
    : "";

  // Sheet XML
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
           xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews>
    <sheetView workbookViewId="0" showGridLines="0">
      <pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  ${colsXml}
  <sheetData>${rowsXml}</sheetData>
  ${mergesXml}
  ${drawingRef}
  ${tablePartsXml}
</worksheet>`;

  // Sheet rels (incluye drawing si hay logo + tables)
  let sheetRelsItems = "";
  if(logo) {
    sheetRelsItems += `<Relationship Id="rId100" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>`;
  }
  tableParts.forEach((t,i)=>{
    sheetRelsItems += `<Relationship Id="rId${200+i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table${t.id}.xml"/>`;
  });
  const sheetRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRelsItems}
</Relationships>`;

  // Drawing XML (para el logo)
  const drawingXml = logo ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <xdr:oneCellAnchor>
    <xdr:from>
      <xdr:col>0</xdr:col><xdr:colOff>95250</xdr:colOff>
      <xdr:row>0</xdr:row><xdr:rowOff>38100</xdr:rowOff>
    </xdr:from>
    <xdr:ext cx="1600200" cy="685800"/>
    <xdr:pic>
      <xdr:nvPicPr>
        <xdr:cNvPr id="1" name="Logo Osiris"/>
        <xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr>
      </xdr:nvPicPr>
      <xdr:blipFill>
        <a:blip r:embed="rId1"/>
        <a:stretch><a:fillRect/></a:stretch>
      </xdr:blipFill>
      <xdr:spPr>
        <a:xfrm><a:off x="0" y="0"/><a:ext cx="1600200" cy="685800"/></a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
      </xdr:spPr>
    </xdr:pic>
    <xdr:clientData/>
  </xdr:oneCellAnchor>
</xdr:wsDr>` : "";

  const drawingRels = logo ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.jpeg"/>
</Relationships>` : "";

  // Tablas nativas
  const tablesXml = {};
  tableParts.forEach(t => {
    tablesXml[t.id] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  id="${t.id}" name="${t.name}" displayName="${t.name}" ref="${t.ref}"
  totalsRowShown="0" headerRowCount="1">
  <autoFilter ref="${t.ref}"/>
  <tableColumns count="${t.headers.length}">
    ${t.headers.map((h,i)=>`<tableColumn id="${i+1}" name="${escXml(h)}"/>`).join("")}
  </tableColumns>
  <tableStyleInfo name="TableStyleMedium2"
    showFirstColumn="1" showLastColumn="0"
    showRowStripes="1" showColumnStripes="0"/>
</table>`;
  });

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
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  // Content types
  let contentOverrides = `
  <Override PartName="/xl/workbook.xml"           ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml"  ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml"             ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`;
  tableParts.forEach(t => {
    contentOverrides += `
  <Override PartName="/xl/tables/table${t.id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>`;
  });
  if(logo) {
    contentOverrides += `
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Override PartName="/xl/drawings/drawing1.xml"  ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`;
  }

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>${contentOverrides}
</Types>`;

  const pkgRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  // ── Empaquetar como ZIP (XLSX) ────────────────────────────
  await ensureJSZip();

  const zip = new window.JSZip();
  zip.file("[Content_Types].xml", contentTypes);
  zip.file("_rels/.rels", pkgRels);
  zip.file("xl/workbook.xml", wbXml);
  zip.file("xl/_rels/workbook.xml.rels", wbRels);
  zip.file("xl/worksheets/sheet1.xml", sheetXml);
  zip.file("xl/worksheets/_rels/sheet1.xml.rels", sheetRels);
  zip.file("xl/styles.xml", stylesXml);
  tableParts.forEach(t => {
    zip.file(`xl/tables/table${t.id}.xml`, tablesXml[t.id]);
  });
  if(logo) {
    zip.file("xl/drawings/drawing1.xml", drawingXml);
    zip.file("xl/drawings/_rels/drawing1.xml.rels", drawingRels);
    zip.file("xl/media/image1.jpeg", logo.buffer);
  }

  const blob = await zip.generateAsync({type:"blob", mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `${nombre}_${fecha}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);

  // Auditoría: registrar exportación
  const totalFilas = sections.reduce((s,sec)=>s+sec.rows.length, 0);
  window.auditLog&&window.auditLog("exportar", {
    modulo:"osiris",
    seccion: tituloDoc,
    descripcion: `Exportó Excel "${tituloDoc}" con ${totalFilas} registros${filtrosInfo?` · ${filtrosInfo}`:""}`,
  });
}

// ── Helper: barra de filtros + exportar reutilizable ──────────
function BarraFiltros({filtros, onExportar, exportLabel="📥 Exportar Excel"}) {
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
function TotalPedidos({data,setData,rpData,setRpData,rcData,setRcData,fvData,setFvData,can,clientes=[],onDeletePedido}) {
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
    regaliaVivero:"",
    cuotasVivero:[],        // [{label, pct, fechaPago, monto, tipo}] — cuotas manuales
    trimPagoVivero:"",añoPagoVivero:"",
    // Legacy (compatibilidad)
    pctAnticipo:60, nCuotasVivero:2, mesAnticipo:"",
    // Tandas de entrega
    tandas:[],               // [{fechaEntrega, nPlantas, nota}]
    // Proforma
    nProforma:"",
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

    // 2. Royalty Comercial — siempre crear fila (año siguiente al de entrega)
    // ha puede ser 0 o vacío → usuario lo completa después en la pestaña RC
    const añoRC = (pedido.añoEntrega||añoActual) + 1;
    const rcExiste = rcData.some(r=>r.tpId===tpId);
    if(!rcExiste) {
      setRcData(prev=>[...prev,{
        id:`rc_${tpId}`,tpId,
        cliente:pedido.cliente,pais:pedido.pais,
        ha:Number(pedido.ha)||0,usdHa:3000,
        añoCobro:añoRC,trimCobro:2,
        nFact:"",pagado:false,
        _generado:true,
      }]);
    }

    // 3. Fee Vivero — crear filas desde cuotasVivero[] (plan de pagos manual)
    const fvExiste = fvData.some(r=>r.tpId===tpId);
    if(!fvExiste) {
      const reg = pedido.regaliaVivero || regalias[pedido.vivero] || 0.45;
      const nPl = Number(pedido.nPlantas)||0;
      const total = nPl * reg;
      const proforma = pedido.nProforma||"";
      // Usar cuotasVivero si existen (nuevo formato), sino legacy
      const cuotasSource = pedido.cuotasVivero && pedido.cuotasVivero.length > 0
        ? pedido.cuotasVivero.map((cq,i)=>({
            id:`fv_cq${i}_${tpId}`,
            tipoPago:cq.label||`Cuota ${i+1}`,
            monto:cq.pct>0?Math.round(total*cq.pct/100):(Number(cq.monto)||0),
            fechaPago:cq.fechaPago||"",
          }))
        : [
            {id:`fv_oc_${tpId}`,tipoPago:"Anticipo (OC)",monto:total*((Number(pedido.pctAnticipo)||60)/100),fechaPago:""},
            {id:`fv_sd_${tpId}`,tipoPago:"Saldo",monto:total*(1-(Number(pedido.pctAnticipo)||60)/100),fechaPago:""},
          ];
      const trimPago = pedido.trimPagoVivero || trimPagoVivero(pedido.trimEntrega,pedido.añoEntrega).trim;
      const añoPago  = pedido.añoPagoVivero  || trimPagoVivero(pedido.trimEntrega,pedido.añoEntrega).año;
      const cuotas = cuotasSource;
      setFvData(prev=>[...prev,...cuotas.map(c=>({
        id:c.id,tpId,
        vivero:pedido.vivero||"Synergiabio",empresa:pedido.cliente,pais:pedido.pais,
        proforma,nPlantas:nPl,regalia:reg,totalOsiris:total,
        tipoPago:c.tipoPago,montoFact:c.monto,
        trimPago,añoPago,fechaPago:c.fechaPago||"",
        fechaFact:"",nFact:"",pagado:false,_fromPedido:true,
      }))]);
    }
  }

  // Actualizar estado de un pedido
  function upd(id,c,v) {
    setData(prev=>prev.map(r=>{
      if(r.id!==id) return r;
      // Solo auditar si realmente cambió
      if(String(r[c]||"") !== String(v||"")) {
        window.auditLog&&window.auditLog("editar", {modulo:"osiris", seccion:"Total Pedidos",
          descripcion:`Editó pedido de "${r.cliente}" · ${r.pais}: campo ${c}`,
          registroId:id, campo:c,
          valorAnterior:String(r[c]||""), valorNuevo:String(v||"")});
      }
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
    window.auditLog&&window.auditLog("crear", {modulo:"osiris", seccion:"Total Pedidos",
      descripcion:`Creó pedido para ${nuevo.cliente} · ${nuevo.pais} · ${nuevo.nPlantas} plantas · ${nuevo.añoEntrega} T${nuevo.trimEntrega}`,
      registroId:nuevo.id});
    if(nuevo.estado==="Confirmado") propagarPedido(nuevo);
    setModal(false);
    setForm(formVacio);
  }


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
          <div style={{fontSize:11,color:"#64748b",fontStyle:"italic",alignSelf:"center",padding:"6px 12px",background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:6}}>
            🔗 Datos derivados de Contratos Productores
          </div>
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
            r.regaliaVivero||"",r.pctAnticipo||60,r.nCuotasVivero||2,
            r.mesAnticipo||"",r.nProforma||"",
            (r.tandas||[]).length>0?(r.tandas||[]).map(t=>`${t.fechaEntrega} (${t.nPlantas}pl)`).join(" | "):"",
            `T${r.trimPagoVivero} ${r.añoPagoVivero}`]),
          ["Cliente","País","Vivero","Fecha Pedido","Año Entrega","Trim.","N° Plantas","Há","Estado",
           "Regalía US$/Pl","% Anticipo","N° Cuotas","Mes Anticipo","Proforma","Tandas","Trim. Pago Vivero"],
          "TotalPedidos",
          {
            tituloDoc: "Total Pedidos",
            subtituloDoc: "Osiris Plant Management · Grupo Mediterra · Pedidos de Plantas",
            filtros: `${filtrado.length} pedidos exportados`,
          }
        )}
      />

      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",background:"#fff",borderRadius:10,overflow:"hidden"}}>
          <Th cols={[
            {l:"Estado",c:true,w:130},{l:"Cliente",w:130},{l:"País",w:70},{l:"Vivero",w:120},
            {l:"Fecha Pedido",c:true,w:110},{l:"Entrega",c:true,w:100},
            {l:"N° Plantas",c:true,w:100},{l:"Há",c:true,w:70},
            {l:"Regalía/Pl",c:true,w:90},{l:"% Antic.",c:true,w:80},
            {l:"Cuotas",c:true,w:70},{l:"Mes Antic.",c:true,w:100},
            {l:"Proforma",c:true,w:110},{l:"Tandas",c:true,w:80},
            {l:"Trim. Pago",c:true,w:100},
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
                  <NombreCliente nombre={r.cliente} clientes={clientes} onChange={v=>upd(r.id,"cliente",v)} can={can&&!r._fromContract}/>
                </td>
                <td style={{padding:"7px 10px",fontSize:12}}><Cell val={r.pais} onChange={v=>upd(r.id,"pais",v)} opts={PAISES} can={can&&!r._fromContract}/></td>
                <td style={{padding:"7px 10px",fontSize:11}}><Cell val={r.vivero||""} onChange={v=>upd(r.id,"vivero",v)} opts={VIVEROS} can={can}/></td>
                <td style={{padding:"7px 10px",textAlign:"center",fontSize:11}}>
                  <Cell val={r.fechaPedido||""} onChange={v=>upd(r.id,"fechaPedido",v)} type="date" can={can}/>
                </td>
                <td style={{padding:"7px 10px",textAlign:"center",fontWeight:600,color:C.teal,fontSize:12}}>
                  {r.añoEntrega} T{r.trimEntrega}
                </td>
                <td style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:C.teal}}>
                  <Cell val={r.nPlantas} onChange={v=>upd(r.id,"nPlantas",parseFloat(v)||0)} type="number" can={can&&!r._fromContract}/>
                </td>
                <td style={{padding:"7px 10px",textAlign:"right"}}>
                  <Cell val={r.ha||""} onChange={v=>upd(r.id,"ha",parseFloat(v)||0)} type="number" can={can&&!r._fromContract} ph="0"/>
                </td>
                <td style={{padding:"7px 10px",textAlign:"center",fontSize:11}}>
                  <Cell val={r.regaliaVivero||regalias[r.vivero]||0.45} onChange={v=>upd(r.id,"regaliaVivero",parseFloat(v)||0)} type="number" can={can}/>
                </td>
                <td style={{padding:"7px 10px",textAlign:"center",fontSize:11}}>
                  <Cell val={r.pctAnticipo||60} onChange={v=>upd(r.id,"pctAnticipo",parseFloat(v)||60)} type="number" can={can}/>
                  <span style={{fontSize:9,color:C.gris}}>%</span>
                </td>
                <td style={{padding:"6px 10px",textAlign:"center",fontSize:11,color:C.azul,fontWeight:700}}>
                  {r.nCuotasVivero||2}
                </td>
                <td style={{padding:"6px 10px",textAlign:"center",fontSize:11,color:C.mo}}>
                  {r.mesAnticipo||"—"}
                </td>
                <td style={{padding:"6px 10px",textAlign:"center",fontSize:11}}>
                  <Cell val={r.nProforma||""} onChange={v=>upd(r.id,"nProforma",v)} can={can} ph="PRF-001"/>
                </td>
                <td style={{padding:"6px 10px",textAlign:"center",fontSize:11}}>
                  {(r.tandas||[]).length>0
                    ? <span style={{background:"#dbeafe",color:"#1d4ed8",borderRadius:20,padding:"2px 8px",fontSize:10,fontWeight:700}}>
                        {(r.tandas||[]).length} tanda{(r.tandas||[]).length>1?"s":""}
                      </span>
                    : <span style={{color:C.gris,fontSize:10}}>—</span>
                  }
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
                  {r._fromContract?(
                    <span title="Eliminar el contrato productor para borrar este registro" style={{color:"#94a3b8",fontSize:14}}>🔒</span>
                  ):(
                  <button onClick={()=>{
                    if(!window.confirm(`¿Eliminar pedido de "${r.cliente}"?\nTambién se eliminarán las filas vinculadas en Royalty/Planta, Royalty Comercial y Fee Vivero.`))return;
                    const id=r.id;
                    window.auditLog&&window.auditLog("eliminar", {modulo:"osiris", seccion:"Total Pedidos",
                      descripcion:`Eliminó pedido de "${r.cliente}" (${r.pais} · ${r.nPlantas} plantas · ${r.añoEntrega}). También se eliminaron registros vinculados en RP/RC/FV`,
                      registroId:id});
                    // Eliminar atómicamente via prop del padre (evita race conditions)
                    if(onDeletePedido){ onDeletePedido(id); }
                    else {
                      setData(prev=>prev.filter(x=>x.id!==id));
                      setRpData(prev=>prev.filter(x=>x.tpId!==id));
                      setRcData(prev=>prev.filter(x=>x.tpId!==id));
                      setFvData(prev=>prev.filter(x=>x.tpId!==id));
                    }
                  }}
                    style={{background:"#fee2e2",border:"none",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:12,color:"#991b1b",fontWeight:700}}>×</button>
                  )}
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
                <SelectorCliente form={form} setForm={setForm} clientes={clientes} onSelect={cli=>setForm(prev=>calcularDefaults({...prev,cliente:cli.razonSocial||prev.cliente,pais:cli.pais||prev.pais}))}/>
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
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{fontSize:12,fontWeight:700,color:C.verde}}>🏭 Fee Vivero</div>
                {form.nPlantas&&form.regaliaVivero&&(
                  <div style={{fontSize:11,color:C.verde,fontWeight:700}}>
                    Total: US${((Number(form.nPlantas)||0)*(Number(form.regaliaVivero)||0)).toLocaleString("es-CL",{minimumFractionDigits:0})}
                    {(form.cuotasVivero||[]).length>0&&<span style={{color:C.azul,marginLeft:6,fontSize:10}}>· {(form.cuotasVivero||[]).length} cuota{(form.cuotasVivero||[]).length>1?"s":""}</span>}
                  </div>
                )}
              </div>

              {/* Regalía */}
              <div style={{marginBottom:12}}>
                <label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>Regalía US$/planta</label>
                <input type="number" step="0.01" value={form.regaliaVivero||""} onChange={e=>setF("regaliaVivero",e.target.value)}
                  style={{width:200,padding:"7px 10px",borderRadius:8,border:"1px solid #86efac",fontSize:13,boxSizing:"border-box",outline:"none"}}/>
              </div>

              {/* Cuotas manuales */}
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#374151"}}>Plan de Pagos</div>
                  <div style={{display:"flex",gap:6}}>
                    <button type="button"
                      onClick={()=>{
                        const total=(Number(form.nPlantas)||0)*(Number(form.regaliaVivero)||0);
                        setF("cuotasVivero",[...(form.cuotasVivero||[]),{label:"Anticipo",pct:60,fechaPago:"",monto:Math.round(total*0.6),tipo:"Anticipo"}]);
                      }}
                      style={{fontSize:11,padding:"3px 10px",borderRadius:6,border:"1px dashed #86efac",background:"transparent",color:C.verde,cursor:"pointer"}}>
                      + Anticipo
                    </button>
                    <button type="button"
                      onClick={()=>{
                        const total=(Number(form.nPlantas)||0)*(Number(form.regaliaVivero)||0);
                        setF("cuotasVivero",[...(form.cuotasVivero||[]),{label:"Saldo",pct:40,fechaPago:"",monto:Math.round(total*0.4),tipo:"Saldo"}]);
                      }}
                      style={{fontSize:11,padding:"3px 10px",borderRadius:6,border:"1px dashed #3b82f6",background:"transparent",color:C.azul,cursor:"pointer"}}>
                      + Saldo
                    </button>
                    <button type="button"
                      onClick={()=>{
                        const total=(Number(form.nPlantas)||0)*(Number(form.regaliaVivero)||0);
                        const n=(form.cuotasVivero||[]).length+1;
                        setF("cuotasVivero",[...(form.cuotasVivero||[]),{label:`Cuota ${n}`,pct:0,fechaPago:"",monto:0,tipo:"Cuota"}]);
                      }}
                      style={{fontSize:11,padding:"3px 10px",borderRadius:6,border:"1px dashed #9ca3af",background:"transparent",color:C.gris,cursor:"pointer"}}>
                      + Cuota
                    </button>
                  </div>
                </div>

                {(form.cuotasVivero||[]).length===0&&(
                  <div style={{fontSize:11,color:"#94a3b8",fontStyle:"italic",padding:"8px 0"}}>
                    Agrega cuotas de pago — Anticipo, Saldo u otras cuotas personalizadas
                  </div>
                )}

                {/* Header */}
                {(form.cuotasVivero||[]).length>0&&(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 80px 80px 1fr auto",gap:6,marginBottom:4}}>
                    {["Descripción","% del total","Monto US$","Fecha de pago",""].map(h=>(
                      <div key={h} style={{fontSize:10,color:C.gris,fontWeight:600}}>{h}</div>
                    ))}
                  </div>
                )}

                {(form.cuotasVivero||[]).map((cq,ci)=>{
                  const totalBase=(Number(form.nPlantas)||0)*(Number(form.regaliaVivero)||0);
                  const montoCalc=cq.pct>0?Math.round(totalBase*cq.pct/100):(cq.monto||0);
                  const pctRestante=100-(form.cuotasVivero||[]).filter((_,j)=>j!==ci).reduce((s,c)=>s+(Number(c.pct)||0),0);
                  return (
                  <div key={ci} style={{display:"grid",gridTemplateColumns:"1fr 80px 80px 1fr auto",gap:6,marginBottom:6,alignItems:"center"}}>
                    <input type="text" value={cq.label||""}
                      onChange={e=>{const arr=[...(form.cuotasVivero||[])];arr[ci]={...cq,label:e.target.value};setF("cuotasVivero",arr);}}
                      placeholder="Ej: Anticipo OC"
                      style={{padding:"6px 8px",borderRadius:6,border:`1px solid ${cq.tipo==="Anticipo"?"#86efac":"#bfdbfe"}`,background:"#fff",fontSize:12,outline:"none"}}/>
                    <div style={{display:"flex",alignItems:"center",gap:2}}>
                      <input type="number" min="0" max="100" value={cq.pct||""}
                        onChange={e=>{const arr=[...(form.cuotasVivero||[])];const pct=Number(e.target.value)||0;arr[ci]={...cq,pct,monto:Math.round(totalBase*pct/100)};setF("cuotasVivero",arr);}}
                        placeholder={String(Math.round(pctRestante))}
                        style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",background:"#fff",fontSize:12,outline:"none",textAlign:"right"}}/>
                      <span style={{fontSize:10,color:C.gris}}>%</span>
                    </div>
                    <div style={{padding:"6px 8px",borderRadius:6,border:"1px solid #e2e8f0",background:"#f8fafc",fontSize:12,textAlign:"right",color:C.verde,fontWeight:700}}>
                      {montoCalc>0?`$${montoCalc.toLocaleString("es-CL")}`:"—"}
                    </div>
                    <input type="date" value={cq.fechaPago||""}
                      onChange={e=>{const arr=[...(form.cuotasVivero||[])];arr[ci]={...cq,fechaPago:e.target.value};setF("cuotasVivero",arr);}}
                      style={{padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",background:"#fff",fontSize:12,outline:"none"}}/>
                    <button type="button" onClick={()=>setF("cuotasVivero",(form.cuotasVivero||[]).filter((_,j)=>j!==ci))}
                      style={{padding:"4px 8px",borderRadius:6,background:"#fee2e2",border:"none",color:"#991b1b",cursor:"pointer",fontSize:11}}>×</button>
                  </div>
                  );
                })}

                {/* Resumen % */}
                {(form.cuotasVivero||[]).length>0&&(()=>{
                  const pctTotal=(form.cuotasVivero||[]).reduce((s,c)=>s+(Number(c.pct)||0),0);
                  const montoTotal=(form.cuotasVivero||[]).reduce((s,c)=>s+(c.pct>0?Math.round(((Number(form.nPlantas)||0)*(Number(form.regaliaVivero)||0))*(Number(c.pct)||0)/100):(c.monto||0)),0);
                  return (
                    <div style={{display:"flex",gap:12,padding:"6px 8px",background:"#fff",borderRadius:6,border:"1px solid #86efac",fontSize:11,marginTop:4}}>
                      <span style={{color:pctTotal===100?C.verde:"#dc2626",fontWeight:700}}>{pctTotal}% asignado {pctTotal===100?"✓":`(falta ${100-pctTotal}%)`}</span>
                      <span style={{color:C.verde,fontWeight:700}}>Total cuotas: US${montoTotal.toLocaleString("es-CL")}</span>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Proforma */}
            <div style={{marginTop:12,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>N° Proforma</label>
                <input type="text" value={form.nProforma||""} onChange={e=>setF("nProforma",e.target.value)}
                  placeholder="Ej: PRF-2026-001"
                  style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",outline:"none"}}/>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>Fecha Proforma</label>
                <input type="date" value={form.fechaProforma||""} onChange={e=>setF("fechaProforma",e.target.value)}
                  style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",outline:"none"}}/>
              </div>
            </div>

            {/* Tandas de entrega */}
            <div style={{marginTop:12,background:"#eff6ff",borderRadius:10,padding:"14px 16px",border:"1px solid #bfdbfe"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontSize:12,fontWeight:700,color:"#1d4ed8"}}>📦 Tandas de Entrega</div>
                <button type="button" onClick={()=>setF("tandas",[...(form.tandas||[]),{fechaEntrega:"",nPlantas:"",nota:""}])}
                  style={{fontSize:11,padding:"3px 10px",borderRadius:6,border:"1px dashed #93c5fd",background:"transparent",color:"#1d4ed8",cursor:"pointer"}}>
                  + Agregar tanda
                </button>
              </div>
              {(form.tandas||[]).length===0&&(
                <div style={{fontSize:11,color:"#94a3b8"}}>Sin tandas definidas — entrega única en Trim. {form.trimEntrega} {form.añoEntrega}</div>
              )}
              {(form.tandas||[]).map((t,ti)=>(
                <div key={ti} style={{display:"grid",gridTemplateColumns:"1fr 1fr 2fr auto",gap:8,marginBottom:6,alignItems:"end"}}>
                  <div>
                    <label style={{fontSize:10,color:"#64748b",display:"block",marginBottom:2}}>Fecha entrega</label>
                    <input type="date" value={t.fechaEntrega||""} onChange={e=>{const arr=[...(form.tandas||[])];arr[ti]={...t,fechaEntrega:e.target.value};setF("tandas",arr);}}
                      style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid #bfdbfe",fontSize:12,outline:"none"}}/>
                  </div>
                  <div>
                    <label style={{fontSize:10,color:"#64748b",display:"block",marginBottom:2}}>N° plantas</label>
                    <input type="number" value={t.nPlantas||""} placeholder="0" onChange={e=>{const arr=[...(form.tandas||[])];arr[ti]={...t,nPlantas:e.target.value};setF("tandas",arr);}}
                      style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid #bfdbfe",fontSize:12,outline:"none"}}/>
                  </div>
                  <div>
                    <label style={{fontSize:10,color:"#64748b",display:"block",marginBottom:2}}>Nota</label>
                    <input type="text" value={t.nota||""} placeholder="Variedad, condición..." onChange={e=>{const arr=[...(form.tandas||[])];arr[ti]={...t,nota:e.target.value};setF("tandas",arr);}}
                      style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid #bfdbfe",fontSize:12,outline:"none"}}/>
                  </div>
                  <button type="button" onClick={()=>setF("tandas",(form.tandas||[]).filter((_,j)=>j!==ti))}
                    style={{padding:"5px 8px",borderRadius:6,background:"#fee2e2",border:"none",color:"#991b1b",cursor:"pointer",fontSize:11}}>×</button>
                </div>
              ))}
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
    // Plan de pago
    planPago:false,     // true = pago en cuotas
    nCuotas:2,          // número de cuotas
    cuotas:[],          // [{mes,pct,monto,pagado,nFact}]
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
      if(String(r[c]||"") !== String(v||"")) {
        window.auditLog&&window.auditLog("editar", {modulo:"osiris", seccion:"Royalty Planta",
          descripcion:`Editó royalty/planta de "${r.cliente}" · ${r.pais}: campo ${c}`,
          registroId:id, campo:c,
          valorAnterior:String(r[c]||""), valorNuevo:String(v||"")});
      }
      const updated={...r,[c]:v};
      // Si se ingresa N° factura, marcar como Facturado automáticamente
      if(c==="nFact"&&v&&String(v).trim()!=="") updated.facturado=true;
      return updated;
    }));
  }

  function agregar(){
    if(!form.cliente.trim()){alert("Cliente es obligatorio.");return;}
    const nPl=parseFloat(form.nPlantas)||0;
    const usd=parseFloat(form.usdPlanta)||0;
    // Si hay plan de pago con cuotas, guardar cuotas calculadas
    const cuotasCalc = form.planPago && (form.cuotas||[]).length>0
      ? form.cuotas.map((c,i)=>({...c,id:`rpc_${Date.now()}_${i}`,monto:nPl*usd*(c.pct||0)/100}))
      : [];
    const id = `rp_${Date.now()}`;
    setData(prev=>[...prev,{
      ...form,id,
      nPlantas:nPl, usdPlanta:usd,
      cuotas:cuotasCalc,
    }]);
    window.auditLog&&window.auditLog("crear", {modulo:"osiris", seccion:"Royalty Planta",
      descripcion:`Creó royalty/planta para "${form.cliente}" · ${form.pais} · ${nPl} plantas × $${usd}/pl`,
      registroId:id});
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
        <div style={{fontSize:11,color:"#64748b",fontStyle:"italic",alignSelf:"center",padding:"6px 12px",background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:6}}>
          🔗 Derivado de Contratos Productores
        </div>
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
          "RoyaltyPlanta",
          {
            tituloDoc: "Royalty por Planta",
            subtituloDoc: "Osiris Plant Management · Grupo Mediterra",
            filtros: `${filtrado.length} registros exportados`,
          }
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
                    <NombreCliente nombre={r.cliente} clientes={clientes} onChange={v=>upd(r.id,"cliente",v)} can={can&&!r._fromContract}/>
                  </td>
                  <td style={{padding:"7px 10px",fontSize:12}}><Cell val={r.pais} onChange={v=>upd(r.id,"pais",v)} opts={PAISES} can={can&&!r._fromContract}/></td>
                  <td style={{padding:"7px 10px",fontSize:11}}><Cell val={r.vivero||""} onChange={v=>upd(r.id,"vivero",v)} opts={VIVEROS} can={can&&!r._fromContract}/></td>
                  <td style={{padding:"7px 10px",textAlign:"center",fontSize:12,color:C.gris}}>{r.añoEntrega||r.año||"—"}</td>
                  <td style={{padding:"7px 10px",textAlign:"right",fontWeight:600}}><Cell val={r.nPlantas} onChange={v=>upd(r.id,"nPlantas",parseFloat(v)||0)} type="number" can={can&&!r._fromContract}/></td>
                  <td style={{padding:"7px 10px",textAlign:"center"}}><Cell val={r.usdPlanta||""} onChange={v=>upd(r.id,"usdPlanta",parseFloat(v)||0)} type="number" can={can&&!r._fromContract} ph="0.00"/></td>
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
                    <BadgePago pagado={r.pagado} onChange={v=>upd(r.id,"pagado",v)} onFechaPago={f=>upd(r.id,"fechaPago",f)} can={can}/>
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"center",fontSize:12}}>
                    <Cell val={r.fechaPago||""} onChange={v=>upd(r.id,"fechaPago",v)} type="date" can={can}/>
                  </td>
                  {can&&<td style={{padding:"4px 6px",textAlign:"center"}}>
                    {r._fromContract?(
                      <span title="Eliminar el contrato productor para borrar este registro" style={{color:"#94a3b8",fontSize:14}}>🔒</span>
                    ):(
                    <button onClick={()=>{
                      if(!window.confirm(`¿Eliminar royalty de "${r.cliente}"?`))return;
                      window.auditLog&&window.auditLog("eliminar", {modulo:"osiris", seccion:"Royalty Planta",
                        descripcion:`Eliminó royalty/planta de "${r.cliente}" · ${r.pais} · ${r.nPlantas||0} plantas`,
                        registroId:r.id});
                      setData(prev=>prev.filter(x=>x.id!==r.id));
                    }}
                      style={{background:"#fee2e2",border:"none",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:12,color:"#991b1b",fontWeight:700}}>×</button>
                    )}
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
            {/* Plan de Pago en Cuotas */}
            <div style={{marginTop:14,background:"#eff6ff",borderRadius:10,padding:"12px 14px",border:"1px solid #bfdbfe"}}>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,fontWeight:600,color:"#1d4ed8",marginBottom:8}}>
                <input type="checkbox" checked={form.planPago||false} onChange={()=>setForm(p=>({...p,planPago:!p.planPago,cuotas:[]}))}/>
                📅 Plan de pago en cuotas
              </label>
              {form.planPago&&(
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                    <label style={{fontSize:11,fontWeight:600,color:"#374151"}}>N° cuotas:</label>
                    <select value={form.nCuotas||2} onChange={e=>{
                      const n=Number(e.target.value);
                      const total=(Number(form.nPlantas)||0)*(Number(form.usdPlanta)||0);
                      const pctPorCuota=Math.round(100/n);
                      const cuotas=Array.from({length:n},(_,i)=>({
                        mes:"",pct:i<n-1?pctPorCuota:100-(pctPorCuota*(n-1)),
                        monto:total/n,pagado:false,nFact:"",
                      }));
                      setForm(p=>({...p,nCuotas:n,cuotas}));
                    }} style={{padding:"4px 8px",borderRadius:6,border:"1px solid #93c5fd",fontSize:12,outline:"none"}}>
                      {[2,3,4,6,12].map(n=><option key={n} value={n}>{n} cuotas</option>)}
                    </select>
                    <span style={{fontSize:11,color:"#64748b"}}>
                      Total: {$$(((Number(form.nPlantas)||0)*(Number(form.usdPlanta)||0)))}
                    </span>
                  </div>
                  {(form.cuotas||[]).map((c,ci)=>(
                    <div key={ci} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:6,alignItems:"end"}}>
                      <div>
                        <label style={{fontSize:10,color:"#64748b",display:"block",marginBottom:2}}>Mes cuota {ci+1}</label>
                        <select value={c.mes||""} onChange={e=>{const arr=[...(form.cuotas||[])];arr[ci]={...c,mes:e.target.value};setForm(p=>({...p,cuotas:arr}));}}
                          style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid #93c5fd",fontSize:11,outline:"none"}}>
                          <option value="">— mes —</option>
                          {["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"].map(m=>(
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{fontSize:10,color:"#64748b",display:"block",marginBottom:2}}>% cuota</label>
                        <input type="number" min="0" max="100" value={c.pct||""} onChange={e=>{const arr=[...(form.cuotas||[])];arr[ci]={...c,pct:Number(e.target.value),monto:((Number(form.nPlantas)||0)*(Number(form.usdPlanta)||0))*(Number(e.target.value)||0)/100};setForm(p=>({...p,cuotas:arr}));}}
                          style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid #93c5fd",fontSize:11,outline:"none"}}/>
                      </div>
                      <div>
                        <label style={{fontSize:10,color:"#64748b",display:"block",marginBottom:2}}>Monto US$</label>
                        <input readOnly value={$$(c.monto||0)}
                          style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid #e2e8f0",fontSize:11,background:"#f8fafc",outline:"none"}}/>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

  // feData ya viene pre-calculado desde OsirisModule (incluye contratos auto-generados)
  // No necesitamos computar dataConSync aquí
  const dataConSync = data;

  const filtrado=dataConSync.filter(r=>
    (filtroPais==="Todos"||r.pais===filtroPais)&&
    (filtroCobro==="Todos"||(filtroCobro==="Pagado"?r.pagado:!r.pagado))&&
    (!filtroCli||r.cliente?.toLowerCase().includes(filtroCli.toLowerCase()))
  );

  const totCobrado=filtrado.filter(r=>r.pagado).reduce((s,r)=>s+(r.montoUSD||0),0);
  const totPend=filtrado.filter(r=>!r.pagado).reduce((s,r)=>s+(r.montoUSD||0),0);

  function upd(id,c,v){
    // Buscar en los datos RAW de Supabase (osirisData.feeEntrada)
    // data es feData (vista calculada), setData es setFe (actualiza raw)
    const fromSync = dataConSync.find(r=>r.id===id);

    setData(prev=>{
      // Buscar si ya existe en raw por id o ctId
      const ctId = fromSync?.ctId;
      const existeIdx = prev.findIndex(r=>r.id===id || (ctId && r.ctId===ctId));
      
      if(existeIdx >= 0) {
        // Ya existe en raw → actualizar
        const updated = [...prev];
        const old = updated[existeIdx];
        if(String(old[c]||"") !== String(v||"")) {
          window.auditLog&&window.auditLog("editar", {modulo:"osiris", seccion:"Fee Entrada",
            descripcion:`Editó fee entrada de "${old.cliente||fromSync?.cliente}" · ${old.pais||fromSync?.pais}: campo ${c}`,
            registroId:id, campo:c,
            valorAnterior:String(old[c]||""), valorNuevo:String(v||"")});
        }
        updated[existeIdx] = {...old, [c]:v};
        return updated;
      } else {
        // No existe en raw → crear desde la vista calculada
        if(fromSync) {
          window.auditLog&&window.auditLog("editar", {modulo:"osiris", seccion:"Fee Entrada",
            descripcion:`Editó fee entrada de "${fromSync.cliente}" · ${fromSync.pais}: campo ${c} (auto-generado desde contrato)`,
            registroId:id, campo:c,
            valorAnterior:String(fromSync[c]||""), valorNuevo:String(v||"")});
          // Guardar solo los campos que necesita Supabase (sin _fromContract y otros transitorios)
          return [...prev, {
            id: fromSync.id,
            ctId: fromSync.ctId,
            cliente: fromSync.cliente,
            pais: fromSync.pais,
            montoUSD: fromSync.montoUSD,
            detalle: fromSync.detalle,
            nFact: fromSync.nFact || "",
            pagado: fromSync.pagado || false,
            fechaPago: fromSync.fechaPago || "",
            [c]: v,
          }];
        }
        return prev;
      }
    });
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
          "FeeEntrada",
          {
            tituloDoc: "Fee de Entrada (Contract Fee)",
            subtituloDoc: "Osiris Plant Management · Grupo Mediterra",
            filtros: `${filtrado.length} registros exportados`,
          }
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
                    <BadgePago pagado={r.pagado} onChange={v=>upd(r.id,"pagado",v)} onFechaPago={f=>upd(r.id,"fechaPago",f)} can={can}/>
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

  // Sync reactiva con Total Pedidos + filtrar huérfanos
  const dataConSync = useMemo(()=>{
    const tpMap = {};
    (tpData||[]).forEach(r=>{ tpMap[r.id]=r; });
    return data
      .filter(r=> !r.tpId || tpMap[r.tpId])  // eliminar huérfanos
      .map(r=>{
        if(!r.tpId || !tpMap[r.tpId]) return r;
        const tp = tpMap[r.tpId];
        // Sync cliente, pais. Ha solo si el RC fue auto-generado y no ha sido editado por el usuario
        const haSync = r._generado && !r._haEditado ? (Number(tp.ha)||0) : r.ha;
        return {...r, cliente:tp.cliente, pais:tp.pais, ha:haSync};
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

  function upd(id,c,v){
    setData(prev=>prev.map(r=>{
      if(r.id!==id) return r;
      if(String(r[c]||"") !== String(v||"")) {
        window.auditLog&&window.auditLog("editar", {modulo:"osiris", seccion:"Royalty Comercial",
          descripcion:`Editó royalty comercial de "${r.cliente}" · ${r.pais} ${r.añoCobro||""}: campo ${c}`,
          registroId:id, campo:c,
          valorAnterior:String(r[c]||""), valorNuevo:String(v||"")});
      }
      return r.id===id?{...r,[c]:v,...(c==="ha"?{_haEditado:true}:{})}:r;
    }));
  }

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
    window.auditLog&&window.auditLog("crear", {modulo:"osiris", seccion:"Royalty Comercial",
      descripcion:`Creó royalty comercial para "${form.cliente}" · ${form.pais} · ${form.ha} há × $${form.usdHa||3000}/há · ${nAños} años desde ${añoBase} T${trimBase}`,
      registroId:nuevos[0]?.id});
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
        <div style={{fontSize:11,color:"#64748b",fontStyle:"italic",alignSelf:"center",padding:"6px 12px",background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:6}}>
          🔗 Derivado de Contratos Productores
        </div>
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
          "RoyaltyComercial",
          {
            tituloDoc: "Royalty Comercial",
            subtituloDoc: "Osiris Plant Management · Grupo Mediterra · Royalty por hectárea",
            filtros: `${filtrado.length} registros exportados`,
          }
        )}
      />

      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",background:"#fff",borderRadius:10,overflow:"hidden"}}>
          <Th cols={[
            {l:"Cliente",w:130},{l:"País",w:80},{l:"Há",c:true,w:80},{l:"US$/Há",c:true,w:90},
            {l:"Año cobro",c:true,w:90},{l:"Trim.",c:true,w:80},{l:"Mto.Facturar",c:true,w:120},{l:"WHT",c:true,w:70},
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
                    <NombreCliente nombre={r.cliente} clientes={clientes} onChange={v=>upd(r.id,"cliente",v)} can={can&&!r._fromContract}/>
                  </td>
                  <td style={{padding:"7px 10px",fontSize:12,color:C.gris}}>{r.pais}</td>
                  <td style={{padding:"7px 10px",textAlign:"right",fontWeight:600,
                    background:(!r.ha||r.ha===0)&&can?"#fffbeb":"transparent"}}>
                    <Cell val={r.ha||""} onChange={v=>upd(r.id,"ha",parseFloat(v)||0)} type="number" can={can&&!r._fromContract} ph="Ingrese Há"/>
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"center"}}>
                    <Cell val={r.usdHa||3000} onChange={v=>upd(r.id,"usdHa",parseFloat(v)||3000)} type="number" can={can&&!r._fromContract}/>
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"center",fontWeight:600,fontSize:12}}>
                    {can ? (
                      <div style={{display:"flex",gap:4,justifyContent:"center",alignItems:"center"}}>
                        <select value={r.trimCobro||2} onChange={e=>upd(r.id,"trimCobro",parseInt(e.target.value))}
                          style={{borderRadius:6,border:"1px solid #d1d5db",padding:"2px 4px",fontSize:11,fontWeight:700,color:C.mo,background:"#fff",cursor:"pointer"}}>
                          <option value="1">T1</option>
                          <option value="2">T2</option>
                          <option value="3">T3</option>
                          <option value="4">T4</option>
                        </select>
                        <input type="number" value={r.añoCobro||""} onChange={e=>upd(r.id,"añoCobro",parseInt(e.target.value)||r.añoCobro)}
                          style={{width:58,borderRadius:6,border:"1px solid #d1d5db",padding:"2px 6px",fontSize:11,fontWeight:700,textAlign:"center"}}/>
                      </div>
                    ) : <span>{TRIM_LABELS[r.trimCobro]} {r.añoCobro}</span>}
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
                    <BadgePago pagado={r.pagado} onChange={v=>upd(r.id,"pagado",v)} onFechaPago={f=>upd(r.id,"fechaPago",f)} can={can}/>
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"center"}}>
                    {r.alertaActiva
                      ? <span style={{fontSize:18}} title="Facturar pronto">⚠️</span>
                      : <span style={{fontSize:10,color:C.gris}}>{r.diasAviso>0?`${r.diasAviso}d`:"—"}</span>
                    }
                  </td>
                  {can&&<td style={{padding:"4px 6px",textAlign:"center"}}>
                    {r._fromContract?(
                      <span title="Eliminar el contrato productor para borrar este registro" style={{color:"#94a3b8",fontSize:14}}>🔒</span>
                    ):(
                    <button onClick={()=>{
                      if(!window.confirm(`¿Eliminar royalty comercial de "${r.cliente}" ${r.añoCobro}?`))return;
                      window.auditLog&&window.auditLog("eliminar", {modulo:"osiris", seccion:"Royalty Comercial",
                        descripcion:`Eliminó royalty comercial de "${r.cliente}" · ${r.pais} · ${r.añoCobro} T${r.trimCobro} · ${r.ha||0} há`,
                        registroId:r.id});
                      setData(prev=>prev.filter(x=>x.id!==r.id));
                    }}
                      style={{background:"#fee2e2",border:"none",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:12,color:"#991b1b",fontWeight:700}}>×</button>
                    )}
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
function FeeViveros({data,setData,tpData,can,clientes=[]}) {
  const [filtroPais,setFiltroPais]=useState("Todos");
  const [filtroVivero,setFiltroVivero]=useState("Todos");
  const [filtroFact,setFiltroFact]=useState("Todos");
  const [filtroCobro,setFiltroCobro]=useState("Todos");
  const [filtroCli,setFiltroCli]=useState("");
  const [modal,setModal]=useState(false);
  const [form,setForm]=useState({
    vivero:"Synergiabio",empresa:"",pais:"Peru",proforma:"",
    nPlantas:"",regalia:0.45,totalOsiris:"",tipoPago:"Entrega",
    montoFact:"",fechaFact:"",nFact:"",pagado:false,
  });

  const upd=(id,c,v)=>setData(prev=>prev.map(r=>{
    if(r.id!==id) return r;
    if(String(r[c]||"") !== String(v||"")) {
      window.auditLog&&window.auditLog("editar", {modulo:"osiris", seccion:"Fee Viveros",
        descripcion:`Editó fee vivero de "${r.empresa||r.cliente||""}" · ${r.vivero||""}: campo ${c}`,
        registroId:id, campo:c,
        valorAnterior:String(r[c]||""), valorNuevo:String(v||"")});
    }
    return {...r,[c]:v};
  }));

  // Filtrar huérfanos: si el registro viene de un pedido (tpId), verificar que el pedido aún existe
  const tpIds = new Set((tpData||[]).map(r=>r.id));
  const dataViva = data.filter(r=> !r.tpId || tpIds.has(r.tpId));

  const filtrado=dataViva.filter(r=>{
    if(filtroFact!=="Todos"){
      if(filtroFact==="Facturado"&&!(r.nFact&&r.nFact.trim()!==""))return false;
      if(filtroFact==="Pendiente"&&(r.nFact&&r.nFact.trim()!==""))return false;
    }
    if(filtroPais!=="Todos"&&r.pais!==filtroPais)return false;
    if(filtroVivero!=="Todos"&&r.vivero!==filtroVivero)return false;
    if(filtroCobro!=="Todos"&&(filtroCobro==="Pagado"?!r.pagado:r.pagado))return false;
    if(filtroCli&&!r.empresa?.toLowerCase().includes(filtroCli.toLowerCase()))return false;
    return true;
  });

  const totFacturado=filtrado.filter(r=>r.nFact&&String(r.nFact).trim()!=="").reduce((s,r)=>s+(Number(r.montoFact)||0),0);
  const totPorCobrar=filtrado.filter(r=>!r.pagado).reduce((s,r)=>s+(Number(r.montoFact)||0),0);
  const paises=["Todos",...Array.from(new Set(data.map(r=>r.pais).filter(Boolean))).sort()];
  const viveros=["Todos",...Array.from(new Set(data.map(r=>r.vivero).filter(Boolean))).sort()];

  function agregar(){
    if(!form.empresa.trim()){alert("Empresa es obligatoria.");return;}
    const id = `fv_${Date.now()}`;
    setData(prev=>[...prev,{
      ...form,id,
      nPlantas:parseFloat(form.nPlantas)||0,
      regalia:parseFloat(form.regalia)||0,
      totalOsiris:parseFloat(form.totalOsiris)||0,
      montoFact:parseFloat(form.montoFact)||0,
    }]);
    window.auditLog&&window.auditLog("crear", {modulo:"osiris", seccion:"Fee Viveros",
      descripcion:`Creó fee vivero para "${form.empresa}" · ${form.vivero} · ${form.pais} · ${form.nPlantas||0} plantas`,
      registroId:id});
    setModal(false);
    setForm({vivero:"Synergiabio",empresa:"",pais:"Peru",proforma:"",nPlantas:"",regalia:0.45,totalOsiris:"",tipoPago:"Entrega",montoFact:"",fechaFact:"",nFact:"",pagado:false});
  }

  return (
    <div>
      <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        {[
          [$$(totFacturado),"Total Factura a Vivero",C.azul,C.azulBg],
          [$$(totPorCobrar),"Por Cobrar",C.am,C.amBg],
          [filtrado.length,"Registros",C.gris,C.grisBg],
        ].map(([v,l,c,bg])=>(
          <div key={l} style={{background:bg,borderRadius:12,padding:"12px 18px",flex:1,minWidth:120}}>
            <div style={{fontSize:11,color:c,fontWeight:600}}>{l}</div>
            <div style={{fontSize:20,fontWeight:800,color:c}}>{v}</div>
          </div>
        ))}
        <div style={{fontSize:11,color:"#64748b",fontStyle:"italic",alignSelf:"center",padding:"6px 12px",background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:6}}>
          🔗 Derivado de Contratos Productores
        </div>
      </div>

      <BarraFiltros
        filtros={[
          {label:"Empresa",tipo:"input",valor:filtroCli,onChange:setFiltroCli},
          {label:"Vivero",opciones:viveros,valor:filtroVivero,onChange:setFiltroVivero},
          {label:"País",opciones:paises,valor:filtroPais,onChange:setFiltroPais},
          {label:"Factura",opciones:["Todos","Facturado","Pendiente"],valor:filtroFact,onChange:setFiltroFact},
          {label:"Pago",opciones:["Todos","Pagado","Por pagar"],valor:filtroCobro,onChange:setFiltroCobro},
        ]}
        onExportar={async ()=>exportCSV(
          filtrado.map(r=>[r.vivero||"",r.empresa,r.pais,r.proforma||"",
            r.nPlantas||0,r.regalia||0,`${(pct(r.pais)*100).toFixed(0)}%`,r.totalOsiris||0,r.tipoPago||"",
            r.montoFact||0,r.fechaFact||"",r.nFact||"",r.pagado?"Pagado":"Por pagar"]),
          ["Vivero","Empresa","País","Proforma","N° Plantas","Regalía US$","% Cobro","Total Osiris",
           "Tipo Pago","Mto.Facturar","Fecha Fact.","N° Factura","Estado Pago"],
          "FeeViveros",
          {
            tituloDoc: "Fee de Viveros",
            subtituloDoc: "Osiris Plant Management · Grupo Mediterra",
            filtros: `${filtrado.length} registros exportados`,
          }
        )}
      />

      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",background:"#fff",borderRadius:10,overflow:"hidden"}}>
          <Th cols={[
            {l:"Vivero",w:100},{l:"Empresa",w:140},{l:"País",w:70},{l:"Proforma",w:110},
            {l:"N° Plantas",c:true,w:90},{l:"Regalía US$",c:true,w:90},{l:"% Cobro",c:true,w:80},{l:"Total",c:true,w:100},
            {l:"Tipo Pago",c:true,w:120},{l:"Fecha Pago",c:true,w:110},{l:"Mto.",c:true,w:100},
            {l:"Fecha Fact.",c:true,w:100},{l:"N° Factura",c:true,w:100},
            {l:"Est. Factura",c:true,w:130},{l:"Estado Pago",c:true,w:110},
            ...(can?[{l:"",c:true,w:40}]:[]),
          ]}/>
          <tbody>
            {filtrado.map((r,i)=>{
              const facturado=r.nFact&&String(r.nFact).trim()!=="";
              return(
                <tr key={r.id} style={{borderBottom:"1px solid #f1f5f9",background:i%2===0?"#fff":"#f8fafc"}}>
                  <td style={{padding:"7px 10px",fontSize:11}}><Cell val={r.vivero||""} onChange={v=>upd(r.id,"vivero",v)} opts={["Synergiabio","Agromillora"]} can={can&&!r._fromContract}/></td>
                  <td style={{padding:"7px 10px",fontWeight:600}}>
                    <NombreCliente nombre={r.empresa} clientes={clientes} onChange={v=>upd(r.id,"empresa",v)} can={can&&!r._fromContract}/>
                  </td>
                  <td style={{padding:"7px 10px",fontSize:11,color:C.gris}}>{r.pais}</td>
                  <td style={{padding:"7px 10px",fontSize:11,color:C.gris}}><Cell val={r.proforma||""} onChange={v=>upd(r.id,"proforma",v)} can={can}/></td>
                  <td style={{padding:"7px 10px",textAlign:"center",fontWeight:600}}>{N(r.nPlantas)}</td>
                  <td style={{padding:"7px 10px",textAlign:"center",fontWeight:600,color:C.verde}}>
                    <Cell val={r.regalia||""} onChange={v=>upd(r.id,"regalia",parseFloat(v)||0)} type="number" can={can&&!r._fromContract} ph="0.45"/>
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"center",fontSize:11}}>
                    <span style={{background:pct(r.pais)===1?C.verdeBg:"#fee2e2",
                      color:pct(r.pais)===1?C.verde:"#dc2626",
                      borderRadius:20,padding:"2px 8px",fontSize:10,fontWeight:700}}>
                      {pct(r.pais)===1?"100%":"85%"}
                    </span>
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"right",fontSize:12,color:C.gris}}>{$$(r.totalOsiris)}</td>
                  <td style={{padding:"7px 10px",textAlign:"center",fontSize:11}}>
                    <span style={{background:r.tipoPago==="Anticipo (OC)"||r.tipoPago==="Anticipo"?C.azulBg:C.tealBg,
                      color:r.tipoPago==="Anticipo (OC)"||r.tipoPago==="Anticipo"?C.azul:C.teal,
                      borderRadius:20,padding:"2px 8px",fontSize:10,fontWeight:700}}>
                      {r.tipoPago||"—"}
                    </span>
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"center",fontSize:11,color:C.mo,fontWeight:600}}>
                     <Cell val={r.fechaPago||""} onChange={v=>upd(r.id,"fechaPago",v)} type="date" can={can}/>
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
                    <BadgePago pagado={r.pagado} onChange={v=>upd(r.id,"pagado",v)} onFechaPago={f=>upd(r.id,"fechaPago",f)} can={can}/>
                  </td>
                  {can&&<td style={{padding:"4px 6px",textAlign:"center"}}>
                    {r._fromContract?(
                      <span title="Eliminar el contrato productor para borrar este registro" style={{color:"#94a3b8",fontSize:14}}>🔒</span>
                    ):(
                    <button onClick={()=>{
                      if(!window.confirm(`¿Eliminar fee vivero de "${r.empresa}"?`))return;
                      window.auditLog&&window.auditLog("eliminar", {modulo:"osiris", seccion:"Fee Viveros",
                        descripcion:`Eliminó fee vivero de "${r.empresa}" · ${r.vivero||""} · ${r.pais||""}`,
                        registroId:r.id});
                      setData(prev=>prev.filter(x=>x.id!==r.id));
                    }}
                      style={{background:"#fee2e2",border:"none",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:12,color:"#991b1b",fontWeight:700}}>×</button>
                    )}
                  </td>}
                </tr>
              );
            })}
            {filtrado.length===0&&<tr><td colSpan={can?16:15} style={{textAlign:"center",padding:32,color:C.gris,fontSize:13}}>
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
                ["Regalía US$/Planta","regalia","number",null],
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

// ══════════════════════════════════════════════════════════════════
// RECONCILIACIÓN IQ — 70% de lo facturado (FE + RP + RC)
// ══════════════════════════════════════════════════════════════════
function ReconciliacionIQ({rpData, feData, rcData, tpData}) {
  const PCT_IQ  = 0.70;  // 70% del facturado al cliente corresponde a IQ
  const PCT_WHT = 0.10;  // 10% de retención sobre lo que pagamos a IQ
  const [filtroPais, setFiltroPais] = useState("Todos");
  const [filtroAño, setFiltroAño] = useState("Todos");
  const [filtroCliente, setFiltroCliente] = useState("");

  // Calcular datos con montoFact (antes de WHT del cliente)
  // iq = 70% del facturado (bruto a pagar a IQ)
  // wht = 10% retención sobre IQ
  // pagoNetoIQ = iq - wht (monto efectivo a transferir a IQ)
  const rpCalc = useMemo(()=> (rpData||[]).map(r=>{
    const mf = (Number(r.nPlantas)||0)*(Number(r.usdPlanta)||0);
    const iq = mf * PCT_IQ;
    const wht = iq * PCT_WHT;
    return {
      id: r.id, concepto: "Royalty Planta", tipo: "rp",
      cliente: r.cliente||"—", pais: r.pais||"—",
      año: r.añoEntrega || r.año || "",
      detalle: `${Number(r.nPlantas)||0} plantas × $${Number(r.usdPlanta)||0}`,
      nFact: r.nFact||"", pagado: !!r.pagado, fechaPago: r.fechaPago||"",
      montoFact: mf,
      iq, wht, pagoNetoIQ: iq - wht,
      facturado: !!(r.nFact && String(r.nFact).trim()!==""),
    };
  }), [rpData]);

  const feCalc = useMemo(()=> (feData||[]).map(r=>{
    const mf = Number(r.montoUSD)||0;
    const iq = mf * PCT_IQ;
    const wht = iq * PCT_WHT;
    return {
      id: r.id, concepto: "Fee Entrada", tipo: "fe",
      cliente: r.cliente||"—", pais: r.pais||"—",
      año: r.año || (r.fechaPago ? new Date(r.fechaPago).getFullYear() : ""),
      detalle: r.detalle || "Contract Fee",
      nFact: r.nFact||"", pagado: !!r.pagado, fechaPago: r.fechaPago||"",
      montoFact: mf,
      iq, wht, pagoNetoIQ: iq - wht,
      facturado: !!(r.nFact && String(r.nFact).trim()!==""),
    };
  }), [feData]);

  const rcCalc = useMemo(()=> (rcData||[]).map(r=>{
    const mf = (Number(r.ha)||0)*(Number(r.usdHa)||0);
    const iq = mf * PCT_IQ;
    const wht = iq * PCT_WHT;
    return {
      id: r.id, concepto: "Royalty Comercial", tipo: "rc",
      cliente: r.cliente||"—", pais: r.pais||"—",
      año: r.añoCobro || "",
      detalle: `${Number(r.ha)||0} há × $${Number(r.usdHa)||0}${r.trimCobro?` · T${r.trimCobro}`:""}`,
      nFact: r.nFact||"", pagado: !!r.pagado, fechaPago: r.fechaPago||"",
      montoFact: mf,
      iq, wht, pagoNetoIQ: iq - wht,
      facturado: !!(r.nFact && String(r.nFact).trim()!==""),
    };
  }), [rcData]);

  const todos = useMemo(()=> [...rpCalc, ...feCalc, ...rcCalc], [rpCalc, feCalc, rcCalc]);

  // Filtros
  const paises = useMemo(()=> ["Todos", ...Array.from(new Set(todos.map(r=>r.pais).filter(p=>p&&p!=="—"))).sort()], [todos]);
  const años = useMemo(()=> ["Todos", ...Array.from(new Set(todos.map(r=>r.año).filter(Boolean))).sort()], [todos]);

  const filtrado = useMemo(()=> todos.filter(r=>
    (filtroPais==="Todos"||r.pais===filtroPais) &&
    (filtroAño==="Todos"||String(r.año)===String(filtroAño)) &&
    (!filtroCliente||r.cliente.toLowerCase().includes(filtroCliente.toLowerCase()))
  ), [todos, filtroPais, filtroAño, filtroCliente]);

  // Solo consideramos para IQ los FACTURADOS (regla: facturados y pagados = base IQ firme)
  const facturados = filtrado.filter(r=>r.facturado);
  const pagados = facturados.filter(r=>r.pagado);       // Base IQ real
  const pendientes = facturados.filter(r=>!r.pagado);   // Proyección IQ

  // Agrupador por país
  function groupByPais(arr) {
    const g = {};
    arr.forEach(r=>{
      const p = r.pais || "—";
      if(!g[p]) g[p] = {montoFact:0, iq:0, wht:0, pagoNetoIQ:0, porConcepto:{rp:0, fe:0, rc:0}, items:[]};
      g[p].montoFact += r.montoFact;
      g[p].iq += r.iq;
      g[p].wht += r.wht;
      g[p].pagoNetoIQ += r.pagoNetoIQ;
      g[p].porConcepto[r.tipo] = (g[p].porConcepto[r.tipo]||0) + r.montoFact;
      g[p].items.push(r);
    });
    return g;
  }

  const grupoPagado = groupByPais(pagados);
  const grupoPendiente = groupByPais(pendientes);

  const totPagadoFact     = pagados.reduce((s,r)=>s+r.montoFact, 0);
  const totPagadoIQ       = pagados.reduce((s,r)=>s+r.iq, 0);
  const totPagadoWHT      = pagados.reduce((s,r)=>s+r.wht, 0);
  const totPagadoNeto     = pagados.reduce((s,r)=>s+r.pagoNetoIQ, 0);
  const totPendienteFact  = pendientes.reduce((s,r)=>s+r.montoFact, 0);
  const totPendienteIQ    = pendientes.reduce((s,r)=>s+r.iq, 0);
  const totPendienteWHT   = pendientes.reduce((s,r)=>s+r.wht, 0);
  const totPendienteNeto  = pendientes.reduce((s,r)=>s+r.pagoNetoIQ, 0);

  // Estilo tarjeta país
  const TarjetaPais = ({pais, data, color, bgColor}) => (
    <div style={{background:bgColor, borderRadius:12, padding:"14px 18px",
      border:`1px solid ${color}44`, minWidth:260, flex:1}}>
      <div style={{fontSize:10, color:C.gris, letterSpacing:1, marginBottom:4, fontWeight:700}}>
        🌍 {pais.toUpperCase()}
      </div>
      <div style={{fontSize:11, color:C.sl, marginBottom:2}}>Facturado al cliente</div>
      <div style={{fontSize:16, fontWeight:800, color:C.sl, marginBottom:6}}>{$$(data.montoFact)}</div>
      <div style={{fontSize:10, color:color, fontWeight:700}}>IQ bruto (70%)</div>
      <div style={{fontSize:15, fontWeight:800, color:color, marginBottom:4}}>{$$(data.iq)}</div>
      <div style={{display:"flex", justifyContent:"space-between", fontSize:10, color:C.rojo}}>
        <span>(-) WHT 10%:</span>
        <span style={{fontWeight:600}}>{$$(data.wht)}</span>
      </div>
      <div style={{borderTop:`1px dashed ${color}55`, marginTop:4, paddingTop:4}}>
        <div style={{fontSize:10, color:color, fontWeight:800}}>PAGO NETO A IQ</div>
        <div style={{fontSize:20, fontWeight:900, color:color}}>{$$(data.pagoNetoIQ)}</div>
      </div>
      <div style={{marginTop:8, paddingTop:6, borderTop:`1px solid ${color}22`, fontSize:10, color:C.gris}}>
        <div style={{display:"flex", justifyContent:"space-between"}}><span>🌱 Royalty Planta:</span><span style={{fontWeight:600, color:C.sl}}>{$$(data.porConcepto.rp||0)}</span></div>
        <div style={{display:"flex", justifyContent:"space-between"}}><span>📄 Fee Entrada:</span><span style={{fontWeight:600, color:C.sl}}>{$$(data.porConcepto.fe||0)}</span></div>
        <div style={{display:"flex", justifyContent:"space-between"}}><span>📈 Royalty Comercial:</span><span style={{fontWeight:600, color:C.sl}}>{$$(data.porConcepto.rc||0)}</span></div>
      </div>
    </div>
  );

  const Tabla = ({titulo, items, color, bgColor, tot, totIQ, totWHT, totNeto}) => (
    <div style={{marginBottom:20}}>
      <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:10, flexWrap:"wrap"}}>
        <div style={{fontSize:14, fontWeight:800, color:color}}>{titulo}</div>
        <span style={{background:bgColor, color:color, borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:700}}>
          {items.length} registros
        </span>
        <div style={{marginLeft:"auto", display:"flex", gap:16, alignItems:"center", flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:10, color:C.gris, textAlign:"right"}}>Facturado</div>
            <div style={{fontSize:14, fontWeight:800, color:C.sl}}>{$$(tot)}</div>
          </div>
          <div>
            <div style={{fontSize:10, color:color, textAlign:"right", fontWeight:700}}>IQ 70%</div>
            <div style={{fontSize:14, fontWeight:800, color:color}}>{$$(totIQ)}</div>
          </div>
          <div>
            <div style={{fontSize:10, color:C.rojo, textAlign:"right", fontWeight:700}}>(-) WHT 10%</div>
            <div style={{fontSize:14, fontWeight:800, color:C.rojo}}>{$$(totWHT)}</div>
          </div>
          <div>
            <div style={{fontSize:10, color:color, textAlign:"right", fontWeight:800}}>Pago Neto IQ</div>
            <div style={{fontSize:18, fontWeight:900, color:color}}>{$$(totNeto)}</div>
          </div>
        </div>
      </div>
      {items.length===0 ? (
        <div style={{textAlign:"center", padding:24, color:"#94a3b8", fontSize:12,
          background:"#f8fafc", borderRadius:10}}>
          Sin registros
        </div>
      ) : (
        <div style={{overflowX:"auto", borderRadius:10, boxShadow:"0 1px 4px #0001"}}>
          <table style={{width:"100%", borderCollapse:"collapse", background:"#fff", fontSize:11}}>
            <thead>
              <tr style={{background:"#0f172a", color:"#fff"}}>
                <th style={{padding:"8px 10px", textAlign:"left", fontWeight:600}}>Concepto</th>
                <th style={{padding:"8px 10px", textAlign:"left", fontWeight:600}}>Cliente</th>
                <th style={{padding:"8px 10px", textAlign:"center", fontWeight:600}}>País</th>
                <th style={{padding:"8px 10px", textAlign:"center", fontWeight:600}}>Año</th>
                <th style={{padding:"8px 10px", textAlign:"left", fontWeight:600}}>Detalle</th>
                <th style={{padding:"8px 10px", textAlign:"center", fontWeight:600}}>N° Fact</th>
                <th style={{padding:"8px 10px", textAlign:"center", fontWeight:600}}>Pagado</th>
                <th style={{padding:"8px 10px", textAlign:"right", fontWeight:600}}>Facturado</th>
                <th style={{padding:"8px 10px", textAlign:"right", fontWeight:600}}>IQ 70%</th>
                <th style={{padding:"8px 10px", textAlign:"right", fontWeight:600, color:"#fca5a5"}}>WHT 10%</th>
                <th style={{padding:"8px 10px", textAlign:"right", fontWeight:700, background:color}}>Pago Neto IQ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r,i)=>(
                <tr key={`${r.tipo}_${r.id}`} style={{borderBottom:"1px solid #f1f5f9",
                  background:i%2===0?"#fff":"#fafafa"}}>
                  <td style={{padding:"6px 10px"}}>
                    <span style={{fontSize:10, background:r.tipo==="rp"?C.verdeBg:r.tipo==="fe"?C.azulBg:C.moBg,
                      color:r.tipo==="rp"?C.verde:r.tipo==="fe"?C.azul:C.mo,
                      borderRadius:20, padding:"2px 8px", fontWeight:700}}>{r.concepto}</span>
                  </td>
                  <td style={{padding:"6px 10px", color:C.sl, fontWeight:500}}>{r.cliente}</td>
                  <td style={{padding:"6px 10px", textAlign:"center", color:C.gris}}>{r.pais}</td>
                  <td style={{padding:"6px 10px", textAlign:"center", color:C.gris}}>{r.año||"—"}</td>
                  <td style={{padding:"6px 10px", color:C.gris, fontSize:10}}>{r.detalle}</td>
                  <td style={{padding:"6px 10px", textAlign:"center"}}>
                    <span style={{fontSize:10, background:C.azulBg, color:C.azul, borderRadius:20,
                      padding:"2px 8px", fontWeight:700}}>{r.nFact||"—"}</span>
                  </td>
                  <td style={{padding:"6px 10px", textAlign:"center", fontSize:11}}>
                    {r.pagado ? <span style={{color:C.verde, fontWeight:700}}>✓ {r.fechaPago||""}</span>
                              : <span style={{color:C.am, fontWeight:600}}>⏳ Pendiente</span>}
                  </td>
                  <td style={{padding:"6px 10px", textAlign:"right", fontWeight:700, color:C.sl}}>{$$(r.montoFact)}</td>
                  <td style={{padding:"6px 10px", textAlign:"right", fontWeight:700, color:color}}>{$$(r.iq)}</td>
                  <td style={{padding:"6px 10px", textAlign:"right", fontWeight:600, color:C.rojo}}>({$$(r.wht)})</td>
                  <td style={{padding:"6px 10px", textAlign:"right", fontWeight:900, color:color,
                    background:bgColor}}>{$$(r.pagoNetoIQ)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{background:"#f1f5f9", borderTop:"2px solid #cbd5e1"}}>
                <td colSpan={7} style={{padding:"8px 10px", fontWeight:800, color:C.sl}}>TOTAL</td>
                <td style={{padding:"8px 10px", textAlign:"right", fontWeight:900, color:C.sl, fontSize:13}}>{$$(tot)}</td>
                <td style={{padding:"8px 10px", textAlign:"right", fontWeight:900, color:color, fontSize:13}}>{$$(totIQ)}</td>
                <td style={{padding:"8px 10px", textAlign:"right", fontWeight:800, color:C.rojo, fontSize:12}}>({$$(totWHT)})</td>
                <td style={{padding:"8px 10px", textAlign:"right", fontWeight:900, color:color, fontSize:14, background:bgColor}}>{$$(totNeto)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );

  async function exportarXLSX() {
    const headers = ["Concepto","Cliente","País","Año","Detalle","N° Factura","Estado Pago","Fecha Pago","Facturado USD","IQ 70% USD","WHT 10% USD","Pago Neto IQ USD"];

    // Sección Pagados
    const rowsPagados = pagados.map(r=>[
      r.concepto, r.cliente, r.pais, r.año, r.detalle, r.nFact,
      "Pagado", r.fechaPago, r.montoFact, r.iq, r.wht, r.pagoNetoIQ
    ]);
    // Fila total Pagados
    rowsPagados.push(["TOTAL PAGADOS","","","","","","","", totPagadoFact, totPagadoIQ, totPagadoWHT, totPagadoNeto]);

    // Sección Pendientes
    const rowsPendientes = pendientes.map(r=>[
      r.concepto, r.cliente, r.pais, r.año, r.detalle, r.nFact,
      "Pendiente", "", r.montoFact, r.iq, r.wht, r.pagoNetoIQ
    ]);
    rowsPendientes.push(["TOTAL PENDIENTES","","","","","","","", totPendienteFact, totPendienteIQ, totPendienteWHT, totPendienteNeto]);

    const filtros = [];
    if(filtroPais!=="Todos") filtros.push(`País: ${filtroPais}`);
    if(filtroAño!=="Todos") filtros.push(`Año: ${filtroAño}`);
    if(filtroCliente) filtros.push(`Cliente: ${filtroCliente}`);
    const filtrosInfo = filtros.length>0 ? `Filtros: ${filtros.join(" · ")}` : "";

    await exportCSV(
      [
        {titulo: "✅ PAGADOS — Base IQ firme (70% facturado − 10% WHT)", rows: rowsPagados, headers},
        {titulo: "⏳ PENDIENTES DE COBRO — Proyección IQ", rows: rowsPendientes, headers},
      ],
      null,
      "Reconciliacion_IQ",
      {
        tituloDoc: "Reconciliación IQ",
        subtituloDoc: "Osiris Plant Management · Grupo Mediterra · 70% facturado − 10% WHT",
        filtros: filtrosInfo,
      }
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:18, flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:18, fontWeight:900, color:C.sl}}>🧾 Reconciliación IQ</div>
          <div style={{fontSize:11, color:C.gris, marginTop:2}}>
            70% de lo facturado al cliente por Fee Entrada + Royalty Planta + Royalty Comercial
          </div>
        </div>
        <button onClick={exportarXLSX}
          style={{marginLeft:"auto", padding:"8px 16px", borderRadius:8, background:C.teal,
            color:"#fff", border:"none", cursor:"pointer", fontSize:12, fontWeight:700}}>
          📥 Exportar Excel
        </button>
      </div>

      {/* Filtros */}
      <div style={{display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems:"center",
        background:"#f8fafc", borderRadius:10, padding:"10px 14px", border:"1px solid #e2e8f0"}}>
        <span style={{fontSize:11, color:C.gris, fontWeight:700}}>Filtros:</span>
        <select value={filtroPais} onChange={e=>setFiltroPais(e.target.value)}
          style={{padding:"6px 10px", borderRadius:8, border:"1px solid #d1d5db", fontSize:12, outline:"none"}}>
          {paises.map(p=><option key={p} value={p}>🌍 {p}</option>)}
        </select>
        <select value={filtroAño} onChange={e=>setFiltroAño(e.target.value)}
          style={{padding:"6px 10px", borderRadius:8, border:"1px solid #d1d5db", fontSize:12, outline:"none"}}>
          {años.map(a=><option key={a} value={a}>📅 {a}</option>)}
        </select>
        <input placeholder="🔍 Buscar cliente..." value={filtroCliente} onChange={e=>setFiltroCliente(e.target.value)}
          style={{padding:"6px 10px", borderRadius:8, border:"1px solid #d1d5db", fontSize:12, outline:"none", minWidth:180}}/>
        {(filtroPais!=="Todos"||filtroAño!=="Todos"||filtroCliente)&&(
          <button onClick={()=>{setFiltroPais("Todos");setFiltroAño("Todos");setFiltroCliente("");}}
            style={{padding:"5px 12px", borderRadius:8, background:"#fff", border:"1px solid #d1d5db",
              cursor:"pointer", fontSize:11, color:C.gris}}>✕ Limpiar</button>
        )}
      </div>

      {/* KPIs Pagado / Pendiente */}
      <div style={{display:"flex", gap:12, marginBottom:20, flexWrap:"wrap"}}>
        <div style={{background:"linear-gradient(135deg,#dcfce7,#bbf7d0)", borderRadius:12,
          padding:"16px 20px", border:`2px solid ${C.verde}`, flex:1, minWidth:260}}>
          <div style={{fontSize:10, color:C.verde, letterSpacing:2, fontWeight:800, marginBottom:4}}>✅ IQ FIRME (PAGADO POR CLIENTE)</div>
          <div style={{fontSize:11, color:C.sl, marginBottom:1}}>Facturado + Cobrado</div>
          <div style={{fontSize:14, fontWeight:700, color:C.sl, marginBottom:4}}>{$$(totPagadoFact)}</div>
          <div style={{fontSize:10, color:C.verde, fontWeight:700}}>IQ bruto (70%)</div>
          <div style={{fontSize:15, fontWeight:800, color:C.verde, marginBottom:2}}>{$$(totPagadoIQ)}</div>
          <div style={{display:"flex", justifyContent:"space-between", fontSize:10, color:C.rojo, marginBottom:4}}>
            <span>(-) WHT 10%:</span>
            <span style={{fontWeight:700}}>{$$(totPagadoWHT)}</span>
          </div>
          <div style={{borderTop:`1px dashed ${C.verde}66`, paddingTop:4}}>
            <div style={{fontSize:10, color:C.verde, fontWeight:800}}>PAGO NETO A IQ</div>
            <div style={{fontSize:24, fontWeight:900, color:C.verde}}>{$$(totPagadoNeto)}</div>
          </div>
          <div style={{fontSize:10, color:C.gris, marginTop:4}}>{pagados.length} registros</div>
        </div>

        <div style={{background:"linear-gradient(135deg,#fef3c7,#fde68a)", borderRadius:12,
          padding:"16px 20px", border:`2px solid ${C.am}`, flex:1, minWidth:260}}>
          <div style={{fontSize:10, color:C.am, letterSpacing:2, fontWeight:800, marginBottom:4}}>⏳ IQ PROYECTADO (POR COBRAR)</div>
          <div style={{fontSize:11, color:C.sl, marginBottom:1}}>Facturado por cobrar</div>
          <div style={{fontSize:14, fontWeight:700, color:C.sl, marginBottom:4}}>{$$(totPendienteFact)}</div>
          <div style={{fontSize:10, color:C.am, fontWeight:700}}>IQ bruto (70%)</div>
          <div style={{fontSize:15, fontWeight:800, color:C.am, marginBottom:2}}>{$$(totPendienteIQ)}</div>
          <div style={{display:"flex", justifyContent:"space-between", fontSize:10, color:C.rojo, marginBottom:4}}>
            <span>(-) WHT 10%:</span>
            <span style={{fontWeight:700}}>{$$(totPendienteWHT)}</span>
          </div>
          <div style={{borderTop:`1px dashed ${C.am}66`, paddingTop:4}}>
            <div style={{fontSize:10, color:C.am, fontWeight:800}}>PAGO NETO PROYECTADO</div>
            <div style={{fontSize:24, fontWeight:900, color:C.am}}>{$$(totPendienteNeto)}</div>
          </div>
          <div style={{fontSize:10, color:C.gris, marginTop:4}}>{pendientes.length} registros</div>
        </div>

        <div style={{background:"linear-gradient(135deg,#dbeafe,#bfdbfe)", borderRadius:12,
          padding:"16px 20px", border:`2px solid ${C.azul}`, flex:1, minWidth:260}}>
          <div style={{fontSize:10, color:C.azul, letterSpacing:2, fontWeight:800, marginBottom:4}}>📊 IQ TOTAL (FACTURADO)</div>
          <div style={{fontSize:11, color:C.sl, marginBottom:1}}>Base total facturada</div>
          <div style={{fontSize:14, fontWeight:700, color:C.sl, marginBottom:4}}>{$$(totPagadoFact+totPendienteFact)}</div>
          <div style={{fontSize:10, color:C.azul, fontWeight:700}}>IQ bruto (70%)</div>
          <div style={{fontSize:15, fontWeight:800, color:C.azul, marginBottom:2}}>{$$(totPagadoIQ+totPendienteIQ)}</div>
          <div style={{display:"flex", justifyContent:"space-between", fontSize:10, color:C.rojo, marginBottom:4}}>
            <span>(-) WHT 10%:</span>
            <span style={{fontWeight:700}}>{$$(totPagadoWHT+totPendienteWHT)}</span>
          </div>
          <div style={{borderTop:`1px dashed ${C.azul}66`, paddingTop:4}}>
            <div style={{fontSize:10, color:C.azul, fontWeight:800}}>PAGO NETO TOTAL</div>
            <div style={{fontSize:24, fontWeight:900, color:C.azul}}>{$$(totPagadoNeto+totPendienteNeto)}</div>
          </div>
          <div style={{fontSize:10, color:C.gris, marginTop:4}}>{pagados.length+pendientes.length} registros</div>
        </div>
      </div>

      {/* Segregación por país - Pagado */}
      {Object.keys(grupoPagado).length>0&&(
        <div style={{marginBottom:20}}>
          <div style={{fontSize:13, fontWeight:800, color:C.verde, marginBottom:10}}>
            🌍 IQ Pagado por País
          </div>
          <div style={{display:"flex", gap:12, flexWrap:"wrap"}}>
            {Object.entries(grupoPagado).map(([pais, data])=>(
              <TarjetaPais key={pais} pais={pais} data={data} color={C.verde} bgColor={C.verdeBg}/>
            ))}
          </div>
        </div>
      )}

      {/* Segregación por país - Pendiente */}
      {Object.keys(grupoPendiente).length>0&&(
        <div style={{marginBottom:24}}>
          <div style={{fontSize:13, fontWeight:800, color:C.am, marginBottom:10}}>
            🌍 IQ Proyectado por País (Pendiente de Cobro)
          </div>
          <div style={{display:"flex", gap:12, flexWrap:"wrap"}}>
            {Object.entries(grupoPendiente).map(([pais, data])=>(
              <TarjetaPais key={pais} pais={pais} data={data} color={C.am} bgColor={C.amBg}/>
            ))}
          </div>
        </div>
      )}

      {/* Tabla Pagados */}
      <Tabla
        titulo="✅ PAGADOS — Pago Neto IQ firme"
        items={pagados} color={C.verde} bgColor={C.verdeBg}
        tot={totPagadoFact} totIQ={totPagadoIQ}
        totWHT={totPagadoWHT} totNeto={totPagadoNeto}
      />

      {/* Tabla Pendientes */}
      <Tabla
        titulo="⏳ PENDIENTES DE COBRO — Proyección Pago Neto IQ"
        items={pendientes} color={C.am} bgColor={C.amBg}
        tot={totPendienteFact} totIQ={totPendienteIQ}
        totWHT={totPendienteWHT} totNeto={totPendienteNeto}
      />

      {/* Nota explicativa */}
      <div style={{background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:10,
        padding:"12px 16px", fontSize:11, color:"#0c4a6e", marginTop:10}}>
        <strong>ℹ️ Metodología:</strong> La Reconciliación IQ calcula: <strong>(1)</strong> IQ bruto = 70% del monto facturado al cliente
        en los 3 conceptos (Fee Entrada + Royalty Planta + Royalty Comercial); <strong>(2)</strong> WHT = 10% de retención sobre el IQ bruto;
        <strong> (3)</strong> Pago Neto a IQ = IQ bruto − WHT.
        <br/><br/>
        <strong>Ejemplo:</strong> Cliente factura $1.000 → IQ bruto $700 → WHT $70 → <strong>Pago neto a IQ: $630</strong>.
        <br/><br/>
        Solo se incluyen registros con <strong>N° de factura emitido</strong>. Los <strong>Pagados</strong> son la base firme ya devengada;
        los <strong>Pendientes</strong> son la proyección por cobrar.
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD ANALÍTICO — vista cruzada de plantaciones y cobros
// Filtros: temporada, país, especie, variedad, cliente, estado cobranza
// KPIs: ingresos por concepto (CF/RP/RC), por cobrar, cobrado, WHT
// Gráficos: plantas por especie, há por país, comparativo temporadas
// ══════════════════════════════════════════════════════════════
function DashboardAnalitico({ctData,feData,rpData,rcData,tpData,especiesMaestro=[]}) {
  const [filtroPais,setFiltroPais]=useState("Todos");
  const [filtroEspecie,setFiltroEspecie]=useState("Todos");
  const [filtroVariedad,setFiltroVariedad]=useState("Todos");
  const [filtroCliente,setFiltroCliente]=useState("");
  const [filtroTemp,setFiltroTemp]=useState("Todas");
  const [filtroCobranza,setFiltroCobranza]=useState("Todos");

  // ── Universos de filtros ──
  const paises = useMemo(()=>["Todos",...Array.from(new Set((tpData||[]).map(p=>p.pais).filter(Boolean))).sort()],[tpData]);
  const especies = useMemo(()=>["Todos",...Array.from(new Set((tpData||[]).map(p=>p.especie).filter(Boolean))).sort()],[tpData]);
  const variedades = useMemo(()=>{
    const filtrados = filtroEspecie==="Todos"
      ? (tpData||[])
      : (tpData||[]).filter(p=>p.especie===filtroEspecie);
    return ["Todos",...Array.from(new Set(filtrados.map(p=>p.variedad).filter(Boolean))).sort()];
  },[tpData,filtroEspecie]);
  const temporadas = useMemo(()=>{
    const tset = new Set();
    (rcData||[]).forEach(r=>r.temporada&&tset.add(r.temporada));
    return ["Todas",...Array.from(tset).sort()];
  },[rcData]);

  const matchPlantacion = (p) =>
    (filtroPais==="Todos"||p.pais===filtroPais)&&
    (filtroEspecie==="Todos"||p.especie===filtroEspecie)&&
    (filtroVariedad==="Todos"||p.variedad===filtroVariedad)&&
    (!filtroCliente||(p.cliente||"").toLowerCase().includes(filtroCliente.toLowerCase()));

  const matchTemp = (r) => filtroTemp==="Todas"||r.temporada===filtroTemp;

  // ── tpFilt: plantaciones filtradas ──
  const tpFilt = useMemo(()=>(tpData||[]).filter(matchPlantacion),[tpData,filtroPais,filtroEspecie,filtroVariedad,filtroCliente]);

  // ── feFilt / rpFilt / rcFilt: cobros filtrados ──
  const matchCobranza = (r) => filtroCobranza==="Todos" || (filtroCobranza==="Pagado" ? !!r.pagado : !r.pagado);

  const feFilt = useMemo(()=>(feData||[]).filter(r=>
    (filtroPais==="Todos"||r.pais===filtroPais)&&
    (!filtroCliente||(r.cliente||"").toLowerCase().includes(filtroCliente.toLowerCase()))&&
    matchCobranza(r)
  ),[feData,filtroPais,filtroCliente,filtroCobranza]);

  const rpFilt = useMemo(()=>(rpData||[]).filter(r=>{
    const ct = (ctData||[]).find(c=>c.id===r.ctId);
    const tieneVariedadFiltrada = filtroEspecie==="Todos" && filtroVariedad==="Todos" ? true :
      (ct?.plantaciones||[]).some(p=>
        (filtroEspecie==="Todos"||p.especie===filtroEspecie)&&
        (filtroVariedad==="Todos"||p.variedad===filtroVariedad)
      );
    return (filtroPais==="Todos"||r.pais===filtroPais)&&
      (!filtroCliente||(r.cliente||"").toLowerCase().includes(filtroCliente.toLowerCase()))&&
      matchCobranza(r)&&
      tieneVariedadFiltrada;
  }),[rpData,ctData,filtroPais,filtroEspecie,filtroVariedad,filtroCliente,filtroCobranza]);

  const rcFilt = useMemo(()=>(rcData||[]).filter(r=>{
    const ct = (ctData||[]).find(c=>c.id===r.ctId);
    const tieneVariedadFiltrada = filtroEspecie==="Todos" && filtroVariedad==="Todos" ? true :
      (ct?.plantaciones||[]).some(p=>
        (filtroEspecie==="Todos"||p.especie===filtroEspecie)&&
        (filtroVariedad==="Todos"||p.variedad===filtroVariedad)
      );
    return (filtroPais==="Todos"||r.pais===filtroPais)&&
      (!filtroCliente||(r.cliente||"").toLowerCase().includes(filtroCliente.toLowerCase()))&&
      matchTemp(r)&&matchCobranza(r)&&tieneVariedadFiltrada;
  }),[rcData,ctData,filtroPais,filtroEspecie,filtroVariedad,filtroCliente,filtroTemp,filtroCobranza]);

  // ── KPIs ──
  const sumNum = (arr,getter) => arr.reduce((s,r)=>s+(parseFloat(getter(r))||0),0);

  const totPlantas = sumNum(tpFilt, p=>p.nPlantas);
  const totHa = sumNum(tpFilt, p=>p.hectareas);
  const cantContratos = new Set(tpFilt.map(p=>p.ctId)).size;

  const cfFact = sumNum(feFilt, r=>r.montoUSD);
  const cfNeto = sumNum(feFilt, r=>(parseFloat(r.montoUSD)||0)*pct(r.pais));
  const cfPagado = sumNum(feFilt.filter(r=>r.pagado), r=>(parseFloat(r.montoUSD)||0)*pct(r.pais));

  const rpFact = sumNum(rpFilt, r=>r.montoFact);
  const rpNeto = sumNum(rpFilt, r=>r.montoCobro);
  const rpPagado = sumNum(rpFilt.filter(r=>r.pagado), r=>r.montoCobro);

  const rcFact = sumNum(rcFilt, r=>r.montoFact);
  const rcNeto = sumNum(rcFilt, r=>r.montoCobro);
  const rcPagado = sumNum(rcFilt.filter(r=>r.pagado), r=>r.montoCobro);

  const totFact = cfFact + rpFact + rcFact;
  const totNeto = cfNeto + rpNeto + rcNeto;
  const totPagado = cfPagado + rpPagado + rcPagado;
  const totWHT = totFact - totNeto;
  const porCobrar = totNeto - totPagado;

  // ── Datos para gráficos ──
  // Plantas por especie
  const plantasPorEspecie = useMemo(()=>{
    const map = {};
    tpFilt.forEach(p=>{
      const k = p.especie||"(sin)";
      map[k] = (map[k]||0)+(parseFloat(p.nPlantas)||0);
    });
    return Object.entries(map).map(([especie,plantas])=>({especie,plantas})).sort((a,b)=>b.plantas-a.plantas);
  },[tpFilt]);

  // Há por país
  const haPorPais = useMemo(()=>{
    const map = {};
    tpFilt.forEach(p=>{
      const k = p.pais||"(sin)";
      map[k] = (map[k]||0)+(parseFloat(p.hectareas)||0);
    });
    return Object.entries(map).map(([pais,ha])=>({pais,ha:parseFloat(ha.toFixed(2))})).sort((a,b)=>b.ha-a.ha);
  },[tpFilt]);

  // Comparativo por temporada (RC)
  const ingresosPorTemporada = useMemo(()=>{
    const map = {};
    rcFilt.forEach(r=>{
      const k = r.temporada;
      if(!map[k]) map[k]={fact:0, cobrado:0, porCobrar:0};
      map[k].fact     += parseFloat(r.montoFact)||0;
      if(r.pagado) map[k].cobrado += parseFloat(r.montoCobro)||0;
      else         map[k].porCobrar += parseFloat(r.montoCobro)||0;
    });
    return Object.entries(map).map(([temp,v])=>({temporada:temp,...v})).sort((a,b)=>a.temporada.localeCompare(b.temporada));
  },[rcFilt]);

  const KpiCard = ({label,val,sub,col}) => (
    <div style={{flex:1,minWidth:160,background:"#fff",borderRadius:10,padding:"12px 14px",borderLeft:`4px solid ${col}`,boxShadow:"0 1px 4px #0001"}}>
      <div style={{fontSize:10,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:0.5}}>{label}</div>
      <div style={{fontSize:18,fontWeight:900,color:col,marginTop:3}}>{val}</div>
      {sub&&<div style={{fontSize:10,color:"#94a3b8",marginTop:3}}>{sub}</div>}
    </div>
  );

  const fmt = (v) => `$${(parseFloat(v)||0).toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0})}`;

  // Bar chart simple en SVG
  const BarChart = ({data, getLabel, getValue, color="#7c3aed", getColor=null, fmtVal=v=>v.toLocaleString()}) => {
    if(data.length===0) return <div style={{padding:20,textAlign:"center",color:"#94a3b8",fontSize:12}}>Sin datos</div>;
    const maxV = Math.max(...data.map(getValue),1);
    return (
      <div>
        {data.slice(0,12).map((d,i)=>{
          const v = getValue(d);
          const pct = (v/maxV)*100;
          const barColor = getColor?getColor(d)||color:color;
          return (
            <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
              <div style={{width:120,fontSize:11,color:"#475569",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:6}}>
                {getColor&&<div style={{width:10,height:10,borderRadius:3,background:barColor,flexShrink:0,boxShadow:"0 1px 2px #0002"}}/>}
                <span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{getLabel(d)}</span>
              </div>
              <div style={{flex:1,background:"#f1f5f9",height:24,borderRadius:6,overflow:"hidden",position:"relative"}}>
                <div style={{width:`${pct}%`,height:"100%",background:barColor,borderRadius:6,transition:"width 0.3s"}}/>
                <div style={{position:"absolute",right:6,top:0,bottom:0,display:"flex",alignItems:"center",fontSize:10,fontWeight:700,color:"#fff",textShadow:"0 1px 2px #0006"}}>{fmtVal(v)}</div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Filtros */}
      <div style={{background:"linear-gradient(135deg,#f0f9ff,#dbeafe)",border:"1px solid #93c5fd",borderRadius:12,padding:16}}>
        <div style={{fontSize:12,fontWeight:700,color:"#1e3a8a",marginBottom:10}}>🔎 Filtros</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:10}}>
          <div>
            <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:3}}>País</div>
            <select value={filtroPais} onChange={e=>setFiltroPais(e.target.value)} style={{width:"100%",padding:"6px 10px",borderRadius:6,border:"1px solid #93c5fd",fontSize:12,background:"#fff"}}>
              {paises.map(p=><option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:3}}>Especie</div>
            <select value={filtroEspecie} onChange={e=>{setFiltroEspecie(e.target.value);setFiltroVariedad("Todos");}} style={{width:"100%",padding:"6px 10px",borderRadius:6,border:"1px solid #93c5fd",fontSize:12,background:"#fff"}}>
              {especies.map(p=><option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:3}}>Variedad</div>
            <select value={filtroVariedad} onChange={e=>setFiltroVariedad(e.target.value)} style={{width:"100%",padding:"6px 10px",borderRadius:6,border:"1px solid #93c5fd",fontSize:12,background:"#fff"}}>
              {variedades.map(p=><option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:3}}>Cliente</div>
            <input value={filtroCliente} onChange={e=>setFiltroCliente(e.target.value)} placeholder="Buscar..."
              style={{width:"100%",padding:"6px 10px",borderRadius:6,border:"1px solid #93c5fd",fontSize:12,boxSizing:"border-box"}}/>
          </div>
          <div>
            <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:3}}>Temporada (RC)</div>
            <select value={filtroTemp} onChange={e=>setFiltroTemp(e.target.value)} style={{width:"100%",padding:"6px 10px",borderRadius:6,border:"1px solid #93c5fd",fontSize:12,background:"#fff"}}>
              {temporadas.map(p=><option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:3}}>Estado cobranza</div>
            <select value={filtroCobranza} onChange={e=>setFiltroCobranza(e.target.value)} style={{width:"100%",padding:"6px 10px",borderRadius:6,border:"1px solid #93c5fd",fontSize:12,background:"#fff"}}>
              <option>Todos</option><option>Pagado</option><option>Por cobrar</option>
            </select>
          </div>
          <div style={{display:"flex",alignItems:"flex-end"}}>
            <button onClick={()=>{setFiltroPais("Todos");setFiltroEspecie("Todos");setFiltroVariedad("Todos");setFiltroCliente("");setFiltroTemp("Todas");setFiltroCobranza("Todos");}}
              style={{padding:"6px 12px",borderRadius:6,background:"#1e293b",color:"#fff",border:"none",cursor:"pointer",fontSize:11,fontWeight:600}}>↺ Reset</button>
          </div>
        </div>
      </div>

      {/* KPIs operativos */}
      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
        <KpiCard label="Plantaciones" val={tpFilt.length} sub={`${cantContratos} contrato${cantContratos!==1?"s":""}`} col="#15803d"/>
        <KpiCard label="Plantas" val={totPlantas.toLocaleString()} sub={`${totHa.toFixed(2)} há totales`} col="#16a34a"/>
        <KpiCard label="Ingresos facturables" val={fmt(totFact)} sub="100% USD bruto" col="#0f766e"/>
        <KpiCard label="Neto cobrable" val={fmt(totNeto)} sub={`WHT ${fmt(totWHT)}`} col="#0d9488"/>
        <KpiCard label="Cobrado" val={fmt(totPagado)} sub={`${totNeto>0?Math.round(totPagado/totNeto*100):0}% del neto`} col="#22c55e"/>
        <KpiCard label="Por cobrar" val={fmt(porCobrar)} sub="Saldo pendiente" col="#f59e0b"/>
      </div>

      {/* KPIs por concepto */}
      <div style={{background:"#fff",borderRadius:12,padding:16,boxShadow:"0 1px 6px #0001"}}>
        <div style={{fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:12}}>💰 Ingresos por concepto</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{background:"#f8fafc",borderBottom:"2px solid #e2e8f0"}}>
              {["Concepto","Registros","Facturable","WHT","Neto","Cobrado","Por cobrar","%"].map(h=>(
                <th key={h} style={{padding:"8px 10px",textAlign:h==="Concepto"?"left":"right",fontSize:11,fontWeight:700,color:"#475569"}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {[
                {k:"💵 Contract Fee",  fact:cfFact, neto:cfNeto, pagado:cfPagado, n:feFilt.length, col:"#92400e"},
                {k:"🌱 Royalty Planta", fact:rpFact, neto:rpNeto, pagado:rpPagado, n:rpFilt.length, col:"#15803d"},
                {k:"📈 Royalty Comercial", fact:rcFact, neto:rcNeto, pagado:rcPagado, n:rcFilt.length, col:"#9d174d"},
              ].map(row=>{
                const wht = row.fact - row.neto;
                const pc = row.neto - row.pagado;
                const pctPag = row.neto>0?Math.round(row.pagado/row.neto*100):0;
                return (
                  <tr key={row.k} style={{borderBottom:"1px solid #f1f5f9"}}>
                    <td style={{padding:"8px 10px",fontWeight:700,color:row.col}}>{row.k}</td>
                    <td style={{padding:"8px 10px",textAlign:"right"}}>{row.n}</td>
                    <td style={{padding:"8px 10px",textAlign:"right",fontWeight:600}}>{fmt(row.fact)}</td>
                    <td style={{padding:"8px 10px",textAlign:"right",color:wht>0?"#dc2626":"#94a3b8"}}>{wht>0?`-${fmt(wht)}`:"—"}</td>
                    <td style={{padding:"8px 10px",textAlign:"right",fontWeight:700,color:"#0f766e"}}>{fmt(row.neto)}</td>
                    <td style={{padding:"8px 10px",textAlign:"right",fontWeight:700,color:"#22c55e"}}>{fmt(row.pagado)}</td>
                    <td style={{padding:"8px 10px",textAlign:"right",fontWeight:700,color:"#f59e0b"}}>{fmt(pc)}</td>
                    <td style={{padding:"8px 10px",textAlign:"right"}}>
                      <span style={{padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:700,
                        background:pctPag>=80?"#dcfce7":pctPag>=50?"#fef3c7":"#fee2e2",
                        color:pctPag>=80?"#15803d":pctPag>=50?"#92400e":"#991b1b"}}>{pctPag}%</span>
                    </td>
                  </tr>
                );
              })}
              <tr style={{background:"#f0fdfa",fontWeight:900,borderTop:"2px solid #14b8a6"}}>
                <td style={{padding:"10px"}}>TOTAL</td>
                <td style={{padding:"10px",textAlign:"right"}}>{feFilt.length+rpFilt.length+rcFilt.length}</td>
                <td style={{padding:"10px",textAlign:"right",color:"#0f766e"}}>{fmt(totFact)}</td>
                <td style={{padding:"10px",textAlign:"right",color:"#dc2626"}}>{totWHT>0?`-${fmt(totWHT)}`:"—"}</td>
                <td style={{padding:"10px",textAlign:"right",color:"#0f766e"}}>{fmt(totNeto)}</td>
                <td style={{padding:"10px",textAlign:"right",color:"#22c55e"}}>{fmt(totPagado)}</td>
                <td style={{padding:"10px",textAlign:"right",color:"#f59e0b"}}>{fmt(porCobrar)}</td>
                <td style={{padding:"10px",textAlign:"right"}}>{totNeto>0?Math.round(totPagado/totNeto*100):0}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Gráficos */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(360px,1fr))",gap:14}}>
        <div style={{background:"#fff",borderRadius:12,padding:16,boxShadow:"0 1px 6px #0001"}}>
          <div style={{fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:12}}>🌿 Plantas por especie</div>
          <BarChart data={plantasPorEspecie} getLabel={d=>d.especie} getValue={d=>d.plantas} color="#16a34a"
            getColor={d=>{
              const esp = (especiesMaestro||[]).find(e=>e.nombre.toLowerCase().trim()===(d.especie||"").toLowerCase().trim());
              return esp?.color || "#16a34a";
            }}
            fmtVal={v=>v.toLocaleString()}/>
        </div>
        <div style={{background:"#fff",borderRadius:12,padding:16,boxShadow:"0 1px 6px #0001"}}>
          <div style={{fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:12}}>🌍 Hectáreas por país</div>
          <BarChart data={haPorPais} getLabel={d=>d.pais} getValue={d=>d.ha} color="#0284c7" fmtVal={v=>`${v.toFixed(2)} há`}/>
        </div>
        <div style={{background:"#fff",borderRadius:12,padding:16,boxShadow:"0 1px 6px #0001",gridColumn:"1 / -1"}}>
          <div style={{fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:12}}>📈 Royalty Comercial — Comparativo por temporada</div>
          {ingresosPorTemporada.length===0?(
            <div style={{padding:20,textAlign:"center",color:"#94a3b8",fontSize:12}}>Sin datos. Asegúrate que los contratos tengan plantaciones y temporada inicio definida.</div>
          ):(
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr style={{background:"#fce7f3"}}>
                  {["Temporada","Facturable","Cobrado","Por cobrar","%"].map(h=>(
                    <th key={h} style={{padding:"7px 10px",textAlign:h==="Temporada"?"left":"right",fontSize:11,fontWeight:700,color:"#9d174d"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {ingresosPorTemporada.map(r=>{
                    const totT = r.cobrado + r.porCobrar;
                    const pctC = totT>0?Math.round(r.cobrado/totT*100):0;
                    return (
                      <tr key={r.temporada} style={{borderBottom:"1px solid #fce7f3"}}>
                        <td style={{padding:"6px 10px",fontWeight:700,color:"#9d174d"}}>{r.temporada}</td>
                        <td style={{padding:"6px 10px",textAlign:"right",fontWeight:600}}>{fmt(r.fact)}</td>
                        <td style={{padding:"6px 10px",textAlign:"right",color:"#22c55e",fontWeight:700}}>{fmt(r.cobrado)}</td>
                        <td style={{padding:"6px 10px",textAlign:"right",color:"#f59e0b",fontWeight:700}}>{fmt(r.porCobrar)}</td>
                        <td style={{padding:"6px 10px",textAlign:"right"}}>
                          <span style={{padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:700,
                            background:pctC>=80?"#dcfce7":pctC>=50?"#fef3c7":"#fee2e2",
                            color:pctC>=80?"#15803d":pctC>=50?"#92400e":"#991b1b"}}>{pctC}%</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Detalle plantaciones filtradas */}
      <div style={{background:"#fff",borderRadius:12,padding:16,boxShadow:"0 1px 6px #0001"}}>
        <div style={{fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:12}}>📋 Plantaciones filtradas ({tpFilt.length})</div>
        {tpFilt.length===0?(
          <div style={{padding:20,textAlign:"center",color:"#94a3b8",fontSize:12}}>Sin plantaciones que coincidan con los filtros.</div>
        ):(
          <div style={{overflowX:"auto",maxHeight:340}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead style={{position:"sticky",top:0,zIndex:1}}><tr style={{background:"#f8fafc"}}>
                {["Cliente","País","Especie","Variedad","Plantas","Há","Sublicenciatario","Estado"].map(h=>(
                  <th key={h} style={{padding:"6px 8px",textAlign:h==="Plantas"||h==="Há"?"right":"left",fontSize:10,fontWeight:700,color:"#475569",borderBottom:"2px solid #e2e8f0"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {tpFilt.map((p,i)=>{
                  const esp = (especiesMaestro||[]).find(e=>e.nombre.toLowerCase().trim()===(p.especie||"").toLowerCase().trim());
                  return (
                  <tr key={p.id} style={{borderBottom:"1px solid #f1f5f9",background:i%2?"#f8fafc":"#fff"}}>
                    <td style={{padding:"5px 8px",fontWeight:600}}>{p.cliente||"—"}</td>
                    <td style={{padding:"5px 8px"}}>{p.pais||"—"}</td>
                    <td style={{padding:"5px 8px"}}>
                      {esp&&<span style={{display:"inline-block",width:10,height:10,borderRadius:3,background:esp.color,marginRight:6,verticalAlign:"middle"}}/>}
                      {p.especie||"—"}
                    </td>
                    <td style={{padding:"5px 8px",fontWeight:600,color:"#15803d"}}>{p.variedad||"—"}</td>
                    <td style={{padding:"5px 8px",textAlign:"right"}}>{(parseFloat(p.nPlantas)||0).toLocaleString()}</td>
                    <td style={{padding:"5px 8px",textAlign:"right"}}>{(parseFloat(p.hectareas)||0).toFixed(2)}</td>
                    <td style={{padding:"5px 8px",fontStyle:p.sublicenciatario?"normal":"italic",color:p.sublicenciatario?"#0284c7":"#94a3b8"}}>{p.sublicenciatario||"—"}</td>
                    <td style={{padding:"5px 8px"}}>
                      <span style={{padding:"2px 8px",borderRadius:10,fontSize:9,fontWeight:700,
                        background:p.estado==="Productivo"?"#dcfce7":p.estado==="Plantado"?"#fef3c7":p.estado==="Anulado"?"#fee2e2":"#e0e7ff",
                        color:p.estado==="Productivo"?"#15803d":p.estado==="Plantado"?"#92400e":p.estado==="Anulado"?"#991b1b":"#3730a3"}}>{p.estado||"Confirmado"}</span>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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

  const totFE_conFact  = feData.filter(r=>r.nFact&&r.nFact.trim()!=="").reduce((s,r)=>s+(r.montoUSD||0),0);
  const totFE_pendFact = feData.filter(r=>!r.nFact||r.nFact.trim()==="").reduce((s,r)=>s+(r.montoUSD||0),0);
  const totFE_porCobrar= feData.filter(r=>!r.pagado).reduce((s,r)=>s+(r.montoUSD||0),0);
  const totFE_cobrado  = feData.filter(r=>r.pagado).reduce((s,r)=>s+(r.montoUSD||0),0);
  const totFE_facturado= totFE_conFact;

  const totRC_pendFact = rcCalc.filter(r=>!r.nFact||r.nFact.trim()==="").reduce((s,r)=>s+r.montoFact,0);
  const totRC_facturado= rcCalc.filter(r=>r.nFact&&r.nFact.trim()!=="").reduce((s,r)=>s+r.montoFact,0);
  const totRC_porCobrar= rcCalc.filter(r=>!r.pagado).reduce((s,r)=>s+r.montoCobro,0);

  const totFV_pendFact = fvData.filter(r=>!r.nFact||r.nFact.trim()==="").reduce((s,r)=>s+(Number(r.montoFact)||0),0);
  const totFV_facturado= fvData.filter(r=>r.nFact&&r.nFact.trim()!=="").reduce((s,r)=>s+(Number(r.montoFact)||0),0);
  const totFV_porCobrar= fvData.filter(r=>!r.pagado).reduce((s,r)=>s+(Number(r.montoFact)||0),0);

  const grandPendFact  = totRP_pendFact + totFE_pendFact + totRC_pendFact + totFV_pendFact;
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
          ["⏸ Pend. de facturar", $$(grandPendFact),  C.azul, C.azulBg],
          ["📄 Total facturado",   $$(grandFacturado), C.mo,   C.moBg],
          ["⏳ Total por cobrar",  $$(grandPorCobrar), C.am,   C.amBg],
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
          ["Fee Entrada facturado",  $$(totFE_conFact),   C.mo,    C.moBg],
          ["Fee Entrada por cobrar", $$(totFE_porCobrar), C.am,    C.amBg],
          ["Fee Entrada cobrado",    $$(totFE_cobrado),   C.verde, C.verdeBg],
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
// Maestro de Viveristas — empieza vacío, se agregan según necesidad
const VIVERISTAS_INIT = [];
// Maestro de Variedades — empieza vacío, se puede pre-poblar desde contratos obtentores
const VARIEDADES_INIT = [];
// Maestro de Especies — se pre-puebla automáticamente al cargar (ver migración en componente principal)
const ESPECIES_INIT = [];
// Paleta de colores sugeridos para especies
const COLORES_ESPECIES = [
  {nombre:"Rojo cereza",   hex:"#dc2626"},
  {nombre:"Azul arándano", hex:"#1e40af"},
  {nombre:"Morado uva",    hex:"#7c3aed"},
  {nombre:"Verde kiwi",    hex:"#16a34a"},
  {nombre:"Naranja",       hex:"#ea580c"},
  {nombre:"Amarillo",      hex:"#ca8a04"},
  {nombre:"Rosa",          hex:"#db2777"},
  {nombre:"Turquesa",      hex:"#0d9488"},
  {nombre:"Marrón",        hex:"#78350f"},
  {nombre:"Gris",          hex:"#475569"},
];
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const FORMAS_PAGO = ["Anual","Semestral","Trimestral","Mensual","A demanda","Contra entrega","Otro"];
const ESTADOS_DHE = ["No iniciado","Solicitado","En proceso","Aprobado","Rechazado","Vencido","No aplica"];
const PAISES_DHE = ["Chile","Perú","México","Colombia","Argentina","Brasil","Ecuador","Uruguay","España","Estados Unidos","Sudáfrica","China","Australia","Nueva Zelanda","Corea del Sur","Japón","India","Turquía","Marruecos","Egipto","Italia","Francia","Portugal","Países Bajos","Reino Unido","Alemania","Otro"];
const ESTADOS_PBR = ["Pendiente","Solicitado","En Revisión","Otorgado","Vigente","Vencido","Denegado","Retirado"];
const TIPOS_ROYALTY_OBTENTOR = ["Por planta","Por hectárea","Por kilo","% sobre ventas","Mínimo garantizado","Otro"];
const ESTADOS_CONTRATO_OBT = ["Borrador","En revisión","Firmado","Vigente","Vencido","Terminado"];
const ESTADOS_OC = ["Borrador","Confirmada","En producción","Entregada","Pagada parcial","Pagada total","Anulada"];

// ── Royalty Comercial: mes de cobro por defecto según país ──
const RC_MES_DEFAULT_POR_PAIS = {
  "Peru":   "Mayo",
  "Chile":  "Abril",
  "Mexico": "Julio",
  "México": "Julio",
};
// ── Temporada: julio del año T → junio del año T+1 ──
function temporadaActual() {
  const hoy = new Date();
  const año = hoy.getMonth() >= 6 ? hoy.getFullYear() : hoy.getFullYear() - 1;
  return `${año}/${año+1}`;
}
function temporadasEntre(inicioTemp, finFecha) {
  // inicioTemp formato "YYYY/YYYY+1", finFecha en formato fecha o vacío
  if(!inicioTemp) return [];
  const [a1] = String(inicioTemp).split("/").map(s=>parseInt(s));
  if(isNaN(a1)) return [];
  let fin;
  if(finFecha){
    const f = new Date(finFecha);
    fin = isNaN(f.getTime()) ? a1+10 : (f.getMonth()>=6 ? f.getFullYear() : f.getFullYear()-1);
  } else {
    fin = a1+10; // si no hay fin, asumimos 10 temporadas
  }
  const out = [];
  for(let y=a1; y<=fin; y++) out.push(`${y}/${y+1}`);
  return out;
}
// ── Cuotas default Royalty por Planta ──
const RP_CUOTAS_DEFAULT = [
  {id:"cuo_firma",      descripcion:"Al firmar contrato",      pct:50, fechaEvento:""},
  {id:"cuo_plantacion", descripcion:"A la plantación",         pct:50, fechaEvento:""},
];
const MONEDAS=["USD","EUR","CLP","PEN"];

// ═══════════════════════════════════════════════════════════════════
// MODELO DE DATOS — Bloques nuevos (Operación Técnica + Seguimiento)
// ═══════════════════════════════════════════════════════════════════

// Bloque 1: Operación Técnica
const TIPOS_VISITA = ["Técnica","Comercial","Recepción","Vivero","Día de campo","Otra"];

// ── Supabase Storage: fotos de informes ──
// Reutiliza las credenciales de App.jsx (misma instancia Supabase)
const SUPA_URL_OSIRIS = "https://bywovqayuzodbzwsriet.supabase.co";
const SUPA_KEY_OSIRIS = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5d292cWF5dXpvZGJ6d3NyaWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODU1MDgsImV4cCI6MjA5MTI2MTUwOH0.s2x2O_CxE6rl8dBqFuyfQdMyRqSyjJQWXJXesmVGXtk";
const STORAGE_BUCKET = "osiris-fotos";

// Intenta crear el bucket si no existe (silencioso si ya existe)
let _bucketChecked = false;
async function ensureBucket() {
  if(_bucketChecked) return;
  try {
    await fetch(`${SUPA_URL_OSIRIS}/storage/v1/bucket`, {
      method:"POST",
      headers:{apikey:SUPA_KEY_OSIRIS, Authorization:`Bearer ${SUPA_KEY_OSIRIS}`, "Content-Type":"application/json"},
      body:JSON.stringify({id:STORAGE_BUCKET, name:STORAGE_BUCKET, public:true})
    });
  } catch(e) { /* bucket ya existe o sin permisos — no importa */ }
  _bucketChecked = true;
}

// Subir archivo a Supabase Storage, devuelve URL pública
async function uploadFoto(file, informeId) {
  await ensureBucket();
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `informes/${informeId}/${Date.now()}_${Math.random().toString(36).slice(2,6)}.${ext}`;
  const res = await fetch(`${SUPA_URL_OSIRIS}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
    method:"POST",
    headers:{
      apikey:SUPA_KEY_OSIRIS,
      Authorization:`Bearer ${SUPA_KEY_OSIRIS}`,
      "Content-Type": file.type || "image/jpeg",
      "x-upsert": "true",
    },
    body:file,
  });
  if(!res.ok) {
    const err = await res.text();
    console.error("Upload error:", err);
    throw new Error("Error subiendo foto: " + (res.status));
  }
  // URL pública
  return `${SUPA_URL_OSIRIS}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
}
const ESTADOS_VISITA = ["Programada","Realizada","Cancelada","Reprogramada"];
const ESTADOS_MEDIDA = ["Abierta","En proceso","Cerrada","Descartada"];
const ESTADOS_TEST_BLOCK = ["Planificado","En curso","Finalizado","Cancelado"];
const TIPOS_INFORME = ["Visita Técnica","Visita Comercial","Recepción","Medida Correctiva","Final de Temporada","Otro"];
const ENTREGABLES_SUBLICENCIADO = ["Brochure","Presentaciones","Manual técnico","Informes","Días de campo","Otros"];

// Bloque 2: Estado de pedido enriquecido (Productores)
const ESTADOS_PEDIDO = ["Cotizado","OC enviada","Negociando","Confirmado","En producción","Despachado","Recibido","Anulado"];
const ESTADOS_DESPACHO = ["Programado","En tránsito","Entregado","Con observaciones"];

// Bloque 3: Estado OC Vivero enriquecido
const ESTADOS_OC_VIVERO = ["Borrador","Enviada","Negociando","Confirmada","En producción","Lista","Despachada","Recibida","Anulada"];

const SECCIONES_CT=[
  {id:"empresa",         label:"🏢 Empresa",            color:"#2563eb"},
  {id:"contrato",        label:"📄 Contrato",            color:"#7c3aed"},
  {id:"rep",             label:"👤 Representante",       color:"#0f766e"},
  {id:"ubicacion",       label:"🌱 Ubicación plantas",   color:"#16a34a"},
  {id:"plantaciones",    label:"🌿 Plantaciones",        color:"#15803d"},
  {id:"sublicenciatarios",label:"🤝 Sublicenciatarios",   color:"#0284c7"},
  {id:"factura",         label:"💰 Facturación",         color:"#d97706"},
  {id:"cobros",          label:"💵 Cobros derivados",    color:"#be185d"},
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
      const anterior = clientes.find(c=>c.id===editId);
      setClientes(prev=>prev.map(c=>c.id===editId?{...c,...form}:c));
      // Auditar cambios campo a campo
      if(anterior) {
        Object.keys(form).forEach(k=>{
          if(String(anterior[k]||"") !== String(form[k]||"")) {
            window.auditLog&&window.auditLog("editar", {modulo:"osiris", seccion:"Maestro Clientes",
              descripcion:`Editó cliente "${form.razonSocial||anterior.razonSocial}": campo ${k}`,
              registroId:editId, campo:k,
              valorAnterior:String(anterior[k]||""), valorNuevo:String(form[k]||"")});
          }
        });
      }
      setEditId(null);
    } else {
      const id = `cli_${Date.now()}`;
      setClientes(prev=>[...prev,{...form,id}]);
      window.auditLog&&window.auditLog("crear", {modulo:"osiris", seccion:"Maestro Clientes",
        descripcion:`Creó cliente "${form.razonSocial}" · ${form.pais||""}`,
        registroId:id});
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
                    <button onClick={()=>{
                      if(!window.confirm(`¿Eliminar cliente "${c.razonSocial}"?`))return;
                      window.auditLog&&window.auditLog("eliminar", {modulo:"osiris", seccion:"Maestro Clientes",
                        descripcion:`Eliminó cliente "${c.razonSocial}" · ${c.pais||""}`,
                        registroId:c.id});
                      setClientes(prev=>prev.filter(x=>x.id!==c.id));
                    }}
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

// ── Maestro de Viveristas ────────────────────────────────────
// Misma estructura que Maestro Clientes (todos los campos)
function MaestroViveristas({viveristas,setViveristas,can}){
  const [editId,setEditId]=useState(null);
  const VACIO={razonSocial:"",nombreComercial:"",taxID:"",pais:"Chile",direccion:"",ciudad:"",repLegal:"",rucRep:"",contactoCobranza:""};
  const [form,setForm]=useState(VACIO);
  const [showForm,setShowForm]=useState(false);
  const [busq,setBusq]=useState("");

  function guardar(){
    if(!form.razonSocial.trim()){alert("Razón Social es obligatoria.");return;}
    if(editId){
      const anterior = viveristas.find(v=>v.id===editId);
      setViveristas(prev=>prev.map(v=>v.id===editId?{...v,...form}:v));
      if(anterior) {
        Object.keys(form).forEach(k=>{
          if(String(anterior[k]||"") !== String(form[k]||"")) {
            window.auditLog&&window.auditLog("editar", {modulo:"osiris", seccion:"Maestro Viveristas",
              descripcion:`Editó viverista "${form.razonSocial||anterior.razonSocial}": campo ${k}`,
              registroId:editId, campo:k,
              valorAnterior:String(anterior[k]||""), valorNuevo:String(form[k]||"")});
          }
        });
      }
      setEditId(null);
    } else {
      const id = `vrs_${Date.now()}`;
      setViveristas(prev=>[...prev,{...form,id}]);
      window.auditLog&&window.auditLog("crear", {modulo:"osiris", seccion:"Maestro Viveristas",
        descripcion:`Creó viverista "${form.razonSocial}" · ${form.pais||""}`,
        registroId:id});
    }
    setForm(VACIO);
    setShowForm(false);
  }
  function iniciarEdicion(v){
    setForm({razonSocial:v.razonSocial||"",nombreComercial:v.nombreComercial||"",taxID:v.taxID||"",pais:v.pais||"Chile",direccion:v.direccion||"",ciudad:v.ciudad||"",repLegal:v.repLegal||"",rucRep:v.rucRep||"",contactoCobranza:v.contactoCobranza||""});
    setEditId(v.id);setShowForm(true);
  }

  const filtrado = (viveristas||[]).filter(v=>!busq||v.razonSocial.toLowerCase().includes(busq.toLowerCase())||
    (v.nombreComercial||"").toLowerCase().includes(busq.toLowerCase()));
  const CAMPOS=[["Razón Social *","razonSocial","text"],["Nombre Comercial","nombreComercial","text"],["TAX ID / RUC","taxID","text"],["País","pais","select"],["Dirección","direccion","text"],["Ciudad","ciudad","text"],["Representante Legal","repLegal","text"],["RUC Representante","rucRep","text"],["Contacto Cobranza","contactoCobranza","text"]];

  return(
    <div style={{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:12,padding:"16px 20px",marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:13,fontWeight:700,color:"#16a34a"}}>🌱 Maestro de Viveristas</div>
        <div style={{display:"flex",gap:8}}>
          <input value={busq} onChange={e=>setBusq(e.target.value)} placeholder="Buscar..."
            style={{padding:"5px 10px",borderRadius:6,border:"1px solid #86efac",fontSize:12,outline:"none"}}/>
          {can&&<button onClick={()=>{setShowForm(v=>!v);setEditId(null);setForm(VACIO);}}
            style={{padding:"6px 14px",borderRadius:6,background:"#16a34a",color:"#fff",border:"none",cursor:"pointer",fontSize:12,fontWeight:600}}>
            {showForm&&!editId?"✕":"+ Nuevo viverista"}
          </button>}
        </div>
      </div>

      {showForm&&can&&(
        <div style={{background:"#fff",borderRadius:10,padding:"14px 16px",marginBottom:12,border:"1px solid #86efac"}}>
          <div style={{fontSize:12,fontWeight:700,color:"#16a34a",marginBottom:10}}>{editId?"Editar viverista":"Nuevo viverista"}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:10,marginBottom:12}}>
            {CAMPOS.map(([lbl,campo,tipo])=>(
              <div key={campo}>
                <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:3}}>{lbl}</div>
                {tipo==="select"
                  ? <select value={form[campo]} onChange={e=>setForm(p=>({...p,[campo]:e.target.value}))}
                      style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,outline:"none"}}>
                      {["Chile","Peru","Mexico","Corea","España","Argentina","Otro"].map(o=><option key={o}>{o}</option>)}
                    </select>
                  : <input type={tipo} value={form[campo]} onChange={e=>setForm(p=>({...p,[campo]:e.target.value}))}
                      style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,outline:"none",boxSizing:"border-box"}}/>
                }
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button onClick={()=>{setShowForm(false);setEditId(null);}} style={{padding:"6px 16px",borderRadius:6,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:12}}>Cancelar</button>
            <button onClick={guardar} style={{padding:"6px 16px",borderRadius:6,background:"#16a34a",color:"#fff",border:"none",cursor:"pointer",fontSize:12,fontWeight:600}}>💾 Guardar</button>
          </div>
        </div>
      )}

      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",background:"#fff",borderRadius:8,overflow:"hidden",fontSize:12}}>
          <thead><tr style={{background:"#16a34a",color:"#fff"}}>
            {["Razón Social","Nombre Comercial","TAX ID","País","Ciudad","Rep. Legal","Contacto Cobranza",""].map(h=>(
              <th key={h} style={{padding:"7px 10px",textAlign:"left",fontWeight:600,fontSize:11,whiteSpace:"nowrap"}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtrado.map((v,i)=>(
              <tr key={v.id} style={{borderBottom:"1px solid #f0fdf4",background:i%2===0?"#fff":"#f0fdf4"}}>
                <td style={{padding:"6px 10px",fontWeight:600,color:"#16a34a"}}>{v.razonSocial}</td>
                <td style={{padding:"6px 10px",color:"#64748b"}}>{v.nombreComercial||"—"}</td>
                <td style={{padding:"6px 10px",color:"#64748b",fontSize:11}}>{v.taxID||"—"}</td>
                <td style={{padding:"6px 10px",color:"#64748b"}}>{v.pais}</td>
                <td style={{padding:"6px 10px",color:"#64748b"}}>{v.ciudad||"—"}</td>
                <td style={{padding:"6px 10px",color:"#64748b",fontSize:11}}>{v.repLegal||"—"}</td>
                <td style={{padding:"6px 10px",color:"#64748b",fontSize:11}}>{v.contactoCobranza||"—"}</td>
                <td style={{padding:"6px 8px",textAlign:"center"}}>
                  {can&&<div style={{display:"flex",gap:4}}>
                    <button onClick={()=>iniciarEdicion(v)} style={{background:"#dbeafe",border:"none",borderRadius:4,padding:"3px 8px",cursor:"pointer",fontSize:11,color:"#1d4ed8",fontWeight:600}}>✏️</button>
                    <button onClick={()=>{
                      if(!window.confirm(`¿Eliminar viverista "${v.razonSocial}"?`))return;
                      window.auditLog&&window.auditLog("eliminar", {modulo:"osiris", seccion:"Maestro Viveristas",
                        descripcion:`Eliminó viverista "${v.razonSocial}" · ${v.pais||""}`,
                        registroId:v.id});
                      setViveristas(prev=>prev.filter(x=>x.id!==v.id));
                    }}
                      style={{background:"#fee2e2",border:"none",borderRadius:4,padding:"3px 8px",cursor:"pointer",fontSize:11,color:"#991b1b",fontWeight:600}}>×</button>
                  </div>}
                </td>
              </tr>
            ))}
            {filtrado.length===0&&<tr><td colSpan={8} style={{textAlign:"center",padding:20,color:"#94a3b8"}}>Sin viveristas. {can?"Agrega uno con \"+ Nuevo viverista\".":""}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// OPERACIÓN TÉCNICA — Hub transversal (visitas, informes, test blocks,
// equipo técnico, medidas correctivas, entregables)
// ═══════════════════════════════════════════════════════════════════
function OperacionTecnica({data, setData, ctData=[], viverosData=[], obtentoresData=[], can, usuarioActual={}}) {
  const [subTab, setSubTab] = useState("visitas");
  const [modal, setModal] = useState(null);
  const [busq, setBusq] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("Todos");
  const [filtroEstado, setFiltroEstado] = useState("Todos");

  // Data slices (defensivo)
  const visitas       = Array.isArray(data?.visitas)       ? data.visitas       : [];
  const informes      = Array.isArray(data?.informes)      ? data.informes      : [];
  const equipoTecnico = Array.isArray(data?.equipoTecnico) ? data.equipoTecnico : [];
  const entregables   = Array.isArray(data?.entregables)   ? data.entregables   : [];

  const upd = (key, val) => setData(prev => ({...(prev||{}), [key]: val}));

  // Permisos
  const esGteTecnico = usuarioActual?.rol === "gerente_tecnico" || usuarioActual?.rol === "admin";
  const nombreUsuario = usuarioActual?.nombre || "Usuario";

  // Detalle informe
  const [informeDetalle, setInformeDetalle] = useState(null);
  const [envioModal, setEnvioModal] = useState(false);
  const [emailsEnvio, setEmailsEnvio] = useState("");

  // CRUD helpers
  function addItem(key, item) {
    const id = `${key.slice(0,3)}_${Date.now()}`;
    upd(key, [...(data?.[key]||[]), {...item, id}]);
    window.auditLog&&window.auditLog("crear",{modulo:"osiris",seccion:`Op. Técnica · ${key}`,descripcion:`Creó ${key}: ${item.titulo||item.nombre||item.tipo||""}`});
    return id;
  }
  function updItem(key, id, changes) {
    upd(key, (data?.[key]||[]).map(x=>x.id===id?{...x,...changes}:x));
  }
  function delItem(key, id, label) {
    if(!window.confirm(`¿Eliminar "${label}"?`)) return;
    upd(key, (data?.[key]||[]).filter(x=>x.id!==id));
    window.auditLog&&window.auditLog("eliminar",{modulo:"osiris",seccion:`Op. Técnica · ${key}`,descripcion:`Eliminó: ${label}`,registroId:id});
  }

  // Forms vacíos
  const VACIO_VISITA = {tipo:"Técnica",fecha:"",cliente:"",ctId:"",viveroId:"",lugar:"",objetivo:"",resultado:"",estado:"Programada",responsable:"",fotos:"",observaciones:"",
    // Campos extra para Test Block
    testBlockNombre:"",testBlockEspecie:"",testBlockVariedad:"",testBlockUbicacion:"",testBlockResultados:""};
  const VACIO_TECNICO = {nombre:"",rol:"Asesor por especie",especie:"",email:"",telefono:"",modalidad:"Part time",observaciones:""};
  const VACIO_ENTREGABLE = {ctId:"",sublicenciatario:"",items:ENTREGABLES_SUBLICENCIADO.map(e=>({nombre:e,entregado:false,fecha:"",observaciones:""}))};
  const ESTADOS_INFORME = ["Borrador","En revisión","Aprobado","Rechazado","Enviado"];
  const [form, setForm] = useState({});

  // Helpers
  const clientesOpts = useMemo(()=>(ctData||[]).map(c=>({id:c.id,label:`${c.razonSocial} · ${c.pais}`})),[ctData]);
  const nombreCliente = (ctId) => { const ct = (ctData||[]).find(c=>c.id===ctId); return ct ? `${ct.razonSocial} · ${ct.pais}` : "—"; };

  // KPIs
  const kpis = useMemo(()=>{
    const hoy = new Date().toISOString().slice(0,10);
    const visitasSinInforme = visitas.filter(v=>v.estado==="Realizada"&&!informes.some(i=>i.visitaId===v.id));
    return {
      visitasProg: visitas.filter(v=>v.estado==="Programada"&&v.fecha>=hoy).length,
      visitasRealizadas: visitas.filter(v=>v.estado==="Realizada").length,
      informesPend: visitasSinInforme.length,
      informesBorrador: informes.filter(i=>i.estado==="Borrador"||i.estado==="Rechazado").length,
      informesRevision: informes.filter(i=>i.estado==="En revisión").length,
      tecnicos: equipoTecnico.length,
      entregablesPend: entregables.reduce((s,e)=>s+(e.items||[]).filter(i=>!i.entregado).length,0),
    };
  },[visitas,informes,equipoTecnico,entregables]);

  const TABS = [
    {id:"visitas",     label:"📋 Visitas",       badge:kpis.visitasProg||null},
    {id:"informes",    label:"📝 Informes",       badge:(kpis.informesPend+kpis.informesBorrador+kpis.informesRevision)||null},
    {id:"equipo",      label:"👨‍🔬 Equipo Técnico", badge:kpis.tecnicos||null},
    {id:"entregables", label:"📦 Entregables",     badge:kpis.entregablesPend||null},
  ];

  function guardarForm(key, vacio) {
    if(form._editId) { updItem(key, form._editId, form); }
    else { addItem(key, form); }
    setForm({}); setModal(null);
  }
  function abrirNuevo(modalKey, vacio) { setForm({...vacio}); setModal(modalKey); }
  function abrirEditar(modalKey, item) { setForm({...item, _editId:item.id}); setModal(modalKey); }

  // Crear informe desde visita (1:1)
  function crearInformeDesdeVisita(visita) {
    const ct = (ctData||[]).find(c=>c.id===visita.ctId);
    const nuevoInforme = {
      visitaId: visita.id,
      tipo: visita.tipo,
      titulo: `Informe ${visita.tipo} — ${ct?.razonSocial||visita.lugar||""}`,
      fecha: visita.fecha,
      ctId: visita.ctId,
      especie: visita.testBlockEspecie||"",
      variedad: visita.testBlockVariedad||"",
      lugar: visita.lugar,
      responsable: visita.responsable,
      responsableCargo: "",
      // 9 secciones
      objetivo: visita.objetivo||"",
      observacionesCampo: visita.resultado||"",
      recomendaciones: "",
      medidasCorrectivas: "",
      registroFotografico: visita.fotos||"",
      conclusiones: "",
      proximaVisitaFecha: "",
      proximaVisitaObjetivo: "",
      adjunto: "",
      // Workflow
      estado: "Borrador",
      revisor: "",
      revisorCargo: "",
      observacionesRechazo: "",
      fechaAprobacion: "",
      emailsDestino: "",
      fechaEnvio: "",
    };
    const id = addItem("informes", nuevoInforme);
    // Abrir el detalle
    setTimeout(()=>{
      const lista = data?.informes||[];
      const ultimo = lista[lista.length]; // el recién creado tiene id generado
      setSubTab("informes");
      // El ID se generó en addItem — buscar por visitaId
      const creado = [...(data?.informes||[]), {...nuevoInforme, id}].find(i=>i.visitaId===visita.id);
      if(creado) setInformeDetalle(creado.id);
    },100);
  }

  // Generar HTML del informe
  function generarHTMLInforme(inf) {
    const ct = (ctData||[]).find(c=>c.id===inf.ctId);
    const fotos = (inf.registroFotografico||"").split(",").map(u=>u.trim()).filter(Boolean);
    const visita = visitas.find(v=>v.id===inf.visitaId);
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${inf.titulo}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,sans-serif;color:#1e293b;font-size:12px;line-height:1.6;padding:40px 50px}
.header{text-align:center;border-bottom:2px solid #0f766e;padding-bottom:16px;margin-bottom:20px}
.header h1{font-size:18px;color:#0f766e;margin-bottom:2px}
.header .sub{font-size:11px;color:#64748b}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 20px;margin-bottom:16px}
.grid .label{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px}
.grid .value{font-size:12px;font-weight:600}
.section{margin-bottom:14px}
.section h2{font-size:13px;font-weight:700;color:#0f766e;background:#f0fdfa;padding:6px 10px;border-radius:4px;margin-bottom:6px}
.section .content{padding:0 10px;font-size:12px;color:#334155;white-space:pre-wrap}
.fotos{display:flex;flex-wrap:wrap;gap:10px;padding:0 10px}
.fotos img{width:180px;height:130px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0}
.firma{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;border-top:2px solid #e2e8f0;padding-top:16px;margin-top:24px}
.firma .col{text-align:center}.firma .col .name{font-weight:700;font-size:12px}.firma .col .cargo{font-size:10px;color:#64748b}
@media print{body{padding:20px 30px}.fotos img{width:150px;height:110px}}
</style></head><body>
<div class="header">
<div style="font-size:10px;color:#64748b;letter-spacing:2px">OSIRIS PLANT MANAGEMENT</div>
<h1>${inf.titulo||'Informe Técnico'}</h1>
<div class="sub">N° INF-${new Date(inf.fecha||Date.now()).getFullYear()}-${String(inf.id||'').slice(-4).padStart(4,'0')} · ${inf.fecha||''} · ${inf.tipo||''}</div>
</div>
<div class="grid">
<div><div class="label">Cliente</div><div class="value">${ct?.razonSocial||'—'} · ${ct?.pais||''}</div></div>
<div><div class="label">Predio / Ubicación</div><div class="value">${inf.lugar||'—'}</div></div>
<div><div class="label">Tipo</div><div class="value">${inf.tipo||'—'}</div></div>
<div><div class="label">Responsable</div><div class="value">${inf.responsable||'—'}</div></div>
<div><div class="label">Especie / Variedad</div><div class="value">${inf.especie||'—'}${inf.variedad?' · '+inf.variedad:''}</div></div>
<div><div class="label">Fecha visita</div><div class="value">${visita?.fecha||inf.fecha||'—'}</div></div>
</div>
<div class="section"><h2>1. Objetivo</h2><div class="content">${inf.objetivo||'—'}</div></div>
<div class="section"><h2>2. Observaciones de campo</h2><div class="content">${inf.observacionesCampo||'—'}</div></div>
<div class="section"><h2>3. Recomendaciones</h2><div class="content">${inf.recomendaciones||'—'}</div></div>
<div class="section"><h2>4. Medidas correctivas</h2><div class="content">${inf.medidasCorrectivas||'Sin medidas correctivas requeridas'}</div></div>
<div class="section"><h2>5. Registro fotográfico</h2>${fotos.length>0?'<div class="fotos">'+fotos.map((u,i)=>'<img src="'+u+'" alt="Foto '+(i+1)+'"/>').join('')+'</div>':'<div class="content">Sin fotos adjuntas</div>'}</div>
<div class="section"><h2>6. Conclusiones</h2><div class="content">${inf.conclusiones||'—'}</div></div>
<div class="section"><h2>7. Próxima visita</h2><div class="content">${inf.proximaVisitaFecha?inf.proximaVisitaFecha+' — '+(inf.proximaVisitaObjetivo||''):'No programada'}</div></div>
<div class="firma">
<div class="col"><div class="name">${inf.responsable||'—'}</div><div class="cargo">Elaborado por</div></div>
<div class="col"><div class="name">${inf.revisor||'(Pendiente)'}</div><div class="cargo">Revisado por</div>${inf.fechaAprobacion?'<div style="font-size:9px;color:#16a34a;margin-top:2px">Aprobado '+inf.fechaAprobacion+'</div>':''}</div>
<div class="col"><div class="name">Próxima: ${inf.proximaVisitaFecha||'—'}</div><div class="cargo">${inf.proximaVisitaObjetivo||''}</div></div>
</div></body></html>`;
  }
  function generarPDF(inf) {
    const w = window.open('','_blank','width=800,height=1100');
    w.document.write(generarHTMLInforme(inf)); w.document.close();
    setTimeout(()=>w.print(), 500);
  }
  async function enviarPorEmail(inf, emails) {
    if(!emails||!emails.trim()){alert("Ingresa al menos un email.");return false;}
    const ct = (ctData||[]).find(c=>c.id===inf.ctId);
    const mensaje = `📄 INFORME TÉCNICO — Osiris Plant Management\n\nTítulo: ${inf.titulo}\nTipo: ${inf.tipo}\nFecha: ${inf.fecha}\nCliente: ${ct?.razonSocial||'—'}\nResponsable: ${inf.responsable}\n\n── Objetivo ──\n${inf.objetivo||'—'}\n\n── Observaciones ──\n${inf.observacionesCampo||'—'}\n\n── Recomendaciones ──\n${inf.recomendaciones||'—'}\n\n── Medidas Correctivas ──\n${inf.medidasCorrectivas||'—'}\n\n── Conclusiones ──\n${inf.conclusiones||'—'}\n\n— Osiris Plant Management · Grupo Mediterra`;
    try {
      const emailList = emails.split(',').map(e=>e.trim()).filter(Boolean);
      for(const email of emailList) {
        await fetch("https://api.emailjs.com/api/v1.0/email/send", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body:JSON.stringify({service_id:"service_7uisg69",template_id:"template_0m92glq",user_id:"vJgNsLqJpkCi17Ucd",
            template_params:{to_email:email,to_name:ct?.razonSocial||"Cliente",subject:`📄 Informe: ${inf.titulo} — Osiris`,message:mensaje}})
        });
      }
      return true;
    } catch(e) { console.error("Error email:", e); alert("Error al enviar."); return false; }
  }

  // ── UI Helpers ──
  const ClienteSelect = ({value, onChange, disabled}) => (
    <select disabled={disabled} value={value||""} onChange={e=>onChange(e.target.value)}
      style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,background:"#fff",boxSizing:"border-box"}}>
      <option value="">— Seleccionar cliente —</option>
      {(ctData||[]).map(c=><option key={c.id} value={c.id}>{c.razonSocial} · {c.pais}</option>)}
    </select>
  );
  const Input = ({label,value,onChange,type="text",placeholder="",disabled=false,rows=0}) => (
    <div>
      <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:3}}>{label}</div>
      {rows>0?<textarea disabled={disabled} value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows}
        style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,resize:"vertical",boxSizing:"border-box"}}/>
      :<input type={type} disabled={disabled} value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box"}}/>}
    </div>
  );
  const Select = ({label,value,onChange,opts=[],disabled=false}) => (
    <div>
      <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:3}}>{label}</div>
      <select disabled={disabled} value={value||""} onChange={e=>onChange(e.target.value)}
        style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,background:"#fff",boxSizing:"border-box"}}>
        <option value="">— Seleccionar —</option>
        {opts.map(o=><option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
  const BadgeEstado = ({estado}) => {
    const c = {"Programada":"#3b82f6","Realizada":"#16a34a","Cancelada":"#94a3b8","Reprogramada":"#d97706",
      "Borrador":"#64748b","En revisión":"#d97706","Aprobado":"#2563eb","Rechazado":"#dc2626","Enviado":"#16a34a",
      "Técnica":"#0f766e","Comercial":"#2563eb","Test Block":"#7c3aed","Recepción":"#d97706","Día de campo":"#16a34a","Vivero":"#0284c7",
    }[estado]||"#64748b";
    return <span style={{padding:"3px 10px",borderRadius:20,fontSize:10,fontWeight:700,background:`${c}18`,color:c,border:`1px solid ${c}33`,whiteSpace:"nowrap"}}>{estado}</span>;
  };
  function ModalForm({titulo, onSave, children}) {
    return (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setModal(null)}>
        <div style={{background:"#fff",borderRadius:16,padding:"24px 28px",maxWidth:620,width:"100%",maxHeight:"85vh",overflow:"auto",boxShadow:"0 24px 64px #0004"}} onClick={e=>e.stopPropagation()}>
          <div style={{fontSize:16,fontWeight:800,color:"#1e293b",marginBottom:16}}>{titulo}</div>
          {children}
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:20}}>
            <button onClick={()=>setModal(null)} style={{padding:"8px 20px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:12}}>Cancelar</button>
            <button onClick={onSave} style={{padding:"8px 20px",borderRadius:8,background:"#1e293b",color:"#fff",border:"none",cursor:"pointer",fontSize:12,fontWeight:700}}>💾 Guardar</button>
          </div>
        </div>
      </div>
    );
  }
  function TablaGenerica({cols, rows, onEdit, onDel, emptyMsg, extraAction}) {
    return (
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,background:"#fff",borderRadius:10,overflow:"hidden",border:"1px solid #e2e8f0"}}>
          <thead><tr style={{background:"#1e293b",color:"#fff"}}>
            {cols.map(c=><th key={c.label} style={{padding:"8px 10px",textAlign:c.right?"right":"left",fontSize:11,fontWeight:700,whiteSpace:"nowrap",width:c.w||"auto"}}>{c.label}</th>)}
            {(can||extraAction)&&<th style={{padding:"8px 10px",width:90}}></th>}
          </tr></thead>
          <tbody>
            {rows.length===0&&<tr><td colSpan={cols.length+(can||extraAction?1:0)} style={{textAlign:"center",padding:32,color:"#94a3b8",fontSize:13}}>{emptyMsg||"Sin registros"}</td></tr>}
            {rows.map((r,i)=>(
              <tr key={r.id} style={{borderBottom:"1px solid #f1f5f9",background:i%2?"#f8fafc":"#fff"}}>
                {cols.map(c=><td key={c.label} style={{padding:"7px 10px",textAlign:c.right?"right":"left",...(c.style||{})}}>{c.render?c.render(r):r[c.field]||"—"}</td>)}
                {(can||extraAction)&&<td style={{padding:"4px 6px",textAlign:"center"}}>
                  <div style={{display:"flex",gap:4,justifyContent:"center"}}>
                    {extraAction&&extraAction(r)}
                    {can&&<button onClick={()=>onEdit(r)} style={{background:"#dbeafe",border:"none",borderRadius:4,padding:"3px 8px",cursor:"pointer",fontSize:11,color:"#1d4ed8",fontWeight:600}}>✏️</button>}
                    {can&&<button onClick={()=>onDel(r)} style={{background:"#fee2e2",border:"none",borderRadius:4,padding:"3px 8px",cursor:"pointer",fontSize:11,color:"#991b1b",fontWeight:600}}>×</button>}
                  </div>
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  function filtrar(arr, campoTipo="tipo", campoEstado="estado") {
    return arr.filter(r=>
      (filtroTipo==="Todos"||r[campoTipo]===filtroTipo)&&
      (filtroEstado==="Todos"||r[campoEstado]===filtroEstado)&&
      (!busq||JSON.stringify(r).toLowerCase().includes(busq.toLowerCase()))
    );
  }

  return (
    <div style={{fontFamily:"'IBM Plex Sans',system-ui,sans-serif"}}>
      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10,marginBottom:16}}>
        {[
          {label:"Visitas programadas",val:kpis.visitasProg,col:"#3b82f6",bg:"#dbeafe"},
          {label:"Visitas realizadas",val:kpis.visitasRealizadas,col:"#16a34a",bg:"#dcfce7"},
          {label:"Sin informe",val:kpis.informesPend,col:"#dc2626",bg:"#fee2e2"},
          {label:"Informes en revisión",val:kpis.informesRevision,col:"#d97706",bg:"#fef3c7"},
          {label:"Técnicos",val:kpis.tecnicos,col:"#0f766e",bg:"#ccfbf1"},
          {label:"Entregables pend.",val:kpis.entregablesPend,col:"#7c3aed",bg:"#ede9fe"},
        ].map(k=>(
          <div key={k.label} style={{background:k.bg,borderRadius:10,padding:"10px 14px"}}>
            <div style={{fontSize:10,color:k.col,fontWeight:600}}>{k.label}</div>
            <div style={{fontSize:22,fontWeight:800,color:k.col}}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Sub-tabs */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>{setSubTab(t.id);setFiltroTipo("Todos");setFiltroEstado("Todos");setBusq("");setInformeDetalle(null);}}
            style={{padding:"8px 14px",borderRadius:8,border:subTab===t.id?"2px solid #1e293b":"1px solid #e2e8f0",
              background:subTab===t.id?"#1e293b":"#fff",color:subTab===t.id?"#fff":"#1e293b",
              cursor:"pointer",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
            {t.label}
            {t.badge&&<span style={{background:subTab===t.id?"#fff":"#dc2626",color:subTab===t.id?"#1e293b":"#fff",borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:800}}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* Barra filtros */}
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <input value={busq} onChange={e=>setBusq(e.target.value)} placeholder="Buscar..."
          style={{padding:"7px 12px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,flex:1,minWidth:150,outline:"none"}}/>
        {can&&subTab!=="informes"&&<button onClick={()=>{
          if(subTab==="visitas") abrirNuevo("visita", VACIO_VISITA);
          else if(subTab==="equipo") abrirNuevo("tecnico", VACIO_TECNICO);
          else if(subTab==="entregables") abrirNuevo("entregable", VACIO_ENTREGABLE);
        }} style={{padding:"8px 16px",borderRadius:8,background:"#1e293b",color:"#fff",border:"none",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Agregar</button>}
      </div>

      {/* ════ TAB: VISITAS ════ */}
      {subTab==="visitas"&&<TablaGenerica
        cols={[
          {label:"Fecha",field:"fecha",w:90},
          {label:"Tipo",render:r=><BadgeEstado estado={r.tipo}/>,w:110},
          {label:"Cliente / Vivero",render:r=>r.ctId?nombreCliente(r.ctId):(r.viveroId?(viverosData||[]).find(v=>v.id===r.viveroId)?.viverista||"—":"—")},
          {label:"Lugar",field:"lugar"},
          {label:"Responsable",field:"responsable"},
          {label:"Estado",render:r=><BadgeEstado estado={r.estado}/>,w:110},
          {label:"Informe",render:r=>{
            const inf = informes.find(i=>i.visitaId===r.id);
            if(inf) return <span onClick={()=>{setSubTab("informes");setInformeDetalle(inf.id);}} style={{color:"#2563eb",cursor:"pointer",fontSize:11,fontWeight:600,textDecoration:"underline"}}>📝 Ver</span>;
            if(r.estado==="Realizada"&&can) return <button onClick={()=>crearInformeDesdeVisita(r)} style={{padding:"3px 8px",borderRadius:6,background:"#16a34a",color:"#fff",border:"none",cursor:"pointer",fontSize:10,fontWeight:700}}>📝 Crear</button>;
            return <span style={{color:"#94a3b8",fontSize:10}}>—</span>;
          },w:80},
        ]}
        rows={filtrar(visitas)}
        onEdit={r=>abrirEditar("visita",r)}
        onDel={r=>delItem("visitas",r.id,`Visita ${r.tipo} ${r.fecha}`)}
        emptyMsg="Sin visitas. Programa la primera visita técnica, comercial o test block."
      />}

      {/* ════ TAB: INFORMES ════ */}
      {subTab==="informes"&&(informeDetalle?(()=>{
        const inf = informes.find(i=>i.id===informeDetalle);
        if(!inf) { setInformeDetalle(null); return null; }
        const ct = (ctData||[]).find(c=>c.id===inf.ctId);
        const visita = visitas.find(v=>v.id===inf.visitaId);
        const puedeEditar = can && (inf.estado==="Borrador"||inf.estado==="Rechazado");
        const puedeAprobar = esGteTecnico && inf.estado==="En revisión";
        const puedeEnviar = esGteTecnico && (inf.estado==="Aprobado"||inf.estado==="Enviado");
        const updInf = (campo, valor) => updItem("informes", inf.id, {[campo]:valor});
        return (
          <div>
            <button onClick={()=>setInformeDetalle(null)} style={{marginBottom:14,padding:"7px 14px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:12,fontWeight:600}}>← Volver</button>
            {/* Vinculación con visita */}
            {visita&&<div style={{padding:"8px 14px",background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:8,marginBottom:12,fontSize:12,color:"#0369a1"}}>
              🔗 Vinculado a visita: <strong>{visita.tipo}</strong> del {visita.fecha} — {visita.lugar||""} ({visita.estado})
            </div>}
            {/* Workflow */}
            <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:16,padding:"12px 16px",background:"#f8fafc",borderRadius:10,border:"1px solid #e2e8f0",flexWrap:"wrap"}}>
              {ESTADOS_INFORME.filter(e=>e!=="Rechazado").map((est,i)=>{
                const activo = inf.estado===est||(est==="Borrador"&&inf.estado==="Rechazado");
                const pasado = ESTADOS_INFORME.indexOf(inf.estado)>ESTADOS_INFORME.indexOf(est);
                const col = {Borrador:"#64748b","En revisión":"#d97706",Aprobado:"#2563eb",Enviado:"#16a34a"}[est]||"#64748b";
                return <React.Fragment key={est}>
                  {i>0&&<div style={{width:24,height:2,background:pasado?col:"#e2e8f0"}}/>}
                  <div style={{padding:"6px 14px",borderRadius:20,fontSize:11,fontWeight:700,background:activo?`${col}22`:"#f1f5f9",color:activo?col:"#94a3b8",border:`1.5px solid ${activo?col:"#e2e8f0"}`}}>
                    {est==="Borrador"&&inf.estado==="Rechazado"?"⚠️ Rechazado":est}
                  </div>
                </React.Fragment>;
              })}
              <div style={{marginLeft:"auto",display:"flex",gap:6,flexWrap:"wrap"}}>
                {puedeEditar&&inf.estado==="Borrador"&&<button onClick={()=>updInf("estado","En revisión")} style={{padding:"6px 14px",borderRadius:8,background:"#d97706",color:"#fff",border:"none",cursor:"pointer",fontSize:11,fontWeight:700}}>📤 Enviar a revisión</button>}
                {puedeEditar&&inf.estado==="Rechazado"&&<button onClick={()=>updInf("estado","En revisión")} style={{padding:"6px 14px",borderRadius:8,background:"#d97706",color:"#fff",border:"none",cursor:"pointer",fontSize:11,fontWeight:700}}>📤 Reenviar</button>}
                {puedeAprobar&&<>
                  <button onClick={()=>updItem("informes",inf.id,{estado:"Aprobado",revisor:nombreUsuario,revisorCargo:"Gerente Técnico",fechaAprobacion:new Date().toISOString().slice(0,10)})} style={{padding:"6px 14px",borderRadius:8,background:"#16a34a",color:"#fff",border:"none",cursor:"pointer",fontSize:11,fontWeight:700}}>✅ Aprobar</button>
                  <button onClick={()=>{const obs=window.prompt("Observaciones del rechazo:");if(obs===null)return;updItem("informes",inf.id,{estado:"Rechazado",observacionesRechazo:obs,revisor:nombreUsuario});}} style={{padding:"6px 14px",borderRadius:8,background:"#dc2626",color:"#fff",border:"none",cursor:"pointer",fontSize:11,fontWeight:700}}>❌ Rechazar</button>
                </>}
                <button onClick={()=>generarPDF(inf)} style={{padding:"6px 14px",borderRadius:8,background:"#1e293b",color:"#fff",border:"none",cursor:"pointer",fontSize:11,fontWeight:700}}>📄 PDF</button>
                <button onClick={()=>{const w=window.open('','_blank');w.document.write(generarHTMLInforme(inf));w.document.close();setTimeout(()=>w.print(),300);}} style={{padding:"6px 14px",borderRadius:8,background:"#475569",color:"#fff",border:"none",cursor:"pointer",fontSize:11,fontWeight:700}}>🖨️ Imprimir</button>
                {puedeEnviar&&<button onClick={()=>{setEmailsEnvio(ct?.email||"");setEnvioModal(true);}} style={{padding:"6px 14px",borderRadius:8,background:"#2563eb",color:"#fff",border:"none",cursor:"pointer",fontSize:11,fontWeight:700}}>📧 Email</button>}
              </div>
            </div>
            {inf.estado==="Rechazado"&&inf.observacionesRechazo&&<div style={{padding:"10px 14px",background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,marginBottom:14,fontSize:12,color:"#991b1b"}}>❌ <strong>Rechazado por {inf.revisor}:</strong> {inf.observacionesRechazo}</div>}
            {/* Formulario 9 secciones */}
            <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:"20px 24px"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
                <Select label="Tipo *" value={inf.tipo} onChange={v=>updInf("tipo",v)} opts={TIPOS_VISITA} disabled={!puedeEditar}/>
                <Input label="Título *" value={inf.titulo} onChange={v=>updInf("titulo",v)} disabled={!puedeEditar}/>
                <Input label="Fecha *" value={inf.fecha} onChange={v=>updInf("fecha",v)} type="date" disabled={!puedeEditar}/>
                <div><div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:3}}>Cliente</div><ClienteSelect value={inf.ctId} onChange={v=>updInf("ctId",v)} disabled={!puedeEditar}/></div>
                <Input label="Especie" value={inf.especie} onChange={v=>updInf("especie",v)} disabled={!puedeEditar}/>
                <Input label="Variedad" value={inf.variedad} onChange={v=>updInf("variedad",v)} disabled={!puedeEditar}/>
                <Input label="Predio / Ubicación" value={inf.lugar} onChange={v=>updInf("lugar",v)} disabled={!puedeEditar}/>
                <Input label="Responsable" value={inf.responsable} onChange={v=>updInf("responsable",v)} disabled={!puedeEditar}/>
              </div>
              <Input label="1. Objetivo" value={inf.objetivo} onChange={v=>updInf("objetivo",v)} rows={3} disabled={!puedeEditar}/>
              <div style={{height:8}}/>
              <Input label="2. Observaciones de campo" value={inf.observacionesCampo} onChange={v=>updInf("observacionesCampo",v)} rows={4} disabled={!puedeEditar}/>
              <div style={{height:8}}/>
              <Input label="3. Recomendaciones" value={inf.recomendaciones} onChange={v=>updInf("recomendaciones",v)} rows={3} disabled={!puedeEditar}/>
              <div style={{height:8}}/>
              <Input label="4. Medidas correctivas" value={inf.medidasCorrectivas} onChange={v=>updInf("medidasCorrectivas",v)} rows={3} disabled={!puedeEditar} placeholder="[Urgente] Reparar riego — plazo: 30 abril&#10;[Media] Ajustar dosis — plazo: 15 mayo"/>
              <div style={{height:8}}/>
              {/* Fotos */}
              <div>
                <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:6}}>5. Registro fotográfico</div>
                {(()=>{
                  const fotos = (inf.registroFotografico||"").split(",").map(u=>u.trim()).filter(Boolean);
                  return fotos.length>0?(
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8,marginBottom:10}}>
                      {fotos.map((url,fi)=>(
                        <div key={fi} style={{position:"relative",borderRadius:8,overflow:"hidden",border:"1px solid #e2e8f0"}}>
                          <img src={url} alt={`Foto ${fi+1}`} style={{width:"100%",height:90,objectFit:"cover",display:"block"}} onError={e=>{e.target.style.display="none";}}/>
                          {puedeEditar&&<button onClick={()=>{const n=fotos.filter((_,i)=>i!==fi);updInf("registroFotografico",n.join(", "));}} style={{position:"absolute",top:3,right:3,width:20,height:20,borderRadius:4,background:"rgba(0,0,0,0.6)",color:"#fff",border:"none",cursor:"pointer",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>}
                        </div>
                      ))}
                    </div>
                  ):null;
                })()}
                {puedeEditar&&<div style={{display:"flex",gap:8}}>
                  <label style={{padding:"6px 12px",borderRadius:8,background:"#16a34a",color:"#fff",cursor:"pointer",fontSize:11,fontWeight:700,display:"inline-flex",alignItems:"center",gap:4}}>
                    📷 Subir foto
                    <input type="file" accept="image/*" multiple style={{display:"none"}} onChange={async(e)=>{
                      const files=Array.from(e.target.files||[]);if(!files.length)return;
                      const actuales=(inf.registroFotografico||"").split(",").map(u=>u.trim()).filter(Boolean);
                      let urls=[...actuales];
                      for(const f of files){try{const url=await uploadFoto(f,inf.id);urls.push(url);}catch(err){alert(`Error: ${err.message}`);}}
                      updInf("registroFotografico",urls.join(", "));e.target.value="";
                    }}/>
                  </label>
                  <button onClick={()=>{const u=window.prompt("URL de foto:");if(u&&u.trim()){const a=(inf.registroFotografico||"").split(",").map(x=>x.trim()).filter(Boolean);updInf("registroFotografico",[...a,u.trim()].join(", "));}}} style={{padding:"6px 12px",borderRadius:8,background:"#f1f5f9",border:"1px solid #d1d5db",cursor:"pointer",fontSize:11,fontWeight:600}}>🔗 URL</button>
                </div>}
              </div>
              <div style={{height:8}}/>
              <Input label="6. Conclusiones" value={inf.conclusiones} onChange={v=>updInf("conclusiones",v)} rows={3} disabled={!puedeEditar}/>
              <div style={{height:8}}/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <Input label="7. Próxima visita — fecha" value={inf.proximaVisitaFecha} onChange={v=>updInf("proximaVisitaFecha",v)} type="date" disabled={!puedeEditar}/>
                <Input label="7. Próxima visita — objetivo" value={inf.proximaVisitaObjetivo} onChange={v=>updInf("proximaVisitaObjetivo",v)} disabled={!puedeEditar}/>
              </div>
              {/* Firmas */}
              <div style={{marginTop:16,padding:"12px 16px",background:"#f8fafc",borderRadius:8,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,fontSize:12}}>
                <div><div style={{fontSize:10,color:"#94a3b8"}}>Elaborado por</div><div style={{fontWeight:600}}>{inf.responsable||"—"}</div></div>
                <div><div style={{fontSize:10,color:"#94a3b8"}}>Revisado por</div><div style={{fontWeight:600}}>{inf.revisor||"(Pendiente)"}</div>{inf.fechaAprobacion&&<div style={{fontSize:10,color:"#16a34a"}}>Aprobado {inf.fechaAprobacion}</div>}</div>
                <div><div style={{fontSize:10,color:"#94a3b8"}}>Estado</div><BadgeEstado estado={inf.estado}/></div>
              </div>
            </div>
            {envioModal&&<ModalForm titulo="📧 Enviar por email" onSave={async()=>{
              const ok=await enviarPorEmail(inf,emailsEnvio);
              if(ok){updItem("informes",inf.id,{estado:"Enviado",emailsDestino:emailsEnvio,fechaEnvio:new Date().toISOString().slice(0,10)});setEnvioModal(false);alert("✅ Enviado.");}
            }}>
              <Input label="Emails destino (separados por coma) *" value={emailsEnvio} onChange={v=>setEmailsEnvio(v)} placeholder="cliente@empresa.com, otro@empresa.com"/>
              <div style={{fontSize:11,color:"#64748b",marginTop:8}}>💡 Se enviará resumen del informe. Estado cambiará a "Enviado".</div>
            </ModalForm>}
          </div>
        );
      })():(
        <TablaGenerica
          cols={[
            {label:"Fecha",field:"fecha",w:90},
            {label:"Tipo",render:r=><BadgeEstado estado={r.tipo}/>,w:110},
            {label:"Título",render:r=><span style={{fontWeight:600,cursor:"pointer",color:"#2563eb",textDecoration:"underline"}} onClick={()=>setInformeDetalle(r.id)}>{r.titulo||"(sin título)"}</span>},
            {label:"Cliente",render:r=>r.ctId?nombreCliente(r.ctId):"—"},
            {label:"Responsable",field:"responsable"},
            {label:"Estado",render:r=><BadgeEstado estado={r.estado}/>,w:110},
          ]}
          rows={filtrar(informes,"tipo","estado")}
          onEdit={r=>setInformeDetalle(r.id)}
          onDel={r=>delItem("informes",r.id,r.titulo)}
          emptyMsg="Sin informes. Crea uno desde una visita realizada."
        />
      ))}

      {/* ════ TAB: EQUIPO TÉCNICO ════ */}
      {subTab==="equipo"&&<TablaGenerica
        cols={[
          {label:"Nombre",field:"nombre",style:{fontWeight:600}},
          {label:"Rol",field:"rol"},
          {label:"Especie",field:"especie"},
          {label:"Modalidad",field:"modalidad"},
          {label:"Email",field:"email"},
          {label:"Teléfono",field:"telefono"},
        ]}
        rows={filtrar(equipoTecnico,"rol","rol")}
        onEdit={r=>abrirEditar("tecnico",r)}
        onDel={r=>delItem("equipoTecnico",r.id,r.nombre)}
        emptyMsg="Sin técnicos registrados."
      />}

      {/* ════ TAB: ENTREGABLES ════ */}
      {subTab==="entregables"&&(
        entregables.length===0?(
          <div style={{textAlign:"center",padding:32,color:"#94a3b8",border:"1px dashed #e2e8f0",borderRadius:10}}>Sin entregables.</div>
        ):(
          entregables.map((e,ei)=>{
            const ct=(ctData||[]).find(c=>c.id===e.ctId);
            const comp=e.items.filter(i=>i.entregado).length;
            return (
              <div key={e.id||ei} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:10,padding:"14px 18px",marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div><div style={{fontWeight:700,fontSize:13}}>{ct?.razonSocial||"—"} · {e.sublicenciatario||"General"}</div><div style={{fontSize:11,color:"#64748b"}}>{comp}/{e.items.length} entregados</div></div>
                  {can&&<div style={{display:"flex",gap:4}}>
                    <button onClick={()=>abrirEditar("entregable",e)} style={{background:"#dbeafe",border:"none",borderRadius:4,padding:"3px 8px",cursor:"pointer",fontSize:11,color:"#1d4ed8",fontWeight:600}}>✏️</button>
                    <button onClick={()=>delItem("entregables",e.id,`Entregables ${ct?.razonSocial||""}`)} style={{background:"#fee2e2",border:"none",borderRadius:4,padding:"3px 8px",cursor:"pointer",fontSize:11,color:"#991b1b",fontWeight:600}}>×</button>
                  </div>}
                </div>
                <div style={{height:8,background:"#f1f5f9",borderRadius:4,overflow:"hidden",marginBottom:8}}><div style={{height:"100%",background:"#16a34a",borderRadius:4,width:`${(comp/Math.max(e.items.length,1))*100}%`}}/></div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:6}}>
                  {e.items.map((item,ii)=>(
                    <label key={ii} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:6,background:item.entregado?"#f0fdf4":"#fff",border:`1px solid ${item.entregado?"#86efac":"#e2e8f0"}`,cursor:can?"pointer":"default",fontSize:12}}>
                      <input type="checkbox" disabled={!can} checked={item.entregado} onChange={()=>{const ni=[...e.items];ni[ii]={...ni[ii],entregado:!ni[ii].entregado,fecha:!ni[ii].entregado?new Date().toISOString().slice(0,10):""};updItem("entregables",e.id,{items:ni});}} style={{accentColor:"#16a34a"}}/>
                      <span style={{textDecoration:item.entregado?"line-through":"none",color:item.entregado?"#16a34a":"#1e293b"}}>{item.nombre}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })
        )
      )}

      {/* ═══ MODALES ═══ */}
      {modal==="visita"&&<ModalForm titulo={form._editId?"Editar visita":"Nueva visita"} onSave={()=>guardarForm("visitas",VACIO_VISITA)}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Select label="Tipo *" value={form.tipo} onChange={v=>setForm(p=>({...p,tipo:v}))} opts={TIPOS_VISITA}/>
          <Input label="Fecha *" value={form.fecha} onChange={v=>setForm(p=>({...p,fecha:v}))} type="date"/>
          <div><div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:3}}>Cliente</div><ClienteSelect value={form.ctId} onChange={v=>setForm(p=>({...p,ctId:v}))}/></div>
          <Select label="Estado" value={form.estado} onChange={v=>setForm(p=>({...p,estado:v}))} opts={ESTADOS_VISITA}/>
          <Input label="Lugar" value={form.lugar} onChange={v=>setForm(p=>({...p,lugar:v}))} placeholder="Fundo, ciudad..."/>
          <Input label="Responsable" value={form.responsable} onChange={v=>setForm(p=>({...p,responsable:v}))}/>
        </div>
        <Input label="Objetivo" value={form.objetivo} onChange={v=>setForm(p=>({...p,objetivo:v}))} rows={2}/>
        <Input label="Resultado / Observaciones" value={form.resultado} onChange={v=>setForm(p=>({...p,resultado:v}))} rows={2}/>
        {form.tipo==="Test Block"&&(<>
          <div style={{marginTop:10,padding:"10px 14px",background:"#ede9fe",borderRadius:8,border:"1px solid #c4b5fd"}}>
            <div style={{fontSize:12,fontWeight:700,color:"#5b21b6",marginBottom:8}}>🧪 Datos del Test Block</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <Input label="Nombre del ensayo" value={form.testBlockNombre} onChange={v=>setForm(p=>({...p,testBlockNombre:v}))} placeholder="Test Atlas 2026"/>
              <Input label="Especie" value={form.testBlockEspecie} onChange={v=>setForm(p=>({...p,testBlockEspecie:v}))} placeholder="Arándano"/>
              <Input label="Variedad" value={form.testBlockVariedad} onChange={v=>setForm(p=>({...p,testBlockVariedad:v}))} placeholder="Atlas, OZBlue..."/>
              <Input label="Ubicación" value={form.testBlockUbicacion} onChange={v=>setForm(p=>({...p,testBlockUbicacion:v}))} placeholder="Parcela, cuartel..."/>
            </div>
            <Input label="Resultados" value={form.testBlockResultados} onChange={v=>setForm(p=>({...p,testBlockResultados:v}))} rows={2} placeholder="Rendimiento, observaciones..."/>
          </div>
        </>)}
      </ModalForm>}

      {modal==="tecnico"&&<ModalForm titulo={form._editId?"Editar técnico":"Nuevo técnico"} onSave={()=>guardarForm("equipoTecnico",VACIO_TECNICO)}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Input label="Nombre *" value={form.nombre} onChange={v=>setForm(p=>({...p,nombre:v}))}/>
          <Select label="Rol" value={form.rol} onChange={v=>setForm(p=>({...p,rol:v}))} opts={["Asesor por especie","Técnico part time","Asesoría integral (AI)","Documentación técnica","Otro"]}/>
          <Input label="Especie" value={form.especie} onChange={v=>setForm(p=>({...p,especie:v}))} placeholder="Cerezo, Arándano..."/>
          <Select label="Modalidad" value={form.modalidad} onChange={v=>setForm(p=>({...p,modalidad:v}))} opts={["Full time","Part time","Por proyecto","Consultor externo"]}/>
          <Input label="Email" value={form.email} onChange={v=>setForm(p=>({...p,email:v}))} type="email"/>
          <Input label="Teléfono" value={form.telefono} onChange={v=>setForm(p=>({...p,telefono:v}))}/>
        </div>
        <Input label="Observaciones" value={form.observaciones} onChange={v=>setForm(p=>({...p,observaciones:v}))} rows={2}/>
      </ModalForm>}

      {modal==="entregable"&&<ModalForm titulo={form._editId?"Editar entregables":"Nuevo checklist"} onSave={()=>guardarForm("entregables",VACIO_ENTREGABLE)}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
          <div><div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:3}}>Cliente *</div><ClienteSelect value={form.ctId} onChange={v=>setForm(p=>({...p,ctId:v}))}/></div>
          <Input label="Sublicenciatario" value={form.sublicenciatario} onChange={v=>setForm(p=>({...p,sublicenciatario:v}))}/>
        </div>
        <div style={{fontSize:11,fontWeight:700,marginBottom:8}}>Checklist:</div>
        {(form.items||[]).map((item,i)=>(
          <label key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:6,background:item.entregado?"#f0fdf4":"#fff",border:"1px solid #e2e8f0",marginBottom:4,fontSize:12,cursor:"pointer"}}>
            <input type="checkbox" checked={item.entregado} onChange={()=>{const ni=[...(form.items||[])];ni[i]={...ni[i],entregado:!ni[i].entregado};setForm(p=>({...p,items:ni}));}} style={{accentColor:"#16a34a"}}/>
            {item.nombre}
          </label>
        ))}
      </ModalForm>}
    </div>
  );
}


// ── Maestro de Especies ──────────────────────────────────────
// Catálogo central de especies (Cerezo, Arándano, Uva...) con color identificador
function MaestroEspecies({especies,setEspecies,can,obtentores=[],contratos=[],variedades=[]}){
  const [editId,setEditId]=useState(null);
  const VACIO={nombre:"",color:COLORES_ESPECIES[0].hex,observaciones:""};
  const [form,setForm]=useState(VACIO);
  const [showForm,setShowForm]=useState(false);
  const [busq,setBusq]=useState("");

  // Detectar especies escritas a mano en obtentores/contratos/variedades que aún no están en el maestro
  const sugerencias = useMemo(()=>{
    const enMaestro = new Set((especies||[]).map(e=>e.nombre.toLowerCase().trim()));
    const detectadas = new Map(); // nombre → fuente
    (obtentores||[]).forEach(o=>(o.especies||[]).forEach(e=>{
      if(e.especie && !enMaestro.has(e.especie.toLowerCase().trim())) {
        detectadas.set(e.especie.trim(), `Obtentor ${o.obtentor}`);
      }
    }));
    (contratos||[]).forEach(c=>(c.plantaciones||[]).forEach(p=>{
      if(p.especie && !enMaestro.has(p.especie.toLowerCase().trim())) {
        if(!detectadas.has(p.especie.trim())) detectadas.set(p.especie.trim(), `Contrato ${c.razonSocial}`);
      }
    }));
    (variedades||[]).forEach(v=>{
      if(v.especie && !enMaestro.has(v.especie.toLowerCase().trim())) {
        if(!detectadas.has(v.especie.trim())) detectadas.set(v.especie.trim(), `Variedad ${v.especie} · ${v.variedad}`);
      }
    });
    return Array.from(detectadas.entries()).map(([nombre,fuente])=>({nombre,fuente}));
  },[especies,obtentores,contratos,variedades]);

  function guardar(){
    if(!form.nombre.trim()){alert("Nombre de especie es obligatorio.");return;}
    const nombreNorm = form.nombre.trim();
    const dupe = (especies||[]).find(e =>
      e.id !== editId &&
      e.nombre?.toLowerCase().trim() === nombreNorm.toLowerCase()
    );
    if(dupe){alert(`Ya existe la especie "${nombreNorm}".`);return;}
    if(editId){
      const anterior = especies.find(e=>e.id===editId);
      setEspecies(prev=>prev.map(e=>e.id===editId?{...e,...form,nombre:nombreNorm}:e));
      if(anterior) {
        Object.keys(form).forEach(k=>{
          const va = String(anterior[k]||"");
          const vn = k==="nombre"?nombreNorm:String(form[k]||"");
          if(va !== vn) {
            window.auditLog&&window.auditLog("editar", {modulo:"osiris", seccion:"Maestro Especies",
              descripcion:`Editó especie "${nombreNorm}": campo ${k}`,
              registroId:editId, campo:k, valorAnterior:va, valorNuevo:vn});
          }
        });
      }
      setEditId(null);
    } else {
      const id = `esp_${Date.now()}`;
      setEspecies(prev=>[...(prev||[]),{...form,nombre:nombreNorm,id}]);
      window.auditLog&&window.auditLog("crear", {modulo:"osiris", seccion:"Maestro Especies",
        descripcion:`Creó especie "${nombreNorm}"`,
        registroId:id});
    }
    setForm(VACIO);
    setShowForm(false);
  }
  function importarSugerencia(s, idxColor){
    if(!can) return;
    const id = `esp_${Date.now()}`;
    const color = COLORES_ESPECIES[idxColor % COLORES_ESPECIES.length].hex;
    setEspecies(prev=>[...(prev||[]),{id, nombre:s.nombre, color, observaciones:""}]);
    window.auditLog&&window.auditLog("crear", {modulo:"osiris", seccion:"Maestro Especies",
      descripcion:`Importó especie "${s.nombre}" (detectada en ${s.fuente})`,
      registroId:id});
  }
  function importarTodas(){
    if(!can || sugerencias.length===0) return;
    if(!window.confirm(`¿Importar ${sugerencias.length} especies detectadas?`)) return;
    const baseLen = (especies||[]).length;
    const nuevas = sugerencias.map((s, i)=>({
      id:`esp_${Date.now()}_${i}`,
      nombre:s.nombre,
      color: COLORES_ESPECIES[(baseLen+i) % COLORES_ESPECIES.length].hex,
      observaciones:"",
    }));
    setEspecies(prev=>[...(prev||[]),...nuevas]);
    window.auditLog&&window.auditLog("crear", {modulo:"osiris", seccion:"Maestro Especies",
      descripcion:`Importó ${nuevas.length} especies detectadas (${nuevas.map(e=>e.nombre).join(", ")})`});
  }
  function iniciarEdicion(e){
    setForm({nombre:e.nombre||"",color:e.color||COLORES_ESPECIES[0].hex,observaciones:e.observaciones||""});
    setEditId(e.id);setShowForm(true);
  }

  const filtrado = (especies||[]).filter(e=>!busq||
    e.nombre.toLowerCase().includes(busq.toLowerCase())||
    (e.observaciones||"").toLowerCase().includes(busq.toLowerCase()));

  return(
    <div style={{background:"#f0fdfa",border:"1px solid #5eead4",borderRadius:12,padding:"16px 20px",marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:13,fontWeight:700,color:"#115e59"}}>🌳 Maestro de Especies</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <input value={busq} onChange={e=>setBusq(e.target.value)} placeholder="Buscar..."
            style={{padding:"5px 10px",borderRadius:6,border:"1px solid #5eead4",fontSize:12,outline:"none"}}/>
          {can&&sugerencias.length>0&&<button onClick={importarTodas}
            style={{padding:"6px 12px",borderRadius:6,background:"#7c3aed",color:"#fff",border:"none",cursor:"pointer",fontSize:11,fontWeight:600}}>
            📥 Importar {sugerencias.length} detectadas
          </button>}
          {can&&<button onClick={()=>{setShowForm(v=>!v);setEditId(null);setForm(VACIO);}}
            style={{padding:"6px 14px",borderRadius:6,background:"#0d9488",color:"#fff",border:"none",cursor:"pointer",fontSize:12,fontWeight:600}}>
            {showForm&&!editId?"✕":"+ Nueva especie"}
          </button>}
        </div>
      </div>

      {showForm&&can&&(
        <div style={{background:"#fff",borderRadius:10,padding:"14px 16px",marginBottom:12,border:"1px solid #5eead4"}}>
          <div style={{fontSize:12,fontWeight:700,color:"#115e59",marginBottom:10}}>{editId?"Editar especie":"Nueva especie"}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
            <div>
              <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:3}}>Nombre *</div>
              <input value={form.nombre} placeholder="Cerezo, Arándano, Uva..." onChange={e=>setForm(p=>({...p,nombre:e.target.value}))}
                style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,outline:"none",boxSizing:"border-box"}}/>
            </div>
            <div>
              <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:3}}>Observaciones</div>
              <input value={form.observaciones} onChange={e=>setForm(p=>({...p,observaciones:e.target.value}))}
                style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,outline:"none",boxSizing:"border-box"}}/>
            </div>
          </div>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:6}}>Color identificador</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {COLORES_ESPECIES.map(c=>(
                <button key={c.hex} type="button" onClick={()=>setForm(p=>({...p,color:c.hex}))}
                  title={c.nombre}
                  style={{width:32,height:32,borderRadius:8,background:c.hex,border:form.color===c.hex?"3px solid #1e293b":"2px solid #fff",
                  boxShadow:form.color===c.hex?"0 0 0 2px #5eead4":"0 1px 3px #0002",cursor:"pointer",padding:0}}/>
              ))}
              <input type="color" value={form.color} onChange={e=>setForm(p=>({...p,color:e.target.value}))}
                style={{width:32,height:32,padding:0,border:"2px solid #fff",borderRadius:8,cursor:"pointer",boxShadow:"0 1px 3px #0002"}}/>
            </div>
            <div style={{marginTop:8,padding:"6px 12px",background:form.color,color:"#fff",borderRadius:6,fontSize:11,fontWeight:700,display:"inline-block",textShadow:"0 1px 2px #0006"}}>Vista previa: {form.nombre||"Especie"}</div>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button onClick={()=>{setShowForm(false);setEditId(null);}} style={{padding:"6px 16px",borderRadius:6,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:12}}>Cancelar</button>
            <button onClick={guardar} style={{padding:"6px 16px",borderRadius:6,background:"#0d9488",color:"#fff",border:"none",cursor:"pointer",fontSize:12,fontWeight:600}}>💾 Guardar</button>
          </div>
        </div>
      )}

      {/* Sugerencias detectadas no importadas */}
      {sugerencias.length>0&&can&&!showForm&&(
        <div style={{background:"#fff",border:"1px dashed #fb923c",borderRadius:10,padding:"10px 14px",marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:700,color:"#c2410c",marginBottom:8}}>💡 {sugerencias.length} especies detectadas en uso pero no en el maestro:</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {sugerencias.map((s,i)=>(
              <button key={s.nombre} onClick={()=>importarSugerencia(s,(especies||[]).length+i)} title={`Detectada en: ${s.fuente}`}
                style={{padding:"4px 10px",borderRadius:14,background:"#fff7ed",border:"1px solid #fb923c",cursor:"pointer",fontSize:11,color:"#c2410c",fontWeight:600}}>
                + {s.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",background:"#fff",borderRadius:8,overflow:"hidden",fontSize:12}}>
          <thead><tr style={{background:"#0d9488",color:"#fff"}}>
            {["","Nombre","Variedades","Plantaciones","Observaciones",""].map(h=>(
              <th key={h} style={{padding:"7px 10px",textAlign:"left",fontWeight:600,fontSize:11,whiteSpace:"nowrap"}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtrado.map((e,i)=>{
              // Conteos: cuántas variedades del maestro y cuántas plantaciones usan esta especie
              const nVariedades = (variedades||[]).filter(v=>v.especie?.toLowerCase().trim() === e.nombre.toLowerCase().trim()).length;
              const nPlantaciones = (contratos||[]).reduce((s,c)=>
                s + ((c.plantaciones||[]).filter(p=>p.especie?.toLowerCase().trim() === e.nombre.toLowerCase().trim()).length), 0);
              return (
                <tr key={e.id} style={{borderBottom:"1px solid #ccfbf1",background:i%2===0?"#fff":"#f0fdfa"}}>
                  <td style={{padding:"6px 10px",width:32}}>
                    <div style={{width:24,height:24,borderRadius:6,background:e.color||"#475569",boxShadow:"0 1px 3px #0002"}}/>
                  </td>
                  <td style={{padding:"6px 10px",fontWeight:700,color:"#1e293b"}}>{e.nombre}</td>
                  <td style={{padding:"6px 10px",color:"#64748b"}}>{nVariedades>0?<span style={{padding:"2px 8px",borderRadius:10,background:"#fef3c7",color:"#92400e",fontSize:10,fontWeight:700}}>{nVariedades}</span>:"—"}</td>
                  <td style={{padding:"6px 10px",color:"#64748b"}}>{nPlantaciones>0?<span style={{padding:"2px 8px",borderRadius:10,background:"#dcfce7",color:"#15803d",fontSize:10,fontWeight:700}}>{nPlantaciones}</span>:"—"}</td>
                  <td style={{padding:"6px 10px",color:"#64748b",fontSize:11}}>{e.observaciones||"—"}</td>
                  <td style={{padding:"6px 8px",textAlign:"center"}}>
                    {can&&<div style={{display:"flex",gap:4}}>
                      <button onClick={()=>iniciarEdicion(e)} style={{background:"#dbeafe",border:"none",borderRadius:4,padding:"3px 8px",cursor:"pointer",fontSize:11,color:"#1d4ed8",fontWeight:600}}>✏️</button>
                      <button onClick={()=>{
                        if(nVariedades>0||nPlantaciones>0) {
                          if(!window.confirm(`Esta especie está en uso por ${nVariedades} variedad(es) y ${nPlantaciones} plantación(es). ¿Eliminar de todos modos? (los registros que la usan no se borran, solo perderán el link al maestro)`))return;
                        } else {
                          if(!window.confirm(`¿Eliminar especie "${e.nombre}"?`))return;
                        }
                        window.auditLog&&window.auditLog("eliminar", {modulo:"osiris", seccion:"Maestro Especies",
                          descripcion:`Eliminó especie "${e.nombre}"`,
                          registroId:e.id});
                        setEspecies(prev=>(prev||[]).filter(x=>x.id!==e.id));
                      }}
                        style={{background:"#fee2e2",border:"none",borderRadius:4,padding:"3px 8px",cursor:"pointer",fontSize:11,color:"#991b1b",fontWeight:600}}>×</button>
                    </div>}
                  </td>
                </tr>
              );
            })}
            {filtrado.length===0&&<tr><td colSpan={6} style={{textAlign:"center",padding:20,color:"#94a3b8"}}>Sin especies. {can?(sugerencias.length>0?`Hay ${sugerencias.length} especies detectadas listas para importar arriba.`:"Agrega una con \"+ Nueva especie\"."):""}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Maestro de Variedades ────────────────────────────────────
// Catálogo central de variedades, linkable con contratos de obtentor
function MaestroVariedades({variedades,setVariedades,can,obtentores=[],especies=[],setEspecies}){
  const [editId,setEditId]=useState(null);
  const VACIO={especie:"",variedad:"",obtentor:"",nRegistro:"",observaciones:""};
  const [form,setForm]=useState(VACIO);
  const [showForm,setShowForm]=useState(false);
  const [busq,setBusq]=useState("");

  // Recopilar variedades únicas desde contratos obtentores (para sugerir)
  const variedadesObtentor = useMemo(()=>{
    const out = [];
    (obtentores||[]).forEach(o=>(o.especies||[]).forEach(e=>{
      out.push({especie:e.especie, variedad:e.variedad, obtentor:o.obtentor});
    }));
    return out;
  },[obtentores]);
  const sugerencias = variedadesObtentor.filter(s=>
    !(variedades||[]).some(v=>v.especie===s.especie && v.variedad===s.variedad)
  );

  function guardar(){
    if(!form.especie.trim() || !form.variedad.trim()){alert("Especie y Variedad son obligatorias.");return;}
    // Evitar duplicados
    const dupe = (variedades||[]).find(v =>
      v.id !== editId &&
      v.especie?.toLowerCase().trim() === form.especie.toLowerCase().trim() &&
      v.variedad?.toLowerCase().trim() === form.variedad.toLowerCase().trim()
    );
    if(dupe){alert(`Ya existe la variedad "${form.especie} · ${form.variedad}".`);return;}
    if(editId){
      const anterior = variedades.find(v=>v.id===editId);
      setVariedades(prev=>prev.map(v=>v.id===editId?{...v,...form}:v));
      if(anterior) {
        Object.keys(form).forEach(k=>{
          if(String(anterior[k]||"") !== String(form[k]||"")) {
            window.auditLog&&window.auditLog("editar", {modulo:"osiris", seccion:"Maestro Variedades",
              descripcion:`Editó variedad "${form.especie} · ${form.variedad}": campo ${k}`,
              registroId:editId, campo:k,
              valorAnterior:String(anterior[k]||""), valorNuevo:String(form[k]||"")});
          }
        });
      }
      setEditId(null);
    } else {
      const id = `var_${Date.now()}`;
      setVariedades(prev=>[...(prev||[]),{...form,id}]);
      window.auditLog&&window.auditLog("crear", {modulo:"osiris", seccion:"Maestro Variedades",
        descripcion:`Creó variedad "${form.especie} · ${form.variedad}"${form.obtentor?` · Obtentor ${form.obtentor}`:""}`,
        registroId:id});
    }
    setForm(VACIO);
    setShowForm(false);
  }
  function importarSugerencia(s){
    if(!can) return;
    const dupe = (variedades||[]).find(v=>
      v.especie?.toLowerCase().trim() === s.especie.toLowerCase().trim() &&
      v.variedad?.toLowerCase().trim() === s.variedad.toLowerCase().trim()
    );
    if(dupe) return;
    const id = `var_${Date.now()}`;
    setVariedades(prev=>[...(prev||[]),{id, especie:s.especie, variedad:s.variedad, obtentor:s.obtentor, observaciones:""}]);
    window.auditLog&&window.auditLog("crear", {modulo:"osiris", seccion:"Maestro Variedades",
      descripcion:`Importó variedad desde Obtentor "${s.especie} · ${s.variedad}" (${s.obtentor})`,
      registroId:id});
  }
  function importarTodas(){
    if(!can || sugerencias.length===0) return;
    if(!window.confirm(`¿Importar ${sugerencias.length} variedades desde los contratos obtentores?`)) return;
    const nuevas = sugerencias.map(s=>({
      id:`var_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
      especie:s.especie, variedad:s.variedad, obtentor:s.obtentor, observaciones:""
    }));
    setVariedades(prev=>[...(prev||[]),...nuevas]);
    window.auditLog&&window.auditLog("crear", {modulo:"osiris", seccion:"Maestro Variedades",
      descripcion:`Importó ${nuevas.length} variedades desde contratos obtentores`});
  }
  function iniciarEdicion(v){
    setForm({especie:v.especie||"",variedad:v.variedad||"",obtentor:v.obtentor||"",nRegistro:v.nRegistro||"",observaciones:v.observaciones||""});
    setEditId(v.id);setShowForm(true);
  }

  const filtrado = (variedades||[]).filter(v=>!busq||
    v.especie.toLowerCase().includes(busq.toLowerCase())||
    v.variedad.toLowerCase().includes(busq.toLowerCase())||
    (v.obtentor||"").toLowerCase().includes(busq.toLowerCase()));

  return(
    <div style={{background:"#fef3c7",border:"1px solid #fbbf24",borderRadius:12,padding:"16px 20px",marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:13,fontWeight:700,color:"#78350f"}}>🌿 Maestro de Variedades</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <input value={busq} onChange={e=>setBusq(e.target.value)} placeholder="Buscar..."
            style={{padding:"5px 10px",borderRadius:6,border:"1px solid #fbbf24",fontSize:12,outline:"none"}}/>
          {can&&sugerencias.length>0&&<button onClick={importarTodas}
            style={{padding:"6px 12px",borderRadius:6,background:"#7c3aed",color:"#fff",border:"none",cursor:"pointer",fontSize:11,fontWeight:600}}>
            📥 Importar {sugerencias.length} desde Obtentores
          </button>}
          {can&&<button onClick={()=>{setShowForm(v=>!v);setEditId(null);setForm(VACIO);}}
            style={{padding:"6px 14px",borderRadius:6,background:"#d97706",color:"#fff",border:"none",cursor:"pointer",fontSize:12,fontWeight:600}}>
            {showForm&&!editId?"✕":"+ Nueva variedad"}
          </button>}
        </div>
      </div>

      {showForm&&can&&(
        <div style={{background:"#fff",borderRadius:10,padding:"14px 16px",marginBottom:12,border:"1px solid #fbbf24"}}>
          <div style={{fontSize:12,fontWeight:700,color:"#78350f",marginBottom:10}}>{editId?"Editar variedad":"Nueva variedad"}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
            <div>
              <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:3}}>Especie *</div>
              {(especies||[]).length>0?(
                <div style={{display:"flex",gap:4}}>
                  <select value={form.especie||""} onChange={e=>{
                    if(e.target.value==="__nueva__") {
                      const nombre = window.prompt("Nombre de la nueva especie:");
                      if(!nombre || !nombre.trim()) return;
                      const dupe = (especies||[]).find(x=>x.nombre.toLowerCase().trim()===nombre.toLowerCase().trim());
                      if(dupe) { setForm(p=>({...p,especie:dupe.nombre})); return; }
                      const id = `esp_${Date.now()}`;
                      const idxColor = (especies||[]).length % COLORES_ESPECIES.length;
                      const nueva = {id, nombre:nombre.trim(), color:COLORES_ESPECIES[idxColor].hex, observaciones:""};
                      setEspecies&&setEspecies(prev=>[...(prev||[]),nueva]);
                      window.auditLog&&window.auditLog("crear",{modulo:"osiris",seccion:"Maestro Especies",
                        descripcion:`Creó especie "${nombre.trim()}" desde Maestro Variedades`,registroId:id});
                      setForm(p=>({...p,especie:nombre.trim()}));
                    } else {
                      setForm(p=>({...p,especie:e.target.value}));
                    }
                  }}
                    style={{flex:1,padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,outline:"none",boxSizing:"border-box",background:"#fff"}}>
                    <option value="">— Seleccionar —</option>
                    {(especies||[]).map(e=><option key={e.id} value={e.nombre}>{e.nombre}</option>)}
                    <option value="__nueva__">＋ Crear nueva...</option>
                  </select>
                  {form.especie&&(()=>{
                    const esp = (especies||[]).find(x=>x.nombre===form.especie);
                    return esp?<div title={esp.nombre} style={{width:30,height:30,borderRadius:6,background:esp.color,boxShadow:"0 1px 3px #0002"}}/>:null;
                  })()}
                </div>
              ):(
                <input value={form.especie} placeholder="Cerezo, Arándano, Uva..." onChange={e=>setForm(p=>({...p,especie:e.target.value}))}
                  style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,outline:"none",boxSizing:"border-box"}}/>
              )}
            </div>
            <div>
              <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:3}}>Variedad *</div>
              <input value={form.variedad} placeholder="Royal Dawn, Sweet Heart..." onChange={e=>setForm(p=>({...p,variedad:e.target.value}))}
                style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,outline:"none",boxSizing:"border-box"}}/>
            </div>
            <div>
              <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:3}}>Obtentor</div>
              <input value={form.obtentor} placeholder="SunWorld, IFG, Bloom Fresh..." onChange={e=>setForm(p=>({...p,obtentor:e.target.value}))}
                list="obtentores-list"
                style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,outline:"none",boxSizing:"border-box"}}/>
              <datalist id="obtentores-list">
                {[...new Set((obtentores||[]).map(o=>o.obtentor).filter(Boolean))].map(o=><option key={o} value={o}/>)}
              </datalist>
            </div>
            <div>
              <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:3}}>N° Registro</div>
              <input value={form.nRegistro||""} placeholder="Ej: 2024-001234" onChange={e=>setForm(p=>({...p,nRegistro:e.target.value}))}
                style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,outline:"none",boxSizing:"border-box"}}/>
            </div>
            <div>
              <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:3}}>Observaciones</div>
              <input value={form.observaciones} onChange={e=>setForm(p=>({...p,observaciones:e.target.value}))}
                style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,outline:"none",boxSizing:"border-box"}}/>
            </div>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button onClick={()=>{setShowForm(false);setEditId(null);}} style={{padding:"6px 16px",borderRadius:6,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:12}}>Cancelar</button>
            <button onClick={guardar} style={{padding:"6px 16px",borderRadius:6,background:"#d97706",color:"#fff",border:"none",cursor:"pointer",fontSize:12,fontWeight:600}}>💾 Guardar</button>
          </div>
        </div>
      )}

      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",background:"#fff",borderRadius:8,overflow:"hidden",fontSize:12}}>
          <thead><tr style={{background:"#d97706",color:"#fff"}}>
            {["Especie","Variedad","Obtentor","N° Registro","Observaciones",""].map(h=>(
              <th key={h} style={{padding:"7px 10px",textAlign:"left",fontWeight:600,fontSize:11,whiteSpace:"nowrap"}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtrado.map((v,i)=>(
              <tr key={v.id} style={{borderBottom:"1px solid #fef3c7",background:i%2===0?"#fff":"#fffbeb"}}>
                <td style={{padding:"6px 10px",fontWeight:600,color:"#78350f"}}>{v.especie}</td>
                <td style={{padding:"6px 10px",fontWeight:600,color:"#1e293b"}}>{v.variedad}</td>
                <td style={{padding:"6px 10px",color:"#64748b"}}>{v.obtentor||"—"}</td>
                <td style={{padding:"6px 10px",color:"#64748b"}}>{v.nRegistro||"—"}</td>
                <td style={{padding:"6px 10px",color:"#64748b",fontSize:11}}>{v.observaciones||"—"}</td>
                <td style={{padding:"6px 8px",textAlign:"center"}}>
                  {can&&<div style={{display:"flex",gap:4}}>
                    <button onClick={()=>iniciarEdicion(v)} style={{background:"#dbeafe",border:"none",borderRadius:4,padding:"3px 8px",cursor:"pointer",fontSize:11,color:"#1d4ed8",fontWeight:600}}>✏️</button>
                    <button onClick={()=>{
                      if(!window.confirm(`¿Eliminar variedad "${v.especie} · ${v.variedad}"?`))return;
                      window.auditLog&&window.auditLog("eliminar", {modulo:"osiris", seccion:"Maestro Variedades",
                        descripcion:`Eliminó variedad "${v.especie} · ${v.variedad}"`,
                        registroId:v.id});
                      setVariedades(prev=>(prev||[]).filter(x=>x.id!==v.id));
                    }}
                      style={{background:"#fee2e2",border:"none",borderRadius:4,padding:"3px 8px",cursor:"pointer",fontSize:11,color:"#991b1b",fontWeight:600}}>×</button>
                  </div>}
                </td>
              </tr>
            ))}
            {filtrado.length===0&&<tr><td colSpan={6} style={{textAlign:"center",padding:20,color:"#94a3b8"}}>Sin variedades. {can?(sugerencias.length>0?`Hay ${sugerencias.length} sugerencias desde obtentores.`:"Agrega una con \"+ Nueva variedad\"."):""}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
// ══════════════════════════════════════════════════════════
// DERIVADORES DE INGRESOS DESDE CONTRATO
// El contrato es la fuente de verdad. Estos helpers calculan
// los registros de Contract Fee, Royalty Planta y Royalty Comercial.
// ══════════════════════════════════════════════════════════
function derivarContractFeeDesdeContratos(ctData) {
  return (ctData||[])
    .filter(ct => ct.tipoContractFee && ct.tipoContractFee !== "Sin Contract Fee")
    .map(ct => ({
      id: `cf_${ct.id}`,
      ctId: ct.id,
      cliente: ct.razonSocial,
      pais: ct.pais,
      montoUSD: Number(ct.montoContractFee)||0,
      montoNeto: (Number(ct.montoContractFee)||0) * pct(ct.pais),
      whtPct: pct(ct.pais)===1 ? 0 : 15,
      detalle: ct.tipoContractFee,
      fechaContrato: ct.fechaContrato || "",
      pagado: !!ct.contractFeePagado,
      fechaPago: ct.contractFeeFechaPago || "",
      nFact: ct.contractFeeNFact || "",
      _fromContract: true,
    }));
}

function derivarRoyaltyPlantaDesdeContratos(ctData) {
  // Por cada cuota × contrato genera un registro
  const out = [];
  (ctData||[]).forEach(ct => {
    const totPlantas = (ct.plantaciones||[]).reduce((s,p)=>s+(Number(p.nPlantas)||0),0);
    if(totPlantas===0) return;
    const valorPorPlanta = Number(ct.valorRoyaltyPlanta)||1;
    const montoTotalUSD = totPlantas * valorPorPlanta;
    const cuotas = ct.rpPlantaCuotas && ct.rpPlantaCuotas.length>0 ? ct.rpPlantaCuotas : RP_CUOTAS_DEFAULT;
    cuotas.forEach((cuo, idx) => {
      const pctCuota = (Number(cuo.pct)||0)/100;
      const montoCuota = montoTotalUSD * pctCuota;
      out.push({
        id: `rp_${ct.id}_${cuo.id||idx}`,
        ctId: ct.id,
        cuotaId: cuo.id||`cuo_${idx}`,
        cliente: ct.razonSocial,
        pais: ct.pais,
        nPlantas: totPlantas,
        usdPlanta: valorPorPlanta,
        descripcionCuota: cuo.descripcion||`Cuota ${idx+1}`,
        pctCuota: Number(cuo.pct)||0,
        montoFact: montoCuota,                 // 100%
        montoCobro: montoCuota * pct(ct.pais), // con WHT
        whtPct: pct(ct.pais)===1 ? 0 : 15,
        fechaEvento: cuo.fechaEvento || "",
        pagado: !!cuo.pagado,
        fechaPago: cuo.fechaPago || "",
        nFact: cuo.nFact || "",
        _fromContract: true,
      });
    });
  });
  return out;
}

function derivarRoyaltyComercialDesdeContratos(ctData) {
  // Por cada temporada × contrato genera un registro
  const out = [];
  (ctData||[]).forEach(ct => {
    const haTotal = (ct.plantaciones||[]).reduce((s,p)=>s+(Number(p.hectareas)||0),0);
    if(haTotal===0) return;
    const valorPorHa = Number(ct.valorRoyaltyComercial)||0;
    if(valorPorHa===0) return;
    const inicioTemp = ct.rcInicioTemporada || temporadaActual();
    const mesCobro = ct.rcMesCobro || RC_MES_DEFAULT_POR_PAIS[ct.pais] || "Abril";
    const temps = temporadasEntre(inicioTemp, ct.fechaTermino);
    temps.forEach(temp => {
      const montoFact = haTotal * valorPorHa;
      const montoCobro = montoFact * pct(ct.pais);
      // Pagos guardados por temporada en el contrato
      const pagosKey = ct.rcPagos || {};
      const pago = pagosKey[temp] || {};
      out.push({
        id: `rc_${ct.id}_${temp.replace("/","")}`,
        ctId: ct.id,
        temporada: temp,
        cliente: ct.razonSocial,
        pais: ct.pais,
        haTotal,
        valorPorHa,
        montoFact,
        montoCobro,
        whtPct: pct(ct.pais)===1 ? 0 : 15,
        mesCobro,
        añoCobro: parseInt(temp.split("/")[1]),
        pagado: !!pago.pagado,
        fechaPago: pago.fechaPago || "",
        nFact: pago.nFact || "",
        _fromContract: true,
      });
    });
  });
  return out;
}

function derivarTotalPedidosDesdeContratos(ctData) {
  // Una fila por plantación de cada contrato
  const out = [];
  (ctData||[]).forEach(ct => {
    (ct.plantaciones||[]).forEach(p => {
      out.push({
        id: `tp_${ct.id}_${p.id}`,
        ctId: ct.id,
        plantacionId: p.id,
        cliente: ct.razonSocial,
        pais: ct.pais,
        especie: p.especie || "",
        variedad: p.variedad || "",
        nPlantas: Number(p.nPlantas)||0,
        hectareas: Number(p.hectareas)||0,
        fechaPlantacion: p.fechaPlantacion || "",
        sublicenciatario: p.sublicenciatario_nombre || "",
        estado: p.estado || "Confirmado",
        _fromContract: true,
      });
    });
  });
  return out;
}

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
  await exportCSV(rows, headers, "Contratos_Osiris", {
    tituloDoc: "Contratos Productores-Exportadores",
    subtituloDoc: "Osiris Plant Management · Grupo Mediterra",
    filtros: `${filtrado.length} contratos exportados`,
  });
}

function ControlContratos({data,setData,clientes,setClientes,variedadesMaestro=[],setVariedadesMaestro,especiesMaestro=[],setEspeciesMaestro,obtentoresData=[],viverosData=[],setViveros,can}){
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
  const [showVariedades,setShowVariedades]=useState(false);
  const [showEspecies,setShowEspecies]=useState(false);
  const [nuevoTipo,setNuevoTipo]=useState("");
  const [nuevoAnexo,setNuevoAnexo]=useState("");
  const [clienteSelId,setClienteSelId]=useState("");

  const formAnexoVacio={activo:false,firmadoOsiris:false,firmadoLicenciado:false,tipo:""};
  const formVacio={
    razonSocial:"",nombreComercial:"",taxID:"",pais:"Peru",direccion:"",ciudad:"",
    tipoContrato:"Licencia",moneda:"USD",fechaContrato:"",fechaTermino:"",
    renovable:false,fechaTerminoNueva:"",
    firmadoLicenciado:false,firmadoOsiris:false,verDigital:"",linkContrato:"",
    anexo1:{...formAnexoVacio},anexo2:{...formAnexoVacio},anexo3:{...formAnexoVacio},
    nombreRep:"",personeria:"",nombrePredio:"",direccionPredio:"",cuartel:"",
    region:"",ciudadPredio:"",coordenadas:"",
    tipoContractFee:"Sin Devolución",montoContractFee:30000,
    valorRoyaltyPlanta:1.00,valorRoyaltyComercial:3000,
    royaltyInflacion:false,mesFacuracionRC:"",notas:"",
    // Nuevos campos sesión 9
    plantaciones:[],
    sublicenciatarios:[],
    rcInicioTemporada:"",  // ej "2026/2027"
    rcMesCobro:"",          // hereda de RC_MES_DEFAULT_POR_PAIS si vacío al usar
    rpPlantaCuotas:[
      {id:"cuo_firma",      descripcion:"Al firmar contrato", pct:50, fechaEvento:""},
      {id:"cuo_plantacion", descripcion:"A la plantación",    pct:50, fechaEvento:""},
    ],
    rcPagos:{},   // {temporada: {pagado, fechaPago, nFact}}
    contractFeePagado:false, contractFeeFechaPago:"", contractFeeNFact:"",
    // Multa
    llevaMulta:false,haMinContrato:0,
    tieneAnioPrueba:false,cantAnioPrueba:1,
  };
  const [form,setForm]=useState(formVacio);
  // Wizard de "nuevo contrato": paso actual
  const [wizStep, setWizStep] = useState(1);

  const upd=(id,c,v)=>setData(prev=>prev.map(r=>{
    if(r.id!==id) return r;
    // Para objetos anidados (anexos), serializar; para otros, directo
    const valA = typeof r[c]==="object" ? JSON.stringify(r[c]) : String(r[c]||"");
    const valD = typeof v==="object" ? JSON.stringify(v) : String(v||"");
    if(valA !== valD) {
      window.auditLog&&window.auditLog("editar", {modulo:"osiris", seccion:"Contratos",
        descripcion:`Editó contrato de "${r.razonSocial}" · ${r.pais}: campo ${c}`,
        registroId:id, campo:c,
        valorAnterior:valA.slice(0,200), valorNuevo:valD.slice(0,200)});
    }
    return {...r,[c]:v};
  }));
  const setF=(c,v)=>setForm(p=>({...p,[c]:v}));

  // ── Helpers para sincronizar OC del vivero con plantaciones ─────────
  // Cuando una plantación se crea/edita/elimina con vivero asociado, las OCs
  // del contrato del vivero se mantienen sincronizadas automáticamente.
  function generarOCEnVivero(plantacion) {
    if(!setViveros) return;
    if(!plantacion?.vivero_id || !plantacion?.nPlantas || !plantacion?.vivero_fee_usd) return;
    const ocId = `oc_plt_${plantacion.id}_${Date.now()}`;
    const productorActual = data.find(c=>c.plantaciones?.some(p=>p.id===plantacion.id));
    setViveros(prev => (prev||[]).map(v=>{
      if(v.id !== plantacion.vivero_id) return v;
      const nuevaOC = {
        id: ocId,
        n_oc: `OC-${(v.ordenesCompra||[]).length+1}`,
        cliente: productorActual?.razonSocial || "",
        ctId: productorActual?.id || "",
        plantacionId: plantacion.id,
        variedad_id: plantacion.variedad_id || "",
        especie: plantacion.especie || "",
        variedad: plantacion.variedad || "",
        plantas: plantacion.nPlantas,
        fee: plantacion.vivero_fee_usd,
        total: (plantacion.nPlantas||0) * (plantacion.vivero_fee_usd||0),
        estado: "Pendiente",
        f_oc: new Date().toISOString().split("T")[0],
        observaciones: `Generada automáticamente desde plantación ${plantacion.especie} · ${plantacion.variedad}`,
        _fromPlantacion: true,
      };
      return {...v, ordenesCompra: [...(v.ordenesCompra||[]), nuevaOC]};
    }));
    // También actualizar la plantación con el ocId
    if(productorActual) {
      const nextPl = (productorActual.plantaciones||[]).map(x =>
        x.id === plantacion.id ? {...x, vivero_oc_id: ocId} : x);
      setData(prev => prev.map(c => c.id === productorActual.id ? {...c, plantaciones:nextPl} : c));
    }
    window.auditLog && window.auditLog("crear", {modulo:"osiris", seccion:"OC Vivero (auto)",
      descripcion:`OC autogenerada en vivero "${plantacion.vivero_nombre}" desde plantación ${plantacion.especie} · ${plantacion.variedad}: ${plantacion.nPlantas} plantas × $${plantacion.vivero_fee_usd}`,
      registroId:ocId});
  }
  function actualizarOCEnVivero(viveroId, ocId, cambios) {
    if(!setViveros || !viveroId || !ocId) return;
    setViveros(prev => (prev||[]).map(v=>{
      if(v.id !== viveroId) return v;
      return {
        ...v,
        ordenesCompra: (v.ordenesCompra||[]).map(oc =>
          oc.id === ocId ? {...oc, ...cambios} : oc)
      };
    }));
  }
  function removerOCDelVivero(viveroId, ocId) {
    if(!setViveros || !viveroId || !ocId) return;
    setViveros(prev => (prev||[]).map(v=>{
      if(v.id !== viveroId) return v;
      return {
        ...v,
        ordenesCompra: (v.ordenesCompra||[]).filter(oc => oc.id !== ocId)
      };
    }));
    window.auditLog && window.auditLog("eliminar", {modulo:"osiris", seccion:"OC Vivero (auto)",
      descripcion:`OC eliminada por unvinculación de plantación`,
      registroId:ocId});
  }

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
    const id = `ct_${Date.now()}`;
    setData(prev=>[...prev,{...form,id}]);
    window.auditLog&&window.auditLog("crear", {modulo:"osiris", seccion:"Contratos",
      descripcion:`Creó contrato para "${form.razonSocial}" · ${form.pais} · ${form.tipoContrato} · ${form.fechaContrato}`,
      registroId:id});
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
    const ct = data.find(r=>r.id===id);
    if(ct) window.auditLog&&window.auditLog("eliminar", {modulo:"osiris", seccion:"Contratos",
      descripcion:`Eliminó contrato de "${ct.razonSocial}" · ${ct.pais||""} · ${ct.tipoContrato||""}`,
      registroId:id});
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
                <div>
                  <div style={{fontSize:11,color:C.gris,fontWeight:600,marginBottom:4}}>Renovable</div>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:can?"pointer":"default",
                    background:r.renovable?"#dbeafe":"#f1f5f9",border:`1px solid ${r.renovable?"#60a5fa":"#d1d5db"}`,
                    borderRadius:8,padding:"7px 12px",fontSize:12,fontWeight:600,color:r.renovable?"#1d4ed8":"#94a3b8"}}>
                    <input type="checkbox" disabled={!can} checked={!!r.renovable} onChange={()=>upd(r.id,"renovable",!r.renovable)} style={{accentColor:"#2563eb"}}/>
                    🔄 Contrato renovable
                  </label>
                </div>
                {r.renovable&&<Campo label="📆 Nueva Fecha Vencimiento" campo="fechaTerminoNueva" tipo="date" r={r}/>}
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
                    <div style={{display:"flex",flexDirection:"column",gap:10,flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                        <span style={{fontSize:12,color:"#9f1239"}}>Mínimo Há según contrato:</span>
                        {can
                          ? <input type="number" min="0" value={r.haMinContrato||0}
                              onChange={e=>upd(r.id,"haMinContrato",parseFloat(e.target.value)||0)}
                              style={{width:90,padding:"5px 8px",borderRadius:6,border:"1px solid #fecdd3",fontSize:13,textAlign:"right"}}/>
                          : <span style={{fontWeight:700,color:"#9f1239"}}>{r.haMinContrato||0}</span>
                        }
                        <span style={{fontSize:12,color:"#9f1239"}}>Há</span>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                        <span style={{fontSize:12,color:"#9f1239"}}>Monto multa ({r.moneda||"USD"}):</span>
                        {can
                          ? <input type="number" min="0" value={r.montoMulta||0}
                              onChange={e=>upd(r.id,"montoMulta",parseFloat(e.target.value)||0)}
                              style={{width:120,padding:"5px 8px",borderRadius:6,border:"1px solid #fecdd3",fontSize:13,textAlign:"right"}}/>
                          : <span style={{fontWeight:700,color:"#9f1239"}}>{r.montoMulta?`${r.moneda||"USD"} ${Number(r.montoMulta).toLocaleString("es-CL")}`:0}</span>
                        }
                      </div>
                      <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
                        <span style={{fontSize:12,color:"#9f1239",whiteSpace:"nowrap",marginTop:4}}>Descripción multa:</span>
                        {can
                          ? <textarea value={r.descMulta||""} onChange={e=>upd(r.id,"descMulta",e.target.value)}
                              rows={2} placeholder="Ej: USD 5,000 por cada hectárea no plantada bajo el mínimo contractual..."
                              style={{flex:1,padding:"5px 8px",borderRadius:6,border:"1px solid #fecdd3",fontSize:12,resize:"vertical",minWidth:250}}/>
                          : <span style={{fontSize:12,color:"#9f1239"}}>{r.descMulta||"—"}</span>
                        }
                      </div>
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
            <>
              <div style={{padding:"10px 14px",background:"#fef3c7",borderRadius:8,border:"1px solid #fde68a",marginBottom:14,fontSize:11,color:"#78350f"}}>
                💡 <strong>Recordatorio fiscal:</strong> Contract Fee no lleva WHT. Royalty Planta y Royalty Comercial sí están sujetos a WHT 15% en Perú/México (en Chile, sin WHT).
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))",gap:16}}>
                <div>
                  <div style={{fontSize:11,color:C.gris,fontWeight:600,marginBottom:4}}>Tipo Contract Fee</div>
                  <Cell val={r.tipoContractFee} onChange={v=>upd(r.id,"tipoContractFee",v)} opts={TIPOS_FEE} can={can}/>
                  <div style={{fontSize:9,color:"#94a3b8",marginTop:3}}>Sin WHT</div>
                </div>
                <div>
                  <div style={{fontSize:11,color:C.gris,fontWeight:600,marginBottom:4}}>Monto Contract Fee (USD)</div>
                  <Cell val={r.montoContractFee} onChange={v=>upd(r.id,"montoContractFee",parseFloat(v)||0)} type="number" can={can}/>
                </div>
                <div>
                  <div style={{fontSize:11,color:C.gris,fontWeight:600,marginBottom:4}}>Valor Royalty/Planta (USD)</div>
                  <Cell val={r.valorRoyaltyPlanta} onChange={v=>upd(r.id,"valorRoyaltyPlanta",parseFloat(v)||0)} type="number" can={can}/>
                  <div style={{fontSize:9,color:pct(r.pais)===1?"#94a3b8":"#dc2626",marginTop:3}}>{pct(r.pais)===1?"Sin WHT (Chile)":"WHT 15% — neto = "+(((Number(r.valorRoyaltyPlanta)||0)*0.85).toFixed(2))+" USD/planta"}</div>
                </div>
                <div>
                  <div style={{fontSize:11,color:C.gris,fontWeight:600,marginBottom:4}}>Valor Royalty Comercial (USD/Há)</div>
                  <Cell val={r.valorRoyaltyComercial} onChange={v=>upd(r.id,"valorRoyaltyComercial",parseFloat(v)||0)} type="number" can={can}/>
                  <div style={{fontSize:9,color:pct(r.pais)===1?"#94a3b8":"#dc2626",marginTop:3}}>{pct(r.pais)===1?"Sin WHT (Chile)":"WHT 15% — neto = $"+(((Number(r.valorRoyaltyComercial)||0)*0.85).toFixed(0))+"/há"}</div>
                </div>
                <div>
                  <div style={{fontSize:11,color:C.gris,fontWeight:600,marginBottom:4}}>📅 Mes Facturación RC</div>
                  <Cell val={r.mesFacuracionRC||""} onChange={v=>upd(r.id,"mesFacuracionRC",v)} opts={["—",...MESES_ANO]} can={can}/>
                  <div style={{fontSize:9,color:"#94a3b8",marginTop:3}}>Default {r.pais}: {RC_MES_DEFAULT_POR_PAIS[r.pais]||"Abril"}</div>
                </div>
                <div>
                  <div style={{fontSize:11,color:C.gris,fontWeight:600,marginBottom:4}}>📆 Año primer cobro RC</div>
                  <Cell val={r.anioPrimerCobroRC||""} onChange={v=>upd(r.id,"anioPrimerCobroRC",parseInt(v)||"")} type="number" can={can}/>
                  <div style={{fontSize:9,color:"#94a3b8",marginTop:3}}>Ej. 2027 — luego se repite cada año hasta término</div>
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
            </>
          )}

          {/* ── SECCIÓN: PLANTACIONES (variedades plantadas) ── */}
          {sec==="plantaciones"&&(<>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
              <div style={{fontSize:13,color:"#475569"}}>
                🌿 Plantaciones del licenciatario principal — variedades, plantas y hectáreas que generan los royalties.
              </div>
              {can&&<button onClick={()=>{
                const variedadDefault = (variedadesMaestro||[])[0];
                const nuevaPlant = {
                  id:`plt_${Date.now()}`,
                  variedad_id: variedadDefault?.id || "",
                  especie:    variedadDefault?.especie || "",
                  variedad:   variedadDefault?.variedad || "",
                  nPlantas:   0,
                  hectareas:  0,
                  fechaPlantacion:"",
                  sublicenciatario_id:"",
                  sublicenciatario_nombre:"",
                  estado:"Confirmado",
                };
                const next = [...(r.plantaciones||[]), nuevaPlant];
                upd(r.id,"plantaciones",next);
              }} style={{background:"#15803d",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Agregar plantación</button>}
            </div>

            {(r.plantaciones||[]).length===0?(
              <div style={{padding:30,textAlign:"center",color:"#94a3b8",border:"1px dashed #e2e8f0",borderRadius:10}}>
                <div style={{fontSize:32,marginBottom:8}}>🌿</div>
                <div style={{fontSize:12}}>Sin plantaciones registradas. {can?"Haz clic en \"+ Agregar plantación\" para empezar.":""}</div>
                <div style={{fontSize:11,color:"#64748b",marginTop:6}}>💡 Las plantaciones alimentan automáticamente Royalty Planta (cantidad × USD/planta) y Royalty Comercial (há × USD/há).</div>
              </div>
            ):(<>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,background:"#fff",borderRadius:10,overflow:"hidden",border:"1px solid #e2e8f0"}}>
                  <thead><tr style={{background:"#15803d",color:"#fff"}}>
                    {["Especie","Variedad","Plantas","Hectáreas","Fecha plantación","Sublicenciatario","Vivero","Fee USD/planta","Estado",""].map(h=>(
                      <th key={h} style={{padding:"8px 10px",textAlign:"left",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {(r.plantaciones||[]).map((p,i)=>{
                      const updPl = (campo, valor) => {
                        const next = (r.plantaciones||[]).map(x=>x.id===p.id?{...x,[campo]:valor}:x);
                        upd(r.id,"plantaciones",next);
                      };
                      const updPlMulti = (cambios) => {
                        const next = (r.plantaciones||[]).map(x=>x.id===p.id?{...x,...cambios}:x);
                        upd(r.id,"plantaciones",next);
                      };
                      const seleccionarVariedad = (vid) => {
                        if(!vid){ updPlMulti({variedad_id:"", especie:p.especie, variedad:p.variedad}); return; }
                        const vv = (variedadesMaestro||[]).find(x=>x.id===vid);
                        updPlMulti({
                          variedad_id: vid,
                          especie:  vv?.especie || p.especie,
                          variedad: vv?.variedad || p.variedad,
                        });
                      };
                      const seleccionarSublic = (sid) => {
                        const sub = (r.sublicenciatarios||[]).find(s=>s.id===sid);
                        updPlMulti({
                          sublicenciatario_id: sid,
                          sublicenciatario_nombre: sub?.razonSocial || "",
                        });
                      };
                      const seleccionarVivero = (vivId) => {
                        if(!vivId){
                          // Si tenía OC vinculada, preguntar
                          if(p.vivero_oc_id && window.confirm("Esta plantación tenía vivero asociado con OC generada. ¿Eliminar también la OC del vivero?")) {
                            removerOCDelVivero(p.vivero_id, p.vivero_oc_id);
                          }
                          updPlMulti({vivero_id:"", vivero_nombre:"", vivero_fee_usd:0, vivero_oc_id:""});
                          return;
                        }
                        const viv = (viverosData||[]).find(v=>v.id===vivId);
                        updPlMulti({
                          vivero_id: vivId,
                          vivero_nombre: viv?.viverista || "",
                        });
                      };
                      // Especie color del Maestro
                      const espMaestro = (especiesMaestro||[]).find(e=>e.nombre.toLowerCase().trim()===(p.especie||"").toLowerCase().trim());
                      const colorEsp = espMaestro?.color;
                      // Variedad coincide con maestro (para el dual-mode)
                      const enMaestro = (variedadesMaestro||[]).some(v=>v.id===p.variedad_id);
                      return (
                        <tr key={p.id} style={{borderBottom:"1px solid #f1f5f9",background:i%2?"#f8fafc":"#fff"}}>
                          {/* Especie: dropdown puro del maestro + Crear nuevo */}
                          <td style={{padding:"6px 8px",minWidth:140}}>
                            <div style={{display:"flex",gap:4,alignItems:"center"}}>
                              {colorEsp&&<div title={p.especie} style={{width:14,height:14,borderRadius:3,background:colorEsp,flexShrink:0,boxShadow:"0 1px 2px #0002"}}/>}
                              <select disabled={!can} value={p.especie||""} onChange={e=>{
                                if(e.target.value==="__nueva__") {
                                  const nombre = window.prompt("Nombre de la nueva especie:");
                                  if(!nombre || !nombre.trim()) return;
                                  const nombreNorm = nombre.trim();
                                  const dupe = (especiesMaestro||[]).find(x=>x.nombre.toLowerCase().trim()===nombreNorm.toLowerCase());
                                  if(dupe) { updPlMulti({especie:dupe.nombre, variedad_id:""}); return; }
                                  const id = `esp_${Date.now()}`;
                                  const idxColor = (especiesMaestro||[]).length % COLORES_ESPECIES.length;
                                  const nueva = {id, nombre:nombreNorm, color:COLORES_ESPECIES[idxColor].hex, observaciones:""};
                                  setEspeciesMaestro&&setEspeciesMaestro(prev=>[...(prev||[]),nueva]);
                                  window.auditLog&&window.auditLog("crear",{modulo:"osiris",seccion:"Maestro Especies",
                                    descripcion:`Creó especie "${nombreNorm}" desde plantaciones`,registroId:id});
                                  updPlMulti({especie:nombreNorm, variedad_id:""});
                                } else {
                                  const variedadActualOK = (variedadesMaestro||[]).some(v=>v.id===p.variedad_id && v.especie===e.target.value);
                                  updPlMulti({
                                    especie: e.target.value,
                                    variedad_id: variedadActualOK ? p.variedad_id : "",
                                    variedad: variedadActualOK ? p.variedad : "",
                                  });
                                }
                              }} style={{flex:1,padding:"5px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,background:"#fff"}}>
                                <option value="">— Seleccionar —</option>
                                {(especiesMaestro||[]).map(e=><option key={e.id} value={e.nombre}>{e.nombre}</option>)}
                                {can&&<option value="__nueva__">＋ Crear nueva especie...</option>}
                              </select>
                            </div>
                          </td>
                          {/* Variedad: dropdown puro filtrado por especie + Crear nueva */}
                          <td style={{padding:"6px 8px",minWidth:140}}>
                            {(()=>{
                              const variedadesFiltradas = p.especie
                                ? (variedadesMaestro||[]).filter(v=>v.especie===p.especie)
                                : [];
                              return (
                                <select disabled={!can||!p.especie} value={p.variedad_id||""} onChange={e=>{
                                  if(e.target.value==="__nueva__") {
                                    if(!p.especie){alert("Selecciona primero la especie.");return;}
                                    const nombre = window.prompt(`Nombre de la nueva variedad (especie: ${p.especie}):`);
                                    if(!nombre || !nombre.trim()) return;
                                    const nombreNorm = nombre.trim();
                                    const dupe = (variedadesMaestro||[]).find(v=>v.especie===p.especie && v.variedad.toLowerCase().trim()===nombreNorm.toLowerCase());
                                    if(dupe){ seleccionarVariedad(dupe.id); return; }
                                    const id = `var_${Date.now()}`;
                                    const nueva = {id, especie:p.especie, variedad:nombreNorm, obtentor:"", observaciones:""};
                                    setVariedadesMaestro&&setVariedadesMaestro(prev=>[...(prev||[]),nueva]);
                                    window.auditLog&&window.auditLog("crear",{modulo:"osiris",seccion:"Maestro Variedades",
                                      descripcion:`Creó variedad "${p.especie} · ${nombreNorm}" desde plantaciones`,registroId:id});
                                    seleccionarVariedad(id);
                                  } else {
                                    seleccionarVariedad(e.target.value);
                                  }
                                }} style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,background:p.especie?"#fff":"#f1f5f9"}}>
                                  <option value="">{p.especie?"— Seleccionar —":"(Selecciona especie primero)"}</option>
                                  {variedadesFiltradas.map(v=>(
                                    <option key={v.id} value={v.id}>{v.variedad}{v.obtentor?` · ${v.obtentor}`:""}</option>
                                  ))}
                                  {can&&p.especie&&<option value="__nueva__">＋ Crear nueva variedad...</option>}
                                </select>
                              );
                            })()}
                          </td>
                          <td style={{padding:"6px 8px"}}>
                            <input type="number" disabled={!can} value={p.nPlantas||0} onChange={e=>{
                              const n = parseInt(e.target.value)||0;
                              updPlMulti({nPlantas:n});
                              // Si tiene OC vinculada, actualizar la OC también
                              if(p.vivero_oc_id && p.vivero_id) {
                                actualizarOCEnVivero(p.vivero_id, p.vivero_oc_id, {plantas:n, total:n*(p.vivero_fee_usd||0)});
                              }
                            }}
                              style={{width:90,padding:"5px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,textAlign:"right"}}/>
                          </td>
                          <td style={{padding:"6px 8px"}}>
                            <input type="number" step="0.01" disabled={!can} value={p.hectareas||0} onChange={e=>updPl("hectareas",parseFloat(e.target.value)||0)}
                              style={{width:80,padding:"5px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,textAlign:"right"}}/>
                          </td>
                          <td style={{padding:"6px 8px"}}>
                            <input type="date" disabled={!can} value={p.fechaPlantacion||""} onChange={e=>updPl("fechaPlantacion",e.target.value)}
                              style={{padding:"5px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11}}/>
                          </td>
                          <td style={{padding:"6px 8px"}}>
                            <select disabled={!can} value={p.sublicenciatario_id||""} onChange={e=>seleccionarSublic(e.target.value)}
                              style={{padding:"5px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,background:"#fff",maxWidth:160}}>
                              <option value="">— Sin sublicencia —</option>
                              {(r.sublicenciatarios||[]).map(s=><option key={s.id} value={s.id}>{s.razonSocial}</option>)}
                            </select>
                          </td>
                          {/* NUEVO: Vivero */}
                          <td style={{padding:"6px 8px"}}>
                            {(viverosData||[]).length>0?(
                              <select disabled={!can} value={p.vivero_id||""} onChange={e=>seleccionarVivero(e.target.value)}
                                style={{padding:"5px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,background:"#fff",maxWidth:170}}>
                                <option value="">— Sin vivero —</option>
                                {(viverosData||[]).map(v=>(
                                  <option key={v.id} value={v.id}>{v.viverista || "Sin nombre"}{v.pais?` · ${v.pais}`:""}</option>
                                ))}
                              </select>
                            ):(
                              <span style={{fontSize:10,color:"#94a3b8",fontStyle:"italic"}}>Sin contratos vivero</span>
                            )}
                          </td>
                          {/* NUEVO: Fee USD/planta */}
                          <td style={{padding:"6px 8px"}}>
                            <input type="number" step="0.001" disabled={!can||!p.vivero_id} value={p.vivero_fee_usd||0}
                              placeholder={p.vivero_id?"0.00":"—"}
                              onChange={e=>{
                                const fee = parseFloat(e.target.value)||0;
                                updPlMulti({vivero_fee_usd:fee});
                                if(p.vivero_oc_id && p.vivero_id) {
                                  actualizarOCEnVivero(p.vivero_id, p.vivero_oc_id, {fee, total:(p.nPlantas||0)*fee});
                                }
                              }}
                              style={{width:80,padding:"5px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,textAlign:"right",background:p.vivero_id?"#fff":"#f1f5f9"}}/>
                            {p.vivero_id&&p.nPlantas>0&&(p.vivero_fee_usd||0)>0&&(
                              <div style={{fontSize:9,color:"#64748b",marginTop:2,textAlign:"right"}}>
                                Total: ${N(((p.nPlantas||0)*(p.vivero_fee_usd||0)).toFixed(0))}
                              </div>
                            )}
                            {p.vivero_id&&!p.vivero_oc_id&&p.nPlantas>0&&(p.vivero_fee_usd||0)>0&&can&&(
                              <button onClick={()=>generarOCEnVivero(p)}
                                title="Generar OC en el contrato del vivero"
                                style={{marginTop:3,padding:"2px 6px",borderRadius:4,background:"#0d9488",color:"#fff",border:"none",fontSize:9,cursor:"pointer",fontWeight:600,display:"block",width:"100%"}}>
                                ⚡ Generar OC
                              </button>
                            )}
                            {p.vivero_oc_id&&(
                              <div style={{fontSize:9,color:"#0d9488",marginTop:2,fontWeight:600,textAlign:"right"}}>
                                ✓ OC vinculada
                              </div>
                            )}
                          </td>
                          <td style={{padding:"6px 8px"}}>
                            <select disabled={!can} value={p.estado||"Confirmado"} onChange={e=>updPl("estado",e.target.value)}
                              style={{padding:"5px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,background:"#fff"}}>
                              <option>Confirmado</option><option>Plantado</option><option>Productivo</option><option>Anulado</option>
                            </select>
                          </td>
                          <td style={{padding:"6px 8px",textAlign:"center"}}>
                            {can&&<button onClick={()=>{
                              if(!window.confirm(`¿Eliminar la plantación "${p.especie} · ${p.variedad}"?`))return;
                              // Si tiene OC vinculada, preguntar si también eliminar la OC del vivero
                              if(p.vivero_oc_id && p.vivero_id) {
                                if(window.confirm(`Esta plantación tiene una OC vinculada en el vivero "${p.vivero_nombre||"el vivero"}". ¿Eliminar también esa OC?`)) {
                                  removerOCDelVivero(p.vivero_id, p.vivero_oc_id);
                                }
                              }
                              const next = (r.plantaciones||[]).filter(x=>x.id!==p.id);
                              upd(r.id,"plantaciones",next);
                            }} style={{background:"#fef2f2",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,color:"#991b1b"}}>🗑</button>}
                          </td>
                        </tr>
                      );
                    })}
                    <tr style={{background:"#f0fdf4",fontWeight:800}}>
                      <td colSpan={2} style={{padding:"7px 10px",color:"#15803d"}}>TOTALES</td>
                      <td style={{padding:"7px 10px",color:"#15803d",textAlign:"right"}}>{N((r.plantaciones||[]).reduce((s,p)=>s+(parseFloat(p.nPlantas)||0),0))}</td>
                      <td style={{padding:"7px 10px",color:"#15803d",textAlign:"right"}}>{N((r.plantaciones||[]).reduce((s,p)=>s+(parseFloat(p.hectareas)||0),0).toFixed(2))}</td>
                      <td colSpan={3}></td>
                      <td style={{padding:"7px 10px",color:"#dc2626",textAlign:"right"}} title="Total egreso por viveros">${N((r.plantaciones||[]).reduce((s,p)=>s+((parseFloat(p.nPlantas)||0)*(parseFloat(p.vivero_fee_usd)||0)),0).toFixed(0))}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={{marginTop:12,padding:12,background:"#f0fdf4",borderRadius:10,fontSize:11,color:"#14532d",borderLeft:"4px solid #16a34a"}}>
                💡 <strong>Royalty Planta estimado:</strong> {(r.plantaciones||[]).reduce((s,p)=>s+(parseFloat(p.nPlantas)||0),0)} plantas × ${r.valorRoyaltyPlanta||1}/planta = <strong>${N(((r.plantaciones||[]).reduce((s,p)=>s+(parseFloat(p.nPlantas)||0),0)*(r.valorRoyaltyPlanta||1)).toFixed(2))}</strong> (100% facturado, {pct(r.pais)===1?"sin WHT":"15% WHT"})
                <br/>
                💡 <strong>Royalty Comercial anual:</strong> {N((r.plantaciones||[]).reduce((s,p)=>s+(parseFloat(p.hectareas)||0),0).toFixed(2))} há × ${N(r.valorRoyaltyComercial||0)}/há = <strong>${N(((r.plantaciones||[]).reduce((s,p)=>s+(parseFloat(p.hectareas)||0),0)*(r.valorRoyaltyComercial||0)).toFixed(2))}</strong>/temporada (100% facturado)
                {(r.plantaciones||[]).some(p=>p.vivero_id)&&<><br/>💸 <strong style={{color:"#dc2626"}}>Egreso por viveros:</strong> ${N((r.plantaciones||[]).reduce((s,p)=>s+((parseFloat(p.nPlantas)||0)*(parseFloat(p.vivero_fee_usd)||0)),0).toFixed(0))} (one-time, USD)</>}
              </div>
            </>)}
          </>)}

          {/* ── SECCIÓN: SUBLICENCIATARIOS (informativo) ── */}
          {sec==="sublicenciatarios"&&(<>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
              <div style={{fontSize:13,color:"#475569"}}>
                🤝 Empresas sublicenciatarias del licenciatario principal — <em>solo informativo, sin impacto financiero directo</em>.
              </div>
              {can&&<button onClick={()=>{
                const nuevoSub = {
                  id:`sub_${Date.now()}`,
                  razonSocial:"", pais:"Peru", taxID:"",
                  nombrePredio:"", direccionPredio:"", region:"",
                  hectareas:0, plantas:0,
                  variedades:"",
                  observaciones:"",
                };
                const next = [...(r.sublicenciatarios||[]), nuevoSub];
                upd(r.id,"sublicenciatarios",next);
              }} style={{background:"#0284c7",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Agregar sublicenciatario</button>}
            </div>
            {(r.sublicenciatarios||[]).length===0?(
              <div style={{padding:30,textAlign:"center",color:"#94a3b8",border:"1px dashed #e2e8f0",borderRadius:10}}>
                <div style={{fontSize:32,marginBottom:8}}>🤝</div>
                <div style={{fontSize:12}}>Sin sublicenciatarios. {can?"Agrega uno con el botón de arriba.":""}</div>
              </div>
            ):(
              <div style={{display:"grid",gridTemplateColumns:"1fr",gap:12}}>
                {(r.sublicenciatarios||[]).map(s=>{
                  const updSub = (campo, valor) => {
                    const next = (r.sublicenciatarios||[]).map(x=>x.id===s.id?{...x,[campo]:valor}:x);
                    upd(r.id,"sublicenciatarios",next);
                  };
                  return (
                    <div key={s.id} style={{background:"#fff",border:"1px solid #bae6fd",borderRadius:10,padding:14}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                        <div style={{fontSize:13,fontWeight:700,color:"#0c4a6e"}}>🤝 {s.razonSocial||"(sin nombre)"}</div>
                        {can&&<button onClick={()=>{
                          if(!window.confirm(`¿Eliminar al sublicenciatario "${s.razonSocial||"(sin nombre)"}"?`))return;
                          const next = (r.sublicenciatarios||[]).filter(x=>x.id!==s.id);
                          upd(r.id,"sublicenciatarios",next);
                        }} style={{background:"#fef2f2",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,color:"#991b1b"}}>🗑</button>}
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>
                        <div>
                          <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:3}}>Razón Social</div>
                          <input disabled={!can} value={s.razonSocial||""} onChange={e=>updSub("razonSocial",e.target.value)}
                            style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,boxSizing:"border-box"}}/>
                        </div>
                        <div>
                          <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:3}}>País</div>
                          <select disabled={!can} value={s.pais||"Peru"} onChange={e=>updSub("pais",e.target.value)}
                            style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,boxSizing:"border-box",background:"#fff"}}>
                            <option>Peru</option><option>Chile</option><option>Mexico</option><option>Colombia</option><option>Otro</option>
                          </select>
                        </div>
                        <div>
                          <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:3}}>RUC / Tax ID</div>
                          <input disabled={!can} value={s.taxID||""} onChange={e=>updSub("taxID",e.target.value)}
                            style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,boxSizing:"border-box"}}/>
                        </div>
                        <div>
                          <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:3}}>Nombre del Predio</div>
                          <input disabled={!can} value={s.nombrePredio||""} onChange={e=>updSub("nombrePredio",e.target.value)}
                            style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,boxSizing:"border-box"}}/>
                        </div>
                        <div style={{gridColumn:"span 2"}}>
                          <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:3}}>Dirección Predio</div>
                          <input disabled={!can} value={s.direccionPredio||""} onChange={e=>updSub("direccionPredio",e.target.value)}
                            style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,boxSizing:"border-box"}}/>
                        </div>
                        <div>
                          <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:3}}>Región / Estado</div>
                          <input disabled={!can} value={s.region||""} onChange={e=>updSub("region",e.target.value)}
                            style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,boxSizing:"border-box"}}/>
                        </div>
                        <div>
                          <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:3}}>Hectáreas</div>
                          <input type="number" step="0.01" disabled={!can} value={s.hectareas||0} onChange={e=>updSub("hectareas",parseFloat(e.target.value)||0)}
                            style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,boxSizing:"border-box",textAlign:"right"}}/>
                        </div>
                        <div>
                          <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:3}}>Plantas</div>
                          <input type="number" disabled={!can} value={s.plantas||0} onChange={e=>updSub("plantas",parseInt(e.target.value)||0)}
                            style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,boxSizing:"border-box",textAlign:"right"}}/>
                        </div>
                        <div style={{gridColumn:"span 2"}}>
                          <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:3}}>Variedades cultivadas</div>
                          <input disabled={!can} value={s.variedades||""} placeholder="Royal Dawn, Sweet Heart..." onChange={e=>updSub("variedades",e.target.value)}
                            style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,boxSizing:"border-box"}}/>
                        </div>
                        <div style={{gridColumn:"1 / -1"}}>
                          <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:3}}>Observaciones</div>
                          <input disabled={!can} value={s.observaciones||""} onChange={e=>updSub("observaciones",e.target.value)}
                            style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,boxSizing:"border-box"}}/>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>)}

          {/* ── SECCIÓN: COBROS DERIVADOS ── */}
          {sec==="cobros"&&(<>
            <div style={{fontSize:13,color:"#475569",marginBottom:12}}>
              💵 Configuración de cobros derivada de plantaciones. Cuando facture: <strong>100%</strong> del monto. Cuando cobre: <strong>{pct(r.pais)===1?"100%":"85%"}</strong> ({pct(r.pais)===1?"sin WHT":"WHT 15%"} en {r.pais}).
            </div>

            {/* Sub-sección 1: Contract Fee */}
            <div style={{background:"#fff",border:"1px solid #fde68a",borderRadius:10,padding:14,marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:800,color:"#92400e",marginBottom:10}}>💰 Contract Fee</div>
              {r.tipoContractFee==="Sin Contract Fee"?(
                <div style={{padding:14,background:"#fef3c7",borderRadius:8,fontSize:12,color:"#78350f"}}>Este contrato no contempla Contract Fee. Configurable en la sección Facturación.</div>
              ):(
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,alignItems:"end"}}>
                  <div>
                    <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:3}}>Monto USD</div>
                    <div style={{padding:"7px 10px",background:"#f8fafc",borderRadius:6,fontSize:13,fontWeight:700,color:"#92400e"}}>${N(r.montoContractFee||0)}</div>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:3}}>Neto cobro (USD)</div>
                    <div style={{padding:"7px 10px",background:"#dcfce7",borderRadius:6,fontSize:13,fontWeight:700,color:"#15803d"}}>${N(((r.montoContractFee||0)*pct(r.pais)).toFixed(2))}</div>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:3}}>N° Factura</div>
                    <input disabled={!can} value={r.contractFeeNFact||""} onChange={e=>upd(r.id,"contractFeeNFact",e.target.value)}
                      style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:3}}>Estado</div>
                    <label style={{display:"flex",alignItems:"center",gap:6,cursor:can?"pointer":"default",padding:"7px 10px",background:r.contractFeePagado?"#dcfce7":"#fef3c7",borderRadius:6,fontSize:11,fontWeight:700,color:r.contractFeePagado?"#15803d":"#92400e"}}>
                      <input type="checkbox" disabled={!can} checked={!!r.contractFeePagado} onChange={e=>upd(r.id,"contractFeePagado",e.target.checked)}/>
                      {r.contractFeePagado?"✅ Pagado":"⏳ Por cobrar"}
                    </label>
                  </div>
                  {r.contractFeePagado&&<div>
                    <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:3}}>Fecha pago</div>
                    <input type="date" disabled={!can} value={r.contractFeeFechaPago||""} onChange={e=>upd(r.id,"contractFeeFechaPago",e.target.value)}
                      style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,boxSizing:"border-box"}}/>
                  </div>}
                </div>
              )}
            </div>

            {/* Sub-sección 2: Royalty Planta - cuotas */}
            <div style={{background:"#fff",border:"1px solid #bbf7d0",borderRadius:10,padding:14,marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{fontSize:13,fontWeight:800,color:"#15803d"}}>🌱 Royalty Planta — Plan de cuotas</div>
                {can&&<button onClick={()=>{
                  const nuevaCuota = {id:`cuo_${Date.now()}`, descripcion:"Nueva cuota", pct:0, fechaEvento:""};
                  const next = [...(r.rpPlantaCuotas||[]), nuevaCuota];
                  upd(r.id,"rpPlantaCuotas",next);
                }} style={{background:"#16a34a",color:"#fff",border:"none",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>+ Cuota</button>}
              </div>
              {(()=>{
                const totPlantas = (r.plantaciones||[]).reduce((s,p)=>s+(parseFloat(p.nPlantas)||0),0);
                const valorPP = parseFloat(r.valorRoyaltyPlanta)||1;
                const totRP = totPlantas * valorPP;
                const cuotas = r.rpPlantaCuotas||[];
                const sumPct = cuotas.reduce((s,c)=>s+(parseFloat(c.pct)||0),0);
                return (
                  <>
                    <div style={{padding:10,background:"#f0fdf4",borderRadius:8,marginBottom:10,fontSize:11,color:"#14532d"}}>
                      <strong>Base:</strong> {N(totPlantas)} plantas × ${valorPP}/planta = <strong>${N(totRP.toFixed(2))}</strong> · Suma cuotas: <strong style={{color:Math.abs(sumPct-100)<0.01?"#15803d":"#dc2626"}}>{sumPct}%</strong>
                    </div>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                      <thead><tr style={{background:"#dcfce7"}}>
                        {["Descripción","%","Monto Fact.","Monto Cobro","Fecha evento","Pagado","Fecha pago","N° Fact.",""].map(h=>(
                          <th key={h} style={{padding:"6px 8px",textAlign:"left",fontSize:10,fontWeight:700,color:"#14532d"}}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {cuotas.map(c=>{
                          const monto = totRP * (parseFloat(c.pct)||0)/100;
                          const updCuo = (campo, valor) => {
                            const next = cuotas.map(x=>x.id===c.id?{...x,[campo]:valor}:x);
                            upd(r.id,"rpPlantaCuotas",next);
                          };
                          return (
                            <tr key={c.id} style={{borderBottom:"1px solid #f1f5f9"}}>
                              <td style={{padding:"5px 8px"}}>
                                <input disabled={!can} value={c.descripcion||""} onChange={e=>updCuo("descripcion",e.target.value)}
                                  style={{width:"100%",padding:"4px 6px",borderRadius:4,border:"1px solid #d1d5db",fontSize:11,boxSizing:"border-box"}}/>
                              </td>
                              <td style={{padding:"5px 8px"}}>
                                <input type="number" disabled={!can} value={c.pct||0} onChange={e=>updCuo("pct",parseFloat(e.target.value)||0)}
                                  style={{width:60,padding:"4px 6px",borderRadius:4,border:"1px solid #d1d5db",fontSize:11,textAlign:"right"}}/>
                              </td>
                              <td style={{padding:"5px 8px",fontWeight:700,color:"#15803d"}}>${N(monto.toFixed(2))}</td>
                              <td style={{padding:"5px 8px",fontWeight:700,color:"#16a34a"}}>${N((monto*pct(r.pais)).toFixed(2))}</td>
                              <td style={{padding:"5px 8px"}}>
                                <input type="date" disabled={!can} value={c.fechaEvento||""} onChange={e=>updCuo("fechaEvento",e.target.value)}
                                  style={{padding:"4px 6px",borderRadius:4,border:"1px solid #d1d5db",fontSize:11}}/>
                              </td>
                              <td style={{padding:"5px 8px",textAlign:"center"}}>
                                <input type="checkbox" disabled={!can} checked={!!c.pagado} onChange={e=>updCuo("pagado",e.target.checked)}/>
                              </td>
                              <td style={{padding:"5px 8px"}}>
                                <input type="date" disabled={!can || !c.pagado} value={c.fechaPago||""} onChange={e=>updCuo("fechaPago",e.target.value)}
                                  style={{padding:"4px 6px",borderRadius:4,border:"1px solid #d1d5db",fontSize:11,opacity:c.pagado?1:0.5}}/>
                              </td>
                              <td style={{padding:"5px 8px"}}>
                                <input disabled={!can} value={c.nFact||""} onChange={e=>updCuo("nFact",e.target.value)}
                                  style={{width:80,padding:"4px 6px",borderRadius:4,border:"1px solid #d1d5db",fontSize:11}}/>
                              </td>
                              <td style={{padding:"5px 8px"}}>
                                {can&&<button onClick={()=>{
                                  const next = cuotas.filter(x=>x.id!==c.id);
                                  upd(r.id,"rpPlantaCuotas",next);
                                }} style={{background:"#fef2f2",border:"none",borderRadius:4,padding:"3px 6px",cursor:"pointer",fontSize:10,color:"#991b1b"}}>×</button>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </>
                );
              })()}
            </div>

            {/* Sub-sección 3: Royalty Comercial — Calendario por temporada */}
            <div style={{background:"#fff",border:"1px solid #fbcfe8",borderRadius:10,padding:14}}>
              <div style={{fontSize:13,fontWeight:800,color:"#9d174d",marginBottom:10}}>📈 Royalty Comercial — Calendario por temporada</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:10,marginBottom:12}}>
                <div>
                  <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:3}}>Temporada inicio</div>
                  <input disabled={!can} value={r.rcInicioTemporada||""} placeholder="2026/2027" onChange={e=>upd(r.id,"rcInicioTemporada",e.target.value)}
                    style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,boxSizing:"border-box"}}/>
                  <div style={{fontSize:9,color:"#94a3b8",marginTop:2}}>Formato: AAAA/AAAA</div>
                </div>
                <div>
                  <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:3}}>Mes de cobro</div>
                  <select disabled={!can} value={r.rcMesCobro||RC_MES_DEFAULT_POR_PAIS[r.pais]||"Abril"} onChange={e=>upd(r.id,"rcMesCobro",e.target.value)}
                    style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,boxSizing:"border-box",background:"#fff"}}>
                    {MESES.map(m=><option key={m}>{m}</option>)}
                  </select>
                  <div style={{fontSize:9,color:"#94a3b8",marginTop:2}}>Default {r.pais}: {RC_MES_DEFAULT_POR_PAIS[r.pais]||"—"}</div>
                </div>
                <div>
                  <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:3}}>USD/há</div>
                  <div style={{padding:"7px 10px",background:"#fdf2f8",borderRadius:6,fontSize:13,fontWeight:700,color:"#9d174d"}}>${N(r.valorRoyaltyComercial||0)}</div>
                </div>
                <div>
                  <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:3}}>Há totales</div>
                  <div style={{padding:"7px 10px",background:"#f8fafc",borderRadius:6,fontSize:13,fontWeight:700,color:"#1e293b"}}>{N(((r.plantaciones||[]).reduce((s,p)=>s+(parseFloat(p.hectareas)||0),0)).toFixed(2))} há</div>
                </div>
              </div>

              {(()=>{
                const haTotal = (r.plantaciones||[]).reduce((s,p)=>s+(parseFloat(p.hectareas)||0),0);
                if(haTotal===0) return <div style={{padding:14,background:"#fdf2f8",borderRadius:8,fontSize:11,color:"#9d174d"}}>⚠️ Aún no hay hectáreas registradas en Plantaciones. Agrega plantaciones para ver el calendario.</div>;
                if(!r.rcInicioTemporada) return <div style={{padding:14,background:"#fdf2f8",borderRadius:8,fontSize:11,color:"#9d174d"}}>⚠️ Define la "Temporada inicio" arriba (ej. 2026/2027) para ver el calendario.</div>;
                const valor = parseFloat(r.valorRoyaltyComercial)||0;
                const temps = temporadasEntre(r.rcInicioTemporada, r.fechaTermino);
                const pagos = r.rcPagos||{};
                const updPago = (temp, campo, valor) => {
                  const np = {...(r.rcPagos||{})};
                  np[temp] = {...(np[temp]||{}), [campo]:valor};
                  upd(r.id,"rcPagos",np);
                };
                const totalAcumulado = temps.length * haTotal * valor;
                return (
                  <>
                    <div style={{padding:10,background:"#fdf2f8",borderRadius:8,marginBottom:10,fontSize:11,color:"#9d174d"}}>
                      <strong>{temps.length}</strong> temporada{temps.length!==1?"s":""} desde {r.rcInicioTemporada}
                      {r.fechaTermino?` hasta término ${r.fechaTermino}`:" (10 años proyectados)"} ·
                      Total facturable acumulado: <strong>${N(totalAcumulado.toFixed(2))}</strong>
                    </div>
                    <div style={{overflowX:"auto"}}>
                      <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                        <thead><tr style={{background:"#fce7f3"}}>
                          {["Temporada","Mes cobro","Há","$/há","Bruto","WHT","Neto","Pagado","Fecha pago","N° Fact."].map(h=>(
                            <th key={h} style={{padding:"6px 8px",textAlign:"left",fontSize:10,fontWeight:700,color:"#9d174d"}}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {temps.map(t=>{
                            const bruto = haTotal * valor;
                            const wht = bruto * (1-pct(r.pais));
                            const neto = bruto - wht;
                            const p = pagos[t] || {};
                            return (
                              <tr key={t} style={{borderBottom:"1px solid #fce7f3",background:p.pagado?"#f0fdf4":""}}>
                                <td style={{padding:"5px 8px",fontWeight:700,color:"#9d174d"}}>{t}</td>
                                <td style={{padding:"5px 8px"}}>{r.rcMesCobro||RC_MES_DEFAULT_POR_PAIS[r.pais]||"—"} {parseInt(t.split("/")[1])}</td>
                                <td style={{padding:"5px 8px",textAlign:"right"}}>{N(haTotal.toFixed(2))}</td>
                                <td style={{padding:"5px 8px",textAlign:"right"}}>${N(valor)}</td>
                                <td style={{padding:"5px 8px",textAlign:"right",fontWeight:700,color:"#9d174d"}}>${N(bruto.toFixed(2))}</td>
                                <td style={{padding:"5px 8px",textAlign:"right",color:"#dc2626"}}>{wht>0?`-$${N(wht.toFixed(2))}`:"—"}</td>
                                <td style={{padding:"5px 8px",textAlign:"right",fontWeight:700,color:"#15803d"}}>${N(neto.toFixed(2))}</td>
                                <td style={{padding:"5px 8px",textAlign:"center"}}>
                                  <input type="checkbox" disabled={!can} checked={!!p.pagado} onChange={e=>updPago(t,"pagado",e.target.checked)}/>
                                </td>
                                <td style={{padding:"5px 8px"}}>
                                  <input type="date" disabled={!can || !p.pagado} value={p.fechaPago||""} onChange={e=>updPago(t,"fechaPago",e.target.value)}
                                    style={{padding:"4px 6px",borderRadius:4,border:"1px solid #d1d5db",fontSize:11,opacity:p.pagado?1:0.5}}/>
                                </td>
                                <td style={{padding:"5px 8px"}}>
                                  <input disabled={!can} value={p.nFact||""} onChange={e=>updPago(t,"nFact",e.target.value)}
                                    style={{width:80,padding:"4px 6px",borderRadius:4,border:"1px solid #d1d5db",fontSize:11}}/>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}
            </div>
          </>)}
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
              <div>
                <div style={{fontSize:11,color:C.gris,fontWeight:600,marginBottom:4}}>Renovable</div>
                <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",
                  background:form.renovable?"#dbeafe":"#f1f5f9",border:`1px solid ${form.renovable?"#60a5fa":"#d1d5db"}`,
                  borderRadius:8,padding:"7px 12px",fontSize:12,fontWeight:600,color:form.renovable?"#1d4ed8":"#94a3b8"}}>
                  <input type="checkbox" checked={!!form.renovable} onChange={()=>setF("renovable",!form.renovable)} style={{accentColor:"#2563eb"}}/>
                  🔄 Contrato renovable
                </label>
              </div>
              {form.renovable&&<CampoNuevo label="📆 Nueva Fecha Vencimiento" campo="fechaTerminoNueva" tipo="date" form={form} setF={setF}/>}
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

          {/* Plantaciones + RC Setup en modo NUEVO */}
          <div style={{background:"#fff",borderRadius:12,padding:20,boxShadow:"0 1px 6px #0001"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
              <div style={{fontSize:13,fontWeight:700,color:"#15803d"}}>🌿 Plantaciones (variedades plantadas)</div>
              <button onClick={()=>{
                const variedadDefault = (variedadesMaestro||[])[0];
                const nuevaPlant = {
                  id:`plt_${Date.now()}`,
                  variedad_id: variedadDefault?.id || "",
                  especie:    variedadDefault?.especie || "",
                  variedad:   variedadDefault?.variedad || "",
                  nPlantas:0, hectareas:0, fechaPlantacion:"",
                  sublicenciatario_id:"", sublicenciatario_nombre:"", estado:"Confirmado",
                };
                setF("plantaciones",[...(form.plantaciones||[]), nuevaPlant]);
              }} style={{background:"#15803d",color:"#fff",border:"none",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Agregar plantación</button>
            </div>
            {(form.plantaciones||[]).length===0?(
              <div style={{padding:20,textAlign:"center",color:"#94a3b8",border:"1px dashed #e2e8f0",borderRadius:8,fontSize:12}}>
                Sin plantaciones. Agrega al menos una para que se calculen los royalties.
              </div>
            ):(
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead><tr style={{background:"#dcfce7"}}>
                    {["Especie","Variedad","Plantas","Há","Fecha plant.","Sublicenciatario","Vivero","Fee USD/planta",""].map(h=>(<th key={h} style={{padding:"6px 8px",textAlign:"left",fontSize:11,fontWeight:700,color:"#14532d"}}>{h}</th>))}
                  </tr></thead>
                  <tbody>
                    {(form.plantaciones||[]).map(p=>{
                      const updPl = (campo, valor)=>{
                        const next = (form.plantaciones||[]).map(x=>x.id===p.id?{...x,[campo]:valor}:x);
                        setF("plantaciones",next);
                      };
                      const updPlMulti = (cambios)=>{
                        const next = (form.plantaciones||[]).map(x=>x.id===p.id?{...x,...cambios}:x);
                        setF("plantaciones",next);
                      };
                      const seleccionarVar = (vid)=>{
                        if(!vid){ updPlMulti({variedad_id:""}); return; }
                        const vv = (variedadesMaestro||[]).find(x=>x.id===vid);
                        updPlMulti({variedad_id:vid, especie:vv?.especie||p.especie, variedad:vv?.variedad||p.variedad});
                      };
                      const seleccionarSub = (sid)=>{
                        const sub = (form.sublicenciatarios||[]).find(s=>s.id===sid);
                        updPlMulti({sublicenciatario_id:sid, sublicenciatario_nombre:sub?.razonSocial||""});
                      };
                      const seleccionarViv = (vivId)=>{
                        if(!vivId){ updPlMulti({vivero_id:"", vivero_nombre:"", vivero_fee_usd:0}); return; }
                        const viv = (viverosData||[]).find(v=>v.id===vivId);
                        updPlMulti({vivero_id:vivId, vivero_nombre:viv?.viverista||""});
                      };
                      const espMaestro = (especiesMaestro||[]).find(e=>e.nombre.toLowerCase().trim()===(p.especie||"").toLowerCase().trim());
                      const colorEsp = espMaestro?.color;
                      return (
                        <tr key={p.id} style={{borderBottom:"1px solid #f1f5f9"}}>
                          {/* Especie: dropdown puro + Crear nueva */}
                          <td style={{padding:"5px 8px",minWidth:130}}>
                            <div style={{display:"flex",gap:4,alignItems:"center"}}>
                              {colorEsp&&<div title={p.especie} style={{width:12,height:12,borderRadius:3,background:colorEsp,flexShrink:0,boxShadow:"0 1px 2px #0002"}}/>}
                              <select value={p.especie||""} onChange={e=>{
                                if(e.target.value==="__nueva__") {
                                  const nombre = window.prompt("Nombre de la nueva especie:");
                                  if(!nombre || !nombre.trim()) return;
                                  const nombreNorm = nombre.trim();
                                  const dupe = (especiesMaestro||[]).find(x=>x.nombre.toLowerCase().trim()===nombreNorm.toLowerCase());
                                  if(dupe) { updPlMulti({especie:dupe.nombre, variedad_id:""}); return; }
                                  const id = `esp_${Date.now()}`;
                                  const idxColor = (especiesMaestro||[]).length % COLORES_ESPECIES.length;
                                  const nueva = {id, nombre:nombreNorm, color:COLORES_ESPECIES[idxColor].hex, observaciones:""};
                                  setEspeciesMaestro&&setEspeciesMaestro(prev=>[...(prev||[]),nueva]);
                                  window.auditLog&&window.auditLog("crear",{modulo:"osiris",seccion:"Maestro Especies",
                                    descripcion:`Creó especie "${nombreNorm}" desde plantaciones (modo nuevo)`,registroId:id});
                                  updPlMulti({especie:nombreNorm, variedad_id:""});
                                } else {
                                  const variedadActualOK = (variedadesMaestro||[]).some(v=>v.id===p.variedad_id && v.especie===e.target.value);
                                  updPlMulti({especie:e.target.value, variedad_id: variedadActualOK ? p.variedad_id : "", variedad: variedadActualOK ? p.variedad : ""});
                                }
                              }} style={{flex:1,padding:"5px 7px",borderRadius:5,border:"1px solid #d1d5db",fontSize:11,background:"#fff"}}>
                                <option value="">— Seleccionar —</option>
                                {(especiesMaestro||[]).map(e=><option key={e.id} value={e.nombre}>{e.nombre}</option>)}
                                <option value="__nueva__">＋ Crear nueva especie...</option>
                              </select>
                            </div>
                          </td>
                          {/* Variedad: dropdown puro filtrado + Crear nueva */}
                          <td style={{padding:"5px 8px",minWidth:130}}>
                            {(()=>{
                              const variedadesFiltradas = p.especie
                                ? (variedadesMaestro||[]).filter(v=>v.especie===p.especie)
                                : [];
                              return (
                                <select disabled={!p.especie} value={p.variedad_id||""} onChange={e=>{
                                  if(e.target.value==="__nueva__") {
                                    if(!p.especie){alert("Selecciona primero la especie.");return;}
                                    const nombre = window.prompt(`Nombre de la nueva variedad (especie: ${p.especie}):`);
                                    if(!nombre || !nombre.trim()) return;
                                    const nombreNorm = nombre.trim();
                                    const dupe = (variedadesMaestro||[]).find(v=>v.especie===p.especie && v.variedad.toLowerCase().trim()===nombreNorm.toLowerCase());
                                    if(dupe){ seleccionarVar(dupe.id); return; }
                                    const id = `var_${Date.now()}`;
                                    const nueva = {id, especie:p.especie, variedad:nombreNorm, obtentor:"", observaciones:""};
                                    setVariedadesMaestro&&setVariedadesMaestro(prev=>[...(prev||[]),nueva]);
                                    window.auditLog&&window.auditLog("crear",{modulo:"osiris",seccion:"Maestro Variedades",
                                      descripcion:`Creó variedad "${p.especie} · ${nombreNorm}" desde plantaciones (modo nuevo)`,registroId:id});
                                    seleccionarVar(id);
                                  } else {
                                    seleccionarVar(e.target.value);
                                  }
                                }} style={{padding:"5px 7px",borderRadius:5,border:"1px solid #d1d5db",fontSize:11,background:p.especie?"#fff":"#f1f5f9",width:"100%"}}>
                                  <option value="">{p.especie?"— Seleccionar —":"(Selecciona especie primero)"}</option>
                                  {variedadesFiltradas.map(v=>(<option key={v.id} value={v.id}>{v.variedad}</option>))}
                                  {p.especie&&<option value="__nueva__">＋ Crear nueva variedad...</option>}
                                </select>
                              );
                            })()}
                          </td>
                          <td style={{padding:"5px 8px"}}>
                            <input type="number" value={p.nPlantas||0} onChange={e=>updPl("nPlantas",parseInt(e.target.value)||0)} style={{width:80,padding:"5px 7px",borderRadius:5,border:"1px solid #d1d5db",fontSize:11,textAlign:"right"}}/>
                          </td>
                          <td style={{padding:"5px 8px"}}>
                            <input type="number" step="0.01" value={p.hectareas||0} onChange={e=>updPl("hectareas",parseFloat(e.target.value)||0)} style={{width:70,padding:"5px 7px",borderRadius:5,border:"1px solid #d1d5db",fontSize:11,textAlign:"right"}}/>
                          </td>
                          <td style={{padding:"5px 8px"}}>
                            <input type="date" value={p.fechaPlantacion||""} onChange={e=>updPl("fechaPlantacion",e.target.value)} style={{padding:"5px 7px",borderRadius:5,border:"1px solid #d1d5db",fontSize:11}}/>
                          </td>
                          <td style={{padding:"5px 8px"}}>
                            <select value={p.sublicenciatario_id||""} onChange={e=>seleccionarSub(e.target.value)}
                              style={{padding:"5px 7px",borderRadius:5,border:"1px solid #d1d5db",fontSize:11,background:"#fff",maxWidth:140}}>
                              <option value="">— Sin sublicencia —</option>
                              {(form.sublicenciatarios||[]).map(s=><option key={s.id} value={s.id}>{s.razonSocial||"(sin nombre)"}</option>)}
                            </select>
                          </td>
                          {/* NUEVO: Vivero */}
                          <td style={{padding:"5px 8px"}}>
                            {(viverosData||[]).length>0?(
                              <select value={p.vivero_id||""} onChange={e=>seleccionarViv(e.target.value)}
                                style={{padding:"5px 7px",borderRadius:5,border:"1px solid #d1d5db",fontSize:11,background:"#fff",maxWidth:160}}>
                                <option value="">— Sin vivero —</option>
                                {(viverosData||[]).map(v=>(<option key={v.id} value={v.id}>{v.viverista||"Sin nombre"}</option>))}
                              </select>
                            ):(
                              <span style={{fontSize:10,color:"#94a3b8",fontStyle:"italic"}}>Sin contratos</span>
                            )}
                          </td>
                          {/* NUEVO: Fee USD/planta */}
                          <td style={{padding:"5px 8px"}}>
                            <input type="number" step="0.001" disabled={!p.vivero_id} value={p.vivero_fee_usd||0}
                              placeholder={p.vivero_id?"0.00":"—"}
                              onChange={e=>updPl("vivero_fee_usd",parseFloat(e.target.value)||0)}
                              style={{width:75,padding:"5px 7px",borderRadius:5,border:"1px solid #d1d5db",fontSize:11,textAlign:"right",background:p.vivero_id?"#fff":"#f1f5f9"}}/>
                          </td>
                          <td style={{padding:"5px 8px"}}>
                            <button onClick={()=>{
                              const next = (form.plantaciones||[]).filter(x=>x.id!==p.id);
                              setF("plantaciones",next);
                            }} style={{background:"#fef2f2",border:"none",borderRadius:5,padding:"3px 7px",cursor:"pointer",fontSize:10,color:"#991b1b"}}>×</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{marginTop:14,padding:12,background:"#fffbeb",borderRadius:8,fontSize:11,color:"#78350f"}}>
              ⚙️ <strong>Configuración Royalty Comercial:</strong> Se cobra 1 vez al año en el mes definido, por cada hectárea plantada.
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:10,marginTop:10}}>
              <div>
                <label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>Temporada inicio</label>
                <input value={form.rcInicioTemporada||""} placeholder={temporadaActual()} onChange={e=>setF("rcInicioTemporada",e.target.value)}
                  style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box"}}/>
                <div style={{fontSize:9,color:"#94a3b8",marginTop:2}}>Formato: AAAA/AAAA · Default: {temporadaActual()}</div>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>Mes de cobro</label>
                <select value={form.rcMesCobro||RC_MES_DEFAULT_POR_PAIS[form.pais]||"Abril"} onChange={e=>setF("rcMesCobro",e.target.value)}
                  style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box",background:"#fff"}}>
                  {MESES.map(m=><option key={m}>{m}</option>)}
                </select>
                <div style={{fontSize:9,color:"#94a3b8",marginTop:2}}>Default {form.pais}: {RC_MES_DEFAULT_POR_PAIS[form.pais]||"—"}</div>
              </div>
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
          {can&&<button onClick={()=>{setShowMantenedor(v=>!v);setShowClientes(false);setShowVariedades(false);setShowEspecies(false);}}
            style={{background:showMantenedor?"#1e293b":"#f1f5f9",color:showMantenedor?"#fff":"#1e293b",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:12,fontWeight:600}}>
            ⚙️ Tipos
          </button>}
          {can&&<button onClick={()=>{setShowClientes(v=>!v);setShowMantenedor(false);setShowVariedades(false);setShowEspecies(false);}}
            style={{background:showClientes?"#0f766e":"#f1f5f9",color:showClientes?"#fff":"#1e293b",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:12,fontWeight:600}}>
            👥 Clientes
          </button>}
          <span style={{fontSize:10,color:"#94a3b8",padding:"8px 10px"}}>🌳🌿 Maestro Especies/Variedades → en Contratos Obtentores</span>
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

      {/* Maestros Especies/Variedades → ahora en Contratos Obtentores */}

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

// ── Helper: días hasta vencimiento (puede ser negativo si está vencido) ──
function diasParaVencer(fechaStr) {
  if(!fechaStr) return null;
  const f = new Date(fechaStr);
  if(isNaN(f.getTime())) return null;
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  return Math.ceil((f - hoy) / (1000*60*60*24));
}

// ── Helper: estado de vigencia con color ──
function estadoVigencia(fechaStr) {
  const d = diasParaVencer(fechaStr);
  if(d === null)  return {label:"Sin fecha",   color:"#94a3b8", bg:"#f1f5f9", icon:"❔"};
  if(d < 0)       return {label:`Vencido hace ${Math.abs(d)} d.`, color:"#dc2626", bg:"#fee2e2", icon:"⚠️"};
  if(d <= 30)     return {label:`Vence en ${d} d.`, color:"#dc2626", bg:"#fee2e2", icon:"🔴"};
  if(d <= 90)     return {label:`Vence en ${d} d.`, color:"#d97706", bg:"#fef3c7", icon:"🟡"};
  return {label:`Vigente (${d} d.)`, color:"#16a34a", bg:"#dcfce7", icon:"🟢"};
}

// ── Export Excel: Contratos Obtentores ──
async function exportarObtentores(obtData) {
  const sectionContratos = {
    titulo: "Contratos Obtentores",
    headers: ["Obtentor","Estado Contrato","Fecha Inicio","Fecha Vencimiento","Renovable","Firma Obtentor","Firma Osiris","# Especies","# PBR","# Anexos","Días para vencer","Link Contrato","Link Doc. Legal","Observaciones"],
    rows: obtData.map(o=>{
      const d = diasParaVencer(o.f_vencimiento);
      return [
        o.obtentor||"",
        o.estado_contrato||"Borrador",
        o.f_inicio||"",
        o.f_vencimiento||"",
        o.renovable?"Sí":"No",
        o.firma_obtentor?"Firmado":"Pendiente",
        o.firma_osiris?"Firmado":"Pendiente",
        (o.especies||[]).length,
        (o.pbr||[]).length,
        (o.anexos||[]).length,
        d!==null?d:"—",
        o.doc_contrato||"",
        o.doc_legal||"",
        o.observaciones||"",
      ];
    }),
  };
  const especiesRows = [];
  obtData.forEach(o=>(o.especies||[]).forEach(e=>{
    especiesRows.push([
      o.obtentor||"", e.especie||"", e.variedad||"",
      e.dhe_estado||"No iniciado", e.dhe_fecha_aprob||"", e.dhe_doc||"", e.dhe_observaciones||"",
      e.observaciones||""
    ]);
  }));
  const sectionEspecies = {
    titulo: "Especies, Variedades y DHE",
    headers: ["Obtentor","Especie","Variedad","Estado DHE","Fecha aprob. DHE","Doc. DHE","Obs. DHE","Obs. Variedad"],
    rows: especiesRows,
  };
  const pbrRows = [];
  obtData.forEach(o=>(o.pbr||[]).forEach(p=>{
    pbrRows.push([
      o.obtentor||"", p.especie||"", p.pais||"", p.estado||"",
      p.f_solicitud||"", p.f_resolucion||"",
      p.doc_solicitud||"", p.doc_resolucion||"",
      p.observaciones||""
    ]);
  }));
  const sectionPBR = {
    titulo: "Registros PBR",
    headers: ["Obtentor","Especie","País","Estado","Fecha Solicitud","Fecha Resolución","Doc. Solicitud","Doc. Resolución","Observaciones"],
    rows: pbrRows,
  };
  const anexosRows = [];
  obtData.forEach(o=>(o.anexos||[]).forEach(a=>{
    anexosRows.push([o.obtentor||"", a.descripcion||"", a.fecha||"", a.enlace||"", a.observaciones||""]);
  }));
  const sectionAnexos = {
    titulo: "Anexos",
    headers: ["Obtentor","Descripción","Fecha","Enlace","Observaciones"],
    rows: anexosRows,
  };
  await exportCSV([sectionContratos, sectionEspecies, sectionPBR, sectionAnexos], null, "Contratos_Obtentores", {
    tituloDoc: "Contratos Obtentores",
    filtros: `${obtData.length} contratos · ${especiesRows.length} variedades/DHE · ${pbrRows.length} PBR · ${anexosRows.length} anexos`,
  });
  window.auditLog && window.auditLog("exportar", {modulo:"osiris", seccion:"Contratos Obtentores",
    descripcion:`Exportó ${obtData.length} contratos obtentores a Excel`});
}

// ── Export Excel: Contratos Viveros ──
async function exportarViveros(vivData) {
  const sectionViveros = {
    titulo: "Contratos Viveros",
    headers: ["Viverista","País","Estado Contrato","Fecha Contrato","Fecha Vencimiento","Forma de Pago","Mes Estim. Pago","Firma Viverista","Firma Osiris","# Variedades","# OC","Días para vencer","Link Contrato","Observaciones"],
    rows: vivData.map(v=>{
      const d = diasParaVencer(v.f_vencimiento);
      return [
        v.viverista||"",
        v.pais||"",
        v.estado_contrato||"Borrador",
        v.f_contrato||"",
        v.f_vencimiento||"",
        v.forma_pago||"",
        v.mes_pago_estimado||"",
        v.firma_viverista?"Firmado":"Pendiente",
        v.firma_osiris?"Firmado":"Pendiente",
        (v.variedades||[]).length,
        (v.ordenesCompra||[]).length,
        d!==null?d:"—",
        v.doc_contrato||"",
        v.observaciones||"",
      ];
    }),
  };
  const varRows = [];
  vivData.forEach(v=>(v.variedades||[]).forEach(x=>{
    varRows.push([v.viverista||"", v.pais||"", x.especie||"", x.variedad||"", x.fee_usd||0, x.fee_pct||0, x.observaciones||""]);
  }));
  const sectionVariedades = {
    titulo: "Variedades Autorizadas",
    headers: ["Viverista","País","Especie","Variedad","Fee USD/planta","Fee % s/venta","Observaciones"],
    rows: varRows,
  };
  // Sección OC
  const ocRows = [];
  vivData.forEach(v=>(v.ordenesCompra||[]).forEach(o=>{
    const totC = (o.cuotas||[]).reduce((s,c)=>s+(parseFloat(c.monto_usd)||0),0);
    const totPag = (o.cuotas||[]).filter(c=>c.pagado).reduce((s,c)=>s+(parseFloat(c.monto_usd)||0),0);
    ocRows.push([
      v.viverista||"",
      o.n_oc||"", o.fecha_oc||"",
      o.cliente_nombre||"",
      o.especie||"", o.variedad||"",
      parseFloat(o.cantidad_plantas)||0,
      parseFloat(o.hectareas)||0,
      parseFloat(o.fee_usd_planta)||0,
      parseFloat(o.fee_total_usd)||0,
      o.estado_oc||"",
      (o.cuotas||[]).length,
      totPag,
      totC-totPag,
      o.observaciones||"",
    ]);
  }));
  const sectionOC = {
    titulo: "Órdenes de Compra de Clientes",
    headers: ["Viverista","N° OC","Fecha OC","Cliente","Especie","Variedad","Plantas","Há","Fee USD/planta","Fee Total USD","Estado","# Cuotas","Cobrado USD","Por cobrar USD","Observaciones"],
    rows: ocRows,
  };
  // Sección Cuotas
  const cuotasRows = [];
  vivData.forEach(v=>(v.ordenesCompra||[]).forEach(o=>(o.cuotas||[]).forEach(cu=>{
    cuotasRows.push([
      v.viverista||"",
      o.n_oc||"",
      o.cliente_nombre||"",
      cu.fecha||"",
      parseFloat(cu.monto_usd)||0,
      cu.pagado?"Pagado":"Por cobrar",
      cu.fecha_pago||"",
      cu.n_factura||"",
      cu.observaciones||"",
    ]);
  })));
  const sectionCuotas = {
    titulo: "Cuotas / Fechas de Pago",
    headers: ["Viverista","N° OC","Cliente","Fecha Estimada","Monto USD","Estado","Fecha Pago","N° Factura","Observaciones"],
    rows: cuotasRows,
  };
  await exportCSV([sectionViveros, sectionVariedades, sectionOC, sectionCuotas], null, "Contratos_Viveros", {
    tituloDoc: "Contratos Viveros",
    filtros: `${vivData.length} viveros · ${varRows.length} variedades · ${ocRows.length} OC · ${cuotasRows.length} cuotas`,
  });
  window.auditLog && window.auditLog("exportar", {modulo:"osiris", seccion:"Contratos Viveros",
    descripcion:`Exportó ${vivData.length} contratos viveros, ${ocRows.length} OC y ${cuotasRows.length} cuotas a Excel`});
}

// ══════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL — Hub Osiris mejorado
// ══════════════════════════════════════════════════════════
export default function OsirisModule({usuarioActual,esAdmin,esSoloConsulta,tabPermisos={},osirisData,setOsirisData,onBack,onLogout}) {
  // subApp: null = hub Osiris | "ingresos" | "contratos"
  const [subApp,setSubApp]=useState(null);
  const [subTab,setSubTab]=useState("resumen");

  // Hooks para Contratos Obtentores
  const [obtModal, setObtModal] = useState(false);
  const [obtEditId, setObtEditId] = useState(null);
  const [obtDetalle, setObtDetalle] = useState(null);
  const [showEspeciesObt, setShowEspeciesObt] = useState(false);
  const [showVariedadesObt, setShowVariedadesObt] = useState(false);
  const [obtTab, setObtTab] = useState("general");
  const EMPTY_OBT = {obtentor:"",pais:"",contacto:"",emailContacto:"",telefonoContacto:"",representanteLegal:"",
    f_inicio:"",f_vencimiento:"",renovable:false,f_vencimiento_nueva:"",
    territorios:"",exclusividad:"No",tipoExclusividad:"",obligaciones:"",
    royaltiesObtentor:[],
    minimoGarantizado:0,monedaMinimo:"USD",frecuenciaReportes:"",proximoReporte:"",derechoAuditoria:false,calendarioPagos:"",
    observaciones:"",firma_obtentor:false,firma_osiris:false,doc_legal:"",doc_contrato:"",estado_contrato:"Borrador",
    especies:[],anexos:[],pbr:[]};
  const [obtForm, setObtForm] = useState(EMPTY_OBT);
  // Wizard: paso actual (1=cabecera, 2=especies/DHE, 3=PBR)
  const [obtWizStep, setObtWizStep] = useState(1);
  // Forms inline del wizard (paso 2 y 3) — para agregar especies/PBR sin abrir submodales
  const EMPTY_ESP_INLINE = {especie:"",variedad:"",codigoVariedad:"",nombreComercial:"",vigenciaDesde:"",vigenciaHasta:"",observaciones:"",dhe_estado:"No iniciado",dhe_fecha_solicitud:"",dhe_fecha_aprob:"",dhe_nRegistro:"",dhe_doc:"",dhe_observaciones:""};
  const EMPTY_PBR_INLINE = {especie:"",variedad:"",pais:"",estado:"Pendiente",nRegistro:"",f_solicitud:"",f_resolucion:"",f_vencimiento:"",doc_solicitud:"",doc_resolucion:"",observaciones:""};
  const [obtWizEspForm, setObtWizEspForm] = useState(EMPTY_ESP_INLINE);
  const [obtWizPbrForm, setObtWizPbrForm] = useState(EMPTY_PBR_INLINE);
  // Sub-modales Obtentores
  const [espModal, setEspModal] = useState(false);
  const [espForm, setEspForm] = useState({especie:"",variedad:"",observaciones:"",dhe_estado:"No iniciado",dhe_fecha_aprob:"",dhe_doc:"",dhe_observaciones:""});
  const [pbrModal, setPbrModal] = useState(false);
  const [pbrForm, setPbrForm] = useState({especie:"",pais:"",estado:"Pendiente",f_solicitud:"",f_resolucion:"",doc_solicitud:"",doc_resolucion:"",observaciones:""});
  const [anxModal, setAnxModal] = useState(false);
  const [anxForm, setAnxForm] = useState({descripcion:"",fecha:"",enlace:"",observaciones:""});

  // Hooks para Contratos Viveros (estructura jerárquica)
  const [vivModal, setVivModal] = useState(false);
  const EMPTY_VIV = {viverista:"",pais:"",f_contrato:"",f_vencimiento:"",renovable:false,f_vencimiento_nueva:"",
    firma_viverista:false,firma_osiris:false,doc_legal:"",doc_contrato:"",observaciones:"",
    mes_pago_estimado:"",forma_pago:"",estado_contrato:"Borrador",
    variedades:[],anexos:[],ordenesCompra:[]};
  const [vivForm, setVivForm] = useState(EMPTY_VIV);
  const [vivEditId, setVivEditId] = useState(null);
  const [vivDetalle, setVivDetalle] = useState(null);
  const [vivTab, setVivTab] = useState("general");
  // Wizard Viveros: paso 1=cabecera, 2=variedades, 3=anexos, 4=OC, 5=cuotas
  const [vivWizStep, setVivWizStep] = useState(1);
  const EMPTY_VV_INLINE = {especie:"",variedad:"",fee_usd:"",fee_pct:"",observaciones:""};
  const EMPTY_VANX_INLINE = {descripcion:"",fecha:"",enlace:"",observaciones:""};
  const EMPTY_OC_INLINE = {n_oc:"",fecha_oc:"",cliente_id:"",cliente_nombre:"",
    variedad_id:"",especie:"",variedad:"",
    cantidad_plantas:"",hectareas:"",
    fee_usd_planta:"",fee_total_usd:0,
    estado_oc:"Borrador",observaciones:""};
  const EMPTY_CUOTA_INLINE = {fecha:"",monto_usd:"",pagado:false,fecha_pago:"",n_factura:"",observaciones:""};
  const [vivWizVvForm, setVivWizVvForm] = useState(EMPTY_VV_INLINE);
  const [vivWizAnxForm, setVivWizAnxForm] = useState(EMPTY_VANX_INLINE);
  const [vivWizOcForm, setVivWizOcForm] = useState(EMPTY_OC_INLINE);
  const [vivWizCuotaForm, setVivWizCuotaForm] = useState(EMPTY_CUOTA_INLINE);
  const [vivWizOcExpandido, setVivWizOcExpandido] = useState(null); // id de OC en paso 5 cuya sección de cuotas está abierta
  // Sub-modales Viveros
  const [vvModal, setVvModal] = useState(false);
  const [vvForm, setVvForm] = useState({especie:"",variedad:"",fee_usd:"",fee_pct:"",observaciones:""});
  const [vAnxModal, setVAnxModal] = useState(false);
  const [vAnxForm, setVAnxForm] = useState({descripcion:"",fecha:"",enlace:"",observaciones:""});
  // Modales para Órdenes de Compra dentro del vivero
  const [ocModal, setOcModal] = useState(false);
  const [ocEditId, setOcEditId] = useState(null);
  const EMPTY_OC = {n_oc:"",fecha_oc:"",cliente_id:"",cliente_nombre:"",
    variedad_id:"",especie:"",variedad:"",
    cantidad_plantas:"",hectareas:"",
    fee_usd_planta:"",fee_total_usd:0,
    estado_oc:"Borrador",observaciones:"",
    cuotas:[]};
  const [ocForm, setOcForm] = useState(EMPTY_OC);
  const [ocDetalle, setOcDetalle] = useState(null); // ID de OC para ver/editar cuotas
  const [cuotaModal, setCuotaModal] = useState(false);
  const [cuotaForm, setCuotaForm] = useState({fecha:"",monto_usd:"",pagado:false,fecha_pago:"",n_factura:"",observaciones:""});
  const [cuotaEditId, setCuotaEditId] = useState(null);

  // Datos desde Supabase — sin datos de ejemplo (empezar desde cero)
  const ctData  = osirisData?.contratos       ?? CONTRATOS_INIT;
  const clientes= osirisData?.clientes        ?? CLIENTES_INIT;
  const viveristas = osirisData?.viveristas   ?? VIVERISTAS_INIT;
  const variedadesMaestro = Array.isArray(osirisData?.variedades) ? osirisData.variedades : VARIEDADES_INIT;
  const especiesMaestro   = Array.isArray(osirisData?.especies)   ? osirisData.especies   : ESPECIES_INIT;
  const obtentoresData    = Array.isArray(osirisData?.obtentores) ? osirisData.obtentores : [];
  // ── Datos derivados desde el contrato (fuente de verdad) ──
  // tpData: Total Pedidos, ahora derivado de plantaciones del contrato.
  //   Se preservan los pedidos manuales antiguos para no romper la transición.
  const tpData = useMemo(()=>{
    const fromContracts = derivarTotalPedidosDesdeContratos(ctData);
    const manuales = (osirisData?.totalPedidos||[]).filter(r=>!r._fromContract && !r.ctId);
    return [...fromContracts, ...manuales];
  },[osirisData, ctData]);

  const tpIds   = useMemo(()=>new Set(tpData.map(r=>r.id)),[tpData]);

  // rpData: Royalty Planta, derivado de cuotas del contrato + overrides manuales
  const rpData = useMemo(()=>{
    const fromContracts = derivarRoyaltyPlantaDesdeContratos(ctData);
    const raw = osirisData?.royaltyPlanta || [];
    // Aplicar overrides: si hay un registro manual con mismo id (rp_ctId_cuotaId), prevalece
    const overridesMap = {};
    raw.forEach(r=>{ if(r.id) overridesMap[r.id]=r; });
    const merged = fromContracts.map(rec=>{
      const ov = overridesMap[rec.id];
      if(!ov) return rec;
      // Solo aplicamos campos que el usuario pudo editar (estado de pago, factura, fecha de pago, observaciones, montos override)
      return {...rec, ...ov, _fromContract: true, _hasOverride: true};
    });
    // Manuales legacy (sin ctId) se preservan
    const manualesLegacy = raw.filter(r=>!r.ctId && !r._fromContract);
    return [...merged, ...manualesLegacy];
  },[osirisData, ctData]);

  // rcData: Royalty Comercial derivado de plantaciones × temporadas
  const rcData = useMemo(()=>{
    const fromContracts = derivarRoyaltyComercialDesdeContratos(ctData);
    const raw = osirisData?.royaltyComercial || [];
    const overridesMap = {};
    raw.forEach(r=>{ if(r.id) overridesMap[r.id]=r; });
    const merged = fromContracts.map(rec=>{
      const ov = overridesMap[rec.id];
      if(!ov) return rec;
      return {...rec, ...ov, _fromContract: true, _hasOverride: true};
    });
    const manualesLegacy = raw.filter(r=>!r.ctId && !r._fromContract);
    return [...merged, ...manualesLegacy];
  },[osirisData, ctData]);

  const fvData  = useMemo(()=>(osirisData?.feeViveros??[]).filter(r=>!r.tpId||tpIds.has(r.tpId)),[osirisData,tpIds]);

  // feData: Contract Fee derivado del contrato (formato actual mantenido)
  const feData = useMemo(()=>{
    const raw = osirisData?.feeEntrada || [];
    const edits = {};
    raw.forEach(r=>{ 
      if(r.ctId) edits[r.ctId] = r;
      edits[r.id] = r; 
    });
    const fromContracts = ctData
      .filter(ct=> ct.tipoContractFee && ct.tipoContractFee!=="Sin Contract Fee")
      .map(ct=>{
        const saved = edits[ct.id] || edits[`fe_${ct.id}`] || {};
        return {
          id:       saved.id       || `fe_${ct.id}`,
          ctId:     ct.id,
          cliente:  saved.cliente  || ct.razonSocial,
          pais:     saved.pais     || ct.pais,
          montoUSD: saved.montoUSD != null ? saved.montoUSD : (ct.montoContractFee || 30000),
          detalle:  saved.detalle  || ct.tipoContractFee  || "",
          nFact:    saved.nFact    ?? "",
          pagado:   saved.pagado   ?? false,
          fechaPago:saved.fechaPago?? "",
          _fromContract: true,
        };
      });
    const manuales = raw.filter(r=> !r.ctId && !r._fromContract);
    return [...fromContracts, ...manuales];
  },[osirisData, ctData]);

  const setClientes=useCallback(fn=>setOsirisData(prev=>({...prev,clientes:       typeof fn==="function"?fn(prev?.clientes       ??CLIENTES_INIT):fn})),[setOsirisData]);
  const setViveristas=useCallback(fn=>setOsirisData(prev=>({...prev,viveristas:    typeof fn==="function"?fn(prev?.viveristas    ??VIVERISTAS_INIT):fn})),[setOsirisData]);
  const setVivGlobal=useCallback(fn=>setOsirisData(prev=>({...prev,viveros:       typeof fn==="function"?fn(prev?.viveros       ??[]):fn})),[setOsirisData]);
  const setOpTecnica=useCallback(fn=>setOsirisData(prev=>({...prev,opTecnica:    typeof fn==="function"?fn(prev?.opTecnica    ??{}):fn})),[setOsirisData]);
  const setVariedadesMaestro=useCallback(fn=>setOsirisData(prev=>({...prev,variedades:    typeof fn==="function"?fn(prev?.variedades    ??VARIEDADES_INIT):fn})),[setOsirisData]);
  const setEspeciesMaestro=useCallback(fn=>setOsirisData(prev=>({...prev,especies:    typeof fn==="function"?fn(prev?.especies    ??ESPECIES_INIT):fn})),[setOsirisData]);
  const setCt=useCallback(fn=>setOsirisData(prev=>({...prev,contratos:      typeof fn==="function"?fn(prev?.contratos      ??CONTRATOS_INIT):fn})),[setOsirisData]);
  const setTp=useCallback(fn=>setOsirisData(prev=>({...prev,totalPedidos:   typeof fn==="function"?fn(prev?.totalPedidos   ??[]):fn})),[setOsirisData]);
  const setRp=useCallback(fn=>setOsirisData(prev=>({...prev,royaltyPlanta:  typeof fn==="function"?fn(prev?.royaltyPlanta  ??[]):fn})),[setOsirisData]);
  const setFe=useCallback(fn=>setOsirisData(prev=>({...prev,feeEntrada:     typeof fn==="function"?fn(prev?.feeEntrada     ??[]):fn})),[setOsirisData]);
  const setRc=useCallback(fn=>setOsirisData(prev=>({...prev,royaltyComercial:typeof fn==="function"?fn(prev?.royaltyComercial??[]):fn})),[setOsirisData]);
  const setFv=useCallback(fn=>setOsirisData(prev=>({...prev,feeViveros:     typeof fn==="function"?fn(prev?.feeViveros     ??[]):fn})),[setOsirisData]);

  // ── Migración automática del Maestro de Especies ──
  // Se ejecuta una vez al cargar: detecta especies escritas a mano en contratos obtentores
  // y plantaciones de contratos prod-exp, y las crea en el maestro si no existen.
  // Solo corre si el maestro está vacío Y hay datos para migrar (evita sobrescribir).
  useEffect(()=>{
    // Solo migrar si el maestro está vacío y hay datos potenciales
    if((especiesMaestro||[]).length>0) return;
    const detectadas = new Set();
    // Desde contratos obtentores
    (obtentoresData||[]).forEach(o=>(o.especies||[]).forEach(e=>{
      if(e.especie && e.especie.trim()) detectadas.add(e.especie.trim());
    }));
    // Desde plantaciones de contratos prod-exp
    (ctData||[]).forEach(c=>(c.plantaciones||[]).forEach(p=>{
      if(p.especie && p.especie.trim()) detectadas.add(p.especie.trim());
    }));
    // Desde maestro de variedades (si ya tienen especies)
    (variedadesMaestro||[]).forEach(v=>{
      if(v.especie && v.especie.trim()) detectadas.add(v.especie.trim());
    });
    if(detectadas.size===0) return;
    const nuevas = Array.from(detectadas).map((nombre, i)=>({
      id:`esp_mig_${Date.now()}_${i}`,
      nombre,
      color: COLORES_ESPECIES[i % COLORES_ESPECIES.length].hex,
    }));
    setEspeciesMaestro(nuevas);
    window.auditLog && window.auditLog("crear", {modulo:"osiris", seccion:"Maestro Especies",
      descripcion:`Migración automática: importó ${nuevas.length} especies (${nuevas.map(e=>e.nombre).join(", ")})`});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);  // Solo al montar el componente

  // PERMISOS OSIRIS
  // Edición requiere: (a) rol editor/admin Y (b) permiso "editar" en la pestaña activa
  // Si la pestaña tiene permiso "ver", no puede editar aunque sea editor
  const rolActual = usuarioActual?.rol || "editor";
  const esEditorOAdmin = rolActual === "editor" || rolActual === "admin";
  const esConsulta = rolActual === "consulta";
  // Admin tiene acceso total; editor/consulta dependen de tabPermisos
  const permContratos   = tabPermisos?.contratos || "editar";
  const permRoyalties   = tabPermisos?.royalties || "editar";
  const permObtentores  = tabPermisos?.obtentores || tabPermisos?.contratos || "editar"; // hereda de contratos si no está definido
  const permViveros     = tabPermisos?.viveros    || tabPermisos?.contratos || "editar"; // hereda de contratos si no está definido
  const canVerContratos  = permContratos  !== "sin_acceso";
  const canVerRoyalties  = permRoyalties  !== "sin_acceso";
  const canVerObtentores = permObtentores !== "sin_acceso";
  const canVerViveros    = permViveros    !== "sin_acceso";
  // Solo puede editar si: no es consulta AND rol editor/admin AND permiso = "editar"
  const canContratos = !esConsulta && esEditorOAdmin &&
    (rolActual === "admin" || permContratos === "editar");
  const canIngresos  = !esConsulta && esEditorOAdmin &&
    (rolActual === "admin" || permRoyalties === "editar");
  const canObtentores = !esConsulta && esEditorOAdmin &&
    (rolActual === "admin" || permObtentores === "editar");
  const canViveros    = !esConsulta && esEditorOAdmin &&
    (rolActual === "admin" || permViveros === "editar");
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
    {id:"dashboard",        label:"📊 Dashboard",        badge:0},
    {id:"graficos",         label:"🌿 Plantas",          badge:0},
    {id:"totalPedidos",     label:"📦 Total Pedidos",     badge:sinConfirmar},
    {id:"royaltyPlanta",    label:"🌱 Royalty/Planta",    badge:0},
    {id:"feeEntrada",       label:"📄 Fee Entrada",       badge:0},
    {id:"royaltyComercial", label:"📈 Royalty Comercial", badge:alertasRC},
    {id:"feeViveros",       label:"🏭 Fee Viveros",       badge:0},
    {id:"reconciliacionIQ", label:"🧾 Reconciliación IQ", badge:0},
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
        <div style={{display:"flex",alignItems:"center",gap:8,fontSize:13}}>
          {breadcrumbItems.map((item,i)=>(
            <React.Fragment key={i}>
              {i>0&&<span style={{color:"rgba(255,255,255,0.3)"}}>›</span>}
              {item.onClick
                ? <button onClick={item.onClick} style={{background:"none",border:"none",color:"rgba(255,255,255,0.55)",cursor:"pointer",fontSize:13,fontWeight:500,padding:0}}>{item.label}</button>
                : <span style={{color:"#fff",fontWeight:700,fontSize:14}}>{item.label}</span>}
            </React.Fragment>
          ))}
        </div>
        <div style={{borderLeft:"1px solid rgba(255,255,255,0.2)",paddingLeft:14}}>
          <OsirisLogo height={36}/>
        </div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        {showPorCobrar&&(
          <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",textAlign:"right",marginRight:4}}>
            <div style={{fontSize:9,textTransform:"uppercase",letterSpacing:1,marginBottom:1}}>Por cobrar</div>
            <div style={{fontSize:14,fontWeight:800,color:"#fbbf24"}}>{$$(totPend)}</div>
          </div>
        )}
        {subApp!==null&&(
          <button onClick={()=>setSubApp(null)}
            style={{background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.25)",
              color:"#fff",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:600}}>
            🏠 Osiris Hub
          </button>
        )}
        <button onClick={onBack}
          style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",
            color:"rgba(255,255,255,0.7)",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:600}}>
          ← Mediterra
        </button>
        <button onClick={onLogout||onBack}
          style={{background:"rgba(248,113,113,0.18)",border:"1px solid rgba(248,113,113,0.3)",
            color:"#fca5a5",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12}}>
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

      {/* Logo + título centrado */}
      <div style={{textAlign:"center",marginBottom:30}}>
        <div style={{display:"flex",justifyContent:"center",marginBottom:12}}>
          <OsirisLogo height={60}/>
        </div>
        <div style={{color:"#8b949e",fontSize:13}}>Genética Diferenciada</div>
      </div>

      {/* Hub cards — drag-and-drop */}
      {(()=>{
        const CARD_DEFS = {
          ingresos: {emoji:"💰",label:"Ingresos Osiris",desc:"Royalties, Fee Viveros, Total Pedidos y Resumen de cobros",grad:"#0f766e22",border:"#0f766e44",
            onClick:()=>setSubApp("ingresos"),badges:()=><>{sinConfirmar>0&&<span style={{fontSize:10,background:"rgba(251,191,36,0.2)",color:"#fbbf24",padding:"3px 10px",borderRadius:20,fontWeight:700}}>{sinConfirmar} por confirmar</span>}{alertasRC>0&&<span style={{fontSize:10,background:"rgba(239,68,68,0.2)",color:"#f87171",padding:"3px 10px",borderRadius:20,fontWeight:700}}>⚠️ {alertasRC} alerta{alertasRC>1?"s":""}</span>}</>},
          contratos: {emoji:"📜",label:"Contratos Productores",desc:"Gestión de contratos con productores-exportadores",grad:"#2563eb22",border:"#2563eb44",
            onClick:()=>setSubApp("contratos"),badges:()=><span style={{fontSize:10,background:"rgba(37,99,235,0.2)",color:"#93c5fd",padding:"3px 10px",borderRadius:20,fontWeight:700}}>{(ctData||[]).length} contratos</span>},
          obtentores: {emoji:"🧬",label:"Contratos Obtentores",desc:"Obtentores, variedades, DHE, PBR, Maestro Especies",grad:"#7c3aed22",border:"#7c3aed44",
            onClick:()=>{if(canVerObtentores)setSubApp("obtentores");},badges:()=>{
              const arr=Array.isArray(osirisData?.obtentores)?osirisData.obtentores:[];
              return <span style={{fontSize:10,background:"rgba(124,58,237,0.2)",color:"#c4b5fd",padding:"3px 10px",borderRadius:20,fontWeight:700}}>{arr.length} contratos</span>;}},
          viveros: {emoji:"🌱",label:"Contratos Viveros",desc:"Viveros, variedades autorizadas, OC Clientes, Cuotas",grad:"#16a34a22",border:"#16a34a44",
            onClick:()=>{if(canVerViveros)setSubApp("viveros");},badges:()=>{
              const arr=Array.isArray(osirisData?.viveros)?osirisData.viveros:[];
              return <span style={{fontSize:10,background:"rgba(22,163,74,0.2)",color:"#4ade80",padding:"3px 10px",borderRadius:20,fontWeight:700}}>{arr.length} viveros</span>;}},
          opTecnica: {emoji:"🔬",label:"Operación Técnica",desc:"Visitas, informes, equipo técnico, entregables",grad:"#0ea5e922",border:"#0ea5e944",
            onClick:()=>setSubApp("opTecnica"),badges:()=>null},
          tareas: {emoji:"✅",label:"Seguimiento Tareas",desc:"Tareas operativas del equipo Osiris",grad:"#d9770622",border:"#d9770644",
            onClick:()=>setSubApp("tareas"),badges:()=>null},
        };
        const HUB_DEFAULT=["ingresos","contratos","obtentores","viveros","opTecnica","tareas"];
        const order=(Array.isArray(osirisData?.hubCardsOrder)&&osirisData.hubCardsOrder.length===HUB_DEFAULT.length)?osirisData.hubCardsOrder:HUB_DEFAULT;
        const handleDragStart=(e,id)=>{window._dragCard=id;window._didDrag=true;e.dataTransfer.effectAllowed="move";};
        const handleDrop=(e,targetId)=>{
          e.preventDefault();e.stopPropagation();const from=window._dragCard;if(!from||from===targetId){window._dragCard=null;return;}
          const nw=[...order];const fi=nw.indexOf(from),ti=nw.indexOf(targetId);
          if(fi===-1||ti===-1)return;nw.splice(fi,1);nw.splice(ti,0,from);
          setOsirisData(prev=>({...(prev||{}),hubCardsOrder:nw}));window._dragCard=null;
        };
        const handleCardClick=(fn)=>{
          if(window._didDrag){window._didDrag=false;return;}
          fn();
        };
        return(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16,maxWidth:700,margin:"0 auto 30px"}}>
            {order.map(cid=>{const d=CARD_DEFS[cid];if(!d)return null;return(
              <div key={cid} draggable={!!esAdmin} onDragStart={e=>{if(!esAdmin)return;handleDragStart(e,cid);}} onDragOver={e=>{if(!esAdmin)return;e.preventDefault();e.dataTransfer.dropEffect="move";}} onDrop={e=>{if(!esAdmin)return;handleDrop(e,cid);}} onDragEnd={()=>{setTimeout(()=>{window._didDrag=false;},100);window._dragCard=null;}} onClick={()=>handleCardClick(d.onClick)}
                style={{background:`linear-gradient(135deg,#1c2333,${d.grad})`,borderRadius:16,padding:"24px 20px",border:`1px solid ${d.border}`,cursor:"pointer",transition:"all 0.2s",position:"relative",overflow:"hidden"}}
                onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"} onMouseLeave={e=>e.currentTarget.style.transform="translateY(0)"}>
                {esAdmin&&<div style={{position:"absolute",top:8,right:10,fontSize:10,color:"#475569",cursor:"grab"}} title="Arrastra para reordenar">⋮⋮</div>}
                <div style={{fontSize:32,marginBottom:10}}>{d.emoji}</div>
                <div style={{fontWeight:800,fontSize:16,color:"#e6edf3",marginBottom:4}}>{d.label}</div>
                <div style={{fontSize:11,color:"#8b949e",marginBottom:12}}>{d.desc}</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{d.badges()}</div>
                <div style={{position:"absolute",right:16,bottom:16,fontSize:20,color:d.border}}>→</div>
              </div>);
            })}
          </div>);
      })()}

      {/* KPIs globales */}
      <div style={{display:"flex",gap:12,flexWrap:"wrap",maxWidth:700,margin:"0 auto"}}>
        {[
          ["💵 Por cobrar",     $$(totPend),          "#fbbf24"],
          ["📦 Pedidos",        tpData.length,         "#60a5fa"],
          ["🌿 Royalty filas",  rpData.length,         "#34d399"],
          ["🌱 Fee Vivero",     fvData.filter(r=>!r.pagado).length+" pend.", "#f87171"],
        ].map(([l,v,c])=>(
          <div key={l} style={{background:"#21283b",border:"1px solid #30363d",borderLeft:`4px solid ${c}`,
            borderRadius:10,padding:"12px 16px",flex:1,minWidth:140}}>
            <div style={{fontSize:10,color:"#8b949e",fontWeight:600,marginBottom:4}}>{l}</div>
            <div style={{fontSize:20,fontWeight:900,color:c}}>{v}</div>
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
        {label:"Contratos Prod-Exp"},
      ]}/>
      {canVerContratos&&!canContratos&&(
        <div style={{background:"linear-gradient(135deg,#fef3c7,#fde68a)",border:"1px solid #f59e0b",
          borderRadius:10,padding:"10px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:20}}>👁</span>
          <div style={{flex:1}}>
            <div style={{fontSize:12,fontWeight:800,color:"#92400e"}}>Modo solo lectura</div>
            <div style={{fontSize:11,color:"#78350f"}}>
              {esConsulta
                ? "Tu rol es de Consulta. Puedes visualizar y exportar los datos a Excel, pero no modificar contratos."
                : "Tienes permiso de \"Solo ver\" en Contratos. Puedes visualizar y exportar los datos a Excel, pero no modificarlos. Contacta al administrador si necesitas editar."}
            </div>
          </div>
        </div>
      )}
      <div style={{background:"#fff",borderRadius:14,padding:20,boxShadow:"0 2px 10px #0001"}}>
        {canVerContratos
        ? <ControlContratos data={ctData} setData={setCt} clientes={clientes} setClientes={setClientes} variedadesMaestro={variedadesMaestro} setVariedadesMaestro={setVariedadesMaestro} especiesMaestro={especiesMaestro} setEspeciesMaestro={setEspeciesMaestro} obtentoresData={obtentoresData} viverosData={Array.isArray(osirisData?.viveros)?osirisData.viveros:[]} setViveros={setVivGlobal} can={canContratos}/>
        : <div style={{textAlign:"center",padding:40,color:"#94a3b8"}}>Sin acceso a Contratos</div>
      }
      </div>
    </div>
  );

  // ── CONTRATOS OBTENTORES ──────────────────────────────────
  if(subApp==="obtentores") {
    const obtData = Array.isArray(osirisData?.obtentores) ? osirisData.obtentores : [];
    const setObt = (list) => setOsirisData(prev=>({...prev, obtentores: list}));

    const guardarObt = () => {
      if(!canObtentores) return;
      if(!obtForm.obtentor) { alert("Nombre del obtentor es obligatorio"); return; }
      if(obtForm.f_inicio && obtForm.f_vencimiento && new Date(obtForm.f_vencimiento) < new Date(obtForm.f_inicio)) {
        alert("La fecha de vencimiento no puede ser anterior a la fecha de inicio."); return;
      }
      const id = obtEditId || `obt_${Date.now()}`;
      const existing = obtEditId ? obtData.find(o=>o.id===obtEditId) : null;
      const item = {...(existing||{}), ...obtForm, id};
      // Asegurar arrays
      item.especies = item.especies || [];
      item.pbr      = item.pbr      || [];
      item.anexos   = item.anexos   || [];
      const next = obtEditId ? obtData.map(o=>o.id===obtEditId?item:o) : [...obtData, item];
      setObt(next);
      const extras = [];
      if(item.especies.length>0) extras.push(`${item.especies.length} variedad${item.especies.length>1?"es":""}`);
      if(item.pbr.length>0) extras.push(`${item.pbr.length} PBR`);
      const extraStr = extras.length ? ` · ${extras.join(", ")}` : "";
      window.auditLog && window.auditLog(obtEditId?"editar":"crear", {modulo:"osiris", seccion:"Contratos Obtentores",
        descripcion:`${obtEditId?"Editó":"Creó"} contrato obtentor "${item.obtentor}"${item.f_vencimiento?` · vence ${item.f_vencimiento}`:""}${extraStr}`});
      setObtModal(false);
      setObtEditId(null);
      setObtWizStep(1);
      setObtWizEspForm(EMPTY_ESP_INLINE);
      setObtWizPbrForm(EMPTY_PBR_INLINE);
    };

    const updateContrato = (id, updates) => {
      if(!canObtentores) return;
      const before = obtData.find(o=>o.id===id);
      setObt(obtData.map(o=>o.id===id?{...o,...updates}:o));
      const campo = Object.keys(updates).join(", ");
      window.auditLog && window.auditLog("editar", {modulo:"osiris", seccion:"Contratos Obtentores",
        descripcion:`Editó contrato obtentor "${before?.obtentor||""}": campo ${campo}`});
    };

    const eliminarObt = (id) => {
      if(!canObtentores) return;
      const o = obtData.find(x=>x.id===id);
      if(!o) return;
      if(!window.confirm(`¿Eliminar contrato del obtentor "${o.obtentor}"?\n\nIncluye ${(o.especies||[]).length} especies, ${(o.pbr||[]).length} PBR y ${(o.anexos||[]).length} anexos.`)) return;
      setObt(obtData.filter(x=>x.id!==id));
      window.auditLog && window.auditLog("eliminar", {modulo:"osiris", seccion:"Contratos Obtentores",
        descripcion:`Eliminó contrato obtentor "${o.obtentor}"`});
    };

    const contratoActivo = obtDetalle ? obtData.find(o=>o.id===obtDetalle) : null;

    // ── Sub-modales: especies, PBR, anexos ──
    const guardarEspecie = () => {
      if(!canObtentores) return;
      if(!espForm.especie || !espForm.variedad) { alert("Especie y Variedad son obligatorios."); return; }
      const c = contratoActivo;
      const nueva = {
        id:`esp_${Date.now()}`,
        especie:espForm.especie.trim(),
        variedad:espForm.variedad.trim(),
        observaciones:espForm.observaciones||"",
        dhe_estado:espForm.dhe_estado||"No iniciado",
        dhe_fecha_aprob:espForm.dhe_fecha_aprob||"",
        dhe_doc:espForm.dhe_doc||"",
        dhe_observaciones:espForm.dhe_observaciones||"",
      };
      updateContrato(c.id, {especies:[...(c.especies||[]), nueva]});
      setEspForm({especie:"",variedad:"",observaciones:"",dhe_estado:"No iniciado",dhe_fecha_aprob:"",dhe_doc:"",dhe_observaciones:""});
      setEspModal(false);
    };

    const guardarPBR = () => {
      if(!canObtentores) return;
      if(!pbrForm.especie || !pbrForm.pais) { alert("Especie y País son obligatorios."); return; }
      if(pbrForm.f_solicitud && pbrForm.f_resolucion && new Date(pbrForm.f_resolucion) < new Date(pbrForm.f_solicitud)) {
        alert("La fecha de resolución no puede ser anterior a la fecha de solicitud."); return;
      }
      const c = contratoActivo;
      const nuevo = {id:`pbr_${Date.now()}`, ...pbrForm};
      updateContrato(c.id, {pbr:[...(c.pbr||[]), nuevo]});
      setPbrForm({especie:"",pais:"",estado:"Pendiente",f_solicitud:"",f_resolucion:"",doc_solicitud:"",doc_resolucion:"",observaciones:""});
      setPbrModal(false);
    };

    const guardarAnexo = () => {
      if(!canObtentores) return;
      if(!anxForm.descripcion) { alert("Descripción del anexo es obligatoria."); return; }
      const c = contratoActivo;
      const nuevo = {id:`anx_${Date.now()}`, ...anxForm};
      updateContrato(c.id, {anexos:[...(c.anexos||[]), nuevo]});
      setAnxForm({descripcion:"",fecha:"",enlace:"",observaciones:""});
      setAnxModal(false);
    };

    // ── Vista detalle de un contrato ──
    if(contratoActivo) {
      const c = contratoActivo;
      const especies = c.especies || [];
      const pbr = c.pbr || [];
      const anexos = c.anexos || [];

      const delEspecie = (eid) => {
        if(!canObtentores) return;
        if(!window.confirm("¿Eliminar especie?")) return;
        // Verificar PBR vinculados
        const pbrVinc = pbr.filter(p=>p.especie === especies.find(e=>e.id===eid)?.especie);
        if(pbrVinc.length>0) {
          if(!window.confirm(`Hay ${pbrVinc.length} registro(s) PBR vinculados a esta especie. ¿Continuar igual?`)) return;
        }
        updateContrato(c.id, {especies:especies.filter(e=>e.id!==eid)});
      };
      const updatePBR = (pid, updates) => {
        if(!canObtentores) return;
        updateContrato(c.id, {pbr:pbr.map(p=>p.id===pid?{...p,...updates}:p)});
      };
      const delPBR = (pid) => {
        if(!canObtentores) return;
        if(!window.confirm("¿Eliminar registro PBR?")) return;
        updateContrato(c.id, {pbr:pbr.filter(p=>p.id!==pid)});
      };
      const updateAnexo = (aid, updates) => {
        if(!canObtentores) return;
        updateContrato(c.id, {anexos:anexos.map(a=>a.id===aid?{...a,...updates}:a)});
      };
      const delAnexo = (aid) => {
        if(!canObtentores) return;
        if(!window.confirm("¿Eliminar anexo?")) return;
        updateContrato(c.id, {anexos:anexos.filter(a=>a.id!==aid)});
      };

      const TABS_OBT = [{id:"general",label:"📋 General"},{id:"especies",label:"🌿 Especies/Variedades"},{id:"pbr",label:"📜 PBR"},{id:"royalties",label:"💰 Royalty al Obtentor"},{id:"condiciones",label:"📊 Condiciones Comerciales"},{id:"legal",label:"⚖️ Legal/Firmas"},{id:"anexos",label:"📎 Anexos"}];
      const vig = estadoVigencia(c.f_vencimiento);

      return (
        <div style={{fontFamily:"sans-serif",background:"#0d1117",minHeight:"100vh",padding:"20px 20px 40px"}}>
          <NavBar breadcrumbItems={[
            {label:"Mediterra", onClick:onBack},
            {label:"Osiris Hub", onClick:()=>{setSubApp(null);setObtDetalle(null);}},
            {label:"Contratos Obtentores", onClick:()=>setObtDetalle(null)},
            {label:c.obtentor},
          ]}/>
          {canVerObtentores&&!canObtentores&&(
            <div style={{background:"linear-gradient(135deg,#fef3c7,#fde68a)",border:"1px solid #f59e0b",
              borderRadius:10,padding:"10px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:20}}>👁</span>
              <div style={{flex:1}}>
                <div style={{fontSize:12,fontWeight:800,color:"#92400e"}}>Modo solo lectura</div>
                <div style={{fontSize:11,color:"#78350f"}}>
                  {esConsulta
                    ? "Tu rol es de Consulta. Puedes visualizar y exportar los datos a Excel, pero no modificar contratos obtentores."
                    : "Tienes permiso de \"Solo ver\" en Contratos Obtentores. Puedes visualizar y exportar pero no modificar."}
                </div>
              </div>
            </div>
          )}
          {/* Header contrato */}
          <div style={{background:"linear-gradient(135deg,#1e1b4b,#4338ca22)",borderRadius:14,padding:"20px 24px",marginBottom:16,border:"1px solid #4338ca44"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
              <div>
                <div style={{fontSize:20,fontWeight:900,color:"#e6edf3"}}>🧬 {c.obtentor}</div>
                <div style={{fontSize:11,color:"#8b949e",marginTop:4}}>
                  {c.f_inicio&&`Desde ${c.f_inicio}`} {c.f_vencimiento&&` · Hasta ${c.f_vencimiento}`}
                  {c.renovable&&c.f_vencimiento_nueva&&<span style={{color:"#60a5fa",marginLeft:6,fontWeight:700}}>🔄 Nueva: {c.f_vencimiento_nueva}</span>}
                  <span style={{color:vig.color,marginLeft:8,fontWeight:700}}>{vig.icon} {vig.label}</span>
                  {c.doc_contrato&&<a href={c.doc_contrato} target="_blank" rel="noopener noreferrer" style={{marginLeft:10,color:"#a78bfa",fontWeight:700,textDecoration:"none"}}>📄 Abrir contrato</a>}
                </div>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {c.estado_contrato&&<span style={{fontSize:10,background:"rgba(124,58,237,0.25)",color:"#c4b5fd",padding:"4px 10px",borderRadius:20,fontWeight:700,border:"1px solid #7c3aed44"}}>📋 {c.estado_contrato}</span>}
                {c.firma_obtentor&&<span style={{fontSize:10,background:"rgba(34,197,94,0.2)",color:"#4ade80",padding:"4px 10px",borderRadius:20,fontWeight:700}}>✅ Firma Obtentor</span>}
                {c.firma_osiris&&<span style={{fontSize:10,background:"rgba(34,197,94,0.2)",color:"#4ade80",padding:"4px 10px",borderRadius:20,fontWeight:700}}>✅ Firma Osiris</span>}
                {c.renovable&&<span style={{fontSize:10,background:"rgba(96,165,250,0.2)",color:"#93c5fd",padding:"4px 10px",borderRadius:20,fontWeight:700}}>🔄 Renovable</span>}
                <span style={{fontSize:10,background:"rgba(124,58,237,0.2)",color:"#c4b5fd",padding:"4px 10px",borderRadius:20,fontWeight:700}}>🌿 {especies.length} especies</span>
                <span style={{fontSize:10,background:"rgba(251,191,36,0.2)",color:"#fbbf24",padding:"4px 10px",borderRadius:20,fontWeight:700}}>📜 {pbr.length} PBR</span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
            {TABS_OBT.map(t=>(
              <button key={t.id} onClick={()=>setObtTab(t.id)}
                style={{padding:"8px 16px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:obtTab===t.id?700:500,fontSize:12,
                  background:obtTab===t.id?"#7c3aed":"#21283b",color:obtTab===t.id?"#fff":"#8b949e"}}>
                {t.label}
              </button>
            ))}
          </div>

          <div style={{background:"#fff",borderRadius:14,padding:20,boxShadow:"0 2px 10px #0001"}}>
            {/* TAB GENERAL */}
            {obtTab==="general"&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                <div style={{gridColumn:"1/-1",fontSize:12,fontWeight:700,color:"#7c3aed",borderBottom:"1px solid #e2e8f0",paddingBottom:6}}>🏢 Datos del Obtentor</div>
                {[["Nombre del Obtentor *","obtentor","text"],["País","pais","text"],["Contacto","contacto","text"],["Email contacto","emailContacto","email"],["Teléfono","telefonoContacto","text"],["Representante legal","representanteLegal","text"]].map(([lbl,f,t])=>(
                  <div key={f}><label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>{lbl}</label>
                    <input type={t} disabled={!canObtentores} value={c[f]||""} onChange={e=>updateContrato(c.id,{[f]:e.target.value})}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",background:canObtentores?"#fff":"#f8fafc"}}/></div>
                ))}
                <div style={{gridColumn:"1/-1",fontSize:12,fontWeight:700,color:"#7c3aed",borderBottom:"1px solid #e2e8f0",paddingBottom:6,marginTop:8}}>📄 Datos del Contrato</div>
                {[["Fecha Inicio","f_inicio","date"],["Fecha Vencimiento","f_vencimiento","date"]].map(([lbl,f,t])=>(
                  <div key={f}><label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>{lbl}</label>
                    <input type={t} disabled={!canObtentores} value={c[f]||""} onChange={e=>updateContrato(c.id,{[f]:e.target.value})}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",background:canObtentores?"#fff":"#f8fafc"}}/></div>
                ))}
                <div><label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Estado del Contrato</label>
                  <select disabled={!canObtentores} value={c.estado_contrato||"Borrador"} onChange={e=>updateContrato(c.id,{estado_contrato:e.target.value})}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",background:canObtentores?"#fff":"#f8fafc"}}>
                    {ESTADOS_CONTRATO_OBT.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
                <div><label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Exclusividad</label>
                  <select disabled={!canObtentores} value={c.exclusividad||"No"} onChange={e=>updateContrato(c.id,{exclusividad:e.target.value})}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",background:canObtentores?"#fff":"#f8fafc"}}>
                    <option value="No">No exclusivo</option><option value="Exclusivo">Exclusivo</option><option value="Semi-exclusivo">Semi-exclusivo</option></select></div>
                {c.exclusividad&&c.exclusividad!=="No"&&(
                  <div><label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Tipo exclusividad</label>
                    <input disabled={!canObtentores} value={c.tipoExclusividad||""} placeholder="Por territorio, por especie..." onChange={e=>updateContrato(c.id,{tipoExclusividad:e.target.value})}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/></div>
                )}
                <div style={{gridColumn:"1/-1"}}><label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Territorios autorizados</label>
                  <input disabled={!canObtentores} value={c.territorios||""} placeholder="Chile, Perú, México..." onChange={e=>updateContrato(c.id,{territorios:e.target.value})}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/></div>
                <div style={{gridColumn:"1/-1"}}><label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Obligaciones contractuales</label>
                  <textarea disabled={!canObtentores} value={c.obligaciones||""} placeholder="Reportes anuales, mínimos, mantención PBR..." onChange={e=>updateContrato(c.id,{obligaciones:e.target.value})}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,minHeight:60,boxSizing:"border-box"}}/></div>
                <div><label style={{fontSize:11,fontWeight:600,color:"#475569",display:"flex",alignItems:"center",gap:8,cursor:canObtentores?"pointer":"default"}}>
                    <input type="checkbox" disabled={!canObtentores} checked={!!c.renovable} onChange={e=>updateContrato(c.id,{renovable:e.target.checked})}/> Contrato renovable</label></div>
                {c.renovable&&(<div><label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>📆 Nueva Fecha Vencimiento</label>
                    <input type="date" disabled={!canObtentores} value={c.f_vencimiento_nueva||""} onChange={e=>updateContrato(c.id,{f_vencimiento_nueva:e.target.value})}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #93c5fd",fontSize:13,boxSizing:"border-box",background:"#eff6ff"}}/></div>)}
                <div style={{gridColumn:"1/-1"}}><label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>📎 Link al contrato</label>
                  <input disabled={!canObtentores} value={c.doc_contrato||""} placeholder="https://..." onChange={e=>updateContrato(c.id,{doc_contrato:e.target.value})}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                  {c.doc_contrato&&<a href={c.doc_contrato} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:"#7c3aed",marginTop:4,display:"inline-block",fontWeight:700}}>📄 Abrir</a>}</div>
                <div style={{gridColumn:"1/-1"}}><label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Observaciones</label>
                  <textarea disabled={!canObtentores} value={c.observaciones||""} onChange={e=>updateContrato(c.id,{observaciones:e.target.value})}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,minHeight:80,boxSizing:"border-box"}}/></div>
              </div>
            )}

            {/* TAB ESPECIES/VARIEDADES */}
            {obtTab==="especies"&&(
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontWeight:700,color:"#1e293b"}}>Especies, Variedades y DHE del Contrato</div>
                  {canObtentores&&<button onClick={()=>{setEspForm({especie:"",variedad:"",observaciones:"",dhe_estado:"No iniciado",dhe_fecha_aprob:"",dhe_doc:"",dhe_observaciones:""});setEspModal(true);}} style={{padding:"6px 14px",borderRadius:8,background:"#7c3aed",border:"none",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Agregar Especie/Variedad</button>}
                </div>
                <div style={{background:"#fef3c7",border:"1px solid #fbbf24",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:11,color:"#78350f"}}>
                  💡 Cada variedad puede tener su propio estado de DHE (Distinción, Homogeneidad y Estabilidad). Al obtener la aprobación del DHE, adjunta el documento.
                </div>
                {especies.length===0?<div style={{padding:30,textAlign:"center",color:"#94a3b8"}}>No hay especies registradas.</div>:(
                  <div style={{display:"flex",flexDirection:"column",gap:12}}>
                    {especies.map(e=>{
                      // Migrar DHE plano a array si es necesario
                      const dheArr = Array.isArray(e.dhe) ? e.dhe : (e.dhe_estado && e.dhe_estado!=="No iniciado" ? [{id:`dhe_mig_${e.id}`,pais:"",estado:e.dhe_estado,fecha_solicitud:e.dhe_fecha_solicitud||"",fecha_aprob:e.dhe_fecha_aprob||"",nRegistro:e.dhe_nRegistro||"",doc:e.dhe_doc||"",observaciones:e.dhe_observaciones||""}] : []);
                      const nAprobados = dheArr.filter(d=>d.estado==="Aprobado").length;
                      const updDhe = (dheId,campo,valor) => {
                        const newDhe = dheArr.map(d=>d.id===dheId?{...d,[campo]:valor}:d);
                        updateContrato(c.id,{especies:especies.map(x=>x.id===e.id?{...x,dhe:newDhe}:x)});
                      };
                      const delDhe = (dheId) => {
                        if(!window.confirm("¿Eliminar este registro DHE?"))return;
                        const newDhe = dheArr.filter(d=>d.id!==dheId);
                        updateContrato(c.id,{especies:especies.map(x=>x.id===e.id?{...x,dhe:newDhe}:x)});
                      };
                      return (
                        <div key={e.id} style={{border:"1px solid #e2e8f0",borderRadius:10,padding:14,background:"#fff"}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
                            <div>
                              <span style={{fontWeight:800,fontSize:14,color:"#1e293b"}}>🌿 {e.especie}</span>
                              <span style={{fontSize:13,color:"#475569",marginLeft:6}}>— {e.variedad}</span>
                            </div>
                            <div style={{display:"flex",gap:6,alignItems:"center"}}>
                              {nAprobados>0&&<span style={{fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:20,background:"#dcfce7",color:"#16a34a"}}>✅ {nAprobados} DHE aprobado{nAprobados>1?"s":""}</span>}
                              <span style={{fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:20,background:"#7c3aed22",color:"#7c3aed"}}>{dheArr.length} país{dheArr.length!==1?"es":""}</span>
                              {canObtentores&&<button onClick={()=>delEspecie(e.id)} style={{background:"#fef2f2",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11}}>🗑</button>}
                            </div>
                          </div>
                          {/* Obs variedad */}
                          <div style={{marginBottom:10,fontSize:11}}>
                            <span style={{color:"#64748b",fontWeight:600}}>Obs. variedad: </span>
                            <input disabled={!canObtentores} value={e.observaciones||""} placeholder="Notas..." onChange={ev=>updateContrato(c.id,{especies:especies.map(x=>x.id===e.id?{...x,observaciones:ev.target.value}:x)})}
                              style={{width:"60%",padding:"4px 8px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:11,boxSizing:"border-box"}}/>
                          </div>
                          {/* DHE multi-país */}
                          <div style={{background:"#f8fafc",borderRadius:8,padding:10}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                              <div style={{fontSize:11,fontWeight:700,color:"#475569"}}>📋 Registros DHE por país</div>
                              {canObtentores&&<button onClick={()=>{
                                const nd={id:`dhe_${Date.now()}`,pais:"",estado:"No iniciado",fecha_solicitud:"",fecha_aprob:"",nRegistro:"",doc:"",observaciones:""};
                                updateContrato(c.id,{especies:especies.map(x=>x.id===e.id?{...x,dhe:[...dheArr,nd]}:x)});
                              }} style={{padding:"3px 10px",borderRadius:6,background:"#7c3aed",border:"none",color:"#fff",cursor:"pointer",fontSize:10,fontWeight:700}}>+ País DHE</button>}
                            </div>
                            {dheArr.length===0?(
                              <div style={{padding:12,textAlign:"center",color:"#94a3b8",fontSize:11,border:"1px dashed #e2e8f0",borderRadius:6}}>Sin registros DHE. Agrega un país.</div>
                            ):(
                              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                                {dheArr.map(d=>{
                                  const dColor=d.estado==="Aprobado"?"#16a34a":d.estado==="Rechazado"||d.estado==="Vencido"?"#dc2626":d.estado==="En proceso"||d.estado==="Solicitado"?"#d97706":"#64748b";
                                  return(
                                    <div key={d.id} style={{border:"1px solid #e2e8f0",borderRadius:8,padding:10,background:d.estado==="Aprobado"?"#f0fdf4":"#fff"}}>
                                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                                        <div style={{display:"flex",gap:8,alignItems:"center"}}>
                                          <select disabled={!canObtentores} value={d.pais||""} onChange={ev=>updDhe(d.id,"pais",ev.target.value)}
                                            style={{padding:"4px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,fontWeight:700,minWidth:120}}>
                                            <option value="">— País —</option>
                                            {PAISES_DHE.map(p=><option key={p} value={p}>{p}</option>)}
                                          </select>
                                          <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:12,background:dColor+"22",color:dColor}}>{d.estado}</span>
                                        </div>
                                        {canObtentores&&<button onClick={()=>delDhe(d.id)} style={{background:"#fef2f2",border:"none",borderRadius:4,padding:"2px 6px",cursor:"pointer",fontSize:10,color:"#991b1b"}}>🗑</button>}
                                      </div>
                                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,fontSize:11}}>
                                        <div>
                                          <div style={{color:"#64748b",fontWeight:600,marginBottom:2}}>Estado</div>
                                          <select disabled={!canObtentores} value={d.estado||"No iniciado"} onChange={ev=>updDhe(d.id,"estado",ev.target.value)}
                                            style={{width:"100%",padding:"4px 6px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:11,boxSizing:"border-box",fontWeight:700}}>
                                            {ESTADOS_DHE.map(s=><option key={s} value={s}>{s}</option>)}
                                          </select>
                                        </div>
                                        <div>
                                          <div style={{color:"#64748b",fontWeight:600,marginBottom:2}}>F. Solicitud</div>
                                          <input type="date" disabled={!canObtentores} value={d.fecha_solicitud||""} onChange={ev=>updDhe(d.id,"fecha_solicitud",ev.target.value)}
                                            style={{width:"100%",padding:"4px 6px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:11,boxSizing:"border-box"}}/>
                                        </div>
                                        <div>
                                          <div style={{color:"#64748b",fontWeight:600,marginBottom:2}}>F. Aprobación</div>
                                          <input type="date" disabled={!canObtentores} value={d.fecha_aprob||""} onChange={ev=>updDhe(d.id,"fecha_aprob",ev.target.value)}
                                            style={{width:"100%",padding:"4px 6px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:11,boxSizing:"border-box"}}/>
                                        </div>
                                        <div>
                                          <div style={{color:"#64748b",fontWeight:600,marginBottom:2}}>N° Registro</div>
                                          <input disabled={!canObtentores} value={d.nRegistro||""} placeholder="Ej: 2024-001" onChange={ev=>updDhe(d.id,"nRegistro",ev.target.value)}
                                            style={{width:"100%",padding:"4px 6px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:11,boxSizing:"border-box"}}/>
                                        </div>
                                      </div>
                                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:11,marginTop:6}}>
                                        <div>
                                          <div style={{color:"#64748b",fontWeight:600,marginBottom:2}}>📎 Doc DHE</div>
                                          <div style={{display:"flex",gap:4}}>
                                            <input disabled={!canObtentores} value={d.doc||""} placeholder="https://..." onChange={ev=>updDhe(d.id,"doc",ev.target.value)}
                                              style={{flex:1,padding:"4px 6px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:11,boxSizing:"border-box"}}/>
                                            {d.doc&&<a href={d.doc} target="_blank" rel="noopener noreferrer" style={{fontSize:12}}>📎</a>}
                                          </div>
                                        </div>
                                        <div>
                                          <div style={{color:"#64748b",fontWeight:600,marginBottom:2}}>Observaciones</div>
                                          <input disabled={!canObtentores} value={d.observaciones||""} onChange={ev=>updDhe(d.id,"observaciones",ev.target.value)}
                                            style={{width:"100%",padding:"4px 6px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:11,boxSizing:"border-box"}}/>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB PBR */}
            {obtTab==="pbr"&&(
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontWeight:700,color:"#1e293b"}}>Registro PBR — Protección de Obtenciones Vegetales</div>
                  {canObtentores&&<button onClick={()=>{
                    if(especies.length===0){alert("Primero debes agregar al menos una especie en la pestaña Especies/Variedades.");return;}
                    setPbrForm({especie:especies[0]?.especie||"",pais:"",estado:"Pendiente",f_solicitud:"",f_resolucion:"",doc_solicitud:"",doc_resolucion:"",observaciones:""});
                    setPbrModal(true);
                  }} style={{padding:"6px 14px",borderRadius:8,background:"#f59e0b",border:"none",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Nuevo Registro PBR</button>}
                </div>
                {pbr.length===0?<div style={{padding:30,textAlign:"center",color:"#94a3b8"}}>No hay registros PBR.</div>:(
                  <div style={{display:"flex",flexDirection:"column",gap:12}}>
                    {pbr.map(p=>(
                      <div key={p.id} style={{border:"1px solid #e2e8f0",borderRadius:10,padding:16,background:p.estado==="Aprobado"?"#f0fdf4":p.estado==="Rechazado"?"#fef2f2":"#fff"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                          <div style={{fontWeight:700,fontSize:13}}>🌿 {p.especie} — 🌍 {p.pais}</div>
                          <div style={{display:"flex",gap:6,alignItems:"center"}}>
                            <select disabled={!canObtentores} value={p.estado||"Pendiente"} onChange={e=>updatePBR(p.id,{estado:e.target.value})}
                              style={{padding:"4px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,
                                background:p.estado==="Otorgado"||p.estado==="Vigente"?"#dcfce7":p.estado==="Denegado"||p.estado==="Vencido"||p.estado==="Retirado"?"#fee2e2":"#fef9c3",
                                fontWeight:700}}>
                              {ESTADOS_PBR.map(s=><option key={s} value={s}>{s}</option>)}
                            </select>
                            {canObtentores&&<button onClick={()=>delPBR(p.id)} style={{background:"#fef2f2",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11}}>🗑</button>}
                          </div>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,fontSize:11}}>
                          <div>
                            <div style={{color:"#64748b",fontWeight:600,marginBottom:2}}>Fecha Solicitud</div>
                            <input type="date" disabled={!canObtentores} value={p.f_solicitud||""} onChange={e=>updatePBR(p.id,{f_solicitud:e.target.value})}
                              style={{width:"100%",padding:"4px 8px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:11,boxSizing:"border-box"}}/>
                          </div>
                          <div>
                            <div style={{color:"#64748b",fontWeight:600,marginBottom:2}}>Fecha Resolución</div>
                            <input type="date" disabled={!canObtentores} value={p.f_resolucion||""} onChange={e=>updatePBR(p.id,{f_resolucion:e.target.value})}
                              style={{width:"100%",padding:"4px 8px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:11,boxSizing:"border-box"}}/>
                          </div>
                          <div>
                            <div style={{color:"#64748b",fontWeight:600,marginBottom:2}}>Doc. Solicitud (link)</div>
                            <input disabled={!canObtentores} value={p.doc_solicitud||""} onChange={e=>updatePBR(p.id,{doc_solicitud:e.target.value})} placeholder="URL documento..."
                              style={{width:"100%",padding:"4px 8px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:11,boxSizing:"border-box"}}/>
                          </div>
                          <div>
                            <div style={{color:"#64748b",fontWeight:600,marginBottom:2}}>Doc. Resolución (link)</div>
                            <input disabled={!canObtentores} value={p.doc_resolucion||""} onChange={e=>updatePBR(p.id,{doc_resolucion:e.target.value})} placeholder="URL documento..."
                              style={{width:"100%",padding:"4px 8px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:11,boxSizing:"border-box"}}/>
                          </div>
                        </div>
                        <div style={{marginTop:8}}>
                          <input disabled={!canObtentores} value={p.observaciones||""} onChange={e=>updatePBR(p.id,{observaciones:e.target.value})} placeholder="Observaciones PBR..."
                            style={{width:"100%",padding:"4px 8px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:11,boxSizing:"border-box"}}/>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB ROYALTY AL OBTENTOR */}
            {obtTab==="royalties"&&(
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontWeight:700,color:"#1e293b"}}>💰 Royalties que Osiris paga al obtentor</div>
                  {canObtentores&&<button onClick={()=>{
                    const nr={id:`roy_${Date.now()}`,tipo:"Por planta",especie:"",variedad:"",valor:0,moneda:"USD",frecuencia:"Anual",observaciones:""};
                    updateContrato(c.id,{royaltiesObtentor:[...(c.royaltiesObtentor||[]),nr]});
                  }} style={{padding:"6px 14px",borderRadius:8,background:"#7c3aed",border:"none",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Agregar</button>}
                </div>
                {(c.royaltiesObtentor||[]).length===0?(
                  <div style={{padding:30,textAlign:"center",color:"#94a3b8",border:"1px dashed #e2e8f0",borderRadius:10}}>
                    <div style={{fontSize:32,marginBottom:8}}>💰</div><div style={{fontSize:12}}>Sin royalties definidos.</div></div>
                ):(
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,background:"#fff",borderRadius:10,overflow:"hidden",border:"1px solid #e2e8f0"}}>
                      <thead><tr style={{background:"#7c3aed",color:"#fff"}}>
                        {["Tipo","Especie","Variedad","Valor","Moneda","Frecuencia","Obs.",""].map(h=><th key={h} style={{padding:"8px 10px",textAlign:"left",fontSize:11,fontWeight:700}}>{h}</th>)}
                      </tr></thead>
                      <tbody>{(c.royaltiesObtentor||[]).map((r,i)=>{
                        const upd=(f,v)=>{const nx=(c.royaltiesObtentor||[]).map(x=>x.id===r.id?{...x,[f]:v}:x);updateContrato(c.id,{royaltiesObtentor:nx});};
                        return(<tr key={r.id} style={{borderBottom:"1px solid #f1f5f9",background:i%2?"#f8fafc":"#fff"}}>
                          <td style={{padding:"6px 8px"}}><select disabled={!canObtentores} value={r.tipo||""} onChange={e=>upd("tipo",e.target.value)} style={{padding:"5px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11}}>{TIPOS_ROYALTY_OBTENTOR.map(t=><option key={t}>{t}</option>)}</select></td>
                          <td style={{padding:"6px 8px"}}><input disabled={!canObtentores} value={r.especie||""} onChange={e=>upd("especie",e.target.value)} placeholder="Todas" style={{width:80,padding:"5px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11}}/></td>
                          <td style={{padding:"6px 8px"}}><input disabled={!canObtentores} value={r.variedad||""} onChange={e=>upd("variedad",e.target.value)} placeholder="Todas" style={{width:80,padding:"5px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11}}/></td>
                          <td style={{padding:"6px 8px"}}><input type="number" step="0.01" disabled={!canObtentores} value={r.valor||0} onChange={e=>upd("valor",parseFloat(e.target.value)||0)} style={{width:70,padding:"5px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,textAlign:"right"}}/></td>
                          <td style={{padding:"6px 8px"}}><select disabled={!canObtentores} value={r.moneda||"USD"} onChange={e=>upd("moneda",e.target.value)} style={{padding:"5px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11}}>{MONEDAS.map(m=><option key={m}>{m}</option>)}</select></td>
                          <td style={{padding:"6px 8px"}}><select disabled={!canObtentores} value={r.frecuencia||"Anual"} onChange={e=>upd("frecuencia",e.target.value)} style={{padding:"5px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11}}>{["Anual","Semestral","Trimestral","Por evento","Única vez"].map(f=><option key={f}>{f}</option>)}</select></td>
                          <td style={{padding:"6px 8px"}}><input disabled={!canObtentores} value={r.observaciones||""} onChange={e=>upd("observaciones",e.target.value)} style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,boxSizing:"border-box"}}/></td>
                          <td style={{padding:"6px 8px"}}>{canObtentores&&<button onClick={()=>{if(!window.confirm("¿Eliminar?"))return;updateContrato(c.id,{royaltiesObtentor:(c.royaltiesObtentor||[]).filter(x=>x.id!==r.id)});}} style={{background:"#fef2f2",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,color:"#991b1b"}}>🗑</button>}</td>
                        </tr>);
                      })}</tbody>
                    </table>
                  </div>
                )}
                <div style={{marginTop:12,padding:10,background:"#ede9fe",borderRadius:8,fontSize:11,color:"#5b21b6"}}>
                  💡 Royalties que <strong>Osiris paga al obtentor</strong>. Distintos de los que Osiris <strong>cobra a productores</strong>.
                </div>
              </div>
            )}

            {/* TAB CONDICIONES COMERCIALES */}
            {obtTab==="condiciones"&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                <div><label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Mínimo garantizado</label>
                  <div style={{display:"flex",gap:8}}>
                    <input type="number" step="0.01" disabled={!canObtentores} value={c.minimoGarantizado||0} onChange={e=>updateContrato(c.id,{minimoGarantizado:parseFloat(e.target.value)||0})} style={{flex:1,padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,textAlign:"right"}}/>
                    <select disabled={!canObtentores} value={c.monedaMinimo||"USD"} onChange={e=>updateContrato(c.id,{monedaMinimo:e.target.value})} style={{width:80,padding:"8px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13}}>{MONEDAS.map(m=><option key={m}>{m}</option>)}</select>
                  </div></div>
                <div><label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Frecuencia reportes</label>
                  <select disabled={!canObtentores} value={c.frecuenciaReportes||""} onChange={e=>updateContrato(c.id,{frecuenciaReportes:e.target.value})} style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13}}>
                    <option value="">— Sin definir —</option><option>Mensual</option><option>Trimestral</option><option>Semestral</option><option>Anual</option></select></div>
                <div><label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Próximo reporte</label>
                  <input type="date" disabled={!canObtentores} value={c.proximoReporte||""} onChange={e=>updateContrato(c.id,{proximoReporte:e.target.value})} style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13}}/></div>
                <div><label style={{fontSize:11,fontWeight:600,color:"#475569",display:"flex",alignItems:"center",gap:8,cursor:canObtentores?"pointer":"default",marginTop:24}}>
                    <input type="checkbox" disabled={!canObtentores} checked={!!c.derechoAuditoria} onChange={e=>updateContrato(c.id,{derechoAuditoria:e.target.checked})}/> Obtentor tiene derecho a auditoría</label></div>
                <div style={{gridColumn:"1/-1"}}><label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Calendario de pagos</label>
                  <textarea disabled={!canObtentores} value={c.calendarioPagos||""} placeholder="Pago anual en marzo, mínimo en enero..." onChange={e=>updateContrato(c.id,{calendarioPagos:e.target.value})}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,minHeight:80,boxSizing:"border-box"}}/></div>
              </div>
            )}

            {/* TAB LEGAL/FIRMAS */}
            {obtTab==="legal"&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
                <div style={{border:"1px solid #e2e8f0",borderRadius:10,padding:16}}>
                  <div style={{fontWeight:700,marginBottom:12,color:"#1e293b"}}>📝 Firmas del Contrato</div>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:canObtentores?"pointer":"default",padding:"8px 0",borderBottom:"1px solid #f1f5f9"}}>
                    <input type="checkbox" disabled={!canObtentores} checked={!!c.firma_obtentor} onChange={e=>updateContrato(c.id,{firma_obtentor:e.target.checked})}/>
                    <span style={{fontWeight:600,color:c.firma_obtentor?"#16a34a":"#94a3b8"}}>{c.firma_obtentor?"✅":"⬜"} Firma Obtentor</span>
                  </label>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:canObtentores?"pointer":"default",padding:"8px 0"}}>
                    <input type="checkbox" disabled={!canObtentores} checked={!!c.firma_osiris} onChange={e=>updateContrato(c.id,{firma_osiris:e.target.checked})}/>
                    <span style={{fontWeight:600,color:c.firma_osiris?"#16a34a":"#94a3b8"}}>{c.firma_osiris?"✅":"⬜"} Firma Osiris</span>
                  </label>
                </div>
                <div style={{border:"1px solid #e2e8f0",borderRadius:10,padding:16}}>
                  <div style={{fontWeight:700,marginBottom:12,color:"#1e293b"}}>📄 Documentación Legal</div>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Enlace documento legal</label>
                  <input disabled={!canObtentores} value={c.doc_legal||""} onChange={e=>updateContrato(c.id,{doc_legal:e.target.value})} placeholder="URL del documento legal..."
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",background:canObtentores?"#fff":"#f8fafc"}}/>
                  {c.doc_legal&&<a href={c.doc_legal} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:"#7c3aed",marginTop:6,display:"inline-block"}}>📎 Abrir documento</a>}
                </div>
              </div>
            )}

            {/* TAB ANEXOS */}
            {obtTab==="anexos"&&(
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontWeight:700,color:"#1e293b"}}>📎 Anexos del Contrato</div>
                  {canObtentores&&<button onClick={()=>{setAnxForm({descripcion:"",fecha:"",enlace:"",observaciones:""});setAnxModal(true);}} style={{padding:"6px 14px",borderRadius:8,background:"#7c3aed",border:"none",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Agregar Anexo</button>}
                </div>
                {anexos.length===0?<div style={{padding:30,textAlign:"center",color:"#94a3b8"}}>No hay anexos registrados.</div>:(
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {anexos.map(a=>(
                      <div key={a.id} style={{border:"1px solid #e2e8f0",borderRadius:10,padding:12,display:"flex",gap:12,alignItems:"center"}}>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:600,fontSize:13,marginBottom:4}}>{a.descripcion}</div>
                          <div style={{display:"flex",gap:10,fontSize:11}}>
                            <input type="date" disabled={!canObtentores} value={a.fecha||""} onChange={e=>updateAnexo(a.id,{fecha:e.target.value})}
                              style={{padding:"3px 8px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:11}}/>
                            <input disabled={!canObtentores} value={a.enlace||""} onChange={e=>updateAnexo(a.id,{enlace:e.target.value})} placeholder="Enlace documento..."
                              style={{flex:1,padding:"3px 8px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:11}}/>
                            <input disabled={!canObtentores} value={a.observaciones||""} onChange={e=>updateAnexo(a.id,{observaciones:e.target.value})} placeholder="Notas..."
                              style={{flex:1,padding:"3px 8px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:11}}/>
                          </div>
                        </div>
                        {a.enlace&&<a href={a.enlace} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:"#7c3aed"}}>📎</a>}
                        {canObtentores&&<button onClick={()=>delAnexo(a.id)} style={{background:"#fef2f2",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11}}>🗑</button>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sub-modal: Agregar Especie */}
          {espModal&&(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:10000}} onClick={()=>setEspModal(false)}>
              <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:24,width:540,maxHeight:"85vh",overflowY:"auto"}}>
                <h3 style={{margin:"0 0 16px",color:"#1e293b"}}>🌿 Nueva Especie/Variedad</h3>
                {[["Especie","especie","text","Cerezo, Arándano, Ciruelo..."],["Variedad","variedad","text","Royal Dawn, Magenta..."]].map(([lbl,f,t,ph])=>(
                  <div key={f} style={{marginBottom:12}}>
                    <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>{lbl} <span style={{color:"#dc2626"}}>*</span></label>
                    <input type={t} value={espForm[f]||""} placeholder={ph} onChange={e=>setEspForm(p=>({...p,[f]:e.target.value}))}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                  </div>
                ))}
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Observaciones de la variedad</label>
                  <textarea value={espForm.observaciones||""} onChange={e=>setEspForm(p=>({...p,observaciones:e.target.value}))}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,minHeight:50,boxSizing:"border-box"}}/>
                </div>
                {/* Sección DHE */}
                <div style={{padding:12,background:"#fef3c7",borderRadius:8,border:"1px solid #fbbf24",marginBottom:12}}>
                  <div style={{fontSize:12,fontWeight:800,color:"#78350f",marginBottom:8}}>📋 DHE (Distinción, Homogeneidad y Estabilidad)</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:8}}>
                    <div>
                      <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Estado DHE</label>
                      <select value={espForm.dhe_estado||"No iniciado"} onChange={e=>setEspForm(p=>({...p,dhe_estado:e.target.value}))}
                        style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",background:"#fff"}}>
                        {ESTADOS_DHE.map(s=><option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Fecha aprobación</label>
                      <input type="date" value={espForm.dhe_fecha_aprob||""} onChange={e=>setEspForm(p=>({...p,dhe_fecha_aprob:e.target.value}))}
                        style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                    </div>
                  </div>
                  <div style={{marginBottom:8}}>
                    <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>📎 Doc. DHE (URL)</label>
                    <input value={espForm.dhe_doc||""} placeholder="https://..." onChange={e=>setEspForm(p=>({...p,dhe_doc:e.target.value}))}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Obs. DHE</label>
                    <input value={espForm.dhe_observaciones||""} onChange={e=>setEspForm(p=>({...p,dhe_observaciones:e.target.value}))}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                  <button onClick={()=>setEspModal(false)} style={{padding:"8px 16px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer"}}>Cancelar</button>
                  <button onClick={guardarEspecie} style={{padding:"8px 16px",borderRadius:8,background:"#7c3aed",border:"none",color:"#fff",cursor:"pointer",fontWeight:700}}>Guardar</button>
                </div>
              </div>
            </div>
          )}

          {/* Sub-modal: Agregar PBR */}
          {pbrModal&&(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:10000}} onClick={()=>setPbrModal(false)}>
              <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:24,width:540,maxHeight:"85vh",overflowY:"auto"}}>
                <h3 style={{margin:"0 0 16px",color:"#1e293b"}}>📜 Nuevo Registro PBR</h3>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Especie <span style={{color:"#dc2626"}}>*</span></label>
                  <select value={pbrForm.especie||""} onChange={e=>setPbrForm(p=>({...p,especie:e.target.value}))}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",background:"#fff"}}>
                    <option value="">— Seleccionar especie —</option>
                    {[...new Set(especies.map(e=>e.especie))].map(esp=><option key={esp} value={esp}>{esp}</option>)}
                  </select>
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>País de Inscripción <span style={{color:"#dc2626"}}>*</span></label>
                  <input value={pbrForm.pais||""} placeholder="Chile, Perú, México..." onChange={e=>setPbrForm(p=>({...p,pais:e.target.value}))}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Estado</label>
                  <select value={pbrForm.estado||"Pendiente"} onChange={e=>setPbrForm(p=>({...p,estado:e.target.value}))}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",background:"#fff"}}>
                    {ESTADOS_PBR.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div>
                    <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Fecha Solicitud</label>
                    <input type="date" value={pbrForm.f_solicitud||""} onChange={e=>setPbrForm(p=>({...p,f_solicitud:e.target.value}))}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Fecha Resolución</label>
                    <input type="date" value={pbrForm.f_resolucion||""} onChange={e=>setPbrForm(p=>({...p,f_resolucion:e.target.value}))}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                  </div>
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Doc. Solicitud (URL)</label>
                  <input value={pbrForm.doc_solicitud||""} onChange={e=>setPbrForm(p=>({...p,doc_solicitud:e.target.value}))}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Doc. Resolución (URL)</label>
                  <input value={pbrForm.doc_resolucion||""} onChange={e=>setPbrForm(p=>({...p,doc_resolucion:e.target.value}))}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Observaciones</label>
                  <textarea value={pbrForm.observaciones||""} onChange={e=>setPbrForm(p=>({...p,observaciones:e.target.value}))}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,minHeight:60,boxSizing:"border-box"}}/>
                </div>
                <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                  <button onClick={()=>setPbrModal(false)} style={{padding:"8px 16px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer"}}>Cancelar</button>
                  <button onClick={guardarPBR} style={{padding:"8px 16px",borderRadius:8,background:"#f59e0b",border:"none",color:"#fff",cursor:"pointer",fontWeight:700}}>Guardar PBR</button>
                </div>
              </div>
            </div>
          )}

          {/* Sub-modal: Agregar Anexo */}
          {anxModal&&(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:10000}} onClick={()=>setAnxModal(false)}>
              <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:24,width:480,maxHeight:"80vh",overflowY:"auto"}}>
                <h3 style={{margin:"0 0 16px",color:"#1e293b"}}>📎 Nuevo Anexo</h3>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Descripción <span style={{color:"#dc2626"}}>*</span></label>
                  <input value={anxForm.descripcion||""} placeholder="Adenda 2025, Carta compromiso..." onChange={e=>setAnxForm(p=>({...p,descripcion:e.target.value}))}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Fecha</label>
                  <input type="date" value={anxForm.fecha||""} onChange={e=>setAnxForm(p=>({...p,fecha:e.target.value}))}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Enlace (URL)</label>
                  <input value={anxForm.enlace||""} placeholder="https://..." onChange={e=>setAnxForm(p=>({...p,enlace:e.target.value}))}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Observaciones</label>
                  <textarea value={anxForm.observaciones||""} onChange={e=>setAnxForm(p=>({...p,observaciones:e.target.value}))}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,minHeight:60,boxSizing:"border-box"}}/>
                </div>
                <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                  <button onClick={()=>setAnxModal(false)} style={{padding:"8px 16px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer"}}>Cancelar</button>
                  <button onClick={guardarAnexo} style={{padding:"8px 16px",borderRadius:8,background:"#7c3aed",border:"none",color:"#fff",cursor:"pointer",fontWeight:700}}>Guardar</button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    // ── Vista lista de contratos obtentores ──
    const totVencidos = obtData.filter(o=>{const d=diasParaVencer(o.f_vencimiento);return d!==null && d<0;}).length;
    const totPorVencer = obtData.filter(o=>{const d=diasParaVencer(o.f_vencimiento);return d!==null && d>=0 && d<=90;}).length;
    return (
      <div style={{fontFamily:"sans-serif",background:"#0d1117",minHeight:"100vh",padding:"20px 20px 40px"}}>
        <NavBar breadcrumbItems={[
          {label:"Mediterra", onClick:onBack},
          {label:"Osiris Hub", onClick:()=>setSubApp(null)},
          {label:"Contratos Obtentores"},
        ]}/>

        {canVerObtentores&&!canObtentores&&(
          <div style={{background:"linear-gradient(135deg,#fef3c7,#fde68a)",border:"1px solid #f59e0b",
            borderRadius:10,padding:"10px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:20}}>👁</span>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:800,color:"#92400e"}}>Modo solo lectura</div>
              <div style={{fontSize:11,color:"#78350f"}}>
                {esConsulta
                  ? "Tu rol es de Consulta. Puedes visualizar y exportar a Excel, pero no modificar contratos obtentores."
                  : "Tienes permiso de \"Solo ver\" en Contratos Obtentores. Puedes visualizar y exportar pero no modificar."}
              </div>
            </div>
          </div>
        )}

        {/* KPIs */}
        <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:16}}>
          {[
            ["📊 Total contratos", obtData.length, "#7c3aed"],
            ["⚠️ Vencidos",          totVencidos,    "#dc2626"],
            ["⏳ Vencen ≤ 90 días", totPorVencer,  "#f59e0b"],
            ["🌿 Especies totales", obtData.reduce((s,o)=>s+(o.especies||[]).length,0), "#16a34a"],
            ["📜 PBR aprobados",    obtData.reduce((s,o)=>s+(o.pbr||[]).filter(p=>p.estado==="Aprobado").length,0), "#0f766e"],
          ].map(([l,v,c])=>(
            <div key={l} style={{background:"#21283b",border:"1px solid #30363d",borderLeft:`4px solid ${c}`,
              borderRadius:10,padding:"12px 16px",flex:1,minWidth:140}}>
              <div style={{fontSize:10,color:"#8b949e",fontWeight:600,marginBottom:4}}>{l}</div>
              <div style={{fontSize:20,fontWeight:900,color:c}}>{v}</div>
            </div>
          ))}
        </div>

        <div style={{background:"#fff",borderRadius:14,padding:20,boxShadow:"0 2px 10px #0001"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
            <h3 style={{margin:0,fontSize:18,color:"#1e293b"}}>🧬 Contratos Obtentores</h3>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button onClick={()=>{setShowEspeciesObt(p=>!p);setShowVariedadesObt(false);}}
                style={{background:showEspeciesObt?"#0d9488":"#f1f5f9",color:showEspeciesObt?"#fff":"#1e293b",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:12,fontWeight:600}}>
                🌳 Especies</button>
              <button onClick={()=>{setShowVariedadesObt(p=>!p);setShowEspeciesObt(false);}}
                style={{background:showVariedadesObt?"#0d9488":"#f1f5f9",color:showVariedadesObt?"#fff":"#1e293b",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:12,fontWeight:600}}>
                🌿 Variedades</button>
              <button onClick={()=>exportarObtentores(obtData)}
                style={{padding:"8px 16px",borderRadius:8,background:"#0f766e",border:"none",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>
                📥 Exportar Excel</button>
              {canObtentores&&<button onClick={()=>{setObtForm(EMPTY_OBT);setObtEditId(null);setObtWizStep(1);setObtWizEspForm(EMPTY_ESP_INLINE);setObtWizPbrForm(EMPTY_PBR_INLINE);setObtModal(true);}}
                style={{padding:"8px 16px",borderRadius:8,background:"#7c3aed",border:"none",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>
                + Nuevo Contrato</button>}
            </div>
          </div>
          {showEspeciesObt&&<MaestroEspecies especies={especiesMaestro} setEspecies={setEspeciesMaestro} can={canObtentores} obtentores={obtData} contratos={ctData} variedades={variedadesMaestro}/>}
          {showVariedadesObt&&<MaestroVariedades variedades={variedadesMaestro} setVariedades={setVariedadesMaestro} can={canObtentores} obtentores={obtData} especies={especiesMaestro} setEspecies={setEspeciesMaestro}/>}
          {obtData.length===0?<div style={{padding:40,textAlign:"center",color:"#94a3b8"}}>No hay contratos obtentores. {canObtentores?"Haz click en \"+ Nuevo Contrato\" para agregar.":""}</div>:(
            <div style={{display:"grid",gap:12}}>
              {obtData.map(o=>{
                const vig = estadoVigencia(o.f_vencimiento);
                const nEsp = (o.especies||[]).length;
                const nPbr = (o.pbr||[]).length;
                const firmado = o.firma_obtentor && o.firma_osiris;
                const venc = diasParaVencer(o.f_vencimiento);
                const isVencido = venc!==null && venc<0;
                return (
                  <div key={o.id} onClick={()=>{setObtDetalle(o.id);setObtTab("general");}}
                    style={{border:`1px solid ${isVencido?"#fca5a5":"#e2e8f0"}`,borderRadius:12,padding:"16px 20px",cursor:"pointer",
                      background:isVencido?"#fef2f2":"#fff",transition:"all 0.15s"}}
                    onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 12px #0002"}
                    onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                      <div>
                        <div style={{fontWeight:800,fontSize:15,color:"#1e293b"}}>🧬 {o.obtentor}</div>
                        <div style={{fontSize:11,color:"#64748b",marginTop:2}}>
                          {o.f_inicio&&`${o.f_inicio} → `}{o.f_vencimiento||"Sin vencimiento"}
                          <span style={{color:vig.color,marginLeft:8,fontWeight:700,background:vig.bg,padding:"2px 8px",borderRadius:10}}>{vig.icon} {vig.label}</span>
                        </div>
                      </div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        {firmado&&<span style={{fontSize:10,background:"rgba(34,197,94,0.15)",color:"#16a34a",padding:"3px 10px",borderRadius:20,fontWeight:700}}>✅ Firmado</span>}
                        {o.renovable&&<span style={{fontSize:10,background:"rgba(96,165,250,0.15)",color:"#3b82f6",padding:"3px 10px",borderRadius:20,fontWeight:700}}>🔄</span>}
                        <span style={{fontSize:10,background:"rgba(124,58,237,0.15)",color:"#7c3aed",padding:"3px 10px",borderRadius:20,fontWeight:700}}>{nEsp} esp.</span>
                        <span style={{fontSize:10,background:"rgba(251,191,36,0.15)",color:"#d97706",padding:"3px 10px",borderRadius:20,fontWeight:700}}>{nPbr} PBR</span>
                        {canObtentores&&<>
                          <button onClick={e=>{e.stopPropagation();setObtForm({...EMPTY_OBT,...o});setObtEditId(o.id);setObtWizStep(1);setObtWizEspForm(EMPTY_ESP_INLINE);setObtWizPbrForm(EMPTY_PBR_INLINE);setObtModal(true);}}
                            style={{background:"#f0f9ff",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11}}>✏️</button>
                          <button onClick={e=>{e.stopPropagation();eliminarObt(o.id);}}
                            style={{background:"#fef2f2",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11}}>🗑</button>
                        </>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Wizard: Nuevo/Editar Obtentor (3 pasos) */}
        {obtModal&&(()=>{
          const wizEspecies = obtForm.especies || [];
          const wizPbr      = obtForm.pbr      || [];

          const agregarEspWiz = () => {
            if(!obtWizEspForm.especie || !obtWizEspForm.variedad) {
              alert("Especie y Variedad son obligatorios."); return;
            }
            const nueva = {
              id:`esp_${Date.now()}`,
              especie:obtWizEspForm.especie.trim(),
              variedad:obtWizEspForm.variedad.trim(),
              observaciones:obtWizEspForm.observaciones||"",
              dhe_estado:obtWizEspForm.dhe_estado||"No iniciado",
              dhe_fecha_aprob:obtWizEspForm.dhe_fecha_aprob||"",
              dhe_doc:obtWizEspForm.dhe_doc||"",
              dhe_observaciones:obtWizEspForm.dhe_observaciones||"",
            };
            setObtForm(p=>({...p, especies:[...(p.especies||[]), nueva]}));
            setObtWizEspForm(EMPTY_ESP_INLINE);
          };
          const quitarEspWiz = (eid) => {
            // Verificar PBR vinculados al nombre de especie
            const espRemovida = wizEspecies.find(e=>e.id===eid);
            if(!espRemovida) return;
            const pbrVinc = wizPbr.filter(p=>p.especie === espRemovida.especie);
            if(pbrVinc.length>0) {
              if(!window.confirm(`Hay ${pbrVinc.length} registro(s) PBR vinculados a "${espRemovida.especie}". Si la eliminas, esos PBR quedarán huérfanos. ¿Continuar?`)) return;
            }
            setObtForm(p=>({...p, especies:(p.especies||[]).filter(e=>e.id!==eid)}));
          };

          const agregarPbrWiz = () => {
            if(!obtWizPbrForm.especie || !obtWizPbrForm.pais) {
              alert("Especie y País son obligatorios."); return;
            }
            if(obtWizPbrForm.f_solicitud && obtWizPbrForm.f_resolucion && new Date(obtWizPbrForm.f_resolucion) < new Date(obtWizPbrForm.f_solicitud)) {
              alert("La fecha de resolución no puede ser anterior a la fecha de solicitud."); return;
            }
            const nuevo = {id:`pbr_${Date.now()}`, ...obtWizPbrForm};
            setObtForm(p=>({...p, pbr:[...(p.pbr||[]), nuevo]}));
            setObtWizPbrForm(EMPTY_PBR_INLINE);
          };
          const quitarPbrWiz = (pid) => {
            setObtForm(p=>({...p, pbr:(p.pbr||[]).filter(x=>x.id!==pid)}));
          };

          // Estados visuales del stepper
          const Step = ({n, label, active, done}) => {
            const bg = active?"#7c3aed":done?"#16a34a":"#e2e8f0";
            const col = active||done?"#fff":"#94a3b8";
            return (
              <div style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0}}>
                <div style={{
                  width:28,height:28,borderRadius:"50%",
                  background:bg,color:col,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:13,fontWeight:800,flexShrink:0
                }}>{done?"✓":n}</div>
                <div style={{
                  fontSize:11,fontWeight:active?700:500,
                  color:active?"#1e293b":done?"#16a34a":"#94a3b8",
                  whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"
                }}>{label}</div>
              </div>
            );
          };

          const irPaso = (n) => {
            // Validar paso 1 antes de avanzar
            if(obtWizStep===1 && n>1 && !obtForm.obtentor) {
              alert("Nombre del obtentor es obligatorio para continuar."); return;
            }
            if(obtWizStep===1 && n>1 && obtForm.f_inicio && obtForm.f_vencimiento && new Date(obtForm.f_vencimiento) < new Date(obtForm.f_inicio)) {
              alert("La fecha de vencimiento no puede ser anterior a la fecha de inicio."); return;
            }
            setObtWizStep(n);
          };

          return (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}} onClick={()=>setObtModal(false)}>
            <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:24,width:680,maxHeight:"92vh",overflowY:"auto"}}>
              <h3 style={{margin:"0 0 18px",color:"#1e293b"}}>{obtEditId?"✏️ Editar":"➕ Nuevo"} Contrato Obtentor</h3>

              {/* Stepper */}
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20,padding:"12px 8px",background:"#f8fafc",borderRadius:10}}>
                <Step n={1} label="Cabecera"        active={obtWizStep===1} done={obtWizStep>1}/>
                <div style={{flex:"0 0 30px",height:2,background:obtWizStep>1?"#16a34a":"#e2e8f0"}}/>
                <Step n={2} label="Especies / DHE"  active={obtWizStep===2} done={obtWizStep>2}/>
                <div style={{flex:"0 0 30px",height:2,background:obtWizStep>2?"#16a34a":"#e2e8f0"}}/>
                <Step n={3} label="Registros PBR"   active={obtWizStep===3} done={false}/>
              </div>

              {/* PASO 1 — Cabecera */}
              {obtWizStep===1&&(<>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Nombre del Obtentor <span style={{color:"#dc2626"}}>*</span></label>
                  <input value={obtForm.obtentor||""} placeholder="Ej. SunWorld, IFG, Bloom Fresh..." onChange={e=>setObtForm(p=>({...p,obtentor:e.target.value}))}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div>
                    <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Fecha Inicio</label>
                    <input type="date" value={obtForm.f_inicio||""} onChange={e=>setObtForm(p=>({...p,f_inicio:e.target.value}))}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Fecha Vencimiento</label>
                    <input type="date" value={obtForm.f_vencimiento||""} onChange={e=>setObtForm(p=>({...p,f_vencimiento:e.target.value}))}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                  </div>
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Estado del Contrato</label>
                  <select value={obtForm.estado_contrato||"Borrador"} onChange={e=>setObtForm(p=>({...p,estado_contrato:e.target.value}))}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",background:"#fff"}}>
                    {ESTADOS_CONTRATO_OBT.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginBottom:12}}>
                  <input type="checkbox" checked={!!obtForm.renovable} onChange={e=>setObtForm(p=>({...p,renovable:e.target.checked}))}/>
                  <span style={{fontSize:12}}>Contrato renovable</span>
                </label>
                {obtForm.renovable&&(
                  <div style={{marginBottom:12}}>
                    <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>📆 Nueva Fecha Vencimiento</label>
                    <input type="date" value={obtForm.f_vencimiento_nueva||""} onChange={e=>setObtForm(p=>({...p,f_vencimiento_nueva:e.target.value}))}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #93c5fd",fontSize:13,boxSizing:"border-box",background:"#eff6ff"}}/>
                  </div>
                )}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12,padding:12,background:"#f8fafc",borderRadius:8}}>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
                    <input type="checkbox" checked={!!obtForm.firma_obtentor} onChange={e=>setObtForm(p=>({...p,firma_obtentor:e.target.checked}))}/>
                    <span style={{fontSize:12}}>✅ Firma Obtentor</span>
                  </label>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
                    <input type="checkbox" checked={!!obtForm.firma_osiris} onChange={e=>setObtForm(p=>({...p,firma_osiris:e.target.checked}))}/>
                    <span style={{fontSize:12}}>✅ Firma Osiris</span>
                  </label>
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>📎 Link al contrato (OneDrive/Drive)</label>
                  <input value={obtForm.doc_contrato||""} placeholder="https://..." onChange={e=>setObtForm(p=>({...p,doc_contrato:e.target.value}))}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>📄 Link doc. legal complementario</label>
                  <input value={obtForm.doc_legal||""} placeholder="https://..." onChange={e=>setObtForm(p=>({...p,doc_legal:e.target.value}))}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Observaciones</label>
                  <textarea value={obtForm.observaciones||""} onChange={e=>setObtForm(p=>({...p,observaciones:e.target.value}))}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,minHeight:60,boxSizing:"border-box"}}/>
                </div>
              </>)}

              {/* PASO 2 — Especies/Variedades + DHE */}
              {obtWizStep===2&&(<>
                <div style={{background:"#ede9fe",border:"1px solid #c4b5fd",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:11,color:"#5b21b6"}}>
                  💡 Agrega cada variedad cubierta por el contrato. Luego en el paso 3 podrás registrar PBR vinculados a estas variedades. <strong>Este paso es opcional</strong> — puedes saltarlo y agregar después desde la vista detalle.
                </div>

                {/* Lista de especies ya agregadas */}
                {wizEspecies.length>0&&(
                  <div style={{marginBottom:14,border:"1px solid #e2e8f0",borderRadius:10,overflow:"hidden"}}>
                    <div style={{background:"#f8fafc",padding:"8px 12px",fontSize:11,fontWeight:700,color:"#475569"}}>
                      Variedades agregadas ({wizEspecies.length})
                    </div>
                    {wizEspecies.map(e=>{
                      const dheCol = e.dhe_estado==="Aprobado"?"#16a34a":e.dhe_estado==="Rechazado"?"#dc2626":e.dhe_estado==="En proceso"?"#d97706":"#64748b";
                      return (
                        <div key={e.id} style={{padding:"10px 12px",borderTop:"1px solid #f1f5f9",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:13,fontWeight:700,color:"#1e293b"}}>🌿 {e.especie} — {e.variedad}</div>
                            <div style={{fontSize:10,color:"#64748b",marginTop:2}}>
                              <span style={{color:dheCol,fontWeight:700}}>DHE: {e.dhe_estado||"No iniciado"}</span>
                              {e.dhe_fecha_aprob&&` · Aprob. ${e.dhe_fecha_aprob}`}
                              {e.dhe_doc&&" · 📎 Doc"}
                            </div>
                          </div>
                          <button onClick={()=>quitarEspWiz(e.id)} style={{background:"#fef2f2",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,color:"#991b1b"}}>🗑</button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Form inline para agregar nueva especie */}
                <div style={{border:"1px dashed #c4b5fd",borderRadius:10,padding:14,background:"#faf5ff",marginBottom:12}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#5b21b6",marginBottom:10}}>+ Agregar nueva variedad</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                    <div>
                      <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>Especie <span style={{color:"#dc2626"}}>*</span></label>
                      <input value={obtWizEspForm.especie||""} placeholder="Cerezo, Arándano..." onChange={e=>setObtWizEspForm(p=>({...p,especie:e.target.value}))}
                        style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box"}}/>
                    </div>
                    <div>
                      <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>Variedad <span style={{color:"#dc2626"}}>*</span></label>
                      <input value={obtWizEspForm.variedad||""} placeholder="Royal Dawn..." onChange={e=>setObtWizEspForm(p=>({...p,variedad:e.target.value}))}
                        style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box"}}/>
                    </div>
                  </div>
                  <div style={{padding:10,background:"#fef3c7",borderRadius:6,marginBottom:8,fontSize:11,fontWeight:700,color:"#78350f"}}>📋 DHE (Distinción, Homogeneidad y Estabilidad)</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:8}}>
                    <div>
                      <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>Estado DHE</label>
                      <select value={obtWizEspForm.dhe_estado||"No iniciado"} onChange={e=>setObtWizEspForm(p=>({...p,dhe_estado:e.target.value}))}
                        style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box",background:"#fff"}}>
                        {ESTADOS_DHE.map(s=><option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>Fecha aprobación DHE</label>
                      <input type="date" value={obtWizEspForm.dhe_fecha_aprob||""} onChange={e=>setObtWizEspForm(p=>({...p,dhe_fecha_aprob:e.target.value}))}
                        style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box"}}/>
                    </div>
                  </div>
                  <div style={{marginBottom:8}}>
                    <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>📎 Doc. DHE (URL)</label>
                    <input value={obtWizEspForm.dhe_doc||""} placeholder="https://..." onChange={e=>setObtWizEspForm(p=>({...p,dhe_doc:e.target.value}))}
                      style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box"}}/>
                  </div>
                  <div style={{marginBottom:8}}>
                    <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>Obs. DHE / Variedad</label>
                    <input value={obtWizEspForm.dhe_observaciones||""} onChange={e=>setObtWizEspForm(p=>({...p,dhe_observaciones:e.target.value,observaciones:e.target.value}))}
                      style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box"}}/>
                  </div>
                  <button onClick={agregarEspWiz} style={{width:"100%",padding:"8px 14px",borderRadius:8,background:"#7c3aed",border:"none",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Agregar variedad a la lista</button>
                </div>
              </>)}

              {/* PASO 3 — Registros PBR */}
              {obtWizStep===3&&(<>
                <div style={{background:"#fef3c7",border:"1px solid #fbbf24",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:11,color:"#78350f"}}>
                  💡 Cada PBR es un registro de Protección de Obtenciones Vegetales en un país específico, vinculado a una de las variedades del contrato. <strong>Este paso es opcional</strong>.
                </div>

                {wizEspecies.length===0?(
                  <div style={{padding:30,textAlign:"center",color:"#94a3b8",border:"1px dashed #e2e8f0",borderRadius:10,marginBottom:12}}>
                    <div style={{fontSize:32,marginBottom:8}}>🌿</div>
                    <div style={{fontSize:12}}>Para registrar un PBR primero necesitas agregar al menos una variedad.</div>
                    <button onClick={()=>setObtWizStep(2)} style={{marginTop:10,padding:"6px 14px",borderRadius:8,background:"#7c3aed",border:"none",color:"#fff",cursor:"pointer",fontSize:11,fontWeight:700}}>← Volver al paso 2</button>
                  </div>
                ):(<>
                  {/* Lista de PBR ya agregados */}
                  {wizPbr.length>0&&(
                    <div style={{marginBottom:14,border:"1px solid #e2e8f0",borderRadius:10,overflow:"hidden"}}>
                      <div style={{background:"#f8fafc",padding:"8px 12px",fontSize:11,fontWeight:700,color:"#475569"}}>
                        PBR agregados ({wizPbr.length})
                      </div>
                      {wizPbr.map(p=>{
                        const stCol = p.estado==="Aprobado"?"#16a34a":p.estado==="Rechazado"?"#dc2626":p.estado==="En Revisión"?"#0284c7":p.estado==="Solicitado"?"#7c3aed":"#d97706";
                        return (
                          <div key={p.id} style={{padding:"10px 12px",borderTop:"1px solid #f1f5f9",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontSize:13,fontWeight:700,color:"#1e293b"}}>📜 {p.especie} — 🌍 {p.pais}</div>
                              <div style={{fontSize:10,color:"#64748b",marginTop:2}}>
                                <span style={{color:stCol,fontWeight:700}}>{p.estado}</span>
                                {p.f_solicitud&&` · Sol. ${p.f_solicitud}`}
                                {p.f_resolucion&&` · Res. ${p.f_resolucion}`}
                              </div>
                            </div>
                            <button onClick={()=>quitarPbrWiz(p.id)} style={{background:"#fef2f2",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,color:"#991b1b"}}>🗑</button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Form inline para agregar nuevo PBR */}
                  <div style={{border:"1px dashed #fbbf24",borderRadius:10,padding:14,background:"#fffbeb",marginBottom:12}}>
                    <div style={{fontSize:12,fontWeight:700,color:"#78350f",marginBottom:10}}>+ Agregar nuevo registro PBR</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                      <div>
                        <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>Especie <span style={{color:"#dc2626"}}>*</span></label>
                        <select value={obtWizPbrForm.especie||""} onChange={e=>setObtWizPbrForm(p=>({...p,especie:e.target.value}))}
                          style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box",background:"#fff"}}>
                          <option value="">— Seleccionar —</option>
                          {[...new Set(wizEspecies.map(e=>e.especie))].map(esp=><option key={esp} value={esp}>{esp}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>País <span style={{color:"#dc2626"}}>*</span></label>
                        <input value={obtWizPbrForm.pais||""} placeholder="Chile, Perú, México..." onChange={e=>setObtWizPbrForm(p=>({...p,pais:e.target.value}))}
                          style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box"}}/>
                      </div>
                    </div>
                    <div style={{marginBottom:10}}>
                      <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>Estado PBR</label>
                      <select value={obtWizPbrForm.estado||"Pendiente"} onChange={e=>setObtWizPbrForm(p=>({...p,estado:e.target.value}))}
                        style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box",background:"#fff"}}>
                        {ESTADOS_PBR.map(s=><option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                      <div>
                        <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>Fecha Solicitud</label>
                        <input type="date" value={obtWizPbrForm.f_solicitud||""} onChange={e=>setObtWizPbrForm(p=>({...p,f_solicitud:e.target.value}))}
                          style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box"}}/>
                      </div>
                      <div>
                        <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>Fecha Resolución</label>
                        <input type="date" value={obtWizPbrForm.f_resolucion||""} onChange={e=>setObtWizPbrForm(p=>({...p,f_resolucion:e.target.value}))}
                          style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box"}}/>
                      </div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                      <div>
                        <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>📎 Doc. Solicitud (URL)</label>
                        <input value={obtWizPbrForm.doc_solicitud||""} placeholder="https://..." onChange={e=>setObtWizPbrForm(p=>({...p,doc_solicitud:e.target.value}))}
                          style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box"}}/>
                      </div>
                      <div>
                        <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>📎 Doc. Resolución (URL)</label>
                        <input value={obtWizPbrForm.doc_resolucion||""} placeholder="https://..." onChange={e=>setObtWizPbrForm(p=>({...p,doc_resolucion:e.target.value}))}
                          style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box"}}/>
                      </div>
                    </div>
                    <div style={{marginBottom:10}}>
                      <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>Observaciones</label>
                      <input value={obtWizPbrForm.observaciones||""} onChange={e=>setObtWizPbrForm(p=>({...p,observaciones:e.target.value}))}
                        style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box"}}/>
                    </div>
                    <button onClick={agregarPbrWiz} style={{width:"100%",padding:"8px 14px",borderRadius:8,background:"#f59e0b",border:"none",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Agregar PBR a la lista</button>
                  </div>
                </>)}
              </>)}

              {/* Footer wizard: navegación */}
              <div style={{display:"flex",gap:8,justifyContent:"space-between",alignItems:"center",marginTop:18,paddingTop:14,borderTop:"1px solid #e2e8f0"}}>
                <button onClick={()=>setObtModal(false)} style={{padding:"8px 16px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:12}}>Cancelar</button>
                <div style={{display:"flex",gap:8}}>
                  {obtWizStep>1&&<button onClick={()=>setObtWizStep(obtWizStep-1)} style={{padding:"8px 16px",borderRadius:8,border:"1px solid #d1d5db",background:"#f8fafc",cursor:"pointer",fontSize:12,fontWeight:600}}>← Anterior</button>}
                  {obtWizStep<3&&<button onClick={()=>irPaso(obtWizStep+1)} style={{padding:"8px 16px",borderRadius:8,background:"#7c3aed",border:"none",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>Siguiente →</button>}
                  {obtWizStep===3&&<button onClick={guardarObt} style={{padding:"8px 18px",borderRadius:8,background:"#16a34a",border:"none",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:700}}>{obtEditId?"💾 Guardar cambios":"✅ Crear contrato"}</button>}
                </div>
              </div>
            </div>
          </div>
          );
        })()}

      </div>
    );
  }

  // ── OPERACIÓN TÉCNICA ─────────────────────────────────────
  if(subApp==="opTecnica") {
    const opData = osirisData?.opTecnica || {};
    const canOp = esEditorOAdmin; // usar mismos permisos base
    return (
      <div style={{fontFamily:"'IBM Plex Sans',system-ui,sans-serif",minHeight:"100vh",
        background:"linear-gradient(160deg,#0d1117,#161b22)",color:"#e6edf3",padding:20}}>
        <div style={{maxWidth:1300,margin:"0 auto"}}>
          {/* Header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:12}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <button onClick={()=>setSubApp(null)}
                style={{background:"#21283b",border:"1px solid #30363d",borderRadius:8,padding:"8px 14px",cursor:"pointer",color:"#e6edf3",fontSize:13,fontWeight:700}}>
                ← Hub Osiris
              </button>
              <div>
                <div style={{fontSize:22,fontWeight:900,color:"#e6edf3"}}>🔬 Operación Técnica</div>
                <div style={{fontSize:11,color:"#8b949e"}}>Visitas · Informes · Test Blocks · Equipo · Medidas Correctivas · Entregables</div>
              </div>
            </div>
          </div>
          <OperacionTecnica
            data={opData}
            setData={val => {
              if(typeof val === "function") setOpTecnica(val);
              else setOpTecnica(val);
            }}
            ctData={ctData}
            viverosData={Array.isArray(osirisData?.viveros)?osirisData.viveros:[]}
            obtentoresData={obtentoresData}
            can={canOp}
            usuarioActual={usuarioActual}
          />
        </div>
      </div>
    );
  }

  // ── CONTRATOS VIVEROS ──────────────────────────────────────
  if(subApp==="viveros") {
    // Migración suave: si llegan datos en formato plano viejo (con especie/variedad/fee_usd a nivel raíz),
    // los convertimos a estructura jerárquica al vuelo (sin alterar Supabase hasta que el usuario edite).
    const vivDataRaw = Array.isArray(osirisData?.viveros) ? osirisData.viveros : [];
    const vivData = vivDataRaw.map(v=>{
      // Si ya tiene array variedades, está migrado
      if(Array.isArray(v.variedades)) return v;
      // Migrar formato plano antiguo
      const variedades = (v.especie || v.variedad)
        ? [{id:`vv_${v.id||Date.now()}`, especie:v.especie||"", variedad:v.variedad||"",
            fee_usd:parseFloat(v.fee_usd)||0, fee_pct:parseFloat(v.fee_pct)||0, observaciones:""}]
        : [];
      return {
        id:v.id, viverista:v.viverista||"", pais:v.pais||"",
        f_contrato:v.f_contrato||"", f_vencimiento:v.f_vencimiento||"",
        estado_contrato:v.estado_contrato||"Borrador",
        renovable:!!v.renovable, firma_viverista:!!v.firma_viverista, firma_osiris:!!v.firma_osiris,
        doc_legal:v.doc_legal||"", doc_contrato:v.doc_contrato||"",
        mes_pago_estimado:v.mes_pago_estimado||"", forma_pago:v.forma_pago||"",
        observaciones:v.observaciones||"",
        variedades, anexos:v.anexos||[], ordenesCompra:v.ordenesCompra||[],
      };
    });
    const setViv = (list) => setOsirisData(prev=>({...prev, viveros: list}));

    const guardarViv = () => {
      if(!canViveros) return;
      if(!vivForm.viverista) { alert("Viverista es obligatorio"); return; }
      if(vivForm.f_contrato && vivForm.f_vencimiento && new Date(vivForm.f_vencimiento) < new Date(vivForm.f_contrato)) {
        alert("La fecha de vencimiento no puede ser anterior a la fecha de contrato."); return;
      }
      const id = vivEditId || `viv_${Date.now()}`;
      const existing = vivEditId ? vivData.find(v=>v.id===vivEditId) : null;
      const item = {...(existing||{}), ...vivForm, id};
      // Asegurar arrays
      item.variedades    = item.variedades    || [];
      item.anexos        = item.anexos        || [];
      item.ordenesCompra = item.ordenesCompra || [];
      const next = vivEditId ? vivData.map(v=>v.id===vivEditId?item:v) : [...vivData, item];
      setViv(next);
      // Resumen para auditoría
      const totCuotas = item.ordenesCompra.reduce((s,o)=>s+(o.cuotas||[]).length,0);
      const extras = [];
      if(item.variedades.length>0)    extras.push(`${item.variedades.length} variedad${item.variedades.length>1?"es":""}`);
      if(item.anexos.length>0)        extras.push(`${item.anexos.length} anexo${item.anexos.length>1?"s":""}`);
      if(item.ordenesCompra.length>0) extras.push(`${item.ordenesCompra.length} OC`);
      if(totCuotas>0)                 extras.push(`${totCuotas} cuota${totCuotas>1?"s":""}`);
      const extraStr = extras.length ? ` · ${extras.join(", ")}` : "";
      window.auditLog && window.auditLog(vivEditId?"editar":"crear", {modulo:"osiris", seccion:"Contratos Viveros",
        descripcion:`${vivEditId?"Editó":"Creó"} contrato vivero "${item.viverista}"${item.pais?` · ${item.pais}`:""}${item.f_vencimiento?` · vence ${item.f_vencimiento}`:""}${extraStr}`});
      setVivModal(false);
      setVivEditId(null);
      setVivWizStep(1);
      setVivWizVvForm(EMPTY_VV_INLINE);
      setVivWizAnxForm(EMPTY_VANX_INLINE);
      setVivWizOcForm(EMPTY_OC_INLINE);
      setVivWizCuotaForm(EMPTY_CUOTA_INLINE);
      setVivWizOcExpandido(null);
    };

    const updateVivero = (id, updates) => {
      if(!canViveros) return;
      const before = vivData.find(v=>v.id===id);
      setViv(vivData.map(v=>v.id===id?{...v,...updates}:v));
      const campo = Object.keys(updates).join(", ");
      window.auditLog && window.auditLog("editar", {modulo:"osiris", seccion:"Contratos Viveros",
        descripcion:`Editó vivero "${before?.viverista||""}": campo ${campo}`});
    };

    const eliminarViv = (id) => {
      if(!canViveros) return;
      const v = vivData.find(x=>x.id===id);
      if(!v) return;
      if(!window.confirm(`¿Eliminar vivero "${v.viverista}"?\n\nIncluye ${(v.variedades||[]).length} variedades autorizadas y ${(v.anexos||[]).length} anexos.`)) return;
      setViv(vivData.filter(x=>x.id!==id));
      window.auditLog && window.auditLog("eliminar", {modulo:"osiris", seccion:"Contratos Viveros",
        descripcion:`Eliminó vivero "${v.viverista}"`});
    };

    const viveroActivo = vivDetalle ? vivData.find(v=>v.id===vivDetalle) : null;

    const guardarVariedad = () => {
      if(!canViveros) return;
      if(!vvForm.especie || !vvForm.variedad) { alert("Especie y Variedad son obligatorias."); return; }
      const v = viveroActivo;
      const nueva = {id:`vv_${Date.now()}`, especie:vvForm.especie.trim(), variedad:vvForm.variedad.trim(),
        fee_usd:parseFloat(vvForm.fee_usd)||0, fee_pct:parseFloat(vvForm.fee_pct)||0, observaciones:vvForm.observaciones||""};
      updateVivero(v.id, {variedades:[...(v.variedades||[]), nueva]});
      setVvForm({especie:"",variedad:"",fee_usd:"",fee_pct:"",observaciones:""});
      setVvModal(false);
    };

    const guardarVAnexo = () => {
      if(!canViveros) return;
      if(!vAnxForm.descripcion) { alert("Descripción del anexo es obligatoria."); return; }
      const v = viveroActivo;
      const nuevo = {id:`vanx_${Date.now()}`, ...vAnxForm};
      updateVivero(v.id, {anexos:[...(v.anexos||[]), nuevo]});
      setVAnxForm({descripcion:"",fecha:"",enlace:"",observaciones:""});
      setVAnxModal(false);
    };

    // ── Vista detalle de un vivero ──
    if(viveroActivo) {
      const v = viveroActivo;
      const variedades = v.variedades || [];
      const anexos = v.anexos || [];

      const delVariedad = (vid) => {
        if(!canViveros) return;
        if(!window.confirm("¿Eliminar variedad autorizada?")) return;
        updateVivero(v.id, {variedades:variedades.filter(x=>x.id!==vid)});
      };
      const updateVariedad = (vid, updates) => {
        if(!canViveros) return;
        updateVivero(v.id, {variedades:variedades.map(x=>x.id===vid?{...x,...updates}:x)});
      };
      const updateVAnexo = (aid, updates) => {
        if(!canViveros) return;
        updateVivero(v.id, {anexos:anexos.map(a=>a.id===aid?{...a,...updates}:a)});
      };
      const delVAnexo = (aid) => {
        if(!canViveros) return;
        if(!window.confirm("¿Eliminar anexo?")) return;
        updateVivero(v.id, {anexos:anexos.filter(a=>a.id!==aid)});
      };

      // ── Órdenes de Compra: handlers ──
      const ordenesCompra = v.ordenesCompra || [];
      const ocActiva = ocDetalle ? ordenesCompra.find(o=>o.id===ocDetalle) : null;

      const calcFeeTotal = (cant, fee) => {
        const c = parseFloat(cant)||0;
        const f = parseFloat(fee)||0;
        return Math.round(c*f*100)/100;
      };

      const guardarOC = () => {
        if(!canViveros) return;
        if(!ocForm.n_oc || !ocForm.cliente_id || !ocForm.variedad_id) {
          alert("N° OC, Cliente y Variedad son obligatorios."); return;
        }
        const cli = clientes.find(c=>c.id===ocForm.cliente_id);
        const variedadSel = variedades.find(x=>x.id===ocForm.variedad_id);
        const cantidad = parseFloat(ocForm.cantidad_plantas)||0;
        const fee = parseFloat(ocForm.fee_usd_planta)||0;
        const id = ocEditId || `oc_${Date.now()}`;
        const item = {
          ...ocForm, id,
          cliente_nombre: cli?.razonSocial || ocForm.cliente_nombre || "",
          especie: variedadSel?.especie || "",
          variedad: variedadSel?.variedad || "",
          cantidad_plantas: cantidad,
          hectareas: parseFloat(ocForm.hectareas)||0,
          fee_usd_planta: fee,
          fee_total_usd: calcFeeTotal(cantidad, fee),
          cuotas: ocForm.cuotas || [],
        };
        const next = ocEditId
          ? ordenesCompra.map(o=>o.id===ocEditId?item:o)
          : [...ordenesCompra, item];
        updateVivero(v.id, {ordenesCompra: next});
        window.auditLog && window.auditLog(ocEditId?"editar":"crear", {modulo:"osiris", seccion:"OC Vivero",
          descripcion:`${ocEditId?"Editó":"Creó"} OC ${item.n_oc} de ${item.cliente_nombre} en vivero "${v.viverista}" · ${item.cantidad_plantas} plantas × $${item.fee_usd_planta} = $${item.fee_total_usd}`});
        setOcModal(false);
        setOcEditId(null);
        setOcForm(EMPTY_OC);
      };

      const eliminarOC = (oid) => {
        if(!canViveros) return;
        const oc = ordenesCompra.find(o=>o.id===oid);
        if(!oc) return;
        if(!window.confirm(`¿Eliminar OC ${oc.n_oc} de ${oc.cliente_nombre}?\n\nIncluye ${(oc.cuotas||[]).length} cuotas asociadas.`)) return;
        updateVivero(v.id, {ordenesCompra: ordenesCompra.filter(o=>o.id!==oid)});
        if(ocDetalle===oid) setOcDetalle(null);
        window.auditLog && window.auditLog("eliminar", {modulo:"osiris", seccion:"OC Vivero",
          descripcion:`Eliminó OC ${oc.n_oc} de ${oc.cliente_nombre} en vivero "${v.viverista}"`});
      };

      const iniciarEdicionOC = (oc) => {
        setOcForm({
          n_oc: oc.n_oc||"", fecha_oc: oc.fecha_oc||"",
          cliente_id: oc.cliente_id||"", cliente_nombre: oc.cliente_nombre||"",
          variedad_id: oc.variedad_id||"", especie: oc.especie||"", variedad: oc.variedad||"",
          cantidad_plantas: oc.cantidad_plantas||"", hectareas: oc.hectareas||"",
          fee_usd_planta: oc.fee_usd_planta||"", fee_total_usd: oc.fee_total_usd||0,
          estado_oc: oc.estado_oc||"Borrador", observaciones: oc.observaciones||"",
          cuotas: oc.cuotas||[],
        });
        setOcEditId(oc.id);
        setOcModal(true);
      };

      // Heredar fee al cambiar variedad seleccionada
      const seleccionarVariedadOC = (vid) => {
        const variedadSel = variedades.find(x=>x.id===vid);
        if(!variedadSel) { setOcForm(p=>({...p, variedad_id:""})); return; }
        setOcForm(p=>({
          ...p,
          variedad_id: vid,
          especie: variedadSel.especie||"",
          variedad: variedadSel.variedad||"",
          // Hereda fee solo si está vacío en el form actual
          fee_usd_planta: p.fee_usd_planta || variedadSel.fee_usd || "",
        }));
      };

      // Cuotas
      const guardarCuota = () => {
        if(!canViveros) return;
        if(!cuotaForm.fecha || !cuotaForm.monto_usd) { alert("Fecha y Monto son obligatorios."); return; }
        const id = cuotaEditId || `cuo_${Date.now()}`;
        const cuotaItem = {
          id,
          fecha: cuotaForm.fecha,
          monto_usd: parseFloat(cuotaForm.monto_usd)||0,
          pagado: !!cuotaForm.pagado,
          fecha_pago: cuotaForm.fecha_pago||"",
          n_factura: cuotaForm.n_factura||"",
          observaciones: cuotaForm.observaciones||"",
        };
        const cuotasNew = cuotaEditId
          ? (ocActiva?.cuotas||[]).map(c=>c.id===cuotaEditId?cuotaItem:c)
          : [...(ocActiva?.cuotas||[]), cuotaItem];
        // Ordenar por fecha
        cuotasNew.sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha)));
        const ocsNew = ordenesCompra.map(o=>o.id===ocActiva.id?{...o, cuotas: cuotasNew}:o);
        updateVivero(v.id, {ordenesCompra: ocsNew});
        window.auditLog && window.auditLog(cuotaEditId?"editar":"crear", {modulo:"osiris", seccion:"Cuotas OC Vivero",
          descripcion:`${cuotaEditId?"Editó":"Creó"} cuota ${cuotaItem.fecha} por $${cuotaItem.monto_usd} en OC ${ocActiva.n_oc}`});
        setCuotaModal(false);
        setCuotaEditId(null);
        setCuotaForm({fecha:"",monto_usd:"",pagado:false,fecha_pago:"",n_factura:"",observaciones:""});
      };

      const eliminarCuota = (cid) => {
        if(!canViveros) return;
        if(!window.confirm("¿Eliminar esta cuota?")) return;
        const cuotasNew = (ocActiva?.cuotas||[]).filter(c=>c.id!==cid);
        const ocsNew = ordenesCompra.map(o=>o.id===ocActiva.id?{...o, cuotas: cuotasNew}:o);
        updateVivero(v.id, {ordenesCompra: ocsNew});
        window.auditLog && window.auditLog("eliminar", {modulo:"osiris", seccion:"Cuotas OC Vivero",
          descripcion:`Eliminó cuota de OC ${ocActiva.n_oc}`});
      };

      const togglePagadoCuota = (cid) => {
        if(!canViveros) return;
        const cuota = (ocActiva?.cuotas||[]).find(c=>c.id===cid);
        if(!cuota) return;
        let fp = cuota.fecha_pago;
        if(!cuota.pagado){
          const nueva = prompt("Fecha de pago (YYYY-MM-DD):", new Date().toISOString().slice(0,10));
          if(!nueva) return;
          fp = nueva;
        } else {
          fp = "";
        }
        const cuotasNew = (ocActiva?.cuotas||[]).map(c=>c.id===cid?{...c, pagado:!c.pagado, fecha_pago:fp}:c);
        const ocsNew = ordenesCompra.map(o=>o.id===ocActiva.id?{...o, cuotas: cuotasNew}:o);
        updateVivero(v.id, {ordenesCompra: ocsNew});
      };

      const TABS_VIV = [{id:"general",label:"📋 General"},{id:"variedades",label:"🌱 Variedades Autorizadas"},{id:"oc",label:`📦 Órdenes de Compra (${ordenesCompra.length})`},{id:"legal",label:"⚖️ Legal/Firmas"},{id:"anexos",label:"📎 Anexos"}];
      const vig = estadoVigencia(v.f_vencimiento);

      return (
        <div style={{fontFamily:"sans-serif",background:"#0d1117",minHeight:"100vh",padding:"20px 20px 40px"}}>
          <NavBar breadcrumbItems={[
            {label:"Mediterra", onClick:onBack},
            {label:"Osiris Hub", onClick:()=>{setSubApp(null);setVivDetalle(null);}},
            {label:"Contratos Viveros", onClick:()=>setVivDetalle(null)},
            {label:v.viverista},
          ]}/>
          {canVerViveros&&!canViveros&&(
            <div style={{background:"linear-gradient(135deg,#fef3c7,#fde68a)",border:"1px solid #f59e0b",
              borderRadius:10,padding:"10px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:20}}>👁</span>
              <div style={{flex:1}}>
                <div style={{fontSize:12,fontWeight:800,color:"#92400e"}}>Modo solo lectura</div>
                <div style={{fontSize:11,color:"#78350f"}}>
                  {esConsulta
                    ? "Tu rol es de Consulta. Puedes visualizar y exportar pero no modificar contratos viveros."
                    : "Tienes permiso de \"Solo ver\" en Contratos Viveros."}
                </div>
              </div>
            </div>
          )}
          {/* Header vivero */}
          <div style={{background:"linear-gradient(135deg,#14532d,#16a34a22)",borderRadius:14,padding:"20px 24px",marginBottom:16,border:"1px solid #16a34a44"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
              <div>
                <div style={{fontSize:20,fontWeight:900,color:"#e6edf3"}}>🌱 {v.viverista}</div>
                <div style={{fontSize:11,color:"#8b949e",marginTop:4}}>
                  {v.pais&&`🌍 ${v.pais}`} {v.f_contrato&&` · Contrato ${v.f_contrato}`} {v.f_vencimiento&&` · Vence ${v.f_vencimiento}`}
                  {v.renovable&&v.f_vencimiento_nueva&&<span style={{color:"#60a5fa",marginLeft:6,fontWeight:700}}>🔄 Nueva: {v.f_vencimiento_nueva}</span>}
                  <span style={{color:vig.color,marginLeft:8,fontWeight:700}}>{vig.icon} {vig.label}</span>
                  {v.doc_contrato&&<a href={v.doc_contrato} target="_blank" rel="noopener noreferrer" style={{marginLeft:10,color:"#86efac",fontWeight:700,textDecoration:"none"}}>📄 Abrir contrato</a>}
                </div>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {v.estado_contrato&&<span style={{fontSize:10,background:"rgba(22,163,74,0.25)",color:"#86efac",padding:"4px 10px",borderRadius:20,fontWeight:700,border:"1px solid #16a34a44"}}>📋 {v.estado_contrato}</span>}
                {v.firma_viverista&&<span style={{fontSize:10,background:"rgba(34,197,94,0.2)",color:"#4ade80",padding:"4px 10px",borderRadius:20,fontWeight:700}}>✅ Firma Viverista</span>}
                {v.firma_osiris&&<span style={{fontSize:10,background:"rgba(34,197,94,0.2)",color:"#4ade80",padding:"4px 10px",borderRadius:20,fontWeight:700}}>✅ Firma Osiris</span>}
                {v.renovable&&<span style={{fontSize:10,background:"rgba(96,165,250,0.2)",color:"#93c5fd",padding:"4px 10px",borderRadius:20,fontWeight:700}}>🔄 Renovable</span>}
                <span style={{fontSize:10,background:"rgba(22,163,74,0.2)",color:"#4ade80",padding:"4px 10px",borderRadius:20,fontWeight:700}}>🌱 {variedades.length} variedades</span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
            {TABS_VIV.map(t=>(
              <button key={t.id} onClick={()=>setVivTab(t.id)}
                style={{padding:"8px 16px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:vivTab===t.id?700:500,fontSize:12,
                  background:vivTab===t.id?"#16a34a":"#21283b",color:vivTab===t.id?"#fff":"#8b949e"}}>
                {t.label}
              </button>
            ))}
          </div>

          <div style={{background:"#fff",borderRadius:14,padding:20,boxShadow:"0 2px 10px #0001"}}>
            {/* TAB GENERAL */}
            {vivTab==="general"&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                {[["Viverista","viverista","text"],["País","pais","text"],["Fecha Contrato","f_contrato","date"],["Fecha Vencimiento","f_vencimiento","date"]].map(([lbl,f,t])=>(
                  <div key={f}>
                    <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>{lbl}</label>
                    <input type={t} disabled={!canViveros} value={v[f]||""} onChange={e=>updateVivero(v.id,{[f]:e.target.value})}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",background:canViveros?"#fff":"#f8fafc"}}/>
                  </div>
                ))}
                <div>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Forma de pago a Osiris</label>
                  <select disabled={!canViveros} value={v.forma_pago||""} onChange={e=>updateVivero(v.id,{forma_pago:e.target.value})}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",background:canViveros?"#fff":"#f8fafc"}}>
                    <option value="">— Seleccionar —</option>
                    {FORMAS_PAGO.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Mes estimado de pago</label>
                  <select disabled={!canViveros} value={v.mes_pago_estimado||""} onChange={e=>updateVivero(v.id,{mes_pago_estimado:e.target.value})}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",background:canViveros?"#fff":"#f8fafc"}}>
                    <option value="">— Seleccionar —</option>
                    {MESES.map(m=><option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Estado del Contrato</label>
                  <select disabled={!canViveros} value={v.estado_contrato||"Borrador"} onChange={e=>updateVivero(v.id,{estado_contrato:e.target.value})}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",background:canViveros?"#fff":"#f8fafc"}}>
                    {ESTADOS_CONTRATO_OBT.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div style={{gridColumn:"1/-1"}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>📎 Link al contrato (OneDrive/Drive)</label>
                  <input disabled={!canViveros} value={v.doc_contrato||""} placeholder="https://..." onChange={e=>updateVivero(v.id,{doc_contrato:e.target.value})}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",background:canViveros?"#fff":"#f8fafc"}}/>
                  {v.doc_contrato&&<a href={v.doc_contrato} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:"#16a34a",marginTop:6,display:"inline-block",fontWeight:700}}>📄 Abrir contrato</a>}
                </div>
                <div>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"flex",alignItems:"center",gap:8,cursor:canViveros?"pointer":"default"}}>
                    <input type="checkbox" disabled={!canViveros} checked={!!v.renovable} onChange={e=>updateVivero(v.id,{renovable:e.target.checked})}/>
                    Contrato renovable
                  </label>
                </div>
                <div style={{gridColumn:"1/-1"}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Observaciones</label>
                  <textarea disabled={!canViveros} value={v.observaciones||""} onChange={e=>updateVivero(v.id,{observaciones:e.target.value})}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,minHeight:80,boxSizing:"border-box",background:canViveros?"#fff":"#f8fafc"}}/>
                </div>
              </div>
            )}

            {/* TAB VARIEDADES AUTORIZADAS */}
            {vivTab==="variedades"&&(
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontWeight:700,color:"#1e293b"}}>🌱 Variedades Autorizadas a Producir</div>
                  {canViveros&&<button onClick={()=>{setVvForm({especie:"",variedad:"",fee_usd:"",fee_pct:"",observaciones:""});setVvModal(true);}} style={{padding:"6px 14px",borderRadius:8,background:"#16a34a",border:"none",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Agregar Variedad</button>}
                </div>
                {variedades.length===0?<div style={{padding:30,textAlign:"center",color:"#94a3b8"}}>No hay variedades registradas.</div>:(
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead><tr style={{background:"#f8fafc"}}>
                      {["Especie","Variedad","Fee USD/planta","Fee % s/venta","Observaciones",""].map(h=><th key={h} style={{padding:"8px 12px",textAlign:["Fee USD/planta","Fee % s/venta"].includes(h)?"right":"left",fontWeight:700,fontSize:10,color:"#64748b",borderBottom:"2px solid #e2e8f0"}}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {variedades.map(x=>(
                        <tr key={x.id} style={{borderBottom:"1px solid #f1f5f9"}}>
                          <td style={{padding:"8px 12px",fontWeight:600}}>{x.especie}</td>
                          <td style={{padding:"8px 12px"}}>{x.variedad}</td>
                          <td style={{padding:"8px 12px",textAlign:"right"}}>
                            <input type="number" disabled={!canViveros} value={x.fee_usd||0} onChange={ev=>updateVariedad(x.id,{fee_usd:parseFloat(ev.target.value)||0})}
                              style={{width:90,padding:"4px 8px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:12,textAlign:"right",background:canViveros?"#fff":"#f8fafc"}}/>
                          </td>
                          <td style={{padding:"8px 12px",textAlign:"right"}}>
                            <input type="number" disabled={!canViveros} value={x.fee_pct||0} onChange={ev=>updateVariedad(x.id,{fee_pct:parseFloat(ev.target.value)||0})}
                              style={{width:70,padding:"4px 8px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:12,textAlign:"right",background:canViveros?"#fff":"#f8fafc"}}/>
                          </td>
                          <td style={{padding:"8px 12px"}}>
                            <input disabled={!canViveros} value={x.observaciones||""} onChange={ev=>updateVariedad(x.id,{observaciones:ev.target.value})}
                              style={{width:"100%",padding:"4px 8px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:12,background:canViveros?"#fff":"#f8fafc"}} placeholder="Notas..."/>
                          </td>
                          <td style={{padding:"8px 12px"}}>
                            {canViveros&&<button onClick={()=>delVariedad(x.id)} style={{background:"#fef2f2",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11}}>🗑</button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* TAB ÓRDENES DE COMPRA */}
            {vivTab==="oc"&&(
              <div>
                {/* Vista lista de OCs */}
                {!ocActiva && (<>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
                    <div style={{fontWeight:700,color:"#1e293b"}}>📦 Órdenes de Compra de Clientes</div>
                    {canViveros&&<button onClick={()=>{
                      if(variedades.length===0){alert("Primero debes agregar al menos una variedad autorizada en la pestaña Variedades.");return;}
                      if(clientes.length===0){alert("No hay clientes en el Maestro de Clientes Osiris.");return;}
                      setOcForm({...EMPTY_OC, fecha_oc: new Date().toISOString().slice(0,10)});
                      setOcEditId(null);
                      setOcModal(true);
                    }} style={{padding:"6px 14px",borderRadius:8,background:"#2563eb",border:"none",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Nueva OC</button>}
                  </div>
                  <div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:11,color:"#1e3a8a"}}>
                    💡 Cada OC representa una orden del cliente productor-exportador al viverista. El fee a Osiris se hereda de la variedad pero puedes editarlo. Cada OC tiene sus propias cuotas de pago.
                  </div>
                  {/* KPIs de OC */}
                  {ordenesCompra.length>0&&(
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8,marginBottom:14}}>
                      {(()=>{
                        const totFee = ordenesCompra.reduce((s,o)=>s+(parseFloat(o.fee_total_usd)||0),0);
                        const totPagado = ordenesCompra.reduce((s,o)=>s+((o.cuotas||[]).filter(c=>c.pagado).reduce((ss,c)=>ss+(parseFloat(c.monto_usd)||0),0)),0);
                        const totPlantas = ordenesCompra.reduce((s,o)=>s+(parseFloat(o.cantidad_plantas)||0),0);
                        const totHa = ordenesCompra.reduce((s,o)=>s+(parseFloat(o.hectareas)||0),0);
                        return [
                          ["📦 Total OC", ordenesCompra.length, "#2563eb"],
                          ["🌱 Plantas", totPlantas.toLocaleString("es-CL"), "#16a34a"],
                          ["📐 Há", totHa.toLocaleString("es-CL",{maximumFractionDigits:1}), "#0f766e"],
                          ["💰 Fee total", $$(totFee), "#7c3aed"],
                          ["✅ Cobrado", $$(totPagado), "#16a34a"],
                          ["⏳ Por cobrar", $$(totFee-totPagado), "#f59e0b"],
                        ].map(([l,vv,c])=>(
                          <div key={l} style={{background:"#fff",border:"1px solid #e2e8f0",borderLeft:`4px solid ${c}`,borderRadius:8,padding:"8px 12px"}}>
                            <div style={{fontSize:9,color:"#64748b",fontWeight:600,marginBottom:2}}>{l}</div>
                            <div style={{fontSize:14,fontWeight:800,color:c}}>{vv}</div>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                  {ordenesCompra.length===0?<div style={{padding:30,textAlign:"center",color:"#94a3b8"}}>No hay OC registradas. {canViveros?"Crea una con \"+ Nueva OC\".":""}</div>:(
                    <div style={{overflowX:"auto"}}>
                      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                        <thead><tr style={{background:"#f8fafc"}}>
                          {["N° OC","Fecha","Cliente","Variedad","Plantas","Há","Fee USD","Fee Total","Estado","Cuotas",""].map(h=>
                            <th key={h} style={{padding:"8px 10px",textAlign:["Plantas","Há","Fee USD","Fee Total","Cuotas"].includes(h)?"right":"left",fontWeight:700,fontSize:10,color:"#64748b",borderBottom:"2px solid #e2e8f0",whiteSpace:"nowrap"}}>{h}</th>
                          )}
                        </tr></thead>
                        <tbody>
                          {ordenesCompra.map(oc=>{
                            const cuotasArr = oc.cuotas||[];
                            const totCuotas = cuotasArr.reduce((s,c)=>s+(parseFloat(c.monto_usd)||0),0);
                            const cuotasOk = cuotasArr.filter(c=>c.pagado).length;
                            const diff = (parseFloat(oc.fee_total_usd)||0) - totCuotas;
                            return (
                              <tr key={oc.id} style={{borderBottom:"1px solid #f1f5f9",cursor:"pointer"}} onClick={()=>setOcDetalle(oc.id)}>
                                <td style={{padding:"6px 10px",fontWeight:700,color:"#2563eb"}}>{oc.n_oc||"—"}</td>
                                <td style={{padding:"6px 10px",fontSize:11}}>{oc.fecha_oc||"—"}</td>
                                <td style={{padding:"6px 10px",fontWeight:600}}>{oc.cliente_nombre||"—"}</td>
                                <td style={{padding:"6px 10px",fontSize:11}}>{oc.especie} · {oc.variedad}</td>
                                <td style={{padding:"6px 10px",textAlign:"right"}}>{N(oc.cantidad_plantas)}</td>
                                <td style={{padding:"6px 10px",textAlign:"right"}}>{N(oc.hectareas)}</td>
                                <td style={{padding:"6px 10px",textAlign:"right"}}>{$$(oc.fee_usd_planta)}</td>
                                <td style={{padding:"6px 10px",textAlign:"right",fontWeight:700,color:"#7c3aed"}}>{$$(oc.fee_total_usd)}</td>
                                <td style={{padding:"6px 10px",fontSize:10}}>
                                  <span style={{padding:"2px 8px",borderRadius:10,background:oc.estado_oc==="Pagada total"?"#dcfce7":oc.estado_oc==="Anulada"?"#fee2e2":"#fef3c7",color:oc.estado_oc==="Pagada total"?"#16a34a":oc.estado_oc==="Anulada"?"#dc2626":"#d97706",fontWeight:700}}>{oc.estado_oc||"—"}</span>
                                </td>
                                <td style={{padding:"6px 10px",textAlign:"right",fontSize:11}}>
                                  <span style={{color:cuotasOk===cuotasArr.length&&cuotasArr.length>0?"#16a34a":"#64748b"}}>{cuotasOk}/{cuotasArr.length}</span>
                                  {Math.abs(diff)>0.01&&cuotasArr.length>0&&<span title={`Diferencia: ${$$(diff)}`} style={{marginLeft:4,color:"#dc2626"}}>⚠️</span>}
                                </td>
                                <td style={{padding:"6px 10px"}}>
                                  {canViveros&&<>
                                    <button onClick={e=>{e.stopPropagation();iniciarEdicionOC(oc);}} style={{background:"#dbeafe",border:"none",borderRadius:4,padding:"3px 8px",cursor:"pointer",fontSize:11,marginRight:4}}>✏️</button>
                                    <button onClick={e=>{e.stopPropagation();eliminarOC(oc.id);}} style={{background:"#fef2f2",border:"none",borderRadius:4,padding:"3px 8px",cursor:"pointer",fontSize:11}}>🗑</button>
                                  </>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>)}

                {/* Vista detalle OC con cuotas */}
                {ocActiva && (<>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                    <div>
                      <button onClick={()=>setOcDetalle(null)} style={{background:"#f1f5f9",border:"none",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontSize:11,marginBottom:8}}>← Volver a la lista</button>
                      <div style={{fontWeight:800,fontSize:16,color:"#1e293b"}}>📦 OC {ocActiva.n_oc} — {ocActiva.cliente_nombre}</div>
                      <div style={{fontSize:11,color:"#64748b"}}>
                        {ocActiva.fecha_oc&&`📅 ${ocActiva.fecha_oc} · `}
                        🌿 {ocActiva.especie} · {ocActiva.variedad} ·
                        🌱 {N(ocActiva.cantidad_plantas)} plantas ·
                        📐 {N(ocActiva.hectareas)} há ·
                        💵 {$$(ocActiva.fee_usd_planta)}/planta ·
                        💰 Total: <strong style={{color:"#7c3aed"}}>{$$(ocActiva.fee_total_usd)}</strong>
                      </div>
                    </div>
                    {canViveros&&<button onClick={()=>{
                      const restante = (parseFloat(ocActiva.fee_total_usd)||0) - (ocActiva.cuotas||[]).reduce((s,c)=>s+(parseFloat(c.monto_usd)||0),0);
                      setCuotaForm({fecha:"",monto_usd:restante>0?restante.toFixed(2):"",pagado:false,fecha_pago:"",n_factura:"",observaciones:""});
                      setCuotaEditId(null);
                      setCuotaModal(true);
                    }} style={{padding:"6px 14px",borderRadius:8,background:"#16a34a",border:"none",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Nueva Cuota</button>}
                  </div>
                  {/* Verificación de suma */}
                  {(()=>{
                    const totC = (ocActiva.cuotas||[]).reduce((s,c)=>s+(parseFloat(c.monto_usd)||0),0);
                    const diff = (parseFloat(ocActiva.fee_total_usd)||0) - totC;
                    if(Math.abs(diff)<0.01||(ocActiva.cuotas||[]).length===0) return null;
                    return (
                      <div style={{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:11,color:"#991b1b"}}>
                        ⚠️ La suma de cuotas ({$$(totC)}) {diff>0?"es menor":"excede"} al fee total ({$$(ocActiva.fee_total_usd)}). Diferencia: <strong>{$$(Math.abs(diff))}</strong>
                      </div>
                    );
                  })()}
                  {(ocActiva.cuotas||[]).length===0?<div style={{padding:30,textAlign:"center",color:"#94a3b8",border:"1px dashed #e2e8f0",borderRadius:10}}>Sin cuotas. {canViveros?"Agrega una con \"+ Nueva Cuota\".":""}</div>:(
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                      <thead><tr style={{background:"#f8fafc"}}>
                        {["Fecha estim.","Monto USD","Estado","Fecha pago","N° Factura","Observaciones",""].map(h=>
                          <th key={h} style={{padding:"8px 10px",textAlign:["Monto USD"].includes(h)?"right":"left",fontWeight:700,fontSize:10,color:"#64748b",borderBottom:"2px solid #e2e8f0",whiteSpace:"nowrap"}}>{h}</th>
                        )}
                      </tr></thead>
                      <tbody>
                        {(ocActiva.cuotas||[]).map(cu=>(
                          <tr key={cu.id} style={{borderBottom:"1px solid #f1f5f9",background:cu.pagado?"#f0fdf4":"#fff"}}>
                            <td style={{padding:"6px 10px",fontWeight:600}}>{cu.fecha}</td>
                            <td style={{padding:"6px 10px",textAlign:"right",fontWeight:700,color:"#7c3aed"}}>{$$(cu.monto_usd)}</td>
                            <td style={{padding:"6px 10px"}}>
                              <span onClick={()=>togglePagadoCuota(cu.id)} style={{
                                cursor:canViveros?"pointer":"default",
                                padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,
                                background:cu.pagado?"#dcfce7":"#fef3c7",
                                color:cu.pagado?"#16a34a":"#d97706",
                                border:`1px solid ${cu.pagado?"#86efac":"#fde047"}`,
                              }}>{cu.pagado?"✅ Pagado":"⏳ Por cobrar"}</span>
                            </td>
                            <td style={{padding:"6px 10px",fontSize:11}}>{cu.fecha_pago||"—"}</td>
                            <td style={{padding:"6px 10px",fontSize:11}}>{cu.n_factura||"—"}</td>
                            <td style={{padding:"6px 10px",fontSize:11,color:"#64748b"}}>{cu.observaciones||"—"}</td>
                            <td style={{padding:"6px 10px"}}>
                              {canViveros&&<>
                                <button onClick={()=>{
                                  setCuotaForm({fecha:cu.fecha||"",monto_usd:cu.monto_usd||"",pagado:!!cu.pagado,fecha_pago:cu.fecha_pago||"",n_factura:cu.n_factura||"",observaciones:cu.observaciones||""});
                                  setCuotaEditId(cu.id);
                                  setCuotaModal(true);
                                }} style={{background:"#dbeafe",border:"none",borderRadius:4,padding:"3px 8px",cursor:"pointer",fontSize:11,marginRight:4}}>✏️</button>
                                <button onClick={()=>eliminarCuota(cu.id)} style={{background:"#fef2f2",border:"none",borderRadius:4,padding:"3px 8px",cursor:"pointer",fontSize:11}}>🗑</button>
                              </>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{background:"#f1f5f9",fontWeight:800}}>
                          <td style={{padding:"8px 10px"}}>TOTAL</td>
                          <td style={{padding:"8px 10px",textAlign:"right",color:"#7c3aed"}}>{$$((ocActiva.cuotas||[]).reduce((s,c)=>s+(parseFloat(c.monto_usd)||0),0))}</td>
                          <td colSpan={5} style={{padding:"8px 10px",fontSize:11,color:"#64748b"}}>
                            Cobrado: <strong style={{color:"#16a34a"}}>{$$((ocActiva.cuotas||[]).filter(c=>c.pagado).reduce((s,c)=>s+(parseFloat(c.monto_usd)||0),0))}</strong>
                            {" · "}Pendiente: <strong style={{color:"#d97706"}}>{$$((ocActiva.cuotas||[]).filter(c=>!c.pagado).reduce((s,c)=>s+(parseFloat(c.monto_usd)||0),0))}</strong>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </>)}
              </div>
            )}

            {/* TAB LEGAL/FIRMAS */}
            {vivTab==="legal"&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
                <div style={{border:"1px solid #e2e8f0",borderRadius:10,padding:16}}>
                  <div style={{fontWeight:700,marginBottom:12,color:"#1e293b"}}>📝 Firmas del Contrato</div>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:canViveros?"pointer":"default",padding:"8px 0",borderBottom:"1px solid #f1f5f9"}}>
                    <input type="checkbox" disabled={!canViveros} checked={!!v.firma_viverista} onChange={e=>updateVivero(v.id,{firma_viverista:e.target.checked})}/>
                    <span style={{fontWeight:600,color:v.firma_viverista?"#16a34a":"#94a3b8"}}>{v.firma_viverista?"✅":"⬜"} Firma Viverista</span>
                  </label>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:canViveros?"pointer":"default",padding:"8px 0"}}>
                    <input type="checkbox" disabled={!canViveros} checked={!!v.firma_osiris} onChange={e=>updateVivero(v.id,{firma_osiris:e.target.checked})}/>
                    <span style={{fontWeight:600,color:v.firma_osiris?"#16a34a":"#94a3b8"}}>{v.firma_osiris?"✅":"⬜"} Firma Osiris</span>
                  </label>
                </div>
                <div style={{border:"1px solid #e2e8f0",borderRadius:10,padding:16}}>
                  <div style={{fontWeight:700,marginBottom:12,color:"#1e293b"}}>📄 Documentación Legal</div>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Enlace documento legal</label>
                  <input disabled={!canViveros} value={v.doc_legal||""} onChange={e=>updateVivero(v.id,{doc_legal:e.target.value})} placeholder="URL del documento legal..."
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",background:canViveros?"#fff":"#f8fafc"}}/>
                  {v.doc_legal&&<a href={v.doc_legal} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:"#16a34a",marginTop:6,display:"inline-block"}}>📎 Abrir documento</a>}
                </div>
              </div>
            )}

            {/* TAB ANEXOS */}
            {vivTab==="anexos"&&(
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontWeight:700,color:"#1e293b"}}>📎 Anexos del Contrato</div>
                  {canViveros&&<button onClick={()=>{setVAnxForm({descripcion:"",fecha:"",enlace:"",observaciones:""});setVAnxModal(true);}} style={{padding:"6px 14px",borderRadius:8,background:"#16a34a",border:"none",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Agregar Anexo</button>}
                </div>
                {anexos.length===0?<div style={{padding:30,textAlign:"center",color:"#94a3b8"}}>No hay anexos registrados.</div>:(
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {anexos.map(a=>(
                      <div key={a.id} style={{border:"1px solid #e2e8f0",borderRadius:10,padding:12,display:"flex",gap:12,alignItems:"center"}}>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:600,fontSize:13,marginBottom:4}}>{a.descripcion}</div>
                          <div style={{display:"flex",gap:10,fontSize:11}}>
                            <input type="date" disabled={!canViveros} value={a.fecha||""} onChange={e=>updateVAnexo(a.id,{fecha:e.target.value})}
                              style={{padding:"3px 8px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:11}}/>
                            <input disabled={!canViveros} value={a.enlace||""} onChange={e=>updateVAnexo(a.id,{enlace:e.target.value})} placeholder="Enlace documento..."
                              style={{flex:1,padding:"3px 8px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:11}}/>
                            <input disabled={!canViveros} value={a.observaciones||""} onChange={e=>updateVAnexo(a.id,{observaciones:e.target.value})} placeholder="Notas..."
                              style={{flex:1,padding:"3px 8px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:11}}/>
                          </div>
                        </div>
                        {a.enlace&&<a href={a.enlace} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:"#16a34a"}}>📎</a>}
                        {canViveros&&<button onClick={()=>delVAnexo(a.id)} style={{background:"#fef2f2",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11}}>🗑</button>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sub-modal: Agregar Variedad */}
          {vvModal&&(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:10000}} onClick={()=>setVvModal(false)}>
              <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:24,width:520,maxHeight:"85vh",overflowY:"auto"}}>
                <h3 style={{margin:"0 0 16px",color:"#1e293b"}}>🌱 Nueva Variedad Autorizada</h3>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div>
                    <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Especie <span style={{color:"#dc2626"}}>*</span></label>
                    <input value={vvForm.especie||""} placeholder="Cerezo, Arándano..." onChange={e=>setVvForm(p=>({...p,especie:e.target.value}))}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Variedad <span style={{color:"#dc2626"}}>*</span></label>
                    <input value={vvForm.variedad||""} placeholder="Royal Dawn..." onChange={e=>setVvForm(p=>({...p,variedad:e.target.value}))}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div>
                    <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Fee USD por planta</label>
                    <input type="number" step="0.01" value={vvForm.fee_usd||""} placeholder="0.85" onChange={e=>setVvForm(p=>({...p,fee_usd:e.target.value}))}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Fee % sobre venta</label>
                    <input type="number" step="0.1" value={vvForm.fee_pct||""} placeholder="3" onChange={e=>setVvForm(p=>({...p,fee_pct:e.target.value}))}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                  </div>
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Observaciones</label>
                  <textarea value={vvForm.observaciones||""} onChange={e=>setVvForm(p=>({...p,observaciones:e.target.value}))}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,minHeight:60,boxSizing:"border-box"}}/>
                </div>
                <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                  <button onClick={()=>setVvModal(false)} style={{padding:"8px 16px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer"}}>Cancelar</button>
                  <button onClick={guardarVariedad} style={{padding:"8px 16px",borderRadius:8,background:"#16a34a",border:"none",color:"#fff",cursor:"pointer",fontWeight:700}}>Guardar</button>
                </div>
              </div>
            </div>
          )}

          {/* Sub-modal: Agregar Anexo Vivero */}
          {vAnxModal&&(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:10000}} onClick={()=>setVAnxModal(false)}>
              <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:24,width:480,maxHeight:"80vh",overflowY:"auto"}}>
                <h3 style={{margin:"0 0 16px",color:"#1e293b"}}>📎 Nuevo Anexo</h3>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Descripción <span style={{color:"#dc2626"}}>*</span></label>
                  <input value={vAnxForm.descripcion||""} placeholder="Adenda 2025, Carta compromiso..." onChange={e=>setVAnxForm(p=>({...p,descripcion:e.target.value}))}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Fecha</label>
                  <input type="date" value={vAnxForm.fecha||""} onChange={e=>setVAnxForm(p=>({...p,fecha:e.target.value}))}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Enlace (URL)</label>
                  <input value={vAnxForm.enlace||""} placeholder="https://..." onChange={e=>setVAnxForm(p=>({...p,enlace:e.target.value}))}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Observaciones</label>
                  <textarea value={vAnxForm.observaciones||""} onChange={e=>setVAnxForm(p=>({...p,observaciones:e.target.value}))}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,minHeight:60,boxSizing:"border-box"}}/>
                </div>
                <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                  <button onClick={()=>setVAnxModal(false)} style={{padding:"8px 16px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer"}}>Cancelar</button>
                  <button onClick={guardarVAnexo} style={{padding:"8px 16px",borderRadius:8,background:"#16a34a",border:"none",color:"#fff",cursor:"pointer",fontWeight:700}}>Guardar</button>
                </div>
              </div>
            </div>
          )}

          {/* Sub-modal: Nueva/Editar Orden de Compra */}
          {ocModal&&(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:10000}} onClick={()=>setOcModal(false)}>
              <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:24,width:640,maxHeight:"90vh",overflowY:"auto"}}>
                <h3 style={{margin:"0 0 16px",color:"#1e293b"}}>{ocEditId?"✏️ Editar":"➕ Nueva"} Orden de Compra</h3>

                {/* Datos básicos OC */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div>
                    <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>N° OC <span style={{color:"#dc2626"}}>*</span></label>
                    <input value={ocForm.n_oc||""} placeholder="OC-2026-001" onChange={e=>setOcForm(p=>({...p,n_oc:e.target.value}))}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Fecha OC</label>
                    <input type="date" value={ocForm.fecha_oc||""} onChange={e=>setOcForm(p=>({...p,fecha_oc:e.target.value}))}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                  </div>
                </div>

                {/* Cliente del Maestro */}
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Cliente (Maestro Osiris) <span style={{color:"#dc2626"}}>*</span></label>
                  <select value={ocForm.cliente_id||""} onChange={e=>{
                    const cli = clientes.find(c=>c.id===e.target.value);
                    setOcForm(p=>({...p,cliente_id:e.target.value,cliente_nombre:cli?.razonSocial||""}));
                  }}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",background:"#fff"}}>
                    <option value="">— Seleccionar cliente —</option>
                    {clientes.map(c=><option key={c.id} value={c.id}>{c.razonSocial} {c.pais?`(${c.pais})`:""}</option>)}
                  </select>
                </div>

                {/* Variedad del contrato */}
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Variedad autorizada <span style={{color:"#dc2626"}}>*</span></label>
                  <select value={ocForm.variedad_id||""} onChange={e=>seleccionarVariedadOC(e.target.value)}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",background:"#fff"}}>
                    <option value="">— Seleccionar variedad —</option>
                    {variedades.map(x=><option key={x.id} value={x.id}>{x.especie} · {x.variedad} {x.fee_usd?`(fee $${x.fee_usd})`:""}</option>)}
                  </select>
                </div>

                {/* Cantidades */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
                  <div>
                    <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Cantidad plantas</label>
                    <input type="number" value={ocForm.cantidad_plantas||""} placeholder="0" onChange={e=>{
                      const cant = e.target.value;
                      const fee = parseFloat(ocForm.fee_usd_planta)||0;
                      setOcForm(p=>({...p,cantidad_plantas:cant,fee_total_usd:Math.round((parseFloat(cant)||0)*fee*100)/100}));
                    }}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",textAlign:"right"}}/>
                  </div>
                  <div>
                    <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Hectáreas</label>
                    <input type="number" step="0.01" value={ocForm.hectareas||""} placeholder="0" onChange={e=>setOcForm(p=>({...p,hectareas:e.target.value}))}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",textAlign:"right"}}/>
                  </div>
                  <div>
                    <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>
                      Fee USD/planta
                      {ocForm.variedad_id&&(()=>{const vv=variedades.find(x=>x.id===ocForm.variedad_id);return vv?.fee_usd?<span style={{fontSize:9,color:"#64748b",fontWeight:500,marginLeft:4}}>(default ${vv.fee_usd})</span>:null;})()}
                    </label>
                    <input type="number" step="0.001" value={ocForm.fee_usd_planta||""} placeholder="0.00" onChange={e=>{
                      const fee = e.target.value;
                      const cant = parseFloat(ocForm.cantidad_plantas)||0;
                      setOcForm(p=>({...p,fee_usd_planta:fee,fee_total_usd:Math.round(cant*(parseFloat(fee)||0)*100)/100}));
                    }}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",textAlign:"right"}}/>
                  </div>
                </div>

                {/* Total calculado */}
                <div style={{padding:12,background:"#ede9fe",borderRadius:8,border:"1px solid #c4b5fd",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:12,fontWeight:700,color:"#5b21b6"}}>💰 Fee total calculado:</span>
                  <span style={{fontSize:18,fontWeight:900,color:"#7c3aed"}}>{$$(ocForm.fee_total_usd)}</span>
                </div>

                {/* Estado */}
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Estado de la OC</label>
                  <select value={ocForm.estado_oc||"Borrador"} onChange={e=>setOcForm(p=>({...p,estado_oc:e.target.value}))}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",background:"#fff"}}>
                    {ESTADOS_OC.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Observaciones</label>
                  <textarea value={ocForm.observaciones||""} onChange={e=>setOcForm(p=>({...p,observaciones:e.target.value}))}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,minHeight:60,boxSizing:"border-box"}}/>
                </div>

                {/* Info: las cuotas se gestionan tras crear la OC */}
                {!ocEditId&&<div style={{background:"#fef3c7",border:"1px solid #fbbf24",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:11,color:"#78350f"}}>
                  💡 Tras crear la OC, podrás agregar las cuotas/fechas de pago entrando al detalle de la OC.
                </div>}

                <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                  <button onClick={()=>{setOcModal(false);setOcEditId(null);}} style={{padding:"8px 16px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer"}}>Cancelar</button>
                  <button onClick={guardarOC} style={{padding:"8px 16px",borderRadius:8,background:"#2563eb",border:"none",color:"#fff",cursor:"pointer",fontWeight:700}}>{ocEditId?"Guardar cambios":"Crear OC"}</button>
                </div>
              </div>
            </div>
          )}

          {/* Sub-modal: Nueva/Editar Cuota */}
          {cuotaModal&&(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:10001}} onClick={()=>setCuotaModal(false)}>
              <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:24,width:520,maxHeight:"85vh",overflowY:"auto"}}>
                <h3 style={{margin:"0 0 16px",color:"#1e293b"}}>{cuotaEditId?"✏️ Editar":"➕ Nueva"} Cuota de Pago</h3>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div>
                    <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Fecha estimada <span style={{color:"#dc2626"}}>*</span></label>
                    <input type="date" value={cuotaForm.fecha||""} onChange={e=>setCuotaForm(p=>({...p,fecha:e.target.value}))}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Monto USD <span style={{color:"#dc2626"}}>*</span></label>
                    <input type="number" step="0.01" value={cuotaForm.monto_usd||""} onChange={e=>setCuotaForm(p=>({...p,monto_usd:e.target.value}))}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",textAlign:"right"}}/>
                  </div>
                </div>
                <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginBottom:12,padding:8,background:"#f8fafc",borderRadius:8}}>
                  <input type="checkbox" checked={!!cuotaForm.pagado} onChange={e=>setCuotaForm(p=>({...p,pagado:e.target.checked,fecha_pago:e.target.checked&&!p.fecha_pago?new Date().toISOString().slice(0,10):p.fecha_pago}))}/>
                  <span style={{fontSize:12,fontWeight:600}}>✅ Cuota pagada</span>
                </label>
                {cuotaForm.pagado&&(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                    <div>
                      <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Fecha de pago</label>
                      <input type="date" value={cuotaForm.fecha_pago||""} onChange={e=>setCuotaForm(p=>({...p,fecha_pago:e.target.value}))}
                        style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                    </div>
                    <div>
                      <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>N° Factura</label>
                      <input value={cuotaForm.n_factura||""} onChange={e=>setCuotaForm(p=>({...p,n_factura:e.target.value}))}
                        style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                    </div>
                  </div>
                )}
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Observaciones</label>
                  <textarea value={cuotaForm.observaciones||""} onChange={e=>setCuotaForm(p=>({...p,observaciones:e.target.value}))}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,minHeight:50,boxSizing:"border-box"}}/>
                </div>
                <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                  <button onClick={()=>{setCuotaModal(false);setCuotaEditId(null);}} style={{padding:"8px 16px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer"}}>Cancelar</button>
                  <button onClick={guardarCuota} style={{padding:"8px 16px",borderRadius:8,background:"#16a34a",border:"none",color:"#fff",cursor:"pointer",fontWeight:700}}>{cuotaEditId?"Guardar cambios":"Crear cuota"}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    // ── Vista lista de viveros ──
    const totVencidos = vivData.filter(v=>{const d=diasParaVencer(v.f_vencimiento);return d!==null && d<0;}).length;
    const totPorVencer = vivData.filter(v=>{const d=diasParaVencer(v.f_vencimiento);return d!==null && d>=0 && d<=90;}).length;
    return (
      <div style={{fontFamily:"sans-serif",background:"#0d1117",minHeight:"100vh",padding:"20px 20px 40px"}}>
        <NavBar breadcrumbItems={[
          {label:"Mediterra", onClick:onBack},
          {label:"Osiris Hub", onClick:()=>setSubApp(null)},
          {label:"Contratos Viveros"},
        ]}/>

        {canVerViveros&&!canViveros&&(
          <div style={{background:"linear-gradient(135deg,#fef3c7,#fde68a)",border:"1px solid #f59e0b",
            borderRadius:10,padding:"10px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:20}}>👁</span>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:800,color:"#92400e"}}>Modo solo lectura</div>
              <div style={{fontSize:11,color:"#78350f"}}>
                {esConsulta
                  ? "Tu rol es de Consulta. Puedes visualizar y exportar pero no modificar contratos viveros."
                  : "Tienes permiso de \"Solo ver\" en Contratos Viveros."}
              </div>
            </div>
          </div>
        )}

        {/* KPIs */}
        <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:16}}>
          {(()=>{
            // Agregar métricas de OC
            const totOC = vivData.reduce((s,v)=>s+(v.ordenesCompra||[]).length,0);
            const totFeeOC = vivData.reduce((s,v)=>s+(v.ordenesCompra||[]).reduce((ss,o)=>ss+(parseFloat(o.fee_total_usd)||0),0),0);
            const totCobrado = vivData.reduce((s,v)=>s+(v.ordenesCompra||[]).reduce((ss,o)=>ss+((o.cuotas||[]).filter(c=>c.pagado).reduce((sss,c)=>sss+(parseFloat(c.monto_usd)||0),0)),0),0);
            const porCobrarOC = totFeeOC - totCobrado;
            return [
              ["📊 Total viveros",   vivData.length, "#16a34a"],
              ["⚠️ Vencidos",          totVencidos,    "#dc2626"],
              ["⏳ Vencen ≤ 90 días", totPorVencer,  "#f59e0b"],
              ["🌱 Variedades",       vivData.reduce((s,v)=>s+(v.variedades||[]).length,0), "#7c3aed"],
              ["📦 OC totales",       totOC,           "#2563eb"],
              ["💰 Por cobrar OC",    $$(porCobrarOC), "#fbbf24"],
            ].map(([l,v,c])=>(
              <div key={l} style={{background:"#21283b",border:"1px solid #30363d",borderLeft:`4px solid ${c}`,
                borderRadius:10,padding:"12px 16px",flex:1,minWidth:140}}>
                <div style={{fontSize:10,color:"#8b949e",fontWeight:600,marginBottom:4}}>{l}</div>
                <div style={{fontSize:20,fontWeight:900,color:c}}>{v}</div>
              </div>
            ));
          })()}
        </div>

        {/* Maestro de Viveristas (collapsible) */}
        {canVerViveros&&<div style={{marginBottom:16}}>
          <details style={{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:10}}>
            <summary style={{padding:"10px 16px",cursor:"pointer",fontSize:12,fontWeight:700,color:"#16a34a"}}>🌱 Maestro de Viveristas ({(viveristas||[]).length})</summary>
            <div style={{padding:"0 16px 16px"}}><MaestroViveristas viveristas={viveristas} setViveristas={setViveristas} can={canViveros}/></div>
          </details>
        </div>}

        <div style={{background:"#fff",borderRadius:14,padding:20,boxShadow:"0 2px 10px #0001"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
            <h3 style={{margin:0,fontSize:18,color:"#1e293b"}}>🌱 Contratos Viveros</h3>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>exportarViveros(vivData)}
                style={{padding:"8px 16px",borderRadius:8,background:"#0f766e",border:"none",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>
                📥 Exportar Excel
              </button>
              {canViveros&&<button onClick={()=>{setVivForm(EMPTY_VIV);setVivEditId(null);setVivWizStep(1);setVivWizVvForm(EMPTY_VV_INLINE);setVivWizAnxForm(EMPTY_VANX_INLINE);setVivWizOcForm(EMPTY_OC_INLINE);setVivWizCuotaForm(EMPTY_CUOTA_INLINE);setVivWizOcExpandido(null);setVivModal(true);}}
                style={{padding:"8px 16px",borderRadius:8,background:"#16a34a",border:"none",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>
                + Nuevo Vivero
              </button>}
            </div>
          </div>
          {vivData.length===0?<div style={{padding:40,textAlign:"center",color:"#94a3b8"}}>No hay viveros registrados. {canViveros?"Haz click en \"+ Nuevo Vivero\" para agregar.":""}</div>:(
            <div style={{display:"grid",gap:12}}>
              {vivData.map(v=>{
                const vig = estadoVigencia(v.f_vencimiento);
                const nVar = (v.variedades||[]).length;
                const firmado = v.firma_viverista && v.firma_osiris;
                const venc = diasParaVencer(v.f_vencimiento);
                const isVencido = venc!==null && venc<0;
                return (
                  <div key={v.id} onClick={()=>{setVivDetalle(v.id);setVivTab("general");}}
                    style={{border:`1px solid ${isVencido?"#fca5a5":"#e2e8f0"}`,borderRadius:12,padding:"16px 20px",cursor:"pointer",
                      background:isVencido?"#fef2f2":"#fff",transition:"all 0.15s"}}
                    onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 12px #0002"}
                    onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                      <div>
                        <div style={{fontWeight:800,fontSize:15,color:"#1e293b"}}>🌱 {v.viverista}{v.pais?<span style={{fontWeight:500,color:"#64748b"}}> · 🌍 {v.pais}</span>:null}</div>
                        <div style={{fontSize:11,color:"#64748b",marginTop:2}}>
                          {v.f_contrato&&`${v.f_contrato} → `}{v.f_vencimiento||"Sin vencimiento"}
                          <span style={{color:vig.color,marginLeft:8,fontWeight:700,background:vig.bg,padding:"2px 8px",borderRadius:10}}>{vig.icon} {vig.label}</span>
                        </div>
                      </div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        {firmado&&<span style={{fontSize:10,background:"rgba(34,197,94,0.15)",color:"#16a34a",padding:"3px 10px",borderRadius:20,fontWeight:700}}>✅ Firmado</span>}
                        {v.renovable&&<span style={{fontSize:10,background:"rgba(96,165,250,0.15)",color:"#3b82f6",padding:"3px 10px",borderRadius:20,fontWeight:700}}>🔄</span>}
                        <span style={{fontSize:10,background:"rgba(22,163,74,0.15)",color:"#16a34a",padding:"3px 10px",borderRadius:20,fontWeight:700}}>{nVar} var.</span>
                        {canViveros&&<>
                          <button onClick={e=>{e.stopPropagation();setVivForm({...EMPTY_VIV,...v});setVivEditId(v.id);setVivWizStep(1);setVivWizVvForm(EMPTY_VV_INLINE);setVivWizAnxForm(EMPTY_VANX_INLINE);setVivWizOcForm(EMPTY_OC_INLINE);setVivWizCuotaForm(EMPTY_CUOTA_INLINE);setVivWizOcExpandido(null);setVivModal(true);}}
                            style={{background:"#f0f9ff",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11}}>✏️</button>
                          <button onClick={e=>{e.stopPropagation();eliminarViv(v.id);}}
                            style={{background:"#fef2f2",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11}}>🗑</button>
                        </>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Wizard: Nuevo/Editar Vivero (5 pasos) */}
        {vivModal&&(()=>{
          const wizVariedades = vivForm.variedades || [];
          const wizAnexos     = vivForm.anexos     || [];
          const wizOCs        = vivForm.ordenesCompra || [];

          // ── Helpers paso 2 (variedades) ──
          const agregarVarWiz = () => {
            if(!vivWizVvForm.especie || !vivWizVvForm.variedad) {
              alert("Especie y Variedad son obligatorios."); return;
            }
            const nueva = {
              id:`vv_${Date.now()}`,
              especie:vivWizVvForm.especie.trim(),
              variedad:vivWizVvForm.variedad.trim(),
              fee_usd:parseFloat(vivWizVvForm.fee_usd)||0,
              fee_pct:parseFloat(vivWizVvForm.fee_pct)||0,
              observaciones:vivWizVvForm.observaciones||"",
            };
            setVivForm(p=>({...p, variedades:[...(p.variedades||[]), nueva]}));
            setVivWizVvForm(EMPTY_VV_INLINE);
          };
          const quitarVarWiz = (vid) => {
            const variedadRemovida = wizVariedades.find(v=>v.id===vid);
            if(!variedadRemovida) return;
            // Verificar OC vinculadas
            const ocVinc = wizOCs.filter(o=>o.variedad_id === vid);
            if(ocVinc.length>0) {
              if(!window.confirm(`Hay ${ocVinc.length} OC vinculada(s) a "${variedadRemovida.especie} · ${variedadRemovida.variedad}". Si la eliminas, esas OC quedarán huérfanas. ¿Continuar?`)) return;
            }
            setVivForm(p=>({...p, variedades:(p.variedades||[]).filter(v=>v.id!==vid)}));
          };

          // ── Helpers paso 3 (anexos) ──
          const agregarAnxWiz = () => {
            if(!vivWizAnxForm.descripcion) { alert("Descripción del anexo es obligatoria."); return; }
            const nuevo = {id:`vanx_${Date.now()}`, ...vivWizAnxForm};
            setVivForm(p=>({...p, anexos:[...(p.anexos||[]), nuevo]}));
            setVivWizAnxForm(EMPTY_VANX_INLINE);
          };
          const quitarAnxWiz = (aid) => {
            setVivForm(p=>({...p, anexos:(p.anexos||[]).filter(a=>a.id!==aid)}));
          };

          // ── Helpers paso 4 (OC) ──
          const seleccionarVariedadWizOC = (vid) => {
            const vv = wizVariedades.find(x=>x.id===vid);
            if(!vv) { setVivWizOcForm(p=>({...p,variedad_id:""})); return; }
            setVivWizOcForm(p=>({
              ...p,
              variedad_id: vid,
              especie: vv.especie||"",
              variedad: vv.variedad||"",
              fee_usd_planta: p.fee_usd_planta || vv.fee_usd || "",
            }));
          };
          const calcFeeTotalWiz = (cant, fee) => Math.round((parseFloat(cant)||0)*(parseFloat(fee)||0)*100)/100;
          const agregarOcWiz = () => {
            if(!vivWizOcForm.n_oc || !vivWizOcForm.cliente_id || !vivWizOcForm.variedad_id) {
              alert("N° OC, Cliente y Variedad son obligatorios."); return;
            }
            const cli = clientes.find(c=>c.id===vivWizOcForm.cliente_id);
            const cant = parseFloat(vivWizOcForm.cantidad_plantas)||0;
            const fee  = parseFloat(vivWizOcForm.fee_usd_planta)||0;
            const nueva = {
              id:`oc_${Date.now()}`,
              ...vivWizOcForm,
              cliente_nombre: cli?.razonSocial || "",
              cantidad_plantas: cant,
              hectareas: parseFloat(vivWizOcForm.hectareas)||0,
              fee_usd_planta: fee,
              fee_total_usd: calcFeeTotalWiz(cant, fee),
              cuotas: [],
            };
            setVivForm(p=>({...p, ordenesCompra:[...(p.ordenesCompra||[]), nueva]}));
            setVivWizOcForm(EMPTY_OC_INLINE);
          };
          const quitarOcWiz = (oid) => {
            const oc = wizOCs.find(o=>o.id===oid);
            if(oc && (oc.cuotas||[]).length>0) {
              if(!window.confirm(`Esta OC tiene ${oc.cuotas.length} cuota(s) registrada(s). ¿Eliminar de todos modos?`)) return;
            }
            setVivForm(p=>({...p, ordenesCompra:(p.ordenesCompra||[]).filter(o=>o.id!==oid)}));
            if(vivWizOcExpandido===oid) setVivWizOcExpandido(null);
          };

          // ── Helpers paso 5 (cuotas) ──
          const agregarCuotaWiz = (ocId) => {
            if(!vivWizCuotaForm.fecha || !vivWizCuotaForm.monto_usd) {
              alert("Fecha y Monto son obligatorios."); return;
            }
            const cuota = {
              id:`cuo_${Date.now()}`,
              fecha:vivWizCuotaForm.fecha,
              monto_usd:parseFloat(vivWizCuotaForm.monto_usd)||0,
              pagado:!!vivWizCuotaForm.pagado,
              fecha_pago:vivWizCuotaForm.fecha_pago||"",
              n_factura:vivWizCuotaForm.n_factura||"",
              observaciones:vivWizCuotaForm.observaciones||"",
            };
            setVivForm(p=>({
              ...p,
              ordenesCompra: (p.ordenesCompra||[]).map(o=>{
                if(o.id!==ocId) return o;
                const cuotasNew = [...(o.cuotas||[]), cuota];
                cuotasNew.sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha)));
                return {...o, cuotas: cuotasNew};
              }),
            }));
            setVivWizCuotaForm(EMPTY_CUOTA_INLINE);
          };
          const quitarCuotaWiz = (ocId, cid) => {
            setVivForm(p=>({
              ...p,
              ordenesCompra: (p.ordenesCompra||[]).map(o=>
                o.id!==ocId ? o : {...o, cuotas:(o.cuotas||[]).filter(c=>c.id!==cid)}
              ),
            }));
          };

          // Stepper helpers
          const Step = ({n, label, active, done}) => {
            const bg = active?"#16a34a":done?"#0f766e":"#e2e8f0";
            const col = active||done?"#fff":"#94a3b8";
            return (
              <div style={{display:"flex",alignItems:"center",gap:6,flex:1,minWidth:0}}>
                <div style={{
                  width:26,height:26,borderRadius:"50%",
                  background:bg,color:col,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:12,fontWeight:800,flexShrink:0
                }}>{done?"✓":n}</div>
                <div style={{
                  fontSize:10,fontWeight:active?700:500,
                  color:active?"#1e293b":done?"#0f766e":"#94a3b8",
                  whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"
                }}>{label}</div>
              </div>
            );
          };
          const irPaso = (n) => {
            if(vivWizStep===1 && n>1 && !vivForm.viverista) {
              alert("Viverista es obligatorio para continuar."); return;
            }
            if(vivWizStep===1 && n>1 && vivForm.f_contrato && vivForm.f_vencimiento && new Date(vivForm.f_vencimiento) < new Date(vivForm.f_contrato)) {
              alert("La fecha de vencimiento no puede ser anterior a la fecha de contrato."); return;
            }
            setVivWizStep(n);
          };

          // Resumen totales OC
          const totFeeAllOC = wizOCs.reduce((s,o)=>s+(parseFloat(o.fee_total_usd)||0),0);
          const totCuotasAllOC = wizOCs.reduce((s,o)=>s+(o.cuotas||[]).reduce((ss,c)=>ss+(parseFloat(c.monto_usd)||0),0),0);

          return (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}} onClick={()=>setVivModal(false)}>
            <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:24,width:760,maxHeight:"94vh",overflowY:"auto"}}>
              <h3 style={{margin:"0 0 18px",color:"#1e293b"}}>{vivEditId?"✏️ Editar":"➕ Nuevo"} Contrato Vivero</h3>

              {/* Stepper */}
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:20,padding:"12px 8px",background:"#f8fafc",borderRadius:10}}>
                <Step n={1} label="Cabecera"   active={vivWizStep===1} done={vivWizStep>1}/>
                <div style={{flex:"0 0 18px",height:2,background:vivWizStep>1?"#0f766e":"#e2e8f0"}}/>
                <Step n={2} label="Variedades" active={vivWizStep===2} done={vivWizStep>2}/>
                <div style={{flex:"0 0 18px",height:2,background:vivWizStep>2?"#0f766e":"#e2e8f0"}}/>
                <Step n={3} label="Anexos"     active={vivWizStep===3} done={vivWizStep>3}/>
                <div style={{flex:"0 0 18px",height:2,background:vivWizStep>3?"#0f766e":"#e2e8f0"}}/>
                <Step n={4} label="OC Clientes" active={vivWizStep===4} done={vivWizStep>4}/>
                <div style={{flex:"0 0 18px",height:2,background:vivWizStep>4?"#0f766e":"#e2e8f0"}}/>
                <Step n={5} label="Cuotas"     active={vivWizStep===5} done={false}/>
              </div>

              {/* PASO 1 — CABECERA */}
              {vivWizStep===1&&(<>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Viverista <span style={{color:"#dc2626"}}>*</span></label>
                  {(viveristas||[]).length>0?(
                    <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:8}}>
                      <select value={(viveristas||[]).find(vv=>vv.razonSocial===vivForm.viverista)?.id||""} onChange={e=>{
                        const vrs = (viveristas||[]).find(x=>x.id===e.target.value);
                        if(vrs) setVivForm(p=>({...p,viverista:vrs.razonSocial,pais:p.pais||vrs.pais||""}));
                      }}
                        style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",background:"#fff"}}>
                        <option value="">— Seleccionar del Maestro —</option>
                        {(viveristas||[]).map(vrs=><option key={vrs.id} value={vrs.id}>{vrs.razonSocial} {vrs.pais?`(${vrs.pais})`:""}</option>)}
                      </select>
                      <input value={vivForm.viverista||""} placeholder="O escribir libre..." onChange={e=>setVivForm(p=>({...p,viverista:e.target.value}))}
                        style={{padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",width:220}}/>
                    </div>
                  ):(
                    <input value={vivForm.viverista||""} placeholder="Ej. Vivero La Esperanza, Genética del Sur..." onChange={e=>setVivForm(p=>({...p,viverista:e.target.value}))}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                  )}
                  {(viveristas||[]).length===0&&<div style={{fontSize:10,color:"#64748b",marginTop:4}}>💡 Aún no hay viveristas en el Maestro. Puedes agregarlos después o escribir libremente aquí.</div>}
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>País</label>
                  <input value={vivForm.pais||""} placeholder="Chile, Perú, México..." onChange={e=>setVivForm(p=>({...p,pais:e.target.value}))}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div>
                    <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Fecha Contrato</label>
                    <input type="date" value={vivForm.f_contrato||""} onChange={e=>setVivForm(p=>({...p,f_contrato:e.target.value}))}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Fecha Vencimiento</label>
                    <input type="date" value={vivForm.f_vencimiento||""} onChange={e=>setVivForm(p=>({...p,f_vencimiento:e.target.value}))}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                  </div>
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Estado del Contrato</label>
                  <select value={vivForm.estado_contrato||"Borrador"} onChange={e=>setVivForm(p=>({...p,estado_contrato:e.target.value}))}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",background:"#fff"}}>
                    {ESTADOS_CONTRATO_OBT.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div>
                    <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Forma de pago a Osiris</label>
                    <select value={vivForm.forma_pago||""} onChange={e=>setVivForm(p=>({...p,forma_pago:e.target.value}))}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",background:"#fff"}}>
                      <option value="">— Seleccionar —</option>
                      {FORMAS_PAGO.map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Mes estimado de pago</label>
                    <select value={vivForm.mes_pago_estimado||""} onChange={e=>setVivForm(p=>({...p,mes_pago_estimado:e.target.value}))}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",background:"#fff"}}>
                      <option value="">— Seleccionar —</option>
                      {MESES.map(m=><option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
                <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginBottom:12}}>
                  <input type="checkbox" checked={!!vivForm.renovable} onChange={e=>setVivForm(p=>({...p,renovable:e.target.checked}))}/>
                  <span style={{fontSize:12}}>Contrato renovable</span>
                </label>
                {vivForm.renovable&&(
                  <div style={{marginBottom:12}}>
                    <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>📆 Nueva Fecha Vencimiento</label>
                    <input type="date" value={vivForm.f_vencimiento_nueva||""} onChange={e=>setVivForm(p=>({...p,f_vencimiento_nueva:e.target.value}))}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #93c5fd",fontSize:13,boxSizing:"border-box",background:"#eff6ff"}}/>
                  </div>
                )}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12,padding:12,background:"#f8fafc",borderRadius:8}}>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
                    <input type="checkbox" checked={!!vivForm.firma_viverista} onChange={e=>setVivForm(p=>({...p,firma_viverista:e.target.checked}))}/>
                    <span style={{fontSize:12}}>✅ Firma Viverista</span>
                  </label>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
                    <input type="checkbox" checked={!!vivForm.firma_osiris} onChange={e=>setVivForm(p=>({...p,firma_osiris:e.target.checked}))}/>
                    <span style={{fontSize:12}}>✅ Firma Osiris</span>
                  </label>
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>📎 Link al contrato (OneDrive/Drive)</label>
                  <input value={vivForm.doc_contrato||""} placeholder="https://..." onChange={e=>setVivForm(p=>({...p,doc_contrato:e.target.value}))}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>📄 Link doc. legal complementario</label>
                  <input value={vivForm.doc_legal||""} placeholder="https://..." onChange={e=>setVivForm(p=>({...p,doc_legal:e.target.value}))}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Observaciones</label>
                  <textarea value={vivForm.observaciones||""} onChange={e=>setVivForm(p=>({...p,observaciones:e.target.value}))}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,minHeight:60,boxSizing:"border-box"}}/>
                </div>
              </>)}

              {/* PASO 2 — VARIEDADES */}
              {vivWizStep===2&&(<>
                <div style={{background:"#dcfce7",border:"1px solid #86efac",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:11,color:"#14532d"}}>
                  💡 Agrega las variedades autorizadas a producir por este viverista. <strong>Este paso es opcional</strong> — puedes saltar y agregar después desde el detalle.
                </div>

                {wizVariedades.length>0&&(
                  <div style={{marginBottom:14,border:"1px solid #e2e8f0",borderRadius:10,overflow:"hidden"}}>
                    <div style={{background:"#f8fafc",padding:"8px 12px",fontSize:11,fontWeight:700,color:"#475569"}}>
                      Variedades agregadas ({wizVariedades.length})
                    </div>
                    {wizVariedades.map(v=>(
                      <div key={v.id} style={{padding:"10px 12px",borderTop:"1px solid #f1f5f9",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:700,color:"#1e293b"}}>🌿 {v.especie} — {v.variedad}</div>
                          <div style={{fontSize:10,color:"#64748b",marginTop:2}}>
                            {v.fee_usd?<>💵 ${v.fee_usd}/planta</>:null}
                            {v.fee_pct?<> · 📊 {v.fee_pct}% s/venta</>:null}
                            {v.observaciones?<> · {v.observaciones}</>:null}
                          </div>
                        </div>
                        <button onClick={()=>quitarVarWiz(v.id)} style={{background:"#fef2f2",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,color:"#991b1b"}}>🗑</button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{border:"1px dashed #86efac",borderRadius:10,padding:14,background:"#f0fdf4",marginBottom:12}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#14532d",marginBottom:10}}>+ Agregar nueva variedad</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                    <div>
                      <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>Especie <span style={{color:"#dc2626"}}>*</span></label>
                      <input value={vivWizVvForm.especie||""} placeholder="Cerezo, Arándano..." onChange={e=>setVivWizVvForm(p=>({...p,especie:e.target.value}))}
                        style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box"}}/>
                    </div>
                    <div>
                      <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>Variedad <span style={{color:"#dc2626"}}>*</span></label>
                      <input value={vivWizVvForm.variedad||""} placeholder="Royal Dawn..." onChange={e=>setVivWizVvForm(p=>({...p,variedad:e.target.value}))}
                        style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box"}}/>
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                    <div>
                      <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>Fee USD/planta</label>
                      <input type="number" step="0.01" value={vivWizVvForm.fee_usd||""} placeholder="0.85" onChange={e=>setVivWizVvForm(p=>({...p,fee_usd:e.target.value}))}
                        style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box",textAlign:"right"}}/>
                    </div>
                    <div>
                      <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>Fee % s/venta</label>
                      <input type="number" step="0.1" value={vivWizVvForm.fee_pct||""} placeholder="3" onChange={e=>setVivWizVvForm(p=>({...p,fee_pct:e.target.value}))}
                        style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box",textAlign:"right"}}/>
                    </div>
                  </div>
                  <div style={{marginBottom:10}}>
                    <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>Observaciones</label>
                    <input value={vivWizVvForm.observaciones||""} onChange={e=>setVivWizVvForm(p=>({...p,observaciones:e.target.value}))}
                      style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box"}}/>
                  </div>
                  <button onClick={agregarVarWiz} style={{width:"100%",padding:"8px 14px",borderRadius:8,background:"#16a34a",border:"none",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Agregar variedad a la lista</button>
                </div>
              </>)}

              {/* PASO 3 — ANEXOS */}
              {vivWizStep===3&&(<>
                <div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:11,color:"#1e3a8a"}}>
                  💡 Adjunta documentos complementarios al contrato (adendas, cartas compromiso, certificados...). <strong>Paso opcional</strong>.
                </div>

                {wizAnexos.length>0&&(
                  <div style={{marginBottom:14,border:"1px solid #e2e8f0",borderRadius:10,overflow:"hidden"}}>
                    <div style={{background:"#f8fafc",padding:"8px 12px",fontSize:11,fontWeight:700,color:"#475569"}}>
                      Anexos agregados ({wizAnexos.length})
                    </div>
                    {wizAnexos.map(a=>(
                      <div key={a.id} style={{padding:"10px 12px",borderTop:"1px solid #f1f5f9",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:700,color:"#1e293b"}}>📎 {a.descripcion}</div>
                          <div style={{fontSize:10,color:"#64748b",marginTop:2}}>
                            {a.fecha&&`📅 ${a.fecha}`}
                            {a.enlace&&<> · <a href={a.enlace} target="_blank" rel="noopener noreferrer" style={{color:"#2563eb"}}>📎 Abrir</a></>}
                            {a.observaciones&&` · ${a.observaciones}`}
                          </div>
                        </div>
                        <button onClick={()=>quitarAnxWiz(a.id)} style={{background:"#fef2f2",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,color:"#991b1b"}}>🗑</button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{border:"1px dashed #93c5fd",borderRadius:10,padding:14,background:"#eff6ff",marginBottom:12}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#1e3a8a",marginBottom:10}}>+ Agregar nuevo anexo</div>
                  <div style={{marginBottom:10}}>
                    <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>Descripción <span style={{color:"#dc2626"}}>*</span></label>
                    <input value={vivWizAnxForm.descripcion||""} placeholder="Adenda 2026, Carta compromiso..." onChange={e=>setVivWizAnxForm(p=>({...p,descripcion:e.target.value}))}
                      style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box"}}/>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                    <div>
                      <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>Fecha</label>
                      <input type="date" value={vivWizAnxForm.fecha||""} onChange={e=>setVivWizAnxForm(p=>({...p,fecha:e.target.value}))}
                        style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box"}}/>
                    </div>
                    <div>
                      <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>Enlace (URL)</label>
                      <input value={vivWizAnxForm.enlace||""} placeholder="https://..." onChange={e=>setVivWizAnxForm(p=>({...p,enlace:e.target.value}))}
                        style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box"}}/>
                    </div>
                  </div>
                  <div style={{marginBottom:10}}>
                    <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>Observaciones</label>
                    <input value={vivWizAnxForm.observaciones||""} onChange={e=>setVivWizAnxForm(p=>({...p,observaciones:e.target.value}))}
                      style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box"}}/>
                  </div>
                  <button onClick={agregarAnxWiz} style={{width:"100%",padding:"8px 14px",borderRadius:8,background:"#2563eb",border:"none",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Agregar anexo a la lista</button>
                </div>
              </>)}

              {/* PASO 4 — ÓRDENES DE COMPRA */}
              {vivWizStep===4&&(<>
                <div style={{background:"#ede9fe",border:"1px solid #c4b5fd",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:11,color:"#5b21b6"}}>
                  💡 Cada OC es una orden del cliente productor-exportador al viverista. El fee a Osiris se hereda de la variedad pero puedes editarlo. Las cuotas/fechas de pago se configuran en el siguiente paso. <strong>Paso opcional</strong>.
                </div>

                {wizVariedades.length===0?(
                  <div style={{padding:30,textAlign:"center",color:"#94a3b8",border:"1px dashed #e2e8f0",borderRadius:10,marginBottom:12}}>
                    <div style={{fontSize:32,marginBottom:8}}>🌿</div>
                    <div style={{fontSize:12}}>Para registrar una OC primero necesitas agregar al menos una variedad.</div>
                    <button onClick={()=>setVivWizStep(2)} style={{marginTop:10,padding:"6px 14px",borderRadius:8,background:"#16a34a",border:"none",color:"#fff",cursor:"pointer",fontSize:11,fontWeight:700}}>← Volver al paso 2</button>
                  </div>
                ):clientes.length===0?(
                  <div style={{padding:30,textAlign:"center",color:"#94a3b8",border:"1px dashed #e2e8f0",borderRadius:10,marginBottom:12}}>
                    <div style={{fontSize:32,marginBottom:8}}>👥</div>
                    <div style={{fontSize:12}}>No hay clientes en el Maestro de Clientes Osiris. Carga al menos uno antes.</div>
                  </div>
                ):(<>
                  {wizOCs.length>0&&(
                    <div style={{marginBottom:14,border:"1px solid #e2e8f0",borderRadius:10,overflow:"hidden"}}>
                      <div style={{background:"#f8fafc",padding:"8px 12px",fontSize:11,fontWeight:700,color:"#475569",display:"flex",justifyContent:"space-between"}}>
                        <span>OC agregadas ({wizOCs.length})</span>
                        <span style={{color:"#7c3aed"}}>Total fee: {$$(totFeeAllOC)}</span>
                      </div>
                      {wizOCs.map(oc=>(
                        <div key={oc.id} style={{padding:"10px 12px",borderTop:"1px solid #f1f5f9",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:13,fontWeight:700,color:"#1e293b"}}>📦 OC {oc.n_oc} — {oc.cliente_nombre}</div>
                            <div style={{fontSize:10,color:"#64748b",marginTop:2}}>
                              🌿 {oc.especie} · {oc.variedad} · {N(oc.cantidad_plantas)} plantas
                              {oc.hectareas?` · ${N(oc.hectareas)} há`:""}
                              {oc.fee_usd_planta?` · $${oc.fee_usd_planta}/planta`:""}
                              <span style={{color:"#7c3aed",fontWeight:700,marginLeft:6}}>= {$$(oc.fee_total_usd)}</span>
                            </div>
                          </div>
                          <button onClick={()=>quitarOcWiz(oc.id)} style={{background:"#fef2f2",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,color:"#991b1b"}}>🗑</button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{border:"1px dashed #c4b5fd",borderRadius:10,padding:14,background:"#faf5ff",marginBottom:12}}>
                    <div style={{fontSize:12,fontWeight:700,color:"#5b21b6",marginBottom:10}}>+ Agregar nueva OC</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                      <div>
                        <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>N° OC <span style={{color:"#dc2626"}}>*</span></label>
                        <input value={vivWizOcForm.n_oc||""} placeholder="OC-2026-001" onChange={e=>setVivWizOcForm(p=>({...p,n_oc:e.target.value}))}
                          style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box"}}/>
                      </div>
                      <div>
                        <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>Fecha OC</label>
                        <input type="date" value={vivWizOcForm.fecha_oc||""} onChange={e=>setVivWizOcForm(p=>({...p,fecha_oc:e.target.value}))}
                          style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box"}}/>
                      </div>
                    </div>
                    <div style={{marginBottom:10}}>
                      <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>Cliente <span style={{color:"#dc2626"}}>*</span></label>
                      <select value={vivWizOcForm.cliente_id||""} onChange={e=>{
                        const cli = clientes.find(c=>c.id===e.target.value);
                        setVivWizOcForm(p=>({...p,cliente_id:e.target.value,cliente_nombre:cli?.razonSocial||""}));
                      }}
                        style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box",background:"#fff"}}>
                        <option value="">— Seleccionar cliente —</option>
                        {clientes.map(c=><option key={c.id} value={c.id}>{c.razonSocial} {c.pais?`(${c.pais})`:""}</option>)}
                      </select>
                    </div>
                    <div style={{marginBottom:10}}>
                      <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>Variedad <span style={{color:"#dc2626"}}>*</span></label>
                      <select value={vivWizOcForm.variedad_id||""} onChange={e=>seleccionarVariedadWizOC(e.target.value)}
                        style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box",background:"#fff"}}>
                        <option value="">— Seleccionar variedad —</option>
                        {wizVariedades.map(x=><option key={x.id} value={x.id}>{x.especie} · {x.variedad} {x.fee_usd?`(fee $${x.fee_usd})`:""}</option>)}
                      </select>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                      <div>
                        <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>Plantas</label>
                        <input type="number" value={vivWizOcForm.cantidad_plantas||""} onChange={e=>{
                          const cant = e.target.value;
                          setVivWizOcForm(p=>({...p,cantidad_plantas:cant,fee_total_usd:calcFeeTotalWiz(cant,p.fee_usd_planta)}));
                        }}
                          style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box",textAlign:"right"}}/>
                      </div>
                      <div>
                        <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>Hectáreas</label>
                        <input type="number" step="0.01" value={vivWizOcForm.hectareas||""} onChange={e=>setVivWizOcForm(p=>({...p,hectareas:e.target.value}))}
                          style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box",textAlign:"right"}}/>
                      </div>
                      <div>
                        <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>Fee USD/planta</label>
                        <input type="number" step="0.001" value={vivWizOcForm.fee_usd_planta||""} onChange={e=>{
                          const fee = e.target.value;
                          setVivWizOcForm(p=>({...p,fee_usd_planta:fee,fee_total_usd:calcFeeTotalWiz(p.cantidad_plantas,fee)}));
                        }}
                          style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box",textAlign:"right"}}/>
                      </div>
                    </div>
                    <div style={{padding:8,background:"#ede9fe",borderRadius:6,marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:11,fontWeight:700,color:"#5b21b6"}}>💰 Fee total:</span>
                      <span style={{fontSize:14,fontWeight:900,color:"#7c3aed"}}>{$$(vivWizOcForm.fee_total_usd)}</span>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                      <div>
                        <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>Estado OC</label>
                        <select value={vivWizOcForm.estado_oc||"Borrador"} onChange={e=>setVivWizOcForm(p=>({...p,estado_oc:e.target.value}))}
                          style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box",background:"#fff"}}>
                          {ESTADOS_OC.map(s=><option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:3}}>Observaciones</label>
                        <input value={vivWizOcForm.observaciones||""} onChange={e=>setVivWizOcForm(p=>({...p,observaciones:e.target.value}))}
                          style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,boxSizing:"border-box"}}/>
                      </div>
                    </div>
                    <button onClick={agregarOcWiz} style={{width:"100%",padding:"8px 14px",borderRadius:8,background:"#7c3aed",border:"none",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Agregar OC a la lista</button>
                  </div>
                </>)}
              </>)}

              {/* PASO 5 — CUOTAS POR OC */}
              {vivWizStep===5&&(<>
                <div style={{background:"#fef3c7",border:"1px solid #fbbf24",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:11,color:"#78350f"}}>
                  💡 Para cada OC del paso anterior, agrega las cuotas/fechas de pago. Haz clic en una OC para expandirla. <strong>Paso opcional</strong> — puedes saltar y agregar después desde el detalle.
                </div>

                {wizOCs.length===0?(
                  <div style={{padding:30,textAlign:"center",color:"#94a3b8",border:"1px dashed #e2e8f0",borderRadius:10,marginBottom:12}}>
                    <div style={{fontSize:32,marginBottom:8}}>📦</div>
                    <div style={{fontSize:12}}>No hay OC para configurar cuotas. {wizVariedades.length>0?"Vuelve al paso 4 para agregarlas.":"O salta a crear el contrato sin cuotas."}</div>
                    {wizVariedades.length>0&&<button onClick={()=>setVivWizStep(4)} style={{marginTop:10,padding:"6px 14px",borderRadius:8,background:"#7c3aed",border:"none",color:"#fff",cursor:"pointer",fontSize:11,fontWeight:700}}>← Volver al paso 4</button>}
                  </div>
                ):(<>
                  {/* Resumen */}
                  <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap"}}>
                    <div style={{flex:1,minWidth:140,background:"#f8fafc",padding:"10px 12px",borderRadius:8,borderLeft:"4px solid #7c3aed"}}>
                      <div style={{fontSize:9,color:"#64748b",fontWeight:600}}>Total fee OC</div>
                      <div style={{fontSize:16,fontWeight:900,color:"#7c3aed"}}>{$$(totFeeAllOC)}</div>
                    </div>
                    <div style={{flex:1,minWidth:140,background:"#f8fafc",padding:"10px 12px",borderRadius:8,borderLeft:"4px solid #16a34a"}}>
                      <div style={{fontSize:9,color:"#64748b",fontWeight:600}}>Total cuotas</div>
                      <div style={{fontSize:16,fontWeight:900,color:"#16a34a"}}>{$$(totCuotasAllOC)}</div>
                    </div>
                    <div style={{flex:1,minWidth:140,background:Math.abs(totFeeAllOC-totCuotasAllOC)<0.01?"#dcfce7":"#fef2f2",padding:"10px 12px",borderRadius:8,borderLeft:`4px solid ${Math.abs(totFeeAllOC-totCuotasAllOC)<0.01?"#16a34a":"#dc2626"}`}}>
                      <div style={{fontSize:9,color:"#64748b",fontWeight:600}}>Diferencia</div>
                      <div style={{fontSize:16,fontWeight:900,color:Math.abs(totFeeAllOC-totCuotasAllOC)<0.01?"#16a34a":"#dc2626"}}>{$$(totFeeAllOC-totCuotasAllOC)}</div>
                    </div>
                  </div>

                  {wizOCs.map(oc=>{
                    const expandido = vivWizOcExpandido===oc.id;
                    const totC = (oc.cuotas||[]).reduce((s,c)=>s+(parseFloat(c.monto_usd)||0),0);
                    const diff = (parseFloat(oc.fee_total_usd)||0) - totC;
                    const diffOk = Math.abs(diff)<0.01;
                    return (
                      <div key={oc.id} style={{border:"1px solid #e2e8f0",borderRadius:10,marginBottom:10,overflow:"hidden"}}>
                        <div onClick={()=>setVivWizOcExpandido(expandido?null:oc.id)}
                          style={{padding:"10px 12px",background:expandido?"#fef3c7":"#fff",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:13,fontWeight:700,color:"#1e293b"}}>{expandido?"▼":"▶"} OC {oc.n_oc} — {oc.cliente_nombre}</div>
                            <div style={{fontSize:10,color:"#64748b",marginTop:2}}>
                              🌿 {oc.especie} · {oc.variedad} ·
                              💰 {$$(oc.fee_total_usd)} ·
                              📋 {(oc.cuotas||[]).length} cuota{(oc.cuotas||[]).length!==1?"s":""}
                              {!diffOk&&<span style={{color:"#dc2626",marginLeft:6}}>⚠️ diff {$$(diff)}</span>}
                            </div>
                          </div>
                        </div>

                        {expandido&&(
                          <div style={{padding:14,background:"#fffbeb",borderTop:"1px solid #fde68a"}}>
                            {/* Lista cuotas existentes */}
                            {(oc.cuotas||[]).length>0&&(
                              <div style={{marginBottom:12,background:"#fff",borderRadius:8,overflow:"hidden",border:"1px solid #fde68a"}}>
                                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                                  <thead>
                                    <tr style={{background:"#fef3c7"}}>
                                      <th style={{padding:"6px 8px",textAlign:"left",fontWeight:700,color:"#78350f"}}>Fecha</th>
                                      <th style={{padding:"6px 8px",textAlign:"right",fontWeight:700,color:"#78350f"}}>Monto USD</th>
                                      <th style={{padding:"6px 8px",textAlign:"left",fontWeight:700,color:"#78350f"}}>Estado</th>
                                      <th style={{padding:"6px 8px",textAlign:"left",fontWeight:700,color:"#78350f"}}>N° Fact.</th>
                                      <th style={{padding:"6px 8px"}}></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(oc.cuotas||[]).map(cu=>(
                                      <tr key={cu.id} style={{borderTop:"1px solid #fef3c7",background:cu.pagado?"#f0fdf4":"#fff"}}>
                                        <td style={{padding:"5px 8px",fontWeight:600}}>{cu.fecha}</td>
                                        <td style={{padding:"5px 8px",textAlign:"right",fontWeight:700,color:"#7c3aed"}}>{$$(cu.monto_usd)}</td>
                                        <td style={{padding:"5px 8px"}}>
                                          <span style={{padding:"2px 6px",borderRadius:10,fontSize:9,fontWeight:700,background:cu.pagado?"#dcfce7":"#fef3c7",color:cu.pagado?"#16a34a":"#d97706"}}>{cu.pagado?"✅ Pagado":"⏳ Por cobrar"}</span>
                                        </td>
                                        <td style={{padding:"5px 8px",fontSize:10}}>{cu.n_factura||"—"}</td>
                                        <td style={{padding:"5px 8px"}}>
                                          <button onClick={()=>quitarCuotaWiz(oc.id, cu.id)} style={{background:"#fef2f2",border:"none",borderRadius:4,padding:"2px 6px",cursor:"pointer",fontSize:10,color:"#991b1b"}}>🗑</button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            {/* Form para agregar cuota nueva */}
                            <div style={{background:"#fff",borderRadius:8,padding:10,border:"1px dashed #fbbf24"}}>
                              <div style={{fontSize:11,fontWeight:700,color:"#78350f",marginBottom:8}}>+ Agregar cuota a esta OC</div>
                              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                                <div>
                                  <label style={{fontSize:10,fontWeight:600,color:"#475569",display:"block",marginBottom:2}}>Fecha estim. <span style={{color:"#dc2626"}}>*</span></label>
                                  <input type="date" value={vivWizCuotaForm.fecha||""} onChange={e=>setVivWizCuotaForm(p=>({...p,fecha:e.target.value}))}
                                    style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,boxSizing:"border-box"}}/>
                                </div>
                                <div>
                                  <label style={{fontSize:10,fontWeight:600,color:"#475569",display:"block",marginBottom:2}}>Monto USD <span style={{color:"#dc2626"}}>*</span></label>
                                  <input type="number" step="0.01" value={vivWizCuotaForm.monto_usd||""} placeholder={diff>0?`Sugerido: ${diff.toFixed(2)}`:""} onChange={e=>setVivWizCuotaForm(p=>({...p,monto_usd:e.target.value}))}
                                    style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,boxSizing:"border-box",textAlign:"right"}}/>
                                </div>
                              </div>
                              <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",marginBottom:8,fontSize:11}}>
                                <input type="checkbox" checked={!!vivWizCuotaForm.pagado} onChange={e=>setVivWizCuotaForm(p=>({...p,pagado:e.target.checked,fecha_pago:e.target.checked&&!p.fecha_pago?new Date().toISOString().slice(0,10):p.fecha_pago}))}/>
                                ✅ Cuota pagada
                              </label>
                              {vivWizCuotaForm.pagado&&(
                                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                                  <div>
                                    <label style={{fontSize:10,fontWeight:600,color:"#475569",display:"block",marginBottom:2}}>Fecha pago</label>
                                    <input type="date" value={vivWizCuotaForm.fecha_pago||""} onChange={e=>setVivWizCuotaForm(p=>({...p,fecha_pago:e.target.value}))}
                                      style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,boxSizing:"border-box"}}/>
                                  </div>
                                  <div>
                                    <label style={{fontSize:10,fontWeight:600,color:"#475569",display:"block",marginBottom:2}}>N° Factura</label>
                                    <input value={vivWizCuotaForm.n_factura||""} onChange={e=>setVivWizCuotaForm(p=>({...p,n_factura:e.target.value}))}
                                      style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,boxSizing:"border-box"}}/>
                                  </div>
                                </div>
                              )}
                              <div style={{marginBottom:8}}>
                                <input value={vivWizCuotaForm.observaciones||""} placeholder="Observaciones..." onChange={e=>setVivWizCuotaForm(p=>({...p,observaciones:e.target.value}))}
                                  style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,boxSizing:"border-box"}}/>
                              </div>
                              <button onClick={()=>agregarCuotaWiz(oc.id)} style={{width:"100%",padding:"7px 12px",borderRadius:6,background:"#f59e0b",border:"none",color:"#fff",cursor:"pointer",fontSize:11,fontWeight:700}}>+ Agregar cuota</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>)}
              </>)}

              {/* Footer wizard: navegación */}
              <div style={{display:"flex",gap:8,justifyContent:"space-between",alignItems:"center",marginTop:18,paddingTop:14,borderTop:"1px solid #e2e8f0"}}>
                <button onClick={()=>setVivModal(false)} style={{padding:"8px 16px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:12}}>Cancelar</button>
                <div style={{display:"flex",gap:8}}>
                  {vivWizStep>1&&<button onClick={()=>setVivWizStep(vivWizStep-1)} style={{padding:"8px 16px",borderRadius:8,border:"1px solid #d1d5db",background:"#f8fafc",cursor:"pointer",fontSize:12,fontWeight:600}}>← Anterior</button>}
                  {vivWizStep<5&&<button onClick={()=>irPaso(vivWizStep+1)} style={{padding:"8px 16px",borderRadius:8,background:"#16a34a",border:"none",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>Siguiente →</button>}
                  {vivWizStep===5&&<button onClick={guardarViv} style={{padding:"8px 18px",borderRadius:8,background:"#16a34a",border:"none",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:700}}>{vivEditId?"💾 Guardar cambios":"✅ Crear vivero"}</button>}
                </div>
              </div>
            </div>
          </div>
          );
        })()}

      </div>
    );
  }

  // ── SEGUIMIENTO TAREAS OSIRIS ──────────────────────────────
  if(subApp==="tareas") {
    return (
      <div style={{fontFamily:"sans-serif",background:"#0d1117",minHeight:"100vh",padding:"20px 20px 40px"}}>
        <NavBar breadcrumbItems={[
          {label:"Mediterra", onClick:onBack},
          {label:"Osiris Hub", onClick:()=>setSubApp(null)},
          {label:"Seguimiento Tareas"},
        ]}/>
        <div style={{background:"#fff",borderRadius:14,padding:20,boxShadow:"0 2px 10px #0001",textAlign:"center",color:"#64748b",minHeight:300,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column"}}>
          <div style={{fontSize:48,marginBottom:16}}>✅</div>
          <h3 style={{color:"#1e293b",margin:"0 0 8px"}}>Seguimiento de Tareas Osiris</h3>
          <p style={{fontSize:13}}>Módulo en construcción — próximamente con las mismas funcionalidades del seguimiento de tareas principal.</p>
        </div>
      </div>
    );
  }

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

      {/* Banner modo solo lectura */}
      {!canIngresos&&(
        <div style={{background:"linear-gradient(135deg,#fef3c7,#fde68a)",border:"1px solid #f59e0b",
          borderRadius:10,padding:"10px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:20}}>👁</span>
          <div style={{flex:1}}>
            <div style={{fontSize:12,fontWeight:800,color:"#92400e"}}>Modo solo lectura</div>
            <div style={{fontSize:11,color:"#78350f"}}>
              {esConsulta
                ? "Tu rol es de Consulta. Puedes visualizar y exportar los datos a Excel, pero no modificarlos."
                : "Tienes permiso de \"Solo ver\" en esta sección. Puedes visualizar y exportar los datos a Excel, pero no modificarlos. Contacta al administrador si necesitas editar."}
            </div>
          </div>
        </div>
      )}

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
        {subTab==="dashboard"        &&<DashboardAnalitico ctData={ctData} feData={feData} rpData={rpData} rcData={rcData} tpData={tpData} especiesMaestro={especiesMaestro}/>}
        {subTab==="graficos"         &&<GraficosPlantas tpData={tpData} rpData={rpData}/>}
        {subTab==="totalPedidos"     &&<TotalPedidos     data={tpData} setData={setTp} rpData={rpData} setRpData={setRp} rcData={rcData} setRcData={setRc} fvData={fvData} setFvData={setFv} can={canIngresos} clientes={clientes} onDeletePedido={id=>setOsirisData(prev=>({...prev,totalPedidos:(prev.totalPedidos||[]).filter(x=>x.id!==id),royaltyPlanta:(prev.royaltyPlanta||[]).filter(x=>x.tpId!==id),royaltyComercial:(prev.royaltyComercial||[]).filter(x=>x.tpId!==id),feeViveros:(prev.feeViveros||[]).filter(x=>x.tpId!==id)}))}/>}
        {subTab==="royaltyPlanta"    &&<RoyaltyPlanta    data={rpData} setData={setRp} tpData={tpData} can={canIngresos} clientes={clientes}/>}
        {subTab==="feeEntrada"       &&<FeeEntrada       data={feData} setData={setFe} ctData={ctData} can={canIngresos} clientes={clientes}/>}
        {subTab==="royaltyComercial" &&<RoyaltyComercial data={rcData} setData={setRc} tpData={tpData} can={canIngresos} clientes={clientes}/>}
        {subTab==="feeViveros"       &&<FeeViveros       data={fvData} setData={setFv} tpData={tpData} can={canIngresos} clientes={clientes}/>}
        {subTab==="reconciliacionIQ" &&<ReconciliacionIQ rpData={rpData} feData={feData} rcData={rcData} tpData={tpData}/>}
      </div>
    </div>
  );
}
