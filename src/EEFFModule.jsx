/* eslint-disable */
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  parsearBalance, detectarFormatoBalance, fmtMonto, NOMBRES_MES,
  parsearPlanMaestro, clasificarCuentas,
  dbLoadPlanMaestro, dbSavePlanMaestro,
  guardarEEFF, cargarEEFF, eeffId,
} from './eeffHelpers.js';

const EMPRESAS = [
  'Mediterra','Allegria Foods','Allegria Service',
  'Frisku Foods','Integrity Farms','Osiris','Allpa Farms','Allpa Farms Perú'
];
const MESES = [1,2,3,4,5,6,7,8,9,10,11,12];

const C = {
  bg:'#0f172a', bg2:'#1e293b', card:'#1e293b', card2:'#263247',
  border:'#334155', text:'#f1f5f9', muted:'#64748b', muted2:'#475569',
  accent:'#06b6d4', accentL:'#67e8f9', green:'#22c55e', red:'#ef4444',
  yellow:'#f59e0b', blue:'#3b82f6', purple:'#a855f7',
};

// ── Mapeo categoriaIFRS → grupo de sección ──────────────────────────
const CAT_GRUPO = {
  'Efectivo y Equivalentes':'Activo Corriente',
  'Otros Activos Financieros Corrientes':'Activo Corriente',
  'CxC Comerciales y Otras':'Activo Corriente',
  'CxC a Productores':'Activo Corriente',
  'Anticipos a Productores':'Activo Corriente',
  'CxC Entidades Relacionadas':'Activo Corriente',
  'Inventarios':'Activo Corriente',
  'Inventarios Agrícolas':'Activo Corriente',
  'Activos por Impuestos':'Activo Corriente',
  'Pagos Anticipados':'Activo Corriente',
  'Impuestos Diferidos':'Activo Corriente',
  'Otras CxC':'Activo Corriente',
  'Otros Activos Corrientes':'Activo Corriente',
  'Propiedades, Planta y Equipo':'Activo No Corriente',
  'Activos Biológicos':'Activo No Corriente',
  'Depreciación Acumulada (-)':'Activo No Corriente',
  'Activos Intangibles':'Activo No Corriente',
  'Amortización Acumulada (-)':'Activo No Corriente',
  'Inversiones en Asociadas/JV':'Activo No Corriente',
  'Inversiones en Otras Sociedades':'Activo No Corriente',
  'Plusvalía':'Activo No Corriente',
  'Plusvalía Negativa (-)':'Activo No Corriente',
  'CxC Comerciales No Corrientes':'Activo No Corriente',
  'CxC Entidades Relacionadas No Corrientes':'Activo No Corriente',
  'Otros Activos No Corrientes':'Activo No Corriente',
  'Otros Activos Financieros No Corrientes':'Activo No Corriente',
  'Otros Pasivos Financieros Corrientes':'Pasivo Corriente',
  'CxP Comerciales y Otras':'Pasivo Corriente',
  'CxP a Productores':'Pasivo Corriente',
  'CxP Entidades Relacionadas':'Pasivo Corriente',
  'Provisiones':'Pasivo Corriente',
  'Retenciones':'Pasivo Corriente',
  'Impuestos por Pagar':'Pasivo Corriente',
  'Impuestos a la Renta':'Pasivo Corriente',
  'Ingresos Diferidos':'Pasivo Corriente',
  'Obligaciones con el Personal':'Pasivo Corriente',
  'Pasivos por Leasing':'Pasivo Corriente',
  'Dividendos por Pagar':'Pasivo Corriente',
  'Otros Pasivos Corrientes':'Pasivo Corriente',
  'Otros Pasivos Financieros No Corrientes':'Pasivo No Corriente',
  'CxP Comerciales No Corrientes':'Pasivo No Corriente',
  'CxP Entidades Relacionadas No Corrientes':'Pasivo No Corriente',
  'Provisiones No Corrientes':'Pasivo No Corriente',
  'Obligaciones con el Personal No Corrientes':'Pasivo No Corriente',
  'Pasivos por Leasing No Corrientes':'Pasivo No Corriente',
  'Otros Pasivos No Corrientes':'Pasivo No Corriente',
  'Capital Autorizado':'Patrimonio',
  'Capital Pagado':'Patrimonio',
  'Sobreprecio en Venta de Acciones':'Patrimonio',
  'Otras Reservas':'Patrimonio',
  'Resultados Acumulados':'Patrimonio',
  'Resultado del Ejercicio':'Patrimonio',
  'Dividendos Provisorios (-)':'Patrimonio',
  'Otras Cuentas Patrimoniales':'Patrimonio',
  'Ingresos por Ventas':'Ingreso Operacional',
  'Ingresos por Royalties / Fees':'Ingreso Operacional',
  'Costo de Ventas':'Costo Operacional',
  'Costos Operacionales Agrícolas':'Costo Operacional',
  'Remuneraciones':'Gasto Operacional',
  'Honorarios':'Gasto Operacional',
  'Gastos de Representación':'Gasto Operacional',
  'Gastos de Administración y Ventas':'Gasto Operacional',
  'Ingresos Financieros':'Ingreso No Operacional',
  'Participación en Resultados Asociadas':'Ingreso No Operacional',
  'Otros Ingresos No Operacionales':'Ingreso No Operacional',
  'Gastos Financieros':'Gasto No Operacional',
  'Participación en Pérdidas Asociadas':'Gasto No Operacional',
  'Amortización Plusvalía':'Gasto No Operacional',
  'Otros Gastos No Operacionales':'Gasto No Operacional',
  'Diferencias de Cambio / Corr. Monetaria':'No Operacional',
  'Impuesto a la Renta':'Impuesto',
  'Cuentas de Orden':'Cuentas de Orden',
};

// Orden de presentación dentro de cada sección ESF
const ESF_SECCIONES = [
  { id:'ac',  label:'Activo Corriente',    totalLabel:'Total Activo Corriente',    grupo:'Activo Corriente'    },
  { id:'anc', label:'Activo No Corriente', totalLabel:'Total Activo No Corriente', grupo:'Activo No Corriente' },
  { id:'pc',  label:'Pasivo Corriente',    totalLabel:'Total Pasivo Corriente',    grupo:'Pasivo Corriente'    },
  { id:'pnc', label:'Pasivo No Corriente', totalLabel:'Total Pasivo No Corriente', grupo:'Pasivo No Corriente' },
  { id:'pat', label:'Patrimonio',          totalLabel:'Total Patrimonio',          grupo:'Patrimonio'          },
];

// ER: id, grupo display, contribución al resultado (1=suma, -1=resta, 0=neto)
const ER_BLOQUES = [
  { id:'ing_op',   label:'Ingresos Operacionales',    grupo:'Ingreso Operacional',    signo: 1 },
  { id:'costo_op', label:'Costos',                    grupo:'Costo Operacional',      signo:-1 },
  { id:'gasto_op', label:'Gastos Operacionales',      grupo:'Gasto Operacional',      signo:-1 },
  { id:'ing_nop',  label:'Ingresos No Operacionales', grupo:'Ingreso No Operacional', signo: 1 },
  { id:'gasto_nop',label:'Gastos No Operacionales',   grupo:'Gasto No Operacional',   signo:-1 },
  { id:'no_op',    label:'No Operacional',             grupo:'No Operacional',         signo: 0 },
  { id:'imp',      label:'Impuesto a la Renta',        grupo:'Impuesto',               signo:-1 },
];

// ── Helpers ──────────────────────────────────────────────────────────
function valorSit(c) {
  if (c.tipoIFRS === 'Activo')     return c.inventarioActivo  || 0;
  if (c.tipoIFRS === 'Pasivo')     return c.inventarioPasivo  || 0;
  if (c.tipoIFRS === 'Patrimonio') return c.inventarioPasivo  || 0;
  return 0;
}
function valorERCuenta(c, signo) {
  if (signo ===  1) return c.resultadoGanancia || 0;
  if (signo === -1) return c.resultadoPerdida  || 0;
  return (c.resultadoGanancia || 0) - (c.resultadoPerdida || 0); // neto
}
function fmt(v) { return fmtMonto(Math.abs(v), 0); }
function fmtSig(v) {
  if (Math.abs(v) < 0.01) return '—';
  return (v < 0 ? '(' : '') + fmtMonto(Math.abs(v), 0) + (v < 0 ? ')' : '');
}

// ── Componentes de UI ─────────────────────────────────────────────────
function Btn({ onClick, children, color, disabled, active, small }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding: small?'4px 10px':'6px 14px', borderRadius:7,
        border:`1px solid ${color||C.accent}`,
        background: active ? `${color||C.accent}cc` : disabled ? C.bg2 : `${color||C.accent}18`,
        color: disabled ? C.muted2 : active ? '#fff' : (color||C.accent),
        cursor: disabled?'default':'pointer',
        fontSize: small?10:11, fontWeight:600, transition:'all 0.15s' }}>
      {children}
    </button>
  );
}

function LineaTotal({ label, valor, nivel = 0, highlight = false }) {
  const col = highlight
    ? (valor >= 0 ? C.green : C.red)
    : C.text;
  return (
    <tr style={{ background: highlight ? `${col}14` : C.bg2,
      borderTop: highlight ? `1px solid ${col}44` : `1px solid ${C.border}` }}>
      <td style={{ padding:`${highlight?8:5}px 12px`, paddingLeft: 12 + nivel*20,
        fontSize: highlight?12:11, fontWeight: highlight?800:600, color: col }}>
        {label}
      </td>
      <td style={{ padding:`${highlight?8:5}px 14px`, textAlign:'right',
        fontSize: highlight?13:11, fontWeight: highlight?900:700, color: col, whiteSpace:'nowrap' }}>
        {fmtSig(valor)}
      </td>
    </tr>
  );
}

function LineaDivision({ label, valor, color }) {
  const col = color || (valor >= 0 ? C.accentL : C.red);
  return (
    <tr style={{ background:`${col}0d`, borderTop:`2px solid ${col}55`,
      borderBottom:`2px solid ${col}55` }}>
      <td style={{ padding:'7px 12px', fontSize:12, fontWeight:900,
        color: col, letterSpacing:'0.03em' }}>
        {label}
      </td>
      <td style={{ padding:'7px 14px', textAlign:'right',
        fontSize:13, fontWeight:900, color: col, whiteSpace:'nowrap' }}>
        {fmtSig(valor)}
      </td>
    </tr>
  );
}

function SeccionESF({ sec, cuentas, expandedSecs, onToggleSec, expandedCats, onToggleCat }) {
  const isOpen = expandedSecs.has(sec.id);

  // Agrupar cuentas de esta sección por categoriaIFRS
  const porCat = useMemo(() => {
    const m = new Map();
    for (const c of cuentas) {
      const cat = c.categoriaIFRS || 'Sin Categoría';
      if (!m.has(cat)) m.set(cat, []);
      m.get(cat).push(c);
    }
    return m;
  }, [cuentas]);

  const total = useMemo(() =>
    cuentas.reduce((s, c) => s + valorSit(c), 0), [cuentas]);

  if (cuentas.length === 0) return null;

  return (
    <>
      {/* Cabecera de sección */}
      <tr onClick={() => onToggleSec(sec.id)}
        style={{ background:C.card2, cursor:'pointer', borderTop:`1px solid ${C.border}` }}>
        <td style={{ padding:'8px 12px', fontSize:12, fontWeight:800, color:C.accentL }}>
          <span style={{ marginRight:6, fontSize:10, color:C.muted }}>{isOpen ? '▼' : '▶'}</span>
          {sec.label}
        </td>
        <td style={{ padding:'8px 14px', textAlign:'right', fontSize:12,
          fontWeight:800, color:C.accentL, whiteSpace:'nowrap' }}>
          {isOpen ? '' : fmt(total)}
        </td>
      </tr>

      {isOpen && [...porCat.entries()].map(([cat, ccs]) => {
        const catKey = `${sec.id}:${cat}`;
        const catOpen = expandedCats.has(catKey);
        const catTotal = ccs.reduce((s, c) => s + valorSit(c), 0);
        return (
          <React.Fragment key={cat}>
            {/* Cabecera de categoría */}
            <tr onClick={() => onToggleCat(catKey)}
              style={{ background:C.bg, cursor:'pointer',
                borderTop:`1px solid ${C.border}22` }}>
              <td style={{ padding:'5px 12px', paddingLeft:32,
                fontSize:11, fontWeight:600, color:C.muted }}>
                <span style={{ marginRight:6, fontSize:9, color:C.muted2 }}>{catOpen ? '▼' : '▶'}</span>
                {cat}
              </td>
              <td style={{ padding:'5px 14px', textAlign:'right',
                fontSize:11, fontWeight:600, color:C.muted, whiteSpace:'nowrap' }}>
                {catOpen ? '' : fmt(catTotal)}
              </td>
            </tr>
            {catOpen && ccs.map((c, i) => (
              <tr key={c.codigo + i}
                style={{ background:i%2===0?C.bg:C.bg2, borderTop:`1px solid ${C.border}11` }}>
                <td style={{ padding:'3px 12px', paddingLeft:52,
                  fontSize:10, color:C.muted2 }}>
                  <span style={{ color:C.muted2, marginRight:6, fontFamily:'monospace',
                    fontSize:9 }}>{c.codigo}</span>
                  {c.nombre || c.nombreOficial}
                </td>
                <td style={{ padding:'3px 14px', textAlign:'right',
                  fontSize:10, color: valorSit(c) !== 0 ? C.text : C.muted2,
                  whiteSpace:'nowrap' }}>
                  {valorSit(c) !== 0 ? fmt(valorSit(c)) : '—'}
                </td>
              </tr>
            ))}
          </React.Fragment>
        );
      })}

      {/* Total de sección */}
      {isOpen && (
        <LineaTotal label={sec.totalLabel} valor={total} nivel={0} />
      )}
    </>
  );
}

function BloqueER({ bloque, cuentas, expandedSecs, onToggleSec, expandedCats, onToggleCat }) {
  const isOpen = expandedSecs.has(bloque.id);

  const porCat = useMemo(() => {
    const m = new Map();
    for (const c of cuentas) {
      const cat = c.categoriaIFRS || 'Sin Categoría';
      if (!m.has(cat)) m.set(cat, []);
      m.get(cat).push(c);
    }
    return m;
  }, [cuentas]);

  const total = useMemo(() =>
    cuentas.reduce((s, c) => s + valorERCuenta(c, bloque.signo), 0), [cuentas, bloque.signo]);

  // Valor para mostrar en cabecera: siempre positivo (el signo lo da el contexto)
  const displayTotal = bloque.signo === 0 ? total : total; // abs para mostrar, pero conservamos para contrib

  if (cuentas.length === 0) return null;

  const headerColor = bloque.signo >= 0 ? C.text : C.muted;

  return (
    <>
      <tr onClick={() => onToggleSec(bloque.id)}
        style={{ background:C.card2, cursor:'pointer', borderTop:`1px solid ${C.border}` }}>
        <td style={{ padding:'8px 12px', fontSize:12, fontWeight:800, color:headerColor }}>
          <span style={{ marginRight:6, fontSize:10, color:C.muted }}>{isOpen ? '▼' : '▶'}</span>
          {bloque.label}
        </td>
        <td style={{ padding:'8px 14px', textAlign:'right', fontSize:12,
          fontWeight:800, color: bloque.signo < 0 ? C.red : C.text, whiteSpace:'nowrap' }}>
          {isOpen ? '' : (bloque.signo < 0 ? `(${fmt(total)})` : fmtSig(total))}
        </td>
      </tr>

      {isOpen && [...porCat.entries()].map(([cat, ccs]) => {
        const catKey = `er:${bloque.id}:${cat}`;
        const catOpen = expandedCats.has(catKey);
        const catTotal = ccs.reduce((s, c) => s + valorERCuenta(c, bloque.signo), 0);
        return (
          <React.Fragment key={cat}>
            <tr onClick={() => onToggleCat(catKey)}
              style={{ background:C.bg, cursor:'pointer', borderTop:`1px solid ${C.border}22` }}>
              <td style={{ padding:'5px 12px', paddingLeft:32,
                fontSize:11, fontWeight:600, color:C.muted }}>
                <span style={{ marginRight:6, fontSize:9, color:C.muted2 }}>{catOpen ? '▼' : '▶'}</span>
                {cat}
              </td>
              <td style={{ padding:'5px 14px', textAlign:'right',
                fontSize:11, fontWeight:600, color:C.muted, whiteSpace:'nowrap' }}>
                {catOpen ? '' : fmt(catTotal)}
              </td>
            </tr>
            {catOpen && ccs.map((c, i) => {
              const v = valorERCuenta(c, bloque.signo);
              return (
                <tr key={c.codigo + i}
                  style={{ background:i%2===0?C.bg:C.bg2, borderTop:`1px solid ${C.border}11` }}>
                  <td style={{ padding:'3px 12px', paddingLeft:52, fontSize:10, color:C.muted2 }}>
                    <span style={{ color:C.muted2, marginRight:6, fontFamily:'monospace', fontSize:9 }}>{c.codigo}</span>
                    {c.nombre || c.nombreOficial}
                  </td>
                  <td style={{ padding:'3px 14px', textAlign:'right',
                    fontSize:10, color: v !== 0 ? C.text : C.muted2, whiteSpace:'nowrap' }}>
                    {v !== 0 ? fmt(v) : '—'}
                  </td>
                </tr>
              );
            })}
          </React.Fragment>
        );
      })}
      {isOpen && (
        <LineaTotal
          label={`Total ${bloque.label}`}
          valor={bloque.signo < 0 ? -total : total}
          nivel={0}
        />
      )}
    </>
  );
}

// ── Componente principal ─────────────────────────────────────────────
export default function EEFFModule({ canEdit, usuarioActual }) {
  const isAdmin = usuarioActual?.rol === 'admin';

  // ── Selectores ──────────────────────────────────────────────────
  const [empresa, setEmpresa] = useState('Allegria Foods');
  const [mes,     setMes]     = useState(new Date().getMonth() + 1);
  const [anio,    setAnio]    = useState(new Date().getFullYear());
  const [modo,    setModo]    = useState('mes'); // 'mes' | 'ytd'

  // ── Datos EEFF desde Supabase ────────────────────────────────────
  const [eeffData,     setEeffData]     = useState(null);
  const [loadingData,  setLoadingData]  = useState(false);
  const [sinDatos,     setSinDatos]     = useState(false);

  // ── Cargar balance (flujo upload) ────────────────────────────────
  const [showUpload,   setShowUpload]   = useState(false);
  const [uploading,    setUploading]    = useState(false);
  const [uploadError,  setUploadError]  = useState(null);
  const [uploadFile,   setUploadFile]   = useState(null);
  const fileRef = useRef();

  // ── Plan Maestro ─────────────────────────────────────────────────
  const [planMaps,     setPlanMaps]     = useState(null);
  const [planMeta,     setPlanMeta]     = useState(null);
  const [planCargando, setPlanCargando] = useState(false);
  const [planGuardando,setPlanGuardando]= useState(false);
  const [planError,    setPlanError]    = useState(null);
  const planFileRef = useRef();

  // ── Expand/collapse ──────────────────────────────────────────────
  const defaultExpandedSecs = new Set(
    ESF_SECCIONES.map(s => s.id).concat(ER_BLOQUES.map(b => b.id))
  );
  const [expandedSecs, setExpandedSecs] = useState(defaultExpandedSecs);
  const [expandedCats, setExpandedCats] = useState(new Set());

  const toggleSec = useCallback((id) => {
    setExpandedSecs(prev => { const s = new Set(prev); s.has(id)?s.delete(id):s.add(id); return s; });
  }, []);
  const toggleCat = useCallback((key) => {
    setExpandedCats(prev => { const s = new Set(prev); s.has(key)?s.delete(key):s.add(key); return s; });
  }, []);

  // ── Cargar Plan Maestro al montar ────────────────────────────────
  useEffect(() => {
    setPlanCargando(true);
    dbLoadPlanMaestro()
      .then(res => { if (res) { setPlanMaps(res.maps); setPlanMeta(res.meta); } })
      .catch(() => {})
      .finally(() => setPlanCargando(false));
  }, []);

  // ── Cargar EEFF desde Supabase cuando cambia empresa/mes/año ─────
  useEffect(() => {
    setEeffData(null); setSinDatos(false); setShowUpload(false);
    setUploadError(null); setUploadFile(null);
    setLoadingData(true);
    cargarEEFF(empresa, anio, mes)
      .then(data => {
        if (data) { setEeffData(data); setSinDatos(false); }
        else { setSinDatos(true); }
      })
      .catch(() => setSinDatos(true))
      .finally(() => setLoadingData(false));
  }, [empresa, mes, anio]);

  // ── Handler: upload Plan Maestro (admin) ─────────────────────────
  const handlePlanFile = useCallback(async (file) => {
    if (!file) return;
    setPlanGuardando(true); setPlanError(null);
    try {
      const maps = await parsearPlanMaestro(file);
      await dbSavePlanMaestro(maps, usuarioActual?.nombre || usuarioActual?.email || '');
      setPlanMaps(maps);
      setPlanMeta({ version:'v5', cargadoEn:new Date().toISOString(),
        cargadoPor: usuarioActual?.nombre || '' });
    } catch(e) { setPlanError(e.message || String(e)); }
    finally { setPlanGuardando(false); if(planFileRef.current) planFileRef.current.value=''; }
  }, [usuarioActual]);

  // ── Handler: cargar balance y guardar EEFF ───────────────────────
  const handleCargarBalance = useCallback(async (file) => {
    if (!file || !planMaps) return;
    setUploading(true); setUploadError(null);
    try {
      const fmt2 = detectarFormatoBalance(file);
      if (!fmt2) throw new Error('Formato no reconocido. Use .xls (Megasystem) o .xlsx (Contec).');
      const cuentas = await parsearBalance(file, empresa, mes, anio);
      const clasif  = clasificarCuentas(cuentas, planMaps);
      await guardarEEFF({
        empresa, mes, anio,
        sistema: fmt2 === 'megasystem' ? 'megasystem' : 'contec',
        formato: fmt2, clasif,
        guardadoPor: usuarioActual?.nombre || usuarioActual?.email || '',
      });
      const data = await cargarEEFF(empresa, anio, mes);
      if (data) { setEeffData(data); setSinDatos(false); setShowUpload(false); }
    } catch(e) {
      setUploadError(e.message || String(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [empresa, mes, anio, planMaps, usuarioActual]);

  // ── Derived: agrupar cuentas por grupo de sección ────────────────
  const { cuentasPorGrupo, sinClasificar } = useMemo(() => {
    if (!eeffData?.cuentas) return { cuentasPorGrupo: {}, sinClasificar: [] };
    const m = {};
    const sc = [];
    for (const c of eeffData.cuentas) {
      if (c.grupo === 'sinClasificar') { sc.push(c); continue; }
      const g = c.categoriaIFRS ? (CAT_GRUPO[c.categoriaIFRS] || 'Sin Grupo') : 'Sin Grupo';
      if (!m[g]) m[g] = [];
      m[g].push(c);
    }
    return { cuentasPorGrupo: m, sinClasificar: sc };
  }, [eeffData]);

  // ── Totales para líneas calculadas ───────────────────────────────
  const sumGrupo = (grupo) =>
    (cuentasPorGrupo[grupo] || []).reduce((s, c) => s + valorSit(c), 0);

  const sumER = (grupoER) => {
    const bloque = ER_BLOQUES.find(b => b.grupo === grupoER);
    if (!bloque) return 0;
    return (cuentasPorGrupo[grupoER] || [])
      .reduce((s, c) => s + valorERCuenta(c, bloque.signo), 0);
  };

  const totalAC  = sumGrupo('Activo Corriente');
  const totalANC = sumGrupo('Activo No Corriente');
  const totalA   = totalAC + totalANC;
  const totalPC  = sumGrupo('Pasivo Corriente');
  const totalPNC = sumGrupo('Pasivo No Corriente');
  const totalP   = totalPC + totalPNC;
  const totalPat = sumGrupo('Patrimonio');
  const totalPP  = totalP + totalPat;

  const ingOp   = sumER('Ingreso Operacional');
  const costoOp = sumER('Costo Operacional');
  const resB    = ingOp + costoOp;           // costoOp ya es negativo
  const gastoOp = sumER('Gasto Operacional');
  const resOp   = resB + gastoOp;            // gastoOp ya es negativo
  const ingNOp  = sumER('Ingreso No Operacional');
  const gastNOp = sumER('Gasto No Operacional');
  const noOp    = sumER('No Operacional');
  const resAntes= resOp + ingNOp + gastNOp + noOp;
  const impuesto= sumER('Impuesto');
  const resEjec = resAntes + impuesto;

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div style={{ background:C.bg, color:C.text, padding:'20px 24px', minHeight:'60vh' }}>

      {/* ── Encabezado ── */}
      <div style={{ marginBottom:18, display:'flex', gap:16, alignItems:'flex-start',
        flexWrap:'wrap', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:16, fontWeight:900, color:C.accentL, marginBottom:2 }}>
            Estados Financieros
          </div>
          <div style={{ fontSize:11, color:C.muted }}>
            Grupo Mediterra — Etapa 1
          </div>
        </div>

        {/* Admin: actualizar Plan Maestro */}
        {isAdmin && (
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <span style={{ fontSize:10, color: planMaps ? C.green : C.yellow }}>
              {planCargando ? 'Cargando plan...'
                : planMaps
                  ? `Plan Maestro ${planMeta?.version || ''} cargado`
                  : 'Sin Plan Maestro'}
            </span>
            <input ref={planFileRef} type="file" accept=".xlsx"
              onChange={e => handlePlanFile(e.target.files[0])} style={{ display:'none' }} />
            <Btn onClick={() => planFileRef.current?.click()}
              color={C.purple} disabled={planGuardando} small>
              {planGuardando ? 'Guardando...' : planMaps ? 'Actualizar Plan' : 'Cargar Plan Maestro'}
            </Btn>
            {planError && <span style={{ fontSize:10, color:C.red }}>{planError}</span>}
          </div>
        )}
      </div>

      {/* ── Selectores ── */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:16, alignItems:'flex-end' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          <label style={{ fontSize:9, color:C.muted, textTransform:'uppercase' }}>Empresa</label>
          <select value={empresa} onChange={e => setEmpresa(e.target.value)}
            style={{ padding:'6px 10px', borderRadius:6, background:C.card2, color:C.text,
              border:`1px solid ${C.border}`, fontSize:11 }}>
            {EMPRESAS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          <label style={{ fontSize:9, color:C.muted, textTransform:'uppercase' }}>Mes</label>
          <select value={mes} onChange={e => setMes(Number(e.target.value))}
            style={{ padding:'6px 10px', borderRadius:6, background:C.card2, color:C.text,
              border:`1px solid ${C.border}`, fontSize:11 }}>
            {MESES.map(m => <option key={m} value={m}>{NOMBRES_MES[m]}</option>)}
          </select>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          <label style={{ fontSize:9, color:C.muted, textTransform:'uppercase' }}>Año</label>
          <input type="number" value={anio} onChange={e => setAnio(Number(e.target.value))}
            style={{ padding:'6px 8px', width:72, borderRadius:6, background:C.card2, color:C.text,
              border:`1px solid ${C.border}`, fontSize:11 }} />
        </div>

        {/* Toggle Mes / YTD */}
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          <label style={{ fontSize:9, color:C.muted, textTransform:'uppercase' }}>Vista</label>
          <div style={{ display:'flex', gap:0, borderRadius:7, overflow:'hidden',
            border:`1px solid ${C.border}` }}>
            {['mes','ytd'].map(m => (
              <button key={m} onClick={() => setModo(m)}
                style={{ padding:'6px 14px', fontSize:11, fontWeight:600, cursor:'pointer',
                  background: modo===m ? `${C.accent}cc` : C.card2,
                  color: modo===m ? '#fff' : C.muted,
                  border:'none', transition:'all 0.15s' }}>
                {m === 'mes' ? 'Mes' : 'YTD'}
              </button>
            ))}
          </div>
        </div>

        {/* Cargar balance (si hay datos, reemplazar) */}
        {canEdit && !showUpload && !loadingData && (
          <>
            <input ref={fileRef} type="file" accept=".xls,.xlsx"
              onChange={e => { setUploadFile(e.target.files[0]); setShowUpload(true); }}
              style={{ display:'none' }} />
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <label style={{ fontSize:9, color:C.muted, textTransform:'uppercase' }}>&nbsp;</label>
              <Btn onClick={() => fileRef.current?.click()} color={C.accent}
                disabled={!planMaps}>
                {eeffData ? 'Reemplazar balance' : 'Cargar balance'}
              </Btn>
            </div>
          </>
        )}
      </div>

      {/* ── YTD aviso ── */}
      {modo === 'ytd' && (
        <div style={{ color:C.yellow, fontSize:11, marginBottom:12, background:`${C.yellow}11`,
          border:`1px solid ${C.yellow}33`, borderRadius:8, padding:'8px 14px' }}>
          Vista YTD disponible en próxima etapa. Mostrando datos del mes seleccionado.
        </div>
      )}

      {/* ── Loading ── */}
      {loadingData && (
        <div style={{ color:C.muted, fontSize:12, padding:'40px 0', textAlign:'center' }}>
          Cargando {NOMBRES_MES[mes]} {anio}...
        </div>
      )}

      {/* ── Sin datos + upload ── */}
      {!loadingData && sinDatos && !showUpload && (
        <div style={{ textAlign:'center', padding:'60px 0' }}>
          <div style={{ fontSize:13, color:C.muted, marginBottom:16 }}>
            No hay EEFF guardado para <strong style={{ color:C.text }}>{empresa}</strong> —{' '}
            {NOMBRES_MES[mes]} {anio}
          </div>
          {canEdit && planMaps && (
            <>
              <input ref={fileRef} type="file" accept=".xls,.xlsx"
                onChange={e => { setUploadFile(e.target.files[0]); setShowUpload(true); }}
                style={{ display:'none' }} />
              <Btn onClick={() => fileRef.current?.click()} color={C.accent}>
                Cargar balance
              </Btn>
            </>
          )}
          {canEdit && !planMaps && (
            <div style={{ fontSize:11, color:C.yellow, marginTop:8 }}>
              Primero carga el Plan Maestro (botón arriba a la derecha).
            </div>
          )}
          {!canEdit && (
            <div style={{ fontSize:11, color:C.muted, marginTop:8 }}>
              Sin permisos de carga para este módulo.
            </div>
          )}
        </div>
      )}

      {/* ── Panel de upload ── */}
      {showUpload && uploadFile && (
        <div style={{ background:C.card2, border:`1px solid ${C.border}`, borderRadius:10,
          padding:'16px 20px', marginBottom:16 }}>
          <div style={{ fontSize:11, color:C.muted, marginBottom:8 }}>
            Archivo: <strong style={{ color:C.text }}>{uploadFile.name}</strong>
          </div>
          {uploadError && (
            <div style={{ color:C.red, fontSize:11, marginBottom:8 }}>Error: {uploadError}</div>
          )}
          <div style={{ display:'flex', gap:8 }}>
            <Btn onClick={() => handleCargarBalance(uploadFile)} color={C.green} disabled={uploading}>
              {uploading ? 'Procesando...' : 'Confirmar y guardar'}
            </Btn>
            <Btn onClick={() => { setShowUpload(false); setUploadFile(null); setUploadError(null);
              if(fileRef.current) fileRef.current.value=''; }} color={C.muted} disabled={uploading}>
              Cancelar
            </Btn>
          </div>
        </div>
      )}

      {/* ── EEFF cargado ── */}
      {eeffData && !loadingData && (
        <>
          {/* Metadata del período */}
          <div style={{ display:'flex', gap:16, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
            <div style={{ fontSize:10, color:C.muted }}>
              {eeffData.sistema === 'megasystem' ? 'Megasystem' : 'Contec'} ·{' '}
              {eeffData.cuentas?.length} cuentas ·{' '}
              Guardado {eeffData.fechaGuardado
                ? new Date(eeffData.fechaGuardado).toLocaleDateString('es-CL')
                : ''}
              {eeffData.guardadoPor ? ` por ${eeffData.guardadoPor}` : ''}
            </div>
            <div style={{ display:'flex', gap:4 }}>
              <Btn onClick={() => {
                const all = new Set(ESF_SECCIONES.map(s=>s.id).concat(ER_BLOQUES.map(b=>b.id)));
                setExpandedSecs(all); setExpandedCats(new Set());
              }} color={C.muted} small>Expandir todo</Btn>
              <Btn onClick={() => {
                setExpandedSecs(new Set()); setExpandedCats(new Set());
              }} color={C.muted} small>Colapsar todo</Btn>
            </div>
          </div>

          {/* ═══ ESTADO DE SITUACIÓN FINANCIERA ═══ */}
          <div style={{ marginBottom:32 }}>
            <div style={{ fontSize:13, fontWeight:900, color:C.accentL,
              marginBottom:10, paddingBottom:6, borderBottom:`2px solid ${C.accent}44`,
              letterSpacing:'0.04em', textTransform:'uppercase' }}>
              Estado de Situación Financiera
            </div>

            <div style={{ overflowX:'auto', borderRadius:10, border:`1px solid ${C.border}` }}>
              <table style={{ borderCollapse:'collapse', width:'100%' }}>
                <thead>
                  <tr style={{ background:C.bg2 }}>
                    <th style={{ padding:'8px 12px', textAlign:'left', fontSize:10,
                      color:C.muted, fontWeight:700, textTransform:'uppercase' }}>Cuenta</th>
                    <th style={{ padding:'8px 14px', textAlign:'right', fontSize:10,
                      color:C.muted, fontWeight:700, textTransform:'uppercase', whiteSpace:'nowrap' }}>
                      {NOMBRES_MES[mes]} {anio}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* ACTIVOS */}
                  <tr style={{ background:`${C.accent}18` }}>
                    <td colSpan={2} style={{ padding:'6px 12px', fontSize:11,
                      fontWeight:800, color:C.accent, letterSpacing:'0.06em' }}>ACTIVOS</td>
                  </tr>
                  {ESF_SECCIONES.filter(s => s.grupo.startsWith('Activo')).map(sec => (
                    <SeccionESF key={sec.id} sec={sec}
                      cuentas={cuentasPorGrupo[sec.grupo] || []}
                      expandedSecs={expandedSecs} onToggleSec={toggleSec}
                      expandedCats={expandedCats} onToggleCat={toggleCat} />
                  ))}
                  <LineaDivision label="TOTAL ACTIVO" valor={totalA} />

                  {/* PASIVOS Y PATRIMONIO */}
                  <tr style={{ background:`${C.blue}18` }}>
                    <td colSpan={2} style={{ padding:'6px 12px', fontSize:11,
                      fontWeight:800, color:C.blue, letterSpacing:'0.06em' }}>
                      PASIVOS Y PATRIMONIO
                    </td>
                  </tr>
                  {ESF_SECCIONES.filter(s => s.grupo.startsWith('Pasivo')).map(sec => (
                    <SeccionESF key={sec.id} sec={sec}
                      cuentas={cuentasPorGrupo[sec.grupo] || []}
                      expandedSecs={expandedSecs} onToggleSec={toggleSec}
                      expandedCats={expandedCats} onToggleCat={toggleCat} />
                  ))}
                  <LineaTotal label="Total Pasivo" valor={totalP} />
                  <tr style={{ background:'transparent', height:4 }}><td colSpan={2}></td></tr>
                  {ESF_SECCIONES.filter(s => s.grupo === 'Patrimonio').map(sec => (
                    <SeccionESF key={sec.id} sec={sec}
                      cuentas={cuentasPorGrupo[sec.grupo] || []}
                      expandedSecs={expandedSecs} onToggleSec={toggleSec}
                      expandedCats={expandedCats} onToggleCat={toggleCat} />
                  ))}
                  <LineaDivision label="TOTAL PASIVO + PATRIMONIO" valor={totalPP}
                    color={Math.abs(totalA - totalPP) < 1 ? C.green : C.red} />
                  {Math.abs(totalA - totalPP) >= 1 && (
                    <tr style={{ background:`${C.red}11` }}>
                      <td colSpan={2} style={{ padding:'4px 12px', fontSize:10, color:C.red }}>
                        ⚠ Diferencia A - (P+Pat): {fmtMonto(totalA - totalPP, 2)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ═══ ESTADO DE RESULTADOS ═══ */}
          <div style={{ marginBottom:32 }}>
            <div style={{ fontSize:13, fontWeight:900, color:C.accentL,
              marginBottom:10, paddingBottom:6, borderBottom:`2px solid ${C.accent}44`,
              letterSpacing:'0.04em', textTransform:'uppercase' }}>
              Estado de Resultados
            </div>

            <div style={{ overflowX:'auto', borderRadius:10, border:`1px solid ${C.border}` }}>
              <table style={{ borderCollapse:'collapse', width:'100%' }}>
                <thead>
                  <tr style={{ background:C.bg2 }}>
                    <th style={{ padding:'8px 12px', textAlign:'left', fontSize:10,
                      color:C.muted, fontWeight:700, textTransform:'uppercase' }}>Cuenta</th>
                    <th style={{ padding:'8px 14px', textAlign:'right', fontSize:10,
                      color:C.muted, fontWeight:700, textTransform:'uppercase', whiteSpace:'nowrap' }}>
                      {NOMBRES_MES[mes]} {anio}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <BloqueER bloque={ER_BLOQUES[0]} cuentas={cuentasPorGrupo['Ingreso Operacional']||[]}
                    expandedSecs={expandedSecs} onToggleSec={toggleSec}
                    expandedCats={expandedCats} onToggleCat={toggleCat} />
                  <BloqueER bloque={ER_BLOQUES[1]} cuentas={cuentasPorGrupo['Costo Operacional']||[]}
                    expandedSecs={expandedSecs} onToggleSec={toggleSec}
                    expandedCats={expandedCats} onToggleCat={toggleCat} />
                  <LineaDivision label="RESULTADO BRUTO" valor={resB} />

                  <BloqueER bloque={ER_BLOQUES[2]} cuentas={cuentasPorGrupo['Gasto Operacional']||[]}
                    expandedSecs={expandedSecs} onToggleSec={toggleSec}
                    expandedCats={expandedCats} onToggleCat={toggleCat} />
                  <LineaDivision label="RESULTADO OPERACIONAL" valor={resOp} />

                  <BloqueER bloque={ER_BLOQUES[3]} cuentas={cuentasPorGrupo['Ingreso No Operacional']||[]}
                    expandedSecs={expandedSecs} onToggleSec={toggleSec}
                    expandedCats={expandedCats} onToggleCat={toggleCat} />
                  <BloqueER bloque={ER_BLOQUES[4]} cuentas={cuentasPorGrupo['Gasto No Operacional']||[]}
                    expandedSecs={expandedSecs} onToggleSec={toggleSec}
                    expandedCats={expandedCats} onToggleCat={toggleCat} />
                  {(cuentasPorGrupo['No Operacional']||[]).length > 0 && (
                    <BloqueER bloque={ER_BLOQUES[5]} cuentas={cuentasPorGrupo['No Operacional']||[]}
                      expandedSecs={expandedSecs} onToggleSec={toggleSec}
                      expandedCats={expandedCats} onToggleCat={toggleCat} />
                  )}
                  <LineaTotal label="Resultado antes de Impuesto" valor={resAntes} />

                  <BloqueER bloque={ER_BLOQUES[6]} cuentas={cuentasPorGrupo['Impuesto']||[]}
                    expandedSecs={expandedSecs} onToggleSec={toggleSec}
                    expandedCats={expandedCats} onToggleCat={toggleCat} />
                  <LineaDivision label="RESULTADO DEL EJERCICIO" valor={resEjec} />
                </tbody>
              </table>
            </div>
          </div>

          {/* ═══ SIN CLASIFICAR ═══ */}
          {sinClasificar.length > 0 && (
            <div style={{ marginBottom:24 }}>
              <div style={{ fontSize:12, fontWeight:800, color:C.yellow, marginBottom:8 }}>
                Sin Clasificar — {sinClasificar.length} cuentas
                <span style={{ fontSize:10, fontWeight:400, color:C.muted, marginLeft:8 }}>
                  (no encontradas en el Plan Maestro — agregar en la próxima versión)
                </span>
              </div>
              <div style={{ overflowX:'auto', borderRadius:8,
                border:`1px solid ${C.yellow}44` }}>
                <table style={{ borderCollapse:'collapse', width:'100%', fontSize:11 }}>
                  <thead>
                    <tr style={{ background:C.bg2 }}>
                      {['Código','Nombre','SD','SA'].map(h => (
                        <th key={h} style={{ padding:'5px 12px',
                          textAlign:h==='SD'||h==='SA'?'right':'left',
                          fontSize:9, color:C.muted, fontWeight:700,
                          textTransform:'uppercase', borderBottom:`1px solid ${C.border}` }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sinClasificar.map((c, i) => (
                      <tr key={c.codigo+i}
                        style={{ background:i%2===0?C.bg:C.bg2,
                          borderBottom:`1px solid ${C.border}22` }}>
                        <td style={{ padding:'4px 12px', color:C.yellow,
                          fontFamily:'monospace', fontSize:10 }}>{c.codigo}</td>
                        <td style={{ padding:'4px 12px', color:C.text }}>{c.nombre}</td>
                        <td style={{ padding:'4px 12px', textAlign:'right', color:C.muted2 }}>
                          {c.saldoDeudor ? fmtMonto(c.saldoDeudor,2) : '—'}
                        </td>
                        <td style={{ padding:'4px 12px', textAlign:'right', color:C.muted2 }}>
                          {c.saldoAcreedor ? fmtMonto(c.saldoAcreedor,2) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
