/* eslint-disable */
// src/anf/AnfTab.jsx
// Sub-tab "Análisis Financiero" dentro del módulo EEFF.
// Flujo: seleccionar filial+período → subir Excel → revisar → aprobar → exportar.

import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx-js-style';
import { theme } from '../theme';
import { parsearInformeANF, buildSaldosEsf, buildMovimientosEr, calcTemporada } from './anfParser';
import { calcularKpisDerivaos, KPI_LABELS, KPI_TOOLTIPS, KPI_GRUPOS } from './anfKpis';
import {
  cargarFiliales, cargarInformes, cargarInformeCompleto,
  crearInforme, actualizarEstadoInforme, actualizarTcInforme,
  guardarSaldosEsf, guardarMovimientosEr,
  importarNarrativas, guardarJustificacion,
  cargarMetricasConfig, cargarTodasMetricas, crearMetrica, actualizarMetrica,
  guardarKpiOp, guardarKpisDerivaos, cargarKpisDerivaos,
} from './anfPersistence';

const C = {
  ...theme,
  green:  theme.success,
  red:    theme.danger,
  yellow: theme.warning,
  blue:   theme.primary,
  teal:   theme.accent2,
};

const NOMBRES_MES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
                     'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ── Helpers de UI ────────────────────────────────────────────────────────────

function Btn({ onClick, children, color, small, disabled, style = {} }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        background: disabled ? C.border : (color || C.primary),
        color: '#fff', border: 'none', borderRadius: 6,
        padding: small ? '4px 10px' : '6px 14px',
        fontSize: small ? 10 : 11, fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1, ...style,
      }}>
      {children}
    </button>
  );
}

function Badge({ estado }) {
  const MAP = {
    borrador:  [C.muted,   '#ffffff22', 'Borrador'],
    enviado:   [C.yellow,  `${C.yellow}22`, 'Enviado'],
    aprobado:  [C.green,   `${C.green}22`,  'Aprobado'],
    rechazado: [C.red,     `${C.red}22`,    'Rechazado'],
  };
  const [col, bg, label] = MAP[estado] || [C.muted, '#ffffff22', estado];
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 10,
      background: bg, color: col, border: `1px solid ${col}44`,
    }}>
      {label.toUpperCase()}
    </span>
  );
}

function Semaforo({ varPct, piso = 10 }) {
  if (varPct == null) return <span style={{ color: C.muted, fontSize: 10 }}>—</span>;
  const abs = Math.abs(varPct);
  const color = abs >= piso ? C.red : abs >= piso / 2 ? C.yellow : C.green;
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: color, marginRight: 4,
    }} title={`Var: ${varPct.toFixed(1)}%`} />
  );
}

function fmtNum(v, dec = 0) {
  if (v == null || isNaN(v)) return '—';
  return v.toLocaleString('es-CL', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtPct(v) {
  if (v == null || isNaN(v)) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
}

// Clasifica cuenta ER por prefijo numérico (igual que anfParser.js — fallback client-side).
function clasificarGrupoEr(codigo) {
  const pref = (codigo || '').split('.')[0];
  switch (pref) {
    case '4': return 'Ingreso Operacional';
    case '5': return 'Costo Operacional';
    case '6': return 'Gasto Operacional';
    case '7': return 'Ingreso No Operacional';
    case '8': return 'Gasto No Operacional';
    case '9': return 'Impuesto';
    default:  return 'Gasto Operacional';
  }
}

// ── Sección ESF ──────────────────────────────────────────────────────────────

function clasificarSeccionEsf(codigo) {
  const parts = (codigo || '').split('.');
  const p1 = parts[0], p2 = parts[1];
  if (p1 === '1') return p2 === '01' ? 'Activo Corriente' : 'Activo No Corriente';
  if (p1 === '2') return p2 === '01' ? 'Pasivo Corriente' : 'Pasivo No Corriente';
  if (p1 === '3') return 'Patrimonio';
  return 'Activo Corriente';
}

function TablaEsf({ saldos, piso }) {
  const [expandido, setExpandido] = useState(true);
  const [filtroMat, setFiltroMat] = useState(false);
  const SECCIONES = ['Activo Corriente', 'Activo No Corriente', 'Pasivo Corriente', 'Pasivo No Corriente', 'Patrimonio'];

  const filas = useMemo(() => {
    const f = filtroMat ? saldos.filter(s => s.es_material) : saldos;
    return f;
  }, [saldos, filtroMat]);

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <button onClick={() => setExpandido(e => !e)}
          style={{ fontWeight: 800, fontSize: 12, color: C.blue, background: 'none',
            border: 'none', cursor: 'pointer' }}>
          {expandido ? '▼' : '►'} Estado de Situación Financiera
        </button>
        {expandido && (
          <label style={{ fontSize: 10, color: C.muted, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={filtroMat} onChange={e => setFiltroMat(e.target.checked)} />
            Solo materiales
          </label>
        )}
        <span style={{ fontSize: 10, color: C.muted }}>
          {saldos.filter(s => s.es_material).length} materiales / {saldos.length} cuentas
        </span>
      </div>

      {expandido && (
        <div style={{ overflowX: 'auto' }}>
          {SECCIONES.map(seccion => {
            const cuentas = filas.filter(s =>
              (s.categoria_ifrs || clasificarSeccionEsf(s.codigo)) === seccion ||
              s.categoria_ifrs?.startsWith(seccion.split(' ')[0]));
            if (!cuentas.length) return null;
            const totalNeto = cuentas.reduce((a, c) => a + (c.saldo_neto || 0), 0);
            return (
              <div key={seccion} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: C.blue,
                  background: `${C.blue}15`, padding: '3px 8px', borderRadius: 4, marginBottom: 2 }}>
                  {seccion} — Total: {fmtNum(totalNeto)}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                  <thead>
                    <tr style={{ background: C.card }}>
                      <th style={{ width: 8 }}></th>
                      <th style={{ padding: '3px 6px', textAlign: 'left', color: C.muted }}>Código</th>
                      <th style={{ padding: '3px 6px', textAlign: 'left', color: C.muted }}>Nombre</th>
                      <th style={{ padding: '3px 6px', textAlign: 'right', color: C.muted }}>Saldo actual</th>
                      <th style={{ padding: '3px 6px', textAlign: 'right', color: C.muted }}>Año anterior</th>
                      <th style={{ padding: '3px 6px', textAlign: 'right', color: C.muted }}>Var $</th>
                      <th style={{ padding: '3px 6px', textAlign: 'right', color: C.muted }}>Var %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuentas.map((c, i) => (
                      <tr key={c.codigo} style={{ background: i % 2 ? C.bg : `${C.card}80` }}>
                        <td style={{ textAlign: 'center', paddingLeft: 4 }}>
                          <Semaforo varPct={c.var_pct} piso={piso} />
                        </td>
                        <td style={{ padding: '2px 6px', color: C.muted, fontFamily: 'monospace' }}>{c.codigo}</td>
                        <td style={{ padding: '2px 6px' }}>{c.nombre || c.nombre_origen}</td>
                        <td style={{ padding: '2px 6px', textAlign: 'right' }}>{fmtNum(c.saldo_neto)}</td>
                        <td style={{ padding: '2px 6px', textAlign: 'right', color: C.muted }}>{fmtNum(c.saldo_neto_t1)}</td>
                        <td style={{ padding: '2px 6px', textAlign: 'right',
                          color: c.var_abs > 0 ? C.green : c.var_abs < 0 ? C.red : C.text }}>
                          {fmtNum(c.var_abs)}
                        </td>
                        <td style={{ padding: '2px 6px', textAlign: 'right',
                          color: c.var_pct != null && Math.abs(c.var_pct) >= piso
                            ? (c.var_pct > 0 ? C.green : C.red)
                            : C.text }}>
                          {fmtPct(c.var_pct)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Sección ER ───────────────────────────────────────────────────────────────

function TablaEr({ movimientos, mes, piso, justif = [], informeId, canEdit, usuarioActual }) {
  const [expandido,  setExpandido]  = useState(true);
  const [vistaEr,    setVistaEr]    = useState('mes');
  const [filtroMat,  setFiltroMat]  = useState(false);
  const [justAbierto, setJustAbierto] = useState({});
  const [justTexts,   setJustTexts]   = useState({});
  const [justGuard,   setJustGuard]   = useState({});

  const GRUPOS_ER = [
    { key: 'Ingreso Operacional',    label: 'Ingresos Operacionales',  signo: 1 },
    { key: 'Costo Operacional',      label: 'Costos',                  signo: -1 },
    { key: 'Gasto Operacional',      label: 'Gastos Operacionales',    signo: -1 },
    { key: 'Ingreso No Operacional', label: 'Ingresos No Oper.',       signo: 1 },
    { key: 'Gasto No Operacional',   label: 'Gastos No Oper.',         signo: -1 },
    { key: 'Impuesto',               label: 'Impuesto a la Renta',     signo: -1 },
  ];

  // Mapa código → justificación existente
  const justMap = useMemo(() => {
    const m = {};
    justif.forEach(j => { m[j.codigo] = j; });
    return m;
  }, [justif]);

  useEffect(() => {
    const init = {};
    justif.forEach(j => { init[j.codigo] = j.texto || j.texto_original || ''; });
    setJustTexts(t => ({ ...init, ...t }));
  }, [justif]);

  async function guardarJust(codigo) {
    if (!informeId) return;
    const texto = justTexts[codigo] || '';
    setJustGuard(g => ({ ...g, [codigo]: true }));
    try {
      await guardarJustificacion(informeId, codigo, 'er', texto, usuarioActual?.nombre);
    } catch (e) { console.error('guardarJust:', e); }
    finally { setJustGuard(g => ({ ...g, [codigo]: false })); }
  }

  function toggleJust(codigo) {
    setJustAbierto(a => ({ ...a, [codigo]: !a[codigo] }));
  }

  function realField() {
    return vistaEr === 'mes' ? 'real_mes' : vistaEr === 'ytd' ? 'real_ytd' : 'real_temporada';
  }
  function pptoField() {
    return vistaEr === 'mes' ? 'ppto_mes' : vistaEr === 'ytd' ? 'ppto_ytd' : 'ppto_temporada';
  }

  function varPctEr(real, ppto) {
    if (ppto == null || ppto === 0) return null;
    return ((real - ppto) / Math.abs(ppto)) * 100;
  }

  const filas = useMemo(() => {
    const rf = realField();
    if (!filtroMat) return movimientos;
    return movimientos.filter(m => {
      const vp = varPctEr(m[rf] || 0, m[pptoField()]);
      return vp != null && Math.abs(vp) >= piso;
    });
  }, [movimientos, filtroMat, vistaEr, piso]);

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <button onClick={() => setExpandido(e => !e)}
          style={{ fontWeight: 800, fontSize: 12, color: C.blue, background: 'none',
            border: 'none', cursor: 'pointer' }}>
          {expandido ? '▼' : '►'} Estado de Resultados
        </button>
        {expandido && (
          <>
            <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: `1px solid ${C.border}` }}>
              {[['mes', 'Mes'], ['ytd', 'YTD'], ['temporada', 'Temporada']].map(([v, l]) => (
                <button key={v} onClick={() => setVistaEr(v)}
                  style={{ padding: '3px 10px', fontSize: 10, cursor: 'pointer',
                    background: vistaEr === v ? C.blue : C.card,
                    color: vistaEr === v ? '#fff' : C.muted, border: 'none', fontWeight: 600 }}>
                  {l}
                </button>
              ))}
            </div>
            <label style={{ fontSize: 10, color: C.muted, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="checkbox" checked={filtroMat} onChange={e => setFiltroMat(e.target.checked)} />
              Solo materiales
            </label>
          </>
        )}
        <span style={{ fontSize: 10, color: C.muted }}>{movimientos.length} cuentas</span>
      </div>

      {expandido && (
        <div style={{ overflowX: 'auto' }}>
          {GRUPOS_ER.map(grupo => {
            const cuentas = filas.filter(m => (m.grupo_er || clasificarGrupoEr(m.codigo)) === grupo.key);
            if (!cuentas.length) return null;
            const rf = realField();
            const pf = pptoField();
            const totalReal = cuentas.reduce((a, c) => a + (c[rf] || 0), 0);
            const totalPpto = cuentas.reduce((a, c) => a + (c[pf] || 0), 0);
            return (
              <div key={grupo.key} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: C.blue,
                  background: `${C.blue}15`, padding: '3px 8px', borderRadius: 4, marginBottom: 2 }}>
                  {grupo.label} — Real: {fmtNum(totalReal)} · Ppto: {fmtNum(totalPpto)}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                  <thead>
                    <tr style={{ background: C.card }}>
                      <th style={{ width: 8 }}></th>
                      <th style={{ padding: '3px 6px', textAlign: 'left', color: C.muted }}>Código</th>
                      <th style={{ padding: '3px 6px', textAlign: 'left', color: C.muted }}>Nombre</th>
                      <th style={{ padding: '3px 6px', textAlign: 'right', color: C.muted }}>Real</th>
                      <th style={{ padding: '3px 6px', textAlign: 'right', color: C.muted }}>Ppto</th>
                      <th style={{ padding: '3px 6px', textAlign: 'right', color: C.muted }}>Var $</th>
                      <th style={{ padding: '3px 6px', textAlign: 'right', color: C.muted }}>Var %</th>
                      <th style={{ width: 24 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuentas.map((c, i) => {
                      const real = c[rf] || 0;
                      const ppto = c[pf];
                      const varAbs = ppto != null ? real - ppto : null;
                      const vp = varPctEr(real, ppto);
                      const tieneJust = !!(justMap[c.codigo]?.texto || justMap[c.codigo]?.texto_original || justTexts[c.codigo]);
                      const abierto = !!justAbierto[c.codigo];
                      return (
                        <React.Fragment key={c.codigo}>
                          <tr style={{ background: i % 2 ? C.bg : `${C.card}80` }}>
                            <td style={{ textAlign: 'center', paddingLeft: 4 }}>
                              <Semaforo varPct={vp} piso={piso} />
                            </td>
                            <td style={{ padding: '2px 6px', color: C.muted, fontFamily: 'monospace' }}>{c.codigo}</td>
                            <td style={{ padding: '2px 6px' }}>{c.nombre || c.nombre_origen}</td>
                            <td style={{ padding: '2px 6px', textAlign: 'right' }}>{fmtNum(real)}</td>
                            <td style={{ padding: '2px 6px', textAlign: 'right', color: C.muted }}>{fmtNum(ppto)}</td>
                            <td style={{ padding: '2px 6px', textAlign: 'right',
                              color: varAbs == null ? C.muted : varAbs >= 0 ? C.green : C.red }}>
                              {fmtNum(varAbs)}
                            </td>
                            <td style={{ padding: '2px 6px', textAlign: 'right',
                              color: vp != null && Math.abs(vp) >= piso ? C.red : C.text }}>
                              {fmtPct(vp)}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button onClick={() => toggleJust(c.codigo)}
                                title={tieneJust ? 'Ver/editar justificación' : 'Agregar justificación'}
                                style={{ background: 'none', border: 'none', cursor: 'pointer',
                                  fontSize: 11, padding: '1px 3px',
                                  color: tieneJust ? C.blue : abierto ? C.muted : `${C.muted}66` }}>
                                {tieneJust ? '✎' : '+'}
                              </button>
                            </td>
                          </tr>
                          {abierto && (
                            <tr style={{ background: i % 2 ? C.bg : `${C.card}80` }}>
                              <td colSpan={8} style={{ padding: '2px 10px 6px 32px' }}>
                                <textarea
                                  value={justTexts[c.codigo] || ''}
                                  onChange={e => setJustTexts(t => ({ ...t, [c.codigo]: e.target.value }))}
                                  onBlur={() => guardarJust(c.codigo)}
                                  disabled={!canEdit || justGuard[c.codigo]}
                                  rows={2}
                                  placeholder="Justificación para esta cuenta..."
                                  style={{ width: '100%', boxSizing: 'border-box',
                                    background: C.bg, color: C.text,
                                    border: `1px solid ${C.border}`, borderRadius: 4,
                                    padding: '4px 6px', fontSize: 10, resize: 'vertical',
                                    fontFamily: 'inherit' }}
                                />
                                {justGuard[c.codigo] && (
                                  <span style={{ fontSize: 9, color: C.muted }}>Guardando...</span>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Sección Narrativas ────────────────────────────────────────────────────────

function SeccionNarrativas({ informeId, justificaciones, canEdit, usuarioActual }) {
  const [textos, setTextos] = useState({});
  const [guardando, setGuardando] = useState({});

  useEffect(() => {
    const init = {};
    justificaciones.forEach(j => { init[`${j.codigo}_${j.tipo_estado}`] = j.texto || j.texto_original || ''; });
    setTextos(init);
  }, [justificaciones]);

  async function onBlur(codigo, tipoEstado) {
    const key = `${codigo}_${tipoEstado}`;
    const texto = textos[key] || '';
    setGuardando(g => ({ ...g, [key]: true }));
    try {
      await guardarJustificacion(informeId, codigo, tipoEstado, texto, usuarioActual?.nombre);
    } finally {
      setGuardando(g => ({ ...g, [key]: false }));
    }
  }

  if (!justificaciones.length) {
    return <div style={{ color: C.muted, fontSize: 11 }}>Sin narrativas. Se generan al cargar el Excel (sheet INFORME) o se ingresan manualmente.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {justificaciones.map(j => {
        const key = `${j.codigo}_${j.tipo_estado}`;
        return (
          <div key={key} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.blue }}>{j.codigo}</span>
              <span style={{ fontSize: 9, color: C.muted }}>{j.tipo_estado.toUpperCase()}</span>
            </div>
            {j.texto_original && j.texto_original !== textos[key] && (
              <div style={{ fontSize: 9, color: C.muted, marginBottom: 4, fontStyle: 'italic' }}>
                Original: {j.texto_original}
              </div>
            )}
            <textarea
              value={textos[key] || ''}
              onChange={e => setTextos(t => ({ ...t, [key]: e.target.value }))}
              onBlur={() => onBlur(j.codigo, j.tipo_estado)}
              disabled={!canEdit}
              rows={2}
              style={{ width: '100%', boxSizing: 'border-box', background: C.bg, color: C.text,
                border: `1px solid ${C.border}`, borderRadius: 4, padding: '4px 6px', fontSize: 11,
                resize: 'vertical', fontFamily: 'inherit' }}
            />
            {guardando[key] && <div style={{ fontSize: 9, color: C.muted }}>Guardando...</div>}
          </div>
        );
      })}
    </div>
  );
}

// ── Sección KPIs ─────────────────────────────────────────────────────────────

const KPI_COLORES_GRUPO = {
  rentabilidad:  C.green,
  liquidez:      C.blue,
  endeudamiento: C.red,
  balance:       C.teal,
  resultados:    C.yellow,
};

function TarjetaKpi({ k }) {
  const esPct    = k.unidad === '%';
  const esRatio  = k.unidad === 'x';
  const val      = k.valor;
  const dec      = esPct ? 1 : esRatio ? 3 : 0;
  return (
    <div title={KPI_TOOLTIPS[k.clave]}
      style={{ border: `1px solid ${C.border}`, borderRadius: 7,
        padding: '8px 12px', background: C.card }}>
      <div style={{ fontSize: 9, color: C.muted, marginBottom: 3, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.03em' }}>
        {KPI_LABELS[k.clave]}
      </div>
      <div style={{ fontSize: 16, fontWeight: 900, color: C.text, lineHeight: 1 }}>
        {val != null ? fmtNum(val, dec) : '—'}
        <span style={{ fontSize: 10, color: C.muted, marginLeft: 3, fontWeight: 400 }}>
          {val != null ? k.unidad : ''}
        </span>
      </div>
    </div>
  );
}

function SeccionKpis({ kpisDer, kpisOp, metricas }) {
  if (!kpisDer.length && !kpisOp.length) return null;
  const mapaKpis = Object.fromEntries(kpisDer.map(k => [k.clave, k]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {KPI_GRUPOS.map(grupo => {
        const items = grupo.claves.map(c => mapaKpis[c]).filter(Boolean);
        if (!items.length) return null;
        const color = KPI_COLORES_GRUPO[grupo.key] || C.blue;
        return (
          <div key={grupo.key}>
            <div style={{ fontSize: 10, fontWeight: 800, color: color,
              borderLeft: `3px solid ${color}`, paddingLeft: 8, marginBottom: 8,
              textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {grupo.label}
            </div>
            <div style={{ display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
              {items.map(k => <TarjetaKpi key={k.clave} k={k} />)}
            </div>
          </div>
        );
      })}

      {kpisOp.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.muted,
            borderLeft: `3px solid ${C.muted}`, paddingLeft: 8, marginBottom: 8,
            textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Operacionales
          </div>
          <div style={{ display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
            {kpisOp.map(k => (
              <div key={k.metrica_id}
                style={{ border: `1px solid ${C.border}`, borderRadius: 7,
                  padding: '8px 12px', background: C.card }}>
                <div style={{ fontSize: 9, color: C.muted, marginBottom: 3, fontWeight: 600,
                  textTransform: 'uppercase' }}>
                  {k.anf_metricas_config?.nombre}
                </div>
                <div style={{ fontSize: 16, fontWeight: 900, color: C.text }}>
                  {fmtNum(k.valor_real)}
                  <span style={{ fontSize: 10, color: C.muted, marginLeft: 3 }}>
                    {k.anf_metricas_config?.unidad}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Panel configuración de métricas operacionales ────────────────────────────

function PanelMetricasConfig({ filialId, metricasAll, onRefresh, canEdit }) {
  const [abierto,   setAbierto]   = useState(false);
  const [nombre,    setNombre]    = useState('');
  const [unidad,    setUnidad]    = useState('');
  const [guardando, setGuardando] = useState(false);

  async function agregar() {
    if (!nombre.trim()) return;
    setGuardando(true);
    try {
      await crearMetrica(filialId, { nombre: nombre.trim(), unidad: unidad.trim(), orden: metricasAll.length });
      setNombre(''); setUnidad('');
      onRefresh();
    } catch (e) {
      alert('Error al crear métrica: ' + e.message);
    } finally {
      setGuardando(false);
    }
  }

  async function toggleActiva(m) {
    try {
      await actualizarMetrica(m.id, { activa: !m.activa });
      onRefresh();
    } catch (e) { alert('Error: ' + e.message); }
  }

  async function moverOrden(m, dir, idx) {
    const swap = metricasAll[idx + dir];
    if (!swap) return;
    try {
      await Promise.all([
        actualizarMetrica(m.id,    { orden: swap.orden }),
        actualizarMetrica(swap.id, { orden: m.orden }),
      ]);
      onRefresh();
    } catch (e) { alert('Error: ' + e.message); }
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <button onClick={() => setAbierto(a => !a)}
        style={{ fontSize: 10, color: C.muted, background: 'none', border: 'none',
          cursor: 'pointer', padding: 0 }}>
        {abierto ? '▼' : '►'} Configurar métricas operacionales
        {metricasAll.length > 0 && (
          <span style={{ marginLeft: 6, fontSize: 9, color: C.muted }}>
            ({metricasAll.filter(m => m.activa).length} activas)
          </span>
        )}
      </button>

      {abierto && (
        <div style={{ marginTop: 8, padding: '10px 12px', background: C.card,
          border: `1px solid ${C.border}`, borderRadius: 7 }}>

          {metricasAll.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 10, marginBottom: 8 }}>
              Sin métricas configuradas para esta empresa.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, marginBottom: 10 }}>
              <thead>
                <tr>
                  {['Nombre','Unidad','Activa','Orden'].map(h => (
                    <th key={h} style={{ textAlign: h === 'Orden' || h === 'Activa' ? 'center' : 'left',
                      color: C.muted, padding: '2px 6px', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metricasAll.map((m, idx) => (
                  <tr key={m.id} style={{ background: idx % 2 ? C.bg : 'transparent',
                    opacity: m.activa ? 1 : 0.5 }}>
                    <td style={{ padding: '3px 6px' }}>{m.nombre}</td>
                    <td style={{ padding: '3px 6px', color: C.muted }}>{m.unidad || '—'}</td>
                    <td style={{ padding: '3px 6px', textAlign: 'center' }}>
                      {canEdit
                        ? <input type="checkbox" checked={!!m.activa} onChange={() => toggleActiva(m)} />
                        : <span>{m.activa ? 'Sí' : 'No'}</span>}
                    </td>
                    <td style={{ padding: '3px 6px', textAlign: 'center' }}>
                      {canEdit && (
                        <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                          <button onClick={() => moverOrden(m, -1, idx)} disabled={idx === 0}
                            style={{ fontSize: 10, padding: '1px 5px', cursor: 'pointer',
                              background: C.bg, border: `1px solid ${C.border}`, borderRadius: 3 }}>↑</button>
                          <button onClick={() => moverOrden(m, 1, idx)} disabled={idx === metricasAll.length - 1}
                            style={{ fontSize: 10, padding: '1px 5px', cursor: 'pointer',
                              background: C.bg, border: `1px solid ${C.border}`, borderRadius: 3 }}>↓</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {canEdit && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input value={nombre} onChange={e => setNombre(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && agregar()}
                placeholder="Nombre métrica (ej: Cajas exportadas)"
                style={{ flex: 2, minWidth: 160, padding: '5px 8px', borderRadius: 5,
                  background: C.bg, color: C.text, border: `1px solid ${C.border}`, fontSize: 11 }} />
              <input value={unidad} onChange={e => setUnidad(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && agregar()}
                placeholder="Unidad (ej: cajas)"
                style={{ flex: 1, minWidth: 80, padding: '5px 8px', borderRadius: 5,
                  background: C.bg, color: C.text, border: `1px solid ${C.border}`, fontSize: 11 }} />
              <Btn onClick={agregar} disabled={!nombre.trim() || guardando} color={C.teal} small>
                {guardando ? '...' : 'Añadir'}
              </Btn>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Ingreso manual de KPIs operacionales ──────────────────────────────────────

function SeccionKpisOpEdit({ informeId, metricas, kpisOp, canEdit, usuarioActual }) {
  const [vals,      setVals]      = useState({});
  const [guardando, setGuardando] = useState({});

  useEffect(() => {
    const init = {};
    metricas.forEach(m => {
      const ex = kpisOp.find(k => k.metrica_id === m.id);
      init[m.id] = {
        real: ex?.valor_real  != null ? String(ex.valor_real)  : '',
        ppto: ex?.valor_ppto  != null ? String(ex.valor_ppto)  : '',
        t1:   ex?.valor_t1   != null ? String(ex.valor_t1)    : '',
        nota: ex?.nota || '',
      };
    });
    setVals(init);
  }, [metricas, kpisOp]);

  function parseNum(s) {
    const n = parseFloat(String(s).replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  function upd(metricaId, campo, value) {
    setVals(v => ({ ...v, [metricaId]: { ...v[metricaId], [campo]: value } }));
  }

  async function guardar(metricaId) {
    const v = vals[metricaId];
    if (!v) return;
    setGuardando(g => ({ ...g, [metricaId]: true }));
    try {
      await guardarKpiOp(informeId, metricaId, {
        valorReal:    parseNum(v.real),
        valorPpto:    parseNum(v.ppto),
        valorT1:      parseNum(v.t1),
        nota:         v.nota || null,
        ingresadoPor: usuarioActual?.nombre,
      });
    } catch (e) {
      alert('Error guardando: ' + e.message);
    } finally {
      setGuardando(g => ({ ...g, [metricaId]: false }));
    }
  }

  if (!metricas.length) {
    return (
      <div style={{ color: C.muted, fontSize: 10, fontStyle: 'italic' }}>
        Sin métricas configuradas. Usa "Configurar métricas operacionales" para añadirlas.
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ background: C.card }}>
            {['Métrica','Unidad','Real','Ppto','Año ant.','Nota','Var%'].map(h => (
              <th key={h} style={{ padding: '4px 8px',
                textAlign: ['Real','Ppto','Año ant.','Var%'].includes(h) ? 'right' : 'left',
                color: C.muted, fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metricas.map((m, i) => {
            const v = vals[m.id] || {};
            const real = parseFloat(String(v.real || '').replace(',', '.'));
            const ppto = parseFloat(String(v.ppto || '').replace(',', '.'));
            const varPct = !isNaN(real) && !isNaN(ppto) && ppto !== 0
              ? ((real - ppto) / Math.abs(ppto)) * 100 : null;
            const enGuardando = !!guardando[m.id];

            function input(campo, width = 80) {
              if (!canEdit) return <span>{v[campo] || '—'}</span>;
              return (
                <input type="text" value={v[campo] ?? ''}
                  onChange={e => upd(m.id, campo, e.target.value)}
                  onBlur={() => guardar(m.id)}
                  disabled={enGuardando}
                  style={{ width, textAlign: campo === 'nota' ? 'left' : 'right',
                    padding: '3px 5px', borderRadius: 4, background: C.bg, color: C.text,
                    border: `1px solid ${C.border}`, fontSize: 11 }} />
              );
            }

            return (
              <tr key={m.id} style={{ background: i % 2 ? C.bg : `${C.card}80` }}>
                <td style={{ padding: '4px 8px', fontWeight: 600 }}>{m.nombre}</td>
                <td style={{ padding: '4px 8px', color: C.muted }}>{m.unidad || '—'}</td>
                <td style={{ padding: '3px 4px', textAlign: 'right' }}>{input('real')}</td>
                <td style={{ padding: '3px 4px', textAlign: 'right' }}>{input('ppto')}</td>
                <td style={{ padding: '3px 4px', textAlign: 'right' }}>{input('t1')}</td>
                <td style={{ padding: '3px 4px' }}>{input('nota', 120)}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                  {varPct != null ? (
                    <span style={{ color: varPct >= 0 ? C.green : C.red, fontWeight: 700 }}>
                      {varPct >= 0 ? '+' : ''}{varPct.toFixed(1)}%
                    </span>
                  ) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Vista comparativa mes vs mes (misma empresa) ─────────────────────────────

function VistaComparativoMeses({ filiales, informes, filialIdDefault, anioDefault, mesDefault }) {
  const mesAnterior = mesDefault === 1 ? 12 : mesDefault - 1;
  const anioAnterior = mesDefault === 1 ? anioDefault - 1 : anioDefault;

  const [filialSel, setFilialSel] = useState(filialIdDefault || '');
  const [mesA,  setMesA]  = useState(mesDefault);
  const [anioA, setAnioA] = useState(anioDefault);
  const [mesB,  setMesB]  = useState(mesAnterior);
  const [anioB, setAnioB] = useState(anioAnterior);
  const [kpisA, setKpisA] = useState([]);
  const [kpisB, setKpisB] = useState([]);
  const [infA,  setInfA]  = useState(null);
  const [infB,  setInfB]  = useState(null);
  const [cargando, setCargando] = useState(false);

  const informesFilial = useMemo(() =>
    informes.filter(i => i.filial_id === filialSel),
    [informes, filialSel]
  );

  async function cargar() {
    if (!filialSel) return;
    setCargando(true);
    try {
      const [iA, iB] = [
        informesFilial.find(i => i.mes === mesA && i.anio === anioA),
        informesFilial.find(i => i.mes === mesB && i.anio === anioB),
      ];
      setInfA(iA || null);
      setInfB(iB || null);
      const [ka, kb] = await Promise.all([
        iA ? cargarKpisDerivaos(iA.id) : Promise.resolve([]),
        iB ? cargarKpisDerivaos(iB.id) : Promise.resolve([]),
      ]);
      setKpisA(ka);
      setKpisB(kb);
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setCargando(false);
    }
  }

  const mapaA = Object.fromEntries(kpisA.map(k => [k.clave, k]));
  const mapaB = Object.fromEntries(kpisB.map(k => [k.clave, k]));
  const hayDatos = kpisA.length > 0 || kpisB.length > 0;

  const selectStyle = { padding: '6px 10px', borderRadius: 6, background: C.card,
    color: C.text, border: `1px solid ${C.border}`, fontSize: 11 };
  const inputStyle  = { padding: '6px 8px', width: 68, borderRadius: 6, background: C.card,
    color: C.text, border: `1px solid ${C.border}`, fontSize: 11 };
  const col = (label) => ({ fontSize: 9, color: C.muted, textTransform: 'uppercase',
    display: 'flex', flexDirection: 'column', gap: 3, children: label });

  return (
    <div>
      {/* Selectores */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
        {/* Empresa */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase' }}>Empresa</label>
          <select value={filialSel} onChange={e => { setFilialSel(e.target.value); setKpisA([]); setKpisB([]); }}
            style={selectStyle}>
            <option value="">— Seleccionar —</option>
            {filiales.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
          </select>
        </div>

        {/* Período A */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: 9, color: C.blue, textTransform: 'uppercase', fontWeight: 700 }}>Período A</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={mesA} onChange={e => setMesA(Number(e.target.value))} style={selectStyle}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m =>
                <option key={m} value={m}>{NOMBRES_MES[m]}</option>)}
            </select>
            <input type="number" value={anioA} onChange={e => setAnioA(Number(e.target.value))} style={inputStyle} />
          </div>
        </div>

        <div style={{ fontSize: 16, color: C.muted, paddingBottom: 4 }}>vs</div>

        {/* Período B */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', fontWeight: 700 }}>Período B</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={mesB} onChange={e => setMesB(Number(e.target.value))} style={selectStyle}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m =>
                <option key={m} value={m}>{NOMBRES_MES[m]}</option>)}
            </select>
            <input type="number" value={anioB} onChange={e => setAnioB(Number(e.target.value))} style={inputStyle} />
          </div>
        </div>

        <Btn onClick={cargar} disabled={cargando || !filialSel}>
          {cargando ? 'Cargando...' : 'Comparar'}
        </Btn>
      </div>

      {/* Badges de estado */}
      {hayDatos && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, fontSize: 10 }}>
          <span style={{ color: C.blue, fontWeight: 700 }}>
            {NOMBRES_MES[mesA]} {anioA}: {infA ? <Badge estado={infA.estado} /> : <span style={{ color: C.muted }}>sin informe</span>}
          </span>
          <span style={{ color: C.muted, fontWeight: 700 }}>
            {NOMBRES_MES[mesB]} {anioB}: {infB ? <Badge estado={infB.estado} /> : <span style={{ color: C.muted }}>sin informe</span>}
          </span>
        </div>
      )}

      {!hayDatos && filialSel && (
        <div style={{ color: C.muted, fontSize: 11 }}>
          Selecciona dos períodos y haz clic en "Comparar".
        </div>
      )}

      {/* Tabla KPI */}
      {hayDatos && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 10, width: '100%' }}>
            <thead>
              <tr style={{ background: C.card }}>
                <th style={{ padding: '6px 10px', textAlign: 'left', color: C.muted,
                  minWidth: 160, position: 'sticky', left: 0, background: C.card, zIndex: 1 }}>KPI</th>
                <th style={{ padding: '6px 10px', textAlign: 'right', color: C.blue,
                  minWidth: 110, fontWeight: 800 }}>{NOMBRES_MES[mesA]} {anioA}</th>
                <th style={{ padding: '6px 10px', textAlign: 'right', color: C.muted,
                  minWidth: 110 }}>{NOMBRES_MES[mesB]} {anioB}</th>
                <th style={{ padding: '6px 10px', textAlign: 'right', color: C.muted, minWidth: 80 }}>Var</th>
                <th style={{ padding: '6px 10px', textAlign: 'right', color: C.muted, minWidth: 70 }}>Var %</th>
              </tr>
            </thead>
            <tbody>
              {KPI_GRUPOS.map(grupo => {
                const color = KPI_COLORES_GRUPO[grupo.key] || C.blue;
                return (
                  <React.Fragment key={grupo.key}>
                    <tr>
                      <td colSpan={5} style={{ padding: '5px 10px', fontWeight: 800, fontSize: 9,
                        color: color, background: `${color}18`, textTransform: 'uppercase',
                        letterSpacing: '0.06em', borderTop: `2px solid ${color}40` }}>
                        {grupo.label}
                      </td>
                    </tr>
                    {grupo.claves.map((clave, ri) => {
                      const kA = mapaA[clave], kB = mapaB[clave];
                      const vA = kA?.valor, vB = kB?.valor;
                      const unidad = kA?.unidad || kB?.unidad || '';
                      const esPct = unidad === '%', esRatio = unidad === 'x';
                      const dec = esPct ? 1 : esRatio ? 3 : 0;
                      const varAbs = vA != null && vB != null ? vA - vB : null;
                      const varPct = varAbs != null && vB !== 0 ? (varAbs / Math.abs(vB)) * 100 : null;
                      const varColor = varAbs != null ? (varAbs > 0 ? C.green : varAbs < 0 ? C.red : C.text) : C.muted;
                      return (
                        <tr key={clave} style={{ background: ri % 2 ? `${C.card}60` : 'transparent',
                          borderBottom: `1px solid ${C.border}22` }}>
                          <td style={{ padding: '4px 10px', color: C.muted,
                            position: 'sticky', left: 0, background: ri % 2 ? C.card : C.bg }}>
                            {KPI_LABELS[clave]}
                          </td>
                          <td style={{ padding: '4px 10px', textAlign: 'right',
                            fontWeight: vA != null ? 700 : 400, color: vA != null ? C.text : C.muted }}>
                            {vA != null ? `${fmtNum(vA, dec)}${esPct ? '%' : esRatio ? 'x' : ''}` : '—'}
                          </td>
                          <td style={{ padding: '4px 10px', textAlign: 'right', color: C.muted }}>
                            {vB != null ? `${fmtNum(vB, dec)}${esPct ? '%' : esRatio ? 'x' : ''}` : '—'}
                          </td>
                          <td style={{ padding: '4px 10px', textAlign: 'right', color: varColor, fontWeight: 600 }}>
                            {varAbs != null ? `${varAbs > 0 ? '+' : ''}${fmtNum(varAbs, dec)}${esPct ? '%' : esRatio ? 'x' : ''}` : '—'}
                          </td>
                          <td style={{ padding: '4px 10px', textAlign: 'right', color: varColor }}>
                            {varPct != null ? `${varPct > 0 ? '+' : ''}${varPct.toFixed(1)}%` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function AnfTab({ canEdit, usuarioActual }) {
  const esCFO = usuarioActual?.rol === 'admin' || usuarioActual?.esCFO;

  // ── Estado principal ────────────────────────────────────────────────────────
  const [filiales,    setFiliales]    = useState([]);
  const [informes,    setInformes]    = useState([]);
  const [filialId,    setFilialId]    = useState('');
  const [anio,        setAnio]        = useState(new Date().getFullYear());
  const [mes,         setMes]         = useState(new Date().getMonth() + 1);
  const [vistaANF,    setVistaANF]    = useState('resumen'); // 'resumen' | 'revisar'

  // Estado del informe cargado
  const [informe,     setInforme]     = useState(null);
  const [esf,         setEsf]         = useState([]);
  const [er,          setEr]          = useState([]);
  const [justif,      setJustif]      = useState([]);
  const [kpisDer,     setKpisDer]     = useState([]);
  const [kpisOp,      setKpisOp]      = useState([]);
  const [metricas,    setMetricas]    = useState([]);
  const [metricasAll, setMetricasAll] = useState([]);

  // Campos TC
  const [tipoCierre,  setTipoCierre]  = useState('');
  const [tipoProm,    setTipoProm]    = useState('');

  // Estado UI
  const [cargando,    setCargando]    = useState(false);
  const [error,       setError]       = useState(null);
  const [procesando,  setProcesando]  = useState(false);
  const [advertencias, setAdvertencias] = useState([]);
  const fileRef = useRef();

  // ── Carga inicial ────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const f = await cargarFiliales();
        setFiliales(f);
        if (f.length) setFilialId(f[0].id);
        const inf = await cargarInformes();
        setInformes(inf);
      } catch (e) {
        setError('Error cargando filiales: ' + e.message);
      }
    })();
  }, []);

  // Recargar métricas al cambiar empresa
  useEffect(() => {
    if (!filialId) return;
    cargarTodasMetricas(filialId).then(setMetricasAll).catch(() => {});
    cargarMetricasConfig(filialId).then(setMetricas).catch(() => {});
  }, [filialId]);

  // ── Cargar informe seleccionado ──────────────────────────────────────────────
  async function cargarInforme() {
    if (!filialId) return;
    setCargando(true);
    setError(null);
    try {
      const data = await cargarInformeCompleto(filialId, anio, mes);
      if (!data) {
        setInforme(null);
        setEsf([]); setEr([]); setJustif([]); setKpisDer([]); setKpisOp([]);
      } else {
        setInforme(data.informe);
        setEsf(data.esf);
        setEr(data.er);
        setJustif(data.justif);
        setKpisDer(data.kpisDer);
        setKpisOp(data.kpisOp);
        setTipoCierre(data.informe.tipo_cierre || '');
        setTipoProm(data.informe.tipo_promedio || '');
      }
      const filial = filiales.find(f => f.id === filialId);
      if (filial) {
        const [met, metAll] = await Promise.all([
          cargarMetricasConfig(filialId),
          cargarTodasMetricas(filialId),
        ]);
        setMetricas(met);
        setMetricasAll(metAll);
      }
      setVistaANF('revisar');
    } catch (e) {
      setError('Error cargando informe: ' + e.message);
    } finally {
      setCargando(false);
    }
  }

  // ── Procesar Excel subido ─────────────────────────────────────────────────
  async function handleFile(file) {
    const filial = filiales.find(f => f.id === filialId);
    if (!filial) { setError('Selecciona una empresa antes de subir el archivo.'); return; }
    setError(null);
    setAdvertencias([]);
    setProcesando(true);
    try {
      const parsed = await parsearInformeANF(file, filial, anio, mes);
      setAdvertencias(parsed.advertencias);

      if (parsed.esf.length === 0) {
        setError('El parser no generó cuentas ESF. Revisa el archivo y el sistema configurado para esta empresa.');
        return;
      }

      const temporada = calcTemporada(mes, anio);
      // Crear o actualizar informe en DB
      let inf = await cargarInformeCompleto(filialId, anio, mes);
      let informeRow;
      if (!inf) {
        informeRow = await crearInforme({
          filialId, anio, mes, temporada,
          cargadoPor: usuarioActual?.nombre || 'sistema',
        });
      } else {
        informeRow = inf.informe;
      }

      const informeId = informeRow.id;
      const piso = filial.piso_materialidad || 10;

      // ESF
      const saldosEsf = buildSaldosEsf(parsed.esf, parsed.esf_t1, piso);
      await guardarSaldosEsf(informeId, saldosEsf);

      // ER
      const movsEr = buildMovimientosEr(parsed.er_temp, parsed.er_mensual, mes, anio, filial.sistema);
      await guardarMovimientosEr(informeId, movsEr);

      // Narrativas del INFORME
      if (parsed.narrativas.length) {
        await importarNarrativas(informeId, parsed.narrativas);
      }

      // KPIs derivados — calculados al subir para mostrar en borrador
      const kpisCalc = calcularKpisDerivaos(saldosEsf, movsEr);
      await guardarKpisDerivaos(informeId, kpisCalc);

      // Recargar
      await cargarInforme();
    } catch (e) {
      setError('Error procesando el archivo: ' + e.message);
    } finally {
      setProcesando(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  // ── Guardar TC ─────────────────────────────────────────────────────────────
  async function guardarTC() {
    if (!informe) return;
    try {
      await actualizarTcInforme(informe.id, {
        tipoCierre:   tipoCierre ? Number(tipoCierre) : null,
        tipoPromedio: tipoProm   ? Number(tipoProm)   : null,
      });
    } catch (e) {
      setError('Error guardando TC: ' + e.message);
    }
  }

  // ── Aprobar informe ────────────────────────────────────────────────────────
  async function aprobar() {
    if (!informe || !esCFO) return;
    // Calcular KPIs derivados antes de aprobar
    try {
      const kpis = calcularKpisDerivaos(esf, er);
      await guardarKpisDerivaos(informe.id, kpis);
      await actualizarEstadoInforme(informe.id, 'aprobado', { aprobadoPor: usuarioActual?.nombre });
      await cargarInforme();
    } catch (e) {
      setError('Error aprobando: ' + e.message);
    }
  }

  // ── Rechazar informe ───────────────────────────────────────────────────────
  async function rechazar() {
    const obs = window.prompt('Motivo del rechazo (opcional):');
    if (obs === null) return; // canceló
    try {
      await actualizarEstadoInforme(informe.id, 'rechazado', {
        aprobadoPor: usuarioActual?.nombre,
        observacion: obs,
      });
      await cargarInforme();
    } catch (e) {
      setError('Error rechazando: ' + e.message);
    }
  }

  // ── Exportar Excel ─────────────────────────────────────────────────────────
  function exportarExcel() {
    if (!informe || !esf.length) return;
    const filial = filiales.find(f => f.id === filialId);
    const nombre = filial?.nombre || 'Empresa';

    const wb = XLSX.utils.book_new();

    // Hoja ESF
    const esfRows = [
      [`ESF — ${nombre} — ${NOMBRES_MES[mes]} ${anio}`],
      [],
      ['Código', 'Nombre', 'Categoría', 'Saldo actual', 'Año anterior', 'Var $', 'Var %'],
      ...esf.map(c => [c.codigo, c.nombre, c.categoria_ifrs || clasificarSeccionEsf(c.codigo), c.saldo_neto, c.saldo_neto_t1, c.var_abs, c.var_pct]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(esfRows), 'ESF');

    // Hoja ER
    const erRows = [
      [`ER — ${nombre} — ${NOMBRES_MES[mes]} ${anio}`],
      [],
      ['Código', 'Nombre', 'Grupo', 'Real mes', 'Ppto mes', 'Real YTD', 'Ppto YTD', 'Real Temp.', 'Ppto Temp.'],
      ...er.map(m => [m.codigo, m.nombre, m.grupo_er, m.real_mes, m.ppto_mes, m.real_ytd, m.ppto_ytd, m.real_temporada, m.ppto_temporada]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(erRows), 'ER');

    XLSX.writeFile(wb, `anf_${(filial?.codigo || 'empresa')}_${anio}_${String(mes).padStart(2,'0')}.xlsx`);
  }

  // ── Exportar PDF ───────────────────────────────────────────────────────────
  function exportarPDF() {
    if (!informe) return;
    const filial  = filiales.find(f => f.id === filialId);
    const nombre  = filial?.nombre || 'Empresa';
    const periodo = `${NOMBRES_MES[mes]} ${anio}`;
    const moneda  = filial?.moneda || 'USD';

    const fmtN = (v, dec = 0) => v == null || isNaN(v) ? '—'
      : v.toLocaleString('es-CL', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    const fmtP = (v) => v == null || isNaN(v) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%';

    // ── Helpers HTML ─────────────────────────────────────────────────────────
    const th = (t, align = 'left', extra = '') =>
      `<th style="padding:3px 6px;text-align:${align};background:#f0f4f8;border-bottom:1px solid #ddd;font-size:9px;color:#555;${extra}">${t}</th>`;
    const td = (t, align = 'left', color = '', extra = '') =>
      `<td style="padding:2px 6px;text-align:${align};${color ? `color:${color};` : ''}font-size:9px;${extra}">${t ?? '—'}</td>`;

    // ── Sección ESF ──────────────────────────────────────────────────────────
    const SECCIONES_ESF = ['Activo Corriente','Activo No Corriente','Pasivo Corriente','Pasivo No Corriente','Patrimonio'];
    const esfHTML = SECCIONES_ESF.map(sec => {
      const cuentas = esf.filter(c => (c.categoria_ifrs || clasificarSeccionEsf(c.codigo)) === sec);
      if (!cuentas.length) return '';
      const total = cuentas.reduce((a, c) => a + (c.saldo_neto || 0), 0);
      const rows = cuentas.map((c, i) => {
        const vColor = c.var_pct != null && Math.abs(c.var_pct) >= (filial?.piso_materialidad || 10)
          ? (c.var_pct > 0 ? '#1a7a4a' : '#b22222') : '#333';
        return `<tr style="background:${i%2?'#f9f9f9':'#fff'}">
          ${td(c.codigo,'left','#888','font-family:monospace')}
          ${td(c.nombre || c.nombre_origen)}
          ${td(fmtN(c.saldo_neto),'right')}
          ${td(fmtN(c.saldo_neto_t1),'right','#888')}
          ${td(fmtN(c.var_abs),'right', c.var_abs > 0 ? '#1a7a4a' : c.var_abs < 0 ? '#b22222' : '')}
          ${td(fmtP(c.var_pct),'right', vColor)}
        </tr>`;
      }).join('');
      return `
        <div style="margin-bottom:12px">
          <div style="font-size:9px;font-weight:800;color:#1a5fa8;background:#e8f0fc;padding:3px 8px;border-radius:3px;margin-bottom:2px">
            ${sec} — Total: ${fmtN(total)} ${moneda}
          </div>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr>${th('Código')}${th('Nombre')}${th('Saldo actual','right')}${th('Año anterior','right')}${th('Var $','right')}${th('Var %','right')}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }).join('');

    // ── Sección ER ───────────────────────────────────────────────────────────
    const GRUPOS_ER = [
      { key:'Ingreso Operacional',    color:'#1a5fa8' },
      { key:'Costo Operacional',      color:'#b22222' },
      { key:'Gasto Operacional',      color:'#b22222' },
      { key:'Ingreso No Operacional', color:'#1a7a4a' },
      { key:'Gasto No Operacional',   color:'#b22222' },
      { key:'Impuesto',               color:'#888' },
    ];
    const vistaErCampo = { real: 'real_mes', ppto: 'ppto_mes', temporada: 'real_temporada' };
    const erHTML = GRUPOS_ER.map(g => {
      const cuentas = er.filter(c => (c.grupo_er || clasificarGrupoEr(c.codigo)) === g.key);
      if (!cuentas.length) return '';
      const totalReal = cuentas.reduce((a, c) => a + (c.real_temporada || 0), 0);
      const totalPpto = cuentas.reduce((a, c) => a + (c.ppto_temporada || 0), 0);
      const rows = cuentas.map((c, i) => {
        const real = c.real_temporada, ppto = c.ppto_temporada;
        const vp = ppto && ppto !== 0 ? ((real - ppto) / Math.abs(ppto)) * 100 : null;
        const vColor = vp != null && Math.abs(vp) >= (filial?.piso_materialidad || 10)
          ? (vp > 0 ? '#1a7a4a' : '#b22222') : '#333';
        return `<tr style="background:${i%2?'#f9f9f9':'#fff'}">
          ${td(c.codigo,'left','#888','font-family:monospace')}
          ${td(c.nombre || c.nombre_origen)}
          ${td(fmtN(real),'right')}
          ${td(fmtN(ppto),'right','#888')}
          ${td(fmtN(real - (ppto||0)),'right', (real-(ppto||0)) > 0 ? '#1a7a4a' : '#b22222')}
          ${td(fmtP(vp),'right', vColor)}
        </tr>`;
      }).join('');
      return `
        <div style="margin-bottom:12px">
          <div style="font-size:9px;font-weight:800;color:${g.color};background:${g.color}18;padding:3px 8px;border-radius:3px;margin-bottom:2px">
            ${g.key} — Real: ${fmtN(totalReal)} · Ppto: ${fmtN(totalPpto)} ${moneda}
          </div>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr>${th('Código')}${th('Nombre')}${th('Real Temp.','right')}${th('Ppto Temp.','right')}${th('Var $','right')}${th('Var %','right')}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }).join('');

    // ── KPIs ─────────────────────────────────────────────────────────────────
    const kpiTile = (k) => {
      if (!k) return '';
      const esPct = k.unidad === '%', esRatio = k.unidad === 'x';
      const dec = esPct ? 1 : esRatio ? 3 : 0;
      const val = k.valor != null ? fmtN(k.valor, dec) + (esPct ? '%' : esRatio ? 'x' : '') : '—';
      return `<div style="border:1px solid #ddd;border-radius:5px;padding:6px 10px;min-width:110px;background:#fff">
        <div style="font-size:7px;color:#888;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px">${KPI_LABELS[k.clave] || k.clave}</div>
        <div style="font-size:14px;font-weight:900;color:#222">${val}</div>
      </div>`;
    };
    const mapaKpis = Object.fromEntries(kpisDer.map(k => [k.clave, k]));
    const kpisHTML = KPI_GRUPOS.map(grupo => {
      const tiles = grupo.claves.map(c => kpiTile(mapaKpis[c])).filter(Boolean).join('');
      if (!tiles) return '';
      const colores = { rentabilidad:'#1a7a4a', liquidez:'#1a5fa8', endeudamiento:'#b22222', balance:'#2a7a8a', resultados:'#c07800' };
      const color = colores[grupo.key] || '#333';
      return `<div style="margin-bottom:10px">
        <div style="font-size:8px;font-weight:800;color:${color};border-left:3px solid ${color};padding-left:6px;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">${grupo.label}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${tiles}</div>
      </div>`;
    }).join('');

    // ── Narrativas ───────────────────────────────────────────────────────────
    const narrHTML = justif.length ? justif.map(j =>
      `<div style="margin-bottom:6px;padding:5px 8px;background:#f5f5f5;border-radius:3px;border-left:3px solid #ccc">
        <span style="font-size:8px;font-weight:700;color:#555">${j.codigo}</span>
        <p style="margin:2px 0 0;font-size:8px;color:#333">${j.texto || j.texto_original || ''}</p>
      </div>`
    ).join('') : '<p style="font-size:9px;color:#888">Sin narrativas cargadas.</p>';

    // ── HTML final ───────────────────────────────────────────────────────────
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>ANF ${nombre} ${periodo}</title>
      <style>
        @page { size: letter portrait; margin: 15mm 12mm; }
        @media print { body { margin: 0; } .no-print { display: none; } }
        body { font-family: Arial, sans-serif; color: #222; font-size: 10px; }
        h1 { font-size: 14px; margin: 0 0 2px; color: #1a3a6a; }
        h2 { font-size: 10px; font-weight: 800; color: #1a5fa8; margin: 14px 0 6px;
             border-bottom: 1.5px solid #1a5fa820; padding-bottom: 2px; }
        table { border-collapse: collapse; width: 100%; }
        td, th { border-bottom: 1px solid #eee; }
      </style>
    </head><body>
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;border-bottom:2px solid #1a5fa8;padding-bottom:8px">
        <div>
          <h1>${nombre}</h1>
          <div style="font-size:11px;color:#555">${periodo} · ${moneda}</div>
        </div>
        <div style="text-align:right;font-size:9px;color:#555">
          <div>TC Cierre: <strong>${tipoCierre || '—'}</strong></div>
          <div>TC Promedio: <strong>${tipoProm || '—'}</strong></div>
          <div style="margin-top:4px;font-size:8px;color:#1a7a4a;font-weight:700">${informe.estado.toUpperCase()}</div>
        </div>
      </div>

      ${kpisDer.length ? `<h2>KPIs Financieros</h2><div style="margin-bottom:14px">${kpisHTML}</div>` : ''}

      <h2>Estado de Situación Financiera</h2>
      ${esfHTML}

      <h2>Estado de Resultados — Temporada</h2>
      ${erHTML}

      ${justif.length ? `<h2>Narrativas / Justificaciones</h2>${narrHTML}` : ''}

      <div style="margin-top:16px;font-size:7px;color:#bbb;text-align:right">
        Generado: ${new Date().toLocaleString('es-CL')} · Grupo Mediterra — ANF
      </div>

      <script>window.onload = function() { window.print(); }<\/script>
    </body></html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const filialActual = filiales.find(f => f.id === filialId);
  const informesFilial = informe ? informes.filter(i => i.filial_id === filialId) : [];

  return (
    <div style={{ color: C.text, fontSize: 12 }}>

      {/* ── Título ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: C.blue }}>Análisis Financiero</div>
        <div style={{ fontSize: 10, color: C.muted }}>
          Carga, revisión y aprobación de cierres mensuales por empresa
        </div>
      </div>

      {/* ── Panel de selección ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase' }}>Empresa</label>
          <select value={filialId} onChange={e => setFilialId(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, background: C.card, color: C.text,
              border: `1px solid ${C.border}`, fontSize: 11 }}>
            {filiales.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase' }}>Mes</label>
          <select value={mes} onChange={e => setMes(Number(e.target.value))}
            style={{ padding: '6px 10px', borderRadius: 6, background: C.card, color: C.text,
              border: `1px solid ${C.border}`, fontSize: 11 }}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m =>
              <option key={m} value={m}>{NOMBRES_MES[m]}</option>
            )}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase' }}>Año</label>
          <input type="number" value={anio} onChange={e => setAnio(Number(e.target.value))}
            style={{ padding: '6px 8px', width: 72, borderRadius: 6, background: C.card, color: C.text,
              border: `1px solid ${C.border}`, fontSize: 11 }} />
        </div>
        <Btn onClick={cargarInforme} disabled={!filialId || cargando}>
          {cargando ? 'Cargando...' : 'Cargar'}
        </Btn>

        {/* Tabs */}
        <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: `1px solid ${C.border}`, marginLeft: 8 }}>
          {[['resumen', 'Resumen'], ['revisar', 'Revisar'], ['comparar', 'Comparar']].map(([v, l]) => (
            <button key={v} onClick={() => setVistaANF(v)}
              style={{ padding: '6px 14px', fontSize: 11, cursor: 'pointer',
                background: vistaANF === v ? C.blue : C.card,
                color: vistaANF === v ? '#fff' : C.muted, border: 'none', fontWeight: 700 }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* ── Config métricas (siempre visible cuando hay empresa) ── */}
      {filialId && canEdit && (
        <PanelMetricasConfig
          filialId={filialId}
          metricasAll={metricasAll}
          canEdit={canEdit}
          onRefresh={async () => {
            const [met, metAll] = await Promise.all([
              cargarMetricasConfig(filialId),
              cargarTodasMetricas(filialId),
            ]);
            setMetricas(met);
            setMetricasAll(metAll);
          }}
        />
      )}

      {/* ── Errores y advertencias ── */}
      {error && (
        <div style={{ marginBottom: 10, padding: '8px 12px', background: `${C.red}18`,
          border: `1px solid ${C.red}44`, borderRadius: 6, fontSize: 11, color: C.red }}>
          {error}
        </div>
      )}
      {advertencias.length > 0 && (
        <div style={{ marginBottom: 10, padding: '8px 12px', background: `${C.yellow}18`,
          border: `1px solid ${C.yellow}44`, borderRadius: 6, fontSize: 10, color: C.yellow }}>
          <strong>Advertencias del parser:</strong>
          <ul style={{ margin: '4px 0 0 14px', padding: 0 }}>
            {advertencias.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      )}

      {/* ══ VISTA COMPARAR ══ */}
      {vistaANF === 'comparar' && (
        <VistaComparativoMeses
          filiales={filiales}
          informes={informes}
          filialIdDefault={filialId}
          anioDefault={anio}
          mesDefault={mes}
        />
      )}

      {/* ══ VISTA RESUMEN ══ */}
      {vistaANF === 'resumen' && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.text, marginBottom: 10 }}>
            Informes cargados
          </div>
          {informes.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 11 }}>
              Sin informes. Selecciona empresa + mes + año y haz clic en "Cargar" para subir un Excel.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: C.card }}>
                  <th style={{ padding: '4px 8px', textAlign: 'left', color: C.muted }}>Empresa</th>
                  <th style={{ padding: '4px 8px', textAlign: 'left', color: C.muted }}>Período</th>
                  <th style={{ padding: '4px 8px', textAlign: 'left', color: C.muted }}>Temporada</th>
                  <th style={{ padding: '4px 8px', textAlign: 'left', color: C.muted }}>Estado</th>
                  <th style={{ padding: '4px 8px', textAlign: 'left', color: C.muted }}>Cargado por</th>
                  <th style={{ padding: '4px 8px', textAlign: 'left', color: C.muted }}>Aprobado por</th>
                </tr>
              </thead>
              <tbody>
                {informes.map((inf, i) => (
                  <tr key={inf.id} style={{ background: i % 2 ? C.bg : `${C.card}80`,
                    cursor: 'pointer' }}
                    onClick={() => {
                      setFilialId(inf.filial_id);
                      setAnio(inf.anio);
                      setMes(inf.mes);
                      setVistaANF('revisar');
                      cargarInforme();
                    }}>
                    <td style={{ padding: '4px 8px' }}>{inf.anf_filiales?.nombre || inf.filial_id}</td>
                    <td style={{ padding: '4px 8px' }}>{NOMBRES_MES[inf.mes]} {inf.anio}</td>
                    <td style={{ padding: '4px 8px', color: C.muted }}>{inf.temporada}</td>
                    <td style={{ padding: '4px 8px' }}><Badge estado={inf.estado} /></td>
                    <td style={{ padding: '4px 8px', color: C.muted }}>{inf.cargado_por || '—'}</td>
                    <td style={{ padding: '4px 8px', color: C.muted }}>{inf.aprobado_por || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ══ VISTA REVISAR ══ */}
      {vistaANF === 'revisar' && (
        <div>
          {/* ── Upload ── */}
          {canEdit && (
            <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <input ref={fileRef} type="file" accept=".xlsx,.xls"
                onChange={e => e.target.files[0] && handleFile(e.target.files[0])}
                style={{ display: 'none' }} />
              <Btn onClick={() => fileRef.current?.click()} disabled={procesando} color={C.teal}>
                {procesando ? 'Procesando...' : informe ? 'Reemplazar Excel' : 'Subir Excel'}
              </Btn>
              {filialActual && (
                <span style={{ fontSize: 10, color: C.muted }}>
                  Sistema: <strong>{filialActual.sistema}</strong> · Moneda: <strong>{filialActual.moneda}</strong> ·
                  Materialidad: <strong>±{filialActual.piso_materialidad}%</strong>
                </span>
              )}
            </div>
          )}

          {/* ── Sin informe ── */}
          {!informe && !procesando && (
            <div style={{ color: C.muted, fontSize: 11, padding: '20px 0' }}>
              No hay informe cargado para {filialActual?.nombre} — {NOMBRES_MES[mes]} {anio}.
              Sube el Excel de cierre para comenzar.
            </div>
          )}

          {/* ── Informe cargado ── */}
          {informe && (
            <>
              {/* Header del informe */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap',
                padding: '10px 14px', background: C.card, borderRadius: 8, border: `1px solid ${C.border}` }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 800, color: C.blue, marginRight: 10 }}>
                    {filialActual?.nombre} — {NOMBRES_MES[mes]} {anio}
                  </span>
                  <Badge estado={informe.estado} />
                </div>

                {/* TC campos */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 9, color: C.muted }}>TC Cierre</label>
                  <input type="number" value={tipoCierre}
                    onChange={e => setTipoCierre(e.target.value)}
                    onBlur={guardarTC}
                    disabled={!canEdit}
                    placeholder="ej: 950.40"
                    style={{ width: 90, padding: '4px 6px', borderRadius: 5, background: C.bg,
                      color: C.text, border: `1px solid ${C.border}`, fontSize: 11 }} />
                  <label style={{ fontSize: 9, color: C.muted }}>TC Promedio</label>
                  <input type="number" value={tipoProm}
                    onChange={e => setTipoProm(e.target.value)}
                    onBlur={guardarTC}
                    disabled={!canEdit}
                    placeholder="ej: 943.20"
                    style={{ width: 90, padding: '4px 6px', borderRadius: 5, background: C.bg,
                      color: C.text, border: `1px solid ${C.border}`, fontSize: 11 }} />
                </div>

                {/* Workflow buttons */}
                {esCFO && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {informe.estado === 'borrador' && (
                      <Btn onClick={aprobar} color={C.green} small>Aprobar</Btn>
                    )}
                    {informe.estado === 'aprobado' && (
                      <Btn onClick={rechazar} color={C.red} small>Revertir</Btn>
                    )}
                    {informe.estado === 'rechazado' && (
                      <Btn onClick={aprobar} color={C.green} small>Re-aprobar</Btn>
                    )}
                  </div>
                )}

                <Btn onClick={exportarExcel} color={C.teal} small>Exportar XLSX</Btn>
                <Btn onClick={exportarPDF} color={C.blue} small>Exportar PDF</Btn>
              </div>

              {/* KPIs derivados */}
              {kpisDer.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: C.text, marginBottom: 8 }}>KPIs Financieros</div>
                  <SeccionKpis kpisDer={kpisDer} kpisOp={[]} metricas={metricas} />
                </div>
              )}

              {/* KPIs operacionales — ingreso manual */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.text, marginBottom: 8 }}>
                  KPIs Operacionales
                </div>
                <SeccionKpisOpEdit
                  informeId={informe.id}
                  metricas={metricas}
                  kpisOp={kpisOp}
                  canEdit={canEdit}
                  usuarioActual={usuarioActual}
                />
              </div>

              {/* ESF */}
              {esf.length > 0 && (
                <TablaEsf saldos={esf} piso={filialActual?.piso_materialidad || 10} />
              )}

              {/* ER */}
              {er.length > 0 && (
                <TablaEr
                  movimientos={er}
                  mes={mes}
                  piso={filialActual?.piso_materialidad || 10}
                  justif={justif}
                  informeId={informe.id}
                  canEdit={canEdit}
                  usuarioActual={usuarioActual}
                />
              )}

              {/* Narrativas */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.text, marginBottom: 8 }}>
                  Narrativas / Justificaciones
                </div>
                <SeccionNarrativas
                  informeId={informe.id}
                  justificaciones={justif}
                  canEdit={canEdit}
                  usuarioActual={usuarioActual}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
