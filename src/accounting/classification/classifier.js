/* eslint-disable */
// src/accounting/classification/classifier.js
// Clasifica códigos contables en secciones IFRS (ESF) y grupos (ER).
//
// Sistemas soportados: Contec (puntos) y Megasystem (7+ dígitos sin puntos).
// Los KNOWN_BUG de Megasystem (27xxx, 3xxxx) se preservan intencionalmente
// para no alterar el comportamiento actual. Se corregirán en Fase 3 al
// implementar AccountingProfile por sistema contable.
//
// USO: Únicamente a través de src/accounting/index.js (API pública).

import { CAT_GRUPO } from './categories';

/**
 * Extrae los segmentos significativos de un código contable.
 *
 * Funciona para:
 *   Contec (con puntos):     "1.01.01.001" → primerNivel='1',  segundoNivel='01'
 *   Megasystem (sin puntos): "1101003"     → primerNivel='1',  segundoNivel='1'
 *   Numérico:                 1101003       → se convierte a string antes de procesar
 *   null / undefined / ''   → primerNivel=null, segundoNivel=null
 *
 * soloDigitos elimina caracteres no numéricos para extraer primer/segundo dígito
 * de forma segura independientemente del formato.
 */
export function obtenerSegmentosCodigo(codigo) {
  const normalizado = String(codigo ?? '').trim();
  if (!normalizado) {
    return { codigoNormalizado: '', primerNivel: null, segundoNivel: null };
  }
  const soloDigitos = normalizado.replace(/\D/g, '');
  return {
    codigoNormalizado: normalizado,
    primerNivel:  soloDigitos[0] ?? null,
    segundoNivel: soloDigitos[1] ?? null,
  };
}

/**
 * Clasifica un código contable en su sección del ESF (Balance General).
 *
 * Contec (códigos con punto):
 *   "1.01.xxx" → Activo Corriente
 *   "1.02.xxx" → Activo No Corriente
 *   "2.01.xxx" → Pasivo Corriente
 *   "2.02.xxx" → Pasivo No Corriente
 *   "3.xx.xxx" → Patrimonio
 *   4-9        → null
 *
 * Megasystem (códigos sin punto, 7+ dígitos):
 *   "11xxxxx"  → Activo Corriente
 *   "12xxxxx"  → Activo No Corriente
 *   "21xxxxx"  → Pasivo Corriente
 *   "22xxxxx"  → Pasivo No Corriente
 *   "3xxxxxx"  → Patrimonio   [KNOWN_BUG: 3xxxx son ingresos en Megasystem — corregir en Fase 3]
 *   "27xxxxx"  → Pasivo No Corriente  [KNOWN_BUG: debería ser Patrimonio — corregir en Fase 3]
 *
 * Nunca asigna silenciosamente a una sección incorrecta.
 * Retorna null para códigos desconocidos o cuentas de resultado.
 *
 * @returns {'Activo Corriente'|'Activo No Corriente'|'Pasivo Corriente'|'Pasivo No Corriente'|'Patrimonio'|null}
 */
export function clasificarSeccionEsf(codigo) {
  const { codigoNormalizado, primerNivel, segundoNivel } = obtenerSegmentosCodigo(codigo);
  if (!primerNivel) return null;

  if (codigoNormalizado.includes('.')) {
    // Contec: segmentos delimitados por punto
    const partes = codigoNormalizado.split('.');
    const seg1 = partes[0];
    const seg2 = partes[1] ?? '';
    if (seg1 === '1') return seg2 === '01' ? 'Activo Corriente' : 'Activo No Corriente';
    if (seg1 === '2') return seg2 === '01' ? 'Pasivo Corriente' : 'Pasivo No Corriente';
    if (seg1 === '3') return 'Patrimonio';
    return null; // 4-9 = cuentas de resultado
  }

  // Megasystem (sin puntos): primer y segundo dígito del código
  if (primerNivel === '1') return segundoNivel === '1' ? 'Activo Corriente' : 'Activo No Corriente';
  if (primerNivel === '2') return segundoNivel === '1' ? 'Pasivo Corriente' : 'Pasivo No Corriente';
  if (primerNivel === '3') return 'Patrimonio'; // KNOWN_BUG: 3xxxx Megasystem = ingresos
  return null;
}

/**
 * Clasifica un código contable en su grupo del ER (Estado de Resultados).
 *
 * Usado como FALLBACK cuando grupo_er en DB viene null o vacío.
 * En condiciones normales, grupo_er ya viene del parser al importar el Excel.
 *
 * Contec (también válido para prefijo numérico Megasystem donde aplique):
 *   4 → Ingreso Operacional
 *   5 → Costo Operacional
 *   6 → Gasto Operacional
 *   7 → Ingreso No Operacional
 *   8 → Gasto No Operacional
 *   9 → Impuesto
 *
 * @returns {'Ingreso Operacional'|'Costo Operacional'|'Gasto Operacional'|'Ingreso No Operacional'|'Gasto No Operacional'|'Impuesto'|null}
 */
export function clasificarGrupoEr(codigo) {
  const { primerNivel } = obtenerSegmentosCodigo(codigo);
  switch (primerNivel) {
    case '4': return 'Ingreso Operacional';
    case '5': return 'Costo Operacional';
    case '6': return 'Gasto Operacional';
    case '7': return 'Ingreso No Operacional';
    case '8': return 'Gasto No Operacional';
    case '9': return 'Impuesto';
    default:  return null; // nunca clasificar silenciosamente un código desconocido
  }
}

/**
 * Resuelve una categoría IFRS al grupo de sección que le corresponde.
 * Retorna null si la categoría no está en el catálogo.
 *
 * @param {string|null|undefined} categoriaIFRS
 * @returns {string|null}
 */
export function resolverClasificacion(categoriaIFRS) {
  if (!categoriaIFRS) return null;
  return CAT_GRUPO[categoriaIFRS] ?? null;
}
