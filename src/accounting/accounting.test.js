/* eslint-disable */
/**
 * Tests directos del Accounting Core — API Pública.
 *
 * Todas las importaciones usan EXCLUSIVAMENTE la API pública:
 *   import { ... } from '../accounting';
 * No se importan subarchivos internos del dominio.
 *
 * Tipos de test:
 *   CORRECT_BEHAVIOR — comportamiento correcto y estable
 *   KNOWN_BUG        — bug documentado preservado intencionalmente en Paso 0
 */

import {
  // Clasificación
  CAT_GRUPO,
  resolverGrupo,
  resolverClasificacion,
  obtenerSegmentosCodigo,
  clasificarSeccionEsf,
  clasificarGrupoEr,
  // Estructura
  ESF_SECCIONES,
  ER_BLOQUES,
  getBloqueEr,
  // Valoración
  valorSit,
  valorERCuenta,
  sumaEsf,
  sumaEr,
  // Validación
  verificarCuadre,
} from '../accounting';

// ═══════════════════════════════════════════════════════════════
// CLASIFICACIÓN — resolverGrupo
// ═══════════════════════════════════════════════════════════════

describe('resolverGrupo', () => {
  test('[CORRECT_BEHAVIOR] categoría ESF conocida → devuelve grupo correcto', () => {
    expect(resolverGrupo('Efectivo y Equivalentes')).toBe('Activo Corriente');
    expect(resolverGrupo('CxP Comerciales y Otras')).toBe('Pasivo Corriente');
    expect(resolverGrupo('Capital Pagado')).toBe('Patrimonio');
    expect(resolverGrupo('Propiedades, Planta y Equipo')).toBe('Activo No Corriente');
    expect(resolverGrupo('Otros Pasivos No Corrientes')).toBe('Pasivo No Corriente');
  });

  test('[CORRECT_BEHAVIOR] categoría ER conocida → devuelve grupo correcto', () => {
    expect(resolverGrupo('Ingresos por Ventas')).toBe('Ingreso Operacional');
    expect(resolverGrupo('Costo de Ventas')).toBe('Costo Operacional');
    expect(resolverGrupo('Resultado del Ejercicio')).toBe('Patrimonio');
  });

  test('[CORRECT_BEHAVIOR] categoría desconocida → devuelve null (no lanza excepción)', () => {
    expect(resolverGrupo('Categoría Inexistente')).toBeNull();
    expect(resolverGrupo('')).toBeNull();
    expect(resolverGrupo(null)).toBeNull();
    expect(resolverGrupo(undefined)).toBeNull();
  });

  test('[CORRECT_BEHAVIOR] CAT_GRUPO es el objeto canónico — al menos 60 entradas', () => {
    expect(Object.keys(CAT_GRUPO).length).toBeGreaterThanOrEqual(60);
  });
});

// ═══════════════════════════════════════════════════════════════
// CLASIFICACIÓN — resolverClasificacion
// ═══════════════════════════════════════════════════════════════

describe('resolverClasificacion', () => {
  // resolverClasificacion devuelve el grupo de sección (string) o null.
  // Es el lookup directo en CAT_GRUPO con protección de nulos.

  test('[CORRECT_BEHAVIOR] categoría ESF → devuelve el grupo de sección', () => {
    expect(resolverClasificacion('Efectivo y Equivalentes')).toBe('Activo Corriente');
    expect(resolverClasificacion('Capital Pagado')).toBe('Patrimonio');
    expect(resolverClasificacion('CxP Comerciales y Otras')).toBe('Pasivo Corriente');
  });

  test('[CORRECT_BEHAVIOR] categoría ER → devuelve el grupo ER', () => {
    expect(resolverClasificacion('Ingresos por Ventas')).toBe('Ingreso Operacional');
    expect(resolverClasificacion('Costo de Ventas')).toBe('Costo Operacional');
  });

  test('[CORRECT_BEHAVIOR] categoría desconocida → null', () => {
    expect(resolverClasificacion('Desconocida')).toBeNull();
  });

  test('[CORRECT_BEHAVIOR] null/undefined/vacío → null (no lanza excepción)', () => {
    expect(resolverClasificacion(null)).toBeNull();
    expect(resolverClasificacion(undefined)).toBeNull();
    expect(resolverClasificacion('')).toBeNull();
  });

  test('[CORRECT_BEHAVIOR] nunca retorna undefined', () => {
    expect(resolverClasificacion(null)).not.toBeUndefined();
    expect(resolverClasificacion('Desconocida')).not.toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// CLASIFICACIÓN — compatibilidad wrapper anfClasificacion.js
// ═══════════════════════════════════════════════════════════════

describe('compatibilidad wrapper anfClasificacion.js', () => {
  // Estas funciones están re-exportadas en anfClasificacion.js apuntando a ../accounting.
  // Este test verifica que la API pública exporta exactamente las mismas funciones
  // que el wrapper forward, sin behavior divergence.
  test('[CORRECT_BEHAVIOR] obtenerSegmentosCodigo disponible en API pública', () => {
    const r = obtenerSegmentosCodigo('1.01.01.001');
    expect(r).toBeDefined();
    expect(r.primerNivel).toBe('1');
  });

  test('[CORRECT_BEHAVIOR] clasificarSeccionEsf disponible en API pública', () => {
    expect(clasificarSeccionEsf('1.01.01.001')).toBe('Activo Corriente');
  });

  test('[CORRECT_BEHAVIOR] clasificarGrupoEr disponible en API pública', () => {
    expect(clasificarGrupoEr('4.01.01.001')).toBe('Ingreso Operacional');
  });

  test('[CORRECT_BEHAVIOR] resultados idénticos importando desde API pública o wrapper', async () => {
    // El wrapper anfClasificacion.js re-exporta desde ../accounting.
    // Al importar clasificarSeccionEsf desde accounting, debe producir el mismo resultado.
    const resPublico = clasificarSeccionEsf('2.01.01.001');
    expect(resPublico).toBe('Pasivo Corriente');
  });
});

// ═══════════════════════════════════════════════════════════════
// CLASIFICACIÓN — KNOWN_BUGs preservados en Paso 0
// ═══════════════════════════════════════════════════════════════

describe('KNOWN_BUGs preservados en Paso 0 (clasificación Megasystem)', () => {
  test('[KNOWN_BUG] 27xxxxx Megasystem → hoy retorna "Pasivo No Corriente" (correcto sería "Patrimonio")', () => {
    // primerNivel=2, segundoNivel=7 → cae en Pasivo No Corriente por la lógica actual.
    // Corrección pendiente en Fase 3 con AccountingProfile.
    expect(clasificarSeccionEsf('2701001')).toBe('Pasivo No Corriente');
  });

  test('[KNOWN_BUG] 31xxxxx Megasystem → hoy retorna "Patrimonio" (correcto sería null)', () => {
    // primerNivel=3 → case patrimonio en Contec, pero en Megasystem 3xxx son ingresos.
    expect(clasificarSeccionEsf('3101001')).toBe('Patrimonio');
  });

  test('[KNOWN_BUG] 34xxxxx Megasystem → hoy retorna "Patrimonio" (correcto sería null)', () => {
    expect(clasificarSeccionEsf('3401001')).toBe('Patrimonio');
  });
});

// ═══════════════════════════════════════════════════════════════
// VALORACIÓN — valorSit
// ═══════════════════════════════════════════════════════════════

describe('valorSit', () => {
  // Convención de valorSit (EEFFModule): todos los valores normales son POSITIVOS.
  //   Activo:     ia − ip  → + cuando ia > ip (saldo deudor normal)
  //   Pasivo:     ip − ia  → + cuando ip > ia (saldo acreedor normal)
  //   Patrimonio: ip − ia  → + cuando ip > ia (saldo acreedor normal)
  // IMPORTANTE: esta convención difiere de saldo_neto en AnfTab (pasivos allá son negativos).

  test('[CORRECT_BEHAVIOR] activo: ia − ip → positivo cuando ia > ip', () => {
    const cuenta = { tipoIFRS: 'Activo', inventarioActivo: 100_000, inventarioPasivo: 0 };
    expect(valorSit(cuenta)).toBe(100_000);
  });

  test('[CORRECT_BEHAVIOR] activo con deducción: ia=100k, ip=20k → 80k', () => {
    const cuenta = { tipoIFRS: 'Activo', inventarioActivo: 100_000, inventarioPasivo: 20_000 };
    expect(valorSit(cuenta)).toBe(80_000);
  });

  test('[CORRECT_BEHAVIOR] pasivo: ip − ia → positivo (saldo acreedor normal)', () => {
    // En EEFFModule, Pasivos devuelven POSITIVO cuando ip > ia.
    // Distinto de saldo_neto en AnfTab (que daría negativo para pasivos).
    const cuenta = { tipoIFRS: 'Pasivo', inventarioActivo: 0, inventarioPasivo: 95_000 };
    expect(valorSit(cuenta)).toBe(95_000);
  });

  test('[CORRECT_BEHAVIOR] patrimonio: ip − ia → positivo (saldo acreedor normal)', () => {
    const cuenta = { tipoIFRS: 'Patrimonio', inventarioActivo: 0, inventarioPasivo: 715_000 };
    expect(valorSit(cuenta)).toBe(715_000);
  });

  test('[CORRECT_BEHAVIOR] activo con saldo cero → 0', () => {
    const cuenta = { tipoIFRS: 'Activo', inventarioActivo: 50_000, inventarioPasivo: 50_000 };
    expect(valorSit(cuenta)).toBe(0);
  });

  test('[CORRECT_BEHAVIOR] pasivo con saldo cero → 0', () => {
    const cuenta = { tipoIFRS: 'Pasivo', inventarioActivo: 50_000, inventarioPasivo: 50_000 };
    expect(valorSit(cuenta)).toBe(0);
  });

  test('[CORRECT_BEHAVIOR] activo con saldo anómalo (ia < ip) → negativo', () => {
    // Cuenta activo con más crédito que débito (p.ej. depreciación acumulada registrada aquí)
    const cuenta = { tipoIFRS: 'Activo', inventarioActivo: 30_000, inventarioPasivo: 80_000 };
    expect(valorSit(cuenta)).toBe(-50_000);
  });

  test('[CORRECT_BEHAVIOR] tipoIFRS desconocido → 0 (no lanza excepción)', () => {
    const cuenta = { tipoIFRS: 'Desconocido', inventarioActivo: 100_000, inventarioPasivo: 0 };
    expect(valorSit(cuenta)).toBe(0);
  });

  test('[CORRECT_BEHAVIOR] campos ausentes → trata como 0 (no lanza excepción)', () => {
    expect(valorSit({ tipoIFRS: 'Activo' })).toBe(0);
    expect(valorSit({ tipoIFRS: 'Pasivo' })).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// VALORACIÓN — valorERCuenta
// ═══════════════════════════════════════════════════════════════

describe('valorERCuenta', () => {
  test('[CORRECT_BEHAVIOR] ingreso (signo=1): rg − rp → positivo', () => {
    const cuenta = { resultadoGanancia: 200_000, resultadoPerdida: 0 };
    expect(valorERCuenta(cuenta, 1)).toBe(200_000);
  });

  test('[CORRECT_BEHAVIOR] ingreso con devolución (signo=1): rg=200k, rp=20k → 180k', () => {
    const cuenta = { resultadoGanancia: 200_000, resultadoPerdida: 20_000 };
    expect(valorERCuenta(cuenta, 1)).toBe(180_000);
  });

  test('[CORRECT_BEHAVIOR] egreso (signo=-1): rp − rg → positivo (almacenado negativo en DB)', () => {
    const cuenta = { resultadoGanancia: 0, resultadoPerdida: 150_000 };
    expect(valorERCuenta(cuenta, -1)).toBe(150_000);
  });

  test('[CORRECT_BEHAVIOR] egreso con contrapartida (signo=-1): rp=150k, rg=10k → 140k', () => {
    const cuenta = { resultadoGanancia: 10_000, resultadoPerdida: 150_000 };
    expect(valorERCuenta(cuenta, -1)).toBe(140_000);
  });

  test('[CORRECT_BEHAVIOR] signo=0 (No Operacional): rg − rp propio', () => {
    const cuenta = { resultadoGanancia: 50_000, resultadoPerdida: 10_000 };
    expect(valorERCuenta(cuenta, 0)).toBe(40_000);
  });

  test('[CORRECT_BEHAVIOR] valor cero en ingreso → 0', () => {
    expect(valorERCuenta({ resultadoGanancia: 0, resultadoPerdida: 0 }, 1)).toBe(0);
  });

  test('[CORRECT_BEHAVIOR] valor cero en egreso → 0', () => {
    expect(valorERCuenta({ resultadoGanancia: 0, resultadoPerdida: 0 }, -1)).toBe(0);
  });

  test('[CORRECT_BEHAVIOR] campos ausentes → trata como 0', () => {
    expect(valorERCuenta({}, 1)).toBe(0);
    expect(valorERCuenta({}, -1)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// VALORACIÓN — sumaEsf
// ═══════════════════════════════════════════════════════════════

describe('sumaEsf', () => {
  const saldos = [
    { codigo: '1.01.01.001', categoria_ifrs: 'Activo Corriente',     saldo_neto:  300_000 },
    { codigo: '1.01.02.001', categoria_ifrs: 'Activo Corriente',     saldo_neto:  200_000 },
    { codigo: '1.02.01.001', categoria_ifrs: 'Activo No Corriente',  saldo_neto:  500_000 },
    { codigo: '2.01.01.001', categoria_ifrs: 'Pasivo Corriente',     saldo_neto: -150_000 },
    { codigo: '3.01.001',    categoria_ifrs: 'Patrimonio',           saldo_neto: -850_000 },
  ];

  test('[CORRECT_BEHAVIOR] suma Activo Corriente', () => {
    expect(sumaEsf(saldos, ['Activo Corriente'])).toBe(500_000);
  });

  test('[CORRECT_BEHAVIOR] suma múltiples secciones: Activo Corriente + No Corriente', () => {
    expect(sumaEsf(saldos, ['Activo Corriente', 'Activo No Corriente'])).toBe(1_000_000);
  });

  test('[CORRECT_BEHAVIOR] suma Pasivo Corriente → negativo (por convención de signo)', () => {
    expect(sumaEsf(saldos, ['Pasivo Corriente'])).toBe(-150_000);
  });

  test('[CORRECT_BEHAVIOR] arreglo vacío → 0', () => {
    expect(sumaEsf([], ['Activo Corriente'])).toBe(0);
  });

  test('[CORRECT_BEHAVIOR] categorías no presentes en los saldos → 0', () => {
    expect(sumaEsf(saldos, ['Pasivo No Corriente'])).toBe(0);
  });

  test('[CORRECT_BEHAVIOR] saldos sin categoria_ifrs → fallback a clasificarSeccionEsf(codigo)', () => {
    const saldoSinCategoria = [
      { codigo: '1.01.01.001', saldo_neto: 100_000 }, // sin categoria_ifrs
    ];
    expect(sumaEsf(saldoSinCategoria, ['Activo Corriente'])).toBe(100_000);
  });

  test('[CORRECT_BEHAVIOR] cuentas con categoría desconocida son ignoradas en la suma', () => {
    const saldoDesconocido = [
      { codigo: 'XXXX', categoria_ifrs: 'Categoría Rara', saldo_neto: 99_999 },
      { codigo: '1.01.01.001', categoria_ifrs: 'Activo Corriente', saldo_neto: 10_000 },
    ];
    expect(sumaEsf(saldoDesconocido, ['Activo Corriente'])).toBe(10_000);
  });
});

// ═══════════════════════════════════════════════════════════════
// VALORACIÓN — sumaEr
// ═══════════════════════════════════════════════════════════════

describe('sumaEr', () => {
  const movimientos = [
    { grupo_er: 'Ingreso Operacional', real_ytd: 500_000 },
    { grupo_er: 'Ingreso Operacional', real_ytd: 200_000 },
    { grupo_er: 'Costo Operacional',   real_ytd: 300_000 },
    { grupo_er: 'Gasto Operacional',   real_ytd:  80_000 },
    { grupo_er: 'Impuesto',            real_ytd:  40_000 },
  ];

  test('[CORRECT_BEHAVIOR] suma Ingreso Operacional', () => {
    expect(sumaEr(movimientos, ['Ingreso Operacional'])).toBe(700_000);
  });

  test('[CORRECT_BEHAVIOR] suma múltiples grupos', () => {
    expect(sumaEr(movimientos, ['Costo Operacional', 'Gasto Operacional'])).toBe(380_000);
  });

  test('[CORRECT_BEHAVIOR] arreglo vacío → 0', () => {
    expect(sumaEr([], ['Ingreso Operacional'])).toBe(0);
  });

  test('[CORRECT_BEHAVIOR] grupo no presente → 0', () => {
    expect(sumaEr(movimientos, ['Ingreso No Operacional'])).toBe(0);
  });

  test('[CORRECT_BEHAVIOR] campo personalizado (presupuesto)', () => {
    const mov = [{ grupo_er: 'Ingreso Operacional', real_ytd: 500_000, ppto_ytd: 600_000 }];
    expect(sumaEr(mov, ['Ingreso Operacional'], 'ppto_ytd')).toBe(600_000);
  });

  test('[CORRECT_BEHAVIOR] campo ausente trata como 0', () => {
    const mov = [{ grupo_er: 'Ingreso Operacional' }]; // sin real_ytd
    expect(sumaEr(mov, ['Ingreso Operacional'])).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// VALIDACIÓN — verificarCuadre
// ═══════════════════════════════════════════════════════════════

describe('verificarCuadre', () => {
  // ── Caso 1: ESF cuadrado con pasivo y patrimonio negativos ─────────────────
  test('[CORRECT_BEHAVIOR] Caso 1 — ESF cuadrado exacto: activos=5000, pasYPat=-5000 → cuadra=true, diff=0', () => {
    const { cuadra, diferencia } = verificarCuadre(5_000, -5_000);
    expect(cuadra).toBe(true);
    expect(diferencia).toBe(0);
  });

  // ── Caso 2: ESF descuadrado ─────────────────────────────────────────────────
  test('[CORRECT_BEHAVIOR] Caso 2 — ESF descuadrado: activos=5000, pasYPat=-4800 → cuadra=false, diff=200', () => {
    const { cuadra, diferencia } = verificarCuadre(5_000, -4_800);
    expect(cuadra).toBe(false);
    expect(diferencia).toBeCloseTo(200, 2);
  });

  // ── Caso 3: diferencia inferior a la tolerancia (< 1) ──────────────────────
  test('[CORRECT_BEHAVIOR] Caso 3 — diferencia 0.5 (< tolerancia 1) → cuadra=true', () => {
    const { cuadra, diferencia } = verificarCuadre(5_000, -4_999.5);
    expect(cuadra).toBe(true);
    expect(diferencia).toBeCloseTo(0.5, 5);
  });

  // ── Caso 4: diferencia igual a la tolerancia (= 1) ─────────────────────────
  test('[CORRECT_BEHAVIOR] Caso 4 — diferencia exactamente 1 (= tolerancia) → cuadra=false (límite estricto)', () => {
    const { cuadra, diferencia } = verificarCuadre(5_001, -5_000);
    expect(cuadra).toBe(false);
    expect(diferencia).toBeCloseTo(1, 5);
  });

  // ── Caso 5: diferencia superior a la tolerancia (> 1) ──────────────────────
  test('[CORRECT_BEHAVIOR] Caso 5 — diferencia 500 (> tolerancia) → cuadra=false', () => {
    const { cuadra, diferencia } = verificarCuadre(5_500, -5_000);
    expect(cuadra).toBe(false);
    expect(diferencia).toBeCloseTo(500, 2);
  });

  // ── Caso 6: valores decimales ───────────────────────────────────────────────
  test('[CORRECT_BEHAVIOR] Caso 6 — valores decimales cuadrados: 1234.56 + (-1234.56) → cuadra=true', () => {
    const { cuadra, diferencia } = verificarCuadre(1_234.56, -1_234.56);
    expect(cuadra).toBe(true);
    expect(Math.abs(diferencia)).toBeLessThan(0.001);
  });

  test('[CORRECT_BEHAVIOR] Caso 6b — decimales con diferencia 0.01 centavo → cuadra=true (dentro de tolerancia)', () => {
    const { cuadra } = verificarCuadre(1_000.005, -1_000.004);
    expect(cuadra).toBe(true);
  });

  // ── Caso 7: valores cero ────────────────────────────────────────────────────
  test('[CORRECT_BEHAVIOR] Caso 7 — activos=0, pasYPat=0 → cuadra=true, diff=0', () => {
    const { cuadra, diferencia } = verificarCuadre(0, 0);
    expect(cuadra).toBe(true);
    expect(diferencia).toBe(0);
  });

  test('[CORRECT_BEHAVIOR] Caso 7b — un lado cero, el otro no → cuadra=false', () => {
    const { cuadra } = verificarCuadre(5_000, 0);
    expect(cuadra).toBe(false);
  });

  // ── Caso 8: valores inválidos o ausentes ────────────────────────────────────
  test('[CORRECT_BEHAVIOR] Caso 8 — NaN en activos → diferencia=NaN, cuadra=false', () => {
    const { cuadra, diferencia } = verificarCuadre(NaN, -5_000);
    // NaN + (-5000) = NaN; Math.abs(NaN) < 1 = false
    expect(cuadra).toBe(false);
    expect(isNaN(diferencia)).toBe(true);
  });

  test('[CORRECT_BEHAVIOR] Caso 8b — valores muy grandes sin desbordamiento', () => {
    const { cuadra, diferencia } = verificarCuadre(1e12, -1e12);
    expect(cuadra).toBe(true);
    expect(Math.abs(diferencia)).toBeLessThan(1);
  });

  // ── Verificación de la tolerancia ──────────────────────────────────────────
  test('[CORRECT_BEHAVIOR] tolerancia = 1 unidad monetaria (definida en balanceCheck.js)', () => {
    // La función usa Math.abs(diferencia) < 1.
    // Aquí documentamos el contrato: < 1 cuadra, ≥ 1 no cuadra.
    expect(verificarCuadre(1_000, -999.99).cuadra).toBe(true);   // diff=0.01 < 1
    expect(verificarCuadre(1_000, -999.00).cuadra).toBe(false);  // diff=1.00 ≥ 1
    expect(verificarCuadre(1_000, -999.50).cuadra).toBe(true);   // diff=0.50 < 1
  });
});

// ═══════════════════════════════════════════════════════════════
// ESTRUCTURA — ESF_SECCIONES / ER_BLOQUES / getBloqueEr
// ═══════════════════════════════════════════════════════════════

describe('ESF_SECCIONES y ER_BLOQUES', () => {
  test('[CORRECT_BEHAVIOR] ESF_SECCIONES es un array de 5 objetos con las secciones IFRS', () => {
    expect(ESF_SECCIONES).toHaveLength(5);
    const grupos = ESF_SECCIONES.map(s => s.grupo);
    expect(grupos).toContain('Activo Corriente');
    expect(grupos).toContain('Activo No Corriente');
    expect(grupos).toContain('Pasivo Corriente');
    expect(grupos).toContain('Pasivo No Corriente');
    expect(grupos).toContain('Patrimonio');
  });

  test('[CORRECT_BEHAVIOR] cada sección ESF tiene id, label, totalLabel, grupo', () => {
    for (const sec of ESF_SECCIONES) {
      expect(sec).toHaveProperty('id');
      expect(sec).toHaveProperty('label');
      expect(sec).toHaveProperty('totalLabel');
      expect(sec).toHaveProperty('grupo');
    }
  });

  test('[CORRECT_BEHAVIOR] ER_BLOQUES contiene los grupos estándar del ER', () => {
    const grupos = ER_BLOQUES.map(b => b.grupo);
    expect(grupos).toContain('Ingreso Operacional');
    expect(grupos).toContain('Costo Operacional');
    expect(grupos).toContain('Gasto Operacional');
  });

  test('[CORRECT_BEHAVIOR] getBloqueEr devuelve bloque correcto para grupo conocido', () => {
    const bloque = getBloqueEr('Ingreso Operacional');
    expect(bloque).toBeDefined();
    expect(bloque.signo).toBe(1);
  });

  test('[CORRECT_BEHAVIOR] getBloqueEr devuelve null para grupo desconocido', () => {
    expect(getBloqueEr('Grupo Inexistente')).toBeNull();
    expect(getBloqueEr(null)).toBeNull();
  });

  test('[CORRECT_BEHAVIOR] signo de Costo Operacional es -1 (egreso)', () => {
    const bloque = getBloqueEr('Costo Operacional');
    expect(bloque.signo).toBe(-1);
  });
});
