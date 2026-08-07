/* eslint-disable */
// src/accounting/valuation/accountValue.js
// Cálculo del valor neto de una cuenta contable.
//
// Convención de signos de valorSit (usada en EEFFModule):
//   Activo:     ia − ip  → positivo cuando la cuenta tiene saldo deudor normal (ia > ip)
//   Pasivo:     ip − ia  → positivo cuando la cuenta tiene saldo acreedor normal (ip > ia)
//   Patrimonio: ip − ia  → positivo cuando el patrimonio es positivo (ip > ia)
//
// IMPORTANTE: Esta convención (+/+/+ en equilibrio) es DISTINTA de saldo_neto en AnfTab:
//   AnfTab usa saldo_neto = ia − ip para TODO → pasivos/patrimonio quedan NEGATIVOS.
//   verificarCuadre (validation/balanceCheck.js) fue diseñado para la convención AnfTab.
//   En EEFFModule, el cuadre es: totalActivos − (totalPasivos + totalPatrimonio) ≈ 0.
//
// No mezclar las dos convenciones sin una conversión de signo explícita.
//
// USO: Únicamente a través de src/accounting/index.js (API pública).

/**
 * Calcula el valor neto de una cuenta en el ESF a partir de sus inventarios.
 *
 * @param {{ inventarioActivo?: number, inventarioPasivo?: number, tipoIFRS?: string }} cuenta
 * @returns {number}
 */
export function valorSit(cuenta) {
  const ia = cuenta.inventarioActivo  || 0;
  const ip = cuenta.inventarioPasivo  || 0;
  if (cuenta.tipoIFRS === 'Activo')     return ia - ip; // neto deudor positivo
  if (cuenta.tipoIFRS === 'Pasivo')     return ip - ia; // neto acreedor negativo
  if (cuenta.tipoIFRS === 'Patrimonio') return ip - ia; // neto acreedor negativo
  return 0;
}

/**
 * Calcula el valor neto de una cuenta en el ER a partir de sus movimientos.
 *
 * signo proviene de ER_BLOQUES:
 *   1  → ingreso: neto = RG − RP (positivo)
 *  -1  → egreso: neto = RP − RG (positivo = egreso; se almacena negativo en DB)
 *   0  → neto propio: RG − RP
 *
 * @param {{ resultadoGanancia?: number, resultadoPerdida?: number }} cuenta
 * @param {1|-1|0} signo
 * @returns {number}
 */
export function valorERCuenta(cuenta, signo) {
  const rg = cuenta.resultadoGanancia || 0;
  const rp = cuenta.resultadoPerdida  || 0;
  if (signo ===  1) return rg - rp; // ingreso neto
  if (signo === -1) return rp - rg; // egreso neto (positivo = costo/gasto)
  return rg - rp;                   // neto propio (No Operacional)
}
