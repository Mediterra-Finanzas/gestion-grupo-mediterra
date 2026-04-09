// ============================================================
// OsirisModule.jsx — v3 — Módulo Osiris Plant · Mediterra
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
  {id:"rp1", cliente:"Vanguard",       pais:"Peru",  año:2026,trim:1,nPlantas:422776,usdPlanta:0.85,nOC:"",nFact:"",      pagado:true, fechaPago:"2026-01-01",vivero:"Synergia Chile"},
  {id:"rp2", cliente:"Vanguard",       pais:"Peru",  año:2026,trim:1,nPlantas:298944,usdPlanta:0.85,nOC:"",nFact:"",      pagado:true, fechaPago:"2026-02-01",vivero:"Synergia Chile"},
  {id:"rp3", cliente:"Mainland",       pais:"Mexico",año:2026,trim:1,nPlantas:150000,usdPlanta:0.49,nOC:"",nFact:"",      pagado:true, fechaPago:"2026-02-01",vivero:"Synergia Mexico"},
  {id:"rp4", cliente:"Integrity/Talsa",pais:"Peru",  año:2026,trim:1,nPlantas:2100,  usdPlanta:0.85,nOC:"",nFact:"F-001",pagado:false,fechaPago:"2026-03-01",vivero:"Synergia Chile"},
  {id:"rp5", cliente:"Mainland",       pais:"Mexico",año:2026,trim:1,nPlantas:150000,usdPlanta:0.01,nOC:"",nFact:"",      pagado:true, fechaPago:"2026-03-13",vivero:"Synergia Mexico"},
  {id:"rp6", cliente:"Mainland",       pais:"Mexico",año:2026,trim:1,nPlantas:150000,usdPlanta:0.34,nOC:"",nFact:"F-002",pagado:false,fechaPago:"2026-03-31",vivero:"Synergia Mexico"},
  {id:"rp7", cliente:"Vanguard",       pais:"Peru",  año:2026,trim:1,nPlantas:222559,usdPlanta:0.85,nOC:"",nFact:"",      pagado:true, fechaPago:"2026-03-31",vivero:"Synergia Chile"},
  {id:"rp8", cliente:"Dole Mexico",    pais:"Mexico",año:2026,trim:1,nPlantas:2100,  usdPlanta:0.85,nOC:"",nFact:"",      pagado:true, fechaPago:"2026-03-31",vivero:"Synergia Mexico"},
  {id:"rp9", cliente:"Gourmet",        pais:"Mexico",año:2026,trim:1,nPlantas:950,   usdPlanta:0.85,nOC:"",nFact:"",      pagado:true, fechaPago:"2026-03-31",vivero:"Synergia Mexico"},
  {id:"rp10",cliente:"Agroextiende",   pais:"Peru",  año:2026,trim:1,nPlantas:105840,usdPlanta:0.85,nOC:"",nFact:"",      pagado:true, fechaPago:"2026-03-31",vivero:"Synergia Chile"},
  {id:"rp11",cliente:"Vanguard",       pais:"Peru",  año:2026,trim:1,nPlantas:233708,usdPlanta:0.85,nOC:"",nFact:"F-003",pagado:false,fechaPago:"2026-04-30",vivero:"Synergia Chile"},
  {id:"rp12",cliente:"Agroextiende",   pais:"Peru",  año:2026,trim:1,nPlantas:145527,usdPlanta:0.85,nOC:"",nFact:"F-004",pagado:false,fechaPago:"2026-04-30",vivero:"Synergia Chile"},
  {id:"rp13",cliente:"Mainland",       pais:"Mexico",año:2026,trim:2,nPlantas:250000,usdPlanta:0.34,nOC:"",nFact:"",      pagado:false,fechaPago:"2026-05-01",vivero:"Synergia Mexico"},
  {id:"rp14",cliente:"Agroextiende",   pais:"Peru",  año:2026,trim:1,nPlantas:174634,usdPlanta:0.85,nOC:"",nFact:"",      pagado:false,fechaPago:"2026-05-31",vivero:"Agromillora Pe"},
  {id:"rp15",cliente:"Vanguard",       pais:"Peru",  año:2026,trim:1,nPlantas:195389,usdPlanta:0.85,nOC:"",nFact:"",      pagado:false,fechaPago:"2026-05-31",vivero:"Synergia Chile"},
  {id:"rp16",cliente:"Mainland",       pais:"Mexico",año:2026,trim:1,nPlantas:11760, usdPlanta:0.85,nOC:"",nFact:"",      pagado:false,fechaPago:"2026-09-01",vivero:"Synergia Mexico"},
  {id:"rp17",cliente:"Mainland",       pais:"Mexico",año:2026,trim:2,nPlantas:250000,usdPlanta:0.51,nOC:"",nFact:"",      pagado:false,fechaPago:"2026-09-01",vivero:"Synergia Mexico"},
  {id:"rp18",cliente:"Danper",         pais:"Peru",  año:2026,trim:3,nPlantas:512,   usdPlanta:0.85,nOC:"",nFact:"",      pagado:false,fechaPago:"2026-09-01",vivero:"Synergia Chile"},
  {id:"rp19",cliente:"Mainland",       pais:"Mexico",año:2026,trim:3,nPlantas:1000,  usdPlanta:0.85,nOC:"",nFact:"",      pagado:false,fechaPago:"2026-09-01",vivero:"Synergia Mexico"},
  {id:"rp20",cliente:"Danper",         pais:"Peru",  año:2026,trim:4,nPlantas:884271,usdPlanta:0.85,nOC:"",nFact:"",      pagado:false,fechaPago:"2026-10-01",vivero:"Synergia Chile"},
  {id:"rp21",cliente:"Frusan",         pais:"Peru",  año:2026,trim:4,nPlantas:285405,usdPlanta:1.00,nOC:"",nFact:"",      pagado:false,fechaPago:"2026-12-01",vivero:"Synergia Chile"},
  {id:"rp22",cliente:"Frunatural",     pais:"Mexico",año:2027,trim:1,nPlantas:136500,usdPlanta:1.00,nOC:"",nFact:"",      pagado:false,fechaPago:"2027-02-01",vivero:"Synergia Mexico"},
  {id:"rp23",cliente:"Frunatural",     pais:"Mexico",año:2027,trim:2,nPlantas:72000, usdPlanta:1.00,nOC:"",nFact:"",      pagado:false,fechaPago:"2027-05-01",vivero:"Synergia Mexico"},
];

// Royalty Comercial — ahora con há, US$/há, año/trim cobro, nFactura, pagado
const ROYALTY_COMERCIAL_INIT = [
  {id:"rc1", cliente:"Agroextiende",  pais:"Peru",  trimCobro:2,añoCobro:2026,ha:750,  usdHa:272,  nFact:"F-020",pagado:false},
  {id:"rc2", cliente:"Allpa",         pais:"Peru",  trimCobro:2,añoCobro:2026,ha:300,  usdHa:255,  nFact:"F-021",pagado:false},
  {id:"rc3", cliente:"San Clemente",  pais:"Peru",  trimCobro:2,añoCobro:2026,ha:380,  usdHa:261.5,nFact:"F-022",pagado:false},
  {id:"rc4", cliente:"Mainland",      pais:"Mexico",trimCobro:3,añoCobro:2026,ha:470,  usdHa:272,  nFact:"",     pagado:false},
  {id:"rc5", cliente:"Giddings",      pais:"Mexico",trimCobro:3,añoCobro:2026,ha:135,  usdHa:275,  nFact:"",     pagado:false},
  {id:"rc6", cliente:"Agroextiende",  pais:"Peru",  trimCobro:2,añoCobro:2027,ha:750,  usdHa:272,  nFact:"",     pagado:false},
  {id:"rc7", cliente:"Allpa",         pais:"Peru",  trimCobro:2,añoCobro:2027,ha:300,  usdHa:382.5,nFact:"",     pagado:false},
  {id:"rc8", cliente:"Frusan",        pais:"Peru",  trimCobro:2,añoCobro:2027,ha:400,  usdHa:277.95,nFact:"",    pagado:false},
  {id:"rc9", cliente:"Hass Peru",     pais:"Peru",  trimCobro:2,añoCobro:2027,ha:420,  usdHa:255,  nFact:"",     pagado:false},
  {id:"rc10",cliente:"Pura Berries",  pais:"Peru",  trimCobro:2,añoCobro:2027,ha:315,  usdHa:273.5,nFact:"",     pagado:false},
  {id:"rc11",cliente:"Vanguard",      pais:"Peru",  trimCobro:2,añoCobro:2027,ha:2500, usdHa:255,  nFact:"",     pagado:false},
  {id:"rc12",cliente:"San Clemente",  pais:"Peru",  trimCobro:2,añoCobro:2027,ha:490,  usdHa:255,  nFact:"",     pagado:false},
  {id:"rc13",cliente:"Mainland",      pais:"Mexico",trimCobro:3,añoCobro:2027,ha:1100, usdHa:295.5,nFact:"",     pagado:false},
  {id:"rc14",cliente:"Giddings",      pais:"Mexico",trimCobro:3,añoCobro:2027,ha:120,  usdHa:309.6,nFact:"",     pagado:false},
];

const FEE_ENTRADA_INIT = [
  {id:"fe1",cliente:"Agrolatina",pais:"Peru",  nFact:"F-010",pagado:false,fechaPago:"2026-04-30",montoUSD:30000,detalle:"Sin Devolución"},
  {id:"fe2",cliente:"Frunatural",pais:"Mexico",nFact:"F-009",pagado:true, fechaPago:"2026-03-01",montoUSD:30000,detalle:"Sin Devolución"},
];

const FEE_VIVEROS_INIT = [
  {id:"fv1", vivero:"Synergiabio",empresa:"Frusan Agro SAC",   pais:"Peru",  proforma:"HUARME-CL-2024-02",  nPlantas:305185, regalia:0.45,totalOsiris:137333.25,tipoPago:"Entrega",  montoFact:132660.23,fechaFact:"2026-03-31",nFact:"F-030",pagado:false},
  {id:"fv2", vivero:"Synergiabio",empresa:"Vanguard",          pais:"Peru",  proforma:"OLIVOS-CL-2024-01",  nPlantas:1555705,regalia:0.45,totalOsiris:700067.25,tipoPago:"Entrega",  montoFact:180827.37,fechaFact:"2026-03-31",nFact:"F-031",pagado:false},
  {id:"fv3", vivero:"Agromillora",empresa:"AgroExtiende",      pais:"Peru",  proforma:"2025-2705",          nPlantas:420000, regalia:1.15,totalOsiris:483000,   tipoPago:"Anticipo", montoFact:34650.42, fechaFact:"2026-03-31",nFact:"F-032",pagado:false},
  {id:"fv4", vivero:"Synergiabio",empresa:"Frusan Agro SAC",   pais:"Peru",  proforma:"HUARME-CL-2026-0046",nPlantas:285405, regalia:0.45,totalOsiris:128432.25,tipoPago:"Anticipo", montoFact:67426.93, fechaFact:"2026-03-31",nFact:"F-033",pagado:false},
  {id:"fv5", vivero:"Synergiabio",empresa:"Vanguard",          pais:"Peru",  proforma:"OLIVOS-CL-2024-01",  nPlantas:1555705,regalia:0.45,totalOsiris:700067.25,tipoPago:"Entrega",  montoFact:169206.25,fechaFact:"2026-06-30",nFact:"",    pagado:false},
  {id:"fv6", vivero:"Agromillora",empresa:"AgroExtiende",      pais:"Peru",  proforma:"2025-2705",          nPlantas:420000, regalia:1.15,totalOsiris:483000,   tipoPago:"Anticipo", montoFact:192149.96,fechaFact:"2026-05-31",nFact:"",    pagado:false},
  {id:"fv7", vivero:"Synergiabio",empresa:"Mainland Farms SA", pais:"Mexico",proforma:"MAIFAR-MX-2025-01",  nPlantas:150000, regalia:0.45,totalOsiris:67500,    tipoPago:"Entrega",  montoFact:14987.03, fechaFact:"2026-06-30",nFact:"",    pagado:false},
  {id:"fv8", vivero:"Synergiabio",empresa:"Mainland Farms SA", pais:"Mexico",proforma:"MAIFAR-MX-2025-02",  nPlantas:250000, regalia:0.45,totalOsiris:112500,   tipoPago:"Entrega",  montoFact:20250,    fechaFact:"2026-06-30",nFact:"",    pagado:false},
  {id:"fv9", vivero:"Synergiabio",empresa:"La Calera",         pais:"Peru",  proforma:"BRIDGE-PE-2025-01",  nPlantas:3500,   regalia:0.45,totalOsiris:1575,     tipoPago:"Entrega",  montoFact:1575,     fechaFact:"2026-06-30",nFact:"",    pagado:false},
  {id:"fv10",vivero:"Synergiabio",empresa:"Integrity/Talsa",   pais:"Peru",  proforma:"INTFAR-PE-2026-01",  nPlantas:2100,   regalia:0.45,totalOsiris:945,      tipoPago:"Entrega",  montoFact:945,      fechaFact:"2026-06-30",nFact:"",    pagado:false},
  {id:"fv11",vivero:"Agromillora",empresa:"AgroExtiende",      pais:"Peru",  proforma:"2025-2705",          nPlantas:420000, regalia:1.15,totalOsiris:483000,   tipoPago:"Entrega",  montoFact:256199.62,fechaFact:"2026-07-31",nFact:"",    pagado:false},
  {id:"fv12",vivero:"Synergiabio",empresa:"Mainland Farms SA", pais:"Mexico",proforma:"MAIFAR-MX-2024-04",  nPlantas:50000,  regalia:0.45,totalOsiris:22500,    tipoPago:"Entrega",  montoFact:2077.09,  fechaFact:"2026-09-30",nFact:"",    pagado:false},
  {id:"fv13",vivero:"Synergiabio",empresa:"Mainland Farms SA", pais:"Mexico",proforma:"MAIFAR-MX-2025-02",  nPlantas:250000, regalia:0.45,totalOsiris:112500,   tipoPago:"Entrega",  montoFact:30375,    fechaFact:"2026-09-30",nFact:"",    pagado:false},
  {id:"fv14",vivero:"Synergiabio",empresa:"KJ Orchard CO Ltd", pais:"Corea", proforma:"KJORCH-CL-2025-01",  nPlantas:12096,  regalia:0.10,totalOsiris:1209.6,   tipoPago:"Entrega",  montoFact:483.84,   fechaFact:"2026-09-30",nFact:"",    pagado:false},
  {id:"fv15",vivero:"Synergiabio",empresa:"Danper Trujillo SAC",pais:"Peru",  proforma:"DANPER-CL-2025-0148",nPlantas:884271, regalia:0.45,totalOsiris:397921.95,tipoPago:"Entrega",  montoFact:159168.78,fechaFact:"2026-12-31",nFact:"",    pagado:false},
  {id:"fv16",vivero:"Synergiabio",empresa:"Frusan Agro SAC",   pais:"Peru",  proforma:"HUARME-CL-2026-0046",nPlantas:285405, regalia:0.45,totalOsiris:128432.25,tipoPago:"Entrega",  montoFact:51372.9,  fechaFact:"2026-12-31",nFact:"",    pagado:false},
  {id:"fv17",vivero:"Synergiabio",empresa:"Frusan Agro SAC",   pais:"Peru",  proforma:"HUARME-CL-2026-0046",nPlantas:285405, regalia:0.45,totalOsiris:128432.25,tipoPago:"Entrega",  montoFact:9632.42,  fechaFact:"2027-03-31",nFact:"",    pagado:false},
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
    // Si se confirma, crear fila en Royalty/Planta automáticamente
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
      {/* KPIs */}
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

      {/* Filtros */}
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

      {/* Tabla */}
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

      {/* Modal */}
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
            {form.estado==="Confirmado"&&(
              <div style={{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:8,padding:"8px 12px",marginTop:12,fontSize:12,color:"#15803d"}}>
                ✅ Al guardar se creará automáticamente una fila en Royalty/Planta
              </div>
            )}
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
        {[[$$( totFact),"Monto a Facturar",C.azul,C.azulBg],[$$(totCobro),"Monto a Cobrar",C.verde,C.verdeBg],[$$(totPend),"Por Cobrar",C.am,C.amBg],[filtrado.length,"Registros",C.gris,C.grisBg]].map(([v,l,c,bg])=>(
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
            {form.nPlantas&&form.usdPlanta&&(
              <div style={{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:8,padding:"10px 14px",marginTop:12,fontSize:12,color:"#15803d"}}>
                💰 Facturar: <strong>{$$((parseFloat(form.nPlantas)||0)*(parseFloat(form.usdPlanta)||0))}</strong>
                &nbsp;→ Cobrar: <strong>{$$((parseFloat(form.nPlantas)||0)*(parseFloat(form.usdPlanta)||0)*pct(form.pais))}</strong> ({(pct(form.pais)*100).toFixed(0)}%)
              </div>
            )}
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
  const [form,setForm]=useState({cliente:"",pais:"Peru",trimCobro:2,añoCobro:2026,ha:"",usdHa:"",nFact:"",pagado:false});

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
    if(!form.cliente.trim()||!form.ha){alert("Cliente y Há son obligatorios.");return;}
    setData(prev=>[...prev,{...form,id:`rc_${Date.now()}`,ha:parseFloat(form.ha)||0,usdHa:parseFloat(form.usdHa)||0,añoCobro:parseInt(form.añoCobro),trimCobro:parseInt(form.trimCobro)}]);
    setModal(false);
  }

  const TRIM_LABELS=["","T1 (Ene-Mar)","T2 (Abr-Jun)","T3 (Jul-Sep)","T4 (Oct-Dic)"];

  return (
    <div>
      {/* Alertas de facturación próxima */}
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

      {/* KPIs */}
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
        💡 Monto Facturar = Há plantadas × US$/Há &nbsp;·&nbsp; Monto Cobrar = <strong>85% Perú/Chile · 90% México</strong> &nbsp;·&nbsp; Se avisa 1 mes antes del trimestre de cobro
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
            {l:"Há plantadas",c:true,w:100},{l:"US$/Há",c:true,w:80},
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
                <td style={{padding:"7px 10px",textAlign:"right",fontWeight:600}}><Cell val={r.ha} onChange={v=>upd(r.id,"ha",parseFloat(v))} type="number" can={can}/></td>
                <td style={{padding:"7px 10px",textAlign:"center"}}><Cell val={r.usdHa} onChange={v=>upd(r.id,"usdHa",parseFloat(v))} type="number" can={can}/></td>
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
            {filtrado.length===0&&<tr><td colSpan={11} style={{textAlign:"center",padding:32,color:C.gris}}>Sin registros</td></tr>}
          </tbody>
        </table>
      </div>

      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#0006",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:16,padding:28,width:440,maxWidth:"92vw",boxShadow:"0 8px 32px #0003"}}>
            <h3 style={{margin:"0 0 16px",color:C.sl}}>Nuevo Royalty Comercial</h3>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {[["Cliente *","cliente","text",null],["País","pais","select",PAISES],["Trimestre inicio cobro","trimCobro","select",["1","2","3","4"]],["Año inicio cobro","añoCobro","number",null],["Há plantadas","ha","number",null],["US$/Há","usdHa","number",null],["N° Factura","nFact","text",null]].map(([l,c,t,opts])=>(
                <div key={c}>
                  <label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>{l}</label>
                  {opts?<select value={form[c]} onChange={e=>setForm(p=>({...p,[c]:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}>{opts.map(o=><option key={o}>{o}</option>)}</select>
                  :<input type={t} value={form[c]} onChange={e=>setForm(p=>({...p,[c]:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/>}
                </div>
              ))}
            </div>
            {form.ha&&form.usdHa&&(
              <div style={{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:8,padding:"10px 14px",marginTop:12,fontSize:12,color:"#15803d"}}>
                💰 Facturar: <strong>{$$((parseFloat(form.ha)||0)*(parseFloat(form.usdHa)||0))}</strong>
                &nbsp;→ Cobrar: <strong>{$$((parseFloat(form.ha)||0)*(parseFloat(form.usdHa)||0)*pct(form.pais))}</strong>
              </div>
            )}
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

  const totRP_cobrado=rpCalc.filter(r=>r.pagado).reduce((s,r)=>s+r.montoCobro,0);
  const totRP_pend=rpCalc.filter(r=>!r.pagado).reduce((s,r)=>s+r.montoCobro,0);
  const totRP_fact=rpCalc.reduce((s,r)=>s+r.montoFact,0);
  const totFE_cob=feData.filter(r=>r.pagado).reduce((s,r)=>s+(r.montoUSD||0),0);
  const totFE_pend=feData.filter(r=>!r.pagado).reduce((s,r)=>s+(r.montoUSD||0),0);
  const totRC_2026=rcCalc.filter(r=>r.añoCobro===2026).reduce((s,r)=>s+r.montoFact,0);
  const totRC_2027=rcCalc.filter(r=>r.añoCobro===2027).reduce((s,r)=>s+r.montoFact,0);
  const totFV_pend=fvData.filter(r=>!r.pagado).reduce((s,r)=>s+(Number(r.montoFact)||0),0);
  const totPlantas=tpData.reduce((s,r)=>s+(Number(r.nPlantas)||0),0);
  const sinConfirmar=tpData.filter(r=>r.estado==="Por confirmar").length;

  const alertasRC=rcCalc.filter(r=>r.alertaActiva);

  const pedidosPorAño={};tpData.forEach(r=>{pedidosPorAño[r.año]=(pedidosPorAño[r.año]||0)+(Number(r.nPlantas)||0);});

  const porCliente={};rpCalc.filter(r=>!r.pagado).forEach(r=>{porCliente[r.cliente]=(porCliente[r.cliente]||0)+r.montoCobro;});
  const topCli=Object.entries(porCliente).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const maxV=topCli[0]?.[1]||1;

  const proximos=rpCalc.filter(r=>{if(!r.fechaPago||r.pagado)return false;const f=new Date(r.fechaPago);const d=(f-hoy)/(1000*60*60*24);return d>=0&&d<=60;}).sort((a,b)=>new Date(a.fechaPago)-new Date(b.fechaPago));

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      {/* Alertas Royalty Comercial */}
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

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(185px,1fr))",gap:12}}>
        {[
          ["🌱 Total Plantas",       N(totPlantas),    C.teal,  C.tealBg],
          ["📦 Por confirmar",       sinConfirmar,     C.am,    C.amBg],
          ["✅ RP Cobrado",          $$(totRP_cobrado), "#22c55e","#dcfce7"],
          ["⏳ RP Por cobrar",       $$(totRP_pend),   C.am,    C.amBg],
          ["📋 RP Total Facturar",   $$(totRP_fact),   C.azul,  C.azulBg],
          ["📄 Fee Entrada cobrado", $$(totFE_cob),    "#22c55e","#dcfce7"],
          ["⚠️ Fee Entrada pend.",   $$(totFE_pend),   C.rojo,  C.rojoBg],
          ["📊 RC Facturar 2026",    $$(totRC_2026),   C.mo,    C.moBg],
          ["📈 RC Facturar 2027",    $$(totRC_2027),   C.gris,  C.grisBg],
          ["🌿 Viveros por cobrar",  $$(totFV_pend),   C.am,    C.amBg],
        ].map(([l,v,c,bg])=>(
          <div key={l} style={{background:bg,borderRadius:12,padding:"14px 16px"}}>
            <div style={{fontSize:10,color:c,fontWeight:600,marginBottom:2}}>{l}</div>
            <div style={{fontSize:16,fontWeight:800,color:c}}>{v}</div>
          </div>
        ))}
      </div>

      {/* Pedidos por año */}
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

      {/* Top clientes RP */}
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

      {/* Próximos cobros */}
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

// ── Logo SVG Osiris ───────────────────────────────────────
function OsirisLogo({height=52}) {
  return (
    <svg height={height} viewBox="0 0 420 160" style={{display:"block"}} aria-label="Osiris Plant Management">
      <text x="0" y="118" fontFamily="Arial,sans-serif" fontWeight="900" fontSize="112" fill="#fff" letterSpacing="-3" opacity="0.95">OSIRIS</text>
      <text x="4" y="150" fontFamily="Arial,sans-serif" fontWeight="400" fontSize="21" fill="rgba(255,255,255,0.65)" letterSpacing="5">PLANT MANAGEMENT</text>
      <line x1="375" y1="14"  x2="412" y2="36"  stroke="rgba(255,255,255,0.6)" strokeWidth="3" strokeLinecap="round"/>
      <line x1="412" y1="36"  x2="412" y2="82"  stroke="rgba(255,255,255,0.6)" strokeWidth="3" strokeLinecap="round"/>
      <line x1="412" y1="82"  x2="375" y2="104" stroke="rgba(255,255,255,0.6)" strokeWidth="3" strokeLinecap="round"/>
      <line x1="375" y1="104" x2="338" y2="82"  stroke="rgba(255,255,255,0.6)" strokeWidth="3" strokeLinecap="round"/>
      <line x1="338" y1="82"  x2="338" y2="36"  stroke="rgba(255,255,255,0.6)" strokeWidth="3" strokeLinecap="round"/>
      <circle cx="375" cy="14"  r="7" fill="none" stroke="#f5c518" strokeWidth="3.5"/>
      <circle cx="412" cy="36"  r="7" fill="#e74c3c"/>
      <circle cx="412" cy="82"  r="7" fill="none" stroke="#a569bd" strokeWidth="3.5"/>
      <circle cx="375" cy="104" r="9" fill="#e67e22"/>
      <circle cx="338" cy="82"  r="6" fill="#2ecc71"/>
      <ellipse cx="363" cy="6"  rx="8" ry="5" fill="#2ecc71" transform="rotate(-40 363 6)"/>
      <ellipse cx="387" cy="5"  rx="8" ry="5" fill="#2ecc71" transform="rotate(30 387 5)"/>
      <ellipse cx="402" cy="93" rx="7" ry="4" fill="#2ecc71" transform="rotate(50 402 93)"/>
      <ellipse cx="416" cy="93" rx="7" ry="4" fill="#2ecc71" transform="rotate(-20 416 93)"/>
      <ellipse cx="327" cy="88" rx="7" ry="4" fill="#2ecc71" transform="rotate(140 327 88)"/>
      <ellipse cx="331" cy="74" rx="7" ry="4" fill="#2ecc71" transform="rotate(60 331 74)"/>
    </svg>
  );
}

// ══════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════
export default function OsirisModule({usuarioActual,esAdmin,esSoloConsulta,osirisData,setOsirisData}) {
  const [subTab,setSubTab]=useState("resumen");

  const rpData=osirisData?.royaltyPlanta    ??ROYALTY_PLANTA_INIT;
  const feData=osirisData?.feeEntrada       ??FEE_ENTRADA_INIT;
  const rcData=osirisData?.royaltyComercial ??ROYALTY_COMERCIAL_INIT;
  const fvData=osirisData?.feeViveros       ??FEE_VIVEROS_INIT;
  const tpData=osirisData?.totalPedidos     ??TOTAL_PEDIDOS_INIT;

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

  // Alertas RC para badge en sub-tab
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

  return (
    <div>
      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#0f2d4a,#1a5276)",borderRadius:14,padding:"16px 24px",marginBottom:18,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          <OsirisLogo height={56}/>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.55)",marginTop:2,letterSpacing:1}}>Gestión de Ingresos y Cobros</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.6)",marginBottom:2}}>Total pendiente de cobro</div>
          <div style={{fontSize:24,fontWeight:800,color:"#fbbf24"}}>{$$(totPend)}</div>
        </div>
      </div>

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
