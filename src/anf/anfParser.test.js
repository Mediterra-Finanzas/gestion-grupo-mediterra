/* eslint-disable */
/**
 * Tests de anfParser.js — Fase 0 Financial Reporting Platform
 *
 * Funciones testadas (exportadas):
 *   buildSaldosEsf     — filtra + combina ESF actual + T1 → registros DB
 *   buildMovimientosEr — combina er_temp + er_mensual → registros DB
 *   calcTemporada      — calcula string de temporada por mes/año
 *
 * Tipos de test:
 *   CORRECT_BEHAVIOR   — comportamiento correcto que debe mantenerse
 *   KNOWN_BUG          — bug existente en producción documentado para detectar regresiones
 *   EXPECTED_TO_CHANGE — output cambiará al implementar SourceAdapter/AccountingProfile
 *
 * Nota sobre versiones:
 *   Tests escritos contra la versión en main de anfParser.js.
 *   La rama de desarrollo (claude/crazy-heisenberg) tenía una versión más antigua
 *   con bugs en buildSaldosEsf y clasificarGrupoEr ya corregidos en main.
 *
 * Nota: parsearInformeANF no se testa aquí porque requiere un archivo File real
 * (File API del browser). Se testará en integración (Fase 2).
 */

import { buildSaldosEsf, buildMovimientosEr, calcTemporada } from './anfParser';
import * as FriskuMegasystem from './__fixtures__/frisku-megasystem-jun2026';
import * as AllegriaCon      from './__fixtures__/allegria-contec-jun2026';

// ── calcTemporada ─────────────────────────────────────────────────────────────

describe('calcTemporada', () => {
  // CORRECT_BEHAVIOR
  test('mes=6 (jun) 2026 → temporada 2025-2026', () => {
    expect(calcTemporada(6, 2026)).toBe('2025-2026');
  });

  test('mes=7 (jul) 2026 → temporada 2026-2027 (inicio nueva temporada)', () => {
    expect(calcTemporada(7, 2026)).toBe('2026-2027');
  });

  test('mes=1 (ene) 2026 → temporada 2025-2026', () => {
    expect(calcTemporada(1, 2026)).toBe('2025-2026');
  });

  test('mes=12 (dic) 2026 → temporada 2026-2027', () => {
    expect(calcTemporada(12, 2026)).toBe('2026-2027');
  });

  test('mes=6 2025 → temporada 2024-2025', () => {
    expect(calcTemporada(6, 2025)).toBe('2024-2025');
  });
});

// ── buildSaldosEsf — Contec ───────────────────────────────────────────────────

describe('buildSaldosEsf — Contec', () => {
  const esfValido = AllegriaCon.ESF;
  const esfT1     = AllegriaCon.ESF_T1;

  // CORRECT_BEHAVIOR: cuentas ESF válidas de Contec pasan el filtro
  test('retorna array no vacío para cuentas válidas Contec', () => {
    const result = buildSaldosEsf(esfValido, []);
    expect(result.length).toBeGreaterThan(0);
  });

  test('todas las cuentas retornadas tienen primer dígito 1, 2 o 3', () => {
    const result = buildSaldosEsf(esfValido, []);
    for (const c of result) {
      expect(['1', '2', '3']).toContain((c.codigo || '')[0]);
    }
  });

  // CORRECT_BEHAVIOR: cuentas ER (4+) son excluidas en Contec
  test('cuentas 4.xx.xxx y 5.xx.xxx de Contec son excluidas del ESF', () => {
    const result = buildSaldosEsf(AllegriaCon.ESF_CON_LEGACY, []);
    const codigos = result.map(c => c.codigo);
    expect(codigos).not.toContain('4.01.01.001');
    expect(codigos).not.toContain('5.01.01.001');
  });

  // CORRECT_BEHAVIOR: saldo_neto = ia - ip
  test('saldo_neto = inventario_activo − inventario_pasivo', () => {
    const result = buildSaldosEsf(esfValido, []);
    for (const c of result) {
      expect(c.saldo_neto).toBeCloseTo(c.inventario_activo - c.inventario_pasivo, 2);
    }
  });

  // CORRECT_BEHAVIOR: variación vs T1 correcta
  test('cuenta presente en T1 → saldo_neto_t1 y var_abs calculados', () => {
    const result = buildSaldosEsf(esfValido, esfT1);
    const caja = result.find(c => c.codigo === '1.01.01.001');
    expect(caja).toBeDefined();
    // T1: ia=120_000, ip=0 → saldo_neto_t1=120_000
    expect(caja.saldo_neto_t1).toBeCloseTo(120_000, 2);
    // actual: ia=150_000 → saldo_neto=150_000 → var_abs=30_000
    expect(caja.var_abs).toBeCloseTo(30_000, 2);
  });

  test('cuenta ausente en T1 → saldo_neto_t1=null, var_abs=null', () => {
    const result = buildSaldosEsf(esfValido, esfT1);
    // 2.01.03.001 no está en T1
    const remu = result.find(c => c.codigo === '2.01.03.001');
    expect(remu).toBeDefined();
    expect(remu.saldo_neto_t1).toBeNull();
    expect(remu.var_abs).toBeNull();
  });

  // KNOWN_BUG: es_material no se activa para cuentas nuevas (saldo_neto_t1 === null)
  //
  // Código actual en anfParser.js (línea ~412):
  //   const es_material = var_pct != null
  //     ? Math.abs(var_pct) >= pisoMaterialidad
  //     : (saldo_neto_t1 === 0 && saldo_neto !== 0);  // ← solo captura "apareció en T0 con saldo 0"
  //
  // El bug: cuando una cuenta es COMPLETAMENTE NUEVA (saldo_neto_t1 === null),
  // la condición `saldo_neto_t1 === 0` evalúa false → es_material = false.
  // La cuenta nueva con saldo significativo queda invisible al análisis de materialidad.
  //
  // Comportamiento esperado: `(saldo_neto_t1 === 0 || saldo_neto_t1 === null) && saldo_neto !== 0`
  //
  // Impacto financiero: una cuenta nueva con saldo alto (ej. provisión de $500k) no activa
  //   la alerta de materialidad → el CFO no la ve destacada en el reporte ESF.
  //   En Frisku: cuentas 3xxxxx nuevas (ingresos mal clasificados en ESF) podrían no aparecer
  //   como materiales aun teniendo saldos de cientos de miles de USD.
  //
  // Impacto visual: la UI no resalta la cuenta con color/badge "material" → riesgo de que
  //   el analista omita investigarla en el cierre mensual.
  //
  // Fase propuesta para corrección: Fase 1 (cambio de una línea en anfParser.js,
  //   independiente de AccountingProfile). Requiere nuevo test CORRECT_BEHAVIOR y
  //   verificación de que no rompe la lógica de cuentas con saldo_neto_t1 === 0.

  test('[KNOWN_BUG] cuenta nueva (saldo_neto_t1=null, saldo_neto≠0) → es_material=false (BUG: debería ser true)', () => {
    const result = buildSaldosEsf(esfValido, esfT1);
    // 2.01.03.001 está en ESF actual pero no en ESF_T1 → saldo_neto_t1=null
    const remu = result.find(c => c.codigo === '2.01.03.001');
    expect(remu).toBeDefined();
    expect(remu.saldo_neto_t1).toBeNull();             // confirma: cuenta ausente en T1
    expect(remu.saldo_neto).not.toBe(0);               // confirma: tiene saldo real (−95.000)
    expect(remu.es_material).toBe(false);              // BUG: devuelve false
    // Cuando se corrija: expect(remu.es_material).toBe(true);
  });

  test('[KNOWN_BUG] segunda cuenta nueva (3.02.001, saldo_neto_t1=null) → es_material=false', () => {
    const result = buildSaldosEsf(esfValido, esfT1);
    // 3.02.001 (Utilidades Retenidas) ausente en T1 → mismo bug
    const util = result.find(c => c.codigo === '3.02.001');
    expect(util).toBeDefined();
    expect(util.saldo_neto_t1).toBeNull();
    expect(util.saldo_neto).not.toBe(0);
    expect(util.es_material).toBe(false); // BUG: debería ser true
  });

  test('[KNOWN_BUG] contraste: cuenta con saldo_neto_t1=0 SÍ activa es_material (caso que sí funciona)', () => {
    // Si una cuenta existía en T1 con saldo=0 y en T0 tiene saldo, es_material=true (OK)
    const esfConCuentaCero = [{ codigo: '1.01.99.001', nombre: 'Cuenta Test', inventario_activo: 50_000, inventario_pasivo: 0, sistema: 'contec' }];
    const esfT1ConCero     = [{ codigo: '1.01.99.001', nombre: 'Cuenta Test', inventario_activo: 0,      inventario_pasivo: 0, sistema: 'contec' }];
    const result = buildSaldosEsf(esfConCuentaCero, esfT1ConCero);
    const cuenta = result[0];
    expect(cuenta.saldo_neto_t1).toBeCloseTo(0, 2);   // saldo_neto_t1 = 0 (existía en T1)
    expect(cuenta.saldo_neto).toBeCloseTo(50_000, 2);
    // Con saldo_neto_t1=0, var_pct = undefined → fallback (saldo_neto_t1===0 && saldo_neto!==0) = true
    // NOTA: var_pct es null cuando saldo_neto_t1===0 (división por cero protegida)
    expect(cuenta.es_material).toBe(true);  // CORRECT_BEHAVIOR para T1=0
    // El bug: este caso funciona pero el caso T1=null no funciona
  });

  // CORRECT_BEHAVIOR: estructura de cada registro
  test('cada registro tiene los campos requeridos', () => {
    const result = buildSaldosEsf(esfValido, []);
    const camposReq = ['codigo', 'nombre', 'nombre_origen', 'sistema', 'inventario_activo',
                       'inventario_pasivo', 'saldo_neto', 'saldo_neto_t1', 'var_abs',
                       'var_pct', 'es_material'];
    for (const c of result) {
      for (const campo of camposReq) {
        expect(c).toHaveProperty(campo);
      }
    }
  });
});

// ── buildSaldosEsf — Megasystem ───────────────────────────────────────────────

describe('buildSaldosEsf — Megasystem', () => {
  const esfMega = FriskuMegasystem.ESF;

  // CORRECT_BEHAVIOR (fix aplicado en main): el filtro usa primer carácter [0],
  // no split('.')[0], por lo que funciona para Megasystem sin puntos.
  test('cuentas Megasystem 1xxxxxx y 2xxxxxx son incluidas (filtro usa primer dígito)', () => {
    const result = buildSaldosEsf(esfMega, []);
    expect(result.length).toBeGreaterThan(0);
    const codigos = result.map(c => c.codigo);
    expect(codigos).toContain('1101003');
    expect(codigos).toContain('2101001');
  });

  test('cuenta de activo Megasystem (1101003) incluida en el ESF', () => {
    const soloActivo = [{ codigo: '1101003', nombre: 'Banco CLP', inventario_activo: 312_500, inventario_pasivo: 0, sistema: 'megasystem' }];
    const result = buildSaldosEsf(soloActivo, []);
    expect(result.length).toBe(1);
    expect(result[0].codigo).toBe('1101003');
  });

  // CORRECT_BEHAVIOR: cuentas 4xxxxxx+ excluidas en Megasystem
  test('cuentas 4xxxxxx de Megasystem son excluidas del ESF', () => {
    const result = buildSaldosEsf(esfMega, []);
    const codigos = result.map(c => c.codigo);
    expect(codigos).not.toContain('4101001');
    expect(codigos).not.toContain('4201001');
  });

  // KNOWN_BUG (en anfClasificacion.js, no en buildSaldosEsf):
  // 27xxxxx aparece en el ESF (pasat el filtro: primer dígito '2'), pero
  // clasificarSeccionEsf() las clasifica como 'Pasivo No Corriente' en lugar de 'Patrimonio'.
  // Este bug es de PRESENTACIÓN (en UI), no de inclusión en el ESF.
  // buildSaldosEsf sí las incluye correctamente.
  test('cuentas 27xxxxx incluidas en ESF (filtro correcto; bug de clasificación es en UI)', () => {
    const result = buildSaldosEsf(esfMega, []);
    const codigos = result.map(c => c.codigo);
    expect(codigos).toContain('2701001');
    expect(codigos).toContain('2702001');
  });

  // KNOWN_BUG (en anfClasificacion.js, no en buildSaldosEsf):
  // 3xxxxxx Megasystem pasan el filtro (primer dígito '3') y aparecen en el ESF,
  // pero son cuentas de resultado (ingresos). Doble conteo: aparecen en ESF y en ER.
  // Será corregido en Fase 3 con SourceAdapter que excluirá 3xxx Megasystem del ESF.
  test('[KNOWN_BUG] 3xxxxxx Megasystem pasa el filtro ESF (deberían excluirse)', () => {
    const result = buildSaldosEsf(esfMega, []);
    const codigos = result.map(c => c.codigo);
    expect(codigos).toContain('3101001'); // BUG: 3xxx Megasystem = ingresos, no balance
    // Cuando se corrija en Fase 3: expect(codigos).not.toContain('3101001');
  });

  // CORRECT_BEHAVIOR: totales exactos del fixture REAL_AGGREGATES (Supabase jun 2026)
  // Estos valores son reales (no sintéticos) y NO deben modificarse sin validación contra Supabase.
  test('REAL_AGGREGATES: valores exactos persistidos en Supabase (Frisku jun 2026)', () => {
    const { inv_activo, inv_pasivo, descuadre } = FriskuMegasystem.REAL_AGGREGATES;
    expect(inv_activo).toBe(5_024_481.71);
    expect(inv_pasivo).toBe(2_902_083.35);
    expect(descuadre).toBeCloseTo(2_122_398.36, 2);
    // Verificación aritmética: descuadre = activo - pasivo
    expect(inv_activo - inv_pasivo).toBeCloseTo(descuadre, 2);
  });
});

// ── buildMovimientosEr — Contec ───────────────────────────────────────────────

describe('buildMovimientosEr — Contec', () => {
  const erTemp    = AllegriaCon.ER_TEMP_MAP;
  const erMensual = AllegriaCon.ER_MENSUAL_MAP;

  // CORRECT_BEHAVIOR
  test('retorna array no vacío', () => {
    const result = buildMovimientosEr(erTemp, erMensual, 6, 2026, 'contec');
    expect(result.length).toBeGreaterThan(0);
  });

  test('cuenta 4.01.01.001 → grupo_er Ingreso Operacional (Contec, prefijo 4)', () => {
    const result = buildMovimientosEr(erTemp, new Map(), 6, 2026, 'contec');
    const ingreso = result.find(r => r.codigo === '4.01.01.001');
    expect(ingreso).toBeDefined();
    expect(ingreso.grupo_er).toBe('Ingreso Operacional');
  });

  test('cuenta 5.01.01.001 → grupo_er Costo Operacional (Contec, prefijo 5)', () => {
    const result = buildMovimientosEr(erTemp, new Map(), 6, 2026, 'contec');
    const costo = result.find(r => r.codigo === '5.01.01.001');
    expect(costo).toBeDefined();
    expect(costo.grupo_er).toBe('Costo Operacional');
  });

  // CORRECT_BEHAVIOR: er_mensual tiene prioridad sobre er_temp para real del mes
  test('real_mes viene de er_mensual cuando está disponible', () => {
    const result = buildMovimientosEr(erTemp, erMensual, 6, 2026, 'contec');
    const ingreso = result.find(r => r.codigo === '4.01.01.001');
    expect(ingreso).toBeDefined();
    // Mes 6: er_mensual tiene real=142_000
    expect(ingreso.real_mes).toBeCloseTo(142_000, 2);
  });

  // CORRECT_BEHAVIOR: real_ytd = suma de meses 1 a 6
  test('real_ytd = suma meses 1-6 desde er_mensual', () => {
    const result = buildMovimientosEr(erTemp, erMensual, 6, 2026, 'contec');
    const ingreso = result.find(r => r.codigo === '4.01.01.001');
    const esperado = 138_000 + 142_000 + 148_000 + 137_000 + 143_000 + 142_000; // = 850_000
    expect(ingreso.real_ytd).toBeCloseTo(esperado, 2);
  });

  // CORRECT_BEHAVIOR: estructura de cada registro
  test('cada registro tiene los campos requeridos', () => {
    const result = buildMovimientosEr(erTemp, erMensual, 6, 2026, 'contec');
    const campos = ['codigo', 'nombre', 'nombre_origen', 'sistema', 'grupo_er',
                    'real_mes', 'real_ytd', 'ppto_mes', 'ppto_ytd',
                    'real_temporada', 'ppto_temporada'];
    for (const r of result) {
      for (const campo of campos) {
        expect(r).toHaveProperty(campo);
      }
    }
  });

  test('campo sistema = "contec"', () => {
    const result = buildMovimientosEr(erTemp, erMensual, 6, 2026, 'contec');
    for (const r of result) {
      expect(r.sistema).toBe('contec');
    }
  });
});

// ── buildMovimientosEr — Megasystem ───────────────────────────────────────────

describe('buildMovimientosEr — Megasystem', () => {
  const erTemp    = FriskuMegasystem.ER_TEMP_MAP;
  const erMensual = FriskuMegasystem.ER_MENSUAL_MAP;

  // CORRECT_BEHAVIOR (main): buildMovimientosEr usa clasificarGrupoErMegasystem para
  // sistema=megasystem, que busca nombreGrupo del fixture. Sin nombreGrupo, el fallback
  // usa primer dígito del código según convención Megasystem: 3→Ingreso Operacional.
  test('3101001 Megasystem sin nombreGrupo → Ingreso Operacional (fallback por código)', () => {
    const result = buildMovimientosEr(erTemp, erMensual, 6, 2026, 'megasystem');
    const ingreso = result.find(r => r.codigo === '3101001');
    expect(ingreso).toBeDefined();
    expect(ingreso.grupo_er).toBe('Ingreso Operacional');
  });

  // EXPECTED_TO_CHANGE: cuando los fixtures incluyan nombreGrupo real del Excel Megasystem,
  // la clasificación usará nombreGrupo y podría cambiar vs. el fallback.
  test('4101001 Megasystem sin nombreGrupo → Gasto Operacional (fallback: 4→gastos en Megasystem)', () => {
    const result = buildMovimientosEr(erTemp, erMensual, 6, 2026, 'megasystem');
    const costo = result.find(r => r.codigo === '4101001');
    expect(costo).toBeDefined();
    expect(costo.grupo_er).toBe('Gasto Operacional');
  });

  // CORRECT_BEHAVIOR: los valores numéricos se calculan correctamente
  test('real_ytd de 4101001 Megasystem suma meses 1-6 de er_mensual', () => {
    const result = buildMovimientosEr(erTemp, erMensual, 6, 2026, 'megasystem');
    const costo = result.find(r => r.codigo === '4101001');
    const esperado = 187_000 + 195_000 + 200_000 + 210_000 + 185_000 + 145_398.36;
    expect(costo.real_ytd).toBeCloseTo(esperado, 2);
  });

  // CORRECT_BEHAVIOR: temporada junio = meses 7-12 del año anterior + 1-6 del año actual
  test('real_temporada incluye meses Jul-Jun (temporada completa a jun)', () => {
    const result = buildMovimientosEr(erTemp, new Map(), 6, 2026, 'megasystem');
    const ingreso = result.find(r => r.codigo === '3101001');
    // er_temp tiene meses '7','8','1','2','3','4','5','6'
    const esperado = 70_000 + 80_000 + 65_000 + 72_000 + 78_000 + 82_000 + 80_000 + 75_000;
    expect(ingreso.real_temporada).toBeCloseTo(esperado, 2);
  });

  test('campo sistema = "megasystem"', () => {
    const result = buildMovimientosEr(erTemp, erMensual, 6, 2026, 'megasystem');
    for (const r of result) {
      expect(r.sistema).toBe('megasystem');
    }
  });
});

// ── Baseline de seguridad ─────────────────────────────────────────────────────

describe('Baseline de seguridad — nunca retornar undefined', () => {
  test('buildSaldosEsf con lista vacía → array vacío (no undefined, no null)', () => {
    const result = buildSaldosEsf([], []);
    expect(result).not.toBeNull();
    expect(result).not.toBeUndefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  test('buildMovimientosEr con Maps vacíos → array vacío', () => {
    const result = buildMovimientosEr(new Map(), new Map(), 6, 2026, 'contec');
    expect(result).not.toBeNull();
    expect(result).not.toBeUndefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  test('calcTemporada nunca retorna undefined', () => {
    expect(calcTemporada(6, 2026)).not.toBeUndefined();
    expect(calcTemporada(7, 2026)).not.toBeUndefined();
  });

  test('cada campo del registro ESF existe (no undefined)', () => {
    const result = buildSaldosEsf(AllegriaCon.ESF, []);
    for (const c of result) {
      expect(c.codigo).not.toBeUndefined();
      expect(c.saldo_neto).not.toBeUndefined();
      expect(c.es_material).not.toBeUndefined();
    }
  });
});

// ── Cobertura multiempresa (matriz) ──────────────────────────────────────────
//
// Estado de certificación por empresa (Fase 0):
//
//   Empresa              ERP         Evidencia propia  Fixture propio  Cobertura
//   ─────────────────────────────────────────────────────────────────────────────
//   Allegria Service   Contec       NO (datos sinté)   SÍ (Contec)    PARCIAL*
//   Allegria Foods     Contec       NO                 NO             PENDIENTE†
//   Frisku Foods       Megasystem   NO (datos sinté)   SÍ (Mega)      PARCIAL*
//   Mediterra Holding  Megasystem   —                  NO             PENDIENTE
//   Osiris Plant Mgmt  Megasystem   —                  NO             PENDIENTE
//   Integrity Farms    Megasystem   —                  NO             PENDIENTE
//   Allpa Farms Chile  Megasystem   —                  NO             PENDIENTE
//   Allpa Farms Perú   Nisira       —                  NO             BLOQUEADO‡
//   MESAIN/Montejato   TBD          —                  NO             PENDIENTE
//
//   * PARCIAL: fixture propio con datos SINTÉTICOS; sin validación contra Excel fuente.
//   † Compartir ERP con Allegria Service NO certifica Allegria Foods: diferente entidad,
//     diferente plan de cuentas histórico, diferente cierre contable.
//   ‡ Nisira bloqueado: sin archivo Excel real disponible; no se puede testear.
//
// Regla: Compartir ERP no certifica una empresa. Cada entidad necesita fixture propio.

describe('Cobertura multiempresa — smoke tests', () => {
  test('calcTemporada: misma lógica para todas las empresas (sin sesgo por empresa)', () => {
    expect(calcTemporada(6, 2026)).toBe('2025-2026');
    expect(calcTemporada(7, 2026)).toBe('2026-2027');
  });

  // Allegria Service — cubierta con fixture Contec propio (datos sintéticos)
  test('buildSaldosEsf Contec: Allegria Service representada con fixture propio', () => {
    const result = buildSaldosEsf(AllegriaCon.ESF, []);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].sistema).toBe('contec');
    // fixture: allegria-contec-jun2026.js → Allegria SERVICE, no Foods
  });

  // Allegria Foods — PENDIENTE: sin fixture propio
  // No existe un test de buildSaldosEsf para Allegria Foods porque no hay fixture propio.
  // Compartir ERP con Allegria Service no certifica este empresa.
  // Se añadirá en Fase 1 cuando se cuente con datos reales de Allegria Foods.

  // Frisku Foods — cubierta con fixture Megasystem propio (datos sintéticos)
  test('buildSaldosEsf Megasystem: Frisku Foods representada con fixture propio', () => {
    const result = buildSaldosEsf(FriskuMegasystem.ESF, []);
    // Con el fix de main (primer dígito vs split), las cuentas 1xxx y 2xxx se incluyen
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].sistema).toBe('megasystem');
    // fixture: frisku-megasystem-jun2026.js → Frisku Foods
  });

  test('buildMovimientosEr Contec: Allegria Service representada', () => {
    const result = buildMovimientosEr(AllegriaCon.ER_TEMP_MAP, AllegriaCon.ER_MENSUAL_MAP, 6, 2026, 'contec');
    expect(result.length).toBeGreaterThan(0);
  });

  test('buildMovimientosEr Megasystem: Frisku Foods representada', () => {
    const result = buildMovimientosEr(FriskuMegasystem.ER_TEMP_MAP, FriskuMegasystem.ER_MENSUAL_MAP, 6, 2026, 'megasystem');
    expect(result.length).toBeGreaterThan(0);
  });
});
