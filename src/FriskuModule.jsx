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

// Helpers
const inputSt={width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #30363d",background:"#21283b",color:"#e6edf3",fontSize:12,boxSizing:"border-box"};
const lblSt={fontSize:10,color:"#8b949e",fontWeight:600,marginBottom:3};
const PAISES_IMPORT=["China","USA","UK","Países Bajos","Alemania","India","Canadá","Corea del Sur","Japón","Taiwán","Hong Kong","Singapur","Malasia","Tailandia","Vietnam","Emiratos Árabes","Arabia Saudita","Brasil","Colombia","México","Otro"];
const ESPECIES_FRISKU=["Arándanos","Cerezas","Uvas","Ciruelas","Kiwi","Paltas","Manzanas","Peras","Cítricos","Otro"];

// ═══════════════════════════════════════════════════════════════════
// CLIENTES (Importadores)
// ═══════════════════════════════════════════════════════════════════
function ClientesModule({data, setData, can}) {
  const [busq, setBusq] = useState("");
  const [modal, setModal] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [tab, setTab] = useState("ficha");
  const EMPTY={nombre:"",pais:"",ciudad:"",contacto:"",email:"",telefono:"",especies:[],procedimientos:"",requisitos:"",lmr:"",etiquetas:"",formatosEspeciales:"",notas:"",activo:true};
  const [form, setForm] = useState(EMPTY);

  const filtrado = data.filter(c=>!busq||c.nombre?.toLowerCase().includes(busq.toLowerCase())||c.pais?.toLowerCase().includes(busq.toLowerCase()));
  const cl = detalle ? data.find(c=>c.id===detalle) : null;
  const upd = (f,v) => setData(prev=>prev.map(c=>c.id===detalle?{...c,[f]:v}:c));

  function guardar(){
    if(!form.nombre){alert("Nombre obligatorio.");return;}
    setData(prev=>[...prev,{...form,id:`fcl_${Date.now()}`}]);
    setForm(EMPTY);setModal(false);
  }

  if(cl) {
    const TABS=[{id:"ficha",label:"📋 Ficha"},{id:"procedimientos",label:"📄 Procedimientos"},{id:"requisitos",label:"🔍 Requisitos"}];
    return(
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <button onClick={()=>{setDetalle(null);setTab("ficha");}} style={{background:"#21283b",border:"1px solid #30363d",borderRadius:8,padding:"6px 14px",cursor:"pointer",color:"#8b949e",fontSize:12}}>← Volver</button>
            <h3 style={{margin:0,color:"#e6edf3",fontSize:18}}>{cl.nombre}</h3>
            <span style={{fontSize:10,padding:"4px 12px",borderRadius:20,background:"#2563eb22",color:"#2563eb",fontWeight:700}}>{cl.pais}</span>
          </div>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
          {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"8px 16px",borderRadius:8,border:tab===t.id?"2px solid #0ea5e9":"1px solid #30363d",background:tab===t.id?"#0ea5e9":"transparent",color:tab===t.id?"#fff":"#8b949e",cursor:"pointer",fontSize:12,fontWeight:700}}>{t.label}</button>)}
        </div>
        {tab==="ficha"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            {[["Nombre empresa","nombre"],["País","pais"],["Ciudad","ciudad"],["Contacto principal","contacto"],["Email","email"],["Teléfono","telefono"]].map(([l,f])=>(
              <div key={f}><div style={lblSt}>{l}</div><input disabled={!can} value={cl[f]||""} onChange={e=>upd(f,e.target.value)} style={inputSt}/></div>))}
            <div style={{gridColumn:"1/-1"}}><div style={lblSt}>Especies</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{ESPECIES_FRISKU.map(e=>(
                <button key={e} disabled={!can} onClick={()=>{const cur=cl.especies||[];upd("especies",cur.includes(e)?cur.filter(x=>x!==e):[...cur,e]);}}
                  style={{padding:"4px 12px",borderRadius:20,border:`1px solid ${(cl.especies||[]).includes(e)?"#0ea5e9":"#30363d"}`,background:(cl.especies||[]).includes(e)?"#0ea5e922":"transparent",color:(cl.especies||[]).includes(e)?"#0ea5e9":"#8b949e",cursor:can?"pointer":"default",fontSize:11,fontWeight:600}}>{e}</button>
              ))}</div></div>
            <div style={{gridColumn:"1/-1"}}><div style={lblSt}>Notas</div><textarea disabled={!can} value={cl.notas||""} onChange={e=>upd("notas",e.target.value)} style={{...inputSt,minHeight:50}}/></div>
          </div>
        )}
        {tab==="procedimientos"&&(
          <div>
            <div style={lblSt}>Procedimientos del cliente</div>
            <textarea disabled={!can} value={cl.procedimientos||""} onChange={e=>upd("procedimientos",e.target.value)} placeholder="Etiquetas, formatos, instrucciones de empaque, condiciones de envío..." style={{...inputSt,minHeight:100}} />
            <div style={{height:12}}/>
            <div style={lblSt}>Etiquetas y formatos especiales</div>
            <textarea disabled={!can} value={cl.etiquetas||""} onChange={e=>upd("etiquetas",e.target.value)} placeholder="Descripción de etiquetas, links a archivos..." style={{...inputSt,minHeight:60}} />
            <div style={{height:12}}/>
            <div style={lblSt}>Formatos especiales</div>
            <textarea disabled={!can} value={cl.formatosEspeciales||""} onChange={e=>upd("formatosEspeciales",e.target.value)} style={{...inputSt,minHeight:60}} />
          </div>
        )}
        {tab==="requisitos"&&(
          <div>
            <div style={lblSt}>Requisitos específicos del cliente</div>
            <textarea disabled={!can} value={cl.requisitos||""} onChange={e=>upd("requisitos",e.target.value)} placeholder="Cert. Grower, Cert. Pack House, Client Approval, Análisis de Residuos, PPUL, Spray Records..." style={{...inputSt,minHeight:80}} />
            <div style={{height:12}}/>
            <div style={lblSt}>Verificación de cumplimiento LMR</div>
            <textarea disabled={!can} value={cl.lmr||""} onChange={e=>upd("lmr",e.target.value)} placeholder="Límites máximos de residuos, país destino, regulaciones específicas..." style={{...inputSt,minHeight:60}} />
          </div>
        )}
      </div>
    );
  }

  return(
    <div>
      <div style={{display:"flex",gap:12,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <input value={busq} onChange={e=>setBusq(e.target.value)} placeholder="🔍 Buscar cliente..." style={{...inputSt,flex:1,minWidth:200}}/>
        {can&&<button onClick={()=>{setForm(EMPTY);setModal(true);}} style={{background:"#b91c1c",color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Nuevo Cliente</button>}
      </div>
      <div style={{overflowX:"auto",borderRadius:10,border:"1px solid #30363d"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr style={{background:"#161b22"}}>{["Cliente","País","Contacto","Email","Especies",""].map(h=><th key={h} style={{padding:"6px 10px",textAlign:"left",color:"#8b949e",fontWeight:700,fontSize:10}}>{h}</th>)}</tr></thead>
          <tbody>{filtrado.map((c,i)=>(
            <tr key={c.id} onClick={()=>setDetalle(c.id)} style={{borderBottom:"1px solid #30363d22",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="#0ea5e911"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <td style={{padding:"6px 10px",fontWeight:600,color:"#e6edf3"}}>{c.nombre}</td>
              <td style={{padding:"6px 10px"}}><span style={{fontSize:9,background:"#2563eb22",color:"#2563eb",padding:"1px 6px",borderRadius:10,fontWeight:600}}>{c.pais}</span></td>
              <td style={{padding:"6px 10px",color:"#8b949e"}}>{c.contacto||"—"}</td>
              <td style={{padding:"6px 10px",color:"#8b949e",fontSize:10}}>{c.email||"—"}</td>
              <td style={{padding:"6px 10px"}}>{(c.especies||[]).map(e=><span key={e} style={{fontSize:8,background:"#0ea5e922",color:"#0ea5e9",padding:"1px 5px",borderRadius:8,marginRight:3}}>{e}</span>)}</td>
              <td style={{padding:"6px 10px",color:"#0ea5e9",fontWeight:700}}>Ver →</td>
            </tr>))}
            {filtrado.length===0&&<tr><td colSpan={6} style={{padding:30,textAlign:"center",color:"#484f58"}}>Sin clientes</td></tr>}
          </tbody>
        </table>
      </div>
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setModal(false)}>
          <div style={{background:"#1c2333",borderRadius:14,padding:24,maxWidth:520,width:"100%",border:"1px solid #30363d",maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:"0 0 16px",color:"#e6edf3"}}>Nuevo Cliente Importador</h3>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {[["Nombre *","nombre"],["País","pais"],["Ciudad","ciudad"],["Contacto","contacto"],["Email","email"],["Teléfono","telefono"]].map(([l,f])=>(
                <div key={f}><div style={lblSt}>{l}</div>
                  {f==="pais"?<select value={form[f]||""} onChange={e=>setForm(p=>({...p,[f]:e.target.value}))} style={inputSt}><option value="">—</option>{PAISES_IMPORT.map(p=><option key={p}>{p}</option>)}</select>
                  :<input value={form[f]||""} onChange={e=>setForm(p=>({...p,[f]:e.target.value}))} style={inputSt}/>}</div>))}
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
              <button onClick={()=>setModal(false)} style={{padding:"8px 18px",borderRadius:8,border:"1px solid #30363d",background:"transparent",color:"#8b949e",cursor:"pointer"}}>Cancelar</button>
              <button onClick={guardar} style={{padding:"8px 18px",borderRadius:8,border:"none",background:"#b91c1c",color:"#fff",cursor:"pointer",fontWeight:700}}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTADORAS (Proveedores de fruta)
// ═══════════════════════════════════════════════════════════════════
function ExportadorasModule({data, setData, can}) {
  const [busq, setBusq] = useState("");
  const [modal, setModal] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [tab, setTab] = useState("ficha");
  const EMPTY={nombre:"",pais:"Chile",region:"",contacto:"",email:"",telefono:"",especies:[],variedades:"",packingHouse:"",certificaciones:"",notas:"",activo:true};
  const [form, setForm] = useState(EMPTY);

  const filtrado = data.filter(e=>!busq||e.nombre?.toLowerCase().includes(busq.toLowerCase()));
  const exp = detalle ? data.find(e=>e.id===detalle) : null;
  const upd = (f,v) => setData(prev=>prev.map(e=>e.id===detalle?{...e,[f]:v}:e));

  function guardar(){
    if(!form.nombre){alert("Nombre obligatorio.");return;}
    setData(prev=>[...prev,{...form,id:`fex_${Date.now()}`}]);
    setForm(EMPTY);setModal(false);
  }

  if(exp) {
    const TABS=[{id:"ficha",label:"📋 Ficha"},{id:"produccion",label:"🌱 Producción"},{id:"homologacion",label:"✅ Homologación"}];
    return(
      <div>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
          <button onClick={()=>{setDetalle(null);setTab("ficha");}} style={{background:"#21283b",border:"1px solid #30363d",borderRadius:8,padding:"6px 14px",cursor:"pointer",color:"#8b949e",fontSize:12}}>← Volver</button>
          <h3 style={{margin:0,color:"#e6edf3",fontSize:18}}>{exp.nombre}</h3>
          <span style={{fontSize:10,padding:"4px 12px",borderRadius:20,background:"#0f766e22",color:"#0f766e",fontWeight:700}}>{exp.pais}</span>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
          {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"8px 16px",borderRadius:8,border:tab===t.id?"2px solid #0f766e":"1px solid #30363d",background:tab===t.id?"#0f766e":"transparent",color:tab===t.id?"#fff":"#8b949e",cursor:"pointer",fontSize:12,fontWeight:700}}>{t.label}</button>)}
        </div>
        {tab==="ficha"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            {[["Nombre empresa","nombre"],["País","pais"],["Región","region"],["Contacto","contacto"],["Email","email"],["Teléfono","telefono"],["Packing House","packingHouse"]].map(([l,f])=>(
              <div key={f}><div style={lblSt}>{l}</div><input disabled={!can} value={exp[f]||""} onChange={e=>upd(f,e.target.value)} style={inputSt}/></div>))}
            <div style={{gridColumn:"1/-1"}}><div style={lblSt}>Especies</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{ESPECIES_FRISKU.map(e=>(
                <button key={e} disabled={!can} onClick={()=>{const cur=exp.especies||[];upd("especies",cur.includes(e)?cur.filter(x=>x!==e):[...cur,e]);}}
                  style={{padding:"4px 12px",borderRadius:20,border:`1px solid ${(exp.especies||[]).includes(e)?"#0f766e":"#30363d"}`,background:(exp.especies||[]).includes(e)?"#0f766e22":"transparent",color:(exp.especies||[]).includes(e)?"#0f766e":"#8b949e",cursor:can?"pointer":"default",fontSize:11,fontWeight:600}}>{e}</button>
              ))}</div></div>
            <div style={{gridColumn:"1/-1"}}><div style={lblSt}>Notas</div><textarea disabled={!can} value={exp.notas||""} onChange={e=>upd("notas",e.target.value)} style={{...inputSt,minHeight:50}}/></div>
          </div>
        )}
        {tab==="produccion"&&(
          <div>
            <div style={lblSt}>Variedades disponibles</div>
            <textarea disabled={!can} value={exp.variedades||""} onChange={e=>upd("variedades",e.target.value)} placeholder="Variedades por especie, volúmenes estimados..." style={{...inputSt,minHeight:80}} />
            <div style={{height:12}}/>
            <div style={lblSt}>Certificaciones (GlobalGAP, BRC, etc.)</div>
            <textarea disabled={!can} value={exp.certificaciones||""} onChange={e=>upd("certificaciones",e.target.value)} style={{...inputSt,minHeight:60}} />
          </div>
        )}
        {tab==="homologacion"&&(
          <div>
            <div style={lblSt}>Homologación de productores (Producer Agreement)</div>
            <textarea disabled={!can} value={exp.homologacion||""} onChange={e=>upd("homologacion",e.target.value)} placeholder="Estado de homologación, productores aprobados, pendientes..." style={{...inputSt,minHeight:80}} />
            <div style={{height:12}}/>
            <div style={lblSt}>Control de productores</div>
            <textarea disabled={!can} value={exp.controlProductores||""} onChange={e=>upd("controlProductores",e.target.value)} style={{...inputSt,minHeight:60}} />
          </div>
        )}
      </div>
    );
  }

  return(
    <div>
      <div style={{display:"flex",gap:12,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <input value={busq} onChange={e=>setBusq(e.target.value)} placeholder="🔍 Buscar exportadora..." style={{...inputSt,flex:1,minWidth:200}}/>
        {can&&<button onClick={()=>{setForm(EMPTY);setModal(true);}} style={{background:"#0f766e",color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Nueva Exportadora</button>}
      </div>
      <div style={{overflowX:"auto",borderRadius:10,border:"1px solid #30363d"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr style={{background:"#161b22"}}>{["Exportadora","País","Contacto","Email","Especies",""].map(h=><th key={h} style={{padding:"6px 10px",textAlign:"left",color:"#8b949e",fontWeight:700,fontSize:10}}>{h}</th>)}</tr></thead>
          <tbody>{filtrado.map(e=>(
            <tr key={e.id} onClick={()=>setDetalle(e.id)} style={{borderBottom:"1px solid #30363d22",cursor:"pointer"}} onMouseEnter={ev=>ev.currentTarget.style.background="#0f766e11"} onMouseLeave={ev=>ev.currentTarget.style.background="transparent"}>
              <td style={{padding:"6px 10px",fontWeight:600,color:"#e6edf3"}}>{e.nombre}</td>
              <td style={{padding:"6px 10px"}}><span style={{fontSize:9,background:"#0f766e22",color:"#0f766e",padding:"1px 6px",borderRadius:10,fontWeight:600}}>{e.pais}</span></td>
              <td style={{padding:"6px 10px",color:"#8b949e"}}>{e.contacto||"—"}</td>
              <td style={{padding:"6px 10px",color:"#8b949e",fontSize:10}}>{e.email||"—"}</td>
              <td style={{padding:"6px 10px"}}>{(e.especies||[]).map(s=><span key={s} style={{fontSize:8,background:"#0f766e22",color:"#0f766e",padding:"1px 5px",borderRadius:8,marginRight:3}}>{s}</span>)}</td>
              <td style={{padding:"6px 10px",color:"#0f766e",fontWeight:700}}>Ver →</td>
            </tr>))}
            {filtrado.length===0&&<tr><td colSpan={6} style={{padding:30,textAlign:"center",color:"#484f58"}}>Sin exportadoras</td></tr>}
          </tbody>
        </table>
      </div>
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setModal(false)}>
          <div style={{background:"#1c2333",borderRadius:14,padding:24,maxWidth:520,width:"100%",border:"1px solid #30363d",maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:"0 0 16px",color:"#e6edf3"}}>Nueva Exportadora</h3>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {[["Nombre *","nombre"],["País","pais"],["Región","region"],["Contacto","contacto"],["Email","email"],["Teléfono","telefono"]].map(([l,f])=>(
                <div key={f}><div style={lblSt}>{l}</div><input value={form[f]||""} onChange={e=>setForm(p=>({...p,[f]:e.target.value}))} style={inputSt}/></div>))}
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
              <button onClick={()=>setModal(false)} style={{padding:"8px 18px",borderRadius:8,border:"1px solid #30363d",background:"transparent",color:"#8b949e",cursor:"pointer"}}>Cancelar</button>
              <button onClick={guardar} style={{padding:"8px 18px",borderRadius:8,border:"none",background:"#0f766e",color:"#fff",cursor:"pointer",fontWeight:700}}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// BUSINESS CLOSURE (Contratos cliente ↔ exportadora)
// ═══════════════════════════════════════════════════════════════════
function BusinessClosureModule({data, setData, clientes, exportadoras, can, temporada}) {
  const [modal, setModal] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const EMPTY={clienteId:"",clienteNombre:"",exportadoraId:"",exportadoraNombre:"",especie:"",variedad:"",programa:"",presupuesto:0,comisionPct:0,condiciones:"",linkContrato:"",estado:"Negociación",temporada:temporada||""};
  const [form, setForm] = useState(EMPTY);
  const ESTADOS_BC=["Negociación","Propuesta enviada","Firmado","Vigente","Cerrado","Cancelado"];

  const filtrado = data.filter(c=>c.temporada===temporada);
  const ct = detalle ? data.find(c=>c.id===detalle) : null;
  const upd = (f,v) => setData(prev=>prev.map(c=>c.id===detalle?{...c,[f]:v}:c));

  function guardar(){
    if(!form.clienteId||!form.exportadoraId){alert("Cliente y Exportadora obligatorios.");return;}
    const cl=(clientes||[]).find(c=>c.id===form.clienteId);
    const ex=(exportadoras||[]).find(e=>e.id===form.exportadoraId);
    setData(prev=>[...prev,{...form,id:`fbc_${Date.now()}`,clienteNombre:cl?.nombre||"",exportadoraNombre:ex?.nombre||"",temporada}]);
    setForm(EMPTY);setModal(false);
  }

  if(ct) {
    const estCol=ct.estado==="Firmado"||ct.estado==="Vigente"?"#16a34a":ct.estado==="Cancelado"?"#dc2626":"#d97706";
    return(
      <div>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
          <button onClick={()=>setDetalle(null)} style={{background:"#21283b",border:"1px solid #30363d",borderRadius:8,padding:"6px 14px",cursor:"pointer",color:"#8b949e",fontSize:12}}>← Volver</button>
          <h3 style={{margin:0,color:"#e6edf3",fontSize:16}}>📋 {ct.clienteNombre} ↔ {ct.exportadoraNombre}</h3>
          <span style={{fontSize:10,padding:"4px 12px",borderRadius:20,background:`${estCol}22`,color:estCol,fontWeight:700}}>{ct.estado}</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div><div style={lblSt}>Cliente</div><div style={{fontSize:14,fontWeight:700,color:"#e6edf3"}}>{ct.clienteNombre}</div></div>
          <div><div style={lblSt}>Exportadora</div><div style={{fontSize:14,fontWeight:700,color:"#e6edf3"}}>{ct.exportadoraNombre}</div></div>
          <div><div style={lblSt}>Especie</div><input disabled={!can} value={ct.especie||""} onChange={e=>upd("especie",e.target.value)} style={inputSt}/></div>
          <div><div style={lblSt}>Variedad</div><input disabled={!can} value={ct.variedad||""} onChange={e=>upd("variedad",e.target.value)} style={inputSt}/></div>
          <div><div style={lblSt}>Estado</div><select disabled={!can} value={ct.estado||""} onChange={e=>upd("estado",e.target.value)} style={inputSt}>{ESTADOS_BC.map(s=><option key={s}>{s}</option>)}</select></div>
          <div><div style={lblSt}>Comisión Frisku %</div><input type="number" step="0.1" disabled={!can} value={ct.comisionPct||""} onChange={e=>upd("comisionPct",parseFloat(e.target.value)||0)} style={inputSt}/></div>
          <div><div style={lblSt}>Presupuesto temporada (USD)</div><input type="number" disabled={!can} value={ct.presupuesto||""} onChange={e=>upd("presupuesto",parseFloat(e.target.value)||0)} style={inputSt}/></div>
          <div><div style={lblSt}>📎 Link contrato</div>
            <div style={{display:"flex",gap:6}}><input disabled={!can} value={ct.linkContrato||""} onChange={e=>upd("linkContrato",e.target.value)} placeholder="https://..." style={{...inputSt,flex:1}}/>
            {ct.linkContrato&&<a href={ct.linkContrato} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:"#0ea5e9"}}>📄</a>}</div></div>
          <div style={{gridColumn:"1/-1"}}><div style={lblSt}>Programa acordado</div><textarea disabled={!can} value={ct.programa||""} onChange={e=>upd("programa",e.target.value)} placeholder="Semanas, volúmenes, variedades..." style={{...inputSt,minHeight:60}}/></div>
          <div style={{gridColumn:"1/-1"}}><div style={lblSt}>Condiciones</div><textarea disabled={!can} value={ct.condiciones||""} onChange={e=>upd("condiciones",e.target.value)} style={{...inputSt,minHeight:50}}/></div>
        </div>
      </div>
    );
  }

  return(
    <div>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}>
        {can&&<button onClick={()=>{setForm({...EMPTY,temporada});setModal(true);}} style={{background:"#7c3aed",color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Nuevo Business Closure</button>}
      </div>
      <div style={{overflowX:"auto",borderRadius:10,border:"1px solid #30363d"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr style={{background:"#161b22"}}>{["Cliente","Exportadora","Especie","Variedad","Comisión","Estado",""].map(h=><th key={h} style={{padding:"6px 10px",textAlign:"left",color:"#8b949e",fontWeight:700,fontSize:10}}>{h}</th>)}</tr></thead>
          <tbody>{filtrado.map(c=>{
            const estCol=c.estado==="Firmado"||c.estado==="Vigente"?"#16a34a":c.estado==="Cancelado"?"#dc2626":"#d97706";
            return(
            <tr key={c.id} onClick={()=>setDetalle(c.id)} style={{borderBottom:"1px solid #30363d22",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="#7c3aed11"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <td style={{padding:"6px 10px",fontWeight:600,color:"#e6edf3"}}>{c.clienteNombre}</td>
              <td style={{padding:"6px 10px",color:"#8b949e"}}>{c.exportadoraNombre}</td>
              <td style={{padding:"6px 10px"}}><span style={{fontSize:9,background:"#0ea5e922",color:"#0ea5e9",padding:"1px 6px",borderRadius:10,fontWeight:600}}>{c.especie}</span></td>
              <td style={{padding:"6px 10px",color:"#8b949e"}}>{c.variedad||"—"}</td>
              <td style={{padding:"6px 10px",fontWeight:700}}>{c.comisionPct||0}%</td>
              <td style={{padding:"6px 10px"}}><span style={{fontSize:9,padding:"2px 8px",borderRadius:10,fontWeight:700,background:`${estCol}22`,color:estCol}}>{c.estado}</span></td>
              <td style={{padding:"6px 10px",color:"#7c3aed",fontWeight:700}}>Ver →</td>
            </tr>);})}
            {filtrado.length===0&&<tr><td colSpan={7} style={{padding:30,textAlign:"center",color:"#484f58"}}>Sin business closures para esta temporada</td></tr>}
          </tbody>
        </table>
      </div>
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setModal(false)}>
          <div style={{background:"#1c2333",borderRadius:14,padding:24,maxWidth:520,width:"100%",border:"1px solid #30363d"}} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:"0 0 16px",color:"#e6edf3"}}>Nuevo Business Closure</h3>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div><div style={lblSt}>Cliente *</div><select value={form.clienteId} onChange={e=>setForm(p=>({...p,clienteId:e.target.value}))} style={inputSt}><option value="">—</option>{(clientes||[]).map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
              <div><div style={lblSt}>Exportadora *</div><select value={form.exportadoraId} onChange={e=>setForm(p=>({...p,exportadoraId:e.target.value}))} style={inputSt}><option value="">—</option>{(exportadoras||[]).map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}</select></div>
              <div><div style={lblSt}>Especie</div><select value={form.especie} onChange={e=>setForm(p=>({...p,especie:e.target.value}))} style={inputSt}><option value="">—</option>{ESPECIES_FRISKU.map(e=><option key={e}>{e}</option>)}</select></div>
              <div><div style={lblSt}>Variedad</div><input value={form.variedad||""} onChange={e=>setForm(p=>({...p,variedad:e.target.value}))} style={inputSt}/></div>
              <div><div style={lblSt}>Comisión %</div><input type="number" step="0.1" value={form.comisionPct||""} onChange={e=>setForm(p=>({...p,comisionPct:parseFloat(e.target.value)||0}))} style={inputSt}/></div>
              <div><div style={lblSt}>Estado</div><select value={form.estado} onChange={e=>setForm(p=>({...p,estado:e.target.value}))} style={inputSt}>{ESTADOS_BC.map(s=><option key={s}>{s}</option>)}</select></div>
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
              <button onClick={()=>setModal(false)} style={{padding:"8px 18px",borderRadius:8,border:"1px solid #30363d",background:"transparent",color:"#8b949e",cursor:"pointer"}}>Cancelar</button>
              <button onClick={guardar} style={{padding:"8px 18px",borderRadius:8,border:"none",background:"#7c3aed",color:"#fff",cursor:"pointer",fontWeight:700}}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// EMBARQUES & COMEX (Orden + Docs + Despacho + Alertas)
// ═══════════════════════════════════════════════════════════════════
function EmbarquesCOMEXModule({data, setData, clientes, exportadoras, contratos, can, temporada}) {
  const [busq, setBusq] = useState("");
  const [modal, setModal] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [tab, setTab] = useState("orden");
  const EMPTY={contenedor:"",exportadora:"",cliente:"",especie:"",destino:"",via:"Marítimo",etd:"",eta:"",estado:"Programado",temporada:temporada||"",notas:""};
  const [form, setForm] = useState(EMPTY);
  const ESTADOS_EMB=["Programado","Orden enviada","En carga","Despachado","En tránsito","Llegado","QC Destino","Liquidado","Cerrado"];
  const DOCS_KEYS=[{key:"bl",label:"BL (Bill of Lading)"},{key:"factura",label:"Factura"},{key:"fitosanitario",label:"Fitosanitario"},{key:"certOrigen",label:"Certificado de Origen"},{key:"packingList",label:"Packing List"},{key:"certGrower",label:"Cert. Grower"},{key:"certPackHouse",label:"Cert. Pack House"},{key:"clientApproval",label:"Client Approval"},{key:"analisisResiduos",label:"Análisis de Residuos"},{key:"ppul",label:"PPUL"},{key:"sprayRecords",label:"Spray Records"}];

  const filtrado = data.filter(e=>(e.temporada===temporada)&&(!busq||e.contenedor?.toLowerCase().includes(busq.toLowerCase())||e.exportadora?.toLowerCase().includes(busq.toLowerCase())));
  const emb = detalle ? data.find(e=>e.id===detalle) : null;
  const upd = (f,v) => setData(prev=>prev.map(e=>e.id===detalle?{...e,[f]:v}:e));

  function guardar(){
    if(!form.contenedor){alert("N° contenedor obligatorio.");return;}
    setData(prev=>[...prev,{...form,id:`femb_${Date.now()}`,temporada}]);
    setForm(EMPTY);setModal(false);
  }

  if(emb) {
    const docsCompletos = DOCS_KEYS.slice(0,5).filter(d=>emb[d.key]).length;
    const docsTotales = 5;
    const TABS_EMB=[{id:"orden",label:"📋 Orden"},{id:"docs",label:`📄 Docs (${docsCompletos}/${docsTotales})`},{id:"tracking",label:"🚛 Tracking"},{id:"qc",label:"🔍 QC"}];
    return(
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <button onClick={()=>{setDetalle(null);setTab("orden");}} style={{background:"#21283b",border:"1px solid #30363d",borderRadius:8,padding:"6px 14px",cursor:"pointer",color:"#8b949e",fontSize:12}}>← Volver</button>
            <h3 style={{margin:0,color:"#e6edf3",fontSize:16}}>🚢 {emb.contenedor}</h3>
          </div>
          <div style={{display:"flex",gap:6}}>
            <span style={{fontSize:10,padding:"4px 12px",borderRadius:20,background:"#0ea5e922",color:"#0ea5e9",fontWeight:700}}>{emb.via}</span>
            <span style={{fontSize:10,padding:"4px 12px",borderRadius:20,background:emb.estado==="Llegado"||emb.estado==="Cerrado"?"#16a34a22":"#d9770622",color:emb.estado==="Llegado"||emb.estado==="Cerrado"?"#16a34a":"#d97706",fontWeight:700}}>{emb.estado}</span>
            {docsCompletos<docsTotales&&<span style={{fontSize:10,padding:"4px 12px",borderRadius:20,background:"#fef3c7",color:"#92400e",fontWeight:700}}>⚠️ {docsTotales-docsCompletos} docs faltan</span>}
          </div>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
          {TABS_EMB.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"8px 16px",borderRadius:8,border:tab===t.id?"2px solid #0ea5e9":"1px solid #30363d",background:tab===t.id?"#0ea5e9":"transparent",color:tab===t.id?"#fff":"#8b949e",cursor:"pointer",fontSize:12,fontWeight:700}}>{t.label}</button>)}
        </div>
        {tab==="orden"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
            {[["N° Contenedor","contenedor"],["Exportadora","exportadora"],["Cliente","cliente"],["Especie","especie"],["Destino","destino"],["Naviera","naviera"],["Booking","booking"]].map(([l,f])=>(
              <div key={f}><div style={lblSt}>{l}</div><input disabled={!can} value={emb[f]||""} onChange={e=>upd(f,e.target.value)} style={inputSt}/></div>))}
            <div><div style={lblSt}>Vía</div><select disabled={!can} value={emb.via||"Marítimo"} onChange={e=>upd("via",e.target.value)} style={inputSt}><option>Marítimo</option><option>Aéreo</option></select></div>
            <div><div style={lblSt}>Estado</div><select disabled={!can} value={emb.estado} onChange={e=>upd("estado",e.target.value)} style={inputSt}>{ESTADOS_EMB.map(s=><option key={s}>{s}</option>)}</select></div>
            <div><div style={lblSt}>ETD</div><DateInput disabled={!can} value={emb.etd||""} onChange={v=>upd("etd",v)} style={inputSt}/></div>
            <div><div style={lblSt}>ETA</div><DateInput disabled={!can} value={emb.eta||""} onChange={v=>upd("eta",v)} style={inputSt}/></div>
            <div style={{gridColumn:"1/-1"}}><div style={lblSt}>Notas</div><textarea disabled={!can} value={emb.notas||""} onChange={e=>upd("notas",e.target.value)} style={{...inputSt,minHeight:50}}/></div>
          </div>
        )}
        {tab==="docs"&&(
          <div>
            <div style={{fontSize:12,fontWeight:700,color:"#e6edf3",marginBottom:12}}>📄 Documentos del embarque</div>
            {DOCS_KEYS.map(d=>{
              const tiene = !!emb[d.key];
              return(
                <div key={d.key} style={{display:"flex",gap:10,alignItems:"center",padding:"8px 0",borderBottom:"1px solid #30363d22"}}>
                  <span style={{fontSize:14}}>{tiene?"✅":"⬜"}</span>
                  <span style={{fontSize:12,fontWeight:600,color:"#e6edf3",flex:1,minWidth:180}}>{d.label}</span>
                  <input disabled={!can} value={emb[d.key]||""} placeholder="N° o link..." onChange={e=>upd(d.key,e.target.value)}
                    style={{...inputSt,flex:2,maxWidth:300}}/>
                  {emb[d.key]&&emb[d.key].startsWith("http")&&<a href={emb[d.key]} target="_blank" rel="noopener noreferrer" style={{fontSize:12}}>📎</a>}
                </div>);
            })}
          </div>
        )}
        {tab==="tracking"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <div><div style={lblSt}>Fecha despacho</div><DateInput disabled={!can} value={emb.fechaDespacho||""} onChange={v=>upd("fechaDespacho",v)} style={inputSt}/></div>
            <div><div style={lblSt}>Puerto embarque</div><input disabled={!can} value={emb.puertoEmbarque||""} onChange={e=>upd("puertoEmbarque",e.target.value)} style={inputSt}/></div>
            <div><div style={lblSt}>Fecha llegada</div><DateInput disabled={!can} value={emb.fechaLlegada||""} onChange={v=>upd("fechaLlegada",v)} style={inputSt}/></div>
            <div><div style={lblSt}>Puerto destino</div><input disabled={!can} value={emb.puertoDestino||""} onChange={e=>upd("puertoDestino",e.target.value)} style={inputSt}/></div>
            <div style={{gridColumn:"1/-1"}}><div style={lblSt}>Loading Update</div><textarea disabled={!can} value={emb.loadingUpdate||""} onChange={e=>upd("loadingUpdate",e.target.value)} placeholder="Actualización de carga para el cliente..." style={{...inputSt,minHeight:60}}/></div>
          </div>
        )}
        {tab==="qc"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <div><div style={lblSt}>QC Origen</div><textarea disabled={!can} value={emb.qcOrigen||""} onChange={e=>upd("qcOrigen",e.target.value)} style={{...inputSt,minHeight:60}}/></div>
            <div><div style={lblSt}>QC Destino</div><textarea disabled={!can} value={emb.qcDestino||""} onChange={e=>upd("qcDestino",e.target.value)} style={{...inputSt,minHeight:60}}/></div>
            <div style={{gridColumn:"1/-1"}}><div style={lblSt}>Advance Request</div><textarea disabled={!can} value={emb.advanceRequest||""} onChange={e=>upd("advanceRequest",e.target.value)} placeholder="Solicitud de advance para cliente × exportadora..." style={{...inputSt,minHeight:50}}/></div>
          </div>
        )}
      </div>
    );
  }

  return(
    <div>
      <div style={{display:"flex",gap:12,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <input value={busq} onChange={e=>setBusq(e.target.value)} placeholder="🔍 Buscar embarque..." style={{...inputSt,flex:1,minWidth:200}}/>
        {can&&<button onClick={()=>{setForm({...EMPTY,temporada});setModal(true);}} style={{background:"#0ea5e9",color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Nuevo Embarque</button>}
      </div>
      <div style={{overflowX:"auto",borderRadius:10,border:"1px solid #30363d"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr style={{background:"#161b22"}}>{["Contenedor","Exportadora","Cliente","Especie","Destino","Vía","Estado","Docs",""].map(h=><th key={h} style={{padding:"6px 10px",textAlign:"left",color:"#8b949e",fontWeight:700,fontSize:10}}>{h}</th>)}</tr></thead>
          <tbody>{filtrado.map(e=>{
            const docs=DOCS_KEYS.slice(0,5).filter(d=>e[d.key]).length;
            return(
            <tr key={e.id} onClick={()=>setDetalle(e.id)} style={{borderBottom:"1px solid #30363d22",cursor:"pointer"}} onMouseEnter={ev=>ev.currentTarget.style.background="#0ea5e911"} onMouseLeave={ev=>ev.currentTarget.style.background="transparent"}>
              <td style={{padding:"6px 10px",fontWeight:700,color:"#e6edf3",fontFamily:"monospace"}}>{e.contenedor}</td>
              <td style={{padding:"6px 10px",color:"#8b949e"}}>{e.exportadora||"—"}</td>
              <td style={{padding:"6px 10px",color:"#8b949e"}}>{e.cliente||"—"}</td>
              <td style={{padding:"6px 10px"}}><span style={{fontSize:9,background:"#0ea5e922",color:"#0ea5e9",padding:"1px 6px",borderRadius:10,fontWeight:600}}>{e.especie}</span></td>
              <td style={{padding:"6px 10px",color:"#8b949e"}}>{e.destino||"—"}</td>
              <td style={{padding:"6px 10px"}}><span style={{fontSize:9,padding:"2px 6px",borderRadius:8,background:e.via==="Aéreo"?"#d9770622":"#0ea5e922",color:e.via==="Aéreo"?"#d97706":"#0ea5e9"}}>{e.via}</span></td>
              <td style={{padding:"6px 10px"}}><span style={{fontSize:9,padding:"2px 8px",borderRadius:10,fontWeight:700,background:e.estado==="Llegado"||e.estado==="Cerrado"?"#16a34a22":"#d9770622",color:e.estado==="Llegado"||e.estado==="Cerrado"?"#16a34a":"#d97706"}}>{e.estado}</span></td>
              <td style={{padding:"6px 10px"}}><span style={{fontSize:9,fontWeight:700,color:docs===5?"#16a34a":"#d97706"}}>{docs}/5</span></td>
              <td style={{padding:"6px 10px",color:"#0ea5e9",fontWeight:700}}>Ver →</td>
            </tr>);})}
            {filtrado.length===0&&<tr><td colSpan={9} style={{padding:30,textAlign:"center",color:"#484f58"}}>Sin embarques</td></tr>}
          </tbody>
        </table>
      </div>
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setModal(false)}>
          <div style={{background:"#1c2333",borderRadius:14,padding:24,maxWidth:520,width:"100%",border:"1px solid #30363d"}} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:"0 0 16px",color:"#e6edf3"}}>Nuevo Embarque</h3>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {[["N° Contenedor *","contenedor"],["Exportadora","exportadora"],["Cliente","cliente"],["Especie","especie"],["Destino","destino"]].map(([l,f])=>(
                <div key={f}><div style={lblSt}>{l}</div><input value={form[f]||""} onChange={e=>setForm(p=>({...p,[f]:e.target.value}))} style={inputSt}/></div>))}
              <div><div style={lblSt}>Vía</div><select value={form.via} onChange={e=>setForm(p=>({...p,via:e.target.value}))} style={inputSt}><option>Marítimo</option><option>Aéreo</option></select></div>
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
              <button onClick={()=>setModal(false)} style={{padding:"8px 18px",borderRadius:8,border:"1px solid #30363d",background:"transparent",color:"#8b949e",cursor:"pointer"}}>Cancelar</button>
              <button onClick={guardar} style={{padding:"8px 18px",borderRadius:8,border:"none",background:"#0ea5e9",color:"#fff",cursor:"pointer",fontWeight:700}}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// LIQUIDACIONES & COBROS
// ═══════════════════════════════════════════════════════════════════
function LiquidacionesCobrosModule({data, setData, cobros, setCobros, embarques, can, temporada}) {
  const [tab, setTab] = useState("liquidaciones");
  const [modal, setModal] = useState(false);
  const [modalType, setModalType] = useState("liq");
  const [form, setForm] = useState({});

  const TABS=[{id:"liquidaciones",label:"💰 Liquidaciones"},{id:"cobros",label:"📥 Cobros Comisión"}];

  function guardarLiq(){
    const emb=(embarques||[]).find(e=>e.id===form.embarqueId);
    if(!emb){alert("Selecciona un embarque.");return;}
    setData(prev=>[...prev,{...form,id:`fliq_${Date.now()}`,temporada,contenedor:emb.contenedor,exportadora:emb.exportadora,cliente:emb.cliente,fechaCreacion:new Date().toISOString().slice(0,10)}]);
    setForm({});setModal(false);
  }
  function guardarCobro(){
    if(!form.concepto){alert("Concepto obligatorio.");return;}
    setCobros(prev=>[...prev,{...form,id:`fcob_${Date.now()}`,temporada,fechaCreacion:new Date().toISOString().slice(0,10)}]);
    setForm({});setModal(false);
  }

  return(
    <div>
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
        {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"8px 16px",borderRadius:8,border:tab===t.id?"2px solid #d97706":"1px solid #30363d",background:tab===t.id?"#d97706":"transparent",color:tab===t.id?"#fff":"#8b949e",cursor:"pointer",fontSize:12,fontWeight:700}}>{t.label}</button>)}
      </div>

      {tab==="liquidaciones"&&(
        <div>
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
            {can&&<button onClick={()=>{setModalType("liq");setForm({embarqueId:"",montoVentaUSD:0,comisionPct:0,montoComision:0,estado:"Pendiente",observaciones:""});setModal(true);}} style={{background:"#d97706",color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Nueva Liquidación</button>}
          </div>
          <div style={{overflowX:"auto",borderRadius:10,border:"1px solid #30363d"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead><tr style={{background:"#161b22"}}>{["Fecha","Contenedor","Cliente","Exportadora","Venta USD","Comisión %","Comisión USD","Estado"].map(h=><th key={h} style={{padding:"6px 10px",textAlign:"left",color:"#8b949e",fontWeight:700,fontSize:10}}>{h}</th>)}</tr></thead>
              <tbody>{(data||[]).filter(l=>l.temporada===temporada).map(l=>(
                <tr key={l.id} style={{borderBottom:"1px solid #30363d22"}}>
                  <td style={{padding:"6px 10px",color:"#8b949e"}}>{l.fechaCreacion}</td>
                  <td style={{padding:"6px 10px",fontWeight:700,color:"#e6edf3"}}>{l.contenedor}</td>
                  <td style={{padding:"6px 10px",color:"#8b949e"}}>{l.cliente||"—"}</td>
                  <td style={{padding:"6px 10px",color:"#8b949e"}}>{l.exportadora||"—"}</td>
                  <td style={{padding:"6px 10px",fontWeight:700,color:"#16a34a"}}>USD {(parseFloat(l.montoVentaUSD)||0).toLocaleString()}</td>
                  <td style={{padding:"6px 10px"}}>{l.comisionPct||0}%</td>
                  <td style={{padding:"6px 10px",fontWeight:700,color:"#d97706"}}>USD {(parseFloat(l.montoComision)||0).toLocaleString()}</td>
                  <td style={{padding:"6px 10px"}}><select disabled={!can} value={l.estado||"Pendiente"} onChange={e=>setData(prev=>prev.map(x=>x.id===l.id?{...x,estado:e.target.value}:x))} style={{padding:"3px 6px",borderRadius:4,border:"1px solid #30363d",fontSize:10,background:"#21283b",color:"#e6edf3"}}><option>Pendiente</option><option>Liquidada</option><option>Cobrada</option><option>Pagada</option></select></td>
                </tr>))}
                {(data||[]).filter(l=>l.temporada===temporada).length===0&&<tr><td colSpan={8} style={{padding:30,textAlign:"center",color:"#484f58"}}>Sin liquidaciones</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab==="cobros"&&(
        <div>
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
            {can&&<button onClick={()=>{setModalType("cobro");setForm({concepto:"",montoUSD:0,nFactura:"",fechaCobro:"",estado:"Pendiente",observaciones:""});setModal(true);}} style={{background:"#16a34a",color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Nuevo Cobro</button>}
          </div>
          <div style={{overflowX:"auto",borderRadius:10,border:"1px solid #30363d"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead><tr style={{background:"#161b22"}}>{["Fecha","Concepto","Monto USD","N° Factura","Estado",""].map(h=><th key={h} style={{padding:"6px 10px",textAlign:"left",color:"#8b949e",fontWeight:700,fontSize:10}}>{h}</th>)}</tr></thead>
              <tbody>{(cobros||[]).filter(c=>c.temporada===temporada).map(c=>(
                <tr key={c.id} style={{borderBottom:"1px solid #30363d22"}}>
                  <td style={{padding:"6px 10px",color:"#8b949e"}}>{c.fechaCreacion}</td>
                  <td style={{padding:"6px 10px",fontWeight:600,color:"#e6edf3"}}>{c.concepto}</td>
                  <td style={{padding:"6px 10px",fontWeight:700,color:"#16a34a"}}>USD {(parseFloat(c.montoUSD)||0).toLocaleString()}</td>
                  <td style={{padding:"6px 10px",color:"#8b949e"}}>{c.nFactura||"—"}</td>
                  <td style={{padding:"6px 10px"}}><select disabled={!can} value={c.estado} onChange={e=>setCobros(prev=>prev.map(x=>x.id===c.id?{...x,estado:e.target.value}:x))} style={{padding:"3px 6px",borderRadius:4,border:"1px solid #30363d",fontSize:10,background:"#21283b",color:"#e6edf3"}}><option>Pendiente</option><option>Facturado</option><option>Cobrado</option><option>Pagado</option></select></td>
                  <td style={{padding:"6px 10px"}}>{can&&<button onClick={()=>{if(window.confirm("¿Eliminar?"))setCobros(prev=>prev.filter(x=>x.id!==c.id));}} style={{background:"#fef2f2",border:"none",borderRadius:4,padding:"3px 6px",cursor:"pointer",fontSize:10,color:"#991b1b"}}>🗑</button>}</td>
                </tr>))}
                {(cobros||[]).filter(c=>c.temporada===temporada).length===0&&<tr><td colSpan={6} style={{padding:30,textAlign:"center",color:"#484f58"}}>Sin cobros</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setModal(false)}>
          <div style={{background:"#1c2333",borderRadius:14,padding:24,maxWidth:480,width:"100%",border:"1px solid #30363d"}} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:"0 0 16px",color:"#e6edf3"}}>{modalType==="liq"?"Nueva Liquidación":"Nuevo Cobro"}</h3>
            {modalType==="liq"?(
              <div style={{display:"grid",gap:12}}>
                <div><div style={lblSt}>Embarque *</div><select value={form.embarqueId||""} onChange={e=>setForm(p=>({...p,embarqueId:e.target.value}))} style={inputSt}><option value="">—</option>{(embarques||[]).filter(e=>e.temporada===temporada).map(e=><option key={e.id} value={e.id}>{e.contenedor} — {e.cliente} / {e.exportadora}</option>)}</select></div>
                <div><div style={lblSt}>Monto venta USD</div><input type="number" value={form.montoVentaUSD||""} onChange={e=>{const v=parseFloat(e.target.value)||0;setForm(p=>({...p,montoVentaUSD:v,montoComision:Math.round(v*(p.comisionPct||0)/100*100)/100}));}} style={inputSt}/></div>
                <div><div style={lblSt}>Comisión %</div><input type="number" step="0.1" value={form.comisionPct||""} onChange={e=>{const p2=parseFloat(e.target.value)||0;setForm(p=>({...p,comisionPct:p2,montoComision:Math.round((p.montoVentaUSD||0)*p2/100*100)/100}));}} style={inputSt}/></div>
                <div><div style={lblSt}>Comisión USD (automático)</div><input disabled value={form.montoComision||0} style={{...inputSt,fontWeight:700,color:"#d97706"}}/></div>
              </div>
            ):(
              <div style={{display:"grid",gap:12}}>
                <div><div style={lblSt}>Concepto *</div><input value={form.concepto||""} onChange={e=>setForm(p=>({...p,concepto:e.target.value}))} placeholder="Cobro comisión embarque X..." style={inputSt}/></div>
                <div><div style={lblSt}>Monto USD</div><input type="number" value={form.montoUSD||""} onChange={e=>setForm(p=>({...p,montoUSD:parseFloat(e.target.value)||0}))} style={inputSt}/></div>
                <div><div style={lblSt}>N° Factura</div><input value={form.nFactura||""} onChange={e=>setForm(p=>({...p,nFactura:e.target.value}))} style={inputSt}/></div>
              </div>
            )}
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
              <button onClick={()=>setModal(false)} style={{padding:"8px 18px",borderRadius:8,border:"1px solid #30363d",background:"transparent",color:"#8b949e",cursor:"pointer"}}>Cancelar</button>
              <button onClick={modalType==="liq"?guardarLiq:guardarCobro} style={{padding:"8px 18px",borderRadius:8,border:"none",background:modalType==="liq"?"#d97706":"#16a34a",color:"#fff",cursor:"pointer",fontWeight:700}}>Guardar</button>
            </div>
          </div>
        </div>
      )}
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
  if(subApp) {
    const sa = SUBAPPS.find(s=>s.id===subApp);
    return (
    <div style={{fontFamily:"sans-serif",background:C.bg,minHeight:"100vh",color:C.text,padding:"20px 20px 40px"}}>
      {/* NavBar breadcrumbs — superior izquierda */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20,flexWrap:"wrap"}}>
        <button onClick={onBack} style={{background:C.card2,border:`1px solid ${C.border}`,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:600,color:C.muted}}>Mediterra</button>
        <span style={{color:C.muted2}}>›</span>
        <button onClick={()=>setSubApp(null)} style={{background:C.card2,border:`1px solid ${C.border}`,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:600,color:C.muted}}>Frisku Foods</button>
        <span style={{color:C.muted2}}>›</span>
        <span style={{fontSize:12,fontWeight:700,color:C.text,padding:"7px 14px",background:`${sa?.color||C.blue}22`,borderRadius:8}}>{sa?.label||subApp}</span>
        <div style={{flex:1}}/>
        <FriskuLogo height={28}/>
        <select value={tempSeleccionada} onChange={e=>setTempSeleccionada(e.target.value)}
          style={{padding:"6px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:11}}>
          {generarTemporadas().map(t=><option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={onLogout} style={{background:C.accent,color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12}}>Salir</button>
      </div>
      <Card>
          {subApp==="clientes"&&<ClientesModule data={data.clientes||[]} setData={setClientes} can={can}/>}
          {subApp==="exportadoras"&&<ExportadorasModule data={data.exportadoras||[]} setData={setExportadoras} can={can}/>}
          {subApp==="contratos"&&<BusinessClosureModule data={data.contratos||[]} setData={setContratos} clientes={data.clientes||[]} exportadoras={data.exportadoras||[]} can={can} temporada={tempSeleccionada}/>}
          {subApp==="programa"&&<PlaceholderModule icon="📊" title="Programa & Loading" desc="Gestión del programa por temporada. Carga semanal, loading update, informe a cliente."/>}
          {subApp==="embarques"&&<EmbarquesCOMEXModule data={data.embarques||[]} setData={setEmbarques} clientes={data.clientes||[]} exportadoras={data.exportadoras||[]} contratos={data.contratos||[]} can={can} temporada={tempSeleccionada}/>}
          {subApp==="qc"&&<PlaceholderModule icon="🔍" title="QC & Procedimientos" desc="QC origen (envío a las partes), QC destino, verificación LMR, homologación productores, procedimientos por cliente."/>}
          {subApp==="liquidaciones"&&<LiquidacionesCobrosModule data={data.liquidaciones||[]} setData={setLiquidaciones} cobros={data.cobros||[]} setCobros={setCobros} embarques={data.embarques||[]} can={can} temporada={tempSeleccionada}/>}
          {subApp==="informes"&&<PlaceholderModule icon="📈" title="Informes & Reportes" desc="Reporte de mercado, shipping summary, informe carga semanal, real vs proyectado."/>}
          {subApp==="maestros"&&<PlaceholderModule icon="⚙️" title="Maestros & Alarmas" desc="Contactos exportadoras, fichas, listado no contactar, correos para reportes, control productores. Alarmas: docs pendientes, pagos, QC."/>}
      </Card>
    </div>
    );
  }

  // Hub principal
  return (
    <div style={{fontFamily:"sans-serif",background:C.bg,minHeight:"100vh",color:C.text}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 24px",background:C.card,borderBottom:`1px solid ${C.border}`,flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={onBack} style={{background:C.card2,color:C.muted,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12}}>← Mediterra</button>
          <span style={{fontSize:14,fontWeight:700,color:C.text}}>Frisku Foods Hub</span>
          <FriskuLogo height={28}/>
        </div>
        <div style={{display:"flex",gap:8}}>
          <select value={tempSeleccionada} onChange={e=>setTempSeleccionada(e.target.value)}
            style={{padding:"6px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:11}}>
            {generarTemporadas().map(t=><option key={t} value={t}>{t}</option>)}
          </select>
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
