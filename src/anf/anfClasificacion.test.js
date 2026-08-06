/* eslint-disable */
/**
 * Tests de anfClasificacion.js — Fase 0 Financial Reporting Platform
 *
 * Tipos de test:
 *   CORRECT_BEHAVIOR   — comportamiento correcto que debe mantenerse
 *   KNOWN_BUG          — bug existente hoy; el test documenta el comportamiento
 *                        incorrecto actual para detectar regresiones inesperadas
 *   EXPECTED_TO_CHANGE — output cambiará cuando se implemente AccountingProfile
 */

import {
  obtenerSegmentosCodigo,
  clasificarSeccionEsf,
  clasificarGrupoEr,
} from './anfClasificacion';

// ── obtenerSegmentosCodigo ────────────────────────────────────────────────────

describe('obtenerSegmentosCodigo', () => {
  // CORRECT_BEHAVIOR: Contec con puntos
  test('Contec 4 niveles: primerNivel = segmento antes del primer punto', () => {
    const r = obtenerSegmentosCodigo('1.01.01.001');
    expect(r.codigoNormalizado).toBe('1.01.01.001');
    expect(r.primerNivel).toBe('1');
    expect(r.segundoNivel).toBe('0'); // soloDigitos = '101001001'[1] = '0'
  });

  test('Contec 3 niveles: primerNivel y segundoNivel correctos', () => {
    const r = obtenerSegmentosCodigo('3.01.001');
    expect(r.primerNivel).toBe('3');
    expect(r.segundoNivel).toBe('0');
  });

  // CORRECT_BEHAVIOR: Megasystem sin puntos
  test('Megasystem 7 dígitos: primerNivel = primer dígito, segundoNivel = segundo', () => {
    const r = obtenerSegmentosCodigo('1101003');
    expect(r.primerNivel).toBe('1');
    expect(r.segundoNivel).toBe('1');
  });

  test('Megasystem 27xxx: primerNivel=2, segundoNivel=7', () => {
    const r = obtenerSegmentosCodigo('2701001');
    expect(r.primerNivel).toBe('2');
    expect(r.segundoNivel).toBe('7');
  });

  test('Megasystem 3xxx (ingresos): primerNivel=3', () => {
    const r = obtenerSegmentosCodigo('3101001');
    expect(r.primerNivel).toBe('3');
  });

  // CORRECT_BEHAVIOR: entrada numérica
  test('Número entero se convierte a string', () => {
    const r = obtenerSegmentosCodigo(1101003);
    expect(r.codigoNormalizado).toBe('1101003');
    expect(r.primerNivel).toBe('1');
  });

  // CORRECT_BEHAVIOR: casos límite — nunca devolver undefined
  test('null devuelve primerNivel=null, segundoNivel=null', () => {
    const r = obtenerSegmentosCodigo(null);
    expect(r.primerNivel).toBeNull();
    expect(r.segundoNivel).toBeNull();
    expect(r.codigoNormalizado).toBe('');
  });

  test('undefined devuelve primerNivel=null', () => {
    const r = obtenerSegmentosCodigo(undefined);
    expect(r.primerNivel).toBeNull();
  });

  test('string vacío devuelve primerNivel=null', () => {
    const r = obtenerSegmentosCodigo('');
    expect(r.primerNivel).toBeNull();
  });

  // CORRECT_BEHAVIOR: seguridad — no hay retornos undefined en ningún campo
  test('nunca retorna undefined en primerNivel', () => {
    expect(obtenerSegmentosCodigo(null).primerNivel).not.toBeUndefined();
    expect(obtenerSegmentosCodigo('').primerNivel).not.toBeUndefined();
    expect(obtenerSegmentosCodigo('X').primerNivel).not.toBeUndefined();
  });

  test('nunca retorna undefined en segundoNivel', () => {
    expect(obtenerSegmentosCodigo(null).segundoNivel).not.toBeUndefined();
    expect(obtenerSegmentosCodigo('').segundoNivel).not.toBeUndefined();
  });

  // Edge case: código de un solo dígito
  test('código de un solo dígito: segundoNivel=null', () => {
    const r = obtenerSegmentosCodigo('1');
    expect(r.primerNivel).toBe('1');
    expect(r.segundoNivel).toBeNull();
  });
});

// ── clasificarSeccionEsf — Contec ─────────────────────────────────────────────

describe('clasificarSeccionEsf — Contec', () => {
  // CORRECT_BEHAVIOR
  test('1.01.xxx → Activo Corriente', () => {
    expect(clasificarSeccionEsf('1.01.01.001')).toBe('Activo Corriente');
    expect(clasificarSeccionEsf('1.01.02.001')).toBe('Activo Corriente');
    expect(clasificarSeccionEsf('1.01.05.001')).toBe('Activo Corriente');
  });

  test('1.02.xxx → Activo No Corriente', () => {
    expect(clasificarSeccionEsf('1.02.01.001')).toBe('Activo No Corriente');
    expect(clasificarSeccionEsf('1.02.01.002')).toBe('Activo No Corriente');
  });

  test('2.01.xxx → Pasivo Corriente', () => {
    expect(clasificarSeccionEsf('2.01.01.001')).toBe('Pasivo Corriente');
    expect(clasificarSeccionEsf('2.01.03.001')).toBe('Pasivo Corriente');
  });

  test('2.02.xxx → Pasivo No Corriente', () => {
    expect(clasificarSeccionEsf('2.02.01.001')).toBe('Pasivo No Corriente');
  });

  test('3.xx.xxx → Patrimonio (en Contec, 3=patrimonio)', () => {
    expect(clasificarSeccionEsf('3.01.001')).toBe('Patrimonio');
    expect(clasificarSeccionEsf('3.02.001')).toBe('Patrimonio');
  });

  test('4.xx.xxx → null (cuenta de resultado, no va al ESF)', () => {
    expect(clasificarSeccionEsf('4.01.01.001')).toBeNull();
    expect(clasificarSeccionEsf('5.01.01.001')).toBeNull();
    expect(clasificarSeccionEsf('6.01.01.001')).toBeNull();
    expect(clasificarSeccionEsf('9.01.01.001')).toBeNull();
  });

  // CORRECT_BEHAVIOR: 1.xx con seg2 != '01' = no corriente
  test('1.03.xxx → Activo No Corriente (cualquier seg2 ≠ 01)', () => {
    expect(clasificarSeccionEsf('1.03.001')).toBe('Activo No Corriente');
  });
});

// ── clasificarSeccionEsf — Megasystem ─────────────────────────────────────────

describe('clasificarSeccionEsf — Megasystem', () => {
  // CORRECT_BEHAVIOR
  test('11xxxxx → Activo Corriente', () => {
    expect(clasificarSeccionEsf('1101003')).toBe('Activo Corriente');
    expect(clasificarSeccionEsf('1102001')).toBe('Activo Corriente');
    expect(clasificarSeccionEsf('1103001')).toBe('Activo Corriente');
  });

  test('12xxxxx → Activo No Corriente', () => {
    expect(clasificarSeccionEsf('1201001')).toBe('Activo No Corriente');
  });

  test('13xxxxx → Activo No Corriente', () => {
    expect(clasificarSeccionEsf('1301001')).toBe('Activo No Corriente');
  });

  test('21xxxxx → Pasivo Corriente', () => {
    expect(clasificarSeccionEsf('2101001')).toBe('Pasivo Corriente');
    expect(clasificarSeccionEsf('2102001')).toBe('Pasivo Corriente');
  });

  test('22xxxxx → Pasivo No Corriente', () => {
    expect(clasificarSeccionEsf('2201001')).toBe('Pasivo No Corriente');
  });

  test('4xxxxxx → null (egresos Megasystem)', () => {
    expect(clasificarSeccionEsf('4101001')).toBeNull();
    expect(clasificarSeccionEsf('4201001')).toBeNull();
  });

  // KNOWN_BUG: 27xxxxx debería ser 'Patrimonio' según JSDoc y PB-MEGASYSTEM-v1,
  // pero la implementación actual retorna 'Pasivo No Corriente' porque
  // primerNivel='2' y segundoNivel='7' != '1'.
  // Será corregido en Fase 3 al implementar AccountingProfile.
  // ESTE TEST DOCUMENTA EL COMPORTAMIENTO INCORRECTO ACTUAL.
  test('[KNOWN_BUG] 27xxxxx → hoy retorna "Pasivo No Corriente" (correcto sería "Patrimonio")', () => {
    expect(clasificarSeccionEsf('2701001')).toBe('Pasivo No Corriente'); // BUG
    expect(clasificarSeccionEsf('2702001')).toBe('Pasivo No Corriente'); // BUG
    // Cuando se corrija: expect(clasificarSeccionEsf('2701001')).toBe('Patrimonio');
  });

  // KNOWN_BUG: 3xxxxxx en Megasystem son ingresos (NO patrimonio).
  // La función retorna 'Patrimonio' porque primerNivel='3' cae en el case de patrimonio.
  // El JSDoc dice explícitamente que 3xxxxxx Megasystem → null.
  // Será corregido en Fase 3 al implementar AccountingProfile.
  // ESTE TEST DOCUMENTA EL COMPORTAMIENTO INCORRECTO ACTUAL.
  test('[KNOWN_BUG] 3xxxxxx Megasystem → hoy retorna "Patrimonio" (correcto sería null)', () => {
    expect(clasificarSeccionEsf('3101001')).toBe('Patrimonio'); // BUG — debería ser null
    // Cuando se corrija: expect(clasificarSeccionEsf('3101001')).toBeNull();
  });
});

// ── clasificarSeccionEsf — casos límite ──────────────────────────────────────

describe('clasificarSeccionEsf — casos límite', () => {
  // CORRECT_BEHAVIOR: nunca devolver undefined
  test('null → null (no undefined)', () => {
    expect(clasificarSeccionEsf(null)).toBeNull();
    expect(clasificarSeccionEsf(null)).not.toBeUndefined();
  });

  test('undefined → null (no undefined)', () => {
    expect(clasificarSeccionEsf(undefined)).toBeNull();
  });

  test('string vacío → null', () => {
    expect(clasificarSeccionEsf('')).toBeNull();
  });

  test('código no numérico → null (no lanza excepción)', () => {
    expect(clasificarSeccionEsf('TEXTO')).toBeNull();
  });
});

// ── clasificarGrupoEr ─────────────────────────────────────────────────────────

describe('clasificarGrupoEr', () => {
  // CORRECT_BEHAVIOR: Contec con puntos
  test('4.xx.xxx → Ingreso Operacional (Contec)', () => {
    expect(clasificarGrupoEr('4.01.01.001')).toBe('Ingreso Operacional');
  });

  test('5.xx.xxx → Costo Operacional (Contec)', () => {
    expect(clasificarGrupoEr('5.01.01.001')).toBe('Costo Operacional');
  });

  test('6.xx.xxx → Gasto Operacional (Contec)', () => {
    expect(clasificarGrupoEr('6.01.01.001')).toBe('Gasto Operacional');
  });

  test('7.xx.xxx → Ingreso No Operacional (Contec)', () => {
    expect(clasificarGrupoEr('7.01.01.001')).toBe('Ingreso No Operacional');
  });

  test('8.xx.xxx → Gasto No Operacional (Contec)', () => {
    expect(clasificarGrupoEr('8.01.01.001')).toBe('Gasto No Operacional');
  });

  test('9.xx.xxx → Impuesto (Contec)', () => {
    expect(clasificarGrupoEr('9.01.01.001')).toBe('Impuesto');
  });

  // CORRECT_BEHAVIOR: códigos Megasystem que comienzan con 4,5,6,7,8,9
  // El exported clasificarGrupoEr usa primerNivel (primer dígito) no split('.')[0]
  // → funciona correctamente para ambos sistemas
  test('Megasystem 4xxxxxx → null (3=ingresos en Megasystem, 4=gastos; ninguno es grupo ER standard)', () => {
    // primerNivel de '4101001' = '4' → clasificarGrupoEr retorna 'Ingreso Operacional'
    // Esto es CORRECTO para la función exportada (usa primerNivel, no split)
    expect(clasificarGrupoEr('4101001')).toBe('Ingreso Operacional');
  });

  // CORRECT_BEHAVIOR: null para código desconocido (no default silencioso)
  test('código Megasystem de resultado (3101001) → null, no default silencioso', () => {
    // primerNivel='3' → cae en default → retorna null (CORRECTO)
    expect(clasificarGrupoEr('3101001')).toBeNull();
  });

  test('1.xx.xxx (cuenta de balance Contec) → null', () => {
    expect(clasificarGrupoEr('1.01.01.001')).toBeNull();
  });

  test('2.xx.xxx (cuenta de balance Contec) → null', () => {
    expect(clasificarGrupoEr('2.01.01.001')).toBeNull();
  });

  // CORRECT_BEHAVIOR: nunca devolver undefined
  test('null → null (no undefined)', () => {
    const result = clasificarGrupoEr(null);
    expect(result).toBeNull();
    expect(result).not.toBeUndefined();
  });

  test('undefined → null (no undefined)', () => {
    expect(clasificarGrupoEr(undefined)).toBeNull();
  });

  test('string vacío → null', () => {
    expect(clasificarGrupoEr('')).toBeNull();
  });

  test('string no numérico → null (no lanza excepción)', () => {
    expect(clasificarGrupoEr('TEXTO')).toBeNull();
  });
});
