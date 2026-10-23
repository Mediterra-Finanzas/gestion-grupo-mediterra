// Pantallas de Créditos con renovaciones: KPI, lista, detalle, Análisis CFO y Saldo por Mes
// muestran la MISMA deuda vigente que el informe (fuente única: estadoCreditoAlCorte /
// saldosAlCorte en creditos.js). Controla los sitios de llamada de la pantalla, no la función.
import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { Creditos, CreditoDetalleModal, textosAvisosCreditos } from '../FinanzasModule.jsx';
import { flujoCreditosEmpresa } from '../creditos.js';
import fs from 'fs';
import path from 'path';
import { informeDeuda } from '../informeDeuda.js';

// Reloj fijo: 22-10-2026 (la renovación rige el 31-12-2026, todavía no).
beforeAll(() => { jest.useFakeTimers('modern'); jest.setSystemTime(new Date('2026-10-22T12:00:00')); });
afterAll(() => { jest.useRealTimers(); });
afterEach(() => { cleanup(); });

const cq = (pares) => pares.map(([tipo, mes, anio]) => ({ tipo, mes, anio }));
// 1.000.000 + 45.000 al 27-12-2026; pago y nuevo de 1.000.000 previsto para dic-26 (sin fecha de desembolso aún).
const bci = { uid: 'osb', n: 1, empresa: 'Osiris', acreedor: 'BCI', tipo_inst: 'Banco', tipo_cr: 'Bullet', moneda: 'USD', monto: 1000000, f_inicio: '2026-06-27', f_venc: '2026-12-27',
  cuota: 1045000, control_desde: '2026-06-27', renovable: true, desglose: { capital: 1000000, interes: 45000, cargos: 0 },
  renovaciones: [{ monto: 1000000, tasa_anual: 9, modalidad: 'pago_y_nuevo', confirmada: true, mes_ingreso: 'Dic', anio_ingreso: 2026, cuotas: cq([['Solo Interés', 'Jun', 2027], ['Capital+Interés', 'Dic', 2029]]) }] };
// Mismo crédito con una renovación antigua (sin modalidad): por revisar.
const bciA = { ...bci, renovaciones: [{ monto: 1000000, mes_ingreso: 'Dic', anio_ingreso: 2026, tasa_anual: 9, cuotas: cq([['Solo Interés', 'Jun', 2027], ['Capital+Interés', 'Dic', 2029]]) }] };
const props = { empresas: { Osiris: {} }, creditosData: [bci], empresasPermitidas: ['Osiris'], canEdit: false, usuario: 'Admin', tcData: {} };
const kpi = (label) => screen.getAllByText((t, el) => el && el.textContent === label && el.children.length === 0)[0].nextSibling.textContent;
const enFecha = (iso, fn) => { jest.setSystemTime(new Date(`${iso}T12:00:00`)); try { fn(); } finally { jest.setSystemTime(new Date('2026-10-22T12:00:00')); } };
const filasSaldo = (container) => { const filas = [...container.querySelectorAll('tbody tr')]; return (lbl) => filas.find(tr => tr.querySelector('td').textContent.startsWith(lbl)); };
const total = (tr) => tr.querySelectorAll('td')[2].textContent;          // Corte · Osiris · Total capital

test('el informe es la referencia: 1.000.000 vigente y 1.000.000 de renovación aparte', () => {
  const f = informeDeuda([bci], '2026-10-22').filas[0];
  expect(f.capital).toBe(1000000);
  expect(f.proyeccion.capital).toBe(1000000);
  expect(f.vencimientoFinal).toBe('2026-12-27');
});

test('KPI y lista de Créditos: saldo vigente 1.000.000, renovación aparte', () => {
  const { container } = render(<Creditos {...props} />);
  expect(kpi('Saldo capital identificado (USD)')).toBe('$1,000,000');
  expect(container.textContent).not.toContain('$2,000,000');
  expect(container.querySelector('[data-aviso-renovaciones]').textContent).toContain('Renovaciones que aún no rigen');
  const fila = container.querySelector('[data-proy-renov]');
  expect(fila.textContent).toContain('renovación aún no vigente');
  // Vencimiento de la lista = vencimiento vigente, no el de la renovación (2029).
  expect(container.textContent).toContain('27/12/2026');
});

test('Análisis CFO: saldo vigente 1.000.000 y la renovación aparte', () => {
  const { container } = render(<Creditos {...props} />);
  fireEvent.click(screen.getByRole('button', { name: /Análisis CFO/ }));
  expect(kpi('Saldo capital identificado (USD)')).toBe('$1,000,000');
  expect(container.querySelector('[data-aviso-renovaciones]').textContent).toContain('$1,000,000');
});

test('Saldo por Mes: hoy (real) y nov-26 (proyectado) en 1.000 K con la renovación aparte; dic-26 proyecta el pago y nuevo; nunca 2.000 K', () => {
  const { container } = render(<Creditos {...props} />);
  fireEvent.click(screen.getByRole('button', { name: /Saldo por Mes/ }));
  const fila = filasSaldo(container);
  const aparte = (tr) => tr.querySelector('[data-proy-mes]').textContent;
  expect(total(fila('Hoy'))).toBe('US$ 1.000 K');
  expect(fila('Hoy').querySelector('[data-tipo-saldo]').textContent).toBe('real al corte');
  expect(aparte(fila('Hoy'))).toContain('US$ 1.000 K');
  expect(total(fila('Nov-26'))).toBe('US$ 1.000 K');
  expect(fila('Nov-26').querySelector('[data-tipo-saldo]').textContent).toBe('proyectado');
  expect(aparte(fila('Nov-26'))).toContain('US$ 1.000 K');
  expect(total(fila('Dic-26'))).toBe('US$ 1.000 K');
  expect(aparte(fila('Dic-26'))).toBe('—');
  expect(container.textContent).not.toContain('US$ 2.000 K');
});

test('Renovación antigua (por revisar), vista el 15-01-2027: la deuda anterior sigue vencida en KPI y en Saldo por Mes (no aparece 0)', () => {
  enFecha('2027-01-15', () => {
    const { container } = render(<Creditos {...props} creditosData={[bciA]} />);
    expect(kpi('Saldo capital identificado (USD)')).toBe('$1,000,000');
    expect(kpi('Vencido impago confirmado')).toBe('$1,045,000');
    expect(container.querySelector('[data-aviso-renovaciones]').textContent).toContain('Renovaciones por revisar');
    expect(container.querySelector('[data-rev-renov]').textContent).toContain('renovación por revisar');
    fireEvent.click(screen.getByRole('button', { name: /Saldo por Mes/ }));
    const fila = filasSaldo(container);
    expect(total(fila('Hoy'))).toBe('US$ 1.000 K');
    expect(fila('Hoy').querySelector('[data-vencido-mes]').textContent).toBe('US$ 1.000 K');
    expect(total(fila('Feb-27'))).toBe('US$ 1.000 K');
    expect(fila('Feb-27').querySelector('[data-vencido-mes]').textContent).toBe('US$ 1.000 K');
    expect(fila('Feb-27').querySelector('[data-proy-mes]').textContent).toContain('por revisar');
  });
});

test('Pago registrado con fecha futura: no reduce el KPI de hoy y se informa aparte', () => {
  const c = { uid: 'fu', n: 2, empresa: 'Osiris', acreedor: 'X', tipo_inst: 'Banco', tipo_cr: 'Bullet', moneda: 'USD', monto: 120000, f_inicio: '2026-06-01', f_venc: '2026-12-15', cuota: 125000,
    control_desde: '2026-06-01', desglose: { capital: 120000, interes: 5000, cargos: 0 }, pagos: [{ id: 'pf', vencKey: 'fu@2026-12-15', fecha: '2026-11-05', capital: 5000 }] };
  const { container } = render(<Creditos {...props} creditosData={[c]} />);
  expect(kpi('Saldo capital identificado (USD)')).toBe('$120,000');
  expect(container.querySelector('[data-pagos-futuros]').textContent).toContain('$5,000');
});

test('Detalle del crédito: indicadores vigentes y la renovación como proyección', () => {
  const { container } = render(<CreditoDetalleModal credito={bci} onClose={() => {}} onSave={() => {}} canEdit={false} usuario="Admin" />);
  expect(kpi('Saldo capital')).toBe('$1,000,000.00');
  expect(container.querySelector('[data-detalle-renovaciones]').textContent).toContain('Renovación que aún no rige');
  expect(container.textContent).toContain('renovación aún no vigente hasta');
});

test('Detalle: la etiqueta de estado usa la deuda vigente (pago y nuevo recibido: no «Con vencidos»)', () => {
  enFecha('2027-01-15', () => {
    const c = { ...bci, pagos: [{ id: 'i', vencKey: 'osb@2026-12-27', fecha: '2026-12-27', interes: 45000 }],
      renovaciones: [{ monto: 1200000, tasa_anual: 9, modalidad: 'pago_y_nuevo', confirmada: true, mes_ingreso: 'Dic', anio_ingreso: 2026, recibido: { fecha: '2026-12-27' }, cuotas: cq([['Capital+Interés', 'Dic', 2029]]) }] };
    const { container } = render(<CreditoDetalleModal credito={c} onClose={() => {}} onSave={() => {}} canEdit={false} usuario="Admin" />);
    expect(kpi('Vencido impago')).toBe('$0.00');
    expect(container.textContent).not.toContain('Con vencidos');
    expect(container.textContent).toContain('Vigente');
  });
});

test('Flujo: los avisos dicen dónde quedan el pago programado y el refinanciamiento, y la pantalla del flujo los pasa', () => {
  const fut = { uid: 'fu', empresa: 'Osiris', acreedor: 'X', tipo_inst: 'Banco', tipo_cr: 'Bullet', moneda: 'USD', monto: 120000, f_inicio: '2026-06-01', f_venc: '2026-12-15', cuota: 125000,
    control_desde: '2026-06-01', desglose: { capital: 120000, interes: 5000, cargos: 0 }, pagos: [{ id: 'pf', vencKey: 'fu@2026-12-15', fecha: '2026-11-05', capital: 5000 }] };
  const doce = { uid: 'dz', tipo_credito: 'contrato', modalidad: 'manual', empresa: 'Osiris', acreedor: 'Naranjo', moneda: 'USD', monto: 1200000, fecha_desembolso: '2026-12-01', tasa_anual: 12, base: 'act360',
    control_desde: '2026-12-01', renovable: true, calendario_manual: Array.from({ length: 12 }, (_, i) => ({ fecha: `2027-${String(i + 1).padStart(2, '0')}-15`, capital: 100000, interes: 10000, cargos: 0 })),
    renovaciones: [{ monto: 900000, tasa_anual: 9, modalidad: 'pago_y_nuevo', confirmada: true, mes_ingreso: 'Mar', anio_ingreso: 2027, cuotas: cq([['Capital+Interés', 'Mar', 2029]]) }] };
  const fc = flujoCreditosEmpresa('Osiris', [fut, doce], { hoy: '2026-10-23' });
  const vacio = { arrastrados: [], estimados: [], fueraHorizonte: [], porConciliar: [], sinTC: [], tcAvisos: [], ovIgnorados: [], desembolsosPendientesVencidos: [], renovaciones: { antiguas: [], propuestas: [], incompletas: [], excesos: [], ingresosVencidos: [], anuladoConIngreso: [] } };
  const t = textosAvisosCreditos({ ...vacio, pagosProgramados: fc.pagosProgramados, refinanciamientos: fc.refinanciamientos }).join(' ');
  expect(t).toContain('pago(s) registrado(s) con fecha futura se proyectan en SU fecha');
  expect(t).toContain('X 05/11/2026 $5,000');
  expect(t).toContain('no es un pago efectivo');
  // Sitio de llamada real: el aviso del flujo de cada empresa pasa los dos campos nuevos.
  const src = fs.readFileSync(path.join(__dirname, '..', 'FinanzasModule.jsx'), 'utf8');
  expect(src).toMatch(/pagosProgramados:avisoCreditos\.pagosProgramados\|\|\[\], refinanciamientos:avisoCreditos\.refinanciamientos\|\|\[\]/);
  expect(src).toMatch(/pagosProgramados: fc\.pagosProgramados \|\| \[\], refinanciamientos: fc\.refinanciamientos \|\| \[\]/);
});

test('Pagos de cuota: las dos pantallas registran por la función que rechaza el exceso (sitio de llamada real)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'FinanzasModule.jsx'), 'utf8');
  // Formulario manual del detalle y pago desde Nómina: ambos pasan por registrarPagoIdempotente.
  expect((src.match(/registrarPagoIdempotente\(credito, \{ \.\.\.datos/g) || []).length).toBe(1);
  expect((src.match(/registrarPagoIdempotente\(c, d\.pago/g) || []).length).toBe(1);
  // Ninguna pantalla llama registrarPago directo (se saltaría la validación).
  expect(src).not.toMatch(/[^A-Za-z]registrarPago\(/);
  // Nómina ya no ofrece «registrar igual» un pago que supera lo pendiente.
  expect(src).not.toMatch(/¿Registrar igual\?/);
  expect(src).toMatch(/const exceso = excesoPagoCuota\(cred, \{vencKey:vin\.vencKey[^\n]*\n\s*if\(exceso\)\{ alert\(exceso\); return; \}/);
});
