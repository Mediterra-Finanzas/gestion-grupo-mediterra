import { useState, useEffect, useCallback, useRef } from "react";

const EMAILJS_SERVICE  = "service_ahuerta";
const EMAILJS_TEMPLATE = "template_c7yup8d";
const EMAILJS_KEY      = "bwCBq7JXlEwCTzWNe";

const FECHA_INICIO = new Date(2026, 3, 13); // 13 abril 2026

async function enviarPinTemporal(worker, pin) {
  await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({service_id:EMAILJS_SERVICE,template_id:EMAILJS_TEMPLATE,user_id:EMAILJS_KEY,
      template_params:{nombre:worker.nombre,pin_temporal:pin,to_email:worker.email}})
  });
}

const DIAS_SEMANA = ["Lunes","Martes","Miercoles","Jueves","Viernes"];
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function diaHabil(anio,mes,dia){
  const f=new Date(anio,mes,dia);const d=f.getDay();
  if(d===6)f.setDate(f.getDate()+2);if(d===0)f.setDate(f.getDate()+1);return f;
}

function mesAnteriorAlInicio(anio,mes){
  return new Date(anio,mes,1)<new Date(FECHA_INICIO.getFullYear(),FECHA_INICIO.getMonth(),1);
}

const RECORDATORIOS=[
  {id:"rec1",titulo:"Emision Factura Corporativo",diaMes:4,
    destinatarios:["Milagros Becerra"],copia:["Carol Machuca"],
    mensaje:(n)=>`Estimada ${n.split(" ")[0]}, te recordamos que el dia 4 de este mes corresponde emitir la factura de servicios Corporativo. Por favor asegurate de tener listos los antecedentes necesarios para su emision oportuna.`},
  {id:"rec2",titulo:"Emision Factura Frisku",diaMes:25,
    destinatarios:["Milagros Becerra"],copia:["Carol Machuca"],
    mensaje:(n)=>`Estimada ${n.split(" ")[0]}, te recordamos que el dia 25 de este mes corresponde emitir la factura de servicios Frisku. Por favor verifica que los documentos de respaldo esten en orden antes de proceder.`},
];

function getRecordatoriosActivos(nombre,anio,mes,esCFO){
  const hoy=new Date();hoy.setHours(0,0,0,0);
  return RECORDATORIOS
    .filter(r=>r.destinatarios.includes(nombre)||r.copia.includes(nombre)||esCFO)
    .map(r=>{const fv=diaHabil(anio,mes,r.diaMes);const fa=new Date(fv);fa.setDate(fv.getDate()-2);const diff=Math.ceil((fv-hoy)/(1000*60*60*24));return{...r,fechaVence:fv,diff,activo:hoy>=fa};})
    .filter(r=>r.activo);
}

const SEMAFORO={
  verde:   {label:"Completado",color:"#22c55e",bg:"#dcfce7",border:"#86efac"},
  amarillo:{label:"En proceso",color:"#eab308",bg:"#fef9c3",border:"#fde047"},
  rojo:    {label:"Pendiente", color:"#ef4444",bg:"#fee2e2",border:"#fca5a5"},
  gris:    {label:"Sin iniciar",color:"#9ca3af",bg:"#f3f4f6",border:"#d1d5db"},
};

const WORKERS=[
  {nombre:"Milagros Becerra",cargo:"Sec. Administrativa",      email:"Mbecerra@grupomediterra.cl",pin:"4827",esCFO:false},
  {nombre:"Carol Machuca",   cargo:"Analista Finanzas",        email:"cmachuca@grupomediterra.cl",pin:"3159",esCFO:false},
  {nombre:"Michelle Garcia", cargo:"Contadora General",        email:"mgarcia@grupomediterra.cl", pin:"7413",esCFO:false},
  {nombre:"Pablo Duran",     cargo:"Asistente Contable",       email:"pduran@grupomediterra.cl",  pin:"2986",esCFO:false},
  {nombre:"Angelo Huerta",   cargo:"Gerencia Adm. y Finanzas", email:"ahuerta@grupomediterra.cl", pin:"6054",esCFO:true},
];

const CATEGORIAS={
  "Finanzas":      {color:"#3b82f6",bg:"#dbeafe"},
  "Contabilidad":  {color:"#8b5cf6",bg:"#ede9fe"},
  "Tesoreria":     {color:"#f59e0b",bg:"#fef3c7"},
  "Tributario":    {color:"#ef4444",bg:"#fee2e2"},
  "Administracion":{color:"#10b981",bg:"#d1fae5"},
  "Gerencia":      {color:"#6366f1",bg:"#e0e7ff"},
};

// dependeDe: id tarea que debe estar en verde (estadoResp) para desbloquear esta
const TAREAS_SEMANALES=[
  {id:"s1", nombre:"Gestion documental",                                   responsable:"Milagros Becerra",supervisor:"Angelo Huerta",  categoria:"Administracion",diaLimiteSem:4,dependeDe:null},
  {id:"s2", nombre:"Preparacion de nominas de pago",                       responsable:"Milagros Becerra",supervisor:"Carol Machuca",  categoria:"Tesoreria",     diaLimiteSem:1,dependeDe:null},
  {id:"s3", nombre:"Entrega nominas de pago para revision",                responsable:"Milagros Becerra",supervisor:"Angelo Huerta",  categoria:"Tesoreria",     diaLimiteSem:2,dependeDe:null},
  {id:"s4", nombre:"Carga nominas al banco y envio email para aprobacion", responsable:"Milagros Becerra",supervisor:"Angelo Huerta",  categoria:"Tesoreria",     diaLimiteSem:3,dependeDe:null},
  {id:"s5", nombre:"Seguimiento documentos",                               responsable:"Milagros Becerra",supervisor:"",               categoria:"Administracion",diaLimiteSem:4,dependeDe:null},
  {id:"s6", nombre:"Envio nominas a contabilidad para registros",          responsable:"Milagros Becerra",supervisor:"Pablo Duran",    categoria:"Contabilidad",  diaLimiteSem:3,dependeDe:null},
  {id:"s7", nombre:"Registro documentos mercantiles",                      responsable:"Milagros Becerra",supervisor:"",               categoria:"Administracion",diaLimiteSem:0,dependeDe:null},
  {id:"s8", nombre:"Revision gastos menores y respaldos",                  responsable:"Milagros Becerra",supervisor:"Carol Machuca",  categoria:"Tesoreria",     diaLimiteSem:2,dependeDe:null},
  {id:"s9", nombre:"Envio de email a Daniel",                              responsable:"Milagros Becerra",supervisor:"",               categoria:"Administracion",diaLimiteSem:0,dependeDe:null},
  {id:"s10",nombre:"Gestion con bancos por compra venta de divisas",       responsable:"Milagros Becerra",supervisor:"Angelo Huerta",  categoria:"Tesoreria",     diaLimiteSem:2,dependeDe:null},
  {id:"s11",nombre:"Email solicitud anticipo sueldo Allpa y Allegria",     responsable:"Milagros Becerra",supervisor:"Angelo Huerta",  categoria:"Administracion",diaLimiteSem:1,dependeDe:null},
  {id:"s12",nombre:"Tareas de apoyo a Gerencia (reuniones, etc)",          responsable:"Milagros Becerra",supervisor:"Angelo Huerta",  categoria:"Gerencia",      diaLimiteSem:4,dependeDe:null},
  {id:"s13",nombre:"Cobranza de empresas",                                 responsable:"Carol Machuca",   supervisor:"Angelo Huerta",  categoria:"Finanzas",      diaLimiteSem:0,dependeDe:null},
  {id:"s14",nombre:"Primera Revision nominas de pago",                     responsable:"Carol Machuca",   supervisor:"",               categoria:"Tesoreria",     diaLimiteSem:1,dependeDe:"s2"},
  {id:"s15",nombre:"Registro contable",                                    responsable:"Michelle Garcia", supervisor:"Angelo Huerta",  categoria:"Contabilidad",  diaLimiteSem:2,dependeDe:null},
  {id:"s16",nombre:"Conciliaciones",                                       responsable:"Michelle Garcia", supervisor:"Angelo Huerta",  categoria:"Contabilidad",  diaLimiteSem:3,dependeDe:null},
  {id:"s17",nombre:"Ingreso movimientos bancarios",                        responsable:"Pablo Duran",     supervisor:"Michelle Garcia",categoria:"Contabilidad",  diaLimiteSem:0,dependeDe:null},
  {id:"s18",nombre:"Registro pagos de nominas",                            responsable:"Pablo Duran",     supervisor:"Michelle Garcia",categoria:"Contabilidad",  diaLimiteSem:3,dependeDe:"s6"},
];

const TAREAS_MENSUALES=[
  {id:"m1", nombre:"EERR real vs presupuesto + analisis de variaciones",   responsable:"Carol Machuca",   supervisor:"Angelo Huerta",  categoria:"Finanzas",     diaLimite:18,dependeDe:"m11"},
  {id:"m2", nombre:"Identificacion de riesgos financieros y operacionales",responsable:"Carol Machuca",   supervisor:"Angelo Huerta",  categoria:"Finanzas",     diaLimite:20,dependeDe:null},
  {id:"m3", nombre:"Preparacion planillas anticipo clientes",              responsable:"Carol Machuca",   supervisor:"Angelo Huerta",  categoria:"Finanzas",     diaLimite:5, dependeDe:null},
  {id:"m4", nombre:"Preparacion planillas anticipo productores",           responsable:"Carol Machuca",   supervisor:"Angelo Huerta",  categoria:"Finanzas",     diaLimite:5, dependeDe:null},
  {id:"m5", nombre:"Chequeo contratos firmados y cargados en nube",        responsable:"Carol Machuca",   supervisor:"Angelo Huerta",  categoria:"Administracion",diaLimite:10,dependeDe:null},
  {id:"m6", nombre:"Revision de proveedores masivo",                       responsable:"Carol Machuca",   supervisor:"",               categoria:"Finanzas",     diaLimite:10,dependeDe:null},
  {id:"m7", nombre:"Primera Revision nominas de pago Chile",               responsable:"Carol Machuca",   supervisor:"",               categoria:"Tesoreria",    diaLimite:5, dependeDe:null},
  {id:"m8", nombre:"Primera Revision nominas de pago Peru",                responsable:"Carol Machuca",   supervisor:"",               categoria:"Tesoreria",    diaLimite:5, dependeDe:null},
  {id:"m9", nombre:"Retroalimentacion con Gerentes por desviaciones",      responsable:"Carol Machuca",   supervisor:"Angelo Huerta",  categoria:"Finanzas",     diaLimite:22,dependeDe:"m1"},
  {id:"m10",nombre:"Analisis de cuenta",                                   responsable:"Michelle Garcia", supervisor:"Angelo Huerta",  categoria:"Contabilidad", diaLimite:10,dependeDe:null},
  {id:"m11",nombre:"Entrega Final Estados Financieros",                    responsable:"Michelle Garcia", supervisor:"Angelo Huerta",  categoria:"Contabilidad", diaLimite:15,dependeDe:"m12"},
  {id:"m12",nombre:"Preparacion estados financieros grupo",                responsable:"Michelle Garcia", supervisor:"Angelo Huerta",  categoria:"Contabilidad", diaLimite:13,dependeDe:"m13"},
  {id:"m13",nombre:"Cierre contable",                                      responsable:"Michelle Garcia", supervisor:"Angelo Huerta",  categoria:"Contabilidad", diaLimite:10,dependeDe:null},
  {id:"m14",nombre:"Formulario 29",                                        responsable:"Michelle Garcia", supervisor:"Angelo Huerta",  categoria:"Tributario",   diaLimite:12,dependeDe:null},
  {id:"m15",nombre:"Formulario 50",                                        responsable:"Michelle Garcia", supervisor:"Angelo Huerta",  categoria:"Tributario",   diaLimite:12,dependeDe:null},
  {id:"m16",nombre:"Analisis registros contables",                         responsable:"Michelle Garcia", supervisor:"Angelo Huerta",  categoria:"Contabilidad", diaLimite:15,dependeDe:null},
  {id:"m17",nombre:"Pago Formulario 29",                                   responsable:"Angelo Huerta",   supervisor:"",               categoria:"Tributario",   diaLimite:20,dependeDe:"m14"},
  {id:"m18",nombre:"Pago Formulario 50",                                   responsable:"Angelo Huerta",   supervisor:"",               categoria:"Tributario",   diaLimite:20,dependeDe:"m15"},
  {id:"m19",nombre:"Analisis de cuenta",                                   responsable:"Pablo Duran",     supervisor:"Michelle Garcia",categoria:"Contabilidad", diaLimite:8, dependeDe:null},
  {id:"m20",nombre:"Apoyo cierre",                                         responsable:"Pablo Duran",     supervisor:"Michelle Garcia",categoria:"Contabilidad", diaLimite:10,dependeDe:null},
];

const STORAGE_KEY="calendario_v8";

function semanasDelMes(anio,mes){
  const semanas=[];const primerDia=new Date(anio,mes,1);const ultimoDia=new Date(anio,mes+1,0);
  let fecha=new Date(primerDia);const dow=(fecha.getDay()+6)%7;fecha.setDate(fecha.getDate()-dow);
  while(fecha<=ultimoDia){
    const tmp=new Date(fecha);tmp.setDate(tmp.getDate()+3);
    const w1=new Date(tmp.getFullYear(),0,4);
    const iso=1+Math.round(((tmp-w1)/86400000-3+((w1.getDay()+6)%7))/7);
    const fin=new Date(fecha);fin.setDate(fecha.getDate()+6);
    if(fecha.getMonth()===mes||fin.getMonth()===mes)semanas.push({num:semanas.length+1,iso,inicioSem:new Date(fecha)});
    fecha.setDate(fecha.getDate()+7);
  }
  return semanas;
}

function fechaDiaSemana(inicioSemana,diaSem){const f=new Date(inicioSemana);f.setDate(inicioSemana.getDate()+diaSem);return f;}

function initEstados(semanas){
  const est={};
  semanas.forEach(s=>TAREAS_SEMANALES.forEach(t=>{est[`${t.id}_s${s.num}`]={estadoResp:"gris",estadoSup:"gris",aprobado:false};}));
  TAREAS_MENSUALES.forEach(t=>{est[t.id]={estadoResp:"gris",estadoSup:"gris",aprobado:false};});
  return est;
}
function initConfigSemanal(){const d={};TAREAS_SEMANALES.forEach(t=>{d[t.id]=t.diaLimiteSem;});return d;}
function initDiasLimite(){const d={};TAREAS_MENSUALES.forEach(t=>{d[t.id]=t.diaLimite;});return d;}
function initSupervisores(){const d={};[...TAREAS_SEMANALES,...TAREAS_MENSUALES].forEach(t=>{d[t.id]=t.supervisor||"";});return d;}

function semanaActivaDefault(semanas){
  const hoy=new Date();hoy.setHours(0,0,0,0);
  for(const s of semanas){const fin=new Date(s.inicioSem);fin.setDate(s.inicioSem.getDate()+6);if(hoy>=s.inicioSem&&hoy<=fin)return s.num;}
  return semanas[0]?.num||1;
}

export default function App(){
  const hoy=new Date();
  const [usuarioActual,setUsuarioActual]=useState(null);
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
  const pinsTempRef=useRef({});
  const [mes,setMes]=useState(hoy.getMonth());
  const [anio,setAnio]=useState(hoy.getFullYear());
  const semanas=semanasDelMes(anio,mes);
  const [estados,setEstados]=useState(()=>initEstados(semanas));
  const [comentarios,setComentarios]=useState({});
  const [configSemanal,setConfigSemanal]=useState(initConfigSemanal);
  const [diasLimite,setDiasLimite]=useState(initDiasLimite);
  const [supervisores,setSupervisores]=useState(initSupervisores);
  const [tab,setTab]=useState("semanal");
  const [semanaActiva,setSemanaActiva]=useState(()=>semanaActivaDefault(semanas));
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

  function recKey(id){return `${id}_${mes}_${anio}`;}

  useEffect(()=>{
    const s=semanasDelMes(anio,mes);
    setSemanaActiva(semanaActivaDefault(s));
    setEstados(prev=>{
      const n={...prev};
      s.forEach(sw=>TAREAS_SEMANALES.forEach(t=>{const k=`${t.id}_s${sw.num}`;if(!n[k])n[k]={estadoResp:"gris",estadoSup:"gris",aprobado:false};}));
      return n;
    });
  },[mes,anio]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(()=>{
    try{
      const raw=localStorage.getItem(STORAGE_KEY);
      if(raw){
        const d=JSON.parse(raw);
        if(d.estados)            setEstados(prev=>({...initEstados(semanasDelMes(d.mes??hoy.getMonth(), d.anio??hoy.getFullYear())),...d.estados}));
        if(d.comentarios)        setComentarios(d.comentarios);
        if(d.configSemanal)      setConfigSemanal(prev=>({...prev,...d.configSemanal}));
        if(d.diasLimite)         setDiasLimite(prev=>({...prev,...d.diasLimite}));
        if(d.supervisores)       setSupervisores(prev=>({...prev,...d.supervisores}));
        if(d.pinsPersonalizados) setPinsPersonalizados(d.pinsPersonalizados);
        if(d.recsDone)           setRecsDone(d.recsDone);
        if(d.recsComentarios)    setRecsComentarios(d.recsComentarios);
        if(d.mes!==undefined)    setMes(d.mes);
        if(d.anio!==undefined)   setAnio(d.anio);
      }
    }catch{}
    setCargando(false);
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const guardar=useCallback((est,com,cs,dl,sup,pins,rd,rc,m,a)=>{
    setGuardado("guardando");
    try{
      localStorage.setItem(STORAGE_KEY,JSON.stringify({estados:est,comentarios:com,configSemanal:cs,diasLimite:dl,supervisores:sup,pinsPersonalizados:pins,recsDone:rd,recsComentarios:rc,mes:m,anio:a}));
      setGuardado("ok");setTimeout(()=>setGuardado("idle"),2000);
    }catch{setGuardado("error");setTimeout(()=>setGuardado("idle"),3000);}
  },[]);

  useEffect(()=>{
    if(cargando)return;
    const t=setTimeout(()=>guardar(estados,comentarios,configSemanal,diasLimite,supervisores,pinsPersonalizados,recsDone,recsComentarios,mes,anio),800);
    return()=>clearTimeout(t);
  },[estados,comentarios,configSemanal,diasLimite,supervisores,pinsPersonalizados,recsDone,recsComentarios,mes,anio,cargando,guardar]);

  function getPinActivo(w){return pinsPersonalizados[w.nombre]||w.pin;}
  function getSupervisor(id){return supervisores[id]??"";}

  // Verifica si la tarea dependiente esta completada
  function dependenciaOk(tarea,numSemana){
    if(!tarea.dependeDe)return true;
    const depId=tarea.dependeDe;
    // buscar en semanales
    const depSem=TAREAS_SEMANALES.find(t=>t.id===depId);
    if(depSem){
      const key=`${depId}_s${numSemana}`;
      return(estados[key]?.estadoResp||"gris")==="verde";
    }
    // buscar en mensuales
    return(estados[depId]?.estadoResp||"gris")==="verde";
  }

  function getNombreDependencia(tarea){
    if(!tarea.dependeDe)return null;
    const dep=[...TAREAS_SEMANALES,...TAREAS_MENSUALES].find(t=>t.id===tarea.dependeDe);
    return dep?dep.nombre:null;
  }

  function handleLogin(){
    const w=WORKERS.find(x=>x.nombre===loginNombre);
    if(!w){setLoginError("Selecciona tu nombre.");return;}
    const pinTemp=pinsTempRef.current[w.nombre];
    const pinOk=getPinActivo(w);
    if(loginPin.trim()===pinOk||(pinTemp&&loginPin.trim()===pinTemp)){
      if(pinTemp&&loginPin.trim()===pinTemp){delete pinsTempRef.current[w.nombre];setModalPin("cambiar");}
      setUsuarioActual(w);setLoginError("");
    }else{setLoginError("PIN incorrecto. Intenta nuevamente.");}
  }

  async function handleResetPin(){
    const w=WORKERS.find(x=>x.nombre===resetNombre);
    if(!w){setResetMsg("Selecciona tu nombre.");return;}
    setResetEnviando(true);
    const temporal=String(Math.floor(1000+Math.random()*9000));
    pinsTempRef.current[w.nombre]=temporal;
    try{await enviarPinTemporal(w,temporal);setResetMsg("PIN temporal enviado a "+w.email);}
    catch{setResetMsg("Error al enviar. Intenta nuevamente.");}
    setResetEnviando(false);
  }

  function handleCambiarPin(){
    setPinError("");
    const pinOk=getPinActivo(usuarioActual);
    const pinTemp=pinsTempRef.current[usuarioActual?.nombre];
    if(pinActual!==pinOk&&pinActual!==pinTemp){setPinError("PIN actual incorrecto.");return;}
    if(pinNuevo.length<4){setPinError("El PIN debe tener al menos 4 digitos.");return;}
    if(pinNuevo!==pinConfirm){setPinError("Los PINs no coinciden.");return;}
    setPinsPersonalizados(prev=>({...prev,[usuarioActual.nombre]:pinNuevo}));
    setPinActual("");setPinNuevo("");setPinConfirm("");setModalPin(null);
    alert("PIN cambiado exitosamente!");
  }

  function puedeEditar(tarea,esResp){
    if(!usuarioActual)return false;
    if(usuarioActual.esCFO)return true;
    const sup=getSupervisor(tarea.id);
    return esResp?tarea.responsable===usuarioActual.nombre:sup===usuarioActual.nombre;
  }

  function ciclarResp(key,tarea,numSemana){
    if(!puedeEditar(tarea,true))return;
    if(!dependenciaOk(tarea,numSemana)){alert(`Esta tarea depende de:\n"${getNombreDependencia(tarea)}"\nCompleta esa tarea primero.`);return;}
    setEstados(prev=>{
      const actual=prev[key]?.estadoResp||"gris";
      const sig=["gris","verde","amarillo","rojo"][(["gris","verde","amarillo","rojo"].indexOf(actual)+1)%4];
      return{...prev,[key]:{...prev[key],estadoResp:sig,aprobado:false,estadoSup:sig!=="verde"?"gris":prev[key].estadoSup}};
    });
  }

  function ciclarSup(key,tarea){
    if(!puedeEditar(tarea,false))return;
    setEstados(prev=>{
      if(prev[key]?.estadoResp!=="verde")return prev;
      const actual=prev[key]?.estadoSup||"gris";
      const sig=["gris","verde","amarillo","rojo"][(["gris","verde","amarillo","rojo"].indexOf(actual)+1)%4];
      return{...prev,[key]:{...prev[key],estadoSup:sig,aprobado:sig==="verde"}};
    });
  }

  function guardarComentario(){setComentarios(prev=>({...prev,[editComentario]:textoComentario}));setEditComentario(null);}

  function estaVencidaSem(tarea,key,numSemana){
    const hoyD=new Date();hoyD.setHours(0,0,0,0);
    const sw=semanas.find(s=>s.num===numSemana)||semanas[0];
    const ds=configSemanal[tarea.id]??tarea.diaLimiteSem;
    return hoyD>fechaDiaSemana(sw.inicioSem,ds)&&(estados[key]?.estadoResp||"gris")==="gris";
  }
  function estaProximaSem(tarea,key,numSemana){
    const hoyD=new Date();hoyD.setHours(0,0,0,0);
    const sw=semanas.find(s=>s.num===numSemana)||semanas[0];
    const ds=configSemanal[tarea.id]??tarea.diaLimiteSem;
    const diff=(fechaDiaSemana(sw.inicioSem,ds)-hoyD)/(1000*60*60*24);
    return diff>=0&&diff<=2&&(estados[key]?.estadoResp||"gris")==="gris";
  }
  function estaVencidaMen(tarea,key){
    const hoyD=new Date();hoyD.setHours(0,0,0,0);
    return hoyD>new Date(anio,mes,diasLimite[tarea.id]||tarea.diaLimite)&&(estados[key]?.estadoResp||"gris")==="gris";
  }
  function estaProximaMen(tarea,key){
    const hoyD=new Date();hoyD.setHours(0,0,0,0);
    const diff=(new Date(anio,mes,diasLimite[tarea.id]||tarea.diaLimite)-hoyD)/(1000*60*60*24);
    return diff>=0&&diff<=2&&(estados[key]?.estadoResp||"gris")==="gris";
  }

  function generarResumenEmail(){
    const res={};WORKERS.forEach(w=>{res[w.nombre]=[];});
    semanas.forEach(s=>{TAREAS_SEMANALES.forEach(t=>{const key=`${t.id}_s${s.num}`;if(estaVencidaSem(t,key,s.num))res[t.responsable]?.push({...t,key});});});
    TAREAS_MENSUALES.forEach(t=>{if(estaVencidaMen(t,t.id))res[t.responsable]?.push({...t,key:t.id});});
    return res;
  }

  function enviarEmailPersona(w,tareas){
    const asunto=encodeURIComponent(`Tareas pendientes - ${MESES[mes]} ${anio}`);
    const cuerpo=encodeURIComponent(`Hola ${w.nombre.split(" ")[0]},\n\nLas siguientes tareas estan vencidas:\n\n`+tareas.map(t=>`- ${t.nombre}`).join('\n')+`\n\nActualiza en: https://calendario-mediterra-2026.vercel.app\n\nSaludos`);
    window.open(`mailto:${w.email}?subject=${asunto}&body=${cuerpo}`);
  }

  const totalVencidas=(()=>{
    let c=0;
    semanas.forEach(s=>TAREAS_SEMANALES.forEach(t=>{if(estaVencidaSem(t,`${t.id}_s${s.num}`,s.num))c++;}));
    TAREAS_MENSUALES.forEach(t=>{if(estaVencidaMen(t,t.id))c++;});
    return c;
  })();

  function resumen(nombre){
    let v=0,a=0,r=0,g=0,total=0;
    semanas.forEach(s=>{TAREAS_SEMANALES.forEach(t=>{if(t.responsable===nombre||getSupervisor(t.id)===nombre){const e=(t.responsable===nombre?estados[`${t.id}_s${s.num}`]?.estadoResp:estados[`${t.id}_s${s.num}`]?.estadoSup)||"gris";total++;if(e==="verde")v++;else if(e==="amarillo")a++;else if(e==="rojo")r++;else g++;}});});
    TAREAS_MENSUALES.forEach(t=>{if(t.responsable===nombre||getSupervisor(t.id)===nombre){const e=(t.responsable===nombre?estados[t.id]?.estadoResp:estados[t.id]?.estadoSup)||"gris";total++;if(e==="verde")v++;else if(e==="amarillo")a++;else if(e==="rojo")r++;else g++;}});
    return{v,a,r,g,total,pct:total>0?Math.round((v/total)*100):0};
  }

  const estadoGuardadoUI={idle:null,guardando:{icon:"💾",text:"Guardando..."},ok:{icon:"✅",text:"Guardado"},error:{icon:"❌",text:"Error"}}[guardado];
  const recsActivos=getRecordatoriosActivos(usuarioActual?.nombre||"",anio,mes,usuarioActual?.esCFO||false).filter(r=>!recsDone[recKey(r.id)]);

  // LOGIN
  if(!usuarioActual)return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#1e3a5f,#2563eb)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"sans-serif",padding:20}}>
      <div style={{background:"#fff",borderRadius:20,padding:40,width:380,maxWidth:"100%",boxShadow:"0 20px 60px #0004"}}>
        {modalPin==="resetear"?(
          <div>
            <button onClick={()=>{setModalPin(null);setResetMsg("");setResetNombre("");}} style={{background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:13,marginBottom:16}}>&larr; Volver</button>
            <h3 style={{margin:"0 0 6px",color:"#1e293b"}}>Resetear PIN</h3>
            <p style={{fontSize:13,color:"#64748b",marginBottom:16}}>Te enviaremos un PIN temporal a tu email.</p>
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
              <svg width="80" height="80" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" style={{marginBottom:8}}>
                {/* M shape - bold */}
                <path d="M18 160 L18 48 L72 112 L100 68 L128 112 L182 48 L182 160" stroke="white" strokeWidth="22" strokeLinejoin="miter" strokeLinecap="square" fill="none"/>
                {/* Tree trunk on second right leg */}
                <line x1="128" y1="90" x2="128" y2="130" stroke="white" strokeWidth="6" strokeLinecap="round"/>
                {/* Tree canopy - circle outline */}
                <circle cx="128" cy="68" r="26" stroke="white" strokeWidth="5" fill="none"/>
                {/* Tree branches inside */}
                <line x1="128" y1="52" x2="128" y2="88" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
                <line x1="114" y1="65" x2="142" y2="65" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
                <line x1="118" y1="57" x2="128" y2="67" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
                <line x1="138" y1="57" x2="128" y2="67" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
              <div style={{fontSize:11,letterSpacing:4,color:"#7ecfca",fontWeight:600,marginBottom:4}}>MEDITERRA</div>
              <h2 style={{margin:0,color:"#1e293b",fontSize:18,fontWeight:800}}>Planificacion Depto. Adm. y Finanzas</h2>
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
              <input type="password" value={loginPin} onChange={e=>setLoginPin(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="Ingresa tu PIN" maxLength={6}
                style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:14,boxSizing:"border-box",letterSpacing:6,textAlign:"center"}}/>
            </div>
            <div style={{textAlign:"right",marginBottom:16}}>
              <button onClick={()=>{setModalPin("resetear");setResetMsg("");}} style={{background:"none",border:"none",color:"#2563eb",cursor:"pointer",fontSize:12,textDecoration:"underline"}}>Olvide mi PIN</button>
            </div>
            {loginError&&<div style={{background:"#fee2e2",color:"#ef4444",borderRadius:8,padding:"8px 12px",fontSize:12,marginBottom:14,textAlign:"center"}}>{loginError}</div>}
            <button onClick={handleLogin} style={{width:"100%",background:"#2563eb",color:"#fff",border:"none",borderRadius:10,padding:"12px",cursor:"pointer",fontWeight:700,fontSize:15}}>Ingresar</button>
          </div>
        )}
      </div>
    </div>
  );

  // APP
  function TablaFilas({tareas,getKey,getSemana}){
    const filtradas=filtroPersona?tareas.filter(t=>t.responsable===filtroPersona||getSupervisor(t.id)===filtroPersona):tareas;
    return filtradas.map((t,i)=>{
      const numSem=getSemana?getSemana():null;
      const key=getKey(t);
      const est=estados[key]||{estadoResp:"gris",estadoSup:"gris",aprobado:false};
      const semResp=SEMAFORO[est.estadoResp];
      const sup=getSupervisor(t.id);
      const supActivo=est.estadoResp==="verde"&&sup;
      const semSup=SEMAFORO[supActivo?est.estadoSup:"gris"];
      const cat=CATEGORIAS[t.categoria]||{color:"#64748b",bg:"#f1f5f9"};
      const com=comentarios[key]||"";
      const esSem=numSem!==null;
      const vencida=esSem?estaVencidaSem(t,key,numSem):estaVencidaMen(t,key);
      const proxima=!vencida&&(esSem?estaProximaSem(t,key,numSem):estaProximaMen(t,key));
      const puedeResp=puedeEditar(t,true);
      const puedeSup=puedeEditar(t,false);
      const depOk=dependenciaOk(t,numSem);
      const depNombre=getNombreDependencia(t);
      const labelLimite=esSem?`Limite: ${DIAS_SEMANA[configSemanal[t.id]??t.diaLimiteSem]}`:`Limite: dia ${diasLimite[t.id]||t.diaLimite}`;
      return(
        <tr key={key} style={{borderBottom:"1px solid #f1f5f9",background:!depOk?"#f8f8ff":vencida?"#fff5f5":proxima?"#fffbeb":i%2===0?"#fff":"#f8fafc",borderLeft:!depOk?"4px solid #c4b5fd":vencida?"4px solid #ef4444":proxima?"4px solid #f59e0b":"4px solid transparent"}}>
          <td style={{padding:"9px 14px"}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              {!depOk&&<span title={`Depende de: ${depNombre}`} style={{fontSize:11,color:"#7c3aed"}}>🔒</span>}
              {vencida&&depOk&&<span style={{color:"#ef4444",fontWeight:700,fontSize:11}}>!!</span>}
              {proxima&&depOk&&<span style={{color:"#f59e0b",fontWeight:700,fontSize:11}}>!</span>}
              <div style={{fontWeight:500,color:!depOk?"#7c3aed":vencida?"#ef4444":"#1e293b",fontSize:13}}>{t.nombre}</div>
            </div>
            <div style={{display:"flex",gap:6,marginTop:2,flexWrap:"wrap"}}>
              <span style={{fontSize:10,background:cat.bg,color:cat.color,borderRadius:20,padding:"1px 8px",fontWeight:600}}>{t.categoria}</span>
              <span style={{fontSize:10,color:vencida?"#ef4444":proxima?"#f59e0b":"#94a3b8"}}>{labelLimite}</span>
              {!depOk&&<span style={{fontSize:10,color:"#7c3aed",background:"#ede9fe",borderRadius:20,padding:"1px 8px"}}>Espera: {depNombre?.substring(0,20)}...</span>}
            </div>
          </td>
          <td style={{textAlign:"center",padding:"9px 8px",fontSize:12,color:"#374151"}}>{t.responsable.split(" ")[0]}</td>
          <td style={{textAlign:"center",padding:"9px 8px"}}>
            <button onClick={()=>ciclarResp(key,t,numSem)} title={!depOk?"Bloqueada":puedeResp?semResp.label:"Sin permiso"}
              style={{width:28,height:28,borderRadius:"50%",background:semResp.color,border:`3px solid ${semResp.border}`,cursor:puedeResp&&depOk?"pointer":"not-allowed",outline:"none",opacity:puedeResp&&depOk?1:0.4,boxShadow:"0 2px 6px #0002",transition:"transform 0.1s"}}
              onMouseEnter={e=>{if(puedeResp&&depOk)e.target.style.transform="scale(1.2)";}} onMouseLeave={e=>e.target.style.transform="scale(1)"}/>
          </td>
          <td style={{textAlign:"center",padding:"9px 8px",fontSize:12,color:"#374151"}}>{sup?sup.split(" ")[0]:<span style={{color:"#d1d5db"}}>-</span>}</td>
          <td style={{textAlign:"center",padding:"9px 8px"}}>
            {sup?(<button onClick={()=>ciclarSup(key,t)} title={!supActivo?"Disponible al completar":puedeSup?semSup.label:"Sin permiso"}
              style={{width:28,height:28,borderRadius:"50%",background:supActivo?semSup.color:"#e5e7eb",border:`3px solid ${supActivo?semSup.border:"#d1d5db"}`,cursor:(supActivo&&puedeSup)?"pointer":"not-allowed",outline:"none",opacity:(supActivo&&puedeSup)?1:0.4}}/>
            ):<span style={{color:"#d1d5db",fontSize:12}}>-</span>}
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

  if(cargando)return<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"sans-serif",color:"#64748b"}}>Cargando...</div>;

  return(
    <div style={{fontFamily:"sans-serif",background:"#f8fafc",minHeight:"100vh",padding:"20px"}}>

      {/* Modal cambiar PIN */}
      {modalPin==="cambiar"&&(
        <div style={{position:"fixed",inset:0,background:"#0006",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:16,padding:28,width:360,maxWidth:"90vw",boxShadow:"0 8px 32px #0003"}}>
            <h3 style={{margin:"0 0 6px",color:"#1e293b"}}>Cambiar PIN</h3>
            <p style={{fontSize:13,color:"#64748b",marginBottom:16}}>{usuarioActual.nombre}</p>
            {[["PIN actual",pinActual,setPinActual],["Nuevo PIN",pinNuevo,setPinNuevo],["Confirmar nuevo PIN",pinConfirm,setPinConfirm]].map(([lbl,val,set],idx)=>(
              <div key={idx} style={{marginBottom:12}}>
                <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>{lbl}</label>
                <input type="password" maxLength={6} value={val} onChange={e=>set(e.target.value)}
                  style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:14,boxSizing:"border-box",textAlign:"center",letterSpacing:6}}/>
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

      {/* Modal comentario tarea */}
      {editComentario!==null&&(
        <div style={{position:"fixed",inset:0,background:"#0006",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:16,padding:28,width:420,maxWidth:"90vw",boxShadow:"0 8px 32px #0003"}}>
            <h3 style={{margin:"0 0 14px",color:"#1e293b"}}>Comentario</h3>
            <textarea value={textoComentario} onChange={e=>setTextoComentario(e.target.value)} rows={4} placeholder="Escribe un comentario..."
              style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:14,resize:"vertical",boxSizing:"border-box"}}/>
            <div style={{display:"flex",gap:10,marginTop:14,justifyContent:"flex-end"}}>
              <button onClick={()=>setEditComentario(null)} style={{padding:"8px 18px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:14}}>Cancelar</button>
              <button onClick={guardarComentario} style={{padding:"8px 18px",borderRadius:8,border:"none",background:"#2563eb",color:"#fff",cursor:"pointer",fontSize:14,fontWeight:600}}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal comentario recordatorio */}
      {editRecComentario!==null&&(
        <div style={{position:"fixed",inset:0,background:"#0006",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:16,padding:28,width:420,maxWidth:"90vw",boxShadow:"0 8px 32px #0003"}}>
            <h3 style={{margin:"0 0 6px",color:"#1e293b"}}>Comentario del recordatorio</h3>
            <p style={{fontSize:12,color:"#64748b",marginBottom:12}}>Explica por que no se ha realizado o agrega una nota.</p>
            <textarea value={textoRecComentario} onChange={e=>setTextoRecComentario(e.target.value)} rows={4} placeholder="Ej: Se realizo el dia 5, pendiente confirmacion..."
              style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:14,resize:"vertical",boxSizing:"border-box"}}/>
            <div style={{display:"flex",gap:10,marginTop:14,justifyContent:"flex-end"}}>
              <button onClick={()=>setEditRecComentario(null)} style={{padding:"8px 18px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:14}}>Cancelar</button>
              <button onClick={()=>{setRecsComentarios(prev=>({...prev,[recKey(editRecComentario)]:textoRecComentario}));setEditRecComentario(null);}}
                style={{padding:"8px 18px",borderRadius:8,border:"none",background:"#2563eb",color:"#fff",cursor:"pointer",fontSize:14,fontWeight:600}}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal email */}
      {modalEmail&&(
        <div style={{position:"fixed",inset:0,background:"#0006",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:16,padding:28,width:500,maxWidth:"90vw",maxHeight:"80vh",overflowY:"auto",boxShadow:"0 8px 32px #0003"}}>
            <h3 style={{margin:"0 0 6px",color:"#1e293b"}}>Avisos de tareas vencidas</h3>
            <p style={{fontSize:13,color:"#64748b",marginBottom:16}}>{MESES[mes]} {anio}</p>
            {WORKERS.map(w=>{const tareas=modalEmail.resumen[w.nombre]||[];if(!tareas.length)return null;return(
              <div key={w.nombre} style={{background:"#fff5f5",border:"1px solid #fca5a5",borderRadius:10,padding:"12px 16px",marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div><div style={{fontWeight:600,fontSize:14,color:"#1e293b"}}>{w.nombre}</div><div style={{fontSize:11,color:"#64748b"}}>{tareas.length} tarea(s)</div></div>
                  <button onClick={()=>enviarEmailPersona(w,tareas)} style={{background:"#ef4444",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12,fontWeight:600}}>Enviar</button>
                </div>
                <ul style={{margin:"8px 0 0",paddingLeft:16,fontSize:12,color:"#374151"}}>{tareas.map(t=><li key={t.key}>{t.nombre}</li>)}</ul>
              </div>
            );})}
            <div style={{display:"flex",justifyContent:"flex-end",marginTop:16}}>
              <button onClick={()=>setModalEmail(null)} style={{padding:"8px 18px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:14}}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#1e3a5f,#2563eb)",borderRadius:16,padding:"20px 28px",marginBottom:20,color:"#fff"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:16}}>
            <svg width="70" height="70" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* M shape - bold */}
              <path d="M18 160 L18 48 L72 112 L100 68 L128 112 L182 48 L182 160" stroke="rgba(255,255,255,0.95)" strokeWidth="22" strokeLinejoin="miter" strokeLinecap="square" fill="none"/>
              {/* Tree trunk */}
              <line x1="128" y1="90" x2="128" y2="130" stroke="rgba(255,255,255,0.95)" strokeWidth="6" strokeLinecap="round"/>
              {/* Tree canopy */}
              <circle cx="128" cy="68" r="26" stroke="rgba(255,255,255,0.95)" strokeWidth="5" fill="none"/>
              {/* Tree branches */}
              <line x1="128" y1="52" x2="128" y2="88" stroke="rgba(255,255,255,0.95)" strokeWidth="3.5" strokeLinecap="round"/>
              <line x1="114" y1="65" x2="142" y2="65" stroke="rgba(255,255,255,0.95)" strokeWidth="3.5" strokeLinecap="round"/>
              <line x1="118" y1="57" x2="128" y2="67" stroke="rgba(255,255,255,0.95)" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="138" y1="57" x2="128" y2="67" stroke="rgba(255,255,255,0.95)" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
            <div>
              <div style={{fontSize:11,opacity:0.7,letterSpacing:3,textTransform:"uppercase",marginBottom:2}}>MEDITERRA</div>
              <h1 style={{margin:0,fontSize:20,fontWeight:800}}>Planificacion Depto. Administracion y Finanzas</h1>
              <div style={{fontSize:12,opacity:0.8,marginTop:3}}>
                Hola, <strong>{usuarioActual.nombre.split(" ")[0]}</strong> - {usuarioActual.cargo}
                {usuarioActual.esCFO&&<span style={{background:"#fbbf24",color:"#78350f",borderRadius:20,padding:"1px 8px",fontSize:10,fontWeight:700,marginLeft:8}}>ACCESO TOTAL</span>}
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            {totalVencidas>0&&usuarioActual.esCFO&&(
              <button onClick={()=>setModalEmail({resumen:generarResumenEmail()})} style={{background:"#ef4444",color:"#fff",border:"none",borderRadius:10,padding:"8px 16px",cursor:"pointer",fontWeight:700,fontSize:13}}>
                {totalVencidas} vencida(s)
              </button>
            )}
            {estadoGuardadoUI&&<span style={{fontSize:12,color:"#fff",background:"rgba(255,255,255,0.15)",borderRadius:20,padding:"4px 12px"}}>{estadoGuardadoUI.icon} {estadoGuardadoUI.text}</span>}
            <button onClick={()=>{setPinActual("");setPinNuevo("");setPinConfirm("");setPinError("");setModalPin("cambiar");}} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12}}>Cambiar PIN</button>
            <button onClick={()=>setUsuarioActual(null)} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12}}>Salir</button>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12,marginTop:12}}>
          <button
            onClick={()=>{
              const nuevoMes=mes===0?11:mes-1;
              const nuevoAnio=mes===0?anio-1:anio;
              if(!mesAnteriorAlInicio(nuevoAnio,nuevoMes))return;
              if(mes===0){setMes(11);setAnio(a=>a-1);}else setMes(m=>m-1);
            }}
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
              style={{background:rec.diff<0?"#fee2e2":rec.diff<=1?"#fff1f2":"#fef9c3",border:`1px solid ${rec.diff<0?"#fca5a5":rec.diff<=1?"#fda4af":"#fde047"}`,borderRadius:12,padding:"12px 16px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,boxShadow:"0 2px 8px #0001"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:22}}>{rec.diff<0?"🔴":rec.diff===0?"🚨":"⚠️"}</span>
                <div>
                  <div style={{fontWeight:700,fontSize:13,color:"#1e293b"}}>{rec.titulo}</div>
                  <div style={{fontSize:12,color:"#64748b"}}>
                    {rec.diff<0?"Vencido - ":"Vence el "}{rec.fechaVence.getDate()} de {MESES[rec.fechaVence.getMonth()]}
                    {rec.diff===0&&<strong style={{color:"#ef4444"}}> - HOY</strong>}
                    {rec.diff===1&&<strong style={{color:"#f59e0b"}}> - Manana</strong>}
                    {rec.diff===2&&<strong style={{color:"#f59e0b"}}> - En 2 dias</strong>}
                  </div>
                </div>
              </div>
              <span style={{fontSize:11,color:"#2563eb",fontWeight:600,whiteSpace:"nowrap"}}>Ver &rarr;</span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        {[["semanal","Semanales"],["mensual","Mensuales"],["resumen","Resumen"],["recordatorios","Recordatorios"],
          ...(usuarioActual.esCFO?[["configurar","Configurar"]]:[])
        ].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{padding:"8px 20px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:600,fontSize:13,background:tab===t?"#2563eb":"#fff",color:tab===t?"#fff":"#374151",boxShadow:tab===t?"0 2px 8px #2563eb44":"0 1px 4px #0001",position:"relative"}}>
            {l}
            {t==="recordatorios"&&recsActivos.length>0&&<span style={{position:"absolute",top:-4,right:-4,background:"#ef4444",color:"#fff",borderRadius:"50%",width:16,height:16,fontSize:9,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>{recsActivos.length}</span>}
          </button>
        ))}
      </div>

      {/* Filtro CFO */}
      {usuarioActual.esCFO&&(
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
            <span style={{width:11,height:11,borderRadius:"50%",background:v.color,display:"inline-block"}}></span>{v.label}
          </span>
        ))}
        <span style={{fontSize:11,background:"#ede9fe",color:"#7c3aed",borderRadius:20,padding:"3px 12px",boxShadow:"0 1px 4px #0001"}}>🔒 Bloqueada por dependencia</span>
      </div>

      {/* SEMANAL */}
      {tab==="semanal"&&(<>
        <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
          {semanas.map(s=>{
            const inicioSemana=s.inicioSem;
            const bloqueada=inicioSemana<FECHA_INICIO&&new Date(inicioSemana.getTime()+6*86400000)<FECHA_INICIO;
            if(bloqueada)return null;
            return(
              <button key={s.num} onClick={()=>setSemanaActiva(s.num)}
                style={{padding:"8px 20px",borderRadius:10,border:"none",cursor:"pointer",fontWeight:700,fontSize:13,background:semanaActiva===s.num?"#0f172a":"#fff",color:semanaActiva===s.num?"#fff":"#374151",boxShadow:semanaActiva===s.num?"0 2px 8px #0003":"0 1px 4px #0001"}}>
                Semana {s.num}
                <div style={{fontSize:10,fontWeight:400,opacity:0.7}}>Sem {s.iso}</div>
              </button>
            );
          })}
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{borderCollapse:"collapse",width:"100%",background:"#fff",borderRadius:14,overflow:"hidden",boxShadow:"0 2px 12px #0001"}}>
            {encabezadoTabla}
            <tbody><TablaFilas tareas={TAREAS_SEMANALES} getKey={t=>`${t.id}_s${semanaActiva}`} getSemana={()=>semanaActiva}/></tbody>
          </table>
        </div>
      </>)}

      {/* MENSUAL */}
      {tab==="mensual"&&(
        <div style={{overflowX:"auto"}}>
          <div style={{background:"#fef9c3",border:"1px solid #fde047",borderRadius:10,padding:"10px 16px",marginBottom:14,fontSize:13,color:"#92400e"}}>
            Tareas de cierre mensual. Fechas configurables por el CFO. Las tareas con 🔒 esperan que se complete una tarea previa.
          </div>
          <table style={{borderCollapse:"collapse",width:"100%",background:"#fff",borderRadius:14,overflow:"hidden",boxShadow:"0 2px 12px #0001"}}>
            {encabezadoTabla}
            <tbody><TablaFilas tareas={TAREAS_MENSUALES} getKey={t=>t.id} getSemana={null}/></tbody>
          </table>
        </div>
      )}

      {/* RESUMEN */}
      {tab==="resumen"&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))",gap:16}}>
          {WORKERS.map(w=>{
            const r=resumen(w.nombre);
            const resumenEmail=generarResumenEmail();
            const vencidas=resumenEmail[w.nombre]?.length||0;
            return(
              <div key={w.nombre} style={{background:"#fff",borderRadius:14,padding:20,boxShadow:"0 2px 10px #0001",border:vencidas>0?"2px solid #fca5a5":"2px solid transparent"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:15,color:"#1e293b"}}>{w.nombre}</div>
                    <div style={{fontSize:11,color:"#64748b",background:"#f1f5f9",borderRadius:20,padding:"2px 8px",display:"inline-block",marginTop:3}}>{w.cargo}</div>
                    {vencidas>0&&<div style={{fontSize:11,color:"#ef4444",marginTop:4}}>{vencidas} vencida(s)</div>}
                  </div>
                  <div style={{fontSize:24,fontWeight:800,color:r.pct>=75?"#22c55e":r.pct>=40?"#eab308":"#ef4444"}}>{r.pct}%</div>
                </div>
                <div style={{background:"#f1f5f9",borderRadius:8,height:9,marginBottom:12,overflow:"hidden",display:"flex"}}>
                  <div style={{width:`${r.total>0?(r.v/r.total)*100:0}%`,background:"#22c55e"}}/>
                  <div style={{width:`${r.total>0?(r.a/r.total)*100:0}%`,background:"#eab308"}}/>
                  <div style={{width:`${r.total>0?(r.r/r.total)*100:0}%`,background:"#ef4444"}}/>
                </div>
                <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:vencidas>0?10:0}}>
                  {[["verde","✅",r.v],["amarillo","🟡",r.a],["rojo","🔴",r.r],["gris","⚪",r.g]].map(([k,ico,n])=>(
                    <span key={k} style={{background:SEMAFORO[k].bg,border:`1px solid ${SEMAFORO[k].border}`,borderRadius:8,padding:"3px 9px",fontSize:12,fontWeight:600,color:"#374151"}}>{ico} {n}</span>
                  ))}
                </div>
                {vencidas>0&&usuarioActual.esCFO&&(
                  <button onClick={()=>enviarEmailPersona(w,resumenEmail[w.nombre])} style={{width:"100%",background:"#ef4444",color:"#fff",border:"none",borderRadius:8,padding:"7px",cursor:"pointer",fontSize:12,fontWeight:600}}>
                    Enviar aviso a {w.nombre.split(" ")[0]}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* RECORDATORIOS */}
      {tab==="recordatorios"&&(()=>{
        const lista=usuarioActual.esCFO
          ? RECORDATORIOS.map(rec=>{const fv=diaHabil(anio,mes,rec.diaMes);const hD=new Date();hD.setHours(0,0,0,0);return{...rec,fechaVence:fv,diff:Math.ceil((fv-hD)/(1000*60*60*24))};})
          : getRecordatoriosActivos(usuarioActual.nombre,anio,mes,false);
        const listaFiltrada=lista.filter(r=>!recsDone[recKey(r.id)]);
        const listaCompletada=lista.filter(r=>recsDone[recKey(r.id)]);

        return(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            {listaFiltrada.length===0&&listaCompletada.length===0&&(
              <div style={{background:"#fff",borderRadius:14,padding:32,textAlign:"center",boxShadow:"0 2px 10px #0001"}}>
                <div style={{fontSize:32,marginBottom:8}}>✅</div>
                <div style={{color:"#64748b",fontSize:14}}>No hay recordatorios activos este mes.</div>
              </div>
            )}

            {listaFiltrada.map(rec=>{
              const color=rec.diff<0?"#ef4444":rec.diff<=2?"#f59e0b":"#22c55e";
              const bg=rec.diff<0?"#fff5f5":rec.diff<=2?"#fffbeb":"#f0fdf4";
              const border=rec.diff<0?"#fca5a5":rec.diff<=2?"#fde047":"#86efac";
              const destW=WORKERS.filter(w=>rec.destinatarios.includes(w.nombre));
              const ccW=WORKERS.filter(w=>rec.copia.includes(w.nombre));
              const comRec=recsComentarios[recKey(rec.id)]||"";
              return(
                <div key={rec.id} style={{background:bg,border:`2px solid ${border}`,borderRadius:14,padding:20,boxShadow:"0 2px 10px #0001"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                        <span style={{fontSize:18}}>{rec.diff<0?"🔴":rec.diff<=2?"🟡":"🟢"}</span>
                        <span style={{fontWeight:700,fontSize:15,color:"#1e293b"}}>{rec.titulo}</span>
                        {rec.diff===0&&<span style={{background:"#ef4444",color:"#fff",borderRadius:20,padding:"1px 8px",fontSize:11,fontWeight:700}}>HOY</span>}
                        {rec.diff===1&&<span style={{background:"#f59e0b",color:"#fff",borderRadius:20,padding:"1px 8px",fontSize:11,fontWeight:700}}>MANANA</span>}
                        {rec.diff===2&&<span style={{background:"#f59e0b",color:"#fff",borderRadius:20,padding:"1px 8px",fontSize:11,fontWeight:700}}>EN 2 DIAS</span>}
                        {rec.diff<0&&<span style={{background:"#ef4444",color:"#fff",borderRadius:20,padding:"1px 8px",fontSize:11,fontWeight:700}}>VENCIDO</span>}
                      </div>
                      <div style={{fontSize:13,color:"#64748b",marginBottom:8}}>Fecha: <strong>{rec.fechaVence.getDate()} de {MESES[rec.fechaVence.getMonth()]} {rec.fechaVence.getFullYear()}</strong></div>
                      <div style={{fontSize:12,color:"#374151",background:"rgba(0,0,0,0.04)",borderRadius:8,padding:"8px 12px",marginBottom:10,lineHeight:1.5}}>{rec.mensaje(rec.destinatarios[0])}</div>
                      <div style={{fontSize:11,color:"#64748b",marginBottom:10}}>Para: {rec.destinatarios.join(", ")}{ccW.length>0&&<span style={{marginLeft:12}}>CC: {ccW.map(w=>w.nombre).join(", ")}</span>}</div>
                      {/* Comentario del recordatorio */}
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <button onClick={()=>{setEditRecComentario(rec.id);setTextoRecComentario(comRec);}}
                          style={{background:comRec?"#dbeafe":"#f1f5f9",border:"none",borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:11,color:comRec?"#1d4ed8":"#9ca3af"}}>
                          {comRec?`💬 ${comRec.substring(0,20)}${comRec.length>20?"...":""}` : "+ Agregar comentario"}
                        </button>
                      </div>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {rec.diff<=2&&(
                        <button onClick={()=>{destW.forEach(w=>{const asunto=encodeURIComponent(`Recordatorio: ${rec.titulo} - ${MESES[mes]} ${anio}`);const cc=ccW.map(c=>c.email).join(",");const cuerpo=encodeURIComponent(rec.mensaje(w.nombre)+`\n\nSaludos,\nEquipo Mediterra`);window.open(`mailto:${w.email}${cc?`?cc=${cc}&`:"?"}subject=${asunto}&body=${cuerpo}`);});}}
                          style={{background:color,color:"#fff",border:"none",borderRadius:10,padding:"10px 18px",cursor:"pointer",fontWeight:700,fontSize:13,whiteSpace:"nowrap"}}>
                          Enviar aviso
                        </button>
                      )}
                      <button onClick={()=>setRecsDone(prev=>({...prev,[recKey(rec.id)]:true}))}
                        style={{background:"#22c55e",color:"#fff",border:"none",borderRadius:10,padding:"10px 18px",cursor:"pointer",fontWeight:700,fontSize:13,whiteSpace:"nowrap"}}>
                        ✓ Completado
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Recordatorios completados */}
            {listaCompletada.length>0&&(
              <div>
                <div style={{fontSize:12,color:"#94a3b8",fontWeight:600,marginBottom:8,marginTop:8}}>COMPLETADOS ESTE MES</div>
                {listaCompletada.map(rec=>{
                  const comRec=recsComentarios[recKey(rec.id)]||"";
                  return(
                    <div key={rec.id} style={{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:12,padding:"12px 16px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
                      <div>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:14}}>✅</span>
                          <span style={{fontWeight:600,fontSize:13,color:"#15803d"}}>{rec.titulo}</span>
                        </div>
                        {comRec&&<div style={{fontSize:11,color:"#64748b",marginTop:4}}>💬 {comRec}</div>}
                      </div>
                      <button onClick={()=>setRecsDone(prev=>{const n={...prev};delete n[recKey(rec.id)];return n;})}
                        style={{background:"none",border:"1px solid #d1d5db",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontSize:11,color:"#64748b"}}>
                        Deshacer
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* CONFIGURAR */}
      {tab==="configurar"&&usuarioActual.esCFO&&(
        <div style={{display:"flex",flexDirection:"column",gap:24}}>

          {/* Semanales */}
          <div style={{background:"#fff",borderRadius:14,padding:20,boxShadow:"0 2px 10px #0001"}}>
            <h3 style={{margin:"0 0 16px",color:"#1e293b",fontSize:15}}>Tareas Semanales</h3>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr style={{background:"#f8fafc",color:"#64748b"}}>
                  <th style={{padding:"8px 12px",textAlign:"left",fontWeight:600,minWidth:200}}>Tarea</th>
                  <th style={{padding:"8px 12px",textAlign:"center",fontWeight:600,width:110}}>Responsable</th>
                  <th style={{padding:"8px 12px",textAlign:"center",fontWeight:600,width:150}}>Supervisor</th>
                  <th style={{padding:"8px 12px",textAlign:"center",fontWeight:600,width:160}}>Dia limite</th>
                </tr></thead>
                <tbody>{TAREAS_SEMANALES.map((t,i)=>(
                  <tr key={t.id} style={{borderTop:"1px solid #f1f5f9",background:i%2===0?"#fff":"#f8fafc"}}>
                    <td style={{padding:"8px 12px",color:"#1e293b"}}>{t.nombre}</td>
                    <td style={{padding:"8px 12px",textAlign:"center",color:"#64748b"}}>{t.responsable.split(" ")[0]}</td>
                    <td style={{padding:"8px 12px",textAlign:"center"}}>
                      <select value={supervisores[t.id]||""} onChange={e=>setSupervisores(prev=>({...prev,[t.id]:e.target.value}))}
                        style={{padding:"4px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,cursor:"pointer",width:"100%"}}>
                        <option value="">Sin supervisor</option>
                        {WORKERS.filter(w=>w.nombre!==t.responsable).map(w=><option key={w.nombre} value={w.nombre}>{w.nombre.split(" ")[0]}</option>)}
                      </select>
                    </td>
                    <td style={{padding:"8px 12px",textAlign:"center"}}>
                      <select value={configSemanal[t.id]??t.diaLimiteSem} onChange={e=>setConfigSemanal(prev=>({...prev,[t.id]:parseInt(e.target.value)}))}
                        style={{padding:"4px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,cursor:"pointer"}}>
                        {DIAS_SEMANA.map((d,idx)=><option key={idx} value={idx}>{d}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>

          {/* Mensuales */}
          <div style={{background:"#fff",borderRadius:14,padding:20,boxShadow:"0 2px 10px #0001"}}>
            <h3 style={{margin:"0 0 16px",color:"#1e293b",fontSize:15}}>Tareas Mensuales</h3>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr style={{background:"#f8fafc",color:"#64748b"}}>
                  <th style={{padding:"8px 12px",textAlign:"left",fontWeight:600,minWidth:200}}>Tarea</th>
                  <th style={{padding:"8px 12px",textAlign:"center",fontWeight:600,width:110}}>Responsable</th>
                  <th style={{padding:"8px 12px",textAlign:"center",fontWeight:600,width:150}}>Supervisor</th>
                  <th style={{padding:"8px 12px",textAlign:"center",fontWeight:600,width:160}}>Dia del mes</th>
                </tr></thead>
                <tbody>{TAREAS_MENSUALES.map((t,i)=>(
                  <tr key={t.id} style={{borderTop:"1px solid #f1f5f9",background:i%2===0?"#fff":"#f8fafc"}}>
                    <td style={{padding:"8px 12px",color:"#1e293b"}}>
                      {t.nombre}
                      {t.dependeDe&&<span style={{fontSize:10,color:"#7c3aed",background:"#ede9fe",borderRadius:20,padding:"1px 6px",marginLeft:6}}>🔒 dep.</span>}
                    </td>
                    <td style={{padding:"8px 12px",textAlign:"center",color:"#64748b"}}>{t.responsable.split(" ")[0]}</td>
                    <td style={{padding:"8px 12px",textAlign:"center"}}>
                      <select value={supervisores[t.id]||""} onChange={e=>setSupervisores(prev=>({...prev,[t.id]:e.target.value}))}
                        style={{padding:"4px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:12,cursor:"pointer",width:"100%"}}>
                        <option value="">Sin supervisor</option>
                        {WORKERS.filter(w=>w.nombre!==t.responsable).map(w=><option key={w.nombre} value={w.nombre}>{w.nombre.split(" ")[0]}</option>)}
                      </select>
                    </td>
                    <td style={{padding:"8px 12px",textAlign:"center"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                        <button onClick={()=>setDiasLimite(prev=>({...prev,[t.id]:Math.max(1,(prev[t.id]||t.diaLimite)-1)}))} style={{width:24,height:24,borderRadius:6,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontWeight:700}}>-</button>
                        <span style={{fontWeight:700,color:"#1e293b",minWidth:28,textAlign:"center"}}>{diasLimite[t.id]||t.diaLimite}</span>
                        <button onClick={()=>setDiasLimite(prev=>({...prev,[t.id]:Math.min(31,(prev[t.id]||t.diaLimite)+1)}))} style={{width:24,height:24,borderRadius:6,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontWeight:700}}>+</button>
                      </div>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>

          <div style={{background:"#dbeafe",borderRadius:10,padding:"10px 16px",fontSize:13,color:"#1d4ed8"}}>
            Los cambios se guardan automaticamente. Configurar solo visible para el CFO.
          </div>
        </div>
      )}
      {/* FOOTER */}
      <div style={{marginTop:40,borderTop:"1px solid #e2e8f0",paddingTop:24}}>
        <div style={{textAlign:"center",marginBottom:20}}>
          <span style={{fontSize:11,color:"#94a3b8",letterSpacing:3,textTransform:"uppercase",fontWeight:600}}>Nuestras Empresas</span>
          <span style={{fontSize:11,color:"#94a3b8",letterSpacing:2}}> – </span>
          <span style={{fontSize:11,color:"#94a3b8",letterSpacing:3,textTransform:"uppercase",fontWeight:600}}>Mediterra</span>
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:16,justifyContent:"center",alignItems:"center"}}>

          {/* Frisku Foods */}
          <div style={{background:"#1a1a2e",borderRadius:10,padding:"10px 18px",display:"flex",flexDirection:"column",alignItems:"center",minWidth:120}}>
            <div style={{display:"flex",alignItems:"baseline",gap:1}}>
              <span style={{color:"#6b7280",fontWeight:900,fontSize:15,letterSpacing:1}}>FRISKU</span>
              <span style={{color:"#60a5fa",fontWeight:900,fontSize:15,letterSpacing:1}}>FOODS</span>
            </div>
            <span style={{color:"#9ca3af",fontSize:8,letterSpacing:2,marginTop:2}}>CONNECTING QUALITY</span>
          </div>

          {/* Osiris Plant Management */}
          <div style={{background:"#0f2d4a",borderRadius:10,padding:"10px 18px",display:"flex",flexDirection:"column",alignItems:"center",minWidth:140}}>
            <span style={{color:"#2980b9",fontWeight:700,fontSize:16,letterSpacing:3}}>OSIRIS</span>
            <span style={{color:"#7fb3d3",fontSize:9,letterSpacing:2,marginTop:1}}>PLANT MANAGEMENT</span>
          </div>

          {/* Allegria Foods */}
          <div style={{background:"#1a1a1a",borderRadius:10,padding:"10px 18px",display:"flex",flexDirection:"column",alignItems:"center",minWidth:120}}>
            <div style={{display:"flex",alignItems:"baseline",gap:4}}>
              <span style={{color:"#374151",fontWeight:300,fontSize:18,fontStyle:"italic",fontFamily:"Georgia,serif"}}>Allegr</span>
              <span style={{color:"#374151",fontWeight:300,fontSize:18,fontStyle:"italic",fontFamily:"Georgia,serif"}}>ía</span>
            </div>
            <span style={{color:"#ec4899",fontSize:11,letterSpacing:2,marginTop:-2}}>foods</span>
          </div>

          {/* Allegria Service */}
          <div style={{background:"#111",borderRadius:10,padding:"10px 18px",display:"flex",flexDirection:"column",alignItems:"center",minWidth:130}}>
            <span style={{color:"#e5e7eb",fontWeight:700,fontSize:15,letterSpacing:2,fontFamily:"Georgia,serif"}}>ALLEGRÍA</span>
            <span style={{color:"#ef4444",fontSize:10,letterSpacing:3,marginTop:2,borderTop:"1px solid #ef4444",paddingTop:3,width:"100%",textAlign:"center"}}>SERVICE</span>
          </div>

          {/* Integrity Farms */}
          <div style={{background:"#0f2010",borderRadius:10,padding:"10px 18px",display:"flex",flexDirection:"column",alignItems:"center",minWidth:130,border:"1px solid #166534"}}>
            <span style={{color:"#16a34a",fontWeight:800,fontSize:13,letterSpacing:2}}>INTEGRITY</span>
            <span style={{color:"#16a34a",fontWeight:800,fontSize:13,letterSpacing:2,borderTop:"1px solid #16a34a",paddingTop:3,width:"100%",textAlign:"center"}}>FARMS</span>
          </div>

          {/* Allpa Farms Peru */}
          <div style={{background:"#1e1b4b",borderRadius:10,padding:"10px 18px",display:"flex",flexDirection:"column",alignItems:"center",minWidth:100}}>
            <span style={{color:"#3730a3",fontWeight:900,fontSize:14,letterSpacing:1}}>ALLPA</span>
            <span style={{color:"#3730a3",fontWeight:900,fontSize:14,letterSpacing:1}}>FARMS</span>
            <span style={{background:"#34d399",color:"#fff",fontSize:9,fontWeight:700,borderRadius:4,padding:"1px 8px",marginTop:3,letterSpacing:2}}>PERU</span>
          </div>

          {/* Allpa Farms Chile */}
          <div style={{background:"#1e1b4b",borderRadius:10,padding:"10px 18px",display:"flex",flexDirection:"column",alignItems:"center",minWidth:100}}>
            <span style={{color:"#3730a3",fontWeight:900,fontSize:14,letterSpacing:1}}>ALLPA</span>
            <span style={{color:"#3730a3",fontWeight:900,fontSize:14,letterSpacing:1}}>FARMS</span>
            <span style={{background:"#f87171",color:"#fff",fontSize:9,fontWeight:700,borderRadius:4,padding:"1px 8px",marginTop:3,letterSpacing:2}}>CHILE</span>
          </div>

        </div>
        <div style={{textAlign:"center",marginTop:20,fontSize:10,color:"#cbd5e1"}}>
          © {new Date().getFullYear()} Grupo Mediterra · Todos los derechos reservados
        </div>
      </div>

    </div>
  );
}
