/* eslint-disable */
import React, { useState, useCallback, useRef } from 'react';
import { parsearBalance, detectarFormatoBalance, saldoEfectivo, fmtMonto, NOMBRES_MES } from './eeffHelpers.js';

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
};

function Btn({ onClick, children, active, color, disabled }) {
  const bg = active ? (color || C.accent) : 'transparent';
  const col = active ? '#fff' : (color || C.muted);
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding:'6px 14px', borderRadius:7, border:`1px solid ${color||C.accent}`,
        background:active?`${color||C.accent}cc`:disabled?C.bg2:`${color||C.accent}18`,
        color:disabled?C.muted2:col, cursor:disabled?'default':'pointer',
        fontSize:11, fontWeight:600, transition:'all 0.15s' }}>
      {children}
    </button>
  );
}

// ─── Columnas del parser para la tabla de validación ──────────────
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

  const POR_PAGINA = 60;

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setCuentas([]);
    setPagina(0);
    setFileName(file.name);
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

  const totalPaginas = Math.ceil(cuentas.length / POR_PAGINA);
  const filas = cuentas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);

  // Resumen para validación rápida
  const resumen = cuentas.length > 0 ? {
    totalCuentas: cuentas.length,
    sumaDebe:     cuentas.reduce((s, c) => s + c.debe, 0),
    sumaHaber:    cuentas.reduce((s, c) => s + c.haber, 0),
    sumaSD:       cuentas.reduce((s, c) => s + c.saldoDeudor, 0),
    sumaSA:       cuentas.reduce((s, c) => s + c.saldoAcreedor, 0),
    mesLeido:     cuentas[0]?.mes,
    anioLeido:    cuentas[0]?.anio,
  } : null;

  return (
    <div style={{ background:C.bg, color:C.text, padding:'20px 24px', minHeight:'60vh' }}>

      {/* ── Encabezado ── */}
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:16, fontWeight:900, color:C.accentL, marginBottom:4 }}>
          Test Parser EEFF — Parte 1
        </div>
        <div style={{ fontSize:11, color:C.muted }}>
          Sube un balance Megasystem (.xls) o Contec (.xlsx) para validar el parseo antes de continuar con la Parte 2.
        </div>
      </div>

      {/* ── Controles ── */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:16, alignItems:'center' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          <label style={{ fontSize:9, color:C.muted, textTransform:'uppercase' }}>Empresa</label>
          <select value={empresa} onChange={e => setEmpresa(e.target.value)}
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
          padding:'12px 18px', marginBottom:16, display:'flex', gap:24, flexWrap:'wrap',
          alignItems:'flex-start' }}>
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
            <div style={{ fontSize:12, fontWeight:700,
              color:Math.abs(resumen.sumaSD - resumen.sumaSA) < 0.01 ? C.green : C.yellow }}>
              {fmtMonto(resumen.sumaSD - resumen.sumaSA, 2)}
              {Math.abs(resumen.sumaSD - resumen.sumaSA) > 0.01 &&
                <span style={{ fontSize:9, color:C.yellow, marginLeft:6 }}>⚠ diferencia</span>}
            </div>
          </div>
        </div>
      )}

      {/* ── Tabla de cuentas ── */}
      {cuentas.length > 0 && (
        <>
          <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8, flexWrap:'wrap' }}>
            <span style={{ fontSize:11, color:C.muted }}>
              Mostrando {pagina * POR_PAGINA + 1}–{Math.min((pagina + 1) * POR_PAGINA, cuentas.length)} de {cuentas.length} cuentas
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
                      const display = isNum
                        ? (v !== 0 ? fmtMonto(v, 2) : '—')
                        : (v ?? '—');
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
