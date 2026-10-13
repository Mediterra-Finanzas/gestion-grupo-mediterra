/* eslint-disable */
// Un solo rótulo de TC en Créditos: pantalla (FinanzasModule → valorTC) y Reportes.
import { valorTC } from '../FinanzasModule';
import { fmtTC, rotuloTC, decimalesTC, numeroTC } from '../rotuloTC';
import { infoTC, valorizarCreditos } from '../creditos';
import { construirReporte, tablasReporte } from '../reporteCreditos';
import { CREDITOS_PRUEBA, CORTE_PRUEBA, TC_PRUEBA } from '../reporteCreditos.datosPrueba';

const sinSep = (s) => s;   // pantalla y reporte usan el mismo formato chileno
const t = tablasReporte(construirReporte(CREDITOS_PRUEBA, {}, { corte: CORTE_PRUEBA, tcData: TC_PRUEBA }));
const uf = infoTC({ moneda: 'UF' }, TC_PRUEBA, CORTE_PRUEBA);

describe('rótulo del TC', () => {
  test('8 cifras significativas desde el valor exacto, sin ceros de relleno', () => {
    expect(fmtTC(955 / 40131.84)).toBe('0,023796567');
    expect(fmtTC(955)).toBe('955,00'); expect(fmtTC(0.85)).toBe('0,85');
    expect(decimalesTC(955 / 40131.84)).toBe(9);
    // la división con el TC mostrado da el mismo US$ que el cálculo
    expect(Math.round(500 / numeroTC(955 / 40131.84) * 100) / 100).toBe(Math.round(500 * uf.factor * 100) / 100);
    // con el rótulo anterior (6 decimales) no cuadraba
    expect(Math.round(500 / 0.023797 * 100) / 100).not.toBe(Math.round(500 * uf.factor * 100) / 100);
  });
  test('UF en la pantalla de Créditos: valor, unidad y división en el sentido correcto', () => {
    const txt = valorTC(uf);
    expect(txt).toBe('0,023796567 UF por 1 US$ = 955,00 CLP por 1 US$ ÷ 40.131,84 CLP por 1 UF (UF del 09/10/2026, mindicador; US$ del 10/10/2026, manual)');
    expect(txt).not.toMatch(/UF [\d,.]+ CLP .*\/ US\$/);       // el rótulo anterior escribía la división invertida
  });
  test('pantalla de Créditos y Reportes muestran el MISMO TC (UF, CLP y EUR declarado)', () => {
    ['UF', 'CLP', 'EUR'].forEach(m => {
      const c = CREDITOS_PRUEBA.find(x => x.moneda === m);
      const pantalla = valorTC(infoTC(c, TC_PRUEBA, CORTE_PRUEBA));
      const reporte = t.tcUsados.find(x => x.moneda === m);
      expect(sinSep(pantalla.split(' = ')[0])).toBe(sinSep(`${reporte.tcTexto} ${reporte.unidad}`));
      const fila = t.creditos.filas.find(f => f.tipo === 'dato' && f.celdas.moneda === m).celdas.tcTxt;
      expect(sinSep(fila.split(' · ')[0].split(' = ')[0])).toBe(sinSep(pantalla.split(' = ')[0]));
    });
  });
  test('el resumen de valorización (sin factor, con pares UF) da el mismo rótulo', () => {
    const vc = valorizarCreditos(CREDITOS_PRUEBA.filter(c => c.moneda === 'UF'), TC_PRUEBA, CORTE_PRUEBA);
    const v = { moneda: 'UF', tc: uf.tc, ufCLP: 40131.84, ufFecha: '2026-10-09', ufFuente: 'mindicador', usdCLP: 955 };
    expect(valorTC(v).split(' = ')[0]).toBe(valorTC(uf).split(' = ')[0]);
    expect(vc[0]._tc.tc).toBe(0.023797);   // creditos.js no cambia: sigue guardando el redondeo a 6 decimales
  });
});
