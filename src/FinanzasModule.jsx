/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useCallback, useRef } from "react";
import OsirisModule from "./OsirisModule.jsx";
import FinanzasModule from "./FinanzasModule.jsx";

const EMAILJS_SERVICE  = "service_ahuerta";
const EMAILJS_TEMPLATE       = "template_c7yup8d";  // Template PIN temporal
const EMAILJS_TEMPLATE_NOTIF = "template_notif_tarea"; // ← reemplaza con tu template ID
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

// Template separado para notificaciones de tareas (sin texto de PIN)
async function enviarNotificacion(toEmail, nombre, asunto, mensaje) {
  await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({service_id:EMAILJS_SERVICE,template_id:EMAILJS_TEMPLATE_NOTIF,user_id:EMAILJS_KEY,
      template_params:{nombre, message:mensaje, to_email:toEmail, subject:asunto}})
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
  {nombre:"Milagros Becerra",cargo:"Sec. Administrativa",     email:"Mbecerra@grupomediterra.cl",pin:"4827",rol:"editor", modulos:["tareas"],                    esCFO:false},
  {nombre:"Carol Machuca",   cargo:"Analista Finanzas",       email:"cmachuca@grupomediterra.cl",pin:"3159",rol:"editor", modulos:["tareas","osiris","finanzas"], esCFO:false},
  {nombre:"Michelle Garcia", cargo:"Contadora General",       email:"mgarcia@grupomediterra.cl", pin:"7413",rol:"editor", modulos:["tareas"],                    esCFO:false},
  {nombre:"Pablo Duran",     cargo:"Asistente Contable",      email:"pduran@grupomediterra.cl",  pin:"2986",rol:"editor", modulos:["tareas"],                    esCFO:false},
  {nombre:"Angelo Huerta",   cargo:"Gerencia Adm. y Finanzas",email:"ahuerta@grupomediterra.cl", pin:"6054",rol:"admin",  modulos:["tareas","osiris","finanzas"], esCFO:true},
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
  if(usuario.rol === "admin") return MODULOS_DISPONIBLES.map(m=>m.id);
  return Array.isArray(usuario.modulos) ? usuario.modulos : ["tareas"];
}

function OsirisLogoSmall() {
  return (
    <img src="/osiris-logo.jpg" alt="Osiris Plant Management"
      style={{height:70, objectFit:"contain", display:"block", marginBottom:6}}/>
  );
}

// ══════════════════════════════════════════════════════════════════════
// PERMISOS POR PESTAÑA — configuración centralizada
// ══════════════════════════════════════════════════════════════════════
const TABS_PERMISOS_CONFIG = {
  tareas: [
    {id:"semanal",  label:"📅 Vista Semanal"},
    {id:"mensual",  label:"📆 Vista Mensual"},
    {id:"config",   label:"⚙️ Configuración"},
  ],
  osiris: [
    {id:"contratos",  label:"📄 Contratos"},
    {id:"royalties",  label:"💰 Royalties / Fee"},
  ],
  finanzas: [
    {id:"dashboard", label:"📊 Dashboard"},
    {id:"flujo",     label:"📈 Flujo Empresas"},
    {id:"bancos",    label:"🏦 Saldos Bancos"},
    {id:"creditos",  label:"💳 Créditos"},
    {id:"params",    label:"⚡ Parámetros"},
  ],
};

const NIVELES_PERM = ["editar","ver","sin_acceso"];
const NIVEL_LABEL  = {editar:"✏️ Editar", ver:"👁 Solo ver", sin_acceso:"🚫 Sin acceso"};
const NIVEL_COLOR  = {editar:"#166534", ver:"#1d4ed8", sin_acceso:"#991b1b"};
const NIVEL_BG     = {editar:"#dcfce7", ver:"#dbeafe",  sin_acceso:"#fee2e2"};

// Obtiene el permiso de un usuario sobre una pestaña específica de un módulo
// Admin siempre tiene "editar". Si no hay config, default = "editar"
function getTabPerm(usuario, modulo, tabId) {
  if(!usuario) return "sin_acceso";
  if(usuario.rol === "admin") return "editar";
  return usuario.tab_permisos?.[modulo]?.[tabId] ?? "editar";
}

// Devuelve objeto {tabId: nivel} para un usuario+modulo
function getTabPermisosModulo(usuario, modulo) {
  if(!usuario) return {};
  if(usuario.rol === "admin") {
    const obj = {};
    (TABS_PERMISOS_CONFIG[modulo]||[]).forEach(t=>{ obj[t.id]="editar"; });
    return obj;
  }
  const base = {};
  (TABS_PERMISOS_CONFIG[modulo]||[]).forEach(t=>{
    base[t.id] = usuario.tab_permisos?.[modulo]?.[t.id] ?? "editar";
  });
  return base;
}

// ══════════════════════════════════════════════════════════════════════
// PANEL DE PERMISOS
// ══════════════════════════════════════════════════════════════════════
function PanelPermisos({ usuarios, setUsuarios, onClose }) {
  const [expandedTabUser, setExpandedTabUser] = useState(null); // nombre del usuario expandido

  function toggleModulo(nombreU, modId) {
    setUsuarios(prev => prev.map(u => {
      if (u.nombre !== nombreU) return u;
      const mods = Array.isArray(u.modulos) ? [...u.modulos] : ["tareas"];
      if (mods.includes(modId)) {
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

  function setTabPerm(nombreU, modulo, tabId, nivel) {
    setUsuarios(prev => prev.map(u => {
      if(u.nombre !== nombreU) return u;
      const tp = JSON.parse(JSON.stringify(u.tab_permisos || {}));
      if(!tp[modulo]) tp[modulo] = {};
      tp[modulo][tabId] = nivel;
      return { ...u, tab_permisos: tp };
    }));
  }

  const activos = usuarios.filter(u => !u.desactivado);
  const inactivos = usuarios.filter(u => u.desactivado);

  return (
    <div style={{position:"fixed",inset:0,background:"#000a",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"sans-serif",padding:16}}>
      <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:820,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 64px #0006"}}>
        <div style={{background:"linear-gradient(135deg,#1e3a5f,#2563eb)",borderRadius:"20px 20px 0 0",padding:"20px 28px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.6)",letterSpacing:2,marginBottom:2}}>ADMINISTRACIÓN</div>
            <div style={{fontSize:17,fontWeight:800,color:"#fff"}}>⚙️ Gestión de Accesos y Permisos</div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:8,padding:"6px 16px",cursor:"pointer",fontSize:13,fontWeight:600}}>Cerrar ×</button>
        </div>

        <div style={{padding:"24px 28px"}}>
          <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap"}}>
            <div style={{fontSize:12,color:"#64748b",fontWeight:600,alignSelf:"center"}}>Módulos:</div>
            {MODULOS_DISPONIBLES.map(m=>(
              <span key={m.id} style={{background:m.bg,color:m.color,border:`1px solid ${m.color}44`,borderRadius:20,padding:"3px 12px",fontSize:11,fontWeight:700}}>
                {m.icon} {m.label}
              </span>
            ))}
          </div>

          <div style={{fontSize:12,color:"#94a3b8",fontWeight:700,marginBottom:8,letterSpacing:1}}>USUARIOS ACTIVOS</div>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:24}}>
            {activos.map(u => {
              const mods = Array.isArray(u.modulos) ? u.modulos : (u.rol==="admin"?["tareas","osiris"]:["tareas"]);
              const isExpanded = expandedTabUser === u.nombre;
              return (
                <div key={u.nombre} style={{background:"#f8fafc",borderRadius:12,border:"1px solid #e2e8f0",overflow:"hidden"}}>
                  {/* Fila principal */}
                  <div style={{padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10}}>
                    <div style={{flex:1,minWidth:160}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontWeight:700,fontSize:14,color:"#1e293b"}}>{u.nombre}</span>
                        <span style={{fontSize:10,background:u.rol==="admin"?"#fef3c7":u.rol==="consulta"?"#ede9fe":"#dcfce7",color:u.rol==="admin"?"#92400e":u.rol==="consulta"?"#6d28d9":"#166534",borderRadius:20,padding:"1px 8px",fontWeight:700}}>
                          {u.rol==="admin"?"Admin":u.rol==="consulta"?"Consulta":"Editor"}
                        </span>
                      </div>
                      <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{u.cargo}</div>
                    </div>

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

                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <select value={u.rol} onChange={e=>setRol(u.nombre,e.target.value)}
                        style={{padding:"5px 8px",borderRadius:8,border:"1px solid #d1d5db",fontSize:11,cursor:"pointer",background:"#fff"}}>
                        <option value="editor">Editor</option>
                        <option value="consulta">Consulta</option>
                        <option value="admin">Admin</option>
                      </select>
                      {u.rol!=="admin"&&(
                        <button onClick={()=>setExpandedTabUser(isExpanded?null:u.nombre)}
                          style={{background:isExpanded?"#e0e7ff":"#f1f5f9",color:isExpanded?"#4f46e5":"#64748b",border:"none",
                            borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>
                          🗂 Pestañas {isExpanded?"▴":"▾"}
                        </button>
                      )}
                      <button onClick={()=>toggleActivar(u.nombre)}
                        style={{background:"#fee2e2",color:"#991b1b",border:"none",borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>
                        Desactivar
                      </button>
                    </div>
                  </div>
                  {u.rol==="admin"&&<div style={{padding:"0 18px 10px",fontSize:10,color:"#64748b"}}>⚙️ Admin tiene acceso automático a todos los módulos y pestañas</div>}

                  {/* Sección permisos por pestaña (expandible) */}
                  {isExpanded&&u.rol!=="admin"&&(
                    <div style={{borderTop:"1px solid #e2e8f0",background:"#fff",padding:"16px 18px"}}>
                      <div style={{fontSize:12,fontWeight:700,color:"#1e293b",marginBottom:12}}>
                        🗂 Permisos por pestaña — <span style={{color:"#64748b",fontWeight:500}}>define qué puede ver/editar en cada pestaña de cada módulo</span>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:14}}>
                        {MODULOS_DISPONIBLES.filter(m=>u.rol==="admin"||mods.includes(m.id)).map(mod=>{
                          const tabs = TABS_PERMISOS_CONFIG[mod.id] || [];
                          if(tabs.length===0) return null;
                          return (
                            <div key={mod.id} style={{background:"#f8fafc",borderRadius:10,padding:"12px 14px",border:`1px solid ${mod.color}33`}}>
                              <div style={{fontSize:11,fontWeight:700,color:mod.color,marginBottom:10}}>
                                {mod.icon} {mod.label}
                              </div>
                              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                                {tabs.map(tab=>{
                                  const nivel = getTabPerm(u, mod.id, tab.id);
                                  return (
                                    <div key={tab.id} style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                                      <div style={{minWidth:160,fontSize:12,color:"#374151",fontWeight:500}}>{tab.label}</div>
                                      <div style={{display:"flex",gap:5}}>
                                        {NIVELES_PERM.map(n=>(
                                          <button key={n} onClick={()=>setTabPerm(u.nombre,mod.id,tab.id,n)}
                                            style={{padding:"4px 12px",borderRadius:20,fontSize:11,fontWeight:600,cursor:"pointer",border:"none",
                                              background:nivel===n?NIVEL_BG[n]:"#e2e8f0",
                                              color:nivel===n?NIVEL_COLOR[n]:"#64748b",
                                              outline:nivel===n?`2px solid ${NIVEL_COLOR[n]}`:"none"}}>
                                            {NIVEL_LABEL[n]}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

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

          {/* ── Agregar nuevo usuario ── */}
          <NuevoUsuarioForm setUsuarios={setUsuarios}/>

          <div style={{background:"#dbeafe",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#1d4ed8",marginTop:8}}>
            💾 Los cambios se guardan automáticamente en tiempo real.
          </div>
        </div>
      </div>
    </div>
  );
}

// Formulario nuevo usuario — separado para mantener su propio estado
function NuevoUsuarioForm({setUsuarios}) {
  const [open,setOpen]=useState(false);
  const [form,setForm]=useState({nombre:"",cargo:"",email:"",pin:"",rol:"editor",modulos:["tareas"]});
  const [err,setErr]=useState("");

  function guardar(){
    setErr("");
    if(!form.nombre.trim()){setErr("El nombre es obligatorio.");return;}
    if(!form.email.trim()){setErr("El email es obligatorio.");return;}
    if(!form.pin.trim()||form.pin.length<4){setErr("El PIN debe tener al menos 4 dígitos.");return;}
    setUsuarios(prev=>{
      if(prev.find(u=>u.nombre===form.nombre)){setErr("Ya existe un usuario con ese nombre.");return prev;}
      const mods=form.rol==="admin"?MODULOS_DISPONIBLES.map(m=>m.id):form.modulos;
      return[...prev,{...form,modulos:mods,esCFO:form.rol==="admin",desactivado:false}];
    });
    setForm({nombre:"",cargo:"",email:"",pin:"",rol:"editor",modulos:["tareas"]});
    setOpen(false);setErr("");
  }

  function toggleMod(id){
    setForm(p=>{
      const mods=p.modulos.includes(id)?p.modulos.filter(m=>m!==id):[...p.modulos,id];
      return{...p,modulos:mods};
    });
  }

  return(
    <div style={{marginTop:16}}>
      <button onClick={()=>setOpen(v=>!v)}
        style={{background:open?"#1e3a5f":"#f1f5f9",color:open?"#fff":"#1e293b",border:"1px solid #e2e8f0",
          borderRadius:10,padding:"9px 20px",cursor:"pointer",fontSize:13,fontWeight:700,width:"100%",textAlign:"left"}}>
        {open?"✕ Cancelar":"+ Agregar nuevo usuario"}
      </button>
      {open&&(
        <div style={{background:"#f8fafc",borderRadius:12,border:"1px solid #e2e8f0",padding:"18px 20px",marginTop:8}}>
          <div style={{fontSize:13,fontWeight:800,color:"#1e293b",marginBottom:14}}>Nuevo usuario</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
            {[["Nombre completo *","nombre","text"],["Cargo","cargo","text"],["Email *","email","email"],["PIN (mín. 4 dígitos) *","pin","password"]].map(([lbl,campo,tipo])=>(
              <div key={campo}>
                <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:4}}>{lbl}</div>
                <input type={tipo} value={form[campo]} onChange={e=>setForm(p=>({...p,[campo]:e.target.value}))}
                  style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,boxSizing:"border-box",outline:"none"}}/>
              </div>
            ))}
          </div>
          <div style={{marginBottom:12}}>
            <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:6}}>Rol</div>
            <div style={{display:"flex",gap:8}}>
              {[["editor","Editor","#dcfce7","#166534"],["consulta","Consulta","#ede9fe","#6d28d9"],["admin","Admin","#fef3c7","#92400e"]].map(([v,l,bg,col])=>(
                <button key={v} onClick={()=>setForm(p=>({...p,rol:v,modulos:v==="admin"?MODULOS_DISPONIBLES.map(m=>m.id):p.modulos}))}
                  style={{padding:"6px 16px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,
                    background:form.rol===v?bg:"#e2e8f0",color:form.rol===v?col:"#64748b"}}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          {form.rol!=="admin"&&(
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:6}}>Acceso a módulos</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {MODULOS_DISPONIBLES.map(m=>(
                  <label key={m.id} style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer",
                    background:form.modulos.includes(m.id)?m.bg:"#f1f5f9",
                    border:`1px solid ${form.modulos.includes(m.id)?m.color+"66":"#d1d5db"}`,
                    borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:600,
                    color:form.modulos.includes(m.id)?m.color:"#94a3b8"}}>
                    <input type="checkbox" checked={form.modulos.includes(m.id)} onChange={()=>toggleMod(m.id)}
                      style={{accentColor:m.color}}/>
                    {m.icon} {m.label}
                  </label>
                ))}
              </div>
            </div>
          )}
          {err&&<div style={{color:"#ef4444",fontSize:12,marginBottom:8}}>{err}</div>}
          <button onClick={guardar}
            style={{padding:"9px 24px",borderRadius:8,background:"#2563eb",color:"#fff",border:"none",
              cursor:"pointer",fontSize:13,fontWeight:700}}>
            💾 Guardar usuario
          </button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// PANTALLA HUB
// ══════════════════════════════════════════════════════════════════════
function HubScreen({ usuario, modulosPermitidos, onSelectModulo, onLogout, onCambiarPin, esSoloConsulta, usuarios, setUsuarios }) {
  const hoy = new Date();
  const fechaStr = hoy.toLocaleDateString("es-CL", {weekday:"long", day:"numeric", month:"long", year:"numeric"});
  const [mostrarPermisos, setMostrarPermisos] = useState(false);

  return (
    <div style={{minHeight:"100vh", background:"#ffffff", fontFamily:"sans-serif", padding:"0 0 40px"}}>

      {mostrarPermisos && (
        <PanelPermisos usuarios={usuarios} setUsuarios={setUsuarios} onClose={()=>setMostrarPermisos(false)}/>
      )}

      <div style={{padding:"24px 32px 0", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12, borderBottom:"1px solid #e2e8f0", paddingBottom:16}}>
        <div style={{display:"flex", alignItems:"center", gap:14}}>
          <MediterraLogo size={52}/>
          <div>
            <div style={{fontSize:10, letterSpacing:4, color:"#0f766e", fontWeight:700, textTransform:"uppercase"}}>MEDITERRA</div>
            <div style={{fontSize:18, fontWeight:800, color:"#1e293b", lineHeight:1.2}}>Gestión Grupo Mediterra</div>
          </div>
        </div>
        <div style={{display:"flex", gap:8, alignItems:"center", flexWrap:"wrap"}}>
          <div style={{fontSize:11, color:"#64748b", textAlign:"right"}}>
            <div style={{textTransform:"capitalize"}}>{fechaStr}</div>
            <div>Hola, <strong style={{color:"#1e293b"}}>{usuario.nombre.split(" ")[0]}</strong> · {usuario.cargo}</div>
          </div>
          {usuario.rol === "admin" && (
            <button onClick={()=>setMostrarPermisos(true)}
              style={{background:"#f1f5f9", border:"1px solid #e2e8f0", color:"#1e293b", borderRadius:8, padding:"6px 14px", cursor:"pointer", fontSize:12, fontWeight:600}}>
              ⚙️ Permisos
            </button>
          )}
          {!esSoloConsulta(usuario.nombre) &&
            <button onClick={onCambiarPin} style={{background:"#f1f5f9", border:"1px solid #e2e8f0", color:"#1e293b", borderRadius:8, padding:"6px 14px", cursor:"pointer", fontSize:12}}>🔑 PIN</button>
          }
          <button onClick={onLogout} style={{background:"#fee2e2", border:"1px solid #fca5a5", color:"#991b1b", borderRadius:8, padding:"6px 14px", cursor:"pointer", fontSize:12}}>Salir</button>
        </div>
      </div>

      <div style={{textAlign:"center", padding:"40px 24px 28px"}}>
        <div style={{fontSize:13, color:"#94a3b8", letterSpacing:3, textTransform:"uppercase", marginBottom:10}}>Selecciona un módulo</div>
        <h1 style={{margin:0, fontSize:28, fontWeight:900, color:"#1e293b", lineHeight:1.2}}>¿Qué deseas gestionar hoy?</h1>
        {modulosPermitidos.length === 0 && (
          <p style={{color:"#94a3b8", fontSize:14, marginTop:16}}>No tienes módulos asignados. Contacta al administrador.</p>
        )}
      </div>

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
              boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
              transition: "transform 0.15s, box-shadow 0.15s",
              position: "relative",
              overflow: "hidden",
            }}
            onMouseEnter={e => { e.currentTarget.style.transform="translateY(-4px)"; e.currentTarget.style.boxShadow="0 12px 40px rgba(0,0,0,0.25)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform="translateY(0)"; e.currentTarget.style.boxShadow="0 4px 24px rgba(0,0,0,0.15)"; }}
          >
            {modulo.id === "osiris"
              ? <div style={{marginBottom:6}}><OsirisLogoSmall/></div>
              : modulo.id === "finanzas"
              ? <div style={{marginBottom:12}}>
                  <img src="/med.png" alt="Mediterra"
                    style={{height:44,objectFit:"contain",display:"block"}}
                    onError={e=>{e.target.style.display="none";}}/>
                </div>
              : <div style={{fontSize:40, marginBottom:14}}>{modulo.icon}</div>
            }
            {modulo.id !== "osiris" && <div style={{fontSize:17, fontWeight:800, color:"#fff", marginBottom:4}}>{modulo.label}</div>}
            {modulo.id !== "osiris" && <div style={{fontSize:12, color:"rgba(255,255,255,0.65)"}}>{modulo.sublabel}</div>}
            <div style={{position:"absolute", bottom:18, right:18, fontSize:18, color:"rgba(255,255,255,0.4)"}}>→</div>
          </button>
        ))}

        {usuario.rol === "admin" && (
          <div style={{
            background: "#f8fafc",
            border: "2px dashed #e2e8f0",
            borderRadius: 20,
            padding: "32px 36px",
            width: 280,
            textAlign: "left",
            opacity: 0.7,
          }}>
            <div style={{fontSize:40, marginBottom:14}}>➕</div>
            <div style={{fontSize:17, fontWeight:800, color:"#94a3b8", marginBottom:4}}>Nuevo módulo</div>
            <div style={{fontSize:12, color:"#cbd5e1"}}>Próximamente disponible</div>
          </div>
        )}
      </div>

      <div style={{textAlign:"center", marginTop:56, fontSize:10, color:"#cbd5e1", letterSpacing:2}}>
        © {new Date().getFullYear()} GRUPO MEDITERRA · TODOS LOS DERECHOS RESERVADOS
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// APP PRINCIPAL
// ══════════════════════════════════════════════════════════════════════
export default function App(){
  const hoy=new Date();

  const [usuarioActual,setUsuarioActual]=useState(null);
  const [moduloActivo,setModuloActivo]=useState(null);
  const [loginNombre,setLoginNombre]=useState("");
  const [loginPin,setLoginPin]=useState("");
  const [loginError,setLoginError]=useState("");

  // ── Auto-reload on new Vercel deploy ─────────────────────────────
  useEffect(()=>{
    let currentBundle = null;
    async function checkNewDeploy() {
      try {
        const res = await fetch('/', {cache:'no-store'});
        const html = await res.text();
        const match = html.match(/\/static\/js\/main\.[a-f0-9]+\.js/);
        const bundle = match ? match[0] : null;
        if(!bundle) return;
        if(currentBundle === null) { currentBundle = bundle; }
        else if(bundle !== currentBundle) { window.location.reload(); }
      } catch(e) {}
    }
    // Esperar 5s para que la app cargue, luego verificar inmediatamente
    const initialCheck = setTimeout(checkNewDeploy, 5000);
    const interval = setInterval(checkNewDeploy, 10 * 1000); // cada 10 segundos // cada 30 segundos
    return () => { clearTimeout(initialCheck); clearInterval(interval); };
  }, []);
  // ─────────────────────────────────────────────────────────────────
  const [pinsPersonalizados,setPinsPersonalizados]=useState({});
  const [modalPin,setModalPin]=useState(null);
  const [workerPendiente,setWorkerPendiente]=useState(null); // usuario que entró con PIN temporal
  const [resetNombre,setResetNombre]=useState("");
  const [resetEnviando,setResetEnviando]=useState(false);
  const [resetMsg,setResetMsg]=useState("");
  const [pinActual,setPinActual]=useState("");
  const [pinNuevo,setPinNuevo]=useState("");
  const [pinConfirm,setPinConfirm]=useState("");
  const [pinError,setPinError]=useState("");

  const [mes,setMes]=useState(hoy.getMonth());
  const [anio,setAnio]=useState(hoy.getFullYear());
  const semanas=semanasDelMes(anio,mes);

  const [usuarios,setUsuarios]=useState(WORKERS_BASE);
  const [tabUsuarios,setTabUsuarios]=useState("lista");
  const [usuarioEditando,setUsuarioEditando]=useState(null);
  const [formUsuario,setFormUsuario]=useState({nombre:"",cargo:"",email:"",pin:"",rol:"editor",modulos:["tareas"]});
  const [copiarDe,setCopiarDe]=useState("");

  // Usuario activo — siempre usar el más fresco del array, con fallback
  const usuarioFresco = usuarioActual
    ? (usuarios.find(u=>u.nombre===usuarioActual.nombre) || usuarioActual)
    : null;

  // Módulos permitidos — admin tiene todo, resto usa su array
  const modulosDeUsuarioSeguro = (u) => {
    if(!u) return [];
    if(u.rol==="admin") return MODULOS_DISPONIBLES.map(m=>m.id);
    return Array.isArray(u.modulos) ? u.modulos : ["tareas"];
  };

  const WORKERS=usuarios.filter(u=>!u.desactivado);
  const getWorker=(nombre)=>usuarios.find(u=>u.nombre===nombre);
  const getRol=(nombre)=>getWorker(nombre)?.rol||"editor";
  const esAdmin=(nombre)=>getRol(nombre)==="admin";
  const esSoloConsulta=(nombre)=>getRol(nombre)==="consulta";

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
  const [modalVencidas,setModalVencidas]=useState(false);
  const [textoNotif,setTextoNotif]=useState("");
  const [enviandoNotif,setEnviandoNotif]=useState(false);
  const [nuevaTarea,setNuevaTarea]=useState({nombre:"",responsable:"",supervisor:"",categoria:"Finanzas",frecuencia:"Semanal",dependeDe:""});
  const [mostrarFormTarea,setMostrarFormTarea]=useState(false);

  const [osirisData,setOsirisData]=useState({});

  function recKey(id){return `${id}_${mes}_${anio}`;}

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
            const merged=WORKERS_BASE.map(wb=>{
              const saved=d.usuarios.find(u=>u.nombre===wb.nombre);
              if(!saved) return wb;
              return {
                ...saved,
                // Módulos: usar los guardados en Supabase (admin los configura),
                // solo si no hay guardados usar los del código base
                modulos: (saved.modulos && saved.modulos.length > 0)
                  ? saved.modulos
                  : wb.modulos,
                // Rol: respetar lo guardado en Supabase
                rol: saved.rol || wb.rol,
                // Permisos por pestaña: siempre preservar lo guardado
                tab_permisos: saved.tab_permisos || {},
                desactivado: saved.desactivado || false,
              };
            });
            // Usuarios extra agregados desde la app (no están en WORKERS_BASE)
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
            const saved=d.osirisData;
            setOsirisData(prev=>{
              // Solo restaurar registros con ediciones del usuario:
              // agregados manualmente (id no empieza con _xl_) o con campos editados
              function extractUserEdits(savedArr){
                if(!savedArr||savedArr.length===0) return [];
                return savedArr.filter(r=>{
                  const id = String(r.id||'');
                  // Registro agregado manualmente (no viene del Excel)
                  if(!id.includes('_xl_')) return true;
                  // Registro del Excel con ediciones del usuario
                  // pagado puede ser true O false (si el usuario cambió el estado)
                  if(r.pagado===true || r.pagado===false) return true;
                  if(r.nFact && String(r.nFact).trim()!=='') return true;
                  if(r.nOC && String(r.nOC).trim()!=='') return true;
                  if(r.fechaPago && String(r.fechaPago).trim()!=='') return true;
                  if(r.ha && Number(r.ha)>0) return true;
                  return false;
                });
              }
              // Merge: base = _INIT de OsirisModule (que viene en prev via useState)
              // Encima: aplicar ediciones del usuario guardadas en Supabase
              function mergeEdits(base, edits, idField="id"){
                if(!edits||edits.length===0) return base;
                const edited = {};
                edits.forEach(r=>{ edited[r[idField]] = r; });
                // Actualizar registros base con ediciones
                const merged = base.map(r => edited[r[idField]] ? {...r,...edited[r[idField]]} : r);
                // Agregar registros nuevos (agregados manualmente, no están en base)
                const baseIds = new Set(base.map(r=>r[idField]));
                const nuevos = edits.filter(r=>!baseIds.has(r[idField]));
                return [...merged, ...nuevos];
              }
              return{
                ...prev,
                royaltyPlanta:    mergeEdits(prev.royaltyPlanta||[],    extractUserEdits(saved.royaltyPlanta)),
                feeEntrada:       mergeEdits(prev.feeEntrada||[],       extractUserEdits(saved.feeEntrada)),
                royaltyComercial: mergeEdits(prev.royaltyComercial||[], extractUserEdits(saved.royaltyComercial)),
                feeViveros:       mergeEdits(prev.feeViveros||[],       extractUserEdits(saved.feeViveros)),
                totalPedidos:     mergeEdits(prev.totalPedidos||[],     extractUserEdits(saved.totalPedidos)),
                contratos: saved.contratos||prev.contratos||[],
              };
            });
          }
          if(d.mes!==undefined)setMes(d.mes);
          if(d.anio!==undefined)setAnio(d.anio);
        }
      }catch(e){console.error("Error cargando:",e);}
      setCargando(false);
      // Restaurar sesión después de un reload automático
      const savedNombre = sessionStorage.getItem('mediterra_usuario');
      if(savedNombre) {
        // Se restaura en el useEffect que observa [usuarios, cargando] abajo
      }
    }
    cargar();

    // ── Supabase Realtime — sincronización instantánea entre usuarios ──
    // Escucha cambios en id:"main" → actualiza Tareas y Osiris en tiempo real
    const SUPA_WS = `wss://${SUPA_URL.replace('https://','')}/realtime/v1/websocket?apikey=${SUPA_KEY}&vsn=1.0.0`;
    const TOPIC_MAIN = "realtime:public:calendario_data";
    const ws = new WebSocket(SUPA_WS);
    const REF = () => String(Date.now());

    ws.onopen = () => {
      ws.send(JSON.stringify({
        topic: TOPIC_MAIN, event: "phx_join",
        payload: { config: { broadcast:{ack:false,self:false}, presence:{key:""} } },
        ref: REF()
      }));
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if(msg.topic === TOPIC_MAIN && (msg.event === "INSERT" || msg.event === "UPDATE")) {
          const record = msg.payload?.record;
          if(record?.id === "main" && record?.value) {
            try {
              const d = typeof record.value === "string" ? JSON.parse(record.value) : record.value;
              // Aplicar solo si el cambio viene de otro usuario (evitar loop)
              if(d.estados)       setEstados(prev=>({...prev,...d.estados}));
              if(d.comentarios)   setComentarios(d.comentarios);
              if(d.tareasConfig)  setTareasConfig(prev=>({...prev,...d.tareasConfig}));
              if(d.supervisores)  setSupervisores(prev=>({...prev,...d.supervisores}));
              if(d.tareasExtra)   setTareasExtra(d.tareasExtra);
              if(d.pinsPersonalizados) setPinsPersonalizados(d.pinsPersonalizados);
              if(d.recsDone)      setRecsDone(d.recsDone);
              if(d.recsComentarios) setRecsComentarios(d.recsComentarios);
              if(d.osirisData)    setOsirisData(prev=>({...prev,...d.osirisData}));
            } catch(err) {}
          }
        }
      } catch(err) {}
    };

    const hbMain = setInterval(()=>{
      if(ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({topic:"phoenix",event:"heartbeat",payload:{},ref:REF()}));
    }, 30000);

    return () => { clearInterval(hbMain); if(ws.readyState===WebSocket.OPEN) ws.close(); };
  },[]); // eslint-disable-line

  // ── Restaurar sesión tras recarga automática ─────────────────────
  useEffect(()=>{
    if(cargando) return; // esperar a que carguen los usuarios
    if(usuarioActual) return; // ya hay sesión activa
    const savedNombre = sessionStorage.getItem('mediterra_usuario');
    if(savedNombre) {
      const worker = usuarios.find(u=>u.nombre===savedNombre);
      if(worker && !worker.desactivado) {
        setUsuarioActual(worker);
        // Restaurar el módulo donde estaba
        const savedModulo = sessionStorage.getItem('mediterra_modulo');
        if(savedModulo) setModuloActivo(savedModulo);
      } else {
        sessionStorage.removeItem('mediterra_usuario');
        sessionStorage.removeItem('mediterra_modulo');
      }
    }
  },[cargando, usuarios]); // eslint-disable-line

  // Limpiar sesión al hacer logout manual
  // (el logout llama setUsuarioActual(null) — interceptamos eso)

  // Refs para siempre tener valores frescos en guardado
  const estadosRef       = useRef(estados);
  const comentariosRef   = useRef(comentarios);
  const tareasConfigRef  = useRef(tareasConfig);
  const supervisoresRef  = useRef(supervisores);
  const tareasExtraRef   = useRef(tareasExtra);
  const pinsRef          = useRef(pinsPersonalizados);
  const recsDoneRef      = useRef(recsDone);
  const recsComRef       = useRef(recsComentarios);
  const usuariosRef      = useRef(usuarios);
  const mesRef           = useRef(mes);
  const anioRef          = useRef(anio);
  const osirisDataRef    = useRef(osirisData);
  useEffect(()=>{ estadosRef.current      = estados;        },[estados]);
  useEffect(()=>{ comentariosRef.current  = comentarios;    },[comentarios]);
  useEffect(()=>{ tareasConfigRef.current = tareasConfig;   },[tareasConfig]);
  useEffect(()=>{ supervisoresRef.current = supervisores;   },[supervisores]);
  useEffect(()=>{ tareasExtraRef.current  = tareasExtra;    },[tareasExtra]);
  useEffect(()=>{ pinsRef.current         = pinsPersonalizados; },[pinsPersonalizados]);
  useEffect(()=>{ recsDoneRef.current     = recsDone;       },[recsDone]);
  useEffect(()=>{ recsComRef.current      = recsComentarios;},[recsComentarios]);
  useEffect(()=>{ usuariosRef.current     = usuarios;       },[usuarios]);
  useEffect(()=>{ mesRef.current          = mes;            },[mes]);
  useEffect(()=>{ anioRef.current         = anio;           },[anio]);
  useEffect(()=>{ osirisDataRef.current   = osirisData;     },[osirisData]);

  // Guardar siempre con los valores más recientes (sin stale closure)
  const guardarAhora = useCallback(()=>{
    setGuardado("guardando");
    dbSave({
      estados:      estadosRef.current,
      comentarios:  comentariosRef.current,
      tareasConfig: tareasConfigRef.current,
      supervisores: supervisoresRef.current,
      tareasExtra:  tareasExtraRef.current,
      pinsPersonalizados: pinsRef.current,
      recsDone:     recsDoneRef.current,
      recsComentarios: recsComRef.current,
      usuarios:     usuariosRef.current,
      mes:          mesRef.current,
      anio:         anioRef.current,
      osirisData:   osirisDataRef.current,
    })
    .then(()=>{setGuardado("ok");setTimeout(()=>setGuardado("idle"),2000);})
    .catch(()=>{setGuardado("error");setTimeout(()=>setGuardado("idle"),3000);});
  },[]); // eslint-disable-line

  const guardar=useCallback((est,com,tc,sup,te,pins,rd,rc,usrs,m,a,od)=>{
    setGuardado("guardando");
    dbSave({estados:est,comentarios:com,tareasConfig:tc,supervisores:sup,tareasExtra:te,
      pinsPersonalizados:pins,recsDone:rd,recsComentarios:rc,usuarios:usrs,mes:m,anio:a,osirisData:od})
      .then(()=>{setGuardado("ok");setTimeout(()=>setGuardado("idle"),2000);})
      .catch(()=>{setGuardado("error");setTimeout(()=>setGuardado("idle"),3000);});
  },[]);

  // Auto-guardado general (debounce 800ms)
  useEffect(()=>{
    if(cargando)return;
    const t=setTimeout(()=>guardar(estados,comentarios,tareasConfig,supervisores,tareasExtra,pinsPersonalizados,recsDone,recsComentarios,usuarios,mes,anio,osirisData),800);
    return()=>clearTimeout(t);
  },[estados,comentarios,tareasConfig,supervisores,tareasExtra,pinsPersonalizados,recsDone,recsComentarios,usuarios,mes,anio,osirisData,cargando,guardar]);

  // Guardado inmediato al cambiar usuarios (permisos, roles, activar/desactivar)
  useEffect(()=>{
    if(cargando) return;
    // Guardar de inmediato con los valores más frescos
    const t=setTimeout(()=>guardarAhora(), 300);
    return()=>clearTimeout(t);
  },[usuarios,cargando]); // eslint-disable-line

  function getPinActivo(w){return pinsPersonalizados[w.nombre]||w.pin;}

  function handleLogin(){
    const w=WORKERS.find(x=>x.nombre===loginNombre);
    if(!w){setLoginError("Selecciona tu nombre.");return;}
    const pinOk=getPinActivo(w);
    const pinTemp=pinsPersonalizados[w.nombre+"_temp"];
    const esTemp=pinTemp&&loginPin.trim()===pinTemp;
    const esOk=loginPin.trim()===pinOk;
    if(esOk||esTemp){
      setLoginError("");
      if(esTemp&&!esOk){
        // PIN temporal: guardar worker pendiente y mostrar cambio PIN ANTES de entrar
        setWorkerPendiente(w);
        setModalPin("cambiar");
      } else {
        // PIN normal: entrar directo
        setUsuarioActual(w);
      sessionStorage.setItem('mediterra_usuario', w.nombre);
      }
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

  async function handleCambiarPin(){
    setPinError("");
    // Puede venir de login con PIN temporal (workerPendiente) o desde perfil (usuarioActual)
    const worker = workerPendiente || usuarioActual;
    if(!worker) return;
    const po=getPinActivo(worker);
    const pinTemp=pinsPersonalizados[worker.nombre+"_temp"];
    // Validar contra PIN temporal (flujo reset) o PIN normal (flujo cambio desde perfil)
    const pinActualValido=pinActual===po||(pinTemp&&pinActual===pinTemp);
    if(!pinActualValido){setPinError("PIN actual incorrecto.");return;}
    if(pinNuevo.length<4){setPinError("Minimo 4 digitos.");return;}
    if(pinNuevo!==pinConfirm){setPinError("Los PINs no coinciden.");return;}
    const nuevosPins={...pinsPersonalizados,[worker.nombre]:pinNuevo};
    delete nuevosPins[worker.nombre+"_temp"];
    setPinsPersonalizados(nuevosPins);
    // Esperar confirmación de guardado antes de continuar
    try {
      await dbSave({estados,comentarios,tareasConfig,supervisores,tareasExtra,
        pinsPersonalizados:nuevosPins,recsDone,recsComentarios,usuarios,mes,anio,osirisData});
      setPinActual("");setPinNuevo("");setPinConfirm("");setModalPin(null);
      // Si venía de login con temporal, ahora sí entrar a la app
      if(workerPendiente){
        setUsuarioActual(workerPendiente);
        sessionStorage.setItem('mediterra_usuario', workerPendiente.nombre);
        setWorkerPendiente(null);
      }
      alert("PIN cambiado exitosamente!");
    } catch {
      setPinError("Error al guardar. Intenta de nuevo.");
    }
  }

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
        if(w)await enviarNotificacion(w.email,w.nombre,`Tarea desbloqueada: ${dep.nombre}`,
          `Hola ${w.nombre.split(" ")[0]},

"${modalNotif.tarea.nombre}" fue completada.
Ahora puedes iniciar: "${dep.nombre}"

${textoNotif?`Nota: ${textoNotif}

`:""}https://gestion-grupo-mediterra.vercel.app

Saludos,
Equipo Mediterra`);
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

  // ── RENDER PRINCIPAL ──────────────────────────────────────────────
  if(cargando) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"sans-serif",color:"#64748b",fontSize:15}}>
      Cargando...
    </div>
  );

  if(!usuarioActual||workerPendiente) return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#0f172a,#1e3a5f)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"sans-serif",padding:20}}>
      <div style={{background:"#fff",borderRadius:20,padding:"36px 40px",maxWidth:420,width:"100%",boxShadow:"0 24px 64px rgba(0,0,0,0.5)"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <img src="/med.png" alt="Mediterra" style={{height:56,objectFit:"contain",marginBottom:12}} onError={e=>{e.target.style.display="none";}}/>
          <div style={{fontSize:11,letterSpacing:3,color:"#94a3b8",marginBottom:4}}>GRUPO MEDITERRA</div>
          <div style={{fontSize:20,fontWeight:900,color:"#1e293b"}}>Gestión Interna</div>
        </div>

        {modalPin==="cambiar"&&(
          <div style={{background:"#fefce8",borderRadius:12,padding:"14px 16px",marginBottom:16,border:"1px solid #fde047",fontSize:13,color:"#854d0e"}}>
            🔑 Debes cambiar tu PIN temporal antes de continuar.
          </div>
        )}

        {modalPin==="cambiar"?(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:4}}>Cambiar PIN</div>
            {[["PIN actual","password",pinActual,setPinActual],["PIN nuevo (mín. 4 dígitos)","password",pinNuevo,setPinNuevo],["Confirmar PIN nuevo","password",pinConfirm,setPinConfirm]].map(([lbl,type,val,set])=>(
              <div key={lbl}>
                <div style={{fontSize:11,color:"#64748b",marginBottom:3}}>{lbl}</div>
                <input type={type} value={val} onChange={e=>set(e.target.value)} placeholder="••••"
                  style={{width:"100%",padding:"9px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:14,boxSizing:"border-box",outline:"none"}}/>
              </div>
            ))}
            {pinError&&<div style={{color:"#ef4444",fontSize:12}}>{pinError}</div>}
            <button onClick={handleCambiarPin}
              style={{padding:"10px",borderRadius:8,background:"#2563eb",color:"#fff",border:"none",fontWeight:700,fontSize:14,cursor:"pointer",marginTop:4}}>
              Guardar nuevo PIN
            </button>
          </div>
        ):(
          <>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:"#64748b",marginBottom:4}}>Selecciona tu nombre</div>
              <select value={loginNombre} onChange={e=>setLoginNombre(e.target.value)}
                style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,background:"#fff",outline:"none"}}>
                <option value="">— Seleccionar —</option>
                {WORKERS.map(w=><option key={w.nombre} value={w.nombre}>{w.nombre} · {w.cargo}</option>)}
              </select>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,color:"#64748b",marginBottom:4}}>PIN de acceso</div>
              <input type="password" value={loginPin} onChange={e=>setLoginPin(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="••••"
                style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:16,letterSpacing:4,textAlign:"center",outline:"none",boxSizing:"border-box"}}/>
            </div>
            {loginError&&<div style={{color:"#ef4444",fontSize:12,marginBottom:10,textAlign:"center"}}>{loginError}</div>}
            <button onClick={handleLogin}
              style={{width:"100%",padding:"11px",borderRadius:8,background:"linear-gradient(135deg,#1e3a5f,#2563eb)",color:"#fff",border:"none",fontWeight:700,fontSize:15,cursor:"pointer"}}>
              Ingresar
            </button>

            <div style={{marginTop:16,textAlign:"center"}}>
              <button onClick={()=>setModalPin("reset")} style={{background:"none",border:"none",color:"#94a3b8",fontSize:12,cursor:"pointer",textDecoration:"underline"}}>
                ¿Olvidaste tu PIN?
              </button>
            </div>

            {modalPin==="reset"&&(
              <div style={{marginTop:16,background:"#f8fafc",borderRadius:10,padding:"14px 16px",border:"1px solid #e2e8f0"}}>
                <div style={{fontSize:12,fontWeight:700,color:"#1e293b",marginBottom:8}}>Recuperar PIN por email</div>
                {/* Si ya seleccionó su nombre arriba, usarlo directo. Si no, mostrar selector */}
                {loginNombre
                  ? (<div style={{padding:"8px 12px",background:"#f1f5f9",borderRadius:8,fontSize:13,color:"#1e293b",fontWeight:600,marginBottom:8}}>
                      👤 {loginNombre}
                    </div>)
                  : (<select value={resetNombre} onChange={e=>setResetNombre(e.target.value)}
                      style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:12,marginBottom:8,outline:"none"}}>
                      <option value="">— Selecciona tu nombre —</option>
                      {WORKERS.map(w=><option key={w.nombre} value={w.nombre}>{w.nombre}</option>)}
                    </select>)
                }
                <button onClick={()=>{ if(loginNombre) setResetNombre(loginNombre); handleResetPin(); }}
                  disabled={resetEnviando||(!loginNombre&&!resetNombre)}
                  style={{width:"100%",padding:"8px",borderRadius:8,
                    background:(resetEnviando||(!loginNombre&&!resetNombre))?"#94a3b8":"#2563eb",
                    color:"#fff",border:"none",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                  {resetEnviando?"Enviando...":"Enviar PIN temporal"}
                </button>
                {resetMsg&&<div style={{fontSize:11,color:"#64748b",marginTop:6,textAlign:"center"}}>{resetMsg}</div>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  // Calcular permisos de pestaña para el usuario actual en Finanzas
  const tabPermisosFinanzas = getTabPermisosModulo(usuarioFresco, "finanzas");

  // Módulo activo
  if(moduloActivo==="finanzas") return (
    <div style={{fontFamily:"sans-serif",background:"#0d1117",minHeight:"100vh",padding:"20px"}}>
      <FinanzasModule
        usuarioActual={usuarioFresco}
        esAdmin={esAdmin}
        esSoloConsulta={esSoloConsulta}
        tabPermisos={tabPermisosFinanzas}
        onBack={()=>setModuloActivo(null)}
        onLogout={()=>{setUsuarioActual(null);setModuloActivo(null);sessionStorage.removeItem('mediterra_usuario');sessionStorage.removeItem('mediterra_modulo');}}
      />
    </div>
  );

  if(moduloActivo==="osiris") return (
    <div style={{fontFamily:"sans-serif",background:"#0d1117",minHeight:"100vh"}}>
      <OsirisModule
        usuarioActual={usuarioFresco}
        esAdmin={esAdmin}
        esSoloConsulta={esSoloConsulta}
        tabPermisos={getTabPermisosModulo(usuarioFresco,"osiris")}
        onBack={()=>setModuloActivo(null)}
        onLogout={()=>{setUsuarioActual(null);setModuloActivo(null);sessionStorage.removeItem('mediterra_usuario');sessionStorage.removeItem('mediterra_modulo');}}
        osirisData={osirisData}
        setOsirisData={setOsirisData}
      />
    </div>
  );

  if(moduloActivo==="tareas") {
    const modulosPermitidos = modulosDeUsuarioSeguro(usuarioFresco);
    const tabPermTareas = getTabPermisosModulo(usuarioFresco, "tareas");
    const puedeVerSemanal  = getTabPerm(usuarioFresco,"tareas","semanal")  !== "sin_acceso";
    const puedeVerMensual  = getTabPerm(usuarioFresco,"tareas","mensual")  !== "sin_acceso";
    const puedeVerConfig   = getTabPerm(usuarioFresco,"tareas","config")   !== "sin_acceso";
    const puedeEditSemanal = getTabPerm(usuarioFresco,"tareas","semanal")  === "editar";
    const puedeEditMensual = getTabPerm(usuarioFresco,"tareas","mensual")  === "editar";
    const puedeEditConfig  = getTabPerm(usuarioFresco,"tareas","config")   === "editar";

    return (
      <div style={{fontFamily:"sans-serif",background:"#f1f5f9",minHeight:"100vh"}}>
        {/* Modal editar comentario */}
        {editComentario&&(
          <div style={{position:"fixed",inset:0,background:"#0006",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{background:"#fff",borderRadius:12,padding:24,width:380,boxShadow:"0 8px 32px #0003"}}>
              <div style={{fontWeight:700,fontSize:15,marginBottom:10}}>Comentario</div>
              <textarea value={textoComentario} onChange={e=>setTextoComentario(e.target.value)}
                style={{width:"100%",height:80,borderRadius:8,border:"1px solid #d1d5db",padding:8,fontSize:13,resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
              <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:10}}>
                <button onClick={()=>setEditComentario(null)} style={{padding:"6px 16px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:13}}>Cancelar</button>
                <button onClick={guardarComentario} style={{padding:"6px 16px",borderRadius:8,background:"#2563eb",color:"#fff",border:"none",cursor:"pointer",fontWeight:700,fontSize:13}}>Guardar</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal tareas vencidas */}
      {modalVencidas&&(()=>{
        const vencidas=[];
        todasTareas().filter(t=>!isBloqueada(t.id)).forEach(t=>{
          if(getFrecuencia(t.id)==="Mensual"){
            if(estaVencida(t,t.id,null)) vencidas.push({tarea:t,semana:null,key:t.id});
          } else {
            semanas.forEach(s=>{
              if(estaVencida(t,`${t.id}_s${s.num}`,s.num))
                vencidas.push({tarea:t,semana:s,key:`${t.id}_s${s.num}`});
            });
          }
        });
        return (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:300,
            display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
            <div style={{background:"#1e293b",border:"1px solid #ef444444",borderRadius:16,
              width:520,maxWidth:"95vw",maxHeight:"80vh",display:"flex",flexDirection:"column",
              boxShadow:"0 24px 64px rgba(0,0,0,0.7)"}}>
              <div style={{padding:"16px 20px",borderBottom:"1px solid #334155",
                display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:22}}>⚠️</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:800,color:"#f87171"}}>
                    Tareas Vencidas — {vencidas.length}
                  </div>
                  <div style={{fontSize:11,color:"#94a3b8"}}>{MESES[mes]} {anio}</div>
                </div>
                <button onClick={()=>setModalVencidas(false)}
                  style={{background:"transparent",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:20}}>×</button>
              </div>
              <div style={{overflowY:"auto",padding:"12px 20px",display:"flex",flexDirection:"column",gap:8}}>
                {vencidas.length===0&&(
                  <div style={{textAlign:"center",padding:32,color:"#94a3b8"}}>Sin tareas vencidas ✓</div>
                )}
                {vencidas.map(({tarea,semana,key},i)=>{
                  const est=estados[key];
                  const resp=est?.estadoResp||"gris";
                  const sup2=est?.estadoSup||"gris";
                  const col={"rojo":"#ef4444","amarillo":"#f59e0b","verde":"#22c55e","gris":"#64748b"};
                  return (
                    <div key={i} style={{background:"#0f172a",borderRadius:10,padding:"10px 14px",
                      border:"1px solid #ef444433"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                        <span style={{width:8,height:8,borderRadius:"50%",background:"#ef4444",flexShrink:0}}/>
                        <span style={{fontSize:13,fontWeight:700,color:"#f1f5f9",flex:1}}>{tarea.nombre}</span>
                        {semana&&<span style={{fontSize:10,color:"#94a3b8",background:"#1e293b",borderRadius:6,padding:"1px 6px"}}>S{semana.num}</span>}
                      </div>
                      <div style={{display:"flex",gap:12,paddingLeft:16,fontSize:11,color:"#94a3b8",flexWrap:"wrap"}}>
                        <span>👤 {tarea.responsable}</span>
                        {getSupervisor(tarea.id)&&<span>🔍 {getSupervisor(tarea.id)}</span>}
                        <span style={{marginLeft:"auto",display:"flex",gap:6}}>
                          <span style={{color:col[resp]}}>● Resp: {resp}</span>
                          {getSupervisor(tarea.id)&&<span style={{color:col[sup2]}}>● Sup: {sup2}</span>}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{padding:"12px 20px",borderTop:"1px solid #334155",display:"flex",justifyContent:"flex-end"}}>
                <button onClick={()=>setModalVencidas(false)}
                  style={{padding:"8px 20px",borderRadius:8,background:"#334155",
                    border:"none",color:"#f1f5f9",cursor:"pointer",fontSize:12,fontWeight:600}}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal notificación dependencia */}
        {modalNotif&&(
          <div style={{position:"fixed",inset:0,background:"#0006",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
            <div style={{background:"#fff",borderRadius:16,padding:24,maxWidth:420,width:"100%",boxShadow:"0 8px 32px #0003"}}>
              <div style={{fontWeight:800,fontSize:15,color:"#1e293b",marginBottom:8}}>
                ✅ Tarea completada: "{modalNotif.tarea.nombre}"
              </div>
              <div style={{fontSize:13,color:"#64748b",marginBottom:12}}>
                Las siguientes tareas han sido desbloqueadas:
              </div>
              {modalNotif.dependientes.map(d=>(
                <div key={d.id} style={{background:"#f0fdf4",borderRadius:8,padding:"8px 12px",border:"1px solid #86efac",marginBottom:6,fontSize:13,color:"#166534",fontWeight:600}}>
                  🔓 {d.nombre}
                </div>
              ))}
              <textarea value={textoNotif} onChange={e=>setTextoNotif(e.target.value)} placeholder="Nota adicional (opcional)..."
                style={{width:"100%",height:60,borderRadius:8,border:"1px solid #d1d5db",padding:8,fontSize:12,marginTop:8,resize:"none",outline:"none",boxSizing:"border-box"}}/>
              <div style={{display:"flex",gap:8,marginTop:12,justifyContent:"flex-end"}}>
                <button onClick={()=>setModalNotif(null)} style={{padding:"7px 16px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:13}}>
                  Cerrar sin notificar
                </button>
                <button onClick={enviarNotifDependencia} disabled={enviandoNotif}
                  style={{padding:"7px 16px",borderRadius:8,background:enviandoNotif?"#94a3b8":"#2563eb",color:"#fff",border:"none",cursor:"pointer",fontWeight:700,fontSize:13}}>
                  {enviandoNotif?"Enviando...":"📧 Notificar"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header módulo Tareas */}
        <div style={{background:"#1e3a5f",padding:"14px 24px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <button onClick={()=>setModuloActivo(null)} style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",color:"#fff",borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:12}}>← Hub</button>
            <img src="/med.png" alt="" style={{height:28,objectFit:"contain"}} onError={e=>{e.target.style.display="none";}}/>
            <div>
              <div style={{fontSize:13,fontWeight:900,color:"#fff"}}>Seguimiento de Tareas</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.5)"}}>{MESES[mes]} {anio}</div>
            </div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            {estadoGuardadoUI&&<span style={{fontSize:11,color:"rgba(255,255,255,0.7)"}}>{estadoGuardadoUI.icon} {estadoGuardadoUI.text}</span>}
            {totalVencidas>0&&<button onClick={()=>setModalVencidas(true)} style={{background:"#ef4444",color:"#fff",borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:700,border:"none",cursor:"pointer"}}>⚠ {totalVencidas} vencidas</button>}
            <button onClick={()=>setTab(tab==="semanal"?"mensual":"semanal")} style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",color:"#fff",borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:12}}>
              {tab==="semanal"?"📆 Ver Mensual":"📅 Ver Semanal"}
            </button>
            <button onClick={()=>{setUsuarioActual(null);setModuloActivo(null);sessionStorage.removeItem('mediterra_usuario');sessionStorage.removeItem('mediterra_modulo');}} style={{background:"rgba(248,113,113,0.2)",border:"none",color:"#fca5a5",borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:12}}>Salir</button>
          </div>
        </div>

        {/* Controles */}
        <div style={{background:"#fff",borderBottom:"1px solid #e2e8f0",padding:"10px 24px",display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <button onClick={()=>setMes(m=>{const nm=m===0?11:m-1;if(nm===11)setAnio(a=>a-1);return nm;})}
              style={{padding:"5px 10px",borderRadius:6,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:13}}>‹</button>
            <span style={{fontWeight:700,fontSize:14,minWidth:120,textAlign:"center"}}>{MESES[mes]} {anio}</span>
            <button onClick={()=>setMes(m=>{const nm=m===11?0:m+1;if(nm===0)setAnio(a=>a+1);return nm;})}
              style={{padding:"5px 10px",borderRadius:6,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:13}}>›</button>
          </div>
          <select value={filtroPersona} onChange={e=>setFiltroPersona(e.target.value)}
            style={{padding:"6px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:12,outline:"none"}}>
            <option value="">Todas las personas</option>
            {WORKERS.map(w=><option key={w.nombre} value={w.nombre}>{w.nombre.split(" ")[0]}</option>)}
          </select>
          {recsActivos.length>0&&(
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {recsActivos.map(r=>(
                <button key={r.id} onClick={()=>{setModalEmail({...r,workerNombre:usuarioActual.nombre,workerEmail:usuarioActual.email});}}
                  style={{background:"#fef3c7",border:"1px solid #fde68a",borderRadius:8,padding:"4px 10px",fontSize:11,cursor:"pointer",color:"#92400e",fontWeight:600}}>
                  📬 {r.titulo}
                </button>
              ))}
            </div>
          )}
          {esAdmin(usuarioActual.nombre)&&puedeEditConfig&&(
            <button onClick={()=>setMostrarFormTarea(v=>!v)}
              style={{marginLeft:"auto",padding:"6px 14px",borderRadius:8,background:mostrarFormTarea?"#1e3a5f":"#f1f5f9",color:mostrarFormTarea?"#fff":"#1e293b",border:"1px solid #d1d5db",cursor:"pointer",fontSize:12,fontWeight:600}}>
              {mostrarFormTarea?"✕ Cancelar":"+ Nueva Tarea"}
            </button>
          )}
        </div>

        {/* Modal email recordatorio */}
        {modalEmail&&(
          <div style={{position:"fixed",inset:0,background:"#0007",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
            <div style={{background:"#fff",borderRadius:16,padding:24,maxWidth:460,width:"100%",boxShadow:"0 8px 32px #0004"}}>
              <div style={{fontWeight:800,fontSize:15,marginBottom:4}}>📬 {modalEmail.titulo}</div>
              <div style={{fontSize:12,color:"#64748b",marginBottom:14}}>Vence el {modalEmail.fechaVence?.toLocaleDateString("es-CL")}</div>
              {modalEmail.destinatarios.map(nombre=>{
                const w=WORKERS.find(x=>x.nombre===nombre);if(!w)return null;
                return(
                  <div key={nombre} style={{background:"#f8fafc",borderRadius:8,padding:"8px 12px",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:13,fontWeight:600}}>{nombre}</span>
                    <button onClick={()=>enviarEmailPersona(w,[{...modalEmail}])}
                      style={{background:"#2563eb",color:"#fff",border:"none",borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:12,fontWeight:600}}>
                      📧 Enviar
                    </button>
                  </div>
                );
              })}
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                {recsActivos.map(r=>(
                  <button key={r.id} onClick={()=>{setRecsDone(p=>({...p,[recKey(r.id)]:true}));}}
                    style={{background:"#dcfce7",border:"none",borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:11,color:"#166534",fontWeight:600}}>
                    ✓ Marcar {r.titulo} como enviado
                  </button>
                ))}
              </div>
              <button onClick={()=>setModalEmail(null)} style={{padding:"7px 20px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:13}}>Cerrar</button>
            </div>
          </div>
        )}

        {/* Formulario nueva tarea */}
        {mostrarFormTarea&&puedeEditConfig&&(
          <div style={{background:"#fff",borderBottom:"1px solid #e2e8f0",padding:"14px 24px"}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:10}}>Nueva Tarea</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {[["Nombre","nombre","text",nuevaTarea.nombre],["Responsable","responsable","",nuevaTarea.responsable],["Supervisor","supervisor","",nuevaTarea.supervisor],["Depende de ID","dependeDe","text",nuevaTarea.dependeDe]].map(([lbl,field,type,val])=>(
                field==="responsable"||field==="supervisor"?(
                  <div key={field}>
                    <div style={{fontSize:10,color:"#64748b",marginBottom:2}}>{lbl}</div>
                    <select value={val} onChange={e=>setNuevaTarea(p=>({...p,[field]:e.target.value}))}
                      style={{padding:"6px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:12,outline:"none"}}>
                      <option value="">— {lbl} —</option>
                      {WORKERS.map(w=><option key={w.nombre} value={w.nombre}>{w.nombre.split(" ")[0]}</option>)}
                    </select>
                  </div>
                ):(
                  <div key={field}>
                    <div style={{fontSize:10,color:"#64748b",marginBottom:2}}>{lbl}</div>
                    <input type={type||"text"} value={val} onChange={e=>setNuevaTarea(p=>({...p,[field]:e.target.value}))}
                      style={{padding:"6px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:12,outline:"none",width:field==="nombre"?220:100}}/>
                  </div>
                )
              ))}
              <div>
                <div style={{fontSize:10,color:"#64748b",marginBottom:2}}>Categoría</div>
                <select value={nuevaTarea.categoria} onChange={e=>setNuevaTarea(p=>({...p,categoria:e.target.value}))}
                  style={{padding:"6px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:12,outline:"none"}}>
                  {Object.keys(CATEGORIAS).map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <div style={{fontSize:10,color:"#64748b",marginBottom:2}}>Frecuencia</div>
                <select value={nuevaTarea.frecuencia} onChange={e=>setNuevaTarea(p=>({...p,frecuencia:e.target.value}))}
                  style={{padding:"6px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:12,outline:"none"}}>
                  {FRECUENCIAS.map(f=><option key={f}>{f}</option>)}
                </select>
              </div>
              <div style={{alignSelf:"flex-end"}}>
                <button onClick={agregarTarea} style={{padding:"7px 18px",borderRadius:8,background:"#2563eb",color:"#fff",border:"none",cursor:"pointer",fontWeight:700,fontSize:13}}>
                  + Agregar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Contenido Tareas */}
        <div style={{padding:"16px 24px"}}>
          {tab==="semanal"&&puedeVerSemanal&&(
            <div>
              {/* Selector semana */}
              <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
                <span style={{fontSize:12,color:"#64748b",fontWeight:600}}>Semana:</span>
                {semanas.map(s=>(
                  <button key={s.num} onClick={()=>setSemanaActiva(s.num)}
                    style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${semanaActiva===s.num?"#2563eb":"#d1d5db"}`,
                      background:semanaActiva===s.num?"#dbeafe":"#fff",color:semanaActiva===s.num?"#1d4ed8":"#374151",
                      cursor:"pointer",fontSize:12,fontWeight:600}}>
                    S{s.num} (ISO {s.iso})
                  </button>
                ))}
              </div>
              {semanas.filter(s=>s.num===semanaActiva).map(s=>(
                <div key={s.num}>
                  <div style={{fontSize:12,color:"#64748b",marginBottom:8}}>
                    Semana del {s.inicioSem.toLocaleDateString("es-CL")} al {new Date(s.inicioSem.getTime()+6*86400000).toLocaleDateString("es-CL")}
                  </div>
                  <div style={{overflowX:"auto",borderRadius:12,boxShadow:"0 1px 4px #0001"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",background:"#fff"}}>
                      {encabezadoTabla}
                      <tbody>
                        <TablaFilas
                          tareas={todasTareas().filter(t=>getFrecuencia(t.id)==="Semanal")}
                          getKey={t=>`${t.id}_s${s.num}`}
                          getSemana={()=>s.num}
                        />
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab==="mensual"&&puedeVerMensual&&(
            <div style={{overflowX:"auto",borderRadius:12,boxShadow:"0 1px 4px #0001"}}>
              <table style={{width:"100%",borderCollapse:"collapse",background:"#fff"}}>
                {encabezadoTabla}
                <tbody>
                  <TablaFilas
                    tareas={todasTareas().filter(t=>getFrecuencia(t.id)==="Mensual")}
                    getKey={t=>t.id}
                    getSemana={()=>null}
                  />
                </tbody>
              </table>
            </div>
          )}

          {!puedeVerSemanal&&tab==="semanal"&&(
            <div style={{textAlign:"center",padding:40,color:"#94a3b8",fontSize:14}}>🚫 No tienes acceso a la vista semanal.</div>
          )}
          {!puedeVerMensual&&tab==="mensual"&&(
            <div style={{textAlign:"center",padding:40,color:"#94a3b8",fontSize:14}}>🚫 No tienes acceso a la vista mensual.</div>
          )}
        </div>
      </div>
    );
  }

  // Hub principal
  const modulosPermitidos = modulosDeUsuarioSeguro(usuarioFresco || usuarioActual);

  return (
    <HubScreen
      usuario={usuarioFresco || usuarioActual}
      modulosPermitidos={modulosPermitidos}
      onSelectModulo={id=>{setModuloActivo(id);sessionStorage.setItem('mediterra_modulo',id);}}
      onLogout={()=>{setUsuarioActual(null);sessionStorage.removeItem('mediterra_usuario');sessionStorage.removeItem('mediterra_modulo');}}
      onCambiarPin={()=>setModalPin("cambiar")}
      esSoloConsulta={esSoloConsulta}
      usuarios={usuarios}
      setUsuarios={setUsuarios}
    />
  );
}
