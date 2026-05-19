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
} from "./FriskuModule.jsx";
import {
  dbLoadGeneric, dbSaveGeneric,
  calcularComisionFrisku, resolverPorcentajesComision,
  formatearMonto,
} from "./friskuHelpers.js";

// ── Paleta (consistente con FriskuModule) ──
const C = {
  bg:"#0d1117", bg2:"#161b22", card:"#1c2333", card2:"#21283b", border:"#30363d",
  text:"#e6edf3", muted:"#8b949e", muted2:"#484f58",
  blue:"#2563eb", green:"#16a34a", yellow:"#d97706", accent:"#b91c1c",
  teal:"#0f766e", purple:"#7c3aed",
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

  const handleGuardar = () => {
    if(!buf.nombre?.trim()) { alert("Nombre es requerido"); return; }
    onGuardar({...buf, fechaActualizacion: new Date().toISOString()});
  };

  const toggle = (id) => setSeccionAbierta(prev => prev === id ? "" : id);

  const especiesActivas = (buf.especiesCodigos||[]);
  const overrides = buf.comisionOverrides || {};
  // Solo permitimos overrides por especies que el cliente compra
  const especiesParaOverride = especies.filter(e => especiesActivas.includes(e.codigo));

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
          <strong style={{color:C.text}}>Modelo:</strong> el cliente cobra <em>X% sobre FOB</em> a la exportadora.
          Frisku recibe <em>Y%</em> de esa comisión.<br/>
          <span style={{color:C.yellow}}>Ejemplo Disney: cliente 8% × Frisku 25% = Frisku se queda con 2% del FOB.</span>
        </div>

        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:14}}>
          <div>
            <div style={lblSt}>% Cliente sobre FOB</div>
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
            <div style={lblSt}>% Frisku efectivo sobre FOB</div>
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

  const friSobreFOB = (Number(cliente.comisionGlobalSobreFOB)||0) * (Number(cliente.comisionFriskuSobreClienteGlobal)||0) / 100;
  const numOverrides = Object.keys(cliente.comisionOverrides||{}).length;

  return (
    <div style={{
      background:C.card2, padding:14, borderRadius:10, border:`1px solid ${cliente.activo===false?C.border:C.green+"66"}`,
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
          <div style={{color:C.muted, fontSize:9, textTransform:"uppercase"}}>Cliente s/FOB</div>
          <div style={{color:C.text, fontWeight:700, fontFamily:"monospace"}}>{(cliente.comisionGlobalSobreFOB??0).toFixed(2)}%</div>
        </div>
        <div>
          <div style={{color:C.muted, fontSize:9, textTransform:"uppercase"}}>Frisku s/cliente</div>
          <div style={{color:C.text, fontWeight:700, fontFamily:"monospace"}}>{(cliente.comisionFriskuSobreClienteGlobal??0).toFixed(2)}%</div>
        </div>
        <div>
          <div style={{color:C.muted, fontSize:9, textTransform:"uppercase"}}>Frisku s/FOB</div>
          <div style={{color:C.green, fontWeight:700, fontFamily:"monospace"}}>
            {friSobreFOB.toFixed(2)}%
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

  const [cargando, setCargando] = useState(true);
  const [tab, setTab] = useState("clientes");
  const [guardando, setGuardando] = useState({});

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

  // ── Carga inicial ──
  useEffect(()=>{
    let alive = true;
    (async ()=>{
      const [cli, exp, con, pro, emb, liq, esp, pa, mo, me, tb, ci] = await Promise.all([
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
      setCargando(false);
    })();
    return ()=>{alive=false;};
  },[]);

  // ── Recarga manual de maestros ──
  // Se ejecuta al navegar a tabs que dependen de los selects (Clientes,
  // Exportadoras). Garantiza que las altas/cambios hechos en el módulo
  // de Maestros se reflejen sin necesidad de recargar la página.
  const recargarMaestros = useCallback(async ()=>{
    const [esp, pa, mo, me, tb, ci] = await Promise.all([
      dbLoadGeneric("maestro_especies"),
      dbLoadGeneric("maestro_paises"),
      dbLoadGeneric("maestro_monedas"),
      dbLoadGeneric("maestro_mercados"),
      dbLoadGeneric("maestro_tipos_embalaje"),
      dbLoadGeneric("maestro_ciudades"),
    ]);
    setEspecies(Array.isArray(esp) && esp.length ? esp : ESPECIES_DEFAULT);
    setPaises(Array.isArray(pa) && pa.length ? pa : PAISES_DEFAULT);
    setMonedas(Array.isArray(mo) && mo.length ? mo : MONEDAS_DEFAULT);
    setMercados(Array.isArray(me) && me.length ? me : MERCADOS_DEFAULT);
    setTiposEmbalaje(Array.isArray(tb) && tb.length ? tb : TIPOS_EMBALAJE_DEFAULT);
    setCiudades(Array.isArray(ci) && ci.length ? ci : CIUDADES_DEFAULT);
  },[]);

  // Refrescar maestros al entrar a tabs que los necesitan
  useEffect(()=>{
    if (cargando) return;
    if (tab === "clientes" || tab === "exportadoras") {
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

  // ── Tabs (lista filtrada por permisos) ──
  // Se declara antes de los early returns para que el useEffect siguiente
  // respete las rules of hooks.
  const tabsAll = [
    {id:"dashboard",     label:"📊 Dashboard",     count:null,                      perm:permDashboard},
    {id:"clientes",      label:"👥 Clientes",      count:totalClientesActivos,      perm:permClientes},
    {id:"exportadoras",  label:"🏭 Exportadoras",  count:totalExportadorasActivas,  perm:permExportadoras},
    {id:"contratos",     label:"📄 Contratos",     count:contratos.length||null,    perm:permContratos},
    {id:"programa",      label:"📅 Programa",      count:programa.length||null,     perm:permPrograma},
    {id:"embarques",     label:"🚢 Embarques",     count:embarques.length||null,    perm:permEmbarques},
    {id:"liquidaciones", label:"💰 Liquidaciones", count:liquidaciones.length||null, perm:permLiquidaciones},
    {id:"maestros",      label:"🗂️ Maestros + TC", count:null,                      perm:permMaestros},
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
      <div style={{padding:"16px 20px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10, background:C.bg2}}>
        <div>
          <h2 style={{margin:0, fontSize:20, fontWeight:800, color:C.text, display:"flex", alignItems:"center", gap:10}}>
            🔗 <span>Frisku Foods</span>
            <span style={{fontSize:11, color:C.muted, fontWeight:500}}>Connecting Quality</span>
          </h2>
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
                background: tab===t.id ? C.blue : C.border,
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
            <Card title="Pares TC" icon="📈">
              <div style={{fontSize:32, fontWeight:800, color:C.purple}}>—</div>
              <div style={{color:C.muted, fontSize:11}}>ver tab Maestros + TC</div>
            </Card>
            <Card title="Plan Frisku" icon="🗺️">
              <div style={{fontSize:11, color:C.text, lineHeight:1.6}}>
                <div>✅ Fase 1 — Maestros</div>
                <div style={{color:C.yellow}}>🛠️ Fase 2 — Clientes + TC <em>(en curso)</em></div>
                <div style={{color:C.muted}}>⏳ Fase 3 — Checklist + archivos</div>
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
        {tab === "contratos" && (
          <Placeholder
            titulo="Contratos comerciales"
            icono="📄"
            fase="Fase 4"
            descripcion="Contratos entre exportadoras y clientes. Asocian especies, temporada, condiciones comerciales y documentación de respaldo. Se construye en detalle cuando se aborde el lifecycle de embarques."
          />
        )}
        {tab === "programa" && (
          <Placeholder
            titulo="Programa comercial semanal"
            icono="📅"
            fase="Fase 4"
            descripcion="Planificación semanal de envíos por exportadora × cliente × especie. Punto de partida para las Órdenes de Embarque."
          />
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
    </div>
  );
}
