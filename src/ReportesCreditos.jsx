/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// Créditos → 📥 Reportes: consultar y descargar (Excel / PDF). oct-2026
// Pantalla, Excel y PDF salen de las MISMAS tablas (tablasReporte), así que los
// filtros y las cifras coinciden. Solo lee: no guarda nada.
// Permisos: recibe los créditos YA filtrados por las empresas autorizadas (Creditos →
// creditosVisibles) y además vuelve a pasar la lista de permitidas al modelo: una
// descarga nunca incluye una empresa que la pantalla no muestra.
// ═══════════════════════════════════════════════════════════════════
import React, { useMemo, useState } from 'react';
import { theme } from './theme';
import { construirReporte, tablasReporte, formatoCelda, ESTADOS_CREDITO, ESTADOS_CUOTA, TIPOS_PAGO, EMPRESAS_LINEA, EMPRESAS_JV } from './reporteCreditos.js';
import { libroExcel, documentoPDF, nombreArchivo, cargarExcelJS, cargarJsPDF, cargarLogo, descargarBlob } from './reporteCreditosExport.js';
import { hoyISO } from './creditos.js';

const C = theme;
const fmtHoy = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

function Chips({ titulo, nota, opciones, valor, onChange, testid }) {
  const sel = new Set(valor);
  const alternar = (k) => { const s = new Set(sel); s.has(k) ? s.delete(k) : s.add(k); onChange([...s]); };
  return (
    <div data-testid={testid} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>{titulo} {valor.length ? <span style={{ fontWeight: 400 }}>· {valor.length} elegido(s)</span> : <span style={{ fontWeight: 400 }}>· todos</span>}</div>
      {nota && <div style={{ fontSize: 10, color: C.muted }}>{nota}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {opciones.map(([k, lbl]) => (
          <button key={k} type="button" aria-pressed={sel.has(k)} onClick={() => alternar(k)}
            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${sel.has(k) ? C.primary : C.border}`,
              background: sel.has(k) ? C.primary : C.card, color: sel.has(k) ? '#fff' : C.text }}>{lbl}</button>
        ))}
        {valor.length > 0 && <button type="button" onClick={() => onChange([])} style={{ fontSize: 11, padding: '3px 8px', border: 'none', background: 'transparent', color: C.info, cursor: 'pointer', textDecoration: 'underline' }}>quitar</button>}
      </div>
    </div>
  );
}

function Tabla({ tabla, testid }) {
  const fondo = (t) => (t === 'total' ? '#e2e8f0' : t === 'seccion' ? C.accent2Bg : t === 'subtotal' ? '#f0f4f8' : 'transparent');
  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 8, background: C.card }}>
      <table data-testid={testid} style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
        <thead><tr>{tabla.columnas.map(c => <th key={c.k} style={{ position: 'sticky', top: 0, background: C.accent2, color: '#fff', padding: '6px 8px', textAlign: 'center', fontWeight: 700, whiteSpace: 'nowrap' }}>{c.t}</th>)}</tr></thead>
        <tbody>
          {!tabla.filas.length && <tr><td colSpan={tabla.columnas.length} style={{ padding: 12, fontStyle: 'italic', color: C.muted }}>Sin resultados para los filtros elegidos.</td></tr>}
          {tabla.filas.map((f, i) => (
            <tr key={i} data-tipo={f.tipo} style={{ background: fondo(f.tipo), fontWeight: f.tipo === 'dato' ? 400 : 700, borderTop: `1px solid ${C.border}` }}>
              {tabla.columnas.map(c => {
                const v = formatoCelda(f.celdas[c.k], c, f.moneda);
                return <td key={c.k} data-k={c.k} style={{ padding: '4px 8px', textAlign: ['monto', 'usd', 'entero'].includes(c.tipo) ? 'right' : 'left', whiteSpace: c.tipo === 'texto' ? 'normal' : 'nowrap',
                  color: v === 'sin TC' || v === 'SIN TC' ? C.danger : C.text }}>{v}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ReportesCreditos({ creditos = [], empresasPermitidas = null, tcData = null, tcEstado = '' }) {
  const [alcance, setAlcance] = useState('consolidado');
  const [empresa, setEmpresa] = useState('');
  const [corte, setCorte] = useState(hoyISO());
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [empresas, setEmpresas] = useState([]);
  const [acreedores, setAcreedores] = useState([]);
  const [estadosCredito, setEstadosCredito] = useState([]);
  const [estadosCuota, setEstadosCuota] = useState([]);
  const [tiposPago, setTiposPago] = useState([]);
  const [ver, setVer] = useState('resumen');
  const [estado, setEstado] = useState('');

  const empresasDisponibles = useMemo(() => {
    const presentes = new Set(creditos.map(c => c && c.empresa).filter(Boolean));
    return [...EMPRESAS_LINEA, ...EMPRESAS_JV, ...[...presentes].filter(e => !EMPRESAS_LINEA.includes(e) && !EMPRESAS_JV.includes(e)).sort()].filter(e => presentes.has(e));
  }, [creditos]);
  const empresaSel = alcance === 'empresa' ? (empresasDisponibles.includes(empresa) ? empresa : empresasDisponibles[0] || '') : '';
  const acreedoresDisponibles = useMemo(() => [...new Set(creditos.filter(c => c && (!empresaSel || c.empresa === empresaSel) && (alcance === 'empresa' || !empresas.length || empresas.includes(c.empresa))).map(c => c.acreedor).filter(Boolean))].sort(), [creditos, empresaSel, empresas, alcance]);

  const filtros = useMemo(() => ({
    empresas: alcance === 'empresa' ? (empresaSel ? [empresaSel] : ['—']) : empresas,
    acreedores: acreedores.filter(a => acreedoresDisponibles.includes(a)), estadosCredito, estadosCuota, tiposPago, desde, hasta,
  }), [alcance, empresaSel, empresas, acreedores, acreedoresDisponibles, estadosCredito, estadosCuota, tiposPago, desde, hasta]);
  const rep = useMemo(() => construirReporte(creditos, filtros, { corte, tcData, empresasPermitidas }), [creditos, filtros, corte, tcData, empresasPermitidas]);
  const T = useMemo(() => tablasReporte(rep, { alcance, empresa: empresaSel }), [rep, alcance, empresaSel]);
  const bloqueado = rep.errores.length > 0;

  async function descargar(tipo) {
    if (bloqueado) return;
    setEstado(`Generando ${tipo === 'xlsx' ? 'Excel' : 'PDF'}…`);
    try {
      const logo = await cargarLogo(T.logo).catch(() => null);
      const generado = fmtHoy();
      if (tipo === 'xlsx') {
        const ExcelJS = await cargarExcelJS();
        const buf = await libroExcel(T, { ExcelJS, logo, generado }).xlsx.writeBuffer();
        descargarBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nombreArchivo(T, corte, 'xlsx'));
      } else {
        const JsPDF = await cargarJsPDF();
        descargarBlob(documentoPDF(T, { JsPDF, logo, generado }).output('blob'), nombreArchivo(T, corte, 'pdf'));
      }
      setEstado(logo ? 'Descarga lista.' : 'Descarga lista, pero sin logo: no se pudo leer la imagen.');
    } catch (e) {
      setEstado(`No se pudo generar el archivo: ${e.message}. No se descargó nada.`);
    }
  }

  const campo = { fontSize: 12, padding: '5px 8px', border: `1px solid ${C.border}`, borderRadius: 6, background: C.card, color: C.text };
  const lbl = { fontSize: 11, fontWeight: 700, color: C.muted, display: 'flex', flexDirection: 'column', gap: 3 };
  const tablas = { resumen: T.resumen, creditos: T.creditos, cuotas: T.cuotas, pagos: T.pagos };
  return (
    <div data-testid="creditos-reportes" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <label style={lbl}>Reporte
            <select data-testid="rep-alcance" value={alcance} onChange={e => setAlcance(e.target.value)} style={campo}>
              <option value="consolidado">Consolidado (6 sociedades; JV aparte)</option>
              <option value="empresa">Por empresa</option>
            </select>
          </label>
          {alcance === 'empresa' && <label style={lbl}>Empresa
            <select data-testid="rep-empresa" value={empresaSel} onChange={e => setEmpresa(e.target.value)} style={campo}>
              {empresasDisponibles.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </label>}
          <label style={lbl}>Fecha de corte del saldo
            <input data-testid="rep-corte" type="date" value={corte} onChange={e => setCorte(e.target.value)} style={campo}/>
          </label>
          <label style={lbl}>Detalle desde
            <input data-testid="rep-desde" type="date" value={desde} onChange={e => setDesde(e.target.value)} style={campo}/>
          </label>
          <label style={lbl}>hasta
            <input data-testid="rep-hasta" type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={campo}/>
          </label>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button data-testid="rep-excel" type="button" disabled={bloqueado} onClick={() => descargar('xlsx')} className="mdt-btn"
              style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: bloqueado ? C.muted2 : C.success, color: '#fff', fontWeight: 700, fontSize: 12, cursor: bloqueado ? 'not-allowed' : 'pointer' }}>Descargar Excel</button>
            <button data-testid="rep-pdf" type="button" disabled={bloqueado} onClick={() => descargar('pdf')} className="mdt-btn"
              style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: bloqueado ? C.muted2 : C.primary, color: '#fff', fontWeight: 700, fontSize: 12, cursor: bloqueado ? 'not-allowed' : 'pointer' }}>Descargar PDF</button>
          </div>
        </div>
        <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
          <b>Dos fechas distintas.</b> La <b>fecha de corte</b> fija el saldo de deuda (cuentan los pagos con fecha efectiva hasta ese día; una cuota está vencida si vence antes) y el tipo de cambio.
          El <b>rango del detalle</b> solo elige qué cuotas (por <b>fecha de vencimiento</b>) y qué pagos (por <b>fecha efectiva</b>) se listan; no cambia el saldo.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {alcance === 'consolidado' && <Chips testid="rep-f-empresas" titulo="Empresa (deudora)" nota="En el modelo la empresa del crédito ES el deudor: no hay un campo «deudor» aparte, así que hay un solo filtro."
            opciones={empresasDisponibles.map(e => [e, e])} valor={empresas} onChange={setEmpresas}/>}
          <Chips testid="rep-f-acreedores" titulo="Acreedor" opciones={acreedoresDisponibles.map(a => [a, a])} valor={acreedores.filter(a => acreedoresDisponibles.includes(a))} onChange={setAcreedores}/>
          <Chips testid="rep-f-estado-credito" titulo="Estado del crédito (al corte)" nota="Sin elegir: todos salvo anulados." opciones={Object.entries(ESTADOS_CREDITO)} valor={estadosCredito} onChange={setEstadosCredito}/>
          <Chips testid="rep-f-estado-cuota" titulo="Estado de la cuota (al corte)" opciones={Object.entries(ESTADOS_CUOTA)} valor={estadosCuota} onChange={setEstadosCuota}/>
          <Chips testid="rep-f-tipo-pago" titulo="Tipo de pago" opciones={Object.entries(TIPOS_PAGO)} valor={tiposPago} onChange={setTiposPago}/>
        </div>
      </div>

      {rep.errores.length > 0 && <div data-testid="rep-errores" role="alert" style={{ fontSize: 12, background: C.dangerBg, border: `1px solid ${C.danger}66`, borderRadius: 8, padding: '8px 12px', color: C.danger }}>
        {rep.errores.join(' ')} Corrige las fechas: no se muestra ni se descarga nada con un rango inválido.</div>}
      {estado && <div data-testid="rep-estado" role="status" style={{ fontSize: 12, color: /No se pudo|sin logo/.test(estado) ? C.danger : C.muted }}>{estado}</div>}
      {(tcEstado === 'error' || tcEstado === 'vacio') && <div style={{ fontSize: 11, background: C.warningBg, borderRadius: 8, padding: '6px 12px' }}>⚠ {tcEstado === 'error' ? 'No se pudo leer' : 'Está vacío'} el histórico de tipo de cambio de Maestros: los créditos en otra moneda usan su TC declarado (hipótesis) o quedan sin convertir.</div>}

      <div data-testid="rep-encabezado" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, fontSize: 11, lineHeight: 1.6 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.accent2, marginBottom: 4 }}>{T.titulo}</div>
        {T.encabezado.map(([k, v]) => <div key={k}><b>{k}:</b> {v}</div>)}
        {T.tcUsados.length > 0 && <div><b>Tipos de cambio usados:</b> {T.tcUsados.map(x => `${x.moneda} ${x.tc} por US$ (${x.fecha}, ${x.fuente})`).join(' · ')}</div>}
        {T.avisos.map((a, i) => <div key={i} style={{ color: '#9a3412' }}>⚠ {a}</div>)}
        <div style={{ marginTop: 4, color: C.muted }}>{rep.resumen.conteos.creditos} créditos · {rep.resumen.conteos.cuotas} cuotas · {rep.resumen.conteos.pagos} pagos</div>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {[['resumen', 'Resumen'], ['creditos', 'Créditos'], ['cuotas', 'Cuotas'], ['pagos', 'Pagos registrados']].map(([k, l]) => (
          <button key={k} type="button" data-testid={`rep-ver-${k}`} onClick={() => setVer(k)} className={`mdt-tab${ver === k ? ' mdt-tab--active' : ''}`}
            style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${ver === k ? C.primary : C.border}`, background: ver === k ? C.primary : 'transparent', color: ver === k ? '#fff' : C.muted, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{l}</button>
        ))}
      </div>
      <Tabla tabla={tablas[ver]} testid={`rep-tabla-${ver}`}/>
    </div>
  );
}
