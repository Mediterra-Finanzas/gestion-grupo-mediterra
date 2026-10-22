import React, { useState } from 'react';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
jest.mock('xlsx-js-style', () => { const a = jest.requireActual('xlsx-js-style'); return { ...a, writeFile: jest.fn() }; });
import * as XLSX from 'xlsx-js-style';
import { InformeDeudaCreditos, CamposComunesCredito } from '../FinanzasModule.jsx';
import { informeDeuda } from '../informeDeuda.js';

afterEach(() => { cleanup(); jest.clearAllMocks(); });
const cal = [['2024-11-05', 243800, 256200], ['2025-11-05', 364620.52, 235379.48], ['2026-11-05', 395759.11, 204240.89],
  ['2027-11-05', 429556.94, 170443.06], ['2028-11-05', 543446.89, 133759.11], ['2029-11-05', 589857.27, 87348.73], ['2029-12-05', 432959.27, 3080.73]];
const bci = { uid: 'bci', tipo_credito: 'contrato', modalidad: 'manual', empresa: 'Allegria Service', acreedor: 'BCI', moneda: 'USD',
  monto: 3000000, fecha_desembolso: '2023-11-05', tasa_anual: 8.54, base: '30360', tipo_cr: 'Leasing', control_desde: '2024-01-01',
  calendario_manual: cal.map(([fecha, capital, interes]) => ({ fecha, capital, interes, cargos: 0 })),
  pagos: [{ id: 'p1', vencKey: 'bci@2024-11-05', fecha: '2024-11-05', capital: 243800, interes: 256200 },
          { id: 'p2', vencKey: 'bci@2025-11-05', fecha: '2025-11-05', capital: 364620.52, interes: 235379.48 }],
  garantias_lista: [{ tipo: 'Aval', otorgante: 'Mediterra Holding', monto: 3000000, moneda: 'USD' }] };
const zelun = { uid: 'z', empresa: 'Allegria Foods', acreedor: 'Zelun', tipo_inst: 'Privado', monto: 120000, f_venc: '2030-11-30', tipo_cr: 'Bullet', cuota: 120000, control_desde: '2026-01-01' };
const clp = { uid: 'clp', empresa: 'Osiris', acreedor: 'Banco CLP', tipo_acreedor: 'Banco', tipo_cr: 'Capital de trabajo', moneda: 'CLP', tc_flujo: 950,
  monto: 95000000, f_inicio: '2026-06-01', f_venc: '2027-06-01', cuota: 100000000, control_desde: '2026-06-01', desglose: { capital: 95000000, interes: 5000000, cargos: 0 } };
const creditos = [bci, zelun, clp];
const CORTE = '2026-12-15';   // distinto de hoy: la pantalla tiene que usar la fecha elegida
function poneCorte(c) { fireEvent.change(c.querySelector('input[type=date]'), { target: { value: CORTE } }); }

test('pantalla y Excel muestran las mismas cifras del modelo, al corte elegido', () => {
  const abrir = jest.fn();
  const { container } = render(<InformeDeudaCreditos creditos={creditos} tcData={{}} abrirDetalle={abrir} />);
  poneCorte(container);
  const inf = informeDeuda(creditos, CORTE);
  const infHoy = informeDeuda(creditos, '2026-10-22');
  expect(inf.total.saldoDeuda).not.toBe(infHoy.total.saldoDeuda);
  const fmt = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  expect(screen.getAllByText(fmt(inf.total.saldoDeuda)).length).toBeGreaterThan(0);
  expect(screen.getAllByText(fmt(inf.total.sinDesglose)).length).toBeGreaterThan(0);
  // cuota sin desglosar listada y abre el crédito
  const filasSD = container.querySelectorAll('[data-cuota-sin-desglose]');
  expect(filasSD).toHaveLength(1);
  expect(within(filasSD[0]).getByText('Zelun')).toBeTruthy();
  fireEvent.click(filasSD[0]);
  expect(abrir).toHaveBeenCalledWith('z');
  // garantía estructurada visible
  expect(screen.getAllByText(/Aval · otorga Mediterra Holding/).length).toBeGreaterThan(0);
  // Excel
  fireEvent.click(screen.getByRole('button', { name: /Excel/ }));
  expect(XLSX.writeFile).toHaveBeenCalledTimes(1);
  const [wb, nombre] = XLSX.writeFile.mock.calls[0];
  expect(nombre).toBe(`Informe_Deuda_${CORTE}.xlsx`);
  expect(wb.SheetNames).toEqual(['Resumen', 'Detalle', 'Garantías', 'Cuotas sin desglosar', 'Notas']);
  const res = XLSX.utils.sheet_to_json(wb.Sheets.Resumen, { header: 1 });
  const total = res.find(r => r[0] === 'TOTAL');
  // Excel = pantalla: el saldo deuda del Excel es el que está escrito en la pantalla.
  expect(screen.getAllByText(fmt(total[5])).length).toBeGreaterThan(0);
  // Crédito en CLP: moneda original y US$ por separado en el Detalle.
  const det = XLSX.utils.sheet_to_json(wb.Sheets.Detalle, { header: 1 });
  const hdr = det[2]; const filaClp = det.find(r => r[3] === 'Banco CLP');
  const fClp = inf.filas.find(x => x.uid === 'clp');
  expect(filaClp[hdr.indexOf('Capital (moneda original)')]).toBe(fClp.capital);
  expect(filaClp[hdr.indexOf('Capital (US$)')]).toBe(fClp.usd.capital);
  expect(fClp.usd.capital).toBeCloseTo(95000000 / 950, 2);
  // columnas: Clasificación, Créditos, Capital, Devengado, Cargos venc., Saldo deuda, Por devengar, Cargos fut., Total por pagar, Sin desglosar
  expect(total[2]).toBe(inf.total.capital);
  expect(total[3]).toBe(inf.total.devengado);
  expect(total[5]).toBe(inf.total.saldoDeuda);
  expect(total[8]).toBe(inf.total.totalPorPagar);
  expect(total[9]).toBe(120000);
  expect(res[2][10]).toBe('Por conciliar (fuera de las cifras)');
  const sd = XLSX.utils.sheet_to_json(wb.Sheets['Cuotas sin desglosar'], { header: 1 });
  expect(sd.some(r => r[1] === 'Zelun' && r[7] === 120000)).toBe(true);
});

test('el formulario sugiere la clasificación según el tipo de crédito y agrega garantías', () => {
  let ultimo;
  function Env() { const [form, setForm] = useState({ empresa: 'Osiris', tipo_cr: 'PAE', tipo_acreedor: 'Banco' }); ultimo = form; return <CamposComunesCredito form={form} setForm={setForm} />; }
  const { container } = render(<Env />);
  const sel = container.querySelector('[data-clasificacion-credito]');
  expect(sel.options[0].textContent).toMatch(/No estructurado/);
  fireEvent.change(sel, { target: { value: 'Estructurado' } });
  expect(ultimo.clasificacion).toBe('Estructurado');
  fireEvent.click(screen.getByRole('button', { name: '+ garantía' }));
  expect(ultimo.garantias_lista).toHaveLength(1);
  fireEvent.change(screen.getByPlaceholderText(/Otorgante/), { target: { value: 'Mediterra Holding' } });
  expect(ultimo.garantias_lista[0]).toMatchObject({ tipo: 'Aval', otorgante: 'Mediterra Holding' });
});

test('anular una garantía cargada pide motivo y la conserva marcada', () => {
  let ultimo;
  const g0 = { tipo: 'Hipoteca', otorgante: 'Allpa', bien: 'Predio X', moneda: 'USD', monto: 500000 };
  function Env() { const [form, setForm] = useState({ empresa: 'Osiris', garantias_lista: [g0] }); ultimo = form; return <CamposComunesCredito form={form} setForm={setForm} />; }
  render(<Env />);
  const pr = jest.spyOn(window, 'prompt').mockReturnValueOnce('').mockReturnValueOnce('Alzamiento de hipoteca');
  const btn = () => screen.getByTitle('Anular garantía (queda en el historial)');
  fireEvent.click(btn());
  expect(ultimo.garantias_lista[0].anulada).toBeUndefined();   // sin motivo no se anula
  fireEvent.click(btn());
  expect(ultimo.garantias_lista).toHaveLength(1);
  expect(ultimo.garantias_lista[0]).toMatchObject({ ...g0, anulada: true, motivoAnulacion: 'Alzamiento de hipoteca' });
  expect(screen.queryByTitle('Anular garantía (queda en el historial)')).toBeNull();
  pr.mockRestore();
});
