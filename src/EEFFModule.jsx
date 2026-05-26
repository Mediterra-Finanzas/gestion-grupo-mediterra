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
  bg:      '#0f172a',
  bg2:     '#1e293b',
  card:    '#1e293b',
  card2:   '#263247',
  border:  '#334155',
  text:    '#f1f5f9',
  muted:   '#64748b',
  muted2:  '#475569',
  accent:  '#06b6d4',
  accentL: '#67e8f9',
  green:   '#22c55e',
  red:     '#ef4444',
  yellow:  '#f59e0b',
  blue:    '#3b82f6',
  purple:  '#a855f7',
};

function Btn({ onClick, children, active, color, disabled, small }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding: small ? '4px 10px' : '6px 14px', borderRadius:7,
        border:`1px solid ${color||C.accent}`,
        background: active ? `${color||C.accent}cc` : disabled ? C.bg2 : `${color||C.accent}18`,
        color: disabled ? C.muted2 : active ? '#fff' : (color||C.accent),
        cursor: disabled ? 'default' : 'pointer',
        fontSize: small ? 10 : 11, fontWeight:600, transition:'all 0.15s' }}>
      {children}
    </button>
  );
}

// ─── Columnas tabla de cuentas ──────────────────────────────────────
const COLS_DISPLAY = [
  { key:'codigo',           label:'Código',     align:'left'  },
  { key:'nombre',           label:'Nombre',     align:'left'  },
  { key:'debe',             label:'Debe',       align:'right' },
  { key:'haber',            label:'Haber',      align:'right' },
  { key:'saldoDeudor',      label:'SD',         align:'right' },
  { key:'saldoAcreedor',    label:'SA',         align:'right' },
  { key:'inventarioActivo', label:'Inv.Activo', align:'right' },
  { key:'inventarioPasivo', label:'Inv.Pasivo', align:'right' },
  { key:'resultadoPerdida', label:'Res.Pérd.',  align:'right' },
  { key:'resultadoGanancia',label:'Res.Gan.',   align:'right' },
  { key:'mes',              label:'Mes',        align:'center'},
  { key:'anio',             label:'Año',        align:'center'},
];

const NUMS = new Set(['debe','haber','saldoDeudor','saldoAcreedor',
  'inventarioActivo','inventarioPasivo','resultadoPerdida','resultadoGanancia']);

export default function EEFFModule({ canEdit, usuarioActual }) {
  const isAdmin = usuarioActual?.rol === 'admin';

  // ── Estado: balance ──────────────────────────────────────────────
  const [empresa,  setEmpresa]  = useState('Allegria Foods');
  const [mes,      setMes]      = useState(4);
  const [anio,     setAnio]     = useState(2026);
  const [cuentas,  setCuentas]  = useState([]);
  const [formato,  setFormato]  = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [fileName, setFileName] = useState(null);
  const [pagina,   setPagina]   = useState(0);
  const fileRef = useRef();

  // ── Estado: Plan Maestro ─────────────────────────────────────────
  const [planMaps,    setPlanMaps]    = useState(null);
  const [planMeta,    setPlanMeta]    = useState(null);
  const [planCargando,setPlanCargando]= useState(false);
  const [planError,   setPlanError]   = useState(null);
  const [planGuardando,setPlanGuardando] = useState(false);
  const planFileRef = useRef();

  // ── Estado: guardar / verificar EEFF ────────────────────────────
  const [guardando,    setGuardando]    = useState(false);
  const [guardadoId,   setGuardadoId]   = useState(null);
  const [guardadoError,setGuardadoError]= useState(null);
  const [verificando,  setVerificando]  = useState(false);
  const [verificacion, setVerificacion] = useState(null);

  const POR_PAGINA = 60;

  // ── Cargar Plan Maestro desde Supabase al montar ─────────────────
  useEffect(() => {
    setPlanCargando(true);
    dbLoadPlanMaestro()
      .then(res => {
        if (res) { setPlanMaps(res.maps); setPlanMeta(res.meta); }
      })
      .catch(() => {})
      .finally(() => setPlanCargando(false));
  }, []);

  // ── Handler: cargar archivo de balance ───────────────────────────
  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setLoading(true); setError(null); setCuentas([]); setPagina(0); setFileName(file.name);
    try {
      const fmt = detectarFormatoBalance(file);
      setFormato(fmt);
      if (!fmt) throw new Error('Formato no reconocido. Use .xls (Megasystem) o .xlsx (Contec).');
      const result = await parsearBalance(file, empresa, mes, anio);
      setCuentas(result);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [empresa, mes, anio]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // ── Handler: cargar Plan Maestro (admin) ─────────────────────────
  const handlePlanFile = useCallback(async (file) => {
    if (!file) return;
    setPlanGuardando(true); setPlanError(null);
    try {
      const maps = await parsearPlanMaestro(file);
      await dbSavePlanMaestro(maps, usuarioActual?.nombre || usuarioActual?.email || '');
      setPlanMaps(maps);
      setPlanMeta({ version:'v5', cargadoEn: new Date().toISOString(), cargadoPor: usuarioActual?.nombre || '' });
    } catch (e) {
      setPlanError(e.message || String(e));
    } finally {
      setPlanGuardando(false);
      if (planFileRef.current) planFileRef.current.value = '';
    }
  }, [usuarioActual]);

  // ── Handler: guardar EEFF clasificado ───────────────────────────
  const handleGuardar = useCallback(async () => {
    if (!clasifRef.current) return;
    setGuardando(true); setGuardadoError(null); setGuardadoId(null); setVerificacion(null);
    try {
      const id = await guardarEEFF({
        empresa, mes, anio,
        sistema: formato === 'megasystem' ? 'megasystem' : 'contec',
        formato,
        clasif: clasifRef.current,
        guardadoPor: usuarioActual?.nombre || usuarioActual?.email || '',
      });
      setGuardadoId(id);
    } catch (e) {
      setGuardadoError(e.message || String(e));
    } finally {
      setGuardando(false);
    }
  }, [empresa, mes, anio, formato, usuarioActual]);

  // ── Handler: verificar EEFF recargado desde Supabase ────────────
  const handleVerificar = useCallback(async () => {
    setVerificando(true); setVerificacion(null);
    try {
      const data = await cargarEEFF(empresa, anio, mes);
      if (!data) { setVerificacion({ ok: false, msg: 'No se encontró el EEFF en Supabase.' }); return; }
      const total    = data.cuentas?.length ?? 0;
      const sinComp  = data.cuentas?.filter(c => !('composicion' in c)).length ?? 0;
      const sinNarr  = data.cuentas?.filter(c => !('narrativa' in c)).length ?? 0;
      const compNull = data.cuentas?.filter(c => c.composicion !== null).length ?? 0;
      const narrNull = data.cuentas?.filter(c => c.narrativa !== null).length ?? 0;
      setVerificacion({
        ok: true,
        empresa:       data.empresa,
        mes:           data.mes,
        anio:          data.anio,
        sistema:       data.sistema,
        fechaGuardado: data.fechaGuardado,
        guardadoPor:   data.guardadoPor,
        total,
        situacion:     data.resumen?.situacion    ?? 0,
        resultados:    data.resumen?.resultados   ?? 0,
        sinClasif:     data.resumen?.sinClasificar ?? 0,
        camposOk:      sinComp === 0 && sinNarr === 0 && compNull === 0 && narrNull === 0,
      });
    } catch (e) {
      setVerificacion({ ok: false, msg: e.message || String(e) });
    } finally {
      setVerificando(false);
    }
  }, [empresa, anio, mes]);

  // Ref para acceder a clasif dentro de los callbacks (evita stale closure)
  const clasifRef = useRef(null);

  // ── Clasificación (useMemo, se recalcula cuando cambian cuentas o plan) ──
  const clasif = useMemo(() => {
    const result = (!cuentas.length || !planMaps) ? null : clasificarCuentas(cuentas, planMaps);
    clasifRef.current = result;
    // Limpiar estado de guardado al cambiar clasificación
    setGuardadoId(null); setGuardadoError(null); setVerificacion(null);
    return result;
  }, [cuentas, planMaps]);

  // ── Paginación ───────────────────────────────────────────────────
  const totalPaginas = Math.ceil(cuentas.length / POR_PAGINA);
  const filas = cuentas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);

  // ── Resumen de validación rápida ─────────────────────────────────
  const resumen = cuentas.length > 0 ? {
    totalCuentas: cuentas.length,
    sumaDebe:     cuentas.reduce((s, c) => s + c.debe,  0),
    sumaHaber:    cuentas.reduce((s, c) => s + c.haber, 0),
    sumaSD:       cuentas.reduce((s, c) => s + c.saldoDeudor,   0),
    sumaSA:       cuentas.reduce((s, c) => s + c.saldoAcreedor, 0),
    mesLeido:     cuentas[0]?.mes,
    anioLeido:    cuentas[0]?.anio,
  } : null;

  const difSdSa = resumen ? Math.abs(resumen.sumaSD - resumen.sumaSA) : 0;

  return (
    <div style={{ background:C.bg, color:C.text, padding:'20px 24px', minHeight:'60vh' }}>

      {/* ── Encabezado ── */}
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:16, fontWeight:900, color:C.accentL, marginBottom:4 }}>
          Test Parser EEFF — Parte 1 y 2
        </div>
        <div style={{ fontSize:11, color:C.muted }}>
          Sube un balance Megasystem (.xls) o Contec (.xlsx) para validar el parseo y la clasificación IFRS.
        </div>
      </div>

      {/* ── Panel Plan Maestro ── */}
      <div style={{ background:C.card2, border:`1px solid ${C.border}`, borderRadius:10,
        padding:'10px 16px', marginBottom:16, display:'flex', gap:16, alignItems:'center',
        flexWrap:'wrap' }}>
        <div style={{ fontSize:9, color:C.muted, textTransform:'uppercase', minWidth:80 }}>Plan Maestro</div>
        {planCargando && <span style={{ fontSize:11, color:C.muted }}>Cargando...</span>}
        {!planCargando && planMaps && (
          <>
            <span style={{ fontSize:11, color:C.green, fontWeight:700 }}>Cargado</span>
            <span style={{ fontSize:10, color:C.muted }}>
              {planMaps.mega.size} cuentas MEGA · {planMaps.contec.size} cuentas CONTEC
            </span>
            {planMeta && (
              <span style={{ fontSize:10, color:C.muted2 }}>
                {planMeta.version} · {planMeta.cargadoEn ? new Date(planMeta.cargadoEn).toLocaleDateString('es-CL') : ''} · {planMeta.cargadoPor}
              </span>
            )}
          </>
        )}
        {!planCargando && !planMaps && (
          <span style={{ fontSize:11, color:C.yellow }}>Sin cargar — sube el xlsx del Plan Maestro</span>
        )}
        {isAdmin && (
          <>
            <input ref={planFileRef} type="file" accept=".xlsx"
              onChange={e => handlePlanFile(e.target.files[0])}
              style={{ display:'none' }} />
            <Btn onClick={() => planFileRef.current?.click()}
              color={C.purple} disabled={planGuardando} small>
              {planGuardando ? 'Guardando...' : planMaps ? 'Actualizar Plan Maestro' : 'Cargar Plan Maestro'}
            </Btn>
          </>
        )}
        {planError && (
          <span style={{ fontSize:10, color:C.red }}>Error: {planError}</span>
        )}
      </div>

      {/* ── Controles balance ── */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:16, alignItems:'center' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          <label style={{ fontSize:9, color:C.muted, textTransform:'uppercase' }}>Empresa</label>
          <select value={empresa} onChange={e => {
            setEmpresa(e.target.value);
            setCuentas([]); setFileName(null); setFormato(null); setError(null); setPagina(0);
            if (fileRef.current) fileRef.current.value = '';
          }}
            style={{ padding:'6px 10px', borderRadius:6, background:C.card2, color:C.text,
              border:`1px solid ${C.border}`, fontSize:11 }}>
            {EMPRESAS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          <label style={{ fontSize:9, color:C.muted, textTransform:'uppercase' }}>Mes (Contec)</label>
          <select value={mes} onChange={e => setMes(Number(e.target.value))}
            style={{ padding:'6px 10px', borderRadius:6, background:C.card2, color:C.text,
              border:`1px solid ${C.border}`, fontSize:11 }}>
            {MESES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          <label style={{ fontSize:9, color:C.muted, textTransform:'uppercase' }}>Año (Contec)</label>
          <input type="number" value={anio} onChange={e => setAnio(Number(e.target.value))}
            style={{ padding:'6px 8px', width:72, borderRadius:6, background:C.card2, color:C.text,
              border:`1px solid ${C.border}`, fontSize:11 }} />
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          <label style={{ fontSize:9, color:C.muted, textTransform:'uppercase' }}>Archivo balance</label>
          <input ref={fileRef} type="file" accept=".xls,.xlsx"
            onChange={e => handleFile(e.target.files[0])}
            style={{ display:'none' }} />
          <Btn onClick={() => fileRef.current?.click()} color={C.accent}>
            Seleccionar archivo
          </Btn>
        </div>
      </div>

      {/* ── Drop zone ── */}
      <div
        onDrop={onDrop}
        onDragOver={e => e.preventDefault()}
        style={{ border:`2px dashed ${C.muted2}`, borderRadius:10, padding:'14px 20px',
          marginBottom:16, textAlign:'center', fontSize:11, color:C.muted,
          background:C.bg2, cursor:'pointer' }}
        onClick={() => fileRef.current?.click()}>
        {fileName
          ? <span style={{ color:C.accentL }}>Archivo cargado: <strong>{fileName}</strong></span>
          : 'Arrastra un archivo .xls o .xlsx aquí, o haz click para seleccionar'}
      </div>

      {loading && (
        <div style={{ color:C.yellow, fontSize:12, marginBottom:12 }}>Parseando archivo...</div>
      )}
      {error && (
        <div style={{ color:C.red, background:`${C.red}18`, border:`1px solid ${C.red}44`,
          borderRadius:8, padding:'8px 14px', fontSize:11, marginBottom:12 }}>
          Error: {error}
        </div>
      )}

      {/* ── Resumen de validación ── */}
      {resumen && (
        <div style={{ background:C.card2, border:`1px solid ${C.border}`, borderRadius:10,
          padding:'12px 18px', marginBottom:16, display:'flex', gap:24, flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:9, color:C.muted, textTransform:'uppercase', marginBottom:2 }}>Formato</div>
            <div style={{ fontSize:13, fontWeight:800, color:formato==='megasystem'?C.yellow:C.accentL }}>
              {formato === 'megasystem' ? 'Megasystem (.xls)' : 'Contec (.xlsx)'}
            </div>
          </div>
          <div>
            <div style={{ fontSize:9, color:C.muted, textTransform:'uppercase', marginBottom:2 }}>Cuentas</div>
            <div style={{ fontSize:13, fontWeight:800, color:C.text }}>{resumen.totalCuentas}</div>
          </div>
          <div>
            <div style={{ fontSize:9, color:C.muted, textTransform:'uppercase', marginBottom:2 }}>Σ Debe</div>
            <div style={{ fontSize:12, fontWeight:700, color:C.green }}>{fmtMonto(resumen.sumaDebe, 0)}</div>
          </div>
          <div>
            <div style={{ fontSize:9, color:C.muted, textTransform:'uppercase', marginBottom:2 }}>Σ Haber</div>
            <div style={{ fontSize:12, fontWeight:700, color:C.green }}>{fmtMonto(resumen.sumaHaber, 0)}</div>
          </div>
          <div>
            <div style={{ fontSize:9, color:C.muted, textTransform:'uppercase', marginBottom:2 }}>Σ SD</div>
            <div style={{ fontSize:12, fontWeight:700, color:C.blue }}>{fmtMonto(resumen.sumaSD, 0)}</div>
          </div>
          <div>
            <div style={{ fontSize:9, color:C.muted, textTransform:'uppercase', marginBottom:2 }}>Σ SA</div>
            <div style={{ fontSize:12, fontWeight:700, color:C.blue }}>{fmtMonto(resumen.sumaSA, 0)}</div>
          </div>
          {resumen.mesLeido && (
            <div>
              <div style={{ fontSize:9, color:C.muted, textTransform:'uppercase', marginBottom:2 }}>Período leído</div>
              <div style={{ fontSize:12, fontWeight:700, color:C.text }}>
                {NOMBRES_MES[resumen.mesLeido] || resumen.mesLeido} {resumen.anioLeido}
              </div>
            </div>
          )}
          <div>
            <div style={{ fontSize:9, color:C.muted, textTransform:'uppercase', marginBottom:2 }}>Balance (SD - SA)</div>
            <div style={{ fontSize:12, fontWeight:700, color: difSdSa < 1 ? C.green : C.yellow }}>
              {fmtMonto(resumen.sumaSD - resumen.sumaSA, 2)}
              {difSdSa >= 1 && <span style={{ fontSize:9, color:C.yellow, marginLeft:6 }}>⚠ diferencia</span>}
            </div>
          </div>
        </div>
      )}

      {/* ── Panel de clasificación IFRS ── */}
      {clasif && (
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:12, fontWeight:800, color:C.accentL, marginBottom:8 }}>
            Clasificación IFRS
          </div>

          {/* Contadores */}
          <div style={{ display:'flex', gap:12, marginBottom:12, flexWrap:'wrap' }}>
            {[
              { label:'Estado de Situación', n: clasif.situacion.length,     color: C.green  },
              { label:'Estado de Resultados', n: clasif.resultados.length,   color: C.blue   },
              { label:'Sin clasificar',        n: clasif.sinClasificar.length, color: clasif.sinClasificar.length > 0 ? C.yellow : C.muted },
            ].map(({ label, n, color }) => (
              <div key={label} style={{ background:C.card2, border:`1px solid ${C.border}`,
                borderRadius:8, padding:'10px 16px', minWidth:160 }}>
                <div style={{ fontSize:9, color:C.muted, textTransform:'uppercase', marginBottom:4 }}>{label}</div>
                <div style={{ fontSize:20, fontWeight:900, color }}>{n}</div>
                <div style={{ fontSize:9, color:C.muted2 }}>cuentas</div>
              </div>
            ))}
          </div>

          {/* Lista de sin clasificar */}
          {clasif.sinClasificar.length > 0 && (
            <div style={{ background:C.card2, border:`1px solid ${C.yellow}44`,
              borderRadius:10, padding:'10px 16px' }}>
              <div style={{ fontSize:10, fontWeight:700, color:C.yellow, marginBottom:8 }}>
                Cuentas sin clasificar — {clasif.sinClasificar.length} ({' '}
                no están en el Plan Maestro {formato === 'megasystem' ? 'MEGA' : 'CONTEC'})
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ borderCollapse:'collapse', width:'100%', fontSize:10 }}>
                  <thead>
                    <tr style={{ background:C.bg2 }}>
                      {['Código','Nombre','SD','SA'].map(h => (
                        <th key={h} style={{ padding:'4px 10px', textAlign: h==='Código'||h==='Nombre'?'left':'right',
                          color:C.muted, fontSize:9, textTransform:'uppercase',
                          borderBottom:`1px solid ${C.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {clasif.sinClasificar.map((c, i) => (
                      <tr key={c.codigo + i}
                        style={{ background: i%2===0?C.bg:C.bg2, borderBottom:`1px solid ${C.border}22` }}>
                        <td style={{ padding:'3px 10px', color:C.yellow }}>{c.codigo}</td>
                        <td style={{ padding:'3px 10px', color:C.text, whiteSpace:'nowrap' }}>{c.nombre}</td>
                        <td style={{ padding:'3px 10px', textAlign:'right', color:C.muted2 }}>
                          {c.saldoDeudor !== 0 ? fmtMonto(c.saldoDeudor, 2) : '—'}
                        </td>
                        <td style={{ padding:'3px 10px', textAlign:'right', color:C.muted2 }}>
                          {c.saldoAcreedor !== 0 ? fmtMonto(c.saldoAcreedor, 2) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {clasif.sinClasificar.length === 0 && (
            <div style={{ fontSize:11, color:C.green }}>
              Todas las cuentas clasificadas correctamente.
            </div>
          )}
        </div>
      )}

      {/* ── Panel Guardar / Verificar EEFF ── */}
      {clasif && canEdit && (
        <div style={{ background:C.card2, border:`1px solid ${C.border}`, borderRadius:10,
          padding:'12px 16px', marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.accentL, marginBottom:10 }}>
            Persistencia EEFF — {eeffId(empresa, anio, mes)}
          </div>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
            <Btn onClick={handleGuardar} disabled={guardando} color={C.green}>
              {guardando ? 'Guardando...' : 'Guardar EEFF'}
            </Btn>
            {guardadoId && (
              <Btn onClick={handleVerificar} disabled={verificando} color={C.blue}>
                {verificando ? 'Verificando...' : 'Recargar y verificar'}
              </Btn>
            )}
            {guardadoId && !verificando && (
              <span style={{ fontSize:10, color:C.green }}>
                Guardado: <code style={{ fontSize:10 }}>{guardadoId}</code>
              </span>
            )}
            {guardadoError && (
              <span style={{ fontSize:10, color:C.red }}>Error: {guardadoError}</span>
            )}
          </div>

          {/* Resultado de verificación */}
          {verificacion && (
            <div style={{ marginTop:12, background: verificacion.ok ? `${C.green}11` : `${C.red}11`,
              border:`1px solid ${verificacion.ok ? C.green : C.red}44`,
              borderRadius:8, padding:'10px 14px' }}>
              {!verificacion.ok ? (
                <span style={{ fontSize:11, color:C.red }}>{verificacion.msg}</span>
              ) : (
                <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
                  {[
                    { label:'Empresa',    v: verificacion.empresa },
                    { label:'Período',    v: `${NOMBRES_MES[verificacion.mes]} ${verificacion.anio}` },
                    { label:'Sistema',    v: verificacion.sistema },
                    { label:'Total cuentas', v: verificacion.total },
                    { label:'Situación', v: verificacion.situacion },
                    { label:'Resultados', v: verificacion.resultados },
                    { label:'Sin clasificar', v: verificacion.sinClasif },
                    { label:'Guardado por', v: verificacion.guardadoPor },
                  ].map(({ label, v }) => (
                    <div key={label}>
                      <div style={{ fontSize:9, color:C.muted, textTransform:'uppercase', marginBottom:2 }}>{label}</div>
                      <div style={{ fontSize:12, fontWeight:700, color:C.text }}>{v}</div>
                    </div>
                  ))}
                  <div>
                    <div style={{ fontSize:9, color:C.muted, textTransform:'uppercase', marginBottom:2 }}>
                      composicion + narrativa
                    </div>
                    <div style={{ fontSize:12, fontWeight:700,
                      color: verificacion.camposOk ? C.green : C.red }}>
                      {verificacion.camposOk ? 'null en todas las cuentas' : 'PROBLEMA — revisar'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Mensaje si hay cuentas pero no hay plan cargado */}
      {cuentas.length > 0 && !planMaps && (
        <div style={{ color:C.yellow, fontSize:11, marginBottom:16, background:`${C.yellow}11`,
          border:`1px solid ${C.yellow}44`, borderRadius:8, padding:'8px 14px' }}>
          Carga el Plan Maestro para ver la clasificación IFRS.
          {isAdmin ? ' Usa el botón "Cargar Plan Maestro" arriba.' : ' Pídele al administrador que lo suba.'}
        </div>
      )}

      {/* ── Tabla de cuentas (parser raw) ── */}
      {cuentas.length > 0 && (
        <>
          <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:6 }}>
            Cuentas parseadas (raw)
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8, flexWrap:'wrap' }}>
            <span style={{ fontSize:11, color:C.muted }}>
              Mostrando {pagina * POR_PAGINA + 1}–{Math.min((pagina + 1) * POR_PAGINA, cuentas.length)} de {cuentas.length}
            </span>
            <div style={{ display:'flex', gap:4 }}>
              <Btn onClick={() => setPagina(p => Math.max(0, p-1))} disabled={pagina===0} color={C.muted}>◀</Btn>
              <span style={{ fontSize:11, color:C.muted, alignSelf:'center' }}>{pagina+1}/{totalPaginas}</span>
              <Btn onClick={() => setPagina(p => Math.min(totalPaginas-1, p+1))} disabled={pagina===totalPaginas-1} color={C.muted}>▶</Btn>
            </div>
          </div>

          <div style={{ overflowX:'auto', borderRadius:10, border:`1px solid ${C.border}` }}>
            <table style={{ borderCollapse:'collapse', width:'100%', fontSize:11 }}>
              <thead>
                <tr style={{ background:C.bg2 }}>
                  {COLS_DISPLAY.map(col => (
                    <th key={col.key}
                      style={{ padding:'6px 10px', textAlign:col.align, color:C.muted,
                        fontSize:9, textTransform:'uppercase', fontWeight:700,
                        borderBottom:`1px solid ${C.border}`, whiteSpace:'nowrap' }}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((c, i) => (
                  <tr key={c.codigo + i}
                    style={{ background:i%2===0?C.bg:C.bg2, borderBottom:`1px solid ${C.border}22` }}>
                    {COLS_DISPLAY.map(col => {
                      const v = c[col.key];
                      const isNum = NUMS.has(col.key);
                      const display = isNum ? (v !== 0 ? fmtMonto(v, 2) : '—') : (v ?? '—');
                      return (
                        <td key={col.key}
                          style={{ padding:'4px 10px', textAlign:col.align,
                            color: col.key==='codigo' ? C.accentL
                                 : isNum && v !== 0 ? C.text
                                 : C.muted2,
                            whiteSpace: col.key==='nombre' ? 'nowrap' : undefined }}>
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
