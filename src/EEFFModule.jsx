/* eslint-disable */
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  parsearBalance, detectarFormatoBalance, fmtMonto, NOMBRES_MES,
  parsearPlanMaestro, clasificarCuentas,
  dbLoadPlanMaestro, dbSavePlanMaestro,
  guardarEEFF, cargarEEFF, eeffId,
  parsearMayor, dbSaveMayor, dbLoadMayor,
  guardarComposicionCuenta, saldoEfectivo,
  normalizeRut, extraerRutGlosaMega, extraerTercerosDelMayor,
  parseTercerosMegasystem, parseTercerosContec,
  mergeTerceros, dbSaveTercerosMaestro, dbLoadTercerosMaestro, dbSaveCategoriasAuxiliar,
  exportarAuxiliarXLSX, exportarEEFFXLSX,
  pptoid, guardarPpto, cargarPpto,
  cargarResumenEstados, consolidarCuentas,
} from './eeffHelpers.js';
import { theme } from './theme';
import AnfTab from './anf/AnfTab';

const EMPRESAS = [
  'Mediterra','Allegria Foods','Allegria Service',
  'Frisku Foods','Integrity Farms','Osiris','Allpa Farms','Allpa Farms Perú'
];
const MESES = [1,2,3,4,5,6,7,8,9,10,11,12];

// Paleta EEFF — re-exporta tokens del tema central + alias para
// preservar nombres usados localmente. Cambios de paleta en src/theme.js.
const C = {
  ...theme,
  card2:   theme.cardAlt,
  accent:  theme.info,       // era cian claro, ahora info navy
  accentL: theme.accent,     // dorado para destaque secundario
  green:   theme.success,
  red:     theme.danger,
  yellow:  theme.warning,
  blue:    theme.primary,
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

// ── Auxiliares contables: categorías que tienen desglose por tercero ──
const CATEGORIAS_AUXILIAR_DEFAULT = [
  'CxC Comerciales y Otras',
  'CxC a Productores',
  'CxP Comerciales y Otras',
  'CxP a Productores',
];

// Todas las categorías del plan que podrían tener auxiliar (CxC o CxP)
const CATS_POTENCIAL_AUXILIAR = Object.keys({
  'CxC Comerciales y Otras':1, 'CxC a Productores':1, 'CxC Entidades Relacionadas':1,
  'Otras CxC':1, 'CxC Comerciales No Corrientes':1, 'CxC Entidades Relacionadas No Corrientes':1,
  'CxP Comerciales y Otras':1, 'CxP a Productores':1, 'CxP Entidades Relacionadas':1,
  'CxP Comerciales No Corrientes':1, 'CxP Entidades Relacionadas No Corrientes':1,
});

const TERCEROS_POR_PAG = 20;

// ── Consolidado: empresas línea a línea + factores NCI ───────────────
const EMPRESAS_LINEAALINEA = ['Mediterra','Allegria Foods','Allegria Service','Frisku Foods','Integrity Farms','Osiris'];
const FACTORES_CONSOLIDADO = {
  'Mediterra':1,'Allegria Foods':1,'Allegria Service':0.8,'Frisku Foods':0.9,'Integrity Farms':1,'Osiris':1,
};

// ── Helpers ──────────────────────────────────────────────────────────
function valorSit(c) {
  const ia = c.inventarioActivo  || 0;
  const ip = c.inventarioPasivo  || 0;
  if (c.tipoIFRS === 'Activo')     return ia - ip; // neto: activo − contra-activo
  if (c.tipoIFRS === 'Pasivo')     return ip - ia; // neto: pasivo − saldo deudor anormal
  if (c.tipoIFRS === 'Patrimonio') return ip - ia; // neto: patrimonio − saldo deudor (pérdidas, dividendos)
  return 0;
}
function valorERCuenta(c, signo) {
  const rg = c.resultadoGanancia || 0;
  const rp = c.resultadoPerdida  || 0;
  if (signo ===  1) return rg - rp; // ingreso: neto (RG − RP)
  if (signo === -1) return rp - rg; // egreso:  neto (RP − RG, positivo = egreso)
  return rg - rp;
}
function fmt(v) { return fmtMonto(Math.abs(v), 0); }
function fmtSig(v) {
  if (Math.abs(v) < 0.01) return '—';
  return (v < 0 ? '(' : '') + fmtMonto(Math.abs(v), 0) + (v < 0 ? ')' : '');
}

// Construye mapa {grupo: [cuentas]} desde un array de cuentas clasificadas.
// Excluye sinClasificar (se manejan por separado).
function buildCpg(cuentas) {
  if (!cuentas) return {};
  const m = {};
  for (const c of cuentas) {
    if (c.grupo === 'sinClasificar') continue;
    const g = c.categoriaIFRS ? (CAT_GRUPO[c.categoriaIFRS] || 'Sin Grupo') : 'Sin Grupo';
    if (!m[g]) m[g] = [];
    m[g].push(c);
  }
  return m;
}

// Calcula todos los totales del ER a partir de un cpg.
function calcER(cpg) {
  const _sumER = (grupoER) => {
    const bloque = ER_BLOQUES.find(b => b.grupo === grupoER);
    if (!bloque) return 0;
    return (cpg[grupoER] || []).reduce((s, c) => s + valorERCuenta(c, bloque.signo), 0);
  };
  const ingOp    = _sumER('Ingreso Operacional');
  const costoOp  = _sumER('Costo Operacional');
  const resB     = ingOp - costoOp;
  const gastoOp  = _sumER('Gasto Operacional');
  const resOp    = resB - gastoOp;
  const ingNOp   = _sumER('Ingreso No Operacional');
  const gastNOp  = _sumER('Gasto No Operacional');
  const noOp     = _sumER('No Operacional');
  const resAntes = resOp + ingNOp - gastNOp + noOp;
  const impuesto = _sumER('Impuesto');
  const resEjec  = resAntes - impuesto;
  return { ingOp, costoOp, resB, gastoOp, resOp, ingNOp, gastNOp, noOp, resAntes, impuesto, resEjec };
}

// Normaliza códigos de cuenta para comparar entre EEFF y mayor:
// strip puntos + trim. Contec "1.01.01.001" → "101010001";
// Megasystem "1101003" → "1101003". Ambos lados normalizan igual.
function normalizeCodigo(code) {
  return String(code || '').trim().replace(/\./g, '');
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

function SeccionESF({ sec, cuentas, expandedSecs, onToggleSec, expandedCats, onToggleCat, onCuentaClick, selectedCodigo }) {
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
        style={{ background:C.bg2, cursor:'pointer', borderTop:`1px solid ${C.border}` }}>
        <td style={{ padding:'8px 12px', fontSize:12, fontWeight:800, color:C.primary }}>
          <span style={{ marginRight:6, fontSize:10, color:C.muted }}>{isOpen ? '▼' : '▶'}</span>
          {sec.label}
        </td>
        <td style={{ padding:'8px 14px', textAlign:'right', fontSize:12,
          fontWeight:800, color:C.primary, whiteSpace:'nowrap' }}>
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
              style={{ background:C.cardAlt, cursor:'pointer',
                borderTop:`1px solid ${C.border}22` }}>
              <td style={{ padding:'5px 12px', paddingLeft:32,
                fontSize:11, fontWeight:600, color:C.muted }}>
                <span style={{ marginRight:6, fontSize:9, color:C.muted}}>{catOpen ? '▼' : '▶'}</span>
                {cat}
              </td>
              <td style={{ padding:'5px 14px', textAlign:'right',
                fontSize:11, fontWeight:600, color:C.muted, whiteSpace:'nowrap' }}>
                {catOpen ? '' : fmt(catTotal)}
              </td>
            </tr>
            {catOpen && ccs.map((c, i) => {
              const isSelected = selectedCodigo && normalizeCodigo(selectedCodigo) === normalizeCodigo(c.codigo);
              return (
                <tr key={c.codigo + i}
                  onClick={() => onCuentaClick && onCuentaClick(c)}
                  style={{ background: isSelected ? `${C.accent}22` : i%2===0?C.card:C.rowAlt,
                    borderTop:`1px solid ${C.border}11`,
                    cursor: onCuentaClick ? 'pointer' : 'default',
                    outline: isSelected ? `1px solid ${C.accent}55` : 'none' }}>
                  <td style={{ padding:'3px 12px', paddingLeft:52, fontSize:10, color:C.muted}}>
                    <span style={{ color: isSelected ? C.accent : C.muted2, marginRight:6,
                      fontFamily:'monospace', fontSize:9 }}>{c.codigo}</span>
                    {c.nombre || c.nombreOficial}
                  </td>
                  <td style={{ padding:'3px 14px', textAlign:'right',
                    fontSize:10, color: valorSit(c) !== 0 ? C.text : C.muted2, whiteSpace:'nowrap' }}>
                    {valorSit(c) !== 0 ? fmt(valorSit(c)) : '—'}
                  </td>
                </tr>
              );
            })}
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

function BloqueER({ bloque, cuentas, expandedSecs, onToggleSec, expandedCats, onToggleCat, onCuentaClick, selectedCodigo }) {
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
                <span style={{ marginRight:6, fontSize:9, color:C.muted}}>{catOpen ? '▼' : '▶'}</span>
                {cat}
              </td>
              <td style={{ padding:'5px 14px', textAlign:'right',
                fontSize:11, fontWeight:600, color:C.muted, whiteSpace:'nowrap' }}>
                {catOpen ? '' : fmt(catTotal)}
              </td>
            </tr>
            {catOpen && ccs.map((c, i) => {
              const v = valorERCuenta(c, bloque.signo);
              const isSelected = selectedCodigo && normalizeCodigo(selectedCodigo) === normalizeCodigo(c.codigo);
              return (
                <tr key={c.codigo + i}
                  onClick={() => onCuentaClick && onCuentaClick(c)}
                  style={{ background: isSelected ? `${C.accent}22` : i%2===0?C.card:C.rowAlt,
                    borderTop:`1px solid ${C.border}11`,
                    cursor: onCuentaClick ? 'pointer' : 'default',
                    outline: isSelected ? `1px solid ${C.accent}55` : 'none' }}>
                  <td style={{ padding:'3px 12px', paddingLeft:52, fontSize:10, color:C.muted}}>
                    <span style={{ color: isSelected ? C.accent : C.muted2, marginRight:6,
                      fontFamily:'monospace', fontSize:9 }}>{c.codigo}</span>
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

// ── Comparativo ER: tabla Real | Ppto | Var% | Año Ant | Var% ────────
function TablaComparativoER({ erReal, cpgReal, cpgPpto, cpgAnt, mes, anio }) {
  const hasPpto = cpgPpto && Object.values(cpgPpto).some(v => v.length > 0);
  const hasAnt  = cpgAnt  && Object.values(cpgAnt).some(v => v.length > 0);
  if (!hasPpto && !hasAnt) return null;

  const erPpto = hasPpto ? calcER(cpgPpto) : null;
  const erAnt  = hasAnt  ? calcER(cpgAnt)  : null;

  const pctVar = (real, ref) => (ref && ref !== 0) ? ((real - ref) / Math.abs(ref)) * 100 : null;
  const fmtPct = (v) => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

  const LINEAS = [
    { label:'Ingresos Oper.',      key:'ingOp',    bold:false },
    { label:'Costos',              key:'costoOp',  bold:false },
    { label:'Resultado Bruto',     key:'resB',     bold:true  },
    { label:'Gastos Oper.',        key:'gastoOp',  bold:false },
    { label:'Res. Operacional',    key:'resOp',    bold:true  },
    { label:'Ing. No Oper.',       key:'ingNOp',   bold:false },
    { label:'Gto. No Oper.',       key:'gastNOp',  bold:false },
    { label:'Res. antes Imp.',     key:'resAntes', bold:true  },
    { label:'Impuesto',            key:'impuesto', bold:false },
    { label:'RESULTADO EJERCICIO', key:'resEjec',  bold:true, divider:true },
  ];

  return (
    <div style={{ marginTop:24, marginBottom:24 }}>
      <div style={{ fontSize:12, fontWeight:800, color:C.primary, marginBottom:8,
        paddingBottom:4, borderBottom:`1px solid ${C.border}` }}>
        Análisis Comparativo — Estado de Resultados · {NOMBRES_MES[mes]} {anio}
        <span style={{ fontSize:10, fontWeight:400, color:C.muted, marginLeft:10 }}>
          {hasPpto && 'Ppto '}{hasAnt && `vs ${anio - 1}`}
        </span>
      </div>
      <div style={{ overflowX:'auto', borderRadius:8, border:`1px solid ${C.border}`, background:C.card }}>
        <table style={{ borderCollapse:'collapse', width:'100%', fontSize:11 }}>
          <thead>
            <tr style={{ background:C.primary }}>
              <th style={{ padding:'6px 12px', textAlign:'left', color:C.primaryText, fontSize:10, minWidth:160 }}>Línea</th>
              <th style={{ padding:'6px 10px', textAlign:'right', color:C.primaryText, fontSize:10, whiteSpace:'nowrap' }}>
                Real YTD
              </th>
              {hasPpto && <>
                <th style={{ padding:'6px 10px', textAlign:'right', color:`${C.primaryText}bb`, fontSize:10, whiteSpace:'nowrap' }}>Ppto</th>
                <th style={{ padding:'6px 10px', textAlign:'right', color:C.yellow, fontSize:10 }}>Var%</th>
              </>}
              {hasAnt && <>
                <th style={{ padding:'6px 10px', textAlign:'right', color:`${C.primaryText}bb`, fontSize:10, whiteSpace:'nowrap' }}>{anio-1}</th>
                <th style={{ padding:'6px 10px', textAlign:'right', color:C.purple, fontSize:10 }}>Var%</th>
              </>}
            </tr>
          </thead>
          <tbody>
            {LINEAS.map(({ label, key, bold, divider }) => {
              const vR = erReal?.[key] ?? 0;
              const vP = erPpto?.[key] ?? null;
              const vA = erAnt?.[key]  ?? null;
              const bg = bold ? `${C.accent}10` : 'transparent';
              const colR = vR >= 0.005 ? C.text : vR < -0.005 ? C.red : C.muted2;
              const pctP = hasPpto ? pctVar(vR, vP) : null;
              const pctA = hasAnt  ? pctVar(vR, vA) : null;
              return (
                <tr key={key} style={{ background:bg,
                  borderTop: divider ? `2px solid ${C.accent}44` : `1px solid ${C.border}22` }}>
                  <td style={{ padding:'5px 12px', fontWeight: bold?700:400,
                    fontSize: bold?12:11, color: bold?C.text:C.muted }}>
                    {label}
                  </td>
                  <td style={{ padding:'5px 10px', textAlign:'right', fontWeight:bold?700:400, color:colR }}>
                    {fmtSig(vR)}
                  </td>
                  {hasPpto && <>
                    <td style={{ padding:'5px 10px', textAlign:'right', color:C.muted, fontSize:10 }}>
                      {vP != null ? fmtSig(vP) : '—'}
                    </td>
                    <td style={{ padding:'5px 10px', textAlign:'right', fontSize:10,
                      color: pctP == null ? C.muted2 : pctP >= 0 ? C.green : C.red }}>
                      {fmtPct(pctP)}
                    </td>
                  </>}
                  {hasAnt && <>
                    <td style={{ padding:'5px 10px', textAlign:'right', color:C.muted, fontSize:10 }}>
                      {vA != null ? fmtSig(vA) : '—'}
                    </td>
                    <td style={{ padding:'5px 10px', textAlign:'right', fontSize:10,
                      color: pctA == null ? C.muted2 : pctA >= 0 ? C.green : C.red }}>
                      {fmtPct(pctA)}
                    </td>
                  </>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Comparativo ESF: sección totales Real | Ppto | Dif | Año Ant | Dif ──
function TablaComparativoESF({ cpgReal, cpgPpto, cpgAnt, totalA: tA, totalP: tP, totalPP: tPP, erYtd, mes, anio }) {
  const hasPpto = cpgPpto && Object.values(cpgPpto).some(v => v.length > 0);
  const hasAnt  = cpgAnt  && Object.values(cpgAnt).some(v => v.length > 0);
  if (!hasPpto && !hasAnt) return null;

  const sumGrupo = (cpg, grupo) => (cpg[grupo] || []).reduce((s, c) => {
    const ia = c.inventarioActivo||0, ip = c.inventarioPasivo||0;
    return s + (c.tipoIFRS==='Activo' ? ia-ip : ip-ia);
  }, 0);
  const erPptoVals = hasPpto ? calcER(cpgPpto) : null;
  const erAntVals  = hasAnt  ? calcER(cpgAnt)  : null;

  const GRUPOS = [
    { label:'Activo Corriente',   grupo:'Activo Corriente',    seccion:'activo' },
    { label:'Activo No Corriente',grupo:'Activo No Corriente', seccion:'activo' },
    { label:'TOTAL ACTIVO',       key:'totalA', bold:true },
    { label:'Pasivo Corriente',   grupo:'Pasivo Corriente',    seccion:'pasivo' },
    { label:'Pasivo No Corriente',grupo:'Pasivo No Corriente', seccion:'pasivo' },
    { label:'Patrimonio',         grupo:'Patrimonio',          seccion:'pat'    },
    { label:'TOTAL PAS+PAT',      key:'totalPP', bold:true },
  ];

  const calcTotalA  = (cpg) => sumGrupo(cpg,'Activo Corriente') + sumGrupo(cpg,'Activo No Corriente');
  const calcTotalPP = (cpg, er) => sumGrupo(cpg,'Pasivo Corriente') + sumGrupo(cpg,'Pasivo No Corriente')
    + sumGrupo(cpg,'Patrimonio') + (er?.resEjec || 0);

  const fmtDif = (real, ref) => {
    if (ref == null) return '—';
    const d = real - ref;
    return (d >= 0 ? '+' : '') + fmtMonto(d, 0);
  };
  const difColor = (real, ref) => {
    if (ref == null) return C.muted2;
    const d = real - ref;
    return d >= 0 ? C.green : C.red;
  };

  return (
    <div style={{ marginTop:12, marginBottom:24 }}>
      <div style={{ fontSize:12, fontWeight:800, color:C.primary, marginBottom:8,
        paddingBottom:4, borderBottom:`1px solid ${C.border}` }}>
        Análisis Comparativo — Estado de Situación Financiera · {NOMBRES_MES[mes]} {anio}
      </div>
      <div style={{ overflowX:'auto', borderRadius:8, border:`1px solid ${C.border}`, background:C.card }}>
        <table style={{ borderCollapse:'collapse', width:'100%', fontSize:11 }}>
          <thead>
            <tr style={{ background:C.primary }}>
              <th style={{ padding:'6px 12px', textAlign:'left', color:C.primaryText, fontSize:10, minWidth:180 }}>Sección</th>
              <th style={{ padding:'6px 10px', textAlign:'right', color:C.primaryText, fontSize:10 }}>Real YTD</th>
              {hasPpto && <>
                <th style={{ padding:'6px 10px', textAlign:'right', color:`${C.primaryText}bb`, fontSize:10 }}>Ppto</th>
                <th style={{ padding:'6px 10px', textAlign:'right', color:C.yellow, fontSize:10 }}>Dif</th>
              </>}
              {hasAnt && <>
                <th style={{ padding:'6px 10px', textAlign:'right', color:`${C.primaryText}bb`, fontSize:10 }}>{anio-1}</th>
                <th style={{ padding:'6px 10px', textAlign:'right', color:C.purple, fontSize:10 }}>Dif</th>
              </>}
            </tr>
          </thead>
          <tbody>
            {GRUPOS.map(({ label, grupo, key, bold }) => {
              let vR, vP = null, vA = null;
              if (key === 'totalA') {
                vR = tA;
                if (hasPpto) vP = calcTotalA(cpgPpto);
                if (hasAnt)  vA = calcTotalA(cpgAnt);
              } else if (key === 'totalPP') {
                vR = tPP;
                if (hasPpto) vP = calcTotalPP(cpgPpto, erPptoVals);
                if (hasAnt)  vA = calcTotalPP(cpgAnt, erAntVals);
              } else {
                vR = sumGrupo(cpgReal, grupo);
                if (hasPpto) vP = sumGrupo(cpgPpto, grupo);
                if (hasAnt)  vA = sumGrupo(cpgAnt, grupo);
              }
              return (
                <tr key={label} style={{
                  background: bold ? `${C.accent}10` : 'transparent',
                  borderTop: bold ? `2px solid ${C.accent}44` : `1px solid ${C.border}22`,
                }}>
                  <td style={{ padding:'5px 12px', fontWeight:bold?700:400, color:bold?C.text:C.muted }}>
                    {label}
                  </td>
                  <td style={{ padding:'5px 10px', textAlign:'right', fontWeight:bold?700:400,
                    color: vR >= 0 ? C.text : C.red }}>
                    {fmtSig(vR)}
                  </td>
                  {hasPpto && <>
                    <td style={{ padding:'5px 10px', textAlign:'right', color:C.muted, fontSize:10 }}>
                      {vP != null ? fmtSig(vP) : '—'}
                    </td>
                    <td style={{ padding:'5px 10px', textAlign:'right', fontSize:10, color:difColor(vR,vP) }}>
                      {fmtDif(vR, vP)}
                    </td>
                  </>}
                  {hasAnt && <>
                    <td style={{ padding:'5px 10px', textAlign:'right', color:C.muted, fontSize:10 }}>
                      {vA != null ? fmtSig(vA) : '—'}
                    </td>
                    <td style={{ padding:'5px 10px', textAlign:'right', fontSize:10, color:difColor(vR,vA) }}>
                      {fmtDif(vR, vA)}
                    </td>
                  </>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────
export default function EEFFModule({ canEdit, usuarioActual, empresasPermitidas }) {
  const isAdmin = usuarioActual?.rol === 'admin';

  // Empresas visibles para este usuario.
  // empresasPermitidas viene de FinanzasModule (getEmpresasPermitidasUsuario).
  // Vacío/undefined = acceso a todas (admin, CFO, retrocompat).
  const empresasVisibles = useMemo(() => {
    if (!empresasPermitidas || empresasPermitidas.length === 0) return EMPRESAS;
    return EMPRESAS.filter(e => empresasPermitidas.includes(e));
  }, [empresasPermitidas]);

  // ── Selectores ──────────────────────────────────────────────────
  // Empresa inicial: Allegria Foods si está permitida, si no la primera autorizada.
  const [empresa, setEmpresa] = useState(() => {
    if (!empresasPermitidas?.length) return 'Allegria Foods';
    if (empresasPermitidas.includes('Allegria Foods')) return 'Allegria Foods';
    return empresasPermitidas.find(e => EMPRESAS.includes(e)) || EMPRESAS[0];
  });
  const [mes,     setMes]     = useState(new Date().getMonth() + 1);
  const [anio,    setAnio]    = useState(new Date().getFullYear());
  const [modo,    setModo]    = useState('mes'); // 'mes' | 'ytd'

  // ── Datos EEFF desde Supabase ────────────────────────────────────
  const [eeffData,     setEeffData]     = useState(null);
  const [loadingData,  setLoadingData]  = useState(false);
  const [sinDatos,     setSinDatos]     = useState(false);

  // ── Cargar balance (flujo upload) ────────────────────────────────
  const [showUpload,    setShowUpload]    = useState(false);
  const [uploading,     setUploading]     = useState(false);
  const [uploadError,   setUploadError]   = useState(null);
  const [uploadFileMes, setUploadFileMes] = useState(null);
  const [uploadFileYtd, setUploadFileYtd] = useState(null);
  const fileRefMes = useRef();
  const fileRefYtd = useRef();

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

  // ── Drawer análisis de cuenta (Parte 4) ─────────────────────────
  const [cuentaSeleccionada,    setCuentaSeleccionada]    = useState(null);
  const [drawerTab,             setDrawerTab]             = useState('movimientos');
  const [mayorDrawer,           setMayorDrawer]           = useState(undefined); // undefined=sin intentar, null=no existe, obj=cargado
  const [mayorDrawerCargando,   setMayorDrawerCargando]   = useState(false);
  const [drawerAnalisisItems,   setDrawerAnalisisItems]   = useState([]);
  const [drawerAnalisisGuard,   setDrawerAnalisisGuard]   = useState(false);
  const [drawerAnalisisOk,      setDrawerAnalisisOk]      = useState(false);
  const [drawerAnalisisError,   setDrawerAnalisisError]   = useState(null);
  const mayorDrawerUploadRef = useRef();

  // ── Maestro de Terceros (Parte 1) ─────────────────────────────────
  const [tercerosMaestro,   setTercerosMaestro]   = useState(null);   // {[rutNorm]:{nombre,activo,fuente}}
  const [tercerosCargando,  setTercerosCargando]  = useState(false);
  const [tercerosMergeInfo, setTercerosMergeInfo] = useState(null);   // {nuevos, actualizados}
  const [tercerosBusqueda,  setTercerosBusqueda]  = useState('');
  const [tercerosPagina,    setTercerosPagina]    = useState(0);
  const [terceroEditando,   setTerceroEditando]   = useState(null);   // {rut, nombre}
  const [adminPanelOpen,    setAdminPanelOpen]    = useState(false);
  const tercerosMegaRef = useRef();
  const tercerosCteRef  = useRef();
  // ── Auxiliar: filas expandidas por RUT en el drawer ──────────────
  const [auxExpandedRuts,   setAuxExpandedRuts]   = useState(new Set());
  const [auxNombreEdit,     setAuxNombreEdit]      = useState(null);   // {rut, nombre} inline en tab auxiliar
  const [terceroExtrayendo, setTerceroExtrayendo]  = useState(false);
  // ── Categorías Auxiliar (Parte 2) ─────────────────────────────────
  const [categoriasAuxiliar, setCategoriasAuxiliar] = useState(CATEGORIAS_AUXILIAR_DEFAULT);
  const [catAuxGuardando,    setCatAuxGuardando]    = useState(false);
  const [catAuxOk,           setCatAuxOk]           = useState(false);

  // ── Vista módulo (Empresa | Resumen | Consolidado) ─────────────────
  const [vistaModulo,       setVistaModulo]       = useState('empresa');

  // ── Comparativo: Ppto + Año Anterior ──────────────────────────────
  const [pptoData,          setPptoData]          = useState(null);
  const [anioAntData,       setAnioAntData]       = useState(null);
  const [showUploadPpto,    setShowUploadPpto]    = useState(false);
  const [uploadFilePpto,    setUploadFilePpto]    = useState(null);
  const [uploadingPpto,     setUploadingPpto]     = useState(false);
  const [uploadPptoError,   setUploadPptoError]   = useState(null);
  const fileRefPpto = useRef();

  // ── Resumen multi-empresa ─────────────────────────────────────────
  const [resumenData,       setResumenData]       = useState(null);
  const [resumenCargando,   setResumenCargando]   = useState(false);

  // ── Consolidado ───────────────────────────────────────────────────
  const [consolidadoData,      setConsolidadoData]      = useState(null);  // cuentas[]
  const [consolidadoCargando,  setConsolidadoCargando]  = useState(false);
  const [consolidadoEstado,    setConsolidadoEstado]    = useState([]);     // [{empresa,cargada,factor}]

  // Limpiar drawer cuando cambia empresa o año
  useEffect(() => {
    setCuentaSeleccionada(null); setDrawerTab('movimientos');
    setMayorDrawer(undefined); setMayorDrawerCargando(false);
    setDrawerAnalisisItems([]); setDrawerAnalisisOk(false); setDrawerAnalisisError(null);
    setAuxExpandedRuts(new Set());
  }, [empresa, anio]);

  // Cerrar drawer al cambiar mes (sin limpiar mayorDrawer — es anual)
  useEffect(() => {
    setCuentaSeleccionada(null);
    setDrawerAnalisisItems([]); setDrawerAnalisisOk(false); setDrawerAnalisisError(null);
    setAuxExpandedRuts(new Set());
  }, [mes]);

  const toggleSec = useCallback((id) => {
    setExpandedSecs(prev => { const s = new Set(prev); s.has(id)?s.delete(id):s.add(id); return s; });
  }, []);
  const toggleCat = useCallback((key) => {
    setExpandedCats(prev => { const s = new Set(prev); s.has(key)?s.delete(key):s.add(key); return s; });
  }, []);

  // Parte 2: indica si una categoriaIFRS tiene desglose por tercero.
  // Doble check: config guardada OR detección automática por nombre (CxC/CxP).
  const tieneAuxiliar = useCallback((cat) => {
    if (!cat) return false;
    if (categoriasAuxiliar.includes(cat)) return true;
    return /CxC|CxP/i.test(cat);
  }, [categoriasAuxiliar]);

  // ── Cargar Plan Maestro + categoriasAuxiliar al montar ───────────
  useEffect(() => {
    setPlanCargando(true);
    dbLoadPlanMaestro()
      .then(res => {
        if (res) {
          setPlanMaps(res.maps);
          setPlanMeta(res.meta);
          if (res.categoriasAuxiliar) setCategoriasAuxiliar(res.categoriasAuxiliar);
        }
      })
      .catch(() => {})
      .finally(() => setPlanCargando(false));
  }, []);

  // ── Cargar Maestro de Terceros al montar ─────────────────────────
  useEffect(() => {
    dbLoadTercerosMaestro()
      .then(data => { if (data) setTercerosMaestro(data); })
      .catch(() => {});
  }, []);

  // ── Cargar EEFF desde Supabase cuando cambia empresa/mes/año ─────
  useEffect(() => {
    // Defensa de datos: si la empresa seleccionada no está en la lista autorizada,
    // redirigir sin emitir ninguna consulta a Supabase.
    if (empresasVisibles.length > 0 && !empresasVisibles.includes(empresa)) {
      setEmpresa(empresasVisibles[0]);
      return; // el setEmpresa dispara re-render → este useEffect se ejecuta de nuevo con empresa válida
    }
    setEeffData(null); setSinDatos(false); setShowUpload(false);
    setUploadError(null); setUploadFileMes(null); setUploadFileYtd(null);
    setLoadingData(true);
    cargarEEFF(empresa, anio, mes)
      .then(data => {
        if (data) { setEeffData(data); setSinDatos(false); }
        else { setSinDatos(true); }
      })
      .catch(() => setSinDatos(true))
      .finally(() => setLoadingData(false));
  }, [empresa, mes, anio, empresasVisibles]);

  // ── Cargar Ppto cuando cambia empresa/mes/anio ───────────────────
  useEffect(() => {
    setPptoData(null);
    if (!eeffData) return;
    cargarPpto(empresa, anio, mes).then(d => setPptoData(d)).catch(() => {});
  }, [empresa, mes, anio, eeffData]);

  // ── Cargar Año Anterior cuando cambia empresa/mes/anio ────────────
  useEffect(() => {
    setAnioAntData(null);
    if (!eeffData) return;
    cargarEEFF(empresa, anio - 1, mes).then(d => setAnioAntData(d)).catch(() => {});
  }, [empresa, mes, anio, eeffData]);

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

  // ── Handler: cargar los dos balances (Mes + YTD) y guardar ───────
  const handleCargarBalance = useCallback(async () => {
    if (!uploadFileMes || !uploadFileYtd || !planMaps) return;
    setUploading(true); setUploadError(null);
    try {
      const fmtMes = detectarFormatoBalance(uploadFileMes);
      const fmtYtd = detectarFormatoBalance(uploadFileYtd);
      if (!fmtMes) throw new Error(`Balance del Mes: formato no reconocido (${uploadFileMes.name}). Use .xls o .xlsx.`);
      if (!fmtYtd) throw new Error(`Balance Acumulado: formato no reconocido (${uploadFileYtd.name}). Use .xls o .xlsx.`);
      const cuentasMes = await parsearBalance(uploadFileMes, empresa, mes, anio);
      const cuentasYtd = await parsearBalance(uploadFileYtd, empresa, mes, anio);
      const clasifMes  = clasificarCuentas(cuentasMes, planMaps);
      const clasifYtd  = clasificarCuentas(cuentasYtd, planMaps);
      await guardarEEFF({
        empresa, mes, anio,
        sistema_mes: fmtMes, formato_mes: fmtMes, clasif_mes: clasifMes,
        sistema_ytd: fmtYtd, formato_ytd: fmtYtd, clasif_ytd: clasifYtd,
        guardadoPor: usuarioActual?.nombre || usuarioActual?.email || '',
      });
      const data = await cargarEEFF(empresa, anio, mes);
      if (data) { setEeffData(data); setSinDatos(false); setShowUpload(false); }
    } catch(e) {
      setUploadError(e.message || String(e));
    } finally {
      setUploading(false);
      if (fileRefMes.current) fileRefMes.current.value = '';
      if (fileRefYtd.current) fileRefYtd.current.value = '';
    }
  }, [empresa, mes, anio, planMaps, usuarioActual, uploadFileMes, uploadFileYtd]);

  const cancelUpload = useCallback(() => {
    setShowUpload(false); setUploadFileMes(null); setUploadFileYtd(null); setUploadError(null);
    if (fileRefMes.current) fileRefMes.current.value = '';
    if (fileRefYtd.current) fileRefYtd.current.value = '';
  }, []);

  // ── Handlers: Maestro de Terceros (Parte 1) ──────────────────────
  const handleImportarTerceros = useCallback(async (file, fuente) => {
    if (!file) return;
    setTercerosCargando(true); setTercerosMergeInfo(null);
    try {
      const nuevos = fuente === 'megasystem'
        ? await parseTercerosMegasystem(file)
        : await parseTercerosContec(file);
      const { mapa, stats } = mergeTerceros(tercerosMaestro, nuevos, fuente);
      await dbSaveTercerosMaestro(mapa, usuarioActual?.nombre || usuarioActual?.email || '');
      setTercerosMaestro(mapa);
      setTercerosMergeInfo(stats);
      setTercerosBusqueda(''); setTercerosPagina(0);
    } catch(e) {
      alert('Error importando terceros: ' + (e.message || String(e)));
    } finally {
      setTercerosCargando(false);
      if (tercerosMegaRef.current) tercerosMegaRef.current.value = '';
      if (tercerosCteRef.current)  tercerosCteRef.current.value  = '';
    }
  }, [tercerosMaestro, usuarioActual]);

  const handleAgregarTerceroManual = useCallback(() => {
    const rut = prompt('RUT (ej: 76.351.274-6):');
    if (!rut) return;
    const rutNorm = normalizeRut(rut);
    if (!rutNorm) { alert('RUT inválido'); return; }
    const nombre = prompt('Nombre / razón social:') || '';
    setTercerosMaestro(prev => {
      const mapa = { ...(prev || {}), [rutNorm]: {
        nombre, activo: true, fuente: 'manual', updatedAt: new Date().toISOString(),
      }};
      dbSaveTercerosMaestro(mapa, usuarioActual?.nombre || '').catch(() => {});
      return mapa;
    });
    setTercerosBusqueda(rutNorm); setTercerosPagina(0);
  }, [usuarioActual]);

  const handleGuardarTerceroEditando = useCallback(() => {
    if (!terceroEditando) return;
    const { rut, nombre } = terceroEditando;
    setTercerosMaestro(prev => {
      const mapa = { ...prev, [rut]: { ...(prev[rut]||{}), nombre, updatedAt: new Date().toISOString() }};
      dbSaveTercerosMaestro(mapa, usuarioActual?.nombre || '').catch(() => {});
      return mapa;
    });
    setTerceroEditando(null);
  }, [terceroEditando, usuarioActual]);

  const handleToggleTerceroActivo = useCallback((rut) => {
    setTercerosMaestro(prev => {
      const mapa = { ...prev, [rut]: { ...prev[rut], activo: !(prev[rut]?.activo !== false), updatedAt: new Date().toISOString() }};
      dbSaveTercerosMaestro(mapa, usuarioActual?.nombre || '').catch(() => {});
      return mapa;
    });
  }, [usuarioActual]);

  const handleEliminarTercero = useCallback((rut, nombre) => {
    if (!window.confirm(`Eliminar "${nombre || rut}" del maestro?`)) return;
    setTercerosMaestro(prev => {
      const { [rut]: _, ...mapa } = prev;
      dbSaveTercerosMaestro(mapa, usuarioActual?.nombre || '').catch(() => {});
      return mapa;
    });
    setTerceroEditando(null);
  }, [usuarioActual]);

  // ── Handler: Categorías Auxiliar (Parte 2) ───────────────────────
  const handleGuardarCategoriasAuxiliar = useCallback(async () => {
    setCatAuxGuardando(true); setCatAuxOk(false);
    try {
      await dbSaveCategoriasAuxiliar(categoriasAuxiliar, usuarioActual?.nombre || usuarioActual?.email || '');
      setCatAuxOk(true);
      setTimeout(() => setCatAuxOk(false), 3000);
    } catch(e) {
      alert('Error guardando categorias: ' + (e.message || String(e)));
    } finally {
      setCatAuxGuardando(false);
    }
  }, [categoriasAuxiliar, usuarioActual]);

  // ── Handler: extrae RUTs del mayor ya cargado y los agrega al maestro ──
  const handleExtraerTercerosDelMayor = useCallback(async () => {
    setTerceroExtrayendo(true); setTercerosMergeInfo(null);
    try {
      const val = await dbLoadMayor(empresa, anio, empresasPermitidas);
      if (!val?.movimientos?.length) { alert('No hay mayor cargado para ' + empresa + ' ' + anio); return; }
      const nuevos = extraerTercerosDelMayor(val.movimientos);
      const { mapa, stats } = mergeTerceros(tercerosMaestro, nuevos,
        val.movimientos[0]?.sistema || 'contec');
      await dbSaveTercerosMaestro(mapa, usuarioActual?.nombre || '');
      setTercerosMaestro(mapa);
      setTercerosMergeInfo(stats);
      setTercerosBusqueda(''); setTercerosPagina(0);
    } catch(e) {
      alert('Error extrayendo terceros: ' + (e.message || String(e)));
    } finally {
      setTerceroExtrayendo(false);
    }
  }, [empresa, anio, empresasPermitidas, tercerosMaestro, usuarioActual]);

  // ── Handler: guardar nombre asignado inline desde tab Auxiliar ───
  const handleGuardarAuxNombre = useCallback(() => {
    if (!auxNombreEdit) return;
    const { rut, nombre } = auxNombreEdit;
    setTercerosMaestro(prev => {
      const mapa = { ...(prev || {}), [rut]: {
        ...(prev?.[rut] || {}), nombre, fuente: prev?.[rut]?.fuente || 'manual',
        updatedAt: new Date().toISOString(),
      }};
      dbSaveTercerosMaestro(mapa, usuarioActual?.nombre || '').catch(() => {});
      return mapa;
    });
    setAuxNombreEdit(null);
  }, [auxNombreEdit, usuarioActual]);

  // ── Handler: cargar Ppto (upload balance como presupuesto) ──────
  const handleCargarPpto = useCallback(async () => {
    if (!uploadFilePpto || !planMaps) return;
    setUploadingPpto(true); setUploadPptoError(null);
    try {
      const fmt = detectarFormatoBalance(uploadFilePpto);
      if (!fmt) throw new Error(`Formato no reconocido: ${uploadFilePpto.name}. Use .xls o .xlsx.`);
      const cuentas = await parsearBalance(uploadFilePpto, empresa, mes, anio);
      const clasif  = clasificarCuentas(cuentas, planMaps);
      await guardarPpto({
        empresa, mes, anio, clasif_ytd: clasif,
        sistema: fmt, formato: fmt,
        guardadoPor: usuarioActual?.nombre || usuarioActual?.email || '',
      });
      const d = await cargarPpto(empresa, anio, mes);
      setPptoData(d);
      setShowUploadPpto(false); setUploadFilePpto(null);
    } catch(e) {
      setUploadPptoError(e.message || String(e));
    } finally {
      setUploadingPpto(false);
      if (fileRefPpto.current) fileRefPpto.current.value = '';
    }
  }, [empresa, mes, anio, planMaps, uploadFilePpto, usuarioActual]);

  // ── Handler: cargar Resumen Grupo ────────────────────────────────
  const handleCargarResumen = useCallback(async () => {
    setResumenCargando(true);
    try {
      const data = await cargarResumenEstados(empresasVisibles, anio, mes);
      setResumenData(data);
    } catch(e) {
      alert('Error cargando resumen: ' + (e.message || String(e)));
    } finally {
      setResumenCargando(false);
    }
  }, [empresasVisibles, anio, mes]);

  // ── Handler: consolidar todas las empresas línea a línea ─────────
  const handleConsolidar = useCallback(async () => {
    setConsolidadoCargando(true); setConsolidadoData(null);
    try {
      const estado = [];
      const eeffsData = [];
      for (const emp of EMPRESAS_LINEAALINEA) {
        const data = await cargarEEFF(emp, anio, mes);
        const factor = FACTORES_CONSOLIDADO[emp] || 1;
        estado.push({ empresa: emp, cargada: !!data, factor });
        if (data) {
          eeffsData.push({ empresa: emp, factor, cuentas: data.cuentas_ytd || data.cuentas });
        }
      }
      setConsolidadoEstado(estado);
      if (eeffsData.length > 0) setConsolidadoData(consolidarCuentas(eeffsData));
    } catch(e) {
      alert('Error consolidando: ' + (e.message || String(e)));
    } finally {
      setConsolidadoCargando(false);
    }
  }, [anio, mes]);

  // ── Derived: cpg por fuente ──────────────────────────────────────
  // cpgYtd: siempre acumulado (cuentas_ytd si existe, o legacy cuentas)
  const cpgYtd = useMemo(() => buildCpg(eeffData?.cuentas_ytd || eeffData?.cuentas), [eeffData]);
  // cpgMes: solo cuando hay formato nuevo (cuentas_mes)
  const cpgMes = useMemo(() => buildCpg(eeffData?.cuentas_mes), [eeffData]);
  // sinClasificar siempre desde YTD
  const sinClasYtd = useMemo(() => {
    const src = eeffData?.cuentas_ytd || eeffData?.cuentas;
    return src ? src.filter(c => c.grupo === 'sinClasificar') : [];
  }, [eeffData]);
  // indica si este registro tiene dos balances (nuevo formato)
  const hasFormatoNuevo = !!eeffData?.cuentas_mes;

  // ── Totales ESF (siempre desde YTD) ─────────────────────────────
  const sumGrupoEsf = (grupo) => (cpgYtd[grupo] || []).reduce((s, c) => s + valorSit(c), 0);
  const totalAC  = sumGrupoEsf('Activo Corriente');
  const totalANC = sumGrupoEsf('Activo No Corriente');
  const totalA   = totalAC + totalANC;
  const totalPC  = sumGrupoEsf('Pasivo Corriente');
  const totalPNC = sumGrupoEsf('Pasivo No Corriente');
  const totalP   = totalPC + totalPNC;
  const totalPat = sumGrupoEsf('Patrimonio');

  // ── Totales ER (fuente depende del toggle) ───────────────────────
  const erYtd = calcER(cpgYtd);
  const erMes = calcER(cpgMes);
  const cpgER     = (modo === 'mes' && hasFormatoNuevo) ? cpgMes : cpgYtd;
  const erDisplay = (modo === 'mes' && hasFormatoNuevo) ? erMes  : erYtd;
  const { ingOp, costoOp, resB, gastoOp, resOp, ingNOp, gastNOp, noOp, resAntes, impuesto, resEjec } = erDisplay;

  // ESF cierra con resEjec acumulado (siempre YTD)
  const totalPP = totalP + totalPat + erYtd.resEjec;

  // ── Derived: comparativo ────────────────────────────────────────
  const cpgPpto = useMemo(() => buildCpg(pptoData?.cuentas_ytd), [pptoData]);
  const cpgAnt  = useMemo(() => buildCpg(anioAntData?.cuentas_ytd || anioAntData?.cuentas), [anioAntData]);

  // ── Derived: consolidado ─────────────────────────────────────────
  const cpgConsolidado = useMemo(() => buildCpg(consolidadoData), [consolidadoData]);
  const erConsolidado  = useMemo(() => calcER(cpgConsolidado), [cpgConsolidado]);

  // Cargar mayor lazy cuando el drawer abre el tab movimientos
  useEffect(() => {
    if (!cuentaSeleccionada || drawerTab !== 'movimientos' || mayorDrawer !== undefined || mayorDrawerCargando) return;
    setMayorDrawerCargando(true);
    dbLoadMayor(empresa, anio, empresasPermitidas)
      .then(val => setMayorDrawer(val))
      .catch(() => {})
      .finally(() => setMayorDrawerCargando(false));
  }, [cuentaSeleccionada, drawerTab, mayorDrawer, mayorDrawerCargando, empresa, anio, empresasPermitidas]);

  // Pre-cargar items de análisis cuando cambia la cuenta seleccionada
  useEffect(() => {
    if (!cuentaSeleccionada) { setDrawerAnalisisItems([]); return; }
    const existing = cuentaSeleccionada.composicion?.items || [];
    setDrawerAnalisisItems(existing.map((it, i) => ({ ...it, _id: i })));
    setDrawerAnalisisOk(false); setDrawerAnalisisError(null);
  }, [cuentaSeleccionada]);

  // ── Callback click en cuenta ────────────────────────────────────
  const handleCuentaClick = useCallback((cuenta) => {
    setCuentaSeleccionada(prev =>
      prev && normalizeCodigo(prev.codigo) === normalizeCodigo(cuenta.codigo) ? null : cuenta
    );
    setDrawerTab('movimientos');
  }, []);

  // Movimientos filtrados del mayor para la cuenta seleccionada
  const drawerMovimientos = useMemo(() => {
    if (!cuentaSeleccionada || !mayorDrawer?.movimientos) return [];
    const norm = normalizeCodigo(cuentaSeleccionada.codigo);
    return mayorDrawer.movimientos
      .filter(m => normalizeCodigo(m.codigoCuenta) === norm)
      .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
  }, [cuentaSeleccionada, mayorDrawer]);

  // Saldo y suma para el drawer análisis
  const drawerSaldoRef = cuentaSeleccionada ? saldoEfectivo(cuentaSeleccionada) : 0;
  const drawerSuma     = drawerAnalisisItems.reduce((s, it) => s + (parseFloat(it.monto) || 0), 0);

  // ── Terceros: tabla filtrada + paginada ───────────────────────────
  const tercerosEntradas = useMemo(() => {
    if (!tercerosMaestro) return [];
    const bq = tercerosBusqueda.toLowerCase().trim();
    const todas = Object.entries(tercerosMaestro);
    if (!bq) return todas;
    return todas.filter(([rut, t]) =>
      rut.toLowerCase().includes(bq) || (t.nombre||'').toLowerCase().includes(bq)
    );
  }, [tercerosMaestro, tercerosBusqueda]);

  const tercerosPaginados = useMemo(() =>
    tercerosEntradas.slice(tercerosPagina * TERCEROS_POR_PAG, (tercerosPagina + 1) * TERCEROS_POR_PAG),
    [tercerosEntradas, tercerosPagina]
  );
  const tercerosTotalPags = Math.ceil(tercerosEntradas.length / TERCEROS_POR_PAG) || 1;

  // ── Auxiliar: saldo agrupado por tercero (Parte 3+4) ─────────────
  // Filtra a YTD (mes <= mes seleccionado) para cuadrar con saldo EEFF.
  // Extrae rutNorm desde col[9] (Contec) o glosa (Megasystem).
  const drawerAuxiliar = useMemo(() => {
    if (!cuentaSeleccionada || !tieneAuxiliar(cuentaSeleccionada.categoriaIFRS)) return null;
    const movYtd = drawerMovimientos.filter(m => m.mes <= mes);
    if (!movYtd.length) return { filas: [], cobertura: { conRut: 0, total: 0, pct: 0 }, totales: { debe:0, haber:0, saldo:0, vencido:0 } };

    const today = new Date().toISOString().substring(0, 10);
    const esPasivo = cuentaSeleccionada.tipoIFRS === 'Pasivo';
    const grupos = {};
    let conRut = 0;

    for (const m of movYtd) {
      let rutNorm = null;
      if (m.sistema === 'contec' && m.rutAuxiliar) {
        rutNorm = normalizeRut(m.rutAuxiliar);
      } else if (m.sistema === 'megasystem') {
        rutNorm = extraerRutGlosaMega(m.glosa);
      }
      if (rutNorm) conRut++;
      const key = rutNorm || '__sin_rut__';
      if (!grupos[key]) grupos[key] = { rutNorm, debe: 0, haber: 0, vencido: 0, movs: [] };
      grupos[key].debe  += m.debe  || 0;
      grupos[key].haber += m.haber || 0;
      // Vencimiento: lado "factura" según tipo de cuenta
      if (m.vencimiento && m.vencimiento < today) {
        grupos[key].vencido += esPasivo ? (m.haber || 0) : (m.debe || 0);
      }
      grupos[key].movs.push(m);
    }

    const saldoFn = (d, h) => esPasivo ? h - d : d - h;

    const filas = Object.values(grupos).map(g => ({
      ...g,
      saldo:  saldoFn(g.debe, g.haber),
      nombre: (g.rutNorm && tercerosMaestro?.[g.rutNorm]?.nombre) || null,
    })).sort((a, b) => {
      if (!a.rutNorm && b.rutNorm) return 1;
      if (a.rutNorm && !b.rutNorm) return -1;
      return Math.abs(b.saldo) - Math.abs(a.saldo);
    });

    const totales = filas.reduce((acc, f) => ({
      debe:    acc.debe    + f.debe,
      haber:   acc.haber   + f.haber,
      saldo:   acc.saldo   + f.saldo,
      vencido: acc.vencido + f.vencido,
    }), { debe: 0, haber: 0, saldo: 0, vencido: 0 });

    const hayVencimiento = movYtd.some(m => m.vencimiento);

    return {
      filas,
      cobertura:    { conRut, total: movYtd.length, pct: Math.round(conRut / movYtd.length * 100) },
      labelSaldo:   esPasivo ? 'Por pagar' : 'Por cobrar',
      totales,
      hayVencimiento,
    };
  }, [cuentaSeleccionada, drawerMovimientos, mes, tercerosMaestro, tieneAuxiliar]);

  // ── Handlers de export (van DESPUÉS de todos los derived values) ─
  const handleExportarAuxiliar = useCallback(() => {
    if (!drawerAuxiliar || !cuentaSeleccionada) return;
    exportarAuxiliarXLSX({ ...drawerAuxiliar, cuenta: cuentaSeleccionada.codigo, empresa, mes, anio });
  }, [drawerAuxiliar, cuentaSeleccionada, empresa, mes, anio]);

  const handleExportarEEFF = useCallback(() => {
    if (!eeffData) return;
    exportarEEFFXLSX({ cpgYtd, cpgMes, empresa, mes, anio });
  }, [eeffData, cpgYtd, cpgMes, empresa, mes, anio]);

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div style={{ background:C.bg, color:C.text, padding:'20px 24px', minHeight:'60vh' }}>

      {/* ── Encabezado ── */}
      <div style={{ marginBottom:18, display:'flex', gap:16, alignItems:'flex-start',
        flexWrap:'wrap', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:16, fontWeight:900, color:C.primary, marginBottom:2 }}>
            Estados Financieros
          </div>
          <div style={{ fontSize:11, color:C.muted }}>
            Grupo Mediterra
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
            {empresasVisibles.map(e => <option key={e} value={e}>{e}</option>)}
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
          <label style={{ fontSize:9, color:C.muted, textTransform:'uppercase' }}>Vista ER</label>
          <div style={{ display:'flex', gap:0, borderRadius:7, overflow:'hidden',
            border:`1px solid ${C.border}` }}>
            <button onClick={() => hasFormatoNuevo && setModo('mes')}
              title={hasFormatoNuevo ? 'Resultado del mes seleccionado' : 'Requiere cargar ambos balances (Mes + YTD)'}
              style={{ padding:'6px 14px', fontSize:11, fontWeight:600,
                cursor: hasFormatoNuevo ? 'pointer' : 'default',
                background: modo==='mes' ? `${C.accent}cc` : C.card2,
                color: modo==='mes' ? '#fff' : hasFormatoNuevo ? C.muted : C.muted2,
                border:'none', transition:'all 0.15s',
                opacity: hasFormatoNuevo ? 1 : 0.45 }}>
              Mes
            </button>
            <button onClick={() => setModo('ytd')}
              title="Resultado acumulado año hasta el mes seleccionado"
              style={{ padding:'6px 14px', fontSize:11, fontWeight:600, cursor:'pointer',
                background: modo==='ytd' ? `${C.accent}cc` : C.card2,
                color: modo==='ytd' ? '#fff' : C.muted,
                border:'none', transition:'all 0.15s' }}>
              YTD
            </button>
          </div>
        </div>

        {/* Cargar balance (si hay datos, reemplazar) */}
        {canEdit && !showUpload && !loadingData && (
          <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
            <label style={{ fontSize:9, color:C.muted, textTransform:'uppercase' }}>&nbsp;</label>
            <Btn onClick={() => setShowUpload(true)} color={C.accent} disabled={!planMaps}>
              {eeffData ? 'Reemplazar balance' : 'Cargar balance'}
            </Btn>
          </div>
        )}
      </div>

      {/* ── Tabs de vista ── */}
      <div style={{ display:'flex', gap:0, marginBottom:14,
        borderRadius:7, overflow:'hidden', border:`1px solid ${C.border}`,
        alignSelf:'flex-start', width:'fit-content' }}>
        {[['empresa','Empresa'],['resumen','Resumen Grupo'],['consolidado','Consolidado'],['analisis','Análisis']].map(([v,l]) => (
          <button key={v} onClick={() => setVistaModulo(v)}
            style={{ padding:'6px 18px', fontSize:11, fontWeight:600, cursor:'pointer',
              background: vistaModulo===v ? `${C.accent}cc` : C.card2,
              color: vistaModulo===v ? '#fff' : C.muted, border:'none',
              transition:'all 0.15s', whiteSpace:'nowrap' }}>
            {l}
          </button>
        ))}
      </div>

      {/* ── Panel Admin (Parte 1: Maestro Terceros + Parte 2: Categorías Auxiliar) ── */}
      {isAdmin && (
        <div style={{ marginBottom:14 }}>
          <button onClick={() => setAdminPanelOpen(p => !p)}
            style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:6,
              padding:'4px 12px', color:C.muted, cursor:'pointer', fontSize:10, fontWeight:600 }}>
            {adminPanelOpen ? '▲' : '▼'} Panel Admin
          </button>

          {adminPanelOpen && (
            <div style={{ marginTop:8, border:`1px solid ${C.border}`, borderRadius:10,
              background:C.card2, padding:'14px 16px', display:'flex', flexDirection:'column', gap:14 }}>

              {/* ── Maestro de Terceros ── */}
              <div>
                <div style={{ fontSize:11, fontWeight:800, color:C.text, marginBottom:8 }}>
                  Maestro de Terceros
                </div>

                {/* Stats + botones de importación */}
                <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:8 }}>
                  <span style={{ fontSize:10, color:C.muted }}>
                    {tercerosMaestro
                      ? `${Object.keys(tercerosMaestro).length.toLocaleString('es-CL')} RUTs registrados`
                      : 'Sin maestro cargado'}
                  </span>
                  {tercerosMergeInfo && (
                    <span style={{ fontSize:10, color:C.green }}>
                      +{tercerosMergeInfo.nuevos} nuevos · {tercerosMergeInfo.actualizados} actualizados
                    </span>
                  )}
                  <input ref={tercerosMegaRef} type="file" accept=".xls,.xlsx"
                    onChange={e => handleImportarTerceros(e.target.files[0], 'megasystem')}
                    style={{ display:'none' }} />
                  <input ref={tercerosCteRef} type="file" accept=".xls,.xlsx"
                    onChange={e => handleImportarTerceros(e.target.files[0], 'contec')}
                    style={{ display:'none' }} />
                  <Btn onClick={() => tercerosMegaRef.current?.click()} disabled={tercerosCargando} small>
                    {tercerosCargando ? 'Procesando...' : 'Importar Megasystem'}
                  </Btn>
                  <Btn onClick={() => tercerosCteRef.current?.click()} disabled={tercerosCargando}
                    small color={C.accent}>
                    Importar Contec
                  </Btn>
                  <Btn onClick={handleAgregarTerceroManual} disabled={tercerosCargando}
                    small color={C.green}>
                    + Manual
                  </Btn>
                  <Btn onClick={handleExtraerTercerosDelMayor}
                    disabled={tercerosCargando || terceroExtrayendo} small color={C.accentL}>
                    {terceroExtrayendo ? 'Extrayendo...' : `Extraer del mayor (${empresa} ${anio})`}
                  </Btn>
                </div>

                {/* Buscador + tabla */}
                {tercerosMaestro && (
                  <>
                    <input
                      value={tercerosBusqueda}
                      onChange={e => { setTercerosBusqueda(e.target.value); setTercerosPagina(0); }}
                      placeholder="Buscar RUT o nombre..."
                      style={{ padding:'5px 10px', borderRadius:6, background:C.bg, color:C.text,
                        border:`1px solid ${C.border}`, fontSize:11, width:260, marginBottom:6 }}
                    />

                    <div style={{ maxHeight:260, overflowY:'auto',
                      border:`1px solid ${C.border}`, borderRadius:7 }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
                        <thead>
                          <tr style={{ background:C.bg2 }}>
                            <th style={{ padding:'5px 10px', textAlign:'left', fontWeight:700, color:C.muted, position:'sticky', top:0, background:C.bg2 }}>RUT</th>
                            <th style={{ padding:'5px 10px', textAlign:'left', fontWeight:700, color:C.muted, position:'sticky', top:0, background:C.bg2 }}>Nombre</th>
                            <th style={{ padding:'5px 8px',  textAlign:'center', fontWeight:700, color:C.muted, position:'sticky', top:0, background:C.bg2 }}>Fuente</th>
                            <th style={{ padding:'5px 8px',  textAlign:'center', fontWeight:700, color:C.muted, position:'sticky', top:0, background:C.bg2 }}>Activo</th>
                            <th style={{ padding:'5px 8px', position:'sticky', top:0, background:C.bg2 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {tercerosPaginados.length === 0 && (
                            <tr><td colSpan={5} style={{ padding:'16px', textAlign:'center', color:C.muted2 }}>
                              Sin resultados
                            </td></tr>
                          )}
                          {tercerosPaginados.map(([rut, t]) => (
                            <tr key={rut} style={{ borderTop:`1px solid ${C.border}`,
                              background: terceroEditando?.rut===rut ? `${C.accent}12` : 'transparent' }}>
                              <td style={{ padding:'5px 10px', fontFamily:'monospace', color:C.muted, whiteSpace:'nowrap' }}>
                                {rut}
                              </td>
                              <td style={{ padding:'5px 10px' }}>
                                {terceroEditando?.rut === rut ? (
                                  <input value={terceroEditando.nombre}
                                    onChange={e => setTerceroEditando(p => ({...p, nombre: e.target.value}))}
                                    style={{ padding:'2px 6px', borderRadius:4, background:C.bg, color:C.text,
                                      border:`1px solid ${C.accent}`, fontSize:10, width:'100%' }}
                                  />
                                ) : (
                                  t.nombre || <span style={{ color:C.muted2 }}>—</span>
                                )}
                              </td>
                              <td style={{ padding:'5px 8px', textAlign:'center', color:C.muted2, fontSize:9 }}>
                                {t.fuente || '—'}
                              </td>
                              <td style={{ padding:'5px 8px', textAlign:'center' }}>
                                <input type="checkbox" checked={t.activo !== false}
                                  onChange={() => handleToggleTerceroActivo(rut)} />
                              </td>
                              <td style={{ padding:'5px 8px', textAlign:'right', whiteSpace:'nowrap' }}>
                                {terceroEditando?.rut === rut ? (
                                  <>
                                    <Btn onClick={handleGuardarTerceroEditando} small color={C.green}>OK</Btn>
                                    {' '}
                                    <Btn onClick={() => setTerceroEditando(null)} small>✕</Btn>
                                  </>
                                ) : (
                                  <>
                                    <Btn onClick={() => setTerceroEditando({rut, nombre: t.nombre||''})} small>
                                      Editar
                                    </Btn>
                                    {' '}
                                    <Btn onClick={() => handleEliminarTercero(rut, t.nombre)} small color={C.red}>
                                      ×
                                    </Btn>
                                  </>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Paginación */}
                    {tercerosTotalPags > 1 && (
                      <div style={{ display:'flex', gap:6, alignItems:'center', marginTop:5,
                        fontSize:10, color:C.muted }}>
                        <Btn onClick={() => setTercerosPagina(p => Math.max(0, p-1))}
                          disabled={tercerosPagina===0} small>‹</Btn>
                        <span>{tercerosPagina+1} / {tercerosTotalPags}</span>
                        <Btn onClick={() => setTercerosPagina(p => Math.min(tercerosTotalPags-1, p+1))}
                          disabled={tercerosPagina===tercerosTotalPags-1} small>›</Btn>
                        <span style={{ marginLeft:4 }}>
                          {tercerosEntradas.length.toLocaleString('es-CL')} registros
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* ── Categorías Auxiliar ── */}
              <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:12 }}>
                <div style={{ fontSize:11, fontWeight:800, color:C.text, marginBottom:3 }}>
                  Categorias con auxiliar CxC / CxP
                </div>
                <div style={{ fontSize:10, color:C.muted, marginBottom:8 }}>
                  Las cuentas de estas categorias mostrarán desglose por tercero (cliente/proveedor)
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:8 }}>
                  {CATS_POTENCIAL_AUXILIAR.map(cat => {
                    const activa = categoriasAuxiliar.includes(cat);
                    return (
                      <label key={cat} style={{ display:'flex', alignItems:'center', gap:4,
                        cursor:'pointer', fontSize:10,
                        color: activa ? C.text : C.muted,
                        background: activa ? `${C.accent}22` : C.bg2,
                        padding:'3px 8px', borderRadius:5,
                        border:`1px solid ${activa ? C.accent : C.border}` }}>
                        <input type="checkbox" checked={activa} style={{ margin:0 }}
                          onChange={() => {
                            setCategoriasAuxiliar(prev =>
                              prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
                            );
                            setCatAuxOk(false);
                          }}
                        />
                        {cat}
                      </label>
                    );
                  })}
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <Btn onClick={handleGuardarCategoriasAuxiliar} disabled={catAuxGuardando}
                    small color={C.accent}>
                    {catAuxGuardando ? 'Guardando...' : 'Guardar configuracion'}
                  </Btn>
                  {catAuxOk && <span style={{ fontSize:10, color:C.green }}>Guardado</span>}
                </div>
              </div>

            </div>
          )}
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
            <Btn onClick={() => setShowUpload(true)} color={C.accent}>
              Cargar balance
            </Btn>
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
      {showUpload && (
        <div style={{ background:C.card2, border:`1px solid ${C.border}`, borderRadius:10,
          padding:'16px 20px', marginBottom:16, boxShadow:C.shadow }}>
          <div style={{ fontSize:12, fontWeight:700, color:C.text, marginBottom:12 }}>
            Cargar balances — {empresa} · {NOMBRES_MES[mes]} {anio}
          </div>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:12 }}>
            {/* Balance del Mes */}
            <div style={{ flex:1, minWidth:200, border:`1px dashed ${uploadFileMes ? C.green : C.border}`,
              borderRadius:8, padding:'12px 14px', background:C.bg }}>
              <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:'uppercase', marginBottom:6 }}>
                Balance del Mes
              </div>
              {uploadFileMes ? (
                <div style={{ fontSize:11, color:C.green, display:'flex', alignItems:'center', gap:6 }}>
                  <span>{uploadFileMes.name}</span>
                  <button onClick={() => { setUploadFileMes(null); if(fileRefMes.current) fileRefMes.current.value=''; }}
                    style={{ background:'none', border:'none', cursor:'pointer', color:C.muted, fontSize:12, lineHeight:1 }}>✕</button>
                </div>
              ) : (
                <>
                  <input ref={fileRefMes} type="file" accept=".xls,.xlsx"
                    onChange={e => setUploadFileMes(e.target.files[0])} style={{ display:'none' }} />
                  <Btn onClick={() => fileRefMes.current?.click()} color={C.accent} small>
                    Seleccionar archivo
                  </Btn>
                </>
              )}
            </div>
            {/* Balance Acumulado YTD */}
            <div style={{ flex:1, minWidth:200, border:`1px dashed ${uploadFileYtd ? C.green : C.border}`,
              borderRadius:8, padding:'12px 14px', background:C.bg }}>
              <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:'uppercase', marginBottom:6 }}>
                Balance Acumulado (YTD)
              </div>
              {uploadFileYtd ? (
                <div style={{ fontSize:11, color:C.green, display:'flex', alignItems:'center', gap:6 }}>
                  <span>{uploadFileYtd.name}</span>
                  <button onClick={() => { setUploadFileYtd(null); if(fileRefYtd.current) fileRefYtd.current.value=''; }}
                    style={{ background:'none', border:'none', cursor:'pointer', color:C.muted, fontSize:12, lineHeight:1 }}>✕</button>
                </div>
              ) : (
                <>
                  <input ref={fileRefYtd} type="file" accept=".xls,.xlsx"
                    onChange={e => setUploadFileYtd(e.target.files[0])} style={{ display:'none' }} />
                  <Btn onClick={() => fileRefYtd.current?.click()} color={C.accent} small>
                    Seleccionar archivo
                  </Btn>
                </>
              )}
            </div>
          </div>
          {uploadError && (
            <div style={{ color:C.red, fontSize:11, marginBottom:8 }}>Error: {uploadError}</div>
          )}
          <div style={{ display:'flex', gap:8 }}>
            <Btn onClick={handleCargarBalance} color={C.green}
              disabled={uploading || !uploadFileMes || !uploadFileYtd}>
              {uploading ? 'Procesando...' : 'Confirmar y guardar'}
            </Btn>
            <Btn onClick={cancelUpload} color={C.muted} disabled={uploading}>
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
              {hasFormatoNuevo ? (
                <>
                  Mes: {eeffData.sistema_mes || '?'} · {eeffData.cuentas_mes?.length} cuentas
                  {' · '}
                  YTD: {eeffData.sistema_ytd || '?'} · {eeffData.cuentas_ytd?.length} cuentas
                </>
              ) : (
                <>
                  {eeffData.sistema === 'megasystem' ? 'Megasystem' : 'Contec'} · {eeffData.cuentas?.length} cuentas · <span style={{ color:C.yellow }}>formato legacy</span>
                </>
              )}
              {' · '}Guardado{' '}
              {eeffData.fechaGuardado ? new Date(eeffData.fechaGuardado).toLocaleDateString('es-CL') : ''}
              {eeffData.guardadoPor ? ` por ${eeffData.guardadoPor}` : ''}
            </div>
            <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
              <Btn onClick={() => {
                const all = new Set(ESF_SECCIONES.map(s=>s.id).concat(ER_BLOQUES.map(b=>b.id)));
                setExpandedSecs(all); setExpandedCats(new Set());
              }} color={C.muted} small>Expandir todo</Btn>
              <Btn onClick={() => {
                setExpandedSecs(new Set()); setExpandedCats(new Set());
              }} color={C.muted} small>Colapsar todo</Btn>
              <Btn onClick={handleExportarEEFF} color={C.green} small>
                Exportar XLSX
              </Btn>
            </div>
          </div>

          {/* ═══ ESTADO DE SITUACIÓN FINANCIERA ═══ */}
          <div style={{ marginBottom:32 }}>
            <div style={{ fontSize:13, fontWeight:900, color:C.primary,
              marginBottom:10, paddingBottom:6, borderBottom:`2px solid ${C.accent}44`,
              letterSpacing:'0.04em', textTransform:'uppercase' }}>
              Estado de Situación Financiera
            </div>

            <div style={{ overflowX:'auto', borderRadius:10, border:`1px solid ${C.border}`, background:C.card, boxShadow:C.shadow }}>
              <table style={{ borderCollapse:'collapse', width:'100%' }}>
                <thead>
                  <tr style={{ background:C.primary }}>
                    <th style={{ padding:'8px 12px', textAlign:'left', fontSize:10,
                      color:C.primaryText, fontWeight:700, textTransform:'uppercase' }}>Cuenta</th>
                    <th style={{ padding:'8px 14px', textAlign:'right', fontSize:10,
                      color:C.primaryText, fontWeight:700, textTransform:'uppercase', whiteSpace:'nowrap' }}>
                      Acumulado {NOMBRES_MES[mes]} {anio}
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
                      cuentas={cpgYtd[sec.grupo] || []}
                      expandedSecs={expandedSecs} onToggleSec={toggleSec}
                      expandedCats={expandedCats} onToggleCat={toggleCat}
                      onCuentaClick={handleCuentaClick} selectedCodigo={cuentaSeleccionada?.codigo} />
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
                      cuentas={cpgYtd[sec.grupo] || []}
                      expandedSecs={expandedSecs} onToggleSec={toggleSec}
                      expandedCats={expandedCats} onToggleCat={toggleCat}
                      onCuentaClick={handleCuentaClick} selectedCodigo={cuentaSeleccionada?.codigo} />
                  ))}
                  <LineaTotal label="Total Pasivo" valor={totalP} />
                  <tr style={{ background:'transparent', height:4 }}><td colSpan={2}></td></tr>
                  {ESF_SECCIONES.filter(s => s.grupo === 'Patrimonio').map(sec => (
                    <SeccionESF key={sec.id} sec={sec}
                      cuentas={cpgYtd[sec.grupo] || []}
                      expandedSecs={expandedSecs} onToggleSec={toggleSec}
                      expandedCats={expandedCats} onToggleCat={toggleCat}
                      onCuentaClick={handleCuentaClick} selectedCodigo={cuentaSeleccionada?.codigo} />
                  ))}
                  {/* Línea derivada — siempre desde YTD para que el ESF cuadre */}
                  <tr style={{ background:`${C.purple}0d`, borderTop:`1px solid ${C.purple}33` }}>
                    <td style={{ padding:'6px 12px', paddingLeft:28,
                      fontSize:11, fontWeight:700, color:C.purple, fontStyle:'italic' }}>
                      Resultado del Período (Acumulado)
                      <span style={{ fontSize:9, fontStyle:'normal', fontWeight:400,
                        color:C.muted, marginLeft:8 }}>
                        derivado · YTD acumulado igual al Resultado del Ejercicio (ER YTD)
                      </span>
                    </td>
                    <td style={{ padding:'6px 14px', textAlign:'right',
                      fontSize:12, fontWeight:800, fontStyle:'italic',
                      color: erYtd.resEjec >= 0 ? C.green : C.red, whiteSpace:'nowrap' }}>
                      {fmtSig(erYtd.resEjec)}
                    </td>
                  </tr>
                  <LineaDivision label="TOTAL PASIVO + PATRIMONIO" valor={totalPP}
                    color={Math.abs(totalA - totalPP) < 1 ? C.green : C.red} />
                  {Math.abs(totalA - totalPP) >= 1 && (
                    <tr style={{ background:`${C.red}11` }}>
                      <td colSpan={2} style={{ padding:'4px 12px', fontSize:10, color:C.red }}>
                        ⚠ Diferencia A − (P+Pat): {fmtMonto(totalA - totalPP, 2)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ═══ ESTADO DE RESULTADOS ═══ */}
          <div style={{ marginBottom:32 }}>
            <div style={{ fontSize:13, fontWeight:900, color:C.primary,
              marginBottom:10, paddingBottom:6, borderBottom:`2px solid ${C.accent}44`,
              letterSpacing:'0.04em', textTransform:'uppercase' }}>
              Estado de Resultados
            </div>

            <div style={{ overflowX:'auto', borderRadius:10, border:`1px solid ${C.border}`, background:C.card, boxShadow:C.shadow }}>
              <table style={{ borderCollapse:'collapse', width:'100%' }}>
                <thead>
                  <tr style={{ background:C.primary }}>
                    <th style={{ padding:'8px 12px', textAlign:'left', fontSize:10,
                      color:C.primaryText, fontWeight:700, textTransform:'uppercase' }}>Cuenta</th>
                    <th style={{ padding:'8px 14px', textAlign:'right', fontSize:10,
                      color:C.primaryText, fontWeight:700, textTransform:'uppercase', whiteSpace:'nowrap' }}>
                      {(modo === 'ytd' || !hasFormatoNuevo)
                        ? `Acum. ${NOMBRES_MES[mes]} ${anio}`
                        : `${NOMBRES_MES[mes]} ${anio}`}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <BloqueER bloque={ER_BLOQUES[0]} cuentas={cpgER['Ingreso Operacional']||[]}
                    expandedSecs={expandedSecs} onToggleSec={toggleSec}
                    expandedCats={expandedCats} onToggleCat={toggleCat}
                    onCuentaClick={handleCuentaClick} selectedCodigo={cuentaSeleccionada?.codigo} />
                  <BloqueER bloque={ER_BLOQUES[1]} cuentas={cpgER['Costo Operacional']||[]}
                    expandedSecs={expandedSecs} onToggleSec={toggleSec}
                    expandedCats={expandedCats} onToggleCat={toggleCat}
                    onCuentaClick={handleCuentaClick} selectedCodigo={cuentaSeleccionada?.codigo} />
                  <LineaDivision label="RESULTADO BRUTO" valor={resB} />

                  <BloqueER bloque={ER_BLOQUES[2]} cuentas={cpgER['Gasto Operacional']||[]}
                    expandedSecs={expandedSecs} onToggleSec={toggleSec}
                    expandedCats={expandedCats} onToggleCat={toggleCat}
                    onCuentaClick={handleCuentaClick} selectedCodigo={cuentaSeleccionada?.codigo} />
                  <LineaDivision label="RESULTADO OPERACIONAL" valor={resOp} />

                  <BloqueER bloque={ER_BLOQUES[3]} cuentas={cpgER['Ingreso No Operacional']||[]}
                    expandedSecs={expandedSecs} onToggleSec={toggleSec}
                    expandedCats={expandedCats} onToggleCat={toggleCat}
                    onCuentaClick={handleCuentaClick} selectedCodigo={cuentaSeleccionada?.codigo} />
                  <BloqueER bloque={ER_BLOQUES[4]} cuentas={cpgER['Gasto No Operacional']||[]}
                    expandedSecs={expandedSecs} onToggleSec={toggleSec}
                    expandedCats={expandedCats} onToggleCat={toggleCat}
                    onCuentaClick={handleCuentaClick} selectedCodigo={cuentaSeleccionada?.codigo} />
                  {(cpgER['No Operacional']||[]).length > 0 && (
                    <BloqueER bloque={ER_BLOQUES[5]} cuentas={cpgER['No Operacional']||[]}
                      expandedSecs={expandedSecs} onToggleSec={toggleSec}
                      expandedCats={expandedCats} onToggleCat={toggleCat}
                      onCuentaClick={handleCuentaClick} selectedCodigo={cuentaSeleccionada?.codigo} />
                  )}
                  <LineaTotal label="Resultado antes de Impuesto" valor={resAntes} />

                  <BloqueER bloque={ER_BLOQUES[6]} cuentas={cpgER['Impuesto']||[]}
                    expandedSecs={expandedSecs} onToggleSec={toggleSec}
                    expandedCats={expandedCats} onToggleCat={toggleCat}
                    onCuentaClick={handleCuentaClick} selectedCodigo={cuentaSeleccionada?.codigo} />
                  <LineaDivision label="RESULTADO DEL EJERCICIO" valor={resEjec} />
                  {/* En vista Mes: referencia contextual del resultado acumulado YTD */}
                  {modo === 'mes' && hasFormatoNuevo && (
                    <tr style={{ background:`${C.purple}0d`, borderTop:`1px solid ${C.border}22` }}>
                      <td colSpan={2} style={{ padding:'4px 14px', fontSize:10,
                        color:C.muted, fontStyle:'italic', textAlign:'right' }}>
                        Resultado Acumulado YTD:{' '}
                        <strong style={{ color: erYtd.resEjec >= 0 ? C.green : C.red }}>
                          {fmtSig(erYtd.resEjec)}
                        </strong>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ═══ ANÁLISIS COMPARATIVO ═══ */}
          <div style={{ marginTop:8 }}>
            {/* Panel upload ppto */}
            {showUploadPpto && (
              <div style={{ background:C.card2, border:`1px solid ${C.border}`, borderRadius:10,
                padding:'14px 18px', marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.text, marginBottom:10 }}>
                  Cargar Presupuesto — {empresa} · {NOMBRES_MES[mes]} {anio}
                  <span style={{ fontSize:10, fontWeight:400, color:C.muted, marginLeft:8 }}>
                    (balance .xls/.xlsx en formato YTD acumulado = ppto del período)
                  </span>
                </div>
                <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                  <input ref={fileRefPpto} type="file" accept=".xls,.xlsx"
                    onChange={e => setUploadFilePpto(e.target.files[0])} style={{ display:'none' }} />
                  {uploadFilePpto ? (
                    <span style={{ fontSize:11, color:C.green }}>{uploadFilePpto.name}</span>
                  ) : (
                    <Btn onClick={() => fileRefPpto.current?.click()} color={C.accent} small>
                      Seleccionar archivo
                    </Btn>
                  )}
                  <Btn onClick={handleCargarPpto} color={C.green} small
                    disabled={uploadingPpto || !uploadFilePpto}>
                    {uploadingPpto ? 'Procesando...' : 'Guardar presupuesto'}
                  </Btn>
                  <Btn onClick={() => { setShowUploadPpto(false); setUploadFilePpto(null); setUploadPptoError(null); }}
                    color={C.muted} small disabled={uploadingPpto}>
                    Cancelar
                  </Btn>
                </div>
                {uploadPptoError && (
                  <div style={{ fontSize:10, color:C.red, marginTop:6 }}>{uploadPptoError}</div>
                )}
              </div>
            )}

            {/* Botón cargar ppto (si no hay ppto) + estado */}
            {!showUploadPpto && canEdit && (
              <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom: (pptoData || anioAntData) ? 0 : 8 }}>
                {pptoData ? (
                  <span style={{ fontSize:10, color:C.muted }}>
                    Ppto cargado · {new Date(pptoData.fechaGuardado).toLocaleDateString('es-CL')}
                    {' · '}
                    <button onClick={() => setShowUploadPpto(true)}
                      style={{ background:'none', border:'none', cursor:'pointer',
                        fontSize:10, color:C.accent, padding:0 }}>
                      Reemplazar
                    </button>
                  </span>
                ) : (
                  <Btn onClick={() => setShowUploadPpto(true)} color={C.muted} small>
                    + Cargar presupuesto
                  </Btn>
                )}
                {anioAntData ? (
                  <span style={{ fontSize:10, color:C.muted }}>
                    · Año {anio-1} disponible
                  </span>
                ) : (
                  <span style={{ fontSize:10, color:C.muted2 }}>· Sin datos {anio-1}</span>
                )}
              </div>
            )}

            {/* Tablas comparativas */}
            <TablaComparativoESF
              cpgReal={cpgYtd} cpgPpto={cpgPpto} cpgAnt={cpgAnt}
              totalA={totalA} totalP={totalP} totalPP={totalPP}
              erYtd={erYtd} mes={mes} anio={anio} />
            <TablaComparativoER
              erReal={erYtd} cpgReal={cpgYtd} cpgPpto={cpgPpto} cpgAnt={cpgAnt}
              mes={mes} anio={anio} />
          </div>

          {/* ═══ SIN CLASIFICAR (siempre desde YTD) ═══ */}
          {sinClasYtd.length > 0 && (
            <div style={{ marginBottom:24 }}>
              <div style={{ fontSize:12, fontWeight:800, color:C.yellow, marginBottom:8 }}>
                Sin Clasificar — {sinClasYtd.length} cuentas
                <span style={{ fontSize:10, fontWeight:400, color:C.muted, marginLeft:8 }}>
                  (no encontradas en el Plan Maestro — agregar en la próxima versión)
                </span>
              </div>
              <div style={{ overflowX:'auto', borderRadius:8,
                border:`1px solid ${C.yellow}44` }}>
                <table style={{ borderCollapse:'collapse', width:'100%', fontSize:11 }}>
                  <thead>
                    <tr style={{ background:C.primary }}>
                      {['Código','Nombre','SD','SA'].map(h => (
                        <th key={h} style={{ padding:'5px 12px',
                          textAlign:h==='SD'||h==='SA'?'right':'left',
                          fontSize:9, color:C.primaryText, fontWeight:700,
                          textTransform:'uppercase' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sinClasYtd.map((c, i) => (
                      <tr key={c.codigo+i}
                        style={{ background:i%2===0?C.card:C.rowAlt,
                          borderBottom:`1px solid ${C.border}22` }}>
                        <td style={{ padding:'4px 12px', color:C.yellow,
                          fontFamily:'monospace', fontSize:10 }}>{c.codigo}</td>
                        <td style={{ padding:'4px 12px', color:C.text }}>{c.nombre}</td>
                        <td style={{ padding:'4px 12px', textAlign:'right', color:C.muted}}>
                          {c.saldoDeudor ? fmtMonto(c.saldoDeudor,2) : '—'}
                        </td>
                        <td style={{ padding:'4px 12px', textAlign:'right', color:C.muted}}>
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

      {/* ══ VISTA: RESUMEN GRUPO ══════════════════════════════════ */}
      {vistaModulo === 'resumen' && (
        <div style={{ marginTop:4 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16, flexWrap:'wrap' }}>
            <span style={{ fontSize:13, fontWeight:800, color:C.primary }}>
              Estado de carga — {NOMBRES_MES[mes]} {anio}
            </span>
            <Btn onClick={handleCargarResumen} disabled={resumenCargando} color={C.accent}>
              {resumenCargando ? 'Cargando...' : resumenData ? 'Actualizar' : 'Cargar estado'}
            </Btn>
            {resumenData && (
              <span style={{ fontSize:10, color:C.muted }}>
                {resumenData.filter(r=>r.tieneEEFF).length}/{resumenData.length} empresas con balance ·{' '}
                {resumenData.filter(r=>r.tieneMayor).length}/{resumenData.length} con mayor
              </span>
            )}
          </div>

          {resumenData && (
            <div style={{ overflowX:'auto', borderRadius:10, border:`1px solid ${C.border}`,
              background:C.card, boxShadow:C.shadow }}>
              <table style={{ borderCollapse:'collapse', width:'100%', fontSize:11 }}>
                <thead>
                  <tr style={{ background:C.primary }}>
                    {['Empresa','Balance','Cuentas','Libro Mayor','Sistema','Último guardado','Por'].map((h,i) => (
                      <th key={h} style={{ padding:'7px 14px', textAlign:i>0&&i<4?'center':'left',
                        color:C.primaryText, fontSize:10, fontWeight:700, whiteSpace:'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resumenData.map((r, i) => (
                    <tr key={r.empresa} style={{ borderTop:`1px solid ${C.border}22`,
                      background: i%2===0 ? C.card : C.rowAlt }}>
                      <td style={{ padding:'7px 14px', fontWeight:600 }}>{r.empresa}</td>
                      <td style={{ padding:'7px 14px', textAlign:'center' }}>
                        <span style={{ color: r.tieneEEFF ? C.green : C.muted2, fontSize:15, fontWeight:700 }}>
                          {r.tieneEEFF ? '✓' : '—'}
                        </span>
                      </td>
                      <td style={{ padding:'7px 14px', textAlign:'center',
                        color: r.totalCuentas > 0 ? C.text : C.muted2 }}>
                        {r.tieneEEFF ? r.totalCuentas.toLocaleString('es-CL') : '—'}
                      </td>
                      <td style={{ padding:'7px 14px', textAlign:'center' }}>
                        {r.tieneMayor ? (
                          <span style={{ color:C.green, fontSize:10 }}>
                            ✓
                          </span>
                        ) : (
                          <span style={{ color:C.muted2 }}>—</span>
                        )}
                      </td>
                      <td style={{ padding:'7px 14px', color:C.muted, fontSize:10 }}>
                        {r.sistemaEEFF || '—'}
                      </td>
                      <td style={{ padding:'7px 14px', color:C.muted, fontSize:10, whiteSpace:'nowrap' }}>
                        {r.fechaEEFF ? new Date(r.fechaEEFF).toLocaleDateString('es-CL') : '—'}
                      </td>
                      <td style={{ padding:'7px 14px', color:C.muted, fontSize:10 }}>
                        {r.guardadoPor || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══ VISTA: CONSOLIDADO ════════════════════════════════════ */}
      {vistaModulo === 'consolidado' && (
        <div style={{ marginTop:4 }}>
          {/* Header + botón + estado */}
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16, flexWrap:'wrap' }}>
            <span style={{ fontSize:13, fontWeight:800, color:C.primary }}>
              Consolidado Grupo — {NOMBRES_MES[mes]} {anio}
            </span>
            <Btn onClick={handleConsolidar} disabled={consolidadoCargando} color={C.accent}>
              {consolidadoCargando ? 'Consolidando...' : consolidadoData ? 'Actualizar' : 'Consolidar'}
            </Btn>
            {consolidadoEstado.length > 0 && (
              <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                {consolidadoEstado.map(e => (
                  <span key={e.empresa} style={{ fontSize:9, padding:'2px 8px', borderRadius:10,
                    background: e.cargada ? `${C.green}22` : `${C.red}22`,
                    color: e.cargada ? C.green : C.red,
                    border:`1px solid ${e.cargada ? C.green : C.red}44` }}>
                    {e.empresa}{e.factor < 1 ? ` (${e.factor*100}%)` : ''} {e.cargada ? '✓' : '✗'}
                  </span>
                ))}
              </div>
            )}
            {consolidadoData && (
              <Btn onClick={() => exportarEEFFXLSX({ cpgYtd: cpgConsolidado, cpgMes: {}, empresa: 'Consolidado', mes, anio })}
                color={C.green} small>
                Exportar XLSX
              </Btn>
            )}
          </div>

          {consolidadoCargando && (
            <div style={{ color:C.muted, fontSize:12, padding:'40px 0', textAlign:'center' }}>
              Cargando datos de {EMPRESAS_LINEAALINEA.length} empresas...
            </div>
          )}

          {!consolidadoCargando && consolidadoData && (() => {
            const cpgC  = cpgConsolidado;
            const erC   = erConsolidado;
            const sumC  = (g) => (cpgC[g]||[]).reduce((s,c)=>s+valorSit(c), 0);
            const tCAC  = sumC('Activo Corriente'), tCANC = sumC('Activo No Corriente');
            const tCA   = tCAC + tCANC;
            const tCPC  = sumC('Pasivo Corriente'), tCPNC = sumC('Pasivo No Corriente');
            const tCP   = tCPC + tCPNC;
            const tCPat = sumC('Patrimonio');
            const tCPP  = tCP + tCPat + erC.resEjec;
            return (
              <>
                {/* ESF Consolidado */}
                <div style={{ marginBottom:28 }}>
                  <div style={{ fontSize:12, fontWeight:900, color:C.primary, marginBottom:8,
                    textTransform:'uppercase', letterSpacing:'0.03em' }}>
                    Estado de Situación Financiera — Consolidado
                  </div>
                  <div style={{ overflowX:'auto', borderRadius:10, border:`1px solid ${C.border}`,
                    background:C.card, boxShadow:C.shadow }}>
                    <table style={{ borderCollapse:'collapse', width:'100%' }}>
                      <thead>
                        <tr style={{ background:C.primary }}>
                          <th style={{ padding:'8px 12px', textAlign:'left', fontSize:10,
                            color:C.primaryText, fontWeight:700, textTransform:'uppercase' }}>Cuenta</th>
                          <th style={{ padding:'8px 14px', textAlign:'right', fontSize:10,
                            color:C.primaryText, fontWeight:700, whiteSpace:'nowrap' }}>
                            Consolidado {NOMBRES_MES[mes]} {anio}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ background:`${C.accent}18` }}>
                          <td colSpan={2} style={{ padding:'6px 12px', fontSize:11,
                            fontWeight:800, color:C.accent, letterSpacing:'0.06em' }}>ACTIVOS</td>
                        </tr>
                        {ESF_SECCIONES.filter(s=>s.grupo.startsWith('Activo')).map(sec => (
                          <SeccionESF key={sec.id} sec={sec} cuentas={cpgC[sec.grupo]||[]}
                            expandedSecs={expandedSecs} onToggleSec={toggleSec}
                            expandedCats={expandedCats} onToggleCat={toggleCat}
                            onCuentaClick={null} selectedCodigo={null} />
                        ))}
                        <LineaDivision label="TOTAL ACTIVO" valor={tCA} />
                        <tr style={{ background:`${C.blue}18` }}>
                          <td colSpan={2} style={{ padding:'6px 12px', fontSize:11,
                            fontWeight:800, color:C.blue, letterSpacing:'0.06em' }}>
                            PASIVOS Y PATRIMONIO
                          </td>
                        </tr>
                        {ESF_SECCIONES.filter(s=>s.grupo.startsWith('Pasivo')).map(sec => (
                          <SeccionESF key={sec.id} sec={sec} cuentas={cpgC[sec.grupo]||[]}
                            expandedSecs={expandedSecs} onToggleSec={toggleSec}
                            expandedCats={expandedCats} onToggleCat={toggleCat}
                            onCuentaClick={null} selectedCodigo={null} />
                        ))}
                        <LineaTotal label="Total Pasivo" valor={tCP} />
                        <tr style={{ background:'transparent', height:4 }}><td colSpan={2}></td></tr>
                        {ESF_SECCIONES.filter(s=>s.grupo==='Patrimonio').map(sec => (
                          <SeccionESF key={sec.id} sec={sec} cuentas={cpgC[sec.grupo]||[]}
                            expandedSecs={expandedSecs} onToggleSec={toggleSec}
                            expandedCats={expandedCats} onToggleCat={toggleCat}
                            onCuentaClick={null} selectedCodigo={null} />
                        ))}
                        <tr style={{ background:`${C.purple}0d`, borderTop:`1px solid ${C.purple}33` }}>
                          <td style={{ padding:'6px 12px', paddingLeft:28, fontSize:11,
                            fontWeight:700, color:C.purple, fontStyle:'italic' }}>
                            Resultado del Período (Acumulado)
                          </td>
                          <td style={{ padding:'6px 14px', textAlign:'right', fontSize:12,
                            fontWeight:800, fontStyle:'italic',
                            color: erC.resEjec >= 0 ? C.green : C.red, whiteSpace:'nowrap' }}>
                            {fmtSig(erC.resEjec)}
                          </td>
                        </tr>
                        <LineaDivision label="TOTAL PASIVO + PATRIMONIO" valor={tCPP}
                          color={Math.abs(tCA - tCPP) < 1 ? C.green : C.red} />
                        {Math.abs(tCA - tCPP) >= 1 && (
                          <tr style={{ background:`${C.red}11` }}>
                            <td colSpan={2} style={{ padding:'4px 12px', fontSize:10, color:C.red }}>
                              ⚠ Diferencia A − (P+Pat): {fmtMonto(tCA - tCPP, 2)}
                              <span style={{ marginLeft:8, color:C.muted }}>
                                (puede reflejar intercompany no eliminado)
                              </span>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ER Consolidado */}
                <div style={{ marginBottom:28 }}>
                  <div style={{ fontSize:12, fontWeight:900, color:C.primary, marginBottom:8,
                    textTransform:'uppercase', letterSpacing:'0.03em' }}>
                    Estado de Resultados — Consolidado
                  </div>
                  <div style={{ overflowX:'auto', borderRadius:10, border:`1px solid ${C.border}`,
                    background:C.card, boxShadow:C.shadow }}>
                    <table style={{ borderCollapse:'collapse', width:'100%' }}>
                      <thead>
                        <tr style={{ background:C.primary }}>
                          <th style={{ padding:'8px 12px', textAlign:'left', fontSize:10,
                            color:C.primaryText, fontWeight:700, textTransform:'uppercase' }}>Cuenta</th>
                          <th style={{ padding:'8px 14px', textAlign:'right', fontSize:10,
                            color:C.primaryText, fontWeight:700, whiteSpace:'nowrap' }}>
                            Acum. {NOMBRES_MES[mes]} {anio}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <BloqueER bloque={ER_BLOQUES[0]} cuentas={cpgC['Ingreso Operacional']||[]}
                          expandedSecs={expandedSecs} onToggleSec={toggleSec}
                          expandedCats={expandedCats} onToggleCat={toggleCat}
                          onCuentaClick={null} selectedCodigo={null} />
                        <BloqueER bloque={ER_BLOQUES[1]} cuentas={cpgC['Costo Operacional']||[]}
                          expandedSecs={expandedSecs} onToggleSec={toggleSec}
                          expandedCats={expandedCats} onToggleCat={toggleCat}
                          onCuentaClick={null} selectedCodigo={null} />
                        <LineaDivision label="RESULTADO BRUTO" valor={erC.resB} />
                        <BloqueER bloque={ER_BLOQUES[2]} cuentas={cpgC['Gasto Operacional']||[]}
                          expandedSecs={expandedSecs} onToggleSec={toggleSec}
                          expandedCats={expandedCats} onToggleCat={toggleCat}
                          onCuentaClick={null} selectedCodigo={null} />
                        <LineaDivision label="RESULTADO OPERACIONAL" valor={erC.resOp} />
                        <BloqueER bloque={ER_BLOQUES[3]} cuentas={cpgC['Ingreso No Operacional']||[]}
                          expandedSecs={expandedSecs} onToggleSec={toggleSec}
                          expandedCats={expandedCats} onToggleCat={toggleCat}
                          onCuentaClick={null} selectedCodigo={null} />
                        <BloqueER bloque={ER_BLOQUES[4]} cuentas={cpgC['Gasto No Operacional']||[]}
                          expandedSecs={expandedSecs} onToggleSec={toggleSec}
                          expandedCats={expandedCats} onToggleCat={toggleCat}
                          onCuentaClick={null} selectedCodigo={null} />
                        {(cpgC['No Operacional']||[]).length > 0 && (
                          <BloqueER bloque={ER_BLOQUES[5]} cuentas={cpgC['No Operacional']||[]}
                            expandedSecs={expandedSecs} onToggleSec={toggleSec}
                            expandedCats={expandedCats} onToggleCat={toggleCat}
                            onCuentaClick={null} selectedCodigo={null} />
                        )}
                        <LineaTotal label="Resultado antes de Impuesto" valor={erC.resAntes} />
                        <BloqueER bloque={ER_BLOQUES[6]} cuentas={cpgC['Impuesto']||[]}
                          expandedSecs={expandedSecs} onToggleSec={toggleSec}
                          expandedCats={expandedCats} onToggleCat={toggleCat}
                          onCuentaClick={null} selectedCodigo={null} />
                        <LineaDivision label="RESULTADO DEL EJERCICIO" valor={erC.resEjec} />
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            );
          })()}

          {!consolidadoCargando && !consolidadoData && (
            <div style={{ textAlign:'center', padding:'60px 0', color:C.muted, fontSize:12 }}>
              Presiona "Consolidar" para agregar los EEFF de las 6 empresas línea a línea.
            </div>
          )}
        </div>
      )}

      {/* ── Panel diagnóstico Libro Mayor (solo admin, Parte 1) ── */}
      {/* ══ DRAWER — Análisis de Cuenta (Parte 4) ══════════════════ */}
      {cuentaSeleccionada && (
        <>
          {/* Backdrop */}
          <div onClick={() => setCuentaSeleccionada(null)}
            style={{ position:'fixed', inset:0, background:'rgba(16,24,40,0.55)', zIndex:199 }} />

          {/* Panel lateral derecho — 400px; a 1366px deja ~966px para el contenido */}
          <div style={{ position:'fixed', top:0, right:0, width:400, height:'100vh',
            background:C.bg2, borderLeft:`1px solid ${C.border}`, zIndex:200,
            display:'flex', flexDirection:'column', overflow:'hidden' }}>

            {/* Header */}
            <div style={{ padding:'14px 16px', borderBottom:`1px solid ${C.border}`,
              background:C.bg, flexShrink:0 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:10, fontFamily:'monospace', color:C.primary,
                    letterSpacing:1, marginBottom:2 }}>
                    {cuentaSeleccionada.codigo}
                  </div>
                  <div style={{ fontSize:12, fontWeight:700, color:C.text,
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                    marginBottom:4 }}>
                    {cuentaSeleccionada.nombre || cuentaSeleccionada.nombreOficial}
                  </div>
                  <div style={{ fontSize:11, color:C.muted }}>
                    Saldo YTD:{' '}
                    <strong style={{ color: drawerSaldoRef >= 0 ? C.text : C.red }}>
                      {fmtMonto(drawerSaldoRef, 2)}
                    </strong>
                  </div>
                </div>
                <button onClick={() => setCuentaSeleccionada(null)}
                  style={{ background:'none', border:'none', color:C.muted, cursor:'pointer',
                    fontSize:20, lineHeight:1, padding:'0 0 0 8px', flexShrink:0 }}>
                  ×
                </button>
              </div>

              {/* Tabs */}
              <div style={{ display:'flex', gap:6, marginTop:10 }}>
                {[
                  ['movimientos', 'Movimientos'],
                  ['analisis',   'Análisis'],
                  ...(tieneAuxiliar(cuentaSeleccionada?.categoriaIFRS) ? [['auxiliar', 'Auxiliar']] : []),
                ].map(([id, label]) => (
                  <button key={id} onClick={() => setDrawerTab(id)}
                    style={{ padding:'4px 12px', borderRadius:12, border:'none',
                      fontSize:11, fontWeight:600, cursor:'pointer',
                      background: drawerTab===id ? C.accent : `${C.accent}22`,
                      color: drawerTab===id ? '#fff' : C.accent }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Contenido scrollable */}
            <div style={{ flex:1, overflowY:'auto', padding:'14px 16px' }}>

              {/* ── Tab: Movimientos ── */}
              {drawerTab === 'movimientos' && (() => {
                // Input de subida siempre montado (para poder reemplazar mayor existente)
                const inputMayor = canEdit && (
                  <input type="file" accept=".xls,.xlsx" ref={mayorDrawerUploadRef}
                    style={{ display:'none' }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      e.target.value = '';
                      setMayorDrawerCargando(true);
                      try {
                        const movimientos = await parsearMayor(file);
                        await dbSaveMayor({
                          empresa, anio, movimientos,
                          guardadoPor: usuarioActual?.email || '',
                        });
                        const val = await dbLoadMayor(empresa, anio, empresasPermitidas);
                        setMayorDrawer(val);
                      } catch(err) {
                        alert('Error cargando mayor: ' + err.message);
                      } finally {
                        setMayorDrawerCargando(false);
                      }
                    }}
                  />
                );
                if (mayorDrawerCargando) {
                  return <div style={{ fontSize:12, color:C.muted }}>Cargando mayor...</div>;
                }
                if (!mayorDrawer) {
                  return (
                    <div>
                      {inputMayor}
                      <div style={{ fontSize:12, color:C.muted, marginBottom:10 }}>
                        No hay libro mayor cargado para {empresa} {anio}.
                      </div>
                      {canEdit && (
                        <Btn color={C.accent} onClick={() => mayorDrawerUploadRef.current?.click()}>
                          Cargar libro mayor (.xls/.xlsx)
                        </Btn>
                      )}
                    </div>
                  );
                }
                if (drawerMovimientos.length === 0) {
                  return (
                    <div style={{ fontSize:12, color:C.muted }}>
                      {inputMayor}
                      Sin movimientos para {cuentaSeleccionada.codigo} en {anio}.
                      <div style={{ fontSize:10, color:C.muted, marginTop:4, marginBottom:8 }}>
                        Mayor cargado: {mayorDrawer.totalMovimientos?.toLocaleString('es-CL')} movimientos totales.
                      </div>
                      {canEdit && (
                        <Btn small onClick={() => mayorDrawerUploadRef.current?.click()}>
                          Reemplazar mayor
                        </Btn>
                      )}
                    </div>
                  );
                }
                return (
                  <div style={{ overflowX:'auto' }}>
                    {inputMayor}
                    <div style={{ fontSize:10, color:C.muted, marginBottom:6,
                      display:'flex', alignItems:'center', gap:10 }}>
                      <span>{drawerMovimientos.length} movimiento{drawerMovimientos.length!==1?'s':''} en {anio}</span>
                      {canEdit && (
                        <Btn small onClick={() => mayorDrawerUploadRef.current?.click()}>
                          Reemplazar mayor
                        </Btn>
                      )}
                    </div>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
                      <thead>
                        <tr style={{ background:C.primary }}>
                          {['Fecha','Glosa','Debe','Haber','Saldo'].map(h => (
                            <th key={h} style={{ padding:'3px 6px', textAlign:
                              ['Debe','Haber','Saldo'].includes(h)?'right':'left',
                              color:C.primaryText, fontWeight:700,
                              whiteSpace:'nowrap', fontSize:9 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {drawerMovimientos.map((m, i) => (
                          <tr key={i} style={{ background:i%2===0?C.bg:C.bg2,
                            borderBottom:`1px solid ${C.border}11` }}>
                            <td style={{ padding:'3px 6px', whiteSpace:'nowrap',
                              color:C.muted }}>{m.fecha}</td>
                            <td style={{ padding:'3px 6px', maxWidth:160,
                              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                              title={m.glosa}>{m.glosa || '—'}</td>
                            <td style={{ padding:'3px 6px', textAlign:'right',
                              color: m.debe>0 ? C.text : C.muted2 }}>
                              {m.debe > 0 ? fmtMonto(m.debe,2) : '—'}
                            </td>
                            <td style={{ padding:'3px 6px', textAlign:'right',
                              color: m.haber>0 ? C.text : C.muted2 }}>
                              {m.haber > 0 ? fmtMonto(m.haber,2) : '—'}
                            </td>
                            <td style={{ padding:'3px 6px', textAlign:'right', color:C.muted}}>
                              {m.saldo != null ? fmtMonto(m.saldo,2) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              {/* ── Tab: Análisis manual ── */}
              {drawerTab === 'analisis' && (
                <>
                  <div style={{ fontSize:11, color:C.muted, marginBottom:8 }}>
                    Saldo cuenta (YTD): <strong style={{ color:C.text }}>{fmtMonto(drawerSaldoRef,2)}</strong>
                    {drawerAnalisisItems.length > 0 && (
                      <span style={{ marginLeft:14 }}>
                        Suma líneas: <strong style={{ color:C.text }}>{fmtMonto(drawerSuma,2)}</strong>
                      </span>
                    )}
                  </div>

                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, marginBottom:10 }}>
                    <thead>
                      <tr style={{ background:C.primary }}>
                        <th style={{ padding:'3px 6px', textAlign:'left', fontSize:10, color:C.primaryText,
                          width:'46%' }}>Descripción</th>
                        <th style={{ padding:'3px 6px', textAlign:'right', fontSize:10, color:C.primaryText,
                          width:'20%' }}>Monto</th>
                        <th style={{ padding:'3px 6px', textAlign:'left', fontSize:10, color:C.primaryText,
                          width:'27%' }}>Nota</th>
                        <th style={{ width:'7%' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {drawerAnalisisItems.map((item, idx) => (
                        <tr key={item._id ?? idx}>
                          <td style={{ padding:'2px 3px' }}>
                            <input value={item.descripcion||''}
                              onChange={e => setDrawerAnalisisItems(prev =>
                                prev.map((x,i)=>i===idx?{...x,descripcion:e.target.value}:x))}
                              disabled={!canEdit}
                              placeholder="Descripción..."
                              style={{ width:'100%', background:C.bg, color:C.text,
                                border:`1px solid ${C.border}`, borderRadius:3,
                                padding:'2px 5px', fontSize:11 }} />
                          </td>
                          <td style={{ padding:'2px 3px' }}>
                            <input value={item.monto??''}
                              onChange={e => setDrawerAnalisisItems(prev =>
                                prev.map((x,i)=>i===idx?{...x,monto:e.target.value}:x))}
                              disabled={!canEdit}
                              placeholder="0"
                              style={{ width:'100%', background:C.bg, color:C.text,
                                border:`1px solid ${C.border}`, borderRadius:3,
                                padding:'2px 5px', fontSize:11, textAlign:'right' }} />
                          </td>
                          <td style={{ padding:'2px 3px' }}>
                            <input value={item.nota||''}
                              onChange={e => setDrawerAnalisisItems(prev =>
                                prev.map((x,i)=>i===idx?{...x,nota:e.target.value}:x))}
                              disabled={!canEdit}
                              placeholder="Nota..."
                              style={{ width:'100%', background:C.bg, color:C.text,
                                border:`1px solid ${C.border}`, borderRadius:3,
                                padding:'2px 5px', fontSize:11 }} />
                          </td>
                          <td style={{ padding:'2px 3px', textAlign:'center' }}>
                            {canEdit && (
                              <button onClick={() => setDrawerAnalisisItems(prev=>prev.filter((_,i)=>i!==idx))}
                                style={{ background:'none', border:'none', color:C.red,
                                  cursor:'pointer', fontSize:15, lineHeight:1 }}>×</button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {drawerAnalisisItems.length === 0 && (
                        <tr><td colSpan={4} style={{ padding:'8px 6px', color:C.muted,
                          fontSize:10, fontStyle:'italic' }}>
                          Sin líneas.{canEdit ? ' Agrega una para comenzar.' : ''}
                        </td></tr>
                      )}
                    </tbody>
                  </table>

                  {canEdit && (
                    <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                      <Btn small color={C.muted2}
                        onClick={() => setDrawerAnalisisItems(prev=>[
                          ...prev, {_id:Date.now(), descripcion:'', monto:'', nota:''}])}>
                        + Línea
                      </Btn>
                      <Btn small color={C.purple} disabled={drawerAnalisisGuard}
                        onClick={async () => {
                          setDrawerAnalisisGuard(true); setDrawerAnalisisOk(false); setDrawerAnalisisError(null);
                          try {
                            const itemsClean = drawerAnalisisItems.map(({_id,...r})=>({
                              descripcion: r.descripcion||'',
                              monto: r.monto!==''&&r.monto!=null ? parseFloat(r.monto)||0 : null,
                              nota: r.nota||'',
                            }));
                            await guardarComposicionCuenta({
                              empresa, anio, mes,
                              codigoCuenta: cuentaSeleccionada.codigo,
                              items: itemsClean,
                              actualizadoPor: usuarioActual?.email||'',
                            });
                            // Actualizar en memoria
                            const composicion = {
                              items: itemsClean,
                              actualizadoPor: usuarioActual?.email||'',
                              fechaActualizacion: new Date().toISOString(),
                            };
                            setEeffData(prev => {
                              if (!prev) return prev;
                              const patch = list => list?.map(c =>
                                normalizeCodigo(c.codigo)===normalizeCodigo(cuentaSeleccionada.codigo)
                                  ? {...c, composicion} : c);
                              if (prev.cuentas_ytd) return {...prev, cuentas_ytd:patch(prev.cuentas_ytd)};
                              return {...prev, cuentas:patch(prev.cuentas)};
                            });
                            setCuentaSeleccionada(prev => prev ? {...prev, composicion} : prev);
                            setDrawerAnalisisOk(true);
                          } catch(err) {
                            setDrawerAnalisisError(err.message);
                          } finally {
                            setDrawerAnalisisGuard(false);
                          }
                        }}>
                        {drawerAnalisisGuard ? 'Guardando...' : 'Guardar'}
                      </Btn>
                      {drawerAnalisisOk && <span style={{fontSize:11,color:C.green}}>Guardado OK</span>}
                      {drawerAnalisisError && <span style={{fontSize:11,color:C.red}}>{drawerAnalisisError}</span>}
                    </div>
                  )}
                </>
              )}

              {/* ── Tab: Auxiliar (Parte 3+4) ── */}
              {drawerTab === 'auxiliar' && (() => {
                if (!drawerAuxiliar) return null;
                if (!mayorDrawer) return (
                  <div style={{ fontSize:12, color:C.muted }}>
                    Carga primero el libro mayor para ver el auxiliar.
                  </div>
                );
                const { filas, cobertura, labelSaldo, totales, hayVencimiento } = drawerAuxiliar;
                const difVsEEFF = Math.abs(totales.saldo - Math.abs(drawerSaldoRef));
                const cols = hayVencimiento
                  ? '1fr 72px 72px 80px 72px'
                  : '1fr 72px 72px 80px';

                return (
                  <div>
                    {/* Cobertura + Export */}
                    <div style={{ fontSize:10, color:C.muted, marginBottom:8,
                      display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                      <span>
                        {cobertura.conRut.toLocaleString('es-CL')} / {cobertura.total.toLocaleString('es-CL')} mov. con RUT{' '}
                        <strong style={{ color: cobertura.pct>=90?C.green : cobertura.pct>=70?C.yellow : C.red }}>
                          ({cobertura.pct}%)
                        </strong>
                      </span>
                      <span style={{ color:C.muted2 }}>YTD {NOMBRES_MES[mes]} {anio}</span>
                      <Btn onClick={handleExportarAuxiliar} color={C.green} small>
                        Exportar XLSX
                      </Btn>
                    </div>

                    {/* Conciliación vs saldo EEFF */}
                    {difVsEEFF > 1 && (
                      <div style={{ fontSize:9, color:C.yellow, marginBottom:6, padding:'3px 8px',
                        background:`${C.yellow}14`, borderRadius:5 }}>
                        Diferencia vs saldo EEFF: {fmtMonto(difVsEEFF, 2)} (mov. sin RUT o fuera del período)
                      </div>
                    )}

                    {filas.length === 0 ? (
                      <div style={{ fontSize:11, color:C.muted }}>Sin movimientos YTD.</div>
                    ) : (
                      <div>
                        {/* Cabecera */}
                        <div style={{ display:'grid', gridTemplateColumns:cols,
                          padding:'4px 6px', background:C.primary, borderRadius:'5px 5px 0 0',
                          fontSize:9, fontWeight:700, color:C.primaryText }}>
                          <span>Tercero</span>
                          <span style={{ textAlign:'right' }}>Debe</span>
                          <span style={{ textAlign:'right' }}>Haber</span>
                          <span style={{ textAlign:'right' }}>{labelSaldo}</span>
                          {hayVencimiento && <span style={{ textAlign:'right', color:`${C.red}cc` }}>Vencido</span>}
                        </div>

                        {/* Filas */}
                        {filas.map(f => {
                          const key   = f.rutNorm || '__sin_rut__';
                          const expanded  = auxExpandedRuts.has(key);
                          const editando  = auxNombreEdit?.rut === f.rutNorm;
                          const saldoCol  = f.saldo > 0.005 ? C.text : f.saldo < -0.005 ? C.red : C.muted;
                          const sinNombre = f.rutNorm && !f.nombre;
                          return (
                            <div key={key} style={{ marginBottom:1 }}>
                              {/* Fila resumen */}
                              <div style={{ display:'grid', gridTemplateColumns:cols,
                                padding:'5px 6px', cursor:'pointer',
                                background: expanded ? `${C.accent}14` : 'transparent',
                                border:`1px solid ${expanded ? C.accent+'44' : C.border+'44'}`,
                                borderRadius: expanded ? '4px 4px 0 0' : 4,
                                transition:'background 0.1s' }}
                                onClick={() => setAuxExpandedRuts(prev => {
                                  const s = new Set(prev); s.has(key)?s.delete(key):s.add(key); return s;
                                })}>
                                <div style={{ minWidth:0 }} onClick={e => e.stopPropagation()}>
                                  <div style={{ fontSize:10, fontWeight:600, color:C.text,
                                    display:'flex', alignItems:'center', gap:4 }}>
                                    <span style={{ cursor:'pointer' }}
                                      onClick={() => setAuxExpandedRuts(prev => {
                                        const s = new Set(prev); s.has(key)?s.delete(key):s.add(key); return s;
                                      })}>
                                      {expanded ? '▼' : '▶'}
                                    </span>
                                    {editando ? (
                                      <input value={auxNombreEdit.nombre} autoFocus
                                        onClick={e => e.stopPropagation()}
                                        onChange={e => setAuxNombreEdit(p => ({...p, nombre: e.target.value}))}
                                        onKeyDown={e => { if(e.key==='Enter') handleGuardarAuxNombre(); if(e.key==='Escape') setAuxNombreEdit(null); }}
                                        style={{ padding:'1px 6px', borderRadius:4, background:C.bg, color:C.text,
                                          border:`1px solid ${C.accent}`, fontSize:10, width:160 }}
                                      />
                                    ) : (
                                      <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                                        color: !f.rutNorm ? C.muted2 : sinNombre ? C.yellow : C.text }}>
                                        {f.nombre || (f.rutNorm ? '(sin nombre)' : 'Sin RUT')}
                                      </span>
                                    )}
                                    {editando ? (
                                      <>
                                        <button onClick={e=>{e.stopPropagation();handleGuardarAuxNombre();}}
                                          style={{ background:C.green, border:'none', color:'#fff', borderRadius:3,
                                            fontSize:9, padding:'1px 6px', cursor:'pointer' }}>OK</button>
                                        <button onClick={e=>{e.stopPropagation();setAuxNombreEdit(null);}}
                                          style={{ background:'none', border:`1px solid ${C.border}`, color:C.muted,
                                            borderRadius:3, fontSize:9, padding:'1px 5px', cursor:'pointer' }}>✕</button>
                                      </>
                                    ) : sinNombre && (
                                      <button onClick={e=>{e.stopPropagation();setAuxNombreEdit({rut:f.rutNorm,nombre:''}); }}
                                        title="Asignar nombre"
                                        style={{ background:'none', border:`1px solid ${C.yellow}`, color:C.yellow,
                                          borderRadius:3, fontSize:8, padding:'1px 5px', cursor:'pointer', flexShrink:0 }}>
                                        + nombre
                                      </button>
                                    )}
                                  </div>
                                  {f.rutNorm && (
                                    <div style={{ fontSize:9, color:C.muted, fontFamily:'monospace', marginLeft:16 }}>
                                      {f.rutNorm} · {f.movs.length} mov.
                                    </div>
                                  )}
                                </div>
                                <div style={{ textAlign:'right', fontSize:10, color:C.muted, alignSelf:'center' }}>
                                  {fmtMonto(f.debe, 0)}
                                </div>
                                <div style={{ textAlign:'right', fontSize:10, color:C.muted, alignSelf:'center' }}>
                                  {fmtMonto(f.haber, 0)}
                                </div>
                                <div style={{ textAlign:'right', fontSize:11, fontWeight:700, color:saldoCol, alignSelf:'center' }}>
                                  {fmtMonto(Math.abs(f.saldo), 0)}
                                  {f.saldo < -0.005 && <span style={{ fontSize:8, marginLeft:2 }}>CR</span>}
                                </div>
                                {hayVencimiento && (
                                  <div style={{ textAlign:'right', fontSize:10, fontWeight:600, alignSelf:'center',
                                    color: f.vencido > 0.005 ? C.red : C.muted2 }}>
                                    {f.vencido > 0.005 ? fmtMonto(f.vencido, 0) : '—'}
                                  </div>
                                )}
                              </div>

                              {/* Movimientos expandidos */}
                              {expanded && (
                                <div style={{ marginBottom:4, borderLeft:`2px solid ${C.accent}44`,
                                  marginLeft:8, paddingLeft:8, background:`${C.accent}06` }}>
                                  {f.movs.map((m, i) => (
                                    <div key={i} style={{ display:'grid',
                                      gridTemplateColumns: hayVencimiento ? '78px 1fr 56px 56px 70px' : '78px 1fr 64px 64px',
                                      gap:4, padding:'3px 2px', fontSize:9,
                                      borderBottom:`1px solid ${C.border}22`, color:C.muted }}>
                                      <span style={{ whiteSpace:'nowrap' }}>{m.fecha}</span>
                                      <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                                        title={m.glosa}>{m.glosa || '—'}</span>
                                      <span style={{ textAlign:'right', color: m.debe>0?C.text:C.muted2 }}>
                                        {m.debe>0 ? fmtMonto(m.debe,0) : '—'}
                                      </span>
                                      <span style={{ textAlign:'right', color: m.haber>0?C.text:C.muted2 }}>
                                        {m.haber>0 ? fmtMonto(m.haber,0) : '—'}
                                      </span>
                                      {hayVencimiento && (
                                        <span style={{ textAlign:'right',
                                          color: m.vencimiento && m.vencimiento < new Date().toISOString().substring(0,10)
                                            ? C.red : C.muted2 }}>
                                          {m.vencimiento || '—'}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Fila de totales */}
                        <div style={{ display:'grid', gridTemplateColumns:cols,
                          padding:'6px 6px', background:C.primary,
                          borderRadius:'0 0 5px 5px', marginTop:2,
                          fontSize:10, fontWeight:800, color:C.primaryText }}>
                          <span>TOTAL</span>
                          <span style={{ textAlign:'right' }}>{fmtMonto(totales.debe, 0)}</span>
                          <span style={{ textAlign:'right' }}>{fmtMonto(totales.haber, 0)}</span>
                          <span style={{ textAlign:'right',
                            color: totales.saldo > 0.005 ? C.green : totales.saldo < -0.005 ? C.red : C.primaryText }}>
                            {fmtMonto(Math.abs(totales.saldo), 0)}
                          </span>
                          {hayVencimiento && (
                            <span style={{ textAlign:'right',
                              color: totales.vencido > 0.005 ? C.red : C.primaryText }}>
                              {totales.vencido > 0.005 ? fmtMonto(totales.vencido, 0) : '—'}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

            </div>
          </div>
        </>
      )}

      {/* ── Análisis Financiero ── */}
      {vistaModulo === 'analisis' && (
        <AnfTab canEdit={canEdit} usuarioActual={usuarioActual} />
      )}

    </div>
  );
}
