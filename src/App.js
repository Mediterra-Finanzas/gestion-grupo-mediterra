import { useState, useEffect, useCallback } from "react";

const SEMAFORO = {
  verde:    { label: "Completado", color: "#22c55e", bg: "#dcfce7", border: "#86efac" },
  amarillo: { label: "En proceso", color: "#eab308", bg: "#fef9c3", border: "#fde047" },
  rojo:     { label: "Pendiente",  color: "#ef4444", bg: "#fee2e2", border: "#fca5a5" },
  gris:     { label: "Sin iniciar",color: "#9ca3af", bg: "#f3f4f6", border: "#d1d5db" },
};

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const WORKERS = [
  { nombre: "Milagros Becerra", cargo: "Sec. Administrativa",  email: "Mbecerra@grupomediterra.cl" },
  { nombre: "Carol Machuca",    cargo: "Analista Finanzas",    email: "cmachuca@grupomediterra.cl" },
  { nombre: "Michelle García",  cargo: "Contadora General",    email: "mgarcia@grupomediterra.cl" },
  { nombre: "Pablo Durán",      cargo: "Asistente Contable",   email: "pduran@grupomediterra.cl" },
  { nombre: "Angelo Huerta",    cargo: "Gerencia / CFO",       email: "ahuerta@grupomediterra.cl" },
];

const CATEGORIAS = {
  "Finanzas":      { color: "#3b82f6", bg: "#dbeafe" },
  "Contabilidad":  { color: "#8b5cf6", bg: "#ede9fe" },
  "Tesorería":     { color: "#f59e0b", bg: "#fef3c7" },
  "Tributario":    { color: "#ef4444", bg: "#fee2e2" },
  "Administración":{ color: "#10b981", bg: "#d1fae5" },
  "Gerencia":      { color: "#6366f1", bg: "#e0e7ff" },
};

const TAREAS_SEMANALES = [
  { id:"s1",  nombre:"Preparación y carga de nóminas de pago",           responsable:"Milagros Becerra", supervisor:"Michelle García",  categoria:"Tesorería",      diaLimite:5  },
  { id:"s2",  nombre:"Coordinación de firmas de pagos y documentos",     responsable:"Milagros Becerra", supervisor:"Angelo Huerta",    categoria:"Tesorería",      diaLimite:5  },
  { id:"s3",  nombre:"Actualización y archivo de documentación admin",   responsable:"Milagros Becerra", supervisor:"",                 categoria:"Administración", diaLimite:7  },
  { id:"s4",  nombre:"Actualización flujo de caja proyectado (rolling)", responsable:"Carol Machuca",    supervisor:"Angelo Huerta",    categoria:"Finanzas",       diaLimite:6  },
  { id:"s5",  nombre:"Seguimiento ingresos, egresos y desviaciones",     responsable:"Carol Machuca",    supervisor:"Angelo Huerta",    categoria:"Finanzas",       diaLimite:6  },
  { id:"s6",  nombre:"Monitoreo KPIs críticos (caja, márgenes, costos)", responsable:"Carol Machuca",    supervisor:"Angelo Huerta",    categoria:"Finanzas",       diaLimite:7  },
  { id:"s7",  nombre:"Registro y revisión de movimientos contables",     responsable:"Michelle García",  supervisor:"",                 categoria:"Contabilidad",   diaLimite:5  },
  { id:"s8",  nombre:"Conciliación bancaria semanal",                    responsable:"Michelle García",  supervisor:"Angelo Huerta",    categoria:"Contabilidad",   diaLimite:7  },
  { id:"s9",  nombre:"Registro de facturas, boletas y gastos",           responsable:"Pablo Durán",      supervisor:"Michelle García",  categoria:"Contabilidad",   diaLimite:5  },
  { id:"s10", nombre:"Apoyo en conciliaciones bancarias",                responsable:"Pablo Durán",      supervisor:"Michelle García",  categoria:"Contabilidad",   diaLimite:7  },
  { id:"s11", nombre:"Preparación de respaldos para pagos",              responsable:"Pablo Durán",      supervisor:"Milagros Becerra", categoria:"Tesorería",      diaLimite:5  },
];

const TAREAS_MENSUALES = [
  { id:"m1",  nombre:"Consolidación y respaldo de documentos del mes",        responsable:"Milagros Becerra", supervisor:"Michelle García",  categoria:"Administración", diaLimite:5  },
  { id:"m2",  nombre:"Organización carpetas digitales/físicas por período",   responsable:"Milagros Becerra", supervisor:"",                 categoria:"Administración", diaLimite:5  },
  { id:"m3",  nombre:"Posición bancaria consolidada del mes",                 responsable:"Milagros Becerra", supervisor:"Angelo Huerta",    categoria:"Tesorería",      diaLimite:3  },
  { id:"m4",  nombre:"Apoyo en entrega antecedentes para cierre contable",    responsable:"Milagros Becerra", supervisor:"Michelle García",  categoria:"Administración", diaLimite:5  },
  { id:"m5",  nombre:"Cierre contable mensual (provisiones, ajustes)",        responsable:"Michelle García",  supervisor:"Angelo Huerta",    categoria:"Contabilidad",   diaLimite:10 },
  { id:"m6",  nombre:"Declaración impuestos mensuales (F29, F50, etc.)",      responsable:"Michelle García",  supervisor:"Angelo Huerta",    categoria:"Tributario",     diaLimite:12 },
  { id:"m7",  nombre:"Preparación de Estados Financieros",                    responsable:"Michelle García",  supervisor:"Angelo Huerta",    categoria:"Contabilidad",   diaLimite:15 },
  { id:"m8",  nombre:"Control cumplimiento tributario",                       responsable:"Michelle García",  supervisor:"Angelo Huerta",    categoria:"Tributario",     diaLimite:12 },
  { id:"m9",  nombre:"Validación integridad y consistencia de cifras",        responsable:"Michelle García",  supervisor:"Angelo Huerta",    categoria:"Contabilidad",   diaLimite:10 },
  { id:"m10", nombre:"EERR real vs presupuesto + análisis de variaciones",    responsable:"Carol Machuca",    supervisor:"Angelo Huerta",    categoria:"Finanzas",       diaLimite:15 },
  { id:"m11", nombre:"Actualización forecast financiero",                     responsable:"Carol Machuca",    supervisor:"Angelo Huerta",    categoria:"Finanzas",       diaLimite:15 },
  { id:"m12", nombre:"Análisis rentabilidad por unidad / cliente / producto", responsable:"Carol Machuca",    supervisor:"Angelo Huerta",    categoria:"Finanzas",       diaLimite:20 },
  { id:"m13", nombre:"Reporte de resultados para gerencia y directorio",      responsable:"Carol Machuca",    supervisor:"Angelo Huerta",    categoria:"Finanzas",       diaLimite:20 },
  { id:"m14", nombre:"Identificación de riesgos financieros y operacionales", responsable:"Carol Machuca",    supervisor:"Angelo Huerta",    categoria:"Finanzas",       diaLimite:20 },
  { id:"m15", nombre:"Apoyo en cierre contable – respaldos e impuestos",      responsable:"Pablo Durán",      supervisor:"Michelle García",  categoria:"Contabilidad",   diaLimite:8  },
  { id:"m16", nombre:"Validación documentos pendientes / inconsistencias",    responsable:"Pablo Durán",      supervisor:"Michelle García",  categoria:"Contabilidad",   diaLimite:8  },
  { id:"m17", nombre:"Orden y cierre de carpetas contables del mes",          responsable:"Pablo Durán",      supervisor:"Michelle García",  categoria:"Contabilidad",   diaLimite:10 },
  { id:"m18", nombre:"Reunión mensual de resultados (liderada por CFO)",      responsable:"Angelo Huerta",    supervisor:"",                 categoria:"Gerencia",       diaLimite:25 },
];

const SEMANAS = [1,2,3,4];
const ORDEN_SEM = ["gris","verde","amarillo","rojo"];
const STORAGE_KEY = "calendario_v5";

function semanaDelAño(año, mes, numSemana) {
  const primerDia = new Date(año, mes, 1);
  const diaSemana = primerDia.getDay() || 7;
  const inicioSemana = new Date(primerDia);
  inicioSemana.setDate(primerDia.getDate() - (diaSemana - 1) + (numSemana - 1) * 7);
  const tmp = new Date(inicioSemana);
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const w1 = new Date(tmp.getFullYear(), 0, 4);
  return 1 + Math.round(((tmp - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}

function initEstados() {
  const est = {};
  SEMANAS.forEach(s => {
    TAREAS_SEMANALES.forEach(t => { est[`${t.id}_s${s}`] = { estadoResp:"gris", estadoSup:"gris", aprobado:false }; });
  });
  TAREAS_MENSUALES.forEach(t => { est[t.id] = { estadoResp:"gris", estadoSup:"gris", aprobado:false }; });
  return est;
}

function initDiasLimite() {
  const d = {};
  [...TAREAS_SEMANALES, ...TAREAS_MENSUALES].forEach(t => { d[t.id] = t.diaLimite; });
  return d;
}

function estaVencida(tarea, estados, key, mes, año, diasLimite) {
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const dia = diasLimite[tarea.id] || tarea.diaLimite;
  const fechaLimite = new Date(año, mes, dia);
  return hoy > fechaLimite && (estados[key]?.estadoResp || "gris") === "gris";
}

function estaProxima(tarea, mes, año, diasLimite) {
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const dia = diasLimite[tarea.id] || tarea.diaLimite;
  const fechaLimite = new Date(año, mes, dia);
  const diff = (fechaLimite - hoy) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 3;
}

export default function App() {
  const hoy = new Date();
  const [mes, setMes] = useState(hoy.getMonth());
  const [año, setAño] = useState(hoy.getFullYear());
  const [estados, setEstados] = useState(initEstados);
  const [comentarios, setComentarios] = useState({});
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
        if (d.estados)    setEstados(prev => ({...initEstados(), ...d.estados}));
        if (d.comentarios) setComentarios(d.comentarios);
        if (d.diasLimite) setDiasLimite(prev => ({...prev, ...d.diasLimite}));
        if (d.mes !== undefined) setMes(d.mes);
        if (d.año !== undefined) setAño(d.año);
      }
    } catch {}
    setCargando(false);
  }, []);

  const guardar = useCallback((est, com, dias, m, a) => {
    setGuardado("guardando");
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ estados:est, comentarios:com, diasLimite:dias, mes:m, año:a }));
      setGuardado("ok");
      setTimeout(() => setGuardado("idle"), 2000);
    } catch {
      setGuardado("error");
      setTimeout(() => setGuardado("idle"), 3000);
    }
  }, []);

  useEffect(() => {
    if (cargando) return;
    const t = setTimeout(() => guardar(estados, comentarios, diasLimite, mes, año), 800);
    return () => clearTimeout(t);
  }, [estados, comentarios, diasLimite, mes, año, cargando, guardar]);

  function ciclarResp(key) {
    setEstados(prev => {
      const actual = prev[key]?.estadoResp || "gris";
      const sig = ORDEN_SEM[(ORDEN_SEM.indexOf(actual)+1) % ORDEN_SEM.length];
      return {...prev, [key]: {...prev[key], estadoResp:sig, aprobado:false, estadoSup: sig!=="verde"?"gris":prev[key].estadoSup}};
    });
  }

  function ciclarSup(key) {
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

  function generarResumenEmail() {
    const res = {};
    WORKERS.forEach(w => { res[w.nombre] = []; });
    const todas = [
      ...SEMANAS.flatMap(s => TAREAS_SEMANALES.map(t => ({...t, key:`${t.id}_s${s}`, semana:s}))),
      ...TAREAS_MENSUALES.map(t => ({...t, key:t.id}))
    ];
    todas.forEach(t => { if (estaVencida(t, estados, t.key, mes, año, diasLimite)) res[t.responsable]?.push(t); });
    return res;
  }

  function abrirEmailResumen() {
    const resumen = generarResumenEmail();
    const hayVencidas = WORKERS.some(w => (resumen[w.nombre]||[]).length > 0);
    if (!hayVencidas) { alert("✅ ¡No hay tareas vencidas! Todo está al día."); return; }
    setModalEmail({ resumen });
  }

  function enviarEmailPersona(w, tareas) {
    const asunto = encodeURIComponent(`⚠️ Tareas pendientes - ${MESES[mes]} ${año}`);
    const cuerpo = encodeURIComponent(
      `Hola ${w.nombre.split(" ")[0]},\n\n` +
      `Las siguientes tareas de ${MESES[mes]} ${año} están vencidas y sin iniciar:\n\n` +
      tareas.map(t => `• ${t.nombre}\n  Fecha límite: ${diasLimite[t.id]||t.diaLimite} de ${MESES[mes]}`).join('\n\n') +
      `\n\nActualiza tu estado en:\nhttps://calendario-mediterra-2026.vercel.app\n\nSaludos`
    );
    window.open(`mailto:${w.email}?subject=${asunto}&body=${cuerpo}`);
  }

  const totalVencidas = (() => {
    let c = 0;
    const todas = [
      ...SEMANAS.flatMap(s => TAREAS_SEMANALES.map(t => ({...t, key:`${t.id}_s${s}`}))),
      ...TAREAS_MENSUALES.map(t => ({...t, key:t.id}))
    ];
    todas.forEach(t => { if (estaVencida(t, estados, t.key, mes, año, diasLimite)) c++; });
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

  function TablaFilas({ tareas, getKey }) {
    const filtradas = filtroPersona ? tareas.filter(t => t.responsable===filtroPersona || t.supervisor===filtroPersona) : tareas;
    return filtradas.map((t,i) => {
      const key = getKey(t);
      const est = estados[key] || {estadoResp:"gris",estadoSup:"gris",aprobado:false};
      const semResp = SEMAFORO[est.estadoResp];
      const supActivo = est.estadoResp==="verde" && t.supervisor;
      const semSup = SEMAFORO[supActivo ? est.estadoSup : "gris"];
      const cat = CATEGORIAS[t.categoria] || {color:"#64748b",bg:"#f1f5f9"};
      const com = comentarios[key] || "";
      const vencida = estaVencida(t, estados, key, mes, año, diasLimite);
      const proxima = !vencida && estaProxima(t, mes, año, diasLimite) && est.estadoResp==="gris";
      const diaActual = diasLimite[t.id] || t.diaLimite;
      return (
        <tr key={key} style={{borderBottom:"1px solid #f1f5f9",
          background: vencida?"#fff5f5":proxima?"#fffbeb":i%2===0?"#fff":"#f8fafc",
          borderLeft: vencida?"4px solid #ef4444":proxima?"4px solid #f59e0b":"4px solid transparent"}}>
          <td style={{padding:"9px 14px"}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              {vencida && <span title="Vencida">🚨</span>}
              {proxima && <span title="Vence pronto">⚠️</span>}
              <div style={{fontWeight:500,color:vencida?"#ef4444":"#1e293b",fontSize:13}}>{t.nombre}</div>
            </div>
            <div style={{display:"flex",gap:6,marginTop:2,alignItems:"center"}}>
              <span style={{fontSize:10,background:cat.bg,color:cat.color,borderRadius:20,padding:"1px 8px",fontWeight:600}}>{t.categoria}</span>
              <span style={{fontSize:10,color:vencida?"#ef4444":proxima?"#f59e0b":"#94a3b8"}}>📅 Límite: {diaActual} {MESES[mes]}</span>
            </div>
          </td>
          <td style={{textAlign:"center",padding:"9px 8px",fontSize:12,color:"#374151"}}>{t.responsable.split(" ")[0]}</td>
          <td style={{textAlign:"center",padding:"9px 8px"}}>
            <button onClick={()=>ciclarResp(key)} title={semResp.label}
              style={{width:28,height:28,borderRadius:"50%",background:semResp.color,border:`3px solid ${semResp.border}`,cursor:"pointer",outline:"none",boxShadow:"0 2px 6px #0002",transition:"transform 0.1s"}}
              onMouseEnter={e=>e.target.style.transform="scale(1.2)"} onMouseLeave={e=>e.target.style.transform="scale(1)"}/>
          </td>
          <td style={{textAlign:"center",padding:"9px 8px",fontSize:12,color:"#374151"}}>
            {t.supervisor ? t.supervisor.split(" ")[0] : <span style={{color:"#d1d5db"}}>—</span>}
          </td>
          <td style={{textAlign:"center",padding:"9px 8px"}}>
            {t.supervisor ? (
              <button onClick={()=>supActivo&&ciclarSup(key)}
                style={{width:28,height:28,borderRadius:"50%",background:supActivo?semSup.color:"#e5e7eb",
                  border:`3px solid ${supActivo?semSup.border:"#d1d5db"}`,cursor:supActivo?"pointer":"not-allowed",outline:"none",opacity:supActivo?1:0.4}}/>
            ) : <span style={{color:"#d1d5db",fontSize:12}}>—</span>}
          </td>
          <td style={{textAlign:"center",padding:"9px 8px"}}>
            <button onClick={()=>{ setEditComentario(key); setTextoComentario(com); }}
              style={{background:com?"#dbeafe":"#f1f5f9",border:"none",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontSize:11,color:com?"#1d4ed8":"#9ca3af",maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {com?`💬 ${com.substring(0,12)}${com.length>12?"…":""}`:"+"}
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
        <th style={{padding:"10px 8px",textAlign:"center",minWidth:90}}>👤 Responsable</th>
        <th style={{padding:"10px 8px",textAlign:"center",minWidth:70}}>Estado</th>
        <th style={{padding:"10px 8px",textAlign:"center",minWidth:90}}>👁 Supervisor</th>
        <th style={{padding:"10px 8px",textAlign:"center",minWidth:70}}>Aprobación</th>
        <th style={{padding:"10px 8px",textAlign:"center",minWidth:100}}>💬 Comentario</th>
      </tr>
    </thead>
  );

  if (cargando) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"sans-serif",color:"#64748b",fontSize:18}}>Cargando...</div>;

  return (
    <div style={{fontFamily:"sans-serif",background:"#f8fafc",minHeight:"100vh",padding:"20px"}}>

      {/* Modal comentario */}
      {editComentario !== null && (
        <div style={{position:"fixed",inset:0,background:"#0006",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:16,padding:28,width:420,maxWidth:"90vw",boxShadow:"0 8px 32px #0003"}}>
            <h3 style={{margin:"0 0 14px",color:"#1e293b"}}>💬 Comentario</h3>
            <textarea value={textoComentario} onChange={e=>setTextoComentario(e.target.value)} rows={4} placeholder="Escribe un comentario..."
              style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:14,resize:"vertical",boxSizing:"border-box"}}/>
            <div style={{display:"flex",gap:10,marginTop:14,justifyContent:"flex-end"}}>
              <button onClick={()=>setEditComentario(null)} style={{padding:"8px 18px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer",fontSize:14}}>Cancelar</button>
              <button onClick={guardarComentario} style={{padding:"8px 18px",borderRadius:8,border:"none",background:"#2563eb",color:"#fff",cursor:"pointer",fontSize:14,fontWeight:600}}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal email */}
      {modalEmail && (
        <div style={{position:"fixed",inset:0,background:"#0006",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:16,padding:28,width:500,maxWidth:"90vw",maxHeight:"80vh",overflowY:"auto",boxShadow:"0 8px 32px #0003"}}>
            <h3 style={{margin:"0 0 6px",color:"#1e293b"}}>📧 Enviar aviso de tareas vencidas</h3>
            <p style={{fontSize:13,color:"#64748b",marginBottom:16}}>{MESES[mes]} {año}</p>
            {WORKERS.map(w => {
              const tareas = modalEmail.resumen[w.nombre] || [];
              if (!tareas.length) return null;
              return (
                <div key={w.nombre} style={{background:"#fff5f5",border:"1px solid #fca5a5",borderRadius:10,padding:"12px 16px",marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontWeight:600,color:"#1e293b",fontSize:14}}>{w.nombre}</div>
                      <div style={{fontSize:11,color:"#64748b"}}>{w.email} · {tareas.length} tarea{tareas.length>1?"s":""} vencida{tareas.length>1?"s":""}</div>
                    </div>
                    <button onClick={()=>enviarEmailPersona(w,tareas)}
                      style={{background:"#ef4444",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12,fontWeight:600}}>
                      Enviar 📧
                    </button>
                  </div>
                  <ul style={{margin:"8px 0 0",paddingLeft:16,fontSize:12,color:"#374151"}}>
                    {tareas.map(t=><li key={t.key}>📌 {t.nombre} — venció el {diasLimite[t.id]||t.diaLimite} de {MESES[mes]}</li>)}
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
            <h1 style={{margin:0,fontSize:22,fontWeight:800}}>📅 Control Financiero & Administrativo</h1>
            <div style={{fontSize:12,opacity:0.8,marginTop:4}}>{WORKERS.map(w=>`${w.nombre.split(" ")[0]} (${w.cargo})`).join(" · ")}</div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            {totalVencidas>0 && (
              <button onClick={abrirEmailResumen}
                style={{background:"#ef4444",color:"#fff",border:"none",borderRadius:10,padding:"8px 16px",cursor:"pointer",fontWeight:700,fontSize:13,boxShadow:"0 2px 8px #ef444466"}}>
                🚨 {totalVencidas} vencida{totalVencidas>1?"s":""} · Enviar aviso
              </button>
            )}
            {estadoGuardadoUI && <span style={{fontSize:12,color:"#fff",background:"rgba(255,255,255,0.15)",borderRadius:20,padding:"4px 12px"}}>{estadoGuardadoUI.icon} {estadoGuardadoUI.text}</span>}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12,marginTop:12}}>
          <button onClick={()=>{if(mes===0){setMes(11);setAño(a=>a-1);}else setMes(m=>m-1);}}
            style={{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:8,padding:"4px 14px",cursor:"pointer",fontSize:18}}>‹</button>
          <span style={{fontSize:18,fontWeight:700,minWidth:160,textAlign:"center"}}>{MESES[mes]} {año}</span>
          <button onClick={()=>{if(mes===11){setMes(0);setAño(a=>a+1);}else setMes(m=>m+1);}}
            style={{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:8,padding:"4px 14px",cursor:"pointer",fontSize:18}}>›</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        {[["semanal","📋 Semanales"],["mensual","📆 Mensuales"],["resumen","📊 Resumen"],["configurar","⚙️ Configurar"]].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{padding:"8px 20px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:600,fontSize:13,
              background:tab===t?"#2563eb":"#fff",color:tab===t?"#fff":"#374151",boxShadow:tab===t?"0 2px 8px #2563eb44":"0 1px 4px #0001"}}>{l}</button>
        ))}
      </div>

      {/* Filtro */}
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

      {/* Leyenda */}
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
        {Object.entries(SEMAFORO).map(([k,v])=>(
          <span key={k} style={{display:"flex",alignItems:"center",gap:5,background:"#fff",borderRadius:20,padding:"3px 12px",boxShadow:"0 1px 4px #0001",fontSize:11}}>
            <span style={{width:11,height:11,borderRadius:"50%",background:v.color,display:"inline-block"}}></span>{v.label}
          </span>
        ))}
        <span style={{fontSize:11,color:"#ef4444",background:"#fff5f5",borderRadius:20,padding:"3px 12px",boxShadow:"0 1px 4px #0001"}}>🚨 Vencida</span>
        <span style={{fontSize:11,color:"#f59e0b",background:"#fffbeb",borderRadius:20,padding:"3px 12px",boxShadow:"0 1px 4px #0001"}}>⚠️ Vence en 3 días</span>
      </div>

      {/* SEMANAL */}
      {tab==="semanal" && (<>
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          {SEMANAS.map(s=>(
            <button key={s} onClick={()=>setSemanaActiva(s)}
              style={{padding:"8px 20px",borderRadius:10,border:"none",cursor:"pointer",fontWeight:700,fontSize:13,
                background:semanaActiva===s?"#0f172a":"#fff",color:semanaActiva===s?"#fff":"#374151",boxShadow:semanaActiva===s?"0 2px 8px #0003":"0 1px 4px #0001"}}>
              Semana {s}<div style={{fontSize:10,fontWeight:400,opacity:0.7}}>Sem {semanaDelAño(año,mes,s)}</div>
            </button>
          ))}
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{borderCollapse:"collapse",width:"100%",background:"#fff",borderRadius:14,overflow:"hidden",boxShadow:"0 2px 12px #0001"}}>
            {encabezadoTabla}
            <tbody><TablaFilas tareas={TAREAS_SEMANALES} getKey={t=>`${t.id}_s${semanaActiva}`}/></tbody>
          </table>
        </div>
      </>)}

      {/* MENSUAL */}
      {tab==="mensual" && (
        <div style={{overflowX:"auto"}}>
          <div style={{background:"#fef9c3",border:"1px solid #fde047",borderRadius:10,padding:"10px 16px",marginBottom:14,fontSize:13,color:"#92400e"}}>
            📆 Estas tareas se realizan <strong>una vez al mes</strong>. Cada una tiene su fecha límite configurable en ⚙️ Configurar.
          </div>
          <table style={{borderCollapse:"collapse",width:"100%",background:"#fff",borderRadius:14,overflow:"hidden",boxShadow:"0 2px 12px #0001"}}>
            {encabezadoTabla}
            <tbody><TablaFilas tareas={TAREAS_MENSUALES} getKey={t=>t.id}/></tbody>
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
              <div key={w.nombre} style={{background:"#fff
