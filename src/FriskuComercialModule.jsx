/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// FriskuComercialModule.jsx — Módulo comercial Frisku Foods (Fase 2)
// Tabs: Dashboard · Clientes · Exportadoras · Contratos · Programa
//       · Embarques · Liquidaciones · Maestros (embed) · TC
// Persistencia: tabla calendario_data ids: frisku_clientes,
//   frisku_exportadoras, frisku_contratos, frisku_programa,
//   frisku_embarques, frisku_liquidaciones
// ═══════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import FriskuModule, {
  PAISES_DEFAULT, MERCADOS_DEFAULT, MONEDAS_DEFAULT,
  ESPECIES_DEFAULT, TIPOS_EMBALAJE_DEFAULT, CIUDADES_DEFAULT,
  TEMPORADAS_DEFAULT,
} from "./FriskuModule.jsx";
import {
  dbLoadGeneric, dbSaveGeneric,
  calcularComisionFrisku, resolverPorcentajesComision,
  formatearMonto,
} from "./friskuHelpers.js";

// ── Paleta Frisku — Slate neutro ──
const C = {
  bg:"#1e2533", bg2:"#263044", card:"#2d3a52", card2:"#334158", border:"#3d4f6e",
  text:"#e2e8f0", muted:"#94a3b8", muted2:"#5a6a80",
  blue:"#3b82f6", green:"#22c55e", yellow:"#f59e0b", accent:"#ef4444",
  teal:"#14b8a6", purple:"#a855f7",
};

const inputSt = {
  width:"100%", padding:"6px 10px", borderRadius:6, border:`1px solid ${C.border}`,
  background:C.card2, color:C.text, fontSize:12, boxSizing:"border-box", outline:"none"
};
const lblSt = { fontSize:10, color:C.muted, fontWeight:600, marginBottom:3, textTransform:"uppercase", letterSpacing:0.4 };
const btnSt = (color=C.blue, ghost=false) => ({
  padding:"6px 12px", borderRadius:6, border:ghost?`1px solid ${color}`:"none",
  background:ghost?"transparent":color, color:ghost?color:"#fff",
  fontWeight:600, fontSize:11, cursor:"pointer"
});

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

const TIPOS_DOC_CLIENTE = [
  "Packing List", "Certificado Fitosanitario", "Factura Exportación",
  "Invoice", "QC Destino", "Otro",
];
// Tipos que generan alerta si el cliente activo no los tiene cargados con URL
const TIPOS_DOC_MINIMOS = ["Packing List", "Certificado Fitosanitario", "Factura Exportación", "Invoice", "QC Destino"];

// ═══════════════════════════════════════════════════════════════════
// IMPORTADOR DE EXCEL — clientes_frisku.xlsx (155 entidades)
// Reparte filas a 4 categorías. Merge NO destructivo: conserva los
// campos Frisku de los registros existentes (comisiones, especies...).
// ═══════════════════════════════════════════════════════════════════

const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const claveCmp = (v) => norm(v).toUpperCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "");

function categoriaDestino(catRaw) {
  const c = claveCmp(catRaw);
  if(c === "EXPORTADORA")      return {destino:"exportadoras", subtipo:null};
  if(c === "CONSIGNEE")        return {destino:"consignatarios", subtipo:null};
  if(c === "CLIENTE")          return {destino:"clientes", subtipo:null};
  if(c === "NOTIFY")           return {destino:"notify", subtipo:"generico"};
  if(c === "NOTIFY MARITIMO")  return {destino:"notify", subtipo:"maritimo"};
  if(c === "NOTIFY AEREO")     return {destino:"notify", subtipo:"aereo"};
  return {destino:null, subtipo:null};
}

async function leerExcelEntidades(file) {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, {type:"array"});
  const hoja = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(hoja, {defval:""});
  return filas.map(f => {
    const o = {};
    for(const k in f) o[norm(k).toLowerCase()] = norm(f[k]);
    return o;
  });
}

function contactoDesdeExcel(row) {
  const nombre = row.nombre_representante || "";
  const email = row.email || "";
  const fono = row.fono || "";
  if(!nombre && !email && !fono) return null;
  return {nombre, email, fono, cargo:"", principal:true};
}

function procesarFilas(filasRaw) {
  const porDestino = {clientes:[], exportadoras:[], notify:[], consignatarios:[]};
  const errores = [];
  filasRaw.forEach((row, i) => {
    const fila = i + 2;
    const codigo = norm(row.codigo_entidad);
    const cat = norm(row.categoria);
    if(!codigo) { errores.push(`Fila ${fila}: sin codigo_entidad — omitida`); return; }
    const {destino, subtipo} = categoriaDestino(cat);
    if(!destino) { errores.push(`Fila ${fila}: categoría desconocida "${cat}" — omitida`); return; }
    porDestino[destino].push({
      codigoEntidad: codigo,
      razonSocial:   norm(row.razon_social),
      nombre:        norm(row.nombre) || norm(row.razon_social),
      rut:           norm(row.rut_entidad),
      rutRepresentante: norm(row.rut_representante),
      nombreRepresentante: norm(row.nombre_representante),
      email:         norm(row.email),
      fono:          norm(row.fono),
      pais:          norm(row.pais),
      provincia:     norm(row.provincia),
      comuna:        norm(row.comuna),
      ciudad:        norm(row.ciudad),
      direccion:     norm(row.direccion),
      subtipo,
    });
  });
  return {porDestino, errores};
}

function mergeClientes(existentes, entrantes) {
  const res = existentes.map(c => ({...c}));
  let creados = 0, actualizados = 0;
  const idxPorCodigo = {}, idxPorNombre = {};
  res.forEach((c, i) => {
    if(c.codigoEntidad) idxPorCodigo[claveCmp(c.codigoEntidad)] = i;
    if(c.nombre) idxPorNombre[claveCmp(c.nombre)] = i;
  });
  entrantes.forEach(e => {
    let i = idxPorCodigo[claveCmp(e.codigoEntidad)];
    if(i === undefined) i = idxPorNombre[claveCmp(e.nombre)];
    if(i !== undefined) {
      const prev = res[i];
      res[i] = {
        ...prev,
        codigoEntidad: e.codigoEntidad,
        nombre: e.nombre || prev.nombre,
        razonSocial: e.razonSocial || prev.razonSocial || "",
        rut: e.rut || prev.rut || "",
        paisCodigo: prev.paisCodigo || e.paisCodigo || "",
        pais: e.pais || prev.pais || "",
        ciudad: e.ciudad || prev.ciudad || "",
        direccion: e.direccion || prev.direccion || "",
        contactos: (prev.contactos && prev.contactos.length)
          ? prev.contactos
          : [contactoDesdeExcel(e)].filter(Boolean),
        fechaActualizacion: new Date().toISOString(),
      };
      actualizados++;
    } else {
      res.push({
        id: uid(),
        codigoEntidad: e.codigoEntidad,
        nombre: e.nombre,
        razonSocial: e.razonSocial,
        paisCodigo: e.paisCodigo || "",
        pais: e.pais,
        ciudad: e.ciudad,
        direccion: e.direccion,
        rut: e.rut,
        mercadoCodigo: "",
        monedaCodigo: "USD",
        contactos: [contactoDesdeExcel(e)].filter(Boolean),
        especiesCodigos: [],
        comisionGlobalSobreFOB: 8,
        comisionFriskuSobreClienteGlobal: 25,
        comisionOverrides: {},
        activo: true,
        observ: "",
        fechaCreacion: new Date().toISOString(),
        fechaActualizacion: new Date().toISOString(),
      });
      creados++;
    }
  });
  return {datos:res, creados, actualizados};
}

function mergeExportadoras(existentes, entrantes) {
  const res = existentes.map(x => ({...x}));
  let creados = 0, actualizados = 0;
  const idxPorCodigo = {}, idxPorNombre = {};
  res.forEach((x, i) => {
    if(x.codigoEntidad) idxPorCodigo[claveCmp(x.codigoEntidad)] = i;
    if(x.nombre) idxPorNombre[claveCmp(x.nombre)] = i;
  });
  entrantes.forEach(e => {
    let i = idxPorCodigo[claveCmp(e.codigoEntidad)];
    if(i === undefined) i = idxPorNombre[claveCmp(e.nombre)];
    if(i !== undefined) {
      const prev = res[i];
      res[i] = {
        ...prev,
        codigoEntidad: e.codigoEntidad,
        nombre: e.nombre || prev.nombre,
        razonSocial: e.razonSocial || prev.razonSocial || "",
        rut: e.rut || prev.rut || "",
        paisCodigo: prev.paisCodigo || e.paisCodigo || "",
        pais: e.pais || prev.pais || "",
        ciudad: e.ciudad || prev.ciudad || "",
        direccion: e.direccion || prev.direccion || "",
        contactos: (prev.contactos && prev.contactos.length)
          ? prev.contactos
          : [contactoDesdeExcel(e)].filter(Boolean),
        fechaActualizacion: new Date().toISOString(),
      };
      actualizados++;
    } else {
      res.push({
        id: uid(),
        codigoEntidad: e.codigoEntidad,
        nombre: e.nombre,
        razonSocial: e.razonSocial,
        rut: e.rut,
        paisCodigo: e.paisCodigo || "",
        pais: e.pais,
        ciudad: e.ciudad,
        direccion: e.direccion,
        monedaCodigo: "USD",
        contactos: [contactoDesdeExcel(e)].filter(Boolean),
        especiesProduce: [],
        certificaciones: "",
        activo: true,
        observ: "",
        fechaCreacion: new Date().toISOString(),
        fechaActualizacion: new Date().toISOString(),
      });
      creados++;
    }
  });
  return {datos:res, creados, actualizados};
}

function mergeSimple(existentes, entrantes) {
  const res = existentes.map(x => ({...x}));
  let creados = 0, actualizados = 0;
  const idxPorCodigo = {};
  res.forEach((x, i) => { if(x.codigo) idxPorCodigo[claveCmp(x.codigo)] = i; });
  entrantes.forEach(e => {
    const reg = {
      codigo: e.codigoEntidad,
      razonSocial: e.razonSocial,
      nombre: e.nombre,
      rut: e.rut,
      email: e.email,
      fono: e.fono,
      nombreContacto: e.nombreRepresentante,
      paisCodigo: e.paisCodigo || "",
      pais: e.pais,
      ciudad: e.ciudad,
      direccion: e.direccion,
      observ: "",
    };
    if(e.subtipo) reg.subtipo = e.subtipo;
    const i = idxPorCodigo[claveCmp(e.codigoEntidad)];
    if(i !== undefined) {
      res[i] = {...res[i], ...reg};
      actualizados++;
    } else {
      res.push(reg);
      idxPorCodigo[claveCmp(e.codigoEntidad)] = res.length - 1;
      creados++;
    }
  });
  return {datos:res, creados, actualizados};
}


function Card({children, title, icon, action}) {
  return (
    <div style={{background:C.card, borderRadius:14, padding:18, border:`1px solid ${C.border}`}}>
      {title && (
        <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:14, borderBottom:`1px solid ${C.border}`, paddingBottom:10}}>
          {icon && <span style={{fontSize:18}}>{icon}</span>}
          <h3 style={{margin:0, color:C.text, fontSize:14, fontWeight:700, flex:1}}>{title}</h3>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

// Sección colapsable usada por ClienteForm y ExportadoraForm.
// IMPORTANTE: este componente debe declararse FUERA de los Forms
// para que React no lo recree en cada keystroke y los inputs no
// pierdan el foco. (Sí, eso pasó. Sí, fue mi error la primera vez.)
function Seccion({id, titulo, icono, abierta, onToggle, children}) {
  return (
    <div style={{marginBottom:10, border:`1px solid ${C.border}`, borderRadius:8, overflow:"hidden"}}>
      <button onClick={onToggle}
        style={{width:"100%", padding:"10px 14px", background:abierta?C.card2:C.card, border:"none",
          color:C.text, textAlign:"left", cursor:"pointer", display:"flex", alignItems:"center",
          gap:8, fontSize:12, fontWeight:700}}>
        <span>{icono}</span>
        <span style={{flex:1}}>{titulo}</span>
        <span style={{color:C.muted, fontSize:10}}>{abierta?"▼":"▶"}</span>
      </button>
      {abierta && <div style={{padding:14, background:C.card2}}>{children}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CLIENTE FORM — editor expandible con secciones
// ═══════════════════════════════════════════════════════════════════
function ClienteForm({cliente, especies, paises, ciudades, monedas, mercados, tiposEmbalaje, onGuardar, onCancelar}) {
  const [buf, setBuf] = useState(()=>JSON.parse(JSON.stringify(cliente)));
  const [seccionAbierta, setSeccionAbierta] = useState("basico");

  // Ciudades del maestro filtradas por el país seleccionado.
  // Si no hay país elegido aún, sugiere todas.
  const ciudadesSugeridas = useMemo(()=>{
    if(!Array.isArray(ciudades) || !ciudades.length) return [];
    if(!buf.paisCodigo) return ciudades;
    return ciudades.filter(c => c.paisCodigo === buf.paisCodigo);
  },[ciudades, buf.paisCodigo]);

  const setCampo = (k, v) => setBuf(prev => ({...prev, [k]:v}));
  const toggleEspecie = (codigo) => {
    setBuf(prev => {
      const arr = prev.especiesCodigos || [];
      return {...prev, especiesCodigos: arr.includes(codigo) ? arr.filter(c=>c!==codigo) : [...arr, codigo]};
    });
  };

  const setContacto = (idx, k, v) => {
    setBuf(prev => {
      const list = [...(prev.contactos||[])];
      list[idx] = {...list[idx], [k]:v};
      return {...prev, contactos:list};
    });
  };
  const addContacto = () => setBuf(prev => ({...prev, contactos:[...(prev.contactos||[]), {nombre:"", cargo:"", email:"", telefono:""}]}));
  const delContacto = (idx) => setBuf(prev => ({...prev, contactos:(prev.contactos||[]).filter((_,i)=>i!==idx)}));

  const setOverride = (clave, sub, valor) => {
    setBuf(prev => {
      const ov = {...(prev.comisionOverrides||{})};
      ov[clave] = {...(ov[clave]||{}), [sub]: valor === "" ? null : Number(valor)};
      // Si ambos campos son null, eliminar la clave
      if(ov[clave].cliente == null && ov[clave].frisku == null) delete ov[clave];
      return {...prev, comisionOverrides:ov};
    });
  };
  const delOverride = (clave) => {
    setBuf(prev => {
      const ov = {...(prev.comisionOverrides||{})};
      delete ov[clave];
      return {...prev, comisionOverrides:ov};
    });
  };

  const addDoc = () => setBuf(prev => ({...prev, documentos:[...(prev.documentos||[]), {id:uid(), tipo:"", nombre:"", url:"", fecha:"", vencimiento:"", observ:""}]}));
  const setDoc = (idx, k, v) => setBuf(prev => { const list=[...(prev.documentos||[])]; list[idx]={...list[idx],[k]:v}; return {...prev, documentos:list}; });
  const delDoc = (idx) => setBuf(prev => ({...prev, documentos:(prev.documentos||[]).filter((_,i)=>i!==idx)}));

  const handleGuardar = () => {
    if(!buf.nombre?.trim()) { alert("Nombre es requerido"); return; }
    onGuardar({...buf, fechaActualizacion: new Date().toISOString()});
  };

  const toggle = (id) => setSeccionAbierta(prev => prev === id ? "" : id);

  const especiesActivas = (buf.especiesCodigos||[]);
  const overrides = buf.comisionOverrides || {};
  const especiesParaOverride = especies.filter(e => especiesActivas.includes(e.codigo));
  const hoyDoc = new Date().toISOString().slice(0,10);
  const docsFaltantes = TIPOS_DOC_MINIMOS.filter(t => !(buf.documentos||[]).some(d=>d.tipo===t&&d.url));

  return (
    <div style={{background:`${C.blue}11`, padding:16, borderRadius:8, border:`1px solid ${C.blue}44`, marginBottom:14}}>
      <h3 style={{margin:"0 0 14px", color:C.blue, fontSize:14, display:"flex", alignItems:"center", gap:8}}>
        <span>{cliente.id ? "✎" : "+"}</span>
        <span>{cliente.id ? `Editando: ${buf.nombre || "(sin nombre)"}` : "Nuevo cliente"}</span>
      </h3>

      <Seccion id="basico" titulo="Datos básicos" icono="🏢" abierta={seccionAbierta==="basico"} onToggle={()=>toggle("basico")}>
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap:10}}>
          <div>
            <div style={lblSt}>Nombre *</div>
            <input value={buf.nombre||""} onChange={e=>setCampo("nombre", e.target.value)} placeholder="Disney, Driscoll's..." style={inputSt}/>
          </div>
          <div>
            <div style={lblSt}>País</div>
            <select value={buf.paisCodigo||""} onChange={e=>setCampo("paisCodigo", e.target.value)} style={inputSt}>
              <option value="">— seleccionar —</option>
              {paises.map(p => <option key={p.codigo} value={p.codigo}>{p.flag} {p.nombreEs}</option>)}
            </select>
          </div>
          <div>
            <div style={lblSt}>Ciudad</div>
            <input
              value={buf.ciudad||""}
              onChange={e=>setCampo("ciudad", e.target.value)}
              list="ciudades-cliente-list"
              placeholder={buf.paisCodigo ? "Empezá a tipear o elegí…" : "Selecciona país primero o tipea libre"}
              style={inputSt}
              autoComplete="off"
            />
            <datalist id="ciudades-cliente-list">
              {ciudadesSugeridas.map(c => (
                <option key={c.codigo} value={c.nombre}>{c.paisCodigo}</option>
              ))}
            </datalist>
          </div>
          <div>
            <div style={lblSt}>Mercado</div>
            <select value={buf.mercadoCodigo||""} onChange={e=>setCampo("mercadoCodigo", e.target.value)} style={inputSt}>
              <option value="">— seleccionar —</option>
              {mercados.map(m => <option key={m.codigo} value={m.codigo}>{m.nombre}</option>)}
            </select>
          </div>
          <div>
            <div style={lblSt}>Moneda principal</div>
            <select value={buf.monedaCodigo||"USD"} onChange={e=>setCampo("monedaCodigo", e.target.value)} style={inputSt}>
              {monedas.map(m => <option key={m.codigo} value={m.codigo}>{m.simbolo} {m.codigo} — {m.nombre}</option>)}
            </select>
          </div>
          <div>
            <div style={lblSt}>Estado</div>
            <select value={buf.activo===false?"no":"si"} onChange={e=>setCampo("activo", e.target.value==="si")} style={inputSt}>
              <option value="si">● Activo</option>
              <option value="no">○ Inactivo</option>
            </select>
          </div>
        </div>
        <div style={{marginTop:10}}>
          <div style={lblSt}>Observaciones</div>
          <textarea value={buf.observ||""} onChange={e=>setCampo("observ", e.target.value)}
            rows={2} style={{...inputSt, resize:"vertical", fontFamily:"inherit"}}/>
        </div>
      </Seccion>

      <Seccion id="contactos" titulo={`Contactos (${(buf.contactos||[]).length})`} icono="👥" abierta={seccionAbierta==="contactos"} onToggle={()=>toggle("contactos")}>
        {(buf.contactos||[]).map((co, i) => (
          <div key={i} style={{display:"grid", gridTemplateColumns:"1.2fr 1fr 1.5fr 1fr 36px", gap:8, marginBottom:8}}>
            <input value={co.nombre||""} onChange={e=>setContacto(i,"nombre",e.target.value)} placeholder="Nombre" style={inputSt}/>
            <input value={co.cargo||""} onChange={e=>setContacto(i,"cargo",e.target.value)} placeholder="Cargo" style={inputSt}/>
            <input value={co.email||""} onChange={e=>setContacto(i,"email",e.target.value)} placeholder="email@x.com" type="email" style={inputSt}/>
            <input value={co.telefono||""} onChange={e=>setContacto(i,"telefono",e.target.value)} placeholder="Teléfono" style={inputSt}/>
            <button onClick={()=>delContacto(i)} style={{...btnSt(C.accent, true), padding:"4px 8px"}}>×</button>
          </div>
        ))}
        <button onClick={addContacto} style={btnSt(C.green, true)}>+ Agregar contacto</button>
      </Seccion>

      <Seccion id="especies" titulo={`Especies que compra (${especiesActivas.length}/${especies.length})`} icono="🍒" abierta={seccionAbierta==="especies"} onToggle={()=>toggle("especies")}>
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(150px, 1fr))", gap:6}}>
          {especies.map(e => {
            const activa = especiesActivas.includes(e.codigo);
            return (
              <label key={e.codigo} style={{
                display:"flex", alignItems:"center", gap:6, padding:"6px 10px",
                background: activa ? `${C.green}22` : C.card,
                border:`1px solid ${activa?C.green:C.border}`,
                borderRadius:6, cursor:"pointer", fontSize:11,
              }}>
                <input type="checkbox" checked={activa} onChange={()=>toggleEspecie(e.codigo)}/>
                <span style={{fontSize:14}}>{e.icono}</span>
                <span style={{color:C.text}}>{e.nombreEs}</span>
              </label>
            );
          })}
        </div>
        {especies.length === 0 && (
          <div style={{padding:14, color:C.muted, fontSize:11}}>
            Sin especies en el maestro. Ve a Maestros → Especies para cargarlas.
          </div>
        )}
      </Seccion>

      <Seccion id="comisiones" titulo="Comisión Frisku" icono="💰" abierta={seccionAbierta==="comisiones"} onToggle={()=>toggle("comisiones")}>
        <div style={{background:C.card, padding:12, borderRadius:6, marginBottom:12, fontSize:11, color:C.muted, lineHeight:1.5}}>
          <strong style={{color:C.text}}>Modelo:</strong> el cliente cobra <em>X% sobre la base neta en destino</em> (venta en destino − gastos en destino).
          Frisku recibe <em>Y%</em> de esa comisión.<br/>
          <span style={{color:C.yellow}}>Ejemplo Disney: cliente 8% × Frisku 25% = Frisku se queda con 2% de la base neta.</span>
        </div>

        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:14}}>
          <div>
            <div style={lblSt}>% Cliente s/ base neta destino</div>
            <div style={{position:"relative"}}>
              <input type="number" step="0.01" value={buf.comisionGlobalSobreFOB ?? ""}
                onChange={e=>setCampo("comisionGlobalSobreFOB", e.target.value === "" ? null : Number(e.target.value))}
                placeholder="8.0" style={inputSt}/>
            </div>
          </div>
          <div>
            <div style={lblSt}>% Frisku sobre comisión cliente</div>
            <input type="number" step="0.01" value={buf.comisionFriskuSobreClienteGlobal ?? ""}
              onChange={e=>setCampo("comisionFriskuSobreClienteGlobal", e.target.value === "" ? null : Number(e.target.value))}
              placeholder="25.0" style={inputSt}/>
          </div>
          <div>
            <div style={lblSt}>% Frisku efectivo s/ base neta</div>
            <div style={{...inputSt, background:C.bg2, color:C.green, fontFamily:"monospace", fontWeight:700, display:"flex", alignItems:"center"}}>
              {(((Number(buf.comisionGlobalSobreFOB)||0) * (Number(buf.comisionFriskuSobreClienteGlobal)||0)) / 100).toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Overrides por especie y especie+formato */}
        {especiesParaOverride.length > 0 && (
          <div style={{marginTop:14, paddingTop:14, borderTop:`1px solid ${C.border}`}}>
            <div style={{fontSize:11, color:C.muted, marginBottom:10}}>
              <strong style={{color:C.text}}>Overrides</strong> — define % diferente para una especie o especie+formato.
              Si está vacío, se usa el global de arriba.
            </div>
            {especiesParaOverride.map(esp => {
              const formatos = (tiposEmbalaje||[]).filter(t =>
                t.especieCodigo === esp.codigo || t.especie === esp.nombreEs
              );
              const claveEsp = esp.codigo;
              const ovEsp = overrides[claveEsp];
              return (
                <div key={esp.codigo} style={{marginBottom:10, background:C.card, padding:10, borderRadius:6, border:`1px solid ${C.border}`}}>
                  <div style={{display:"grid", gridTemplateColumns:"170px 1fr 1fr 90px 36px", gap:8, alignItems:"center", marginBottom:formatos.length?8:0}}>
                    <div style={{color:C.text, fontWeight:600, fontSize:12}}>
                      {esp.icono} {esp.nombreEs}
                    </div>
                    <div>
                      <input type="number" step="0.01" value={ovEsp?.cliente ?? ""}
                        onChange={e=>setOverride(claveEsp, "cliente", e.target.value)}
                        placeholder="(global)" style={inputSt}/>
                      <div style={{fontSize:9, color:C.muted, marginTop:2}}>% cliente</div>
                    </div>
                    <div>
                      <input type="number" step="0.01" value={ovEsp?.frisku ?? ""}
                        onChange={e=>setOverride(claveEsp, "frisku", e.target.value)}
                        placeholder="(global)" style={inputSt}/>
                      <div style={{fontSize:9, color:C.muted, marginTop:2}}>% frisku</div>
                    </div>
                    <div style={{fontSize:10, color:C.green, textAlign:"right", fontFamily:"monospace", fontWeight:700}}>
                      {ovEsp ? `${((Number(ovEsp.cliente||0)*Number(ovEsp.frisku||0))/100).toFixed(2)}%` : "—"}
                    </div>
                    <button onClick={()=>delOverride(claveEsp)} style={{...btnSt(C.muted, true), padding:"4px 8px"}} title="Limpiar override">×</button>
                  </div>
                  {/* Overrides por formato (solo si hay formatos para esta especie) */}
                  {formatos.length > 0 && (
                    <div style={{marginLeft:14, paddingLeft:14, borderLeft:`2px solid ${C.border}`}}>
                      {formatos.map(fmt => {
                        const clave = `${esp.codigo}::${fmt.codigo}`;
                        const ov = overrides[clave];
                        return (
                          <div key={fmt.codigo} style={{display:"grid", gridTemplateColumns:"170px 1fr 1fr 90px 36px", gap:8, alignItems:"center", marginTop:6}}>
                            <div style={{color:C.muted, fontSize:10}}>
                              ↳ {fmt.nombre} <span style={{color:C.muted2}}>({fmt.codigo})</span>
                            </div>
                            <div>
                              <input type="number" step="0.01" value={ov?.cliente ?? ""}
                                onChange={e=>setOverride(clave, "cliente", e.target.value)}
                                placeholder={ovEsp?.cliente != null ? `(${ovEsp.cliente})` : "(global)"} style={inputSt}/>
                            </div>
                            <div>
                              <input type="number" step="0.01" value={ov?.frisku ?? ""}
                                onChange={e=>setOverride(clave, "frisku", e.target.value)}
                                placeholder={ovEsp?.frisku != null ? `(${ovEsp.frisku})` : "(global)"} style={inputSt}/>
                            </div>
                            <div style={{fontSize:10, color:C.green, textAlign:"right", fontFamily:"monospace", fontWeight:700}}>
                              {ov ? `${((Number(ov.cliente||0)*Number(ov.frisku||0))/100).toFixed(2)}%` : "—"}
                            </div>
                            <button onClick={()=>delOverride(clave)} style={{...btnSt(C.muted, true), padding:"4px 8px"}}>×</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {especiesActivas.length === 0 && (
          <div style={{padding:14, color:C.muted, fontSize:11, fontStyle:"italic"}}>
            Selecciona especies en la sección anterior para definir overrides específicos.
          </div>
        )}
      </Seccion>

      <Seccion id="documentos" titulo={`Documentos (${(buf.documentos||[]).length})`} icono="📁" abierta={seccionAbierta==="documentos"} onToggle={()=>toggle("documentos")}>
        {docsFaltantes.length > 0 && (
          <div style={{background:`${C.accent}11`, border:`1px solid ${C.accent}44`, borderRadius:6, padding:"8px 12px", marginBottom:10, fontSize:11, color:C.accent}}>
            Obligatorios faltantes: {docsFaltantes.join(" · ")}
          </div>
        )}
        {(buf.documentos||[]).map((doc, i) => {
          const vencDoc = doc.vencimiento && doc.vencimiento < hoyDoc;
          return (
            <div key={doc.id||i} style={{background:C.card, padding:10, borderRadius:6, marginBottom:8, border:`1px solid ${vencDoc ? C.accent : C.border}`}}>
              <div style={{display:"grid", gridTemplateColumns:"160px 1fr", gap:8, marginBottom:6}}>
                <div>
                  <div style={lblSt}>Tipo</div>
                  <input value={doc.tipo||""} onChange={e=>setDoc(i,"tipo",e.target.value)}
                    list="tipos-doc-list" placeholder="Tipo de documento" style={inputSt} autoComplete="off"/>
                </div>
                <div>
                  <div style={lblSt}>Nombre / descripción</div>
                  <input value={doc.nombre||""} onChange={e=>setDoc(i,"nombre",e.target.value)}
                    placeholder="Contrato Marco 2026-2027" style={inputSt}/>
                </div>
              </div>
              <div style={{display:"grid", gridTemplateColumns:"1fr 130px 130px 36px", gap:8, alignItems:"flex-end"}}>
                <div>
                  <div style={lblSt}>URL / Link</div>
                  <div style={{display:"flex", gap:4}}>
                    <input value={doc.url||""} onChange={e=>setDoc(i,"url",e.target.value)}
                      placeholder="https://drive.google.com/..." style={{...inputSt, flex:1}}/>
                    {doc.url && <button onClick={()=>window.open(doc.url,"_blank")} style={{...btnSt(C.blue,true), padding:"6px 8px", flexShrink:0}} title="Abrir link">↗</button>}
                  </div>
                </div>
                <div>
                  <div style={lblSt}>Fecha doc.</div>
                  <input type="date" value={doc.fecha||""} onChange={e=>setDoc(i,"fecha",e.target.value)} style={inputSt}/>
                </div>
                <div>
                  <div style={lblSt}>Vencimiento{vencDoc ? " ⚠" : ""}</div>
                  <input type="date" value={doc.vencimiento||""} onChange={e=>setDoc(i,"vencimiento",e.target.value)}
                    style={{...inputSt, borderColor: vencDoc ? C.accent : C.border}}/>
                </div>
                <button onClick={()=>delDoc(i)} style={{...btnSt(C.accent,true), padding:"6px 8px", marginTop:14}}>×</button>
              </div>
            </div>
          );
        })}
        <datalist id="tipos-doc-list">
          {TIPOS_DOC_CLIENTE.map(t=><option key={t} value={t}/>)}
        </datalist>
        <button onClick={addDoc} style={btnSt(C.blue,true)}>+ Agregar documento</button>
      </Seccion>

      <div style={{display:"flex", gap:8, justifyContent:"flex-end", marginTop:14}}>
        <button onClick={onCancelar} style={btnSt(C.muted, true)}>Cancelar</button>
        <button onClick={handleGuardar} style={btnSt(C.green)}>✓ Guardar cliente</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CLIENTE CARD — vista compacta
// ═══════════════════════════════════════════════════════════════════
function ClienteCard({cliente, especies, paises, monedas, mercados, onEditar, onEliminar, canEdit}) {
  const pais = paises.find(p => p.codigo === cliente.paisCodigo);
  const mercado = mercados.find(m => m.codigo === cliente.mercadoCodigo);
  const monedaSimb = monedas.find(m => m.codigo === cliente.monedaCodigo)?.simbolo || cliente.monedaCodigo;

  const especiesNombres = (cliente.especiesCodigos||[])
    .map(c => especies.find(e=>e.codigo===c))
    .filter(Boolean);

  const friSobreBaseNeta = (Number(cliente.comisionGlobalSobreFOB)||0) * (Number(cliente.comisionFriskuSobreClienteGlobal)||0) / 100;
  const numOverrides = Object.keys(cliente.comisionOverrides||{}).length;
  const hoyCard = new Date().toISOString().slice(0,10);
  const docsFaltantesCard = TIPOS_DOC_MINIMOS.filter(t => !(cliente.documentos||[]).some(d=>d.tipo===t&&d.url));
  const docsVencidosCard = (cliente.documentos||[]).filter(d => d.vencimiento && d.vencimiento < hoyCard).length;
  const tieneAlertaDocs = (docsFaltantesCard.length > 0 || docsVencidosCard > 0) && cliente.activo !== false;

  return (
    <div style={{
      background:C.card2, padding:14, borderRadius:10,
      border:`1px solid ${tieneAlertaDocs ? C.accent+"66" : cliente.activo===false ? C.border : C.green+"66"}`,
      opacity: cliente.activo===false ? 0.65 : 1,
    }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, marginBottom:10}}>
        <div style={{flex:1}}>
          <div style={{fontSize:14, fontWeight:700, color:C.text, display:"flex", alignItems:"center", gap:8}}>
            {cliente.activo===false && <span style={{fontSize:9, padding:"2px 6px", borderRadius:4, background:C.border, color:C.muted}}>INACTIVO</span>}
            {cliente.nombre}
          </div>
          <div style={{fontSize:11, color:C.muted, marginTop:3, display:"flex", gap:8, flexWrap:"wrap"}}>
            {pais && <span>{pais.flag} {cliente.ciudad ? `${cliente.ciudad}, ` : ""}{pais.nombreEs}</span>}
            {mercado && <span>· 🎯 {mercado.nombre}</span>}
            <span>· 💱 {monedaSimb}</span>
          </div>
          {tieneAlertaDocs && (
            <div style={{marginTop:4, display:"flex", gap:4, flexWrap:"wrap"}}>
              {docsFaltantesCard.length > 0 && (
                <span style={{fontSize:9, padding:"2px 8px", borderRadius:4, background:`${C.accent}22`, color:C.accent, border:`1px solid ${C.accent}44`}}>
                  {docsFaltantesCard.length} doc{docsFaltantesCard.length>1?"s":""} obligatorio{docsFaltantesCard.length>1?"s":""} faltante{docsFaltantesCard.length>1?"s":""}
                </span>
              )}
              {docsVencidosCard > 0 && (
                <span style={{fontSize:9, padding:"2px 8px", borderRadius:4, background:`${C.yellow}22`, color:C.yellow, border:`1px solid ${C.yellow}44`}}>
                  {docsVencidosCard} doc{docsVencidosCard>1?"s":""} vencido{docsVencidosCard>1?"s":""}
                </span>
              )}
            </div>
          )}
        </div>
        {canEdit && (
          <div style={{display:"flex", gap:6}}>
            <button onClick={onEditar} style={{...btnSt(C.blue, true), padding:"4px 10px"}}>✎ Editar</button>
            <button onClick={onEliminar} style={{...btnSt(C.accent, true), padding:"4px 10px"}}>×</button>
          </div>
        )}
      </div>

      {especiesNombres.length > 0 && (
        <div style={{display:"flex", flexWrap:"wrap", gap:4, marginBottom:10}}>
          {especiesNombres.map(e => (
            <span key={e.codigo} style={{
              padding:"2px 8px", borderRadius:4, fontSize:10,
              background:`${C.teal}22`, color:C.teal, border:`1px solid ${C.teal}44`
            }}>{e.icono} {e.nombreEs}</span>
          ))}
        </div>
      )}

      <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:8, padding:"10px 0", borderTop:`1px solid ${C.border}`, fontSize:11}}>
        <div>
          <div style={{color:C.muted, fontSize:9, textTransform:"uppercase"}}>Cliente s/base neta</div>
          <div style={{color:C.text, fontWeight:700, fontFamily:"monospace"}}>{(cliente.comisionGlobalSobreFOB??0).toFixed(2)}%</div>
        </div>
        <div>
          <div style={{color:C.muted, fontSize:9, textTransform:"uppercase"}}>Frisku s/cliente</div>
          <div style={{color:C.text, fontWeight:700, fontFamily:"monospace"}}>{(cliente.comisionFriskuSobreClienteGlobal??0).toFixed(2)}%</div>
        </div>
        <div>
          <div style={{color:C.muted, fontSize:9, textTransform:"uppercase"}}>Frisku s/base neta</div>
          <div style={{color:C.green, fontWeight:700, fontFamily:"monospace"}}>
            {friSobreBaseNeta.toFixed(2)}%
            {numOverrides > 0 && <span style={{color:C.yellow, fontSize:9, marginLeft:4}}>(+{numOverrides} override{numOverrides>1?"s":""})</span>}
          </div>
        </div>
      </div>

      {cliente.observ && (
        <div style={{marginTop:8, paddingTop:8, borderTop:`1px solid ${C.border}`, fontSize:11, color:C.muted, fontStyle:"italic"}}>
          {cliente.observ}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DOCUMENTOS TAB — vista agregada de todos los docs de todos los clientes
// ═══════════════════════════════════════════════════════════════════
function DocumentosTab({clientes}) {
  const [filtroCli,    setFiltroCli]    = useState("");
  const [filtroTipo,   setFiltroTipo]   = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const hoy = new Date().toISOString().slice(0,10);
  const en30 = new Date(Date.now()+30*24*3600*1000).toISOString().slice(0,10);

  const clientesFaltantes = useMemo(()=>
    clientes.filter(c => c.activo !== false &&
      TIPOS_DOC_MINIMOS.some(t => !(c.documentos||[]).some(d=>d.tipo===t&&d.url)))
  ,[clientes]);

  const todos = useMemo(()=>{
    const rows = [];
    clientes.forEach(c => {
      (c.documentos||[]).forEach(d => {
        rows.push({...d, clienteId:c.id, clienteNombre:c.nombre});
      });
    });
    return rows.sort((a,b)=>{
      const aV = a.vencimiento && a.vencimiento < hoy;
      const bV = b.vencimiento && b.vencimiento < hoy;
      if(aV && !bV) return -1;
      if(!aV && bV) return 1;
      return (b.fecha||"").localeCompare(a.fecha||"");
    });
  },[clientes, hoy]);

  const filtrados = useMemo(()=>todos.filter(d=>{
    if(filtroCli && d.clienteId !== filtroCli) return false;
    if(filtroTipo && d.tipo !== filtroTipo) return false;
    if(filtroEstado==="vencidos" && !(d.vencimiento && d.vencimiento < hoy)) return false;
    if(filtroEstado==="vigentes" && d.vencimiento && d.vencimiento < hoy) return false;
    return true;
  }),[todos, filtroCli, filtroTipo, filtroEstado, hoy]);

  const tiposExistentes = [...new Set(todos.map(d=>d.tipo).filter(Boolean))].sort();

  return (
    <div>
      {/* Alerta clientes con docs obligatorios faltantes */}
      {clientesFaltantes.length > 0 && (
        <div style={{background:`${C.accent}11`, border:`1px solid ${C.accent}44`, borderRadius:10, padding:14, marginBottom:16}}>
          <div style={{fontWeight:700, color:C.accent, marginBottom:8, fontSize:12}}>
            Documentos obligatorios faltantes — {clientesFaltantes.length} cliente{clientesFaltantes.length>1?"s":""}
          </div>
          <div style={{display:"flex", flexWrap:"wrap", gap:8}}>
            {clientesFaltantes.map(c => {
              const falt = TIPOS_DOC_MINIMOS.filter(t => !(c.documentos||[]).some(d=>d.tipo===t&&d.url));
              return (
                <div key={c.id} style={{background:C.card, padding:"6px 12px", borderRadius:6, fontSize:11}}>
                  <strong style={{color:C.text}}>{c.nombre}</strong>
                  <span style={{color:C.muted, marginLeft:6}}>falta: {falt.join(", ")}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div style={{display:"flex", gap:10, marginBottom:14, flexWrap:"wrap", alignItems:"center"}}>
        <select value={filtroCli} onChange={e=>setFiltroCli(e.target.value)} style={{...inputSt, maxWidth:220}}>
          <option value="">— Todos los clientes —</option>
          {clientes.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)} style={{...inputSt, maxWidth:200}}>
          <option value="">— Todos los tipos —</option>
          {tiposExistentes.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filtroEstado} onChange={e=>setFiltroEstado(e.target.value)} style={{...inputSt, maxWidth:180}}>
          <option value="todos">Todos</option>
          <option value="vencidos">Vencidos</option>
          <option value="vigentes">Vigentes / sin venc.</option>
        </select>
        <span style={{fontSize:11, color:C.muted}}>{filtrados.length} documento{filtrados.length!==1?"s":""}</span>
      </div>

      {/* Tabla */}
      {filtrados.length === 0 ? (
        <div style={{padding:50, textAlign:"center", color:C.muted, fontSize:13, background:C.card, borderRadius:14}}>
          {todos.length === 0
            ? "Sin documentos cargados. Abre un cliente, sección Documentos, y agrega links."
            : "Sin resultados con esos filtros."}
        </div>
      ) : (
        <div style={{background:C.card, borderRadius:14, border:`1px solid ${C.border}`, overflow:"hidden"}}>
          <table style={{width:"100%", borderCollapse:"collapse", fontSize:12}}>
            <thead>
              <tr style={{background:C.card2, borderBottom:`1px solid ${C.border}`}}>
                {["Cliente","Tipo","Nombre","Fecha","Vencimiento","Link"].map(h=>(
                  <th key={h} style={{padding:"10px 14px", textAlign:"left", color:C.muted, fontWeight:600, fontSize:10, textTransform:"uppercase"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((d,i)=>{
                const vencido  = d.vencimiento && d.vencimiento < hoy;
                const porVenc  = d.vencimiento && !vencido && d.vencimiento <= en30;
                return (
                  <tr key={d.id||i} style={{borderBottom:`1px solid ${C.border}`, background: vencido ? `${C.accent}09` : "transparent"}}>
                    <td style={{padding:"10px 14px", color:C.text, fontWeight:600}}>{d.clienteNombre}</td>
                    <td style={{padding:"10px 14px"}}>
                      <span style={{
                        padding:"2px 8px", borderRadius:4, fontSize:10,
                        background: TIPOS_DOC_MINIMOS.includes(d.tipo) ? `${C.blue}22` : C.border,
                        color: TIPOS_DOC_MINIMOS.includes(d.tipo) ? C.blue : C.muted,
                        border: TIPOS_DOC_MINIMOS.includes(d.tipo) ? `1px solid ${C.blue}44` : "none",
                      }}>{d.tipo||"—"}</span>
                    </td>
                    <td style={{padding:"10px 14px", color:C.text}}>{d.nombre||"—"}</td>
                    <td style={{padding:"10px 14px", color:C.muted, fontFamily:"monospace", fontSize:11}}>{d.fecha||"—"}</td>
                    <td style={{padding:"10px 14px", fontFamily:"monospace", fontSize:11}}>
                      {d.vencimiento ? (
                        <span style={{color: vencido ? C.accent : porVenc ? C.yellow : C.green, fontWeight: vencido||porVenc ? 700 : 400}}>
                          {d.vencimiento}
                          {vencido  && <span style={{marginLeft:4, fontSize:9}}>VENCIDO</span>}
                          {porVenc  && <span style={{marginLeft:4, fontSize:9}}>⚠ pronto</span>}
                        </span>
                      ) : <span style={{color:C.muted2}}>—</span>}
                    </td>
                    <td style={{padding:"10px 14px"}}>
                      {d.url
                        ? <button onClick={()=>window.open(d.url,"_blank")} style={{...btnSt(C.blue,true), padding:"4px 10px", fontSize:10}}>Abrir ↗</button>
                        : <span style={{color:C.muted2, fontSize:10}}>Sin link</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTADORA FORM — editor con 3 secciones
// ═══════════════════════════════════════════════════════════════════
function ExportadoraForm({exportadora, especies, paises, ciudades, monedas, onGuardar, onCancelar}) {
  const [buf, setBuf] = useState(()=>JSON.parse(JSON.stringify(exportadora)));
  const [seccionAbierta, setSeccionAbierta] = useState("basico");

  const ciudadesSugeridas = useMemo(()=>{
    if(!Array.isArray(ciudades) || !ciudades.length) return [];
    if(!buf.paisCodigo) return ciudades;
    return ciudades.filter(c => c.paisCodigo === buf.paisCodigo);
  },[ciudades, buf.paisCodigo]);

  const setCampo = (k, v) => setBuf(prev => ({...prev, [k]:v}));
  const toggleEspecie = (codigo) => {
    setBuf(prev => {
      const arr = prev.especiesProduce || [];
      return {...prev, especiesProduce: arr.includes(codigo) ? arr.filter(c=>c!==codigo) : [...arr, codigo]};
    });
  };

  const setContacto = (idx, k, v) => {
    setBuf(prev => {
      const list = [...(prev.contactos||[])];
      list[idx] = {...list[idx], [k]:v};
      return {...prev, contactos:list};
    });
  };
  const addContacto = () => setBuf(prev => ({...prev, contactos:[...(prev.contactos||[]), {nombre:"", cargo:"", email:"", telefono:""}]}));
  const delContacto = (idx) => setBuf(prev => ({...prev, contactos:(prev.contactos||[]).filter((_,i)=>i!==idx)}));

  const handleGuardar = () => {
    if(!buf.nombre?.trim()) { alert("Nombre es requerido"); return; }
    onGuardar({...buf, fechaActualizacion: new Date().toISOString()});
  };

  const toggle = (id) => setSeccionAbierta(prev => prev === id ? "" : id);

  const especiesActivas = (buf.especiesProduce||[]);

  return (
    <div style={{background:`${C.teal}11`, padding:16, borderRadius:8, border:`1px solid ${C.teal}44`, marginBottom:14}}>
      <h3 style={{margin:"0 0 14px", color:C.teal, fontSize:14, display:"flex", alignItems:"center", gap:8}}>
        <span>{exportadora.id ? "✎" : "+"}</span>
        <span>{exportadora.id ? `Editando: ${buf.nombre || "(sin nombre)"}` : "Nueva exportadora"}</span>
      </h3>

      <Seccion id="basico" titulo="Datos básicos" icono="🏭" abierta={seccionAbierta==="basico"} onToggle={()=>toggle("basico")}>
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap:10}}>
          <div>
            <div style={lblSt}>Nombre *</div>
            <input value={buf.nombre||""} onChange={e=>setCampo("nombre", e.target.value)} placeholder="Allegria Foods..." style={inputSt}/>
          </div>
          <div>
            <div style={lblSt}>RUT / ID Fiscal</div>
            <input value={buf.rut||""} onChange={e=>setCampo("rut", e.target.value)} placeholder="76.123.456-7" style={inputSt}/>
          </div>
          <div>
            <div style={lblSt}>País</div>
            <select value={buf.paisCodigo||""} onChange={e=>setCampo("paisCodigo", e.target.value)} style={inputSt}>
              <option value="">— seleccionar —</option>
              {paises.map(p => <option key={p.codigo} value={p.codigo}>{p.flag} {p.nombreEs}</option>)}
            </select>
          </div>
          <div>
            <div style={lblSt}>Ciudad</div>
            <input
              value={buf.ciudad||""}
              onChange={e=>setCampo("ciudad", e.target.value)}
              list="ciudades-exportadora-list"
              placeholder={buf.paisCodigo ? "Empezá a tipear o elegí…" : "Selecciona país primero o tipea libre"}
              style={inputSt}
              autoComplete="off"
            />
            <datalist id="ciudades-exportadora-list">
              {ciudadesSugeridas.map(c => (
                <option key={c.codigo} value={c.nombre}>{c.paisCodigo}</option>
              ))}
            </datalist>
          </div>
          <div>
            <div style={lblSt}>Moneda principal</div>
            <select value={buf.monedaCodigo||"USD"} onChange={e=>setCampo("monedaCodigo", e.target.value)} style={inputSt}>
              {monedas.map(m => <option key={m.codigo} value={m.codigo}>{m.simbolo} {m.codigo} — {m.nombre}</option>)}
            </select>
          </div>
          <div>
            <div style={lblSt}>Estado</div>
            <select value={buf.activo===false?"no":"si"} onChange={e=>setCampo("activo", e.target.value==="si")} style={inputSt}>
              <option value="si">● Activo</option>
              <option value="no">○ Inactivo</option>
            </select>
          </div>
        </div>
        <div style={{marginTop:10}}>
          <div style={lblSt}>Dirección</div>
          <input value={buf.direccion||""} onChange={e=>setCampo("direccion", e.target.value)} placeholder="Av Principal 123" style={inputSt}/>
        </div>
        <div style={{marginTop:10}}>
          <div style={lblSt}>Certificaciones (separadas por coma)</div>
          <input value={buf.certificaciones||""} onChange={e=>setCampo("certificaciones", e.target.value)}
            placeholder="GlobalGAP, BRC, SMETA" style={inputSt}/>
        </div>
        <div style={{marginTop:10}}>
          <div style={lblSt}>Observaciones</div>
          <textarea value={buf.observ||""} onChange={e=>setCampo("observ", e.target.value)}
            rows={2} style={{...inputSt, resize:"vertical", fontFamily:"inherit"}}/>
        </div>
      </Seccion>

      <Seccion id="contactos" titulo={`Contactos (${(buf.contactos||[]).length})`} icono="👥" abierta={seccionAbierta==="contactos"} onToggle={()=>toggle("contactos")}>
        {(buf.contactos||[]).map((co, i) => (
          <div key={i} style={{display:"grid", gridTemplateColumns:"1.2fr 1fr 1.5fr 1fr 36px", gap:8, marginBottom:8}}>
            <input value={co.nombre||""} onChange={e=>setContacto(i,"nombre",e.target.value)} placeholder="Nombre" style={inputSt}/>
            <input value={co.cargo||""} onChange={e=>setContacto(i,"cargo",e.target.value)} placeholder="Cargo" style={inputSt}/>
            <input value={co.email||""} onChange={e=>setContacto(i,"email",e.target.value)} placeholder="email@x.com" type="email" style={inputSt}/>
            <input value={co.telefono||""} onChange={e=>setContacto(i,"telefono",e.target.value)} placeholder="Teléfono" style={inputSt}/>
            <button onClick={()=>delContacto(i)} style={{...btnSt(C.accent, true), padding:"4px 8px"}}>×</button>
          </div>
        ))}
        <button onClick={addContacto} style={btnSt(C.green, true)}>+ Agregar contacto</button>
      </Seccion>

      <Seccion id="especies" titulo={`Especies que produce (${especiesActivas.length}/${especies.length})`} icono="🍒" abierta={seccionAbierta==="especies"} onToggle={()=>toggle("especies")}>
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(150px, 1fr))", gap:6}}>
          {especies.map(e => {
            const activa = especiesActivas.includes(e.codigo);
            return (
              <label key={e.codigo} style={{
                display:"flex", alignItems:"center", gap:6, padding:"6px 10px",
                background: activa ? `${C.teal}22` : C.card,
                border:`1px solid ${activa?C.teal:C.border}`,
                borderRadius:6, cursor:"pointer", fontSize:11,
              }}>
                <input type="checkbox" checked={activa} onChange={()=>toggleEspecie(e.codigo)}/>
                <span style={{fontSize:14}}>{e.icono}</span>
                <span style={{color:C.text}}>{e.nombreEs}</span>
              </label>
            );
          })}
        </div>
        {especies.length === 0 && (
          <div style={{padding:14, color:C.muted, fontSize:11}}>
            Sin especies en el maestro. Ve a Maestros → Especies para cargarlas.
          </div>
        )}
      </Seccion>

      <div style={{display:"flex", gap:8, justifyContent:"flex-end", marginTop:14}}>
        <button onClick={onCancelar} style={btnSt(C.muted, true)}>Cancelar</button>
        <button onClick={handleGuardar} style={btnSt(C.green)}>✓ Guardar exportadora</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTADORA CARD — vista compacta
// ═══════════════════════════════════════════════════════════════════
function ExportadoraCard({exportadora, especies, paises, monedas, onEditar, onEliminar, canEdit}) {
  const pais = paises.find(p => p.codigo === exportadora.paisCodigo);
  const monedaSimb = monedas.find(m => m.codigo === exportadora.monedaCodigo)?.simbolo || exportadora.monedaCodigo;
  const especiesNombres = (exportadora.especiesProduce||[])
    .map(c => especies.find(e=>e.codigo===c))
    .filter(Boolean);
  const certifs = (exportadora.certificaciones||"").split(",").map(s=>s.trim()).filter(Boolean);

  return (
    <div style={{
      background:C.card2, padding:14, borderRadius:10,
      border:`1px solid ${exportadora.activo===false?C.border:C.teal+"66"}`,
      opacity: exportadora.activo===false ? 0.65 : 1,
    }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, marginBottom:10}}>
        <div style={{flex:1}}>
          <div style={{fontSize:14, fontWeight:700, color:C.text, display:"flex", alignItems:"center", gap:8}}>
            {exportadora.activo===false && <span style={{fontSize:9, padding:"2px 6px", borderRadius:4, background:C.border, color:C.muted}}>INACTIVO</span>}
            {exportadora.nombre}
          </div>
          <div style={{fontSize:11, color:C.muted, marginTop:3, display:"flex", gap:8, flexWrap:"wrap"}}>
            {pais && <span>{pais.flag} {exportadora.ciudad ? `${exportadora.ciudad}, ` : ""}{pais.nombreEs}</span>}
            {exportadora.rut && <span>· {exportadora.rut}</span>}
            <span>· 💱 {monedaSimb}</span>
          </div>
        </div>
        {canEdit && (
          <div style={{display:"flex", gap:6}}>
            <button onClick={onEditar} style={{...btnSt(C.blue, true), padding:"4px 10px"}}>✎ Editar</button>
            <button onClick={onEliminar} style={{...btnSt(C.accent, true), padding:"4px 10px"}}>×</button>
          </div>
        )}
      </div>

      {especiesNombres.length > 0 && (
        <div style={{display:"flex", flexWrap:"wrap", gap:4, marginBottom:certifs.length?6:0}}>
          {especiesNombres.map(e => (
            <span key={e.codigo} style={{
              padding:"2px 8px", borderRadius:4, fontSize:10,
              background:`${C.teal}22`, color:C.teal, border:`1px solid ${C.teal}44`
            }}>{e.icono} {e.nombreEs}</span>
          ))}
        </div>
      )}

      {certifs.length > 0 && (
        <div style={{display:"flex", flexWrap:"wrap", gap:4, marginTop:6}}>
          {certifs.map((c, i) => (
            <span key={i} style={{
              padding:"2px 8px", borderRadius:4, fontSize:10,
              background:`${C.purple}22`, color:C.purple, border:`1px solid ${C.purple}44`
            }}>✓ {c}</span>
          ))}
        </div>
      )}

      {(exportadora.contactos||[]).length > 0 && (
        <div style={{marginTop:10, paddingTop:10, borderTop:`1px solid ${C.border}`, fontSize:11, color:C.muted}}>
          👥 {(exportadora.contactos||[]).length} contacto{exportadora.contactos.length>1?"s":""}
          {exportadora.contactos[0]?.nombre && <span> · <span style={{color:C.text}}>{exportadora.contactos[0].nombre}</span>
            {exportadora.contactos[0].cargo && <span style={{color:C.muted}}> ({exportadora.contactos[0].cargo})</span>}
          </span>}
        </div>
      )}

      {exportadora.observ && (
        <div style={{marginTop:8, paddingTop:8, borderTop:`1px solid ${C.border}`, fontSize:11, color:C.muted, fontStyle:"italic"}}>
          {exportadora.observ}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// BUSINESS CLOSURE FORM
// ═══════════════════════════════════════════════════════════════════
function ClosureForm({closure, exportadoras, clientes, especies, tiposEmbalaje, monedas, temporadas, onGuardar, onCancelar}) {
  const [buf, setBuf] = useState(()=>JSON.parse(JSON.stringify(closure)));
  const setCampo = (k, v) => setBuf(prev=>({...prev, [k]:v}));

  const setCajas = (fmtCodigo, val) => setBuf(prev=>{
    const cpf = {...(prev.cajasPorFormato||{})};
    const n = Number(val);
    if(!val || n===0) delete cpf[fmtCodigo]; else cpf[fmtCodigo]=n;
    return {...prev, cajasPorFormato:cpf};
  });

  const especieObj   = especies.find(e=>e.codigo===buf.especieCodigo);
  const formatosDisp = tiposEmbalaje.filter(t=>
    t.especieCodigo===buf.especieCodigo || (especieObj && t.especie===especieObj.nombreEs)
  );
  const totalCajas = Object.values(buf.cajasPorFormato||{}).reduce((s,v)=>s+Number(v||0),0);

  const handleGuardar = () => {
    if(!buf.exportadoraId)   { alert("Selecciona exportadora"); return; }
    if(!buf.clienteId)       { alert("Selecciona cliente"); return; }
    if(!buf.especieCodigo)   { alert("Selecciona especie"); return; }
    if(!buf.temporada?.trim()){ alert("Ingresa la temporada"); return; }
    if(totalCajas===0)       { alert("Ingresa cajas en al menos un formato"); return; }
    onGuardar({...buf, fechaActualizacion:new Date().toISOString()});
  };

  return (
    <div style={{background:`${C.blue}11`, padding:16, borderRadius:8, border:`1px solid ${C.blue}44`, marginBottom:14}}>
      <h3 style={{margin:"0 0 14px", color:C.blue, fontSize:14, display:"flex", alignItems:"center", gap:8}}>
        <span>{closure.id?"✎":"+"}</span>
        <span>{closure.id?"Editando Business Closure":"Nuevo Business Closure"}</span>
      </h3>

      {/* Temporada · Código · Estado */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 200px 140px", gap:10, marginBottom:10}}>
        <div>
          <div style={lblSt}>Temporada *</div>
          <select value={buf.temporada||""} style={inputSt}
            onChange={e=>{
              const val = e.target.value;
              const [a1, a2] = val.split("-");
              const inicio = a1 ? `${a1}-07-01` : "";
              const fin    = a2 ? `${a2}-06-30` : "";
              setBuf(prev=>({...prev, temporada:val,
                fechaInicio: prev.fechaInicio||inicio,
                fechaFin:    prev.fechaFin   ||fin,
              }));
            }}>
            <option value="">— seleccionar —</option>
            {(temporadas||[]).map(t=><option key={t} value={t}>Temporada {t}</option>)}
          </select>
        </div>
        <div>
          <div style={lblSt}>Código (opcional)</div>
          <input value={buf.codigo||""} onChange={e=>setCampo("codigo",e.target.value)}
            placeholder="BC-CHE-2026-001" style={inputSt}/>
        </div>
        <div>
          <div style={lblSt}>Estado</div>
          <select value={buf.estado||"activo"} onChange={e=>setCampo("estado",e.target.value)} style={inputSt}>
            <option value="activo">● Activo</option>
            <option value="cerrado">✓ Cerrado</option>
            <option value="cancelado">✗ Cancelado</option>
          </select>
        </div>
      </div>

      {/* Exportadora · Cliente */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10}}>
        <div>
          <div style={lblSt}>Exportadora *</div>
          <select value={buf.exportadoraId||""} onChange={e=>setCampo("exportadoraId",e.target.value)} style={inputSt}>
            <option value="">— seleccionar —</option>
            {exportadoras.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>
        <div>
          <div style={lblSt}>Cliente *</div>
          <select value={buf.clienteId||""} onChange={e=>setCampo("clienteId",e.target.value)} style={inputSt}>
            <option value="">— seleccionar —</option>
            {clientes.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
      </div>

      {/* Especie · Precio · Moneda · Condiciones */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 110px 120px 130px", gap:10, marginBottom:10}}>
        <div>
          <div style={lblSt}>Especie *</div>
          <select value={buf.especieCodigo||""}
            onChange={e=>setBuf(prev=>({...prev, especieCodigo:e.target.value, cajasPorFormato:{}}))}
            style={inputSt}>
            <option value="">— seleccionar —</option>
            {especies.map(e=><option key={e.codigo} value={e.codigo}>{e.icono} {e.nombreEs}</option>)}
          </select>
        </div>
        <div>
          <div style={lblSt}>Precio ref.</div>
          <input type="number" step="0.01" value={buf.precioRef??""} placeholder="8.50"
            onChange={e=>setCampo("precioRef", e.target.value===""?null:Number(e.target.value))}
            style={inputSt}/>
        </div>
        <div>
          <div style={lblSt}>Moneda</div>
          <select value={buf.monedaCodigo||"USD"} onChange={e=>setCampo("monedaCodigo",e.target.value)} style={inputSt}>
            {monedas.map(m=><option key={m.codigo} value={m.codigo}>{m.simbolo} {m.codigo}</option>)}
          </select>
        </div>
        <div>
          <div style={lblSt}>Condiciones</div>
          <select value={buf.condiciones||"FOB"} onChange={e=>setCampo("condiciones",e.target.value)} style={inputSt}>
            {["FOB","CIF","CFR","EXW","DAP"].map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Fechas */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10}}>
        <div>
          <div style={lblSt}>Inicio temporada</div>
          <input type="date" value={buf.fechaInicio||""} onChange={e=>setCampo("fechaInicio",e.target.value)} style={inputSt}/>
        </div>
        <div>
          <div style={lblSt}>Fin temporada</div>
          <input type="date" value={buf.fechaFin||""} onChange={e=>setCampo("fechaFin",e.target.value)} style={inputSt}/>
        </div>
      </div>

      {/* Cajas por formato */}
      {buf.especieCodigo && (
        <div style={{marginBottom:10}}>
          <div style={{...lblSt, marginBottom:6, display:"flex", alignItems:"center", gap:10}}>
            Cajas comprometidas por formato
            {totalCajas>0 && <span style={{color:C.green, fontWeight:700, fontSize:11, textTransform:"none"}}>
              Total: {totalCajas.toLocaleString("es-CL")} cajas
            </span>}
          </div>
          {formatosDisp.length===0 ? (
            <div style={{color:C.muted, fontSize:11, fontStyle:"italic", padding:"8px 12px", background:C.card, borderRadius:6}}>
              Sin formatos para esta especie. Agrégalos en Maestros → Tipos de Embalaje.
            </div>
          ) : (
            <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(175px, 1fr))", gap:8}}>
              {formatosDisp.map(fmt=>{
                const val = (buf.cajasPorFormato||{})[fmt.codigo];
                return (
                  <div key={fmt.codigo} style={{background:C.card, padding:10, borderRadius:6, border:`1px solid ${val?C.blue:C.border}`}}>
                    <div style={{fontSize:11, color:C.text, fontWeight:600, marginBottom:2}}>{fmt.nombre}</div>
                    <div style={{fontSize:9, color:C.muted, marginBottom:6}}>{fmt.codigo}</div>
                    <input type="number" min="0" step="1" value={val??""} placeholder="cajas"
                      onChange={e=>setCajas(fmt.codigo, e.target.value)} style={inputSt}/>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Observaciones */}
      <div style={{marginBottom:14}}>
        <div style={lblSt}>Observaciones</div>
        <textarea value={buf.observ||""} onChange={e=>setCampo("observ",e.target.value)}
          rows={2} style={{...inputSt, resize:"vertical", fontFamily:"inherit"}}/>
      </div>

      <div style={{display:"flex", gap:8, justifyContent:"flex-end"}}>
        <button onClick={onCancelar} style={btnSt(C.muted,true)}>Cancelar</button>
        <button onClick={handleGuardar} style={btnSt(C.green)}>✓ Guardar Business Closure</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// BUSINESS CLOSURE CARD
// ═══════════════════════════════════════════════════════════════════
function ClosureCard({closure, exportadoras, clientes, especies, tiposEmbalaje, monedas, onEditar, onEliminar, canEdit}) {
  const exportadora = exportadoras.find(e=>e.id===closure.exportadoraId);
  const cliente     = clientes.find(c=>c.id===closure.clienteId);
  const especie     = especies.find(e=>e.codigo===closure.especieCodigo);
  const moneda      = monedas.find(m=>m.codigo===closure.monedaCodigo);
  const totalCajas  = Object.values(closure.cajasPorFormato||{}).reduce((s,v)=>s+Number(v||0),0);

  const formatosConCajas = Object.entries(closure.cajasPorFormato||{})
    .map(([cod, cajas])=>({ fmt: tiposEmbalaje.find(t=>t.codigo===cod)||{nombre:cod,codigo:cod}, cajas:Number(cajas) }))
    .filter(x=>x.cajas>0);

  const estadoColor = {activo:C.green, cerrado:C.blue, cancelado:C.muted}[closure.estado||"activo"] || C.muted;
  const estadoLabel = {activo:"● Activo", cerrado:"✓ Cerrado", cancelado:"✗ Cancelado"}[closure.estado||"activo"];

  return (
    <div style={{
      background:C.card2, padding:14, borderRadius:10,
      border:`1px solid ${closure.estado==="activo"?C.blue+"55":C.border}`,
      opacity: closure.estado==="cancelado"?0.6:1,
    }}>
      {/* Exportadora → Cliente */}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, marginBottom:10}}>
        <div style={{flex:1}}>
          <div style={{fontSize:13, fontWeight:700, color:C.text, display:"flex", alignItems:"center", gap:6, flexWrap:"wrap"}}>
            <span>{exportadora?.nombre||<em style={{color:C.muted}}>—</em>}</span>
            <span style={{color:C.muted, fontSize:11, fontWeight:400}}>→</span>
            <span>{cliente?.nombre||<em style={{color:C.muted}}>—</em>}</span>
          </div>
          <div style={{fontSize:11, color:C.muted, marginTop:3, display:"flex", gap:8, flexWrap:"wrap", alignItems:"center"}}>
            {especie && <span>{especie.icono} {especie.nombreEs}</span>}
            <span>· {closure.temporada}</span>
            {closure.codigo && <span style={{color:C.muted2}}>· {closure.codigo}</span>}
          </div>
        </div>
        <div style={{display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4}}>
          <span style={{fontSize:9, padding:"2px 8px", borderRadius:4, background:`${estadoColor}22`, color:estadoColor, border:`1px solid ${estadoColor}44`, fontWeight:700}}>
            {estadoLabel}
          </span>
          {canEdit && (
            <div style={{display:"flex", gap:4, marginTop:2}}>
              <button onClick={onEditar} style={{...btnSt(C.blue,true), padding:"3px 8px", fontSize:10}}>✎</button>
              <button onClick={onEliminar} style={{...btnSt(C.accent,true), padding:"3px 8px", fontSize:10}}>×</button>
            </div>
          )}
        </div>
      </div>

      {/* Formatos y cajas */}
      {formatosConCajas.length>0 && (
        <div style={{display:"flex", flexWrap:"wrap", gap:4, marginBottom:10}}>
          {formatosConCajas.map(({fmt,cajas})=>(
            <span key={fmt.codigo} style={{padding:"3px 10px", borderRadius:4, fontSize:10, background:`${C.teal}22`, color:C.teal, border:`1px solid ${C.teal}33`}}>
              {fmt.nombre}: {cajas.toLocaleString("es-CL")} cjs
            </span>
          ))}
        </div>
      )}

      {/* KPIs */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, padding:"8px 0", borderTop:`1px solid ${C.border}`, fontSize:11}}>
        <div>
          <div style={{color:C.muted, fontSize:9, textTransform:"uppercase"}}>Total cajas</div>
          <div style={{color:C.text, fontWeight:700, fontFamily:"monospace"}}>{totalCajas.toLocaleString("es-CL")}</div>
        </div>
        <div>
          <div style={{color:C.muted, fontSize:9, textTransform:"uppercase"}}>Precio ref.</div>
          <div style={{color:C.text, fontWeight:700, fontFamily:"monospace"}}>
            {closure.precioRef!=null ? `${moneda?.simbolo||closure.monedaCodigo} ${Number(closure.precioRef).toFixed(2)}` : "—"}
          </div>
        </div>
        <div>
          <div style={{color:C.muted, fontSize:9, textTransform:"uppercase"}}>Condiciones</div>
          <div style={{color:C.blue, fontWeight:700}}>{closure.condiciones||"—"}</div>
        </div>
      </div>

      {(closure.fechaInicio||closure.fechaFin) && (
        <div style={{fontSize:10, color:C.muted, marginTop:6, display:"flex", gap:10}}>
          {closure.fechaInicio && <span>Inicio: {closure.fechaInicio}</span>}
          {closure.fechaFin    && <span>Fin: {closure.fechaFin}</span>}
        </div>
      )}
      {closure.observ && (
        <div style={{marginTop:8, fontSize:11, color:C.muted, fontStyle:"italic", borderTop:`1px solid ${C.border}`, paddingTop:6}}>
          {closure.observ}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PROGRAMA COMERCIAL — helpers y componentes
// ═══════════════════════════════════════════════════════════════════

// Retorna el lunes de la semana de una fecha YYYY-MM-DD
function getMondayStr(dateStr) {
  if(!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0,10);
}

// "2026-05-11" → "lun 11 may 2026"
function formatFechaSemana(dateStr) {
  if(!dateStr) return "—";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("es-CL", {weekday:"short", day:"numeric", month:"short", year:"numeric"});
}

// Formulario para agregar/editar una semana del programa
function ProgramaSemanaForm({semana, closure, tiposEmbalaje, onGuardar, onCancelar}) {
  const [buf, setBuf] = useState(()=>JSON.parse(JSON.stringify(semana)));

  const setCajas = (fmtCodigo, val) => setBuf(prev=>{
    const cpf = {...(prev.cajasPorFormato||{})};
    const n = Number(val);
    if(!val || n===0) delete cpf[fmtCodigo]; else cpf[fmtCodigo]=n;
    return {...prev, cajasPorFormato:cpf};
  });

  const formatosClosure = Object.keys(closure?.cajasPorFormato||{});
  const totalCajas = Object.values(buf.cajasPorFormato||{}).reduce((s,v)=>s+Number(v||0),0);

  const handleGuardar = () => {
    const fecha = getMondayStr(buf.fechaSemana);
    if(!fecha){ alert("Ingresa la fecha de la semana"); return; }
    if(totalCajas===0){ alert("Ingresa cajas en al menos un formato"); return; }
    onGuardar({...buf, fechaSemana:fecha});
  };

  return (
    <div style={{background:`${C.teal}11`, padding:14, borderRadius:8, border:`1px solid ${C.teal}44`, marginBottom:10}}>
      <h4 style={{margin:"0 0 12px", color:C.teal, fontSize:13, display:"flex", alignItems:"center", gap:8}}>
        <span>{semana.id?"✎":"+"}</span>
        <span>{semana.id?"Editar semana":"Nueva semana de programa"}</span>
        <span style={{fontSize:10, color:C.muted, fontWeight:400}}>
          — La fecha se ajusta al lunes de la semana elegida
        </span>
      </h4>

      {/* Fecha + Estado */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 160px", gap:10, marginBottom:12}}>
        <div>
          <div style={lblSt}>Semana (fecha de inicio) *</div>
          <input type="date" value={buf.fechaSemana||""} style={inputSt}
            onChange={e=>setBuf(prev=>({...prev, fechaSemana:e.target.value}))}
            onBlur={e=>setBuf(prev=>({...prev, fechaSemana:getMondayStr(e.target.value)}))}/>
          {buf.fechaSemana && (
            <div style={{fontSize:10, color:C.teal, marginTop:3}}>
              Lunes: {formatFechaSemana(getMondayStr(buf.fechaSemana))}
            </div>
          )}
        </div>
        <div>
          <div style={lblSt}>Estado</div>
          <select value={buf.estado||"borrador"} style={inputSt}
            onChange={e=>setBuf(prev=>({...prev, estado:e.target.value}))}>
            <option value="borrador">◌ Borrador</option>
            <option value="confirmado">✓ Confirmado</option>
          </select>
        </div>
      </div>

      {/* Cajas por formato */}
      <div style={{marginBottom:12}}>
        <div style={lblSt}>Cajas por formato *</div>
        {formatosClosure.length === 0 ? (
          <div style={{color:C.muted, fontSize:11}}>El Business Closure no tiene formatos definidos.</div>
        ) : (
          <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:8}}>
            {formatosClosure.map(fmtCodigo=>{
              const fmtObj = tiposEmbalaje.find(t=>t.codigo===fmtCodigo);
              const ppto = Number(closure.cajasPorFormato[fmtCodigo]||0);
              return (
                <div key={fmtCodigo} style={{background:C.card, padding:8, borderRadius:6, border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:10, color:C.muted, marginBottom:4}}>{fmtObj?.nombre||fmtCodigo}</div>
                  <div style={{fontSize:9, color:C.muted2, marginBottom:4}}>Ppto: {ppto.toLocaleString("es-CL")} cjs</div>
                  <input type="number" min="0" step="1"
                    value={buf.cajasPorFormato?.[fmtCodigo]||""}
                    placeholder="0"
                    style={{...inputSt, padding:"4px 8px", fontSize:13, fontFamily:"monospace", textAlign:"right"}}
                    onChange={e=>setCajas(fmtCodigo, e.target.value)}/>
                </div>
              );
            })}
          </div>
        )}
        {totalCajas > 0 && (
          <div style={{fontSize:11, color:C.teal, marginTop:6, fontFamily:"monospace"}}>
            Total semana: {totalCajas.toLocaleString("es-CL")} cjs
          </div>
        )}
      </div>

      {/* Observ */}
      <div style={{marginBottom:12}}>
        <div style={lblSt}>Observaciones</div>
        <textarea value={buf.observ||""} rows={2}
          style={{...inputSt, resize:"vertical", fontFamily:"inherit"}}
          onChange={e=>setBuf(prev=>({...prev, observ:e.target.value}))}/>
      </div>

      <div style={{display:"flex", gap:8, justifyContent:"flex-end"}}>
        <button onClick={onCancelar} style={btnSt(C.muted,true)}>Cancelar</button>
        <button onClick={handleGuardar} style={btnSt(C.teal)}>✓ Guardar semana</button>
      </div>
    </div>
  );
}

// Panel de programa por Business Closure
function ClosureProgramaPanel({closure, semanas, tiposEmbalaje, exportadoras, clientes, especies,
  canEdit, editandoSemana, closureIdParaSemana,
  onAgregarSemana, onEditarSemana, onEliminarSemana, onGuardarSemana, onCancelarSemana
}) {
  const exportadora = exportadoras.find(e=>e.id===closure.exportadoraId);
  const cliente     = clientes.find(c=>c.id===closure.clienteId);
  const especie     = especies.find(e=>e.codigo===closure.especieCodigo);

  const formatosClosure = Object.keys(closure.cajasPorFormato||{});
  const totalPpto = Object.values(closure.cajasPorFormato||{}).reduce((s,v)=>s+Number(v||0),0);

  // Acumulado real por formato
  const acumReal = {};
  semanas.forEach(s=>{
    Object.entries(s.cajasPorFormato||{}).forEach(([cod,v])=>{
      acumReal[cod] = (acumReal[cod]||0) + Number(v||0);
    });
  });
  const totalReal = Object.values(acumReal).reduce((s,v)=>s+v,0);
  const totalVariacion = totalPpto - totalReal;

  const semanasOrdenadas = [...semanas].sort((a,b)=>(a.fechaSemana||"").localeCompare(b.fechaSemana||""));
  const esEditandoEste   = closureIdParaSemana === closure.id;

  return (
    <div style={{
      background:C.card2, borderRadius:10, border:`1px solid ${C.blue}44`,
      marginBottom:14, overflow:"hidden",
    }}>
      {/* Header del closure */}
      <div style={{padding:"10px 14px", background:`${C.blue}0a`, borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8}}>
        <div>
          <div style={{fontSize:13, fontWeight:700, color:C.text, display:"flex", alignItems:"center", gap:6}}>
            {exportadora?.nombre||"—"}
            <span style={{color:C.muted, fontSize:11}}>→</span>
            {cliente?.nombre||"—"}
          </div>
          <div style={{fontSize:11, color:C.muted, marginTop:2, display:"flex", gap:8, alignItems:"center"}}>
            {especie && <span>{especie.icono} {especie.nombreEs}</span>}
            <span>· Temporada {closure.temporada}</span>
            {closure.codigo && <span style={{color:C.muted2}}>· {closure.codigo}</span>}
          </div>
        </div>
        {/* KPIs compactos */}
        <div style={{display:"flex", gap:16, fontSize:11, fontFamily:"monospace"}}>
          <div style={{textAlign:"center"}}>
            <div style={{color:C.muted, fontSize:9, textTransform:"uppercase"}}>Presup.</div>
            <div style={{color:C.blue, fontWeight:700}}>{totalPpto.toLocaleString("es-CL")}</div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{color:C.muted, fontSize:9, textTransform:"uppercase"}}>Real</div>
            <div style={{color:C.teal, fontWeight:700}}>{totalReal.toLocaleString("es-CL")}</div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{color:C.muted, fontSize:9, textTransform:"uppercase"}}>Variación</div>
            <div style={{color: totalVariacion<0?C.accent:totalVariacion===0?C.green:C.yellow, fontWeight:700}}>
              {totalVariacion>0?"+":""}{totalVariacion.toLocaleString("es-CL")}
            </div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{color:C.muted, fontSize:9, textTransform:"uppercase"}}>Avance</div>
            <div style={{color:C.text, fontWeight:700}}>
              {totalPpto>0?Math.round(totalReal/totalPpto*100):0}%
            </div>
          </div>
        </div>
      </div>

      {/* Tabla de semanas */}
      <div style={{padding:14}}>
        {semanasOrdenadas.length > 0 ? (
          <div style={{overflowX:"auto", marginBottom:10}}>
            <table style={{borderCollapse:"collapse", width:"100%", fontSize:11}}>
              <thead>
                <tr style={{background:C.bg2}}>
                  <th style={{padding:"6px 10px", textAlign:"left", color:C.muted, fontWeight:600, border:`1px solid ${C.border}`, whiteSpace:"nowrap"}}>Semana (lunes)</th>
                  {formatosClosure.map(cod=>{
                    const fmt = tiposEmbalaje.find(t=>t.codigo===cod);
                    return (
                      <th key={cod} style={{padding:"6px 8px", textAlign:"right", color:C.muted, fontWeight:600, border:`1px solid ${C.border}`, whiteSpace:"nowrap", fontSize:10}}>
                        {fmt?.nombre||cod}
                      </th>
                    );
                  })}
                  <th style={{padding:"6px 8px", textAlign:"right", color:C.muted, fontWeight:600, border:`1px solid ${C.border}`}}>Total cjs</th>
                  <th style={{padding:"6px 8px", textAlign:"center", color:C.muted, fontWeight:600, border:`1px solid ${C.border}`}}>Estado</th>
                  {canEdit && <th style={{border:`1px solid ${C.border}`}}/>}
                </tr>
              </thead>
              <tbody>
                {semanasOrdenadas.map((sem,i)=>{
                  const totalSem = Object.values(sem.cajasPorFormato||{}).reduce((s,v)=>s+Number(v||0),0);
                  return (
                    <tr key={sem.id||i} style={{background: i%2===0?C.card:C.card2}}>
                      <td style={{padding:"6px 10px", border:`1px solid ${C.border}`, whiteSpace:"nowrap"}}>
                        {formatFechaSemana(sem.fechaSemana)}
                      </td>
                      {formatosClosure.map(cod=>(
                        <td key={cod} style={{padding:"6px 8px", textAlign:"right", border:`1px solid ${C.border}`, fontFamily:"monospace"}}>
                          {sem.cajasPorFormato?.[cod]!=null ? Number(sem.cajasPorFormato[cod]).toLocaleString("es-CL") : "—"}
                        </td>
                      ))}
                      <td style={{padding:"6px 8px", textAlign:"right", border:`1px solid ${C.border}`, fontFamily:"monospace", fontWeight:700}}>
                        {totalSem.toLocaleString("es-CL")}
                      </td>
                      <td style={{padding:"6px 8px", textAlign:"center", border:`1px solid ${C.border}`}}>
                        <span style={{
                          fontSize:9, padding:"2px 6px", borderRadius:4, fontWeight:600,
                          background:sem.estado==="confirmado"?`${C.green}22`:`${C.yellow}22`,
                          color:sem.estado==="confirmado"?C.green:C.yellow,
                        }}>
                          {sem.estado==="confirmado"?"✓ Conf.":"◌ Bor."}
                        </span>
                      </td>
                      {canEdit && (
                        <td style={{padding:"4px 6px", border:`1px solid ${C.border}`, whiteSpace:"nowrap"}}>
                          <button onClick={()=>onEditarSemana(sem)} style={{...btnSt(C.blue,true), padding:"2px 6px", fontSize:10, marginRight:3}}>✎</button>
                          <button onClick={()=>onEliminarSemana(sem)} style={{...btnSt(C.accent,true), padding:"2px 6px", fontSize:10}}>×</button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {/* Fila de totales acumulados */}
                <tr style={{background:`${C.teal}0a`, fontWeight:700}}>
                  <td style={{padding:"6px 10px", border:`1px solid ${C.border}`, color:C.teal, fontSize:10, textTransform:"uppercase"}}>Acumulado real</td>
                  {formatosClosure.map(cod=>(
                    <td key={cod} style={{padding:"6px 8px", textAlign:"right", border:`1px solid ${C.border}`, fontFamily:"monospace", color:C.teal}}>
                      {acumReal[cod]!=null ? acumReal[cod].toLocaleString("es-CL") : "—"}
                    </td>
                  ))}
                  <td style={{padding:"6px 8px", textAlign:"right", border:`1px solid ${C.border}`, fontFamily:"monospace", color:C.teal}}>
                    {totalReal.toLocaleString("es-CL")}
                  </td>
                  <td colSpan={canEdit?2:1} style={{border:`1px solid ${C.border}`}}/>
                </tr>
                {/* Fila de variación */}
                <tr style={{background:`${C.blue}0a`}}>
                  <td style={{padding:"6px 10px", border:`1px solid ${C.border}`, color:C.blue, fontSize:10, textTransform:"uppercase"}}>Presupuesto BC</td>
                  {formatosClosure.map(cod=>{
                    const ppto = Number(closure.cajasPorFormato?.[cod]||0);
                    const real = acumReal[cod]||0;
                    const vari = ppto - real;
                    return (
                      <td key={cod} style={{padding:"6px 8px", textAlign:"right", border:`1px solid ${C.border}`, fontFamily:"monospace"}}>
                        <div style={{color:C.blue, fontSize:10}}>{ppto.toLocaleString("es-CL")}</div>
                        {semanasOrdenadas.length>0 && (
                          <div style={{fontSize:9, color:vari<0?C.accent:vari===0?C.green:C.yellow}}>
                            {vari>0?"+":""}{vari.toLocaleString("es-CL")}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td style={{padding:"6px 8px", textAlign:"right", border:`1px solid ${C.border}`, fontFamily:"monospace"}}>
                    <div style={{color:C.blue}}>{totalPpto.toLocaleString("es-CL")}</div>
                    {semanasOrdenadas.length>0 && (
                      <div style={{fontSize:9, color:totalVariacion<0?C.accent:totalVariacion===0?C.green:C.yellow}}>
                        {totalVariacion>0?"+":""}{totalVariacion.toLocaleString("es-CL")}
                      </div>
                    )}
                  </td>
                  <td colSpan={canEdit?2:1} style={{border:`1px solid ${C.border}`}}/>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{color:C.muted, fontSize:12, fontStyle:"italic", marginBottom:10}}>
            Aún no hay semanas ingresadas para este Business Closure.
          </div>
        )}

        {/* Form inline */}
        {esEditandoEste && editandoSemana && (
          <ProgramaSemanaForm
            semana={editandoSemana}
            closure={closure}
            tiposEmbalaje={tiposEmbalaje}
            onGuardar={onGuardarSemana}
            onCancelar={onCancelarSemana}
          />
        )}

        {canEdit && !esEditandoEste && (
          <button onClick={()=>onAgregarSemana(closure.id)} style={{...btnSt(C.teal,true), fontSize:11, padding:"5px 12px"}}>
            + Agregar semana
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PLACEHOLDER GENÉRICO — tabs que se construyen en fases siguientes
// ═══════════════════════════════════════════════════════════════════
function Placeholder({titulo, icono, fase, descripcion}) {
  return (
    <div style={{padding:40, textAlign:"center", background:C.card, borderRadius:14, border:`1px dashed ${C.border}`}}>
      <div style={{fontSize:48, marginBottom:14}}>{icono}</div>
      <h3 style={{margin:"0 0 8px", color:C.text, fontSize:18}}>{titulo}</h3>
      <div style={{color:C.muted, fontSize:12, marginBottom:14, maxWidth:500, margin:"0 auto 14px"}}>{descripcion}</div>
      <span style={{
        padding:"4px 12px", borderRadius:12, background:`${C.yellow}22`,
        color:C.yellow, fontSize:11, fontWeight:600, border:`1px solid ${C.yellow}44`,
      }}>{fase}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MODAL IMPORTADOR DE EXCEL
// Flujo: seleccionar archivo -> preview con desglose y conflictos
//        -> confirmar -> guarda en Supabase las 4 categorías
// ═══════════════════════════════════════════════════════════════════
function ImportadorExcelModal({clientes, exportadoras, onAplicar, onCerrar}) {
  const [etapa, setEtapa] = useState("seleccion"); // seleccion | preview | aplicando | listo
  const [error, setError] = useState("");
  const [plan, setPlan] = useState(null);
  const fileRef = useRef(null);

  const cargarArchivo = async (file) => {
    if(!file) return;
    setError("");
    try {
      const filasRaw = await leerExcelEntidades(file);
      if(!filasRaw.length) { setError("El archivo no tiene filas de datos."); return; }
      const {porDestino, errores} = procesarFilas(filasRaw);

      // Cargar notify, consignatarios y maestro de países desde Supabase
      const [ntActual, cnActual, paisesActual] = await Promise.all([
        dbLoadGeneric("maestro_notify"),
        dbLoadGeneric("maestro_consignatarios"),
        dbLoadGeneric("maestro_paises"),
      ]);

      // Mapa nombre/código del país (es/en/ISO) -> código ISO.
      // El Excel trae el país como texto plano ("CHILE", "Perú", "China"),
      // así que sin esto las entidades importadas se muestran sin bandera.
      const paisesList = Array.isArray(paisesActual) ? paisesActual : [];
      const paisIdx = {};
      paisesList.forEach(p => {
        if(!p.codigo) return;
        paisIdx[claveCmp(p.codigo)] = p.codigo;
        if(p.nombreEs) paisIdx[claveCmp(p.nombreEs)] = p.codigo;
        if(p.nombreEn) paisIdx[claveCmp(p.nombreEn)] = p.codigo;
      });
      const traducirPais = (txt) => paisIdx[claveCmp(txt)] || "";

      // Resolver paisCodigo en todas las filas antes del merge
      ["clientes","exportadoras","notify","consignatarios"].forEach(d => {
        porDestino[d].forEach(e => { e.paisCodigo = traducirPais(e.pais); });
      });
      const sinPais = [];
      ["clientes","exportadoras","notify","consignatarios"].forEach(d => {
        porDestino[d].forEach(e => {
          if(e.pais && !e.paisCodigo) sinPais.push(`${e.codigoEntidad} → "${e.pais}"`);
        });
      });
      if(sinPais.length) {
        errores.push(`${sinPais.length} entidad(es) con país sin código ISO mapeado (se importan sin bandera): ${sinPais.slice(0,5).join(", ")}${sinPais.length>5?"…":""}`);
      }

      const rCli = mergeClientes(clientes, porDestino.clientes);
      const rExp = mergeExportadoras(exportadoras, porDestino.exportadoras);
      const rNot = mergeSimple(Array.isArray(ntActual)?ntActual:[], porDestino.notify);
      const rCon = mergeSimple(Array.isArray(cnActual)?cnActual:[], porDestino.consignatarios);

      setPlan({
        totalFilas: filasRaw.length,
        errores,
        clientes:       {...rCli, entrantes:porDestino.clientes.length},
        exportadoras:   {...rExp, entrantes:porDestino.exportadoras.length},
        notify:         {...rNot, entrantes:porDestino.notify.length},
        consignatarios: {...rCon, entrantes:porDestino.consignatarios.length},
      });
      setEtapa("preview");
    } catch(e) {
      console.error("[Importador] Error:", e);
      setError("No se pudo leer el archivo. Verifica que sea un .xlsx válido. Detalle: " + e.message);
    }
  };

  const confirmar = async () => {
    setEtapa("aplicando");
    try {
      await dbSaveGeneric("maestro_notify", plan.notify.datos);
      await dbSaveGeneric("maestro_consignatarios", plan.consignatarios.datos);
      onAplicar({
        clientes: plan.clientes.datos,
        exportadoras: plan.exportadoras.datos,
      });
      setEtapa("listo");
    } catch(e) {
      console.error("[Importador] Error al aplicar:", e);
      setError("Error guardando en Supabase: " + e.message);
      setEtapa("preview");
    }
  };

  const ov = {position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:1000,
    display:"flex", alignItems:"center", justifyContent:"center", padding:20};
  const box = {background:C.card, borderRadius:14, border:`1px solid ${C.border}`,
    width:"100%", maxWidth:620, maxHeight:"85vh", overflowY:"auto", padding:22};

  const FilaResumen = ({icono, label, r}) => (
    <div style={{display:"flex", alignItems:"center", gap:10, padding:"10px 12px",
      background:C.card2, borderRadius:8, marginBottom:8}}>
      <span style={{fontSize:20}}>{icono}</span>
      <div style={{flex:1}}>
        <div style={{color:C.text, fontWeight:700, fontSize:13}}>{label}</div>
        <div style={{color:C.muted, fontSize:11}}>{r.entrantes} en el Excel</div>
      </div>
      <div style={{textAlign:"right", fontSize:11}}>
        <div style={{color:C.green, fontWeight:700}}>+{r.creados} nuevos</div>
        <div style={{color:C.yellow, fontWeight:700}}>~{r.actualizados} actualizados</div>
      </div>
    </div>
  );

  return (
    <div style={ov} onClick={(e)=>{ if(e.target===e.currentTarget && etapa!=="aplicando") onCerrar(); }}>
      <div style={box}>
        <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:16,
          borderBottom:`1px solid ${C.border}`, paddingBottom:12}}>
          <span style={{fontSize:22}}>📥</span>
          <h3 style={{margin:0, color:C.text, fontSize:16, flex:1}}>Importar entidades desde Excel</h3>
          {etapa!=="aplicando" && (
            <button onClick={onCerrar} style={btnSt(C.muted, true)}>✕ Cerrar</button>
          )}
        </div>

        {error && (
          <div style={{padding:"10px 12px", background:`${C.accent}22`, border:`1px solid ${C.accent}66`,
            borderRadius:8, color:C.text, fontSize:12, marginBottom:14}}>⚠️ {error}</div>
        )}

        {etapa === "seleccion" && (
          <div>
            <div style={{color:C.muted, fontSize:12, lineHeight:1.7, marginBottom:16}}>
              Selecciona el archivo <strong style={{color:C.text}}>clientes_frisku.xlsx</strong>.
              El importador detecta la columna <code>categoria</code> y reparte cada fila a
              Clientes, Exportadoras, Notify o Consignatarios automáticamente.
              <br/><br/>
              <strong style={{color:C.green}}>Merge no destructivo:</strong> si un cliente o
              exportadora ya existe, se actualizan solo los datos de identidad y contacto.
              Las comisiones, especies y certificaciones que ya configuraste se conservan intactas.
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls"
              onChange={e=>cargarArchivo(e.target.files?.[0])}
              style={{display:"none"}}/>
            <button onClick={()=>fileRef.current?.click()} style={{...btnSt(C.blue), padding:"12px 20px", fontSize:13}}>
              📂 Seleccionar archivo Excel
            </button>
          </div>
        )}

        {etapa === "preview" && plan && (
          <div>
            <div style={{color:C.muted, fontSize:12, marginBottom:14}}>
              Se leyeron <strong style={{color:C.text}}>{plan.totalFilas}</strong> filas.
              Revisa el desglose antes de confirmar:
            </div>
            <FilaResumen icono="👥" label="Clientes"       r={plan.clientes}/>
            <FilaResumen icono="🏭" label="Exportadoras"   r={plan.exportadoras}/>
            <FilaResumen icono="🔔" label="Notify"         r={plan.notify}/>
            <FilaResumen icono="📦" label="Consignatarios" r={plan.consignatarios}/>

            {plan.errores.length > 0 && (
              <div style={{marginTop:12, padding:"10px 12px", background:`${C.yellow}18`,
                border:`1px solid ${C.yellow}55`, borderRadius:8}}>
                <div style={{color:C.yellow, fontWeight:700, fontSize:12, marginBottom:6}}>
                  ⚠️ {plan.errores.length} fila(s) con observaciones:
                </div>
                <ul style={{margin:0, paddingLeft:18, color:C.muted, fontSize:11, lineHeight:1.6}}>
                  {plan.errores.slice(0,8).map((e,i)=><li key={i}>{e}</li>)}
                  {plan.errores.length>8 && <li>… y {plan.errores.length-8} más</li>}
                </ul>
              </div>
            )}

            <div style={{marginTop:14, padding:"10px 12px", background:C.card2, borderRadius:8,
              fontSize:11, color:C.muted, lineHeight:1.6}}>
              💡 Los registros marcados <span style={{color:C.yellow}}>~actualizados</span> conservan
              sus comisiones y especies. Notify y Consignatarios se guardan en el tab Maestros
              (los verás al entrar a esa pestaña).
            </div>

            <div style={{display:"flex", gap:10, marginTop:18, justifyContent:"flex-end"}}>
              <button onClick={()=>{setEtapa("seleccion"); setPlan(null);}} style={btnSt(C.muted, true)}>
                ← Elegir otro archivo
              </button>
              <button onClick={confirmar} style={{...btnSt(C.green), padding:"8px 18px"}}>
                ✓ Confirmar importación
              </button>
            </div>
          </div>
        )}

        {etapa === "aplicando" && (
          <div style={{padding:30, textAlign:"center", color:C.muted}}>
            💾 Guardando en Supabase…
          </div>
        )}

        {etapa === "listo" && plan && (
          <div style={{padding:20, textAlign:"center"}}>
            <div style={{fontSize:42, marginBottom:10}}>✅</div>
            <h3 style={{margin:"0 0 8px", color:C.text}}>Importación completada</h3>
            <div style={{color:C.muted, fontSize:12, lineHeight:1.7, marginBottom:16}}>
              {plan.clientes.creados + plan.exportadoras.creados +
               plan.notify.creados + plan.consignatarios.creados} registros nuevos ·{" "}
              {plan.clientes.actualizados + plan.exportadoras.actualizados +
               plan.notify.actualizados + plan.consignatarios.actualizados} actualizados.
            </div>
            <button onClick={onCerrar} style={{...btnSt(C.blue), padding:"8px 20px"}}>Cerrar</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════
export default function FriskuComercialModule({
  usuarioActual, esAdmin, esSoloConsulta, tabPermisos,
  onBack, onLogout,
}) {
  // Resolver permisos: App.jsx pasa esAdmin/esSoloConsulta como FUNCIONES
  // (rol-checkers que reciben el nombre del usuario). Soportar también booleans
  // por si se invoca el componente desde otro contexto (tests, storybook).
  const nombreUsuario = usuarioActual?.nombre;
  const admin = typeof esAdmin === "function" ? esAdmin(nombreUsuario) : !!esAdmin;
  const consulta = typeof esSoloConsulta === "function" ? esSoloConsulta(nombreUsuario) : !!esSoloConsulta;
  const canEditGlobal = admin || !consulta;

  // Permisos finos por tab. tabPermisos = {tabId: "editar"|"ver"|"sin_acceso"}
  // Admin siempre puede editar todo. Si no hay info para un tab, default = "editar".
  const permTab = (tabId) => {
    if (admin) return { visible: true, canEdit: canEditGlobal };
    const nivel = tabPermisos?.[tabId] || "editar";
    return {
      visible: nivel !== "sin_acceso",
      canEdit: canEditGlobal && nivel === "editar",
    };
  };

  // Datos comerciales
  const [clientes,       setClientes]       = useState([]);
  const [exportadoras,   setExportadoras]   = useState([]);
  const [contratos,      setContratos]      = useState([]);
  const [programa,       setPrograma]       = useState([]);
  const [embarques,      setEmbarques]      = useState([]);
  const [liquidaciones,  setLiquidaciones]  = useState([]);

  // Maestros (solo lectura para los selects del form). Se re-fetchan cada
  // vez que el usuario entra a un tab que los necesita, así reflejan
  // ediciones recientes en Maestros sin necesidad de recargar la página.
  const [especies,       setEspecies]       = useState([]);
  const [paises,         setPaises]         = useState([]);
  const [monedas,        setMonedas]        = useState([]);
  const [mercados,       setMercados]       = useState([]);
  const [tiposEmbalaje,  setTiposEmbalaje]  = useState([]);
  const [ciudades,       setCiudades]       = useState([]);
  const [temporadas,     setTemporadas]     = useState(TEMPORADAS_DEFAULT);

  const [cargando, setCargando] = useState(true);
  const [tab, setTab] = useState("clientes");
  const [guardando, setGuardando] = useState({});
  const [importando, setImportando] = useState(false);

  // UI Clientes
  const [busquedaCli, setBusquedaCli] = useState("");
  const [filtroMercadoCli, setFiltroMercadoCli] = useState("");
  const [filtroEspecieCli, setFiltroEspecieCli] = useState("");
  const [filtroActivoCli, setFiltroActivoCli] = useState("activos");
  const [editandoCli, setEditandoCli] = useState(null); // cliente en edición (objeto) o null
  const [creandoCli, setCreandoCli] = useState(false);

  // UI Exportadoras
  const [busquedaExp, setBusquedaExp] = useState("");
  const [filtroPaisExp, setFiltroPaisExp] = useState("");
  const [filtroEspecieExp, setFiltroEspecieExp] = useState("");
  const [filtroActivoExp, setFiltroActivoExp] = useState("activos");
  const [editandoExp, setEditandoExp] = useState(null);
  const [creandoExp, setCreandoExp] = useState(false);

  // UI Business Closures
  const [busquedaClosure, setBusquedaClosure]         = useState("");
  const [filtroExpClosure, setFiltroExpClosure]       = useState("");
  const [filtroCliClosure, setFiltroCliClosure]       = useState("");
  const [filtroEspClosure, setFiltroEspClosure]       = useState("");
  const [filtroEstadoClosure, setFiltroEstadoClosure] = useState("activo");
  const [editandoClosure, setEditandoClosure]         = useState(null);
  const [creandoClosure, setCreandoClosure]           = useState(false);

  // ── Carga inicial ──
  useEffect(()=>{
    let alive = true;
    (async ()=>{
      const [cli, exp, con, pro, emb, liq, esp, pa, mo, me, tb, ci, tmp] = await Promise.all([
        dbLoadGeneric("frisku_clientes"),
        dbLoadGeneric("frisku_exportadoras"),
        dbLoadGeneric("frisku_contratos"),
        dbLoadGeneric("frisku_programa"),
        dbLoadGeneric("frisku_embarques"),
        dbLoadGeneric("frisku_liquidaciones"),
        dbLoadGeneric("maestro_especies"),
        dbLoadGeneric("maestro_paises"),
        dbLoadGeneric("maestro_monedas"),
        dbLoadGeneric("maestro_mercados"),
        dbLoadGeneric("maestro_tipos_embalaje"),
        dbLoadGeneric("maestro_ciudades"),
        dbLoadGeneric("maestro_temporadas"),
      ]);
      if(!alive) return;
      setClientes(Array.isArray(cli) ? cli : []);
      setExportadoras(Array.isArray(exp) ? exp : []);
      setContratos(Array.isArray(con) ? con : []);
      setPrograma(Array.isArray(pro) ? pro : []);
      setEmbarques(Array.isArray(emb) ? emb : []);
      setLiquidaciones(Array.isArray(liq) ? liq : []);
      // Fallback a los DEFAULT cuando Supabase aún no tiene la fila del
      // maestro o está vacía. Mantiene el mismo comportamiento que
      // FriskuModule (Maestros) para que el form de Cliente nunca aparezca
      // con selects vacíos en una instalación nueva.
      setEspecies(Array.isArray(esp) && esp.length ? esp : ESPECIES_DEFAULT);
      setPaises(Array.isArray(pa) && pa.length ? pa : PAISES_DEFAULT);
      setMonedas(Array.isArray(mo) && mo.length ? mo : MONEDAS_DEFAULT);
      setMercados(Array.isArray(me) && me.length ? me : MERCADOS_DEFAULT);
      setTiposEmbalaje(Array.isArray(tb) && tb.length ? tb : TIPOS_EMBALAJE_DEFAULT);
      setCiudades(Array.isArray(ci) && ci.length ? ci : CIUDADES_DEFAULT);
      if(Array.isArray(tmp) && tmp.length) setTemporadas(tmp);
      setCargando(false);
    })();
    return ()=>{alive=false;};
  },[]);

  // ── Recarga manual de maestros ──
  // Se ejecuta al navegar a tabs que dependen de los selects (Clientes,
  // Exportadoras). Garantiza que las altas/cambios hechos en el módulo
  // de Maestros se reflejen sin necesidad de recargar la página.
  const recargarMaestros = useCallback(async ()=>{
    const [esp, pa, mo, me, tb, ci, tmp] = await Promise.all([
      dbLoadGeneric("maestro_especies"),
      dbLoadGeneric("maestro_paises"),
      dbLoadGeneric("maestro_monedas"),
      dbLoadGeneric("maestro_mercados"),
      dbLoadGeneric("maestro_tipos_embalaje"),
      dbLoadGeneric("maestro_ciudades"),
      dbLoadGeneric("maestro_temporadas"),
    ]);
    setEspecies(Array.isArray(esp) && esp.length ? esp : ESPECIES_DEFAULT);
    setPaises(Array.isArray(pa) && pa.length ? pa : PAISES_DEFAULT);
    setMonedas(Array.isArray(mo) && mo.length ? mo : MONEDAS_DEFAULT);
    setMercados(Array.isArray(me) && me.length ? me : MERCADOS_DEFAULT);
    setTiposEmbalaje(Array.isArray(tb) && tb.length ? tb : TIPOS_EMBALAJE_DEFAULT);
    setCiudades(Array.isArray(ci) && ci.length ? ci : CIUDADES_DEFAULT);
    if(Array.isArray(tmp) && tmp.length) setTemporadas(tmp);
  },[]);

  // Refrescar maestros al entrar a tabs que los necesitan
  useEffect(()=>{
    if (cargando) return;
    if (tab === "clientes" || tab === "exportadoras" || tab === "contratos") {
      recargarMaestros();
    }
  },[tab, cargando, recargarMaestros]);

  // ── Auto-save genérico ──
  const useAutoSave = (id, valor, listo=true) => {
    const timer = useRef(null);
    const primero = useRef(true);
    useEffect(()=>{
      if(cargando || !listo) return;
      if(primero.current) { primero.current = false; return; }
      if(timer.current) clearTimeout(timer.current);
      setGuardando(g => ({...g, [id]:true}));
      timer.current = setTimeout(async ()=>{
        await dbSaveGeneric(id, valor);
        setGuardando(g => ({...g, [id]:false}));
      }, 1000);
    },[valor]);
  };
  useAutoSave("frisku_clientes", clientes);
  useAutoSave("frisku_exportadoras", exportadoras);
  useAutoSave("frisku_contratos", contratos);
  useAutoSave("frisku_programa", programa);
  useAutoSave("frisku_embarques", embarques);
  useAutoSave("frisku_liquidaciones", liquidaciones);

  // ── Filtrado de clientes ──
  const clientesFiltrados = useMemo(()=>{
    const q = busquedaCli.trim().toLowerCase();
    return clientes.filter(c => {
      if(filtroActivoCli === "activos" && c.activo === false) return false;
      if(filtroActivoCli === "inactivos" && c.activo !== false) return false;
      if(filtroMercadoCli && c.mercadoCodigo !== filtroMercadoCli) return false;
      if(filtroEspecieCli && !(c.especiesCodigos||[]).includes(filtroEspecieCli)) return false;
      if(q) {
        const txt = `${c.nombre||""} ${c.ciudad||""} ${c.observ||""}`.toLowerCase();
        if(!txt.includes(q)) return false;
      }
      return true;
    }).sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||""));
  },[clientes, busquedaCli, filtroMercadoCli, filtroEspecieCli, filtroActivoCli]);

  // ── Handlers clientes ──
  const handleNuevoCliente = () => {
    setCreandoCli(true);
    setEditandoCli({
      id: "",
      nombre: "",
      paisCodigo: "",
      ciudad: "",
      mercadoCodigo: "",
      monedaCodigo: "USD",
      contactos: [],
      especiesCodigos: [],
      comisionGlobalSobreFOB: 8,
      comisionFriskuSobreClienteGlobal: 25,
      comisionOverrides: {},
      documentos: [],
      activo: true,
      observ: "",
      fechaCreacion: new Date().toISOString(),
      fechaActualizacion: new Date().toISOString(),
    });
  };
  const handleEditarCliente = (cliente) => {
    setCreandoCli(false);
    setEditandoCli(cliente);
  };
  const handleEliminarCliente = (cliente) => {
    if(!window.confirm(`¿Eliminar cliente "${cliente.nombre}"? Esta acción no se puede deshacer.`)) return;
    setClientes(prev => prev.filter(c => c.id !== cliente.id));
  };
  const handleGuardarCliente = (cli) => {
    if(creandoCli) {
      const nuevo = {...cli, id: uid()};
      setClientes(prev => [...prev, nuevo]);
    } else {
      setClientes(prev => prev.map(c => c.id === cli.id ? cli : c));
    }
    setEditandoCli(null);
    setCreandoCli(false);
  };

  const totalClientesActivos = clientes.filter(c => c.activo !== false).length;

  // Permisos derivados por tab del módulo comercial
  const permDashboard     = permTab("dashboard");
  const permClientes      = permTab("clientes");
  const permExportadoras  = permTab("exportadoras");
  const permDocumentos    = permTab("documentos");
  const permContratos     = permTab("contratos");
  const permPrograma      = permTab("programa");
  const permEmbarques     = permTab("embarques");
  const permLiquidaciones = permTab("liquidaciones");
  const permMaestros      = permTab("maestros");

  // ── Filtrado de exportadoras ──
  const exportadorasFiltradas = useMemo(()=>{
    const q = busquedaExp.trim().toLowerCase();
    return exportadoras.filter(e => {
      if(filtroActivoExp === "activos" && e.activo === false) return false;
      if(filtroActivoExp === "inactivos" && e.activo !== false) return false;
      if(filtroPaisExp && e.paisCodigo !== filtroPaisExp) return false;
      if(filtroEspecieExp && !(e.especiesProduce||[]).includes(filtroEspecieExp)) return false;
      if(q) {
        const txt = `${e.nombre||""} ${e.ciudad||""} ${e.rut||""} ${e.observ||""}`.toLowerCase();
        if(!txt.includes(q)) return false;
      }
      return true;
    }).sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||""));
  },[exportadoras, busquedaExp, filtroPaisExp, filtroEspecieExp, filtroActivoExp]);

  // ── Handlers exportadoras ──
  const handleNuevaExportadora = () => {
    setCreandoExp(true);
    setEditandoExp({
      id: "",
      nombre: "",
      rut: "",
      paisCodigo: "",
      ciudad: "",
      direccion: "",
      monedaCodigo: "USD",
      contactos: [],
      especiesProduce: [],
      certificaciones: "",
      activo: true,
      observ: "",
      fechaCreacion: new Date().toISOString(),
      fechaActualizacion: new Date().toISOString(),
    });
  };
  const handleEditarExportadora = (exp) => {
    setCreandoExp(false);
    setEditandoExp(exp);
  };
  const handleEliminarExportadora = (exp) => {
    if(!window.confirm(`¿Eliminar exportadora "${exp.nombre}"? Esta acción no se puede deshacer.`)) return;
    setExportadoras(prev => prev.filter(e => e.id !== exp.id));
  };
  const handleGuardarExportadora = (exp) => {
    if(creandoExp) {
      const nueva = {...exp, id: uid()};
      setExportadoras(prev => [...prev, nueva]);
    } else {
      setExportadoras(prev => prev.map(e => e.id === exp.id ? exp : e));
    }
    setEditandoExp(null);
    setCreandoExp(false);
  };

  const totalExportadorasActivas = exportadoras.filter(e => e.activo !== false).length;

  // ── Handler importación Excel ──
  const handleAplicarImport = ({clientes:cliNuevos, exportadoras:expNuevas}) => {
    setClientes(cliNuevos);
    setExportadoras(expNuevas);
  };

  // ── Filtrado y handlers Business Closures ──
  const closuresFiltrados = useMemo(()=>{
    const q = busquedaClosure.trim().toLowerCase();
    return contratos.filter(bc=>{
      if(filtroExpClosure && bc.exportadoraId !== filtroExpClosure) return false;
      if(filtroCliClosure && bc.clienteId     !== filtroCliClosure) return false;
      if(filtroEspClosure && bc.especieCodigo !== filtroEspClosure) return false;
      if(filtroEstadoClosure !== "todos" && (bc.estado||"activo") !== filtroEstadoClosure) return false;
      if(q){
        const exp = exportadoras.find(e=>e.id===bc.exportadoraId)?.nombre||"";
        const cli = clientes.find(c=>c.id===bc.clienteId)?.nombre||"";
        const txt = `${bc.temporada||""} ${bc.codigo||""} ${exp} ${cli}`.toLowerCase();
        if(!txt.includes(q)) return false;
      }
      return true;
    }).sort((a,b)=>(b.fechaCreacion||"").localeCompare(a.fechaCreacion||""));
  },[contratos, busquedaClosure, filtroExpClosure, filtroCliClosure, filtroEspClosure, filtroEstadoClosure, exportadoras, clientes]);

  const handleNuevoClosure = () => {
    setCreandoClosure(true);
    setEditandoClosure({
      id:"", codigo:"", temporada:"", exportadoraId:"", clienteId:"",
      especieCodigo:"", cajasPorFormato:{}, precioRef:null,
      monedaCodigo:"USD", condiciones:"FOB",
      fechaInicio:"", fechaFin:"", estado:"activo", observ:"",
      fechaCreacion:new Date().toISOString(), fechaActualizacion:new Date().toISOString(),
    });
  };
  const handleEditarClosure  = (bc) => { setCreandoClosure(false); setEditandoClosure(bc); };
  const handleEliminarClosure = (bc) => {
    if(!window.confirm(`¿Eliminar Business Closure "${bc.temporada}"?`)) return;
    setContratos(prev=>prev.filter(c=>c.id!==bc.id));
  };
  const handleGuardarClosure = (bc) => {
    if(creandoClosure) setContratos(prev=>[...prev, {...bc, id:uid()}]);
    else               setContratos(prev=>prev.map(c=>c.id===bc.id?bc:c));
    setEditandoClosure(null); setCreandoClosure(false);
  };
  const totalClosuresActivos = contratos.filter(c=>(c.estado||"activo")==="activo").length;

  // ── UI Programa Comercial ──
  const [filtroProgramaTemp, setFiltroProgramaTemp] = useState("");
  const [filtroProgramaExp,  setFiltroProgramaExp]  = useState("");
  const [filtroProgramaCli,  setFiltroProgramaCli]  = useState("");
  const [filtroProgramaEsp,  setFiltroProgramaEsp]  = useState("");
  const [editandoSemana,     setEditandoSemana]     = useState(null);
  const [closureIdParaSemana,setClosureIdParaSemana]= useState(null);

  const closuresParaPrograma = useMemo(()=>{
    return contratos.filter(bc=>{
      if(filtroProgramaTemp && bc.temporada    !== filtroProgramaTemp) return false;
      if(filtroProgramaExp  && bc.exportadoraId!== filtroProgramaExp)  return false;
      if(filtroProgramaCli  && bc.clienteId    !== filtroProgramaCli)  return false;
      if(filtroProgramaEsp  && bc.especieCodigo!== filtroProgramaEsp)  return false;
      return true;
    }).sort((a,b)=>{
      if(b.temporada !== a.temporada) return (b.temporada||"").localeCompare(a.temporada||"");
      const eA = exportadoras.find(e=>e.id===a.exportadoraId)?.nombre||"";
      const eB = exportadoras.find(e=>e.id===b.exportadoraId)?.nombre||"";
      return eA.localeCompare(eB);
    });
  },[contratos, filtroProgramaTemp, filtroProgramaExp, filtroProgramaCli, filtroProgramaEsp, exportadoras]);

  const semanasPorClosure = useMemo(()=>{
    const mapa = {};
    programa.forEach(s=>{
      if(!mapa[s.closureId]) mapa[s.closureId]=[];
      mapa[s.closureId].push(s);
    });
    return mapa;
  },[programa]);

  const handleAgregarSemana = (closureId) => {
    const hoyLocal = new Date().toISOString().slice(0,10);
    setClosureIdParaSemana(closureId);
    setEditandoSemana({
      id:"", closureId,
      fechaSemana: getMondayStr(hoyLocal),
      cajasPorFormato:{}, estado:"borrador", observ:"",
      fechaCreacion: new Date().toISOString(),
    });
  };
  const handleEditarSemana  = (sem) => { setClosureIdParaSemana(sem.closureId); setEditandoSemana(sem); };
  const handleEliminarSemana = (sem) => {
    if(!window.confirm("¿Eliminar esta semana del programa?")) return;
    setPrograma(prev=>prev.filter(s=>s.id!==sem.id));
  };
  const handleGuardarSemana = (sem) => {
    const semFinal = {...sem, fechaSemana:getMondayStr(sem.fechaSemana), fechaActualizacion:new Date().toISOString()};
    if(!sem.id) setPrograma(prev=>[...prev, {...semFinal, id:uid()}]);
    else        setPrograma(prev=>prev.map(s=>s.id===sem.id?semFinal:s));
    setEditandoSemana(null); setClosureIdParaSemana(null);
  };
  const handleCancelarSemana = () => { setEditandoSemana(null); setClosureIdParaSemana(null); };

  const hoy = new Date().toISOString().slice(0,10);
  const clientesConDocsFaltantes = clientes.filter(c =>
    c.activo !== false && TIPOS_DOC_MINIMOS.some(t => !(c.documentos||[]).some(d=>d.tipo===t&&d.url))
  ).length;

  // ── Tabs (lista filtrada por permisos) ──
  // Se declara antes de los early returns para que el useEffect siguiente
  // respete las rules of hooks.
  const tabsAll = [
    {id:"dashboard",     label:"📊 Dashboard",     count:null,                              perm:permDashboard},
    {id:"clientes",      label:"👥 Clientes",      count:totalClientesActivos,              perm:permClientes},
    {id:"exportadoras",  label:"🏭 Exportadoras",  count:totalExportadorasActivas,          perm:permExportadoras},
    {id:"documentos",    label:"📁 Documentos",    count:clientesConDocsFaltantes||null,    perm:permDocumentos},
    {id:"contratos",     label:"📄 Contratos",     count:totalClosuresActivos||null,        perm:permContratos},
    {id:"programa",      label:"📅 Programa",      count:programa.length||null,             perm:permPrograma},
    {id:"embarques",     label:"🚢 Embarques",     count:embarques.length||null,            perm:permEmbarques},
    {id:"liquidaciones", label:"💰 Liquidaciones", count:liquidaciones.length||null,        perm:permLiquidaciones},
    {id:"maestros",      label:"🗂️ Maestros + TC", count:null,                              perm:permMaestros},
  ];
  const tabs = tabsAll.filter(t => t.perm.visible);

  // Si el tab activo no es visible para este usuario, saltar al primero accesible
  useEffect(()=>{
    if (cargando) return;
    if (!tabs.find(t => t.id === tab) && tabs.length) {
      setTab(tabs[0].id);
    }
  },[tabs, tab, cargando]);

  // ── Render ──
  if(cargando) {
    return (
      <div style={{padding:40, textAlign:"center", color:C.muted, background:C.bg, minHeight:"100vh"}}>
        Cargando módulo Frisku Foods…
      </div>
    );
  }

  if (!tabs.length) {
    return (
      <div style={{padding:40, textAlign:"center", color:C.muted, background:C.bg, minHeight:"100vh"}}>
        Sin acceso a ningún tab de Frisku Foods. Contacta al administrador.
        {onBack && <div style={{marginTop:14}}><button onClick={onBack} style={btnSt(C.muted, true)}>← Volver</button></div>}
      </div>
    );
  }

  return (
    <div style={{background:C.bg, minHeight:"100vh", color:C.text}}>
      {/* Header */}
      <div style={{padding:"12px 20px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10, background:C.bg2}}>
        <div style={{display:"flex", alignItems:"center", gap:14}}>
          <img
            src={`${process.env.PUBLIC_URL}/frisku.png`}
            alt="Frisku Foods"
            style={{height:44, objectFit:"contain", borderRadius:6}}
          />
          <div>
            <h2 style={{margin:0, fontSize:18, fontWeight:800, color:C.text, lineHeight:1.2}}>Frisku Foods</h2>
            <div style={{fontSize:11, color:C.muted, fontWeight:400}}>Connecting Quality</div>
          </div>
        </div>
        <div style={{display:"flex", alignItems:"center", gap:10, fontSize:11, color:C.muted}}>
          {Object.values(guardando).some(Boolean)
            ? <span style={{color:C.yellow}}>💾 Guardando...</span>
            : <span style={{color:C.green}}>● Sincronizado</span>}
          {onBack && <button onClick={onBack} style={btnSt(C.muted, true)}>← Volver</button>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex", flexWrap:"wrap", gap:4, padding:"0 20px", borderBottom:`2px solid ${C.border}`, background:C.bg2}}>
        {tabs.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{
              padding:"11px 16px", border:"none", cursor:"pointer", fontSize:12,
              background: tab===t.id ? C.card : "transparent",
              color: tab===t.id ? C.text : C.muted,
              fontWeight: tab===t.id ? 700 : 500,
              borderBottom: tab===t.id ? `3px solid ${C.blue}` : "3px solid transparent",
              marginBottom:-2, borderRadius:"6px 6px 0 0",
              display:"flex", alignItems:"center", gap:6,
            }}>
            <span>{t.label}</span>
            {t.count != null && (
              <span style={{
                fontSize:9, padding:"1px 6px", borderRadius:8,
                background: t.id==="documentos" ? C.accent : tab===t.id ? C.blue : C.border,
                color:"#fff", fontWeight:700,
              }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div style={{padding: tab==="maestros" ? 0 : 20}}>

        {tab === "dashboard" && (
          <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:14}}>
            <Card title="Importar datos" icon="📥">
              <div style={{color:C.muted, fontSize:11, lineHeight:1.6, marginBottom:12}}>
                Carga masiva de Clientes, Exportadoras, Notify y Consignatarios desde
                un archivo Excel. Merge no destructivo.
              </div>
              {canEditGlobal ? (
                <button onClick={()=>setImportando(true)} style={{...btnSt(C.blue), padding:"8px 14px", fontSize:12}}>
                  📥 Importar Excel
                </button>
              ) : (
                <div style={{fontSize:11, color:C.muted2}}>Sin permisos de edición</div>
              )}
            </Card>
            <Card title="Clientes" icon="👥">
              <div style={{fontSize:32, fontWeight:800, color:C.green}}>{totalClientesActivos}</div>
              <div style={{color:C.muted, fontSize:11}}>activos de {clientes.length} totales</div>
            </Card>
            <Card title="Exportadoras" icon="🏭">
              <div style={{fontSize:32, fontWeight:800, color:C.blue}}>{totalExportadorasActivas}</div>
              <div style={{color:C.muted, fontSize:11}}>activas de {exportadoras.length} totales</div>
            </Card>
            <Card title="Embarques" icon="🚢">
              <div style={{fontSize:32, fontWeight:800, color:C.teal}}>{embarques.length}</div>
              <div style={{color:C.muted, fontSize:11}}>Fase 4 pendiente</div>
            </Card>
            <Card title="Especies cargadas" icon="🍒">
              <div style={{fontSize:32, fontWeight:800, color:C.yellow}}>{especies.length}</div>
              <div style={{color:C.muted, fontSize:11}}>en maestro</div>
            </Card>
            <Card title="Documentos faltantes" icon="📁">
              <div style={{fontSize:32, fontWeight:800, color: clientesConDocsFaltantes > 0 ? C.accent : C.green}}>
                {clientesConDocsFaltantes}
              </div>
              <div style={{color:C.muted, fontSize:11}}>
                cliente{clientesConDocsFaltantes!==1?"s":""} sin docs obligatorios
              </div>
            </Card>
            <Card title="Plan Frisku" icon="🗺️">
              <div style={{fontSize:11, color:C.text, lineHeight:1.6}}>
                <div>✅ Fase 1 — Maestros</div>
                <div>✅ Fase 2 — Clientes + TC</div>
                <div style={{color:C.yellow}}>🛠️ Fase 3 — Documentos <em>(en curso)</em></div>
                <div style={{color:C.muted}}>⏳ Fase 4 — Embarques</div>
                <div style={{color:C.muted}}>⏳ Fase 5 — COMEX</div>
                <div style={{color:C.muted}}>⏳ Fase 6 — Liquidaciones</div>
              </div>
            </Card>
          </div>
        )}

        {tab === "clientes" && (
          <div>
            {/* Toolbar */}
            <div style={{display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems:"center"}}>
              <input value={busquedaCli} onChange={e=>setBusquedaCli(e.target.value)}
                placeholder="Buscar cliente..." style={{...inputSt, flex:"1 1 240px", maxWidth:300}}/>
              <select value={filtroMercadoCli} onChange={e=>setFiltroMercadoCli(e.target.value)} style={{...inputSt, maxWidth:200}}>
                <option value="">— Todos los mercados —</option>
                {mercados.map(m => <option key={m.codigo} value={m.codigo}>{m.nombre}</option>)}
              </select>
              <select value={filtroEspecieCli} onChange={e=>setFiltroEspecieCli(e.target.value)} style={{...inputSt, maxWidth:200}}>
                <option value="">— Todas las especies —</option>
                {especies.map(e => <option key={e.codigo} value={e.codigo}>{e.icono} {e.nombreEs}</option>)}
              </select>
              <select value={filtroActivoCli} onChange={e=>setFiltroActivoCli(e.target.value)} style={{...inputSt, maxWidth:140}}>
                <option value="activos">● Activos</option>
                <option value="inactivos">○ Inactivos</option>
                <option value="todos">Todos</option>
              </select>
              <span style={{fontSize:11, color:C.muted}}>
                {clientesFiltrados.length} de {clientes.length}
              </span>
              {permClientes.canEdit && !editandoCli && (
                <button onClick={handleNuevoCliente} style={{...btnSt(C.green), marginLeft:"auto"}}>
                  + Nuevo cliente
                </button>
              )}
              {!permClientes.canEdit && (
                <span style={{fontSize:10, padding:"3px 8px", borderRadius:4, background:`${C.blue}22`, color:C.blue, border:`1px solid ${C.blue}44`}}>
                  👁 Solo lectura
                </span>
              )}
            </div>

            {/* Form de edición/creación */}
            {editandoCli && (
              <ClienteForm
                cliente={editandoCli}
                especies={especies}
                paises={paises}
                ciudades={ciudades}
                monedas={monedas}
                mercados={mercados}
                tiposEmbalaje={tiposEmbalaje}
                onGuardar={handleGuardarCliente}
                onCancelar={()=>{setEditandoCli(null); setCreandoCli(false);}}
              />
            )}

            {/* Grid de cards */}
            {!editandoCli && (
              clientesFiltrados.length === 0 ? (
                <div style={{padding:50, textAlign:"center", color:C.muted, fontSize:13, background:C.card, borderRadius:14}}>
                  {clientes.length === 0
                    ? "Aún no hay clientes. Click \"+ Nuevo cliente\" para crear el primero."
                    : "Sin resultados con esos filtros."}
                </div>
              ) : (
                <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(380px, 1fr))", gap:14}}>
                  {clientesFiltrados.map(c => (
                    <ClienteCard key={c.id}
                      cliente={c}
                      especies={especies}
                      paises={paises}
                      monedas={monedas}
                      mercados={mercados}
                      onEditar={()=>handleEditarCliente(c)}
                      onEliminar={()=>handleEliminarCliente(c)}
                      canEdit={permClientes.canEdit}
                    />
                  ))}
                </div>
              )
            )}
          </div>
        )}

        {tab === "exportadoras" && (
          <div>
            {/* Toolbar */}
            <div style={{display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems:"center"}}>
              <input value={busquedaExp} onChange={e=>setBusquedaExp(e.target.value)}
                placeholder="Buscar exportadora..." style={{...inputSt, flex:"1 1 240px", maxWidth:300}}/>
              <select value={filtroPaisExp} onChange={e=>setFiltroPaisExp(e.target.value)} style={{...inputSt, maxWidth:200}}>
                <option value="">— Todos los países —</option>
                {paises.map(p => <option key={p.codigo} value={p.codigo}>{p.flag} {p.nombreEs}</option>)}
              </select>
              <select value={filtroEspecieExp} onChange={e=>setFiltroEspecieExp(e.target.value)} style={{...inputSt, maxWidth:200}}>
                <option value="">— Todas las especies —</option>
                {especies.map(e => <option key={e.codigo} value={e.codigo}>{e.icono} {e.nombreEs}</option>)}
              </select>
              <select value={filtroActivoExp} onChange={e=>setFiltroActivoExp(e.target.value)} style={{...inputSt, maxWidth:140}}>
                <option value="activos">● Activas</option>
                <option value="inactivos">○ Inactivas</option>
                <option value="todos">Todas</option>
              </select>
              <span style={{fontSize:11, color:C.muted}}>
                {exportadorasFiltradas.length} de {exportadoras.length}
              </span>
              {permExportadoras.canEdit && !editandoExp && (
                <button onClick={handleNuevaExportadora} style={{...btnSt(C.green), marginLeft:"auto"}}>
                  + Nueva exportadora
                </button>
              )}
              {!permExportadoras.canEdit && (
                <span style={{fontSize:10, padding:"3px 8px", borderRadius:4, background:`${C.blue}22`, color:C.blue, border:`1px solid ${C.blue}44`}}>
                  👁 Solo lectura
                </span>
              )}
            </div>

            {/* Form de edición/creación */}
            {editandoExp && (
              <ExportadoraForm
                exportadora={editandoExp}
                especies={especies}
                paises={paises}
                ciudades={ciudades}
                monedas={monedas}
                onGuardar={handleGuardarExportadora}
                onCancelar={()=>{setEditandoExp(null); setCreandoExp(false);}}
              />
            )}

            {/* Grid de cards */}
            {!editandoExp && (
              exportadorasFiltradas.length === 0 ? (
                <div style={{padding:50, textAlign:"center", color:C.muted, fontSize:13, background:C.card, borderRadius:14}}>
                  {exportadoras.length === 0
                    ? "Aún no hay exportadoras. Click \"+ Nueva exportadora\" para crear la primera."
                    : "Sin resultados con esos filtros."}
                </div>
              ) : (
                <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(380px, 1fr))", gap:14}}>
                  {exportadorasFiltradas.map(e => (
                    <ExportadoraCard key={e.id}
                      exportadora={e}
                      especies={especies}
                      paises={paises}
                      monedas={monedas}
                      onEditar={()=>handleEditarExportadora(e)}
                      onEliminar={()=>handleEliminarExportadora(e)}
                      canEdit={permExportadoras.canEdit}
                    />
                  ))}
                </div>
              )
            )}
          </div>
        )}
        {tab === "documentos" && (
          <DocumentosTab
            clientes={clientes}
            canEdit={permDocumentos.canEdit}
          />
        )}

        {tab === "contratos" && (
          <div>
            {/* Toolbar */}
            <div style={{display:"flex", gap:8, marginBottom:16, flexWrap:"wrap", alignItems:"center"}}>
              <input value={busquedaClosure} onChange={e=>setBusquedaClosure(e.target.value)}
                placeholder="Buscar temporada, código, empresa…" style={{...inputSt, flex:"1 1 220px", maxWidth:280}}/>
              <select value={filtroExpClosure} onChange={e=>setFiltroExpClosure(e.target.value)} style={{...inputSt, maxWidth:190}}>
                <option value="">— Exportadora —</option>
                {exportadoras.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
              <select value={filtroCliClosure} onChange={e=>setFiltroCliClosure(e.target.value)} style={{...inputSt, maxWidth:190}}>
                <option value="">— Cliente —</option>
                {clientes.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              <select value={filtroEspClosure} onChange={e=>setFiltroEspClosure(e.target.value)} style={{...inputSt, maxWidth:170}}>
                <option value="">— Especie —</option>
                {especies.map(e=><option key={e.codigo} value={e.codigo}>{e.icono} {e.nombreEs}</option>)}
              </select>
              <select value={filtroEstadoClosure} onChange={e=>setFiltroEstadoClosure(e.target.value)} style={{...inputSt, maxWidth:130}}>
                <option value="activo">● Activos</option>
                <option value="cerrado">✓ Cerrados</option>
                <option value="cancelado">✗ Cancelados</option>
                <option value="todos">Todos</option>
              </select>
              <span style={{fontSize:11, color:C.muted}}>{closuresFiltrados.length} de {contratos.length}</span>
              {permContratos.canEdit && !editandoClosure && (
                <button onClick={handleNuevoClosure} style={{...btnSt(C.green), marginLeft:"auto"}}>
                  + Nuevo Business Closure
                </button>
              )}
              {!permContratos.canEdit && (
                <span style={{fontSize:10, padding:"3px 8px", borderRadius:4, background:`${C.blue}22`, color:C.blue, border:`1px solid ${C.blue}44`}}>
                  👁 Solo lectura
                </span>
              )}
            </div>

            {/* Form */}
            {editandoClosure && (
              <ClosureForm
                closure={editandoClosure}
                exportadoras={exportadoras}
                clientes={clientes}
                especies={especies}
                tiposEmbalaje={tiposEmbalaje}
                monedas={monedas}
                temporadas={temporadas}
                onGuardar={handleGuardarClosure}
                onCancelar={()=>{setEditandoClosure(null); setCreandoClosure(false);}}
              />
            )}

            {/* Grid de cards */}
            {!editandoClosure && (
              closuresFiltrados.length===0 ? (
                <div style={{padding:50, textAlign:"center", color:C.muted, fontSize:13, background:C.card, borderRadius:14}}>
                  {contratos.length===0
                    ? "Sin Business Closures. Click \"+ Nuevo Business Closure\" para crear el primero."
                    : "Sin resultados con esos filtros."}
                </div>
              ) : (
                <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(400px, 1fr))", gap:14}}>
                  {closuresFiltrados.map(bc=>(
                    <ClosureCard key={bc.id}
                      closure={bc}
                      exportadoras={exportadoras}
                      clientes={clientes}
                      especies={especies}
                      tiposEmbalaje={tiposEmbalaje}
                      monedas={monedas}
                      onEditar={()=>handleEditarClosure(bc)}
                      onEliminar={()=>handleEliminarClosure(bc)}
                      canEdit={permContratos.canEdit}
                    />
                  ))}
                </div>
              )
            )}
          </div>
        )}
        {tab === "programa" && (
          <div>
            {/* Filtros */}
            <div style={{display:"flex", flexWrap:"wrap", gap:8, marginBottom:16, alignItems:"center"}}>
              <select value={filtroProgramaTemp} onChange={e=>setFiltroProgramaTemp(e.target.value)} style={{...inputSt, maxWidth:160, fontSize:11}}>
                <option value="">Todas las temporadas</option>
                {temporadas.map(t=><option key={t} value={t}>Temporada {t}</option>)}
              </select>
              <select value={filtroProgramaExp} onChange={e=>setFiltroProgramaExp(e.target.value)} style={{...inputSt, maxWidth:180, fontSize:11}}>
                <option value="">Todas las exportadoras</option>
                {exportadoras.filter(e=>e.activo!==false).sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||"")).map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
              <select value={filtroProgramaCli} onChange={e=>setFiltroProgramaCli(e.target.value)} style={{...inputSt, maxWidth:180, fontSize:11}}>
                <option value="">Todos los clientes</option>
                {clientes.filter(c=>c.activo!==false).sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||"")).map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              <select value={filtroProgramaEsp} onChange={e=>setFiltroProgramaEsp(e.target.value)} style={{...inputSt, maxWidth:140, fontSize:11}}>
                <option value="">Todas las especies</option>
                {especies.map(e=><option key={e.codigo} value={e.codigo}>{e.icono} {e.nombreEs}</option>)}
              </select>
              {(filtroProgramaTemp||filtroProgramaExp||filtroProgramaCli||filtroProgramaEsp) && (
                <button onClick={()=>{setFiltroProgramaTemp(""); setFiltroProgramaExp(""); setFiltroProgramaCli(""); setFiltroProgramaEsp("");}}
                  style={{...btnSt(C.muted,true), fontSize:11}}>✕ Limpiar</button>
              )}
              <span style={{marginLeft:"auto", fontSize:11, color:C.muted}}>
                {closuresParaPrograma.length} Business Closure{closuresParaPrograma.length!==1?"s":""}
              </span>
            </div>

            {/* Paneles por closure */}
            {closuresParaPrograma.length === 0 ? (
              contratos.length === 0 ? (
                <div style={{padding:40, textAlign:"center", color:C.muted, fontSize:13}}>
                  No hay Business Closures registrados. Crea uno en el tab "📄 Contratos".
                </div>
              ) : (
                <div style={{padding:40, textAlign:"center", color:C.muted, fontSize:13}}>
                  Ningún Business Closure coincide con los filtros seleccionados.
                </div>
              )
            ) : (
              closuresParaPrograma.map(bc=>(
                <ClosureProgramaPanel
                  key={bc.id}
                  closure={bc}
                  semanas={semanasPorClosure[bc.id]||[]}
                  tiposEmbalaje={tiposEmbalaje}
                  exportadoras={exportadoras}
                  clientes={clientes}
                  especies={especies}
                  canEdit={permPrograma.canEdit}
                  editandoSemana={editandoSemana}
                  closureIdParaSemana={closureIdParaSemana}
                  onAgregarSemana={handleAgregarSemana}
                  onEditarSemana={handleEditarSemana}
                  onEliminarSemana={handleEliminarSemana}
                  onGuardarSemana={handleGuardarSemana}
                  onCancelarSemana={handleCancelarSemana}
                />
              ))
            )}
          </div>
        )}
        {tab === "embarques" && (
          <Placeholder
            titulo="Órdenes de Embarque"
            icono="🚢"
            fase="Fase 4"
            descripcion="Lifecycle completo: Business Closure → Programa → Orden de Embarque → Despacho (Packing List) → Carpeta COMEX → Liquidación."
          />
        )}
        {tab === "liquidaciones" && (
          <Placeholder
            titulo="Liquidaciones"
            icono="💰"
            fase="Fase 6"
            descripcion="Cálculo de la comisión Frisku por embarque, aplicando % cliente × % Frisku con overrides por especie+formato. Convierte montos a USD vía TC."
          />
        )}

        {tab === "maestros" && (
          <FriskuModule
            canEdit={permMaestros.canEdit}
            usuarioActual={usuarioActual}
            esAdmin={esAdmin}
            esSoloConsulta={esSoloConsulta}
            tabPermisos={tabPermisos}
            onBack={null}
            onLogout={onLogout}
          />
        )}
      </div>

      {importando && (
        <ImportadorExcelModal
          clientes={clientes}
          exportadoras={exportadoras}
          onAplicar={handleAplicarImport}
          onCerrar={()=>setImportando(false)}
        />
      )}
    </div>
  );
}
