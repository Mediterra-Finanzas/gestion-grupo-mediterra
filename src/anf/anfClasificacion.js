/* eslint-disable */
// src/anf/anfClasificacion.js
// Única fuente de verdad para clasificar cuentas contables por sección ESF y grupo ER.
// Usada por: AnfTab.jsx, anfKpis.js.
// Los parsers (anfParser.js) tienen sus propias versiones internas para el momento de lectura
// del Excel; esta utilidad se usa para la presentación y el control de gestión.

/**
 * Extrae los segmentos significativos de un código contable.
 *
 * Funciona para:
 *   - Contec (con puntos):     "1.01.01.001" → primerNivel='1',  segundoNivel='01'
 *   - Megasystem (sin puntos): "1101003"     → primerNivel='1',  segundoNivel='1'
 *   - Numérico:                 1101003       → se convierte a string antes de procesar
 *   - null / undefined / ''   → primerNivel=null, segundoNivel=null
 *
 * El campo `soloDigitos` elimina cualquier carácter no numérico del código normalizado
 * para extraer el primer y segundo dígito de forma segura independientemente del formato.
 *
 * @param {string|number|null|undefined} codigo
 * @returns {{ codigoNormalizado: string, primerNivel: string|null, segundoNivel: string|null }}
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
 * Sistemas soportados:
 *   Contec (códigos con punto):
 *     "1.01.xxx" → Activo Corriente
 *     "1.02.xxx" → Activo No Corriente
 *     "2.01.xxx" → Pasivo Corriente
 *     "2.02.xxx" → Pasivo No Corriente
 *     "3.xx.xxx" → Patrimonio
 *     4-9        → null (cuentas de resultado, no pertenecen al ESF)
 *
 *   Megasystem (códigos sin punto, 7+ dígitos):
 *     "11xxxxx"  → Activo Corriente      (11=activo corto plazo)
 *     "12xxxxx"  → Activo No Corriente   (12=activo largo plazo)
 *     "21xxxxx"  → Pasivo Corriente      (21=pasivo corto plazo)
 *     "22xxxxx"  → Pasivo No Corriente   (22=pasivo largo plazo)
 *     "3xxxxxx"  → Patrimonio
 *     3-8        → null (cuentas de resultado)
 *
 * Nunca asigna silenciosamente a una sección incorrecta.
 * Retorna null para códigos desconocidos o cuentas de resultado.
 *
 * @param {string|number|null|undefined} codigo
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
  if (primerNivel === '3') return 'Patrimonio';
  return null; // 4-9 en Megasystem = cuentas de resultado
}

/**
 * Clasifica un código contable en su grupo del ER (Estado de Resultados).
 *
 * Usada como FALLBACK en la UI cuando el campo grupo_er de la DB viene null o vacío.
 * En condiciones normales, grupo_er ya viene clasificado desde el parser al momento de
 * la carga del Excel (anfParser.js → buildMovimientosEr), y debe preferirse siempre.
 *
 * Convención Contec (también válida para el prefijo numérico Megasystem):
 *   4 → Ingreso Operacional
 *   5 → Costo Operacional
 *   6 → Gasto Operacional
 *   7 → Ingreso No Operacional
 *   8 → Gasto No Operacional
 *   9 → Impuesto
 *
 * Para Megasystem (3=Ingresos, 4=Gastos en su propio plan), el parser ya resolvió la
 * clasificación usando NombreGrupo del Excel y la guardó en grupo_er. Si llega aquí un
 * código Megasystem con grupo_er=null, se devuelve null (no se clasifica silenciosamente).
 *
 * @param {string|number|null|undefined} codigo
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
