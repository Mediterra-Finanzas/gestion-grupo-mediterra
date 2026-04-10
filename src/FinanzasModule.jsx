import { useState, useEffect, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════════
// DATOS PROYECTADOS — Flujo de Caja Proyectado GM Abril 2026
// ═══════════════════════════════════════════════════════════════════

const SUPA_URL = "https://bywovqayuzodbzwsriet.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5d292cWF5dXpvZGJ6d3NyaWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODU1MDgsImV4cCI6MjA5MTI2MTUwOH0.s2x2O_CxE6rl8dBqFuyfQdMyRqSyjJQWXJXesmVGXtk";

const MESES_24 = ["Mar-26","Apr-26","May-26","Jun-26","Jul-26","Aug-26","Sep-26","Oct-26","Nov-26","Dec-26","Jan-27","Feb-27","Mar-27","Apr-27","May-27","Jun-27","Jul-27","Aug-27","Sep-27","Oct-27","Nov-27","Dec-27","Jan-28","Feb-28"];

// Semanas por mes (para el formulario de ingreso real)
const SEMANAS = {
  "Mar-26":["16-Mar","23-Mar","30-Mar"],
  "Apr-26":["06-Apr","13-Apr","20-Apr","27-Apr"],
  "May-26":["04-May","11-May","18-May","25-May"],
  "Jun-26":["01-Jun","08-Jun","15-Jun","22-Jun","29-Jun"],
  "Jul-26":["06-Jul","13-Jul","20-Jul","27-Jul"],
  "Aug-26":["03-Aug","10-Aug","17-Aug","24-Aug","31-Aug"],
  "Sep-26":["07-Sep","14-Sep","21-Sep","28-Sep"],
  "Oct-26":["05-Oct","12-Oct","19-Oct","26-Oct"],
  "Nov-26":["02-Nov","09-Nov","16-Nov","23-Nov","30-Nov"],
  "Dec-26":["07-Dec","14-Dec","21-Dec","28-Dec"],
  "Jan-27":["04-Jan","11-Jan","18-Jan","25-Jan"],
  "Feb-27":["01-Feb","08-Feb","15-Feb","22-Feb"],
  "Mar-27":["01-Mar","08-Mar","15-Mar","22-Mar","29-Mar"],
};

// Estructura completa por empresa con líneas de detalle
const EMPRESAS = {
  "Mediterra": {
    emoji:"🏢", color:"#1d4ed8", saldo_ini:3601,
    desc:"Holding · Inversiones Mediterra SpA",
    sections:[
      { cat:"ing_op", label:"Ingresos Operacionales", signo:1, lines:[
        {label:"Fee Administración / Otros Ingresos", proy:[0,80000,80000,80000,87500,87500,87500,87500,87500,87500,87500,87500,87500,87500,87500,87500,87500,87500,87500,87500,87500,87500,87500,87500]},
        {label:"Cuentas por Cobrar",                  proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
      { cat:"egr_fijo", label:"Costos Fijos / SG&A", signo:-1, lines:[
        {label:"Remuneración Administración",  proy:[50000,50000,50000,50000,50000,50000,50000,50000,50000,50000,50000,50000,50000,50000,50000,50000,50000,50000,50000,50000,50000,50000,50000,50000]},
        {label:"Fee Administración",           proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Arriendo Oficina",             proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Gastos Legales",               proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Gastos Viajes Nacionales",     proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Gastos Viajes Internacionales",proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Alojamiento",                  proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
      { cat:"egr_nop", label:"Egresos No Operacionales", signo:-1, lines:[
        {label:"Pago Préstamos - Total",  proy:[32000,32000,32000,131300,32000,32000,101300,32000,32000,101300,32000,32000,101300,32000,32000,101300,0,0,0,0,0,0,0,0]},
        {label:"Leyes Sociales Laborales",proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Pago F-29",               proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
    ],
    flujo:[-82000,-2000,-2000,-101300,5500,5500,-63800,5500,5500,-63800,5500,5500,-63800,5500,5500,-63800,37500,37500,37500,37500,37500,37500,37500,37500],
    acum:[-78399,-80399,-82399,-183699,-178199,-172699,-236499,-230999,-225499,-289299,-283799,-278299,-342099,-336599,-331099,-394899,-357399,-319899,-282399,-244899,-207399,-169899,-132399,-94899],
  },
  "Allegria Foods": {
    emoji:"🍒", color:"#b91c1c", saldo_ini:17433,
    desc:"Exportación frutas · Chile",
    sections:[
      { cat:"ing_op", label:"Ingresos Operacionales", signo:1, lines:[
        {label:"Anticipo Cerezas",        proy:[0,0,0,0,0,0,0,0,0,700500,1152750,1152750,3513057,0,0,700500,0,0,0,0,1482000,0,0,1152750]},
        {label:"Liquidación Cerezas",     proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Arándanos Perú",          proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Liquidación Ciruelas",    proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Ingresos por Paltas",     proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Ingreso Allegria Service",proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Cuentas por Cobrar",      proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
      { cat:"egr_var", label:"Costos Variables", signo:-1, lines:[
        {label:"Costo Fruta Exportación",    proy:[0,0,0,316534,0,0,316534,0,0,316534,0,0,949602,0,0,316534,0,0,0,0,632535,0,0,0]},
        {label:"Materiales",                 proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Servicios de Packing",       proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Comisión Exportadora",       proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Seguros Exportación",        proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Servicios Terceros/Bodegas", proy:[0,0,0,316534,0,0,211728,0,0,0,0,0,0,0,0,316534,0,0,0,0,0,0,0,0]},
      ]},
      { cat:"egr_fijo", label:"Costos Fijos / SG&A", signo:-1, lines:[
        {label:"Remuneración Administración",  proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Arriendo Vehículos",           proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Gastos Legales",               proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Fee Administración",           proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Gastos Viajes Nacionales",     proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Gastos Viajes Internacionales",proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
      { cat:"egr_nop", label:"Egresos No Operacionales", signo:-1, lines:[
        {label:"Pago Préstamos Bullet (Nov-26)", proy:[0,0,0,0,0,0,0,0,0,499864,0,783199,0,0,0,0,0,0,0,0,111001,0,0,0]},
        {label:"Leyes Sociales Laborales",       proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
    ],
    flujo:[0,0,0,-633068,-223335,-223335,-609815,-223335,-223335,-1421822,-475920,304002,2066742,-258072,-543715,-1095359,56000,40850,-639000,477000,377000,-437000,-792000,170500],
    acum:[17433,17433,17433,-615635,-838970,-1062305,-1672120,-1895455,-2118790,-3540612,-4016532,-3712530,-1645788,-1903860,-2447575,-3542934,-3486934,-3446084,-4085084,-3608084,-3231084,-3668084,-4460084,-4289584],
  },
  "Allegria Service": {
    emoji:"🏭", color:"#92400e", saldo_ini:5519,
    desc:"Procesamiento · Packing",
    sections:[
      { cat:"ing_op", label:"Ingresos Operacionales", signo:1, lines:[
        {label:"Proceso de Cerezas",  proy:[0,0,0,0,0,0,0,0,0,240000,240000,0,1048000,0,0,240000,0,0,0,0,240000,0,0,240000]},
        {label:"Procesos de Ciruelas",proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Cuentas por Cobrar",  proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
      { cat:"egr_var", label:"Costos Variables", signo:-1, lines:[
        {label:"Costo Directo Variable de Proceso",proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
      { cat:"egr_fijo", label:"Costos Fijos / SG&A", signo:-1, lines:[
        {label:"Remuneración Administración",  proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Fee Administración",           proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Gastos Legales",               proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
      { cat:"egr_nop", label:"Egresos No Operacionales", signo:-1, lines:[
        {label:"Pago Leasing BCI",         proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Leyes Sociales Laborales", proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
    ],
    flujo:[0,0,0,0,0,0,0,0,0,240000,240000,0,1048000,0,0,240000,0,0,0,0,240000,0,0,240000],
    acum:[5519,5519,5519,5519,5519,5519,5519,5519,5519,245519,485519,485519,1533519,1533519,1533519,1773519,1773519,1773519,1773519,1773519,2013519,2013519,2013519,2253519],
  },
  "Frisku Foods": {
    emoji:"🚢", color:"#0e7490", saldo_ini:132828,
    desc:"Carga contenedores · Logística",
    sections:[
      { cat:"ing_op", label:"Ingresos Operacionales", signo:1, lines:[
        {label:"Ingreso Carga Contenedores",proy:[0,0,0,0,50500,35350,101000,50500,35350,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Otros Ingresos",            proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Cuentas por Cobrar",        proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
      { cat:"egr_var", label:"Costos Variables", signo:-1, lines:[
        {label:"Costo Directo Variable",proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
      { cat:"egr_fijo", label:"Costos Fijos / SG&A", signo:-1, lines:[
        {label:"Remuneración Administración",  proy:[25274,25274,25274,25274,25274,25274,25274,25274,25274,25274,25274,25274,25274,25274,25274,25274,25274,25274,25274,25274,25274,25274,25274,25274]},
        {label:"Fee Administración",           proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Gastos Legales",               proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
      { cat:"egr_nop", label:"Egresos No Operacionales", signo:-1, lines:[
        {label:"Banco Security (cuotas)",  proy:[0,109857,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Banco BICE (bullet)",      proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Leyes Sociales Laborales", proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
    ],
    flujo:[-25274,-135131,-25274,-25274,25226,10076,75726,25226,10076,-25274,-25274,-25274,-25274,-25274,-25274,-25274,-25274,-25274,-25274,-25274,-25274,-25274,-25274,-25274],
    acum:[107554,-27577,-52852,-78126,-52900,-42824,32902,58128,68204,42930,17656,-7618,-32892,-58166,-83440,-108714,-133988,-159262,-184536,-209810,-235084,-260358,-285632,-310906],
  },
  "Frisku Peru": {
    emoji:"🇵🇪", color:"#6d28d9", saldo_ini:1251,
    desc:"Operaciones · Perú",
    sections:[
      { cat:"ing_op", label:"Ingresos Operacionales", signo:1, lines:[
        {label:"Otros Ingresos Operacionales",proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Cuentas por Cobrar",          proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
      { cat:"egr_var", label:"Costos Variables", signo:-1, lines:[
        {label:"Costos Variables Operacionales",proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
      { cat:"egr_fijo", label:"Costos Fijos / SG&A", signo:-1, lines:[
        {label:"Remuneración Administración",  proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Fee Administración",           proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Gastos Legales",               proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
    ],
    flujo:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    acum:[1251,1251,1251,1251,1251,1251,1251,1251,1251,1251,1251,1251,1251,1251,1251,1251,1251,1251,1251,1251,1251,1251,1251,1251],
  },
  "Allpa Farms": {
    emoji:"🌸", color:"#dc2626", saldo_ini:1828,
    desc:"Farming cerezas · Chile",
    sections:[
      { cat:"ing_op", label:"Ingresos Operacionales", signo:1, lines:[
        {label:"Ingreso Exportación Cerezas",proy:[0,0,0,0,0,0,0,0,152312,304624,0,0,913872,0,0,304624,0,0,0,0,320000,576000,0,0]},
        {label:"Ingreso Cerezas Nacionales", proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Otros Ingresos",             proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Cuentas por Cobrar",         proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
      { cat:"egr_var", label:"Costos Variables", signo:-1, lines:[
        {label:"Remuneración Cosecha",          proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Contratista Cosecha",           proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Transporte",                    proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Remuneración Operacional",      proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Electricidad",                  proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Servicio de Terceros",          proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Flete Nacional",                proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Mantención Máquinas y Equipos", proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Mantención Vehículos",          proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Mantención de Campo",           proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
      { cat:"egr_fijo", label:"Costos Fijos / SG&A", signo:-1, lines:[
        {label:"Remuneración Administración",  proy:[0,0,0,0,0,0,0,0,0,0,14400,14400,14400,14400,14400,14400,14400,14400,14400,14400,14400,14400,14400,14400]},
        {label:"Asesoría Técnica",             proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Arriendo Oficina",             proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Fee Administración",           proy:[0,0,0,0,0,0,0,0,0,0,0,0,371696,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
      { cat:"egr_nop", label:"Egresos No Operacionales", signo:-1, lines:[
        {label:"Banco de Chile (hipotecario)",proy:[0,0,0,476021,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Leyes Sociales Laborales",   proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
    ],
    flujo:[0,0,0,-476021,0,0,0,0,152312,304624,-14400,-14400,527876,-14400,-14400,290224,-14400,-14400,-14400,-14400,305600,561600,-14400,-14400],
    acum:[1828,1828,1828,-474193,-474193,-474193,-474193,-474193,-321881,-17257,-31657,-46057,481819,467419,453019,743243,728843,714443,700043,685643,991243,1552843,1538443,1524043],
  },
  "Allpa Farms Perú": {
    emoji:"🫐", color:"#7c3aed", saldo_ini:208000,
    desc:"Farming arándanos · Perú",
    sections:[
      { cat:"ing_op", label:"Ingresos Operacionales", signo:1, lines:[
        {label:"Exportación Arándanos",    proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Venta Arándanos Nacional", proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Otros Ingresos",           proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Cuentas por Cobrar",       proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
      { cat:"egr_var", label:"Costos Variables", signo:-1, lines:[
        {label:"Costo Fruta Exportación",      proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Materiales",                   proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Servicios de Packing",         proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Seguros Exportación",          proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Servicios Terceros Exportación",proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Arriendo Bodegas",             proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
      { cat:"egr_fijo", label:"Costos Fijos / SG&A", signo:-1, lines:[
        {label:"Remuneración Administración",  proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Fee Administración",           proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Gastos Legales",               proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
    ],
    flujo:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    acum:[208000,208000,208000,208000,208000,208000,208000,208000,208000,208000,208000,208000,208000,208000,208000,208000,208000,208000,208000,208000,208000,208000,208000,208000],
  },
  "Integrity Farms": {
    emoji:"🌾", color:"#15803d", saldo_ini:604,
    desc:"Administración agrícola (US$2.000/há)",
    sections:[
      { cat:"ing_op", label:"Ingresos Operacionales", signo:1, lines:[
        {label:"Ingreso Administración (us$2.000/ha)",proy:[0,172000,0,0,0,0,0,0,0,0,172000,0,172000,0,172000,0,0,0,0,0,172000,0,172000,0]},
        {label:"Otros Ingresos",                     proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Cuentas por Cobrar",                 proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
      { cat:"egr_var", label:"Costos Variables", signo:-1, lines:[
        {label:"Costo Directo Variable",proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
      { cat:"egr_fijo", label:"Costos Fijos / SG&A", signo:-1, lines:[
        {label:"Remuneración Administración",  proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Arriendo Vehículos",           proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Arriendo Oficina",             proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Fee Administración",           proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Gastos Viajes Nacionales",     proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
      { cat:"egr_nop", label:"Egresos No Operacionales", signo:-1, lines:[
        {label:"Pago Préstamos - Total",  proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Leyes Sociales Laborales",proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
    ],
    flujo:[0,172000,0,0,0,0,0,0,0,0,172000,0,172000,0,172000,0,0,0,0,0,172000,0,172000,0],
    acum:[604,172604,172604,172604,172604,172604,172604,172604,172604,172604,344604,344604,516604,516604,688604,688604,688604,688604,688604,688604,860604,860604,1032604,1032604],
  },
  "Osiris": {
    emoji:"🌱", color:"#0f766e", saldo_ini:40188,
    desc:"Royalties · Fee Viveros · Osiris Plant Mgmt",
    sections:[
      { cat:"ing_op", label:"Ingresos Operacionales", signo:1, lines:[
        {label:"Royalty por Planta",  proy:[0,0,0,0,0,0,0,0,1100000,0,0,0,2200000,0,0,1100000,0,0,0,0,1100000,1100000,0,0]},
        {label:"Royalty Comercial",   proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Fee Vivero",          proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Cuentas por Cobrar",  proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
      { cat:"egr_var", label:"Costos Variables", signo:-1, lines:[
        {label:"Costo Directo Variable",proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
      { cat:"egr_fijo", label:"Costos Fijos / SG&A", signo:-1, lines:[
        {label:"Remuneración Administración",  proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Arriendo Vehículos",           proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Arriendo Oficina",             proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Gastos Legales",               proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Fee Administración",           proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Gastos Viajes Nacionales",     proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Gastos Viajes Internacionales",proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Alojamiento",                  proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
      { cat:"egr_nop", label:"Egresos No Operacionales", signo:-1, lines:[
        {label:"Banco Security (cuotas)", proy:[9178,9178,9178,9178,9178,9178,9178,9178,9178,9178,0,0,0,0,0,9178,0,0,0,0,0,0,0,0]},
        {label:"BCI (bullet Jun-26)",     proy:[0,0,0,355425,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
        {label:"Leyes Sociales Laborales",proy:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
      ]},
    ],
    flujo:[-18356,-18356,-18356,-729206,-18356,-18356,-729206,-18356,1081644,-729206,0,0,1489150,0,0,370794,0,0,-710850,0,1100000,1100000,-710850,0],
    acum:[21832,3476,-14881,-744087,-762443,-780799,-1510005,-1528362,-446718,-1175924,-1175924,-1175924,313226,313226,313226,684020,684020,684020,-26830,-26830,1073170,2173170,1462320,1462320],
  },
};

// Créditos
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
// COLORES — Verde oscuro finanzas
// ═══════════════════════════════════════════════════════════════════
const C = {
  bg:"#071810",       // verde muy oscuro
  bg2:"#0a2218",      // fondo card
  card:"#0d2b1e",     // cards
  card2:"#112e20",    // cards secundarias
  border:"#1a4d32",   // bordes
  border2:"#236640",  // bordes hover
  text:"#e2f5ec",
  muted:"#6aad8a",
  muted2:"#4a8066",
  green:"#22c55e",
  red:"#f87171",
  blue:"#60a5fa",
  yellow:"#fbbf24",
  orange:"#fb923c",
  accent:"#16a34a",   // verde acento
  accentL:"#22c55e",
};

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════
const $$ = n => {
  if (n == null || n === "") return "—";
  const abs=Math.abs(n), s=n<0?"-":"";
  if(abs>=1_000_000) return `${s}$${(abs/1e6).toFixed(2)}M`;
  if(abs>=1_000)     return `${s}$${(abs/1e3).toFixed(0)}K`;
  return `${s}$${abs.toLocaleString()}`;
};
const fmtDate = s => {
  if(!s) return "—";
  try { const d=new Date(s); return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`; }
  catch{ return s.slice(0,10); }
};
const cf = v => v >= 0 ? C.green : C.red;

const CAT_COLOR = {
  ing_op: C.green, ing_nop: "#34d399",
  egr_var: C.red, egr_fijo: "#f87171", egr_nop: "#fca5a5", imp: C.orange,
};
const CAT_SIGNO = { ing_op:"+", ing_nop:"+", egr_var:"−", egr_fijo:"−", egr_nop:"−", imp:"−" };

// ═══════════════════════════════════════════════════════════════════
// SUPABASE
// ═══════════════════════════════════════════════════════════════════
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
// COMPONENTES UI BASE
// ═══════════════════════════════════════════════════════════════════
function Card({ children, style={} }) {
  return <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12,
    padding:"16px 18px", ...style }}>{children}</div>;
}
function SectionTitle({ children }) {
  return <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:"uppercase",
    letterSpacing:"0.8px", marginBottom:12 }}>{children}</div>;
}
function KPI({ label, value, color=C.green, small=false }) {
  return (
    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 16px" }}>
      <div style={{ fontSize:10, color:C.muted, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:small?15:18, fontWeight:800, color }}>{value}</div>
    </div>
  );
}
function Btn({ onClick, active, children, color=C.accent }) {
  return (
    <button onClick={onClick}
      style={{ padding:"6px 14px", borderRadius:8, cursor:"pointer", fontWeight:600, fontSize:11,
        border:`1px solid ${active?color:C.border}`,
        background:active?`${color}33`:"transparent",
        color:active?color:C.muted }}>
      {children}
    </button>
  );
}

// Mini line chart
function LineChart({ months, values, color=C.accentL, h=72 }) {
  const W=460, pad={l:52,r:8,t:6,b:18};
  const iw=W-pad.l-pad.r, ih=h-pad.t-pad.b;
  const min=Math.min(...values), max=Math.max(...values), range=max-min||1;
  const tx=i=>pad.l+(i/(values.length-1))*iw;
  const ty=v=>pad.t+ih-((v-min)/range)*ih;
  const pts=values.map((v,i)=>[tx(i),ty(v)]);
  const poly=pts.map(([x,y])=>`${x},${y}`).join(" ");
  const area=`M${pts[0][0]},${h-pad.b} `+pts.map(([x,y])=>`L${x},${y}`).join(" ")+` L${pts[pts.length-1][0]},${h-pad.b} Z`;
  const zy=ty(0);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${h}`} style={{display:"block"}}>
      <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.25"/>
        <stop offset="100%" stopColor={color} stopOpacity="0.02"/>
      </linearGradient></defs>
      <line x1={pad.l} x2={W-pad.r} y1={zy} y2={zy} stroke={C.border2} strokeWidth={1} strokeDasharray="3,3"/>
      <path d={area} fill="url(#g1)"/>
      <polyline points={poly} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round"/>
      {pts.map(([x,y],i)=>{
        const isL=i===pts.length-1;
        if(!isL&&i%4!==0) return null;
        return <circle key={i} cx={x} cy={y} r={isL?3:2} fill={cf(values[i])}/>;
      })}
      {months.map((m,i)=>{
        if(i%4!==0&&i!==months.length-1) return null;
        return <text key={i} x={tx(i)} y={h-1} textAnchor="middle" fontSize={7} fill={C.muted}>{m}</text>;
      })}
      {[0,1].map(p=>(
        <text key={p} x={pad.l-3} y={pad.t+ih-p*ih+3} textAnchor="end" fontSize={7} fill={C.muted}>
          {$$(Math.round(min+p*range))}
        </text>
      ))}
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MODAL INGRESO REAL — por semana y línea
// ═══════════════════════════════════════════════════════════════════
function ModalIngreso({ empresa, mes, semana, realData, onSave, onClose }) {
  const emp = EMPRESAS[empresa];
  // Build form state from all lines across all sections
  const allLines = emp.sections.flatMap(s =>
    s.lines.map(l => ({ cat: s.cat, label: l.label, signo: s.signo }))
  );
  const existing = realData?.[empresa]?.[mes]?.[semana] || {};
  const [vals, setVals] = useState(() => {
    const init = {};
    allLines.forEach(l => { init[l.label] = existing[l.label] ?? ""; });
    return init;
  });
  const [saving, setSaving] = useState(false);

  const totalIng = allLines
    .filter(l => l.signo > 0)
    .reduce((a,l) => a + (Number(vals[l.label])||0), 0);
  const totalEgr = allLines
    .filter(l => l.signo < 0)
    .reduce((a,l) => a + (Number(vals[l.label])||0), 0);
  const flujoNeto = totalIng - totalEgr;

  const handleSave = async () => {
    setSaving(true);
    const clean = {};
    allLines.forEach(l => { if(Number(vals[l.label])||0) clean[l.label] = Number(vals[l.label]); });
    await onSave(empresa, mes, semana, clean);
    setSaving(false);
    onClose();
  };

  const inputStyle = {
    width:"100%", padding:"7px 10px", background:C.card2,
    border:`1px solid ${C.border}`, borderRadius:6,
    color:C.text, fontSize:12, boxSizing:"border-box",
    fontFamily:"inherit", outline:"none", textAlign:"right",
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:400,
      display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"20px",overflowY:"auto"}}>
      <div style={{background:C.bg2,border:`1px solid ${emp.color}55`,borderRadius:16,
        width:560,maxWidth:"95vw",boxShadow:"0 24px 64px rgba(0,0,0,0.7)"}}>
        {/* Header */}
        <div style={{padding:"18px 22px",borderBottom:`1px solid ${C.border}`,
          display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:26}}>{emp.emoji}</span>
          <div style={{flex:1}}>
            <div style={{fontSize:14,fontWeight:800,color:C.text}}>{empresa}</div>
            <div style={{fontSize:11,color:C.muted}}>Semana {semana} · {mes}</div>
          </div>
          <button onClick={onClose}
            style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:20,lineHeight:1}}>×</button>
        </div>

        {/* Formulario por sección */}
        <div style={{padding:"16px 22px",maxHeight:"60vh",overflowY:"auto"}}>
          {emp.sections.map(sec => (
            <div key={sec.cat} style={{marginBottom:18}}>
              <div style={{fontSize:10,fontWeight:700,color:CAT_COLOR[sec.cat]||C.muted,
                textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:8,
                display:"flex",alignItems:"center",gap:6}}>
                <span style={{width:16,height:16,borderRadius:4,background:`${CAT_COLOR[sec.cat]}22`,
                  border:`1px solid ${CAT_COLOR[sec.cat]}55`,display:"inline-flex",alignItems:"center",
                  justifyContent:"center",fontSize:9,flexShrink:0}}>{CAT_SIGNO[sec.cat]}</span>
                {sec.label}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {sec.lines.map(line => (
                  <div key={line.label} style={{display:"grid",gridTemplateColumns:"1fr 130px",gap:8,alignItems:"center"}}>
                    <div style={{fontSize:11,color:C.text,paddingLeft:4}}>{line.label}</div>
                    <input
                      type="number" min="0" placeholder="0"
                      value={vals[line.label]}
                      onChange={e=>setVals(p=>({...p,[line.label]:e.target.value}))}
                      style={inputStyle}
                      onFocus={e=>e.target.style.border=`1px solid ${emp.color}88`}
                      onBlur={e=>e.target.style.border=`1px solid ${C.border}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Resumen + botones */}
        <div style={{padding:"14px 22px",borderTop:`1px solid ${C.border}`}}>
          <div style={{display:"flex",gap:16,marginBottom:14,fontSize:12}}>
            <div style={{flex:1,background:C.card2,borderRadius:8,padding:"8px 12px",
              border:`1px solid ${C.border}`}}>
              <div style={{fontSize:9,color:C.muted,marginBottom:2}}>INGRESOS</div>
              <div style={{fontWeight:800,color:C.green}}>{$$(totalIng)}</div>
            </div>
            <div style={{flex:1,background:C.card2,borderRadius:8,padding:"8px 12px",
              border:`1px solid ${C.border}`}}>
              <div style={{fontSize:9,color:C.muted,marginBottom:2}}>EGRESOS</div>
              <div style={{fontWeight:800,color:C.red}}>{$$(totalEgr)}</div>
            </div>
            <div style={{flex:1,background:C.card2,borderRadius:8,padding:"8px 12px",
              border:`1px solid ${C.border}`}}>
              <div style={{fontSize:9,color:C.muted,marginBottom:2}}>FLUJO NETO</div>
              <div style={{fontWeight:800,color:cf(flujoNeto)}}>{$$(flujoNeto)}</div>
            </div>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <button onClick={onClose}
              style={{padding:"8px 20px",borderRadius:8,border:`1px solid ${C.border}`,
                background:"transparent",color:C.muted,cursor:"pointer",fontSize:13}}>
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{padding:"8px 22px",borderRadius:8,border:"none",
                background:saving?"#555":emp.color,color:"#fff",
                cursor:"pointer",fontSize:13,fontWeight:700}}>
              {saving?"Guardando…":"💾 Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SECCIÓN: FLUJO POR EMPRESA
// ═══════════════════════════════════════════════════════════════════
function FlujoEmpresa({ empNombre, realData, onSaveReal, canEdit }) {
  const emp = EMPRESAS[empNombre];
  const [mesIdx,    setMesIdx]    = useState(0);
  const [vista,     setVista]     = useState("tabla");    // tabla | detalle | semanas
  const [openSec,   setOpenSec]   = useState({});         // sección expandida
  const [modal,     setModal]     = useState(null);        // {mes, semana}

  // Agregar reales semanales → mensuales
  const realMensual = {};
  MESES_24.forEach(mes => {
    const semsData = realData?.[empNombre]?.[mes] || {};
    const lines = {};
    Object.values(semsData).forEach(semVals => {
      Object.entries(semVals).forEach(([lbl, v]) => {
        lines[lbl] = (lines[lbl]||0) + (Number(v)||0);
      });
    });
    realMensual[mes] = lines;
  });

  // Por mes: totales reales por sección
  const realSecTotales = (mes, cat, signo) => {
    const lines = realMensual[mes] || {};
    const sec = emp.sections.find(s=>s.cat===cat);
    if(!sec) return null;
    const total = sec.lines.reduce((a,l)=>a+(lines[l.label]||0), 0);
    return total > 0 ? total : null;
  };

  // Flujo real mensual
  const realFlujo = MESES_24.map(mes => {
    const lines = realMensual[mes] || {};
    if(Object.keys(lines).length===0) return null;
    let flujo = 0;
    emp.sections.forEach(sec => {
      sec.lines.forEach(l => { flujo += (lines[l.label]||0) * sec.signo; });
    });
    return flujo;
  });

  // Saldo acumulado real
  let acc = emp.saldo_ini;
  const realAcum = MESES_24.map((mes,i) => {
    if(realFlujo[i]===null) return null;
    acc += realFlujo[i];
    return acc;
  });

  const mes = MESES_24[mesIdx];
  const semanas = SEMANAS[mes] || [];
  const hasReal = realFlujo.some(v=>v!==null);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {/* Header empresa */}
      <div style={{background:`${emp.color}15`,border:`1px solid ${emp.color}44`,
        borderRadius:12,padding:"14px 18px",display:"flex",alignItems:"center",
        gap:14,flexWrap:"wrap"}}>
        <span style={{fontSize:28}}>{emp.emoji}</span>
        <div style={{flex:1}}>
          <div style={{fontSize:14,fontWeight:900,color:C.text}}>{empNombre}</div>
          <div style={{fontSize:11,color:C.muted}}>{emp.desc}</div>
        </div>
        <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
          {[
            {l:"Saldo inicial",   v:emp.saldo_ini,                            c:C.blue},
            {l:"Flujo proy. 24m", v:emp.flujo.reduce((a,b)=>a+b,0),          c:cf(emp.flujo.reduce((a,b)=>a+b,0))},
            {l:"Saldo final proy",v:emp.acum[emp.acum.length-1],              c:cf(emp.acum[emp.acum.length-1])},
          ].map(k=>(
            <div key={k.l} style={{textAlign:"right"}}>
              <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:"0.4px"}}>{k.l}</div>
              <div style={{fontSize:13,fontWeight:800,color:k.c}}>{$$(k.v)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        <Btn active={vista==="tabla"}   onClick={()=>setVista("tabla")}   color={emp.color}>📋 Resumen Mensual</Btn>
        <Btn active={vista==="detalle"} onClick={()=>setVista("detalle")} color={emp.color}>📂 Detalle por Línea</Btn>
        {canEdit&&<Btn active={vista==="semanas"} onClick={()=>setVista("semanas")} color={emp.color}>✏️ Ingresar Real</Btn>}
      </div>

      {/* ── TABLA RESUMEN MENSUAL ── */}
      {vista==="tabla"&&(
        <div>
          {hasReal&&(
            <Card style={{marginBottom:12}}>
              <SectionTitle>Saldo Acumulado — Proyectado vs Real</SectionTitle>
              <LineChart months={MESES_24} values={emp.acum} color={`${emp.color}`}/>
              {/* Real overlay simple */}
              <div style={{fontSize:10,color:C.muted,marginTop:6}}>
                {realAcum.filter(v=>v!==null).length} meses con datos reales ingresados
              </div>
            </Card>
          )}
          <Card style={{padding:0,overflow:"hidden"}}>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr style={{background:"rgba(255,255,255,0.03)"}}>
                    {["Mes","Ing. Op.","Egr. Var.","Egr. Fijo","Egr. NoOp","Flujo Proy.","Saldo Acum.","Real Flujo","Real Acum."].map(h=>(
                      <th key={h} style={{padding:"9px 12px",fontWeight:600,fontSize:10,color:C.muted,
                        textTransform:"uppercase",letterSpacing:"0.4px",
                        borderBottom:`1px solid ${C.border}`,textAlign:h==="Mes"?"left":"right",
                        whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MESES_24.map((m,i)=>{
                    const secTotales = {};
                    emp.sections.forEach(s => {
                      secTotales[s.cat] = s.lines.reduce((a,l)=>a+l.proy[i],0);
                    });
                    const rf = realFlujo[i];
                    const ra = realAcum[i];
                    const hasR = rf!==null;
                    return(
                      <tr key={i} onClick={()=>setMesIdx(i)} style={{cursor:"pointer",
                        borderBottom:`1px solid ${C.border}22`,
                        background:i===mesIdx?`${emp.color}18`:hasR?`${C.green}08`:i%2===0?"transparent":"rgba(255,255,255,0.01)"}}>
                        <td style={{padding:"8px 12px",fontWeight:i===mesIdx?800:600,
                          color:i===mesIdx?emp.color:C.text}}>{m}</td>
                        <td style={{padding:"8px 12px",textAlign:"right",color:secTotales.ing_op>0?C.green:C.muted,fontSize:11}}>
                          {secTotales.ing_op>0?$$(secTotales.ing_op):"—"}
                        </td>
                        <td style={{padding:"8px 12px",textAlign:"right",color:secTotales.egr_var>0?C.red:C.muted,fontSize:11}}>
                          {secTotales.egr_var>0?$$(secTotales.egr_var):"—"}
                        </td>
                        <td style={{padding:"8px 12px",textAlign:"right",color:secTotales.egr_fijo>0?C.red:C.muted,fontSize:11}}>
                          {secTotales.egr_fijo>0?$$(secTotales.egr_fijo):"—"}
                        </td>
                        <td style={{padding:"8px 12px",textAlign:"right",color:secTotales.egr_nop>0?C.red:C.muted,fontSize:11}}>
                          {secTotales.egr_nop>0?$$(secTotales.egr_nop):"—"}
                        </td>
                        <td style={{padding:"8px 12px",textAlign:"right",fontWeight:700,color:cf(emp.flujo[i])}}>
                          {$$(emp.flujo[i])}
                        </td>
                        <td style={{padding:"8px 12px",textAlign:"right",fontWeight:600,color:cf(emp.acum[i])}}>
                          {$$(emp.acum[i])}
                        </td>
                        <td style={{padding:"8px 12px",textAlign:"right",fontWeight:hasR?700:400,
                          color:hasR?cf(rf):C.muted2}}>
                          {hasR?$$(rf):"—"}
                        </td>
                        <td style={{padding:"8px 12px",textAlign:"right",fontWeight:hasR?600:400,
                          color:hasR?cf(ra):C.muted2}}>
                          {hasR?$$(ra):"—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ── DETALLE POR LÍNEA ── */}
      {vista==="detalle"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {/* Selector mes */}
          <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
            <span style={{fontSize:11,color:C.muted,marginRight:4}}>Mes:</span>
            {MESES_24.map((m,i)=>(
              <button key={m} onClick={()=>setMesIdx(i)}
                style={{padding:"4px 9px",borderRadius:6,fontSize:10,fontWeight:600,cursor:"pointer",
                  border:`1px solid ${mesIdx===i?emp.color:C.border}`,
                  background:mesIdx===i?`${emp.color}33`:"transparent",
                  color:mesIdx===i?emp.color:C.muted}}>
                {m}
              </button>
            ))}
          </div>

          {/* Secciones expandibles */}
          {emp.sections.map(sec=>{
            const isOpen = openSec[sec.cat]!==false; // default open
            const proy_total = sec.lines.reduce((a,l)=>a+l.proy[mesIdx],0);
            const lines_real = realMensual[mes] || {};
            const real_total = sec.lines.reduce((a,l)=>a+(lines_real[l.label]||0),0);
            const hasRealSec = real_total > 0;
            return(
              <div key={sec.cat} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden"}}>
                {/* Header sección */}
                <button onClick={()=>setOpenSec(p=>({...p,[sec.cat]:!isOpen}))}
                  style={{width:"100%",padding:"12px 16px",background:"transparent",border:"none",
                    cursor:"pointer",display:"flex",alignItems:"center",gap:10,textAlign:"left"}}>
                  <span style={{width:24,height:24,borderRadius:6,background:`${CAT_COLOR[sec.cat]}22`,
                    border:`1px solid ${CAT_COLOR[sec.cat]}55`,display:"flex",alignItems:"center",
                    justifyContent:"center",fontSize:11,color:CAT_COLOR[sec.cat],fontWeight:800,flexShrink:0}}>
                    {CAT_SIGNO[sec.cat]}
                  </span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:700,color:C.text}}>{sec.label}</div>
                  </div>
                  <div style={{display:"flex",gap:16,alignItems:"center"}}>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:9,color:C.muted}}>PROYECTADO</div>
                      <div style={{fontSize:12,fontWeight:700,color:CAT_COLOR[sec.cat]}}>{proy_total!==0?$$(proy_total):"—"}</div>
                    </div>
                    {hasRealSec&&(
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:9,color:C.muted}}>REAL</div>
                        <div style={{fontSize:12,fontWeight:700,color:C.yellow}}>{$$(real_total)}</div>
                      </div>
                    )}
                    <span style={{color:C.muted,fontSize:12}}>{isOpen?"▾":"▸"}</span>
                  </div>
                </button>

                {/* Líneas */}
                {isOpen&&(
                  <div style={{borderTop:`1px solid ${C.border}`}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                      <thead>
                        <tr style={{background:"rgba(0,0,0,0.2)"}}>
                          <th style={{padding:"6px 16px",textAlign:"left",fontWeight:600,color:C.muted,fontSize:10}}>Línea</th>
                          <th style={{padding:"6px 14px",textAlign:"right",fontWeight:600,color:C.muted,fontSize:10}}>Proyectado</th>
                          <th style={{padding:"6px 14px",textAlign:"right",fontWeight:600,color:C.muted,fontSize:10}}>Real</th>
                          <th style={{padding:"6px 14px",textAlign:"right",fontWeight:600,color:C.muted,fontSize:10}}>Desv.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sec.lines.map(line=>{
                          const pv = line.proy[mesIdx];
                          const rv = lines_real[line.label] || 0;
                          const desv = rv > 0 ? (rv - pv) * sec.signo : null;
                          return(
                            <tr key={line.label} style={{borderTop:`1px solid ${C.border}22`}}>
                              <td style={{padding:"8px 16px",color:C.text}}>{line.label}</td>
                              <td style={{padding:"8px 14px",textAlign:"right",color:pv!==0?CAT_COLOR[sec.cat]:C.muted2}}>
                                {pv!==0?$$(pv):"—"}
                              </td>
                              <td style={{padding:"8px 14px",textAlign:"right",fontWeight:rv>0?700:400,
                                color:rv>0?C.yellow:C.muted2}}>
                                {rv>0?$$(rv):"—"}
                              </td>
                              <td style={{padding:"8px 14px",textAlign:"right"}}>
                                {desv!==null?(
                                  <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:20,
                                    background:desv>=0?"#22c55e22":"#f8717122",color:desv>=0?C.green:C.red}}>
                                    {desv>=0?"+":""}{$$(desv)}
                                  </span>
                                ):"—"}
                              </td>
                            </tr>
                          );
                        })}
                        {/* Total sección */}
                        <tr style={{background:"rgba(255,255,255,0.03)",borderTop:`1px solid ${C.border}`}}>
                          <td style={{padding:"8px 16px",fontWeight:800,color:C.text}}>Total {sec.label}</td>
                          <td style={{padding:"8px 14px",textAlign:"right",fontWeight:800,color:CAT_COLOR[sec.cat]}}>
                            {proy_total!==0?$$(proy_total):"—"}
                          </td>
                          <td style={{padding:"8px 14px",textAlign:"right",fontWeight:800,color:C.yellow}}>
                            {real_total>0?$$(real_total):"—"}
                          </td>
                          <td style={{padding:"8px 14px"}}/>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── INGRESO REAL SEMANAL ── */}
      {vista==="semanas"&&canEdit&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{fontSize:11,color:C.muted}}>
            Selecciona un mes y semana para ingresar los valores reales.
          </div>
          {Object.keys(SEMANAS).map(mes=>{
            const semsData = realData?.[empNombre]?.[mes] || {};
            const totalMesIng = Object.values(semsData).reduce((a,s)=>{
              const ingSecs = emp.sections.filter(sec=>sec.signo>0);
              return a + ingSecs.flatMap(sec=>sec.lines).reduce((b,l)=>b+(s[l.label]||0),0);
            },0);
            const totalMesEgr = Object.values(semsData).reduce((a,s)=>{
              const egrSecs = emp.sections.filter(sec=>sec.signo<0);
              return a + egrSecs.flatMap(sec=>sec.lines).reduce((b,l)=>b+(s[l.label]||0),0);
            },0);
            return(
              <Card key={mes}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <div style={{fontWeight:800,fontSize:13,color:C.text}}>{mes}</div>
                  {(totalMesIng||totalMesEgr)?<div style={{display:"flex",gap:12,fontSize:11}}>
                    <span style={{color:C.green}}>Ing: {$$(totalMesIng)}</span>
                    <span style={{color:C.red}}>Egr: {$$(totalMesEgr)}</span>
                  </div>:null}
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {(SEMANAS[mes]||[]).map(sem=>{
                    const semData = semsData[sem];
                    const hasSem = semData && Object.keys(semData).length>0;
                    const semIng = hasSem ? emp.sections.filter(s=>s.signo>0)
                      .flatMap(s=>s.lines).reduce((a,l)=>a+(semData[l.label]||0),0) : 0;
                    const semEgr = hasSem ? emp.sections.filter(s=>s.signo<0)
                      .flatMap(s=>s.lines).reduce((a,l)=>a+(semData[l.label]||0),0) : 0;
                    return(
                      <button key={sem}
                        onClick={()=>setModal({mes,semana:sem})}
                        style={{padding:"8px 12px",borderRadius:8,cursor:"pointer",fontSize:11,
                          fontWeight:hasSem?700:500,
                          border:`1px solid ${hasSem?emp.color:C.border}`,
                          background:hasSem?`${emp.color}22`:"transparent",
                          color:hasSem?emp.color:C.muted,
                          textAlign:"left",lineHeight:1.4}}>
                        <div>{sem}</div>
                        {hasSem&&<div style={{fontSize:9,color:C.muted,marginTop:2}}>
                          {semIng>0&&<span style={{color:C.green}}>↑{$$(semIng)} </span>}
                          {semEgr>0&&<span style={{color:C.red}}>↓{$$(semEgr)}</span>}
                        </div>}
                      </button>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {modal&&(
        <ModalIngreso
          empresa={empNombre}
          mes={modal.mes}
          semana={modal.semana}
          realData={realData}
          onSave={onSaveReal}
          onClose={()=>setModal(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SECCIÓN: DASHBOARD
// ═══════════════════════════════════════════════════════════════════
function Dashboard({ realData }) {
  const saldo_actual = 411252;
  const GM_FLUJO  = [-125631,16513,-45631,-1964870,-210966,-226116,-1327095,120956,-189044,-1421822,-475920,890998,2066742,-258072,-543715,-1095359,56000,40850,-639000,477000,377000,-437000,-792000,170500];
  const GM_ACUM   = [-125631,-109118,-154748,-2119618,-2330584,-2556700,-3883795,-3762839,-3951883,-5373705,-5849625,-4958627,-2891884,-3149956,-3693670,-4789029,-4733029,-4692179,-5331179,-4854179,-4477179,-4914179,-5706179,-5535679];

  const empTotals = Object.entries(EMPRESAS).map(([n,e])=>({
    n, totalIng: e.sections.filter(s=>s.signo>0).flatMap(s=>s.lines)
      .reduce((a,l)=>a+l.proy.reduce((b,v)=>b+v,0),0)
  })).filter(e=>e.totalIng>0).sort((a,b)=>b.totalIng-a.totalIng);
  const maxIng = empTotals[0]?.totalIng||1;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
        <KPI label="Saldo Caja Actual"        value={$$(saldo_actual)}          color={C.green}/>
        <KPI label="Créditos Totales Q1-2026" value={$$(8355763)}               color={C.red}/>
        <KPI label="Mínimo Acum. Proyectado"  value={$$(Math.min(...GM_ACUM))}  color={C.red}/>
        <KPI label="Saldo Final Feb-28"       value={$$(GM_ACUM[GM_ACUM.length-1])} color={cf(GM_ACUM[GM_ACUM.length-1])}/>
      </div>

      <Card>
        <SectionTitle>Flujo Acumulado Consolidado — 24 Meses</SectionTitle>
        <LineChart months={MESES_24} values={GM_ACUM} color={C.accentL}/>
        <div style={{marginTop:8,padding:"8px 12px",background:"rgba(248,113,113,0.08)",
          border:`1px solid ${C.red}33`,borderRadius:8,fontSize:11,color:C.muted}}>
          ⚠️ Caja acumulada negativa en el período. Mínimo: <strong style={{color:C.red}}>{$$(Math.min(...GM_ACUM))}</strong>
        </div>
      </Card>

      <Card>
        <SectionTitle>Ingresos Proyectados 24m por Empresa</SectionTitle>
        {empTotals.map(({n,totalIng})=>{
          const e=EMPRESAS[n];
          return(
            <div key={n} style={{display:"flex",alignItems:"center",gap:10,marginBottom:7}}>
              <div style={{width:148,fontSize:11,color:C.text,flexShrink:0}}>{e.emoji} {n}</div>
              <div style={{flex:1,background:C.card2,borderRadius:4,height:12,overflow:"hidden"}}>
                <div style={{width:`${(totalIng/maxIng)*100}%`,height:"100%",
                  background:e.color,borderRadius:4,opacity:0.75}}/>
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
// SECCIÓN: CRÉDITOS
// ═══════════════════════════════════════════════════════════════════
function Creditos() {
  const [busq, setBusq] = useState("");
  const [filtEmp, setFiltEmp] = useState("Todas");
  const empresas = ["Todas",...new Set(CREDITOS.map(c=>c.empresa))];
  const filtered = CREDITOS.filter(c=>{
    if(filtEmp!=="Todas"&&c.empresa!==filtEmp) return false;
    if(busq&&![c.empresa,c.acreedor].some(s=>s.toLowerCase().includes(busq.toLowerCase()))) return false;
    return true;
  });
  const deudaEmp={};
  CREDITOS.forEach(c=>{if(!deudaEmp[c.empresa])deudaEmp[c.empresa]=0; deudaEmp[c.empresa]+=c.monto;});
  const deudaList=Object.entries(deudaEmp).sort((a,b)=>b[1]-a[1]);
  const maxD=deudaList[0]?.[1]||1;

  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
        <KPI label="Deuda Total Q1-2026"  value={$$(CREDITOS_TRIM.saldos[0])} color={C.red}/>
        <KPI label="Pagos Q1-2026"        value={$$(CREDITOS_TRIM.pagos[0])}  color={C.yellow}/>
        <KPI label="N° Créditos"          value={CREDITOS.length}             color={C.blue}/>
      </div>

      <Card>
        <SectionTitle>Deuda por Empresa</SectionTitle>
        {deudaList.map(([n,monto])=>{
          const e=EMPRESAS[n]||{emoji:"🏢",color:C.blue};
          return(
            <div key={n} style={{display:"flex",alignItems:"center",gap:10,marginBottom:7}}>
              <div style={{width:148,fontSize:11,color:C.text,flexShrink:0}}>{e.emoji} {n}</div>
              <div style={{flex:1,background:C.card2,borderRadius:4,height:12,overflow:"hidden"}}>
                <div style={{width:`${(monto/maxD)*100}%`,height:"100%",background:C.red,borderRadius:4,opacity:0.6}}/>
              </div>
              <div style={{width:80,textAlign:"right",fontSize:11,fontWeight:700,color:C.red,flexShrink:0}}>{$$(monto)}</div>
            </div>
          );
        })}
      </Card>

      <Card style={{padding:0,overflow:"hidden"}}>
        <div style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`}}>
          <SectionTitle>Saldo Deuda por Trimestre</SectionTitle>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{background:"rgba(0,0,0,0.2)"}}>
                {["Trimestre","Pagos","Saldo Deuda"].map(h=>(
                  <th key={h} style={{padding:"7px 12px",fontWeight:600,fontSize:10,color:C.muted,
                    textTransform:"uppercase",borderBottom:`1px solid ${C.border}`,
                    textAlign:h==="Trimestre"?"left":"right"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {CREDITOS_TRIM.quarters.map((q,i)=>(
                  <tr key={q} style={{borderBottom:`1px solid ${C.border}22`,background:i%2===0?"transparent":"rgba(255,255,255,0.01)"}}>
                    <td style={{padding:"7px 12px",fontWeight:600,color:C.text}}>{q}</td>
                    <td style={{padding:"7px 12px",textAlign:"right",color:C.yellow,fontWeight:600}}>{$$(CREDITOS_TRIM.pagos[i])}</td>
                    <td style={{padding:"7px 12px",textAlign:"right",fontWeight:700,color:C.red}}>{$$(CREDITOS_TRIM.saldos[i])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <input value={busq} onChange={e=>setBusq(e.target.value)} placeholder="🔍 Buscar…"
          style={{padding:"7px 12px",background:C.card2,border:`1px solid ${C.border}`,
            borderRadius:8,color:C.text,fontSize:12,outline:"none",flexGrow:1,minWidth:160}}/>
        <select value={filtEmp} onChange={e=>setFiltEmp(e.target.value)}
          style={{padding:"7px 12px",background:C.card2,border:`1px solid ${C.border}`,
            borderRadius:8,color:C.text,fontSize:12,outline:"none"}}>
          {empresas.map(e=><option key={e}>{e}</option>)}
        </select>
        <span style={{fontSize:11,color:C.muted}}>{filtered.length} créditos</span>
      </div>

      <Card style={{padding:0,overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead><tr style={{background:"rgba(0,0,0,0.2)"}}>
              {["#","Empresa","Acreedor","Tipo","Monto","Cuota","Vencimiento","Tasa"].map(h=>(
                <th key={h} style={{padding:"8px 12px",fontWeight:600,fontSize:10,color:C.muted,
                  textTransform:"uppercase",borderBottom:`1px solid ${C.border}`,
                  textAlign:["Monto","Cuota","Tasa"].includes(h)?"right":"left",whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.map(c=>{
                const vencProx=new Date(c.f_venc)<=new Date("2026-12-31");
                const e=EMPRESAS[c.empresa]||{emoji:"🏢",color:C.blue};
                return(
                  <tr key={c.n} style={{borderBottom:`1px solid ${C.border}22`,
                    background:vencProx?"rgba(251,191,36,0.05)":"transparent"}}>
                    <td style={{padding:"7px 12px",color:C.muted}}>{c.n}</td>
                    <td style={{padding:"7px 12px",fontWeight:600,color:e.color,whiteSpace:"nowrap"}}>{e.emoji} {c.empresa}</td>
                    <td style={{padding:"7px 12px",color:C.text}}>{c.acreedor}</td>
                    <td style={{padding:"7px 12px"}}>
                      <span style={{fontSize:9,padding:"2px 7px",borderRadius:20,
                        background:C.card2,border:`1px solid ${C.border}`,color:C.muted}}>{c.tipo_cr}</span>
                    </td>
                    <td style={{padding:"7px 12px",textAlign:"right",fontWeight:700,color:C.red}}>{$$(c.monto)}</td>
                    <td style={{padding:"7px 12px",textAlign:"right",color:C.yellow}}>{$$(c.cuota)}</td>
                    <td style={{padding:"7px 12px",whiteSpace:"nowrap",color:vencProx?C.orange:C.muted}}>
                      {fmtDate(c.f_venc)}{vencProx&&" ⚠️"}
                    </td>
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
// MÓDULO PRINCIPAL
// ═══════════════════════════════════════════════════════════════════
export default function FinanzasModule({ onBack, onLogout, usuarioActual }) {
  const [tab,      setTab]      = useState("dashboard");
  const [empTab,   setEmpTab]   = useState("Mediterra");
  const [realData, setRealData] = useState({});
  const [loading,  setLoading]  = useState(true);
  const [saved,    setSaved]    = useState(null);

  // Quiénes pueden ingresar datos
  const canEdit = ["Angelo Huerta","Carol Machuca"].includes(usuarioActual?.nombre||"");

  useEffect(()=>{
    dbLoad().then(d=>{ setRealData(d||{}); setLoading(false); });
  },[]);

  const handleSaveReal = useCallback(async (empresa, mes, semana, vals) => {
    const next = JSON.parse(JSON.stringify(realData));
    if(!next[empresa]) next[empresa]={};
    if(!next[empresa][mes]) next[empresa][mes]={};
    next[empresa][mes][semana] = vals;
    setRealData(next);
    const ok = await dbSave(next);
    setSaved(ok?"✅ Guardado":"⚠️ Error al guardar");
    setTimeout(()=>setSaved(null),3000);
  },[realData]);

  const TABS_LIST = [
    {id:"dashboard", label:"📊 Dashboard"},
    {id:"flujo",     label:"📈 Flujo Empresas"},
    {id:"creditos",  label:"💳 Créditos"},
  ];

  return (
    <div style={{fontFamily:"'IBM Plex Sans','Segoe UI',system-ui,sans-serif",
      color:C.text, minHeight:"100vh", background:C.bg}}>

      {/* Top bar */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
        marginBottom:20,flexWrap:"wrap",gap:8,paddingBottom:14,
        borderBottom:`1px solid ${C.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={onBack}
            style={{background:"rgba(255,255,255,0.06)",border:`1px solid ${C.border}`,
              color:C.text,borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12}}>
            ← Hub
          </button>
          <img src="/med.png" alt="Mediterra" style={{height:30,objectFit:"contain"}}
            onError={e=>{e.target.style.display="none";}}/>
          <div>
            <div style={{fontSize:13,fontWeight:900,color:C.text}}>Finanzas · Grupo Mediterra</div>
            <div style={{fontSize:10,color:C.muted}}>Flujo de Caja — Modelo Abril 2026 · USD</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {loading&&<span style={{fontSize:11,color:C.muted}}>⏳</span>}
          {saved&&<span style={{fontSize:11,color:C.muted,background:C.card2,
            borderRadius:20,padding:"3px 10px"}}>{saved}</span>}
          <button onClick={onLogout}
            style={{background:"rgba(248,113,113,0.15)",border:"none",color:C.red,
              borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12}}>
            Salir
          </button>
        </div>
      </div>

      {/* Tabs principales */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:20}}>
        {TABS_LIST.map(t=>(
          <Btn key={t.id} active={tab===t.id} onClick={()=>setTab(t.id)} color={C.accent}>
            {t.label}
          </Btn>
        ))}
      </div>

      {/* Contenido */}
      {tab==="dashboard"&&<Dashboard realData={realData}/>}

      {tab==="flujo"&&(
        <div>
          {/* Selector empresa */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
            {Object.keys(EMPRESAS).map(n=>{
              const e=EMPRESAS[n];
              return(
                <button key={n} onClick={()=>setEmpTab(n)}
                  style={{padding:"6px 11px",borderRadius:8,cursor:"pointer",fontSize:11,fontWeight:600,
                    border:`1px solid ${empTab===n?e.color:C.border}`,
                    background:empTab===n?`${e.color}22`:"transparent",
                    color:empTab===n?e.color:C.muted}}>
                  {e.emoji} {n}
                </button>
              );
            })}
          </div>
          <FlujoEmpresa
            key={empTab}
            empNombre={empTab}
            realData={realData}
            onSaveReal={handleSaveReal}
            canEdit={canEdit}
          />
        </div>
      )}

      {tab==="creditos"&&<Creditos/>}
    </div>
  );
}
