/* eslint-disable */
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";

// Componente DateInput: evita re-renders al escribir año en campos date
function DateInput({value, onChange, disabled, style}) {
  const [local, setLocal] = useState(value||"");
  useEffect(()=>{ setLocal(value||""); },[value]);
  return <input type="date" disabled={disabled} value={local} onChange={e=>setLocal(e.target.value)} onBlur={()=>onChange(local)} style={style}/>;
}

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

const FRUTAS = ["Cerezas", "Ciruelas d'Agen", "Arándanos", "Uvas", "Zarzaparrilla"];

const REGIONES_COMUNAS = {
  "Arica y Parinacota":["Arica","Camarones","General Lagos","Putre"],
  "Tarapacá":["Alto Hospicio","Camiña","Colchane","Huara","Iquique","Pica","Pozo Almonte"],
  "Antofagasta":["Antofagasta","Calama","María Elena","Mejillones","Ollagüe","San Pedro de Atacama","Sierra Gorda","Taltal","Tocopilla"],
  "Atacama":["Alto del Carmen","Caldera","Chañaral","Copiapó","Diego de Almagro","Freirina","Huasco","Tierra Amarilla","Vallenar"],
  "Coquimbo":["Andacollo","Canela","Combarbalá","Coquimbo","Illapel","La Higuera","La Serena","Los Vilos","Monte Patria","Ovalle","Paihuano","Punitaqui","Río Hurtado","Salamanca","Vicuña"],
  "Valparaíso":["Algarrobo","Cabildo","Calera","Cartagena","Casablanca","Catemu","Concón","El Quisco","El Tabo","Hijuelas","Isla de Pascua","Juan Fernández","La Cruz","La Ligua","Limache","Llaillay","Los Andes","Nogales","Olmué","Panquehue","Papudo","Petorca","Puchuncaví","Putaendo","Quillota","Quilpué","Quintero","Rinconada","San Antonio","San Esteban","San Felipe","Santa María","Santo Domingo","Valparaíso","Villa Alemana","Viña del Mar","Zapallar"],
  "Metropolitana":["Alhué","Buin","Calera de Tango","Cerrillos","Cerro Navia","Colina","Conchalí","Curacaví","El Bosque","El Monte","Estación Central","Huechuraba","Independencia","Isla de Maipo","La Cisterna","La Florida","La Granja","La Pintana","La Reina","Lampa","Las Condes","Lo Barnechea","Lo Espejo","Lo Prado","Macul","Maipú","María Pinto","Melipilla","Ñuñoa","Padre Hurtado","Paine","Pedro Aguirre Cerda","Peñaflor","Peñalolén","Pirque","Providencia","Pudahuel","Puente Alto","Quilicura","Quinta Normal","Recoleta","Renca","San Bernardo","San Joaquín","San José de Maipo","San Miguel","San Pedro","San Ramón","Santiago","Talagante","Tiltil","Vitacura"],
  "O'Higgins":["Chimbarongo","Chépica","Codegua","Coinco","Coltauco","Doñihue","Graneros","La Estrella","Las Cabras","Litueche","Lolol","Machalí","Malloa","Marchigüe","Mostazal","Nancagua","Navidad","Olivar","Palmilla","Paredones","Peralillo","Peumo","Pichidegua","Pichilemu","Placilla","Pumanque","Quinta de Tilcoco","Rancagua","Rengo","Requínoa","San Fernando","San Vicente","Santa Cruz"],
  "Maule":["Cauquenes","Chanco","Colbún","Constitución","Curepto","Curicó","Empedrado","Hualañé","Licantén","Linares","Longaví","Maule","Molina","Parral","Pelarco","Pelluhue","Pencahue","Rauco","Retiro","Río Claro","Romeral","Sagrada Familia","San Clemente","San Javier","San Rafael","Talca","Teno","Vichuquén","Villa Alegre","Yerbas Buenas"],
  "Ñuble":["Bulnes","Chillán","Chillán Viejo","Cobquecura","Coelemu","Coihueco","El Carmen","Ninhue","Ñiquén","Pemuco","Pinto","Portezuelo","Quillón","Quirihue","Ránquil","San Carlos","San Fabián","San Ignacio","San Nicolás","Treguaco","Yungay"],
  "Biobío":["Alto Biobío","Antuco","Arauco","Cabrero","Cañete","Chiguayante","Concepción","Contulmo","Coronel","Curanilahue","Florida","Hualpén","Hualqui","Laja","Lebu","Los Álamos","Los Ángeles","Lota","Mulchén","Nacimiento","Negrete","Penco","Quilaco","Quilleco","San Pedro de la Paz","San Rosendo","Santa Bárbara","Santa Juana","Talcahuano","Tirúa","Tomé","Tucapel","Yumbel"],
  "Araucanía":["Angol","Carahue","Cholchol","Collipulli","Cunco","Curacautín","Curarrehue","Ercilla","Freire","Galvarino","Gorbea","Lautaro","Loncoche","Lonquimay","Los Sauces","Lumaco","Melipeuco","Nueva Imperial","Padre Las Casas","Perquenco","Pitrufquén","Pucón","Purén","Renaico","Saavedra","Temuco","Teodoro Schmidt","Toltén","Traiguén","Victoria","Vilcún","Villarrica"],
  "Los Ríos":["Corral","Futrono","La Unión","Lago Ranco","Lanco","Los Lagos","Máfil","Mariquina","Paillaco","Panguipulli","Río Bueno","San José de la Mariquina","Valdivia"],
  "Los Lagos":["Ancud","Calbuco","Castro","Chaitén","Chonchi","Cochamó","Curaco de Vélez","Dalcahue","Fresia","Frutillar","Futaleufú","Hualaihué","Llanquihue","Los Muermos","Maullín","Osorno","Palena","Puerto Montt","Puerto Octay","Puerto Varas","Puqueldón","Purranque","Puyehue","Queilén","Quellón","Quemchi","Quinchao","Río Negro","San Juan de la Costa","San Pablo"],
  "Aysén":["Aysén","Chile Chico","Cisnes","Cochrane","Coyhaique","Guaitecas","Lago Verde","O'Higgins","Río Ibáñez","Tortel"],
  "Magallanes":["Antártica","Cabo de Hornos","Laguna Blanca","Natales","Porvenir","Primavera","Punta Arenas","Río Verde","San Gregorio","Timaukel","Torres del Paine"],
};
const REGIONES = Object.keys(REGIONES_COMUNAS);

// Formato RUT chileno: xx.xxx.xxx-x
function formatRUT(value) {
  let v = (value||"").replace(/[^0-9kK]/g,"");
  if(v.length < 2) return v;
  const dv = v.slice(-1);
  let body = v.slice(0,-1);
  body = body.replace(/\B(?=(\d{3})+(?!\d))/g,".");
  return `${body}-${dv}`;
}

// Maestro de especies y variedades para Allegria Foods
const ESPECIES_ALLEGRIA_INIT = [
  {id:"ea_cerezas",   nombre:"Cerezas",         color:"#dc2626"},
  {id:"ea_ciruelas",  nombre:"Ciruelas d'Agen", color:"#7c3aed"},
  {id:"ea_arandanos", nombre:"Arándanos",        color:"#2563eb"},
  {id:"ea_uvas",      nombre:"Uvas",             color:"#16a34a"},
  {id:"ea_zarzaparr", nombre:"Zarzaparrilla",    color:"#ea580c"},
];

function MaestroAllegria({especies, setEspecies, variedades, setVariedades, can}) {
  const [tab, setTab] = useState("especies");
  const [modal, setModal] = useState(null); // "especie" | "variedad"
  const [form, setForm] = useState({});
  const [editId, setEditId] = useState(null);

  function guardarEspecie() {
    if(!form.nombre){alert("Nombre obligatorio.");return;}
    if(editId) setEspecies(prev=>prev.map(e=>e.id===editId?{...e,...form}:e));
    else setEspecies(prev=>[...prev,{...form,id:`ea_${Date.now()}`}]);
    setForm({});setModal(null);setEditId(null);
  }
  function guardarVariedad() {
    if(!form.especie||!form.variedad){alert("Especie y variedad obligatorios.");return;}
    if(editId) setVariedades(prev=>prev.map(v=>v.id===editId?{...v,...form}:v));
    else setVariedades(prev=>[...prev,{...form,id:`va_${Date.now()}`}]);
    setForm({});setModal(null);setEditId(null);
  }

  return(
    <div style={{marginBottom:20,border:`1px solid ${C.border}`,borderRadius:12,padding:16,background:C.card2}}>
      <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{fontWeight:700,color:C.text,fontSize:14}}>🌳 Maestro Especies & Variedades</div>
        <button onClick={()=>setTab("especies")} style={{padding:"5px 14px",borderRadius:8,border:tab==="especies"?`2px solid ${C.teal}`:`1px solid ${C.border}`,background:tab==="especies"?C.teal:"transparent",color:tab==="especies"?"#fff":C.muted,cursor:"pointer",fontSize:11,fontWeight:700}}>Especies</button>
        <button onClick={()=>setTab("variedades")} style={{padding:"5px 14px",borderRadius:8,border:tab==="variedades"?`2px solid ${C.teal}`:`1px solid ${C.border}`,background:tab==="variedades"?C.teal:"transparent",color:tab==="variedades"?"#fff":C.muted,cursor:"pointer",fontSize:11,fontWeight:700}}>Variedades</button>
      </div>
      {tab==="especies"&&(
        <div>
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
            {can&&<button onClick={()=>{setModal("especie");setEditId(null);setForm({nombre:"",color:"#6366f1"});}} style={{background:C.teal,color:"#fff",border:"none",borderRadius:6,padding:"5px 14px",cursor:"pointer",fontSize:11,fontWeight:700}}>+ Especie</button>}
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {especies.map(e=>(
              <div key={e.id} style={{padding:"6px 14px",borderRadius:20,background:`${e.color||"#6366f1"}22`,color:e.color||"#6366f1",fontWeight:700,fontSize:12,cursor:can?"pointer":"default",border:`1px solid ${e.color||"#6366f1"}44`}}
                onClick={()=>{if(!can)return;setEditId(e.id);setForm({nombre:e.nombre,color:e.color});setModal("especie");}}>
                {e.nombre}
              </div>
            ))}
          </div>
        </div>
      )}
      {tab==="variedades"&&(
        <div>
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
            {can&&<button onClick={()=>{setModal("variedad");setEditId(null);setForm({especie:"",variedad:"",obtentor:"",observaciones:""});}} style={{background:C.teal,color:"#fff",border:"none",borderRadius:6,padding:"5px 14px",cursor:"pointer",fontSize:11,fontWeight:700}}>+ Variedad</button>}
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead><tr style={{background:C.bg2}}>{["Especie","Variedad","Obtentor","Obs.",""].map(h=><th key={h} style={{padding:"6px 10px",textAlign:"left",color:C.muted,fontWeight:700,fontSize:10}}>{h}</th>)}</tr></thead>
              <tbody>{variedades.map((v,i)=>(
                <tr key={v.id} style={{borderBottom:`1px solid ${C.border}22`}}>
                  <td style={{padding:"6px 10px"}}><span style={{fontSize:9,padding:"2px 8px",borderRadius:10,fontWeight:700,background:`${(especies.find(e=>e.nombre===v.especie)||{}).color||"#6366f1"}22`,color:(especies.find(e=>e.nombre===v.especie)||{}).color||"#6366f1"}}>{v.especie}</span></td>
                  <td style={{padding:"6px 10px",fontWeight:600,color:C.text}}>{v.variedad}</td>
                  <td style={{padding:"6px 10px",color:C.muted}}>{v.obtentor||"—"}</td>
                  <td style={{padding:"6px 10px",color:C.muted,fontSize:10}}>{v.observaciones||"—"}</td>
                  <td style={{padding:"6px 10px"}}>{can&&<button onClick={()=>{setEditId(v.id);setForm({...v});setModal("variedad");}} style={{background:C.card2,border:`1px solid ${C.border}`,color:C.muted,borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:10}}>✏️</button>}</td>
                </tr>))}
                {variedades.length===0&&<tr><td colSpan={5} style={{padding:20,textAlign:"center",color:C.muted2}}>Sin variedades</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setModal(null)}>
          <div style={{background:C.card,borderRadius:14,padding:24,maxWidth:400,width:"100%",border:`1px solid ${C.border}`}} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:"0 0 16px",color:C.text}}>{editId?"Editar":"Nueva"} {modal==="especie"?"Especie":"Variedad"}</h3>
            {modal==="especie"?(
              <div style={{display:"grid",gap:12}}>
                <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Nombre *</div><input value={form.nombre||""} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}/></div>
                <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Color</div><input type="color" value={form.color||"#6366f1"} onChange={e=>setForm(p=>({...p,color:e.target.value}))} style={{width:60,height:32,border:"none",cursor:"pointer"}}/></div>
              </div>
            ):(
              <div style={{display:"grid",gap:12}}>
                <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Especie *</div><select value={form.especie||""} onChange={e=>setForm(p=>({...p,especie:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}><option value="">—</option>{especies.map(e=><option key={e.id} value={e.nombre}>{e.nombre}</option>)}</select></div>
                <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Variedad *</div><input value={form.variedad||""} onChange={e=>setForm(p=>({...p,variedad:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}/></div>
                <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Obtentor</div><input value={form.obtentor||""} onChange={e=>setForm(p=>({...p,obtentor:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}/></div>
              </div>
            )}
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
              <button onClick={()=>setModal(null)} style={{padding:"8px 18px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer"}}>Cancelar</button>
              <button onClick={modal==="especie"?guardarEspecie:guardarVariedad} style={{padding:"8px 18px",borderRadius:8,border:"none",background:C.teal,color:"#fff",cursor:"pointer",fontWeight:700}}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
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
    // Protección anti-pérdida: solo bloquea caídas masivas (>50%) o todo a 0
    if(value) {
      const keys = ["clientes","productores","embarques","liquidaciones","liqCliente","anticipos","cobranza","recepciones","stockPT","materiales","recetas","programaComercial"];
      for(const k of keys) {
        const nc = Array.isArray(value[k]) ? value[k].length : -1;
        const pc = window._lastSavedAllegria?.[k] || 0;
        if(pc >= 3 && nc >= 0 && nc < pc * 0.5) {
          console.warn(`[dbSaveAllegria] ⚠️ BLOQUEADO: ${k} pasó de ${pc} a ${nc} (caída >50%).`);
          return;
        }
        if(pc > 0 && nc === 0) {
          console.warn(`[dbSaveAllegria] ⚠️ BLOQUEADO: ${k} pasó de ${pc} a 0.`);
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
  const [detalle, setDetalle] = useState(null);
  const [tab, setTab] = useState("ficha");
  const EMPTY = {nombre:"",rut:"",pais:"Chile",zona:"",contacto:"",email:"",telefono:"",frutas:[],hectareas:"",notas:"",
    contrato:{estado:"Sin contrato",tipoContrato:"",fechaInicio:"",fechaTermino:"",condiciones:"",kgPactados:[],fechaPagoLiq:"",comisionPct:"",linkContrato:"",garantias:[],observaciones:""},
    anticipos:[],visitas:[]};
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);

  const filtrado = data.filter(p=>!busq||p.nombre?.toLowerCase().includes(busq.toLowerCase()));
  const prod = detalle ? data.find(p=>p.id===detalle) : null;
  const upd = (campo, valor) => setData(prev=>prev.map(p=>p.id===detalle?{...p,[campo]:valor}:p));
  const updContrato = (campo, valor) => setData(prev=>prev.map(p=>p.id===detalle?{...p,contrato:{...(p.contrato||{}),[campo]:valor}}:p));

  const ESTADOS_CONTRATO = ["Sin contrato","Borrador","En negociación","Firmado","Vigente","Vencido","Cancelado"];
  const TIPOS_CONTRATO = ["Consignación","Precio mínimo garantizado","Precio fijo","Pool","Otro"];
  const TIPOS_GARANTIA = ["Pagaré","Prenda","Hipoteca","Boleta de garantía","Carta fianza","Otro"];
  const TIPOS_VISITA = ["Pre-temporada","En cosecha","Post-cosecha","Seguimiento","Emergencia"];
  const ESTADOS_VISITA = ["Programada","Realizada","Cancelada"];

  function guardar() {
    if(!form.nombre.trim()){alert("Nombre es obligatorio.");return;}
    if(editId) { setData(prev=>prev.map(p=>p.id===editId?{...p,...form}:p)); }
    else { setData(prev=>[...prev,{...form,id:`aprod_${Date.now()}`}]); }
    setForm(EMPTY);setModal(false);setEditId(null);
  }

  // ── Vista detalle ──
  if(prod) {
    const contrato = prod.contrato || {};
    const anticipos = Array.isArray(prod.anticipos) ? prod.anticipos : [];
    const visitas = Array.isArray(prod.visitas) ? prod.visitas : [];
    const kgPactados = Array.isArray(contrato.kgPactados) ? contrato.kgPactados : [];
    const garantias = Array.isArray(contrato.garantias) ? contrato.garantias : [];
    const TABS = [{id:"ficha",label:"📋 Ficha"},{id:"contrato",label:"📄 Contrato"},{id:"anticipos",label:"💵 Anticipos"},{id:"visitas",label:"🌿 Visitas"},{id:"checklist",label:"✅ Checklist"}];
    const estColor = contrato.estado==="Firmado"||contrato.estado==="Vigente"?"#16a34a":contrato.estado==="Vencido"||contrato.estado==="Cancelado"?"#dc2626":"#d97706";

    return (
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <button onClick={()=>{setDetalle(null);setTab("ficha");}} style={{background:C.card2,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 14px",cursor:"pointer",color:C.muted,fontSize:12}}>← Volver</button>
            <h3 style={{margin:0,color:C.text,fontSize:18}}>{prod.nombre}</h3>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <span style={{fontSize:10,padding:"4px 12px",borderRadius:20,background:`${estColor}22`,color:estColor,fontWeight:700}}>{contrato.estado||"Sin contrato"}</span>
            {prod.pais&&<span style={{fontSize:10,padding:"4px 12px",borderRadius:20,background:`${C.blue}22`,color:C.blue,fontWeight:700}}>{prod.pais}</span>}
          </div>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
          {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"8px 16px",borderRadius:8,border:tab===t.id?`2px solid ${C.teal}`:`1px solid ${C.border}`,
              background:tab===t.id?C.teal:"transparent",color:tab===t.id?"#fff":C.muted,cursor:"pointer",fontSize:12,fontWeight:700}}>{t.label}</button>)}
        </div>

        {/* TAB FICHA */}
        {tab==="ficha"&&(
          <div>
            {/* Datos empresa */}
            <div style={{fontSize:12,fontWeight:700,color:C.teal,borderBottom:`1px solid ${C.border}`,paddingBottom:6,marginBottom:12}}>🏢 Datos de la empresa</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:16}}>
              {[["Razón social","nombre"],["RUT empresa","rut"],["País","pais"],["Contacto operativo","contacto"],["Email contacto","email"],["Teléfono","telefono"],["Hectáreas","hectareas"]].map(([l,f])=>(
                <div key={f}><div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>{l}</div>
                  <input disabled={!can} value={prod[f]||""} onChange={e=>upd(f,f.toLowerCase().includes("rut")?formatRUT(e.target.value):e.target.value)}
                    style={{width:"100%",padding:"8px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}/></div>
              ))}
              <div><div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Región</div>
                <select disabled={!can} value={prod.region||""} onChange={e=>{upd("region",e.target.value);upd("comuna","");}}
                  style={{width:"100%",padding:"8px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}>
                  <option value="">— Seleccionar región —</option>
                  {REGIONES.map(r=><option key={r} value={r}>{r}</option>)}
                </select></div>
              <div><div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Comuna</div>
                <select disabled={!can||!prod.region} value={prod.comuna||""} onChange={e=>upd("comuna",e.target.value)}
                  style={{width:"100%",padding:"8px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}>
                  <option value="">— Seleccionar comuna —</option>
                  {(REGIONES_COMUNAS[prod.region]||[]).map(c=><option key={c} value={c}>{c}</option>)}
                </select></div>
              <div style={{gridColumn:"1/-1"}}><div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Frutas</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{FRUTAS.map(f=>(
                  <button key={f} disabled={!can} onClick={()=>{const cur=prod.frutas||[];upd("frutas",cur.includes(f)?cur.filter(x=>x!==f):[...cur,f]);}}
                    style={{padding:"4px 12px",borderRadius:20,border:`1px solid ${(prod.frutas||[]).includes(f)?C.teal:C.border}`,background:(prod.frutas||[]).includes(f)?`${C.teal}22`:"transparent",color:(prod.frutas||[]).includes(f)?C.teal:C.muted,cursor:can?"pointer":"default",fontSize:11,fontWeight:600}}>{f}</button>
                ))}</div></div>
            </div>

            {/* Representante legal */}
            <div style={{fontSize:12,fontWeight:700,color:C.teal,borderBottom:`1px solid ${C.border}`,paddingBottom:6,marginBottom:12}}>👤 Representante legal</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:16}}>
              {[["Nombre completo","repLegalNombre"],["RUT","repLegalRut"],["Email","repLegalEmail"],["Teléfono","repLegalTelefono"]].map(([l,f])=>(
                <div key={f}><div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>{l}</div>
                  <input disabled={!can} value={prod[f]||""} onChange={e=>upd(f,f.toLowerCase().includes("rut")?formatRUT(e.target.value):e.target.value)}
                    style={{width:"100%",padding:"8px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}/></div>
              ))}
            </div>

            {/* Socios */}
            <div style={{fontSize:12,fontWeight:700,color:C.teal,borderBottom:`1px solid ${C.border}`,paddingBottom:6,marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>👥 Socios (si son distintos al representante legal)</span>
              {can&&<button onClick={()=>upd("socios",[...(prod.socios||[]),{id:`soc_${Date.now()}`,nombre:"",rut:"",email:"",telefono:"",participacion:""}])}
                style={{padding:"4px 12px",borderRadius:6,background:C.teal,border:"none",color:"#fff",cursor:"pointer",fontSize:10,fontWeight:700}}>+ Agregar socio</button>}
            </div>
            {(prod.socios||[]).length===0?(
              <div style={{padding:16,textAlign:"center",color:C.muted2,fontSize:11,border:`1px dashed ${C.border}`,borderRadius:8,marginBottom:16}}>Sin socios adicionales registrados.</div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
                {(prod.socios||[]).map((s,i)=>{
                  const updS=(f,v)=>upd("socios",(prod.socios||[]).map(x=>x.id===s.id?{...x,[f]:v}:x));
                  return(
                    <div key={s.id} style={{border:`1px solid ${C.border}`,borderRadius:8,padding:12,background:C.card2}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                        <span style={{fontSize:11,fontWeight:700,color:C.text}}>Socio #{i+1}</span>
                        {can&&<button onClick={()=>{if(!window.confirm("¿Eliminar socio?"))return;upd("socios",(prod.socios||[]).filter(x=>x.id!==s.id));}} style={{background:"#fef2f2",border:"none",borderRadius:4,padding:"3px 8px",cursor:"pointer",fontSize:10,color:"#991b1b"}}>🗑</button>}
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:8,fontSize:11}}>
                        {[["Nombre","nombre"],["RUT","rut"],["Email","email"],["Teléfono","telefono"],["% Participación","participacion"]].map(([l,f])=>(
                          <div key={f}><div style={{color:C.muted,fontWeight:600,marginBottom:2}}>{l}</div>
                            <input disabled={!can} value={s[f]||""} onChange={e=>updS(f,f.toLowerCase().includes("rut")?formatRUT(e.target.value):e.target.value)}
                              style={{width:"100%",padding:"5px 6px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:11,background:C.card2,color:C.text,boxSizing:"border-box"}}/></div>
                        ))}
                      </div>
                    </div>);
                })}
              </div>
            )}

            {/* Notas */}
            <div><div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Notas generales</div>
              <textarea disabled={!can} value={prod.notas||""} onChange={e=>upd("notas",e.target.value)}
                style={{width:"100%",padding:"8px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,minHeight:60,boxSizing:"border-box"}}/></div>
          </div>
        )}

        {/* TAB CONTRATO */}
        {tab==="contrato"&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:16}}>
              <div><div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Estado</div>
                <select disabled={!can} value={contrato.estado||"Sin contrato"} onChange={e=>updContrato("estado",e.target.value)}
                  style={{width:"100%",padding:"8px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}>
                  {ESTADOS_CONTRATO.map(s=><option key={s}>{s}</option>)}</select></div>
              <div><div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Tipo</div>
                <select disabled={!can} value={contrato.tipoContrato||""} onChange={e=>updContrato("tipoContrato",e.target.value)}
                  style={{width:"100%",padding:"8px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}>
                  <option value="">— Seleccionar —</option>{TIPOS_CONTRATO.map(t=><option key={t}>{t}</option>)}</select></div>
              {[["Fecha inicio","fechaInicio","date"],["Fecha término","fechaTermino","date"],["Comisión %","comisionPct","number"],["Plazo pago liquidación","fechaPagoLiq","text"]].map(([l,f,t])=>(
                <div key={f}><div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>{l}</div>
                  <input type={t} step={t==="number"?"0.1":undefined} disabled={!can} value={contrato[f]||""} placeholder={f==="fechaPagoLiq"?"Ej: 60 días post-embarque":""} onChange={e=>updContrato(f,e.target.value)}
                    style={{width:"100%",padding:"8px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}/></div>
              ))}
            </div>
            {/* Link contrato */}
            <div style={{marginBottom:16}}><div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>📎 Link al contrato (OneDrive/Drive)</div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <input disabled={!can} value={contrato.linkContrato||""} placeholder="https://..." onChange={e=>updContrato("linkContrato",e.target.value)}
                  style={{flex:1,padding:"8px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}/>
                {contrato.linkContrato&&<a href={contrato.linkContrato} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:C.teal,fontWeight:700}}>📄 Abrir</a>}
              </div></div>
            <div style={{marginBottom:16}}><div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Condiciones generales</div>
              <textarea disabled={!can} value={contrato.condiciones||""} placeholder="Condiciones del contrato, cláusulas especiales..." onChange={e=>updContrato("condiciones",e.target.value)}
                style={{width:"100%",padding:"8px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,minHeight:60,boxSizing:"border-box"}}/></div>

            {/* Garantías / Documentos */}
            <div style={{border:`1px solid ${C.border}`,borderRadius:10,padding:14,marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{fontWeight:700,color:C.text,fontSize:13}}>🔒 Documentos de garantía</div>
                {can&&<button onClick={()=>updContrato("garantias",[...garantias,{id:`gar_${Date.now()}`,tipo:"Pagaré",descripcion:"",monto:0,moneda:"USD",fechaEmision:"",fechaVencimiento:"",link:"",estado:"Vigente"}])}
                  style={{padding:"5px 12px",borderRadius:6,background:"#7c3aed",border:"none",color:"#fff",cursor:"pointer",fontSize:11,fontWeight:700}}>+ Agregar garantía</button>}
              </div>
              {garantias.length===0?(
                <div style={{padding:16,textAlign:"center",color:C.muted2,fontSize:11,border:`1px dashed ${C.border}`,borderRadius:8}}>Sin garantías registradas (pagaré, prenda, boleta, etc.)</div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {garantias.map((g,i)=>{
                    const updG=(f,v)=>updContrato("garantias",garantias.map(x=>x.id===g.id?{...x,[f]:v}:x));
                    const gColor=g.estado==="Vigente"?"#16a34a":g.estado==="Vencida"?"#dc2626":"#64748b";
                    return(
                      <div key={g.id} style={{border:`1px solid ${C.border}`,borderRadius:8,padding:12,background:C.card2}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                          <span style={{fontSize:11,fontWeight:700,color:C.text}}>Garantía #{i+1} — <span style={{color:gColor}}>{g.estado}</span></span>
                          {can&&<button onClick={()=>{if(!window.confirm("¿Eliminar garantía?"))return;updContrato("garantias",garantias.filter(x=>x.id!==g.id));}} style={{background:"#fef2f2",border:"none",borderRadius:4,padding:"3px 8px",cursor:"pointer",fontSize:10,color:"#991b1b"}}>🗑</button>}
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,fontSize:11}}>
                          <div><div style={{color:C.muted,fontWeight:600,marginBottom:2}}>Tipo</div>
                            <select disabled={!can} value={g.tipo||""} onChange={e=>updG("tipo",e.target.value)} style={{width:"100%",padding:"5px 6px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:11,background:C.card2,color:C.text,boxSizing:"border-box"}}>
                              {TIPOS_GARANTIA.map(t=><option key={t}>{t}</option>)}</select></div>
                          <div><div style={{color:C.muted,fontWeight:600,marginBottom:2}}>Monto</div>
                            <div style={{display:"flex",gap:4}}>
                              <input type="number" disabled={!can} value={g.monto||""} onChange={e=>updG("monto",parseFloat(e.target.value)||0)} style={{flex:1,padding:"5px 6px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:11,textAlign:"right",background:C.card2,color:C.text,boxSizing:"border-box"}}/>
                              <select disabled={!can} value={g.moneda||"USD"} onChange={e=>updG("moneda",e.target.value)} style={{width:55,padding:"5px 4px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:10,background:C.card2,color:C.text}}>
                                <option>USD</option><option>CLP</option><option>PEN</option></select></div></div>
                          <div><div style={{color:C.muted,fontWeight:600,marginBottom:2}}>Estado</div>
                            <select disabled={!can} value={g.estado||"Vigente"} onChange={e=>updG("estado",e.target.value)} style={{width:"100%",padding:"5px 6px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:11,background:C.card2,color:C.text,boxSizing:"border-box"}}>
                              <option>Vigente</option><option>Vencida</option><option>Ejecutada</option><option>Devuelta</option></select></div>
                          <div><div style={{color:C.muted,fontWeight:600,marginBottom:2}}>F. Emisión</div>
                            <DateInput disabled={!can} value={g.fechaEmision||""} onChange={v=>updG("fechaEmision",v)} style={{width:"100%",padding:"5px 6px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:11,background:C.card2,color:C.text,boxSizing:"border-box"}}/></div>
                          <div><div style={{color:C.muted,fontWeight:600,marginBottom:2}}>F. Vencimiento</div>
                            <DateInput disabled={!can} value={g.fechaVencimiento||""} onChange={v=>updG("fechaVencimiento",v)} style={{width:"100%",padding:"5px 6px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:11,background:C.card2,color:C.text,boxSizing:"border-box"}}/></div>
                          <div><div style={{color:C.muted,fontWeight:600,marginBottom:2}}>📎 Link</div>
                            <div style={{display:"flex",gap:4,alignItems:"center"}}>
                              <input disabled={!can} value={g.link||""} placeholder="https://..." onChange={e=>updG("link",e.target.value)} style={{flex:1,padding:"5px 6px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:11,background:C.card2,color:C.text,boxSizing:"border-box"}}/>
                              {g.link&&<a href={g.link} target="_blank" rel="noopener noreferrer" style={{fontSize:12}}>📎</a>}
                            </div></div>
                        </div>
                        <div style={{marginTop:6}}><div style={{color:C.muted,fontWeight:600,marginBottom:2,fontSize:11}}>Descripción</div>
                          <input disabled={!can} value={g.descripcion||""} onChange={e=>updG("descripcion",e.target.value)} style={{width:"100%",padding:"5px 6px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:11,background:C.card2,color:C.text,boxSizing:"border-box"}}/></div>
                      </div>);
                  })}
                </div>
              )}
            </div>

            {/* Kg pactados */}
            <div style={{border:`1px solid ${C.border}`,borderRadius:10,padding:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{fontWeight:700,color:C.text,fontSize:13}}>📦 Kg pactados por variedad / semana</div>
                {can&&<button onClick={()=>updContrato("kgPactados",[...kgPactados,{id:`kp_${Date.now()}`,fruta:"",variedad:"",semana:"",kgEstimado:0}])}
                  style={{padding:"5px 12px",borderRadius:6,background:C.teal,border:"none",color:"#fff",cursor:"pointer",fontSize:11,fontWeight:700}}>+ Agregar</button>}
              </div>
              {kgPactados.length===0?(
                <div style={{padding:16,textAlign:"center",color:C.muted2,fontSize:11}}>Sin kg pactados.</div>
              ):(
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                    <thead><tr style={{background:C.bg2}}>{["Fruta","Variedad","Semana","Kg estimado",""].map(h=><th key={h} style={{padding:"6px 10px",textAlign:"left",color:C.muted,fontWeight:700,fontSize:10}}>{h}</th>)}</tr></thead>
                    <tbody>{kgPactados.map(kp=>{
                      const updKp=(f,v)=>updContrato("kgPactados",kgPactados.map(x=>x.id===kp.id?{...x,[f]:v}:x));
                      return(<tr key={kp.id} style={{borderBottom:`1px solid ${C.border}22`}}>
                        <td style={{padding:"5px 8px"}}><select disabled={!can} value={kp.fruta||""} onChange={e=>updKp("fruta",e.target.value)} style={{padding:"4px 6px",borderRadius:4,border:`1px solid ${C.border}`,fontSize:11,background:C.card2,color:C.text}}><option value="">—</option>{FRUTAS.map(f=><option key={f}>{f}</option>)}</select></td>
                        <td style={{padding:"5px 8px"}}><input disabled={!can} value={kp.variedad||""} onChange={e=>updKp("variedad",e.target.value)} placeholder="Variedad" style={{width:90,padding:"4px 6px",borderRadius:4,border:`1px solid ${C.border}`,fontSize:11,background:C.card2,color:C.text}}/></td>
                        <td style={{padding:"5px 8px"}}><input disabled={!can} value={kp.semana||""} onChange={e=>updKp("semana",e.target.value)} placeholder="S1,S2..." style={{width:55,padding:"4px 6px",borderRadius:4,border:`1px solid ${C.border}`,fontSize:11,background:C.card2,color:C.text}}/></td>
                        <td style={{padding:"5px 8px"}}><input type="number" disabled={!can} value={kp.kgEstimado||""} onChange={e=>updKp("kgEstimado",parseFloat(e.target.value)||0)} style={{width:80,padding:"4px 6px",borderRadius:4,border:`1px solid ${C.border}`,fontSize:11,textAlign:"right",background:C.card2,color:C.text}}/></td>
                        <td style={{padding:"5px 8px"}}>{can&&<button onClick={()=>updContrato("kgPactados",kgPactados.filter(x=>x.id!==kp.id))} style={{background:"#fef2f2",border:"none",borderRadius:4,padding:"3px 6px",cursor:"pointer",fontSize:10,color:"#991b1b"}}>🗑</button>}</td>
                      </tr>);
                    })}</tbody>
                  </table>
                </div>
              )}
            </div>
            <div style={{marginTop:12}}><div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Observaciones contrato</div>
              <textarea disabled={!can} value={contrato.observaciones||""} onChange={e=>updContrato("observaciones",e.target.value)}
                style={{width:"100%",padding:"8px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,minHeight:50,boxSizing:"border-box"}}/></div>
          </div>
        )}

        {/* TAB ANTICIPOS */}
        {tab==="anticipos"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontWeight:700,color:C.text,fontSize:13}}>💵 Anticipos al productor</div>
              {can&&<button onClick={()=>upd("anticipos",[...anticipos,{id:`ant_${Date.now()}`,concepto:"Anticipo por kg",monto:0,moneda:"USD",kgBase:0,valorPorKg:0,fechaPactada:"",fechaPago:"",estado:"Pactado",garantiaId:"",nDocumento:"",observaciones:""}])}
                style={{padding:"5px 12px",borderRadius:6,background:C.yellow,border:"none",color:"#000",cursor:"pointer",fontSize:11,fontWeight:700}}>+ Agregar anticipo</button>}
            </div>
            {anticipos.length===0?(
              <div style={{padding:30,textAlign:"center",color:C.muted2,fontSize:11,border:`1px dashed ${C.border}`,borderRadius:10}}>Sin anticipos pactados.</div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {anticipos.map((a,i)=>{
                  const updA=(f,v)=>upd("anticipos",anticipos.map(x=>x.id===a.id?{...x,[f]:v}:x));
                  const aColor=a.estado==="Pagado"?"#16a34a":a.estado==="Pactado"?"#d97706":"#64748b";
                  const garVinculada = garantias.find(g=>g.id===a.garantiaId);
                  return(
                    <div key={a.id} style={{border:`1px solid ${C.border}`,borderRadius:10,padding:14,background:C.card2}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                        <span style={{fontSize:12,fontWeight:700,color:C.text}}>Anticipo #{i+1} — <span style={{color:aColor}}>{a.estado}</span></span>
                        {can&&<button onClick={()=>{if(!window.confirm("¿Eliminar?"))return;upd("anticipos",anticipos.filter(x=>x.id!==a.id));}} style={{background:"#fef2f2",border:"none",borderRadius:4,padding:"3px 8px",cursor:"pointer",fontSize:10,color:"#991b1b"}}>🗑</button>}
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,fontSize:11,marginBottom:8}}>
                        <div><div style={{color:C.muted,fontWeight:600,marginBottom:2}}>Concepto</div>
                          <input disabled={!can} value={a.concepto||""} onChange={e=>updA("concepto",e.target.value)} placeholder="Anticipo por kg, pre-season..." style={{width:"100%",padding:"5px 6px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:11,background:C.card2,color:C.text,boxSizing:"border-box"}}/></div>
                        <div><div style={{color:C.muted,fontWeight:600,marginBottom:2}}>Monto</div>
                          <div style={{display:"flex",gap:4}}>
                            <input type="number" disabled={!can} value={a.monto||""} onChange={e=>updA("monto",parseFloat(e.target.value)||0)} style={{flex:1,padding:"5px 6px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:11,textAlign:"right",background:C.card2,color:C.text,boxSizing:"border-box"}}/>
                            <select disabled={!can} value={a.moneda||"USD"} onChange={e=>updA("moneda",e.target.value)} style={{width:55,padding:"5px 4px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:10,background:C.card2,color:C.text}}>
                              <option>USD</option><option>CLP</option><option>PEN</option></select></div></div>
                        <div><div style={{color:C.muted,fontWeight:600,marginBottom:2}}>Estado</div>
                          <select disabled={!can} value={a.estado||"Pactado"} onChange={e=>updA("estado",e.target.value)} style={{width:"100%",padding:"5px 6px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:11,background:C.card2,color:C.text,boxSizing:"border-box"}}>
                            <option>Pactado</option><option>Pagado</option><option>Parcial</option><option>Cancelado</option></select></div>
                        <div><div style={{color:C.muted,fontWeight:600,marginBottom:2}}>$/kg</div>
                          <input type="number" step="0.01" disabled={!can} value={a.valorPorKg||""} onChange={e=>updA("valorPorKg",parseFloat(e.target.value)||0)} style={{width:"100%",padding:"5px 6px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:11,textAlign:"right",background:C.card2,color:C.text,boxSizing:"border-box"}}/></div>
                        <div><div style={{color:C.muted,fontWeight:600,marginBottom:2}}>F. pactada</div>
                          <DateInput disabled={!can} value={a.fechaPactada||""} onChange={v=>updA("fechaPactada",v)} style={{width:"100%",padding:"5px 6px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:11,background:C.card2,color:C.text,boxSizing:"border-box"}}/></div>
                        <div><div style={{color:C.muted,fontWeight:600,marginBottom:2}}>F. pago real</div>
                          <DateInput disabled={!can} value={a.fechaPago||""} onChange={v=>updA("fechaPago",v)} style={{width:"100%",padding:"5px 6px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:11,background:C.card2,color:C.text,boxSizing:"border-box"}}/></div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:11}}>
                        <div><div style={{color:C.muted,fontWeight:600,marginBottom:2}}>🔒 Garantía vinculada</div>
                          <select disabled={!can} value={a.garantiaId||""} onChange={e=>updA("garantiaId",e.target.value)} style={{width:"100%",padding:"5px 6px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:11,background:C.card2,color:C.text,boxSizing:"border-box"}}>
                            <option value="">— Sin garantía —</option>
                            {garantias.map(g=><option key={g.id} value={g.id}>{g.tipo} — {g.monto} {g.moneda} ({g.estado})</option>)}
                          </select>
                          {garVinculada&&garVinculada.link&&<a href={garVinculada.link} target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:C.teal,marginTop:2,display:"inline-block"}}>📎 Ver documento garantía</a>}
                        </div>
                        <div><div style={{color:C.muted,fontWeight:600,marginBottom:2}}>N° documento</div>
                          <input disabled={!can} value={a.nDocumento||""} onChange={e=>updA("nDocumento",e.target.value)} placeholder="N° pagaré, factura..." style={{width:"100%",padding:"5px 6px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:11,background:C.card2,color:C.text,boxSizing:"border-box"}}/></div>
                      </div>
                    </div>);
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB VISITAS */}
        {tab==="visitas"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontWeight:700,color:C.text,fontSize:13}}>🌿 Visitas agronómicas</div>
              {can&&<button onClick={()=>upd("visitas",[...visitas,{id:`vis_${Date.now()}`,tipo:"Pre-temporada",fecha:"",agronomo:"",estado:"Programada",cuartel:"",observaciones:"",recomendaciones:"",fotos:""}])}
                style={{padding:"5px 12px",borderRadius:6,background:"#16a34a",border:"none",color:"#fff",cursor:"pointer",fontSize:11,fontWeight:700}}>+ Nueva visita</button>}
            </div>
            {visitas.length===0?(
              <div style={{padding:30,textAlign:"center",color:C.muted2,fontSize:11,border:`1px dashed ${C.border}`,borderRadius:10}}>Sin visitas registradas.</div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {visitas.sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||"")).map((v,i)=>{
                  const updV=(f,val)=>upd("visitas",visitas.map(x=>x.id===v.id?{...x,[f]:val}:x));
                  const vColor=v.estado==="Realizada"?"#16a34a":v.estado==="Cancelada"?"#dc2626":"#d97706";
                  return(
                    <div key={v.id} style={{border:`1px solid ${C.border}`,borderRadius:10,padding:14,background:v.estado==="Realizada"?`${C.green}08`:C.card2}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                        <div style={{display:"flex",gap:8,alignItems:"center"}}>
                          <span style={{fontSize:10,padding:"3px 10px",borderRadius:12,background:`${vColor}22`,color:vColor,fontWeight:700}}>{v.estado}</span>
                          <span style={{fontSize:12,fontWeight:700,color:C.text}}>{v.tipo}</span>
                          {v.fecha&&<span style={{fontSize:10,color:C.muted}}>{v.fecha}</span>}
                        </div>
                        {can&&<button onClick={()=>{if(!window.confirm("¿Eliminar visita?"))return;upd("visitas",visitas.filter(x=>x.id!==v.id));}} style={{background:"#fef2f2",border:"none",borderRadius:4,padding:"3px 8px",cursor:"pointer",fontSize:10,color:"#991b1b"}}>🗑</button>}
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,fontSize:11}}>
                        <div><div style={{color:C.muted,fontWeight:600,marginBottom:2}}>Tipo</div>
                          <select disabled={!can} value={v.tipo||""} onChange={e=>updV("tipo",e.target.value)} style={{width:"100%",padding:"5px 6px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:11,background:C.card2,color:C.text,boxSizing:"border-box"}}>
                            {TIPOS_VISITA.map(t=><option key={t}>{t}</option>)}</select></div>
                        <div><div style={{color:C.muted,fontWeight:600,marginBottom:2}}>Fecha</div>
                          <DateInput disabled={!can} value={v.fecha||""} onChange={val=>updV("fecha",val)} style={{width:"100%",padding:"5px 6px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:11,background:C.card2,color:C.text,boxSizing:"border-box"}}/></div>
                        <div><div style={{color:C.muted,fontWeight:600,marginBottom:2}}>Agrónomo</div>
                          <input disabled={!can} value={v.agronomo||""} onChange={e=>updV("agronomo",e.target.value)} style={{width:"100%",padding:"5px 6px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:11,background:C.card2,color:C.text,boxSizing:"border-box"}}/></div>
                        <div><div style={{color:C.muted,fontWeight:600,marginBottom:2}}>Estado</div>
                          <select disabled={!can} value={v.estado||"Programada"} onChange={e=>updV("estado",e.target.value)} style={{width:"100%",padding:"5px 6px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:11,background:C.card2,color:C.text,boxSizing:"border-box"}}>
                            {ESTADOS_VISITA.map(s=><option key={s}>{s}</option>)}</select></div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:11,marginTop:6}}>
                        <div><div style={{color:C.muted,fontWeight:600,marginBottom:2}}>Cuartel/Sector</div>
                          <input disabled={!can} value={v.cuartel||""} onChange={e=>updV("cuartel",e.target.value)} style={{width:"100%",padding:"5px 6px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:11,background:C.card2,color:C.text,boxSizing:"border-box"}}/></div>
                        <div><div style={{color:C.muted,fontWeight:600,marginBottom:2}}>📎 Fotos/Link</div>
                          <div style={{display:"flex",gap:4,alignItems:"center"}}>
                            <input disabled={!can} value={v.fotos||""} placeholder="https://..." onChange={e=>updV("fotos",e.target.value)} style={{flex:1,padding:"5px 6px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:11,background:C.card2,color:C.text,boxSizing:"border-box"}}/>
                            {v.fotos&&<a href={v.fotos} target="_blank" rel="noopener noreferrer" style={{fontSize:12}}>📎</a>}
                          </div></div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:11,marginTop:6}}>
                        <div><div style={{color:C.muted,fontWeight:600,marginBottom:2}}>Observaciones</div>
                          <textarea disabled={!can} value={v.observaciones||""} onChange={e=>updV("observaciones",e.target.value)} style={{width:"100%",padding:"5px 6px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:11,minHeight:40,background:C.card2,color:C.text,boxSizing:"border-box"}}/></div>
                        <div><div style={{color:C.muted,fontWeight:600,marginBottom:2}}>Recomendaciones</div>
                          <textarea disabled={!can} value={v.recomendaciones||""} onChange={e=>updV("recomendaciones",e.target.value)} style={{width:"100%",padding:"5px 6px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:11,minHeight:40,background:C.card2,color:C.text,boxSizing:"border-box"}}/></div>
                      </div>
                    </div>);
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB CHECKLIST */}
        {tab==="checklist"&&(()=>{
          const CHECKLIST_TEMPLATE = [
            {cat:"Legal — Productor",items:[
              {key:"ci_rut",label:"Cédula de identidad / RUT representante"},
              {key:"cert_vigencia",label:"Certificado de vigencia de la sociedad"},
              {key:"escritura",label:"Escritura de constitución"},
              {key:"poderes",label:"Poderes del representante legal"},
              {key:"resol_sag",label:"Resolución sanitaria SAG"},
              {key:"reg_exportador",label:"Inscripción registro de exportadores"},
              {key:"cert_globalgap",label:"Certificación GlobalGAP"},
              {key:"cert_brc",label:"Certificación BRC (si aplica)"},
              {key:"cert_organico",label:"Certificación orgánica (si aplica)"},
              {key:"declaracion_jurada",label:"Declaración jurada de beneficiario final"},
            ]},
            {cat:"Financiera — Productor",items:[
              {key:"dicom_empresa",label:"Informe comercial (Dicom/Equifax) — Razón social"},
              {key:"dicom_representante",label:"Informe comercial (Dicom/Equifax) — Representante legal / Socio"},
            ]},
            {cat:"Predio / Campo",items:[
              {key:"cert_dominio",label:"Certificado de dominio del predio"},
              {key:"contrato_arriendo",label:"Contrato de arriendo (si no es dueño)"},
              {key:"plano_predio",label:"Plano del predio / croquis de ubicación"},
              {key:"cert_riego",label:"Certificado de derechos de agua / riego"},
              {key:"permiso_municipal",label:"Permiso municipal de funcionamiento"},
            ]},
            {cat:"Dueño del campo (si es distinto al productor)",items:[
              {key:"dc_ci_rut",label:"Cédula de identidad / RUT del dueño"},
              {key:"dc_vigencia",label:"Certificado de vigencia sociedad dueño"},
              {key:"dc_escritura",label:"Escritura de constitución dueño"},
              {key:"dc_dominio",label:"Certificado de dominio a nombre del dueño"},
              {key:"dc_autorizacion",label:"Autorización del dueño para operar"},
              {key:"dc_dicom",label:"Informe comercial del dueño"},
            ]},
          ];
          const checklist = prod.checklist || {};
          const updCheck = (key, campo, valor) => {
            const newCL = {...checklist, [key]:{...(checklist[key]||{}),[campo]:valor}};
            upd("checklist", newCL);
          };
          const totalItems = CHECKLIST_TEMPLATE.reduce((s,cat)=>s+cat.items.length,0);
          const recibidos = CHECKLIST_TEMPLATE.reduce((s,cat)=>s+cat.items.filter(it=>(checklist[it.key]||{}).estado==="Recibido").length,0);
          const noAplica = CHECKLIST_TEMPLATE.reduce((s,cat)=>s+cat.items.filter(it=>(checklist[it.key]||{}).estado==="No aplica").length,0);
          const pendientes = totalItems - recibidos - noAplica;
          const pctComplete = totalItems>0?Math.round((recibidos/(totalItems-noAplica||1))*100):0;

          return(
            <div>
              {/* Barra progreso */}
              <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
                <div style={{flex:1,minWidth:200}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.muted,marginBottom:4}}>
                    <span>Progreso checklist</span>
                    <span style={{fontWeight:700,color:pctComplete===100?C.green:pctComplete>50?C.yellow:C.accent}}>{pctComplete}%</span>
                  </div>
                  <div style={{height:8,background:C.bg2,borderRadius:10,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pctComplete}%`,background:pctComplete===100?C.green:pctComplete>50?C.yellow:C.accent,borderRadius:10,transition:"width 0.3s"}}/>
                  </div>
                </div>
                <div style={{display:"flex",gap:12,fontSize:11}}>
                  <span style={{color:C.green,fontWeight:700}}>✅ {recibidos} recibidos</span>
                  <span style={{color:C.yellow,fontWeight:700}}>⏳ {pendientes} pendientes</span>
                  <span style={{color:C.muted}}>N/A: {noAplica}</span>
                </div>
              </div>

              {/* Categorías */}
              {CHECKLIST_TEMPLATE.map(cat=>{
                const catRecibidos = cat.items.filter(it=>(checklist[it.key]||{}).estado==="Recibido").length;
                const catTotal = cat.items.length;
                return(
                  <div key={cat.cat} style={{marginBottom:16,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
                    <div style={{background:C.bg2,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontWeight:700,fontSize:12,color:C.text}}>{cat.cat}</span>
                      <span style={{fontSize:10,color:C.muted}}>{catRecibidos}/{catTotal}</span>
                    </div>
                    {cat.items.map(it=>{
                      const item = checklist[it.key] || {};
                      const est = item.estado || "Pendiente";
                      const estCol = est==="Recibido"?C.green:est==="Vencido"?"#dc2626":est==="No aplica"?"#64748b":C.yellow;
                      return(
                        <div key={it.key} style={{padding:"10px 14px",borderTop:`1px solid ${C.border}22`,display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",background:est==="Recibido"?`${C.green}05`:"transparent"}}>
                          <div style={{flex:1,minWidth:200}}>
                            <div style={{fontSize:12,color:C.text,fontWeight:est==="Recibido"?400:600}}>{it.label}</div>
                            {item.observaciones&&<div style={{fontSize:10,color:C.muted,marginTop:2}}>{item.observaciones}</div>}
                          </div>
                          <select disabled={!can} value={est} onChange={e=>updCheck(it.key,"estado",e.target.value)}
                            style={{padding:"4px 8px",borderRadius:6,border:`1px solid ${estCol}44`,background:`${estCol}11`,color:estCol,fontSize:10,fontWeight:700,minWidth:90}}>
                            <option value="Pendiente">⏳ Pendiente</option>
                            <option value="Recibido">✅ Recibido</option>
                            <option value="Vencido">🔴 Vencido</option>
                            <option value="No aplica">➖ No aplica</option>
                          </select>
                          <div style={{display:"flex",gap:4,alignItems:"center"}}>
                            <input disabled={!can} value={item.link||""} placeholder="📎 Link" onChange={e=>updCheck(it.key,"link",e.target.value)}
                              style={{padding:"4px 8px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:10,background:C.card2,color:C.text,width:140}}/>
                            {item.link&&<a href={item.link} target="_blank" rel="noopener noreferrer" style={{fontSize:12}}>📎</a>}
                          </div>
                          <input disabled={!can} value={item.observaciones||""} placeholder="Obs..." onChange={e=>updCheck(it.key,"observaciones",e.target.value)}
                            style={{padding:"4px 8px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:10,background:C.card2,color:C.text,width:160}}/>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    );
  }

  // ── Lista de productores ──
  return (
    <div>
      <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
        <input value={busq} onChange={e=>setBusq(e.target.value)} placeholder="🔍 Buscar productor..." style={{padding:"8px 14px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,outline:"none",flex:1,minWidth:200}}/>
        {can&&<button onClick={()=>{setModal(true);setEditId(null);setForm(EMPTY);}} style={{background:C.teal,color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Nuevo Productor</button>}
      </div>
      <div style={{overflowX:"auto",borderRadius:10,border:`1px solid ${C.border}`}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead><tr style={{background:C.bg2}}>
            {["Productor","País","Región","Comuna","Frutas","Há","Contrato",""].map(h=><th key={h} style={{padding:"8px 12px",textAlign:"left",color:C.muted,fontWeight:700,fontSize:10}}>{h}</th>)}
          </tr></thead>
          <tbody>
            {filtrado.map((p,i)=>{
              const est=(p.contrato||{}).estado||"Sin contrato";
              const estCol=est==="Firmado"||est==="Vigente"?"#16a34a":est==="Vencido"?"#dc2626":"#d97706";
              return(
                <tr key={p.id} onClick={()=>setDetalle(p.id)} style={{borderBottom:`1px solid ${C.border}22`,background:i%2===0?"transparent":`${C.border}08`,cursor:"pointer"}}
                  onMouseEnter={e=>e.currentTarget.style.background=`${C.teal}11`} onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"transparent":`${C.border}08`}>
                  <td style={{padding:"8px 12px",fontWeight:600,color:C.text}}>{p.nombre}</td>
                  <td style={{padding:"8px 12px",color:C.muted}}>{p.pais||"—"}</td>
                  <td style={{padding:"8px 12px",color:C.muted,fontSize:11}}>{p.region||"—"}</td>
                  <td style={{padding:"8px 12px",color:C.muted,fontSize:11}}>{p.comuna||"—"}</td>
                  <td style={{padding:"8px 12px"}}>{(p.frutas||[]).map(f=><span key={f} style={{fontSize:9,background:`${C.teal}22`,color:C.teal,padding:"1px 6px",borderRadius:10,marginRight:4,fontWeight:600}}>{f}</span>)}</td>
                  <td style={{padding:"8px 12px",color:C.muted,textAlign:"right"}}>{p.hectareas||"—"}</td>
                  <td style={{padding:"8px 12px"}}><span style={{fontSize:9,padding:"2px 8px",borderRadius:10,background:`${estCol}22`,color:estCol,fontWeight:700}}>{est}</span></td>
                  <td style={{padding:"8px 12px",color:C.teal,fontWeight:700,fontSize:11}}>Ver →</td>
                </tr>);
            })}
            {filtrado.length===0&&<tr><td colSpan={8} style={{padding:32,textAlign:"center",color:C.muted2}}>Sin productores</td></tr>}
          </tbody>
        </table>
      </div>
      {/* Modal nuevo/editar (para creación rápida desde la lista) */}
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setModal(false)}>
          <div style={{background:C.card,borderRadius:14,padding:24,maxWidth:600,width:"100%",border:`1px solid ${C.border}`,maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:"0 0 16px",color:C.text}}>{editId?"Editar Productor":"Nuevo Productor"}</h3>
            {/* Datos empresa */}
            <div style={{fontSize:11,fontWeight:700,color:C.teal,marginBottom:8}}>🏢 Datos empresa</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
              {[["Razón social *","nombre"],["RUT empresa","rut"],["País","pais"],["Contacto operativo","contacto"],["Email contacto","email"],["Teléfono","telefono"],["Hectáreas","hectareas"]].map(([l,f])=>(
                <div key={f}><div style={{fontSize:10,color:C.muted,marginBottom:4}}>{l}</div>
                  <input value={form[f]||""} onChange={e=>setForm(p=>({...p,[f]:f.toLowerCase().includes("rut")?formatRUT(e.target.value):e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/></div>
              ))}
              <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Región</div>
                <select value={form.region||""} onChange={e=>setForm(p=>({...p,region:e.target.value,comuna:""}))}
                  style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}>
                  <option value="">— Seleccionar región —</option>
                  {REGIONES.map(r=><option key={r} value={r}>{r}</option>)}
                </select></div>
              <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Comuna</div>
                <select disabled={!form.region} value={form.comuna||""} onChange={e=>setForm(p=>({...p,comuna:e.target.value}))}
                  style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}>
                  <option value="">— Seleccionar comuna —</option>
                  {(REGIONES_COMUNAS[form.region]||[]).map(c=><option key={c} value={c}>{c}</option>)}
                </select></div>
            </div>
            <div style={{marginBottom:14}}><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Frutas</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{FRUTAS.map(f=>(
                <button key={f} onClick={()=>setForm(p=>({...p,frutas:p.frutas?.includes(f)?p.frutas.filter(x=>x!==f):[...(p.frutas||[]),f]}))}
                  style={{padding:"4px 12px",borderRadius:20,border:`1px solid ${form.frutas?.includes(f)?C.teal:C.border}`,background:form.frutas?.includes(f)?`${C.teal}22`:"transparent",color:form.frutas?.includes(f)?C.teal:C.muted,cursor:"pointer",fontSize:11,fontWeight:600}}>{f}</button>
              ))}</div></div>
            {/* Representante legal */}
            <div style={{fontSize:11,fontWeight:700,color:C.teal,marginBottom:8}}>👤 Representante legal</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
              {[["Nombre completo","repLegalNombre"],["RUT","repLegalRut"],["Email","repLegalEmail"],["Teléfono","repLegalTelefono"]].map(([l,f])=>(
                <div key={f}><div style={{fontSize:10,color:C.muted,marginBottom:4}}>{l}</div>
                  <input value={form[f]||""} onChange={e=>setForm(p=>({...p,[f]:f.toLowerCase().includes("rut")?formatRUT(e.target.value):e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/></div>
              ))}
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
// ═══════════════════════════════════════════════════════════════════
// EMBARQUES — Multi-productor con selección de pallets
// ═══════════════════════════════════════════════════════════════════
function EmbarquesModule({data, setData, clientes, productores, stockPT, setStockPT, can, temporada}) {
  const [busq, setBusq] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("Todos");
  const [modal, setModal] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [tab, setTab] = useState("plan");
  const [selPallets, setSelPallets] = useState([]);

  const ESTADOS_EMB=["Programado","En carga","Despachado","En tránsito","Llegado","QC Destino","Liquidado","Cerrado"];
  const VIAS=["Marítimo","Aéreo"];
  const TABS_EMB=[{id:"plan",label:"📋 Plan & Carga"},{id:"docs",label:"📄 Documentos"},{id:"tracking",label:"🚛 Tracking"},{id:"qc",label:"🔍 QC & Claims"}];

  const filtrado = data.filter(e=>(e.temporada===temporada)&&(filtroEstado==="Todos"||e.estado===filtroEstado)&&(!busq||e.contenedor?.toLowerCase().includes(busq.toLowerCase())));
  const disponibles = (stockPT||[]).filter(p=>p.estadoSAG==="Aprobado"&&p.disponible);

  const [form, setForm] = useState({contenedor:"",via:"Marítimo",destino:"",clientes:[],temporada:temporada||"",etd:"",eta:"",naviera:"",booking:"",bl:"",estado:"Programado",pallets:[],notas:""});

  function crearEmbarque(){
    if(!form.contenedor){alert("N° contenedor obligatorio.");return;}
    const palletsSeleccionados = disponibles.filter(p=>selPallets.includes(p.id));
    const clientesUnicos=[...new Set(form.clientes||[])];
    const totalCajas=palletsSeleccionados.reduce((s,p)=>s+(p.cajas||0),0);
    const totalKg=palletsSeleccionados.reduce((s,p)=>s+(parseFloat(p.kgNeto)||0),0);
    const productoresUnicos=[...new Set(palletsSeleccionados.map(p=>p.productor||"Sin productor").filter(Boolean))];
    const emb={...form,id:`aemb_${Date.now()}`,temporada,pallets:palletsSeleccionados.map(p=>({...p,embarqueId:`aemb_${Date.now()}`})),
      totalPallets:palletsSeleccionados.length,totalCajas,totalKg,productores:productoresUnicos,clientes:clientesUnicos};
    setData(prev=>[...prev,emb]);
    // Marcar pallets como no disponibles
    if(setStockPT) setStockPT(prev=>prev.map(p=>selPallets.includes(p.id)?{...p,disponible:false,embarqueId:emb.id}:p));
    setModal(false);setSelPallets([]);setForm({contenedor:"",via:"Marítimo",destino:"",clientes:[],temporada:temporada||"",etd:"",eta:"",naviera:"",booking:"",bl:"",estado:"Programado",pallets:[],notas:""});
  }

  const upd=(id,c,v)=>setData(prev=>prev.map(e=>e.id===id?{...e,[c]:v}:e));
  const emb = detalle ? data.find(e=>e.id===detalle) : null;

  // Vista detalle
  if(emb) {
    const palletsEmb = emb.pallets||[];
    const prodResumen = {};
    palletsEmb.forEach(p=>{
      const prod=p.productor||"Sin productor";
      if(!prodResumen[prod]) prodResumen[prod]={cajas:0,kg:0,pallets:0};
      prodResumen[prod].cajas+=(p.cajas||0);
      prodResumen[prod].kg+=(parseFloat(p.kgNeto)||0);
      prodResumen[prod].pallets++;
    });

    return(
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <button onClick={()=>{setDetalle(null);setTab("plan");}} style={{background:C.card2,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 14px",cursor:"pointer",color:C.muted,fontSize:12}}>← Volver</button>
            <h3 style={{margin:0,color:C.text,fontSize:16}}>🚢 {emb.contenedor}</h3>
          </div>
          <div style={{display:"flex",gap:6}}>
            <span style={{fontSize:10,padding:"4px 12px",borderRadius:20,background:`${C.blue}22`,color:C.blue,fontWeight:700}}>{emb.via||"Marítimo"}</span>
            <span style={{fontSize:10,padding:"4px 12px",borderRadius:20,background:`${C.green}22`,color:C.green,fontWeight:700}}>{emb.estado}</span>
            <span style={{fontSize:10,padding:"4px 12px",borderRadius:20,background:`${C.yellow}22`,color:C.yellow,fontWeight:700}}>{palletsEmb.length} pallets · {emb.totalCajas||0} cajas</span>
          </div>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
          {TABS_EMB.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"8px 16px",borderRadius:8,border:tab===t.id?`2px solid ${C.blue}`:`1px solid ${C.border}`,background:tab===t.id?C.blue:"transparent",color:tab===t.id?"#fff":C.muted,cursor:"pointer",fontSize:12,fontWeight:700}}>{t.label}</button>)}
        </div>

        {tab==="plan"&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:16}}>
              {[["Contenedor","contenedor"],["Vía","via"],["Destino","destino"],["Naviera","naviera"],["Booking","booking"],["ETD","etd"],["ETA","eta"],["Estado","estado"]].map(([l,f])=>(
                <div key={f}><div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>{l}</div>
                  {f==="estado"?<select disabled={!can} value={emb[f]||""} onChange={e=>upd(emb.id,f,e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}>{ESTADOS_EMB.map(s=><option key={s}>{s}</option>)}</select>
                  :f==="via"?<select disabled={!can} value={emb[f]||""} onChange={e=>upd(emb.id,f,e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}>{VIAS.map(s=><option key={s}>{s}</option>)}</select>
                  :<input disabled={!can} type={f==="etd"||f==="eta"?"date":"text"} value={emb[f]||""} onChange={e=>upd(emb.id,f,e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}/>}
                </div>))}
            </div>
            {/* Resumen por productor */}
            <div style={{fontWeight:700,color:C.text,fontSize:13,marginBottom:8}}>📊 Distribución por productor</div>
            <div style={{overflowX:"auto",borderRadius:10,border:`1px solid ${C.border}`,marginBottom:16}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead><tr style={{background:C.bg2}}>{["Productor","Pallets","Cajas","Kg neto","% del embarque"].map(h=><th key={h} style={{padding:"6px 10px",textAlign:"left",color:C.muted,fontWeight:700,fontSize:10}}>{h}</th>)}</tr></thead>
                <tbody>{Object.entries(prodResumen).map(([prod,r],i)=>{
                  const pct = emb.totalCajas>0?Math.round(r.cajas/emb.totalCajas*100):0;
                  return(<tr key={prod} style={{borderBottom:`1px solid ${C.border}22`}}>
                    <td style={{padding:"6px 10px",fontWeight:600,color:C.text}}>{prod}</td>
                    <td style={{padding:"6px 10px"}}>{r.pallets}</td>
                    <td style={{padding:"6px 10px",fontWeight:700}}>{r.cajas}</td>
                    <td style={{padding:"6px 10px"}}>{r.kg.toLocaleString()}</td>
                    <td style={{padding:"6px 10px"}}><div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:60,height:6,background:C.bg2,borderRadius:3}}><div style={{width:`${pct}%`,height:"100%",background:C.blue,borderRadius:3}}/></div><span style={{fontWeight:700}}>{pct}%</span></div></td>
                  </tr>);
                })}</tbody>
              </table>
            </div>
            {/* Lista de pallets */}
            <div style={{fontWeight:700,color:C.text,fontSize:13,marginBottom:8}}>📦 Pallets en este embarque ({palletsEmb.length})</div>
            <div style={{overflowX:"auto",borderRadius:10,border:`1px solid ${C.border}`}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead><tr style={{background:C.bg2}}>{["Código","Productor","Fruta","Variedad","Calibre","Color","Embalaje","Cajas","Kg"].map(h=><th key={h} style={{padding:"5px 8px",textAlign:"left",color:C.muted,fontWeight:700,fontSize:10}}>{h}</th>)}</tr></thead>
                <tbody>{palletsEmb.map((p,i)=>(
                  <tr key={p.id||i} style={{borderBottom:`1px solid ${C.border}22`}}>
                    <td style={{padding:"5px 8px",fontFamily:"monospace",fontWeight:600}}>{p.codigoPallet}</td>
                    <td style={{padding:"5px 8px",color:C.muted}}>{p.productor||"—"}</td>
                    <td style={{padding:"5px 8px"}}><span style={{fontSize:9,background:`${C.teal}22`,color:C.teal,padding:"1px 6px",borderRadius:10,fontWeight:600}}>{p.fruta}</span></td>
                    <td style={{padding:"5px 8px",color:C.muted}}>{p.variedad||"—"}</td>
                    <td style={{padding:"5px 8px",color:C.muted}}>{p.calibre||"—"}</td>
                    <td style={{padding:"5px 8px",color:C.muted}}>{p.color||"—"}</td>
                    <td style={{padding:"5px 8px",color:C.muted}}>{p.embalaje||"—"}</td>
                    <td style={{padding:"5px 8px",fontWeight:700}}>{p.cajas||0}</td>
                    <td style={{padding:"5px 8px"}}>{(parseFloat(p.kgNeto)||0).toLocaleString()}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          </div>
        )}

        {tab==="docs"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {[["BL (Bill of Lading)","bl"],["Booking","booking"],["Factura","factura"],["CO (Certificado Origen)","co"],["Packing List","packingList"],["Certificado SAG","certSAG"]].map(([l,f])=>(
              <div key={f}><div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>{l}</div>
                <div style={{display:"flex",gap:4}}>
                  <input disabled={!can} value={emb[f]||""} placeholder="N° o link..." onChange={e=>upd(emb.id,f,e.target.value)} style={{flex:1,padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}/>
                  {emb[f]&&emb[f].startsWith("http")&&<a href={emb[f]} target="_blank" rel="noopener noreferrer" style={{fontSize:12}}>📎</a>}
                </div></div>
            ))}
          </div>
        )}

        {tab==="tracking"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div><div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Fecha despacho</div>
              <DateInput disabled={!can} value={emb.fechaDespacho||""} onChange={v=>upd(emb.id,"fechaDespacho",v)} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}/></div>
            <div><div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Puerto embarque</div>
              <input disabled={!can} value={emb.puertoEmbarque||""} onChange={e=>upd(emb.id,"puertoEmbarque",e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}/></div>
            <div><div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Fecha llegada real</div>
              <DateInput disabled={!can} value={emb.fechaLlegada||""} onChange={v=>upd(emb.id,"fechaLlegada",v)} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}/></div>
            <div><div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Puerto destino</div>
              <input disabled={!can} value={emb.puertoDestino||""} onChange={e=>upd(emb.id,"puertoDestino",e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}/></div>
            <div style={{gridColumn:"1/-1"}}><div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Notas tracking</div>
              <textarea disabled={!can} value={emb.notasTracking||""} onChange={e=>upd(emb.id,"notasTracking",e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,minHeight:50,boxSizing:"border-box"}}/></div>
          </div>
        )}

        {tab==="qc"&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
              <div><div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>QC Destino</div>
                <textarea disabled={!can} value={emb.qcDestino||""} onChange={e=>upd(emb.id,"qcDestino",e.target.value)} placeholder="Resultado QC del cliente..." style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,minHeight:60,boxSizing:"border-box"}}/></div>
              <div>
                <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>¿Siniestrado?</div>
                <label style={{display:"flex",alignItems:"center",gap:8,cursor:can?"pointer":"default",padding:"8px 12px",background:emb.siniestrado?`#dc262622`:`${C.green}22`,borderRadius:8,fontSize:12,fontWeight:700,color:emb.siniestrado?"#dc2626":C.green}}>
                  <input type="checkbox" disabled={!can} checked={!!emb.siniestrado} onChange={e=>upd(emb.id,"siniestrado",e.target.checked)}/> {emb.siniestrado?"⚠️ Siniestrado":"✅ Sin siniestro"}
                </label>
              </div>
            </div>
            {emb.siniestrado&&(
              <div style={{border:"1px solid #fecaca",borderRadius:10,padding:14,background:"#fef2f222",marginBottom:16}}>
                <div style={{fontWeight:700,color:"#dc2626",fontSize:12,marginBottom:8}}>⚠️ Claim / Siniestro</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <div><div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Tipo siniestro</div>
                    <select disabled={!can} value={emb.tipoSiniestro||""} onChange={e=>upd(emb.id,"tipoSiniestro",e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #fecaca",background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}>
                      <option value="">—</option><option>Retraso</option><option>Pérdida de temperatura</option><option>Daño físico</option><option>Pérdida total</option><option>Otro</option></select></div>
                  <div><div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Monto claim (USD)</div>
                    <input type="number" disabled={!can} value={emb.montoClaimUSD||""} onChange={e=>upd(emb.id,"montoClaimUSD",parseFloat(e.target.value)||0)} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #fecaca",background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box",textAlign:"right"}}/></div>
                  <div><div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Estado claim</div>
                    <select disabled={!can} value={emb.estadoClaim||""} onChange={e=>upd(emb.id,"estadoClaim",e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #fecaca",background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}>
                      <option value="">—</option><option>Reportado</option><option>En proceso</option><option>Aceptado</option><option>Rechazado</option><option>Pagado</option></select></div>
                  <div><div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Aseguradora</div>
                    <input disabled={!can} value={emb.aseguradora||""} onChange={e=>upd(emb.id,"aseguradora",e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #fecaca",background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}/></div>
                </div>
                <div style={{marginTop:8}}><div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Detalle claim</div>
                  <textarea disabled={!can} value={emb.detalleClaim||""} onChange={e=>upd(emb.id,"detalleClaim",e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:"1px solid #fecaca",background:C.card2,color:C.text,fontSize:12,minHeight:50,boxSizing:"border-box"}}/></div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Lista de embarques
  return(
    <div>
      <div style={{display:"flex",gap:12,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <input value={busq} onChange={e=>setBusq(e.target.value)} placeholder="🔍 Buscar contenedor..." style={{padding:"8px 14px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,outline:"none",flex:1,minWidth:200}}/>
        <div style={{display:"flex",gap:4}}>{["Todos",...ESTADOS_EMB.slice(0,5)].map(s=><button key={s} onClick={()=>setFiltroEstado(s)} style={{padding:"5px 10px",borderRadius:20,border:`1px solid ${filtroEstado===s?C.blue:C.border}`,background:filtroEstado===s?`${C.blue}22`:"transparent",color:filtroEstado===s?C.blue:C.muted,cursor:"pointer",fontSize:10,fontWeight:600}}>{s}</button>)}</div>
        {can&&<button onClick={()=>{setSelPallets([]);setForm({contenedor:"",via:"Marítimo",destino:"",clientes:[],temporada:temporada||"",etd:"",eta:"",naviera:"",booking:"",bl:"",estado:"Programado",pallets:[],notas:""});setModal(true);}} style={{background:C.blue,color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Nuevo Embarque</button>}
      </div>
      <div style={{overflowX:"auto",borderRadius:10,border:`1px solid ${C.border}`}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr style={{background:C.bg2}}>{["Contenedor","Vía","Destino","Pallets","Cajas","Productores","Estado","ETD",""].map(h=><th key={h} style={{padding:"6px 10px",textAlign:"left",color:C.muted,fontWeight:700,fontSize:10}}>{h}</th>)}</tr></thead>
          <tbody>{filtrado.map((e,i)=>(
            <tr key={e.id} onClick={()=>setDetalle(e.id)} style={{borderBottom:`1px solid ${C.border}22`,cursor:"pointer"}} onMouseEnter={ev=>ev.currentTarget.style.background=`${C.blue}11`} onMouseLeave={ev=>ev.currentTarget.style.background="transparent"}>
              <td style={{padding:"6px 10px",fontWeight:700,color:C.text,fontFamily:"monospace"}}>{e.contenedor}</td>
              <td style={{padding:"6px 10px"}}><span style={{fontSize:9,padding:"2px 8px",borderRadius:10,fontWeight:700,background:e.via==="Aéreo"?`${C.yellow}22`:`${C.blue}22`,color:e.via==="Aéreo"?C.yellow:C.blue}}>{e.via||"Mar"}</span></td>
              <td style={{padding:"6px 10px",color:C.muted}}>{e.destino||"—"}</td>
              <td style={{padding:"6px 10px",fontWeight:700}}>{e.totalPallets||0}</td>
              <td style={{padding:"6px 10px"}}>{e.totalCajas||0}</td>
              <td style={{padding:"6px 10px",color:C.muted,fontSize:10}}>{(e.productores||[]).join(", ")||"—"}</td>
              <td style={{padding:"6px 10px"}}><span style={{fontSize:9,padding:"2px 8px",borderRadius:10,fontWeight:700,background:e.estado==="Llegado"||e.estado==="Cerrado"?`${C.green}22`:`${C.yellow}22`,color:e.estado==="Llegado"||e.estado==="Cerrado"?C.green:C.yellow}}>{e.estado}</span></td>
              <td style={{padding:"6px 10px",color:C.muted}}>{e.etd||"—"}</td>
              <td style={{padding:"6px 10px",color:C.blue,fontWeight:700,fontSize:11}}>Ver →</td>
            </tr>))}
            {filtrado.length===0&&<tr><td colSpan={9} style={{padding:30,textAlign:"center",color:C.muted2}}>Sin embarques</td></tr>}
          </tbody>
        </table>
      </div>
      {/* Modal nuevo embarque con selección de pallets */}
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setModal(false)}>
          <div style={{background:C.card,borderRadius:14,padding:24,maxWidth:700,width:"100%",border:`1px solid ${C.border}`,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:"0 0 16px",color:C.text}}>🚢 Nuevo Embarque</h3>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:16}}>
              {[["N° Contenedor *","contenedor"],["Destino","destino"],["Naviera","naviera"],["Booking","booking"]].map(([l,f])=>(
                <div key={f}><div style={{fontSize:10,color:C.muted,marginBottom:4}}>{l}</div>
                  <input value={form[f]||""} onChange={e=>setForm(p=>({...p,[f]:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}/></div>))}
              <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Vía</div>
                <select value={form.via||"Marítimo"} onChange={e=>setForm(p=>({...p,via:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}>{VIAS.map(v=><option key={v}>{v}</option>)}</select></div>
              <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>ETD</div>
                <input type="date" value={form.etd||""} onChange={e=>setForm(p=>({...p,etd:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}/></div>
            </div>
            {/* Selección de pallets disponibles */}
            <div style={{fontWeight:700,color:C.text,fontSize:13,marginBottom:8}}>📦 Seleccionar pallets disponibles ({disponibles.length} aprobados SAG)</div>
            <div style={{maxHeight:300,overflowY:"auto",border:`1px solid ${C.border}`,borderRadius:10,marginBottom:16}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
                <thead><tr style={{background:C.bg2,position:"sticky",top:0}}>{["☑","Código","Productor","Fruta","Variedad","Calibre","Cajas","Kg"].map(h=><th key={h} style={{padding:"5px 8px",textAlign:"left",color:C.muted,fontWeight:700,fontSize:9}}>{h}</th>)}</tr></thead>
                <tbody>{disponibles.map(p=>(
                  <tr key={p.id} style={{borderBottom:`1px solid ${C.border}22`,background:selPallets.includes(p.id)?`${C.blue}11`:"transparent",cursor:"pointer"}} onClick={()=>setSelPallets(prev=>prev.includes(p.id)?prev.filter(x=>x!==p.id):[...prev,p.id])}>
                    <td style={{padding:"5px 8px"}}><input type="checkbox" checked={selPallets.includes(p.id)} readOnly/></td>
                    <td style={{padding:"5px 8px",fontFamily:"monospace",fontWeight:600}}>{p.codigoPallet}</td>
                    <td style={{padding:"5px 8px"}}>{p.productor||"—"}</td>
                    <td style={{padding:"5px 8px"}}><span style={{fontSize:8,background:`${C.teal}22`,color:C.teal,padding:"1px 4px",borderRadius:8}}>{p.fruta}</span></td>
                    <td style={{padding:"5px 8px"}}>{p.variedad||"—"}</td>
                    <td style={{padding:"5px 8px"}}>{p.calibre||"—"}</td>
                    <td style={{padding:"5px 8px",fontWeight:700}}>{p.cajas||0}</td>
                    <td style={{padding:"5px 8px"}}>{(parseFloat(p.kgNeto)||0).toLocaleString()}</td>
                  </tr>))}
                  {disponibles.length===0&&<tr><td colSpan={8} style={{padding:20,textAlign:"center",color:C.muted2}}>Sin pallets disponibles. Registra pallets en Stock & Pallets con SAG aprobado.</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={{fontSize:11,color:C.teal,fontWeight:700,marginBottom:12}}>✅ {selPallets.length} pallets seleccionados · {disponibles.filter(p=>selPallets.includes(p.id)).reduce((s,p)=>s+(p.cajas||0),0)} cajas · {disponibles.filter(p=>selPallets.includes(p.id)).reduce((s,p)=>s+(parseFloat(p.kgNeto)||0),0).toLocaleString()} kg</div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={()=>setModal(false)} style={{padding:"8px 18px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer"}}>Cancelar</button>
              <button onClick={crearEmbarque} style={{padding:"8px 18px",borderRadius:8,border:"none",background:C.blue,color:"#fff",cursor:"pointer",fontWeight:700}}>Crear Embarque</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// LIQUIDACIONES PRODUCTOR — Proporcional por cajas
// ═══════════════════════════════════════════════════════════════════
function LiquidacionesModule({data, setData, embarques, productores, can, temporada}) {
  const [modal, setModal] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [form, setForm] = useState({embarqueId:"",liqClienteUSD:0});

  const ESTADOS_LIQ=["Pendiente","Calculada","Enviada","Aprobada","Pagada"];

  function crearLiquidacion(){
    const emb = (embarques||[]).find(e=>e.id===form.embarqueId);
    if(!emb){alert("Selecciona un embarque.");return;}
    const pallets = emb.pallets||[];
    const totalCajas = pallets.reduce((s,p)=>s+(p.cajas||0),0);
    if(totalCajas===0){alert("El embarque no tiene cajas.");return;}

    // Agrupar por productor
    const porProductor={};
    pallets.forEach(p=>{
      const prod=p.productor||"Sin productor";
      if(!porProductor[prod]) porProductor[prod]={cajas:0,kg:0,pallets:0};
      porProductor[prod].cajas+=(p.cajas||0);
      porProductor[prod].kg+=(parseFloat(p.kgNeto)||0);
      porProductor[prod].pallets++;
    });

    const liqClienteUSD = parseFloat(form.liqClienteUSD)||0;
    const lineas = Object.entries(porProductor).map(([prod,r])=>{
      const prodData = (productores||[]).find(p=>p.nombre===prod);
      const comisionPct = parseFloat(prodData?.contrato?.comisionPct)||0;
      const pctEmbarque = totalCajas>0?r.cajas/totalCajas:0;
      const retornoBruto = liqClienteUSD * pctEmbarque;
      const comision = retornoBruto * comisionPct/100;
      return {
        id:`ll_${Date.now()}_${prod.replace(/\s/g,"")}`,
        productor:prod, cajas:r.cajas, kg:r.kg, pallets:r.pallets,
        pctEmbarque:Math.round(pctEmbarque*100),
        retornoBruto:Math.round(retornoBruto*100)/100,
        comisionPct, comision:Math.round(comision*100)/100,
        gastosProceso:0, flete:0,
        netoLiquidacion:Math.round((retornoBruto-comision)*100)/100,
        anticipoDescontar:0, netoAPagar:Math.round((retornoBruto-comision)*100)/100,
        estado:"Pendiente"
      };
    });

    const liq = {
      id:`aliq_${Date.now()}`, embarqueId:emb.id, contenedor:emb.contenedor, temporada,
      liqClienteUSD, totalCajas, estado:"Calculada", fechaCreacion:new Date().toISOString().slice(0,10),
      lineas
    };
    setData(prev=>[...prev,liq]);
    setModal(false);setForm({embarqueId:"",liqClienteUSD:0});
  }

  const liq = detalle ? data.find(l=>l.id===detalle) : null;

  if(liq) {
    const lineas = liq.lineas||[];
    const updLinea=(lineaId,campo,valor)=>{
      setData(prev=>prev.map(l=>l.id!==liq.id?l:{...l,lineas:(l.lineas||[]).map(ln=>{
        if(ln.id!==lineaId)return ln;
        const updated={...ln,[campo]:valor};
        // Recalcular netos
        const rb=parseFloat(updated.retornoBruto)||0;
        const com=parseFloat(updated.comision)||0;
        const gp=parseFloat(updated.gastosProceso)||0;
        const fl=parseFloat(updated.flete)||0;
        const ant=parseFloat(updated.anticipoDescontar)||0;
        updated.netoLiquidacion=Math.round((rb-com-gp-fl)*100)/100;
        updated.netoAPagar=Math.round((rb-com-gp-fl-ant)*100)/100;
        return updated;
      })}));
    };

    return(
      <div>
        <button onClick={()=>setDetalle(null)} style={{marginBottom:14,padding:"7px 14px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,cursor:"pointer",color:C.muted,fontSize:12}}>← Volver</button>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
          <h3 style={{margin:0,color:C.text,fontSize:16}}>💰 Liquidación — {liq.contenedor}</h3>
          <div style={{display:"flex",gap:6}}>
            <span style={{fontSize:10,padding:"4px 12px",borderRadius:20,background:`${C.green}22`,color:C.green,fontWeight:700}}>Liq. Cliente: USD {(liq.liqClienteUSD||0).toLocaleString()}</span>
            <span style={{fontSize:10,padding:"4px 12px",borderRadius:20,background:`${C.blue}22`,color:C.blue,fontWeight:700}}>{liq.totalCajas} cajas</span>
          </div>
        </div>
        {/* Tabla por productor */}
        <div style={{overflowX:"auto",borderRadius:10,border:`1px solid ${C.border}`}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead><tr style={{background:C.bg2}}>{["Productor","Cajas","%","Retorno bruto","Comisión","Gastos proceso","Flete","Neto liq.","Anticipo","Neto a pagar","Estado"].map(h=><th key={h} style={{padding:"6px 8px",textAlign:"left",color:C.muted,fontWeight:700,fontSize:9}}>{h}</th>)}</tr></thead>
            <tbody>{lineas.map(ln=>(
              <tr key={ln.id} style={{borderBottom:`1px solid ${C.border}22`}}>
                <td style={{padding:"6px 8px",fontWeight:600,color:C.text}}>{ln.productor}</td>
                <td style={{padding:"6px 8px",fontWeight:700}}>{ln.cajas}</td>
                <td style={{padding:"6px 8px"}}>{ln.pctEmbarque}%</td>
                <td style={{padding:"6px 8px",fontWeight:700,color:C.green}}>USD {ln.retornoBruto?.toLocaleString()}</td>
                <td style={{padding:"6px 8px",color:"#dc2626"}}>{ln.comisionPct}% = USD {ln.comision?.toLocaleString()}</td>
                <td style={{padding:"6px 8px"}}><input type="number" disabled={!can} value={ln.gastosProceso||""} onChange={e=>updLinea(ln.id,"gastosProceso",parseFloat(e.target.value)||0)} style={{width:70,padding:"3px 5px",border:`1px solid ${C.border}`,borderRadius:4,fontSize:10,textAlign:"right"}}/></td>
                <td style={{padding:"6px 8px"}}><input type="number" disabled={!can} value={ln.flete||""} onChange={e=>updLinea(ln.id,"flete",parseFloat(e.target.value)||0)} style={{width:70,padding:"3px 5px",border:`1px solid ${C.border}`,borderRadius:4,fontSize:10,textAlign:"right"}}/></td>
                <td style={{padding:"6px 8px",fontWeight:800,color:C.blue}}>USD {ln.netoLiquidacion?.toLocaleString()}</td>
                <td style={{padding:"6px 8px"}}><input type="number" disabled={!can} value={ln.anticipoDescontar||""} onChange={e=>updLinea(ln.id,"anticipoDescontar",parseFloat(e.target.value)||0)} style={{width:70,padding:"3px 5px",border:`1px solid ${C.border}`,borderRadius:4,fontSize:10,textAlign:"right"}}/></td>
                <td style={{padding:"6px 8px",fontWeight:800,color:C.teal}}>USD {ln.netoAPagar?.toLocaleString()}</td>
                <td style={{padding:"6px 8px"}}><select disabled={!can} value={ln.estado||"Pendiente"} onChange={e=>updLinea(ln.id,"estado",e.target.value)} style={{padding:"3px 5px",border:`1px solid ${C.border}`,borderRadius:4,fontSize:10}}>{ESTADOS_LIQ.map(s=><option key={s}>{s}</option>)}</select></td>
              </tr>))}
            </tbody>
          </table>
        </div>
        <div style={{marginTop:12,padding:12,background:`${C.teal}11`,borderRadius:8,display:"flex",justifyContent:"space-between",fontSize:12}}>
          <span>Total retorno: <strong>USD {lineas.reduce((s,l)=>s+(l.retornoBruto||0),0).toLocaleString()}</strong></span>
          <span>Total comisiones: <strong>USD {lineas.reduce((s,l)=>s+(l.comision||0),0).toLocaleString()}</strong></span>
          <span>Total neto a pagar: <strong style={{color:C.teal}}>USD {lineas.reduce((s,l)=>s+(l.netoAPagar||0),0).toLocaleString()}</strong></span>
        </div>
      </div>
    );
  }

  // Lista
  return(
    <div>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}>
        {can&&<button onClick={()=>{setForm({embarqueId:"",liqClienteUSD:0});setModal(true);}} style={{background:C.green,color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Nueva Liquidación</button>}
      </div>
      <div style={{overflowX:"auto",borderRadius:10,border:`1px solid ${C.border}`}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr style={{background:C.bg2}}>{["Fecha","Contenedor","Cajas","Liq. Cliente USD","Productores","Estado",""].map(h=><th key={h} style={{padding:"6px 10px",textAlign:"left",color:C.muted,fontWeight:700,fontSize:10}}>{h}</th>)}</tr></thead>
          <tbody>{data.filter(l=>l.temporada===temporada).map((l,i)=>(
            <tr key={l.id} onClick={()=>setDetalle(l.id)} style={{borderBottom:`1px solid ${C.border}22`,cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background=`${C.green}11`} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <td style={{padding:"6px 10px",color:C.muted}}>{l.fechaCreacion}</td>
              <td style={{padding:"6px 10px",fontWeight:700,color:C.text}}>{l.contenedor}</td>
              <td style={{padding:"6px 10px"}}>{l.totalCajas}</td>
              <td style={{padding:"6px 10px",fontWeight:700,color:C.green}}>USD {(l.liqClienteUSD||0).toLocaleString()}</td>
              <td style={{padding:"6px 10px",color:C.muted,fontSize:10}}>{(l.lineas||[]).map(ln=>ln.productor).join(", ")}</td>
              <td style={{padding:"6px 10px"}}><span style={{fontSize:9,padding:"2px 8px",borderRadius:10,fontWeight:700,background:`${C.green}22`,color:C.green}}>{l.estado}</span></td>
              <td style={{padding:"6px 10px",color:C.green,fontWeight:700}}>Ver →</td>
            </tr>))}
            {data.filter(l=>l.temporada===temporada).length===0&&<tr><td colSpan={7} style={{padding:30,textAlign:"center",color:C.muted2}}>Sin liquidaciones</td></tr>}
          </tbody>
        </table>
      </div>
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setModal(false)}>
          <div style={{background:C.card,borderRadius:14,padding:24,maxWidth:480,width:"100%",border:`1px solid ${C.border}`}} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:"0 0 16px",color:C.text}}>Nueva Liquidación Productor</h3>
            <div style={{marginBottom:12}}><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Embarque *</div>
              <select value={form.embarqueId} onChange={e=>setForm(p=>({...p,embarqueId:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}>
                <option value="">— Seleccionar embarque —</option>
                {(embarques||[]).filter(e=>e.temporada===temporada).map(e=><option key={e.id} value={e.id}>{e.contenedor} — {e.totalPallets||0} pallets · {e.totalCajas||0} cajas</option>)}
              </select></div>
            <div style={{marginBottom:12}}><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Liquidación Cliente (USD total recibido) *</div>
              <input type="number" value={form.liqClienteUSD||""} onChange={e=>setForm(p=>({...p,liqClienteUSD:parseFloat(e.target.value)||0}))} placeholder="50000" style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box",textAlign:"right"}}/></div>
            <div style={{fontSize:11,color:C.muted,padding:10,background:C.bg2,borderRadius:8,marginBottom:16}}>
              💡 El sistema calculará automáticamente la proporción por cajas para cada productor, aplicando la comisión del contrato.
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={()=>setModal(false)} style={{padding:"8px 18px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer"}}>Cancelar</button>
              <button onClick={crearLiquidacion} style={{padding:"8px 18px",borderRadius:8,border:"none",background:C.green,color:"#fff",cursor:"pointer",fontWeight:700}}>Calcular y Crear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// LIQUIDACION CLIENTE (simplificada)
// ═══════════════════════════════════════════════════════════════════
function LiquidacionClienteModule({data, setData, embarques, can, temporada}) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({embarqueId:"",montoUSD:0,fecha:"",nDocumento:"",observaciones:""});

  function guardar(){
    if(!form.embarqueId){alert("Selecciona un embarque.");return;}
    const emb=(embarques||[]).find(e=>e.id===form.embarqueId);
    setData(prev=>[...prev,{...form,id:`alc_${Date.now()}`,temporada,contenedor:emb?.contenedor||""}]);
    setForm({embarqueId:"",montoUSD:0,fecha:"",nDocumento:"",observaciones:""});setModal(false);
  }

  return(
    <div>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}>
        {can&&<button onClick={()=>setModal(true)} style={{background:C.blue,color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Nueva Liq. Cliente</button>}
      </div>
      <div style={{overflowX:"auto",borderRadius:10,border:`1px solid ${C.border}`}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr style={{background:C.bg2}}>{["Fecha","Contenedor","Monto USD","N° Doc","Obs.",""].map(h=><th key={h} style={{padding:"6px 10px",textAlign:"left",color:C.muted,fontWeight:700,fontSize:10}}>{h}</th>)}</tr></thead>
          <tbody>{data.filter(l=>l.temporada===temporada).map((l,i)=>(
            <tr key={l.id} style={{borderBottom:`1px solid ${C.border}22`}}>
              <td style={{padding:"6px 10px",color:C.muted}}>{l.fecha||"—"}</td>
              <td style={{padding:"6px 10px",fontWeight:700}}>{l.contenedor}</td>
              <td style={{padding:"6px 10px",fontWeight:700,color:C.green}}>USD {(parseFloat(l.montoUSD)||0).toLocaleString()}</td>
              <td style={{padding:"6px 10px",color:C.muted}}>{l.nDocumento||"—"}</td>
              <td style={{padding:"6px 10px",color:C.muted,fontSize:10}}>{l.observaciones||"—"}</td>
              <td style={{padding:"6px 10px"}}>{can&&<button onClick={()=>{if(window.confirm("¿Eliminar?"))setData(prev=>prev.filter(x=>x.id!==l.id));}} style={{background:"#fef2f2",border:"none",borderRadius:4,padding:"3px 6px",cursor:"pointer",fontSize:10,color:"#991b1b"}}>🗑</button>}</td>
            </tr>))}
            {data.filter(l=>l.temporada===temporada).length===0&&<tr><td colSpan={6} style={{padding:30,textAlign:"center",color:C.muted2}}>Sin liquidaciones de cliente</td></tr>}
          </tbody>
        </table>
      </div>
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setModal(false)}>
          <div style={{background:C.card,borderRadius:14,padding:24,maxWidth:480,width:"100%",border:`1px solid ${C.border}`}} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:"0 0 16px",color:C.text}}>Nueva Liquidación Cliente</h3>
            <div style={{display:"grid",gap:12}}>
              <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Embarque *</div>
                <select value={form.embarqueId} onChange={e=>setForm(p=>({...p,embarqueId:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}>
                  <option value="">—</option>{(embarques||[]).filter(e=>e.temporada===temporada).map(e=><option key={e.id} value={e.id}>{e.contenedor}</option>)}</select></div>
              <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Monto USD</div>
                <input type="number" value={form.montoUSD||""} onChange={e=>setForm(p=>({...p,montoUSD:parseFloat(e.target.value)||0}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box",textAlign:"right"}}/></div>
              <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Fecha</div>
                <input type="date" value={form.fecha||""} onChange={e=>setForm(p=>({...p,fecha:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}/></div>
              <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>N° Documento</div>
                <input value={form.nDocumento||""} onChange={e=>setForm(p=>({...p,nDocumento:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}/></div>
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
              <button onClick={()=>setModal(false)} style={{padding:"8px 18px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer"}}>Cancelar</button>
              <button onClick={guardar} style={{padding:"8px 18px",borderRadius:8,border:"none",background:C.blue,color:"#fff",cursor:"pointer",fontWeight:700}}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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

// ═══════════════════════════════════════════════════════════════════
// PROGRAMA COMERCIAL
// ═══════════════════════════════════════════════════════════════════
function ProgramaComercialModule({data, setData, productores, clientes, can}) {
  const [tab, setTab] = useState("recepcion");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({tipo:"recepcion",semana:"",productor:"",fruta:"",variedad:"",kgEstimado:0,kgReal:0,cliente:"",calibre:"",estado:"Programado",observaciones:""});
  const [editId, setEditId] = useState(null);
  const [busq, setBusq] = useState("");

  const TABS=[{id:"recepcion",label:"📥 Programa Recepción"},{id:"asignacion",label:"🔗 Asignación Prod→Cliente"},{id:"resumen",label:"📊 Resumen Semanal"}];
  const ESTADOS=["Programado","Confirmado","Recibido","Cancelado"];

  function guardar(){
    if(!form.semana||!form.productor){alert("Semana y Productor son obligatorios.");return;}
    if(editId){setData(prev=>prev.map(r=>r.id===editId?{...r,...form}:r));}
    else{setData(prev=>[...prev,{...form,id:`prog_${Date.now()}`}]);}
    setForm({tipo:"recepcion",semana:"",productor:"",fruta:"",variedad:"",kgEstimado:0,kgReal:0,cliente:"",calibre:"",estado:"Programado",observaciones:""});
    setModal(false);setEditId(null);
  }

  const filtrado=data.filter(r=>(!busq||r.productor?.toLowerCase().includes(busq.toLowerCase()))&&(tab==="resumen"||r.tipo===tab||(tab==="recepcion"&&!r.tipo)));
  const totalKgEst=filtrado.reduce((s,r)=>s+(parseFloat(r.kgEstimado)||0),0);
  const totalKgReal=filtrado.reduce((s,r)=>s+(parseFloat(r.kgReal)||0),0);

  return(
    <div>
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
        {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)}
          style={{padding:"8px 16px",borderRadius:8,border:tab===t.id?`2px solid ${C.teal}`:`1px solid ${C.border}`,background:tab===t.id?C.teal:"transparent",color:tab===t.id?"#fff":C.muted,cursor:"pointer",fontSize:12,fontWeight:700}}>{t.label}</button>)}
      </div>
      {tab==="resumen"?(
        <div>
          <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
            <div style={{background:`${C.teal}15`,borderRadius:10,padding:"14px 20px",flex:1,minWidth:140}}>
              <div style={{fontSize:10,color:C.muted}}>Kg estimados</div>
              <div style={{fontSize:20,fontWeight:800,color:C.teal}}>{totalKgEst.toLocaleString()}</div></div>
            <div style={{background:`${C.green}15`,borderRadius:10,padding:"14px 20px",flex:1,minWidth:140}}>
              <div style={{fontSize:10,color:C.muted}}>Kg reales</div>
              <div style={{fontSize:20,fontWeight:800,color:C.green}}>{totalKgReal.toLocaleString()}</div></div>
            <div style={{background:`${C.yellow}15`,borderRadius:10,padding:"14px 20px",flex:1,minWidth:140}}>
              <div style={{fontSize:10,color:C.muted}}>Cumplimiento</div>
              <div style={{fontSize:20,fontWeight:800,color:C.yellow}}>{totalKgEst>0?Math.round(totalKgReal/totalKgEst*100):0}%</div></div>
          </div>
          <div style={{overflowX:"auto",borderRadius:10,border:`1px solid ${C.border}`}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead><tr style={{background:C.bg2}}>{["Semana","Productor","Fruta","Variedad","Kg Est.","Kg Real","Cliente","Estado"].map(h=><th key={h} style={{padding:"6px 10px",textAlign:"left",color:C.muted,fontWeight:700,fontSize:10}}>{h}</th>)}</tr></thead>
              <tbody>{data.map((r,i)=>(
                <tr key={r.id} style={{borderBottom:`1px solid ${C.border}22`,background:i%2?"transparent":`${C.border}08`}}>
                  <td style={{padding:"6px 10px",fontWeight:600,color:C.text}}>{r.semana}</td>
                  <td style={{padding:"6px 10px",color:C.muted}}>{r.productor}</td>
                  <td style={{padding:"6px 10px"}}><span style={{fontSize:9,background:`${C.teal}22`,color:C.teal,padding:"1px 6px",borderRadius:10,fontWeight:600}}>{r.fruta}</span></td>
                  <td style={{padding:"6px 10px",color:C.muted}}>{r.variedad||"—"}</td>
                  <td style={{padding:"6px 10px",textAlign:"right",color:C.text}}>{(parseFloat(r.kgEstimado)||0).toLocaleString()}</td>
                  <td style={{padding:"6px 10px",textAlign:"right",fontWeight:700,color:C.green}}>{(parseFloat(r.kgReal)||0).toLocaleString()}</td>
                  <td style={{padding:"6px 10px",color:C.muted}}>{r.cliente||"—"}</td>
                  <td style={{padding:"6px 10px"}}><span style={{fontSize:9,padding:"2px 8px",borderRadius:10,fontWeight:700,background:r.estado==="Recibido"?`${C.green}22`:r.estado==="Cancelado"?"#fee2e2":`${C.yellow}22`,color:r.estado==="Recibido"?C.green:r.estado==="Cancelado"?"#dc2626":C.yellow}}>{r.estado}</span></td>
                </tr>))}</tbody>
            </table>
          </div>
        </div>
      ):(
        <div>
          <div style={{display:"flex",gap:12,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
            <input value={busq} onChange={e=>setBusq(e.target.value)} placeholder="🔍 Buscar..." style={{padding:"8px 14px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,outline:"none",flex:1,minWidth:200}}/>
            {can&&<button onClick={()=>{setForm({tipo:tab==="asignacion"?"asignacion":"recepcion",semana:"",productor:"",fruta:"",variedad:"",kgEstimado:0,kgReal:0,cliente:"",calibre:"",estado:"Programado",observaciones:""});setEditId(null);setModal(true);}}
              style={{background:C.teal,color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Nuevo registro</button>}
          </div>
          <div style={{overflowX:"auto",borderRadius:10,border:`1px solid ${C.border}`}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead><tr style={{background:C.bg2}}>{["Semana","Productor","Fruta","Variedad",tab==="asignacion"?"Cliente":"","Kg Est.","Kg Real","Estado",""].map(h=>h?<th key={h} style={{padding:"6px 10px",textAlign:"left",color:C.muted,fontWeight:700,fontSize:10}}>{h}</th>:null)}</tr></thead>
              <tbody>{filtrado.map((r,i)=>(
                <tr key={r.id} style={{borderBottom:`1px solid ${C.border}22`}}>
                  <td style={{padding:"6px 10px",fontWeight:600,color:C.text}}>{r.semana}</td>
                  <td style={{padding:"6px 10px",color:C.muted}}>{r.productor}</td>
                  <td style={{padding:"6px 10px"}}><span style={{fontSize:9,background:`${C.teal}22`,color:C.teal,padding:"1px 6px",borderRadius:10,fontWeight:600}}>{r.fruta}</span></td>
                  <td style={{padding:"6px 10px",color:C.muted}}>{r.variedad||"—"}</td>
                  {tab==="asignacion"&&<td style={{padding:"6px 10px",color:C.muted}}>{r.cliente||"—"}</td>}
                  <td style={{padding:"6px 10px",textAlign:"right"}}>{(parseFloat(r.kgEstimado)||0).toLocaleString()}</td>
                  <td style={{padding:"6px 10px",textAlign:"right",fontWeight:700,color:C.green}}>{(parseFloat(r.kgReal)||0).toLocaleString()}</td>
                  <td style={{padding:"6px 10px"}}><span style={{fontSize:9,padding:"2px 8px",borderRadius:10,fontWeight:700,background:r.estado==="Recibido"?`${C.green}22`:`${C.yellow}22`,color:r.estado==="Recibido"?C.green:C.yellow}}>{r.estado}</span></td>
                  <td style={{padding:"6px 10px"}}>{can&&<button onClick={()=>{setEditId(r.id);setForm({...r});setModal(true);}} style={{background:C.card2,border:`1px solid ${C.border}`,color:C.muted,borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:10}}>✏️</button>}</td>
                </tr>))}
                {filtrado.length===0&&<tr><td colSpan={9} style={{padding:30,textAlign:"center",color:C.muted2}}>Sin registros</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setModal(false)}>
          <div style={{background:C.card,borderRadius:14,padding:24,maxWidth:520,width:"100%",border:`1px solid ${C.border}`,maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:"0 0 16px",color:C.text}}>{editId?"Editar":"Nuevo"} {tab==="asignacion"?"Asignación":"Programa Recepción"}</h3>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Semana *</div>
                <input value={form.semana} placeholder="S1, S2..." onChange={e=>setForm(p=>({...p,semana:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}/></div>
              <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Productor *</div>
                <select value={form.productor} onChange={e=>setForm(p=>({...p,productor:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}>
                  <option value="">— Seleccionar —</option>{(productores||[]).map(p=><option key={p.id} value={p.nombre}>{p.nombre}</option>)}</select></div>
              <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Fruta</div>
                <select value={form.fruta} onChange={e=>setForm(p=>({...p,fruta:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}>
                  <option value="">—</option>{FRUTAS.map(f=><option key={f}>{f}</option>)}</select></div>
              <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Variedad</div>
                <input value={form.variedad} onChange={e=>setForm(p=>({...p,variedad:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}/></div>
              <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Kg estimado</div>
                <input type="number" value={form.kgEstimado} onChange={e=>setForm(p=>({...p,kgEstimado:parseFloat(e.target.value)||0}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box",textAlign:"right"}}/></div>
              <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Kg real</div>
                <input type="number" value={form.kgReal} onChange={e=>setForm(p=>({...p,kgReal:parseFloat(e.target.value)||0}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box",textAlign:"right"}}/></div>
              {tab==="asignacion"&&<div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Cliente destino</div>
                <select value={form.cliente} onChange={e=>setForm(p=>({...p,cliente:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}>
                  <option value="">— Seleccionar —</option>{(clientes||[]).map(c=><option key={c.id} value={c.nombre}>{c.nombre}</option>)}</select></div>}
              <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Estado</div>
                <select value={form.estado} onChange={e=>setForm(p=>({...p,estado:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}>
                  {ESTADOS.map(s=><option key={s}>{s}</option>)}</select></div>
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
              <button onClick={()=>setModal(false)} style={{padding:"8px 18px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer"}}>Cancelar</button>
              <button onClick={guardar} style={{padding:"8px 18px",borderRadius:8,border:"none",background:C.teal,color:"#fff",cursor:"pointer",fontWeight:700}}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// RECEPCIÓN & PROCESO
// ═══════════════════════════════════════════════════════════════════
function RecepcionProcesoModule({data, setData, productores, can}) {
  const [tab, setTab] = useState("recepcion");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({fecha:"",productor:"",fruta:"",variedad:"",bins:0,kgBruto:0,kgNeto:0,qcRecepcion:"",estadoProceso:"Pendiente",resultadoProceso:{cajasObtenidas:0,descarte:0,merma:0},informeProductor:"",informeAllegria:"",observaciones:""});
  const [editId, setEditId] = useState(null);
  const TABS=[{id:"recepcion",label:"📥 Recepción"},{id:"proceso",label:"🏭 Proceso"},{id:"resultados",label:"📊 Resultados"}];
  const ESTADOS_PROC=["Pendiente","En recepción","En proceso","Procesado","Informado"];

  function guardar(){
    if(!form.fecha||!form.productor){alert("Fecha y Productor obligatorios.");return;}
    if(editId){setData(prev=>prev.map(r=>r.id===editId?{...r,...form}:r));}
    else{setData(prev=>[...prev,{...form,id:`rec_${Date.now()}`}]);}
    setForm({fecha:"",productor:"",fruta:"",variedad:"",bins:0,kgBruto:0,kgNeto:0,qcRecepcion:"",estadoProceso:"Pendiente",resultadoProceso:{cajasObtenidas:0,descarte:0,merma:0},informeProductor:"",informeAllegria:"",observaciones:""});
    setModal(false);setEditId(null);
  }

  const filtrado=data;
  return(
    <div>
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
        {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"8px 16px",borderRadius:8,border:tab===t.id?`2px solid #dc2626`:`1px solid ${C.border}`,background:tab===t.id?"#dc2626":"transparent",color:tab===t.id?"#fff":C.muted,cursor:"pointer",fontSize:12,fontWeight:700}}>{t.label}</button>)}
      </div>
      <div style={{display:"flex",gap:12,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        {can&&<button onClick={()=>{setEditId(null);setForm({fecha:"",productor:"",fruta:"",variedad:"",bins:0,kgBruto:0,kgNeto:0,qcRecepcion:"",estadoProceso:"Pendiente",resultadoProceso:{cajasObtenidas:0,descarte:0,merma:0},informeProductor:"",informeAllegria:"",observaciones:""});setModal(true);}}
          style={{background:"#dc2626",color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Nueva recepción</button>}
        <div style={{fontSize:11,color:C.muted}}>{filtrado.length} recepciones · {filtrado.reduce((s,r)=>s+(r.bins||0),0)} bins · {filtrado.reduce((s,r)=>s+(parseFloat(r.kgNeto)||0),0).toLocaleString()} kg neto</div>
      </div>
      <div style={{overflowX:"auto",borderRadius:10,border:`1px solid ${C.border}`}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr style={{background:C.bg2}}>{["Fecha","Productor","Fruta","Variedad","Bins","Kg bruto","Kg neto","QC","Estado",tab!=="recepcion"?"Cajas":"",""].map(h=>h!==""?<th key={h} style={{padding:"6px 10px",textAlign:"left",color:C.muted,fontWeight:700,fontSize:10}}>{h}</th>:null)}</tr></thead>
          <tbody>{filtrado.map((r,i)=>(
            <tr key={r.id} style={{borderBottom:`1px solid ${C.border}22`,background:i%2?"transparent":`${C.border}08`}}>
              <td style={{padding:"6px 10px",fontWeight:600,color:C.text}}>{r.fecha}</td>
              <td style={{padding:"6px 10px",color:C.muted}}>{r.productor}</td>
              <td style={{padding:"6px 10px"}}><span style={{fontSize:9,background:`${C.accent}22`,color:C.accent,padding:"1px 6px",borderRadius:10,fontWeight:600}}>{r.fruta}</span></td>
              <td style={{padding:"6px 10px",color:C.muted}}>{r.variedad||"—"}</td>
              <td style={{padding:"6px 10px",textAlign:"right"}}>{r.bins||0}</td>
              <td style={{padding:"6px 10px",textAlign:"right"}}>{(parseFloat(r.kgBruto)||0).toLocaleString()}</td>
              <td style={{padding:"6px 10px",textAlign:"right",fontWeight:700}}>{(parseFloat(r.kgNeto)||0).toLocaleString()}</td>
              <td style={{padding:"6px 10px",color:C.muted}}>{r.qcRecepcion?"✅":"—"}</td>
              <td style={{padding:"6px 10px"}}><span style={{fontSize:9,padding:"2px 8px",borderRadius:10,fontWeight:700,background:r.estadoProceso==="Procesado"||r.estadoProceso==="Informado"?`${C.green}22`:`${C.yellow}22`,color:r.estadoProceso==="Procesado"||r.estadoProceso==="Informado"?C.green:C.yellow}}>{r.estadoProceso}</span></td>
              {tab!=="recepcion"&&<td style={{padding:"6px 10px",textAlign:"right",fontWeight:700,color:C.blue}}>{r.resultadoProceso?.cajasObtenidas||0}</td>}
              <td style={{padding:"6px 10px"}}>{can&&<button onClick={()=>{setEditId(r.id);setForm({...r});setModal(true);}} style={{background:C.card2,border:`1px solid ${C.border}`,color:C.muted,borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:10}}>✏️</button>}</td>
            </tr>))}
            {filtrado.length===0&&<tr><td colSpan={11} style={{padding:30,textAlign:"center",color:C.muted2}}>Sin recepciones</td></tr>}
          </tbody>
        </table>
      </div>
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setModal(false)}>
          <div style={{background:C.card,borderRadius:14,padding:24,maxWidth:560,width:"100%",border:`1px solid ${C.border}`,maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:"0 0 16px",color:C.text}}>{editId?"Editar":"Nueva"} Recepción</h3>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Fecha *</div><input type="date" value={form.fecha} onChange={e=>setForm(p=>({...p,fecha:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}/></div>
              <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Productor *</div><select value={form.productor} onChange={e=>setForm(p=>({...p,productor:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}><option value="">—</option>{(productores||[]).map(p=><option key={p.id} value={p.nombre}>{p.nombre}</option>)}</select></div>
              <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Fruta</div><select value={form.fruta} onChange={e=>setForm(p=>({...p,fruta:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}><option value="">—</option>{FRUTAS.map(f=><option key={f}>{f}</option>)}</select></div>
              <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Variedad</div><input value={form.variedad||""} onChange={e=>setForm(p=>({...p,variedad:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}/></div>
              {[["Bins","bins","number"],["Kg bruto","kgBruto","number"],["Kg neto","kgNeto","number"]].map(([l,f,t])=>(
                <div key={f}><div style={{fontSize:10,color:C.muted,marginBottom:4}}>{l}</div><input type={t} value={form[f]||""} onChange={e=>setForm(p=>({...p,[f]:t==="number"?parseFloat(e.target.value)||0:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box",textAlign:t==="number"?"right":"left"}}/></div>))}
              <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Estado proceso</div><select value={form.estadoProceso} onChange={e=>setForm(p=>({...p,estadoProceso:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}>{ESTADOS_PROC.map(s=><option key={s}>{s}</option>)}</select></div>
              <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Cajas obtenidas</div><input type="number" value={form.resultadoProceso?.cajasObtenidas||""} onChange={e=>setForm(p=>({...p,resultadoProceso:{...(p.resultadoProceso||{}),cajasObtenidas:parseInt(e.target.value)||0}}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box",textAlign:"right"}}/></div>
              <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>QC Recepción</div><input value={form.qcRecepcion||""} placeholder="Observaciones QC..." onChange={e=>setForm(p=>({...p,qcRecepcion:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}/></div>
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
              <button onClick={()=>setModal(false)} style={{padding:"8px 18px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer"}}>Cancelar</button>
              <button onClick={guardar} style={{padding:"8px 18px",borderRadius:8,border:"none",background:"#dc2626",color:"#fff",cursor:"pointer",fontWeight:700}}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STOCK & PALLETS
// ═══════════════════════════════════════════════════════════════════
function StockPalletsModule({data, setData, can}) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({codigoPallet:"",fruta:"",variedad:"",calibre:"",color:"",embalaje:"",cajas:0,kgNeto:0,fechaProceso:"",estadoSAG:"Pendiente",disponible:false,observaciones:""});
  const [editId, setEditId] = useState(null);
  const [busq, setBusq] = useState("");
  const [filtroSAG, setFiltroSAG] = useState("Todos");
  const ESTADOS_SAG=["Pendiente","En inspección","Aprobado","Rechazado"];

  function guardar(){
    if(!form.codigoPallet){alert("Código pallet obligatorio.");return;}
    if(editId){setData(prev=>prev.map(r=>r.id===editId?{...r,...form,disponible:form.estadoSAG==="Aprobado"}:r));}
    else{setData(prev=>[...prev,{...form,id:`plt_${Date.now()}`,disponible:form.estadoSAG==="Aprobado"}]);}
    setForm({codigoPallet:"",fruta:"",variedad:"",calibre:"",color:"",embalaje:"",cajas:0,kgNeto:0,fechaProceso:"",estadoSAG:"Pendiente",disponible:false,observaciones:""});
    setModal(false);setEditId(null);
  }

  const filtrado=data.filter(p=>(!busq||p.codigoPallet?.toLowerCase().includes(busq.toLowerCase())||p.fruta?.toLowerCase().includes(busq.toLowerCase()))&&(filtroSAG==="Todos"||p.estadoSAG===filtroSAG));
  const aprobados=data.filter(p=>p.estadoSAG==="Aprobado").length;
  const totalCajas=filtrado.reduce((s,p)=>s+(p.cajas||0),0);

  return(
    <div>
      <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        <div style={{background:`${C.green}15`,borderRadius:10,padding:"12px 18px",flex:1,minWidth:120}}>
          <div style={{fontSize:10,color:C.muted}}>Aprobados SAG</div><div style={{fontSize:18,fontWeight:800,color:C.green}}>{aprobados}</div></div>
        <div style={{background:`${C.blue}15`,borderRadius:10,padding:"12px 18px",flex:1,minWidth:120}}>
          <div style={{fontSize:10,color:C.muted}}>Total pallets</div><div style={{fontSize:18,fontWeight:800,color:C.blue}}>{data.length}</div></div>
        <div style={{background:`${C.yellow}15`,borderRadius:10,padding:"12px 18px",flex:1,minWidth:120}}>
          <div style={{fontSize:10,color:C.muted}}>Total cajas</div><div style={{fontSize:18,fontWeight:800,color:C.yellow}}>{totalCajas.toLocaleString()}</div></div>
      </div>
      <div style={{display:"flex",gap:12,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <input value={busq} onChange={e=>setBusq(e.target.value)} placeholder="🔍 Buscar pallet..." style={{padding:"8px 14px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,outline:"none",flex:1,minWidth:200}}/>
        <div style={{display:"flex",gap:4}}>{["Todos",...ESTADOS_SAG].map(s=><button key={s} onClick={()=>setFiltroSAG(s)} style={{padding:"5px 12px",borderRadius:20,border:`1px solid ${filtroSAG===s?"#ea580c":C.border}`,background:filtroSAG===s?"#ea580c22":"transparent",color:filtroSAG===s?"#ea580c":C.muted,cursor:"pointer",fontSize:10,fontWeight:600}}>{s}</button>)}</div>
        {can&&<button onClick={()=>{setEditId(null);setForm({codigoPallet:"",fruta:"",variedad:"",calibre:"",color:"",embalaje:"",cajas:0,kgNeto:0,fechaProceso:"",estadoSAG:"Pendiente",disponible:false,observaciones:""});setModal(true);}}
          style={{background:"#ea580c",color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Nuevo pallet</button>}
      </div>
      <div style={{overflowX:"auto",borderRadius:10,border:`1px solid ${C.border}`}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr style={{background:C.bg2}}>{["Código","Fruta","Variedad","Calibre","Color","Embalaje","Cajas","Kg neto","SAG","Disponible",""].map(h=><th key={h} style={{padding:"6px 10px",textAlign:"left",color:C.muted,fontWeight:700,fontSize:10}}>{h}</th>)}</tr></thead>
          <tbody>{filtrado.map((p,i)=>(
            <tr key={p.id} style={{borderBottom:`1px solid ${C.border}22`,background:i%2?"transparent":`${C.border}08`}}>
              <td style={{padding:"6px 10px",fontWeight:700,color:C.text,fontFamily:"monospace"}}>{p.codigoPallet}</td>
              <td style={{padding:"6px 10px"}}><span style={{fontSize:9,background:`${C.teal}22`,color:C.teal,padding:"1px 6px",borderRadius:10,fontWeight:600}}>{p.fruta}</span></td>
              <td style={{padding:"6px 10px",color:C.muted}}>{p.variedad||"—"}</td>
              <td style={{padding:"6px 10px",color:C.muted}}>{p.calibre||"—"}</td>
              <td style={{padding:"6px 10px",color:C.muted}}>{p.color||"—"}</td>
              <td style={{padding:"6px 10px",color:C.muted}}>{p.embalaje||"—"}</td>
              <td style={{padding:"6px 10px",textAlign:"right",fontWeight:700}}>{p.cajas||0}</td>
              <td style={{padding:"6px 10px",textAlign:"right"}}>{(parseFloat(p.kgNeto)||0).toLocaleString()}</td>
              <td style={{padding:"6px 10px"}}><span style={{fontSize:9,padding:"2px 8px",borderRadius:10,fontWeight:700,background:p.estadoSAG==="Aprobado"?`${C.green}22`:p.estadoSAG==="Rechazado"?"#fee2e2":`${C.yellow}22`,color:p.estadoSAG==="Aprobado"?C.green:p.estadoSAG==="Rechazado"?"#dc2626":C.yellow}}>{p.estadoSAG}</span></td>
              <td style={{padding:"6px 10px"}}>{p.disponible?<span style={{color:C.green,fontWeight:700}}>✅</span>:<span style={{color:C.muted}}>—</span>}</td>
              <td style={{padding:"6px 10px"}}>{can&&<button onClick={()=>{setEditId(p.id);setForm({...p});setModal(true);}} style={{background:C.card2,border:`1px solid ${C.border}`,color:C.muted,borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:10}}>✏️</button>}</td>
            </tr>))}
            {filtrado.length===0&&<tr><td colSpan={11} style={{padding:30,textAlign:"center",color:C.muted2}}>Sin pallets</td></tr>}
          </tbody>
        </table>
      </div>
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setModal(false)}>
          <div style={{background:C.card,borderRadius:14,padding:24,maxWidth:560,width:"100%",border:`1px solid ${C.border}`,maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:"0 0 16px",color:C.text}}>{editId?"Editar":"Nuevo"} Pallet</h3>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {[["Código pallet *","codigoPallet"],["Fruta","fruta"],["Variedad","variedad"],["Calibre","calibre"],["Color","color"],["Embalaje","embalaje"]].map(([l,f])=>(
                <div key={f}><div style={{fontSize:10,color:C.muted,marginBottom:4}}>{l}</div>
                  {f==="fruta"?<select value={form[f]||""} onChange={e=>setForm(p=>({...p,[f]:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}><option value="">—</option>{FRUTAS.map(fr=><option key={fr}>{fr}</option>)}</select>
                  :<input value={form[f]||""} onChange={e=>setForm(p=>({...p,[f]:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}/>}</div>))}
              {[["Cajas","cajas"],["Kg neto","kgNeto"]].map(([l,f])=>(
                <div key={f}><div style={{fontSize:10,color:C.muted,marginBottom:4}}>{l}</div><input type="number" value={form[f]||""} onChange={e=>setForm(p=>({...p,[f]:parseFloat(e.target.value)||0}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box",textAlign:"right"}}/></div>))}
              <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Fecha proceso</div><input type="date" value={form.fechaProceso||""} onChange={e=>setForm(p=>({...p,fechaProceso:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}/></div>
              <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Estado SAG</div><select value={form.estadoSAG} onChange={e=>setForm(p=>({...p,estadoSAG:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}>{ESTADOS_SAG.map(s=><option key={s}>{s}</option>)}</select></div>
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
              <button onClick={()=>setModal(false)} style={{padding:"8px 18px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer"}}>Cancelar</button>
              <button onClick={guardar} style={{padding:"8px 18px",borderRadius:8,border:"none",background:"#ea580c",color:"#fff",cursor:"pointer",fontWeight:700}}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MATERIALES & INVENTARIO
// ═══════════════════════════════════════════════════════════════════
function MaterialesInventarioModule({data, setData, recetas, setRecetas, embarques, can}) {
  const [tab, setTab] = useState("maestro");
  const [modal, setModal] = useState(false);
  const [modalType, setModalType] = useState("material"); // material | receta | ingreso
  const [form, setForm] = useState({});
  const [editId, setEditId] = useState(null);
  const TABS=[{id:"maestro",label:"🧱 Maestro"},{id:"recetas",label:"📋 Recetas"},{id:"ingresos",label:"📥 Ingresos"},{id:"stock",label:"📊 Stock"}];
  const CATEGORIAS_MAT=["Caja","Bolsa","Etiqueta","Cinta","Film","Esquinero","Pallet","Separador","Absorbente","Otro"];
  const UNIDADES=["Unidad","Kg","Metro","Rollo"];

  const materiales = data || [];
  const recetasArr = recetas || [];
  // Calcular stock: ingresos - consumos
  const calcStock = (matId) => {
    const ingresos = materiales.filter(m=>m.id===matId).reduce((s,m)=>s+((m.ingresos||[]).reduce((si,ing)=>si+(parseFloat(ing.cantidad)||0),0)),0);
    const consumos = materiales.filter(m=>m.id===matId).reduce((s,m)=>s+((m.consumos||[]).reduce((sc,con)=>sc+(parseFloat(con.cantidad)||0),0)),0);
    return ingresos - consumos;
  };

  function guardarMaterial(){
    if(!form.nombre){alert("Nombre obligatorio.");return;}
    if(editId){setData(prev=>prev.map(m=>m.id===editId?{...m,...form}:m));}
    else{setData(prev=>[...prev,{...form,id:`mat_${Date.now()}`,ingresos:[],consumos:[]}]);}
    setForm({});setModal(false);setEditId(null);
  }

  function guardarReceta(){
    if(!form.nombre){alert("Nombre obligatorio.");return;}
    if(editId){setRecetas(prev=>prev.map(r=>r.id===editId?{...r,...form}:r));}
    else{setRecetas(prev=>[...prev,{...form,id:`rct_${Date.now()}`}]);}
    setForm({});setModal(false);setEditId(null);
  }

  return(
    <div>
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
        {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"8px 16px",borderRadius:8,border:tab===t.id?`2px solid #854d0e`:`1px solid ${C.border}`,background:tab===t.id?"#854d0e":"transparent",color:tab===t.id?"#fff":C.muted,cursor:"pointer",fontSize:12,fontWeight:700}}>{t.label}</button>)}
      </div>

      {tab==="maestro"&&(
        <div>
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
            {can&&<button onClick={()=>{setModalType("material");setEditId(null);setForm({nombre:"",categoria:"Caja",unidad:"Unidad",proveedorHabitual:"",costoRef:0,stockMinimo:0,activo:true});setModal(true);}}
              style={{background:"#854d0e",color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Nuevo material</button>}
          </div>
          <div style={{overflowX:"auto",borderRadius:10,border:`1px solid ${C.border}`}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead><tr style={{background:C.bg2}}>{["Material","Categoría","Unidad","Proveedor","Costo ref.","Stock mín.","Stock actual",""].map(h=><th key={h} style={{padding:"6px 10px",textAlign:"left",color:C.muted,fontWeight:700,fontSize:10}}>{h}</th>)}</tr></thead>
              <tbody>{materiales.map((m,i)=>{
                const stock = calcStock(m.id);
                return(
                  <tr key={m.id} style={{borderBottom:`1px solid ${C.border}22`,background:i%2?"transparent":`${C.border}08`}}>
                    <td style={{padding:"6px 10px",fontWeight:600,color:C.text}}>{m.nombre}</td>
                    <td style={{padding:"6px 10px"}}><span style={{fontSize:9,background:`#854d0e22`,color:"#854d0e",padding:"1px 6px",borderRadius:10,fontWeight:600}}>{m.categoria}</span></td>
                    <td style={{padding:"6px 10px",color:C.muted}}>{m.unidad}</td>
                    <td style={{padding:"6px 10px",color:C.muted}}>{m.proveedorHabitual||"—"}</td>
                    <td style={{padding:"6px 10px",textAlign:"right"}}>{m.costoRef||"—"}</td>
                    <td style={{padding:"6px 10px",textAlign:"right"}}>{m.stockMinimo||0}</td>
                    <td style={{padding:"6px 10px",textAlign:"right",fontWeight:700,color:stock<(m.stockMinimo||0)?"#dc2626":C.green}}>{stock}</td>
                    <td style={{padding:"6px 10px"}}>{can&&<button onClick={()=>{setEditId(m.id);setModalType("material");setForm({nombre:m.nombre,categoria:m.categoria,unidad:m.unidad,proveedorHabitual:m.proveedorHabitual,costoRef:m.costoRef,stockMinimo:m.stockMinimo,activo:m.activo});setModal(true);}} style={{background:C.card2,border:`1px solid ${C.border}`,color:C.muted,borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:10}}>✏️</button>}</td>
                  </tr>);})}
                {materiales.length===0&&<tr><td colSpan={8} style={{padding:30,textAlign:"center",color:C.muted2}}>Sin materiales</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab==="recetas"&&(
        <div>
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
            {can&&<button onClick={()=>{setModalType("receta");setEditId(null);setForm({nombre:"",fruta:"",formato:"",mercado:"",pesoNetoCaja:0,cajasPorPallet:48,componentes:[]});setModal(true);}}
              style={{background:"#854d0e",color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Nueva receta</button>}
          </div>
          {recetasArr.length===0?(
            <div style={{padding:40,textAlign:"center",color:C.muted2,border:`1px dashed ${C.border}`,borderRadius:10}}>Sin recetas de embalaje. Crea una para definir los materiales por caja.</div>
          ):(
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
              {recetasArr.map(r=>(
                <div key={r.id} style={{border:`1px solid ${C.border}`,borderRadius:10,padding:14,background:C.card2}}>
                  <div style={{fontWeight:700,color:C.text,marginBottom:4}}>{r.nombre}</div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:8}}>{r.fruta} · {r.formato} · {r.mercado} · {r.pesoNetoCaja}kg/caja · {r.cajasPorPallet} cajas/pallet</div>
                  <div style={{fontSize:10,color:C.muted}}>Componentes: {(r.componentes||[]).length}</div>
                  {(r.componentes||[]).map((c,i)=><div key={i} style={{fontSize:10,color:C.text,padding:"2px 0"}}>· {c.cantidad} {c.unidad} — {c.material}</div>)}
                  {can&&<button onClick={()=>{setEditId(r.id);setModalType("receta");setForm({...r});setModal(true);}} style={{marginTop:8,background:C.card2,border:`1px solid ${C.border}`,color:C.muted,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:10}}>✏️ Editar</button>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab==="stock"&&(
        <div>
          <div style={{overflowX:"auto",borderRadius:10,border:`1px solid ${C.border}`}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead><tr style={{background:C.bg2}}>{["Material","Ingresos","Consumos","Stock actual","Mínimo","Estado"].map(h=><th key={h} style={{padding:"8px 12px",textAlign:"left",color:C.muted,fontWeight:700,fontSize:10}}>{h}</th>)}</tr></thead>
              <tbody>{materiales.map((m,i)=>{
                const ing = (m.ingresos||[]).reduce((s,x)=>s+(parseFloat(x.cantidad)||0),0);
                const con = (m.consumos||[]).reduce((s,x)=>s+(parseFloat(x.cantidad)||0),0);
                const stock = ing - con;
                const bajo = stock < (m.stockMinimo||0);
                return(
                  <tr key={m.id} style={{borderBottom:`1px solid ${C.border}22`,background:bajo?"#fef2f2":i%2?"transparent":`${C.border}08`}}>
                    <td style={{padding:"8px 12px",fontWeight:600,color:C.text}}>{m.nombre}</td>
                    <td style={{padding:"8px 12px",textAlign:"right",color:C.green}}>{ing.toLocaleString()}</td>
                    <td style={{padding:"8px 12px",textAlign:"right",color:"#dc2626"}}>{con.toLocaleString()}</td>
                    <td style={{padding:"8px 12px",textAlign:"right",fontWeight:800,color:bajo?"#dc2626":C.green}}>{stock.toLocaleString()}</td>
                    <td style={{padding:"8px 12px",textAlign:"right",color:C.muted}}>{m.stockMinimo||0}</td>
                    <td style={{padding:"8px 12px"}}>{bajo?<span style={{fontSize:9,padding:"2px 8px",borderRadius:10,fontWeight:700,background:"#fee2e2",color:"#dc2626"}}>🔴 Bajo mínimo</span>:<span style={{fontSize:9,padding:"2px 8px",borderRadius:10,fontWeight:700,background:`${C.green}22`,color:C.green}}>✅ OK</span>}</td>
                  </tr>);})}
                {materiales.length===0&&<tr><td colSpan={6} style={{padding:30,textAlign:"center",color:C.muted2}}>Sin materiales registrados</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab==="ingresos"&&(
        <div style={{padding:20,textAlign:"center",color:C.muted2}}>
          <div style={{fontSize:11}}>Los ingresos se registran desde el detalle de cada material en el tab Maestro (próxima iteración).</div>
        </div>
      )}

      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setModal(false)}>
          <div style={{background:C.card,borderRadius:14,padding:24,maxWidth:520,width:"100%",border:`1px solid ${C.border}`,maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:"0 0 16px",color:C.text}}>{editId?"Editar":"Nuevo"} {modalType==="receta"?"Receta":"Material"}</h3>
            {modalType==="material"?(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Nombre *</div><input value={form.nombre||""} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}/></div>
                <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Categoría</div><select value={form.categoria||"Caja"} onChange={e=>setForm(p=>({...p,categoria:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}>{CATEGORIAS_MAT.map(c=><option key={c}>{c}</option>)}</select></div>
                <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Unidad</div><select value={form.unidad||"Unidad"} onChange={e=>setForm(p=>({...p,unidad:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}>{UNIDADES.map(u=><option key={u}>{u}</option>)}</select></div>
                <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Proveedor habitual</div><input value={form.proveedorHabitual||""} onChange={e=>setForm(p=>({...p,proveedorHabitual:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}/></div>
                <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Costo ref.</div><input type="number" value={form.costoRef||""} onChange={e=>setForm(p=>({...p,costoRef:parseFloat(e.target.value)||0}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box",textAlign:"right"}}/></div>
                <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Stock mínimo</div><input type="number" value={form.stockMinimo||""} onChange={e=>setForm(p=>({...p,stockMinimo:parseInt(e.target.value)||0}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box",textAlign:"right"}}/></div>
              </div>
            ):(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div style={{gridColumn:"1/-1"}}><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Nombre receta *</div><input value={form.nombre||""} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}/></div>
                <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Fruta</div><select value={form.fruta||""} onChange={e=>setForm(p=>({...p,fruta:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}><option value="">—</option>{FRUTAS.map(f=><option key={f}>{f}</option>)}</select></div>
                <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Formato</div><input value={form.formato||""} placeholder="Caja 5kg, Caja 2.5kg..." onChange={e=>setForm(p=>({...p,formato:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}/></div>
                <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Mercado</div><input value={form.mercado||""} placeholder="China, USA..." onChange={e=>setForm(p=>({...p,mercado:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box"}}/></div>
                <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Peso neto/caja (kg)</div><input type="number" step="0.1" value={form.pesoNetoCaja||""} onChange={e=>setForm(p=>({...p,pesoNetoCaja:parseFloat(e.target.value)||0}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box",textAlign:"right"}}/></div>
                <div><div style={{fontSize:10,color:C.muted,marginBottom:4}}>Cajas por pallet</div><input type="number" value={form.cajasPorPallet||48} onChange={e=>setForm(p=>({...p,cajasPorPallet:parseInt(e.target.value)||48}))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,boxSizing:"border-box",textAlign:"right"}}/></div>
              </div>
            )}
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
              <button onClick={()=>setModal(false)} style={{padding:"8px 18px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer"}}>Cancelar</button>
              <button onClick={modalType==="receta"?guardarReceta:guardarMaterial} style={{padding:"8px 18px",borderRadius:8,border:"none",background:"#854d0e",color:"#fff",cursor:"pointer",fontWeight:700}}>Guardar</button>
            </div>
          </div>
        </div>
      )}
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

export default function AllegriaModule({usuarioActual, esAdmin, esSoloConsulta, tabPermisos={}, onBack, onLogout}) {
  const [subApp, setSubApp] = useState(null);
  const [liqTab, setLiqTab] = useState("cliente");
  const [showMaestro, setShowMaestro] = useState(false);
  const [data, setData] = useState({clientes:[],productores:[],programaComercial:[],recepciones:[],stockPT:[],materiales:[],recetas:[],embarques:[],liquidaciones:[],liqCliente:[],anticipos:[],cobranza:[],especiesAllegria:ESPECIES_ALLEGRIA_INIT,variedadesAllegria:[],hubCardsOrder:null});
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
        ["clientes","productores","embarques","liquidaciones","liqCliente","anticipos","cobranza","recepciones","stockPT","materiales","recetas","programaComercial"].forEach(k=>{
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
  const setRecepciones = fn => setData(p=>({...p, recepciones: typeof fn==="function"?fn(p.recepciones||[]):fn}));
  const setStockPT = fn => setData(p=>({...p, stockPT: typeof fn==="function"?fn(p.stockPT||[]):fn}));
  const setMateriales = fn => setData(p=>({...p, materiales: typeof fn==="function"?fn(p.materiales||[]):fn}));
  const setRecetas = fn => setData(p=>({...p, recetas: typeof fn==="function"?fn(p.recetas||[]):fn}));
  const setEmbarques = fn => setData(p=>({...p, embarques: typeof fn==="function"?fn(p.embarques||[]):fn}));
  const setLiquidaciones = fn => setData(p=>({...p, liquidaciones: typeof fn==="function"?fn(p.liquidaciones||[]):fn}));
  const setLiqCliente = fn => setData(p=>({...p, liqCliente: typeof fn==="function"?fn(p.liqCliente||[]):fn}));
  const setAnticipos = fn => setData(p=>({...p, anticipos: typeof fn==="function"?fn(p.anticipos||[]):fn}));
  const setCobranza = fn => setData(p=>({...p, cobranza: typeof fn==="function"?fn(p.cobranza||[]):fn}));
  const setEspeciesAllegria = fn => setData(p=>({...p, especiesAllegria: typeof fn==="function"?fn(p.especiesAllegria||ESPECIES_ALLEGRIA_INIT):fn}));
  const setVariedadesAllegria = fn => setData(p=>({...p, variedadesAllegria: typeof fn==="function"?fn(p.variedadesAllegria||[]):fn}));

  if(cargando) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",color:C.muted,fontFamily:"sans-serif"}}>Cargando Allegria Foods...</div>;

  // Sub-apps
  const SUBAPPS = [
    {id:"clientes",      label:"Clientes Importadores", desc:"Ficha importador, país destino, contacto, condiciones comerciales",          icon:"👥", color:"#b91c1c", stats:`${(data.clientes||[]).length} clientes`},
    {id:"productores",   label:"Productores & Contratos",desc:"Contrato, kg/var/semana, anticipos pactados, visitas agronómicas",          icon:"🌱", color:"#0f766e", stats:`${(data.productores||[]).length} productores`},
    {id:"programa",      label:"Programa Comercial",    desc:"Programa recepción, asignación productor→cliente por fruta/variedad",         icon:"📊", color:"#7c3aed", stats:`${(data.programaComercial||[]).length} programas`},
    {id:"recepcion",     label:"Recepción & Proceso",   desc:"Recepción bins en packing, QC recepción, proceso, resultado, informe",       icon:"🏭", color:"#dc2626", stats:`${(data.recepciones||[]).length} recepciones`},
    {id:"stock",         label:"Stock & Pallets",        desc:"Producto terminado, codificación pallets, inspección SAG, disponible",       icon:"📦", color:"#ea580c", stats:`${(data.stockPT||[]).length} pallets`},
    {id:"materiales",    label:"Materiales & Inventario",desc:"Maestro materiales, recetas embalaje, compras, consumo, stock actual",       icon:"🧱", color:"#854d0e", stats:`${(data.materiales||[]).length} materiales`},
    {id:"embarques",     label:"Embarques",              desc:"Carga, despacho, tracking, llegada, QC destino, siniestros, claims",         icon:"🚢", color:"#2563eb", stats:`${(data.embarques||[]).length} embarques`},
    {id:"liquidaciones", label:"Liquidaciones",          desc:"Liq. cliente → ajustes → liq. productor → anticipos → cobranza",            icon:"💰", color:"#16a34a", stats:`${(data.liquidaciones||[]).length + (data.liqCliente||[]).length} liquidaciones`},
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
          {subApp==="programa"&&<ProgramaComercialModule data={data.programaComercial||[]} setData={setProgramaComercial} productores={data.productores||[]} clientes={data.clientes||[]} can={can}/>}
          {subApp==="recepcion"&&<RecepcionProcesoModule data={data.recepciones||[]} setData={setRecepciones} productores={data.productores||[]} can={can}/>}
          {subApp==="stock"&&<StockPalletsModule data={data.stockPT||[]} setData={setStockPT} can={can}/>}
          {subApp==="materiales"&&<MaterialesInventarioModule data={data.materiales||[]} setData={setMateriales} recetas={data.recetas||[]} setRecetas={setRecetas} embarques={data.embarques||[]} can={can}/>}
          {subApp==="embarques"&&<EmbarquesModule data={data.embarques||[]} setData={setEmbarques} clientes={data.clientes||[]} productores={data.productores||[]} stockPT={data.stockPT||[]} setStockPT={setStockPT} can={can} temporada={tempSeleccionada}/>}
          {subApp==="liquidaciones"&&<div>
            <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
              <button onClick={()=>setLiqTab("cliente")} style={{padding:"8px 16px",borderRadius:8,border:liqTab==="cliente"?"2px solid #2563eb":"1px solid #e2e8f0",background:liqTab==="cliente"?"#2563eb":"#fff",color:liqTab==="cliente"?"#fff":"#1e293b",cursor:"pointer",fontSize:12,fontWeight:700}}>📥 Liq. Cliente</button>
              <button onClick={()=>setLiqTab("productor")} style={{padding:"8px 16px",borderRadius:8,border:liqTab==="productor"?"2px solid #16a34a":"1px solid #e2e8f0",background:liqTab==="productor"?"#16a34a":"#fff",color:liqTab==="productor"?"#fff":"#1e293b",cursor:"pointer",fontSize:12,fontWeight:700}}>💰 Liq. Productor</button>
              <button onClick={()=>setLiqTab("anticipos")} style={{padding:"8px 16px",borderRadius:8,border:liqTab==="anticipos"?"2px solid #d97706":"1px solid #e2e8f0",background:liqTab==="anticipos"?"#d97706":"#fff",color:liqTab==="anticipos"?"#fff":"#1e293b",cursor:"pointer",fontSize:12,fontWeight:700}}>💵 Anticipos</button>
              <button onClick={()=>setLiqTab("cobranza")} style={{padding:"8px 16px",borderRadius:8,border:liqTab==="cobranza"?"2px solid #7c3aed":"1px solid #e2e8f0",background:liqTab==="cobranza"?"#7c3aed":"#fff",color:liqTab==="cobranza"?"#fff":"#1e293b",cursor:"pointer",fontSize:12,fontWeight:700}}>📋 Cobranza</button>
            </div>
            <div style={{fontSize:10,color:"#94a3b8",marginBottom:12}}>Flujo: Liq. Cliente (primero) → Ajustes/Comparativas → Liq. Productor → Anticipos → Cobranza</div>
            {liqTab==="cliente"&&<LiquidacionClienteModule data={data.liqCliente||[]} setData={setLiqCliente} embarques={data.embarques||[]} can={can} temporada={tempSeleccionada}/>}
            {liqTab==="productor"&&<LiquidacionesModule data={data.liquidaciones||[]} setData={setLiquidaciones} embarques={data.embarques||[]} productores={data.productores||[]} can={can} temporada={tempSeleccionada}/>}
            {liqTab==="anticipos"&&<AnticiposModule data={data.anticipos||[]} setData={setAnticipos} clientes={data.clientes||[]} productores={data.productores||[]} can={can} temporada={tempSeleccionada}/>}
            {liqTab==="cobranza"&&<CobranzaModule data={data.cobranza||[]} setData={setCobranza} embarques={data.embarques||[]} liquidaciones={data.liquidaciones||[]} can={can} temporada={tempSeleccionada}/>}
          </div>}
          {subApp==="dashboard"&&<PlaceholderModule icon="📈" title="Dashboard Allegria Foods" desc="KPIs por temporada · Volumen por fruta/destino · Resumen financiero · Alertas"/>}
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
        <div style={{marginTop:8}}>
          <button onClick={()=>setShowMaestro(p=>!p)}
            style={{background:showMaestro?C.teal:"transparent",color:showMaestro?"#fff":C.muted,border:`1px solid ${showMaestro?C.teal:C.border}`,borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:11,fontWeight:700}}>
            🌳 Maestro Especies/Variedades
          </button>
        </div>
      </div>

      {showMaestro&&<MaestroAllegria especies={data.especiesAllegria||ESPECIES_ALLEGRIA_INIT} setEspecies={setEspeciesAllegria} variedades={data.variedadesAllegria||[]} setVariedades={setVariedadesAllegria} can={can}/>}

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
        <KPI label="🚢 Embarques" value={(data.embarques||[]).length} color={C.blue}/>
        <KPI label="📦 Pallets" value={(data.stockPT||[]).length} color={C.yellow}/>
        <KPI label="🏭 Recepciones" value={(data.recepciones||[]).length} color={C.accent}/>
        <KPI label="👥 Clientes" value={(data.clientes||[]).length} color={C.accent}/>
        <KPI label="🌱 Productores" value={(data.productores||[]).length} color={C.teal}/>
        <KPI label="💰 Liquidaciones" value={(data.liquidaciones||[]).length + (data.liqCliente||[]).length} color={C.green}/>
      </div>
    </div>
  );
}
