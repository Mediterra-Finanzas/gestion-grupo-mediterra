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
const TEMPORADAS = ["2024/2025", "2025/2026", "2026/2027", "2027/2028"];
const ESTADOS_EMBARQUE = ["Programado", "En tránsito", "En destino", "Entregado", "Liquidado"];
const ESTADOS_PAGO = ["Pendiente", "Parcial", "Pagado"];

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

// Logo Allegria Foods — intenta png y jpg, con fallback texto
function AllegriaLogo({height=52}) {
  const [err, setErr] = React.useState(0);
  const srcs = ["/allegria-logo.png","/allegria-logo.jpg","/allegria-logo.jpeg","/allegria-logo.PNG"];
  if(err >= srcs.length) return (
    <div style={{height,display:"flex",alignItems:"center",gap:8}}>
      <span style={{fontSize:height*0.5}}>🍒</span>
      <span style={{fontWeight:900,fontSize:height*0.35,color:"#e6edf3",letterSpacing:"-0.5px"}}>Allegría<span style={{color:"#ef4444",fontWeight:400,marginLeft:4}}>foods</span></span>
    </div>
  );
  return (
    <img src={srcs[err]} alt="Allegria Foods"
      onError={()=>setErr(e=>e+1)}
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
function EmbarquesModule({data, setData, clientes, productores, can}) {
  const [busq, setBusq] = useState("");
  const [filtroFruta, setFiltroFruta] = useState("Todos");
  const [filtroEstado, setFiltroEstado] = useState("Todos");
  const [filtroTemp, setFiltroTemp] = useState("Todos");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({contenedor:"",fruta:"Cerezas",origen:"Chile",destino:"China",cliente:"",productor:"",temporada:"2025/2026",kgNeto:"",cajas:"",etd:"",eta:"",naviera:"",booking:"",bl:"",estado:"Programado",precioFOB:"",siniestrado:false,notas:""});

  const filtrado = data.filter(e=>
    (filtroFruta==="Todos"||e.fruta===filtroFruta)&&
    (filtroEstado==="Todos"||e.estado===filtroEstado)&&
    (filtroTemp==="Todos"||e.temporada===filtroTemp)&&
    (!busq||e.contenedor?.toLowerCase().includes(busq.toLowerCase())||e.cliente?.toLowerCase().includes(busq.toLowerCase()))
  );

  const totKg = filtrado.reduce((s,e)=>s+(Number(e.kgNeto)||0),0);
  const totFOB = filtrado.reduce((s,e)=>s+(Number(e.kgNeto)||0)*(Number(e.precioFOB)||0),0);

  function guardar() {
    if(!form.contenedor.trim()){alert("N° contenedor es obligatorio.");return;}
    const id=`aemb_${Date.now()}`;
    setData(prev=>[...prev,{...form,id,kgNeto:Number(form.kgNeto)||0,cajas:Number(form.cajas)||0,precioFOB:Number(form.precioFOB)||0}]);
    window.auditLog&&window.auditLog("crear",{modulo:"allegria",seccion:"Embarques",descripcion:`Creó embarque ${form.contenedor} · ${form.fruta} → ${form.destino}`,registroId:id});
    setModal(false);
    setForm({contenedor:"",fruta:"Cerezas",origen:"Chile",destino:"China",cliente:"",productor:"",temporada:"2025/2026",kgNeto:"",cajas:"",etd:"",eta:"",naviera:"",booking:"",bl:"",estado:"Programado",precioFOB:"",notas:""});
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
        {[["Fruta",FRUTAS,filtroFruta,setFiltroFruta],["Estado",ESTADOS_EMBARQUE,filtroEstado,setFiltroEstado],["Temporada",TEMPORADAS,filtroTemp,setFiltroTemp]].map(([l,opts,v,set])=>(
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

function LiquidacionesModule({data, setData, embarques, can}) {
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

  const filtrado = enriched.filter(l=>filtroFruta==="Todos"||l.emb.fruta===filtroFruta);
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
                  {embarques.map(e=><option key={e.id} value={e.id}>{e.contenedor} · {e.fruta} · {e.productor||e.cliente} ({(Number(e.kgNeto)||0).toLocaleString()} kg)</option>)}
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
function LiquidacionClienteModule({data, setData, embarques, can}) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({embarqueId:"",montoRecibido:"",monedaRecibida:"USD",fechaRecepcion:"",nDocumento:"",deduccionesCalidad:"",deduccionesFlete:"",otrasDeduciones:"",montoNetoCli:"",notas:""});

  const enriched = data.map(l=>{
    const emb = embarques.find(e=>e.id===l.embarqueId)||{};
    const montoRecibido = Number(l.montoRecibido)||0;
    const dedCalidad = Number(l.deduccionesCalidad)||0;
    const dedFlete = Number(l.deduccionesFlete)||0;
    const dedOtras = Number(l.otrasDeduciones)||0;
    const totalDeducciones = dedCalidad + dedFlete + dedOtras;
    const netoCliente = montoRecibido - totalDeducciones;
    return {...l, emb, montoRecibido, totalDeducciones, netoCliente};
  });

  const totRecibido = enriched.reduce((s,l)=>s+l.montoRecibido,0);
  const totNeto = enriched.reduce((s,l)=>s+l.netoCliente,0);

  function guardar() {
    if(!form.embarqueId){alert("Selecciona un embarque.");return;}
    const id=`aliqc_${Date.now()}`;
    setData(prev=>[...prev,{...form,id}]);
    const emb=embarques.find(e=>e.id===form.embarqueId);
    window.auditLog&&window.auditLog("crear",{modulo:"allegria",seccion:"Liquidación Cliente",descripcion:`Creó liquidación cliente para ${emb?.contenedor||"—"}`,registroId:id});
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
                  {embarques.map(e=><option key={e.id} value={e.id}>{e.contenedor} · {e.fruta} · {e.cliente}</option>)}
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
function AnticiposModule({data, setData, clientes, productores, can}) {
  const [subTab, setSubTab] = useState("productores");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({tipo:"productor",entidad:"",monto:"",moneda:"USD",fecha:"",temporada:"2025/2026",fruta:"Cerezas",estado:"Pendiente",nDoc:"",notas:""});

  const anticiposProd = data.filter(a=>a.tipo==="productor");
  const anticiposCli = data.filter(a=>a.tipo==="cliente");
  const lista = subTab==="productores" ? anticiposProd : anticiposCli;
  const totProd = anticiposProd.reduce((s,a)=>s+(Number(a.monto)||0),0);
  const totCli = anticiposCli.reduce((s,a)=>s+(Number(a.monto)||0),0);

  function guardar() {
    if(!form.entidad.trim()){alert("Entidad es obligatoria.");return;}
    const id=`aant_${Date.now()}`;
    setData(prev=>[...prev,{...form,id,monto:Number(form.monto)||0}]);
    window.auditLog&&window.auditLog("crear",{modulo:"allegria",seccion:"Anticipos",descripcion:`Creó anticipo ${form.tipo} a "${form.entidad}" por ${$$(Number(form.monto)||0)}`,registroId:id});
    setModal(false);setForm({tipo:subTab==="productores"?"productor":"cliente",entidad:"",monto:"",moneda:"USD",fecha:"",temporada:"2025/2026",fruta:"Cerezas",estado:"Pendiente",nDoc:"",notas:""});
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
function CobranzaModule({data, setData, embarques, liquidaciones, can}) {
  const enriched = data.map(c=>{
    const emb = embarques.find(e=>e.id===c.embarqueId)||{};
    const liq = liquidaciones.find(l=>l.embarqueId===c.embarqueId)||{};
    return {...c, emb, liq};
  });

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
  const [data, setData] = useState({clientes:[],productores:[],embarques:[],liquidaciones:[],liqCliente:[],anticipos:[],cobranza:[]});
  const [cargando, setCargando] = useState(true);

  // Permisos
  const rolActual = usuarioActual?.rol || "editor";
  const can = rolActual === "admin" || (rolActual === "editor" && !esSoloConsulta(usuarioActual?.nombre));

  // Cargar datos
  useEffect(()=>{
    (async()=>{
      const d = await dbLoadAllegria();
      if(d) setData(d);
      setCargando(false);
    })();
  },[]);

  // Auto-guardar
  const dataRef = useRef(data);
  useEffect(()=>{dataRef.current=data;},[data]);
  useEffect(()=>{
    if(cargando) return;
    const t=setTimeout(()=>dbSaveAllegria(dataRef.current), 800);
    return()=>clearTimeout(t);
  },[data, cargando]);

  const setClientes = fn => setData(p=>({...p, clientes: typeof fn==="function"?fn(p.clientes||[]):fn}));
  const setProductores = fn => setData(p=>({...p, productores: typeof fn==="function"?fn(p.productores||[]):fn}));
  const setEmbarques = fn => setData(p=>({...p, embarques: typeof fn==="function"?fn(p.embarques||[]):fn}));
  const setLiquidaciones = fn => setData(p=>({...p, liquidaciones: typeof fn==="function"?fn(p.liquidaciones||[]):fn}));
  const setLiqCliente = fn => setData(p=>({...p, liqCliente: typeof fn==="function"?fn(p.liqCliente||[]):fn}));
  const setAnticipos = fn => setData(p=>({...p, anticipos: typeof fn==="function"?fn(p.anticipos||[]):fn}));
  const setCobranza = fn => setData(p=>({...p, cobranza: typeof fn==="function"?fn(p.cobranza||[]):fn}));

  if(cargando) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",color:C.muted,fontFamily:"sans-serif"}}>Cargando Allegria Foods...</div>;

  // Sub-apps
  const SUBAPPS = [
    {id:"clientes",      label:"Clientes Importadores", desc:"Gestión de importadores internacionales", icon:"👥", color:"#b91c1c", stats:`${(data.clientes||[]).length} clientes`},
    {id:"productores",   label:"Productores",           desc:"Proveedores de fruta fresca",              icon:"🌱", color:"#0f766e", stats:`${(data.productores||[]).length} productores`},
    {id:"embarques",     label:"Embarques",              desc:"Contenedores, tracking y documentos",     icon:"🚢", color:"#2563eb", stats:`${(data.embarques||[]).length} embarques`},
    {id:"liquidaciones", label:"Liquidación Productor",  desc:"Resultado de venta — retorno por caja y kg",  icon:"💰", color:"#16a34a", stats:`${(data.liquidaciones||[]).length} liquidaciones`},
    {id:"liq_cliente",   label:"Liquidación Cliente",    desc:"Liquidación recibida del importador",      icon:"📥", color:"#2563eb", stats:`${(data.liqCliente||[]).length} liquidaciones`},
    {id:"anticipos",     label:"Anticipos",              desc:"Anticipos a productores y de clientes",   icon:"💵", color:"#d97706", stats:`${(data.anticipos||[]).length} anticipos`},
    {id:"cobranza",      label:"Cobranza",               desc:"Cuentas por cobrar y seguimiento",        icon:"📋", color:"#7c3aed", stats:`${(data.cobranza||[]).length} registros`},
  ];

  if(subApp) {
    const sa = SUBAPPS.find(s=>s.id===subApp);
    return (
      <div style={{fontFamily:"sans-serif",background:C.bg,minHeight:"100vh",padding:"20px 20px 40px"}}>
        <NavBar breadcrumbItems={[
          {label:"Mediterra", onClick:onBack},
          {label:"Allegria Foods", onClick:()=>setSubApp(null)},
          {label:sa?.label||subApp},
        ]}/>
        {/* Logo compacto */}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
          <AllegriaLogo height={36}/>
          <div>
            <div style={{fontSize:16,fontWeight:800,color:C.text}}>{sa?.label}</div>
            <div style={{fontSize:11,color:C.muted}}>{sa?.desc}</div>
          </div>
        </div>
        <Card>
          {subApp==="clientes"&&<ClientesModule data={data.clientes||[]} setData={setClientes} can={can}/>}
          {subApp==="productores"&&<ProductoresModule data={data.productores||[]} setData={setProductores} can={can}/>}
          {subApp==="embarques"&&<EmbarquesModule data={data.embarques||[]} setData={setEmbarques} clientes={data.clientes||[]} productores={data.productores||[]} can={can}/>}
          {subApp==="liquidaciones"&&<LiquidacionesModule data={data.liquidaciones||[]} setData={setLiquidaciones} embarques={data.embarques||[]} can={can}/>}
          {subApp==="liq_cliente"&&<LiquidacionClienteModule data={data.liqCliente||[]} setData={setLiqCliente} embarques={data.embarques||[]} can={can}/>}
          {subApp==="anticipos"&&<AnticiposModule data={data.anticipos||[]} setData={setAnticipos} clientes={data.clientes||[]} productores={data.productores||[]} can={can}/>}
          {subApp==="cobranza"&&<CobranzaModule data={data.cobranza||[]} setData={setCobranza} embarques={data.embarques||[]} liquidaciones={data.liquidaciones||[]} can={can}/>}
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
        <div style={{color:C.muted,fontSize:13}}>Exportación de Fruta Fresca · Cerezas · Ciruelas · Arándanos</div>
      </div>

      {/* Sub-apps */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16,maxWidth:950,margin:"0 auto 30px"}}>
        {SUBAPPS.map(sa=>(
          <div key={sa.id} onClick={()=>setSubApp(sa.id)}
            style={{background:`linear-gradient(135deg,${C.card},${sa.color}22)`,borderRadius:16,padding:"24px 20px",
              border:`1px solid ${sa.color}44`,cursor:"pointer",transition:"all 0.2s",position:"relative",overflow:"hidden"}}
            onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"}
            onMouseLeave={e=>e.currentTarget.style.transform="translateY(0)"}>
            <div style={{fontSize:32,marginBottom:10}}>{sa.icon}</div>
            <div style={{fontWeight:800,fontSize:16,color:C.text,marginBottom:4}}>{sa.label}</div>
            <div style={{fontSize:11,color:C.muted,marginBottom:12}}>{sa.desc}</div>
            <div style={{display:"flex",gap:8}}>
              <span style={{fontSize:10,background:`${sa.color}22`,color:sa.color,padding:"3px 10px",borderRadius:20,fontWeight:700}}>{sa.stats}</span>
            </div>
            <div style={{position:"absolute",right:16,bottom:16,fontSize:20,color:`${sa.color}44`}}>→</div>
          </div>
        ))}
      </div>

      {/* KPIs globales */}
      <div style={{display:"flex",gap:12,flexWrap:"wrap",maxWidth:950,margin:"0 auto"}}>
        <KPI label="📦 Embarques" value={(data.embarques||[]).length} color={C.blue}/>
        <KPI label="🚢 En tránsito" value={(data.embarques||[]).filter(e=>e.estado==="En tránsito").length} color={C.yellow}/>
        <KPI label="👥 Clientes" value={(data.clientes||[]).length} color={C.accent}/>
        <KPI label="🌱 Productores" value={(data.productores||[]).length} color={C.teal}/>
      </div>
    </div>
  );
}
