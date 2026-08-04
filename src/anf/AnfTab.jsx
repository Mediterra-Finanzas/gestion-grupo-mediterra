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
  cargarFiliales, upsertFilial, cargarInformes, cargarInformeCompleto,
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

// Retorna lista de grupos ER con variación material (|var%| >= piso) que no tienen justificación.
function gruposSinJustificacion(er, justif, piso = 10) {
  // Agrupar cuentas ER por grupo
  const grupos = {};
  er.forEach(c => {
    const grp = clasificarGrupoEr(c.codigo);
    if (!grupos[grp]) grupos[grp] = { real: 0, ppto: 0, codigos: [] };
    grupos[grp].real  += (c.real_mes  || 0);
    grupos[grp].ppto  += (c.ppto_mes  || 0);
    grupos[grp].codigos.push(c.codigo);
  });
  // Justificaciones existentes (tipo er, con texto)
  const justSet = new Set(
    justif.filter(j => j.tipo_estado === 'er' && (j.texto || j.texto_original)).map(j => j.codigo)
  );
  const faltantes = [];
  Object.entries(grupos).forEach(([grp, { real, ppto, codigos }]) => {
    if (ppto === 0) return; // s/p → no se exige justificación
    const varPct = ((real - ppto) / Math.abs(ppto)) * 100;
    if (Math.abs(varPct) >= piso) {
      // Tiene alguna cuenta del grupo justificada?
      const tieneJust = codigos.some(c => justSet.has(c));
      if (!tieneJust) faltantes.push({ grupo: grp, varPct });
    }
  });
  return faltantes;
}

// ── Panel gestión de filiales (CFO only) ─────────────────────────────────────

const FILIALES_MEDITERRA = [
  { nombre: 'Allegria Foods',        codigo: 'ALF', sistema: 'contec',     moneda: 'USD', piso_materialidad: 10, descripcion: 'Exportación de cerezas y asesoría comercial de arándanos' },
  { nombre: 'Allegria Service',      codigo: 'ALS', sistema: 'contec',     moneda: 'USD', piso_materialidad: 10, descripcion: 'Procesamiento cerezas y ciruelas Chile' },
  { nombre: 'Frisku Foods',          codigo: 'FRK', sistema: 'contec',     moneda: 'USD', piso_materialidad: 10, descripcion: 'Representación de importadores de fruta (comisión en destino)' },
  { nombre: 'Osiris Plant Management', codigo: 'OSI', sistema: 'contec',  moneda: 'USD', piso_materialidad: 10, descripcion: 'Royalties genéticos varietales' },
  { nombre: 'Integrity Farms',       codigo: 'INT', sistema: 'contec',     moneda: 'USD', piso_materialidad: 10, descripcion: 'Fee administración campos por hectárea' },
  { nombre: 'Mediterra Holding',     codigo: 'MHD', sistema: 'contec',     moneda: 'USD', piso_materialidad: 10, descripcion: 'Holding pura, fee admin intercompany' },
];

const EMPTY_FILIAL = { nombre: '', codigo: '', sistema: 'contec', moneda: 'USD', piso_materialidad: 10, descripcion: '' };

function PanelFilialesAdmin({ filiales, onRefresh }) {
  const [abierto,    setAbierto]    = useState(false);
  const [editando,   setEditando]   = useState(null); // null | objeto filial
  const [guardando,  setGuardando]  = useState(false);
  const [err,        setErr]        = useState('');

  async function guardar() {
    if (!editando?.nombre || !editando?.codigo) { setErr('Nombre y código son obligatorios'); return; }
    setGuardando(true); setErr('');
    try {
      await upsertFilial(editando);
      setEditando(null);
      await onRefresh();
    } catch (e) { setErr(e.message); }
    finally { setGuardando(false); }
  }

  async function importarDefaults() {
    const existentes = new Set(filiales.map(f => f.codigo?.toUpperCase()));
    const nuevas = FILIALES_MEDITERRA.filter(f => !existentes.has(f.codigo));
    if (!nuevas.length) { alert('Todas las empresas Mediterra ya están configuradas.'); return; }
    setGuardando(true);
    try {
      for (const f of nuevas) await upsertFilial(f);
      await onRefresh();
    } catch (e) { setErr(e.message); }
    finally { setGuardando(false); }
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <button onClick={() => setAbierto(a => !a)}
        style={{ fontSize: 10, color: C.muted, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}>
        {abierto ? '▼' : '►'} Gestionar empresas ANF
      </button>
      {abierto && (
        <div style={{ marginTop: 8, padding: '10px 14px', background: C.card,
          border: `1px solid ${C.border}`, borderRadius: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>Empresas configuradas</span>
            <button onClick={importarDefaults} disabled={guardando}
              style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, background: C.teal, color: '#fff',
                border: 'none', cursor: 'pointer', opacity: guardando ? 0.5 : 1 }}>
              + Importar Grupo Mediterra
            </button>
            <button onClick={() => setEditando({ ...EMPTY_FILIAL })}
              style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, background: C.blue, color: '#fff',
                border: 'none', cursor: 'pointer' }}>
              + Nueva empresa
            </button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr style={{ background: C.bg }}>
                {['Nombre','Código','Sistema','Moneda','Piso %','Descripción',''].map(h => (
                  <th key={h} style={{ padding: '3px 6px', textAlign: 'left', color: C.muted,
                    borderBottom: `1px solid ${C.border}`, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filiales.map(f => (
                <tr key={f.id} style={{ borderBottom: `1px solid ${C.border}22` }}>
                  <td style={{ padding: '3px 6px' }}>{f.nombre}</td>
                  <td style={{ padding: '3px 6px', fontFamily: 'monospace', color: C.muted }}>{f.codigo}</td>
                  <td style={{ padding: '3px 6px', color: C.muted }}>{f.sistema}</td>
                  <td style={{ padding: '3px 6px', color: C.muted }}>{f.moneda}</td>
                  <td style={{ padding: '3px 6px', color: C.muted }}>±{f.piso_materialidad}%</td>
                  <td style={{ padding: '3px 6px', color: C.muted, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.descripcion}</td>
                  <td style={{ padding: '3px 6px' }}>
                    <button onClick={() => setEditando({ ...f })}
                      style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'none',
                        border: `1px solid ${C.border}`, cursor: 'pointer', color: C.muted }}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Modal edición */}
          {editando && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: C.bg,
              border: `1px solid ${C.blue}40`, borderRadius: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 8, color: C.blue }}>
                {editando.id ? 'Editar empresa' : 'Nueva empresa'}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  ['Nombre *', 'nombre', 'text', 180],
                  ['Código *', 'codigo', 'text', 70],
                  ['Moneda', 'moneda', 'text', 60],
                  ['Piso %', 'piso_materialidad', 'number', 60],
                ].map(([label, key, type, w]) => (
                  <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <label style={{ fontSize: 9, color: C.muted }}>{label}</label>
                    <input type={type} value={editando[key] || ''} onChange={e => setEditando(d => ({ ...d, [key]: e.target.value }))}
                      style={{ width: w, padding: '4px 6px', borderRadius: 4, background: C.card,
                        border: `1px solid ${C.border}`, color: C.text, fontSize: 10 }} />
                  </div>
                ))}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <label style={{ fontSize: 9, color: C.muted }}>Sistema</label>
                  <select value={editando.sistema || 'contec'} onChange={e => setEditando(d => ({ ...d, sistema: e.target.value }))}
                    style={{ padding: '4px 6px', borderRadius: 4, background: C.card, border: `1px solid ${C.border}`, color: C.text, fontSize: 10 }}>
                    <option value="contec">Contec</option>
                    <option value="megasystem">Megasystem</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <label style={{ fontSize: 9, color: C.muted }}>Descripción</label>
                  <input type="text" value={editando.descripcion || ''} onChange={e => setEditando(d => ({ ...d, descripcion: e.target.value }))}
                    style={{ width: 240, padding: '4px 6px', borderRadius: 4, background: C.card,
                      border: `1px solid ${C.border}`, color: C.text, fontSize: 10 }} />
                </div>
              </div>
              {err && <div style={{ color: C.red, fontSize: 10, marginTop: 6 }}>{err}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={guardar} disabled={guardando}
                  style={{ padding: '4px 12px', borderRadius: 5, background: C.green, color: '#fff',
                    border: 'none', cursor: 'pointer', fontSize: 10, opacity: guardando ? 0.5 : 1 }}>
                  {guardando ? 'Guardando...' : 'Guardar'}
                </button>
                <button onClick={() => { setEditando(null); setErr(''); }}
                  style={{ padding: '4px 12px', borderRadius: 5, background: C.bg, color: C.muted,
                    border: `1px solid ${C.border}`, cursor: 'pointer', fontSize: 10 }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sección ESF ──────────────────────────────────────────────────────────────

function clasificarSeccionEsf(codigo) {
  const parts = (codigo || '').split('.');
  const p1 = parts[0], p2 = parts[1];
  if (p1 === '1') return p2 === '01' ? 'Activo Corriente' : 'Activo No Corriente';
  if (p1 === '2') return p2 === '01' ? 'Pasivo Corriente' : 'Pasivo No Corriente';
  if (p1 === '3') return 'Patrimonio';
  return null; // cuentas de resultado (4-9) no pertenecen al ESF
}

function FilaEsf({ c, piso, i }) {
  return (
    <tr style={{ background: i % 2 ? C.bg : `${C.card}60` }}>
      <td style={{ textAlign: 'center', paddingLeft: 4, width: 14 }}>
        <Semaforo varPct={c.var_pct} piso={piso} />
      </td>
      <td style={{ padding: '2px 6px', color: C.muted, fontFamily: 'monospace', fontSize: 9 }}>{c.codigo}</td>
      <td style={{ padding: '2px 6px', fontSize: 10 }}>{c.nombre || c.nombre_origen}</td>
      <td style={{ padding: '2px 6px', textAlign: 'right', fontWeight: 500 }}>{fmtNum(c.saldo_neto)}</td>
      <td style={{ padding: '2px 6px', textAlign: 'right', color: C.muted }}>{fmtNum(c.saldo_neto_t1)}</td>
      <td style={{ padding: '2px 6px', textAlign: 'right',
        color: c.var_abs > 0 ? C.green : c.var_abs < 0 ? C.red : C.text }}>
        {fmtNum(c.var_abs)}
      </td>
      <td style={{ padding: '2px 6px', textAlign: 'right',
        color: c.var_pct != null && Math.abs(c.var_pct) >= piso
          ? (c.var_pct > 0 ? C.green : C.red) : C.text }}>
        {fmtPct(c.var_pct)}
      </td>
    </tr>
  );
}

function SubtotalEsf({ label, total, t1, bold = false, separador = false }) {
  const varAbs = t1 != null ? total - t1 : null;
  const varPct = varAbs != null && t1 !== 0 ? (varAbs / Math.abs(t1)) * 100 : null;
  return (
    <tr style={{
      background: bold ? `${C.blue}10` : `${C.card}90`,
      borderTop: separador ? `2px solid ${C.blue}40` : `1px solid ${C.border}40`,
    }}>
      <td colSpan={2} />
      <td style={{ padding: '3px 6px', fontWeight: bold ? 800 : 600, fontSize: 10, color: bold ? C.blue : C.text,
        fontStyle: bold ? 'normal' : 'italic' }}>
        {label}
      </td>
      <td style={{ padding: '3px 6px', textAlign: 'right', fontWeight: bold ? 800 : 600,
        color: bold ? C.blue : C.text }}>{fmtNum(total)}</td>
      <td style={{ padding: '3px 6px', textAlign: 'right', color: C.muted }}>{t1 != null ? fmtNum(t1) : '—'}</td>
      <td style={{ padding: '3px 6px', textAlign: 'right',
        color: varAbs != null ? (varAbs > 0 ? C.green : varAbs < 0 ? C.red : C.text) : C.muted }}>
        {varAbs != null ? fmtNum(varAbs) : '—'}
      </td>
      <td style={{ padding: '3px 6px', textAlign: 'right',
        color: varPct != null ? (varPct > 0 ? C.green : varPct < 0 ? C.red : C.text) : C.muted }}>
        {varPct != null ? fmtPct(varPct) : '—'}
      </td>
    </tr>
  );
}

function TablaEsf({ saldos, piso }) {
  const [expandido, setExpandido] = useState(true);
  const [filtroMat, setFiltroMat] = useState(false);

  const GRUPOS = [
    { sec: 'Activo Corriente',    grupo: 'ACTIVO',   color: C.blue  },
    { sec: 'Activo No Corriente', grupo: 'ACTIVO',   color: C.blue  },
    { sec: 'Pasivo Corriente',    grupo: 'PASIVO',   color: C.red   },
    { sec: 'Pasivo No Corriente', grupo: 'PASIVO',   color: C.red   },
    { sec: 'Patrimonio',          grupo: 'PATRIMONIO', color: C.teal },
  ];

  const filas = useMemo(() =>
    filtroMat ? saldos.filter(s => s.es_material) : saldos,
    [saldos, filtroMat]);

  const totalPorSec = (sec) => {
    const cs = saldos.filter(s => (s.categoria_ifrs || clasificarSeccionEsf(s.codigo)) === sec);
    return {
      neto: cs.reduce((a, c) => a + (c.saldo_neto || 0), 0),
      t1:   cs.some(c => c.saldo_neto_t1 != null) ? cs.reduce((a, c) => a + (c.saldo_neto_t1 || 0), 0) : null,
    };
  };

  const tAC  = totalPorSec('Activo Corriente');
  const tANC = totalPorSec('Activo No Corriente');
  const tPC  = totalPorSec('Pasivo Corriente');
  const tPNC = totalPorSec('Pasivo No Corriente');
  const tPat = totalPorSec('Patrimonio');

  const totalActivos  = tAC.neto  + tANC.neto;
  const totalPasivos  = tPC.neto  + tPNC.neto;
  const totalPasYPat  = totalPasivos + tPat.neto;
  const cuadre = Math.abs(totalActivos - totalPasYPat) < 1;

  const totalActivosT1 = (tAC.t1 != null && tANC.t1 != null) ? tAC.t1 + tANC.t1 : null;
  const totalPasivosT1 = (tPC.t1 != null && tPNC.t1 != null) ? tPC.t1 + tPNC.t1 : null;

  const THD = ({ children, right }) => (
    <th style={{ padding: '3px 6px', textAlign: right ? 'right' : 'left',
      color: C.muted, fontSize: 9, fontWeight: 600, background: C.card,
      borderBottom: `1px solid ${C.border}` }}>{children}</th>
  );

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <button onClick={() => setExpandido(e => !e)}
          style={{ fontWeight: 800, fontSize: 12, color: C.blue, background: 'none', border: 'none', cursor: 'pointer' }}>
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
        {expandido && (
          <span style={{ marginLeft: 'auto', fontSize: 10,
            color: cuadre ? C.green : C.red, fontWeight: 700 }}>
            {cuadre ? '✓ Activos = Pasivos + Patrimonio' : `⚠ Descuadre: ${fmtNum(totalActivos - totalPasYPat)}`}
          </span>
        )}
      </div>

      {expandido && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr>
                <THD> </THD><THD>Código</THD><THD>Cuenta</THD>
                <THD right>Saldo actual</THD><THD right>Año anterior</THD>
                <THD right>Var $</THD><THD right>Var %</THD>
              </tr>
            </thead>
            <tbody>
              {/* ── ACTIVO ── */}
              <tr><td colSpan={7} style={{ padding: '5px 8px', fontWeight: 900, fontSize: 10,
                color: C.blue, background: `${C.blue}20`, letterSpacing: '0.08em',
                borderTop: `2px solid ${C.blue}` }}>ACTIVO</td></tr>

              {/* Activo Corriente */}
              <tr><td colSpan={7} style={{ padding: '3px 8px 1px 16px', fontSize: 9,
                fontWeight: 700, color: C.blue, background: `${C.blue}08` }}>Activo Corriente</td></tr>
              {filas.filter(s => (s.categoria_ifrs || clasificarSeccionEsf(s.codigo)) === 'Activo Corriente')
                .map((c, i) => <FilaEsf key={c.codigo} c={c} piso={piso} i={i} />)}
              <SubtotalEsf label="Total Activo Corriente" total={tAC.neto} t1={tAC.t1} />

              {/* Activo No Corriente */}
              <tr><td colSpan={7} style={{ padding: '3px 8px 1px 16px', fontSize: 9,
                fontWeight: 700, color: C.blue, background: `${C.blue}08` }}>Activo No Corriente</td></tr>
              {filas.filter(s => (s.categoria_ifrs || clasificarSeccionEsf(s.codigo)) === 'Activo No Corriente')
                .map((c, i) => <FilaEsf key={c.codigo} c={c} piso={piso} i={i} />)}
              <SubtotalEsf label="Total Activo No Corriente" total={tANC.neto} t1={tANC.t1} />
              <SubtotalEsf label="TOTAL ACTIVOS" total={totalActivos} t1={totalActivosT1} bold separador />

              {/* ── PASIVO ── */}
              <tr><td colSpan={7} style={{ padding: '5px 8px', fontWeight: 900, fontSize: 10,
                color: C.red, background: `${C.red}15`, letterSpacing: '0.08em',
                borderTop: `2px solid ${C.red}60` }}>PASIVO</td></tr>

              {/* Pasivo Corriente */}
              <tr><td colSpan={7} style={{ padding: '3px 8px 1px 16px', fontSize: 9,
                fontWeight: 700, color: C.red, background: `${C.red}06` }}>Pasivo Corriente</td></tr>
              {filas.filter(s => (s.categoria_ifrs || clasificarSeccionEsf(s.codigo)) === 'Pasivo Corriente')
                .map((c, i) => <FilaEsf key={c.codigo} c={c} piso={piso} i={i} />)}
              <SubtotalEsf label="Total Pasivo Corriente" total={tPC.neto} t1={tPC.t1} />

              {/* Pasivo No Corriente */}
              <tr><td colSpan={7} style={{ padding: '3px 8px 1px 16px', fontSize: 9,
                fontWeight: 700, color: C.red, background: `${C.red}06` }}>Pasivo No Corriente</td></tr>
              {filas.filter(s => (s.categoria_ifrs || clasificarSeccionEsf(s.codigo)) === 'Pasivo No Corriente')
                .map((c, i) => <FilaEsf key={c.codigo} c={c} piso={piso} i={i} />)}
              <SubtotalEsf label="Total Pasivo No Corriente" total={tPNC.neto} t1={tPNC.t1} />
              <SubtotalEsf label="TOTAL PASIVOS" total={totalPasivos} t1={totalPasivosT1} bold separador />

              {/* ── PATRIMONIO ── */}
              <tr><td colSpan={7} style={{ padding: '5px 8px', fontWeight: 900, fontSize: 10,
                color: C.teal, background: `${C.teal}15`, letterSpacing: '0.08em',
                borderTop: `2px solid ${C.teal}60` }}>PATRIMONIO</td></tr>
              {filas.filter(s => (s.categoria_ifrs || clasificarSeccionEsf(s.codigo)) === 'Patrimonio')
                .map((c, i) => <FilaEsf key={c.codigo} c={c} piso={piso} i={i} />)}
              <SubtotalEsf label="TOTAL PATRIMONIO" total={tPat.neto} t1={tPat.t1} bold separador />

              {/* ── CUADRE ── */}
              <tr style={{ background: cuadre ? `${C.green}10` : `${C.red}10`,
                borderTop: `2px solid ${cuadre ? C.green : C.red}60` }}>
                <td colSpan={3} style={{ padding: '4px 8px', fontWeight: 800, fontSize: 10,
                  color: cuadre ? C.green : C.red }}>
                  TOTAL PASIVOS + PATRIMONIO
                </td>
                <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 800,
                  color: cuadre ? C.green : C.red }}>{fmtNum(totalPasYPat)}</td>
                <td colSpan={3} style={{ padding: '4px 6px', textAlign: 'right', fontSize: 9,
                  color: cuadre ? C.green : C.red }}>
                  {cuadre ? '✓ Cuadra con Total Activos' : `⚠ Diferencia: ${fmtNum(totalActivos - totalPasYPat)}`}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Sección ER ───────────────────────────────────────────────────────────────

function TablaEr({ movimientos, mes, piso, justif = [], informeId, canEdit, usuarioActual }) {
  const [expandido,        setExpandido]        = useState(true);
  const [vistaEr,          setVistaEr]          = useState('temporada');
  const [filtroMat,        setFiltroMat]        = useState(false);
  const [gruposExpandidos, setGruposExpandidos] = useState({}); // por defecto colapsado
  const [justAbierto,      setJustAbierto]      = useState({});
  const [justTexts,        setJustTexts]        = useState({});
  const [justGuard,        setJustGuard]        = useState({});

  function toggleGrupo(key) {
    setGruposExpandidos(g => ({ ...g, [key]: !g[key] }));
  }

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
    setJustGuard(g => ({ ...g, [codigo]: true }));
    try {
      await guardarJustificacion(informeId, codigo, 'er', justTexts[codigo] || '', usuarioActual?.nombre);
    } catch (e) { console.error('guardarJust:', e); }
    finally { setJustGuard(g => ({ ...g, [codigo]: false })); }
  }

  const rf  = vistaEr === 'mes' ? 'real_mes'       : vistaEr === 'ytd' ? 'real_ytd'       : 'real_temporada';
  const pf  = vistaEr === 'mes' ? 'ppto_mes'       : vistaEr === 'ytd' ? 'ppto_ytd'       : 'ppto_temporada';
  const t1f = vistaEr === 'mes' ? 'real_t1_mes'    : vistaEr === 'ytd' ? 'real_t1_ytd'    : 'real_t1_temporada';

  const byGrupo = useMemo(() => {
    const keys = ['Ingreso Operacional','Costo Operacional','Gasto Operacional',
                  'Ingreso No Operacional','Gasto No Operacional','Impuesto'];
    const r = {}; keys.forEach(k => { r[k] = []; });
    movimientos.forEach(m => {
      const g = m.grupo_er || clasificarGrupoEr(m.codigo);
      if (r[g]) r[g].push(m);
    });
    return r;
  }, [movimientos]);

  const sumR  = list => list.reduce((a, c) => a + (c[rf]  || 0), 0);
  const sumP  = list => list.reduce((a, c) => a + (c[pf]  || 0), 0);
  const sumT1 = list => list.reduce((a, c) => a + (c[t1f] || 0), 0);

  const sIngOp   = sumR(byGrupo['Ingreso Operacional']);
  const sCostOp  = sumR(byGrupo['Costo Operacional']);
  const sGasOp   = sumR(byGrupo['Gasto Operacional']);
  const sIngNoOp = sumR(byGrupo['Ingreso No Operacional']);
  const sGasNoOp = sumR(byGrupo['Gasto No Operacional']);
  const sImp     = sumR(byGrupo['Impuesto']);

  const pIngOp   = sumP(byGrupo['Ingreso Operacional']);
  const pCostOp  = sumP(byGrupo['Costo Operacional']);
  const pGasOp   = sumP(byGrupo['Gasto Operacional']);
  const pIngNoOp = sumP(byGrupo['Ingreso No Operacional']);
  const pGasNoOp = sumP(byGrupo['Gasto No Operacional']);
  const pImp     = sumP(byGrupo['Impuesto']);

  const t1IngOp   = sumT1(byGrupo['Ingreso Operacional']);
  const t1CostOp  = sumT1(byGrupo['Costo Operacional']);
  const t1GasOp   = sumT1(byGrupo['Gasto Operacional']);
  const t1IngNoOp = sumT1(byGrupo['Ingreso No Operacional']);
  const t1GasNoOp = sumT1(byGrupo['Gasto No Operacional']);
  const t1Imp     = sumT1(byGrupo['Impuesto']);

  const margenBruto = sIngOp + sCostOp;
  const ebitda      = margenBruto + sGasOp;
  const rai         = ebitda + sIngNoOp + sGasNoOp;
  const resultado   = rai + sImp;

  const pMargen    = pIngOp + pCostOp;
  const pEbitda    = pMargen + pGasOp;
  const pRai       = pEbitda + pIngNoOp + pGasNoOp;
  const pResultado = pRai + pImp;

  const t1Margen    = t1IngOp + t1CostOp;
  const t1Ebitda    = t1Margen + t1GasOp;
  const t1Rai       = t1Ebitda + t1IngNoOp + t1GasNoOp;
  const t1Resultado = t1Rai + t1Imp;

  function calcVp(real, ppto) {
    if (ppto == null || ppto === 0) return null;
    return ((real - ppto) / Math.abs(ppto)) * 100;
  }
  function colVp(vp)  {
    if (vp == null || Math.abs(vp) < piso) return C.text;
    return vp > 0 ? C.green : C.red;
  }
  function colVa(va) {
    if (va == null) return C.muted;
    return va > 0 ? C.green : va < 0 ? C.red : C.text;
  }

  const filteredByGrupo = useMemo(() => {
    if (!filtroMat) return byGrupo;
    const r = {};
    Object.keys(byGrupo).forEach(k => {
      r[k] = byGrupo[k].filter(m => {
        const vp = calcVp(m[rf] || 0, m[pf]);
        return vp != null && Math.abs(vp) >= piso;
      });
    });
    return r;
  }, [byGrupo, filtroMat, rf, pf, piso]);

  // Renders a group (parent total row + indented sub-accounts, collapsible)
  function renderGrupo(grupoKey, titulo) {
    const all    = byGrupo[grupoKey];
    const filas  = filteredByGrupo[grupoKey];
    if (!all.length) return null;
    const rTot = sumR(all), pTot = sumP(all), t1Tot = sumT1(all);
    const va = pTot !== 0 ? rTot - pTot : null;
    const vp = calcVp(rTot, pTot !== 0 ? pTot : null);
    const hasT1 = t1Tot !== 0;
    const abierto = !!gruposExpandidos[grupoKey];
    return (
      <React.Fragment key={grupoKey}>
        <tr style={{ background: `${C.teal}10`, borderTop: `2px solid ${C.teal}40`, cursor: 'pointer' }}
            onClick={() => toggleGrupo(grupoKey)}>
          <td style={{ width: 14, textAlign: 'center', fontSize: 9, color: C.teal, padding: '3px 2px', userSelect: 'none' }}>
            {abierto ? '▼' : '►'}
          </td>
          <td />
          <td style={{ padding: '3px 6px', fontWeight: 800, fontSize: 10, color: C.teal }}>{titulo}</td>
          <td style={{ padding: '3px 6px', textAlign: 'right', fontWeight: 800, color: C.text }}>{fmtNum(rTot)}</td>
          <td style={{ padding: '3px 6px', textAlign: 'right', color: C.muted }}>{pTot !== 0 ? fmtNum(pTot) : '—'}</td>
          <td style={{ padding: '3px 6px', textAlign: 'right', color: colVa(va) }}>{va != null ? fmtNum(va) : '—'}</td>
          <td style={{ padding: '3px 6px', textAlign: 'right', color: colVp(vp) }}>{fmtPct(vp)}</td>
          <td style={{ padding: '3px 6px', textAlign: 'right', color: C.muted }}>{hasT1 ? fmtNum(t1Tot) : '—'}</td>
          <td />
        </tr>
        {abierto && filas.map((c, i) => {
          const real = c[rf] || 0;
          const ppto = c[pf];
          const t1v  = c[t1f];
          const va2  = ppto != null ? real - ppto : null;
          const vp2  = calcVp(real, ppto);
          const tieneJust = !!(justMap[c.codigo]?.texto || justMap[c.codigo]?.texto_original || justTexts[c.codigo]);
          const abierto = !!justAbierto[c.codigo];
          return (
            <React.Fragment key={c.codigo}>
              <tr style={{ background: i % 2 ? C.bg : `${C.card}30` }}>
                <td style={{ textAlign: 'center', paddingLeft: 4, width: 14 }}>
                  <Semaforo varPct={vp2} piso={piso} />
                </td>
                <td style={{ padding: '2px 6px', color: C.muted, fontFamily: 'monospace', fontSize: 9 }}>{c.codigo}</td>
                <td style={{ padding: '2px 6px 2px 18px', fontSize: 10, color: `${C.text}cc` }}>{c.nombre || c.nombre_origen}</td>
                <td style={{ padding: '2px 6px', textAlign: 'right', fontSize: 10 }}>{fmtNum(real)}</td>
                <td style={{ padding: '2px 6px', textAlign: 'right', color: C.muted, fontSize: 10 }}>{ppto != null ? fmtNum(ppto) : '—'}</td>
                <td style={{ padding: '2px 6px', textAlign: 'right', fontSize: 10, color: colVa(va2) }}>{va2 != null ? fmtNum(va2) : '—'}</td>
                <td style={{ padding: '2px 6px', textAlign: 'right', fontSize: 10, color: colVp(vp2) }}>{fmtPct(vp2)}</td>
                <td style={{ padding: '2px 6px', textAlign: 'right', color: C.muted, fontSize: 10 }}>{t1v != null ? fmtNum(t1v) : '—'}</td>
                <td style={{ textAlign: 'center', width: 22 }}>
                  <button onClick={() => setJustAbierto(a => ({ ...a, [c.codigo]: !a[c.codigo] }))}
                    title={tieneJust ? 'Ver/editar justificación' : 'Agregar justificación'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: '1px 3px',
                      color: tieneJust ? C.blue : abierto ? C.muted : `${C.muted}55` }}>
                    {tieneJust ? '✎' : '+'}
                  </button>
                </td>
              </tr>
              {abierto && (
                <tr style={{ background: i % 2 ? C.bg : `${C.card}30` }}>
                  <td colSpan={9} style={{ padding: '2px 10px 6px 32px' }}>
                    <textarea value={justTexts[c.codigo] || ''}
                      onChange={e => setJustTexts(t => ({ ...t, [c.codigo]: e.target.value }))}
                      onBlur={() => guardarJust(c.codigo)}
                      disabled={!canEdit || justGuard[c.codigo]} rows={2}
                      placeholder="Justificación para esta cuenta..."
                      style={{ width: '100%', boxSizing: 'border-box', background: C.bg, color: C.text,
                        border: `1px solid ${C.border}`, borderRadius: 4,
                        padding: '4px 6px', fontSize: 10, resize: 'vertical', fontFamily: 'inherit' }} />
                    {justGuard[c.codigo] && <span style={{ fontSize: 9, color: C.muted }}>Guardando...</span>}
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </React.Fragment>
    );
  }

  function renderSubtotal(label, real, ppto, t1, bold, separador) {
    const va = ppto !== 0 ? real - ppto : null;
    const vp = calcVp(real, ppto !== 0 ? ppto : null);
    const hasT1 = t1 !== 0;
    return (
      <tr style={{
        background: bold ? `${C.blue}12` : `${C.card}60`,
        borderTop: separador ? `2px solid ${C.blue}50` : `1px solid ${C.border}30`,
      }}>
        <td colSpan={2} />
        <td style={{ padding: '4px 6px', fontWeight: bold ? 800 : 600, fontSize: 10,
          color: bold ? C.blue : C.text, fontStyle: bold ? 'normal' : 'italic' }}>
          {label}
        </td>
        <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: bold ? 800 : 600,
          color: bold ? (real >= 0 ? C.blue : C.red) : (real >= 0 ? C.green : C.red) }}>
          {fmtNum(real)}
        </td>
        <td style={{ padding: '4px 6px', textAlign: 'right', color: C.muted }}>
          {ppto !== 0 ? fmtNum(ppto) : '—'}
        </td>
        <td style={{ padding: '4px 6px', textAlign: 'right', color: colVa(va) }}>
          {va != null ? fmtNum(va) : '—'}
        </td>
        <td style={{ padding: '4px 6px', textAlign: 'right', color: colVp(vp) }}>
          {fmtPct(vp)}
        </td>
        <td style={{ padding: '4px 6px', textAlign: 'right', color: C.muted }}>
          {hasT1 ? fmtNum(t1) : '—'}
        </td>
        <td />
      </tr>
    );
  }

  const THD = ({ children, right }) => (
    <th style={{ padding: '3px 6px', textAlign: right ? 'right' : 'left',
      color: C.muted, fontSize: 9, fontWeight: 600, background: C.card,
      borderBottom: `1px solid ${C.border}` }}>{children}</th>
  );

  const hasNoOp = byGrupo['Ingreso No Operacional'].length > 0 || byGrupo['Gasto No Operacional'].length > 0;
  const hasImp  = byGrupo['Impuesto'].length > 0;

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <button onClick={() => setExpandido(e => !e)}
          style={{ fontWeight: 800, fontSize: 12, color: C.blue, background: 'none', border: 'none', cursor: 'pointer' }}>
          {expandido ? '▼' : '►'} Estado de Resultados
        </button>
        {expandido && (
          <>
            <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: `1px solid ${C.border}` }}>
              {[['temporada','Temporada'],['ytd','YTD'],['mes','Mes']].map(([v, l]) => (
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
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr>
                <THD> </THD><THD>Código</THD><THD>Concepto</THD>
                <THD right>Real</THD><THD right>Ppto</THD>
                <THD right>Var $</THD><THD right>Var %</THD>
                <THD right>Año ant.</THD>
                <THD> </THD>
              </tr>
            </thead>
            <tbody>
              {renderGrupo('Ingreso Operacional', 'Ingresos por ventas')}
              {byGrupo['Costo Operacional'].length > 0 && renderGrupo('Costo Operacional', 'Costos por venta')}
              {renderSubtotal('Margen operacional', margenBruto, pMargen, t1Margen, false, false)}
              {renderGrupo('Gasto Operacional', 'Gastos de administración y ventas')}
              {renderSubtotal('Resultado Operacional (EBITDA)', ebitda, pEbitda, t1Ebitda, true, true)}
              {hasNoOp && <>
                {byGrupo['Ingreso No Operacional'].length > 0 && renderGrupo('Ingreso No Operacional', 'Ingresos no operacionales')}
                {byGrupo['Gasto No Operacional'].length > 0 && renderGrupo('Gasto No Operacional', 'Egresos no operacionales')}
                {renderSubtotal('Resultado antes de impuesto', rai, pRai, t1Rai, false, false)}
              </>}
              {hasImp && renderGrupo('Impuesto', 'Impuesto a la renta')}
              {renderSubtotal('Resultado del ejercicio', resultado, pResultado, t1Resultado, true, true)}
            </tbody>
          </table>
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

export default function AnfTab({ canEdit, usuarioActual, empresaDefault, mesDefault, anioDefault }) {
  const esCFO = usuarioActual?.rol === 'admin' || usuarioActual?.esCFO;

  // ── Estado principal ────────────────────────────────────────────────────────
  const [filiales,    setFiliales]    = useState([]);
  const [informes,    setInformes]    = useState([]);
  const [filialId,    setFilialId]    = useState('');
  const [anio,        setAnio]        = useState(anioDefault || new Date().getFullYear());
  const [mes,         setMes]         = useState(mesDefault  || new Date().getMonth() + 1);
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
        // Pre-seleccionar empresa del módulo padre, o la primera disponible
        const match = empresaDefault && f.find(x => x.nombre === empresaDefault || x.codigo === empresaDefault);
        setFilialId(match ? match.id : (f[0]?.id || ''));
        const inf = await cargarInformes();
        setInformes(inf);
      } catch (e) {
        setError('Error cargando filiales: ' + e.message);
      }
    })();
  }, []);

  // Sincronizar empresa cuando el módulo padre cambia
  useEffect(() => {
    if (!empresaDefault || !filiales.length) return;
    const match = filiales.find(x => x.nombre === empresaDefault || x.codigo === empresaDefault);
    if (match && match.id !== filialId) setFilialId(match.id);
  }, [empresaDefault, filiales]);

  // Sincronizar mes/año cuando el módulo padre cambia
  useEffect(() => { if (mesDefault)  setMes(mesDefault);  }, [mesDefault]);
  useEffect(() => { if (anioDefault) setAnio(anioDefault); }, [anioDefault]);

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
        setKpisOp(data.kpisOp);
        setTipoCierre(data.informe.tipo_cierre || '');
        setTipoProm(data.informe.tipo_promedio || '');
        // Auto-reparar KPIs si hay ESF/ER pero no hay KPIs guardados
        if (!data.kpisDer.length && data.esf.length && data.er.length) {
          const kpis = calcularKpisDerivaos(data.esf, data.er);
          await guardarKpisDerivaos(data.informe.id, kpis);
          setKpisDer(kpis);
        } else {
          setKpisDer(data.kpisDer);
        }
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
    if (faltantesJust.length > 0) {
      const pisoFilial = filiales.find(f => f.id === filialId)?.piso_materialidad || 10;
      const lista = faltantesJust.map(f => `• ${f.grupo} (${f.varPct > 0 ? '+' : ''}${f.varPct.toFixed(1)}%)`).join('\n');
      setError(`No se puede aprobar: faltan justificaciones en grupos con variación ≥ ${pisoFilial}%:\n${lista}`);
      return;
    }
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
    const moneda  = filial?.moneda || 'USD';
    const pisoM   = filial?.piso_materialidad || 10;
    const negocio = filial?.descripcion || filial?.negocio || '';

    // Etiquetas de período (ej. "25/26" y "24/25")
    const tA  = `${(anio-1).toString().slice(2)}/${anio.toString().slice(2)}`;
    const tA1 = `${(anio-2).toString().slice(2)}/${(anio-1).toString().slice(2)}`;

    // ── Formateadores ────────────────────────────────────────────────────────
    // Número entero con separador de miles (es-CL: 1.118.170 / -352.830)
    const fmtM = (v) => {
      if (v == null || isNaN(v)) return '—';
      return v.toLocaleString('es-CL', { maximumFractionDigits: 0 });
    };
    // Porcentaje con 1 decimal y coma (es-CL: -17,7% / +53,6%)
    const fmtPctD = (v) => {
      if (v == null || isNaN(v)) return '—';
      const abs = Math.abs(v).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      return (v < 0 ? '-' : '') + abs + '%';
    };
    // Porcentaje entero con signo (ER tabla: -24% / +43%)
    const fmtPctI = (v) => {
      if (v == null || isNaN(v)) return '—';
      const abs = Math.abs(v).toLocaleString('es-CL', { maximumFractionDigits: 0 });
      return (v < 0 ? '-' : '+') + abs + '%';
    };
    // Ratio con 1 decimal y coma + "x" (es-CL: 0,2x / 3,6x)
    const fmtRatio = (v) => {
      if (v == null || isNaN(v)) return '—';
      return v.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'x';
    };

    // Var% con denominador FIRMADO: (real-ppto)/ppto*100
    // Retorna null si ppto=0 (→ "s/p"), null si ppto=null (→ "—")
    const calcVp = (real, ppto) => {
      if (ppto == null) return undefined; // sin dato de ppto → "—"
      if (ppto === 0) return null;         // sin presupuesto → "s/p"
      return ((real - ppto) / ppto) * 100;
    };
    const fmtVp = (real, ppto) => {
      const v = calcVp(real, ppto);
      if (v === undefined) return '—';
      if (v === null) return 's/p';
      return fmtPctI(v);
    };
    // va > 0 siempre es favorable (valores firmados): ingresos+, costos- → la resta real-ppto es positiva cuando es bueno
    const colVa = (va) => va == null ? '#888' : va > 0 ? '#1a7a4a' : va < 0 ? '#b22222' : '#333';
    // Para %Var usamos el signo del resultado (con denominador firmado): >0 siempre favorable
    const colVp = (real, ppto) => {
      const v = calcVp(real, ppto);
      if (v === undefined || v === null || Math.abs(v) < pisoM) return '#333';
      return v > 0 ? '#1a7a4a' : '#b22222';
    };

    const BLU = '#1a3a6a', ACC = '#1a5fa8', GRN = '#1a7a4a', RED = '#b22222', MUT = '#666';

    // ── Celdas helper ────────────────────────────────────────────────────────
    const td  = (t, a='left', col='', bold=false, extra='') =>
      `<td style="padding:2px 7px;text-align:${a};font-size:8.5pt;${col?`color:${col};`:''}${bold?'font-weight:700;':''}${extra}">${t ?? '—'}</td>`;
    const th  = (t, a='left', w='') =>
      `<th style="padding:3px 7px;text-align:${a};font-size:8pt;font-weight:600;color:#555;background:#f0f3f9;border-bottom:1.5pt solid #ccd5e0;${w?`width:${w};`:''}">${t}</th>`;

    // ── 1. ER — datos ────────────────────────────────────────────────────────
    const erByG = {};
    const ER_KEYS = ['Ingreso Operacional','Costo Operacional','Gasto Operacional',
                     'Ingreso No Operacional','Gasto No Operacional','Impuesto'];
    ER_KEYS.forEach(k => { erByG[k] = []; });
    er.forEach(m => { const g = m.grupo_er || clasificarGrupoEr(m.codigo); if (erByG[g]) erByG[g].push(m); });

    const sR  = k => erByG[k].reduce((a,c) => a + (c.real_temporada  || 0), 0);
    const sP  = k => erByG[k].reduce((a,c) => a + (c.ppto_temporada  || 0), 0);
    const sT1 = k => erByG[k].reduce((a,c) => a + (c.real_t1_temporada || 0), 0);

    const rIngOp = sR('Ingreso Operacional'), pIngOp = sP('Ingreso Operacional'), t1IngOp = sT1('Ingreso Operacional');
    const rCost  = sR('Costo Operacional'),   pCost  = sP('Costo Operacional'),   t1Cost  = sT1('Costo Operacional');
    const rGas   = sR('Gasto Operacional'),   pGas   = sP('Gasto Operacional'),   t1Gas   = sT1('Gasto Operacional');
    const rIngNo = sR('Ingreso No Operacional'), pIngNo = sP('Ingreso No Operacional'), t1IngNo = sT1('Ingreso No Operacional');
    const rGasNo = sR('Gasto No Operacional'),   pGasNo = sP('Gasto No Operacional'),   t1GasNo = sT1('Gasto No Operacional');
    const rImp   = sR('Impuesto'),            pImp   = sP('Impuesto'),            t1Imp   = sT1('Impuesto');

    const rMargen = rIngOp + rCost,             pMargen = pIngOp + pCost,             t1Margen = t1IngOp + t1Cost;
    const rEbitda = rMargen + rGas,             pEbitda = pMargen + pGas,             t1Ebitda = t1Margen + t1Gas;
    const rRai    = rEbitda + rIngNo + rGasNo,  pRai    = pEbitda + pIngNo + pGasNo,  t1Rai    = t1Ebitda + t1IngNo + t1GasNo;
    const rRes    = rRai + rImp,                pRes    = pRai + pImp,                t1Res    = t1Rai + t1Imp;

    const hasT1Er = t1IngOp !== 0 || t1Cost !== 0 || t1Gas !== 0 || t1IngNo !== 0 || t1GasNo !== 0;
    const T1H = hasT1Er; // alias corto

    // Fila de sub-cuenta (indentada)
    function erSubRow(c, i) {
      const real = c.real_temporada || 0, ppto = c.ppto_temporada, t1 = c.real_t1_temporada;
      const va = ppto != null ? real - ppto : null;
      const t1str = T1H ? (t1 != null ? fmtM(t1) : 'n/d') : '';
      return `<tr style="background:${i%2?'#f9fafe':'#fff'}">
        ${td('    ' + (c.nombre || c.nombre_origen), 'left', '#444')}
        ${td(fmtM(real), 'right', '', true)}
        ${td(ppto!=null?fmtM(ppto):'—', 'right', MUT)}
        ${td(va!=null?fmtM(va):'—', 'right', colVa(va))}
        ${td(fmtVp(real,ppto), 'right', colVp(real,ppto))}
        ${T1H ? td(t1str, 'right', MUT) : ''}
      </tr>`;
    }

    // Fila de grupo (negrita, fondo tenue)
    function erGrupoRow(label, real, ppto, t1) {
      const va = real - ppto;
      const t1str = T1H ? (t1 !== 0 ? fmtM(t1) : 'n/d') : '';
      return `<tr style="background:#f0f3f9;border-top:0.75pt solid #c8d5e8">
        ${td(`<strong>${label}</strong>`, 'left', '#222')}
        ${td(fmtM(real), 'right', '', true)}
        ${td(ppto!==0?fmtM(ppto):'—', 'right', MUT)}
        ${td(ppto!==0?fmtM(va):'—', 'right', colVa(ppto!==0?va:null))}
        ${td(fmtVp(real,ppto!==0?ppto:null), 'right', colVp(real,ppto!==0?ppto:null))}
        ${T1H ? td(t1str, 'right', MUT) : ''}
      </tr>`;
    }

    // Fila de subtotal (negrita, fondo medio)
    function erSubtotalRow(label, real, ppto, t1) {
      const va = real - ppto;
      const rCol = real >= 0 ? GRN : RED;
      const t1str = T1H ? (t1 !== 0 ? fmtM(t1) : 'n/d') : '';
      return `<tr style="background:#e5ecf7;border-top:1pt solid #b0bfd4;border-bottom:1pt solid #b0bfd4">
        ${td(label, 'left', BLU, true)}
        ${td(fmtM(real), 'right', rCol, true)}
        ${td(ppto!==0?fmtM(ppto):'—', 'right', MUT, true)}
        ${td(ppto!==0?fmtM(va):'—', 'right', colVa(ppto!==0?va:null), true)}
        ${td(fmtVp(real,ppto!==0?ppto:null), 'right', colVp(real,ppto!==0?ppto:null), true)}
        ${T1H ? td(t1str, 'right', MUT, true) : ''}
      </tr>`;
    }

    // Fila de resultado final (máxima relevancia, doble borde)
    function erResultadoRow(label, real, ppto, t1) {
      const va = real - ppto;
      const rCol = real >= 0 ? GRN : RED;
      const t1str = T1H ? (t1 !== 0 ? fmtM(t1) : 'n/d') : '';
      return `<tr style="background:#d8e4f5;border-top:1.5pt solid ${ACC};border-bottom:1.5pt solid ${ACC}">
        ${td(`<strong>${label}</strong>`, 'left', BLU, true)}
        ${td(fmtM(real), 'right', rCol, true)}
        ${td(ppto!==0?fmtM(ppto):'—', 'right', MUT, true)}
        ${td(ppto!==0?fmtM(va):'—', 'right', colVa(ppto!==0?va:null), true)}
        ${td(fmtVp(real,ppto!==0?ppto:null), 'right', colVp(real,ppto!==0?ppto:null), true)}
        ${T1H ? td(t1str, 'right', MUT, true) : ''}
      </tr>`;
    }

    let erRows = '';
    erRows += erGrupoRow('Ingresos por ventas', rIngOp, pIngOp, t1IngOp);
    erRows += erByG['Ingreso Operacional'].map((c,i) => erSubRow(c,i)).join('');
    if (erByG['Costo Operacional'].length) {
      erRows += erGrupoRow('Costos por venta', rCost, pCost, t1Cost);
      erRows += erByG['Costo Operacional'].map((c,i) => erSubRow(c,i)).join('');
    }
    erRows += erSubtotalRow('Margen operacional', rMargen, pMargen, t1Margen);
    erRows += erGrupoRow('Gastos de administración y ventas', rGas, pGas, t1Gas);
    erRows += erByG['Gasto Operacional'].map((c,i) => erSubRow(c,i)).join('');
    erRows += erResultadoRow('Resultado Operacional (EBITDA)', rEbitda, pEbitda, t1Ebitda);
    const hasNoOp = erByG['Ingreso No Operacional'].length || erByG['Gasto No Operacional'].length;
    if (erByG['Ingreso No Operacional'].length) {
      erRows += erGrupoRow('Ingresos no operacionales', rIngNo, pIngNo, t1IngNo);
      erRows += erByG['Ingreso No Operacional'].map((c,i) => erSubRow(c,i)).join('');
    }
    if (erByG['Gasto No Operacional'].length) {
      erRows += erGrupoRow('Egresos no operacionales', rGasNo, pGasNo, t1GasNo);
      erRows += erByG['Gasto No Operacional'].map((c,i) => erSubRow(c,i)).join('');
    }
    if (hasNoOp) erRows += erSubtotalRow('Resultado antes de impuesto', rRai, pRai, t1Rai);
    if (erByG['Impuesto'].length) {
      erRows += erGrupoRow('Impuesto a la renta', rImp, pImp, t1Imp);
      erRows += erByG['Impuesto'].map((c,i) => erSubRow(c,i)).join('');
    }
    erRows += erResultadoRow('Resultado del ejercicio', rRes, pRes, t1Res);

    const secTit = (n, t) =>
      `<div style="font-size:9.5pt;font-weight:800;color:${BLU};border-bottom:1pt solid ${ACC}40;padding-bottom:3px;margin:18px 0 6px">${n}. ${t}</div>`;

    const erHTML = `
      ${secTit(1, `Estado de Resultados (Período Jul-${anio-1} a Jun-${anio}) — ${moneda}`)}
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          ${th('Concepto','left','38%')}
          ${th(`Real ${tA}`,'right','13%')}
          ${th(`Ppto ${tA}`,'right','13%')}
          ${th('Variación','right','11%')}
          ${th('% Var.','right','8%')}
          ${T1H ? th(`Real ${tA1}`,'right','13%') : ''}
        </tr></thead>
        <tbody>${erRows}</tbody>
      </table>`;

    // ── Justificaciones ER ────────────────────────────────────────────────────
    const justER = justif.filter(j => j.tipo_estado === 'er' && (j.texto || j.texto_original));
    const narrHTML = justER.length ? `
      <div style="margin-top:12px">
        <div style="font-size:9pt;font-weight:700;color:${BLU};margin-bottom:6px">Justificación de variaciones del Estado de Resultados</div>
        ${justER.map(j => {
          const txt = j.texto || j.texto_original || '';
          // Intentar formatear como "● Nombre (var%): texto" si el nombre está disponible
          const label = j.codigo ? `<strong>${j.codigo}</strong>` : '';
          return `<div style="font-size:8.5pt;margin-bottom:5px;padding-left:14px;text-indent:-14px;line-height:1.5;color:#222">
            ●&nbsp;${label}${label && txt ? ': ' : ''}${txt}
          </div>`;
        }).join('')}
      </div>` : '';

    // ── 2. ESF — datos ───────────────────────────────────────────────────────
    const esfSec = (sec) => esf.filter(c => (c.categoria_ifrs || clasificarSeccionEsf(c.codigo)) === sec);
    const esfSum = (arr) => arr.reduce((a,c) => a + (c.saldo_neto || 0), 0);

    const AC  = esfSec('Activo Corriente'),   ANC = esfSec('Activo No Corriente');
    const PC  = esfSec('Pasivo Corriente'),   PNC = esfSec('Pasivo No Corriente');
    const PAT = esfSec('Patrimonio');
    const tAC = esfSum(AC), tANC = esfSum(ANC);
    const totalActivos = tAC + tANC;
    const allPasivos = [...PC, ...PNC];  // sin split por corriente/no corriente (sigue formato PDF)
    const tPasivos = esfSum(PC) + esfSum(PNC);
    const tPAT = esfSum(PAT);
    const totalPasYPat = tPasivos + tPAT;
    const cuadra = Math.abs(totalActivos - totalPasYPat) < 1;

    function bsCuentaRow(c, i) {
      return `<tr style="background:${i%2?'#f9fafe':'#fff'}">
        <td style="padding:2px 7px 2px 22px;font-size:8.5pt;color:#333">${c.nombre || c.nombre_origen}</td>
        <td style="padding:2px 7px;text-align:right;font-size:8.5pt">${fmtM(c.saldo_neto)}</td>
      </tr>`;
    }
    function bsSubtotalRow(label, total, bold=false, color=BLU) {
      const bg    = bold ? '#d8e4f5' : '#e5ecf7';
      const bt    = bold ? `1.5pt solid ${ACC}` : `1pt solid #b0bfd4`;
      const fw    = bold ? 800 : 700;
      return `<tr style="background:${bg};border-top:${bt}">
        <td style="padding:3px 7px;font-weight:${fw};font-size:8.5pt;color:${color}">${label}</td>
        <td style="padding:3px 7px;text-align:right;font-weight:${fw};font-size:8.5pt;color:${color}">${fmtM(total)}</td>
      </tr>`;
    }
    function bsSectionHeader(label) {
      return `<tr style="background:#d8e4f5">
        <td colspan="2" style="padding:4px 7px;font-weight:900;font-size:9pt;color:${BLU};text-transform:uppercase;letter-spacing:0.06em">${label}</td>
      </tr>`;
    }

    // ── Columna ACTIVOS ──────────────────────────────────────────────────────
    function bsCol(rows) {
      return `<table style="width:100%;border-collapse:collapse">${rows}</table>`;
    }
    const cuadreCol = cuadra ? GRN : RED;

    let colActivos = '';
    colActivos += `<tr style="background:#d8e4f5"><td colspan="2" style="padding:4px 7px;font-weight:900;font-size:9pt;color:${BLU};text-transform:uppercase;letter-spacing:0.06em">ACTIVOS</td></tr>`;
    colActivos += AC.map((c,i) => bsCuentaRow(c,i)).join('');
    colActivos += bsSubtotalRow('Total activos corrientes', tAC);
    colActivos += ANC.map((c,i) => bsCuentaRow(c,i)).join('');
    colActivos += bsSubtotalRow('Total activos no corrientes', tANC);
    colActivos += bsSubtotalRow('Total activos', totalActivos, true);

    // ── Columna PASIVOS Y PATRIMONIO ─────────────────────────────────────────
    let colPasivos = '';
    colPasivos += `<tr style="background:#d8e4f5"><td colspan="2" style="padding:4px 7px;font-weight:900;font-size:9pt;color:${BLU};text-transform:uppercase;letter-spacing:0.06em">PASIVOS Y PATRIMONIO</td></tr>`;
    colPasivos += allPasivos.map((c,i) => bsCuentaRow(c,i)).join('');
    colPasivos += bsSubtotalRow('Total pasivos', tPasivos);
    colPasivos += PAT.map((c,i) => bsCuentaRow(c,i)).join('');
    colPasivos += bsSubtotalRow('Total patrimonio', tPAT, false, tPAT < 0 ? RED : BLU);
    colPasivos += `<tr style="background:${cuadra?'#e6f4ec':'#fde8e8'};border-top:1.5pt solid ${cuadreCol}">
      <td style="padding:3.5px 7px;font-weight:800;font-size:8.5pt;color:${cuadreCol}">${cuadra ? 'Total pasivos y patrimonio' : '⚠ Total pas. y pat. (descuadre)'}</td>
      <td style="padding:3.5px 7px;text-align:right;font-weight:800;font-size:8.5pt;color:${cuadreCol}">${fmtM(totalPasYPat)}</td>
    </tr>`;

    const esfHTML = `
      ${secTit(2, `Estado de Situación al ${NOMBRES_MES[mes]} de ${anio} — ${moneda}`)}
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="width:50%;vertical-align:top;padding-right:14px">
            ${bsCol(colActivos)}
          </td>
          <td style="width:50%;vertical-align:top;padding-left:14px;border-left:0.75pt solid #ccd5e0">
            ${bsCol(colPasivos)}
          </td>
        </tr>
      </table>
      <p style="font-size:7.5pt;color:${MUT};margin-top:7px;font-style:italic;line-height:1.45">
        El resultado del ejercicio contable (ene–${NOMBRES_MES[mes].toLowerCase()} ${anio}) que registra el patrimonio difiere del resultado de la temporada (jul-${anio-1} a jun-${anio}) de la sección 1, por corresponder a períodos distintos: la porción jul–dic ${anio-1} de la temporada ya fue cerrada contablemente en resultados acumulados.
      </p>`;

    // ── 3. KPIs ─────────────────────────────────────────────────────────────
    const mapaK = Object.fromEntries(kpisDer.map(k => [k.clave, k.valor]));
    const kVal  = (c) => mapaK[c] ?? null;

    // EBITDA de temporada y margen (directo desde ER)
    const margenEbitdaPct    = rIngOp !== 0 ? (rEbitda / rIngOp) * 100 : null;
    const margenEbitdaT1Pct  = t1IngOp !== 0 ? (t1Ebitda / t1IngOp) * 100 : null;
    // Cumplimiento EBITDA vs ppto (muestra "neg." si EBITDA real < 0)
    const cumplEbitdaPct = pEbitda !== 0 ? (rEbitda / pEbitda) * 100 : null;
    const cumplEbitdaFmt = rEbitda < 0 ? 'neg.' :
                           (cumplEbitdaPct != null ? Math.round(cumplEbitdaPct) + '%' : '—');
    // Liquidez y capital de trabajo desde KPIs derivados
    const liquidez    = kVal('liquidez_corriente');
    const capTrabajo  = kVal('capital_trabajo');
    // Deuda / Patrimonio: n/a si patrimonio negativo
    const deudaPat    = tPAT < 0 ? 'n/a' : (kVal('deuda_patrimonio') != null ? fmtRatio(kVal('deuda_patrimonio')) : '—');
    // Deuda / EBITDA: n/a si EBITDA negativo
    const deudaEbitda = rEbitda < 0 ? 'n/a' : (kVal('deuda_ebitda') != null ? fmtRatio(kVal('deuda_ebitda')) : '—');
    const deudaEbitdaT1 = (T1H && t1Ebitda >= 0) ? '—' : (T1H ? 'n/a' : '');

    // KPIs operacionales (ej. kilos para Allegria Service)
    const kpisOpRows = kpisOp.length ? kpisOp.map((k, i) => {
      const cfg = k.anf_metricas_config || {};
      const vReal = k.valor_real != null ? k.valor_real.toLocaleString('es-CL', { maximumFractionDigits: 0 }) + (cfg.unidad && cfg.unidad !== 'n' ? ' ' + cfg.unidad : '') : '—';
      const vT1   = k.valor_t1  != null ? k.valor_t1.toLocaleString('es-CL',  { maximumFractionDigits: 0 }) + (cfg.unidad && cfg.unidad !== 'n' ? ' ' + cfg.unidad : '') : '—';
      return `<tr style="background:${i%2?'#f9fafe':'#fff'}">
        ${td(cfg.nombre || 'Métrica')}
        ${td(vReal, 'right', '', true)}
        ${T1H ? td(vT1, 'right', MUT) : ''}
      </tr>`;
    }).join('') : '';

    const kpiTabla = [
      ['Margen EBITDA',               margenEbitdaPct!=null?fmtPctD(margenEbitdaPct):'—',    T1H&&margenEbitdaT1Pct!=null?fmtPctD(margenEbitdaT1Pct):'—'],
      ['Cumplimiento EBITDA vs ppto', cumplEbitdaFmt,                                         '—'],
      ['EBITDA de la temporada',      fmtM(rEbitda),                                          T1H?fmtM(t1Ebitda):'—'],
      ['Resultado del ejercicio',     fmtM(rRes),                                             T1H?fmtM(t1Res):'—'],
      ['Liquidez corriente',          liquidez!=null?fmtRatio(liquidez):'—',                  '—'],
      ['Capital de trabajo',          capTrabajo!=null?fmtM(capTrabajo):'—',                  '—'],
      ['Deuda financiera / Patrimonio', deudaPat,                                             '—'],
      ['Deuda financiera / EBITDA',   deudaEbitda,                                            deudaEbitdaT1],
    ].map((r, i) => `<tr style="background:${i%2?'#f9fafe':'#fff'}">
      ${td(r[0])}
      ${td(r[1], 'right', '', true)}
      ${T1H ? td(r[2]||'—', 'right', MUT) : ''}
    </tr>`).join('');

    // Notas n/a al pie de KPIs
    const kpiNotas = [];
    if (rEbitda < 0)  kpiNotas.push('n/a — Deuda financiera / EBITDA: no aplica porque el EBITDA de la temporada es negativo.');
    if (tPAT   < 0)  kpiNotas.push('n/a — Deuda financiera / Patrimonio: no aplica porque el patrimonio es negativo.');

    const kpisHTML = `
      ${secTit(3, `Indicadores (KPIs) — a nivel EBITDA — comparativo temporada ${tA}${T1H?' vs '+tA1:''}`)}
      <table style="width:60%;border-collapse:collapse">
        <thead><tr>
          ${th('Indicador','left','52%')}
          ${th(`Real ${tA}`,'right','18%')}
          ${T1H ? th(`Real ${tA1}`,'right','18%') : ''}
        </tr></thead>
        <tbody>
          ${kpisOpRows}
          ${kpiTabla}
        </tbody>
      </table>
      ${kpiNotas.length ? `<div style="margin-top:7px">${kpiNotas.map(n=>`<p style="font-size:7.5pt;color:${MUT};margin:2px 0">${n}</p>`).join('')}</div>` : ''}`;

    // ── 4. COMENTARIO EJECUTIVO ───────────────────────────────────────────────
    const justEjec = justif.find(j => j.tipo_estado === 'ejecutivo');
    const comentHTML = (justEjec?.texto || justEjec?.texto_original)
      ? `${secTit(4,'Comentario ejecutivo')}
         <p style="font-size:9pt;line-height:1.65;color:#222;margin:0">${justEjec.texto || justEjec.texto_original}</p>`
      : '';

    // ── HTML final ───────────────────────────────────────────────────────────
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>${nombre} — Cierre Temporada ${anio-1}-${anio}</title>
      <style>
        @page { size: letter portrait; margin: 18mm 16mm 20mm 16mm; }
        @media print { * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; } body { margin:0; } }
        body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 9pt; }
        * { box-sizing: border-box; }
        td, th { border-bottom: 0.5pt solid #e8edf5; }
        tr:last-child td { border-bottom: none; }
      </style>
    </head><body>
      <div style="border-bottom:2pt solid ${ACC};padding-bottom:8px;margin-bottom:4px">
        <div style="font-size:16pt;font-weight:900;color:${BLU};margin-bottom:3px">${nombre}</div>
        <div style="font-size:8.5pt;color:#555">Cierre Temporada ${anio-1}-${anio} &nbsp;◆&nbsp; Estados Financieros al ${NOMBRES_MES[mes]} de ${anio} &nbsp;◆&nbsp; Grupo Mediterra</div>
        ${negocio ? `<div style="font-size:8pt;color:#777;font-style:italic;margin-top:1px">${negocio}</div>` : ''}
      </div>
      ${erHTML}
      ${narrHTML}
      ${esfHTML}
      ${kpisHTML}
      ${comentHTML}
      <div style="margin-top:18px;padding-top:4px;border-top:0.5pt solid #ddd;font-size:7pt;color:#bbb;text-align:right">
        Generado: ${new Date().toLocaleString('es-CL')} &nbsp;·&nbsp; Grupo Mediterra — ANF
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

  // Gate de aprobación: grupos ER con variación material sin justificación
  // Calculado aquí para tener acceso a filialActual (piso_materialidad)
  const faltantesJust = useMemo(() => {
    if (!er.length) return [];
    const pisoFilial = filialActual?.piso_materialidad || 10;
    return gruposSinJustificacion(er, justif, pisoFilial);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [er, justif, filialActual?.piso_materialidad]);

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

      {/* ── Gestión de empresas (CFO only) ── */}
      {esCFO && (
        <PanelFilialesAdmin
          filiales={filiales}
          onRefresh={async () => {
            const f = await cargarFiliales();
            setFiliales(f);
          }}
        />
      )}

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

                {/* Alerta: justificaciones pendientes */}
                {esCFO && informe.estado !== 'aprobado' && faltantesJust.length > 0 && (
                  <div style={{
                    background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 6,
                    padding: '8px 12px', fontSize: 11, color: '#7a5800', marginBottom: 4,
                  }}>
                    <strong>Faltan justificaciones para aprobar</strong> — grupos con variación &ge; {filialActual?.piso_materialidad || 10}%:
                    <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                      {faltantesJust.map(f => (
                        <li key={f.grupo}>{f.grupo} ({f.varPct > 0 ? '+' : ''}{f.varPct.toFixed(1)}%)</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Workflow buttons */}
                {esCFO && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {informe.estado === 'borrador' && (
                      <Btn
                        onClick={aprobar}
                        color={faltantesJust.length ? C.muted : C.green}
                        small
                        disabled={faltantesJust.length > 0}
                      >
                        Aprobar
                      </Btn>
                    )}
                    {informe.estado === 'aprobado' && (
                      <Btn onClick={rechazar} color={C.red} small>Revertir</Btn>
                    )}
                    {informe.estado === 'rechazado' && (
                      <Btn
                        onClick={aprobar}
                        color={faltantesJust.length ? C.muted : C.green}
                        small
                        disabled={faltantesJust.length > 0}
                      >
                        Re-aprobar
                      </Btn>
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
