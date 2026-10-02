/* ─────────────────────────────────────────────────────────────────────────
   E2E — Abrir la nueva versión con registros ANTIGUOS no los modifica.

   Siembra (Supabase falso, producción no se toca) créditos con el formato
   histórico: la lista CREDITOS_DEFAULT tal como está en el código (sin uid,
   con `n` repetidos) más variantes reales: `pagado:true` sin registro,
   "Cuotas Mensuales" con f_inicio, una renovación, un crédito de socio y un
   valor manual antiguo en Pago Préstamos con la clave vieja (solo etiqueta).
   No hay creditos_config ni creditos_saldos_informados (claves nuevas).

   Recorre la app SIN hacer ninguna acción: Créditos (5 pestañas), Flujo
   Empresas de varias empresas, Consolidado y Nóminas, esperando el
   auto-guardado. Comprueba que lo guardado de Créditos es idéntico byte a
   byte a lo sembrado, que no aparecen claves nuevas y que el valor manual
   antiguo y las nóminas siguen iguales.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { nuevoStore, leerFila } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, irAFlujoEmpresas, elegirEmpresa, subTab } from './lib.mjs';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(OUT, { recursive: true });
let fallos = 0;
const check = (n, c, x = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fallos++; };

// CREDITOS_DEFAULT literal del código (formato histórico, sin uid)
const src = fs.readFileSync(new URL('../../src/FinanzasModule.jsx', import.meta.url), 'utf8');
const lit = /const CREDITOS_DEFAULT = (\[[\s\S]*?\n\]);/.exec(src)[1];
const base = Function(`return ${lit}`)();
const antiguos = [
  ...base,
  // pagado:true antiguo (sin registro de pago)
  { n: 3, empresa: 'Osiris', acreedor: 'Banco Antiguo', tipo_inst: 'Banco', monto: 40000, f_venc: '2026-05-15', tipo_cr: 'Bullet', tasa: '9%', cuota: 40000, pagado: true },
  // cuotas mensuales con f_inicio
  { n: 40, empresa: 'Osiris', acreedor: 'Banco Security', tipo_inst: 'Banco', monto: 110000, cuota: 9178, f_inicio: '2026-01-31', f_venc: '2026-12-31', tipo_cr: 'Cuotas Mensuales', pagado: false },
  // renovación
  { n: 41, empresa: 'Mediterra', acreedor: 'Banco Renov', tipo_inst: 'Banco', monto: 300000, cuota: 300000, f_venc: '2026-06-30', tipo_cr: 'Bullet', tasa: '8%', pagado: false,
    renovable: true, renovaciones: [{ monto: 300000, mes_ingreso: 'Jun', anio_ingreso: '2026', tasa_anual: 8, cuotas: [{ tipo: 'Interés', mes: 'Dic', anio: '2026' }, { tipo: 'Capital', mes: 'Jun', anio: '2027' }] }] },
  // socio
  { n: 42, empresa: 'Mediterra', acreedor: 'Socio Demo', tipo_credito: 'socio', tipo_inst: 'Socio', monto: 100000, tasa_efectiva_anual: 10, fecha_desembolso: '2026-01-15',
    cuotas_socio: [{ fecha: '2026-07-15', monto: 50000 }, { fecha: '2027-01-15', monto: 60000 }], pagado: false },
];
const realAntiguo = { Osiris: { _proyOverrides: { 'Pago Préstamos - Total': { '6': 55000 } } } };

const store = nuevoStore();
store.finanzas.value.creditos_data = JSON.parse(JSON.stringify(antiguos));
store.finanzas.value.finanzas_real = JSON.parse(JSON.stringify(realAntiguo));
const nominasAntes = JSON.stringify({ nominas: [{ id: 'N1', empresa: 'Osiris', semana: 30, año: 2026, numero: 1, fecha: '2026-07-20', tc: 950, estado: 'aprobada',
  preparadoPor: 'x', aprobadoPor: 'Angelo Huerta', items: [{ id: 'I1', seccion: 'pagos_usd', proveedor: 'Banco Antiguo', concepto: 'Cuota', montoUSD: 40000, montoCLP: 0, montoPEN: 0,
  estadoLinea: 'activa', historial: [], documentos: [] }], bancos: {}, notas: '', seccionesExtra: [], estadoNomina: 'activa', historial: [] }] });
store.nominas_v2_done = { value: JSON.stringify({ migrado: true }), updated_at: new Date(Date.now() - 40000).toISOString() };
store.nominas_osiris = { value: nominasAntes, updated_at: new Date(Date.now() - 39000).toISOString() };
const credAntes = JSON.stringify(store.finanzas.value.creditos_data);
const realAntes = JSON.stringify(store.finanzas.value.finanzas_real);
const clavesAntes = Object.keys(store.finanzas.value).sort();

const escrituras = [];
const { browser, page } = await abrirApp(store, { log: (m) => { if (!/^GET/.test(m)) escrituras.push(m); } });
const errores = []; page.on('pageerror', e => errores.push(String(e)));
await login(page);
await entrarFinanzas(page);
await page.waitForTimeout(2500);
await subTab(page, /💳 Créditos/); await page.waitForTimeout(1500);
for (const t of [/Conciliación/, /Análisis CFO/, /Simular prepago/, /Saldo por Mes/]) { await subTab(page, t); await page.waitForTimeout(1200); }
await page.screenshot({ path: path.join(OUT, 'apertura-saldo-por-mes.png') });
await irAFlujoEmpresas(page);
for (const e of ['Osiris', 'Mediterra', 'Allegria Foods']) { await elegirEmpresa(page, e); await page.waitForTimeout(1200); }
await page.getByRole('button', { name: /🏛 Consolidado/ }).first().click().catch(() => {}); await page.waitForTimeout(1500);
await subTab(page, /Nóminas/); await page.waitForTimeout(2000);
await page.waitForTimeout(3000);   // margen para el auto-guardado (800 ms)

const fin = leerFila(store, 'finanzas');
const escFin = escrituras.filter(m => / finanzas /.test(m + ' '));
console.log(`  escrituras durante la apertura: ${escrituras.length} (${[...new Set(escrituras)].join(' | ') || 'ninguna'})`);
check('Créditos guardados = sembrados, byte a byte (sin uid agregados, sin cambios de importes ni estados)', JSON.stringify(fin.creditos_data) === credAntes,
  `${(fin.creditos_data || []).filter(c => c.uid).length} con uid`);
check('No se agregaron las claves nuevas de Créditos (creditos_config, creditos_saldos_informados)', !('creditos_config' in fin) && !('creditos_saldos_informados' in fin));
const otras = Object.keys(fin).filter(k => !clavesAntes.includes(k));
if (otras.length) console.log(`  (otras claves que agrega el auto-guardado histórico de main, ajenas a Créditos: ${otras.join(', ')})`);
check('Valor manual antiguo de Pago Préstamos intacto (clave vieja, sin resolver)', JSON.stringify(fin.finanzas_real) === realAntes, JSON.stringify(fin.finanzas_real).slice(0, 200));
check('Ningún pago, conciliación, cobertura ni resolución creados sin acción', !(fin.creditos_data || []).some(c => (c.pagos || []).length || (c.conciliaciones || []).length)
  && !JSON.stringify(fin.finanzas_real).includes('_coberturasManual') && !JSON.stringify(fin.finanzas_real).includes('_resolucionesCreditos'));
check('Nóminas sin cambios', store.nominas_osiris.value === nominasAntes);
const pagadoTrue = (fin.creditos_data || []).find(c => c.acreedor === 'Banco Antiguo');
check('El crédito antiguo pagado:true sigue igual (no se "desmarca" ni se le inventa un pago)', pagadoTrue && pagadoTrue.pagado === true && !pagadoTrue.pagos);
check('Sin errores de JavaScript', errores.length === 0, errores.slice(0, 2).join(' | '));
await browser.close();
console.log(fallos ? `\n${fallos} FALLA(S)` : '\nApertura sin cambios OK');
process.exit(fallos ? 1 : 0);
