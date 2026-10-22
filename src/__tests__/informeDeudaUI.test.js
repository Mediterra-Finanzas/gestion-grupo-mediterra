import React, { useState } from 'react';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
jest.mock('../excelConLogo', () => ({ ...jest.requireActual('../excelConLogo'), descargarExcelConLogo: jest.fn().mockResolvedValue({ conLogo: true }) }));
import { descargarExcelConLogo } from '../excelConLogo';
const hojaDe = (call, nombre) => call[1].find(h => h.nombre === nombre).aoa;
import { InformeDeudaCreditos, CamposComunesCredito } from '../FinanzasModule.jsx';
import { informeDeuda, agruparInforme, fmtUSD, etiquetaCredito } from '../informeDeuda.js';
import { hojasExcelInforme, bloquesPdfInforme, columnasResumen, textoClasificacion } from '../informeDeudaExport.js';

afterEach(() => { cleanup(); descargarExcelConLogo.mockClear(); });
// Caso de referencia (datos simulados): leasing BCI de Allegria Service, calendario del banco.
const cal = [['2024-11-05', 243800, 256200], ['2025-11-05', 364620.52, 235379.48], ['2026-11-05', 395759.11, 204240.89],
  ['2027-11-05', 429556.94, 170443.06], ['2028-11-05', 543446.89, 133759.11], ['2029-11-05', 589857.27, 87348.73], ['2029-12-05', 432959.27, 3080.73]];
const bci = { uid: 'bci', tipo_credito: 'contrato', modalidad: 'manual', empresa: 'Allegria Service', acreedor: 'BCI', identificador: '215414', moneda: 'USD',
  monto: 3000000, fecha_desembolso: '2023-11-05', tasa_anual: 8.54, base: '30360', tipo_cr: 'Leasing', control_desde: '2024-01-01',
  calendario_manual: cal.map(([fecha, capital, interes]) => ({ fecha, capital, interes, cargos: 0 })),
  pagos: [{ id: 'p1', vencKey: 'bci@2024-11-05', fecha: '2024-11-05', capital: 243800, interes: 256200 },
          { id: 'p2', vencKey: 'bci@2025-11-05', fecha: '2025-11-05', capital: 364620.52, interes: 235379.48 }],
  garantias_lista: [{ tipo: 'Aval', otorgante: 'Mediterra Holding', monto: 3000000, moneda: 'USD' }] };
// Otro contrato del MISMO banco y empresa: debe ir en su propia fila.
const bci2 = { uid: 'bci2', tipo_credito: 'contrato', modalidad: 'bullet_int', empresa: 'Allegria Service', acreedor: 'BCI', identificador: 'CT-77', tipo_cr: 'Capital de trabajo',
  moneda: 'USD', monto: 500000, fecha_desembolso: '2026-06-01', primer_venc: '2026-07-01', vencimiento_final: '2027-06-01', periodicidad: 1, tasa_tipo: 'fija', tasa_anual: 9, base: 'act360', control_desde: '2026-06-01' };
const zelun = { uid: 'z', empresa: 'Allegria Foods', acreedor: 'Zelun', tipo_inst: 'Privado', monto: 120000, f_venc: '2030-11-30', tipo_cr: 'Bullet', cuota: 120000, control_desde: '2026-01-01' };
const viejo = { uid: 'v', empresa: 'Allegria Foods', acreedor: 'Banco Antiguo', tipo_inst: 'Banco', tipo_cr: 'PAE', monto: 40000, f_inicio: '2025-01-01', f_venc: '2025-06-30',
  cuota: 43828, control_desde: '2026-01-01' };   // vencida antes de control_desde, sin pago → por conciliar
const clp = { uid: 'clp', empresa: 'Osiris', acreedor: 'Banco CLP', tipo_acreedor: 'Banco', tipo_cr: 'Capital de trabajo', moneda: 'CLP', tc_flujo: 950,
  monto: 95000000, f_inicio: '2026-06-01', f_venc: '2027-06-01', cuota: 100000000, control_desde: '2026-06-01', desglose: { capital: 95000000, interes: 5000000, cargos: 0 } };
const pen = { uid: 'pen', empresa: 'Frisku Foods', acreedor: 'Banco Perú', tipo_acreedor: 'Banco', tipo_cr: 'Capital de trabajo', moneda: 'PEN',
  monto: 100000, f_inicio: '2026-06-01', f_venc: '2027-06-01', cuota: 110000, control_desde: '2026-06-01', desglose: { capital: 100000, interes: 10000, cargos: 0 } };
const creditos = [bci, bci2, zelun, viejo, clp, pen];
const CORTE = '2026-12-15';   // distinto de hoy: la pantalla tiene que usar la fecha elegida
const poneCorte = (c) => fireEvent.change(c.querySelector('input[type=date]'), { target: { value: CORTE } });
const txt = (n) => fmtUSD(n);

test('resumen: parciales, total identificado, por conciliar aparte y conteo', () => {
  const { container } = render(<InformeDeudaCreditos creditos={creditos} tcData={{}} />);
  poneCorte(container);
  const inf = informeDeuda(creditos, CORTE);
  expect(inf.total.porConciliar).toBe(43828);
  expect(inf.conteo).toMatchObject({ listados: 6, incluidos: 5, sinTC: 1 });
  const ind = (k) => container.querySelector(`[data-indicador="${k}"]`).textContent;
  expect(ind('capital')).toMatch(/Capital \(parcial\*\)/);
  expect(ind('devengado')).toMatch(/parcial\*/);
  expect(ind('saldoDeuda')).toMatch(/parcial\*/);
  expect(ind('totalIdentificado')).toContain(`US$ ${txt(inf.total.totalPorPagar + inf.total.sinDesglose)}`);
  expect(ind('obligaciones')).toContain(`US$ ${txt(inf.total.totalIdentificado)}`);   // sin anticipos marcados: obligaciones = deuda financiera
  expect(ind('anticipos')).toMatch(/ninguno marcado/);
  expect(ind('porConciliar')).toContain('US$ 43,828.00');
  expect(container.textContent).toContain('6 créditos: 5 en los totales; 1 fuera por no tener tipo de cambio (Frisku Foods · Banco Perú (PEN))');
  expect(container.textContent).toMatch(/No incluye:.*Cuotas por conciliar: US\$ 43,828.00/);
  expect(container.querySelector('[data-avisos-totales]').textContent).toMatch(/son parciales: no incluyen/);
});

test('agrupa empresa → crédito; dos contratos del mismo banco van separados; totales idénticos al agrupar y desplegar', () => {
  const { container } = render(<InformeDeudaCreditos creditos={creditos} tcData={{}} />);
  poneCorte(container);
  const inf = informeDeuda(creditos, CORTE);
  const g = agruparInforme(inf);
  // dos filas BCI en Allegria Service
  expect(container.querySelectorAll('[data-fila-credito="bci"],[data-fila-credito="bci2"]')).toHaveLength(2);
  const cols = columnasResumen(inf);
  const iTot = cols.findIndex(c => c[0] === 'totalIdentificado');
  const celdas = (el) => [...el.querySelectorAll('td')].map(td => td.textContent);
  // fila empresa = Σ créditos; total = Σ empresas = inf.total
  const filaAS = container.querySelector('[data-fila-empresa="Allegria Service"]');
  const asSub = g.grupos.find(e => e.empresa === 'Allegria Service').sub;
  expect(celdas(filaAS)[4 + iTot]).toBe(txt(asSub.totalIdentificado));
  const sumBci = Math.round((inf.filas.find(x => x.uid === 'bci').usd.totalIdentificado + inf.filas.find(x => x.uid === 'bci2').usd.totalIdentificado) * 100) / 100;
  expect(asSub.totalIdentificado).toBe(sumBci);
  const tot = celdas(container.querySelector('[data-fila-total="financiera"]'));
  cols.forEach(([k], i) => expect(tot[4 + i]).toBe(txt(inf.total[k])));
  // desplegar el leasing: cuotas con estados y devengo 347/360; total no cambia
  fireEvent.click(container.querySelector('[data-fila-credito="bci"]'));
  const det = container.querySelector('[data-detalle-credito="bci"]');
  expect(det.querySelectorAll('[data-cuota="pagada"]')).toHaveLength(2);
  expect(det.querySelectorAll('[data-cuota="vencida"]')).toHaveLength(1);    // 05-11-2026 impaga al 15-12-2026
  expect(det.textContent).toMatch(/Interés devengado: 40 de 360 días \(05-11-2026 al 05-11-2027, base 30\/360\)/);
  expect(celdas(container.querySelector('[data-fila-total="financiera"]'))[4 + iTot]).toBe(txt(inf.total.totalIdentificado));
  // contraer / expandir todos
  fireEvent.click(screen.getByRole('button', { name: 'Contraer todos' }));
  expect(container.querySelector('[data-detalle-credito]')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Expandir todos' }));
  expect(container.querySelectorAll('[data-detalle-credito]')).toHaveLength(6);
  // cuota sin desglose: capital e interés "sin desglose", no un número inventado
  const detZ = container.querySelector('[data-detalle-credito="z"]');
  expect(within(detZ).getAllByText('sin desglose')).toHaveLength(2);
  // filtro por acreedor: total del filtro = Σ de los créditos filtrados
  fireEvent.change(screen.getByLabelText('Acreedor'), { target: { value: 'BCI' } });
  expect(container.querySelector('[data-fila-total="financiera"]').textContent).toMatch(/TOTAL DEUDA FINANCIERA \(FILTRO\)/);
  expect(celdas(container.querySelector('[data-fila-total="financiera"]'))[4 + iTot]).toBe(txt(sumBci));
  fireEvent.change(screen.getByLabelText('Acreedor'), { target: { value: '' } });
  fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'por_conciliar' } });
  expect(container.querySelectorAll('[data-fila-credito]')).toHaveLength(1);
});

test('Excel y PDF: misma estructura y mismos totales que la pantalla', () => {
  const { container } = render(<InformeDeudaCreditos creditos={creditos} tcData={{}} />);
  poneCorte(container);
  const inf = informeDeuda(creditos, CORTE);
  fireEvent.click(screen.getByRole('button', { name: /Excel/ }));
  const llamada = descargarExcelConLogo.mock.calls[0];
  expect(llamada[0]).toBe(`Informe_Deuda_Todas_las_empresas_${CORTE}.xlsx`);
  expect(llamada[1].map(h => h.nombre)).toEqual(['Resumen', 'Créditos y cuotas', 'Por conciliar', 'Avales y garantías', 'Datos técnicos', 'Cómo se calcula']);
  const res = hojaDe(llamada, 'Resumen');
  expect(res[0][0]).toMatch(/^Informe de deuda · Todas las empresas · al 15-12-2026/);
  const fila = (re) => res.find(r => re.test(String(r[0])));
  expect(fila(/^Total de pagos pendientes identificados \(deuda financiera\)$/)[1]).toBe(inf.total.totalIdentificado);
  expect(fila(/^Total de obligaciones identificadas$/)[1]).toBe(inf.obligaciones.totalIdentificado);
  expect(fila(/^Saldo de la deuda \(parcial\*\)/)[1]).toBe(inf.total.saldoDeuda);
  expect(fila(/^Por conciliar/)[1]).toBe(43828);
  const det = hojaDe(llamada, 'Créditos y cuotas');
  const hdr = det[2]; const cTI = hdr.indexOf('Total identificado (US$)');
  expect(det.find(r => r[0] === 'TOTAL DEUDA FINANCIERA')[cTI]).toBe(inf.total.totalIdentificado);
  expect(det.find(r => r[0] === 'TOTAL OBLIGACIONES IDENTIFICADAS')[cTI]).toBe(inf.obligaciones.totalIdentificado);
  // estructura: subtotal de empresa, luego cada crédito y sus cuotas (nivel 1)
  const iEmp = det.findIndex(r => r[0] === 'Allegria Service' && String(r[1]).startsWith('Subtotal'));
  expect(det[iEmp + 1][1]).toMatch(/^BCI · (Leasing|Capital de trabajo)/);
  expect(llamada[1].find(h => h.nombre === 'Créditos y cuotas').niveles.filter(l => l === 1).length).toBe(inf.filas.reduce((a, x) => a + x.cuotas.length, 0));
  // clasificación, avales y garantías en cada fila de crédito
  const fBci = det.find(r => r[0] === 'Allegria Service' && /Leasing/.test(r[1]));
  expect(fBci[hdr.indexOf('Clasificación')]).toBe('Estructurado (sugerida)');
  expect(fBci[hdr.indexOf('Avales')]).toMatch(/Mediterra Holding/);
  // PDF (contenido): mismo total por empresa y total general; con detalle, una tabla de cuotas por crédito
  const B = bloquesPdfInforme(inf, {});
  const tabla = B.find(b => b.titulo === 'Deuda financiera (US$)');
  const iT = tabla.head.indexOf('Total identificado');
  expect(tabla.body[tabla.body.length - 1][iT]).toBe(txt(inf.total.totalIdentificado));
  expect(B.some(b => b.titulo === 'Por conciliar (no incluido en los totales)')).toBe(true);
  const indic = B.find(b => b.titulo === 'Resumen');
  expect(indic.body.find(r => r[0] === 'Total de pagos pendientes identificados (deuda financiera)')[1]).toBe(txt(inf.total.totalIdentificado));
  const conCuotas = bloquesPdfInforme(inf, { detalle: true }).filter(b => / · cuotas en /.test(b.titulo || ''));
  expect(conCuotas).toHaveLength(inf.filas.length);
  expect(hojasExcelInforme(inf).length).toBe(6);
  // Subtotales por empresa y filas de crédito: Excel y PDF = agrupación de la pantalla (US$).
  const g = agruparInforme(inf);
  const cTot = (k) => hdr.indexOf(`${columnasResumen(inf).find(c => c[0] === k)[1]} (US$)`);
  g.grupos.forEach(e => {
    const fx = det.find(r => r[0] === e.empresa && String(r[1]).startsWith('Subtotal'));
    ['capital', 'devengado', 'saldoDeuda', 'totalPorPagar', 'sinDesglose', 'totalIdentificado'].forEach(k => expect(fx[cTot(k)]).toBe(e.sub[k]));
    const fp = tabla.body.find(r => r[0].startsWith(e.empresa));
    expect(fp[iT]).toBe(txt(e.sub.totalIdentificado));
    e.filas.forEach(x => {
      const fc = det.find(r => r[1] === etiquetaCredito(x) && r[0] === x.empresa);
      expect(fc[cTot('totalIdentificado')]).toBe(x.usd ? x.usd.totalIdentificado : 'sin TC');
      expect(fc[cTot('capital')]).toBe(x.usd ? x.usd.capital : 'sin TC');
      const pc = tabla.body.find(r => r[0].trim() === etiquetaCredito(x) && r[2] === x.moneda);
      expect(pc[1]).toBe(textoClasificacion(x));
      expect(pc[iT]).toBe(x.usd ? txt(x.usd.totalIdentificado) : 'sin TC');
    });
  });
  const resEmp = res.findIndex(r => r[0] === 'Empresa' && r[1] === 'Créditos');
  g.grupos.forEach(e => expect(res.slice(resEmp).find(r => r[0] === e.empresa)[1 + 1 + columnasResumen(inf).findIndex(c => c[0] === 'totalIdentificado')]).toBe(e.sub.totalIdentificado));
  expect(tabla.body.find(r => r[0].startsWith('Frisku Foods'))[0]).toMatch(/sin tipo de cambio, fuera del subtotal/);
  // el PDF no lleva caracteres que la fuente estándar no tiene
  expect(JSON.stringify(bloquesPdfInforme(inf, { detalle: true, notas: ['a → b × c − d'] }))).not.toMatch(/[→×−≤≥]/);
});

test('el formulario sugiere la clasificación según el tipo de crédito y agrega garantías', () => {
  let ultimo;
  function Env() { const [form, setForm] = useState({ empresa: 'Osiris', tipo_cr: 'PAE', tipo_acreedor: 'Banco' }); ultimo = form; return <CamposComunesCredito form={form} setForm={setForm} />; }
  const { container } = render(<Env />);
  const sel = container.querySelector('[data-clasificacion-credito]');
  expect(sel.options[0].textContent).toMatch(/No estructurado/);
  fireEvent.change(sel, { target: { value: 'Estructurado' } });
  expect(ultimo.clasificacion).toBe('Estructurado');
  fireEvent.click(screen.getByRole('button', { name: '+ aval' }));
  fireEvent.click(screen.getByRole('button', { name: '+ aval' }));
  fireEvent.click(screen.getByRole('button', { name: '+ garantía' }));
  expect(ultimo.garantias_lista.map(g => g.tipo)).toEqual(['Aval', 'Aval', 'Hipoteca']);
  const avalistas = screen.getAllByPlaceholderText(/Avalista/);
  fireEvent.change(avalistas[0], { target: { value: 'Mediterra Holding' } });
  fireEvent.change(avalistas[1], { target: { value: 'Socio A' } });
  expect(ultimo.garantias_lista[0]).toMatchObject({ tipo: 'Aval', otorgante: 'Mediterra Holding' });
  expect(ultimo.garantias_lista[1]).toMatchObject({ tipo: 'Aval', otorgante: 'Socio A' });
  // un aval ya cargado (dato existente) aparece en la sección de avales, no en garantías
  expect(container.querySelector('[data-avales-form]').querySelectorAll('input[placeholder^="Avalista"]')).toHaveLength(2);
  expect(container.querySelector('[data-garantias-credito]').querySelectorAll('select')).toHaveLength(2);
});

test('anular una garantía cargada pide motivo y la conserva marcada', () => {
  let ultimo;
  const g0 = { tipo: 'Hipoteca', otorgante: 'Allpa', bien: 'Predio X', moneda: 'USD', monto: 500000 };
  function Env() { const [form, setForm] = useState({ empresa: 'Osiris', garantias_lista: [g0] }); ultimo = form; return <CamposComunesCredito form={form} setForm={setForm} />; }
  render(<Env />);
  const pr = jest.spyOn(window, 'prompt').mockReturnValueOnce('').mockReturnValueOnce('Alzamiento de hipoteca');
  const btn = () => screen.getByTitle('Anular garantía (queda en el historial)');
  fireEvent.click(btn());
  expect(ultimo.garantias_lista[0].anulada).toBeUndefined();
  fireEvent.click(btn());
  expect(ultimo.garantias_lista[0]).toMatchObject({ ...g0, anulada: true, motivoAnulacion: 'Alzamiento de hipoteca' });
  expect(screen.queryByTitle('Anular garantía (queda en el historial)')).toBeNull();
  pr.mockRestore();
});

test('anticipo de cliente marcado: separado de la deuda financiera e incluido en el total de obligaciones (pantalla, Excel y PDF)', () => {
  const conAnt = creditos.map(c => (c.uid === 'z' ? { ...c, naturaleza: 'anticipo_cliente' } : c));
  const { container } = render(<InformeDeudaCreditos creditos={conAnt} tcData={{}} />);
  poneCorte(container);
  const inf = informeDeuda(conAnt, CORTE), base = informeDeuda(creditos, CORTE);
  // Zelun sale de la deuda financiera y entra a anticipos; el total de obligaciones no cambia.
  expect(inf.anticipos.totalIdentificado).toBe(120000);
  expect(inf.total.totalIdentificado).toBe(Math.round((base.total.totalIdentificado - 120000) * 100) / 100);
  expect(inf.obligaciones.totalIdentificado).toBe(base.obligaciones.totalIdentificado);
  expect(inf.total.sinDesglose).toBe(0);   // la cuota sin desglosar de Zelun ya no es deuda financiera
  expect(container.querySelector('[data-tabla-deuda="financiera"] [data-fila-credito="z"]')).toBeNull();
  expect(container.querySelector('[data-tabla-deuda="anticipo_cliente"] [data-fila-credito="z"]')).not.toBeNull();
  const celdas = (el) => [...el.querySelectorAll('td')].map(td => td.textContent);
  const iTot = columnasResumen(inf).findIndex(c => c[0] === 'totalIdentificado');
  expect(celdas(container.querySelector('[data-fila-total="anticipo_cliente"]'))[4 + iTot]).toBe(txt(120000));
  expect(celdas(container.querySelector('[data-fila-total="financiera"]'))[4 + iTot]).toBe(txt(inf.total.totalIdentificado));
  expect(container.querySelector('[data-obligaciones]').textContent).toContain(`US$ ${txt(inf.obligaciones.totalIdentificado)}`);
  expect(container.querySelector('[data-indicador="anticipos"]').textContent).toContain('US$ 120,000.00');
  // Excel
  fireEvent.click(screen.getByRole('button', { name: /Excel/ }));
  const det = hojaDe(descargarExcelConLogo.mock.calls[0], 'Créditos y cuotas');
  const cTI = det[2].indexOf('Total identificado (US$)');
  expect(det.find(r => r[0] === 'TOTAL ANTICIPOS DE CLIENTES')[cTI]).toBe(120000);
  expect(det.find(r => r[0] === 'TOTAL DEUDA FINANCIERA')[cTI]).toBe(inf.total.totalIdentificado);
  expect(det.find(r => r[0] === 'TOTAL OBLIGACIONES IDENTIFICADAS')[cTI]).toBe(inf.obligaciones.totalIdentificado);
  // PDF
  const B = bloquesPdfInforme(inf, {});
  const tA = B.find(b => b.titulo === 'Anticipos de clientes (US$)');
  expect(tA.body[tA.body.length - 1][tA.head.indexOf('Total identificado')]).toBe(txt(120000));
  expect(B.some(b => b.tipo === 'destacado' && b.texto.includes(`= US$ ${txt(inf.obligaciones.totalIdentificado)}`))).toBe(true);
});

test('la naturaleza se marca a mano en el crédito; por defecto es deuda financiera', () => {
  let ultimo;
  function Env() { const [form, setForm] = useState({ empresa: 'Allegria Foods', tipo_inst: 'Privado', tipo_acreedor: 'Otro' }); ultimo = form; return <CamposComunesCredito form={form} setForm={setForm} />; }
  const { container } = render(<Env />);
  const sel = container.querySelector('[data-naturaleza-credito]');
  expect(sel.value).toBe('financiera');
  expect(ultimo.naturaleza).toBeUndefined();   // abrir no escribe nada
  // un acreedor «Otro» NO se marca solo como anticipo
  expect(informeDeuda([{ ...zelun, tipo_acreedor: 'Otro' }], CORTE).filas[0].naturaleza).toBe('financiera');
  fireEvent.change(sel, { target: { value: 'anticipo_cliente' } });
  expect(ultimo.naturaleza).toBe('anticipo_cliente');
});

test('varios avales: se listan todos, sin duplicar la deuda; descarga de una empresa con su alcance', () => {
  const conAvales = creditos.map(c => (c.uid === 'bci' ? { ...c, garantias_lista: [{ tipo: 'Aval', otorgante: 'Mediterra Holding', porcentaje: 100 },
    { tipo: 'Aval', otorgante: 'Socio A', monto: 1000000, moneda: 'USD' }, { tipo: 'Aval', otorgante: 'Socio B' }, { tipo: 'Hipoteca', bien: 'Planta de proceso' }] } : c));
  const { container } = render(<InformeDeudaCreditos creditos={conAvales} tcData={{}} />);
  poneCorte(container);
  const inf = informeDeuda(conAvales, CORTE), base = informeDeuda(creditos, CORTE);
  expect(inf.total.totalIdentificado).toBe(base.total.totalIdentificado);   // los avales no suman deuda
  fireEvent.click(container.querySelector('[data-fila-credito="bci"]'));
  const av = container.querySelector('[data-detalle-credito="bci"] [data-avales-credito]').textContent;
  expect(av).toMatch(/Mediterra Holding · 100% de la deuda/); expect(av).toMatch(/Socio A · USD 1.000.000/); expect(av).toMatch(/Socio B/);
  fireEvent.click(screen.getByRole('button', { name: /Excel/ }));
  const gar = hojaDe(descargarExcelConLogo.mock.calls[0], 'Avales y garantías');
  expect(gar.filter(r => r[1] && /Leasing/.test(r[1]) && r[3] === 'Aval').map(r => r[4])).toEqual(['Mediterra Holding', 'Socio A', 'Socio B']);
  expect(gar[2]).not.toContain('Saldo deuda');   // sin montos de deuda: no se duplican
  const B = bloquesPdfInforme(inf, {});
  expect(B.find(b => b.titulo === 'Avales').body.filter(r => /Leasing/.test(r[1]))).toHaveLength(3);
  // alcance: solo Allegria Service
  fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'Allegria Service' } });
  fireEvent.change(screen.getByLabelText('Alcance de la descarga'), { target: { value: 'empresa' } });
  fireEvent.click(screen.getByRole('button', { name: /Excel/ }));
  const ll = descargarExcelConLogo.mock.calls[1];
  expect(ll[0]).toBe(`Informe_Deuda_Allegria_Service_${CORTE}.xlsx`);
  const r2 = hojaDe(ll, 'Resumen');
  expect(r2[0][0]).toMatch(/^Informe de deuda · Allegria Service · al 15-12-2026/);
  const sub = agruparInforme(inf).grupos.find(e => e.empresa === 'Allegria Service').sub;
  expect(r2.find(r => r[0] === 'Total de pagos pendientes identificados (deuda financiera)')[1]).toBe(sub.totalIdentificado);
  const det = hojaDe(ll, 'Créditos y cuotas');
  expect(det.filter(r => r[0] && r[0] !== 'Allegria Service' && /^(Allegria Foods|Osiris|Frisku Foods)$/.test(r[0]))).toHaveLength(0);
  // Σ informes por empresa = informe de todas
  const emps = [...new Set(conAvales.map(c => c.empresa))];
  const suma = emps.reduce((a, e) => a + informeDeuda(conAvales.filter(c => c.empresa === e), CORTE).obligaciones.totalIdentificado, 0);
  expect(Math.round(suma * 100) / 100).toBe(inf.obligaciones.totalIdentificado);
});
