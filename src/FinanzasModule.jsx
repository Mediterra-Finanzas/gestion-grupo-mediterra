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
    dist_mat:[],   // [{mes:"Nov-26", pct:40}] — % del total materiales pagado ese mes
    dist_srv:[],   // [{mes:"Nov-26", pct:40}] — % del total servicios pagado ese mes (se reparte entre semanas)
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

      // ── INGRESOS ──────────────────────────────────────────────────
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

      // ── COSTO FRUTA (productor) ───────────────────────────────────
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

      // ── MATERIALES: KG × mat_usd_kg distribuido % por mes ────────
      const totalMat = kg * matUsd;
      if (totalMat > 0) {
        (p.dist_mat||[]).forEach(d => {
          const i = mIdx(d.mes); if(i<0) return;
          mat[f][i] += totalMat * ((Number(d.pct)||0)/100);
        });
      }

      // ── SERVICIOS: KG × srv_usd_kg distribuido % por mes,
      //    luego repartido uniformemente entre las semanas del mes ──
      const totalSrv = kg * srvUsd;
      if (totalSrv > 0) {
        (p.dist_srv||[]).forEach(d => {
          const i = mIdx(d.mes); if(i<0) return;
          const montoMes = totalSrv * ((Number(d.pct)||0)/100);
          // Se guarda el total mensual; la vista semanal lo divide por nSems automáticamente
          srv[f][i] += montoMes;
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
// COLORES Y HELPERS
// ═══════════════════════════════════════════════════════════════════
const C = {
  bg:"#071810", bg2:"#0a2218", card:"#0d2b1e", card2:"#112e20",
  border:"#1a4d32", border2:"#236640",
  text:"#e2f5ec", muted:"#6aad8a", muted2:"#4a8066",
  green:"#22c55e", red:"#f87171", blue:"#60a5fa",
  yellow:"#fbbf24", orange:"#fb923c", accent:"#16a34a", accentL:"#22c55e",
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

// DistList: lista [{mes, pct}] con total % y monto calculado
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
  const selSt={padding:"5px 8px",background:C.card2,border:`1px solid ${C.border}`,borderRadius:6,fontSize:11,outline:"none"};

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
            Precio neto productor: <strong>${precioNet.toFixed(3)}/kg</strong> = FOB×{(100-(Number(p.desc_exp_pct||0))).toFixed(0)}% − mat − srv
          </div>
        )}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <div style={{background:`${C.green}0d`,border:`1px solid ${C.green}33`,borderRadius:10,padding:12}}>
          <div style={{fontSize:11,fontWeight:700,color:C.green,marginBottom:10}}>📥 Cobros al cliente</div>
          <AnticipList label="Anticipos (US$/kg por mes)" items={p.anticipos_cliente} onChange={v=>upd("anticipos_cliente",v)}/>
          <div style={{marginTop:10}}>
            <div style={{fontSize:10,color:C.muted,marginBottom:3}}>Mes liquidación final</div>
            <select value={p.mes_liquidacion||""} onChange={e=>upd("mes_liquidacion",e.target.value)} style={{...selSt,color:p.mes_liquidacion?C.text:C.muted}}>
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
            <select value={p.mes_saldo_productor||""} onChange={e=>upd("mes_saldo_productor",e.target.value)} style={{...selSt,color:p.mes_saldo_productor?C.text:C.muted}}>
              <option value="">— mes —</option>
              {MESES_65.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
            {antCostTot>0&&totalCost>0&&<div style={{fontSize:10,color:C.muted,marginTop:4}}>Anticipos: {$$(antCostTot)} · Saldo: {$$(Math.max(0,totalCost-antCostTot))}</div>}
          </div>
        </div>
      </div>

      {/* MATERIALES y SERVICIOS — distribución % por mes */}
      {(matUsd>0||srvUsd>0)&&kg>0&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginTop:4}}>
          {/* Materiales */}
          {matUsd>0&&(
            <div style={{background:"rgba(251,191,36,0.07)",border:`1px solid ${C.yellow}44`,borderRadius:10,padding:12}}>
              <div style={{fontSize:11,fontWeight:700,color:C.yellow,marginBottom:4}}>📦 Pago Materiales</div>
              <div style={{fontSize:10,color:C.muted,marginBottom:8}}>
                Total: <strong style={{color:C.yellow}}>{$$(kg*matUsd)}</strong> ({kg.toLocaleString()} kg × ${matUsd}/kg)
                {" · "}Asignado: <strong style={{color:pctMat===100?C.green:C.orange}}>{pctMat.toFixed(0)}%</strong>
                {pctMat!==100&&<span style={{color:C.orange}}> (falta {(100-pctMat).toFixed(0)}%)</span>}
              </div>
              <DistList items={p.dist_mat} onChange={v=>upd("dist_mat",v)} totalMonto={kg*matUsd}/>
            </div>
          )}
          {/* Servicios */}
          {srvUsd>0&&(
            <div style={{background:"rgba(96,165,250,0.07)",border:`1px solid ${C.blue}44`,borderRadius:10,padding:12}}>
              <div style={{fontSize:11,fontWeight:700,color:C.blue,marginBottom:4}}>⚙️ Pago Servicios <span style={{fontSize:9,fontWeight:400,opacity:0.7}}>(por semana)</span></div>
              <div style={{fontSize:10,color:C.muted,marginBottom:8}}>
                Total: <strong style={{color:C.blue}}>{$$(kg*srvUsd)}</strong> ({kg.toLocaleString()} kg × ${srvUsd}/kg)
                {" · "}Asignado: <strong style={{color:pctSrv===100?C.green:C.orange}}>{pctSrv.toFixed(0)}%</strong>
                {pctSrv!==100&&<span style={{color:C.orange}}> (falta {(100-pctSrv).toFixed(0)}%)</span>}
              </div>
              <DistList items={p.dist_srv} onChange={v=>upd("dist_srv",v)} totalMonto={kg*srvUsd} esSemanal/>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TabParametros({params,setParams,readOnly=false}) {
  const [selSeason,setSelSeason]=useState(SEASON_KEYS[0]);
  const [selFruta,setSelFruta]=useState('cerezas');
  const resumen=useMemo(()=>SEASONS.flatMap(s=>FRUTAS.map(f=>{
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
  }).filter(Boolean)),[params]);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {readOnly&&(
        <div style={{background:"#1d4ed822",border:"1px solid #60a5fa44",borderRadius:10,
          padding:"10px 16px",fontSize:12,color:"#60a5fa",display:"flex",alignItems:"center",gap:8}}>
          👁 Estás en modo solo lectura — no puedes modificar los parámetros.
        </div>
      )}
      <Card>
        <SectionTitle>⚡ Parámetros Allegria Foods — por Temporada y Fruta</SectionTitle>
        <div style={{fontSize:11,color:C.muted,marginBottom:14}}>Los cambios se reflejan en tiempo real en el Flujo de Allegria Foods.</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
          {SEASONS.map(s=><Btn key={s.key} active={selSeason===s.key} onClick={()=>setSelSeason(s.key)} color={C.accent}>{s.label}</Btn>)}
        </div>
        <div style={{display:"flex",gap:6,marginBottom:16}}>
          {FRUTAS.map(f=>(
            <button key={f} onClick={()=>setSelFruta(f)}
              style={{padding:"6px 18px",borderRadius:20,border:"none",cursor:"pointer",fontWeight:600,fontSize:12,
                background:selFruta===f?"#b91c1c":"rgba(255,255,255,0.06)",color:selFruta===f?"#fff":C.muted}}>
              {FRUTA_EMOJI[f]} {FRUTA_LABEL[f]}
            </button>
          ))}
        </div>
        <ParamsFruta key={`${selSeason}-${selFruta}`} seasonKey={selSeason} fruta={selFruta} params={params} setParams={setParams}/>
      </Card>
      {resumen.length>0&&(
        <Card>
          <SectionTitle>Resumen Proyectado — Todas las Temporadas</SectionTitle>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{background:"rgba(0,0,0,0.2)"}}>
                {["Temporada","Fruta","KG","FOB","Ingreso","C.Fruta","C.Mat","C.Srv","Total Costo","Margen"].map(h=>(
                  <th key={h} style={{padding:"7px 10px",fontWeight:600,fontSize:10,color:C.muted,textTransform:"uppercase",
                    borderBottom:`1px solid ${C.border}`,textAlign:["Temporada","Fruta"].includes(h)?"left":"right"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {resumen.map((r,i)=>(
                  <tr key={i} style={{borderBottom:`1px solid ${C.border}22`}}>
                    <td style={{padding:"6px 10px",color:C.muted,fontSize:11}}>{r.season}</td>
                    <td style={{padding:"6px 10px",fontWeight:600,color:C.text}}>{FRUTA_EMOJI[r.fruta]} {FRUTA_LABEL[r.fruta]}</td>
                    <td style={{padding:"6px 10px",textAlign:"right",color:C.text}}>{r.kg.toLocaleString()}</td>
                    <td style={{padding:"6px 10px",textAlign:"right",color:C.yellow}}>${r.fob.toFixed(2)}</td>
                    <td style={{padding:"6px 10px",textAlign:"right",fontWeight:700,color:C.green}}>{$$(r.ing)}</td>
                    <td style={{padding:"6px 10px",textAlign:"right",color:C.red}}>{$$(r.costFruta)}</td>
                    <td style={{padding:"6px 10px",textAlign:"right",color:C.orange}}>{r.costMat>0?$$(r.costMat):"—"}</td>
                    <td style={{padding:"6px 10px",textAlign:"right",color:C.blue}}>{r.costSrv>0?$$(r.costSrv):"—"}</td>
                    <td style={{padding:"6px 10px",textAlign:"right",fontWeight:700,color:C.red}}>{$$(r.cost)}</td>
                    <td style={{padding:"6px 10px",textAlign:"right",fontWeight:700,color:cf(r.margen)}}>{$$(r.margen)}</td>
                  </tr>
                ))}
                <tr style={{background:"rgba(255,255,255,0.04)",borderTop:`2px solid ${C.border}`}}>
                  <td colSpan={4} style={{padding:"8px 10px",fontWeight:800,color:C.text}}>TOTAL</td>
                  <td style={{padding:"8px 10px",textAlign:"right",fontWeight:800,color:C.green}}>{$$(resumen.reduce((s,r)=>s+r.ing,0))}</td>
                  <td style={{padding:"8px 10px",textAlign:"right",fontWeight:800,color:C.red}}>{$$(resumen.reduce((s,r)=>s+r.costFruta,0))}</td>
                  <td style={{padding:"8px 10px",textAlign:"right",fontWeight:800,color:C.orange}}>{$$(resumen.reduce((s,r)=>s+r.costMat,0))}</td>
                  <td style={{padding:"8px 10px",textAlign:"right",fontWeight:800,color:C.blue}}>{$$(resumen.reduce((s,r)=>s+r.costSrv,0))}</td>
                  <td style={{padding:"8px 10px",textAlign:"right",fontWeight:800,color:C.red}}>{$$(resumen.reduce((s,r)=>s+r.cost,0))}</td>
                  <td style={{padding:"8px 10px",textAlign:"right",fontWeight:800,color:cf(resumen.reduce((s,r)=>s+r.margen,0))}}>{$$(resumen.reduce((s,r)=>s+r.margen,0))}</td>
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
// FLUJO POR EMPRESA
// ═══════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════
// MODAL INGRESO REAL — componente independiente (fix: no puede ser
// anidado dentro de FlujoEmpresa o los inputs pierden foco)
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

// Input de una línea real — componente propio para evitar re-renders
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
// FLUJO POR EMPRESA
// ═══════════════════════════════════════════════════════════════════
function FlujoEmpresa({empNombre,empresas,realData,onSaveReal,canEdit}) {
  const emp=empresas[empNombre];
  const [vista,setVista]=useState("mensual");
  const [openSeason,setOpenSeason]=useState({[SEASON_KEYS[0]]:true,[SEASON_KEYS[1]]:true});
  // Para vista semanal: qué meses están abiertos (expandidos con sus semanas)
  const [openMonth,setOpenMonth]=useState({});
  const [showReal,setShowReal]=useState(false);
  const [modalSem,setModalSem]=useState(null);

  const toggleSeason=key=>setOpenSeason(p=>({...p,[key]:!p[key]}));
  const toggleMonth=mes=>setOpenMonth(p=>({...p,[mes]:!p[mes]}));
  // Por defecto todos los meses abiertos; si no está en el mapa = abierto
  const isMonthOpen=mes=>openMonth[mes]!==false;

  const realMensual=useMemo(()=>{
    const rm={};
    MESES_65.forEach(mes=>{
      const sd=realData?.[empNombre]?.[mes]||{};
      const lines={};
      Object.values(sd).forEach(sv=>{Object.entries(sv).forEach(([lbl,v])=>{lines[lbl]=(lines[lbl]||0)+(Number(v)||0);});});
      rm[mes]=lines;
    });
    return rm;
  },[realData,empNombre]);

  const {flujoArr,acumArr}=useMemo(()=>{
    const fa=MESES_65.map((_,i)=>{let f=0;emp.sections.forEach(sec=>sec.lines.forEach(l=>{f+=(l.proy[i]||0)*sec.signo;}));return f;});
    let a=emp.saldo_ini;
    const aa=fa.map(f=>{a+=f;return a;});
    return {flujoArr:fa,acumArr:aa};
  },[emp]);

  // Estructura de columnas para la tabla (semanal con agrupación por mes)
  const colStructure=useMemo(()=>{
    // Retorna array de "grupos de columna" para cada temporada
    return SEASONS.map(s=>{
      if(!openSeason[s.key]) return {season:s,collapsed:true,cols:[]};
      if(vista==="mensual"){
        return {season:s,collapsed:false,cols:s.months.map(m=>({
          type:"month",mes:m,idx:mIdx(m),nSems:1,
          label:m,isFirstInSeason:s.months[0]===m
        }))};
      }
      // Vista semanal: agrupar semanas por mes
      const cols=[];
      s.months.forEach((m,mi)=>{
        const sems=SEMANAS_MES[m]||[];
        const nSems=sems.length||1;
        const open=isMonthOpen(m);
        if(!open){
          // mes colapsado: una sola celda
          cols.push({type:"month_collapsed",mes:m,idx:mIdx(m),nSems,label:m,
            isFirstInSeason:mi===0,isMonthHeader:true});
        } else {
          // mes expandido: fila header mes + semanas
          sems.forEach((sw,si)=>{
            cols.push({type:"week",mes:m,semana:sw,idx:mIdx(m),nSems,
              label:sw,isFirstInSeason:mi===0&&si===0,
              isFirstInMonth:si===0});
          });
        }
      });
      return {season:s,collapsed:false,cols};
    });
  },[openSeason,openMonth,vista,emp]); // eslint-disable-line

  function renderTabla() {
    return (
      <div style={{overflowX:"auto",borderRadius:12,border:`1px solid ${C.border}`}}>
        <table style={{borderCollapse:"collapse",fontSize:11,minWidth:600}}>
          <thead>
            {/* FILA 1: Temporadas */}
            <tr style={{background:"#071810"}}>
              <th style={{padding:"8px 14px",textAlign:"left",color:C.muted,fontSize:10,
                position:"sticky",left:0,background:"#071810",zIndex:3,minWidth:200,
                borderRight:`1px solid ${C.border}`}}>
                Línea
              </th>
              {colStructure.map(({season:s,collapsed,cols})=>{
                const span=collapsed?1:cols.length||1;
                return (
                  <th key={s.key} colSpan={span} onClick={()=>toggleSeason(s.key)}
                    style={{padding:"7px 10px",textAlign:"center",
                      background:!collapsed?"#0d2b1e":"#071810",
                      borderLeft:`2px solid ${C.border2}`,cursor:"pointer",
                      fontSize:10,fontWeight:700,color:"#fff",whiteSpace:"nowrap"}}>
                    {!collapsed?"▾":"▸"} {s.label}
                  </th>
                );
              })}
            </tr>
            {/* FILA 2 (solo semanal): header mes con colapso */}
            {vista==="semanal"&&(
              <tr style={{background:"#0a2218"}}>
                <th style={{position:"sticky",left:0,background:"#0a2218",zIndex:3,borderRight:`1px solid ${C.border}`}}/>
                {colStructure.map(({season:s,collapsed,cols})=>{
                  if(collapsed) return <th key={s.key} style={{borderLeft:`2px solid ${C.border2}`,background:"#0a2218"}}/>;
                  // Agrupar cols por mes para calcular colSpan
                  const byMes={};
                  cols.forEach(col=>{
                    if(!byMes[col.mes]) byMes[col.mes]={mes:col.mes,count:0,isFirstInSeason:col.isFirstInSeason};
                    byMes[col.mes].count++;
                  });
                  return Object.values(byMes).map(({mes,count,isFirstInSeason})=>(
                    <th key={`${s.key}-mh-${mes}`} colSpan={count}
                      onClick={()=>toggleMonth(mes)}
                      style={{padding:"4px 6px",textAlign:"center",
                        background:isMonthOpen(mes)?"#0d2b1e":"#071810",
                        borderLeft:isFirstInSeason?`2px solid ${C.border2}`:`1px solid ${C.border}44`,
                        cursor:"pointer",fontSize:9,fontWeight:700,
                        color:isMonthOpen(mes)?"#9de8bc":C.muted,whiteSpace:"nowrap"}}>
                      {isMonthOpen(mes)?"▾":"▸"} {mes}
                    </th>
                  ));
                })}
              </tr>
            )}
            {/* FILA 3: semanas o meses */}
            <tr style={{background:"#071e12"}}>
              <th style={{position:"sticky",left:0,background:"#071e12",zIndex:3,borderRight:`1px solid ${C.border}`}}/>
              {colStructure.map(({season:s,collapsed,cols})=>{
                if(collapsed) return <th key={s.key} style={{padding:"4px 8px",color:C.muted,fontSize:9,borderLeft:`2px solid ${C.border2}`,textAlign:"center",background:"#071e12"}}>{s.months.length}m</th>;
                return cols.map((col,ci)=>{
                  const isFirst=col.isFirstInSeason||col.isFirstInMonth;
                  return (
                    <th key={`${s.key}-${col.label}-${ci}`}
                      style={{padding:"4px 6px",textAlign:"center",
                        color:col.type==="month_collapsed"?"#9de8bc":C.muted,
                        fontSize:col.type==="month_collapsed"?9:8,
                        fontWeight:col.type==="month_collapsed"?700:500,
                        whiteSpace:"nowrap",
                        minWidth:vista==="semanal"?46:68,background:"#071e12",
                        borderLeft:(col.isFirstInSeason)?`2px solid ${C.border2}`:isFirst?`1px solid ${C.border}55`:`1px solid ${C.border}11`,
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
            {emp.sections.map(sec=>(
              <React.Fragment key={sec.cat}>
                {/* Header sección */}
                <tr style={{background:"rgba(0,0,0,0.3)"}}>
                  <td style={{padding:"5px 14px",position:"sticky",left:0,
                    background:"rgba(7,24,16,0.97)",borderRight:`1px solid ${C.border}`,zIndex:1}}>
                    <span style={{fontSize:10,fontWeight:700,color:CAT_COLOR[sec.cat]||C.muted,
                      textTransform:"uppercase",letterSpacing:"0.5px"}}>
                      {CAT_SIGNO[sec.cat]} {sec.label}
                    </span>
                  </td>
                  {colStructure.map(({season:s,collapsed,cols})=>{
                    const span=collapsed?1:cols.length||1;
                    return <td key={s.key} colSpan={span} style={{borderLeft:`2px solid ${C.border2}`}}/>;
                  })}
                </tr>
                {/* Líneas */}
                {sec.lines.map(line=>(
                  <tr key={line.label} style={{borderBottom:`1px solid ${C.border}11`}}>
                    <td style={{padding:"5px 14px",color:line.formula?C.yellow:C.text,fontSize:11,
                      position:"sticky",left:0,background:"#071810",zIndex:1,
                      borderRight:`1px solid ${C.border}`,whiteSpace:"nowrap",
                      maxWidth:220,overflow:"hidden",textOverflow:"ellipsis"}}>
                      {line.formula&&<span style={{fontSize:9,marginRight:3}}>⚡</span>}{line.label}
                    </td>
                    {colStructure.map(({season:s,collapsed,cols})=>{
                      if(collapsed){
                        const total=s.indices.reduce((a,i)=>a+(line.proy[i]||0),0);
                        return <td key={s.key} style={{padding:"5px 8px",textAlign:"right",
                          color:total!==0?(sec.signo>0?C.green:C.red):C.muted2,
                          fontSize:10,fontWeight:total!==0?600:400,
                          borderLeft:`2px solid ${C.border2}`}}>
                          {total!==0?$$(total):"—"}
                        </td>;
                      }
                      return cols.map((col,ci)=>{
                        let val;
                        if(col.type==="month_collapsed"){
                          // celda mes colapsado = total del mes
                          val=line.proy[col.idx]||0;
                        } else {
                          val=(line.proy[col.idx]||0)/col.nSems;
                        }
                        const real=vista==="mensual"?(realMensual[col.mes]?.[line.label]||null):null;
                        const isFirst=col.isFirstInSeason||col.isFirstInMonth;
                        return (
                          <td key={`${col.mes}-${col.label}-${ci}`}
                            style={{padding:"4px 5px",textAlign:"right",fontSize:9,
                              borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:isFirst?`1px solid ${C.border}44`:`1px solid ${C.border}11`}}>
                            {val!==0
                              ?<span style={{color:sec.signo>0?C.green:C.red,fontWeight:600}}>{$$(val)}</span>
                              :<span style={{color:C.muted2,fontSize:8}}>—</span>}
                            {real!=null&&real!==0&&vista==="mensual"&&<div style={{fontSize:7,color:C.yellow}}>R:{$$(real)}</div>}
                          </td>
                        );
                      });
                    })}
                  </tr>
                ))}
                {/* Subtotal sección */}
                <tr style={{background:"rgba(255,255,255,0.02)"}}>
                  <td style={{padding:"5px 14px",fontWeight:700,color:CAT_COLOR[sec.cat],fontSize:10,
                    position:"sticky",left:0,background:"#0a1f14",borderRight:`1px solid ${C.border}`,zIndex:1}}>
                    Total {sec.label}
                  </td>
                  {colStructure.map(({season:s,collapsed,cols})=>{
                    if(collapsed){
                      const total=s.indices.reduce((a,i)=>a+sec.lines.reduce((b,l)=>b+(l.proy[i]||0),0),0);
                      return <td key={s.key} style={{padding:"5px 8px",textAlign:"right",fontWeight:700,
                        color:CAT_COLOR[sec.cat],fontSize:10,borderLeft:`2px solid ${C.border2}`}}>
                        {total!==0?$$(total):"—"}
                      </td>;
                    }
                    return cols.map((col,ci)=>{
                      const nSems=col.type==="month_collapsed"?1:col.nSems;
                      const total=sec.lines.reduce((a,l)=>a+(l.proy[col.idx]||0)/nSems,0);
                      const isFirst=col.isFirstInSeason||col.isFirstInMonth;
                      return <td key={`sub-${col.mes}-${col.label}-${ci}`}
                        style={{padding:"4px 5px",textAlign:"right",fontWeight:700,
                          color:CAT_COLOR[sec.cat],fontSize:9,
                          borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:isFirst?`1px solid ${C.border}44`:`1px solid ${C.border}11`}}>
                        {total!==0?$$(total):"—"}
                      </td>;
                    });
                  })}
                </tr>
              </React.Fragment>
            ))}
            {/* FLUJO NETO */}
            <tr style={{background:"rgba(34,197,94,0.07)",borderTop:`2px solid ${C.border2}`}}>
              <td style={{padding:"7px 14px",fontWeight:800,color:C.accentL,fontSize:11,
                position:"sticky",left:0,background:"#071810",borderRight:`1px solid ${C.border}`,zIndex:1}}>
                FLUJO NETO
              </td>
              {colStructure.map(({season:s,collapsed,cols})=>{
                if(collapsed){
                  const total=s.indices.reduce((a,i)=>a+flujoArr[i],0);
                  return <td key={s.key} style={{padding:"7px 8px",textAlign:"right",fontWeight:800,
                    fontSize:11,color:cf(total),borderLeft:`2px solid ${C.border2}`}}>{$$(total)}</td>;
                }
                return cols.map((col,ci)=>{
                  const nSems=col.type==="month_collapsed"?1:col.nSems;
                  const val=flujoArr[col.idx]/nSems;
                  const isFirst=col.isFirstInSeason||col.isFirstInMonth;
                  return <td key={`flujo-${col.mes}-${col.label}-${ci}`}
                    style={{padding:"6px 5px",textAlign:"right",fontWeight:800,fontSize:10,color:cf(val),
                      borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:isFirst?`1px solid ${C.border}44`:`1px solid ${C.border}11`}}>
                    {$$(val)}
                  </td>;
                });
              })}
            </tr>
            {/* SALDO ACUM */}
            <tr style={{background:"rgba(96,165,250,0.06)"}}>
              <td style={{padding:"7px 14px",fontWeight:800,color:C.blue,fontSize:11,
                position:"sticky",left:0,background:"#071810",borderRight:`1px solid ${C.border}`,zIndex:1}}>
                SALDO ACUM.
              </td>
              {colStructure.map(({season:s,collapsed,cols})=>{
                if(collapsed){
                  const last=s.indices[s.indices.length-1];
                  return <td key={s.key} style={{padding:"7px 8px",textAlign:"right",fontWeight:800,
                    fontSize:11,color:cf(acumArr[last]),borderLeft:`2px solid ${C.border2}`}}>
                    {$$(acumArr[last])}
                  </td>;
                }
                return cols.map((col,ci)=>{
                  const isFirst=col.isFirstInSeason||col.isFirstInMonth;
                  return <td key={`acum-${col.mes}-${col.label}-${ci}`}
                    style={{padding:"6px 5px",textAlign:"right",fontWeight:700,fontSize:10,
                      color:cf(acumArr[col.idx]),
                      borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:isFirst?`1px solid ${C.border}44`:`1px solid ${C.border}11`}}>
                    {$$(acumArr[col.idx])}
                  </td>;
                });
              })}
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {/* Header empresa */}
      <div style={{background:`${emp.color}15`,border:`1px solid ${emp.color}44`,borderRadius:12,
        padding:"14px 18px",display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
        <span style={{fontSize:28}}>{emp.emoji}</span>
        <div style={{flex:1}}>
          <div style={{fontSize:14,fontWeight:900,color:C.text}}>{empNombre}</div>
          <div style={{fontSize:11,color:C.muted}}>{emp.desc}</div>
          {emp.hasFormula&&<div style={{fontSize:10,color:C.yellow,marginTop:2}}>⚡ Ingresos y costos calculados automáticamente desde Parámetros</div>}
        </div>
        <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
          {[{l:"Saldo inicial",v:emp.saldo_ini,c:C.blue},
            {l:"Flujo total",v:flujoArr.reduce((a,b)=>a+b,0),c:cf(flujoArr.reduce((a,b)=>a+b,0))},
            {l:"Saldo Jun-31",v:acumArr[acumArr.length-1],c:cf(acumArr[acumArr.length-1])}
          ].map(k=>(
            <div key={k.l} style={{textAlign:"right"}}>
              <div style={{fontSize:9,color:C.muted,textTransform:"uppercase"}}>{k.l}</div>
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
          <button onClick={()=>setShowReal(v=>!v)}
            style={{marginLeft:"auto",padding:"6px 14px",borderRadius:8,
              border:`1px solid ${showReal?emp.color:C.border}`,
              background:showReal?`${emp.color}22`:"transparent",
              color:showReal?emp.color:C.muted,cursor:"pointer",fontSize:11,fontWeight:600}}>
            ✏️ Ingresar Real
          </button>
        )}
      </div>
      {/* Tabla */}
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
      {/* Gráfico acumulado */}
      <Card>
        <SectionTitle>Saldo Acumulado — Mar-26 → Jun-31</SectionTitle>
        <LineChart months={MESES_65} values={acumArr} color={emp.color}/>
      </Card>
      {/* Modal ingreso real — fuera del árbol para evitar re-renders */}
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
        <div style={{marginTop:8,padding:"8px 12px",background:"rgba(248,113,113,0.08)",border:`1px solid ${C.red}33`,borderRadius:8,fontSize:11,color:C.muted}}>
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
            <thead><tr style={{background:"rgba(0,0,0,0.2)"}}>
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
            <thead><tr style={{background:"rgba(0,0,0,0.2)"}}>
              {["#","Empresa","Acreedor","Tipo","Monto","Cuota","Vencimiento","Tasa"].map(h=><th key={h} style={{padding:"8px 12px",fontWeight:600,fontSize:10,color:C.muted,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`,textAlign:["Monto","Cuota","Tasa"].includes(h)?"right":"left",whiteSpace:"nowrap"}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {filtered.map(c=>{
                const vencProx=new Date(c.f_venc)<=new Date("2026-12-31");
                const e=empresas[c.empresa]||{emoji:"🏢",color:C.blue};
                return (
                  <tr key={c.n} style={{borderBottom:`1px solid ${C.border}22`,background:vencProx?"rgba(251,191,36,0.05)":"transparent"}}>
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

// semana ISO aproximada de una fecha
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

// ═══════════════════════════════════════════════════════════════════
// TABLA FIJA DE CUENTAS: todas las empresas × bancos × monedas
// ═══════════════════════════════════════════════════════════════════
const EMPRESAS_LIST = [
  "Mediterra","Allegria Foods","Allegria Service",
  "Frisku Foods","Frisku Peru","Allpa Farms",
  "Allpa Farms Perú","Integrity Farms","Osiris"
];
const BANCOS_CHILE = ["BCI","BICE","Security","Chile","Santander"];
const BANCOS_PERU  = ["Scotiabank Perú","BBVA Perú"];
const TODOS_BANCOS = [...BANCOS_CHILE,...BANCOS_PERU];

// Genera todas las combinaciones fijas: empresa × banco × moneda
// Empresas chilenas usan bancos Chile + monedas CLP/USD/EUR
// Empresas Perú usan bancos Perú + monedas PEN/USD
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

// Fetch paridades de cambio a USD desde open.er-api.com (permite CORS, sin API key)
async function fetchFX() {
  try {
    // exchangerate-api.com — endpoint público sin API key, permite CORS
    const r = await fetch("https://open.er-api.com/v6/latest/USD");
    const d = await r.json();
    if(d.result !== "success") return null;
    const rates = d.rates;
    // rates: cuántas unidades de X hay por 1 USD
    const clpRate = rates.CLP || null;  // CLP por 1 USD
    const eurRate = rates.EUR || null;  // EUR por 1 USD
    const penRate = rates.PEN || null;  // PEN por 1 USD
    return {
      clp: clpRate ? 1/clpRate : null,   // 1 CLP = ? USD
      eur: eurRate ? 1/eurRate : null,   // 1 EUR = ? USD
      pen: penRate ? 1/penRate : null,   // 1 PEN = ? USD
      usd: 1,
      clpRaw: clpRate,  // USD/CLP (cuántos CLP por 1 USD)
      eurRaw: eurRate ? 1/eurRate : null, // USD/EUR (cuántos USD por 1 EUR)
      penRaw: penRate,  // USD/PEN (cuántos PEN por 1 USD)
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
  // Empresas colapsadas — por defecto todas abiertas
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

  const porEmpresa = useMemo(()=>{
    const m={};
    CUENTAS_FIJAS.forEach(c=>{
      if(!m[c.emp]) m[c.emp]=[];
      m[c.emp].push(c);
    });
    return m;
  },[]);

  const sym=(id)=>MONEDAS.find(m=>m.id===id)?.symbol||"$";

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10}}>
        {/* Total consolidado */}
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
        {/* Paridades */}
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

      {/* Fecha + Guardar */}
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

      {/* Acordeón por empresa */}
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
              borderRadius:12,overflow:"hidden",transition:"border-color 0.2s"}}>

              {/* Header empresa — click para colapsar */}
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

              {/* Filas cuentas — solo si está abierto */}
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
                        const numVal=parseFloat(val)||0;
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
        Paridades obtenidas de open.er-api.com (actualización diaria) · Se cargan al abrir la pestaña
      </div>
    </div>
  );
}


// MÓDULO PRINCIPAL
// ═══════════════════════════════════════════════════════════════════
export default function FinanzasModule({onBack,onLogout,usuarioActual,tabPermisos={}}) {
  const [tab,setTab]=useState("dashboard");
  const [empTab,setEmpTab]=useState("Mediterra");
  const [realData,setRealData]=useState({});
  const [params,setParams]=useState(defaultParams);
  const [saldosBancos,setSaldosBancos]=useState({});
  const [loading,setLoading]=useState(true);
  const [saved,setSaved]=useState(null);

  const esAdmin = usuarioActual?.rol==="admin";
  const canEdit = esAdmin || ["Angelo Huerta","Carol Machuca"].includes(usuarioActual?.nombre||"");

  // Permisos por pestaña — default editar si no hay configuración
  const perm  = (tabId) => tabPermisos?.[tabId] ?? "editar";
  const puedoEdit = (tabId) => esAdmin || perm(tabId) !== "ver";

  const empresas=useMemo(()=>buildEmpresas(params),[params]);

  const TABS=[
    {id:"dashboard",label:"📊 Dashboard"},
    {id:"flujo",    label:"📈 Flujo Empresas"},
    {id:"bancos",   label:"🏦 Saldos Bancos"},
    {id:"creditos", label:"💳 Créditos"},
    {id:"params",   label:"⚡ Parámetros"},
  ];

  useEffect(()=>{
    dbLoad().then(d=>{
      if(d?.finanzas_real) setRealData(d.finanzas_real);
      else if(d&&!d.finanzas_real&&!d.allegria_params) setRealData(d);
      if(d?.allegria_params) setParams(prev=>({...defaultParams(),...d.allegria_params}));
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
    const ok=await dbSave({finanzas_real:next,allegria_params:params,saldos_bancos:saldosBancos});
    setSaved(ok?"✅ Guardado":"⚠️ Error");
    setTimeout(()=>setSaved(null),3000);
  },[realData,params,saldosBancos]);

  const handleSaveSaldos=useCallback(async(next)=>{
    setSaldosBancos(next);
    const ok=await dbSave({finanzas_real:realData,allegria_params:params,saldos_bancos:next});
    setSaved(ok?"✅ Guardado":"⚠️ Error");
    setTimeout(()=>setSaved(null),3000);
  },[realData,params]);

  useEffect(()=>{
    if(loading) return;
    const t=setTimeout(()=>dbSave({finanzas_real:realData,allegria_params:params,saldos_bancos:saldosBancos}),800);
    return ()=>clearTimeout(t);
  },[params,loading]); // eslint-disable-line

  if(loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",
      height:"60vh",color:C.muted,fontSize:14,background:C.bg}}>
      Cargando datos financieros...
    </div>
  );

  return (
    <div style={{fontFamily:"'IBM Plex Sans','Segoe UI',system-ui,sans-serif",
      color:C.text,minHeight:"100vh",background:C.bg,paddingBottom:40}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
        marginBottom:20,flexWrap:"wrap",gap:8,paddingBottom:14,borderBottom:`1px solid ${C.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={onBack} style={{background:"rgba(255,255,255,0.06)",
            border:`1px solid ${C.border}`,color:C.text,borderRadius:8,
            padding:"6px 14px",cursor:"pointer",fontSize:12}}>← Hub</button>
          <img src="/med.png" alt="Mediterra" style={{height:30,objectFit:"contain"}}
            onError={e=>{e.target.style.display="none";}}/>
          <div>
            <div style={{fontSize:13,fontWeight:900,color:C.text}}>Finanzas · Grupo Mediterra</div>
            <div style={{fontSize:10,color:C.muted}}>Mar-2026 → Jun-2031 · 65 meses · 6 Temporadas · USD</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {saved&&<span style={{fontSize:11,color:C.muted,background:C.card2,
            borderRadius:20,padding:"3px 10px"}}>{saved}</span>}
          <button onClick={onLogout} style={{background:"rgba(248,113,113,0.15)",border:"none",
            color:C.red,borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12}}>Salir</button>
        </div>
      </div>

      {/* Pestañas */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:20}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"7px 16px",borderRadius:8,cursor:"pointer",fontWeight:600,fontSize:12,
              border:`1px solid ${tab===t.id?C.accent:C.border}`,
              background:tab===t.id?`${C.accent}33`:"transparent",
              color:tab===t.id?C.accentL:C.muted}}>
            {t.label}
          </button>
        ))}
      </div>

      {tab==="dashboard"&&<Dashboard empresas={empresas}/>}
      {tab==="flujo"&&(
        <div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
            {Object.keys(empresas).map(n=>{const e=empresas[n];return (
              <button key={n} onClick={()=>setEmpTab(n)}
                style={{padding:"6px 12px",borderRadius:8,cursor:"pointer",fontSize:11,fontWeight:600,
                  border:`1px solid ${empTab===n?e.color:C.border}`,
                  background:empTab===n?`${e.color}22`:"transparent",
                  color:empTab===n?e.color:C.muted}}>
                {e.emoji} {n}{n==="Allegria Foods"&&<span style={{fontSize:9,marginLeft:3,color:C.yellow}}>⚡</span>}
              </button>
            );})}
          </div>
          <FlujoEmpresa key={empTab} empNombre={empTab} empresas={empresas}
            realData={realData} onSaveReal={handleSaveReal} canEdit={puedoEdit("flujo")}/>
        </div>
      )}
      {tab==="bancos"&&(
        <SaldosBancos saldos={saldosBancos} onSave={handleSaveSaldos} canEdit={puedoEdit("bancos")}/>
      )}
      {tab==="creditos"&&<Creditos empresas={empresas}/>}
      {tab==="params"&&(
        <TabParametros params={params} setParams={puedoEdit("params")?setParams:()=>{}}
          readOnly={!puedoEdit("params")}/>
      )}
    </div>
  );
}

// ─── REEMPLAZAR export default con versión que soporta tabPermisos ───
// (el bloque de arriba queda como respaldo; React usa el último export)
