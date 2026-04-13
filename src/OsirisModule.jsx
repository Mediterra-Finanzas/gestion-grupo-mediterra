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

function BadgeEstado({val,opts,onChange,can}) {
  const MAP = {
    "Por confirmar": {bg:"#fef3c7",col:"#d97706",bdr:"#fde047"},
    "Confirmado":    {bg:"#dcfce7",col:"#16a34a",bdr:"#86efac"},
  };
  const s = MAP[val]||{bg:"#f1f5f9",col:"#64748b",bdr:"#d1d5db"};
  if(!can) return <span style={{background:s.bg,color:s.col,border:`1px solid ${s.bdr}`,borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700}}>{val||"—"}</span>;
  return (
    <select value={val||""} onChange={e=>onChange(e.target.value)}
      style={{borderRadius:20,border:`1px solid ${s.bdr}`,background:s.bg,color:s.col,
        padding:"2px 8px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
      {opts.map(o=><option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// ── Datos base ────────────────────────────────────────────

const PAISES = ["Peru","Mexico","Chile","Corea","España"];
const VIVEROS = ["Synergia Chile","Synergia Mexico","Agromillora Pe","Agromillora"];
const TIPOS   = ["Anticipo","Entrega","Anticipo/Entrega"];

const TOTAL_PEDIDOS_INIT = [
  {
    "id": "tp_xl_1",
    "cliente": "ACP",
    "pais": "Peru",
    "proforma": "IQP2022-006",
    "año": 2022,
    "trim": 4,
    "nPlantas": 9200,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_2",
    "cliente": "Agroberries",
    "pais": "Peru",
    "proforma": "IQP2022-111",
    "año": 2022,
    "trim": 4,
    "nPlantas": 4000,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_3",
    "cliente": "Danper",
    "pais": "Peru",
    "proforma": "DANPER-2022-03",
    "año": 2022,
    "trim": 4,
    "nPlantas": 100,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_4",
    "cliente": "Giddings",
    "pais": "Peru",
    "proforma": "IQP2022-004",
    "año": 2022,
    "trim": 4,
    "nPlantas": 2900,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_5",
    "cliente": "Hass Peru",
    "pais": "Peru",
    "proforma": "IQP2022-125",
    "año": 2022,
    "trim": 4,
    "nPlantas": 200,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_6",
    "cliente": "Mainland",
    "pais": "Mexico",
    "proforma": "IQP2022-005",
    "año": 2022,
    "trim": 4,
    "nPlantas": 16000,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_7",
    "cliente": "Giddings",
    "pais": "Mexico",
    "proforma": "IQP2022-112-M",
    "año": 2023,
    "trim": 1,
    "nPlantas": 96006,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_8",
    "cliente": "Danper",
    "pais": "Peru",
    "proforma": "IQP2022-007",
    "año": 2023,
    "trim": 2,
    "nPlantas": 8700,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_9",
    "cliente": "Don Ricardo",
    "pais": "Peru",
    "proforma": "IQP2022-124",
    "año": 2023,
    "trim": 2,
    "nPlantas": 1000,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_10",
    "cliente": "San Clemente",
    "pais": "Peru",
    "proforma": "IQP2022-002",
    "año": 2023,
    "trim": 2,
    "nPlantas": 13320,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_11",
    "cliente": "Agroberries",
    "pais": "Mexico",
    "proforma": "EXPBER-2023-01",
    "año": 2023,
    "trim": 2,
    "nPlantas": 1728,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_12",
    "cliente": "Mainland",
    "pais": "Mexico",
    "proforma": "IQP2022-005- M",
    "año": 2023,
    "trim": 2,
    "nPlantas": 227250,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_13",
    "cliente": "ACP",
    "pais": "Peru",
    "proforma": "CPRIET-2023-01",
    "año": 2023,
    "trim": 4,
    "nPlantas": 2000,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_14",
    "cliente": "Agroberries",
    "pais": "Peru",
    "proforma": "AGBERR-2022-01",
    "año": 2023,
    "trim": 4,
    "nPlantas": 8000,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_15",
    "cliente": "Agrovision",
    "pais": "Peru",
    "proforma": "AGVINV-2023-02",
    "año": 2023,
    "trim": 4,
    "nPlantas": 26000,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_16",
    "cliente": "Danper",
    "pais": "Peru",
    "proforma": "DANPER-2022-01",
    "año": 2023,
    "trim": 4,
    "nPlantas": 6068,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_17",
    "cliente": "Don Ricardo",
    "pais": "Peru",
    "proforma": "ARICDO-2022-02",
    "año": 2023,
    "trim": 4,
    "nPlantas": 2500,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_18",
    "cliente": "Frusan",
    "pais": "Peru",
    "proforma": "FSFNDO-2023-01",
    "año": 2023,
    "trim": 4,
    "nPlantas": 6000,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_19",
    "cliente": "Hass Peru",
    "pais": "Peru",
    "proforma": "HASSPE-2022-01",
    "año": 2023,
    "trim": 4,
    "nPlantas": 2000,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_20",
    "cliente": "Hass Peru",
    "pais": "Peru",
    "proforma": "HASSPE-2023-01",
    "año": 2023,
    "trim": 4,
    "nPlantas": 5000,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_21",
    "cliente": "Hass Peru",
    "pais": "Peru",
    "proforma": "HARVES-2023-01",
    "año": 2023,
    "trim": 4,
    "nPlantas": 2500,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_22",
    "cliente": "San Clemente",
    "pais": "Peru",
    "proforma": "MOQUEH-2022-02",
    "año": 2023,
    "trim": 4,
    "nPlantas": 255000,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_23",
    "cliente": "Agrovision",
    "pais": "Mexico",
    "proforma": "AGVINV-2023-01",
    "año": 2023,
    "trim": 4,
    "nPlantas": 22500,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_24",
    "cliente": "Giddings",
    "pais": "Mexico",
    "proforma": "Sin Proforma",
    "año": 2023,
    "trim": 4,
    "nPlantas": 400,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_25",
    "cliente": "Mainland",
    "pais": "Mexico",
    "proforma": "MAINLF-2022-02",
    "año": 2023,
    "trim": 4,
    "nPlantas": 12000,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_26",
    "cliente": "Agroberries",
    "pais": "Peru",
    "proforma": "PURABE-2024-01",
    "año": 2024,
    "trim": 1,
    "nPlantas": 250,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_27",
    "cliente": "Danper",
    "pais": "Peru",
    "proforma": "DANPER-2024-01",
    "año": 2024,
    "trim": 1,
    "nPlantas": 7296,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_28",
    "cliente": "Berries Paradise",
    "pais": "Mexico",
    "proforma": "Plantas de AGV",
    "año": 2024,
    "trim": 1,
    "nPlantas": 10000,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_29",
    "cliente": "Central West Produce",
    "pais": "Mexico",
    "proforma": "CWESTP-2023-01",
    "año": 2024,
    "trim": 1,
    "nPlantas": 3300,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_30",
    "cliente": "Hass Peru",
    "pais": "Peru",
    "proforma": "HASSPE-2024-01",
    "año": 2024,
    "trim": 2,
    "nPlantas": 25,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_31",
    "cliente": "Hass Peru",
    "pais": "Peru",
    "proforma": "HARVES-2024-01",
    "año": 2024,
    "trim": 2,
    "nPlantas": 25,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_32",
    "cliente": "Berries Paradise",
    "pais": "Mexico",
    "proforma": "BPARAD-2023-01",
    "año": 2024,
    "trim": 2,
    "nPlantas": 4284,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_33",
    "cliente": "Giddings",
    "pais": "Mexico",
    "proforma": "GIDMEX-2024-01",
    "año": 2024,
    "trim": 2,
    "nPlantas": 12672,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_34",
    "cliente": "Agroextiende",
    "pais": "Peru",
    "proforma": "AGROEX-CL-2024-03",
    "año": 2024,
    "trim": 3,
    "nPlantas": 800,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_35",
    "cliente": "Hass Peru",
    "pais": "Peru",
    "proforma": "HARVES-2023-01",
    "año": 2024,
    "trim": 3,
    "nPlantas": 1500,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_36",
    "cliente": "Mainland",
    "pais": "Mexico",
    "proforma": "MAIFAR-2024-01",
    "año": 2024,
    "trim": 3,
    "nPlantas": 11500,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_37",
    "cliente": "Collipulli",
    "pais": "Chile",
    "proforma": "ASELVA-2024-01",
    "año": 2024,
    "trim": 3,
    "nPlantas": 270,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_38",
    "cliente": "SQM",
    "pais": "Chile",
    "proforma": "SQMSDH-2024-01",
    "año": 2024,
    "trim": 3,
    "nPlantas": 420,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_39",
    "cliente": "Agroextiende",
    "pais": "Peru",
    "proforma": "AGROEX-CL-2024-01",
    "año": 2024,
    "trim": 4,
    "nPlantas": 50000,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_40",
    "cliente": "Frusan",
    "pais": "Peru",
    "proforma": "FRUSAN-CL-2024-01",
    "año": 2024,
    "trim": 4,
    "nPlantas": 5160,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_41",
    "cliente": "Hass Peru",
    "pais": "Peru",
    "proforma": "HASSPE-2024-01",
    "año": 2024,
    "trim": 4,
    "nPlantas": 342,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_42",
    "cliente": "Agroextiende",
    "pais": "Peru",
    "proforma": "AGROEX-CL-2024-04",
    "año": 2025,
    "trim": 1,
    "nPlantas": 200000,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_43",
    "cliente": "Allpa Farms",
    "pais": "Peru",
    "proforma": "ALLPAF-2024-01",
    "año": 2025,
    "trim": 1,
    "nPlantas": 325475,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_44",
    "cliente": "Pura Berries",
    "pais": "Peru",
    "proforma": "PURABE-CL-2024-03",
    "año": 2025,
    "trim": 1,
    "nPlantas": 1500,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_45",
    "cliente": "Gourmet",
    "pais": "Peru",
    "proforma": "GOURME-CL-2025-01",
    "año": 2025,
    "trim": 1,
    "nPlantas": 400,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_46",
    "cliente": "Mainland",
    "pais": "Mexico",
    "proforma": "MAIFAR-2024-02",
    "año": 2025,
    "trim": 1,
    "nPlantas": 75000,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_47",
    "cliente": "Agroextiende",
    "pais": "Peru",
    "proforma": "AGROEX-CL-2024-02",
    "año": 2025,
    "trim": 2,
    "nPlantas": 150000,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_48",
    "cliente": "Frusan",
    "pais": "Peru",
    "proforma": "FRUSAN-CL-2024-01",
    "año": 2025,
    "trim": 2,
    "nPlantas": 400,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_49",
    "cliente": "Pura Berries",
    "pais": "Peru",
    "proforma": "PURABE-CL-2024-03",
    "año": 2025,
    "trim": 2,
    "nPlantas": 7500,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_50",
    "cliente": "Mainland",
    "pais": "Mexico",
    "proforma": "MAIFAR-2024-03",
    "año": 2025,
    "trim": 2,
    "nPlantas": 1000,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_51",
    "cliente": "Mainland",
    "pais": "Mexico",
    "proforma": "MAIFAR-2024-03",
    "año": 2025,
    "trim": 2,
    "nPlantas": 1000,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_52",
    "cliente": "Mainland",
    "pais": "Mexico",
    "proforma": "MAIFAR-MX-2024-04",
    "año": 2025,
    "trim": 2,
    "nPlantas": 50000,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_53",
    "cliente": "Danper",
    "pais": "Peru",
    "proforma": "DANPER-2024-02",
    "año": 2025,
    "trim": 3,
    "nPlantas": 512,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_54",
    "cliente": "Hector Esquivel",
    "pais": "Chile",
    "proforma": "HEHSPA-CL-2024-01",
    "año": 2025,
    "trim": 3,
    "nPlantas": 12000,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_55",
    "cliente": "Danper",
    "pais": "Peru",
    "proforma": "DANPER-CL-2025-01",
    "año": 2025,
    "trim": 4,
    "nPlantas": 24000,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_56",
    "cliente": "Danper",
    "pais": "Peru",
    "proforma": "2025/0036",
    "año": 2025,
    "trim": 4,
    "nPlantas": 1000,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_57",
    "cliente": "Frusan",
    "pais": "Peru",
    "proforma": "FRUSAN-CL-2024-01",
    "año": 2025,
    "trim": 4,
    "nPlantas": 400,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_58",
    "cliente": "Hass Peru",
    "pais": "Peru",
    "proforma": "HARVES-2024-01",
    "año": 2025,
    "trim": 4,
    "nPlantas": 384,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_59",
    "cliente": "Hass Peru",
    "pais": "Peru",
    "proforma": "HASSPE-CL-2024-02",
    "año": 2025,
    "trim": 4,
    "nPlantas": 75835,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_60",
    "cliente": "Hass Peru",
    "pais": "Peru",
    "proforma": "AOLMOS-CL-2025-02",
    "año": 2025,
    "trim": 4,
    "nPlantas": 190950,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_61",
    "cliente": "Pura Berries",
    "pais": "Peru",
    "proforma": "PURABE-CL-2024-04",
    "año": 2025,
    "trim": 4,
    "nPlantas": 250735,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_62",
    "cliente": "San Clemente",
    "pais": "Peru",
    "proforma": "MOQUEH-2024-01",
    "año": 2025,
    "trim": 4,
    "nPlantas": 70000,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_63",
    "cliente": "Vanguard",
    "pais": "Peru",
    "proforma": "OLIVOS-CL-2024-01",
    "año": 2025,
    "trim": 4,
    "nPlantas": 1555706,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_64",
    "cliente": "Gourmet",
    "pais": "Peru",
    "proforma": "2025/0068",
    "año": 2025,
    "trim": 4,
    "nPlantas": 250,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_65",
    "cliente": "La Calera",
    "pais": "Peru",
    "proforma": "BRIDGE-PE-2025-01",
    "año": 2025,
    "trim": 4,
    "nPlantas": 3500,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_66",
    "cliente": "Agroextiende",
    "pais": "Peru",
    "proforma": "AGM 2025 - 2705",
    "año": 2026,
    "trim": 1,
    "nPlantas": 421400,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_67",
    "cliente": "Frusan",
    "pais": "Peru",
    "proforma": "FRUSAN-CL-2024-02",
    "año": 2026,
    "trim": 1,
    "nPlantas": 305185,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_68",
    "cliente": "Mainland",
    "pais": "Mexico",
    "proforma": "MAIFAR-MX-2024-05",
    "año": 2026,
    "trim": 1,
    "nPlantas": 150000,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_69",
    "cliente": "Dole Mexico",
    "pais": "Mexico",
    "proforma": "BLUFAR-MX-2025-01",
    "año": 2026,
    "trim": 1,
    "nPlantas": 2100,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_70",
    "cliente": "Gourmet",
    "pais": "Mexico",
    "proforma": "GBFFAR-MX-2026-01",
    "año": 2026,
    "trim": 1,
    "nPlantas": 950,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_71",
    "cliente": "Integrity/Talsa",
    "pais": "Peru",
    "proforma": "INTFAR-PE-2026-01",
    "año": 2026,
    "trim": 1,
    "nPlantas": 2100,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_72",
    "cliente": "Mainland",
    "pais": "Mexico",
    "proforma": "MAIFAR-MX-2025-02",
    "año": 2026,
    "trim": 2,
    "nPlantas": 250000,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_73",
    "cliente": "Danper",
    "pais": "Peru",
    "proforma": "DANPER-2024-02",
    "año": 2026,
    "trim": 3,
    "nPlantas": 512,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_74",
    "cliente": "Mainland",
    "pais": "Mexico",
    "proforma": "MAIFAR-2024-03",
    "año": 2026,
    "trim": 3,
    "nPlantas": 1000,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_75",
    "cliente": "KJ Orchard",
    "pais": "Corea",
    "proforma": "KJORCH-CL-2025-01",
    "año": 2026,
    "trim": 3,
    "nPlantas": 12096,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_76",
    "cliente": "Danper",
    "pais": "Peru",
    "proforma": "DANPER-CL-2025-0148",
    "año": 2026,
    "trim": 4,
    "nPlantas": 884271,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_77",
    "cliente": "Frusan",
    "pais": "Peru",
    "proforma": "HUARME-CL-2026-0046",
    "año": 2026,
    "trim": 4,
    "nPlantas": 285405,
    "estado": "Confirmado"
  },
  {
    "id": "tp_xl_78",
    "cliente": "Frunatural",
    "pais": "Mexico",
    "proforma": "FRUNAT-MX-2026-01",
    "año": 2027,
    "trim": 1,
    "nPlantas": 208500,
    "estado": "Confirmado"
  }
];

const ROYALTY_PLANTA_INIT = [
  {
    "id": "rp_xl_1",
    "cliente": "Collipulli",
    "pais": "Chile",
    "año": 2024,
    "trim": 3,
    "nPlantas": 270,
    "usdPlanta": 1.0,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2024-07-17",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_2",
    "cliente": "SQM",
    "pais": "Chile",
    "año": 2024,
    "trim": 3,
    "nPlantas": 420,
    "usdPlanta": 1.0,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2024-12-05",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_3",
    "cliente": "Agroextiende",
    "pais": "Peru",
    "año": 2024,
    "trim": 3,
    "nPlantas": 600,
    "usdPlanta": 1.0,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2024-12-23",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_4",
    "cliente": "Agroextiende",
    "pais": "Peru",
    "año": 2024,
    "trim": 4,
    "nPlantas": 50000,
    "usdPlanta": 1.0,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2024-12-23",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_5",
    "cliente": "Gourmet",
    "pais": "Peru",
    "año": 2025,
    "trim": 1,
    "nPlantas": 400,
    "usdPlanta": 1.0,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2025-03-01",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_6",
    "cliente": "Pura Berries",
    "pais": "Peru",
    "año": 2025,
    "trim": 1,
    "nPlantas": 1500,
    "usdPlanta": 1.0,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2025-04-01",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_7",
    "cliente": "Mainland",
    "pais": "Mexico",
    "año": 2025,
    "trim": 2,
    "nPlantas": 16000,
    "usdPlanta": 1.0,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2025-04-11",
    "vivero": "Synergia Mexico"
  },
  {
    "id": "rp_xl_8",
    "cliente": "Mainland",
    "pais": "Mexico",
    "año": 2025,
    "trim": 2,
    "nPlantas": 24500,
    "usdPlanta": 1.0,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2025-04-29",
    "vivero": "Synergia Mexico"
  },
  {
    "id": "rp_xl_9",
    "cliente": "Agroextiende",
    "pais": "Peru",
    "año": 2025,
    "trim": 2,
    "nPlantas": 175000,
    "usdPlanta": 1.0,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2025-05-01",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_10",
    "cliente": "Agroextiende",
    "pais": "Peru",
    "año": 2025,
    "trim": 2,
    "nPlantas": 87500,
    "usdPlanta": 1.0,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2025-06-01",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_11",
    "cliente": "Pura Berries",
    "pais": "Peru",
    "año": 2025,
    "trim": 2,
    "nPlantas": 7500,
    "usdPlanta": 1.0,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2025-06-01",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_12",
    "cliente": "Agroextiende",
    "pais": "Peru",
    "año": 2025,
    "trim": 2,
    "nPlantas": 87700,
    "usdPlanta": 1.0,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2025-07-01",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_13",
    "cliente": "Mainland",
    "pais": "Mexico",
    "año": 2025,
    "trim": 2,
    "nPlantas": 37510,
    "usdPlanta": 1.0,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2025-07-04",
    "vivero": "Synergia Mexico"
  },
  {
    "id": "rp_xl_14",
    "cliente": "Mainland",
    "pais": "Mexico",
    "año": 2025,
    "trim": 3,
    "nPlantas": 21230,
    "usdPlanta": 1.0,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2025-09-01",
    "vivero": "Synergia Mexico"
  },
  {
    "id": "rp_xl_15",
    "cliente": "Mainland",
    "pais": "Mexico",
    "año": 2025,
    "trim": 3,
    "nPlantas": 10000,
    "usdPlanta": 1.0,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2025-09-01",
    "vivero": "Synergia Mexico"
  },
  {
    "id": "rp_xl_16",
    "cliente": "Berries Paradise",
    "pais": "Mexico",
    "año": 2025,
    "trim": 2,
    "nPlantas": 384,
    "usdPlanta": 1.0,
    "nOC": "",
    "nFact": "",
    "pagado": false,
    "fechaPago": "2025-10-01",
    "vivero": "Synergia Mexico"
  },
  {
    "id": "rp_xl_17",
    "cliente": "Allpa",
    "pais": "Peru",
    "año": 2025,
    "trim": 2,
    "nPlantas": 325475,
    "usdPlanta": 1.0,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2025-10-01",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_18",
    "cliente": "Mainland",
    "pais": "Mexico",
    "año": 2025,
    "trim": 3,
    "nPlantas": 1290,
    "usdPlanta": 1.0,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2025-10-01",
    "vivero": "Synergia Mexico"
  },
  {
    "id": "rp_xl_19",
    "cliente": "Mainland",
    "pais": "Mexico",
    "año": 2025,
    "trim": 3,
    "nPlantas": 4710,
    "usdPlanta": 1.0,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2025-10-01",
    "vivero": "Synergia Mexico"
  },
  {
    "id": "rp_xl_20",
    "cliente": "Gourmet",
    "pais": "Peru",
    "año": 2025,
    "trim": 4,
    "nPlantas": 250,
    "usdPlanta": 1.0,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2025-11-01",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_21",
    "cliente": "Pura Berries",
    "pais": "Peru",
    "año": 2025,
    "trim": 4,
    "nPlantas": 250735,
    "usdPlanta": 1.0,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2025-11-01",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_22",
    "cliente": "Hass Peru",
    "pais": "Peru",
    "año": 2025,
    "trim": 4,
    "nPlantas": 190950,
    "usdPlanta": 1.0,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2025-11-01",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_23",
    "cliente": "Hass Peru",
    "pais": "Peru",
    "año": 2025,
    "trim": 4,
    "nPlantas": 75835,
    "usdPlanta": 1.0577,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2025-11-01",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_24",
    "cliente": "Danper",
    "pais": "Peru",
    "año": 2025,
    "trim": 4,
    "nPlantas": 24000,
    "usdPlanta": 1.607,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2025-11-01",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_25",
    "cliente": "Danper",
    "pais": "Peru",
    "año": 2025,
    "trim": 4,
    "nPlantas": 1000,
    "usdPlanta": 1.0,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2025-11-01",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_26",
    "cliente": "Vanguard",
    "pais": "Peru",
    "año": 2025,
    "trim": 4,
    "nPlantas": 182688,
    "usdPlanta": 1.0,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2025-11-01",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_27",
    "cliente": "San Clemente",
    "pais": "Peru",
    "año": 2025,
    "trim": 4,
    "nPlantas": 70000,
    "usdPlanta": 1.0,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2025-12-01",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_28",
    "cliente": "Hector Esquivel",
    "pais": "Chile",
    "año": 2025,
    "trim": 4,
    "nPlantas": 12000,
    "usdPlanta": 1.0,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2025-12-01",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_29",
    "cliente": "La Calera",
    "pais": "Peru",
    "año": 2025,
    "trim": 1,
    "nPlantas": 3500,
    "usdPlanta": 1.0,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2025-12-01",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_30",
    "cliente": "Vanguard",
    "pais": "Peru",
    "año": 2026,
    "trim": 1,
    "nPlantas": 422776,
    "usdPlanta": 0.85,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2026-01-01",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_31",
    "cliente": "Frusan",
    "pais": "Peru",
    "año": 2025,
    "trim": 4,
    "nPlantas": 305185,
    "usdPlanta": 0.8643,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2026-02-01",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_32",
    "cliente": "Vanguard",
    "pais": "Peru",
    "año": 2026,
    "trim": 1,
    "nPlantas": 298944,
    "usdPlanta": 0.85,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2026-02-01",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_33",
    "cliente": "Mainland",
    "pais": "Mexico",
    "año": 2026,
    "trim": 1,
    "nPlantas": 150000,
    "usdPlanta": 0.4936,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2026-02-01",
    "vivero": "Synergia Mexico"
  },
  {
    "id": "rp_xl_34",
    "cliente": "Integrity/Talsa",
    "pais": "Peru",
    "año": 2026,
    "trim": 1,
    "nPlantas": 2100,
    "usdPlanta": 0.85,
    "nOC": "",
    "nFact": "",
    "pagado": false,
    "fechaPago": "2026-03-01",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_35",
    "cliente": "Mainland",
    "pais": "Mexico",
    "año": 2026,
    "trim": 1,
    "nPlantas": 150000,
    "usdPlanta": 0.0133,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2026-03-13",
    "vivero": "Synergia Mexico"
  },
  {
    "id": "rp_xl_36",
    "cliente": "Mainland",
    "pais": "Mexico",
    "año": 2026,
    "trim": 1,
    "nPlantas": 150000,
    "usdPlanta": 0.343,
    "nOC": "",
    "nFact": "",
    "pagado": false,
    "fechaPago": "2026-03-31",
    "vivero": "Synergia Mexico"
  },
  {
    "id": "rp_xl_37",
    "cliente": "Vanguard",
    "pais": "Peru",
    "año": 2026,
    "trim": 1,
    "nPlantas": 222559,
    "usdPlanta": 0.85,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2026-03-31",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_38",
    "cliente": "Dole Mexico",
    "pais": "Mexico",
    "año": 2026,
    "trim": 1,
    "nPlantas": 2100,
    "usdPlanta": 0.85,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2026-03-31",
    "vivero": "Synergia Mexico"
  },
  {
    "id": "rp_xl_39",
    "cliente": "Gourmet",
    "pais": "Mexico",
    "año": 2026,
    "trim": 1,
    "nPlantas": 950,
    "usdPlanta": 0.85,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2026-03-31",
    "vivero": "Synergia Mexico"
  },
  {
    "id": "rp_xl_40",
    "cliente": "Agroextiende",
    "pais": "Peru",
    "año": 2026,
    "trim": 1,
    "nPlantas": 105840,
    "usdPlanta": 0.85,
    "nOC": "",
    "nFact": "",
    "pagado": true,
    "fechaPago": "2026-03-31",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_41",
    "cliente": "Vanguard",
    "pais": "Peru",
    "año": 2026,
    "trim": 1,
    "nPlantas": 233708,
    "usdPlanta": 0.85,
    "nOC": "",
    "nFact": "",
    "pagado": false,
    "fechaPago": "2026-04-30",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_42",
    "cliente": "Agroextiende",
    "pais": "Peru",
    "año": 2026,
    "trim": 1,
    "nPlantas": 145527,
    "usdPlanta": 0.85,
    "nOC": "",
    "nFact": "",
    "pagado": false,
    "fechaPago": "2026-04-30",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_43",
    "cliente": "Mainland",
    "pais": "Mexico",
    "año": 2026,
    "trim": 2,
    "nPlantas": 250000,
    "usdPlanta": 0.34,
    "nOC": "",
    "nFact": "",
    "pagado": false,
    "fechaPago": "2026-05-01",
    "vivero": "Synergia Mexico"
  },
  {
    "id": "rp_xl_44",
    "cliente": "Agroextiende",
    "pais": "Peru",
    "año": 2026,
    "trim": 1,
    "nPlantas": 174634,
    "usdPlanta": 0.85,
    "nOC": "",
    "nFact": "",
    "pagado": false,
    "fechaPago": "2026-05-31",
    "vivero": "Agromillora Pe"
  },
  {
    "id": "rp_xl_45",
    "cliente": "Vanguard",
    "pais": "Peru",
    "año": 2026,
    "trim": 1,
    "nPlantas": 195389,
    "usdPlanta": 0.85,
    "nOC": "",
    "nFact": "",
    "pagado": false,
    "fechaPago": "2026-05-31",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_46",
    "cliente": "Mainland",
    "pais": "Mexico",
    "año": 2026,
    "trim": 1,
    "nPlantas": 11760,
    "usdPlanta": 0.85,
    "nOC": "",
    "nFact": "",
    "pagado": false,
    "fechaPago": "2026-09-01",
    "vivero": "Synergia Mexico"
  },
  {
    "id": "rp_xl_47",
    "cliente": "Mainland",
    "pais": "Mexico",
    "año": 2026,
    "trim": 2,
    "nPlantas": 250000,
    "usdPlanta": 0.51,
    "nOC": "",
    "nFact": "",
    "pagado": false,
    "fechaPago": "2026-09-01",
    "vivero": "Synergia Mexico"
  },
  {
    "id": "rp_xl_48",
    "cliente": "Danper",
    "pais": "Peru",
    "año": 2026,
    "trim": 3,
    "nPlantas": 512,
    "usdPlanta": 0.85,
    "nOC": "",
    "nFact": "",
    "pagado": false,
    "fechaPago": "2026-09-01",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_49",
    "cliente": "Mainland",
    "pais": "Mexico",
    "año": 2026,
    "trim": 3,
    "nPlantas": 1000,
    "usdPlanta": 0.85,
    "nOC": "",
    "nFact": "",
    "pagado": false,
    "fechaPago": "2026-09-01",
    "vivero": "Synergia Mexico"
  },
  {
    "id": "rp_xl_50",
    "cliente": "Danper",
    "pais": "Peru",
    "año": 2026,
    "trim": 4,
    "nPlantas": 884271,
    "usdPlanta": 0.85,
    "nOC": "",
    "nFact": "",
    "pagado": false,
    "fechaPago": "2026-10-01",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_51",
    "cliente": "Frusan",
    "pais": "Peru",
    "año": 2026,
    "trim": 4,
    "nPlantas": 285405,
    "usdPlanta": 1.0,
    "nOC": "",
    "nFact": "",
    "pagado": false,
    "fechaPago": "2026-12-01",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_52",
    "cliente": "Frunatural",
    "pais": "Mexico",
    "año": 2027,
    "trim": 1,
    "nPlantas": 136500,
    "usdPlanta": 1.0,
    "nOC": "",
    "nFact": "",
    "pagado": false,
    "fechaPago": "2027-02-01",
    "vivero": "Synergia Mexico"
  },
  {
    "id": "rp_xl_53",
    "cliente": "Frunatural",
    "pais": "Mexico",
    "año": 2027,
    "trim": 2,
    "nPlantas": 72000,
    "usdPlanta": 1.0,
    "nOC": "",
    "nFact": "",
    "pagado": false,
    "fechaPago": "2027-05-01",
    "vivero": "Synergia Mexico"
  },
  {
    "id": "rp_xl_54",
    "cliente": "Frusan",
    "pais": "Peru",
    "año": 2025,
    "trim": 2,
    "nPlantas": 400,
    "usdPlanta": 1.0,
    "nOC": "",
    "nFact": "",
    "pagado": false,
    "fechaPago": "",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_55",
    "cliente": "Danper",
    "pais": "Peru",
    "año": 2025,
    "trim": 3,
    "nPlantas": 512,
    "usdPlanta": 24.5703,
    "nOC": "",
    "nFact": "",
    "pagado": false,
    "fechaPago": "",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_56",
    "cliente": "Frusan",
    "pais": "Peru",
    "año": 2025,
    "trim": 4,
    "nPlantas": 400,
    "usdPlanta": 13.25,
    "nOC": "",
    "nFact": "",
    "pagado": false,
    "fechaPago": "",
    "vivero": "Synergia Chile"
  },
  {
    "id": "rp_xl_57",
    "cliente": "Hass Peru",
    "pais": "Peru",
    "año": 2025,
    "trim": 4,
    "nPlantas": 384,
    "usdPlanta": 11.6927,
    "nOC": "",
    "nFact": "",
    "pagado": false,
    "fechaPago": "",
    "vivero": "Synergia Chile"
  }
];

const ROYALTY_COMERCIAL_INIT = [
  {
    "id": "rc_xl_1",
    "cliente": "Agroextiende",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2026,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_2",
    "cliente": "Agroextiende",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2027,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_3",
    "cliente": "Agroextiende",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2028,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_4",
    "cliente": "Agroextiende",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2029,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_5",
    "cliente": "Agroextiende",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2030,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_6",
    "cliente": "Allpa",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2026,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_7",
    "cliente": "Allpa",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2027,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_8",
    "cliente": "Allpa",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2028,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_9",
    "cliente": "Allpa",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2029,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_10",
    "cliente": "Allpa",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2030,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_11",
    "cliente": "Frusan",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2027,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_12",
    "cliente": "Frusan",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2028,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_13",
    "cliente": "Frusan",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2029,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_14",
    "cliente": "Frusan",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2030,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_15",
    "cliente": "Hass Peru",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2027,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_16",
    "cliente": "Hass Peru",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2028,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_17",
    "cliente": "Hass Peru",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2029,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_18",
    "cliente": "Hass Peru",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2030,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_19",
    "cliente": "Pura Berries",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2027,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_20",
    "cliente": "Pura Berries",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2028,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_21",
    "cliente": "Pura Berries",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2029,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_22",
    "cliente": "Pura Berries",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2030,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_23",
    "cliente": "San Clemente",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2025,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": true
  },
  {
    "id": "rc_xl_24",
    "cliente": "San Clemente",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2026,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_25",
    "cliente": "San Clemente",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2027,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_26",
    "cliente": "San Clemente",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2028,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_27",
    "cliente": "San Clemente",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2029,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_28",
    "cliente": "San Clemente",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2030,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_29",
    "cliente": "Vanguard",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2027,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_30",
    "cliente": "Vanguard",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2028,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_31",
    "cliente": "Vanguard",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2029,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_32",
    "cliente": "Vanguard",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2030,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_33",
    "cliente": "Giddings",
    "pais": "Mexico",
    "trimCobro": 3,
    "añoCobro": 2025,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": true
  },
  {
    "id": "rc_xl_34",
    "cliente": "Mainland",
    "pais": "Mexico",
    "trimCobro": 3,
    "añoCobro": 2025,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": true
  },
  {
    "id": "rc_xl_35",
    "cliente": "Mainland",
    "pais": "Mexico",
    "trimCobro": 3,
    "añoCobro": 2026,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_36",
    "cliente": "Mainland",
    "pais": "Mexico",
    "trimCobro": 3,
    "añoCobro": 2027,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_37",
    "cliente": "Mainland",
    "pais": "Mexico",
    "trimCobro": 3,
    "añoCobro": 2028,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_38",
    "cliente": "Mainland",
    "pais": "Mexico",
    "trimCobro": 3,
    "añoCobro": 2029,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_39",
    "cliente": "Mainland",
    "pais": "Mexico",
    "trimCobro": 3,
    "añoCobro": 2030,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_40",
    "cliente": "Hector Esquivel",
    "pais": "Chile",
    "trimCobro": 2,
    "añoCobro": 2028,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_41",
    "cliente": "Hector Esquivel",
    "pais": "Chile",
    "trimCobro": 2,
    "añoCobro": 2029,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_42",
    "cliente": "Hector Esquivel",
    "pais": "Chile",
    "trimCobro": 2,
    "añoCobro": 2030,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_43",
    "cliente": "Danper",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2028,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_44",
    "cliente": "Danper",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2029,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  },
  {
    "id": "rc_xl_45",
    "cliente": "Danper",
    "pais": "Peru",
    "trimCobro": 2,
    "añoCobro": 2030,
    "ha": 0,
    "nPlantas": 0,
    "usdHa": 3000,
    "nFact": "",
    "pagado": false
  }
];

const FEE_ENTRADA_INIT = [
  {
    "id": "fe_xl_1",
    "cliente": "ACP",
    "pais": "Peru",
    "nFact": "",
    "pagado": true,
    "fechaPago": "",
    "montoUSD": 30000.0,
    "detalle": "Con Devolución"
  },
  {
    "id": "fe_xl_2",
    "cliente": "Agroberries",
    "pais": "Peru",
    "nFact": "",
    "pagado": true,
    "fechaPago": "",
    "montoUSD": 30000.0,
    "detalle": "Con Devolución"
  },
  {
    "id": "fe_xl_3",
    "cliente": "Agroextiende",
    "pais": "Peru",
    "nFact": "",
    "pagado": true,
    "fechaPago": "",
    "montoUSD": 30000.0,
    "detalle": "Sin Devolución"
  },
  {
    "id": "fe_xl_4",
    "cliente": "Agrovision",
    "pais": "Peru",
    "nFact": "",
    "pagado": true,
    "fechaPago": "",
    "montoUSD": 30000.0,
    "detalle": "Con Devolución"
  },
  {
    "id": "fe_xl_5",
    "cliente": "Danper",
    "pais": "Peru",
    "nFact": "",
    "pagado": true,
    "fechaPago": "",
    "montoUSD": 30000.0,
    "detalle": "Con Devolución"
  },
  {
    "id": "fe_xl_6",
    "cliente": "Don Ricardo",
    "pais": "Peru",
    "nFact": "",
    "pagado": true,
    "fechaPago": "",
    "montoUSD": 30000.0,
    "detalle": "Con Devolución"
  },
  {
    "id": "fe_xl_7",
    "cliente": "Frusan",
    "pais": "Peru",
    "nFact": "",
    "pagado": true,
    "fechaPago": "",
    "montoUSD": 30000.0,
    "detalle": "Con Devolución"
  },
  {
    "id": "fe_xl_8",
    "cliente": "Giddings",
    "pais": "Peru",
    "nFact": "",
    "pagado": true,
    "fechaPago": "",
    "montoUSD": 30000.0,
    "detalle": "Con Devolución"
  },
  {
    "id": "fe_xl_9",
    "cliente": "Gourmet",
    "pais": "Peru",
    "nFact": "",
    "pagado": true,
    "fechaPago": "",
    "montoUSD": 30000.0,
    "detalle": "Sin Devolución"
  },
  {
    "id": "fe_xl_10",
    "cliente": "Hass Peru",
    "pais": "Peru",
    "nFact": "",
    "pagado": true,
    "fechaPago": "",
    "montoUSD": 30000.0,
    "detalle": "Con Devolución"
  },
  {
    "id": "fe_xl_11",
    "cliente": "San Clemente",
    "pais": "Peru",
    "nFact": "",
    "pagado": true,
    "fechaPago": "",
    "montoUSD": 30000.0,
    "detalle": "Con Devolución"
  },
  {
    "id": "fe_xl_12",
    "cliente": "Vanguard",
    "pais": "Peru",
    "nFact": "",
    "pagado": true,
    "fechaPago": "",
    "montoUSD": 30000.0,
    "detalle": "Sin Devolución"
  },
  {
    "id": "fe_xl_13",
    "cliente": "Agrovision",
    "pais": "Mexico",
    "nFact": "",
    "pagado": true,
    "fechaPago": "",
    "montoUSD": 30000.0,
    "detalle": "Con Devolución"
  },
  {
    "id": "fe_xl_14",
    "cliente": "Berries Paradise",
    "pais": "Mexico",
    "nFact": "",
    "pagado": true,
    "fechaPago": "",
    "montoUSD": 30000.0,
    "detalle": "Sin Devolución"
  },
  {
    "id": "fe_xl_15",
    "cliente": "Central West",
    "pais": "Mexico",
    "nFact": "",
    "pagado": true,
    "fechaPago": "",
    "montoUSD": 30000.0,
    "detalle": "Con Devolución"
  },
  {
    "id": "fe_xl_16",
    "cliente": "Giddings",
    "pais": "Mexico",
    "nFact": "",
    "pagado": true,
    "fechaPago": "",
    "montoUSD": 30000.0,
    "detalle": "Con Devolución"
  },
  {
    "id": "fe_xl_17",
    "cliente": "Mainland",
    "pais": "Mexico",
    "nFact": "",
    "pagado": true,
    "fechaPago": "",
    "montoUSD": 30000.0,
    "detalle": "Con Devolución"
  },
  {
    "id": "fe_xl_18",
    "cliente": "La Calera",
    "pais": "Peru",
    "nFact": "",
    "pagado": true,
    "fechaPago": "",
    "montoUSD": 30000.0,
    "detalle": "Sin Devolución"
  },
  {
    "id": "fe_xl_19",
    "cliente": "Dole",
    "pais": "Peru",
    "nFact": "",
    "pagado": true,
    "fechaPago": "",
    "montoUSD": 30000.0,
    "detalle": "Sin Devolución"
  },
  {
    "id": "fe_xl_20",
    "cliente": "Dole",
    "pais": "Mexico",
    "nFact": "",
    "pagado": true,
    "fechaPago": "",
    "montoUSD": 30000.0,
    "detalle": "Sin Devolución"
  },
  {
    "id": "fe_xl_21",
    "cliente": "Frunatural",
    "pais": "Mexico",
    "nFact": "",
    "pagado": true,
    "fechaPago": "",
    "montoUSD": 30000.0,
    "detalle": "Sin Devolución"
  },
  {
    "id": "fe_xl_22",
    "cliente": "Agrolatina",
    "pais": "Peru",
    "nFact": "",
    "pagado": false,
    "fechaPago": "",
    "montoUSD": 30000.0,
    "detalle": "Sin Devolución"
  }
];

const FEE_VIVEROS_INIT = [
  {
    "id": "fv_xl_1",
    "vivero": "Synergiabio",
    "empresa": "Mainland Farms SA",
    "pais": "Mexico",
    "proforma": "IQP2022-005",
    "nPlantas": 16000,
    "regalia": 0.25,
    "totalOsiris": 4000.0,
    "tipoPago": "Anticipo",
    "montoFact": 2400.0,
    "fechaFact": "",
    "nFact": "N°1",
    "pagado": true
  },
  {
    "id": "fv_xl_2",
    "vivero": "Synergiabio",
    "empresa": "Mainland Farms SA",
    "pais": "Mexico",
    "proforma": "IQP2022-005",
    "nPlantas": 16000,
    "regalia": 0.25,
    "totalOsiris": 4000.0,
    "tipoPago": "Entrega",
    "montoFact": 1600.0,
    "fechaFact": "",
    "nFact": "N°5",
    "pagado": true
  },
  {
    "id": "fv_xl_3",
    "vivero": "Synergiabio",
    "empresa": "Fruits Giddings SA de CV",
    "pais": "Mexico",
    "proforma": "IQP2022-112-M",
    "nPlantas": 90900,
    "regalia": 0.25,
    "totalOsiris": 22725.0,
    "tipoPago": "Anticipo",
    "montoFact": 13635.0,
    "fechaFact": "",
    "nFact": "N°1",
    "pagado": true
  },
  {
    "id": "fv_xl_4",
    "vivero": "Synergiabio",
    "empresa": "Fruits Giddings SA de CV",
    "pais": "Mexico",
    "proforma": "IQP2022-112-M",
    "nPlantas": 90900,
    "regalia": 0.25,
    "totalOsiris": 22725.0,
    "tipoPago": "Entrega",
    "montoFact": 9090.0,
    "fechaFact": "",
    "nFact": "N°5",
    "pagado": true
  },
  {
    "id": "fv_xl_5",
    "vivero": "Synergiabio",
    "empresa": "Fruits Giddings SA de CV",
    "pais": "Mexico",
    "proforma": "IQP2022-112-M",
    "nPlantas": 5440,
    "regalia": 0.25,
    "totalOsiris": 1360.0,
    "tipoPago": "Entrega",
    "montoFact": 1360.0,
    "fechaFact": "2024-10-01",
    "nFact": "N° 9",
    "pagado": true
  },
  {
    "id": "fv_xl_6",
    "vivero": "Synergiabio",
    "empresa": "Mainland Farms SA",
    "pais": "Mexico",
    "proforma": "IQP2022-005-M",
    "nPlantas": 227250,
    "regalia": 0.45,
    "totalOsiris": 102262.5,
    "tipoPago": "Anticipo",
    "montoFact": 51131.25,
    "fechaFact": "",
    "nFact": "N°1",
    "pagado": true
  },
  {
    "id": "fv_xl_7",
    "vivero": "Synergiabio",
    "empresa": "Mainland Farms SA",
    "pais": "Mexico",
    "proforma": "IQP2022-005-M",
    "nPlantas": 227250,
    "regalia": 0.45,
    "totalOsiris": 102262.5,
    "tipoPago": "Entrega",
    "montoFact": 46018.125,
    "fechaFact": "",
    "nFact": "N°5",
    "pagado": true
  },
  {
    "id": "fv_xl_8",
    "vivero": "Synergiabio",
    "empresa": "Mainland Farms SA",
    "pais": "Mexico",
    "proforma": "IQP2022-005-M",
    "nPlantas": 227250,
    "regalia": 0.45,
    "totalOsiris": 102262.5,
    "tipoPago": "Entrega",
    "montoFact": 5113.125,
    "fechaFact": "2024-10-01",
    "nFact": "N° 9",
    "pagado": true
  },
  {
    "id": "fv_xl_9",
    "vivero": "Synergiabio",
    "empresa": "Mainland Farms SA",
    "pais": "Mexico",
    "proforma": "MAINLF-2022-02",
    "nPlantas": 12000,
    "regalia": 0.45,
    "totalOsiris": 5400.0,
    "tipoPago": "Anticipo",
    "montoFact": 2700.0,
    "fechaFact": "2024-10-01",
    "nFact": "N° 9",
    "pagado": true
  },
  {
    "id": "fv_xl_10",
    "vivero": "Synergiabio",
    "empresa": "Mainland Farms SA",
    "pais": "Mexico",
    "proforma": "MAINLF-2022-02",
    "nPlantas": 12000,
    "regalia": 0.45,
    "totalOsiris": 5400.0,
    "tipoPago": "Entrega",
    "montoFact": 2700.0,
    "fechaFact": "",
    "nFact": "N°2",
    "pagado": true
  },
  {
    "id": "fv_xl_11",
    "vivero": "Synergiabio",
    "empresa": "AGV Innovation & Varieties LLC",
    "pais": "Mexico",
    "proforma": "AGVINV-2023-03",
    "nPlantas": 32500,
    "regalia": 0.45,
    "totalOsiris": 14625.0,
    "tipoPago": "Anticipo",
    "montoFact": 8775.0,
    "fechaFact": "",
    "nFact": "N°5",
    "pagado": true
  },
  {
    "id": "fv_xl_12",
    "vivero": "Synergiabio",
    "empresa": "Expoberries SA de CV",
    "pais": "Mexico",
    "proforma": "EXPBER-2023-01",
    "nPlantas": 1728,
    "regalia": 0.45,
    "totalOsiris": 777.6,
    "tipoPago": "Anticipo",
    "montoFact": 466.56,
    "fechaFact": "",
    "nFact": "N°5",
    "pagado": true
  },
  {
    "id": "fv_xl_13",
    "vivero": "Synergiabio",
    "empresa": "Expoberries SA de CV",
    "pais": "Mexico",
    "proforma": "EXPBER-2023-01",
    "nPlantas": 1728,
    "regalia": 0.45,
    "totalOsiris": 777.6,
    "tipoPago": "Entrega",
    "montoFact": 311.04,
    "fechaFact": "",
    "nFact": "N°5",
    "pagado": true
  },
  {
    "id": "fv_xl_14",
    "vivero": "Synergiabio",
    "empresa": "Berries Paradise SAPI de CV",
    "pais": "Mexico",
    "proforma": "BPARAD-2023-01",
    "nPlantas": 3900,
    "regalia": 0.45,
    "totalOsiris": 1755.0,
    "tipoPago": "Anticipo",
    "montoFact": 1045.98,
    "fechaFact": "2024-10-01",
    "nFact": "N° 9",
    "pagado": true
  },
  {
    "id": "fv_xl_15",
    "vivero": "Synergiabio",
    "empresa": "Berries Paradise SAPI de CV",
    "pais": "Mexico",
    "proforma": "BPARAD-2023-01",
    "nPlantas": 3900,
    "regalia": 0.45,
    "totalOsiris": 1755.0,
    "tipoPago": "Entrega",
    "montoFact": 709.0200000000001,
    "fechaFact": "2024-10-01",
    "nFact": "N° 9",
    "pagado": true
  },
  {
    "id": "fv_xl_16",
    "vivero": "Synergiabio",
    "empresa": "Fruits Giddings SA de CV",
    "pais": "Mexico",
    "proforma": "GIDMEX-2024-01",
    "nPlantas": 12672,
    "regalia": 0.45,
    "totalOsiris": 5702.400000000001,
    "tipoPago": "Entrega",
    "montoFact": 5702.400000000001,
    "fechaFact": "2024-10-01",
    "nFact": "N° 9",
    "pagado": true
  },
  {
    "id": "fv_xl_17",
    "vivero": "Synergiabio",
    "empresa": "Fruits Giddings SA de CV",
    "pais": "Mexico",
    "proforma": "IQP2022-112-M",
    "nPlantas": 106,
    "regalia": 0.25,
    "totalOsiris": 26.5,
    "tipoPago": "Entrega",
    "montoFact": 26.5,
    "fechaFact": "2024-10-01",
    "nFact": "N° 9",
    "pagado": true
  },
  {
    "id": "fv_xl_18",
    "vivero": "Synergiabio",
    "empresa": "Mainland Farms SA",
    "pais": "Mexico",
    "proforma": "MAIFAR-MX-2025-01",
    "nPlantas": 150000,
    "regalia": 0.45,
    "totalOsiris": 67500.0,
    "tipoPago": "Entrega",
    "montoFact": 15387.975,
    "fechaFact": "2026-03-31",
    "nFact": "N° 116",
    "pagado": true
  },
  {
    "id": "fv_xl_19",
    "vivero": "Synergiabio",
    "empresa": "Dole Mexico",
    "pais": "Mexico",
    "proforma": "BLUFAR-MX-2025-01",
    "nPlantas": 2100,
    "regalia": 0.45,
    "totalOsiris": 945.0,
    "tipoPago": "Entrega",
    "montoFact": 425.25,
    "fechaFact": "2026-03-31",
    "nFact": "N° 116",
    "pagado": true
  },
  {
    "id": "fv_xl_20",
    "vivero": "Synergiabio",
    "empresa": "Gourmet México",
    "pais": "Mexico",
    "proforma": "GBFFAR-MX-2026-01",
    "nPlantas": 950,
    "regalia": 0.45,
    "totalOsiris": 427.5,
    "tipoPago": "Entrega",
    "montoFact": 427.5,
    "fechaFact": "2026-03-31",
    "nFact": "N° 116",
    "pagado": true
  },
  {
    "id": "fv_xl_21",
    "vivero": "Synergiabio",
    "empresa": "AGV Innovation & Varieties LLC",
    "pais": "Mexico",
    "proforma": "AGVINV-2023-01",
    "nPlantas": 32500,
    "regalia": 0.45,
    "totalOsiris": 14625.0,
    "tipoPago": "Anticipo",
    "montoFact": 8775.0,
    "fechaFact": "",
    "nFact": "N° 28",
    "pagado": true
  },
  {
    "id": "fv_xl_22",
    "vivero": "Synergiabio",
    "empresa": "AGV Innovation & Varieties LLC",
    "pais": "Mexico",
    "proforma": "AGVINV-2023-01",
    "nPlantas": 32500,
    "regalia": 0.45,
    "totalOsiris": 14625.0,
    "tipoPago": "Entrega",
    "montoFact": 5850.0,
    "fechaFact": "",
    "nFact": "N° 37",
    "pagado": true
  },
  {
    "id": "fv_xl_23",
    "vivero": "Synergiabio",
    "empresa": "JDB PRO INC",
    "pais": "Mexico",
    "proforma": "CWESTP-2023-01",
    "nPlantas": 3300,
    "regalia": 0.45,
    "totalOsiris": 1485.0,
    "tipoPago": "Anticipo",
    "montoFact": 742.5,
    "fechaFact": "",
    "nFact": "N° 37",
    "pagado": true
  },
  {
    "id": "fv_xl_24",
    "vivero": "Synergiabio",
    "empresa": "JDB PRO INC",
    "pais": "Mexico",
    "proforma": "CWESTP-2023-01",
    "nPlantas": 3300,
    "regalia": 0.45,
    "totalOsiris": 1485.0,
    "tipoPago": "Entrega",
    "montoFact": 742.5,
    "fechaFact": "2024-12-01",
    "nFact": "N° 45",
    "pagado": true
  },
  {
    "id": "fv_xl_25",
    "vivero": "Synergiabio",
    "empresa": "Mainland Farms SA",
    "pais": "Mexico",
    "proforma": "MAIFAR-2024-02",
    "nPlantas": 75000,
    "regalia": 0.45,
    "totalOsiris": 33750.0,
    "tipoPago": "Anticipo",
    "montoFact": 18562.5,
    "fechaFact": "2024-12-01",
    "nFact": "N° 45",
    "pagado": true
  },
  {
    "id": "fv_xl_26",
    "vivero": "Synergiabio",
    "empresa": "Mainland Farms SA",
    "pais": "Mexico",
    "proforma": "MAIFAR-2024-02",
    "nPlantas": 75000,
    "regalia": 0.45,
    "totalOsiris": 33750.0,
    "tipoPago": "Entrega",
    "montoFact": 12929.625,
    "fechaFact": "2025-05-01",
    "nFact": "N° 69",
    "pagado": true
  },
  {
    "id": "fv_xl_27",
    "vivero": "Synergiabio",
    "empresa": "Mainland Farms SA",
    "pais": "Mexico",
    "proforma": "MAIFAR-2024-02",
    "nPlantas": 75000,
    "regalia": 0.45,
    "totalOsiris": 33750.0,
    "tipoPago": "Entrega",
    "montoFact": 2156.625,
    "fechaFact": "2025-07-01",
    "nFact": "N° 78",
    "pagado": true
  },
  {
    "id": "fv_xl_28",
    "vivero": "Synergiabio",
    "empresa": "Mainland Farms SA",
    "pais": "Mexico",
    "proforma": "MAIFAR-2024-03",
    "nPlantas": 2000,
    "regalia": 0.45,
    "totalOsiris": 900.0,
    "tipoPago": "Anticipo",
    "montoFact": 495.00000000000006,
    "fechaFact": "2024-12-01",
    "nFact": "N° 45",
    "pagado": true
  },
  {
    "id": "fv_xl_29",
    "vivero": "Synergiabio",
    "empresa": "Mainland Farms SA",
    "pais": "Mexico",
    "proforma": "MAIFAR-2024-03",
    "nPlantas": 2000,
    "regalia": 0.45,
    "totalOsiris": 900.0,
    "tipoPago": "Entrega",
    "montoFact": 192.375,
    "fechaFact": "2025-07-01",
    "nFact": "N° 78",
    "pagado": true
  },
  {
    "id": "fv_xl_30",
    "vivero": "Synergiabio",
    "empresa": "Berries Paradise SAPI de CV",
    "pais": "Mexico",
    "proforma": "BPARADMX-2024-02",
    "nPlantas": 384,
    "regalia": 0.45,
    "totalOsiris": 172.8,
    "tipoPago": "Anticipo",
    "montoFact": 103.68,
    "fechaFact": "2024-12-01",
    "nFact": "N° 45",
    "pagado": true
  },
  {
    "id": "fv_xl_31",
    "vivero": "Synergiabio",
    "empresa": "Mainland Farms SA",
    "pais": "Mexico",
    "proforma": "MAIFAR-2024-03",
    "nPlantas": 2000,
    "regalia": 0.45,
    "totalOsiris": 900.0,
    "tipoPago": "Entrega",
    "montoFact": 162.0,
    "fechaFact": "2025-09-01",
    "nFact": "N° 83",
    "pagado": true
  },
  {
    "id": "fv_xl_32",
    "vivero": "Synergiabio",
    "empresa": "Mainland Farms SA",
    "pais": "Mexico",
    "proforma": "MAIFAR-2024-03",
    "nPlantas": 2000,
    "regalia": 0.45,
    "totalOsiris": 900.0,
    "tipoPago": "Entrega",
    "montoFact": 51.300000000000004,
    "fechaFact": "2026-03-31",
    "nFact": "N° 116",
    "pagado": true
  },
  {
    "id": "fv_xl_33",
    "vivero": "Synergiabio",
    "empresa": "Berries Paradise SAPI de CV",
    "pais": "Mexico",
    "proforma": "BPARAD-2024-01",
    "nPlantas": 384,
    "regalia": 0.45,
    "totalOsiris": 172.8,
    "tipoPago": "Entrega",
    "montoFact": NaN,
    "fechaFact": "",
    "nFact": "",
    "pagado": false
  },
  {
    "id": "fv_xl_34",
    "vivero": "Synergiabio",
    "empresa": "Mainland Farms SA",
    "pais": "Mexico",
    "proforma": "MAIFAR-2024-01",
    "nPlantas": 11500,
    "regalia": 0.45,
    "totalOsiris": 5175.0,
    "tipoPago": "Anticipo",
    "montoFact": 2846.2500000000005,
    "fechaFact": "2024-12-01",
    "nFact": "N° 45",
    "pagado": true
  },
  {
    "id": "fv_xl_35",
    "vivero": "Synergiabio",
    "empresa": "Mainland Farms SA",
    "pais": "Mexico",
    "proforma": "MAIFAR-2024-01",
    "nPlantas": 11500,
    "regalia": 0.45,
    "totalOsiris": 5175.0,
    "tipoPago": "Entrega",
    "montoFact": 2328.75,
    "fechaFact": "2024-12-01",
    "nFact": "N° 45",
    "pagado": true
  },
  {
    "id": "fv_xl_36",
    "vivero": "Synergiabio",
    "empresa": "Mainland Farms SA",
    "pais": "Mexico",
    "proforma": "MAIFAR-MX-2024-04",
    "nPlantas": 50000,
    "regalia": 0.45,
    "totalOsiris": 22500.0,
    "tipoPago": "Anticipo",
    "montoFact": 12375.000000000002,
    "fechaFact": "2025-05-01",
    "nFact": "N° 69",
    "pagado": true
  },
  {
    "id": "fv_xl_37",
    "vivero": "Synergiabio",
    "empresa": "Mainland Farms SA",
    "pais": "Mexico",
    "proforma": "MAIFAR-MX-2024-04",
    "nPlantas": 50000,
    "regalia": 0.45,
    "totalOsiris": 22500.0,
    "tipoPago": "Entrega",
    "montoFact": 3246.0750000000003,
    "fechaFact": "2025-07-01",
    "nFact": "N° 78",
    "pagado": true
  },
  {
    "id": "fv_xl_38",
    "vivero": "Synergiabio",
    "empresa": "Mainland Farms SA",
    "pais": "Mexico",
    "proforma": "MAIFAR-MX-2024-04",
    "nPlantas": 50000,
    "regalia": 0.45,
    "totalOsiris": 22500.0,
    "tipoPago": "Entrega",
    "montoFact": 3587.625,
    "fechaFact": "2025-09-01",
    "nFact": "N° 83",
    "pagado": true
  },
  {
    "id": "fv_xl_39",
    "vivero": "Synergiabio",
    "empresa": "Mainland Farms SA",
    "pais": "Mexico",
    "proforma": "MAIFAR-MX-2025-01",
    "nPlantas": 150000,
    "regalia": 0.45,
    "totalOsiris": 67500.0,
    "tipoPago": "Anticipo",
    "montoFact": 9281.25,
    "fechaFact": "2025-07-01",
    "nFact": "N° 78",
    "pagado": true
  },
  {
    "id": "fv_xl_40",
    "vivero": "Synergiabio",
    "empresa": "Mainland Farms SA",
    "pais": "Mexico",
    "proforma": "MAIFAR-MX-2025-01",
    "nPlantas": 150000,
    "regalia": 0.45,
    "totalOsiris": 67500.0,
    "tipoPago": "Anticipo",
    "montoFact": 9281.25,
    "fechaFact": "2025-07-01",
    "nFact": "N° 78",
    "pagado": true
  },
  {
    "id": "fv_xl_41",
    "vivero": "Synergiabio",
    "empresa": "Mainland Farms SA",
    "pais": "Mexico",
    "proforma": "MAIFAR-MX-2025-01",
    "nPlantas": 150000,
    "regalia": 0.45,
    "totalOsiris": 67500.0,
    "tipoPago": "Anticipo",
    "montoFact": 9281.25,
    "fechaFact": "2025-07-01",
    "nFact": "N° 78",
    "pagado": true
  },
  {
    "id": "fv_xl_42",
    "vivero": "Synergiabio",
    "empresa": "Mainland Farms SA",
    "pais": "Mexico",
    "proforma": "MAIFAR-MX-2025-01",
    "nPlantas": 150000,
    "regalia": 0.45,
    "totalOsiris": 67500.0,
    "tipoPago": "Anticipo",
    "montoFact": 9281.25,
    "fechaFact": "2025-07-01",
    "nFact": "N° 78",
    "pagado": true
  },
  {
    "id": "fv_xl_43",
    "vivero": "Synergiabio",
    "empresa": "Mainland Farms SA",
    "pais": "Mexico",
    "proforma": "MAIFAR-MX-2024-04",
    "nPlantas": 50000,
    "regalia": 0.45,
    "totalOsiris": 22500.0,
    "tipoPago": "Entrega",
    "montoFact": 1214.55,
    "fechaFact": "2026-03-31",
    "nFact": "N° 116",
    "pagado": true
  },
  {
    "id": "fv_xl_44",
    "vivero": "Synergiabio",
    "empresa": "Mainland Farms SA",
    "pais": "Mexico",
    "proforma": "MAIFAR-MX-2025-02",
    "nPlantas": 250000,
    "regalia": 0.45,
    "totalOsiris": 112500.0,
    "tipoPago": "Anticipo",
    "montoFact": 61875.00000000001,
    "fechaFact": "2025-09-01",
    "nFact": "N° 83",
    "pagado": true
  },
  {
    "id": "fv_xl_45",
    "vivero": "Synergiabio",
    "empresa": "Frusan Agro SAC",
    "pais": "Peru",
    "proforma": "HUARME-CL-2024-02",
    "nPlantas": 305185,
    "regalia": 0.45,
    "totalOsiris": 137333.25,
    "tipoPago": "Entrega",
    "montoFact": 54933.3,
    "fechaFact": "2026-03-31",
    "nFact": "N° 20",
    "pagado": false
  },
  {
    "id": "fv_xl_46",
    "vivero": "Synergiabio",
    "empresa": "Vanguard",
    "pais": "Peru",
    "proforma": "OLIVOS-CL-2024-01",
    "nPlantas": 1555705,
    "regalia": 0.45,
    "totalOsiris": 700067.25,
    "tipoPago": "Entrega",
    "montoFact": 180827.37067499998,
    "fechaFact": "2026-03-31",
    "nFact": "N° 20",
    "pagado": false
  },
  {
    "id": "fv_xl_47",
    "vivero": "Synergiabio",
    "empresa": "Dole Mexico",
    "pais": "Mexico",
    "proforma": "BLUFAR-MX-2025-01",
    "nPlantas": 2100,
    "regalia": 0.45,
    "totalOsiris": 945.0,
    "tipoPago": "Anticipo",
    "montoFact": 519.75,
    "fechaFact": "2025-09-01",
    "nFact": "N° 83",
    "pagado": true
  },
  {
    "id": "fv_xl_48",
    "vivero": "Synergiabio",
    "empresa": "Frusan Agro SAC",
    "pais": "Peru",
    "proforma": "HUARME-CL-2024-02",
    "nPlantas": 305185,
    "regalia": 0.45,
    "totalOsiris": 137333.25,
    "tipoPago": "Entrega",
    "montoFact": 10299.99375,
    "fechaFact": "2026-03-31",
    "nFact": "N° 20",
    "pagado": false
  },
  {
    "id": "fv_xl_49",
    "vivero": "Synergiabio",
    "empresa": "Hector Esquivel",
    "pais": "Chile",
    "proforma": "HEHSPA-CL-2024-01",
    "nPlantas": 12000,
    "regalia": 0.45,
    "totalOsiris": 5400.0,
    "tipoPago": "Entrega",
    "montoFact": 1309.5,
    "fechaFact": "2026-01-01",
    "nFact": "N° 19",
    "pagado": true
  },
  {
    "id": "fv_xl_50",
    "vivero": "Synergiabio",
    "empresa": "SQM",
    "pais": "Chile",
    "proforma": "SQMSDH-2024-01",
    "nPlantas": 420,
    "regalia": 0.45,
    "totalOsiris": 189.0,
    "tipoPago": "Entrega",
    "montoFact": 189.0,
    "fechaFact": "2025-03-01",
    "nFact": "N° 12",
    "pagado": true
  },
  {
    "id": "fv_xl_51",
    "vivero": "Synergiabio",
    "empresa": "Hector Esquivel",
    "pais": "Chile",
    "proforma": "HEHSPA-CL-2024-01",
    "nPlantas": 12000,
    "regalia": 0.45,
    "totalOsiris": 5400.0,
    "tipoPago": "Anticipo",
    "montoFact": 4090.4999999999995,
    "fechaFact": "2025-03-01",
    "nFact": "N° 12",
    "pagado": true
  },
  {
    "id": "fv_xl_52",
    "vivero": "Synergiabio",
    "empresa": "Collipulli",
    "pais": "Chile",
    "proforma": "ASELVA-2024-01",
    "nPlantas": 270,
    "regalia": 0.45,
    "totalOsiris": 121.5,
    "tipoPago": "Entrega",
    "montoFact": 121.5,
    "fechaFact": "2025-03-01",
    "nFact": "N° 12",
    "pagado": true
  },
  {
    "id": "fv_xl_53",
    "vivero": "Synergiabio",
    "empresa": "KJ Orchard CO Ltd",
    "pais": "Corea",
    "proforma": "KJORCH-2023-01",
    "nPlantas": 1728,
    "regalia": 0.45,
    "totalOsiris": 777.6,
    "tipoPago": "Entrega",
    "montoFact": 777.6,
    "fechaFact": "2024-10-01",
    "nFact": "N° 9",
    "pagado": true
  },
  {
    "id": "fv_xl_54",
    "vivero": "Synergiabio",
    "empresa": "KJ Orchard CO Ltd",
    "pais": "Corea",
    "proforma": "KJORCH-2023-02",
    "nPlantas": 12096,
    "regalia": 0.1,
    "totalOsiris": 1209.6000000000001,
    "tipoPago": "Anticipo",
    "montoFact": 723.58272,
    "fechaFact": "2024-10-01",
    "nFact": "N° 9",
    "pagado": true
  },
  {
    "id": "fv_xl_55",
    "vivero": "Synergiabio",
    "empresa": "KJ Orchard CO Ltd",
    "pais": "Corea",
    "proforma": "KJORCH-2023-02",
    "nPlantas": 12096,
    "regalia": 0.1,
    "totalOsiris": 1209.6000000000001,
    "tipoPago": "Entrega",
    "montoFact": 483.8400000000001,
    "fechaFact": "2024-10-01",
    "nFact": "N° 9",
    "pagado": true
  },
  {
    "id": "fv_xl_56",
    "vivero": "Synergiabio",
    "empresa": "KJ Orchard CO Ltd",
    "pais": "Corea",
    "proforma": "KJORCH-CL-2025-01",
    "nPlantas": 12096,
    "regalia": 0.1,
    "totalOsiris": 1209.6000000000001,
    "tipoPago": "Anticipo",
    "montoFact": 725.7600000000001,
    "fechaFact": "2026-09-01",
    "nFact": "N° 14",
    "pagado": true
  },
  {
    "id": "fv_xl_57",
    "vivero": "Synergiabio",
    "empresa": "Frusan Agro SAC",
    "pais": "Peru",
    "proforma": "HUARME-CL-2026-0046",
    "nPlantas": 285405,
    "regalia": 0.45,
    "totalOsiris": 128432.25,
    "tipoPago": "Anticipo",
    "montoFact": 67426.93125000001,
    "fechaFact": "2026-03-31",
    "nFact": "N° 20",
    "pagado": false
  },
  {
    "id": "fv_xl_58",
    "vivero": "Synergiabio",
    "empresa": "Surexport Compañía Agraria SL",
    "pais": "España",
    "proforma": "2022-011",
    "nPlantas": 31104,
    "regalia": 0.1,
    "totalOsiris": 3110.4,
    "tipoPago": "Anticipo",
    "montoFact": 1866.24,
    "fechaFact": "",
    "nFact": "N° 1",
    "pagado": true
  },
  {
    "id": "fv_xl_59",
    "vivero": "Synergiabio",
    "empresa": "Surexport Compañía Agraria SL",
    "pais": "España",
    "proforma": "2022-011",
    "nPlantas": 31104,
    "regalia": 0.1,
    "totalOsiris": 3110.4,
    "tipoPago": "Entrega",
    "montoFact": 1150.848,
    "fechaFact": "",
    "nFact": "N°5",
    "pagado": true
  },
  {
    "id": "fv_xl_60",
    "vivero": "Synergiabio",
    "empresa": "Agrícola Moquegua",
    "pais": "Peru",
    "proforma": "IQP2022-002",
    "nPlantas": 13320,
    "regalia": 0.25,
    "totalOsiris": 3330.0,
    "tipoPago": "Anticipo",
    "montoFact": 1998.0,
    "fechaFact": "",
    "nFact": "N°1",
    "pagado": true
  },
  {
    "id": "fv_xl_61",
    "vivero": "Synergiabio",
    "empresa": "Agrícola Moquegua",
    "pais": "Peru",
    "proforma": "IQP2022-002",
    "nPlantas": 13320,
    "regalia": 0.25,
    "totalOsiris": 3330.0,
    "tipoPago": "Entrega",
    "montoFact": 1332.0,
    "fechaFact": "2024-10-01",
    "nFact": "N° 9",
    "pagado": true
  },
  {
    "id": "fv_xl_62",
    "vivero": "Synergiabio",
    "empresa": "Giddings Berries Perú SAC",
    "pais": "Peru",
    "proforma": "IQP2022-004",
    "nPlantas": 3000,
    "regalia": 0.25,
    "totalOsiris": 750.0,
    "tipoPago": "Anticipo",
    "montoFact": 450.0,
    "fechaFact": "",
    "nFact": "N°1",
    "pagado": true
  },
  {
    "id": "fv_xl_63",
    "vivero": "Synergiabio",
    "empresa": "Giddings Berries Perú SAC",
    "pais": "Peru",
    "proforma": "IQP2022-004",
    "nPlantas": 2750,
    "regalia": 0.25,
    "totalOsiris": 687.5,
    "tipoPago": "Entrega",
    "montoFact": 275.0,
    "fechaFact": "",
    "nFact": "N°5",
    "pagado": true
  },
  {
    "id": "fv_xl_64",
    "vivero": "Synergiabio",
    "empresa": "Agrícola Cerro Prieto SA",
    "pais": "Peru",
    "proforma": "IQP2022-006",
    "nPlantas": 9200,
    "regalia": 0.25,
    "totalOsiris": 2300.0,
    "tipoPago": "Anticipo",
    "montoFact": 1380.0,
    "fechaFact": "",
    "nFact": "N°1",
    "pagado": true
  },
  {
    "id": "fv_xl_65",
    "vivero": "Synergiabio",
    "empresa": "Agrícola Cerro Prieto SA",
    "pais": "Peru",
    "proforma": "IQP2022-006",
    "nPlantas": 9200,
    "regalia": 0.25,
    "totalOsiris": 2300.0,
    "tipoPago": "Entrega",
    "montoFact": 920.0,
    "fechaFact": "",
    "nFact": "N°5",
    "pagado": true
  },
  {
    "id": "fv_xl_66",
    "vivero": "Synergiabio",
    "empresa": "Danper Trujillo SAC",
    "pais": "Peru",
    "proforma": "IQP2022-007",
    "nPlantas": 8800,
    "regalia": 0.25,
    "totalOsiris": 2200.0,
    "tipoPago": "Anticipo",
    "montoFact": 1320.0,
    "fechaFact": "",
    "nFact": "N°1",
    "pagado": true
  },
  {
    "id": "fv_xl_67",
    "vivero": "Synergiabio",
    "empresa": "Danper Trujillo SAC",
    "pais": "Peru",
    "proforma": "IQP2022-007",
    "nPlantas": 8800,
    "regalia": 0.25,
    "totalOsiris": 2200.0,
    "tipoPago": "Entrega",
    "montoFact": 880.0,
    "fechaFact": "",
    "nFact": "N°5",
    "pagado": true
  },
  {
    "id": "fv_xl_68",
    "vivero": "Synergiabio",
    "empresa": "Agroberries Perú SAC",
    "pais": "Peru",
    "proforma": "IQP2022-111",
    "nPlantas": 4000,
    "regalia": 0.25,
    "totalOsiris": 1000.0,
    "tipoPago": "Anticipo",
    "montoFact": 600.0,
    "fechaFact": "",
    "nFact": "N°1",
    "pagado": true
  },
  {
    "id": "fv_xl_69",
    "vivero": "Synergiabio",
    "empresa": "Agroberries Perú SAC",
    "pais": "Peru",
    "proforma": "IQP2022-111",
    "nPlantas": 4000,
    "regalia": 0.25,
    "totalOsiris": 1000.0,
    "tipoPago": "Entrega",
    "montoFact": 400.0,
    "fechaFact": "",
    "nFact": "N°5",
    "pagado": true
  },
  {
    "id": "fv_xl_70",
    "vivero": "Synergiabio",
    "empresa": "Hass Peru SA",
    "pais": "Peru",
    "proforma": "IQP2022-125",
    "nPlantas": 200,
    "regalia": 0.45,
    "totalOsiris": 90.0,
    "tipoPago": "Anticipo",
    "montoFact": 54.0,
    "fechaFact": "",
    "nFact": "N°2",
    "pagado": true
  },
  {
    "id": "fv_xl_71",
    "vivero": "Synergiabio",
    "empresa": "Agrícola Don Ricardo SAC",
    "pais": "Peru",
    "proforma": "IQP2022-124",
    "nPlantas": 1000,
    "regalia": 0.45,
    "totalOsiris": 450.0,
    "tipoPago": "Anticipo",
    "montoFact": 270.0,
    "fechaFact": "",
    "nFact": "N°2",
    "pagado": true
  },
  {
    "id": "fv_xl_72",
    "vivero": "Synergiabio",
    "empresa": "Agrícola Don Ricardo SAC",
    "pais": "Peru",
    "proforma": "IQP2022-124",
    "nPlantas": 1000,
    "regalia": 0.45,
    "totalOsiris": 450.0,
    "tipoPago": "Entrega",
    "montoFact": 180.0,
    "fechaFact": "",
    "nFact": "N°5",
    "pagado": true
  },
  {
    "id": "fv_xl_73",
    "vivero": "Synergiabio",
    "empresa": "Hass Peru SA",
    "pais": "Peru",
    "proforma": "IQP2022-125",
    "nPlantas": 200,
    "regalia": 0.45,
    "totalOsiris": 90.0,
    "tipoPago": "Entrega",
    "montoFact": 36.0,
    "fechaFact": "",
    "nFact": "N°2",
    "pagado": true
  },
  {
    "id": "fv_xl_74",
    "vivero": "Synergiabio",
    "empresa": "Agrícola Don Ricardo SAC",
    "pais": "Peru",
    "proforma": "ARICDO-2022-02",
    "nPlantas": 2000,
    "regalia": 0.45,
    "totalOsiris": 900.0,
    "tipoPago": "Anticipo",
    "montoFact": 540.0,
    "fechaFact": "",
    "nFact": "N°2",
    "pagado": true
  },
  {
    "id": "fv_xl_75",
    "vivero": "Synergiabio",
    "empresa": "Hass Peru SA",
    "pais": "Peru",
    "proforma": "HASSPE-2022-01",
    "nPlantas": 2000,
    "regalia": 0.45,
    "totalOsiris": 900.0,
    "tipoPago": "Anticipo",
    "montoFact": 540.0,
    "fechaFact": "",
    "nFact": "N°2",
    "pagado": true
  },
  {
    "id": "fv_xl_76",
    "vivero": "Synergiabio",
    "empresa": "Hass Peru SA",
    "pais": "Peru",
    "proforma": "HASSPE-2022-01",
    "nPlantas": 2000,
    "regalia": 0.45,
    "totalOsiris": 900.0,
    "tipoPago": "Entrega",
    "montoFact": 360.0,
    "fechaFact": "",
    "nFact": "N°2",
    "pagado": true
  },
  {
    "id": "fv_xl_77",
    "vivero": "Synergiabio",
    "empresa": "Danper Trujillo SAC",
    "pais": "Peru",
    "proforma": "DANPER-2022-01",
    "nPlantas": 6000,
    "regalia": 0.45,
    "totalOsiris": 2700.0,
    "tipoPago": "Anticipo",
    "montoFact": 1479.6000000000001,
    "fechaFact": "",
    "nFact": "N°5",
    "pagado": true
  },
  {
    "id": "fv_xl_78",
    "vivero": "Synergiabio",
    "empresa": "Danper Trujillo SAC",
    "pais": "Peru",
    "proforma": "DANPER-2022-01",
    "nPlantas": 6000,
    "regalia": 0.45,
    "totalOsiris": 2700.0,
    "tipoPago": "Entrega",
    "montoFact": 977.4,
    "fechaFact": "2024-10-01",
    "nFact": "N° 9",
    "pagado": true
  },
  {
    "id": "fv_xl_79",
    "vivero": "Synergiabio",
    "empresa": "Danper Trujillo SAC",
    "pais": "Peru",
    "proforma": "DANPER-2022-01",
    "nPlantas": 6000,
    "regalia": 0.45,
    "totalOsiris": 2700.0,
    "tipoPago": "Entrega",
    "montoFact": 243.0,
    "fechaFact": "2024-10-01",
    "nFact": "N° 9",
    "pagado": true
  },
  {
    "id": "fv_xl_80",
    "vivero": "Synergiabio",
    "empresa": "Agroberries Perú SAC",
    "pais": "Peru",
    "proforma": "AGBERR-2022-01",
    "nPlantas": 8000,
    "regalia": 0.45,
    "totalOsiris": 3600.0,
    "tipoPago": "Anticipo",
    "montoFact": 1980.0000000000002,
    "fechaFact": "",
    "nFact": "N°2",
    "pagado": true
  },
  {
    "id": "fv_xl_81",
    "vivero": "Synergiabio",
    "empresa": "Agroberries Perú SAC",
    "pais": "Peru",
    "proforma": "AGBERR-2022-01",
    "nPlantas": 8000,
    "regalia": 0.45,
    "totalOsiris": 3600.0,
    "tipoPago": "Entrega",
    "montoFact": 1620.0,
    "fechaFact": "2024-10-01",
    "nFact": "N° 9",
    "pagado": true
  },
  {
    "id": "fv_xl_82",
    "vivero": "Synergiabio",
    "empresa": "Agrícola Moquegua",
    "pais": "Peru",
    "proforma": "MOQUEH-2022-02",
    "nPlantas": 325000,
    "regalia": 0.45,
    "totalOsiris": 146250.0,
    "tipoPago": "Anticipo",
    "montoFact": 29250.0,
    "fechaFact": "",
    "nFact": "N°2",
    "pagado": true
  },
  {
    "id": "fv_xl_83",
    "vivero": "Synergiabio",
    "empresa": "Agrícola Moquegua",
    "pais": "Peru",
    "proforma": "MOQUEH-2022-02",
    "nPlantas": 325000,
    "regalia": 0.45,
    "totalOsiris": 146250.0,
    "tipoPago": "Anticipo",
    "montoFact": 50748.75,
    "fechaFact": "",
    "nFact": "N°4",
    "pagado": true
  },
  {
    "id": "fv_xl_84",
    "vivero": "Synergiabio",
    "empresa": "Agrícola Moquegua",
    "pais": "Peru",
    "proforma": "MOQUEH-2022-02",
    "nPlantas": 325000,
    "regalia": 0.45,
    "totalOsiris": 146250.0,
    "tipoPago": "Entrega",
    "montoFact": 34734.375,
    "fechaFact": "2024-10-01",
    "nFact": "N° 9",
    "pagado": true
  },
  {
    "id": "fv_xl_85",
    "vivero": "Synergiabio",
    "empresa": "Agrícola Moquegua",
    "pais": "Peru",
    "proforma": "MOQUEH-2022-02",
    "nPlantas": 325000,
    "regalia": 0.45,
    "totalOsiris": 146250.0,
    "tipoPago": "Entrega",
    "montoFact": 31516.875,
    "fechaFact": "2026-01-01",
    "nFact": "N° 19",
    "pagado": true
  },
  {
    "id": "fv_xl_86",
    "vivero": "Synergiabio",
    "empresa": "Danper Trujillo SAC",
    "pais": "Peru",
    "proforma": "DANPER-2022-01",
    "nPlantas": 68,
    "regalia": 0.45,
    "totalOsiris": 30.6,
    "tipoPago": "Entrega",
    "montoFact": 30.6,
    "fechaFact": "2024-10-01",
    "nFact": "N° 9",
    "pagado": true
  },
  {
    "id": "fv_xl_87",
    "vivero": "Synergiabio",
    "empresa": "Danper Trujillo SAC",
    "pais": "Peru",
    "proforma": "DANPER-2022-03",
    "nPlantas": 100,
    "regalia": 0.25,
    "totalOsiris": 25.0,
    "tipoPago": "Entrega",
    "montoFact": 25.0,
    "fechaFact": "",
    "nFact": "N°5",
    "pagado": true
  },
  {
    "id": "fv_xl_88",
    "vivero": "Synergiabio",
    "empresa": "Agrícola Cerro Prieto SA",
    "pais": "Peru",
    "proforma": "CPRIET-2023-01",
    "nPlantas": 2000,
    "regalia": 0.45,
    "totalOsiris": 900.0,
    "tipoPago": "Anticipo",
    "montoFact": 540.0,
    "fechaFact": "",
    "nFact": "N°4",
    "pagado": true
  },
  {
    "id": "fv_xl_89",
    "vivero": "Synergiabio",
    "empresa": "Agrícola Cerro Prieto SA",
    "pais": "Peru",
    "proforma": "CPRIET-2023-01",
    "nPlantas": 2000,
    "regalia": 0.45,
    "totalOsiris": 900.0,
    "tipoPago": "Entrega",
    "montoFact": 360.0,
    "fechaFact": "2024-10-01",
    "nFact": "N° 9",
    "pagado": true
  },
  {
    "id": "fv_xl_90",
    "vivero": "Synergiabio",
    "empresa": "Frusan Agro SAC",
    "pais": "Peru",
    "proforma": "FSFNDO-2023-01",
    "nPlantas": 6000,
    "regalia": 0.45,
    "totalOsiris": 2700.0,
    "tipoPago": "Anticipo",
    "montoFact": 1620.0,
    "fechaFact": "",
    "nFact": "N°4",
    "pagado": true
  },
  {
    "id": "fv_xl_91",
    "vivero": "Synergiabio",
    "empresa": "AGV Innovation & Varieties LLC",
    "pais": "Peru",
    "proforma": "AGVINV-2023-02",
    "nPlantas": 26000,
    "regalia": 0.45,
    "totalOsiris": 11700.0,
    "tipoPago": "Anticipo",
    "montoFact": 7008.3,
    "fechaFact": "",
    "nFact": "N°5",
    "pagado": true
  },
  {
    "id": "fv_xl_92",
    "vivero": "Synergiabio",
    "empresa": "AGV Innovation & Varieties LLC",
    "pais": "Peru",
    "proforma": "AGVINV-2023-02",
    "nPlantas": 26000,
    "regalia": 0.45,
    "totalOsiris": 11700.0,
    "tipoPago": "Entrega",
    "montoFact": 4680.0,
    "fechaFact": "2024-10-01",
    "nFact": "N° 9",
    "pagado": true
  },
  {
    "id": "fv_xl_93",
    "vivero": "Synergiabio",
    "empresa": "Agrícola Don Ricardo SAC",
    "pais": "Peru",
    "proforma": "ARICDO-2022-01",
    "nPlantas": 2500,
    "regalia": 0.45,
    "totalOsiris": 1125.0,
    "tipoPago": "Entrega",
    "montoFact": 585.0,
    "fechaFact": "2024-10-01",
    "nFact": "N° 9",
    "pagado": true
  },
  {
    "id": "fv_xl_94",
    "vivero": "Synergiabio",
    "empresa": "Hass Peru SA",
    "pais": "Peru",
    "proforma": "HASSPE-2023-01",
    "nPlantas": 5000,
    "regalia": 0.45,
    "totalOsiris": 2250.0,
    "tipoPago": "Anticipo",
    "montoFact": 2250.0,
    "fechaFact": "2024-10-01",
    "nFact": "N° 9",
    "pagado": true
  },
  {
    "id": "fv_xl_95",
    "vivero": "Synergiabio",
    "empresa": "Berry Harvest SA",
    "pais": "Peru",
    "proforma": "HARVES-2023-01",
    "nPlantas": 4000,
    "regalia": 0.45,
    "totalOsiris": 1800.0,
    "tipoPago": "Anticipo",
    "montoFact": 1800.0,
    "fechaFact": "2024-10-01",
    "nFact": "N° 9",
    "pagado": true
  },
  {
    "id": "fv_xl_96",
    "vivero": "Synergiabio",
    "empresa": "Frusan Agro SAC",
    "pais": "Peru",
    "proforma": "FRUSAN-2023-01",
    "nPlantas": 6000,
    "regalia": 0.45,
    "totalOsiris": 2700.0,
    "tipoPago": "Entrega",
    "montoFact": 1080.0,
    "fechaFact": "2024-10-01",
    "nFact": "N° 9",
    "pagado": true
  },
  {
    "id": "fv_xl_97",
    "vivero": "Synergiabio",
    "empresa": "Agroberries Perú SAC",
    "pais": "Peru",
    "proforma": "AGBERR-2023-01",
    "nPlantas": 250,
    "regalia": 0.45,
    "totalOsiris": 112.5,
    "tipoPago": "Entrega",
    "montoFact": NaN,
    "fechaFact": "2024-01-01",
    "nFact": "",
    "pagado": false
  },
  {
    "id": "fv_xl_98",
    "vivero": "Synergiabio",
    "empresa": "Hass Peru SA",
    "pais": "Peru",
    "proforma": "HASSPE-2024-01",
    "nPlantas": 367,
    "regalia": 0.45,
    "totalOsiris": 165.15,
    "tipoPago": "Anticipo/Entrega",
    "montoFact": 165.15,
    "fechaFact": "2024-10-01",
    "nFact": "N° 9",
    "pagado": true
  },
  {
    "id": "fv_xl_99",
    "vivero": "Synergiabio",
    "empresa": "Berry Harvest SA",
    "pais": "Peru",
    "proforma": "HARVES-2024-01",
    "nPlantas": 409,
    "regalia": 0.45,
    "totalOsiris": 184.05,
    "tipoPago": "Anticipo/Entrega",
    "montoFact": 184.05,
    "fechaFact": "2024-10-01",
    "nFact": "N° 9",
    "pagado": true
  },
  {
    "id": "fv_xl_100",
    "vivero": "Synergiabio",
    "empresa": "Pura Berries",
    "pais": "Peru",
    "proforma": "PURABE-CL-2024-04",
    "nPlantas": 259735,
    "regalia": 0.45,
    "totalOsiris": 116880.75,
    "tipoPago": "Entrega",
    "montoFact": 46752.3,
    "fechaFact": "2026-01-01",
    "nFact": "N° 19",
    "pagado": true
  },
  {
    "id": "fv_xl_101",
    "vivero": "Synergiabio",
    "empresa": "Danper Trujillo SAC",
    "pais": "Peru",
    "proforma": "DANPER-2024-01",
    "nPlantas": 7296,
    "regalia": 0.45,
    "totalOsiris": 3283.2000000000003,
    "tipoPago": "Entrega",
    "montoFact": 3283.2000000000003,
    "fechaFact": "2024-10-01",
    "nFact": "N° 9",
    "pagado": true
  },
  {
    "id": "fv_xl_102",
    "vivero": "Synergiabio",
    "empresa": "Danper Trujillo SAC",
    "pais": "Peru",
    "proforma": "DANPER-2024-02",
    "nPlantas": 1024,
    "regalia": 0.45,
    "totalOsiris": 460.8,
    "tipoPago": "Anticipo",
    "montoFact": 276.48,
    "fechaFact": "2024-10-01",
    "nFact": "N° 9",
    "pagado": true
  },
  {
    "id": "fv_xl_103",
    "vivero": "Synergiabio",
    "empresa": "Danper Trujillo SAC",
    "pais": "Peru",
    "proforma": "DANPER-CL-2025-01",
    "nPlantas": 24000,
    "regalia": 0.45,
    "totalOsiris": 10800.0,
    "tipoPago": "Entrega",
    "montoFact": 4725.0,
    "fechaFact": "2026-01-01",
    "nFact": "N° 19",
    "pagado": true
  },
  {
    "id": "fv_xl_104",
    "vivero": "Synergiabio",
    "empresa": "Danper Trujillo SAC",
    "pais": "Peru",
    "proforma": "DANPER-CL-2025-0036",
    "nPlantas": 1000,
    "regalia": 0.45,
    "totalOsiris": 450.0,
    "tipoPago": "Anticipo",
    "montoFact": 270.0,
    "fechaFact": "2026-01-01",
    "nFact": "N° 19",
    "pagado": true
  },
  {
    "id": "fv_xl_105",
    "vivero": "Synergiabio",
    "empresa": "Danper Trujillo SAC",
    "pais": "Peru",
    "proforma": "DANPER-CL-2025-0036",
    "nPlantas": 1000,
    "regalia": 0.45,
    "totalOsiris": 450.0,
    "tipoPago": "Entrega",
    "montoFact": 180.0,
    "fechaFact": "2026-01-01",
    "nFact": "N° 19",
    "pagado": true
  },
  {
    "id": "fv_xl_106",
    "vivero": "Synergiabio",
    "empresa": "Gourmet Peru",
    "pais": "Peru",
    "proforma": "GOURME-CL-2025-01",
    "nPlantas": 400,
    "regalia": 0.45,
    "totalOsiris": 180.0,
    "tipoPago": "Entrega",
    "montoFact": 180.0,
    "fechaFact": "2026-01-01",
    "nFact": "N° 19",
    "pagado": true
  },
  {
    "id": "fv_xl_107",
    "vivero": "Synergiabio",
    "empresa": "Gourmet Peru",
    "pais": "Peru",
    "proforma": "2025/0068",
    "nPlantas": 250,
    "regalia": 0.45,
    "totalOsiris": 112.5,
    "tipoPago": "Entrega",
    "montoFact": 112.5,
    "fechaFact": "2026-01-01",
    "nFact": "N° 19",
    "pagado": true
  },
  {
    "id": "fv_xl_108",
    "vivero": "Synergiabio",
    "empresa": "Vanguard",
    "pais": "Peru",
    "proforma": "OLIVOS-CL-2024-01",
    "nPlantas": 1555705,
    "regalia": 0.45,
    "totalOsiris": 700067.25,
    "tipoPago": "Anticipo",
    "montoFact": 350033.625,
    "fechaFact": "2025-01-01",
    "nFact": "N° 11",
    "pagado": true
  },
  {
    "id": "fv_xl_109",
    "vivero": "Synergiabio",
    "empresa": "Agrícola Cerro Prieto SA",
    "pais": "Peru",
    "proforma": "CPRIET-2024-01",
    "nPlantas": 1024,
    "regalia": 0.45,
    "totalOsiris": 460.8,
    "tipoPago": "Anticipo",
    "montoFact": 276.48,
    "fechaFact": "2024-10-01",
    "nFact": "N° 9",
    "pagado": true
  },
  {
    "id": "fv_xl_110",
    "vivero": "Synergiabio",
    "empresa": "Allpa Farms",
    "pais": "Peru",
    "proforma": "ALLPAF-2024-01",
    "nPlantas": 294000,
    "regalia": 0.45,
    "totalOsiris": 132300.0,
    "tipoPago": "Anticipo",
    "montoFact": 51332.4,
    "fechaFact": "2024-10-01",
    "nFact": "N° 9",
    "pagado": true
  },
  {
    "id": "fv_xl_111",
    "vivero": "Synergiabio",
    "empresa": "Allpa Farms",
    "pais": "Peru",
    "proforma": "ALLPAF-2024-01",
    "nPlantas": 294000,
    "regalia": 0.45,
    "totalOsiris": 132300.0,
    "tipoPago": "Entrega",
    "montoFact": 80967.59999999999,
    "fechaFact": "2025-03-01",
    "nFact": "N° 12",
    "pagado": true
  },
  {
    "id": "fv_xl_112",
    "vivero": "Synergiabio",
    "empresa": "Allpa Farms",
    "pais": "Peru",
    "proforma": "ALLPAF-2024-01",
    "nPlantas": 26000,
    "regalia": 0.45,
    "totalOsiris": 11700.0,
    "tipoPago": "Entrega",
    "montoFact": 11700.0,
    "fechaFact": "2025-03-01",
    "nFact": "N° 12",
    "pagado": true
  },
  {
    "id": "fv_xl_113",
    "vivero": "Synergiabio",
    "empresa": "Frusan Agro SAC",
    "pais": "Peru",
    "proforma": "FRUSAN-CL-2024-01",
    "nPlantas": 5960,
    "regalia": 0.45,
    "totalOsiris": 2682.0,
    "tipoPago": "Anticipo",
    "montoFact": 1609.2,
    "fechaFact": "2024-10-01",
    "nFact": "N° 9",
    "pagado": true
  },
  {
    "id": "fv_xl_114",
    "vivero": "Synergiabio",
    "empresa": "Frusan Agro SAC",
    "pais": "Peru",
    "proforma": "FRUSAN-CL-2024-01",
    "nPlantas": 5960,
    "regalia": 0.45,
    "totalOsiris": 2682.0,
    "tipoPago": "Entrega",
    "montoFact": 893.106,
    "fechaFact": "2025-03-01",
    "nFact": "N° 12",
    "pagado": true
  },
  {
    "id": "fv_xl_115",
    "vivero": "Synergiabio",
    "empresa": "Frusan Agro SAC",
    "pais": "Peru",
    "proforma": "FRUSAN-CL-2024-01",
    "nPlantas": 5960,
    "regalia": 0.45,
    "totalOsiris": 2682.0,
    "tipoPago": "Entrega",
    "montoFact": 187.74,
    "fechaFact": "2025-05-01",
    "nFact": "N° 13",
    "pagado": true
  },
  {
    "id": "fv_xl_116",
    "vivero": "Synergiabio",
    "empresa": "Hass Peru SA",
    "pais": "Peru",
    "proforma": "HASSPE-CL-2024-02",
    "nPlantas": 75835,
    "regalia": 0.45,
    "totalOsiris": 34125.75,
    "tipoPago": "Anticipo",
    "montoFact": 20475.45,
    "fechaFact": "2025-03-01",
    "nFact": "N° 12",
    "pagado": true
  },
  {
    "id": "fv_xl_117",
    "vivero": "Agromillora",
    "empresa": "AgroExtiende",
    "pais": "Peru",
    "proforma": "2025 - 2705",
    "nPlantas": 420000,
    "regalia": 1.15,
    "totalOsiris": 482999.99999999994,
    "tipoPago": "Anticipo",
    "montoFact": 34650.42,
    "fechaFact": "2026-03-31",
    "nFact": "N° 115",
    "pagado": false
  },
  {
    "id": "fv_xl_118",
    "vivero": "Synergiabio",
    "empresa": "Agroextiende",
    "pais": "Peru",
    "proforma": "AGROEX-CL-2024-03",
    "nPlantas": 800,
    "regalia": 0.45,
    "totalOsiris": 360.0,
    "tipoPago": "Entrega",
    "montoFact": 360.0,
    "fechaFact": "2025-03-01",
    "nFact": "N° 12",
    "pagado": true
  },
  {
    "id": "fv_xl_119",
    "vivero": "Synergiabio",
    "empresa": "Agroextiende",
    "pais": "Peru",
    "proforma": "AGROEX-2024-01",
    "nPlantas": 50000,
    "regalia": 0.45,
    "totalOsiris": 22500.0,
    "tipoPago": "Anticipo",
    "montoFact": 11250.0,
    "fechaFact": "2025-03-01",
    "nFact": "N° 12",
    "pagado": true
  },
  {
    "id": "fv_xl_120",
    "vivero": "Synergiabio",
    "empresa": "Agroextiende",
    "pais": "Peru",
    "proforma": "AGROEX-2024-01",
    "nPlantas": 50000,
    "regalia": 0.45,
    "totalOsiris": 22500.0,
    "tipoPago": "Entrega",
    "montoFact": 11250.0,
    "fechaFact": "2025-09-30",
    "nFact": "N° 14",
    "pagado": true
  },
  {
    "id": "fv_xl_121",
    "vivero": "Synergiabio",
    "empresa": "Agroextiende",
    "pais": "Peru",
    "proforma": "AGROEX-2024-02",
    "nPlantas": 150000,
    "regalia": 0.45,
    "totalOsiris": 67500.0,
    "tipoPago": "Anticipo",
    "montoFact": 33750.0,
    "fechaFact": "2025-03-01",
    "nFact": "N° 12",
    "pagado": true
  },
  {
    "id": "fv_xl_122",
    "vivero": "Synergiabio",
    "empresa": "Agroextiende",
    "pais": "Peru",
    "proforma": "AGROEX-2024-02",
    "nPlantas": 150000,
    "regalia": 0.45,
    "totalOsiris": 67500.0,
    "tipoPago": "Entrega",
    "montoFact": 33750.0,
    "fechaFact": "2025-09-30",
    "nFact": "N° 14",
    "pagado": true
  },
  {
    "id": "fv_xl_123",
    "vivero": "Synergiabio",
    "empresa": "Agroextiende",
    "pais": "Peru",
    "proforma": "AGROEX-CL-2024-04",
    "nPlantas": 200000,
    "regalia": 0.45,
    "totalOsiris": 90000.0,
    "tipoPago": "Anticipo",
    "montoFact": 31499.999999999996,
    "fechaFact": "2025-03-01",
    "nFact": "N° 12",
    "pagado": true
  },
  {
    "id": "fv_xl_124",
    "vivero": "Synergiabio",
    "empresa": "Agroextiende",
    "pais": "Peru",
    "proforma": "AGROEX-CL-2024-04",
    "nPlantas": 200000,
    "regalia": 0.45,
    "totalOsiris": 90000.0,
    "tipoPago": "Anticipo",
    "montoFact": 13500.0,
    "fechaFact": "2025-05-01",
    "nFact": "N° 13",
    "pagado": true
  },
  {
    "id": "fv_xl_125",
    "vivero": "Synergiabio",
    "empresa": "Agroextiende",
    "pais": "Peru",
    "proforma": "AGROEX-CL-2024-04",
    "nPlantas": 200000,
    "regalia": 0.45,
    "totalOsiris": 90000.0,
    "tipoPago": "Entrega",
    "montoFact": 45000.0,
    "fechaFact": "2025-09-30",
    "nFact": "N° 14",
    "pagado": true
  },
  {
    "id": "fv_xl_126",
    "vivero": "Agromillora",
    "empresa": "AgroExtiende",
    "pais": "Peru",
    "proforma": "2025 - 2705",
    "nPlantas": 420000,
    "regalia": 1.15,
    "totalOsiris": 482999.99999999994,
    "tipoPago": "Anticipo",
    "montoFact": 192149.95799999998,
    "fechaFact": "2026-05-31",
    "nFact": "",
    "pagado": false
  },
  {
    "id": "fv_xl_127",
    "vivero": "Synergiabio",
    "empresa": "Hass Peru SA",
    "pais": "Peru",
    "proforma": "HASSPE-CL-2024-02",
    "nPlantas": 75835,
    "regalia": 0.45,
    "totalOsiris": 34125.75,
    "tipoPago": "Entrega",
    "montoFact": 13650.300000000001,
    "fechaFact": "2025-12-01",
    "nFact": "N° 18",
    "pagado": true
  },
  {
    "id": "fv_xl_128",
    "vivero": "Synergiabio",
    "empresa": "Pura Berries",
    "pais": "Peru",
    "proforma": "PURABE-CL-2024-04",
    "nPlantas": 259735,
    "regalia": 0.45,
    "totalOsiris": 116880.75,
    "tipoPago": "Anticipo",
    "montoFact": 70128.45,
    "fechaFact": "2025-03-01",
    "nFact": "N° 12",
    "pagado": true
  },
  {
    "id": "fv_xl_129",
    "vivero": "Synergiabio",
    "empresa": "Mainland Farms SA",
    "pais": "Mexico",
    "proforma": "MAIFAR-MX-2025-01",
    "nPlantas": 150000,
    "regalia": 0.45,
    "totalOsiris": 67500.0,
    "tipoPago": "Entrega",
    "montoFact": 14987.025,
    "fechaFact": "2026-06-30",
    "nFact": "",
    "pagado": false
  },
  {
    "id": "fv_xl_130",
    "vivero": "Synergiabio",
    "empresa": "Coorporacion Agricola Olmos",
    "pais": "Peru",
    "proforma": "AOLMOS-CL-2025-01",
    "nPlantas": 190950,
    "regalia": 0.45,
    "totalOsiris": 85927.5,
    "tipoPago": "Entrega",
    "montoFact": 34371.0,
    "fechaFact": "2025-12-01",
    "nFact": "N° 18",
    "pagado": true
  },
  {
    "id": "fv_xl_131",
    "vivero": "Synergiabio",
    "empresa": "Frusan Agro SAC",
    "pais": "Peru",
    "proforma": "HUARME-CL-2024-02",
    "nPlantas": 305185,
    "regalia": 0.45,
    "totalOsiris": 137333.25,
    "tipoPago": "Anticipo",
    "montoFact": 72099.95625,
    "fechaFact": "2025-08-01",
    "nFact": "N° 14",
    "pagado": true
  },
  {
    "id": "fv_xl_132",
    "vivero": "Synergiabio",
    "empresa": "Coorporacion Agricola Olmos",
    "pais": "Peru",
    "proforma": "AOLMOS-CL-2025-01",
    "nPlantas": 190950,
    "regalia": 0.45,
    "totalOsiris": 85927.5,
    "tipoPago": "Anticipo",
    "montoFact": 51556.5,
    "fechaFact": "2025-05-01",
    "nFact": "N° 13",
    "pagado": true
  },
  {
    "id": "fv_xl_133",
    "vivero": "Synergiabio",
    "empresa": "Mainland Farms SA",
    "pais": "Mexico",
    "proforma": "MAIFAR-MX-2025-02",
    "nPlantas": 250000,
    "regalia": 0.45,
    "totalOsiris": 112500.0,
    "tipoPago": "Entrega",
    "montoFact": 20250.0,
    "fechaFact": "2026-06-30",
    "nFact": "",
    "pagado": false
  },
  {
    "id": "fv_xl_134",
    "vivero": "Synergiabio",
    "empresa": "Danper Trujillo SAC",
    "pais": "Peru",
    "proforma": "DANPER-CL-2025-01",
    "nPlantas": 24000,
    "regalia": 0.45,
    "totalOsiris": 10800.0,
    "tipoPago": "Anticipo",
    "montoFact": 5400.0,
    "fechaFact": "2026-09-01",
    "nFact": "N° 14",
    "pagado": true
  },
  {
    "id": "fv_xl_135",
    "vivero": "Synergiabio",
    "empresa": "Vanguard",
    "pais": "Peru",
    "proforma": "OLIVOS-CL-2024-01",
    "nPlantas": 1555705,
    "regalia": 0.45,
    "totalOsiris": 700067.25,
    "tipoPago": "Entrega",
    "montoFact": 169206.254325,
    "fechaFact": "2026-06-30",
    "nFact": "",
    "pagado": false
  },
  {
    "id": "fv_xl_136",
    "vivero": "Synergiabio",
    "empresa": "Danper Trujillo SAC",
    "pais": "Peru",
    "proforma": "DANPER-CL-2025-0148",
    "nPlantas": 884271,
    "regalia": 0.45,
    "totalOsiris": 397921.95,
    "tipoPago": "Anticipo",
    "montoFact": 238753.16999999998,
    "fechaFact": "2025-12-01",
    "nFact": "N° 18",
    "pagado": true
  },
  {
    "id": "fv_xl_137",
    "vivero": "Synergiabio",
    "empresa": "La Calera",
    "pais": "Peru",
    "proforma": "BRIDGE-PE-2025-01",
    "nPlantas": 3500,
    "regalia": 0.45,
    "totalOsiris": 1575.0,
    "tipoPago": "Entrega",
    "montoFact": 1575.0,
    "fechaFact": "2026-06-30",
    "nFact": "",
    "pagado": false
  },
  {
    "id": "fv_xl_138",
    "vivero": "Synergiabio",
    "empresa": "Integrity/Talsa",
    "pais": "Peru",
    "proforma": "INTFAR-PE-2026-01",
    "nPlantas": 2100,
    "regalia": 0.45,
    "totalOsiris": 945.0,
    "tipoPago": "Entrega",
    "montoFact": 945.0,
    "fechaFact": "2026-06-30",
    "nFact": "",
    "pagado": false
  },
  {
    "id": "fv_xl_139",
    "vivero": "Agromillora",
    "empresa": "AgroExtiende",
    "pais": "Peru",
    "proforma": "2025 - 2705",
    "nPlantas": 420000,
    "regalia": 1.15,
    "totalOsiris": 482999.99999999994,
    "tipoPago": "Entrega",
    "montoFact": 256199.62199999994,
    "fechaFact": "2026-07-31",
    "nFact": "",
    "pagado": false
  },
  {
    "id": "fv_xl_140",
    "vivero": "Synergiabio",
    "empresa": "Mainland Farms SA",
    "pais": "Mexico",
    "proforma": "MAIFAR-MX-2025-02",
    "nPlantas": 250000,
    "regalia": 0.45,
    "totalOsiris": 112500.0,
    "tipoPago": "Entrega",
    "montoFact": 30375.000000000004,
    "fechaFact": "2026-09-30",
    "nFact": "",
    "pagado": false
  },
  {
    "id": "fv_xl_141",
    "vivero": "Synergiabio",
    "empresa": "KJ Orchard CO Ltd",
    "pais": "Corea",
    "proforma": "KJORCH-CL-2025-01",
    "nPlantas": 12096,
    "regalia": 0.1,
    "totalOsiris": 1209.6000000000001,
    "tipoPago": "Entrega",
    "montoFact": 483.8400000000001,
    "fechaFact": "2026-09-30",
    "nFact": "",
    "pagado": false
  },
  {
    "id": "fv_xl_142",
    "vivero": "Synergiabio",
    "empresa": "Mainland Farms SA",
    "pais": "Mexico",
    "proforma": "MAIFAR-MX-2024-04",
    "nPlantas": 50000,
    "regalia": 0.45,
    "totalOsiris": 22500.0,
    "tipoPago": "Entrega",
    "montoFact": 2077.09425,
    "fechaFact": "2026-09-30",
    "nFact": "",
    "pagado": false
  },
  {
    "id": "fv_xl_143",
    "vivero": "Synergiabio",
    "empresa": "Frusan Agro SAC",
    "pais": "Peru",
    "proforma": "HUARME-CL-2026-0046",
    "nPlantas": 285405,
    "regalia": 0.45,
    "totalOsiris": 128432.25,
    "tipoPago": "Entrega",
    "montoFact": 51372.9,
    "fechaFact": "2026-12-31",
    "nFact": "",
    "pagado": false
  },
  {
    "id": "fv_xl_144",
    "vivero": "Synergiabio",
    "empresa": "Danper Trujillo SAC",
    "pais": "Peru",
    "proforma": "DANPER-CL-2025-0148",
    "nPlantas": 884271,
    "regalia": 0.45,
    "totalOsiris": 397921.95,
    "tipoPago": "Entrega",
    "montoFact": 159168.78000000003,
    "fechaFact": "2026-12-31",
    "nFact": "",
    "pagado": false
  },
  {
    "id": "fv_xl_145",
    "vivero": "Synergiabio",
    "empresa": "Danper Trujillo SAC",
    "pais": "Peru",
    "proforma": "DANPER-2024-02",
    "nPlantas": 1024,
    "regalia": 0.45,
    "totalOsiris": 460.8,
    "tipoPago": "Entrega",
    "montoFact": 184.32000000000002,
    "fechaFact": "2026-12-31",
    "nFact": "",
    "pagado": false
  },
  {
    "id": "fv_xl_146",
    "vivero": "Synergiabio",
    "empresa": "Mainland Farms SA",
    "pais": "Mexico",
    "proforma": "MAIFAR-2024-02",
    "nPlantas": 75000,
    "regalia": 0.45,
    "totalOsiris": 33750.0,
    "tipoPago": "Entrega",
    "montoFact": 101.25,
    "fechaFact": "2026-12-31",
    "nFact": "",
    "pagado": false
  },
  {
    "id": "fv_xl_147",
    "vivero": "Synergiabio",
    "empresa": "Frusan Agro SAC",
    "pais": "Peru",
    "proforma": "HUARME-CL-2026-0046",
    "nPlantas": 285405,
    "regalia": 0.45,
    "totalOsiris": 128432.25,
    "tipoPago": "Entrega",
    "montoFact": 9632.418749999999,
    "fechaFact": "2027-03-31",
    "nFact": "",
    "pagado": false
  }
];

// ══════════════════════════════════════════════════════════
// TOTAL PEDIDOS
// ══════════════════════════════════════════════════════════
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

function TotalPedidos({data,setData,rpData,setRpData,can,clientes=[]}) {
  const [filtroAño,setFiltroAño]=useState("Todos");
  const [filtroPais,setFiltroPais]=useState("Todos");
  const [filtroEst,setFiltroEst]=useState("Todos");
  const [busq,setBusq]=useState("");
  const [modal,setModal]=useState(false);
  const [form,setForm]=useState({cliente:"",pais:"Peru",proforma:"",año:2026,trim:1,nPlantas:"",estado:"Por confirmar"});

  const años=["Todos",...Array.from(new Set(data.map(r=>r.año))).sort()];

  const filtrado=data.filter(r=>
    (filtroAño==="Todos"||r.año===Number(filtroAño))&&
    (filtroPais==="Todos"||r.pais===filtroPais)&&
    (filtroEst==="Todos"||r.estado===filtroEst)&&
    (!busq||r.cliente.toLowerCase().includes(busq.toLowerCase())||r.proforma.toLowerCase().includes(busq.toLowerCase()))
  );

  const totalPlantas=filtrado.reduce((s,r)=>s+(Number(r.nPlantas)||0),0);
  const porPais={};filtrado.forEach(r=>{porPais[r.pais]=(porPais[r.pais]||0)+(Number(r.nPlantas)||0);});

  function upd(id,campo,valor) {
    if(campo==="estado"&&valor==="Confirmado") {
      const row=data.find(r=>r.id===id);
      if(row) {
        const yaExiste=rpData.some(r=>r.nOC===row.proforma&&r.cliente===row.cliente);
        if(!yaExiste) {
          setRpData(prev=>[...prev,{
            id:`rp_auto_${Date.now()}`,
            cliente:row.cliente, pais:row.pais,
            año:row.año, trim:row.trim,
            nPlantas:row.nPlantas, usdPlanta:0,
            nOC:row.proforma, nFact:"",
            pagado:false, fechaPago:"", vivero:"",
            _fromPedido:id,
          }]);
        }
      }
    }
    setData(prev=>prev.map(r=>r.id===id?{...r,[campo]:valor}:r));
  }

  function agregar() {
    if(!form.cliente.trim()){alert("Cliente es obligatorio.");return;}
    const nuevo={...form,id:`tp_${Date.now()}`,nPlantas:parseFloat(form.nPlantas)||0,año:parseInt(form.año),trim:parseInt(form.trim)};
    setData(prev=>[...prev,nuevo]);
    if(nuevo.estado==="Confirmado") {
      setRpData(prev=>[...prev,{
        id:`rp_auto_${Date.now()}`,
        cliente:nuevo.cliente, pais:nuevo.pais,
        año:nuevo.año, trim:nuevo.trim,
        nPlantas:nuevo.nPlantas, usdPlanta:0,
        nOC:nuevo.proforma, nFact:"",
        pagado:false, fechaPago:"", vivero:"",
        _fromPedido:nuevo.id,
      }]);
    }
    setModal(false);
    setForm({cliente:"",pais:"Peru",proforma:"",año:2026,trim:1,nPlantas:"",estado:"Por confirmar"});
  }

  return (
    <div>
      <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        <div style={{background:C.tealBg,borderRadius:12,padding:"12px 18px",flex:1,minWidth:140}}>
          <div style={{fontSize:11,color:C.teal,fontWeight:600}}>Total Plantas</div>
          <div style={{fontSize:22,fontWeight:800,color:C.teal}}>{N(totalPlantas)}</div>
        </div>
        <div style={{background:C.verdeBg,borderRadius:12,padding:"12px 18px",flex:1,minWidth:120}}>
          <div style={{fontSize:11,color:C.verde,fontWeight:600}}>Confirmados</div>
          <div style={{fontSize:22,fontWeight:800,color:C.verde}}>{filtrado.filter(r=>r.estado==="Confirmado").length}</div>
        </div>
        <div style={{background:C.amBg,borderRadius:12,padding:"12px 18px",flex:1,minWidth:120}}>
          <div style={{fontSize:11,color:C.am,fontWeight:600}}>Por confirmar</div>
          <div style={{fontSize:22,fontWeight:800,color:C.am}}>{filtrado.filter(r=>r.estado==="Por confirmar").length}</div>
        </div>
        {Object.entries(porPais).map(([p,n])=>(
          <div key={p} style={{background:"#fff",borderRadius:12,padding:"12px 18px",flex:1,minWidth:100,border:"1px solid #e2e8f0"}}>
            <div style={{fontSize:11,color:C.gris,fontWeight:600}}>{p}</div>
            <div style={{fontSize:18,fontWeight:800,color:C.sl}}>{N(n)}</div>
          </div>
        ))}
        {can&&<button onClick={()=>setModal(true)} style={{background:C.azul,color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontSize:12,fontWeight:700,alignSelf:"center"}}>+ Agregar</button>}
      </div>
      <BarraFiltros
        filtros={[
          {label:"Cliente",tipo:"input",valor:busq,onChange:setBusq},
          {label:"País",opciones:["Todos",...Array.from(new Set(data.map(r=>r.pais).filter(Boolean))).sort()],valor:filtroPais,onChange:setFiltroPais},
          {label:"Año",opciones:años,valor:filtroAño,onChange:v=>setFiltroAño(String(v))},
          {label:"Estado",opciones:["Todos","Confirmado","Por confirmar"],valor:filtroEst,onChange:setFiltroEst},
        ]}
        onExportar={async ()=>exportCSV(
          filtrado.map(r=>[r.cliente,r.pais,r.proforma||"",r.año,r.trim||"",r.nPlantas||0,r.estado||""]),
          ["Cliente","País","Proforma","Año","Trim.","N° Plantas","Estado"],
          "TotalPedidos"
        )}
      />
      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",background:"#fff",borderRadius:10,overflow:"hidden"}}>
          <Th cols={[
            {l:"Cliente",w:130},{l:"País",w:80},{l:"Proforma",w:150},
            {l:"Año",c:true,w:60},{l:"Trim.",c:true,w:55},{l:"N° Plantas",c:true,w:110},
            {l:"Estado",c:true,w:160},
            ...(can?[{l:"",c:true,w:40}]:[]),
          ]}/>
          <tbody>
            {filtrado.map((r,i)=>(
              <tr key={r.id} style={{borderBottom:"1px solid #f1f5f9",
                background:r.estado==="Confirmado"?"#f0fdf4":r.estado==="Por confirmar"?"#fffbeb":i%2===0?"#fff":"#f8fafc"}}>
                <td style={{padding:"8px 12px",fontWeight:600}}>
                  <NombreCliente nombre={r.cliente} clientes={clientes} onChange={v=>upd(r.id,"cliente",v)} can={can}/>
                </td>
                <td style={{padding:"8px 12px",fontSize:11,color:C.gris}}>
                  <Cell val={r.pais} onChange={v=>upd(r.id,"pais",v)} opts={PAISES} can={can}/>
                </td>
                <td style={{padding:"8px 12px",fontSize:11,color:C.gris}}>
                  <Cell val={r.proforma} onChange={v=>upd(r.id,"proforma",v)} can={can}/>
                </td>
                <td style={{padding:"8px 12px",textAlign:"center",fontSize:11}}>{r.año}</td>
                <td style={{padding:"8px 12px",textAlign:"center",fontSize:11}}>T{r.trim}</td>
                <td style={{padding:"8px 12px",textAlign:"right",fontWeight:600,color:C.teal}}>
                  <Cell val={r.nPlantas} onChange={v=>upd(r.id,"nPlantas",parseFloat(v))} type="number" can={can}/>
                </td>
                <td style={{padding:"8px 12px",textAlign:"center"}}>
                  <BadgeEstado val={r.estado} opts={["Por confirmar","Confirmado"]} onChange={v=>upd(r.id,"estado",v)} can={can}/>
                  {r.estado==="Confirmado"&&<div style={{fontSize:9,color:C.verde,marginTop:2}}>→ en Royalty/Planta</div>}
                </td>
                {can&&<td style={{padding:"4px 6px",textAlign:"center"}}>
                  <button onClick={()=>{if(window.confirm(`¿Eliminar "${r.cliente}"?`))setData(prev=>prev.filter(x=>x.id!==r.id));}}
                    style={{background:"#fee2e2",border:"none",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:12,color:"#991b1b",fontWeight:700}}>×</button>
                </td>}
              </tr>
            ))}
            {filtrado.length===0&&<tr><td colSpan={7} style={{textAlign:"center",padding:32,color:C.gris}}>Sin registros</td></tr>}
          </tbody>
        </table>
      </div>

      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#0006",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:16,padding:28,width:460,maxWidth:"92vw",boxShadow:"0 8px 32px #0003"}}>
            <h3 style={{margin:"0 0 16px",color:C.sl}}>Nuevo Pedido</h3>
            <SelectorCliente form={form} setForm={setForm} clientes={clientes}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:8}}>
              {[["Proforma","proforma","text"],["Año","año","number"],["Trimestre","trim","number"],["N° Plantas","nPlantas","number"]].map(([l,c,t])=>(
                <div key={c}>
                  <label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>{l}</label>
                  <input type={t} value={form[c]} onChange={e=>setForm(p=>({...p,[c]:e.target.value}))}
                    style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
                </div>
              ))}
              <div>
                <label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>País</label>
                <select value={form.pais} onChange={e=>setForm(p=>({...p,pais:e.target.value}))}
                  style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}>
                  {PAISES.map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>Estado inicial</label>
                <select value={form.estado} onChange={e=>setForm(p=>({...p,estado:e.target.value}))}
                  style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}>
                  {["Por confirmar","Confirmado"].map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
            </div>
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
// ROYALTY POR PLANTA
// ══════════════════════════════════════════════════════════
function RoyaltyPlanta({data,setData,can,clientes=[]}) {
  const [filtroAño,setFiltroAño]=useState("Todos");
  const [filtroFact,setFiltroFact]=useState("Todos");
  const [filtroPais,setFiltroPais]=useState("Todos");
  const [filtroCobro,setFiltroCobro]=useState("Todos");
  const [filtroCli,setFiltroCli]=useState("");
  const [modal,setModal]=useState(false);
  const [form,setForm]=useState({cliente:"",pais:"Peru",año:2026,trim:1,nPlantas:"",usdPlanta:"",nOC:"",nFact:"",pagado:false,fechaPago:"",vivero:"Synergia Chile"});

  const años=["Todos",...Array.from(new Set(data.map(r=>r.año))).sort()];
  const paises=["Todos",...Array.from(new Set(data.map(r=>r.pais).filter(Boolean))).sort()];

  const calc=useMemo(()=>data.map(r=>{
    const mf=(Number(r.nPlantas)||0)*(Number(r.usdPlanta)||0);
    return{...r,montoFact:mf,montoCobro:mf*pct(r.pais)};
  }),[data]);

  const filtrado=calc.filter(r=>
    (filtroAño==="Todos"||r.año===Number(filtroAño))&&
    (filtroPais==="Todos"||r.pais===filtroPais)&&
    (filtroCobro==="Todos"||(filtroCobro==="Pagado"?r.pagado:!r.pagado))&&
    (filtroFact==="Todos"||(filtroFact==="Facturado"?r.nFact&&r.nFact.trim()!=="":!r.nFact||r.nFact.trim()===""))&&
    (!filtroCli||r.cliente?.toLowerCase().includes(filtroCli.toLowerCase()))
  );

  const totFact=filtrado.reduce((s,r)=>s+r.montoFact,0);
  const totCobro=filtrado.reduce((s,r)=>s+r.montoCobro,0);
  const totPend=filtrado.filter(r=>!r.pagado).reduce((s,r)=>s+r.montoCobro,0);

  const upd=(id,c,v)=>setData(prev=>prev.map(r=>r.id===id?{...r,[c]:v}:r));

  function agregar(){
    if(!form.cliente.trim()){alert("Cliente obligatorio.");return;}
    setData(prev=>[...prev,{...form,id:`rp_${Date.now()}`,nPlantas:parseFloat(form.nPlantas)||0,usdPlanta:parseFloat(form.usdPlanta)||0,año:parseInt(form.año),trim:parseInt(form.trim)}]);
    setModal(false);
    setForm({cliente:"",pais:"Peru",año:2026,trim:1,nPlantas:"",usdPlanta:"",nOC:"",nFact:"",pagado:false,fechaPago:"",vivero:"Synergia Chile"});
  }

  return (
    <div>
      <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        {[[$$(totFact),"Monto a Facturar",C.azul,C.azulBg],[$$(totCobro),"Monto a Cobrar",C.verde,C.verdeBg],[$$(totPend),"Por Cobrar",C.am,C.amBg],[filtrado.length,"Registros",C.gris,C.grisBg]].map(([v,l,c,bg])=>(
          <div key={l} style={{background:bg,borderRadius:12,padding:"12px 18px",flex:1,minWidth:130}}>
            <div style={{fontSize:11,color:c,fontWeight:600}}>{l}</div>
            <div style={{fontSize:20,fontWeight:800,color:c}}>{v}</div>
          </div>
        ))}
        {can&&<button onClick={()=>setModal(true)} style={{background:C.azul,color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontSize:12,fontWeight:700,alignSelf:"center"}}>+ Agregar</button>}
      </div>

      <div style={{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:10,padding:"8px 14px",marginBottom:14,fontSize:12,color:"#15803d"}}>
        💡 Monto Facturar = N° Plantas × US$/Planta &nbsp;·&nbsp; Monto Cobrar = <strong>85% Perú/México (WHT 15%) · 100% Chile (sin WHT)</strong>
      </div>

      <BarraFiltros
        filtros={[
          {label:"Cliente",tipo:"input",valor:filtroCli,onChange:setFiltroCli},
          {label:"País",opciones:paises,valor:filtroPais,onChange:setFiltroPais},
          {label:"Año",opciones:años,valor:filtroAño,onChange:v=>setFiltroAño(String(v))},
          {label:"Cobro",opciones:["Todos","Pagado","Por cobrar"],valor:filtroCobro,onChange:setFiltroCobro},
          {label:"Factura",opciones:["Todos","Facturado","Pendiente de facturar"],valor:filtroFact,onChange:setFiltroFact},
        ]}
        onExportar={async ()=>exportCSV(
          filtrado.map(r=>[r.cliente,r.pais,`${r.año} T${r.trim}`,r.nPlantas,r.usdPlanta,
            r.montoFact.toFixed(2),r.montoCobro.toFixed(2),r.nOC||"",r.nFact||"",
            r.pagado?"Pagado":"Por cobrar",r.fechaPago||"",r.vivero||""]),
          ["Cliente","País","Año/Trim","N° Plantas","US$/Planta","Mto.Facturar","Mto.Cobrar","N° OC","N° Factura","Estado Cobro","Fecha Pago","Vivero"],
          "RoyaltyPlanta"
        )}
      />

      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",background:"#fff",borderRadius:10,overflow:"hidden"}}>
          <Th cols={[
            {l:"Cliente",w:110},{l:"País",w:70},{l:"Año/Trim.",c:true,w:70},
            {l:"N° Plantas",c:true,w:90},{l:"US$/Planta",c:true,w:80},
            {l:"Mto. Facturar",c:true,w:115},{l:"Mto. Cobrar",c:true,w:115},
            {l:"N° OC",c:true,w:90},{l:"N° Factura",c:true,w:100},
            {l:"Fact. Est.",c:true,w:130},{l:"Cobro",c:true,w:110},
            {l:"Fecha pago",c:true,w:100},{l:"Vivero",w:110},
            ...(can?[{l:"",c:true,w:40}]:[]),
          ]}/>
          <tbody>
            {filtrado.map((r,i)=>(
              <tr key={r.id} style={{borderBottom:"1px solid #f1f5f9",background:r._fromPedido?"#f0fdf4":i%2===0?"#fff":"#f8fafc"}}>
                <td style={{padding:"7px 10px",fontWeight:600}}>
                  <NombreCliente nombre={r.cliente} clientes={clientes} onChange={v=>upd(r.id,"cliente",v)} can={can}/>
                  {r._fromPedido&&<div style={{fontSize:9,color:C.verde}}>📦 desde pedido</div>}
                </td>
                <td style={{padding:"7px 10px",fontSize:11,color:C.gris}}><Cell val={r.pais} onChange={v=>upd(r.id,"pais",v)} opts={PAISES} can={can}/></td>
                <td style={{padding:"7px 10px",textAlign:"center",fontSize:11}}>{r.año} T{r.trim}</td>
                <td style={{padding:"7px 10px",textAlign:"right",fontWeight:600}}><Cell val={r.nPlantas} onChange={v=>upd(r.id,"nPlantas",parseFloat(v))} type="number" can={can}/></td>
                <td style={{padding:"7px 10px",textAlign:"center"}}><Cell val={r.usdPlanta} onChange={v=>upd(r.id,"usdPlanta",parseFloat(v))} type="number" can={can}/></td>
                <td style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:C.azul}}>{$$(r.montoFact)}</td>
                <td style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:C.verde}}>
                  {$$(r.montoCobro)}<div style={{fontSize:9,color:C.gris}}>{whtLabel(r.pais)||`${(pct(r.pais)*100).toFixed(0)}% neto`}</div>
                </td>
                <td style={{padding:"7px 10px",textAlign:"center"}}><Cell val={r.nOC} onChange={v=>upd(r.id,"nOC",v)} can={can} ph="OC-..."/></td>
                <td style={{padding:"7px 10px",textAlign:"center"}}><Cell val={r.nFact} onChange={v=>upd(r.id,"nFact",v)} can={can} ph="F-..."/></td>
                <td style={{padding:"7px 10px",textAlign:"center"}}><BadgeFact nFact={r.nFact}/></td>
                <td style={{padding:"7px 10px",textAlign:"center"}}><BadgePago pagado={r.pagado} onChange={v=>upd(r.id,"pagado",v)} can={can}/></td>
                <td style={{padding:"7px 10px",textAlign:"center",fontSize:11,color:C.gris}}><Cell val={r.fechaPago} onChange={v=>upd(r.id,"fechaPago",v)} type="date" can={can}/></td>
                <td style={{padding:"7px 10px",fontSize:11}}><Cell val={r.vivero} onChange={v=>upd(r.id,"vivero",v)} opts={VIVEROS} can={can}/></td>
                {can&&<td style={{padding:"4px 6px",textAlign:"center"}}>
                  <button onClick={()=>{if(window.confirm(`¿Eliminar registro de "${r.cliente}"?`))setData(prev=>prev.filter(x=>x.id!==r.id));}}
                    style={{background:"#fee2e2",border:"none",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:12,color:"#991b1b",fontWeight:700}}>×</button>
                </td>}
              </tr>
            ))}
            {filtrado.length===0&&<tr><td colSpan={13} style={{textAlign:"center",padding:32,color:C.gris}}>Sin registros</td></tr>}
          </tbody>
        </table>
      </div>

      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#0006",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:16,padding:28,width:500,maxWidth:"92vw",maxHeight:"90vh",overflowY:"auto",boxShadow:"0 8px 32px #0003"}}>
            <h3 style={{margin:"0 0 16px",color:C.sl}}>Nuevo Royalty por Planta</h3>
            <SelectorCliente form={form} setForm={setForm} clientes={clientes}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:8}}>
              {[["País","pais","select",PAISES],["Año","año","number",null],["Trimestre","trim","number",null],["N° Plantas","nPlantas","number",null],["US$/Planta","usdPlanta","number",null],["N° Orden de Compra","nOC","text",null],["N° Factura","nFact","text",null],["Fecha pago","fechaPago","date",null],["Vivero","vivero","select",VIVEROS]].map(([l,c,t,opts])=>(
                <div key={c}>
                  <label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>{l}</label>
                  {opts?<select value={form[c]} onChange={e=>setForm(p=>({...p,[c]:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}>{opts.map(o=><option key={o}>{o}</option>)}</select>
                  :<input type={t} value={form[c]} onChange={e=>setForm(p=>({...p,[c]:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>}
                </div>
              ))}
            </div>
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
// ROYALTY COMERCIAL
// ══════════════════════════════════════════════════════════
function RoyaltyComercial({data,setData,can,clientes=[]}) {
  const [filtroAño,setFiltroAño]=useState("Todos");
  const [filtroPais,setFiltroPais]=useState("Todos");
  const [filtroCobro,setFiltroCobro]=useState("Todos");
  const [filtroCli,setFiltroCli]=useState("");
  const [modal,setModal]=useState(false);
  const [form,setForm]=useState({cliente:"",pais:"Peru",trimCobro:2,añoCobro:2026,nPlantas:"",ha:"",usdHa:3000,nFact:"",pagado:false});

  const calc=useMemo(()=>{
    const h=new Date(); h.setHours(0,0,0,0);
    return data.map(r=>{
      const mf=(Number(r.ha)||0)*(Number(r.usdHa)||0);
      const mc=mf*pct(r.pais);
      const fAviso=fechaAvisoTrim(r.añoCobro,r.trimCobro);
      const fInicio=fechaInicioTrim(r.añoCobro,r.trimCobro);
      const diasAviso=Math.ceil((fAviso-h)/(1000*60*60*24));
      const alertaActiva=h>=fAviso&&h<fInicio&&!r.nFact;
      return{...r,montoFact:mf,montoCobro:mc,fAviso,fInicio,diasAviso,alertaActiva};
    });
  },[data]);

  const años=["Todos",...Array.from(new Set(calc.map(r=>r.añoCobro))).sort()];
  const filtrado=calc.filter(r=>
    (filtroAño==="Todos"||r.añoCobro===Number(filtroAño))&&
    (filtroPais==="Todos"||r.pais===filtroPais)&&
    (filtroCobro==="Todos"||(filtroCobro==="Pagado"?r.pagado:!r.pagado))&&
    (!filtroCli||r.cliente?.toLowerCase().includes(filtroCli.toLowerCase()))
  );

  const alertas=calc.filter(r=>r.alertaActiva);
  const totFact=filtrado.reduce((s,r)=>s+r.montoFact,0);
  const totCobro=filtrado.reduce((s,r)=>s+r.montoCobro,0);

  const upd=(id,c,v)=>setData(prev=>prev.map(r=>r.id===id?{...r,[c]:v}:r));

  function agregar(){
    if(!form.cliente.trim()||!form.ha){alert("Cliente y Há a cobrar son obligatorios.");return;}
    setData(prev=>[...prev,{...form,id:`rc_${Date.now()}`,nPlantas:parseFloat(form.nPlantas)||0,ha:parseFloat(form.ha)||0,usdHa:parseFloat(form.usdHa)||0,añoCobro:parseInt(form.añoCobro),trimCobro:parseInt(form.trimCobro)}]);
    setModal(false);
  }

  const TRIM_LABELS=["","T1 (Ene-Mar)","T2 (Abr-Jun)","T3 (Jul-Sep)","T4 (Oct-Dic)"];

  return (
    <div>
      {alertas.length>0&&(
        <div style={{marginBottom:16}}>
          {alertas.map(r=>(
            <div key={r.id} style={{background:"#fef3c7",border:"2px solid #fde047",borderRadius:12,padding:"12px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:22}}>⚠️</span>
              <div>
                <div style={{fontWeight:700,fontSize:13,color:C.sl}}>Facturar en 1 mes — {r.cliente}</div>
                <div style={{fontSize:12,color:C.gris}}>
                  Royalty Comercial {TRIM_LABELS[r.trimCobro]} {r.añoCobro} · {$$(r.montoFact)} a facturar
                  &nbsp;· Inicio cobro: {r.fInicio.toLocaleDateString("es-CL")}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        {[[$$(totFact),"Total a Facturar",C.mo,C.moBg],[$$(totCobro),"Total a Cobrar",C.verde,C.verdeBg],[filtrado.length,"Registros",C.gris,C.grisBg]].map(([v,l,c,bg])=>(
          <div key={l} style={{background:bg,borderRadius:12,padding:"12px 18px",flex:1,minWidth:130}}>
            <div style={{fontSize:11,color:c,fontWeight:600}}>{l}</div>
            <div style={{fontSize:20,fontWeight:800,color:c}}>{v}</div>
          </div>
        ))}
        {can&&<button onClick={()=>setModal(true)} style={{background:C.azul,color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontSize:12,fontWeight:700,alignSelf:"center"}}>+ Agregar</button>}
      </div>

      <div style={{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:10,padding:"8px 14px",marginBottom:14,fontSize:12,color:"#15803d"}}>
        💡 Monto Facturar = Há a cobrar × US$/Há (por defecto US$3.000/Há) &nbsp;·&nbsp; Monto Cobrar = <strong>85% Perú/México (WHT 15%) · 100% Chile (sin WHT)</strong>
      </div>

      <BarraFiltros
        filtros={[
          {label:"Cliente",tipo:"input",valor:filtroCli,onChange:setFiltroCli},
          {label:"País",opciones:["Todos",...Array.from(new Set(data.map(r=>r.pais).filter(Boolean))).sort()],valor:filtroPais,onChange:setFiltroPais},
          {label:"Año",opciones:años,valor:filtroAño,onChange:v=>setFiltroAño(String(v))},
          {label:"Cobro",opciones:["Todos","Pagado","Por cobrar"],valor:filtroCobro,onChange:setFiltroCobro},
        ]}
        onExportar={async ()=>exportCSV(
          filtrado.map(r=>[r.cliente,r.pais,`T${r.trimCobro} ${r.añoCobro}`,r.nPlantas||0,r.ha||0,
            r.usdHa||3000,r.montoFact.toFixed(2),r.montoCobro.toFixed(2),r.nFact||"",
            r.pagado?"Pagado":"Por cobrar"]),
          ["Cliente","País","Trim/Año","N° Plantas","Há","US$/Há","Mto.Facturar","Mto.Cobrar","N° Factura","Estado Cobro"],
          "RoyaltyComercial"
        )}
      />
      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",background:"#fff",borderRadius:10,overflow:"hidden"}}>
          <Th cols={[
            {l:"Cliente",w:120},{l:"País",w:70},{l:"Trim./Año cobro",c:true,w:120},
            {l:"N° Plantas",c:true,w:100},{l:"Há a cobrar",c:true,w:100},{l:"US$/Há",c:true,w:90},
            {l:"Mto. Facturar",c:true,w:115},{l:"Mto. Cobrar",c:true,w:115},
            {l:"N° Factura",c:true,w:100},{l:"Fact. Est.",c:true,w:130},{l:"Cobro",c:true,w:110},
            {l:"Alerta",c:true,w:80},
            ...(can?[{l:"",c:true,w:40}]:[]),
          ]}/>
          <tbody>
            {filtrado.map((r,i)=>(
              <tr key={r.id} style={{borderBottom:"1px solid #f1f5f9",
                background:r.alertaActiva?"#fffbeb":i%2===0?"#fff":"#f8fafc"}}>
                <td style={{padding:"7px 10px",fontWeight:600}}>
                  <NombreCliente nombre={r.cliente} clientes={clientes} onChange={v=>upd(r.id,"cliente",v)} can={can}/>
                </td>
                <td style={{padding:"7px 10px",fontSize:11,color:C.gris}}>{r.pais}</td>
                <td style={{padding:"7px 10px",textAlign:"center",fontSize:11}}>
                  <div style={{fontWeight:600}}>{TRIM_LABELS[r.trimCobro]}</div>
                  <div style={{color:C.gris}}>{r.añoCobro}</div>
                </td>
                <td style={{padding:"7px 10px",textAlign:"right",fontWeight:600,color:C.teal}}>{N(r.nPlantas||0)}</td>
                <td style={{padding:"7px 10px",textAlign:"right",fontWeight:600,background:(!r.ha||r.ha===0)&&can?"#fffbeb":"transparent"}}><Cell val={r.ha||""} onChange={v=>upd(r.id,"ha",parseFloat(v))} type="number" can={can} ph="Ingrese Há"/></td>
                <td style={{padding:"7px 10px",textAlign:"center"}}><Cell val={r.usdHa||3000} onChange={v=>upd(r.id,"usdHa",parseFloat(v)||3000)} type="number" can={can}/></td>
                <td style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:C.mo}}>{$$(r.montoFact)}</td>
                <td style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:C.verde}}>
                  {$$(r.montoCobro)}<div style={{fontSize:9,color:C.gris}}>{whtLabel(r.pais)||`${(pct(r.pais)*100).toFixed(0)}% neto`}</div>
                </td>
                <td style={{padding:"7px 10px",textAlign:"center"}}><Cell val={r.nFact} onChange={v=>upd(r.id,"nFact",v)} can={can} ph="F-..."/></td>
                <td style={{padding:"7px 10px",textAlign:"center"}}><BadgeFact nFact={r.nFact}/></td>
                <td style={{padding:"7px 10px",textAlign:"center"}}><BadgePago pagado={r.pagado} onChange={v=>upd(r.id,"pagado",v)} can={can}/></td>
                <td style={{padding:"7px 10px",textAlign:"center"}}>
                  {r.alertaActiva
                    ? <span style={{fontSize:18}}>⚠️</span>
                    : <span style={{fontSize:10,color:C.gris}}>{r.diasAviso>0?`${r.diasAviso}d`:"—"}</span>}
                </td>
                {can&&<td style={{padding:"4px 6px",textAlign:"center"}}>
                  <button onClick={()=>{if(window.confirm(`¿Eliminar royalty comercial de "${r.cliente}"?`))setData(prev=>prev.filter(x=>x.id!==r.id));}}
                    style={{background:"#fee2e2",border:"none",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:12,color:"#991b1b",fontWeight:700}}>×</button>
                </td>}
              </tr>
            ))}
            {filtrado.length===0&&<tr><td colSpan={12} style={{textAlign:"center",padding:32,color:C.gris}}>Sin registros</td></tr>}
          </tbody>
        </table>
      </div>

      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#0006",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:16,padding:28,width:440,maxWidth:"92vw",boxShadow:"0 8px 32px #0003"}}>
            <h3 style={{margin:"0 0 16px",color:C.sl}}>Nuevo Royalty Comercial</h3>
            <SelectorCliente form={form} setForm={setForm} clientes={clientes}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:8}}>
              {[["País","pais","select",PAISES],["Trimestre inicio cobro","trimCobro","select",["1","2","3","4"]],["Año inicio cobro","añoCobro","number",null],["N° Plantas","nPlantas","number",null],["Há a cobrar","ha","number",null],["US$/Há (por def. $3.000)","usdHa","number",null],["N° Factura","nFact","text",null]].map(([l,c,t,opts])=>(
                <div key={c}>
                  <label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>{l}</label>
                  {opts?<select value={form[c]} onChange={e=>setForm(p=>({...p,[c]:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}>{opts.map(o=><option key={o}>{o}</option>)}</select>
                  :<input type={t} value={form[c]} onChange={e=>setForm(p=>({...p,[c]:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>}
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
// FEE ENTRADA
// ══════════════════════════════════════════════════════════
function FeeEntrada({data,setData,can,clientes=[]}) {
  const [filtroPais,setFiltroPais]=useState("Todos");
  const [filtroCobro,setFiltroCobro]=useState("Todos");
  const [filtroCli,setFiltroCli]=useState("");
  const [modal,setModal]=useState(false);
  const [form,setForm]=useState({cliente:"",pais:"Peru",nFact:"",pagado:false,fechaPago:"",montoUSD:30000,detalle:"Sin Devolución"});
  const upd=(id,c,v)=>setData(prev=>prev.map(r=>r.id===id?{...r,[c]:v}:r));
  function agregar(){if(!form.cliente.trim()){alert("Cliente obligatorio.");return;}setData(prev=>[...prev,{...form,id:`fe_${Date.now()}`,montoUSD:parseFloat(form.montoUSD)||30000}]);setModal(false);}
  const filtrado=data.filter(r=>
    (filtroPais==="Todos"||r.pais===filtroPais)&&
    (filtroCobro==="Todos"||(filtroCobro==="Pagado"?r.pagado:!r.pagado))&&
    (!filtroCli||r.cliente?.toLowerCase().includes(filtroCli.toLowerCase()))
  );
  const totCobFilt=filtrado.filter(r=>r.pagado).reduce((s,r)=>s+(r.montoUSD||0),0);
  const totPendFilt=filtrado.filter(r=>!r.pagado).reduce((s,r)=>s+(r.montoUSD||0),0);
  return (
    <div>
      <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        {[[$$(totCobFilt),"Cobrado",C.verde,C.verdeBg],[$$(totPendFilt),"Por cobrar",C.am,C.amBg],[filtrado.length,"Registros",C.gris,C.grisBg]].map(([v,l,c,bg])=>(
          <div key={l} style={{background:bg,borderRadius:12,padding:"12px 18px",flex:1,minWidth:120}}>
            <div style={{fontSize:11,color:c,fontWeight:600}}>{l}</div>
            <div style={{fontSize:20,fontWeight:800,color:c}}>{v}</div>
          </div>
        ))}
        {can&&<button onClick={()=>setModal(true)} style={{background:C.azul,color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontSize:12,fontWeight:700,alignSelf:"center"}}>+ Agregar</button>}
      </div>
      <BarraFiltros
        filtros={[
          {label:"Cliente",tipo:"input",valor:filtroCli,onChange:setFiltroCli},
          {label:"País",opciones:["Todos","Peru","Mexico","Chile"],valor:filtroPais,onChange:setFiltroPais},
          {label:"Cobro",opciones:["Todos","Pagado","Por cobrar"],valor:filtroCobro,onChange:setFiltroCobro},
        ]}
        onExportar={async ()=>exportCSV(
          filtrado.map(r=>[r.cliente,r.pais,r.nFact||"",
            r.pagado?"Pagado":"Por cobrar",r.fechaPago||"",r.montoUSD||0,r.detalle||""]),
          ["Cliente","País","N° Factura","Estado Cobro","Fecha Pago","Monto US$","Detalle"],
          "FeeEntrada"
        )}
      />
      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",background:"#fff",borderRadius:10,overflow:"hidden"}}>
          <Th cols={[{l:"Cliente",w:130},{l:"País",w:80},{l:"N° Factura",c:true,w:110},{l:"Fact. Est.",c:true,w:130},{l:"Fecha pago",c:true,w:100},{l:"Monto US$",c:true,w:100},{l:"Cobro",c:true,w:110},{l:"Detalle",w:140},...(can?[{l:"",c:true,w:40}]:[])]}/>
          <tbody>
            {filtrado.map((r,i)=>(
              <tr key={r.id} style={{borderBottom:"1px solid #f1f5f9",background:i%2===0?"#fff":"#f8fafc"}}>
                <td style={{padding:"8px 12px"}}>
                  <NombreCliente nombre={r.cliente} clientes={clientes} onChange={v=>upd(r.id,"cliente",v)} can={can}/>
                </td>
                <td style={{padding:"8px 12px"}}><Cell val={r.pais} onChange={v=>upd(r.id,"pais",v)} opts={["Peru","Mexico","Chile"]} can={can}/></td>
                <td style={{padding:"8px 12px",textAlign:"center"}}><Cell val={r.nFact} onChange={v=>upd(r.id,"nFact",v)} can={can} ph="F-..."/></td>
                <td style={{padding:"8px 12px",textAlign:"center"}}><BadgeFact nFact={r.nFact}/></td>
                <td style={{padding:"8px 12px",textAlign:"center",fontSize:11,color:C.gris}}><Cell val={r.fechaPago} onChange={v=>upd(r.id,"fechaPago",v)} type="date" can={can}/></td>
                <td style={{padding:"8px 12px",textAlign:"right",fontWeight:700,color:C.verde}}><Cell val={r.montoUSD} onChange={v=>upd(r.id,"montoUSD",parseFloat(v))} type="number" can={can}/></td>
                <td style={{padding:"8px 12px",textAlign:"center"}}><BadgePago pagado={r.pagado} onChange={v=>upd(r.id,"pagado",v)} can={can}/></td>
                <td style={{padding:"8px 12px",fontSize:11,color:C.gris}}><Cell val={r.detalle} onChange={v=>upd(r.id,"detalle",v)} can={can}/></td>
                {can&&<td style={{padding:"4px 6px",textAlign:"center"}}>
                  <button onClick={()=>{if(window.confirm(`¿Eliminar fee entrada de "${r.cliente}"?`))setData(prev=>prev.filter(x=>x.id!==r.id));}}
                    style={{background:"#fee2e2",border:"none",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:12,color:"#991b1b",fontWeight:700}}>×</button>
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#0006",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:16,padding:28,width:400,maxWidth:"92vw",boxShadow:"0 8px 32px #0003"}}>
            <h3 style={{margin:"0 0 16px",color:C.sl}}>Nuevo Fee de Entrada</h3>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <SelectorCliente form={form} setForm={setForm} clientes={clientes}/>
              {[["N° Factura","nFact","text"],["Fecha pago","fechaPago","date"],["Detalle","detalle","text"]].map(([l,c,t])=>(
                <div key={c}><label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>{l}</label>
                <input type={t} value={form[c]} onChange={e=>setForm(p=>({...p,[c]:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/></div>
              ))}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div><label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>País</label>
                <select value={form.pais} onChange={e=>setForm(p=>({...p,pais:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}>{["Peru","Mexico","Chile"].map(o=><option key={o}>{o}</option>)}</select></div>
                <div><label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>Monto US$</label>
                <input type="number" value={form.montoUSD} onChange={e=>setForm(p=>({...p,montoUSD:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/></div>
              </div>
            </div>
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
// FEE VIVEROS
// ══════════════════════════════════════════════════════════
function FeeViveros({data,setData,can,clientes=[]}) {
  const [filtroEst,setFiltroEst]=useState("Todos");
  const [filtroPais,setFiltroPais]=useState("Todos");
  const [filtroCobro,setFiltroCobro]=useState("Todos");
  const [filtroCli,setFiltroCli]=useState("");
  const [modal,setModal]=useState(false);
  const [form,setForm]=useState({vivero:"Synergiabio",empresa:"",pais:"Peru",proforma:"",nPlantas:"",regalia:0.45,totalOsiris:"",tipoPago:"Entrega",montoFact:"",fechaFact:"",nFact:"",pagado:false});
  const upd=(id,c,v)=>setData(prev=>prev.map(r=>r.id===id?{...r,[c]:v}:r));

  const filtrado=data.filter(r=>{
    if(filtroEst!=="Todos"){
      if(filtroEst==="Facturado"&&!(r.nFact&&r.nFact.trim()!==""))return false;
      if(filtroEst==="Pendiente"&&(r.nFact&&r.nFact.trim()!==""))return false;
    }
    if(filtroPais!=="Todos"&&r.pais!==filtroPais)return false;
    if(filtroCobro!=="Todos"&&(filtroCobro==="Pagado"?!r.pagado:r.pagado))return false;
    if(filtroCli&&!r.empresa?.toLowerCase().includes(filtroCli.toLowerCase()))return false;
    return true;
  });;

  const totFact=filtrado.reduce((s,r)=>s+(Number(r.montoFact)||0),0);
  const totPend=filtrado.filter(r=>!r.pagado).reduce((s,r)=>s+(Number(r.montoFact)||0),0);

  function agregar(){if(!form.empresa.trim()){alert("Empresa obligatoria.");return;}
    setData(prev=>[...prev,{...form,id:`fv_${Date.now()}`,nPlantas:parseFloat(form.nPlantas)||0,regalia:parseFloat(form.regalia)||0,totalOsiris:parseFloat(form.totalOsiris)||0,montoFact:parseFloat(form.montoFact)||0}]);setModal(false);}

  return (
    <div>
      <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        {[[$$(totFact),"Total a Facturar",C.azul,C.azulBg],[$$(totPend),"Por Cobrar",C.am,C.amBg],[filtrado.length,"Registros",C.gris,C.grisBg]].map(([v,l,c,bg])=>(
          <div key={l} style={{background:bg,borderRadius:12,padding:"12px 18px",flex:1,minWidth:130}}>
            <div style={{fontSize:11,color:c,fontWeight:600}}>{l}</div>
            <div style={{fontSize:20,fontWeight:800,color:c}}>{v}</div>
          </div>
        ))}
        {can&&<button onClick={()=>setModal(true)} style={{background:C.azul,color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontSize:12,fontWeight:700,alignSelf:"center"}}>+ Agregar</button>}
      </div>
      <BarraFiltros
        filtros={[
          {label:"Empresa",tipo:"input",valor:filtroCli,onChange:setFiltroCli},
          {label:"País",opciones:["Todos","Peru","Mexico","Chile","AMexico"],valor:filtroPais,onChange:setFiltroPais},
          {label:"Estado",opciones:["Todos","Facturado","Pendiente","Pagado"],valor:filtroEst,onChange:setFiltroEst},
          {label:"Cobro",opciones:["Todos","Pagado","Por cobrar"],valor:filtroCobro,onChange:setFiltroCobro},
        ]}
        onExportar={async ()=>exportCSV(
          filtrado.map(r=>[r.vivero||"",r.empresa,r.pais,r.proforma||"",r.nPlantas||0,
            r.regalia||0,r.totalOsiris||0,r.tipoPago||"",r.montoFact||0,
            r.fechaFact||"",r.nFact||"",r.pagado?"Pagado":"Por cobrar"]),
          ["Vivero","Empresa","País","Proforma","N° Plantas","Regalía","Total Osiris","Tipo Pago","Mto.Facturar","Fecha Fact.","N° Factura","Estado Cobro"],
          "FeeViveros"
        )}
      />
      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",background:"#fff",borderRadius:10,overflow:"hidden"}}>
          <Th cols={[{l:"Vivero",w:100},{l:"Empresa",w:150},{l:"País",w:70},{l:"Proforma",w:130},{l:"N° Plantas",c:true,w:90},{l:"Regalía",c:true,w:70},{l:"Total Osiris",c:true,w:110},{l:"Tipo",c:true,w:90},{l:"Mto. Facturar",c:true,w:115},{l:"Fecha Fact.",c:true,w:100},{l:"N° Factura",c:true,w:100},{l:"Fact. Est.",c:true,w:130},{l:"Cobro",c:true,w:110},...(can?[{l:"",c:true,w:40}]:[])]}/>
          <tbody>
            {filtrado.map((r,i)=>(
              <tr key={r.id} style={{borderBottom:"1px solid #f1f5f9",background:i%2===0?"#fff":"#f8fafc"}}>
                <td style={{padding:"7px 10px",fontSize:11}}><Cell val={r.vivero} onChange={v=>upd(r.id,"vivero",v)} opts={["Synergiabio","Agromillora"]} can={can}/></td>
                <td style={{padding:"7px 10px",fontWeight:600}}>
                  <NombreCliente nombre={r.empresa} clientes={clientes} onChange={v=>upd(r.id,"empresa",v)} can={can}/>
                </td>
                <td style={{padding:"7px 10px",fontSize:11,color:C.gris}}>{r.pais}</td>
                <td style={{padding:"7px 10px",fontSize:11,color:C.gris}}><Cell val={r.proforma} onChange={v=>upd(r.id,"proforma",v)} can={can}/></td>
                <td style={{padding:"7px 10px",textAlign:"center",fontWeight:600}}>{N(r.nPlantas)}</td>
                <td style={{padding:"7px 10px",textAlign:"center",fontSize:11}}>{r.regalia?`${(r.regalia*100).toFixed(0)}%`:"—"}</td>
                <td style={{padding:"7px 10px",textAlign:"right",fontSize:12,color:C.gris}}>{$$(r.totalOsiris)}</td>
                <td style={{padding:"7px 10px",textAlign:"center",fontSize:11}}><Cell val={r.tipoPago} onChange={v=>upd(r.id,"tipoPago",v)} opts={TIPOS} can={can}/></td>
                <td style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:C.azul}}><Cell val={r.montoFact} onChange={v=>upd(r.id,"montoFact",parseFloat(v))} type="number" can={can}/></td>
                <td style={{padding:"7px 10px",textAlign:"center",fontSize:11,color:C.gris}}><Cell val={r.fechaFact} onChange={v=>upd(r.id,"fechaFact",v)} type="date" can={can}/></td>
                <td style={{padding:"7px 10px",textAlign:"center"}}><Cell val={r.nFact} onChange={v=>upd(r.id,"nFact",v)} can={can} ph="F-..."/></td>
                <td style={{padding:"7px 10px",textAlign:"center"}}><BadgeFact nFact={r.nFact}/></td>
                <td style={{padding:"7px 10px",textAlign:"center"}}><BadgePago pagado={r.pagado} onChange={v=>upd(r.id,"pagado",v)} can={can}/></td>
                {can&&<td style={{padding:"4px 6px",textAlign:"center"}}>
                  <button onClick={()=>{if(window.confirm(`¿Eliminar fee vivero de "${r.empresa}"?`))setData(prev=>prev.filter(x=>x.id!==r.id));}}
                    style={{background:"#fee2e2",border:"none",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:12,color:"#991b1b",fontWeight:700}}>×</button>
                </td>}
              </tr>
            ))}
            {filtrado.length===0&&<tr><td colSpan={can?14:13} style={{textAlign:"center",padding:32,color:C.gris}}>Sin registros</td></tr>}
          </tbody>
        </table>
      </div>
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#0006",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:16,padding:28,width:500,maxWidth:"92vw",maxHeight:"90vh",overflowY:"auto",boxShadow:"0 8px 32px #0003"}}>
            <h3 style={{margin:"0 0 16px",color:C.sl}}>Nuevo Fee Vivero</h3>
            {/* Selector empresa desde maestro clientes */}
            <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:4}}>
              <label style={{fontSize:11,fontWeight:600,color:"#374151"}}>Empresa *</label>
              {clientes.length>0&&(
                <select value={""} onChange={e=>{
                  const cli=clientes.find(c=>c.id===e.target.value);
                  if(!cli)return;
                  setForm(p=>({...p,empresa:cli.razonSocial||p.empresa,pais:cli.pais||p.pais}));
                }} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #93c5fd",fontSize:12,boxSizing:"border-box",color:"#2563eb"}}>
                  <option value="">🔍 Seleccionar desde maestro...</option>
                  {clientes.map(c=><option key={c.id} value={c.id}>{c.razonSocial}{c.nombreComercial&&c.nombreComercial!==c.razonSocial?` (${c.nombreComercial})`:""} — {c.pais}</option>)}
                </select>
              )}
              <input type="text" value={form.empresa} onChange={e=>setForm(p=>({...p,empresa:e.target.value}))}
                placeholder="O escribe el nombre..."
                style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {[["Vivero","vivero","select",["Synergiabio","Agromillora"]],["País","pais","select",PAISES],["Proforma","proforma","text",null],["N° Plantas","nPlantas","number",null],["Regalía (dec.)","regalia","number",null],["Total Osiris US$","totalOsiris","number",null],["Tipo Pago","tipoPago","select",TIPOS],["Monto a Facturar","montoFact","number",null],["Fecha Facturar","fechaFact","date",null],["N° Factura","nFact","text",null]].map(([l,c,t,opts])=>(
                <div key={c}><label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>{l}</label>
                {opts?<select value={form[c]} onChange={e=>setForm(p=>({...p,[c]:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}>{opts.map(o=><option key={o}>{o}</option>)}</select>
                :<input type={t} value={form[c]} onChange={e=>setForm(p=>({...p,[c]:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>}</div>
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
// RESUMEN / DASHBOARD
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

  // Merge: combinar datos guardados en Supabase con los _INIT del Excel
  // Si un registro existe en Supabase (mismo id), usa el de Supabase (tiene ediciones del usuario)
  // Si solo existe en _INIT (registros nuevos del Excel), lo agrega
  function mergeConInit(saved, init) {
    if(!saved || saved.length===0) return init;
    const savedIds = new Set(saved.map(r=>r.id));
    const nuevosDeInit = init.filter(r=>!savedIds.has(r.id));
    return [...saved, ...nuevosDeInit];
  }

  const ctData=osirisData?.contratos        ??CONTRATOS_INIT;
  const clientes=osirisData?.clientes       ??CLIENTES_INIT;
  const setClientes=useCallback(fn=>setOsirisData(prev=>({...prev,clientes:typeof fn==="function"?fn(prev?.clientes??CLIENTES_INIT):fn})),[setOsirisData]);
  const rpData=mergeConInit(osirisData?.royaltyPlanta,    ROYALTY_PLANTA_INIT);
  const feData=mergeConInit(osirisData?.feeEntrada,       FEE_ENTRADA_INIT);
  const rcData=mergeConInit(osirisData?.royaltyComercial, ROYALTY_COMERCIAL_INIT);
  const fvData=mergeConInit(osirisData?.feeViveros,       FEE_VIVEROS_INIT);
  const tpData=mergeConInit(osirisData?.totalPedidos,     TOTAL_PEDIDOS_INIT);

  const setCt=useCallback(fn=>setOsirisData(prev=>({...prev,contratos:      typeof fn==="function"?fn(prev?.contratos      ??CONTRATOS_INIT)      :fn})),[setOsirisData]);
  const setRp=useCallback(fn=>setOsirisData(prev=>({...prev,royaltyPlanta:   typeof fn==="function"?fn(prev?.royaltyPlanta   ??ROYALTY_PLANTA_INIT)   :fn})),[setOsirisData]);
  const setFe=useCallback(fn=>setOsirisData(prev=>({...prev,feeEntrada:      typeof fn==="function"?fn(prev?.feeEntrada      ??FEE_ENTRADA_INIT)      :fn})),[setOsirisData]);
  const setRc=useCallback(fn=>setOsirisData(prev=>({...prev,royaltyComercial:typeof fn==="function"?fn(prev?.royaltyComercial??ROYALTY_COMERCIAL_INIT):fn})),[setOsirisData]);
  const setFv=useCallback(fn=>setOsirisData(prev=>({...prev,feeViveros:      typeof fn==="function"?fn(prev?.feeViveros      ??FEE_VIVEROS_INIT)      :fn})),[setOsirisData]);
  const setTp=useCallback(fn=>setOsirisData(prev=>({...prev,totalPedidos:    typeof fn==="function"?fn(prev?.totalPedidos    ??TOTAL_PEDIDOS_INIT)    :fn})),[setOsirisData]);

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
        {subTab==="totalPedidos"     &&<TotalPedidos    data={tpData} setData={setTp} rpData={rpData} setRpData={setRp} can={canIngresos} clientes={clientes}/>}
        {subTab==="royaltyPlanta"    &&<RoyaltyPlanta   data={rpData} setData={setRp} can={canIngresos} clientes={clientes}/>}
        {subTab==="feeEntrada"       &&<FeeEntrada      data={feData} setData={setFe} can={canIngresos} clientes={clientes}/>}
        {subTab==="royaltyComercial" &&<RoyaltyComercial data={rcData} setData={setRc} can={canIngresos} clientes={clientes}/>}
        {subTab==="feeViveros"       &&<FeeViveros      data={fvData} setData={setFv} can={canIngresos} clientes={clientes}/>}
      </div>
    </div>
  );
}
