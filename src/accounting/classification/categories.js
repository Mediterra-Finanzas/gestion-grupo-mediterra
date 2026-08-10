/* eslint-disable */
// src/accounting/classification/categories.js
// Mapeo normalizado: categoría IFRS → grupo de sección (ESF o ER).
//
// USO: Únicamente a través de src/accounting/index.js (API pública).
// No importar directamente desde este archivo en módulos externos.

export const CAT_GRUPO = {
  // ── ESF — Activo Corriente ────────────────────────────────────────
  'Efectivo y Equivalentes':                       'Activo Corriente',
  'Otros Activos Financieros Corrientes':          'Activo Corriente',
  'CxC Comerciales y Otras':                       'Activo Corriente',
  'CxC a Productores':                             'Activo Corriente',
  'Anticipos a Productores':                       'Activo Corriente',
  'CxC Entidades Relacionadas':                    'Activo Corriente',
  'Inventarios':                                   'Activo Corriente',
  'Inventarios Agrícolas':                         'Activo Corriente',
  'Activos por Impuestos':                         'Activo Corriente',
  'Pagos Anticipados':                             'Activo Corriente',
  'Impuestos Diferidos':                           'Activo Corriente',
  'Otras CxC':                                     'Activo Corriente',
  'Otros Activos Corrientes':                      'Activo Corriente',

  // ── ESF — Activo No Corriente ─────────────────────────────────────
  'Propiedades, Planta y Equipo':                  'Activo No Corriente',
  'Activos Biológicos':                            'Activo No Corriente',
  'Depreciación Acumulada (-)':                    'Activo No Corriente',
  'Activos Intangibles':                           'Activo No Corriente',
  'Amortización Acumulada (-)':                    'Activo No Corriente',
  'Inversiones en Asociadas/JV':                   'Activo No Corriente',
  'Inversiones en Otras Sociedades':               'Activo No Corriente',
  'Plusvalía':                                     'Activo No Corriente',
  'Plusvalía Negativa (-)':                        'Activo No Corriente',
  'CxC Comerciales No Corrientes':                 'Activo No Corriente',
  'CxC Entidades Relacionadas No Corrientes':      'Activo No Corriente',
  'Otros Activos No Corrientes':                   'Activo No Corriente',
  'Otros Activos Financieros No Corrientes':       'Activo No Corriente',

  // ── ESF — Pasivo Corriente ────────────────────────────────────────
  'Otros Pasivos Financieros Corrientes':          'Pasivo Corriente',
  'CxP Comerciales y Otras':                       'Pasivo Corriente',
  'CxP a Productores':                             'Pasivo Corriente',
  'CxP Entidades Relacionadas':                    'Pasivo Corriente',
  'Provisiones':                                   'Pasivo Corriente',
  'Retenciones':                                   'Pasivo Corriente',
  'Impuestos por Pagar':                           'Pasivo Corriente',
  'Impuestos a la Renta':                          'Pasivo Corriente',
  'Ingresos Diferidos':                            'Pasivo Corriente',
  'Obligaciones con el Personal':                  'Pasivo Corriente',
  'Pasivos por Leasing':                           'Pasivo Corriente',
  'Dividendos por Pagar':                          'Pasivo Corriente',
  'Otros Pasivos Corrientes':                      'Pasivo Corriente',

  // ── ESF — Pasivo No Corriente ─────────────────────────────────────
  'Otros Pasivos Financieros No Corrientes':       'Pasivo No Corriente',
  'CxP Comerciales No Corrientes':                 'Pasivo No Corriente',
  'CxP Entidades Relacionadas No Corrientes':      'Pasivo No Corriente',
  'Provisiones No Corrientes':                     'Pasivo No Corriente',
  'Obligaciones con el Personal No Corrientes':    'Pasivo No Corriente',
  'Pasivos por Leasing No Corrientes':             'Pasivo No Corriente',
  'Otros Pasivos No Corrientes':                   'Pasivo No Corriente',

  // ── ESF — Patrimonio ──────────────────────────────────────────────
  'Capital Autorizado':                            'Patrimonio',
  'Capital Pagado':                                'Patrimonio',
  'Sobreprecio en Venta de Acciones':              'Patrimonio',
  'Otras Reservas':                                'Patrimonio',
  'Resultados Acumulados':                         'Patrimonio',
  'Resultado del Ejercicio':                       'Patrimonio',
  'Dividendos Provisorios (-)':                    'Patrimonio',
  'Otras Cuentas Patrimoniales':                   'Patrimonio',

  // ── ER — Ingresos Operacionales ───────────────────────────────────
  'Ingresos por Ventas':                           'Ingreso Operacional',
  'Ingresos por Royalties / Fees':                 'Ingreso Operacional',

  // ── ER — Costos Operacionales ─────────────────────────────────────
  'Costo de Ventas':                               'Costo Operacional',
  'Costos Operacionales Agrícolas':                'Costo Operacional',

  // ── ER — Gastos Operacionales ─────────────────────────────────────
  'Remuneraciones':                                'Gasto Operacional',
  'Honorarios':                                    'Gasto Operacional',
  'Gastos de Representación':                      'Gasto Operacional',
  'Gastos de Administración y Ventas':             'Gasto Operacional',

  // ── ER — Ingresos No Operacionales ───────────────────────────────
  'Ingresos Financieros':                          'Ingreso No Operacional',
  'Participación en Resultados Asociadas':         'Ingreso No Operacional',
  'Otros Ingresos No Operacionales':               'Ingreso No Operacional',

  // ── ER — Gastos No Operacionales ─────────────────────────────────
  'Gastos Financieros':                            'Gasto No Operacional',
  'Participación en Pérdidas Asociadas':           'Gasto No Operacional',
  'Amortización Plusvalía':                        'Gasto No Operacional',
  'Otros Gastos No Operacionales':                 'Gasto No Operacional',

  // ── ER — No Operacional (neto) ────────────────────────────────────
  'Diferencias de Cambio / Corr. Monetaria':       'No Operacional',

  // ── ER — Impuesto ─────────────────────────────────────────────────
  'Impuesto a la Renta':                           'Impuesto',

  // ── Cuentas de Orden ──────────────────────────────────────────────
  'Cuentas de Orden':                              'Cuentas de Orden',
};

/** Resuelve categoría IFRS → grupo de sección. Null si no está en el catálogo. */
export function resolverGrupo(categoriaIFRS) {
  return CAT_GRUPO[categoriaIFRS] ?? null;
}
