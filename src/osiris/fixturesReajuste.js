/* eslint-disable */
// Datos y reglas compartidos por las pruebas del reajuste.
//
// Existe para que la comparación entre el candidato y la versión de
// recuperación use EXACTAMENTE los mismos datos y las mismas reglas: el
// archivo es idéntico en las dos ramas, así que una diferencia de importes
// solo puede venir del código, nunca del caso de prueba.
//
// Todas las fechas son sintéticas.

import { derivarRoyaltyComercialDesdeContratos } from "../OsirisModule";

export const DATOS_ACTIVACION = {
  fechaReferencia: "2026-07-01",
  respaldo: "Comprobante sintetico de primer pago 001",
  reglaFecha: "inicioPeriodoServicio",
  reglaFechaRespaldo: "Clausula sintetica 1.2.6",
  usuario: "prueba",
  fecha: "2026-10-05",
};

// Forma ya activada, para los casos que no pasan por la acción `activar`.
export const ACTIVACION = Object.assign({ activado: true }, DATOS_ACTIVACION, {
  sello: { pct: 2, fechaReferencia: "2026-07-01", reglaFecha: "inicioPeriodoServicio" },
});

export const CONTRATO = (extra) => Object.assign({
  id: "ct_sint", razonSocial: "Sintetica SA", pais: "Chile",   // Chile: retención 0
  modeloIngresos: "oc", valorRoyaltyComercial: 3000, rcMesCobro: "Abril",
  fechaTermino: "2031-06-30",
  rcCohortes: [{ id: "c1", ha: 41.97, desde: "2026/2027" }],
  reajuste: { tipo: "porcentaje", pct: 2, desde: "2026-07-01", referencia: "Clausula sintetica 1.2.5", confirmado: true },
}, extra || {});

export const filas = (ct) => derivarRoyaltyComercialDesdeContratos([ct], { ct_sint: [] });
export const porTemp = (fs) => fs.reduce((m, f) => (m[f.temporada] = f, m), {});
export const r2 = (n) => Math.round(n * 100) / 100;

// Base sin reajuste: 41,97 ha × US$3.000 en las cinco temporadas.
export const TABLA_BASE = {
  "2026/2027": 125910, "2027/2028": 125910, "2028/2029": 125910,
  "2029/2030": 125910, "2030/2031": 125910,
};

// Con el reajuste activado al 2 %, anclado el 2026-07-01 por inicio del
// período del servicio.
//
// CORRECCIÓN: la temporada 2028/2029 es **130.996,76**. Un reporte anterior
// dijo 131.000,96, que era una estimación hecha a mano y estaba mal. El valor
// correcto es el que mide el motor, por el redondeo que hace por cohorte.
export const TABLA_CANDIDATO = {
  "2026/2027": 125910, "2027/2028": 128428.2, "2028/2029": 130996.76,
  "2029/2030": 133616.7, "2030/2031": 136289.03,
};

export const TOTAL_BASE = 629550;
export const TOTAL_CANDIDATO = 655240.69;
export const DIFERENCIA = 25690.69;

// Edición hecha con la versión de recuperación: cohorte nueva + respaldo
// corregido. Sirve para la prueba de ida y vuelta.
export const EDITADO = () => CONTRATO({
  reajusteActivacion: Object.assign({}, ACTIVACION, { respaldo: "Respaldo corregido 002" }),
  rcCohortes: [
    { id: "c1", ha: 41.97, desde: "2026/2027" },
    { id: "c2", ha: 10, desde: "2028/2029" },
  ],
});

export const TABLA_EDITADO = {
  "2026/2027": 125910, "2027/2028": 128428.2, "2028/2029": 162208.76,
  "2029/2030": 165452.94, "2030/2031": 168762,
};
