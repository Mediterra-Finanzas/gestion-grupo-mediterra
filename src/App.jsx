/* eslint-disable */
import React, { useState, useEffect, useCallback, useRef } from "react";
import OsirisModule from "./OsirisModule.jsx";
import FinanzasModule from "./FinanzasModule.jsx";
import AllegriaModule from "./AllegriaModule.jsx";
const ALLEGRIA_LOGO_B64 = "data:image/jpeg;base64,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AAAAAAAAAAAAAAAKZy5gpnLAuYABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAApnLmCmcsDs3Cjz26c+aaL2I4Uee3TnzTRexAKHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYjhR57dOfNNF7EABwo89unPmmi9iOFHnt05800XsQAHCjz26c+aaL2I4Uee3TnzTRexAAcKPPbpz5povYnGQAP//Z";

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

// ═══════════════════════════════════════════════════════════════════
// SISTEMA DE AUDITORÍA — Registra acciones de usuarios
// Retención: 24 meses · Acceso: solo admin
// ═══════════════════════════════════════════════════════════════════
const AUDIT_RETENCION_MESES = 24;

async function auditLoad() {
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/calendario_data?id=eq.audit_log&select=value`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
    });
    const data = await res.json();
    const eventos = data?.[0]?.value?.eventos || [];
    // Filtrar eventos más antiguos que AUDIT_RETENCION_MESES
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - AUDIT_RETENCION_MESES);
    return eventos.filter(e => new Date(e.timestamp) >= cutoff);
  } catch { return []; }
}

async function auditSave(eventos) {
  try {
    // Aplicar retención también al guardar
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - AUDIT_RETENCION_MESES);
    const limpios = eventos.filter(e => new Date(e.timestamp) >= cutoff);
    await fetch(`${SUPA_URL}/rest/v1/calendario_data`, {
      method: "POST",
      headers: {
        apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`,
        "Content-Type": "application/json", Prefer: "resolution=merge-duplicates"
      },
      body: JSON.stringify({ id: "audit_log", value: { eventos: limpios }, updated_at: new Date().toISOString() })
    });
  } catch(e) { console.error("Error guardando auditoría:", e); }
}

// Buffer global: evita race conditions acumulando eventos y grabando cada 5s
window._auditBuffer = window._auditBuffer || [];
window._auditAllEvents = window._auditAllEvents || null; // cargados desde Supabase
window._auditFlushTimer = null;

async function auditFlush() {
  if(window._auditBuffer.length === 0) return;
  const nuevos = [...window._auditBuffer];
  window._auditBuffer = [];
  if(!window._auditAllEvents) window._auditAllEvents = await auditLoad();
  window._auditAllEvents = [...window._auditAllEvents, ...nuevos];
  await auditSave(window._auditAllEvents);
}

// API principal: auditLog(accion, detalles)
// accion: "login", "logout", "crear", "editar", "eliminar", "consultar", "exportar",
//         "aprobar", "rechazar", "cambio_pin", "reset_pin", "cambio_permiso"
// detalles: { modulo, seccion, descripcion, registroId, campo, valorAnterior, valorNuevo }
window.auditLog = function(accion, detalles = {}) {
  try {
    const usuario = window._auditUsuarioActual;
    if(!usuario && accion !== "login") return; // sin usuario autenticado, no registrar (excepto logins)
    const evento = {
      id: `ev_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
      timestamp: new Date().toISOString(),
      usuario: usuario?.nombre || detalles.usuario || "—",
      email: usuario?.email || detalles.email || "",
      rol: usuario?.rol || "—",
      accion,
      modulo: detalles.modulo || "",
      seccion: detalles.seccion || "",
      descripcion: detalles.descripcion || "",
      registroId: detalles.registroId || "",
      campo: detalles.campo || "",
      valorAnterior: detalles.valorAnterior !== undefined ? String(detalles.valorAnterior).slice(0,300) : "",
      valorNuevo: detalles.valorNuevo !== undefined ? String(detalles.valorNuevo).slice(0,300) : "",
    };
    window._auditBuffer.push(evento);
    // Debounce: flush después de 5s de inactividad
    clearTimeout(window._auditFlushTimer);
    window._auditFlushTimer = setTimeout(auditFlush, 5000);
  } catch(e) { console.error("Error registrando auditoría:", e); }
};

// Helper: registra una edición detectando cambios campo por campo
window.auditLogDiff = function(modulo, seccion, registroId, descripcion, antes, despues) {
  try {
    if(!antes || !despues) return;
    const keys = new Set([...Object.keys(antes), ...Object.keys(despues)]);
    keys.forEach(k => {
      if(k.startsWith("_")) return; // campos internos
      const vA = antes[k];
      const vD = despues[k];
      // Solo registrar si cambió
      if(JSON.stringify(vA) !== JSON.stringify(vD)) {
        window.auditLog("editar", {
          modulo, seccion, registroId, descripcion,
          campo: k,
          valorAnterior: typeof vA === "object" ? JSON.stringify(vA) : vA,
          valorNuevo:    typeof vD === "object" ? JSON.stringify(vD) : vD,
        });
      }
    });
  } catch(e) { console.error("Error en auditLogDiff:", e); }
};

// Al cerrar ventana, flush pendiente
if(typeof window !== "undefined" && !window._auditBeforeUnload) {
  window._auditBeforeUnload = true;
  window.addEventListener("beforeunload", () => {
    if(window._auditBuffer.length > 0) {
      // Guardado síncrono best-effort usando sendBeacon
      try {
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - AUDIT_RETENCION_MESES);
        const allEvents = [...(window._auditAllEvents||[]), ...window._auditBuffer]
          .filter(e => new Date(e.timestamp) >= cutoff);
        const blob = new Blob([JSON.stringify({
          id: "audit_log",
          value: { eventos: allEvents },
          updated_at: new Date().toISOString()
        })], {type:"application/json"});
        // Nota: sendBeacon no permite headers custom en Supabase, así que solo flush async
        auditFlush();
      } catch {}
    }
  });
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
// Exponer globalmente para uso desde otros módulos (ej: nóminas)
window._enviarNotificacion = enviarNotificacion;

const DIAS_SEMANA = ["Lunes","Martes","Miercoles","Jueves","Viernes"];
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const FRECUENCIAS = ["Diaria","Semanal","Quincenal","Mensual","Anual","Puntual"];

// Roles del sistema
const ROLES = [
  {v:"admin",    l:"Administrador – acceso total"},
  {v:"editor",   l:"Editor – gestiona sus tareas"},
  {v:"consulta", l:"Consulta – solo visualiza"},
];

// Módulos disponibles — agregar aquí nuevos módulos en el futuro
const MODULOS_DISPONIBLES = [
  {id:"tareas",   label:"Seguimiento Tareas",      sublabel:"Administración y Finanzas", icon:"📋", color:"#2563eb", bg:"#dbeafe", grad:"linear-gradient(135deg,#1e3a5f,#2563eb)"},
  {id:"osiris",   label:"Osiris Plant Management", sublabel:"Genética Diferenciada",       icon:"🌿", color:"#0f766e", bg:"#ccfbf1", grad:"linear-gradient(135deg,#0f2d4a,#0f766e)"},
  {id:"finanzas", label:"Finanzas",                sublabel:"Flujo de Caja Grupo Mediterra", icon:"💼", color:"#0d6b3a", bg:"#d1fae5", grad:"linear-gradient(135deg,#0d2137,#0a3d2b)"},
  {id:"allegria", label:"Allegria Foods",           sublabel:"Exportación Fruta Fresca",  icon:"🍒", color:"#b91c1c", bg:"#fee2e2", grad:"linear-gradient(135deg,#1a0a0a,#b91c1c)"},
];

// Feriados de Chile (fijos + variables conocidos 2026-2031)
// Formato: "MM-DD" para fijos, "YYYY-MM-DD" para variables
const FERIADOS_FIJOS = [
  "01-01", // Año Nuevo
  "05-01", // Día del Trabajo
  "05-21", // Día de las Glorias Navales
  "06-20", // Día Nacional de los Pueblos Indígenas (aprox, varía)
  "06-29", // San Pedro y San Pablo (puede moverse)
  "07-16", // Virgen del Carmen
  "08-15", // Asunción de la Virgen
  "09-18", // Fiestas Patrias
  "09-19", // Día de las Glorias del Ejército
  "10-12", // Encuentro de Dos Mundos (puede moverse)
  "10-31", // Día de las Iglesias Evangélicas
  "11-01", // Día de Todos los Santos
  "12-08", // Inmaculada Concepción
  "12-25", // Navidad
];
// Feriados variables (Semana Santa, etc.) — agregar manualmente cada año
const FERIADOS_VARIABLES = [
  "2026-04-03","2026-04-04", // Viernes y Sábado Santo 2026
  "2027-03-26","2027-03-27", // 2027
  "2028-04-14","2028-04-15", // 2028
  "2029-03-30","2029-03-31", // 2029
  "2030-04-19","2030-04-20", // 2030
  "2031-04-11","2031-04-12", // 2031
];

function esFeriado(fecha) {
  const mmdd = `${String(fecha.getMonth()+1).padStart(2,"0")}-${String(fecha.getDate()).padStart(2,"0")}`;
  if(FERIADOS_FIJOS.includes(mmdd)) return true;
  const iso = fecha.toISOString().slice(0,10);
  if(FERIADOS_VARIABLES.includes(iso)) return true;
  return false;
}

function diaHabil(anio,mes,dia){
  const f=new Date(anio,mes,dia);
  // Avanzar al siguiente día hábil si cae sábado, domingo o feriado
  let intentos = 0;
  while(intentos < 10) {
    const d = f.getDay();
    if(d === 6) { f.setDate(f.getDate()+2); intentos++; continue; } // Sábado → Lunes
    if(d === 0) { f.setDate(f.getDate()+1); intentos++; continue; } // Domingo → Lunes
    if(esFeriado(f)) { f.setDate(f.getDate()+1); intentos++; continue; } // Feriado → siguiente
    break;
  }
  return f;
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
      style={{height:44, objectFit:"contain", display:"block"}}/>
  );
}

// ══════════════════════════════════════════════════════════════════════
// PERMISOS POR PESTAÑA — configuración centralizada
// ══════════════════════════════════════════════════════════════════════
const TABS_PERMISOS_CONFIG = {
  tareas: [
    {id:"diaria",    label:"📋 Diarias"},
    {id:"semanal",  label:"📅 Semanales"},
    {id:"quincenal",label:"🗓 Quincenales"},
    {id:"mensual",  label:"📆 Mensuales"},
    {id:"anual",    label:"📌 Anuales"},
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
    {id:"nominas",   label:"📋 Nóminas"},
    {id:"params",    label:"⚡ Parámetros"},
    {id:"auditoria", label:"🔍 Auditoría"},
  ],
  allegria: [
    {id:"clientes",      label:"👥 Clientes Importadores"},
    {id:"productores",   label:"🌱 Productores"},
    {id:"embarques",     label:"🚢 Embarques"},
    {id:"liquidaciones", label:"💰 Liquidación Productor"},
    {id:"liq_cliente",   label:"📥 Liquidación Cliente"},
    {id:"anticipos",     label:"💵 Anticipos"},
    {id:"cobranza",      label:"📋 Cobranza"},
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
  // config es solo para admin — no-admins no tienen acceso por defecto
  if(tabId === "config") return usuario.tab_permisos?.[modulo]?.[tabId] ?? "sin_acceso";
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
        window.auditLog("cambio_permiso", {modulo:"sistema", seccion:"permisos",
          descripcion:`Removió acceso al módulo "${modId}" a ${nombreU}`,
          registroId:nombreU, campo:"modulos", valorAnterior:mods.join(","), valorNuevo:mods.filter(m=>m!==modId).join(",")});
        return { ...u, modulos: mods.filter(m => m !== modId) };
      } else {
        window.auditLog("cambio_permiso", {modulo:"sistema", seccion:"permisos",
          descripcion:`Otorgó acceso al módulo "${modId}" a ${nombreU}`,
          registroId:nombreU, campo:"modulos", valorAnterior:mods.join(","), valorNuevo:[...mods, modId].join(",")});
        return { ...u, modulos: [...mods, modId] };
      }
    }));
  }

  function setRol(nombreU, rol) {
    setUsuarios(prev => prev.map(u => {
      if(u.nombre !== nombreU) return u;
      window.auditLog("cambio_permiso", {modulo:"sistema", seccion:"permisos",
        descripcion:`Cambió rol de ${nombreU} de "${u.rol}" a "${rol}"`,
        registroId:nombreU, campo:"rol", valorAnterior:u.rol, valorNuevo:rol});
      return { ...u, rol, modulos: rol === "admin" ? MODULOS_DISPONIBLES.map(m=>m.id) : (Array.isArray(u.modulos) ? u.modulos : ["tareas"]) };
    }));
  }

  function toggleActivar(nombreU) {
    setUsuarios(prev => prev.map(u => {
      if(u.nombre !== nombreU) return u;
      const nuevo = !u.desactivado;
      window.auditLog(nuevo?"desactivar_usuario":"activar_usuario", {modulo:"sistema", seccion:"permisos",
        descripcion:`${nuevo?"Desactivó":"Reactivó"} al usuario ${nombreU}`,
        registroId:nombreU, campo:"desactivado", valorAnterior:u.desactivado||false, valorNuevo:nuevo});
      return { ...u, desactivado: nuevo };
    }));
  }

  function setTabPerm(nombreU, modulo, tabId, nivel) {
    setUsuarios(prev => prev.map(u => {
      if(u.nombre !== nombreU) return u;
      const tp = JSON.parse(JSON.stringify(u.tab_permisos || {}));
      if(!tp[modulo]) tp[modulo] = {};
      const nivelAnt = tp[modulo][tabId] || "editar";
      tp[modulo][tabId] = nivel;
      window.auditLog("cambio_permiso", {modulo:"sistema", seccion:"permisos",
        descripcion:`Cambió permiso de ${nombreU} en ${modulo}/${tabId} de "${nivelAnt}" a "${nivel}"`,
        registroId:nombreU, campo:`${modulo}.${tabId}`, valorAnterior:nivelAnt, valorNuevo:nivel});
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
              ? <div style={{marginBottom:12}}><OsirisLogoSmall/></div>
              : modulo.id === "finanzas"
              ? <div style={{marginBottom:12}}>
                  <img src="/med.png" alt="Mediterra"
                    style={{height:44,objectFit:"contain",display:"block"}}
                    onError={e=>{e.target.style.display="none";}}/>
                </div>
              : modulo.id === "allegria"
              ? <div style={{marginBottom:12}}>
                  <img src={ALLEGRIA_LOGO_B64} alt="Allegria Foods"
                    style={{height:44,objectFit:"contain",display:"block"}}
                    onError={e=>{e.target.onerror=null;e.target.style.display="none";}}/>
                </div>
              : <div style={{fontSize:40, marginBottom:14}}>{modulo.icon}</div>
            }
            <div style={{fontSize:17, fontWeight:800, color:"#fff", marginBottom:4}}>{modulo.label}</div>
            <div style={{fontSize:12, color:"rgba(255,255,255,0.65)"}}>{modulo.sublabel}</div>
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
// CONFIG TAB — Gestión de tareas (componente separado para poder usar hooks)
// ══════════════════════════════════════════════════════════════════════
function ConfigTab({todasTareas,getFrecuencia,WORKERS,CATEGORIAS,FRECUENCIAS,
  editandoTarea,setEditandoTarea,formEditTarea,setFormEditTarea,
  tareasOverrides,setTareasOverrides,setTareasConfig,guardarAhora,puedeEditConfig}){
  const [cfgFiltroPersona,setCfgFiltroPersona]=useState("");
  const [cfgFiltroFrec,setCfgFiltroFrec]=useState("");

  const FREC_META={
    "Diaria":    {icon:"📋",desc:"Lunes a Viernes",   bg:"#eff6ff",color:"#1d4ed8"},
    "Semanal":   {icon:"📅",desc:"Una vez por semana", bg:"#f0fdf4",color:"#16a34a"},
    "Quincenal": {icon:"🗓",desc:"1ra y 2da quincena", bg:"#fefce8",color:"#ca8a04"},
    "Mensual":   {icon:"📆",desc:"Una vez al mes",     bg:"#fdf4ff",color:"#9333ea"},
    "Anual":     {icon:"📌",desc:"Una vez al año",     bg:"#fff7ed",color:"#ea580c"},
  };

  const tareasFiltradas=todasTareas().filter(t=>{
    if(cfgFiltroPersona && t.responsable!==cfgFiltroPersona) return false;
    if(cfgFiltroFrec    && getFrecuencia(t.id)!==cfgFiltroFrec) return false;
    return true;
  });

  const FREC_ORDER=["Diaria","Semanal","Quincenal","Mensual","Anual"];
  const grupos=FREC_ORDER.map(frec=>({frec,tareas:tareasFiltradas.filter(t=>getFrecuencia(t.id)===frec)})).filter(g=>g.tareas.length>0);

  function guardarTarea(t){
    const upd={...formEditTarea};
    // Ensure diaLimiteSem is included if not changed
    if(upd.diaLimiteSem===undefined) upd.diaLimiteSem = tareasOverrides[t.id]?.diaLimiteSem??t.diaLimiteSem??0;
    setTareasOverrides(prev=>({...prev,[t.id]:upd}));
    setTareasConfig(prev=>({...prev,[t.id]:{...prev[t.id],...upd}}));
    setEditandoTarea(null);
    setTimeout(()=>guardarAhora(),300);
  }

  return (
    <div>
      {/* Filtros */}
      <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:16,flexWrap:"wrap"}}>
        <div style={{fontWeight:700,fontSize:15,color:"#1e293b",marginRight:8}}>⚙️ Gestión de Tareas</div>
        <select value={cfgFiltroPersona} onChange={e=>setCfgFiltroPersona(e.target.value)}
          style={{padding:"6px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:12,outline:"none"}}>
          <option value="">👤 Todas las personas</option>
          {WORKERS.map(w=><option key={w.nombre} value={w.nombre}>{w.nombre.split(" ")[0]} {w.nombre.split(" ")[1]||""}</option>)}
        </select>
        <select value={cfgFiltroFrec} onChange={e=>setCfgFiltroFrec(e.target.value)}
          style={{padding:"6px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:12,outline:"none"}}>
          <option value="">🔁 Todas las frecuencias</option>
          {FRECUENCIAS.map(f=><option key={f}>{f}</option>)}
        </select>
        {!puedeEditConfig&&(
          <span style={{marginLeft:"auto",background:"#fef3c7",borderRadius:8,padding:"4px 10px",fontSize:11,color:"#92400e"}}>Solo lectura</span>
        )}
      </div>

      {grupos.length===0&&(
        <div style={{textAlign:"center",padding:40,color:"#94a3b8",fontSize:13}}>Sin tareas con los filtros seleccionados</div>
      )}

      {grupos.map(({frec,tareas})=>{
        const meta=FREC_META[frec]||{icon:"📋",desc:"",bg:"#f8fafc",color:"#64748b"};
        return (
          <div key={frec} style={{marginBottom:24}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,padding:"8px 14px",
              background:meta.bg,borderRadius:10,border:`1px solid ${meta.color}33`}}>
              <span style={{fontSize:16}}>{meta.icon}</span>
              <span style={{fontWeight:800,fontSize:14,color:meta.color}}>{frec}</span>
              <span style={{fontSize:11,color:"#64748b"}}>— {meta.desc}</span>
              <span style={{marginLeft:"auto",background:`${meta.color}22`,color:meta.color,
                borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700}}>{tareas.length} tareas</span>
            </div>
            <div style={{overflowX:"auto",borderRadius:10,boxShadow:"0 1px 3px #0001"}}>
              <table style={{width:"100%",borderCollapse:"collapse",background:"#fff",fontSize:12}}>
                <thead>
                  <tr style={{background:"#1e293b",color:"#fff"}}>
                    {["Tarea","Responsable","Supervisor","Categoría","Frecuencia","Fecha Venc.","Depende De",""].map(h=>(
                      <th key={h} style={{padding:"7px 10px",textAlign:"left",fontWeight:600,fontSize:11,whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tareas.map((t,ti)=>{
                    const isEditing=editandoTarea===t.id;
                    const cat=CATEGORIAS[t.categoria]||{color:"#64748b",bg:"#f1f5f9"};
                    const ovr=tareasOverrides[t.id]||{};
                    const fechaVenc=ovr.fechaVenc||t.fechaVenc||"";
                    const depDe=ovr.dependeDe!==undefined?ovr.dependeDe:t.dependeDe;
                    if(isEditing) return (
                      <tr key={t.id} style={{background:"#eff6ff",borderBottom:"2px solid #3b82f6"}}>
                        <td style={{padding:"5px 8px"}}>
                          <input value={formEditTarea.nombre||""} onChange={e=>setFormEditTarea(p=>({...p,nombre:e.target.value}))}
                            style={{width:"100%",padding:"4px 7px",borderRadius:6,border:"1px solid #3b82f6",fontSize:12,outline:"none",boxSizing:"border-box"}}/>
                        </td>
                        <td style={{padding:"5px 6px"}}>
                          <select value={formEditTarea.responsable||""} onChange={e=>setFormEditTarea(p=>({...p,responsable:e.target.value}))}
                            style={{padding:"4px 6px",borderRadius:6,border:"1px solid #3b82f6",fontSize:11,outline:"none"}}>
                            <option value="">—</option>
                            {WORKERS.map(w=><option key={w.nombre} value={w.nombre}>{w.nombre.split(" ")[0]}</option>)}
                          </select>
                        </td>
                        <td style={{padding:"5px 6px"}}>
                          <select value={formEditTarea.supervisor||""} onChange={e=>setFormEditTarea(p=>({...p,supervisor:e.target.value}))}
                            style={{padding:"4px 6px",borderRadius:6,border:"1px solid #3b82f6",fontSize:11,outline:"none"}}>
                            <option value="">—</option>
                            {WORKERS.map(w=><option key={w.nombre} value={w.nombre}>{w.nombre.split(" ")[0]}</option>)}
                          </select>
                        </td>
                        <td style={{padding:"5px 6px"}}>
                          <select value={formEditTarea.categoria||""} onChange={e=>setFormEditTarea(p=>({...p,categoria:e.target.value}))}
                            style={{padding:"4px 6px",borderRadius:6,border:"1px solid #3b82f6",fontSize:11,outline:"none"}}>
                            {Object.keys(CATEGORIAS).map(c=><option key={c}>{c}</option>)}
                          </select>
                        </td>
                        <td style={{padding:"5px 6px"}}>
                          <select value={formEditTarea.frecuencia||getFrecuencia(t.id)} onChange={e=>setFormEditTarea(p=>({...p,frecuencia:e.target.value}))}
                            style={{padding:"4px 6px",borderRadius:6,border:"1px solid #3b82f6",fontSize:11,outline:"none"}}>
                            {FRECUENCIAS.map(f=><option key={f}>{f}</option>)}
                          </select>
                          {(formEditTarea.frecuencia||getFrecuencia(t.id))==="Semanal"&&(
                            <select value={formEditTarea.diaLimiteSem!==undefined?formEditTarea.diaLimiteSem:(tareasOverrides[t.id]?.diaLimiteSem??t.diaLimiteSem??0)}
                              onChange={e=>setFormEditTarea(p=>({...p,diaLimiteSem:Number(e.target.value)}))}
                              style={{marginTop:4,width:"100%",padding:"4px 6px",borderRadius:6,border:"1px solid #3b82f6",fontSize:11,outline:"none"}}>
                              {["Lunes","Martes","Miércoles","Jueves","Viernes"].map((d,i)=>(
                                <option key={i} value={i}>{d}</option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td style={{padding:"5px 6px"}}>
                          <input type="date" value={formEditTarea.fechaVenc||""} onChange={e=>setFormEditTarea(p=>({...p,fechaVenc:e.target.value}))}
                            style={{padding:"4px 6px",borderRadius:6,border:"1px solid #3b82f6",fontSize:11,outline:"none"}}/>
                        </td>
                        <td style={{padding:"5px 6px"}}>
                          <select value={formEditTarea.dependeDe||""} onChange={e=>setFormEditTarea(p=>({...p,dependeDe:e.target.value||null}))}
                            style={{padding:"4px 6px",borderRadius:6,border:"1px solid #3b82f6",fontSize:11,outline:"none",maxWidth:140}}>
                            <option value="">Sin dependencia</option>
                            {todasTareas().filter(x=>x.id!==t.id).map(x=>(
                              <option key={x.id} value={x.id}>{x.id}: {x.nombre.slice(0,25)}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{padding:"5px 8px",whiteSpace:"nowrap"}}>
                          <button onClick={()=>guardarTarea(t)}
                            style={{padding:"4px 10px",borderRadius:6,background:"#2563eb",color:"#fff",
                              border:"none",cursor:"pointer",fontSize:11,marginRight:4}}>✓ Guardar</button>
                          <button onClick={()=>setEditandoTarea(null)}
                            style={{padding:"4px 8px",borderRadius:6,background:"#f1f5f9",
                              color:"#64748b",border:"1px solid #d1d5db",cursor:"pointer",fontSize:11}}>✕</button>
                        </td>
                      </tr>
                    );
                    return (
                      <tr key={t.id} style={{borderBottom:"1px solid #f1f5f9",background:ti%2===0?"#fff":"#fafafa"}}>
                        <td style={{padding:"7px 10px",fontWeight:500,maxWidth:280}}>
                          <div>{ovr.nombre||t.nombre}</div>
                          <div style={{fontSize:10,color:"#94a3b8"}}>{t.id}</div>
                        </td>
                        <td style={{padding:"7px 10px"}}>
                          <span style={{background:"#dbeafe",color:"#1d4ed8",borderRadius:20,padding:"2px 8px",fontSize:11}}>
                            {(ovr.responsable||t.responsable)?.split(" ")[0]}
                          </span>
                        </td>
                        <td style={{padding:"7px 10px",color:"#64748b",fontSize:11}}>
                          {(ovr.supervisor||t.supervisor)?.split(" ")[0]||"—"}
                        </td>
                        <td style={{padding:"7px 10px"}}>
                          <span style={{background:cat.bg,color:cat.color,borderRadius:20,padding:"2px 8px",fontSize:10}}>
                            {ovr.categoria||t.categoria}
                          </span>
                        </td>
                        <td style={{padding:"7px 10px"}}>
                          <span style={{background:"#f0fdf4",color:"#16a34a",borderRadius:20,padding:"2px 8px",fontSize:10,fontWeight:600}}>
                            {getFrecuencia(t.id)}
                          </span>
                          {getFrecuencia(t.id)==="Semanal"&&(
                            <div style={{fontSize:10,color:"#64748b",marginTop:2}}>
                              {["Lunes","Martes","Miércoles","Jueves","Viernes"][tareasOverrides[t.id]?.diaLimiteSem??t.diaLimiteSem??0]}
                            </div>
                          )}
                        </td>
                        <td style={{padding:"7px 10px",whiteSpace:"nowrap"}}>
                          {fechaVenc
                            ? <span style={{background:"#fef3c7",color:"#92400e",borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:600}}>
                                📅 {new Date(fechaVenc+"T12:00:00").toLocaleDateString("es-CL",{day:"2-digit",month:"short",year:"numeric"})}
                              </span>
                            : <span style={{color:"#94a3b8",fontSize:11}}>— sin fecha —</span>}
                        </td>
                        <td style={{padding:"7px 10px",fontSize:11}}>
                          {depDe
                            ? <span style={{background:"#fef3c7",color:"#92400e",borderRadius:20,padding:"2px 8px",fontSize:10}}>→ {depDe}</span>
                            : <span style={{color:"#d1d5db"}}>—</span>}
                        </td>
                        <td style={{padding:"7px 8px"}}>
                          {puedeEditConfig&&(
                            <button onClick={()=>{
                              setEditandoTarea(t.id);
                              setFormEditTarea({
                                nombre:     ovr.nombre||t.nombre,
                                responsable:ovr.responsable||t.responsable,
                                supervisor: ovr.supervisor||t.supervisor,
                                categoria:  ovr.categoria||t.categoria,
                                frecuencia: getFrecuencia(t.id),
                                fechaVenc:  fechaVenc,
                                dependeDe:  depDe,
                              });
                            }}
                              style={{padding:"3px 10px",borderRadius:6,background:"#f8fafc",
                                border:"1px solid #d1d5db",cursor:"pointer",fontSize:11,color:"#475569"}}>✏️ Editar</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// APP PRINCIPAL
// ══════════════════════════════════════════════════════════════════════
export default function App(){
  const hoy=new Date();

  // ── Título y favicon de Mediterra ────────────────────────────────
  useEffect(()=>{
    document.title = "Gestión Mediterra";
    // Buscar o crear el favicon
    let link = document.querySelector("link[rel*='icon']");
    if(!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.type = "image/png";
    link.href = "/mediterra-logo.png"; // Logo colocado en /public
  },[]);

  const [usuarioActual,setUsuarioActual]=useState(null);
  const [moduloActivo,setModuloActivo]=useState(null);
  const [loginNombre,setLoginNombre]=useState("");
  const [loginEmail,setLoginEmail]=useState("");
  const [resetEmail,setResetEmail]=useState("");
  const [loginPin,setLoginPin]=useState("");
  const [loginError,setLoginError]=useState("");

  // ── Auto-reload on new Vercel deploy ─────────────────────────────
  useEffect(()=>{
    // URL de producción fija — evita redirigir a URLs internas protegidas de Vercel
    const PROD_URL = 'https://gestion-grupo-mediterra.vercel.app';
    let currentBundle = null;
    async function checkNewDeploy() {
      try {
        const res = await fetch(`${PROD_URL}/`, {cache:'no-store'});
        if(!res.ok) return; // si la URL falla, no hacer nada
        const html = await res.text();
        const match = html.match(/\/static\/js\/main\.[a-f0-9]+\.js/);
        const bundle = match ? match[0] : null;
        if(!bundle) return;
        if(currentBundle === null) { currentBundle = bundle; }
        else if(bundle !== currentBundle) {
          // Recargar siempre a la URL de producción
          window.location.href = PROD_URL;
        }
      } catch(e) {}
    }
    const initialCheck = setTimeout(checkNewDeploy, 5000);
    const interval = setInterval(checkNewDeploy, 30 * 1000);
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
  const [tareasOverrides,setTareasOverrides]=useState({});
  const todasTareas=useCallback(()=>{
    const base=[...TAREAS_BASE,...tareasExtra];
    return base.map(t=>tareasOverrides[t.id]?{...t,...tareasOverrides[t.id]}:t);
  },[tareasExtra,tareasOverrides]);
  const getConfig=(id)=>tareasConfig[id]||{supervisor:"",diaLimiteSem:0,diaLimite:10,frecuencia:"Semanal",bloqueada:false,dependeDe:null};
  const getSupervisor=(id)=>tareasConfig[id]?.supervisor??TAREAS_BASE.find(t=>t.id===id)?.supervisor??"";
  const getFrecuencia=(id)=>tareasOverrides[id]?.frecuencia||tareasConfig[id]?.frecuencia||TAREAS_BASE.find(t=>t.id===id)?.frecuencia||"Semanal";
  const isBloqueada=(id)=>tareasConfig[id]?.bloqueada||false;
  const getDependeDe=(id)=>tareasConfig[id]?.dependeDe??null;
  const getTareaById=(id)=>todasTareas().find(t=>t.id===id);

  const [estados,setEstados]=useState(()=>{
    const est={};
    TAREAS_BASE.filter(t=>t.frecuencia==="Semanal").forEach(t=>{semanasDelMes(hoy.getMonth(),hoy.getFullYear()).forEach(s=>{est[`${t.id}_s${s.num}`]={estadoResp:"gris",estadoSup:"gris",aprobado:false};});});
    TAREAS_BASE.filter(t=>t.frecuencia!=="Semanal").forEach(t=>{est[t.id]={estadoResp:"gris",estadoSup:"gris",aprobado:false};});
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
  const [nuevaTarea,setNuevaTarea]=useState({nombre:"",responsable:"",supervisor:"",categoria:"Finanzas",frecuencia:"Semanal",dependeDe:"",fechaPuntual:""});
  const [mostrarFormTarea,setMostrarFormTarea]=useState(false);
  const [editandoTarea,setEditandoTarea]=useState(null);
  const [formEditTarea,setFormEditTarea]=useState({});

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
          if(d.tareasOverrides)setTareasOverrides(prev=>({...prev,...d.tareasOverrides}));
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
        window._auditUsuarioActual = worker;
        // Restaurar el módulo donde estaba
        const savedModulo = sessionStorage.getItem('mediterra_modulo');
        if(savedModulo) setModuloActivo(savedModulo);
      } else {
        sessionStorage.removeItem('mediterra_usuario');
        sessionStorage.removeItem('mediterra_modulo');
      }
    }
  },[cargando, usuarios]); // eslint-disable-line

  // Mantener _auditUsuarioActual sincronizado
  useEffect(()=>{
    window._auditUsuarioActual = usuarioActual;
  },[usuarioActual]);

  // ═══════════════════════════════════════════════════════════════════
  // ALERTAS EMAIL — Tareas puntuales: email los LUNES + resumen semanal
  // + Modal al ingresar con tareas próximas/vencidas
  // ═══════════════════════════════════════════════════════════════════
  const [modalAlertasTareas, setModalAlertasTareas] = useState(null); // {tareas:[]}

  useEffect(()=>{
    if(cargando || !usuarioActual) return;
    const hoyStr = new Date().toISOString().slice(0,10);
    const hoyD = new Date(); hoyD.setHours(0,0,0,0);
    const diaSemana = hoyD.getDay(); // 0=dom, 1=lun...

    const puntuales = todasTareas().filter(t=>getFrecuencia(t.id)==="Puntual"&&!isBloqueada(t.id));
    const getWorker = (nombre) => WORKERS.find(w=>w.nombre===nombre);

    // ── Modal al login: mostrar tareas próximas (30d) y vencidas del usuario ──
    const modalKey = `_modal_tareas_${hoyStr}_${usuarioActual.nombre}`;
    if(!sessionStorage.getItem(modalKey)) {
      sessionStorage.setItem(modalKey, "1");
      const misTareas = [];
      puntuales.forEach(t => {
        const fp = getConfig(t.id).fechaPuntual || t.fechaPuntual;
        if(!fp) return;
        const est = estados[t.id]||{};
        if(est.estadoResp === "verde" || est.estadoResp === "na") return;
        const fechaObj = new Date(fp+"T00:00:00");
        const diff = Math.ceil((fechaObj - hoyD)/(1000*60*60*24));
        if(diff > 30) return;
        const sup = getSupervisor(t.id);
        // Mostrar si soy responsable, supervisor, o admin
        const esResp = t.responsable === usuarioActual.nombre;
        const esSup = sup === usuarioActual.nombre;
        const esAdm = usuarioActual.rol === "admin";
        if(!esResp && !esSup && !esAdm) return;
        misTareas.push({
          nombre: t.nombre,
          responsable: t.responsable,
          supervisor: sup||"—",
          fecha: fechaObj.toLocaleDateString("es-CL",{day:"2-digit",month:"short",year:"numeric"}),
          diff,
          categoria: t.categoria,
          vencida: diff < 0,
          hoy: diff === 0,
        });
      });
      // Ordenar: vencidas primero, luego por fecha
      misTareas.sort((a,b) => a.diff - b.diff);
      if(misTareas.length > 0) {
        setTimeout(()=>setModalAlertasTareas({tareas: misTareas}), 1500); // delay para que cargue UI
      }
    }

    // ── Emails: solo los LUNES ──
    if(diaSemana !== 1) return;
    if(usuarioActual.rol !== "admin") return; // solo admin dispara emails
    const alertKey = `_alertas_email_${hoyStr}`;
    if(sessionStorage.getItem(alertKey)) return;
    sessionStorage.setItem(alertKey, "1");

    // Alertas individuales: solo cuando faltan ≤7 días o está vencida (≤3d)
    puntuales.forEach(t => {
      const fp = getConfig(t.id).fechaPuntual || t.fechaPuntual;
      if(!fp) return;
      const est = estados[t.id]||{};
      if(est.estadoResp === "verde" || est.estadoResp === "na") return;
      const fechaObj = new Date(fp+"T00:00:00");
      const diff = Math.ceil((fechaObj - hoyD)/(1000*60*60*24));
      const sup = getSupervisor(t.id);
      const wResp = getWorker(t.responsable);
      const wSup = sup ? getWorker(sup) : null;

      let asunto = null, mensaje = null;
      if(diff >= 0 && diff <= 7) {
        asunto = `⚠️ ${diff===0?"VENCE HOY":diff===1?"MAÑANA vence":`${diff} días`} — ${t.nombre}`;
        mensaje = `La tarea "${t.nombre}" vence el ${fechaObj.toLocaleDateString("es-CL")}.\n\n${diff===0?"¡Vence HOY!":diff===1?"¡Vence MAÑANA!":"Faltan "+diff+" días."}\n\nResponsable: ${t.responsable}\nSupervisor: ${sup||"—"}\n\nhttps://gestion-grupo-mediterra.vercel.app`;
      } else if(diff < 0 && diff >= -7) {
        asunto = `❌ VENCIDA (${Math.abs(diff)}d) — ${t.nombre}`;
        mensaje = `La tarea "${t.nombre}" venció hace ${Math.abs(diff)} día(s).\n\nAún no ha sido completada.\n\nResponsable: ${t.responsable}\n\nhttps://gestion-grupo-mediterra.vercel.app`;
      }

      if(asunto && mensaje && window._enviarNotificacion) {
        if(wResp?.email) window._enviarNotificacion(wResp.email, wResp.nombre, asunto, mensaje).catch(()=>{});
        if(wSup?.email && wSup.email !== wResp?.email) window._enviarNotificacion(wSup.email, wSup.nombre, asunto, mensaje).catch(()=>{});
      }
    });

    // Resumen semanal consolidado (lunes)
    const porResponsable = {};
    puntuales.forEach(t => {
      const fp = getConfig(t.id).fechaPuntual || t.fechaPuntual;
      if(!fp) return;
      const est = estados[t.id]||{};
      if(est.estadoResp === "verde" || est.estadoResp === "na") return;
      const fechaObj = new Date(fp+"T00:00:00");
      const diff = Math.ceil((fechaObj - hoyD)/(1000*60*60*24));
      if(diff > 30) return;
      if(!porResponsable[t.responsable]) porResponsable[t.responsable] = [];
      const estado = diff < 0 ? `⚠️ VENCIDA ${Math.abs(diff)}d` : diff === 0 ? "🔴 HOY" : `${diff} días`;
      porResponsable[t.responsable].push(`• ${t.nombre} — ${fechaObj.toLocaleDateString("es-CL")} (${estado})`);
    });

    if(window._enviarNotificacion) {
      Object.entries(porResponsable).forEach(([nombre, tareas]) => {
        const w = getWorker(nombre);
        if(!w?.email || tareas.length === 0) return;
        window._enviarNotificacion(w.email, nombre,
          `📋 Resumen semanal — ${tareas.length} tarea(s) próxima(s)`,
          `Hola ${nombre.split(" ")[0]},\n\nTus tareas puntuales próximas (30 días):\n\n${tareas.join("\n")}\n\nhttps://gestion-grupo-mediterra.vercel.app`
        ).catch(()=>{});
      });

      const todasLasTareas = Object.entries(porResponsable)
        .map(([nombre, tareas]) => `\n👤 ${nombre}:\n${tareas.join("\n")}`)
        .join("\n");
      if(todasLasTareas) {
        const totalTareas = Object.values(porResponsable).reduce((s,t)=>s+t.length, 0);
        window._enviarNotificacion("ahuerta@grupomediterra.cl", "Angelo Huerta",
          `📋 Resumen semanal equipo — ${totalTareas} tarea(s)`,
          `Hola Angelo,\n\nResumen tareas puntuales del equipo (próximos 30 días):\n${todasLasTareas}\n\nhttps://gestion-grupo-mediterra.vercel.app`
        ).catch(()=>{});
      }
    }
  },[cargando, usuarioActual]); // eslint-disable-line

  // Limpiar sesión al hacer logout manual
  // (el logout llama setUsuarioActual(null) — interceptamos eso)

  // Refs para siempre tener valores frescos en guardado
  const estadosRef       = useRef(estados);
  const comentariosRef   = useRef(comentarios);
  const tareasConfigRef  = useRef(tareasConfig);
  const supervisoresRef  = useRef(supervisores);
  const tareasExtraRef   = useRef(tareasExtra);
  const tareasOverridesRef = useRef(tareasOverrides);
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
      tareasOverrides: tareasOverridesRef.current,
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

  // Helper central de logout con auditoría
  function doLogout() {
    const u = usuarioActual;
    if(u) window.auditLog("logout", {modulo:"sistema", seccion:"autenticación",
      descripcion:`${u.nombre} cerró sesión`});
    // Flush inmediato del buffer antes de limpiar
    if(window._auditBuffer && window._auditBuffer.length > 0) {
      try { auditFlush(); } catch {}
    }
    setUsuarioActual(null);
    setModuloActivo(null);
    sessionStorage.removeItem('mediterra_usuario');
    sessionStorage.removeItem('mediterra_modulo');
    window._auditUsuarioActual = null;
  }

  function handleLogin(){
    const emailInput = loginEmail.trim().toLowerCase();
    const w=WORKERS.find(x=>x.email&&x.email.toLowerCase()===emailInput);
    if(!w){
      setLoginError("Email no reconocido. Verifica tu dirección.");
      window.auditLog("login_fallido", {modulo:"sistema", seccion:"autenticación",
        descripcion:`Intento de login con email no reconocido: ${emailInput}`,
        usuario:"(desconocido)", email:emailInput});
      return;
    }
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
        window._auditUsuarioActual = w;
        window.auditLog("login_pin_temporal", {modulo:"sistema", seccion:"autenticación",
          descripcion:`${w.nombre} ingresó con PIN temporal — debe cambiarlo`});
      } else {
        // PIN normal: entrar directo
        setUsuarioActual(w);
        sessionStorage.setItem('mediterra_usuario', w.nombre);
        window._auditUsuarioActual = w;
        window.auditLog("login", {modulo:"sistema", seccion:"autenticación",
          descripcion:`${w.nombre} (${w.rol}) inició sesión`});
      }
    }else{
      setLoginError("PIN incorrecto.");
      window.auditLog("login_fallido", {modulo:"sistema", seccion:"autenticación",
        descripcion:`PIN incorrecto para ${w.nombre}`,
        usuario:w.nombre, email:w.email});
    }
  }

  async function handleResetPin(){
    const emailReset=(resetEmail||loginEmail||"").trim().toLowerCase();const w=WORKERS.find(x=>x.email&&x.email.toLowerCase()===emailReset);if(!w){setResetMsg("Email no reconocido.");return;}
    setResetEnviando(true);
    const temporal=String(Math.floor(1000+Math.random()*9000));
    const nuevosPins={...pinsPersonalizados,[w.nombre+"_temp"]:temporal};
    setPinsPersonalizados(nuevosPins);
    await dbSave({estados,comentarios,tareasConfig,supervisores,tareasExtra,pinsPersonalizados:nuevosPins,recsDone,recsComentarios,usuarios,mes,anio,osirisData});
    try{
      await enviarEmail(w.email,w.nombre,"PIN temporal - Mediterra",`Tu PIN temporal es: ${temporal}\nIngresa con este PIN y cambialo inmediatamente.\n\nhttps://gestion-grupo-mediterra.vercel.app`);
      setResetMsg("PIN enviado a "+w.email);
      window.auditLog("reset_pin", {modulo:"sistema", seccion:"autenticación",
        descripcion:`Se envió PIN temporal a ${w.nombre} (${w.email})`,
        usuario:w.nombre, email:w.email});
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
        window._auditUsuarioActual = workerPendiente;
        setWorkerPendiente(null);
      }
      window.auditLog("cambio_pin", {modulo:"sistema", seccion:"autenticación",
        descripcion:`${worker.nombre} cambió su PIN`});
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
    if(getFrecuencia(depT.id)==="Mensual"||getFrecuencia(depT.id)==="Puntual")return(estados[depId]?.estadoResp||"gris")==="verde";
    if(numSemana===null||numSemana===undefined)return(estados[depId]?.estadoResp||"gris")==="verde";
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
      const nuevo={...prev,[key]:{...prev[key],estadoResp:sig,aprobado:false,estadoSup:sig!=="verde"?"gris":(prev[key]?.estadoSup||"gris")}};
      // Auditar cambio de estado
      window.auditLog("editar", {modulo:"tareas", seccion:"ejecución",
        descripcion:`Cambió estado responsable de "${tarea.nombre}"${numSemana?` (S${numSemana})`:""} de "${SEMAFORO[actual]?.label||actual}" a "${SEMAFORO[sig]?.label||sig}"`,
        registroId:key, campo:"estadoResp", valorAnterior:actual, valorNuevo:sig});
      if(sig==="verde"){
        // Notificar al supervisor por email
        const supNombre = tareasOverrides[tarea.id]?.supervisor || getSupervisor(tarea.id);
        if(supNombre){
          const supWorker = WORKERS.find(w=>w.nombre===supNombre);
          if(supWorker?.email){
            const respNombre = tarea.responsable||usuarioActual?.nombre||"";
            enviarNotificacion(
              supWorker.email,
              supNombre,
              `✅ Tarea completada: ${tarea.nombre}`,
              `${respNombre} ha completado la tarea "${tarea.nombre}" y está lista para tu revisión.`
            ).catch(()=>{});
          }
        }
        // Notificar dependencias
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
      // Auditar aprobación/cambio supervisor
      window.auditLog(sig==="verde"?"aprobar":"editar", {modulo:"tareas", seccion:"aprobación",
        descripcion:`Supervisor cambió aprobación de "${tarea.nombre}" de "${SEMAFORO[actual]?.label||actual}" a "${SEMAFORO[sig]?.label||sig}"`,
        registroId:key, campo:"estadoSup", valorAnterior:actual, valorNuevo:sig});
      return{...prev,[key]:{...(prev[key]||{estadoResp:"gris",estadoSup:"gris",aprobado:false}),estadoSup:sig,aprobado:sig==="verde"}};
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
    if(frec==="Mensual"){const fl=diaHabil(anio,mes,getConfig(tarea.id).diaLimite||tarea.diaLimite);if(fl<FECHA_INICIO)return false;return hoyD>fl&&(estados[key]?.estadoResp||"gris")==="gris";}
    if(frec==="Puntual"){
      const fp = getConfig(tarea.id).fechaPuntual || tarea.fechaPuntual;
      if(!fp) return false;
      const fl = new Date(fp+"T00:00:00"); 
      return hoyD>fl&&(estados[key]?.estadoResp||"gris")==="gris";
    }
    if(numSemana===null||numSemana===undefined) return false; // Diaria/Quincenal/Anual - no semana lógica
    const sw=semanas.find(s=>s.num===numSemana)||semanas[0];
    if(!sw) return false;
    const ds=getConfig(tarea.id).diaLimiteSem??tarea.diaLimiteSem;
    const fl=fechaDiaSemana(sw.inicioSem,ds);
    if(fl<FECHA_INICIO)return false;
    return hoyD>fl&&(estados[key]?.estadoResp||"gris")==="gris";
  }
  function estaProxima(tarea,key,numSemana){
    const hoyD=new Date();hoyD.setHours(0,0,0,0);
    const frec=getFrecuencia(tarea.id);
    let diff;
    if(frec==="Mensual")diff=(diaHabil(anio,mes,getConfig(tarea.id).diaLimite||tarea.diaLimite)-hoyD)/(1000*60*60*24);
    else if(frec==="Puntual"){
      const fp = getConfig(tarea.id).fechaPuntual || tarea.fechaPuntual;
      if(!fp) return false;
      diff = (new Date(fp+"T00:00:00")-hoyD)/(1000*60*60*24);
      // Alertar 30 días antes para tareas puntuales
      return diff>=0 && diff<=30 && (estados[key]?.estadoResp||"gris")==="gris";
    }
    else{if(numSemana===null||numSemana===undefined)return false;const sw=semanas.find(s=>s.num===numSemana)||semanas[0];if(!sw)return false;const ds=getConfig(tarea.id).diaLimiteSem??tarea.diaLimiteSem;diff=(fechaDiaSemana(sw.inicioSem,ds)-hoyD)/(1000*60*60*24);}
    return diff>=0&&diff<=2&&(estados[key]?.estadoResp||"gris")==="gris";
  }
  function generarResumenEmail(){
    const res={};WORKERS.forEach(w=>{res[w.nombre]=[];});
    todasTareas().filter(t=>!isBloqueada(t.id)).forEach(t=>{
      const frec=getFrecuencia(t.id);
      if(frec==="Mensual"||frec==="Puntual"){if(estaVencida(t,t.id,null))res[t.responsable]?.push({...t,key:t.id});}
      else semanas.forEach(s=>{const key=`${t.id}_s${s.num}`;if(estaVencida(t,key,s.num))res[t.responsable]?.push({...t,key});});
    });
    return res;
  }
  function enviarEmailPersona(w,tareas){
    const asunto=encodeURIComponent(`Tareas pendientes - ${MESES[mes]} ${anio}`);
    const cuerpo=encodeURIComponent(`Hola ${w.nombre.split(" ")[0]},\n\nLas siguientes tareas estan vencidas:\n\n`+tareas.map(t=>`- ${t.nombre}`).join('\n')+`\n\nhttps://gestion-grupo-mediterra.vercel.app\n\nSaludos`);
    window.open(`mailto:${w.email}?subject=${asunto}&body=${cuerpo}`);
  }
  const totalVencidas=(()=>{let c=0;todasTareas().filter(t=>!isBloqueada(t.id)).forEach(t=>{const frec=getFrecuencia(t.id);if(frec==="Mensual"||frec==="Puntual"){if(estaVencida(t,t.id,null))c++;}else semanas.forEach(s=>{if(estaVencida(t,`${t.id}_s${s.num}`,s.num))c++;});});return c;})();

  function resumen(nombre){
    let v=0,a=0,r=0,g=0,total=0;
    todasTareas().filter(t=>!isBloqueada(t.id)).forEach(t=>{
      const frec=getFrecuencia(t.id);const sup=getSupervisor(t.id);
      const esR=t.responsable===nombre;const esS=sup===nombre;
      if(!esR&&!esS)return;
      const keys=frec==="Mensual"||frec==="Puntual"?[t.id]:semanas.map(s=>`${t.id}_s${s.num}`);
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
    if(nuevaTarea.frecuencia==="Puntual"&&!nuevaTarea.fechaPuntual){alert("Para tareas puntuales, la fecha es obligatoria.");return;}
    const id=`custom_${Date.now()}`;
    const tarea = {...nuevaTarea, id, diaLimiteSem:0, diaLimite:10, dependeDe:nuevaTarea.dependeDe||null};
    if(nuevaTarea.frecuencia==="Puntual") tarea.fechaPuntual = nuevaTarea.fechaPuntual;
    setTareasExtra(prev=>[...prev, tarea]);
    setTareasConfig(prev=>({...prev,[id]:{supervisor:nuevaTarea.supervisor,diaLimiteSem:0,diaLimite:10,
      frecuencia:nuevaTarea.frecuencia,bloqueada:false,dependeDe:nuevaTarea.dependeDe||null,
      fechaPuntual:nuevaTarea.fechaPuntual||""}}));
    setSupervisores(prev=>({...prev,[id]:nuevaTarea.supervisor||""}));
    setEstados(prev=>{
      const n={...prev};
      if(nuevaTarea.frecuencia==="Mensual"||nuevaTarea.frecuencia==="Puntual") n[id]={estadoResp:"gris",estadoSup:"gris",aprobado:false};
      else semanas.forEach(s=>{n[`${id}_s${s.num}`]={estadoResp:"gris",estadoSup:"gris",aprobado:false};});
      return n;
    });
    setNuevaTarea({nombre:"",responsable:"",supervisor:"",categoria:"Finanzas",frecuencia:"Semanal",dependeDe:"",fechaPuntual:""});setMostrarFormTarea(false);
  }

  const estadoGuardadoUI={idle:null,guardando:{icon:"💾",text:"Guardando..."},ok:{icon:"✅",text:"Guardado"},error:{icon:"❌",text:"Error"}}[guardado];
  const recsActivos=getRecordatoriosActivos(usuarioActual?.nombre||"",anio,mes,esAdmin(usuarioActual?.nombre||"")).filter(r=>!recsDone[recKey(r.id)]);

  function TablaFilas({tareas,getKey,getSemana}){
    const todas=tareas.filter(t=>!isBloqueada(t.id));
    const filtradas=filtroPersona?todas.filter(t=>t.responsable===filtroPersona||getSupervisor(t.id)===filtroPersona):todas;
    return filtradas.map((t,i)=>{
      const numSem=getSemana?getSemana():null;
      const frec=getFrecuencia(t.id);
      const key=(frec==="Mensual"||frec==="Diaria"||frec==="Quincenal"||frec==="Anual")?t.id:getKey(t);
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
      const diaLabel = (() => {
        if(frec === "Mensual") {
          const diaBase = getConfig(t.id).diaLimite || t.diaLimite;
          const fHabil = diaHabil(anio, mes, diaBase);
          const diaReal = fHabil.getDate();
          if(diaReal !== diaBase) return `día ${diaReal} (mov. del ${diaBase})`;
          return `día ${diaBase}`;
        }
        return `${DIAS_SEMANA[getConfig(t.id).diaLimiteSem??t.diaLimiteSem]}`;
      })();
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
              <div style={{fontSize:11,color:"#64748b",marginBottom:4}}>Email corporativo</div>
              <input type="email" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&document.getElementById("login-pin-input")?.focus()}
                placeholder="tu.nombre@grupomediterra.cl" autoComplete="email"
                style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,
                  outline:"none",boxSizing:"border-box"}}/>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,color:"#64748b",marginBottom:4}}>PIN de acceso</div>
              <input id="login-pin-input" type="password" value={loginPin} onChange={e=>setLoginPin(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="••••"
                style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:16,
                  textAlign:"center",letterSpacing:6,outline:"none",boxSizing:"border-box"}}/>
            </div>
            {loginError&&<div style={{color:"#ef4444",fontSize:12,marginBottom:10,textAlign:"center"}}>{loginError}</div>}
            <button onClick={handleLogin}
              style={{width:"100%",padding:"11px",borderRadius:8,background:"linear-gradient(135deg,#1e3a5f,#2563eb)",
                color:"#fff",border:"none",fontWeight:700,fontSize:14,cursor:"pointer"}}>
              Ingresar
            </button>
            <div style={{marginTop:16,textAlign:"center"}}>
              <button onClick={()=>setModalPin("reset")} style={{background:"none",border:"none",color:"#94a3b8",fontSize:12,cursor:"pointer"}}>
                ¿Olvidaste tu PIN?
              </button>
            </div>
            {modalPin==="reset"&&(
              <div style={{marginTop:16,background:"#f8fafc",borderRadius:10,padding:"14px 16px",border:"1px solid #e2e8f0"}}>
                <div style={{fontSize:12,fontWeight:700,color:"#1e293b",marginBottom:8}}>Recuperar PIN por email</div>
                <input type="email" value={resetEmail||loginEmail} onChange={e=>setResetEmail(e.target.value)}
                  placeholder="tu.nombre@grupomediterra.cl"
                  style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #d1d5db",
                    fontSize:13,marginBottom:8,outline:"none",boxSizing:"border-box"}}/>
                <button onClick={()=>handleResetPin()}
                  disabled={resetEnviando||!(resetEmail||loginEmail)}
                  style={{width:"100%",padding:"8px",borderRadius:8,
                    background:(resetEnviando||!(resetEmail||loginEmail))?"#94a3b8":"#2563eb",
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
        onLogout={doLogout}
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
        onLogout={doLogout}
        osirisData={osirisData}
        setOsirisData={setOsirisData}
      />
    </div>
  );

  if(moduloActivo==="allegria") return (
    <div style={{fontFamily:"sans-serif",background:"#0d1117",minHeight:"100vh"}}>
      <AllegriaModule
        usuarioActual={usuarioFresco}
        esAdmin={esAdmin}
        esSoloConsulta={esSoloConsulta}
        tabPermisos={getTabPermisosModulo(usuarioFresco,"allegria")}
        onBack={()=>setModuloActivo(null)}
        onLogout={doLogout}
      />
    </div>
  );

  if(moduloActivo==="tareas") {
    const modulosPermitidos = modulosDeUsuarioSeguro(usuarioFresco);
    const tabPermTareas = getTabPermisosModulo(usuarioFresco, "tareas");
    const puedeVerDiaria    = getTabPerm(usuarioFresco,"tareas","diaria")    !== "sin_acceso";
    const puedeVerSemanal   = getTabPerm(usuarioFresco,"tareas","semanal")   !== "sin_acceso";
    const puedeVerQuincenal = getTabPerm(usuarioFresco,"tareas","quincenal") !== "sin_acceso";
    const puedeVerMensual   = getTabPerm(usuarioFresco,"tareas","mensual")   !== "sin_acceso";
    const puedeVerAnual     = getTabPerm(usuarioFresco,"tareas","anual")     !== "sin_acceso";
    const puedeVerConfig    = getTabPerm(usuarioFresco,"tareas","config")    !== "sin_acceso";
    const puedeEditSemanal  = getTabPerm(usuarioFresco,"tareas","semanal")   === "editar";
    const puedeEditMensual  = getTabPerm(usuarioFresco,"tareas","mensual")   === "editar";
    const puedeEditConfig   = getTabPerm(usuarioFresco,"tareas","config")    === "editar";

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

        {/* ═══ Modal alertas tareas puntuales al ingresar ═══ */}
        {modalAlertasTareas&&(
          <div style={{position:"fixed",inset:0,background:"#000a",zIndex:350,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
            onClick={()=>setModalAlertasTareas(null)}>
            <div style={{background:"#fff",borderRadius:16,padding:0,width:"100%",maxWidth:600,
              boxShadow:"0 24px 64px #0005",maxHeight:"85vh",overflow:"hidden",display:"flex",flexDirection:"column"}}
              onClick={e=>e.stopPropagation()}>
              {/* Header */}
              <div style={{background:"linear-gradient(135deg,#1e3a5f,#0f2d4a)",padding:"18px 24px",
                display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:28}}>📌</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:16,fontWeight:800,color:"#fff"}}>Tareas Puntuales Próximas</div>
                  <div style={{fontSize:11,color:"#94a3b8"}}>
                    {modalAlertasTareas.tareas.filter(t=>t.vencida).length > 0
                      ? `⚠️ ${modalAlertasTareas.tareas.filter(t=>t.vencida).length} vencida(s) · ${modalAlertasTareas.tareas.filter(t=>!t.vencida).length} próxima(s)`
                      : `${modalAlertasTareas.tareas.length} tarea(s) en los próximos 30 días`}
                  </div>
                </div>
                <button onClick={()=>setModalAlertasTareas(null)}
                  style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:8,
                    padding:"6px 14px",cursor:"pointer",fontSize:12,fontWeight:600}}>
                  Cerrar ✕
                </button>
              </div>
              {/* Lista */}
              <div style={{overflowY:"auto",padding:"12px 16px",flex:1}}>
                {modalAlertasTareas.tareas.map((t,i)=>{
                  const cat = CATEGORIAS[t.categoria]||{color:"#64748b",bg:"#f1f5f9"};
                  return (
                    <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",
                      borderRadius:10,marginBottom:6,
                      background:t.vencida?"#fff5f5":t.hoy?"#fef3c7":t.diff<=7?"#fffbeb":"#f8fafc",
                      border:`1px solid ${t.vencida?"#fecaca":t.hoy?"#fde68a":t.diff<=7?"#fef3c7":"#e2e8f0"}`}}>
                      {/* Indicador */}
                      <div style={{width:40,height:40,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:18,flexShrink:0,
                        background:t.vencida?"#fee2e2":t.hoy?"#fef3c7":t.diff<=7?"#dbeafe":"#f1f5f9"}}>
                        {t.vencida?"⚠️":t.hoy?"🔴":t.diff<=7?"⏰":"📌"}
                      </div>
                      {/* Info */}
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:13,color:"#1e293b",marginBottom:2}}>{t.nombre}</div>
                        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                          <span style={{fontSize:10,color:"#64748b"}}>👤 {t.responsable}</span>
                          <span style={{fontSize:10,color:"#94a3b8"}}>🔍 {t.supervisor}</span>
                          <span style={{fontSize:9,background:cat.bg,color:cat.color,padding:"1px 6px",borderRadius:12,fontWeight:600}}>{t.categoria}</span>
                        </div>
                      </div>
                      {/* Fecha + días */}
                      <div style={{textAlign:"right",flexShrink:0}}>
                        <div style={{fontSize:12,fontWeight:700,color:t.vencida?"#dc2626":t.hoy?"#d97706":"#1e293b"}}>{t.fecha}</div>
                        <div style={{fontSize:11,fontWeight:600,marginTop:2,padding:"2px 8px",borderRadius:12,display:"inline-block",
                          background:t.vencida?"#dc2626":t.hoy?"#d97706":t.diff<=7?"#2563eb":"#64748b",
                          color:"#fff"}}>
                          {t.vencida?`Vencida ${Math.abs(t.diff)}d`:t.hoy?"HOY":`${t.diff}d`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Footer */}
              <div style={{padding:"12px 20px",borderTop:"1px solid #e2e8f0",textAlign:"center"}}>
                <button onClick={()=>{setModalAlertasTareas(null);setTab("puntual");}}
                  style={{padding:"8px 24px",borderRadius:8,background:"#2563eb",color:"#fff",
                    border:"none",cursor:"pointer",fontWeight:700,fontSize:13}}>
                  📌 Ver todas las tareas puntuales
                </button>
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

        {/* Header módulo Tareas — estilo breadcrumb unificado */}
        <div style={{background:"linear-gradient(135deg,#0f1e3a,#1e3a5f)",padding:"14px 24px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,borderRadius:"14px 14px 0 0",margin:"0 0 0 0"}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <div style={{display:"flex",alignItems:"center",gap:8,fontSize:13}}>
              <button onClick={()=>setModuloActivo(null)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.55)",cursor:"pointer",fontSize:13,fontWeight:500,padding:0}}>Mediterra</button>
              <span style={{color:"rgba(255,255,255,0.3)"}}>›</span>
              <span style={{color:"#fff",fontWeight:700,fontSize:14}}>Seguimiento de Tareas</span>
            </div>
            <div style={{borderLeft:"1px solid rgba(255,255,255,0.15)",paddingLeft:14}}>
              <img src="/med.png" alt="" style={{height:24,objectFit:"contain"}} onError={e=>{e.target.style.display="none";}}/>
            </div>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.45)"}}>{MESES[mes]} {anio}</div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            {estadoGuardadoUI&&<span style={{fontSize:11,color:"rgba(255,255,255,0.7)"}}>{estadoGuardadoUI.icon} {estadoGuardadoUI.text}</span>}
            {totalVencidas>0&&<button onClick={()=>setModalVencidas(true)} style={{background:"#ef4444",color:"#fff",borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:700,border:"none",cursor:"pointer"}}>⚠ {totalVencidas} vencidas</button>}
            <button onClick={doLogout} style={{background:"rgba(248,113,113,0.2)",border:"none",color:"#fca5a5",borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:12}}>Salir</button>
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
            {WORKERS.filter(w=>esAdmin(usuarioActual?.nombre)||w.nombre===usuarioActual?.nombre||(usuarioActual?.equipo||[]).includes(w.nombre)).map(w=><option key={w.nombre} value={w.nombre}>{w.nombre.split(" ")[0]}</option>)}
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
              {nuevaTarea.frecuencia==="Puntual"&&(
                <div>
                  <div style={{fontSize:10,color:"#64748b",marginBottom:2}}>Fecha límite</div>
                  <input type="date" value={nuevaTarea.fechaPuntual||""}
                    onChange={e=>setNuevaTarea(p=>({...p,fechaPuntual:e.target.value}))}
                    style={{padding:"6px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:12,outline:"none"}}/>
                </div>
              )}
              <div style={{alignSelf:"flex-end"}}>
                <button onClick={agregarTarea} style={{padding:"7px 18px",borderRadius:8,background:"#2563eb",color:"#fff",border:"none",cursor:"pointer",fontWeight:700,fontSize:13}}>
                  + Agregar
                </button>
              </div>
            </div>
          </div>
        )}


        {/* Tab navigation bar */}
        <div style={{background:"#fff",borderBottom:"1px solid #e2e8f0",padding:"0 24px",display:"flex",gap:0,overflowX:"auto"}}>
          {[
            {id:"diaria",    label:"📋 Diarias",    show:puedeVerDiaria},
            {id:"semanal",   label:"📅 Semanales",  show:puedeVerSemanal},
            {id:"quincenal", label:"🗓 Quincenales",show:puedeVerQuincenal},
            {id:"mensual",   label:"📆 Mensuales",  show:puedeVerMensual},
            {id:"puntual",   label:"📌 Puntuales",  show:true},
            {id:"anual",     label:"🗃 Anuales",    show:puedeVerAnual},
            {id:"config",    label:"⚙️ Config",    show:puedeVerConfig},
          ].filter(t=>t.show).map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{padding:"12px 18px",border:"none",borderBottom:`3px solid ${tab===t.id?"#2563eb":"transparent"}`,
                background:"transparent",cursor:"pointer",fontSize:12,fontWeight:tab===t.id?700:400,
                color:tab===t.id?"#2563eb":"#64748b",whiteSpace:"nowrap",transition:"all 0.15s"}}>
              {t.label}
            </button>
          ))}
        </div>

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
                          tareas={todasTareas().filter(t=>getFrecuencia(t.id)==="Semanal").sort((a,b)=>(tareasOverrides[a.id]?.diaLimiteSem??a.diaLimiteSem??0)-(tareasOverrides[b.id]?.diaLimiteSem??b.diaLimiteSem??0))}
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
                    tareas={todasTareas().filter(t=>getFrecuencia(t.id)==="Mensual").sort((a,b)=>(tareasOverrides[a.id]?.diaLimite??a.diaLimite??31)-(tareasOverrides[b.id]?.diaLimite??b.diaLimite??31))}
                    getKey={t=>t.id}
                    getSemana={()=>null}
                  />
                </tbody>
              </table>
            </div>
          )}

          {(!puedeVerSemanal&&tab==="semanal"||!puedeVerDiaria&&tab==="diaria"||!puedeVerQuincenal&&tab==="quincenal"||!puedeVerAnual&&tab==="anual")&&(
            <div style={{textAlign:"center",padding:40,color:"#94a3b8",fontSize:14}}>🚫 No tienes acceso a la vista semanal.</div>
          )}
          {!puedeVerMensual&&tab==="mensual"&&(
            <div style={{textAlign:"center",padding:40,color:"#94a3b8",fontSize:14}}>🚫 No tienes acceso a la vista mensual.</div>
          )}

          {/* TAREAS PUNTUALES */}
          {tab==="puntual"&&(
            <div>
              <div style={{marginBottom:16,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <h3 style={{margin:0,fontSize:15,color:"#1e293b"}}>📌 Tareas Puntuales</h3>
                <span style={{fontSize:11,color:"#64748b"}}>Tareas con fecha específica · Alerta 30 días antes</span>
              </div>
              {(()=>{
                const puntuales = todasTareas().filter(t=>getFrecuencia(t.id)==="Puntual"&&!isBloqueada(t.id));
                const hoyD = new Date(); hoyD.setHours(0,0,0,0);
                // Ordenar por fecha
                const sorted = [...puntuales].sort((a,b)=>{
                  const fa = getConfig(a.id).fechaPuntual||a.fechaPuntual||"9999";
                  const fb = getConfig(b.id).fechaPuntual||b.fechaPuntual||"9999";
                  return fa.localeCompare(fb);
                });
                if(sorted.length===0) return (
                  <div style={{textAlign:"center",padding:40,color:"#94a3b8",fontSize:13}}>
                    No hay tareas puntuales programadas. Usa el botón "+ Agregar tarea" en la pestaña Config para crear una con frecuencia "Puntual".
                  </div>
                );
                return (
                  <div style={{overflowX:"auto",borderRadius:12,boxShadow:"0 1px 4px #0001"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",background:"#fff"}}>
                      <thead>
                        <tr style={{background:"#f8fafc",borderBottom:"2px solid #e2e8f0"}}>
                          <th style={{padding:"10px 14px",textAlign:"left",fontSize:11,color:"#475569",fontWeight:700}}>Tarea</th>
                          <th style={{padding:"10px 14px",textAlign:"left",fontSize:11,color:"#475569",fontWeight:700}}>Responsable</th>
                          <th style={{padding:"10px 14px",textAlign:"left",fontSize:11,color:"#475569",fontWeight:700}}>Supervisor</th>
                          <th style={{padding:"10px 14px",textAlign:"center",fontSize:11,color:"#475569",fontWeight:700}}>Fecha</th>
                          <th style={{padding:"10px 14px",textAlign:"center",fontSize:11,color:"#475569",fontWeight:700}}>Días restantes</th>
                          <th style={{padding:"10px 14px",textAlign:"center",fontSize:11,color:"#475569",fontWeight:700}}>Estado</th>
                          <th style={{padding:"10px 14px",textAlign:"center",fontSize:11,color:"#475569",fontWeight:700}}>Supervisor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map((t,i)=>{
                          const key = t.id;
                          const est = estados[key]||{estadoResp:"gris",estadoSup:"gris"};
                          const fp = getConfig(t.id).fechaPuntual || t.fechaPuntual || "";
                          const fechaObj = fp ? new Date(fp+"T00:00:00") : null;
                          const diff = fechaObj ? Math.ceil((fechaObj - hoyD)/(1000*60*60*24)) : null;
                          const vencida = diff !== null && diff < 0 && est.estadoResp !== "verde" && est.estadoResp !== "na";
                          const proxima = diff !== null && diff >= 0 && diff <= 30 && est.estadoResp !== "verde" && est.estadoResp !== "na";
                          const completada = est.estadoResp === "verde";
                          const semResp = SEMAFORO[est.estadoResp]||SEMAFORO.gris;
                          const sup = getSupervisor(t.id);
                          const supActivo = est.estadoResp==="verde" && sup;
                          const semSup = SEMAFORO[supActivo?est.estadoSup:"gris"];
                          const puedeResp = puedeEditar(t,true);
                          const puedeSup = puedeEditar(t,false);
                          const cat = CATEGORIAS[t.categoria]||{color:"#64748b",bg:"#f1f5f9"};
                          return (
                            <tr key={key} style={{borderBottom:"1px solid #f1f5f9",
                              background:completada?"#f0fdf4":vencida?"#fff5f5":proxima?"#fffbeb":i%2===0?"#fff":"#f8fafc"}}>
                              <td style={{padding:"10px 14px"}}>
                                <div style={{fontWeight:600,fontSize:12,color:"#1e293b"}}>{t.nombre}</div>
                                <div style={{display:"flex",gap:6,marginTop:4}}>
                                  <span style={{fontSize:9,background:cat.bg,color:cat.color,padding:"1px 8px",borderRadius:20,fontWeight:600}}>{t.categoria}</span>
                                </div>
                              </td>
                              <td style={{padding:"10px 14px",fontSize:12,color:"#475569"}}>{t.responsable}</td>
                              <td style={{padding:"10px 14px",fontSize:12,color:"#475569"}}>{sup||"—"}</td>
                              <td style={{padding:"10px 14px",textAlign:"center",fontSize:12,fontWeight:600,
                                color:vencida?"#dc2626":proxima?"#d97706":"#1e293b"}}>
                                {fechaObj ? fechaObj.toLocaleDateString("es-CL",{day:"2-digit",month:"short",year:"numeric"}) : "—"}
                              </td>
                              <td style={{padding:"10px 14px",textAlign:"center"}}>
                                {diff !== null ? (
                                  <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,
                                    background:completada?"#dcfce7":vencida?"#fee2e2":proxima&&diff<=7?"#fef3c7":proxima?"#dbeafe":"#f1f5f9",
                                    color:completada?"#16a34a":vencida?"#dc2626":proxima&&diff<=7?"#d97706":proxima?"#2563eb":"#64748b"}}>
                                    {completada?"✅ Completada":vencida?`⚠️ Vencida ${Math.abs(diff)}d`:diff===0?"🔴 Hoy":`${diff}d`}
                                  </span>
                                ) : "—"}
                              </td>
                              <td style={{padding:"10px 14px",textAlign:"center"}}>
                                <div onClick={()=>puedeResp&&ciclarResp(key,t,null)}
                                  style={{width:28,height:28,borderRadius:"50%",background:semResp.bg,border:`2px solid ${semResp.border}`,
                                    display:"inline-flex",alignItems:"center",justifyContent:"center",cursor:puedeResp?"pointer":"default",
                                    transition:"all 0.15s"}}>
                                  <div style={{width:14,height:14,borderRadius:"50%",background:semResp.color}}/>
                                </div>
                              </td>
                              <td style={{padding:"10px 14px",textAlign:"center"}}>
                                {sup ? (
                                  <div onClick={()=>puedeSup&&supActivo&&ciclarSup(key,t)}
                                    style={{width:28,height:28,borderRadius:"50%",background:semSup.bg,border:`2px solid ${semSup.border}`,
                                      display:"inline-flex",alignItems:"center",justifyContent:"center",
                                      cursor:puedeSup&&supActivo?"pointer":"default",opacity:supActivo?1:0.3,
                                      transition:"all 0.15s"}}>
                                    <div style={{width:14,height:14,borderRadius:"50%",background:semSup.color}}/>
                                  </div>
                                ) : <span style={{color:"#cbd5e1"}}>—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}

          {tab==="diaria"&&puedeVerDiaria&&(
            <div style={{overflowX:"auto",borderRadius:12,boxShadow:"0 1px 4px #0001"}}>
              <table style={{width:"100%",borderCollapse:"collapse",background:"#fff"}}>
                {encabezadoTabla}
                <tbody>
                  <TablaFilas
                    tareas={todasTareas().filter(t=>getFrecuencia(t.id)==="Diaria")}
                    getKey={t=>t.id}
                    getSemana={()=>null}
                  />
                </tbody>
              </table>
            </div>
          )}

          {tab==="quincenal"&&puedeVerQuincenal&&(
            <div style={{overflowX:"auto",borderRadius:12,boxShadow:"0 1px 4px #0001"}}>
              <table style={{width:"100%",borderCollapse:"collapse",background:"#fff"}}>
                {encabezadoTabla}
                <tbody>
                  <TablaFilas
                    tareas={todasTareas().filter(t=>getFrecuencia(t.id)==="Quincenal")}
                    getKey={t=>t.id}
                    getSemana={()=>null}
                  />
                </tbody>
              </table>
            </div>
          )}

          {tab==="anual"&&puedeVerAnual&&(
            <div style={{overflowX:"auto",borderRadius:12,boxShadow:"0 1px 4px #0001"}}>
              <table style={{width:"100%",borderCollapse:"collapse",background:"#fff"}}>
                {encabezadoTabla}
                <tbody>
                  <TablaFilas
                    tareas={todasTareas().filter(t=>getFrecuencia(t.id)==="Anual")}
                    getKey={t=>t.id}
                    getSemana={()=>null}
                  />
                </tbody>
              </table>
            </div>
          )}

          {tab==="config"&&puedeVerConfig&&(
            <ConfigTab
              todasTareas={todasTareas}
              getFrecuencia={getFrecuencia}
              WORKERS={WORKERS}
              CATEGORIAS={CATEGORIAS}
              FRECUENCIAS={FRECUENCIAS}
              editandoTarea={editandoTarea}
              setEditandoTarea={setEditandoTarea}
              formEditTarea={formEditTarea}
              setFormEditTarea={setFormEditTarea}
              tareasOverrides={tareasOverrides}
              setTareasOverrides={setTareasOverrides}
              setTareasConfig={setTareasConfig}
              guardarAhora={guardarAhora}
              puedeEditConfig={puedeEditConfig}
            />
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
      onLogout={doLogout}
      onCambiarPin={()=>setModalPin("cambiar")}
      esSoloConsulta={esSoloConsulta}
      usuarios={usuarios}
      setUsuarios={setUsuarios}
    />
  );
}
