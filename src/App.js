import { useState, useEffect, useCallback } from "react";
import OsirisModule from "./OsirisModule";
import FinanzasModule from "./FinanzasModule";

const EMAILJS_SERVICE  = "service_ahuerta";
const EMAILJS_TEMPLATE = "template_c7yup8d";
const EMAILJS_KEY      = "bwCBq7JXlEwCTzWNe";
const FECHA_INICIO     = new Date(2026, 3, 13);

const SUPA_URL = "https://bywovqayuzodbzwsriet.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5d292cWF5dXpvZGJ6d3NyaWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODU1MDgsImV4cCI6MjA5MTI2MTUwOH0.s2x2O_CxE6rl8dBqFuyfQdMyRqSyjJQWXJXesmVGXtk";

async function dbLoad() {
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/calendario_data?id=eq.main&select=value`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
    });
    const data = await res.json();
    return data?.[0]?.value || null;
  } catch { return null; }
}

async function dbSave(value) {
  try {
    await fetch(`${SUPA_URL}/rest/v1/calendario_data`, {
      method: "POST",
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates"
      },
      body: JSON.stringify({ id: "main", value, updated_at: new Date().toISOString() })
    });
  } catch(e) { console.error("Error guardando:", e); }
}

async function enviarEmail(toEmail, nombre, asunto, cuerpo) {
  await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({service_id:EMAILJS_SERVICE,template_id:EMAILJS_TEMPLATE,user_id:EMAILJS_KEY,
      template_params:{nombre,pin_temporal:cuerpo,to_email:toEmail,subject:asunto}})
  });
}

const DIAS_SEMANA = ["Lunes","Martes","Miercoles","Jueves","Viernes"];
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const FRECUENCIAS = ["Diaria","Semanal","Mensual"];

// Roles del sistema
const ROLES = [
  {v:"admin",    l:"Administrador – acceso total"},
  {v:"editor",   l:"Editor – gestiona sus tareas"},
  {v:"consulta", l:"Consulta – solo visualiza"},
];

// Módulos disponibles — agregar aquí nuevos módulos en el futuro
const MODULOS_DISPONIBLES = [
  {id:"tareas",   label:"Seguimiento Tareas",      sublabel:"Administración y Finanzas", icon:"📋", color:"#2563eb", bg:"#dbeafe", grad:"linear-gradient(135deg,#1e3a5f,#2563eb)"},
  {id:"osiris",   label:"Osiris Plant Management", sublabel:"Gestión de Ingresos",       icon:"🌿", color:"#0f766e", bg:"#ccfbf1", grad:"linear-gradient(135deg,#0f2d4a,#0f766e)"},
  {id:"finanzas", label:"Finanzas",                sublabel:"Flujo de Caja Grupo Mediterra", icon:"💼", color:"#0d6b3a", bg:"#d1fae5", grad:"linear-gradient(135deg,#0d2137,#0a3d2b)"},
  // Futuros módulos se agregan aquí:
  // {id:"frisku", label:"Frisku Foods", sublabel:"Gestión Operacional", icon:"🫐", color:"#7c3aed", bg:"#ede9fe", grad:"linear-gradient(135deg,#1a1a2e,#7c3aed)"},
];

function diaHabil(anio,mes,dia){
  const f=new Date(anio,mes,dia);const d=f.getDay();
  if(d===6)f.setDate(f.getDate()+2);if(d===0)f.setDate(f.getDate()+1);return f;
}
function mesAnteriorAlInicio(anio,mes){
  return new Date(anio,mes,1)<new Date(FECHA_INICIO.getFullYear(),FECHA_INICIO.getMonth(),1);
}

const RECORDATORIOS=[
  {id:"rec1",titulo:"Emision Factura Corporativo",diaMes:4,destinatarios:["Milagros Becerra"],copia:["Carol Machuca"],
    mensaje:(n)=>`Estimada ${n.split(" ")[0]}, te recordamos que el dia 4 de este mes corresponde emitir la factura de servicios Corporativo.`},
  {id:"rec2",titulo:"Emision Factura Frisku",diaMes:25,destinatarios:["Milagros Becerra"],copia:["Carol Machuca"],
    mensaje:(n)=>`Estimada ${n.split(" ")[0]}, te recordamos que el dia 25 de este mes corresponde emitir la factura de servicios Frisku.`},
];

function getRecordatoriosActivos(nombre,anio,mes,esAdm){
  const hoy=new Date();hoy.setHours(0,0,0,0);
  return RECORDATORIOS
    .filter(r=>r.destinatarios.includes(nombre)||r.copia.includes(nombre)||esAdm)
    .map(r=>{const fv=diaHabil(anio,mes,r.diaMes);const fa=new Date(fv);fa.setDate(fv.getDate()-2);const diff=Math.ceil((fv-hoy)/(1000*60*60*24));return{...r,fechaVence:fv,diff,activo:hoy>=fa};})
    .filter(r=>r.activo);
}

const SEMAFORO={
  verde:   {label:"Completado", color:"#22c55e",bg:"#dcfce7",border:"#86efac"},
  amarillo:{label:"En proceso", color:"#eab308",bg:"#fef9c3",border:"#fde047"},
  rojo:    {label:"Pendiente",  color:"#ef4444",bg:"#fee2e2",border:"#fca5a5"},
  gris:    {label:"Sin iniciar",color:"#9ca3af",bg:"#f3f4f6",border:"#d1d5db"},
  na:      {label:"No Aplica",  color:"#475569",bg:"#f1f5f9",border:"#94a3b8"},
};
const ORDEN_SEM=["gris","verde","amarillo","rojo","na"];

const WORKERS_BASE=[
  {nombre:"Milagros Becerra",cargo:"Sec. Administrativa",     email:"Mbecerra@grupomediterra.cl",pin:"4827",rol:"editor", modulos:["tareas"],           esCFO:false},
  {nombre:"Carol Machuca",   cargo:"Analista Finanzas",       email:"cmachuca@grupomediterra.cl",pin:"3159",rol:"editor", modulos:["tareas","osiris"],   esCFO:false},
  {nombre:"Michelle Garcia", cargo:"Contadora General",       email:"mgarcia@grupomediterra.cl", pin:"7413",rol:"editor", modulos:["tareas"],           esCFO:false},
  {nombre:"Pablo Duran",     cargo:"Asistente Contable",      email:"pduran@grupomediterra.cl",  pin:"2986",rol:"editor", modulos:["tareas"],           esCFO:false},
  {nombre:"Angelo Huerta",   cargo:"Gerencia Adm. y Finanzas",email:"ahuerta@grupomediterra.cl", pin:"6054",rol:"admin",  modulos:["tareas","osiris"],   esCFO:true},
];

const CATEGORIAS={
  "Finanzas":      {color:"#3b82f6",bg:"#dbeafe"},
  "Contabilidad":  {color:"#8b5cf6",bg:"#ede9fe"},
  "Tesoreria":     {color:"#f59e0b",bg:"#fef3c7"},
  "Tributario":    {color:"#ef4444",bg:"#fee2e2"},
  "Administracion":{color:"#10b981",bg:"#d1fae5"},
  "Gerencia":      {color:"#6366f1",bg:"#e0e7ff"},
};

const TAREAS_BASE=[
  {id:"s1", nombre:"Gestion documental",                                   responsable:"Milagros Becerra",supervisor:"Angelo Huerta",  categoria:"Administracion",frecuencia:"Semanal",diaLimiteSem:4,diaLimite:28,dependeDe:null},
  {id:"s2", nombre:"Preparacion de nominas de pago",                       responsable:"Milagros Becerra",supervisor:"Carol Machuca",  categoria:"Tesoreria",     frecuencia:"Semanal",diaLimiteSem:1,diaLimite:5, dependeDe:null},
  {id:"s3", nombre:"Entrega nominas de pago para revision",                responsable:"Milagros Becerra",supervisor:"Angelo Huerta",  categoria:"Tesoreria",     frecuencia:"Semanal",diaLimiteSem:2,diaLimite:7, dependeDe:null},
  {id:"s4", nombre:"Carga nominas al banco y envio email para aprobacion", responsable:"Milagros Becerra",supervisor:"Angelo Huerta",  categoria:"Tesoreria",     frecuencia:"Semanal",diaLimiteSem:3,diaLimite:8, dependeDe:null},
  {id:"s5", nombre:"Seguimiento documentos",                               responsable:"Milagros Becerra",supervisor:"",               categoria:"Administracion",frecuencia:"Semanal",diaLimiteSem:4,diaLimite:28,dependeDe:null},
  {id:"s6", nombre:"Envio nominas a contabilidad para registros",          responsable:"Milagros Becerra",supervisor:"Pablo Duran",    categoria:"Contabilidad",  frecuencia:"Semanal",diaLimiteSem:3,diaLimite:8, dependeDe:null},
  {id:"s7", nombre:"Registro documentos mercantiles",                      responsable:"Milagros Becerra",supervisor:"",               categoria:"Administracion",frecuencia:"Semanal",diaLimiteSem:0,diaLimite:5, dependeDe:null},
  {id:"s8", nombre:"Revision gastos menores y respaldos",                  responsable:"Milagros Becerra",supervisor:"Carol Machuca",  categoria:"Tesoreria",     frecuencia:"Semanal",diaLimiteSem:2,diaLimite:7, dependeDe:null},
  {id:"s9", nombre:"Envio de email a Daniel",                              responsable:"Milagros Becerra",supervisor:"",               categoria:"Administracion",frecuencia:"Semanal",diaLimiteSem:0,diaLimite:5, dependeDe:null},
  {id:"s10",nombre:"Gestion con bancos por compra venta de divisas",       responsable:"Milagros Becerra",supervisor:"Angelo Huerta",  categoria:"Tesoreria",     frecuencia:"Semanal",diaLimiteSem:2,diaLimite:7, dependeDe:null},
  {id:"s11",nombre:"Email solicitud anticipo sueldo Allpa y Allegria",     responsable:"Milagros Becerra",supervisor:"Angelo Huerta",  categoria:"Administracion",frecuencia:"Semanal",diaLimiteSem:1,diaLimite:5, dependeDe:null},
  {id:"s12",nombre:"Tareas de apoyo a Gerencia (reuniones, etc)",          responsable:"Milagros Becerra",supervisor:"Angelo Huerta",  categoria:"Gerencia",      frecuencia:"Semanal",diaLimiteSem:4,diaLimite:28,dependeDe:null},
  {id:"s13",nombre:"Cobranza de empresas",                                 responsable:"Carol Machuca",   supervisor:"Angelo Huerta",  categoria:"Finanzas",      frecuencia:"Semanal",diaLimiteSem:0,diaLimite:5, dependeDe:null},
  {id:"s14",nombre:"Primera Revision nominas de pago",                     responsable:"Carol Machuca",   supervisor:"",               categoria:"Tesoreria",     frecuencia:"Semanal",diaLimiteSem:1,diaLimite:5, dependeDe:"s2"},
  {id:"s15",nombre:"Registro contable",                                    responsable:"Michelle Garcia", supervisor:"Angelo Huerta",  categoria:"Contabilidad",  frecuencia:"Semanal",diaLimiteSem:2,diaLimite:7, dependeDe:null},
  {id:"s16",nombre:"Conciliaciones",                                       responsable:"Michelle Garcia", supervisor:"Angelo Huerta",  categoria:"Contabilidad",  frecuencia:"Semanal",diaLimiteSem:3,diaLimite:7, dependeDe:null},
  {id:"s17",nombre:"Ingreso movimientos bancarios",                        responsable:"Pablo Duran",     supervisor:"Michelle Garcia",categoria:"Contabilidad",  frecuencia:"Semanal",diaLimiteSem:0,diaLimite:5, dependeDe:null},
  {id:"s18",nombre:"Registro pagos de nominas",                            responsable:"Pablo Duran",     supervisor:"Michelle Garcia",categoria:"Contabilidad",  frecuencia:"Semanal",diaLimiteSem:3,diaLimite:8, dependeDe:"s6"},
  {id:"m1", nombre:"EERR real vs presupuesto + analisis de variaciones",   responsable:"Carol Machuca",   supervisor:"Angelo Huerta",  categoria:"Finanzas",      frecuencia:"Mensual",diaLimiteSem:0,diaLimite:18,dependeDe:"m11"},
  {id:"m2", nombre:"Identificacion de riesgos financieros",                responsable:"Carol Machuca",   supervisor:"Angelo Huerta",  categoria:"Finanzas",      frecuencia:"Mensual",diaLimiteSem:0,diaLimite:20,dependeDe:null},
  {id:"m3", nombre:"Preparacion planillas anticipo clientes",              responsable:"Carol Machuca",   supervisor:"Angelo Huerta",  categoria:"Finanzas",      frecuencia:"Mensual",diaLimiteSem:0,diaLimite:5, dependeDe:null},
  {id:"m4", nombre:"Preparacion planillas anticipo productores",           responsable:"Carol Machuca",   supervisor:"Angelo Huerta",  categoria:"Finanzas",      frecuencia:"Mensual",diaLimiteSem:0,diaLimite:5, dependeDe:null},
  {id:"m5", nombre:"Chequeo contratos firmados y cargados en nube",        responsable:"Carol Machuca",   supervisor:"Angelo Huerta",  categoria:"Administracion",frecuencia:"Mensual",diaLimiteSem:0,diaLimite:10,dependeDe:null},
  {id:"m6", nombre:"Revision de proveedores masivo",                       responsable:"Carol Machuca",   supervisor:"",               categoria:"Finanzas",      frecuencia:"Mensual",diaLimiteSem:0,diaLimite:10,dependeDe:null},
  {id:"m7", nombre:"Primera Revision nominas Chile",                       responsable:"Carol Machuca",   supervisor:"",               categoria:"Tesoreria",     frecuencia:"Mensual",diaLimiteSem:0,diaLimite:5, dependeDe:null},
  {id:"m8", nombre:"Primera Revision nominas Peru",                        responsable:"Carol Machuca",   supervisor:"",               categoria:"Tesoreria",     frecuencia:"Mensual",diaLimiteSem:0,diaLimite:5, dependeDe:null},
  {id:"m9", nombre:"Retroalimentacion con Gerentes por desviaciones",      responsable:"Carol Machuca",   supervisor:"Angelo Huerta",  categoria:"Finanzas",      frecuencia:"Mensual",diaLimiteSem:0,diaLimite:22,dependeDe:"m1"},
  {id:"m10",nombre:"Analisis de cuenta",                                   responsable:"Michelle Garcia", supervisor:"Angelo Huerta",  categoria:"Contabilidad",  frecuencia:"Mensual",diaLimiteSem:0,diaLimite:10,dependeDe:null},
  {id:"m11",nombre:"Entrega Final Estados Financieros",                    responsable:"Michelle Garcia", supervisor:"Angelo Huerta",  categoria:"Contabilidad",  frecuencia:"Mensual",diaLimiteSem:0,diaLimite:15,dependeDe:"m12"},
  {id:"m12",nombre:"Preparacion estados financieros grupo",                responsable:"Michelle Garcia", supervisor:"Angelo Huerta",  categoria:"Contabilidad",  frecuencia:"Mensual",diaLimiteSem:0,diaLimite:13,dependeDe:"m13"},
  {id:"m13",nombre:"Cierre contable",                                      responsable:"Michelle Garcia", supervisor:"Angelo Huerta",  categoria:"Contabilidad",  frecuencia:"Mensual",diaLimiteSem:0,diaLimite:10,dependeDe:null},
  {id:"m14",nombre:"Formulario 29",                                        responsable:"Michelle Garcia", supervisor:"Angelo Huerta",  categoria:"Tributario",    frecuencia:"Mensual",diaLimiteSem:0,diaLimite:12,dependeDe:null},
  {id:"m15",nombre:"Formulario 50",                                        responsable:"Michelle Garcia", supervisor:"Angelo Huerta",  categoria:"Tributario",    frecuencia:"Mensual",diaLimiteSem:0,diaLimite:12,dependeDe:null},
  {id:"m16",nombre:"Analisis registros contables",                         responsable:"Michelle Garcia", supervisor:"Angelo Huerta",  categoria:"Contabilidad",  frecuencia:"Mensual",diaLimiteSem:0,diaLimite:15,dependeDe:null},
  {id:"m17",nombre:"Pago Formulario 29",                                   responsable:"Angelo Huerta",   supervisor:"",               categoria:"Tributario",    frecuencia:"Mensual",diaLimiteSem:0,diaLimite:20,dependeDe:"m14"},
  {id:"m18",nombre:"Pago Formulario 50",                                   responsable:"Angelo Huerta",   supervisor:"",               categoria:"Tributario",    frecuencia:"Mensual",diaLimiteSem:0,diaLimite:20,dependeDe:"m15"},
  {id:"m19",nombre:"Analisis de cuenta",                                   responsable:"Pablo Duran",     supervisor:"Michelle Garcia",categoria:"Contabilidad",  frecuencia:"Mensual",diaLimiteSem:0,diaLimite:8, dependeDe:null},
  {id:"m20",nombre:"Apoyo cierre",                                         responsable:"Pablo Duran",     supervisor:"Michelle Garcia",categoria:"Contabilidad",  frecuencia:"Mensual",diaLimiteSem:0,diaLimite:10,dependeDe:null},
];

function semanasDelMes(anio,mes){
  const semanas=[];const p=new Date(anio,mes,1);const u=new Date(anio,mes+1,0);
  let f=new Date(p);const d=(f.getDay()+6)%7;f.setDate(f.getDate()-d);
  while(f<=u){
    const t=new Date(f);t.setDate(t.getDate()+3);
    const w1=new Date(t.getFullYear(),0,4);
    const iso=1+Math.round(((t-w1)/86400000-3+((w1.getDay()+6)%7))/7);
    const fin=new Date(f);fin.setDate(f.getDate()+6);
    if(f.getMonth()===mes||fin.getMonth()===mes)semanas.push({num:semanas.length+1,iso,inicioSem:new Date(f)});
    f.setDate(f.getDate()+7);
  }
  return semanas;
}

function fechaDiaSemana(ini,ds){const f=new Date(ini);f.setDate(ini.getDate()+ds);return f;}
function semanaActivaDefault(semanas){
  const hoy=new Date();hoy.setHours(0,0,0,0);
  for(const s of semanas){const fin=new Date(s.inicioSem);fin.setDate(s.inicioSem.getDate()+6);if(hoy>=s.inicioSem&&hoy<=fin)return s.num;}
  return semanas[0]?.num||1;
}

function MediterraLogo({size=80}){
  return <img src="/med.png" alt="Mediterra" style={{width:size,height:size,objectFit:"contain",display:"block"}}/>;
}

// ── Helper: qué módulos puede ver este usuario ──────────────
function modulosDeUsuario(usuario){
  if(!usuario) return [];
  // Admin siempre ve todo
  if(usuario.rol === "admin") return MODULOS_DISPONIBLES.map(m=>m.id);
  // Usar array modulos[] del usuario
  return Array.isArray(usuario.modulos) ? usuario.modulos : ["tareas"];
}

function OsirisLogoSmall() {
  return (
    <img src="/osiris-logo.jpg" alt="Osiris Plant Management"
      style={{height:70, objectFit:"contain", display:"block", marginBottom:6}}/>
  );
}

// ══════════════════════════════════════════════════════════
// PANEL DE PERMISOS — solo visible para admin en el Hub
// ══════════════════════════════════════════════════════════
function PanelPermisos({ usuarios, setUsuarios, onClose }) {

  function toggleModulo(nombreU, modId) {
    setUsuarios(prev => prev.map(u => {
      if (u.nombre !== nombreU) return u;
      const mods = Array.isArray(u.modulos) ? [...u.modulos] : ["tareas"];
      if (mods.includes(modId)) {
        // No dejar vacío — al menos un módulo
        if (mods.length === 1) return u;
        return { ...u, modulos: mods.filter(m => m !== modId) };
      } else {
        return { ...u, modulos: [...mods, modId] };
      }
    }));
  }

  function setRol(nombreU, rol) {
    setUsuarios(prev => prev.map(u => u.nombre === nombreU ? { ...u, rol, modulos: rol === "admin" ? MODULOS_DISPONIBLES.map(m=>m.id) : (Array.isArray(u.modulos) ? u.modulos : ["tareas"]) } : u));
  }

  function toggleActivar(nombreU) {
    setUsuarios(prev => prev.map(u => u.nombre === nombreU ? { ...u, desactivado: !u.desactivado } : u));
  }

  const activos = usuarios.filter(u => !u.desactivado);
  const inactivos = usuarios.filter(u => u.desactivado);

  return (
    <div style={{position:"fixed",inset:0,background:"#000a",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"sans-serif",padding:16}}>
      <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:760,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 64px #0006"}}>
        {/* Header panel */}
        <div style={{background:"linear-gradient(135deg,#1e3a5f,#2563eb)",borderRadius:"20px 20px 0 0",padding:"20px 28px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.6)",letterSpacing:2,marginBottom:2}}>ADMINISTRACIÓN</div>
            <div style={{fontSize:17,fontWeight:800,color:"#fff"}}>⚙️ Gestión de Accesos y Permisos</div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:8,padding:"6px 16px",cursor:"pointer",fontSize:13,fontWeight:600}}>Cerrar ×</button>
        </div>

        <div style={{padding:"24px 28px"}}>
          {/* Leyenda módulos */}
          <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap"}}>
            <div style={{fontSize:12,color:"#64748b",fontWeight:600,alignSelf:"center"}}>Módulos:</div>
            {MODULOS_DISPONIBLES.map(m=>(
              <span key={m.id} style={{background:m.bg,color:m.color,border:`1px solid ${m.color}44`,borderRadius:20,padding:"3px 12px",fontSize:11,fontWeight:700}}>
                {m.icon} {m.label}
              </span>
            ))}
          </div>

          {/* Tabla usuarios activos */}
          <div style={{fontSize:12,color:"#94a3b8",fontWeight:700,marginBottom:8,letterSpacing:1}}>USUARIOS ACTIVOS</div>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:24}}>
            {activos.map(u => {
              const mods = Array.isArray(u.modulos) ? u.modulos : (u.rol==="admin"?["tareas","osiris"]:["tareas"]);
              return (
                <div key={u.nombre} style={{background:"#f8fafc",borderRadius:12,padding:"14px 18px",border:"1px solid #e2e8f0"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10}}>
                    {/* Info usuario */}
                    <div style={{flex:1,minWidth:160}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontWeight:700,fontSize:14,color:"#1e293b"}}>{u.nombre}</span>
                        <span style={{fontSize:10,background:u.rol==="admin"?"#fef3c7":u.rol==="consulta"?"#ede9fe":"#dcfce7",color:u.rol==="admin"?"#92400e":u.rol==="consulta"?"#6d28d9":"#166534",borderRadius:20,padding:"1px 8px",fontWeight:700}}>
                          {u.rol==="admin"?"Admin":u.rol==="consulta"?"Consulta":"Editor"}
                        </span>
                      </div>
                      <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{u.cargo}</div>
                    </div>

                    {/* Checkboxes módulos */}
                    <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                      <span style={{fontSize:11,color:"#64748b",fontWeight:600}}>Acceso a:</span>
                      {MODULOS_DISPONIBLES.map(m=>{
                        const tiene = u.rol==="admin" || mods.includes(m.id);
                        return (
                          <label key={m.id} style={{display:"flex",alignItems:"center",gap:5,cursor:u.rol==="admin"?"not-allowed":"pointer",
                            background:tiene?m.bg:"#f1f5f9",border:`1px solid ${tiene?m.color+"66":"#d1d5db"}`,
                            borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:600,color:tiene?m.color:"#94a3b8",
                            opacity:u.rol==="admin"?0.7:1}}>
                            <input type="checkbox" checked={tiene} disabled={u.rol==="admin"}
                              onChange={()=>toggleModulo(u.nombre,m.id)}
                              style={{cursor:u.rol==="admin"?"not-allowed":"pointer",accentColor:m.color}}/>
                            {m.icon} {m.label}
                          </label>
                        );
                      })}
                    </div>

                    {/* Rol + desactivar */}
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <select value={u.rol} onChange={e=>setRol(u.nombre,e.target.value)}
                        style={{padding:"5px 8px",borderRadius:8,border:"1px solid #d1d5db",fontSize:11,cursor:"pointer",background:"#fff"}}>
                        <option value="editor">Editor</option>
                        <option value="consulta">Consulta</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button onClick={()=>toggleActivar(u.nombre)}
                        style={{background:"#fee2e2",color:"#991b1b",border:"none",borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>
                        Desactivar
                      </button>
                    </div>
                  </div>
                  {u.rol==="admin"&&<div style={{fontSize:10,color:"#64748b",marginTop:6}}>⚙️ Admin tiene acceso automático a todos los módulos</div>}
                </div>
              );
            })}
          </div>

          {/* Usuarios inactivos */}
          {inactivos.length>0&&(
            <>
              <div style={{fontSize:12,color:"#94a3b8",fontWeight:700,marginBottom:8,letterSpacing:1}}>USUARIOS INACTIVOS</div>
              {inactivos.map(u=>(
                <div key={u.nombre} style={{background:"#f8fafc",borderRadius:12,padding:"12px 18px",border:"1px solid #e2e8f0",display:"flex",justifyContent:"space-between",alignItems:"center",opacity:0.6,marginBottom:8}}>
                  <div>
                    <span style={{fontWeight:600,fontSize:13,color:"#64748b"}}>{u.nombre}</span>
                    <span style={{fontSize:11,background:"#fee2e2",color:"#991b1b",borderRadius:20,padding:"1px 8px",marginLeft:8,fontWeight:700}}>Inactivo</span>
                  </div>
                  <button onClick={()=>toggleActivar(u.nombre)}
                    style={{background:"#dcfce7",color:"#166534",border:"none",borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:600}}>
                    Activar
                  </button>
                </div>
              ))}
            </>
          )}

          <div style={{background:"#dbeafe",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#1d4ed8",marginTop:8}}>
            💾 Los cambios se guardan automáticamente en tiempo real.
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// PANTALLA HUB — Gestión Grupo Mediterra
// ══════════════════════════════════════════════════════════
function HubScreen({ usuario, modulosPermitidos, onSelectModulo, onLogout, onCambiarPin, esSoloConsulta, usuarios, setUsuarios }) {
  const hoy = new Date();
  const fechaStr = hoy.toLocaleDateString("es-CL", {weekday:"long", day:"numeric", month:"long", year:"numeric"});
  const [mostrarPermisos, setMostrarPermisos] = useState(false);

  return (
    <div style={{minHeight:"100vh", background:"linear-gradient(160deg,#0f172a 0%,#1e3a5f 50%,#0f2d4a 100%)", fontFamily:"sans-serif", padding:"0 0 40px"}}>

      {mostrarPermisos && (
        <PanelPermisos usuarios={usuarios} setUsuarios={setUsuarios} onClose={()=>setMostrarPermisos(false)}/>
      )}

      {/* Header */}
      <div style={{padding:"24px 32px 0", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12}}>
        <div style={{display:"flex", alignItems:"center", gap:14}}>
          <MediterraLogo size={52}/>
          <div>
            <div style={{fontSize:10, letterSpacing:4, color:"#7ecfca", fontWeight:700, textTransform:"uppercase"}}>MEDITERRA</div>
            <div style={{fontSize:18, fontWeight:800, color:"#fff", lineHeight:1.2}}>Gestión Grupo Mediterra</div>
          </div>
        </div>
        <div style={{display:"flex", gap:8, alignItems:"center", flexWrap:"wrap"}}>
          <div style={{fontSize:11, color:"rgba(255,255,255,0.5)", textAlign:"right"}}>
            <div style={{textTransform:"capitalize"}}>{fechaStr}</div>
            <div>Hola, <strong style={{color:"#fff"}}>{usuario.nombre.split(" ")[0]}</strong> · {usuario.cargo}</div>
          </div>
          {usuario.rol === "admin" && (
            <button onClick={()=>setMostrarPermisos(true)}
              style={{background:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.3)", color:"#fff", borderRadius:8, padding:"6px 14px", cursor:"pointer", fontSize:12, fontWeight:600}}>
              ⚙️ Permisos
            </button>
          )}
          {!esSoloConsulta(usuario.nombre) &&
            <button onClick={onCambiarPin} style={{background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", color:"#fff", borderRadius:8, padding:"6px 14px", cursor:"pointer", fontSize:12}}>🔑 PIN</button>
          }
          <button onClick={onLogout} style={{background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", color:"#fff", borderRadius:8, padding:"6px 14px", cursor:"pointer", fontSize:12}}>Salir</button>
        </div>
      </div>

      {/* Título central */}
      <div style={{textAlign:"center", padding:"48px 24px 32px"}}>
        <div style={{fontSize:13, color:"rgba(255,255,255,0.5)", letterSpacing:3, textTransform:"uppercase", marginBottom:10}}>Selecciona un módulo</div>
        <h1 style={{margin:0, fontSize:28, fontWeight:900, color:"#fff", lineHeight:1.2}}>¿Qué deseas gestionar hoy?</h1>
        {modulosPermitidos.length === 0 && (
          <p style={{color:"rgba(255,255,255,0.4)", fontSize:14, marginTop:16}}>No tienes módulos asignados. Contacta al administrador.</p>
        )}
      </div>

      {/* Tarjetas de módulos — SOLO los que el usuario tiene permiso */}
      <div style={{display:"flex", gap:24, justifyContent:"center", flexWrap:"wrap", padding:"0 32px", maxWidth:900, margin:"0 auto"}}>
        {MODULOS_DISPONIBLES.filter(m => modulosPermitidos.includes(m.id)).map(modulo => (
          <button key={modulo.id} onClick={() => onSelectModulo(modulo.id)}
            style={{
              background: modulo.grad,
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 20,
              padding: "32px 36px",
              cursor: "pointer",
              width: 280,
              textAlign: "left",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
              transition: "transform 0.15s, box-shadow 0.15s",
              position: "relative",
              overflow: "hidden",
            }}
            onMouseEnter={e => { e.currentTarget.style.transform="translateY(-4px)"; e.currentTarget.style.boxShadow="0 16px 48px rgba(0,0,0,0.5)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform="translateY(0)"; e.currentTarget.style.boxShadow="0 8px 32px rgba(0,0,0,0.4)"; }}
          >
            {modulo.id === "osiris"
              ? <div style={{marginBottom:6}}><OsirisLogoSmall/></div>
              : <div style={{fontSize:40, marginBottom:14}}>{modulo.icon}</div>
            }
            {modulo.id !== "osiris" && <div style={{fontSize:17, fontWeight:800, color:"#fff", marginBottom:4}}>{modulo.label}</div>}
            {modulo.id !== "osiris" && <div style={{fontSize:12, color:"rgba(255,255,255,0.65)"}}>{modulo.sublabel}</div>}
            <div style={{position:"absolute", bottom:18, right:18, fontSize:18, color:"rgba(255,255,255,0.4)"}}>→</div>
          </button>
        ))}

        {/* Próximamente — solo para admin */}
        {usuario.rol === "admin" && (
          <div style={{
            background: "rgba(255,255,255,0.04)",
            border: "2px dashed rgba(255,255,255,0.12)",
            borderRadius: 20,
            padding: "32px 36px",
            width: 280,
            textAlign: "left",
            opacity: 0.6,
          }}>
            <div style={{fontSize:40, marginBottom:14}}>➕</div>
            <div style={{fontSize:17, fontWeight:800, color:"rgba(255,255,255,0.4)", marginBottom:4}}>Nuevo módulo</div>
            <div style={{fontSize:12, color:"rgba(255,255,255,0.3)"}}>Próximamente disponible</div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{textAlign:"center", marginTop:56, fontSize:10, color:"rgba(255,255,255,0.2)", letterSpacing:2}}>
        © {new Date().getFullYear()} GRUPO MEDITERRA · TODOS LOS DERECHOS RESERVADOS
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// APP PRINCIPAL
// ══════════════════════════════════════════════════════════
export default function App(){
  const hoy=new Date();

  // ── Auth ────────────────────────────────────────────────
  const [usuarioActual,setUsuarioActual]=useState(null);
  const [moduloActivo,setModuloActivo]=useState(null); // null = hub
  const [loginNombre,setLoginNombre]=useState("");
  const [loginPin,setLoginPin]=useState("");
  const [loginError,setLoginError]=useState("");
  const [pinsPersonalizados,setPinsPersonalizados]=useState({});
  const [modalPin,setModalPin]=useState(null);
  const [resetNombre,setResetNombre]=useState("");
  const [resetEnviando,setResetEnviando]=useState(false);
  const [resetMsg,setResetMsg]=useState("");
  const [pinActual,setPinActual]=useState("");
  const [pinNuevo,setPinNuevo]=useState("");
  const [pinConfirm,setPinConfirm]=useState("");
  const [pinError,setPinError]=useState("");

  // ── Navegación tareas ───────────────────────────────────
  const [mes,setMes]=useState(hoy.getMonth());
  const [anio,setAnio]=useState(hoy.getFullYear());
  const semanas=semanasDelMes(anio,mes);

  // ── Usuarios ────────────────────────────────────────────
  const [usuarios,setUsuarios]=useState(WORKERS_BASE);
  const [tabUsuarios,setTabUsuarios]=useState("lista");
  const [usuarioEditando,setUsuarioEditando]=useState(null);
  const [formUsuario,setFormUsuario]=useState({nombre:"",cargo:"",email:"",pin:"",rol:"editor",modulos:["tareas"]});
  const [copiarDe,setCopiarDe]=useState("");

  const WORKERS=usuarios.filter(u=>!u.desactivado);
  const getWorker=(nombre)=>usuarios.find(u=>u.nombre===nombre);
  const getRol=(nombre)=>getWorker(nombre)?.rol||"editor";
  const esAdmin=(nombre)=>getRol(nombre)==="admin";
  const esSoloConsulta=(nombre)=>getRol(nombre)==="consulta";

  // ── Tareas ──────────────────────────────────────────────
  const [tareasExtra,setTareasExtra]=useState([]);
  const [tareasConfig,setTareasConfig]=useState(()=>{
    const c={};TAREAS_BASE.forEach(t=>{c[t.id]={supervisor:t.supervisor,diaLimiteSem:t.diaLimiteSem,diaLimite:t.diaLimite,frecuencia:t.frecuencia,bloqueada:false,dependeDe:t.dependeDe||null};});return c;
  });
  const todasTareas=useCallback(()=>[...TAREAS_BASE,...tareasExtra],[tareasExtra]);
  const getConfig=(id)=>tareasConfig[id]||{supervisor:"",diaLimiteSem:0,diaLimite:10,frecuencia:"Semanal",bloqueada:false,dependeDe:null};
  const getSupervisor=(id)=>tareasConfig[id]?.supervisor??TAREAS_BASE.find(t=>t.id===id)?.supervisor??"";
  const getFrecuencia=(id)=>tareasConfig[id]?.frecuencia||TAREAS_BASE.find(t=>t.id===id)?.frecuencia||"Semanal";
  const isBloqueada=(id)=>tareasConfig[id]?.bloqueada||false;
  const getDependeDe=(id)=>tareasConfig[id]?.dependeDe??null;
  const getTareaById=(id)=>todasTareas().find(t=>t.id===id);

  const [estados,setEstados]=useState(()=>{
    const est={};
    TAREAS_BASE.filter(t=>t.frecuencia!=="Mensual").forEach(t=>{semanasDelMes(hoy.getMonth(),hoy.getFullYear()).forEach(s=>{est[`${t.id}_s${s.num}`]={estadoResp:"gris",estadoSup:"gris",aprobado:false};});});
    TAREAS_BASE.filter(t=>t.frecuencia==="Mensual").forEach(t=>{est[t.id]={estadoResp:"gris",estadoSup:"gris",aprobado:false};});
    return est;
  });
  const [comentarios,setComentarios]=useState({});
  const [supervisores,setSupervisores]=useState(()=>{const d={};TAREAS_BASE.forEach(t=>{d[t.id]=t.supervisor||"";});return d;});
  const [tab,setTab]=useState("semanal");
  const [semanaActiva,setSemanaActiva]=useState(()=>semanaActivaDefault(semanasDelMes(hoy.getMonth(),hoy.getFullYear())));
  const [guardado,setGuardado]=useState("idle");
  const [cargando,setCargando]=useState(true);
  const [editComentario,setEditComentario]=useState(null);
  const [textoComentario,setTextoComentario]=useState("");
  const [filtroPersona,setFiltroPersona]=useState("");
  const [modalEmail,setModalEmail]=useState(null);
  const [recsDone,setRecsDone]=useState({});
  const [recsComentarios,setRecsComentarios]=useState({});
  const [editRecComentario,setEditRecComentario]=useState(null);
  const [textoRecComentario,setTextoRecComentario]=useState("");
  const [modalNotif,setModalNotif]=useState(null);
  const [textoNotif,setTextoNotif]=useState("");
  const [enviandoNotif,setEnviandoNotif]=useState(false);
  const [nuevaTarea,setNuevaTarea]=useState({nombre:"",responsable:"",supervisor:"",categoria:"Finanzas",frecuencia:"Semanal",dependeDe:""});
  const [mostrarFormTarea,setMostrarFormTarea]=useState(false);

  // ── Osiris ──────────────────────────────────────────────
  const [osirisData,setOsirisData]=useState({});

  function recKey(id){return `${id}_${mes}_${anio}`;}

  // ── Carga inicial ───────────────────────────────────────
  useEffect(()=>{
    const s=semanasDelMes(anio,mes);
    setSemanaActiva(semanaActivaDefault(s));
    setEstados(prev=>{
      const n={...prev};
      todasTareas().filter(t=>getFrecuencia(t.id)!=="Mensual").forEach(t=>{
        s.forEach(sw=>{const k=`${t.id}_s${sw.num}`;if(!n[k])n[k]={estadoResp:"gris",estadoSup:"gris",aprobado:false};});
      });
      return n;
    });
  },[mes,anio]); // eslint-disable-line

  useEffect(()=>{
    async function cargar(){
      try{
        const d=await dbLoad();
        if(d){
          if(d.usuarios)setUsuarios(prev=>{
            const merged=WORKERS_BASE.map(wb=>{const saved=d.usuarios.find(u=>u.nombre===wb.nombre);return saved?{...wb,...saved}:wb;});
            const extras=d.usuarios.filter(u=>!WORKERS_BASE.find(wb=>wb.nombre===u.nombre));
            return[...merged,...extras];
          });
          if(d.estados)setEstados(prev=>({...prev,...d.estados}));
          if(d.comentarios)setComentarios(d.comentarios);
          if(d.tareasConfig)setTareasConfig(prev=>({...prev,...d.tareasConfig}));
          if(d.supervisores)setSupervisores(prev=>({...prev,...d.supervisores}));
          if(d.tareasExtra)setTareasExtra(d.tareasExtra);
          if(d.pinsPersonalizados)setPinsPersonalizados(d.pinsPersonalizados);
          if(d.recsDone)setRecsDone(d.recsDone);
          if(d.recsComentarios)setRecsComentarios(d.recsComentarios);
          if(d.osirisData){
            // Merge inteligente: usa datos de Supabase pero completa campos nuevos del código
            const saved=d.osirisData;
            setOsirisData(prev=>{
              // Para cada sección, fusiona registros guardados con los del código
              // Si hay datos guardados los usa; si falta algún campo nuevo lo agrega
              function mergeSection(savedArr, initArr, idField="id"){
                if(!savedArr||savedArr.length===0) return initArr;
                // Agrega registros nuevos del código que no existan en Supabase
                const ids=new Set(savedArr.map(r=>r[idField]));
                const nuevos=initArr.filter(r=>!ids.has(r[idField]));
                // Fusiona campos nuevos a registros existentes (sin sobrescribir lo editado)
                const merged=savedArr.map(r=>{
                  const base=initArr.find(b=>b[idField]===r[idField]);
                  return base?{...base,...r}:r;
                });
                return[...merged,...nuevos];
              }
              return{
                ...prev,
                royaltyPlanta:    mergeSection(saved.royaltyPlanta,    []),
                feeEntrada:       mergeSection(saved.feeEntrada,       []),
                royaltyComercial: mergeSection(saved.royaltyComercial, []),
                feeViveros:       mergeSection(saved.feeViveros,       []),
                totalPedidos:     mergeSection(saved.totalPedidos,     []),
                // Contratos: si no existen en Supabase, usa los del código
                contratos: saved.contratos||prev.contratos||[],
              };
            });
          }
          if(d.mes!==undefined)setMes(d.mes);
          if(d.anio!==undefined)setAnio(d.anio);
        }
      }catch(e){console.error("Error cargando:",e);}
      setCargando(false);
    }
    cargar();
  },[]); // eslint-disable-line

  const guardar=useCallback((est,com,tc,sup,te,pins,rd,rc,usrs,m,a,od)=>{
    setGuardado("guardando");
    dbSave({estados:est,comentarios:com,tareasConfig:tc,supervisores:sup,tareasExtra:te,
      pinsPersonalizados:pins,recsDone:rd,recsComentarios:rc,usuarios:usrs,mes:m,anio:a,osirisData:od})
      .then(()=>{setGuardado("ok");setTimeout(()=>setGuardado("idle"),2000);})
      .catch(()=>{setGuardado("error");setTimeout(()=>setGuardado("idle"),3000);});
  },[]);

  useEffect(()=>{
    if(cargando)return;
    const t=setTimeout(()=>guardar(estados,comentarios,tareasConfig,supervisores,tareasExtra,pinsPersonalizados,recsDone,recsComentarios,usuarios,mes,anio,osirisData),800);
    return()=>clearTimeout(t);
  },[estados,comentarios,tareasConfig,supervisores,tareasExtra,pinsPersonalizados,recsDone,recsComentarios,usuarios,mes,anio,osirisData,cargando,guardar]);

  // ── Auth helpers ────────────────────────────────────────
  function getPinActivo(w){return pinsPersonalizados[w.nombre]||w.pin;}

  function handleLogin(){
    const w=WORKERS.find(x=>x.nombre===loginNombre);
    if(!w){setLoginError("Selecciona tu nombre.");return;}
    const pinOk=getPinActivo(w);
    const pinTemp=pinsPersonalizados[w.nombre+"_temp"];
    const esTemp=pinTemp&&loginPin.trim()===pinTemp;
    const esOk=loginPin.trim()===pinOk;
    if(esOk||esTemp){
      setUsuarioActual(w);setLoginError("");
      if(esTemp)setModalPin("cambiar");
    }else{
      setLoginError("PIN incorrecto.");
    }
  }

  async function handleResetPin(){
    const w=WORKERS.find(x=>x.nombre===resetNombre);if(!w){setResetMsg("Selecciona tu nombre.");return;}
    setResetEnviando(true);
    const temporal=String(Math.floor(1000+Math.random()*9000));
    const nuevosPins={...pinsPersonalizados,[w.nombre+"_temp"]:temporal};
    setPinsPersonalizados(nuevosPins);
    await dbSave({estados,comentarios,tareasConfig,supervisores,tareasExtra,pinsPersonalizados:nuevosPins,recsDone,recsComentarios,usuarios,mes,anio,osirisData});
    try{
      await enviarEmail(w.email,w.nombre,"PIN temporal - Mediterra",`Tu PIN temporal es: ${temporal}\nIngresa con este PIN y cambialo inmediatamente.\n\nhttps://gestion-grupo-mediterra.vercel.app`);
      setResetMsg("PIN enviado a "+w.email);
    }catch{setResetMsg("Error al enviar.");}
    setResetEnviando(false);
  }

  function handleCambiarPin(){
    setPinError("");
    if(!usuarioActual)return;
    const po=getPinActivo(usuarioActual);
    const pinTemp=pinsPersonalizados[usuarioActual.nombre+"_temp"];
    const pinActualValido=pinActual===po||(pinTemp&&pinActual===pinTemp);
    if(!pinActualValido){setPinError("PIN actual incorrecto.");return;}
    if(pinNuevo.length<4){setPinError("Minimo 4 digitos.");return;}
    if(pinNuevo!==pinConfirm){setPinError("Los PINs no coinciden.");return;}
    const nuevosPins={...pinsPersonalizados,[usuarioActual.nombre]:pinNuevo};
    delete nuevosPins[usuarioActual.nombre+"_temp"];
    setPinsPersonalizados(nuevosPins);
    dbSave({estados,comentarios,tareasConfig,supervisores,tareasExtra,pinsPersonalizados:nuevosPins,recsDone,recsComentarios,usuarios,mes,anio,osirisData});
    setPinActual("");setPinNuevo("");setPinConfirm("");setModalPin(null);
    alert("PIN cambiado exitosamente!");
  }

  // ── Tareas helpers ──────────────────────────────────────
  function puedeEditar(tarea,esResp){
    if(!usuarioActual)return false;
    if(esSoloConsulta(usuarioActual.nombre))return false;
    if(esAdmin(usuarioActual.nombre))return true;
    const sup=getSupervisor(tarea.id);
    return esResp?tarea.responsable===usuarioActual.nombre:sup===usuarioActual.nombre;
  }
  function dependenciaOk(tarea,numSemana){
    const depId=getDependeDe(tarea.id);if(!depId)return true;
    const depT=getTareaById(depId);if(!depT)return true;
    if(getFrecuencia(depT.id)==="Mensual")return(estados[depId]?.estadoResp||"gris")==="verde";
    return(estados[`${depId}_s${numSemana}`]?.estadoResp||"gris")==="verde";
  }
  function getNombreDep(tarea){const id=getDependeDe(tarea.id);return getTareaById(id)?.nombre||null;}

  function ciclarResp(key,tarea,numSemana){
    if(!puedeEditar(tarea,true))return;
    if(!dependenciaOk(tarea,numSemana)){
      const depT=getTareaById(getDependeDe(tarea.id));
      if(depT)alert(`Esta tarea depende de:\n"${depT.nombre}"\nCompleta esa tarea primero.`);
      return;
    }
    setEstados(prev=>{
      const actual=prev[key]?.estadoResp||"gris";
      const sig=ORDEN_SEM[(ORDEN_SEM.indexOf(actual)+1)%ORDEN_SEM.length];
      const nuevo={...prev,[key]:{...prev[key],estadoResp:sig,aprobado:false,estadoSup:sig!=="verde"?"gris":prev[key].estadoSup}};
      if(sig==="verde"){
        const deps=todasTareas().filter(t=>{const d=getDependeDe(t.id);return d===tarea.id&&!isBloqueada(t.id);});
        if(deps.length>0)setTimeout(()=>setModalNotif({key,tarea,numSemana,dependientes:deps}),300);
      }
      return nuevo;
    });
  }
  function ciclarSup(key,tarea){
    if(!puedeEditar(tarea,false))return;
    setEstados(prev=>{
      if(prev[key]?.estadoResp!=="verde")return prev;
      const actual=prev[key]?.estadoSup||"gris";
      const sig=ORDEN_SEM[(ORDEN_SEM.indexOf(actual)+1)%ORDEN_SEM.length];
      return{...prev,[key]:{...prev[key],estadoSup:sig,aprobado:sig==="verde"}};
    });
  }
  async function enviarNotifDependencia(){
    if(!modalNotif)return;
    setEnviandoNotif(true);
    try{
      for(const dep of modalNotif.dependientes){
        const w=WORKERS.find(x=>x.nombre===dep.responsable);
        if(w)await enviarEmail(w.email,w.nombre,`Tarea desbloqueada: ${dep.nombre}`,
          `Hola ${w.nombre.split(" ")[0]},\n\n"${modalNotif.tarea.nombre}" fue completada.\nAhora puedes iniciar: "${dep.nombre}"\n\n${textoNotif?`Nota: ${textoNotif}\n\n`:""}https://gestion-grupo-mediterra.vercel.app\n\nSaludos`);
      }
      alert("Notificacion enviada!");
    }catch{alert("Error al enviar.");}
    setEnviandoNotif(false);setModalNotif(null);setTextoNotif("");
  }
  function guardarComentario(){setComentarios(prev=>({...prev,[editComentario]:textoComentario}));setEditComentario(null);}

  function estaVencida(tarea,key,numSemana){
    const hoyD=new Date();hoyD.setHours(0,0,0,0);
    const frec=getFrecuencia(tarea.id);
    if(frec==="Mensual"){const fl=new Date(anio,mes,getConfig(tarea.id).diaLimite||tarea.diaLimite);if(fl<FECHA_INICIO)return false;return hoyD>fl&&(estados[key]?.estadoResp||"gris")==="gris";}
    const sw=semanas.find(s=>s.num===numSemana)||semanas[0];
    const ds=getConfig(tarea.id).diaLimiteSem??tarea.diaLimiteSem;
    const fl=fechaDiaSemana(sw.inicioSem,ds);
    if(fl<FECHA_INICIO)return false;
    return hoyD>fl&&(estados[key]?.estadoResp||"gris")==="gris";
  }
  function estaProxima(tarea,key,numSemana){
    const hoyD=new Date();hoyD.setHours(0,0,0,0);
    const frec=getFrecuencia(tarea.id);
    let diff;
    if(frec==="Mensual")diff=(new Date(anio,mes,getConfig(tarea.id).diaLimite||tarea.diaLimite)-hoyD)/(1000*60*60*24);
    else{const sw=semanas.find(s=>s.num===numSemana)||semanas[0];const ds=getConfig(tarea.id).diaLimiteSem??tarea.diaLimiteSem;diff=(fechaDiaSemana(sw.inicioSem,ds)-hoyD)/(1000*60*60*24);}
    return diff>=0&&diff<=2&&(estados[key]?.estadoResp||"gris")==="gris";
  }
  function generarResumenEmail(){
    const res={};WORKERS.forEach(w=>{res[w.nombre]=[];});
    todasTareas().filter(t=>!isBloqueada(t.id)).forEach(t=>{
      const frec=getFrecuencia(t.id);
      if(frec==="Mensual"){if(estaVencida(t,t.id,null))res[t.responsable]?.push({...t,key:t.id});}
      else semanas.forEach(s=>{const key=`${t.id}_s${s.num}`;if(estaVencida(t,key,s.num))res[t.responsable]?.push({...t,key});});
    });
    return res;
  }
  function enviarEmailPersona(w,tareas){
    const asunto=encodeURIComponent(`Tareas pendientes - ${MESES[mes]} ${anio}`);
    const cuerpo=encodeURIComponent(`Hola ${w.nombre.split(" ")[0]},\n\nLas siguientes tareas estan vencidas:\n\n`+tareas.map(t=>`- ${t.nombre}`).join('\n')+`\n\nhttps://gestion-grupo-mediterra.vercel.app\n\nSaludos`);
    window.open(`mailto:${w.email}?subject=${asunto}&body=${cuerpo}`);
  }
  const totalVencidas=(()=>{let c=0;todasTareas().filter(t=>!isBloqueada(t.id)).forEach(t=>{if(getFrecuencia(t.id)==="Mensual"){if(estaVencida(t,t.id,null))c++;}else semanas.forEach(s=>{if(estaVencida(t,`${t.id}_s${s.num}`,s.num))c++;});});return c;})();

  function resumen(nombre){
    let v=0,a=0,r=0,g=0,total=0;
    todasTareas().filter(t=>!isBloqueada(t.id)).forEach(t=>{
      const frec=getFrecuencia(t.id);const sup=getSupervisor(t.id);
      const esR=t.responsable===nombre;const esS=sup===nombre;
      if(!esR&&!esS)return;
      const keys=frec==="Mensual"?[t.id]:semanas.map(s=>`${t.id}_s${s.num}`);
      keys.forEach(k=>{const e=(esR?estados[k]?.estadoResp:estados[k]?.estadoSup)||"gris";if(e==="na")return;total++;if(e==="verde")v++;else if(e==="amarillo")a++;else if(e==="rojo")r++;else g++;});
    });
    return{v,a,r,g,total,pct:total>0?Math.round((v/total)*100):0};
  }

  // ── Gestión usuarios ────────────────────────────────────
  function agregarUsuario(){
    if(!formUsuario.nombre.trim()||!formUsuario.email.trim()||!formUsuario.pin.trim()){alert("Nombre, email y PIN son obligatorios.");return;}
    if(usuarios.find(u=>u.nombre===formUsuario.nombre)){alert("Ya existe un usuario con ese nombre.");return;}
    setUsuarios(prev=>[...prev,{...formUsuario,modulos:formUsuario.modulos||["tareas"],esCFO:formUsuario.rol==="admin",desactivado:false}]);
    if(copiarDe){
      todasTareas().filter(t=>t.responsable===copiarDe).forEach(t=>{
        const id=`custom_${Date.now()}_${t.id}`;
        setTareasExtra(prev=>[...prev,{...t,id,responsable:formUsuario.nombre}]);
        setTareasConfig(prev=>({...prev,[id]:{...getConfig(t.id),bloqueada:false}}));
      });
    }
    setFormUsuario({nombre:"",cargo:"",email:"",pin:"",rol:"editor",modulos:["tareas"]});setCopiarDe("");setTabUsuarios("lista");
  }
  function guardarEdicionUsuario(){
    if(!formUsuario.nombre.trim()||!formUsuario.email.trim()){alert("Nombre y email son obligatorios.");return;}
    setUsuarios(prev=>prev.map(u=>u.nombre===usuarioEditando?{...u,...formUsuario,esCFO:formUsuario.rol==="admin"}:u));
    if(formUsuario.pin)setPinsPersonalizados(prev=>({...prev,[usuarioEditando]:formUsuario.pin}));
    setUsuarioEditando(null);setFormUsuario({nombre:"",cargo:"",email:"",pin:"",rol:"editor",modulos:["tareas"]});setTabUsuarios("lista");
  }
  function toggleDesactivarUsuario(nombre){
    if(nombre===usuarioActual.nombre){alert("No puedes desactivarte a ti mismo.");return;}
    setUsuarios(prev=>prev.map(u=>u.nombre===nombre?{...u,desactivado:!u.desactivado}:u));
  }
  function resetPinUsuario(nombre){
    const pin=String(Math.floor(1000+Math.random()*9000));
    setPinsPersonalizados(prev=>({...prev,[nombre]:pin}));
    alert(`PIN reseteado para ${nombre}.\nNuevo PIN temporal: ${pin}\n\nComparte este PIN de forma segura con el usuario.`);
  }
  function iniciarEdicion(u){
    setFormUsuario({nombre:u.nombre,cargo:u.cargo||"",email:u.email,pin:"",rol:u.rol||"editor",modulos:Array.isArray(u.modulos)?u.modulos:["tareas"]});
    setUsuarioEditando(u.nombre);setTabUsuarios("editar");
  }
  function toggleBloqueada(id){setTareasConfig(prev=>({...prev,[id]:{...getConfig(id),bloqueada:!getConfig(id).bloqueada}}));}
  function updateConfig(id,campo,valor){
    setTareasConfig(prev=>({...prev,[id]:{...getConfig(id),[campo]:valor}}));
    if(campo==="supervisor")setSupervisores(prev=>({...prev,[id]:valor}));
  }
  function agregarTarea(){
    if(!nuevaTarea.nombre.trim()||!nuevaTarea.responsable){alert("Nombre y responsable son obligatorios.");return;}
    const id=`custom_${Date.now()}`;
    setTareasExtra(prev=>[...prev,{...nuevaTarea,id,diaLimiteSem:0,diaLimite:10,dependeDe:nuevaTarea.dependeDe||null}]);
    setTareasConfig(prev=>({...prev,[id]:{supervisor:nuevaTarea.supervisor,diaLimiteSem:0,diaLimite:10,frecuencia:nuevaTarea.frecuencia,bloqueada:false,dependeDe:nuevaTarea.dependeDe||null}}));
    setSupervisores(prev=>({...prev,[id]:nuevaTarea.supervisor||""}));
    setEstados(prev=>{const n={...prev};if(nuevaTarea.frecuencia==="Mensual")n[id]={estadoResp:"gris",estadoSup:"gris",aprobado:false};else semanas.forEach(s=>{n[`${id}_s${s.num}`]={estadoResp:"gris",estadoSup:"gris",aprobado:false};});return n;});
    setNuevaTarea({nombre:"",responsable:"",supervisor:"",categoria:"Finanzas",frecuencia:"Semanal",dependeDe:""});setMostrarFormTarea(false);
  }

  const estadoGuardadoUI={idle:null,guardando:{icon:"💾",text:"Guardando..."},ok:{icon:"✅",text:"Guardado"},error:{icon:"❌",text:"Error"}}[guardado];
  const recsActivos=getRecordatoriosActivos(usuarioActual?.nombre||"",anio,mes,esAdmin(usuarioActual?.nombre||"")).filter(r=>!recsDone[recKey(r.id)]);

  // ── Tabla helper ────────────────────────────────────────
  function TablaFilas({tareas,getKey,getSemana}){
    const todas=tareas.filter(t=>!isBloqueada(t.id));
    const filtradas=filtroPersona?todas.filter(t=>t.responsable===filtroPersona||getSupervisor(t.id)===filtroPersona):todas;
    return filtradas.map((t,i)=>{
      const numSem=getSemana?getSemana():null;
      const frec=getFrecuencia(t.id);
      const key=frec==="Mensual"?t.id:getKey(t);
      const est=estados[key]||{estadoResp:"gris",estadoSup:"gris",aprobado:false};
      const semResp=SEMAFORO[est.estadoResp]||SEMAFORO.gris;
      const sup=getSupervisor(t.id);
      const supActivo=est.estadoResp==="verde"&&sup&&est.estadoResp!=="na";
      const semSup=SEMAFORO[supActivo?est.estadoSup:"gris"];
      const cat=CATEGORIAS[t.categoria]||{color:"#64748b",bg:"#f1f5f9"};
      const com=comentarios[key]||"";
      const vencida=estaVencida(t,key,numSem)&&est.estadoResp!=="na";
      const proxima=!vencida&&estaProxima(t,key,numSem)&&est.estadoResp!=="na";
      const puedeResp=puedeEditar(t,true);const puedeSup=puedeEditar(t,false);
      const depOk=dependenciaOk(t,numSem);const esNA=est.estadoResp==="na";
      const diaLabel=frec==="Mensual"?`dia ${getConfig(t.id).diaLimite||t.diaLimite}`:`${DIAS_SEMANA[getConfig(t.id).diaLimiteSem??t.diaLimiteSem]}`;
      return(
        <tr key={key} style={{borderBottom:"1px solid #f1f5f9",opacity:esNA?0.55:1,
          background:!depOk?"#f8f8ff":esNA?"#f8fafc":vencida?"#fff5f5":proxima?"#fffbeb":i%2===0?"#fff":"#f8fafc",
          borderLeft:!depOk?"4px solid #c4b5fd":esNA?"4px solid #94a3b8":vencida?"4px solid #ef4444":proxima?"4px solid #f59e0b":"4px solid transparent"}}>
          <td style={{padding:"9px 14px"}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              {!depOk&&<span title={`Depende de: ${getNombreDep(t)}`} style={{fontSize:11}}>🔒</span>}
              {vencida&&depOk&&!esNA&&<span style={{color:"#ef4444",fontWeight:700,fontSize:11}}>!!</span>}
              {proxima&&depOk&&!esNA&&<span style={{color:"#f59e0b",fontWeight:700,fontSize:11}}>!</span>}
              {esNA&&<span style={{fontSize:11}}>⊘</span>}
              <div style={{fontWeight:500,color:!depOk?"#7c3aed":esNA?"#94a3b8":vencida?"#ef4444":"#1e293b",fontSize:13,textDecoration:esNA?"line-through":"none"}}>{t.nombre}</div>
            </div>
            <div style={{display:"flex",gap:6,marginTop:2,flexWrap:"wrap"}}>
              <span style={{fontSize:10,background:cat.bg,color:cat.color,borderRadius:20,padding:"1px 8px",fontWeight:600}}>{t.categoria}</span>
              <span style={{fontSize:10,color:"#94a3b8"}}>{frec} · {diaLabel}</span>
            </div>
          </td>
          <td style={{textAlign:"center",padding:"9px 8px",fontSize:12,color:"#374151"}}>{t.responsable.split(" ")[0]}</td>
          <td style={{textAlign:"center",padding:"9px 8px"}}>
            <button onClick={()=>ciclarResp(key,t,numSem)}
              style={{width:28,height:28,borderRadius:"50%",background:semResp.color,border:`3px solid ${semResp.border}`,cursor:puedeResp?"pointer":"not-allowed",outline:"none",opacity:puedeResp?1:0.4,boxShadow:"0 2px 6px #0002",transition:"transform 0.1s",backgroundImage:est.estadoResp==="na"?"repeating-linear-gradient(45deg,transparent,transparent 3px,rgba(0,0,0,0.15) 3px,rgba(0,0,0,0.15) 6px)":undefined}}
              onMouseEnter={e=>{if(puedeResp)e.target.style.transform="scale(1.2)";}} onMouseLeave={e=>e.target.style.transform="scale(1)"}/>
          </td>
          <td style={{textAlign:"center",padding:"9px 8px",fontSize:12,color:"#374151"}}>{sup?sup.split(" ")[0]:<span style={{color:"#d1d5db"}}>-</span>}</td>
          <td style={{textAlign:"center",padding:"9px 8px"}}>
            {sup?<button onClick={()=>ciclarSup(key,t)} style={{width:28,height:28,borderRadius:"50%",background:supActivo?semSup.color:"#e5e7eb",border:`3px solid ${supActivo?semSup.border:"#d1d5db"}`,cursor:(supActivo&&puedeSup)?"pointer":"not-allowed",outline:"none",opacity:(supActivo&&puedeSup)?1:0.4}}/>
            :<span style={{color:"#d1d5db",fontSize:12}}>-</span>}
          </td>
          <td style={{textAlign:"center",padding:"9px 8px"}}>
            <button onClick={()=>{setEditComentario(key);setTextoComentario(com);}}
              style={{background:com?"#dbeafe":"#f1f5f9",border:"none",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontSize:11,color:com?"#1d4ed8":"#9ca3af",maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {com?`[${com.substring(0,10)}...]`:"+"}
            </button>
          </td>
        </tr>
      );
    });
  }

  const encabezadoTabla=(
    <thead><tr style={{background:"#1e3a5f",color:"#fff",fontSize:12}}>
      <th style={{padding:"10px 14px",textAlign:"left",minWidth:240}}>Tarea</th>
      <th style={{padding:"10px 8px",textAlign:"center",minWidth:90}}>Responsable</th>
      <th style={{padding:"10px 8px",textAlign:"center",minWidth:70}}>Estado</th>
      <th style={{padding:"10px 8px",textAlign:"center",minWidth:90}}>Supervisor</th>
      <th style={{padding:"10px 8px",textAlign:"center",minWidth:70}}>Aprobacion</th>
      <th style={{padding:"10px 8px",textAlign:"center",minWidth:100}}>Comentario</th>
    </tr></thead>
  );

  // ══════════════════════════════════════════════════════
  // RENDER: LOGIN
  // ══════════════════════════════════════════════════════
  if(cargando)return<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"sans-serif",color:"#64748b"}}>Cargando...</div>;

  if(!usuarioActual)return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0f172a,#1e3a5f)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"sans-serif",padding:20}}>
      <div style={{background:"#fff",borderRadius:20,padding:40,width:380,maxWidth:"100%",boxShadow:"0 20px 60px #0004"}}>
        {modalPin==="resetear"?(
          <div>
            <button onClick={()=>{setModalPin(null);setResetMsg("");setResetNombre("");}} style={{background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:13,marginBottom:16}}>&larr; Volver</button>
            <h3 style={{margin:"0 0 6px",color:"#1e293b"}}>Resetear PIN</h3>
            <select value={resetNombre} onChange={e=>setResetNombre(e.target.value)} style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:14,marginBottom:12,boxSizing:"border-box"}}>
              <option value="">Selecciona tu nombre...</option>
              {WORKERS.map(w=><option key={w.nombre} value={w.nombre}>{w.nombre}</option>)}
            </select>
            {resetMsg&&<div style={{background:resetMsg.includes("Error")?"#fee2e2":"#dcfce7",color:resetMsg.includes("Error")?"#ef4444":"#16a34a",borderRadius:8,padding:"8px 12px",fontSize:12,marginBottom:12}}>{resetMsg}</div>}
            <button onClick={handleResetPin} disabled={resetEnviando||!resetNombre} style={{width:"100%",background:"#2563eb",color:"#fff",border:"none",borderRadius:10,padding:"12px",cursor:"pointer",fontWeight:700,fontSize:14,opacity:resetEnviando||!resetNombre?0.6:1}}>
              {resetEnviando?"Enviando...":"Enviar PIN temporal"}
            </button>
          </div>
        ):(
          <div>
            <div style={{textAlign:"center",marginBottom:28}}>
              <div style={{display:"flex",justifyContent:"center",marginBottom:8}}><MediterraLogo size={80}/></div>
              <div style={{fontSize:11,letterSpacing:4,color:"#7ecfca",fontWeight:600,marginBottom:4}}>MEDITERRA</div>
              <h2 style={{margin:0,color:"#1e293b",fontSize:17,fontWeight:800}}>Gestión Grupo Mediterra</h2>
              <p style={{margin:"4px 0 0",color:"#94a3b8",fontSize:12}}>Ingresa con tu nombre y PIN</p>
            </div>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>Nombre</label>
              <select value={loginNombre} onChange={e=>setLoginNombre(e.target.value)} style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:14,boxSizing:"border-box"}}>
                <option value="">Selecciona tu nombre...</option>
                {WORKERS.map(w=><option key={w.nombre} value={w.nombre}>{w.nombre} - {w.cargo}</option>)}
              </select>
            </div>
            <div style={{marginBottom:8}}>
              <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>PIN</label>
              <input type="password" value={loginPin} onChange={e=>setLoginPin(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()} maxLength={6}
                style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:14,boxSizing:"border-box",letterSpacing:6,textAlign:"center"}}/>
            </div>
            <div style={{textAlign:"right",marginBottom:16}}>
              <button onClick={()=>{setModalPin("resetear");setResetMsg("");}} style={{background:"none",border:"none",color:"#2563eb",cursor:"pointer",fontSize:12,textDecoration:"underline"}}>Olvidé mi PIN</button>
            </div>
            {loginError&&<div style={{background:"#fee2e2",color:"#ef4444",borderRadius:8,padding:"8px 12px",fontSize:12,marginBottom:14,textAlign:"center"}}>{loginError}</div>}
            <button onClick={handleLogin} style={{width:"100%",background:"#2563eb",color:"#fff",border:"none",borderRadius:10,padding:"12px",cursor:"pointer",fontWeight:700,fontSize:15}}>Ingresar</button>
          </div>
        )}
      </div>
    </div>
  );

  const modulosPermitidos = modulosDeUsuario(usuarioActual);

  // ══════════════════════════════════════════════════════
  // RENDER: HUB
  // ══════════════════════════════════════════════════════
  if(!moduloActivo)return(
    <>
      <HubScreen
        usuario={usuarioActual}
        modulosPermitidos={modulosPermitidos}
        onSelectModulo={id=>setModuloActivo(id)}
        onLogout={()=>{setUsuarioActual(null);setModuloActivo(null);}}
        onCambiarPin={()=>{setPinActual("");setPinNuevo("");setPinConfirm("");setPinError("");setModalPin("cambiar");}}
        esSoloConsulta={esSoloConsulta}
        usuarios={usuarios}
        setUsuarios={setUsuarios}
      />
      {/* Modal cambiar PIN desde Hub */}
      {modalPin==="cambiar"&&(
        <div style={{position:"fixed",inset:0,background:"#0008",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"sans-serif"}}>
          <div style={{background:"#fff",borderRadius:16,padding:28,width:360,maxWidth:"90vw",boxShadow:"0 8px 32px #0003"}}>
            <h3 style={{margin:"0 0 6px",color:"#1e293b"}}>Cambiar PIN</h3>
            <p style={{fontSize:13,color:"#64748b",marginBottom:16}}>{usuarioActual?.nombre}</p>
            {[["PIN actual",pinActual,setPinActual],["Nuevo PIN",pinNuevo,setPinNuevo],["Confirmar nuevo PIN",pinConfirm,setPinConfirm]].map(([lbl,val,set],idx)=>(
              <div key={idx} style={{marginBottom:12}}>
                <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>{lbl}</label>
                <input type="password" maxLength={6} value={val} onChange={e=>set(e.target.value)} style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:14,boxSizing:"border-box",textAlign:"center",letterSpacing:6}}/>
              </div>
            ))}
            {pinError&&<div style={{background:"#fee2e2",color:"#ef4444",borderRadius:8,padding:"8px 12px",fontSize:12,marginBottom:12}}>{pinError}</div>}
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={()=>{setModalPin(null);setPinActual("");setPinNuevo("");setPinConfirm("");setPinError("");}} style={{padding:"8px 18px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:14}}>Cancelar</button>
              <button onClick={handleCambiarPin} style={{padding:"8px 18px",borderRadius:8,border:"none",background:"#2563eb",color:"#fff",cursor:"pointer",fontSize:14,fontWeight:600}}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // ══════════════════════════════════════════════════════
  // RENDER: MÓDULO OSIRIS
  // ══════════════════════════════════════════════════════
  if(moduloActivo==="osiris")return(
    <div style={{fontFamily:"sans-serif",background:"#f8fafc",minHeight:"100vh",padding:"20px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <button onClick={()=>setModuloActivo(null)} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:13,color:"#374151",display:"flex",alignItems:"center",gap:6}}>
          ← Volver al Hub
        </button>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {estadoGuardadoUI&&<span style={{fontSize:12,color:"#64748b",background:"#f1f5f9",borderRadius:20,padding:"4px 12px"}}>{estadoGuardadoUI.icon} {estadoGuardadoUI.text}</span>}
          {!esSoloConsulta(usuarioActual.nombre)&&<button onClick={()=>{setPinActual("");setPinNuevo("");setPinConfirm("");setPinError("");setModalPin("cambiar");}} style={{background:"#f1f5f9",border:"none",color:"#374151",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12}}>🔑 PIN</button>}
          <button onClick={()=>{setUsuarioActual(null);setModuloActivo(null);}} style={{background:"#fee2e2",border:"none",color:"#991b1b",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12}}>Salir</button>
        </div>
      </div>
      <OsirisModule usuarioActual={usuarioActual} esAdmin={esAdmin} esSoloConsulta={esSoloConsulta} osirisData={osirisData} setOsirisData={setOsirisData}/>
      {modalPin==="cambiar"&&(
        <div style={{position:"fixed",inset:0,background:"#0006",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:16,padding:28,width:360,maxWidth:"90vw",boxShadow:"0 8px 32px #0003"}}>
            <h3 style={{margin:"0 0 6px",color:"#1e293b"}}>Cambiar PIN</h3>
            {[["PIN actual",pinActual,setPinActual],["Nuevo PIN",pinNuevo,setPinNuevo],["Confirmar nuevo PIN",pinConfirm,setPinConfirm]].map(([lbl,val,set],idx)=>(
              <div key={idx} style={{marginBottom:12}}><label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>{lbl}</label>
              <input type="password" maxLength={6} value={val} onChange={e=>set(e.target.value)} style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:14,boxSizing:"border-box",textAlign:"center",letterSpacing:6}}/></div>
            ))}
            {pinError&&<div style={{background:"#fee2e2",color:"#ef4444",borderRadius:8,padding:"8px 12px",fontSize:12,marginBottom:12}}>{pinError}</div>}
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={()=>{setModalPin(null);}} style={{padding:"8px 18px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:14}}>Cancelar</button>
              <button onClick={handleCambiarPin} style={{padding:"8px 18px",borderRadius:8,border:"none",background:"#2563eb",color:"#fff",cursor:"pointer",fontSize:14,fontWeight:600}}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ══════════════════════════════════════════════════════
  // RENDER: MÓDULO FINANZAS
  // ══════════════════════════════════════════════════════
  if(moduloActivo==="finanzas")return(
    <div style={{fontFamily:"sans-serif",background:"#0d1117",minHeight:"100vh",padding:"20px"}}>
      <FinanzasModule
        usuarioActual={usuarioActual}
        esAdmin={esAdmin}
        esSoloConsulta={esSoloConsulta}
        onBack={()=>setModuloActivo(null)}
        onLogout={()=>{setUsuarioActual(null);setModuloActivo(null);}}
        supaUrl={SUPA_URL}
        supaKey={SUPA_KEY}
      />
    </div>
  );

  // ══════════════════════════════════════════════════════
  // RENDER: MÓDULO TAREAS
  // ══════════════════════════════════════════════════════
  const tareasSemanales=todasTareas().filter(t=>getFrecuencia(t.id)!=="Mensual");
  const tareasMenusuales=todasTareas().filter(t=>getFrecuencia(t.id)==="Mensual");
  const rolBadge=(nombre)=>{
    const r=getRol(nombre);
    if(r==="admin")return<span style={{background:"#fbbf24",color:"#78350f",borderRadius:20,padding:"1px 8px",fontSize:10,fontWeight:700,marginLeft:8}}>ADMIN</span>;
    if(r==="consulta")return<span style={{background:"#ede9fe",color:"#6d28d9",borderRadius:20,padding:"1px 8px",fontSize:10,fontWeight:700,marginLeft:8}}>CONSULTA</span>;
    return null;
  };

  return(
    <div style={{fontFamily:"sans-serif",background:"#f8fafc",minHeight:"100vh",padding:"20px"}}>

      {/* Modales */}
      {modalNotif&&(
        <div style={{position:"fixed",inset:0,background:"#0006",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:16,padding:28,width:440,maxWidth:"90vw",boxShadow:"0 8px 32px #0003"}}>
            <h3 style={{margin:"0 0 6px",color:"#1e293b"}}>Notificar tarea desbloqueada</h3>
            <p style={{fontSize:13,color:"#64748b",marginBottom:12}}>Completaste: <strong>{modalNotif.tarea.nombre}</strong></p>
            {modalNotif.dependientes.map(d=>(<div key={d.id} style={{background:"#ede9fe",borderRadius:8,padding:"8px 12px",marginBottom:8,fontSize:13}}><strong>{d.nombre}</strong> → {d.responsable}</div>))}
            <textarea value={textoNotif} onChange={e=>setTextoNotif(e.target.value)} rows={3} placeholder="Instruccion o mensaje opcional..." style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,resize:"vertical",boxSizing:"border-box",marginTop:12}}/>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:14}}>
              <button onClick={()=>{setModalNotif(null);setTextoNotif("");}} style={{padding:"8px 18px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:14}}>Omitir</button>
              <button onClick={enviarNotifDependencia} disabled={enviandoNotif} style={{padding:"8px 18px",borderRadius:8,border:"none",background:"#2563eb",color:"#fff",cursor:"pointer",fontSize:14,fontWeight:600,opacity:enviandoNotif?0.6:1}}>{enviandoNotif?"Enviando...":"Enviar"}</button>
            </div>
          </div>
        </div>
      )}
      {modalPin==="cambiar"&&(
        <div style={{position:"fixed",inset:0,background:"#0006",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:16,padding:28,width:360,maxWidth:"90vw",boxShadow:"0 8px 32px #0003"}}>
            <h3 style={{margin:"0 0 6px",color:"#1e293b"}}>Cambiar PIN</h3>
            <p style={{fontSize:13,color:"#64748b",marginBottom:16}}>{usuarioActual?.nombre}</p>
            {[["PIN actual",pinActual,setPinActual],["Nuevo PIN",pinNuevo,setPinNuevo],["Confirmar nuevo PIN",pinConfirm,setPinConfirm]].map(([lbl,val,set],idx)=>(
              <div key={idx} style={{marginBottom:12}}><label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>{lbl}</label>
              <input type="password" maxLength={6} value={val} onChange={e=>set(e.target.value)} style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:14,boxSizing:"border-box",textAlign:"center",letterSpacing:6}}/></div>
            ))}
            {pinError&&<div style={{background:"#fee2e2",color:"#ef4444",borderRadius:8,padding:"8px 12px",fontSize:12,marginBottom:12}}>{pinError}</div>}
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={()=>{setModalPin(null);setPinActual("");setPinNuevo("");setPinConfirm("");setPinError("");}} style={{padding:"8px 18px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:14}}>Cancelar</button>
              <button onClick={handleCambiarPin} style={{padding:"8px 18px",borderRadius:8,border:"none",background:"#2563eb",color:"#fff",cursor:"pointer",fontSize:14,fontWeight:600}}>Guardar</button>
            </div>
          </div>
        </div>
      )}
      {editComentario!==null&&(
        <div style={{position:"fixed",inset:0,background:"#0006",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:16,padding:28,width:420,maxWidth:"90vw",boxShadow:"0 8px 32px #0003"}}>
            <h3 style={{margin:"0 0 14px",color:"#1e293b"}}>Comentario</h3>
            <textarea value={textoComentario} onChange={e=>setTextoComentario(e.target.value)} rows={4} placeholder="Escribe un comentario..." style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:14,resize:"vertical",boxSizing:"border-box"}}/>
            <div style={{display:"flex",gap:10,marginTop:14,justifyContent:"flex-end"}}>
              <button onClick={()=>setEditComentario(null)} style={{padding:"8px 18px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:14}}>Cancelar</button>
              <button onClick={guardarComentario} style={{padding:"8px 18px",borderRadius:8,border:"none",background:"#2563eb",color:"#fff",cursor:"pointer",fontSize:14,fontWeight:600}}>Guardar</button>
            </div>
          </div>
        </div>
      )}
      {editRecComentario!==null&&(
        <div style={{position:"fixed",inset:0,background:"#0006",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:16,padding:28,width:420,maxWidth:"90vw",boxShadow:"0 8px 32px #0003"}}>
            <h3 style={{margin:"0 0 6px",color:"#1e293b"}}>Comentario del recordatorio</h3>
            <textarea value={textoRecComentario} onChange={e=>setTextoRecComentario(e.target.value)} rows={4} placeholder="Motivo o nota..." style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:14,resize:"vertical",boxSizing:"border-box"}}/>
            <div style={{display:"flex",gap:10,marginTop:14,justifyContent:"flex-end"}}>
              <button onClick={()=>setEditRecComentario(null)} style={{padding:"8px 18px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:14}}>Cancelar</button>
              <button onClick={()=>{setRecsComentarios(prev=>({...prev,[recKey(editRecComentario)]:textoRecComentario}));setEditRecComentario(null);}} style={{padding:"8px 18px",borderRadius:8,border:"none",background:"#2563eb",color:"#fff",cursor:"pointer",fontSize:14,fontWeight:600}}>Guardar</button>
            </div>
          </div>
        </div>
      )}
      {modalEmail&&(
        <div style={{position:"fixed",inset:0,background:"#0006",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:16,padding:28,width:500,maxWidth:"90vw",maxHeight:"80vh",overflowY:"auto",boxShadow:"0 8px 32px #0003"}}>
            <h3 style={{margin:"0 0 6px",color:"#1e293b"}}>Avisos de tareas vencidas</h3>
            <p style={{fontSize:13,color:"#64748b",marginBottom:16}}>{MESES[mes]} {anio}</p>
            {WORKERS.map(w=>{const ts=modalEmail.resumen[w.nombre]||[];if(!ts.length)return null;return(
              <div key={w.nombre} style={{background:"#fff5f5",border:"1px solid #fca5a5",borderRadius:10,padding:"12px 16px",marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div><div style={{fontWeight:600,fontSize:14}}>{w.nombre}</div><div style={{fontSize:11,color:"#64748b"}}>{ts.length} tarea(s)</div></div>
                  <button onClick={()=>enviarEmailPersona(w,ts)} style={{background:"#ef4444",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12,fontWeight:600}}>Enviar</button>
                </div>
                <ul style={{margin:"8px 0 0",paddingLeft:16,fontSize:12}}>{ts.map(t=><li key={t.key}>{t.nombre}</li>)}</ul>
              </div>
            );})}
            <div style={{display:"flex",justifyContent:"flex-end",marginTop:16}}>
              <button onClick={()=>setModalEmail(null)} style={{padding:"8px 18px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:14}}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Header módulo Tareas */}
      <div style={{background:"linear-gradient(135deg,#1e3a5f,#2563eb)",borderRadius:16,padding:"16px 24px",marginBottom:20,color:"#fff"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <button onClick={()=>setModuloActivo(null)} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:12}}>← Hub</button>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <MediterraLogo size={48}/>
              <div>
                <div style={{fontSize:10,opacity:0.7,letterSpacing:2,textTransform:"uppercase"}}>Mediterra · Módulo</div>
                <h1 style={{margin:0,fontSize:17,fontWeight:800}}>Seguimiento Tareas Adm. y Finanzas</h1>
                <div style={{fontSize:11,opacity:0.8}}>
                  Hola, <strong>{usuarioActual.nombre.split(" ")[0]}</strong> - {usuarioActual.cargo}{rolBadge(usuarioActual.nombre)}
                </div>
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            {totalVencidas>0&&esAdmin(usuarioActual.nombre)&&<button onClick={()=>setModalEmail({resumen:generarResumenEmail()})} style={{background:"#ef4444",color:"#fff",border:"none",borderRadius:10,padding:"8px 16px",cursor:"pointer",fontWeight:700,fontSize:13}}>{totalVencidas} vencida(s)</button>}
            {estadoGuardadoUI&&<span style={{fontSize:12,color:"#fff",background:"rgba(255,255,255,0.15)",borderRadius:20,padding:"4px 12px"}}>{estadoGuardadoUI.icon} {estadoGuardadoUI.text}</span>}
            {!esSoloConsulta(usuarioActual.nombre)&&<button onClick={()=>{setPinActual("");setPinNuevo("");setPinConfirm("");setPinError("");setModalPin("cambiar");}} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12}}>🔑 PIN</button>}
            <button onClick={()=>{setUsuarioActual(null);setModuloActivo(null);}} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12}}>Salir</button>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12,marginTop:12}}>
          <button onClick={()=>{const nm=mes===0?11:mes-1;const na=mes===0?anio-1:anio;if(mesAnteriorAlInicio(na,nm))return;if(mes===0){setMes(11);setAnio(a=>a-1);}else setMes(m=>m-1);}}
            disabled={mesAnteriorAlInicio(mes===0?anio-1:anio,mes===0?11:mes-1)}
            style={{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:8,padding:"4px 14px",cursor:"pointer",fontSize:18,opacity:mesAnteriorAlInicio(mes===0?anio-1:anio,mes===0?11:mes-1)?0.3:1}}>{"<"}</button>
          <span style={{fontSize:18,fontWeight:700,minWidth:160,textAlign:"center"}}>{MESES[mes]} {anio}</span>
          <button onClick={()=>{if(mes===11){setMes(0);setAnio(a=>a+1);}else setMes(m=>m+1);}} style={{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:8,padding:"4px 14px",cursor:"pointer",fontSize:18}}>{">"}</button>
        </div>
      </div>

      {/* Banner recordatorios */}
      {recsActivos.length>0&&(
        <div style={{marginBottom:16,display:"flex",flexDirection:"column",gap:8}}>
          {recsActivos.map(rec=>(
            <div key={rec.id} onClick={()=>setTab("recordatorios")}
              style={{background:rec.diff<0?"#fee2e2":rec.diff<=1?"#fff1f2":"#fef9c3",border:`1px solid ${rec.diff<0?"#fca5a5":"#fde047"}`,borderRadius:12,padding:"12px 16px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:22}}>{rec.diff<0?"🔴":rec.diff===0?"🚨":"⚠️"}</span>
                <div>
                  <div style={{fontWeight:700,fontSize:13,color:"#1e293b"}}>{rec.titulo}</div>
                  <div style={{fontSize:12,color:"#64748b"}}>{rec.diff<0?"Vencido":"Vence el"} {rec.fechaVence.getDate()} de {MESES[rec.fechaVence.getMonth()]}{rec.diff===0&&<strong style={{color:"#ef4444"}}> - HOY</strong>}</div>
                </div>
              </div>
              <span style={{fontSize:11,color:"#2563eb",fontWeight:600}}>Ver →</span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        {[["semanal","Semanales"],["mensual","Mensuales"],["resumen","Resumen"],["recordatorios","Recordatorios"],
          ...(esAdmin(usuarioActual.nombre)?[["configurar","Configurar"]]:[])
        ].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{padding:"8px 20px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:600,fontSize:13,background:tab===t?"#2563eb":"#fff",color:tab===t?"#fff":"#374151",boxShadow:tab===t?"0 2px 8px #2563eb44":"0 1px 4px #0001",position:"relative"}}>
            {l}
            {t==="recordatorios"&&recsActivos.length>0&&<span style={{position:"absolute",top:-4,right:-4,background:"#ef4444",color:"#fff",borderRadius:"50%",width:16,height:16,fontSize:9,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>{recsActivos.length}</span>}
          </button>
        ))}
      </div>

      {/* Filtro admin */}
      {esAdmin(usuarioActual.nombre)&&(
        <div style={{display:"flex",gap:10,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
          <span style={{fontSize:13,color:"#64748b",fontWeight:500}}>Filtrar:</span>
          {["",...WORKERS.map(w=>w.nombre)].map(n=>(
            <button key={n||"todos"} onClick={()=>setFiltroPersona(n)}
              style={{padding:"5px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:filtroPersona===n?"#1e3a5f":"#fff",color:filtroPersona===n?"#fff":"#374151",boxShadow:"0 1px 4px #0001"}}>
              {n?n.split(" ")[0]:"Todos"}
            </button>
          ))}
        </div>
      )}

      {/* Leyenda */}
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
        {Object.entries(SEMAFORO).map(([k,v])=>(
          <span key={k} style={{display:"flex",alignItems:"center",gap:5,background:"#fff",borderRadius:20,padding:"3px 12px",boxShadow:"0 1px 4px #0001",fontSize:11}}>
            <span style={{width:11,height:11,borderRadius:"50%",background:v.color,display:"inline-block",backgroundImage:k==="na"?"repeating-linear-gradient(45deg,transparent,transparent 2px,rgba(0,0,0,0.2) 2px,rgba(0,0,0,0.2) 4px)":undefined}}></span>{v.label}
          </span>
        ))}
        {esSoloConsulta(usuarioActual.nombre)&&<span style={{fontSize:11,background:"#ede9fe",color:"#6d28d9",borderRadius:20,padding:"3px 12px"}}>Solo visualizacion</span>}
      </div>

      {/* SEMANAL */}
      {tab==="semanal"&&(<>
        <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
          {semanas.map(s=>{
            const fin=new Date(s.inicioSem);fin.setDate(s.inicioSem.getDate()+6);
            if(s.inicioSem<FECHA_INICIO&&fin<FECHA_INICIO)return null;
            return(<button key={s.num} onClick={()=>setSemanaActiva(s.num)} style={{padding:"8px 20px",borderRadius:10,border:"none",cursor:"pointer",fontWeight:700,fontSize:13,background:semanaActiva===s.num?"#0f172a":"#fff",color:semanaActiva===s.num?"#fff":"#374151",boxShadow:semanaActiva===s.num?"0 2px 8px #0003":"0 1px 4px #0001"}}>
              Semana {s.num}<div style={{fontSize:10,fontWeight:400,opacity:0.7}}>Sem {s.iso}</div>
            </button>);
          })}
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{borderCollapse:"collapse",width:"100%",background:"#fff",borderRadius:14,overflow:"hidden",boxShadow:"0 2px 12px #0001"}}>
            {encabezadoTabla}<tbody><TablaFilas tareas={tareasSemanales} getKey={t=>`${t.id}_s${semanaActiva}`} getSemana={()=>semanaActiva}/></tbody>
          </table>
        </div>
      </>)}

      {/* MENSUAL */}
      {tab==="mensual"&&(
        <div style={{overflowX:"auto"}}>
          <div style={{background:"#fef9c3",border:"1px solid #fde047",borderRadius:10,padding:"10px 16px",marginBottom:14,fontSize:13,color:"#92400e"}}>Tareas de cierre mensual. Las tareas con 🔒 esperan que se complete una tarea previa.</div>
          <table style={{borderCollapse:"collapse",width:"100%",background:"#fff",borderRadius:14,overflow:"hidden",boxShadow:"0 2px 12px #0001"}}>
            {encabezadoTabla}<tbody><TablaFilas tareas={tareasMenusuales} getKey={t=>t.id} getSemana={null}/></tbody>
          </table>
        </div>
      )}

      {/* RESUMEN */}
      {tab==="resumen"&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))",gap:16}}>
          {WORKERS.map(w=>{
            const r=resumen(w.nombre);const re=generarResumenEmail();const vencidas=re[w.nombre]?.length||0;
            return(
              <div key={w.nombre} style={{background:"#fff",borderRadius:14,padding:20,boxShadow:"0 2px 10px #0001",border:vencidas>0?"2px solid #fca5a5":"2px solid transparent"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:15,color:"#1e293b"}}>{w.nombre}</div>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginTop:3}}>
                      <span style={{fontSize:11,color:"#64748b",background:"#f1f5f9",borderRadius:20,padding:"2px 8px"}}>{w.cargo}</span>
                      <span style={{fontSize:10,background:w.rol==="admin"?"#fef3c7":w.rol==="consulta"?"#ede9fe":"#dcfce7",color:w.rol==="admin"?"#92400e":w.rol==="consulta"?"#6d28d9":"#166534",borderRadius:20,padding:"1px 7px",fontWeight:600}}>{w.rol==="admin"?"Admin":w.rol==="consulta"?"Consulta":"Editor"}</span>
                      {(Array.isArray(w.modulos)?w.modulos:["tareas"]).map(mid=>{const m=MODULOS_DISPONIBLES.find(x=>x.id===mid);return m?<span key={mid} style={{fontSize:9,background:m.bg,color:m.color,borderRadius:20,padding:"1px 6px",fontWeight:700}}>{m.icon}</span>:null;})}
                    </div>
                    {vencidas>0&&<div style={{fontSize:11,color:"#ef4444",marginTop:4}}>{vencidas} vencida(s)</div>}
                  </div>
                  <div style={{fontSize:24,fontWeight:800,color:r.pct>=75?"#22c55e":r.pct>=40?"#eab308":"#ef4444"}}>{r.pct}%</div>
                </div>
                <div style={{background:"#f1f5f9",borderRadius:8,height:9,marginBottom:12,overflow:"hidden",display:"flex"}}>
                  <div style={{width:`${r.total>0?(r.v/r.total)*100:0}%`,background:"#22c55e"}}/><div style={{width:`${r.total>0?(r.a/r.total)*100:0}%`,background:"#eab308"}}/><div style={{width:`${r.total>0?(r.r/r.total)*100:0}%`,background:"#ef4444"}}/>
                </div>
                <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:vencidas>0?10:0}}>
                  {[["verde","✅",r.v],["amarillo","🟡",r.a],["rojo","🔴",r.r],["gris","⚪",r.g]].map(([k,ico,n])=>(<span key={k} style={{background:SEMAFORO[k].bg,border:`1px solid ${SEMAFORO[k].border}`,borderRadius:8,padding:"3px 9px",fontSize:12,fontWeight:600,color:"#374151"}}>{ico} {n}</span>))}
                </div>
                {vencidas>0&&esAdmin(usuarioActual.nombre)&&<button onClick={()=>enviarEmailPersona(w,re[w.nombre])} style={{width:"100%",background:"#ef4444",color:"#fff",border:"none",borderRadius:8,padding:"7px",cursor:"pointer",fontSize:12,fontWeight:600}}>Enviar aviso a {w.nombre.split(" ")[0]}</button>}
              </div>
            );
          })}
        </div>
      )}

      {/* RECORDATORIOS */}
      {tab==="recordatorios"&&(()=>{
        const lista=esAdmin(usuarioActual.nombre)?RECORDATORIOS.map(rec=>{const fv=diaHabil(anio,mes,rec.diaMes);const hD=new Date();hD.setHours(0,0,0,0);return{...rec,fechaVence:fv,diff:Math.ceil((fv-hD)/(1000*60*60*24))};})
          :getRecordatoriosActivos(usuarioActual.nombre,anio,mes,false);
        const listaF=lista.filter(r=>!recsDone[recKey(r.id)]);
        const listaC=lista.filter(r=>recsDone[recKey(r.id)]);
        return(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            {listaF.length===0&&listaC.length===0&&<div style={{background:"#fff",borderRadius:14,padding:32,textAlign:"center"}}><div style={{fontSize:32}}>✅</div><div style={{color:"#64748b",fontSize:14,marginTop:8}}>No hay recordatorios activos.</div></div>}
            {listaF.map(rec=>{
              const color=rec.diff<0?"#ef4444":rec.diff<=2?"#f59e0b":"#22c55e";
              const bg=rec.diff<0?"#fff5f5":rec.diff<=2?"#fffbeb":"#f0fdf4";
              const border=rec.diff<0?"#fca5a5":rec.diff<=2?"#fde047":"#86efac";
              const destW=WORKERS.filter(w=>rec.destinatarios.includes(w.nombre));
              const ccW=WORKERS.filter(w=>rec.copia.includes(w.nombre));
              const comRec=recsComentarios[recKey(rec.id)]||"";
              return(
                <div key={rec.id} style={{background:bg,border:`2px solid ${border}`,borderRadius:14,padding:20,boxShadow:"0 2px 10px #0001"}}>
                  <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                        <span style={{fontSize:18}}>{rec.diff<0?"🔴":rec.diff<=2?"🟡":"🟢"}</span>
                        <span style={{fontWeight:700,fontSize:15,color:"#1e293b"}}>{rec.titulo}</span>
                        {rec.diff===0&&<span style={{background:"#ef4444",color:"#fff",borderRadius:20,padding:"1px 8px",fontSize:11,fontWeight:700}}>HOY</span>}
                        {rec.diff===1&&<span style={{background:"#f59e0b",color:"#fff",borderRadius:20,padding:"1px 8px",fontSize:11,fontWeight:700}}>MAÑANA</span>}
                        {rec.diff<0&&<span style={{background:"#ef4444",color:"#fff",borderRadius:20,padding:"1px 8px",fontSize:11,fontWeight:700}}>VENCIDO</span>}
                      </div>
                      <div style={{fontSize:13,color:"#64748b",marginBottom:8}}>Fecha: <strong>{rec.fechaVence.getDate()} de {MESES[rec.fechaVence.getMonth()]} {rec.fechaVence.getFullYear()}</strong></div>
                      <div style={{fontSize:12,color:"#374151",background:"rgba(0,0,0,0.04)",borderRadius:8,padding:"8px 12px",marginBottom:10,lineHeight:1.5}}>{rec.mensaje(rec.destinatarios[0])}</div>
                      <div style={{fontSize:11,color:"#64748b",marginBottom:8}}>Para: {rec.destinatarios.join(", ")}{ccW.length>0&&<span style={{marginLeft:12}}>CC: {ccW.map(w=>w.nombre).join(", ")}</span>}</div>
                      <button onClick={()=>{setEditRecComentario(rec.id);setTextoRecComentario(comRec);}} style={{background:comRec?"#dbeafe":"#f1f5f9",border:"none",borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:11,color:comRec?"#1d4ed8":"#9ca3af"}}>{comRec?`💬 ${comRec.substring(0,25)}...`:"+ Comentario"}</button>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {rec.diff<=2&&<button onClick={()=>{destW.forEach(w=>{const asunto=encodeURIComponent(`Recordatorio: ${rec.titulo}`);const cc=ccW.map(c=>c.email).join(",");const cuerpo=encodeURIComponent(rec.mensaje(w.nombre)+`\n\nSaludos,\nEquipo Mediterra`);window.open(`mailto:${w.email}${cc?`?cc=${cc}&`:"?"}subject=${asunto}&body=${cuerpo}`);});}} style={{background:color,color:"#fff",border:"none",borderRadius:10,padding:"10px 18px",cursor:"pointer",fontWeight:700,fontSize:13,whiteSpace:"nowrap"}}>Enviar aviso</button>}
                      <button onClick={()=>setRecsDone(prev=>({...prev,[recKey(rec.id)]:true}))} style={{background:"#22c55e",color:"#fff",border:"none",borderRadius:10,padding:"10px 18px",cursor:"pointer",fontWeight:700,fontSize:13,whiteSpace:"nowrap"}}>✓ Completado</button>
                    </div>
                  </div>
                </div>
              );
            })}
            {listaC.length>0&&(<div><div style={{fontSize:12,color:"#94a3b8",fontWeight:600,marginBottom:8}}>COMPLETADOS ESTE MES</div>
              {listaC.map(rec=>{const comRec=recsComentarios[recKey(rec.id)]||"";return(
                <div key={rec.id} style={{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:12,padding:"12px 16px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
                  <div><div style={{display:"flex",alignItems:"center",gap:6}}><span>✅</span><span style={{fontWeight:600,fontSize:13,color:"#15803d"}}>{rec.titulo}</span></div>{comRec&&<div style={{fontSize:11,color:"#64748b",marginTop:4}}>💬 {comRec}</div>}</div>
                  <button onClick={()=>setRecsDone(prev=>{const n={...prev};delete n[recKey(rec.id)];return n;})} style={{background:"none",border:"1px solid #d1d5db",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontSize:11,color:"#64748b"}}>Deshacer</button>
                </div>
              );})}
            </div>)}
          </div>
        );
      })()}

      {/* CONFIGURAR */}
      {tab==="configurar"&&esAdmin(usuarioActual.nombre)&&(
        <div style={{display:"flex",flexDirection:"column",gap:24}}>
          <div style={{background:"#fff",borderRadius:14,padding:20,boxShadow:"0 2px 10px #0001"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h3 style={{margin:0,color:"#1e293b",fontSize:15}}>Gestión de Usuarios</h3>
              <div style={{display:"flex",gap:8}}>
                {["lista","nuevo"].map(t=>(
                  <button key={t} onClick={()=>{setTabUsuarios(t);setUsuarioEditando(null);setFormUsuario({nombre:"",cargo:"",email:"",pin:"",rol:"editor",acceso:"tareas"});}}
                    style={{padding:"5px 14px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:tabUsuarios===t&&!usuarioEditando?"#2563eb":"#f1f5f9",color:tabUsuarios===t&&!usuarioEditando?"#fff":"#374151"}}>
                    {t==="lista"?"Ver usuarios":"+ Nuevo"}
                  </button>
                ))}
              </div>
            </div>
            {tabUsuarios==="lista"&&!usuarioEditando&&(
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                  <thead><tr style={{background:"#f8fafc",color:"#64748b"}}>
                    <th style={{padding:"8px 12px",textAlign:"left",fontWeight:600}}>Nombre</th>
                    <th style={{padding:"8px 12px",textAlign:"left",fontWeight:600}}>Cargo</th>
                    <th style={{padding:"8px 12px",textAlign:"center",fontWeight:600}}>Rol</th>
                    <th style={{padding:"8px 12px",textAlign:"center",fontWeight:600}}>Acceso a Módulos</th>
                    <th style={{padding:"8px 12px",textAlign:"center",fontWeight:600,width:220}}>Acciones</th>
                  </tr></thead>
                  <tbody>{usuarios.map((u,i)=>(
                    <tr key={u.nombre} style={{borderTop:"1px solid #f1f5f9",background:u.desactivado?"#f8fafc":i%2===0?"#fff":"#fafafa",opacity:u.desactivado?0.5:1}}>
                      <td style={{padding:"8px 12px",fontWeight:600,color:"#1e293b"}}>
                        {u.nombre}{u.nombre===usuarioActual.nombre&&<span style={{fontSize:10,background:"#dbeafe",color:"#1d4ed8",borderRadius:20,padding:"1px 6px",marginLeft:6}}>yo</span>}
                        {u.desactivado&&<span style={{fontSize:10,background:"#fee2e2",color:"#991b1b",borderRadius:20,padding:"1px 6px",marginLeft:6}}>inactivo</span>}
                      </td>
                      <td style={{padding:"8px 12px",color:"#64748b",fontSize:12}}>{u.cargo}</td>
                      <td style={{padding:"8px 12px",textAlign:"center"}}>
                        <span style={{background:u.rol==="admin"?"#fef3c7":u.rol==="consulta"?"#ede9fe":"#dcfce7",color:u.rol==="admin"?"#92400e":u.rol==="consulta"?"#6d28d9":"#166534",borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:600}}>
                          {u.rol==="admin"?"Admin":u.rol==="consulta"?"Consulta":"Editor"}
                        </span>
                      </td>
                      <td style={{padding:"8px 12px",textAlign:"center"}}>
                        <div style={{display:"flex",gap:4,justifyContent:"center",flexWrap:"wrap"}}>
                          {(u.rol==="admin"?MODULOS_DISPONIBLES.map(m=>m.id):(Array.isArray(u.modulos)?u.modulos:["tareas"])).map(mid=>{
                            const m=MODULOS_DISPONIBLES.find(x=>x.id===mid);
                            return m?<span key={mid} style={{background:m.bg,color:m.color,border:`1px solid ${m.color}44`,borderRadius:20,padding:"2px 8px",fontSize:10,fontWeight:700}}>{m.icon} {m.label}</span>:null;
                          })}
                        </div>
                      </td>
                      <td style={{padding:"8px 12px",textAlign:"center"}}>
                        <div style={{display:"flex",gap:6,justifyContent:"center",flexWrap:"wrap"}}>
                          <button onClick={()=>iniciarEdicion(u)} style={{background:"#dbeafe",color:"#1d4ed8",border:"none",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>Editar</button>
                          <button onClick={()=>resetPinUsuario(u.nombre)} style={{background:"#fef9c3",color:"#92400e",border:"none",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>Reset PIN</button>
                          {u.nombre!==usuarioActual.nombre&&<button onClick={()=>toggleDesactivarUsuario(u.nombre)} style={{background:u.desactivado?"#dcfce7":"#fee2e2",color:u.desactivado?"#166534":"#991b1b",border:"none",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>{u.desactivado?"Activar":"Desactivar"}</button>}
                        </div>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            {(tabUsuarios==="nuevo"||(tabUsuarios==="editar"&&usuarioEditando))&&(
              <div>
                <h4 style={{margin:"0 0 16px",color:"#1e293b",fontSize:14}}>{usuarioEditando?"Editar usuario":"Nuevo usuario"}</h4>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
                  {[["Nombre completo *","nombre","text"],["Cargo","cargo","text"],["Email *","email","email"]].map(([lbl,campo,tipo])=>(
                    <div key={campo}><label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>{lbl}</label>
                    <input type={tipo} value={formUsuario[campo]} onChange={e=>setFormUsuario(p=>({...p,[campo]:e.target.value}))} disabled={!!usuarioEditando&&campo==="nombre"}
                      style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",background:usuarioEditando&&campo==="nombre"?"#f1f5f9":"#fff"}}/></div>
                  ))}
                  <div><label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>{usuarioEditando?"Nuevo PIN (vacío = sin cambio)":"PIN inicial *"}</label>
                  <input type="password" value={formUsuario.pin} onChange={e=>setFormUsuario(p=>({...p,pin:e.target.value}))} maxLength={6}
                    style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",textAlign:"center",letterSpacing:4}}/></div>
                  <div><label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>Rol</label>
                  <select value={formUsuario.rol} onChange={e=>setFormUsuario(p=>({...p,rol:e.target.value}))} style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}>
                    {ROLES.map(r=><option key={r.v} value={r.v}>{r.l}</option>)}
                  </select></div>
                  <div style={{gridColumn:"1/-1"}}>
                    <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:8}}>Acceso a módulos</label>
                    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                      {MODULOS_DISPONIBLES.map(m=>{
                        const tiene=(formUsuario.modulos||[]).includes(m.id)||formUsuario.rol==="admin";
                        return(
                          <label key={m.id} style={{display:"flex",alignItems:"center",gap:6,cursor:formUsuario.rol==="admin"?"not-allowed":"pointer",
                            background:tiene?m.bg:"#f1f5f9",border:`1px solid ${tiene?m.color+"66":"#d1d5db"}`,
                            borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:600,color:tiene?m.color:"#94a3b8"}}>
                            <input type="checkbox" checked={tiene} disabled={formUsuario.rol==="admin"}
                              onChange={()=>{
                                const mods=formUsuario.modulos||[];
                                if(mods.includes(m.id)){if(mods.length>1)setFormUsuario(p=>({...p,modulos:mods.filter(x=>x!==m.id)}));}
                                else setFormUsuario(p=>({...p,modulos:[...mods,m.id]}));
                              }}
                              style={{accentColor:m.color}}/>
                            {m.icon} {m.label}
                          </label>
                        );
                      })}
                    </div>
                    {formUsuario.rol==="admin"&&<div style={{fontSize:11,color:"#64748b",marginTop:4}}>Admin tiene acceso automático a todos los módulos</div>}
                  </div>
                  {!usuarioEditando&&(<div><label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>Copiar tareas de</label>
                  <select value={copiarDe} onChange={e=>setCopiarDe(e.target.value)} style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}>
                    <option value="">Sin copiar</option>{WORKERS.map(w=><option key={w.nombre} value={w.nombre}>{w.nombre}</option>)}
                  </select></div>)}
                </div>
                <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:16}}>
                  <button onClick={()=>{setTabUsuarios("lista");setUsuarioEditando(null);setFormUsuario({nombre:"",cargo:"",email:"",pin:"",rol:"editor",modulos:["tareas"]});}} style={{padding:"8px 18px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:14}}>Cancelar</button>
                  <button onClick={usuarioEditando?guardarEdicionUsuario:agregarUsuario} style={{padding:"8px 18px",borderRadius:8,border:"none",background:"#2563eb",color:"#fff",cursor:"pointer",fontSize:14,fontWeight:600}}>{usuarioEditando?"Guardar cambios":"Crear usuario"}</button>
                </div>
              </div>
            )}
          </div>

          {/* Agregar tarea */}
          <div style={{background:"#fff",borderRadius:14,padding:20,boxShadow:"0 2px 10px #0001",border:"2px dashed #e2e8f0"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:mostrarFormTarea?16:0}}>
              <h3 style={{margin:0,color:"#1e293b",fontSize:15}}>+ Agregar nueva tarea</h3>
              <button onClick={()=>setMostrarFormTarea(p=>!p)} style={{background:mostrarFormTarea?"#f1f5f9":"#2563eb",color:mostrarFormTarea?"#374151":"#fff",border:"none",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:13,fontWeight:600}}>{mostrarFormTarea?"Cancelar":"Nueva tarea"}</button>
            </div>
            {mostrarFormTarea&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
                <div style={{gridColumn:"1/-1"}}><label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>Nombre *</label>
                <input value={nuevaTarea.nombre} onChange={e=>setNuevaTarea(p=>({...p,nombre:e.target.value}))} style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}/></div>
                {[["Responsable *","responsable",WORKERS.map(w=>({v:w.nombre,l:w.nombre}))],["Supervisor","supervisor",[{v:"",l:"Sin supervisor"},...WORKERS.map(w=>({v:w.nombre,l:w.nombre}))]],["Categoria","categoria",Object.keys(CATEGORIAS).map(k=>({v:k,l:k}))],["Frecuencia","frecuencia",FRECUENCIAS.map(f=>({v:f,l:f}))],["Depende de","dependeDe",[{v:"",l:"Sin dependencia"},...todasTareas().map(t=>({v:t.id,l:t.nombre.substring(0,30)}))]]].map(([lbl,campo,opts])=>(
                  <div key={campo}><label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>{lbl}</label>
                  <select value={nuevaTarea[campo]} onChange={e=>setNuevaTarea(p=>({...p,[campo]:e.target.value}))} style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box"}}>
                    {opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                  </select></div>
                ))}
                <div style={{gridColumn:"1/-1",display:"flex",justifyContent:"flex-end"}}>
                  <button onClick={agregarTarea} style={{background:"#22c55e",color:"#fff",border:"none",borderRadius:10,padding:"10px 24px",cursor:"pointer",fontWeight:700,fontSize:14}}>Guardar tarea</button>
                </div>
              </div>
            )}
          </div>

          {/* Tabla config tareas */}
          {[["Semanales y Diarias",todasTareas().filter(t=>getFrecuencia(t.id)!=="Mensual")],["Mensuales",todasTareas().filter(t=>getFrecuencia(t.id)==="Mensual")]].map(([titulo,tareas])=>(
            <div key={titulo} style={{background:"#fff",borderRadius:14,padding:20,boxShadow:"0 2px 10px #0001"}}>
              <h3 style={{margin:"0 0 16px",color:"#1e293b",fontSize:15}}>{titulo}</h3>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead><tr style={{background:"#f8fafc",color:"#64748b"}}>
                    <th style={{padding:"8px 12px",textAlign:"left",fontWeight:600,minWidth:160}}>Tarea</th>
                    <th style={{padding:"8px 12px",textAlign:"center",fontWeight:600,width:80}}>Resp.</th>
                    <th style={{padding:"8px 12px",textAlign:"center",fontWeight:600,width:120}}>Supervisor</th>
                    <th style={{padding:"8px 12px",textAlign:"center",fontWeight:600,width:100}}>Frecuencia</th>
                    <th style={{padding:"8px 12px",textAlign:"center",fontWeight:600,width:120}}>Dia limite</th>
                    <th style={{padding:"8px 12px",textAlign:"center",fontWeight:600,width:120}}>Depende de</th>
                    <th style={{padding:"8px 12px",textAlign:"center",fontWeight:600,width:90}}>Estado</th>
                  </tr></thead>
                  <tbody>{tareas.map((t,i)=>{
                    const cfg=getConfig(t.id);const bloq=isBloqueada(t.id);
                    return(
                      <tr key={t.id} style={{borderTop:"1px solid #f1f5f9",background:bloq?"#f8fafc":i%2===0?"#fff":"#fafafa",opacity:bloq?0.55:1}}>
                        <td style={{padding:"8px 12px",color:bloq?"#94a3b8":"#1e293b",textDecoration:bloq?"line-through":"none"}}>{t.nombre}{t.id.startsWith("custom_")&&<span style={{fontSize:9,background:"#dbeafe",color:"#1d4ed8",borderRadius:20,padding:"1px 6px",marginLeft:4}}>nueva</span>}</td>
                        <td style={{padding:"8px 12px",textAlign:"center",color:"#64748b"}}>{t.responsable.split(" ")[0]}</td>
                        <td style={{padding:"8px 12px",textAlign:"center"}}>
                          <select value={getSupervisor(t.id)||""} onChange={e=>updateConfig(t.id,"supervisor",e.target.value)} style={{padding:"3px 6px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,cursor:"pointer",width:"100%"}}>
                            <option value="">Ninguno</option>{WORKERS.filter(w=>w.nombre!==t.responsable).map(w=><option key={w.nombre} value={w.nombre}>{w.nombre.split(" ")[0]}</option>)}
                          </select>
                        </td>
                        <td style={{padding:"8px 12px",textAlign:"center"}}>
                          <select value={cfg.frecuencia||t.frecuencia} onChange={e=>updateConfig(t.id,"frecuencia",e.target.value)} style={{padding:"3px 6px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,cursor:"pointer"}}>
                            {FRECUENCIAS.map(f=><option key={f} value={f}>{f}</option>)}
                          </select>
                        </td>
                        <td style={{padding:"8px 12px",textAlign:"center"}}>
                          {(cfg.frecuencia||t.frecuencia)==="Mensual"?(
                            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                              <button onClick={()=>updateConfig(t.id,"diaLimite",Math.max(1,(cfg.diaLimite||t.diaLimite)-1))} style={{width:20,height:20,borderRadius:4,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:12}}>-</button>
                              <span style={{fontWeight:700,minWidth:22,textAlign:"center"}}>{cfg.diaLimite||t.diaLimite}</span>
                              <button onClick={()=>updateConfig(t.id,"diaLimite",Math.min(31,(cfg.diaLimite||t.diaLimite)+1))} style={{width:20,height:20,borderRadius:4,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:12}}>+</button>
                            </div>
                          ):(
                            <select value={cfg.diaLimiteSem??t.diaLimiteSem} onChange={e=>updateConfig(t.id,"diaLimiteSem",parseInt(e.target.value))} style={{padding:"3px 6px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,cursor:"pointer"}}>
                              {DIAS_SEMANA.map((d,idx)=><option key={idx} value={idx}>{d}</option>)}
                            </select>
                          )}
                        </td>
                        <td style={{padding:"8px 12px",textAlign:"center"}}>
                          <select value={cfg.dependeDe||""} onChange={e=>updateConfig(t.id,"dependeDe",e.target.value||null)} style={{padding:"3px 6px",borderRadius:6,border:"1px solid #d1d5db",fontSize:11,cursor:"pointer",width:"100%"}}>
                            <option value="">Ninguna</option>{todasTareas().filter(x=>x.id!==t.id).map(x=><option key={x.id} value={x.id}>{x.nombre.substring(0,18)}{x.nombre.length>18?"...":""}</option>)}
                          </select>
                        </td>
                        <td style={{padding:"8px 12px",textAlign:"center"}}>
                          <button onClick={()=>toggleBloqueada(t.id)} style={{background:bloq?"#f1f5f9":"#dcfce7",color:bloq?"#64748b":"#15803d",border:`1px solid ${bloq?"#d1d5db":"#86efac"}`,borderRadius:8,padding:"3px 10px",cursor:"pointer",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>
                            {bloq?"Activar":"Bloquear"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            </div>
          ))}
          <div style={{background:"#dbeafe",borderRadius:10,padding:"10px 16px",fontSize:13,color:"#1d4ed8"}}>Cambios guardados automaticamente. Las tareas bloqueadas conservan su historial.</div>
        </div>
      )}

      {/* FOOTER */}
      <div style={{marginTop:40,borderTop:"1px solid #e2e8f0",paddingTop:24}}>
        <div style={{textAlign:"center",marginBottom:20}}><span style={{fontSize:11,color:"#94a3b8",letterSpacing:3,textTransform:"uppercase",fontWeight:600}}>Nuestras Empresas – Mediterra</span></div>
        <div style={{display:"flex",flexWrap:"wrap",gap:16,justifyContent:"center",alignItems:"center"}}>
          {[
            {bg:"#1a1a2e",content:<><div style={{display:"flex",gap:1}}><span style={{color:"#6b7280",fontWeight:900,fontSize:15}}>FRISKU</span><span style={{color:"#60a5fa",fontWeight:900,fontSize:15}}>FOODS</span></div><span style={{color:"#9ca3af",fontSize:8,letterSpacing:2}}>CONNECTING QUALITY</span></>},
            {bg:"#0f2d4a",content:<><span style={{color:"#2980b9",fontWeight:700,fontSize:16,letterSpacing:3}}>OSIRIS</span><span style={{color:"#7fb3d3",fontSize:9,letterSpacing:2}}>PLANT MANAGEMENT</span></>},
            {bg:"#1a1a1a",content:<><span style={{color:"#9ca3af",fontWeight:300,fontSize:18,fontStyle:"italic",fontFamily:"Georgia,serif"}}>Allegria</span><span style={{color:"#ec4899",fontSize:11,letterSpacing:2,marginTop:-2}}>foods</span></>},
            {bg:"#111",content:<><span style={{color:"#e5e7eb",fontWeight:700,fontSize:15,letterSpacing:2}}>ALLEGRIA</span><span style={{color:"#ef4444",fontSize:10,letterSpacing:3,borderTop:"1px solid #ef4444",paddingTop:3,width:"100%",textAlign:"center"}}>SERVICE</span></>},
            {bg:"#0f2010",border:"1px solid #166534",content:<><span style={{color:"#16a34a",fontWeight:800,fontSize:13,letterSpacing:2}}>INTEGRITY</span><span style={{color:"#16a34a",fontWeight:800,fontSize:13,letterSpacing:2,borderTop:"1px solid #16a34a",paddingTop:3,width:"100%",textAlign:"center"}}>FARMS</span></>},
            {bg:"#1e1b4b",content:<><span style={{color:"#818cf8",fontWeight:900,fontSize:14}}>ALLPA FARMS</span><span style={{background:"#34d399",color:"#fff",fontSize:9,fontWeight:700,borderRadius:4,padding:"1px 8px",marginTop:3,letterSpacing:2}}>PERU</span></>},
            {bg:"#1e1b4b",content:<><span style={{color:"#818cf8",fontWeight:900,fontSize:14}}>ALLPA FARMS</span><span style={{background:"#f87171",color:"#fff",fontSize:9,fontWeight:700,borderRadius:4,padding:"1px 8px",marginTop:3,letterSpacing:2}}>CHILE</span></>},
          ].map((item,i)=>(
            <div key={i} style={{background:item.bg,border:item.border,borderRadius:10,padding:"10px 18px",display:"flex",flexDirection:"column",alignItems:"center",minWidth:110,gap:2}}>{item.content}</div>
          ))}
        </div>
        <div style={{textAlign:"center",marginTop:20,fontSize:10,color:"#cbd5e1"}}>© {new Date().getFullYear()} Grupo Mediterra · Todos los derechos reservados</div>
      </div>
    </div>
  );
}
