/* eslint-disable */
// src/accounting/validation/balanceCheck.js
// Validación de cuadre del ESF: Activo = Pasivo + Patrimonio.
//
// Convención de signos:
//   Los saldos de Pasivo y Patrimonio se almacenan como NEGATIVOS en saldo_neto
//   (convencion: saldo_neto = inventario_activo − inventario_pasivo).
//   Por tanto la ecuación de cuadre correcta es:
//
//     totalActivos + totalPasYPat ≈ 0
//
//   No: totalActivos − totalPasYPat (ese era el bug en AnfTab.jsx:361).
//
// USO: Únicamente a través de src/accounting/index.js (API pública).

/**
 * Verifica el cuadre del ESF.
 *
 * @param {number} totalActivos   — suma de Activo Corriente + Activo No Corriente (positivo)
 * @param {number} totalPasYPat   — suma de Pasivos + Patrimonio (negativo por convención)
 * @returns {{ cuadra: boolean, diferencia: number }}
 *   diferencia ≈ 0 cuando cuadra; positiva = más activos; negativa = más pasivos+pat
 */
export function verificarCuadre(totalActivos, totalPasYPat) {
  const diferencia = totalActivos + totalPasYPat;
  return {
    cuadra: Math.abs(diferencia) < 1,
    diferencia,
  };
}
