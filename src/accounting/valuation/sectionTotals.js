/* eslint-disable */
// src/accounting/valuation/sectionTotals.js
// Agregación de saldos y movimientos por sección ESF y bloque ER.
//
// USO: Únicamente a través de src/accounting/index.js (API pública).

import { clasificarSeccionEsf } from '../classification/classifier';

/**
 * Suma saldo_neto de los saldos ESF cuya categoría IFRS pertenezca
 * a alguna de las secciones indicadas.
 *
 * Usa categoria_ifrs del registro si está disponible; cae en clasificarSeccionEsf(codigo)
 * como fallback cuando el campo viene null.
 *
 * @param {Array<{ saldo_neto?: number, categoria_ifrs?: string, codigo?: string }>} saldos
 * @param {string[]} categorias — secciones a incluir (e.g. ['Activo Corriente'])
 * @returns {number}
 */
export function sumaEsf(saldos, categorias) {
  const set = new Set(categorias);
  return saldos
    .filter(c => set.has(c.categoria_ifrs || clasificarSeccionEsf(c.codigo)))
    .reduce((acc, c) => acc + (c.saldo_neto || 0), 0);
}

/**
 * Suma un campo numérico de los movimientos ER cuyo grupo_er pertenezca
 * a alguno de los grupos indicados.
 *
 * @param {Array<{ grupo_er?: string, [campo: string]: any }>} movimientos
 * @param {string[]} gruposEr — bloques a incluir (e.g. ['Ingreso Operacional'])
 * @param {string} campo — campo a sumar (default 'real_ytd')
 * @returns {number}
 */
export function sumaEr(movimientos, gruposEr, campo = 'real_ytd') {
  const set = new Set(gruposEr);
  return movimientos
    .filter(c => set.has(c.grupo_er))
    .reduce((acc, c) => acc + (c[campo] || 0), 0);
}
