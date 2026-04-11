// ============================================================
// OsirisModule.jsx — v4 — Módulo Osiris Plant · Mediterra
// ============================================================
import { useState, useCallback, useMemo } from "react";

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
  return (p.includes("mexico")||p.includes("méxico")) ? 0.90 : 0.85;
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
  {id:"tp1", cliente:"ACP",             pais:"Peru",   proforma:"IQP2022-006",         año:2022,trim:4,nPlantas:9200,   estado:"Confirmado"},
  {id:"tp2", cliente:"Agroberries",     pais:"Peru",   proforma:"IQP2022-111",         año:2022,trim:4,nPlantas:4000,   estado:"Confirmado"},
  {id:"tp3", cliente:"Danper",          pais:"Peru",   proforma:"DANPER-2022-03",       año:2022,trim:4,nPlantas:100,    estado:"Confirmado"},
  {id:"tp4", cliente:"Giddings",        pais:"Peru",   proforma:"IQP2022-004",         año:2022,trim:4,nPlantas:2900,   estado:"Confirmado"},
  {id:"tp5", cliente:"Hass Peru",       pais:"Peru",   proforma:"IQP2022-125",         año:2022,trim:4,nPlantas:200,    estado:"Confirmado"},
  {id:"tp6", cliente:"Mainland",        pais:"Mexico", proforma:"IQP2022-005",         año:2022,trim:4,nPlantas:16000,  estado:"Confirmado"},
  {id:"tp7", cliente:"Giddings",        pais:"Mexico", proforma:"IQP2022-112-M",       año:2023,trim:1,nPlantas:96006,  estado:"Confirmado"},
  {id:"tp8", cliente:"Danper",          pais:"Peru",   proforma:"IQP2022-007",         año:2023,trim:2,nPlantas:8700,   estado:"Confirmado"},
  {id:"tp9", cliente:"Don Ricardo",     pais:"Peru",   proforma:"IQP2022-124",         año:2023,trim:2,nPlantas:1000,   estado:"Confirmado"},
  {id:"tp10",cliente:"San Clemente",    pais:"Peru",   proforma:"IQP2022-002",         año:2023,trim:2,nPlantas:13320,  estado:"Confirmado"},
  {id:"tp11",cliente:"Agroberries",     pais:"Mexico", proforma:"EXPBER-2023-01",      año:2023,trim:2,nPlantas:1728,   estado:"Confirmado"},
  {id:"tp12",cliente:"Mainland",        pais:"Mexico", proforma:"IQP2022-005-M",       año:2023,trim:2,nPlantas:227250, estado:"Confirmado"},
  {id:"tp13",cliente:"ACP",             pais:"Peru",   proforma:"CPRIET-2023-01",      año:2023,trim:4,nPlantas:2000,   estado:"Confirmado"},
  {id:"tp14",cliente:"Agroberries",     pais:"Peru",   proforma:"AGBERR-2022-01",      año:2023,trim:4,nPlantas:8000,   estado:"Confirmado"},
  {id:"tp15",cliente:"Agrovision",      pais:"Peru",   proforma:"AGVINV-2023-02",      año:2023,trim:4,nPlantas:26000,  estado:"Confirmado"},
  {id:"tp16",cliente:"Danper",          pais:"Peru",   proforma:"DANPER-2022-01",      año:2023,trim:4,nPlantas:6068,   estado:"Confirmado"},
  {id:"tp17",cliente:"Don Ricardo",     pais:"Peru",   proforma:"ARICDO-2022-02",      año:2023,trim:4,nPlantas:2500,   estado:"Confirmado"},
  {id:"tp18",cliente:"Frusan",          pais:"Peru",   proforma:"FSFNDO-2023-01",      año:2023,trim:4,nPlantas:6000,   estado:"Confirmado"},
  {id:"tp19",cliente:"Hass Peru",       pais:"Peru",   proforma:"HASSPE-2022-01",      año:2023,trim:4,nPlantas:2000,   estado:"Confirmado"},
  {id:"tp20",cliente:"Hass Peru",       pais:"Peru",   proforma:"HASSPE-2023-01",      año:2023,trim:4,nPlantas:5000,   estado:"Confirmado"},
  {id:"tp21",cliente:"Hass Peru",       pais:"Peru",   proforma:"HARVES-2023-01",      año:2023,trim:4,nPlantas:2500,   estado:"Confirmado"},
  {id:"tp22",cliente:"San Clemente",    pais:"Peru",   proforma:"MOQUEH-2022-02",      año:2023,trim:4,nPlantas:255000, estado:"Confirmado"},
  {id:"tp23",cliente:"Agrovision",      pais:"Mexico", proforma:"AGVINV-2023-01",      año:2023,trim:4,nPlantas:22500,  estado:"Confirmado"},
  {id:"tp24",cliente:"Giddings",        pais:"Mexico", proforma:"Sin Proforma",        año:2023,trim:4,nPlantas:400,    estado:"Confirmado"},
  {id:"tp25",cliente:"Mainland",        pais:"Mexico", proforma:"MAINLF-2022-02",      año:2023,trim:4,nPlantas:12000,  estado:"Confirmado"},
  {id:"tp26",cliente:"Agroberries",     pais:"Peru",   proforma:"PURABE-2024-01",      año:2024,trim:1,nPlantas:250,    estado:"Confirmado"},
  {id:"tp27",cliente:"Danper",          pais:"Peru",   proforma:"DANPER-2024-01",      año:2024,trim:1,nPlantas:7296,   estado:"Confirmado"},
  {id:"tp28",cliente:"Berries Paradise",pais:"Mexico", proforma:"Plantas de AGV",      año:2024,trim:1,nPlantas:10000,  estado:"Confirmado"},
  {id:"tp29",cliente:"Giddings",        pais:"Mexico", proforma:"GIDMEX-2024-01",      año:2024,trim:2,nPlantas:12672,  estado:"Confirmado"},
  {id:"tp30",cliente:"Agroextiende",    pais:"Peru",   proforma:"AGROEX-CL-2024-03",  año:2024,trim:3,nPlantas:800,    estado:"Confirmado"},
  {id:"tp31",cliente:"Hass Peru",       pais:"Peru",   proforma:"HARVES-2023-01",      año:2024,trim:3,nPlantas:1500,   estado:"Confirmado"},
  {id:"tp32",cliente:"Mainland",        pais:"Mexico", proforma:"MAIFAR-2024-01",      año:2024,trim:3,nPlantas:11500,  estado:"Confirmado"},
  {id:"tp33",cliente:"Collipulli",      pais:"Chile",  proforma:"ASELVA-2024-01",      año:2024,trim:3,nPlantas:270,    estado:"Confirmado"},
  {id:"tp34",cliente:"SQM",             pais:"Chile",  proforma:"SQMSDH-2024-01",      año:2024,trim:3,nPlantas:420,    estado:"Confirmado"},
  {id:"tp35",cliente:"Agroextiende",    pais:"Peru",   proforma:"AGROEX-CL-2024-01",  año:2024,trim:4,nPlantas:50000,  estado:"Confirmado"},
  {id:"tp36",cliente:"Frusan",          pais:"Peru",   proforma:"FRUSAN-CL-2024-01",   año:2024,trim:4,nPlantas:5160,   estado:"Confirmado"},
  {id:"tp37",cliente:"Hass Peru",       pais:"Peru",   proforma:"HASSPE-2024-01",      año:2024,trim:4,nPlantas:342,    estado:"Confirmado"},
  {id:"tp38",cliente:"Agroextiende",    pais:"Peru",   proforma:"AGROEX-CL-2024-04",  año:2025,trim:1,nPlantas:200000, estado:"Confirmado"},
  {id:"tp39",cliente:"Allpa Farms",     pais:"Peru",   proforma:"ALLPAF-2024-01",      año:2025,trim:1,nPlantas:325475, estado:"Confirmado"},
  {id:"tp40",cliente:"Pura Berries",    pais:"Peru",   proforma:"PURABE-CL-2024-03",   año:2025,trim:1,nPlantas:1500,   estado:"Confirmado"},
  {id:"tp41",cliente:"Gourmet",         pais:"Peru",   proforma:"GOURME-CL-2025-01",   año:2025,trim:1,nPlantas:400,    estado:"Confirmado"},
  {id:"tp42",cliente:"Mainland",        pais:"Mexico", proforma:"MAIFAR-2024-02",      año:2025,trim:1,nPlantas:75000,  estado:"Confirmado"},
  {id:"tp43",cliente:"Agroextiende",    pais:"Peru",   proforma:"AGROEX-CL-2024-02",  año:2025,trim:2,nPlantas:150000, estado:"Confirmado"},
  {id:"tp44",cliente:"Frusan",          pais:"Peru",   proforma:"FRUSAN-CL-2024-01",   año:2025,trim:2,nPlantas:400,    estado:"Confirmado"},
  {id:"tp45",cliente:"Pura Berries",    pais:"Peru",   proforma:"PURABE-CL-2024-03",   año:2025,trim:2,nPlantas:7500,   estado:"Confirmado"},
  {id:"tp46",cliente:"Mainland",        pais:"Mexico", proforma:"MAIFAR-MX-2024-04",  año:2025,trim:2,nPlantas:50000,  estado:"Confirmado"},
  {id:"tp47",cliente:"Danper",          pais:"Peru",   proforma:"DANPER-2024-02",      año:2025,trim:3,nPlantas:512,    estado:"Confirmado"},
  {id:"tp48",cliente:"Hector Esquivel", pais:"Chile",  proforma:"HEHSPA-CL-2024-01",  año:2025,trim:3,nPlantas:12000,  estado:"Confirmado"},
  {id:"tp49",cliente:"Danper",          pais:"Peru",   proforma:"DANPER-CL-2025-01",   año:2025,trim:4,nPlantas:24000,  estado:"Confirmado"},
  {id:"tp50",cliente:"Hass Peru",       pais:"Peru",   proforma:"HASSPE-CL-2024-02",   año:2025,trim:4,nPlantas:75835,  estado:"Confirmado"},
  {id:"tp51",cliente:"Hass Peru",       pais:"Peru",   proforma:"AOLMOS-CL-2025-02",   año:2025,trim:4,nPlantas:190950, estado:"Confirmado"},
  {id:"tp52",cliente:"Pura Berries",    pais:"Peru",   proforma:"PURABE-CL-2024-04",   año:2025,trim:4,nPlantas:250735, estado:"Confirmado"},
  {id:"tp53",cliente:"San Clemente",    pais:"Peru",   proforma:"MOQUEH-2024-01",      año:2025,trim:4,nPlantas:70000,  estado:"Confirmado"},
  {id:"tp54",cliente:"Vanguard",        pais:"Peru",   proforma:"OLIVOS-CL-2024-01",   año:2025,trim:4,nPlantas:1555706,estado:"Confirmado"},
  {id:"tp55",cliente:"Agroextiende",    pais:"Peru",   proforma:"AGM 2025-2705",       año:2026,trim:1,nPlantas:421400, estado:"Confirmado"},
  {id:"tp56",cliente:"Frusan",          pais:"Peru",   proforma:"FRUSAN-CL-2024-02",   año:2026,trim:1,nPlantas:305185, estado:"Confirmado"},
  {id:"tp57",cliente:"Mainland",        pais:"Mexico", proforma:"MAIFAR-MX-2024-05",  año:2026,trim:1,nPlantas:150000, estado:"Confirmado"},
  {id:"tp58",cliente:"Dole Mexico",     pais:"Mexico", proforma:"BLUFAR-MX-2025-01",  año:2026,trim:1,nPlantas:2100,   estado:"Confirmado"},
  {id:"tp59",cliente:"Gourmet",         pais:"Mexico", proforma:"GBFFAR-MX-2026-01",  año:2026,trim:1,nPlantas:950,    estado:"Confirmado"},
  {id:"tp60",cliente:"Integrity/Talsa", pais:"Peru",   proforma:"INTFAR-PE-2026-01",  año:2026,trim:1,nPlantas:2100,   estado:"Confirmado"},
  {id:"tp61",cliente:"Mainland",        pais:"Mexico", proforma:"MAIFAR-MX-2025-02",  año:2026,trim:2,nPlantas:250000, estado:"Confirmado"},
  {id:"tp62",cliente:"Danper",          pais:"Peru",   proforma:"DANPER-2024-02",      año:2026,trim:3,nPlantas:512,    estado:"Confirmado"},
  {id:"tp63",cliente:"Mainland",        pais:"Mexico", proforma:"MAIFAR-2024-03",      año:2026,trim:3,nPlantas:1000,   estado:"Confirmado"},
  {id:"tp64",cliente:"KJ Orchard",      pais:"Corea",  proforma:"KJORCH-CL-2025-01",  año:2026,trim:3,nPlantas:12096,  estado:"Confirmado"},
  {id:"tp65",cliente:"Danper",          pais:"Peru",   proforma:"DANPER-CL-2025-0148",año:2026,trim:4,nPlantas:884271, estado:"Confirmado"},
  {id:"tp66",cliente:"Frusan",          pais:"Peru",   proforma:"HUARME-CL-2026-0046",año:2026,trim:4,nPlantas:285405, estado:"Confirmado"},
  {id:"tp67",cliente:"Frunatural",      pais:"Mexico", proforma:"FRUNAT-MX-2026-01",  año:2027,trim:1,nPlantas:208500, estado:"Por confirmar"},
];

const ROYALTY_PLANTA_INIT = [
  {id:"rp_h1",  cliente:"Collipulli",      pais:"Chile",  año:2024,trim:3,nPlantas:270,    usdPlanta:1.00,nOC:"",nFact:"",pagado:true, fechaPago:"2024-07-17",vivero:"Synergia Chile"},
  {id:"rp_h2",  cliente:"SQM",             pais:"Chile",  año:2024,trim:3,nPlantas:420,    usdPlanta:1.00,nOC:"",nFact:"",pagado:true, fechaPago:"2024-12-05",vivero:"Synergia Chile"},
  {id:"rp_h3",  cliente:"Agroextiende",    pais:"Peru",   año:2024,trim:3,nPlantas:600,    usdPlanta:1.00,nOC:"",nFact:"",pagado:true, fechaPago:"2024-12-23",vivero:"Synergia Chile"},
  {id:"rp_h4",  cliente:"Agroextiende",    pais:"Peru",   año:2024,trim:4,nPlantas:50000,  usdPlanta:1.00,nOC:"",nFact:"",pagado:true, fechaPago:"2024-12-23",vivero:"Synergia Chile"},
  {id:"rp_h5",  cliente:"Gourmet",         pais:"Peru",   año:2025,trim:1,nPlantas:400,    usdPlanta:1.00,nOC:"",nFact:"",pagado:true, fechaPago:"2025-03-01",vivero:"Synergia Chile"},
  {id:"rp_h6",  cliente:"Pura Berries",    pais:"Peru",   año:2025,trim:1,nPlantas:1500,   usdPlanta:1.00,nOC:"",nFact:"",pagado:true, fechaPago:"2025-04-01",vivero:"Synergia Chile"},
  {id:"rp_h7",  cliente:"Mainland",        pais:"Mexico", año:2025,trim:2,nPlantas:16000,  usdPlanta:1.00,nOC:"",nFact:"",pagado:true, fechaPago:"2025-04-11",vivero:"Synergia Mexico"},
  {id:"rp_h8",  cliente:"Mainland",        pais:"Mexico", año:2025,trim:2,nPlantas:24500,  usdPlanta:1.00,nOC:"",nFact:"",pagado:true, fechaPago:"2025-04-29",vivero:"Synergia Mexico"},
  {id:"rp_h9",  cliente:"Agroextiende",    pais:"Peru",   año:2025,trim:2,nPlantas:175000, usdPlanta:1.00,nOC:"",nFact:"",pagado:true, fechaPago:"2025-05-01",vivero:"Synergia Chile"},
  {id:"rp_h10", cliente:"Agroextiende",    pais:"Peru",   año:2025,trim:2,nPlantas:87500,  usdPlanta:1.00,nOC:"",nFact:"",pagado:true, fechaPago:"2025-06-01",vivero:"Synergia Chile"},
  {id:"rp_h11", cliente:"Pura Berries",    pais:"Peru",   año:2025,trim:2,nPlantas:7500,   usdPlanta:1.00,nOC:"",nFact:"",pagado:true, fechaPago:"2025-06-01",vivero:"Synergia Chile"},
  {id:"rp_h12", cliente:"Agroextiende",    pais:"Peru",   año:2025,trim:2,nPlantas:87700,  usdPlanta:1.00,nOC:"",nFact:"",pagado:true, fechaPago:"2025-07-01",vivero:"Synergia Chile"},
  {id:"rp_h13", cliente:"Mainland",        pais:"Mexico", año:2025,trim:2,nPlantas:37510,  usdPlanta:1.00,nOC:"",nFact:"",pagado:true, fechaPago:"2025-07-04",vivero:"Synergia Mexico"},
  {id:"rp_h14", cliente:"Mainland",        pais:"Mexico", año:2025,trim:3,nPlantas:21230,  usdPlanta:1.00,nOC:"",nFact:"",pagado:true, fechaPago:"2025-09-01",vivero:"Synergia Mexico"},
  {id:"rp_h15", cliente:"Mainland",        pais:"Mexico", año:2025,trim:3,nPlantas:10000,  usdPlanta:1.00,nOC:"",nFact:"",pagado:true, fechaPago:"2025-09-01",vivero:"Synergia Mexico"},
  {id:"rp_h16", cliente:"Berries Paradise",pais:"Mexico", año:2025,trim:2,nPlantas:384,    usdPlanta:1.00,nOC:"",nFact:"",pagado:false,fechaPago:"2025-10-01",vivero:"Synergia Mexico"},
  {id:"rp_h17", cliente:"Allpa",           pais:"Peru",   año:2025,trim:2,nPlantas:325475, usdPlanta:1.00,nOC:"",nFact:"",pagado:true, fechaPago:"2025-10-01",vivero:"Synergia Chile"},
  {id:"rp_h18", cliente:"Mainland",        pais:"Mexico", año:2025,trim:3,nPlantas:1290,   usdPlanta:1.00,nOC:"",nFact:"",pagado:true, fechaPago:"2025-10-01",vivero:"Synergia Mexico"},
  {id:"rp_h19", cliente:"Mainland",        pais:"Mexico", año:2025,trim:3,nPlantas:4710,   usdPlanta:1.00,nOC:"",nFact:"",pagado:true, fechaPago:"2025-10-01",vivero:"Synergia Mexico"},
  {id:"rp_h20", cliente:"Gourmet",         pais:"Peru",   año:2025,trim:4,nPlantas:250,    usdPlanta:1.00,nOC:"",nFact:"",pagado:true, fechaPago:"2025-11-01",vivero:"Synergia Chile"},
  {id:"rp_h21", cliente:"Pura Berries",    pais:"Peru",   año:2025,trim:4,nPlantas:250735, usdPlanta:1.00,nOC:"",nFact:"",pagado:true, fechaPago:"2025-11-01",vivero:"Synergia Chile"},
  {id:"rp_h22", cliente:"Hass Peru",       pais:"Peru",   año:2025,trim:4,nPlantas:190950, usdPlanta:1.00,nOC:"",nFact:"",pagado:true, fechaPago:"2025-11-01",vivero:"Synergia Chile"},
  {id:"rp_h23", cliente:"Hass Peru",       pais:"Peru",   año:2025,trim:4,nPlantas:80211,  usdPlanta:1.00,nOC:"",nFact:"",pagado:true, fechaPago:"2025-11-01",vivero:"Synergia Chile"},
  {id:"rp_h24", cliente:"Danper",          pais:"Peru",   año:2025,trim:4,nPlantas:38568,  usdPlanta:1.00,nOC:"",nFact:"",pagado:true, fechaPago:"2025-11-01",vivero:"Synergia Chile"},
  {id:"rp_h25", cliente:"Danper",          pais:"Peru",   año:2025,trim:4,nPlantas:1000,   usdPlanta:1.00,nOC:"",nFact:"",pagado:true, fechaPago:"2025-11-01",vivero:"Synergia Chile"},
  {id:"rp_h26", cliente:"Vanguard",        pais:"Peru",   año:2025,trim:4,nPlantas:182688, usdPlanta:1.00,nOC:"",nFact:"",pagado:true, fechaPago:"2025-11-01",vivero:"Synergia Chile"},
  {id:"rp_h27", cliente:"San Clemente",    pais:"Peru",   año:2025,trim:4,nPlantas:70000,  usdPlanta:1.00,nOC:"",nFact:"",pagado:true, fechaPago:"2025-12-01",vivero:"Synergia Chile"},
  {id:"rp_h28", cliente:"Hector Esquivel", pais:"Chile",  año:2025,trim:4,nPlantas:12000,  usdPlanta:1.00,nOC:"",nFact:"",pagado:true, fechaPago:"2025-12-01",vivero:"Synergia Chile"},
  {id:"rp_h29", cliente:"La Calera",       pais:"Peru",   año:2025,trim:1,nPlantas:3500,   usdPlanta:1.00,nOC:"",nFact:"",pagado:true, fechaPago:"2025-12-01",vivero:"Synergia Chile"},
  {id:"rp_h30", cliente:"Vanguard",        pais:"Peru",   año:2026,trim:1,nPlantas:422776, usdPlanta:0.85,nOC:"",nFact:"",      pagado:true, fechaPago:"2026-01-01",vivero:"Synergia Chile"},
  {id:"rp_h31", cliente:"Vanguard",        pais:"Peru",   año:2026,trim:1,nPlantas:298944, usdPlanta:0.85,nOC:"",nFact:"",      pagado:true, fechaPago:"2026-02-01",vivero:"Synergia Chile"},
  {id:"rp1",  cliente:"Mainland",        pais:"Mexico",año:2026,trim:1,nPlantas:150000,usdPlanta:0.49,nOC:"",nFact:"",      pagado:true, fechaPago:"2026-02-01",vivero:"Synergia Mexico"},
  {id:"rp4",  cliente:"Integrity/Talsa", pais:"Peru",  año:2026,trim:1,nPlantas:2100,  usdPlanta:0.85,nOC:"",nFact:"F-001",pagado:false,fechaPago:"2026-03-01",vivero:"Synergia Chile"},
  {id:"rp5",  cliente:"Mainland",        pais:"Mexico",año:2026,trim:1,nPlantas:150000,usdPlanta:0.01,nOC:"",nFact:"",      pagado:true, fechaPago:"2026-03-13",vivero:"Synergia Mexico"},
  {id:"rp6",  cliente:"Mainland",        pais:"Mexico",año:2026,trim:1,nPlantas:150000,usdPlanta:0.34,nOC:"",nFact:"F-002",pagado:false,fechaPago:"2026-03-31",vivero:"Synergia Mexico"},
  {id:"rp7",  cliente:"Vanguard",        pais:"Peru",  año:2026,trim:1,nPlantas:222559,usdPlanta:0.85,nOC:"",nFact:"",      pagado:true, fechaPago:"2026-03-31",vivero:"Synergia Chile"},
  {id:"rp8",  cliente:"Dole Mexico",     pais:"Mexico",año:2026,trim:1,nPlantas:2100,  usdPlanta:0.85,nOC:"",nFact:"",      pagado:true, fechaPago:"2026-03-31",vivero:"Synergia Mexico"},
  {id:"rp9",  cliente:"Gourmet",         pais:"Mexico",año:2026,trim:1,nPlantas:950,   usdPlanta:0.85,nOC:"",nFact:"",      pagado:true, fechaPago:"2026-03-31",vivero:"Synergia Mexico"},
  {id:"rp10", cliente:"Agroextiende",    pais:"Peru",  año:2026,trim:1,nPlantas:105840,usdPlanta:0.85,nOC:"",nFact:"",      pagado:true, fechaPago:"2026-03-31",vivero:"Synergia Chile"},
  {id:"rp11", cliente:"Vanguard",        pais:"Peru",  año:2026,trim:1,nPlantas:233708,usdPlanta:0.85,nOC:"",nFact:"F-003",pagado:false,fechaPago:"2026-04-30",vivero:"Synergia Chile"},
  {id:"rp12", cliente:"Agroextiende",    pais:"Peru",  año:2026,trim:1,nPlantas:145527,usdPlanta:0.85,nOC:"",nFact:"F-004",pagado:false,fechaPago:"2026-04-30",vivero:"Synergia Chile"},
  {id:"rp13", cliente:"Mainland",        pais:"Mexico",año:2026,trim:2,nPlantas:250000,usdPlanta:0.34,nOC:"",nFact:"",      pagado:false,fechaPago:"2026-05-01",vivero:"Synergia Mexico"},
  {id:"rp14", cliente:"Agroextiende",    pais:"Peru",  año:2026,trim:1,nPlantas:174634,usdPlanta:0.85,nOC:"",nFact:"",      pagado:false,fechaPago:"2026-05-31",vivero:"Agromillora Pe"},
  {id:"rp15", cliente:"Vanguard",        pais:"Peru",  año:2026,trim:1,nPlantas:195389,usdPlanta:0.85,nOC:"",nFact:"",      pagado:false,fechaPago:"2026-05-31",vivero:"Synergia Chile"},
  {id:"rp16", cliente:"Mainland",        pais:"Mexico",año:2026,trim:1,nPlantas:11760, usdPlanta:0.85,nOC:"",nFact:"",      pagado:false,fechaPago:"2026-09-01",vivero:"Synergia Mexico"},
  {id:"rp17", cliente:"Mainland",        pais:"Mexico",año:2026,trim:2,nPlantas:250000,usdPlanta:0.51,nOC:"",nFact:"",      pagado:false,fechaPago:"2026-09-01",vivero:"Synergia Mexico"},
  {id:"rp18", cliente:"Danper",          pais:"Peru",  año:2026,trim:3,nPlantas:512,   usdPlanta:0.85,nOC:"",nFact:"",      pagado:false,fechaPago:"2026-09-01",vivero:"Synergia Chile"},
  {id:"rp19", cliente:"Mainland",        pais:"Mexico",año:2026,trim:3,nPlantas:1000,  usdPlanta:0.85,nOC:"",nFact:"",      pagado:false,fechaPago:"2026-09-01",vivero:"Synergia Mexico"},
  {id:"rp20", cliente:"Danper",          pais:"Peru",  año:2026,trim:4,nPlantas:884271,usdPlanta:0.85,nOC:"",nFact:"",      pagado:false,fechaPago:"2026-10-01",vivero:"Synergia Chile"},
  {id:"rp21", cliente:"Frusan",          pais:"Peru",  año:2026,trim:4,nPlantas:285405,usdPlanta:1.00,nOC:"",nFact:"",      pagado:false,fechaPago:"2026-12-01",vivero:"Synergia Chile"},
  {id:"rp22", cliente:"Frunatural",      pais:"Mexico",año:2027,trim:1,nPlantas:136500,usdPlanta:1.00,nOC:"",nFact:"",pagado:false,fechaPago:"2027-02-01",vivero:"Synergia Mexico"},
  {id:"rp23", cliente:"Frunatural",      pais:"Mexico",año:2027,trim:2,nPlantas:72000, usdPlanta:1.00,nOC:"",nFact:"",pagado:false,fechaPago:"2027-05-01",vivero:"Synergia Mexico"},
];

const ROYALTY_COMERCIAL_INIT = [
  {id:"rc1", cliente:"Agroextiende",  pais:"Peru",  trimCobro:2,añoCobro:2026,ha:0,  nPlantas:350000,usdHa:3000,  nFact:"F-020",pagado:false},
  {id:"rc2", cliente:"Allpa",         pais:"Peru",  trimCobro:2,añoCobro:2026,ha:0,  nPlantas:325475,usdHa:3000,  nFact:"F-021",pagado:false},
  {id:"rc3", cliente:"San Clemente",  pais:"Peru",  trimCobro:2,añoCobro:2026,ha:0,  nPlantas:338850,usdHa:3000,nFact:"F-022",pagado:false},
  {id:"rc4", cliente:"Mainland",      pais:"Mexico",trimCobro:3,añoCobro:2026,ha:0,  nPlantas:289250,usdHa:3000,  nFact:"",     pagado:false},
  {id:"rc5", cliente:"Giddings",      pais:"Mexico",trimCobro:3,añoCobro:2026,ha:0,  nPlantas:108906,usdHa:3000,  nFact:"",     pagado:false},
  {id:"rc6", cliente:"Agroextiende",  pais:"Peru",  trimCobro:2,añoCobro:2027,ha:0,  nPlantas:350000,usdHa:3000,  nFact:"",     pagado:false},
  {id:"rc7", cliente:"Allpa",         pais:"Peru",  trimCobro:2,añoCobro:2027,ha:0,  nPlantas:325475,usdHa:3000,nFact:"",     pagado:false},
  {id:"rc8", cliente:"Frusan",        pais:"Peru",  trimCobro:2,añoCobro:2027,ha:0,  nPlantas:559185,usdHa:3000,nFact:"",    pagado:false},
  {id:"rc9", cliente:"Hass Peru",     pais:"Peru",  trimCobro:2,añoCobro:2027,ha:0,  nPlantas:267169,usdHa:3000,  nFact:"",     pagado:false},
  {id:"rc10",cliente:"Pura Berries",  pais:"Peru",  trimCobro:2,añoCobro:2027,ha:0,  nPlantas:259735,usdHa:3000,nFact:"",     pagado:false},
  {id:"rc11",cliente:"Vanguard",      pais:"Peru",  trimCobro:2,añoCobro:2027,ha:0, nPlantas:1555705,usdHa:3000,  nFact:"",     pagado:false},
  {id:"rc12",cliente:"San Clemente",  pais:"Peru",  trimCobro:2,añoCobro:2027,ha:0,  nPlantas:338850,usdHa:3000,  nFact:"",     pagado:false},
  {id:"rc13",cliente:"Mainland",      pais:"Mexico",trimCobro:3,añoCobro:2027,ha:0, nPlantas:401000,usdHa:3000,nFact:"",     pagado:false},
  {id:"rc14",cliente:"Giddings",      pais:"Mexico",trimCobro:3,añoCobro:2027,ha:0,  nPlantas:108906,usdHa:3000,nFact:"",     pagado:false},
];

const FEE_ENTRADA_INIT = [
  {id:"fe1",cliente:"Agrolatina",pais:"Peru",  nFact:"F-010",pagado:false,fechaPago:"2026-04-30",montoUSD:30000,detalle:"Sin Devolución"},
  {id:"fe2",cliente:"Frunatural",pais:"Mexico",nFact:"F-009",pagado:true, fechaPago:"2026-03-01",montoUSD:30000,detalle:"Sin Devolución"},
];

const FEE_VIVEROS_INIT = [
  {id:"fv_h1",  vivero:"Synergiabio",empresa:"Mainland Farms SA",         pais:"AMexico",proforma:"IQP2022-005",         nPlantas:16000,  regalia:0.25,totalOsiris:4000,    tipoPago:"Anticipo", montoFact:2400,     fechaFact:"2022-01-01",nFact:"N°1",  pagado:true},
  {id:"fv_h2",  vivero:"Synergiabio",empresa:"Mainland Farms SA",         pais:"AMexico",proforma:"IQP2022-005",         nPlantas:16000,  regalia:0.25,totalOsiris:4000,    tipoPago:"Entrega",  montoFact:1600,     fechaFact:"2022-01-01",nFact:"N°5",  pagado:true},
  {id:"fv_h3",  vivero:"Synergiabio",empresa:"Fruits Giddings SA de CV",  pais:"AMexico",proforma:"IQP2022-112-M",       nPlantas:90900,  regalia:0.25,totalOsiris:22725,   tipoPago:"Anticipo", montoFact:13635,    fechaFact:"2022-01-01",nFact:"N°1",  pagado:true},
  {id:"fv_h4",  vivero:"Synergiabio",empresa:"Fruits Giddings SA de CV",  pais:"AMexico",proforma:"IQP2022-112-M",       nPlantas:90900,  regalia:0.25,totalOsiris:22725,   tipoPago:"Entrega",  montoFact:9090,     fechaFact:"2022-01-01",nFact:"N°5",  pagado:true},
  {id:"fv1",  vivero:"Synergiabio",empresa:"Frusan Agro SAC",    pais:"Peru",   proforma:"HUARME-CL-2024-02",  nPlantas:305185, regalia:0.45,totalOsiris:137333.25,tipoPago:"Entrega",  montoFact:132660.23,fechaFact:"2026-03-31",nFact:"F-030",pagado:false},
  {id:"fv2",  vivero:"Synergiabio",empresa:"Vanguard",           pais:"Peru",   proforma:"OLIVOS-CL-2024-01",  nPlantas:1555705,regalia:0.45,totalOsiris:700067.25,tipoPago:"Entrega",  montoFact:180827.37,fechaFact:"2026-03-31",nFact:"F-031",pagado:false},
  {id:"fv3",  vivero:"Agromillora",empresa:"AgroExtiende",       pais:"Peru",   proforma:"2025-2705",          nPlantas:420000, regalia:1.15,totalOsiris:483000,   tipoPago:"Anticipo", montoFact:34650.42, fechaFact:"2026-03-31",nFact:"F-032",pagado:false},
  {id:"fv4",  vivero:"Synergiabio",empresa:"Frusan Agro SAC",    pais:"Peru",   proforma:"HUARME-CL-2026-0046",nPlantas:285405, regalia:0.45,totalOsiris:128432.25,tipoPago:"Anticipo", montoFact:67426.93, fechaFact:"2026-03-31",nFact:"F-033",pagado:false},
  {id:"fv5",  vivero:"Synergiabio",empresa:"Vanguard",           pais:"Peru",   proforma:"OLIVOS-CL-2024-01",  nPlantas:1555705,regalia:0.45,totalOsiris:700067.25,tipoPago:"Entrega",  montoFact:169206.25,fechaFact:"2026-06-30",nFact:"",    pagado:false},
  {id:"fv6",  vivero:"Agromillora",empresa:"AgroExtiende",       pais:"Peru",   proforma:"2025-2705",          nPlantas:420000, regalia:1.15,totalOsiris:483000,   tipoPago:"Anticipo", montoFact:192149.96,fechaFact:"2026-05-31",nFact:"",    pagado:false},
  {id:"fv7",  vivero:"Synergiabio",empresa:"Mainland Farms SA",  pais:"Mexico", proforma:"MAIFAR-MX-2025-01",  nPlantas:150000, regalia:0.45,totalOsiris:67500,   tipoPago:"Entrega",  montoFact:14987.03, fechaFact:"2026-06-30",nFact:"",    pagado:false},
  {id:"fv8",  vivero:"Synergiabio",empresa:"Mainland Farms SA",  pais:"Mexico", proforma:"MAIFAR-MX-2025-02",  nPlantas:250000, regalia:0.45,totalOsiris:112500,  tipoPago:"Entrega",  montoFact:20250,    fechaFact:"2026-06-30",nFact:"",    pagado:false},
  {id:"fv9",  vivero:"Synergiabio",empresa:"La Calera",          pais:"Peru",   proforma:"BRIDGE-PE-2025-01",  nPlantas:3500,   regalia:0.45,totalOsiris:1575,    tipoPago:"Entrega",  montoFact:1575,     fechaFact:"2026-06-30",nFact:"",    pagado:false},
  {id:"fv10", vivero:"Synergiabio",empresa:"Integrity/Talsa",    pais:"Peru",   proforma:"INTFAR-PE-2026-01",  nPlantas:2100,   regalia:0.45,totalOsiris:945,     tipoPago:"Entrega",  montoFact:945,      fechaFact:"2026-06-30",nFact:"",    pagado:false},
  {id:"fv11", vivero:"Agromillora",empresa:"AgroExtiende",       pais:"Peru",   proforma:"2025-2705",          nPlantas:420000, regalia:1.15,totalOsiris:483000,  tipoPago:"Entrega",  montoFact:256199.62,fechaFact:"2026-07-31",nFact:"",    pagado:false},
  {id:"fv12", vivero:"Synergiabio",empresa:"Mainland Farms SA",  pais:"Mexico", proforma:"MAIFAR-MX-2024-04",  nPlantas:50000,  regalia:0.45,totalOsiris:22500,  tipoPago:"Entrega",  montoFact:2077.09,  fechaFact:"2026-09-30",nFact:"",    pagado:false},
  {id:"fv13", vivero:"Synergiabio",empresa:"Mainland Farms SA",  pais:"Mexico", proforma:"MAIFAR-MX-2025-02",  nPlantas:250000, regalia:0.45,totalOsiris:112500, tipoPago:"Entrega",  montoFact:30375,    fechaFact:"2026-09-30",nFact:"",    pagado:false},
  {id:"fv14", vivero:"Synergiabio",empresa:"KJ Orchard CO Ltd",  pais:"Corea",  proforma:"KJORCH-CL-2025-01",  nPlantas:12096,  regalia:0.10,totalOsiris:1209.6, tipoPago:"Entrega",  montoFact:483.84,   fechaFact:"2026-09-30",nFact:"",    pagado:false},
  {id:"fv15", vivero:"Synergiabio",empresa:"Danper Trujillo SAC",pais:"Peru",   proforma:"DANPER-CL-2025-0148",nPlantas:884271, regalia:0.45,totalOsiris:397921.95,tipoPago:"Entrega", montoFact:159168.78,fechaFact:"2026-12-31",nFact:"",    pagado:false},
  {id:"fv16", vivero:"Synergiabio",empresa:"Frusan Agro SAC",    pais:"Peru",   proforma:"HUARME-CL-2026-0046",nPlantas:285405, regalia:0.45,totalOsiris:128432.25,tipoPago:"Entrega", montoFact:51372.9,  fechaFact:"2026-12-31",nFact:"",    pagado:false},
  {id:"fv17", vivero:"Synergiabio",empresa:"Frusan Agro SAC",    pais:"Peru",   proforma:"HUARME-CL-2026-0046",nPlantas:285405, regalia:0.45,totalOsiris:128432.25,tipoPago:"Entrega", montoFact:9632.42,  fechaFact:"2027-03-31",nFact:"",    pagado:false},
];

// ══════════════════════════════════════════════════════════
// TOTAL PEDIDOS
// ══════════════════════════════════════════════════════════
function TotalPedidos({data,setData,rpData,setRpData,can}) {
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

      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <input value={busq} onChange={e=>setBusq(e.target.value)} placeholder="Buscar cliente / proforma..."
          style={{padding:"6px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:12,minWidth:200}}/>
        {["Todos","Por confirmar","Confirmado"].map(e=>(
          <button key={e} onClick={()=>setFiltroEst(e)}
            style={{padding:"4px 12px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
              background:filtroEst===e?(e==="Confirmado"?C.verde:e==="Por confirmar"?C.am:C.sl):"#fff",
              color:filtroEst===e?"#fff":C.sl}}>
            {e}
          </button>
        ))}
        <span style={{fontSize:12,color:C.gris,fontWeight:600,marginLeft:4}}>Año:</span>
        {años.map(a=>(
          <button key={a} onClick={()=>setFiltroAño(String(a))}
            style={{padding:"4px 12px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
              background:filtroAño===String(a)?C.teal:"#fff",color:filtroAño===String(a)?"#fff":C.sl}}>
            {a}
          </button>
        ))}
        <select value={filtroPais} onChange={e=>setFiltroPais(e.target.value)}
          style={{padding:"5px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:12}}>
          {["Todos",...PAISES].map(p=><option key={p}>{p}</option>)}
        </select>
      </div>

      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",background:"#fff",borderRadius:10,overflow:"hidden"}}>
          <Th cols={[
            {l:"Cliente",w:130},{l:"País",w:80},{l:"Proforma",w:150},
            {l:"Año",c:true,w:60},{l:"Trim.",c:true,w:55},{l:"N° Plantas",c:true,w:110},
            {l:"Estado",c:true,w:160},
          ]}/>
          <tbody>
            {filtrado.map((r,i)=>(
              <tr key={r.id} style={{borderBottom:"1px solid #f1f5f9",
                background:r.estado==="Confirmado"?"#f0fdf4":r.estado==="Por confirmar"?"#fffbeb":i%2===0?"#fff":"#f8fafc"}}>
                <td style={{padding:"8px 12px",fontWeight:600}}>
                  <Cell val={r.cliente} onChange={v=>upd(r.id,"cliente",v)} can={can}/>
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
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {[["Cliente *","cliente","text"],["Proforma","proforma","text"],["Año","año","number"],["Trimestre","trim","number"],["N° Plantas","nPlantas","number"]].map(([l,c,t])=>(
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
function RoyaltyPlanta({data,setData,can}) {
  const [filtroAño,setFiltroAño]=useState("Todos");
  const [filtroFact,setFiltroFact]=useState("Todos");
  const [modal,setModal]=useState(false);
  const [form,setForm]=useState({cliente:"",pais:"Peru",año:2026,trim:1,nPlantas:"",usdPlanta:"",nOC:"",nFact:"",pagado:false,fechaPago:"",vivero:"Synergia Chile"});

  const años=["Todos",...Array.from(new Set(data.map(r=>r.año))).sort()];

  const calc=useMemo(()=>data.map(r=>{
    const mf=(Number(r.nPlantas)||0)*(Number(r.usdPlanta)||0);
    return{...r,montoFact:mf,montoCobro:mf*pct(r.pais)};
  }),[data]);

  const filtrado=calc.filter(r=>
    (filtroAño==="Todos"||r.año===Number(filtroAño))&&
    (filtroFact==="Todos"||(filtroFact==="Facturado"?r.nFact&&r.nFact.trim()!=="":!r.nFact||r.nFact.trim()===""))
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
        💡 Monto Facturar = N° Plantas × US$/Planta &nbsp;·&nbsp; Monto Cobrar = <strong>85% Perú/Chile · 90% México</strong>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{fontSize:12,color:C.gris,fontWeight:600}}>Año:</span>
        {años.map(a=>(
          <button key={a} onClick={()=>setFiltroAño(String(a))}
            style={{padding:"4px 12px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
              background:filtroAño===String(a)?C.azul:"#fff",color:filtroAño===String(a)?"#fff":C.sl}}>
            {a}
          </button>
        ))}
        <span style={{fontSize:12,color:C.gris,fontWeight:600,marginLeft:6}}>Facturación:</span>
        {["Todos","Facturado","Pendiente de facturar"].map(e=>(
          <button key={e} onClick={()=>setFiltroFact(e)}
            style={{padding:"4px 12px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
              background:filtroFact===e?C.sl:"#fff",color:filtroFact===e?"#fff":C.sl}}>
            {e}
          </button>
        ))}
      </div>

      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",background:"#fff",borderRadius:10,overflow:"hidden"}}>
          <Th cols={[
            {l:"Cliente",w:110},{l:"País",w:70},{l:"Año/Trim.",c:true,w:70},
            {l:"N° Plantas",c:true,w:90},{l:"US$/Planta",c:true,w:80},
            {l:"Mto. Facturar",c:true,w:115},{l:"Mto. Cobrar",c:true,w:115},
            {l:"N° OC",c:true,w:90},{l:"N° Factura",c:true,w:100},
            {l:"Fact. Est.",c:true,w:130},{l:"Cobro",c:true,w:110},
            {l:"Fecha pago",c:true,w:100},{l:"Vivero",w:110},
          ]}/>
          <tbody>
            {filtrado.map((r,i)=>(
              <tr key={r.id} style={{borderBottom:"1px solid #f1f5f9",background:r._fromPedido?"#f0fdf4":i%2===0?"#fff":"#f8fafc"}}>
                <td style={{padding:"7px 10px",fontWeight:600}}>
                  <Cell val={r.cliente} onChange={v=>upd(r.id,"cliente",v)} can={can}/>
                  {r._fromPedido&&<div style={{fontSize:9,color:C.verde}}>📦 desde pedido</div>}
                </td>
                <td style={{padding:"7px 10px",fontSize:11,color:C.gris}}><Cell val={r.pais} onChange={v=>upd(r.id,"pais",v)} opts={PAISES} can={can}/></td>
                <td style={{padding:"7px 10px",textAlign:"center",fontSize:11}}>{r.año} T{r.trim}</td>
                <td style={{padding:"7px 10px",textAlign:"right",fontWeight:600}}><Cell val={r.nPlantas} onChange={v=>upd(r.id,"nPlantas",parseFloat(v))} type="number" can={can}/></td>
                <td style={{padding:"7px 10px",textAlign:"center"}}><Cell val={r.usdPlanta} onChange={v=>upd(r.id,"usdPlanta",parseFloat(v))} type="number" can={can}/></td>
                <td style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:C.azul}}>{$$(r.montoFact)}</td>
                <td style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:C.verde}}>
                  {$$(r.montoCobro)}<div style={{fontSize:9,color:C.gris}}>{(pct(r.pais)*100).toFixed(0)}%</div>
                </td>
                <td style={{padding:"7px 10px",textAlign:"center"}}><Cell val={r.nOC} onChange={v=>upd(r.id,"nOC",v)} can={can} ph="OC-..."/></td>
                <td style={{padding:"7px 10px",textAlign:"center"}}><Cell val={r.nFact} onChange={v=>upd(r.id,"nFact",v)} can={can} ph="F-..."/></td>
                <td style={{padding:"7px 10px",textAlign:"center"}}><BadgeFact nFact={r.nFact}/></td>
                <td style={{padding:"7px 10px",textAlign:"center"}}><BadgePago pagado={r.pagado} onChange={v=>upd(r.id,"pagado",v)} can={can}/></td>
                <td style={{padding:"7px 10px",textAlign:"center",fontSize:11,color:C.gris}}><Cell val={r.fechaPago} onChange={v=>upd(r.id,"fechaPago",v)} type="date" can={can}/></td>
                <td style={{padding:"7px 10px",fontSize:11}}><Cell val={r.vivero} onChange={v=>upd(r.id,"vivero",v)} opts={VIVEROS} can={can}/></td>
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
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {[["Cliente *","cliente","text",null],["País","pais","select",PAISES],["Año","año","number",null],["Trimestre","trim","number",null],["N° Plantas","nPlantas","number",null],["US$/Planta","usdPlanta","number",null],["N° Orden de Compra","nOC","text",null],["N° Factura","nFact","text",null],["Fecha pago","fechaPago","date",null],["Vivero","vivero","select",VIVEROS]].map(([l,c,t,opts])=>(
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
function RoyaltyComercial({data,setData,can}) {
  const [filtroAño,setFiltroAño]=useState("Todos");
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
  const filtrado=calc.filter(r=>filtroAño==="Todos"||r.añoCobro===Number(filtroAño));

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
        💡 Monto Facturar = Há a cobrar × US$/Há (por defecto US$3.000/Há) &nbsp;·&nbsp; Monto Cobrar = <strong>85% Perú/Chile · 90% México</strong>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        <span style={{fontSize:12,color:C.gris,fontWeight:600}}>Año cobro:</span>
        {años.map(a=>(
          <button key={a} onClick={()=>setFiltroAño(String(a))}
            style={{padding:"4px 12px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
              background:filtroAño===String(a)?C.mo:"#fff",color:filtroAño===String(a)?"#fff":C.sl}}>
            {a}
          </button>
        ))}
      </div>

      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",background:"#fff",borderRadius:10,overflow:"hidden"}}>
          <Th cols={[
            {l:"Cliente",w:120},{l:"País",w:70},{l:"Trim./Año cobro",c:true,w:120},
            {l:"N° Plantas",c:true,w:100},{l:"Há a cobrar",c:true,w:100},{l:"US$/Há",c:true,w:90},
            {l:"Mto. Facturar",c:true,w:115},{l:"Mto. Cobrar",c:true,w:115},
            {l:"N° Factura",c:true,w:100},{l:"Fact. Est.",c:true,w:130},{l:"Cobro",c:true,w:110},
            {l:"Alerta",c:true,w:80},
          ]}/>
          <tbody>
            {filtrado.map((r,i)=>(
              <tr key={r.id} style={{borderBottom:"1px solid #f1f5f9",
                background:r.alertaActiva?"#fffbeb":i%2===0?"#fff":"#f8fafc"}}>
                <td style={{padding:"7px 10px",fontWeight:600}}>{r.cliente}</td>
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
                  {$$(r.montoCobro)}<div style={{fontSize:9,color:C.gris}}>{(pct(r.pais)*100).toFixed(0)}%</div>
                </td>
                <td style={{padding:"7px 10px",textAlign:"center"}}><Cell val={r.nFact} onChange={v=>upd(r.id,"nFact",v)} can={can} ph="F-..."/></td>
                <td style={{padding:"7px 10px",textAlign:"center"}}><BadgeFact nFact={r.nFact}/></td>
                <td style={{padding:"7px 10px",textAlign:"center"}}><BadgePago pagado={r.pagado} onChange={v=>upd(r.id,"pagado",v)} can={can}/></td>
                <td style={{padding:"7px 10px",textAlign:"center"}}>
                  {r.alertaActiva
                    ? <span style={{fontSize:18}}>⚠️</span>
                    : <span style={{fontSize:10,color:C.gris}}>{r.diasAviso>0?`${r.diasAviso}d`:"—"}</span>}
                </td>
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
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {[["Cliente *","cliente","text",null],["País","pais","select",PAISES],["Trimestre inicio cobro","trimCobro","select",["1","2","3","4"]],["Año inicio cobro","añoCobro","number",null],["N° Plantas","nPlantas","number",null],["Há a cobrar","ha","number",null],["US$/Há (por def. $3.000)","usdHa","number",null],["N° Factura","nFact","text",null]].map(([l,c,t,opts])=>(
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
function FeeEntrada({data,setData,can}) {
  const [modal,setModal]=useState(false);
  const [form,setForm]=useState({cliente:"",pais:"Peru",nFact:"",pagado:false,fechaPago:"",montoUSD:30000,detalle:"Sin Devolución"});
  const upd=(id,c,v)=>setData(prev=>prev.map(r=>r.id===id?{...r,[c]:v}:r));
  const totCob=data.filter(r=>r.pagado).reduce((s,r)=>s+(r.montoUSD||0),0);
  const totPend=data.filter(r=>!r.pagado).reduce((s,r)=>s+(r.montoUSD||0),0);
  function agregar(){if(!form.cliente.trim()){alert("Cliente obligatorio.");return;}setData(prev=>[...prev,{...form,id:`fe_${Date.now()}`,montoUSD:parseFloat(form.montoUSD)||30000}]);setModal(false);}
  return (
    <div>
      <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        {[[$$(totCob),"Cobrado",C.verde,C.verdeBg],[$$(totPend),"Por cobrar",C.am,C.amBg],[data.length,"Total",C.gris,C.grisBg]].map(([v,l,c,bg])=>(
          <div key={l} style={{background:bg,borderRadius:12,padding:"12px 18px",flex:1,minWidth:120}}>
            <div style={{fontSize:11,color:c,fontWeight:600}}>{l}</div>
            <div style={{fontSize:20,fontWeight:800,color:c}}>{v}</div>
          </div>
        ))}
        {can&&<button onClick={()=>setModal(true)} style={{background:C.azul,color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontSize:12,fontWeight:700,alignSelf:"center"}}>+ Agregar</button>}
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",background:"#fff",borderRadius:10,overflow:"hidden"}}>
          <Th cols={[{l:"Cliente",w:130},{l:"País",w:80},{l:"N° Factura",c:true,w:110},{l:"Fact. Est.",c:true,w:130},{l:"Fecha pago",c:true,w:100},{l:"Monto US$",c:true,w:100},{l:"Cobro",c:true,w:110},{l:"Detalle",w:140}]}/>
          <tbody>
            {data.map((r,i)=>(
              <tr key={r.id} style={{borderBottom:"1px solid #f1f5f9",background:i%2===0?"#fff":"#f8fafc"}}>
                <td style={{padding:"8px 12px"}}><Cell val={r.cliente} onChange={v=>upd(r.id,"cliente",v)} can={can}/></td>
                <td style={{padding:"8px 12px"}}><Cell val={r.pais} onChange={v=>upd(r.id,"pais",v)} opts={["Peru","Mexico","Chile"]} can={can}/></td>
                <td style={{padding:"8px 12px",textAlign:"center"}}><Cell val={r.nFact} onChange={v=>upd(r.id,"nFact",v)} can={can} ph="F-..."/></td>
                <td style={{padding:"8px 12px",textAlign:"center"}}><BadgeFact nFact={r.nFact}/></td>
                <td style={{padding:"8px 12px",textAlign:"center",fontSize:11,color:C.gris}}><Cell val={r.fechaPago} onChange={v=>upd(r.id,"fechaPago",v)} type="date" can={can}/></td>
                <td style={{padding:"8px 12px",textAlign:"right",fontWeight:700,color:C.verde}}><Cell val={r.montoUSD} onChange={v=>upd(r.id,"montoUSD",parseFloat(v))} type="number" can={can}/></td>
                <td style={{padding:"8px 12px",textAlign:"center"}}><BadgePago pagado={r.pagado} onChange={v=>upd(r.id,"pagado",v)} can={can}/></td>
                <td style={{padding:"8px 12px",fontSize:11,color:C.gris}}><Cell val={r.detalle} onChange={v=>upd(r.id,"detalle",v)} can={can}/></td>
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
              {[["Cliente *","cliente","text"],["N° Factura","nFact","text"],["Fecha pago","fechaPago","date"],["Detalle","detalle","text"]].map(([l,c,t])=>(
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
function FeeViveros({data,setData,can}) {
  const [filtroEst,setFiltroEst]=useState("Todos");
  const [modal,setModal]=useState(false);
  const [form,setForm]=useState({vivero:"Synergiabio",empresa:"",pais:"Peru",proforma:"",nPlantas:"",regalia:0.45,totalOsiris:"",tipoPago:"Entrega",montoFact:"",fechaFact:"",nFact:"",pagado:false});
  const upd=(id,c,v)=>setData(prev=>prev.map(r=>r.id===id?{...r,[c]:v}:r));

  const filtrado=data.filter(r=>{
    if(filtroEst==="Todos") return true;
    if(filtroEst==="Facturado") return r.nFact&&r.nFact.trim()!=="";
    if(filtroEst==="Pendiente") return !r.nFact||r.nFact.trim()==="";
    if(filtroEst==="Pagado") return r.pagado;
    return true;
  });

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
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        {["Todos","Facturado","Pendiente","Pagado"].map(e=>(
          <button key={e} onClick={()=>setFiltroEst(e)}
            style={{padding:"4px 12px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
              background:filtroEst===e?C.azul:"#fff",color:filtroEst===e?"#fff":C.sl}}>
            {e}
          </button>
        ))}
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",background:"#fff",borderRadius:10,overflow:"hidden"}}>
          <Th cols={[{l:"Vivero",w:100},{l:"Empresa",w:150},{l:"País",w:70},{l:"Proforma",w:130},{l:"N° Plantas",c:true,w:90},{l:"Regalía",c:true,w:70},{l:"Total Osiris",c:true,w:110},{l:"Tipo",c:true,w:90},{l:"Mto. Facturar",c:true,w:115},{l:"Fecha Fact.",c:true,w:100},{l:"N° Factura",c:true,w:100},{l:"Fact. Est.",c:true,w:130},{l:"Cobro",c:true,w:110}]}/>
          <tbody>
            {filtrado.map((r,i)=>(
              <tr key={r.id} style={{borderBottom:"1px solid #f1f5f9",background:i%2===0?"#fff":"#f8fafc"}}>
                <td style={{padding:"7px 10px",fontSize:11}}><Cell val={r.vivero} onChange={v=>upd(r.id,"vivero",v)} opts={["Synergiabio","Agromillora"]} can={can}/></td>
                <td style={{padding:"7px 10px",fontWeight:600}}><Cell val={r.empresa} onChange={v=>upd(r.id,"empresa",v)} can={can}/></td>
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
              </tr>
            ))}
            {filtrado.length===0&&<tr><td colSpan={13} style={{textAlign:"center",padding:32,color:C.gris}}>Sin registros</td></tr>}
          </tbody>
        </table>
      </div>
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#0006",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:16,padding:28,width:500,maxWidth:"92vw",maxHeight:"90vh",overflowY:"auto",boxShadow:"0 8px 32px #0003"}}>
            <h3 style={{margin:"0 0 16px",color:C.sl}}>Nuevo Fee Vivero</h3>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {[["Vivero","vivero","select",["Synergiabio","Agromillora"]],["País","pais","select",PAISES],["Empresa *","empresa","text",null],["Proforma","proforma","text",null],["N° Plantas","nPlantas","number",null],["Regalía (dec.)","regalia","number",null],["Total Osiris US$","totalOsiris","number",null],["Tipo Pago","tipoPago","select",TIPOS],["Monto a Facturar","montoFact","number",null],["Fecha Facturar","fechaFact","date",null],["N° Factura","nFact","text",null]].map(([l,c,t,opts])=>(
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
function Resumen({rpData,feData,rcData,fvData,tpData}) {
  const hoy=new Date();hoy.setHours(0,0,0,0);

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
  function addCobro(fecha,tipo,monto){
    if(!fecha||!monto||monto<=0)return;
    const f=new Date(fecha);if(isNaN(f.getTime())||f<hoy)return;
    const key=`${f.getFullYear()}-${String(f.getMonth()+1).padStart(2,'0')}`;
    if(!calendarioCobros[key])calendarioCobros[key]={año:f.getFullYear(),mes:f.getMonth(),rp:0,rc:0,fv:0,fe:0};
    calendarioCobros[key][tipo]+=monto;
  }
  rpCalc.filter(r=>!r.pagado&&r.fechaPago).forEach(r=>addCobro(r.fechaPago,"rp",r.montoCobro));
  rcCalc.filter(r=>!r.pagado).forEach(r=>{const f=fechaInicioTrim(r.añoCobro,r.trimCobro);addCobro(f.toISOString().slice(0,10),"rc",r.montoCobro);});
  fvData.filter(r=>!r.pagado&&r.fechaFact).forEach(r=>addCobro(r.fechaFact,"fv",Number(r.montoFact)||0));
  feData.filter(r=>!r.pagado&&r.fechaPago).forEach(r=>addCobro(r.fechaPago,"fe",Number(r.montoUSD)||0));
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
                  {rows.map((r,i)=>(
                    <tr key={r.key} style={{borderTop:"1px solid #f1f5f9",background:i%2===0?"#fff":"#f8fafc"}}>
                      <td style={{padding:"9px 12px",fontWeight:700,color:C.sl,whiteSpace:"nowrap"}}>
                        {MESES_CORTO[r.mes]} {r.año}
                      </td>
                      <td style={{padding:"9px 12px",textAlign:"right",color:r.rp>0?C.azul:C.gris}}>{r.rp>0?$$(r.rp):"—"}</td>
                      <td style={{padding:"9px 12px",textAlign:"right",color:r.rc>0?C.mo:C.gris}}>{r.rc>0?$$(r.rc):"—"}</td>
                      <td style={{padding:"9px 12px",textAlign:"right",color:r.fv>0?C.teal:C.gris}}>{r.fv>0?$$(r.fv):"—"}</td>
                      <td style={{padding:"9px 12px",textAlign:"right",color:r.fe>0?C.verde:C.gris}}>{r.fe>0?$$(r.fe):"—"}</td>
                      <td style={{padding:"9px 12px",textAlign:"right",fontWeight:700,color:C.sl,background:"#f0f9ff",fontSize:13}}>{$$(r.total)}</td>
                    </tr>
                  ))}
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
const TIPOS_CONTRATO=["Licencia","Exclusiva","No Exclusiva"];
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
function ControlContratos({data,setData,can}){
  const [vista,setVista]=useState("tabla");
  const [sel,setSel]=useState(null);
  const [sec,setSec]=useState("empresa");
  const [busq,setBusq]=useState("");
  const [filtroPais,setFiltroPais]=useState("Todos");
  const formVacio={razonSocial:"",taxID:"",pais:"Peru",direccion:"",ciudad:"",tipoContrato:"Licencia",moneda:"USD",fechaContrato:"",fechaTermino:"",firmadoLicenciado:false,firmadoOsiris:false,verDigital:"",anexo1:false,anexo2:false,anexo3:false,nombreRep:"",personeria:"",nombrePredio:"",direccionPredio:"",cuartel:"",region:"",ciudadPredio:"",coordenadas:"",tipoContractFee:"Sin Devolución",montoContractFee:30000,valorRoyaltyPlanta:1.00,valorRoyaltyComercial:3000,royaltyInflacion:false,mesFacuracionRC:"",notas:""};
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
    if(!form.razonSocial.trim()){alert("Razón Social es obligatoria.");return;}
    setData(prev=>[...prev,{...form,id:`ct_${Date.now()}`}]);
    setVista("tabla");setForm(formVacio);
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

  function CampoNuevo({label,campo,tipo="text",opts=null,fullWidth=false}){
    return(
      <div style={fullWidth?{gridColumn:"1/-1"}:{}}>
        <label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>{label}</label>
        {opts
          ? <select value={form[campo]} onChange={e=>setF(campo,e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}>
              {opts.map(o=><option key={o}>{o}</option>)}
            </select>
          : tipo==="checkbox"
            ? <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:12,fontWeight:600,color:C.sl}}>
                <input type="checkbox" checked={form[campo]||false} onChange={()=>setF(campo,!form[campo])}/> {label}
              </label>
            : <input type={tipo} value={form[campo]} onChange={e=>setF(campo,e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>
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
              <Campo label="Tax ID / RUC" campo="taxID" r={r}/>
              <Campo label="País" campo="pais" opts={PAISES} r={r}/>
              <Campo label="Dirección" campo="direccion" r={r}/>
              <Campo label="Ciudad" campo="ciudad" r={r}/>
            </div>
          )}
          {sec==="contrato"&&(
            <div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))",gap:16,marginBottom:20}}>
                <Campo label="Tipo Contrato" campo="tipoContrato" opts={TIPOS_CONTRATO} r={r}/>
                <Campo label="Moneda" campo="moneda" opts={MONEDAS} r={r}/>
                <Campo label="Fecha Contrato" campo="fechaContrato" tipo="date" r={r}/>
                <Campo label="Fecha Término" campo="fechaTermino" tipo="date" r={r}/>
                <Campo label="Ver Digital (URL)" campo="verDigital" r={r}/>
              </div>
              <div style={{background:"#f8fafc",borderRadius:12,padding:16,marginBottom:16}}>
                <div style={{fontSize:12,fontWeight:700,color:C.sl,marginBottom:12}}>Estado de Firmas</div>
                <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                  {[["firmadoLicenciado","Firmado Licenciado"],["firmadoOsiris","Firmado OSIRIS"]].map(([campo,label])=>(
                    <label key={campo} style={{display:"flex",alignItems:"center",gap:8,cursor:can?"pointer":"default",
                      background:r[campo]?C.verdeBg:C.rojoBg,border:`1px solid ${r[campo]?"#86efac":"#fca5a5"}`,
                      borderRadius:10,padding:"9px 18px",fontSize:13,fontWeight:600,
                      color:r[campo]?C.verde:C.rojo}}>
                      <input type="checkbox" checked={r[campo]} disabled={!can} onChange={()=>upd(r.id,campo,!r[campo])} style={{accentColor:r[campo]?"#16a34a":"#dc2626"}}/>
                      {r[campo]?"✅":"❌"} {label}
                    </label>
                  ))}
                </div>
              </div>
              <div style={{background:"#f8fafc",borderRadius:12,padding:16,marginBottom:16}}>
                <div style={{fontSize:12,fontWeight:700,color:C.sl,marginBottom:12}}>Anexos del contrato</div>
                <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                  {[["anexo1","Anexo 1"],["anexo2","Anexo 2"],["anexo3","Anexo 3"]].map(([campo,label])=>(
                    <label key={campo} style={{display:"flex",alignItems:"center",gap:8,cursor:can?"pointer":"default",
                      background:r[campo]?C.azulBg:"#f1f5f9",border:`1px solid ${r[campo]?"#93c5fd":"#d1d5db"}`,
                      borderRadius:10,padding:"9px 18px",fontSize:13,fontWeight:600,
                      color:r[campo]?C.azul:"#94a3b8"}}>
                      <input type="checkbox" checked={r[campo]} disabled={!can} onChange={()=>upd(r.id,campo,!r[campo])} style={{accentColor:"#2563eb"}}/>
                      {r[campo]?"📎":"○"} {label}
                    </label>
                  ))}
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
          <button onClick={()=>{setVista("tabla");setForm(formVacio);}} style={{background:"#f1f5f9",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:13,color:C.sl,fontWeight:600}}>← Volver</button>
          <h2 style={{margin:0,fontSize:16,fontWeight:800,color:C.sl}}>Nuevo Contrato</h2>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{background:"#fff",borderRadius:12,padding:20,boxShadow:"0 1px 6px #0001"}}>
            <div style={{fontSize:13,fontWeight:700,color:C.azul,marginBottom:14}}>🏢 Antecedentes Empresa</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
              <CampoNuevo label="Razón Social *" campo="razonSocial"/>
              <CampoNuevo label="Tax ID / RUC" campo="taxID"/>
              <CampoNuevo label="País" campo="pais" opts={PAISES}/>
              <CampoNuevo label="Dirección" campo="direccion"/>
              <CampoNuevo label="Ciudad" campo="ciudad"/>
            </div>
          </div>
          <div style={{background:"#fff",borderRadius:12,padding:20,boxShadow:"0 1px 6px #0001"}}>
            <div style={{fontSize:13,fontWeight:700,color:C.mo,marginBottom:14}}>📄 Datos del Contrato</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
              <CampoNuevo label="Tipo Contrato" campo="tipoContrato" opts={TIPOS_CONTRATO}/>
              <CampoNuevo label="Moneda" campo="moneda" opts={MONEDAS}/>
              <CampoNuevo label="Fecha Contrato" campo="fechaContrato" tipo="date"/>
              <CampoNuevo label="Fecha Término" campo="fechaTermino" tipo="date"/>
              <CampoNuevo label="Ver Digital (URL)" campo="verDigital"/>
            </div>
            <div style={{display:"flex",gap:14,marginTop:14,flexWrap:"wrap"}}>
              {[["firmadoLicenciado","✅ Firmado Licenciado"],["firmadoOsiris","✅ Firmado OSIRIS"],["anexo1","📎 Anexo 1"],["anexo2","📎 Anexo 2"],["anexo3","📎 Anexo 3"]].map(([c,l])=>(
                <label key={c} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:12,fontWeight:600,color:form[c]?C.sl:"#94a3b8"}}>
                  <input type="checkbox" checked={form[c]||false} onChange={()=>setF(c,!form[c])}/>{l}
                </label>
              ))}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <div style={{background:"#fff",borderRadius:12,padding:20,boxShadow:"0 1px 6px #0001"}}>
              <div style={{fontSize:13,fontWeight:700,color:C.teal,marginBottom:14}}>👤 Representante</div>
              <CampoNuevo label="Nombre" campo="nombreRep"/>
              <div style={{marginTop:12}}><CampoNuevo label="Personería" campo="personeria"/></div>
            </div>
            <div style={{background:"#fff",borderRadius:12,padding:20,boxShadow:"0 1px 6px #0001"}}>
              <div style={{fontSize:13,fontWeight:700,color:C.verde,marginBottom:14}}>🌱 Ubicación Plantas</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {[["Nombre Predio","nombrePredio"],["Cuartel","cuartel"],["Región","region"],["Coordenadas","coordenadas"]].map(([l,c])=>(
                  <div key={c}><CampoNuevo label={l} campo={c}/></div>
                ))}
              </div>
            </div>
          </div>
          <div style={{background:"#fff",borderRadius:12,padding:20,boxShadow:"0 1px 6px #0001"}}>
            <div style={{fontSize:13,fontWeight:700,color:C.am,marginBottom:14}}>💰 Facturación</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
              <CampoNuevo label="Tipo Contract Fee" campo="tipoContractFee" opts={TIPOS_FEE}/>
              <CampoNuevo label="Monto Contract Fee (USD)" campo="montoContractFee" tipo="number"/>
              <CampoNuevo label="Royalty/Planta (USD)" campo="valorRoyaltyPlanta" tipo="number"/>
              <CampoNuevo label="Royalty Comercial (USD/Há)" campo="valorRoyaltyComercial" tipo="number"/>
              <CampoNuevo label="Mes Facturación RC" campo="mesFacuracionRC" opts={["—",...MESES_ANO]}/>
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
        {can&&<button onClick={()=>{setVista("nuevo");setForm(formVacio);}} style={{background:C.azul,color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontSize:13,fontWeight:700,alignSelf:"center"}}>+ Nuevo contrato</button>}
      </div>
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
export default function OsirisModule({usuarioActual,esAdmin,esSoloConsulta,osirisData,setOsirisData,onBack,onLogout}) {
  // subApp: null = hub Osiris | "ingresos" | "contratos"
  const [subApp,setSubApp]=useState(null);
  const [subTab,setSubTab]=useState("resumen");

  const ctData=osirisData?.contratos        ??CONTRATOS_INIT;
  const rpData=osirisData?.royaltyPlanta    ??ROYALTY_PLANTA_INIT;
  const feData=osirisData?.feeEntrada       ??FEE_ENTRADA_INIT;
  const rcData=osirisData?.royaltyComercial ??ROYALTY_COMERCIAL_INIT;
  const fvData=osirisData?.feeViveros       ??FEE_VIVEROS_INIT;
  const tpData=osirisData?.totalPedidos     ??TOTAL_PEDIDOS_INIT;

  const setCt=useCallback(fn=>setOsirisData(prev=>({...prev,contratos:      typeof fn==="function"?fn(prev?.contratos      ??CONTRATOS_INIT)      :fn})),[setOsirisData]);
  const setRp=useCallback(fn=>setOsirisData(prev=>({...prev,royaltyPlanta:   typeof fn==="function"?fn(prev?.royaltyPlanta   ??ROYALTY_PLANTA_INIT)   :fn})),[setOsirisData]);
  const setFe=useCallback(fn=>setOsirisData(prev=>({...prev,feeEntrada:      typeof fn==="function"?fn(prev?.feeEntrada      ??FEE_ENTRADA_INIT)      :fn})),[setOsirisData]);
  const setRc=useCallback(fn=>setOsirisData(prev=>({...prev,royaltyComercial:typeof fn==="function"?fn(prev?.royaltyComercial??ROYALTY_COMERCIAL_INIT):fn})),[setOsirisData]);
  const setFv=useCallback(fn=>setOsirisData(prev=>({...prev,feeViveros:      typeof fn==="function"?fn(prev?.feeViveros      ??FEE_VIVEROS_INIT)      :fn})),[setOsirisData]);
  const setTp=useCallback(fn=>setOsirisData(prev=>({...prev,totalPedidos:    typeof fn==="function"?fn(prev?.totalPedidos    ??TOTAL_PEDIDOS_INIT)    :fn})),[setOsirisData]);

  const can=esAdmin(usuarioActual?.nombre||"");

  const totPend=
    rpData.map(r=>(Number(r.nPlantas)||0)*(Number(r.usdPlanta)||0)*pct(r.pais)*(r.pagado?0:1)).reduce((a,b)=>a+b,0)+
    feData.filter(r=>!r.pagado).reduce((s,r)=>s+(Number(r.montoUSD)||0),0)+
    fvData.filter(r=>!r.pagado).reduce((s,r)=>s+(Number(r.montoFact)||0),0);

  const hoy=new Date();hoy.setHours(0,0,0,0);
  const alertasRC=rcData.filter(r=>{const fA=fechaAvisoTrim(r.añoCobro,r.trimCobro);const fI=fechaInicioTrim(r.añoCobro,r.trimCobro);return hoy>=fA&&hoy<fI&&!r.nFact;}).length;
  const sinConfirmar=tpData.filter(r=>r.estado==="Por confirmar").length;

  const SUBTABS=[
    {id:"resumen",          label:"📊 Resumen",          badge:0},
    {id:"totalPedidos",     label:"📦 Total Pedidos",     badge:sinConfirmar},
    {id:"royaltyPlanta",    label:"🌿 Royalty/Planta",    badge:0},
    {id:"feeEntrada",       label:"📄 Fee Entrada",       badge:0},
    {id:"royaltyComercial", label:"📈 Royalty Comercial", badge:alertasRC},
    {id:"feeViveros",       label:"🌱 Fee Viveros",       badge:0},
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
        <ControlContratos data={ctData} setData={setCt} can={can}/>
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
      <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
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

      {/* Contenido */}
      <div style={{background:"#fff",borderRadius:14,padding:20,boxShadow:"0 2px 10px #0001"}}>
        {subTab==="resumen"          &&<Resumen        rpData={rpData} feData={feData} rcData={rcData} fvData={fvData} tpData={tpData}/>}
        {subTab==="totalPedidos"     &&<TotalPedidos    data={tpData} setData={setTp} rpData={rpData} setRpData={setRp} can={can}/>}
        {subTab==="royaltyPlanta"    &&<RoyaltyPlanta   data={rpData} setData={setRp} can={can}/>}
        {subTab==="feeEntrada"       &&<FeeEntrada      data={feData} setData={setFe} can={can}/>}
        {subTab==="royaltyComercial" &&<RoyaltyComercial data={rcData} setData={setRc} can={can}/>}
        {subTab==="feeViveros"       &&<FeeViveros      data={fvData} setData={setFv} can={can}/>}
      </div>
    </div>
  );
}
