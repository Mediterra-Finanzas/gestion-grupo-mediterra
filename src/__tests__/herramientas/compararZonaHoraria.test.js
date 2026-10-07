/* eslint-disable */
// ─────────────────────────────────────────────────────────────────────────
// COMPARACIÓN DE ZONA HORARIA — cuotas de créditos (herramienta, solo lectura)
//
// Compara, para cada cuota, el mes y la semana que asignaba la versión ANTERIOR
// (new Date("AAAA-MM-DD") = UTC, leída con la hora del navegador) contra la
// versión corregida (fechaLocal). Debe correrse con la hora de Chile:
//
//   npm run comparar:tz                                    → datos FICTICIOS (CREDITOS_DEFAULT)
//   COMPARAR_TZ_ARCHIVO=/ruta/respaldo.json npm run comparar:tz   → copia autorizada
//
// El archivo puede ser el JSON de "💾 Respaldo" (v1/v2, saneado o no), la fila
// `finanzas` o un arreglo de créditos. NO se conecta a Supabase ni escribe nada
// fuera de COMPARAR_TZ_SALIDA (por defecto, la carpeta temporal del sistema).
// ─────────────────────────────────────────────────────────────────────────
import fs from "fs";
import os from "os";
import path from "path";
import { cuotasPrestamosEmpresa, CREDITOS_DEFAULT, SEMANAS_MES } from "../../FinanzasModule.jsx";
import { calcularAmortizacionSocio } from "../../creditoSocio.js";

const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// ── Versión ANTERIOR (copia literal de la lógica de fechas previa a ee5eeb0) ──
const semAnt = (d) => { const date = new Date(d); const jan1 = new Date(date.getFullYear(), 0, 1); return `S${String(Math.ceil(((date - jan1) / 86400000 + jan1.getDay() + 1) / 7)).padStart(2, "0")}`; };
const mesAnt = (d) => { const date = new Date(d); return `${MN[date.getMonth()]}-${String(date.getFullYear()).slice(2)}`; };
const semEnMesAnt = (f, mes) => { const s = semAnt(f), l = SEMANAS_MES[mes] || []; return l.includes(s) ? s : (l[l.length - 1] || s); };
function cuotasAnteriores(empresa, creditos) {
  const out = [];
  creditos.filter(c => c.empresa === empresa && !c.pagado).forEach(c => {
    const ag = (f, monto) => { const mes = mesAnt(f); if (!mes.includes("NaN")) out.push({ c, fecha: typeof f === "string" ? f : null, mes, sem: semEnMesAnt(f, mes), monto }); };
    if (c.tipo_credito === "socio") { calcularAmortizacionSocio(c.monto, c.tasa_efectiva_anual, c.fecha_desembolso, c.cuotas_socio).filas.forEach(f => { if (f.cuota_total > 0) ag(f.fecha, f.cuota_total); }); return; }
    if (!c.f_venc || !c.cuota) return; const cuota = Number(c.cuota) || 0; if (!cuota) return;
    if (c.tipo_cr === "Cuotas Mensuales" && c.f_inicio) {
      const ini = new Date(c.f_inicio), fin = new Date(c.f_venc); if (isNaN(ini) || isNaN(fin)) return;
      let f = new Date(ini); f.setMonth(f.getMonth() + 1);
      while (f <= fin) { ag(new Date(f), cuota); f.setMonth(f.getMonth() + 1); }
    } else ag(c.f_venc, cuota);
  });
  return out;
}

// mes que asigna la versión corregida a la misma fecha (para alinear cuotas en el borde del horizonte)
const mesNuevoDe = (q) => { const m = typeof q.fecha === "string" && q.fecha.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${MN[+m[2] - 1]}-${m[1].slice(2)}` : q.mes; };

function leerCreditos(archivo) {
  const j = JSON.parse(fs.readFileSync(archivo, "utf8"));
  const val = (x) => (typeof x === "string" ? JSON.parse(x) : x);
  if (Array.isArray(j)) return j;
  if (Array.isArray(j.creditos_data)) return j.creditos_data;
  const fin = j.tablas?.finanzas ? val(j.tablas.finanzas.data ?? j.tablas.finanzas.value) : null;
  if (fin && Array.isArray(fin.creditos_data)) return fin.creditos_data;
  throw new Error("No encontré creditos_data en el archivo");
}

const ARCHIVO = process.env.COMPARAR_TZ_ARCHIVO;
const SALIDA = process.env.COMPARAR_TZ_SALIDA || path.join(os.tmpdir(), "comparacion-zona-horaria");

// Solo corre cuando se invoca con `npm run comparar:tz` (no en la suite normal).
const correr = process.env.COMPARAR_TZ_EJECUTAR === "1" ? test : test.skip;
correr(`comparación zona horaria (${ARCHIVO ? "copia autorizada" : "datos FICTICIOS"})`, () => {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const creditos = ARCHIVO ? leerCreditos(ARCHIVO) : CREDITOS_DEFAULT;
  const empresas = [...new Set(creditos.map(c => c.empresa).filter(Boolean))];
  const porMes = {}, porSem = {}, cambios = [];
  const suma = (o, k, v) => { o[k] = (o[k] || 0) + v; };
  empresas.forEach(e => {
    const ant = cuotasAnteriores(e, creditos).filter(q => SEMANAS_MES[q.mes] || SEMANAS_MES[mesNuevoDe(q)]);
    const nue = cuotasPrestamosEmpresa(e, creditos);
    // solo meses del horizonte, igual que cuotasPrestamosEmpresa (fuera del horizonte no hay columna)
    ant.forEach(q => { if (SEMANAS_MES[q.mes]) { suma(porMes, `${e}|${q.mes}`, -q.monto); suma(porSem, `${e}|${q.mes}|${q.sem}`, -q.monto); } });
    nue.forEach(q => { suma(porMes, `${e}|${q.mes}`, q.monto); suma(porSem, `${e}|${q.mes}|${q.sem}`, q.monto); });
    // detalle por cuota (mismo orden de generación en ambas versiones)
    const n = Math.min(ant.length, nue.length);
    for (let i = 0; i < n; i++) if (ant[i].mes !== nue[i].mes || ant[i].sem !== nue[i].sem)
      cambios.push({ empresa: e, acreedor: ant[i].c.acreedor, n: ant[i].c.n ?? null, tipo: ant[i].c.tipo_credito === "socio" ? "socio" : ant[i].c.tipo_cr,
        fecha: ant[i].fecha ?? null, monto: nue[i].monto, mesAntes: ant[i].mes, mesDespues: nue[i].mes, semanaAntes: ant[i].sem, semanaDespues: nue[i].sem });
  });
  const limpio = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => Math.abs(v) > 0.005));
  const r = { origen: ARCHIVO ? "copia autorizada (" + path.basename(ARCHIVO) + ")" : "FICTICIO: CREDITOS_DEFAULT del repositorio",
    zonaHoraria: tz, generado: new Date().toISOString(), creditos: creditos.length,
    cuotasConCambioDeMes: cambios.filter(c => c.mesAntes !== c.mesDespues).length,
    cuotasConCambioSoloDeSemana: cambios.filter(c => c.mesAntes === c.mesDespues).length,
    cambios, deltaPorEmpresaMes: limpio(porMes), deltaPorEmpresaSemana: limpio(porSem) };
  fs.mkdirSync(SALIDA, { recursive: true });
  fs.writeFileSync(path.join(SALIDA, "comparacion-zona-horaria.json"), JSON.stringify(r, null, 2));
  const csv = ["empresa;acreedor;n;tipo;fecha;monto;mes_antes;mes_despues;semana_antes;semana_despues"]
    .concat(cambios.map(c => [c.empresa, c.acreedor, c.n, c.tipo, c.fecha, c.monto, c.mesAntes, c.mesDespues, c.semanaAntes, c.semanaDespues].join(";"))).join("\n");
  fs.writeFileSync(path.join(SALIDA, "comparacion-zona-horaria.csv"), csv);
  console.log(`[zona horaria ${tz}] ${r.origen}: ${r.cuotasConCambioDeMes} cuotas cambian de mes, ${r.cuotasConCambioSoloDeSemana} solo de semana → ${SALIDA}`);
  if (tz !== "America/Santiago") console.warn("Ojo: corre con TZ=America/Santiago (npm run comparar:tz); en UTC no hay diferencias que medir.");
  // Cuadre: el total de cada empresa no cambia; solo se mueve entre meses o semanas
  const totEmp = {}; Object.entries(r.deltaPorEmpresaMes).forEach(([k, v]) => suma(totEmp, k.split("|")[0], v));
  Object.values(totEmp).forEach(v => expect(Math.abs(v)).toBeLessThan(0.01));
});
