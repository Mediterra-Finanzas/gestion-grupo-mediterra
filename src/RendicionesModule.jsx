/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// RendicionesModule.jsx — Rendiciones de gasto de los trabajadores
// Se renderiza como pestaña "🧾 Rendiciones" DENTRO de FinanzasModule.
// Cada trabajador carga sus propios gastos con respaldos (boletas/facturas)
// y un aprobador (admin / CFO) revisa el workflow:
//   borrador → enviada → aprobada/rechazada → pagada
// Independiente del flujo de caja. Persiste en calendario_data id="rendiciones".
// Adjuntos en Supabase Storage (bucket frisku-docs, prefijo rendiciones/).
// ═══════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import * as XLSX from "xlsx-js-style";
import { theme as T } from "./theme";
import {
  dbLoadGeneric, dbSaveGeneric,
  uploadArchivoFrisku, eliminarArchivoFrisku, pathDesdeUrlStorage,
  buscarTC,
} from "./friskuHelpers";
import { enviarEmail } from "./emailHelper";

const APP_URL = "https://gestion-grupo-mediterra.vercel.app";

// Destinatarios del aviso "rendición lista para pago" (analista de finanzas, administración y gerencia).
const EMAILS_PAGO = [
  "cmachuca@grupomediterra.cl",  // Carol Machuca — Analista Finanzas
  "Mbecerra@grupomediterra.cl",  // Milagros Becerra — Administración
  "ahuerta@grupomediterra.cl",   // Angelo Huerta — Gerencia
];

// Usuarios autorizados a cargar rendiciones EN NOMBRE de otros (ej. secretaria por un gerente).
// La rendición queda a nombre del trabajador elegido y usa SU cadena de aprobación;
// se guarda creadaPor para trazabilidad. Los admin también pueden hacerlo.
const EMAILS_RINDEN_POR_OTROS = [
  "Mbecerra@grupomediterra.cl",  // Milagros Becerra
];

const C = { ...T };

// ── Constantes de negocio ──────────────────────────────────────────
const EMPRESAS = [
  "Mediterra Holding", "Allegria Foods", "Allegria Service", "Frisku Foods",
  "Osiris Plant Management", "Integrity Farms", "Allpa Farms Chile", "Allpa Farms Perú",
];

const CATEGORIAS_BASE = [
  { v: "movilizacion", l: "Movilización / Taxi", ic: "🚕" },
  { v: "kilometraje",  l: "Kilometraje (auto propio)", ic: "🚗" },
  { v: "arriendo_vehiculo", l: "Arriendo de vehículo", ic: "🚙" },
  { v: "pasajes_aereos", l: "Pasajes aéreos",   ic: "✈️" },
  { v: "combustible",  l: "Combustible",         ic: "⛽" },
  { v: "peajes",       l: "Peajes / TAG",        ic: "🛣️" },
  { v: "estacionamiento", l: "Estacionamiento",  ic: "🅿️" },
  { v: "alojamiento",  l: "Alojamiento",         ic: "🏨" },
  { v: "alimentacion", l: "Alimentación",        ic: "🍽️" },
  { v: "materiales",   l: "Materiales / Insumos", ic: "📦" },
  { v: "oficina",      l: "Útiles de oficina",   ic: "✏️" },
  { v: "courier",      l: "Courier / Encomiendas", ic: "📮" },
  { v: "telefonia",    l: "Telefonía / Internet", ic: "📱" },
  { v: "mantencion",   l: "Mantención vehículo",  ic: "🔧" },
  { v: "viaticos",     l: "Viáticos",            ic: "🧳" },
  { v: "representacion", l: "Representación / Atención clientes", ic: "🤝" },
  { v: "capacitacion", l: "Capacitación / Cursos", ic: "🎓" },
  { v: "fletes",       l: "Fletes / Transporte carga", ic: "🚚" },
  { v: "servicios",    l: "Servicios profesionales / Honorarios", ic: "💼" },
  { v: "epp",          l: "EPP / Seguridad",     ic: "🦺" },
  { v: "aseo",         l: "Aseo / Limpieza",     ic: "🧹" },
  { v: "notaria",      l: "Notaría / Trámites",  ic: "📋" },
  { v: "bancarios",    l: "Gastos bancarios / Comisiones", ic: "🏦" },
  { v: "salud",        l: "Salud / Farmacia",    ic: "💊" },
  { v: "otros",        l: "Otros",               ic: "•" },
];
// Categorías extra que el admin agrega desde la app (persistidas en rendiciones_config).
// Se registran en CATEGORIAS_EXTRA y CAT_MAP al cargar la config, para que labels
// funcionen en exports/reportes sin tener que hilar el mapa por todos lados.
let CATEGORIAS_EXTRA = [];
const CAT_MAP = Object.fromEntries(CATEGORIAS_BASE.map(c => [c.v, c]));
function setCategoriasExtra(list) {
  CATEGORIAS_EXTRA = (Array.isArray(list) ? list : []).filter(c => c && c.v && c.l);
  // Reconstruir CAT_MAP: base + extra (limpiar extras viejos primero).
  Object.keys(CAT_MAP).forEach(k => { if (!CATEGORIAS_BASE.some(b => b.v === k)) delete CAT_MAP[k]; });
  CATEGORIAS_EXTRA.forEach(c => { CAT_MAP[c.v] = c; });
}
function categoriasTodas() { return [...CATEGORIAS_BASE, ...CATEGORIAS_EXTRA]; }

const MONEDAS = ["CLP", "USD", "EUR", "PEN", "CNY", "GBP", "BRL", "MXN", "AUD", "CAD", "JPY"];
const SIM_MONEDA = { CLP: "$", USD: "US$", EUR: "€", PEN: "S/", CNY: "¥", GBP: "£", BRL: "R$", MXN: "MX$", AUD: "A$", CAD: "C$", JPY: "¥" };

const TIPOS_DOC = ["Boleta", "Factura", "Boleta honorarios", "Voucher", "Ticket", "Sin documento", "Otro"];

const ESTADOS = {
  borrador:  { l: "Borrador",  color: C.muted,   bg: C.cardAlt,   ic: "📝" },
  enviada:   { l: "Enviada",   color: C.info,    bg: C.infoBg,    ic: "📤" },
  aprobada:  { l: "Aprobada",  color: C.success, bg: C.successBg, ic: "✅" },
  rechazada: { l: "Rechazada", color: C.danger,  bg: C.dangerBg,  ic: "❌" },
  pagada:    { l: "Pagada",    color: C.accent2, bg: C.accent2Bg, ic: "💵" },
};

// ── Helpers ────────────────────────────────────────────────────────
const uid = (p = "rnd") => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const hoyISO = () => new Date().toISOString().slice(0, 10);
const nowISO = () => new Date().toISOString();

function fmtMonto(n, moneda = "CLP") {
  const v = Number(n) || 0;
  if (moneda === "CLP") return "$" + v.toLocaleString("es-CL", { maximumFractionDigits: 0 });
  const sym = SIM_MONEDA[moneda] || (moneda + " ");
  return sym + v.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtFecha(iso) {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? iso + "T12:00:00" : iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

// Suma de gastos agrupada por moneda → {CLP: 12000, USD: 30}
function totalesPorMoneda(gastos) {
  const t = {};
  (gastos || []).forEach(g => {
    const m = g.moneda || "CLP";
    t[m] = (t[m] || 0) + (Number(g.monto) || 0);
  });
  return t;
}
function fmtTotales(t) {
  const ks = Object.keys(t).filter(k => t[k]);
  if (!ks.length) return fmtMonto(0, "CLP");
  return ks.map(k => fmtMonto(t[k], k)).join("  +  ");
}

// Convierte un monto de `origen` a `destino` triangulando por USD cuando no
// existe el par directo. USD es el pivote del maestro de TC del proyecto.
// Retorna { ok, val, chain, usd, tASrc, tToDst } o { ok:false, chain, faltan }.
// `tcManual` (opcional) = { [moneda]: tasa } donde tasa = cuántos `destino`
// vale 1 unidad de esa moneda. Tiene prioridad sobre el maestro de TC: es el
// "tipo de cambio de la rendición" que define el trabajador / aprobador.
function convertir(monto, origen, destino, fecha, tcData, tcManual, tcGasto) {
  const m = Number(monto) || 0;
  origen = origen || "CLP"; destino = destino || "CLP";
  if (origen === destino) return { ok: true, val: m, chain: null, usd: null };
  // Prioridad máxima: tipo de cambio que el trabajador puso en ESTE gasto.
  if (Number(tcGasto) > 0) return { ok: true, val: m * Number(tcGasto), chain: `${origen}→${destino}`, usd: null, rate: Number(tcGasto), manual: true };
  const man = tcManual && Number(tcManual[origen]) > 0 ? Number(tcManual[origen]) : null;
  if (man != null) return { ok: true, val: m * man, chain: `${origen}→${destino} (manual)`, usd: null, rate: man, manual: true };
  const directo = buscarTC(origen, destino, fecha, tcData);
  if (directo != null) return { ok: true, val: m * directo, chain: `${origen}→${destino}`, usd: null, rate: directo };
  // triangular vía USD: origen→USD→destino
  const aUSD = buscarTC(origen, "USD", fecha, tcData);
  const deUSD = buscarTC("USD", destino, fecha, tcData);
  if (aUSD != null && deUSD != null) {
    const usd = m * aUSD;
    return { ok: true, val: usd * deUSD, chain: `${origen}→USD→${destino}`, usd, tASrc: aUSD, tToDst: deUSD };
  }
  return { ok: false, val: null, chain: `${origen}→USD→${destino}`, faltan: { [`${origen}→USD`]: aUSD == null, [`USD→${destino}`]: deUSD == null } };
}

// Suma de gastos convertida a la moneda de pago. Devuelve total + faltantes de TC.
function totalConvertido(gastos, monedaPago, fecha, tcData, tcManual) {
  let total = 0; const faltan = new Set();
  (gastos || []).forEach(g => {
    const r = convertir(g.monto, g.moneda || "CLP", monedaPago, fecha, tcData, tcManual, g.tc);
    if (r.ok) total += r.val;
    else Object.keys(r.faltan || {}).forEach(k => { if (r.faltan[k]) faltan.add(k); });
  });
  return { total, faltan: [...faltan] };
}

// ═══════════════════════════════════════════════════════════════════
// Exportación: Excel (SheetJS) + PDF con respaldos (jsPDF + pdf-lib)
// ───────────────────────────────────────────────────────────────────
// jsPDF y pdf-lib se cargan por CDN dinámico (no son dependencias npm,
// no inflan el bundle), igual que el patrón del Reporte Semanal.

// Logo por empresa (archivos en /public). Las que no tienen logo van con
// el nombre en texto hasta que Angelo entregue los archivos.
const LOGO_EMPRESA = {
  "Mediterra Holding":        "/med.png",
  "Allegria Foods":           "/allegria-logo.jpg",
  "Allegria Service":         "/allegria-service-logo.png",
  "Frisku Foods":             "/frisku.png",
  "Osiris Plant Management":  "/osiris-logo.jpg",
  "Integrity Farms":          "/integrity-logo.png",
  "Allpa Farms Chile":        "/allpa-chile-logo.png",
  "Allpa Farms Perú":         "/allpa-peru-logo.png",
};

let _jsPDFp = null;
function loadJsPDF() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (_jsPDFp) return _jsPDFp;
  _jsPDFp = new Promise((resolve, reject) => {
    const s1 = document.createElement("script");
    s1.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s1.onload = () => {
      const s2 = document.createElement("script");
      s2.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js";
      s2.onload = () => resolve(window.jspdf.jsPDF);
      s2.onerror = reject;
      document.body.appendChild(s2);
    };
    s1.onerror = reject;
    document.body.appendChild(s1);
  });
  return _jsPDFp;
}
let _exceljsP = null;
function loadExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (_exceljsP) return _exceljsP;
  _exceljsP = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js";
    s.onload = () => resolve(window.ExcelJS);
    s.onerror = reject;
    document.body.appendChild(s);
  });
  return _exceljsP;
}
let _pdfLibp = null;
function loadPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  if (_pdfLibp) return _pdfLibp;
  _pdfLibp = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js";
    s.onload = () => resolve(window.PDFLib);
    s.onerror = reject;
    document.body.appendChild(s);
  });
  return _pdfLibp;
}

async function urlToArrayBuffer(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("fetch " + r.status);
  return new Uint8Array(await r.arrayBuffer());
}
async function urlToDataURL(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("fetch " + r.status);
  const b = await r.blob();
  return await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(b);
  });
}
// Tamaño natural de una imagen (para escalar el logo sin deformarlo).
function imgNaturalSize(src) {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
    im.onerror = () => res(null);
    im.src = src;
  });
}
const extDe = (s) => (s || "").split("?")[0].split(".").pop().toLowerCase();
const slug = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "_");

// Comprime/normaliza una imagen antes de subir:
//  • Convierte HEIC/HEIF (cámara iPhone) → JPEG dibujándola en un canvas.
//  • Reescala al lado máximo indicado y reduce peso (fotos de celular suelen
//    pesar varios MB y/o venir en formatos que el bucket rechaza).
// Si no es imagen (ej. PDF) o algo falla, devuelve el archivo original.
async function comprimirImagen(file, maxLado = 1800, calidad = 0.82) {
  if (!file) return file;
  const esImagen = /^image\//i.test(file.type || "") || /\.(jpe?g|png|heic|heif|webp|gif|bmp)$/i.test(file.name || "");
  if (!esImagen) return file;
  try {
    const dataUrl = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => rej(new Error("read"));
      fr.readAsDataURL(file);
    });
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error("decode"));
      im.src = dataUrl;
    });
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    if (!W || !H) return file;
    const escala = Math.min(1, maxLado / Math.max(W, H));
    const w = Math.max(1, Math.round(W * escala)), h = Math.max(1, Math.round(H * escala));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", calidad));
    if (!blob || blob.size === 0) return file;
    const nombre = (file.name || "foto").replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nombre, { type: "image/jpeg" });
  } catch (e) {
    return file; // fallback: sube el original
  }
}

// Distintas monedas de los gastos que NO son la moneda de pago (para mostrar TC).
function monedasExtranjeras(gastos, monedaPago) {
  const set = new Set();
  (gastos || []).forEach(g => { const m = g.moneda || "CLP"; if (m !== monedaPago) set.add(m); });
  return [...set];
}

// ── Excel por rendición — formato corporativo con logo (ExcelJS vía CDN) ──
const XL_NAVY = "1E2761", XL_LIGHT = "EAEEF4", XL_GREY = "5A5A5A", XL_ZEBRA = "F6F8FB", XL_TOTAL = "DCE3F0", XL_BORDER = "C9D2E0";
async function exportarRendicionExcel(rend, tcData) {
  const monedaPago = rend.monedaPago || "CLP";
  const fechaTC = rend.fechaTC || rend.periodo || hoyISO();
  const tcManual = rend.tcManual || {};
  let ExcelJS;
  try { ExcelJS = await loadExcelJS(); }
  catch (e) { return exportarRendicionExcelSimple(rend, tcData); }

  const argb = (hex) => "FF" + hex;
  const thin = { style: "thin", color: { argb: argb(XL_BORDER) } };
  const borderAll = { top: thin, bottom: thin, left: thin, right: thin };

  const wb = new ExcelJS.Workbook();
  wb.creator = "Grupo Mediterra";
  const ws = wb.addWorksheet("Rendición " + rend.folio, { views: [{ showGridLines: false }] });
  ws.columns = [
    { width: 5 }, { width: 13 }, { width: 22 }, { width: 34 },
    { width: 18 }, { width: 14 }, { width: 9 }, { width: 15 }, { width: 17 }, { width: 22 },
  ];
  const NCOL = 10;

  // Logo (flota sobre el encabezado)
  const logoPath = LOGO_EMPRESA[rend.empresa];
  if (logoPath) {
    try {
      const dataUrl = await urlToDataURL(logoPath);
      const base64 = dataUrl.split(",")[1];
      let ext = dataUrl.substring(dataUrl.indexOf("/") + 1, dataUrl.indexOf(";")).toLowerCase();
      if (ext === "jpg") ext = "jpeg";
      if (ext === "png" || ext === "jpeg") {
        const imgId = wb.addImage({ base64, extension: ext });
        // Respeta el aspecto natural del logo dentro de una caja máx 170x56 px
        const sz = await imgNaturalSize(dataUrl);
        let w = 150, h = 56;
        if (sz && sz.w > 0 && sz.h > 0) {
          const s = Math.min(170 / sz.w, 56 / sz.h);
          w = Math.round(sz.w * s); h = Math.round(sz.h * s);
        }
        ws.addImage(imgId, { tl: { col: 0.15, row: 0.15 }, ext: { width: w, height: h } });
      }
    } catch (e) {}
  }

  // Fila 1 (fondo blanco): logo flota a la izquierda + empresa en navy a la derecha
  ws.mergeCells(1, 1, 1, NCOL);
  ws.getRow(1).height = 52;
  const t = ws.getCell(1, 1);
  t.value = (rend.empresa || "").toUpperCase();
  t.font = { name: "Calibri", size: 16, bold: true, color: { argb: argb(XL_NAVY) } };
  t.alignment = { vertical: "middle", horizontal: "right", indent: 1 };

  // Fila 2: banda navy con el subtítulo
  ws.mergeCells(2, 1, 2, NCOL);
  ws.getRow(2).height = 22;
  const st = ws.getCell(2, 1);
  st.value = `RENDICIÓN DE GASTOS   ·   Folio #${rend.folio}`;
  st.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(XL_NAVY) } };
  st.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  st.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  // Bloque de datos (dos columnas de pares etiqueta/valor)
  const info = [
    ["Trabajador", rend.trabajador || "—", "Empresa", rend.empresa || "—"],
    ["Cargo", rend.cargo || "—", "Fecha de rendición", fmtFecha(rend.periodo)],
    ["Título / Glosa", rend.titulo || "—", "Estado", (ESTADOS[rend.estado] || {}).l || rend.estado],
    ["Moneda de pago", monedaPago, "Fecha tipo de cambio", fmtFecha(fechaTC)],
  ];
  let r = 4;
  info.forEach(row => {
    const setPair = (cLabel, label, cVal, valColEnd, value) => {
      const lc = ws.getCell(r, cLabel);
      lc.value = label; lc.font = { bold: true, color: { argb: argb(XL_NAVY) }, size: 10 };
      lc.alignment = { vertical: "middle" };
      ws.mergeCells(r, cVal, r, valColEnd);
      const vc = ws.getCell(r, cVal);
      vc.value = value; vc.font = { size: 10, color: { argb: argb(XL_GREY) } };
      vc.alignment = { vertical: "middle" };
    };
    setPair(1, row[0], 2, 5, row[1]);   // izquierda: A label, B:E value
    setPair(6, row[2], 7, NCOL, row[3]); // derecha: F label, G:J value
    ws.getRow(r).height = 18;
    r++;
  });

  // Tipos de cambio aplicados (manual o maestro)
  const extranjeras = monedasExtranjeras(rend.gastos, monedaPago);
  if (extranjeras.length) {
    r++;
    const hc = ws.getCell(r, 1);
    hc.value = "Tipos de cambio de la rendición";
    hc.font = { bold: true, size: 10, color: { argb: argb(XL_NAVY) } };
    r++;
    extranjeras.forEach(cur => {
      const man = Number(tcManual[cur]) > 0 ? Number(tcManual[cur]) : null;
      const auto = man == null ? buscarTC(cur, monedaPago, fechaTC, tcData) : null;
      const tasa = man != null ? man : auto;
      const c = ws.getCell(r, 1);
      ws.mergeCells(r, 1, r, NCOL);
      c.value = tasa != null
        ? `1 ${cur} = ${tasa.toLocaleString("es-CL", { maximumFractionDigits: 6 })} ${monedaPago}   (${man != null ? "manual" : "maestro"})`
        : `1 ${cur} = ⚠ sin tipo de cambio`;
      c.font = { size: 9.5, color: { argb: tasa != null ? argb(XL_GREY) : "FFB42318" } };
      r++;
    });
  }

  // Tabla de gastos
  r++;
  const headRow = r;
  const cab = ["#", "Fecha gasto", "Categoría", "Glosa", "Tipo doc", "N° doc", "Moneda", "Monto", `Equiv. ${monedaPago}`, "Conversión"];
  cab.forEach((h, i) => {
    const c = ws.getCell(headRow, i + 1);
    c.value = h;
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(XL_NAVY) } };
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.alignment = { vertical: "middle", horizontal: i >= 7 ? "right" : "left", wrapText: true };
    c.border = borderAll;
  });
  ws.getRow(headRow).height = 22;
  r++;

  (rend.gastos || []).forEach((g, i) => {
    const cv = convertir(g.monto, g.moneda || "CLP", monedaPago, fechaTC, tcData, tcManual, g.tc);
    const vals = [
      i + 1, fmtFecha(g.fecha), (CAT_MAP[g.categoria] || {}).l || g.categoria, g.glosa || "",
      g.docTipo || "", g.docNumero || "", g.moneda || "CLP", Number(g.monto) || 0,
      cv.ok ? Math.round(cv.val * 100) / 100 : "SIN TC", cv.chain || "—",
    ];
    vals.forEach((v, ci) => {
      const c = ws.getCell(r, ci + 1);
      c.value = v;
      c.border = borderAll;
      c.font = { size: 9.5, color: { argb: "FF1A1A1A" } };
      c.alignment = { vertical: "middle", horizontal: ci === 0 ? "center" : (ci === 7 || ci === 8) ? "right" : "left", wrapText: ci === 3 };
      if (i % 2 === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(XL_ZEBRA) } };
      if (ci === 7 || ci === 8) {
        const mon = ci === 7 ? (g.moneda || "CLP") : monedaPago;
        if (typeof v === "number") c.numFmt = mon === "CLP" ? '#,##0' : '#,##0.00';
        if (ci === 8 && v === "SIN TC") c.font = { size: 9.5, bold: true, color: { argb: "FFB42318" } };
      }
    });
    r++;
  });

  // Fila total
  const { total, faltan } = totalConvertido(rend.gastos, monedaPago, fechaTC, tcData, tcManual);
  ws.mergeCells(r, 1, r, 7);
  const tl = ws.getCell(r, 1);
  tl.value = `TOTAL A PAGAR (${monedaPago})`;
  tl.alignment = { horizontal: "right", vertical: "middle" };
  tl.font = { bold: true, size: 11, color: { argb: argb(XL_NAVY) } };
  for (let ci = 1; ci <= NCOL; ci++) {
    const c = ws.getCell(r, ci);
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(XL_TOTAL) } };
    c.border = borderAll;
  }
  ws.mergeCells(r, 8, r, 9);
  const tv = ws.getCell(r, 8);
  tv.value = Math.round(total * 100) / 100;
  tv.numFmt = monedaPago === "CLP" ? '#,##0' : '#,##0.00';
  tv.alignment = { horizontal: "right", vertical: "middle" };
  tv.font = { bold: true, size: 12, color: { argb: argb(XL_NAVY) } };
  ws.getRow(r).height = 24;
  r++;
  if (faltan.length) {
    ws.mergeCells(r, 1, r, NCOL);
    const wc = ws.getCell(r, 1);
    wc.value = "⚠ Total parcial: faltan tipos de cambio (" + faltan.join(", ") + "). Se excluyen los gastos sin TC.";
    wc.font = { size: 9.5, italic: true, color: { argb: "FFB42318" } };
    r++;
  }

  // Pie
  r += 1;
  ws.mergeCells(r, 1, r, NCOL);
  const ft = ws.getCell(r, 1);
  ft.value = `Generado el ${fmtFecha(hoyISO())} · Grupo Mediterra · ${rend.gastos?.length || 0} gasto(s)`;
  ft.font = { size: 8.5, italic: true, color: { argb: "FF9AA3B2" } };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `Rendicion_${rend.folio}_${slug(rend.trabajador)}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// Respaldo: Excel plano con SheetJS si ExcelJS no carga (sin estilos/logo).
function exportarRendicionExcelSimple(rend, tcData) {
  const monedaPago = rend.monedaPago || "CLP";
  const fechaTC = rend.fechaTC || rend.periodo || hoyISO();
  const tcManual = rend.tcManual || {};
  const cabecera = [
    ["RENDICIÓN DE GASTOS"], ["Empresa", rend.empresa], ["Folio", "#" + rend.folio],
    ["Trabajador", rend.trabajador], ["Cargo", rend.cargo || ""], ["Título / Glosa", rend.titulo || ""],
    ["Fecha de rendición", fmtFecha(rend.periodo)], ["Estado", (ESTADOS[rend.estado] || {}).l || rend.estado],
    ["Moneda de pago", monedaPago], ["Fecha tipo de cambio", fmtFecha(fechaTC)], [],
  ];
  const cab = ["#", "Fecha gasto", "Categoría", "Glosa", "Tipo doc", "N° doc", "Moneda", "Neto", "IVA", "Exento", "Total", `Equiv. ${monedaPago}`, "Conversión"];
  const filas = (rend.gastos || []).map((g, i) => {
    const r = convertir(g.monto, g.moneda || "CLP", monedaPago, fechaTC, tcData, tcManual, g.tc);
    const esFactura = g.docTipo === "Factura";
    return [i + 1, fmtFecha(g.fecha), (CAT_MAP[g.categoria] || {}).l || g.categoria, g.glosa || "",
      g.docTipo || "", g.docNumero || "", g.moneda || "CLP",
      esFactura ? (Number(g.neto) || 0) : "", esFactura ? (Number(g.iva) || 0) : "", esFactura ? (Number(g.exento) || 0) : "", Number(g.monto) || 0,
      r.ok ? Math.round(r.val * 100) / 100 : "SIN TC", r.chain || "—"];
  });
  const { total, faltan } = totalConvertido(rend.gastos, monedaPago, fechaTC, tcData, tcManual);
  const totNeto = (rend.gastos || []).reduce((s, g) => s + (g.docTipo === "Factura" ? (Number(g.neto) || 0) : 0), 0);
  const totIVA = (rend.gastos || []).reduce((s, g) => s + (g.docTipo === "Factura" ? (Number(g.iva) || 0) : 0), 0);
  const totExento = (rend.gastos || []).reduce((s, g) => s + (g.docTipo === "Factura" ? (Number(g.exento) || 0) : 0), 0);
  const totalFila = [[], ["", "", "", "", "", "", "TOTALES", totNeto || "", totIVA || "", totExento || "", "", "", ""], ["", "", "", "", "", "", `TOTAL ${monedaPago}`, "", "", "", "", Math.round(total * 100) / 100, faltan.length ? "⚠ faltan TC: " + faltan.join(", ") : ""]];
  const ws = XLSX.utils.aoa_to_sheet([...cabecera, cab, ...filas, ...totalFila]);
  ws["!cols"] = [{ wch: 4 }, { wch: 13 }, { wch: 20 }, { wch: 32 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 13 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Rendición " + rend.folio);
  XLSX.writeFile(wb, `Rendicion_${rend.folio}_${slug(rend.trabajador)}.xlsx`);
}

// ── PDF por rendición, con los respaldos anexados (imágenes + PDFs) ──
async function exportarRendicionPDF(rend, tcData) {
  const monedaPago = rend.monedaPago || "CLP";
  const fechaTC = rend.fechaTC || rend.periodo || hoyISO();
  const tcManual = rend.tcManual || {};
  const jsPDF = await loadJsPDF();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  // Encabezado: logo (o nombre) + datos a la derecha
  const logoPath = LOGO_EMPRESA[rend.empresa];
  let logoW = 0;
  if (logoPath) {
    try {
      const dataUrl = await urlToDataURL(logoPath);
      // Respeta el aspecto natural dentro de una caja máx 40x22 mm
      const sz = await imgNaturalSize(dataUrl);
      let w = 34, h = 17;
      if (sz && sz.w > 0 && sz.h > 0) {
        const s = Math.min(40 / sz.w, 22 / sz.h);
        w = sz.w * s; h = sz.h * s;
      }
      doc.addImage(dataUrl, logoPath.endsWith(".png") ? "PNG" : "JPEG", 14, 9, w, h, undefined, "FAST");
      logoW = w;
    } catch (e) { /* sin logo */ }
  }
  const tx = logoW ? 14 + logoW + 6 : 14;
  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(30, 39, 97);
  doc.text(rend.empresa, tx, 18);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(90, 90, 90);
  doc.text("Rendición de gastos", tx, 25);
  doc.setFontSize(9); doc.setTextColor(60, 60, 60);
  const rx = W - 14;
  doc.text(`Folio: #${rend.folio}`, rx, 13, { align: "right" });
  doc.text(`Fecha: ${fmtFecha(rend.periodo)}`, rx, 18, { align: "right" });
  doc.text(`Estado: ${(ESTADOS[rend.estado] || {}).l || rend.estado}`, rx, 23, { align: "right" });

  let y = 33;
  doc.setDrawColor(205); doc.line(14, y, W - 14, y); y += 6;
  doc.setFontSize(10); doc.setTextColor(30, 30, 30);
  const linea = (lbl, val) => {
    doc.setFont("helvetica", "bold"); doc.text(lbl, 14, y);
    doc.setFont("helvetica", "normal"); doc.text(String(val || "—"), 44, y); y += 5;
  };
  linea("Trabajador:", `${rend.trabajador}${rend.cargo ? " · " + rend.cargo : ""}`);
  linea("Glosa:", rend.titulo);
  linea("Moneda pago:", `${monedaPago}  (TC ${fmtFecha(fechaTC)})`);
  const extranjeras = monedasExtranjeras(rend.gastos, monedaPago);
  extranjeras.forEach(cur => {
    const man = Number(tcManual[cur]) > 0 ? Number(tcManual[cur]) : null;
    const tasa = man != null ? man : buscarTC(cur, monedaPago, fechaTC, tcData);
    linea(`TC ${cur}:`, tasa != null
      ? `1 ${cur} = ${tasa.toLocaleString("es-CL", { maximumFractionDigits: 6 })} ${monedaPago} (${man != null ? "manual" : "maestro"})`
      : "⚠ sin tipo de cambio");
  });

  const body = (rend.gastos || []).map((g, i) => {
    const r = convertir(g.monto, g.moneda || "CLP", monedaPago, fechaTC, tcData, tcManual, g.tc);
    return [
      i + 1, fmtFecha(g.fecha), (CAT_MAP[g.categoria] || {}).l || g.categoria, g.glosa || "",
      `${g.docTipo || ""}${g.docNumero ? " " + g.docNumero : ""}`,
      fmtMonto(g.monto, g.moneda || "CLP"), r.ok ? fmtMonto(r.val, monedaPago) : "sin TC",
    ];
  });
  const { total, faltan } = totalConvertido(rend.gastos, monedaPago, fechaTC, tcData, tcManual);
  doc.autoTable({
    startY: y + 2,
    head: [["#", "Fecha", "Categoría", "Glosa", "Documento", "Monto", `Equiv. ${monedaPago}`]],
    body,
    foot: [["", "", "", "", `TOTAL ${monedaPago}`, "", fmtMonto(total, monedaPago)]],
    styles: { fontSize: 8, cellPadding: 1.8 },
    headStyles: { fillColor: [30, 39, 97], textColor: 255 },
    footStyles: { fillColor: [234, 238, 244], textColor: [30, 39, 97], fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 8 }, 5: { halign: "right" }, 6: { halign: "right" } },
    margin: { left: 14, right: 14 },
  });
  let afterY = doc.lastAutoTable.finalY + 6;
  if (faltan.length) {
    doc.setTextColor(192, 57, 43); doc.setFontSize(8);
    doc.text(`Gastos sin TC excluidos del total (faltan: ${faltan.join(", ")}).`, 14, afterY); afterY += 6;
  }
  const cad = Array.isArray(rend.cadena) ? rend.cadena : [];
  doc.setTextColor(60, 60, 60); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text("Aprobaciones:", 14, afterY); afterY += 5; doc.setFont("helvetica", "normal");
  if (cad.length) {
    // Flujo con cadena: un renglón por nivel.
    cad.forEach((p, i) => {
      const ap = (rend.aprobaciones || []).find(a => a.nivel === i || (a.email || "").toLowerCase() === (p.email || "").toLowerCase());
      doc.text(`${i + 1}. ${p.nombre}${i === 0 ? " (supervisor)" : ""} — ${ap ? "aprobó " + fmtFecha(ap.fecha) : "pendiente"}`, 16, afterY);
      afterY += 4.5;
    });
  } else if (rend.revisadoPor) {
    // Flujo legacy (un paso): mostrar quién aprobó.
    doc.text(`Aprobada por ${rend.revisadoPor}${rend.revisadoEn ? " — " + fmtFecha(rend.revisadoEn) : ""}.`, 16, afterY);
    afterY += 4.5;
  } else {
    doc.text("Sin registro de aprobación.", 16, afterY); afterY += 4.5;
  }
  // Pago (cualquier flujo).
  if (rend.pagadoPor) {
    doc.text(`Pagada por ${rend.pagadoPor}${rend.pagadoEn ? " — " + fmtFecha(rend.pagadoEn) : ""}.`, 16, afterY);
    afterY += 4.5;
  }

  // Anexar respaldos en un único PDF con pdf-lib
  const adjuntos = (rend.gastos || []).filter(g => g.adjuntoUrl).map(g => ({ url: g.adjuntoUrl, nombre: g.adjuntoNombre || "respaldo" }));
  const summaryBytes = doc.output("arraybuffer");
  if (!adjuntos.length) {
    doc.save(`Rendicion_${rend.folio}_${slug(rend.trabajador)}.pdf`);
    return { okAdjuntos: 0, fallidos: 0 };
  }
  const PDFLib = await loadPdfLib();
  const out = await PDFLib.PDFDocument.create();
  const sum = await PDFLib.PDFDocument.load(summaryBytes);
  (await out.copyPages(sum, sum.getPageIndices())).forEach(p => out.addPage(p));
  let okAdjuntos = 0, fallidos = 0;
  for (const a of adjuntos) {
    try {
      const ext = extDe(a.nombre) || extDe(a.url);
      const bytes = await urlToArrayBuffer(a.url);
      if (ext === "pdf") {
        const src = await PDFLib.PDFDocument.load(bytes);
        (await out.copyPages(src, src.getPageIndices())).forEach(p => out.addPage(p));
      } else if (["jpg", "jpeg", "png"].includes(ext)) {
        const img = ext === "png" ? await out.embedPng(bytes) : await out.embedJpg(bytes);
        const page = out.addPage(PDFLib.PageSizes.A4);
        const { width: pw, height: ph } = page.getSize();
        const margin = 28;
        const maxW = pw - margin * 2, maxH = ph - margin * 2 - 24;
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        const w = img.width * scale, h = img.height * scale;
        page.drawText(`Respaldo: ${a.nombre}`, { x: margin, y: ph - margin + 6, size: 9 });
        page.drawImage(img, { x: (pw - w) / 2, y: margin + (maxH - h) / 2, width: w, height: h });
      } else { fallidos++; continue; }
      okAdjuntos++;
    } catch (e) { fallidos++; }
  }
  const finalBytes = await out.save();
  const blob = new Blob([finalBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = `Rendicion_${rend.folio}_${slug(rend.trabajador)}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
  return { okAdjuntos, fallidos };
}

// ── UI primitivos ──────────────────────────────────────────────────
function Btn({ children, onClick, kind = "primary", small, disabled, style, title }) {
  const base = {
    primary:   { bg: C.primary, fg: "#fff", bd: C.primary },
    success:   { bg: C.success, fg: "#fff", bd: C.success },
    danger:    { bg: C.danger,  fg: "#fff", bd: C.danger },
    ghost:     { bg: C.card,    fg: C.text, bd: C.border },
    accent:    { bg: C.accent2, fg: "#fff", bd: C.accent2 },
  }[kind] || { bg: C.primary, fg: "#fff", bd: C.primary };
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{
        padding: small ? "5px 11px" : "8px 16px", borderRadius: 8,
        border: `1px solid ${base.bd}`, background: disabled ? C.cardAlt : base.bg,
        color: disabled ? C.muted2 : base.fg, cursor: disabled ? "not-allowed" : "pointer",
        fontWeight: 600, fontSize: small ? 12 : 13, whiteSpace: "nowrap", ...style,
      }}>
      {children}
    </button>
  );
}

function Badge({ children, color, bg, style }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 9px",
      borderRadius: 999, fontSize: 11.5, fontWeight: 700, color, background: bg,
      border: `1px solid ${color}33`, ...style,
    }}>{children}</span>
  );
}

function EstadoBadge({ estado, devuelta }) {
  if (devuelta && estado === "rechazada") return <Badge color={C.warning} bg={C.warningBg}>↩ Devuelta para corrección</Badge>;
  const e = ESTADOS[estado] || ESTADOS.borrador;
  return <Badge color={e.color} bg={e.bg}>{e.ic} {e.l}</Badge>;
}

function Field({ label, children, style }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, ...style }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted }}>{label}</span>
      {children}
    </label>
  );
}

// Detecta pantalla angosta (móvil) para reflujo responsivo (sin media queries en JSX).
function useEsMovil(bp = 680) {
  const [m, setM] = useState(typeof window !== "undefined" ? window.innerWidth < bp : false);
  useEffect(() => {
    const on = () => setM(window.innerWidth < bp);
    window.addEventListener("resize", on);
    on();
    return () => window.removeEventListener("resize", on);
  }, [bp]);
  return m;
}
const inputStyle = {
  padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`,
  fontSize: 13, outline: "none", background: C.card, color: C.text, boxSizing: "border-box", width: "100%",
};

function Modal({ children, onClose, width = 720, title }) {
  const esMovil = useEsMovil();
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(16,24,40,0.55)", zIndex: 400, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: esMovil ? "10px 8px" : "40px 16px", overflowX: "hidden", overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 14, width, maxWidth: "100%", minWidth: 0, overflowX: "hidden", boxShadow: "0 12px 48px #0004" }}>
        {title && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: esMovil ? "13px 16px" : "16px 22px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: C.text }}>{title}</div>
            <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 22, cursor: "pointer", color: C.muted, lineHeight: 1 }}>×</button>
          </div>
        )}
        <div style={{ padding: esMovil ? 14 : 22 }}>{children}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Cadena de aprobación (multinivel, orden estricto)
// ───────────────────────────────────────────────────────────────────
// El trabajador tiene una cadena ORDENADA de aprobadores (1º = supervisor),
// configurada en Gestión de Usuarios (campo cadenaAprobacion = [emails]).
// Al ENVIAR, la cadena se CONGELA en la rendición como [{email, nombre}] para
// que cambios posteriores en la config no rompan rendiciones en curso.
//   • nivelActual  = índice del aprobador que debe actuar ahora.
//   • aprobaciones = registro de cada nivel ya aprobado.
// Sin cadena → flujo retrocompatible de 1 paso (cualquier aprobador).
function resolverCadena(usuarioTrabajador, usuarios) {
  const raw = Array.isArray(usuarioTrabajador?.cadenaAprobacion) ? usuarioTrabajador.cadenaAprobacion : [];
  return raw.map(item => {
    const email = (typeof item === "string" ? item : item?.email || "").toLowerCase();
    const u = (usuarios || []).find(x => (x.email || "").toLowerCase() === email);
    return { email, nombre: u?.nombre || (typeof item === "object" ? item?.nombre : "") || email };
  }).filter(x => x.email);
}
function pasoActual(r) {
  if (!Array.isArray(r?.cadena) || !r.cadena.length) return null;
  return r.cadena[r.nivelActual || 0] || null;
}
// ¿Le toca a este usuario aprobar la rendición ahora?
function meTocaAprobar(r, miEmail, esAprobador, admin) {
  if (admin) return true;         // admin/CFO puede aprobar cualquier paso (override de autoridad)
  const paso = pasoActual(r);
  if (!paso) return esAprobador;  // sin cadena → cualquier aprobador (legacy)
  return (paso.email || "").toLowerCase() === (miEmail || "").toLowerCase();
}

// ═══════════════════════════════════════════════════════════════════
// Componente principal
// ═══════════════════════════════════════════════════════════════════
export default function RendicionesModule({ usuarioActual, esAdmin, esSoloConsulta, tabPermisos, nivelRendiciones, usuarios = [], onBack, onLogout }) {
  const nombreUsuario = usuarioActual?.nombre || "—";
  const admin = typeof esAdmin === "function" ? esAdmin(nombreUsuario) : !!esAdmin;
  // Tres roles:
  //   "ver"      → trabajador: carga y ve SOLO las suyas (+ bandeja "Por Aprobar"
  //                si figura en la cadena de alguien).
  //   "editar"   → aprobador: lo suyo + las que le toca aprobar. NO ve todas.
  //   verTodas   → supervisor: ve TODAS (solo lectura; solo el dueño modifica),
  //                con Reportes y Pagos. Se activa por usuario con el flag
  //                rendVerTodas en Gestión de Usuarios (admin/CFO siempre lo tienen).
  //   "sin_acceso" → no llega acá (FinanzasModule no renderiza la pestaña).
  const esCFO = !!usuarioActual?.esCFO;
  const verTodas = admin || esCFO || !!usuarioActual?.rendVerTodas;
  // Puede aprobar (supervisor, editor, o fallback legacy para rendiciones sin cadena).
  const esAprobador = verTodas || nivelRendiciones === "editar";
  const miEmail = (usuarioActual?.email || "").toLowerCase();
  // Puede cargar rendiciones en nombre de otros: admin, flag rendPorOtros (Gestión
  // de Usuarios), o email en la lista legacy EMAILS_RINDEN_POR_OTROS (retrocompat).
  const puedeRendirPorOtros = admin || !!usuarioActual?.rendPorOtros || EMAILS_RINDEN_POR_OTROS.map(e => e.toLowerCase()).includes(miEmail);

  const [rendiciones, setRendiciones] = useState([]);
  const [tcData, setTcData] = useState({});
  const [config, setConfig] = useState({ valorKm: 0 }); // config global (valor por km, etc.) — solo admin la edita
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [tab, setTab] = useState("mis");
  const [editId, setEditId] = useState(null);   // rendición abierta en el editor
  const [revisar, setRevisar] = useState(null);  // {id, accion:"aprobar"|"rechazar"}
  const [comentario, setComentario] = useState("");
  const [reasignar, setReasignar] = useState(null);  // {id} — reasignar aprobador actual (admin)
  const [nuevoAprob, setNuevoAprob] = useState("");  // email del reemplazo
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [busca, setBusca] = useState("");

  // GUARD anti-borrado: solo se guarda tras una carga EXITOSA. Si la carga
  // falla, no se escribe nada (evita sobrescribir las rendiciones con []).
  const cargaOkRef = useRef(false);

  // GUARD anti-choque entre sesiones concurrentes: en vez de sobrescribir la
  // lista completa (una sesión pisaba los cambios de otra con su copia vieja),
  // el guardado LEE-FUSIONA-ESCRIBE: toma lo último del servidor y solo pisa
  // las rendiciones que ESTA sesión modificó (dirtyIds) / borró (deletedIds).
  // Una pestaña pasiva (sin cambios) tiene el set vacío → nunca guarda → nunca
  // puede pisar a nadie. Ver guardarMerge().
  const dirtyIdsRef = useRef(new Set());
  const deletedIdsRef = useRef(new Set());
  const rendicionesRef = useRef([]);

  // ── Carga inicial ──
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [data, tc, cfg] = await Promise.all([
          dbLoadGeneric("rendiciones"),
          dbLoadGeneric("maestro_tc"),
          dbLoadGeneric("rendiciones_config"),
        ]);
        if (alive) {
          setRendiciones(Array.isArray(data) ? data : []);
          setTcData(tc && typeof tc === "object" ? tc : {});
          const cfgNext = cfg && typeof cfg === "object" ? { valorKm: 0, personasExternas: [], categoriasExtra: [], ...cfg } : { valorKm: 0, personasExternas: [], categoriasExtra: [] };
          setConfig(cfgNext);
          setCategoriasExtra(cfgNext.categoriasExtra);   // registrar categorías personalizadas (labels en exports/reportes)
          cargaOkRef.current = true; // carga exitosa → habilita auto-save
        }
      } catch (e) {
        console.error("[Rendiciones] Carga falló — GUARDADO DESHABILITADO esta sesión:", e);
      }
      if (alive) setCargando(false);
    })();
    return () => { alive = false; };
  }, []);

  // Mantener una ref con el estado más reciente para el guardado diferido.
  useEffect(() => { rendicionesRef.current = rendiciones; }, [rendiciones]);

  // Guardado LEE-FUSIONA-ESCRIBE (anti-choque concurrente).
  // 1. Lee lo último del servidor.  2. Fusiona: el servidor manda como base, y
  // solo se pisan las rendiciones que ESTA sesión tocó (dirty) o borró (deleted).
  //    → los cambios de otras sesiones sobre rendiciones que yo NO toqué se
  //      conservan (ya no se pierden aprobaciones por overwrite).
  // 3. Escribe la lista fusionada.
  const guardarMerge = useCallback(async () => {
    const dirty = [...dirtyIdsRef.current];
    const deleted = [...deletedIdsRef.current];
    if (!dirty.length && !deleted.length) { setGuardando(false); return; }
    // Sacar del set lo que se intentará guardar; cambios nuevos durante el
    // async quedan en el set y disparan otro ciclo.
    dirty.forEach(id => dirtyIdsRef.current.delete(id));
    deleted.forEach(id => deletedIdsRef.current.delete(id));
    try {
      const server = await dbLoadGeneric("rendiciones"); // propaga error de red
      const base = Array.isArray(server) ? server : [];
      const map = new Map(base.map(r => [r.id, r])); // servidor = base
      const local = rendicionesRef.current || [];
      // Conservar registros locales que el servidor aún no tiene (creados aquí,
      // o server vacío) sin pisar la versión del servidor de los compartidos.
      for (const r of local) if (!map.has(r.id)) map.set(r.id, r);
      // Mis cambios explícitos pisan solo lo que toqué.
      for (const id of dirty) { const mine = local.find(x => x.id === id); if (mine) map.set(id, mine); }
      for (const id of deleted) map.delete(id);
      await dbSaveGeneric("rendiciones", [...map.values()]);
    } catch (e) {
      // Reencolar lo no guardado para reintentar en el próximo ciclo.
      dirty.forEach(id => dirtyIdsRef.current.add(id));
      deleted.forEach(id => deletedIdsRef.current.add(id));
      console.warn("[Rendiciones] guardado (merge) falló, se reintenta:", e?.message || e);
    } finally {
      setGuardando(false);
    }
  }, []);

  // ── Auto-save (debounce 1s) — solo si hay cambios propios pendientes ──
  const timer = useRef(null);
  const primero = useRef(true);
  useEffect(() => {
    if (cargando) return;
    if (!cargaOkRef.current) return; // no guardar si la carga inicial falló
    if (primero.current) { primero.current = false; return; }
    if (!dirtyIdsRef.current.size && !deletedIdsRef.current.size) return; // nada propio que guardar
    if (timer.current) clearTimeout(timer.current);
    setGuardando(true);
    timer.current = setTimeout(() => { guardarMerge(); }, 1000);
  }, [rendiciones]); // eslint-disable-line

  // ── Mutadores ──
  const upsert = useCallback((rend) => {
    dirtyIdsRef.current.add(rend.id);      // marcar como cambio propio a persistir
    deletedIdsRef.current.delete(rend.id); // por si se recrea/reactiva
    setRendiciones(prev => {
      const i = prev.findIndex(r => r.id === rend.id);
      if (i === -1) return [rend, ...prev];
      const cp = [...prev]; cp[i] = rend; return cp;
    });
  }, []);

  // Solo el administrador actualiza el valor por kilómetro (config global, persistida aparte).
  const guardarValorKm = useCallback(async (v) => {
    if (!admin) return;
    if (!cargaOkRef.current) { console.warn("[Rendiciones] config no guardada — carga inicial falló."); return; }
    const next = { ...config, valorKm: Math.max(0, Number(v) || 0) };
    setConfig(next);
    await dbSaveGeneric("rendiciones_config", next);
  }, [admin, config]);

  // Maestro de personas externas (no usuarios). Lo gestiona quien puede rendir por otros.
  const guardarPersonasExternas = useCallback(async (list) => {
    if (!puedeRendirPorOtros) return;
    if (!cargaOkRef.current) { console.warn("[Rendiciones] personas externas no guardadas — carga inicial falló."); return; }
    const next = { ...config, personasExternas: Array.isArray(list) ? list : [] };
    setConfig(next);
    await dbSaveGeneric("rendiciones_config", next);
  }, [puedeRendirPorOtros, config]);

  // Categorías personalizadas (el admin las agrega desde la app). Se registran en
  // CAT_MAP/CATEGORIAS_EXTRA para que labels salgan bien en el selector, reportes y exports.
  const guardarCategorias = useCallback(async (list) => {
    if (!admin) return;
    if (!cargaOkRef.current) { console.warn("[Rendiciones] categorías no guardadas — carga inicial falló."); return; }
    const limpia = (Array.isArray(list) ? list : []).filter(c => c && c.v && c.l);
    setCategoriasExtra(limpia);
    const next = { ...config, categoriasExtra: limpia };
    setConfig(next);
    await dbSaveGeneric("rendiciones_config", next);
  }, [admin, config]);

  const pushHist = (r, accion, comentario = "") => ({
    ...r,
    historial: [...(r.historial || []), { accion, usuario: nombreUsuario, fecha: nowISO(), comentario }],
  });

  const nextFolio = () => (rendiciones.reduce((m, r) => Math.max(m, r.folio || 0), 0) + 1);

  const crearRendicion = () => {
    const r = {
      id: uid(), folio: nextFolio(),
      trabajador: nombreUsuario, trabajadorEmail: usuarioActual?.email || "", cargo: usuarioActual?.cargo || "",
      empresa: EMPRESAS[0], titulo: "", periodo: hoyISO(),
      monedaPago: "CLP", fechaTC: hoyISO(),
      estado: "borrador", gastos: [], comentarioRevisor: "",
      creadaPor: nombreUsuario, creadaPorEmail: miEmail,
      creadoEn: nowISO(), enviadoEn: null, revisadoEn: null, revisadoPor: null, pagadoEn: null, pagadoPor: null,
      historial: [{ accion: "creada", usuario: nombreUsuario, fecha: nowISO(), comentario: "" }],
    };
    upsert(r);
    setEditId(r.id);
  };

  const eliminarRendicion = async (r) => {
    if (!window.confirm(`¿Eliminar rendición #${r.folio} "${r.titulo || "sin título"}"? Esta acción no se puede deshacer.`)) return;
    // borrar adjuntos del storage
    for (const g of (r.gastos || [])) {
      const p = pathDesdeUrlStorage(g.adjuntoUrl);
      if (p) await eliminarArchivoFrisku(p);
    }
    deletedIdsRef.current.add(r.id);      // marcar borrado para propagarlo en el merge
    dirtyIdsRef.current.delete(r.id);
    setRendiciones(prev => prev.filter(x => x.id !== r.id));
    if (editId === r.id) setEditId(null);
  };

  // ── Notificaciones por correo ──
  // Avisa a los aprobadores/pagadores aunque no estén mirando la app.
  const notif = (to, subject, message) => {
    const dest = (Array.isArray(to) ? to : [to]).map(e => (e || "").trim()).filter(Boolean);
    if (!dest.length) return;
    // No bloquea el flujo: si el correo falla, la rendición igual avanza.
    enviarEmail({ to: [...new Set(dest)].join(","), subject, message, modulo: "mediterra" })
      .catch(e => console.warn("[Rendiciones] notif falló:", e?.message || e));
  };
  // Pagadores = quienes ven todas y cargan a pago (CFO / supervisores con rendVerTodas).
  const emailsPagadores = () => (usuarios || [])
    .filter(u => u.esCFO || u.rendVerTodas)
    .map(u => u.email).filter(Boolean);

  const enviar = (r) => {
    if (!r.titulo?.trim()) { alert("Ponle un título/glosa a la rendición antes de enviarla."); return; }
    if (!(r.gastos || []).length) { alert("Agrega al menos un gasto antes de enviar."); return; }
    const faltaMonto = r.gastos.some(g => !(Number(g.monto) > 0));
    if (faltaMonto) { alert("Hay gastos sin monto. Complétalos antes de enviar."); return; }
    const sinRespaldo = r.gastos.filter(g => !g.adjuntoUrl && g.categoria !== "kilometraje").length;
    if (sinRespaldo) { alert(`Hay ${sinRespaldo} gasto(s) sin respaldo adjunto. Cada gasto debe llevar su boleta, factura o comprobante (foto o PDF) antes de enviar.`); return; }
    // Congelar la cadena de aprobación del TRABAJADOR (no de quien la carga).
    // Si la cargó una secretaria en nombre de un gerente, usa la cadena del gerente.
    // Persona externa (no usuario): sin cadena propia → la aprueban los aprobadores/CFO generales.
    const trabajadorUser = (usuarios || []).find(u => (u.email || "").toLowerCase() === (r.trabajadorEmail || "").toLowerCase()) || usuarioActual;
    const cadena = r.trabajadorNoUsuario ? [] : resolverCadena(trabajadorUser, usuarios);
    upsert(pushHist({
      ...r, estado: "enviada", enviadoEn: nowISO(),
      cadena, nivelActual: 0, aprobaciones: [], devuelta: false,
    }, "enviada"));
    // Avisar al primer aprobador (o a los pagadores si no hay cadena definida).
    const destino = cadena.length ? [cadena[0].email] : emailsPagadores();
    const porEncargo = r.creadaPor && r.creadaPor !== r.trabajador ? ` (cargada por ${r.creadaPor})` : "";
    notif(destino,
      `Rendición #${r.folio} por aprobar — ${r.trabajador}`,
      `Se envió la rendición #${r.folio} "${r.titulo}" de ${r.trabajador}${porEncargo} para tu aprobación.\n\n` +
      `Ingresa a ${APP_URL}, pestaña Finanzas → Rendiciones → Por Aprobar.`);
    setEditId(null);
  };

  const aprobarRechazar = (r, accion, coment) => {
    // Rechazo en cualquier nivel → vuelve al trabajador; al reenviar arranca de 0.
    if (accion === "rechazar") {
      upsert(pushHist({
        ...r, estado: "rechazada", comentarioRevisor: coment || "",
        revisadoEn: nowISO(), revisadoPor: nombreUsuario, nivelActual: 0,
      }, "rechazada", coment));
      notif([r.trabajadorEmail],
        `Rendición #${r.folio} rechazada`,
        `${nombreUsuario} rechazó tu rendición #${r.folio} "${r.titulo}".\n` +
        (coment ? `Motivo: ${coment}\n` : "") +
        `\nCorrige lo indicado y vuelve a enviarla en ${APP_URL}, pestaña Finanzas → Rendiciones.`);
      return;
    }
    // Aprobación: avanza un nivel; al pasar el último → aprobada.
    const cadena = Array.isArray(r.cadena) ? r.cadena : [];
    const idx = r.nivelActual || 0;
    // ¿Es el aprobador nombrado de este nivel? Si NO lo es pero es admin/CFO,
    // se trata de un OVERRIDE de autoridad: aprueba y finaliza en un solo paso
    // (sin tener que reasignarse ni recorrer nivel por nivel).
    const esMiTurnoNombrado = !cadena.length || (pasoActual(r)?.email || "").toLowerCase() === miEmail;
    const overrideAdmin = admin && !esMiTurnoNombrado;
    const aprobaciones = [...(r.aprobaciones || []),
      { email: miEmail, nombre: nombreUsuario, fecha: nowISO(), comentario: coment || "", nivel: idx, ...(overrideAdmin ? { override: true } : {}) }];
    const esUltimo = !cadena.length || idx >= cadena.length - 1 || overrideAdmin;
    if (esUltimo) {
      upsert(pushHist({
        ...r, estado: "aprobada", aprobaciones,
        revisadoEn: nowISO(), revisadoPor: nombreUsuario, comentarioRevisor: coment || "",
        nivelActual: cadena.length ? (overrideAdmin ? cadena.length : idx + 1) : 0,
      }, overrideAdmin ? "aprobada (override admin)" : "aprobada", coment));
      // Aprobación final → avisar a finanzas/administración/gerencia para cargar a pago.
      notif(EMAILS_PAGO,
        `Rendición #${r.folio} aprobada — lista para pago`,
        `La rendición #${r.folio} "${r.titulo}" de ${r.trabajador} quedó aprobada y está lista para cargar a pago.\n\n` +
        `Ingresa a ${APP_URL}, pestaña Finanzas → Rendiciones → Pagos.`);
    } else {
      const sig = cadena[idx + 1];
      upsert(pushHist({
        ...r, estado: "enviada", aprobaciones, nivelActual: idx + 1,
      }, `aprobó nivel ${idx + 1}`, (coment ? coment + " · " : "") + (sig ? `pasa a ${sig.nombre}` : "")));
      // Avisar al siguiente aprobador de la cadena.
      if (sig) notif([sig.email],
        `Rendición #${r.folio} por aprobar — ${r.trabajador}`,
        `La rendición #${r.folio} "${r.titulo}" de ${r.trabajador} avanzó y queda pendiente de tu aprobación.\n\n` +
        `Ingresa a ${APP_URL}, pestaña Finanzas → Rendiciones → Por Aprobar.`);
    }
  };

  // Reasignar el aprobador del paso pendiente (solo admin) — destraba ausencias.
  const reasignarPaso = (r, nuevoEmail) => {
    const u = (usuarios || []).find(x => (x.email || "").toLowerCase() === (nuevoEmail || "").toLowerCase());
    if (!u) return;
    const cadena = [...(r.cadena || [])];
    if (!cadena.length) return;
    const idx = r.nivelActual || 0;
    const anterior = cadena[idx];
    cadena[idx] = { email: (u.email || "").toLowerCase(), nombre: u.nombre };
    upsert(pushHist({ ...r, cadena }, "reasignó aprobador",
      `Nivel ${idx + 1}: ${anterior?.nombre || "?"} → ${u.nombre}`));
  };

  const marcarPagada = (r) => {
    upsert(pushHist({ ...r, estado: "pagada", pagadoEn: nowISO(), pagadoPor: nombreUsuario }, "pagada"));
  };

  // Devolver una rendición YA APROBADA (no pagada) al trabajador para que corrija/incorpore un gasto.
  // La usa quien la aprobó o un admin. Al reenviarla, vuelve a pasar por la cadena desde el nivel 1.
  const devolverParaCorreccion = (r, motivo) => {
    upsert(pushHist({
      ...r, estado: "rechazada", devuelta: true,
      comentarioRevisor: motivo || "Devuelta para incorporar o corregir un gasto.",
      revisadoEn: nowISO(), revisadoPor: nombreUsuario, nivelActual: 0, aprobaciones: [],
    }, "devuelta para corrección", motivo));
    notif([r.trabajadorEmail],
      `Rendición #${r.folio} devuelta para corrección`,
      `${nombreUsuario} devolvió tu rendición #${r.folio} "${r.titulo}" para que incorpores o corrijas un gasto.\n` +
      (motivo ? `Nota: ${motivo}\n` : "") +
      `\nAgrégalo y vuelve a enviarla en ${APP_URL}, pestaña Finanzas → Rendiciones. Volverá a pasar por la aprobación.`);
  };

  // ── Vistas derivadas ──
  const misRendiciones = useMemo(
    () => rendiciones.filter(r => r.trabajador === nombreUsuario || r.creadaPor === nombreUsuario).sort((a, b) => (b.folio || 0) - (a.folio || 0)),
    [rendiciones, nombreUsuario]
  );
  const porAprobar = useMemo(
    () => rendiciones.filter(r => {
      if (r.estado !== "enviada") return false;
      if (verTodas) return true;  // supervisor/admin ve todas las pendientes (aprobar lo suyo o reasignar)
      return meTocaAprobar(r, miEmail, esAprobador, admin);
    }).sort((a, b) => new Date(a.enviadoEn || 0) - new Date(b.enviadoEn || 0)),
    [rendiciones, verTodas, miEmail, esAprobador]
  );
  // Un supervisor que figura en alguna cadena ve la bandeja "Por Aprobar"
  // aunque su nivel de pestaña sea "ver" (solo carga lo suyo).
  const esAprobadorEnCadena = useMemo(
    () => rendiciones.some(r => Array.isArray(r.cadena) && r.cadena.some(p => (p.email || "").toLowerCase() === miEmail)),
    [rendiciones, miEmail]
  );
  const muestraAprobar = esAprobador || esAprobadorEnCadena;
  const paraPago = useMemo(
    () => rendiciones.filter(r => r.estado === "aprobada").sort((a, b) => new Date(a.revisadoEn || 0) - new Date(b.revisadoEn || 0)),
    [rendiciones]
  );
  // Aprobadas por mí, aún no pagadas: las puedo devolver al trabajador desde "Por Aprobar".
  const aprobadasMias = useMemo(
    () => rendiciones.filter(r => r.estado === "aprobada" && (admin || r.revisadoPor === nombreUsuario))
      .sort((a, b) => new Date(b.revisadoEn || 0) - new Date(a.revisadoEn || 0)),
    [rendiciones, admin, nombreUsuario]
  );

  const editRend = rendiciones.find(r => r.id === editId) || null;

  // ── Tabs visibles según rol ──
  const TABS = [
    { id: "mis", label: "🧾 Mis Rendiciones", show: true },
    { id: "aprobar", label: `✅ Por Aprobar${porAprobar.length ? ` (${porAprobar.length})` : ""}`, show: muestraAprobar },
    { id: "pagos", label: `💵 Pagos${paraPago.length ? ` (${paraPago.length})` : ""}`, show: verTodas },
    { id: "reportes", label: "📊 Reportes", show: verTodas },
  ].filter(t => t.show);

  if (cargando) {
    return <div style={{ padding: 60, textAlign: "center", color: C.muted, fontFamily: "sans-serif" }}>Cargando rendiciones…</div>;
  }

  return (
    <div style={{ fontFamily: "sans-serif", color: C.text, maxWidth: 1180, margin: "0 auto", padding: "0 18px 60px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 0", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {onBack && <Btn kind="ghost" small onClick={onBack}>← Volver</Btn>}
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>🧾 Rendiciones de Gasto</div>
            <div style={{ fontSize: 12.5, color: C.muted }}>{nombreUsuario}{usuarioActual?.cargo ? ` · ${usuarioActual.cargo}` : ""}{verTodas ? " · Supervisor" : (esAprobador ? " · Aprobador" : "")}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11.5, color: guardando ? C.warning : C.muted2 }}>{guardando ? "Guardando…" : "Guardado ✓"}</span>
          {onLogout && <Btn kind="ghost" small onClick={onLogout}>Salir</Btn>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, borderBottom: `1px solid ${C.border}`, marginBottom: 18, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: "9px 16px", border: "none", background: "none", cursor: "pointer",
              fontWeight: 700, fontSize: 13.5, color: tab === t.id ? C.primary : C.muted,
              borderBottom: `3px solid ${tab === t.id ? C.primary : "transparent"}`, marginBottom: -1,
            }}>{t.label}</button>
        ))}
      </div>

      {tab === "mis" && (
        <MisRendiciones
          rends={misRendiciones} onCrear={crearRendicion} admin={admin}
          onAbrir={setEditId} onEliminar={eliminarRendicion} tcData={tcData}
          valorKm={config.valorKm} onGuardarValorKm={guardarValorKm}
        />
      )}
      {tab === "aprobar" && muestraAprobar && (
        <BandejaAprobar rends={porAprobar} onAbrir={setEditId} tcData={tcData}
          miEmail={miEmail} esAprobador={esAprobador} admin={admin}
          aprobadasMias={aprobadasMias} onDevolver={devolverParaCorreccion}
          onAprobar={r => { setRevisar({ id: r.id, accion: "aprobar" }); setComentario(""); }}
          onRechazar={r => { setRevisar({ id: r.id, accion: "rechazar" }); setComentario(""); }}
          onReasignar={r => { setReasignar({ id: r.id }); setNuevoAprob(""); }}
        />
      )}
      {tab === "pagos" && verTodas && (
        <BandejaPagos rends={paraPago} onAbrir={setEditId} onPagar={marcarPagada} tcData={tcData}
          puedeDevolver={r => r.estado === "aprobada" && (admin || r.revisadoPor === nombreUsuario)}
          onDevolver={devolverParaCorreccion} />
      )}
      {tab === "reportes" && verTodas && (
        <Reportes rends={rendiciones} filtroEstado={filtroEstado} setFiltroEstado={setFiltroEstado}
          busca={busca} setBusca={setBusca} onAbrir={setEditId} tcData={tcData} />
      )}

      {/* Editor de rendición */}
      {editRend && (
        <EditorRendicion
          rend={editRend} upsert={upsert} onClose={() => setEditId(null)}
          onEnviar={enviar} esDueno={editRend.trabajador === nombreUsuario || editRend.creadaPor === nombreUsuario}
          esAprobador={esAprobador} admin={admin} onEliminar={eliminarRendicion} tcData={tcData}
          usuarios={usuarios} puedeRendirPorOtros={puedeRendirPorOtros}
          valorKm={config.valorKm}
          personasExternas={config.personasExternas || []} onGuardarPersonas={guardarPersonasExternas}
          categoriasExtra={config.categoriasExtra || []} onGuardarCategorias={guardarCategorias}
          puedeDevolver={editRend.estado === "aprobada" && (admin || editRend.revisadoPor === nombreUsuario)}
          onDevolver={devolverParaCorreccion}
        />
      )}

      {/* Modal aprobar/rechazar */}
      {revisar && (() => {
        const r = rendiciones.find(x => x.id === revisar.id);
        if (!r) return null;
        const esAprob = revisar.accion === "aprobar";
        const cad = Array.isArray(r.cadena) ? r.cadena : [];
        const idx = r.nivelActual || 0;
        const sig = cad[idx + 1];
        const esMiTurnoNombrado = !cad.length || (cad[idx]?.email || "").toLowerCase() === miEmail;
        const overrideAdmin = admin && !esMiTurnoNombrado;
        return (
          <Modal width={480} title={esAprob ? `Aprobar rendición #${r.folio}` : `Rechazar rendición #${r.folio}`} onClose={() => setRevisar(null)}>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>
              {r.trabajador} · {fmtTotales(totalesPorMoneda(r.gastos))} · {(r.gastos || []).length} gasto(s)
            </div>
            {esAprob && overrideAdmin && (
              <div style={{ fontSize: 12, background: C.infoBg, color: C.primary, borderRadius: 8, padding: "8px 10px", marginBottom: 12 }}>
                Aprobación como <b>admin/CFO</b>: el aprobador de este nivel es <b>{cad[idx]?.nombre || "otro usuario"}</b>, pero al aprobar tú queda <b>aprobada</b> directamente (queda registrado como override).
              </div>
            )}
            {cad.length > 1 && !overrideAdmin && (
              <div style={{ fontSize: 12, background: C.infoBg, color: C.primary, borderRadius: 8, padding: "8px 10px", marginBottom: 12 }}>
                Cadena: nivel <b>{idx + 1}</b> de {cad.length}.{" "}
                {esAprob
                  ? (sig ? <>Al aprobar pasa a <b>{sig.nombre}</b>.</> : <>Eres el último nivel: al aprobar queda <b>aprobada</b>.</>)
                  : <>Al rechazar vuelve al trabajador y deberá reenviarla desde el nivel 1.</>}
              </div>
            )}
            <Field label={esAprob ? "Comentario (opcional)" : "Motivo del rechazo"}>
              <textarea value={comentario} onChange={e => setComentario(e.target.value)}
                style={{ ...inputStyle, height: 80, resize: "vertical" }}
                placeholder={esAprob ? "Visto bueno…" : "Indica qué corregir…"} />
            </Field>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <Btn kind="ghost" onClick={() => setRevisar(null)}>Cancelar</Btn>
              <Btn kind={esAprob ? "success" : "danger"}
                disabled={!esAprob && !comentario.trim()}
                onClick={() => { aprobarRechazar(r, revisar.accion, comentario); setRevisar(null); }}>
                {esAprob ? "Aprobar" : "Rechazar"}
              </Btn>
            </div>
          </Modal>
        );
      })()}

      {/* Modal reasignar aprobador (solo admin) */}
      {reasignar && (() => {
        const r = rendiciones.find(x => x.id === reasignar.id);
        if (!r) return null;
        const cad = Array.isArray(r.cadena) ? r.cadena : [];
        const idx = r.nivelActual || 0;
        const actual = cad[idx];
        const disponibles = (usuarios || []).filter(x =>
          !x.desactivado && (x.email || "").trim() &&
          (x.email || "").toLowerCase() !== (actual?.email || "").toLowerCase()
        );
        return (
          <Modal width={460} title={`Reasignar aprobador · #${r.folio}`} onClose={() => setReasignar(null)}>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>
              {r.trabajador} · esperando aprobación de <b style={{ color: C.text }}>{actual?.nombre || "—"}</b> (nivel {idx + 1} de {cad.length}).
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
              Reasigna este paso a otra persona (ej. el aprobador está de vacaciones). Solo afecta esta rendición; la configuración del trabajador no se modifica.
            </div>
            <Field label="Nuevo aprobador para este paso">
              <select value={nuevoAprob} onChange={e => setNuevoAprob(e.target.value)} style={inputStyle}>
                <option value="">Selecciona…</option>
                {disponibles.map(x => (
                  <option key={x.email} value={(x.email || "").toLowerCase()}>{x.nombre}{x.cargo ? ` · ${x.cargo}` : ""}</option>
                ))}
              </select>
            </Field>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <Btn kind="ghost" onClick={() => setReasignar(null)}>Cancelar</Btn>
              <Btn kind="primary" disabled={!nuevoAprob}
                onClick={() => { reasignarPaso(r, nuevoAprob); setReasignar(null); }}>
                Reasignar
              </Btn>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Tarjeta de rendición (resumen)
// ───────────────────────────────────────────────────────────────────
function RendCard({ r, children, onClick, mostrarTrabajador, tcData }) {
  const totales = totalesPorMoneda(r.gastos);
  const monedaPago = r.monedaPago || "CLP";
  const monedas = Object.keys(totales).filter(k => totales[k]);
  const requiereConv = tcData && (monedas.length > 1 || (monedas[0] && monedas[0] !== monedaPago));
  const conv = requiereConv ? totalConvertido(r.gastos, monedaPago, r.fechaTC || r.periodo, tcData, r.tcManual) : null;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, boxShadow: C.shadowSm }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div onClick={onClick} style={{ cursor: onClick ? "pointer" : "default", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800, fontSize: 15 }}>#{r.folio}</span>
            <EstadoBadge estado={r.estado} devuelta={r.devuelta} />
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>{r.titulo || <i style={{ color: C.muted2 }}>Sin título</i>}</span>
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 5 }}>
            {mostrarTrabajador && <>{r.trabajador} · </>}
            {r.empresa} · {(r.gastos || []).length} gasto(s) · {fmtFecha(r.periodo)}
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.primary, marginTop: 6 }}>
            {fmtTotales(totales)}
          </div>
          {conv && (
            <div style={{ fontSize: 12, color: C.accent2, fontWeight: 700, marginTop: 2 }}>
              A pagar: {fmtMonto(conv.total, monedaPago)}{conv.faltan.length > 0 ? " ⚠ (TC parcial)" : ""}
            </div>
          )}
          {r.estado === "rechazada" && r.comentarioRevisor && (
            <div style={{ fontSize: 12, color: C.danger, marginTop: 6, background: C.dangerBg, padding: "6px 9px", borderRadius: 7 }}>
              ❌ {r.comentarioRevisor}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>{children}</div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Tab: Mis Rendiciones
// ───────────────────────────────────────────────────────────────────
function MisRendiciones({ rends, onCrear, onAbrir, onEliminar, tcData, admin, valorKm = 0, onGuardarValorKm }) {
  const [editKm, setEditKm] = useState(false);
  const [kmVal, setKmVal] = useState("");
  return (
    <div>
      {/* Valor por kilómetro — visible para todos, editable solo por admin */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 12px" }}>
        <span style={{ fontSize: 13 }}>🚗</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: C.muted }}>Valor por kilómetro:</span>
        {editKm ? (
          <>
            <input type="number" autoFocus value={kmVal} onChange={e => setKmVal(e.target.value)}
              style={{ width: 110, padding: "5px 9px", borderRadius: 7, border: `1px solid ${C.primary}`, fontSize: 13, textAlign: "right" }} placeholder="$/km" />
            <Btn small onClick={() => { onGuardarValorKm?.(kmVal); setEditKm(false); }}>Guardar</Btn>
            <Btn small kind="ghost" onClick={() => setEditKm(false)}>Cancelar</Btn>
          </>
        ) : (
          <>
            <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{fmtMonto(valorKm, "CLP")} <span style={{ fontSize: 11, fontWeight: 600, color: C.muted2 }}>/ km</span></span>
            {admin
              ? <Btn small kind="ghost" onClick={() => { setKmVal(String(valorKm || "")); setEditKm(true); }}>Editar</Btn>
              : <span style={{ fontSize: 11, color: C.muted2 }}>(lo actualiza el administrador)</span>}
          </>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: C.muted }}>{rends.length} rendición(es)</div>
        <Btn onClick={onCrear}>+ Nueva rendición</Btn>
      </div>
      {!rends.length && (
        <div style={{ textAlign: "center", padding: "56px 20px", background: C.card, borderRadius: 12, border: `1px dashed ${C.border}` }}>
          <div style={{ fontSize: 42, marginBottom: 10, opacity: 0.85 }}>🧾</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>Aún no tienes rendiciones</div>
          <div style={{ fontSize: 13, color: C.muted, maxWidth: 340, margin: "0 auto 16px", lineHeight: 1.5 }}>Crea una para empezar a cargar tus gastos con sus respaldos.</div>
          <Btn onClick={onCrear}>+ Nueva rendición</Btn>
        </div>
      )}
      <div style={{ display: "grid", gap: 10 }}>
        {rends.map(r => (
          <RendCard key={r.id} r={r} onClick={() => onAbrir(r.id)} tcData={tcData}>
            <Btn kind="ghost" small onClick={() => onAbrir(r.id)}>{r.estado === "borrador" || r.estado === "rechazada" ? "Editar" : "Ver"}</Btn>
            {(r.estado === "borrador" || r.estado === "rechazada" || admin) && (
              <Btn kind="ghost" small style={{ color: C.danger, borderColor: C.danger }} onClick={() => onEliminar(r)}>Eliminar</Btn>
            )}
          </RendCard>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Tab: Por Aprobar
// ───────────────────────────────────────────────────────────────────
function BandejaAprobar({ rends, onAbrir, onAprobar, onRechazar, onReasignar, tcData, miEmail, esAprobador, admin, aprobadasMias = [], onDevolver }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>{rends.length} rendición(es) esperando revisión</div>
      {!rends.length && (
        <div style={{ textAlign: "center", padding: "50px 20px", color: C.muted2, background: C.card, borderRadius: 12, border: `1px dashed ${C.border}` }}>
          No hay rendiciones pendientes de aprobación. ✓
        </div>
      )}
      {/* Aprobadas por mí, aún no pagadas: puedo devolverlas si faltó/sobra un gasto */}
      {aprobadasMias.length > 0 && (
        <div style={{ marginTop: rends.length ? 22 : 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: C.muted, marginBottom: 4 }}>Aprobadas por ti · pendientes de pago</div>
          <div style={{ fontSize: 11.5, color: C.muted2, marginBottom: 12 }}>Si al trabajador le faltó incorporar un gasto, puedes devolvérsela para que la corrija.</div>
          <div style={{ display: "grid", gap: 10 }}>
            {aprobadasMias.map(r => (
              <RendCard key={r.id} r={r} onClick={() => onAbrir(r.id)} mostrarTrabajador tcData={tcData}>
                <Btn kind="ghost" small onClick={() => onAbrir(r.id)}>Ver detalle</Btn>
                <Btn kind="ghost" small style={{ color: C.warning, borderColor: C.warning }} onClick={() => {
                  const motivo = window.prompt("Devolver al trabajador para corregir/incorporar un gasto.\n\nNota para el trabajador (opcional):", "Falta incorporar un gasto.");
                  if (motivo === null) return;
                  onDevolver?.(r, motivo);
                }}>↩ Devolver para corrección</Btn>
              </RendCard>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: "grid", gap: 10 }}>
        {rends.map(r => {
          const cad = Array.isArray(r.cadena) ? r.cadena : [];
          const idx = r.nivelActual || 0;
          const actual = cad[idx];
          const miTurno = meTocaAprobar(r, miEmail, esAprobador, admin);
          return (
            <RendCard key={r.id} r={r} onClick={() => onAbrir(r.id)} mostrarTrabajador tcData={tcData}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <Btn kind="ghost" small onClick={() => onAbrir(r.id)}>Revisar detalle</Btn>
                {cad.length > 1 && (
                  <span style={{ fontSize: 10.5, color: miTurno ? C.success : C.muted2 }}>
                    {miTurno ? "Te toca aprobar" : `Esperando a ${actual?.nombre || "—"}`} · nivel {idx + 1}/{cad.length}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                {miTurno ? (
                  <>
                    <Btn kind="success" small onClick={() => onAprobar(r)}>Aprobar</Btn>
                    <Btn kind="danger" small onClick={() => onRechazar(r)}>Rechazar</Btn>
                  </>
                ) : (
                  <span style={{ fontSize: 11, color: C.muted2, fontStyle: "italic" }}>No es tu turno</span>
                )}
                {admin && cad.length > 0 && (
                  <Btn kind="ghost" small onClick={() => onReasignar(r)}>↻ Reasignar</Btn>
                )}
              </div>
            </RendCard>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Tab: Pagos
// ───────────────────────────────────────────────────────────────────
function BandejaPagos({ rends, onAbrir, onPagar, tcData, puedeDevolver, onDevolver }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>{rends.length} rendición(es) aprobada(s) pendiente(s) de pago</div>
      {!rends.length && (
        <div style={{ textAlign: "center", padding: "50px 20px", color: C.muted2, background: C.card, borderRadius: 12, border: `1px dashed ${C.border}` }}>
          No hay rendiciones aprobadas pendientes de pago.
        </div>
      )}
      <div style={{ display: "grid", gap: 10 }}>
        {rends.map(r => (
          <RendCard key={r.id} r={r} onClick={() => onAbrir(r.id)} mostrarTrabajador tcData={tcData}>
            <Btn kind="ghost" small onClick={() => onAbrir(r.id)}>Ver detalle</Btn>
            {puedeDevolver?.(r) && (
              <Btn kind="ghost" small style={{ color: C.warning, borderColor: C.warning }} onClick={() => {
                const motivo = window.prompt("Devolver al trabajador para corregir/incorporar un gasto.\n\nNota para el trabajador (opcional):", "Falta incorporar un gasto.");
                if (motivo === null) return;
                onDevolver?.(r, motivo);
              }}>↩ Devolver</Btn>
            )}
            <Btn kind="accent" small onClick={() => onPagar(r)}>Marcar pagada</Btn>
          </RendCard>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Tab: Reportes
// ───────────────────────────────────────────────────────────────────
function Reportes({ rends, filtroEstado, setFiltroEstado, busca, setBusca, onAbrir, tcData }) {
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rends
      .filter(r => filtroEstado === "todos" || r.estado === filtroEstado)
      .filter(r => !q || `${r.folio} ${r.titulo} ${r.trabajador} ${r.empresa}`.toLowerCase().includes(q))
      .sort((a, b) => (b.folio || 0) - (a.folio || 0));
  }, [rends, filtroEstado, busca]);

  // Resumen en CLP equivalente: todo gasto se convierte a CLP vía TC (triangulando
  // por USD). Los gastos sin TC disponible se cuentan aparte como "sin convertir".
  const resumen = useMemo(() => {
    const r = {
      totalCLP: 0, sinTC: 0, nGastos: 0,
      porEmpresa: {}, porCategoria: {}, porTrabajador: {},
      catEmpresa: {}, catTrabajador: {},   // cruces: { categoria: { empresa|trabajador: monto } }
    };
    filtradas.forEach(rd => {
      const fecha = rd.fechaTC || rd.periodo;
      const emp = rd.empresa || "—";
      const trab = rd.trabajador || "—";
      (rd.gastos || []).forEach(g => {
        const c = convertir(g.monto, g.moneda || "CLP", "CLP", fecha, tcData, rd.monedaPago === "CLP" ? rd.tcManual : null, g.tc);
        if (!c.ok) { r.sinTC += 1; return; }
        const cat = CAT_MAP[g.categoria]?.l || g.categoria || "Otros";
        r.totalCLP += c.val; r.nGastos += 1;
        r.porEmpresa[emp] = (r.porEmpresa[emp] || 0) + c.val;
        r.porCategoria[cat] = (r.porCategoria[cat] || 0) + c.val;
        r.porTrabajador[trab] = (r.porTrabajador[trab] || 0) + c.val;
        (r.catEmpresa[cat] = r.catEmpresa[cat] || {})[emp] = (r.catEmpresa[cat][emp] || 0) + c.val;
        (r.catTrabajador[cat] = r.catTrabajador[cat] || {})[trab] = (r.catTrabajador[cat][trab] || 0) + c.val;
      });
    });
    return r;
  }, [filtradas, tcData]);

  const exportCSV = () => {
    const filas = [["Folio", "Estado", "Trabajador", "Empresa", "Título", "Fecha gasto", "Categoría", "Glosa", "Doc", "N° Doc", "Moneda", "Neto", "IVA", "Exento", "Total", "Total CLP equiv", "Adjunto"]];
    filtradas.forEach(r => {
      const fecha = r.fechaTC || r.periodo;
      (r.gastos || []).forEach(g => {
        const c = convertir(g.monto, g.moneda || "CLP", "CLP", fecha, tcData, r.monedaPago === "CLP" ? r.tcManual : null, g.tc);
        const esFactura = g.docTipo === "Factura";
        filas.push([
          r.folio, ESTADOS[r.estado]?.l || r.estado, r.trabajador, r.empresa, r.titulo,
          g.fecha || "", CAT_MAP[g.categoria]?.l || g.categoria || "", (g.glosa || "").replace(/"/g, "'"),
          g.docTipo || "", g.docNumero || "", g.moneda || "CLP",
          esFactura ? (Number(g.neto) || 0) : "", esFactura ? (Number(g.iva) || 0) : "", esFactura ? (Number(g.exento) || 0) : "", Number(g.monto) || 0,
          c.ok ? Math.round(c.val) : "sin TC", g.adjuntoUrl ? "sí" : "no",
        ]);
      });
    });
    const csv = filas.map(f => f.map(c => `"${String(c)}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rendiciones_${hoyISO()}.csv`;
    a.click();
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          <option value="todos">Todos los estados</option>
          {Object.keys(ESTADOS).map(k => <option key={k} value={k}>{ESTADOS[k].l}</option>)}
        </select>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar folio, trabajador, empresa…" style={{ ...inputStyle, width: 260 }} />
        <div style={{ flex: 1 }} />
        <Btn kind="ghost" onClick={exportCSV}>⬇ Exportar CSV</Btn>
      </div>

      {/* Dashboard de gráficos */}
      <ReportesDashboard resumen={resumen} nRend={filtradas.length} />

      <div style={{ fontSize: 12.5, fontWeight: 800, color: C.muted, margin: "4px 0 8px" }}>DETALLE ({filtradas.length})</div>
      <div style={{ display: "grid", gap: 10 }}>
        {filtradas.map(r => (
          <RendCard key={r.id} r={r} onClick={() => onAbrir(r.id)} mostrarTrabajador tcData={tcData}>
            <Btn kind="ghost" small onClick={() => onAbrir(r.id)}>Ver</Btn>
          </RendCard>
        ))}
        {!filtradas.length && <div style={{ textAlign: "center", padding: 40, color: C.muted2 }}>Sin resultados.</div>}
      </div>
    </div>
  );
}

function MiniBreakdown({ title, data, mapLabel = (k) => k }) {
  const items = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 700, marginBottom: 8 }}>{title.toUpperCase()} (CLP)</div>
      {!items.length && <div style={{ fontSize: 12, color: C.muted2 }}>—</div>}
      {items.map(([k, v]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "2px 0" }}>
          <span style={{ color: C.text }}>{mapLabel(k)}</span>
          <span style={{ fontWeight: 700, color: C.muted }}>{fmtMonto(v, "CLP")}</span>
        </div>
      ))}
    </div>
  );
}

// Paleta estable para gráficos (empresas, trabajadores, etc.)
const PALETA = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#65a30d", "#ca8a04", "#0d9488", "#9333ea", "#e11d48", "#475569", "#0369a1"];
function colorMap(keys) {
  const m = {}; keys.forEach((k, i) => { m[k] = PALETA[i % PALETA.length]; });
  return (k) => m[k] || "#94a3b8";
}

// Gráfico de barras horizontales simple (una dimensión).
function BarChart({ data, color = C.primary, empty = "Sin datos." }) {
  const items = Object.entries(data).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!items.length) return <div style={{ fontSize: 12, color: C.muted2, padding: 8 }}>{empty}</div>;
  const mx = items[0][1] || 1;
  const total = items.reduce((s, [, v]) => s + v, 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map(([k, v]) => (
        <div key={k}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3, gap: 8 }}>
            <span style={{ color: C.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k}</span>
            <span style={{ color: C.muted, whiteSpace: "nowrap" }}><strong style={{ color: C.text }}>{fmtMonto(v, "CLP")}</strong> · {total ? Math.round(v / total * 100) : 0}%</span>
          </div>
          <div style={{ height: 10, background: C.bg2, borderRadius: 6, overflow: "hidden" }}>
            <div style={{ width: `${Math.max(2, v / mx * 100)}%`, height: "100%", background: color, borderRadius: 6 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Barras apiladas: cada fila (categoría) dividida por color según la dimensión cruzada (empresa/trabajador).
function StackedBars({ data, empty = "Sin datos." }) {
  const rows = Object.entries(data).map(([rk, segs]) => ({
    rk, total: Object.values(segs).reduce((s, v) => s + v, 0), segs,
  })).filter(r => r.total > 0).sort((a, b) => b.total - a.total);
  if (!rows.length) return <div style={{ fontSize: 12, color: C.muted2, padding: 8 }}>{empty}</div>;
  const mx = rows[0].total || 1;
  // Claves de segmento ordenadas por monto total (para leyenda y colores estables).
  const segTot = {};
  rows.forEach(r => Object.entries(r.segs).forEach(([k, v]) => { segTot[k] = (segTot[k] || 0) + v; }));
  const segKeys = Object.keys(segTot).sort((a, b) => segTot[b] - segTot[a]);
  const cf = colorMap(segKeys);
  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map(r => (
          <div key={r.rk}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3, gap: 8 }}>
              <span style={{ color: C.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.rk}</span>
              <span style={{ color: C.text, fontWeight: 700, whiteSpace: "nowrap" }}>{fmtMonto(r.total, "CLP")}</span>
            </div>
            <div style={{ display: "flex", height: 12, width: `${Math.max(3, r.total / mx * 100)}%`, borderRadius: 6, overflow: "hidden", background: C.bg2 }}>
              {Object.entries(r.segs).sort((a, b) => b[1] - a[1]).map(([sk, sv]) => (
                <div key={sk} title={`${sk}: ${fmtMonto(sv, "CLP")}`} style={{ width: `${sv / r.total * 100}%`, background: cf(sk) }} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
        {segKeys.map(sk => (
          <span key={sk} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: C.muted }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: cf(sk), flexShrink: 0 }} />{sk}
          </span>
        ))}
      </div>
    </div>
  );
}

function ChartCard({ title, children, right }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.muted }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

// Mini selector de segmentos (pills).
function Seg({ value, onChange, opts }) {
  return (
    <div style={{ display: "inline-flex", gap: 4, background: C.bg2, borderRadius: 8, padding: 3 }}>
      {opts.map(o => (
        <button key={o.v} onClick={() => onChange(o.v)} style={{
          border: "none", cursor: "pointer", borderRadius: 6, padding: "4px 12px", fontSize: 11.5, fontWeight: 700,
          background: value === o.v ? C.card : "transparent", color: value === o.v ? C.primary : C.muted2,
          boxShadow: value === o.v ? "0 1px 3px #0001" : "none",
        }}>{o.l}</button>
      ))}
    </div>
  );
}

function ReportesDashboard({ resumen, nRend }) {
  const [dim, setDim] = useState("empresa");       // 2ª barra: por empresa / trabajador
  const [cruce, setCruce] = useState("empresa");   // stacked: concepto × empresa / trabajador
  const promedio = nRend ? resumen.totalCLP / nRend : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 18 }}>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        {[
          ["Total CLP equiv.", fmtMonto(resumen.totalCLP, "CLP"), C.primary],
          ["Rendiciones", String(nRend), C.accent2],
          ["Gastos", String(resumen.nGastos), C.success],
          ["Promedio / rendición", fmtMonto(promedio, "CLP"), C.warning],
        ].map(([l, v, col]) => (
          <div key={l} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>{l.toUpperCase()}</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: col, marginTop: 4 }}>{v}</div>
          </div>
        ))}
      </div>
      {resumen.sinTC > 0 && (
        <div style={{ fontSize: 11.5, color: C.warning, background: C.warningBg, border: `1px solid ${C.warning}`, borderRadius: 8, padding: "6px 10px" }}>
          ⚠ {resumen.sinTC} gasto(s) sin tipo de cambio quedaron fuera de los totales. Cárgalo en el gasto o en Maestros → TC.
        </div>
      )}
      {/* Fila de 2 gráficos */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 }}>
        <ChartCard title="GASTOS POR CONCEPTO">
          <BarChart data={resumen.porCategoria} color={C.primary} />
        </ChartCard>
        <ChartCard title={dim === "empresa" ? "GASTOS POR EMPRESA" : "GASTOS POR TRABAJADOR"}
          right={<Seg value={dim} onChange={setDim} opts={[{ v: "empresa", l: "Empresa" }, { v: "trabajador", l: "Trabajador" }]} />}>
          <BarChart data={dim === "empresa" ? resumen.porEmpresa : resumen.porTrabajador} color={C.accent2} />
        </ChartCard>
      </div>
      {/* Cruce concepto × dimensión (stacked) */}
      <ChartCard title={cruce === "empresa" ? "CONCEPTO × EMPRESA" : "CONCEPTO × TRABAJADOR"}
        right={<Seg value={cruce} onChange={setCruce} opts={[{ v: "empresa", l: "× Empresa" }, { v: "trabajador", l: "× Trabajador" }]} />}>
        <StackedBars data={cruce === "empresa" ? resumen.catEmpresa : resumen.catTrabajador} />
      </ChartCard>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Editor de una rendición (con gastos + adjuntos)
// ───────────────────────────────────────────────────────────────────
function EditorRendicion({ rend, upsert, onClose, onEnviar, esDueno, esAprobador, onEliminar, tcData, admin, usuarios = [], puedeRendirPorOtros, valorKm = 0, personasExternas = [], onGuardarPersonas, categoriasExtra = [], onGuardarCategorias, puedeDevolver = false, onDevolver }) {
  const [modalExt, setModalExt] = useState(false);
  const [extForm, setExtForm] = useState({ nombre: "", cargo: "", email: "" });
  const [modalCat, setModalCat] = useState(false);
  const [catForm, setCatForm] = useState({ ic: "", l: "" });
  const [catGastoId, setCatGastoId] = useState(null); // gasto al que aplicar la categoría nueva
  const CATS = [...CATEGORIAS_BASE, ...(categoriasExtra || [])]; // reactivo al agregar
  const esMovil = useEsMovil();
  const editable = esDueno && (rend.estado === "borrador" || rend.estado === "rechazada");
  // La fecha/moneda de pago la define quien paga (aprobador) incluso después de enviada.
  const editableTC = esAprobador || editable;
  const [subiendo, setSubiendo] = useState(null); // id de gasto subiendo archivo
  const [exportando, setExportando] = useState(null); // "excel" | "pdf" | null

  const descargarExcel = async () => {
    setExportando("excel");
    try { await exportarRendicionExcel(rend, tcData); }
    catch (e) { alert("No se pudo generar el Excel: " + (e?.message || e)); }
    finally { setExportando(null); }
  };
  const descargarPDF = async () => {
    setExportando("pdf");
    try {
      const res = await exportarRendicionPDF(rend, tcData);
      if (res && res.fallidos > 0) {
        alert(`PDF generado. ${res.okAdjuntos} respaldo(s) anexado(s); ${res.fallidos} no se pudieron incrustar (formato no soportado o error de descarga).`);
      }
    } catch (e) {
      alert("No se pudo generar el PDF: " + (e?.message || e));
    } finally { setExportando(null); }
  };

  const monedaPago = rend.monedaPago || "CLP";
  const fechaTC = rend.fechaTC || rend.periodo || hoyISO();

  const setCampo = (k, v) => upsert({ ...rend, [k]: v });

  const addGasto = () => {
    const g = { id: uid("g"), fecha: hoyISO(), categoria: "movilizacion", glosa: "", monto: "", moneda: "CLP", docTipo: "Boleta", docNumero: "", adjuntoUrl: "", adjuntoNombre: "" };
    upsert({ ...rend, gastos: [...(rend.gastos || []), g] });
    // Móvil: llevar el foco al gasto recién agregado para no tener que subir/bajar.
    setTimeout(() => {
      const el = document.getElementById("gasto-" + g.id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const primerInput = el.querySelector("input, select, textarea");
        if (primerInput) try { primerInput.focus({ preventScroll: true }); } catch (_) {}
      }
    }, 120);
  };
  const setGasto = (gid, k, v) => upsert({ ...rend, gastos: rend.gastos.map(g => g.id === gid ? { ...g, [k]: v } : g) });
  const setGastoMulti = (gid, patch) => upsert({ ...rend, gastos: rend.gastos.map(g => g.id === gid ? { ...g, ...patch } : g) });
  // Desglose de factura: monto = neto + IVA + exento. IVA Chile 19% por defecto al editar neto, pero editable.
  const setGastoFactura = (g, field, rawVal) => {
    const num = rawVal === "" ? "" : (Number(rawVal) || 0);
    let neto = g.neto, iva = g.iva, exento = g.exento;
    if (field === "neto") { neto = num; iva = (num === "" ? "" : Math.round(Number(num) * 0.19)); }
    else if (field === "exento") { exento = num; }
    else { iva = num; }
    const total = (Number(neto) || 0) + (Number(iva) || 0) + (Number(exento) || 0);
    setGastoMulti(g.id, { neto, iva, exento, monto: total });
  };
  // Al cambiar el tipo de doc a Factura, separa el monto existente en neto + IVA (19%).
  const setDocTipo = (g, nuevo) => {
    if (nuevo === "Factura" && Number(g.monto) > 0 && !(Number(g.neto) > 0)) {
      const neto = Math.round((Number(g.monto) || 0) / 1.19);
      setGastoMulti(g.id, { docTipo: nuevo, neto, iva: (Number(g.monto) || 0) - neto });
    } else {
      setGasto(g.id, "docTipo", nuevo);
    }
  };
  // Kilometraje: monto = km × valor fijo por km (CLP). El valor lo fija el administrador.
  const setGastoKm = (g, kmRaw) => {
    const km = kmRaw === "" ? "" : (Number(kmRaw) || 0);
    setGastoMulti(g.id, { km, monto: (Number(km) || 0) * (Number(valorKm) || 0) });
  };
  // Al elegir categoría: si es Kilometraje, fuerza CLP, sin documento, y recalcula el monto.
  const setCategoria = (g, cat) => {
    if (cat === "kilometraje") {
      const km = Number(g.km) || 0;
      setGastoMulti(g.id, { categoria: cat, moneda: "CLP", docTipo: "Sin documento", monto: km * (Number(valorKm) || 0) });
    } else {
      setGasto(g.id, "categoria", cat);
    }
  };
  const delGasto = async (g) => {
    const p = pathDesdeUrlStorage(g.adjuntoUrl);
    if (p) await eliminarArchivoFrisku(p);
    upsert({ ...rend, gastos: rend.gastos.filter(x => x.id !== g.id) });
  };

  const quitarAdjunto = async (g) => {
    const p = pathDesdeUrlStorage(g.adjuntoUrl);
    if (p) await eliminarArchivoFrisku(p);
    upsert({ ...rend, gastos: rend.gastos.map(x => x.id === g.id ? { ...x, adjuntoUrl: "", adjuntoNombre: "" } : x) });
  };

  const subirAdjunto = async (g, file) => {
    if (!file) return;
    setSubiendo(g.id);
    // Normaliza la foto (HEIC del iPhone → JPEG, reescala y baja peso).
    let f = file;
    try { f = await comprimirImagen(file); } catch (e) { f = file; }
    if (f.size > 10 * 1024 * 1024) {
      setSubiendo(null);
      alert("El archivo pesa más de 10 MB incluso optimizado. Toma la foto en menor resolución o sube un PDF más liviano.");
      return;
    }
    const ext = (f.name.split(".").pop() || "dat").toLowerCase();
    const path = `rendiciones/${rend.id}/${g.id}_${Date.now()}.${ext}`;
    const url = await uploadArchivoFrisku(f, path);
    setSubiendo(null);
    if (url) {
      // si había uno previo, borrarlo
      const prev = pathDesdeUrlStorage(g.adjuntoUrl);
      if (prev && prev !== path) await eliminarArchivoFrisku(prev);
      upsert({ ...rend, gastos: rend.gastos.map(x => x.id === g.id ? { ...x, adjuntoUrl: url, adjuntoNombre: f.name } : x) });
    } else {
      const detalle = uploadArchivoFrisku.lastError ? `\n\nDetalle: ${uploadArchivoFrisku.lastError}` : "";
      alert("No se pudo subir el archivo. Revisa tu conexión y reintenta." + detalle);
    }
  };

  const totales = totalesPorMoneda(rend.gastos);

  return (
    <Modal width={900} title={`Rendición #${rend.folio}`} onClose={onClose}>
      {/* Cabecera estado */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <EstadoBadge estado={rend.estado} devuelta={rend.devuelta} />
        <span style={{ fontSize: 12.5, color: C.muted }}>{rend.trabajador}{rend.cargo ? ` · ${rend.cargo}` : ""}</span>
        {rend.estado === "rechazada" && rend.comentarioRevisor && (
          <span style={{ fontSize: 12.5, color: C.danger, background: C.dangerBg, padding: "3px 10px", borderRadius: 7 }}>❌ {rend.comentarioRevisor}</span>
        )}
        {puedeDevolver && (
          <button onClick={() => {
            const motivo = window.prompt("Devolver al trabajador para corregir/incorporar un gasto.\n\nNota para el trabajador (opcional):", "Falta incorporar un gasto.");
            if (motivo === null) return;
            onDevolver?.(rend, motivo);
            onClose();
          }} style={{ marginLeft: "auto", background: C.warningBg, color: C.warning, border: `1px solid ${C.warning}`, borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 12.5, fontWeight: 800, whiteSpace: "nowrap" }}>
            ↩ Devolver para corrección
          </button>
        )}
      </div>

      {/* Rendir en nombre de otra persona (delegación: ej. secretaria por gerente) */}
      {puedeRendirPorOtros && editable && (
        <div style={{ marginBottom: 16, background: C.bg2, borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>RENDIR EN NOMBRE DE:</span>
          <select
            value={rend.trabajadorExtId ? `ext:${rend.trabajadorExtId}` : (rend.trabajadorEmail || "").toLowerCase()}
            onChange={e => {
              const val = e.target.value;
              if (val.startsWith("ext:")) {
                const p = (personasExternas || []).find(x => x.id === val.slice(4));
                if (p) upsert({ ...rend, trabajador: p.nombre, trabajadorEmail: p.email || "", cargo: p.cargo || "", trabajadorExtId: p.id, trabajadorNoUsuario: true });
              } else {
                const u = (usuarios || []).find(x => (x.email || "").toLowerCase() === val);
                if (u) upsert({ ...rend, trabajador: u.nombre || u.email, trabajadorEmail: u.email, cargo: u.cargo || u.rol || "", trabajadorExtId: null, trabajadorNoUsuario: false });
              }
            }}
            style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: C.card, color: C.text, minWidth: 220 }}
          >
            {/* Si el actual no está en ninguna lista, mostrarlo igual */}
            {rend.trabajadorExtId && !(personasExternas || []).some(p => p.id === rend.trabajadorExtId) && (
              <option value={`ext:${rend.trabajadorExtId}`}>{rend.trabajador || "—"} (externo)</option>
            )}
            {!rend.trabajadorExtId && !(usuarios || []).some(x => (x.email || "").toLowerCase() === (rend.trabajadorEmail || "").toLowerCase()) && (
              <option value={(rend.trabajadorEmail || "").toLowerCase()}>{rend.trabajador || "—"}</option>
            )}
            <optgroup label="Usuarios del sistema">
              {(usuarios || []).slice().sort((a, b) => (a.nombre || a.email || "").localeCompare(b.nombre || b.email || "")).map(u => (
                <option key={u.email} value={(u.email || "").toLowerCase()}>{u.nombre || u.email}{u.cargo ? ` · ${u.cargo}` : ""}</option>
              ))}
            </optgroup>
            {(personasExternas || []).length > 0 && (
              <optgroup label="Personas externas (no usuarios)">
                {(personasExternas || []).slice().sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "")).map(p => (
                  <option key={p.id} value={`ext:${p.id}`}>{p.nombre}{p.cargo ? ` · ${p.cargo}` : ""}</option>
                ))}
              </optgroup>
            )}
          </select>
          <button onClick={() => { setExtForm({ nombre: "", cargo: "", email: "" }); setModalExt(true); }}
            style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700, color: C.primary, whiteSpace: "nowrap" }}>
            ＋ Persona externa
          </button>
          <span style={{ fontSize: 11.5, color: C.muted2 }}>
            {rend.trabajadorNoUsuario ? "Persona externa: sin cadena propia, la aprueban los aprobadores/CFO generales." : "La rendición queda a nombre del seleccionado y sigue su cadena de aprobación."}
          </span>
        </div>
      )}

      {/* Modal: agregar persona externa (no usuario) */}
      {modalExt && (
        <div onClick={() => setModalExt(false)} style={{ position: "fixed", inset: 0, background: "rgba(16,24,40,0.55)", zIndex: 500, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 14, width: 440, maxWidth: "100%", minWidth: 0, padding: 20, boxShadow: "0 12px 48px #0004" }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Agregar persona externa</div>
            <div style={{ fontSize: 12, color: C.muted2, marginBottom: 14 }}>Personas que no tienen cuenta en el sistema (terreno, choferes, externos). Queda guardada para reutilizarla.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Field label="Nombre *">
                <input value={extForm.nombre} onChange={e => setExtForm(f => ({ ...f, nombre: e.target.value }))} style={inputStyle} placeholder="Ej: Juan Pérez" />
              </Field>
              <Field label="Cargo / rol">
                <input value={extForm.cargo} onChange={e => setExtForm(f => ({ ...f, cargo: e.target.value }))} style={inputStyle} placeholder="Ej: Chofer, Jornal, Externo" />
              </Field>
              <Field label="Email (opcional — para avisarle)">
                <input value={extForm.email} onChange={e => setExtForm(f => ({ ...f, email: e.target.value }))} style={inputStyle} placeholder="opcional" />
              </Field>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <Btn kind="ghost" onClick={() => setModalExt(false)}>Cancelar</Btn>
              <Btn kind="success" onClick={() => {
                const nombre = (extForm.nombre || "").trim();
                if (!nombre) { alert("El nombre es obligatorio."); return; }
                const nueva = { id: uid("ext"), nombre, cargo: (extForm.cargo || "").trim(), email: (extForm.email || "").trim().toLowerCase() };
                onGuardarPersonas?.([...(personasExternas || []), nueva]);
                upsert({ ...rend, trabajador: nueva.nombre, trabajadorEmail: nueva.email, cargo: nueva.cargo, trabajadorExtId: nueva.id, trabajadorNoUsuario: true });
                setModalExt(false);
              }}>Guardar y seleccionar</Btn>
            </div>
          </div>
        </div>
      )}

      {/* Modal: agregar categoría personalizada (solo admin) */}
      {modalCat && (
        <div onClick={() => setModalCat(false)} style={{ position: "fixed", inset: 0, background: "rgba(16,24,40,0.55)", zIndex: 500, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 14, width: 420, maxWidth: "100%", minWidth: 0, padding: 20, boxShadow: "0 12px 48px #0004" }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Agregar categoría</div>
            <div style={{ fontSize: 12, color: C.muted2, marginBottom: 14 }}>Queda disponible para todas las rendiciones (categoría del grupo).</div>
            <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 10 }}>
              <Field label="Ícono">
                <input value={catForm.ic} maxLength={4} onChange={e => setCatForm(f => ({ ...f, ic: e.target.value }))} style={{ ...inputStyle, textAlign: "center" }} placeholder="🏷️" />
              </Field>
              <Field label="Nombre *">
                <input value={catForm.l} onChange={e => setCatForm(f => ({ ...f, l: e.target.value }))} style={inputStyle} placeholder="Ej: Arriendo de maquinaria" />
              </Field>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <Btn kind="ghost" onClick={() => setModalCat(false)}>Cancelar</Btn>
              <Btn kind="success" onClick={() => {
                const l = (catForm.l || "").trim();
                if (!l) { alert("El nombre de la categoría es obligatorio."); return; }
                const nueva = { v: uid("cat"), l, ic: (catForm.ic || "").trim() || "🏷️" };
                onGuardarCategorias?.([...(categoriasExtra || []), nueva]);
                if (catGastoId) setGasto(catGastoId, "categoria", nueva.v);
                setModalCat(false);
              }}>Guardar y usar</Btn>
            </div>
          </div>
        </div>
      )}

      {/* Progreso de la cadena de aprobación (si tiene cadena multinivel) */}
      {Array.isArray(rend.cadena) && rend.cadena.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16, background: C.bg2, borderRadius: 10, padding: "10px 12px" }}>
          <span style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>CADENA:</span>
          {rend.cadena.map((p, i) => {
            const idx = rend.nivelActual || 0;
            const aprobada = rend.estado === "aprobada" || rend.estado === "pagada" || i < idx;
            const enCurso = (rend.estado === "enviada") && i === idx;
            const color = aprobada ? C.success : enCurso ? C.warning : C.muted2;
            const bg = aprobada ? C.successBg : enCurso ? C.warningBg : C.cardAlt;
            return (
              <span key={p.email + i} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                {i > 0 && <span style={{ color: C.muted2, fontSize: 12 }}>→</span>}
                <span style={{ fontSize: 11.5, fontWeight: 600, color, background: bg, borderRadius: 7, padding: "3px 9px" }}>
                  {aprobada ? "✓ " : enCurso ? "⏳ " : ""}{p.nombre}{i === 0 ? " (sup.)" : ""}
                </span>
              </span>
            );
          })}
        </div>
      )}

      {/* Datos generales (encabezado): trabajador (arriba) + empresa + fecha rendición */}
      <div style={{ display: "grid", gridTemplateColumns: esMovil ? "1fr" : "2fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
        <Field label="Título / Glosa">
          <input value={rend.titulo} disabled={!editable} onChange={e => setCampo("titulo", e.target.value)} style={inputStyle} placeholder="Ej: Viaje a terreno Curicó" />
        </Field>
        <Field label="Empresa">
          <select value={rend.empresa} disabled={!editable} onChange={e => setCampo("empresa", e.target.value)} style={inputStyle}>
            {EMPRESAS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </Field>
        <Field label="Fecha de rendición">
          <input type="date" value={rend.periodo} disabled={!editable} onChange={e => setCampo("periodo", e.target.value)} style={inputStyle} />
        </Field>
      </div>

      {/* Pago / conversión multimoneda */}
      <div style={{ display: "grid", gridTemplateColumns: esMovil ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 18, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
        <Field label="Moneda de pago">
          <select value={monedaPago} disabled={!editableTC} onChange={e => setCampo("monedaPago", e.target.value)} style={inputStyle}>
            {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Fecha de TC (para convertir)">
          <input type="date" value={fechaTC} disabled={!editableTC} onChange={e => setCampo("fechaTC", e.target.value)} style={inputStyle} />
        </Field>
      </div>

      {/* El tipo de cambio se ingresa por gasto (más abajo, en cada gasto en moneda extranjera). */}

      {/* Gastos */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>Gastos ({(rend.gastos || []).length})</div>
        {editable && <Btn small onClick={addGasto}>+ Agregar gasto</Btn>}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {(rend.gastos || []).map(g => (
          <div key={g.id} id={"gasto-" + g.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, background: C.rowAlt }}>
            <div style={{ display: "grid", gridTemplateColumns: esMovil ? "1fr 1fr" : "120px 150px 1fr 110px 90px 36px", gap: 8, alignItems: "end" }}>
              <Field label="Fecha">
                <input type="date" value={g.fecha} disabled={!editable} onChange={e => setGasto(g.id, "fecha", e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Categoría">
                <select value={g.categoria} disabled={!editable}
                  onChange={e => {
                    if (e.target.value === "__add__") { setCatGastoId(g.id); setCatForm({ ic: "", l: "" }); setModalCat(true); return; }
                    setCategoria(g, e.target.value);
                  }} style={inputStyle}>
                  {CATS.map(c => <option key={c.v} value={c.v}>{c.ic} {c.l}</option>)}
                  {admin && <option value="__add__">➕ Agregar categoría…</option>}
                </select>
              </Field>
              <Field label="Glosa / Detalle" style={esMovil ? { gridColumn: "1 / -1" } : undefined}>
                <input value={g.glosa} disabled={!editable} onChange={e => setGasto(g.id, "glosa", e.target.value)} style={inputStyle} placeholder="Descripción del gasto" />
              </Field>
              <Field label={(g.docTipo === "Factura" || g.categoria === "kilometraje") ? "Total" : "Monto"}>
                <input type="number" value={g.monto} disabled={!editable || g.docTipo === "Factura" || g.categoria === "kilometraje"}
                  onChange={e => setGasto(g.id, "monto", e.target.value)}
                  style={{ ...inputStyle, textAlign: "right", ...((g.docTipo === "Factura" || g.categoria === "kilometraje") ? { background: C.cardAlt, fontWeight: 700 } : {}) }}
                  placeholder="0" title={g.categoria === "kilometraje" ? "Total = Km × valor por km" : g.docTipo === "Factura" ? "Total = Neto + IVA (se calcula abajo)" : undefined} />
              </Field>
              <Field label="Moneda">
                <select value={g.moneda} disabled={!editable || g.categoria === "kilometraje"} onChange={e => setGasto(g.id, "moneda", e.target.value)} style={inputStyle}>
                  {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              {editable
                ? <button onClick={() => delGasto(g)} title="Eliminar gasto" style={{ height: 34, border: `1px solid ${C.danger}`, background: C.card, color: C.danger, borderRadius: 8, cursor: "pointer", fontWeight: 700, gridColumn: esMovil ? "1 / -1" : undefined }}>{esMovil ? "× Eliminar gasto" : "×"}</button>
                : <span />}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: esMovil ? "1fr" : "150px 1fr auto", gap: 8, alignItems: "end", marginTop: 8 }}>
              <Field label="Tipo doc">
                <select value={g.docTipo} disabled={!editable} onChange={e => setDocTipo(g, e.target.value)} style={inputStyle}>
                  {TIPOS_DOC.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="N° documento">
                <input value={g.docNumero} disabled={!editable} onChange={e => setGasto(g.id, "docNumero", e.target.value)} style={inputStyle} placeholder="Folio / N°" />
              </Field>
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 2 }}>
                {g.categoria === "kilometraje" ? (
                  <span style={{ fontSize: 12, color: C.muted2 }}>🚗 Calculado por km · no requiere respaldo</span>
                ) : g.adjuntoUrl ? (
                  <>
                    <a href={g.adjuntoUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: C.primary, fontWeight: 700, textDecoration: "none", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📎 {g.adjuntoNombre || "Ver respaldo"}</a>
                    {editable && <button onClick={() => quitarAdjunto(g)} title="Quitar" style={{ border: "none", background: "none", color: C.danger, cursor: "pointer", fontSize: 16 }}>×</button>}
                  </>
                ) : editable ? (
                  <label title="Obligatorio: cada gasto debe llevar su respaldo" style={{ fontSize: 12.5, color: C.danger, fontWeight: 700, cursor: "pointer", border: `1px dashed ${C.danger}`, background: C.dangerBg, padding: "6px 12px", borderRadius: 8 }}>
                    {subiendo === g.id ? "Subiendo…" : "📎 Adjuntar respaldo *"}
                    <input type="file" accept="image/*,application/pdf" style={{ display: "none" }} disabled={subiendo === g.id}
                      onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; subirAdjunto(g, f); }} />
                  </label>
                ) : <span style={{ fontSize: 12, color: C.danger }}>⚠ Sin respaldo</span>}
              </div>
            </div>
            {/* Desglose de factura: Neto + IVA + Exento + Total */}
            {g.docTipo === "Factura" && (
              <div style={{ display: "grid", gridTemplateColumns: esMovil ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 8, marginTop: 8, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", alignItems: "end" }}>
                <Field label="Neto (afecto)">
                  <input type="number" value={g.neto ?? ""} disabled={!editable} onChange={e => setGastoFactura(g, "neto", e.target.value)} style={{ ...inputStyle, textAlign: "right" }} placeholder="0" />
                </Field>
                <Field label={Number(g.neto) > 0 ? `IVA (${Math.round((Number(g.iva) || 0) / Number(g.neto) * 100)}%)` : "IVA (19%)"}>
                  <input type="number" value={g.iva ?? ""} disabled={!editable} onChange={e => setGastoFactura(g, "iva", e.target.value)} style={{ ...inputStyle, textAlign: "right" }} placeholder="0" />
                </Field>
                <Field label="Exento">
                  <input type="number" value={g.exento ?? ""} disabled={!editable} onChange={e => setGastoFactura(g, "exento", e.target.value)} style={{ ...inputStyle, textAlign: "right" }} placeholder="0" />
                </Field>
                <Field label="Total">
                  <input type="number" value={g.monto ?? ""} readOnly disabled style={{ ...inputStyle, textAlign: "right", background: C.cardAlt, fontWeight: 700 }} />
                </Field>
              </div>
            )}
            {/* Desglose de kilometraje: Km × valor por km (fijo, admin) = Total */}
            {g.categoria === "kilometraje" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 8, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", alignItems: "end" }}>
                <Field label="Km recorridos">
                  <input type="number" value={g.km ?? ""} disabled={!editable} onChange={e => setGastoKm(g, e.target.value)} style={{ ...inputStyle, textAlign: "right" }} placeholder="0" />
                </Field>
                <Field label="Valor por km">
                  <input type="text" value={fmtMonto(valorKm, "CLP")} readOnly disabled style={{ ...inputStyle, textAlign: "right", background: C.cardAlt }} title="Valor fijo definido por el administrador" />
                </Field>
                <Field label="Total (CLP)">
                  <input type="text" value={fmtMonto(Number(g.monto) || 0, "CLP")} readOnly disabled style={{ ...inputStyle, textAlign: "right", background: C.cardAlt, fontWeight: 700 }} />
                </Field>
                {!(Number(valorKm) > 0) && (
                  <div style={{ gridColumn: "1 / -1", fontSize: 11, color: C.danger }}>⚠ El administrador aún no define el valor por km (queda en $0). Pídeselo para que el cálculo funcione.</div>
                )}
              </div>
            )}
            {/* Tipo de cambio de ESTE gasto (cuando está en otra moneda que la de pago) */}
            {(g.moneda || "CLP") !== monedaPago && g.categoria !== "kilometraje" && (() => {
              const autoRate = (rend.tcManual && Number(rend.tcManual[g.moneda]) > 0)
                ? Number(rend.tcManual[g.moneda])
                : buscarTC(g.moneda || "CLP", monedaPago, fechaTC, tcData);
              const usaPropio = Number(g.tc) > 0;
              const r = convertir(g.monto, g.moneda || "CLP", monedaPago, fechaTC, tcData, rend.tcManual, g.tc);
              return (
                <div style={{ marginTop: 8, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6 }}>🔁 Conversión a {monedaPago}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700 }}>1 {g.moneda || "CLP"} =</span>
                    <input type="number" step="any" disabled={!editableTC} value={g.tc ?? ""}
                      placeholder={autoRate != null ? autoRate.toLocaleString("es-CL", { maximumFractionDigits: 6 }) : "ingresa el TC"}
                      onChange={e => setGasto(g.id, "tc", e.target.value)}
                      style={{ ...inputStyle, width: 140, textAlign: "right" }} />
                    <span style={{ fontSize: 12.5, fontWeight: 700 }}>{monedaPago}</span>
                    {Number(g.monto) > 0 && r.ok && (
                      <>
                        <span style={{ fontSize: 12.5, color: C.muted2 }}>→</span>
                        <span style={{ fontWeight: 800, color: C.accent2 }}>{fmtMonto(r.val, monedaPago)}</span>
                      </>
                    )}
                  </div>
                  <div style={{ fontSize: 10.5, color: usaPropio ? C.accent2 : C.muted2, marginTop: 5 }}>
                    {usaPropio
                      ? "✓ Usando el tipo de cambio que ingresaste para este gasto."
                      : autoRate != null
                        ? "Vacío = usa el TC de la app. Escribe un valor para fijar el tuyo."
                        : "⚠ La app no tiene TC para esta moneda: ingrésalo aquí para convertir."}
                  </div>
                </div>
              );
            })()}
          </div>
        ))}
        {!(rend.gastos || []).length && (
          <div style={{ textAlign: "center", padding: 24, color: C.muted2, border: `1px dashed ${C.border}`, borderRadius: 10 }}>
            Sin gastos. {editable ? "Agrega el primero." : ""}
          </div>
        )}
      </div>

      {/* Agregar gasto — también al final, para no tener que volver arriba (clave en móvil) */}
      {editable && (rend.gastos || []).length > 0 && (
        <button onClick={addGasto}
          style={{ width: "100%", marginTop: 10, padding: "12px", borderRadius: 10, border: `1.5px dashed ${C.primary}`, background: C.card, color: C.primary, fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
          + Agregar otro gasto
        </button>
      )}

      {/* Total */}
      {(() => {
        const conv = totalConvertido(rend.gastos, monedaPago, fechaTC, tcData, rend.tcManual);
        const variasMonedas = Object.keys(totales).filter(k => totales[k]).length > 1 || (Object.keys(totales)[0] && Object.keys(totales)[0] !== monedaPago);
        return (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <span style={{ fontSize: 12.5, color: C.muted }}>Por moneda: <b>{fmtTotales(totales)}</b></span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, color: C.muted, fontWeight: 700 }}>TOTAL A PAGAR ({monedaPago}):</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: C.primary }}>{fmtMonto(conv.total, monedaPago)}</span>
              </div>
            </div>
            {conv.faltan.length > 0 && (
              <div style={{ fontSize: 11.5, color: C.danger, marginTop: 8, textAlign: "right" }}>
                ⚠ Total parcial: faltan TC ({conv.faltan.join(", ")}). El monto excluye los gastos sin tipo de cambio.
              </div>
            )}
          </div>
        );
      })()}

      {/* Historial */}
      {(rend.historial || []).length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: "pointer", fontSize: 12.5, color: C.muted, fontWeight: 700 }}>Historial ({rend.historial.length})</summary>
          <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
            {rend.historial.map((h, i) => (
              <div key={i} style={{ fontSize: 12, color: C.muted, display: "flex", gap: 8 }}>
                <span style={{ color: C.muted2, minWidth: 130 }}>{fmtFecha(h.fecha)}</span>
                <span style={{ fontWeight: 700 }}>{h.accion}</span>
                <span>· {h.usuario}</span>
                {h.comentario && <span style={{ fontStyle: "italic" }}>— {h.comentario}</span>}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Acciones */}
      <div style={{ display: "flex", flexDirection: esMovil ? "column" : "row", justifyContent: "space-between", gap: 8, marginTop: 20 }}>
        <div>
          {((esDueno && (rend.estado === "borrador" || rend.estado === "rechazada")) || admin) && (
            <Btn kind="ghost" style={{ color: C.danger, borderColor: C.danger }} onClick={() => onEliminar(rend)}>
              {admin && rend.estado !== "borrador" && rend.estado !== "rechazada" ? "Eliminar (admin)" : "Eliminar"}
            </Btn>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn kind="ghost" onClick={descargarExcel} disabled={exportando === "excel" || !(rend.gastos || []).length}>
            {exportando === "excel" ? "Generando…" : "⬇ Excel"}
          </Btn>
          <Btn kind="ghost" onClick={descargarPDF} disabled={exportando === "pdf" || !(rend.gastos || []).length}>
            {exportando === "pdf" ? "Generando…" : "🖨 PDF + respaldos"}
          </Btn>
          <Btn kind="ghost" onClick={onClose}>Cerrar</Btn>
          {editable && <Btn kind="success" onClick={() => onEnviar(rend)}>📤 Enviar a aprobación</Btn>}
        </div>
      </div>
    </Modal>
  );
}
