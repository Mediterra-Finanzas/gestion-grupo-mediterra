/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useCallback, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════════
// TIEMPO: Mar-26 → Jun-31 (65 meses)
// ═══════════════════════════════════════════════════════════════════
const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function generarMeses() {
  const out = [];
  let y = 2026, m = 2;
  while (!(y === 2031 && m === 6)) {
    out.push({ label:`${MN[m]}-${String(y).slice(2)}`, y, m, idx:out.length });
    m++; if (m > 11) { m = 0; y++; }
  }
  out.push({ label:'Jun-31', y:2031, m:5, idx:out.length });
  return out;
}

const MESES_INFO = generarMeses();
const MESES_65   = MESES_INFO.map(x => x.label);
function seasonOf(mo) { return mo.m >= 6 ? mo.y : mo.y - 1; }

const SEASONS = (() => {
  const map = {};
  MESES_INFO.forEach(mo => {
    const sy  = seasonOf(mo);
    const key = `${sy}-${sy+1}`;
    if (!map[key]) map[key] = { key, sy, label:`Temporada ${sy}-${sy+1}`, indices:[], months:[] };
    map[key].indices.push(mo.idx);
    map[key].months.push(mo.label);
  });
  return Object.values(map);
})();
const SEASON_KEYS = SEASONS.map(s => s.key);

const SEMANAS_MES = {
  "Mar-26":["S11","S12","S13"],"Apr-26":["S14","S15","S16","S17"],
  "May-26":["S18","S19","S20","S21"],"Jun-26":["S22","S23","S24","S25"],
  "Jul-26":["S27","S28","S29","S30"],"Aug-26":["S31","S32","S33","S34"],
  "Sep-26":["S36","S37","S38","S39"],"Oct-26":["S40","S41","S42","S43"],
  "Nov-26":["S44","S45","S46","S47"],"Dec-26":["S48","S49","S50","S51"],
  "Jan-27":["S01","S02","S03","S04"],"Feb-27":["S05","S06","S07","S08"],
  "Mar-27":["S09","S10","S11","S12"],"Apr-27":["S13","S14","S15","S16"],
  "May-27":["S17","S18","S19","S20"],"Jun-27":["S21","S22","S23","S24"],
  "Jul-27":["S27","S28","S29","S30"],"Aug-27":["S31","S32","S33","S34"],
  "Sep-27":["S36","S37","S38","S39"],"Oct-27":["S40","S41","S42","S43"],
  "Nov-27":["S44","S45","S46","S47"],"Dec-27":["S48","S49","S50","S51"],
};

const Z65  = () => Array(65).fill(0);
function ext(arr) { const r=[...(arr||[])]; while(r.length<65) r.push(0); return r; }
function mIdx(label) { return MESES_65.indexOf(label); }

// ═══════════════════════════════════════════════════════════════════
// SUPABASE
// ═══════════════════════════════════════════════════════════════════
const SUPA_URL = "https://bywovqayuzodbzwsriet.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5d292cWF5dXpvZGJ6d3NyaWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODU1MDgsImV4cCI6MjA5MTI2MTUwOH0.s2x2O_CxE6rl8dBqFuyfQdMyRqSyjJQWXJXesmVGXtk";

async function dbLoad() {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/finanzas_real?id=eq.main&select=value`,
      { headers:{ apikey:SUPA_KEY, Authorization:`Bearer ${SUPA_KEY}` }});
    const d = await r.json();
    return d?.[0]?.value ? JSON.parse(d[0].value) : {};
  } catch { return {}; }
}
async function dbSave(data) {
  try {
    await fetch(`${SUPA_URL}/rest/v1/finanzas_real`, {
      method:"POST",
      headers:{ apikey:SUPA_KEY, Authorization:`Bearer ${SUPA_KEY}`,
        "Content-Type":"application/json", "Prefer":"resolution=merge-duplicates" },
      body: JSON.stringify({ id:"main", value:JSON.stringify(data) })
    });
    return true;
  } catch { return false; }
}

// ═══════════════════════════════════════════════════════════════════
// PARÁMETROS ALLEGRIA FOODS
// ═══════════════════════════════════════════════════════════════════
const FRUTAS      = ['cerezas','ciruelas','arandanos'];
const FRUTA_LABEL = { cerezas:'Cerezas', ciruelas:'Ciruelas', arandanos:'Arándanos' };
const FRUTA_EMOJI = { cerezas:'🍒', ciruelas:'🟣', arandanos:'🫐' };

function defaultFruta() {
  return {
    kg:0, fob_usd_kg:0, desc_exp_pct:8,
    anticipos_cliente:[],
    mes_liquidacion:'',
    anticipos_productor:[],
    mes_saldo_productor:'',
    mat_usd_kg:0,
    srv_usd_kg:0,
    dist_mat:[],
    dist_srv:[],
  };
}

function defaultParams() {
  const p = {};
  SEASON_KEYS.forEach(sk => {
    p[sk] = {};
    FRUTAS.forEach(f => { p[sk][f] = defaultFruta(); });
  });
  return p;
}

// ── Parámetros genéricos para cualquier empresa ───────────────────
// Un "producto" es cualquier línea de ingreso con sus propios
// parámetros: unidades, precio, descuento, anticipos, materiales, servicios
function defaultProducto() {
  return {
    nombre:"",
    emoji:"📦",
    unidades:0,           // cantidad (kg, unidades, há, etc.)
    unidad_label:"unid.", // etiqueta de la unidad
    precio_unit:0,        // precio unitario (USD / unidad)
    desc_pct:0,           // descuento intermediario %
    mat_unit:0,           // materiales USD / unidad
    srv_unit:0,           // servicios USD / unidad
    anticipos_cliente:[],
    mes_liquidacion:"",
    anticipos_productor:[],
    mes_saldo_productor:"",
    dist_mat:[],
    dist_srv:[],
  };
}

function defaultParamsEmp() {
  // Estructura: { seasonKey: { productoId: defaultProducto() } }
  const p = {};
  SEASON_KEYS.forEach(sk => { p[sk] = {}; });
  return p;
}

// Convierte los params genéricos en arrays de proyección Z65
// para las líneas de una empresa
function calcParamsEmp(paramsEmp, lineLabel) {
  const ing  = Z65();
  const cost = Z65();
  const mat  = Z65();
  const srv  = Z65();

  SEASON_KEYS.forEach(sk => {
    const season = paramsEmp?.[sk] || {};
    Object.values(season).forEach(p => {
      if(!p || p.nombre !== lineLabel) return;
      const u   = Number(p.unidades)||0;
      const pr  = Number(p.precio_unit)||0;
      const desc= (Number(p.desc_pct)||0)/100;
      const mU  = Number(p.mat_unit)||0;
      const sU  = Number(p.srv_unit)||0;
      if(u===0||pr===0) return;

      // Ingresos cliente
      let antIngTot=0;
      (p.anticipos_cliente||[]).forEach(a=>{
        const i=mIdx(a.mes); if(i<0) return;
        const v=(Number(a.usd_unit)||0)*u;
        ing[i]+=v; antIngTot+=v;
      });
      if(p.mes_liquidacion){
        const i=mIdx(p.mes_liquidacion);
        if(i>=0) ing[i]+=Math.max(0,u*pr-antIngTot);
      }

      // Costo proveedor
      const pNeto=Math.max(0,pr*(1-desc)-mU-sU);
      let antCostTot=0;
      (p.anticipos_productor||[]).forEach(a=>{
        const i=mIdx(a.mes); if(i<0) return;
        const v=(Number(a.usd_unit)||0)*u;
        cost[i]+=v; antCostTot+=v;
      });
      if(p.mes_saldo_productor){
        const i=mIdx(p.mes_saldo_productor);
        if(i>=0){const s=u*pNeto-antCostTot; if(s>0) cost[i]+=s;}
      }

      // Materiales
      const totM=u*mU;
      if(totM>0)(p.dist_mat||[]).forEach(d=>{
        const i=mIdx(d.mes); if(i<0) return;
        mat[i]+=totM*((Number(d.pct)||0)/100);
      });

      // Servicios
      const totS=u*sU;
      if(totS>0)(p.dist_srv||[]).forEach(d=>{
        const i=mIdx(d.mes); if(i<0) return;
        srv[i]+=totS*((Number(d.pct)||0)/100);
      });
    });
  });
  return {ing,cost,mat,srv};
}

// ═══════════════════════════════════════════════════════════════════
// MOTOR FÓRMULAS — Allegria Foods
// ═══════════════════════════════════════════════════════════════════
function calcAllegria(params) {
  const ing  = { cerezas:Z65(), ciruelas:Z65(), arandanos:Z65() };
  const cost = { cerezas:Z65(), ciruelas:Z65(), arandanos:Z65() };
  const mat  = { cerezas:Z65(), ciruelas:Z65(), arandanos:Z65() };
  const srv  = { cerezas:Z65(), ciruelas:Z65(), arandanos:Z65() };
  SEASON_KEYS.forEach(sk => {
    if (!params?.[sk]) return;
    FRUTAS.forEach(f => {
      const p   = params[sk]?.[f];
      if (!p) return;
      const kg      = Number(p.kg)||0;
      const fob     = Number(p.fob_usd_kg)||0;
      const desc    = (Number(p.desc_exp_pct)||0)/100;
      const matUsd  = Number(p.mat_usd_kg)||0;
      const srvUsd  = Number(p.srv_usd_kg)||0;
      if (kg===0||fob===0) return;
      let totalAntIng = 0;
      (p.anticipos_cliente||[]).forEach(a => {
        const i = mIdx(a.mes); if(i<0) return;
        const v = (Number(a.usd_kg)||0)*kg;
        ing[f][i] += v; totalAntIng += v;
      });
      if (p.mes_liquidacion) {
        const i = mIdx(p.mes_liquidacion);
        if (i>=0) ing[f][i] += Math.max(0, kg*fob - totalAntIng);
      }
      const precioNetoProd = Math.max(0, fob*(1-desc) - matUsd - srvUsd);
      let totalAntProd = 0;
      (p.anticipos_productor||[]).forEach(a => {
        const i = mIdx(a.mes); if(i<0) return;
        const v = (Number(a.usd_kg)||0)*kg;
        cost[f][i] += v; totalAntProd += v;
      });
      if (p.mes_saldo_productor) {
        const i = mIdx(p.mes_saldo_productor);
        if (i>=0) { const s = kg*precioNetoProd - totalAntProd; if(s>0) cost[f][i] += s; }
      }
      const totalMat = kg * matUsd;
      if (totalMat > 0) {
        (p.dist_mat||[]).forEach(d => {
          const i = mIdx(d.mes); if(i<0) return;
          mat[f][i] += totalMat * ((Number(d.pct)||0)/100);
        });
      }
      const totalSrv = kg * srvUsd;
      if (totalSrv > 0) {
        (p.dist_srv||[]).forEach(d => {
          const i = mIdx(d.mes); if(i<0) return;
          srv[f][i] += totalSrv * ((Number(d.pct)||0)/100);
        });
      }
    });
  });
  return { ing, cost, mat, srv };
}

// ═══════════════════════════════════════════════════════════════════
// EMPRESAS ESTÁTICAS
// ═══════════════════════════════════════════════════════════════════
const EMPRESAS_STATIC = {
  "Mediterra": {
    emoji:"🏢", color:"#1d4ed8", saldo_ini:3601, desc:"Holding · Inversiones Mediterra SpA",
    sections:[
      { cat:"ing_op", label:"Ingresos Operacionales", signo:1, lines:[
        {label:"Fee Administración / Otros Ingresos", proy:ext([0,80000,80000,80000,87500,87500,87500,87500,87500,87500,87500,87500,87500,87500,87500,87500,87500,87500,87500,87500,87500,87500,87500,87500])},
        {label:"Cuentas por Cobrar", proy:Z65()},
      ]},
      { cat:"egr_fijo", label:"Costos Fijos / SG&A", signo:-1, lines:[
        {label:"Remuneración Administración", proy:ext(Array(24).fill(50000))},
        {label:"Fee Administración", proy:Z65()},
        {label:"Arriendo Oficina", proy:Z65()},
        {label:"Gastos Legales", proy:Z65()},
        {label:"Gastos Viajes Nacionales", proy:Z65()},
        {label:"Gastos Viajes Internacionales", proy:Z65()},
        {label:"Alojamiento", proy:Z65()},
      ]},
      { cat:"egr_nop", label:"Egresos No Operacionales", signo:-1, lines:[
        {label:"Pago Préstamos - Total", proy:ext([32000,32000,32000,131300,32000,32000,101300,32000,32000,101300,32000,32000,101300,32000,32000,101300,0,0,0,0,0,0,0,0])},
        {label:"Leyes Sociales Laborales", proy:Z65()},
        {label:"Pago F-29", proy:Z65()},
      ]},
    ],
  },
  "Allegria Service": {
    emoji:"🏭", color:"#92400e", saldo_ini:5519, desc:"Procesamiento · Packing",
    sections:[
      { cat:"ing_op", label:"Ingresos Operacionales", signo:1, lines:[
        {label:"Proceso de Cerezas",   proy:ext([0,0,0,0,0,0,0,0,0,240000,240000,0,1048000,0,0,240000,0,0,0,0,240000,0,0,240000])},
        {label:"Procesos de Ciruelas", proy:Z65()},
        {label:"Cuentas por Cobrar",   proy:Z65()},
      ]},
      { cat:"egr_var", label:"Costos Variables", signo:-1, lines:[
        {label:"Costo Directo Variable de Proceso", proy:Z65()},
      ]},
      { cat:"egr_fijo", label:"Costos Fijos / SG&A", signo:-1, lines:[
        {label:"Remuneración Administración", proy:Z65()},
        {label:"Fee Administración", proy:Z65()},
        {label:"Gastos Legales", proy:Z65()},
      ]},
      { cat:"egr_nop", label:"Egresos No Operacionales", signo:-1, lines:[
        {label:"Pago Leasing BCI", proy:Z65()},
        {label:"Leyes Sociales Laborales", proy:Z65()},
      ]},
    ],
  },
  "Frisku Foods": {
    emoji:"🚢", color:"#0e7490", saldo_ini:132828, desc:"Carga contenedores · Logística",
    sections:[
      { cat:"ing_op", label:"Ingresos Operacionales", signo:1, lines:[
        {label:"Ingreso Carga Contenedores", proy:ext([0,0,0,0,50500,35350,101000,50500,35350,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0])},
        {label:"Otros Ingresos", proy:Z65()},
        {label:"Cuentas por Cobrar", proy:Z65()},
      ]},
      { cat:"egr_var", label:"Costos Variables", signo:-1, lines:[
        {label:"Costo Directo Variable", proy:Z65()},
      ]},
      { cat:"egr_fijo", label:"Costos Fijos / SG&A", signo:-1, lines:[
        {label:"Remuneración Administración", proy:ext(Array(24).fill(25274))},
        {label:"Fee Administración", proy:Z65()},
        {label:"Gastos Legales", proy:Z65()},
      ]},
      { cat:"egr_nop", label:"Egresos No Operacionales", signo:-1, lines:[
        {label:"Banco Security (cuotas)", proy:ext([0,109857,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0])},
        {label:"Banco BICE (bullet)", proy:Z65()},
        {label:"Leyes Sociales Laborales", proy:Z65()},
      ]},
    ],
  },
  "Frisku Peru": {
    emoji:"🇵🇪", color:"#6d28d9", saldo_ini:1251, desc:"Operaciones · Perú",
    sections:[
      { cat:"ing_op", label:"Ingresos Operacionales", signo:1, lines:[
        {label:"Otros Ingresos Operacionales", proy:Z65()},
        {label:"Cuentas por Cobrar", proy:Z65()},
      ]},
      { cat:"egr_var", label:"Costos Variables", signo:-1, lines:[
        {label:"Costos Variables Operacionales", proy:Z65()},
      ]},
      { cat:"egr_fijo", label:"Costos Fijos / SG&A", signo:-1, lines:[
        {label:"Remuneración Administración", proy:Z65()},
        {label:"Fee Administración", proy:Z65()},
        {label:"Gastos Legales", proy:Z65()},
      ]},
    ],
  },
  "Allpa Farms": {
    emoji:"🌸", color:"#dc2626", saldo_ini:1828, desc:"Farming cerezas · Chile",
    sections:[
      { cat:"ing_op", label:"Ingresos Operacionales", signo:1, lines:[
        {label:"Ingreso Exportación Cerezas", proy:ext([0,0,0,0,0,0,0,0,152312,304624,0,0,913872,0,0,304624,0,0,0,0,320000,576000,0,0])},
        {label:"Ingreso Cerezas Nacionales",  proy:Z65()},
        {label:"Otros Ingresos",              proy:Z65()},
        {label:"Cuentas por Cobrar",          proy:Z65()},
      ]},
      { cat:"egr_var", label:"Costos Variables", signo:-1, lines:[
        {label:"Remuneración Cosecha",          proy:Z65()},
        {label:"Contratista Cosecha",           proy:Z65()},
        {label:"Transporte",                    proy:Z65()},
        {label:"Remuneración Operacional",      proy:Z65()},
        {label:"Electricidad",                  proy:Z65()},
        {label:"Servicio de Terceros",          proy:Z65()},
        {label:"Flete Nacional",                proy:Z65()},
        {label:"Mantención Máquinas y Equipos", proy:Z65()},
        {label:"Mantención Vehículos",          proy:Z65()},
        {label:"Mantención de Campo",           proy:Z65()},
      ]},
      { cat:"egr_fijo", label:"Costos Fijos / SG&A", signo:-1, lines:[
        {label:"Remuneración Administración", proy:ext([0,0,0,0,0,0,0,0,0,0,14400,14400,14400,14400,14400,14400,14400,14400,14400,14400,14400,14400,14400,14400])},
        {label:"Asesoría Técnica",   proy:Z65()},
        {label:"Arriendo Oficina",   proy:Z65()},
        {label:"Fee Administración", proy:ext([0,0,0,0,0,0,0,0,0,0,0,0,371696,0,0,0,0,0,0,0,0,0,0,0])},
      ]},
      { cat:"egr_nop", label:"Egresos No Operacionales", signo:-1, lines:[
        {label:"Banco de Chile (hipotecario)", proy:ext([0,0,0,476021,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0])},
        {label:"Leyes Sociales Laborales",    proy:Z65()},
      ]},
    ],
  },
  "Allpa Farms Perú": {
    emoji:"🫐", color:"#7c3aed", saldo_ini:208000, desc:"Farming arándanos · Perú",
    sections:[
      { cat:"ing_op", label:"Ingresos Operacionales", signo:1, lines:[
        {label:"Exportación Arándanos",    proy:Z65()},
        {label:"Venta Arándanos Nacional", proy:Z65()},
        {label:"Otros Ingresos",           proy:Z65()},
        {label:"Cuentas por Cobrar",       proy:Z65()},
      ]},
      { cat:"egr_var", label:"Costos Variables", signo:-1, lines:[
        {label:"Costo Fruta Exportación",        proy:Z65()},
        {label:"Materiales",                     proy:Z65()},
        {label:"Servicios de Packing",           proy:Z65()},
        {label:"Seguros Exportación",            proy:Z65()},
        {label:"Servicios Terceros Exportación", proy:Z65()},
        {label:"Arriendo Bodegas",               proy:Z65()},
      ]},
      { cat:"egr_fijo", label:"Costos Fijos / SG&A", signo:-1, lines:[
        {label:"Remuneración Administración", proy:Z65()},
        {label:"Fee Administración",          proy:Z65()},
        {label:"Gastos Legales",              proy:Z65()},
      ]},
    ],
  },
  "Integrity Farms": {
    emoji:"🌾", color:"#15803d", saldo_ini:604, desc:"Administración agrícola (US$2.000/há)",
    sections:[
      { cat:"ing_op", label:"Ingresos Operacionales", signo:1, lines:[
        {label:"Ingreso Administración (us$2.000/ha)", proy:ext([0,172000,0,0,0,0,0,0,0,0,172000,0,172000,0,172000,0,0,0,0,0,172000,0,172000,0])},
        {label:"Otros Ingresos",     proy:Z65()},
        {label:"Cuentas por Cobrar", proy:Z65()},
      ]},
      { cat:"egr_var", label:"Costos Variables", signo:-1, lines:[
        {label:"Costo Directo Variable", proy:Z65()},
      ]},
      { cat:"egr_fijo", label:"Costos Fijos / SG&A", signo:-1, lines:[
        {label:"Remuneración Administración", proy:Z65()},
        {label:"Arriendo Vehículos",          proy:Z65()},
        {label:"Arriendo Oficina",            proy:Z65()},
        {label:"Fee Administración",          proy:Z65()},
        {label:"Gastos Viajes Nacionales",    proy:Z65()},
      ]},
      { cat:"egr_nop", label:"Egresos No Operacionales", signo:-1, lines:[
        {label:"Pago Préstamos - Total",   proy:Z65()},
        {label:"Leyes Sociales Laborales", proy:Z65()},
      ]},
    ],
  },
  "Osiris": {
    emoji:"🌱", color:"#0f766e", saldo_ini:40188, desc:"Royalties · Fee Viveros · Osiris Plant Mgmt",
    sections:[
      { cat:"ing_op", label:"Ingresos Operacionales", signo:1, lines:[
        {label:"Royalty por Planta",  proy:ext([0,0,0,0,0,0,0,0,1100000,0,0,0,2200000,0,0,1100000,0,0,0,0,1100000,1100000,0,0])},
        {label:"Royalty Comercial",   proy:Z65()},
        {label:"Fee Vivero",          proy:Z65()},
        {label:"Cuentas por Cobrar",  proy:Z65()},
      ]},
      { cat:"egr_var", label:"Costos Variables", signo:-1, lines:[
        {label:"Costo Directo Variable", proy:Z65()},
      ]},
      { cat:"egr_fijo", label:"Costos Fijos / SG&A", signo:-1, lines:[
        {label:"Remuneración Administración",   proy:Z65()},
        {label:"Arriendo Vehículos",            proy:Z65()},
        {label:"Arriendo Oficina",              proy:Z65()},
        {label:"Gastos Legales",                proy:Z65()},
        {label:"Fee Administración",            proy:Z65()},
        {label:"Gastos Viajes Nacionales",      proy:Z65()},
        {label:"Gastos Viajes Internacionales", proy:Z65()},
        {label:"Alojamiento",                   proy:Z65()},
      ]},
      { cat:"egr_nop", label:"Egresos No Operacionales", signo:-1, lines:[
        {label:"Banco Security (cuotas)", proy:ext([9178,9178,9178,9178,9178,9178,9178,9178,9178,9178,0,0,0,0,0,9178,0,0,0,0,0,0,0,0])},
        {label:"BCI (bullet Jun-26)",     proy:ext([0,0,0,355425,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0])},
        {label:"Leyes Sociales Laborales",proy:Z65()},
      ]},
    ],
  },
};

function buildAllegria(params) {
  const { ing, cost, mat, srv } = calcAllegria(params);
  return {
    emoji:"🍒", color:"#b91c1c", saldo_ini:17433, desc:"Exportación frutas · Chile", hasFormula:true,
    sections:[
      { cat:"ing_op", label:"Ingresos Operacionales", signo:1, lines:[
        {label:"Anticipo / Liquidación Cerezas",   proy:[...ing.cerezas],   formula:true},
        {label:"Anticipo / Liquidación Ciruelas",  proy:[...ing.ciruelas],  formula:true},
        {label:"Anticipo / Liquidación Arándanos", proy:[...ing.arandanos], formula:true},
        {label:"Otros Ingresos",                   proy:Z65()},
        {label:"Cuentas por Cobrar",               proy:Z65()},
      ]},
      { cat:"egr_var", label:"Costos Variables", signo:-1, lines:[
        {label:"Costo Fruta Cerezas",          proy:[...cost.cerezas],   formula:true},
        {label:"Costo Fruta Ciruelas",         proy:[...cost.ciruelas],  formula:true},
        {label:"Costo Fruta Arándanos",        proy:[...cost.arandanos], formula:true},
        {label:"Materiales Cerezas 🍒",        proy:[...mat.cerezas],    formula:true},
        {label:"Materiales Ciruelas 🟣",       proy:[...mat.ciruelas],   formula:true},
        {label:"Materiales Arándanos 🫐",      proy:[...mat.arandanos],  formula:true},
        {label:"Servicios Cerezas 🍒",         proy:[...srv.cerezas],    formula:true},
        {label:"Servicios Ciruelas 🟣",        proy:[...srv.ciruelas],   formula:true},
        {label:"Servicios Arándanos 🫐",       proy:[...srv.arandanos],  formula:true},
      ]},
      { cat:"egr_fijo", label:"Costos Fijos / SG&A", signo:-1, lines:[
        {label:"Remuneración Administración",   proy:Z65()},
        {label:"Arriendo Vehículos",            proy:Z65()},
        {label:"Gastos Legales",                proy:Z65()},
        {label:"Fee Administración",            proy:Z65()},
        {label:"Gastos Viajes Nacionales",      proy:Z65()},
        {label:"Gastos Viajes Internacionales", proy:Z65()},
      ]},
      { cat:"egr_nop", label:"Egresos No Operacionales", signo:-1, lines:[
        {label:"Pago Préstamos Bullet",    proy:ext([0,0,0,0,0,0,0,0,0,499864,0,783199,0,0,0,0,0,0,0,0,111001,0,0,0])},
        {label:"Leyes Sociales Laborales", proy:Z65()},
      ]},
    ],
  };
}

function buildEmpresas(params) {
  return { ...EMPRESAS_STATIC, "Allegria Foods": buildAllegria(params) };
}

// ═══════════════════════════════════════════════════════════════════
// CRÉDITOS
// ═══════════════════════════════════════════════════════════════════
const CREDITOS = [
  {n:1,empresa:"Allegria Foods",acreedor:"Zelun",tipo_inst:"Privado",monto:120000,f_venc:"2026-11-30",tipo_cr:"Bullet",tasa:"",cuota:120000},
  {n:2,empresa:"Allegria Foods",acreedor:"Yiannis",tipo_inst:"Privado",monto:117000,f_venc:"2026-11-30",tipo_cr:"Bullet",tasa:"",cuota:117000},
  {n:3,empresa:"Allegria Foods",acreedor:"Fresion",tipo_inst:"Privado",monto:136000,f_venc:"2026-11-30",tipo_cr:"Bullet",tasa:"",cuota:136000},
  {n:4,empresa:"Allegria Foods",acreedor:"Qupai",tipo_inst:"Privado",monto:76864,f_venc:"2026-11-30",tipo_cr:"Bullet",tasa:"",cuota:76864},
  {n:5,empresa:"Allegria Foods",acreedor:"China Smart",tipo_inst:"Privado",monto:50000,f_venc:"2026-11-30",tipo_cr:"Bullet",tasa:"",cuota:50000},
  {n:6,empresa:"Allegria Foods",acreedor:"Zelun",tipo_inst:"Privado",monto:70000,f_venc:"2027-05-31",tipo_cr:"Bullet",tasa:"",cuota:70000},
  {n:7,empresa:"Allegria Foods",acreedor:"Yiannis",tipo_inst:"Privado",monto:117000,f_venc:"2027-05-31",tipo_cr:"Bullet",tasa:"",cuota:117000},
  {n:8,empresa:"Allegria Foods",acreedor:"Fresion",tipo_inst:"Privado",monto:135000,f_venc:"2027-05-31",tipo_cr:"Bullet",tasa:"",cuota:135000},
  {n:9,empresa:"Allegria Foods",acreedor:"Qupai",tipo_inst:"Privado",monto:76864,f_venc:"2027-05-31",tipo_cr:"Bullet",tasa:"",cuota:76864},
  {n:10,empresa:"Allegria Foods",acreedor:"China Smart",tipo_inst:"Privado",monto:50000,f_venc:"2027-05-31",tipo_cr:"Bullet",tasa:"",cuota:50000},
  {n:11,empresa:"Allegria Foods",acreedor:"Banco BICE",tipo_inst:"Banco",monto:200000,f_venc:"2026-06-02",tipo_cr:"Bullet",tasa:"8.3%",cuota:200000},
  {n:12,empresa:"Allegria Foods",acreedor:"Banco Santander",tipo_inst:"Banco",monto:105000,f_venc:"2026-06-30",tipo_cr:"Bullet",tasa:"7.6%",cuota:105000},
  {n:13,empresa:"Allegria Foods",acreedor:"Banco Santander",tipo_inst:"Banco",monto:105000,f_venc:"2026-07-31",tipo_cr:"Bullet",tasa:"7.6%",cuota:105000},
  {n:14,empresa:"Allegria Foods",acreedor:"Banco Santander",tipo_inst:"Banco",monto:105000,f_venc:"2026-08-11",tipo_cr:"Bullet",tasa:"7.6%",cuota:105000},
  {n:15,empresa:"Allegria Foods",acreedor:"Banco Santander",tipo_inst:"Banco",monto:105000,f_venc:"2026-09-01",tipo_cr:"Bullet",tasa:"7.6%",cuota:105000},
  {n:16,empresa:"Allegria Foods",acreedor:"Banco Santander",tipo_inst:"Banco",monto:105000,f_venc:"2026-09-04",tipo_cr:"Bullet",tasa:"7.6%",cuota:105000},
  {n:17,empresa:"Allegria Foods",acreedor:"Banco Santander",tipo_inst:"Banco",monto:75000,f_venc:"2026-09-25",tipo_cr:"Bullet",tasa:"7.6%",cuota:75000},
  {n:18,empresa:"Frisku Foods",acreedor:"Banco Security",tipo_inst:"Banco",monto:143226,f_venc:"2026-09-25",tipo_cr:"Cuotas Mensuales",tasa:"10.7%",cuota:12637},
  {n:19,empresa:"Frisku Foods",acreedor:"Banco BICE",tipo_inst:"Banco",monto:52391,f_venc:"2026-04-13",tipo_cr:"Bullet",tasa:"9.7%",cuota:52391},
  {n:20,empresa:"Osiris",acreedor:"Banco Security",tipo_inst:"Banco",monto:111744,f_venc:"2026-12-05",tipo_cr:"Cuotas Mensuales",tasa:"11.4%",cuota:9178},
  {n:21,empresa:"Osiris",acreedor:"BCI",tipo_inst:"Banco",monto:350000,f_venc:"2026-06-27",tipo_cr:"Bullet",tasa:"9.3%",cuota:350000},
  {n:22,empresa:"Allegria Service",acreedor:"BCI",tipo_inst:"Banco",monto:395759,f_venc:"2026-11-05",tipo_cr:"Leasing",tasa:"8.5%",cuota:600000},
  {n:23,empresa:"Allegria Service",acreedor:"BCI",tipo_inst:"Banco",monto:429557,f_venc:"2027-11-05",tipo_cr:"Leasing",tasa:"8.5%",cuota:600000},
  {n:24,empresa:"Allegria Service",acreedor:"BCI",tipo_inst:"Banco",monto:543447,f_venc:"2028-11-05",tipo_cr:"Leasing",tasa:"8.5%",cuota:677206},
  {n:25,empresa:"Allegria Service",acreedor:"BCI",tipo_inst:"Banco",monto:589857,f_venc:"2029-11-05",tipo_cr:"Leasing",tasa:"8.5%",cuota:677206},
  {n:26,empresa:"Allegria Service",acreedor:"BCI",tipo_inst:"Banco",monto:432959,f_venc:"2029-12-05",tipo_cr:"Leasing",tasa:"8.5%",cuota:436040},
  {n:27,empresa:"Allpa Farms",acreedor:"Banco de Chile",tipo_inst:"Banco",monto:53061,f_venc:"2026-06-26",tipo_cr:"Crédito Hipotecario",tasa:"7.7%",cuota:53061},
  {n:28,empresa:"Allpa Farms",acreedor:"Banco de Chile",tipo_inst:"Banco",monto:106122,f_venc:"2027-06-29",tipo_cr:"Crédito Hipotecario",tasa:"7.7%",cuota:106122},
  {n:29,empresa:"Allpa Farms",acreedor:"Banco de Chile",tipo_inst:"Banco",monto:143720,f_venc:"2028-06-27",tipo_cr:"Crédito Hipotecario",tasa:"7.7%",cuota:143720},
  {n:30,empresa:"Allpa Farms",acreedor:"Banco de Chile",tipo_inst:"Banco",monto:143720,f_venc:"2029-06-26",tipo_cr:"Crédito Hipotecario",tasa:"7.7%",cuota:143720},
  {n:31,empresa:"Allpa Farms",acreedor:"Banco de Chile",tipo_inst:"Banco",monto:143720,f_venc:"2030-06-26",tipo_cr:"Crédito Hipotecario",tasa:"7.7%",cuota:143720},
  {n:32,empresa:"Allpa Farms",acreedor:"Banco de Chile",tipo_inst:"Banco",monto:143720,f_venc:"2031-06-26",tipo_cr:"Crédito Hipotecario",tasa:"7.7%",cuota:143720},
  {n:33,empresa:"Mediterra",acreedor:"Privado Particular",tipo_inst:"Privado",monto:34650,f_venc:"2026-06-01",tipo_cr:"Inversión",tasa:"12.6%",cuota:34650},
  {n:34,empresa:"Mediterra",acreedor:"Privado Particular",tipo_inst:"Privado",monto:34650,f_venc:"2026-09-01",tipo_cr:"Inversión",tasa:"12.6%",cuota:34650},
  {n:35,empresa:"Mediterra",acreedor:"Privado Particular",tipo_inst:"Privado",monto:34650,f_venc:"2026-12-01",tipo_cr:"Inversión",tasa:"12.6%",cuota:34650},
  {n:36,empresa:"Mediterra",acreedor:"Privado Particular",tipo_inst:"Privado",monto:550000,f_venc:"2027-01-01",tipo_cr:"Inversión",tasa:"12.6%",cuota:550000},
  {n:37,empresa:"Mediterra",acreedor:"Privado Particular",tipo_inst:"Privado",monto:17325,f_venc:"2027-03-01",tipo_cr:"Inversión",tasa:"12.6%",cuota:17325},
  {n:38,empresa:"Mediterra",acreedor:"Privado Particular",tipo_inst:"Privado",monto:17325,f_venc:"2027-06-01",tipo_cr:"Inversión",tasa:"12.6%",cuota:17325},
  {n:39,empresa:"Mediterra",acreedor:"Privado Particular",tipo_inst:"Privado",monto:17325,f_venc:"2027-09-01",tipo_cr:"Inversión",tasa:"12.6%",cuota:17325},
  {n:40,empresa:"Mediterra",acreedor:"Privado Particular",tipo_inst:"Privado",monto:17325,f_venc:"2027-12-01",tipo_cr:"Inversión",tasa:"12.6%",cuota:17325},
  {n:41,empresa:"Mediterra",acreedor:"Privado Particular",tipo_inst:"Privado",monto:550000,f_venc:"2028-01-01",tipo_cr:"Inversión",tasa:"12.6%",cuota:550000},
];
const CREDITOS_TRIM = {
  quarters:["Q1 2026","Q2 2026","Q3 2026","Q4 2026","Q1 2027","Q2 2027","Q3 2027","Q4 2027","Q1 2028","Q2 2028","Q3 2028","Q4 2028"],
  pagos:   [21815,1064994,983763,1517473,922750,1348929,677657,972750,1016426,800196,0,0],
  saldos:  [8355763,7761667,7667292,6513894,5946569,5287401,5270076,4652751,4102751,3881315,3881315,3881315],
};

// ═══════════════════════════════════════════════════════════════════
// PALETA — TEMA AZUL MARINO (estilo header Tareas #1e3a5f)
// ═══════════════════════════════════════════════════════════════════
const C = {
  // Fondos
  bg:     "#0f2342",   // fondo principal — azul marino oscuro
  bg2:    "#162d52",   // fondo secundario
  card:   "#1e3a5f",   // card base — igual al header de Tareas
  card2:  "#243f65",   // card hover / input
  border: "#2d5080",   // bordes
  border2:"#3a6494",   // bordes destacados

  // Textos
  text:   "#e8f0fa",   // texto principal
  muted:  "#7da8d4",   // texto secundario
  muted2: "#4a7aaa",   // texto muy tenue

  // Semáforos
  green:  "#22c55e",
  red:    "#f87171",
  blue:   "#60a5fa",
  yellow: "#fbbf24",
  orange: "#fb923c",

  // Accent
  accent: "#2563eb",
  accentL:"#60a5fa",
};

const $$ = n => {
  if(n==null||n==="") return "—";
  const abs=Math.abs(n),s=n<0?"-":"";
  if(abs>=1_000_000) return `${s}$${(abs/1e6).toFixed(2)}M`;
  if(abs>=1_000)     return `${s}$${(abs/1e3).toFixed(0)}K`;
  return `${s}$${abs.toLocaleString()}`;
};
const fmtDate = s => {
  if(!s) return "—";
  try{const d=new Date(s);return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;}
  catch{return s.slice(0,10);}
};
const cf = v => v>=0 ? C.green : C.red;
const CAT_COLOR={ing_op:C.green,ing_nop:"#34d399",egr_var:C.red,egr_fijo:"#f87171",egr_nop:"#fca5a5",imp:C.orange};
const CAT_SIGNO={ing_op:"+",ing_nop:"+",egr_var:"−",egr_fijo:"−",egr_nop:"−",imp:"−"};

function Card({children,style={}}) {
  return <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"16px 18px",...style}}>{children}</div>;
}
function SectionTitle({children}) {
  return <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:12}}>{children}</div>;
}
function KPI({label,value,color=C.green}) {
  return (
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 16px"}}>
      <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>{label}</div>
      <div style={{fontSize:18,fontWeight:800,color}}>{value}</div>
    </div>
  );
}
function Btn({onClick,active,children,color=C.accent,small=false}) {
  return (
    <button onClick={onClick}
      style={{padding:small?"4px 10px":"6px 14px",borderRadius:8,cursor:"pointer",fontWeight:600,fontSize:small?10:11,
        border:`1px solid ${active?color:C.border}`,background:active?`${color}33`:"transparent",color:active?color:C.muted}}>
      {children}
    </button>
  );
}
function LineChart({months,values,color=C.accentL,h=72}) {
  const W=460,pad={l:52,r:8,t:6,b:18};
  const iw=W-pad.l-pad.r,ih=h-pad.t-pad.b;
  const min=Math.min(...values),max=Math.max(...values),range=max-min||1;
  const tx=i=>pad.l+(i/(Math.max(values.length-1,1)))*iw;
  const ty=v=>pad.t+ih-((v-min)/range)*ih;
  const pts=values.map((v,i)=>[tx(i),ty(v)]);
  const poly=pts.map(([x,y])=>`${x},${y}`).join(" ");
  const area=`M${pts[0][0]},${h-pad.b} `+pts.map(([x,y])=>`L${x},${y}`).join(" ")+` L${pts[pts.length-1][0]},${h-pad.b} Z`;
  const zy=ty(0);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${h}`} style={{display:"block"}}>
      <defs><linearGradient id="lgf" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.25"/>
        <stop offset="100%" stopColor={color} stopOpacity="0.02"/>
      </linearGradient></defs>
      <line x1={pad.l} x2={W-pad.r} y1={zy} y2={zy} stroke={C.border2} strokeWidth={1} strokeDasharray="3,3"/>
      <path d={area} fill="url(#lgf)"/>
      <polyline points={poly} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round"/>
      {pts.map(([x,y],i)=>{const isL=i===pts.length-1;if(!isL&&i%8!==0)return null;return <circle key={i} cx={x} cy={y} r={isL?3:2} fill={cf(values[i])}/>;}) }
      {months.map((m,i)=>{if(i%8!==0&&i!==months.length-1)return null;return <text key={i} x={tx(i)} y={h-1} textAnchor="middle" fontSize={6} fill={C.muted}>{m}</text>;})}
      {[0,1].map(p=>(<text key={p} x={pad.l-3} y={pad.t+ih-p*ih+3} textAnchor="end" fontSize={7} fill={C.muted}>{$$(Math.round(min+p*range))}</text>))}
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB PARÁMETROS
// ═══════════════════════════════════════════════════════════════════
function AnticipList({items,onChange,label}) {
  const addRow=()=>onChange([...(items||[]),{mes:"",usd_kg:0}]);
  const updRow=(i,field,val)=>{const n=[...(items||[])];n[i]={...n[i],[field]:val};onChange(n);};
  const delRow=i=>onChange((items||[]).filter((_,j)=>j!==i));
  return (
    <div>
      {label&&<div style={{fontSize:10,color:C.muted,marginBottom:5,fontWeight:700}}>{label}</div>}
      <div style={{display:"flex",flexDirection:"column",gap:5}}>
        {(items||[]).map((row,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:6}}>
            <select value={row.mes||""} onChange={e=>updRow(i,"mes",e.target.value)}
              style={{padding:"4px 7px",background:C.card2,border:`1px solid ${C.border}`,borderRadius:6,color:row.mes?C.text:C.muted,fontSize:11,outline:"none"}}>
              <option value="">— mes —</option>
              {MESES_65.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
            <input type="number" value={row.usd_kg||""} placeholder="0"
              onChange={e=>updRow(i,"usd_kg",parseFloat(e.target.value)||0)}
              style={{width:80,padding:"4px 7px",background:C.card2,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:11,outline:"none",textAlign:"right"}}/>
            <span style={{fontSize:10,color:C.muted}}>US$/kg</span>
            <button onClick={()=>delRow(i)} style={{background:"transparent",border:"none",color:C.red,cursor:"pointer",fontSize:14}}>×</button>
          </div>
        ))}
        <button onClick={addRow} style={{alignSelf:"flex-start",padding:"4px 10px",background:`${C.accent}22`,
          border:`1px solid ${C.accent}55`,borderRadius:6,color:C.accentL,cursor:"pointer",fontSize:11,fontWeight:600}}>
          + Agregar mes
        </button>
      </div>
    </div>
  );
}

function DistList({items,onChange,totalMonto=0,esSemanal=false}) {
  const addRow=()=>onChange([...(items||[]),{mes:"",pct:0}]);
  const updRow=(i,field,val)=>{const n=[...(items||[])];n[i]={...n[i],[field]:val};onChange(n);};
  const delRow=i=>onChange((items||[]).filter((_,j)=>j!==i));
  return (
    <div style={{display:"flex",flexDirection:"column",gap:5}}>
      {(items||[]).map((row,i)=>{
        const monto=totalMonto*((Number(row.pct)||0)/100);
        const nSems=(SEMANAS_MES[row.mes]||[""]).length;
        return (
          <div key={i} style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
            <select value={row.mes||""} onChange={e=>updRow(i,"mes",e.target.value)}
              style={{padding:"4px 7px",background:C.card2,border:`1px solid ${C.border}`,borderRadius:6,color:row.mes?C.text:C.muted,fontSize:11,outline:"none"}}>
              <option value="">— mes —</option>
              {MESES_65.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
            <input type="number" min="0" max="100" value={row.pct||""} placeholder="0"
              onChange={e=>updRow(i,"pct",parseFloat(e.target.value)||0)}
              style={{width:58,padding:"4px 6px",background:C.card2,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:11,outline:"none",textAlign:"right"}}/>
            <span style={{fontSize:10,color:C.muted}}>%</span>
            {monto>0&&(
              <span style={{fontSize:10,color:C.yellow}}>
                = {$$(monto)}
                {esSemanal&&nSems>0&&<span style={{color:C.muted}}> ({nSems} sem → {$$(monto/nSems)}/sem)</span>}
              </span>
            )}
            <button onClick={()=>delRow(i)} style={{background:"transparent",border:"none",color:C.red,cursor:"pointer",fontSize:14,marginLeft:"auto"}}>×</button>
          </div>
        );
      })}
      <button onClick={addRow} style={{alignSelf:"flex-start",padding:"4px 10px",background:`${C.accent}22`,
        border:`1px solid ${C.accent}55`,borderRadius:6,color:C.accentL,cursor:"pointer",fontSize:11,fontWeight:600}}>
        + Agregar mes
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PARÁMETROS POR EMPRESA — componentes reutilizables
// ═══════════════════════════════════════════════════════════════════

// Parámetros específicos Allegria Foods (frutas) — conservado tal cual
function ParamsFruta({seasonKey,fruta,params,setParams}) {
  const p=params?.[seasonKey]?.[fruta]||defaultFruta();
  const upd=(field,val)=>setParams(prev=>{
    const next=JSON.parse(JSON.stringify(prev));
    if(!next[seasonKey]) next[seasonKey]={};
    if(!next[seasonKey][fruta]) next[seasonKey][fruta]=defaultFruta();
    next[seasonKey][fruta][field]=val;
    return next;
  });
  const kg=Number(p.kg)||0,fob=Number(p.fob_usd_kg)||0;
  const desc=(Number(p.desc_exp_pct)||0)/100;
  const matUsd=Number(p.mat_usd_kg)||0, srvUsd=Number(p.srv_usd_kg)||0;
  const totalIng=kg*fob;
  const precioNet=Math.max(0,fob*(1-desc)-matUsd-srvUsd);
  const totalCost=kg*precioNet;
  const antIngTot=(p.anticipos_cliente||[]).reduce((s,a)=>s+(Number(a.usd_kg)||0)*kg,0);
  const antCostTot=(p.anticipos_productor||[]).reduce((s,a)=>s+(Number(a.usd_kg)||0)*kg,0);
  const pctMat=(p.dist_mat||[]).reduce((s,d)=>s+(Number(d.pct)||0),0);
  const pctSrv=(p.dist_srv||[]).reduce((s,d)=>s+(Number(d.pct)||0),0);
  const iSt={width:90,padding:"5px 7px",background:C.card2,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:11,outline:"none",textAlign:"right"};
  const selSt={padding:"5px 8px",background:C.card2,border:`1px solid ${C.border}`,borderRadius:6,fontSize:11,outline:"none",color:C.text};
  return (
    <div style={{background:C.card2,borderRadius:12,padding:16,border:`1px solid ${C.border}`}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
        <span style={{fontSize:22}}>{FRUTA_EMOJI[fruta]}</span>
        <span style={{fontWeight:800,fontSize:14,color:C.text}}>{FRUTA_LABEL[fruta]}</span>
        {totalIng>0&&<span style={{fontSize:11,background:`${C.green}22`,color:C.green,borderRadius:20,padding:"2px 10px",fontWeight:700,marginLeft:"auto"}}>
          Ing: {$$(totalIng)} · Costo: {$$(totalCost)} · Margen: {$$(totalIng-totalCost)}
        </span>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:12,marginBottom:14}}>
        {[["KG a exportar","kg","",""],["FOB US$/kg","fob_usd_kg","$",""],["Desc. exportadora","desc_exp_pct","","%"],["Materiales US$/kg","mat_usd_kg","$",""],["Servicios US$/kg","srv_usd_kg","$",""]].map(([lbl,field,pre,suf])=>(
          <div key={field}>
            <div style={{fontSize:10,color:C.muted,marginBottom:3}}>{lbl}</div>
            <div style={{display:"flex",alignItems:"center",gap:3}}>
              {pre&&<span style={{fontSize:11,color:C.muted}}>{pre}</span>}
              <input type="number" value={p[field]||""} placeholder="0" onChange={e=>upd(field,parseFloat(e.target.value)||0)} style={iSt}/>
              {suf&&<span style={{fontSize:11,color:C.muted}}>{suf}</span>}
            </div>
          </div>
        ))}
        {precioNet>0&&kg>0&&(
          <div style={{gridColumn:"1/-1",background:`${C.yellow}11`,border:`1px solid ${C.yellow}33`,borderRadius:8,padding:"8px 12px",fontSize:11,color:C.yellow}}>
            Precio neto productor: <strong>${precioNet.toFixed(3)}/kg</strong>
          </div>
        )}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <div style={{background:`${C.green}0d`,border:`1px solid ${C.green}33`,borderRadius:10,padding:12}}>
          <div style={{fontSize:11,fontWeight:700,color:C.green,marginBottom:10}}>📥 Cobros al cliente</div>
          <AnticipList label="Anticipos (US$/kg por mes)" items={p.anticipos_cliente} onChange={v=>upd("anticipos_cliente",v)}/>
          <div style={{marginTop:10}}>
            <div style={{fontSize:10,color:C.muted,marginBottom:3}}>Mes liquidación final</div>
            <select value={p.mes_liquidacion||""} onChange={e=>upd("mes_liquidacion",e.target.value)} style={selSt}>
              <option value="">— mes —</option>
              {MESES_65.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
            {antIngTot>0&&totalIng>0&&<div style={{fontSize:10,color:C.muted,marginTop:4}}>Anticipos: {$$(antIngTot)} · Liquidación: {$$(Math.max(0,totalIng-antIngTot))}</div>}
          </div>
        </div>
        <div style={{background:`${C.red}0d`,border:`1px solid ${C.red}33`,borderRadius:10,padding:12}}>
          <div style={{fontSize:11,fontWeight:700,color:C.red,marginBottom:10}}>📤 Pagos al productor</div>
          <AnticipList label="Anticipos productor (US$/kg)" items={p.anticipos_productor} onChange={v=>upd("anticipos_productor",v)}/>
          <div style={{marginTop:10}}>
            <div style={{fontSize:10,color:C.muted,marginBottom:3}}>Mes saldo productor</div>
            <select value={p.mes_saldo_productor||""} onChange={e=>upd("mes_saldo_productor",e.target.value)} style={selSt}>
              <option value="">— mes —</option>
              {MESES_65.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
      </div>
      {(matUsd>0||srvUsd>0)&&kg>0&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginTop:14}}>
          {matUsd>0&&(
            <div style={{background:"rgba(251,191,36,0.07)",border:`1px solid ${C.yellow}44`,borderRadius:10,padding:12}}>
              <div style={{fontSize:11,fontWeight:700,color:C.yellow,marginBottom:4}}>📦 Pago Materiales</div>
              <div style={{fontSize:10,color:C.muted,marginBottom:8}}>
                Total: <strong style={{color:C.yellow}}>{$$(kg*matUsd)}</strong>
                {" · "}Asignado: <strong style={{color:pctMat===100?C.green:C.orange}}>{pctMat.toFixed(0)}%</strong>
              </div>
              <DistList items={p.dist_mat} onChange={v=>upd("dist_mat",v)} totalMonto={kg*matUsd}/>
            </div>
          )}
          {srvUsd>0&&(
            <div style={{background:"rgba(96,165,250,0.07)",border:`1px solid ${C.blue}44`,borderRadius:10,padding:12}}>
              <div style={{fontSize:11,fontWeight:700,color:C.blue,marginBottom:4}}>⚙️ Pago Servicios</div>
              <div style={{fontSize:10,color:C.muted,marginBottom:8}}>
                Total: <strong style={{color:C.blue}}>{$$(kg*srvUsd)}</strong>
                {" · "}Asignado: <strong style={{color:pctSrv===100?C.green:C.orange}}>{pctSrv.toFixed(0)}%</strong>
              </div>
              <DistList items={p.dist_srv} onChange={v=>upd("dist_srv",v)} totalMonto={kg*srvUsd} esSemanal/>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Parámetros genéricos: un "producto" por empresa ───────────────
function ParamsProducto({seasonKey,prodId,paramsEmp,setParamsEmp,empColor="#2563eb"}) {
  const p = paramsEmp?.[seasonKey]?.[prodId] || defaultProducto();
  const upd=(field,val)=>setParamsEmp(prev=>{
    const next=JSON.parse(JSON.stringify(prev));
    if(!next[seasonKey]) next[seasonKey]={};
    if(!next[seasonKey][prodId]) next[seasonKey][prodId]=defaultProducto();
    next[seasonKey][prodId][field]=val;
    return next;
  });

  const u    = Number(p.unidades)||0;
  const pr   = Number(p.precio_unit)||0;
  const desc = (Number(p.desc_pct)||0)/100;
  const mU   = Number(p.mat_unit)||0;
  const sU   = Number(p.srv_unit)||0;
  const totalIng  = u*pr;
  const pNeto     = Math.max(0, pr*(1-desc)-mU-sU);
  const totalCost = u*pNeto;
  const antIngTot =(p.anticipos_cliente||[]).reduce((s,a)=>s+(Number(a.usd_unit)||0)*u,0);
  const pctMat    =(p.dist_mat||[]).reduce((s,d)=>s+(Number(d.pct)||0),0);
  const pctSrv    =(p.dist_srv||[]).reduce((s,d)=>s+(Number(d.pct)||0),0);

  const iSt={width:90,padding:"5px 7px",background:C.card2,border:`1px solid ${C.border}`,
    borderRadius:6,color:C.text,fontSize:11,outline:"none",textAlign:"right"};
  const selSt={padding:"5px 8px",background:C.card2,border:`1px solid ${C.border}`,
    borderRadius:6,fontSize:11,outline:"none",color:C.text};

  return (
    <div style={{background:C.card2,borderRadius:12,padding:16,border:`1px solid ${C.border}`}}>
      {/* Header producto */}
      <div style={{display:"grid",gridTemplateColumns:"auto 1fr auto auto",gap:10,alignItems:"center",marginBottom:14}}>
        <input value={p.emoji||"📦"} onChange={e=>upd("emoji",e.target.value)}
          style={{width:40,padding:"4px 6px",background:C.bg,border:`1px solid ${C.border}`,
            borderRadius:6,color:C.text,fontSize:16,textAlign:"center",outline:"none"}}/>
        <input value={p.nombre} onChange={e=>upd("nombre",e.target.value)}
          placeholder="Nombre del producto / línea..."
          style={{padding:"6px 10px",background:C.bg,border:`1px solid ${C.border}`,
            borderRadius:6,color:C.text,fontSize:13,fontWeight:700,outline:"none"}}/>
        <input value={p.unidad_label||"unid."} onChange={e=>upd("unidad_label",e.target.value)}
          placeholder="unid."
          style={{width:60,padding:"5px 7px",background:C.bg,border:`1px solid ${C.border}`,
            borderRadius:6,color:C.muted,fontSize:11,textAlign:"center",outline:"none"}}/>
        {totalIng>0&&<span style={{fontSize:11,background:`${C.green}22`,color:C.green,
          borderRadius:20,padding:"2px 10px",fontWeight:700,whiteSpace:"nowrap"}}>
          Ing: {$$(totalIng)} · Margen: {$$(totalIng-totalCost)}
        </span>}
      </div>

      {/* Campos numéricos */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:12,marginBottom:14}}>
        {[
          [`Cantidad (${p.unidad_label||"unid."})`, "unidades", ""],
          ["Precio US$/unidad",                      "precio_unit","$"],
          ["Descuento intermediario",                "desc_pct",  "%" ],
          ["Materiales US$/unidad",                  "mat_unit",  "$" ],
          ["Servicios US$/unidad",                   "srv_unit",  "$" ],
        ].map(([lbl,field,pre])=>(
          <div key={field}>
            <div style={{fontSize:10,color:C.muted,marginBottom:3}}>{lbl}</div>
            <div style={{display:"flex",alignItems:"center",gap:3}}>
              {pre&&<span style={{fontSize:11,color:C.muted}}>{pre}</span>}
              <input type="number" value={p[field]||""} placeholder="0"
                onChange={e=>upd(field,parseFloat(e.target.value)||0)} style={iSt}/>
            </div>
          </div>
        ))}
        {pNeto>0&&u>0&&(
          <div style={{gridColumn:"1/-1",background:`${C.yellow}11`,border:`1px solid ${C.yellow}33`,
            borderRadius:8,padding:"8px 12px",fontSize:11,color:C.yellow}}>
            Precio neto proveedor: <strong>${pNeto.toFixed(3)}/unid.</strong>
            &nbsp;· Costo total proveedor: <strong>{$$(totalCost)}</strong>
          </div>
        )}
      </div>

      {/* Cobros / Pagos */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
        <div style={{background:`${C.green}0d`,border:`1px solid ${C.green}33`,borderRadius:10,padding:12}}>
          <div style={{fontSize:11,fontWeight:700,color:C.green,marginBottom:10}}>📥 Cobros al cliente</div>
          <div style={{marginBottom:8}}>
            <div style={{fontSize:10,color:C.muted,marginBottom:5,fontWeight:700}}>Anticipos (US$/unid. por mes)</div>
            <AnticipListGen items={p.anticipos_cliente} onChange={v=>upd("anticipos_cliente",v)}
              totalUnits={u} label="usd_unit"/>
          </div>
          <div>
            <div style={{fontSize:10,color:C.muted,marginBottom:3}}>Mes liquidación final</div>
            <select value={p.mes_liquidacion||""} onChange={e=>upd("mes_liquidacion",e.target.value)} style={selSt}>
              <option value="">— mes —</option>
              {MESES_65.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
            {antIngTot>0&&totalIng>0&&<div style={{fontSize:10,color:C.muted,marginTop:4}}>
              Anticipos: {$$(antIngTot)} · Liquidación: {$$(Math.max(0,totalIng-antIngTot))}
            </div>}
          </div>
        </div>
        <div style={{background:`${C.red}0d`,border:`1px solid ${C.red}33`,borderRadius:10,padding:12}}>
          <div style={{fontSize:11,fontWeight:700,color:C.red,marginBottom:10}}>📤 Pagos al proveedor</div>
          <div style={{marginBottom:8}}>
            <div style={{fontSize:10,color:C.muted,marginBottom:5,fontWeight:700}}>Anticipos (US$/unid. por mes)</div>
            <AnticipListGen items={p.anticipos_productor} onChange={v=>upd("anticipos_productor",v)}
              totalUnits={u} label="usd_unit"/>
          </div>
          <div>
            <div style={{fontSize:10,color:C.muted,marginBottom:3}}>Mes saldo proveedor</div>
            <select value={p.mes_saldo_productor||""} onChange={e=>upd("mes_saldo_productor",e.target.value)} style={selSt}>
              <option value="">— mes —</option>
              {MESES_65.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Distribución Materiales y Servicios */}
      {(mU>0||sU>0)&&u>0&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          {mU>0&&(
            <div style={{background:"rgba(251,191,36,0.07)",border:`1px solid ${C.yellow}44`,borderRadius:10,padding:12}}>
              <div style={{fontSize:11,fontWeight:700,color:C.yellow,marginBottom:4}}>📦 Pago Materiales</div>
              <div style={{fontSize:10,color:C.muted,marginBottom:8}}>
                Total: <strong style={{color:C.yellow}}>{$$(u*mU)}</strong>
                {" · "}Asignado: <strong style={{color:pctMat===100?C.green:C.orange}}>{pctMat.toFixed(0)}%</strong>
              </div>
              <DistList items={p.dist_mat} onChange={v=>upd("dist_mat",v)} totalMonto={u*mU}/>
            </div>
          )}
          {sU>0&&(
            <div style={{background:"rgba(96,165,250,0.07)",border:`1px solid ${C.blue}44`,borderRadius:10,padding:12}}>
              <div style={{fontSize:11,fontWeight:700,color:C.blue,marginBottom:4}}>⚙️ Pago Servicios</div>
              <div style={{fontSize:10,color:C.muted,marginBottom:8}}>
                Total: <strong style={{color:C.blue}}>{$$(u*sU)}</strong>
                {" · "}Asignado: <strong style={{color:pctSrv===100?C.green:C.orange}}>{pctSrv.toFixed(0)}%</strong>
              </div>
              <DistList items={p.dist_srv} onChange={v=>upd("dist_srv",v)} totalMonto={u*sU} esSemanal/>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// AnticipListGen — igual que AnticipList pero con campo configurable (usd_unit en vez de usd_kg)
function AnticipListGen({items,onChange,totalUnits=0,label="usd_unit"}) {
  const addRow=()=>onChange([...(items||[]),{mes:"",[label]:0}]);
  const updRow=(i,field,val)=>{const n=[...(items||[])];n[i]={...n[i],[field]:val};onChange(n);};
  const delRow=i=>onChange((items||[]).filter((_,j)=>j!==i));
  return (
    <div style={{display:"flex",flexDirection:"column",gap:5}}>
      {(items||[]).map((row,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:6}}>
          <select value={row.mes||""} onChange={e=>updRow(i,"mes",e.target.value)}
            style={{padding:"4px 7px",background:C.card2,border:`1px solid ${C.border}`,
              borderRadius:6,color:row.mes?C.text:C.muted,fontSize:11,outline:"none"}}>
            <option value="">— mes —</option>
            {MESES_65.map(m=><option key={m} value={m}>{m}</option>)}
          </select>
          <input type="number" value={row[label]||""} placeholder="0"
            onChange={e=>updRow(i,label,parseFloat(e.target.value)||0)}
            style={{width:80,padding:"4px 7px",background:C.card2,border:`1px solid ${C.border}`,
              borderRadius:6,color:C.text,fontSize:11,outline:"none",textAlign:"right"}}/>
          <span style={{fontSize:10,color:C.muted}}>$/unid</span>
          {row[label]&&totalUnits>0&&(
            <span style={{fontSize:10,color:C.yellow}}>=&nbsp;{$$((Number(row[label])||0)*totalUnits)}</span>
          )}
          <button onClick={()=>delRow(i)} style={{background:"transparent",border:"none",color:C.red,cursor:"pointer",fontSize:14}}>×</button>
        </div>
      ))}
      <button onClick={addRow} style={{alignSelf:"flex-start",padding:"4px 10px",background:`${C.accent}22`,
        border:`1px solid ${C.accent}55`,borderRadius:6,color:C.accentL,cursor:"pointer",fontSize:11,fontWeight:600}}>
        + Agregar mes
      </button>
    </div>
  );
}

// ── TabParametros GENÉRICO para todas las empresas ─────────────────
function TabParametros({empNombre,empColor="#2563eb",
  params,setParams,           // Allegria Foods (frutas)
  paramsEmp,setParamsEmp,     // Otras empresas (productos genéricos)
  readOnly=false}) {

  const [selSeason,setSelSeason] = useState(SEASON_KEYS[0]);
  const [selFruta, setSelFruta]  = useState("cerezas");
  const [selProd,  setSelProd]   = useState(null);   // id producto seleccionado

  const esAllegria = empNombre === "Allegria Foods";

  // Productos de esta empresa en la temporada seleccionada
  const productos = paramsEmp?.[selSeason] || {};
  const prodIds   = Object.keys(productos);

  function addProducto() {
    if(readOnly) return;
    const id = `prod_${Date.now()}`;
    setParamsEmp(prev=>{
      const next=JSON.parse(JSON.stringify(prev));
      if(!next[selSeason]) next[selSeason]={};
      next[selSeason][id]={...defaultProducto(),nombre:"Nuevo producto"};
      return next;
    });
    setSelProd(id);
  }

  function delProducto(id) {
    if(readOnly) return;
    setParamsEmp(prev=>{
      const next=JSON.parse(JSON.stringify(prev));
      if(next[selSeason]) delete next[selSeason][id];
      return next;
    });
    if(selProd===id) setSelProd(null);
  }

  // Resumen Allegria
  const resumenAllegria = useMemo(()=>{
    if(!esAllegria) return [];
    return SEASONS.flatMap(s=>FRUTAS.map(f=>{
      const p=params?.[s.key]?.[f];
      const kg=Number(p?.kg)||0,fob=Number(p?.fob_usd_kg)||0;
      const desc=(Number(p?.desc_exp_pct)||0)/100;
      const matUsd=Number(p?.mat_usd_kg)||0,srvUsd=Number(p?.srv_usd_kg)||0;
      const ing=kg*fob;
      const costFruta=kg*Math.max(0,fob*(1-desc)-matUsd-srvUsd);
      const costMat=kg*matUsd, costSrv=kg*srvUsd;
      const cost=costFruta+costMat+costSrv;
      if(kg===0&&fob===0) return null;
      return {season:s.label,fruta:f,kg,fob,ing,costFruta,costMat,costSrv,cost,margen:ing-cost};
    }).filter(Boolean));
  },[params, esAllegria]);

  // Resumen genérico
  const resumenEmp = useMemo(()=>{
    if(esAllegria) return [];
    return SEASONS.flatMap(s=>{
      const prods=paramsEmp?.[s.key]||{};
      return Object.entries(prods).map(([id,p])=>{
        const u=Number(p.unidades)||0,pr=Number(p.precio_unit)||0;
        const desc=(Number(p.desc_pct)||0)/100;
        const mU=Number(p.mat_unit)||0,sU=Number(p.srv_unit)||0;
        const ing=u*pr;
        const cost=u*Math.max(0,pr*(1-desc));
        if(u===0&&pr===0) return null;
        return {season:s.label,id,nombre:p.nombre||"Sin nombre",emoji:p.emoji||"📦",
          u,pr,ing,cost,mat:u*mU,srv:u*sU,margen:ing-cost};
      }).filter(Boolean);
    });
  },[paramsEmp,esAllegria]);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {readOnly&&(
        <div style={{background:`${C.accent}22`,border:`1px solid ${C.blue}44`,borderRadius:10,
          padding:"10px 16px",fontSize:12,color:C.blue}}>
          👁 Estás en modo solo lectura.
        </div>
      )}

      {/* Selector temporada — siempre visible */}
      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
          <SectionTitle>
            ⚡ Parámetros — {empNombre}
            <span style={{fontSize:10,color:C.muted,fontWeight:400,marginLeft:8}}>
              Define los productos/líneas de ingreso con sus anticipos y distribuciones
            </span>
          </SectionTitle>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:0}}>
          {SEASONS.map(s=>(
            <Btn key={s.key} active={selSeason===s.key}
              onClick={()=>{setSelSeason(s.key);setSelProd(null);}}
              color={empColor}>{s.label}</Btn>
          ))}
        </div>
      </Card>

      {/* ── ALLEGRIA FOODS: selector fruta ── */}
      {esAllegria&&(
        <Card>
          <div style={{display:"flex",gap:6,marginBottom:16}}>
            {FRUTAS.map(f=>(
              <button key={f} onClick={()=>setSelFruta(f)}
                style={{padding:"6px 18px",borderRadius:20,border:"none",cursor:"pointer",
                  fontWeight:600,fontSize:12,
                  background:selFruta===f?"#b91c1c":C.card2,
                  color:selFruta===f?"#fff":C.muted}}>
                {FRUTA_EMOJI[f]} {FRUTA_LABEL[f]}
              </button>
            ))}
          </div>
          <ParamsFruta key={`${selSeason}-${selFruta}`}
            seasonKey={selSeason} fruta={selFruta}
            params={params} setParams={setParams}/>
        </Card>
      )}

      {/* ── OTRAS EMPRESAS: lista de productos ── */}
      {!esAllegria&&(
        <div style={{display:"flex",gap:14}}>
          {/* Panel izquierdo: lista productos */}
          <div style={{width:200,flexShrink:0,display:"flex",flexDirection:"column",gap:6}}>
            <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",
              letterSpacing:1,marginBottom:4}}>Productos / Líneas</div>
            {prodIds.length===0&&(
              <div style={{fontSize:11,color:C.muted2,padding:"8px 0"}}>
                Sin productos. Agrega uno →
              </div>
            )}
            {prodIds.map(id=>{
              const prod=productos[id];
              const isActive=selProd===id;
              return (
                <div key={id} style={{display:"flex",alignItems:"center",gap:4}}>
                  <button onClick={()=>setSelProd(id)}
                    style={{flex:1,padding:"7px 10px",borderRadius:8,cursor:"pointer",
                      fontSize:11,fontWeight:isActive?700:400,textAlign:"left",
                      border:`1px solid ${isActive?empColor:C.border}`,
                      background:isActive?`${empColor}22`:C.card,
                      color:isActive?empColor:C.text,overflow:"hidden",
                      whiteSpace:"nowrap",textOverflow:"ellipsis"}}>
                    {prod.emoji||"📦"} {prod.nombre||"Sin nombre"}
                  </button>
                  {!readOnly&&(
                    <button onClick={()=>delProducto(id)}
                      style={{padding:"4px 7px",borderRadius:6,border:"none",
                        background:"transparent",color:C.red,cursor:"pointer",fontSize:13}}>
                      ×
                    </button>
                  )}
                </div>
              );
            })}
            {!readOnly&&(
              <button onClick={addProducto}
                style={{padding:"7px 10px",borderRadius:8,cursor:"pointer",fontSize:11,
                  fontWeight:600,border:`1px dashed ${C.border2}`,
                  background:"transparent",color:C.accentL,marginTop:4}}>
                + Nuevo producto
              </button>
            )}
          </div>

          {/* Panel derecho: detalle del producto seleccionado */}
          <div style={{flex:1}}>
            {selProd&&productos[selProd] ? (
              <ParamsProducto
                key={`${selSeason}-${selProd}`}
                seasonKey={selSeason}
                prodId={selProd}
                paramsEmp={paramsEmp}
                setParamsEmp={setParamsEmp}
                empColor={empColor}
              />
            ) : (
              <div style={{background:C.card,borderRadius:12,padding:32,
                textAlign:"center",border:`1px dashed ${C.border}`,color:C.muted,fontSize:13}}>
                {prodIds.length===0
                  ? `Haz click en ${readOnly ? "" : '"+ Nuevo producto"'} para comenzar`
                  : "Selecciona un producto de la lista"}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Resumen proyectado */}
      {(resumenAllegria.length>0||resumenEmp.length>0)&&(
        <Card>
          <SectionTitle>Resumen Proyectado — Todas las Temporadas</SectionTitle>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{background:C.bg2}}>
                {(esAllegria
                  ? ["Temporada","Producto","Unidades","Precio","Ingreso","C.Fruta","C.Mat","C.Srv","Costo Total","Margen"]
                  : ["Temporada","Producto","Unidades","Precio","Ingreso","Costo","Mat","Srv","Margen"]
                ).map(h=>(
                  <th key={h} style={{padding:"7px 10px",fontWeight:600,fontSize:10,color:C.muted,
                    textTransform:"uppercase",borderBottom:`1px solid ${C.border}`,
                    textAlign:["Temporada","Producto"].includes(h)?"left":"right"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {(esAllegria?resumenAllegria:resumenEmp).map((r,i)=>(
                  <tr key={i} style={{borderBottom:`1px solid ${C.border}22`}}>
                    <td style={{padding:"6px 10px",color:C.muted,fontSize:11}}>{r.season}</td>
                    <td style={{padding:"6px 10px",fontWeight:600,color:C.text}}>
                      {esAllegria
                        ? <>{FRUTA_EMOJI[r.fruta]} {FRUTA_LABEL[r.fruta]}</>
                        : <>{r.emoji} {r.nombre}</>}
                    </td>
                    <td style={{padding:"6px 10px",textAlign:"right",color:C.text}}>
                      {(esAllegria?r.kg:r.u).toLocaleString()}
                    </td>
                    <td style={{padding:"6px 10px",textAlign:"right",color:C.yellow}}>
                      ${(esAllegria?r.fob:r.pr).toFixed(2)}
                    </td>
                    <td style={{padding:"6px 10px",textAlign:"right",fontWeight:700,color:C.green}}>{$$(r.ing)}</td>
                    {esAllegria&&<td style={{padding:"6px 10px",textAlign:"right",color:C.red}}>{$$(r.costFruta)}</td>}
                    <td style={{padding:"6px 10px",textAlign:"right",color:C.orange}}>{(esAllegria?r.costMat:r.mat)>0?$$((esAllegria?r.costMat:r.mat)):"—"}</td>
                    <td style={{padding:"6px 10px",textAlign:"right",color:C.blue}}>{(esAllegria?r.costSrv:r.srv)>0?$$((esAllegria?r.costSrv:r.srv)):"—"}</td>
                    {!esAllegria&&<td style={{padding:"6px 10px",textAlign:"right",color:C.red,fontWeight:700}}>{$$(r.cost)}</td>}
                    <td style={{padding:"6px 10px",textAlign:"right",fontWeight:700,color:cf(r.margen)}}>{$$(r.margen)}</td>
                  </tr>
                ))}
                <tr style={{background:C.bg2,borderTop:`2px solid ${C.border}`}}>
                  <td colSpan={4} style={{padding:"8px 10px",fontWeight:800,color:C.text}}>TOTAL</td>
                  <td style={{padding:"8px 10px",textAlign:"right",fontWeight:800,color:C.green}}>
                    {$$((esAllegria?resumenAllegria:resumenEmp).reduce((s,r)=>s+r.ing,0))}
                  </td>
                  <td colSpan={esAllegria?4:3}/>
                  <td style={{padding:"8px 10px",textAlign:"right",fontWeight:800,color:cf(
                    (esAllegria?resumenAllegria:resumenEmp).reduce((s,r)=>s+r.margen,0))}}>
                    {$$((esAllegria?resumenAllegria:resumenEmp).reduce((s,r)=>s+r.margen,0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════
// MODAL INGRESO REAL
// ═══════════════════════════════════════════════════════════════════
function ModalIngreso({emp,empNombre,mes,semana,existing,onSave,onClose}) {
  const allLines=emp.sections.flatMap(s=>s.lines.map(l=>({cat:s.cat,label:l.label,signo:s.signo})));
  const [vals,setVals]=useState(()=>{
    const init={};
    allLines.forEach(l=>{init[l.label]=existing?.[l.label]!=null?String(existing[l.label]):"";});
    return init;
  });
  const [saving,setSaving]=useState(false);
  const totalIng=allLines.filter(l=>l.signo>0).reduce((a,l)=>a+(Number(vals[l.label])||0),0);
  const totalEgr=allLines.filter(l=>l.signo<0).reduce((a,l)=>a+(Number(vals[l.label])||0),0);

  const setVal=useCallback((label,val)=>{
    setVals(prev=>({...prev,[label]:val}));
  },[]);

  async function handleSave(){
    setSaving(true);
    const clean={};
    allLines.forEach(l=>{if(Number(vals[l.label])||0) clean[l.label]=Number(vals[l.label]);});
    await onSave(empNombre,mes,semana,clean);
    setSaving(false);
    onClose();
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:500,
      display:"flex",alignItems:"flex-start",justifyContent:"center",padding:20,overflowY:"auto"}}>
      <div style={{background:C.bg2,border:`1px solid ${emp.color}55`,borderRadius:16,
        width:540,maxWidth:"95vw",boxShadow:"0 24px 64px rgba(0,0,0,0.7)"}}>
        <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:22}}>{emp.emoji}</span>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:800,color:C.text}}>{empNombre}</div>
            <div style={{fontSize:11,color:C.muted}}>{semana} · {mes}</div>
          </div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:20,lineHeight:1}}>×</button>
        </div>
        <div style={{padding:"14px 20px",maxHeight:"62vh",overflowY:"auto"}}>
          {emp.sections.map(sec=>(
            <div key={sec.cat} style={{marginBottom:16}}>
              <div style={{fontSize:10,fontWeight:700,color:CAT_COLOR[sec.cat]||C.muted,
                textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8,
                padding:"4px 0",borderBottom:`1px solid ${C.border}`}}>
                {CAT_SIGNO[sec.cat]} {sec.label}
              </div>
              {sec.lines.map(line=>(
                <RealLineInput key={line.label} label={line.label} value={vals[line.label]||""} onChange={v=>setVal(line.label,v)}/>
              ))}
            </div>
          ))}
        </div>
        <div style={{padding:"12px 20px",borderTop:`1px solid ${C.border}`}}>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            {[["ING",totalIng,C.green],["EGR",totalEgr,C.red],["NETO",totalIng-totalEgr,cf(totalIng-totalEgr)]].map(([l,v,c])=>(
              <div key={l} style={{flex:1,background:C.card2,borderRadius:8,padding:"7px 10px",border:`1px solid ${C.border}`}}>
                <div style={{fontSize:9,color:C.muted}}>{l}</div>
                <div style={{fontWeight:800,color:c,fontSize:13}}>{$$(v)}</div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button onClick={onClose} style={{padding:"7px 18px",borderRadius:8,
              border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer",fontSize:12}}>
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{padding:"7px 18px",borderRadius:8,border:"none",
                background:saving?"#555":emp.color,color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>
              {saving?"Guardando…":"💾 Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RealLineInput({label,value,onChange}) {
  return (
    <div style={{display:"grid",gridTemplateColumns:"1fr 120px",gap:8,alignItems:"center",marginBottom:5}}>
      <div style={{fontSize:11,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{label}</div>
      <input
        type="number" min="0" placeholder="0"
        value={value}
        onChange={e=>onChange(e.target.value)}
        style={{padding:"5px 8px",background:C.card2,border:`1px solid ${C.border}`,
          borderRadius:6,color:C.text,fontSize:11,textAlign:"right",outline:"none",
          width:"100%",boxSizing:"border-box"}}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CELDA EDITABLE INLINE — click para editar valor proyectado
// ═══════════════════════════════════════════════════════════════════
function CeldaEditable({val, onSave, color, canEdit, real=null}) {
  const [editing, setEditing] = useState(false);
  const [tmp, setTmp] = useState("");

  if(!canEdit) return (
    <span style={{color:val!==0?color:"#4a7aaa",fontWeight:val!==0?600:400,fontSize:9}}>
      {val!==0?$$(val):"—"}
      {real!=null&&real!==0&&<div style={{fontSize:7,color:C.yellow}}>R:{$$(real)}</div>}
    </span>
  );

  if(editing) return (
    <input
      type="number" value={tmp} autoFocus
      onChange={e=>setTmp(e.target.value)}
      onBlur={()=>{onSave(parseFloat(tmp)||0);setEditing(false);}}
      onKeyDown={e=>{
        if(e.key==="Enter"){onSave(parseFloat(tmp)||0);setEditing(false);}
        if(e.key==="Escape"){setEditing(false);}
      }}
      style={{width:72,padding:"2px 4px",background:C.bg,border:`1px solid ${C.accentL}`,
        borderRadius:4,color:C.accentL,fontSize:9,textAlign:"right",outline:"none"}}
    />
  );

  return (
    <span
      onClick={()=>{setTmp(String(val||""));setEditing(true);}}
      title="Click para editar"
      style={{color:val!==0?color:C.muted2,fontWeight:val!==0?600:400,fontSize:9,
        cursor:"pointer",borderBottom:`1px dashed ${C.border2}`,paddingBottom:1}}>
      {val!==0?$$(val):"—"}
      {real!=null&&real!==0&&<div style={{fontSize:7,color:C.yellow}}>R:{$$(real)}</div>}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS — Saldo banco indexado a semana
// ═══════════════════════════════════════════════════════════════════
function getSaldoBancoParaSemana(saldosBancos, empNombre, mesIdx, semIdx=0) {
  if(!saldosBancos||mesIdx<0) return null;
  const mesInfo=MESES_INFO[mesIdx]; if(!mesInfo) return null;
  const fechaLimite=new Date(mesInfo.y, mesInfo.m, 1+semIdx*7);
  const porBanco={};
  Object.entries(saldosBancos).forEach(([key,rec])=>{
    const parts=key.split("||");
    if(parts[0]!==empNombre||parts[2]!=="usd") return;
    if(!rec?.monto||!rec?.fecha) return;
    const f=new Date(rec.fecha);
    if(f<fechaLimite){
      const banco=parts[1];
      if(!porBanco[banco]||new Date(porBanco[banco].fecha)<f) porBanco[banco]=rec;
    }
  });
  let total=0,found=false;
  Object.values(porBanco).forEach(rec=>{total+=Number(rec.monto)||0;found=true;});
  return found?total:null;
}

function getSaldoBancoInicial(saldosBancos, empNombre, fallback) {
  if(!saldosBancos) return fallback;
  const porBanco={};
  Object.entries(saldosBancos).forEach(([key,rec])=>{
    const parts=key.split("||");
    if(parts[0]!==empNombre||parts[2]!=="usd") return;
    if(!rec?.monto||!rec?.fecha) return;
    const banco=parts[1];
    if(!porBanco[banco]||new Date(porBanco[banco].fecha)>new Date(rec.fecha)) porBanco[banco]=rec;
  });
  let total=0,found=false;
  Object.values(porBanco).forEach(rec=>{total+=Number(rec.monto)||0;found=true;});
  return found?total:fallback;
}

// ═══════════════════════════════════════════════════════════════════
// CONSOLIDADO — dentro de Flujo Empresas
// ═══════════════════════════════════════════════════════════════════
function Consolidado({empresas,saldosBancos}) {
  const empNames=Object.keys(empresas);
  const [vistaConsolidado,setVistaConsolidado]=useState("sumada");
  const [agrup,setAgrup]=useState("mes");
  const [openSeason,setOpenSeason]=useState(()=>{const o={};SEASON_KEYS.forEach((k,i)=>{o[k]=i<2;});return o;});

  const flujoPorEmp=useMemo(()=>{
    const res={};
    empNames.forEach(n=>{
      const arr=Z65();
      empresas[n].sections.forEach(sec=>sec.lines.forEach(l=>l.proy.forEach((v,i)=>{arr[i]+=(v||0)*sec.signo;})));
      res[n]=arr;
    });
    return res;
  },[empresas]); // eslint-disable-line

  const saldoIniPorEmp=useMemo(()=>{
    const res={};
    empNames.forEach(n=>{res[n]=getSaldoBancoInicial(saldosBancos,n,empresas[n].saldo_ini);});
    return res;
  },[saldosBancos,empresas]); // eslint-disable-line

  const acumPorEmp=useMemo(()=>{
    const res={};
    empNames.forEach(n=>{let a=saldoIniPorEmp[n];res[n]=(flujoPorEmp[n]||[]).map(f=>{a+=f;return a;});});
    return res;
  },[flujoPorEmp,saldoIniPorEmp]); // eslint-disable-line

  const flujoConsolidado=useMemo(()=>{
    const arr=Z65();
    empNames.forEach(n=>(flujoPorEmp[n]||[]).forEach((v,i)=>{arr[i]+=v;}));
    return arr;
  },[flujoPorEmp]); // eslint-disable-line

  const saldoIniConsolidado=useMemo(
    ()=>empNames.reduce((s,n)=>s+(saldoIniPorEmp[n]||0),0),
    [saldoIniPorEmp] // eslint-disable-line
  );

  const acumConsolidado=useMemo(()=>{
    let a=saldoIniConsolidado;
    return flujoConsolidado.map(f=>{a+=f;return a;});
  },[flujoConsolidado,saldoIniConsolidado]);

  const cols=useMemo(()=>{
    if(agrup==="temporada") return SEASONS.map(s=>({key:s.key,label:s.label,indices:s.indices,tipo:"temporada",isFirstInSeason:true,nSems:1}));
    return SEASONS.flatMap(s=>{
      if(!openSeason[s.key]) return [{key:s.key,label:s.label,indices:s.indices,tipo:"season_col",collapsed:true,isFirstInSeason:true,nSems:1}];
      if(agrup==="mes") return s.months.map((m,mi)=>({key:`${s.key}-${m}`,label:m,indices:[mIdx(m)],tipo:"mes",isFirstInSeason:mi===0,nSems:1,mes:m}));
      return s.months.flatMap((m,mi)=>{
        const sems=SEMANAS_MES[m]||[];const nSems=sems.length||1;const midx=mIdx(m);
        return sems.map((sw,si)=>({key:`${m}-${sw}`,label:sw,indices:[midx],tipo:"semana",nSems,mes:m,labelMes:m,semIdx:si,isFirstInSeason:mi===0&&si===0,isFirstInMes:si===0}));
      });
    });
  },[agrup,openSeason]);

  function colVal(arr,col){
    const sum=col.indices.reduce((a,i)=>a+(arr[i]||0),0);
    return agrup==="semana"&&!col.collapsed?sum/(col.nSems||1):sum;
  }

  function saldoBancoParaCol(empNombre,col){
    const fallback=saldoIniPorEmp[empNombre]||0;
    if(col.tipo==="temporada"||col.collapsed) return fallback;
    if(agrup==="mes") return getSaldoBancoParaSemana(saldosBancos,empNombre,col.indices[0],0)??fallback;
    return getSaldoBancoParaSemana(saldosBancos,empNombre,col.indices[0],col.semIdx??0)??fallback;
  }

  const THead=()=>(
    <thead>
      <tr style={{background:C.bg}}>
        <th style={{padding:"9px 14px",textAlign:"left",color:C.muted,fontSize:10,position:"sticky",left:0,background:C.bg,zIndex:4,minWidth:180,borderRight:`1px solid ${C.border}`}}>
          {vistaConsolidado==="sumada"?"Concepto":"Empresa / Concepto"}
        </th>
        {cols.map(col=>(
          <th key={col.key} onClick={col.collapsed?()=>setOpenSeason(p=>({...p,[col.key]:true})):undefined}
            style={{padding:"7px 7px",textAlign:"center",
              background:col.collapsed?C.bg2:col.tipo==="temporada"?C.card:C.bg,
              borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:`1px solid ${C.border}22`,
              fontSize:col.tipo==="temporada"?10:9,fontWeight:col.tipo==="temporada"?800:600,
              color:col.collapsed?C.accentL:col.tipo==="temporada"?"#fff":col.isFirstInSeason?C.accentL:C.muted,
              whiteSpace:"nowrap",minWidth:col.tipo==="temporada"?110:col.collapsed?80:agrup==="semana"?44:68,
              cursor:col.collapsed?"pointer":"default"}}>
            {col.collapsed?`▸ ${col.label}`:col.label}
          </th>
        ))}
      </tr>
      {agrup==="semana"&&(()=>{
        const rendered={};const cells=[];
        cols.forEach((col,ci)=>{
          if(col.collapsed){cells.push(<th key={`gap-${ci}`} style={{borderLeft:`2px solid ${C.border2}`,background:C.bg2}}/>);return;}
          if(col.tipo==="temporada"||rendered[col.mes]) return;
          const count=cols.filter(c=>c.mes===col.mes&&!c.collapsed).length;
          rendered[col.mes]=true;
          cells.push(<th key={`mh-${col.mes}`} colSpan={count} style={{padding:"4px 6px",textAlign:"center",background:C.card,fontSize:9,fontWeight:700,color:C.accentL,borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:`1px solid ${C.border}44`,whiteSpace:"nowrap"}}>{col.labelMes}</th>);
        });
        return(<tr style={{background:C.bg2}}><th style={{position:"sticky",left:0,background:C.bg2,zIndex:3,borderRight:`1px solid ${C.border}`}}/>{cells}</tr>);
      })()}
    </thead>
  );

  const FilaSaldoBanco=({nombre})=>(
    <tr style={{background:`${C.blue}15`,borderBottom:`2px solid ${C.border2}`}}>
      <td style={{padding:"7px 14px",position:"sticky",left:0,zIndex:1,background:`${C.blue}15`,borderRight:`1px solid ${C.border}`}}>
        <div style={{fontSize:11,fontWeight:700,color:C.blue}}>🏦 Saldo Banco USD</div>
        <div style={{fontSize:9,color:C.muted}}>{nombre==="_consolidado"?`Suma ${empNames.length} empresas · último registro previo al período`:"último registro previo al período"}</div>
      </td>
      {cols.map(col=>{
        const val=nombre==="_consolidado"
          ?empNames.reduce((s,n)=>s+(saldoBancoParaCol(n,col)||0),0)
          :(saldoBancoParaCol(nombre,col)||0);
        return(<td key={col.key} style={{padding:"6px 5px",textAlign:"right",fontWeight:700,fontSize:9,color:C.blue,background:`${C.blue}0d`,borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:`1px solid ${C.border}11`}}>{$$(val)}</td>);
      })}
    </tr>
  );

  const FilasFlujoYAcum=({flujoArr,acumArr,color=C.accentL,isTotal=false})=>(
    <>
      <tr style={{background:`${color}1a`,borderTop:`2px solid ${C.border2}`}}>
        <td style={{padding:"8px 14px",fontWeight:800,color,fontSize:isTotal?12:11,position:"sticky",left:0,background:C.card,zIndex:1,borderRight:`1px solid ${C.border}`}}>
          {isTotal?"Σ FLUJO NETO CONSOLIDADO":"Flujo Neto"}
        </td>
        {cols.map(col=>{const v=colVal(flujoArr,col);return(<td key={col.key} style={{padding:"7px 5px",textAlign:"right",fontWeight:isTotal?900:700,fontSize:isTotal?10:9,color:cf(v),background:`${cf(v)===C.green?C.green:C.red}0a`,borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:`1px solid ${C.border}22`}}>{$$(v)}</td>);})}
      </tr>
      <tr style={{background:`${C.blue}0a`}}>
        <td style={{padding:"8px 14px",fontWeight:800,color:C.blue,fontSize:isTotal?12:11,position:"sticky",left:0,background:C.card,zIndex:1,borderRight:`1px solid ${C.border}`}}>
          {isTotal?"Σ SALDO ACUMULADO CONSOLIDADO":"Saldo Acumulado"}
        </td>
        {cols.map(col=>{const lastIdx=col.indices[col.indices.length-1];const v=acumArr[lastIdx]||0;return(<td key={col.key} style={{padding:"7px 5px",textAlign:"right",fontWeight:isTotal?900:700,fontSize:isTotal?10:9,color:cf(v),borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:`1px solid ${C.border}22`}}>{$$(v)}</td>);})}
      </tr>
    </>
  );

  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10}}>
        <KPI label="Saldo Inicial Consolidado" value={$$(saldoIniConsolidado)} color={C.blue}/>
        <KPI label="Flujo Total 65m" value={$$(flujoConsolidado.reduce((a,b)=>a+b,0))} color={cf(flujoConsolidado.reduce((a,b)=>a+b,0))}/>
        <KPI label="Mínimo Acumulado" value={$$(Math.min(...acumConsolidado))} color={C.red}/>
        <KPI label="Saldo Final Jun-31" value={$$(acumConsolidado[acumConsolidado.length-1])} color={cf(acumConsolidado[acumConsolidado.length-1])}/>
        <KPI label="Empresas" value={empNames.length} color={C.yellow}/>
      </div>
      {/* Gráfico */}
      <Card>
        <SectionTitle>Flujo Acumulado Consolidado · {empNames.length} empresas · Mar-26 → Jun-31</SectionTitle>
        <LineChart months={MESES_65} values={acumConsolidado} color={C.accentL}/>
        {Math.min(...acumConsolidado)<0&&(
          <div style={{marginTop:8,padding:"8px 12px",background:`${C.red}18`,border:`1px solid ${C.red}33`,borderRadius:8,fontSize:11,color:C.muted}}>
            ⚠️ Mínimo proyectado: <strong style={{color:C.red}}>{$$(Math.min(...acumConsolidado))}</strong>
          </div>
        )}
      </Card>
      {/* Controles */}
      <Card>
        <div style={{display:"flex",gap:16,flexWrap:"wrap",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Vista</div>
            <div style={{display:"flex",gap:0,borderRadius:8,overflow:"hidden",border:`1px solid ${C.border}`}}>
              {[{id:"sumada",label:"🏛 Sumada"},{id:"por_empresa",label:"🏢 Por empresa"}].map(v=>(
                <button key={v.id} onClick={()=>setVistaConsolidado(v.id)}
                  style={{padding:"7px 18px",border:"none",cursor:"pointer",fontWeight:vistaConsolidado===v.id?800:500,fontSize:12,
                    background:vistaConsolidado===v.id?C.accent:"transparent",
                    color:vistaConsolidado===v.id?"#fff":C.muted,transition:"all 0.15s"}}>
                  {v.id==="sumada"?"🏛 Sumada":"🏢 Por empresa"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Agrupación</div>
            <div style={{display:"flex",gap:6}}>
              {[{id:"temporada",label:"🗓 Temporada"},{id:"mes",label:"📅 Mes"},{id:"semana",label:"📊 Semana"}].map(a=>(
                <Btn key={a.id} active={agrup===a.id} onClick={()=>setAgrup(a.id)} color={C.accent}>{a.label}</Btn>
              ))}
            </div>
          </div>
          {agrup!=="temporada"&&(
            <div>
              <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Temporadas</div>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {SEASONS.map(s=>(<Btn key={s.key} small active={!!openSeason[s.key]} onClick={()=>setOpenSeason(p=>({...p,[s.key]:!p[s.key]}))} color={C.muted}>{openSeason[s.key]?"▾":"▸"} T{s.sy}</Btn>))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Vista sumada */}
      {vistaConsolidado==="sumada"&&(
        <div style={{overflowX:"auto",borderRadius:12,border:`1px solid ${C.border}`}}>
          <table style={{borderCollapse:"collapse",fontSize:11,minWidth:600}}>
            <THead/>
            <tbody>
              <FilaSaldoBanco nombre="_consolidado"/>
              <FilasFlujoYAcum flujoArr={flujoConsolidado} acumArr={acumConsolidado} color={C.accentL} isTotal/>
            </tbody>
          </table>
        </div>
      )}

      {/* Vista por empresa */}
      {vistaConsolidado==="por_empresa"&&(
        <div style={{overflowX:"auto",borderRadius:12,border:`1px solid ${C.border}`}}>
          <table style={{borderCollapse:"collapse",fontSize:11,minWidth:600}}>
            <THead/>
            <tbody>
              {empNames.map((n,ei)=>{
                const emp=empresas[n];
                return(
                  <React.Fragment key={n}>
                    <tr style={{background:`${emp.color}22`}}>
                      <td colSpan={cols.length+1} style={{padding:"8px 14px",position:"sticky",left:0,background:`${emp.color}22`,borderTop:ei>0?`3px solid ${C.border2}`:"none"}}>
                        <div style={{fontSize:13,fontWeight:900,color:emp.color}}>{emp.emoji} {n}</div>
                        <div style={{fontSize:10,color:C.muted}}>{emp.desc}</div>
                      </td>
                    </tr>
                    <FilaSaldoBanco nombre={n}/>
                    {emp.sections.map(sec=>(
                      <React.Fragment key={sec.cat}>
                        <tr style={{background:C.bg2}}>
                          <td style={{padding:"5px 14px",position:"sticky",left:0,background:C.bg2,borderRight:`1px solid ${C.border}`,zIndex:1}}>
                            <span style={{fontSize:10,fontWeight:700,color:CAT_COLOR[sec.cat]||C.muted,textTransform:"uppercase",letterSpacing:"0.5px"}}>{CAT_SIGNO[sec.cat]} {sec.label}</span>
                          </td>
                          {cols.map(col=>(<td key={col.key} style={{borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:`1px solid ${C.border}11`,background:C.bg2}}/>))}
                        </tr>
                        {sec.lines.map(line=>(
                          <tr key={line.label} style={{borderBottom:`1px solid ${C.border}11`}}>
                            <td style={{padding:"5px 14px 5px 22px",color:C.text,fontSize:11,position:"sticky",left:0,background:C.card,zIndex:1,borderRight:`1px solid ${C.border}`,whiteSpace:"nowrap",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis"}}>{line.label}</td>
                            {cols.map(col=>{
                              const v=colVal(line.proy,col);
                              return(<td key={col.key} style={{padding:"4px 5px",textAlign:"right",fontSize:9,fontWeight:v!==0?600:400,color:v!==0?(sec.signo>0?C.green:C.red):C.muted2,borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:`1px solid ${C.border}11`}}>{v!==0?$$(v):"—"}</td>);
                            })}
                          </tr>
                        ))}
                        <tr style={{background:C.bg2}}>
                          <td style={{padding:"5px 14px",fontWeight:700,fontSize:10,color:CAT_COLOR[sec.cat]||C.muted,position:"sticky",left:0,background:C.bg2,borderRight:`1px solid ${C.border}`,zIndex:1}}>Σ {sec.label}</td>
                          {cols.map(col=>{const v=sec.lines.reduce((a,l)=>a+colVal(l.proy,col),0);return(<td key={col.key} style={{padding:"5px 5px",textAlign:"right",fontWeight:700,fontSize:9,color:CAT_COLOR[sec.cat]||C.muted,borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:`1px solid ${C.border}22`}}>{v!==0?$$(v):"—"}</td>);})}
                        </tr>
                      </React.Fragment>
                    ))}
                    <FilasFlujoYAcum flujoArr={flujoPorEmp[n]||Z65()} acumArr={acumPorEmp[n]||Z65()} color={emp.color} isTotal={false}/>
                  </React.Fragment>
                );
              })}
              <tr><td colSpan={cols.length+1} style={{height:6,background:`linear-gradient(90deg,${C.accent}66,${C.border})`}}/></tr>
              <FilaSaldoBanco nombre="_consolidado"/>
              <FilasFlujoYAcum flujoArr={flujoConsolidado} acumArr={acumConsolidado} color={C.accentL} isTotal/>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// FLUJO POR EMPRESA — v2: totales mes/temporada + edición + saldo banco
// ═══════════════════════════════════════════════════════════════════
function FlujoEmpresa({empNombre,empresas,realData,onSaveReal,canEdit,saldosBancos,onSaveProy}) {
  const emp=empresas[empNombre];
  const [vista,setVista]=useState("mensual");
  const [openSeason,setOpenSeason]=useState({[SEASON_KEYS[0]]:true,[SEASON_KEYS[1]]:true});
  const [openMonth,setOpenMonth]=useState({});
  const [showReal,setShowReal]=useState(false);
  const [modalSem,setModalSem]=useState(null);
  // Overrides de proyección editados por el usuario: { lineLabel: { idx: valor } }
  const [proyOverrides, setProyOverrides] = useState({});

  const toggleSeason=key=>setOpenSeason(p=>({...p,[key]:!p[key]}));
  const toggleMonth=mes=>setOpenMonth(p=>({...p,[mes]:!p[mes]}));
  const isMonthOpen=mes=>openMonth[mes]!==false;

  // ── Saldo banco USD: último registro por banco, anterior a hoy ──
  const saldoBancoUSD = useMemo(()=>{
    if(!saldosBancos) return null;
    const HOY = new Date();
    const porBanco = {};
    Object.entries(saldosBancos).forEach(([key, rec])=>{
      const parts = key.split("||");
      if(parts[0]!==empNombre || parts[2]!=="usd") return;
      if(!rec?.monto || !rec?.fecha) return;
      const f = new Date(rec.fecha);
      if(f > HOY) return;
      const banco = parts[1];
      if(!porBanco[banco] || new Date(porBanco[banco].fecha) < f) porBanco[banco] = rec;
    });
    let total = 0, found = false;
    Object.values(porBanco).forEach(rec=>{total += Number(rec.monto)||0; found = true;});
    return found ? total : null;
  },[saldosBancos, empNombre]);

  // ── Valor proyectado efectivo (base + override) ────────────────
  const getProy = useCallback((lineLabel, idx) => {
    if(proyOverrides[lineLabel]?.[idx] !== undefined)
      return proyOverrides[lineLabel][idx];
    // buscar en emp.sections
    for(const sec of emp.sections){
      const l = sec.lines.find(x=>x.label===lineLabel);
      if(l) return l.proy[idx]||0;
    }
    return 0;
  },[proyOverrides, emp]);

  // Guardar override y persistir en Supabase
  const handleEditProy = useCallback((lineLabel, idx, nuevoVal) => {
    setProyOverrides(prev=>{
      const next = JSON.parse(JSON.stringify(prev));
      if(!next[lineLabel]) next[lineLabel]={};
      next[lineLabel][idx] = nuevoVal;
      // Persistir async
      if(onSaveProy) onSaveProy(empNombre, lineLabel, idx, nuevoVal);
      return next;
    });
  },[empNombre, onSaveProy]);

  // Cargar overrides desde realData cuando cambia la empresa
  useEffect(()=>{
    const ov = realData?.[empNombre]?._proyOverrides || {};
    setProyOverrides(ov);
  },[realData, empNombre]);

  const realMensual=useMemo(()=>{
    const rm={};
    MESES_65.forEach(mes=>{
      const sd=realData?.[empNombre]?.[mes]||{};
      const lines={};
      Object.values(sd).forEach(sv=>{
        if(typeof sv==="object"&&!Array.isArray(sv)){
          Object.entries(sv).forEach(([lbl,v])=>{lines[lbl]=(lines[lbl]||0)+(Number(v)||0);});
        }
      });
      rm[mes]=lines;
    });
    return rm;
  },[realData,empNombre]);

  // Flujo con overrides aplicados
  const {flujoArr, acumArr} = useMemo(()=>{
    const saldoIni = saldoBancoUSD != null ? saldoBancoUSD : emp.saldo_ini;
    const fa = MESES_65.map((_,i)=>{
      let f=0;
      emp.sections.forEach(sec=>sec.lines.forEach(l=>{
        const v = proyOverrides[l.label]?.[i] !== undefined
          ? proyOverrides[l.label][i]
          : (l.proy[i]||0);
        f += v * sec.signo;
      }));
      return f;
    });
    let a = saldoIni;
    const aa = fa.map(f=>{a+=f;return a;});
    return {flujoArr:fa, acumArr:aa};
  },[emp, proyOverrides, saldoBancoUSD]);

  // Flujo neto por mes (para totales mensuales en vista semanal)
  const flujoMes = useMemo(()=>{
    const fm={};
    MESES_65.forEach((mes,i)=>{ fm[mes]=flujoArr[i]; });
    return fm;
  },[flujoArr]);

  const colStructure=useMemo(()=>{
    return SEASONS.map(s=>{
      if(!openSeason[s.key]) return {season:s,collapsed:true,cols:[]};
      if(vista==="mensual"){
        return {season:s,collapsed:false,cols:s.months.map(m=>({
          type:"month",mes:m,idx:mIdx(m),nSems:1,
          label:m,isFirstInSeason:s.months[0]===m
        }))};
      }
      const cols=[];
      s.months.forEach((m,mi)=>{
        const sems=SEMANAS_MES[m]||[];
        const nSems=sems.length||1;
        const open=isMonthOpen(m);
        if(!open){
          cols.push({type:"month_collapsed",mes:m,idx:mIdx(m),nSems,label:m,
            isFirstInSeason:mi===0,isMonthHeader:true});
        } else {
          sems.forEach((sw,si)=>{
            cols.push({type:"week",mes:m,semana:sw,idx:mIdx(m),nSems,
              label:sw,isFirstInSeason:mi===0&&si===0,isFirstInMonth:si===0});
          });
          // Columna total mensual al final
          cols.push({type:"month_total",mes:m,idx:mIdx(m),nSems,
            label:`Σ ${m}`,isFirstInSeason:false,isMonthHeader:false,isTotalMes:true});
        }
      });
      return {season:s,collapsed:false,cols};
    });
  },[openSeason,openMonth,vista,emp]); // eslint-disable-line

  // ── helper: valor efectivo de una línea en una col ─────────────
  function getValCol(line, col) {
    const rawMes = getProy(line.label, col.idx);
    if(col.type==="month_collapsed" || col.type==="month" || col.type==="month_total") {
      return rawMes;
    }
    // semana: valor mensual / nSems
    return rawMes / col.nSems;
  }

  function renderTabla() {
    const saldoIni = saldoBancoUSD != null ? saldoBancoUSD : emp.saldo_ini;

    return (
      <div style={{overflowX:"auto",borderRadius:12,border:`1px solid ${C.border}`}}>
        <table style={{borderCollapse:"collapse",fontSize:11,minWidth:600}}>
          <thead>
            {/* Fila 1: temporadas */}
            <tr style={{background:C.bg}}>
              <th style={{padding:"8px 14px",textAlign:"left",color:C.muted,fontSize:10,
                position:"sticky",left:0,background:C.bg,zIndex:3,minWidth:210,
                borderRight:`1px solid ${C.border}`}}>
                Línea {canEdit&&<span style={{fontSize:8,color:C.accentL,marginLeft:4}}>✏️ editable</span>}
              </th>
              {colStructure.map(({season:s,collapsed,cols})=>{
                const span=collapsed?1:Math.max(cols.length,1);
                return (
                  <th key={s.key} colSpan={span} onClick={()=>toggleSeason(s.key)}
                    style={{padding:"7px 10px",textAlign:"center",
                      background:!collapsed?C.card:C.bg,
                      borderLeft:`2px solid ${C.border2}`,cursor:"pointer",
                      fontSize:10,fontWeight:700,color:"#fff",whiteSpace:"nowrap"}}>
                    {!collapsed?"▾":"▸"} {s.label}
                  </th>
                );
              })}
            </tr>
            {/* Fila 2 (semanal): headers de mes */}
            {vista==="semanal"&&(
              <tr style={{background:C.bg2}}>
                <th style={{position:"sticky",left:0,background:C.bg2,zIndex:3,borderRight:`1px solid ${C.border}`}}/>
                {colStructure.map(({season:s,collapsed,cols})=>{
                  if(collapsed) return <th key={s.key} style={{borderLeft:`2px solid ${C.border2}`,background:C.bg2}}/>;
                  const byMes={};
                  cols.forEach(col=>{
                    if(!byMes[col.mes]) byMes[col.mes]={mes:col.mes,count:0,isFirstInSeason:col.isFirstInSeason};
                    byMes[col.mes].count++;
                  });
                  return Object.values(byMes).map(({mes,count,isFirstInSeason})=>(
                    <th key={`${s.key}-mh-${mes}`} colSpan={count}
                      onClick={()=>toggleMonth(mes)}
                      style={{padding:"4px 6px",textAlign:"center",
                        background:isMonthOpen(mes)?C.card:C.bg,
                        borderLeft:isFirstInSeason?`2px solid ${C.border2}`:`1px solid ${C.border}44`,
                        cursor:"pointer",fontSize:9,fontWeight:700,
                        color:isMonthOpen(mes)?C.accentL:C.muted,whiteSpace:"nowrap"}}>
                      {isMonthOpen(mes)?"▾":"▸"} {mes}
                    </th>
                  ));
                })}
              </tr>
            )}
            {/* Fila 3: semanas / meses */}
            <tr style={{background:C.bg}}>
              <th style={{position:"sticky",left:0,background:C.bg,zIndex:3,borderRight:`1px solid ${C.border}`}}/>
              {colStructure.map(({season:s,collapsed,cols})=>{
                if(collapsed) return (
                  <th key={s.key} style={{padding:"4px 8px",color:C.muted,fontSize:9,
                    borderLeft:`2px solid ${C.border2}`,textAlign:"center",background:C.bg}}>
                    {s.months.length}m
                  </th>
                );
                return cols.map((col,ci)=>{
                  const isFirst=col.isFirstInSeason||col.isFirstInMonth;
                  const isTot=col.isTotalMes;
                  return (
                    <th key={`${s.key}-${col.label}-${ci}`}
                      style={{padding:"4px 6px",textAlign:"center",
                        color:isTot?C.yellow:col.type==="month_collapsed"?C.accentL:C.muted,
                        fontSize:isTot?8:col.type==="month_collapsed"?9:8,
                        fontWeight:isTot?800:col.type==="month_collapsed"?700:500,
                        whiteSpace:"nowrap",
                        minWidth:isTot?70:vista==="semanal"?46:68,
                        background:isTot?`${C.yellow}18`:C.bg,
                        borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:isFirst?`1px solid ${C.border}55`:`1px solid ${C.border}11`,
                        cursor:col.type==="month_collapsed"?"pointer":"default"}}
                      onClick={col.type==="month_collapsed"?()=>toggleMonth(col.mes):undefined}>
                      {col.type==="month_collapsed"?`▸ ${col.label}`:col.label}
                    </th>
                  );
                });
              })}
            </tr>
          </thead>
          <tbody>
            {/* FILA SALDO BANCO ──────────────────────────────────── */}
            <tr style={{background:`${C.blue}18`,borderBottom:`2px solid ${C.border2}`}}>
              <td style={{padding:"7px 14px",position:"sticky",left:0,
                background:`${C.blue}18`,borderRight:`1px solid ${C.border}`,zIndex:1}}>
                <div style={{fontSize:11,fontWeight:700,color:C.blue}}>🏦 Saldo Banco (USD)</div>
                <div style={{fontSize:9,color:C.muted}}>
                  {saldoBancoUSD!=null
                    ? "desde Saldos Bancos · cuentas USD"
                    : `saldo inicial base: ${$$(emp.saldo_ini)}`}
                </div>
              </td>
              {colStructure.map(({season:s,collapsed,cols})=>{
                if(collapsed) return (
                  <td key={s.key} style={{padding:"7px 8px",textAlign:"right",fontWeight:800,
                    fontSize:11,color:C.blue,borderLeft:`2px solid ${C.border2}`}}>
                    {$$(saldoIni)}
                  </td>
                );
                return cols.map((col,ci)=>{
                  const isFirst=col.isFirstInSeason||col.isFirstInMonth;
                  const isTot=col.isTotalMes;
                  return (
                    <td key={`banco-${col.mes}-${ci}`}
                      style={{padding:"6px 5px",textAlign:"right",fontWeight:isTot?800:700,
                        fontSize:isTot?10:9,color:isTot?C.yellow:C.blue,
                        background:`${C.blue}12`,
                        borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:isFirst?`1px solid ${C.border}44`:`1px solid ${C.border}11`}}>
                      {/* Solo mostrar en primera col de cada mes o total */}
                      {(col.isFirstInSeason||col.isFirstInMonth||isTot)
                        ? $$(saldoIni)
                        : ""}
                    </td>
                  );
                });
              })}
            </tr>

            {/* SECCIONES Y LÍNEAS ───────────────────────────────── */}
            {emp.sections.map(sec=>(
              <React.Fragment key={sec.cat}>
                {/* Header sección */}
                <tr style={{background:`${C.bg}cc`}}>
                  <td style={{padding:"5px 14px",position:"sticky",left:0,
                    background:C.bg,borderRight:`1px solid ${C.border}`,zIndex:1}}>
                    <span style={{fontSize:10,fontWeight:700,color:CAT_COLOR[sec.cat]||C.muted,
                      textTransform:"uppercase",letterSpacing:"0.5px"}}>
                      {CAT_SIGNO[sec.cat]} {sec.label}
                    </span>
                  </td>
                  {colStructure.map(({season:s,collapsed,cols})=>{
                    const span=collapsed?1:Math.max(cols.length,1);
                    return <td key={s.key} colSpan={span}
                      style={{borderLeft:`2px solid ${C.border2}`,background:C.bg}}/>;
                  })}
                </tr>

                {/* Líneas editables */}
                {sec.lines.map(line=>(
                  <tr key={line.label} style={{borderBottom:`1px solid ${C.border}11`}}>
                    <td style={{padding:"5px 14px",color:line.formula?C.yellow:C.text,fontSize:11,
                      position:"sticky",left:0,background:C.card,zIndex:1,
                      borderRight:`1px solid ${C.border}`,whiteSpace:"nowrap",
                      maxWidth:220,overflow:"hidden",textOverflow:"ellipsis"}}>
                      {line.formula&&<span style={{fontSize:9,marginRight:3}}>⚡</span>}
                      {proyOverrides[line.label]&&<span style={{fontSize:8,color:C.accentL,marginRight:3}} title="Valor editado">●</span>}
                      {line.label}
                    </td>
                    {colStructure.map(({season:s,collapsed,cols})=>{
                      if(collapsed){
                        const total=s.indices.reduce((a,i)=>a+getProy(line.label,i),0);
                        return (
                          <td key={s.key} style={{padding:"5px 8px",textAlign:"right",
                            color:total!==0?(sec.signo>0?C.green:C.red):C.muted2,
                            fontSize:10,fontWeight:total!==0?600:400,
                            borderLeft:`2px solid ${C.border2}`,background:C.card}}>
                            {/* Total temporada para esta línea */}
                            <div style={{fontSize:8,color:C.muted,marginBottom:1}}>Total T</div>
                            {total!==0?$$(total):"—"}
                          </td>
                        );
                      }
                      return cols.map((col,ci)=>{
                        const isTot=col.isTotalMes;
                        const valMes=getProy(line.label,col.idx);
                        const val=isTot ? valMes : (col.type==="month_collapsed" ? valMes : valMes/col.nSems);
                        const real=vista==="mensual"?(realMensual[col.mes]?.[line.label]||null):null;
                        const isFirst=col.isFirstInSeason||col.isFirstInMonth;
                        const isEditable=canEdit&&!line.formula&&!isTot&&col.type!=="month_collapsed";
                        return (
                          <td key={`${col.mes}-${col.label}-${line.label}-${ci}`}
                            style={{padding:"4px 5px",textAlign:"right",fontSize:9,
                              background:isTot?`${C.yellow}12`:C.card,
                              borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:isFirst?`1px solid ${C.border}44`:`1px solid ${C.border}11`}}>
                            {isTot ? (
                              // Columna total mes: siempre solo muestra, no edita
                              <span style={{color:val!==0?(sec.signo>0?C.green:C.red):C.muted2,
                                fontWeight:val!==0?700:400,fontSize:9}}>
                                {val!==0?$$(val):"—"}
                              </span>
                            ) : col.type==="month_collapsed" ? (
                              <CeldaEditable
                                val={val}
                                color={sec.signo>0?C.green:C.red}
                                canEdit={canEdit&&!line.formula}
                                real={real}
                                onSave={v=>handleEditProy(line.label,col.idx,v)}
                              />
                            ) : (
                              <CeldaEditable
                                val={val}
                                color={sec.signo>0?C.green:C.red}
                                canEdit={isEditable}
                                real={real}
                                onSave={v=>{
                                  // Al editar una semana, guardar el valor mensual total (v * nSems)
                                  handleEditProy(line.label,col.idx,v*col.nSems);
                                }}
                              />
                            )}
                          </td>
                        );
                      });
                    })}
                  </tr>
                ))}

                {/* Subtotal sección */}
                <tr style={{background:C.bg2}}>
                  <td style={{padding:"5px 14px",fontWeight:700,color:CAT_COLOR[sec.cat],fontSize:10,
                    position:"sticky",left:0,background:C.bg2,borderRight:`1px solid ${C.border}`,zIndex:1}}>
                    Σ {sec.label}
                  </td>
                  {colStructure.map(({season:s,collapsed,cols})=>{
                    if(collapsed){
                      const total=s.indices.reduce((a,i)=>a+sec.lines.reduce((b,l)=>b+getProy(l.label,i),0),0);
                      return (
                        <td key={s.key} style={{padding:"5px 8px",textAlign:"right",fontWeight:800,
                          color:CAT_COLOR[sec.cat],fontSize:10,borderLeft:`2px solid ${C.border2}`,background:C.bg2}}>
                          <div style={{fontSize:8,color:C.muted,marginBottom:1}}>Total T</div>
                          {total!==0?$$(total):"—"}
                        </td>
                      );
                    }
                    return cols.map((col,ci)=>{
                      const isTot=col.isTotalMes;
                      const nSems=col.type==="month_collapsed"||isTot?1:col.nSems;
                      const total=sec.lines.reduce((a,l)=>a+getProy(l.label,col.idx)/nSems,0);
                      const isFirst=col.isFirstInSeason||col.isFirstInMonth;
                      return (
                        <td key={`sub-${col.mes}-${col.label}-${ci}`}
                          style={{padding:"4px 5px",textAlign:"right",fontWeight:isTot?800:700,
                            color:CAT_COLOR[sec.cat],fontSize:isTot?10:9,
                            background:isTot?`${C.yellow}18`:C.bg2,
                            borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:isFirst?`1px solid ${C.border}44`:`1px solid ${C.border}11`}}>
                          {total!==0?$$(total):"—"}
                        </td>
                      );
                    });
                  })}
                </tr>
              </React.Fragment>
            ))}

            {/* FLUJO NETO ──────────────────────────────────────── */}
            <tr style={{background:`${C.accent}18`,borderTop:`2px solid ${C.border2}`}}>
              <td style={{padding:"7px 14px",fontWeight:800,color:C.accentL,fontSize:11,
                position:"sticky",left:0,background:C.card,borderRight:`1px solid ${C.border}`,zIndex:1}}>
                FLUJO NETO
              </td>
              {colStructure.map(({season:s,collapsed,cols})=>{
                if(collapsed){
                  const total=s.indices.reduce((a,i)=>a+flujoArr[i],0);
                  return (
                    <td key={s.key} style={{padding:"7px 8px",textAlign:"right",fontWeight:800,
                      fontSize:11,color:cf(total),borderLeft:`2px solid ${C.border2}`}}>
                      <div style={{fontSize:8,color:C.muted,marginBottom:1}}>Total T</div>
                      {$$(total)}
                    </td>
                  );
                }
                return cols.map((col,ci)=>{
                  const isTot=col.isTotalMes;
                  const nSems=col.type==="month_collapsed"||isTot?1:col.nSems;
                  const val=flujoArr[col.idx]/nSems;
                  const isFirst=col.isFirstInSeason||col.isFirstInMonth;
                  return (
                    <td key={`flujo-${col.mes}-${col.label}-${ci}`}
                      style={{padding:"6px 5px",textAlign:"right",fontWeight:isTot?900:800,
                        fontSize:isTot?10:9,color:cf(val),
                        background:isTot?`${C.yellow}18`:"transparent",
                        borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:isFirst?`1px solid ${C.border}44`:`1px solid ${C.border}11`}}>
                      {$$(val)}
                    </td>
                  );
                });
              })}
            </tr>

            {/* SALDO ACUMULADO ─────────────────────────────────── */}
            <tr style={{background:`${C.blue}11`}}>
              <td style={{padding:"7px 14px",fontWeight:800,color:C.blue,fontSize:11,
                position:"sticky",left:0,background:C.card,borderRight:`1px solid ${C.border}`,zIndex:1}}>
                SALDO ACUM.
              </td>
              {colStructure.map(({season:s,collapsed,cols})=>{
                if(collapsed){
                  const last=s.indices[s.indices.length-1];
                  return (
                    <td key={s.key} style={{padding:"7px 8px",textAlign:"right",fontWeight:800,
                      fontSize:11,color:cf(acumArr[last]),borderLeft:`2px solid ${C.border2}`}}>
                      <div style={{fontSize:8,color:C.muted,marginBottom:1}}>Fin T</div>
                      {$$(acumArr[last])}
                    </td>
                  );
                }
                return cols.map((col,ci)=>{
                  const isTot=col.isTotalMes;
                  const isFirst=col.isFirstInSeason||col.isFirstInMonth;
                  return (
                    <td key={`acum-${col.mes}-${col.label}-${ci}`}
                      style={{padding:"6px 5px",textAlign:"right",fontWeight:isTot?900:700,
                        fontSize:isTot?10:9,color:cf(acumArr[col.idx]),
                        background:isTot?`${C.yellow}18`:"transparent",
                        borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:isFirst?`1px solid ${C.border}44`:`1px solid ${C.border}11`}}>
                      {$$(acumArr[col.idx])}
                    </td>
                  );
                });
              })}
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  const saldoIni = saldoBancoUSD != null ? saldoBancoUSD : emp.saldo_ini;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {/* Header empresa */}
      <div style={{background:`${emp.color}15`,border:`1px solid ${emp.color}44`,borderRadius:12,
        padding:"14px 18px",display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
        <span style={{fontSize:28}}>{emp.emoji}</span>
        <div style={{flex:1}}>
          <div style={{fontSize:14,fontWeight:900,color:C.text}}>{empNombre}</div>
          <div style={{fontSize:11,color:C.muted}}>{emp.desc}</div>
          {emp.hasFormula&&<div style={{fontSize:10,color:C.yellow,marginTop:2}}>⚡ Calculado desde Parámetros</div>}
        </div>
        <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
          {[
            {l:"Saldo Banco USD", v:saldoBancoUSD!=null?saldoBancoUSD:emp.saldo_ini, c:C.blue,
              sub:saldoBancoUSD!=null?"desde Saldos Bancos":"saldo base"},
            {l:"Flujo total",     v:flujoArr.reduce((a,b)=>a+b,0), c:cf(flujoArr.reduce((a,b)=>a+b,0))},
            {l:"Saldo Jun-31",   v:acumArr[acumArr.length-1], c:cf(acumArr[acumArr.length-1])},
          ].map(k=>(
            <div key={k.l} style={{textAlign:"right"}}>
              <div style={{fontSize:9,color:C.muted,textTransform:"uppercase"}}>{k.l}</div>
              {k.sub&&<div style={{fontSize:8,color:C.muted2}}>{k.sub}</div>}
              <div style={{fontSize:13,fontWeight:800,color:k.c}}>{$$(k.v)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Controles */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <Btn active={vista==="mensual"} onClick={()=>setVista("mensual")} color={emp.color}>📅 Mensual</Btn>
        <Btn active={vista==="semanal"} onClick={()=>setVista("semanal")} color={emp.color}>📊 Semanal</Btn>
        <div style={{marginLeft:8,display:"flex",gap:5,flexWrap:"wrap"}}>
          <span style={{fontSize:10,color:C.muted,alignSelf:"center"}}>Temporadas:</span>
          {SEASONS.map(s=>(
            <Btn key={s.key} small active={!!openSeason[s.key]} onClick={()=>toggleSeason(s.key)} color={C.muted}>
              {openSeason[s.key]?"▾":"▸"} T{s.sy}
            </Btn>
          ))}
        </div>
        {canEdit&&(
          <div style={{marginLeft:"auto",display:"flex",gap:8}}>
            {Object.keys(proyOverrides).length>0&&(
              <button onClick={()=>{
                  setProyOverrides({});
                  if(onSaveProy) onSaveProy(empNombre,"_clear_all",0,0);
                }}
                style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${C.red}`,
                  background:`${C.red}18`,color:C.red,cursor:"pointer",fontSize:11,fontWeight:600}}>
                ↺ Restablecer proyección
              </button>
            )}
            <button onClick={()=>setShowReal(v=>!v)}
              style={{padding:"6px 14px",borderRadius:8,
                border:`1px solid ${showReal?emp.color:C.border}`,
                background:showReal?`${emp.color}22`:"transparent",
                color:showReal?emp.color:C.muted,cursor:"pointer",fontSize:11,fontWeight:600}}>
              ✏️ Ingresar Real
            </button>
          </div>
        )}
      </div>

      {canEdit&&(
        <div style={{background:`${C.accentL}15`,border:`1px solid ${C.accentL}33`,borderRadius:8,
          padding:"7px 14px",fontSize:11,color:C.accentL}}>
          💡 Haz click en cualquier valor proyectado para editarlo. Los cambios se guardan automáticamente.
          {Object.keys(proyOverrides).length>0&&
            <span style={{marginLeft:8,color:C.yellow}}>● {Object.keys(proyOverrides).length} línea(s) con valores modificados</span>}
        </div>
      )}

      {renderTabla()}

      {/* Panel ingreso real */}
      {showReal&&canEdit&&(
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <SectionTitle>Datos reales por semana</SectionTitle>
            <button onClick={()=>setShowReal(false)}
              style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:16}}>×</button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {SEASONS.flatMap(s=>s.months).map(mes=>{
              const sd=realData?.[empNombre]?.[mes]||{};
              return (
                <div key={mes} style={{background:C.card2,borderRadius:8,padding:"10px 14px"}}>
                  <div style={{fontWeight:700,fontSize:12,color:C.text,marginBottom:8}}>{mes}</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {(SEMANAS_MES[mes]||["S-única"]).map(sem=>{
                      const has=sd[sem]&&Object.keys(sd[sem]).length>0;
                      return (
                        <button key={sem} onClick={()=>setModalSem({mes,semana:sem})}
                          style={{padding:"5px 12px",borderRadius:8,cursor:"pointer",fontSize:11,
                            fontWeight:has?700:400,
                            border:`1px solid ${has?emp.color:C.border}`,
                            background:has?`${emp.color}22`:"transparent",
                            color:has?emp.color:C.muted}}>
                          {sem}{has&&" ✓"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card>
        <SectionTitle>Saldo Acumulado — Mar-26 → Jun-31</SectionTitle>
        <LineChart months={MESES_65} values={acumArr} color={emp.color}/>
      </Card>

      {modalSem&&(
        <ModalIngreso
          emp={emp}
          empNombre={empNombre}
          mes={modalSem.mes}
          semana={modalSem.semana}
          existing={realData?.[empNombre]?.[modalSem.mes]?.[modalSem.semana]}
          onSave={onSaveReal}
          onClose={()=>setModalSem(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════
function Dashboard({empresas}) {
  const gmAcum=useMemo(()=>{
    let acc=Object.values(empresas).reduce((s,e)=>s+e.saldo_ini,0);
    return MESES_65.map((_,i)=>{let f=0;Object.values(empresas).forEach(e=>e.sections.forEach(sec=>sec.lines.forEach(l=>{f+=(l.proy[i]||0)*sec.signo;})));acc+=f;return acc;});
  },[empresas]);
  const empTotals=Object.entries(empresas).map(([n,e])=>({n,totalIng:e.sections.filter(s=>s.signo>0).flatMap(s=>s.lines).reduce((a,l)=>a+l.proy.reduce((b,v)=>b+v,0),0)})).filter(e=>e.totalIng>0).sort((a,b)=>b.totalIng-a.totalIng);
  const maxIng=empTotals[0]?.totalIng||1;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
        <KPI label="Saldo Caja Actual"      value={$$(411252)}                  color={C.green}/>
        <KPI label="Créditos Totales Q1-26" value={$$(8355763)}                 color={C.red}/>
        <KPI label="Mínimo Acum. (65m)"     value={$$(Math.min(...gmAcum))}     color={C.red}/>
        <KPI label="Saldo Final Jun-31"     value={$$(gmAcum[gmAcum.length-1])} color={cf(gmAcum[gmAcum.length-1])}/>
      </div>
      <Card>
        <SectionTitle>Flujo Acumulado Consolidado — Mar-26 → Jun-31 (6 Temporadas)</SectionTitle>
        <LineChart months={MESES_65} values={gmAcum} color={C.accentL}/>
        <div style={{marginTop:8,padding:"8px 12px",background:`${C.red}18`,border:`1px solid ${C.red}33`,borderRadius:8,fontSize:11,color:C.muted}}>
          ⚠️ Mínimo proyectado: <strong style={{color:C.red}}>{$$(Math.min(...gmAcum))}</strong>
        </div>
      </Card>
      <Card>
        <SectionTitle>Ingresos Proyectados 65m por Empresa</SectionTitle>
        {empTotals.map(({n,totalIng})=>{
          const e=empresas[n];
          return (
            <div key={n} style={{display:"flex",alignItems:"center",gap:10,marginBottom:7}}>
              <div style={{width:148,fontSize:11,color:C.text,flexShrink:0}}>{e.emoji} {n}</div>
              <div style={{flex:1,background:C.card2,borderRadius:4,height:12,overflow:"hidden"}}>
                <div style={{width:`${(totalIng/maxIng)*100}%`,height:"100%",background:e.color,borderRadius:4,opacity:0.75}}/>
              </div>
              <div style={{width:80,textAlign:"right",fontSize:11,fontWeight:700,color:C.green,flexShrink:0}}>{$$(totalIng)}</div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CRÉDITOS
// ═══════════════════════════════════════════════════════════════════
function Creditos({empresas}) {
  const [busq,setBusq]=useState("");
  const [filtEmp,setFiltEmp]=useState("Todas");
  const empList=["Todas",...new Set(CREDITOS.map(c=>c.empresa))];
  const filtered=CREDITOS.filter(c=>{
    if(filtEmp!=="Todas"&&c.empresa!==filtEmp) return false;
    if(busq&&![c.empresa,c.acreedor].some(s=>s.toLowerCase().includes(busq.toLowerCase()))) return false;
    return true;
  });
  const deudaEmp={};CREDITOS.forEach(c=>{if(!deudaEmp[c.empresa])deudaEmp[c.empresa]=0;deudaEmp[c.empresa]+=c.monto;});
  const deudaList=Object.entries(deudaEmp).sort((a,b)=>b[1]-a[1]);
  const maxD=deudaList[0]?.[1]||1;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
        <KPI label="Deuda Total Q1-2026" value={$$(CREDITOS_TRIM.saldos[0])} color={C.red}/>
        <KPI label="Pagos Q1-2026"       value={$$(CREDITOS_TRIM.pagos[0])}  color={C.yellow}/>
        <KPI label="N° Créditos"         value={CREDITOS.length}             color={C.blue}/>
      </div>
      <Card>
        <SectionTitle>Deuda por Empresa</SectionTitle>
        {deudaList.map(([n,monto])=>{const e=empresas[n]||{emoji:"🏢",color:C.blue};return (
          <div key={n} style={{display:"flex",alignItems:"center",gap:10,marginBottom:7}}>
            <div style={{width:148,fontSize:11,color:C.text,flexShrink:0}}>{e.emoji} {n}</div>
            <div style={{flex:1,background:C.card2,borderRadius:4,height:12,overflow:"hidden"}}><div style={{width:`${(monto/maxD)*100}%`,height:"100%",background:C.red,borderRadius:4,opacity:0.6}}/></div>
            <div style={{width:80,textAlign:"right",fontSize:11,fontWeight:700,color:C.red,flexShrink:0}}>{$$(monto)}</div>
          </div>
        );})}
      </Card>
      <Card style={{padding:"12px 16px"}}>
        <SectionTitle>Saldo Deuda por Trimestre</SectionTitle>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{background:C.bg2}}>
              {["Trimestre","Pagos","Saldo Deuda"].map(h=><th key={h} style={{padding:"7px 12px",fontWeight:600,fontSize:10,color:C.muted,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`,textAlign:h==="Trimestre"?"left":"right"}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {CREDITOS_TRIM.quarters.map((q,i)=>(
                <tr key={q} style={{borderBottom:`1px solid ${C.border}22`}}>
                  <td style={{padding:"7px 12px",fontWeight:600,color:C.text}}>{q}</td>
                  <td style={{padding:"7px 12px",textAlign:"right",color:C.yellow,fontWeight:600}}>{$$(CREDITOS_TRIM.pagos[i])}</td>
                  <td style={{padding:"7px 12px",textAlign:"right",fontWeight:700,color:C.red}}>{$$(CREDITOS_TRIM.saldos[i])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <input value={busq} onChange={e=>setBusq(e.target.value)} placeholder="🔍 Buscar…"
          style={{padding:"7px 12px",background:C.card2,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:12,outline:"none",flexGrow:1,minWidth:160}}/>
        <select value={filtEmp} onChange={e=>setFiltEmp(e.target.value)}
          style={{padding:"7px 12px",background:C.card2,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:12,outline:"none"}}>
          {empList.map(e=><option key={e}>{e}</option>)}
        </select>
      </div>
      <Card style={{padding:0,overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead><tr style={{background:C.bg2}}>
              {["#","Empresa","Acreedor","Tipo","Monto","Cuota","Vencimiento","Tasa"].map(h=><th key={h} style={{padding:"8px 12px",fontWeight:600,fontSize:10,color:C.muted,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`,textAlign:["Monto","Cuota","Tasa"].includes(h)?"right":"left",whiteSpace:"nowrap"}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {filtered.map(c=>{
                const vencProx=new Date(c.f_venc)<=new Date("2026-12-31");
                const e=empresas[c.empresa]||{emoji:"🏢",color:C.blue};
                return (
                  <tr key={c.n} style={{borderBottom:`1px solid ${C.border}22`,background:vencProx?`${C.yellow}08`:"transparent"}}>
                    <td style={{padding:"7px 12px",color:C.muted}}>{c.n}</td>
                    <td style={{padding:"7px 12px",fontWeight:600,color:e.color,whiteSpace:"nowrap"}}>{e.emoji} {c.empresa}</td>
                    <td style={{padding:"7px 12px",color:C.text}}>{c.acreedor}</td>
                    <td style={{padding:"7px 12px"}}><span style={{fontSize:9,padding:"2px 7px",borderRadius:20,background:C.card2,border:`1px solid ${C.border}`,color:C.muted}}>{c.tipo_cr}</span></td>
                    <td style={{padding:"7px 12px",textAlign:"right",fontWeight:700,color:C.red}}>{$$(c.monto)}</td>
                    <td style={{padding:"7px 12px",textAlign:"right",color:C.yellow}}>{$$(c.cuota)}</td>
                    <td style={{padding:"7px 12px",whiteSpace:"nowrap",color:vencProx?C.orange:C.muted}}>{fmtDate(c.f_venc)}{vencProx&&" ⚠️"}</td>
                    <td style={{padding:"7px 12px",textAlign:"right",color:C.muted}}>{c.tasa||"—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SALDOS BANCOS
// ═══════════════════════════════════════════════════════════════════
const BANCOS = ["BCI","BICE","Security","Chile","Santander","Scotiabank Perú","BBVA Perú"];
const MONEDAS = [
  {id:"clp", label:"CLP $", symbol:"$", flag:"🇨🇱"},
  {id:"usd", label:"USD $", symbol:"$", flag:"🇺🇸"},
  {id:"eur", label:"EUR €", symbol:"€", flag:"🇪🇺"},
  {id:"pen", label:"PEN S/", symbol:"S/", flag:"🇵🇪"},
];
const EMPRESAS_BANCOS = Object.keys(EMPRESAS_STATIC).concat(["Allegria Foods"]);

function fmtMoneda(v,sym) {
  if(!v&&v!==0) return "—";
  const abs=Math.abs(v),s=v<0?"-":"";
  if(abs>=1_000_000) return `${s}${sym}${(abs/1e6).toFixed(2)}M`;
  if(abs>=1_000)     return `${s}${sym}${(abs/1e3).toFixed(1)}K`;
  return `${s}${sym}${abs.toLocaleString()}`;
}

function semanaDeDate(d) {
  const date = new Date(d);
  const jan1 = new Date(date.getFullYear(),0,1);
  const week = Math.ceil(((date-jan1)/86400000+jan1.getDay()+1)/7);
  return `S${String(week).padStart(2,"0")}`;
}
function mesDeDate(d) {
  const date=new Date(d);
  return `${MN[date.getMonth()]}-${String(date.getFullYear()).slice(2)}`;
}

const EMPRESAS_LIST = [
  "Mediterra","Allegria Foods","Allegria Service",
  "Frisku Foods","Frisku Peru","Allpa Farms",
  "Allpa Farms Perú","Integrity Farms","Osiris"
];
const BANCOS_CHILE = ["BCI","BICE","Security","Chile","Santander"];
const BANCOS_PERU  = ["Scotiabank Perú","BBVA Perú"];
const TODOS_BANCOS = [...BANCOS_CHILE,...BANCOS_PERU];

function generarCuentasFijas() {
  const cuentas = [];
  EMPRESAS_LIST.forEach(emp => {
    const esPeruana = emp.includes("Perú") || emp === "Frisku Peru";
    const bancos  = esPeruana ? BANCOS_PERU  : BANCOS_CHILE;
    const monedas = esPeruana ? ["pen","usd"] : ["clp","usd","eur"];
    bancos.forEach(banco => {
      monedas.forEach(moneda => {
        cuentas.push({ emp, banco, moneda, key:`${emp}||${banco}||${moneda}` });
      });
    });
  });
  return cuentas;
}
const CUENTAS_FIJAS = generarCuentasFijas();

async function fetchFX() {
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD");
    const d = await r.json();
    if(d.result !== "success") return null;
    const rates = d.rates;
    const clpRate = rates.CLP || null;
    const eurRate = rates.EUR || null;
    const penRate = rates.PEN || null;
    return {
      clp: clpRate ? 1/clpRate : null,
      eur: eurRate ? 1/eurRate : null,
      pen: penRate ? 1/penRate : null,
      usd: 1,
      clpRaw: clpRate,
      eurRaw: eurRate ? 1/eurRate : null,
      penRaw: penRate,
      ts: new Date().toLocaleTimeString("es-CL"),
    };
  } catch { return null; }
}

function toUSD(monto, moneda, fx) {
  if (!fx || monto == null) return null;
  return monto * (fx[moneda] ?? 0);
}

function SaldosBancos({saldos,onSave,canEdit}) {
  const [fx,setFx]         = useState(null);
  const [fxLoading,setFxLoading] = useState(false);
  const [fxError,setFxError]     = useState(false);
  const [fecha,setFecha]   = useState(()=>new Date().toISOString().slice(0,10));
  const [saving,setSaving] = useState(false);
  const [edits,setEdits]   = useState({});
  const [dirty,setDirty]   = useState({});
  const [collapsed,setCollapsed] = useState({});
  const toggleEmp = emp => setCollapsed(p=>({...p,[emp]:!p[emp]}));

  useEffect(()=>{
    setFxLoading(true);
    fetchFX().then(r=>{
      if(r) setFx(r); else setFxError(true);
      setFxLoading(false);
    });
  },[]);

  function refreshFX(){
    setFxLoading(true);setFxError(false);
    fetchFX().then(r=>{
      if(r){setFx(r);setFxError(false);}else setFxError(true);
      setFxLoading(false);
    });
  }

  function getVal(key){
    if(edits[key]!==undefined) return edits[key];
    const s=saldos?.[key];
    return s?.monto!=null ? String(s.monto) : "";
  }

  function handleChange(key,val){
    setEdits(p=>({...p,[key]:val}));
    setDirty(p=>({...p,[key]:true}));
  }

  async function handleGuardar(){
    if(!Object.keys(dirty).length) return;
    setSaving(true);
    const next=JSON.parse(JSON.stringify(saldos||{}));
    Object.keys(dirty).forEach(key=>{
      const c=CUENTAS_FIJAS.find(x=>x.key===key);
      if(!c) return;
      const val=parseFloat(edits[key]);
      if(isNaN(val)) { delete next[key]; return; }
      next[key]={
        empresa:c.emp, banco:c.banco, moneda:c.moneda,
        monto:val, fecha,
        semana:semanaDeDate(fecha), mes:mesDeDate(fecha),
        usd: fx ? toUSD(val,c.moneda,fx) : null,
      };
    });
    await onSave(next);
    setDirty({});
    setSaving(false);
  }

  const totalesEmpresa = useMemo(()=>{
    const t={};
    EMPRESAS_LIST.forEach(emp=>{
      let sum=0, ok=true;
      CUENTAS_FIJAS.filter(c=>c.emp===emp).forEach(c=>{
        const s=saldos?.[c.key];
        if(!s||s.monto==null) return;
        const usdVal=toUSD(s.monto,c.moneda,fx);
        if(usdVal==null){ok=false;return;}
        sum+=usdVal;
      });
      t[emp]={usd:ok?sum:null};
    });
    return t;
  },[saldos,fx]);

  const totalUSD = useMemo(()=>{
    let s=0,ok=true;
    Object.values(totalesEmpresa).forEach(({usd})=>{
      if(usd==null){ok=false;return;}
      s+=usd;
    });
    return ok?s:null;
  },[totalesEmpresa]);

  const hasDirty=Object.keys(dirty).length>0;
  const sym=(id)=>MONEDAS.find(m=>m.id===id)?.symbol||"$";

  const porEmpresa = useMemo(()=>{
    const m={};
    CUENTAS_FIJAS.forEach(c=>{
      if(!m[c.emp]) m[c.emp]=[];
      m[c.emp].push(c);
    });
    return m;
  },[]);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10}}>
        <div style={{background:C.card,border:`2px solid ${C.accent}`,borderRadius:10,
          padding:"12px 16px",gridColumn:"span 2"}}>
          <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",marginBottom:4}}>
            💵 Total Consolidado USD
            {fxLoading&&<span style={{marginLeft:6,fontSize:9,color:C.yellow}}>actualizando…</span>}
            {fxError&&<span style={{marginLeft:6,fontSize:9,color:C.red}}>⚠️ sin paridad</span>}
          </div>
          <div style={{fontSize:22,fontWeight:900,color:totalUSD!=null?cf(totalUSD):C.muted}}>
            {totalUSD!=null?`$${totalUSD.toLocaleString("es-CL",{maximumFractionDigits:0})} USD`:"—"}
          </div>
        </div>
        {[
          {id:"clp",label:"1 USD =",val:fx?.clpRaw,fmt:v=>`$${Math.round(v).toLocaleString("es-CL")} CLP`},
          {id:"eur",label:"1 EUR =",val:fx?.eurRaw,fmt:v=>`$${v.toFixed(4)} USD`},
          {id:"pen",label:"1 USD =",val:fx?.penRaw,fmt:v=>`S/${v.toFixed(3)} PEN`},
        ].map(p=>(
          <div key={p.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px"}}>
            <div style={{fontSize:9,color:C.muted,marginBottom:3}}>{p.label}</div>
            <div style={{fontSize:14,fontWeight:700,color:C.yellow}}>
              {p.val!=null?p.fmt(p.val):fxLoading?"…":"—"}
            </div>
          </div>
        ))}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",
          display:"flex",flexDirection:"column",justifyContent:"center"}}>
          <button onClick={refreshFX} disabled={fxLoading}
            style={{padding:"6px 10px",borderRadius:7,border:"none",fontSize:11,fontWeight:600,
              background:fxLoading?C.card2:C.accent,color:"#fff",cursor:fxLoading?"default":"pointer"}}>
            {fxLoading?"⟳ …":"🔄 Actualizar FX"}
          </button>
          {fx?.ts&&<div style={{fontSize:9,color:C.muted,marginTop:4,textAlign:"center"}}>Última: {fx.ts}</div>}
        </div>
      </div>

      {canEdit&&(
        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",
          background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 16px"}}>
          <div style={{fontSize:12,color:C.muted}}>📅 Fecha del saldo:</div>
          <input type="date" value={fecha} onChange={e=>setFecha(e.target.value)}
            style={{padding:"6px 10px",background:C.card2,border:`1px solid ${C.border}`,
              borderRadius:8,color:C.text,fontSize:12,outline:"none"}}/>
          <button onClick={handleGuardar} disabled={saving||!hasDirty}
            style={{padding:"7px 18px",borderRadius:8,
              border:`1px solid ${hasDirty?C.accent:C.border}`,
              background:saving||!hasDirty?C.card2:C.accent,
              color:hasDirty?"#fff":C.muted,
              cursor:hasDirty&&!saving?"pointer":"default",fontSize:12,fontWeight:700}}>
            {saving?"Guardando…":"💾 Guardar cambios"}
          </button>
          {hasDirty&&(
            <span style={{fontSize:11,color:C.yellow}}>
              ● {Object.keys(dirty).length} cambio(s) sin guardar
            </span>
          )}
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {EMPRESAS_LIST.map(emp=>{
          const cuentas=porEmpresa[emp]||[];
          const empColor=EMPRESAS_STATIC[emp]?.color||C.muted;
          const empEmoji=EMPRESAS_STATIC[emp]?.emoji||"🏢";
          const empUSD=totalesEmpresa[emp]?.usd;
          const isOpen=!collapsed[emp];
          const dirtyCount=cuentas.filter(c=>dirty[c.key]).length;

          return (
            <div key={emp} style={{background:C.card,border:`1px solid ${isOpen?empColor+"55":C.border}`,
              borderRadius:12,overflow:"hidden"}}>
              <button onClick={()=>toggleEmp(emp)}
                style={{width:"100%",background:`${empColor}18`,border:"none",cursor:"pointer",
                  padding:"12px 16px",display:"flex",alignItems:"center",gap:12,textAlign:"left"}}>
                <span style={{fontSize:20}}>{empEmoji}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:800,color:empColor}}>{emp}</div>
                  {empUSD!=null&&(
                    <div style={{fontSize:11,color:cf(empUSD),marginTop:1}}>
                      Total: ${empUSD.toLocaleString("es-CL",{maximumFractionDigits:0})} USD
                    </div>
                  )}
                </div>
                {dirtyCount>0&&(
                  <span style={{fontSize:10,background:`${C.yellow}33`,color:C.yellow,
                    borderRadius:20,padding:"2px 8px",fontWeight:700}}>
                    ● {dirtyCount} pendiente{dirtyCount>1?"s":""}
                  </span>
                )}
                <span style={{fontSize:14,color:empColor,fontWeight:700,marginLeft:4}}>
                  {isOpen?"▾":"▸"}
                </span>
              </button>

              {isOpen&&(
                <div style={{borderTop:`1px solid ${C.border}`}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                    <thead>
                      <tr style={{background:C.card2}}>
                        {["Banco","Moneda","Último saldo",canEdit?"Nuevo saldo":"","≈ USD","Fecha"].filter(Boolean).map(h=>(
                          <th key={h} style={{padding:"7px 14px",fontWeight:600,fontSize:10,color:C.muted,
                            textTransform:"uppercase",borderBottom:`1px solid ${C.border}`,
                            textAlign:["Último saldo","≈ USD"].includes(h)?"right":"left",
                            whiteSpace:"nowrap"}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cuentas.map(c=>{
                        const saved=saldos?.[c.key];
                        const val=getVal(c.key);
                        const isDirty=!!dirty[c.key];
                        const usdVal=(saved?.monto!=null&&fx)?toUSD(saved.monto,c.moneda,fx):null;
                        const mon=MONEDAS.find(m=>m.id===c.moneda);
                        return (
                          <tr key={c.key} style={{borderBottom:`1px solid ${C.border}22`,
                            background:isDirty?`${C.yellow}08`:"transparent"}}>
                            <td style={{padding:"8px 14px",color:C.text,fontWeight:500}}>{c.banco}</td>
                            <td style={{padding:"8px 14px"}}>
                              <span style={{fontSize:10,padding:"2px 8px",borderRadius:20,
                                background:C.card2,border:`1px solid ${C.border}`,color:C.muted}}>
                                {mon?.flag} {mon?.label}
                              </span>
                            </td>
                            <td style={{padding:"8px 14px",textAlign:"right",
                              fontWeight:saved?.monto!=null?700:400,
                              color:saved?.monto!=null?cf(saved.monto):C.muted2}}>
                              {saved?.monto!=null
                                ?`${sym(c.moneda)}${saved.monto.toLocaleString("es-CL")}`
                                :"—"}
                            </td>
                            {canEdit&&(
                              <td style={{padding:"5px 10px"}}>
                                <input
                                  type="number" value={val} placeholder="0"
                                  onChange={e=>handleChange(c.key,e.target.value)}
                                  style={{width:120,padding:"6px 9px",
                                    background:isDirty?`${C.yellow}15`:C.card2,
                                    border:`1px solid ${isDirty?C.yellow:C.border}`,
                                    borderRadius:7,color:C.text,fontSize:11,
                                    textAlign:"right",outline:"none"}}
                                />
                              </td>
                            )}
                            <td style={{padding:"8px 14px",textAlign:"right",fontSize:10,
                              color:usdVal!=null?cf(usdVal):C.muted2}}>
                              {usdVal!=null
                                ?`$${usdVal.toLocaleString("es-CL",{maximumFractionDigits:0})} USD`
                                :"—"}
                            </td>
                            <td style={{padding:"8px 14px",color:C.muted,fontSize:10,whiteSpace:"nowrap"}}>
                              {saved?.fecha||"—"}
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
        })}
      </div>

      <div style={{fontSize:10,color:C.muted2,textAlign:"center"}}>
        Paridades obtenidas de open.er-api.com · Se cargan al abrir la pestaña
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MÓDULO PRINCIPAL
// ═══════════════════════════════════════════════════════════════════
export default function FinanzasModule({onBack,onLogout,usuarioActual,tabPermisos={}}) {
  const [tab,setTab]=useState("dashboard");
  const [empTab,setEmpTab]=useState("Mediterra");
  const [flujoSubTab,setFlujoSubTab]=useState("flujo"); // "flujo" | "params"
  const [realData,setRealData]=useState({});
  const [params,setParams]=useState(defaultParams);
  // paramsEmp: { empresa: { seasonKey: { prodId: defaultProducto() } } }
  const [paramsEmp,setParamsEmp]=useState({});
  const [saldosBancos,setSaldosBancos]=useState({});
  const [loading,setLoading]=useState(true);
  const [saved,setSaved]=useState(null);

  const esAdmin = usuarioActual?.rol==="admin";
  const canEdit = esAdmin || ["Angelo Huerta","Carol Machuca"].includes(usuarioActual?.nombre||"");

  const perm  = (tabId) => tabPermisos?.[tabId] ?? "editar";
  const puedoEdit = (tabId) => esAdmin || perm(tabId) !== "ver";

  const empresas=useMemo(()=>buildEmpresas(params),[params]);

  const TABS=[
    {id:"dashboard",label:"📊 Dashboard"},
    {id:"flujo",    label:"📈 Flujo Empresas"},
    {id:"bancos",   label:"🏦 Saldos Bancos"},
    {id:"creditos", label:"💳 Créditos"},
  ];

  useEffect(()=>{
    dbLoad().then(d=>{
      if(d?.finanzas_real) setRealData(d.finanzas_real);
      else if(d&&!d.finanzas_real&&!d.allegria_params) setRealData(d);
      if(d?.allegria_params) setParams(prev=>({...defaultParams(),...d.allegria_params}));
      if(d?.params_emp) setParamsEmp(d.params_emp);
      if(d?.saldos_bancos) setSaldosBancos(d.saldos_bancos);
      setLoading(false);
    });
  },[]);

  const handleSaveReal=useCallback(async(empresa,mes,semana,vals)=>{
    const next=JSON.parse(JSON.stringify(realData));
    if(!next[empresa]) next[empresa]={};
    if(!next[empresa][mes]) next[empresa][mes]={};
    next[empresa][mes][semana]=vals;
    setRealData(next);
    const ok=await dbSave({finanzas_real:next,allegria_params:params,saldos_bancos:saldosBancos,params_emp:paramsEmp});
    setSaved(ok?"✅ Guardado":"⚠️ Error");
    setTimeout(()=>setSaved(null),3000);
  },[realData,params,saldosBancos,paramsEmp]);

  // Persistir overrides de proyección editados por usuario
  const handleSaveProy=useCallback((empresa,lineLabel,idx,val)=>{
    setRealData(prev=>{
      const next=JSON.parse(JSON.stringify(prev));
      if(!next[empresa]) next[empresa]={};
      if(lineLabel==="_clear_all"){
        delete next[empresa]._proyOverrides;
      } else {
        if(!next[empresa]._proyOverrides) next[empresa]._proyOverrides={};
        if(!next[empresa]._proyOverrides[lineLabel]) next[empresa]._proyOverrides[lineLabel]={};
        next[empresa]._proyOverrides[lineLabel][String(idx)]=val;
      }
      setTimeout(()=>{
        dbSave({finanzas_real:next,allegria_params:params,saldos_bancos:saldosBancos,params_emp:paramsEmp})
          .then(ok=>{ setSaved(ok?"✅ Proyección guardada":"⚠️ Error"); setTimeout(()=>setSaved(null),2000); });
      },0);
      return next;
    });
  // eslint-disable-next-line
  },[params,saldosBancos]);


  // setParamsEmp para una empresa específica
  const setParamsEmpresa = useCallback((empresa, updater) => {
    setParamsEmp(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      if(!next[empresa]) next[empresa] = defaultParamsEmp();
      next[empresa] = typeof updater === "function" ? updater(next[empresa]) : updater;
      // Persistir
      setTimeout(()=>dbSave({finanzas_real:realData,allegria_params:params,
        saldos_bancos:saldosBancos,params_emp:{...prev,[empresa]:next[empresa]}})
        .then(ok=>{setSaved(ok?"✅ Parámetros guardados":"⚠️ Error");setTimeout(()=>setSaved(null),2000);}),0);
      return next;
    });
  // eslint-disable-next-line
  },[realData,params,saldosBancos]);

  const handleSaveSaldos=useCallback(async(next)=>{
    setSaldosBancos(next);
    const ok=await dbSave({finanzas_real:realData,allegria_params:params,saldos_bancos:next,params_emp:paramsEmp});
    setSaved(ok?"✅ Guardado":"⚠️ Error");
    setTimeout(()=>setSaved(null),3000);
  },[realData,params,paramsEmp]);

  useEffect(()=>{
    if(loading) return;
    const t=setTimeout(()=>dbSave({finanzas_real:realData,allegria_params:params,saldos_bancos:saldosBancos,params_emp:paramsEmp}),800);
    return ()=>clearTimeout(t);
  },[params,loading]); // eslint-disable-line

  if(loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",
      height:"60vh",color:C.muted,fontSize:14,background:C.bg,borderRadius:12}}>
      Cargando datos financieros...
    </div>
  );

  return (
    <div style={{
      fontFamily:"'IBM Plex Sans','Segoe UI',system-ui,sans-serif",
      color:C.text,
      minHeight:"100vh",
      background:`linear-gradient(160deg, ${C.bg} 0%, ${C.bg2} 100%)`,
      padding:"20px",
      paddingBottom:40,
    }}>
      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{
        background:"linear-gradient(135deg,#0f1e3a,#1e3a5f)",
        borderRadius:14,
        padding:"14px 20px",
        marginBottom:20,
        display:"flex",justifyContent:"space-between",alignItems:"center",
        flexWrap:"wrap",gap:8,
        border:`1px solid ${C.border2}`,
        boxShadow:"0 4px 24px rgba(0,0,0,0.3)",
      }}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={onBack} style={{
            background:"rgba(255,255,255,0.1)",
            border:`1px solid ${C.border}`,
            color:C.text,borderRadius:8,
            padding:"6px 14px",cursor:"pointer",fontSize:12,fontWeight:600,
          }}>← Hub</button>
          <img src="/med.png" alt="Mediterra" style={{height:30,objectFit:"contain"}}
            onError={e=>{e.target.style.display="none";}}/>
          <div>
            <div style={{fontSize:13,fontWeight:900,color:C.text}}>Finanzas · Grupo Mediterra</div>
            <div style={{fontSize:10,color:C.muted}}>Mar-2026 → Jun-2031 · 65 meses · 6 Temporadas · USD</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {saved&&<span style={{fontSize:11,color:C.muted,background:C.card2,
            borderRadius:20,padding:"3px 10px",border:`1px solid ${C.border}`}}>{saved}</span>}
          <button onClick={onLogout} style={{
            background:"rgba(248,113,113,0.15)",
            border:"1px solid rgba(248,113,113,0.3)",
            color:"#fca5a5",borderRadius:8,
            padding:"6px 14px",cursor:"pointer",fontSize:12,
          }}>Salir</button>
        </div>
      </div>

      {/* ── Pestañas ───────────────────────────────────────── */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:20}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{
              padding:"8px 18px",borderRadius:8,cursor:"pointer",fontWeight:600,fontSize:12,
              border:`1px solid ${tab===t.id?C.accentL:C.border}`,
              background:tab===t.id?`${C.accent}44`:C.card,
              color:tab===t.id?C.accentL:C.muted,
              boxShadow:tab===t.id?`0 2px 12px ${C.accent}44`:"none",
              transition:"all 0.15s",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Contenido por pestaña ──────────────────────────── */}
      {tab==="dashboard"&&<Dashboard empresas={empresas}/>}

      {tab==="flujo"&&(
        <div>
          {/* Selector empresa + botón Consolidado */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12,alignItems:"center"}}>
            {Object.keys(empresas).map(n=>{const e=empresas[n];return (
              <button key={n} onClick={()=>{setEmpTab(n);setFlujoSubTab("flujo");}}
                style={{
                  padding:"7px 14px",borderRadius:8,cursor:"pointer",fontSize:11,fontWeight:600,
                  border:`1px solid ${empTab===n?e.color:C.border}`,
                  background:empTab===n?`${e.color}33`:C.card,
                  color:empTab===n?e.color:C.muted,
                  transition:"all 0.15s",
                }}>
                {e.emoji} {n}{n==="Allegria Foods"&&<span style={{fontSize:9,marginLeft:3,color:C.yellow}}>⚡</span>}
              </button>
            );})}
            {/* Botón Consolidado */}
            <button onClick={()=>{setEmpTab("_consolidado");setFlujoSubTab("flujo");}}
              style={{
                padding:"7px 14px",borderRadius:8,cursor:"pointer",fontSize:11,fontWeight:600,
                border:`2px solid ${empTab==="_consolidado"?"#a78bfa":"#a78bfa55"}`,
                background:empTab==="_consolidado"?"#a78bfa33":C.card,
                color:empTab==="_consolidado"?"#a78bfa":C.muted,
                transition:"all 0.15s",marginLeft:8,
              }}>
              🏛 Consolidado
            </button>
          </div>

          {/* Sub-pestañas Flujo/Parámetros — solo cuando NO es consolidado */}
          {empTab!=="_consolidado"&&(
          <>
          {/* Sub-pestañas: Flujo | Parámetros — para TODAS las empresas */}
          <div style={{display:"flex",gap:6,marginBottom:14,padding:"10px 14px",
            background:C.card2,borderRadius:10,border:`1px solid ${C.border}`,alignItems:"center"}}>
            <span style={{fontSize:10,color:C.muted,fontWeight:600,marginRight:4}}>Vista:</span>
            {[
              {id:"flujo",  label:"📈 Flujo de Caja"},
              {id:"params", label:"⚡ Parámetros"},
            ].map(st=>{
              const emp=empresas[empTab];
              const color=emp?.color||C.accent;
              return (
                <button key={st.id} onClick={()=>setFlujoSubTab(st.id)}
                  style={{padding:"6px 18px",borderRadius:8,cursor:"pointer",fontWeight:600,fontSize:12,
                    border:`1px solid ${flujoSubTab===st.id?color:C.border}`,
                    background:flujoSubTab===st.id?`${color}33`:"transparent",
                    color:flujoSubTab===st.id?color:C.muted,
                    transition:"all 0.15s"}}>
                  {st.label}
                </button>
              );
            })}
            <span style={{fontSize:10,color:C.muted,marginLeft:6}}>
              {flujoSubTab==="params"
                ? "Define productos, anticipos y distribución de pagos por temporada"
                : "Proyección de flujo de caja mensual y semanal"}
            </span>
          </div>

          {/* Contenido sub-pestaña */}
          {flujoSubTab==="flujo"&&(
            <FlujoEmpresa key={empTab} empNombre={empTab} empresas={empresas}
              realData={realData} onSaveReal={handleSaveReal} canEdit={puedoEdit("flujo")}
              saldosBancos={saldosBancos} onSaveProy={handleSaveProy}/>
          )}
          {flujoSubTab==="params"&&(()=>{
            const emp=empresas[empTab];
            const empColor=emp?.color||C.accent;
            const esAllegria=empTab==="Allegria Foods";
            const empParamsData=paramsEmp?.[empTab]||defaultParamsEmp();
            return (
              <TabParametros
                empNombre={empTab}
                empColor={empColor}
                params={esAllegria?params:undefined}
                setParams={esAllegria&&puedoEdit("flujo")?setParams:undefined}
                paramsEmp={esAllegria?undefined:{...empParamsData}}
                setParamsEmp={!esAllegria&&puedoEdit("flujo")
                  ? (updater)=>setParamsEmpresa(empTab,updater)
                  : ()=>{}}
                readOnly={!puedoEdit("flujo")}
              />
            );
          })()}
          </>
          )}

          {/* Consolidado */}
          {empTab==="_consolidado"&&(
            <Consolidado empresas={empresas} saldosBancos={saldosBancos}/>
          )}
        </div>
      )}

      {tab==="bancos"&&(
        <SaldosBancos saldos={saldosBancos} onSave={handleSaveSaldos} canEdit={puedoEdit("bancos")}/>
      )}
      {tab==="creditos"&&<Creditos empresas={empresas}/>}

    </div>
  );
}
