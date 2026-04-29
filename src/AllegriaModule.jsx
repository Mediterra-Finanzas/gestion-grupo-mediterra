/* eslint-disable */
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";

// ═══════════════════════════════════════════════════════════════════
// ALLEGRIA FOODS — Hub de Exportación de Fruta Fresca
// Módulos: Clientes, Productores, Embarques, Liquidaciones, Anticipos, Cobranza
// ═══════════════════════════════════════════════════════════════════

const SUPA_URL = "https://bywovqayuzodbzwsriet.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5d292cWF5dXpvZGJ6d3NyaWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODU1MDgsImV4cCI6MjA5MTI2MTUwOH0.s2x2O_CxE6rl8dBqFuyfQdMyRqSyjJQWXJXesmVGXtk";

// Colores
const C = {
  bg: "#0d1117", bg2: "#161b22", card: "#1c2333", card2: "#21283b",
  border: "#30363d", border2: "#484f58", text: "#e6edf3", muted: "#8b949e", muted2: "#484f58",
  accent: "#b91c1c", accentL: "#ef4444", red: "#ef4444", green: "#16a34a", yellow: "#f59e0b",
  blue: "#3b82f6", teal: "#0f766e", sl: "#e6edf3", gris: "#8b949e",
  verdeBg: "#dcfce7", verde: "#16a34a", amBg: "#fef3c7", am: "#d97706",
  azulBg: "#dbeafe", azul: "#3b82f6", grisBg: "#f1f5f9",
};

const FRUTAS = ["Cerezas", "Ciruelas", "Arándanos"];
const ORIGENES = ["Chile", "Perú"];
const DESTINOS = ["China", "Hong Kong", "Taiwán", "Tailandia", "Corea del Sur", "EE.UU.", "Europa", "Medio Oriente", "India", "Otro"];
const MONEDAS = ["USD", "EUR", "CLP"];
const TEMPORADAS = (() => {
  const arr = [];
  for (let y = 2024; y <= 2035; y++) arr.push(`${y}/${y+1}`);
  return arr;
})(); // ["2024/2025", ..., "2035/2036"]
const ESTADOS_EMBARQUE = ["Programado", "En tránsito", "En destino", "Entregado", "Liquidado"];
const ESTADOS_PAGO = ["Pendiente", "Parcial", "Pagado"];

// Temporada actual: Jul-Jun (si estamos en Abr 2026 → temporada 2025/2026)
function temporadaActual() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0=ene
  return m >= 6 ? `${y}/${y+1}` : `${y-1}/${y}`;
}

// Rango de fechas de una temporada: "2025/2026" → { inicio: 2025-07-01, fin: 2026-06-30 }
function rangoTemporada(temp) {
  if (!temp || !temp.includes("/")) return null;
  const [a1, a2] = temp.split("/").map(Number);
  return {
    inicio: new Date(a1, 6, 1),  // 01-Jul
    fin: new Date(a2, 5, 30, 23, 59, 59), // 30-Jun
    inicioStr: `${a1}-07-01`,
    finStr: `${a2}-06-30`,
  };
}

// Validar si una fecha cae dentro de una temporada
function fechaEnTemporada(fechaStr, temp) {
  if (!fechaStr || !temp) return true; // si no hay fecha, no validar
  const rango = rangoTemporada(temp);
  if (!rango) return true;
  const f = new Date(fechaStr + "T00:00:00");
  return f >= rango.inicio && f <= rango.fin;
}

// Detectar temporada de una fecha
function detectarTemporada(fechaStr) {
  if (!fechaStr) return temporadaActual();
  const f = new Date(fechaStr + "T00:00:00");
  const y = f.getFullYear();
  const m = f.getMonth();
  return m >= 6 ? `${y}/${y+1}` : `${y-1}/${y}`;
}

// ── Supabase Load/Save ──
async function dbLoadAllegria() {
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/calendario_data?id=eq.allegria&select=value`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
    });
    const data = await res.json();
    return data?.[0]?.value ? (typeof data[0].value === "string" ? JSON.parse(data[0].value) : data[0].value) : null;
  } catch { return null; }
}

async function dbSaveAllegria(value) {
  try {
    // Protección anti-pérdida
    if(value) {
      const keys = ["clientes","productores","embarques","liquidaciones","liqCliente","anticipos","cobranza"];
      for(const k of keys) {
        const nc = Array.isArray(value[k]) ? value[k].length : -1;
        const pc = window._lastSavedAllegria?.[k] || 0;
        if(nc >= 0 && nc < pc) {
          console.warn(`[dbSaveAllegria] ⚠️ BLOQUEADO: ${k} pasó de ${pc} a ${nc}. Posible pérdida.`);
          return;
        }
      }
      if(!window._lastSavedAllegria) window._lastSavedAllegria = {};
      for(const k of keys) { if(Array.isArray(value[k]) && value[k].length > 0) window._lastSavedAllegria[k] = value[k].length; }
    }
    await fetch(`${SUPA_URL}/rest/v1/calendario_data`, {
      method: "POST",
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`,
        "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ id: "allegria", value, updated_at: new Date().toISOString() })
    });
  } catch(e) { console.error("Error guardando Allegria:", e); }
}

// ── Componentes compartidos ──
function NavBar({breadcrumbItems=[], onLogout}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20,flexWrap:"wrap"}}>
      {breadcrumbItems.map((item,i)=>(
        <React.Fragment key={i}>
          {i>0&&<span style={{color:C.muted}}>›</span>}
          {item.onClick
            ? <button onClick={item.onClick} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:13,fontWeight:500,padding:0}}>{item.label}</button>
            : <span style={{color:C.text,fontWeight:700,fontSize:14}}>{item.label}</span>}
        </React.Fragment>
      ))}
      {onLogout&&<button onClick={onLogout} style={{marginLeft:"auto",background:"rgba(248,113,113,0.2)",border:"none",color:"#fca5a5",borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:12}}>Salir</button>}
    </div>
  );
}

function Card({children, style={}}) {
  return <div style={{background:C.card,borderRadius:14,padding:20,border:`1px solid ${C.border}`,marginBottom:16,boxShadow:"0 2px 10px #0001",...style}}>{children}</div>;
}

function KPI({label, value, color=C.green, sub=""}) {
  return (
    <div style={{background:C.card2,borderRadius:10,padding:"12px 16px",border:`1px solid ${C.border}`,borderLeft:`4px solid ${color}`,flex:1,minWidth:140}}>
      <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:4}}>{label}</div>
      <div style={{fontSize:20,fontWeight:900,color}}>{value}</div>
      {sub&&<div style={{fontSize:10,color:C.muted,marginTop:2}}>{sub}</div>}
    </div>
  );
}

const $$=(v)=>{
  if(v==null||isNaN(v))return "—";
  const abs=Math.abs(Math.round(v));
  return `${v<0?"-":""}US$${abs.toLocaleString("es-CL")}`;
};

// Logo Allegria Foods — incrustado como base64
const ALLEGRIA_LOGO = "data:image/jpeg;base64,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AAAAAAAAAAAAAAAKZy5gpnLAuYABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAApnLmCmcsDs3Cjz26c+aaL2I4Uee3TnzTRexAKHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYnGQAP//Z";
window._ALLEGRIA_LOGO_B64 = ALLEGRIA_LOGO;
function AllegriaLogo({height=52}) {
  return (
    <img src={ALLEGRIA_LOGO} alt="Allegria Foods"
      style={{height, objectFit:"contain", display:"block"}}/>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CLIENTES IMPORTADORES
// ═══════════════════════════════════════════════════════════════════
const FORM_CLI_VACIO = {razonSocial:"",nombreComercial:"",direccion:"",ciudad:"",pais:"",contactoNombre:"",contactoEmail:"",notifys:[{nombre:"",direccion:""}],consignatarios:[{nombre:"",direccion:""}],frutas:[],notas:""};

function ClientesModule({data, setData, can}) {
  const [busq, setBusq] = useState("");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({...FORM_CLI_VACIO});
  const [editId, setEditId] = useState(null);
  const [detalle, setDetalle] = useState(null); // id del cliente para ver detalle

  const filtrado = data.filter(c=>!busq||
    c.razonSocial?.toLowerCase().includes(busq.toLowerCase())||
    c.nombreComercial?.toLowerCase().includes(busq.toLowerCase())||
    c.nombre?.toLowerCase().includes(busq.toLowerCase())|| // retrocompat
    c.pais?.toLowerCase().includes(busq.toLowerCase()));

  function guardar() {
    if(!form.razonSocial.trim()&&!form.nombreComercial.trim()){alert("Razón Social o Nombre Comercial es obligatorio.");return;}
    // Limpiar notifys/consignatarios vacíos
    const clean = {...form,
      notifys:(form.notifys||[]).filter(n=>n.nombre.trim()||n.direccion.trim()),
      consignatarios:(form.consignatarios||[]).filter(n=>n.nombre.trim()||n.direccion.trim()),
    };
    if(editId) {
      setData(prev=>prev.map(c=>c.id===editId?{...c,...clean}:c));
      window.auditLog&&window.auditLog("editar",{modulo:"allegria",seccion:"Clientes",descripcion:`Editó cliente "${clean.nombreComercial||clean.razonSocial}"`,registroId:editId});
    } else {
      const id=`acli_${Date.now()}`;
      setData(prev=>[...prev,{...clean,id}]);
      window.auditLog&&window.auditLog("crear",{modulo:"allegria",seccion:"Clientes",descripcion:`Creó cliente "${clean.nombreComercial||clean.razonSocial}" · ${clean.pais}`,registroId:id});
    }
    setForm({...FORM_CLI_VACIO});setModal(false);setEditId(null);
  }

  function editarCliente(c) {
    setEditId(c.id);
    setForm({
      razonSocial:c.razonSocial||c.nombre||"",
      nombreComercial:c.nombreComercial||"",
      direccion:c.direccion||"",
      ciudad:c.ciudad||"",
      pais:c.pais||"",
      contactoNombre:c.contactoNombre||c.contacto||"",
      contactoEmail:c.contactoEmail||c.email||"",
      notifys:c.notifys?.length>0?c.notifys:[{nombre:"",direccion:""}],
      consignatarios:c.consignatarios?.length>0?c.consignatarios:[{nombre:"",direccion:""}],
      frutas:c.frutas||[],
      notas:c.notas||"",
    });
    setModal(true);
  }

  // Helpers para listas dinámicas
  function updList(field, idx, key, val) {
    setForm(p=>{
      const arr=[...(p[field]||[])];
      arr[idx]={...arr[idx],[key]:val};
      return {...p,[field]:arr};
    });
  }
  function addList(field) { setForm(p=>({...p,[field]:[...(p[field]||[]),{nombre:"",direccion:""}]})); }
  function removeList(field, idx) { setForm(p=>({...p,[field]:(p[field]||[]).filter((_,i)=>i!==idx)})); }

  const inputSt = {width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,outline:"none",boxSizing:"border-box"};

  // Vista detalle
  if(detalle) {
    const c = data.find(x=>x.id===detalle);
    if(!c) { setDetalle(null); return null; }
    return (
      <div>
        <button onClick={()=>setDetalle(null)} style={{background:C.card2,border:`1px solid ${C.border}`,color:C.muted,borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12,marginBottom:16}}>← Volver a lista</button>
        <Card>
          <div style={{display:"flex",alignItems:"flex-start",gap:16}}>
            <div style={{width:56,height:56,borderRadius:"50%",background:`${C.accent}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,flexShrink:0}}>🏢</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:900,fontSize:18,color:C.text}}>{c.nombreComercial||c.razonSocial||c.nombre}</div>
              {c.razonSocial&&c.nombreComercial&&<div style={{fontSize:12,color:C.muted,marginTop:2}}>Razón Social: {c.razonSocial}</div>}
              <div style={{fontSize:12,color:C.muted,marginTop:4}}>{c.direccion?`${c.direccion} · `:""}{c.ciudad?`${c.ciudad} · `:""}{c.pais||""}</div>
              <div style={{fontSize:12,color:C.muted,marginTop:6}}>👤 {c.contactoNombre||c.contacto||"—"} · {c.contactoEmail||c.email||"—"}</div>
              {c.frutas?.length>0&&<div style={{display:"flex",gap:4,marginTop:8,flexWrap:"wrap"}}>{c.frutas.map(f=><span key={f} style={{fontSize:10,background:`${C.accent}22`,color:C.accentL,padding:"2px 10px",borderRadius:12,fontWeight:600}}>{f}</span>)}</div>}
            </div>
            {can&&<button onClick={()=>editarCliente(c)} style={{background:C.accent,border:"none",color:"#fff",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>✏️ Editar</button>}
          </div>
        </Card>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginTop:4}}>
          <Card>
            <div style={{fontSize:11,color:C.muted,fontWeight:700,marginBottom:10}}>📋 NOTIFY</div>
            {(c.notifys||[]).length===0?<div style={{color:C.muted2,fontSize:12}}>Sin notify registrados</div>:
              (c.notifys||[]).map((n,i)=>(
                <div key={i} style={{padding:"8px 0",borderBottom:i<(c.notifys||[]).length-1?`1px solid ${C.border}22`:"none"}}>
                  <div style={{fontWeight:600,fontSize:13,color:C.text}}>{n.nombre||"—"}</div>
                  <div style={{fontSize:11,color:C.muted}}>{n.direccion||"—"}</div>
                </div>
              ))}
          </Card>
          <Card>
            <div style={{fontSize:11,color:C.muted,fontWeight:700,marginBottom:10}}>🚢 CONSIGNATARIOS</div>
            {(c.consignatarios||[]).length===0?<div style={{color:C.muted2,fontSize:12}}>Sin consignatarios registrados</div>:
              (c.consignatarios||[]).map((n,i)=>(
                <div key={i} style={{padding:"8px 0",borderBottom:i<(c.consignatarios||[]).length-1?`1px solid ${C.border}22`:"none"}}>
                  <div style={{fontWeight:600,fontSize:13,color:C.text}}>{n.nombre||"—"}</div>
                  <div style={{fontSize:11,color:C.muted}}>{n.direccion||"—"}</div>
                </div>
              ))}
          </Card>
        </div>
        {c.notas&&<Card><div style={{fontSize:11,color:C.muted,fontWeight:700,marginBottom:6}}>📝 NOTAS</div><div style={{fontSize:12,color:C.text}}>{c.notas}</div></Card>}
      </div>
    );
  }

  return (
    <div>
      <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
        <input value={busq} onChange={e=>setBusq(e.target.value)} placeholder="🔍 Buscar cliente..." style={{padding:"8px 14px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,outline:"none",flex:1,minWidth:200}}/>
        {can&&<button onClick={()=>{setModal(true);setEditId(null);setForm({...FORM_CLI_VACIO});}} style={{background:C.accent,color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Nuevo Cliente</button>}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:12}}>
        {filtrado.map(c=>(
          <Card key={c.id}>
            <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
              <div onClick={()=>setDetalle(c.id)} style={{width:44,height:44,borderRadius:"50%",background:`${C.accent}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0,cursor:"pointer"}}>🏢</div>
              <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>setDetalle(c.id)}>
                <div style={{fontWeight:800,fontSize:14,color:C.text}}>{c.nombreComercial||c.razonSocial||c.nombre||"—"}</div>
                {c.razonSocial&&c.nombreComercial&&<div style={{fontSize:10,color:C.muted}}>{c.razonSocial}</div>}
                <div style={{fontSize:11,color:C.muted}}>{c.pais}{c.ciudad?` · ${c.ciudad}`:""}</div>
                {(c.contactoNombre||c.contacto)&&<div style={{fontSize:11,color:C.muted,marginTop:4}}>👤 {c.contactoNombre||c.contacto} {c.contactoEmail||c.email?`· ${c.contactoEmail||c.email}`:""}</div>}
                <div style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap"}}>
                  {(c.frutas||[]).map(f=><span key={f} style={{fontSize:9,background:`${C.accent}22`,color:C.accentL,padding:"2px 8px",borderRadius:12,fontWeight:600}}>{f}</span>)}
                  {(c.notifys||[]).length>0&&<span style={{fontSize:9,background:`${C.blue}22`,color:C.blue,padding:"2px 8px",borderRadius:12,fontWeight:600}}>{(c.notifys||[]).length} notify</span>}
                  {(c.consignatarios||[]).length>0&&<span style={{fontSize:9,background:`${C.teal}22`,color:C.teal,padding:"2px 8px",borderRadius:12,fontWeight:600}}>{(c.consignatarios||[]).length} consig.</span>}
                </div>
              </div>
              {can&&<button onClick={()=>editarCliente(c)} style={{background:C.card2,border:`1px solid ${C.border}`,color:C.muted,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11}}>✏️</button>}
            </div>
          </Card>
        ))}
        {filtrado.length===0&&<div style={{padding:40,textAlign:"center",color:C.muted2,gridColumn:"1/-1"}}>Sin clientes registrados</div>}
      </div>

      {/* Modal */}
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setModal(false)}>
          <div style={{background:C.card,borderRadius:14,padding:24,maxWidth:580,width:"100%",border:`1px solid ${C.border}`,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:"0 0 16px",color:C.text}}>{editId?"Editar Cliente":"Nuevo Cliente Importador"}</h3>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {[["Razón Social *","razonSocial"],["Nombre Comercial","nombreComercial"],["Dirección","direccion"],["Ciudad","ciudad"],["País","pais"],["Contacto Nombre","contactoNombre"],["Contacto Email","contactoEmail"]].map(([l,f])=>(
                <div key={f} style={f==="direccion"?{gridColumn:"1/-1"}:{}}><div style={{fontSize:10,color:C.muted,marginBottom:4}}>{l}</div>
                  <input value={form[f]||""} onChange={e=>setForm(p=>({...p,[f]:e.target.value}))} placeholder={f==="nombreComercial"?"Ej: Nongfu":""} style={inputSt}/></div>
              ))}
            </div>

            {/* Frutas */}
            <div style={{marginTop:14}}>
              <div style={{fontSize:10,color:C.muted,marginBottom:4}}>Frutas</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {FRUTAS.map(f=>(
                  <button key={f} onClick={()=>setForm(p=>({...p,frutas:p.frutas?.includes(f)?p.frutas.filter(x=>x!==f):[...(p.frutas||[]),f]}))}
                    style={{padding:"4px 12px",borderRadius:20,border:`1px solid ${form.frutas?.includes(f)?C.accent:C.border}`,
                      background:form.frutas?.includes(f)?`${C.accent}22`:"transparent",color:form.frutas?.includes(f)?C.accentL:C.muted,
                      cursor:"pointer",fontSize:11,fontWeight:600}}>{f}</button>
                ))}
              </div>
            </div>

            {/* Notify — lista dinámica */}
            <div style={{marginTop:14,padding:"12px 14px",background:C.bg2,borderRadius:10,border:`1px solid ${C.border}`}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <div style={{fontSize:11,color:C.blue,fontWeight:700}}>📋 Notify</div>
                <button onClick={()=>addList("notifys")} style={{background:`${C.blue}22`,border:`1px solid ${C.blue}44`,color:C.blue,borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>+ Agregar</button>
              </div>
              {(form.notifys||[]).map((n,i)=>(
                <div key={i} style={{display:"flex",gap:8,marginBottom:6,alignItems:"center"}}>
                  <input value={n.nombre} onChange={e=>updList("notifys",i,"nombre",e.target.value)} placeholder="Nombre" style={{...inputSt,flex:1}}/>
                  <input value={n.direccion} onChange={e=>updList("notifys",i,"direccion",e.target.value)} placeholder="Dirección" style={{...inputSt,flex:1}}/>
                  {(form.notifys||[]).length>1&&<button onClick={()=>removeList("notifys",i)} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:14,padding:0}}>×</button>}
                </div>
              ))}
            </div>

            {/* Consignatarios — lista dinámica */}
            <div style={{marginTop:12,padding:"12px 14px",background:C.bg2,borderRadius:10,border:`1px solid ${C.border}`}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <div style={{fontSize:11,color:C.teal,fontWeight:700}}>🚢 Consignatarios</div>
                <button onClick={()=>addList("consignatarios")} style={{background:`${C.teal}22`,border:`1px solid ${C.teal}44`,color:C.teal,borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>+ Agregar</button>
              </div>
              {(form.consignatarios||[]).map((n,i)=>(
                <div key={i} style={{display:"flex",gap:8,marginBottom:6,alignItems:"center"}}>
                  <input value={n.nombre} onChange={e=>updList("consignatarios",i,"nombre",e.target.value)} placeholder="Nombre" style={{...inputSt,flex:1}}/>
                  <input value={n.direccion} onChange={e=>updList("consignatarios",i,"direccion",e.target.value)} placeholder="Dirección" style={{...inputSt,flex:1}}/>
                  {(form.consignatarios||[]).length>1&&<button onClick={()=>removeList("consignatarios",i)} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:14,padding:0}}>×</button>}
                </div>
              ))}
            </div>

            {/* Notas */}
            <div style={{marginTop:12}}>
              <div style={{fontSize:10,color:C.muted,marginBottom:4}}>Notas</div>
              <textarea value={form.notas||""} onChange={e=>setForm(p=>({...p,notas:e.target.value}))} rows={2} style={{...inputSt,resize:"vertical"}}/>
            </div>

            <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
              <button onClick={()=>{setModal(false);setEditId(null);}} style={{padding:"8px 18px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer"}}>Cancelar</button>
              <button onClick={guardar} style={{padding:"8px 18px",borderRadius:8,border:"none",background:C.accent,color:"#fff",cursor:"pointer",fontWeight:700}}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PRODUCTORES / PROVEEDORES
// ═══════════════════════════════════════════════════════════════════
function ProductoresModule({data, setData, can}) {
  const [busq, setBusq] = useState("");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({nombre:"",rut:"",pais:"Chile",zona:"",contacto:"",email:"",telefono:"",frutas:[],hectareas:"",notas:""});
  const [editId, setEditId] = useState(null);

  const filtrado = data.filter(p=>!busq||p.nombre?.toLowerCase().includes(busq.toLowerCase()));

  function guardar() {
    if(!form.nombre.trim()){alert("Nombre es obligatorio.");return;}
    if(editId) {
      setData(prev=>prev.map(p=>p.id===editId?{...p,...form}:p));
      window.auditLog&&window.auditLog("editar",{modulo:"allegria",seccion:"Productores",descripcion:`Editó productor "${form.nombre}"`,registroId:editId});
    } else {
      const id=`aprod_${Date.now()}`;
      setData(prev=>[...prev,{...form,id}]);
      window.auditLog&&window.auditLog("crear",{modulo:"allegria",seccion:"Productores",descripcion:`Creó productor "${form.nombre}" · ${form.pais}`,registroId:id});
    }
    setForm({nombre:"",rut:"",pais:"Chile",zona:"",contacto:"",email:"",telefono:"",frutas:[],hectareas:"",notas:""});
    setModal(false);setEditId(null);
  }

  return (
    <div>
      <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
        <input value={busq} onChange={e=>setBusq(e.target.value)} placeholder="🔍 Buscar productor..." style={{padding:"8px 14px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,outline:"none",flex:1,minWidth:200}}/>
        {can&&<button onClick={()=>{setModal(true);setEditId(null);setForm({nombre:"",rut:"",pais:"Chile",zona:"",contacto:"",email:"",telefono:"",frutas:[],hectareas:"",notas:""});}} style={{background:C.teal,color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Nuevo Productor</button>}
      </div>

      <div style={{overflowX:"auto",borderRadius:10,border:`1px solid ${C.border}`}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead><tr style={{background:C.bg2}}>
            {["Productor","RUT","País","Zona","Contacto","Frutas","Há",""].map(h=><th key={h} style={{padding:"8px 12px",textAlign:"left",color:C.muted,fontWeight:700,fontSize:10}}>{h}</th>)}
          </tr></thead>
          <tbody>
            {filtrado.map((p,i)=>(
              <tr key={p.id} style={{borderBottom:`1px solid ${C.border}22`,background:i%2===0?"transparent":`${C.border}08`}}>
                <td style={{padding:"8px 12px",fontWeight:600,color:C.text}}>{p.nombre}</td>
                <td style={{padding:"8px 12px",color:C.muted}}>{p.rut||"—"}</td>
                <td style={{padding:"8px 12px",color:C.muted}}>{p.pais||"—"}</td>
                <td style={{padding:"8px 12px",color:C.muted}}>{p.zona||"—"}</td>
                <td style={{padding:"8px 12px",color:C.muted}}>{p.contacto||"—"}</td>
                <td style={{padding:"8px 12px"}}>{(p.frutas||[]).map(f=><span key={f} style={{fontSize:9,background:`${C.teal}22`,color:C.teal,padding:"1px 6px",borderRadius:10,marginRight:4,fontWeight:600}}>{f}</span>)}</td>
                <td style={{padding:"8px 12px",color:C.muted,textAlign:"right"}}>{p.hectareas||"—"}</td>
                <td style={{padding:"8px 12px"}}>
                  {can&&<button onClick={()=>{setEditId(p.id);setForm({nombre:p.nombre||"",rut:p.rut||"",pais:p.pais||"Chile",zona:p.zona||"",contacto:p.contacto||"",email:p.email||"",telefono:p.telefono||"",frutas:p.frutas||[],hectareas:p.hectareas||"",notas:p.notas||""});setModal(true);}} style={{background:C.card2,border:`1px solid ${C.border}`,color:C.muted,borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:10}}>✏️</button>}
                </td>
              </tr>
            ))}
            {filtrado.length===0&&<tr><td colSpan={8} style={{padding:32,textAlign:"center",color:C.muted2}}>Sin productores</td></tr>}
          </tbody>
        </table>
      </div>

      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setModal(false)}>
          <div style={{background:C.card,borderRadius:14,padding:24,maxWidth:520,width:"100%",border:`1px solid ${C.border}`}} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:"0 0 16px",color:C.text}}>{editId?"Editar Productor":"Nuevo Productor"}</h3>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {[["Nombre *","nombre"],["RUT","rut"],["País","pais"],["Zona/Región","zona"],["Contacto","contacto"],["Email","email"],["Teléfono","telefono"],["Hectáreas","hectareas"]].map(([l,f])=>(
                <div key={f}><div style={{fontSize:10,color:C.muted,marginBottom:4}}>{l}</div>
                  <input value={form[f]||""} onChange={e=>setForm(p=>({...p,[f]:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/></div>
              ))}
            </div>
            <div style={{marginTop:12}}>
              <div style={{fontSize:10,color:C.muted,marginBottom:4}}>Frutas</div>
              <div style={{display:"flex",gap:6}}>{FRUTAS.map(f=>(
                <button key={f} onClick={()=>setForm(p=>({...p,frutas:p.frutas?.includes(f)?p.frutas.filter(x=>x!==f):[...(p.frutas||[]),f]}))}
                  style={{padding:"4px 12px",borderRadius:20,border:`1px solid ${form.frutas?.includes(f)?C.teal:C.border}`,background:form.frutas?.includes(f)?`${C.teal}22`:"transparent",color:form.frutas?.includes(f)?C.teal:C.muted,cursor:"pointer",fontSize:11,fontWeight:600}}>{f}</button>
              ))}</div>
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
              <button onClick={()=>{setModal(false);setEditId(null);}} style={{padding:"8px 18px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer"}}>Cancelar</button>
              <button onClick={guardar} style={{padding:"8px 18px",borderRadius:8,border:"none",background:C.teal,color:"#fff",cursor:"pointer",fontWeight:700}}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// EMBARQUES Y CONTENEDORES
// ═══════════════════════════════════════════════════════════════════
function EmbarquesModule({data, setData, clientes, productores, can, temporada}) {
  const [busq, setBusq] = useState("");
  const [filtroFruta, setFiltroFruta] = useState("Todos");
  const [filtroEstado, setFiltroEstado] = useState("Todos");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({contenedor:"",fruta:"Cerezas",origen:"Chile",destino:"China",cliente:"",productor:"",temporada:temporada||temporadaActual(),kgNeto:"",cajas:"",etd:"",eta:"",naviera:"",booking:"",bl:"",estado:"Programado",precioFOB:"",siniestrado:false,notas:""});
  const [fechaError, setFechaError] = useState("");

  // Filtrar por temporada seleccionada
  const filtrado = data.filter(e=>
    (e.temporada===temporada)&&
    (filtroFruta==="Todos"||e.fruta===filtroFruta)&&
    (filtroEstado==="Todos"||e.estado===filtroEstado)&&
    (!busq||e.contenedor?.toLowerCase().includes(busq.toLowerCase())||e.cliente?.toLowerCase().includes(busq.toLowerCase()))
  );

  const totKg = filtrado.reduce((s,e)=>s+(Number(e.kgNeto)||0),0);
  const totFOB = filtrado.reduce((s,e)=>s+(Number(e.kgNeto)||0)*(Number(e.precioFOB)||0),0);

  function guardar() {
    if(!form.contenedor.trim()){alert("N° contenedor es obligatorio.");return;}
    const temp = temporada;
    if(form.etd && !fechaEnTemporada(form.etd, temp)){
      const r = rangoTemporada(temp);
      alert(`La fecha ETD (${form.etd}) está fuera de la temporada ${temp}.\nRango válido: ${r?.inicioStr} al ${r?.finStr}`);return;
    }
    if(form.eta && !fechaEnTemporada(form.eta, temp)){
      const r = rangoTemporada(temp);
      alert(`La fecha ETA (${form.eta}) está fuera de la temporada ${temp}.\nRango válido: ${r?.inicioStr} al ${r?.finStr}`);return;
    }
    const id=`aemb_${Date.now()}`;
    setData(prev=>[...prev,{...form,id,temporada:temp,kgNeto:Number(form.kgNeto)||0,cajas:Number(form.cajas)||0,precioFOB:Number(form.precioFOB)||0}]);
    window.auditLog&&window.auditLog("crear",{modulo:"allegria",seccion:"Embarques",descripcion:`Creó embarque ${form.contenedor} · ${form.fruta} → ${form.destino} · T${temp}`,registroId:id});
    setModal(false);
    setForm({contenedor:"",fruta:"Cerezas",origen:"Chile",destino:"China",cliente:"",productor:"",temporada:temp,kgNeto:"",cajas:"",etd:"",eta:"",naviera:"",booking:"",bl:"",estado:"Programado",precioFOB:"",siniestrado:false,notas:""});
  }

  function upd(id,c,v) {
    setData(prev=>prev.map(e=>{
      if(e.id!==id) return e;
      if(String(e[c]||"")!==String(v||"")) {
        window.auditLog&&window.auditLog("editar",{modulo:"allegria",seccion:"Embarques",descripcion:`Editó embarque ${e.contenedor}: campo ${c}`,registroId:id,campo:c,valorAnterior:String(e[c]||""),valorNuevo:String(v||"")});
      }
      return {...e,[c]:v};
    }));
  }

  const estadoColor = {Programado:C.blue,["En tránsito"]:C.yellow,["En destino"]:C.teal,Entregado:C.green,Liquidado:"#8b5cf6"};

  return (
    <div>
      {/* KPIs */}
      <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        <KPI label="📦 Embarques" value={filtrado.length} color={C.blue}/>
        <KPI label="⚖️ KG Neto Total" value={`${(totKg/1000).toFixed(0)}t`} color={C.teal} sub={`${totKg.toLocaleString("es-CL")} kg`}/>
        <KPI label="💰 FOB Total" value={$$(totFOB)} color={C.green}/>
        <KPI label="🚢 En tránsito" value={data.filter(e=>e.estado==="En tránsito").length} color={C.yellow}/>
        <KPI label="⚠️ Siniestrados" value={data.filter(e=>e.siniestrado).length} color={C.red}/>
      </div>

      {/* Filtros */}
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center",background:C.card2,borderRadius:10,padding:"8px 12px",border:`1px solid ${C.border}`}}>
        <input value={busq} onChange={e=>setBusq(e.target.value)} placeholder="🔍 Buscar..." style={{padding:"5px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card,color:C.text,fontSize:11,outline:"none",width:160}}/>
        {[["Fruta",FRUTAS,filtroFruta,setFiltroFruta],["Estado",ESTADOS_EMBARQUE,filtroEstado,setFiltroEstado]].map(([l,opts,v,set])=>(
          <div key={l} style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{fontSize:10,color:C.muted,fontWeight:600}}>{l}:</span>
            <select value={v} onChange={e=>set(e.target.value)} style={{padding:"4px 8px",borderRadius:6,border:`1px solid ${C.border}`,background:C.card,color:C.text,fontSize:11,outline:"none"}}>
              <option value="Todos">Todos</option>
              {opts.map(o=><option key={o}>{o}</option>)}
            </select>
          </div>
        ))}
        {can&&<button onClick={()=>setModal(true)} style={{marginLeft:"auto",background:C.accent,color:"#fff",border:"none",borderRadius:8,padding:"7px 16px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Nuevo Embarque</button>}
      </div>

      {/* Tabla */}
      <div style={{overflowX:"auto",borderRadius:10,border:`1px solid ${C.border}`}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr style={{background:C.bg2}}>
            {["Contenedor","Fruta","Origen","Destino","Cliente","Productor","KG Neto","FOB/kg","FOB Total","ETD","ETA","Estado","Sin.","Naviera"].map(h=>
              <th key={h} style={{padding:"8px 10px",textAlign:h==="KG Neto"||h.includes("FOB")?"right":h==="Sin."?"center":"left",color:C.muted,fontWeight:700,fontSize:10,whiteSpace:"nowrap"}}>{h}</th>)}
          </tr></thead>
          <tbody>
            {filtrado.map((e,i)=>{
              const fobTotal=(Number(e.kgNeto)||0)*(Number(e.precioFOB)||0);
              return (
                <tr key={e.id} style={{borderBottom:`1px solid ${C.border}22`,background:i%2===0?"transparent":`${C.border}08`}}>
                  <td style={{padding:"7px 10px",fontWeight:700,color:C.text}}>{e.contenedor}</td>
                  <td style={{padding:"7px 10px"}}><span style={{fontSize:10,background:`${C.accent}22`,color:C.accentL,padding:"2px 8px",borderRadius:10,fontWeight:600}}>{e.fruta}</span></td>
                  <td style={{padding:"7px 10px",color:C.muted}}>{e.origen}</td>
                  <td style={{padding:"7px 10px",color:C.muted}}>{e.destino}</td>
                  <td style={{padding:"7px 10px",color:C.text,fontWeight:500}}>{e.cliente||"—"}</td>
                  <td style={{padding:"7px 10px",color:C.muted}}>{e.productor||"—"}</td>
                  <td style={{padding:"7px 10px",textAlign:"right",fontWeight:600,color:C.text}}>{(Number(e.kgNeto)||0).toLocaleString("es-CL")}</td>
                  <td style={{padding:"7px 10px",textAlign:"right",color:C.muted}}>{Number(e.precioFOB)?`$${Number(e.precioFOB).toFixed(2)}`:"—"}</td>
                  <td style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:C.green}}>{fobTotal?$$(fobTotal):"—"}</td>
                  <td style={{padding:"7px 10px",color:C.muted,fontSize:10}}>{e.etd||"—"}</td>
                  <td style={{padding:"7px 10px",color:C.muted,fontSize:10}}>{e.eta||"—"}</td>
                  <td style={{padding:"7px 10px"}}>
                    {can
                      ? <select value={e.estado} onChange={ev=>upd(e.id,"estado",ev.target.value)} style={{padding:"3px 6px",borderRadius:6,border:`1px solid ${estadoColor[e.estado]||C.border}`,background:`${estadoColor[e.estado]||C.border}22`,color:estadoColor[e.estado]||C.muted,fontSize:10,fontWeight:700,cursor:"pointer",outline:"none"}}>
                          {ESTADOS_EMBARQUE.map(s=><option key={s}>{s}</option>)}
                        </select>
                      : <span style={{fontSize:10,background:`${estadoColor[e.estado]||C.border}22`,color:estadoColor[e.estado]||C.muted,padding:"2px 8px",borderRadius:10,fontWeight:700}}>{e.estado}</span>
                    }
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"center"}}>
                    {can
                      ? <input type="checkbox" checked={!!e.siniestrado} onChange={ev=>upd(e.id,"siniestrado",ev.target.checked)} style={{cursor:"pointer",accentColor:C.red}}/>
                      : e.siniestrado ? <span style={{fontSize:10,background:"#fee2e2",color:C.red,padding:"2px 8px",borderRadius:10,fontWeight:700}}>⚠️ Sí</span> : <span style={{color:C.muted2,fontSize:10}}>—</span>
                    }
                  </td>
                  <td style={{padding:"7px 10px",color:C.muted,fontSize:10}}>{e.naviera||"—"}</td>
                </tr>
              );
            })}
            {filtrado.length===0&&<tr><td colSpan={14} style={{padding:32,textAlign:"center",color:C.muted2}}>Sin embarques</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Modal nuevo embarque */}
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setModal(false)}>
          <div style={{background:C.card,borderRadius:14,padding:24,maxWidth:600,width:"100%",border:`1px solid ${C.border}`,maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:"0 0 16px",color:C.text}}>🚢 Nuevo Embarque</h3>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
              {[["N° Contenedor *","contenedor","text"],["KG Neto","kgNeto","number"],["Cajas","cajas","number"],["Precio FOB/kg (USD)","precioFOB","number"],["ETD","etd","date"],["ETA","eta","date"],["Naviera","naviera","text"],["Booking","booking","text"],["BL","bl","text"]].map(([l,f,t])=>(
                <div key={f}><div style={{fontSize:10,color:C.muted,marginBottom:4}}>{l}</div>
                  <input type={t} value={form[f]||""} onChange={e=>setForm(p=>({...p,[f]:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/></div>
              ))}
              {[["Fruta",FRUTAS,"fruta"],["Origen",ORIGENES,"origen"],["Destino",DESTINOS,"destino"],["Estado",ESTADOS_EMBARQUE,"estado"],["Temporada",TEMPORADAS,"temporada"]].map(([l,opts,f])=>(
                <div key={f}><div style={{fontSize:10,color:C.muted,marginBottom:4}}>{l}</div>
                  <select value={form[f]} onChange={e=>setForm(p=>({...p,[f]:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,outline:"none"}}>{opts.map(o=><option key={o}>{o}</option>)}</select></div>
              ))}
              <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Cliente</div>
                <select value={form.cliente} onChange={e=>setForm(p=>({...p,cliente:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,outline:"none"}}>
                  <option value="">— Seleccionar —</option>
                  {clientes.map(c=><option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                </select></div>
              <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Productor</div>
                <select value={form.productor} onChange={e=>setForm(p=>({...p,productor:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,outline:"none"}}>
                  <option value="">— Seleccionar —</option>
                  {productores.map(p=><option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                </select></div>
              <div style={{display:"flex",alignItems:"center",gap:8,paddingTop:18}}>
                <input type="checkbox" checked={!!form.siniestrado} onChange={e=>setForm(p=>({...p,siniestrado:e.target.checked}))} style={{accentColor:C.red}}/>
                <span style={{fontSize:12,color:C.text,fontWeight:600}}>⚠️ Siniestrado</span>
              </div>
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
              <button onClick={()=>setModal(false)} style={{padding:"8px 18px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer"}}>Cancelar</button>
              <button onClick={guardar} style={{padding:"8px 18px",borderRadius:8,border:"none",background:C.accent,color:"#fff",cursor:"pointer",fontWeight:700}}>Crear Embarque</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// LIQUIDACIONES PRODUCTOR
// ═══════════════════════════════════════════════════════════════════
const FORMATOS_CAJA_DEFAULT = ["2.5 kg","5 kg","2en1 (10 kg)"];

function LiquidacionesModule({data, setData, embarques, can, temporada}) {
  const [filtroFruta, setFiltroFruta] = useState("Todos");
  const [modal, setModal] = useState(false);
  const [formatosExtra, setFormatosExtra] = useState([]);
  const [nuevoFormato, setNuevoFormato] = useState("");
  const [form, setForm] = useState({embarqueId:"",cajas:"",formatoCaja:"5 kg",fob:"",comisionPct:"",costoMateriales:"",costoServicios:"",gastosLogistica:"",notas:""});

  const FORMATOS_CAJA = [...FORMATOS_CAJA_DEFAULT, ...formatosExtra];

  // Cargar formatos extra del localStorage
  useEffect(()=>{
    try { const f = JSON.parse(localStorage.getItem("allegria_formatos")||"[]"); if(Array.isArray(f)) setFormatosExtra(f); } catch{}
  },[]);

  function agregarFormato() {
    if(!nuevoFormato.trim()) return;
    const nuevo = [...formatosExtra, nuevoFormato.trim()];
    setFormatosExtra(nuevo);
    try { localStorage.setItem("allegria_formatos", JSON.stringify(nuevo)); } catch{}
    setNuevoFormato("");
  }

  const enriched = data.map(l=>{
    const emb = embarques.find(e=>e.id===l.embarqueId)||{};
    const kg = Number(emb.kgNeto)||0;
    const cajas = Number(l.cajas)||Number(emb.cajas)||0;
    const fob = Number(l.fob)||0;
    const usdPorKg = kg > 0 ? fob / kg : 0;
    const comisionPct = Number(l.comisionPct)||0;
    const costoMat = Number(l.costoMateriales)||0;
    const costoServ = Number(l.costoServicios)||0;
    const gastosLogistica = Number(l.gastosLogistica)||0;
    const comision = fob * comisionPct / 100;
    const totalCostos = costoMat + costoServ + gastosLogistica + comision;
    const retornoNeto = fob - totalCostos;
    const retornoPorCaja = cajas > 0 ? retornoNeto / cajas : 0;
    const retornoPorKg = kg > 0 ? retornoNeto / kg : 0;
    return {...l, emb, kg, cajas, fob, usdPorKg, comision, costoMat, costoServ, totalCostos, retornoNeto, retornoPorCaja, retornoPorKg, gastosLogistica, comisionPct, formatoCaja:l.formatoCaja||"—"};
  });

  const filtrado = enriched.filter(l=>(l.emb.temporada===temporada)&&(filtroFruta==="Todos"||l.emb.fruta===filtroFruta));
  const totFOB = filtrado.reduce((s,l)=>s+l.fob,0);
  const totNeto = filtrado.reduce((s,l)=>s+l.retornoNeto,0);

  function guardar() {
    if(!form.embarqueId){alert("Selecciona un embarque.");return;}
    const id=`aliq_${Date.now()}`;
    setData(prev=>[...prev,{...form,id}]);
    const emb=embarques.find(e=>e.id===form.embarqueId);
    window.auditLog&&window.auditLog("crear",{modulo:"allegria",seccion:"Liquidación Productor",descripcion:`Creó liquidación para embarque ${emb?.contenedor||form.embarqueId}`,registroId:id});
    setModal(false);setForm({embarqueId:"",cajas:"",formatoCaja:"5 kg",fob:"",comisionPct:"",costoMateriales:"",costoServicios:"",gastosLogistica:"",notas:""});
  }

  return (
    <div>
      <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        <KPI label="💰 FOB Total" value={$$(totFOB)} color={C.blue}/>
        <KPI label="📊 Retorno Neto Productor" value={$$(totNeto)} color={C.green}/>
        <KPI label="📋 Liquidaciones" value={filtrado.length} color={C.muted}/>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:14,alignItems:"center"}}>
        <span style={{fontSize:11,color:C.muted,fontWeight:600}}>Fruta:</span>
        {["Todos",...FRUTAS].map(f=><button key={f} onClick={()=>setFiltroFruta(f)} style={{padding:"4px 12px",borderRadius:20,border:`1px solid ${filtroFruta===f?C.accent:C.border}`,background:filtroFruta===f?`${C.accent}22`:"transparent",color:filtroFruta===f?C.accentL:C.muted,cursor:"pointer",fontSize:11,fontWeight:600}}>{f}</button>)}
        {can&&<button onClick={()=>setModal(true)} style={{marginLeft:"auto",background:C.accent,color:"#fff",border:"none",borderRadius:8,padding:"7px 16px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Nueva Liquidación</button>}
      </div>

      <div style={{overflowX:"auto",borderRadius:10,border:`1px solid ${C.border}`}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr style={{background:C.bg2}}>
            {["Contenedor","Fruta","Productor","Cajas","Formato","KG","FOB","USD/KG","Comisión","Mat.+Serv.","Gastos Log.","Retorno Neto","$/Caja","$/KG"].map(h=>
              <th key={h} style={{padding:"8px 8px",textAlign:["Contenedor","Fruta","Productor","Formato"].includes(h)?"left":"right",color:C.muted,fontWeight:700,fontSize:9,whiteSpace:"nowrap"}}>{h}</th>)}
          </tr></thead>
          <tbody>
            {filtrado.map((l,i)=>(
              <tr key={l.id} style={{borderBottom:`1px solid ${C.border}22`,background:i%2===0?"transparent":`${C.border}08`}}>
                <td style={{padding:"6px 8px",fontWeight:700,color:C.text,fontSize:11}}>{l.emb.contenedor||"—"}</td>
                <td style={{padding:"6px 8px"}}><span style={{fontSize:9,background:`${C.accent}22`,color:C.accentL,padding:"2px 6px",borderRadius:10,fontWeight:600}}>{l.emb.fruta||"—"}</span></td>
                <td style={{padding:"6px 8px",color:C.muted,fontSize:10}}>{l.emb.productor||"—"}</td>
                <td style={{padding:"6px 8px",textAlign:"right",color:C.text}}>{l.cajas?l.cajas.toLocaleString("es-CL"):"—"}</td>
                <td style={{padding:"6px 8px",color:C.muted,fontSize:10}}>{l.formatoCaja}</td>
                <td style={{padding:"6px 8px",textAlign:"right",color:C.text}}>{l.kg.toLocaleString("es-CL")}</td>
                <td style={{padding:"6px 8px",textAlign:"right",fontWeight:700,color:C.blue}}>{$$(l.fob)}</td>
                <td style={{padding:"6px 8px",textAlign:"right",color:C.muted}}>{l.usdPorKg?`$${l.usdPorKg.toFixed(2)}`:"—"}</td>
                <td style={{padding:"6px 8px",textAlign:"right",color:C.yellow}}>{$$(l.comision)}</td>
                <td style={{padding:"6px 8px",textAlign:"right",color:C.red}}>{$$(l.costoMat+l.costoServ)}</td>
                <td style={{padding:"6px 8px",textAlign:"right",color:C.red}}>{$$(l.gastosLogistica)}</td>
                <td style={{padding:"6px 8px",textAlign:"right",fontWeight:800,color:l.retornoNeto>=0?C.green:C.red}}>{$$(l.retornoNeto)}</td>
                <td style={{padding:"6px 8px",textAlign:"right",fontWeight:600,color:C.teal}}>{l.retornoPorCaja?`$${l.retornoPorCaja.toFixed(2)}`:"—"}</td>
                <td style={{padding:"6px 8px",textAlign:"right",fontWeight:600,color:C.teal}}>{l.retornoPorKg?`$${l.retornoPorKg.toFixed(2)}`:"—"}</td>
              </tr>
            ))}
            {filtrado.length===0&&<tr><td colSpan={14} style={{padding:32,textAlign:"center",color:C.muted2}}>Sin liquidaciones</td></tr>}
          </tbody>
        </table>
      </div>

      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setModal(false)}>
          <div style={{background:C.card,borderRadius:14,padding:24,maxWidth:540,width:"100%",border:`1px solid ${C.border}`}} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:"0 0 16px",color:C.text}}>💰 Nueva Liquidación Productor</h3>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div style={{gridColumn:"1/-1"}}><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Embarque *</div>
                <select value={form.embarqueId} onChange={e=>setForm(p=>({...p,embarqueId:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,outline:"none"}}>
                  <option value="">— Seleccionar embarque —</option>
                  {embarques.filter(e=>e.temporada===temporada).map(e=><option key={e.id} value={e.id}>{e.contenedor} · {e.fruta} · {e.productor||e.cliente} ({(Number(e.kgNeto)||0).toLocaleString()} kg)</option>)}
                </select></div>
              <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Cantidad Cajas</div>
                <input type="number" value={form.cajas||""} onChange={e=>setForm(p=>({...p,cajas:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/></div>
              <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Formato Caja</div>
                <select value={form.formatoCaja||"5 kg"} onChange={e=>setForm(p=>({...p,formatoCaja:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,outline:"none"}}>
                  {FORMATOS_CAJA.map(f=><option key={f}>{f}</option>)}
                </select>
                <div style={{display:"flex",gap:4,marginTop:6}}>
                  <input type="text" value={nuevoFormato} onChange={e=>setNuevoFormato(e.target.value)} placeholder="+ Nuevo formato" onKeyDown={e=>e.key==="Enter"&&agregarFormato()}
                    style={{flex:1,padding:"4px 8px",borderRadius:6,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:10,outline:"none"}}/>
                  <button onClick={agregarFormato} style={{background:C.teal,color:"#fff",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>+</button>
                </div>
              </div>
              <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>FOB Total (USD)</div>
                <input type="number" value={form.fob||""} onChange={e=>setForm(p=>({...p,fob:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/></div>
              <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>USD/KG (automático)</div>
                <div style={{padding:"7px 10px",borderRadius:8,background:C.bg2,color:C.teal,fontSize:13,fontWeight:700,border:`1px solid ${C.border}`}}>
                  {(()=>{const emb=embarques.find(e=>e.id===form.embarqueId);const kg=Number(emb?.kgNeto)||0;const fob=Number(form.fob)||0;return kg>0?`$${(fob/kg).toFixed(2)}`:"—";})()}
                </div></div>
              {[["Comisión %","comisionPct"],["Costo Materiales USD","costoMateriales"],["Costo Servicios USD","costoServicios"],["Gastos Logística USD","gastosLogistica"]].map(([l,f])=>(
                <div key={f}><div style={{fontSize:10,color:C.muted,marginBottom:4}}>{l}</div>
                  <input type="number" value={form[f]||""} onChange={e=>setForm(p=>({...p,[f]:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/></div>
              ))}
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
              <button onClick={()=>setModal(false)} style={{padding:"8px 18px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer"}}>Cancelar</button>
              <button onClick={guardar} style={{padding:"8px 18px",borderRadius:8,border:"none",background:C.accent,color:"#fff",cursor:"pointer",fontWeight:700}}>Crear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// LIQUIDACIÓN CLIENTE (recibida del importador)
// ═══════════════════════════════════════════════════════════════════
function LiquidacionClienteModule({data, setData, embarques, can, temporada}) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({embarqueId:"",montoRecibido:"",monedaRecibida:"USD",fechaRecepcion:"",nDocumento:"",deduccionesCalidad:"",deduccionesFlete:"",otrasDeduciones:"",montoNetoCli:"",notas:""});

  const enrichedAll = data.map(l=>{
    const emb = embarques.find(e=>e.id===l.embarqueId)||{};
    const montoRecibido = Number(l.montoRecibido)||0;
    const dedCalidad = Number(l.deduccionesCalidad)||0;
    const dedFlete = Number(l.deduccionesFlete)||0;
    const dedOtras = Number(l.otrasDeduciones)||0;
    const totalDeducciones = dedCalidad + dedFlete + dedOtras;
    const netoCliente = montoRecibido - totalDeducciones;
    return {...l, emb, montoRecibido, totalDeducciones, netoCliente};
  });
  const enriched = enrichedAll.filter(l=>l.emb.temporada===temporada||l.temporada===temporada);

  const totRecibido = enriched.reduce((s,l)=>s+l.montoRecibido,0);
  const totNeto = enriched.reduce((s,l)=>s+l.netoCliente,0);

  function guardar() {
    if(!form.embarqueId){alert("Selecciona un embarque.");return;}
    if(form.fechaRecepcion && !fechaEnTemporada(form.fechaRecepcion, temporada)){
      const r = rangoTemporada(temporada);
      alert(`La fecha (${form.fechaRecepcion}) está fuera de la temporada ${temporada}.\nRango: ${r?.inicioStr} al ${r?.finStr}`);return;
    }
    const id=`aliqc_${Date.now()}`;
    setData(prev=>[...prev,{...form,id,temporada}]);
    const emb=embarques.find(e=>e.id===form.embarqueId);
    window.auditLog&&window.auditLog("crear",{modulo:"allegria",seccion:"Liquidación Cliente",descripcion:`Creó liquidación cliente para ${emb?.contenedor||"—"} · T${temporada}`,registroId:id});
    setModal(false);setForm({embarqueId:"",montoRecibido:"",monedaRecibida:"USD",fechaRecepcion:"",nDocumento:"",deduccionesCalidad:"",deduccionesFlete:"",otrasDeduciones:"",montoNetoCli:"",notas:""});
  }

  return (
    <div>
      <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        <KPI label="💵 Total Recibido" value={$$(totRecibido)} color={C.blue}/>
        <KPI label="✅ Neto Cliente" value={$$(totNeto)} color={C.green}/>
        <KPI label="📋 Liquidaciones" value={enriched.length} color={C.muted}/>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:14,alignItems:"center"}}>
        {can&&<button onClick={()=>setModal(true)} style={{marginLeft:"auto",background:C.blue,color:"#fff",border:"none",borderRadius:8,padding:"7px 16px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Nueva Liquidación Cliente</button>}
      </div>

      <div style={{overflowX:"auto",borderRadius:10,border:`1px solid ${C.border}`}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr style={{background:C.bg2}}>
            {["Contenedor","Fruta","Cliente","Destino","Monto Recibido","Ded. Calidad","Ded. Flete","Otras Ded.","Neto Cliente","Moneda","Fecha Recepción","N° Doc"].map(h=>
              <th key={h} style={{padding:"8px 8px",textAlign:["Monto Recibido","Ded. Calidad","Ded. Flete","Otras Ded.","Neto Cliente"].includes(h)?"right":"left",color:C.muted,fontWeight:700,fontSize:9,whiteSpace:"nowrap"}}>{h}</th>)}
          </tr></thead>
          <tbody>
            {enriched.map((l,i)=>(
              <tr key={l.id} style={{borderBottom:`1px solid ${C.border}22`,background:i%2===0?"transparent":`${C.border}08`}}>
                <td style={{padding:"6px 8px",fontWeight:700,color:C.text}}>{l.emb.contenedor||"—"}</td>
                <td style={{padding:"6px 8px"}}><span style={{fontSize:9,background:`${C.accent}22`,color:C.accentL,padding:"2px 6px",borderRadius:10,fontWeight:600}}>{l.emb.fruta||"—"}</span></td>
                <td style={{padding:"6px 8px",color:C.muted}}>{l.emb.cliente||"—"}</td>
                <td style={{padding:"6px 8px",color:C.muted}}>{l.emb.destino||"—"}</td>
                <td style={{padding:"6px 8px",textAlign:"right",fontWeight:700,color:C.blue}}>{$$(l.montoRecibido)}</td>
                <td style={{padding:"6px 8px",textAlign:"right",color:C.red}}>{Number(l.deduccionesCalidad)?$$(Number(l.deduccionesCalidad)):"—"}</td>
                <td style={{padding:"6px 8px",textAlign:"right",color:C.red}}>{Number(l.deduccionesFlete)?$$(Number(l.deduccionesFlete)):"—"}</td>
                <td style={{padding:"6px 8px",textAlign:"right",color:C.red}}>{Number(l.otrasDeduciones)?$$(Number(l.otrasDeduciones)):"—"}</td>
                <td style={{padding:"6px 8px",textAlign:"right",fontWeight:800,color:l.netoCliente>=0?C.green:C.red}}>{$$(l.netoCliente)}</td>
                <td style={{padding:"6px 8px",color:C.muted}}>{l.monedaRecibida||"USD"}</td>
                <td style={{padding:"6px 8px",color:C.muted,fontSize:10}}>{l.fechaRecepcion||"—"}</td>
                <td style={{padding:"6px 8px",color:C.muted}}>{l.nDocumento||"—"}</td>
              </tr>
            ))}
            {enriched.length===0&&<tr><td colSpan={12} style={{padding:32,textAlign:"center",color:C.muted2}}>Sin liquidaciones de cliente</td></tr>}
          </tbody>
        </table>
      </div>

      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setModal(false)}>
          <div style={{background:C.card,borderRadius:14,padding:24,maxWidth:520,width:"100%",border:`1px solid ${C.border}`}} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:"0 0 16px",color:C.text}}>📥 Nueva Liquidación Cliente (del Importador)</h3>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div style={{gridColumn:"1/-1"}}><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Embarque *</div>
                <select value={form.embarqueId} onChange={e=>setForm(p=>({...p,embarqueId:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,outline:"none"}}>
                  <option value="">— Seleccionar embarque —</option>
                  {embarques.filter(e=>e.temporada===temporada).map(e=><option key={e.id} value={e.id}>{e.contenedor} · {e.fruta} · {e.cliente}</option>)}
                </select></div>
              {[["Monto Recibido USD","montoRecibido","number"],["N° Documento","nDocumento","text"],["Fecha Recepción","fechaRecepcion","date"],["Ded. Calidad USD","deduccionesCalidad","number"],["Ded. Flete USD","deduccionesFlete","number"],["Otras Deducciones USD","otrasDeduciones","number"]].map(([l,f,t])=>(
                <div key={f}><div style={{fontSize:10,color:C.muted,marginBottom:4}}>{l}</div>
                  <input type={t} value={form[f]||""} onChange={e=>setForm(p=>({...p,[f]:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/></div>
              ))}
              <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Moneda</div>
                <select value={form.monedaRecibida||"USD"} onChange={e=>setForm(p=>({...p,monedaRecibida:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,outline:"none"}}>{MONEDAS.map(m=><option key={m}>{m}</option>)}</select></div>
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
              <button onClick={()=>setModal(false)} style={{padding:"8px 18px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer"}}>Cancelar</button>
              <button onClick={guardar} style={{padding:"8px 18px",borderRadius:8,border:"none",background:C.blue,color:"#fff",cursor:"pointer",fontWeight:700}}>Crear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ANTICIPOS (Productores + Clientes)
// ═══════════════════════════════════════════════════════════════════
function AnticiposModule({data, setData, clientes, productores, can, temporada}) {
  const [subTab, setSubTab] = useState("productores");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({tipo:"productor",entidad:"",monto:"",moneda:"USD",fecha:"",temporada:"2025/2026",fruta:"Cerezas",estado:"Pendiente",nDoc:"",notas:""});

  const anticiposProd = data.filter(a=>a.tipo==="productor"&&(a.temporada===temporada||!a.temporada));
  const anticiposCli = data.filter(a=>a.tipo==="cliente"&&(a.temporada===temporada||!a.temporada));
  const lista = subTab==="productores" ? anticiposProd : anticiposCli;
  const totProd = anticiposProd.reduce((s,a)=>s+(Number(a.monto)||0),0);
  const totCli = anticiposCli.reduce((s,a)=>s+(Number(a.monto)||0),0);

  function guardar() {
    if(!form.entidad.trim()){alert("Entidad es obligatoria.");return;}
    if(form.fecha && !fechaEnTemporada(form.fecha, temporada)){
      const r = rangoTemporada(temporada);
      alert(`La fecha (${form.fecha}) está fuera de la temporada ${temporada}.\nRango: ${r?.inicioStr} al ${r?.finStr}`);return;
    }
    const id=`aant_${Date.now()}`;
    setData(prev=>[...prev,{...form,id,temporada,monto:Number(form.monto)||0}]);
    window.auditLog&&window.auditLog("crear",{modulo:"allegria",seccion:"Anticipos",descripcion:`Creó anticipo ${form.tipo} a "${form.entidad}" por ${$$(Number(form.monto)||0)} · T${temporada}`,registroId:id});
    setModal(false);setForm({tipo:subTab==="productores"?"productor":"cliente",entidad:"",monto:"",moneda:"USD",fecha:"",temporada,fruta:"Cerezas",estado:"Pendiente",nDoc:"",notas:""});
  }

  function upd(id,c,v) {
    setData(prev=>prev.map(a=>a.id===id?{...a,[c]:v}:a));
  }

  return (
    <div>
      <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        <KPI label="🌱 Anticipos Productores" value={$$(totProd)} color={C.teal} sub={`${anticiposProd.length} registros`}/>
        <KPI label="👥 Anticipos Clientes" value={$$(totCli)} color={C.blue} sub={`${anticiposCli.length} registros`}/>
      </div>

      <div style={{display:"flex",gap:6,marginBottom:16}}>
        {[{id:"productores",label:"🌱 Anticipos Productores"},{id:"clientes",label:"👥 Anticipos Clientes"}].map(t=>(
          <button key={t.id} onClick={()=>setSubTab(t.id)} style={{padding:"8px 18px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:600,fontSize:12,background:subTab===t.id?C.accent:"transparent",color:subTab===t.id?"#fff":C.muted}}>{t.label}</button>
        ))}
        {can&&<button onClick={()=>{setForm(p=>({...p,tipo:subTab==="productores"?"productor":"cliente"}));setModal(true);}} style={{marginLeft:"auto",background:C.accent,color:"#fff",border:"none",borderRadius:8,padding:"7px 16px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Nuevo Anticipo</button>}
      </div>

      <div style={{overflowX:"auto",borderRadius:10,border:`1px solid ${C.border}`}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr style={{background:C.bg2}}>
            {[subTab==="productores"?"Productor":"Cliente","Fruta","Temporada","Monto","Moneda","Fecha","N° Doc","Estado"].map(h=>
              <th key={h} style={{padding:"8px 10px",textAlign:h==="Monto"?"right":"left",color:C.muted,fontWeight:700,fontSize:10}}>{h}</th>)}
          </tr></thead>
          <tbody>
            {lista.map((a,i)=>(
              <tr key={a.id} style={{borderBottom:`1px solid ${C.border}22`,background:i%2===0?"transparent":`${C.border}08`}}>
                <td style={{padding:"7px 10px",fontWeight:600,color:C.text}}>{a.entidad}</td>
                <td style={{padding:"7px 10px",color:C.muted}}>{a.fruta||"—"}</td>
                <td style={{padding:"7px 10px",color:C.muted}}>{a.temporada||"—"}</td>
                <td style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:C.green}}>{$$(Number(a.monto)||0)}</td>
                <td style={{padding:"7px 10px",color:C.muted}}>{a.moneda||"USD"}</td>
                <td style={{padding:"7px 10px",color:C.muted,fontSize:10}}>{a.fecha||"—"}</td>
                <td style={{padding:"7px 10px",color:C.muted}}>{a.nDoc||"—"}</td>
                <td style={{padding:"7px 10px"}}>
                  {can
                    ? <select value={a.estado||"Pendiente"} onChange={e=>upd(a.id,"estado",e.target.value)} style={{padding:"3px 6px",borderRadius:6,border:`1px solid ${a.estado==="Pagado"?C.green:C.yellow}`,background:`${a.estado==="Pagado"?C.green:C.yellow}22`,color:a.estado==="Pagado"?C.green:C.yellow,fontSize:10,fontWeight:700,cursor:"pointer",outline:"none"}}>
                        {ESTADOS_PAGO.map(s=><option key={s}>{s}</option>)}
                      </select>
                    : <span style={{fontSize:10,fontWeight:700,color:a.estado==="Pagado"?C.green:C.yellow}}>{a.estado||"Pendiente"}</span>
                  }
                </td>
              </tr>
            ))}
            {lista.length===0&&<tr><td colSpan={8} style={{padding:32,textAlign:"center",color:C.muted2}}>Sin anticipos</td></tr>}
          </tbody>
        </table>
      </div>

      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setModal(false)}>
          <div style={{background:C.card,borderRadius:14,padding:24,maxWidth:480,width:"100%",border:`1px solid ${C.border}`}} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:"0 0 16px",color:C.text}}>💵 Nuevo Anticipo — {form.tipo==="productor"?"Productor":"Cliente"}</h3>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div style={{gridColumn:"1/-1"}}><div style={{fontSize:10,color:C.muted,marginBottom:4}}>{form.tipo==="productor"?"Productor":"Cliente"} *</div>
                <select value={form.entidad} onChange={e=>setForm(p=>({...p,entidad:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,outline:"none"}}>
                  <option value="">— Seleccionar —</option>
                  {(form.tipo==="productor"?productores:clientes).map(x=><option key={x.id} value={x.nombre}>{x.nombre}</option>)}
                </select></div>
              {[["Monto","monto","number"],["N° Documento","nDoc","text"],["Fecha","fecha","date"]].map(([l,f,t])=>(
                <div key={f}><div style={{fontSize:10,color:C.muted,marginBottom:4}}>{l}</div>
                  <input type={t} value={form[f]||""} onChange={e=>setForm(p=>({...p,[f]:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/></div>
              ))}
              {[["Fruta",FRUTAS,"fruta"],["Temporada",TEMPORADAS,"temporada"],["Moneda",MONEDAS,"moneda"]].map(([l,opts,f])=>(
                <div key={f}><div style={{fontSize:10,color:C.muted,marginBottom:4}}>{l}</div>
                  <select value={form[f]} onChange={e=>setForm(p=>({...p,[f]:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,outline:"none"}}>{opts.map(o=><option key={o}>{o}</option>)}</select></div>
              ))}
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
              <button onClick={()=>setModal(false)} style={{padding:"8px 18px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer"}}>Cancelar</button>
              <button onClick={guardar} style={{padding:"8px 18px",borderRadius:8,border:"none",background:C.accent,color:"#fff",cursor:"pointer",fontWeight:700}}>Crear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// COBRANZA Y CUENTAS POR COBRAR
// ═══════════════════════════════════════════════════════════════════
function CobranzaModule({data, setData, embarques, liquidaciones, can, temporada}) {
  const enrichedAll = data.map(c=>{
    const emb = embarques.find(e=>e.id===c.embarqueId)||{};
    const liq = liquidaciones.find(l=>l.embarqueId===c.embarqueId)||{};
    return {...c, emb, liq};
  });
  const enriched = enrichedAll.filter(c=>c.emb.temporada===temporada);

  const totPendiente = enriched.filter(c=>c.estado!=="Pagado").reduce((s,c)=>s+(Number(c.montoPendiente)||0),0);
  const totCobrado = enriched.filter(c=>c.estado==="Pagado").reduce((s,c)=>s+(Number(c.montoCobrado)||0),0);

  function upd(id,c,v) {
    setData(prev=>prev.map(x=>x.id===id?{...x,[c]:v}:x));
  }

  return (
    <div>
      <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        <KPI label="💰 Por Cobrar" value={$$(totPendiente)} color={C.yellow}/>
        <KPI label="✅ Cobrado" value={$$(totCobrado)} color={C.green}/>
        <KPI label="📋 Registros" value={enriched.length} color={C.muted}/>
      </div>

      <div style={{overflowX:"auto",borderRadius:10,border:`1px solid ${C.border}`}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr style={{background:C.bg2}}>
            {["Contenedor","Cliente","Fruta","Monto Pendiente","Monto Cobrado","Fecha Cobro","Estado","N° Doc"].map(h=>
              <th key={h} style={{padding:"8px 10px",textAlign:h.includes("Monto")?"right":"left",color:C.muted,fontWeight:700,fontSize:10}}>{h}</th>)}
          </tr></thead>
          <tbody>
            {enriched.map((c,i)=>(
              <tr key={c.id} style={{borderBottom:`1px solid ${C.border}22`,background:i%2===0?"transparent":`${C.border}08`}}>
                <td style={{padding:"7px 10px",fontWeight:700,color:C.text}}>{c.emb.contenedor||"—"}</td>
                <td style={{padding:"7px 10px",color:C.muted}}>{c.emb.cliente||c.cliente||"—"}</td>
                <td style={{padding:"7px 10px"}}><span style={{fontSize:10,background:`${C.accent}22`,color:C.accentL,padding:"2px 8px",borderRadius:10,fontWeight:600}}>{c.emb.fruta||"—"}</span></td>
                <td style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:C.yellow}}>{$$(Number(c.montoPendiente)||0)}</td>
                <td style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:C.green}}>{$$(Number(c.montoCobrado)||0)}</td>
                <td style={{padding:"7px 10px",color:C.muted,fontSize:10}}>{c.fechaCobro||"—"}</td>
                <td style={{padding:"7px 10px"}}>
                  {can
                    ? <select value={c.estado||"Pendiente"} onChange={e=>upd(c.id,"estado",e.target.value)} style={{padding:"3px 6px",borderRadius:6,border:`1px solid ${c.estado==="Pagado"?C.green:C.yellow}`,background:`${c.estado==="Pagado"?C.green:C.yellow}22`,color:c.estado==="Pagado"?C.green:C.yellow,fontSize:10,fontWeight:700,cursor:"pointer",outline:"none"}}>
                        {ESTADOS_PAGO.map(s=><option key={s}>{s}</option>)}
                      </select>
                    : <span style={{fontSize:10,fontWeight:700,color:c.estado==="Pagado"?C.green:C.yellow}}>{c.estado||"Pendiente"}</span>
                  }
                </td>
                <td style={{padding:"7px 10px",color:C.muted}}>{c.nDoc||"—"}</td>
              </tr>
            ))}
            {enriched.length===0&&<tr><td colSpan={8} style={{padding:32,textAlign:"center",color:C.muted2}}>Sin registros de cobranza</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MÓDULO PRINCIPAL — ALLEGRIA FOODS HUB
// ═══════════════════════════════════════════════════════════════════
export default function AllegriaModule({usuarioActual, esAdmin, esSoloConsulta, tabPermisos={}, onBack, onLogout}) {
  const [subApp, setSubApp] = useState(null);
  const [liqTab, setLiqTab] = useState("productor");
  const [antTab, setAntTab] = useState("anticipos");
  const [data, setData] = useState({clientes:[],productores:[],programaComercial:[],embarques:[],liquidaciones:[],liqCliente:[],anticipos:[],cobranza:[],hubCardsOrder:null});
  const [cargando, setCargando] = useState(true);
  const [tempSeleccionada, setTempSeleccionada] = useState(temporadaActual());

  // Permisos
  const rolActual = usuarioActual?.rol || "editor";
  const can = rolActual === "admin" || (rolActual === "editor" && !esSoloConsulta(usuarioActual?.nombre));

  // Cargar datos
  useEffect(()=>{
    (async()=>{
      const d = await dbLoadAllegria();
      if(d) {
        setData(d);
        // Inicializar protección anti-pérdida
        window._lastSavedAllegria = {};
        ["clientes","productores","embarques","liquidaciones","liqCliente","anticipos","cobranza"].forEach(k=>{
          if(Array.isArray(d[k])) window._lastSavedAllegria[k] = d[k].length;
        });
        console.log("[Allegria] Protección anti-pérdida:", JSON.stringify(window._lastSavedAllegria));
      }
      setCargando(false);
    })();
  },[]);

  // Auto-guardar (debounce 2s para no ralentizar)
  const dataRef = useRef(data);
  useEffect(()=>{dataRef.current=data;},[data]);
  useEffect(()=>{
    if(cargando) return;
    const t=setTimeout(()=>dbSaveAllegria(dataRef.current), 2000);
    return()=>clearTimeout(t);
  },[data, cargando]);

  const setClientes = fn => setData(p=>({...p, clientes: typeof fn==="function"?fn(p.clientes||[]):fn}));
  const setProductores = fn => setData(p=>({...p, productores: typeof fn==="function"?fn(p.productores||[]):fn}));
  const setProgramaComercial = fn => setData(p=>({...p, programaComercial: typeof fn==="function"?fn(p.programaComercial||[]):fn}));
  const setEmbarques = fn => setData(p=>({...p, embarques: typeof fn==="function"?fn(p.embarques||[]):fn}));
  const setLiquidaciones = fn => setData(p=>({...p, liquidaciones: typeof fn==="function"?fn(p.liquidaciones||[]):fn}));
  const setLiqCliente = fn => setData(p=>({...p, liqCliente: typeof fn==="function"?fn(p.liqCliente||[]):fn}));
  const setAnticipos = fn => setData(p=>({...p, anticipos: typeof fn==="function"?fn(p.anticipos||[]):fn}));
  const setCobranza = fn => setData(p=>({...p, cobranza: typeof fn==="function"?fn(p.cobranza||[]):fn}));

  if(cargando) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",color:C.muted,fontFamily:"sans-serif"}}>Cargando Allegria Foods...</div>;

  // Sub-apps
  const SUBAPPS = [
    {id:"clientes",      label:"Clientes Importadores", desc:"Ficha importador, país destino, contacto, condiciones comerciales",          icon:"👥", color:"#b91c1c", stats:`${(data.clientes||[]).length} clientes`},
    {id:"productores",   label:"Productores",           desc:"Proveedores de fruta, zona, variedades, certificaciones",                     icon:"🌱", color:"#0f766e", stats:`${(data.productores||[]).length} productores`},
    {id:"programa",      label:"Programa Comercial",    desc:"Trisemanal kg-var, programa semanal, asignación productor→cliente",           icon:"📊", color:"#7c3aed", stats:`${(data.programaComercial||[]).length} programas`},
    {id:"embarques",     label:"Embarques",              desc:"Plan, instructivos, booking, documentos, QC, seguimiento, reclamos",         icon:"📦", color:"#2563eb", stats:`${(data.embarques||[]).length} embarques`},
    {id:"liquidaciones", label:"Liquidaciones",          desc:"Liquidación productor (retorno caja/kg) y cliente (del importador)",          icon:"💰", color:"#16a34a", stats:`${(data.liquidaciones||[]).length + (data.liqCliente||[]).length} liquidaciones`},
    {id:"anticipos",     label:"Anticipos & Cobranza",  desc:"Anticipos pre-season, contra BL, cobranza, pago liquidación",                icon:"💵", color:"#d97706", stats:`${(data.anticipos||[]).length + (data.cobranza||[]).length} registros`},
    {id:"dashboard",     label:"Dashboard",              desc:"KPIs por temporada, volumen por fruta/destino, resumen financiero",          icon:"📈", color:"#0ea5e9", stats:"Resumen"},
  ];

  if(subApp) {
    const sa = SUBAPPS.find(s=>s.id===subApp);
    const rango = rangoTemporada(tempSeleccionada);
    const rangoLabel = rango ? `${rango.inicioStr} al ${rango.finStr}` : "";
    return (
      <div style={{fontFamily:"sans-serif",background:C.bg,minHeight:"100vh",padding:"20px 20px 40px"}}>
        <NavBar breadcrumbItems={[
          {label:"Mediterra", onClick:onBack},
          {label:"Allegria Foods", onClick:()=>setSubApp(null)},
          {label:sa?.label||subApp},
        ]}/>
        {/* Logo + temporada */}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,flexWrap:"wrap"}}>
          <AllegriaLogo height={36}/>
          <div style={{flex:1}}>
            <div style={{fontSize:16,fontWeight:800,color:C.text}}>{sa?.label}</div>
            <div style={{fontSize:11,color:C.muted}}>{sa?.desc}</div>
          </div>
          {/* Selector temporada — no aplica a clientes ni productores (son maestros) */}
          {subApp!=="clientes"&&subApp!=="productores"&&(
            <div style={{display:"flex",alignItems:"center",gap:8,background:C.card2,borderRadius:10,padding:"8px 14px",border:`1px solid ${C.border}`}}>
              <span style={{fontSize:10,color:C.muted,fontWeight:700}}>🗓 Temporada:</span>
              <select value={tempSeleccionada} onChange={e=>setTempSeleccionada(e.target.value)}
                style={{padding:"5px 10px",borderRadius:8,border:`1px solid ${C.accent}`,background:C.card,color:C.accentL,fontSize:12,fontWeight:700,outline:"none",cursor:"pointer"}}>
                {TEMPORADAS.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
              <span style={{fontSize:9,color:C.muted}}>{rangoLabel}</span>
            </div>
          )}
        </div>
        <Card>
          {subApp==="clientes"&&<ClientesModule data={data.clientes||[]} setData={setClientes} can={can}/>}
          {subApp==="productores"&&<ProductoresModule data={data.productores||[]} setData={setProductores} can={can}/>}
          {subApp==="programa"&&<div style={{padding:30,textAlign:"center",color:C.muted}}>
            <div style={{fontSize:48,marginBottom:12}}>📊</div>
            <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:8}}>Programa Comercial</div>
            <div style={{fontSize:12}}>Trisemanal kg-var · Programa semanal · Asignación productor→cliente</div>
            <div style={{fontSize:11,color:"#94a3b8",marginTop:12}}>Módulo en construcción — próxima sesión</div>
          </div>}
          {subApp==="embarques"&&<EmbarquesModule data={data.embarques||[]} setData={setEmbarques} clientes={data.clientes||[]} productores={data.productores||[]} can={can} temporada={tempSeleccionada}/>}
          {subApp==="liquidaciones"&&<div>
            <div style={{display:"flex",gap:8,marginBottom:14}}>
              <button onClick={()=>setLiqTab("productor")} style={{padding:"8px 16px",borderRadius:8,border:liqTab==="productor"?"2px solid #16a34a":"1px solid #e2e8f0",background:liqTab==="productor"?"#16a34a":"#fff",color:liqTab==="productor"?"#fff":"#1e293b",cursor:"pointer",fontSize:12,fontWeight:700}}>💰 Liq. Productor</button>
              <button onClick={()=>setLiqTab("cliente")} style={{padding:"8px 16px",borderRadius:8,border:liqTab==="cliente"?"2px solid #2563eb":"1px solid #e2e8f0",background:liqTab==="cliente"?"#2563eb":"#fff",color:liqTab==="cliente"?"#fff":"#1e293b",cursor:"pointer",fontSize:12,fontWeight:700}}>📥 Liq. Cliente</button>
            </div>
            {liqTab==="productor"&&<LiquidacionesModule data={data.liquidaciones||[]} setData={setLiquidaciones} embarques={data.embarques||[]} can={can} temporada={tempSeleccionada}/>}
            {liqTab==="cliente"&&<LiquidacionClienteModule data={data.liqCliente||[]} setData={setLiqCliente} embarques={data.embarques||[]} can={can} temporada={tempSeleccionada}/>}
          </div>}
          {subApp==="anticipos"&&<div>
            <div style={{display:"flex",gap:8,marginBottom:14}}>
              <button onClick={()=>setAntTab("anticipos")} style={{padding:"8px 16px",borderRadius:8,border:antTab==="anticipos"?"2px solid #d97706":"1px solid #e2e8f0",background:antTab==="anticipos"?"#d97706":"#fff",color:antTab==="anticipos"?"#fff":"#1e293b",cursor:"pointer",fontSize:12,fontWeight:700}}>💵 Anticipos</button>
              <button onClick={()=>setAntTab("cobranza")} style={{padding:"8px 16px",borderRadius:8,border:antTab==="cobranza"?"2px solid #7c3aed":"1px solid #e2e8f0",background:antTab==="cobranza"?"#7c3aed":"#fff",color:antTab==="cobranza"?"#fff":"#1e293b",cursor:"pointer",fontSize:12,fontWeight:700}}>📋 Cobranza</button>
            </div>
            {antTab==="anticipos"&&<AnticiposModule data={data.anticipos||[]} setData={setAnticipos} clientes={data.clientes||[]} productores={data.productores||[]} can={can} temporada={tempSeleccionada}/>}
            {antTab==="cobranza"&&<CobranzaModule data={data.cobranza||[]} setData={setCobranza} embarques={data.embarques||[]} liquidaciones={data.liquidaciones||[]} can={can} temporada={tempSeleccionada}/>}
          </div>}
          {subApp==="dashboard"&&<div style={{padding:30,textAlign:"center",color:C.muted}}>
            <div style={{fontSize:48,marginBottom:12}}>📈</div>
            <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:8}}>Dashboard Allegria Foods</div>
            <div style={{fontSize:12}}>KPIs por temporada · Volumen por fruta/destino · Resumen financiero</div>
            <div style={{fontSize:11,color:"#94a3b8",marginTop:12}}>Módulo en construcción — próxima sesión</div>
          </div>}
        </Card>
      </div>
    );
  }

  // HOME — Allegria Foods Hub
  return (
    <div style={{fontFamily:"sans-serif",background:C.bg,minHeight:"100vh",padding:"20px 20px 40px"}}>
      <NavBar breadcrumbItems={[
        {label:"Mediterra", onClick:onBack},
        {label:"Allegria Foods Hub"},
      ]} onLogout={onLogout}/>

      {/* Logo + título */}
      <div style={{textAlign:"center",marginBottom:30}}>
        <div style={{display:"flex",justifyContent:"center",marginBottom:12}}>
          <AllegriaLogo height={60}/>
        </div>
        <div style={{color:C.muted,fontSize:13}}>Exportación de Fruta Fresca · Arándanos · Cerezas · Uvas · Ciruelas d'Agen · Zarzaparrilla</div>
      </div>

      {/* Sub-apps — drag-and-drop (solo admin) */}
      {(()=>{
        const HUB_DEFAULT = SUBAPPS.map(s=>s.id);
        const order = (Array.isArray(data.hubCardsOrder) && data.hubCardsOrder.length===HUB_DEFAULT.length) ? data.hubCardsOrder : HUB_DEFAULT;
        const handleDragStart = (e,id) => { window._dragCardA=id; window._didDragA=true; e.dataTransfer.effectAllowed="move"; };
        const handleDrop = (e,targetId) => {
          e.preventDefault(); e.stopPropagation();
          const from = window._dragCardA; if(!from||from===targetId){window._dragCardA=null;return;}
          const nw=[...order]; const fi=nw.indexOf(from), ti=nw.indexOf(targetId);
          if(fi===-1||ti===-1)return; nw.splice(fi,1); nw.splice(ti,0,from);
          setData(p=>({...p, hubCardsOrder:nw})); window._dragCardA=null;
        };
        const handleClick = (id) => { if(window._didDragA){window._didDragA=false;return;} setSubApp(id); };
        return (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16,maxWidth:950,margin:"0 auto 30px"}}>
            {order.map(sid=>{
              const sa = SUBAPPS.find(s=>s.id===sid);
              if(!sa) return null;
              return (
                <div key={sa.id} draggable={!!esAdmin}
                  onDragStart={e=>{if(!esAdmin)return;handleDragStart(e,sa.id);}}
                  onDragOver={e=>{if(!esAdmin)return;e.preventDefault();e.dataTransfer.dropEffect="move";}}
                  onDrop={e=>{if(!esAdmin)return;handleDrop(e,sa.id);}}
                  onDragEnd={()=>{setTimeout(()=>{window._didDragA=false;},100);window._dragCardA=null;}}
                  onClick={()=>handleClick(sa.id)}
                  style={{background:`linear-gradient(135deg,${C.card},${sa.color}22)`,borderRadius:16,padding:"24px 20px",
                    border:`1px solid ${sa.color}44`,cursor:"pointer",transition:"all 0.2s",position:"relative",overflow:"hidden"}}
                  onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"}
                  onMouseLeave={e=>e.currentTarget.style.transform="translateY(0)"}>
                  {esAdmin&&<div style={{position:"absolute",top:8,right:10,fontSize:10,color:"#475569",cursor:"grab"}} title="Arrastra para reordenar">⋮⋮</div>}
                  <div style={{fontSize:32,marginBottom:10}}>{sa.icon}</div>
                  <div style={{fontWeight:800,fontSize:16,color:C.text,marginBottom:4}}>{sa.label}</div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:12}}>{sa.desc}</div>
                  <div style={{display:"flex",gap:8}}>
                    <span style={{fontSize:10,background:`${sa.color}22`,color:sa.color,padding:"3px 10px",borderRadius:20,fontWeight:700}}>{sa.stats}</span>
                  </div>
                  <div style={{position:"absolute",right:16,bottom:16,fontSize:20,color:`${sa.color}44`}}>→</div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* KPIs globales */}
      <div style={{display:"flex",gap:12,flexWrap:"wrap",maxWidth:950,margin:"0 auto"}}>
        <KPI label="📦 Embarques" value={(data.embarques||[]).length} color={C.blue}/>
        <KPI label="🚢 En tránsito" value={(data.embarques||[]).filter(e=>e.estado==="En tránsito").length} color={C.yellow}/>
        <KPI label="✅ Llegados" value={(data.embarques||[]).filter(e=>e.estado==="Llegado").length} color={C.green}/>
        <KPI label="👥 Clientes" value={(data.clientes||[]).length} color={C.accent}/>
        <KPI label="🌱 Productores" value={(data.productores||[]).length} color={C.teal}/>
        <KPI label="💰 Liquidaciones" value={(data.liquidaciones||[]).length + (data.liqCliente||[]).length} color={C.green}/>
      </div>
    </div>
  );
}
