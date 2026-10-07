/* Juego de datos FIJO para comparar builds (antes/después) y probar la política de TC.
   Saldos HISTÓRICOS (guardados sin política) + filas de maestro_tc. Datos ficticios. */
import { nuevoStore } from './fake.mjs';

// Juego de datos: saldos HISTÓRICOS (sin política de TC) + maestro_tc.
export function juegoDeDatos() {
  const store = nuevoStore();
  Object.assign(store.finanzas_bancos.value.saldos, {
    'Allegria Foods||BICE||clp':      { monto: 95000000, fecha: '2026-09-15', moneda: 'clp', usd: null },     // guardado sin TC
    'Allegria Service||Santander||clp': { monto: 50000000, fecha: '2026-09-15', moneda: 'clp', usd: 52083.33 }, // TC histórico 960
    'Mediterra||Santander||eur':      { monto: 50000, fecha: '2026-09-15', moneda: 'eur', usd: 0 },           // fuente sin EUR
    'Allpa Farms Perú||BCP||pen':     { monto: 380000, fecha: '2026-09-15', moneda: 'pen', usd: 101333.33 },  // TC histórico 3,75
  });
  store.maestro_tc = { value: {
    'USD-CLP': [{ fecha: '2026-09-15', valor: 925.40, fuente: 'mindicador' }, { fecha: '2026-10-06', valor: 940.12, fuente: 'mindicador' }],
    'EUR-USD': [{ fecha: '2026-09-15', valor: 1.085, fuente: 'frankfurter' }],
    'USD-PEN': [{ fecha: '2026-09-14', valor: 3.75, fuente: 'manual' }],
  }, updated_at: new Date(Date.now() - 44000).toISOString() };
  return store;
}

