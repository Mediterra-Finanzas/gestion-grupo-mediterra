/* eslint-disable */
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import EEFFModule from './EEFFModule.jsx';
import RendicionesModule from './RendicionesModule.jsx';
import { theme } from './theme';
import { exportarFlujoConsolidado } from './flujoExportExcel.js';
import { buildAllpaPeruLineas } from './allpaPeruPpto.js';
import * as XLSX from 'xlsx-js-style'; // SheetJS (fork con estilos) — ya instalado
import { uploadDocNomina, urlFirmadaNomina } from './friskuHelpers';
import { esLineaRelacionada, hashArchivo, docsActivos, tieneRespaldo, pathDocNomina, coberturaNomina, siguienteCorrelativo } from './expedienteHelpers';
import { USE_GUARD, pollRow } from './guardClient';

// ═══════════════════════════════════════════════════════════════════
// TIEMPO: Mar-26 → Jun-31 (65 meses)
// ═══════════════════════════════════════════════════════════════════
const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function generarMeses() {
  const out = [];
  let y = 2026, m = 3; // Empieza en Apr-26
  // Genera Apr-26 a Jun-31 = 63 meses
  while (out.length < 63) {
    out.push({ label:`${MN[m]}-${String(y).slice(2)}`, y, m, idx:out.length });
    m++; if (m > 11) { m = 0; y++; }
  }
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
  "Apr-26":["S14","S15","S16","S17"],
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

const Z65  = () => Array(63).fill(0); // 63 meses: Apr-26 → Jun-31
function ext(arr) { const r=[...(arr||[])]; while(r.length<63) r.push(0); if(r.length>63) r.splice(63); return r; }
function mIdx(label) { return MESES_65.indexOf(label); }

// ═══════════════════════════════════════════════════════════════════
// SUPABASE
// ═══════════════════════════════════════════════════════════════════
const SUPA_URL = "https://bywovqayuzodbzwsriet.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5d292cWF5dXpvZGJ6d3NyaWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODU1MDgsImV4cCI6MjA5MTI2MTUwOH0.s2x2O_CxE6rl8dBqFuyfQdMyRqSyjJQWXJXesmVGXtk";

async function dbLoad() {
  // NO atrapar el error: si la lectura falla (red/HTTP), la excepción DEBE
  // propagar para que el caller NO habilite el guardado (que sobrescribiría
  // los 4.6 MB de Finanzas con los defaults vacíos en memoria). Solo se
  // devuelve {} cuando la fila existe pero está vacía (instalación nueva).
  const r = await fetch(`${SUPA_URL}/rest/v1/calendario_data?id=eq.finanzas&select=value`,
    { headers:{ apikey:SUPA_KEY, Authorization:`Bearer ${SUPA_KEY}` }});
  if(!r.ok) throw new Error(`dbLoad finanzas HTTP ${r.status}`);
  const d = await r.json();
  const parsed = d?.[0]?.value ? JSON.parse(d[0].value) : {};
  console.log("[dbLoad] keys:", Object.keys(parsed), "saldos_bancos keys:", Object.keys(parsed.saldos_bancos||{}).length);
  return parsed;
}
async function dbSave(data) {
  try {
    const body = JSON.stringify({ id:"finanzas", value:JSON.stringify(data) });
    const r = await fetch(`${SUPA_URL}/rest/v1/calendario_data`, {
      method:"POST",
      headers:{ apikey:SUPA_KEY, Authorization:`Bearer ${SUPA_KEY}`,
        "Content-Type":"application/json", "Prefer":"resolution=merge-duplicates" },
      body,
    });
    if(!r.ok) {
      const txt = await r.text().catch(()=>"");
      console.error("[dbSave] HTTP",r.status, txt);
      return false;
    }
    return true;
  } catch(e) {
    console.error("[dbSave] fetch error:", e);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════
// PARÁMETROS ALLEGRIA FOODS
// ═══════════════════════════════════════════════════════════════════
const FRUTAS      = ['cerezas','ciruelas','arandanos'];
const FRUTA_LABEL = { cerezas:'Cerezas', ciruelas:'Ciruelas', arandanos:'Arándanos Perú (Comercialización)' };
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

function defaultAllegraComisionArandanos() {
  return { cobros: [] };
}

// Migración automática desde params.arandanos (legacy) → nuevo calendario
function migrateAllegraComisionArandanos(allegraParams) {
  if (!allegraParams) return null;
  const cobros = [];
  SEASON_KEYS.forEach(sk => {
    const p = allegraParams?.[sk]?.arandanos;
    if (!p) return;
    const kg = Number(p.kg) || 0;
    const fob = Number(p.fob_usd_kg) || 0;
    const feePct = Number(p.desc_exp_pct) || 0;
    if (!kg && !fob) return;
    const pagos = p.mes_liquidacion ? [{ mes: p.mes_liquidacion, pct: 100 }] : [];
    cobros.push({ id:`cobro_mig_${sk}`, temporada:sk, descripcion:"Arándanos Perú (migrado)", kgTotal:kg, fobUsdKg:fob, feePct, pagos });
  });
  if (cobros.length === 0) return null;
  return { cobros, _migratedFrom: true };
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

// Allegria Service: parámetros por especie (cerezas / ciruelas)
function defaultParamsAllegriaService() {
  const p = {};
  SEASON_KEYS.forEach(sk => {
    p[sk] = {
      // kg_mes: { "Nov-26": {kg:0, mes_cobro:""} } — cobro indexado por mes de proceso
      cerezas: { kg_mes:{}, usd_kg:0 },
      ciruelas:{ kg_mes:{}, usd_kg:0 },
    };
  });
  return p;
}

// Calcula proyección de ingresos para Allegria Service desde sus parámetros
function calcAllegriaService(paramsAS) {
  const ingCerezas  = Z65();
  const ingCiruelas = Z65();
  SEASON_KEYS.forEach(sk => {
    const d = paramsAS?.[sk];
    if(!d) return;
    ["cerezas","ciruelas"].forEach(esp => {
      const p = d[esp]; if(!p) return;
      const usd = Number(p.usd_kg)||0; if(!usd) return;
      // Iterar por mes de proceso — cada mes tiene su propio mes_cobro
      Object.entries(p.kg_mes||{}).forEach(([mesProceso, entry]) => {
        const kg = Number(typeof entry==="object" ? entry.kg : entry)||0;
        if(!kg) return;
        const mesCobro = typeof entry==="object" ? entry.mes_cobro : "";
        const ingMes   = kg * usd;
        const targetMes = mesCobro || mesProceso; // fallback: cobrar en mismo mes
        const i = mIdx(targetMes);
        if(i >= 0) {
          if(esp==="cerezas")  ingCerezas[i]  += ingMes;
          else                 ingCiruelas[i] += ingMes;
        }
      });
    });
  });
  return { ingCerezas, ingCiruelas };
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
  console.log("[calcAllegria] cerezas 26-27 kg:", params?.["2026-2027"]?.cerezas?.kg);
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

      // Arándanos Perú: ingreso = kg × FOB × fee% en mes_liquidacion (servicio de comercialización)
      if(f === 'arandanos') {
        const fee_pct = desc; // desc_exp_pct se usa como % fee de comercialización
        const ingresoFee = kg * fob * fee_pct;
        if(p.mes_liquidacion) {
          const i = mIdx(p.mes_liquidacion);
          if(i >= 0) ing[f][i] += ingresoFee;
        }
        // No hay costos ni materiales para servicio de comercialización
        return;
      }

      // Cerezas y Ciruelas: lógica original
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
// CRÉDITOS
// ═══════════════════════════════════════════════════════════════════
const CREDITOS_DEFAULT = [
  {n:1,empresa:"Allegria Foods",acreedor:"Zelun",tipo_inst:"Privado",monto:120000,f_venc:"2026-11-30",tipo_cr:"Bullet",tasa:"",cuota:120000,pagado:false},
  {n:2,empresa:"Allegria Foods",acreedor:"Yiannis",tipo_inst:"Privado",monto:117000,f_venc:"2026-11-30",tipo_cr:"Bullet",tasa:"",cuota:117000,pagado:false},
  {n:3,empresa:"Allegria Foods",acreedor:"Fresion",tipo_inst:"Privado",monto:136000,f_venc:"2026-11-30",tipo_cr:"Bullet",tasa:"",cuota:136000,pagado:false},
  {n:4,empresa:"Allegria Foods",acreedor:"Qupai",tipo_inst:"Privado",monto:76864,f_venc:"2026-11-30",tipo_cr:"Bullet",tasa:"",cuota:76864,pagado:false},
  {n:5,empresa:"Allegria Foods",acreedor:"China Smart",tipo_inst:"Privado",monto:50000,f_venc:"2026-11-30",tipo_cr:"Bullet",tasa:"",cuota:50000,pagado:false},
  {n:6,empresa:"Allegria Foods",acreedor:"Zelun",tipo_inst:"Privado",monto:70000,f_venc:"2027-05-31",tipo_cr:"Bullet",tasa:"",cuota:70000,pagado:false},
  {n:7,empresa:"Allegria Foods",acreedor:"Yiannis",tipo_inst:"Privado",monto:117000,f_venc:"2027-05-31",tipo_cr:"Bullet",tasa:"",cuota:117000,pagado:false},
  {n:8,empresa:"Allegria Foods",acreedor:"Fresion",tipo_inst:"Privado",monto:135000,f_venc:"2027-05-31",tipo_cr:"Bullet",tasa:"",cuota:135000,pagado:false},
  {n:9,empresa:"Allegria Foods",acreedor:"Qupai",tipo_inst:"Privado",monto:76864,f_venc:"2027-05-31",tipo_cr:"Bullet",tasa:"",cuota:76864,pagado:false},
  {n:10,empresa:"Allegria Foods",acreedor:"China Smart",tipo_inst:"Privado",monto:50000,f_venc:"2027-05-31",tipo_cr:"Bullet",tasa:"",cuota:50000,pagado:false},
  {n:11,empresa:"Allegria Foods",acreedor:"Banco BICE",tipo_inst:"Banco",monto:200000,f_venc:"2026-06-02",tipo_cr:"Bullet",tasa:"8.3%",cuota:200000,pagado:false},
  {n:12,empresa:"Allegria Foods",acreedor:"Banco Santander",tipo_inst:"Banco",monto:105000,f_venc:"2026-06-30",tipo_cr:"Bullet",tasa:"7.6%",cuota:105000,pagado:false},
  {n:13,empresa:"Allegria Foods",acreedor:"Banco Santander",tipo_inst:"Banco",monto:105000,f_venc:"2026-07-31",tipo_cr:"Bullet",tasa:"7.6%",cuota:105000,pagado:false},
  {n:14,empresa:"Allegria Foods",acreedor:"Banco Santander",tipo_inst:"Banco",monto:105000,f_venc:"2026-08-11",tipo_cr:"Bullet",tasa:"7.6%",cuota:105000,pagado:false},
  {n:15,empresa:"Allegria Foods",acreedor:"Banco Santander",tipo_inst:"Banco",monto:105000,f_venc:"2026-09-01",tipo_cr:"Bullet",tasa:"7.6%",cuota:105000,pagado:false},
  {n:16,empresa:"Allegria Foods",acreedor:"Banco Santander",tipo_inst:"Banco",monto:105000,f_venc:"2026-09-04",tipo_cr:"Bullet",tasa:"7.6%",cuota:105000,pagado:false},
  {n:17,empresa:"Allegria Foods",acreedor:"Banco Santander",tipo_inst:"Banco",monto:75000,f_venc:"2026-09-25",tipo_cr:"Bullet",tasa:"7.6%",cuota:75000,pagado:false},
  {n:50,empresa:"Frisku Foods",acreedor:"Banco Security",tipo_inst:"Banco",monto:12637,f_venc:"2026-04-25",tipo_cr:"Cuotas Mensuales",tasa:"10.7%",cuota:12637,pagado:false},
  {n:51,empresa:"Frisku Foods",acreedor:"Banco Security",tipo_inst:"Banco",monto:12637,f_venc:"2026-05-25",tipo_cr:"Cuotas Mensuales",tasa:"10.7%",cuota:12637,pagado:false},
  {n:52,empresa:"Frisku Foods",acreedor:"Banco Security",tipo_inst:"Banco",monto:12637,f_venc:"2026-06-25",tipo_cr:"Cuotas Mensuales",tasa:"10.7%",cuota:12637,pagado:false},
  {n:53,empresa:"Frisku Foods",acreedor:"Banco Security",tipo_inst:"Banco",monto:12637,f_venc:"2026-07-25",tipo_cr:"Cuotas Mensuales",tasa:"10.7%",cuota:12637,pagado:false},
  {n:54,empresa:"Frisku Foods",acreedor:"Banco Security",tipo_inst:"Banco",monto:12637,f_venc:"2026-08-25",tipo_cr:"Cuotas Mensuales",tasa:"10.7%",cuota:12637,pagado:false},
  {n:18,empresa:"Frisku Foods",acreedor:"Banco Security",tipo_inst:"Banco",monto:12637,f_venc:"2026-09-25",tipo_cr:"Cuotas Mensuales",tasa:"10.7%",cuota:12637,pagado:false},
  {n:19,empresa:"Frisku Foods",acreedor:"Banco BICE",tipo_inst:"Banco",monto:52391,f_venc:"2026-04-13",tipo_cr:"Bullet",tasa:"9.7%",cuota:52391,pagado:false},
  {n:30,empresa:"Osiris",acreedor:"Banco Security",tipo_inst:"Banco",monto:9178,f_venc:"2026-04-30",tipo_cr:"Cuotas Mensuales",tasa:"",cuota:9178,pagado:false},
  {n:31,empresa:"Osiris",acreedor:"Banco Security",tipo_inst:"Banco",monto:9178,f_venc:"2026-05-31",tipo_cr:"Cuotas Mensuales",tasa:"",cuota:9178,pagado:false},
  {n:32,empresa:"Osiris",acreedor:"Banco Security",tipo_inst:"Banco",monto:9178,f_venc:"2026-06-30",tipo_cr:"Cuotas Mensuales",tasa:"",cuota:9178,pagado:false},
  {n:33,empresa:"Osiris",acreedor:"Banco Security",tipo_inst:"Banco",monto:9178,f_venc:"2026-07-31",tipo_cr:"Cuotas Mensuales",tasa:"",cuota:9178,pagado:false},
  {n:34,empresa:"Osiris",acreedor:"Banco Security",tipo_inst:"Banco",monto:9178,f_venc:"2026-08-31",tipo_cr:"Cuotas Mensuales",tasa:"",cuota:9178,pagado:false},
  {n:35,empresa:"Osiris",acreedor:"Banco Security",tipo_inst:"Banco",monto:9178,f_venc:"2026-09-30",tipo_cr:"Cuotas Mensuales",tasa:"",cuota:9178,pagado:false},
  {n:36,empresa:"Osiris",acreedor:"Banco Security",tipo_inst:"Banco",monto:9178,f_venc:"2026-10-31",tipo_cr:"Cuotas Mensuales",tasa:"",cuota:9178,pagado:false},
  {n:37,empresa:"Osiris",acreedor:"Banco Security",tipo_inst:"Banco",monto:9178,f_venc:"2026-11-30",tipo_cr:"Cuotas Mensuales",tasa:"",cuota:9178,pagado:false},
  {n:20,empresa:"Osiris",acreedor:"Banco Security",tipo_inst:"Banco",monto:9178,f_venc:"2026-12-05",tipo_cr:"Cuotas Mensuales",tasa:"",cuota:9178,pagado:false},
  {n:21,empresa:"Osiris",acreedor:"BCI",tipo_inst:"Banco",monto:350000,f_venc:"2026-06-27",tipo_cr:"Bullet",tasa:"9.3%",cuota:350000,pagado:false},
  {n:22,empresa:"Allegria Service",acreedor:"BCI",tipo_inst:"Banco",monto:395759,f_venc:"2026-11-05",tipo_cr:"Leasing",tasa:"8.5%",cuota:600000,pagado:false},
  {n:23,empresa:"Allegria Service",acreedor:"BCI",tipo_inst:"Banco",monto:429557,f_venc:"2027-11-05",tipo_cr:"Leasing",tasa:"8.5%",cuota:600000,pagado:false},
  {n:24,empresa:"Allegria Service",acreedor:"BCI",tipo_inst:"Banco",monto:543447,f_venc:"2028-11-05",tipo_cr:"Leasing",tasa:"8.5%",cuota:677206,pagado:false},
  {n:25,empresa:"Allegria Service",acreedor:"BCI",tipo_inst:"Banco",monto:589857,f_venc:"2029-11-05",tipo_cr:"Leasing",tasa:"8.5%",cuota:677206,pagado:false},
  {n:26,empresa:"Allegria Service",acreedor:"BCI",tipo_inst:"Banco",monto:432959,f_venc:"2029-12-05",tipo_cr:"Leasing",tasa:"8.5%",cuota:436040,pagado:false},
  {n:27,empresa:"Allpa Farms",acreedor:"Banco de Chile",tipo_inst:"Banco",monto:245273,f_venc:"2026-06-26",tipo_cr:"Crédito Hipotecario",tasa:"7.7%",cuota:245273,pagado:false},
  {n:28,empresa:"Allpa Farms",acreedor:"Banco de Chile",tipo_inst:"Banco",monto:198867,f_venc:"2027-06-29",tipo_cr:"Crédito Hipotecario",tasa:"7.7%",cuota:198867,pagado:false},
  {n:29,empresa:"Allpa Farms",acreedor:"Banco de Chile",tipo_inst:"Banco",monto:228192,f_venc:"2028-06-27",tipo_cr:"Crédito Hipotecario",tasa:"7.7%",cuota:228192,pagado:false},
  {n:30,empresa:"Allpa Farms",acreedor:"Banco de Chile",tipo_inst:"Banco",monto:216751,f_venc:"2029-06-26",tipo_cr:"Crédito Hipotecario",tasa:"7.7%",cuota:216751,pagado:false},
  {n:31,empresa:"Allpa Farms",acreedor:"Banco de Chile",tipo_inst:"Banco",monto:205467,f_venc:"2030-06-26",tipo_cr:"Crédito Hipotecario",tasa:"7.7%",cuota:205467,pagado:false},
  {n:32,empresa:"Allpa Farms",acreedor:"Banco de Chile",tipo_inst:"Banco",monto:193995,f_venc:"2031-06-26",tipo_cr:"Crédito Hipotecario",tasa:"7.7%",cuota:193995,pagado:false},
  {n:42,empresa:"Allpa Farms",acreedor:"Banco de Chile",tipo_inst:"Banco",monto:182899,f_venc:"2032-06-29",tipo_cr:"Crédito Hipotecario",tasa:"7.7%",cuota:182899,pagado:false},
  {n:43,empresa:"Allpa Farms",acreedor:"Banco de Chile",tipo_inst:"Banco",monto:170987,f_venc:"2033-06-28",tipo_cr:"Crédito Hipotecario",tasa:"7.7%",cuota:170987,pagado:false},
  {n:44,empresa:"Allpa Farms",acreedor:"Banco de Chile",tipo_inst:"Banco",monto:159543,f_venc:"2034-06-27",tipo_cr:"Crédito Hipotecario",tasa:"7.7%",cuota:159543,pagado:false},
  {n:33,empresa:"Mediterra",acreedor:"Privado Particular",tipo_inst:"Privado",monto:34650,f_venc:"2026-06-01",tipo_cr:"Inversión",tasa:"12.6%",cuota:34650,pagado:false},
  {n:34,empresa:"Mediterra",acreedor:"Privado Particular",tipo_inst:"Privado",monto:34650,f_venc:"2026-09-01",tipo_cr:"Inversión",tasa:"12.6%",cuota:34650,pagado:false},
  {n:35,empresa:"Mediterra",acreedor:"Privado Particular",tipo_inst:"Privado",monto:34650,f_venc:"2026-12-01",tipo_cr:"Inversión",tasa:"12.6%",cuota:34650,pagado:false},
  {n:36,empresa:"Mediterra",acreedor:"Privado Particular",tipo_inst:"Privado",monto:550000,f_venc:"2027-01-01",tipo_cr:"Inversión",tasa:"12.6%",cuota:550000,pagado:false},
  {n:37,empresa:"Mediterra",acreedor:"Privado Particular",tipo_inst:"Privado",monto:17325,f_venc:"2027-03-01",tipo_cr:"Inversión",tasa:"12.6%",cuota:17325,pagado:false},
  {n:38,empresa:"Mediterra",acreedor:"Privado Particular",tipo_inst:"Privado",monto:17325,f_venc:"2027-06-01",tipo_cr:"Inversión",tasa:"12.6%",cuota:17325,pagado:false},
  {n:39,empresa:"Mediterra",acreedor:"Privado Particular",tipo_inst:"Privado",monto:17325,f_venc:"2027-09-01",tipo_cr:"Inversión",tasa:"12.6%",cuota:17325,pagado:false},
  {n:40,empresa:"Mediterra",acreedor:"Privado Particular",tipo_inst:"Privado",monto:17325,f_venc:"2027-12-01",tipo_cr:"Inversión",tasa:"12.6%",cuota:17325,pagado:false},
  {n:41,empresa:"Mediterra",acreedor:"Privado Particular",tipo_inst:"Privado",monto:550000,f_venc:"2028-01-01",tipo_cr:"Inversión",tasa:"12.6%",cuota:550000,pagado:false},
];
const CREDITOS_TRIM = {
  quarters:["Q1 2026","Q2 2026","Q3 2026","Q4 2026","Q1 2027","Q2 2027","Q3 2027","Q4 2027","Q1 2028","Q2 2028","Q3 2028","Q4 2028"],
  pagos:   [21815,1064994,983763,1517473,922750,1348929,677657,972750,1016426,800196,0,0],
  saldos:  [8355763,7761667,7667292,6513894,5946569,5287401,5270076,4652751,4102751,3881315,3881315,3881315],
};

// Calcula array proy[64] de pagos de préstamos desde CREDITOS para una empresa
// Coloca cada cuota en el índice del mes de vencimiento (semana más aproximada)
function calcPrestamosEmpresa(empresa, creditos=CREDITOS_DEFAULT) {
  const arr = Z65();
  creditos.filter(c => c.empresa === empresa && !c.pagado).forEach(c => {
    if(!c.f_venc || !c.cuota) return;
    const cuota = Number(c.cuota)||0;
    if(cuota === 0) return;
    
    if(c.tipo_cr === "Cuotas Mensuales" && c.f_inicio) {
      // Distribuir cuotas mensuales desde f_inicio hasta f_venc
      const inicio = new Date(c.f_inicio);
      const fin = new Date(c.f_venc);
      if(isNaN(inicio) || isNaN(fin)) return;
      let fecha = new Date(inicio);
      // Primera cuota en el mes siguiente al desembolso
      fecha.setMonth(fecha.getMonth() + 1);
      while(fecha <= fin) {
        const mes = `${MN[fecha.getMonth()]}-${String(fecha.getFullYear()).slice(2)}`;
        const i = mIdx(mes);
        if(i >= 0) arr[i] += cuota;
        fecha.setMonth(fecha.getMonth() + 1);
      }
    } else {
      // Bullet y otros: una cuota al vencimiento
      const mes = mesDeDate(c.f_venc);
      if(!mes || mes.includes("NaN")) return;
      const i = mIdx(mes);
      if(i >= 0) arr[i] += cuota;
    }
  });
  return arr;
}

// Calcula ingreso del préstamo (desembolso) en Ingresos No Operacionales
function calcIngresosPrestamosEmpresa(empresa, creditos=CREDITOS_DEFAULT) {
  const arr = Z65();
  creditos.filter(c => c.empresa === empresa && !c.pagado && c.f_inicio).forEach(c => {
    const monto = Number(c.monto)||0;
    if(monto === 0) return;
    const mes = mesDeDate(c.f_inicio);
    if(!mes || mes.includes("NaN")) return;
    const i = mIdx(mes);
    if(i >= 0) arr[i] += monto;
  });
  return arr;
}

// Retorna { mes: { semana: monto } } para posicionar en semana exacta de vencimiento
// Si la semana calculada no está en SEMANAS_MES del mes, usa la última semana del mes
function semanaVencimientoEnMes(f_venc) {
  const mes = mesDeDate(f_venc);
  const sem = semanaDeDate(f_venc);
  const semsDelMes = SEMANAS_MES[mes] || [];
  // Si la semana está en el mes → usarla; si no → usar la última semana del mes
  return { mes, sem: semsDelMes.includes(sem) ? sem : (semsDelMes[semsDelMes.length-1] || sem) };
}

// ── Genera cuotas de renovación para créditos renovables ya pagados ──────────
// Usa cuotas_renovacion:[{mes,anio,monto}] para fechas exactas
const MES_ABR_TO_EN = {
  "Ene":"Jan","Feb":"Feb","Mar":"Mar","Abr":"Apr","May":"May","Jun":"Jun",
  "Jul":"Jul","Ago":"Aug","Sep":"Sep","Oct":"Oct","Nov":"Nov","Dic":"Dec"
};

// Calcula monto real de cada cuota:
// "Solo Interés"    → interés sobre saldo (capital NO disminuye)
// "Capital+Interés" → amortización equitativa + interés sobre saldo (capital disminuye)
// El interés SIEMPRE se agrega automáticamente según tasa anual
// Mapa abreviatura mes español → número
const MES_ABR_NUM = {Ene:1,Feb:2,Mar:3,Abr:4,May:5,Jun:6,Jul:7,Ago:8,Sep:9,Oct:10,Nov:11,Dic:12};

function calcMontoRealCuota(cuotas, capital, tasaAnual, mesIngresoAnio) {
  const cuotasArr = cuotas||[];
  const n = cuotasArr.length;
  if(n===0) return [];
  const tasaMensual = (Number(tasaAnual)||0)/100/12;
  const nCapital = cuotasArr.filter(cq=>(cq.tipo||"Solo Interés")==="Capital+Interés").length;
  const amortPorCuota = nCapital>0 ? (Number(capital)||0)/nCapital : 0;
  let saldo = Number(capital)||0;

  // Fecha base: mes de ingreso del préstamo (para calcular meses exactos)
  // mesIngresoAnio: "May-26" o similar, o usar primer mes de cuotas
  let fechaBase = null;
  if(mesIngresoAnio) {
    const parts = String(mesIngresoAnio).split("-");
    if(parts.length===2) {
      const mesAbr = parts[0]; const anioS = parts[1];
      const mesN = MES_ABR_NUM[mesAbr]||1;
      const anioN = anioS.length===2 ? 2000+parseInt(anioS) : parseInt(anioS);
      fechaBase = {y:anioN, m:mesN};
    }
  }

  return cuotasArr.map((cq,i) => {
    const tipo = cq.tipo||"Solo Interés";
    // Calcular meses desde fecha base hasta esta cuota
    let interes = 0;
    if(tasaMensual > 0 && cq.mes && cq.anio) {
      const mesN = MES_ABR_NUM[cq.mes]||1;
      const anioN = parseInt(cq.anio)||2026;
      let mesesTransc = 0;
      if(fechaBase) {
        // Meses desde el ingreso (o última cuota) hasta esta cuota
        const prevCuota = i===0 ? fechaBase : (() => {
          const pc = cuotasArr[i-1];
          return pc?.mes && pc?.anio
            ? {y:parseInt(pc.anio)||2026, m:MES_ABR_NUM[pc.mes]||1}
            : fechaBase;
        })();
        mesesTransc = (anioN - prevCuota.y)*12 + (mesN - prevCuota.m);
      } else {
        // Sin fecha base, asumir período mensual
        mesesTransc = 1;
      }
      mesesTransc = Math.max(1, mesesTransc);
      interes = Math.round(saldo * tasaMensual * mesesTransc);
    }
    let montoReal, amort=0;
    if(tipo==="Capital+Interés") {
      amort = Math.round(amortPorCuota);
      montoReal = amort + interes;
      saldo = Math.max(0, saldo - amort);
    } else {
      montoReal = interes;
    }
    return {...cq, montoReal, interes, amort};
  });
}

function calcRenovacionesEmpresa(empresa, creditos=CREDITOS_DEFAULT) {
  const arr = Z65();
  creditos.filter(c => c.empresa === empresa && c.renovable).forEach(c => {
    const cuotasCalc = calcMontoRealCuota(c.cuotas_renovacion, c.monto_renovacion, c.tasa_anual, c.mes_ingreso_renovacion&&c.anio_ingreso_renovacion?`${c.mes_ingreso_renovacion}-${String(c.anio_ingreso_renovacion).slice(-2)}`:'');
    cuotasCalc.forEach(cq => {
      if(!cq.mes || !cq.anio) return;
      const monto = cq.montoReal || Number(cq.monto) || 0;
      const mesEn = MES_ABR_TO_EN[cq.mes] || cq.mes;
      const label = `${mesEn}-${String(cq.anio).slice(2)}`;
      const i = mIdx(label);
      if(i >= 0) arr[i] += monto;
    });
  });
  return arr;
}

function calcRenovacionesDesglose(empresa, creditos=CREDITOS_DEFAULT) {
  const byAcreedor = {};
  creditos.filter(c => c.empresa === empresa && c.renovable).forEach(c => {
    const key = c.acreedor + " (Ren.)";
    if(!byAcreedor[key]) byAcreedor[key] = Z65();
    const cuotasConInt = calcMontoRealCuota(c.cuotas_renovacion, c.monto_renovacion, c.tasa_anual, c.mes_ingreso_renovacion&&c.anio_ingreso_renovacion?`${c.mes_ingreso_renovacion}-${String(c.anio_ingreso_renovacion).slice(-2)}`:'');
    cuotasConInt.forEach(cq => {
      if(!cq.mes || !cq.anio) return;
      const monto = cq.montoReal || Number(cq.monto) || 0;
      const mesEn = MES_ABR_TO_EN[cq.mes] || cq.mes;
      const label = `${mesEn}-${String(cq.anio).slice(2)}`;
      const i = mIdx(label);
      if(i >= 0) byAcreedor[key][i] += monto;
    });
  });
  return byAcreedor;
}

// Genera array de ingresos por renovación (nuevo préstamo recibido)
function calcIngresoRenovacionEmpresa(empresa, creditos=CREDITOS_DEFAULT) {
  const arr = Z65();
  creditos.filter(c => c.empresa === empresa && c.renovable && c.monto_renovacion && c.mes_ingreso_renovacion && c.anio_ingreso_renovacion).forEach(c => {
    const mesEn = MES_ABR_TO_EN[c.mes_ingreso_renovacion] || c.mes_ingreso_renovacion;
    const label = `${mesEn}-${String(c.anio_ingreso_renovacion).slice(2)}`;
    const i = mIdx(label);
    if(i >= 0) arr[i] += Number(c.monto_renovacion)||0;
  });
  return arr;
}


// Retorna { acreedor: proy[64] } para desglose de ingresos por renovación
function calcIngresoRenovacionDesglose(empresa, creditos=CREDITOS_DEFAULT) {
  const byAcreedor = {};
  creditos.filter(c => c.empresa === empresa && c.renovable && c.monto_renovacion && c.mes_ingreso_renovacion && c.anio_ingreso_renovacion).forEach(c => {
    const key = c.acreedor + " (Ingr. Ren.)";
    if(!byAcreedor[key]) byAcreedor[key] = Z65();
    const mesEn = MES_ABR_TO_EN[c.mes_ingreso_renovacion] || c.mes_ingreso_renovacion;
    const label = `${mesEn}-${String(c.anio_ingreso_renovacion).slice(2)}`;
    const i = mIdx(label);
    if(i >= 0) byAcreedor[key][i] += Number(c.monto_renovacion)||0;
  });
  return byAcreedor;
}
function calcPrestamosSemanasEmpresa(empresa, creditos=CREDITOS_DEFAULT) {
  const bySemana = {}; // { "Nov-26": { "S47": 120000 } }
  creditos.filter(c => c.empresa === empresa && !c.pagado).forEach(c => {
    if(!c.f_venc || !c.cuota) return;
    const { mes, sem } = semanaVencimientoEnMes(c.f_venc);
    const monto = Number(c.cuota)||0;
    if(!bySemana[mes]) bySemana[mes] = {};
    bySemana[mes][sem] = (bySemana[mes][sem]||0) + monto;
  });
  return bySemana;
}

// Retorna { acreedor: proy[64] } desglosado por institución
function calcPrestamosDesglose(empresa, creditos=CREDITOS_DEFAULT) {
  const byAcreedor = {};
  creditos.filter(c => c.empresa === empresa && !c.pagado).forEach(c => {
    if(!c.f_venc || !c.cuota) return;
    const mes = mesDeDate(c.f_venc);
    const i   = mIdx(mes);
    if(i < 0) return;
    if(!byAcreedor[c.acreedor]) byAcreedor[c.acreedor] = Z65();
    byAcreedor[c.acreedor][i] += Number(c.cuota)||0;
  });
  return byAcreedor;
}

// Retorna { acreedor: { mes: { semana: monto } } } para vista semanal exacta
function calcPrestamosDesgloseSemanasEmpresa(empresa, creditos=CREDITOS_DEFAULT) {
  const bySemana = {}; // { "Zelun": { "Nov-26": { "S47": 120000 } } }
  creditos.filter(c => c.empresa === empresa && !c.pagado).forEach(c => {
    if(!c.f_venc || !c.cuota) return;
    const { mes, sem } = semanaVencimientoEnMes(c.f_venc);
    const monto = Number(c.cuota)||0;
    if(!bySemana[c.acreedor]) bySemana[c.acreedor] = {};
    if(!bySemana[c.acreedor][mes]) bySemana[c.acreedor][mes] = {};
    bySemana[c.acreedor][mes][sem] = (bySemana[c.acreedor][mes][sem]||0) + monto;
  });
  return bySemana;
}

// ═══════════════════════════════════════════════════════════════════
// EMPRESAS ESTÁTICAS
// ═══════════════════════════════════════════════════════════════════
const EMPRESAS_STATIC = {
  'Mediterra': {
    emoji:'🏢', color:'#1d4ed8', saldo_ini:3601, desc:'Holding · Inversiones Mediterra SpA',
    sections:[
      { cat:'ing_op', label:'Ingresos Operacionales', signo:1, lines:[
        {label:'Cuentas por Cobrar', proy:Z65(),subLines:true},
        {label:'Fee Administración', proy:ext([80000,80000,80000,107500,107500,107500,107500,107500,107500,107500,107500,107500,107500,107500,107500,107500,107500,107500,107500,107500,107500,107500,107500].concat(Array(41).fill(107500)))},
      ]},
      { cat:'egr_var', label:'Egresos Operacionales', signo:-1, lines:[
        {label:'Costos Variables Operacionales', proy:Z65()},
      ]},
      { cat:'egr_fijo', label:'Costos Fijos / SG&A', signo:-1, lines:[
        {label:'Aguinaldo', proy:Z65()},
        {label:'Almuerzos', proy:ext(Array(65).fill(309))},
        {label:'Alojamiento', proy:ext(Array(65).fill(3090))},
        {label:'Arriendo Oficina', proy:Z65()},
        {label:'Arriendo Vehículos', proy:ext(Array(65).fill(5000))},
        {label:'Artículos De Aseo', proy:ext(Array(65).fill(300))},
        {label:'Artículos De Imprenta Y Librería', proy:Z65()},
        {label:'Asesorías', proy:Z65()},
        {label:'Asesorías Computacionales', proy:Z65()},
        {label:'Asesorías Contables', proy:ext(Array(65).fill(200))},
        {label:'Asesorías Corporativo', proy:Z65()},
        {label:'Combustibles', proy:ext(Array(65).fill(1545))},
        {label:'Contribuciones Bienes Raíces', proy:Z65()},
        {label:'Encomienda Y Correo Nacional', proy:Z65()},
        {label:'Encomienda Y Corresp. Internacional', proy:Z65()},
        {label:'Gasto Arriendo Dispensadores', proy:Z65()},
        {label:'Gastos Bancarios', proy:Z65()},
        {label:'Gastos Bodegaje Documentación', proy:Z65()},
        {label:'Gastos Computacionales', proy:ext(Array(65).fill(600))},
        {label:'Gastos De Colación Trabajadores', proy:Z65()},
        {label:'Gastos De Movilización, Tag Y Peajes', proy:ext(Array(65).fill(2060))},
        {label:'Gastos de Representación', proy:ext(Array(65).fill(206))},
        {label:'Gastos Legales', proy:ext(Array(65).fill(1000))},
        {label:'Gastos Varios', proy:ext(Array(65).fill(257.5))},
        {label:'Gastos Viajes Internacionales', proy:ext(Array(65).fill(9270))},
        {label:'Gastos Viajes Nacionales', proy:Z65()},
        {label:'Leyes Sociales', proy:ext(Array(65).fill(7210))},
        {label:'Mantención De Vehículos De Administración', proy:Z65()},
        {label:'Patentes Comerciales', proy:Z65()},
        {label:'Remuneración Administración', proy:ext([51500, 51500, 76500, 51500, 51500, 51500, 51500, 51500, 51500, 51500, 51500, 51500, 51500, 51500, 76500, 51500, 51500, 51500, 51500, 51500, 51500, 51500, 51500, 51500, 51500, 51500, 76500, 51500, 51500, 51500, 51500, 51500, 51500, 51500, 51500, 51500, 51500, 51500, 76500, 51500, 51500, 51500, 51500, 51500, 51500, 51500, 51500, 51500, 51500, 51500, 76500, 51500, 51500, 51500, 51500, 51500, 51500, 51500, 51500, 51500, 51500, 51500, 76500, 51500, 51500])},
        {label:'Seguro Complementario Salud', proy:ext(Array(65).fill(800))},
        {label:'Seguros', proy:Z65()},
        {label:'Teléfonos Celulares', proy:ext(Array(65).fill(154.5))},
        {label:'Vales De Colación', proy:ext(Array(65).fill(1081.5))},
        {label:'Viáticos', proy:Z65()},
        {label:'Víveres Consumo Oficina', proy:ext(Array(65).fill(200))},
      ]},
      { cat:'imp', label:'Impuestos', signo:-1, lines:[
        {label:'Impuestos Anuales', proy:Z65()},
        {label:'Impuestos Mensuales', proy:ext(Array(65).fill(26000))},
      ]},
      { cat:'ing_nop', label:'Ingresos No Operacionales', signo:1, lines:[
        {label:'Capital Calls', proy:Z65(), subLines:true},
        {label:'Ingreso Renovación', proy:calcIngresoRenovacionEmpresa('Mediterra'), formula:true, subLines:true},
        {label:'Ingresos Financiamiento', proy:Z65(), subLines:true},
        {label:'Otros Ingresos No Operacionales', proy:Z65()},
      ]},
      { cat:'egr_nop', label:'Egresos No Operacionales', signo:-1, lines:[
        {label:'Aportes de Capital', proy:Z65(), subLines:true},
        {label:'Leyes Sociales Laborales', proy:Z65()},
        {label:'Pago F-29', proy:Z65()},
        {label:'Pago Préstamos - Total', proy:calcPrestamosEmpresa('Mediterra'), formula:true, subLines:true},
        {label:'Renovaciones', proy:calcRenovacionesEmpresa('Mediterra'), formula:true, subLines:true},
      ]},
    ],
  },
  'Allegria Service': {
    emoji:'🏭', color:'#92400e', saldo_ini:5519, desc:'Procesamiento · Packing',
    sections:[
      { cat:'ing_op', label:'Ingresos Operacionales', signo:1, lines:[
        {label:'Cuentas por Cobrar', proy:Z65(),subLines:true},
        {label:'Proceso de Cerezas', proy:ext([0,0,0,0,0,0,0,0,240000,240000,0,1048000,0,0,240000,240000,0,1048000,0,0,240000,240000,0].concat(Array(41).fill(0)))},
        {label:'Procesos de Ciruelas', proy:Z65()},
      ]},
      { cat:'egr_var', label:'Egresos Operacionales', signo:-1, lines:[
        {label:'Arriendo de Bins', proy:Z65()},
        {label:'Arriendo De Maquinaria Variable', proy:ext([0, 0, 0, 0, 0, 0, 667, 889, 889, 889, 889, 0, 0, 0, 0, 0, 0, 0, 667, 889, 889, 889, 889, 0, 0, 0, 0, 0, 0, 0, 667, 889, 889, 889, 889, 0, 0, 0, 0, 0, 0, 0, 667, 889, 889, 889, 889, 0, 0, 0, 0, 0, 0, 0, 667, 889, 889, 889, 889, 0, 0, 0, 0, 0])},
        {label:'Arriendo Materiales', proy:ext([0, 0, 0, 0, 0, 0, 0, 255, 5169, 10326, 6323, 2363, 0, 0, 0, 0, 0, 0, 0, 255, 5169, 10326, 6323, 2363, 0, 0, 0, 0, 0, 0, 0, 255, 5169, 10326, 6323, 2363, 0, 0, 0, 0, 0, 0, 0, 255, 5169, 10326, 6323, 2363, 0, 0, 0, 0, 0, 0, 0, 255, 5169, 10326, 6323, 2363, 0, 0, 0, 0])},
        {label:'Costo Cereza Fresca Para Exportación', proy:Z65()},
        {label:'Costo Cerezas Frescas Nacional', proy:Z65()},
        {label:'Costo De Materiales', proy:ext([0, 0, 0, 0, 0, 0, 3333, 0, 444, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3333, 0, 444, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3333, 0, 444, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3333, 0, 444, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3333, 0, 444, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Costo Venta Materiales', proy:Z65()},
        {label:'Flete de Bins', proy:Z65()},
        {label:'Flete Nacional', proy:ext([0, 0, 0, 0, 0, 0, 0, 1133, 3400, 1889, 4722, 1700, 0, 0, 0, 0, 0, 0, 0, 1133, 3400, 1889, 4722, 1700, 0, 0, 0, 0, 0, 0, 0, 1133, 3400, 1889, 4722, 1700, 0, 0, 0, 0, 0, 0, 0, 1133, 3400, 1889, 4722, 1700, 0, 0, 0, 0, 0, 0, 0, 1133, 3400, 1889, 4722, 1700, 0, 0, 0, 0])},
        {label:'Flete Nacional Cerezas', proy:Z65()},
        {label:'Flete Tote', proy:Z65()},
        {label:'Gastos Notariales Y Legales', proy:Z65()},
        {label:'Lavado Totem', proy:Z65()},
        {label:'Mantención Elifab', proy:Z65()},
        {label:'Mantención Kolfmet', proy:Z65()},
        {label:'Mantenciones Variable', proy:Z65()},
        {label:'Mantencion Linea De Proceso', proy:ext([0, 0, 0, 31633, 111, 1333, 2556, 0, 0, 0, 0, 1672, 0, 0, 0, 31633, 111, 1333, 2556, 0, 0, 0, 0, 1672, 0, 0, 0, 31633, 111, 1333, 2556, 0, 0, 0, 0, 1672, 0, 0, 0, 31633, 111, 1333, 2556, 0, 0, 0, 0, 1672, 0, 0, 0, 31633, 111, 1333, 2556, 0, 0, 0, 0, 1672, 0, 0, 0, 0])},
        {label:'Movimiento Línea ELIFAB', proy:Z65()},
        {label:'Proceso Seleccion Variable', proy:Z65()},
        {label:'Proveedores Materiales', proy:Z65()},
        {label:'Proveedores Servicios', proy:Z65()},
        {label:'Proveedores Varios', proy:Z65()},
        {label:'Repuestos Líneas', proy:Z65()},
        {label:'Seguro Robo E Incendio Variable', proy:Z65()},
        {label:'Servicio Armado De Cajas', proy:Z65()},
        {label:'Servicio Fruit Service', proy:Z65()},
        {label:'Servicio Lavado Tote', proy:ext([0, 0, 0, 0, 0, 0, 0, 0, 0, 23611, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 23611, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 23611, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 23611, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 23611, 0, 0, 0, 0, 0, 0])},
        {label:'Servicios Externos Contratados Variable', proy:Z65()},
        {label:'Servicios Packing Cereza', proy:Z65()},
      ]},
      { cat:'egr_fijo', label:'Costos Fijos / SG&A', signo:-1, lines:[
        {label:'Aguinaldo', proy:ext([0,0,0,0,0,1000,0,0,1000,0,0,0,0,0,0,0,0,1000,0,0,1000,0,0,0,0,0,0,0,0,1000,0,0,1000,0,0,0,0,0,0,0,0,1000,0,0,1000,0,0,0,0,0,0,0,0,1000,0,0,1000,0,0,0,0,0,0,0,0])},
        {label:'Arriendo Camionetas', proy:ext(Array(65).fill(1500))},
        {label:'Arriendo Oficina', proy:Z65()},
        {label:'Artículos De Aseo', proy:ext(Array(65).fill(100))},
        {label:'Artículos De Imprenta Y Librería', proy:ext(Array(65).fill(200))},
        {label:'Asesorías', proy:Z65()},
        {label:'Asesorías Computacionales', proy:ext(Array(65).fill(1187.5))},
        {label:'Asesorías Contables', proy:Z65()},
        {label:'Asesorías Corporaciones', proy:Z65()},
        {label:'Asesorías Jurídico Legales', proy:ext([0,0,0,0,0,0,1500,1500,1500,0,0,0,0,0,0,0,0,0,1500,1500,1500,0,0,0,0,0,0,0,0,0,1500,1500,1500,0,0,0,0,0,0,0,0,0,1500,1500,1500,0,0,0,0,0,0,0,0,0,1500,1500,1500,0,0,0,0,0,0,0,0])},
        {label:'Colación', proy:ext(Array(65).fill(500))},
        {label:'Combustibles', proy:ext(Array(65).fill(1000))},
        {label:'Contribuciones Bienes Raíces', proy:Z65()},
        {label:'Encomienda Y Correo Nacional', proy:Z65()},
        {label:'Encomienda Y Corresp. Internacional', proy:Z65()},
        {label:'Energía Eléctrica', proy:Z65()},
        {label:'Fee Administración', proy:ext([180000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 180000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 180000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 180000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 180000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 180000, 0, 0, 0])},
        {label:'Gasto Arriendo Dispensadores', proy:Z65()},
        {label:'Gasto Implementación Factura Electrónica', proy:ext(Array(65).fill(120))},
        {label:'Gastos Bancarios', proy:ext(Array(65).fill(200))},
        {label:'Gastos Bodegaje Documentación', proy:Z65()},
        {label:'Gastos Computacionales', proy:ext(Array(65).fill(625))},
        {label:'Gastos Comunes', proy:Z65()},
        {label:'Gastos De Alojamiento', proy:Z65()},
        {label:'Gastos De Colación Trabajadores', proy:ext(Array(65).fill(800))},
        {label:'Gastos De Movilización, Tag Y Peajes', proy:ext(Array(65).fill(500))},
        {label:'Gastos De Pasajes Viajes Internacionales', proy:Z65()},
        {label:'Gastos De Pasajes Viajes Nacionales', proy:Z65()},
        {label:'Gastos De Representación Almuerzos', proy:Z65()},
        {label:'Gastos De Viajes', proy:Z65()},
        {label:'Gastos Representación Varios', proy:ext(Array(65).fill(250))},
        {label:'Gastos Seguros', proy:Z65()},
        {label:'Gastos Varios', proy:ext(Array(65).fill(700))},
        {label:'Leyes Sociales', proy:ext(Array(65).fill(3600))},
        {label:'Mantención De Vehículos De Administración', proy:Z65()},
        {label:'Patentes Municipales', proy:ext([0,0,0,0,0,0,0,0,0,1500,0,0,0,0,0,0,0,0,0,0,0,1500,0,0,0,0,0,0,0,0,0,0,0,1500,0,0,0,0,0,0,0,0,0,0,0,1500,0,0,0,0,0,0,0,0,0,0,0,1500,0,0,0,0,0,0,0])},
        {label:'Remuneración', proy:ext([13000, 13000, 13000, 17316, 12982, 12982, 14860, 14860, 14860, 12694, 12694, 10816, 10816, 12982, 32303, 17316, 12982, 12982, 14860, 14860, 14860, 12694, 12694, 10816, 10816, 12982, 32303, 17316, 12982, 12982, 14860, 14860, 14860, 12694, 12694, 10816, 10816, 12982, 32303, 17316, 12982, 12982, 14860, 14860, 14860, 12694, 12694, 10816, 10816, 12982, 32303, 17316, 12982, 12982, 14860, 14860, 14860, 12694, 12694, 10816, 10816, 12982, 32303, 32303])},
        {label:'Ropa de Trabajo', proy:ext(Array(65).fill(500))},
        {label:'Seguro Complementario Salud', proy:ext(Array(65).fill(800))},
        {label:'Teléfonos Celulares', proy:Z65()},
        {label:'Vacaciones', proy:Z65()},
        {label:'Víveres Consumo Oficina', proy:ext(Array(65).fill(250))},
      ]},
      { cat:'imp', label:'Impuestos', signo:-1, lines:[
        {label:'Impuestos Anuales', proy:Z65()},
        {label:'Impuestos Mensuales', proy:ext([12651, 12651, 12651, 12651, 12651, 12651, 12651, 12651, 12651, 12651, 12651, 12651, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])},
      ]},
      { cat:'ing_nop', label:'Ingresos No Operacionales', signo:1, lines:[
        {label:'Capital Calls', proy:Z65(), subLines:true},
        {label:'Ingreso Renovación', proy:calcIngresoRenovacionEmpresa('Allegria Service'), formula:true, subLines:true},
        {label:'Ingresos Financiamiento', proy:Z65(), subLines:true},
        {label:'Otros Ingresos No Operacionales', proy:Z65()},
      ]},
      { cat:'egr_nop', label:'Egresos No Operacionales', signo:-1, lines:[
        {label:'Aportes de Capital', proy:Z65(), subLines:true},
        {label:'Leyes Sociales Laborales', proy:Z65()},
        {label:'Otros Egresos No Operacionales', proy:Z65()},
        {label:'Pago Préstamos - Total', proy:calcPrestamosEmpresa('Allegria Service'), formula:true, subLines:true},
        {label:'Renovaciones', proy:calcRenovacionesEmpresa('Allegria Service'), formula:true, subLines:true},
      ]},
    ],
  },
  'Frisku Foods': {
    emoji:'🚢', color:'#0e7490', saldo_ini:132828, desc:'Carga contenedores · Logística',
    sections:[
      { cat:'ing_op', label:'Ingresos Operacionales', signo:1, lines:[
        {label:'Cuentas por Cobrar', proy:Z65(),subLines:true},
        {label:'Ingreso Carga Contenedores', proy:ext([0, 0, 0, 34139, 61403, 34565, 39710, 138006, 160464, 167347, 226552, 344965, 123438, 34535, 13066, 37990, 68329, 38464, 44189, 153572, 178563, 186223, 252106, 383875, 137361, 38430, 14540, 41840, 75255, 42362, 48668, 169139, 196663, 205099, 277660, 422785, 151284, 42326, 16014, 45691, 82181, 46261, 53147, 184705, 214762, 223975, 303214, 461696, 165207, 46221, 17487, 49542, 89107, 50160, 57626, 200271, 232862, 242850, 328767, 500606, 179131, 50116, 18961, 0])},
        {label:'Otros Ingresos', proy:Z65()},
      ]},
      { cat:'egr_var', label:'Egresos Operacionales', signo:-1, lines:[
        {label:'Costo Directo Variable', proy:Z65()},
        {label:'Proveedores Servicios', proy:Z65()},
        {label:'Proveedores Varios', proy:Z65()},
      ]},
      { cat:'egr_fijo', label:'Costos Fijos / SG&A', signo:-1, lines:[
        {label:"Remuneración Administración", proy:ext([11876, 11876, 11876, 11876, 11924, 12315, 11152, 12286, 15568, 15635, 15773, 15819, 15819, 15819, 45042, 12232, 12282, 12684, 11487, 12655, 16035, 16104, 16246, 16294, 16294, 16294, 46393, 12599, 12650, 13065, 11831, 13034, 16516, 16587, 16734, 16782, 16782, 16782, 47785, 12977, 13030, 13457, 12186, 13425, 17012, 17085, 17236, 17286, 17286, 17286, 49219, 13367, 13421, 13861, 12552, 13828, 17522, 17597, 17753, 17804, 17804, 17804, 50695, 0])},
        {label:"Gastos De Representación", proy:ext([41, 41, 41, 41, 57, 125, 804, 729, 813, 196, 1130, 500, 500, 500, 500, 42, 59, 129, 828, 751, 837, 202, 1164, 515, 515, 515, 515, 43, 60, 133, 853, 773, 863, 208, 1199, 530, 530, 530, 530, 45, 62, 137, 879, 797, 888, 214, 1235, 546, 546, 546, 546, 46, 64, 141, 905, 820, 915, 221, 1272, 563, 563, 563, 563, 0])},
        {label:"Artículos E Insumos De Oficina", proy:ext([19, 19, 19, 19, 23, 19, 19, 24, 20, 25, 47, 47, 47, 47, 47, 20, 24, 20, 20, 25, 21, 26, 48, 48, 48, 48, 48, 20, 24, 20, 20, 25, 21, 27, 50, 50, 50, 50, 50, 21, 25, 21, 21, 26, 22, 27, 51, 51, 51, 51, 51, 21, 26, 21, 21, 27, 23, 28, 53, 53, 53, 53, 53, 0])},
        {label:"Mantención De Vehículos", proy:ext([0, 0, 0, 0, 0, 500, 0, 0, 0, 0, 0, 0, 500, 0, 0, 0, 0, 515, 0, 0, 0, 0, 0, 0, 515, 0, 0, 0, 0, 530, 0, 0, 0, 0, 0, 0, 530, 0, 0, 0, 0, 546, 0, 0, 0, 0, 0, 0, 546, 0, 0, 0, 0, 563, 0, 0, 0, 0, 0, 0, 563, 0, 0, 0])},
        {label:"Arriendo Oficinas", proy:ext([2231, 2231, 2231, 2231, 2178, 2204, 2211, 2255, 2293, 1928, 2544, 2544, 2544, 2544, 2544, 2298, 2243, 2270, 2277, 2323, 2362, 1986, 2620, 2620, 2620, 2620, 2620, 2367, 2311, 2338, 2346, 2392, 2433, 2045, 2699, 2699, 2699, 2699, 2699, 2438, 2380, 2408, 2416, 2464, 2506, 2107, 2780, 2780, 2780, 2780, 2780, 2511, 2451, 2481, 2488, 2538, 2581, 2170, 2863, 2863, 2863, 2863, 2863, 0])},
        {label:"Arriendo Estacionamientos", proy:ext([126, 126, 126, 126, 121, 123, 123, 126, 128, 132, 138, 150, 150, 150, 150, 130, 125, 127, 127, 130, 132, 136, 142, 155, 155, 155, 155, 134, 128, 130, 130, 134, 136, 140, 146, 159, 159, 159, 159, 138, 132, 134, 134, 138, 140, 144, 151, 164, 164, 164, 164, 142, 136, 138, 138, 142, 144, 149, 155, 169, 169, 169, 169, 0])},
        {label:"Gastos Comunes", proy:ext([522, 522, 522, 522, 493, 537, 532, 601, 773, 989, 790, 800, 800, 800, 800, 538, 508, 553, 548, 619, 796, 1019, 814, 824, 824, 824, 824, 554, 523, 570, 564, 638, 820, 1049, 838, 849, 849, 849, 849, 570, 539, 587, 581, 657, 845, 1081, 863, 874, 874, 874, 874, 588, 555, 604, 599, 676, 870, 1113, 889, 900, 900, 900, 900, 0])},
        {label:"Arriendo De Vehículos", proy:ext([331, 331, 331, 331, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 341, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 351, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 362, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 373, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])},
        {label:"Asesoría Legal", proy:ext([1808, 1808, 1808, 1808, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1862, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1918, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1976, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2035, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])},
        {label:"Otras Asesorías", proy:ext([28500, 28500, 28500, 28500, 13000, 8000, 10000, 20000, 8582, 10000, 10000, 12000, 12000, 12000, 12000, 29355, 13390, 8240, 10300, 20600, 8839, 10300, 10300, 12360, 12360, 12360, 12360, 30236, 13792, 8487, 10609, 21218, 9105, 10609, 10609, 12731, 12731, 12731, 12731, 31143, 14205, 8742, 10927, 21855, 9378, 10927, 10927, 13113, 13113, 13113, 13113, 32077, 14632, 9004, 11255, 22510, 9659, 11255, 11255, 13506, 13506, 13506, 13506, 0])},
        {label:"Gastos Notariales", proy:ext([0, 0, 0, 0, 0, 0, 632, 0, 0, 0, 0, 0, 0, 0, 500, 0, 0, 0, 651, 0, 0, 0, 0, 0, 0, 0, 515, 0, 0, 0, 670, 0, 0, 0, 0, 0, 0, 0, 530, 0, 0, 0, 691, 0, 0, 0, 0, 0, 0, 0, 546, 0, 0, 0, 711, 0, 0, 0, 0, 0, 0, 0, 563, 0])},
        {label:"Asesoría De Terceros", proy:ext([0, 0, 0, 0, 0, 0, 0, 0, 0, 9980, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10279, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10588, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10905, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 11233, 0, 0, 0, 0, 0, 0])},
        {label:"Viáticos Interno Exterior", proy:ext([150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 155, 155, 155, 155, 155, 155, 155, 155, 155, 155, 155, 155, 159, 159, 159, 159, 159, 159, 159, 159, 159, 159, 159, 159, 164, 164, 164, 164, 164, 164, 164, 164, 164, 164, 164, 164, 169, 169, 169, 169, 169, 169, 169, 169, 169, 169, 169, 169, 0])},
        {label:"Gasto Alojamiento Viaje", proy:ext([0, 0, 0, 0, 450, 2800, 6000, 450, 0, 0, 1800, 450, 450, 0, 2950, 0, 464, 2884, 6180, 464, 0, 0, 1854, 464, 464, 0, 3039, 0, 477, 2971, 6365, 477, 0, 0, 1910, 477, 477, 0, 3130, 0, 492, 3060, 6556, 492, 0, 0, 1967, 492, 492, 0, 3224, 0, 506, 3151, 6753, 506, 0, 0, 2026, 506, 506, 0, 3320, 0])},
        {label:"Tag Peaje", proy:ext([88, 88, 88, 88, 118, 44, 96, 119, 315, 79, 110, 110, 110, 110, 110, 91, 122, 45, 99, 123, 324, 81, 113, 113, 113, 113, 113, 93, 125, 47, 102, 126, 334, 84, 117, 117, 117, 117, 117, 96, 129, 48, 105, 130, 344, 86, 120, 120, 120, 120, 120, 99, 133, 50, 108, 134, 355, 89, 124, 124, 124, 124, 124, 0])},
        {label:"Combustibles Y Lubricantes", proy:ext([413, 413, 413, 413, 382, 141, 176, 468, 222, 249, 281, 350, 350, 350, 350, 425, 393, 145, 181, 482, 229, 256, 289, 361, 361, 361, 361, 438, 405, 150, 187, 497, 236, 264, 298, 371, 371, 371, 371, 451, 417, 154, 192, 511, 243, 272, 307, 382, 382, 382, 382, 465, 430, 159, 198, 527, 250, 280, 316, 394, 394, 394, 394, 0])},
        {label:"Gasto Internet Sist Informáticos", proy:ext([1050, 1050, 1050, 1050, 1044, 969, 979, 1000, 1028, 1047, 1103, 1403, 1103, 1103, 1103, 1082, 1075, 998, 1008, 1030, 1059, 1078, 1136, 1445, 1136, 1136, 1136, 1114, 1108, 1028, 1039, 1061, 1091, 1111, 1170, 1488, 1170, 1170, 1170, 1147, 1141, 1059, 1070, 1093, 1123, 1144, 1205, 1533, 1205, 1205, 1205, 1182, 1175, 1091, 1102, 1126, 1157, 1178, 1241, 1579, 1241, 1241, 1241, 0])},
        {label:"Telefonía Celular", proy:ext([208, 208, 208, 208, 115, 133, 134, 129, 176, 114, 154, 154, 154, 154, 154, 214, 118, 137, 138, 133, 181, 117, 159, 159, 159, 159, 159, 221, 122, 141, 142, 137, 187, 121, 163, 163, 163, 163, 163, 227, 126, 145, 146, 141, 192, 125, 168, 168, 168, 168, 168, 234, 129, 150, 151, 145, 198, 128, 173, 173, 173, 173, 173, 0])},
        {label:"Electricidad", proy:ext([47, 47, 47, 47, 51, 52, 51, 45, 54, 55, 55, 65, 65, 65, 65, 48, 53, 54, 53, 46, 56, 57, 57, 67, 67, 67, 67, 50, 54, 55, 54, 48, 57, 58, 58, 69, 69, 69, 69, 51, 56, 57, 56, 49, 59, 60, 60, 71, 71, 71, 71, 53, 57, 59, 57, 51, 61, 62, 62, 73, 73, 73, 73, 0])},
        {label:"Fee Administración", proy:ext([21471, 21471, 21471, 21471, 22335, 22030, 22102, 22518, 273218, -225674, 24003, 25000, 25000, 25000, 25000, 22115, 23005, 22691, 22765, 23194, 281415, -232444, 24723, 25750, 25750, 25750, 25750, 22779, 23695, 23372, 23448, 23889, 289857, -239418, 25465, 26523, 26523, 26523, 26523, 23462, 24406, 24073, 24151, 24606, 298553, -246600, 26229, 27318, 27318, 27318, 27318, 24166, 25138, 24795, 24876, 25344, 307509, -253998, 27016, 28138, 28138, 28138, 28138, 0])},
        {label:"Gastos Pasajes Nacionales", proy:ext([85, 85, 85, 85, 0, 65, 390, 0, 43, 0, 0, 80, 80, 80, 80, 88, 0, 67, 402, 0, 44, 0, 0, 82, 82, 82, 82, 90, 0, 69, 414, 0, 46, 0, 0, 85, 85, 85, 85, 93, 0, 71, 426, 0, 47, 0, 0, 87, 87, 87, 87, 96, 0, 73, 439, 0, 48, 0, 0, 90, 90, 90, 90, 0])},
        {label:"Gastos Pasajes Internacionales", proy:ext([17000, 17000, 17000, 17000, 13550, 0, 0, 750, 6800, 0, 0, 750, 750, 7400, 750, 17510, 13957, 0, 0, 773, 7004, 0, 0, 773, 773, 7622, 773, 18035, 14375, 0, 0, 796, 7214, 0, 0, 796, 796, 7851, 796, 18576, 14806, 0, 0, 820, 7431, 0, 0, 820, 820, 8086, 820, 19134, 15251, 0, 0, 844, 7653, 0, 0, 844, 844, 8329, 844, 0])},
        {label:"Cafetería", proy:ext([550, 550, 550, 550, 6, 244, 246, 38, 290, 40, 101, 100, 100, 100, 100, 567, 6, 251, 253, 39, 299, 41, 104, 103, 103, 103, 103, 583, 6, 259, 261, 40, 308, 42, 107, 106, 106, 106, 106, 601, 7, 267, 269, 42, 317, 44, 110, 109, 109, 109, 109, 619, 7, 275, 277, 43, 326, 45, 114, 113, 113, 113, 113, 0])},
        {label:"Estacionamiento", proy:ext([20, 20, 20, 20, 0, 0, 35, 0, 4, 58, 0, 58, 58, 58, 58, 21, 0, 0, 36, 0, 4, 60, 0, 60, 60, 60, 60, 21, 0, 0, 37, 0, 4, 62, 0, 62, 62, 62, 62, 22, 0, 0, 38, 0, 4, 63, 0, 63, 63, 63, 63, 23, 0, 0, 39, 0, 5, 65, 0, 65, 65, 65, 65, 0])},
        {label:"Gastos Generales", proy:ext([200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 206, 206, 206, 206, 206, 206, 206, 206, 206, 206, 206, 206, 212, 212, 212, 212, 212, 212, 212, 212, 212, 212, 212, 212, 219, 219, 219, 219, 219, 219, 219, 219, 219, 219, 219, 219, 225, 225, 225, 225, 225, 225, 225, 225, 225, 225, 225, 225, 0])},
        {label:"Patentes", proy:ext([101, 101, 101, 101, 0, 0, 0, 0, 0, 115, 0, 889, 0, 0, 0, 104, 0, 0, 0, 0, 0, 118, 0, 916, 0, 0, 0, 107, 0, 0, 0, 0, 0, 122, 0, 943, 0, 0, 0, 110, 0, 0, 0, 0, 0, 126, 0, 971, 0, 0, 0, 114, 0, 0, 0, 0, 0, 129, 0, 1001, 0, 0, 0, 0])},
      ]},
      { cat:'imp', label:'Impuestos', signo:-1, lines:[
        {label:'Impuestos Anuales', proy:Z65()},
        {label:'Impuestos Mensuales', proy:ext(Array(65).fill(6375))},
      ]},
      { cat:'ing_nop', label:'Ingresos No Operacionales', signo:1, lines:[
        {label:'Capital Calls', proy:Z65(), subLines:true},
        {label:'Ingreso Renovación', proy:calcIngresoRenovacionEmpresa('Frisku Foods'), formula:true, subLines:true},
        {label:'Ingresos Financiamiento', proy:Z65(), subLines:true},
        {label:'Otros Ingresos No Operacionales', proy:Z65()},
      ]},
      { cat:'egr_nop', label:'Egresos No Operacionales', signo:-1, lines:[
        {label:'Aportes de Capital', proy:Z65(), subLines:true},
        {label:'Leyes Sociales Laborales', proy:Z65()},
        {label:'Otros Egresos No Operacionales', proy:Z65()},
        {label:'Pago Préstamos - Total', proy:calcPrestamosEmpresa('Frisku Foods'), formula:true, subLines:true},
        {label:'Renovaciones', proy:calcRenovacionesEmpresa('Frisku Foods'), formula:true, subLines:true},
      ]},
    ],
  },
  'Allpa Farms': {
    emoji:'🌸', color:'#dc2626', saldo_ini:1828, desc:'Farming cerezas · Chile',
    sections:[
      { cat:'ing_op', label:'Ingresos Operacionales', signo:1, lines:[
        {label:'Cuentas por Cobrar', proy:Z65(),subLines:true},
        {label:'Ingreso Cerezas Nacionales', proy:Z65()},
        {label:'Ingreso Exportación Cerezas', proy:ext([0,0,0,0,0,0,0,152312,304624,0,0,913872,0,0,152312,304624,0,913872,0,0,152312,304624,0].concat(Array(41).fill(0)))},
        {label:'Otros Ingresos', proy:Z65()},
      ]},
      { cat:'egr_var', label:'Egresos Operacionales', signo:-1, lines:[
        {label:'Acaricidas (ABC)', proy:Z65()},
        {label:'Aporte Patronal Y Seguro', proy:Z65()},
        {label:'Arriendo 2da Camioneta', proy:ext([400, 400, 0, 0, 0, 400, 400, 400, 400, 0, 0, 0, 0, 0, 0, 0, 0, 400, 400, 400, 400, 0, 0, 0, 0, 0, 0, 0, 0, 400, 400, 400, 400, 0, 0, 0, 0, 0, 0, 0, 0, 400, 400, 400, 400, 0, 0, 0, 0, 0, 0, 0, 0, 400, 400, 400, 400, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Arriendo de Equipos', proy:Z65()},
        {label:'Arriendo de Maquinaria', proy:Z65()},
        {label:'Arriendo de Vehículos', proy:Z65()},
        {label:'Arriendo Maquinarias', proy:ext([1777.78, 0, 0, 0, 0, 0, 2000, 0, 2555.56, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2000, 0, 2555.56, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2000, 0, 2555.56, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2000, 0, 2555.56, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2000, 0, 2555.56, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Arriendo Reefer (Friocosecha)', proy:ext([0, 0, 0, 0, 0, 0, 1333.33, 1333.33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1333.33, 1333.33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1333.33, 1333.33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1333.33, 1333.33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1333.33, 1333.33, 0, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Baños Químicos', proy:ext([133.33, 133.33, 133.33, 133.33, 133.33, 133.33, 888.89, 888.89, 133.33, 0, 0, 0, 0, 0, 0, 133.33, 133.33, 133.33, 888.89, 888.89, 133.33, 0, 0, 0, 0, 0, 0, 133.33, 133.33, 133.33, 888.89, 888.89, 133.33, 0, 0, 0, 0, 0, 0, 133.33, 133.33, 133.33, 888.89, 888.89, 133.33, 0, 0, 0, 0, 0, 0, 133.33, 133.33, 133.33, 888.89, 888.89, 133.33, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Casino - Colaciones', proy:ext([222.22, 222.22, 0, 0, 0, 222.22, 222.22, 1777.78, 222.22, 0, 0, 0, 0, 0, 0, 0, 0, 222.22, 222.22, 1777.78, 222.22, 0, 0, 0, 0, 0, 0, 0, 0, 222.22, 222.22, 1777.78, 222.22, 0, 0, 0, 0, 0, 0, 0, 0, 222.22, 222.22, 1777.78, 222.22, 0, 0, 0, 0, 0, 0, 0, 0, 222.22, 222.22, 1777.78, 222.22, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Combustibles y Lubricantes', proy:Z65()},
        {label:'Combustibles Y Lubricantes', proy:ext([55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56])},
        {label:'Contratista Cosecha', proy:Z65()},
        {label:'Control De Malezas', proy:Z65()},
        {label:'Electricidad', proy:ext([5200, 5200, 5200, 5200, 5200, 5200, 8900, 8900, 8900, 8900, 8900, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 8900, 8900, 8900, 8900, 8900, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 8900, 8900, 8900, 8900, 8900, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 8900, 8900, 8900, 8900, 8900, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 8900, 8900, 8900, 8900, 8900, 5200, 5200, 5200, 5200, 5200])},
        {label:'Electricidad Casa Cuidador', proy:ext([55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56])},
        {label:'Electricidad Riego', proy:ext([888.89, 888.89, 888.89, 888.89, 888.89, 1555.56, 4444.44, 6666.67, 6666.67, 0, 0, 0, 0, 0, 0, 888.89, 888.89, 1555.56, 4444.44, 6666.67, 6666.67, 0, 0, 0, 0, 0, 0, 888.89, 888.89, 1555.56, 4444.44, 6666.67, 6666.67, 0, 0, 0, 0, 0, 0, 888.89, 888.89, 1555.56, 4444.44, 6666.67, 6666.67, 0, 0, 0, 0, 0, 0, 888.89, 888.89, 1555.56, 4444.44, 6666.67, 6666.67, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Ferretería', proy:Z65()},
        {label:'Fertilizantes Y Fitorreguladores (ABC)', proy:ext([5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200, 5200])},
        {label:'Flete Nacional', proy:Z65()},
        {label:'Fletes De Maquinarias', proy:ext([66.67, 0, 0, 0, 0, 0, 444.44, 0, 66.67, 0, 0, 0, 0, 0, 0, 0, 0, 0, 444.44, 0, 66.67, 0, 0, 0, 0, 0, 0, 0, 0, 0, 444.44, 0, 66.67, 0, 0, 0, 0, 0, 0, 0, 0, 0, 444.44, 0, 66.67, 0, 0, 0, 0, 0, 0, 0, 0, 0, 444.44, 0, 66.67, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Fletes De Materiales Y Fruta', proy:ext([0, 0, 0, 0, 0, 0, 6222.22, 5333.33, 444.44, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6222.22, 5333.33, 444.44, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6222.22, 5333.33, 444.44, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6222.22, 5333.33, 444.44, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6222.22, 5333.33, 444.44, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Fungicidas (ABC)', proy:ext([2444.44, 5777.78, 0, 5777.78, 2666.67, 6888.89, 7333.33, 2444.44, 4888.89, 0, 0, 0, 0, 0, 0, 5777.78, 2666.67, 6888.89, 7333.33, 2444.44, 4888.89, 0, 0, 0, 0, 0, 0, 5777.78, 2666.67, 6888.89, 7333.33, 2444.44, 4888.89, 0, 0, 0, 0, 0, 0, 5777.78, 2666.67, 6888.89, 7333.33, 2444.44, 4888.89, 0, 0, 0, 0, 0, 0, 5777.78, 2666.67, 6888.89, 7333.33, 2444.44, 4888.89, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Gas', proy:ext([0, 33.33, 0, 33.33, 0, 33.33, 0, 33.33, 0, 0, 0, 0, 0, 0, 0, 33.33, 0, 33.33, 0, 33.33, 0, 0, 0, 0, 0, 0, 0, 33.33, 0, 33.33, 0, 33.33, 0, 0, 0, 0, 0, 0, 0, 33.33, 0, 33.33, 0, 33.33, 0, 0, 0, 0, 0, 0, 0, 33.33, 0, 33.33, 0, 33.33, 0, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Gasolina 93 Oct', proy:ext([0, 55.56, 0, 55.56, 0, 55.56, 111.11, 111.11, 111.11, 0, 0, 0, 0, 0, 0, 55.56, 0, 55.56, 111.11, 111.11, 111.11, 0, 0, 0, 0, 0, 0, 55.56, 0, 55.56, 111.11, 111.11, 111.11, 0, 0, 0, 0, 0, 0, 55.56, 0, 55.56, 111.11, 111.11, 111.11, 0, 0, 0, 0, 0, 0, 55.56, 0, 55.56, 111.11, 111.11, 111.11, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Gastos Apícolas Y Polinización', proy:ext([0, 0, 0, 0, 0, 9333.33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9333.33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9333.33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9333.33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9333.33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Gastos De Aseo', proy:ext([322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22, 322.22])},
        {label:'Gastos De Vehículos', proy:Z65()},
        {label:'Gratificaciones', proy:ext([1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56, 1805.56])},
        {label:'Herbicidas (ABC)', proy:ext([2000, 0, 3222.22, 0, 2000, 0, 0, 2555.56, 0, 0, 0, 0, 0, 0, 0, 0, 2000, 0, 0, 2555.56, 0, 0, 0, 0, 0, 0, 0, 0, 2000, 0, 0, 2555.56, 0, 0, 0, 0, 0, 0, 0, 0, 2000, 0, 0, 2555.56, 0, 0, 0, 0, 0, 0, 0, 0, 2000, 0, 0, 2555.56, 0, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Herramientas Menores', proy:ext([33.33, 33.33, 33.33, 33.33, 33.33, 33.33, 33.33, 444.44, 33.33, 0, 0, 0, 0, 0, 0, 33.33, 33.33, 33.33, 33.33, 444.44, 33.33, 0, 0, 0, 0, 0, 0, 33.33, 33.33, 33.33, 33.33, 444.44, 33.33, 0, 0, 0, 0, 0, 0, 33.33, 33.33, 33.33, 33.33, 444.44, 33.33, 0, 0, 0, 0, 0, 0, 33.33, 33.33, 33.33, 33.33, 444.44, 33.33, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Horas Extras', proy:ext([0, 0, 0, 0, 722.22, 866.67, 1083.33, 1083.33, 722.22, 0, 0, 0, 0, 0, 0, 0, 722.22, 866.67, 1083.33, 1083.33, 722.22, 0, 0, 0, 0, 0, 0, 0, 722.22, 866.67, 1083.33, 1083.33, 722.22, 0, 0, 0, 0, 0, 0, 0, 722.22, 866.67, 1083.33, 1083.33, 722.22, 0, 0, 0, 0, 0, 0, 0, 722.22, 866.67, 1083.33, 1083.33, 722.22, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Incisiones De Repaso Huerto C', proy:ext([0, 0, 0, 0, 0, 5000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Indemnizaciones Finiquitos', proy:ext([0.0, 2500.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0])},
        {label:'Insecticidas (ABC)', proy:ext([0, 0, 0, 0, 3555.56, 0, 0, 7111.11, 0, 0, 0, 0, 0, 0, 0, 0, 3555.56, 0, 0, 7111.11, 0, 0, 0, 0, 0, 0, 0, 0, 3555.56, 0, 0, 7111.11, 0, 0, 0, 0, 0, 0, 0, 0, 3555.56, 0, 0, 7111.11, 0, 0, 0, 0, 0, 0, 0, 0, 3555.56, 0, 0, 7111.11, 0, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Insumos De Riego', proy:ext([0, 0, 0, 0, 0, 0, 111.11, 111.11, 111.11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 111.11, 111.11, 111.11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 111.11, 111.11, 111.11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 111.11, 111.11, 111.11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 111.11, 111.11, 111.11, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Insumos Ortopedia (Cinta Y Mondadientes)', proy:Z65()},
        {label:'Labores De Riego Y Fertirriego (A, B y C)', proy:ext([1000, 0, 0, 0, 0, 0, 1111.11, 1111.11, 1111.11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1111.11, 1111.11, 1111.11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1111.11, 1111.11, 1111.11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1111.11, 1111.11, 1111.11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1111.11, 1111.11, 1111.11, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Labores Generales Del Fundo', proy:ext([4222.22, 4222.22, 0, 0, 0, 4222.22, 4222.22, 4222.22, 4222.22, 0, 0, 0, 0, 0, 0, 0, 0, 4222.22, 4222.22, 4222.22, 4222.22, 0, 0, 0, 0, 0, 0, 0, 0, 4222.22, 4222.22, 4222.22, 4222.22, 0, 0, 0, 0, 0, 0, 0, 0, 4222.22, 4222.22, 4222.22, 4222.22, 0, 0, 0, 0, 0, 0, 0, 0, 4222.22, 4222.22, 4222.22, 4222.22, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Mantención Bombas De Riego Y Pozos', proy:ext([0.0, 6666.67, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0])},
        {label:'Mantención de Campo', proy:Z65()},
        {label:'Mantención De Estructura Cerezos', proy:ext([3333.33, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0])},
        {label:'Mantención de Huerto', proy:Z65()},
        {label:'Mantención De Maquinaria', proy:ext([1277.78, 0, 0, 777.78, 0, 0, 0, 1277.78, 0, 0, 0, 0, 0, 0, 0, 777.78, 0, 0, 0, 1277.78, 0, 0, 0, 0, 0, 0, 0, 777.78, 0, 0, 0, 1277.78, 0, 0, 0, 0, 0, 0, 0, 777.78, 0, 0, 0, 1277.78, 0, 0, 0, 0, 0, 0, 0, 777.78, 0, 0, 0, 1277.78, 0, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Mantención de Máquinas y Equipos', proy:Z65()},
        {label:'Mantención Oficinas', proy:Z65()},
        {label:'Mantención Vehículos', proy:Z65()},
        {label:'Mantención Y Rep. De Equipos', proy:ext([0, 0, 0, 0, 0, 0, 0, 333.33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 333.33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 333.33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 333.33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 333.33, 0, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Mantención Y Reparaciones Eléctricas', proy:ext([0, 888.89, 0, 0, 0, 0, 888.89, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 888.89, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 888.89, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 888.89, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 888.89, 0, 0, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Micorizas', proy:ext([0, 0, 0, 0, 0, 3555.56, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3555.56, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3555.56, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3555.56, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3555.56, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Movilización - Transporte', proy:ext([111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 4000, 111.11, 0, 0, 0, 0, 0, 0, 111.11, 111.11, 111.11, 111.11, 4000, 111.11, 0, 0, 0, 0, 0, 0, 111.11, 111.11, 111.11, 111.11, 4000, 111.11, 0, 0, 0, 0, 0, 0, 111.11, 111.11, 111.11, 111.11, 4000, 111.11, 0, 0, 0, 0, 0, 0, 111.11, 111.11, 111.11, 111.11, 4000, 111.11, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Ortopedia Huerto A', proy:Z65()},
        {label:'Ortopedia Huerto B', proy:Z65()},
        {label:'Ortopedia Huerto C', proy:Z65()},
        {label:'Otros Beneficios', proy:Z65()},
        {label:'Otros Gastos Operacionales', proy:Z65()},
        {label:'Otros Haberes', proy:Z65()},
        {label:'Otros Insumos No Agrícolas', proy:ext([0, 0, 0, 0, 0, 1333.33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1333.33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1333.33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1333.33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1333.33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Petróleo', proy:ext([1111.11, 1111.11, 1111.11, 1111.11, 1111.11, 1111.11, 2222.22, 2222.22, 2222.22, 0, 0, 0, 0, 0, 0, 1111.11, 1111.11, 1111.11, 2222.22, 2222.22, 2222.22, 0, 0, 0, 0, 0, 0, 1111.11, 1111.11, 1111.11, 2222.22, 2222.22, 2222.22, 0, 0, 0, 0, 0, 0, 1111.11, 1111.11, 1111.11, 2222.22, 2222.22, 2222.22, 0, 0, 0, 0, 0, 0, 1111.11, 1111.11, 1111.11, 2222.22, 2222.22, 2222.22, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Poda Huerto A', proy:ext([0.0, 0.0, 6666.67, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0])},
        {label:'Poda Huerto B', proy:ext([0.0, 0.0, 6666.67, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0])},
        {label:'Poda Huerto C', proy:ext([0.0, 0.0, 2666.67, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0])},
        {label:'Promesol 5X Huerto B', proy:ext([0, 0, 0, 0, 0, 5777.78, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5777.78, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5777.78, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5777.78, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5777.78, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Protector Solar Diatomeas (ABC)', proy:ext([0, 0, 0, 0, 0, 222.22, 888.89, 1333.33, 1333.33, 0, 0, 0, 0, 0, 0, 0, 0, 222.22, 888.89, 1333.33, 1333.33, 0, 0, 0, 0, 0, 0, 0, 0, 222.22, 888.89, 1333.33, 1333.33, 0, 0, 0, 0, 0, 0, 0, 0, 222.22, 888.89, 1333.33, 1333.33, 0, 0, 0, 0, 0, 0, 0, 0, 222.22, 888.89, 1333.33, 1333.33, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Remuneración Cosecha', proy:Z65()},
        {label:'Remuneración Operacional', proy:ext([7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22, 7222.22])},
        {label:'Repuestos De Maquinarias', proy:ext([55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 333.33, 333.33, 0, 0, 0, 0, 0, 0, 55.56, 55.56, 55.56, 55.56, 333.33, 333.33, 0, 0, 0, 0, 0, 0, 55.56, 55.56, 55.56, 55.56, 333.33, 333.33, 0, 0, 0, 0, 0, 0, 55.56, 55.56, 55.56, 55.56, 333.33, 333.33, 0, 0, 0, 0, 0, 0, 55.56, 55.56, 55.56, 55.56, 333.33, 333.33, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Servicio De Control De Plagas', proy:ext([111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11])},
        {label:'Servicio de Terceros', proy:Z65()},
        {label:'Servicios De Embalaje Y Frío', proy:Z65()},
        {label:'Transporte', proy:Z65()},
        {label:'Uniforme Y Ropa De Trabajo', proy:ext([888.89, 0, 0, 0, 0, 1111.11, 1333.33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1111.11, 1333.33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1111.11, 1333.33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1111.11, 1333.33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1111.11, 1333.33, 0, 0, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Vacaciones', proy:Z65()},
        {label:'Ácido Húmico', proy:ext([0, 0, 0, 0, 0, 0, 5333.33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5333.33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5333.33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5333.33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5333.33, 0, 0, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Óxido De Calcio', proy:ext([0, 0, 0, 0, 0, 4666.67, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4666.67, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4666.67, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4666.67, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4666.67, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])},
      ]},
      { cat:'egr_fijo', label:'Costos Fijos / SG&A', signo:-1, lines:[
        {label:'Aguinaldo', proy:ext([0, 0, 0, 0, 0, 2000, 0, 0, 2000, 0, 0, 0, 0, 0, 0, 0, 0, 2000, 0, 0, 2000, 0, 0, 0, 0, 0, 0, 0, 0, 2000, 0, 0, 2000, 0, 0, 0, 0, 0, 0, 0, 0, 2000, 0, 0, 2000, 0, 0, 0, 0, 0, 0, 0, 0, 2000, 0, 0, 2000, 0, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Ajuste Remuneración', proy:Z65()},
        {label:'Aporte Patronal Y Seguro', proy:Z65()},
        {label:'Arriendo Oficina', proy:Z65()},
        {label:'Artículos E Insumos de Oficina', proy:ext([44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44, 44.44])},
        {label:'Aseo', proy:Z65()},
        {label:'Asesoría Certificaciones De Huerto', proy:ext([0, 0, 0, 0, 0, 388.89, 388.89, 388.89, 0, 0, 0, 0, 0, 0, 0, 0, 0, 388.89, 388.89, 388.89, 0, 0, 0, 0, 0, 0, 0, 0, 0, 388.89, 388.89, 388.89, 0, 0, 0, 0, 0, 0, 0, 0, 0, 388.89, 388.89, 388.89, 0, 0, 0, 0, 0, 0, 0, 0, 0, 388.89, 388.89, 388.89, 0, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Asesoría Contabilidad', proy:Z65()},
        {label:'Asesoría Legal', proy:Z65()},
        {label:'Asesoría Prevención De Riesgo', proy:ext([0, 133.33, 0, 133.33, 0, 133.33, 133.33, 133.33, 133.33, 0, 0, 0, 0, 0, 0, 133.33, 0, 133.33, 133.33, 133.33, 133.33, 0, 0, 0, 0, 0, 0, 133.33, 0, 133.33, 133.33, 133.33, 133.33, 0, 0, 0, 0, 0, 0, 133.33, 0, 133.33, 133.33, 133.33, 133.33, 0, 0, 0, 0, 0, 0, 133.33, 0, 133.33, 133.33, 133.33, 133.33, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Asesoría Técnica', proy:ext([0, 0, 888.89, 0, 0, 888.89, 0, 888.89, 0, 0, 0, 0, 0, 0, 0, 0, 0, 888.89, 0, 888.89, 0, 0, 0, 0, 0, 0, 0, 0, 0, 888.89, 0, 888.89, 0, 0, 0, 0, 0, 0, 0, 0, 0, 888.89, 0, 888.89, 0, 0, 0, 0, 0, 0, 0, 0, 0, 888.89, 0, 888.89, 0, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Asesorías Computacionales', proy:Z65()},
        {label:'Asistente Administrativo', proy:ext([0, 0, 0, 1333.33, 1333.33, 1333.33, 1333.33, 1333.33, 1333.33, 0, 0, 0, 0, 0, 0, 1333.33, 1333.33, 1333.33, 1333.33, 1333.33, 1333.33, 0, 0, 0, 0, 0, 0, 1333.33, 1333.33, 1333.33, 1333.33, 1333.33, 1333.33, 0, 0, 0, 0, 0, 0, 1333.33, 1333.33, 1333.33, 1333.33, 1333.33, 1333.33, 0, 0, 0, 0, 0, 0, 1333.33, 1333.33, 1333.33, 1333.33, 1333.33, 1333.33, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Cafetería', proy:Z65()},
        {label:'Casino - Colaciones', proy:ext([177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78, 177.78])},
        {label:'Certificaciones', proy:ext([0, 0, 0, 0, 0, 0, 0, 2777.78, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2777.78, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2777.78, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2777.78, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2777.78, 0, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Combustibles', proy:ext([333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33, 333.33])},
        {label:'Comunicación Teléfonos Internet', proy:ext([55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56])},
        {label:'Contribuciones Bienes Raíces', proy:Z65()},
        {label:'Correo - Gasto Despacho', proy:Z65()},
        {label:'Donaciones', proy:Z65()},
        {label:'Electricidad', proy:ext([55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56, 55.56])},
        {label:'Estacionamiento', proy:Z65()},
        {label:'Fee Administración', proy:ext([88888.89, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Gasto Alojamiento - Traslado - Pasajes', proy:Z65()},
        {label:'Gasto Internet - Sist Informáticos', proy:Z65()},
        {label:'Gastos Bancarios', proy:Z65()},
        {label:'Gastos Computacionales', proy:Z65()},
        {label:'Gastos De Aseo', proy:Z65()},
        {label:'Gastos De Capacitación', proy:ext([666.67, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Gastos de Representación', proy:Z65()},
        {label:'Gastos De Vehículos', proy:ext([0, 277.78, 0, 277.78, 0, 277.78, 0, 277.78, 0, 0, 0, 0, 0, 0, 0, 277.78, 0, 277.78, 0, 277.78, 0, 0, 0, 0, 0, 0, 0, 277.78, 0, 277.78, 0, 277.78, 0, 0, 0, 0, 0, 0, 0, 277.78, 0, 277.78, 0, 277.78, 0, 0, 0, 0, 0, 0, 0, 277.78, 0, 277.78, 0, 277.78, 0, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Gastos De Viaje Y Representación', proy:ext([111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11, 111.11])},
        {label:'Gastos Generales', proy:Z65()},
        {label:'Gastos Notariales', proy:Z65()},
        {label:'Gastos Varios', proy:Z65()},
        {label:'Gratificaciones', proy:ext([211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11, 211.11])},
        {label:'Honorarios Profesionales', proy:Z65()},
        {label:'Horas Extras', proy:Z65()},
        {label:'Indemnizaciones Finiquitos', proy:Z65()},
        {label:'IVA CF No Recuperado', proy:Z65()},
        {label:'Leyes Sociales', proy:ext(Array(65).fill(4000))},
        {label:'Mantención De Vehículos De Administración', proy:Z65()},
        {label:'Movilización - Transporte', proy:Z65()},
        {label:'Otros Beneficios', proy:Z65()},
        {label:'Otros Haberes', proy:Z65()},
        {label:'Patentes', proy:Z65()},
        {label:'Remuneración Administración', proy:ext([4333.33, 13000.0, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33, 4333.33])},
        {label:'Seguro Complementario Salud', proy:ext(Array(65).fill(800))},
        {label:'Seguros', proy:Z65()},
        {label:'Servicio de Terceros', proy:Z65()},
        {label:'Tag - Peaje', proy:Z65()},
        {label:'Telefonía - Celular', proy:Z65()},
        {label:'Uniforme Y Ropa De Trabajo', proy:Z65()},
        {label:'Vacaciones', proy:Z65()},
        {label:'Vales De Colación', proy:Z65()},
        {label:'Viáticos', proy:Z65()},
      ]},
      { cat:'imp', label:'Impuestos', signo:-1, lines:[
        {label:'Impuestos Anuales', proy:Z65()},
        {label:'Impuestos Mensuales', proy:ext(Array(65).fill(600))},
      ]},
      { cat:'ing_nop', label:'Ingresos No Operacionales', signo:1, lines:[
        {label:'Capital Calls', proy:Z65(), subLines:true},
        {label:'Ingreso Renovación', proy:calcIngresoRenovacionEmpresa('Allpa Farms'), formula:true, subLines:true},
        {label:'Ingresos Financiamiento', proy:Z65(), subLines:true},
        {label:'Otros Ingresos No Operacionales', proy:Z65()},
      ]},
      { cat:'egr_nop', label:'Egresos No Operacionales', signo:-1, lines:[
        {label:'Aportes de Capital', proy:Z65(), subLines:true},
        {label:'Leyes Sociales Laborales', proy:Z65()},
        {label:'Otros Egresos No Operacionales', proy:Z65()},
        {label:'Pago Préstamos - Total', proy:calcPrestamosEmpresa('Allpa Farms'), formula:true, subLines:true},
        {label:'Renovaciones', proy:calcRenovacionesEmpresa('Allpa Farms'), formula:true, subLines:true},
      ]},
    ],
  },
  'Allpa Farms Perú': {
    emoji:'🫐', color:'#7c3aed', saldo_ini:208000, desc:'Farming arándanos · Perú',
    sections:[
      { cat:'ing_op', label:'Ingresos Operacionales', signo:1, lines:[
        {label:'Exportación Arándanos', proy:Z65()},
        {label:'Venta Arándanos Nacional', proy:Z65()},
        {label:'Otros Ingresos', proy:Z65()},
        {label:'Cuentas por Cobrar', proy:Z65(),subLines:true},
      ]},
      { cat:'egr_var', label:'Egresos Operacionales', signo:-1, lines:[
        {label:'Costo Fruta Exportación', proy:Z65()},
        {label:'Materiales', proy:Z65()},
        {label:'Servicios de Packing', proy:Z65()},
        {label:'Seguros Exportación', proy:Z65()},
        {label:'Servicios Terceros Exportación', proy:Z65()},
        {label:'Arriendo Bodegas', proy:Z65()},
      ]},
      { cat:'egr_fijo', label:'Costos Fijos / SG&A', signo:-1, lines:[
        {label:'Remuneración Administración', proy:Z65()},
        {label:'Arriendo Vehículos', proy:Z65()},
        {label:'Arriendo Oficina', proy:Z65()},
        {label:'Gastos Legales', proy:Z65()},
        {label:'Fee Administración', proy:Z65()},
        {label:'Gastos Viajes Nacionales', proy:Z65()},
        {label:'Gastos Viajes Internacionales', proy:Z65()},
        {label:'Alojamiento', proy:Z65()},
        {label:'Gastos de Representación', proy:Z65()},
        {label:'Almuerzos', proy:Z65()},
        {label:'Patentes Comerciales', proy:Z65()},
        {label:'Seguros', proy:Z65()},
      ]},
      { cat:'imp', label:'Impuestos', signo:-1, lines:[
        {label:'Impuestos Mensuales', proy:Z65()},
        {label:'Impuestos Anuales', proy:Z65()},
      ]},
      { cat:'ing_nop', label:'Ingresos No Operacionales', signo:1, lines:[
        {label:'Capital Calls', proy:Z65(), subLines:true},
        {label:'Ingresos Financiamiento', proy:Z65(), subLines:true},
        {label:'Ingreso Renovación', proy:calcIngresoRenovacionEmpresa('Allpa Farms Perú'), formula:true, subLines:true},
        {label:'Otros Ingresos No Operacionales', proy:Z65()},
      ]},
      { cat:'egr_nop', label:'Egresos No Operacionales', signo:-1, lines:[
        {label:'Pago Préstamos - Total', proy:calcPrestamosEmpresa('Allpa Farms Perú'), formula:true, subLines:true},
        {label:'Renovaciones', proy:calcRenovacionesEmpresa('Allpa Farms Perú'), formula:true, subLines:true},
        {label:'Aportes de Capital', proy:Z65(), subLines:true},
        {label:'Leyes Sociales Laborales', proy:Z65()},
        {label:'Otros Egresos No Operacionales', proy:Z65()},
      ]},
    ],
  },
  'Integrity Farms': {
    emoji:'🌾', color:'#15803d', saldo_ini:604, desc:'Administración agrícola (US$2.000/há)',
    sections:[
      { cat:'ing_op', label:'Ingresos Operacionales', signo:1, lines:[
        {label:'Cuentas por Cobrar', proy:Z65(),subLines:true},
        {label:'Ingreso Administración (us$2.000/ha)', proy:ext([172000,0,0,0,0,0,0,0,0,172000,0,172000,0,0,0,0,0,172000,0,0,0,0,0].concat(Array(41).fill(0)))},
        {label:'Otros Ingresos', proy:Z65()},
      ]},
      { cat:'egr_var', label:'Egresos Operacionales', signo:-1, lines:[
        {label:'Costo Directo Variable', proy:Z65()},
      ]},
      { cat:'egr_fijo', label:'Costos Fijos / SG&A', signo:-1, lines:[
        {label:'Aguinaldo', proy:Z65()},
        {label:'Almuerzos', proy:Z65()},
        {label:'Alojamiento', proy:Z65()},
        {label:'Amortización Licencias', proy:ext([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Arriendo Oficina', proy:Z65()},
        {label:'Arriendo Vehículos', proy:Z65()},
        {label:'Artículos De Aseo', proy:Z65()},
        {label:'Artículos De Imprenta Y Librería', proy:Z65()},
        {label:'Asesoría Técnica Chile', proy:ext([0, 0, 0, 3000, 0, 3000, 0, 3000, 0, 3000, 0, 3000, 0, 3000, 0, 3000, 0, 3000, 0, 3000, 0, 3000, 0, 3000, 0, 3000, 0, 3000, 0, 3000, 0, 3000, 0, 3000, 0, 3000, 0, 3000, 0, 3000, 0, 3000, 0, 3000, 0, 3000, 0, 3000, 0, 3000, 0, 3000, 0, 3000, 0, 3000, 0, 3000, 0, 3000, 0, 3000, 0, 0, 0])},
        {label:'Asesoría Técnica Perú', proy:ext([0, 0, 0, 0, 3100, 0, 3100, 0, 3100, 0, 3100, 0, 3100, 0, 3100, 0, 3100, 0, 3100, 0, 3100, 0, 3100, 0, 3100, 0, 3100, 0, 3100, 0, 3100, 0, 3100, 0, 3100, 0, 3100, 0, 3100, 0, 3100, 0, 3100, 0, 3100, 0, 3100, 0, 3100, 0, 3100, 0, 3100, 0, 3100, 0, 3100, 0, 3100, 0, 3100, 0, 3100, 0, 0])},
        {label:'Asesorías', proy:Z65()},
        {label:'Asesorías Computacionales', proy:Z65()},
        {label:'Asesorías Contables', proy:Z65()},
        {label:'Asesorías Corporativo', proy:Z65()},
        {label:'Combustibles', proy:Z65()},
        {label:'Contribuciones Bienes Raíces', proy:Z65()},
        {label:'Encomienda Y Correo Nacional', proy:Z65()},
        {label:'Encomienda Y Corresp. Internacional', proy:Z65()},
        {label:'Fee Administración', proy:ext([0, 0, 0, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 8600, 0, 0])},
        {label:'Gasto Arriendo Dispensadores', proy:Z65()},
        {label:'Gasto Internet - Sist Informáticos', proy:ext([0, 0, 0, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 0, 0])},
        {label:'Gastos Bancarios', proy:Z65()},
        {label:'Gastos Bodegaje Documentación', proy:Z65()},
        {label:'Gastos Computacionales', proy:Z65()},
        {label:'Gastos De Colación Trabajadores', proy:Z65()},
        {label:'Gastos De Movilización, Tag Y Peajes', proy:Z65()},
        {label:'Gastos de Representación', proy:Z65()},
        {label:'Gastos Legales', proy:Z65()},
        {label:'Gastos Varios', proy:Z65()},
        {label:'Gastos Viajes Internacionales', proy:Z65()},
        {label:'Gastos Viajes Nacionales', proy:Z65()},
        {label:'Leyes Sociales', proy:Z65()},
        {label:'Mantención De Máquinas Y Equipos', proy:ext([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Mantención De Vehículos De Administración', proy:Z65()},
        {label:'Patentes Comerciales', proy:ext([0, 0, 0, 50, 0, 0, 0, 0, 0, 50, 0, 0, 0, 0, 0, 50, 0, 0, 0, 0, 0, 50, 0, 0, 0, 0, 0, 50, 0, 0, 0, 0, 0, 50, 0, 0, 0, 0, 0, 50, 0, 0, 0, 0, 0, 50, 0, 0, 0, 0, 0, 50, 0, 0, 0, 0, 0, 50, 0, 0, 0, 0, 0, 0, 0])},
        {label:'Remuneración Administración', proy:Z65()},
        {label:'Seguro Complementario Salud', proy:Z65()},
        {label:'Seguros', proy:Z65()},
        {label:'Teléfonos Celulares', proy:Z65()},
        {label:'Vales De Colación', proy:Z65()},
        {label:'Viáticos', proy:Z65()},
        {label:'Víveres Consumo Oficina', proy:Z65()},
      ]},
      { cat:'imp', label:'Impuestos', signo:-1, lines:[
        {label:'Impuestos Anuales', proy:Z65()},
        {label:'Impuestos Mensuales', proy:Z65()},
      ]},
      { cat:'ing_nop', label:'Ingresos No Operacionales', signo:1, lines:[
        {label:'Capital Calls', proy:Z65(), subLines:true},
        {label:'Ingreso Renovación', proy:calcIngresoRenovacionEmpresa('Integrity Farms'), formula:true, subLines:true},
        {label:'Ingresos Financiamiento', proy:Z65(), subLines:true},
        {label:'Otros Ingresos No Operacionales', proy:Z65()},
      ]},
      { cat:'egr_nop', label:'Egresos No Operacionales', signo:-1, lines:[
        {label:'Aportes de Capital', proy:Z65(), subLines:true},
        {label:'Leyes Sociales Laborales', proy:Z65()},
        {label:'Otros Egresos No Operacionales', proy:Z65()},
        {label:'Pago Préstamos - Total', proy:calcPrestamosEmpresa('Integrity Farms'), formula:true, subLines:true},
        {label:'Renovaciones', proy:calcRenovacionesEmpresa('Integrity Farms'), formula:true, subLines:true},
      ]},
    ],
  },
  'Osiris': {
    emoji:'🌱', color:'#0f766e', saldo_ini:40188, desc:'Royalties · Fee Viveros · Osiris Plant Mgmt',
    sections:[
      { cat:'ing_op', label:'Ingresos Operacionales', signo:1, lines:[
        {label:'Cuentas por Cobrar', proy:Z65(),subLines:true},
        {label:'Fee Vivero', proy:Z65()},
        {label:'Royalty Comercial', proy:Z65()},
        {label:'Royalty por Planta', proy:ext([0,0,0,0,0,0,0,1100000,0,0,0,2200000,0,0,1100000,0,0,2200000,0,0,1100000,0,0].concat(Array(41).fill(0)))},
      ]},
      { cat:'egr_var', label:'Egresos Operacionales', signo:-1, lines:[
        {label:'Costo Directo Variable', proy:Z65()},
      ]},
      { cat:'egr_fijo', label:'Costos Fijos / SG\&A', signo:-1, lines:[
{label:"Remuneración Administración", proy:ext([14250, 14250, 14250, 14250, 14250, 14250, 14250, 14250, 14250, 14250, 14250, 14250, 14250, 14250, 35625, 14250, 14250, 14250, 14250, 14250, 14250, 14250, 14250, 14250, 14250, 14250, 35625, 14250, 14250, 14250, 14250, 14250, 14250, 14250, 14250, 14250, 14250, 14250, 35625, 14250, 14250, 14250, 14250, 14250, 14250, 14250, 14250, 14250, 14250, 14250, 35625, 14250, 14250, 14250, 14250, 14250, 14250, 14250, 14250, 14250, 14250, 14250, 35625])},
        {label:"Leyes Sociales", proy:ext([1314, 1314, 1314, 1314, 1473, 1828, 1447, 1446, 8507, 1580, 1590, 1590, 1590, 1590, 2712, 1314, 1473, 1828, 1447, 1446, 8507, 1580, 1590, 1590, 1590, 1590, 2712, 1314, 1473, 1828, 1447, 1446, 8507, 1580, 1590, 1590, 1590, 1590, 2712, 1314, 1473, 1828, 1447, 1446, 8507, 1580, 1590, 1590, 1590, 1590, 2712, 1314, 1473, 1828, 1447, 1446, 8507, 1580, 1590, 1590, 1590, 1590, 2712])},
        {label:"Honorarios Profesionales", proy:ext([200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200])},
        {label:"Gastos De Representación", proy:ext([500, 500, 500, 500, 800, 0, 430, 0, 250, 0, 500, 0, 250, 300, 250, 500, 800, 0, 430, 0, 250, 0, 500, 0, 250, 300, 250, 500, 800, 0, 430, 0, 250, 0, 500, 0, 250, 300, 250, 500, 800, 0, 430, 0, 250, 0, 500, 0, 250, 300, 250, 500, 800, 0, 430, 0, 250, 0, 500, 0, 250, 300, 250])},
        {label:"Artículos E Insumos De Oficina", proy:ext([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])},
        {label:"Mantención De Vehículos", proy:ext([0, 0, 0, 0, 0, 900, 0, 0, 0, 0, 0, 0, 900, 0, 0, 0, 0, 900, 0, 0, 0, 0, 0, 0, 900, 0, 0, 0, 0, 900, 0, 0, 0, 0, 0, 0, 900, 0, 0, 0, 0, 900, 0, 0, 0, 0, 0, 0, 900, 0, 0, 0, 0, 900, 0, 0, 0, 0, 0, 0, 900, 0, 0])},
        {label:"Arriendo Estacionamientos", proy:ext([280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280])},
        {label:"Arriendo De Vehículos", proy:ext([3570, 3570, 3570, 3570, 3550, 2900, 4220, 2900, 2400, 3550, 2400, 2900, 2400, 3680, 2400, 3570, 3550, 2900, 4220, 2900, 2400, 3550, 2400, 2900, 2400, 3680, 2400, 3570, 3550, 2900, 4220, 2900, 2400, 3550, 2400, 2900, 2400, 3680, 2400, 3570, 3550, 2900, 4220, 2900, 2400, 3550, 2400, 2900, 2400, 3680, 2400, 3570, 3550, 2900, 4220, 2900, 2400, 3550, 2400, 2900, 2400, 3680, 2400])},
        {label:"Publicidad Y Promociones", proy:ext([4511, 4511, 4511, 4511, 0, 278, 0, 167, 167, 0, 167, 2778, 0, 700, 1222, 4511, 0, 278, 0, 167, 167, 0, 167, 2778, 0, 700, 1222, 4511, 0, 278, 0, 167, 167, 0, 167, 2778, 0, 700, 1222, 4511, 0, 278, 0, 167, 167, 0, 167, 2778, 0, 700, 1222, 4511, 0, 278, 0, 167, 167, 0, 167, 2778, 0, 700, 1222])},
        {label:"Suscripciones", proy:ext([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2500, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2500, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2500, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2500, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2500, 0, 0, 0])},
        {label:"Asesoría Técnica", proy:ext([5480, 5480, 5480, 5480, 1800, 4740, 7280, 7480, 7280, 2000, 7280, 7480, 5480, 2000, 5480, 5480, 1800, 4740, 7280, 7480, 7280, 2000, 7280, 7480, 5480, 2000, 5480, 5480, 1800, 4740, 7280, 7480, 7280, 2000, 7280, 7480, 5480, 2000, 5480, 5480, 1800, 4740, 7280, 7480, 7280, 2000, 7280, 7480, 5480, 2000, 5480, 5480, 1800, 4740, 7280, 7480, 7280, 2000, 7280, 7480, 5480, 2000, 5480])},
        {label:"Asesoría Legal", proy:ext([200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200])},
        {label:"Gastos Notariales Y Legales", proy:ext([1111, 1111, 1111, 1111, 0, 0, 0, 0, 0, 1111, 0, 0, 0, 0, 0, 1111, 0, 0, 0, 0, 0, 1111, 0, 0, 0, 0, 0, 1111, 0, 0, 0, 0, 0, 1111, 0, 0, 0, 0, 0, 1111, 0, 0, 0, 0, 0, 1111, 0, 0, 0, 0, 0, 1111, 0, 0, 0, 0, 0, 1111, 0, 0, 0, 0, 0])},
        {label:"Viáticos Internos Exterior", proy:ext([840, 840, 840, 840, 670, 280, 840, 400, 280, 480, 560, 280, 560, 480, 280, 840, 670, 280, 840, 400, 280, 480, 560, 280, 560, 480, 280, 840, 670, 280, 840, 400, 280, 480, 560, 280, 560, 480, 280, 840, 670, 280, 840, 400, 280, 480, 560, 280, 560, 480, 280, 840, 670, 280, 840, 400, 280, 480, 560, 280, 560, 480, 280])},
        {label:"Gasto Alojamiento Viajes", proy:ext([2470, 2470, 2470, 2470, 2100, 770, 2730, 1160, 650, 1420, 1300, 770, 1300, 1550, 650, 2470, 2100, 770, 2730, 1160, 650, 1420, 1300, 770, 1300, 1550, 650, 2470, 2100, 770, 2730, 1160, 650, 1420, 1300, 770, 1300, 1550, 650, 2470, 2100, 770, 2730, 1160, 650, 1420, 1300, 770, 1300, 1550, 650, 2470, 2100, 770, 2730, 1160, 650, 1420, 1300, 770, 1300, 1550, 650])},
        {label:"Tag Peaje", proy:ext([390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390])},
        {label:"Combustibles Y Lubricantes", proy:ext([835, 835, 835, 835, 785, 685, 885, 685, 585, 885, 585, 685, 585, 925, 585, 835, 785, 685, 885, 685, 585, 885, 585, 685, 585, 925, 585, 835, 785, 685, 885, 685, 585, 885, 585, 685, 585, 925, 585, 835, 785, 685, 885, 685, 585, 885, 585, 685, 585, 925, 585, 835, 785, 685, 885, 685, 585, 885, 585, 685, 585, 925, 585])},
        {label:"Telefonía Celular", proy:ext([120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120])},
        {label:"Fee Administración", proy:ext([50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000, 50000])},
        {label:"Gastos Pasajes Nacionales", proy:ext([50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50])},
        {label:"Gastos Pasajes Internacionales", proy:ext([5350, 5350, 5350, 5350, 2400, 4800, 4050, 2100, 3850, 2000, 4250, 4000, 2050, 2000, 6850, 5350, 2400, 4800, 4050, 2100, 3850, 2000, 4250, 4000, 2050, 2000, 6850, 5350, 2400, 4800, 4050, 2100, 3850, 2000, 4250, 4000, 2050, 2000, 6850, 5350, 2400, 4800, 4050, 2100, 3850, 2000, 4250, 4000, 2050, 2000, 6850, 5350, 2400, 4800, 4050, 2100, 3850, 2000, 4250, 4000, 2050, 2000, 6850])},
        {label:"Cafetería", proy:ext([100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100])},
        {label:"Correo Gasto Despacho", proy:ext([90, 90, 90, 90, 0, 90, 0, 0, 90, 0, 0, 0, 0, 0, 0, 90, 0, 90, 0, 0, 90, 0, 0, 0, 0, 0, 0, 90, 0, 90, 0, 0, 90, 0, 0, 0, 0, 0, 0, 90, 0, 90, 0, 0, 90, 0, 0, 0, 0, 0, 0, 90, 0, 90, 0, 0, 90, 0, 0, 0, 0, 0, 0])},
        {label:"Estacionamiento", proy:ext([50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50])},
        {label:"Gastos Generales", proy:ext([100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100])},
        {label:"Patentes", proy:ext([100, 100, 100, 100, 0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0])},
        {label:"Seminarios", proy:ext([680, 680, 680, 680, 0, 0, 0, 0, 0, 0, 0, 0, 658, 356, 333, 680, 0, 0, 0, 0, 0, 0, 0, 0, 658, 356, 333, 680, 0, 0, 0, 0, 0, 0, 0, 0, 658, 356, 333, 680, 0, 0, 0, 0, 0, 0, 0, 0, 658, 356, 333, 680, 0, 0, 0, 0, 0, 0, 0, 0, 658, 356, 333])},
      ]},
      { cat:'imp', label:'Impuestos', signo:-1, lines:[
        {label:'Impuestos Anuales', proy:Z65()},
        {label:'Impuestos Mensuales', proy:Z65()},
      ]},
      { cat:'ing_nop', label:'Ingresos No Operacionales', signo:1, lines:[
        {label:'Capital Calls', proy:Z65(), subLines:true},
        {label:'Crédito BCI', proy:Z65()},
        {label:'Ingreso Renovación', proy:calcIngresoRenovacionEmpresa('Osiris'), formula:true, subLines:true},
        {label:'Otros Ingresos No Operacionales', proy:Z65()},
      ]},
      { cat:'egr_nop', label:'Egresos No Operacionales', signo:-1, lines:[
        {label:'Aportes de Capital', proy:Z65(), subLines:true},
        {label:'Leyes Sociales Laborales', proy:Z65()},
        {label:'Otros Egresos No Operacionales', proy:Z65()},
        {label:'Pago Préstamos - Total', proy:calcPrestamosEmpresa('Osiris'), formula:true, subLines:true},
        {label:'Renovaciones', proy:calcRenovacionesEmpresa('Osiris'), formula:true, subLines:true},
      ]},
    ],
  },
};

// Convierte el calendario de cobros de arándanos → proy[65]
function calcComisionArandanosArr(config) {
  const proy = Z65();
  (config?.cobros || []).forEach(c => {
    const kg  = Number(c.kgTotal)  || 0;
    const fob = Number(c.fobUsdKg) || 0;
    const fee = (Number(c.feePct)  || 0) / 100;
    if (!kg || !fob || !fee) return;
    const total = kg * fob * fee;
    (c.pagos || []).forEach(p => {
      const i = mIdx(p.mes);
      if (i >= 0) proy[i] += total * ((Number(p.pct) || 0) / 100);
    });
  });
  return proy;
}

function buildAllegria(params, allegraComisionArandanos) {
  const { ing, cost, mat, srv } = calcAllegria(params);
  const arandanosProy = calcComisionArandanosArr(allegraComisionArandanos);
  return {
    emoji:"🍒", color:"#b91c1c", saldo_ini:17433, desc:"Exportación frutas · Chile", hasFormula:true,
    sections:[
      { cat:"ing_op", label:"Ingresos Operacionales", signo:1, lines:[
        {label:"Anticipo Cerezas",              proy:[...ing.cerezas],   formula:true},
        {label:"Arándanos Perú",                proy:[...arandanosProy],  formula:true},
        {label:"Cuentas por Cobrar",            proy:Z65(), subLines:true},
        {label:"Ingreso por Allegria Service",  proy:Z65()},
        {label:"Ingresos por Paltas",           proy:Z65()},
        {label:"Liquidación Ciruelas",          proy:[...ing.ciruelas],  formula:true},
        {label:"Rebates",                       proy:Z65()},
      ]},
      { cat:"egr_var", label:"Egresos Operacionales", signo:-1, lines:[
        {label:"Comisión Exportadora",               proy:Z65()},
        {label:"Costo Fruta Exportación",            proy:[...cost.cerezas],  formula:true},
        {label:"Materiales",                         proy:[...mat.cerezas],   formula:true},
        {label:"Seguros Exportación",                proy:Z65()},
        {label:"Servicios de Packing",               proy:[...srv.cerezas],   formula:true},
        {label:"Servicios Terceros / Arriendo Bodegas", proy:Z65()},
      ]},
      { cat:"egr_fijo", label:"Costos Fijos / SG&A", signo:-1, lines:[
        {label:"Remuneración Administración", proy:ext([17316, 17316, 17316, 17316, 12982, 12982, 14860, 14860, 14860, 12694, 12694, 10816, 10816, 12982, 32303, 17835, 13371, 13371, 15306, 15306, 15306, 13075, 13075, 11140, 11140, 13371, 33272, 18371, 13773, 13773, 15765, 15765, 15765, 13467, 13467, 11475, 11475, 13773, 34270, 18922, 14186, 14186, 16238, 16238, 16238, 13871, 13871, 11819, 11819, 14186, 35298, 19489, 14611, 14611, 16725, 16725, 16725, 14287, 14287, 12174, 12174, 14611, 36357, 0])},
        {label:"Aporte Patronal", proy:Z65()},
        {label:"Gratificación", proy:Z65()},
        {label:"Seguro Cesantía Empleador", proy:Z65()},
        {label:"Aguinaldo", proy:ext([0, 0, 0, 0, 0, 0, 438, 0, 0, 625, 0, 0, 0, 0, 0, 0, 0, 0, 451, 0, 0, 644, 0, 0, 0, 0, 0, 0, 0, 0, 465, 0, 0, 663, 0, 0, 0, 0, 0, 0, 0, 0, 479, 0, 0, 683, 0, 0, 0, 0, 0, 0, 0, 0, 493, 0, 0, 703, 0, 0, 0, 0, 0, 0])},
        {label:"Vales De Colación", proy:Z65()},
        {label:"Vacaciones", proy:Z65()},
        {label:"Seguro Complementario Salud", proy:ext([100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 103, 103, 103, 103, 103, 103, 103, 103, 103, 103, 103, 103, 106, 106, 106, 106, 106, 106, 106, 106, 106, 106, 106, 106, 109, 109, 109, 109, 109, 109, 109, 109, 109, 109, 109, 109, 113, 113, 113, 113, 113, 113, 113, 113, 113, 113, 113, 113, 0])},
        {label:"Asesorías Corporativo", proy:Z65()},
        {label:"Teléfonos Celulares", proy:ext([60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 62, 62, 62, 62, 62, 62, 62, 62, 62, 62, 62, 62, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 66, 66, 66, 66, 66, 66, 66, 66, 66, 66, 66, 66, 68, 68, 68, 68, 68, 68, 68, 68, 68, 68, 68, 68, 0])},
        {label:"Gastos Computacionales", proy:Z65()},
        {label:"Arriendo Camionetas", proy:ext([2600, 2600, 2600, 2600, 2600, 2600, 2600, 2600, 2600, 2600, 2600, 2600, 2600, 2600, 2600, 2678, 2678, 2678, 2678, 2678, 2678, 2678, 2678, 2678, 2678, 2678, 2678, 2758, 2758, 2758, 2758, 2758, 2758, 2758, 2758, 2758, 2758, 2758, 2758, 2841, 2841, 2841, 2841, 2841, 2841, 2841, 2841, 2841, 2841, 2841, 2841, 2926, 2926, 2926, 2926, 2926, 2926, 2926, 2926, 2926, 2926, 2926, 2926, 0])},
        {label:"Energía Eléctrica", proy:ext([60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 62, 62, 62, 62, 62, 62, 62, 62, 62, 62, 62, 62, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 66, 66, 66, 66, 66, 66, 66, 66, 66, 66, 66, 66, 68, 68, 68, 68, 68, 68, 68, 68, 68, 68, 68, 68, 0])},
        {label:"Gastos Seguros", proy:ext([800, 800, 800, 800, 800, 800, 800, 800, 800, 800, 800, 800, 800, 800, 800, 824, 824, 824, 824, 824, 824, 824, 824, 824, 824, 824, 824, 849, 849, 849, 849, 849, 849, 849, 849, 849, 849, 849, 849, 874, 874, 874, 874, 874, 874, 874, 874, 874, 874, 874, 874, 900, 900, 900, 900, 900, 900, 900, 900, 900, 900, 900, 900, 0])},
        {label:"Artículos De Imprenta Y Librería", proy:Z65()},
        {label:"Artículos De Aseo", proy:Z65()},
        {label:"Víveres Consumo Oficina", proy:Z65()},
        {label:"Gastos Comunes", proy:ext([450, 450, 450, 450, 450, 450, 450, 450, 450, 450, 450, 450, 450, 450, 450, 464, 464, 464, 464, 464, 464, 464, 464, 464, 464, 464, 464, 477, 477, 477, 477, 477, 477, 477, 477, 477, 477, 477, 477, 492, 492, 492, 492, 492, 492, 492, 492, 492, 492, 492, 492, 506, 506, 506, 506, 506, 506, 506, 506, 506, 506, 506, 506, 0])},
        {label:"Arriendo Oficina", proy:ext([2700, 2700, 2700, 2700, 2700, 2700, 2700, 2700, 2700, 2700, 2700, 2700, 2700, 2700, 2700, 2781, 2781, 2781, 2781, 2781, 2781, 2781, 2781, 2781, 2781, 2781, 2781, 2864, 2864, 2864, 2864, 2864, 2864, 2864, 2864, 2864, 2864, 2864, 2864, 2950, 2950, 2950, 2950, 2950, 2950, 2950, 2950, 2950, 2950, 2950, 2950, 3039, 3039, 3039, 3039, 3039, 3039, 3039, 3039, 3039, 3039, 3039, 3039, 0])},
        {label:"Gasto Implementación Factura Electrónica", proy:Z65()},
        {label:"Gastos De Viajes", proy:Z65()},
        {label:"Gastos De Movilización, Tag Y Peajes", proy:ext([600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 618, 618, 618, 618, 618, 618, 618, 618, 618, 618, 618, 618, 637, 637, 637, 637, 637, 637, 637, 637, 637, 637, 637, 637, 656, 656, 656, 656, 656, 656, 656, 656, 656, 656, 656, 656, 675, 675, 675, 675, 675, 675, 675, 675, 675, 675, 675, 675, 0])},
        {label:"Combustibles", proy:ext([1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200, 1236, 1236, 1236, 1236, 1236, 1236, 1236, 1236, 1236, 1236, 1236, 1236, 1273, 1273, 1273, 1273, 1273, 1273, 1273, 1273, 1273, 1273, 1273, 1273, 1311, 1311, 1311, 1311, 1311, 1311, 1311, 1311, 1311, 1311, 1311, 1311, 1351, 1351, 1351, 1351, 1351, 1351, 1351, 1351, 1351, 1351, 1351, 1351, 0])},
        {label:"Mantención De Vehículos De Administración", proy:Z65()},
        {label:"Encomienda Y Correo Nacional", proy:Z65()},
        {label:"Encomienda Y Corresp. Internacional", proy:Z65()},
        {label:"Gasto Arriendo Dispensadores", proy:Z65()},
        {label:"Gastos Bodegaje Documentación", proy:Z65()},
        {label:"Gastos Bancarios", proy:Z65()},
        {label:"Patentes Municipales", proy:ext([1000, 1000, 1000, 1000, 0, 0, 0, 0, 0, 1000, 0, 0, 0, 0, 0, 1030, 0, 0, 0, 0, 0, 1030, 0, 0, 0, 0, 0, 1061, 0, 0, 0, 0, 0, 1061, 0, 0, 0, 0, 0, 1093, 0, 0, 0, 0, 0, 1093, 0, 0, 0, 0, 0, 1126, 0, 0, 0, 0, 0, 1126, 0, 0, 0, 0, 0, 0])},
        {label:"Gastos De Alojamiento", proy:ext([500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 515, 515, 515, 515, 515, 515, 515, 515, 515, 515, 515, 515, 530, 530, 530, 530, 530, 530, 530, 530, 530, 530, 530, 530, 546, 546, 546, 546, 546, 546, 546, 546, 546, 546, 546, 546, 563, 563, 563, 563, 563, 563, 563, 563, 563, 563, 563, 563, 0])},
        {label:"Gastos Representación Varios", proy:ext([100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 103, 103, 103, 103, 103, 103, 103, 103, 103, 103, 103, 103, 106, 106, 106, 106, 106, 106, 106, 106, 106, 106, 106, 106, 109, 109, 109, 109, 109, 109, 109, 109, 109, 109, 109, 109, 113, 113, 113, 113, 113, 113, 113, 113, 113, 113, 113, 113, 0])},
        {label:"Gastos De Representación Almuerzos", proy:ext([300, 300, 300, 300, 600, 300, 300, 600, 300, 600, 300, 300, 300, 300, 300, 309, 618, 309, 309, 618, 309, 618, 309, 309, 309, 309, 309, 318, 637, 318, 318, 637, 318, 637, 318, 318, 318, 318, 318, 328, 656, 328, 328, 656, 328, 656, 328, 328, 328, 328, 328, 338, 675, 338, 338, 675, 338, 675, 338, 338, 338, 338, 338, 0])},
        {label:"Gastos De Pasajes Viajes Nacionales", proy:Z65()},
        {label:"Gastos De Pasajes Viajes Internacionales", proy:ext([0, 0, 0, 2500, 2500, 2500, 2500, 2500, 12500, 2500, 2500, 2500, 2500, 2500, 2500, 2575, 2575, 2575, 2575, 2575, 12875, 2575, 2575, 2575, 2575, 2575, 2575, 2652, 2652, 2652, 2652, 2652, 13261, 2652, 2652, 2652, 2652, 2652, 2652, 2732, 2732, 2732, 2732, 2732, 13659, 2732, 2732, 2732, 2732, 2732, 2732, 2814, 2814, 2814, 2814, 2814, 14069, 2814, 2814, 2814, 2814, 2814, 2814, 0])},
        {label:"Gastos De Colación Trabajadores", proy:Z65()},
        {label:"Contribuciones Bienes Raíces", proy:Z65()},
        {label:"Gastos Varios", proy:ext([0, 0, 0, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 515, 515, 515, 515, 515, 515, 515, 515, 515, 515, 515, 515, 530, 530, 530, 530, 530, 530, 530, 530, 530, 530, 530, 530, 546, 546, 546, 546, 546, 546, 546, 546, 546, 546, 546, 546, 563, 563, 563, 563, 563, 563, 563, 563, 563, 563, 563, 563, 0])},
        {label:"Asesorías", proy:Z65()},
        {label:"Asesorías Contables", proy:Z65()},
        {label:"Asesorías Computacionales", proy:ext([0, 0, 0, 1100, 1100, 1100, 1100, 1100, 1100, 1100, 1100, 1100, 1100, 1100, 1100, 1133, 1133, 1133, 1133, 1133, 1133, 1133, 1133, 1133, 1133, 1133, 1133, 1167, 1167, 1167, 1167, 1167, 1167, 1167, 1167, 1167, 1167, 1167, 1167, 1202, 1202, 1202, 1202, 1202, 1202, 1202, 1202, 1202, 1202, 1202, 1202, 1238, 1238, 1238, 1238, 1238, 1238, 1238, 1238, 1238, 1238, 1238, 1238, 0])},
        {label:"Asesorías Jurídico Legales", proy:ext([0, 0, 0, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2060, 2060, 2060, 2060, 2060, 2060, 2060, 2060, 2060, 2060, 2060, 2060, 2122, 2122, 2122, 2122, 2122, 2122, 2122, 2122, 2122, 2122, 2122, 2122, 2185, 2185, 2185, 2185, 2185, 2185, 2185, 2185, 2185, 2185, 2185, 2185, 2251, 2251, 2251, 2251, 2251, 2251, 2251, 2251, 2251, 2251, 2251, 2251, 0])},
      ]},
      { cat:"imp", label:"Impuestos", signo:-1, lines:[
        {label:"Impuestos Anuales",   proy:Z65()},
        {label:"Impuestos Mensuales", proy:ext(Array(65).fill(700))},
      ]},
      { cat:"ing_nop", label:"Ingresos No Operacionales", signo:1, lines:[
        {label:"Capital Calls",                   proy:Z65()},
        {label:"Crédito Banco Santander",         proy:Z65()},
        {label:"Ingreso Renovación",              proy:calcIngresoRenovacionEmpresa("Allegria Foods"), formula:true, subLines:true},
        {label:"Otros Ingresos No Operacionales", proy:Z65()},
      ]},
      { cat:"egr_nop", label:"Egresos No Operacionales", signo:-1, lines:[
        {label:"Aportes de Capital", proy:Z65(), subLines:true},
        {label:"Leyes Sociales Laborales", proy:Z65()},
        {label:"Otros Egresos No Operacionales", proy:Z65()},
        {label:"Pago Préstamos - Total", proy:calcPrestamosEmpresa("Allegria Foods"), formula:true, subLines:true},
        {label:"Renovaciones", proy:calcRenovacionesEmpresa("Allegria Foods"), formula:true, subLines:true},
      ]},
    ],
  };
}
function buildEmpresas(params, allegraComisionArandanos) {
  return { ...EMPRESAS_STATIC, "Allegria Foods": buildAllegria(params, allegraComisionArandanos) };
}

// ═══════════════════════════════════════════════════════════════════
// PERMISOS POR EMPRESA — fuente única de verdad
// ═══════════════════════════════════════════════════════════════════
// Las 8 empresas existentes en el módulo Finanzas.
export const EMPRESAS_KEYS_ALL = [
  "Mediterra","Allegria Service","Allegria Foods","Frisku Foods","Frisku Foods Perú",
  "Osiris","Integrity Farms","Allpa Farms","Allpa Farms Perú",
];
// Empresas que entran al consolidado del grupo.
// Allpa Farms Perú queda fuera por IAS 28 (método patrimonio).
// Frisku Foods Perú existe solo en Nóminas (no en el consolidado de Finanzas).
const EMPRESAS_KEYS_CONSOLIDADO = EMPRESAS_KEYS_ALL.filter(n => n !== "Allpa Farms Perú" && n !== "Frisku Foods Perú");

// Acceso completo a Finanzas si: admin, CFO, sin array (retrocompat),
// array vacío, o array contiene TODAS las empresas del consolidado.
function esAccesoCompletoUsuario(usuario){
  if(!usuario) return true;
  if(usuario.rol === "admin" || usuario.esCFO === true) return true;
  const arr = usuario.empresas_permitidas;
  if(!Array.isArray(arr) || arr.length === 0) return true;
  return EMPRESAS_KEYS_CONSOLIDADO.every(k => arr.includes(k));
}

// Empresas que el usuario puede ver. Admin/CFO siempre las 8.
// Array vacío/undefined = todas (retrocompat). Si tiene items se devuelven
// los presentes en EMPRESAS_KEYS_ALL en su orden canónico.
function getEmpresasPermitidasUsuario(usuario){
  if(!usuario) return EMPRESAS_KEYS_ALL;
  if(usuario.rol === "admin" || usuario.esCFO === true) return EMPRESAS_KEYS_ALL;
  const arr = usuario.empresas_permitidas;
  if(!Array.isArray(arr) || arr.length === 0) return EMPRESAS_KEYS_ALL;
  return EMPRESAS_KEYS_ALL.filter(k => arr.includes(k));
}

// ═══════════════════════════════════════════════════════════════════
// PALETA — TEMA AZUL MARINO (estilo header Tareas #1e3a5f)
// ═══════════════════════════════════════════════════════════════════
// Paleta Finanzas — re-exporta tokens del tema central + alias para
// preservar los nombres usados localmente. Cambios de paleta en src/theme.js.
const C = {
  ...theme,
  card2:   theme.cardAlt,
  green:   theme.success,
  red:     theme.danger,
  blue:    theme.primary,
  yellow:  theme.warning,
  orange:  theme.warning,
  accent:  theme.primary,
  accentL: theme.accent,
};

const $$ = n => {
  if(n==null||n==="") return "—";
  const abs=Math.abs(n),s=n<0?"-":"";
  return `${s}$${Math.round(abs).toLocaleString("en-US")}`;
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
  return <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"16px 18px",boxShadow:C.shadow,...style}}>{children}</div>;
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
        {fruta === 'arandanos' ? (
          // Arándanos Perú: servicio de comercialización
          <>
            {[["KG exportados por Perú","kg","",""],["FOB estimado US$/kg","fob_usd_kg","$",""],["% Fee Allegria Foods","desc_exp_pct","","%"]].map(([lbl,field,pre,suf])=>(
              <div key={field}>
                <div style={{fontSize:10,color:C.muted,marginBottom:3}}>{lbl}</div>
                <div style={{display:"flex",alignItems:"center",gap:3}}>
                  {pre&&<span style={{fontSize:11,color:C.muted}}>{pre}</span>}
                  <input type="number" value={p[field]||""} placeholder="0" onChange={e=>upd(field,parseFloat(e.target.value)||0)} style={iSt}/>
                  {suf&&<span style={{fontSize:11,color:C.muted}}>{suf}</span>}
                </div>
              </div>
            ))}
            <div>
              <div style={{fontSize:10,color:C.muted,marginBottom:3}}>Mes que paga Perú</div>
              <select value={p.mes_liquidacion||""} onChange={e=>upd("mes_liquidacion",e.target.value)} style={selSt}>
                <option value="">— mes —</option>
                {MESES_65.map(m=><option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            {kg>0&&fob>0&&desc>0&&(
              <div style={{gridColumn:"1/-1",background:`${C.green}11`,border:`1px solid ${C.green}33`,borderRadius:8,padding:"8px 12px",fontSize:11,color:C.green}}>
                Ingreso Allegria Foods: <strong>{$$(kg * fob * (desc/100))}</strong> ({desc}% de {$$(kg*fob)} FOB total)
                {p.mes_liquidacion ? ` → cobro en ${p.mes_liquidacion}` : " — selecciona mes de pago"}
              </div>
            )}
          </>
        ) : (
          // Cerezas y Ciruelas: parámetros completos
          <>
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
          </>
        )}
      </div>
      {fruta !== 'arandanos' && (
      <>
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
            <div style={{background:C.warningBg,border:`1px solid ${C.warning}44`,borderRadius:10,padding:12}}>
              <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:4}}>📦 Pago Materiales</div>
              <div style={{fontSize:10,color:C.muted,marginBottom:8}}>
                Total: <strong style={{color:C.text}}>{$$(kg*matUsd)}</strong>
                {" · "}Asignado: <strong style={{color:pctMat===100?C.green:C.warning}}>{pctMat.toFixed(0)}%</strong>
              </div>
              <DistList items={p.dist_mat} onChange={v=>upd("dist_mat",v)} totalMonto={kg*matUsd}/>
            </div>
          )}
          {srvUsd>0&&(
            <div style={{background:C.infoBg,border:`1px solid ${C.info}44`,borderRadius:10,padding:12}}>
              <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:4}}>⚙️ Pago Servicios</div>
              <div style={{fontSize:10,color:C.muted,marginBottom:8}}>
                Total: <strong style={{color:C.text}}>{$$(kg*srvUsd)}</strong>
                {" · "}Asignado: <strong style={{color:pctSrv===100?C.green:C.warning}}>{pctSrv.toFixed(0)}%</strong>
              </div>
              <DistList items={p.dist_srv} onChange={v=>upd("dist_srv",v)} totalMonto={kg*srvUsd} esSemanal/>
            </div>
          )}
        </div>
      )}
      </>
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
            <div style={{background:C.warningBg,border:`1px solid ${C.warning}44`,borderRadius:10,padding:12}}>
              <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:4}}>📦 Pago Materiales</div>
              <div style={{fontSize:10,color:C.muted,marginBottom:8}}>
                Total: <strong style={{color:C.text}}>{$$(u*mU)}</strong>
                {" · "}Asignado: <strong style={{color:pctMat===100?C.green:C.warning}}>{pctMat.toFixed(0)}%</strong>
              </div>
              <DistList items={p.dist_mat} onChange={v=>upd("dist_mat",v)} totalMonto={u*mU}/>
            </div>
          )}
          {sU>0&&(
            <div style={{background:C.infoBg,border:`1px solid ${C.info}44`,borderRadius:10,padding:12}}>
              <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:4}}>⚙️ Pago Servicios</div>
              <div style={{fontSize:10,color:C.muted,marginBottom:8}}>
                Total: <strong style={{color:C.text}}>{$$(u*sU)}</strong>
                {" · "}Asignado: <strong style={{color:pctSrv===100?C.green:C.warning}}>{pctSrv.toFixed(0)}%</strong>
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




// ── Parámetros Allpa Farms ────────────────────────────────────────

function defaultParamsAllpa() {
  const p = {};
  SEASON_KEYS.forEach(sk => {
    p[sk] = {
      variedades: [], // [{nombre, kg_mes:{mes:kg}, usd_kg:0, anticipos:[{mes,usd_kg}], mes_liq:""}]
      cosecha: { usd_kg:0, semanas_pago:[] }, // costos de cosecha
      transporte: { costo_persona:0, personas:0, meses_pago:[] },
    };
  });
  // Pre-cargar datos temporadas 2028-2029, 2029-2030, 2030-2031
  const preload = [
    {sk:"2028-2029", oct:"Oct-28", nov:"Nov-28", mar:"Mar-29"},
    {sk:"2029-2030", oct:"Oct-29", nov:"Nov-29", mar:"Mar-30"},
    {sk:"2030-2031", oct:"Oct-30", nov:"Nov-30", mar:"Mar-31"},
  ];
  preload.forEach(({sk,oct,nov,mar})=>{
    if(!p[sk]) return;
    p[sk] = {
      variedades: [
        {nombre:"Nimba",  kg_mes:{[oct]:180000}, usd_kg:5.5, anticipos:[{mes:oct,usd_kg:0.5},{mes:nov,usd_kg:0.5}], mes_liq:mar},
        {nombre:"Aryana", kg_mes:{[nov]:220000}, usd_kg:2.5, anticipos:[{mes:oct,usd_kg:0.5},{mes:nov,usd_kg:0.5}], mes_liq:mar},
        {nombre:"Nipama", kg_mes:{[oct]:69000},  usd_kg:5.5, anticipos:[{mes:oct,usd_kg:0.5},{mes:nov,usd_kg:0.5}], mes_liq:mar},
      ],
      cosecha: { usd_kg:0.45, semanas_pago:[{mes:oct,pct:70},{mes:nov,pct:30}] },
      transporte: { costo_persona:0, personas:0, meses_pago:[] },
    };
  });
  return p;
}

function calcAllpa(paramsAF) {
  const ingArr  = Z65();
  const costArr = Z65(); // remuneración cosecha
  const trspArr = Z65(); // transporte

  SEASON_KEYS.forEach(sk => {
    const d = paramsAF?.[sk];
    if(!d) return;

    // Ingresos por variedad
    (d.variedades||[]).forEach(v => {
      const usd = Number(v.usd_kg)||0;
      const totalKg = Object.values(v.kg_mes||{}).reduce((s,k)=>s+(Number(k)||0),0);
      if(!totalKg||!usd) return;
      // Anticipos
      let antTot = 0;
      (v.anticipos||[]).forEach(a => {
        const kgAnt = (Number(a.usd_kg)||0)*totalKg;
        const i = mIdx(a.mes); if(i>=0){ ingArr[i]+=kgAnt; antTot+=kgAnt; }
      });
      // Liquidación
      if(v.mes_liq) {
        const i = mIdx(v.mes_liq);
        if(i>=0) ingArr[i] += Math.max(0, totalKg*usd - antTot);
      }
    });

    // Costo cosecha (remuneración)
    const cosecha = d.cosecha||{};
    const usdCos  = Number(cosecha.usd_kg)||0;
    if(usdCos>0) {
      const totalKgAll = (d.variedades||[]).reduce((s,v)=>
        s+Object.values(v.kg_mes||{}).reduce((a,k)=>a+(Number(k)||0),0), 0);
      const totalCos = totalKgAll * usdCos;
      (cosecha.semanas_pago||[]).forEach(sp=>{
        const i=mIdx(sp.mes); if(i>=0) costArr[i]+=totalCos*((Number(sp.pct)||0)/100);
      });
    }

    // Transporte
    const trsp = d.transporte||{};
    const totalTrsp = (Number(trsp.costo_persona)||0)*(Number(trsp.personas)||0);
    if(totalTrsp>0) {
      (trsp.meses_pago||[]).forEach(mp=>{
        const i=mIdx(mp); if(i>=0) trspArr[i]+=totalTrsp;
      });
    }
  });
  return {ingArr, costArr, trspArr};
}

function ParamsAllpa({selSeason, paramsAF, setParamsAF, readOnly}) {
  const [selVar, setSelVar] = useState(null);
  const [subTab, setSubTab] = useState("variedades"); // "variedades" | "cosecha" | "transporte"

  const d = paramsAF?.[selSeason] || {variedades:[], cosecha:{usd_kg:0,semanas_pago:[]}, transporte:{costo_persona:0,personas:0,meses_pago:[]}};
  const variedades = d.variedades||[];
  const season = SEASONS.find(s=>s.key===selSeason);

  function updVar(vi, field, val) {
    setParamsAF(prev=>{
      const next=JSON.parse(JSON.stringify(prev));
      if(!next[selSeason]) next[selSeason]={variedades:[],cosecha:{usd_kg:0,semanas_pago:[]},transporte:{costo_persona:0,personas:0,meses_pago:[]}};
      const n=Number(val)||0;
      next[selSeason].variedades[vi][field]=["usd_kg"].includes(field)?n:val;
      return next;
    });
  }
  function updVarKg(vi, mes, val) {
    setParamsAF(prev=>{
      const next=JSON.parse(JSON.stringify(prev));
      if(!next[selSeason].variedades[vi].kg_mes) next[selSeason].variedades[vi].kg_mes={};
      if(!val||Number(val)===0) delete next[selSeason].variedades[vi].kg_mes[mes];
      else next[selSeason].variedades[vi].kg_mes[mes]=Number(val)||0;
      return next;
    });
  }
  function updVarAnt(vi, ai, field, val) {
    setParamsAF(prev=>{
      const next=JSON.parse(JSON.stringify(prev));
      if(!next[selSeason].variedades[vi].anticipos) next[selSeason].variedades[vi].anticipos=[];
      next[selSeason].variedades[vi].anticipos[ai][field]=field==="usd_kg"?Number(val)||0:val;
      return next;
    });
  }
  function addVar() {
    setParamsAF(prev=>{
      const next=JSON.parse(JSON.stringify(prev));
      if(!next[selSeason]) next[selSeason]={variedades:[],cosecha:{usd_kg:0,semanas_pago:[]},transporte:{costo_persona:0,personas:0,meses_pago:[]}};
      const idx=(next[selSeason].variedades||[]).length;
      next[selSeason].variedades=[...( next[selSeason].variedades||[]),{nombre:"",kg_mes:{},usd_kg:0,anticipos:[],mes_liq:""}];
      setSelVar(idx);
      return next;
    });
  }
  function updCosecha(field, val) {
    setParamsAF(prev=>{
      const next=JSON.parse(JSON.stringify(prev));
      if(!next[selSeason].cosecha) next[selSeason].cosecha={usd_kg:0,semanas_pago:[]};
      next[selSeason].cosecha[field]=field==="usd_kg"?Number(val)||0:val;
      return next;
    });
  }
  function updTransporte(field, val) {
    setParamsAF(prev=>{
      const next=JSON.parse(JSON.stringify(prev));
      if(!next[selSeason].transporte) next[selSeason].transporte={costo_persona:0,personas:0,meses_pago:[]};
      next[selSeason].transporte[field]=["costo_persona","personas"].includes(field)?Number(val)||0:val;
      return next;
    });
  }

  const iSt={padding:"5px 8px",background:C.card2,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:11,outline:"none"};
  const selSt={...iSt};
  const totalKgAll=variedades.reduce((s,v)=>s+Object.values(v.kg_mes||{}).reduce((a,k)=>a+(Number(k)||0),0),0);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {/* Sub-tabs */}
      <div style={{display:"flex",gap:6}}>
        {[{id:"variedades",label:"🍒 Variedades"},
          {id:"cosecha",   label:"👷 Cosecha"},
          {id:"transporte",label:"🚚 Transporte"}].map(t=>(
          <button key={t.id} onClick={()=>setSubTab(t.id)}
            style={{padding:"6px 14px",borderRadius:8,cursor:"pointer",fontSize:11,fontWeight:600,
              border:`1px solid ${subTab===t.id?"#dc2626":C.border}`,
              background:subTab===t.id?"#dc262633":"transparent",
              color:subTab===t.id?"#dc2626":C.muted}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* VARIEDADES */}
      {subTab==="variedades"&&(
        <div style={{display:"flex",gap:12}}>
          {/* Lista variedades */}
          <div style={{width:180,flexShrink:0}}>
            <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",marginBottom:6}}>Variedades</div>
            {variedades.map((v,vi)=>(
              <button key={vi} onClick={()=>setSelVar(vi===selVar?null:vi)}
                style={{width:"100%",padding:"7px 10px",borderRadius:8,cursor:"pointer",fontSize:11,
                  fontWeight:selVar===vi?700:400,textAlign:"left",marginBottom:4,
                  border:`1px solid ${selVar===vi?"#dc2626":C.border}`,
                  background:selVar===vi?"#dc262622":C.card,color:selVar===vi?"#dc2626":C.text}}>
                🍒 {v.nombre||`Variedad ${vi+1}`}
              </button>
            ))}
            {!readOnly&&<button onClick={addVar}
              style={{width:"100%",padding:"7px 10px",borderRadius:8,cursor:"pointer",fontSize:11,
                border:`1px dashed ${C.border2}`,background:"transparent",color:C.accentL}}>
              + Nueva variedad
            </button>}
          </div>

          {/* Detalle variedad seleccionada */}
          {selVar!==null&&variedades[selVar]&&(()=>{
            const v=variedades[selVar];
            const totalKg=Object.values(v.kg_mes||{}).reduce((s,k)=>s+(Number(k)||0),0);
            const antTot=(v.anticipos||[]).reduce((s,a)=>s+(Number(a.usd_kg)||0)*totalKg,0);
            return (
              <div style={{flex:1,display:"flex",flexDirection:"column",gap:10}}>
                <Card>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                    <div>
                      <div style={{fontSize:10,color:C.muted,marginBottom:3}}>Nombre variedad</div>
                      <input value={v.nombre||""} onChange={e=>updVar(selVar,"nombre",e.target.value)}
                        placeholder="Ej: Regina, Lapins…" style={{...iSt,width:"100%",boxSizing:"border-box"}} disabled={readOnly}/>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:C.muted,marginBottom:3}}>Retorno US$/kg</div>
                      <div style={{display:"flex",gap:3,alignItems:"center"}}>
                        <span style={{fontSize:10,color:C.muted}}>$</span>
                        <input type="number" step="0.01" value={v.usd_kg||""} placeholder="0.00"
                          onChange={e=>updVar(selVar,"usd_kg",e.target.value)}
                          style={{...iSt,width:90,textAlign:"right"}} disabled={readOnly}/>
                      </div>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:C.muted,marginBottom:3}}>Mes liquidación</div>
                      <select value={v.mes_liq||""} onChange={e=>updVar(selVar,"mes_liq",e.target.value)}
                        style={selSt} disabled={readOnly}>
                        <option value="">— mes —</option>
                        {MESES_65.map(m=><option key={m}>{m}</option>)}
                      </select>
                    </div>
                  </div>
                  {totalKg>0&&Number(v.usd_kg)>0&&(
                    <div style={{marginTop:8,fontSize:11,color:C.green,fontWeight:600}}>
                      Total: {totalKg.toLocaleString()} kg · {$$(totalKg*Number(v.usd_kg))}
                      {antTot>0&&<span style={{color:C.muted,marginLeft:6}}>
                        (anticipos: {$$(antTot)} · liq: {$$(Math.max(0,totalKg*Number(v.usd_kg)-antTot))})
                      </span>}
                    </div>
                  )}
                </Card>

                {/* Kg por mes */}
                <Card>
                  <SectionTitle>Kg por mes — {season?.label}</SectionTitle>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:8}}>
                    {(season?.months||[]).map(mes=>{
                      const kg=v.kg_mes?.[mes]||"";
                      return (
                        <div key={mes} style={{background:C.bg,borderRadius:6,padding:"6px 8px",
                          border:`1px solid ${kg?C.border2:C.border}`}}>
                          <div style={{fontSize:9,color:kg?C.accentL:C.muted,fontWeight:600,marginBottom:3}}>{mes}</div>
                          <div style={{display:"flex",gap:3,alignItems:"center"}}>
                            <input type="number" value={kg} placeholder="0"
                              onChange={e=>updVarKg(selVar,mes,e.target.value)}
                              style={{width:"100%",padding:"3px 5px",background:C.card2,
                                border:`1px solid ${C.border}`,borderRadius:5,
                                color:C.text,fontSize:10,outline:"none",textAlign:"right"}}
                              disabled={readOnly}/>
                            <span style={{fontSize:9,color:C.muted}}>kg</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>

                {/* Anticipos */}
                <Card>
                  <SectionTitle>Anticipos cliente</SectionTitle>
                  {(v.anticipos||[]).map((a,ai)=>(
                    <div key={ai} style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                      <select value={a.mes||""} onChange={e=>updVarAnt(selVar,ai,"mes",e.target.value)}
                        style={{...selSt,width:110}} disabled={readOnly}>
                        <option value="">— mes —</option>
                        {MESES_65.map(m=><option key={m}>{m}</option>)}
                      </select>
                      <span style={{fontSize:10,color:C.muted}}>$</span>
                      <input type="number" step="0.01" value={a.usd_kg||""} placeholder="US$/kg"
                        onChange={e=>updVarAnt(selVar,ai,"usd_kg",e.target.value)}
                        style={{...iSt,width:80,textAlign:"right"}} disabled={readOnly}/>
                      <span style={{fontSize:10,color:C.muted}}>/kg</span>
                      {totalKg>0&&Number(a.usd_kg)>0&&(
                        <span style={{fontSize:10,color:C.yellow}}>{$$(Number(a.usd_kg)*totalKg)}</span>
                      )}
                      {!readOnly&&<button onClick={()=>updVar(selVar,"anticipos",(v.anticipos||[]).filter((_,j)=>j!==ai))}
                        style={{background:"#fee2e2",border:"none",borderRadius:5,padding:"2px 7px",cursor:"pointer",color:"#991b1b",fontSize:11}}>×</button>}
                    </div>
                  ))}
                  {!readOnly&&<button onClick={()=>updVar(selVar,"anticipos",[...(v.anticipos||[]),{mes:"",usd_kg:0}])}
                    style={{padding:"5px 12px",borderRadius:7,border:`1px dashed ${C.border2}`,background:"transparent",color:C.accentL,cursor:"pointer",fontSize:11}}>
                    + Agregar anticipo
                  </button>}
                </Card>
              </div>
            );
          })()}
        </div>
      )}

      {/* COSECHA */}
      {subTab==="cosecha"&&(
        <Card>
          <SectionTitle>Costo Remuneración Cosecha</SectionTitle>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
            <div>
              <div style={{fontSize:10,color:C.muted,marginBottom:4}}>US$/kg cosechado</div>
              <div style={{display:"flex",gap:3,alignItems:"center"}}>
                <span style={{fontSize:10,color:C.muted}}>$</span>
                <input type="number" step="0.001" value={d.cosecha?.usd_kg||""} placeholder="0.000"
                  onChange={e=>updCosecha("usd_kg",e.target.value)}
                  style={{...iSt,width:100,textAlign:"right"}} disabled={readOnly}/>
                <span style={{fontSize:10,color:C.muted}}>/kg</span>
              </div>
              {totalKgAll>0&&Number(d.cosecha?.usd_kg)>0&&(
                <div style={{fontSize:10,color:C.red,marginTop:4}}>
                  Total cosecha: {$$(totalKgAll*Number(d.cosecha.usd_kg))}
                </div>
              )}
            </div>
          </div>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:8}}>Semanas/meses de pago (%)</div>
            {(d.cosecha?.semanas_pago||[]).map((sp,i)=>(
              <div key={i} style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                <select value={sp.mes||""} onChange={e=>{
                  const arr=[...(d.cosecha?.semanas_pago||[])];arr[i]={...sp,mes:e.target.value};
                  updCosecha("semanas_pago",arr);}}
                  style={{...selSt,width:110}} disabled={readOnly}>
                  <option value="">— mes —</option>
                  {MESES_65.map(m=><option key={m}>{m}</option>)}
                </select>
                <input type="number" min="0" max="100" value={sp.pct||""} placeholder="%"
                  onChange={e=>{const arr=[...(d.cosecha?.semanas_pago||[])];arr[i]={...sp,pct:Number(e.target.value)||0};updCosecha("semanas_pago",arr);}}
                  style={{...iSt,width:60,textAlign:"right"}} disabled={readOnly}/>
                <span style={{fontSize:10,color:C.muted}}>%</span>
                {totalKgAll>0&&Number(d.cosecha?.usd_kg)>0&&Number(sp.pct)>0&&(
                  <span style={{fontSize:10,color:C.red}}>{$$(totalKgAll*Number(d.cosecha.usd_kg)*(Number(sp.pct)/100))}</span>
                )}
                {!readOnly&&<button onClick={()=>updCosecha("semanas_pago",(d.cosecha?.semanas_pago||[]).filter((_,j)=>j!==i))}
                  style={{background:"#fee2e2",border:"none",borderRadius:5,padding:"2px 7px",cursor:"pointer",color:"#991b1b",fontSize:11}}>×</button>}
              </div>
            ))}
            {!readOnly&&<button onClick={()=>updCosecha("semanas_pago",[...(d.cosecha?.semanas_pago||[]),{mes:"",pct:0}])}
              style={{padding:"5px 12px",borderRadius:7,border:`1px dashed ${C.border2}`,background:"transparent",color:C.accentL,cursor:"pointer",fontSize:11}}>
              + Agregar mes de pago
            </button>}
          </div>
        </Card>
      )}

      {/* TRANSPORTE */}
      {subTab==="transporte"&&(
        <Card>
          <SectionTitle>Costo Transporte</SectionTitle>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
            <div>
              <div style={{fontSize:10,color:C.muted,marginBottom:4}}>Costo por persona (US$)</div>
              <input type="number" value={d.transporte?.costo_persona||""} placeholder="0"
                onChange={e=>updTransporte("costo_persona",e.target.value)}
                style={{...iSt,width:"100%",boxSizing:"border-box",textAlign:"right"}} disabled={readOnly}/>
            </div>
            <div>
              <div style={{fontSize:10,color:C.muted,marginBottom:4}}>N° personas</div>
              <input type="number" value={d.transporte?.personas||""} placeholder="0"
                onChange={e=>updTransporte("personas",e.target.value)}
                style={{...iSt,width:"100%",boxSizing:"border-box",textAlign:"right"}} disabled={readOnly}/>
            </div>
          </div>
          {Number(d.transporte?.costo_persona)>0&&Number(d.transporte?.personas)>0&&(
            <div style={{fontSize:11,color:C.red,fontWeight:600,marginBottom:10}}>
              Total transporte: {$$(Number(d.transporte.costo_persona)*Number(d.transporte.personas))}
            </div>
          )}
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:8}}>Meses de pago</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {MESES_65.filter((_,i)=>i<18).map(mes=>{
                const sel=(d.transporte?.meses_pago||[]).includes(mes);
                return (
                  <button key={mes} onClick={()=>{
                    if(readOnly) return;
                    const cur=d.transporte?.meses_pago||[];
                    updTransporte("meses_pago",sel?cur.filter(m=>m!==mes):[...cur,mes]);
                  }} style={{padding:"4px 8px",borderRadius:6,fontSize:10,cursor:"pointer",
                    border:`1px solid ${sel?"#dc2626":C.border}`,
                    background:sel?"#dc262622":"transparent",
                    color:sel?"#dc2626":C.muted}}>
                    {mes}
                  </button>
                );
              })}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Parámetros Integrity Farms ────────────────────────────────────
function defaultParamsIntegrity() {
  // { seasonKey: { clientes: [{nombre, ha, usd_ha, mes_cobro}] } }
  const p = {};
  SEASON_KEYS.forEach(sk => { p[sk] = { clientes: [] }; });
  return p;
}

function calcIntegrity(paramsIF) {
  const ingArr = Z65();
  SEASON_KEYS.forEach(sk => {
    const clientes = paramsIF?.[sk]?.clientes || [];
    clientes.forEach(cli => {
      const ha     = Number(cli.ha)     || 0;
      const usd_ha = Number(cli.usd_ha) || 0;
      if(!ha || !usd_ha || !cli.mes_cobro) return;
      const i = mIdx(cli.mes_cobro);
      if(i >= 0) ingArr[i] += ha * usd_ha;
    });
  });
  return ingArr;
}

function ParamsIntegrity({selSeason, paramsIF, setParamsIF, readOnly}) {
  const clientes = paramsIF?.[selSeason]?.clientes || [];

  function updCli(ci, field, val) {
    if(readOnly) return;
    setParamsIF(prev=>{
      const next = JSON.parse(JSON.stringify(prev));
      if(!next[selSeason]) next[selSeason]={clientes:[]};
      if(!next[selSeason].clientes) next[selSeason].clientes=[];
      if(!next[selSeason].clientes[ci]) next[selSeason].clientes[ci]={nombre:"",ha:0,usd_ha:2000,mes_cobro:""};
      next[selSeason].clientes[ci][field]=field==="ha"||field==="usd_ha"?Number(val)||0:val;
      return next;
    });
  }
  function addCli() {
    if(readOnly) return;
    setParamsIF(prev=>{
      const next = JSON.parse(JSON.stringify(prev));
      if(!next[selSeason]) next[selSeason]={clientes:[]};
      next[selSeason].clientes=[...( next[selSeason].clientes||[]),{nombre:"",ha:0,usd_ha:2000,mes_cobro:""}];
      return next;
    });
  }
  function delCli(ci) {
    if(readOnly) return;
    setParamsIF(prev=>{
      const next = JSON.parse(JSON.stringify(prev));
      next[selSeason].clientes=next[selSeason].clientes.filter((_,i)=>i!==ci);
      return next;
    });
  }

  const totalHa  = clientes.reduce((s,c)=>s+(Number(c.ha)||0),0);
  const totalIng = clientes.reduce((s,c)=>s+(Number(c.ha)||0)*(Number(c.usd_ha)||0),0);
  const iSt = {padding:"5px 8px",background:C.card2,border:`1px solid ${C.border}`,
    borderRadius:6,color:C.text,fontSize:11,outline:"none"};

  return (
    <Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <SectionTitle>Clientes Administración de Campos</SectionTitle>
        {totalIng>0&&(
          <span style={{fontSize:12,fontWeight:700,color:C.green}}>
            {totalHa.toLocaleString()} há · {$$(totalIng)}
          </span>
        )}
      </div>

      <div style={{overflowX:"auto",minWidth:0,maxWidth:"calc(100vw - 80px)"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead>
            <tr style={{background:C.primary}}>
              {["Cliente / Campo","Há a cobrar","US$/Há","Mes de cobro","Subtotal",...(readOnly?[]:[""])].map(h=>(
                <th key={h} style={{padding:"7px 10px",fontWeight:600,fontSize:10,color:C.muted,
                  textAlign:["Há a cobrar","US$/Há","Subtotal"].includes(h)?"right":"left",
                  borderBottom:`1px solid ${C.border}`,textTransform:"uppercase"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clientes.map((cli,ci)=>{
              const subtotal=(Number(cli.ha)||0)*(Number(cli.usd_ha)||0);
              return (
                <tr key={ci} style={{borderBottom:`1px solid ${C.border}22`}}>
                  <td style={{padding:"6px 10px"}}>
                    <input value={cli.nombre||""} onChange={e=>updCli(ci,"nombre",e.target.value)}
                      placeholder="Nombre cliente / campo…" disabled={readOnly}
                      style={{...iSt,width:180}}/>
                  </td>
                  <td style={{padding:"6px 10px",textAlign:"right"}}>
                    <input type="number" value={cli.ha||""} onChange={e=>updCli(ci,"ha",e.target.value)}
                      placeholder="0" disabled={readOnly} style={{...iSt,width:80,textAlign:"right"}}/>
                  </td>
                  <td style={{padding:"6px 10px",textAlign:"right"}}>
                    <div style={{display:"flex",alignItems:"center",gap:3,justifyContent:"flex-end"}}>
                      <span style={{fontSize:10,color:C.muted}}>$</span>
                      <input type="number" value={cli.usd_ha||""} onChange={e=>updCli(ci,"usd_ha",e.target.value)}
                        placeholder="2000" disabled={readOnly} style={{...iSt,width:80,textAlign:"right"}}/>
                    </div>
                  </td>
                  <td style={{padding:"6px 10px"}}>
                    <select value={cli.mes_cobro||""} onChange={e=>updCli(ci,"mes_cobro",e.target.value)}
                      disabled={readOnly} style={{...iSt,width:110}}>
                      <option value="">— mes —</option>
                      {MESES_65.map(m=><option key={m} value={m}>{m}</option>)}
                    </select>
                  </td>
                  <td style={{padding:"6px 10px",textAlign:"right",fontWeight:700,
                    color:subtotal>0?C.green:C.muted}}>
                    {subtotal>0?$$(subtotal):"—"}
                  </td>
                  {!readOnly&&(
                    <td style={{padding:"6px 10px"}}>
                      <button onClick={()=>delCli(ci)}
                        style={{background:"#fee2e2",border:"none",borderRadius:6,
                          padding:"3px 8px",cursor:"pointer",color:"#991b1b",fontSize:11}}>×</button>
                    </td>
                  )}
                </tr>
              );
            })}
            {clientes.length===0&&(
              <tr><td colSpan={6} style={{padding:20,textAlign:"center",color:C.muted}}>
                Sin clientes. Agrega uno →
              </td></tr>
            )}
            {clientes.length>0&&(
              <tr style={{background:C.bg2,borderTop:`2px solid ${C.border}`}}>
                <td style={{padding:"7px 10px",fontWeight:800,color:C.text}}>TOTAL</td>
                <td style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:C.text}}>
                  {totalHa.toLocaleString()} há
                </td>
                <td/><td/>
                <td style={{padding:"7px 10px",textAlign:"right",fontWeight:800,color:C.green}}>
                  {$$(totalIng)}
                </td>
                {!readOnly&&<td/>}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!readOnly&&(
        <button onClick={addCli}
          style={{marginTop:12,padding:"7px 18px",borderRadius:8,cursor:"pointer",fontSize:11,
            fontWeight:600,border:`1px dashed ${C.border2}`,background:"transparent",color:C.accentL}}>
          + Agregar cliente
        </button>
      )}
    </Card>
  );
}

// ── Parámetros Allegria Service ───────────────────────────────────
const ESP_AS = ["cerezas","ciruelas"];
const ESP_AS_EMOJI = {cerezas:"🍒",ciruelas:"🟣"};
const ESP_AS_LABEL = {cerezas:"Cerezas",ciruelas:"Ciruelas"};

function ParamsAllegriaService({selSeason, paramsAS, setParamsAS, readOnly}) {
  const [selEsp, setSelEsp] = useState("cerezas");

  const d = paramsAS?.[selSeason]?.[selEsp] || {kg_mes:{},usd_kg:0,mes_cobro:""};

  function upd(field, val) {
    if(readOnly) return;
    setParamsAS(prev=>{
      const next = JSON.parse(JSON.stringify(prev));
      if(!next[selSeason]) next[selSeason]={};
      if(!next[selSeason][selEsp]) next[selSeason][selEsp]={kg_mes:{},usd_kg:0,mes_cobro:""};
      next[selSeason][selEsp][field] = val;
      return next;
    });
  }
  function updKgMes(mes, field, val) {
    if(readOnly) return;
    setParamsAS(prev=>{
      const next = JSON.parse(JSON.stringify(prev));
      if(!next[selSeason]) next[selSeason]={};
      if(!next[selSeason][selEsp]) next[selSeason][selEsp]={kg_mes:{},usd_kg:0};
      if(!next[selSeason][selEsp].kg_mes) next[selSeason][selEsp].kg_mes={};
      const cur = next[selSeason][selEsp].kg_mes[mes]||{kg:0,mes_cobro:""};
      if(field==="kg" && (val===0||val==="")) {
        delete next[selSeason][selEsp].kg_mes[mes];
      } else {
        next[selSeason][selEsp].kg_mes[mes] = {...cur,[field]:field==="kg"?Number(val)||0:val};
      }
      return next;
    });
  }

  // Meses de la temporada seleccionada
  const season = SEASONS.find(s=>s.key===selSeason);
  const mesesTemp = season?.months||[];
  // Compatible: entry puede ser número (legacy) u objeto {kg, mes_cobro}
  const getKg  = entry => typeof entry==="object" ? Number(entry.kg)||0  : Number(entry)||0;
  const getCob = entry => typeof entry==="object" ? entry.mes_cobro||""  : "";
  const totalKg  = Object.values(d.kg_mes||{}).reduce((s,v)=>s+getKg(v),0);
  const totalIng = totalKg * (Number(d.usd_kg)||0);

  const iSt = {width:90,padding:"5px 8px",background:C.card2,border:`1px solid ${C.border}`,
    borderRadius:6,color:C.text,fontSize:11,outline:"none",textAlign:"right"};
  const selSt = {padding:"5px 8px",background:C.card2,border:`1px solid ${C.border}`,
    borderRadius:6,fontSize:11,outline:"none",color:C.text};

  return (
    <Card>
      {/* Selector especie */}
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {ESP_AS.map(esp=>(
          <button key={esp} onClick={()=>setSelEsp(esp)}
            style={{padding:"6px 18px",borderRadius:20,cursor:"pointer",
              fontWeight:600,fontSize:12,
              background:selEsp===esp?"#92400e":"transparent",
              color:selEsp===esp?"#fff":C.muted,
              border:`1px solid ${selEsp===esp?"#92400e":C.border}`}}>
            {ESP_AS_EMOJI[esp]} {ESP_AS_LABEL[esp]}
          </button>
        ))}
      </div>

      <div style={{background:C.card2,borderRadius:12,padding:16,border:`1px solid ${C.border}`}}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
          <span style={{fontSize:22}}>{ESP_AS_EMOJI[selEsp]}</span>
          <span style={{fontWeight:800,fontSize:14,color:C.text}}>{ESP_AS_LABEL[selEsp]}</span>
          {totalIng>0&&(
            <span style={{fontSize:11,background:`${C.green}22`,color:C.green,
              borderRadius:20,padding:"2px 10px",fontWeight:700,marginLeft:"auto"}}>
              Total kg: {totalKg.toLocaleString()} · Ingreso: {$$(totalIng)}
            </span>
          )}
        </div>

        {/* US$/kg y mes de cobro */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
          <div>
            <div style={{fontSize:10,color:C.muted,marginBottom:4}}>Tarifa proceso (US$/kg)</div>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontSize:11,color:C.muted}}>$</span>
              <input type="number" step="0.001" value={d.usd_kg||""} placeholder="0.000"
                onChange={e=>upd("usd_kg",parseFloat(e.target.value)||0)}
                style={iSt} disabled={readOnly}/>
              <span style={{fontSize:10,color:C.muted}}>/kg</span>
            </div>
          </div>
          <div>
            <div style={{fontSize:10,color:C.muted,marginBottom:4}}>Mes cobro</div>
            <div style={{fontSize:10,color:C.accentL}}>Se define por mes de proceso →</div>
          </div>
        </div>

        {/* Kg por mes */}
        <div>
          <div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:8}}>
            Kg a procesar por mes — {season?.label}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8}}>
            {mesesTemp.map(mes=>{
              const entry = d.kg_mes?.[mes];
              const kg    = entry ? getKg(entry) : 0;
              const cob   = entry ? getCob(entry) : "";
              const ingMes = kg * (Number(d.usd_kg)||0);
              return (
                <div key={mes} style={{background:C.bg,borderRadius:8,padding:"8px 10px",
                  border:`1px solid ${kg?C.border2:C.border}`}}>
                  <div style={{fontSize:10,color:kg?C.accentL:C.muted,fontWeight:600,marginBottom:6}}>{mes}</div>
                  {/* Kg a procesar */}
                  <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:4}}>
                    <input type="number" value={kg||""} placeholder="0 kg"
                      onChange={e=>updKgMes(mes,"kg",e.target.value)}
                      style={{width:"100%",padding:"4px 6px",background:C.card2,
                        border:`1px solid ${C.border}`,borderRadius:6,
                        color:C.text,fontSize:11,outline:"none",textAlign:"right"}}
                      disabled={readOnly}/>
                    <span style={{fontSize:9,color:C.muted,flexShrink:0}}>kg</span>
                  </div>
                  {/* Mes de cobro para este proceso */}
                  {kg>0&&(
                    <select value={cob} onChange={e=>updKgMes(mes,"mes_cobro",e.target.value)}
                      style={{width:"100%",padding:"3px 5px",background:C.card2,
                        border:`1px solid ${cob?C.border2:C.border}`,borderRadius:5,
                        fontSize:10,color:cob?C.text:C.muted,outline:"none"}}
                      disabled={readOnly}>
                      <option value="">cobrar en…</option>
                      {MESES_65.map(m=><option key={m} value={m}>{m}</option>)}
                    </select>
                  )}
                  {ingMes>0&&(
                    <div style={{fontSize:9,color:C.green,marginTop:3,textAlign:"right"}}>
                      {$$(ingMes)}{cob&&cob!==mes?<span style={{color:C.muted}}> → {cob}</span>:null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {totalKg>0&&Number(d.usd_kg)>0&&(
            <div style={{marginTop:10,background:`${C.green}15`,border:`1px solid ${C.green}33`,
              borderRadius:8,padding:"8px 12px",fontSize:11,color:C.green}}>
              ✓ Total: <strong>{$$(totalIng)}</strong>
              <span style={{color:C.muted,marginLeft:6}}>
                ({totalKg.toLocaleString()} kg × ${Number(d.usd_kg).toFixed(3)}/kg)
                — cobros distribuidos por mes de proceso
              </span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ── Panel Comisión Arándanos Perú (Fase Calendario) ────────────────
function AllegriaComisionArandanosPanel({ config, setConfig, readOnly }) {
  const [editId, setEditId] = useState(null);
  const [form,   setForm]   = useState(null);

  const cobros      = config?.cobros      || [];
  const migratedFrom = config?._migratedFrom;
  const totalProy   = calcComisionArandanosArr(config);
  const totalIngreso = totalProy.reduce((s, v) => s + v, 0);

  const iSt  = {width:90,padding:"5px 7px",background:C.card2,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:11,outline:"none",textAlign:"right"};
  const selSt= {padding:"5px 8px",background:C.card2,border:`1px solid ${C.border}`,borderRadius:6,fontSize:11,outline:"none",color:C.text,minWidth:110};

  function startAdd() {
    const id = `cobro_${Date.now()}`;
    setForm({ id, temporada:SEASON_KEYS[0], descripcion:"", kgTotal:0, fobUsdKg:0, feePct:8, pagos:[] });
    setEditId(id);
  }
  function startEdit(c) { setForm(JSON.parse(JSON.stringify(c))); setEditId(c.id); }
  function cancelEdit() { setForm(null); setEditId(null); }
  function saveEdit() {
    if (!form) return;
    const isNew = !cobros.find(c => c.id === form.id);
    const nextCobros = isNew ? [...cobros, form] : cobros.map(c => c.id === form.id ? form : c);
    setConfig(prev => ({ ...prev, cobros: nextCobros }));
    setForm(null); setEditId(null);
  }
  function deleteCobro(id) {
    setConfig(prev => ({ ...prev, cobros: (prev?.cobros || []).filter(c => c.id !== id) }));
  }
  function updForm(field, val) { setForm(prev => ({ ...prev, [field]: val })); }
  function addPago() { setForm(prev => ({ ...prev, pagos: [...(prev.pagos||[]), { mes:"", pct:0 }] })); }
  function updPago(idx, field, val) {
    setForm(prev => { const ps=[...(prev.pagos||[])]; ps[idx]={...ps[idx],[field]:val}; return {...prev,pagos:ps}; });
  }
  function delPago(idx) {
    setForm(prev => ({ ...prev, pagos:(prev.pagos||[]).filter((_,i)=>i!==idx) }));
  }

  const formKg  = Number(form?.kgTotal)  || 0;
  const formFob = Number(form?.fobUsdKg) || 0;
  const formFee = (Number(form?.feePct)  || 0) / 100;
  const formTotal = formKg * formFob * formFee;
  const formPctSum = (form?.pagos||[]).reduce((s,p)=>s+(Number(p.pct)||0),0);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* Aviso migración */}
      {migratedFrom && (
        <div style={{background:`${C.yellow}18`,border:`1px solid ${C.yellow}44`,borderRadius:10,padding:"10px 14px",fontSize:11,color:C.yellow}}>
          Los datos fueron migrados automáticamente desde el módulo legacy (un cobro por temporada). Revisa y ajusta los calendarios según corresponda.
        </div>
      )}

      {/* Cabecera */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <span style={{fontSize:13,fontWeight:700,color:C.text}}>🫐 Calendario de Cobros — Arándanos Perú</span>
          {totalIngreso > 0 && (
            <span style={{marginLeft:12,fontSize:11,background:`${C.green}22`,color:C.green,borderRadius:20,padding:"2px 10px",fontWeight:700}}>
              Total: {$$(totalIngreso)} USD
            </span>
          )}
        </div>
        {!readOnly && (
          <button onClick={startAdd}
            style={{padding:"6px 14px",background:C.accent,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:700}}>
            + Agregar cobro
          </button>
        )}
      </div>

      {/* Formulario edición */}
      {form && (
        <div style={{background:C.card,border:`1px solid ${C.accent}55`,borderRadius:12,padding:16,display:"flex",flexDirection:"column",gap:12}}>
          <div style={{fontSize:12,fontWeight:700,color:C.accent}}>
            {cobros.find(c=>c.id===form.id) ? "Editar cobro" : "Nuevo cobro"}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10}}>
            <div>
              <div style={{fontSize:10,color:C.muted,marginBottom:3}}>Temporada</div>
              <select value={form.temporada} onChange={e=>updForm("temporada",e.target.value)} style={selSt}>
                {SEASON_KEYS.map(sk=><option key={sk} value={sk}>{sk}</option>)}
              </select>
            </div>
            <div style={{gridColumn:"span 2"}}>
              <div style={{fontSize:10,color:C.muted,marginBottom:3}}>Descripción (opcional)</div>
              <input value={form.descripcion} onChange={e=>updForm("descripcion",e.target.value)}
                style={{...iSt,width:"100%",textAlign:"left"}} placeholder="ej. Liquidación campaña alta"/>
            </div>
            {[["KG exportados Perú","kgTotal","",""],["FOB estimado US$/kg","fobUsdKg","$",""],["% Fee Allegria","feePct","","%"]].map(([lbl,field,pre,suf])=>(
              <div key={field}>
                <div style={{fontSize:10,color:C.muted,marginBottom:3}}>{lbl}</div>
                <div style={{display:"flex",alignItems:"center",gap:3}}>
                  {pre&&<span style={{fontSize:11,color:C.muted}}>{pre}</span>}
                  <input type="number" value={form[field]||""} placeholder="0"
                    onChange={e=>updForm(field,parseFloat(e.target.value)||0)} style={iSt}/>
                  {suf&&<span style={{fontSize:11,color:C.muted}}>{suf}</span>}
                </div>
              </div>
            ))}
          </div>
          {formTotal > 0 && (
            <div style={{background:`${C.green}11`,border:`1px solid ${C.green}33`,borderRadius:8,padding:"7px 12px",fontSize:11,color:C.green}}>
              Total a cobrar: <strong>{$$(formTotal)}</strong> ({formKg.toLocaleString()} kg × ${formFob}/kg × {(formFee*100).toFixed(1)}%)
            </div>
          )}
          {/* Distribución de pagos */}
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:8}}>
              Distribución de pagos
              {formPctSum > 0 && (
                <span style={{marginLeft:8,fontSize:10,color:formPctSum===100?C.green:C.yellow,fontWeight:700}}>
                  {formPctSum}% asignado{formPctSum!==100?" — debe sumar 100%":""}
                </span>
              )}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {(form.pagos||[]).map((p,idx)=>(
                <div key={idx} style={{display:"flex",alignItems:"center",gap:8}}>
                  <select value={p.mes} onChange={e=>updPago(idx,"mes",e.target.value)} style={selSt}>
                    <option value="">— mes —</option>
                    {MESES_65.map(m=><option key={m} value={m}>{m}</option>)}
                  </select>
                  <input type="number" value={p.pct||""} placeholder="%" onChange={e=>updPago(idx,"pct",parseFloat(e.target.value)||0)}
                    style={{...iSt,width:60}}/>
                  <span style={{fontSize:10,color:C.muted}}>%</span>
                  {formTotal > 0 && p.pct > 0 && (
                    <span style={{fontSize:10,color:C.green}}>{$$( formTotal * (Number(p.pct)||0)/100 )}</span>
                  )}
                  <button onClick={()=>delPago(idx)}
                    style={{padding:"2px 7px",background:"transparent",border:`1px solid ${C.red}44`,color:C.red,borderRadius:4,cursor:"pointer",fontSize:12,lineHeight:1}}>×</button>
                </div>
              ))}
              <button onClick={addPago}
                style={{alignSelf:"flex-start",padding:"4px 12px",background:"transparent",border:`1px solid ${C.border}`,color:C.muted,borderRadius:6,cursor:"pointer",fontSize:11}}>
                + Agregar mes
              </button>
            </div>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button onClick={cancelEdit}
              style={{padding:"6px 16px",background:"transparent",border:`1px solid ${C.border}`,color:C.muted,borderRadius:8,cursor:"pointer",fontSize:12}}>
              Cancelar
            </button>
            <button onClick={saveEdit}
              style={{padding:"6px 16px",background:C.accent,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:700}}>
              Guardar
            </button>
          </div>
        </div>
      )}

      {/* Lista de cobros */}
      {cobros.length === 0 && !form && (
        <div style={{padding:"24px",textAlign:"center",color:C.muted2,fontSize:11,fontStyle:"italic",background:C.card,borderRadius:10,border:`1px solid ${C.border}`}}>
          Sin cobros registrados. Agrega el primer cobro con el botón de arriba.
        </div>
      )}
      {cobros.map(c => {
        const isEditing = editId === c.id;
        const cKg    = Number(c.kgTotal)  || 0;
        const cFob   = Number(c.fobUsdKg) || 0;
        const cFee   = (Number(c.feePct)  || 0) / 100;
        const cTotal = cKg * cFob * cFee;
        const cProy  = calcComisionArandanosArr({ cobros:[c] });
        return (
          <div key={c.id} style={{background:C.card,borderRadius:10,border:`1px solid ${isEditing?C.accent:C.border}`,padding:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <span style={{fontSize:11,fontWeight:700,color:C.accent,background:`${C.accent}22`,padding:"2px 8px",borderRadius:12}}>{c.temporada}</span>
                  {c.descripcion && <span style={{fontSize:11,color:C.text}}>{c.descripcion}</span>}
                  {cTotal > 0 && <span style={{marginLeft:"auto",fontSize:11,color:C.green,fontWeight:700}}>{$$(cTotal)}</span>}
                </div>
                <div style={{fontSize:10,color:C.muted,display:"flex",gap:12,flexWrap:"wrap"}}>
                  {cKg>0&&<span>{cKg.toLocaleString()} kg</span>}
                  {cFob>0&&<span>${cFob}/kg FOB</span>}
                  {c.feePct>0&&<span>{c.feePct}% fee</span>}
                  {(c.pagos||[]).length > 0 && (
                    <span>Cobros: {(c.pagos||[]).filter(p=>p.mes).map(p=>`${p.mes} (${p.pct}%)`).join(", ")}</span>
                  )}
                </div>
              </div>
              {!readOnly && !isEditing && (
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  <button onClick={()=>startEdit(c)}
                    style={{padding:"4px 10px",background:"transparent",border:`1px solid ${C.border2}`,color:C.text,borderRadius:6,cursor:"pointer",fontSize:11}}>Editar</button>
                  <button onClick={()=>deleteCobro(c.id)}
                    style={{padding:"4px 8px",background:"transparent",border:`1px solid ${C.red}44`,color:C.red,borderRadius:6,cursor:"pointer",fontSize:11}}>✕</button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── TabParametros GENÉRICO para todas las empresas ─────────────────
function TabParametros({empNombre,empColor="#2563eb",
  params,setParams,           // Allegria Foods (frutas legacy)
  allegraComisionArandanos,setAllegraComisionArandanos, // Allegria (arándanos calendario)
  paramsEmp,setParamsEmp,     // Otras empresas (productos genéricos)
  paramsAS,setParamsAS,       // Allegria Service (kg × especie)
  paramsIF,setParamsIF,       // Integrity Farms (clientes × há)
  paramsAF,setParamsAF,       // Allpa Farms (variedades × kg)
  paramsFrisku,setParamsFrisku, // Frisku Foods (contenedores × especie)
  readOnly=false}) {

  const [selSeason,setSelSeason] = useState(SEASON_KEYS[0]);
  const [selFruta, setSelFruta]  = useState("cerezas");
  const [selProd,  setSelProd]   = useState(null);   // id producto seleccionado

  const esAllegria        = empNombre === "Allegria Foods";
  const esFrisku          = empNombre === "Frisku Foods";
  const esAllegriaService = empNombre === "Allegria Service";
  const esIntegrity       = empNombre === "Integrity Farms";
  const esAllpa           = empNombre === "Allpa Farms";

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
          {selFruta === 'arandanos' ? (
            <AllegriaComisionArandanosPanel
              config={allegraComisionArandanos}
              setConfig={setAllegraComisionArandanos || function(){}}
              readOnly={readOnly}/>
          ) : (
            <ParamsFruta key={`${selSeason}-${selFruta}`}
              seasonKey={selSeason} fruta={selFruta}
              params={params} setParams={setParams}/>
          )}
        </Card>
      )}

      {/* ── ALLPA FARMS: variedades, kg, retorno, costos ── */}
      {esAllpa&&(
        <ParamsAllpa
          selSeason={selSeason}
          paramsAF={paramsAF||defaultParamsAllpa()}
          setParamsAF={setParamsAF||function(){}}
          readOnly={readOnly}/>
      )}

      {/* ── INTEGRITY FARMS: clientes × há × mes cobro ── */}
      {esIntegrity&&(
        <ParamsIntegrity
          selSeason={selSeason}
          paramsIF={paramsIF||defaultParamsIntegrity()}
          setParamsIF={setParamsIF||function(){}}
          readOnly={readOnly}/>
      )}

      {/* ── ALLEGRIA SERVICE: kg por especie × mes ── */}
      {esAllegriaService&&(
        <ParamsAllegriaService
          selSeason={selSeason}
          paramsAS={paramsAS||defaultParamsAllegriaService()}
          setParamsAS={setParamsAS||function(){}}
          readOnly={readOnly}/>
      )}

      {/* ── FRISKU FOODS: contenedores × especie × mes ── */}
      {esFrisku&&(
        <ParamsFrisku
          selSeason={selSeason}
          paramsFrisku={paramsFrisku||defaultParamsFrisku()}
          setParamsFrisku={setParamsFrisku||function(){}}
          readOnly={readOnly}/>
      )}

      {/* ── OTRAS EMPRESAS: lista de productos ── */}
      {!esAllegria&&!esAllegriaService&&!esIntegrity&&!esAllpa&&!esFrisku&&(
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
      {!esAllegriaService&&!esIntegrity&&!esAllpa&&(resumenAllegria.length>0||resumenEmp.length>0)&&(
        <Card>
          <SectionTitle>Resumen Proyectado — Todas las Temporadas</SectionTitle>
          <div style={{overflowX:"auto",minWidth:0,maxWidth:"calc(100vw - 80px)"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{background:C.primary}}>
                {(esAllegria
                  ? ["Temporada","Producto","Unidades","Precio","Ingreso","C.Fruta","C.Mat","C.Srv","Costo Total","Margen"]
                  : ["Temporada","Producto","Unidades","Precio","Ingreso","Costo","Mat","Srv","Margen"]
                ).map(h=>{
                  // Acento sutil de color por columna (guía visual sobre navy)
                  const colorH = h==="Precio" ? C.accent
                    : h==="Ingreso" ? C.successBg
                    : (h==="C.Fruta"||h==="Costo"||h==="Costo Total") ? C.dangerBg
                    : (h==="C.Mat"||h==="Mat") ? C.warningBg
                    : (h==="C.Srv"||h==="Srv") ? C.infoBg
                    : C.primaryText;
                  return (
                    <th key={h} style={{padding:"7px 10px",fontWeight:700,fontSize:10,color:colorH,
                      textTransform:"uppercase",
                      textAlign:["Temporada","Producto"].includes(h)?"left":"right"}}>{h}</th>
                  );
                })}
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
                    <td style={{padding:"6px 10px",textAlign:"right",color:C.text}}>
                      ${(esAllegria?r.fob:r.pr).toFixed(2)}
                    </td>
                    <td style={{padding:"6px 10px",textAlign:"right",fontWeight:700,color:C.green}}>{$$(r.ing)}</td>
                    {esAllegria&&<td style={{padding:"6px 10px",textAlign:"right",color:C.red}}>{$$(r.costFruta)}</td>}
                    <td style={{padding:"6px 10px",textAlign:"right",color:C.text}}>{(esAllegria?r.costMat:r.mat)>0?$$((esAllegria?r.costMat:r.mat)):"—"}</td>
                    <td style={{padding:"6px 10px",textAlign:"right",color:C.text}}>{(esAllegria?r.costSrv:r.srv)>0?$$((esAllegria?r.costSrv:r.srv)):"—"}</td>
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

  // Evaluar expresión matemática segura: soporta +, -, *, / y paréntesis
  // Maneja correctamente formatos: 1.500.000 / 1,500,000 / 1500000 / 1500.50
  function evalExpr(str) {
    if(!str || !String(str).trim()) return 0;
    let clean = String(str).replace(/\s/g,"").replace(/[$%]/g,"");
    // Detectar separadores: si tiene puntos Y comas, el último es decimal
    const tienePunto = clean.includes(".");
    const tieneComa  = clean.includes(",");
    
    if(tienePunto && tieneComa) {
      // Ambos: el ÚLTIMO es el decimal, el otro es separador de miles
      const lastDot   = clean.lastIndexOf(".");
      const lastComma = clean.lastIndexOf(",");
      if(lastComma > lastDot) {
        // Coma es decimal: 1.500.000,50 → 1500000.50
        clean = clean.replace(/\./g,"").replace(",",".");
      } else {
        // Punto es decimal: 1,500,000.50 → 1500000.50
        clean = clean.replace(/,/g,"");
      }
    } else if(tienePunto) {
      // Solo puntos: si hay 2+ puntos O si los puntos NO son seguidos de exactamente 1-2 dígitos, son separadores de miles
      const partes = clean.split(".");
      if(partes.length > 2) {
        // 1.500.000 → 1500000 (todos miles)
        clean = clean.replace(/\./g,"");
      } else if(partes.length === 2 && partes[1].length === 3 && /^\d+$/.test(partes[0]) && /^\d+$/.test(partes[1])) {
        // 1.500 → 1500 (formato chileno típico de miles)
        clean = clean.replace(".","");
      }
      // Si no, queda como está (ej: 1500.50 = decimal)
    } else if(tieneComa) {
      // Solo comas: si hay 2+ comas, son miles. Si hay 1 y son 3 dígitos, también.
      const partes = clean.split(",");
      if(partes.length > 2) {
        clean = clean.replace(/,/g,"");
      } else if(partes.length === 2 && partes[1].length === 3) {
        clean = clean.replace(",","");
      } else {
        // Coma decimal: 1500,50 → 1500.50
        clean = clean.replace(",",".");
      }
    }

    // Si solo hay número simple, retornar
    if(/^-?\d+(\.\d+)?$/.test(clean)) return parseFloat(clean);
    
    // Sino, evaluar como expresión matemática (solo si tiene operadores)
    if(!/^[\d.+\-*/()]+$/.test(clean)) return parseFloat(clean)||0;
    try { return Function('"use strict";return('+clean+')')(); } catch { return parseFloat(clean)||0; }
  }

  function commitValue() {
    const resultado = evalExpr(tmp);
    onSave(resultado);
    setEditing(false);
  }

  if(!canEdit) return (
    <span style={{color:val!==0?color:"#4a7aaa",fontWeight:val!==0?600:400,fontSize:9}}>
      {val!==0?$$(val):"—"}
      {real!=null&&real!==0&&<div style={{fontSize:7,color:C.muted}}>R:{$$(real)}</div>}
    </span>
  );

  if(editing) {
    const preview = evalExpr(tmp);
    const hasOp = /[+\-*/]/.test(tmp.replace(/^-/,"")); // tiene operadores (ignorando signo negativo)
    return (
    <div style={{position:"relative"}}>
      <input
        type="text" value={tmp} autoFocus
        onChange={e=>setTmp(e.target.value)}
        onBlur={commitValue}
        onKeyDown={e=>{
          if(e.key==="Enter"){commitValue();}
          if(e.key==="Escape"){setEditing(false);}
        }}
        style={{width:82,padding:"2px 4px",background:C.bg,border:`1px solid ${C.accentL}`,
          borderRadius:4,color:C.accentL,fontSize:9,textAlign:"right",outline:"none"}}
        placeholder="ej: 5000+3000"
      />
      {hasOp&&tmp.length>1&&(
        <div style={{position:"absolute",top:"100%",right:0,marginTop:2,background:C.card2,
          border:`1px solid ${C.border}`,borderRadius:4,padding:"2px 6px",fontSize:8,
          color:C.text,fontWeight:700,whiteSpace:"nowrap",zIndex:10}}>
          = {$$(preview)}
        </div>
      )}
    </div>
  );}

  return (
    <span
      onClick={()=>{setTmp(String(val||""));setEditing(true);}}
      title="Click para editar · Soporta sumas: ej. 5000+3000"
      style={{color:val!==0?color:C.muted2,fontWeight:val!==0?600:400,fontSize:9,
        cursor:"pointer",borderBottom:`1px dashed ${C.border2}`,paddingBottom:1}}>
      {val!==0?$$(val):"—"}
      {real!=null&&real!==0&&<div style={{fontSize:7,color:C.muted}}>R:{$$(real)}</div>}
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
  const porCuenta={};
  Object.entries(saldosBancos).forEach(([key,rec])=>{
    const parts=key.split("||");
    if(parts[0]!==empNombre) return;
    if(!rec?.monto||!rec?.fecha) return;
    const f=new Date(rec.fecha);
    if(f<fechaLimite){
      const cuentaKey=`${parts[1]}||${parts[2]||rec.moneda||"usd"}`;
      if(!porCuenta[cuentaKey]||new Date(porCuenta[cuentaKey].fecha)<f) porCuenta[cuentaKey]=rec;
    }
  });
  let total=0,found=false;
  Object.values(porCuenta).forEach(rec=>{
    const moneda=rec.moneda||"usd";
    if(moneda==="usd") total+=Number(rec.monto)||0;
    else if(rec.usd!=null) total+=Number(rec.usd)||0;
    found=true;
  });
  return found?total:null;
}

function getSaldoBancoInicial(saldosBancos, empNombre, fallback) {
  if(!saldosBancos) return fallback;
  const porCuenta={};
  Object.entries(saldosBancos).forEach(([key,rec])=>{
    const parts=key.split("||");
    if(parts[0]!==empNombre) return;
    if(!rec?.monto||!rec?.fecha) return;
    const cuentaKey=`${parts[1]}||${parts[2]||rec.moneda||"usd"}`;
    if(!porCuenta[cuentaKey]||new Date(porCuenta[cuentaKey].fecha)<new Date(rec.fecha)) porCuenta[cuentaKey]=rec;
  });
  let total=0,found=false;
  Object.values(porCuenta).forEach(rec=>{
    const moneda = rec.moneda || "usd";
    if(moneda === "usd") {
      total += Number(rec.monto)||0;
    } else if(rec.usd != null) {
      total += Number(rec.usd)||0;
    }
    found=true;
  });
  return found?total:fallback;
}

// ═══════════════════════════════════════════════════════════════════
// HELPER — aplica _proyOverrides, addedLines y subLines sobre el
// árbol base de empresas. Función pura, sin hooks ni side-effects.
// Usada tanto en Consolidado como en el componente principal
// (para pasar datos correctos al Dashboard).
// ═══════════════════════════════════════════════════════════════════
function buildEmpresasConOverrides(empresas, realData, addedLinesGlobal, subLinesGlobal) {
  const result = {};
  Object.keys(empresas).forEach(n => {
    const emp = JSON.parse(JSON.stringify(empresas[n]));
    // Aplicar overrides de proyección manual (_proyOverrides)
    const overrides = realData?.[n]?._proyOverrides || {};
    emp.sections = emp.sections.map(sec => ({
      ...sec,
      lines: sec.lines.map(l => {
        if (overrides[l.label]) {
          const newProy = [...l.proy];
          Object.entries(overrides[l.label]).forEach(([idx, val]) => {
            const i = Number(idx);
            if (!isNaN(i) && i >= 0 && i < newProy.length) {
              if (typeof val === "object" && val !== null) {
                newProy[i] = Object.values(val).reduce((s, v) => s + (Number(v) || 0), 0);
              } else {
                newProy[i] = Number(val) || 0;
              }
            }
          });
          return { ...l, proy: newProy };
        }
        return l;
      })
    }));
    // Agregar addedLines — semanas mandan sobre mensual si están cargadas
    const added = addedLinesGlobal[n] || {};
    Object.entries(added).forEach(([cat, lines]) => {
      const sec = emp.sections.find(s => s.cat === cat);
      if (sec && Array.isArray(lines)) {
        lines.forEach(al => {
          if (al && al.label) {
            const vals = Array(65).fill(0);
            const alVals = al.vals || {};
            for (let i = 0; i < 65; i++) {
              const hasAnySem = [0, 1, 2, 3].some(s => alVals[`${i}_${s}`] !== undefined);
              if (hasAnySem) {
                let v = 0;
                for (let s = 0; s < 4; s++) {
                  const k = `${i}_${s}`;
                  if (alVals[k] !== undefined) v += Number(alVals[k]) || 0;
                }
                vals[i] = v;
              } else {
                let v = Number(alVals[i]) || 0;
                if (!v) v = Number(alVals[String(i)]) || 0;
                vals[i] = v;
              }
            }
            sec.lines.push({ label: al.label, proy: vals });
          }
        });
      }
    });
    // Agregar subLines values
    const empSubLines = subLinesGlobal[n] || {};
    Object.entries(empSubLines).forEach(([lineLabel, slList]) => {
      if (!Array.isArray(slList)) return;
      for (const sec of emp.sections) {
        const parentLine = sec.lines.find(l => l.label === lineLabel && l.subLines);
        if (parentLine) {
          for (let idx = 0; idx < 65; idx++) {
            let mesTotal = 0;
            slList.forEach(sl => {
              if (!sl || typeof sl === "string") return;
              const slVals = sl.vals || {};
              let hasSem = false;
              for (let s = 0; s < 4; s++) {
                const k = `${idx}_${s}`;
                if (slVals[k] !== undefined) { mesTotal += Number(slVals[k]) || 0; hasSem = true; }
              }
              if (!hasSem && slVals[idx] !== undefined) mesTotal += Number(slVals[idx]) || 0;
              if (!hasSem && slVals[String(idx)] !== undefined && slVals[idx] === undefined) mesTotal += Number(slVals[String(idx)]) || 0;
            });
            if (mesTotal) parentLine.proy[idx] = (parentLine.proy[idx] || 0) + mesTotal;
          }
          break;
        }
      }
    });
    // Sanitizar NaN
    emp.sections.forEach(sec => {
      sec.lines.forEach(l => {
        l.proy = l.proy.map(v => { const num = Number(v); return isNaN(num) ? 0 : num; });
      });
    });
    result[n] = emp;
  });
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// CONSOLIDADO — dentro de Flujo Empresas
// ═══════════════════════════════════════════════════════════════════
function Consolidado({empresas,saldosBancos,realData={},addedLinesGlobal={},subLinesGlobal={}}) {
  const empNames=Object.keys(empresas);
  const empNamesConsolidado = empNames.filter(n => EMPRESAS_KEYS_CONSOLIDADO.includes(n));
  const [vistaConsolidado,setVistaConsolidado]=useState("sumada");
  // Índice del mes actual en MESES_65 — para no mostrar saldo banco en meses futuros
  const mesIdxHoy = useMemo(()=>{
    const HOY=new Date();
    const label=`${MN[HOY.getMonth()]}-${String(HOY.getFullYear()).slice(2)}`;
    const idx=MESES_65.indexOf(label);
    return idx>=0?idx:0;
  },[]);
  const [agrup,setAgrup]=useState("mes");
  const [openSeason,setOpenSeason]=useState(()=>{const o={};SEASON_KEYS.forEach((k,i)=>{o[k]=i<2;});return o;});
  // Estado de drill-down para vista "sumada". Keys: cat codes + "flujo_neto" + "saldo_acum".
  // Solo se usa en "sumada" — en "por_empresa" el desglose ya es visual por empresa.
  const [expandedCats, setExpandedCats] = useState({});
  const toggleCat = cat => setExpandedCats(prev => ({...prev, [cat]: !prev[cat]}));
  const [exportMsg, setExportMsg] = useState(null);

  // Construir empresas con overrides aplicados — lógica centralizada en buildEmpresasConOverrides
  const empresasConOverrides = useMemo(
    () => buildEmpresasConOverrides(empresas, realData, addedLinesGlobal, subLinesGlobal),
    [empresas, realData, addedLinesGlobal, subLinesGlobal] // eslint-disable-line
  );

  const flujoPorEmp=useMemo(()=>{
    const res={};
    empNames.forEach(n=>{
      const arr=Z65();
      empresasConOverrides[n].sections.forEach(sec=>sec.lines.forEach(l=>l.proy.forEach((v,i)=>{
        const num = Number(v);
        arr[i]+=(isNaN(num)?0:num)*sec.signo;
      })));
      res[n]=arr;
    });
    return res;
  },[empresasConOverrides]); // eslint-disable-line

  const saldoIniPorEmp=useMemo(()=>{
    const res={};
    empNames.forEach(n=>{
      const v = getSaldoBancoInicial(saldosBancos,n,empresas[n].saldo_ini);
      res[n] = isNaN(v) ? 0 : v;
    });
    return res;
  },[saldosBancos,empresas]); // eslint-disable-line

  // Acumulado por empresa. El saldo banco es la posición REAL de HOY, así que
  // el acumulado arranca en el mes actual (mesIdxHoy), no en el inicio del horizonte.
  // Meses pasados → null (no hay saldo proyectable). Idéntico a acumArr de la vista por-empresa.
  const acumPorEmp=useMemo(()=>{
    const res={};
    empNames.forEach(n=>{
      const sIni=saldoIniPorEmp[n]||0;
      let a=sIni;
      res[n]=(flujoPorEmp[n]||[]).map((f,i)=>{
        const num=Number(f)||0;
        if(i<mesIdxHoy) return null;
        if(i===mesIdxHoy){ a=sIni+num; return a; }
        a+=num; return a;
      });
    });
    return res;
  },[flujoPorEmp,saldoIniPorEmp,mesIdxHoy]); // eslint-disable-line

  const flujoConsolidado=useMemo(()=>{
    const arr=Z65();
    empNamesConsolidado.forEach(n=>(flujoPorEmp[n]||[]).forEach((v,i)=>{const num=Number(v);arr[i]+=(isNaN(num)?0:num);}));
    return arr;
  },[flujoPorEmp]); // eslint-disable-line

  const saldoIniConsolidado=useMemo(
    ()=>empNamesConsolidado.reduce((s,n)=>s+((saldoIniPorEmp[n])||0),0),
    [saldoIniPorEmp] // eslint-disable-line
  );

  const acumConsolidado=useMemo(()=>{
    const sIni=saldoIniConsolidado||0;
    let a=sIni;
    return flujoConsolidado.map((f,i)=>{
      const num=Number(f)||0;
      if(i<mesIdxHoy) return null;
      if(i===mesIdxHoy){ a=sIni+num; return a; }
      a+=num; return a;
    });
  },[flujoConsolidado,saldoIniConsolidado,mesIdxHoy]);

  // Derivados null-safe para KPIs/gráfico (los meses pasados son null).
  const {minAcum,minAcumIdx}=useMemo(()=>{
    const valid=acumConsolidado.filter(v=>v!=null);
    const mn=valid.length?Math.min(...valid):0;
    return {minAcum:mn, minAcumIdx:acumConsolidado.indexOf(mn)};
  },[acumConsolidado]);

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
    <thead style={{position:"sticky",top:0,zIndex:5}}>
      <tr style={{background:C.bg}}>
        <th style={{padding:"9px 14px",textAlign:"left",color:C.muted,fontSize:10,position:"sticky",left:0,top:0,background:C.bg,zIndex:6,minWidth:180,borderRight:`1px solid ${C.border}`}}>
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
        return(<tr style={{background:C.primary}}><th style={{position:"sticky",left:0,top:0,background:C.primary,zIndex:6,borderRight:`1px solid ${C.border}`}}/>{cells}</tr>);
      })()}
    </thead>
  );

  // Fila de total por categoría con drill-down expandible por empresa.
  // Solo se usa en vista "sumada". Lee de empresasConOverrides (con addedLines/overrides).
  const FilaCategoriaConDrilldown=({cat,label})=>{
    const expanded = !!expandedCats[cat];
    const color = CAT_COLOR[cat]||C.muted;
    const signo = CAT_SIGNO[cat]||"";
    return (
      <>
        <tr style={{background:`${color}0d`,cursor:"pointer",borderTop:`1px solid ${C.border}33`}}
          onClick={()=>toggleCat(cat)}>
          <td style={{padding:"7px 14px",position:"sticky",left:0,background:C.bg2,zIndex:1,borderRight:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>
            <span style={{fontSize:11,fontWeight:800,color,textTransform:"uppercase",letterSpacing:"0.5px",display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:9,display:"inline-block",transform:expanded?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.15s"}}>▶</span>
              {signo} {label}
              <span style={{fontSize:8,color:C.muted,fontWeight:400,textTransform:"none",letterSpacing:0}}>total</span>
            </span>
          </td>
          {cols.map(col=>{
            const v=empNamesConsolidado.reduce((sum,n)=>{
              const sec=empresasConOverrides[n].sections.find(s=>s.cat===cat);
              return sum+(sec?sec.lines.reduce((a,l)=>a+colVal(l.proy,col),0):0);
            },0);
            return(<td key={col.key} style={{padding:"6px 5px",textAlign:"right",fontWeight:700,fontSize:10,color,background:`${color}0d`,borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:`1px solid ${C.border}22`}}>{v!==0?$$(v):"—"}</td>);
          })}
        </tr>
        {expanded && empNamesConsolidado.map(n=>{
          const emp=empresasConOverrides[n];
          const sec=emp.sections.find(s=>s.cat===cat);
          return (
            <tr key={n} style={{background:`${color}06`}}>
              <td style={{padding:"5px 14px 5px 28px",position:"sticky",left:0,background:C.bg2,zIndex:1,borderRight:`1px solid ${C.border}`,fontSize:10,color:emp.color,whiteSpace:"nowrap"}}>
                {emp.emoji} {n}
              </td>
              {cols.map(col=>{
                const v=sec?sec.lines.reduce((a,l)=>a+colVal(l.proy,col),0):0;
                return(<td key={col.key} style={{padding:"5px 5px",textAlign:"right",fontSize:9,color:v!==0?color:C.muted2,borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:`1px solid ${C.border}11`}}>{v!==0?$$(v):"—"}</td>);
              })}
            </tr>
          );
        })}
      </>
    );
  };

  const FilaSaldoBanco=({nombre})=>(
    <tr style={{background:`${C.blue}15`,borderBottom:`2px solid ${C.border2}`}}>
      <td style={{padding:"7px 14px",position:"sticky",left:0,zIndex:1,background:`${C.blue}15`,borderRight:`1px solid ${C.border}`}}>
        <div style={{fontSize:11,fontWeight:700,color:C.blue}}>🏦 Saldo Banco USD</div>
        <div style={{fontSize:9,color:C.muted}}>{nombre==="_consolidado"?`Suma ${empNamesConsolidado.length} empresas · último registro previo al período`:"último registro previo al período"}</div>
      </td>
      {cols.map(col=>{
        // Solo mostrar saldo banco en el mes actual. Pasados y futuros → "—"
        const esMesActual = !col.collapsed && col.tipo!=="temporada" && col.indices[0]===mesIdxHoy;
        const val = esMesActual
          ? (nombre==="_consolidado"
              ? empNamesConsolidado.reduce((s,n)=>s+(saldoIniPorEmp[n]||0),0)
              : (saldoIniPorEmp[nombre]||0))
          : null;
        return(<td key={col.key} style={{padding:"6px 5px",textAlign:"right",fontWeight:700,fontSize:9,color:val==null?C.muted2:C.blue,background:`${C.blue}0d`,borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:`1px solid ${C.border}11`}}>{val==null?"—":$$(val)}</td>);
      })}
    </tr>
  );

  // drilldownFlujo / drilldownAcum: {[empName]: number[]} — solo se pasan desde la vista "sumada".
  // En "por_empresa" no se pasan → el desglose ya es visual por empresa, drill-down no aplica.
  const FilasFlujoYAcum=({flujoArr,acumArr,color=C.accentL,isTotal=false,drilldownFlujo,drilldownAcum})=>{
    const expFlujo = isTotal && !!expandedCats["flujo_neto"];
    const expAcum  = isTotal && !!expandedCats["saldo_acum"];
    return (
    <>
      <tr style={{background:`${color}1a`,borderTop:`2px solid ${C.border2}`,cursor:isTotal?"pointer":undefined}}
        onClick={isTotal?()=>toggleCat("flujo_neto"):undefined}>
        <td style={{padding:"8px 14px",fontWeight:800,color,fontSize:isTotal?12:11,position:"sticky",left:0,background:C.card,zIndex:1,borderRight:`1px solid ${C.border}`}}>
          {isTotal?(
            <span style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:9,display:"inline-block",transform:expFlujo?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.15s"}}>▶</span>
              Σ FLUJO NETO CONSOLIDADO
            </span>
          ):"Flujo Neto"}
        </td>
        {cols.map(col=>{const v=colVal(flujoArr,col);return(<td key={col.key} style={{padding:"7px 5px",textAlign:"right",fontWeight:isTotal?900:700,fontSize:isTotal?10:9,color:cf(v),background:`${cf(v)===C.green?C.green:C.red}0a`,borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:`1px solid ${C.border}22`}}>{$$(v)}</td>);})}
      </tr>
      {expFlujo && drilldownFlujo && empNamesConsolidado.map(n=>{
        const emp=empresasConOverrides[n];
        return (
          <tr key={n} style={{background:`${color}08`}}>
            <td style={{padding:"5px 14px 5px 28px",position:"sticky",left:0,background:C.bg2,zIndex:1,borderRight:`1px solid ${C.border}`,fontSize:10,color:emp.color,whiteSpace:"nowrap"}}>
              {emp.emoji} {n}
            </td>
            {cols.map(col=>{const v=colVal(drilldownFlujo[n]||[],col);return(<td key={col.key} style={{padding:"5px 5px",textAlign:"right",fontSize:9,color:v!==0?cf(v):C.muted2,borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:`1px solid ${C.border}11`}}>{v!==0?$$(v):"—"}</td>);})}
          </tr>
        );
      })}
      <tr style={{background:`${C.blue}0a`,cursor:isTotal?"pointer":undefined}}
        onClick={isTotal?()=>toggleCat("saldo_acum"):undefined}>
        <td style={{padding:"8px 14px",fontWeight:800,color:C.blue,fontSize:isTotal?12:11,position:"sticky",left:0,background:C.card,zIndex:1,borderRight:`1px solid ${C.border}`}}>
          {isTotal?(
            <span style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:9,display:"inline-block",transform:expAcum?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.15s"}}>▶</span>
              Σ SALDO ACUMULADO CONSOLIDADO
            </span>
          ):"Saldo Acumulado"}
        </td>
        {cols.map(col=>{const lastIdx=col.indices[col.indices.length-1];const v=acumArr[lastIdx];const esNull=v==null;return(<td key={col.key} style={{padding:"7px 5px",textAlign:"right",fontWeight:isTotal?900:700,fontSize:isTotal?10:9,color:esNull?C.muted2:cf(v||0),borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:`1px solid ${C.border}22`}}>{esNull?"—":$$(v||0)}</td>);})}
      </tr>
      {expAcum && drilldownAcum && empNamesConsolidado.map(n=>{
        const emp=empresasConOverrides[n];
        return (
          <tr key={n} style={{background:`${C.blue}06`}}>
            <td style={{padding:"5px 14px 5px 28px",position:"sticky",left:0,background:C.bg2,zIndex:1,borderRight:`1px solid ${C.border}`,fontSize:10,color:emp.color,whiteSpace:"nowrap"}}>
              {emp.emoji} {n}
            </td>
            {cols.map(col=>{const lastIdx=col.indices[col.indices.length-1];const v=(drilldownAcum[n]||[])[lastIdx];const esNull=v==null;return(<td key={col.key} style={{padding:"5px 5px",textAlign:"right",fontSize:9,color:esNull?C.muted2:cf(v||0),borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:`1px solid ${C.border}11`}}>{esNull?"—":$$(v||0)}</td>);})}
          </tr>
        );
      })}
    </>
  );};


  return(
    <div style={{display:"flex",flexDirection:"column",gap:14,minWidth:0}}>
      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10}}>
        <KPI label="Saldo Inicial Consolidado" value={$$(saldoIniConsolidado)} color={C.blue}/>
        <KPI label="Flujo Total" value={$$(flujoConsolidado.reduce((a,b)=>a+(Number(b)||0),0))} color={cf(flujoConsolidado.reduce((a,b)=>a+(Number(b)||0),0))}/>
        <KPI label={"Mínimo Acumulado ("+(MESES_65[minAcumIdx]||"")+")"} value={$$(minAcum)} color={C.red}/>
        <KPI label="Saldo Final Jun-31" value={$$(acumConsolidado[acumConsolidado.length-1])} color={cf(acumConsolidado[acumConsolidado.length-1])}/>
        <KPI label="Empresas" value={empNamesConsolidado.length} color={C.yellow}/>
      </div>
      {/* Flujo al cierre de cada temporada */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8}}>
        {SEASONS.map(s=>{
          const lastIdx = s.indices[s.indices.length-1];
          const saldoCierre = acumConsolidado[lastIdx];
          return <KPI key={s.key} label={"Cierre "+s.key} value={saldoCierre==null?"—":$$(saldoCierre)} color={saldoCierre==null?C.muted:saldoCierre<0?C.red:C.green}/>;
        })}
      </div>
      {/* Gráfico */}
      <Card>
        <SectionTitle>Flujo Acumulado Consolidado · {empNamesConsolidado.length} empresas · Mar-26 → Jun-31</SectionTitle>
        <LineChart months={MESES_65.slice(mesIdxHoy)} values={acumConsolidado.slice(mesIdxHoy)} color={C.accentL}/>
        {minAcum<0&&(
          <div style={{marginTop:8,padding:"8px 12px",background:`${C.red}18`,border:`1px solid ${C.red}33`,borderRadius:8,fontSize:11,color:C.muted}}>
            ⚠️ Mínimo proyectado: <strong style={{color:C.red}}>{$$(minAcum)}</strong>
          </div>
        )}
      </Card>
      {/* Controles */}
      <Card>
        <div style={{display:"flex",gap:16,flexWrap:"wrap",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Vista</div>
            <div style={{display:"flex",gap:0,borderRadius:8,overflow:"hidden",border:`1px solid ${C.border}`}}>
              {[
                {id:"sumada",label:"🏛 Sumada"},
                {id:"por_empresa",label:"📋 Por Empresa"},
                {id:"resumen_mensual",label:"📊 Matriz Mensual"},
                {id:"waterfall",label:"📉 Waterfall"},
                {id:"semanal",label:"📅 Resumen Semanal"}
              ].map(v=>(
                <button key={v.id} onClick={()=>setVistaConsolidado(v.id)}
                  style={{padding:"7px 18px",border:"none",cursor:"pointer",fontWeight:vistaConsolidado===v.id?800:500,fontSize:12,
                    background:vistaConsolidado===v.id?C.accent:"transparent",
                    color:vistaConsolidado===v.id?"#fff":C.muted,transition:"all 0.15s"}}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          {vistaConsolidado!=="waterfall"&&(<>
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
          </>)}
          <div style={{marginLeft:"auto"}}>
            <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Exportar</div>
            <Btn color={C.green} onClick={()=>{
              try{
                const f=exportarFlujoConsolidado({
                  empresasConOverrides,
                  empNames:empNamesConsolidado,
                  saldoIniPorEmp,
                });
                setExportMsg("✓ "+f);
              }catch(e){ console.error(e); setExportMsg("✗ Error al exportar"); }
              setTimeout(()=>setExportMsg(null),5000);
            }}>📥 Excel (flujo completo)</Btn>
            {exportMsg&&<div style={{fontSize:10,color:C.muted,marginTop:6,maxWidth:220}}>{exportMsg}</div>}
          </div>
        </div>
      </Card>

      {/* Vista sumada */}
      {vistaConsolidado==="sumada"&&(
        <div style={{overflowX:"auto",overflowY:"auto",maxHeight:"80vh",borderRadius:12,border:`1px solid ${C.border}`,minWidth:0,maxWidth:"calc(100vw - 80px)"}}>
          <table id="flujo-table-consolidado" style={{borderCollapse:"separate",borderSpacing:0,fontSize:11,minWidth:600}}>
            <THead/>
            <tbody>
              <FilaSaldoBanco nombre="_consolidado"/>
              <FilaCategoriaConDrilldown cat="ing_op"  label="Ingresos Operacionales"/>
              <FilaCategoriaConDrilldown cat="egr_var" label="Egresos Operacionales"/>
              <FilaCategoriaConDrilldown cat="egr_fijo"label="Costos Fijos / SG&A"/>
              <FilaCategoriaConDrilldown cat="imp"     label="Impuestos"/>
              <FilaCategoriaConDrilldown cat="ing_nop" label="Ingresos No Operacionales"/>
              <FilaCategoriaConDrilldown cat="egr_nop" label="Egresos No Operacionales"/>
              <FilasFlujoYAcum
                flujoArr={flujoConsolidado} acumArr={acumConsolidado}
                color={C.accentL} isTotal
                drilldownFlujo={flujoPorEmp} drilldownAcum={acumPorEmp}
              />
            </tbody>
          </table>
        </div>
      )}

      {/* Vista por empresa - solo subtotales por categoría */}
      {vistaConsolidado==="por_empresa"&&(
        <div style={{overflowX:"auto",overflowY:"auto",maxHeight:"80vh",borderRadius:12,border:`1px solid ${C.border}`,minWidth:0,maxWidth:"calc(100vw - 80px)"}}>
          <table style={{borderCollapse:"separate",borderSpacing:0,fontSize:11,minWidth:600}}>
            <THead/>
            <tbody>
              {empNamesConsolidado.map((n,ei)=>{
                const emp=empresasConOverrides[n];
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
                      <tr key={sec.cat} style={{background:C.bg2, borderTop:`1px solid ${C.border}33`}}>
                        <td style={{padding:"7px 14px",position:"sticky",left:0,background:C.bg2,borderRight:`1px solid ${C.border}`,zIndex:1,whiteSpace:"nowrap"}}>
                          <span style={{fontSize:11,fontWeight:800,color:CAT_COLOR[sec.cat]||C.muted,textTransform:"uppercase",letterSpacing:"0.5px"}}>
                            {CAT_SIGNO[sec.cat]} {sec.label}
                          </span>
                        </td>
                        {cols.map(col=>{
                          const v=sec.lines.reduce((a,l)=>a+colVal(l.proy,col),0);
                          return(<td key={col.key} style={{padding:"6px 5px",textAlign:"right",fontWeight:700,fontSize:10,color:CAT_COLOR[sec.cat]||C.muted,background:C.bg2,borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:`1px solid ${C.border}22`}}>{v!==0?$$(v):"—"}</td>);
                        })}
                      </tr>
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

      {/* Vista Resumen Semanal */}
      {vistaConsolidado==="semanal"&&(
        <ResumenSemanal empresas={empresasConOverrides} empNames={empNamesConsolidado}/>
      )}

      {/* Vista Matriz Mensual — Empresa x Mes para detectar mínimos consolidados */}
      {vistaConsolidado==="resumen_mensual"&&(
        <MatrizMensualConsolidado
          empresas={empresasConOverrides}
          empNames={empNamesConsolidado}
          flujoPorEmp={flujoPorEmp}
          acumPorEmp={acumPorEmp}
          saldoIniPorEmp={saldoIniPorEmp}
        />
      )}

      {/* Vista Waterfall — Conceptos × Empresas por temporada */}
      {vistaConsolidado==="waterfall"&&(
        <WaterfallConsolidado empresas={empresasConOverrides} saldosBancos={saldosBancos} saldoIniPorEmp={saldoIniPorEmp} acumPorEmp={acumPorEmp} flujoPorEmp={flujoPorEmp}/>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// RESUMEN SEMANAL — Vista consolidada por semana seleccionada
// ═══════════════════════════════════════════════════════════════════
function ResumenSemanal({empresas, empNames}) {
  const semanasDisponibles = useMemo(()=>{
    const list = [];
    MESES_65.forEach((mes, mesIdx) => {
      const sems = SEMANAS_MES[mes] || ["S1","S2","S3","S4"];
      sems.forEach((sem, si) => {
        list.push({ label: `${sem} · ${mes}`, mes, mesIdx, semIdx: si, nSems: sems.length, semLabel: sem });
      });
    });
    return list;
  },[]);

  const [selIdx, setSelIdx] = useState(0);
  const sel = semanasDisponibles[selIdx] || semanasDisponibles[0];

  const CATS = [
    {cat:"ing_op", label:"Ingresos Operacionales"},
    {cat:"egr_var", label:"Egresos Operacionales"},
    {cat:"egr_fijo", label:"Costos Fijos / SG&A"},
    {cat:"imp", label:"Impuestos"},
    {cat:"ing_nop", label:"Ingresos No Operacionales"},
    {cat:"egr_nop", label:"Egresos No Operacionales"},
  ];

  const datos = useMemo(()=>{
    const res = {};
    empNames.forEach(n => {
      const emp = empresas[n];
      const row = {};
      let flujoNeto = 0;
      CATS.forEach(({cat}) => {
        const sec = (emp.sections||[]).find(s=>s.cat===cat);
        if(!sec) { row[cat] = 0; return; }
        let total = 0;
        sec.lines.forEach(l => {
          const mesVal = Number(l.proy[sel.mesIdx])||0;
          total += mesVal / sel.nSems;
        });
        const val = total * sec.signo;
        row[cat] = val;
        flujoNeto += val;
      });
      row.flujoNeto = flujoNeto;
      res[n] = row;
    });
    return res;
  },[empresas, empNames, sel]); // eslint-disable-line

  const totales = useMemo(()=>{
    const t = {};
    CATS.forEach(({cat}) => { t[cat] = empNames.reduce((s,n)=>s+(datos[n]?.[cat]||0), 0); });
    t.flujoNeto = empNames.reduce((s,n)=>s+(datos[n]?.flujoNeto||0), 0);
    return t;
  },[datos, empNames]); // eslint-disable-line

  function fmt(v) {
    if(!v || Math.abs(v) < 1) return "—";
    const abs = Math.abs(Math.round(v));
    return `${v<0?"-":""}$${abs.toLocaleString("es-CL")}`;
  }
  function cf(v) { return v > 0 ? C.green : v < 0 ? C.red : C.text; }

  return (
    <Card>
      <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:16,flexWrap:"wrap"}}>
        <div style={{fontWeight:800,fontSize:14,color:C.text}}>📅 Resumen Flujo Semanal</div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>setSelIdx(Math.max(0,selIdx-1))} disabled={selIdx===0}
            style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,cursor:selIdx===0?"default":"pointer",opacity:selIdx===0?0.4:1}}>◀</button>
          <select value={selIdx} onChange={e=>setSelIdx(Number(e.target.value))}
            style={{padding:"8px 14px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card,color:C.text,fontSize:13,fontWeight:700,minWidth:180}}>
            {semanasDisponibles.map((s,i)=><option key={i} value={i}>{s.label}</option>)}
          </select>
          <button onClick={()=>setSelIdx(Math.min(semanasDisponibles.length-1,selIdx+1))} disabled={selIdx>=semanasDisponibles.length-1}
            style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,cursor:selIdx>=semanasDisponibles.length-1?"default":"pointer",opacity:selIdx>=semanasDisponibles.length-1?0.4:1}}>▶</button>
        </div>
      </div>
      <div style={{overflowX:"auto",minWidth:0,maxWidth:"calc(100vw - 80px)"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead>
            <tr style={{background:C.primary}}>
              <th style={{padding:"10px 14px",textAlign:"left",color:C.muted,fontWeight:700,fontSize:10,position:"sticky",left:0,background:C.bg2,zIndex:2,minWidth:220}}>
                {sel.semLabel} · {sel.mes}
              </th>
              {empNames.map(n=>(
                <th key={n} style={{padding:"10px 10px",textAlign:"right",color:C.muted,fontWeight:700,fontSize:10,minWidth:110}}>
                  {empresas[n]?.emoji} {n}
                </th>
              ))}
              <th style={{padding:"10px 14px",textAlign:"right",color:C.accentL,fontWeight:900,fontSize:10,minWidth:120}}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {CATS.map(({cat,label},i)=>{
              const isIng = cat.startsWith("ing");
              return (
                <tr key={cat} style={{borderBottom:`1px solid ${C.border}33`,background:i%2===0?"transparent":`${C.border}08`}}>
                  <td style={{padding:"8px 14px",fontWeight:600,color:isIng?C.green:C.red,fontSize:11,position:"sticky",left:0,background:i%2===0?C.card:`${C.border}08`,zIndex:1}}>
                    {label}
                  </td>
                  {empNames.map(n=>{
                    const v = datos[n]?.[cat]||0;
                    return <td key={n} style={{padding:"8px 10px",textAlign:"right",color:cf(v)}}>{fmt(v)}</td>;
                  })}
                  <td style={{padding:"8px 14px",textAlign:"right",fontWeight:700,color:cf(totales[cat]),background:`${C.accent}11`}}>{fmt(totales[cat])}</td>
                </tr>
              );
            })}
            <tr style={{borderTop:`2px solid ${C.primary}`,background:C.primary}}>
              <td style={{padding:"10px 14px",fontWeight:900,color:C.primaryText,fontSize:12,position:"sticky",left:0,background:C.primary,zIndex:1}}>
                FLUJO NETO
              </td>
              {empNames.map(n=>{
                const v = datos[n]?.flujoNeto||0;
                return <td key={n} style={{padding:"10px 10px",textAlign:"right",fontWeight:800,fontSize:12,color:v<0?C.dangerBg:v>0?C.successBg:C.primaryText}}>{fmt(v)}</td>;
              })}
              <td style={{padding:"10px 14px",textAlign:"right",fontWeight:900,fontSize:13,color:cf(totales.flujoNeto),background:`${C.accent}33`}}>
                {fmt(totales.flujoNeto)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{marginTop:10,fontSize:10,color:C.muted,fontStyle:"italic"}}>
        💡 Valores estimados: monto mensual distribuido equitativamente entre las semanas del mes.
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════
// WATERFALL CONSOLIDADO — Filas = Conceptos, Columnas = Empresas
// Estructura tipo estado de flujo ejecutivo para presentación a directorio
// ═══════════════════════════════════════════════════════════════════

// Participaciones de controladora por empresa (%). Ajustables según realidad del grupo.
const PARTICIPACION_CONTROLADORA = {
  "Mediterra":1.00,
  "Allegria Foods":1.00,
  "Allegria Service":0.80,
  "Frisku Foods":0.90,
  "Osiris":1.00,
  "Integrity Farms":1.00,
  "Allpa Farms":0.50,
  "Allpa Farms Perú":0.26,
};

// Helpers de agregación
function sumRangeWF(arr, indices) {
  if(!arr || !indices) return 0;
  return indices.reduce((s,i)=>s+(Number(arr[i])||0), 0);
}
function findLineWF(emp, labelBuscado) {
  for(const sec of (emp.sections||[])) {
    for(const ln of (sec.lines||[])) {
      if(ln.label === labelBuscado) return {line:ln, signo:sec.signo};
    }
  }
  return null;
}
function sumCatWF(emp, cat, indices) {
  const sec = (emp.sections||[]).find(s=>s.cat===cat);
  if(!sec) return 0;
  return sec.lines.reduce((s,ln)=>s+sumRangeWF(ln.proy,indices), 0) * sec.signo;
}

// Saldo banco en USD por empresa (suma todas las monedas convertidas)
function getSaldoBancoUSD(saldosBancos, empNombre) {
  if(!saldosBancos) return 0;
  const HOY = new Date();
  const porCuenta = {};
  Object.entries(saldosBancos).forEach(([key, rec])=>{
    const parts = key.split("||");
    if(parts[0]!==empNombre) return;
    if(!rec?.monto || !rec?.fecha) return;
    const f = new Date(rec.fecha);
    if(f > HOY) return;
    const cuentaKey = `${parts[1]}||${parts[2]||rec.moneda||"usd"}`;
    const existente = porCuenta[cuentaKey];
    if(!existente || new Date(existente.fecha) < f) porCuenta[cuentaKey] = rec;
  });
  let total = 0;
  Object.values(porCuenta).forEach(rec=>{
    const moneda = rec.moneda || "usd";
    if(moneda === "usd") total += Number(rec.monto)||0;
    else if(rec.usd != null) total += Number(rec.usd)||0;
  });
  return total;
}

// Vista compacta: filas = empresas, columnas = meses
// Muestra dos sub-tablas: (1) Saldo acumulado por mes (2) Flujo neto mensual
// Destaca el mes con saldo mínimo del consolidado y qué empresa lo está generando
function MatrizMensualConsolidado({empresas, empNames, flujoPorEmp={}, acumPorEmp={}, saldoIniPorEmp={}}) {
  // Determinar rango de meses a mostrar: desde mes actual hasta junio 2027 (≈ 14 meses)
  // El usuario también puede ajustar el rango con selectores
  const HOY = new Date();
  const labelHoy = `${MN[HOY.getMonth()]}-${String(HOY.getFullYear()).slice(2)}`;
  const idxHoy = Math.max(0, MESES_65.indexOf(labelHoy));
  const [rangoMeses, setRangoMeses] = useState(14);
  const [vistaTabla, setVistaTabla] = useState("saldo"); // "saldo" | "flujo"

  const mesesIdx = [];
  for(let i = 0; i < rangoMeses; i++) {
    const idx = idxHoy + i;
    if(idx >= 0 && idx < MESES_65.length) mesesIdx.push(idx);
  }

  // Formato compacto: 1.25M, 45K, 123
  const fmtCompact = (v) => {
    if(v == null || isNaN(v) || v === 0) return "—";
    const abs = Math.abs(v);
    let str;
    if(abs >= 1000000) str = (abs/1000000).toFixed(2) + "M";
    else if(abs >= 1000) str = Math.round(abs/1000) + "K";
    else str = Math.round(abs).toString();
    return v < 0 ? `-${str}` : str;
  };

  // Display de mes en español
  const displayMes = (idx) => {
    const m = MESES_65[idx];
    if(!m) return "—";
    const map = {Jan:"Ene", Feb:"Feb", Mar:"Mar", Apr:"Abr", May:"May", Jun:"Jun",
      Jul:"Jul", Aug:"Ago", Sep:"Sep", Oct:"Oct", Nov:"Nov", Dec:"Dic"};
    const [mes, anio] = m.split("-");
    return `${map[mes]||mes} ${anio}`;
  };

  // Calcular saldo y flujo consolidado por mes
  const dataPorMes = mesesIdx.map(mi => {
    const fila = { mesIdx: mi, mes: displayMes(mi), saldoConsolidado: 0, flujoConsolidado: 0, porEmpresa: {} };
    let minEmp = null, minVal = Infinity;
    for(const empNombre of empNames) {
      const saldo = (acumPorEmp[empNombre] || [])[mi] || 0;
      const flujo = (flujoPorEmp[empNombre] || [])[mi] || 0;
      fila.porEmpresa[empNombre] = { saldo, flujo };
      fila.saldoConsolidado += saldo;
      fila.flujoConsolidado += flujo;
      if(saldo < minVal) { minVal = saldo; minEmp = empNombre; }
    }
    fila.empresaConMinSaldo = minEmp;
    fila.empresaConMinSaldoValor = minVal;
    return fila;
  });

  // Encontrar el mes con saldo consolidado mínimo (global del grupo)
  const minMesGlobal = dataPorMes.reduce((min, f) => f.saldoConsolidado < (min?.saldoConsolidado ?? Infinity) ? f : min, null);

  // Sumar flujo total por empresa en el rango
  const totalFlujoPorEmp = {};
  for(const empNombre of empNames) {
    totalFlujoPorEmp[empNombre] = mesesIdx.reduce((s, mi) => s + ((flujoPorEmp[empNombre] || [])[mi] || 0), 0);
  }

  const cellStyle = (v, isHighlight = false) => ({
    padding: "5px 7px",
    textAlign: "right",
    fontSize: 10,
    fontWeight: v !== 0 ? 600 : 400,
    color: v < 0 ? C.red : v > 0 ? C.green : C.text,
    background: isHighlight ? "#FEE2E2" : "transparent",
    borderRight: `1px solid ${C.border}22`,
    whiteSpace: "nowrap",
  });

  return (
    <Card>
      <div style={{display:"flex", gap:14, alignItems:"center", marginBottom:14, flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Mostrar</div>
          <div style={{display:"flex",gap:6}}>
            <Btn active={vistaTabla==="saldo"} onClick={()=>setVistaTabla("saldo")} color={C.accent}>💰 Saldo acumulado</Btn>
            <Btn active={vistaTabla==="flujo"} onClick={()=>setVistaTabla("flujo")} color={C.accent}>📈 Flujo neto mensual</Btn>
          </div>
        </div>
        <div>
          <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Horizonte</div>
          <div style={{display:"flex",gap:6}}>
            {[6, 12, 14, 24, 36].map(n => (
              <Btn key={n} small active={rangoMeses===n} onClick={()=>setRangoMeses(n)} color={C.muted}>{n}m</Btn>
            ))}
          </div>
        </div>
        {minMesGlobal && vistaTabla === "saldo" && (
          <div style={{flex:"1 1 250px", padding:"8px 14px", background:"#FEF2F2", border:`1px solid #FCA5A5`, borderRadius:8}}>
            <div style={{fontSize:9, fontWeight:700, color:C.red, textTransform:"uppercase", letterSpacing:0.5, marginBottom:2}}>Saldo consolidado mínimo del horizonte</div>
            <div style={{fontSize:13, fontWeight:800, color:C.red}}>
              {minMesGlobal.mes}: {$$(minMesGlobal.saldoConsolidado)}
            </div>
            <div style={{fontSize:10, color:C.muted, marginTop:2}}>
              Empresa que arrastra: <strong style={{color:C.text}}>{minMesGlobal.empresaConMinSaldo}</strong>
              {" "}({$$(minMesGlobal.empresaConMinSaldoValor)})
            </div>
          </div>
        )}
      </div>

      {/* Tabla matriz: filas = empresas, columnas = meses */}
      <div style={{overflowX:"auto", borderRadius:12, border:`1px solid ${C.border}`,minWidth:0,maxWidth:"calc(100vw - 80px)"}}>
        <table style={{borderCollapse:"collapse", fontSize:10, minWidth:600, width:"100%"}}>
          <thead>
            <tr style={{background:C.primary}}>
              <th style={{position:"sticky",left:0,background:C.bg2,padding:"8px 12px",textAlign:"left",fontSize:10,fontWeight:800,color:C.text,borderRight:`2px solid ${C.border2}`,borderBottom:`2px solid ${C.border2}`,zIndex:2,minWidth:160}}>
                Empresa
              </th>
              {mesesIdx.map((mi, ci) => (
                <th key={mi} style={{
                  padding:"8px 7px",textAlign:"right",fontSize:9,fontWeight:700,
                  color: minMesGlobal && minMesGlobal.mesIdx === mi && vistaTabla === "saldo" ? C.red : C.muted,
                  borderBottom:`2px solid ${C.border2}`,
                  background: minMesGlobal && minMesGlobal.mesIdx === mi && vistaTabla === "saldo" ? "#FEE2E2" : C.bg2,
                  whiteSpace:"nowrap",
                }}>
                  {displayMes(mi)}
                </th>
              ))}
              <th style={{padding:"8px 10px",textAlign:"right",fontSize:9,fontWeight:800,color:C.text,borderBottom:`2px solid ${C.border2}`,background:C.bg2,borderLeft:`2px solid ${C.border2}`}}>
                {vistaTabla === "saldo" ? "Mín. en horizonte" : "Σ Horizonte"}
              </th>
            </tr>
          </thead>
          <tbody>
            {empNames.map((n, ei) => {
              const emp = empresas[n];
              const minSaldoEmp = vistaTabla === "saldo"
                ? Math.min(...mesesIdx.map(mi => (acumPorEmp[n]||[])[mi] || 0))
                : totalFlujoPorEmp[n];
              return (
                <tr key={n} style={{borderBottom:`1px solid ${C.border}22`, background: ei % 2 === 0 ? C.card : C.bg2}}>
                  <td style={{position:"sticky",left:0,padding:"6px 12px",fontSize:11,fontWeight:700,color:emp?.color||C.text,background: ei % 2 === 0 ? C.card : C.bg2,borderRight:`2px solid ${C.border2}`,zIndex:1,whiteSpace:"nowrap"}}>
                    {emp?.emoji} {n}
                  </td>
                  {mesesIdx.map(mi => {
                    const v = vistaTabla === "saldo"
                      ? ((acumPorEmp[n]||[])[mi] || 0)
                      : ((flujoPorEmp[n]||[])[mi] || 0);
                    const isMinOfGroup = minMesGlobal && minMesGlobal.mesIdx === mi && minMesGlobal.empresaConMinSaldo === n && vistaTabla === "saldo";
                    return (
                      <td key={mi} style={cellStyle(v, isMinOfGroup)}>
                        {fmtCompact(v)}
                      </td>
                    );
                  })}
                  <td style={{padding:"6px 10px", textAlign:"right", fontSize:10, fontWeight:800,
                    color: minSaldoEmp < 0 ? C.red : C.green,
                    background: ei % 2 === 0 ? C.card : C.bg2, borderLeft:`2px solid ${C.border2}`}}>
                    {fmtCompact(minSaldoEmp)}
                  </td>
                </tr>
              );
            })}
            {/* Fila TOTAL consolidado */}
            <tr style={{background:C.primary, borderTop:`3px solid ${C.primary}`}}>
              <td style={{position:"sticky",left:0,padding:"9px 12px",fontSize:11,fontWeight:900,color:C.primaryText,background:C.primary,borderRight:`2px solid ${C.border2}`,zIndex:1}}>
                🏛 TOTAL GRUPO
              </td>
              {dataPorMes.map((f, ci) => {
                const v = vistaTabla === "saldo" ? f.saldoConsolidado : f.flujoConsolidado;
                const isMinGlobal = minMesGlobal && minMesGlobal.mesIdx === f.mesIdx && vistaTabla === "saldo";
                return (
                  <td key={f.mesIdx} style={{
                    padding:"9px 7px", textAlign:"right", fontSize:10, fontWeight:900,
                    color: v < 0 ? C.dangerBg : v > 0 ? C.successBg : C.primaryText,
                    background: isMinGlobal ? `${C.danger}55` : C.primary,
                    borderRight:`1px solid ${C.border2}44`,
                  }}>
                    {fmtCompact(v)}
                  </td>
                );
              })}
              <td style={{padding:"9px 10px", textAlign:"right", fontSize:11, fontWeight:900,
                color: (vistaTabla === "saldo" ? minMesGlobal?.saldoConsolidado : dataPorMes.reduce((s,f)=>s+f.flujoConsolidado,0)) < 0 ? C.dangerBg : C.successBg,
                background:C.primary, borderLeft:`2px solid ${C.border2}`}}>
                {fmtCompact(vistaTabla === "saldo"
                  ? (minMesGlobal?.saldoConsolidado || 0)
                  : dataPorMes.reduce((s,f)=>s+f.flujoConsolidado,0))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{marginTop:12, padding:"10px 14px", background:C.bg2, borderRadius:8, fontSize:10, color:C.muted, lineHeight:1.5}}>
        💡 <strong>Cómo leer esta vista:</strong>
        {" "}
        {vistaTabla === "saldo"
          ? <>Cada celda muestra el saldo acumulado de la empresa al cierre del mes. La columna del mes con menor saldo consolidado del grupo se resalta en rojo, y dentro de esa columna se destaca la celda de la empresa que más arrastra el resultado.</>
          : <>Cada celda muestra el flujo neto del mes (ingresos − egresos) para esa empresa. La última columna acumula el flujo de todo el horizonte. Útil para ver qué empresa aporta o resta caja cada mes.</>
        }
        {" "}Las cifras están en miles (K) o millones (M) USD.
      </div>
    </Card>
  );
}

function WaterfallConsolidado({empresas, saldosBancos, saldoIniPorEmp={}, acumPorEmp={}, flujoPorEmp={}}) {
  const empNames = Object.keys(empresas).filter(n => EMPRESAS_KEYS_CONSOLIDADO.includes(n));
  const [temporadaSel, setTemporadaSel] = useState(SEASONS[0]?.key || "");
  const [mostrarControladora, setMostrarControladora] = useState(true);

  const temporada = SEASONS.find(s=>s.key===temporadaSel) || SEASONS[0];
  const idx = temporada?.indices || [];

  // Índice del mes actual: el saldo banco es la posición real de hoy, la acumulación arranca aquí.
  const mesIdxHoy = useMemo(()=>{
    const H=new Date();
    const lb=`${MN[H.getMonth()]}-${String(H.getFullYear()).slice(2)}`;
    const ix=MESES_65.indexOf(lb);
    return ix>=0?ix:0;
  },[]);

  // Construir conceptos por empresa
  const datos = useMemo(()=>{
    const res = {};
    empNames.forEach(n=>{
      const emp = empresas[n];
      const firstIdx = idx[0];
      const lastIdx = idx[idx.length-1];

      // Ingresos Operacionales
      const ingresos = sumCatWF(emp, "ing_op", idx);
      // Egresos Operacionales = egr_var + egr_fijo
      const egresosOp = sumCatWF(emp, "egr_var", idx) + sumCatWF(emp, "egr_fijo", idx);
      // Impuestos
      const impuestos = sumCatWF(emp, "imp", idx);
      const fcOp = ingresos + egresosOp + impuestos;

      // Ingresos y Egresos No Operacionales
      const ingNop = sumCatWF(emp, "ing_nop", idx);
      const egrNop = sumCatWF(emp, "egr_nop", idx);

      // Desglose individual
      const callCap   = findLineWF(emp,"Capital Calls");
      const finInL    = findLineWF(emp,"Ingresos Financiamiento");
      const ingRenL   = findLineWF(emp,"Ingreso Renovación");
      const otrosINop = findLineWF(emp,"Otros Ingresos No Operacionales");
      const pagoPres  = findLineWF(emp,"Pago Préstamos - Total");
      const renovL    = findLineWF(emp,"Renovaciones");
      const aportesL  = findLineWF(emp,"Aportes de Capital");

      const callCapital    = callCap   ? sumRangeWF(callCap.line.proy,idx)   * callCap.signo   : 0;
      const financiamiento = finInL    ? sumRangeWF(finInL.line.proy,idx)    * finInL.signo    : 0;
      const dividendosRec  = ingRenL   ? sumRangeWF(ingRenL.line.proy,idx)   * ingRenL.signo   : 0;
      const otrosIngresosN = otrosINop ? sumRangeWF(otrosINop.line.proy,idx) * otrosINop.signo : 0;
      const pagoCreditos   = pagoPres  ? sumRangeWF(pagoPres.line.proy,idx)  * pagoPres.signo  : 0;
      const inversiones    = renovL    ? sumRangeWF(renovL.line.proy,idx)    * renovL.signo    : 0;
      const aportesCapital = aportesL  ? sumRangeWF(aportesL.line.proy,idx)  * aportesL.signo  : 0;

      const fcCapital = ingNop + egrNop;
      
      // Total: sumar directamente de flujoPorEmp para garantizar consistencia con el flujo
      const flujoArr = flujoPorEmp[n] || [];
      const total = idx.reduce((s,i) => s + (Number(flujoArr[i])||0), 0);
      
      // Saldo caja y final: la acumulación arranca en el mes actual (saldo banco = posición real de hoy),
      // no en el inicio del horizonte. Así no se doble-cuentan flujos de meses ya transcurridos.
      const saldoIni = saldoIniPorEmp[n] || 0;
      let acum = saldoIni;
      let saldoFinalCalc = saldoIni;
      for(let i = mesIdxHoy; i <= lastIdx; i++) {
        acum += (Number(flujoArr[i])||0);
        if(i === lastIdx) saldoFinalCalc = acum;
      }
      // Saldo caja: acumulado desde hoy hasta antes del primer mes de la temporada.
      let saldoCajaCalc = saldoIni;
      if(firstIdx > mesIdxHoy) {
        let a = saldoIni;
        for(let i = mesIdxHoy; i < firstIdx; i++) a += (Number(flujoArr[i])||0);
        saldoCajaCalc = a;
      }
      const saldoCaja = saldoCajaCalc;
      const saldoFinal = saldoFinalCalc;
      
      const participacion = PARTICIPACION_CONTROLADORA[n] ?? 1;

      res[n] = {
        saldoCaja, ingresos, egresosOp, impuestos, fcOp,
        callCapital, financiamiento, pagoCreditos, dividendosRec, otrosIngresosN,
        inversiones, aportesCapital,
        fcCapital, total, saldoFinal,
        participacionCtrl: saldoFinal * participacion,
      };
    });
    return res;
  }, [empresas, saldosBancos, idx, saldoIniPorEmp, acumPorEmp, flujoPorEmp, mesIdxHoy]); // eslint-disable-line

  // Totales consolidados (suma horizontal)
  const totales = useMemo(()=>{
    const keys = ["saldoCaja","ingresos","egresosOp","impuestos","fcOp","callCapital",
                  "financiamiento","pagoCreditos","dividendosRec","otrosIngresosN",
                  "inversiones","aportesCapital",
                  "fcCapital","total","saldoFinal","participacionCtrl"];
    const t = {};
    keys.forEach(k=>{
      t[k] = empNames.reduce((s,n)=>s+(datos[n]?.[k]||0), 0);
    });
    return t;
  }, [datos, empNames]);

  // Definir filas del waterfall
  const FILAS = [
    {key:"saldoCaja",      label:"Total Saldo Caja (USD)",  tipo:"saldo"},
    {key:"ingresos",       label:"Ingresos",                 tipo:"op"},
    {key:"egresosOp",      label:"Egresos Operacionales",    tipo:"op"},
    {key:"impuestos",      label:"Impuestos",                tipo:"op"},
    {key:"fcOp",           label:"Flujo Caja Operacional",   tipo:"subtotal"},
    {key:"callCapital",    label:"Call de Capital",          tipo:"cap"},
    {key:"financiamiento", label:"Financiamiento",           tipo:"cap"},
    {key:"pagoCreditos",   label:"Pago Créditos / Leasing / Hipotecarios", tipo:"cap"},
    {key:"dividendosRec",  label:"Dividendos Recibidos / Ingreso Renovación", tipo:"cap"},
    {key:"inversiones",    label:"Inversiones / Renovaciones", tipo:"cap"},
    {key:"aportesCapital", label:"Aportes de Capital",        tipo:"cap"},
    {key:"otrosIngresosN", label:"Otros Ingresos No Operacionales", tipo:"cap"},
    {key:"fcCapital",      label:"Flujo Caja Capital",        tipo:"subtotal"},
    {key:"total",          label:"Total Flujo del Período",   tipo:"total"},
    {key:"saldoFinal",     label:"Saldo Final Caja (USD)",    tipo:"saldoFinal"},
    {key:"participacionCtrl", label:"Participación Controladora", tipo:"controladora"},
  ];

  // Formato miles con signo
  function fmt(v) {
    if(v === 0 || v == null || isNaN(v)) return "—";
    const abs = Math.abs(Math.round(v));
    const s = v < 0 ? "-" : "";
    return `${s}${abs.toLocaleString("es-CL")}`;
  }

  // Color según tipo de fila y valor
  function colorFila(tipo, v) {
    if(tipo === "saldo") return C.text;
    if(tipo === "saldoFinal" || tipo === "controladora") return v < 0 ? C.red : C.text;
    if(tipo === "subtotal") return v >= 0 ? C.green : C.red;
    if(tipo === "total") return v >= 0 ? C.green : C.red;
    if(v === 0 || v == null) return C.text;
    return v >= 0 ? C.text : C.red;
  }
  
  // Formato con ⚠️ para saldo final negativo
  function fmtSaldo(v, tipo) {
    const base = fmt(v);
    if(tipo === "saldoFinal" && v < 0) return "⚠️ " + base;
    return base;
  }

  // Export Excel
  async function exportarExcel() {
    if(!window.JSZip) {
      await new Promise((res,rej)=>{
        const s=document.createElement("script");
        s.src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
        s.onload=res;s.onerror=rej;document.head.appendChild(s);
      });
    }
    const headers = ["Concepto", ...empNames, "Total Consolidado"];
    if(mostrarControladora) headers.push("Participación Controladora");
    const rows = FILAS.map(f=>{
      const row = [f.label];
      empNames.forEach(n=>{
        row.push(datos[n]?.[f.key]||0);
      });
      row.push(totales[f.key]||0);
      if(mostrarControladora) {
        if(f.key === "total") row.push(totales.participacionCtrl||0);
        else row.push("");
      }
      return row;
    });

    function colLetter(n){let s="";n++;while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);}return s;}
    function escXml(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}

    const nCols = headers.length;
    const lastCol = colLetter(nCols-1);
    let rowsXml = "";

    // Título
    rowsXml += `<row r="1" ht="28" customHeight="1"><c r="A1" t="inlineStr" s="5"><is><t>Flujo de Caja Consolidado — Grupo Mediterra</t></is></c></row>`;
    rowsXml += `<row r="2" ht="18" customHeight="1"><c r="A2" t="inlineStr" s="6"><is><t>${escXml(temporada.label)} · Exportado ${new Date().toLocaleDateString("es-CL")}</t></is></c></row>`;
    rowsXml += `<row r="3" ht="10" customHeight="1"></row>`;

    // Headers
    rowsXml += `<row r="4" ht="24" customHeight="1">`;
    headers.forEach((h,c)=>{rowsXml+=`<c r="${colLetter(c)}4" t="inlineStr" s="1"><is><t>${escXml(h)}</t></is></c>`;});
    rowsXml += `</row>`;

    // Data
    rows.forEach((row,ri)=>{
      const r = ri+5;
      const fila = FILAS[ri];
      const esSubtotal = fila.tipo==="subtotal";
      const esTotal = fila.tipo==="total";
      const esSaldo = fila.tipo==="saldo";
      rowsXml += `<row r="${r}" ht="20" customHeight="1">`;
      row.forEach((val,c)=>{
        const addr = `${colLetter(c)}${r}`;
        let estilo = 0; // normal
        if(c===0) {
          // Columna concepto
          if(esTotal) estilo = 8;           // bold + fondo total
          else if(esSubtotal) estilo = 7;   // bold + fondo subtotal
          else if(esSaldo) estilo = 9;      // bold + fondo saldo
          else estilo = 0;
        } else {
          // Columnas numéricas
          if(typeof val === "number") {
            if(esTotal) estilo = 12;
            else if(esSubtotal) estilo = 11;
            else if(esSaldo) estilo = 13;
            else estilo = 10;
          } else {
            estilo = 0;
          }
        }
        if(typeof val === "number" && val !== 0) {
          rowsXml += `<c r="${addr}" s="${estilo}"><v>${val}</v></c>`;
        } else {
          rowsXml += `<c r="${addr}" t="inlineStr" s="${estilo}"><is><t>${escXml(val)}</t></is></c>`;
        }
      });
      rowsXml += `</row>`;
    });

    const tableRef = `A4:${lastCol}${rows.length+4}`;
    const merges = [`A1:${lastCol}1`,`A2:${lastCol}2`];
    const mergesXml = `<mergeCells count="${merges.length}">${merges.map(m=>`<mergeCell ref="${m}"/>`).join("")}</mergeCells>`;

    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode='#,##0;[Red]-#,##0'/></numFmts>
  <fonts count="8">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><sz val="11"/><b/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font/><font/><font/>
    <font><sz val="16"/><b/><color rgb="FF0F2D4A"/><name val="Calibri"/></font>
    <font><sz val="11"/><i/><color rgb="FF64748B"/><name val="Calibri"/></font>
    <font><sz val="11"/><b/><color rgb="FF0F2D4A"/><name val="Calibri"/></font>
  </fonts>
  <fills count="6">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F2D4A"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFDBEAFE"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFE2E8F0"/></left><right style="thin"><color rgb="FFE2E8F0"/></right><top style="thin"><color rgb="FFE2E8F0"/></top><bottom style="thin"><color rgb="FFE2E8F0"/></bottom></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="14">
    <xf numFmtId="0"   fontId="0" fillId="0" borderId="1" xfId="0"><alignment vertical="center"/></xf>
    <xf numFmtId="0"   fontId="1" fillId="2" borderId="0" xfId="0"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf/><xf/><xf/>
    <xf numFmtId="0"   fontId="5" fillId="0" borderId="0" xfId="0"><alignment horizontal="left" vertical="center" indent="1"/></xf>
    <xf numFmtId="0"   fontId="6" fillId="0" borderId="0" xfId="0"><alignment horizontal="left" vertical="center" indent="1"/></xf>
    <xf numFmtId="0"   fontId="7" fillId="4" borderId="1" xfId="0"><alignment vertical="center"/></xf>
    <xf numFmtId="0"   fontId="7" fillId="5" borderId="1" xfId="0"><alignment vertical="center"/></xf>
    <xf numFmtId="0"   fontId="7" fillId="3" borderId="1" xfId="0"><alignment vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="7" fillId="4" borderId="1" xfId="0"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="7" fillId="5" borderId="1" xfId="0"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="7" fillId="3" borderId="1" xfId="0"><alignment horizontal="right" vertical="center"/></xf>
  </cellXfs>
</styleSheet>`;

    const colWidths = [38, ...empNames.map(()=>16), 18];
    if(mostrarControladora) colWidths.push(22);
    const colsXml = `<cols>${colWidths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join("")}</cols>`;

    const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="4" xSplit="1" topLeftCell="B5" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>
  ${colsXml}
  <sheetData>${rowsXml}</sheetData>
  ${mergesXml}
</worksheet>`;

    const wbXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView/></bookViews>
  <sheets><sheet name="Flujo Consolidado" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

    const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

    const pkgRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

    const zip = new window.JSZip();
    zip.file("[Content_Types].xml", contentTypes);
    zip.file("_rels/.rels", pkgRels);
    zip.file("xl/workbook.xml", wbXml);
    zip.file("xl/_rels/workbook.xml.rels", wbRels);
    zip.file("xl/worksheets/sheet1.xml", sheetXml);
    zip.file("xl/styles.xml", stylesXml);

    const blob = await zip.generateAsync({type:"blob"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Flujo_Consolidado_${temporada.key}_${new Date().toISOString().slice(0,10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    window.auditLog&&window.auditLog("exportar", {modulo:"finanzas", seccion:"Flujo Consolidado Waterfall",
      descripcion:`Exportó flujo consolidado waterfall — ${temporada.label}`});
  }

  return (
    <div>
      {/* Controles */}
      <Card>
        <div style={{display:"flex",gap:16,flexWrap:"wrap",alignItems:"flex-end"}}>
          <div>
            <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Temporada</div>
            <select value={temporadaSel} onChange={e=>setTemporadaSel(e.target.value)}
              style={{padding:"7px 12px",borderRadius:8,border:`1px solid ${C.border}`,
                background:C.card,color:C.text,fontSize:12,outline:"none",minWidth:180}}>
              {SEASONS.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <button onClick={exportarExcel}
            style={{marginLeft:"auto",padding:"8px 16px",borderRadius:8,background:C.teal,
              color:"#fff",border:"none",cursor:"pointer",fontSize:12,fontWeight:700}}>
            📥 Exportar Excel
          </button>
        </div>
      </Card>

      {/* Tabla Waterfall */}
      <div style={{overflowX:"auto",borderRadius:12,border:`1px solid ${C.border}`,marginTop:12,minWidth:0,maxWidth:"calc(100vw - 80px)"}}>
        <table style={{borderCollapse:"collapse",fontSize:11,width:"100%",minWidth:1000}}>
          <thead>
            <tr style={{background:C.primary}}>
              <th style={{padding:"10px 14px",textAlign:"left",color:C.muted,fontWeight:700,
                fontSize:10,textTransform:"uppercase",letterSpacing:0.5,position:"sticky",left:0,
                background:C.bg2,minWidth:240,zIndex:2}}>
                {temporada?.label || "—"}
              </th>
              {empNames.map(n=>(
                <th key={n} style={{padding:"10px 10px",textAlign:"right",color:C.muted,
                  fontWeight:700,fontSize:10,minWidth:105}}>
                  {n}
                  <div style={{fontSize:9,color:C.muted2,fontWeight:400,marginTop:2}}>
                    {empresas[n]?.emoji || ""} <span style={{color:C.teal}}>{Math.round((PARTICIPACION_CONTROLADORA[n]??1)*100)}%</span>
                  </div>
                </th>
              ))}
              <th style={{padding:"10px 14px",textAlign:"right",color:C.accentL,fontWeight:900,
                fontSize:10,minWidth:120}}>
                TOTAL
              </th>
            </tr>
          </thead>
          <tbody>
            {FILAS.map((f, i)=>{
              const isSaldo = f.tipo === "saldo";
              const isSaldoFinal = f.tipo === "saldoFinal";
              const isSubtotal = f.tipo === "subtotal";
              const isTotal = f.tipo === "total";
              const isCtrl = f.tipo === "controladora";
              const bg = (isSaldo||isSaldoFinal) ? `${C.blue}11`
                       : isTotal ? `${C.accent}22`
                       : isSubtotal ? `${C.green}11`
                       : isCtrl ? `${C.teal}15`
                       : i%2===0 ? "transparent" : `${C.border}08`;
              const fontWeight = (isSaldo||isSaldoFinal||isSubtotal||isTotal||isCtrl) ? 800 : 500;

              return (
                <tr key={f.key} style={{background:bg,borderBottom:`1px solid ${C.border}33`}}>
                  <td style={{padding:"8px 14px",position:"sticky",left:0,background:bg,
                    fontWeight, color:isCtrl?C.teal:(isSaldo||isSaldoFinal)?C.blue:isTotal?C.accent:isSubtotal?C.green:C.text,
                    fontSize:(isTotal||isSaldoFinal||isCtrl)?12:11,zIndex:1}}>
                    {f.label}{isCtrl&&<span style={{fontSize:9,color:C.muted,marginLeft:6}}>(% propiedad)</span>}
                  </td>
                  {empNames.map(n=>{
                    const v = datos[n]?.[f.key] || 0;
                    return (
                      <td key={n} style={{padding:"8px 10px",textAlign:"right",
                        color:colorFila(f.tipo,v),fontWeight,fontSize:11}}>
                        {fmtSaldo(v, f.tipo)}
                      </td>
                    );
                  })}
                  <td style={{padding:"8px 14px",textAlign:"right",
                    color:colorFila(f.tipo,totales[f.key]),fontWeight:900,
                    background:`${C.accent}11`,fontSize:(isTotal||isSaldoFinal)?12:11}}>
                    {fmtSaldo(totales[f.key], f.tipo)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{marginTop:10,fontSize:10,color:C.muted,fontStyle:"italic",padding:"0 4px"}}>
        💡 Cifras en USD · Valores positivos = ingresos / saldo · Valores negativos = egresos · Participación Controladora = Saldo Final × % de propiedad.
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// FLUJO POR EMPRESA — v2: totales mes/temporada + edición + saldo banco
// ═══════════════════════════════════════════════════════════════════
function FlujoEmpresa({empNombre,empresas,realData,onSaveReal,canEdit,saldosBancos,onSaveProy,subLines={},onSaveSubLines,addedLinesInit={},onSaveAddedLines,creditosData=CREDITOS_DEFAULT}) {
  const emp=empresas[empNombre];
  const [vista,setVista]=useState("mensual");
  const [openSeason,setOpenSeason]=useState({[SEASON_KEYS[0]]:true,[SEASON_KEYS[1]]:true});
  const [openMonth,setOpenMonth]=useState({});
  const [showReal,setShowReal]=useState(false);
  const [modalSem,setModalSem]=useState(null);
  // Overrides de proyección editados por el usuario: { lineLabel: { idx: valor | {_sem0,_sem1,_sem2,_sem3} } }
  const [proyOverrides,  setProyOverrides]  = useState({});
  const [expandedSubs,   setExpandedSubs]   = useState({});  // ▶ CxC / Préstamos
  const [addedLines,     setAddedLinesLocal]      = useState(addedLinesInit);  // persistido en Supabase
  // Wrapper que persiste en Supabase al cambiar addedLines
  const setAddedLines = useCallback((updater) => {
    setAddedLinesLocal(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if(onSaveAddedLines) onSaveAddedLines(next);
      return next;
    });
  },[onSaveAddedLines]);
  // Secciones colapsadas — por defecto todas colapsadas, usuario expande
  const [collapsedSections, setCollapsedSections] = useState(()=>{
    const o={};
    if(emp) emp.sections.forEach(s=>{o[s.cat]=true;});
    return o;
  });
  const toggleSection = cat => setCollapsedSections(p=>({...p,[cat]:!p[cat]}));
  // subLines viene de Supabase via prop — clientes/acreedores de CxC y Préstamos
  // addedLines es local — filas extra de concepto (se podrían persistir si se necesita)

  const toggleSeason=key=>setOpenSeason(p=>({...p,[key]:!p[key]}));
  const toggleMonth=mes=>setOpenMonth(p=>({...p,[mes]:!p[mes]}));
  const isMonthOpen=mes=>openMonth[mes]!==false;

  // ── Semana ISO actual (ej: "S16") ─────────────────────────────
  const semanaHoy = useMemo(()=>{
    const hoy = new Date();
    const jan1 = new Date(hoy.getFullYear(),0,4);
    const week = 1+Math.round(((hoy-jan1)/86400000-3+((jan1.getDay()+6)%7))/7);
    return `S${String(week).padStart(2,"0")}`;
  },[]);
  // Mes actual exacto ej "Apr-26" — evita mostrar saldo banco en años futuros con misma semana
  const mesHoyLabel = useMemo(()=>{
    const hoy = new Date();
    const mn=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${mn[hoy.getMonth()]}-${String(hoy.getFullYear()).slice(2)}`;
  },[]);
  // ── Saldo banco en USD: toma TODAS las monedas, convierte a USD ──
  // Para USD: usa el monto directo
  // Para otras monedas (PEN, CLP, EUR): usa el campo "usd" guardado en Supabase
  const saldoBancoUSD = useMemo(()=>{
    if(!saldosBancos) return null;
    const HOY = new Date();
    // Agrupar por banco+moneda (no solo banco) para no perder cuentas en distintas monedas
    const porCuenta = {};
    Object.entries(saldosBancos).forEach(([key, rec])=>{
      const parts = key.split("||");
      if(parts[0]!==empNombre) return;
      if(!rec?.monto || !rec?.fecha) return;
      const f = new Date(rec.fecha);
      if(f > HOY) return;
      // key único por banco+moneda
      const cuentaKey = `${parts[1]}||${parts[2]||rec.moneda||"usd"}`;
      const existente = porCuenta[cuentaKey];
      if(!existente || new Date(existente.fecha) < f) porCuenta[cuentaKey] = rec;
    });
    let total = 0, found = false;
    Object.values(porCuenta).forEach(rec=>{
      const moneda = rec.moneda || "usd";
      if(moneda === "usd") {
        total += Number(rec.monto)||0;
      } else if(rec.usd != null) {
        total += Number(rec.usd)||0;
      }
      found = true;
    });
    return found ? total : null;
  },[saldosBancos, empNombre]);

  // Mes en MESES_65 desde el cual arranca el saldo banco = mes ACTUAL (hoy)
  // El saldo banco (con fecha histórica) se aplica en la semana en curso, no en su fecha
  const mesIdxInicioSaldo = useMemo(()=>{
    const HOY = new Date();
    const anio = HOY.getFullYear();
    const mes = HOY.getMonth();
    const MN_LOCAL = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const label = `${MN_LOCAL[mes]}-${String(anio).slice(2)}`;
    const idx = MESES_65.indexOf(label);
    return idx >= 0 ? idx : 0;
  },[]);

  // Semana actual dentro del mes en curso (índice 0-3)
  // Usa semanaHoy + mesHoyLabel para ser consistente con la columna destacada
  const semIdxActual = useMemo(()=>{
    const sems = SEMANAS_MES[mesHoyLabel] || [];
    const idx = sems.indexOf(semanaHoy);
    return idx >= 0 ? idx : 0;
  },[mesHoyLabel, semanaHoy]);

  // ── Valor proyectado efectivo (base + override) ────────────────
  // Si override es objeto {_sem0,_sem1,_sem2,_sem3}: suma SOLO las semanas definidas por el usuario
  //   (las semanas no editadas son 0, el usuario tomó control del mes)
  // Si override es número: usa ese número como total del mes (retrocompatibilidad)
  // Si no hay override: usa el valor base de la fórmula/proyección
  const getProy = useCallback((lineLabel, idx) => {
    const ov = proyOverrides[lineLabel]?.[idx];
    // Obtener valor base
    let base = 0;
    for(const sec of emp.sections){
      const l = sec.lines.find(x=>x.label===lineLabel);
      if(l){ base = l.proy[idx]||0; break; }
    }
    if(ov === undefined) return base;
    if(typeof ov === "number") return ov;
    // ov es objeto con semanas: suma solo las semanas que el usuario ingresó
    if(typeof ov === "object" && ov !== null) {
      let total = 0;
      for(let s=0; s<4; s++){
        const k = `_sem${s}`;
        if(ov[k] !== undefined) total += Number(ov[k])||0;
      }
      return total;
    }
    return base;
  },[proyOverrides, emp]);

  // Valor proyectado específico de UNA semana (0-3) del mes idx
  // Lógica:
  // - Sin override: muestra el valor base COMPLETO en la primera semana del mes (0), resto en 0
  //   (los parámetros apuntan a un mes específico, no tiene sentido prorratear)
  // - Con override mensual antiguo (number): muestra en última semana
  // - Con override semanal (objeto): solo muestra lo que el usuario ingresó en esa semana específica
  const getProySemana = useCallback((lineLabel, idx, semIdx, isLastInMonth) => {
    const ov = proyOverrides[lineLabel]?.[idx];
    let base = 0;
    for(const sec of emp.sections){
      const l = sec.lines.find(x=>x.label===lineLabel);
      if(l){ base = l.proy[idx]||0; break; }
    }
    if(ov === undefined) {
      // Sin override: mostrar el valor base COMPLETO en la primera semana
      return semIdx === 0 ? base : 0;
    }
    if(typeof ov === "number") {
      // Override mensual antiguo: mostrar solo en última semana
      return isLastInMonth ? ov : 0;
    }
    if(typeof ov === "object" && ov !== null) {
      const k = `_sem${semIdx}`;
      // Solo el valor ingresado por el usuario en esa semana exacta
      return ov[k] !== undefined ? (Number(ov[k])||0) : 0;
    }
    return 0;
  },[proyOverrides, emp]);

  // ── Helpers para sumar subLines (CxC, Capital Calls, Aportes, etc) ─
  // Soporta formato nuevo "idx_semIdx" y formato antiguo "idx"
  const sumSubLinesMes = useCallback((lineLabel, idx) => {
    const list = subLines[lineLabel] || [];
    let total = 0;
    list.forEach(sl=>{
      if(typeof sl === "string") return;
      const vals = sl.vals || {};
      let hasSem = false;
      for(let s=0; s<4; s++){
        const k = `${idx}_${s}`;
        if(vals[k] !== undefined){ total += Number(vals[k])||0; hasSem = true; }
      }
      if(!hasSem && vals[idx] !== undefined) total += Number(vals[idx])||0;
    });
    return total;
  },[subLines]);

  const sumSubLinesSemana = useCallback((lineLabel, idx, semIdx, isLastInMonth) => {
    const list = subLines[lineLabel] || [];
    let total = 0;
    list.forEach(sl=>{
      if(typeof sl === "string") return;
      const vals = sl.vals || {};
      const kSem = `${idx}_${semIdx}`;
      if(vals[kSem] !== undefined) {
        total += Number(vals[kSem])||0;
      } else {
        // Retrocompatibilidad: si no hay valor por semana pero hay mensual antiguo, mostrar en última semana
        const hasAnySem = [0,1,2,3].some(s=>vals[`${idx}_${s}`]!==undefined);
        if(!hasAnySem && vals[idx] !== undefined && isLastInMonth) {
          total += Number(vals[idx])||0;
        }
      }
    });
    return total;
  },[subLines]);

  // Helper: total mensual de un AddedLine = valor mensual vals[idx] + suma de semanales vals["idx_s"]
  // Usado en subtotales por categoría para que coincida con el cálculo del flujo total (línea 4539)
  // Helper: total mensual de un AddedLine en un mes
  // Nueva lógica: si hay valores semanales cargados, EL MES = SUMA DE SEMANAS (ignora valor mensual)
  // Si NO hay valores semanales, fallback al valor mensual antiguo (retrocompatibilidad)
  const sumAddedLinesMes = useCallback((cat, idx) => {
    let total = 0;
    (addedLines[cat]||[]).forEach(al=>{
      if(typeof al === "string") return;
      const vals = al.vals || {};
      // ¿Hay alguna semana cargada para este mes?
      const sumSemanas = [0,1,2,3].reduce((s, semIdx) => {
        const v = vals[`${idx}_${semIdx}`];
        return s + (v !== undefined ? (Number(v) || 0) : 0);
      }, 0);
      const hasAnySem = [0,1,2,3].some(s => vals[`${idx}_${s}`] !== undefined);
      if(hasAnySem) {
        // Las semanas mandan: el mes es la suma de sus semanas
        total += sumSemanas;
      } else {
        // No hay semanas: usar el valor mensual antiguo (retrocompatibilidad)
        total += Number(vals[idx]) || 0;
      }
    });
    return total;
  },[addedLines]);

  // Helper: valor semanal de un AddedLine en una semana específica
  const sumAddedLinesSemana = useCallback((cat, idx, semIdx) => {
    let total = 0;
    (addedLines[cat]||[]).forEach(al=>{
      if(typeof al === "string") return;
      const vals = al.vals || {};
      // Solo el valor semanal exacto
      const v = vals[`${idx}_${semIdx}`];
      if(v !== undefined) {
        total += Number(v) || 0;
      } else {
        // Si no hay semanas y sí mensual, atribuir todo a S1 (retrocompatibilidad)
        const hasAnySem = [0,1,2,3].some(s => vals[`${idx}_${s}`] !== undefined);
        if(!hasAnySem && semIdx === 0 && vals[idx] !== undefined) {
          total += Number(vals[idx]) || 0;
        }
      }
    });
    return total;
  },[addedLines]);

  // Guardar override semanal (o mensual si semIdx no se especifica)
  const handleEditProy = useCallback((lineLabel, idx, nuevoVal, semIdx) => {
    setProyOverrides(prev=>{
      const next = JSON.parse(JSON.stringify(prev));
      if(!next[lineLabel]) next[lineLabel]={};
      if(semIdx != null) {
        // Override semanal: mantener objeto con claves _sem0.._sem3
        const current = next[lineLabel][idx];
        if(typeof current === "object" && current !== null) {
          next[lineLabel][idx] = { ...current, [`_sem${semIdx}`]: nuevoVal };
        } else {
          // Si había un número (override mensual antiguo) o nada, crear objeto
          next[lineLabel][idx] = { [`_sem${semIdx}`]: nuevoVal };
        }
      } else {
        // Override mensual directo (vista mensual)
        next[lineLabel][idx] = nuevoVal;
      }
      // Persistir async
      if(onSaveProy) onSaveProy(empNombre, lineLabel, idx, next[lineLabel][idx]);
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
      emp.sections.forEach(sec=>{
        sec.lines.forEach(l=>{
          // Usar getProy que maneja tanto overrides mensuales como objeto por semanas
          const v = getProy(l.label, i);
          f += v * sec.signo;
          // Include subLines (CxC/Préstamos sub-items) in flujo
          if(l.subLines)(subLines[l.label]||[]).forEach(sl=>{
            if(typeof sl === "string") return;
            const vals = sl.vals || {};
            // Sumar formato nuevo (idx_semIdx) + formato antiguo (idx como número)
            let sv = 0;
            let hasSem = false;
            for(let s=0; s<4; s++){
              const k = `${i}_${s}`;
              if(vals[k] !== undefined){ sv += Number(vals[k])||0; hasSem = true; }
            }
            if(!hasSem && vals[i] !== undefined) sv = Number(vals[i])||0;
            f += sv * sec.signo;
          });
        });
        // Include user-added lines in flujo
        // Nueva lógica: si hay valores semanales cargados, semanas mandan. Si no, fallback mensual.
        (addedLines[sec.cat]||[]).forEach(al=>{
          if(typeof al==="string") return;
          const v = al.vals||{};
          const hasAnySem = [0,1,2,3].some(s => v[`${i}_${s}`] !== undefined);
          let av = 0;
          if(hasAnySem) {
            for(let s=0; s<4; s++){
              const k = `${i}_${s}`;
              if(v[k] !== undefined) av += Number(v[k])||0;
            }
          } else {
            av = Number(v[i])||0;
          }
          f += av * sec.signo;
        });
      });
      return f;
    });
    let a = saldoIni;
    const aa = fa.map((f,i)=>{
      // Antes del mes del saldo banco: no acumular (mes pasado, sin valor de saldo)
      if(i < mesIdxInicioSaldo) return null;
      // Desde el mes del saldo banco: arrancar con saldo y acumular
      if(i === mesIdxInicioSaldo) { a = saldoIni + f; return a; }
      a += f;
      return a;
    });
    return {flujoArr:fa, acumArr:aa};
  },[emp, proyOverrides, saldoBancoUSD, mesIdxInicioSaldo, addedLines, subLines, getProy]); // eslint-disable-line

  // Flujo neto de UNA semana (suma todas las líneas base + sublines + addedLines)
  const flujoNetoPorSemana = useCallback((mesIdx, semIdx) => {
    const isLast = semIdx === 3;
    let f = 0;
    emp.sections.forEach(sec => {
      sec.lines.forEach(l => {
        f += getProySemana(l.label, mesIdx, semIdx, isLast) * sec.signo;
        if (l.subLines) f += sumSubLinesSemana(l.label, mesIdx, semIdx, isLast) * sec.signo;
      });
      f += sumAddedLinesSemana(sec.cat, mesIdx, semIdx) * sec.signo;
    });
    return f;
  },[emp, getProySemana, sumSubLinesSemana, sumAddedLinesSemana]); // eslint-disable-line

  // Saldo acumulado al cierre de una semana específica (para vista semanal)
  // - Semanas pasadas del mes actual → null (no acumular)
  // - Semana actual → saldoIni + flujo de esa semana
  // - Semanas futuras del mes actual → acumulativo desde semIdxActual
  // - Meses siguientes → arranca desde acumArr[mesIdx-1] (consistente con vista mensual)
  const getAcumSemana = useCallback((mesIdx, semIdx) => {
    if (mesIdx < mesIdxInicioSaldo) return null;
    if (mesIdx === mesIdxInicioSaldo && semIdx < semIdxActual) return null;
    const sIni = saldoBancoUSD != null ? saldoBancoUSD : emp.saldo_ini;
    let startVal, startSem;
    if (mesIdx === mesIdxInicioSaldo) {
      startVal = sIni;
      startSem = semIdxActual;
    } else {
      startVal = acumArr[mesIdx - 1] ?? sIni;
      startSem = 0;
    }
    let a = startVal;
    for (let s = startSem; s <= semIdx; s++) a += flujoNetoPorSemana(mesIdx, s);
    return a;
  },[mesIdxInicioSaldo, semIdxActual, saldoBancoUSD, emp, acumArr, flujoNetoPorSemana]); // eslint-disable-line

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
            cols.push({type:"week",mes:m,semana:sw,idx:mIdx(m),nSems,semIdx:si,
              label:sw,isFirstInSeason:mi===0&&si===0,isFirstInMonth:si===0,
              isLastInMonth:si===sems.length-1});
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
      <div style={{overflowX:"auto",overflowY:"auto",maxHeight:"80vh",borderRadius:12,border:`1px solid ${C.border}`,position:"relative",minWidth:0,maxWidth:"calc(100vw - 80px)"}}>
        <table style={{borderCollapse:"separate",borderSpacing:0,fontSize:11,minWidth:600}}>
          <thead style={{position:"sticky",top:0,zIndex:5}}>
            {/* Fila 1: temporadas */}
            <tr style={{background:C.bg}}>
              <th style={{padding:"8px 14px",textAlign:"left",color:C.muted,fontSize:10,
                position:"sticky",left:0,background:C.bg,zIndex:6,minWidth:210,
                borderRight:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`}}>
                Línea {canEdit&&<span style={{fontSize:8,color:C.accentL,marginLeft:4}}>✏️ editable</span>}
              </th>
              {colStructure.map(({season:s,collapsed,cols})=>{
                const span=collapsed?1:Math.max(cols.length,1);
                return (
                  <th key={s.key} colSpan={span} onClick={()=>toggleSeason(s.key)}
                    style={{padding:"7px 10px",textAlign:"center",
                      background:!collapsed?C.card:C.bg,
                      borderLeft:`2px solid ${C.border2}`,cursor:"pointer",
                      borderBottom:`1px solid ${C.border}`,
                      fontSize:10,fontWeight:700,color:C.text,whiteSpace:"nowrap"}}>
                    {!collapsed?"▾":"▸"} {s.label}
                  </th>
                );
              })}
            </tr>
            {/* Fila 2 (semanal): headers de mes */}
            {vista==="semanal"&&(
              <tr style={{background:C.primary}}>
                <th style={{position:"sticky",left:0,background:C.bg2,zIndex:6,borderRight:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`}}/>
                {colStructure.map(({season:s,collapsed,cols})=>{
                  if(collapsed) return <th key={s.key} style={{borderLeft:`2px solid ${C.border2}`,background:C.bg2,borderBottom:`1px solid ${C.border}`}}/>;
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
                        borderBottom:`1px solid ${C.border}`,
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
              <th style={{position:"sticky",left:0,background:C.bg,zIndex:6,borderRight:`1px solid ${C.border}`,borderBottom:`2px solid ${C.border2}`}}/>
              {colStructure.map(({season:s,collapsed,cols})=>{
                if(collapsed) return (
                  <th key={s.key} style={{padding:"4px 8px",color:C.muted,fontSize:9,
                    borderLeft:`2px solid ${C.border2}`,textAlign:"center",background:C.bg,borderBottom:`2px solid ${C.border2}`}}>
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
                        borderBottom:`2px solid ${C.border2}`,
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
                    ? `${mesHoyLabel} ${semanaHoy} · desde Saldos Bancos`
                    : `sin saldo registrado`}
                </div>
              </td>
              {colStructure.map(({season:s,collapsed,cols})=>{
                if(collapsed) return (
                  <td key={s.key} style={{padding:"7px 8px",textAlign:"right",
                    fontSize:11,color:C.blue,borderLeft:`2px solid ${C.border2}`}}>
                    {""}
                  </td>
                );
                return cols.map((col,ci)=>{
                  const isFirst=col.isFirstInSeason||col.isFirstInMonth;
                  // Mostrar saldo solo en la semana actual (semanaHoy)
                  // Vista mensual: mostrar en el mes que contiene la semana actual
                  // Vista semanal: mostrar solo en la columna de la semana actual
                  // Comparar mes exacto (incluyendo año) para no repetir en años futuros
                  const esMesActual = col.type==="month" && col.mes===mesHoyLabel;
                  const esSemActual = col.type==="week" && col.semana===semanaHoy && col.mes===mesHoyLabel;
                  const esMesColapsado = col.type==="month_collapsed" && col.mes===mesHoyLabel;
                  const mostrar = (vista==="mensual" && esMesActual) ||
                                  (vista==="semanal" && (esSemActual||esMesColapsado));
                  return (
                    <td key={`banco-${col.mes}-${ci}`}
                      style={{padding:"6px 5px",textAlign:"right",fontWeight:700,
                        fontSize:9,color:C.blue,
                        background:mostrar?`${C.blue}20`:`${C.blue}08`,
                        borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:isFirst?`1px solid ${C.border}44`:`1px solid ${C.border}11`}}>
                      {mostrar && saldoBancoUSD!=null ? $$(saldoBancoUSD) : ""}
                    </td>
                  );
                });
              })}
            </tr>

            {/* SECCIONES Y LÍNEAS ───────────────────────────────── */}
            {emp.sections.map(sec=>{
              const isCollapsed = collapsedSections[sec.cat];
              return (
              <React.Fragment key={sec.cat}>
                {/* Header sección — clickeable para expandir/colapsar */}
                <tr style={{background:`${C.bg}cc`,cursor:"pointer"}}
                  onClick={()=>toggleSection(sec.cat)}>
                  <td style={{padding:"5px 14px",position:"sticky",left:0,
                    background:C.bg,borderRight:`1px solid ${C.border}`,zIndex:1}}>
                    <span style={{fontSize:10,fontWeight:700,color:CAT_COLOR[sec.cat]||C.muted,
                      textTransform:"uppercase",letterSpacing:"0.5px",display:"flex",alignItems:"center",gap:6}}>
                      <span style={{fontSize:9,transition:"transform 0.15s",display:"inline-block",
                        transform:isCollapsed?"rotate(0deg)":"rotate(90deg)"}}>▶</span>
                      {CAT_SIGNO[sec.cat]} {sec.label}
                      {isCollapsed&&<span style={{fontSize:8,color:C.muted,fontWeight:400,textTransform:"none",letterSpacing:0,marginLeft:4}}>({sec.lines.filter(l=>!l.label.startsWith("  ")).length} líneas)</span>}
                    </span>
                  </td>
                  {colStructure.map(({season:s,collapsed:sColl,cols})=>{
                    if(!isCollapsed){
                      const span=sColl?1:Math.max(cols.length,1);
                      return <td key={s.key} colSpan={span}
                        style={{borderLeft:`2px solid ${C.border2}`,background:C.bg}}/>;
                    }
                    // Colapsado: mostrar subtotal inline en el header
                    if(sColl){
                      const total=s.indices.reduce((a,i)=>{
                        return a + sec.lines.reduce((b,l)=>{
                          if(l.label.startsWith("  ")) return b;
                          const subSum = l.subLines ? sumSubLinesMes(l.label, i) : 0;
                          return b + getProy(l.label,i) + subSum;
                        },0) + sumAddedLinesMes(sec.cat, i);
                      },0);
                      return (
                        <td key={s.key} style={{padding:"5px 8px",textAlign:"right",fontWeight:800,
                          color:CAT_COLOR[sec.cat],fontSize:10,borderLeft:`2px solid ${C.border2}`,background:C.bg}}>
                          {total!==0?$$(total):"—"}
                        </td>
                      );
                    }
                    return cols.map((col,ci)=>{
                      let v=0;
                      if(col.type==="month"||col.type==="month_collapsed"||col.isTotalMes){
                        v = sec.lines.reduce((a,l)=>{
                          if(l.label.startsWith("  ")) return a;
                          const subSum = l.subLines ? sumSubLinesMes(l.label, col.idx) : 0;
                          return a + getProy(l.label,col.idx) + subSum;
                        },0) + sumAddedLinesMes(sec.cat, col.idx);
                      } else if(col.type==="week"){
                        v = sec.lines.reduce((a,l)=>{
                          if(l.label.startsWith("  ")) return a;
                          const propSem = getProySemana(l.label, col.idx, col.semIdx, col.isLastInMonth);
                          const subSem = l.subLines
                            ? sumSubLinesSemana(l.label, col.idx, col.semIdx, col.isLastInMonth) : 0;
                          return a + propSem + subSem;
                        },0) + sumAddedLinesSemana(sec.cat, col.idx, col.semIdx);
                      }
                      return (
                        <td key={col.key} style={{padding:"5px 5px",textAlign:"right",fontWeight:700,fontSize:9,
                          color:CAT_COLOR[sec.cat]||C.muted,
                          borderLeft:ci===0?`2px solid ${C.border2}`:`1px solid ${C.border}22`,
                          background:C.bg}}>
                          {v!==0?$$(v):"—"}
                        </td>
                      );
                    });
                  })}
                </tr>

                {/* Líneas editables — solo si NO está colapsado */}
                {!isCollapsed && sec.lines.map(line=>{
                  // Indented sub-lines (  Banco X) always visible — they show breakdown of Pago Préstamos
                  return (
                  <React.Fragment key={line.label}>
                  <tr style={{borderBottom:`1px solid ${C.border}11`}}>
                    <td style={{padding:"5px 14px",color:line.formula?C.yellow:C.text,fontSize:11,
                      position:"sticky",left:0,background:C.card,zIndex:1,
                      borderRight:`1px solid ${C.border}`,whiteSpace:"nowrap",
                      maxWidth:240,overflow:"hidden",textOverflow:"ellipsis"}}>
                      <div style={{display:"flex",alignItems:"center",gap:3}}>
                        {line.formula&&<span style={{fontSize:9}}>⚡</span>}
                        {proyOverrides[line.label]&&<span style={{fontSize:8,color:C.accentL}} title="Editado">●</span>}
                        {line.subLines&&(
                          <button onClick={()=>setExpandedSubs(p=>({...p,[line.label]:!p[line.label]}))}
                            style={{background:"none",border:"none",cursor:"pointer",padding:"0 1px",
                              color:C.blue,fontSize:9,fontWeight:700,flexShrink:0}}>
                            {expandedSubs[line.label]?"▼":"▶"}
                          </button>
                        )}
                        <span style={{paddingLeft:line.label.startsWith("  ")?10:0}}>{line.label.trim()}</span>
                      </div>
                      {line.subLines&&expandedSubs[line.label]&&canEdit&&(
                        <div style={{marginTop:3,paddingLeft:14}}>
                          <button onClick={()=>{
                            const isAportes=line.label==="Aportes de Capital";
                            const isFin=line.label.includes("Financiamiento")||line.label.includes("Crédito")||line.label==="Capital Calls";
                            const msg=isAportes?"Empresa que recibe el aporte:"
                              :isFin?"Institución / detalle:"
                              :line.label.includes("Cobrar")?"Nombre del cliente:":"Nombre del acreedor:";
                            const n=prompt(msg);
                            if(!n?.trim())return;
                            const cur=subLines[line.label]||[];
                            if(onSaveSubLines) onSaveSubLines(line.label,[...cur,{label:n.trim(),vals:{}}]);
                          }} style={{fontSize:9,color:C.blue,background:"none",border:`1px dashed ${C.blue}44`,
                            borderRadius:4,padding:"2px 8px",cursor:"pointer"}}>
                            {line.label==="Aportes de Capital"?"+ agregar empresa"
                             :line.label.includes("Financiamiento")||line.label.includes("Crédito")||line.label==="Capital Calls"?"+ agregar institución"
                             :line.label.includes("Cobrar")?"+ agregar cliente":"+ agregar acreedor"}
                          </button>
                        </div>
                      )}
                    </td>
                    {colStructure.map(({season:s,collapsed,cols})=>{
                      if(collapsed){
                        // Total temporada incluye valor base + sublines (consolidado en la fila padre)
                        const total=s.indices.reduce((a,i)=>{
                          const v = getProy(line.label, i);
                          const sub = line.subLines ? sumSubLinesMes(line.label, i) : 0;
                          return a + v + sub;
                        },0);
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
                        const valMesProp=getProy(line.label,col.idx);
                        // Si la línea tiene subLines, mostrar el valor consolidado (padre + sublineas)
                        // Esto aplica a TODAS las líneas con subLines, incluyendo Pago Préstamos y Renovaciones
                        const sumSubMes = line.subLines ? sumSubLinesMes(line.label, col.idx) : 0;
                        const valMes = valMesProp + sumSubMes;
                        // Show full monthly value: on monthly view always
                        // For Pago Préstamos: use exact semana of vencimiento in weekly view
                        let val;
                        if(isTot||col.type==="month"||col.type==="month_collapsed"){
                          val=valMes;
                        } else if(line.formula&&line.label.includes("Préstamos")&&col.type==="week"){
                          const semMap=calcPrestamosSemanasEmpresa(empNombre, creditosData);
                          val=(semMap[col.mes]?.[col.semana])||0;
                        } else if(col.type==="week") {
                          // Cada semana tiene su propio valor independiente
                          const propValSem = getProySemana(line.label, col.idx, col.semIdx, col.isLastInMonth);
                          // Sublines de TODAS las líneas (incluyendo Préstamos) suman al valor del padre
                          const subValSem = line.subLines
                            ? sumSubLinesSemana(line.label, col.idx, col.semIdx, col.isLastInMonth) : 0;
                          val = propValSem + subValSem;
                        } else {
                          val=col.isLastInMonth?valMes:0;
                        }
                        const real=vista==="mensual"?(realMensual[col.mes]?.[line.label]||null):null;
                        const isFirst=col.isFirstInSeason||col.isFirstInMonth;
                        // Permite editar líneas con fórmula SOLO si el mes pertenece a la temporada actual 2025-2026
                        const esTemporadaActual = SEASONS[0]?.indices?.includes(col.idx);
                        const formulaBloquea = line.formula && !esTemporadaActual;
                        const isEditable=canEdit && !formulaBloquea && !isTot && col.type!=="month_collapsed";
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
                                canEdit={canEdit && !formulaBloquea}
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
                                  // Guardar valor para esa semana específica (no se prorratea, no se distribuye)
                                  handleEditProy(line.label, col.idx, v, col.semIdx);
                                }}
                              />
                            )}
                          </td>
                        );
                      });
                    })}
                  </tr>
                  {/* SubLines: clientes/acreedores con montos por mes */}
                  {/* For Pago Préstamos: auto-generate rows from calcPrestamosDesglose */}
                  {line.subLines&&expandedSubs[line.label]&&line.label.includes("Préstamos")&&(()=>{
                    const desglose      = calcPrestamosDesglose(empNombre, creditosData);
                    const desgloseSemsn = calcPrestamosDesgloseSemanasEmpresa(empNombre, creditosData);
                    return Object.entries(desglose).map(([acreedor, proyArr])=>{
                      const semMap = desgloseSemsn[acreedor]||{};
                      return (
                      <tr key={`prest-${acreedor}`} style={{borderBottom:`1px solid ${C.border}11`,background:`${C.red}06`}}>
                        <td style={{padding:"4px 14px 4px 28px",fontSize:10,position:"sticky",left:0,
                          background:`${C.red}06`,zIndex:1,borderRight:`1px solid ${C.border}`,color:C.muted}}>
                          <div style={{display:"flex",alignItems:"center",gap:4}}>
                            <span style={{color:C.red,fontSize:9}}>↳</span>
                            <span style={{fontWeight:600}}>{acreedor}</span>
                          </div>
                        </td>
                        {colStructure.map(({season:s,collapsed,cols})=>{
                          if(collapsed){
                            const tot=s.indices.reduce((a,i)=>a+(proyArr[i]||0),0);
                            return <td key={s.key} style={{padding:"4px 6px",textAlign:"right",fontSize:9,
                              color:tot?C.red:C.muted2,fontWeight:tot?700:400,
                              borderLeft:`2px solid ${C.border2}`}}>{tot?$$(tot):"—"}</td>;
                          }
                          return cols.map((col,ci)=>{
                            const isTot=col.isTotalMes;
                            // Vista mensual: usar proy mensual
                            // Vista semanal: usar semana exacta de vencimiento
                            let disp=0;
                            if(isTot||col.type==="month"||col.type==="month_collapsed"){
                              disp=proyArr[col.idx]||0;
                            } else if(col.type==="week"&&col.mes&&col.semana){
                              disp=(semMap[col.mes]?.[col.semana])||0;
                            }
                            const isFirst=col.isFirstInSeason||col.isFirstInMonth;
                            return (
                              <td key={`pr-${acreedor}-${col.mes||""}-${ci}`}
                                style={{padding:"4px 5px",textAlign:"right",fontSize:9,
                                  background:isTot?`${C.yellow}12`:`${C.red}06`,
                                  borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:isFirst?`1px solid ${C.border}44`:`1px solid ${C.border}11`}}>
                                <span style={{color:disp?C.red:C.muted2,fontWeight:disp?700:400}}>
                                  {disp?$$(disp):"—"}
                                </span>
                              </td>
                            );
                          });
                        })}
                      </tr>
                      );
                    });
                  })()}
                  {/* Renovaciones sub-rows */}
                  {line.subLines&&expandedSubs[line.label]&&line.label==="Renovaciones"&&(()=>{
                    const desgloseRen = calcRenovacionesDesglose(empNombre, creditosData);
                    return Object.entries(desgloseRen).map(([acreedor, proyArr])=>(
                      <tr key={`ren-${acreedor}`} style={{borderBottom:`1px solid ${C.border}11`,background:`${C.orange}06`}}>
                        <td style={{padding:"4px 14px 4px 28px",fontSize:10,position:"sticky",left:0,
                          background:`${C.orange}06`,zIndex:1,borderRight:`1px solid ${C.border}`,color:C.muted}}>
                          <div style={{display:"flex",alignItems:"center",gap:4}}>
                            <span style={{color:C.orange,fontSize:9}}>↺</span>
                            <span style={{fontWeight:600}}>{acreedor}</span>
                          </div>
                        </td>
                        {colStructure.map(({season:s,collapsed,cols})=>{
                          if(collapsed){
                            const tot=s.indices.reduce((a,i)=>a+(proyArr[i]||0),0);
                            return <td key={s.key} style={{padding:"4px 6px",textAlign:"right",fontSize:9,
                              color:tot?C.orange:C.muted2,fontWeight:tot?700:400,
                              borderLeft:`2px solid ${C.border2}`}}>{tot?$$(tot):"—"}</td>;
                          }
                          return cols.map((col,ci)=>{
                            const raw=proyArr[col.idx]||0;
                            const disp=col.isTotalMes||col.type==="month"||col.type==="month_collapsed"||col.isLastInMonth?raw:0;
                            const isFirst=col.isFirstInSeason||col.isFirstInMonth;
                            return (
                              <td key={`ren-${acreedor}-${col.mes||""}-${ci}`}
                                style={{padding:"4px 5px",textAlign:"right",fontSize:9,
                                  background:col.isTotalMes?`${C.yellow}12`:`${C.orange}06`,
                                  borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:isFirst?`1px solid ${C.border}44`:`1px solid ${C.border}11`}}>
                                <span style={{color:disp?C.orange:C.muted2,fontWeight:disp?700:400}}>
                                  {disp?$$(disp):"—"}
                                </span>
                              </td>
                            );
                          });
                        })}
                      </tr>
                    ));
                  })()}
                  {/* Ingreso Renovación sub-rows */}
                  {line.subLines&&expandedSubs[line.label]&&line.label==="Ingreso Renovación"&&(()=>{
                    const desgloseIng = calcIngresoRenovacionDesglose(empNombre, creditosData);
                    return Object.entries(desgloseIng).map(([acreedor, proyArr])=>(
                      <tr key={`ingr-${acreedor}`} style={{borderBottom:`1px solid ${C.border}11`,background:`${C.blue}06`}}>
                        <td style={{padding:"4px 14px 4px 28px",fontSize:10,position:"sticky",left:0,
                          background:`${C.blue}06`,zIndex:1,borderRight:`1px solid ${C.border}`,color:C.muted}}>
                          <div style={{display:"flex",alignItems:"center",gap:4}}>
                            <span style={{color:C.blue,fontSize:9}}>↺</span>
                            <span style={{fontWeight:600}}>{acreedor}</span>
                          </div>
                        </td>
                        {colStructure.map(({season:s,collapsed,cols})=>{
                          if(collapsed){
                            const tot=s.indices.reduce((a,i)=>a+(proyArr[i]||0),0);
                            return <td key={s.key} style={{padding:"4px 6px",textAlign:"right",fontSize:9,
                              color:tot?C.blue:C.muted2,fontWeight:tot?700:400,
                              borderLeft:`2px solid ${C.border2}`}}>{tot?$$(tot):"—"}</td>;
                          }
                          return cols.map((col,ci)=>{
                            const raw=proyArr[col.idx]||0;
                            const disp=col.isTotalMes||col.type==="month"||col.type==="month_collapsed"||col.isLastInMonth?raw:0;
                            const isFirst=col.isFirstInSeason||col.isFirstInMonth;
                            return (
                              <td key={`ingr-${acreedor}-${col.mes||""}-${ci}`}
                                style={{padding:"4px 5px",textAlign:"right",fontSize:9,
                                  background:col.isTotalMes?`${C.yellow}12`:`${C.blue}06`,
                                  borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:isFirst?`1px solid ${C.border}44`:`1px solid ${C.border}11`}}>
                                <span style={{color:disp?C.blue:C.muted2,fontWeight:disp?700:400}}>
                                  {disp?$$(disp):"—"}
                                </span>
                              </td>
                            );
                          });
                        })}
                      </tr>
                    ));
                  })()}
                  {/* For CxC/Capital Calls: use saved subLines from Supabase */}
                  {/* Sub-líneas MANUALES (editables). Para Pago Préstamos se muestran ADEMÁS del
                      desglose auto de Créditos; suman sobre el total (cuotas no registradas en Créditos). */}
                  {line.subLines&&expandedSubs[line.label]&&(subLines[line.label]||[]).map((sl,sli)=>{
                    const slLabel=typeof sl==="string"?sl:sl.label;
                    const slVals =typeof sl==="string"?{}:(sl.vals||{});
                    // Guarda un valor: lee siempre del estado actual de subLines para evitar closures stale
                    const updSlVal=(idx,v,semIdx)=>{
                      if(onSaveSubLines) {
                        // Leer el estado ACTUAL de subLines (no el closure)
                        const currentList = subLines[line.label] || [];
                        const currentSl = currentList[sli];
                        const currentVals = (typeof currentSl === "string" ? {} : (currentSl?.vals || {}));
                        const newVals = {...currentVals};
                        
                        if(semIdx != null) {
                          // Editando una semana específica
                          const key = `${idx}_${semIdx}`;
                          if(v === 0 || v === "") delete newVals[key];
                          else newVals[key] = v;
                        } else {
                          // Editando a nivel de mes — limpiar todas las keys de semana de este mes
                          for(let s=0; s<5; s++) delete newVals[`${idx}_${s}`];
                          // También limpiar key mensual vieja
                          delete newVals[idx];
                          delete newVals[String(idx)];
                          // Guardar el nuevo valor con key string
                          if(v !== 0 && v !== "") newVals[String(idx)] = v;
                        }
                        
                        const arr = currentList.map((x,xi) => xi === sli ? {label: slLabel, vals: newVals} : x);
                        onSaveSubLines(line.label, arr);
                      }
                    };
                    // Helper: obtener valor de un subLine para (idx, semIdx)
                    const getSlVal = (idx, semIdx) => {
                      const keySem = `${idx}_${semIdx}`;
                      if(slVals[keySem] !== undefined) return Number(slVals[keySem])||0;
                      return 0;
                    };
                    // Helper: valor total del mes (suma todas las semanas + key mensual antiguo)
                    const getSlValMes = (idx) => {
                      let total = 0;
                      let hasSem = false;
                      for(let s=0; s<4; s++){
                        const k = `${idx}_${s}`;
                        if(slVals[k] !== undefined) {
                          total += Number(slVals[k])||0;
                          hasSem = true;
                        }
                      }
                      // Retrocompatibilidad: si hay valor mensual antiguo sin semanas, usarlo
                      if(!hasSem && slVals[idx] !== undefined) return Number(slVals[idx])||0;
                      return total;
                    };
                    return (
                      <tr key={`sl-${line.label}-${sli}`} style={{borderBottom:`1px solid ${C.border}11`,background:`${C.blue}06`}}>
                        <td style={{padding:"4px 14px 4px 28px",fontSize:10,position:"sticky",left:0,
                          background:`${C.blue}06`,zIndex:1,borderRight:`1px solid ${C.border}`,color:C.muted}}>
                          <div style={{display:"flex",alignItems:"center",gap:4}}>
                            <span style={{color:C.blue}}>↳</span><span>{slLabel}</span>
                            {canEdit&&<button onClick={()=>{
                              if(onSaveSubLines) onSaveSubLines(line.label,(subLines[line.label]||[]).filter((_,j)=>j!==sli));
                            }} style={{marginLeft:4,background:"none",border:"none",color:"#ef444488",cursor:"pointer",fontSize:10}}>×</button>}
                          </div>
                        </td>
                        {colStructure.map(({season:s,collapsed,cols})=>{
                          if(collapsed){
                            const tot=s.indices.reduce((a,i)=>a+getSlValMes(i),0);
                            return <td key={s.key} style={{padding:"4px 6px",textAlign:"right",fontSize:9,
                              color:tot?C.blue:C.muted2,borderLeft:`2px solid ${C.border2}`}}>{tot?$$(tot):"—"}</td>;
                          }
                          return cols.map((col,ci)=>{
                            const isTot=col.isTotalMes;
                            // Valor a mostrar
                            let disp;
                            if(isTot) {
                              disp = getSlValMes(col.idx);
                            } else if(col.type==="month_collapsed" || col.type==="month") {
                              disp = getSlValMes(col.idx);
                            } else if(col.type==="week") {
                              // Valor específico de la semana
                              disp = getSlVal(col.idx, col.semIdx);
                            } else {
                              disp = 0;
                            }
                            const isFirst=col.isFirstInSeason||col.isFirstInMonth;
                            return (
                              <td key={`sl-${sli}-${col.mes||""}-${ci}`}
                                style={{padding:"4px 5px",textAlign:"right",fontSize:9,
                                  background:isTot?`${C.yellow}12`:`${C.blue}06`,
                                  borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:isFirst?`1px solid ${C.border}44`:`1px solid ${C.border}11`}}>
                                {isTot
                                  ? <span style={{color:disp?C.blue:C.muted2,fontWeight:disp?700:400}}>{disp?$$(disp):"—"}</span>
                                  : <CeldaEditable val={disp} color={C.blue}
                                      canEdit={canEdit}
                                      onSave={v=>{
                                        if(col.type==="week") updSlVal(col.idx, v, col.semIdx);
                                        else updSlVal(col.idx, v);
                                      }}/>
                                }
                              </td>
                            );
                          });
                        })}
                      </tr>
                    );
                  })}
                  </React.Fragment>
                  );
                })}

                {/* Filas agregadas por el usuario en esta sección */}
                {!isCollapsed && (addedLines[sec.cat]||[]).map((al,ali)=>{
                  const alLabel = typeof al==="string" ? al : al.label;
                  const alVals  = typeof al==="string" ? {} : (al.vals||{});
                  const updAlVal=(idx,v)=>setAddedLines(p=>{
                    const arr=[...(p[sec.cat]||[])];
                    arr[ali]={label:alLabel,vals:{...alVals,[idx]:v}};
                    return {...p,[sec.cat]:arr};
                  });
                  return (
                  <tr key={`al-${sec.cat}-${ali}`} style={{borderBottom:`1px solid ${C.border}11`,background:C.card}}>
                    <td style={{padding:"5px 14px",fontSize:11,position:"sticky",left:0,background:C.card,zIndex:1,
                      borderRight:`1px solid ${C.border}`,whiteSpace:"nowrap",
                      maxWidth:240,overflow:"hidden",textOverflow:"ellipsis"}}>
                      <div style={{display:"flex",alignItems:"center",gap:3,color:C.text}}>
                        {canEdit&&<button onClick={()=>setAddedLines(p=>({...p,[sec.cat]:(p[sec.cat]||[]).filter((_,i)=>i!==ali)}))}
                          style={{background:"none",border:"none",color:"#ef444488",cursor:"pointer",fontSize:10,
                            padding:0,flexShrink:0}}>×</button>}
                        <span>{alLabel}</span>
                      </div>
                    </td>
                    {colStructure.map(({season:s,collapsed,cols})=>{
                      if(collapsed){
                        // Nueva lógica: si el mes tiene semanas cargadas, suma de semanas (ignora mensual).
                        // Si NO hay semanas, usa valor mensual antiguo.
                        const tot=s.indices.reduce((a,i)=>{
                          const hasAnySem = [0,1,2,3].some(si => alVals[`${i}_${si}`] !== undefined);
                          let sum = 0;
                          if(hasAnySem) {
                            for(let si=0; si<4; si++){
                              const v = alVals[`${i}_${si}`];
                              if(v !== undefined) sum += Number(v)||0;
                            }
                          } else {
                            sum = Number(alVals[i])||0;
                          }
                          return a+sum;
                        },0);
                        return <td key={s.key} style={{padding:"5px 8px",textAlign:"right",fontSize:9,
                          color:tot?CAT_COLOR[sec.cat]:C.muted2,fontWeight:tot?600:400,
                          borderLeft:`2px solid ${C.border2}`}}>{tot?$$(tot):"—"}</td>;
                      }
                      return cols.map((col,ci)=>{
                        const isTot=col.isTotalMes;
                        // idx único por semana: para semanas usar "monthIdx_semIdx", para mes usar "monthIdx"
                        const cellKey = col.type==="week" ? `${col.idx}_${col.semIdx}` : String(col.idx);
                        // Nueva lógica para el mes (col.type "month", "month_total", "month_collapsed"):
                        //   Si hay semanas cargadas → suma de semanas (NO editable directamente)
                        //   Si no hay semanas → valor mensual antiguo (editable, retrocompatibilidad)
                        const esMes = col.type==="month" || col.type==="month_total" || col.type==="month_collapsed";
                        const hasAnySemMes = esMes && [0,1,2,3].some(s => alVals[`${col.idx}_${s}`] !== undefined);
                        const sumSemanasMes = esMes && hasAnySemMes
                          ? [0,1,2,3].reduce((s,si)=>{
                              const v=alVals[`${col.idx}_${si}`];
                              return s + (v !== undefined ? (Number(v)||0) : 0);
                            },0)
                          : 0;
                        const rawVal=Number(alVals[cellKey])||0;
                        const disp = esMes
                          ? (hasAnySemMes ? sumSemanasMes : (Number(alVals[String(col.idx)])||0))
                          : rawVal;
                        const isFirst=col.isFirstInSeason||col.isFirstInMonth;
                        // No editable cuando el mes está calculado desde semanas (sería confuso)
                        const mensualCalculado = esMes && hasAnySemMes;
                        return (
                          <td key={`al-${ali}-${col.mes||""}-${ci}`}
                            style={{padding:"4px 5px",textAlign:"right",fontSize:9,
                              background:isTot?`${C.yellow}12`:(mensualCalculado?`${C.bg2}66`:C.card),
                              borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:isFirst?`1px solid ${C.border}44`:`1px solid ${C.border}11`}}>
                            {isTot?(
                              <span style={{color:disp?(sec.signo>0?C.green:C.red):C.muted2,fontWeight:disp?700:400}}>
                                {disp?$$(disp):"—"}
                              </span>
                            ) : mensualCalculado ? (
                              // Mes calculado desde semanas: solo mostrar (no editable)
                              <span title="Suma de semanas (editar en vista semanal)"
                                style={{color:disp?(sec.signo>0?C.green:C.red):C.muted2,fontWeight:disp?700:400,fontStyle:"italic",opacity:0.85}}>
                                {disp?$$(disp):"—"}
                              </span>
                            ) : (
                              <CeldaEditable val={disp} color={sec.signo>0?C.green:C.red}
                                canEdit={canEdit&&col.type!=="month_collapsed"&&!isTot}
                                onSave={v=>updAlVal(cellKey, v)}/>
                            )}
                          </td>
                        );
                      });
                    })}
                  </tr>
                  );
                })}
                {/* Botón + agregar concepto */}
                {!isCollapsed && canEdit&&(
                  <tr>
                    <td colSpan={999} style={{padding:"2px 14px",position:"sticky",left:0,zIndex:1}}>
                      <button onClick={()=>{
                        const nombre=prompt(`Nueva línea en "${sec.label}":`);
                        if(!nombre?.trim())return;
                        setAddedLines(p=>({...p,[sec.cat]:[...(p[sec.cat]||[]),{label:nombre.trim(),vals:{}}]}));
                      }} style={{fontSize:9,color:CAT_COLOR[sec.cat]||C.muted,background:"none",
                        border:`1px dashed ${CAT_COLOR[sec.cat]||C.border}44`,
                        borderRadius:4,padding:"2px 10px",cursor:"pointer"}}>
                        + agregar concepto
                      </button>
                    </td>
                  </tr>
                )}
                {/* Subtotal sección — solo si expandido (colapsado ya muestra en header) */}
                {!isCollapsed && <tr style={{background:C.primary}}>
                  <td style={{padding:"5px 14px",fontWeight:700,color:CAT_COLOR[sec.cat],fontSize:10,
                    position:"sticky",left:0,background:C.bg2,borderRight:`1px solid ${C.border}`,zIndex:1}}>
                    Σ {sec.label}
                  </td>
                  {colStructure.map(({season:s,collapsed,cols})=>{
                    if(collapsed){
                      const total=s.indices.reduce((a,i)=>{
                        const linTot = sec.lines.reduce((b,l)=>{
                          if(l.label.startsWith("  ")) return b;
                          const subSum = l.subLines ? sumSubLinesMes(l.label, i) : 0;
                          return b + getProy(l.label,i) + subSum;
                        },0);
                        const addSum = sumAddedLinesMes(sec.cat, i);
                        return a + linTot + addSum;
                      },0);
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
                      // Vista semanal: subtotal suma los valores semanales reales
                      // Vista mensual o Σ mes: suma todos los valores del mes
                      let baseTotal = 0, addedTotal = 0;
                      if(isTot || col.type==="month" || col.type==="month_collapsed") {
                        // Columna total mes: suma mensual completa (línea padre + sus subLines)
                        baseTotal = sec.lines.reduce((a,l)=>{
                          if(l.label.startsWith("  ")) return a;
                          const subSum = l.subLines ? sumSubLinesMes(l.label, col.idx) : 0;
                          return a + getProy(l.label,col.idx) + subSum;
                        },0);
                        addedTotal = sumAddedLinesMes(sec.cat, col.idx);
                      } else if(col.type==="week") {
                        // Columna de semana: suma los valores semanales de cada línea + subLines de esa semana
                        baseTotal = sec.lines.reduce((a,l)=>{
                          if(l.label.startsWith("  ")) return a;
                          const propSem = getProySemana(l.label, col.idx, col.semIdx, col.isLastInMonth);
                          const subSem = l.subLines
                            ? sumSubLinesSemana(l.label, col.idx, col.semIdx, col.isLastInMonth) : 0;
                          return a + propSem + subSem;
                        }, 0);
                        // AddedLines: usar el helper que considera valores mensuales + semanales
                        addedTotal = sumAddedLinesSemana(sec.cat, col.idx, col.semIdx);
                      }
                      const total=baseTotal+addedTotal;
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
                </tr>}

                {/* SALDO CAJA OPERACIONAL — después del subtotal de egr_fijo */}
                {sec.cat === "egr_fijo" && (() => {
                  // Suma de una sección específica en un mes (getProy + subLines)
                  const sumSeccionMes = (catBuscar, idx) => {
                    const s = emp.sections.find(x=>x.cat===catBuscar);
                    if(!s) return 0;
                    let total = 0;
                    s.lines.forEach(l=>{
                      if(l.label.startsWith("  ")) return;
                      total += getProy(l.label, idx);
                      if(l.subLines) {
                        total += sumSubLinesMes(l.label, idx);
                      }
                    });
                    total += sumAddedLinesMes(s.cat, idx);
                    return total * s.signo;
                  };
                  const sumSeccionSemana = (catBuscar, idx, semIdx, isLastInMonth) => {
                    const s = emp.sections.find(x=>x.cat===catBuscar);
                    if(!s) return 0;
                    let total = 0;
                    s.lines.forEach(l=>{
                      if(l.label.startsWith("  ")) return;
                      total += getProySemana(l.label, idx, semIdx, isLastInMonth);
                      if(l.subLines) {
                        total += sumSubLinesSemana(l.label, idx, semIdx, isLastInMonth);
                      }
                    });
                    total += sumAddedLinesSemana(s.cat, idx, semIdx);
                    return total * s.signo;
                  };
                  // Cálculo para un período: Saldo Caja + Ingresos Op + Egresos Op (var + fijo)
                  // Usamos saldoBancoUSD como saldo caja inicial
                  const saldoCaja = saldoBancoUSD != null ? saldoBancoUSD : emp.saldo_ini;
                  return (
                    <tr style={{background:`${C.teal}11`, borderTop:`1px solid ${C.teal}44`, borderBottom:`1px solid ${C.teal}44`}}>
                      <td style={{padding:"6px 14px",fontWeight:800,color:C.teal,fontSize:11,
                        position:"sticky",left:0,background:`${C.teal}11`,borderRight:`1px solid ${C.border}`,zIndex:1}}>
                        💰 Saldo Caja Operacional
                      </td>
                      {colStructure.map(({season:s,collapsed,cols})=>{
                        if(collapsed){
                          // Si toda la temporada está antes del mes actual, no mostrar
                          const lastIdx = s.indices[s.indices.length-1];
                          if(lastIdx < mesIdxInicioSaldo) {
                            return (
                              <td key={s.key} style={{padding:"6px 8px",textAlign:"right",fontSize:10,color:C.muted2,borderLeft:`2px solid ${C.border2}`,background:`${C.teal}11`}}>—</td>
                            );
                          }
                          const acumFlujoOp = s.indices.reduce((a,i)=>
                            a + sumSeccionMes("ing_op", i) + sumSeccionMes("egr_var", i) + sumSeccionMes("egr_fijo", i), 0);
                          const saldoOp = saldoCaja + acumFlujoOp;
                          return (
                            <td key={s.key} style={{padding:"6px 8px",textAlign:"right",fontWeight:800,
                              fontSize:10,color:cf(saldoOp),borderLeft:`2px solid ${C.border2}`,background:`${C.teal}11`}}>
                              <div style={{fontSize:8,color:C.muted,marginBottom:1}}>Total T</div>
                              {$$(saldoOp)}
                            </td>
                          );
                        }
                        return cols.map((col,ci)=>{
                          const isTot = col.isTotalMes;
                          // Si la celda es de un mes anterior al mes actual, mostrar guion
                          if(col.idx < mesIdxInicioSaldo) {
                            const isFirst = col.isFirstInSeason || col.isFirstInMonth;
                            return (
                              <td key={`opCaja-${col.mes}-${col.label}-${ci}`}
                                style={{padding:"6px 5px",textAlign:"right",fontSize:isTot?10:9,color:C.muted2,
                                  background:isTot?`${C.yellow}18`:`${C.teal}05`,
                                  borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:isFirst?`1px solid ${C.border}44`:`1px solid ${C.border}11`}}>—</td>
                            );
                          }
                          let flujoOp = 0;
                          if(isTot || col.type==="month" || col.type==="month_collapsed") {
                            flujoOp = sumSeccionMes("ing_op", col.idx) + sumSeccionMes("egr_var", col.idx) + sumSeccionMes("egr_fijo", col.idx);
                          } else if(col.type==="week") {
                            flujoOp = sumSeccionSemana("ing_op", col.idx, col.semIdx, col.isLastInMonth)
                                    + sumSeccionSemana("egr_var", col.idx, col.semIdx, col.isLastInMonth)
                                    + sumSeccionSemana("egr_fijo", col.idx, col.semIdx, col.isLastInMonth);
                          }
                          const saldoOp = saldoCaja + flujoOp;
                          const isFirst = col.isFirstInSeason || col.isFirstInMonth;
                          return (
                            <td key={`sco-${col.mes}-${col.label}-${ci}`}
                              style={{padding:"5px 5px",textAlign:"right",fontWeight:isTot?900:800,
                                fontSize:isTot?10:9,color:cf(saldoOp),
                                background:isTot?`${C.yellow}18`:`${C.teal}11`,
                                borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:isFirst?`1px solid ${C.border}44`:`1px solid ${C.border}11`}}>
                              {$$(saldoOp)}
                            </td>
                          );
                        });
                      })}
                    </tr>
                  );
                })()}
              </React.Fragment>
              );
            })}

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
                  const v = acumArr[last];
                  return (
                    <td key={s.key} style={{padding:"7px 8px",textAlign:"right",fontWeight:800,
                      fontSize:11,color:v==null?C.muted2:cf(v),borderLeft:`2px solid ${C.border2}`}}>
                      <div style={{fontSize:8,color:C.muted,marginBottom:1}}>Fin T</div>
                      {v==null?"—":$$(v)}
                    </td>
                  );
                }
                return cols.map((col,ci)=>{
                  const isTot=col.isTotalMes;
                  const isFirst=col.isFirstInSeason||col.isFirstInMonth;
                  const v = col.type==="week" ? getAcumSemana(col.idx, col.semIdx) : acumArr[col.idx];
                  return (
                    <td key={`acum-${col.mes}-${col.label}-${ci}`}
                      style={{padding:"6px 5px",textAlign:"right",fontWeight:isTot?900:700,
                        fontSize:isTot?10:9,color:v==null?C.muted2:cf(v),
                        background:isTot?`${C.yellow}18`:"transparent",
                        borderLeft:col.isFirstInSeason?`2px solid ${C.border2}`:isFirst?`1px solid ${C.border}44`:`1px solid ${C.border}11`}}>
                      {v==null?"—":$$(v)}
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
function Dashboard({empresas, empresasConOverrides, saldosBancos}) {
  // gmAcum y empTotals leen de empresasConOverrides para incluir addedLines y overrides.
  // empresas (raw) se mantiene solo para leer emoji/color (metadatos estáticos, sin overrides).
  const gmAcum=useMemo(()=>{
    let acc=Object.values(empresasConOverrides).reduce((s,e)=>s+(e.saldo_ini||0),0);
    return MESES_65.map((_,i)=>{
      let f=0;
      Object.values(empresasConOverrides).forEach(e=>e.sections.forEach(sec=>sec.lines.forEach(l=>{
        const num=Number(l.proy[i]);
        f+=(isNaN(num)?0:num)*sec.signo;
      })));
      acc+=f;
      return acc;
    });
  },[empresasConOverrides]);
  const EMPRESAS_CHILE = ["Mediterra","Allegria Foods","Allegria Service","Frisku Foods","Allpa Farms","Osiris","Integrity Farms"];
  const EMPRESAS_PERU  = ["Allpa Farms Perú"];
  const HOY_DASH = new Date();
  function saldoDeEmpresas(empList) {
    if(!saldosBancos) return 0;
    let total = 0;
    empList.forEach(empNombre=>{
      const porCuenta = {};
      Object.entries(saldosBancos).forEach(([key,rec])=>{
        const parts = key.split("||");
        if(parts[0]!==empNombre||!rec?.monto||!rec?.fecha) return;
        const f = new Date(rec.fecha);
        if(f>HOY_DASH) return;
        const cuentaKey=`${parts[1]}||${parts[2]||rec.moneda||"usd"}`;
        if(!porCuenta[cuentaKey]||new Date(porCuenta[cuentaKey].fecha)<f) porCuenta[cuentaKey]=rec;
      });
      Object.values(porCuenta).forEach(rec=>{
        const moneda = rec.moneda||"usd";
        if(moneda==="usd") total+=Number(rec.monto)||0;
        else if(rec.usd!=null) total+=Number(rec.usd)||0;
      });
    });
    return total;
  }
  const saldoCajaChile = saldoDeEmpresas(EMPRESAS_CHILE);
  const saldoCajaPerU  = saldoDeEmpresas(EMPRESAS_PERU);
  const empTotals=Object.entries(empresasConOverrides).map(([n,e])=>({n,totalIng:e.sections.filter(s=>s.signo>0).flatMap(s=>s.lines).reduce((a,l)=>a+l.proy.reduce((b,v)=>b+v,0),0)})).filter(e=>e.totalIng>0).sort((a,b)=>b.totalIng-a.totalIng);
  const maxIng=empTotals[0]?.totalIng||1;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
        <KPI label={`🇨🇱 Saldo Banco Chile`}  value={$$(saldoCajaChile)}  color={C.green}/>
        <KPI label={`🇵🇪 Saldo Banco Perú`}   value={$$(saldoCajaPerU)}   color={"#7c3aed"}/>
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
          const e=empresas[n];  // solo emoji y color — metadatos sin overrides
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
function Creditos({empresas, creditosData=CREDITOS_DEFAULT, onSaveCreditos, canEdit=false, empresasPermitidas, nextCreditId}) {
  // Subset de empresas que el usuario puede ver. Todos los créditos,
  // KPIs y deudas se computan SOLO sobre este subset. Defensa adicional
  // en guardar/togglePagado/eliminar para descartar registros fuera del subset.
  const permitidasSet = useMemo(
    () => Array.isArray(empresasPermitidas) && empresasPermitidas.length>0
      ? new Set(empresasPermitidas)
      : null, // null = sin restricción (acceso completo)
    [empresasPermitidas]
  );
  const esPermitida = (emp) => permitidasSet ? permitidasSet.has(emp) : true;
  const creditosVisibles = useMemo(
    () => permitidasSet
      ? (creditosData||[]).filter(c => permitidasSet.has(c?.empresa))
      : (creditosData||[]),
    [creditosData, permitidasSet]
  );
  // Lista de empresas para el <select> del modal: filtrar por permisos
  const EMP_SELECT = ["Mediterra","Allegria Foods","Allegria Service","Frisku Foods","Osiris","Integrity Farms","Allpa Farms","Allpa Farms Perú"]
    .filter(e => esPermitida(e));
  const [vistaCred,setVistaCred]=useState("creditos"); // "creditos" | "saldomes"
  const [busq,setBusq]=useState("");
  const [filtEmp,setFiltEmp]=useState("Todas");
  const [filtPagado,setFiltPagado]=useState("Todos"); // "Todos" | "Pendientes" | "Pagados"
  const [modal,setModal]=useState(false);
  const [editId,setEditId]=useState(null);
  const EMPTY_FORM = {
    empresa:"",acreedor:"",tipo_inst:"",monto:"",f_inicio:"",f_venc:"",tipo_cr:"Bullet",tasa:"",cuota:"",
    // Renovación
    renovable:false,
    tasa_anual:"",              // % tasa anual
    cuotas_renovacion:[],       // [{mes:"Jun",anio:"2027",monto:"120000"}]
    monto_renovacion:"",        // monto ingreso nuevo préstamo
    mes_ingreso_renovacion:"",  // mes en que se recibe el nuevo préstamo
    anio_ingreso_renovacion:"", // año en que se recibe el nuevo préstamo
  };
  const [form,setForm]=useState(EMPTY_FORM);

  function openNew(){ setForm(EMPTY_FORM); setEditId(null); setModal(true); }
  function openEdit(c){ setForm({...c,monto:String(c.monto),cuota:String(c.cuota)}); setEditId(c.n); setModal(true); }
  function guardar(){
    if(!form.empresa||!form.acreedor||!form.monto||!form.f_venc){alert("Empresa, acreedor, monto y fecha son obligatorios.");return;}
    // Guardrail: no permitir crear/editar créditos de empresas fuera del subset
    if(!esPermitida(form.empresa)){ alert("Empresa no permitida."); return; }
    // ID secuencial: usa nextCreditId del parent (sobre el blob completo) si está disponible;
    // fallback al cálculo local sobre el subset visible (para retrocompat).
    const maxNLocal = creditosVisibles.reduce((m,c)=> Math.max(m, typeof c.n === 'number' && c.n < 100000 ? c.n : 0), 0);
    const newN = editId || (typeof nextCreditId === 'number' ? nextCreditId : (maxNLocal + 1));
    const item={
      ...form,
      n: newN,
      monto: parseFloat(form.monto)||0,
      cuota: parseFloat(form.cuota||form.monto)||0,
      pagado: form.pagado === true ? true : false,
      f_venc: form.f_venc || "",
      f_inicio: form.f_inicio || "",
    };
    // El payload al parent contiene SOLO el subset visible — el parent hace merge.
    const next=editId
      ? creditosVisibles.map(c=>String(c.n)===String(editId)?item:c)
      : [...creditosVisibles,item];
    if(onSaveCreditos) onSaveCreditos(next);
    setModal(false);
  }
  function togglePagado(n, value){
    const next=creditosVisibles.map(c=>String(c.n)===String(n)?{...c,pagado:value!==undefined?value:!c.pagado}:c);
    if(onSaveCreditos) onSaveCreditos(next);
  }
  function eliminar(n){
    if(!window.confirm("¿Eliminar este crédito?")) return;
    if(onSaveCreditos) onSaveCreditos(creditosVisibles.filter(c=>String(c.n)!==String(n)));
  }
  const empList=["Todas",...new Set(creditosVisibles.map(c=>c.empresa))];
  const filtered=creditosVisibles.filter(c=>{
    if(filtEmp!=="Todas"&&c.empresa!==filtEmp) return false;
    if(filtPagado==="Pendientes"&&c.pagado) return false;
    if(filtPagado==="Pagados"&&!c.pagado) return false;
    if(busq&&![c.empresa,c.acreedor].some(s=>s.toLowerCase().includes(busq.toLowerCase()))) return false;
    return true;
  }).sort((a,b)=>{
    // Ordenar por empresa, luego por fecha de vencimiento
    const empCmp = (a.empresa||"").localeCompare(b.empresa||"");
    if(empCmp!==0) return empCmp;
    return (a.f_venc||"").localeCompare(b.f_venc||"");
  });
  const deudaEmp={};creditosVisibles.forEach(c=>{
    if(!deudaEmp[c.empresa]) deudaEmp[c.empresa]=0;
    // Deuda original (si no está pagado)
    if(!c.pagado) deudaEmp[c.empresa]+=c.monto;
    // Deuda renovación (cuotas pendientes de capital)
    if(c.renovable)(c.cuotas_renovacion||[]).forEach(cq=>{
      if((cq.tipo||'Solo Interés')==='Capital+Interés') deudaEmp[c.empresa]+=(Number(cq.monto)||0);
    });
  });
  const deudaList=Object.entries(deudaEmp).sort((a,b)=>b[1]-a[1]);
  const maxD=deudaList[0]?.[1]||1;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:14,minWidth:0}}>
      {/* Subpestañas de Créditos */}
      <div style={{display:"flex",gap:6}}>
        {[["creditos","💳 Créditos"],["saldomes","📅 Saldo por Mes"]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setVistaCred(id)}
            style={{padding:"7px 16px",borderRadius:8,border:`1px solid ${vistaCred===id?C.blue:C.border}`,
              background:vistaCred===id?C.blue:"transparent",color:vistaCred===id?"#fff":C.muted,
              cursor:"pointer",fontSize:12,fontWeight:700}}>{lbl}</button>
        ))}
      </div>

      {vistaCred==="saldomes" && <SaldoDeudaPorMes creditos={creditosVisibles} empresas={empresas}/>}

      {vistaCred==="creditos" && (<>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
        <KPI label="Deuda Total Q1-2026" value={$$(CREDITOS_TRIM.saldos[0])} color={C.red}/>
        <KPI label="Pagos Q1-2026"       value={$$(CREDITOS_TRIM.pagos[0])}  color={C.yellow}/>
        <KPI label="N° Créditos"         value={creditosVisibles.length}             color={C.blue}/>
        <KPI label="Renovables"          value={creditosVisibles.filter(c=>c.renovable).length} color={C.orange}/>
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
        <div style={{overflowX:"auto",minWidth:0,maxWidth:"calc(100vw - 80px)"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{background:C.primary}}>
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
        {canEdit&&<button onClick={openNew}
          style={{padding:"7px 16px",borderRadius:8,background:C.blue,border:"none",
            color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>
          + Nuevo Crédito
        </button>}
        <input value={busq} onChange={e=>setBusq(e.target.value)} placeholder="🔍 Buscar…"
          style={{padding:"7px 12px",background:C.card2,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:12,outline:"none",flexGrow:1,minWidth:160}}/>
        <select value={filtEmp} onChange={e=>setFiltEmp(e.target.value)}
          style={{padding:"7px 12px",background:C.card2,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:12,outline:"none"}}>
          {empList.map(e=><option key={e}>{e}</option>)}
        </select>
        <select value={filtPagado} onChange={e=>setFiltPagado(e.target.value)}
          style={{padding:"7px 12px",background:C.card2,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:12,outline:"none"}}>
          {["Todos","Pendientes","Pagados"].map(v=><option key={v}>{v}</option>)}
        </select>
      </div>
      <Card style={{padding:0,overflow:"hidden"}}>
        <div style={{overflowX:"auto",minWidth:0,maxWidth:"calc(100vw - 80px)"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead><tr style={{background:C.primary}}>
              {["#","Empresa","Acreedor","Tipo","Monto","Cuota","Desembolso","Vencimiento","Tasa","Renovación",...(canEdit?["Acciones"]:[])
              ].map(h=><th key={h} style={{padding:"8px 12px",fontWeight:600,fontSize:10,color:C.muted,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`,textAlign:["Monto","Cuota","Tasa"].includes(h)?"right":"left",whiteSpace:"nowrap"}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {filtered.map(c=>{
                const vencProx=new Date(c.f_venc)<=new Date("2026-12-31");
                const e=empresas[c.empresa]||{emoji:"🏢",color:C.blue};
                return (
                  <tr key={c.n} style={{borderBottom:`1px solid ${C.border}22`,
                    opacity:c.pagado?0.5:1,
                    background:c.pagado?`${C.green}08`:vencProx?`${C.yellow}08`:"transparent"}}>
                    <td style={{padding:"7px 12px",color:C.muted}}>{c.n}</td>
                    <td style={{padding:"7px 12px",fontWeight:600,color:e.color,whiteSpace:"nowrap"}}>{e.emoji} {c.empresa}</td>
                    <td style={{padding:"7px 12px",color:C.text}}>{c.acreedor}</td>
                    <td style={{padding:"7px 12px"}}><span style={{fontSize:9,padding:"2px 7px",borderRadius:20,background:C.card2,border:`1px solid ${C.border}`,color:C.muted}}>{c.tipo_cr}</span></td>
                    <td style={{padding:"7px 12px",textAlign:"right",fontWeight:700,color:c.pagado?C.green:C.red}}>
                      {c.pagado?<span>✓ {$$(c.monto)}</span>:$$(c.monto)}
                    {c.renovable&&<span style={{fontSize:9,marginLeft:4,background:`${C.orange}22`,color:C.orange,borderRadius:10,padding:"1px 5px"}}>🔄 Renov.</span>}
                    </td>
                    <td style={{padding:"7px 12px",textAlign:"right",color:C.yellow}}>{$$(c.cuota)}</td>
                    <td style={{padding:"7px 12px",whiteSpace:"nowrap",color:C.muted}}>{c.f_inicio?fmtDate(c.f_inicio):"—"}</td>
                    <td style={{padding:"7px 12px",whiteSpace:"nowrap",color:vencProx?C.orange:C.muted}}>{fmtDate(c.f_venc)}{vencProx&&" ⚠️"}</td>
                    <td style={{padding:"7px 12px",textAlign:"right",color:C.muted}}>{c.tasa||"—"}</td>
                    <td style={{padding:"7px 10px",textAlign:"center",fontSize:10}}>
                      {c.renovable ? (
                        <div>
                          <div style={{color:C.orange,fontWeight:700}}>🔄 {c.forma_pago||"Bullet"}</div>
                          {c.meses_pago&&c.meses_pago.length>0&&(
                            <div style={{color:C.muted,fontSize:9}}>{c.meses_pago.join(",")}</div>
                          )}
                          {c.cuota_renovacion&&(
                            <div style={{color:C.red,fontSize:9}}>{$$(Number(c.cuota_renovacion))}/cuota</div>
                          )}
                        </div>
                      ) : <span style={{color:C.muted2}}>—</span>}
                    </td>
                    {canEdit&&(
                      <td style={{padding:"6px 8px",whiteSpace:"nowrap"}}>
                        <div style={{display:"flex",gap:4}}>
                          <select value={c.pagado?"pagado":"pendiente"}
                            onChange={e=>togglePagado(c.n,e.target.value==="pagado")}
                            style={{padding:"3px 7px",borderRadius:6,fontSize:11,fontWeight:700,cursor:"pointer",
                              border:`1px solid ${c.pagado?"#86efac":"#fde68a"}`,
                              background:c.pagado?"#dcfce7":"#fef9c3",
                              color:c.pagado?"#166534":"#854d0e",outline:"none"}}>
                            <option value="pendiente">⏳ Pendiente</option>
                            <option value="pagado">✓ Pagado</option>
                          </select>
                          <button onClick={()=>openEdit(c)}
                            style={{padding:"3px 8px",borderRadius:6,border:`1px solid ${C.border}`,cursor:"pointer",fontSize:11,background:"transparent",color:C.muted}}>
                            ✏️
                          </button>
                          <button onClick={()=>eliminar(c.n)}
                            style={{padding:"3px 8px",borderRadius:6,border:"none",cursor:"pointer",fontSize:11,background:"#fee2e2",color:"#991b1b"}}>
                            ×
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Saldo deuda por empresa al cierre de temporada (junio) */}
      <Card style={{padding:0,overflow:"hidden"}}>
        <div style={{padding:"12px 16px 8px",borderBottom:`1px solid ${C.border}`}}>
          <SectionTitle>Saldo Deuda por Empresa — Cierre de Temporada (Junio)</SectionTitle>
          <div style={{fontSize:10,color:C.muted}}>
            Deuda pendiente por empresa al 30 de junio de cada año
          </div>
        </div>
        <div style={{overflowX:"auto",minWidth:0,maxWidth:"calc(100vw - 80px)"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead>
              <tr style={{background:C.primary}}>
                <th style={{padding:"8px 14px",fontWeight:700,fontSize:11,color:C.text,
                  textAlign:"left",borderBottom:`1px solid ${C.border}`,
                  position:"sticky",left:0,background:C.bg2,zIndex:1,minWidth:180}}>
                  Empresa
                </th>
                {["Jun-26","Jun-27","Jun-28","Jun-29","Jun-30","Jun-31"].map(t=>(
                  <th key={t} style={{padding:"8px 14px",fontWeight:600,fontSize:10,
                    color:C.muted,textAlign:"right",borderBottom:`1px solid ${C.border}`,
                    textTransform:"uppercase",whiteSpace:"nowrap"}}>
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(()=>{
                const CIERRES = [
                  ["Jun-26","2026-06-30"],["Jun-27","2027-06-30"],
                  ["Jun-28","2028-06-30"],["Jun-29","2029-06-30"],
                  ["Jun-30","2030-06-30"],["Jun-31","2031-06-30"],
                ];
                const emps = [...new Set(creditosVisibles.map(c=>c.empresa))].sort();
                return emps.map(emp=>{
                  const e = empresas[emp]||{emoji:"🏢",color:C.blue};
                  const empCreds = creditosVisibles.filter(c=>c.empresa===emp);
                  const saldos = CIERRES.map(([,fecha])=>
                    empCreds.reduce((s,c)=>{
                      // Deuda original pendiente
                      let d = (!c.pagado && c.f_venc>fecha) ? (Number(c.cuota)||0) : 0;
                      // Cuotas de renovación pendientes (Capital+Interés aún no vencidas)
                      if(c.renovable)(c.cuotas_renovacion||[]).forEach(cq=>{
                        if((cq.tipo||'Solo Interés')==='Capital+Interés'){
                          const mesEn = ({Ene:'Jan',Feb:'Feb',Mar:'Mar',Abr:'Apr',May:'May',Jun:'Jun',Jul:'Jul',Ago:'Aug',Sep:'Sep',Oct:'Oct',Nov:'Nov',Dic:'Dec'})[cq.mes]||cq.mes;
                          const fCuota = cq.anio&&cq.mes ? `${cq.anio}-${String(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(mesEn)+1).padStart(2,'0')}-28` : '';
                          if(fCuota>fecha) d+=Number(cq.monto)||0;
                        }
                      });
                      return s+d;
                    },0)
                  );
                  const hasSaldo = saldos.some(s=>s>0);
                  if(!hasSaldo) return null;
                  // Total inicial = saldo al cierre anterior (antes de Jun-26 = total deuda)
                  const totalInicial = empCreds.reduce((s,c)=>{
                    let d = Number(c.cuota)||0;
                    if(c.renovable)(c.cuotas_renovacion||[]).forEach(cq=>{
                      if((cq.tipo||'Solo Interés')==='Capital+Interés') d+=Number(cq.monto)||0;
                    });
                    return s+d;
                  },0);
                  return (
                    <tr key={emp} style={{borderBottom:`1px solid ${C.border}22`}}
                      onMouseEnter={e2=>e2.currentTarget.style.background=`${C.card2}`}
                      onMouseLeave={e2=>e2.currentTarget.style.background="transparent"}>
                      <td style={{padding:"8px 14px",position:"sticky",left:0,
                        background:C.card,zIndex:1,borderRight:`1px solid ${C.border}22`}}>
                        <div style={{fontWeight:700,color:e.color,fontSize:11}}>
                          {e.emoji} {emp}
                        </div>
                        <div style={{fontSize:9,color:C.muted,marginTop:1}}>
                          Total: {$$(totalInicial)}
                        </div>
                      </td>
                      {saldos.map((saldo,i)=>{
                        const prev = i===0 ? totalInicial : saldos[i-1];
                        const pagado = prev - saldo;
                        const pct = totalInicial>0 ? Math.round((1-saldo/totalInicial)*100) : 100;
                        return (
                          <td key={i} style={{padding:"8px 14px",textAlign:"right"}}>
                            {saldo>0 ? (
                              <div>
                                <div style={{fontWeight:800,fontSize:12,
                                  color:saldo<totalInicial*0.3?C.yellow:C.red}}>
                                  {$$(saldo)}
                                </div>
                                {pagado>0&&(
                                  <div style={{fontSize:9,color:C.green,marginTop:1}}>
                                    ↓ {$$(pagado)} pagado
                                  </div>
                                )}
                                <div style={{fontSize:9,color:C.muted,marginTop:1}}>
                                  {100-pct}% pendiente
                                </div>
                              </div>
                            ) : (
                              <span style={{color:C.green,fontWeight:700,fontSize:12}}>✓ Saldado</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                }).filter(Boolean);
              })()}
            </tbody>
            {/* Fila total consolidado */}
            <tfoot>
              <tr style={{background:C.bg2,borderTop:`2px solid ${C.border}`}}>
                <td style={{padding:"8px 14px",fontWeight:800,color:C.text,fontSize:11,
                  position:"sticky",left:0,background:C.bg2,zIndex:1}}>
                  TOTAL GRUPO
                </td>
                {(()=>{
                  const CIERRES_F = [
                    "2026-06-30","2027-06-30","2028-06-30",
                    "2029-06-30","2030-06-30","2031-06-30"
                  ];
                  const MES_ABREV = {Ene:'01',Feb:'02',Mar:'03',Abr:'04',May:'05',Jun:'06',Jul:'07',Ago:'08',Sep:'09',Oct:'10',Nov:'11',Dic:'12'};
                  return CIERRES_F.map((fecha,i)=>{
                    const total = creditosVisibles.reduce((s,c)=>{
                      let d = (!c.pagado && c.f_venc>fecha)?(Number(c.cuota)||0):0;
                      if(c.renovable)(c.cuotas_renovacion||[]).forEach(cq=>{
                        if((cq.tipo||'Solo Interés')==='Capital+Interés'){
                          const fCuota=cq.anio&&cq.mes?`\${cq.anio}-\${MES_ABREV[cq.mes]||'06'}-28`:'';
                          if(fCuota>fecha) d+=Number(cq.monto)||0;
                        }
                      });
                      return s+d;
                    },0);
                    return (
                      <td key={i} style={{padding:"8px 14px",textAlign:"right",
                        fontWeight:800,fontSize:12,color:total?C.red:C.green}}>
                        {total?$$(total):"✓ Saldado"}
                      </td>
                    );
                  });
                })()}
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* Cronograma de pagos por empresa */}
      <Card style={{padding:0,overflow:"hidden"}}>
        <div style={{padding:"12px 16px 8px",borderBottom:`1px solid ${C.border}`}}>
          <SectionTitle>Timeline de Pagos por Acreedor</SectionTitle>
          <div style={{fontSize:10,color:C.muted}}>Cronograma visual: cuotas originales → renovaciones por empresa y acreedor</div>
        </div>
        {(()=>{
          // Agrupar por empresa → acreedor
          const byEmp = {};
          creditosVisibles.forEach(c=>{
            if(!byEmp[c.empresa]) byEmp[c.empresa]={};
            if(!byEmp[c.empresa][c.acreedor]) byEmp[c.empresa][c.acreedor]=[];
            byEmp[c.empresa][c.acreedor].push(c);
          });
          const MES_A = {Ene:"Jan",Feb:"Feb",Mar:"Mar",Abr:"Apr",May:"May",Jun:"Jun",Jul:"Jul",Ago:"Aug",Sep:"Sep",Oct:"Oct",Nov:"Nov",Dic:"Dec"};
          return Object.entries(byEmp).map(([emp,acreedores])=>{
            const e=empresas[emp]||{emoji:"🏢",color:C.muted};
            return (
              <div key={emp} style={{borderBottom:`1px solid ${C.border}`,padding:"12px 16px"}}>
                <div style={{fontSize:12,fontWeight:800,color:e.color,marginBottom:10}}>{e.emoji} {emp}</div>
                {Object.entries(acreedores).map(([acreedor,creds])=>{
                  // Construir eventos del timeline para este acreedor
                  const eventos = [];
                  // Cuotas originales
                  creds.forEach(c=>{
                    eventos.push({fecha:c.f_venc,label:mesDeDate(c.f_venc),monto:c.cuota,tipo:"original",pagado:c.pagado,id:c.n});
                  });
                  // Cuotas de renovación
                  creds.filter(c=>c.renovable&&(c.cuotas_renovacion||[]).length>0).forEach(c=>{
                    const cuotasCalc=calcMontoRealCuota(c.cuotas_renovacion,c.monto_renovacion,c.tasa_anual,c.mes_ingreso_renovacion&&c.anio_ingreso_renovacion?`${c.mes_ingreso_renovacion}-${String(c.anio_ingreso_renovacion).slice(-2)}`:'');
                    cuotasCalc.forEach((cq,ci)=>{
                      if(!cq.mes||!cq.anio) return;
                      const mesEn=MES_A[cq.mes]||cq.mes;
                      const label=`${mesEn}-${String(cq.anio).slice(2)}`;
                      const fecha=`${cq.anio}-${String(Object.values(MES_A).indexOf(mesEn)+1).padStart(2,"0")}-15`;
                      eventos.push({fecha,label,monto:cq.montoReal||0,tipo:cq.tipo||"Solo Interés",pagado:false,id:`ren-${c.n}-${ci}`,isRen:true});
                    });
                  });
                  // Ingreso de renovación
                  creds.filter(c=>c.renovable&&c.monto_renovacion&&c.mes_ingreso_renovacion&&c.anio_ingreso_renovacion).forEach(c=>{
                    const mesEn=MES_A[c.mes_ingreso_renovacion]||c.mes_ingreso_renovacion;
                    const label=`${mesEn}-${String(c.anio_ingreso_renovacion).slice(2)}`;
                    const fecha=`${c.anio_ingreso_renovacion}-${String(Object.values(MES_A).indexOf(mesEn)+1).padStart(2,"0")}-01`;
                    eventos.push({fecha,label,monto:Number(c.monto_renovacion),tipo:"ingreso",pagado:false,id:`ing-${c.n}`,isIngreso:true});
                  });
                  // Ordenar cronológicamente
                  eventos.sort((a,b)=>a.fecha.localeCompare(b.fecha));
                  if(eventos.length===0) return null;
                  return (
                    <div key={acreedor} style={{marginBottom:10}}>
                      <div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:6}}>{acreedor}</div>
                      <div style={{display:"flex",alignItems:"center",gap:0,overflowX:"auto",paddingBottom:4}}>
                        {eventos.map((ev,ei)=>{
                          const isLast=ei===eventos.length-1;
                          const bgColor=ev.isIngreso?"#22c55e22":ev.isRen?(ev.tipo==="Capital+Interés"?"#3b82f622":"#f59e0b22"):`${C.bg}`;
                          const borderColor=ev.isIngreso?"#22c55e":ev.isRen?(ev.tipo==="Capital+Interés"?C.blue:C.orange):(ev.pagado?"#22c55e44":C.border);
                          const textColor=ev.isIngreso?"#22c55e":ev.isRen?(ev.tipo==="Capital+Interés"?C.blue:C.orange):C.red;
                          return (
                            <React.Fragment key={ev.id}>
                              <div style={{flexShrink:0,background:bgColor,borderRadius:8,
                                padding:"6px 10px",border:`1px solid ${borderColor}`,
                                opacity:ev.pagado?0.45:1,minWidth:70,textAlign:"center"}}>
                                {ev.isIngreso&&<div style={{fontSize:8,color:"#22c55e",fontWeight:700,marginBottom:1}}>💰 INGRESO</div>}
                                {ev.isRen&&!ev.isIngreso&&<div style={{fontSize:8,color:ev.tipo==="Capital+Interés"?C.blue:C.orange,fontWeight:700,marginBottom:1}}>🔄 {ev.tipo==="Capital+Interés"?"CAP+INT":"INT"}</div>}
                                <div style={{fontSize:10,fontWeight:700,color:C.yellow}}>{ev.label}</div>
                                <div style={{fontSize:11,fontWeight:800,color:textColor}}>{$$(ev.monto)}</div>
                                {ev.pagado&&<div style={{fontSize:8,color:"#22c55e"}}>✓</div>}
                              </div>
                              {!isLast&&<div style={{width:16,height:1,background:`${C.border}`,flexShrink:0,marginTop:8}}>
                                <div style={{width:"100%",height:"100%",background:C.muted2}}/>
                              </div>}
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          });
        })()}
      </Card>

      {/* Modal nuevo / editar crédito */}
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:400,
          display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:C.bg2,border:`1px solid ${C.blue}55`,borderRadius:16,
            width:520,maxWidth:"95vw",boxShadow:"0 24px 64px rgba(0,0,0,0.7)"}}>
            <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,
              display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:20}}>🏦</span>
              <span style={{fontSize:13,fontWeight:800,color:C.text}}>
                {editId?"Editar":"Nuevo"} Crédito
              </span>
              <button onClick={()=>setModal(false)}
                style={{marginLeft:"auto",background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:20}}>×</button>
            </div>
            <div style={{padding:"16px 20px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {[
                ["Empresa","empresa","select",EMP_SELECT],
                ["Acreedor / Institución","acreedor","text",null],
                ["Tipo institución","tipo_inst","text",null],
                ["Tipo crédito","tipo_cr","select",["Bullet","Cuotas Mensuales","Leasing","Crédito Hipotecario","Inversión","Otro"]],
                ["Monto total (USD)","monto","number",null],
                ["Cuota (USD)","cuota","number",null],
                ["Fecha desembolso","f_inicio","date",null],
                ["Fecha vencimiento","f_venc","date",null],
                ["Tasa (%)","tasa","text",null],
              ].map(([lbl,field,type,opts])=>(
                <div key={field}>
                  <div style={{fontSize:10,color:C.muted,marginBottom:3,fontWeight:600}}>{lbl}</div>
                  {opts&&Array.isArray(opts)?(
                    <select value={form[field]||""} onChange={e=>setForm(p=>(({...p,[field]:e.target.value})))}
                      style={{width:"100%",padding:"7px 10px",background:C.card2,border:`1px solid ${C.border}`,
                        borderRadius:8,color:C.text,fontSize:12,outline:"none"}}>
                      <option value="">— seleccionar —</option>
                      {opts.map(o=><option key={o}>{o}</option>)}
                    </select>
                  ):(
                    <input type={type} value={form[field]||""}
                      onChange={e=>setForm(p=>(({...p,[field]:e.target.value})))}
                      style={{width:"100%",padding:"7px 10px",background:C.card2,
                        border:`1px solid ${C.border}`,borderRadius:8,color:C.text,
                        fontSize:12,outline:"none",boxSizing:"border-box"}}/>
                  )}
                </div>
              ))}
            </div>
            {/* Sección Renovación */}
            <div style={{padding:"12px 20px",borderTop:`1px solid ${C.border}`}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:12,fontWeight:700,color:C.text}}>
                  <input type="checkbox" checked={form.renovable||false}
                    onChange={e=>setForm(p=>({
                      ...p,
                      renovable:e.target.checked,
                      // Auto-llenar monto renovación con el monto del crédito
                      monto_renovacion:e.target.checked&&!p.monto_renovacion?p.monto:p.monto_renovacion,
                    }))}
                    style={{width:14,height:14}}/>
                  🔄 Crédito Renovable
                </label>
                {form.renovable&&<span style={{fontSize:10,color:C.green,fontWeight:600}}>
                  Al pagarse, genera cuotas de renovación en el flujo
                </span>}
              </div>
              {form.renovable&&(
                <div style={{background:`${C.green}08`,border:`1px solid ${C.green}33`,borderRadius:10,padding:"12px 14px"}}>

                  {/* Ingreso del préstamo renovado */}
                  <div style={{marginBottom:12,padding:"8px 12px",background:`${C.blue}11`,borderRadius:8,border:`1px solid ${C.blue}33`}}>
                    <div style={{fontSize:11,fontWeight:700,color:C.blue,marginBottom:8}}>💰 Ingreso Nuevo Préstamo (Ing. No Operacional)</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                      <div>
                        <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Monto Nuevo Préstamo (USD)</div>
                        <input type="number" value={form.monto_renovacion||""} onChange={e=>setForm(p=>({...p,monto_renovacion:e.target.value}))}
                          placeholder="Ej: 500000"
                          style={{width:"100%",padding:"7px 10px",background:C.card2,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/>
                      </div>
                      <div>
                        <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Mes Ingreso</div>
                        <select value={form.mes_ingreso_renovacion||""} onChange={e=>setForm(p=>({...p,mes_ingreso_renovacion:e.target.value,anio_ingreso_renovacion:p.anio_ingreso_renovacion||(p.f_venc?new Date(p.f_venc).getFullYear():new Date().getFullYear())}))}
                          style={{width:"100%",padding:"7px 10px",background:C.card2,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:12,outline:"none"}}>
                          <option value="">— mes —</option>
                          {["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"].map(m=><option key={m}>{m}</option>)}
                        </select>
                      </div>
                      <div>
                        <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Año Ingreso</div>
                        <input type="number" value={form.anio_ingreso_renovacion||""} onChange={e=>setForm(p=>({...p,anio_ingreso_renovacion:e.target.value}))}
                          placeholder={form.f_venc?String(new Date(form.f_venc).getFullYear()):"2026"}
                          style={{width:"100%",padding:"7px 10px",background:C.card2,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/>
                      </div>
                    </div>
                  </div>

                  {/* Cuotas de pago de la renovación */}
                  <div style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <div style={{fontSize:11,fontWeight:700,color:C.green}}>📅 Cuotas de Pago Renovación</div>
                      <button type="button" onClick={()=>setForm(p=>({...p,cuotas_renovacion:[...(p.cuotas_renovacion||[]),{mes:"",anio:"",monto:""}]}))}
                        style={{fontSize:11,padding:"3px 10px",borderRadius:6,border:"1px dashed #86efac",background:"transparent",color:C.green,cursor:"pointer"}}>
                        + Agregar cuota
                      </button>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1.5fr 0.8fr 0.8fr 1fr auto",gap:8,marginBottom:6,alignItems:"end"}}>
                      <div style={{fontSize:10,color:C.muted,fontWeight:600}}>Tipo</div>
                      <div style={{fontSize:10,color:C.muted,fontWeight:600}}>Mes</div>
                      <div style={{fontSize:10,color:C.muted,fontWeight:600}}>Año</div>
                      <div style={{fontSize:10,color:C.muted,fontWeight:600}}>Monto calculado</div>
                      <div/>
                    </div>
                    {(form.cuotas_renovacion||[]).length===0&&(
                      <div style={{fontSize:11,color:C.muted2,fontStyle:"italic"}}>Sin cuotas definidas — agrega al menos una</div>
                    )}
                    {(form.cuotas_renovacion||[]).map((cq,ci)=>{
                      // Calcular monto automático con interés sobre saldo
                      const _cap = Number(form.monto_renovacion)||0;
                      const _n = (form.cuotas_renovacion||[]).length;
                      const _nCap = (form.cuotas_renovacion||[]).filter(c=>(c.tipo||"Solo Interés")==="Capital+Interés").length;
                      const _tMens = ((Number(form.tasa_anual)||0)/100)/12;
                      const _amort = _nCap>0?_cap/_nCap:0;
                      // Calcular saldo hasta esta cuota
                      let _saldo = _cap;
                      for(let _j=0;_j<ci;_j++){
                        if(((form.cuotas_renovacion||[])[_j]?.tipo||"Solo Interés")==="Capital+Interés") _saldo=Math.max(0,_saldo-_amort);
                      }
                      // Meses desde ingreso (o cuota anterior) hasta esta cuota
                      const _prevMes = ci===0
                        ? (form.mes_ingreso_renovacion&&form.anio_ingreso_renovacion?{y:parseInt(form.anio_ingreso_renovacion),m:MES_ABR_NUM[form.mes_ingreso_renovacion]||1}:null)
                        : ((form.cuotas_renovacion||[])[ci-1]?.mes&&(form.cuotas_renovacion||[])[ci-1]?.anio?{y:parseInt((form.cuotas_renovacion||[])[ci-1].anio),m:MES_ABR_NUM[(form.cuotas_renovacion||[])[ci-1].mes]||1}:null);
                      const _thisMes = cq.mes&&cq.anio?{y:parseInt(cq.anio),m:MES_ABR_NUM[cq.mes]||1}:null;
                      const _meses = _prevMes&&_thisMes?Math.max(1,(_thisMes.y-_prevMes.y)*12+(_thisMes.m-_prevMes.m)):1;
                      const _interes = Math.round(_saldo*_tMens*_meses);
                      const _esCap = (cq.tipo||"Solo Interés")==="Capital+Interés";
                      const _montoCalc = _esCap?Math.round(_amort)+_interes:_interes;
                      return (
                      <div key={ci} style={{display:"grid",gridTemplateColumns:"1.5fr 0.8fr 0.8fr 1fr auto",gap:8,marginBottom:6,alignItems:"center"}}>
                        <select value={cq.tipo||"Solo Interés"} onChange={e=>{const arr=[...(form.cuotas_renovacion||[])];arr[ci]={...cq,tipo:e.target.value};setForm(p=>({...p,cuotas_renovacion:arr}));}}
                          style={{padding:"6px 8px",borderRadius:6,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:11,outline:"none"}}>
                          {["Solo Interés","Capital+Interés"].map(t=><option key={t}>{t}</option>)}
                        </select>
                        <select value={cq.mes||""} onChange={e=>{const arr=[...(form.cuotas_renovacion||[])];arr[ci]={...cq,mes:e.target.value};setForm(p=>({...p,cuotas_renovacion:arr}));}}
                          style={{padding:"6px 8px",borderRadius:6,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,outline:"none"}}>
                          <option value="">— mes —</option>
                          {["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"].map(m=><option key={m}>{m}</option>)}
                        </select>
                        <input type="number" value={cq.anio||""} placeholder="2026"
                          onChange={e=>{const arr=[...(form.cuotas_renovacion||[])];arr[ci]={...cq,anio:e.target.value};setForm(p=>({...p,cuotas_renovacion:arr}));}}
                          style={{padding:"6px 8px",borderRadius:6,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,outline:"none"}}/>
                        <div style={{background:C.card2,borderRadius:6,padding:"5px 8px",border:`1px solid ${_esCap?C.blue:C.orange}`}}>
                          <div style={{fontWeight:700,fontSize:12,color:_esCap?C.blue:C.orange}}>{$$(_montoCalc)}</div>
                          <div style={{fontSize:9,color:C.muted}}>
                            {_esCap?`Cap: ${$$(Math.round(_amort))} + Int: ${$$(Math.round(_interes))}`:`Int: ${$$(Math.round(_interes))}`}
                          </div>
                        </div>
                        <button type="button" onClick={()=>setForm(p=>({...p,cuotas_renovacion:(p.cuotas_renovacion||[]).filter((_,j)=>j!==ci)}))}
                          style={{padding:"4px 8px",borderRadius:6,background:"#fee2e2",border:"none",color:"#991b1b",cursor:"pointer",fontSize:11}}>×</button>
                      </div>
                      );
                    })}
                  </div>

                  {/* Tasa */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div>
                      <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Tasa Anual (%)</div>
                      <input type="number" step="0.1" value={form.tasa_anual||""} onChange={e=>setForm(p=>({...p,tasa_anual:e.target.value}))}
                        placeholder="Ej: 8.5"
                        style={{width:"100%",padding:"7px 10px",background:C.card2,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/>
                    </div>
                    <div style={{display:"flex",alignItems:"flex-end",paddingBottom:4}}>
                      <div style={{fontSize:10,color:C.muted,fontStyle:"italic"}}>
                        {(form.cuotas_renovacion||[]).length>0&&(
                          <>Total cuotas: <strong style={{color:C.green}}>{$$((()=>{const calc=calcMontoRealCuota(form.cuotas_renovacion,form.monto_renovacion,form.tasa_anual,form.mes_ingreso_renovacion&&form.anio_ingreso_renovacion?`${form.mes_ingreso_renovacion}-${String(form.anio_ingreso_renovacion).slice(-2)}`:'');return calc.reduce((s,c)=>s+(c.montoReal||0),0);})())}</strong></>
                        )}
                      </div>
                    </div>
                  </div>

                </div>
              )}
            </div>

            <div style={{padding:"12px 20px",borderTop:`1px solid ${C.border}`,
              display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={()=>setModal(false)}
                style={{padding:"8px 18px",borderRadius:8,border:`1px solid ${C.border}`,
                  background:"transparent",color:C.muted,cursor:"pointer",fontSize:12}}>
                Cancelar
              </button>
              <button onClick={guardar}
                style={{padding:"8px 18px",borderRadius:8,border:"none",
                  background:C.blue,color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>
                💾 Guardar
              </button>
            </div>
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// SALDO DE DEUDA POR MES — subvista de Créditos
// Filas: meses desde el mes actual hasta el último vencimiento.
// Columnas: una por empresa + Total Grupo. Saldo al cierre del mes M =
// suma de cuotas (cuota/monto) con f_venc posterior al último día de M,
// de créditos no pagados (+ cuotas de renovación Capital+Interés).
// Montos en USD; toggle a CLP convierte con TC editable.
// ─────────────────────────────────────────────────────────────────
const MESES_ABR_SD = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MES2NUM_SD = {Ene:'01',Feb:'02',Mar:'03',Abr:'04',May:'05',Jun:'06',Jul:'07',Ago:'08',Sep:'09',Oct:'10',Nov:'11',Dic:'12'};
function isoFinMes(y,m){ const d=new Date(y,m+1,0); return `${y}-${String(m+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
// Fecha (día 28) de una cuota de renovación, para comparar con cierres.
function fechaCuotaRenov(cq){
  if(!cq?.anio||!cq?.mes) return '';
  return `${cq.anio}-${MES2NUM_SD[cq.mes]||'06'}-28`;
}
// Saldo de un crédito al cierre de fechaISO.
function saldoCreditoAt(c, fechaISO){
  let d = (!c.pagado && c.f_venc && c.f_venc>fechaISO) ? (Number(c.cuota)||0) : 0;
  if(c.renovable)(c.cuotas_renovacion||[]).forEach(cq=>{
    if((cq.tipo||'Solo Interés')==='Capital+Interés'){
      const f = fechaCuotaRenov(cq);
      if(f && f>fechaISO) d += Number(cq.monto)||0;
    }
  });
  return d;
}

function SaldoDeudaPorMes({creditos=[], empresas={}}){
  const [moneda,setMoneda]=useState("USD"); // USD | CLP
  const [tc,setTc]=useState(950);

  // Meses: desde el mes actual hasta el último vencimiento registrado.
  const meses = useMemo(()=>{
    let maxISO="";
    creditos.forEach(c=>{
      if(c.f_venc && c.f_venc>maxISO) maxISO=c.f_venc;
      if(c.renovable)(c.cuotas_renovacion||[]).forEach(cq=>{
        const f=fechaCuotaRenov(cq); if(f&&f>maxISO) maxISO=f;
      });
    });
    const now=new Date(); let y=now.getFullYear(), m=now.getMonth();
    const out=[];
    const maxY = maxISO?Number(maxISO.slice(0,4)):y;
    const maxM = maxISO?Number(maxISO.slice(5,7))-1:m;
    let cy=y, cm=m, guard=0;
    while((cy<maxY || (cy===maxY && cm<=maxM)) && guard<240){
      out.push({label:`${MESES_ABR_SD[cm]}-${String(cy).slice(2)}`, endISO:isoFinMes(cy,cm)});
      cm++; if(cm>11){cm=0;cy++;} guard++;
    }
    if(out.length===0) out.push({label:`${MESES_ABR_SD[m]}-${String(y).slice(2)}`, endISO:isoFinMes(y,m)});
    return out;
  },[creditos]);

  const emps = useMemo(()=>[...new Set(creditos.map(c=>c.empresa).filter(Boolean))].sort(),[creditos]);
  // matriz[empIndex][mesIndex] = saldo en USD
  const matriz = useMemo(()=> emps.map(emp=>{
    const ec = creditos.filter(c=>c.empresa===emp);
    return meses.map(mm=> ec.reduce((s,c)=>s+saldoCreditoAt(c,mm.endISO),0));
  }),[emps,meses,creditos]);

  const factor = moneda==="CLP" ? (Number(tc)||0) : 1;
  const sym = moneda==="CLP" ? "$" : "US$";
  const conv = (usd)=> usd*factor;            // a moneda de visualización
  const fmtK = (usd)=>{ const v=conv(usd); return v ? `${sym} ${Math.round(v/1000).toLocaleString("es-CL")} K` : "—"; };
  const totalMes = (i)=> emps.reduce((s,_,e)=>s+matriz[e][i],0);

  function exportarExcel(){
    const aoa = [["Mes", ...emps, "Total Grupo"]];
    meses.forEach((mm,i)=>{
      const row=[mm.label];
      emps.forEach((_,e)=> row.push(Math.round(conv(matriz[e][i]))));
      row.push(Math.round(conv(totalMes(i))));
      aoa.push(row);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Saldo por Mes");
    const now=new Date(); const mm=String(now.getMonth()+1).padStart(2,'0'); const yyyy=now.getFullYear();
    XLSX.writeFile(wb, `Saldo_Deuda_Grupo_${mm}${yyyy}.xlsx`);
  }

  return (
    <Card style={{padding:0,overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",padding:"12px 16px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{flex:1,minWidth:160}}>
          <SectionTitle>Saldo de Deuda por Mes</SectionTitle>
          <div style={{fontSize:10,color:C.muted}}>Saldo pendiente al cierre de cada mes · valores en miles ({moneda})</div>
        </div>
        <div style={{display:"flex",gap:4}}>
          {["USD","CLP"].map(mo=>(
            <button key={mo} onClick={()=>setMoneda(mo)}
              style={{padding:"5px 12px",borderRadius:7,border:`1px solid ${moneda===mo?C.blue:C.border}`,
                background:moneda===mo?C.blue:"transparent",color:moneda===mo?"#fff":C.muted,cursor:"pointer",fontSize:11,fontWeight:700}}>{mo}</button>
          ))}
        </div>
        {moneda==="CLP"&&(
          <label style={{fontSize:10,color:C.muted,display:"flex",alignItems:"center",gap:5}}>
            TC (CLP/USD)
            <input type="number" value={tc} onChange={e=>setTc(e.target.value)}
              style={{width:70,padding:"4px 7px",background:C.card2,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:11,outline:"none"}}/>
          </label>
        )}
        <button onClick={exportarExcel}
          style={{padding:"6px 14px",borderRadius:8,background:C.green,border:"none",color:"#fff",cursor:"pointer",fontSize:11,fontWeight:700}}>
          📥 Exportar a Excel
        </button>
      </div>
      <div style={{overflowX:"auto",minWidth:0,maxWidth:"calc(100vw - 80px)"}}>
        <table style={{borderCollapse:"collapse",fontSize:11,whiteSpace:"nowrap"}}>
          <thead>
            <tr style={{background:C.primary}}>
              <th style={{padding:"8px 14px",fontWeight:700,fontSize:10,color:C.text,textAlign:"left",
                borderBottom:`1px solid ${C.border}`,position:"sticky",left:0,background:C.bg2,zIndex:1,minWidth:90}}>Mes</th>
              {emps.map(emp=>{ const e=empresas[emp]||{emoji:"🏢"}; return (
                <th key={emp} style={{padding:"8px 14px",fontWeight:600,fontSize:10,color:C.muted,textAlign:"right",
                  borderBottom:`1px solid ${C.border}`,textTransform:"uppercase"}}>{e.emoji} {emp}</th>
              );})}
              <th style={{padding:"8px 14px",fontWeight:800,fontSize:10,color:C.text,textAlign:"right",
                borderBottom:`1px solid ${C.border}`,borderLeft:`1px solid ${C.border}`}}>Total Grupo</th>
            </tr>
          </thead>
          <tbody>
            {meses.map((mm,i)=>(
              <tr key={mm.endISO} style={{borderBottom:`1px solid ${C.border}22`}}>
                <td style={{padding:"7px 14px",fontWeight:700,color:C.text,position:"sticky",left:0,
                  background:C.card,zIndex:1,borderRight:`1px solid ${C.border}22`}}>{mm.label}</td>
                {emps.map((emp,e)=>{
                  const usd=matriz[e][i];
                  const sube = i>0 && usd>matriz[e][i-1]; // saldo aumentó (refinanciamiento / nueva deuda)
                  return (
                    <td key={emp} style={{padding:"7px 14px",textAlign:"right",
                      color:usd?C.text:C.muted2, fontWeight:usd?600:400,
                      background:sube?`${C.yellow}22`:"transparent"}}>
                      {fmtK(usd)}{sube&&<span title="Saldo subió respecto al mes anterior" style={{color:C.yellow,marginLeft:3}}>▲</span>}
                    </td>
                  );
                })}
                <td style={{padding:"7px 14px",textAlign:"right",fontWeight:800,
                  color:totalMes(i)?C.red:C.green,borderLeft:`1px solid ${C.border}`}}>
                  {totalMes(i)?fmtK(totalMes(i)):"✓"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
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

function fmtMoneda(v,sym) {
  if(!v&&v!==0) return "—";
  const abs=Math.abs(v),s=v<0?"-":"";
  if(abs>=1_000_000) return `${s}${sym}${(abs/1e6).toFixed(2)}M`;
  if(abs>=1_000)     return `${s}${sym}${(abs/1e3).toFixed(1)}K`;
  return `${s}${sym}${abs.toLocaleString()}`;
}

const EMPRESAS_LIST = [
  "Mediterra","Allegria Foods","Allegria Service",
  "Frisku Foods","Allpa Farms",
  "Allpa Farms Perú","Integrity Farms","Osiris"
];
const BANCOS_CHILE = ["BCI","BICE","Security","Chile","Santander"];
const BANCOS_PERU  = ["Scotiabank Perú","BBVA Perú"];

function generarCuentasFijas() {
  const cuentas = [];
  EMPRESAS_LIST.forEach(emp => {
    const esPeruana = emp.includes("Perú");
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

function SaldosBancos({saldos,onSave,canEdit,empresasPermitidas}) {
  // Subset de empresas que el usuario puede ver. Si no se pasa la prop → todas.
  // Todos los agregados (KPIs, totales, render) se calculan SOLO sobre este subset.
  const EMPRESAS_VISIBLES = useMemo(
    () => Array.isArray(empresasPermitidas) && empresasPermitidas.length>0
      ? EMPRESAS_LIST.filter(e => empresasPermitidas.includes(e))
      : EMPRESAS_LIST,
    [empresasPermitidas]
  );
  const CUENTAS_VISIBLES = useMemo(
    () => CUENTAS_FIJAS.filter(c => EMPRESAS_VISIBLES.includes(c.emp)),
    [EMPRESAS_VISIBLES]
  );
  const empresaVisibleSet = useMemo(() => new Set(EMPRESAS_VISIBLES), [EMPRESAS_VISIBLES]);
  const hayChile = EMPRESAS_VISIBLES.some(e => !e.includes("Perú"));
  const hayPeru  = EMPRESAS_VISIBLES.some(e =>  e.includes("Perú"));

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
    // El payload al parent contiene SOLO el subset de keys que el usuario
    // tiene permitido ver. El parent se encarga del merge contra el blob completo.
    // Partimos de las keys visibles del prop saldos para que el comportamiento
    // sea el mismo que antes (clone + mutaciones por dirty) pero restringido.
    const next = {};
    Object.entries(saldos||{}).forEach(([k,v])=>{
      const [emp] = (k||"").split("||");
      if(empresaVisibleSet.has(emp)) next[k] = JSON.parse(JSON.stringify(v));
    });
    Object.keys(dirty).forEach(key=>{
      const c=CUENTAS_VISIBLES.find(x=>x.key===key);
      if(!c) return; // descartar dirty fuera del subset (defensa)
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
    EMPRESAS_VISIBLES.forEach(emp=>{
      let sum=0;
      CUENTAS_VISIBLES.filter(c=>c.emp===emp).forEach(c=>{
        const s=saldos?.[c.key];
        if(!s||s.monto==null) return;
        // Si FX cargado: convertir en vivo
        if(fx) {
          const usdVal=toUSD(s.monto,c.moneda,fx);
          if(usdVal!=null) sum+=usdVal;
        } else if(s.usd!=null) {
          // Usar valor USD guardado en Supabase como fallback
          sum+=Number(s.usd)||0;
        } else if(c.moneda==="usd") {
          // USD directo sin conversión
          sum+=Number(s.monto)||0;
        }
        // CLP/EUR/PEN sin FX y sin usd guardado: no suma (evita mostrar valor incorrecto)
      });
      t[emp]=sum; // siempre número, 0 si no hay saldo
    });
    return t;
  },[saldos,fx,EMPRESAS_VISIBLES,CUENTAS_VISIBLES]);

  const totalUSD = useMemo(()=>{
    return Object.values(totalesEmpresa).reduce((a,b)=>a+b,0);
  },[totalesEmpresa]);

  // Total excluyendo Allpa Farms Perú (= saldo inicial del flujo consolidado IAS 28)
  const totalConsolidadoUSD = useMemo(()=>{
    return EMPRESAS_VISIBLES
      .filter(e => e !== "Allpa Farms Perú")
      .reduce((a, e) => a + (totalesEmpresa[e]||0), 0);
  },[totalesEmpresa, EMPRESAS_VISIBLES]);

  // Totales separados Chile y Perú (en USD) — solo sobre el subset visible
  const {totalChileUSD, totalPeruUSD} = useMemo(()=>{
    let chile=0, peru=0;
    EMPRESAS_VISIBLES.forEach(emp=>{
      const usd = totalesEmpresa[emp]||0;
      if(emp.includes("Perú")) peru += usd;
      else chile += usd;
    });
    return {totalChileUSD:chile, totalPeruUSD:peru};
  },[totalesEmpresa,EMPRESAS_VISIBLES]);

  const hasDirty=Object.keys(dirty).length>0;
  const sym=(id)=>MONEDAS.find(m=>m.id===id)?.symbol||"$";

  const porEmpresa = useMemo(()=>{
    const m={};
    CUENTAS_VISIBLES.forEach(c=>{
      if(!m[c.emp]) m[c.emp]=[];
      m[c.emp].push(c);
    });
    return m;
  },[CUENTAS_VISIBLES]);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10}}>
        <div style={{background:C.card,border:`2px solid ${C.accent}`,borderRadius:10,
          padding:"12px 16px",gridColumn:"span 2"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
            <div>
              <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",marginBottom:4}}>
                💵 Saldo Consolidado
                <span style={{marginLeft:5,fontSize:8,color:C.muted2,fontWeight:400,textTransform:"none"}}>sin Allpa Perú · = saldo inicial del flujo</span>
                {fxLoading&&<span style={{marginLeft:6,fontSize:9,color:C.yellow}}>actualizando…</span>}
                {fxError&&<span style={{marginLeft:6,fontSize:9,color:C.red}}>⚠️ sin paridad</span>}
              </div>
              <div style={{fontSize:22,fontWeight:900,color:totalConsolidadoUSD!=null?cf(totalConsolidadoUSD):C.muted}}>
                {totalConsolidadoUSD!=null?`$${totalConsolidadoUSD.toLocaleString("es-CL",{maximumFractionDigits:0})} USD`:"—"}
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",marginBottom:4}}>Total Grupo (incl. Allpa Perú)</div>
              <div style={{fontSize:15,fontWeight:700,color:C.muted}}>
                {totalUSD!=null?`$${totalUSD.toLocaleString("es-CL",{maximumFractionDigits:0})} USD`:"—"}
              </div>
            </div>
          </div>
        </div>
        {hayChile&&(
        <div style={{background:C.card,border:`1px solid #3b82f6`,borderRadius:10,padding:"12px 16px"}}>
          <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",marginBottom:4}}>🇨🇱 Total Chile</div>
          <div style={{fontSize:18,fontWeight:900,color:"#3b82f6"}}>
            ${totalChileUSD.toLocaleString("es-CL",{maximumFractionDigits:0})} <span style={{fontSize:11,color:C.muted}}>USD</span>
          </div>
        </div>
        )}
        {hayPeru&&(
        <div style={{background:C.card,border:`1px solid #ef4444`,borderRadius:10,padding:"12px 16px"}}>
          <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",marginBottom:4}}>🇵🇪 Total Perú</div>
          <div style={{fontSize:18,fontWeight:900,color:"#ef4444"}}>
            ${totalPeruUSD.toLocaleString("es-CL",{maximumFractionDigits:0})} <span style={{fontSize:11,color:C.muted}}>USD</span>
          </div>
        </div>
        )}
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

      {/* ── Dashboard resumen por empresa ─────────────────────── */}
      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
          <SectionTitle>Resumen por empresa · USD</SectionTitle>
          {fxLoading&&<span style={{fontSize:10,color:C.yellow}}>⟳ Actualizando FX…</span>}
          {fxError&&<span style={{fontSize:10,color:C.orange}}>⚠️ Sin FX en vivo — usando valores guardados</span>}
        </div>
        {(()=>{
          const maxVal=Math.max(...EMPRESAS_VISIBLES.map(n=>totalesEmpresa[n]||0),1);
          return(
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {EMPRESAS_VISIBLES.map(emp=>{
                const e=EMPRESAS_STATIC[emp]||{emoji:"🏢",color:C.muted};
                const usd=totalesEmpresa[emp]||0;
                const pct=Math.max(0,(usd/maxVal)*100);
                return(
                  <div key={emp} style={{display:"grid",gridTemplateColumns:"190px 1fr 120px",gap:10,alignItems:"center",
                    cursor:"pointer",borderRadius:6,padding:"2px 4px",transition:"background 0.2s"}}
                    onMouseEnter={e2=>e2.currentTarget.style.background=`${e.color}15`}
                    onMouseLeave={e2=>e2.currentTarget.style.background="transparent"}
                    onClick={()=>{
                      // Abrir la sección de detalle si está colapsada
                      if(collapsed[emp]) setCollapsed(p=>({...p,[emp]:false}));
                      // Scroll al detalle
                      setTimeout(()=>{
                        const el=document.getElementById(`saldos-emp-${emp.replace(/\s/g,"-")}`);
                        if(el) el.scrollIntoView({behavior:"smooth",block:"start"});
                      },100);
                    }}
                    title={`Click para ver detalle de ${emp}`}>
                    <div style={{fontSize:11,color:C.text,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {e.emoji} {emp}
                    </div>
                    <div style={{background:C.card2,borderRadius:4,height:10,overflow:"hidden"}}>
                      <div style={{width:`${pct}%`,height:"100%",background:usd>0?e.color:C.muted2,borderRadius:4,opacity:0.8,transition:"width 0.4s"}}/>
                    </div>
                    <div style={{textAlign:"right",fontSize:12,fontWeight:usd>0?700:400,color:usd>0?cf(usd):C.muted}}>
                      {usd>0?"$"+usd.toLocaleString("es-CL",{maximumFractionDigits:0}):usd<0?"-$"+Math.abs(usd).toLocaleString("es-CL",{maximumFractionDigits:0}):"—"}
                    </div>
                  </div>
                );
              })}
              <div style={{borderTop:`2px solid ${C.border2}`,marginTop:4,paddingTop:8,
                display:"grid",gridTemplateColumns:"190px 1fr 120px",gap:10,alignItems:"center"}}>
                <div style={{fontSize:12,fontWeight:900,color:C.text}}>TOTAL GRUPO</div>
                <div/>
                <div style={{textAlign:"right",fontSize:15,fontWeight:900,color:cf(totalUSD)}}>
                  {totalUSD>=0?"$":"-$"}{Math.abs(totalUSD).toLocaleString("es-CL",{maximumFractionDigits:0})}
                  <span style={{fontSize:9,color:C.muted,marginLeft:4}}>USD</span>
                </div>
              </div>
            </div>
          );
        })()}
      </Card>

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
        {EMPRESAS_VISIBLES.map(emp=>{
          const cuentas=porEmpresa[emp]||[];
          const empColor=EMPRESAS_STATIC[emp]?.color||C.muted;
          const empEmoji=EMPRESAS_STATIC[emp]?.emoji||"🏢";
          const empUSD=totalesEmpresa[emp]||0;
          const isOpen=!collapsed[emp];
          const dirtyCount=cuentas.filter(c=>dirty[c.key]).length;

          return (
            <div key={emp} id={`saldos-emp-${emp.replace(/\s/g,"-")}`} style={{background:C.card,border:`1px solid ${isOpen?empColor+"55":C.border}`,
              borderRadius:12,overflow:"hidden"}}>
              <button onClick={()=>toggleEmp(emp)}
                style={{width:"100%",background:`${empColor}18`,border:"none",cursor:"pointer",
                  padding:"12px 16px",display:"flex",alignItems:"center",gap:12,textAlign:"left"}}>
                <span style={{fontSize:20}}>{empEmoji}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:800,color:empColor}}>{emp}</div>
                  <div style={{fontSize:11,color:empUSD>0?cf(empUSD):C.muted,marginTop:1}}>
                    {empUSD>0?`$${empUSD.toLocaleString("es-CL",{maximumFractionDigits:0})} USD`:"Sin saldo USD"}
                  </div>
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
                        // Si FX cargado: convertir en vivo. Si no: usar usd guardado o monto directo si es USD
                        const usdVal = saved?.monto!=null
                          ? fx
                            ? toUSD(saved.monto,c.moneda,fx)
                            : (saved.usd!=null ? saved.usd : c.moneda==="usd" ? Number(saved.monto) : null)
                          : null;
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
// INTERCOMPANY — Transferencias entre empresas del grupo
// ═══════════════════════════════════════════════════════════════════
const TIPOS_IC = ["Préstamo","Aporte de Capital","Devolución Préstamo","Pago Intereses","Transferencia"];
const IC_COLOR  = {"Préstamo":"#60a5fa","Aporte de Capital":"#34d399","Devolución Préstamo":"#a78bfa",
  "Pago Intereses":"#f87171","Transferencia":"#fbbf24"};

function Intercompany({transferencias=[],onSave,empresas={},canEdit}) {
  const empNames = Object.keys(empresas);
  const [modal,setModal]   = useState(false);
  const [filtroOr,setFiltroOr] = useState("Todas");
  const [filtroDest,setFiltroDest] = useState("Todas");
  const [filtroTipo,setFiltroTipo] = useState("Todos");
  const [form,setForm]     = useState({
    fecha:new Date().toISOString().slice(0,10),
    origen:"",destino:"",tipo:"Préstamo",
    monto:"",descripcion:"",mes:"",
  });
  const [editId,setEditId] = useState(null);

  // KPIs
  const totalPrestamos   = transferencias.filter(t=>t.tipo==="Préstamo").reduce((s,t)=>s+(Number(t.monto)||0),0);
  const totalAportes     = transferencias.filter(t=>t.tipo==="Aporte de Capital").reduce((s,t)=>s+(Number(t.monto)||0),0);
  const totalDevoluciones= transferencias.filter(t=>t.tipo==="Devolución Préstamo").reduce((s,t)=>s+(Number(t.monto)||0),0);

  // Saldo neto por empresa (recibido - enviado)
  const saldoEmpresa = useMemo(()=>{
    const s={};
    empNames.forEach(n=>{ s[n]=0; });
    transferencias.forEach(t=>{
      const m=Number(t.monto)||0;
      if(s[t.destino]!==undefined) s[t.destino]+=m;
      if(s[t.origen]!==undefined)  s[t.origen]-=m;
    });
    return s;
  },[transferencias,empNames]); // eslint-disable-line

  const filtrado = transferencias.filter(t=>{
    if(filtroOr!=="Todas"&&t.origen!==filtroOr) return false;
    if(filtroDest!=="Todas"&&t.destino!==filtroDest) return false;
    if(filtroTipo!=="Todos"&&t.tipo!==filtroTipo) return false;
    return true;
  }).sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));

  function openNew() {
    setForm({fecha:new Date().toISOString().slice(0,10),origen:"",destino:"",tipo:"Préstamo",monto:"",descripcion:"",mes:""});
    setEditId(null);
    setModal(true);
  }
  function openEdit(t) {
    setForm({...t,monto:String(t.monto)});
    setEditId(t.id);
    setModal(true);
  }
  function guardar() {
    if(!form.origen||!form.destino||!form.monto){alert("Origen, destino y monto son obligatorios.");return;}
    if(form.origen===form.destino){alert("Origen y destino no pueden ser la misma empresa.");return;}
    const item={...form,monto:parseFloat(form.monto)||0,
      id:editId||`ic_${Date.now()}`};
    const next = editId
      ? transferencias.map(t=>t.id===editId?item:t)
      : [...transferencias,item];
    onSave(next);
    setModal(false);
  }
  function eliminar(id) {
    if(!window.confirm("¿Eliminar esta transferencia?")) return;
    onSave(transferencias.filter(t=>t.id!==id));
  }

  const fmtFecha=s=>{if(!s)return"—";const d=new Date(s);return`${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;}

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10}}>
        {[
          ["🏦 Total Préstamos",    $$(totalPrestamos),    "#60a5fa"],
          ["💚 Aportes Capital",    $$(totalAportes),      "#34d399"],
          ["↩️ Devoluciones",       $$(totalDevoluciones), "#a78bfa"],
          ["📋 Transferencias",     transferencias.length, C.yellow],
        ].map(([l,v,c])=>(
          <div key={l} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 16px"}}>
            <div style={{fontSize:10,color:C.muted,marginBottom:4}}>{l}</div>
            <div style={{fontSize:18,fontWeight:800,color:c}}>{v}</div>
          </div>
        ))}
      </div>

      {/* Saldo neto por empresa */}
      <Card>
        <SectionTitle>Saldo Neto Intercompany por Empresa</SectionTitle>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {empNames.filter(n=>saldoEmpresa[n]!==0).map(n=>{
            const e=empresas[n];
            const v=saldoEmpresa[n];
            return (
              <div key={n} style={{display:"grid",gridTemplateColumns:"200px 1fr 120px",gap:10,alignItems:"center"}}>
                <div style={{fontSize:11,color:C.text,fontWeight:600}}>{e?.emoji} {n}</div>
                <div style={{background:C.card2,borderRadius:4,height:8,overflow:"hidden"}}>
                  <div style={{width:`${Math.min(Math.abs(v)/Math.max(...empNames.map(x=>Math.abs(saldoEmpresa[x]||0)),1)*100,100)}%`,
                    height:"100%",background:v>0?"#34d399":"#f87171",borderRadius:4,opacity:0.8}}/>
                </div>
                <div style={{textAlign:"right",fontSize:12,fontWeight:700,color:v>0?"#34d399":"#f87171"}}>
                  {v>0?"↑ ":"↓ "}{$$(Math.abs(v))}
                </div>
              </div>
            );
          })}
          {empNames.every(n=>saldoEmpresa[n]===0)&&(
            <div style={{fontSize:12,color:C.muted,textAlign:"center",padding:16}}>Sin transferencias registradas</div>
          )}
        </div>
      </Card>

      {/* Controles */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        {canEdit&&(
          <button onClick={openNew}
            style={{padding:"8px 18px",borderRadius:8,border:"none",background:"#f59e0b",
              color:"#000",cursor:"pointer",fontSize:12,fontWeight:700}}>
            + Nueva Transferencia
          </button>
        )}
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginLeft:8}}>
          {[["Origen",["Todas",...empNames],filtroOr,setFiltroOr],
            ["Destino",["Todas",...empNames],filtroDest,setFiltroDest],
            ["Tipo",["Todos",...TIPOS_IC],filtroTipo,setFiltroTipo],
          ].map(([lbl,opts,val,set])=>(
            <div key={lbl} style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontSize:10,color:C.muted}}>{lbl}:</span>
              <select value={val} onChange={e=>set(e.target.value)}
                style={{padding:"5px 8px",background:C.card2,border:`1px solid ${C.border}`,
                  borderRadius:6,color:C.text,fontSize:11,outline:"none"}}>
                {opts.map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <Card style={{padding:0,overflow:"hidden"}}>
        <div style={{overflowX:"auto",minWidth:0,maxWidth:"calc(100vw - 80px)"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead>
              <tr style={{background:C.primary}}>
                {["Fecha","Origen","Destino","Tipo","Monto","Mes Flujo","Descripción",...(canEdit?[""]:[])].map(h=>(
                  <th key={h} style={{padding:"8px 12px",fontWeight:600,fontSize:10,color:C.muted,
                    textTransform:"uppercase",borderBottom:`1px solid ${C.border}`,
                    textAlign:["Monto"].includes(h)?"right":"left",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrado.length===0&&(
                <tr><td colSpan={canEdit?8:7} style={{padding:32,textAlign:"center",color:C.muted}}>
                  Sin transferencias registradas
                </td></tr>
              )}
              {filtrado.map(t=>{
                const eOr=empresas[t.origen]||{emoji:"🏢",color:C.muted};
                const eDest=empresas[t.destino]||{emoji:"🏢",color:C.muted};
                const tipoColor=IC_COLOR[t.tipo]||C.muted;
                return (
                  <tr key={t.id} style={{borderBottom:`1px solid ${C.border}22`}}
                    onClick={canEdit?()=>openEdit(t):undefined}
                    onMouseEnter={e=>{if(canEdit)e.currentTarget.style.background=`${C.card2}`;}}
                    onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
                    <td style={{padding:"8px 12px",color:C.muted,whiteSpace:"nowrap"}}>{fmtFecha(t.fecha)}</td>
                    <td style={{padding:"8px 12px",fontWeight:600,color:eOr.color,whiteSpace:"nowrap"}}>
                      {eOr.emoji} {t.origen}
                    </td>
                    <td style={{padding:"8px 12px",fontWeight:600,color:eDest.color,whiteSpace:"nowrap"}}>
                      {eDest.emoji} {t.destino}
                    </td>
                    <td style={{padding:"8px 12px"}}>
                      <span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,
                        background:`${tipoColor}22`,color:tipoColor,border:`1px solid ${tipoColor}44`}}>
                        {t.tipo}
                      </span>
                    </td>
                    <td style={{padding:"8px 12px",textAlign:"right",fontWeight:700,color:C.green}}>
                      {$$(t.monto)}
                    </td>
                    <td style={{padding:"8px 12px",color:C.muted}}>{t.mes||"—"}</td>
                    <td style={{padding:"8px 12px",color:C.text,maxWidth:220,
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {t.descripcion||"—"}
                    </td>
                    {canEdit&&(
                      <td style={{padding:"6px 12px"}}>
                        <button onClick={e=>{e.stopPropagation();eliminar(t.id);}}
                          style={{background:"#fee2e2",border:"none",borderRadius:6,
                            padding:"3px 8px",cursor:"pointer",color:"#991b1b",fontSize:11,fontWeight:700}}>
                          ×
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal nueva / editar transferencia */}
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:400,
          display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:C.bg2,border:`1px solid #f59e0b55`,borderRadius:16,
            width:520,maxWidth:"95vw",boxShadow:"0 24px 64px rgba(0,0,0,0.7)"}}>
            <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`,
              display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:22}}>🔄</span>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:800,color:C.text}}>
                  {editId?"Editar":"Nueva"} Transferencia Intercompany
                </div>
              </div>
              <button onClick={()=>setModal(false)}
                style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:20}}>×</button>
            </div>
            <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:12}}>
              {[
                ["Fecha","fecha","date",null],
                ["Mes en flujo de caja","mes","select",["",...MESES_65]],
                ["Tipo de transferencia","tipo","select",TIPOS_IC],
              ].map(([lbl,field,type,opts])=>(
                <div key={field}>
                  <label style={{fontSize:11,fontWeight:600,color:C.muted,display:"block",marginBottom:4}}>{lbl}</label>
                  {opts?(
                    <select value={form[field]||""} onChange={e=>setForm(p=>({...p,[field]:e.target.value}))}
                      style={{width:"100%",padding:"8px 10px",background:C.card2,border:`1px solid ${C.border}`,
                        borderRadius:8,color:C.text,fontSize:12,outline:"none"}}>
                      {opts.map(o=><option key={o} value={o}>{o||"— seleccionar mes —"}</option>)}
                    </select>
                  ):(
                    <input type={type} value={form[field]||""} onChange={e=>setForm(p=>({...p,[field]:e.target.value}))}
                      style={{width:"100%",padding:"8px 10px",background:C.card2,border:`1px solid ${C.border}`,
                        borderRadius:8,color:C.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/>
                  )}
                </div>
              ))}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div>
                  <label style={{fontSize:11,fontWeight:600,color:C.muted,display:"block",marginBottom:4}}>
                    Empresa Origen (paga / envía)
                  </label>
                  <select value={form.origen} onChange={e=>setForm(p=>({...p,origen:e.target.value}))}
                    style={{width:"100%",padding:"8px 10px",background:C.card2,border:`1px solid ${C.border}`,
                      borderRadius:8,color:form.origen?empresas[form.origen]?.color||C.text:C.muted,
                      fontSize:12,outline:"none"}}>
                    <option value="">— seleccionar —</option>
                    {empNames.map(n=><option key={n} value={n}>{empresas[n]?.emoji} {n}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{fontSize:11,fontWeight:600,color:C.muted,display:"block",marginBottom:4}}>
                    Empresa Destino (recibe)
                  </label>
                  <select value={form.destino} onChange={e=>setForm(p=>({...p,destino:e.target.value}))}
                    style={{width:"100%",padding:"8px 10px",background:C.card2,border:`1px solid ${C.border}`,
                      borderRadius:8,color:form.destino?empresas[form.destino]?.color||C.text:C.muted,
                      fontSize:12,outline:"none"}}>
                    <option value="">— seleccionar —</option>
                    {empNames.filter(n=>n!==form.origen).map(n=><option key={n} value={n}>{empresas[n]?.emoji} {n}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:600,color:C.muted,display:"block",marginBottom:4}}>Monto USD</label>
                <input type="number" value={form.monto} onChange={e=>setForm(p=>({...p,monto:e.target.value}))}
                  placeholder="0"
                  style={{width:"100%",padding:"8px 10px",background:C.card2,border:`1px solid ${C.border}`,
                    borderRadius:8,color:C.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:600,color:C.muted,display:"block",marginBottom:4}}>
                  Descripción (opcional)
                </label>
                <input type="text" value={form.descripcion||""} onChange={e=>setForm(p=>({...p,descripcion:e.target.value}))}
                  placeholder="Ej: Capital de trabajo temporada cereza 2026"
                  style={{width:"100%",padding:"8px 10px",background:C.card2,border:`1px solid ${C.border}`,
                    borderRadius:8,color:C.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/>
              </div>
              {form.origen&&form.destino&&form.monto&&(
                <div style={{background:`${"#f59e0b"}18`,border:`1px solid ${"#f59e0b"}44`,
                  borderRadius:10,padding:"10px 14px",fontSize:11,color:"#f59e0b"}}>
                  📤 <strong>{form.origen}</strong> → <strong>{form.destino}</strong> · {$$(parseFloat(form.monto)||0)} USD
                  {form.tipo==="Préstamo"&&<span style={{marginLeft:8,color:C.muted}}>
                    (registra como egreso en origen e ingreso en destino)
                  </span>}
                </div>
              )}
            </div>
            <div style={{padding:"12px 20px",borderTop:`1px solid ${C.border}`,
              display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={()=>setModal(false)}
                style={{padding:"8px 18px",borderRadius:8,border:`1px solid ${C.border}`,
                  background:"transparent",color:C.muted,cursor:"pointer",fontSize:12}}>
                Cancelar
              </button>
              <button onClick={guardar}
                style={{padding:"8px 18px",borderRadius:8,border:"none",
                  background:"#f59e0b",color:"#000",cursor:"pointer",fontSize:12,fontWeight:700}}>
                💾 Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// REPORTE SEMANAL — HELPERS DE CÁLCULO
// ═══════════════════════════════════════════════════════════════════

// Constantes del módulo
// IMPORTANTE: estos nombres deben coincidir EXACTAMENTE con las claves en EMPRESAS_STATIC
const REPORTE_EMPRESAS = [
  "Mediterra",
  "Allegria Foods",
  "Allegria Service",
  "Frisku Foods",
  "Osiris",
  "Integrity Farms",
  "Allpa Farms",
  // Allpa Farms Perú EXCLUIDO del reporte (consolidación independiente)
];

// Nombres "amistosos" para mostrar en el PDF (no afecta la lógica)
const REPORTE_EMPRESAS_DISPLAY = {
  "Mediterra": "Mediterra Holding",
  "Allegria Foods": "Allegria Foods",
  "Allegria Service": "Allegria Service",
  "Frisku Foods": "Frisku Foods",
  "Osiris": "Osiris Plant Management",
  "Integrity Farms": "Integrity Farms",
  "Allpa Farms": "Allpa Farms Chile",
};

const REPORTE_UMBRALES_DEFAULT = {
  "Mediterra": 500000,
  "Allegria Foods": 300000,
  "Allegria Service": 200000,
  "Frisku Foods": 80000,
  "Osiris": 100000,
  "Integrity Farms": 50000,
  "Allpa Farms": 200000,
};

// Tipos de cambio fallback (si no hay tipo en params)
const REPORTE_TC_DEFAULT_CLP = 950;  // CLP por USD
const REPORTE_TC_DEFAULT_PEN = 3.75; // PEN por USD

// Formateadores
function _formatUSD(v, sign=false) {
  if(v == null || isNaN(v)) return "—";
  const abs = Math.abs(v);
  const str = `USD ${Math.round(abs).toLocaleString("es-CL")}`;
  if(v < 0) return `-${str}`;
  if(sign && v > 0) return `+${str}`;
  return str;
}
function _formatCLP(v) {
  if(v == null || isNaN(v)) return "—";
  return `CLP ${Math.round(v).toLocaleString("es-CL")}`;
}

// Saldo bancos por moneda para una empresa específica
function reporte_calcSaldosPorMoneda(empNombre, saldosBancos, tcUSDtoCLP = REPORTE_TC_DEFAULT_CLP) {
  const resultado = { usd: 0, clp: 0, equivCLPenUSD: 0, totalUSD: 0, lineas: [] };
  if(!saldosBancos) return resultado;
  Object.keys(saldosBancos).forEach(key => {
    // key formato: "Empresa||Banco||moneda"
    const partes = key.split("||");
    if(partes.length < 3) return;
    const [emp, banco, moneda] = partes;
    if(emp !== empNombre) return;
    const monto = Number(saldosBancos[key]?.monto) || 0;
    if(monto === 0) return;
    const monedaLower = (moneda || "").toLowerCase();
    if(monedaLower === "usd") {
      resultado.usd += monto;
      resultado.lineas.push({moneda:"USD", banco, monto, descripcion:`${banco} USD`});
    } else if(monedaLower === "clp") {
      resultado.clp += monto;
      resultado.lineas.push({moneda:"CLP", banco, monto, descripcion:`${banco} CLP`});
    } else if(monedaLower === "pen") {
      // PEN convertido a USD directamente (no se separa)
      const enUSD = monto / REPORTE_TC_DEFAULT_PEN;
      resultado.usd += enUSD;
      resultado.lineas.push({moneda:"PEN", banco, monto, descripcion:`${banco} PEN (equiv. USD)`, enUSD});
    }
  });
  // Equivalente CLP en USD
  resultado.equivCLPenUSD = resultado.clp / (tcUSDtoCLP || REPORTE_TC_DEFAULT_CLP);
  resultado.totalUSD = resultado.usd + resultado.equivCLPenUSD;
  return resultado;
}

// Saldo proyectado mensual para una empresa
// USA LA MISMA LÓGICA QUE FlujoEmpresa (flujoArr + acumArr)
// Retorna array de { mes, saldo, flujoMes } para los meses solicitados
// `mesesIdx` es un array de índices en MESES_65 (no labels)
function reporte_calcSaldoProyectadoMensual_v2(empNombre, realData, empresas, saldosBancos, mesesIdx, subLinesGlobal, addedLinesGlobal) {
  const empData = empresas[empNombre];
  if(!empData) {
    console.warn(`[ReporteSemanal] Empresa "${empNombre}" no encontrada`);
    return mesesIdx.map(i => ({idx:i, mes:MESES_65[i]||"—", saldo:0, flujoMes:0, esPasado:true}));
  }

  // 1. Saldo inicial: getSaldoBancoUSD o emp.saldo_ini
  const saldoIni = (()=>{
    const sb = getSaldoBancoUSD(saldosBancos, empNombre);
    return sb != null ? sb : (Number(empData.saldo_ini)||0);
  })();

  // 2. mesIdxInicioSaldo: el mes de hoy en MESES_65
  const HOY = new Date();
  const labelHoy = `${MN[HOY.getMonth()]}-${String(HOY.getFullYear()).slice(2)}`;
  let mesIdxInicioSaldo = MESES_65.indexOf(labelHoy);
  if(mesIdxInicioSaldo < 0) mesIdxInicioSaldo = 0;

  // 3. Recursos del empData
  const proyOverrides = realData?.[empNombre]?._proyOverrides || {};
  const subLines = subLinesGlobal?.[empNombre] || {};
  const addedLines = addedLinesGlobal?.[empNombre] || {};

  // 4. getProy: idéntica a la de FlujoEmpresa
  function getProy(lineLabel, idx) {
    const ov = proyOverrides[lineLabel]?.[idx];
    let base = 0;
    for(const sec of empData.sections){
      const l = sec.lines.find(x=>x.label===lineLabel);
      if(l){ base = l.proy?.[idx]||0; break; }
    }
    if(ov === undefined) return base;
    if(typeof ov === "number") return ov;
    if(typeof ov === "object" && ov !== null) {
      let total = 0;
      for(let s=0; s<4; s++){
        const k = `_sem${s}`;
        if(ov[k] !== undefined) total += Number(ov[k])||0;
      }
      return total;
    }
    return base;
  }

  // 5. Construir flujoArr completo (idéntico a FlujoEmpresa)
  const flujoArr = MESES_65.map((_,i)=>{
    let f = 0;
    empData.sections.forEach(sec=>{
      sec.lines.forEach(l=>{
        const v = getProy(l.label, i);
        f += v * sec.signo;
        // Sublines (CxC, Capital Calls, etc)
        if(l.subLines) (subLines[l.label]||[]).forEach(sl=>{
          if(typeof sl === "string") return;
          const vals = sl.vals || {};
          let sv = 0;
          let hasSem = false;
          for(let s=0; s<4; s++){
            const k = `${i}_${s}`;
            if(vals[k] !== undefined){ sv += Number(vals[k])||0; hasSem = true; }
          }
          if(!hasSem && vals[i] !== undefined) sv = Number(vals[i])||0;
          f += sv * sec.signo;
        });
      });
      // AddedLines del usuario (también con formato vals[i] o vals[i_semIdx])
      (addedLines[sec.cat]||[]).forEach(al=>{
        if(typeof al==="string") return;
        const v = al.vals||{};
        let av = Number(v[i])||0;
        Object.entries(v).forEach(([k,val])=>{
          if(k.startsWith(`${i}_`)) av += (Number(val)||0);
        });
        f += av * sec.signo;
      });
    });
    return f;
  });

  // 6. Construir acumArr (igual a FlujoEmpresa)
  let a = saldoIni;
  const acumArr = flujoArr.map((f,i)=>{
    if(i < mesIdxInicioSaldo) return null;
    if(i === mesIdxInicioSaldo) { a = saldoIni + f; return a; }
    a += f;
    return a;
  });

  // 7. Retornar solo los meses pedidos
  return mesesIdx.map(idx => {
    if(idx < 0 || idx >= MESES_65.length) return {idx, mes:"—", saldo:null, flujoMes:0, esPasado:true};
    const esPasado = idx < mesIdxInicioSaldo;
    return {
      idx,
      mes: MESES_65[idx],
      saldo: esPasado ? null : acumArr[idx],
      flujoMes: flujoArr[idx],
      esPasado,
    };
  });
}

// Detalle mensual completo de una empresa: ingresos, egresos, flujo neto, saldo final
// para una serie de meses (índices de MESES_65)
// Retorna [{idx, mes, ingresos, egresos, flujoNeto, saldo, esPasado}]
function reporte_calcDetalleMensual(empNombre, realData, empresas, saldosBancos, mesesIdx, subLinesGlobal, addedLinesGlobal) {
  const empData = empresas[empNombre];
  if(!empData) return mesesIdx.map(i => ({idx:i, mes:MESES_65[i]||"—", ingresos:0, egresos:0, flujoNeto:0, saldo:null, esPasado:true}));

  // Saldo inicial
  const saldoIni = (()=>{
    const sb = getSaldoBancoUSD(saldosBancos, empNombre);
    return sb != null ? sb : (Number(empData.saldo_ini)||0);
  })();

  // mesIdxInicioSaldo
  const HOY = new Date();
  const labelHoy = `${MN[HOY.getMonth()]}-${String(HOY.getFullYear()).slice(2)}`;
  let mesIdxInicioSaldo = MESES_65.indexOf(labelHoy);
  if(mesIdxInicioSaldo < 0) mesIdxInicioSaldo = 0;

  const proyOverrides = realData?.[empNombre]?._proyOverrides || {};
  const subLines = subLinesGlobal?.[empNombre] || {};
  const addedLines = addedLinesGlobal?.[empNombre] || {};

  function getProy(lineLabel, idx) {
    const ov = proyOverrides[lineLabel]?.[idx];
    let base = 0;
    for(const sec of empData.sections){
      const l = sec.lines.find(x=>x.label===lineLabel);
      if(l){ base = l.proy?.[idx]||0; break; }
    }
    if(ov === undefined) return base;
    if(typeof ov === "number") return ov;
    if(typeof ov === "object" && ov !== null) {
      let total = 0;
      for(let s=0; s<4; s++){
        const k = `_sem${s}`;
        if(ov[k] !== undefined) total += Number(ov[k])||0;
      }
      return total;
    }
    return base;
  }

  // Construir arrays completos de ingresos, egresos, flujo neto
  const ingresosArr = [];
  const egresosArr = [];
  const flujoArr = [];

  for(let i = 0; i < MESES_65.length; i++) {
    let ingTotal = 0;
    let egrTotal = 0;
    empData.sections.forEach(sec => {
      const esIngreso = sec.signo > 0;
      sec.lines.forEach(l => {
        const v = getProy(l.label, i);
        if(esIngreso) ingTotal += v;
        else egrTotal += v;
        // Sublines
        if(l.subLines) (subLines[l.label]||[]).forEach(sl=>{
          if(typeof sl === "string") return;
          const vals = sl.vals || {};
          let sv = 0;
          let hasSem = false;
          for(let s=0; s<4; s++){
            const k = `${i}_${s}`;
            if(vals[k] !== undefined){ sv += Number(vals[k])||0; hasSem = true; }
          }
          if(!hasSem && vals[i] !== undefined) sv = Number(vals[i])||0;
          if(esIngreso) ingTotal += sv;
          else egrTotal += sv;
        });
      });
      // AddedLines
      (addedLines[sec.cat]||[]).forEach(al=>{
        if(typeof al==="string") return;
        const v = al.vals||{};
        let av = Number(v[i])||0;
        Object.entries(v).forEach(([k,val])=>{
          if(k.startsWith(`${i}_`)) av += (Number(val)||0);
        });
        if(esIngreso) ingTotal += av;
        else egrTotal += av;
      });
    });
    ingresosArr.push(ingTotal);
    egresosArr.push(egrTotal);
    flujoArr.push(ingTotal - egrTotal);
  }

  // Acumular saldo
  let a = saldoIni;
  const saldoArr = flujoArr.map((f, i) => {
    if(i < mesIdxInicioSaldo) return null;
    if(i === mesIdxInicioSaldo) { a = saldoIni + f; return a; }
    a += f;
    return a;
  });

  return mesesIdx.map(idx => {
    if(idx < 0 || idx >= MESES_65.length) {
      return { idx, mes:"—", ingresos:0, egresos:0, flujoNeto:0, saldo:null, esPasado:true, esFueraRango:true };
    }
    return {
      idx,
      mes: MESES_65[idx],
      ingresos: ingresosArr[idx],
      egresos: egresosArr[idx],
      flujoNeto: flujoArr[idx],
      saldo: saldoArr[idx],
      esPasado: idx < mesIdxInicioSaldo,
    };
  });
}

// Obtener vista temporada (jul-jun) y calendario (ene-dic) para una empresa
function reporte_getProyeccionesEmpresa(empNombre, realData, empresas, saldosBancos, subLinesGlobal, addedLinesGlobal) {
  // Encontrar temporada actual y meses calendario actual desde MESES_65
  const HOY = new Date();
  const anioActual = HOY.getFullYear();
  const mesActual = HOY.getMonth();

  // Temporada: si estamos en Jul-Dic → temporada anio-anio+1, si Ene-Jun → anio-1-anio
  let seasonYear; // año de arranque de la temporada (jul-jun)
  if(mesActual >= 6) seasonYear = anioActual;
  else seasonYear = anioActual - 1;

  // Construir índices de la temporada (12 meses de Jul-seasonYear a Jun-seasonYear+1)
  const temporadaIdx = [];
  for(let m = 6; m < 12; m++) {
    const label = `${MN[m]}-${String(seasonYear).slice(2)}`;
    const idx = MESES_65.indexOf(label);
    if(idx >= 0) temporadaIdx.push(idx);
    else temporadaIdx.push(-1 - temporadaIdx.length); // marcador único para "mes antes del rango"
  }
  for(let m = 0; m < 6; m++) {
    const label = `${MN[m]}-${String(seasonYear+1).slice(2)}`;
    const idx = MESES_65.indexOf(label);
    if(idx >= 0) temporadaIdx.push(idx);
    else temporadaIdx.push(-100 - temporadaIdx.length);
  }

  // Calendario: 12 meses del año actual
  const calendarioIdx = [];
  for(let m = 0; m < 12; m++) {
    const label = `${MN[m]}-${String(anioActual).slice(2)}`;
    const idx = MESES_65.indexOf(label);
    if(idx >= 0) calendarioIdx.push(idx);
    else calendarioIdx.push(-1000 - calendarioIdx.length);
  }

  // Labels para display: convertir Apr-26 → "Abr 26", May-26 → "May 26", etc.
  const labelMapDisplay = {
    "Jan":"Ene","Feb":"Feb","Mar":"Mar","Apr":"Abr","May":"May","Jun":"Jun",
    "Jul":"Jul","Aug":"Ago","Sep":"Sep","Oct":"Oct","Nov":"Nov","Dec":"Dic",
  };
  function displayLabel(idx, fallbackMonth, fallbackYear) {
    if(idx < 0 || idx >= MESES_65.length) {
      // Mes fuera del rango disponible en la app
      return `${labelMapDisplay[MN[fallbackMonth]]} ${String(fallbackYear).slice(2)}`;
    }
    const lbl = MESES_65[idx]; // "May-26"
    const [mn3, yr2] = lbl.split("-");
    return `${labelMapDisplay[mn3]} ${yr2}`;
  }

  const temporadaRaw = reporte_calcSaldoProyectadoMensual_v2(empNombre, realData, empresas, saldosBancos, temporadaIdx.map(i => i >= 0 ? i : 0), subLinesGlobal, addedLinesGlobal);
  const calendarioRaw = reporte_calcSaldoProyectadoMensual_v2(empNombre, realData, empresas, saldosBancos, calendarioIdx.map(i => i >= 0 ? i : 0), subLinesGlobal, addedLinesGlobal);

  // Mapear con labels en español y marcar meses "fuera de rango" como N/A
  const temporada = temporadaIdx.map((idx, i) => {
    let mesNum, anioNum;
    if(i < 6) { mesNum = 6 + i; anioNum = seasonYear; }
    else { mesNum = i - 6; anioNum = seasonYear + 1; }
    if(idx < 0) {
      return { mes: displayLabel(-1, mesNum, anioNum), saldo: null, flujoMes: 0, esFueraRango: true };
    }
    const r = temporadaRaw[i];
    return { mes: displayLabel(idx, mesNum, anioNum), saldo: r.saldo, flujoMes: r.flujoMes, esPasado: r.esPasado };
  });

  const calendario = calendarioIdx.map((idx, i) => {
    if(idx < 0) {
      return { mes: displayLabel(-1, i, anioActual), saldo: null, flujoMes: 0, esFueraRango: true };
    }
    const r = calendarioRaw[i];
    return { mes: displayLabel(idx, i, anioActual), saldo: r.saldo, flujoMes: r.flujoMes, esPasado: r.esPasado };
  });

  return { temporada, calendario };
}

// Top 5 ingresos / egresos del mes en curso para una empresa
function reporte_getTopMovimientos(empNombre, realData, empresas, subLinesGlobal, addedLinesGlobal) {
  const empData = empresas[empNombre];
  if(!empData) return {ingresos:[], egresos:[]};

  // Mes actual en MESES_65
  const HOY = new Date();
  const labelHoy = `${MN[HOY.getMonth()]}-${String(HOY.getFullYear()).slice(2)}`;
  const mesIdx = MESES_65.indexOf(labelHoy);
  if(mesIdx < 0) return {ingresos:[], egresos:[]};

  const proyOverrides = realData?.[empNombre]?._proyOverrides || {};
  const subLines = subLinesGlobal?.[empNombre] || {};
  const addedLines = addedLinesGlobal?.[empNombre] || {};

  function getProy(lineLabel, idx) {
    const ov = proyOverrides[lineLabel]?.[idx];
    let base = 0;
    for(const sec of empData.sections){
      const l = sec.lines.find(x=>x.label===lineLabel);
      if(l){ base = l.proy?.[idx]||0; break; }
    }
    if(ov === undefined) return base;
    if(typeof ov === "number") return ov;
    if(typeof ov === "object" && ov !== null) {
      let total = 0;
      for(let s=0; s<4; s++){
        const k = `_sem${s}`;
        if(ov[k] !== undefined) total += Number(ov[k])||0;
      }
      return total;
    }
    return base;
  }

  const todasLineas = [];

  for(const sec of empData.sections) {
    const tipo = sec.signo > 0 ? "ingreso" : "egreso";
    for(const linea of (sec.lines || [])) {
      const v = getProy(linea.label, mesIdx);
      if(v > 0) todasLineas.push({ label: linea.label, monto: v, tipo });

      // SubLines
      if(linea.subLines) {
        const subList = subLines[linea.label] || [];
        for(const sl of subList) {
          if(typeof sl === "string") continue;
          const vals = sl.vals || {};
          let sv = 0;
          let hasSem = false;
          for(let s=0; s<4; s++){
            const k = `${mesIdx}_${s}`;
            if(vals[k] !== undefined){ sv += Number(vals[k])||0; hasSem = true; }
          }
          if(!hasSem && vals[mesIdx] !== undefined) sv = Number(vals[mesIdx])||0;
          if(sv > 0) todasLineas.push({ label: `${linea.label} → ${sl.nombre || sl.label || "—"}`, monto: sv, tipo });
        }
      }
    }

    // AddedLines del usuario
    const adds = addedLines[sec.cat] || [];
    for(const al of adds) {
      if(typeof al === "string") continue;
      const vals = al.vals || {};
      let av = Number(vals[mesIdx]) || 0;
      Object.entries(vals).forEach(([k, v]) => {
        if(k.startsWith(`${mesIdx}_`)) av += (Number(v) || 0);
      });
      if(av > 0) {
        const label = al.label || al.nombre || "Línea agregada";
        todasLineas.push({ label, monto: av, tipo });
      }
    }
  }

  const ingresos = todasLineas.filter(l => l.tipo === "ingreso").sort((a,b) => b.monto - a.monto).slice(0, 5);
  const egresos  = todasLineas.filter(l => l.tipo === "egreso") .sort((a,b) => b.monto - a.monto).slice(0, 5);
  return { ingresos, egresos };
}

// Compromisos e Ingresos próximas 4 semanas
// Usa LA MISMA lógica que la vista semanal de FlujoEmpresa
// Itera línea por línea, semana por semana de las próximas 4 semanas reales
function reporte_getMovimientos4Semanas(empNombre, realData, empresas, saldosBancos, subLinesGlobal, addedLinesGlobal) {
  const empData = empresas[empNombre];
  if(!empData) return { compromisos:[], ingresos:[] };

  const proyOverrides = realData?.[empNombre]?._proyOverrides || {};
  const subLines = subLinesGlobal?.[empNombre] || {};
  const addedLines = addedLinesGlobal?.[empNombre] || {};

  // Determinar mes actual y mes siguiente (cubrir 4 semanas que pueden caer entre 2 meses)
  const HOY = new Date();
  const labelHoy = `${MN[HOY.getMonth()]}-${String(HOY.getFullYear()).slice(2)}`;
  const idxMesActual = MESES_65.indexOf(labelHoy);
  if(idxMesActual < 0) return { compromisos:[], ingresos:[] };
  const idxMesSig = idxMesActual + 1 < MESES_65.length ? idxMesActual + 1 : idxMesActual;

  // Display labels para los meses
  const labelMapDisplay = {
    "Jan":"Ene","Feb":"Feb","Mar":"Mar","Apr":"Abr","May":"May","Jun":"Jun",
    "Jul":"Jul","Aug":"Ago","Sep":"Sep","Oct":"Oct","Nov":"Nov","Dec":"Dic",
  };
  function displayMes(idx) {
    if(idx < 0 || idx >= MESES_65.length) return "—";
    const [mn3, yr2] = MESES_65[idx].split("-");
    return `${labelMapDisplay[mn3]} ${yr2}`;
  }

  // Función getProySemana idéntica a FlujoEmpresa
  function getProySemana(lineLabel, idx, semIdx, isLastInMonth) {
    const ov = proyOverrides[lineLabel]?.[idx];
    let base = 0;
    for(const sec of empData.sections){
      const l = sec.lines.find(x=>x.label===lineLabel);
      if(l){ base = l.proy?.[idx]||0; break; }
    }
    if(ov === undefined) return semIdx === 0 ? base : 0;
    if(typeof ov === "number") return isLastInMonth ? ov : 0;
    if(typeof ov === "object" && ov !== null) {
      const k = `_sem${semIdx}`;
      return ov[k] !== undefined ? (Number(ov[k])||0) : 0;
    }
    return 0;
  }

  // Iterar las próximas 8 semanas (≈ mayo + junio): mes actual + mes siguiente
  // Semana actual aproximada según día del mes
  const diaMes = HOY.getDate();
  const semIdxActual = Math.min(3, Math.floor((diaMes - 1) / 7));

  // Generar lista de (mesIdx, semIdx) cubriendo las próximas 8 semanas
  const semanas4 = [];
  let curMes = idxMesActual, curSem = semIdxActual;
  while(semanas4.length < 8) {
    semanas4.push({ mesIdx: curMes, semIdx: curSem, isLastInMonth: curSem === 3 });
    curSem++;
    if(curSem > 3) { curSem = 0; curMes++; }
    if(curMes >= MESES_65.length) break;
  }

  const compromisos = [];
  const ingresos = [];

  // Helper: mapear cat → label legible
  const CAT_LABEL = {
    "ing_op":   "Ingresos Operacionales",
    "ing_nop":  "Ingresos No Operacionales",
    "egr_var":  "Egresos Operacionales",
    "egr_fijo": "Costos Fijos / SG&A",
    "egr_nop":  "Egresos No Operacionales",
    "imp":      "Impuestos",
  };

  // DEBUG: log para diagnosticar items faltantes (ej. royalty IQ Osiris)
  const _debugCapturados = [];

  for(const sec of empData.sections) {
    const esIngreso = sec.signo > 0;
    const catLabel = CAT_LABEL[sec.cat] || sec.label || sec.cat || "Otros";
    for(const linea of (sec.lines || [])) {
      // Por cada semana, ver si hay valor
      for(const semInfo of semanas4) {
        const v = getProySemana(linea.label, semInfo.mesIdx, semInfo.semIdx, semInfo.isLastInMonth);
        if(v === 0) continue;
        const semLabel = `${displayMes(semInfo.mesIdx)} S${semInfo.semIdx + 1}`;
        const item = { mes: semLabel, label: linea.label, monto: Math.abs(v), cat: sec.cat, catLabel };
        if(esIngreso) ingresos.push(item);
        else compromisos.push(item);
        _debugCapturados.push({ emp: empNombre, sec: sec.cat, linea: linea.label, sem: semLabel, monto: v, esIngreso });
      }

      // SubLines (CxC, Capital Calls, etc.)
      if(linea.subLines) {
        const subList = subLines[linea.label] || [];
        for(const sl of subList) {
          if(typeof sl === "string") continue;
          const vals = sl.vals || {};
          for(const semInfo of semanas4) {
            const k = `${semInfo.mesIdx}_${semInfo.semIdx}`;
            const v = Number(vals[k]) || 0;
            if(v === 0) continue;
            const semLabel = `${displayMes(semInfo.mesIdx)} S${semInfo.semIdx + 1}`;
            const subLabel = `${linea.label} → ${sl.nombre || sl.label || "—"}`;
            const item = { mes: semLabel, label: subLabel, monto: Math.abs(v), cat: sec.cat, catLabel };
            if(esIngreso) ingresos.push(item);
            else compromisos.push(item);
          }
        }
      }
    }

    // AddedLines del usuario (por categoría de sección)
    // Pueden estar como valor mensual (vals[i]) o valor semanal (vals["i_semIdx"])
    // El valor MENSUAL se atribuye a la primera semana del mes (S1) en el reporte
    const adds = addedLines[sec.cat] || [];
    for(const al of adds) {
      if(typeof al === "string") continue;
      const vals = al.vals || {};
      const label = al.label || al.nombre || "Línea agregada";

      // Agrupar las semanas por mes para procesar el valor mensual una sola vez
      const semanasPorMes = {};
      for(const semInfo of semanas4) {
        const mIdx = semInfo.mesIdx;
        if(!semanasPorMes[mIdx]) semanasPorMes[mIdx] = [];
        semanasPorMes[mIdx].push(semInfo);
      }

      for(const [mesIdxStr, semsDelMes] of Object.entries(semanasPorMes)) {
        const mesIdx = parseInt(mesIdxStr, 10);
        // 1) Si existe valor mensual (vals[mesIdx]) → atribuir al S1 del mes
        const vMensual = Number(vals[mesIdx]) || 0;
        if(vMensual !== 0) {
          const primeraSem = semsDelMes[0];
          const semLabel = `${displayMes(mesIdx)} S${primeraSem.semIdx + 1}`;
          const item = { mes: semLabel, label, monto: Math.abs(vMensual), cat: sec.cat, catLabel };
          if(esIngreso) ingresos.push(item);
          else compromisos.push(item);
        }
        // 2) También revisar valores semanales individuales (vals["mes_sem"])
        for(const semInfo of semsDelMes) {
          const vSem = Number(vals[`${mesIdx}_${semInfo.semIdx}`]) || 0;
          if(vSem === 0) continue;
          const semLabel = `${displayMes(mesIdx)} S${semInfo.semIdx + 1}`;
          const item = { mes: semLabel, label, monto: Math.abs(vSem), cat: sec.cat, catLabel };
          if(esIngreso) ingresos.push(item);
          else compromisos.push(item);
        }
      }
    }
  }

  // Ordenar cronológicamente (por mes, luego semana, luego monto descendente como tiebreaker)
  function _parseSemKeyLocal(mesStr) {
    if(!mesStr) return 9999;
    const m = mesStr.match(/^(\w+)\s+(\d+)\s+S(\d+)$/);
    if(!m) return 9999;
    const MN_ES = {Ene:0,Feb:1,Mar:2,Abr:3,May:4,Jun:5,Jul:6,Ago:7,Sep:8,Oct:9,Nov:10,Dic:11};
    const mes = MN_ES[m[1]] != null ? MN_ES[m[1]] : 12;
    const anio = parseInt(m[2], 10);
    const sem = parseInt(m[3], 10);
    return anio * 100 + mes * 10 + sem;
  }
  compromisos.sort((a,b) => _parseSemKeyLocal(a.mes) - _parseSemKeyLocal(b.mes) || (b.monto - a.monto));
  ingresos.sort((a,b) => _parseSemKeyLocal(a.mes) - _parseSemKeyLocal(b.mes) || (b.monto - a.monto));

  // Log resumen para cada empresa (útil para validar reporte semanal en consola)
  if(typeof console !== "undefined") {
    const totalCompMonto = compromisos.reduce((s,c)=>s+c.monto, 0);
    const totalIngMonto = ingresos.reduce((s,c)=>s+c.monto, 0);
    console.log(
      `[Reporte][${empNombre}] ${compromisos.length} compromisos (USD ${Math.round(totalCompMonto).toLocaleString()}), ${ingresos.length} ingresos (USD ${Math.round(totalIngMonto).toLocaleString()})`
    );
  }

  return { compromisos: compromisos.slice(0, 50), ingresos: ingresos.slice(0, 50) };
}

// Detectar alertas para una empresa
function reporte_detectarAlertas(empNombre, proyecciones, umbralMin, saldoActual) {
  const alertas = [];
  // Alerta crítica: saldo actual por debajo del umbral
  if(saldoActual < umbralMin) {
    const diff = umbralMin - saldoActual;
    alertas.push({
      nivel: "CRITICO",
      texto: `Saldo actual ${_formatUSD(saldoActual)} está ${_formatUSD(diff)} por debajo del umbral mínimo (${_formatUSD(umbralMin)})`,
      color: "RED",
    });
  }
  // Alerta: déficit proyectado (saldo negativo en algún mes con saldo válido)
  const mesesDeficit = (proyecciones.calendario || []).filter(m => m.saldo != null && m.saldo < 0);
  if(mesesDeficit.length > 0) {
    alertas.push({
      nivel: "CRITICO",
      texto: `${mesesDeficit.length} mes${mesesDeficit.length > 1 ? "es" : ""} con déficit proyectado: ${mesesDeficit.map(m => m.mes).join(", ")}`,
      color: "RED",
    });
  }
  // Alerta naranja: muchos meses bajo umbral (solo meses con saldo válido)
  const mesesConSaldo = (proyecciones.temporada || []).filter(m => m.saldo != null);
  const mesesBajoUmbral = mesesConSaldo.filter(m => m.saldo >= 0 && m.saldo < umbralMin);
  if(mesesBajoUmbral.length >= 3) {
    alertas.push({
      nivel: "ALERTA",
      texto: `${mesesBajoUmbral.length} de ${mesesConSaldo.length} meses proyectados de la temporada bajo umbral mínimo`,
      color: "ORANGE",
    });
  }
  return alertas;
}

// Generar resumen ejecutivo CFO automático desde los datos consolidados
function reporte_generarResumenCFO(kpisGrupo, empresasData, semana) {
  if(!kpisGrupo || !empresasData?.length) return "";

  const partes = [];
  const saldoCtrl = kpisGrupo.saldoTotal;
  const numEmp = empresasData.length;
  const numAlerta = kpisGrupo.empresasAlerta || 0;

  // Frase 1: saldo controladora y empresas
  partes.push(
    `El grupo cierra la semana ${semana || ""} con USD ${Math.round(saldoCtrl).toLocaleString("es-CL")} en participación controladora ` +
    `(saldo equivalente neto de % de propiedad por empresa).`
  );

  // Frase 2: empresas en alerta
  if(numAlerta > 0) {
    const empAlerta = (kpisGrupo.saldosPorEmpresa || [])
      .filter(s => s.alertaCritica || s.alertaMedia)
      .map(s => s.nombre);
    partes.push(
      `${numAlerta} de ${numEmp} empresas se encuentran bajo umbral mínimo: ${empAlerta.join(", ")}.`
    );
  } else {
    partes.push(`Todas las ${numEmp} empresas se encuentran por encima de su umbral mínimo.`);
  }

  // Frase 3: próximas 8 semanas (mayo-junio)
  const totalComp = (kpisGrupo.compromisosConsolidados || []).reduce((s,c) => s + (c.monto || 0), 0);
  const totalIng  = (kpisGrupo.ingresosConsolidados || []).reduce((s,c) => s + (c.monto || 0), 0);
  partes.push(
    `Próximas 8 semanas (mayo-junio): ingresos proyectados por USD ${Math.round(totalIng).toLocaleString("es-CL")} ` +
    `y compromisos por USD ${Math.round(totalComp).toLocaleString("es-CL")}, ` +
    `con flujo neto proyectado de USD ${Math.round(totalIng - totalComp).toLocaleString("es-CL")}.`
  );

  // Frase 4: alerta de déficit proyectado en flujo calendario
  const mesesDeficit = (kpisGrupo.flujoCalendario || []).filter(m => m.saldo != null && m.saldo < 0);
  if(mesesDeficit.length > 0) {
    const labels = mesesDeficit.map(m => m.mes).join(", ");
    partes.push(
      `ALERTA CRITICA: la proyección consolidada muestra déficit en ${mesesDeficit.length} mes${mesesDeficit.length > 1 ? "es" : ""} (${labels}). ` +
      `Se requiere planificar capital de trabajo o transferencias intercompany.`
    );
  } else {
    // Frase positiva si no hay déficit
    const minSaldoMes = (kpisGrupo.flujoCalendario || []).filter(m => m.saldo != null).reduce((min, m) => m.saldo < (min?.saldo ?? Infinity) ? m : min, null);
    if(minSaldoMes) {
      partes.push(
        `Saldo proyectado mínimo del año en ${minSaldoMes.mes}: USD ${Math.round(minSaldoMes.saldo).toLocaleString("es-CL")}.`
      );
    }
  }

  return partes.join(" ");
}

// Datos consolidados del grupo (suma de empresas incluidas)
function reporte_calcKPIsGrupo(datosEmpresas) {
  const result = {
    saldoTotal:0, compromisos4S:0, ingresos4S:0, empresasAlerta:0,
    saldosPorEmpresa: [],     // [{nombre, saldo, umbral, diff, alertas}]
    compromisosConsolidados:[],// top 10 del grupo con empresa indicada
    ingresosConsolidados: [],  // top 10 del grupo con empresa indicada
    flujoTemporada: [],        // suma por mes de proyecciones.temporada (group)
    flujoCalendario: [],       // suma por mes de proyecciones.calendario (group)
  };
  const todosCompromisos = [];
  const todosIngresos = [];

  // Helper para obtener % de propiedad usando el nombreInterno (key real en EMPRESAS_STATIC)
  function getPropPct(emp) {
    const key = emp.nombreInterno || emp.nombre;
    return PARTICIPACION_CONTROLADORA[key] != null ? PARTICIPACION_CONTROLADORA[key] : 1;
  }

  for(const e of datosEmpresas) {
    const pct = getPropPct(e);
    // KPIs del grupo: aplicar % propiedad
    result.saldoTotal += (e.saldoTotal || 0) * pct;
    const compEmp = (e.compromisos || []).reduce((s,c) => s + (c.monto || 0), 0);
    const ingEmp  = (e.ingresos || []).reduce((s,i) => s + (i.monto || 0), 0);
    result.compromisos4S += compEmp * pct;
    result.ingresos4S    += ingEmp * pct;
    const tieneAlerta = e.alertas && e.alertas.some(a => a.nivel === "CRITICO" || a.nivel === "ALERTA");
    if(tieneAlerta) result.empresasAlerta++;

    // En la tabla por empresa mostrar saldo al 100% (real de la empresa)
    result.saldosPorEmpresa.push({
      nombre: e.nombre,
      saldo: e.saldoTotal || 0,
      umbral: e.umbralMin || 0,
      diff: (e.saldoTotal || 0) - (e.umbralMin || 0),
      propPct: pct,
      compromisos4S: compEmp,
      ingresos4S: ingEmp,
      alertaCritica: e.alertas?.some(a => a.nivel === "CRITICO"),
      alertaMedia:   e.alertas?.some(a => a.nivel === "ALERTA"),
    });

    // Acumular compromisos / ingresos con empresa indicada (montos al 100% para que se vea el real)
    for(const c of (e.compromisos || [])) {
      todosCompromisos.push({ ...c, empresa: e.nombre, propPct: pct });
    }
    for(const i of (e.ingresos || [])) {
      todosIngresos.push({ ...i, empresa: e.nombre, propPct: pct });
    }
  }

  // Compromisos / Ingresos: dejarlos cronológicos (no top por monto)
  // El orden se aplicará luego según preferencia del usuario; por defecto cronológico
  function _parseSemKey(mesStr) {
    // formato esperado "May 26 S3" → para ordenar cronológicamente
    if(!mesStr) return 9999;
    const m = mesStr.match(/^(\w+)\s+(\d+)\s+S(\d+)$/);
    if(!m) return 9999;
    const MN_ES = {Ene:0,Feb:1,Mar:2,Abr:3,May:4,Jun:5,Jul:6,Ago:7,Sep:8,Oct:9,Nov:10,Dic:11};
    const mes = MN_ES[m[1]] != null ? MN_ES[m[1]] : 12;
    const anio = parseInt(m[2], 10);
    const sem = parseInt(m[3], 10);
    return anio * 100 + mes * 10 + sem;
  }
  todosCompromisos.sort((a,b) => _parseSemKey(a.mes) - _parseSemKey(b.mes) || (b.monto - a.monto));
  todosIngresos.sort((a,b) => _parseSemKey(a.mes) - _parseSemKey(b.mes) || (b.monto - a.monto));
  result.compromisosConsolidados = todosCompromisos;
  result.ingresosConsolidados    = todosIngresos;

  // Flujo consolidado: sumar saldo de todas las empresas por mes APLICANDO % propiedad
  const tempMax = Math.max(0, ...datosEmpresas.map(e => (e.proyecciones?.temporada || []).length));
  for(let i = 0; i < tempMax; i++) {
    let suma = 0;
    let mesLabel = "—";
    let hayDato = false;
    for(const e of datosEmpresas) {
      const fila = (e.proyecciones?.temporada || [])[i];
      const pct = getPropPct(e);
      if(fila && fila.saldo != null) {
        suma += fila.saldo * pct;
        hayDato = true;
      }
      if(fila?.mes) mesLabel = fila.mes;
    }
    result.flujoTemporada.push({ mes: mesLabel, saldo: hayDato ? suma : null });
  }

  const calMax = Math.max(0, ...datosEmpresas.map(e => (e.proyecciones?.calendario || []).length));
  for(let i = 0; i < calMax; i++) {
    let suma = 0;
    let mesLabel = "—";
    let hayDato = false;
    for(const e of datosEmpresas) {
      const fila = (e.proyecciones?.calendario || [])[i];
      const pct = getPropPct(e);
      if(fila && fila.saldo != null) {
        suma += fila.saldo * pct;
        hayDato = true;
      }
      if(fila?.mes) mesLabel = fila.mes;
    }
    result.flujoCalendario.push({ mes: mesLabel, saldo: hayDato ? suma : null });
  }

  return result;
}

// Función maestra: arma los datos de UNA empresa para el reporte
function reporte_armarDatosEmpresa(empNombre, realData, empresas, saldosBancos, umbralMin, comentarioCFO, tcUSDtoCLP, subLinesGlobal, addedLinesGlobal) {
  const saldos = reporte_calcSaldosPorMoneda(empNombre, saldosBancos, tcUSDtoCLP);
  const proyecciones = reporte_getProyeccionesEmpresa(empNombre, realData, empresas, saldosBancos, subLinesGlobal, addedLinesGlobal);

  const movs = reporte_getMovimientos4Semanas(empNombre, realData, empresas, saldosBancos, subLinesGlobal, addedLinesGlobal);
  const top = reporte_getTopMovimientos(empNombre, realData, empresas, subLinesGlobal, addedLinesGlobal);
  const alertas = reporte_detectarAlertas(empNombre, proyecciones, umbralMin, saldos.totalUSD);

  // Detalle mensual: desde el mes actual hasta diciembre del año actual (≈ 8 meses para mayo)
  // Si mes actual es Mayo 2026 → May-26, Jun-26, Jul-26, Aug-26, Sep-26, Oct-26, Nov-26, Dec-26 (8 meses)
  const HOY = new Date();
  const labelHoy = `${MN[HOY.getMonth()]}-${String(HOY.getFullYear()).slice(2)}`;
  const idxHoy = MESES_65.indexOf(labelHoy);
  // Calcular cuántos meses van desde el mes actual hasta diciembre del mismo año
  const mesesHastaDic = Math.max(1, 12 - HOY.getMonth()); // mayo=4, dic-may+1 = 8
  const mesesIdx14 = [];
  for(let i = 0; i < mesesHastaDic; i++) {
    const idx = idxHoy + i;
    if(idx >= 0 && idx < MESES_65.length) mesesIdx14.push(idx);
  }
  const detalleTemporada = reporte_calcDetalleMensual(empNombre, realData, empresas, saldosBancos, mesesIdx14, subLinesGlobal, addedLinesGlobal);

  return {
    nombre: REPORTE_EMPRESAS_DISPLAY[empNombre] || empNombre,
    nombreInterno: empNombre,
    umbralMin,
    saldos,
    saldoTotal: saldos.totalUSD,
    proyecciones,
    compromisos: movs.compromisos,
    ingresos: movs.ingresos,
    topIngresos: top.ingresos,
    topEgresos: top.egresos,
    alertas,
    detalleTemporada,
    comentarioCFO: comentarioCFO || "",
  };
}

// ═══════════════════════════════════════════════════════════════════
// REPORTE SEMANAL — GENERADOR DE PDF (cliente, usa jsPDF + autoTable)
// ═══════════════════════════════════════════════════════════════════

// Loader dinámico de jsPDF (igual al que ya usa el módulo Frisku)
let _reporteJsPDFLoaded = false;
async function reporte_loadJsPDF() {
  if(_reporteJsPDFLoaded && window.jspdf) return window.jspdf.jsPDF;
  return new Promise((resolve, reject) => {
    const s1 = document.createElement("script");
    s1.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s1.onload = () => {
      const s2 = document.createElement("script");
      s2.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js";
      s2.onload = () => { _reporteJsPDFLoaded = true; resolve(window.jspdf.jsPDF); };
      s2.onerror = reject;
      document.head.appendChild(s2);
    };
    s1.onerror = reject;
    document.head.appendChild(s1);
  });
}

// Cargar el logo Mediterra como base64 (desde /med.png)
let _reporteLogoBase64 = null;
async function reporte_loadLogo() {
  if(_reporteLogoBase64) return _reporteLogoBase64;
  try {
    const res = await fetch("/med.png");
    if(!res.ok) return null;
    const blob = await res.blob();
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => {
        _reporteLogoBase64 = reader.result;
        resolve(_reporteLogoBase64);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch(e) {
    return null;
  }
}

// Paleta para el PDF (consistente con el mockup)
const _PDF_COLORS = {
  TEAL:       [15, 118, 110],
  TEAL_DARK:  [10, 79, 74],
  TEAL_LIGHT: [94, 234, 212],
  TEAL_VLIGHT:[204, 251, 241],
  GREEN:      [22, 163, 74],
  RED:        [220, 38, 38],
  ORANGE:     [217, 119, 6],
  GRAY_DARK:  [51, 51, 51],
  GRAY_MED:   [102, 102, 102],
  GRAY_LIGHT: [170, 170, 170],
  BG_SOFT:    [247, 249, 252],
  WHITE:      [255, 255, 255],
  CARD_RED:   [255, 228, 225],
  CARD_AMBER: [255, 248, 225],
};

// Helper: agregar header de página
function _pdfAddHeader(doc, semana, fechaStr, isFirst, logo) {
  const W = doc.internal.pageSize.getWidth();
  const altura = isFirst ? 38 : 22; // mm
  // Fondo blanco
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, altura, "F");
  // Línea inferior teal
  doc.setDrawColor(..._PDF_COLORS.TEAL);
  doc.setLineWidth(isFirst ? 1.5 : 0.8);
  doc.line(0, altura, W, altura);
  // Logo Mediterra
  if(logo) {
    try {
      doc.addImage(logo, "PNG", 12, isFirst ? 8 : 5, isFirst ? 30 : 18, isFirst ? 22 : 13);
    } catch(e) {}
  }
  // Texto del header
  if(isFirst) {
    doc.setTextColor(..._PDF_COLORS.GRAY_DARK);
    doc.setFont("helvetica","bold"); doc.setFontSize(14);
    doc.text("Gestión Grupo Mediterra", 50, 16);
    doc.setTextColor(..._PDF_COLORS.TEAL);
    doc.setFont("helvetica","bold"); doc.setFontSize(10);
    doc.text("Reporte Semanal de Flujo de Caja", 50, 22);
    doc.setTextColor(..._PDF_COLORS.TEAL);
    doc.setFont("helvetica","bold"); doc.setFontSize(12);
    doc.text(`Semana ${semana}`, W - 12, 16, {align:"right"});
    doc.setTextColor(..._PDF_COLORS.GRAY_DARK);
    doc.setFont("helvetica","normal"); doc.setFontSize(9);
    doc.text(fechaStr, W - 12, 21, {align:"right"});
    doc.setTextColor(..._PDF_COLORS.GRAY_MED);
    doc.setFont("helvetica","italic"); doc.setFontSize(8);
    doc.text("Información confidencial · Socios y directorio", W - 12, 26, {align:"right"});
  } else {
    doc.setTextColor(..._PDF_COLORS.GRAY_DARK);
    doc.setFont("helvetica","bold"); doc.setFontSize(9);
    doc.text("Reporte Semanal de Flujo de Caja", 32, 11);
    doc.setTextColor(..._PDF_COLORS.GRAY_MED);
    doc.setFont("helvetica","normal"); doc.setFontSize(8);
    doc.text("Gestión Grupo Mediterra", 32, 16);
    doc.setTextColor(..._PDF_COLORS.TEAL);
    doc.setFont("helvetica","bold"); doc.setFontSize(9);
    doc.text(`Semana ${semana}`, W - 12, 11, {align:"right"});
    doc.setTextColor(..._PDF_COLORS.GRAY_DARK);
    doc.setFont("helvetica","normal"); doc.setFontSize(8);
    doc.text(fechaStr, W - 12, 16, {align:"right"});
  }
}

// Helper: footer con número de página
function _pdfAddFooter(doc) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const pages = doc.internal.getNumberOfPages();
  for(let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setTextColor(..._PDF_COLORS.GRAY_LIGHT);
    doc.setFont("helvetica","normal"); doc.setFontSize(8);
    doc.text("Generado por Gestión Grupo Mediterra", 12, H - 8);
    doc.text(`Página ${p} de ${pages}`, W - 12, H - 8, {align:"right"});
  }
}

// Generar el PDF completo del reporte semanal
async function reporte_generarPDF(opts) {
  const {
    semana, fechaCorte, empresasData, kpisGrupo,
    nombresExcluidos = ["Allpa Farms Perú"],
  } = opts;

  const jsPDF = await reporte_loadJsPDF();
  const logo = await reporte_loadLogo();
  const doc = new jsPDF({orientation:"portrait", unit:"mm", format:"a4"});
  const fechaStr = new Date().toLocaleDateString("es-CL", {weekday:"long", year:"numeric", month:"long", day:"numeric"});

  let yPos = 42; // después del header

  // ─── PÁGINA 1: Resumen Ejecutivo CONSOLIDADO ───
  _pdfAddHeader(doc, semana, fechaStr, true, logo);
  const H = doc.internal.pageSize.getHeight();
  function ensureSpacePortada(needed) {
    if(yPos + needed > H - 30) {
      doc.addPage();
      _pdfAddHeader(doc, semana, fechaStr, false, logo);
      yPos = 28;
    }
  }

  // Título
  doc.setTextColor(..._PDF_COLORS.TEAL);
  doc.setFont("helvetica","bold"); doc.setFontSize(16);
  doc.text("Resumen Ejecutivo Grupo Mediterra", 12, yPos);
  yPos += 6;
  doc.setTextColor(..._PDF_COLORS.GRAY_MED);
  doc.setFont("helvetica","italic"); doc.setFontSize(9);
  doc.text(`Consolidado de ${empresasData.length} empresas · Reporte generado el ${fechaCorte}`, 12, yPos);
  yPos += 4;
  doc.text(`Excluye ${nombresExcluidos.join(", ")} (consolidación independiente)`, 12, yPos);
  yPos += 8;

  // 1. KPIs globales
  doc.autoTable({
    startY: yPos,
    head: [["Saldo Bancos Grupo (Ctrl.)", "Compromisos 8 Sem.", "Ingresos 8 Sem.", "Empresas en Alerta"]],
    body: [[
      _formatUSD(kpisGrupo.saldoTotal),
      _formatUSD(kpisGrupo.compromisos4S),
      _formatUSD(kpisGrupo.ingresos4S),
      `${kpisGrupo.empresasAlerta} de ${empresasData.length}`,
    ]],
    theme: "grid",
    headStyles: {fillColor: _PDF_COLORS.TEAL, textColor: 255, fontSize: 9, halign: "center", fontStyle: "bold"},
    bodyStyles: {fillColor: _PDF_COLORS.TEAL_VLIGHT, textColor: _PDF_COLORS.TEAL_DARK, fontSize: 13, halign: "center", fontStyle: "bold", cellPadding: 4},
    margin: {left: 12, right: 12},
  });
  yPos = doc.lastAutoTable.finalY + 6;

  // 1.5 Resumen CFO automático
  const resumenCFO = reporte_generarResumenCFO(kpisGrupo, empresasData, semana);
  if(resumenCFO) {
    ensureSpacePortada(38);
    doc.setTextColor(..._PDF_COLORS.TEAL_DARK);
    doc.setFont("helvetica","bold"); doc.setFontSize(10);
    doc.text("Resumen Ejecutivo CFO", 12, yPos);
    yPos += 3;

    // Caja teal claro con franja teal a la izquierda
    const cardX = 12;
    const cardW = 186;
    const padInterno = 6;
    const textX = cardX + padInterno;
    const textMaxW = cardW - padInterno * 2; // ancho real disponible para el texto

    doc.setFontSize(9); doc.setFont("helvetica","normal");
    // splitTextToSize ya divide por width; usamos un width algo menor para tener margen de error
    const lines = doc.splitTextToSize(resumenCFO, textMaxW - 2);
    const cardH = lines.length * 4.2 + padInterno * 2;
    doc.setFillColor(..._PDF_COLORS.TEAL_VLIGHT);
    doc.rect(cardX, yPos, cardW, cardH, "F");
    doc.setFillColor(..._PDF_COLORS.TEAL);
    doc.rect(cardX, yPos, 1.5, cardH, "F");
    doc.setTextColor(..._PDF_COLORS.GRAY_DARK);
    // doc.text con maxWidth como seguridad adicional
    doc.text(lines, textX, yPos + padInterno + 3, { maxWidth: textMaxW });
    yPos += cardH + 6;
  }

  // 2. Saldo Bancos por Empresa
  ensureSpacePortada(60);
  doc.setTextColor(..._PDF_COLORS.TEAL_DARK);
  doc.setFont("helvetica","bold"); doc.setFontSize(10);
  doc.text("Saldo Bancos por Empresa", 12, yPos);
  yPos += 2;

  const saldoEmpRows = (kpisGrupo.saldosPorEmpresa || []).map(s => [
    s.nombre,
    `${Math.round((s.propPct || 1) * 100)}%`,
    _formatUSD(s.saldo),
    _formatUSD((s.saldo || 0) * (s.propPct || 1)),
    _formatUSD(s.umbral),
    _formatUSD(s.diff, true),
    s.alertaCritica ? "Crítico" : s.alertaMedia ? "Alerta" : "OK",
  ]);
  // Filas totales
  const totalSaldo100 = (kpisGrupo.saldosPorEmpresa || []).reduce((s,e)=>s+e.saldo, 0);
  const totalSaldoCtrl = (kpisGrupo.saldosPorEmpresa || []).reduce((s,e)=>s + (e.saldo || 0) * (e.propPct || 1), 0);
  const totalUmbral = (kpisGrupo.saldosPorEmpresa || []).reduce((s,e)=>s+e.umbral, 0);
  saldoEmpRows.push(["TOTAL 100%", "", _formatUSD(totalSaldo100), _formatUSD(totalSaldo100), _formatUSD(totalUmbral), _formatUSD(totalSaldo100 - totalUmbral, true), ""]);
  saldoEmpRows.push(["TOTAL CONTROLADORA", "", "", _formatUSD(totalSaldoCtrl), "", "", ""]);

  doc.autoTable({
    startY: yPos,
    head: [["Empresa", "% Prop.", "Saldo 100%", "Saldo Ctrl.", "Umbral", "Diferencia", "Estado"]],
    body: saldoEmpRows,
    theme: "grid",
    headStyles: {fillColor: _PDF_COLORS.TEAL, textColor: 255, fontSize: 8.5, fontStyle:"bold", halign:"center"},
    bodyStyles: {fontSize: 8, cellPadding: 2.2},
    columnStyles: {
      0: {fontStyle:"bold"},
      1: {halign:"center"},
      2: {halign:"right"},
      3: {halign:"right", fontStyle:"bold"},
      4: {halign:"right"},
      5: {halign:"right", fontStyle:"bold"},
      6: {halign:"center"},
    },
    alternateRowStyles: {fillColor: _PDF_COLORS.BG_SOFT},
    didParseCell: function(data){
      if(data.section === "body" && data.row.index >= saldoEmpRows.length - 2) {
        // Filas totales (las últimas 2)
        data.cell.styles.fillColor = _PDF_COLORS.TEAL_VLIGHT;
        data.cell.styles.textColor = _PDF_COLORS.TEAL_DARK;
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 9;
      } else if(data.section === "body" && data.column.index === 5) {
        // Diferencia
        const fila = (kpisGrupo.saldosPorEmpresa || [])[data.row.index];
        if(fila) {
          data.cell.styles.textColor = fila.diff < 0 ? _PDF_COLORS.RED : _PDF_COLORS.GREEN;
        }
      } else if(data.section === "body" && data.column.index === 6) {
        // Estado
        const fila = (kpisGrupo.saldosPorEmpresa || [])[data.row.index];
        if(fila) {
          if(fila.alertaCritica) {
            data.cell.styles.textColor = _PDF_COLORS.RED;
            data.cell.styles.fontStyle = "bold";
          } else if(fila.alertaMedia) {
            data.cell.styles.textColor = _PDF_COLORS.ORANGE;
            data.cell.styles.fontStyle = "bold";
          } else {
            data.cell.styles.textColor = _PDF_COLORS.GREEN;
            data.cell.styles.fontStyle = "bold";
          }
        }
      }
    },
    margin: {left: 12, right: 12},
  });
  yPos = doc.lastAutoTable.finalY + 6;

  // 3. Compromisos consolidados próximas 8 semanas (mayo-junio), agrupados por empresa
  ensureSpacePortada(50);
  doc.setTextColor(..._PDF_COLORS.TEAL_DARK);
  doc.setFont("helvetica","bold"); doc.setFontSize(10);
  doc.text("Compromisos Consolidados — Próximas 8 Semanas (top 5 detallado + resto agrupado)", 12, yPos);
  yPos += 2;

  // Helper: para una lista de items de una empresa, separar top 5 + agrupar resto por catLabel
  // Si una línea aparece en varias semanas, se considera un solo "ítem" sumado por linea+monto
  function _agruparTop5MasResto(items) {
    // Combinar items que tengan el mismo label para que el "top 5" sea por línea (no por semana suelta)
    const porLinea = {};
    for(const it of items) {
      const k = it.label;
      if(!porLinea[k]) porLinea[k] = { label: k, monto: 0, cat: it.cat, catLabel: it.catLabel, semanas: new Set() };
      porLinea[k].monto += it.monto;
      porLinea[k].semanas.add(it.mes);
    }
    const lineasUnicas = Object.values(porLinea).map(l => ({
      ...l,
      semanasStr: Array.from(l.semanas).join(", "),
    }));
    lineasUnicas.sort((a,b) => b.monto - a.monto);

    const top5 = lineasUnicas.slice(0, 5);
    const resto = lineasUnicas.slice(5);

    // Agrupar resto por catLabel
    const restoPorCat = {};
    for(const r of resto) {
      const k = r.catLabel || "Otros";
      if(!restoPorCat[k]) restoPorCat[k] = { catLabel: k, monto: 0, count: 0 };
      restoPorCat[k].monto += r.monto;
      restoPorCat[k].count += 1;
    }
    const gruposResto = Object.values(restoPorCat).sort((a,b) => b.monto - a.monto);
    return { top5, gruposResto };
  }

  // Agrupar items consolidados por empresa
  const compPorEmpresa = {};
  for(const c of (kpisGrupo.compromisosConsolidados || [])) {
    if(!compPorEmpresa[c.empresa]) compPorEmpresa[c.empresa] = [];
    compPorEmpresa[c.empresa].push(c);
  }

  const compConsRows = [];
  const empresasOrden = (kpisGrupo.saldosPorEmpresa || []).map(s => s.nombre);
  let totalCompGlobal = 0;
  for(const empNombre of empresasOrden) {
    const items = compPorEmpresa[empNombre] || [];
    if(items.length === 0) continue;
    const subtotal = items.reduce((s,c) => s + (c.monto || 0), 0);
    totalCompGlobal += subtotal;

    const { top5, gruposResto } = _agruparTop5MasResto(items);

    // Header empresa con subtotal (3 columnas)
    compConsRows.push([
      { content: empNombre, colSpan: 2, styles: { fillColor: _PDF_COLORS.TEAL, textColor: 255, fontStyle: "bold", fontSize: 9 } },
      { content: `Subtotal: ${_formatUSD(subtotal)}`, styles: { fillColor: _PDF_COLORS.TEAL, textColor: 255, fontStyle: "bold", fontSize: 9, halign: "right" } },
    ]);
    // Top 5 detallados
    for(const t of top5) {
      compConsRows.push([t.semanasStr, t.label, _formatUSD(t.monto)]);
    }
    // Resto agrupado por categoría
    if(gruposResto.length > 0) {
      compConsRows.push([
        { content: "Otros (agrupados por categoría)", colSpan: 3, styles: { fillColor: _PDF_COLORS.BG_SOFT, textColor: _PDF_COLORS.GRAY_MED, fontStyle: "italic", fontSize: 7.5 } },
      ]);
      for(const g of gruposResto) {
        compConsRows.push([
          "—",
          { content: `${g.catLabel} (${g.count} ítem${g.count > 1 ? "s" : ""})`, styles: { fontStyle: "italic", textColor: _PDF_COLORS.GRAY_MED } },
          { content: _formatUSD(g.monto), styles: { fontStyle: "italic" } },
        ]);
      }
    }
  }
  if(compConsRows.length === 0) compConsRows.push(["—", "Sin compromisos registrados", "—"]);
  else compConsRows.push([
    { content: "TOTAL GRUPO", colSpan: 2, styles: { fillColor: _PDF_COLORS.TEAL_DARK, textColor: 255, fontStyle: "bold", fontSize: 9.5 } },
    { content: _formatUSD(totalCompGlobal), styles: { fillColor: _PDF_COLORS.TEAL_DARK, textColor: 255, fontStyle: "bold", fontSize: 9.5, halign: "right" } },
  ]);

  doc.autoTable({
    startY: yPos,
    head: [["Semana(s)", "Concepto", "Monto USD"]],
    body: compConsRows,
    theme: "grid",
    headStyles: {fillColor: _PDF_COLORS.TEAL, textColor: 255, fontSize: 9, fontStyle:"bold"},
    bodyStyles: {fontSize: 8, cellPadding: 1.8},
    columnStyles: {
      0: {cellWidth: 32},
      2: {halign:"right", textColor: _PDF_COLORS.RED, fontStyle:"bold", cellWidth: 35},
    },
    alternateRowStyles: {fillColor: _PDF_COLORS.BG_SOFT},
    margin: {left: 12, right: 12},
  });
  yPos = doc.lastAutoTable.finalY + 6;

  // 4. Ingresos consolidados próximas 8 semanas (mismo formato)
  ensureSpacePortada(50);
  doc.setTextColor(..._PDF_COLORS.TEAL_DARK);
  doc.setFont("helvetica","bold"); doc.setFontSize(10);
  doc.text("Ingresos Consolidados — Próximas 8 Semanas (top 5 detallado + resto agrupado)", 12, yPos);
  yPos += 2;

  const ingPorEmpresa = {};
  for(const i of (kpisGrupo.ingresosConsolidados || [])) {
    if(!ingPorEmpresa[i.empresa]) ingPorEmpresa[i.empresa] = [];
    ingPorEmpresa[i.empresa].push(i);
  }

  const ingConsRows = [];
  let totalIngGlobal = 0;
  for(const empNombre of empresasOrden) {
    const items = ingPorEmpresa[empNombre] || [];
    if(items.length === 0) continue;
    const subtotal = items.reduce((s,c) => s + (c.monto || 0), 0);
    totalIngGlobal += subtotal;

    const { top5, gruposResto } = _agruparTop5MasResto(items);

    ingConsRows.push([
      { content: empNombre, colSpan: 2, styles: { fillColor: _PDF_COLORS.TEAL, textColor: 255, fontStyle: "bold", fontSize: 9 } },
      { content: `Subtotal: ${_formatUSD(subtotal)}`, styles: { fillColor: _PDF_COLORS.TEAL, textColor: 255, fontStyle: "bold", fontSize: 9, halign: "right" } },
    ]);
    for(const t of top5) {
      ingConsRows.push([t.semanasStr, t.label, _formatUSD(t.monto)]);
    }
    if(gruposResto.length > 0) {
      ingConsRows.push([
        { content: "Otros (agrupados por categoría)", colSpan: 3, styles: { fillColor: _PDF_COLORS.BG_SOFT, textColor: _PDF_COLORS.GRAY_MED, fontStyle: "italic", fontSize: 7.5 } },
      ]);
      for(const g of gruposResto) {
        ingConsRows.push([
          "—",
          { content: `${g.catLabel} (${g.count} ítem${g.count > 1 ? "s" : ""})`, styles: { fontStyle: "italic", textColor: _PDF_COLORS.GRAY_MED } },
          { content: _formatUSD(g.monto), styles: { fontStyle: "italic" } },
        ]);
      }
    }
  }
  if(ingConsRows.length === 0) ingConsRows.push(["—", "Sin ingresos registrados", "—"]);
  else ingConsRows.push([
    { content: "TOTAL GRUPO", colSpan: 2, styles: { fillColor: _PDF_COLORS.TEAL_DARK, textColor: 255, fontStyle: "bold", fontSize: 9.5 } },
    { content: _formatUSD(totalIngGlobal), styles: { fillColor: _PDF_COLORS.TEAL_DARK, textColor: 255, fontStyle: "bold", fontSize: 9.5, halign: "right" } },
  ]);

  doc.autoTable({
    startY: yPos,
    head: [["Semana(s)", "Concepto", "Monto USD"]],
    body: ingConsRows,
    theme: "grid",
    headStyles: {fillColor: _PDF_COLORS.TEAL, textColor: 255, fontSize: 9, fontStyle:"bold"},
    bodyStyles: {fontSize: 8, cellPadding: 1.8},
    columnStyles: {
      0: {cellWidth: 32},
      2: {halign:"right", textColor: _PDF_COLORS.GREEN, fontStyle:"bold", cellWidth: 35},
    },
    alternateRowStyles: {fillColor: _PDF_COLORS.BG_SOFT},
    margin: {left: 12, right: 12},
  });
  yPos = doc.lastAutoTable.finalY + 6;

  // 5. Saldo Caja Proyectado Consolidado (Temporada + Calendario lado a lado)
  ensureSpacePortada(70);
  doc.setTextColor(..._PDF_COLORS.TEAL_DARK);
  doc.setFont("helvetica","bold"); doc.setFontSize(10);
  doc.text("Saldo Caja Proyectado Consolidado — Participación Controladora", 12, yPos);
  yPos += 2;

  // Tabla temporada izquierda
  const tempConsRows = (kpisGrupo.flujoTemporada || []).map(m => [m.mes, _formatUSD(m.saldo)]);
  doc.autoTable({
    startY: yPos,
    head: [["Temporada Jul - Jun", "Saldo Ctrl. USD"]],
    body: tempConsRows,
    theme: "grid",
    headStyles: {fillColor: _PDF_COLORS.TEAL, textColor: 255, fontSize: 8, halign:"center"},
    bodyStyles: {fontSize: 7.5, cellPadding: 1.2},
    columnStyles: {1: {halign:"right", fontStyle:"bold"}},
    alternateRowStyles: {fillColor: _PDF_COLORS.BG_SOFT},
    didParseCell: function(data){
      if(data.column.index === 1 && data.section === "body") {
        const fila = (kpisGrupo.flujoTemporada || [])[data.row.index];
        if(fila && fila.saldo != null) {
          if(fila.saldo < 0) data.cell.styles.textColor = _PDF_COLORS.RED;
          else data.cell.styles.textColor = _PDF_COLORS.TEAL_DARK;
        }
      }
    },
    margin: {left: 12, right: 105},
    tableWidth: 80,
  });
  const tempConsFinalY = doc.lastAutoTable.finalY;

  // Tabla calendario derecha
  const calConsRows = (kpisGrupo.flujoCalendario || []).map(m => [m.mes, _formatUSD(m.saldo)]);
  doc.autoTable({
    startY: yPos,
    head: [["Calendario Ene - Dic", "Saldo Ctrl. USD"]],
    body: calConsRows,
    theme: "grid",
    headStyles: {fillColor: _PDF_COLORS.TEAL, textColor: 255, fontSize: 8, halign:"center"},
    bodyStyles: {fontSize: 7.5, cellPadding: 1.2},
    columnStyles: {1: {halign:"right", fontStyle:"bold"}},
    alternateRowStyles: {fillColor: _PDF_COLORS.BG_SOFT},
    didParseCell: function(data){
      if(data.column.index === 1 && data.section === "body") {
        const fila = (kpisGrupo.flujoCalendario || [])[data.row.index];
        if(fila && fila.saldo != null) {
          if(fila.saldo < 0) data.cell.styles.textColor = _PDF_COLORS.RED;
          else data.cell.styles.textColor = _PDF_COLORS.TEAL_DARK;
        }
      }
    },
    margin: {left: 105, right: 12},
    tableWidth: 80,
  });
  yPos = Math.max(tempConsFinalY, doc.lastAutoTable.finalY) + 6;

  // ─── VISTAS MENSUALES DETALLADAS (14 meses temporada) ───
  // Helpers de formato compacto para tablas anchas
  function _fmtCompact(v) {
    if(v == null || isNaN(v) || v === 0) return "—";
    const abs = Math.abs(v);
    let str;
    if(abs >= 1000000) str = (abs/1000000).toFixed(2) + "M";
    else if(abs >= 1000) str = Math.round(abs/1000) + "K";
    else str = Math.round(abs).toString();
    return v < 0 ? `-${str}` : str;
  }
  function _displayMesShort(mesLabel) {
    // "May-26" → "May 26"
    if(!mesLabel || mesLabel === "—") return "—";
    const map = {Jan:"Ene", Feb:"Feb", Mar:"Mar", Apr:"Abr", May:"May", Jun:"Jun",
      Jul:"Jul", Aug:"Ago", Sep:"Sep", Oct:"Oct", Nov:"Nov", Dec:"Dic"};
    const [m, y] = mesLabel.split("-");
    return `${map[m]||m} ${y}`;
  }

  // Determinar meses comunes (los del primer empresa con datos) — son los 14 meses temporada
  const empConDet = empresasData.find(e => Array.isArray(e.detalleTemporada) && e.detalleTemporada.length > 0);
  const mesesArr = empConDet ? empConDet.detalleTemporada.map(d => _displayMesShort(d.mes)) : [];

  if(mesesArr.length > 0) {
    // ───── VISTA 1: Filas = Empresas, Columnas = Meses ─────
    // Como son 14 meses + label de empresa = 15 columnas → cambio a horizontal
    doc.addPage("landscape");
    _pdfAddHeader(doc, semana, fechaStr, false, logo);
    let yL = 28;

    doc.setTextColor(..._PDF_COLORS.TEAL);
    doc.setFont("helvetica","bold"); doc.setFontSize(13);
    doc.text("Detalle Mensual Consolidado — Hasta Diciembre 2026", 12, yL);
    yL += 5;
    doc.setTextColor(..._PDF_COLORS.GRAY_MED);
    doc.setFont("helvetica","italic"); doc.setFontSize(8);
    doc.text("Vista A: Empresas en filas · Meses en columnas · Cifras en miles USD (K) o millones (M)", 12, yL);
    yL += 5;

    // Por cada empresa, 4 filas: Ingresos, Egresos, Flujo Neto, Saldo Final
    const filasA = [];
    for(const emp of empresasData) {
      const det = emp.detalleTemporada || [];
      // Header de empresa (fila spanning)
      filasA.push([
        { content: emp.nombre, colSpan: mesesArr.length + 2, styles: { fillColor: _PDF_COLORS.TEAL, textColor: 255, fontStyle: "bold", fontSize: 8.5, halign:"left" } }
      ]);
      // Ingresos
      filasA.push([
        "", "Ingresos",
        ...det.map(d => _fmtCompact(d.ingresos)),
      ]);
      // Egresos
      filasA.push([
        "", "Egresos",
        ...det.map(d => _fmtCompact(-Math.abs(d.egresos || 0))),
      ]);
      // Flujo Neto
      filasA.push([
        "", "Flujo Neto",
        ...det.map(d => _fmtCompact(d.flujoNeto)),
      ]);
      // Saldo Final
      filasA.push([
        "", "Saldo Final",
        ...det.map(d => _fmtCompact(d.saldo)),
      ]);
    }

    // Fila TOTAL GRUPO (4 filas adicionales)
    if(empresasData.length > 0) {
      const totalIng = mesesArr.map((_,i) => empresasData.reduce((s,e)=>s+((e.detalleTemporada||[])[i]?.ingresos || 0), 0));
      const totalEgr = mesesArr.map((_,i) => empresasData.reduce((s,e)=>s+((e.detalleTemporada||[])[i]?.egresos || 0), 0));
      const totalFlu = totalIng.map((v,i) => v - totalEgr[i]);
      const totalSal = mesesArr.map((_,i) => empresasData.reduce((s,e)=>{
        const sal = (e.detalleTemporada||[])[i]?.saldo;
        return s + (sal == null ? 0 : sal);
      }, 0));

      filasA.push([
        { content: "TOTAL GRUPO", colSpan: mesesArr.length + 2, styles: { fillColor: _PDF_COLORS.TEAL_DARK, textColor: 255, fontStyle: "bold", fontSize: 9, halign:"left" } }
      ]);
      filasA.push(["", "Ingresos", ...totalIng.map(v=>_fmtCompact(v))]);
      filasA.push(["", "Egresos", ...totalEgr.map(v=>_fmtCompact(-Math.abs(v)))]);
      filasA.push(["", "Flujo Neto", ...totalFlu.map(v=>_fmtCompact(v))]);
      filasA.push(["", "Saldo Final", ...totalSal.map(v=>_fmtCompact(v))]);
    }

    doc.autoTable({
      startY: yL,
      head: [["", "Concepto", ...mesesArr]],
      body: filasA,
      theme: "grid",
      headStyles: { fillColor: _PDF_COLORS.TEAL, textColor: 255, fontSize: 8, halign: "center", fontStyle:"bold" },
      bodyStyles: { fontSize: 7.5, cellPadding: 1.2 },
      columnStyles: (()=>{
        const cs = { 0: { cellWidth: 4 }, 1: { fontStyle: "bold", cellWidth: 30 } };
        for(let i = 0; i < mesesArr.length; i++) cs[i + 2] = { halign: "right", cellWidth: 28 };
        return cs;
      })(),
      didParseCell: function(data) {
        if(data.section !== "body") return;
        // Colorear según concepto
        const concepto = data.row.cells[1]?.text?.[0] || "";
        const valStr = data.cell.text?.[0] || "";
        const isNeg = valStr.startsWith("-");
        if(data.column.index >= 2) {
          if(concepto === "Ingresos") data.cell.styles.textColor = _PDF_COLORS.GREEN;
          else if(concepto === "Egresos") data.cell.styles.textColor = _PDF_COLORS.RED;
          else if(concepto === "Flujo Neto") {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.textColor = isNeg ? _PDF_COLORS.RED : _PDF_COLORS.GREEN;
          } else if(concepto === "Saldo Final") {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = isNeg ? [255, 228, 225] : _PDF_COLORS.TEAL_VLIGHT;
            data.cell.styles.textColor = isNeg ? _PDF_COLORS.RED : _PDF_COLORS.TEAL_DARK;
          }
        }
      },
      margin: { left: 8, right: 8 },
    });

    // ───── VISTA 2: Filas = Meses, Columnas = Empresas ─────
    doc.addPage("landscape");
    _pdfAddHeader(doc, semana, fechaStr, false, logo);
    yL = 28;

    doc.setTextColor(..._PDF_COLORS.TEAL);
    doc.setFont("helvetica","bold"); doc.setFontSize(13);
    doc.text("Detalle Mensual Consolidado — Hasta Diciembre 2026", 12, yL);
    yL += 5;
    doc.setTextColor(..._PDF_COLORS.GRAY_MED);
    doc.setFont("helvetica","italic"); doc.setFontSize(8);
    doc.text("Vista B: Meses en filas · Empresas en columnas · Cifras en miles USD (K) o millones (M)", 12, yL);
    yL += 5;

    const empresasCols = empresasData.map(e => e.nombre);

    // Por cada mes, 4 filas
    const filasB = [];
    for(let i = 0; i < mesesArr.length; i++) {
      // Header del mes
      filasB.push([
        { content: mesesArr[i], colSpan: empresasData.length + 3, styles: { fillColor: _PDF_COLORS.TEAL, textColor: 255, fontStyle: "bold", fontSize: 8.5, halign: "left" } }
      ]);
      // Ingresos
      const ingPorEmp = empresasData.map(e => (e.detalleTemporada||[])[i]?.ingresos || 0);
      filasB.push(["", "Ingresos", ...ingPorEmp.map(v => _fmtCompact(v)), _fmtCompact(ingPorEmp.reduce((s,v)=>s+v,0))]);
      // Egresos
      const egrPorEmp = empresasData.map(e => (e.detalleTemporada||[])[i]?.egresos || 0);
      filasB.push(["", "Egresos", ...egrPorEmp.map(v => _fmtCompact(-Math.abs(v))), _fmtCompact(-egrPorEmp.reduce((s,v)=>s+v,0))]);
      // Flujo Neto
      const flujoPorEmp = empresasData.map(e => (e.detalleTemporada||[])[i]?.flujoNeto || 0);
      filasB.push(["", "Flujo Neto", ...flujoPorEmp.map(v => _fmtCompact(v)), _fmtCompact(flujoPorEmp.reduce((s,v)=>s+v,0))]);
      // Saldo Final
      const saldoPorEmp = empresasData.map(e => (e.detalleTemporada||[])[i]?.saldo);
      const saldoSuma = saldoPorEmp.reduce((s,v) => s + (v == null ? 0 : v), 0);
      filasB.push(["", "Saldo Final", ...saldoPorEmp.map(v => _fmtCompact(v)), _fmtCompact(saldoSuma)]);
    }

    // Nombres acortados para que entren todos en el header
    const empresasColsCortas = empresasData.map(e => {
      const n = e.nombre || "";
      if(n.includes("Mediterra")) return "Mediterra";
      if(n.includes("Allegria Foods")) return "Allegria F.";
      if(n.includes("Allegria Service")) return "Allegria S.";
      if(n.includes("Frisku")) return "Frisku";
      if(n.includes("Osiris")) return "Osiris";
      if(n.includes("Integrity")) return "Integrity";
      if(n.includes("Allpa Farms Chile")) return "Allpa Chile";
      if(n.includes("Allpa Farms Per")) return "Allpa Perú";
      return n.length > 12 ? n.substring(0, 12) : n;
    });

    doc.autoTable({
      startY: yL,
      head: [["", "Concepto", ...empresasColsCortas, "TOTAL"]],
      body: filasB,
      theme: "grid",
      headStyles: { fillColor: _PDF_COLORS.TEAL, textColor: 255, fontSize: 6.5, halign: "center", fontStyle:"bold", cellPadding: 0.5 },
      bodyStyles: { fontSize: 6, cellPadding: 0.6, overflow: "linebreak" },
      columnStyles: (()=>{
        const cs = { 0: { cellWidth: 2 }, 1: { fontStyle: "bold", cellWidth: 16, overflow: "linebreak" } };
        // landscape A4 = 297mm, márgenes 5+5 = 287mm útiles
        const usableW = 297 - 5 - 5 - 2 - 16;
        const colW = Math.floor(usableW / (empresasData.length + 1));
        for(let i = 0; i <= empresasData.length; i++) cs[i + 2] = { halign: "right", cellWidth: colW };
        return cs;
      })(),
      didParseCell: function(data) {
        if(data.section !== "body") return;
        const concepto = data.row.cells[1]?.text?.[0] || "";
        const valStr = data.cell.text?.[0] || "";
        const isNeg = valStr.startsWith("-");
        const isTotal = data.column.index === empresasData.length + 2;
        if(data.column.index >= 2) {
          if(concepto === "Ingresos") data.cell.styles.textColor = _PDF_COLORS.GREEN;
          else if(concepto === "Egresos") data.cell.styles.textColor = _PDF_COLORS.RED;
          else if(concepto === "Flujo Neto") {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.textColor = isNeg ? _PDF_COLORS.RED : _PDF_COLORS.GREEN;
          } else if(concepto === "Saldo Final") {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = isNeg ? [255, 228, 225] : _PDF_COLORS.TEAL_VLIGHT;
            data.cell.styles.textColor = isNeg ? _PDF_COLORS.RED : _PDF_COLORS.TEAL_DARK;
          }
          if(isTotal) data.cell.styles.fontStyle = "bold";
        }
      },
      margin: { left: 5, right: 5 },
      tableWidth: "wrap",
    });

    yPos = doc.lastAutoTable.finalY + 6;
  }

  // ─── SECCIÓN POR CADA EMPRESA ───
  for(let i = 0; i < empresasData.length; i++) {
    const emp = empresasData[i];

    // Siempre saltar a nueva página PORTRAIT para cada empresa (compacto: 1 página por empresa)
    doc.addPage("a4", "portrait");
    _pdfAddHeader(doc, semana, fechaStr, false, logo);
    yPos = 28;

    _renderEmpresaEnPDF(doc, emp, i + 1, yPos, semana, fechaStr, logo);
    yPos = doc.lastAutoTable ? doc.lastAutoTable.finalY + 6 : yPos + 200;
  }

  // Footer en todas las páginas
  _pdfAddFooter(doc);

  return doc;
}

// Render UNA empresa dentro del PDF (puede ocupar 1-2 páginas)
function _renderEmpresaEnPDF(doc, emp, idx, startY, semana, fechaStr, logo) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  let y = startY;
  const PAGE_BREAK_Y = H - 30; // si y > esto, saltar página

  function ensureSpace(needed) {
    if(y + needed > PAGE_BREAK_Y) {
      doc.addPage();
      _pdfAddHeader(doc, semana, fechaStr, false, logo);
      y = 28;
    }
  }

  // Título de la empresa
  doc.setTextColor(..._PDF_COLORS.TEAL);
  doc.setFont("helvetica","bold"); doc.setFontSize(14);
  doc.text(`${idx}. ${emp.nombre}`, 12, y);
  y += 4;
  doc.setTextColor(..._PDF_COLORS.GRAY_MED);
  doc.setFont("helvetica","italic"); doc.setFontSize(8);
  doc.text(`Umbral mínimo: ${_formatUSD(emp.umbralMin)} · Saldos al día de hoy${emp.fechaUltimaActualizacion && emp.fechaUltimaActualizacion !== "—" ? ` (última act.: ${emp.fechaUltimaActualizacion})` : ""}`, 12, y);
  y += 5;

  // Box saldo total (más compacto)
  const saldoArribaUmbral = emp.saldoTotal >= emp.umbralMin;
  const diferencia = emp.saldoTotal - emp.umbralMin;
  const colorSaldo = saldoArribaUmbral ? _PDF_COLORS.GREEN : (emp.saldoTotal < 0 ? _PDF_COLORS.RED : _PDF_COLORS.ORANGE);
  doc.autoTable({
    startY: y,
    head: [["Saldo Bancos Total (USD)", "Umbral Mínimo", "Diferencia"]],
    body: [[
      _formatUSD(emp.saldoTotal),
      _formatUSD(emp.umbralMin),
      _formatUSD(diferencia, true),
    ]],
    theme: "grid",
    headStyles: {fillColor: _PDF_COLORS.TEAL, textColor: 255, fontSize: 8, halign: "center"},
    bodyStyles: {
      fillColor: saldoArribaUmbral ? _PDF_COLORS.TEAL_VLIGHT : _PDF_COLORS.CARD_RED,
      fontSize: 11, halign: "center", fontStyle: "bold", cellPadding: 2.5,
    },
    columnStyles: {
      0: {textColor: colorSaldo},
      1: {textColor: _PDF_COLORS.GRAY_DARK},
      2: {textColor: colorSaldo},
    },
    margin: {left: 12, right: 12},
  });
  y = doc.lastAutoTable.finalY + 3;

  // Detalle saldos por moneda — COMPACTO (solo si hay líneas)
  if((emp.saldos?.lineas || []).length > 0) {
    doc.setTextColor(..._PDF_COLORS.TEAL_DARK);
    doc.setFont("helvetica","bold"); doc.setFontSize(8);
    doc.text("Saldos bancos por moneda", 12, y);
    y += 1;
    const monRows = [];
    for(const ln of (emp.saldos?.lineas || [])) {
      if(ln.moneda === "USD") monRows.push(["USD", ln.descripcion, _formatUSD(ln.monto)]);
      else if(ln.moneda === "CLP") monRows.push(["CLP", ln.descripcion, _formatCLP(ln.monto)]);
      else if(ln.moneda === "PEN") monRows.push(["PEN", ln.descripcion, _formatUSD(ln.enUSD)]);
    }
    if(emp.saldos?.equivCLPenUSD > 0) {
      monRows.push(["—", "Equivalente CLP en USD", _formatUSD(emp.saldos.equivCLPenUSD)]);
    }
    doc.autoTable({
      startY: y,
      head: [["Mon.", "Descripción", "Monto"]],
      body: monRows,
      theme: "grid",
      headStyles: {fillColor: _PDF_COLORS.TEAL, textColor: 255, fontSize: 7.5, halign: "center"},
      bodyStyles: {fontSize: 7.5, cellPadding: 1},
      columnStyles: {0: {halign: "center", cellWidth: 14}, 2: {halign: "right"}},
      alternateRowStyles: {fillColor: _PDF_COLORS.BG_SOFT},
      margin: {left: 12, right: 12},
    });
    y = doc.lastAutoTable.finalY + 3;
  }

  // Saldo Caja Proyectado - dos vistas lado a lado (compacto)
  doc.setTextColor(..._PDF_COLORS.TEAL_DARK);
  doc.setFont("helvetica","bold"); doc.setFontSize(8.5);
  doc.text("Saldo Caja Proyectado", 12, y);
  y += 1;

  const tempRows = (emp.proyecciones?.temporada || []).map(m => [m.mes, _formatUSD(m.saldo)]);
  doc.autoTable({
    startY: y,
    head: [["Temporada Jul - Jun", "Saldo USD"]],
    body: tempRows,
    theme: "grid",
    headStyles: {fillColor: _PDF_COLORS.TEAL, textColor: 255, fontSize: 7.5, halign: "center"},
    bodyStyles: {fontSize: 7, cellPadding: 0.8},
    columnStyles: {1: {halign: "right"}},
    alternateRowStyles: {fillColor: _PDF_COLORS.BG_SOFT},
    didParseCell: function(data) {
      if(data.column.index === 1 && data.section === "body") {
        const fila = (emp.proyecciones?.temporada || [])[data.row.index];
        if(fila && fila.saldo != null) {
          if(fila.saldo < 0) {
            data.cell.styles.textColor = _PDF_COLORS.RED;
            data.cell.styles.fontStyle = "bold";
          } else if(fila.saldo < emp.umbralMin) {
            data.cell.styles.textColor = _PDF_COLORS.ORANGE;
            data.cell.styles.fontStyle = "bold";
          }
        }
      }
    },
    margin: {left: 12, right: 105},
    tableWidth: 80,
  });
  const tempFinalY = doc.lastAutoTable.finalY;

  const calRows = (emp.proyecciones?.calendario || []).map(m => [m.mes, _formatUSD(m.saldo)]);
  doc.autoTable({
    startY: y,
    head: [["Calendario Ene - Dic", "Saldo USD"]],
    body: calRows,
    theme: "grid",
    headStyles: {fillColor: _PDF_COLORS.TEAL, textColor: 255, fontSize: 7.5, halign: "center"},
    bodyStyles: {fontSize: 7, cellPadding: 0.8},
    columnStyles: {1: {halign: "right"}},
    alternateRowStyles: {fillColor: _PDF_COLORS.BG_SOFT},
    didParseCell: function(data) {
      if(data.column.index === 1 && data.section === "body") {
        const fila = (emp.proyecciones?.calendario || [])[data.row.index];
        if(fila && fila.saldo != null) {
          if(fila.saldo < 0) {
            data.cell.styles.textColor = _PDF_COLORS.RED;
            data.cell.styles.fontStyle = "bold";
          } else if(fila.saldo < emp.umbralMin) {
            data.cell.styles.textColor = _PDF_COLORS.ORANGE;
            data.cell.styles.fontStyle = "bold";
          }
        }
      }
    },
    margin: {left: 105, right: 12},
    tableWidth: 80,
  });
  y = Math.max(tempFinalY, doc.lastAutoTable.finalY) + 3;

  // Compromisos e Ingresos LADO A LADO (top 5 cada uno)
  doc.setTextColor(..._PDF_COLORS.TEAL_DARK);
  doc.setFont("helvetica","bold"); doc.setFontSize(8.5);
  doc.text("Movimientos próximas 4 semanas (top 5)", 12, y);
  y += 1;

  const compTop5 = (emp.compromisos || []).slice(0, 5);
  const compRowsCompact = compTop5.map(c => [c.mes, c.label, _formatUSD(c.monto)]);
  doc.autoTable({
    startY: y,
    head: [["Sem.", "Compromiso", "USD"]],
    body: compRowsCompact.length > 0 ? compRowsCompact : [["—", "Sin compromisos", "—"]],
    theme: "grid",
    headStyles: {fillColor: _PDF_COLORS.TEAL, textColor: 255, fontSize: 7.5},
    bodyStyles: {fontSize: 7, cellPadding: 0.8},
    columnStyles: {0: {cellWidth: 18}, 2: {halign: "right", textColor: _PDF_COLORS.RED, fontStyle: "bold", cellWidth: 18}},
    alternateRowStyles: {fillColor: _PDF_COLORS.BG_SOFT},
    margin: {left: 12, right: 105},
    tableWidth: 80,
  });
  const compFinalY = doc.lastAutoTable.finalY;

  const ingTop5 = (emp.ingresos || []).slice(0, 5);
  const ingRowsCompact = ingTop5.map(i => [i.mes, i.label, _formatUSD(i.monto)]);
  doc.autoTable({
    startY: y,
    head: [["Sem.", "Ingreso", "USD"]],
    body: ingRowsCompact.length > 0 ? ingRowsCompact : [["—", "Sin ingresos", "—"]],
    theme: "grid",
    headStyles: {fillColor: _PDF_COLORS.TEAL, textColor: 255, fontSize: 7.5},
    bodyStyles: {fontSize: 7, cellPadding: 0.8},
    columnStyles: {0: {cellWidth: 18}, 2: {halign: "right", textColor: _PDF_COLORS.GREEN, fontStyle: "bold", cellWidth: 18}},
    alternateRowStyles: {fillColor: _PDF_COLORS.BG_SOFT},
    margin: {left: 105, right: 12},
    tableWidth: 80,
  });
  y = Math.max(compFinalY, doc.lastAutoTable.finalY) + 3;

  // Top 3 movimientos del mes (compacto)
  doc.setTextColor(..._PDF_COLORS.TEAL_DARK);
  doc.setFont("helvetica","bold"); doc.setFontSize(8.5);
  doc.text("Top movimientos del mes (top 3)", 12, y);
  y += 1;

  const topInRows = (emp.topIngresos || []).slice(0, 3).map((l, i) => [`${i+1}. ${l.label}`, _formatUSD(l.monto)]);
  const topEgRows = (emp.topEgresos || []).slice(0, 3).map((l, i) => [`${i+1}. ${l.label}`, _formatUSD(l.monto)]);
  doc.autoTable({
    startY: y,
    head: [["TOP 3 INGRESOS", ""]],
    body: topInRows.length > 0 ? topInRows : [["Sin ingresos", "—"]],
    theme: "grid",
    headStyles: {fillColor: _PDF_COLORS.TEAL, textColor: 255, fontSize: 7.5},
    bodyStyles: {fontSize: 7, cellPadding: 0.8},
    columnStyles: {1: {halign: "right", textColor: _PDF_COLORS.GREEN, fontStyle: "bold"}},
    alternateRowStyles: {fillColor: _PDF_COLORS.BG_SOFT},
    margin: {left: 12, right: 105},
    tableWidth: 80,
  });
  const topInFinalY = doc.lastAutoTable.finalY;

  doc.autoTable({
    startY: y,
    head: [["TOP 3 EGRESOS", ""]],
    body: topEgRows.length > 0 ? topEgRows : [["Sin egresos", "—"]],
    theme: "grid",
    headStyles: {fillColor: _PDF_COLORS.TEAL, textColor: 255, fontSize: 7.5},
    bodyStyles: {fontSize: 7, cellPadding: 0.8},
    columnStyles: {1: {halign: "right", textColor: _PDF_COLORS.RED, fontStyle: "bold"}},
    alternateRowStyles: {fillColor: _PDF_COLORS.BG_SOFT},
    margin: {left: 105, right: 12},
    tableWidth: 80,
  });
  y = Math.max(topInFinalY, doc.lastAutoTable.finalY) + 3;

  // Alertas (compacto)
  if((emp.alertas || []).length > 0) {
    doc.setTextColor(..._PDF_COLORS.TEAL_DARK);
    doc.setFont("helvetica","bold"); doc.setFontSize(8.5);
    doc.text("Alertas detectadas", 12, y);
    y += 1;
    const alertRows = (emp.alertas || []).map(a => [a.nivel, a.texto]);
    doc.autoTable({
      startY: y,
      body: alertRows,
      theme: "grid",
      bodyStyles: {fontSize: 8, cellPadding: 1.5, fillColor: _PDF_COLORS.CARD_AMBER, textColor: _PDF_COLORS.GRAY_DARK},
      columnStyles: {
        0: {fontStyle: "bold", fontSize: 7, halign: "center", textColor: 255, cellWidth: 18, valign: "middle"},
        1: {valign: "middle"},
      },
      didParseCell: function(data) {
        if(data.column.index === 0 && data.section === "body") {
          const a = emp.alertas[data.row.index];
          if(a) {
            if(a.nivel === "CRITICO") data.cell.styles.fillColor = _PDF_COLORS.RED;
            else if(a.nivel === "ALERTA") data.cell.styles.fillColor = _PDF_COLORS.ORANGE;
            else data.cell.styles.fillColor = _PDF_COLORS.TEAL;
          }
        }
      },
      margin: {left: 12, right: 12},
    });
    y = doc.lastAutoTable.finalY + 3;
  }

  // Comentario CFO (compacto)
  if(emp.comentarioCFO && emp.comentarioCFO.trim()) {
    doc.setTextColor(..._PDF_COLORS.TEAL_DARK);
    doc.setFont("helvetica","bold"); doc.setFontSize(8.5);
    doc.text("Comentario del CFO", 12, y);
    y += 2.5;
    const cardW = 186;
    const cardX = 12;
    const padding = 3;
    doc.setFontSize(8.5); doc.setFont("helvetica","italic");
    const lines = doc.splitTextToSize(emp.comentarioCFO, cardW - padding*2 - 4);
    const cardH = lines.length * 3.5 + padding * 2;
    doc.setFillColor(..._PDF_COLORS.TEAL_VLIGHT);
    doc.rect(cardX, y, cardW, cardH, "F");
    doc.setFillColor(..._PDF_COLORS.TEAL);
    doc.rect(cardX, y, 1, cardH, "F");
    doc.setTextColor(..._PDF_COLORS.GRAY_DARK);
    doc.text(lines, cardX + 4, y + padding + 3);
    y += cardH + 3;
  }

  doc.lastAutoTable = doc.lastAutoTable || {finalY: y};
}

// ═══════════════════════════════════════════════════════════════════
// REPORTE SEMANAL — COMPONENTE UI
// ═══════════════════════════════════════════════════════════════════

function ReporteSemanalModule({
  realData, params, empresas, saldosBancos, canEdit,
  creditosData = [], addedLinesGlobal = {}, subLinesGlobal = {}, intercompany = [],
  umbralesConfig = {}, onSaveUmbrales,
  destinatariosConfig = [], onSaveDestinatarios,
  comentariosConfig = {}, onSaveComentarios,
  historialReportes = [], onSaveHistorialReportes,
  usuarioActual,
}) {
  const [subTab, setSubTab] = useState("generar"); // "generar" | "umbrales" | "destinatarios" | "historial"
  const [generando, setGenerando] = useState(false);
  const [errorGen, setErrorGen] = useState(null);
  const [exitoGen, setExitoGen] = useState(null);

  // Estados del tab "generar"
  const [empresasIncluidas, setEmpresasIncluidas] = useState(() => {
    const obj = {};
    REPORTE_EMPRESAS.forEach(e => { obj[e] = true; });
    return obj;
  });
  const [destinatariosMarcados, setDestinatariosMarcados] = useState({});
  const [comentariosLocal, setComentariosLocal] = useState({}); // Temporal mientras edita

  // Cargar comentarios persistidos
  useEffect(() => {
    setComentariosLocal(comentariosConfig || {});
  }, [comentariosConfig]);

  // Fecha de generación del reporte (= día en que se genera el PDF)
  // El saldo de bancos es el que está cargado en la app al momento de generar el reporte
  const hoyDate = new Date();
  const fechaCorteStr = hoyDate.toLocaleDateString("es-CL", {weekday:"long", year:"numeric", month:"long", day:"numeric"});

  // Detectar la fecha más reciente de actualización de saldos bancos (de los registros que existen)
  function getFechaUltimaActualizacionSaldos() {
    let masReciente = null;
    Object.values(saldosBancos || {}).forEach(s => {
      if(s?.fecha) {
        const f = new Date(s.fecha);
        if(!masReciente || f > masReciente) masReciente = f;
      }
    });
    return masReciente;
  }
  const fechaUltimaActualizacion = getFechaUltimaActualizacionSaldos();
  const fechaUltimaActStr = fechaUltimaActualizacion
    ? fechaUltimaActualizacion.toLocaleDateString("es-CL", {weekday:"long", year:"numeric", month:"long", day:"numeric"})
    : "—";

  // Calcular semana ISO
  function getSemanaISO(d) {
    const c = new Date(d.getTime());
    c.setHours(0,0,0,0);
    c.setDate(c.getDate() + 3 - ((c.getDay()+6)%7));
    const f = new Date(c.getFullYear(),0,4);
    return 1 + Math.round(((c-f)/86400000 - 3 + ((f.getDay()+6)%7)) / 7);
  }
  const semanaISO = getSemanaISO(new Date());

  // Umbrales: si no hay valor configurado, usar default
  function umbralDe(emp) {
    if(umbralesConfig && umbralesConfig[emp] != null) return Number(umbralesConfig[emp]) || 0;
    return REPORTE_UMBRALES_DEFAULT[emp] || 100000;
  }

  // Preview de empresas a incluir
  const empresasParaReporte = useMemo(() => {
    return REPORTE_EMPRESAS
      .filter(e => empresasIncluidas[e])
      .map(emp => reporte_armarDatosEmpresa(
        emp, realData, empresas, saldosBancos,
        umbralDe(emp),
        comentariosLocal[emp] || "",
        params?.tcUSDtoCLP || REPORTE_TC_DEFAULT_CLP,
        subLinesGlobal, addedLinesGlobal,
      ));
  }, [realData, params, empresas, saldosBancos, empresasIncluidas, umbralesConfig, comentariosLocal, subLinesGlobal, addedLinesGlobal]);

  const kpisGrupo = useMemo(() => reporte_calcKPIsGrupo(empresasParaReporte), [empresasParaReporte]);

  // Generar PDF
  async function handleGenerarPDF() {
    setGenerando(true); setErrorGen(null); setExitoGen(null);
    try {
      // Persistir comentarios antes de generar
      if(onSaveComentarios) await onSaveComentarios(comentariosLocal);

      const empresasData = empresasParaReporte.map(e => ({
        ...e,
        fechaCorte: fechaCorteStr,
        fechaUltimaActualizacion: fechaUltimaActStr,
      }));
      const doc = await reporte_generarPDF({
        semana: semanaISO,
        fechaCorte: fechaCorteStr,
        fechaUltimaActualizacion: fechaUltimaActStr,
        empresasData,
        kpisGrupo,
      });

      const hoy = new Date().toISOString().slice(0, 10);
      const nombreArchivo = `Reporte_Semanal_Flujo_de_Caja_Grupo_Mediterra_${hoy}_W${semanaISO}.pdf`;
      doc.save(nombreArchivo);

      // Guardar en historial
      const blobPDF = doc.output("blob");
      const pdfBase64 = await new Promise((res) => {
        const r = new FileReader();
        r.onloadend = () => res(r.result);
        r.readAsDataURL(blobPDF);
      });
      const entradaHistorial = {
        id: `rep_${Date.now()}`,
        semana: semanaISO,
        fechaGeneracion: new Date().toISOString(),
        generadoPor: usuarioActual?.nombre || "—",
        empresasIncluidas: empresasParaReporte.map(e => e.nombre),
        nombreArchivo,
        pdfBase64,
      };
      if(onSaveHistorialReportes) {
        await onSaveHistorialReportes([...(historialReportes || []), entradaHistorial]);
      }

      setExitoGen(`✅ Reporte generado: ${nombreArchivo}`);
      setTimeout(() => setExitoGen(null), 6000);
    } catch(err) {
      console.error(err);
      setErrorGen("Error generando PDF: " + (err?.message || String(err)));
    }
    setGenerando(false);
  }

  // Estilo del tab activo
  const tabStyle = (active) => ({
    padding: "8px 16px",
    background: active ? C.accent : "transparent",
    border: `1px solid ${active ? C.accent : C.border}`,
    borderRadius: 8,
    color: active ? "#fff" : C.muted,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
  });

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontSize:18,fontWeight:800,color:C.accentL,marginBottom:4}}>📅 Reporte Semanal de Flujo de Caja</div>
          <div style={{fontSize:11,color:C.muted}}>Semana ISO {semanaISO} · Corte al {fechaCorteStr}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
        <button onClick={()=>setSubTab("generar")}      style={tabStyle(subTab==="generar")}>📄 Generar</button>
        <button onClick={()=>setSubTab("umbrales")}     style={tabStyle(subTab==="umbrales")}>⚙️ Umbrales</button>
        <button onClick={()=>setSubTab("destinatarios")}style={tabStyle(subTab==="destinatarios")}>📧 Destinatarios</button>
        <button onClick={()=>setSubTab("historial")}    style={tabStyle(subTab==="historial")}>📁 Historial</button>
      </div>

      {/* ─── TAB: GENERAR ─── */}
      {subTab === "generar" && (
        <div>
          {/* KPIs del grupo */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
            {[
              {label:"Saldo Bancos Grupo", val:_formatUSD(kpisGrupo.saldoTotal), color:C.green},
              {label:"Compromisos 4 Sem.", val:_formatUSD(kpisGrupo.compromisos4S), color:C.red},
              {label:"Ingresos 4 Sem.",    val:_formatUSD(kpisGrupo.ingresos4S), color:C.green},
              {label:"Empresas en Alerta", val:`${kpisGrupo.empresasAlerta} de ${empresasParaReporte.length}`, color:kpisGrupo.empresasAlerta>0?C.yellow:C.green},
            ].map((kpi,i)=>(
              <div key={i} style={{padding:"10px 12px",background:C.card,borderRadius:8,border:`1px solid ${C.border}`}}>
                <div style={{fontSize:9,color:C.muted2,textTransform:"uppercase",letterSpacing:0.5}}>{kpi.label}</div>
                <div style={{fontSize:14,fontWeight:800,color:kpi.color,marginTop:4}}>{kpi.val}</div>
              </div>
            ))}
          </div>

          {/* Selector de empresas a incluir */}
          <div style={{padding:12,background:C.card,borderRadius:10,border:`1px solid ${C.border}`,marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:700,color:C.accentL,marginBottom:8}}>Empresas a incluir en el reporte</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:6}}>
              {REPORTE_EMPRESAS.map(emp=>(
                <label key={emp} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:11,color:C.text,padding:"4px 8px",borderRadius:6,background:empresasIncluidas[emp]?C.accent+"22":"transparent"}}>
                  <input type="checkbox" checked={!!empresasIncluidas[emp]} onChange={e=>setEmpresasIncluidas(p=>({...p,[emp]:e.target.checked}))}/>
                  {emp}
                </label>
              ))}
            </div>
          </div>

          {/* Comentarios CFO por empresa */}
          <div style={{padding:12,background:C.card,borderRadius:10,border:`1px solid ${C.border}`,marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:700,color:C.accentL,marginBottom:8}}>Comentarios del CFO por empresa</div>
            <div style={{fontSize:10,color:C.muted,marginBottom:10,fontStyle:"italic"}}>Se guardan automáticamente al generar el reporte. La próxima semana parten en blanco.</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {REPORTE_EMPRESAS.filter(e=>empresasIncluidas[e]).map(emp=>(
                <div key={emp}>
                  <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:4}}>{emp}</div>
                  <textarea
                    value={comentariosLocal[emp] || ""}
                    onChange={e=>setComentariosLocal(p=>({...p,[emp]:e.target.value}))}
                    placeholder="Comentario o contexto adicional para esta empresa (opcional)..."
                    style={{width:"100%",padding:"6px 10px",borderRadius:6,border:`1px solid ${C.border}`,background:C.bg,color:C.text,fontSize:11,minHeight:50,boxSizing:"border-box",resize:"vertical"}}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Mensajes */}
          {errorGen && <div style={{padding:10,background:C.red+"22",border:`1px solid ${C.red}`,borderRadius:8,color:C.red,fontSize:11,marginBottom:10}}>{errorGen}</div>}
          {exitoGen && <div style={{padding:10,background:C.green+"22",border:`1px solid ${C.green}`,borderRadius:8,color:C.green,fontSize:11,marginBottom:10}}>{exitoGen}</div>}

          {/* Botones de acción */}
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",flexWrap:"wrap"}}>
            <button disabled={generando||empresasParaReporte.length===0} onClick={handleGenerarPDF} style={{padding:"10px 22px",background:generando?C.muted:C.accent,color:"#fff",border:"none",borderRadius:8,cursor:generando?"wait":"pointer",fontWeight:700,fontSize:13}}>
              {generando ? "⏳ Generando..." : "📄 Generar PDF"}
            </button>
          </div>

          {/* Preview compacto */}
          <div style={{marginTop:18,padding:12,background:C.card2,borderRadius:8,border:`1px solid ${C.border2}`}}>
            <div style={{fontSize:11,fontWeight:700,color:C.accentL,marginBottom:8}}>Preview: empresas a incluir ({empresasParaReporte.length})</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {empresasParaReporte.map(e=>{
                const arribaUmbral = e.saldoTotal >= e.umbralMin;
                const colorEstado = arribaUmbral ? C.green : (e.saldoTotal < 0 ? C.red : C.yellow);
                return (
                  <div key={e.nombre} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:C.card,borderRadius:6,fontSize:11}}>
                    <span style={{fontWeight:700,color:C.text}}>{e.nombre}</span>
                    <span style={{fontFamily:"monospace",color:colorEstado,fontWeight:700}}>
                      {_formatUSD(e.saldoTotal)} / {_formatUSD(e.umbralMin)}
                      {e.alertas.length > 0 && <span style={{marginLeft:8,fontSize:9,padding:"2px 6px",background:C.red+"33",color:C.red,borderRadius:10}}>{e.alertas.length} alerta{e.alertas.length>1?"s":""}</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB: UMBRALES ─── */}
      {subTab === "umbrales" && (
        <ReporteUmbralesEditor
          umbralesConfig={umbralesConfig}
          onSave={onSaveUmbrales}
          canEdit={canEdit}
        />
      )}

      {/* ─── TAB: DESTINATARIOS ─── */}
      {subTab === "destinatarios" && (
        <ReporteDestinatariosEditor
          destinatariosConfig={destinatariosConfig}
          onSave={onSaveDestinatarios}
          canEdit={canEdit}
        />
      )}

      {/* ─── TAB: HISTORIAL ─── */}
      {subTab === "historial" && (
        <ReporteHistorial
          historial={historialReportes}
          onUpdate={onSaveHistorialReportes}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}

// ─── Editor de umbrales ───
function ReporteUmbralesEditor({umbralesConfig, onSave, canEdit}) {
  const [local, setLocal] = useState({});
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    const inicial = {};
    REPORTE_EMPRESAS.forEach(emp => {
      inicial[emp] = umbralesConfig?.[emp] != null
        ? umbralesConfig[emp]
        : REPORTE_UMBRALES_DEFAULT[emp] || 100000;
    });
    setLocal(inicial);
  }, [umbralesConfig]);

  async function guardar() {
    if(onSave) await onSave(local);
    setSaved("✅ Umbrales guardados");
    setTimeout(()=>setSaved(null), 3000);
  }

  return (
    <div style={{padding:14,background:C.card,borderRadius:10,border:`1px solid ${C.border}`}}>
      <div style={{fontSize:13,fontWeight:700,color:C.accentL,marginBottom:6}}>⚙️ Configuración de Umbrales Mínimos de Caja</div>
      <div style={{fontSize:10,color:C.muted,marginBottom:14,fontStyle:"italic"}}>
        El umbral mínimo es el saldo de caja que cada empresa debe mantener. Si baja de este nivel, se genera una alerta en el reporte. Todos los valores en USD.
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {REPORTE_EMPRESAS.map(emp=>(
          <div key={emp} style={{display:"grid",gridTemplateColumns:"1fr 200px 100px",gap:10,alignItems:"center",padding:"8px 12px",background:C.card2,borderRadius:6}}>
            <div style={{fontSize:12,fontWeight:700,color:C.text}}>{emp}</div>
            <input
              type="number"
              disabled={!canEdit}
              value={local[emp] || ""}
              onChange={e=>setLocal(p=>({...p,[emp]:Number(e.target.value)||0}))}
              placeholder="USD"
              style={{padding:"6px 10px",borderRadius:6,border:`1px solid ${C.border}`,background:C.bg,color:C.text,fontSize:12,textAlign:"right"}}
            />
            <div style={{fontSize:11,color:C.muted,textAlign:"right"}}>{_formatUSD(local[emp]||0)}</div>
          </div>
        ))}
      </div>

      {saved && <div style={{marginTop:10,padding:8,background:C.green+"22",color:C.green,borderRadius:6,fontSize:11}}>{saved}</div>}

      {canEdit && (
        <div style={{marginTop:14,display:"flex",justifyContent:"flex-end"}}>
          <button onClick={guardar} style={{padding:"8px 18px",background:C.accent,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:12}}>
            💾 Guardar umbrales
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Editor de destinatarios ───
function ReporteDestinatariosEditor({destinatariosConfig, onSave, canEdit}) {
  const [local, setLocal] = useState([]);
  const [nuevo, setNuevo] = useState({nombre:"", email:"", rol:"Socio"});
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    setLocal(Array.isArray(destinatariosConfig) ? destinatariosConfig : []);
  }, [destinatariosConfig]);

  function agregar() {
    if(!nuevo.email || !nuevo.email.includes("@")) {
      alert("Email inválido");
      return;
    }
    if(local.some(d => d.email === nuevo.email)) {
      alert("Email ya existe en la lista");
      return;
    }
    setLocal([...local, {...nuevo, id:`dst_${Date.now()}`, activo:true}]);
    setNuevo({nombre:"", email:"", rol:"Socio"});
  }

  function eliminar(id) {
    if(!window.confirm("¿Eliminar este destinatario?")) return;
    setLocal(local.filter(d => d.id !== id));
  }

  function toggleActivo(id) {
    setLocal(local.map(d => d.id === id ? {...d, activo: !d.activo} : d));
  }

  async function guardar() {
    if(onSave) await onSave(local);
    setSaved("✅ Destinatarios guardados");
    setTimeout(()=>setSaved(null), 3000);
  }

  return (
    <div style={{padding:14,background:C.card,borderRadius:10,border:`1px solid ${C.border}`}}>
      <div style={{fontSize:13,fontWeight:700,color:C.accentL,marginBottom:6}}>📧 Lista de Destinatarios</div>
      <div style={{fontSize:10,color:C.muted,marginBottom:14,fontStyle:"italic"}}>
        Estas son las personas que recibirán el reporte por email cuando se active el envío automático. Por ahora puedes administrar la lista; el envío automático se activa después de configurar Resend (Capa 2).
      </div>

      {/* Lista existente */}
      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
        {local.length === 0 && <div style={{padding:20,textAlign:"center",color:C.muted2,fontSize:11,fontStyle:"italic"}}>Sin destinatarios agregados</div>}
        {local.map(d=>(
          <div key={d.id} style={{display:"grid",gridTemplateColumns:"40px 1fr 200px 100px 40px",gap:8,alignItems:"center",padding:"6px 10px",background:d.activo?C.card2:C.bg,borderRadius:6,opacity:d.activo?1:0.5}}>
            <label style={{cursor:"pointer"}}><input type="checkbox" checked={d.activo} onChange={()=>toggleActivo(d.id)}/></label>
            <div>
              <div style={{fontSize:12,fontWeight:700,color:C.text}}>{d.nombre || "—"}</div>
              <div style={{fontSize:10,color:C.muted}}>{d.email}</div>
            </div>
            <div style={{fontSize:11,color:C.accentL,fontWeight:600}}>{d.rol}</div>
            <div style={{fontSize:10,color:d.activo?C.green:C.muted2}}>{d.activo?"Activo":"Inactivo"}</div>
            <button onClick={()=>eliminar(d.id)} style={{background:"transparent",border:"none",color:C.red,cursor:"pointer",fontSize:14}}>🗑</button>
          </div>
        ))}
      </div>

      {/* Agregar nuevo */}
      {canEdit && (
        <div style={{padding:10,background:C.card2,borderRadius:8,border:`1px dashed ${C.border}`}}>
          <div style={{fontSize:11,fontWeight:700,color:C.accentL,marginBottom:8}}>+ Agregar destinatario</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 140px 100px",gap:8}}>
            <input value={nuevo.nombre} onChange={e=>setNuevo(p=>({...p,nombre:e.target.value}))} placeholder="Nombre" style={{padding:"6px 10px",borderRadius:6,border:`1px solid ${C.border}`,background:C.bg,color:C.text,fontSize:11}}/>
            <input value={nuevo.email} onChange={e=>setNuevo(p=>({...p,email:e.target.value}))} placeholder="email@dominio.cl" style={{padding:"6px 10px",borderRadius:6,border:`1px solid ${C.border}`,background:C.bg,color:C.text,fontSize:11}}/>
            <select value={nuevo.rol} onChange={e=>setNuevo(p=>({...p,rol:e.target.value}))} style={{padding:"6px 10px",borderRadius:6,border:`1px solid ${C.border}`,background:C.bg,color:C.text,fontSize:11}}>
              <option>Socio</option>
              <option>Directorio</option>
              <option>Gerente</option>
              <option>Equipo CFO</option>
              <option>Otro</option>
            </select>
            <button onClick={agregar} style={{padding:"6px 14px",background:C.accent,color:"#fff",border:"none",borderRadius:6,cursor:"pointer",fontWeight:700,fontSize:11}}>+ Agregar</button>
          </div>
        </div>
      )}

      {saved && <div style={{marginTop:10,padding:8,background:C.green+"22",color:C.green,borderRadius:6,fontSize:11}}>{saved}</div>}

      {canEdit && (
        <div style={{marginTop:14,display:"flex",justifyContent:"flex-end"}}>
          <button onClick={guardar} style={{padding:"8px 18px",background:C.accent,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:12}}>
            💾 Guardar lista
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Historial de reportes generados ───
function ReporteHistorial({historial, onUpdate, canEdit}) {
  function descargar(entrada) {
    if(!entrada?.pdfBase64) {
      alert("PDF no disponible (puede ser un reporte antiguo sin archivo guardado)");
      return;
    }
    const link = document.createElement("a");
    link.href = entrada.pdfBase64;
    link.download = entrada.nombreArchivo || `Reporte_${entrada.id}.pdf`;
    link.click();
  }

  function eliminar(id) {
    if(!window.confirm("¿Eliminar este reporte del historial? Esta acción no se puede deshacer.")) return;
    if(onUpdate) onUpdate(historial.filter(h => h.id !== id));
  }

  const ordenado = [...(historial || [])].sort((a,b) => (b.fechaGeneracion || "").localeCompare(a.fechaGeneracion || ""));

  return (
    <div style={{padding:14,background:C.card,borderRadius:10,border:`1px solid ${C.border}`}}>
      <div style={{fontSize:13,fontWeight:700,color:C.accentL,marginBottom:6}}>📁 Historial de Reportes</div>
      <div style={{fontSize:10,color:C.muted,marginBottom:14,fontStyle:"italic"}}>
        Todos los reportes generados. Puedes descargar PDFs antiguos o eliminarlos.
      </div>

      {ordenado.length === 0 ? (
        <div style={{padding:30,textAlign:"center",color:C.muted2,fontSize:11,fontStyle:"italic"}}>Sin reportes generados todavía</div>
      ) : (
        <div style={{overflowX:"auto",minWidth:0,maxWidth:"calc(100vw - 80px)"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead>
              <tr style={{borderBottom:`1px solid ${C.border}`}}>
                {["Fecha", "Semana", "Generado por", "Empresas", "Acciones"].map(h=>(
                  <th key={h} style={{padding:"8px",textAlign:"left",color:C.muted,fontWeight:700,fontSize:10}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordenado.map(h=>(
                <tr key={h.id} style={{borderBottom:`1px solid ${C.border2}33`}}>
                  <td style={{padding:"6px 8px",color:C.text}}>{new Date(h.fechaGeneracion).toLocaleString("es-CL")}</td>
                  <td style={{padding:"6px 8px",fontFamily:"monospace",color:C.accentL,fontWeight:700}}>W{h.semana}</td>
                  <td style={{padding:"6px 8px",color:C.muted}}>{h.generadoPor || "—"}</td>
                  <td style={{padding:"6px 8px",fontSize:10,color:C.muted}}>{(h.empresasIncluidas || []).length} empresas</td>
                  <td style={{padding:"6px 8px",display:"flex",gap:6}}>
                    <button onClick={()=>descargar(h)} style={{padding:"3px 10px",background:C.accent,color:"#fff",border:"none",borderRadius:4,cursor:"pointer",fontSize:10,fontWeight:700}}>📥 Descargar</button>
                    {canEdit && <button onClick={()=>eliminar(h.id)} style={{padding:"3px 8px",background:"transparent",border:`1px solid ${C.red}`,color:C.red,borderRadius:4,cursor:"pointer",fontSize:10}}>🗑</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MÓDULO PRINCIPAL
// ═══════════════════════════════════════════════════════════════════
export default function FinanzasModule({onBack,onLogout,usuarioActual,tabPermisos={},usuarios=[]}) {
  const [tab,setTab]=useState("dashboard");
  const [empTab,setEmpTab]=useState("Mediterra");
  const [flujoSubTab,setFlujoSubTab]=useState("flujo"); // "flujo" | "params"
  const [realData,setRealData]=useState({});
  const [params,setParams]=useState(defaultParams);
  const [allegraComisionArandanos,setAllegraComisionArandanos]=useState(defaultAllegraComisionArandanos);
  // paramsEmp: { empresa: { seasonKey: { prodId: defaultProducto() } } }
  const [paramsEmp,setParamsEmp]=useState({});
  // CREDITOS: dinámico — se puede agregar, editar y marcar como pagado
  const [creditosData,setCreditosData]=useState(CREDITOS_DEFAULT);
  // paramsAS: parámetros específicos Allegria Service
  const [paramsAS,setParamsAS]=useState(defaultParamsAllegriaService);
  // paramsIF: parámetros específicos Integrity Farms
  const [paramsIF,setParamsIF]=useState(defaultParamsIntegrity);
  const [paramsFrisku,setParamsFrisku]=useState(defaultParamsFrisku);
  // paramsAF: parámetros específicos Allpa Farms
  const [paramsAF,setParamsAF]=useState(defaultParamsAllpa);
  // subLines: { empresa: { lineLabel: [nombre1, nombre2, ...] } }
  const [subLines,setSubLines]=useState({});
  // addedLines: { empresa: { cat: [{label, vals:{idx:val}}] } } — filas agregadas por usuario
  const [addedLinesGlobal,setAddedLinesGlobal]=useState({});
  // intercompany: array de transferencias entre empresas
  // [{id, fecha, origen, destino, tipo, monto, descripcion, mes}]
  const [intercompany,setIntercompany]=useState([]);
  const [saldosBancos,setSaldosBancos]=useState({});
  // Reporte Semanal: configuración
  const [umbralesReporte,setUmbralesReporte]=useState({});
  const [destinatariosReporte,setDestinatariosReporte]=useState([]);
  const [comentariosReporte,setComentariosReporte]=useState({});
  const [historialReportes,setHistorialReportes]=useState([]);
  const [loading,setLoading]=useState(true);
  const [saved,setSaved]=useState(null);

  const esAdmin = usuarioActual?.rol==="admin";
  const canEdit = esAdmin || ["Angelo Huerta","Carol Machuca"].includes(usuarioActual?.nombre||"");

  const perm     = (tabId) => tabPermisos?.[tabId] ?? "editar";
  const puedoVer = (tabId) => esAdmin || perm(tabId) !== "sin_acceso";
  const puedoEdit= (tabId) => esAdmin || (perm(tabId) !== "ver" && perm(tabId) !== "sin_acceso");

  // Permisos por empresa (defensa en profundidad: filtra UI Y cálculos).
  // El blob completo permanece en state — el filtro es solo a nivel de vista.
  const empresasPermitidas = useMemo(
    () => getEmpresasPermitidasUsuario(usuarioActual),
    [usuarioActual]
  );
  const accesoCompletoEmpresas = useMemo(
    () => esAccesoCompletoUsuario(usuarioActual),
    [usuarioActual]
  );

  const empresas=useMemo(()=>{
    const base = buildEmpresas(params, allegraComisionArandanos);
    // Recalculate Préstamos + Renovaciones proy using current creditosData
    Object.keys(base).forEach(empNombre=>{
      const emp = base[empNombre];
      base[empNombre] = {
        ...emp,
        sections: emp.sections.map(sec=>{
          // egr_nop: Pago Préstamos + Renovaciones (egresos)
          if(sec.cat==="egr_nop") {
            return {
              ...sec,
              lines: sec.lines.map(l=>{
                if(l.label==="Pago Préstamos - Total")
                  return {...l, proy: calcPrestamosEmpresa(empNombre, creditosData)};
                if(l.label==="Renovaciones")
                  return {...l, proy: calcRenovacionesEmpresa(empNombre, creditosData)};
                return l;
              })
            };
          }
          // ing_nop: Ingreso Renovación + Ingresos Financiamiento (ingresos)
          if(sec.cat==="ing_nop") {
            return {
              ...sec,
              lines: sec.lines.map(l=>{
                if(l.label==="Ingreso Renovación")
                  return {...l, proy: calcIngresoRenovacionEmpresa(empNombre, creditosData)};
                if(l.label==="Ingresos Financiamiento")
                  return {...l, proy: calcIngresosPrestamosEmpresa(empNombre, creditosData)};
                return l;
              })
            };
          }
          return sec;
        })
      };
    });
    // Inject Allegria Service calculated projections
    const {ingCerezas,ingCiruelas} = calcAllegriaService(paramsAS);
    const as = base["Allegria Service"];
    if(as) {
      const next = JSON.parse(JSON.stringify(as));
      next.sections = next.sections.map(sec=>{
        if(sec.cat!=="ing_op") return sec;
        return {...sec, lines: sec.lines.map(l=>{
          if(l.label==="Proceso de Cerezas")   return {...l,proy:[...ingCerezas],  formula:true};
          if(l.label==="Procesos de Ciruelas")  return {...l,proy:[...ingCiruelas], formula:true};
          return l;
        })};
      });
      base["Allegria Service"] = next;
    }
    // Inject Allpa Farms calculated projections
    const {ingArr:ingAF, costArr:costAF, trspArr:trspAF} = calcAllpa(paramsAF);
    const afEmp = base["Allpa Farms"];
    if(afEmp) {
      const nextAF = JSON.parse(JSON.stringify(afEmp));
      nextAF.sections = nextAF.sections.map(sec=>{
        if(sec.cat==="ing_op") return {...sec,lines:sec.lines.map(l=>{
          if(l.label==="Ingreso Exportación Cerezas") return {...l,proy:[...ingAF],formula:true};
          return l;
        })};
        if(sec.cat==="egr_var") return {...sec,lines:sec.lines.map(l=>{
          if(l.label==="Remuneración Cosecha") return {...l,proy:[...costAF],formula:true};
          if(l.label==="Transporte")           return {...l,proy:[...trspAF],formula:true};
          return l;
        })};
        return sec;
      });
      base["Allpa Farms"] = nextAF;
    }

    // Inject Integrity Farms calculated projections
    const ingIF = calcIntegrity(paramsIF);
    const ifEmp = base["Integrity Farms"];
    if(ifEmp) {
      const nextIF = JSON.parse(JSON.stringify(ifEmp));
      nextIF.sections = nextIF.sections.map(sec=>{
        if(sec.cat!=="ing_op") return sec;
        return {...sec, lines: sec.lines.map(l=>{
          if(l.label==="Ingreso Administración (us$2.000/ha)")
            return {...l, proy:[...ingIF], formula:true};
          return l;
        })};
      });
      base["Integrity Farms"] = nextIF;
    }
    // Inject Frisku Foods calculated projections
    const ingFrisku = calcFrisku(paramsFrisku);
    const friskuEmp = base["Frisku Foods"];
    if(friskuEmp) {
      const nextFrisku = JSON.parse(JSON.stringify(friskuEmp));
      nextFrisku.sections = nextFrisku.sections.map(sec=>{
        if(sec.cat!=="ing_op") return sec;
        return {...sec, lines: sec.lines.map(l=>{
          if(l.label==="Ingreso Carga Contenedores") {
              // Solo sobreescribir meses que tienen valor en ingFrisku
              const merged = [...l.proy];
              ingFrisku.forEach((v,i) => { if(v !== 0) merged[i] = v; });
              return {...l, proy: merged};
            }
          return l;
        })};
      });
      base["Frisku Foods"] = nextFrisku;
    }

    // Inject Allpa Farms Perú — presupuesto de costos 2026 con +5%/año.
    // Reemplaza líneas de egr_var (var campo + packing + otros) y egr_fijo
    // (fijo campo + admin). Flujo aparte (fuera del consolidado).
    const apEmp = base["Allpa Farms Perú"];
    if(apEmp) {
      const { egr_var:apVar, egr_fijo:apFijo } = buildAllpaPeruLineas();
      const nextAP = JSON.parse(JSON.stringify(apEmp));
      nextAP.sections = nextAP.sections.map(sec=>{
        if(sec.cat==="egr_var")  return {...sec, lines: apVar.map(l=>({...l, formula:true}))};
        if(sec.cat==="egr_fijo") return {...sec, lines: apFijo.map(l=>({...l, formula:true}))};
        return sec;
      });
      base["Allpa Farms Perú"] = nextAP;
    }
    return base;
  },[params,allegraComisionArandanos,paramsAS,paramsIF,paramsAF,creditosData,paramsFrisku]);

  // Empresas con overrides aplicados — para Dashboard y cualquier otro consumer que no sea Consolidado
  const empresasConOverridesMain = useMemo(
    () => buildEmpresasConOverrides(empresas, realData, addedLinesGlobal, subLines),
    [empresas, realData, addedLinesGlobal, subLines] // eslint-disable-line
  );

  // Subset de empresas visibles para el usuario actual.
  // El blob raw (state) NO se filtra; el filtro vive en esta derivación de vista.
  const empresasVisibles = useMemo(() => {
    const out = {};
    empresasPermitidas.forEach(k => { if(empresas[k]) out[k] = empresas[k]; });
    return out;
  }, [empresas, empresasPermitidas]);
  const empresasConOverridesVisibles = useMemo(() => {
    const out = {};
    empresasPermitidas.forEach(k => { if(empresasConOverridesMain[k]) out[k] = empresasConOverridesMain[k]; });
    return out;
  }, [empresasConOverridesMain, empresasPermitidas]);

  const TABS_ALL=[
    {id:"dashboard",label:"📊 Dashboard"},
    {id:"flujo",    label:"📈 Flujo Empresas"},
    {id:"bancos",   label:"🏦 Saldos Bancos"},
    {id:"creditos", label:"💳 Créditos"},
    {id:"nominas",  label:"📋 Nóminas"},
    {id:"reporte",  label:"📅 Reporte Semanal"},
    {id:"auditoria",label:"🔍 Auditoría"},
    {id:"eeff",     label:"📑 EEFF"},
    {id:"rendiciones",label:"🧾 Rendiciones"},
  ];
  // Solo mostrar pestañas a las que el usuario tiene acceso
  // Auditoría: solo admin
  // Dashboard: solo si tiene acceso completo a empresas del consolidado
  const TABS = TABS_ALL.filter(t => {
    if(t.id==="auditoria") return usuarioActual?.rol==="admin";
    // Dashboard y Reporte Semanal: solo con acceso completo (vistas agregadas del grupo)
    if((t.id==="dashboard" || t.id==="reporte") && !accesoCompletoEmpresas) return false;
    return puedoVer(t.id);
  });

  // Si la tab activa no está disponible, ir a la primera disponible
  useEffect(()=>{
    if(TABS.length>0 && !TABS.find(t=>t.id===tab)){
      setTab(TABS[0].id);
    }
  // eslint-disable-next-line
  },[tabPermisos, accesoCompletoEmpresas]);

  // Si empTab apunta a consolidado/intercompany sin acceso completo,
  // o a una empresa fuera del subset permitido → caer en la primera permitida.
  useEffect(()=>{
    const esVistaAgregada = empTab==="_consolidado" || empTab==="_intercompany";
    if(esVistaAgregada && !accesoCompletoEmpresas){
      if(empresasPermitidas.length>0) setEmpTab(empresasPermitidas[0]);
    } else if(!esVistaAgregada && !empresasPermitidas.includes(empTab)){
      if(empresasPermitidas.length>0) setEmpTab(empresasPermitidas[0]);
    }
  // eslint-disable-next-line
  },[accesoCompletoEmpresas, empresasPermitidas]);

  // ── Carga inicial de datos ────────────────────────────────────────
  function applyData(d) {
    if(!d) return;
    if(d?.finanzas_real) setRealData(d.finanzas_real);
    else if(d?.calendario_data) setRealData(d.calendario_data);
    else if(d&&!d.calendario_data&&!d.allegria_params&&!d.finanzas_real) setRealData(d);
    if(d?.allegria_params) setParams(prev=>({...defaultParams(),...d.allegria_params}));
    if(d?.allegria_comision_arandanos) {
      setAllegraComisionArandanos(d.allegria_comision_arandanos);
    } else {
      const migrated = migrateAllegraComisionArandanos(d?.allegria_params);
      if(migrated) setAllegraComisionArandanos(migrated);
    }
    if(d?.params_emp) setParamsEmp(d.params_emp);
    if(d?.saldos_bancos) setSaldosBancos(d.saldos_bancos);
    if(d?.params_as)    setParamsAS(prev=>({...defaultParamsAllegriaService(),...d.params_as}));
    if(d?.params_if)    setParamsIF(prev=>({...defaultParamsIntegrity(),...d.params_if}));
    if(d?.params_af) {
      setParamsAF(prev=>{
        const defaults = defaultParamsAllpa();
        const merged = {...defaults};
        // Merge profundo por temporada: solo usar datos guardados si tienen variedades
        Object.keys(d.params_af).forEach(sk=>{
          const saved = d.params_af[sk];
          if(saved && saved.variedades && saved.variedades.length > 0) {
            // Tiene datos reales guardados → usar los guardados
            merged[sk] = saved;
          }
          // Si no tiene variedades → mantener el default (que puede tener datos pre-cargados)
        });
        return merged;
      });
    }
    if(d?.sub_lines)    setSubLines(d.sub_lines);
    if(d?.added_lines)  setAddedLinesGlobal(d.added_lines);
    if(d?.intercompany)   setIntercompany(d.intercompany||[]);
    if(d?.creditos_data && Array.isArray(d.creditos_data) && d.creditos_data.length>0) setCreditosData(d.creditos_data);
    if(d?.params_frisku) setParamsFrisku(prev=>d.params_frisku||prev);
  }

  useEffect(()=>{
    dbLoad()
      .then(d=>{ applyData(d); cargaOkRef.current = true; setLoading(false); window._finLoadTime = Date.now(); })
      .catch(e=>{ console.error("[Finanzas] Carga falló — GUARDADO DESHABILITADO esta sesión (no se sobrescribe Supabase):", e); setLoading(false); });

    // Con el guardia prendido: sincronización por sondeo autenticado (la
    // puerta vieja del WebSocket anónimo se cierra).
    if (USE_GUARD) {
      const stop = pollRow("finanzas", (d)=>{ if(d) applyData(d); });
      return () => stop();
    }

    // ── Supabase Realtime — sincronización instantánea entre usuarios ──
    // Escucha cambios en la fila "finanzas" de calendario_data
    // Cuando otro usuario guarda → todos reciben los nuevos datos al instante
    const channel = new WebSocket(
      `wss://${SUPA_URL.replace('https://','')}/realtime/v1/websocket?apikey=${SUPA_KEY}&vsn=1.0.0`
    );

    let joined = false;
    const REF   = () => String(Date.now());
    const TOPIC = "realtime:public:calendario_data";

    channel.onopen = () => {
      // Join the realtime channel
      channel.send(JSON.stringify({
        topic: TOPIC, event: "phx_join",
        payload: { config: { broadcast:{ack:false,self:false}, presence:{key:""} } },
        ref: REF()
      }));
    };

    channel.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        // Heartbeat keepalive
        if(msg.event === "phx_reply" && !joined) { joined=true; return; }
        if(msg.topic === "phoenix" && msg.event === "phx_reply") {
          channel.send(JSON.stringify({topic:"phoenix",event:"heartbeat",payload:{},ref:REF()}));
          return;
        }
        // Data change event
        if(msg.topic === TOPIC && (msg.event === "INSERT" || msg.event === "UPDATE")) {
          const record = msg.payload?.record;
          if(record?.id === "finanzas" && record?.value) {
            try {
              const d = JSON.parse(record.value);
              applyData(d);
            } catch(err) {}
          }
        }
      } catch(err) {}
    };

    // Heartbeat every 30s to keep connection alive
    const hb = setInterval(()=>{
      if(channel.readyState === WebSocket.OPEN) {
        channel.send(JSON.stringify({topic:"phoenix",event:"heartbeat",payload:{},ref:REF()}));
      }
    }, 30000);

    return () => {
      clearInterval(hb);
      if(channel.readyState === WebSocket.OPEN) channel.close();
    };
  // eslint-disable-next-line
  },[]);

  // Refs para siempre tener el valor mas reciente sin stale closures
  const realDataRef     = React.useRef(realData);
  const paramsRef       = React.useRef(params);
  const allegraComisionArandanosRef = React.useRef(allegraComisionArandanos);
  const saldosBancosRef = React.useRef(saldosBancos);
  const paramsEmpRef    = React.useRef(paramsEmp);
  const paramsASRef     = React.useRef(paramsAS);
  const creditosRef     = React.useRef(creditosData);
  const paramsIFRef     = React.useRef(paramsIF);
  const paramsFriskuRef = React.useRef(paramsFrisku);
  const paramsAFRef     = React.useRef(paramsAF);
  const subLinesRef      = React.useRef(subLines);
  const addedLinesRef    = React.useRef(addedLinesGlobal);
  const intercompanyRef  = React.useRef(intercompany);
  // GUARD anti-borrado: solo se permite guardar tras una carga EXITOSA desde
  // Supabase. Si dbLoad() falla (red/timeout), queda en false y persistAll no
  // escribe nada → un parpadeo de conexión no puede sobrescribir Finanzas con
  // los defaults vacíos en memoria.
  const cargaOkRef       = React.useRef(false);
  useEffect(()=>{ realDataRef.current     = realData;     },[realData]);
  useEffect(()=>{ paramsRef.current       = params;       },[params]);
  useEffect(()=>{ allegraComisionArandanosRef.current = allegraComisionArandanos; },[allegraComisionArandanos]);
  useEffect(()=>{ saldosBancosRef.current = saldosBancos; },[saldosBancos]);
  useEffect(()=>{ paramsEmpRef.current    = paramsEmp;    },[paramsEmp]);
  useEffect(()=>{ paramsASRef.current     = paramsAS;     },[paramsAS]);
  useEffect(()=>{ creditosRef.current     = creditosData;  },[creditosData]);
  useEffect(()=>{ paramsIFRef.current     = paramsIF;     },[paramsIF]);
  useEffect(()=>{ paramsFriskuRef.current = paramsFrisku; },[paramsFrisku]);
  useEffect(()=>{ paramsAFRef.current     = paramsAF;     },[paramsAF]);
  useEffect(()=>{ subLinesRef.current     = subLines;     },[subLines]);
  useEffect(()=>{ addedLinesRef.current   = addedLinesGlobal; },[addedLinesGlobal]);
  useEffect(()=>{ intercompanyRef.current = intercompany; },[intercompany]);

  // ─── Handlers para Reporte Semanal ───
  // Guarda configuración en realData._reporteSemanal._<seccion>
  const handleSaveUmbralesReporte = useCallback(async (umbrales) => {
    const next = JSON.parse(JSON.stringify(realDataRef.current));
    if(!next._reporteSemanal) next._reporteSemanal = {};
    next._reporteSemanal.umbrales = umbrales;
    setRealData(next);
    realDataRef.current = next;
    setUmbralesReporte(umbrales);
    await persistAll({ finanzas_real: next });
  }, []); // eslint-disable-line

  const handleSaveDestinatariosReporte = useCallback(async (destinatarios) => {
    const next = JSON.parse(JSON.stringify(realDataRef.current));
    if(!next._reporteSemanal) next._reporteSemanal = {};
    next._reporteSemanal.destinatarios = destinatarios;
    setRealData(next);
    realDataRef.current = next;
    setDestinatariosReporte(destinatarios);
    await persistAll({ finanzas_real: next });
  }, []); // eslint-disable-line

  const handleSaveComentariosReporte = useCallback(async (comentarios) => {
    const next = JSON.parse(JSON.stringify(realDataRef.current));
    if(!next._reporteSemanal) next._reporteSemanal = {};
    next._reporteSemanal.comentarios = comentarios;
    setRealData(next);
    realDataRef.current = next;
    setComentariosReporte(comentarios);
    await persistAll({ finanzas_real: next });
  }, []); // eslint-disable-line

  const handleSaveHistorialReportes = useCallback(async (historial) => {
    const next = JSON.parse(JSON.stringify(realDataRef.current));
    if(!next._reporteSemanal) next._reporteSemanal = {};
    next._reporteSemanal.historial = historial;
    setRealData(next);
    realDataRef.current = next;
    setHistorialReportes(historial);
    await persistAll({ finanzas_real: next });
  }, []); // eslint-disable-line

  // Cargar configuración cuando carga realData
  useEffect(() => {
    const cfg = realData?._reporteSemanal;
    if(cfg) {
      if(cfg.umbrales) setUmbralesReporte(cfg.umbrales);
      if(Array.isArray(cfg.destinatarios)) setDestinatariosReporte(cfg.destinatarios);
      if(cfg.comentarios) setComentariosReporte(cfg.comentarios);
      if(Array.isArray(cfg.historial)) setHistorialReportes(cfg.historial);
    }
  }, [realData?._reporteSemanal]);

  // Helper centralizado - siempre usa los valores mas recientes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const persistAll = useCallback((overrides={})=>{
    // GUARD anti-borrado: si la carga inicial falló, NO escribir (evita
    // sobrescribir Supabase con los defaults vacíos en memoria).
    if(!cargaOkRef.current) {
      console.warn("[persistAll] Bloqueado — la carga inicial falló; no se guarda para no borrar datos.");
      return Promise.resolve(false);
    }
    // No guardar durante los primeros 10 segundos después de cargar (evita sobreescribir con datos vacíos)
    if(window._finLoadTime && (Date.now() - window._finLoadTime) < 10000) {
      console.log("[persistAll] Bloqueado — app aún cargando");
      return Promise.resolve(true); // simular éxito para no mostrar error
    }
    return dbSave({
      finanzas_real:   overrides.finanzas_real   !== undefined ? overrides.finanzas_real   : realDataRef.current,
      allegria_params: overrides.allegria_params !== undefined ? overrides.allegria_params : paramsRef.current,
      allegria_comision_arandanos: overrides.allegria_comision_arandanos !== undefined ? overrides.allegria_comision_arandanos : allegraComisionArandanosRef.current,
      saldos_bancos:   overrides.saldos_bancos   !== undefined ? overrides.saldos_bancos   : saldosBancosRef.current,
      params_emp:      overrides.params_emp      !== undefined ? overrides.params_emp      : paramsEmpRef.current,
      creditos_data:   overrides.creditos_data !== undefined ? overrides.creditos_data : creditosRef.current,
      params_as:       overrides.params_as       !== undefined ? overrides.params_as       : paramsASRef.current,
      params_frisku:   overrides.params_frisku !== undefined ? overrides.params_frisku : paramsFriskuRef.current,
      params_if:       overrides.params_if       !== undefined ? overrides.params_if       : paramsIFRef.current,
      params_af:       overrides.params_af       !== undefined ? overrides.params_af       : paramsAFRef.current,
      sub_lines:       overrides.sub_lines       !== undefined ? overrides.sub_lines       : subLinesRef.current,
      added_lines:     overrides.added_lines     !== undefined ? overrides.added_lines     : addedLinesRef.current,
      intercompany:    overrides.intercompany    !== undefined ? overrides.intercompany    : intercompanyRef.current,
    });
  },[]); // eslint-disable-line

  const handleSaveReal=useCallback(async(empresa,mes,semana,vals)=>{
    const next=JSON.parse(JSON.stringify(realDataRef.current));
    if(!next[empresa]) next[empresa]={};
    if(!next[empresa][mes]) next[empresa][mes]={};
    next[empresa][mes][semana]=vals;
    setRealData(next);
    realDataRef.current = next;
    const ok=await persistAll({ finanzas_real:next });
    setSaved(ok?"✅ Guardado":"⚠️ Error");
    setTimeout(()=>setSaved(null),3000);
  },[persistAll]);

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
      realDataRef.current = next;
      setTimeout(()=>{
        persistAll({ finanzas_real:next })
          .then(ok=>{ setSaved(ok?"✅ Proyección guardada":"⚠️ Error"); setTimeout(()=>setSaved(null),2000); });
      },0);
      return next;
    });
  },[persistAll]);

  // setParamsEmp para una empresa específica
  const handleSaveParamsFrisku = useCallback((updater) => {
    const next = typeof updater === 'function' ? updater(paramsFriskuRef.current) : updater;
    setParamsFrisku(next);
    paramsFriskuRef.current = next;
    setTimeout(()=>persistAll({ params_frisku: next }),0);
  },[persistAll]);

  const handleSaveAllegraComisionArandanos = useCallback((updater) => {
    const next = typeof updater === 'function' ? updater(allegraComisionArandanosRef.current) : updater;
    setAllegraComisionArandanos(next);
    allegraComisionArandanosRef.current = next;
    setTimeout(()=>persistAll({ allegria_comision_arandanos: next }),0);
  },[persistAll]);

  // Guardar créditos (nuevo, editar, marcar pagado)
  const handleSaveCreditos = useCallback((newList) => {
    // Permisos por empresa: merge contra el blob completo en memoria.
    // 1. Validar: descartar registros cuya empresa NO esté permitida.
    // 2. Preservar intactos los créditos de empresas fuera del subset del usuario.
    const anterior = creditosRef.current || [];
    const permitidas = getEmpresasPermitidasUsuario(usuarioActual);
    const nextValidado = (Array.isArray(newList)?newList:[])
      .filter(c => permitidas.includes(c?.empresa));
    const preservados = anterior.filter(c => !permitidas.includes(c?.empresa));
    const final = [...preservados, ...nextValidado];

    setCreditosData(final);
    creditosRef.current = final;
    setTimeout(()=>{
      persistAll({ creditos_data: final })
        .then(ok=>{ setSaved(ok?"✅ Guardado":"⚠️ Error"); setTimeout(()=>setSaved(null),2000); });
    }, 0);
  },[persistAll, usuarioActual]);

  // Guardar transferencias intercompany
  const handleSaveIntercompany = useCallback((newList) => {
    setIntercompany(newList);
    intercompanyRef.current = newList;
    setTimeout(()=>{
      persistAll({ intercompany: newList })
        .then(ok=>{ setSaved(ok?"✅ Guardado":"⚠️ Error"); setTimeout(()=>setSaved(null),2000); });
    },0);
  },[persistAll]);

  // Guardar subfilas (clientes CxC / acreedores préstamos) en Supabase
  const handleSaveSubLines = useCallback((empresa, lineLabel, newList) => {
    setSubLines(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      if(!next[empresa]) next[empresa] = {};
      next[empresa][lineLabel] = newList;
      subLinesRef.current = next;
      setTimeout(()=>{
        persistAll({ sub_lines: next })
          .then(ok=>{ setSaved(ok ? "✅ Guardado" : "⚠️ Error"); setTimeout(()=>setSaved(null),2000); });
      }, 0);
      return next;
    });
  },[persistAll]);

  const handleSaveAddedLines = useCallback((empresa, newAddedLines) => {
    setAddedLinesGlobal(prev => {
      const next = {...prev, [empresa]: newAddedLines};
      addedLinesRef.current = next;
      setTimeout(()=>{
        persistAll({ added_lines: next })
          .then(ok=>{ setSaved(ok ? "✅ Guardado" : "⚠️ Error"); setTimeout(()=>setSaved(null),2000); });
      }, 0);
      return next;
    });
  },[persistAll]);

  // Guardar paramsAF de Allpa Farms
  const handleSaveParamsAF = useCallback((updater) => {
    setParamsAF(prev=>{
      const next = typeof updater === "function" ? updater(prev) : updater;
      paramsAFRef.current = next;
      setTimeout(()=>persistAll({ params_af:next })
        .then(ok=>{setSaved(ok?"✅ Guardado":"⚠️ Error");setTimeout(()=>setSaved(null),2000);}),0);
      return next;
    });
  },[persistAll]);

  // Guardar paramsIF de Integrity Farms
  const handleSaveParamsIF = useCallback((updater) => {
    setParamsIF(prev=>{
      const next = typeof updater === "function" ? updater(prev) : updater;
      paramsIFRef.current = next;
      setTimeout(()=>persistAll({ params_if:next })
        .then(ok=>{setSaved(ok?"✅ Guardado":"⚠️ Error");setTimeout(()=>setSaved(null),2000);}),0);
      return next;
    });
  },[persistAll]);

  // Guardar paramsAS de Allegria Service
  const handleSaveParamsAS = useCallback((updater) => {
    setParamsAS(prev=>{
      const next = typeof updater === "function" ? updater(prev) : updater;
      paramsASRef.current = next;
      setTimeout(()=>persistAll({ params_as:next })
        .then(ok=>{setSaved(ok?"✅ Parámetros guardados":"⚠️ Error");setTimeout(()=>setSaved(null),2000);}),0);
      return next;
    });
  },[persistAll]);

  const setParamsEmpresa = useCallback((empresa, updater) => {
    setParamsEmp(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      if(!next[empresa]) next[empresa] = defaultParamsEmp();
      next[empresa] = typeof updater === "function" ? updater(next[empresa]) : updater;
      paramsEmpRef.current = next;
      setTimeout(()=>persistAll({ params_emp:next })
        .then(ok=>{setSaved(ok?"✅ Parámetros guardados":"⚠️ Error");setTimeout(()=>setSaved(null),2000);}),0);
      return next;
    });
  },[persistAll]);

  const handleSaveSaldos=useCallback(async(nextRecibido)=>{
    // Permisos por empresa — defensa en profundidad.
    // 1. Validar: descartar del payload del child cualquier key cuya empresa NO esté permitida.
    // 2. Merge: preservar intactas las keys de empresas fuera del subset del usuario.
    // 3. AuditLog: comparar solo dentro del subset permitido (no logear eliminaciones falsas).
    const anterior = saldosBancosRef.current || {};
    const empKey = (k) => (k||"").split("||")[0];
    const permitidas = getEmpresasPermitidasUsuario(usuarioActual);
    const esPermitida = (k) => permitidas.includes(empKey(k));

    const nextValidado = {};
    Object.keys(nextRecibido||{}).forEach(k=>{
      if(esPermitida(k)) nextValidado[k] = nextRecibido[k];
    });
    const anteriorPermitido = {};
    Object.keys(anterior).forEach(k=>{
      if(esPermitida(k)) anteriorPermitido[k] = anterior[k];
    });

    // Auditoría: cambios y ratificaciones sobre el subset del usuario
    Object.keys(nextValidado).forEach(key=>{
      const antes = Number(anteriorPermitido[key]?.monto) || 0;
      const despues = Number(nextValidado[key]?.monto) || 0;
      const fechaAntes = anteriorPermitido[key]?.fecha || null;
      const fechaDespues = nextValidado[key]?.fecha || null;
      const [emp, banco, moneda] = key.split("||");
      if(antes !== despues) {
        window.auditLog&&window.auditLog("editar", {modulo:"finanzas", seccion:"saldos bancos",
          descripcion:`Actualizó saldo de ${emp} · ${banco} · ${(moneda||"").toUpperCase()}`,
          registroId:key, campo:"monto",
          valorAnterior:antes.toLocaleString("es-CL"),
          valorNuevo:despues.toLocaleString("es-CL")});
      } else if(fechaAntes !== fechaDespues && despues !== 0) {
        window.auditLog&&window.auditLog("editar", {modulo:"finanzas", seccion:"saldos bancos",
          descripcion:`Ratificó saldo de ${emp} · ${banco} · ${(moneda||"").toUpperCase()} (sin cambio de monto)`,
          registroId:key, campo:"fecha",
          valorAnterior:fechaAntes||"—",
          valorNuevo:fechaDespues||"—"});
      }
    });
    // Eliminaciones: solo dentro del subset permitido
    Object.keys(anteriorPermitido).forEach(key=>{
      if(!(key in nextValidado) && Number(anteriorPermitido[key]?.monto) !== 0) {
        const [emp, banco, moneda] = key.split("||");
        window.auditLog&&window.auditLog("eliminar", {modulo:"finanzas", seccion:"saldos bancos",
          descripcion:`Eliminó saldo de ${emp} · ${banco} · ${(moneda||"").toUpperCase()}`,
          registroId:key});
      }
    });

    // Merge: preservar empresas no permitidas + aplicar subset del usuario
    const merged = {};
    Object.entries(anterior).forEach(([k,v])=>{
      if(!esPermitida(k)) merged[k] = v;
    });
    Object.assign(merged, nextValidado);

    setSaldosBancos(merged);
    saldosBancosRef.current = merged;
    setSaved("💾 Guardando…");
    const ok=await persistAll({ saldos_bancos:merged });
    setSaved(ok?"✅ Saldos guardados":"⚠️ Error al guardar — ver consola");
    setTimeout(()=>setSaved(null),4000);
  },[persistAll, usuarioActual]);

  useEffect(()=>{
    if(loading) return;
    const t=setTimeout(()=>persistAll(),800);
    return ()=>clearTimeout(t);
  },[params,saldosBancos,loading]); // eslint-disable-line

  // ── Print CSS ─────────────────────────────────────────────────
  useEffect(()=>{
    const style=document.createElement('style');
    style.id='mediterra-print-css';
    style.textContent=`
      @media print {
        @page{size:A3 landscape;margin:8mm}
        body *{visibility:hidden}
        #flujo-print-area,#flujo-print-area *{visibility:visible}
        #flujo-print-area{position:fixed;top:0;left:0;width:100%;background:white!important;padding:8px}
        .no-print{display:none!important}
        table{border-collapse:collapse;font-size:7px;width:100%}
        th{background:#1e293b!important;color:white!important;padding:3px 5px;white-space:nowrap;font-size:7px;text-align:right}
        th:first-child{text-align:left}
        td{padding:2px 5px;border-bottom:1px solid #e2e8f0;white-space:nowrap;font-size:7px;text-align:right}
        td:first-child{text-align:left;font-weight:600}
        tr:nth-child(even){background:#f8fafc!important}
      }
    `;
    document.head.appendChild(style);
    return()=>{const el=document.getElementById('mediterra-print-css');if(el)el.remove();};
  // eslint-disable-next-line
  },[]);

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
      maxWidth:"100%",
      overflowX:"hidden",
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
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{display:"flex",alignItems:"center",gap:8,fontSize:13,flexWrap:"wrap"}}>
            <button onClick={onBack} style={{background:"none",border:"none",color:"rgba(255,255,255,0.7)",cursor:"pointer",fontSize:13,fontWeight:500,padding:0}}>Mediterra</button>
            <span style={{color:"rgba(255,255,255,0.45)"}}>›</span>
            <span style={{color:C.accent,fontWeight:700,fontSize:14}}>Finanzas</span>
          </div>
          <div style={{borderLeft:"1px solid rgba(255,255,255,0.2)",paddingLeft:14}}>
            <img src="/med.png" alt="Mediterra" style={{height:30,objectFit:"contain"}}
              onError={e=>{e.target.style.display="none";}}/>
          </div>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.7)"}}>Apr-2026 → Jun-2031 · 64 meses · USD</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {saved&&<span style={{fontSize:11,color:"rgba(255,255,255,0.85)",background:"rgba(255,255,255,0.1)",
            borderRadius:20,padding:"3px 10px",border:"1px solid rgba(255,255,255,0.2)"}}>{saved}</span>}
          <button onClick={onLogout} style={{
            background:"transparent",
            border:"1px solid rgba(255,255,255,0.4)",
            color:"#fff",borderRadius:8,
            padding:"6px 14px",cursor:"pointer",fontSize:12,fontWeight:600,
          }}>Salir</button>
        </div>
      </div>

      {/* ── Pestañas ───────────────────────────────────────── */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:20}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{
              padding:"8px 18px",borderRadius:8,cursor:"pointer",fontWeight:600,fontSize:12,
              border:`1px solid ${tab===t.id?C.primary:C.border}`,
              background:tab===t.id?C.primary:C.card,
              color:tab===t.id?C.primaryText:C.text,
              boxShadow:tab===t.id?C.shadow:"none",
              transition:"all 0.15s",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Contenido por pestaña ──────────────────────────── */}
      {tab==="dashboard"&&puedoVer("dashboard")&&accesoCompletoEmpresas&&<Dashboard empresas={empresas} empresasConOverrides={empresasConOverridesMain} saldosBancos={saldosBancos}/>}

      {tab==="flujo"&&puedoVer("flujo")&&(
        <div>
          {/* Selector empresa + botón Consolidado */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12,alignItems:"center"}}>
            {accesoCompletoEmpresas&&(<>
            <button onClick={()=>{setEmpTab("_consolidado");setFlujoSubTab("flujo");}}
              style={{padding:"7px 14px",borderRadius:8,cursor:"pointer",fontSize:11,fontWeight:600,
                border:`2px solid ${empTab==="_consolidado"?"#a78bfa":"#a78bfa55"}`,
                background:empTab==="_consolidado"?"#a78bfa33":C.card,
                color:empTab==="_consolidado"?"#a78bfa":C.muted,transition:"all 0.15s"}}>
              🏛 Consolidado
            </button>
            <button onClick={()=>{setEmpTab("_intercompany");setFlujoSubTab("flujo");}}
              style={{padding:"7px 14px",borderRadius:8,cursor:"pointer",fontSize:11,fontWeight:600,
                border:`2px solid ${empTab==="_intercompany"?"#f59e0b":"#f59e0b55"}`,
                background:empTab==="_intercompany"?"#f59e0b33":C.card,
                color:empTab==="_intercompany"?"#f59e0b":C.muted,transition:"all 0.15s"}}>
              🔄 Intercompany
            </button>
            </>)}
            {["Mediterra","Allegria Foods","Allegria Service","Frisku Foods",
              "Osiris","Integrity Farms","Allpa Farms","Allpa Farms Perú"
            ].filter(n=>empresas[n]&&empresasPermitidas.includes(n)).map(n=>{const e=empresas[n];return (
              <button key={n} onClick={()=>{setEmpTab(n);setFlujoSubTab("flujo");}}
                style={{padding:"7px 14px",borderRadius:8,cursor:"pointer",fontSize:11,fontWeight:600,
                  border:`1px solid ${empTab===n?e.color:C.border}`,
                  background:empTab===n?`${e.color}33`:C.card,
                  color:empTab===n?e.color:C.muted,transition:"all 0.15s"}}>
                {e.emoji} {n}{n==="Allegria Foods"&&<span style={{fontSize:9,marginLeft:3,color:C.yellow}}>✦</span>}
              </button>
            );})}
          </div>

          {/* Sub-pestañas Flujo/Parámetros — solo cuando NO es consolidado */}
          {empTab!=="_consolidado"&&empTab!=="_intercompany"&&(
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
            {flujoSubTab==="flujo"&&empTab!=="_consolidado"&&empTab!=="_intercompany"&&(
              <button onClick={()=>window.print()}
                style={{marginLeft:"auto",padding:"5px 12px",borderRadius:8,
                  border:"1px solid #334155",background:"transparent",
                  color:C.muted,cursor:"pointer",fontSize:11,display:"flex",
                  alignItems:"center",gap:5}}>
                🖨️ Imprimir PDF
              </button>
            )}
          </div>

          {/* Contenido sub-pestaña */}
          {flujoSubTab==="flujo"&&(
            <div id="flujo-print-area">
              {/* Print header — solo visible al imprimir */}
              <div style={{display:"none"}} className="print-header-block">
                <div style={{fontWeight:800,fontSize:13}}>{empresas[empTab]?.emoji} {empTab} — Flujo de Caja Proyectado</div>
                <div style={{fontSize:9,color:"#64748b"}}>Grupo Mediterra · Generado {new Date().toLocaleDateString("es-CL")} · USD</div>
              </div>
              <FlujoEmpresa key={empTab} empNombre={empTab} empresas={empresas}
                realData={realData} onSaveReal={handleSaveReal} canEdit={puedoEdit("flujo")}
                saldosBancos={saldosBancos} onSaveProy={handleSaveProy}
                subLines={subLines?.[empTab]||{}} onSaveSubLines={(lineLabel,list)=>handleSaveSubLines(empTab,lineLabel,list)}
                addedLinesInit={addedLinesGlobal?.[empTab]||{}} onSaveAddedLines={(al)=>handleSaveAddedLines(empTab,al)}
                creditosData={creditosData}/>
            </div>
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
                allegraComisionArandanos={esAllegria?allegraComisionArandanos:undefined}
                setAllegraComisionArandanos={esAllegria&&puedoEdit("flujo")?handleSaveAllegraComisionArandanos:undefined}
                paramsEmp={esAllegria?undefined:{...empParamsData}}
                setParamsEmp={!esAllegria&&puedoEdit("flujo")
                  ? (updater)=>setParamsEmpresa(empTab,updater)
                  : ()=>{}}
                paramsAS={empTab==="Allegria Service"?paramsAS:undefined}
                setParamsAS={empTab==="Allegria Service"&&puedoEdit("flujo")?handleSaveParamsAS:undefined}
                paramsIF={empTab==="Integrity Farms"?paramsIF:undefined}
                setParamsIF={empTab==="Integrity Farms"&&puedoEdit("flujo")?handleSaveParamsIF:undefined}
                paramsFrisku={empTab==="Frisku Foods"?paramsFrisku:undefined}
                setParamsFrisku={empTab==="Frisku Foods"&&puedoEdit("flujo")?handleSaveParamsFrisku:undefined}
                paramsAF={empTab==="Allpa Farms"?paramsAF:undefined}
                setParamsAF={empTab==="Allpa Farms"&&puedoEdit("flujo")?handleSaveParamsAF:undefined}
                readOnly={!puedoEdit("flujo")}
              />
            );
          })()}
          </>
          )}

          {/* Consolidado */}
          {empTab==="_consolidado"&&accesoCompletoEmpresas&&(
            <Consolidado empresas={empresas} saldosBancos={saldosBancos} realData={realData} addedLinesGlobal={addedLinesGlobal} subLinesGlobal={subLines}/>
          )}
          {/* Intercompany */}
          {empTab==="_intercompany"&&accesoCompletoEmpresas&&(
            <Intercompany
              transferencias={intercompany}
              onSave={handleSaveIntercompany}
              empresas={empresas}
              canEdit={puedoEdit("flujo")}/>
          )}
        </div>
      )}

      {tab==="bancos"&&puedoVer("bancos")&&(
        <SaldosBancos saldos={saldosBancos} onSave={handleSaveSaldos} canEdit={puedoEdit("bancos")} empresasPermitidas={empresasPermitidas}/>
      )}
      {tab==="creditos"&&puedoVer("creditos")&&(()=>{
        // nextCreditId calculado sobre el BLOB COMPLETO (no sobre el subset visible)
        // para evitar colisión de IDs cuando un usuario restringido crea un crédito.
        const maxNFull = (creditosData||[]).reduce((m,c)=> Math.max(m, typeof c.n==='number' && c.n<100000 ? c.n : 0), 0);
        return <Creditos empresas={empresasVisibles} creditosData={creditosData} onSaveCreditos={handleSaveCreditos} canEdit={puedoEdit('creditos')} empresasPermitidas={empresasPermitidas} nextCreditId={maxNFull+1}/>;
      })()}

      {tab==="nominas"&&puedoVer("nominas")&&(
        <NominasModule usuario={usuarioActual} canEdit={puedoEdit("nominas")} saldosBancos={saldosBancos} empresasPermitidas={empresasPermitidas}/>
      )}

      {tab==="reporte"&&puedoVer("reporte")&&accesoCompletoEmpresas&&(
        <ReporteSemanalModule
          realData={realData}
          params={params}
          empresas={empresas}
          saldosBancos={saldosBancos}
          creditosData={creditosData}
          addedLinesGlobal={addedLinesGlobal}
          subLinesGlobal={subLines}
          intercompany={intercompany}
          canEdit={puedoEdit("reporte")}
          umbralesConfig={umbralesReporte}
          onSaveUmbrales={handleSaveUmbralesReporte}
          destinatariosConfig={destinatariosReporte}
          onSaveDestinatarios={handleSaveDestinatariosReporte}
          comentariosConfig={comentariosReporte}
          onSaveComentarios={handleSaveComentariosReporte}
          historialReportes={historialReportes}
          onSaveHistorialReportes={handleSaveHistorialReportes}
          usuarioActual={usuarioActual}
        />
      )}

      {tab==="auditoria"&&usuarioActual?.rol==="admin"&&(
        <AuditoriaModule usuario={usuarioActual}/>
      )}

      {tab==="eeff"&&(
        <EEFFModule canEdit={puedoEdit("eeff")} usuarioActual={usuarioActual} empresasPermitidas={empresasPermitidas}/>
      )}

      {tab==="rendiciones"&&puedoVer("rendiciones")&&(
        <RendicionesModule usuarioActual={usuarioActual} esAdmin={esAdmin} nivelRendiciones={perm("rendiciones")} usuarios={usuarios}/>
      )}

    </div>
  );
}

// ═══ NÓMINAS DE PAGO ═══════════════════════════════════════════════
/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// MÓDULO NÓMINAS DE PAGO — Grupo Mediterra
// ═══════════════════════════════════════════════════════════════════

const EMPRESAS_NOM = [
  "Allegria Foods","Allegria Service","Frisku Foods","Frisku Foods Perú",
  "Allpa Farms","Allpa Farms Perú","Mediterra","Integrity Farms","Osiris",
];


const SECCIONES = [
  {id:"proveedores",    label:"Proveedores / Materiales"},
  {id:"anticipos",      label:"Anticipos de Sueldo"},
  {id:"rendiciones",    label:"Rendiciones"},
  {id:"servipag",       label:"Servipag"},
  {id:"emp_rel_clp",    label:"Mov. Empresas Relacionadas CLP"},
  {id:"emp_rel_usd",    label:"Mov. Empresas Relacionadas USD"},
  {id:"pagos_usd",      label:"Pagos USD"},
];

const ESTADOS_FLUJO = [
  {id:"borrador",    label:"Borrador",       color:"#94a3b8", bg:"#f1f5f9"},
  {id:"preparada",   label:"Preparada",      color:"#f59e0b", bg:"#fef3c7"},
  {id:"revision",    label:"En Revisión",    color:"#3b82f6", bg:"#dbeafe"},
  {id:"aprobada1",   label:"V°B° Aprobador", color:"#8b5cf6", bg:"#ede9fe"},
  {id:"aprobada",    label:"Aprobada CFO",   color:"#16a34a", bg:"#dcfce7"},
];


const $$clp = (v) => {
  return "$" + Math.round(v).toLocaleString("es-CL");
};
const $$usd = (v) => {
  return "USD " + Number(v).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
};
const $$pen = (v) => {
  return "S/" + Number(v).toLocaleString("es-CL",{minimumFractionDigits:2,maximumFractionDigits:2});
};
// Empresas peruanas capturan en PEN (en vez de CLP) sus secciones de moneda local.
// Mismo criterio que PanelBancosNomina (bancos peruanos + PEN).
function esEmpresaPeruanaNom(empresa) {
  return !!empresa && empresa.includes("Perú");
}

function semanaISO(date) {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() + 4 - (d.getDay()||7));
  const y = d.getFullYear();
  const w = Math.ceil(((d - new Date(y,0,1))/86400000 + 1)/7);
  return {semana: w, año: y};
}

function semanaActual() {
  return semanaISO(new Date()).semana;
}

function añoActualNom() {
  return new Date().getFullYear();
}

// Generate all ISO weeks for a given year
function semanasDeAño(año) {
  const weeks = [];
  // ISO weeks: start from week 1, go until week 52 or 53
  for(let w = 1; w <= 53; w++) {
    // Check if week w exists in year
    const jan4 = new Date(año, 0, 4);
    const startOfWeek1 = new Date(jan4);
    startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
    const weekStart = new Date(startOfWeek1);
    weekStart.setDate(startOfWeek1.getDate() + (w-1)*7);
    const iso = semanaISO(weekStart);
    if(iso.año !== año && w > 1) break; // week belongs to next year
    if(iso.semana === w && iso.año === año) weeks.push(w);
  }
  return weeks;
}

// All años available
const AÑOS_NOM = Array.from({length:12},(_,i)=>2024+i); // 2024-2035

// ─────────────────────────────────────────────────────────────────
// ITEM ROW VACÍO
// ─────────────────────────────────────────────────────────────────
let TIPOS_DOCUMENTO = ["Factura Electrónica","Factura Exenta","Factura Importación","Nota de Cobro","Rendición","Remuneraciones","Boleta de Honorarios","Convenio TGR"];

// Una línea cuenta como "activa" salvo que esté inactivada/reemplazada.
// Lectura defensiva: las nóminas históricas no traen estadoLinea → se tratan como activas.
function lineaActiva(it) {
  return (it?.estadoLinea || "activa") === "activa";
}

function itemVacio(seccion) {
  return {
    id: `item_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
    seccion,
    tipoDoc:"", proveedor:"", rut:"", nDoc:"", fDoc:"", fVenc:"",
    semVenc:"", concepto:"", montoCLP:0, montoUSD:0, montoPEN:0, comentario:"",
    pagado:false, anticipo:false,
    // Expediente Digital (Fase 0): soft-delete + trazabilidad por línea.
    estadoLinea:"activa", // "activa" | "inactiva" | "reemplazada"
    historial:[],         // [{accion, usuario, fecha, detalle?}]
    // Expediente Digital (Fase 1): respaldo documental por línea.
    documentos:[],        // [{id,nombre,path,principal,mime,sizeKB,hash,subidoPor,fechaSubida,estado,interno,voucher}]
  };
}

// ─────────────────────────────────────────────────────────────────
// NÓMINA VACÍA
// ─────────────────────────────────────────────────────────────────
// Calcular semana ISO 8601 de una fecha
function semanaISOdeFecha(fechaStr) {
  if(!fechaStr) return null;
  const d = new Date(fechaStr+"T00:00:00");
  if(isNaN(d)) return null;
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
}

function nominaVacia(empresa, semana, año, numero=1) {
  return {
    id: `nom_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    empresa, semana, año, numero,
    fecha: new Date().toISOString().slice(0,10),
    tc: 0, // tipo de cambio CLP/USD
    estado: "borrador",
    preparadoPor: "",
    revisadoPor: "",
    aprobadoPor: "",
    aprobado1Por: "",
    fechaAprobacion: "",
    fechaAprobacion1: "",
    items: [],
    bancos: Object.fromEntries(BANCOS.map(b=>[b,{clp:0,usd:0}])),
    notas: "",
    seccionesExtra: [], // [{id, label}] custom sections
    // Expediente Digital (Fase 2): trazabilidad + soft-delete de la nómina.
    estadoNomina: "activa", // "activa" | "inactiva"
    historial: [],          // [{accion, usuario, fecha, estadoDesde?, estadoHacia?, motivo?, detalle?}]
  };
}

// La nómina cuenta como activa salvo que esté inactivada (soft-delete).
// Lectura defensiva: las nóminas históricas no traen estadoNomina → activas.
function nominaActiva(nom) {
  return (nom?.estadoNomina || "activa") !== "inactiva";
}

// Construye una entrada de historial de nómina con usuario + timestamp.
function entradaHistorialNom(accion, usuario, extra = {}) {
  return { accion, usuario: usuario?.nombre || "—", fecha: new Date().toISOString(), ...extra };
}

// Etiqueta legible para una acción del historial de nómina.
function labelAccionNom(accion) {
  return ({ creada:"Creada", avance:"Avanzó estado", devolucion:"Devuelta", inactivada:"Inactivada" })[accion] || accion;
}

// Fase 4 — Validación de respaldo documental obligatorio para avanzar de estado.
// Regla simple (sin clasificación): toda línea ACTIVA con monto ≠ 0 que no esté
// en una sección exenta debe tener al menos un documento de respaldo para poder
// AVANZAR hacia el estado configurado (por defecto: al enviar a revisión).
const VALIDACION_RESPALDO = {
  activo: true,
  estadoQueExige: "revision",       // se valida al avanzar HACIA este estado
  seccionesExentas: [],             // anticipos y emp_rel se cubren con doc interno automático
};

// Logo por empresa de nómina (archivos en /public). Los nombres difieren de
// los de Rendiciones (ej. "Mediterra" vs "Mediterra Holding").
const LOGO_NOMINA = {
  "Allegria Foods":    "/allegria-logo.jpg",
  "Allegria Service":  "/allegria-service-logo.png",
  "Frisku Foods":      "/frisku.png",
  "Frisku Foods Perú": "/frisku.png",
  "Allpa Farms":       "/allpa-chile-logo.png",
  "Allpa Farms Perú":  "/allpa-peru-logo.png",
  "Mediterra":         "/med.png",
  "Integrity Farms":   "/integrity-logo.png",
  "Osiris":            "/osiris-logo.jpg",
};
async function urlToDataURLNom(url) {
  const r = await fetch(url); if(!r.ok) throw new Error("logo HTTP "+r.status);
  const b = await r.blob();
  return await new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(b); });
}
function imgNaturalSizeNom(src) {
  return new Promise((res)=>{ const im=new Image(); im.onload=()=>res({w:im.naturalWidth,h:im.naturalHeight}); im.onerror=()=>res(null); im.src=src; });
}

// Loader lazy de pdf-lib (vía CDN, sin agregar dependencia al bundle) para
// fusionar la nómina + sus respaldos en un único PDF consolidado.
async function loadPdfLib() {
  if (window.PDFLib) return window.PDFLib;
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js";
    s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
  return window.PDFLib;
}

// Devuelve las líneas que incumplen el respaldo obligatorio para avanzar.
function lineasSinRespaldoObligatorio(nom) {
  return (nom?.items||[]).filter(it =>
    lineaActiva(it) &&
    !VALIDACION_RESPALDO.seccionesExentas.includes(it.seccion) &&
    (Number(it.montoCLP)||Number(it.montoUSD)||Number(it.montoPEN)) &&
    !tieneRespaldo(it)
  );
}

// ─── Documento interno automático (Fase 5) ─────────────────────────
// Secciones cuyo respaldo es un documento interno autogenerado por el sistema
// (no factura externa): empresas relacionadas + anticipos de sueldo.
const AUTODOC_SECCIONES = ["emp_rel_clp", "emp_rel_usd", "anticipos"];
function requiereDocInterno(item) { return AUTODOC_SECCIONES.includes(item?.seccion); }

// Genera el PDF (blob) del voucher interno. Plantilla según tipo:
// "anticipo" → vale a trabajador; "intercompania" → traspaso entre empresas;
// "general" → pago sin documento externo (ej. arriendo de oficina).
async function generarVoucherPDFBlob(voucher) {
  const jsPDF = await reporte_loadJsPDF();
  const doc = new jsPDF({orientation:"portrait", unit:"mm", format:"a4"});
  let y = 22;
  const T = ({
    anticipo:     ["VALE DE ANTICIPO DE SUELDO", "Anticipo a trabajador"],
    intercompania:["DOCUMENTO INTERNO DE RESPALDO", "Movimiento entre empresas relacionadas"],
    general:      ["DOCUMENTO INTERNO DE RESPALDO", "Respaldo de pago sin documento externo"],
  })[voucher.tipo] || ["DOCUMENTO INTERNO DE RESPALDO", ""];
  doc.setFontSize(15); doc.setFont(undefined,"bold");
  doc.text(T[0], 105, y, {align:"center"}); y+=7;
  doc.setFontSize(10); doc.setFont(undefined,"normal");
  doc.text(T[1], 105, y, {align:"center"}); y+=12;
  doc.setDrawColor(180); doc.line(20, y, 190, y); y+=10;
  const fila=(et,val)=>{ doc.setFont(undefined,"bold"); doc.text(`${et}:`,20,y); doc.setFont(undefined,"normal"); doc.text(String(val||"—"),75,y); y+=8; };
  fila("Correlativo", voucher.correlativo);
  fila("Identificador", voucher.identificador);
  fila("Empresa origen", voucher.empresaOrigen);
  fila(voucher.contraparteLabel||"Empresa destino", voucher.contraparte);
  fila("Fecha", voucher.fecha);
  fila("Monto", `${voucher.moneda} ${Number(voucher.monto).toLocaleString("es-CL")}`);
  fila("Concepto", voucher.concepto);
  fila("Generado por", voucher.generadoPor);
  fila("Generado el", (()=>{ try{ return new Date(voucher.generadoEn).toLocaleString("es-CL"); }catch{ return voucher.generadoEn; } })());
  if(voucher.observaciones){ y+=2; doc.setFont(undefined,"bold"); doc.text("Observaciones:",20,y); y+=6; doc.setFont(undefined,"normal"); doc.text(doc.splitTextToSize(voucher.observaciones,170),20,y); }
  return doc.output("blob");
}

// Genera el documento interno de una línea (voucher + PDF + subida) y devuelve
// la metadata del documento (o null si falla la subida). Reutilizado por el
// botón manual y por la generación automática.
// ctx: { empresa, nominaId, anio, fecha }. overrides opcional: {contraparte, concepto, observaciones}.
async function generarDocInternoLinea(ctx, item, usuario, overrides = {}) {
  const esAnticipo = item.seccion === "anticipos";
  const esRel = item.seccion === "emp_rel_clp" || item.seccion === "emp_rel_usd";
  const tipo = esAnticipo ? "anticipo" : esRel ? "intercompania" : "general";
  const contraparteLabel = tipo==="anticipo" ? "Beneficiario / Trabajador" : tipo==="general" ? "Beneficiario" : "Empresa destino";
  const conceptoDefault = tipo==="anticipo" ? "Anticipo de sueldo" : tipo==="general" ? "Pago sin documento externo" : "Movimiento entre empresas relacionadas";
  const monto  = Number(item.montoUSD) ? Number(item.montoUSD) : Number(item.montoPEN) ? Number(item.montoPEN) : Number(item.montoCLP)||0;
  const moneda = Number(item.montoUSD) ? "USD" : Number(item.montoPEN) ? "PEN" : "CLP";
  const correlativo = await siguienteCorrelativo(ctx.empresa, ctx.anio || new Date().getFullYear());
  const voucher = {
    tipo,
    empresaOrigen: ctx.empresa,
    contraparteLabel,
    contraparte: (overrides.contraparte != null ? overrides.contraparte : item.proveedor) || "—",
    fecha: ctx.fecha || new Date().toISOString().slice(0,10),
    monto, moneda,
    concepto: ((overrides.concepto != null ? overrides.concepto : item.concepto) || "").trim() || conceptoDefault,
    observaciones: (overrides.observaciones || "").trim(),
    generadoPor: usuario?.nombre || "—",
    correlativo,
    identificador: (typeof crypto!=="undefined" && crypto.randomUUID) ? crypto.randomUUID() : `id_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    generadoEn: new Date().toISOString(),
  };
  const blob = await generarVoucherPDFBlob(voucher);
  const fileName = `${correlativo}.pdf`;
  const file = new File([blob], fileName, {type:"application/pdf"});
  const docId = `doc_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
  const path = pathDocNomina(ctx.empresa, ctx.nominaId, item.id, docId, fileName);
  const hash = await hashArchivo(file);
  const r = await uploadDocNomina(file, path);
  if(!r?.ok) return null;
  return { id:docId, nombre:fileName, path, principal:true, mime:"application/pdf",
    sizeKB:Math.round((file.size||0)/1024), hash, subidoPor:usuario?.nombre||"—",
    fechaSubida:new Date().toISOString(), estado:"activo", interno:true, voucher };
}

// ─────────────────────────────────────────────────────────────────
// SUPABASE LOAD/SAVE — particionado por empresa (v2)
// ─────────────────────────────────────────────────────────────────

// Genera el slug de Supabase para una empresa: "Allpa Farms Perú" → "allpa_farms_peru"
function slugEmpresaNom(empresa) {
  return empresa.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quitar tildes
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

// Cache en memoria del estado de migración (null=desconocido, true/false=conocido)
let _cacheNominasMigrado = null;
async function dbNominasMigrado() {
  if (_cacheNominasMigrado !== null) return _cacheNominasMigrado;
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/calendario_data?id=eq.nominas_v2_done&select=id`,{
      headers:{apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`}
    });
    const rows = await res.json();
    _cacheNominasMigrado = Array.isArray(rows) && rows.length > 0;
  } catch { _cacheNominasMigrado = false; }
  return _cacheNominasMigrado;
}

// Carga nóminas: si migrado → carga solo las filas de empresasPermitidas;
// si no migrado → carga blob legacy id="nominas" y filtra en memoria.
async function dbLoadNominas(empresasPermitidas) {
  try {
    const migrado = await dbNominasMigrado();
    if (!migrado) {
      // Legacy: blob único
      const res = await fetch(`${SUPA_URL}/rest/v1/calendario_data?id=eq.nominas&select=value`,{
        headers:{apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`}
      });
      const data = await res.json();
      if (!data?.[0]?.value) return null;
      const blob = JSON.parse(data[0].value);
      // Aplicar filtro en memoria para usuarios restringidos
      if (empresasPermitidas?.length) {
        blob.nominas = (blob.nominas||[]).filter(n => empresasPermitidas.includes(n.empresa));
      }
      return blob;
    }
    // v2: cargar por empresa
    const empresasTarget = (!empresasPermitidas?.length)
      ? EMPRESAS_NOM
      : EMPRESAS_NOM.filter(e => empresasPermitidas.includes(e));
    const resultados = await Promise.all(empresasTarget.map(async emp => {
      const slug = slugEmpresaNom(emp);
      const res = await fetch(`${SUPA_URL}/rest/v1/calendario_data?id=eq.nominas_${slug}&select=value`,{
        headers:{apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`}
      });
      const data = await res.json();
      return data?.[0]?.value ? JSON.parse(data[0].value).nominas || [] : [];
    }));
    return { nominas: resultados.flat() };
  } catch(e) {
    // Propagar: el caller debe distinguir "carga falló" de "vacío" para no
    // habilitar el guardado y sobrescribir las nóminas con una lista vacía.
    console.error("[Nominas] Error cargando:", e);
    throw e;
  }
}

// Guarda nóminas: si migrado → upsert por empresa;
// si no migrado → sobreescribe blob legacy.
// Devuelve true si TODOS los upserts respondieron ok; false si alguno falló.
// opts.keepalive=true permite que el request sobreviva a un beforeunload (flush en recarga/cierre).
async function dbSaveNominas(nominas, opts={}) {
  const keepalive = !!opts.keepalive;
  try {
    const migrado = await dbNominasMigrado();
    if (!migrado) {
      const res = await fetch(`${SUPA_URL}/rest/v1/calendario_data`,{
        method:"POST", keepalive,
        headers:{apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`,
          "Content-Type":"application/json",Prefer:"resolution=merge-duplicates"},
        body:JSON.stringify({id:"nominas",value:JSON.stringify({nominas}),updated_at:new Date().toISOString()})
      });
      return res.ok;
    }
    // v2: agrupar por empresa y upsert cada fila
    const grupos = {};
    for (const n of nominas) {
      const emp = n.empresa;
      if (emp) { if (!grupos[emp]) grupos[emp]=[]; grupos[emp].push(n); }
    }
    const resultados = await Promise.all(Object.entries(grupos).map(([emp, noms]) => {
      const slug = slugEmpresaNom(emp);
      return fetch(`${SUPA_URL}/rest/v1/calendario_data`,{
        method:"POST", keepalive,
        headers:{apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`,
          "Content-Type":"application/json",Prefer:"resolution=merge-duplicates"},
        body:JSON.stringify({
          id:`nominas_${slug}`,
          value:JSON.stringify({nominas:noms, empresa:emp}),
          updated_at:new Date().toISOString()
        })
      });
    }));
    return resultados.every(r=>r.ok);
  } catch(e){console.error(e);return false;}
}

// ─── Catálogo GLOBAL de tipos de documento (persistente) ───────────
// Los tipos que el usuario agrega con "+ Agregar nuevo..." se guardan en la
// fila calendario_data id="nominas_tipos_doc" para que queden disponibles en
// TODAS las nóminas y tras recargar (no solo donde se crearon).
async function dbLoadTiposDocExtra() {
  const res = await fetch(`${SUPA_URL}/rest/v1/calendario_data?id=eq.nominas_tipos_doc&select=value`,{
    headers:{apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`}
  });
  if(!res.ok) throw new Error("tipos_doc HTTP "+res.status);
  const data = await res.json();
  const v = data?.[0]?.value;
  if(!v) return [];
  const arr = typeof v==="string" ? JSON.parse(v) : v;
  return Array.isArray(arr) ? arr : [];
}
async function dbSaveTiposDocExtra(tipos) {
  await fetch(`${SUPA_URL}/rest/v1/calendario_data`,{
    method:"POST",
    headers:{apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates"},
    body:JSON.stringify({id:"nominas_tipos_doc",value:JSON.stringify(tipos),updated_at:new Date().toISOString()})
  });
}
// Agrega un tipo nuevo al catálogo global (read-modify-write, best-effort).
// Si la persistencia falla, el tipo igual queda en memoria y en tiposDocExtra
// de la nómina (respaldo), así no se pierde en esa sesión.
async function agregarTipoDocGlobal(n) {
  if(!n) return;
  if(!TIPOS_DOCUMENTO.includes(n)) TIPOS_DOCUMENTO.push(n);
  try {
    const actuales = await dbLoadTiposDocExtra();
    if(!actuales.includes(n)) await dbSaveTiposDocExtra([...actuales, n]);
  } catch(e) {
    console.warn("[Nominas] no se pudo guardar el tipo de documento global:", e?.message||e);
  }
}

// ─────────────────────────────────────────────────────────────────
// BADGE ESTADO
// ─────────────────────────────────────────────────────────────────
function BadgeEstado({estado}) {
  const e = ESTADOS_FLUJO.find(x=>x.id===estado)||ESTADOS_FLUJO[0];
  return (
    <span style={{background:e.bg,color:e.color,borderRadius:20,padding:"3px 10px",
      fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{e.label}</span>
  );
}

// ─────────────────────────────────────────────────────────────────
// TABLA ITEMS (por sección)
// ─────────────────────────────────────────────────────────────────
function TablaItems({items, seccion, onChange, canEdit, tc, moneda="ambas", semanaNomina, tiposDocExtra=[], onAddTipoDoc, usuario, nominaId, empresa, anioNom, fechaNom}) {
  // Vista de edición: solo líneas activas (las inactivadas quedan en data y se ven en Vista Auditoría — Fase 3).
  const rows = items.filter(it=>it.seccion===seccion && lineaActiva(it));
  // Modal de documentos de respaldo (Expediente Digital — Fase 1).
  const [docsItemId, setDocsItemId] = useState(null);
  const docsItem = docsItemId ? items.find(x=>x.id===docsItemId) : null;
  // Actualiza una línea puntual (usado por el modal de documentos).
  function updItemObj(itemActualizado) {
    onChange(items.map(x=>x.id===itemActualizado.id?itemActualizado:x));
  }
  const soloUSD = moneda==="usd";
  const soloCLP = moneda==="clp";
  const soloPEN = moneda==="pen";
  // Columnas visibles. PEN sustituye la columna de moneda local (CLP) en empresas peruanas.
  const showCLP = !soloUSD && !soloPEN;
  const showUSD = !soloCLP && !soloPEN;
  const showPEN = soloPEN;

  function updItem(id, field, val) {
    let updated = {...items.find(it=>it.id===id), [field]:val};
    // Auto-calcular semana al cambiar fecha de vencimiento
    if(field==="fVenc" && val) {
      const sem = semanaISOdeFecha(val);
      if(sem) {
        if(semanaNomina && sem !== semanaNomina) {
          alert(`⚠️ La fecha ${val} corresponde a la semana ${sem}, pero esta nómina es de la semana ${semanaNomina}.\nNo se puede ingresar una fecha fuera de la semana de trabajo.`);
          return; // no actualizar
        }
        updated.semVenc = sem;
      }
    }
    onChange(items.map(it=>it.id===id?updated:it));
  }
  function addItem() {
    onChange([...items, itemVacio(seccion)]);
  }
  // Soft-delete (Fase 0): nunca se borra físicamente. Se marca inactiva,
  // se excluye de totales/export y queda registrada en el historial de la línea.
  function delItem(id) {
    if(!window.confirm("¿Inactivar esta línea?\n\nNo se elimina: queda registrada en el historial y se excluye de los totales. Podrás verla en la Vista Auditoría."))return;
    const nombreUsr = usuario?.nombre || "—";
    const ahora = new Date().toISOString();
    onChange(items.map(it=>it.id===id
      ? {...it, estadoLinea:"inactiva",
          historial:[...(it.historial||[]), {accion:"linea_inactivada", usuario:nombreUsr, fecha:ahora}]}
      : it));
  }

  const totalCLP = rows.reduce((s,it)=>s+(Number(it.montoCLP)||0),0);
  const totalUSD = rows.reduce((s,it)=>s+(Number(it.montoUSD)||0),0);
  const totalPEN = rows.reduce((s,it)=>s+(Number(it.montoPEN)||0),0);
  const totalAnticipoCLP = rows.reduce((s,it)=>{
    if(Number(it.montoCLP) && !Number(it.montoUSD)) return s+(Number(it.anticipo)||0);
    return s;
  },0);
  const totalAnticipoUSD = rows.reduce((s,it)=>{
    if(Number(it.montoUSD)) return s+(Number(it.anticipo)||0);
    return s;
  },0);
  const totalAnticipoPEN = rows.reduce((s,it)=>{
    if(Number(it.montoPEN) && !Number(it.montoUSD)) return s+(Number(it.anticipo)||0);
    return s;
  },0);
  const totalAnticipo = totalAnticipoCLP + totalAnticipoUSD;
  const totalSaldoCLP = totalCLP - totalAnticipoCLP;
  const totalSaldoUSD = totalUSD - totalAnticipoUSD;
  const totalSaldoPEN = totalPEN - totalAnticipoPEN;

  const montoLabel = soloUSD ? "Monto USD" : soloPEN ? "Monto PEN" : soloCLP ? "Monto CLP" : null;
  const headers = ["Tipo Doc","Proveedor / Nombre","RUT","N° Doc","F. Doc","F. Venc","Sem","Concepto",
    ...(soloUSD ? ["Monto USD"] : soloPEN ? ["Monto PEN"] : soloCLP ? ["Monto CLP"] : ["Monto CLP","Monto USD"]),
    "Anticipo","Saldo a Pagar","Comentario",""];
  const colSpanTotal = 8;
  const colSpanEnd = soloUSD||soloCLP ? 2 : 2;

  const inputSt = {
    padding:"4px 6px",borderRadius:5,border:`1px solid ${C.border}`,
    background:C.card2,color:C.text,fontSize:11,outline:"none",width:"100%",boxSizing:"border-box"
  };

  return (
    <div style={{marginBottom:20}}>
      <div style={{overflowX:"auto",borderRadius:8,border:`1px solid ${C.border}`}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead>
            <tr style={{background:C.primary}}>
              {headers.map(h=>(
                <th key={h} style={{padding:"6px 8px",color:C.muted,fontWeight:600,fontSize:10,
                  textAlign:h==="Monto CLP"||h==="Monto USD"||h==="Monto PEN"?"right":"left",
                  whiteSpace:"nowrap",borderBottom:`1px solid ${C.border}`}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length===0&&(
              <tr><td colSpan={headers.length} style={{padding:"16px",textAlign:"center",color:C.muted2,fontSize:11}}>
                Sin registros — agrega uno con el botón +
              </td></tr>
            )}
            {rows.map((it,i)=>(
              <tr key={it.id} style={{borderBottom:`1px solid ${C.border}22`,
                background:it.pagado?`${C.green}08`:i%2===0?"transparent":`${C.border}11`,
                opacity:it.pagado?0.6:1}}>
                <td style={{padding:"3px 6px",minWidth:130}}>
                  {canEdit
                    ? <div style={{display:"flex",gap:2,alignItems:"center"}}>
                        <select value={it.tipoDoc||""} onChange={e=>{
                          if(e.target.value==="__nuevo__"){
                            const nuevo=prompt("Ingrese el nuevo tipo de documento:");
                            if(nuevo&&nuevo.trim()){
                              const n=nuevo.trim();
                              if(!TIPOS_DOCUMENTO.includes(n)) TIPOS_DOCUMENTO.push(n);
                              agregarTipoDocGlobal(n);          // catálogo global persistente
                              if(onAddTipoDoc) onAddTipoDoc(n); // respaldo por nómina
                              updItem(it.id,"tipoDoc",n);
                            }
                          } else {
                            updItem(it.id,"tipoDoc",e.target.value);
                          }
                        }}
                          style={{...inputSt,flex:1,cursor:"pointer"}}>
                          <option value="">— Tipo —</option>
                          {(()=>{
                            // Restaurar tipos doc extra
                            (tiposDocExtra||[]).forEach(t=>{ if(!TIPOS_DOCUMENTO.includes(t)) TIPOS_DOCUMENTO.push(t); });
                            return TIPOS_DOCUMENTO.map(t=><option key={t} value={t}>{t}</option>);
                          })()}
                          <option value="__nuevo__">+ Agregar nuevo...</option>
                        </select>
                      </div>
                    : <span style={{color:C.muted,fontSize:10}}>{it.tipoDoc||"—"}</span>}
                </td>
                <td style={{padding:"3px 6px",minWidth:140}}>
                  {canEdit
                    ? <input value={it.proveedor} onChange={e=>updItem(it.id,"proveedor",e.target.value)} style={inputSt} placeholder="Nombre"/>
                    : <span style={{color:C.text,fontWeight:500}}>{it.proveedor||"—"}</span>}
                </td>
                <td style={{padding:"3px 6px",minWidth:90}}>
                  {canEdit
                    ? <input value={it.rut} onChange={e=>updItem(it.id,"rut",e.target.value)} style={inputSt} placeholder="RUT"/>
                    : <span style={{color:C.muted}}>{it.rut||"—"}</span>}
                </td>
                <td style={{padding:"3px 6px",minWidth:80}}>
                  {canEdit
                    ? <input value={it.nDoc} onChange={e=>{const v=e.target.value.replace(/[^0-9]/g,"");updItem(it.id,"nDoc",v);}} style={inputSt} placeholder="123456" inputMode="numeric"/>
                    : <span style={{color:C.muted}}>{it.nDoc||"—"}</span>}
                </td>
                <td style={{padding:"3px 6px",minWidth:100}}>
                  {canEdit
                    ? <input type="text" value={it.fDoc||""} 
                        onChange={e=>updItem(it.id,"fDoc",e.target.value)}
                        onBlur={e=>{
                          const v=e.target.value.trim();
                          if(!v) return;
                          // Validar formato: dd-mm-yyyy, dd/mm/yyyy, yyyy-mm-dd
                          let parsed=null;
                          const m1=v.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
                          const m2=v.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
                          if(m1) parsed=`${m1[3]}-${String(m1[2]).padStart(2,"0")}-${String(m1[1]).padStart(2,"0")}`;
                          else if(m2) parsed=`${m2[1]}-${String(m2[2]).padStart(2,"0")}-${String(m2[3]).padStart(2,"0")}`;
                          if(!parsed||isNaN(new Date(parsed+"T00:00:00"))){
                            alert("Formato de fecha inválido.\nUse: dd-mm-yyyy o yyyy-mm-dd");
                            updItem(it.id,"fDoc","");return;
                          }
                          updItem(it.id,"fDoc",parsed);
                        }}
                        style={{...inputSt,width:95}} placeholder="dd-mm-yyyy"/>
                    : <span style={{color:C.muted}}>{it.fDoc||"—"}</span>}
                </td>
                <td style={{padding:"3px 6px",minWidth:100}}>
                  {canEdit
                    ? <input type="text" value={it.fVenc||""} 
                        onChange={e=>{
                          // Permitir escribir libremente
                          onChange(items.map(x=>x.id===it.id?{...x,fVenc:e.target.value}:x));
                        }}
                        onBlur={e=>{
                          const v=e.target.value.trim();
                          if(!v) return;
                          let parsed=null;
                          const m1=v.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
                          const m2=v.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
                          if(m1) parsed=`${m1[3]}-${String(m1[2]).padStart(2,"0")}-${String(m1[1]).padStart(2,"0")}`;
                          else if(m2) parsed=`${m2[1]}-${String(m2[2]).padStart(2,"0")}-${String(m2[3]).padStart(2,"0")}`;
                          if(!parsed||isNaN(new Date(parsed+"T00:00:00"))){
                            alert("Formato de fecha inválido.\nUse: dd-mm-yyyy o yyyy-mm-dd");
                            onChange(items.map(x=>x.id===it.id?{...x,fVenc:"",semVenc:""}:x));return;
                          }
                          // Validar semana
                          const sem=semanaISOdeFecha(parsed);
                          if(semanaNomina && sem !== semanaNomina){
                            alert(`⚠️ La fecha ${parsed} corresponde a la semana ${sem}, pero esta nómina es de la semana ${semanaNomina}.\nNo se puede ingresar una fecha fuera de la semana de trabajo.`);
                            onChange(items.map(x=>x.id===it.id?{...x,fVenc:"",semVenc:""}:x));return;
                          }
                          onChange(items.map(x=>x.id===it.id?{...x,fVenc:parsed,semVenc:sem}:x));
                        }}
                        style={{...inputSt,width:95}} placeholder="dd-mm-yyyy"/>
                    : <span style={{color:C.muted}}>{it.fVenc||"—"}</span>}
                </td>
                <td style={{padding:"3px 6px",minWidth:50,textAlign:"center"}}>
                  <span style={{color:it.semVenc?C.accentL:C.muted2,fontWeight:it.semVenc?700:400,fontSize:11}}>
                    {it.semVenc?`S${it.semVenc}`:"—"}
                  </span>
                </td>
                <td style={{padding:"3px 6px",minWidth:140}}>
                  {canEdit
                    ? <input value={it.concepto} onChange={e=>updItem(it.id,"concepto",e.target.value)} style={inputSt} placeholder="Descripción"/>
                    : <span style={{color:C.text}}>{it.concepto||"—"}</span>}
                </td>
                {showCLP&&(
                <td style={{padding:"3px 6px",minWidth:100,textAlign:"right"}}>
                  {canEdit
                    ? <input type="number" value={it.montoCLP||""} onChange={e=>updItem(it.id,"montoCLP",Number(e.target.value))} style={{...inputSt,textAlign:"right"}} placeholder="0"/>
                    : <span style={{color:it.montoCLP?C.text:C.muted2,fontWeight:it.montoCLP?600:400}}>{it.montoCLP?$$clp(it.montoCLP):"—"}</span>}
                </td>
                )}
                {showPEN&&(
                <td style={{padding:"3px 6px",minWidth:100,textAlign:"right"}}>
                  {canEdit
                    ? <input type="number" value={it.montoPEN||""} onChange={e=>updItem(it.id,"montoPEN",Number(e.target.value))} style={{...inputSt,textAlign:"right"}} placeholder="0"/>
                    : <span style={{color:it.montoPEN?"#f97316":C.muted2,fontWeight:it.montoPEN?600:400}}>{it.montoPEN?$$pen(it.montoPEN):"—"}</span>}
                </td>
                )}
                {showUSD&&(
                <td style={{padding:"3px 6px",minWidth:100,textAlign:"right"}}>
                  {canEdit
                    ? <input type="number" value={it.montoUSD||""} onChange={e=>updItem(it.id,"montoUSD",Number(e.target.value))} style={{...inputSt,textAlign:"right"}} placeholder="0"/>
                    : <span style={{color:it.montoUSD?C.blue:C.muted2,fontWeight:it.montoUSD?600:400}}>{it.montoUSD?$$usd(it.montoUSD):"—"}</span>}
                </td>
                )}
                <td style={{padding:"3px 6px",textAlign:"right",minWidth:90}}>
                  {canEdit
                    ? <input type="number" value={it.anticipo||""} onChange={e=>updItem(it.id,"anticipo",Number(e.target.value)||0)}
                        style={{...inputSt,textAlign:"right",width:80}} placeholder="0"/>
                    : <span style={{fontSize:11,color:it.anticipo?C.yellow:C.muted2,fontWeight:it.anticipo?600:400}}>
                        {it.anticipo?(soloPEN?$$pen(it.anticipo):soloUSD||(!soloUSD&&!soloCLP)?$$usd(it.anticipo):$$clp(it.anticipo)):"—"}
                      </span>}
                </td>
                <td style={{padding:"3px 6px",textAlign:"right",minWidth:90}}>
                  {(()=>{
                    const monto = soloUSD ? (Number(it.montoUSD)||0) : soloPEN ? (Number(it.montoPEN)||0) : soloCLP ? (Number(it.montoCLP)||0) : (Number(it.montoUSD)||Number(it.montoCLP)||0);
                    const antic = Number(it.anticipo)||0;
                    const saldo = monto - antic;
                    const fmt = soloPEN ? $$pen : soloUSD||(!soloUSD&&!soloCLP) ? $$usd : $$clp;
                    return <span style={{fontWeight:700,fontSize:11,color:saldo>0?C.green:saldo<0?C.red:C.muted2}}>{saldo?fmt(saldo):"—"}</span>;
                  })()}
                </td>
                <td style={{padding:"3px 6px",minWidth:120}}>
                  {canEdit
                    ? <input value={it.comentario||""} onChange={e=>updItem(it.id,"comentario",e.target.value)}
                        onBlur={e=>{
                          const val = (e.target.value||"").trim().toLowerCase();
                          if(val.includes("aplaza")) {
                            const semDestino = prompt(`El item "${it.proveedor||it.tipoDoc||"sin nombre"}" será aplazado.\n\n¿A qué semana desea moverlo? (ingrese número, ej: 18)`);
                            if(semDestino && !isNaN(Number(semDestino))) {
                              const semNum = Number(semDestino);
                              // Guardar info de aplazamiento en el item para que NominaDetalle lo procese
                              updItem(it.id, "_aplazar", {semana: semNum, motivo: e.target.value.trim()});
                            }
                          }
                        }}
                        style={inputSt} placeholder="Obs."/>
                    : <span style={{color:C.muted,fontSize:10}}>{it.comentario||""}</span>}
                </td>
                <td style={{padding:"3px 6px",textAlign:"center",whiteSpace:"nowrap"}}>
                  <button onClick={()=>setDocsItemId(it.id)}
                    title={tieneRespaldo(it)?`${docsActivos(it).length} documento(s) de respaldo`:"Sin respaldo — adjuntar documento"}
                    style={{background:`${C.border}33`,border:"none",borderRadius:5,
                      padding:"3px 7px",cursor:"pointer",fontSize:11,color:C.text,marginRight:3}}>
                    {tieneRespaldo(it)?"🟢":"🔴"} 📎{docsActivos(it).length||""}
                  </button>
                  {canEdit&&(
                    <>
                      <button onClick={()=>updItem(it.id,"pagado",!it.pagado)}
                        title={it.pagado?"Marcar pendiente":"Marcar pagado"}
                        style={{background:it.pagado?`${C.green}33`:`${C.border}44`,border:"none",borderRadius:5,
                          padding:"3px 7px",cursor:"pointer",fontSize:11,color:it.pagado?C.green:C.muted,marginRight:3}}>
                        {it.pagado?"✓":"○"}
                      </button>
                      <button onClick={()=>delItem(it.id)}
                        style={{background:"#fee2e233",border:"none",borderRadius:5,
                          padding:"3px 7px",cursor:"pointer",fontSize:11,color:"#ef4444"}}>×</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length>0&&(
            <tfoot>
              <tr style={{background:C.bg2,borderTop:`2px solid ${C.border}`}}>
                <td colSpan={8} style={{padding:"6px 10px",fontWeight:700,color:C.text,fontSize:11}}>
                  Total sección
                </td>
                {showCLP&&(
                <td style={{padding:"6px 8px",textAlign:"right",fontWeight:800,color:C.yellow,fontSize:12}}>
                  {totalCLP?$$clp(totalCLP):"—"}
                </td>
                )}
                {showPEN&&(
                <td style={{padding:"6px 8px",textAlign:"right",fontWeight:800,color:"#f97316",fontSize:12}}>
                  {totalPEN?$$pen(totalPEN):"—"}
                </td>
                )}
                {showUSD&&(
                <td style={{padding:"6px 8px",textAlign:"right",fontWeight:800,color:C.blue,fontSize:12}}>
                  {totalUSD?$$usd(totalUSD):"—"}
                </td>
                )}
                <td style={{padding:"6px 8px",textAlign:"right",fontWeight:700,fontSize:11}}>
                  {soloPEN&&totalAnticipoPEN?<span style={{color:"#f97316"}}>{$$pen(totalAnticipoPEN)}</span>:null}
                  {soloPEN&&!totalAnticipoPEN?"—":null}
                  {soloCLP&&totalAnticipoCLP?<span style={{color:C.yellow}}>{$$clp(totalAnticipoCLP)}</span>:null}
                  {soloUSD&&totalAnticipoUSD?<span style={{color:C.blue}}>{$$usd(totalAnticipoUSD)}</span>:null}
                  {!soloUSD&&!soloCLP&&!soloPEN?(
                    <>{totalAnticipoCLP?<span style={{color:C.yellow}}>{$$clp(totalAnticipoCLP)}</span>:null}{totalAnticipoCLP&&totalAnticipoUSD?" / ":""}{totalAnticipoUSD?<span style={{color:C.blue}}>{$$usd(totalAnticipoUSD)}</span>:null}{!totalAnticipoCLP&&!totalAnticipoUSD?"—":""}</>
                  ):(!soloPEN&&!totalAnticipoCLP&&!totalAnticipoUSD?"—":null)}
                </td>
                <td style={{padding:"6px 8px",textAlign:"right",fontWeight:800,fontSize:12}}>
                  {soloPEN&&totalSaldoPEN?<span style={{color:C.green}}>{$$pen(totalSaldoPEN)}</span>:null}
                  {soloPEN&&!totalSaldoPEN?"—":null}
                  {soloCLP&&totalSaldoCLP?<span style={{color:C.green}}>{$$clp(totalSaldoCLP)}</span>:null}
                  {soloUSD&&totalSaldoUSD?<span style={{color:C.green}}>{$$usd(totalSaldoUSD)}</span>:null}
                  {!soloUSD&&!soloCLP&&!soloPEN?(
                    <>{totalSaldoCLP?<span style={{color:C.green}}>{$$clp(totalSaldoCLP)}</span>:null}{totalSaldoCLP&&totalSaldoUSD?" / ":""}{totalSaldoUSD?<span style={{color:C.green}}>{$$usd(totalSaldoUSD)}</span>:null}{!totalSaldoCLP&&!totalSaldoUSD?"—":""}</>
                  ):(!soloPEN&&!totalSaldoCLP&&!totalSaldoUSD?"—":null)}
                </td>
                <td colSpan={2}/>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {canEdit&&(
        <button onClick={addItem}
          style={{marginTop:6,padding:"4px 14px",borderRadius:6,border:`1px dashed ${C.border2}`,
            background:"transparent",color:C.muted,cursor:"pointer",fontSize:11}}>
          + Agregar fila
        </button>
      )}
      {docsItem&&(
        <DocsLineaModal
          item={docsItem}
          canEdit={canEdit}
          usuario={usuario}
          nominaId={nominaId}
          empresa={empresa}
          anioNom={anioNom}
          fechaNom={fechaNom}
          onUpdateItem={updItemObj}
          onClose={()=>setDocsItemId(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// EXPEDIENTE DIGITAL — MODAL DE DOCUMENTOS POR LÍNEA (Fase 1)
// Adjuntar (1+), ver/descargar (URL firmada), soft-delete, principal,
// y generación de Documento Interno para líneas de empresas relacionadas.
// ─────────────────────────────────────────────────────────────────
function DocsLineaModal({item, canEdit, usuario, nominaId, empresa, anioNom, fechaNom, onUpdateItem, onClose}) {
  const [subiendo, setSubiendo] = useState(false);
  const [err, setErr] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [genInterno, setGenInterno] = useState(false);
  const fileRef = useRef(null);

  const activos = docsActivos(item);
  const tieneRespaldoExterno = activos.some(d=>!d.interno);
  // El documento interno se puede generar manualmente en CUALQUIER línea editable
  // sin respaldo externo (ej. arriendo de oficina). La AUTO-generación sigue solo
  // para empresas relacionadas y anticipos (requiereDocInterno).
  const puedeInterno = canEdit && !tieneRespaldoExterno;
  const esAnticipo = item.seccion === "anticipos";
  const tipoInterno = esAnticipo ? "anticipo" : esLineaRelacionada(item) ? "intercompania" : "general";
  const docInternoLabel = tipoInterno==="anticipo" ? "Beneficiario / Trabajador" : tipoInterno==="general" ? "Beneficiario" : "Empresa destino";
  const docInternoTitulo = tipoInterno==="anticipo" ? "Vale de anticipo de sueldo" : "Documento interno de respaldo";
  const docInternoHint = tipoInterno==="anticipo" ? "(anticipo de sueldo)" : tipoInterno==="general" ? "(pago sin factura)" : "(empresa relacionada)";
  const ahora = ()=>new Date().toISOString();
  const nombreUsr = usuario?.nombre || "—";

  // Moneda/monto de la línea (para el voucher interno).
  const montoLinea = Number(item.montoUSD) ? Number(item.montoUSD)
    : Number(item.montoPEN) ? Number(item.montoPEN)
    : Number(item.montoCLP) || 0;
  const monedaLinea = Number(item.montoUSD) ? "USD"
    : Number(item.montoPEN) ? "PEN" : "CLP";

  async function subirArchivos(fileList) {
    const files = Array.from(fileList||[]);
    if(!files.length) return;
    setErr(""); setSubiendo(true);
    const nuevos = []; const fallidos = [];
    for(const file of files) {
      const docId = `doc_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
      const path = pathDocNomina(empresa, nominaId, item.id, docId, file.name);
      const hash = await hashArchivo(file);
      const r = await uploadDocNomina(file, path);
      if(r?.ok) {
        nuevos.push({
          id:docId, nombre:file.name, path, principal:false,
          mime:file.type||"", sizeKB:Math.round((file.size||0)/1024), hash,
          subidoPor:nombreUsr, fechaSubida:ahora(), estado:"activo", interno:false, voucher:null,
        });
      } else {
        fallidos.push(`${file.name}: ${uploadDocNomina.lastError||"error"}`);
      }
    }
    if(nuevos.length) {
      const histo = nuevos.map(d=>({accion:"doc_adjuntado", usuario:nombreUsr, fecha:ahora(), detalle:d.nombre}));
      onUpdateItem({...item, documentos:[...(item.documentos||[]), ...nuevos], historial:[...(item.historial||[]), ...histo]});
    }
    if(fallidos.length) setErr(`No se subieron ${fallidos.length}: ${fallidos.join(" · ")}`);
    setSubiendo(false);
    if(fileRef.current) fileRef.current.value="";
  }

  async function verDoc(doc) {
    const url = await urlFirmadaNomina(doc.path);
    if(url) window.open(url, "_blank", "noopener");
    else alert(`No se pudo generar el enlace del documento.\n${urlFirmadaNomina.lastError||""}`);
  }

  function quitarDoc(doc) {
    if(!window.confirm(`¿Quitar "${doc.nombre}"?\n\nNo se elimina del almacenamiento: se marca inactivo y queda en el historial.`)) return;
    const documentos = (item.documentos||[]).map(d=>d.id===doc.id?{...d, estado:"inactivo"}:d);
    const histo = {accion:"doc_eliminado", usuario:nombreUsr, fecha:ahora(), detalle:doc.nombre};
    onUpdateItem({...item, documentos, historial:[...(item.historial||[]), histo]});
  }

  function marcarPrincipal(doc) {
    const documentos = (item.documentos||[]).map(d=>({...d, principal: d.id===doc.id}));
    onUpdateItem({...item, documentos});
  }

  async function confirmarInterno(contraparte, concepto, observaciones) {
    if(!contraparte?.trim()){ alert(`Indica ${docInternoLabel.toLowerCase()}.`); return; }
    setErr(""); setSubiendo(true);
    try {
      const doc = await generarDocInternoLinea(
        {empresa, nominaId, anio:anioNom, fecha:fechaNom},
        item, usuario,
        {contraparte:contraparte.trim(), concepto, observaciones}
      );
      if(!doc){ setErr(`No se pudo guardar el documento interno: ${uploadDocNomina.lastError||"error"}`); setSubiendo(false); return; }
      onUpdateItem({...item, documentos:[...(item.documentos||[]), doc],
        historial:[...(item.historial||[]), {accion:"doc_interno_generado", usuario:nombreUsr, fecha:ahora(), detalle:doc.voucher.correlativo}]});
      setGenInterno(false);
    } catch(e) {
      setErr(`Error generando el documento interno: ${e.message||e}`);
    }
    setSubiendo(false);
  }

  const fmtFecha = (iso)=>{ try{ return new Date(iso).toLocaleString("es-CL"); }catch{ return iso||"—"; } };

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"#0008",zIndex:1000,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,
        width:"min(640px,96vw)",maxHeight:"90vh",overflowY:"auto",padding:18,boxShadow:"0 12px 40px #0006"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
          <div>
            <div style={{fontSize:14,fontWeight:800,color:C.text}}>Documentos de respaldo</div>
            <div style={{fontSize:11.5,color:C.muted}}>{item.proveedor||item.concepto||item.tipoDoc||"Línea de pago"} · {monedaLinea} {montoLinea?montoLinea.toLocaleString("es-CL"):"—"}</div>
          </div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:C.muted,fontSize:20,cursor:"pointer"}}>×</button>
        </div>
        <div style={{fontSize:12,fontWeight:700,margin:"6px 0 10px",color:tieneRespaldo(item)?C.green:"#ef4444"}}>
          {tieneRespaldo(item)?`🟢 Con respaldo (${activos.length})`:"🔴 Sin respaldo"}
        </div>

        {/* Lista de documentos activos */}
        {activos.length===0&&(
          <div style={{color:C.muted2,fontSize:12,padding:"10px 0"}}>No hay documentos adjuntos.</div>
        )}
        {activos.map(doc=>(
          <div key={doc.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 9px",
            border:`1px solid ${C.border}`,borderRadius:8,marginBottom:6,background:C.card2}}>
            <span style={{fontSize:16}}>{doc.interno?"🧾":"📄"}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,fontWeight:600,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                {doc.nombre} {doc.principal&&<span style={{color:C.yellow}} title="Documento principal">★</span>}
                {doc.interno&&<span style={{fontSize:10,color:C.muted,marginLeft:4}}>(interno {doc.voucher?.correlativo||""})</span>}
              </div>
              <div style={{fontSize:10,color:C.muted}}>
                {doc.subidoPor} · {fmtFecha(doc.fechaSubida)}{doc.sizeKB?` · ${doc.sizeKB} KB`:""}{doc.hash?` · sha256:${doc.hash.slice(0,8)}…`:""}
              </div>
            </div>
            <button onClick={()=>verDoc(doc)} title="Ver / descargar"
              style={{background:`${C.blue}22`,border:"none",borderRadius:6,padding:"4px 9px",cursor:"pointer",fontSize:11,color:C.blue}}>Ver</button>
            {canEdit&&!doc.principal&&(
              <button onClick={()=>marcarPrincipal(doc)} title="Marcar como principal"
                style={{background:`${C.border}44`,border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,color:C.muted}}>★</button>
            )}
            {canEdit&&(
              <button onClick={()=>quitarDoc(doc)} title="Quitar (soft-delete)"
                style={{background:"#fee2e233",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,color:"#ef4444"}}>×</button>
            )}
          </div>
        ))}

        {err&&<div style={{color:"#ef4444",fontSize:11,margin:"6px 0"}}>{err}</div>}

        {/* Zona de carga */}
        {canEdit&&!genInterno&&(
          <div
            onDragOver={e=>{e.preventDefault();setDragOver(true);}}
            onDragLeave={()=>setDragOver(false)}
            onDrop={e=>{e.preventDefault();setDragOver(false);subirArchivos(e.dataTransfer.files);}}
            style={{marginTop:10,padding:"16px",border:`1.5px dashed ${dragOver?C.blue:C.border2}`,borderRadius:10,
              textAlign:"center",background:dragOver?`${C.blue}11`:"transparent",cursor:"pointer"}}
            onClick={()=>fileRef.current&&fileRef.current.click()}>
            <div style={{fontSize:12,color:C.muted}}>{subiendo?"Subiendo…":"Arrastra archivos aquí o haz clic para seleccionar"}</div>
            <div style={{fontSize:10,color:C.muted2,marginTop:2}}>PDF · Excel · Word · imágenes · varios a la vez</div>
            <input ref={fileRef} type="file" multiple style={{display:"none"}}
              onChange={e=>subirArchivos(e.target.files)}/>
          </div>
        )}

        {/* Documento interno: cualquier línea editable sin respaldo externo */}
        {puedeInterno&&!genInterno&&(
          <button onClick={()=>setGenInterno(true)} disabled={subiendo}
            style={{marginTop:10,width:"100%",padding:"9px",borderRadius:8,border:`1px solid ${C.yellow}`,
              background:`${C.yellow}1a`,color:C.text,cursor:"pointer",fontSize:12,fontWeight:700}}>
            🧾 Generar documento interno {docInternoHint}
          </button>
        )}
        {genInterno&&(
          <FormDocInterno
            empresaOrigen={empresa}
            destinoLabel={docInternoLabel}
            titulo={docInternoTitulo}
            mostrarDatalist={tipoInterno==="intercompania"}
            destinoSugerido={item.proveedor||""}
            concepto={item.concepto||""}
            monedaLinea={monedaLinea} montoLinea={montoLinea}
            subiendo={subiendo}
            onCancel={()=>setGenInterno(false)}
            onConfirm={confirmarInterno}
          />
        )}
      </div>
    </div>
  );
}

// Mini-formulario para el documento interno (intercompañía o anticipo).
function FormDocInterno({empresaOrigen, destinoLabel="Empresa destino", titulo="Documento interno de respaldo", mostrarDatalist=false, destinoSugerido, concepto:conceptoIni, monedaLinea, montoLinea, subiendo, onCancel, onConfirm}) {
  const [destino, setDestino] = useState(destinoSugerido||"");
  const [concepto, setConcepto] = useState(conceptoIni||"");
  const [obs, setObs] = useState("");
  const inp = {padding:"6px 8px",borderRadius:6,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,width:"100%",boxSizing:"border-box"};
  const opciones = EMPRESAS_NOM.filter(e=>e!==empresaOrigen);
  const ph = destinoLabel==="Empresa destino" ? "Empresa relacionada" : destinoLabel.includes("Trabajador") ? "Nombre del trabajador" : "Nombre / glosa del beneficiario";
  return (
    <div style={{marginTop:10,padding:12,border:`1px solid ${C.yellow}`,borderRadius:10,background:`${C.yellow}0d`}}>
      <div style={{fontSize:12.5,fontWeight:800,color:C.text,marginBottom:8}}>🧾 {titulo}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <div><label style={{fontSize:10,color:C.muted}}>Empresa origen</label>
          <div style={{...inp,opacity:0.7}}>{empresaOrigen}</div></div>
        <div><label style={{fontSize:10,color:C.muted}}>{destinoLabel}</label>
          <input list={mostrarDatalist?"emp-destino-list":undefined} value={destino} onChange={e=>setDestino(e.target.value)} style={inp} placeholder={ph}/>
          {mostrarDatalist&&<datalist id="emp-destino-list">{opciones.map(e=><option key={e} value={e}/>)}</datalist>}</div>
        <div><label style={{fontSize:10,color:C.muted}}>Monto</label>
          <div style={{...inp,opacity:0.7}}>{monedaLinea} {montoLinea?montoLinea.toLocaleString("es-CL"):"—"}</div></div>
        <div><label style={{fontSize:10,color:C.muted}}>Concepto</label>
          <input value={concepto} onChange={e=>setConcepto(e.target.value)} style={inp} placeholder="Concepto"/></div>
      </div>
      <div style={{marginTop:8}}><label style={{fontSize:10,color:C.muted}}>Observaciones (opcional)</label>
        <input value={obs} onChange={e=>setObs(e.target.value)} style={inp} placeholder="Observaciones"/></div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:10}}>
        <button onClick={onCancel} disabled={subiendo} style={{padding:"7px 14px",borderRadius:7,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer",fontSize:12}}>Cancelar</button>
        <button onClick={()=>onConfirm(destino, concepto, obs)} disabled={subiendo}
          style={{padding:"7px 14px",borderRadius:7,border:"none",background:C.green,color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>
          {subiendo?"Generando…":"Generar PDF"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// EXPEDIENTE DIGITAL — VISTA AUDITORÍA (Fase 3)
// Read-only, expandible por línea: datos + documentos + comentarios +
// historial. Revela también líneas/documentos inactivados (soft-delete).
// ─────────────────────────────────────────────────────────────────
function AuditoriaNominaModal({nomina, onClose}) {
  const nom = nomina;
  const [abierta, setAbierta] = useState({});
  const nombreFormal = `Nómina ${nom.empresa} S${nom.semana} N°${nom.numero||1}`;
  const cob = coberturaNomina(nom);
  const fmt = (iso)=>{ try{ return new Date(iso).toLocaleString("es-CL"); }catch{ return iso||"—"; } };
  const verDoc = async (d)=>{ const u=await urlFirmadaNomina(d.path); if(u) window.open(u,"_blank","noopener"); else alert("No se pudo abrir el documento.\n"+(urlFirmadaNomina.lastError||"")); };
  const montoStr = (it)=> Number(it.montoUSD)?`USD ${Number(it.montoUSD).toLocaleString("es-CL")}`
    : Number(it.montoPEN)?`PEN ${Number(it.montoPEN).toLocaleString("es-CL")}`
    : `CLP ${Number(it.montoCLP||0).toLocaleString("es-CL")}`;
  const secs = [...SECCIONES,...(nom.seccionesExtra||[])];
  const colPct = cob.pct>=100?C.green:cob.pct>=60?C.yellow:"#ef4444";

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"#0009",zIndex:1100,
      display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"4vh 16px",overflowY:"auto"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,
        width:"min(880px,98vw)",maxHeight:"92vh",overflowY:"auto",padding:20,boxShadow:"0 12px 40px #0007"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
          <div>
            <div style={{fontSize:15,fontWeight:800,color:C.text}}>🔍 Vista Auditoría</div>
            <div style={{fontSize:11.5,color:C.muted}}>{nombreFormal} · {nom.empresa}</div>
          </div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:C.muted,fontSize:22,cursor:"pointer"}}>×</button>
        </div>
        <div style={{fontSize:12,fontWeight:700,color:colPct,marginBottom:12}}>
          Cobertura documental: {cob.conRespaldo}/{cob.total} líneas ({cob.pct}%)
        </div>

        {/* Historial de la nómina */}
        {(nom.historial||[]).length>0&&(
          <div style={{marginBottom:14,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
            <div style={{background:C.bg2,padding:"6px 10px",fontSize:11,fontWeight:700,color:C.muted}}>Historial de la nómina</div>
            {(nom.historial||[]).slice().reverse().map((h,i)=>(
              <div key={i} style={{display:"flex",gap:10,padding:"5px 10px",borderTop:`1px solid ${C.border}22`,fontSize:10.5,alignItems:"baseline"}}>
                <span style={{color:C.muted2,whiteSpace:"nowrap"}}>{fmt(h.fecha)}</span>
                <span style={{fontWeight:700,color:C.text}}>{labelAccionNom(h.accion)}</span>
                <span style={{color:C.muted}}>{h.estadoDesde?`${h.estadoDesde} → ${h.estadoHacia}`:""}{h.motivo?` · ${h.motivo}`:""}</span>
                <span style={{marginLeft:"auto",color:C.muted2}}>{h.usuario}</span>
              </div>
            ))}
          </div>
        )}

        {/* Líneas por sección (incluye inactivadas) */}
        {secs.map(sec=>{
          const its = (nom.items||[]).filter(it=>it.seccion===sec.id);
          if(its.length===0) return null;
          return (
            <div key={sec.id} style={{marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:4}}>{sec.label}</div>
              {its.map(it=>{
                const inactiva = !lineaActiva(it);
                const docs = it.documentos||[];
                const activosDocs = docs.filter(d=>(d.estado||"activo")==="activo");
                const exp = !!abierta[it.id];
                return (
                  <div key={it.id} style={{border:`1px solid ${C.border}`,borderRadius:8,marginBottom:6,
                    opacity:inactiva?0.55:1,background:C.card2}}>
                    <div onClick={()=>setAbierta(s=>({...s,[it.id]:!s[it.id]}))}
                      style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",cursor:"pointer"}}>
                      <span style={{fontSize:11}}>{exp?"▼":"▶"}</span>
                      <span style={{fontSize:12}}>{activosDocs.length>0?"🟢":"🔴"}</span>
                      <span style={{fontWeight:600,fontSize:12,color:C.text,textDecoration:inactiva?"line-through":"none"}}>
                        {it.proveedor||it.concepto||it.tipoDoc||"—"}
                      </span>
                      {inactiva&&<span style={{fontSize:9,color:"#ef4444",fontWeight:700}}>INACTIVA</span>}
                      <span style={{marginLeft:"auto",fontSize:11,color:C.muted}}>{montoStr(it)} · 📎{activosDocs.length}</span>
                    </div>
                    {exp&&(
                      <div style={{padding:"4px 12px 12px 30px",fontSize:11,color:C.muted}}>
                        <div style={{marginBottom:6,color:C.text}}>
                          RUT {it.rut||"—"} · N°Doc {it.nDoc||"—"} · F.Doc {it.fDoc||"—"} · Venc {it.fVenc||"—"}
                          {it.concepto?` · ${it.concepto}`:""}{it.comentario?` · Obs: ${it.comentario}`:""}
                        </div>
                        {/* Documentos (todos, marca estado) */}
                        <div style={{fontWeight:700,color:C.muted,marginBottom:3}}>Documentos</div>
                        {docs.length===0&&<div style={{color:C.muted2}}>Sin documentos.</div>}
                        {docs.map(d=>(
                          <div key={d.id} style={{display:"flex",alignItems:"center",gap:8,padding:"3px 0",
                            opacity:(d.estado||"activo")==="activo"?1:0.5}}>
                            <span>{d.interno?"🧾":"📄"}</span>
                            <span style={{color:C.text}}>{d.nombre}{d.principal?" ★":""}{d.interno&&d.voucher?.correlativo?` (${d.voucher.correlativo})`:""}</span>
                            {(d.estado||"activo")!=="activo"&&<span style={{fontSize:9,color:"#ef4444"}}>({d.estado})</span>}
                            <span style={{color:C.muted2,fontSize:9}}>{d.subidoPor} · {fmt(d.fechaSubida)}{d.hash?` · sha256:${d.hash.slice(0,8)}…`:""}</span>
                            <button onClick={()=>verDoc(d)} style={{marginLeft:"auto",background:`${C.blue}22`,border:"none",borderRadius:6,padding:"2px 8px",cursor:"pointer",fontSize:10,color:C.blue}}>Ver</button>
                          </div>
                        ))}
                        {/* Historial de la línea */}
                        {(it.historial||[]).length>0&&(
                          <div style={{marginTop:6}}>
                            <div style={{fontWeight:700,color:C.muted,marginBottom:3}}>Historial de la línea</div>
                            {(it.historial||[]).slice().reverse().map((h,i)=>(
                              <div key={i} style={{fontSize:10,color:C.muted2}}>{fmt(h.fecha)} · {h.accion} · {h.usuario}{h.detalle?` · ${h.detalle}`:""}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// PANEL BANCOS
// ─────────────────────────────────────────────────────────────────
// PanelBancos: muestra saldos desde saldosBancos existente (read-only por empresa)
function PanelBancosNomina({empresa, saldosBancos}) {
  // Keys format: "Empresa||Banco||moneda" — must match EMPRESAS_LIST exactly
  const bancosChile = ["BCI","BICE","Security","Chile","Santander"];
  const bancosPeruana = ["Scotiabank Perú","BBVA Perú"];
  const esPeruana = empresa.includes("Perú");
  const bancosList = esPeruana ? bancosPeruana : bancosChile;
  const monedas = esPeruana ? ["pen","usd"] : ["clp","usd","eur"];
  // Build rows from all relevant keys in saldosBancos
  const rows = bancosList.flatMap(banco=>
    monedas.map(moneda=>{
      const key = `${empresa}||${banco}||${moneda}`;
      const val = Number(saldosBancos?.[key]?.monto)||0;
      return {banco, moneda, val, key};
    })
  ).filter(r=>r.val!==0);
  // Group by banco
  const byBanco = bancosList.map(banco=>{
    const clp = Number(saldosBancos?.[`${empresa}||${banco}||clp`]?.monto)||0;
    const usd = Number(saldosBancos?.[`${empresa}||${banco}||usd`]?.monto)||0;
    const pen = Number(saldosBancos?.[`${empresa}||${banco}||pen`]?.monto)||0;
    const eur = Number(saldosBancos?.[`${empresa}||${banco}||eur`]?.monto)||0;
    return {banco, clp, usd, pen, eur};
  }).filter(r=>r.clp||r.usd||r.pen||r.eur);
  const totCLP = byBanco.reduce((s,r)=>s+r.clp,0);
  const totUSD = byBanco.reduce((s,r)=>s+r.usd,0);
  const totEUR = byBanco.reduce((s,r)=>s+r.eur,0);
  const totPEN = byBanco.reduce((s,r)=>s+r.pen,0);
  const tieneEUR = byBanco.some(r=>r.eur);
  const tienePEN = byBanco.some(r=>r.pen);
  if(!byBanco.length) return (
    <div style={{background:C.card2,borderRadius:10,padding:"12px 16px",border:`1px solid ${C.border}`,
      color:C.muted2,fontSize:11}}>🏦 Sin saldos bancarios registrados para {empresa}</div>
  );
  return (
    <div style={{background:C.card2,borderRadius:10,padding:"12px 16px",border:`1px solid ${C.border}`}}>
      <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:8}}>🏦 Saldos de Bancos — {empresa}</div>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
        <thead>
          <tr style={{borderBottom:`1px solid ${C.border}`}}>
            <th style={{padding:"4px 8px",color:C.muted,fontWeight:600,textAlign:"left"}}>Banco</th>
            {!esPeruana&&<th style={{padding:"4px 8px",color:C.muted,fontWeight:600,textAlign:"right"}}>CLP</th>}
            <th style={{padding:"4px 8px",color:C.muted,fontWeight:600,textAlign:"right"}}>USD</th>
            {tieneEUR&&<th style={{padding:"4px 8px",color:C.muted,fontWeight:600,textAlign:"right"}}>EUR</th>}
            {tienePEN&&<th style={{padding:"4px 8px",color:C.muted,fontWeight:600,textAlign:"right"}}>PEN</th>}
          </tr>
        </thead>
        <tbody>
          {byBanco.map(r=>(
            <tr key={r.banco} style={{borderBottom:`1px solid ${C.border}22`}}>
              <td style={{padding:"4px 8px",color:C.text,fontWeight:500}}>{r.banco}</td>
              {!esPeruana&&<td style={{padding:"4px 8px",textAlign:"right",color:r.clp?C.yellow:C.muted2,fontWeight:r.clp?700:400}}>{r.clp?$$clp(r.clp):"—"}</td>}
              <td style={{padding:"4px 8px",textAlign:"right",color:r.usd?C.blue:C.muted2,fontWeight:r.usd?700:400}}>{r.usd?$$usd(r.usd):"—"}</td>
              {tieneEUR&&<td style={{padding:"4px 8px",textAlign:"right",color:r.eur?"#a78bfa":C.muted2,fontWeight:r.eur?700:400}}>{r.eur?`€${r.eur.toLocaleString("es-CL",{maximumFractionDigits:2})}`:"—"}</td>}
              {tienePEN&&<td style={{padding:"4px 8px",textAlign:"right",color:r.pen?"#f97316":C.muted2,fontWeight:r.pen?700:400}}>{r.pen?`S/${r.pen.toLocaleString("es-CL",{maximumFractionDigits:2})}`:"—"}</td>}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{borderTop:`2px solid ${C.border}`,background:C.bg2}}>
            <td style={{padding:"5px 8px",fontWeight:700,color:C.text}}>TOTAL</td>
            {!esPeruana&&<td style={{padding:"5px 8px",textAlign:"right",fontWeight:800,color:C.yellow}}>{totCLP?$$clp(totCLP):"—"}</td>}
            <td style={{padding:"5px 8px",textAlign:"right",fontWeight:800,color:C.blue}}>{totUSD?$$usd(totUSD):"—"}</td>
            {tieneEUR&&<td style={{padding:"5px 8px",textAlign:"right",fontWeight:800,color:"#a78bfa"}}>{totEUR?`€${totEUR.toLocaleString("es-CL",{maximumFractionDigits:2})}`:"—"}</td>}
            {tienePEN&&<td style={{padding:"5px 8px",textAlign:"right",fontWeight:800,color:"#f97316"}}>{totPEN?`S/${totPEN.toLocaleString("es-CL",{maximumFractionDigits:2})}`:"—"}</td>}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// VISTA NÓMINA DETALLE
// ─────────────────────────────────────────────────────────────────
function NominaDetalle({nomina, onUpdate, onBack, usuario, canEdit, saldosBancos, nominasHermanas=[], onSwitchNomina, onCrearYAbrir, onCrearNueva, onAplazar}) {
  const nom = nomina;
  const esCFO = usuario?.rol==="admin" || usuario?.esCFO;
  const [soloVer, setSoloVer] = useState(false);
  const [showAudit, setShowAudit] = useState(false);   // Vista Auditoría (Fase 3)
  const [descExpediente, setDescExpediente] = useState(false); // Descargar Expediente ZIP (Fase 6)
  const [genPdf, setGenPdf] = useState(false);          // Expediente PDF consolidado
  // Estado bloqueado: nadie puede editar contenido una vez que tiene V°B° o está aprobada
  const estadoBloqueado = nom.estado === "aprobada" || nom.estado === "aprobada1";
  // editActivo: controla si se pueden modificar items/campos de la nómina
  // NADIE puede editar una nómina con V°B° o aprobada (ni siquiera admin)
  const editActivo = canEdit && !soloVer && !estadoBloqueado;

  // Nombre formal: "Nómina [Empresa] S[semana] N°[numero]"
  const numNomina = nom.numero || 1;
  const nombreFormal = `Nómina ${nom.empresa} S${nom.semana} N°${numNomina}`;

  // ── Documento interno AUTOMÁTICO (Fase 5) ──────────────────────────
  // Al guardar, las líneas de empresas relacionadas / anticipos con monto y
  // nombre, sin respaldo aún, reciben su documento interno autogenerado.
  // Debounce 2.5s + ref anti-reentrada. No regenera si la línea ya tiene doc.
  const autoDocRef = useRef(false);
  useEffect(()=>{
    if(!editActivo) return;
    const t = setTimeout(async ()=>{
      if(autoDocRef.current) return;
      const pend = (nom.items||[]).filter(it =>
        lineaActiva(it) && requiereDocInterno(it) &&
        (it.proveedor||"").trim() &&
        (Number(it.montoCLP)||Number(it.montoUSD)||Number(it.montoPEN)) &&
        docsActivos(it).length===0);
      if(!pend.length) return;
      autoDocRef.current = true;
      try {
        let actual = nom;
        for(const it of pend){
          const doc = await generarDocInternoLinea({empresa:nom.empresa, nominaId:nom.id, anio:nom.año, fecha:nom.fecha}, it, usuario);
          if(doc){
            actual = {...actual, items: actual.items.map(x=>x.id===it.id
              ? {...x, documentos:[...(x.documentos||[]), doc],
                  historial:[...(x.historial||[]), {accion:"doc_interno_auto", usuario:usuario?.nombre||"—", fecha:new Date().toISOString(), detalle:doc.voucher.correlativo}]}
              : x)};
          }
        }
        if(actual!==nom) onUpdate(actual);
      } finally { autoDocRef.current = false; }
    }, 2500);
    return ()=>clearTimeout(t);
  }, [nom, editActivo, usuario]); // eslint-disable-line react-hooks/exhaustive-deps

  function upd(field, val) {
    if(soloVer) return;
    // Interceptar aplazamiento de items
    if(field === "items" && Array.isArray(val)) {
      const aplazado = val.find(it=>it._aplazar);
      if(aplazado) {
        const {semana: semDest, motivo} = aplazado._aplazar;
        const itemLimpio = {...aplazado, comentario: motivo, _aplazar: undefined, semVenc: "", fVenc: ""};
        delete itemLimpio._aplazar;
        // Nuevo ID para el item en la nómina destino
        const itemNuevo = {...itemLimpio, id: `item_${Date.now()}_${Math.random().toString(36).slice(2,7)}`};
        // Quitar el item de la nómina actual
        const itemsSinAplazado = val.filter(it=>it.id !== aplazado.id);
        const nombreItem = aplazado.proveedor||aplazado.tipoDoc||"sin nombre";
        // Guardado verificado: el padre mueve el item y persiste con await; el alert
        // de éxito SOLO se muestra si Supabase confirmó el guardado (res.ok).
        if(onAplazar) {
          Promise.resolve(
            onAplazar({nomOrigen: nom, itemsSinAplazado, empresa: nom.empresa, semDest, añoDest: nom.año, itemNuevo})
          ).then(ok=>{
            if(ok) alert(`✅ Item "${nombreItem}" aplazado a la semana ${semDest}.\nSe eliminó de esta nómina.`);
            else   alert(`⚠️ No se pudo aplazar "${nombreItem}" a la semana ${semDest}.\nEl cambio NO se guardó. Revisa tu conexión y reintenta.`);
          });
        } else {
          // Fallback legacy (no debería ocurrir si el padre pasa onAplazar)
          onUpdate({...nom, items: itemsSinAplazado});
          if(onCrearYAbrir) onCrearYAbrir(nom.empresa, semDest, nom.año, itemNuevo);
        }
        return;
      }
    }
    onUpdate({...nom, [field]:val});
  }

  // ── Descargar Expediente (Fase 6): ZIP con resumen + documentos por línea ──
  async function descargarExpediente() {
    setDescExpediente(true);
    try {
      if(!window.JSZip){ await new Promise((res,rej)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";s.onload=res;s.onerror=rej;document.head.appendChild(s);}); }
      const zip = new window.JSZip();
      const carpeta = `Nomina_${nom.empresa.replace(/[^a-zA-Z0-9]+/g,"_")}_${nom.año}_S${nom.semana}_N${nom.numero||1}`;
      const root = zip.folder(carpeta);
      const cob = coberturaNomina(nom);
      let resumen = `${nombreFormal}\n`;
      resumen += `Empresa: ${nom.empresa}\nSemana: ${nom.semana} / Año: ${nom.año}\nFecha: ${nom.fecha||"—"}\n`;
      resumen += `Estado: ${(ESTADOS_FLUJO.find(e=>e.id===nom.estado)||{}).label||nom.estado}\n`;
      resumen += `Cobertura documental: ${cob.conRespaldo}/${cob.total} (${cob.pct}%)\n\nDETALLE DE PAGOS\n`;
      for(const sec of [...SECCIONES,...(nom.seccionesExtra||[])]){
        const its = nom.items.filter(it=>it.seccion===sec.id && lineaActiva(it));
        if(!its.length) continue;
        resumen += `\n[${sec.label}]\n`;
        for(const it of its){
          const m = Number(it.montoUSD)?`USD ${it.montoUSD}`:Number(it.montoPEN)?`PEN ${it.montoPEN}`:`CLP ${it.montoCLP||0}`;
          resumen += `  - ${it.proveedor||it.concepto||"—"} · ${m} · ${tieneRespaldo(it)?docsActivos(it).length+" doc(s)":"SIN RESPALDO"}\n`;
        }
      }
      if((nom.historial||[]).length){ resumen += `\nHISTORIAL\n`; for(const h of nom.historial) resumen += `  ${h.fecha} · ${labelAccionNom(h.accion)} · ${h.usuario}${h.motivo?" · "+h.motivo:""}\n`; }
      root.file("01_Resumen.txt", resumen);
      let idx=2; const fallos=[];
      const itsConDocs = nom.items.filter(it=>lineaActiva(it) && docsActivos(it).length>0);
      for(const it of itsConDocs){
        const sub = root.folder(`${String(idx).padStart(2,"0")}_${(it.proveedor||it.concepto||"Pago").replace(/[^a-zA-Z0-9]+/g,"_").slice(0,40)}`);
        for(const d of docsActivos(it)){
          const url = await urlFirmadaNomina(d.path);
          if(!url){ fallos.push(d.nombre); continue; }
          try{ const r=await fetch(url); if(!r.ok){fallos.push(d.nombre);continue;} sub.file(d.nombre, await r.blob()); }
          catch{ fallos.push(d.nombre); }
        }
        idx++;
      }
      if(fallos.length) root.file("_documentos_no_incluidos.txt", fallos.join("\n"));
      const out = await zip.generateAsync({type:"blob"});
      const a=document.createElement("a"); a.href=URL.createObjectURL(out); a.download=`${carpeta}.zip`; a.click(); URL.revokeObjectURL(a.href);
      window.auditLog && window.auditLog("exportar", {modulo:"finanzas", seccion:"nóminas", descripcion:`Descargó expediente ${nombreFormal}`, registroId:nom.id});
    } catch(e){
      alert("No se pudo generar el expediente: "+(e.message||e));
    }
    setDescExpediente(false);
  }

  // ── Expediente PDF consolidado: nómina + todos los respaldos en UN solo PDF ──
  async function expedientePDF() {
    setGenPdf(true);
    try {
      const jsPDF = await reporte_loadJsPDF();
      const PDFLib = await loadPdfLib();
      // 1) Portada = planilla formateada (como la impresión) con logo de la empresa.
      const sdoc = new jsPDF({orientation:"landscape", unit:"mm", format:"a4"});
      const pageW = sdoc.internal.pageSize.getWidth();
      const NAVY=[30,39,97], LIGHT=[234,238,244];
      // Logo
      let headerX=14, logoBottom=12;
      const logoPath = LOGO_NOMINA[nom.empresa];
      if(logoPath){
        try{
          const durl = await urlToDataURLNom(logoPath);
          const nat = await imgNaturalSizeNom(durl);
          if(nat && nat.w){ const maxW=42,maxH=16; const sc=Math.min(maxW/nat.w,maxH/nat.h); const w=nat.w*sc,h=nat.h*sc;
            sdoc.addImage(durl, logoPath.toLowerCase().endsWith(".png")?"PNG":"JPEG", 14, 9, w, h, undefined, "FAST");
            headerX = 14+w+6; logoBottom = Math.max(logoBottom, 9+h);
          }
        }catch{/* sin logo */}
      }
      sdoc.setFontSize(14); sdoc.setFont(undefined,"bold"); sdoc.setTextColor(...NAVY);
      sdoc.text(nombreFormal, headerX, 16);
      sdoc.setFontSize(8); sdoc.setFont(undefined,"normal"); sdoc.setTextColor(90);
      sdoc.text(`Semana ${nom.semana} · Año ${nom.año} · Fecha: ${nom.fecha||"—"}${nom.tc?` · T.C: $${nom.tc.toLocaleString("es-CL")}`:""}`, headerX, 22);
      const cob = coberturaNomina(nom);
      sdoc.text(`Respaldo documental: ${cob.conRespaldo}/${cob.total} líneas (${cob.pct}%)`, headerX, 27);
      sdoc.text(`Estado: ${(ESTADOS_FLUJO.find(e=>e.id===nom.estado)||{}).label||nom.estado}`, pageW-14, 13, {align:"right"});
      sdoc.text(`Impreso: ${new Date().toLocaleDateString("es-CL")}`, pageW-14, 18, {align:"right"});
      // Tabla de líneas por sección
      const locLabel = nomEsPeruana?"PEN":"CLP";
      const fmtLoc = nomEsPeruana?$$pen:$$clp;
      const head=[["Tipo Doc","Proveedor","RUT","N° Doc","F.Doc","F.Venc","S","Concepto",locLabel,"USD","Anticipo","Saldo","Observaciones / Respaldo"]];
      const body=[]; let totLoc=0, totUSD=0;
      for(const sec of [...SECCIONES,...(nom.seccionesExtra||[])]){
        const its=nom.items.filter(it=>it.seccion===sec.id && lineaActiva(it)); if(!its.length) continue;
        body.push([{content:`${sec.label} (${its.length})`, colSpan:13, styles:{fontStyle:'bold', fillColor:LIGHT, textColor:NAVY}}]);
        let sLoc=0,sUSD=0;
        for(const it of its){
          const loc=Number(nomEsPeruana?it.montoPEN:it.montoCLP)||0, usd=Number(it.montoUSD)||0, ant=Number(it.anticipo)||0;
          const saldo=(usd||loc)-ant; sLoc+=loc; sUSD+=usd;
          const respaldo = tieneRespaldo(it) ? docsActivos(it).map(d=>d.nombre+(d.principal?" ★":"")).join(", ") : "Sin respaldo";
          body.push([it.tipoDoc||"—", it.proveedor||"—", it.rut||"—", it.nDoc||"—", it.fDoc||"—", it.fVenc||"—", it.semVenc?`S${it.semVenc}`:"—", it.concepto||"—",
            loc?fmtLoc(loc):"—", usd?$$usd(usd):"—", ant?(usd?$$usd(ant):fmtLoc(ant)):"—", saldo?(usd?$$usd(saldo):fmtLoc(saldo)):"—",
            (it.comentario?it.comentario+" · ":"")+respaldo]);
        }
        totLoc+=sLoc; totUSD+=sUSD;
        body.push([{content:"Subtotal", colSpan:8, styles:{halign:'right',fontStyle:'bold'}}, sLoc?fmtLoc(sLoc):"—", sUSD?$$usd(sUSD):"—", "", "", ""]);
      }
      body.push([{content:"TOTAL NÓMINA", colSpan:8, styles:{halign:'right',fontStyle:'bold',fillColor:NAVY,textColor:[255,255,255]}},
        {content:totLoc?fmtLoc(totLoc):"—", styles:{fillColor:NAVY,textColor:[255,255,255],fontStyle:'bold'}},
        {content:totUSD?$$usd(totUSD):"—", styles:{fillColor:NAVY,textColor:[255,255,255],fontStyle:'bold'}},
        {content:"",styles:{fillColor:NAVY}},{content:"",styles:{fillColor:NAVY}},{content:"",styles:{fillColor:NAVY}}]);
      sdoc.autoTable({ startY: Math.max(logoBottom,29)+4, head, body, theme:'grid',
        styles:{fontSize:6.5, cellPadding:1.1, overflow:'linebreak', textColor:[40,40,40], lineColor:[210,210,210]},
        headStyles:{fillColor:NAVY, textColor:[255,255,255], fontSize:6.5},
        columnStyles:{8:{halign:'right'},9:{halign:'right'},10:{halign:'right'},11:{halign:'right'},12:{cellWidth:55}},
        margin:{left:10,right:10} });
      let afterY = sdoc.lastAutoTable.finalY + 7;
      // Anexo respaldos
      const docsRows=[];
      nom.items.filter(it=>lineaActiva(it)&&docsActivos(it).length>0).forEach(it=>docsActivos(it).forEach(d=>{
        docsRows.push([it.proveedor||it.concepto||"—", d.nombre+(d.principal?" ★":""), d.interno?"Interno":"Adjunto", d.voucher?.correlativo||"—", d.hash?d.hash.slice(0,16)+"…":"—"]);
      }));
      if(docsRows.length){
        if(afterY>175){sdoc.addPage();afterY=20;}
        sdoc.setFontSize(10); sdoc.setFont(undefined,"bold"); sdoc.setTextColor(...NAVY); sdoc.text("Anexo — Respaldos documentales",10,afterY);
        sdoc.autoTable({ startY:afterY+2, head:[["Línea","Documento","Tipo","Correlativo interno","SHA-256"]], body:docsRows, theme:'grid',
          styles:{fontSize:7,cellPadding:1.2}, headStyles:{fillColor:NAVY,textColor:[255,255,255]}, margin:{left:10,right:10} });
        afterY = sdoc.lastAutoTable.finalY + 10;
      }
      // Firmas
      if(afterY>165){sdoc.addPage();afterY=30;}
      const colW=(pageW-20)/4; sdoc.setTextColor(90);
      [["Preparada por",nom.preparadoPor],["Revisada por",nom.revisadoPor],["V°B° Aprobador",nom.aprobado1Por],["Aprobado CFO",nom.aprobadoPor]].forEach((fm,i)=>{
        const cx=10+colW*i+colW/2;
        if(fm[1]){ sdoc.setFontSize(8); sdoc.text(String(fm[1]), cx, afterY+10, {align:"center"}); }
        sdoc.setDrawColor(150); sdoc.line(10+colW*i+10, afterY+13, 10+colW*(i+1)-10, afterY+13);
        sdoc.setFontSize(8); sdoc.text(fm[0], cx, afterY+18, {align:"center"});
      });
      const sBytes = sdoc.output("arraybuffer");
      // 2) Fusionar con pdf-lib
      const merged = await PDFLib.PDFDocument.create();
      const sPdf = await PDFLib.PDFDocument.load(sBytes);
      (await merged.copyPages(sPdf, sPdf.getPageIndices())).forEach(p=>merged.addPage(p));
      const font = await merged.embedFont(PDFLib.StandardFonts.Helvetica);
      const A4=[595.28,841.89];
      const addImagePage=(img)=>{ const pg=merged.addPage(A4); const mg=30,maxW=A4[0]-2*mg,maxH=A4[1]-2*mg;
        const sc=Math.min(maxW/img.width,maxH/img.height,1); const w=img.width*sc,h=img.height*sc;
        pg.drawImage(img,{x:(A4[0]-w)/2,y:(A4[1]-h)/2,width:w,height:h}); };
      const omitidos=[];
      const itsDocs = nom.items.filter(it=>lineaActiva(it) && docsActivos(it).length>0);
      for(const it of itsDocs){
        for(const d of docsActivos(it)){
          const url=await urlFirmadaNomina(d.path);
          if(!url){ omitidos.push(d.nombre); continue; }
          let buf; try{ const r=await fetch(url); if(!r.ok){omitidos.push(d.nombre);continue;} buf=await r.arrayBuffer(); }catch{ omitidos.push(d.nombre); continue; }
          const mime=(d.mime||"").toLowerCase(), name=(d.nombre||"").toLowerCase();
          try{
            if(mime.includes("pdf")||name.endsWith(".pdf")){
              const ext=await PDFLib.PDFDocument.load(buf,{ignoreEncryption:true});
              (await merged.copyPages(ext, ext.getPageIndices())).forEach(p=>merged.addPage(p));
            } else if(mime.includes("png")||name.endsWith(".png")){
              addImagePage(await merged.embedPng(buf));
            } else if(mime.includes("jpg")||mime.includes("jpeg")||name.endsWith(".jpg")||name.endsWith(".jpeg")){
              addImagePage(await merged.embedJpg(buf));
            } else { omitidos.push(`${d.nombre} (formato no visualizable)`); }
          }catch{ omitidos.push(d.nombre); }
        }
      }
      if(omitidos.length){
        const pg=merged.addPage(A4); const h=A4[1];
        pg.drawText("Documentos no incluidos (formato no visualizable o error):",{x:40,y:h-60,size:12,font});
        omitidos.forEach((n,i)=>pg.drawText(`- ${n}`.slice(0,90),{x:50,y:h-90-i*16,size:10,font}));
      }
      const bytes=await merged.save();
      const blob=new Blob([bytes],{type:"application/pdf"});
      const url=URL.createObjectURL(blob);
      window.open(url,"_blank");
      window.auditLog && window.auditLog("exportar", {modulo:"finanzas", seccion:"nóminas", descripcion:`Generó expediente PDF ${nombreFormal}`, registroId:nom.id});
    } catch(e){
      alert("No se pudo generar el expediente PDF: "+(e.message||e));
    }
    setGenPdf(false);
  }

  // ── Export Excel ──────────────────────────────────
  async function exportarExcelNomina() {
    if(!window.JSZip) {
      await new Promise((res,rej)=>{
        const s=document.createElement("script");
        s.src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
        s.onload=res;s.onerror=rej;document.head.appendChild(s);
      });
    }
    function colLetter(n){let s="";n++;while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);}return s;}
    function escXml(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}

    const headers=["Tipo Doc","Proveedor / Nombre","RUT","N° Doc","F. Doc","F. Venc","Sem","Concepto","Monto CLP","Monto USD","Anticipo","Saldo a Pagar","Comentario","Pagado"];
    const nCols=headers.length;
    const lastCol=colLetter(nCols-1);
    let rowsXml="";
    let currentRow=1;

    // Fila 1: Título
    rowsXml+=`<row r="${currentRow}" ht="28" customHeight="1"><c r="A${currentRow}" t="inlineStr" s="5"><is><t>${escXml(nombreFormal)}</t></is></c></row>`;
    currentRow++;
    // Fila 2: Meta
    const estadoLabel = (ESTADOS_FLUJO.find(e=>e.id===nom.estado)||{}).label||nom.estado;
    rowsXml+=`<row r="${currentRow}" ht="18" customHeight="1"><c r="A${currentRow}" t="inlineStr" s="6"><is><t>Fecha: ${nom.fecha||"—"} · T.C: ${nom.tc||"—"} · Estado: ${estadoLabel} · ${new Date().toLocaleDateString("es-CL")}</t></is></c></row>`;
    currentRow++;
    // Fila 3: Aprobadores
    const aprobadores = [
      nom.preparadoPor?`Prep: ${nom.preparadoPor}`:"",
      nom.revisadoPor?`Rev: ${nom.revisadoPor}`:"",
      nom.aprobado1Por?`V°B°: ${nom.aprobado1Por}`:"",
      nom.aprobadoPor?`CFO: ${nom.aprobadoPor}`:"",
    ].filter(Boolean).join(" · ");
    rowsXml+=`<row r="${currentRow}" ht="16" customHeight="1"><c r="A${currentRow}" t="inlineStr" s="6"><is><t>${escXml(aprobadores)}</t></is></c></row>`;
    currentRow++;
    // Fila vacía
    rowsXml+=`<row r="${currentRow}" ht="8" customHeight="1"></row>`;
    currentRow++;

    const merges=[`A1:${lastCol}1`,`A2:${lastCol}2`,`A3:${lastCol}3`];

    // Headers tabla
    rowsXml+=`<row r="${currentRow}" ht="22" customHeight="1">`;
    headers.forEach((h,c)=>{rowsXml+=`<c r="${colLetter(c)}${currentRow}" t="inlineStr" s="1"><is><t>${escXml(h)}</t></is></c>`;});
    rowsXml+=`</row>`;
    const headerRow=currentRow;
    currentRow++;

    // Data por sección
    const allSecs=[...SECCIONES,...(nom.seccionesExtra||[])];
    let grandTotalCLP=0, grandTotalUSD=0;
    allSecs.forEach(sec=>{
      const secItems=nom.items.filter(it=>it.seccion===sec.id && lineaActiva(it));
      if(secItems.length===0) return;
      // Fila título sección
      rowsXml+=`<row r="${currentRow}" ht="20" customHeight="1"><c r="A${currentRow}" t="inlineStr" s="7"><is><t>${escXml(sec.label)} (${secItems.length})</t></is></c>`;
      for(let c=1;c<nCols;c++) rowsXml+=`<c r="${colLetter(c)}${currentRow}" s="7"/>`;
      rowsXml+=`</row>`;
      merges.push(`A${currentRow}:${lastCol}${currentRow}`);
      currentRow++;
      // Items
      secItems.forEach((it,ri)=>{
        const sBase=ri%2===0?0:2;
        const clp=Number(it.montoCLP)||0;
        const usd=Number(it.montoUSD)||0;
        const antic=Number(it.anticipo)||0;
        const monto = usd || clp;
        const saldo = monto - antic;
        const sMoneda = usd ? 4 : 3; // 4=USD format, 3=CLP format
        rowsXml+=`<row r="${currentRow}" ht="18" customHeight="1">`;
        rowsXml+=`<c r="A${currentRow}" t="inlineStr" s="${sBase}"><is><t>${escXml(it.tipoDoc||"—")}</t></is></c>`;
        rowsXml+=`<c r="B${currentRow}" t="inlineStr" s="${sBase}"><is><t>${escXml(it.proveedor||"—")}</t></is></c>`;
        rowsXml+=`<c r="C${currentRow}" t="inlineStr" s="${sBase}"><is><t>${escXml(it.rut||"—")}</t></is></c>`;
        rowsXml+=`<c r="D${currentRow}" t="inlineStr" s="${sBase}"><is><t>${escXml(it.nDoc||"—")}</t></is></c>`;
        rowsXml+=`<c r="E${currentRow}" t="inlineStr" s="${sBase}"><is><t>${escXml(it.fDoc||"—")}</t></is></c>`;
        rowsXml+=`<c r="F${currentRow}" t="inlineStr" s="${sBase}"><is><t>${escXml(it.fVenc||"—")}</t></is></c>`;
        rowsXml+=`<c r="G${currentRow}" t="inlineStr" s="${sBase}"><is><t>${it.semVenc?`S${it.semVenc}`:"—"}</t></is></c>`;
        rowsXml+=`<c r="H${currentRow}" t="inlineStr" s="${sBase}"><is><t>${escXml(it.concepto||"—")}</t></is></c>`;
        rowsXml+=clp?`<c r="I${currentRow}" s="3"><v>${clp}</v></c>`:`<c r="I${currentRow}" t="inlineStr" s="${sBase}"><is><t>—</t></is></c>`;
        rowsXml+=usd?`<c r="J${currentRow}" s="4"><v>${usd}</v></c>`:`<c r="J${currentRow}" t="inlineStr" s="${sBase}"><is><t>—</t></is></c>`;
        rowsXml+=antic?`<c r="K${currentRow}" s="${sMoneda}"><v>${antic}</v></c>`:`<c r="K${currentRow}" t="inlineStr" s="${sBase}"><is><t>—</t></is></c>`;
        rowsXml+=saldo?`<c r="L${currentRow}" s="${sMoneda}"><v>${saldo}</v></c>`:`<c r="L${currentRow}" t="inlineStr" s="${sBase}"><is><t>—</t></is></c>`;
        rowsXml+=`<c r="M${currentRow}" t="inlineStr" s="${sBase}"><is><t>${escXml(it.comentario||"")}</t></is></c>`;
        rowsXml+=`<c r="N${currentRow}" t="inlineStr" s="${sBase}"><is><t>${it.pagado?"✓":"—"}</t></is></c>`;
        rowsXml+=`</row>`;
        currentRow++;
      });
      // Subtotal sección — separar anticipos por moneda
      const stCLP=secItems.reduce((s,it)=>s+(Number(it.montoCLP)||0),0);
      const stUSD=secItems.reduce((s,it)=>s+(Number(it.montoUSD)||0),0);
      const stAnticCLP=secItems.reduce((s,it)=>{
        if(Number(it.montoCLP)&&!Number(it.montoUSD)) return s+(Number(it.anticipo)||0); return s;
      },0);
      const stAnticUSD=secItems.reduce((s,it)=>{
        if(Number(it.montoUSD)) return s+(Number(it.anticipo)||0); return s;
      },0);
      grandTotalCLP+=stCLP; grandTotalUSD+=stUSD;
      rowsXml+=`<row r="${currentRow}" ht="18" customHeight="1">`;
      for(let c=0;c<8;c++) rowsXml+=`<c r="${colLetter(c)}${currentRow}" s="8"/>`;
      rowsXml+=stCLP?`<c r="I${currentRow}" s="9"><v>${stCLP}</v></c>`:`<c r="I${currentRow}" s="8"/>`;
      rowsXml+=stUSD?`<c r="J${currentRow}" s="10"><v>${stUSD}</v></c>`:`<c r="J${currentRow}" s="8"/>`;
      // Anticipo subtotal: CLP format si solo CLP, USD si solo USD, o separado
      const stAnticTot=stAnticCLP+stAnticUSD;
      rowsXml+=stAnticTot?`<c r="K${currentRow}" s="${stUSD?10:9}"><v>${stAnticTot}</v></c>`:`<c r="K${currentRow}" s="8"/>`;
      const stSaldoCLP=stCLP-stAnticCLP;
      const stSaldoUSD=stUSD-stAnticUSD;
      const stSaldoTot=stSaldoCLP+stSaldoUSD;
      rowsXml+=stSaldoTot?`<c r="L${currentRow}" s="${stUSD?10:9}"><v>${stUSD?stSaldoUSD:stSaldoCLP}</v></c>`:`<c r="L${currentRow}" s="8"/>`;
      rowsXml+=`<c r="M${currentRow}" s="8"/><c r="N${currentRow}" s="8"/>`;
      rowsXml+=`</row>`;
      currentRow++;
    });
    // Total general - separar anticipos por moneda (solo items con sección válida)
    const _seccionesValExp = new Set([...SECCIONES,...(nom.seccionesExtra||[])].map(s=>s.id));
    const _itemsValExp = nom.items.filter(it=>_seccionesValExp.has(it.seccion) && lineaActiva(it));
    const grandAnticCLP = _itemsValExp.reduce((s,it)=>{
      if(Number(it.montoCLP) && !Number(it.montoUSD)) return s+(Number(it.anticipo)||0);
      return s;
    },0);
    const grandAnticUSD = _itemsValExp.reduce((s,it)=>{
      if(Number(it.montoUSD)) return s+(Number(it.anticipo)||0);
      return s;
    },0);
    const grandSaldoCLP = grandTotalCLP - grandAnticCLP;
    const grandSaldoUSD = grandTotalUSD - grandAnticUSD;
    rowsXml+=`<row r="${currentRow}" ht="22" customHeight="1">`;
    for(let c=0;c<8;c++) rowsXml+=`<c r="${colLetter(c)}${currentRow}" s="11"/>`;
    rowsXml+=`<c r="I${currentRow}" s="12"><v>${grandTotalCLP}</v></c>`;
    rowsXml+=`<c r="J${currentRow}" s="13"><v>${grandTotalUSD}</v></c>`;
    rowsXml+=grandAnticCLP?`<c r="K${currentRow}" s="12"><v>${grandAnticCLP}</v></c>`:(grandAnticUSD?`<c r="K${currentRow}" s="13"><v>${grandAnticUSD}</v></c>`:`<c r="K${currentRow}" s="11"/>`);
    rowsXml+=grandSaldoCLP?`<c r="L${currentRow}" s="12"><v>${grandSaldoCLP}</v></c>`:(grandSaldoUSD?`<c r="L${currentRow}" s="13"><v>${grandSaldoUSD}</v></c>`:`<c r="L${currentRow}" s="11"/>`);
    rowsXml+=`<c r="M${currentRow}" s="11"/><c r="N${currentRow}" s="11"/>`;
    rowsXml+=`</row>`;

    const tableRef=`A${headerRow}:${lastCol}${currentRow}`;
    const mergesXml=`<mergeCells count="${merges.length}">${merges.map(m=>`<mergeCell ref="${m}"/>`).join("")}</mergeCells>`;

    const stylesXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2">
    <numFmt numFmtId="164" formatCode='"$" #,##0'/>
    <numFmt numFmtId="165" formatCode='"US$" #,##0.00'/>
  </numFmts>
  <fonts count="8">
    <font><sz val="10"/><name val="Calibri"/></font>
    <font><sz val="10"/><b/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><sz val="10"/><name val="Calibri"/></font>
    <font><sz val="10"/><b/><color rgb="FF15803D"/><name val="Calibri"/></font>
    <font><sz val="10"/><color rgb="FF1D4ED8"/><name val="Calibri"/></font>
    <font><sz val="16"/><b/><color rgb="FF0F2D4A"/><name val="Calibri"/></font>
    <font><sz val="10"/><i/><color rgb="FF64748B"/><name val="Calibri"/></font>
    <font><sz val="10"/><b/><name val="Calibri"/></font>
  </fonts>
  <fills count="6">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F2D4A"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1E293B"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFE2E8F0"/></left><right style="thin"><color rgb="FFE2E8F0"/></right><top style="thin"><color rgb="FFE2E8F0"/></top><bottom style="thin"><color rgb="FFE2E8F0"/></bottom></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="14">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0"><alignment vertical="center"/></xf>
    <xf numFmtId="164" fontId="3" fillId="0" borderId="1" xfId="0"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="165" fontId="4" fillId="0" borderId="1" xfId="0"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0"><alignment horizontal="left" vertical="center" indent="1"/></xf>
    <xf numFmtId="0" fontId="6" fillId="0" borderId="0" xfId="0"><alignment horizontal="left" vertical="center" indent="1"/></xf>
    <xf numFmtId="0" fontId="7" fillId="3" borderId="1" xfId="0"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="7" fillId="4" borderId="1" xfId="0"><alignment vertical="center"/></xf>
    <xf numFmtId="164" fontId="7" fillId="4" borderId="1" xfId="0"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="165" fontId="7" fillId="4" borderId="1" xfId="0"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="5" borderId="1" xfId="0"><alignment vertical="center"/></xf>
    <xf numFmtId="164" fontId="1" fillId="5" borderId="1" xfId="0"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="165" fontId="1" fillId="5" borderId="1" xfId="0"><alignment horizontal="right" vertical="center"/></xf>
  </cellXfs>
</styleSheet>`;

    const colWidths=[18,28,12,12,16,16,10];
    const colsXml=`<cols>${colWidths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join("")}</cols>`;

    const sheetXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow+1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  ${colsXml}
  <sheetData>${rowsXml}</sheetData>
  ${mergesXml}
</worksheet>`;

    const wbXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView/></bookViews>
  <sheets><sheet name="${escXml(nombreFormal.slice(0,31))}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
    const wbRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
    const contentTypes=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
    const pkgRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

    const zip=new window.JSZip();
    zip.file("[Content_Types].xml",contentTypes);
    zip.file("_rels/.rels",pkgRels);
    zip.file("xl/workbook.xml",wbXml);
    zip.file("xl/_rels/workbook.xml.rels",wbRels);
    zip.file("xl/worksheets/sheet1.xml",sheetXml);
    zip.file("xl/styles.xml",stylesXml);

    const blob=await zip.generateAsync({type:"blob"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download=`${nombreFormal.replace(/\s/g,"_")}_${nom.año}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    window.auditLog&&window.auditLog("exportar",{modulo:"finanzas",seccion:"nóminas",
      descripcion:`Exportó ${nombreFormal} a Excel`,registroId:nom.id});
  }

  function avanzarEstado() {
    const flujo = ["borrador","preparada","revision","aprobada1","aprobada"];
    const idx = flujo.indexOf(nom.estado);
    if(idx >= flujo.length-1) return;
    const next = flujo[idx+1];
    // Fase 4: bloquear el avance si faltan respaldos obligatorios.
    if(VALIDACION_RESPALDO.activo && next===VALIDACION_RESPALDO.estadoQueExige){
      const faltan = lineasSinRespaldoObligatorio(nom);
      if(faltan.length){
        alert(`No se puede enviar a revisión: ${faltan.length} línea(s) sin respaldo documental.\n\n`+
          faltan.map(it=>`• ${it.proveedor||it.concepto||it.tipoDoc||"(sin nombre)"}`).join("\n")+
          `\n\nAdjunta el documento (o genera el documento interno en líneas de empresas relacionadas) antes de avanzar.`);
        return;
      }
    }
    const ahora = new Date().toISOString().slice(0,10);
    let patch = {estado: next};
    if(next==="preparada")  patch.preparadoPor  = usuario?.nombre||"";
    if(next==="revision") {
      patch.revisadoPor = usuario?.nombre||"";
      // Milagros/Pablo seleccionan a quién enviar (Carol o Michelle)
      const revisor = window.prompt("¿A quién enviar para revisión?\n\n1 = Carol Machuca\n2 = Michelle Garcia\n\nIngrese 1 o 2:");
      if(!revisor || !["1","2"].includes(revisor.trim())) { alert("Operación cancelada"); return; }
      const esCarol = revisor.trim() === "1";
      const destEmail = esCarol ? "cmachuca@grupomediterra.cl" : "mgarcia@grupomediterra.cl";
      const destNombre = esCarol ? "Carol Machuca" : "Michelle Garcia";
      patch.revisorAsignado = destNombre;
      if(window._enviarNotificacion) {
        const notifMsg = `${usuario?.nombre||"Un usuario"} ha enviado a revisión la ${nombreFormal} (${nom.empresa}).\n\nPor favor ingresa al sistema para revisar y dar tu V°B°.\n\nhttps://gestion-grupo-mediterra.vercel.app`;
        window._enviarNotificacion(destEmail, destNombre,
          `📋 Nómina pendiente de revisión — ${nom.empresa} S${nom.semana}`, notifMsg).catch(()=>{});
      }
    }
    if(next==="aprobada1") {
      patch.aprobado1Por = usuario?.nombre||"";
      patch.fechaAprobacion1 = ahora;
      // Carol/Michelle envían a CFO para aprobación final
      if(window._enviarNotificacion) {
        const notifMsg = `${usuario?.nombre||"Un autorizador"} ha dado V°B° a la ${nombreFormal} (${nom.empresa}).\n\nEstá lista para tu aprobación final.\n\nhttps://gestion-grupo-mediterra.vercel.app`;
        window._enviarNotificacion("ahuerta@grupomediterra.cl","Angelo Huerta",
          `✅ Nómina lista para aprobación CFO — ${nom.empresa} S${nom.semana}`, notifMsg).catch(()=>{});
      }
    }
    if(next==="aprobada") {
      patch.aprobadoPor = usuario?.nombre||"";
      patch.fechaAprobacion = ahora;
      // CFO aprueba → notificar a Carol y Milagros
      if(window._enviarNotificacion) {
        const notifMsg = `${usuario?.nombre||"CFO"} ha aprobado la ${nombreFormal} (${nom.empresa}).\n\nLa nómina está lista para cargar a banco.\n\nhttps://gestion-grupo-mediterra.vercel.app`;
        window._enviarNotificacion("cmachuca@grupomediterra.cl","Carol Machuca",
          `🏆 Nómina APROBADA — ${nom.empresa} S${nom.semana}`, notifMsg).catch(()=>{});
        window._enviarNotificacion("Mbecerra@grupomediterra.cl","Milagros Becerra",
          `🏆 Nómina APROBADA — ${nom.empresa} S${nom.semana}`, notifMsg).catch(()=>{});
      }
    }
    // Trazabilidad (Fase 2): historial de la nómina + log de auditoría central.
    patch.historial = [...(nom.historial||[]), entradaHistorialNom("avance", usuario, {estadoDesde: nom.estado, estadoHacia: next})];
    window.auditLog && window.auditLog("editar", {modulo:"finanzas", seccion:"nóminas",
      descripcion:`${nombreFormal}: ${nom.estado} → ${next}`, registroId:nom.id,
      campo:"estado", valorAnterior:nom.estado, valorNuevo:next});
    onUpdate({...nom,...patch});
  }

  function retrocederEstado() {
    const flujo = ["borrador","preparada","revision","aprobada1","aprobada"];
    const idx = flujo.indexOf(nom.estado);
    if(idx <= 0) return;
    const comentario = window.prompt("Motivo de la devolución (obligatorio):");
    if(!comentario || !comentario.trim()) { alert("Debe ingresar un motivo para devolver la nómina."); return; }
    const prev = flujo[idx-1];
    const patch = {estado: prev, ultimaDevolucion: {por: usuario?.nombre||"", fecha: new Date().toISOString(), motivo: comentario.trim(), desdeEstado: nom.estado}};
    // Trazabilidad (Fase 2): historial de la nómina + log de auditoría central.
    patch.historial = [...(nom.historial||[]), entradaHistorialNom("devolucion", usuario, {estadoDesde: nom.estado, estadoHacia: prev, motivo: comentario.trim()})];
    window.auditLog && window.auditLog("editar", {modulo:"finanzas", seccion:"nóminas",
      descripcion:`${nombreFormal}: devuelta ${nom.estado} → ${prev}. Motivo: ${comentario.trim()}`, registroId:nom.id,
      campo:"estado", valorAnterior:nom.estado, valorNuevo:prev});

    // Notificaciones según quién devuelve
    if(window._enviarNotificacion) {
      const motivoTxt = `Motivo: ${comentario.trim()}`;
      
      if(nom.estado === "revision" || nom.estado === "aprobada1") {
        // Carol/Michelle devuelven a Milagros/Pablo (preparador original)
        const preparador = nom.preparadoPor || "el preparador";
        const notifMsg = `${usuario?.nombre} ha devuelto la ${nombreFormal} (${nom.empresa}) con comentarios.\n\n${motivoTxt}\n\nPor favor revisa y corrige.\n\nhttps://gestion-grupo-mediterra.vercel.app`;
        // Notificar a Milagros y Pablo
        window._enviarNotificacion("Mbecerra@grupomediterra.cl","Milagros Becerra",
          `🔄 Nómina devuelta — ${nom.empresa} S${nom.semana}`, notifMsg).catch(()=>{});
        window._enviarNotificacion("pduran@grupomediterra.cl","Pablo Duran",
          `🔄 Nómina devuelta — ${nom.empresa} S${nom.semana}`, notifMsg).catch(()=>{});
      }
      
      if(nom.estado === "aprobada" || nom.estado === "aprobada1") {
        // CFO devuelve → notificar a Carol/Michelle + CC Milagros
        if(esAdmin) {
          const notifMsg = `${usuario?.nombre} (CFO) ha devuelto la ${nombreFormal} (${nom.empresa}) con comentarios.\n\n${motivoTxt}\n\nPor favor revisa y corrige.\n\nhttps://gestion-grupo-mediterra.vercel.app`;
          window._enviarNotificacion("cmachuca@grupomediterra.cl","Carol Machuca",
            `🔄 Nómina devuelta por CFO — ${nom.empresa} S${nom.semana}`, notifMsg).catch(()=>{});
          window._enviarNotificacion("mgarcia@grupomediterra.cl","Michelle Garcia",
            `🔄 Nómina devuelta por CFO — ${nom.empresa} S${nom.semana}`, notifMsg).catch(()=>{});
          window._enviarNotificacion("Mbecerra@grupomediterra.cl","Milagros Becerra",
            `🔄 Nómina devuelta por CFO — ${nom.empresa} S${nom.semana}`, notifMsg).catch(()=>{});
        }
      }
    }
    onUpdate({...nom,...patch});
  }

  // Totales
  // Solo sumar items que pertenecen a secciones válidas (evita items fantasma)
  const seccionesValidas = new Set([...SECCIONES,...(nom.seccionesExtra||[])].map(s=>s.id));
  const itemsValidos = nom.items.filter(it=>seccionesValidas.has(it.seccion) && lineaActiva(it));
  const totCLP = itemsValidos.reduce((s,it)=>s+(Number(it.montoCLP)||0),0);
  const totUSD = itemsValidos.reduce((s,it)=>s+(Number(it.montoUSD)||0),0);
  const totPEN = itemsValidos.reduce((s,it)=>s+(Number(it.montoPEN)||0),0);
  const nomEsPeruana = esEmpresaPeruanaNom(nom.empresa);
  // Descontar anticipos para mostrar el neto real a pagar
  const totAnticipoCLP = itemsValidos.reduce((s,it)=>{
    if(Number(it.montoCLP) && !Number(it.montoUSD)) return s+(Number(it.anticipo)||0);
    return s;
  },0);
  const totAnticipoUSD = itemsValidos.reduce((s,it)=>{
    if(Number(it.montoUSD)) return s+(Number(it.anticipo)||0);
    return s;
  },0);
  const totAnticipoPEN = itemsValidos.reduce((s,it)=>{
    if(Number(it.montoPEN) && !Number(it.montoUSD)) return s+(Number(it.anticipo)||0);
    return s;
  },0);
  const netoCLP = totCLP - totAnticipoCLP;
  const netoUSD = totUSD - totAnticipoUSD;
  const netoPEN = totPEN - totAnticipoPEN;

  // Saldo bancos: tomar de saldosBancos reales (pestaña Saldos Bancos) para esta empresa
  const {totBancosCLP, totBancosUSD, totBancosPEN} = React.useMemo(()=>{
    if(!saldosBancos) return {totBancosCLP:0, totBancosUSD:0, totBancosPEN:0};
    const bancosChile = ["BCI","BICE","Security","Chile","Santander"];
    const bancosPeruana = ["Scotiabank Perú","BBVA Perú"];
    const esPeruana = nom.empresa.includes("Perú");
    const bancosList = esPeruana ? bancosPeruana : bancosChile;
    let clp=0, usd=0, penTot=0;
    bancosList.forEach(banco=>{
      clp += Number(saldosBancos[`${nom.empresa}||${banco}||clp`]?.monto)||0;
      usd += Number(saldosBancos[`${nom.empresa}||${banco}||usd`]?.monto)||0;
      const pen = Number(saldosBancos[`${nom.empresa}||${banco}||pen`]?.monto)||0;
      // Empresa peruana: PEN va a su propia línea; chilena: se mantiene el comportamiento previo (suma a CLP).
      if(esPeruana) penTot += pen; else clp += pen;
    });
    return {totBancosCLP:clp, totBancosUSD:usd, totBancosPEN:penTot};
  },[saldosBancos, nom.empresa]);

  // ── Lógica de autorización ──────────────────────────────
  // Flujo: borrador → preparada → revision → aprobada1 (V°B°) → aprobada (CFO/CEO)
  // Reglas estrictas:
  //   - Cualquier editor puede: borrador → preparada → revision
  //   - SOLO Carol o Michelle pueden: revision → aprobada1 (V°B°)
  //   - SOLO CFO/CEO (admin) puede: aprobada1 → aprobada
  const AUTORIZADORES = ["Carol Machuca","Michelle Garcia"];
  const esAutorizadorNom = AUTORIZADORES.includes(usuario?.nombre);
  const esAdmin = usuario?.rol === "admin";

  const puedeAvanzar = (() => {
    // La capacidad de AVANZAR ESTADO es independiente de editActivo
    // (Carol puede dar V°B° aunque no pueda editar items)
    if(soloVer) return false;
    if(!canEdit) return false;
    if(nom.estado === "aprobada") return false;
    if(nom.estado === "borrador" || nom.estado === "preparada") return true; // cualquier editor
    if(nom.estado === "revision") return esAutorizadorNom; // SOLO Carol o Michelle
    if(nom.estado === "aprobada1") return esAdmin; // SOLO CFO/CEO
    return false;
  })();

  // Texto del botón de avanzar según estado
  const textoAvanzar = (() => {
    if(nom.estado === "borrador") return "📋 Marcar Preparada";
    if(nom.estado === "preparada") return "📤 Enviar a Revisión";
    if(nom.estado === "revision") return "✅ Dar V°B° y enviar a CFO";
    if(nom.estado === "aprobada1") return "🏆 Aprobar (CFO)";
    return "→";
  })();

  // Texto del botón retroceder según estado
  const textoRetroceder = (() => {
    if(nom.estado === "revision") return "🔄 Devolver con comentarios";
    if(nom.estado === "aprobada1") return "🔄 Devolver con comentarios";
    return "← Retroceder";
  })();

  // Quién puede retroceder
  const puedeRetroceder = (() => {
    if(nom.estado === "borrador") return false;
    if(nom.estado === "aprobada") return esAdmin;
    if(nom.estado === "aprobada1") return esAdmin; // CFO devuelve
    if(nom.estado === "revision") return esAutorizadorNom; // Carol/Michelle devuelven
    if(nom.estado === "preparada") return true; // cualquier editor
    return esAdmin;
  })();

  // Mensaje de bloqueo
  const mensajeBloqueo = (() => {
    if(nom.estado === "revision" && !esAutorizadorNom)
      return "⏳ Esperando V°B° de Carol Machuca o Michelle Garcia";
    if(nom.estado === "aprobada1" && !esAdmin)
      return "⏳ Esperando aprobación del CFO";
    return null;
  })();

  const estadoInfo = ESTADOS_FLUJO.find(e=>e.id===nom.estado)||ESTADOS_FLUJO[0];

  return (
    <div style={{fontFamily:"sans-serif",background:C.bg,minHeight:"100vh",color:C.text}}>
      {/* Header */}
      <div className="no-print" style={{background:C.bg2,borderBottom:`1px solid ${C.border}`,padding:"12px 20px",
        display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <button onClick={onBack}
          style={{background:C.card2,border:`1px solid ${C.border}`,color:C.muted,
            borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:12}}>
          ← Volver
        </button>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <span style={{fontWeight:800,fontSize:15,color:C.text}}>
              {nombreFormal}
            </span>
            {onSwitchNomina&&(
              <select value={nom.id}
                onChange={e=>{
                  const val=e.target.value;
                  if(nominasHermanas.find(nh=>nh.id===val)){
                    onSwitchNomina(val);
                  } else if(val.startsWith("_crear_") && onCrearYAbrir && canEdit) {
                    onCrearYAbrir(val.replace("_crear_",""));
                  }
                }}
                style={{padding:"5px 10px",borderRadius:8,border:`1px solid ${C.border}`,
                  background:C.card2,color:C.text,fontSize:12,fontWeight:600,outline:"none",cursor:"pointer"}}>
                {nominasHermanas.map(nh=>(
                  <option key={nh.id} value={nh.id}>{nh.empresa}{nh.numero>1?` N°${nh.numero}`:""}</option>
                ))}
                {canEdit && onCrearYAbrir && EMPRESAS_NOM
                  .filter(emp=>!nominasHermanas.find(nh=>nh.empresa===emp))
                  .map(emp=>(
                    <option key={`_crear_${emp}`} value={`_crear_${emp}`}>+ {emp} (crear)</option>
                  ))
                }
              </select>
            )}
          </div>
          <div style={{fontSize:11,color:C.muted}}>
            Semana {nom.semana} · {nom.año} · {nom.fecha}
          </div>
        </div>
        <BadgeEstado estado={nom.estado}/>
        {/* Solo Ver / Editar toggle */}
        <button onClick={()=>setSoloVer(!soloVer)}
          style={{background:soloVer?"#3b82f6":"transparent",border:`1px solid ${soloVer?"#3b82f6":C.border}`,
            color:soloVer?"#fff":C.muted,borderRadius:8,padding:"6px 12px",cursor:"pointer",
            fontSize:11,fontWeight:600}}>
          {soloVer?"👁 Solo ver":"✏️ Editar"}
        </button>
        {/* Mensaje de bloqueo si no puede avanzar */}
        {mensajeBloqueo&&!puedeAvanzar&&(
          <span style={{fontSize:10,color:"#f59e0b",background:"#fef3c7",padding:"5px 12px",
            borderRadius:8,fontWeight:600,border:"1px solid #fde68a"}}>
            {mensajeBloqueo}
          </span>
        )}
        {puedeAvanzar&&(
          <button onClick={avanzarEstado}
            style={{background:nom.estado==="aprobada1"?"#16a34a":"#3b82f6",border:"none",color:"#fff",borderRadius:8,
              padding:"7px 16px",cursor:"pointer",fontWeight:700,fontSize:12}}>
            {textoAvanzar}
          </button>
        )}
        {nom.estado!=="borrador"&&puedeRetroceder&&!soloVer&&(
          <button onClick={retrocederEstado}
            style={{background:"#fef3c7",border:`1px solid #fde68a`,color:"#92400e",
              borderRadius:8,padding:"7px 12px",cursor:"pointer",fontSize:11,fontWeight:600}}>
            {textoRetroceder}
          </button>
        )}
        {/* + Nueva nómina misma empresa/semana */}
        {canEdit&&onCrearNueva&&(
          <button onClick={()=>onCrearNueva(nom.empresa, nom.semana, nom.año)}
            style={{background:"#0f766e",border:"none",color:"#fff",borderRadius:8,
              padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>
            + Nueva Nómina
          </button>
        )}
        <button onClick={exportarExcelNomina}
          style={{background:"transparent",border:`1px solid ${C.border}`,color:C.muted,
            borderRadius:8,padding:"7px 12px",cursor:"pointer",fontSize:11}}>
          📥 Excel
        </button>
        <button onClick={()=>{window.print();}}
          style={{background:"transparent",border:`1px solid ${C.border}`,color:C.muted,
            borderRadius:8,padding:"7px 12px",cursor:"pointer",fontSize:11}}>
          🖨️ Imprimir
        </button>
        <button onClick={()=>setShowAudit(true)}
          style={{background:"transparent",border:`1px solid ${C.border}`,color:C.muted,
            borderRadius:8,padding:"7px 12px",cursor:"pointer",fontSize:11}}>
          🔍 Auditoría
        </button>
        <button onClick={expedientePDF} disabled={genPdf}
          style={{background:genPdf?"transparent":`${C.blue}1a`,border:`1px solid ${C.blue}`,color:C.blue,
            borderRadius:8,padding:"7px 12px",cursor:genPdf?"wait":"pointer",fontSize:11,fontWeight:700}}>
          {genPdf?"📄 Generando…":"📄 Expediente PDF"}
        </button>
        <button onClick={descargarExpediente} disabled={descExpediente}
          style={{background:"transparent",border:`1px solid ${C.border}`,color:C.muted,
            borderRadius:8,padding:"7px 12px",cursor:descExpediente?"wait":"pointer",fontSize:11}}>
          {descExpediente?"⬇ Generando…":"⬇ Expediente ZIP"}
        </button>
      </div>

      {/* Banner nómina bloqueada */}
      {estadoBloqueado&&(
        <div className="no-print" style={{background:nom.estado==="aprobada"?"#dcfce7":"#ede9fe",
          border:`1px solid ${nom.estado==="aprobada"?"#86efac":"#c4b5fd"}`,
          padding:"8px 16px",margin:"0 20px",borderRadius:8,
          display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:18}}>{nom.estado==="aprobada"?"🔒":"✅"}</span>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:nom.estado==="aprobada"?"#166534":"#6d28d9"}}>
              {nom.estado==="aprobada"?"Nómina aprobada — No editable":"Nómina con V°B° — Pendiente aprobación CFO"}
            </div>
            <div style={{fontSize:10,color:"#64748b"}}>
              {nom.estado==="aprobada"
                ? `Aprobada por ${nom.aprobadoPor||"—"} el ${nom.fechaAprobacion||"—"}. El contenido no puede ser modificado.`
                : `V°B° por ${nom.aprobado1Por||"—"} el ${nom.fechaAprobacion1||"—"}. Solo el CFO puede aprobar o retroceder.`}
            </div>
          </div>
        </div>
      )}
      {/* Banner de devolución */}
      {nom.ultimaDevolucion&&!estadoBloqueado&&(
        <div className="no-print" style={{background:"#fef3c7",border:"1px solid #fde68a",
          padding:"8px 16px",margin:"0 20px",borderRadius:8,
          display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:18}}>🔄</span>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:"#92400e"}}>
              Nómina devuelta por {nom.ultimaDevolucion.por}
            </div>
            <div style={{fontSize:10,color:"#78716c"}}>
              {nom.ultimaDevolucion.fecha?.slice(0,10)} — Motivo: {nom.ultimaDevolucion.motivo}
            </div>
          </div>
        </div>
      )}

      <div id="nomina-print-area" style={{padding:"20px 24px",maxWidth:1400,margin:"0 auto"}}>
        {/* ═══ Contenido interactivo — solo pantalla, oculto al imprimir ═══ */}
        <div className="screen-only">
        {/* Info header — versión compacta para impresión */}
        <div className="nomina-info-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:20}}>
          <div style={{background:C.card2,borderRadius:10,padding:"12px 16px",border:`1px solid ${C.border}`}}>
            <div className="info-label" style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:6}}>INFORMACIÓN NÓMINA</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div>
                <div className="info-label" style={{fontSize:10,color:C.muted}}>Empresa</div>
                <div className="info-value" style={{fontWeight:700,fontSize:13}}>{nom.empresa}</div>
              </div>
              <div>
                <div className="info-label" style={{fontSize:10,color:C.muted}}>Semana / Año</div>
                <div className="info-value" style={{fontWeight:700,fontSize:13}}>S{nom.semana} / {nom.año}</div>
              </div>
              <div>
                <div className="info-label" style={{fontSize:10,color:C.muted}}>Fecha</div>
                {canEdit
                  ? <input type="date" value={nom.fecha} onChange={e=>upd("fecha",e.target.value)}
                      className="no-print"
                      style={{padding:"3px 6px",borderRadius:5,border:`1px solid ${C.border}`,
                        background:C.card,color:C.text,fontSize:12,outline:"none"}}/>
                  : null}
                <div className="info-value" style={{fontSize:12}}>{nom.fecha}</div>
              </div>
              <div>
                <div className="info-label" style={{fontSize:10,color:C.muted}}>T.C (CLP/USD)</div>
                {canEdit
                  ? <input type="number" value={nom.tc||""} onChange={e=>upd("tc",Number(e.target.value))}
                      placeholder="886.97" className="no-print"
                      style={{padding:"3px 6px",borderRadius:5,border:`1px solid ${C.border}`,
                        background:C.card,color:C.text,fontSize:12,outline:"none",width:90}}/>
                  : null}
                <div className="info-value" style={{fontSize:12}}>{nom.tc?nom.tc.toLocaleString("es-CL"):"—"}</div>
              </div>
            </div>
          </div>

          {/* Totales — visible en impresión */}
          <div style={{background:C.card2,borderRadius:10,padding:"12px 16px",border:`1px solid ${C.border}`}}>
            <div className="info-label" style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:8}}>TOTALES NÓMINA</div>
            {!nomEsPeruana&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{color:C.muted,fontSize:12}}>Total CLP</span>
              <span className="info-value" style={{fontWeight:800,fontSize:14,color:C.yellow}}>{netoCLP?$$clp(netoCLP):"—"}</span>
            </div>}
            {!nomEsPeruana&&totAnticipoCLP>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{color:C.muted,fontSize:10}}>  (Bruto: {$$clp(totCLP)} - Anticipo: {$$clp(totAnticipoCLP)})</span>
            </div>}
            {nomEsPeruana&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{color:C.muted,fontSize:12}}>Total PEN</span>
              <span className="info-value" style={{fontWeight:800,fontSize:14,color:"#f97316"}}>{netoPEN?$$pen(netoPEN):"—"}</span>
            </div>}
            {nomEsPeruana&&totAnticipoPEN>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{color:C.muted,fontSize:10}}>  (Bruto: {$$pen(totPEN)} - Anticipo: {$$pen(totAnticipoPEN)})</span>
            </div>}
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <span style={{color:C.muted,fontSize:12}}>Total USD</span>
              <span className="info-value" style={{fontWeight:800,fontSize:14,color:C.blue}}>{netoUSD?$$usd(netoUSD):"—"}</span>
            </div>
            {totAnticipoUSD>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{color:C.muted,fontSize:10}}>  (Bruto: {$$usd(totUSD)} - Anticipo: {$$usd(totAnticipoUSD)})</span>
            </div>}
            {/* Saldo bancos: solo pantalla, no impresión */}
            <div className="nomina-kpis-header" style={{borderTop:`1px solid ${C.border}`,paddingTop:8,marginTop:4}}>
              <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:4}}>SALDO BANCOS</div>
              {!nomEsPeruana&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                <span style={{color:C.muted,fontSize:11}}>CLP</span>
                <span style={{fontWeight:700,fontSize:12,color:C.yellow}}>{totBancosCLP?$$clp(totBancosCLP):"—"}</span>
              </div>}
              {nomEsPeruana&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                <span style={{color:C.muted,fontSize:11}}>PEN</span>
                <span style={{fontWeight:700,fontSize:12,color:"#f97316"}}>{totBancosPEN?$$pen(totBancosPEN):"—"}</span>
              </div>}
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{color:C.muted,fontSize:11}}>USD</span>
                <span style={{fontWeight:700,fontSize:12,color:C.blue}}>{totBancosUSD?$$usd(totBancosUSD):"—"}</span>
              </div>
            </div>
          </div>

          {/* Autorización */}
          <div style={{background:C.card2,borderRadius:10,padding:"12px 16px",border:`1px solid ${C.border}`}}>
            <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:8}}>AUTORIZACIÓN</div>
            {[
              {label:"Preparada por",  field:"preparadoPor",  icon:"📝"},
              {label:"Revisada por",   field:"revisadoPor",   icon:"🔍"},
              {label:"V°B° Aprobador", field:"aprobado1Por",  icon:"✅", fecha:"fechaAprobacion1"},
              {label:"Aprobado CFO",   field:"aprobadoPor",   icon:"🏆", fecha:"fechaAprobacion"},
            ].map(({label,field,icon,fecha})=>(
              <div key={field} style={{marginBottom:6}}>
                <div style={{fontSize:10,color:C.muted}}>{icon} {label}</div>
                <div style={{fontWeight:600,fontSize:12,color:nom[field]?C.green:C.muted2}}>
                  {nom[field]||"Pendiente"}
                  {fecha&&nom[fecha]&&
                    <span style={{fontSize:10,color:C.muted,marginLeft:6}}>{nom[fecha]}</span>}
                </div>
              </div>
            ))}
            {nom.notas!==undefined&&(
              <div style={{marginTop:8}}>
                <div style={{fontSize:10,color:C.muted,marginBottom:3}}>Notas</div>
                {canEdit
                  ? <textarea value={nom.notas||""} onChange={e=>upd("notas",e.target.value)}
                      rows={2} placeholder="Observaciones..."
                      style={{width:"100%",padding:"5px 7px",borderRadius:6,border:`1px solid ${C.border}`,
                        background:C.card,color:C.text,fontSize:11,outline:"none",
                        resize:"vertical",boxSizing:"border-box"}}/>
                  : <div style={{fontSize:11,color:C.muted,fontStyle:"italic"}}>{nom.notas||"Sin notas"}</div>}
              </div>
            )}
          </div>
        </div>

        {/* Panel bancos */}
        <div style={{marginBottom:20}}>
          <PanelBancosNomina empresa={nom.empresa} saldosBancos={saldosBancos}/>
        </div>

        {/* Cobertura documental (Expediente Digital — Fase 1) */}
        {(()=>{
          const cob = coberturaNomina(nom);
          const colPct = cob.pct>=100?C.green:cob.pct>=60?C.yellow:"#ef4444";
          return (
            <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap",
              background:C.card2,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 16px",marginBottom:20}}>
              <div style={{fontSize:11,fontWeight:700,color:C.muted}}>📑 RESPALDO DOCUMENTAL</div>
              <div style={{fontSize:12,color:C.green,fontWeight:700}}>🟢 {cob.conRespaldo} con respaldo</div>
              <div style={{fontSize:12,color:"#ef4444",fontWeight:700}}>🔴 {cob.sinRespaldo} sin respaldo</div>
              <div style={{flex:1,minWidth:120,height:8,background:`${C.border}66`,borderRadius:6,overflow:"hidden"}}>
                <div style={{width:`${cob.pct}%`,height:"100%",background:colPct}}/>
              </div>
              <div style={{fontSize:13,fontWeight:800,color:colPct}}>{cob.pct}% cobertura</div>
            </div>
          );
        })()}

        {/* Historial de la nómina (Expediente Digital — Fase 2) */}
        {(nom.historial||[]).length>0&&(
          <details className="no-print" style={{marginBottom:20}}>
            <summary style={{cursor:"pointer",fontSize:12,fontWeight:700,color:C.muted}}>🕘 Historial de la nómina ({(nom.historial||[]).length})</summary>
            <div style={{marginTop:8,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
              {(nom.historial||[]).slice().reverse().map((h,i)=>(
                <div key={i} style={{display:"flex",gap:10,padding:"6px 10px",borderBottom:`1px solid ${C.border}22`,fontSize:11,alignItems:"baseline"}}>
                  <span style={{color:C.muted2,whiteSpace:"nowrap"}}>{(()=>{try{return new Date(h.fecha).toLocaleString("es-CL");}catch{return h.fecha||"—";}})()}</span>
                  <span style={{fontWeight:700,color:C.text,whiteSpace:"nowrap"}}>{labelAccionNom(h.accion)}</span>
                  <span style={{color:C.muted}}>{h.estadoDesde?`${h.estadoDesde} → ${h.estadoHacia}`:""}{h.motivo?` · ${h.motivo}`:""}</span>
                  <span style={{marginLeft:"auto",color:C.muted2,whiteSpace:"nowrap"}}>{h.usuario}</span>
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Secciones de items */}
        {([...SECCIONES,...(nom.seccionesExtra||[])]).map(sec=>{
          const hasItems = nom.items.some(it=>it.seccion===sec.id && lineaActiva(it));
          if(!canEdit && !hasItems) return null;
          const esSecUSD = sec.id==="emp_rel_usd"||sec.id==="pagos_usd";
          const esSecCLP = !esSecUSD; // proveedores, anticipos, rendiciones, servipag, emp_rel_clp
          const esPeruana = esEmpresaPeruanaNom(nom.empresa);
          // Empresa peruana: las secciones de moneda local se capturan en PEN, no CLP.
          const monedaSec = esSecUSD ? "usd" : (esPeruana ? "pen" : "clp");
          const secItems = nom.items.filter(it=>it.seccion===sec.id && lineaActiva(it));
          const secTotCLP = secItems.reduce((s,it)=>s+(Number(it.montoCLP)||0),0);
          const secTotUSD = secItems.reduce((s,it)=>s+(Number(it.montoUSD)||0),0);
          const secTotPEN = secItems.reduce((s,it)=>s+(Number(it.montoPEN)||0),0);
          return (
            <div key={sec.id} style={{marginBottom:4}}>
              <div style={{display:"flex",alignItems:"center",gap:8,
                padding:"8px 12px",
                background:esSecUSD?`${C.blue}22`:
                           sec.id==="emp_rel_clp"?`${C.yellow}22`:C.bg2,
                borderRadius:"8px 8px 0 0",
                border:`1px solid ${esSecUSD?C.blue:sec.id==="emp_rel_clp"?C.yellow:C.border}`,
                borderBottom:"none",marginTop:12}}>
                <span style={{fontWeight:700,fontSize:13,
                  color:esSecUSD?C.blue:
                        sec.id==="emp_rel_clp"?C.yellow:C.text}}>{sec.label}</span>
                <span style={{fontSize:11,color:C.muted}}>
                  ({secItems.length} items)
                </span>
                {!esSecUSD&&esPeruana&&(
                <span style={{marginLeft:"auto",fontWeight:700,fontSize:12,color:"#f97316"}}>
                  {$$pen(secTotPEN)}
                </span>
                )}
                {!esSecUSD&&!esPeruana&&(
                <span style={{marginLeft:"auto",fontWeight:700,fontSize:12,color:C.yellow}}>
                  {$$clp(secTotCLP)}
                </span>
                )}
                {esSecUSD&&(
                <span style={{marginLeft:"auto",fontWeight:700,fontSize:12,color:C.blue}}>
                  {$$usd(secTotUSD)}
                </span>
                )}
              </div>
              <TablaItems
                items={nom.items}
                seccion={sec.id}
                onChange={v=>upd("items",v)}
                canEdit={editActivo}
                tc={nom.tc}
                moneda={monedaSec}
                semanaNomina={nom.semana}
                tiposDocExtra={nom.tiposDocExtra||[]}
                onAddTipoDoc={n=>{const extras=nom.tiposDocExtra||[];if(!extras.includes(n))upd("tiposDocExtra",[...extras,n]);}}
                usuario={usuario}
                nominaId={nom.id}
                empresa={nom.empresa}
                anioNom={nom.año}
                fechaNom={nom.fecha}
              />
            </div>
          );
        })}

        {/* Agregar nueva sección */}
        {canEdit&&(
          <div style={{marginTop:16,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <input id="nueva-sec-inp" type="text"
              placeholder="+ Nueva sección (ej: Gastos de Viaje) — Enter para agregar"
              style={{flex:1,minWidth:250,padding:"8px 12px",borderRadius:8,
                border:`1px dashed ${C.border2}`,background:C.card2,color:C.text,
                fontSize:12,outline:"none"}}
              onKeyDown={e=>{
                if(e.key!=="Enter"||!e.target.value.trim()) return;
                const label=e.target.value.trim();
                upd("seccionesExtra",[...(nom.seccionesExtra||[]),{id:`extra_${Date.now()}`,label}]);
                e.target.value="";
              }}/>
            <button onClick={()=>{
              const inp=document.getElementById("nueva-sec-inp");
              if(!inp?.value.trim()) return;
              upd("seccionesExtra",[...(nom.seccionesExtra||[]),{id:`extra_${Date.now()}`,label:inp.value.trim()}]);
              inp.value="";
            }} style={{padding:"8px 16px",borderRadius:8,background:C.blue,border:"none",
              color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Agregar sección</button>
            {(nom.seccionesExtra||[]).map(sec=>(
              <span key={sec.id} style={{background:`${C.muted2}22`,borderRadius:20,
                padding:"3px 10px",fontSize:11,color:C.muted,display:"flex",alignItems:"center",gap:4}}>
                {sec.label}
                <button onClick={()=>upd("seccionesExtra",(nom.seccionesExtra||[]).filter(s=>s.id!==sec.id))}
                  style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:13,lineHeight:1}}>×</button>
              </span>
            ))}
          </div>
        )}
        {/* Fin contenido interactivo (screen-only) */}
        </div>

        {/* ═══ Vista compacta solo para impresión ═══ */}
        <div className="print-only" style={{display:"none"}}>
          <div className="print-header">
            <div>
              <h2>{nombreFormal}</h2>
              <div style={{fontSize:9,color:"#475569",marginTop:2}}>
                Semana {nom.semana} · Año {nom.año} · Fecha: {nom.fecha || "—"}
                {nom.tc ? ` · T.C: $${nom.tc.toLocaleString("es-CL")}` : ""}
              </div>
              {(()=>{ const cob=coberturaNomina(nom); return (
                <div style={{fontSize:9,color:"#475569",marginTop:2}}>
                  Respaldo documental: {cob.conRespaldo}/{cob.total} líneas ({cob.pct}%)
                </div>
              );})()}
            </div>
            <div className="meta">
              <div>Estado: {(ESTADOS_FLUJO.find(e=>e.id===nom.estado)||{}).label || nom.estado}</div>
              <div>Impreso: {new Date().toLocaleDateString("es-CL")}</div>
            </div>
          </div>

          <table className="print-table">
            <thead>
              <tr>
                <th style={{width:"6%"}}>Tipo Doc</th>
                <th style={{width:"13%"}}>Proveedor</th>
                <th style={{width:"6%"}}>RUT</th>
                <th style={{width:"4%"}}>N° Doc</th>
                <th style={{width:"5%"}}>F. Doc</th>
                <th style={{width:"5%"}}>F. Venc</th>
                <th style={{width:"2%"}}>S</th>
                <th style={{width:"9%"}}>Concepto</th>
                <th style={{width:"7%",textAlign:"right"}}>{nomEsPeruana?"PEN":"CLP"}</th>
                <th style={{width:"6%",textAlign:"right"}}>USD</th>
                <th style={{width:"6%",textAlign:"right"}}>Anticipo</th>
                <th style={{width:"7%",textAlign:"right"}}>Saldo</th>
                <th style={{width:"24%"}}>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {([...SECCIONES,...(nom.seccionesExtra||[])]).map(sec=>{
                const secItems = nom.items.filter(it=>it.seccion===sec.id && lineaActiva(it));
                if(secItems.length === 0) return null;
                const fmtLocal = nomEsPeruana ? $$pen : $$clp;
                const stLocal = secItems.reduce((s,it)=>s+(Number(nomEsPeruana?it.montoPEN:it.montoCLP)||0),0);
                const stUSD = secItems.reduce((s,it)=>s+(Number(it.montoUSD)||0),0);
                const stAnticLocal = secItems.reduce((s,it)=>{
                  if(Number(nomEsPeruana?it.montoPEN:it.montoCLP) && !Number(it.montoUSD)) return s+(Number(it.anticipo)||0);
                  return s;
                },0);
                const stAnticUSD = secItems.reduce((s,it)=>{
                  if(Number(it.montoUSD)) return s+(Number(it.anticipo)||0);
                  return s;
                },0);
                const stSaldoLocal = stLocal - stAnticLocal;
                const stSaldoUSD = stUSD - stAnticUSD;
                return (
                  <React.Fragment key={sec.id}>
                    <tr className="sec-row">
                      <td colSpan={13}>{sec.label} ({secItems.length})</td>
                    </tr>
                    {secItems.map(it=>{
                      const local = Number(nomEsPeruana?it.montoPEN:it.montoCLP)||0;
                      const usd = Number(it.montoUSD)||0;
                      const antic = Number(it.anticipo)||0;
                      const monto = usd || local;
                      const saldo = monto - antic;
                      const fmtItem = usd ? $$usd : fmtLocal;
                      return (
                        <tr key={it.id}>
                          <td style={{fontSize:"6.5px"}}>{it.tipoDoc||"—"}</td>
                          <td style={{fontWeight:500}}>{it.proveedor||"—"}</td>
                          <td style={{fontSize:"6.5px"}}>{it.rut||"—"}</td>
                          <td>{it.nDoc||"—"}</td>
                          <td style={{fontSize:"6.5px"}}>{it.fDoc||"—"}</td>
                          <td style={{fontSize:"6.5px"}}>{it.fVenc||"—"}</td>
                          <td style={{textAlign:"center"}}>{it.semVenc?`S${it.semVenc}`:"—"}</td>
                          <td style={{fontSize:"6.5px"}}>{it.concepto||"—"}</td>
                          <td className="num">{local?fmtLocal(local):"—"}</td>
                          <td className="num">{usd?$$usd(usd):"—"}</td>
                          <td className="num">{antic?fmtItem(antic):"—"}</td>
                          <td className="num" style={{fontWeight:600}}>{saldo?fmtItem(saldo):"—"}</td>
                          <td style={{fontSize:"6px",wordBreak:"break-word",maxWidth:"80px"}}>
                            {it.comentario||""}
                            {docsActivos(it).length>0
                              ? <div style={{marginTop:1,color:"#166534"}}>📎 {docsActivos(it).map(d=>`${d.nombre}${d.principal?" ★":""}${d.interno?" (interno)":""}`).join(", ")}</div>
                              : <div style={{marginTop:1,color:"#b91c1c"}}>Sin respaldo</div>}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="subtotal-row">
                      <td colSpan={8} style={{textAlign:"right"}}>Subtotal</td>
                      <td className="num">{stLocal?fmtLocal(stLocal):"—"}</td>
                      <td className="num">{stUSD?$$usd(stUSD):"—"}</td>
                      <td className="num">{stAnticLocal?fmtLocal(stAnticLocal):""}{stAnticLocal&&stAnticUSD?" / ":""}{stAnticUSD?$$usd(stAnticUSD):""}{!stAnticLocal&&!stAnticUSD?"—":""}</td>
                      <td className="num" style={{fontWeight:700}}>{stSaldoLocal?fmtLocal(stSaldoLocal):""}{stSaldoLocal&&stSaldoUSD?" / ":""}{stSaldoUSD?$$usd(stSaldoUSD):""}{!stSaldoLocal&&!stSaldoUSD?"—":""}</td>
                      <td></td>
                    </tr>
                  </React.Fragment>
                );
              })}
              {(()=>{
                // Calcular anticipos separados por moneda (solo items con sección válida)
                const _secValPrint = new Set([...SECCIONES,...(nom.seccionesExtra||[])].map(s=>s.id));
                const _itemsValPrint = nom.items.filter(it=>_secValPrint.has(it.seccion) && lineaActiva(it));
                const fmtLocalT = nomEsPeruana ? $$pen : $$clp;
                const totLocal = nomEsPeruana ? totPEN : totCLP;
                const gAnticLocal = _itemsValPrint.reduce((s,it)=>{
                  if(Number(nomEsPeruana?it.montoPEN:it.montoCLP) && !Number(it.montoUSD)) return s+(Number(it.anticipo)||0);
                  return s;
                },0);
                const gAnticUSD = _itemsValPrint.reduce((s,it)=>{
                  if(Number(it.montoUSD)) return s+(Number(it.anticipo)||0);
                  return s;
                },0);
                const gSaldoLocal = totLocal - gAnticLocal;
                const gSaldoUSD = totUSD - gAnticUSD;
                return (
                  <tr className="total-row">
                    <td colSpan={8} style={{textAlign:"right"}}>TOTAL NÓMINA</td>
                    <td className="num">{totLocal?fmtLocalT(totLocal):"—"}</td>
                    <td className="num">{totUSD?$$usd(totUSD):"—"}</td>
                    <td className="num">{gAnticLocal?fmtLocalT(gAnticLocal):""}{gAnticLocal&&gAnticUSD?" / ":""}{gAnticUSD?$$usd(gAnticUSD):""}{!gAnticLocal&&!gAnticUSD?"—":""}</td>
                    <td className="num" style={{fontWeight:800}}>{gSaldoLocal?fmtLocalT(gSaldoLocal):""}{gSaldoLocal&&gSaldoUSD?" / ":""}{gSaldoUSD?$$usd(gSaldoUSD):""}{!gSaldoLocal&&!gSaldoUSD?"—":""}</td>
                    <td></td>
                  </tr>
                );
              })()}
            </tbody>
          </table>

          {/* Anexo: inventario de respaldos documentales (Expediente Digital) */}
          {(()=>{
            const conDocs = nom.items.filter(it=>lineaActiva(it) && docsActivos(it).length>0);
            if(conDocs.length===0) return null;
            return (
              <div style={{marginTop:14}}>
                <div style={{fontSize:10,fontWeight:700,color:"#1e293b",marginBottom:4,borderBottom:"1px solid #cbd5e1",paddingBottom:2}}>
                  Anexo — Respaldos documentales
                </div>
                <table className="print-table">
                  <thead>
                    <tr>
                      <th style={{width:"22%"}}>Línea</th>
                      <th style={{width:"34%"}}>Documento</th>
                      <th style={{width:"10%"}}>Tipo</th>
                      <th style={{width:"18%"}}>Correlativo interno</th>
                      <th style={{width:"16%"}}>SHA-256</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conDocs.flatMap(it=>docsActivos(it).map(d=>(
                      <tr key={d.id}>
                        <td style={{fontSize:"6.5px"}}>{it.proveedor||it.concepto||it.tipoDoc||"—"}</td>
                        <td style={{fontSize:"6.5px"}}>{d.nombre}{d.principal?" ★":""}</td>
                        <td style={{fontSize:"6.5px"}}>{d.interno?"Interno":"Adjunto"}</td>
                        <td style={{fontSize:"6.5px"}}>{d.voucher?.correlativo||"—"}</td>
                        <td style={{fontSize:"6px"}}>{d.hash?`${d.hash.slice(0,12)}…`:"—"}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* Anexo: historial de la nómina (Expediente Digital — Fase 2) */}
          {(nom.historial||[]).length>0&&(
            <div style={{marginTop:14}}>
              <div style={{fontSize:10,fontWeight:700,color:"#1e293b",marginBottom:4,borderBottom:"1px solid #cbd5e1",paddingBottom:2}}>
                Anexo — Historial de la nómina
              </div>
              <table className="print-table">
                <thead>
                  <tr>
                    <th style={{width:"24%"}}>Fecha/Hora</th>
                    <th style={{width:"18%"}}>Acción</th>
                    <th style={{width:"36%"}}>Detalle</th>
                    <th style={{width:"22%"}}>Usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {(nom.historial||[]).map((h,i)=>(
                    <tr key={i}>
                      <td style={{fontSize:"6.5px"}}>{(()=>{try{return new Date(h.fecha).toLocaleString("es-CL");}catch{return h.fecha||"—";}})()}</td>
                      <td style={{fontSize:"6.5px"}}>{labelAccionNom(h.accion)}</td>
                      <td style={{fontSize:"6.5px"}}>{h.estadoDesde?`${h.estadoDesde} → ${h.estadoHacia}`:""}{h.motivo?` · ${h.motivo}`:""}</td>
                      <td style={{fontSize:"6.5px"}}>{h.usuario}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="print-footer">
            {[
              {label:"Preparada por",  val:nom.preparadoPor},
              {label:"Revisada por",   val:nom.revisadoPor},
              {label:"V°B° Aprobador", val:nom.aprobado1Por, fecha:nom.fechaAprobacion1},
              {label:"Aprobado CFO",   val:nom.aprobadoPor,  fecha:nom.fechaAprobacion},
            ].map(a=>(
              <div key={a.label} className="auth-item">
                <div>{a.label}</div>
                <div className="auth-name">{a.val||"_______________"}</div>
                {a.fecha&&<div style={{fontSize:"6.5px",color:"#94a3b8"}}>{a.fecha}</div>}
                <div style={{borderTop:"1px solid #94a3b8",marginTop:8,width:"100%"}}></div>
              </div>
            ))}
          </div>
        </div>

      </div>
      {showAudit&&(
        <AuditoriaNominaModal nomina={nom} onClose={()=>setShowAudit(false)}/>
      )}
    </div>
  );
}
// Helper: suma items VÁLIDOS de una nómina (filtra items con seccion inválida o fantasma)
// Mismo cálculo que se hace dentro de NominaDetalle para garantizar consistencia
function sumNominaCLP(nom) {
  if(!nom || !Array.isArray(nom.items)) return 0;
  const seccionesValidas = new Set([...SECCIONES, ...(nom.seccionesExtra||[])].map(s=>s.id));
  return nom.items
    .filter(it => seccionesValidas.has(it.seccion) && lineaActiva(it))
    .reduce((s,it) => s + (Number(it.montoCLP)||0), 0);
}

function sumNominaUSD(nom) {
  if(!nom || !Array.isArray(nom.items)) return 0;
  const seccionesValidas = new Set([...SECCIONES, ...(nom.seccionesExtra||[])].map(s=>s.id));
  return nom.items
    .filter(it => seccionesValidas.has(it.seccion) && lineaActiva(it))
    .reduce((s,it) => s + (Number(it.montoUSD)||0), 0);
}

function sumNominaPEN(nom) {
  if(!nom || !Array.isArray(nom.items)) return 0;
  const seccionesValidas = new Set([...SECCIONES, ...(nom.seccionesExtra||[])].map(s=>s.id));
  return nom.items
    .filter(it => seccionesValidas.has(it.seccion) && lineaActiva(it))
    .reduce((s,it) => s + (Number(it.montoPEN)||0), 0);
}

// ─────────────────────────────────────────────────────────────────
// MIGRACIÓN v2 — ejecuta particionado, verifica conteo, escribe marcador
// ─────────────────────────────────────────────────────────────────
async function ejecutarMigracion(usuario, onLog) {
  // 1. Cargar blob original
  onLog('Cargando blob original id="nominas"...');
  const res = await fetch(`${SUPA_URL}/rest/v1/calendario_data?id=eq.nominas&select=value`,{
    headers:{apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`}
  });
  const rows = await res.json();
  if (!rows?.[0]?.value) throw new Error('No se encontró el blob id="nominas" en Supabase');
  const blobValue = JSON.parse(rows[0].value);
  const nominas = blobValue.nominas || [];
  const totalOriginal = nominas.length;
  onLog(`Blob cargado: ${totalOriginal} nóminas`);

  // 2. Verificar campo empresa limpio
  const sinEmpresa = nominas.filter(n => !n.empresa?.trim());
  if (sinEmpresa.length > 0) throw new Error(`${sinEmpresa.length} nóminas sin campo empresa — abortar`);

  // 3. Descargar respaldo ANTES de escribir nada
  onLog('Descargando respaldo en tu equipo...');
  const backupJSON = JSON.stringify(blobValue, null, 2);
  const blobFile = new Blob([backupJSON], {type:'application/json'});
  const url = URL.createObjectURL(blobFile);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nominas_respaldo_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  onLog('Respaldo descargado');
  await new Promise(r => setTimeout(r, 800));

  // 4. Agrupar por empresa
  const grupos = {};
  for (const n of nominas) {
    const emp = n.empresa.trim();
    if (!grupos[emp]) grupos[emp] = [];
    grupos[emp].push(n);
  }
  const empresasEncontradas = Object.keys(grupos);
  onLog(`Empresas: ${empresasEncontradas.join(', ')}`);

  // 5. Escribir una fila por empresa
  onLog('Escribiendo filas particionadas...');
  const porEmpresa = {};
  await Promise.all(empresasEncontradas.map(async emp => {
    const noms = grupos[emp];
    const slug = slugEmpresaNom(emp);
    const r = await fetch(`${SUPA_URL}/rest/v1/calendario_data`,{
      method:'POST',
      headers:{apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`,
        'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},
      body:JSON.stringify({id:`nominas_${slug}`,value:JSON.stringify({nominas:noms,empresa:emp}),updated_at:new Date().toISOString()})
    });
    if (!r.ok) throw new Error(`Error guardando nominas_${slug}: HTTP ${r.status}`);
    porEmpresa[emp] = noms.length;
    onLog(`  nominas_${slug}: ${noms.length}`);
  }));

  // 6. Verificar conteo leyendo de vuelta
  onLog('Verificando conteo post-escritura...');
  await new Promise(r => setTimeout(r, 600));
  const conteos = await Promise.all(empresasEncontradas.map(async emp => {
    const slug = slugEmpresaNom(emp);
    const r = await fetch(`${SUPA_URL}/rest/v1/calendario_data?id=eq.nominas_${slug}&select=value`,{
      headers:{apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`}
    });
    const data = await r.json();
    return data?.[0]?.value ? (JSON.parse(data[0].value).nominas||[]).length : 0;
  }));
  const totalParticionado = conteos.reduce((s,c) => s+c, 0);
  onLog(`Conteo: original=${totalOriginal}, particionado=${totalParticionado}`);
  if (totalParticionado !== totalOriginal)
    throw new Error(`Conteo no coincide (${totalOriginal} vs ${totalParticionado}) — revisar filas nominas_* antes de continuar`);
  onLog('Conteo OK');

  // 7. Escribir marcador de migración completada
  const meta = {
    migracionFecha: new Date().toISOString(),
    migracionPor: usuario?.nombre || usuario?.email || 'admin',
    totalNominas: totalOriginal,
    porEmpresa,
  };
  const rMeta = await fetch(`${SUPA_URL}/rest/v1/calendario_data`,{
    method:'POST',
    headers:{apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`,
      'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},
    body:JSON.stringify({id:'nominas_v2_done',value:JSON.stringify(meta),updated_at:new Date().toISOString()})
  });
  if (!rMeta.ok) throw new Error(`Error escribiendo nominas_v2_done: HTTP ${rMeta.status}`);
  _cacheNominasMigrado = true; // activar código nuevo en esta sesión
  onLog('Marcador nominas_v2_done escrito. Código nuevo activo.');
  return meta;
}

function MigracionNominasPanel({usuario}) {
  const [estado, setEstado] = useState('verificando'); // verificando|pendiente|ejecutando|completada|error
  const [meta, setMeta] = useState(null);
  const [log, setLog] = useState([]);
  const [confirmando, setConfirmando] = useState(false);
  const [abierto, setAbierto] = useState(false);

  useEffect(()=>{
    dbNominasMigrado().then(migrado=>{
      if(migrado){
        fetch(`${SUPA_URL}/rest/v1/calendario_data?id=eq.nominas_v2_done&select=value`,{
          headers:{apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`}
        }).then(r=>r.json()).then(rows=>{
          if(rows?.[0]?.value) setMeta(JSON.parse(rows[0].value));
          setEstado('completada');
        });
      } else { setEstado('pendiente'); }
    });
  },[]);

  function addLog(msg){ setLog(prev=>[...prev,`${new Date().toLocaleTimeString('es-CL')} — ${msg}`]); }

  async function correrMigracion(){
    setConfirmando(false); setEstado('ejecutando'); setLog([]);
    try {
      const result = await ejecutarMigracion(usuario, addLog);
      setMeta(result); setEstado('completada');
    } catch(e) { addLog(`ERROR: ${e.message}`); setEstado('error'); }
  }

  const colEst = estado==='completada'?'#22c55e':estado==='error'?'#ef4444':estado==='ejecutando'?'#f59e0b':'#64748b';
  const labelEst = {
    verificando:'Migración: verificando...',
    pendiente:'Migración a particionado por empresa: PENDIENTE',
    ejecutando:'Ejecutando migración...',
    completada:`Migración completada — ${meta?.totalNominas||'?'} nóminas particionadas`,
    error:'Migración: ERROR — ver log',
  }[estado];

  return (
    <div style={{marginBottom:14,border:`1px solid ${colEst}44`,borderRadius:10,background:`${colEst}08`,overflow:'hidden'}}>
      <div onClick={()=>setAbierto(a=>!a)}
        style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',cursor:'pointer',userSelect:'none'}}>
        <span style={{fontSize:11,fontWeight:700,color:colEst}}>{labelEst}</span>
        <span style={{fontSize:10,color:'#64748b',marginLeft:'auto'}}>{abierto?'▲':'▼'}</span>
      </div>
      {abierto&&(
        <div style={{padding:'0 16px 14px',borderTop:`1px solid ${colEst}33`}}>
          {estado==='pendiente'&&!confirmando&&(
            <div>
              <p style={{fontSize:11,color:C.muted,margin:'10px 0 10px'}}>
                Particiona el blob <code>id="nominas"</code> en 8 filas por empresa (<code>nominas_{'{slug}'}</code>).
                Descarga el respaldo automáticamente antes de escribir nada. El blob original no se borra.
              </p>
              <button onClick={()=>setConfirmando(true)}
                style={{padding:'7px 18px',borderRadius:8,background:C.primary,border:'none',color:C.primaryText,cursor:'pointer',fontWeight:700,fontSize:12}}>
                Ejecutar migración
              </button>
            </div>
          )}
          {estado==='pendiente'&&confirmando&&(
            <div style={{background:C.bg2,borderRadius:8,padding:'12px 14px',marginTop:10,border:`1px solid ${C.border}`}}>
              <p style={{fontSize:12,color:C.text,margin:'0 0 12px'}}>
                Se descargará <strong>nominas_respaldo_{'{fecha}'}.json</strong> en tu equipo antes de escribir nada.
              </p>
              <div style={{display:'flex',gap:8}}>
                <button onClick={correrMigracion}
                  style={{padding:'7px 18px',borderRadius:8,background:C.success,border:'none',color:'#fff',cursor:'pointer',fontWeight:700,fontSize:12}}>
                  Confirmar y migrar
                </button>
                <button onClick={()=>setConfirmando(false)}
                  style={{padding:'7px 14px',borderRadius:8,background:'transparent',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',fontSize:12}}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {(estado==='ejecutando'||estado==='error'||log.length>0)&&(
            <div style={{marginTop:10,background:C.cardAlt,borderRadius:8,padding:'10px 12px',
              fontFamily:'monospace',fontSize:11,color:C.muted,maxHeight:200,overflowY:'auto',border:`1px solid ${C.border}`}}>
              {log.map((l,i)=>(
                <div key={i} style={{color:l.includes('ERROR')?C.danger:l.includes('OK')?C.success:C.muted}}>{l}</div>
              ))}
              {estado==='ejecutando'&&<div style={{color:C.warning}}>...</div>}
            </div>
          )}
          {estado==='completada'&&meta&&(
            <div style={{marginTop:10,fontSize:11,color:C.muted}}>
              <div>Ejecutada: {new Date(meta.migracionFecha).toLocaleString('es-CL')}</div>
              <div>Por: {meta.migracionPor}</div>
              <div style={{marginTop:6,display:'flex',flexWrap:'wrap',gap:'4px 16px'}}>
                {Object.entries(meta.porEmpresa||{}).map(([emp,cnt])=>(
                  <span key={emp}>{emp}: <strong style={{color:C.text}}>{cnt}</strong></span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NominasModule({usuario, canEdit=false, saldosBancos={}, empresasPermitidas}) {
  const [nominas, setNominas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [selNomina, setSelNomina] = useState(null); // id nomina abierta
  const [filtroAño, setFiltroAño]       = useState(añoActualNom());
  const [filtroSemana, setFiltroSemana] = useState(semanaActual());
  const [filtroEmpresa, setFiltroEmpresa] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [vistaResumen, setVistaResumen] = useState(false);
  const [busqGlobal, setBusqGlobal] = useState("");
  const [vistaBusqueda, setVistaBusqueda] = useState(false);
  const nominasRef = useRef(nominas);
  useEffect(()=>{nominasRef.current=nominas;},[nominas]);
  // GUARD anti-borrado: solo se guarda tras una carga EXITOSA. Si la carga
  // inicial falla, no se escribe nada (evita sobrescribir nóminas con []).
  const cargaOkRef = useRef(false);
  const [tiposDocVersion, setTiposDocVersion] = useState(0); // fuerza re-render al cargar el catálogo global

  // Load — dbLoadNominas aplica el filtro por empresa (legacy en memoria, v2 en consulta)
  useEffect(()=>{
    dbLoadNominas(empresasPermitidas).then(d=>{
      if(d?.nominas) setNominas(d.nominas);
      cargaOkRef.current = true;
      setCargando(false);
    }).catch(e=>{
      console.error("[Nominas] Carga falló — GUARDADO DESHABILITADO esta sesión:", e);
      setCargando(false);
    });
  },[]);

  // Catálogo global de tipos de documento: cargar y fusionar con los por defecto.
  useEffect(()=>{
    dbLoadTiposDocExtra().then(extras=>{
      let changed=false;
      (extras||[]).forEach(t=>{ if(t && !TIPOS_DOCUMENTO.includes(t)){ TIPOS_DOCUMENTO.push(t); changed=true; } });
      if(changed) setTiposDocVersion(v=>v+1);
    }).catch(()=>{});
  },[]);

  // Auto-refresh nóminas cada 30s para sincronizar cambios de otros usuarios
  useEffect(()=>{
    const interval = setInterval(()=>{
      dbLoadNominas(empresasPermitidas).then(d=>{
        if(d?.nominas) {
          const fresh = d.nominas;
          setNominas(prev=>{
            // Solo actualizar si hay cambios reales (evitar re-render innecesario)
            const prevJSON = JSON.stringify(prev.map(n=>({id:n.id,estado:n.estado,aprobado1Por:n.aprobado1Por,aprobadoPor:n.aprobadoPor})));
            const newJSON = JSON.stringify(fresh.map(n=>({id:n.id,estado:n.estado,aprobado1Por:n.aprobado1Por,aprobadoPor:n.aprobadoPor})));
            if(prevJSON !== newJSON) return fresh;
            return prev;
          });
        }
      }).catch(()=>{});
    }, 30000);
    return ()=>clearInterval(interval);
  },[]);

  // Refresh al volver a la pestaña del navegador
  useEffect(()=>{
    function onVisibility(){
      if(document.visibilityState === "visible"){
        dbLoadNominas(empresasPermitidas).then(d=>{
          if(d?.nominas) setNominas(d.nominas);
        }).catch(()=>{});
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return ()=>document.removeEventListener("visibilitychange", onVisibility);
  },[]);

  // Save (debounce 800ms) — dbSaveNominas agrupa por empresa en v2
  const saveTimer = useRef(null);
  const pendingSaveRef = useRef(null); // última lista pendiente de guardar (para flush en recarga/cierre)
  function saveNominas(list) {
    if(!cargaOkRef.current){ console.warn("[Nominas] save bloqueado — la carga inicial falló."); return; }
    clearTimeout(saveTimer.current);
    pendingSaveRef.current = list;
    saveTimer.current = setTimeout(()=>{
      saveTimer.current = null;
      pendingSaveRef.current = null;
      dbSaveNominas(list);
    }, 800);
  }
  // Fuerza el guardado pendiente del debounce (si lo hay) antes de recargar/cerrar/desmontar.
  // keepalive=true permite que el request sobreviva al beforeunload.
  function flushNominas(keepalive=false) {
    if(!cargaOkRef.current) return;
    if(saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      const list = pendingSaveRef.current;
      pendingSaveRef.current = null;
      if(list) dbSaveNominas(list, {keepalive});
    }
  }
  // Flush ante recarga/cierre de pestaña (beforeunload) y ante desmontaje del módulo.
  useEffect(()=>{
    const onBeforeUnload = ()=>flushNominas(true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return ()=>{
      window.removeEventListener("beforeunload", onBeforeUnload);
      flushNominas(false);
    };
  // eslint-disable-next-line
  },[]);

  function updNomina(nom) {
    setNominas(prev=>{
      const anterior = prev.find(n=>n.id===nom.id);
      const next = prev.some(n=>n.id===nom.id)
        ? prev.map(n=>n.id===nom.id?nom:n)
        : [...prev, nom];
      saveNominas(next);
      // Auditoría
      if(!anterior) {
        window.auditLog&&window.auditLog("crear", {modulo:"finanzas", seccion:"nóminas",
          descripcion:`Creó nómina para ${nom.empresa} · S${nom.semana}/${nom.año}`,
          registroId:nom.id});
      } else {
        // Detectar cambio de estado específicamente
        if(anterior.estado !== nom.estado) {
          const esCFO = nom.estado === "aprobada";
          window.auditLog&&window.auditLog(esCFO?"aprobar":"editar", {modulo:"finanzas", seccion:"nóminas",
            descripcion:`Nómina ${nom.empresa} S${nom.semana}/${nom.año}: cambió estado de "${anterior.estado}" a "${nom.estado}"`,
            registroId:nom.id, campo:"estado",
            valorAnterior:anterior.estado, valorNuevo:nom.estado});
        }
        // Detectar otros cambios en campos clave
        const camposRastrear = ["fecha","tc","notas","preparadoPor","revisadoPor","aprobadoPor","aprobado1Por"];
        camposRastrear.forEach(k=>{
          if(anterior[k] !== nom[k] && (anterior[k]!==undefined || nom[k])) {
            window.auditLog&&window.auditLog("editar", {modulo:"finanzas", seccion:"nóminas",
              descripcion:`Nómina ${nom.empresa} S${nom.semana}/${nom.año}: editó ${k}`,
              registroId:nom.id, campo:k,
              valorAnterior:anterior[k]||"", valorNuevo:nom[k]||""});
          }
        });
        // Detectar cambios en items (granular: agregar, quitar, editar)
        const itemsAntes = anterior.items || [];
        const itemsDespues = nom.items || [];
        const idsAntes = new Set(itemsAntes.map(it=>it.id));
        const idsDespues = new Set(itemsDespues.map(it=>it.id));
        // Items nuevos
        itemsDespues.filter(it=>!idsAntes.has(it.id)).forEach(it=>{
          window.auditLog&&window.auditLog("crear", {modulo:"finanzas", seccion:"nóminas · items",
            descripcion:`Nómina ${nom.empresa} S${nom.semana}: agregó item "${it.proveedor||"sin nombre"}" en ${it.seccion}`,
            registroId:it.id});
        });
        // Items eliminados
        itemsAntes.filter(it=>!idsDespues.has(it.id)).forEach(it=>{
          window.auditLog&&window.auditLog("eliminar", {modulo:"finanzas", seccion:"nóminas · items",
            descripcion:`Nómina ${nom.empresa} S${nom.semana}: eliminó item "${it.proveedor||"sin nombre"}" de ${it.seccion}`,
            registroId:it.id});
        });
        // Items editados (pagado, montos)
        itemsDespues.forEach(itN=>{
          const itA = itemsAntes.find(x=>x.id===itN.id);
          if(!itA) return;
          ["pagado","montoCLP","montoUSD","nDoc","fVenc"].forEach(k=>{
            if(itA[k] !== itN[k] && (itA[k]!==undefined || itN[k])) {
              window.auditLog&&window.auditLog("editar", {modulo:"finanzas", seccion:"nóminas · items",
                descripcion:`Nómina ${nom.empresa} S${nom.semana}: editó ${k} en item "${itN.proveedor||itN.id}"`,
                registroId:itN.id, campo:k,
                valorAnterior:String(itA[k]||""), valorNuevo:String(itN[k]||"")});
            }
          });
        });
      }
      return next;
    });
  }

  function crearNomina(empresa, semanaOverride, añoOverride) {
    const s = semanaOverride || filtroSemana || semanaActual();
    const a = añoOverride || filtroAño || añoActualNom();
    // Calcular N° secuencial: contar cuántas ya existen para esta empresa/semana/año
    const existentes = nominas.filter(n=>n.empresa===empresa && n.semana===Number(s) && n.año===Number(a));
    const numero = existentes.length + 1;
    const base = nominaVacia(empresa, s, a, numero);
    const nom = {...base, historial:[entradaHistorialNom("creada", usuario)]};
    updNomina(nom);
    window.auditLog && window.auditLog("crear", {modulo:"finanzas", seccion:"nóminas",
      descripcion:`Creó nómina ${empresa} · S${s}/${a} N°${numero}`, registroId:nom.id});
    setSelNomina(nom.id);
  }

  // Soft-delete (Fase 2): la nómina no se borra físicamente. Se marca inactiva,
  // se oculta de las listas/totales y se conserva para auditoría.
  function eliminarNomina(id) {
    if(!window.confirm("¿Inactivar esta nómina?\n\nNo se elimina: se oculta de las listas y queda registrada para auditoría.")) return;
    setNominas(prev=>{
      const nom = prev.find(n=>n.id===id);
      const next = prev.map(n=>n.id===id
        ? {...n, estadoNomina:"inactiva", historial:[...(n.historial||[]), entradaHistorialNom("inactivada", usuario)]}
        : n);
      saveNominas(next);
      if(nom) window.auditLog&&window.auditLog("eliminar", {modulo:"finanzas", seccion:"nóminas",
        descripcion:`Inactivó nómina ${nom.empresa} · S${nom.semana}/${nom.año} (estado: ${nom.estado})`,
        registroId:id});
      return next;
    });
    if(selNomina===id) setSelNomina(null);
  }

  // Print CSS
  useEffect(()=>{
    const st = document.createElement('style');
    st.id = 'nominas-print-css';
    st.textContent = `
      @media print {
        @page{size:letter landscape;margin:4mm 5mm}
        body *{visibility:hidden}
        #nomina-print-area,#nomina-print-area *{visibility:visible}
        #nomina-print-area{position:absolute;top:0;left:0;width:100%;
          background:white!important;color:#000!important;font-size:6px;padding:2mm!important;box-sizing:border-box}
        .no-print{display:none!important;visibility:hidden!important}
        .screen-only{display:none!important;visibility:hidden!important;height:0!important;overflow:hidden!important}
        .print-only{display:block!important;visibility:visible!important;height:auto!important}
        .print-header{display:flex!important;justify-content:space-between;align-items:flex-start;
          margin-bottom:4px;padding-bottom:3px;border-bottom:2px solid #0f2d4a}
        .print-header h2{margin:0;font-size:11px;color:#0f2d4a;font-weight:900}
        .print-header .meta{font-size:7px;color:#475569;text-align:right}
        .print-header .meta div{margin-bottom:1px}
        .print-table{width:100%;border-collapse:collapse;font-size:5.5px;margin-bottom:6px;table-layout:fixed;word-wrap:break-word}
        .print-table th{background:#0f2d4a!important;color:white!important;padding:2px 1.5px;font-size:5px;
          text-align:left;overflow:hidden;white-space:nowrap;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
        .print-table td{padding:1.5px 1.5px;border-bottom:0.5px solid #e2e8f0;font-size:5.5px;overflow:hidden;word-break:break-word}
        .print-table .sec-row td{background:#e2e8f0!important;font-weight:800;font-size:6px;
          padding:2px 2px;border-top:1px solid #64748b;color:#0f2d4a;
          -webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
        .print-table .total-row td{background:#0f2d4a!important;color:white!important;font-weight:800;font-size:6px;
          padding:2px 2px;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
        .print-table .subtotal-row td{background:#f1f5f9!important;font-weight:700;font-size:5.5px;
          padding:1.5px 2px;border-top:1px solid #94a3b8;
          -webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
        .print-table td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
        .print-footer{display:flex!important;justify-content:space-around;margin-top:10px;
          padding-top:5px;border-top:1.5px solid #0f2d4a;font-size:7px;color:#475569}
        .print-footer .auth-item{text-align:center;min-width:100px}
        .print-footer .auth-name{font-weight:800;font-size:8px;color:#0f2d4a;margin-top:3px}
        .print-footer .auth-line{border-top:1px solid #94a3b8;margin-top:14px;width:100%}
      }
    `;
    document.head.appendChild(st);
    return()=>{document.getElementById('nominas-print-css')?.remove();};
  },[]);

  if(cargando) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",
      height:"40vh",color:C.muted,fontFamily:"sans-serif"}}>
      Cargando nóminas...
    </div>
  );

  // Nómina abierta
  const nominaAbierta = selNomina ? nominas.find(n=>n.id===selNomina) : null;
  // Nóminas hermanas: misma semana y año (para navegar entre empresas)
  const nominasHermanas = nominaAbierta
    ? nominas.filter(n=>n.semana===nominaAbierta.semana && n.año===nominaAbierta.año)
        .sort((a,b)=>EMPRESAS_NOM.indexOf(a.empresa)-EMPRESAS_NOM.indexOf(b.empresa))
    : [];
  if(nominaAbierta) return (
    <NominaDetalle
      nomina={nominaAbierta}
      onUpdate={updNomina}
      onBack={()=>setSelNomina(null)}
      usuario={usuario}
      canEdit={canEdit}
      saldosBancos={saldosBancos}
      nominasHermanas={nominasHermanas}
      onSwitchNomina={id=>setSelNomina(id)}
      onCrearYAbrir={(empresa, semDest, añoDest, itemAplazado)=>{
        if(semDest && añoDest) {
          // Aplazamiento: buscar o crear nómina en semana destino
          let nomDest = nominas.find(n=>n.empresa===empresa&&n.semana===semDest&&n.año===añoDest);
          if(!nomDest) {
            nomDest = nominaVacia(empresa, semDest, añoDest);
            if(itemAplazado) nomDest.items.push(itemAplazado);
            setNominas(prev=>{const next=[...prev,nomDest];saveNominas(next);return next;});
          } else if(itemAplazado) {
            const updated = {...nomDest, items:[...nomDest.items, itemAplazado]};
            setNominas(prev=>{const next=prev.map(n=>n.id===nomDest.id?updated:n);saveNominas(next);return next;});
          }
        } else {
          crearNomina(empresa, nominaAbierta.semana, nominaAbierta.año);
        }
      }}
      onCrearNueva={(empresa, semana, año)=>{
        crearNomina(empresa, semana, año);
      }}
      onAplazar={async ({nomOrigen, itemsSinAplazado, empresa, semDest, añoDest, itemNuevo})=>{
        // Mueve el item (quita de origen + agrega a destino) y persiste con await + verificación.
        // Usa nominasRef.current (estado más reciente) para evitar lecturas obsoletas.
        const prevList = nominasRef.current;
        let base = prevList.map(n=> n.id===nomOrigen.id ? {...n, items: itemsSinAplazado} : n);
        const dest = base.find(n=>n.empresa===empresa && n.semana===semDest && n.año===añoDest);
        // PARTE B — Anti-huérfano de sección custom.
        // Si el item pertenece a una sección personalizada (extra_XXX), su
        // definición {id,label} vive solo en la nómina ORIGEN. Al mover el item
        // hay que garantizar que la nómina DESTINO tenga esa sección en
        // seccionesExtra; si no, el item queda huérfano e invisible en la UI.
        // Ver audit/DIAGNOSTICO-FACTURAS-PERDIDAS.md.
        let secDef = null;
        if(typeof itemNuevo.seccion==="string" && itemNuevo.seccion.startsWith("extra_")) {
          secDef = (nomOrigen.seccionesExtra||[]).find(s=>s.id===itemNuevo.seccion)
                   || {id:itemNuevo.seccion, label:"Sección recuperada"};
        }
        if(!dest) {
          const nuevaDest = nominaVacia(empresa, semDest, añoDest);
          nuevaDest.items.push(itemNuevo);
          if(secDef) nuevaDest.seccionesExtra=[...(nuevaDest.seccionesExtra||[]), secDef];
          base = [...base, nuevaDest];
        } else {
          base = base.map(n=>{
            if(n.id!==dest.id) return n;
            let secs = n.seccionesExtra||[];
            if(secDef && !secs.some(s=>s.id===secDef.id)) secs=[...secs, secDef];
            return {...n, items:[...(n.items||[]), itemNuevo], seccionesExtra:secs};
          });
        }
        // Cancelar cualquier guardado debounced pendiente para que no pise este guardado.
        clearTimeout(saveTimer.current); saveTimer.current=null; pendingSaveRef.current=null;
        setNominas(base);
        const ok = await dbSaveNominas(base);
        if(!ok) {
          // Revertir el cambio local: el guardado no se confirmó.
          setNominas(prevList);
          return false;
        }
        window.auditLog&&window.auditLog("editar", {modulo:"finanzas", seccion:"nóminas",
          descripcion:`Aplazó item "${itemNuevo.proveedor||itemNuevo.tipoDoc||"s/n"}" de ${empresa} S${nomOrigen.semana} → S${semDest}/${añoDest}`,
          registroId:nomOrigen.id});
        return true;
      }}
    />
  );

  // Filtrar
  const nominasFiltradas = nominas.filter(n=>{
    if(!nominaActiva(n)) return false; // soft-delete: ocultar inactivas (Fase 2)
    if(filtroAño    && n.año!==filtroAño)       return false;
    if(filtroSemana && n.semana!==filtroSemana) return false;
    if(filtroEmpresa && n.empresa!==filtroEmpresa) return false;
    if(filtroEstado && n.estado!==filtroEstado) return false;
    return true;
  });

  // Semanas disponibles — todas las del año seleccionado
  const semanasDisp = semanasDeAño(filtroAño||añoActualNom());
  // Max weeks: 52 or 53 based on year

  // Empresas que ya tienen nómina esta semana
  const empresasConNomina = new Set(nominasFiltradas.map(n=>n.empresa));

  // Stats
  const stats = ESTADOS_FLUJO.map(e=>({
    ...e, count: nominasFiltradas.filter(n=>n.estado===e.id).length
  }));

  return (
    <div style={{fontFamily:"sans-serif",background:C.bg,minHeight:"100vh",color:C.text,padding:"20px 24px"}}>

      {/* Panel de migración v2 — solo admin */}
      {usuario?.rol==='admin' && <MigracionNominasPanel usuario={usuario}/>}

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:18,fontWeight:900,color:C.text}}>📋 Nóminas de Pago</div>
          <div style={{fontSize:11,color:C.muted}}>Grupo Mediterra · Gestión semanal de pagos</div>
        </div>

        {/* KPIs */}
        <div style={{display:"flex",gap:8,marginLeft:"auto",flexWrap:"wrap",alignItems:"center"}}>
          <button onClick={()=>setVistaResumen(v=>!v)}
            style={{padding:"8px 16px",borderRadius:10,
              background:vistaResumen?C.accent:`${C.card2}`,
              border:`1px solid ${vistaResumen?C.accent:C.border}`,
              color:vistaResumen?"#fff":C.muted,cursor:"pointer",fontSize:12,fontWeight:700}}>
            {vistaResumen?"← Semana":"📊 Resumen Anual"}
          </button>
          {stats.map(s=>(
            <div key={s.id} style={{background:s.bg+"33",border:`1px solid ${s.color}44`,
              borderRadius:10,padding:"8px 14px",textAlign:"center",minWidth:80}}>
              <div style={{fontSize:20,fontWeight:900,color:s.color}}>{s.count}</div>
              <div style={{fontSize:10,color:s.color,fontWeight:600}}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>

        {/* Año */}
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <span style={{fontSize:11,color:C.muted,fontWeight:600}}>Año:</span>
          <select value={filtroAño} onChange={e=>{setFiltroAño(Number(e.target.value));setFiltroSemana(semanaActual());}}
            style={{padding:"6px 8px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,outline:"none"}}>
            {AÑOS_NOM.map(a=>(<option key={a} value={a}>{a}{a===añoActualNom()?" ★":""}</option>))}
          </select>
        </div>

        {/* Semana */}
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <span style={{fontSize:11,color:C.muted,fontWeight:600}}>Semana:</span>
          <button onClick={()=>setFiltroSemana(s=>Math.max(1,s-1))}
            style={{padding:"4px 8px",borderRadius:6,border:`1px solid ${C.border}`,background:C.card2,color:C.muted,cursor:"pointer",fontSize:12}}>‹</button>
          <select value={filtroSemana} onChange={e=>setFiltroSemana(Number(e.target.value))}
            style={{padding:"6px 8px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,outline:"none"}}>
            {semanasDisp.map(s=>{
              const hasNom = nominas.some(n=>n.semana===s&&n.año===filtroAño);
              return (<option key={s} value={s}>S{String(s).padStart(2,"0")}{s===semanaActual()&&filtroAño===añoActualNom()?" ★":""}{hasNom?" ·":""}</option>);
            })}
          </select>
          <button onClick={()=>setFiltroSemana(s=>Math.min(semanasDisp.length?semanasDisp[semanasDisp.length-1]:53,s+1))}
            style={{padding:"4px 8px",borderRadius:6,border:`1px solid ${C.border}`,background:C.card2,color:C.muted,cursor:"pointer",fontSize:12}}>›</button>
        </div>

        {/* Empresa: selector + crear directo */}
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <select value={filtroEmpresa} onChange={e=>setFiltroEmpresa(e.target.value)}
            style={{padding:"6px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,outline:"none"}}>
            <option value="">🏢 Todas las empresas</option>
            {EMPRESAS_NOM.map(e=>{
              const existe = nominas.some(n=>n.empresa===e&&n.semana===filtroSemana&&n.año===filtroAño);
              return <option key={e} value={e}>{e}{existe?" ✓":""}</option>;
            })}
          </select>
          {filtroEmpresa&&canEdit&&!nominas.some(n=>n.empresa===filtroEmpresa&&n.semana===filtroSemana&&n.año===filtroAño)&&(
            <button onClick={()=>crearNomina(filtroEmpresa)}
              style={{padding:"6px 14px",borderRadius:8,background:C.blue,border:"none",
                color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700,whiteSpace:"nowrap"}}>
              + Crear S{filtroSemana} {filtroEmpresa}
            </button>
          )}
          {filtroEmpresa&&nominas.some(n=>n.empresa===filtroEmpresa&&n.semana===filtroSemana&&n.año===filtroAño)&&(
            <button onClick={()=>{
              const nom=nominas.find(n=>n.empresa===filtroEmpresa&&n.semana===filtroSemana&&n.año===filtroAño);
              if(nom) setSelNomina(nom.id);
            }}
              style={{padding:"6px 14px",borderRadius:8,background:C.green,border:"none",
                color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>
              👁 Abrir
            </button>
          )}
        </div>

        <select value={filtroEstado} onChange={e=>setFiltroEstado(e.target.value)}
          style={{padding:"6px 10px",borderRadius:8,border:`1px solid ${C.border}`,
            background:C.card2,color:C.text,fontSize:12,outline:"none"}}>
          <option value="">📊 Todos los estados</option>
          {ESTADOS_FLUJO.map(e=><option key={e.id} value={e.id}>{e.label}</option>)}
        </select>

        {/* Buscador global */}
        <div style={{display:"flex",alignItems:"center",gap:4,marginLeft:"auto"}}>
          <input value={busqGlobal} onChange={e=>{setBusqGlobal(e.target.value);if(e.target.value.trim()) setVistaBusqueda(true);else setVistaBusqueda(false);}}
            placeholder="🔍 Buscar N° doc, proveedor, monto..."
            style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${busqGlobal?C.accentL:C.border}`,
              background:C.card2,color:C.text,fontSize:12,outline:"none",width:260}}/>
          {busqGlobal&&<button onClick={()=>{setBusqGlobal("");setVistaBusqueda(false);}}
            style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14}}>✕</button>}
        </div>
      </div>

      {/* ══════ VISTA BÚSQUEDA GLOBAL ══════ */}
      {vistaBusqueda&&busqGlobal.trim()&&(()=>{
        const q = busqGlobal.trim().toLowerCase();
        const resultados = [];
        nominas.filter(nominaActiva).forEach(nom=>{
          (nom.items||[]).filter(lineaActiva).forEach(it=>{
            const match = (it.proveedor||"").toLowerCase().includes(q)
              || (it.nDoc||"").includes(q)
              || (it.tipoDoc||"").toLowerCase().includes(q)
              || (it.concepto||"").toLowerCase().includes(q)
              || (it.rut||"").toLowerCase().includes(q)
              || String(it.montoCLP||0).includes(q)
              || String(it.montoUSD||0).includes(q);
            if(match) resultados.push({...it, _nom:nom});
          });
        });
        return (
          <div style={{marginBottom:20}}>
            <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:10}}>
              🔍 Resultados de búsqueda: "{busqGlobal}" — {resultados.length} item{resultados.length!==1?"s":""}
            </div>
            {resultados.length===0&&<div style={{color:C.muted,fontSize:12,padding:20,textAlign:"center"}}>Sin resultados</div>}
            {resultados.length>0&&(
              <div style={{overflowX:"auto",borderRadius:10,border:`1px solid ${C.border}`}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead><tr style={{background:C.primary}}>
                    {["Empresa","Semana","Tipo Doc","Proveedor","RUT","N° Doc","F. Venc","Concepto","CLP","USD","Estado Nómina"].map(h=>(
                      <th key={h} style={{padding:"6px 8px",color:C.muted,fontWeight:600,fontSize:10,textAlign:h==="CLP"||h==="USD"?"right":"left",whiteSpace:"nowrap",borderBottom:`1px solid ${C.border}`}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {resultados.slice(0,100).map((r,i)=>(
                      <tr key={r.id+i} style={{borderBottom:`1px solid ${C.border}22`,background:i%2===0?"transparent":`${C.border}11`,cursor:"pointer"}}
                        onClick={()=>{setSelNomina(r._nom.id);setVistaBusqueda(false);setBusqGlobal("");}}>
                        <td style={{padding:"4px 8px",fontWeight:600,color:C.text}}>{r._nom.empresa}</td>
                        <td style={{padding:"4px 8px",color:C.muted}}>S{r._nom.semana} / {r._nom.año}</td>
                        <td style={{padding:"4px 8px",color:C.muted,fontSize:10}}>{r.tipoDoc||"—"}</td>
                        <td style={{padding:"4px 8px",color:C.text}}>{r.proveedor||"—"}</td>
                        <td style={{padding:"4px 8px",color:C.muted}}>{r.rut||"—"}</td>
                        <td style={{padding:"4px 8px",color:C.accentL,fontWeight:600}}>{r.nDoc||"—"}</td>
                        <td style={{padding:"4px 8px",color:C.muted}}>{r.fVenc||"—"}</td>
                        <td style={{padding:"4px 8px",color:C.muted}}>{r.concepto||"—"}</td>
                        <td style={{padding:"4px 8px",textAlign:"right",fontWeight:600,color:C.text}}>{Number(r.montoCLP)?$$clp(r.montoCLP):"—"}</td>
                        <td style={{padding:"4px 8px",textAlign:"right",fontWeight:600,color:C.green}}>{Number(r.montoUSD)?$$usd(r.montoUSD):"—"}</td>
                        <td style={{padding:"4px 8px"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:10,
                          background:r._nom.estado==="aprobada"?`${C.green}22`:r._nom.estado==="aprobada1"?`${C.blue}22`:`${C.yellow}22`,
                          color:r._nom.estado==="aprobada"?C.green:r._nom.estado==="aprobada1"?C.blue:C.yellow,
                          fontWeight:700}}>{r._nom.estado}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* ══════ VISTA RESUMEN ANUAL ══════ */}
      {vistaResumen&&(()=>{
        const nominasAño = nominas.filter(n=>n.año===filtroAño && nominaActiva(n));
        // Semanas con datos
        const semsConDatos = [...new Set(nominasAño.map(n=>n.semana))].sort((a,b)=>a-b);

        // Resumen por empresa: totales anuales
        const resumenEmpresas = EMPRESAS_NOM.map(emp=>{
          const noms = nominasAño.filter(n=>n.empresa===emp);
          const totCLP = noms.reduce((s,n)=>s+sumNominaCLP(n),0);
          const totUSD = noms.reduce((s,n)=>s+sumNominaUSD(n),0);
          const totPEN = noms.reduce((s,n)=>s+sumNominaPEN(n),0);
          const cantNom = noms.length;
          return {emp, totCLP, totUSD, totPEN, esPeruana:esEmpresaPeruanaNom(emp), cantNom, noms};
        }).filter(r=>r.cantNom>0);

        const grandTotCLP = resumenEmpresas.reduce((s,r)=>s+r.totCLP,0);
        const grandTotUSD = resumenEmpresas.reduce((s,r)=>s+r.totUSD,0);

        return (
          <div>
            {/* Selector año para resumen */}
            <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center"}}>
              <span style={{fontSize:13,fontWeight:700,color:C.text}}>📊 Resumen Anual {filtroAño}</span>
              <select value={filtroAño} onChange={e=>setFiltroAño(Number(e.target.value))}
                style={{padding:"5px 8px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card2,color:C.text,fontSize:12,outline:"none"}}>
                {AÑOS_NOM.map(a=><option key={a} value={a}>{a}</option>)}
              </select>
              <span style={{fontSize:11,color:C.muted}}>{nominasAño.length} nóminas · {semsConDatos.length} semanas</span>
            </div>

            {/* Tabla resumen por empresa */}
            <div style={{overflowX:"auto",borderRadius:12,border:`1px solid ${C.border}`,marginBottom:20}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr style={{background:C.primary}}>
                    <th style={{padding:"10px 14px",textAlign:"left",color:C.muted,fontWeight:700,fontSize:11}}>Empresa</th>
                    <th style={{padding:"10px 10px",textAlign:"center",color:C.muted,fontWeight:600,fontSize:11}}>Nóminas</th>
                    <th style={{padding:"10px 10px",textAlign:"right",color:C.muted,fontWeight:600,fontSize:11}}>Total CLP / PEN</th>
                    <th style={{padding:"10px 10px",textAlign:"right",color:C.muted,fontWeight:600,fontSize:11}}>Total USD</th>
                  </tr>
                </thead>
                <tbody>
                  {resumenEmpresas.map((r,i)=>(
                    <tr key={r.emp} style={{borderBottom:`1px solid ${C.border}22`,background:i%2===0?"transparent":`${C.border}11`}}>
                      <td style={{padding:"10px 14px",fontWeight:600,color:C.text}}>{r.emp}</td>
                      <td style={{padding:"8px 10px",textAlign:"center",color:C.muted,fontSize:11}}>{r.cantNom}</td>
                      {r.esPeruana
                        ? <td style={{padding:"8px 10px",textAlign:"right",fontWeight:700,color:r.totPEN?"#f97316":C.muted2}}>{r.totPEN?$$pen(r.totPEN):"—"}</td>
                        : <td style={{padding:"8px 10px",textAlign:"right",fontWeight:700,color:r.totCLP?C.yellow:C.muted2}}>{r.totCLP?$$clp(r.totCLP):"—"}</td>}
                      <td style={{padding:"8px 10px",textAlign:"right",fontWeight:700,color:r.totUSD?C.blue:C.muted2}}>{r.totUSD?$$usd(r.totUSD):"—"}</td>
                    </tr>
                  ))}
                </tbody>
                {resumenEmpresas.length>0&&(
                  <tfoot>
                    <tr style={{background:C.bg2,borderTop:`2px solid ${C.border}`}}>
                      <td style={{padding:"8px 14px",fontWeight:800,color:C.text}}>TOTAL {filtroAño}</td>
                      <td style={{padding:"8px 10px",textAlign:"center",fontWeight:700,color:C.muted,fontSize:11}}>{nominasAño.length}</td>
                      <td style={{padding:"8px 10px",textAlign:"right",fontWeight:900,color:C.yellow,fontSize:13}}>{$$clp(grandTotCLP)}</td>
                      <td style={{padding:"8px 10px",textAlign:"right",fontWeight:900,color:C.blue,fontSize:13}}>{$$usd(grandTotUSD)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Desglose por categoría de pago */}
            <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:10,marginTop:8}}>💰 Desglose por Categoría de Pago</div>
            <div style={{overflowX:"auto",borderRadius:12,border:`1px solid ${C.border}`,marginBottom:20}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr style={{background:C.primary}}>
                    <th style={{padding:"10px 14px",textAlign:"left",color:C.muted,fontWeight:700,fontSize:11}}>Categoría</th>
                    <th style={{padding:"10px 10px",textAlign:"center",color:C.muted,fontWeight:600,fontSize:11}}>Items</th>
                    <th style={{padding:"10px 10px",textAlign:"right",color:C.muted,fontWeight:600,fontSize:11}}>Total CLP</th>
                    <th style={{padding:"10px 10px",textAlign:"right",color:C.muted,fontWeight:600,fontSize:11}}>Total USD</th>
                  </tr>
                </thead>
                <tbody>
                  {[...SECCIONES].map((sec,si)=>{
                    const allItems = nominasAño.flatMap(n=>n.items.filter(it=>it.seccion===sec.id && lineaActiva(it)));
                    if(allItems.length===0) return null;
                    const esUSD = sec.id==="emp_rel_usd"||sec.id==="pagos_usd";
                    const sCLP = allItems.reduce((s,it)=>s+(Number(it.montoCLP)||0),0);
                    const sUSD = allItems.reduce((s,it)=>s+(Number(it.montoUSD)||0),0);
                    return (
                      <tr key={sec.id} style={{borderBottom:`1px solid ${C.border}22`,background:si%2===0?"transparent":`${C.border}11`}}>
                        <td style={{padding:"10px 14px",fontWeight:600,color:esUSD?C.blue:C.text}}>{sec.label}</td>
                        <td style={{padding:"8px 10px",textAlign:"center",color:C.muted,fontSize:11}}>{allItems.length}</td>
                        <td style={{padding:"8px 10px",textAlign:"right",fontWeight:700,color:sCLP&&!esUSD?C.yellow:C.muted2}}>
                          {!esUSD&&sCLP?$$clp(sCLP):"—"}
                        </td>
                        <td style={{padding:"8px 10px",textAlign:"right",fontWeight:700,color:sUSD&&esUSD?C.blue:C.muted2}}>
                          {esUSD&&sUSD?$$usd(sUSD):"—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{background:C.bg2,borderTop:`2px solid ${C.border}`}}>
                    <td style={{padding:"8px 14px",fontWeight:800,color:C.text}}>TOTAL</td>
                    <td style={{padding:"8px 10px",textAlign:"center",fontWeight:700,color:C.muted,fontSize:11}}>
                      {nominasAño.flatMap(n=>n.items).length}
                    </td>
                    <td style={{padding:"8px 10px",textAlign:"right",fontWeight:900,color:C.yellow,fontSize:13}}>{$$clp(grandTotCLP)}</td>
                    <td style={{padding:"8px 10px",textAlign:"right",fontWeight:900,color:C.blue,fontSize:13}}>{$$usd(grandTotUSD)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Detalle por semana */}
            <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:10}}>📅 Detalle por Semana</div>
            <div style={{overflowX:"auto",borderRadius:12,border:`1px solid ${C.border}`,marginBottom:20}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead>
                  <tr style={{background:C.primary}}>
                    <th style={{padding:"8px 10px",textAlign:"left",color:C.muted,fontWeight:700,fontSize:10,position:"sticky",left:0,background:C.bg2,zIndex:2}}>Semana</th>
                    {EMPRESAS_NOM.map(emp=>{
                      const tiene = nominasAño.some(n=>n.empresa===emp);
                      if(!tiene) return null;
                      return (
                        <th key={emp} colSpan={2} style={{padding:"8px 6px",textAlign:"center",color:C.muted,fontWeight:600,fontSize:10,
                          borderLeft:`1px solid ${C.border}44`}}>
                          {emp.replace(" Foods","").replace(" Farms","").replace(" Service","")}
                        </th>
                      );
                    })}
                    <th colSpan={2} style={{padding:"8px 6px",textAlign:"center",color:C.accentL,fontWeight:700,fontSize:10,
                      borderLeft:`2px solid ${C.border}`}}>TOTAL</th>
                  </tr>
                  <tr style={{background:`${C.bg2}dd`}}>
                    <th style={{padding:"4px 10px",position:"sticky",left:0,background:C.bg2,zIndex:2}}/>
                    {EMPRESAS_NOM.map(emp=>{
                      const tiene = nominasAño.some(n=>n.empresa===emp);
                      if(!tiene) return null;
                      return (
                        <React.Fragment key={emp}>
                          <th style={{padding:"4px 6px",textAlign:"right",color:C.yellow,fontWeight:600,fontSize:9,borderLeft:`1px solid ${C.border}44`}}>CLP</th>
                          <th style={{padding:"4px 6px",textAlign:"right",color:C.blue,fontWeight:600,fontSize:9}}>USD</th>
                        </React.Fragment>
                      );
                    })}
                    <th style={{padding:"4px 6px",textAlign:"right",color:C.yellow,fontWeight:700,fontSize:9,borderLeft:`2px solid ${C.border}`}}>CLP</th>
                    <th style={{padding:"4px 6px",textAlign:"right",color:C.blue,fontWeight:700,fontSize:9}}>USD</th>
                  </tr>
                </thead>
                <tbody>
                  {semsConDatos.map((sem,si)=>{
                    const nomsS = nominasAño.filter(n=>n.semana===sem);
                    const semTotCLP = nomsS.reduce((s,n)=>s+sumNominaCLP(n),0);
                    const semTotUSD = nomsS.reduce((s,n)=>s+sumNominaUSD(n),0);
                    return (
                      <tr key={sem} style={{borderBottom:`1px solid ${C.border}22`,background:si%2===0?"transparent":`${C.border}08`,
                        cursor:"pointer"}}
                        onClick={()=>{setFiltroSemana(sem);setVistaResumen(false);}}>
                        <td style={{padding:"6px 10px",fontWeight:600,color:C.text,fontSize:11,position:"sticky",left:0,
                          background:si%2===0?C.bg:`${C.border}11`,zIndex:1}}>
                          S{String(sem).padStart(2,"0")}
                          {sem===semanaActual()&&filtroAño===añoActualNom()&&<span style={{color:C.green,marginLeft:4,fontSize:9}}>★</span>}
                        </td>
                        {EMPRESAS_NOM.map(emp=>{
                          const tiene = nominasAño.some(n=>n.empresa===emp);
                          if(!tiene) return null;
                          const n = nomsS.find(n=>n.empresa===emp);
                          const eCLP = n?sumNominaCLP(n):0;
                          const eUSD = n?sumNominaUSD(n):0;
                          return (
                            <React.Fragment key={emp}>
                              <td style={{padding:"5px 6px",textAlign:"right",color:eCLP?C.yellow:C.muted2,fontWeight:eCLP?600:400,
                                fontSize:10,borderLeft:`1px solid ${C.border}22`}}>
                                {eCLP?$$clp(eCLP):"—"}
                              </td>
                              <td style={{padding:"5px 6px",textAlign:"right",color:eUSD?C.blue:C.muted2,fontWeight:eUSD?600:400,fontSize:10}}>
                                {eUSD?$$usd(eUSD):"—"}
                              </td>
                            </React.Fragment>
                          );
                        })}
                        <td style={{padding:"5px 6px",textAlign:"right",fontWeight:700,color:C.yellow,fontSize:10,
                          borderLeft:`2px solid ${C.border}`,background:`${C.accent}08`}}>
                          {semTotCLP?$$clp(semTotCLP):"—"}
                        </td>
                        <td style={{padding:"5px 6px",textAlign:"right",fontWeight:700,color:C.blue,fontSize:10,
                          background:`${C.accent}08`}}>
                          {semTotUSD?$$usd(semTotUSD):"—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {semsConDatos.length>0&&(
                  <tfoot>
                    <tr style={{background:C.bg2,borderTop:`2px solid ${C.border}`}}>
                      <td style={{padding:"8px 10px",fontWeight:800,color:C.text,position:"sticky",left:0,background:C.bg2,zIndex:2}}>TOTAL</td>
                      {EMPRESAS_NOM.map(emp=>{
                        const tiene = nominasAño.some(n=>n.empresa===emp);
                        if(!tiene) return null;
                        const noms = nominasAño.filter(n=>n.empresa===emp);
                        const tCLP = noms.reduce((s,n)=>s+sumNominaCLP(n),0);
                        const tUSD = noms.reduce((s,n)=>s+sumNominaUSD(n),0);
                        return (
                          <React.Fragment key={emp}>
                            <td style={{padding:"6px 6px",textAlign:"right",fontWeight:800,color:C.yellow,fontSize:10,borderLeft:`1px solid ${C.border}22`}}>{tCLP?$$clp(tCLP):"—"}</td>
                            <td style={{padding:"6px 6px",textAlign:"right",fontWeight:800,color:C.blue,fontSize:10}}>{tUSD?$$usd(tUSD):"—"}</td>
                          </React.Fragment>
                        );
                      })}
                      <td style={{padding:"6px 6px",textAlign:"right",fontWeight:900,color:C.yellow,fontSize:11,borderLeft:`2px solid ${C.border}`,background:`${C.accent}15`}}>{$$clp(grandTotCLP)}</td>
                      <td style={{padding:"6px 6px",textAlign:"right",fontWeight:900,color:C.blue,fontSize:11,background:`${C.accent}15`}}>{$$usd(grandTotUSD)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {nominasAño.length===0&&(
              <div style={{textAlign:"center",padding:40,color:C.muted2,fontSize:13}}>
                No hay nóminas registradas para {filtroAño}.
              </div>
            )}
          </div>
        );
      })()}

      {/* ══════ VISTA SEMANAL (existente) ══════ */}
      {!vistaResumen&&(<>

      {/* Tabla semanal por empresa */}
      <div style={{overflowX:"auto",borderRadius:12,border:`1px solid ${C.border}`,marginBottom:20}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead>
            <tr style={{background:C.primary}}>
              <th style={{padding:"10px 14px",textAlign:"left",color:C.muted,fontWeight:700,fontSize:11}}>
                Empresa
              </th>
              <th style={{padding:"10px 10px",textAlign:"center",color:C.muted,fontWeight:600,fontSize:11}}>Estado</th>
              <th style={{padding:"10px 10px",textAlign:"right",color:C.muted,fontWeight:600,fontSize:11}}>Total CLP</th>
              <th style={{padding:"10px 10px",textAlign:"right",color:C.muted,fontWeight:600,fontSize:11}}>Total USD</th>
              <th style={{padding:"10px 10px",textAlign:"center",color:C.muted,fontWeight:600,fontSize:11}}>Preparada por</th>
              <th style={{padding:"10px 10px",textAlign:"center",color:C.muted,fontWeight:600,fontSize:11}}>Aprobada por</th>
              <th style={{padding:"10px 10px",textAlign:"center",color:C.muted,fontWeight:600,fontSize:11}}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {EMPRESAS_NOM.filter(emp=>!filtroEmpresa||emp===filtroEmpresa).map(emp=>{
              const nom = nominasFiltradas.find(n=>n.empresa===emp);
              if(!nom&&filtroEstado) return null;
              return (
                <tr key={emp} style={{borderBottom:`1px solid ${C.border}22`,
                  background:nom?"transparent":`${C.muted2}08`}}>
                  <td style={{padding:"10px 14px",fontWeight:600,color:C.text}}>{emp}</td>
                  <td style={{padding:"8px 10px",textAlign:"center"}}>
                    {nom ? <BadgeEstado estado={nom.estado}/>
                          : <span style={{color:C.muted2,fontSize:11}}>Sin nómina</span>}
                  </td>
                  <td style={{padding:"8px 10px",textAlign:"right",fontWeight:700,
                    color:sumNominaCLP(nom)?C.yellow:C.muted2}}>
                    {nom ? $$clp(sumNominaCLP(nom)) : "—"}
                  </td>
                  <td style={{padding:"8px 10px",textAlign:"right",fontWeight:700,
                    color:sumNominaUSD(nom)?C.blue:C.muted2}}>
                    {nom ? $$usd(sumNominaUSD(nom)) : "—"}
                  </td>
                  <td style={{padding:"8px 10px",textAlign:"center",fontSize:11,color:C.muted}}>
                    {nom?.preparadoPor||"—"}
                  </td>
                  <td style={{padding:"8px 10px",textAlign:"center",fontSize:11,
                    color:nom?.aprobadoPor?C.green:C.muted2}}>
                    {nom?.aprobadoPor||"—"}
                  </td>
                  <td style={{padding:"8px 10px",textAlign:"center"}}>
                    <div style={{display:"flex",gap:6,justifyContent:"center",flexWrap:"wrap"}}>
                      {nom ? (
                        <>
                          <button onClick={()=>setSelNomina(nom.id)}
                            style={{padding:"4px 12px",borderRadius:6,background:C.blue,border:"none",
                              color:"#fff",cursor:"pointer",fontSize:11,fontWeight:600}}>
                            {canEdit&&nom.estado!=="aprobada"?"✏️ Editar":"👁 Ver"}
                          </button>
                          {canEdit&&<button onClick={()=>eliminarNomina(nom.id)}
                            style={{padding:"4px 8px",borderRadius:6,background:"#fee2e233",border:"none",
                              color:"#ef4444",cursor:"pointer",fontSize:11}}>×</button>}
                        </>
                      ) : canEdit ? (
                        <button onClick={()=>crearNomina(emp)}
                          style={{padding:"4px 14px",borderRadius:6,
                            background:"transparent",border:`1px dashed ${C.border2}`,
                            color:C.muted,cursor:"pointer",fontSize:11}}>
                          + Crear
                        </button>
                      ) : <span style={{color:C.muted2,fontSize:11}}>—</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {/* Totales globales */}
          {nominasFiltradas.length>0&&(
            <tfoot>
              <tr style={{background:C.bg2,borderTop:`2px solid ${C.border}`}}>
                <td style={{padding:"8px 14px",fontWeight:800,color:C.text}}>TOTAL GRUPO</td>
                <td/>
                <td style={{padding:"8px 10px",textAlign:"right",fontWeight:900,color:C.yellow,fontSize:13}}>
                  {$$clp(nominasFiltradas.reduce((s,n)=>s+sumNominaCLP(n),0))}
                </td>
                <td style={{padding:"8px 10px",textAlign:"right",fontWeight:900,color:C.blue,fontSize:13}}>
                  {$$usd(nominasFiltradas.reduce((s,n)=>s+sumNominaUSD(n),0))}
                </td>
                <td colSpan={3}/>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {nominasFiltradas.length===0&&(
        <div style={{textAlign:"center",padding:40,color:C.muted2,fontSize:13}}>
          No hay nóminas para la semana S{filtroSemana}.
          {canEdit&&<div style={{marginTop:8}}>Usa los botones "＋ Crear" para agregar nóminas por empresa.</div>}
        </div>
      )}
      </>)}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════
// FRISKU FOODS — Contenedores por especie × mes × temporada
// Ingreso = contenedores × precio_contenedor × 2% comisión
// Cobro con delay de 2-3 meses
// ═══════════════════════════════════════════════════════════════════
const FRISKU_ESPECIES_DEFAULT = ["Arándanos","Cerezas","Paltas","Mangos","Manzana","Limones","Kiwi"];

function defaultParamsFrisku() {
  // { seasonKey: { especies: [{nombre, meses:[{mes,contenedores,precio_cont,delay_meses}]}] } }
  // Usa todos los meses del rango (Apr-26 a Jun-31) para cada temporada
  const p = {};
  SEASON_KEYS.forEach(sk => {
    const [y1] = sk.split("-").map(Number);
    // Meses de esta temporada: Jul año1 → Jun año2
    const mesesTemporada = MESES_INFO.filter(mo =>
      (mo.y === y1 && mo.m >= 6) || (mo.y === y1+1 && mo.m <= 5)
    );
    p[sk] = {
      especies: FRISKU_ESPECIES_DEFAULT.map(esp => ({
        nombre: esp,
        meses: mesesTemporada.map(mo => ({ mes: mo.label, contenedores: 0, precio_cont: 0, delay_meses: 2 }))
      }))
    };
  });
  return p;
}

function calcFrisku(paramsFrisku) {
  const ingArr = Z65();
  if(!paramsFrisku) return ingArr;
  SEASON_KEYS.forEach(sk => {
    const especies = paramsFrisku?.[sk]?.especies || [];
    especies.forEach(esp => {
      (esp.meses || []).forEach(m => {
        const cont  = Number(m.contenedores) || 0;
        const precio= Number(m.precio_cont)  || 0;
        const delay = Number(m.delay_meses)  || 2;
        if(!cont || !precio) return;
        const comision = cont * precio * 0.02; // 2% sobre venta
        // Encontrar el mes de cobro (mes de carga + delay)
        const idxCarga = mIdx(m.mes);
        if(idxCarga < 0) return;
        const idxCobro = Math.min(idxCarga + delay, 64);
        ingArr[idxCobro] += comision;
      });
    });
  });
  return ingArr;
}

// ═══════════════════════════════════════════════════════════════════
// PARAMS FRISKU FOODS — Contenedores por especie y mes
// ═══════════════════════════════════════════════════════════════════
function ParamsFrisku({selSeason, paramsFrisku, setParamsFrisku, readOnly}) {
  const datos = paramsFrisku?.[selSeason] || defaultParamsFrisku()[selSeason] || {especies:[]};
  const especies = datos.especies || [];
  const [selEsp, setSelEsp] = React.useState(0);
  const [nuevaEsp, setNuevaEsp] = React.useState("");

  function updMes(espIdx, mesIdx, field, val) {
    if(readOnly) return;
    setParamsFrisku(prev => {
      const next = JSON.parse(JSON.stringify(prev || defaultParamsFrisku()));
      if(!next[selSeason]) next[selSeason] = {especies:[]};
      const esp = next[selSeason].especies[espIdx];
      if(esp && esp.meses[mesIdx]) esp.meses[mesIdx][field] = val;
      return next;
    });
  }

  function addEspecie() {
    if(!nuevaEsp.trim() || readOnly) return;
    setParamsFrisku(prev => {
      const next = JSON.parse(JSON.stringify(prev || defaultParamsFrisku()));
      SEASON_KEYS.forEach(sk => {
        if(!next[sk]) next[sk] = {especies:[]};
        if(!next[sk].especies.find(e=>e.nombre===nuevaEsp.trim())) {
          next[sk].especies.push({
            nombre: nuevaEsp.trim(),
            meses: (next[sk].especies[0]?.meses||[]).map(m=>({mes:m.mes,contenedores:0,precio_cont:0,delay_meses:2}))
          });
        }
      });
      return next;
    });
    setNuevaEsp("");
  }

  // Calcular ingreso total para esta especie y temporada
  const calcTotalEsp = (esp) => {
    return (esp.meses||[]).reduce((s,m)=>{
      const cont=Number(m.contenedores)||0;
      const precio=Number(m.precio_cont)||0;
      return s + cont*precio*0.02;
    }, 0);
  };

  const totalTemporada = especies.reduce((s,esp)=>s+calcTotalEsp(esp),0);
  const esp = especies[selEsp] || null;

  return (
    <div>
      {/* KPI resumen */}
      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        <div style={{background:`${C.teal}22`,borderRadius:12,padding:"10px 16px",flex:1,minWidth:140}}>
          <div style={{fontSize:10,color:C.teal,fontWeight:600}}>Ingreso Temporada</div>
          <div style={{fontSize:20,fontWeight:800,color:C.teal}}>{$$(totalTemporada)}</div>
          <div style={{fontSize:9,color:C.muted}}>2% comisión sobre venta</div>
        </div>
        <div style={{background:`${C.blue}22`,borderRadius:12,padding:"10px 16px",flex:1,minWidth:140}}>
          <div style={{fontSize:10,color:C.blue,fontWeight:600}}>Contenedores totales</div>
          <div style={{fontSize:20,fontWeight:800,color:C.blue}}>
            {especies.reduce((s,esp)=>s+(esp.meses||[]).reduce((a,m)=>a+(Number(m.contenedores)||0),0),0)}
          </div>
        </div>
        <div style={{background:`${C.orange}22`,borderRadius:12,padding:"10px 16px",flex:1,minWidth:140}}>
          <div style={{fontSize:10,color:C.orange,fontWeight:600}}>Especies activas</div>
          <div style={{fontSize:20,fontWeight:800,color:C.orange}}>
            {especies.filter(esp=>(esp.meses||[]).some(m=>Number(m.contenedores)>0)).length}
          </div>
        </div>
      </div>

      {/* Selector de especie */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14,alignItems:"center"}}>
        {especies.map((esp,i)=>(
          <button key={esp.nombre} onClick={()=>setSelEsp(i)}
            style={{padding:"5px 12px",borderRadius:20,fontSize:11,fontWeight:600,cursor:"pointer",
              border:`1px solid ${selEsp===i?C.teal:C.border}`,
              background:selEsp===i?`${C.teal}33`:"transparent",
              color:selEsp===i?C.teal:C.muted}}>
            {esp.nombre}
            {calcTotalEsp(esp)>0&&<span style={{marginLeft:4,color:C.teal,fontSize:9}}>{$$(calcTotalEsp(esp))}</span>}
          </button>
        ))}
        {!readOnly&&(
          <div style={{display:"flex",gap:4}}>
            <input value={nuevaEsp} onChange={e=>setNuevaEsp(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&addEspecie()}
              placeholder="+ Nueva especie"
              style={{padding:"4px 8px",borderRadius:8,border:`1px solid ${C.border}`,
                background:C.card2,color:C.text,fontSize:11,outline:"none",width:120}}/>
            <button onClick={addEspecie}
              style={{padding:"4px 10px",borderRadius:8,background:C.teal,border:"none",
                color:"#fff",fontSize:11,cursor:"pointer",fontWeight:700}}>+</button>
          </div>
        )}
      </div>

      {/* Tabla de meses para la especie seleccionada */}
      {esp&&(
        <div style={{overflowX:"auto",minWidth:0,maxWidth:"calc(100vw - 80px)"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr style={{background:C.primary}}>
                {["Mes","Contenedores","Precio/Cont (USD)","Delay (meses)","Comisión 2%"].map(h=>(
                  <th key={h} style={{padding:"7px 12px",fontWeight:600,fontSize:10,color:C.muted,
                    textTransform:"uppercase",borderBottom:`1px solid ${C.border}`,
                    textAlign:h==="Mes"?"left":"right",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(esp.meses||[]).map((m,mi)=>{
                const cont=Number(m.contenedores)||0;
                const precio=Number(m.precio_cont)||0;
                const comision=cont*precio*0.02;
                return (
                  <tr key={m.mes} style={{borderBottom:`1px solid ${C.border}22`,
                    background:cont>0?`${C.teal}08`:"transparent"}}>
                    <td style={{padding:"6px 12px",fontWeight:600,color:C.text}}>{m.mes}</td>
                    <td style={{padding:"4px 8px",textAlign:"right"}}>
                      <input type="number" min="0" value={m.contenedores||""} readOnly={readOnly}
                        onChange={e=>updMes(selEsp,mi,"contenedores",e.target.value)}
                        style={{width:70,padding:"4px 6px",textAlign:"right",borderRadius:6,
                          border:`1px solid ${cont>0?C.teal:C.border}`,background:C.card2,
                          color:cont>0?C.teal:C.text,fontSize:11,outline:"none"}}/>
                    </td>
                    <td style={{padding:"4px 8px",textAlign:"right"}}>
                      <input type="number" min="0" value={m.precio_cont||""} readOnly={readOnly}
                        onChange={e=>updMes(selEsp,mi,"precio_cont",e.target.value)}
                        style={{width:90,padding:"4px 6px",textAlign:"right",borderRadius:6,
                          border:`1px solid ${precio>0?C.blue:C.border}`,background:C.card2,
                          color:precio>0?C.blue:C.text,fontSize:11,outline:"none"}}/>
                    </td>
                    <td style={{padding:"4px 8px",textAlign:"right"}}>
                      <select value={m.delay_meses||2} disabled={readOnly}
                        onChange={e=>updMes(selEsp,mi,"delay_meses",Number(e.target.value))}
                        style={{padding:"4px 6px",borderRadius:6,border:`1px solid ${C.border}`,
                          background:C.card2,color:C.text,fontSize:11,outline:"none"}}>
                        {[2,3].map(d=><option key={d} value={d}>{d} meses</option>)}
                      </select>
                    </td>
                    <td style={{padding:"6px 12px",textAlign:"right",fontWeight:700,
                      color:comision>0?C.teal:C.muted2}}>
                      {comision>0?$$(Math.round(comision)):"—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{background:C.bg2,borderTop:`2px solid ${C.border}`}}>
                <td style={{padding:"7px 12px",fontWeight:800,color:C.text}} colSpan={4}>Total {esp.nombre}</td>
                <td style={{padding:"7px 12px",textAlign:"right",fontWeight:800,color:C.teal}}>{$$(Math.round(calcTotalEsp(esp)))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MÓDULO AUDITORÍA — Registro de actividad del sistema
// Solo visible para admin. Retención: 24 meses.
// ═══════════════════════════════════════════════════════════════════
async function loadAuditEvents() {
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/calendario_data?id=eq.audit_log&select=value`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
    });
    const data = await res.json();
    return data?.[0]?.value?.eventos || [];
  } catch { return []; }
}

// Helper: exportar eventos auditoría a Excel
async function exportAuditoriaExcel(eventos, filtrosInfo) {
  if(!window.JSZip) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  const headers = ["Fecha/Hora","Usuario","Rol","Email","Acción","Módulo","Sección","Descripción","Campo","Valor Anterior","Valor Nuevo"];
  const rows = eventos.map(e => [
    new Date(e.timestamp).toLocaleString("es-CL"),
    e.usuario, e.rol, e.email, e.accion, e.modulo, e.seccion,
    e.descripcion, e.campo, e.valorAnterior, e.valorNuevo
  ]);

  function colLetter(n){let s="";n++;while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);}return s;}
  function escXml(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}

  const nCols = headers.length;
  const lastCol = colLetter(nCols-1);
  let rowsXml = "";

  // Título
  rowsXml += `<row r="1" ht="28" customHeight="1"><c r="A1" t="inlineStr" s="5"><is><t>🔍 Registro de Auditoría — Grupo Mediterra</t></is></c></row>`;
  rowsXml += `<row r="2" ht="18" customHeight="1"><c r="A2" t="inlineStr" s="6"><is><t>Exportado: ${new Date().toLocaleString("es-CL")}${filtrosInfo?` · ${filtrosInfo}`:""}</t></is></c></row>`;
  rowsXml += `<row r="3" ht="10" customHeight="1"></row>`;

  // Headers tabla
  rowsXml += `<row r="4" ht="22" customHeight="1">`;
  headers.forEach((h,c)=>{rowsXml += `<c r="${colLetter(c)}4" t="inlineStr" s="1"><is><t>${escXml(h)}</t></is></c>`;});
  rowsXml += `</row>`;

  rows.forEach((row,ri)=>{
    const r = ri+5;
    const sBase = ri%2===0?0:2;
    rowsXml += `<row r="${r}" ht="18" customHeight="1">`;
    row.forEach((val,c)=>{
      rowsXml += `<c r="${colLetter(c)}${r}" t="inlineStr" s="${sBase}"><is><t>${escXml(val)}</t></is></c>`;
    });
    rowsXml += `</row>`;
  });

  const tableRef = `A4:${lastCol}${rows.length+4}`;
  const merges = [`A1:${lastCol}1`, `A2:${lastCol}2`];
  const mergesXml = `<mergeCells count="${merges.length}">${merges.map(m=>`<mergeCell ref="${m}"/>`).join("")}</mergeCells>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="7">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><sz val="11"/><b/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><sz val="11"/><name val="Calibri"/></font>
    <font/><font/>
    <font><sz val="18"/><b/><color rgb="FF0F2D4A"/><name val="Calibri"/></font>
    <font><sz val="11"/><i/><color rgb="FF64748B"/><name val="Calibri"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F2D4A"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFE2E8F0"/></left><right style="thin"><color rgb="FFE2E8F0"/></right><top style="thin"><color rgb="FFE2E8F0"/></top><bottom style="thin"><color rgb="FFE2E8F0"/></bottom></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="7">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0"><alignment vertical="center"/></xf>
    <xf/><xf/>
    <xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0"><alignment horizontal="left" vertical="center" indent="1"/></xf>
    <xf numFmtId="0" fontId="6" fillId="0" borderId="0" xfId="0"><alignment horizontal="left" vertical="center" indent="1"/></xf>
  </cellXfs>
</styleSheet>`;

  const colWidths = [22,22,12,28,18,14,22,55,20,30,30];
  const colsXml = `<cols>${colWidths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join("")}</cols>`;

  const tableXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="1" name="Auditoria" displayName="Auditoria" ref="${tableRef}" totalsRowShown="0" headerRowCount="1">
  <autoFilter ref="${tableRef}"/>
  <tableColumns count="${nCols}">${headers.map((h,i)=>`<tableColumn id="${i+1}" name="${escXml(h)}"/>`).join("")}</tableColumns>
  <tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/>
</table>`;

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  ${colsXml}
  <sheetData>${rowsXml}</sheetData>
  ${mergesXml}
  <tableParts count="1"><tablePart r:id="rId1"/></tableParts>
</worksheet>`;

  const wbXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView/></bookViews>
  <sheets><sheet name="Auditoria" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const sheetRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table1.xml"/>
</Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>
</Types>`;

  const pkgRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const zip = new window.JSZip();
  zip.file("[Content_Types].xml", contentTypes);
  zip.file("_rels/.rels", pkgRels);
  zip.file("xl/workbook.xml", wbXml);
  zip.file("xl/_rels/workbook.xml.rels", wbRels);
  zip.file("xl/worksheets/sheet1.xml", sheetXml);
  zip.file("xl/worksheets/_rels/sheet1.xml.rels", sheetRels);
  zip.file("xl/styles.xml", stylesXml);
  zip.file("xl/tables/table1.xml", tableXml);

  const blob = await zip.generateAsync({type:"blob", mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Auditoria_${new Date().toISOString().slice(0,10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

function AuditoriaModule({usuario}) {
  const [eventos, setEventos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroUsuario, setFiltroUsuario] = useState("");
  const [filtroAccion, setFiltroAccion] = useState("Todos");
  const [filtroModulo, setFiltroModulo] = useState("Todos");
  const [filtroDesde, setFiltroDesde] = useState(() => {
    const d = new Date(); d.setDate(d.getDate()-30);
    return d.toISOString().slice(0,10);
  });
  const [filtroHasta, setFiltroHasta] = useState(new Date().toISOString().slice(0,10));
  const [busqueda, setBusqueda] = useState("");
  const [eventoDetalle, setEventoDetalle] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Cargar eventos
  async function recargar() {
    setCargando(true);
    const evs = await loadAuditEvents();
    setEventos(evs);
    setCargando(false);
  }

  useEffect(() => {
    recargar();
    window.auditLog("consultar", {modulo:"sistema", seccion:"auditoría",
      descripcion:"Accedió al módulo de Auditoría"});
  }, []);

  // Auto-refresh cada 30s si está activo
  useEffect(() => {
    if(!autoRefresh) return;
    const t = setInterval(recargar, 30000);
    return () => clearInterval(t);
  }, [autoRefresh]);

  // Filtrar
  const filtrado = useMemo(() => {
    const desde = filtroDesde ? new Date(filtroDesde+"T00:00:00") : null;
    const hasta = filtroHasta ? new Date(filtroHasta+"T23:59:59") : null;
    return eventos
      .filter(e => {
        const ts = new Date(e.timestamp);
        if(desde && ts < desde) return false;
        if(hasta && ts > hasta) return false;
        if(filtroUsuario && !e.usuario?.toLowerCase().includes(filtroUsuario.toLowerCase())) return false;
        if(filtroAccion !== "Todos" && e.accion !== filtroAccion) return false;
        if(filtroModulo !== "Todos" && e.modulo !== filtroModulo) return false;
        if(busqueda) {
          const q = busqueda.toLowerCase();
          const match = e.descripcion?.toLowerCase().includes(q) ||
                        e.seccion?.toLowerCase().includes(q) ||
                        e.campo?.toLowerCase().includes(q) ||
                        e.valorNuevo?.toLowerCase().includes(q) ||
                        e.valorAnterior?.toLowerCase().includes(q);
          if(!match) return false;
        }
        return true;
      })
      .sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [eventos, filtroDesde, filtroHasta, filtroUsuario, filtroAccion, filtroModulo, busqueda]);

  // Opciones únicas para filtros
  const accionesDisp = useMemo(() => ["Todos", ...Array.from(new Set(eventos.map(e=>e.accion).filter(Boolean))).sort()], [eventos]);
  const modulosDisp = useMemo(() => ["Todos", ...Array.from(new Set(eventos.map(e=>e.modulo).filter(Boolean))).sort()], [eventos]);

  // KPIs
  const kpiHoy = eventos.filter(e => {
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    return new Date(e.timestamp) >= hoy;
  }).length;
  const kpiUsuariosActivos = new Set(filtrado.map(e=>e.usuario)).size;
  const kpiEdiciones = filtrado.filter(e=>e.accion==="editar").length;
  const kpiEliminaciones = filtrado.filter(e=>e.accion==="eliminar").length;
  const kpiLogins = filtrado.filter(e=>e.accion==="login").length;
  const kpiLoginsFallidos = filtrado.filter(e=>e.accion==="login_fallido").length;

  // Colores por acción
  function colorAccion(accion) {
    const map = {
      login: "#16a34a", logout: "#64748b", login_fallido: "#dc2626",
      crear: "#3b82f6", editar: "#f59e0b", eliminar: "#ef4444",
      consultar: "#8b5cf6", exportar: "#0f766e",
      aprobar: "#16a34a", rechazar: "#dc2626",
      cambio_pin: "#f59e0b", reset_pin: "#f97316",
      cambio_permiso: "#7c3aed",
      desactivar_usuario: "#dc2626", activar_usuario: "#16a34a",
      login_pin_temporal: "#f59e0b",
    };
    return map[accion] || "#64748b";
  }

  function emojiAccion(accion) {
    const map = {
      login: "🔓", logout: "🚪", login_fallido: "⛔",
      crear: "➕", editar: "✏️", eliminar: "🗑",
      consultar: "👁", exportar: "📥",
      aprobar: "✅", rechazar: "❌",
      cambio_pin: "🔑", reset_pin: "🔄",
      cambio_permiso: "🔐",
      desactivar_usuario: "🚫", activar_usuario: "♻️",
      login_pin_temporal: "⚡",
    };
    return map[accion] || "📋";
  }

  function exportarExcel() {
    const filtros = [];
    if(filtroDesde) filtros.push(`Desde: ${filtroDesde}`);
    if(filtroHasta) filtros.push(`Hasta: ${filtroHasta}`);
    if(filtroUsuario) filtros.push(`Usuario: ${filtroUsuario}`);
    if(filtroAccion !== "Todos") filtros.push(`Acción: ${filtroAccion}`);
    if(filtroModulo !== "Todos") filtros.push(`Módulo: ${filtroModulo}`);
    if(busqueda) filtros.push(`Búsqueda: ${busqueda}`);
    exportAuditoriaExcel(filtrado, filtros.join(" · "));
    window.auditLog("exportar", {modulo:"sistema", seccion:"auditoría",
      descripcion:`Exportó ${filtrado.length} eventos de auditoría a Excel`});
  }

  if(cargando) return (
    <div style={{padding:40, textAlign:"center", color:C.muted}}>Cargando registro de auditoría...</div>
  );

  return (
    <div style={{fontFamily:"sans-serif", color:C.text}}>
      {/* Header */}
      <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:16, flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:18, fontWeight:900, color:C.text}}>🔍 Auditoría del Sistema</div>
          <div style={{fontSize:11, color:C.muted}}>
            Registro cronológico de actividad · Retención 24 meses · Solo visible para administradores
          </div>
        </div>
        <div style={{marginLeft:"auto", display:"flex", gap:8, alignItems:"center"}}>
          <label style={{display:"flex", alignItems:"center", gap:6, fontSize:11, color:C.muted, cursor:"pointer"}}>
            <input type="checkbox" checked={autoRefresh} onChange={e=>setAutoRefresh(e.target.checked)}/>
            Auto-refresh 30s
          </label>
          <button onClick={recargar}
            style={{padding:"7px 12px", borderRadius:8, background:C.card2, border:`1px solid ${C.border}`,
              color:C.muted, cursor:"pointer", fontSize:12}}>
            🔄 Recargar
          </button>
          <button onClick={exportarExcel} disabled={filtrado.length===0}
            style={{padding:"7px 14px", borderRadius:8, background:filtrado.length===0?C.muted2:C.teal,
              color:"#fff", border:"none", cursor:filtrado.length===0?"not-allowed":"pointer",
              fontSize:12, fontWeight:700}}>
            📥 Exportar Excel ({filtrado.length})
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:10, marginBottom:16}}>
        {[
          {label:"📊 Eventos totales",    val:eventos.length, color:C.blue},
          {label:"📅 Hoy",                 val:kpiHoy,         color:C.teal},
          {label:"👥 Usuarios en filtro",  val:kpiUsuariosActivos, color:"#8b5cf6"},
          {label:"✏️ Ediciones",           val:kpiEdiciones,   color:C.yellow},
          {label:"🗑 Eliminaciones",       val:kpiEliminaciones, color:C.red},
          {label:"🔓 Logins",              val:kpiLogins,      color:C.green},
          {label:"⛔ Logins fallidos",     val:kpiLoginsFallidos, color:"#dc2626"},
        ].map(k=>(
          <div key={k.label} style={{background:C.card2, borderRadius:10, padding:"12px 14px",
            border:`1px solid ${C.border}`, borderLeft:`4px solid ${k.color}`}}>
            <div style={{fontSize:10, color:C.muted, fontWeight:600, marginBottom:4}}>{k.label}</div>
            <div style={{fontSize:22, fontWeight:900, color:k.color}}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{background:C.card2, borderRadius:10, padding:"12px 14px", border:`1px solid ${C.border}`,
        marginBottom:16, display:"flex", gap:10, flexWrap:"wrap", alignItems:"center"}}>
        <span style={{fontSize:11, fontWeight:700, color:C.muted}}>Filtros:</span>
        <div>
          <div style={{fontSize:10, color:C.muted, marginBottom:2}}>Desde</div>
          <input type="date" value={filtroDesde} onChange={e=>setFiltroDesde(e.target.value)}
            style={{padding:"5px 8px", borderRadius:6, border:`1px solid ${C.border}`,
              background:C.card, color:C.text, fontSize:11, outline:"none"}}/>
        </div>
        <div>
          <div style={{fontSize:10, color:C.muted, marginBottom:2}}>Hasta</div>
          <input type="date" value={filtroHasta} onChange={e=>setFiltroHasta(e.target.value)}
            style={{padding:"5px 8px", borderRadius:6, border:`1px solid ${C.border}`,
              background:C.card, color:C.text, fontSize:11, outline:"none"}}/>
        </div>
        <div>
          <div style={{fontSize:10, color:C.muted, marginBottom:2}}>Usuario</div>
          <input type="text" placeholder="Nombre..." value={filtroUsuario} onChange={e=>setFiltroUsuario(e.target.value)}
            style={{padding:"5px 8px", borderRadius:6, border:`1px solid ${C.border}`,
              background:C.card, color:C.text, fontSize:11, outline:"none", width:140}}/>
        </div>
        <div>
          <div style={{fontSize:10, color:C.muted, marginBottom:2}}>Acción</div>
          <select value={filtroAccion} onChange={e=>setFiltroAccion(e.target.value)}
            style={{padding:"5px 8px", borderRadius:6, border:`1px solid ${C.border}`,
              background:C.card, color:C.text, fontSize:11, outline:"none"}}>
            {accionesDisp.map(a=><option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <div style={{fontSize:10, color:C.muted, marginBottom:2}}>Módulo</div>
          <select value={filtroModulo} onChange={e=>setFiltroModulo(e.target.value)}
            style={{padding:"5px 8px", borderRadius:6, border:`1px solid ${C.border}`,
              background:C.card, color:C.text, fontSize:11, outline:"none"}}>
            {modulosDisp.map(m=><option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div style={{flex:1, minWidth:180}}>
          <div style={{fontSize:10, color:C.muted, marginBottom:2}}>Búsqueda</div>
          <input type="text" placeholder="🔍 Buscar en descripción, campos..." value={busqueda} onChange={e=>setBusqueda(e.target.value)}
            style={{padding:"5px 10px", borderRadius:6, border:`1px solid ${C.border}`,
              background:C.card, color:C.text, fontSize:11, outline:"none", width:"100%", boxSizing:"border-box"}}/>
        </div>
        {(filtroUsuario||filtroAccion!=="Todos"||filtroModulo!=="Todos"||busqueda)&&(
          <button onClick={()=>{setFiltroUsuario("");setFiltroAccion("Todos");setFiltroModulo("Todos");setBusqueda("");}}
            style={{padding:"5px 12px", borderRadius:6, background:"transparent",
              border:`1px solid ${C.border}`, color:C.muted, cursor:"pointer", fontSize:11, alignSelf:"flex-end"}}>
            ✕ Limpiar
          </button>
        )}
      </div>

      {/* Tabla eventos */}
      <div style={{overflowX:"auto", borderRadius:10, border:`1px solid ${C.border}`}}>
        <table style={{width:"100%", borderCollapse:"collapse", fontSize:11}}>
          <thead>
            <tr style={{background:C.primary}}>
              <th style={{padding:"8px 10px", textAlign:"left", color:C.muted, fontWeight:700, fontSize:10}}>Fecha / Hora</th>
              <th style={{padding:"8px 10px", textAlign:"left", color:C.muted, fontWeight:700, fontSize:10}}>Usuario</th>
              <th style={{padding:"8px 10px", textAlign:"center", color:C.muted, fontWeight:700, fontSize:10}}>Acción</th>
              <th style={{padding:"8px 10px", textAlign:"center", color:C.muted, fontWeight:700, fontSize:10}}>Módulo</th>
              <th style={{padding:"8px 10px", textAlign:"left", color:C.muted, fontWeight:700, fontSize:10}}>Sección</th>
              <th style={{padding:"8px 10px", textAlign:"left", color:C.muted, fontWeight:700, fontSize:10}}>Descripción</th>
              <th style={{padding:"8px 10px", textAlign:"center", color:C.muted, fontWeight:700, fontSize:10, width:40}}></th>
            </tr>
          </thead>
          <tbody>
            {filtrado.length===0&&(
              <tr><td colSpan={7} style={{padding:40, textAlign:"center", color:C.muted2, fontSize:12}}>
                {eventos.length===0 ? "Aún no hay eventos registrados en el sistema." : "No hay eventos que coincidan con los filtros."}
              </td></tr>
            )}
            {filtrado.slice(0, 500).map((e,i)=>{
              const col = colorAccion(e.accion);
              const ts = new Date(e.timestamp);
              return (
                <tr key={e.id} style={{borderBottom:`1px solid ${C.border}22`,
                  background:i%2===0?"transparent":`${C.border}08`,
                  cursor:"pointer"}}
                  onClick={()=>setEventoDetalle(e)}>
                  <td style={{padding:"6px 10px", fontSize:10, color:C.muted, whiteSpace:"nowrap"}}>
                    <div style={{fontWeight:600, color:C.text}}>{ts.toLocaleDateString("es-CL")}</div>
                    <div style={{fontSize:9}}>{ts.toLocaleTimeString("es-CL")}</div>
                  </td>
                  <td style={{padding:"6px 10px", fontWeight:600, color:C.text}}>
                    {e.usuario}
                    {e.rol&&<div style={{fontSize:9, color:C.muted, fontWeight:400}}>{e.rol}</div>}
                  </td>
                  <td style={{padding:"6px 10px", textAlign:"center"}}>
                    <span style={{display:"inline-block", padding:"2px 8px", borderRadius:20,
                      background:`${col}22`, color:col, fontSize:10, fontWeight:700,
                      border:`1px solid ${col}44`}}>
                      {emojiAccion(e.accion)} {e.accion}
                    </span>
                  </td>
                  <td style={{padding:"6px 10px", textAlign:"center", fontSize:10, color:C.muted}}>
                    {e.modulo||"—"}
                  </td>
                  <td style={{padding:"6px 10px", fontSize:10, color:C.muted}}>{e.seccion||"—"}</td>
                  <td style={{padding:"6px 10px", color:C.text, fontSize:11, maxWidth:380,
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{e.descripcion||"—"}</td>
                  <td style={{padding:"6px 10px", textAlign:"center", color:C.muted}}>›</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtrado.length > 500 && (
        <div style={{marginTop:10, padding:"8px 14px", background:"#fef3c7", border:"1px solid #fde68a",
          borderRadius:8, fontSize:11, color:"#92400e"}}>
          ⚠️ Mostrando primeros 500 eventos de {filtrado.length} totales. Refina los filtros o exporta a Excel para ver todos.
        </div>
      )}

      {/* Modal detalle de evento */}
      {eventoDetalle&&(
        <div style={{position:"fixed", inset:0, background:"#000a", zIndex:400,
          display:"flex", alignItems:"center", justifyContent:"center", padding:20}}
          onClick={()=>setEventoDetalle(null)}>
          <div style={{background:C.card, borderRadius:14, padding:"20px 24px",
            maxWidth:640, width:"100%", boxShadow:"0 24px 64px #0009",
            border:`1px solid ${C.border}`, maxHeight:"85vh", overflowY:"auto"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:14}}>
              <span style={{fontSize:22}}>{emojiAccion(eventoDetalle.accion)}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:15, fontWeight:800, color:C.text}}>Detalle del evento</div>
                <div style={{fontSize:11, color:C.muted}}>ID: {eventoDetalle.id}</div>
              </div>
              <button onClick={()=>setEventoDetalle(null)}
                style={{background:C.card2, border:`1px solid ${C.border}`, color:C.muted,
                  borderRadius:8, padding:"5px 12px", cursor:"pointer", fontSize:12}}>Cerrar</button>
            </div>

            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12}}>
              {[
                {l:"📅 Fecha/Hora", v:new Date(eventoDetalle.timestamp).toLocaleString("es-CL")},
                {l:"👤 Usuario",    v:`${eventoDetalle.usuario} (${eventoDetalle.rol||"—"})`},
                {l:"📧 Email",      v:eventoDetalle.email||"—"},
                {l:"⚡ Acción",     v:eventoDetalle.accion},
                {l:"📦 Módulo",     v:eventoDetalle.modulo||"—"},
                {l:"📂 Sección",    v:eventoDetalle.seccion||"—"},
              ].map(x=>(
                <div key={x.l} style={{background:C.card2, borderRadius:8, padding:"8px 12px",
                  border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:10, color:C.muted, fontWeight:600}}>{x.l}</div>
                  <div style={{fontSize:12, color:C.text, fontWeight:500, marginTop:2}}>{x.v}</div>
                </div>
              ))}
            </div>

            <div style={{background:C.card2, borderRadius:8, padding:"10px 14px",
              border:`1px solid ${C.border}`, marginBottom:12}}>
              <div style={{fontSize:10, color:C.muted, fontWeight:600, marginBottom:4}}>📝 Descripción</div>
              <div style={{fontSize:13, color:C.text}}>{eventoDetalle.descripcion||"—"}</div>
            </div>

            {(eventoDetalle.campo||eventoDetalle.valorAnterior||eventoDetalle.valorNuevo)&&(
              <div style={{background:C.card2, borderRadius:8, padding:"10px 14px",
                border:`1px solid ${C.border}`, marginBottom:12}}>
                <div style={{fontSize:10, color:C.muted, fontWeight:600, marginBottom:6}}>🔄 Cambio de valor</div>
                {eventoDetalle.campo&&<div style={{fontSize:11, color:C.text, marginBottom:6}}>
                  <strong>Campo:</strong> {eventoDetalle.campo}
                </div>}
                <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8}}>
                  <div style={{background:"#fee2e244", borderRadius:6, padding:"8px 10px",
                    border:"1px solid #fecaca"}}>
                    <div style={{fontSize:9, color:"#991b1b", fontWeight:700}}>ANTES</div>
                    <div style={{fontSize:11, color:"#7f1d1d", marginTop:2, wordBreak:"break-word"}}>
                      {eventoDetalle.valorAnterior||<em style={{color:"#94a3b8"}}>(vacío)</em>}
                    </div>
                  </div>
                  <div style={{background:"#dcfce744", borderRadius:6, padding:"8px 10px",
                    border:"1px solid #bbf7d0"}}>
                    <div style={{fontSize:9, color:"#166534", fontWeight:700}}>DESPUÉS</div>
                    <div style={{fontSize:11, color:"#14532d", marginTop:2, wordBreak:"break-word"}}>
                      {eventoDetalle.valorNuevo||<em style={{color:"#94a3b8"}}>(vacío)</em>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {eventoDetalle.registroId&&(
              <div style={{fontSize:10, color:C.muted, textAlign:"right"}}>
                Registro afectado: <code style={{background:C.bg2, padding:"2px 6px",
                  borderRadius:4}}>{eventoDetalle.registroId}</code>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
