/* eslint-disable */
// Presentación del capital en Créditos y formato chileno compartido. Solo presentación:
// las cifras se toman de creditos.js sin cambios.
import React from 'react';
import { render } from '@testing-library/react';
import { estadoCapital, textoCapital, NO_DETERMINABLE } from '../capitalVisible';
import { numCL, montoCL, usdCL, decimalesVista } from '../formatoCL';
import CeldaCapital from '../CeldaCapital';
import { saldosAlCorte, analisisCartera, valorizarCreditos } from '../creditos';
import { CREDITOS_PRUEBA, CORTE_PRUEBA, TC_PRUEBA } from '../reporteCreditos.datosPrueba';
import { NO_DETERMINABLE as ND_REPORTE } from '../reporteCreditos';

describe('formato chileno compartido', () => {
  test('miles con punto, decimales con coma; decimales por moneda', () => {
    expect(numCL(1234567.891, 2)).toBe('1.234.567,89');
    expect(montoCL(95000000, 'CLP')).toBe('CLP 95.000.000');
    expect(montoCL(500, 'UF')).toBe('UF 500,0000');
    expect(montoCL(256066.67, 'USD')).toBe('US$ 256.066,67');
    expect(usdCL(-1234.6)).toBe('-US$ 1.235');
    expect(usdCL(0)).toBe('US$ 0');
    expect(numCL(null)).toBe('—'); expect(montoCL('')).toBe('—');
    expect([decimalesVista('CLP'), decimalesVista('UF'), decimalesVista('EUR')]).toEqual([0, 4, 2]);
  });
});

describe('estado del capital', () => {
  test('cero real: calculado y confirmado → se muestra 0', () => {
    expect(estadoCapital({ capital: 0 })).toBe('determinado');
    expect(textoCapital({ capital: 0 }, usdCL)).toBe('US$ 0');
  });
  test('capital desconocido: sin capital identificado y con sin desglose → No determinable (nunca 0)', () => {
    expect(estadoCapital({ capital: 0, sinDesglose: 550000 })).toBe('no_determinable');
    expect(textoCapital({ capital: 0, sinDesglose: 550000 }, usdCL)).toBe(NO_DETERMINABLE);
    expect(ND_REPORTE).toBe(NO_DETERMINABLE);   // mismo texto en vistas y reportes
  });
  test('cartera mixta: capital conocido «parcial»; por conciliar o sin TC también lo dejan parcial', () => {
    expect(textoCapital({ capital: 174088.89, sinDesglose: 9178 }, usdCL)).toBe('US$ 174.089 (parcial)');
    expect(estadoCapital({ capital: 0, porConciliar: 9178 })).toBe('parcial');
    expect(estadoCapital({ capital: 10, sinTC: [{ moneda: 'PEN', monto: 300000 }] })).toBe('parcial');
    expect(estadoCapital({ capital: 10, sinTC: [{ moneda: 'PEN', monto: 0 }] })).toBe('determinado');
  });
});

describe('CeldaCapital: destaca lo que falta y NO lo suma', () => {
  test('mixto: número parcial + sin desglose, por conciliar y sin TC aparte', () => {
    const { container } = render(<CeldaCapital capital={174088.89} sinDesglose={9178} porConciliar={9178} sinTC={[{ moneda: 'PEN', monto: 300000 }]} fmt={usdCL}/>);
    const t = container.textContent;
    expect(container.firstChild.getAttribute('data-estado-capital')).toBe('parcial');
    expect(t).toContain('US$ 174.089 (parcial)');
    expect(t).toContain('sin desglose US$ 9.178 · no sumado');
    expect(t).toContain('por conciliar US$ 9.178 · no sumado');
    expect(t).toContain('sin TC PEN 300.000,00 · no sumado');
    expect(t).not.toContain('192.445');   // 174.089 + 9.178 + 9.178 nunca aparece
  });
  test('desconocido y cero real', () => {
    expect(render(<CeldaCapital capital={0} sinDesglose={550000} fmt={usdCL}/>).container.textContent).toContain(NO_DETERMINABLE);
    const z = render(<CeldaCapital capital={0} fmt={usdCL}/>).container;
    expect(z.textContent).toBe('US$ 0'); expect(z.firstChild.getAttribute('data-estado-capital')).toBe('determinado');
  });
  test('extras=false: solo el estado (la tabla ya muestra los importes al lado)', () => {
    expect(render(<CeldaCapital capital={5} sinDesglose={9} fmt={usdCL} extras={false}/>).container.textContent).toBe('US$ 5 (parcial)');
  });
});

describe('datos ficticios: los tres casos salen del cálculo vigente', () => {
  const s = saldosAlCorte(valorizarCreditos(CREDITOS_PRUEBA, TC_PRUEBA, CORTE_PRUEBA), CORTE_PRUEBA, CORTE_PRUEBA);
  test('Mediterra USD (B3 sin desglose + B4 por conciliar) → capital desconocido; Osiris → mixto; Allpa Farms → determinado', () => {
    const an = analisisCartera(valorizarCreditos(CREDITOS_PRUEBA, TC_PRUEBA, CORTE_PRUEBA), CORTE_PRUEBA).porEmpresa;
    const est = (x) => estadoCapital({ capital: x.saldoCapital, sinDesglose: x.sinDesglose, porConciliar: x.porConciliar });
    expect(est(an['Osiris'])).toBe('parcial');
    expect(est(an['Allpa Farms'])).toBe('determinado');
    // Mediterra: el UF (F) da capital conocido; por empresa queda mixto (UF conocido + B3 sin desglose)
    expect(est(an['Mediterra'])).toBe('parcial');
    expect(s.porEmpresa['Mediterra'].sinClasificar).toBeGreaterThan(0);
  });
});
