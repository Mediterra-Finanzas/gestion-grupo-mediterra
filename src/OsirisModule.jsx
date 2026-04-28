/* eslint-disable */
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
                    <BadgePago pagado={r.pagado} onChange={v=>upd(r.id,"pagado",v)} onFechaPago={f=>upd(r.id,"fechaPago",f)} can={can}/>
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"center",fontSize:12}}>
                    <Cell val={r.fechaPago||""} onChange={v=>upd(r.id,"fechaPago",v)} type="date" can={can}/>
                  </td>
                  {can&&<td style={{padding:"4px 6px",textAlign:"center"}}>
                    <button onClick={()=>{
                      if(!window.confirm(`¿Eliminar royalty de "${r.cliente}"?`))return;
                      window.auditLog&&window.auditLog("eliminar", {modulo:"osiris", seccion:"Royalty Planta",
                        descripcion:`Eliminó royalty/planta de "${r.cliente}" · ${r.pais} · ${r.nPlantas||0} plantas`,
                        registroId:r.id});
                      setData(prev=>prev.filter(x=>x.id!==r.id));
                    }}
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
                    <button onClick={()=>{
                      if(!window.confirm(`¿Eliminar royalty comercial de "${r.cliente}" ${r.añoCobro}?`))return;
                      window.auditLog&&window.auditLog("eliminar", {modulo:"osiris", seccion:"Royalty Comercial",
                        descripcion:`Eliminó royalty comercial de "${r.cliente}" · ${r.pais} · ${r.añoCobro} T${r.trimCobro} · ${r.ha||0} há`,
                        registroId:r.id});
                      setData(prev=>prev.filter(x=>x.id!==r.id));
                    }}
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
        {can&&<button onClick={()=>setModal(true)}
          style={{background:C.azul,color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",
            cursor:"pointer",fontSize:12,fontWeight:700,alignSelf:"center"}}>
          + Agregar
        </button>}
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
                  <td style={{padding:"7px 10px",fontSize:11}}><Cell val={r.vivero||""} onChange={v=>upd(r.id,"vivero",v)} opts={["Synergiabio","Agromillora"]} can={can}/></td>
                  <td style={{padding:"7px 10px",fontWeight:600}}>
                    <NombreCliente nombre={r.empresa} clientes={clientes} onChange={v=>upd(r.id,"empresa",v)} can={can}/>
                  </td>
                  <td style={{padding:"7px 10px",fontSize:11,color:C.gris}}>{r.pais}</td>
                  <td style={{padding:"7px 10px",fontSize:11,color:C.gris}}><Cell val={r.proforma||""} onChange={v=>upd(r.id,"proforma",v)} can={can}/></td>
                  <td style={{padding:"7px 10px",textAlign:"center",fontWeight:600}}>{N(r.nPlantas)}</td>
                  <td style={{padding:"7px 10px",textAlign:"center",fontWeight:600,color:C.verde}}>
                    <Cell val={r.regalia||""} onChange={v=>upd(r.id,"regalia",parseFloat(v)||0)} type="number" can={can} ph="0.45"/>
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
                    <button onClick={()=>{
                      if(!window.confirm(`¿Eliminar fee vivero de "${r.empresa}"?`))return;
                      window.auditLog&&window.auditLog("eliminar", {modulo:"osiris", seccion:"Fee Viveros",
                        descripcion:`Eliminó fee vivero de "${r.empresa}" · ${r.vivero||""} · ${r.pais||""}`,
                        registroId:r.id});
                      setData(prev=>prev.filter(x=>x.id!==r.id));
                    }}
                      style={{background:"#fee2e2",border:"none",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:12,color:"#991b1b",fontWeight:700}}>×</button>
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
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const FORMAS_PAGO = ["Anual","Semestral","Trimestral","Mensual","A demanda","Contra entrega","Otro"];
const ESTADOS_DHE = ["No iniciado","En proceso","Aprobado","Rechazado","No aplica"];
const ESTADOS_CONTRATO_OBT = ["Borrador","En revisión","Firmado","Vigente","Vencido","Terminado"];
const ESTADOS_OC = ["Borrador","Confirmada","En producción","Entregada","Pagada parcial","Pagada total","Anulada"];
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
  await exportCSV(rows, headers, "Contratos_Osiris", {
    tituloDoc: "Contratos Productores-Exportadores",
    subtituloDoc: "Osiris Plant Management · Grupo Mediterra",
    filtros: `${filtrado.length} contratos exportados`,
  });
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
    headers: ["Viverista","País","Fecha Contrato","Fecha Vencimiento","Forma de Pago","Mes Estim. Pago","Firma Viverista","Firma Osiris","# Variedades","# OC","Días para vencer","Link Contrato","Observaciones"],
    rows: vivData.map(v=>{
      const d = diasParaVencer(v.f_vencimiento);
      return [
        v.viverista||"",
        v.pais||"",
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
  const [obtTab, setObtTab] = useState("general");
  const EMPTY_OBT = {obtentor:"",f_inicio:"",f_vencimiento:"",renovable:false,observaciones:"",
    firma_obtentor:false,firma_osiris:false,doc_legal:"",doc_contrato:"",estado_contrato:"Borrador",
    especies:[],anexos:[],pbr:[]};
  const [obtForm, setObtForm] = useState(EMPTY_OBT);
  // Sub-modales Obtentores
  const [espModal, setEspModal] = useState(false);
  const [espForm, setEspForm] = useState({especie:"",variedad:"",observaciones:"",dhe_estado:"No iniciado",dhe_fecha_aprob:"",dhe_doc:"",dhe_observaciones:""});
  const [pbrModal, setPbrModal] = useState(false);
  const [pbrForm, setPbrForm] = useState({especie:"",pais:"",estado:"Pendiente",f_solicitud:"",f_resolucion:"",doc_solicitud:"",doc_resolucion:"",observaciones:""});
  const [anxModal, setAnxModal] = useState(false);
  const [anxForm, setAnxForm] = useState({descripcion:"",fecha:"",enlace:"",observaciones:""});

  // Hooks para Contratos Viveros (estructura jerárquica)
  const [vivModal, setVivModal] = useState(false);
  const EMPTY_VIV = {viverista:"",pais:"",f_contrato:"",f_vencimiento:"",renovable:false,
    firma_viverista:false,firma_osiris:false,doc_legal:"",doc_contrato:"",observaciones:"",
    mes_pago_estimado:"",forma_pago:"",
    variedades:[],anexos:[],ordenesCompra:[]};
  const [vivForm, setVivForm] = useState(EMPTY_VIV);
  const [vivEditId, setVivEditId] = useState(null);
  const [vivDetalle, setVivDetalle] = useState(null);
  const [vivTab, setVivTab] = useState("general");
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
  const tpData  = osirisData?.totalPedidos    ?? [];
  const rpData  = osirisData?.royaltyPlanta   ?? [];
  // Filtrar huérfanos: excluir registros vinculados a pedidos eliminados
  const tpIds   = useMemo(()=>new Set((osirisData?.totalPedidos??[]).map(r=>r.id)),[osirisData]);
  const rcData  = useMemo(()=>(osirisData?.royaltyComercial??[]).filter(r=>!r.tpId||tpIds.has(r.tpId)),[osirisData,tpIds]);
  const fvData  = useMemo(()=>(osirisData?.feeViveros??[]).filter(r=>!r.tpId||tpIds.has(r.tpId)),[osirisData,tpIds]);

  // feData: vista reactiva — lee osirisData directamente (no variable intermedia)
  // Evita el problema de referencia nueva en cada render con ?? []
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
  const setCt=useCallback(fn=>setOsirisData(prev=>({...prev,contratos:      typeof fn==="function"?fn(prev?.contratos      ??CONTRATOS_INIT):fn})),[setOsirisData]);
  const setTp=useCallback(fn=>setOsirisData(prev=>({...prev,totalPedidos:   typeof fn==="function"?fn(prev?.totalPedidos   ??[]):fn})),[setOsirisData]);
  const setRp=useCallback(fn=>setOsirisData(prev=>({...prev,royaltyPlanta:  typeof fn==="function"?fn(prev?.royaltyPlanta  ??[]):fn})),[setOsirisData]);
  const setFe=useCallback(fn=>setOsirisData(prev=>({...prev,feeEntrada:     typeof fn==="function"?fn(prev?.feeEntrada     ??[]):fn})),[setOsirisData]);
  const setRc=useCallback(fn=>setOsirisData(prev=>({...prev,royaltyComercial:typeof fn==="function"?fn(prev?.royaltyComercial??[]):fn})),[setOsirisData]);
  const setFv=useCallback(fn=>setOsirisData(prev=>({...prev,feeViveros:     typeof fn==="function"?fn(prev?.feeViveros     ??[]):fn})),[setOsirisData]);

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

      {/* Tarjetas de módulos — estilo Allegria */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16,maxWidth:700,margin:"0 auto 30px"}}>
        {/* Ingresos */}
        <div onClick={()=>setSubApp("ingresos")}
          style={{background:"linear-gradient(135deg,#1c2333,#0f766e22)",borderRadius:16,padding:"24px 20px",
            border:"1px solid #0f766e44",cursor:"pointer",transition:"all 0.2s",position:"relative",overflow:"hidden"}}
          onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"}
          onMouseLeave={e=>e.currentTarget.style.transform="translateY(0)"}>
          <div style={{fontSize:32,marginBottom:10}}>💰</div>
          <div style={{fontWeight:800,fontSize:16,color:"#e6edf3",marginBottom:4}}>Ingresos Osiris</div>
          <div style={{fontSize:11,color:"#8b949e",marginBottom:12}}>Royalties, Fee Viveros, Total Pedidos y Resumen de cobros</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {sinConfirmar>0&&<span style={{fontSize:10,background:"rgba(251,191,36,0.2)",color:"#fbbf24",padding:"3px 10px",borderRadius:20,fontWeight:700}}>{sinConfirmar} por confirmar</span>}
            {alertasRC>0&&<span style={{fontSize:10,background:"rgba(239,68,68,0.2)",color:"#f87171",padding:"3px 10px",borderRadius:20,fontWeight:700}}>⚠️ {alertasRC} alerta{alertasRC>1?"s":""}</span>}
          </div>
          <div style={{position:"absolute",right:16,bottom:16,fontSize:20,color:"#0f766e44"}}>→</div>
        </div>

        {/* Contratos Productores-Exportadores */}
        <div onClick={()=>setSubApp("contratos")}
          style={{background:"linear-gradient(135deg,#1c2333,#4338ca22)",borderRadius:16,padding:"24px 20px",
            border:"1px solid #4338ca44",cursor:"pointer",transition:"all 0.2s",position:"relative",overflow:"hidden"}}
          onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"}
          onMouseLeave={e=>e.currentTarget.style.transform="translateY(0)"}>
          <div style={{fontSize:32,marginBottom:10}}>📋</div>
          <div style={{fontWeight:800,fontSize:16,color:"#e6edf3",marginBottom:4}}>Contratos Productores-Exportadores</div>
          <div style={{fontSize:11,color:"#8b949e",marginBottom:12}}>Gestión de contratos, firmas, anexos y condiciones comerciales</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <span style={{fontSize:10,background:"rgba(99,102,241,0.2)",color:"#a5b4fc",padding:"3px 10px",borderRadius:20,fontWeight:700}}>{ctData.length} contratos</span>
            <span style={{fontSize:10,background:"rgba(22,163,74,0.2)",color:"#4ade80",padding:"3px 10px",borderRadius:20,fontWeight:700}}>{ctData.filter(c=>c.firmadoLicenciado&&c.firmadoOsiris).length} firmados</span>
          </div>
          <div style={{position:"absolute",right:16,bottom:16,fontSize:20,color:"#4338ca44"}}>→</div>
        </div>

        {/* Contratos Obtentores */}
        <div onClick={()=>{if(canVerObtentores)setSubApp("obtentores");}}
          style={{background:"linear-gradient(135deg,#1c2333,#7c3aed22)",borderRadius:16,padding:"24px 20px",
            border:"1px solid #7c3aed44",cursor:canVerObtentores?"pointer":"not-allowed",opacity:canVerObtentores?1:0.5,transition:"all 0.2s",position:"relative",overflow:"hidden"}}
          onMouseEnter={e=>{if(canVerObtentores)e.currentTarget.style.transform="translateY(-2px)";}}
          onMouseLeave={e=>e.currentTarget.style.transform="translateY(0)"}>
          <div style={{fontSize:32,marginBottom:10}}>🧬</div>
          <div style={{fontWeight:800,fontSize:16,color:"#e6edf3",marginBottom:4}}>Contratos Obtentores</div>
          <div style={{fontSize:11,color:"#8b949e",marginBottom:12}}>Contratos con obtentores de genética, especies y variedades</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <span style={{fontSize:10,background:"rgba(124,58,237,0.2)",color:"#c4b5fd",padding:"3px 10px",borderRadius:20,fontWeight:700}}>{(osirisData?.obtentores||[]).length} contratos</span>
            {(()=>{
              const arr = osirisData?.obtentores||[];
              const venc = arr.filter(o=>{const d=diasParaVencer(o.f_vencimiento);return d!==null && d<0;}).length;
              const por = arr.filter(o=>{const d=diasParaVencer(o.f_vencimiento);return d!==null && d>=0 && d<=90;}).length;
              return <>
                {venc>0&&<span style={{fontSize:10,background:"rgba(239,68,68,0.2)",color:"#f87171",padding:"3px 10px",borderRadius:20,fontWeight:700}}>⚠️ {venc} vencido{venc>1?"s":""}</span>}
                {por>0&&<span style={{fontSize:10,background:"rgba(251,191,36,0.2)",color:"#fbbf24",padding:"3px 10px",borderRadius:20,fontWeight:700}}>⏳ {por} por vencer</span>}
              </>;
            })()}
          </div>
          <div style={{position:"absolute",right:16,bottom:16,fontSize:20,color:"#7c3aed44"}}>→</div>
        </div>

        {/* Contratos Viveros */}
        <div onClick={()=>{if(canVerViveros)setSubApp("viveros");}}
          style={{background:"linear-gradient(135deg,#1c2333,#16a34a22)",borderRadius:16,padding:"24px 20px",
            border:"1px solid #16a34a44",cursor:canVerViveros?"pointer":"not-allowed",opacity:canVerViveros?1:0.5,transition:"all 0.2s",position:"relative",overflow:"hidden"}}
          onMouseEnter={e=>{if(canVerViveros)e.currentTarget.style.transform="translateY(-2px)";}}
          onMouseLeave={e=>e.currentTarget.style.transform="translateY(0)"}>
          <div style={{fontSize:32,marginBottom:10}}>🌱</div>
          <div style={{fontWeight:800,fontSize:16,color:"#e6edf3",marginBottom:4}}>Contratos Viveros</div>
          <div style={{fontSize:11,color:"#8b949e",marginBottom:12}}>Viveristas autorizados, fee a Osiris y condiciones</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <span style={{fontSize:10,background:"rgba(22,163,74,0.2)",color:"#4ade80",padding:"3px 10px",borderRadius:20,fontWeight:700}}>{(osirisData?.viveros||[]).length} viveros</span>
            {(()=>{
              const arr = osirisData?.viveros||[];
              const venc = arr.filter(v=>{const d=diasParaVencer(v.f_vencimiento);return d!==null && d<0;}).length;
              const por = arr.filter(v=>{const d=diasParaVencer(v.f_vencimiento);return d!==null && d>=0 && d<=90;}).length;
              const totOC = arr.reduce((s,v)=>s+(v.ordenesCompra||[]).length,0);
              return <>
                {totOC>0&&<span style={{fontSize:10,background:"rgba(37,99,235,0.2)",color:"#93c5fd",padding:"3px 10px",borderRadius:20,fontWeight:700}}>📦 {totOC} OC</span>}
                {venc>0&&<span style={{fontSize:10,background:"rgba(239,68,68,0.2)",color:"#f87171",padding:"3px 10px",borderRadius:20,fontWeight:700}}>⚠️ {venc} vencido{venc>1?"s":""}</span>}
                {por>0&&<span style={{fontSize:10,background:"rgba(251,191,36,0.2)",color:"#fbbf24",padding:"3px 10px",borderRadius:20,fontWeight:700}}>⏳ {por} por vencer</span>}
              </>;
            })()}
          </div>
          <div style={{position:"absolute",right:16,bottom:16,fontSize:20,color:"#16a34a44"}}>→</div>
        </div>

        {/* Seguimiento Tareas */}
        <div onClick={()=>setSubApp("tareas")}
          style={{background:"linear-gradient(135deg,#1c2333,#ea580c22)",borderRadius:16,padding:"24px 20px",
            border:"1px solid #ea580c44",cursor:"pointer",transition:"all 0.2s",position:"relative",overflow:"hidden"}}
          onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"}
          onMouseLeave={e=>e.currentTarget.style.transform="translateY(0)"}>
          <div style={{fontSize:32,marginBottom:10}}>✅</div>
          <div style={{fontWeight:800,fontSize:16,color:"#e6edf3",marginBottom:4}}>Seguimiento Tareas</div>
          <div style={{fontSize:11,color:"#8b949e",marginBottom:12}}>Control y seguimiento de tareas del equipo Osiris</div>
          <div style={{position:"absolute",right:16,bottom:16,fontSize:20,color:"#ea580c44"}}>→</div>
        </div>
      </div>

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
        ? <ControlContratos data={ctData} setData={setCt} clientes={clientes} setClientes={setClientes} can={canContratos}/>
        : <div style={{textAlign:"center",padding:40,color:"#94a3b8"}}>Sin acceso a Contratos</div>
      }
      </div>
    </div>
  );

  // ── CONTRATOS OBTENTORES ──────────────────────────────────
  if(subApp==="obtentores") {
    const obtData = osirisData?.obtentores || [];
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
      window.auditLog && window.auditLog(obtEditId?"editar":"crear", {modulo:"osiris", seccion:"Contratos Obtentores",
        descripcion:`${obtEditId?"Editó":"Creó"} contrato obtentor "${item.obtentor}"${item.f_vencimiento?` · vence ${item.f_vencimiento}`:""}`});
      setObtModal(false);
      setObtEditId(null);
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

      const TABS_OBT = [{id:"general",label:"📋 General"},{id:"especies",label:"🌿 Especies/Variedades"},{id:"pbr",label:"📜 PBR"},{id:"legal",label:"⚖️ Legal/Firmas"},{id:"anexos",label:"📎 Anexos"}];
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
                {[["Obtentor","obtentor","text"],["Fecha Inicio","f_inicio","date"],["Fecha Vencimiento","f_vencimiento","date"]].map(([lbl,f,t])=>(
                  <div key={f}>
                    <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>{lbl}</label>
                    <input type={t} disabled={!canObtentores} value={c[f]||""} onChange={e=>updateContrato(c.id,{[f]:e.target.value})}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",background:canObtentores?"#fff":"#f8fafc"}}/>
                  </div>
                ))}
                <div>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Estado del Contrato</label>
                  <select disabled={!canObtentores} value={c.estado_contrato||"Borrador"} onChange={e=>updateContrato(c.id,{estado_contrato:e.target.value})}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",background:canObtentores?"#fff":"#f8fafc"}}>
                    {ESTADOS_CONTRATO_OBT.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"flex",alignItems:"center",gap:8,cursor:canObtentores?"pointer":"default",marginTop:24}}>
                    <input type="checkbox" disabled={!canObtentores} checked={!!c.renovable} onChange={e=>updateContrato(c.id,{renovable:e.target.checked})}/>
                    Contrato renovable
                  </label>
                </div>
                <div style={{gridColumn:"1/-1"}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>📎 Link al contrato (OneDrive/Drive)</label>
                  <input disabled={!canObtentores} value={c.doc_contrato||""} placeholder="https://..." onChange={e=>updateContrato(c.id,{doc_contrato:e.target.value})}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",background:canObtentores?"#fff":"#f8fafc"}}/>
                  {c.doc_contrato&&<a href={c.doc_contrato} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:"#7c3aed",marginTop:6,display:"inline-block",fontWeight:700}}>📄 Abrir contrato</a>}
                </div>
                <div style={{gridColumn:"1/-1"}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Observaciones</label>
                  <textarea disabled={!canObtentores} value={c.observaciones||""} onChange={e=>updateContrato(c.id,{observaciones:e.target.value})}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,minHeight:80,boxSizing:"border-box",background:canObtentores?"#fff":"#f8fafc"}}/>
                </div>
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
                      const dheEstado = e.dhe_estado || "No iniciado";
                      const dheBg = dheEstado==="Aprobado"?"#f0fdf4":dheEstado==="Rechazado"?"#fef2f2":dheEstado==="En proceso"?"#fef9c3":"#fff";
                      const dheColor = dheEstado==="Aprobado"?"#16a34a":dheEstado==="Rechazado"?"#dc2626":dheEstado==="En proceso"?"#d97706":"#64748b";
                      return (
                        <div key={e.id} style={{border:"1px solid #e2e8f0",borderRadius:10,padding:14,background:dheBg}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
                            <div>
                              <span style={{fontWeight:800,fontSize:14,color:"#1e293b"}}>🌿 {e.especie}</span>
                              <span style={{fontSize:13,color:"#475569",marginLeft:6}}>— {e.variedad}</span>
                            </div>
                            <div style={{display:"flex",gap:6,alignItems:"center"}}>
                              <span style={{fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:20,background:dheColor+"22",color:dheColor,border:`1px solid ${dheColor}55`}}>
                                DHE: {dheEstado}
                              </span>
                              {canObtentores&&<button onClick={()=>delEspecie(e.id)} style={{background:"#fef2f2",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11}}>🗑</button>}
                            </div>
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,fontSize:11,marginBottom:8}}>
                            <div>
                              <div style={{color:"#64748b",fontWeight:600,marginBottom:2}}>Estado DHE</div>
                              <select disabled={!canObtentores} value={e.dhe_estado||"No iniciado"} onChange={ev=>updateContrato(c.id,{especies:especies.map(x=>x.id===e.id?{...x,dhe_estado:ev.target.value}:x)})}
                                style={{width:"100%",padding:"4px 8px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:11,boxSizing:"border-box",fontWeight:700,background:dheBg}}>
                                {ESTADOS_DHE.map(s=><option key={s} value={s}>{s}</option>)}
                              </select>
                            </div>
                            <div>
                              <div style={{color:"#64748b",fontWeight:600,marginBottom:2}}>Fecha aprob. DHE</div>
                              <input type="date" disabled={!canObtentores} value={e.dhe_fecha_aprob||""} onChange={ev=>updateContrato(c.id,{especies:especies.map(x=>x.id===e.id?{...x,dhe_fecha_aprob:ev.target.value}:x)})}
                                style={{width:"100%",padding:"4px 8px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:11,boxSizing:"border-box"}}/>
                            </div>
                            <div>
                              <div style={{color:"#64748b",fontWeight:600,marginBottom:2}}>📎 Doc. DHE (URL)</div>
                              <div style={{display:"flex",gap:4,alignItems:"center"}}>
                                <input disabled={!canObtentores} value={e.dhe_doc||""} placeholder="https://..." onChange={ev=>updateContrato(c.id,{especies:especies.map(x=>x.id===e.id?{...x,dhe_doc:ev.target.value}:x)})}
                                  style={{flex:1,padding:"4px 8px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:11,boxSizing:"border-box"}}/>
                                {e.dhe_doc&&<a href={e.dhe_doc} target="_blank" rel="noopener noreferrer" style={{fontSize:14,textDecoration:"none"}}>📎</a>}
                              </div>
                            </div>
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,fontSize:11}}>
                            <div>
                              <div style={{color:"#64748b",fontWeight:600,marginBottom:2}}>Obs. DHE</div>
                              <input disabled={!canObtentores} value={e.dhe_observaciones||""} placeholder="Notas DHE..." onChange={ev=>updateContrato(c.id,{especies:especies.map(x=>x.id===e.id?{...x,dhe_observaciones:ev.target.value}:x)})}
                                style={{width:"100%",padding:"4px 8px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:11,boxSizing:"border-box"}}/>
                            </div>
                            <div>
                              <div style={{color:"#64748b",fontWeight:600,marginBottom:2}}>Obs. variedad</div>
                              <input disabled={!canObtentores} value={e.observaciones||""} placeholder="Notas..." onChange={ev=>updateContrato(c.id,{especies:especies.map(x=>x.id===e.id?{...x,observaciones:ev.target.value}:x)})}
                                style={{width:"100%",padding:"4px 8px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:11,boxSizing:"border-box"}}/>
                            </div>
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
                                background:p.estado==="Aprobado"?"#dcfce7":p.estado==="Rechazado"?"#fee2e2":"#fef9c3",
                                fontWeight:700}}>
                              <option value="Pendiente">⏳ Pendiente</option>
                              <option value="Solicitado">📨 Solicitado</option>
                              <option value="En Revisión">🔍 En Revisión</option>
                              <option value="Aprobado">✅ Aprobado</option>
                              <option value="Rechazado">❌ Rechazado</option>
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
                    <option value="Pendiente">⏳ Pendiente</option>
                    <option value="Solicitado">📨 Solicitado</option>
                    <option value="En Revisión">🔍 En Revisión</option>
                    <option value="Aprobado">✅ Aprobado</option>
                    <option value="Rechazado">❌ Rechazado</option>
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
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>exportarObtentores(obtData)}
                style={{padding:"8px 16px",borderRadius:8,background:"#0f766e",border:"none",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>
                📥 Exportar Excel
              </button>
              {canObtentores&&<button onClick={()=>{setObtForm(EMPTY_OBT);setObtEditId(null);setObtModal(true);}}
                style={{padding:"8px 16px",borderRadius:8,background:"#7c3aed",border:"none",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>
                + Nuevo Contrato
              </button>}
            </div>
          </div>
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
                          <button onClick={e=>{e.stopPropagation();setObtForm({...EMPTY_OBT,...o});setObtEditId(o.id);setObtModal(true);}}
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

        {/* Modal: Nuevo/Editar Obtentor */}
        {obtModal&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}} onClick={()=>setObtModal(false)}>
            <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:24,width:560,maxHeight:"85vh",overflowY:"auto"}}>
              <h3 style={{margin:"0 0 16px",color:"#1e293b"}}>{obtEditId?"✏️ Editar":"➕ Nuevo"} Contrato Obtentor</h3>
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
              <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                <button onClick={()=>setObtModal(false)} style={{padding:"8px 16px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer"}}>Cancelar</button>
                <button onClick={guardarObt} style={{padding:"8px 16px",borderRadius:8,background:"#7c3aed",border:"none",color:"#fff",cursor:"pointer",fontWeight:700}}>{obtEditId?"Guardar cambios":"Crear contrato"}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── CONTRATOS VIVEROS ──────────────────────────────────────
  if(subApp==="viveros") {
    // Migración suave: si llegan datos en formato plano viejo (con especie/variedad/fee_usd a nivel raíz),
    // los convertimos a estructura jerárquica al vuelo (sin alterar Supabase hasta que el usuario edite).
    const vivDataRaw = osirisData?.viveros || [];
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
      item.variedades = item.variedades || [];
      item.anexos     = item.anexos     || [];
      const next = vivEditId ? vivData.map(v=>v.id===vivEditId?item:v) : [...vivData, item];
      setViv(next);
      window.auditLog && window.auditLog(vivEditId?"editar":"crear", {modulo:"osiris", seccion:"Contratos Viveros",
        descripcion:`${vivEditId?"Editó":"Creó"} contrato vivero "${item.viverista}"${item.pais?` · ${item.pais}`:""}${item.f_vencimiento?` · vence ${item.f_vencimiento}`:""}`});
      setVivModal(false);
      setVivEditId(null);
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
                  <span style={{color:vig.color,marginLeft:8,fontWeight:700}}>{vig.icon} {vig.label}</span>
                  {v.doc_contrato&&<a href={v.doc_contrato} target="_blank" rel="noopener noreferrer" style={{marginLeft:10,color:"#86efac",fontWeight:700,textDecoration:"none"}}>📄 Abrir contrato</a>}
                </div>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
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
              {canViveros&&<button onClick={()=>{setVivForm(EMPTY_VIV);setVivEditId(null);setVivModal(true);}}
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
                          <button onClick={e=>{e.stopPropagation();setVivForm({...EMPTY_VIV,...v});setVivEditId(v.id);setVivModal(true);}}
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

        {/* Modal: Nuevo/Editar Vivero */}
        {vivModal&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}} onClick={()=>setVivModal(false)}>
            <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:24,width:560,maxHeight:"85vh",overflowY:"auto"}}>
              <h3 style={{margin:"0 0 16px",color:"#1e293b"}}>{vivEditId?"✏️ Editar":"➕ Nuevo"} Contrato Vivero</h3>
              <div style={{marginBottom:12}}>
                <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Viverista <span style={{color:"#dc2626"}}>*</span></label>
                <input value={vivForm.viverista||""} placeholder="Ej. Vivero La Esperanza, Genética del Sur..." onChange={e=>setVivForm(p=>({...p,viverista:e.target.value}))}
                  style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
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
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginBottom:12}}>
                <input type="checkbox" checked={!!vivForm.renovable} onChange={e=>setVivForm(p=>({...p,renovable:e.target.checked}))}/>
                <span style={{fontSize:12}}>Contrato renovable</span>
              </label>
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
                <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>📎 Link documento legal</label>
                <input value={vivForm.doc_legal||""} placeholder="https://..." onChange={e=>setVivForm(p=>({...p,doc_legal:e.target.value}))}
                  style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
              </div>
              <div style={{marginBottom:12}}>
                <label style={{fontSize:11,fontWeight:600,color:"#475569",display:"block",marginBottom:4}}>Observaciones</label>
                <textarea value={vivForm.observaciones||""} onChange={e=>setVivForm(p=>({...p,observaciones:e.target.value}))}
                  style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,minHeight:60,boxSizing:"border-box"}}/>
              </div>
              <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                <button onClick={()=>setVivModal(false)} style={{padding:"8px 16px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer"}}>Cancelar</button>
                <button onClick={guardarViv} style={{padding:"8px 16px",borderRadius:8,background:"#16a34a",border:"none",color:"#fff",cursor:"pointer",fontWeight:700}}>{vivEditId?"Guardar cambios":"Crear vivero"}</button>
              </div>
            </div>
          </div>
        )}
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
