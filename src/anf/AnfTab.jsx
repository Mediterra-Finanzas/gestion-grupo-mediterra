/* eslint-disable */
// src/anf/AnfTab.jsx
// Sub-tab "Análisis Financiero" dentro del módulo EEFF.
// Flujo: seleccionar filial+período → subir Excel → revisar → aprobar → exportar.

import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx-js-style';
import { theme } from '../theme';
import { parsearInformeANF, buildSaldosEsf, buildMovimientosEr, calcTemporada } from './anfParser';
import { calcularKpisDerivaos, KPI_LABELS, KPI_TOOLTIPS } from './anfKpis';
import {
  cargarFiliales, cargarInformes, cargarInformeCompleto,
  crearInforme, actualizarEstadoInforme, actualizarTcInforme,
  guardarSaldosEsf, guardarMovimientosEr,
  importarNarrativas, guardarJustificacion,
  cargarMetricasConfig, guardarKpiOp,
  guardarKpisDerivaos,
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

// ── Sección ESF ──────────────────────────────────────────────────────────────

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
            const cuentas = filas.filter(s => s.categoria_ifrs?.startsWith(seccion.split(' ')[0]) ||
              s.categoria_ifrs === seccion ||
              (s.tipo_ifrs && seccion.toLowerCase().includes(s.tipo_ifrs.toLowerCase())));
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
                          color: c.var_pct != null && Math.abs(c.var_pct) >= piso ? C.red : C.text }}>
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

function TablaEr({ movimientos, mes, piso }) {
  const [expandido, setExpandido] = useState(true);
  const [vistaEr, setVistaEr] = useState('mes'); // 'mes' | 'ytd' | 'temporada'
  const [filtroMat, setFiltroMat] = useState(false);

  const GRUPOS_ER = [
    { key: 'Ingreso Operacional',    label: 'Ingresos Operacionales',  signo: 1 },
    { key: 'Costo Operacional',      label: 'Costos',                  signo: -1 },
    { key: 'Gasto Operacional',      label: 'Gastos Operacionales',    signo: -1 },
    { key: 'Ingreso No Operacional', label: 'Ingresos No Oper.',       signo: 1 },
    { key: 'Gasto No Operacional',   label: 'Gastos No Oper.',         signo: -1 },
    { key: 'Impuesto',               label: 'Impuesto a la Renta',     signo: -1 },
  ];

  function realField(g) {
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
            const cuentas = filas.filter(m => m.grupo_er === grupo.key);
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
                    </tr>
                  </thead>
                  <tbody>
                    {cuentas.map((c, i) => {
                      const real = c[rf] || 0;
                      const ppto = c[pf];
                      const varAbs = ppto != null ? real - ppto : null;
                      const vp = varPctEr(real, ppto);
                      return (
                        <tr key={c.codigo} style={{ background: i % 2 ? C.bg : `${C.card}80` }}>
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
                        </tr>
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

function SeccionKpis({ kpisDer, kpisOp, metricas }) {
  if (!kpisDer.length && !kpisOp.length) return null;
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {kpisDer.length > 0 && (
        <div style={{ flex: '1 1 300px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.text, marginBottom: 8 }}>KPIs Financieros</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {kpisDer.map(k => (
              <div key={k.clave} style={{ border: `1px solid ${C.border}`, borderRadius: 6,
                padding: '6px 10px', background: C.card }} title={KPI_TOOLTIPS[k.clave]}>
                <div style={{ fontSize: 9, color: C.muted, marginBottom: 2 }}>{KPI_LABELS[k.clave]}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>
                  {k.valor != null ? fmtNum(k.valor, k.unidad === '%' ? 1 : 2) : '—'}
                  <span style={{ fontSize: 9, color: C.muted, marginLeft: 2 }}>{k.unidad}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {kpisOp.length > 0 && (
        <div style={{ flex: '1 1 260px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.text, marginBottom: 8 }}>KPIs Operacionales</div>
          {kpisOp.map(k => (
            <div key={k.metrica_id} style={{ display: 'flex', justifyContent: 'space-between',
              padding: '4px 0', borderBottom: `1px solid ${C.border}44`, fontSize: 11 }}>
              <span style={{ color: C.muted }}>{k.anf_metricas_config?.nombre}</span>
              <span style={{ fontWeight: 700 }}>
                {fmtNum(k.valor_real)} <span style={{ fontSize: 9, color: C.muted }}>{k.anf_metricas_config?.unidad}</span>
              </span>
            </div>
          ))}
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
        const met = await cargarMetricasConfig(filialId);
        setMetricas(met);
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
      ...esf.map(c => [c.codigo, c.nombre, c.categoria_ifrs, c.saldo_neto, c.saldo_neto_t1, c.var_abs, c.var_pct]),
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
          {[['resumen', 'Resumen'], ['revisar', 'Revisar']].map(([v, l]) => (
            <button key={v} onClick={() => setVistaANF(v)}
              style={{ padding: '6px 14px', fontSize: 11, cursor: 'pointer',
                background: vistaANF === v ? C.blue : C.card,
                color: vistaANF === v ? '#fff' : C.muted, border: 'none', fontWeight: 700 }}>
              {l}
            </button>
          ))}
        </div>
      </div>

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
              </div>

              {/* KPIs */}
              {(kpisDer.length > 0 || kpisOp.length > 0) && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: C.text, marginBottom: 8 }}>KPIs</div>
                  <SeccionKpis kpisDer={kpisDer} kpisOp={kpisOp} metricas={metricas} />
                </div>
              )}

              {/* ESF */}
              {esf.length > 0 && (
                <TablaEsf saldos={esf} piso={filialActual?.piso_materialidad || 10} />
              )}

              {/* ER */}
              {er.length > 0 && (
                <TablaEr movimientos={er} mes={mes} piso={filialActual?.piso_materialidad || 10} />
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
