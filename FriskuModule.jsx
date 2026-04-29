/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// FriskuModule.jsx — Frisku Foods · Connecting Quality
// Persistencia independiente: fila "frisku" en Supabase
// ═══════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";

const SUPA_URL = "https://bywovqayuzodbzwsriet.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5d292cWF5dXpvZGJ6d3NyaWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODU1MDgsImV4cCI6MjA5MTI2MTUwOH0.s2x2O_CxE6rl8dBqFuyfQdMyRqSyjJQWXJXesmVGXtk";

// ── Persistencia ──
async function dbLoadFrisku() {
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/calendario_data?id=eq.frisku&select=value`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
    });
    const rows = await res.json();
    if(rows?.[0]?.value) {
      const v = typeof rows[0].value === "string" ? JSON.parse(rows[0].value) : rows[0].value;
      return v;
    }
    return null;
  } catch(e) { console.error("[Frisku] Error cargando:", e); return null; }
}

async function dbSaveFrisku(value) {
  try {
    // Protección anti-pérdida
    if(value) {
      const protectedKeys = ["clientes","exportadoras","contratos","embarques","liquidaciones"];
      for(const k of protectedKeys) {
        const nc = Array.isArray(value[k]) ? value[k].length : -1;
        const pc = window._lastSavedFrisku?.[k] || 0;
        if(pc >= 3 && nc >= 0 && nc < pc * 0.5) {
          console.warn(`[dbSaveFrisku] ⚠️ BLOQUEADO: ${k} pasó de ${pc} a ${nc} (caída >50%).`);
          return;
        }
        if(pc > 0 && nc === 0) {
          console.warn(`[dbSaveFrisku] ⚠️ BLOQUEADO: ${k} pasó de ${pc} a 0.`);
          return;
        }
      }
      if(!window._lastSavedFrisku) window._lastSavedFrisku = {};
      for(const k of protectedKeys) { if(Array.isArray(value[k]) && value[k].length > 0) window._lastSavedFrisku[k] = value[k].length; }
    }
    await fetch(`${SUPA_URL}/rest/v1/calendario_data`, {
      method: "POST",
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`,
        "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ id: "frisku", value, updated_at: new Date().toISOString() })
    });
    const keys = value ? Object.keys(value).filter(k=>Array.isArray(value[k])&&value[k].length>0).map(k=>`${k}:${value[k].length}`).join(", ") : "VACÍO";
    console.log(`[Frisku] ✅ Guardado: ${keys||"sin arrays"}`);
  } catch(e) { console.error("[Frisku] Error guardando:", e); }
}

// ── DateInput ──
function DateInput({value, onChange, disabled, style}) {
  const [local, setLocal] = useState(value||"");
  useEffect(()=>{ setLocal(value||""); },[value]);
  return <input type="date" disabled={disabled} value={local} onChange={e=>setLocal(e.target.value)} onBlur={()=>onChange(local)} style={style}/>;
}

// ── Paleta ──
const C = {
  bg:"#0d1117", bg2:"#161b22", card:"#1c2333", card2:"#21283b", border:"#30363d",
  text:"#e6edf3", muted:"#8b949e", muted2:"#484f58",
  blue:"#2563eb", green:"#16a34a", yellow:"#d97706", accent:"#b91c1c",
  teal:"#0f766e", purple:"#7c3aed",
};

// ── Logo Frisku ──
function FriskuLogo({height=52}) {
  return (
    <img src="/frisku.png" alt="Frisku Foods"
      style={{height, objectFit:"contain", display:"block"}}
      onError={e=>{e.target.style.display="none";}}/>
  );
}

function Card({children}) {
  return <div style={{background:C.card,borderRadius:14,padding:20,border:`1px solid ${C.border}`}}>{children}</div>;
}

function KPI({label,value,color}) {
  return (
    <div style={{background:`${color}15`,borderRadius:10,padding:"10px 16px",minWidth:100,flex:1}}>
      <div style={{fontSize:10,color:C.muted}}>{label}</div>
      <div style={{fontSize:20,fontWeight:800,color}}>{value}</div>
    </div>
  );
}

function PlaceholderModule({icon,title,desc}) {
  return (
    <div style={{padding:40,textAlign:"center",color:"#94a3b8"}}>
      <div style={{fontSize:56,marginBottom:16}}>{icon}</div>
      <div style={{fontSize:18,fontWeight:700,color:"#1e293b",marginBottom:8}}>{title}</div>
      <div style={{fontSize:13,color:"#64748b",maxWidth:500,margin:"0 auto",lineHeight:1.6}}>{desc}</div>
      <div style={{marginTop:20,padding:"12px 20px",background:"#f1f5f9",borderRadius:10,display:"inline-block",fontSize:12,color:"#475569"}}>🚧 Módulo en construcción</div>
    </div>
  );
}

// ── Temporada helper ──
function temporadaActual() {
  const hoy = new Date();
  const m = hoy.getMonth(), y = hoy.getFullYear();
  return m >= 6 ? `${y}/${y+1}` : `${y-1}/${y}`;
}
function generarTemporadas() {
  const t = [];
  for(let y=2024;y<=2035;y++) t.push(`${y}/${y+1}`);
  return t;
}

// ═══════════════════════════════════════════════════════════════════
// MÓDULO PRINCIPAL
// ═══════════════════════════════════════════════════════════════════
export default function FriskuModule({usuarioActual, esAdmin, esSoloConsulta, tabPermisos={}, onBack, onLogout}) {
  const [cargando, setCargando] = useState(true);
  const [subApp, setSubApp] = useState(null);
  const [tempSeleccionada, setTempSeleccionada] = useState(temporadaActual());
  const [showMaestros, setShowMaestros] = useState(false);

  const [data, setData] = useState({
    clientes:[], exportadoras:[], contratos:[], programas:[], embarques:[],
    qcOrigen:[], qcDestino:[], liquidaciones:[], cobros:[], informes:[],
    maestros:{contactos:[],fichas:[],noContactar:[],correosReportes:[]},
    hubCardsOrder:null
  });

  const dataRef = useRef(data);
  useEffect(()=>{ dataRef.current = data; },[data]);

  const can = !esSoloConsulta;

  // Setters
  const setClientes = fn => setData(p=>({...p, clientes: typeof fn==="function"?fn(p.clientes||[]):fn}));
  const setExportadoras = fn => setData(p=>({...p, exportadoras: typeof fn==="function"?fn(p.exportadoras||[]):fn}));
  const setContratos = fn => setData(p=>({...p, contratos: typeof fn==="function"?fn(p.contratos||[]):fn}));
  const setProgramas = fn => setData(p=>({...p, programas: typeof fn==="function"?fn(p.programas||[]):fn}));
  const setEmbarques = fn => setData(p=>({...p, embarques: typeof fn==="function"?fn(p.embarques||[]):fn}));
  const setLiquidaciones = fn => setData(p=>({...p, liquidaciones: typeof fn==="function"?fn(p.liquidaciones||[]):fn}));
  const setCobros = fn => setData(p=>({...p, cobros: typeof fn==="function"?fn(p.cobros||[]):fn}));

  // Cargar
  useEffect(()=>{
    (async()=>{
      const d = await dbLoadFrisku();
      if(d) {
        setData(d);
        window._lastSavedFrisku = {};
        ["clientes","exportadoras","contratos","embarques","liquidaciones"].forEach(k=>{
          if(Array.isArray(d[k])) window._lastSavedFrisku[k] = d[k].length;
        });
        console.log("[Frisku] Cargado. Protección:", JSON.stringify(window._lastSavedFrisku));
      }
      setCargando(false);
    })();
  },[]);

  // Auto-guardado (debounce 2s)
  useEffect(()=>{
    if(cargando) return;
    const t = setTimeout(()=>dbSaveFrisku(dataRef.current), 2000);
    return ()=>clearTimeout(t);
  },[data, cargando]);

  // Alertas
  const alertasDocsPendientes = useMemo(()=>{
    return (data.embarques||[]).filter(e=>{
      const docs = ["bl","factura","fitosanitario","certOrigen","packingList"];
      return docs.some(d=>!e[d]) && e.estado!=="Cerrado";
    }).length;
  },[data.embarques]);

  const alertasLiqRetraso = useMemo(()=>{
    return (data.embarques||[]).filter(e=>{
      if(e.estado==="Cerrado"||e.estado==="Liquidado") return false;
      if(!e.fechaLlegada) return false;
      const llegada = new Date(e.fechaLlegada);
      const hoy = new Date();
      const dias = Math.floor((hoy-llegada)/(1000*60*60*24));
      return dias > 30; // Más de 30 días sin liquidar
    }).length;
  },[data.embarques]);

  const alertasCobro = useMemo(()=>{
    return (data.cobros||[]).filter(c=>c.estado==="Pendiente").length;
  },[data.cobros]);

  // SUBAPPS
  const SUBAPPS = [
    {id:"clientes",       label:"Clientes",               desc:"Importadores que Frisku representa a nivel mundial",                    icon:"👥", color:"#b91c1c", stats:`${(data.clientes||[]).length} clientes`},
    {id:"exportadoras",   label:"Exportadoras",            desc:"Proveedores de fruta fresca de Chile y Latinoamérica",                  icon:"🏭", color:"#0f766e", stats:`${(data.exportadoras||[]).length} exportadoras`},
    {id:"contratos",      label:"Business Closure",        desc:"Contratos y acuerdos cliente ↔ exportadora por temporada",              icon:"📋", color:"#7c3aed", stats:`${(data.contratos||[]).length} contratos`},
    {id:"programa",       label:"Programa & Loading",      desc:"Programa de embarques, carga semanal, loading update a clientes",       icon:"📊", color:"#2563eb", stats:`${(data.programas||[]).length} programas`},
    {id:"embarques",      label:"Embarques & COMEX",       desc:"Orden embarque, docs (BL, Factura, CO, Fito), despacho, tracking",      icon:"🚢", color:"#0ea5e9", stats:`${(data.embarques||[]).length} embarques`, alert:alertasDocsPendientes>0?`⚠️ ${alertasDocsPendientes} docs pendientes`:null},
    {id:"qc",             label:"QC & Procedimientos",     desc:"QC origen, QC destino, LMR, homologación productores",                  icon:"🔍", color:"#16a34a", stats:`${(data.qcOrigen||[]).length + (data.qcDestino||[]).length} QC`},
    {id:"liquidaciones",  label:"Liquidaciones & Cobros",  desc:"Liquidación cliente/exportadora, cobro comisión, facturación",          icon:"💰", color:"#d97706", stats:`${(data.liquidaciones||[]).length} liq.`, alert:alertasLiqRetraso>0?`🔴 ${alertasLiqRetraso} retrasadas`:alertasCobro>0?`⏳ ${alertasCobro} cobros pend.`:null},
    {id:"informes",       label:"Informes & Reportes",     desc:"Reporte mercado, shipping summary, informe carga semanal",              icon:"📈", color:"#6366f1", stats:"Reportes"},
    {id:"maestros",       label:"Maestros & Alarmas",      desc:"Contactos, fichas, listas, alertas de docs/pagos/QC",                   icon:"⚙️", color:"#64748b", stats:"Config"},
  ];

  if(cargando) return <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontFamily:"sans-serif"}}>Cargando Frisku Foods...</div>;

  // Render sub-módulo
  if(subApp) return (
    <div style={{fontFamily:"sans-serif",background:C.bg,minHeight:"100vh",color:C.text}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 24px",background:C.card,borderBottom:`1px solid ${C.border}`,flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:12,color:C.muted}}>Mediterra › Frisku Foods ›</span>
          <span style={{fontWeight:700,color:C.text}}>{SUBAPPS.find(s=>s.id===subApp)?.label}</span>
          <FriskuLogo height={28}/>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setSubApp(null)} style={{background:C.teal,color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>🏠 Frisku Hub</button>
          <button onClick={onBack} style={{background:C.card2,color:C.muted,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12}}>← Mediterra</button>
          <select value={tempSeleccionada} onChange={e=>setTempSeleccionada(e.target.value)}
            style={{padding:"6px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:11}}>
            {generarTemporadas().map(t=><option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={onLogout} style={{background:C.accent,color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12}}>Salir</button>
        </div>
      </div>
      <div style={{padding:"20px 24px",maxWidth:1200,margin:"0 auto"}}>
        <Card>
          {subApp==="clientes"&&<PlaceholderModule icon="👥" title="Clientes" desc="Importadores que Frisku representa. Ficha del cliente, país, contacto, procedimientos, requisitos específicos."/>}
          {subApp==="exportadoras"&&<PlaceholderModule icon="🏭" title="Exportadoras" desc="Proveedores de fruta. Ficha, contacto, variedades, homologación productores, historial."/>}
          {subApp==="contratos"&&<PlaceholderModule icon="📋" title="Business Closure" desc="Contratos cliente ↔ exportadora. Especie, variedad, programa, presupuesto temporada, condiciones."/>}
          {subApp==="programa"&&<PlaceholderModule icon="📊" title="Programa & Loading" desc="Gestión del programa por temporada. Carga semanal, loading update, informe a cliente."/>}
          {subApp==="embarques"&&<PlaceholderModule icon="🚢" title="Embarques & COMEX" desc="Orden de embarque, documentos (BL, Factura, Fitosanitario, CO, Packing List), despacho, tracking. Alerta de docs pendientes."/>}
          {subApp==="qc"&&<PlaceholderModule icon="🔍" title="QC & Procedimientos" desc="QC origen (envío a las partes), QC destino, verificación LMR, homologación productores, procedimientos por cliente."/>}
          {subApp==="liquidaciones"&&<PlaceholderModule icon="💰" title="Liquidaciones & Cobros" desc="Liquidación cliente/exportadora, cobro de comisión (% sobre venta en destino), facturación y pagos, advance request. Alerta de retrasos."/>}
          {subApp==="informes"&&<PlaceholderModule icon="📈" title="Informes & Reportes" desc="Reporte de mercado, shipping summary, informe carga semanal, real vs proyectado."/>}
          {subApp==="maestros"&&<PlaceholderModule icon="⚙️" title="Maestros & Alarmas" desc="Contactos exportadoras, fichas, listado no contactar, correos para reportes, control productores. Alarmas: docs pendientes, pagos, QC."/>}
        </Card>
      </div>
    </div>
  );

  // Hub principal
  return (
    <div style={{fontFamily:"sans-serif",background:C.bg,minHeight:"100vh",color:C.text}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 24px",background:C.card,borderBottom:`1px solid ${C.border}`,flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:14,fontWeight:700,color:C.text}}>Frisku Foods Hub</span>
        </div>
        <div style={{display:"flex",gap:8}}>
          <select value={tempSeleccionada} onChange={e=>setTempSeleccionada(e.target.value)}
            style={{padding:"6px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:11}}>
            {generarTemporadas().map(t=><option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={onBack} style={{background:C.card2,color:C.muted,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12}}>← Mediterra</button>
          <button onClick={onLogout} style={{background:C.accent,color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12}}>Salir</button>
        </div>
      </div>

      <div style={{padding:"30px 24px",maxWidth:1000,margin:"0 auto"}}>
        <div style={{textAlign:"center",marginBottom:30}}>
          <div style={{display:"flex",justifyContent:"center",marginBottom:12}}>
            <FriskuLogo height={60}/>
          </div>
          <div style={{color:C.muted,fontSize:13}}>Connecting Quality · Representación de Importadores de Fruta Fresca</div>
        </div>

        {/* Alertas */}
        {(alertasDocsPendientes>0||alertasLiqRetraso>0||alertasCobro>0)&&(
          <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
            {alertasDocsPendientes>0&&<div style={{background:"#fef3c7",borderRadius:10,padding:"10px 16px",flex:1,minWidth:200,border:"1px solid #fbbf24"}}>
              <div style={{fontSize:12,fontWeight:700,color:"#92400e"}}>⚠️ {alertasDocsPendientes} embarques con docs pendientes</div></div>}
            {alertasLiqRetraso>0&&<div style={{background:"#fef2f2",borderRadius:10,padding:"10px 16px",flex:1,minWidth:200,border:"1px solid #fecaca"}}>
              <div style={{fontSize:12,fontWeight:700,color:"#991b1b"}}>🔴 {alertasLiqRetraso} liquidaciones retrasadas (+30 días)</div></div>}
            {alertasCobro>0&&<div style={{background:"#eff6ff",borderRadius:10,padding:"10px 16px",flex:1,minWidth:200,border:"1px solid #93c5fd"}}>
              <div style={{fontSize:12,fontWeight:700,color:"#1e40af"}}>⏳ {alertasCobro} cobros de comisión pendientes</div></div>}
          </div>
        )}

        {/* Cards — drag-and-drop solo admin */}
        {(()=>{
          const HUB_DEFAULT = SUBAPPS.map(s=>s.id);
          const order = (Array.isArray(data.hubCardsOrder) && data.hubCardsOrder.length===HUB_DEFAULT.length) ? data.hubCardsOrder : HUB_DEFAULT;
          const handleDragStart = (e,id) => { window._dragCardF=id; window._didDragF=true; e.dataTransfer.effectAllowed="move"; };
          const handleDrop = (e,targetId) => {
            e.preventDefault(); e.stopPropagation();
            const from = window._dragCardF; if(!from||from===targetId){window._dragCardF=null;return;}
            const nw=[...order]; const fi=nw.indexOf(from), ti=nw.indexOf(targetId);
            if(fi===-1||ti===-1)return; nw.splice(fi,1); nw.splice(ti,0,from);
            setData(p=>({...p, hubCardsOrder:nw})); window._dragCardF=null;
          };
          const handleClick = (id) => { if(window._didDragF){window._didDragF=false;return;} setSubApp(id); };
          return (
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16,margin:"0 auto 30px"}}>
              {order.map(sid=>{
                const sa = SUBAPPS.find(s=>s.id===sid);
                if(!sa) return null;
                return (
                  <div key={sa.id} draggable={!!esAdmin}
                    onDragStart={e=>{if(!esAdmin)return;handleDragStart(e,sa.id);}}
                    onDragOver={e=>{if(!esAdmin)return;e.preventDefault();e.dataTransfer.dropEffect="move";}}
                    onDrop={e=>{if(!esAdmin)return;handleDrop(e,sa.id);}}
                    onDragEnd={()=>{setTimeout(()=>{window._didDragF=false;},100);window._dragCardF=null;}}
                    onClick={()=>handleClick(sa.id)}
                    style={{background:`linear-gradient(135deg,${C.card},${sa.color}22)`,borderRadius:16,padding:"24px 20px",
                      border:`1px solid ${sa.color}44`,cursor:"pointer",transition:"all 0.2s",position:"relative",overflow:"hidden"}}
                    onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"}
                    onMouseLeave={e=>e.currentTarget.style.transform="translateY(0)"}>
                    {esAdmin&&<div style={{position:"absolute",top:8,right:10,fontSize:10,color:"#475569",cursor:"grab"}} title="Arrastra para reordenar">⋮⋮</div>}
                    <div style={{fontSize:32,marginBottom:10}}>{sa.icon}</div>
                    <div style={{fontWeight:800,fontSize:16,color:C.text,marginBottom:4}}>{sa.label}</div>
                    <div style={{fontSize:11,color:C.muted,marginBottom:12}}>{sa.desc}</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      <span style={{fontSize:10,background:`${sa.color}22`,color:sa.color,padding:"3px 10px",borderRadius:20,fontWeight:700}}>{sa.stats}</span>
                      {sa.alert&&<span style={{fontSize:10,background:"#fef3c7",color:"#92400e",padding:"3px 10px",borderRadius:20,fontWeight:700}}>{sa.alert}</span>}
                    </div>
                    <div style={{position:"absolute",right:16,bottom:16,fontSize:20,color:`${sa.color}44`}}>→</div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* KPIs */}
        <div style={{display:"flex",gap:12,flexWrap:"wrap",margin:"0 auto"}}>
          <KPI label="🚢 Embarques" value={(data.embarques||[]).filter(e=>e.temporada===tempSeleccionada).length} color={C.blue}/>
          <KPI label="📋 Contratos" value={(data.contratos||[]).filter(c=>c.temporada===tempSeleccionada).length} color={C.purple}/>
          <KPI label="👥 Clientes" value={(data.clientes||[]).length} color={C.accent}/>
          <KPI label="🏭 Exportadoras" value={(data.exportadoras||[]).length} color={C.teal}/>
          <KPI label="💰 Cobros pend." value={alertasCobro} color={C.yellow}/>
          <KPI label="⚠️ Docs pend." value={alertasDocsPendientes} color={C.accent}/>
        </div>
      </div>
    </div>
  );
}
