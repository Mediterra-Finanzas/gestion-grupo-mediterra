import { useState, useEffect, useCallback } from "react";

const DIAS_SEMANA = ["Lunes","Martes","Miercoles","Jueves","Viernes"];

const SEMAFORO = {
  verde:    { label: "Completado", color: "#22c55e", bg: "#dcfce7", border: "#86efac" },
  amarillo: { label: "En proceso", color: "#eab308", bg: "#fef9c3", border: "#fde047" },
  rojo:     { label: "Pendiente",  color: "#ef4444", bg: "#fee2e2", border: "#fca5a5" },
  gris:     { label: "Sin iniciar",color: "#9ca3af", bg: "#f3f4f6", border: "#d1d5db" },
};

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const WORKERS = [
  { nombre: "Milagros Becerra", cargo: "Sec. Administrativa",  email: "Mbecerra@grupomediterra.cl", pin: "4827", esCFO: false },
  { nombre: "Carol Machuca",    cargo: "Analista Finanzas",    email: "cmachuca@grupomediterra.cl", pin: "3159", esCFO: false },
  { nombre: "Michelle Garcia",  cargo: "Contadora General",    email: "mgarcia@grupomediterra.cl",  pin: "7413", esCFO: false },
  { nombre: "Pablo Duran",      cargo: "Asistente Contable",   email: "pduran@grupomediterra.cl",   pin: "2986", esCFO: false },
  { nombre: "Angelo Huerta",    cargo: "Gerencia / CFO",       email: "ahuerta@grupomediterra.cl",  pin: "6054", esCFO: true  },
];

const CATEGORIAS = {
  "Finanzas":       { color: "#3b82f6", bg: "#dbeafe" },
  "Contabilidad":   { color: "#8b5cf6", bg: "#ede9fe" },
  "Tesoreria":      { color: "#f59e0b", bg: "#fef3c7" },
  "Tributario":     { color: "#ef4444", bg: "#fee2e2" },
  "Administracion": { color: "#10b981", bg: "#d1fae5" },
  "Gerencia":       { color: "#6366f1", bg: "#e0e7ff" },
};

const TAREAS_SEMANALES = [
  { id:"s1",  nombre:"Preparacion y carga de nominas de pago",           responsable:"Milagros Becerra", supervisor:"Michelle Garcia",  categoria:"Tesoreria",      diaLimiteSem:4 },
  { id:"s2",  nombre:"Coordinacion de firmas de pagos y documentos",     responsable:"Milagros Becerra", supervisor:"Angelo Huerta",    categoria:"Tesoreria",      diaLimiteSem:4 },
  { id:"s3",  nombre:"Actualizacion y archivo de documentacion admin",   responsable:"Milagros Becerra", supervisor:"",                 categoria:"Administracion", diaLimiteSem:4 },
  { id:"s4",  nombre:"Actualizacion flujo de caja proyectado (rolling)", responsable:"Carol Machuca",    supervisor:"Angelo Huerta",    categoria:"Finanzas",       diaLimiteSem:3 },
  { id:"s5",  nombre:"Seguimiento ingresos, egresos y desviaciones",     responsable:"Carol Machuca",    supervisor:"Angelo Huerta",    categoria:"Finanzas",       diaLimiteSem:3 },
  { id:"s6",  nombre:"Monitoreo KPIs criticos (caja, margenes, costos)", responsable:"Carol Machuca",    supervisor:"Angelo Huerta",    categoria:"Finanzas",       diaLimiteSem:4 },
  { id:"s7",  nombre:"Registro y revision de movimientos contables",     responsable:"Michelle Garcia",  supervisor:"",                 categoria:"Contabilidad",   diaLimiteSem:3 },
  { id:"s8",  nombre:"Conciliacion bancaria semanal",                    responsable:"Michelle Garcia",  supervisor:"Angelo Huerta",    categoria:"Contabilidad",   diaLimiteSem:4 },
  { id:"s9",  nombre:"Registro de facturas, boletas y gastos",           responsable:"Pablo Duran",      supervisor:"Michelle Garcia",  categoria:"Contabilidad",   diaLimiteSem:3 },
  { id:"s10", nombre:"Apoyo en conciliaciones bancarias",                responsable:"Pablo Duran",      supervisor:"Michelle Garcia",  categoria:"Contabilidad",   diaLimiteSem:4 },
  { id:"s11", nombre:"Preparacion de respaldos para pagos",              responsable:"Pablo Duran",      supervisor:"Milagros Becerra", categoria:"Tesoreria",      diaLimiteSem:3 },
];

const TAREAS_MENSUALES = [
  { id:"m1",  nombre:"Consolidacion y respaldo de documentos del mes",        responsable:"Milagros Becerra", supervisor:"Michelle Garcia",  categoria:"Administracion", diaLimite:5  },
  { id:"m2",  nombre:"Organizacion carpetas digitales/fisicas por periodo",   responsable:"Milagros Becerra", supervisor:"",                 categoria:"Administracion", diaLimite:5  },
  { id:"m3",  nombre:"Posicion bancaria consolidada del mes",                 responsable:"Milagros Becerra", supervisor:"Angelo Huerta",    categoria:"Tesoreria",      diaLimite:3  },
  { id:"m4",  nombre:"Apoyo en entrega antecedentes para cierre contable",    responsable:"Milagros Becerra", supervisor:"Michelle Garcia",  categoria:"Administracion", diaLimite:5  },
  { id:"m5",  nombre:"Cierre contable mensual (provisiones, ajustes)",        responsable:"Michelle Garcia",  supervisor:"Angelo Huerta",    categoria:"Contabilidad",   diaLimite:10 },
  { id:"m6",  nombre:"Declaracion impuestos mensuales (F29, F50, etc.)",      responsable:"Michelle Garcia",  supervisor:"Angelo Huerta",    categoria:"Tributario",     diaLimite:12 },
  { id:"m7",  nombre:"Preparacion de Estados Financieros",                    responsable:"Michelle Garcia",  supervisor:"Angelo Huerta",    categoria:"Contabilidad",   diaLimite:15 },
  { id:"m8",  nombre:"Control cumplimiento tributario",                       responsable:"Michelle Garcia",  supervisor:"Angelo Huerta",    categoria:"Tributario",     diaLimite:12 },
  { id:"m9",  nombre:"Validacion integridad y consistencia de cifras",        responsable:"Michelle Garcia",  supervisor:"Angelo Huerta",    categoria:"Contabilidad",   diaLimite:10 },
  { id:"m10", nombre:"EERR real vs presupuesto + analisis de variaciones",    responsable:"Carol Machuca",    supervisor:"Angelo Huerta",    categoria:"Finanzas",       diaLimite:15 },
  { id:"m11", nombre:"Actualizacion forecast financiero",                     responsable:"Carol Machuca",    supervisor:"Angelo Huerta",    categoria:"Finanzas",       diaLimite:15 },
  { id:"m12", nombre:"Analisis rentabilidad por unidad / cliente / producto", responsable:"Carol Machuca",    supervisor:"Angelo Huerta",    categoria:"Finanzas",       diaLimite:20 },
  { id:"m13", nombre:"Reporte de resultados para gerencia y directorio",      responsable:"Carol Machuca",    supervisor:"Angelo Huerta",    categoria:"Finanzas",       diaLimite:20 },
  { id:"m14", nombre:"Identificacion de riesgos financieros y operacionales", responsable:"Carol Machuca",    supervisor:"Angelo Huerta",    categoria:"Finanzas",       diaLimite:20 },
  { id:"m15", nombre:"Apoyo en cierre contable - respaldos e impuestos",      responsable:"Pablo Duran",      supervisor:"Michelle Garcia",  categoria:"Contabilidad",   diaLimite:8  },
  { id:"m16", nombre:"Validacion documentos pendientes / inconsistencias",    responsable:"Pablo Duran",      supervisor:"Michelle Garcia",  categoria:"Contabilidad",   diaLimite:8  },
  { id:"m17", nombre:"Orden y cierre de carpetas contables del mes",          responsable:"Pablo Duran",      supervisor:"Michelle Garcia",  categoria:"Contabilidad",   diaLimite:10 },
  { id:"m18", nombre:"Reunion mensual de resultados (liderada por CFO)",      responsable:"Angelo Huerta",    supervisor:"",                 categoria:"Gerencia",       diaLimite:25 },
];

const SEMANAS = [1,2,3,4];
const ORDEN_SEM = ["gris","verde","amarillo","rojo"];
const STORAGE_KEY = "calendario_v6";

function semanaDelAnio(anio, mes, numSemana) {
  const primerDia = new Date(anio, mes, 1);
  const diaSemana = primerDia.getDay() || 7;
  const ini = new Date(primerDia);
  ini.setDate(primerDia.getDate() - (diaSemana - 1) + (numSemana - 1) * 7);
  const tmp = new Date(ini);
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const w1 = new Date(tmp.getFullYear(), 0, 4);
  return 1 + Math.round(((tmp - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}

// Calcula fecha real de un dia de semana dentro de la semana N del mes
function fechaDiaSemana(anio, mes, numSemana, diaSem) {
  const primerDia = new Date(anio, mes, 1);
  const dow = primerDia.getDay() || 7; // 1=lun..7=dom
  const inicioSemana = new Date(primerDia);
  inicioSemana.setDate(primerDia.getDate() - (dow - 1) + (numSemana - 1) * 7);
  const fecha = new Date(inicioSemana);
  fecha.setDate(inicioSemana.getDate() + diaSem); // diaSem: 0=lun,1=mar,...,4=vie
  return fecha;
}

function initEstados() {
  const est = {};
  SEMANAS.forEach(s => {
    TAREAS_SEMANALES.forEach(t => { est[`${t.id}_s${s}`] = { estadoResp:"gris", estadoSup:"gris", aprobado:false }; });
  });
  TAREAS_MENSUALES.forEach(t => { est[t.id] = { estadoResp:"gris", estadoSup:"gris", aprobado:false }; });
  return est;
}

function initConfigSemanal() {
  const d = {};
  TAREAS_SEMANALES.forEach(t => { d[t.id] = t.diaLimiteSem; }); // 0=lun..4=vie
  return d;
}

function initDiasLimite() {
  const d = {};
  TAREAS_MENSUALES.forEach(t => { d[t.id] = t.diaLimite; });
  return d;
}

export default function App() {
  const hoy = new Date();
  const [usuarioActual, setUsuarioActual] = useState(null);
  const [loginNombre, setLoginNombre] = useState("");
  const [loginPin, setLoginPin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [mes, setMes] = useState(hoy.getMonth());
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [estados, setEstados] = useState(initEstados);
  const [comentarios, setComentarios] = useState({});
  const [configSemanal, setConfigSemanal] = useState(initConfigSemanal);
  const [diasLimite, setDiasLimite] = useState(initDiasLimite);
  const [tab, setTab] = useState("semanal");
  const [semanaActiva, setSemanaActiva] = useState(1);
  const [guardado, setGuardado] = useState("idle");
  const [cargando, setCargando] = useState(true);
  const [editComentario, setEditComentario] = useState(null);
  const [textoComentario, setTextoComentario] = useState("");
  const [filtroPersona, setFiltroPersona] = useState("");
  const [modalEmail, setModalEmail] = useState(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.estados)      setEstados(prev => ({...initEstados(), ...d.estados}));
        if (d.comentarios)  setComentarios(d.comentarios);
        if (d.configSemanal)setConfigSemanal(prev => ({...prev, ...d.configSemanal}));
        if (d.diasLimite)   setDiasLimite(prev => ({...prev, ...d.diasLimite}));
        if (d.mes !== undefined) setMes(d.mes);
        if (d.anio !== undefined) setAnio(d.anio);
      }
    } catch {}
    setCargando(false);
  }, []);

  const guardar = useCallback((est, com, cs, dl, m, a) => {
    setGuardado("guardando");
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ estados:est, comentarios:com, configSemanal:cs, diasLimite:dl, mes:m, anio:a }));
      setGuardado("ok");
      setTimeout(() => setGuardado("idle"), 2000);
    } catch {
      setGuardado("error");
      setTimeout(() => setGuardado("idle"), 3000);
    }
  }, []);

  useEffect(() => {
    if (cargando) return;
    const t = setTimeout(() => guardar(estados, comentarios, configSemanal, diasLimite, mes, anio), 800);
    return () => clearTimeout(t);
  }, [estados, comentarios, configSemanal, diasLimite, mes, anio, cargando, guardar]);

  function handleLogin() {
    const w = WORKERS.find(x => x.nombre === loginNombre && x.pin === loginPin.trim());
    if (w) {
      setUsuarioActual(w);
      setLoginError("");
    } else {
      setLoginError("Nombre o PIN incorrecto. Intenta nuevamente.");
    }
  }

  function puedeEditar(tarea, esResp) {
    if (!usuarioActual) return false;
    if (usuarioActual.esCFO) return true;
    if (esResp) return tarea.responsable === usuarioActual.nombre;
    return tarea.supervisor === usuarioActual.nombre;
  }

  function ciclarResp(key, tarea) {
    if (!puedeEditar(tarea, true)) return;
    setEstados(prev => {
      const actual = prev[key]?.estadoResp || "gris";
      const sig = ORDEN_SEM[(ORDEN_SEM.indexOf(actual)+1) % ORDEN_SEM.length];
      return {...prev, [key]: {...prev[key], estadoResp:sig, aprobado:false, estadoSup: sig!=="verde"?"gris":prev[key].estadoSup}};
    });
  }

  function ciclarSup(key, tarea) {
    if (!puedeEditar(tarea, false)) return;
    setEstados(prev => {
      if (prev[key]?.estadoResp !== "verde") return prev;
      const actual = prev[key]?.estadoSup || "gris";
      const sig = ORDEN_SEM[(ORDEN_SEM.indexOf(actual)+1) % ORDEN_SEM.length];
      return {...prev, [key]: {...prev[key], estadoSup:sig, aprobado:sig==="verde"}};
    });
  }

  function guardarComentario() {
    setComentarios(prev => ({...prev, [editComentario]: textoComentario}));
    setEditComentario(null);
  }

  function estaVencidaSem(tarea, estados, key, numSemana) {
    const hoyD = new Date(); hoyD.setHours(0,0,0,0);
    const diaSem = configSemanal[tarea.id] ?? tarea.diaLimiteSem;
    const fechaL = fechaDiaSemana(anio, mes, numSemana, diaSem);
    return hoyD > fechaL && (estados[key]?.estadoResp || "gris") === "gris";
  }

  function estaProximaSem(tarea, key, numSemana) {
    const hoyD = new Date(); hoyD.setHours(0,0,0,0);
    const diaSem = configSemanal[tarea.id] ?? tarea.diaLimiteSem;
    const fechaL = fechaDiaSemana(anio, mes, numSemana, diaSem);
    const diff = (fechaL - hoyD) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 2;
  }

  function estaVencidaMen(tarea, estados, key) {
    const hoyD = new Date(); hoyD.setHours(0,0,0,0);
    const dia = diasLimite[tarea.id] || tarea.diaLimite;
    return hoyD > new Date(anio, mes, dia) && (estados[key]?.estadoResp || "gris") === "gris";
  }

  function estaProximaMen(tarea, key) {
    const hoyD = new Date(); hoyD.setHours(0,0,0,0);
    const dia = diasLimite[tarea.id] || tarea.diaLimite;
    const diff = (new Date(anio, mes, dia) - hoyD) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 2;
  }

  function generarResumenEmail() {
    const res = {};
    WORKERS.forEach(w => { res[w.nombre] = []; });
    SEMANAS.forEach(s => {
      TAREAS_SEMANALES.forEach(t => {
        const key = `${t.id}_s${s}`;
        if (estaVencidaSem(t, estados, key, s)) res[t.responsable]?.push({...t, key, semana:s});
      });
    });
    TAREAS_MENSUALES.forEach(t => {
      if (estaVencidaMen(t, estados, t.id)) res[t.responsable]?.push({...t, key:t.id});
    });
    return res;
  }

  function abrirEmailResumen() {
    const resumen = generarResumenEmail();
    if (!WORKERS.some(w => (resumen[w.nombre]||[]).length > 0)) {
      alert("Todo al dia! No hay tareas vencidas.");
      return;
    }
    setModalEmail({ resumen });
  }

  function enviarEmailPersona(w, tareas) {
    const asunto = encodeURIComponent(`Tareas pendientes - ${MESES[mes]} ${anio}`);
    const cuerpo = encodeURIComponent(
      `Hola ${w.nombre.split(" ")[0]},\n\n` +
      `Las siguientes tareas estan vencidas:\n\n` +
      tareas.map(t => `- ${t.nombre}`).join('\n') +
      `\n\nActualiza en: https://calendario-mediterra-2026.vercel.app\n\nSaludos`
    );
    window.open(`mailto:${w.email}?subject=${asunto}&body=${cuerpo}`);
  }

  const totalVencidas = (() => {
    let c = 0;
    SEMANAS.forEach(s => { TAREAS_SEMANALES.forEach(t => { if (estaVencidaSem(t, estados, `${t.id}_s${s}`, s)) c++; }); });
    TAREAS_MENSUALES.forEach(t => { if (estaVencidaMen(t, estados, t.id)) c++; });
    return c;
  })();

  function resumen(nombre) {
    let v=0,a=0,r=0,g=0,total=0;
    SEMANAS.forEach(s => {
      TAREAS_SEMANALES.forEach(t => {
        if (t.responsable===nombre || t.supervisor===nombre) {
          const e = (t.responsable===nombre ? estados[`${t.id}_s${s}`]?.estadoResp : estados[`${t.id}_s${s}`]?.estadoSup) || "gris";
          total++; if(e==="verde")v++; else if(e==="amarillo")a++; else if(e==="rojo")r++; else g++;
        }
      });
    });
    TAREAS_MENSUALES.forEach(t => {
      if (t.responsable===nombre || t.supervisor===nombre) {
        const e = (t.responsable===nombre ? estados[t.id]?.estadoResp : estados[t.id]?.estadoSup) || "gris";
        total++; if(e==="verde")v++; else if(e==="amarillo")a++; else if(e==="rojo")r++; else g++;
      }
    });
    return { v,a,r,g,total, pct: total>0?Math.round((v/total)*100):0 };
  }

  const estadoGuardadoUI = { idle:null, guardando:{icon:"💾",text:"Guardando..."}, ok:{icon:"✅",text:"Guardado"}, error:{icon:"❌",text:"Error"} }[guardado];

  // ── LOGIN ──────────────────────────────────────────
  if (!usuarioActual) {
    return (
      <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#1e3a5f,#2563eb)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"sans-serif",padding:20}}>
        <div style={{background:"#fff",borderRadius:20,padding:40,width:380,maxWidth:"100%",boxShadow:"0 20px 60px #0004"}}>
          <div style={{textAlign:"center",marginBottom:28}}>
            <div style={{fontSize:40,marginBottom:8}}>📅</div>
            <h2 style={{margin:0,color:"#1e293b",fontSize:20,fontWeight:800}}>Control Financiero</h2>
            <p style={{margin:"6px 0 0",color:"#64748b",fontSize:13}}>Grupo Mediterra</p>
          </div>
          <div style={{marginBottom:14}}>
            <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>Nombre</label>
            <select value={loginNombre} onChange={e=>setLoginNombre(e.target.value)}
              style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:14,boxSizing:"border-box"}}>
              <option value="">Selecciona tu nombre...</option>
              {WORKERS.map(w=><option key={w.nombre} value={w.nombre}>{w.nombre} - {w.cargo}</option>)}
            </select>
          </div>
          <div style={{marginBottom:20}}>
            <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>PIN</label>
            <input type="password" value={loginPin} onChange={e=>setLoginPin(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&handleLogin()}
              placeholder="Ingresa tu PIN de 4 digitos"
              maxLength={4}
              style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:14,boxSizing:"border-box",letterSpacing:6,textAlign:"center"}}/>
          </div>
          {loginError && <div style={{background:"#fee2e2",color:"#ef4444",borderRadius:8,padding:"8px 12px",fontSize:12,marginBottom:14,textAlign:"center"}}>{loginError}</div>}
          <button onClick={handleLogin}
            style={{width:"100%",background:"#2563eb",color:"#fff",border:"none",borderRadius:10,padding:"12px",cursor:"pointer",fontWeight:700,fontSize:15}}>
            Ingresar
          </button>
        </div>
      </div>
    );
  }

  // ── APP ────────────────────────────────────────────
  function TablaFilas({ tareas, getKey, getSemana }) {
    const filtradas = filtroPersona ? tareas.filter(t => t.responsable===filtroPersona || t.supervisor===filtroPersona) : tareas;
    return filtradas.map((t,i) => {
      const semana = getSemana ? getSemana() : null;
      const key = getKey(t);
      const est = estados[key] || {estadoResp:"gris",estadoSup:"gris",aprobado:false};
      const semResp = SEMAFORO[est.estadoResp];
      const supActivo = est.estadoResp==="verde" && t.supervisor;
      const semSup = SEMAFORO[supActivo ? est.estadoSup : "gris"];
      const cat = CATEGORIAS[t.categoria] || {color:"#64748b",bg:"#f1f5f9"};
      const com = comentarios[key] || "";
      const esSemanal = semana !== null;
      const vencida = esSemanal ? estaVencidaSem(t, estados, key, semana) : estaVencidaMen(t, estados, key);
      const proxima = !vencida && (esSemanal ? estaProximaSem(t, key, semana) : estaProximaMen(t, key)) && est.estadoResp==="gris";
      const puedeResp = puedeEditar(t, true);
      const puedeSup = puedeEditar(t, false);

      let labelLimite = "";
      if (esSemanal) {
        const ds = configSemanal[t.id] ?? t.diaLimiteSem;
        labelLimite = `Limite: ${DIAS_SEMANA[ds]}`;
      } else {
        labelLimite = `Limite: dia ${diasLimite[t.id]||t.diaLimite} del mes`;
      }

      return (
        <tr key={key} style={{borderBottom:"1px solid #f1f5f9",
          background:vencida?"#fff5f5":proxima?"#fffbeb":i%2===0?"#fff":"#f8fafc",
          borderLeft:vencida?"4px solid #ef4444":proxima?"4px solid #f59e0b":"4px solid transparent"}}>
          <td style={{padding:"9px 14px"}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              {vencida && <span style={{color:"#ef4444",fontWeight:700,fontSize:11}}>!!</span>}
              {proxima && <span style={{color:"#f59e0b",fontWeight:700,fontSize:11}}>!</span>}
              <div style={{fontWeight:500,color:vencida?"#ef4444":"#1e293b",fontSize:13}}>{t.nombre}</div>
            </div>
            <div style={{display:"flex",gap:6,marginTop:2,alignItems:"center"}}>
              <span style={{fontSize:10,background:cat.bg,color:cat.color,borderRadius:20,padding:"1px 8px",fontWeight:600}}>{t.categoria}</span>
              <span style={{fontSize:10,color:vencida?"#ef4444":proxima?"#f59e0b":"#94a3b8"}}>{labelLimite}</span>
            </div>
          </td>
          <td style={{textAlign:"center",padding:"9px 8px",fontSize:12,color:"#374151"}}>{t.responsable.split(" ")[0]}</td>
          <td style={{textAlign:"center",padding:"9px 8px"}}>
            <button onClick={()=>ciclarResp(key,t)} title={puedeResp?semResp.label:"Sin permiso"}
              style={{width:28,height:28,borderRadius:"50%",background:semResp.color,border:`3px solid ${semResp.border}`,
                cursor:puedeResp?"pointer":"not-allowed",outline:"none",opacity:puedeResp?1:0.4,
                boxShadow:"0 2px 6px #0002",transition:"transform 0.1s"}}
              onMouseEnter={e=>{if(puedeResp)e.target.style.transform="scale(1.2)";}}
              onMouseLeave={e=>e.target.style.transform="scale(1)"}/>
          </td>
          <td style={{textAlign:"center",padding:"9px 8px",fontSize:12,color:"#374151"}}>
            {t.supervisor ? t.supervisor.split(" ")[0] : <span style={{color:"#d1d5db"}}>-</span>}
          </td>
          <td style={{textAlign:"center",padding:"9px 8px"}}>
            {t.supervisor ? (
              <button onClick={()=>ciclarSup(key,t)}
                title={!supActivo?"Disponible al completar":puedeSup?semSup.label:"Sin permiso"}
                style={{width:28,height:28,borderRadius:"50%",background:supActivo?semSup.color:"#e5e7eb",
                  border:`3px solid ${supActivo?semSup.border:"#d1d5db"}`,
                  cursor:(supActivo&&puedeSup)?"pointer":"not-allowed",outline:"none",
                  opacity:(supActivo&&puedeSup)?1:0.4}}/>
            ) : <span style={{color:"#d1d5db",fontSize:12}}>-</span>}
          </td>
          <td style={{textAlign:"center",padding:"9px 8px"}}>
            <button onClick={()=>{ setEditComentario(key); setTextoComentario(com); }}
              style={{background:com?"#dbeafe":"#f1f5f9",border:"none",borderRadius:8,padding:"4px 10px",
                cursor:"pointer",fontSize:11,color:com?"#1d4ed8":"#9ca3af",maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {com?`[${com.substring(0,10)}...]`:"+"}
            </button>
          </td>
        </tr>
      );
    });
  }

  const encabezadoTabla = (
    <thead>
      <tr style={{background:"#1e3a5f",color:"#fff",fontSize:12}}>
        <th style={{padding:"10px 14px",textAlign:"left",minWidth:240}}>Tarea</th>
        <th style={{padding:"10px 8px",textAlign:"center",minWidth:90}}>Responsable</th>
        <th style={{padding:"10px 8px",textAlign:"center",minWidth:70}}>Estado</th>
        <th style={{padding:"10px 8px",textAlign:"center",minWidth:90}}>Supervisor</th>
        <th style={{padding:"10px 8px",textAlign:"center",minWidth:70}}>Aprobacion</th>
        <th style={{padding:"10px 8px",textAlign:"center",minWidth:100}}>Comentario</th>
      </tr>
    </thead>
  );

  if (cargando) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"sans-serif",color:"#64748b"}}>Cargando...</div>;

  return (
    <div style={{fontFamily:"sans-serif",background:"#f8fafc",minHeight:"100vh",padding:"20px"}}>

      {editComentario !== null && (
        <div style={{position:"fixed",inset:0,background:"#0006",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:16,padding:28,width:420,maxWidth:"90vw",boxShadow:"0 8px 32px #0003"}}>
            <h3 style={{margin:"0 0 14px",color:"#1e293b"}}>Comentario</h3>
            <textarea value={textoComentario} onChange={e=>setTextoComentario(e.target.value)} rows={4}
              placeholder="Escribe un comentario..."
              style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:14,resize:"vertical",boxSizing:"border-box"}}/>
            <div style={{display:"flex",gap:10,marginTop:14,justifyContent:"flex-end"}}>
              <button onClick={()=>setEditComentario(null)} style={{padding:"8px 18px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:14}}>Cancelar</button>
              <button onClick={guardarComentario} style={{padding:"8px 18px",borderRadius:8,border:"none",background:"#2563eb",color:"#fff",cursor:"pointer",fontSize:14,fontWeight:600}}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {modalEmail && (
        <div style={{position:"fixed",inset:0,background:"#0006",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:16,padding:28,width:500,maxWidth:"90vw",maxHeight:"80vh",overflowY:"auto",boxShadow:"0 8px 32px #0003"}}>
            <h3 style={{margin:"0 0 6px",color:"#1e293b"}}>Avisos de tareas vencidas</h3>
            <p style={{fontSize:13,color:"#64748b",marginBottom:16}}>{MESES[mes]} {anio}</p>
            {WORKERS.map(w => {
              const tareas = modalEmail.resumen[w.nombre] || [];
              if (!tareas.length) return null;
              return (
                <div key={w.nombre} style={{background:"#fff5f5",border:"1px solid #fca5a5",borderRadius:10,padding:"12px 16px",marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontWeight:600,fontSize:14,color:"#1e293b"}}>{w.nombre}</div>
                      <div style={{fontSize:11,color:"#64748b"}}>{tareas.length} tarea(s) vencida(s)</div>
                    </div>
                    <button onClick={()=>enviarEmailPersona(w,tareas)}
                      style={{background:"#ef4444",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12,fontWeight:600}}>Enviar</button>
                  </div>
                  <ul style={{margin:"8px 0 0",paddingLeft:16,fontSize:12,color:"#374151"}}>
                    {tareas.map(t=><li key={t.key}>{t.nombre}</li>)}
                  </ul>
                </div>
              );
            })}
            <div style={{display:"flex",justifyContent:"flex-end",marginTop:16}}>
              <button onClick={()=>setModalEmail(null)} style={{padding:"8px 18px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:14}}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#1e3a5f,#2563eb)",borderRadius:16,padding:"20px 28px",marginBottom:20,color:"#fff"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <div>
            <h1 style={{margin:0,fontSize:22,fontWeight:800}}>Control Financiero y Administrativo</h1>
            <div style={{fontSize:12,opacity:0.8,marginTop:4}}>
              Hola, <strong>{usuarioActual.nombre.split(" ")[0]}</strong> - {usuarioActual.cargo}
              {usuarioActual.esCFO && <span style={{background:"#fbbf24",color:"#78350f",borderRadius:20,padding:"1px 8px",fontSize:10,fontWeight:700,marginLeft:8}}>ACCESO TOTAL</span>}
            </div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            {totalVencidas>0 && usuarioActual.esCFO && (
              <button onClick={abrirEmailResumen}
                style={{background:"#ef4444",color:"#fff",border:"none",borderRadius:10,padding:"8px 16px",cursor:"pointer",fontWeight:700,fontSize:13}}>
                {totalVencidas} vencida(s) - Avisar
              </button>
            )}
            {estadoGuardadoUI && <span style={{fontSize:12,color:"#fff",background:"rgba(255,255,255,0.15)",borderRadius:20,padding:"4px 12px"}}>{estadoGuardadoUI.icon} {estadoGuardadoUI.text}</span>}
            <button onClick={()=>setUsuarioActual(null)}
              style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12}}>
              Salir
            </button>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12,marginTop:12}}>
          <button onClick={()=>{if(mes===0){setMes(11);setAnio(a=>a-1);}else setMes(m=>m-1);}}
            style={{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:8,padding:"4px 14px",cursor:"pointer",fontSize:18}}>{"<"}</button>
          <span style={{fontSize:18,fontWeight:700,minWidth:160,textAlign:"center"}}>{MESES[mes]} {anio}</span>
          <button onClick={()=>{if(mes===11){setMes(0);setAnio(a=>a+1);}else setMes(m=>m+1);}}
            style={{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:8,padding:"4px 14px",cursor:"pointer",fontSize:18}}>{">"}</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        {[["semanal","Semanales"],["mensual","Mensuales"],["resumen","Resumen"],
          ...(usuarioActual.esCFO ? [["configurar","Configurar"]] : [])
        ].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{padding:"8px 20px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:600,fontSize:13,
              background:tab===t?"#2563eb":"#fff",color:tab===t?"#fff":"#374151",boxShadow:tab===t?"0 2px 8px #2563eb44":"0 1px 4px #0001"}}>{l}</button>
        ))}
      </div>

      {/* Filtro - solo CFO */}
      {usuarioActual.esCFO && (
        <div style={{display:"flex",gap:10,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
          <span style={{fontSize:13,color:"#64748b",fontWeight:500}}>Filtrar:</span>
          {["",...WORKERS.map(w=>w.nombre)].map(n=>(
            <button key={n||"todos"} onClick={()=>setFiltroPersona(n)}
              style={{padding:"5px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
                background:filtroPersona===n?"#1e3a5f":"#fff",color:filtroPersona===n?"#fff":"#374151",boxShadow:"0 1px 4px #0001"}}>
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
        <span style={{fontSize:11,color:"#64748b",background:"#fff",borderRadius:20,padding:"3px 12px",boxShadow:"0 1px 4px #0001"}}>Circulo opaco = sin permiso</span>
      </div>

      {/* SEMANAL */}
      {tab==="semanal" && (<>
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          {SEMANAS.map(s=>(
            <button key={s} onClick={()=>setSemanaActiva(s)}
              style={{padding:"8px 20px",borderRadius:10,border:"none",cursor:"pointer",fontWeight:700,fontSize:13,
                background:semanaActiva===s?"#0f172a":"#fff",color:semanaActiva===s?"#fff":"#374151",boxShadow:semanaActiva===s?"0 2px 8px #0003":"0 1px 4px #0001"}}>
              Semana {s}
              <div style={{fontSize:10,fontWeight:400,opacity:0.7}}>Sem {semanaDelAnio(anio,mes,s)}</div>
            </button>
          ))}
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{borderCollapse:"collapse",width:"100%",background:"#fff",borderRadius:14,overflow:"hidden",boxShadow:"0 2px 12px #0001"}}>
            {encabezadoTabla}
            <tbody><TablaFilas tareas={TAREAS_SEMANALES} getKey={t=>`${t.id}_s${semanaActiva}`} getSemana={()=>semanaActiva}/></tbody>
          </table>
        </div>
      </>)}

      {/* MENSUAL */}
      {tab==="mensual" && (
        <div style={{overflowX:"auto"}}>
          <div style={{background:"#fef9c3",border:"1px solid #fde047",borderRadius:10,padding:"10px 16px",marginBottom:14,fontSize:13,color:"#92400e"}}>
            Tareas de cierre mensual. Fechas configurables por el CFO.
          </div>
          <table style={{borderCollapse:"collapse",width:"100%",background:"#fff",borderRadius:14,overflow:"hidden",boxShadow:"0 2px 12px #0001"}}>
            {encabezadoTabla}
            <tbody><TablaFilas tareas={TAREAS_MENSUALES} getKey={t=>t.id} getSemana={null}/></tbody>
          </table>
        </div>
      )}

      {/* RESUMEN */}
      {tab==="resumen" && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))",gap:16}}>
          {WORKERS.map(w=>{
            const r = resumen(w.nombre);
            const resumenEmail = generarResumenEmail();
            const vencidas = resumenEmail[w.nombre]?.length || 0;
            return (
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
                  <button onClick={()=>enviarEmailPersona(w,resumenEmail[w.nombre])}
                    style={{width:"100%",background:"#ef4444",color:"#fff",border:"none",borderRadius:8,padding:"7px",cursor:"pointer",fontSize:12,fontWeight:600}}>
                    Enviar aviso a {w.nombre.split(" ")[0]}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* CONFIGURAR - solo CFO */}
      {tab==="configurar" && usuarioActual.esCFO && (
        <div style={{display:"flex",flexDirection:"column",gap:24}}>

          {/* Tareas semanales - dia de la semana */}
          <div style={{background:"#fff",borderRadius:14,padding:20,boxShadow:"0 2px 10px #0001"}}>
            <h3 style={{margin:"0 0 16px",color:"#1e293b",fontSize:15}}>Tareas Semanales - Dia limite</h3>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{background:"#f8fafc",color:"#64748b"}}>
                  <th style={{padding:"8px 12px",textAlign:"left",fontWeight:600}}>Tarea</th>
                  <th style={{padding:"8px 12px",textAlign:"center",fontWeight:600,width:120}}>Responsable</th>
                  <th style={{padding:"8px 12px",textAlign:"center",fontWeight:600,width:200}}>Dia de la semana</th>
                </tr>
              </thead>
              <tbody>
                {TAREAS_SEMANALES.map((t,i) => (
                  <tr key={t.id} style={{borderTop:"1px solid #f1f5f9",background:i%2===0?"#fff":"#f8fafc"}}>
                    <td style={{padding:"8px 12px",color:"#1e293b"}}>{t.nombre}</td>
                    <td style={{padding:"8px 12px",textAlign:"center",color:"#64748b"}}>{t.responsable.split(" ")[0]}</td>
                    <td style={{padding:"8px 12px",textAlign:"center"}}>
                      <select value={configSemanal[t.id]??t.diaLimiteSem}
                        onChange={e=>setConfigSemanal(prev=>({...prev,[t.id]:parseInt(e.target.value)}))}
                        style={{padding:"6px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,cursor:"pointer"}}>
                        {DIAS_SEMANA.map((d,idx)=><option key={idx} value={idx}>{d}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tareas mensuales - dia del mes */}
          <div style={{background:"#fff",borderRadius:14,padding:20,boxShadow:"0 2px 10px #0001"}}>
            <h3 style={{margin:"0 0 16px",color:"#1e293b",fontSize:15}}>Tareas Mensuales - Dia limite del mes</h3>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{background:"#f8fafc",color:"#64748b"}}>
                  <th style={{padding:"8px 12px",textAlign:"left",fontWeight:600}}>Tarea</th>
                  <th style={{padding:"8px 12px",textAlign:"center",fontWeight:600,width:120}}>Responsable</th>
                  <th style={{padding:"8px 12px",textAlign:"center",fontWeight:600,width:200}}>Dia del mes</th>
                </tr>
              </thead>
              <tbody>
                {TAREAS_MENSUALES.map((t,i) => (
                  <tr key={t.id} style={{borderTop:"1px solid #f1f5f9",background:i%2===0?"#fff":"#f8fafc"}}>
                    <td style={{padding:"8px 12px",color:"#1e293b"}}>{t.nombre}</td>
                    <td style={{padding:"8px 12px",textAlign:"center",color:"#64748b"}}>{t.responsable.split(" ")[0]}</td>
                    <td style={{padding:"8px 12px",textAlign:"center"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                        <button onClick={()=>setDiasLimite(prev=>({...prev,[t.id]:Math.max(1,(prev[t.id]||t.diaLimite)-1)}))}
                          style={{width:26,height:26,borderRadius:6,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontWeight:700}}>-</button>
                        <span style={{fontWeight:700,color:"#1e293b",minWidth:30,textAlign:"center",fontSize:15}}>{diasLimite[t.id]||t.diaLimite}</span>
                        <button onClick={()=>setDiasLimite(prev=>({...prev,[t.id]:Math.min(31,(prev[t.id]||t.diaLimite)+1)}))}
                          style={{width:26,height:26,borderRadius:6,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontWeight:700}}>+</button>
                        <input type="number" min={1} max={31} value={diasLimite[t.id]||t.diaLimite}
                          onChange={e=>{const v=parseInt(e.target.value);if(v>=1&&v<=31)setDiasLimite(prev=>({...prev,[t.id]:v}));}}
                          style={{width:50,padding:"4px 8px",borderRadius:6,border:"1px solid #d1d5db",textAlign:"center",fontSize:13}}/>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{background:"#dbeafe",borderRadius:10,padding:"10px 16px",fontSize:13,color:"#1d4ed8"}}>
            Los cambios se guardan automaticamente. La pestana Configurar solo es visible para el CFO.
          </div>
        </div>
      )}
    </div>
  );
}
