// Pantallas de Créditos con renovaciones: KPI, lista, detalle, Análisis CFO y Saldo por Mes
// muestran la MISMA deuda vigente que el informe (fuente única: estadoCreditoAlCorte /
// saldosAlCorte en creditos.js). Controla los sitios de llamada de la pantalla, no la función.
import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { Creditos, CreditoDetalleModal } from '../FinanzasModule.jsx';
import { informeDeuda } from '../informeDeuda.js';

// Reloj fijo: 22-10-2026 (la renovación rige el 31-12-2026, todavía no).
beforeAll(() => { jest.useFakeTimers('modern'); jest.setSystemTime(new Date('2026-10-22T12:00:00')); });
afterAll(() => { jest.useRealTimers(); });
afterEach(() => { cleanup(); });

const cq = (pares) => pares.map(([tipo, mes, anio]) => ({ tipo, mes, anio }));
// 1.000.000 + 45.000 al 27-12-2026; renovación de 1.000.000 (sin modalidad) con ingreso en dic-26.
const bci = { uid: 'osb', n: 1, empresa: 'Osiris', acreedor: 'BCI', tipo_inst: 'Banco', tipo_cr: 'Bullet', moneda: 'USD', monto: 1000000, f_inicio: '2026-06-27', f_venc: '2026-12-27',
  cuota: 1045000, control_desde: '2026-06-27', renovable: true, desglose: { capital: 1000000, interes: 45000, cargos: 0 },
  renovaciones: [{ monto: 1000000, mes_ingreso: 'Dic', anio_ingreso: 2026, tasa_anual: 9, cuotas: cq([['Solo Interés', 'Jun', 2027], ['Capital+Interés', 'Dic', 2029]]) }] };
const props = { empresas: { Osiris: {} }, creditosData: [bci], empresasPermitidas: ['Osiris'], canEdit: false, usuario: 'Admin', tcData: {} };
const kpi = (label) => screen.getAllByText((t, el) => el && el.textContent === label && el.children.length === 0)[0].nextSibling.textContent;

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

test('Saldo por Mes: hoy y nov-26 en 1.000 K (la renovación aparte); dic-26 en 1.000 K ya vigente; nunca 2.000 K', () => {
  const { container } = render(<Creditos {...props} />);
  fireEvent.click(screen.getByRole('button', { name: /Saldo por Mes/ }));
  const filas = [...container.querySelectorAll('tbody tr')];
  const fila = (lbl) => filas.find(tr => tr.querySelector('td').textContent.startsWith(lbl));
  const total = (tr) => tr.querySelectorAll('td')[2].textContent;          // Corte · Osiris · Total capital
  const aparte = (tr) => tr.querySelector('[data-proy-mes]').textContent;
  expect(total(fila('Hoy'))).toBe('US$ 1.000 K');
  expect(aparte(fila('Hoy'))).toContain('US$ 1.000 K');
  expect(total(fila('Nov-26'))).toBe('US$ 1.000 K');
  expect(aparte(fila('Nov-26'))).toContain('US$ 1.000 K');
  expect(total(fila('Dic-26'))).toBe('US$ 1.000 K');
  expect(aparte(fila('Dic-26'))).toBe('—');
  expect(container.textContent).not.toContain('US$ 2.000 K');
});

test('Detalle del crédito: indicadores vigentes y la renovación como proyección', () => {
  const { container } = render(<CreditoDetalleModal credito={bci} onClose={() => {}} onSave={() => {}} canEdit={false} usuario="Admin" />);
  expect(kpi('Saldo capital')).toBe('$1,000,000.00');
  expect(container.querySelector('[data-detalle-renovaciones]').textContent).toContain('Renovación que aún no rige');
  expect(container.textContent).toContain('renovación aún no vigente hasta');
});
