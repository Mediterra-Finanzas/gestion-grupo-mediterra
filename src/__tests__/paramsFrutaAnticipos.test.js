/* eslint-disable */
// Panel de Parámetros de Allegria Foods: que la pantalla muestre acordado,
// realizado, pendiente, liquidación, los avisos (vencido, sobre-anticipo,
// conciliación bancaria, override manual) y que no deje borrar un anticipo
// con cobros registrados.
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { ParamsFruta } from '../FinanzasModule.jsx';

// El texto del panel viene partido en varios nodos (chips, <strong>, etc.),
// así que se busca sobre el texto renderizado completo.
const texto = () => document.body.textContent;
const verTexto = (re) => expect(texto()).toMatch(re);

const params = (extra = {}) => ({
  "2026-2027": {
    cerezas: {
      kg:1000000, fob_usd_kg:0.6, desc_exp_pct:0, mat_usd_kg:0.178, srv_usd_kg:0,
      anticipos_cliente:[{ id:"a1", mes:"Oct-26", usd_kg:0.10, realizaciones:[{ id:"r1", fecha:"2026-08-10", usd:60000 }] }],
      mes_liquidacion:"Mar-27",
      anticipos_productor:[{ id:"b1", mes:"Oct-26", usd_kg:0.10, realizaciones:[{ id:"r2", fecha:"2026-08-12", usd:70000 }] }],
      mes_saldo_productor:"Mar-27",
      dist_mat:[], dist_srv:[],
      ...extra,
    },
  },
});

const pintar = (p = params(), props = {}) =>
  render(<ParamsFruta seasonKey="2026-2027" fruta="cerezas" params={p} setParams={()=>{}} {...props}/>);

test('muestra acordado, cobrado, pendiente y el total por cobrar (540.000)', () => {
  pintar();
  verTexto(/Queda por cobrar: \$540,000/);
  verTexto(/Queda por pagar: \$352,000/);
  verTexto(/Acordado \$100,000/);                    // acordado cliente
  verTexto(/Cobrado \$60,000Pendiente \$40,000/);    // cobrado y pendiente cliente
  verTexto(/Pagado \$70,000Pendiente \$30,000/);     // pagado y pendiente productor
  verTexto(/Liquidación final: \$500,000/);
  verTexto(/Saldo productor: \$322,000/);
});

test('lista la realización con su fecha y dice que no es comprobable sin saldos', () => {
  pintar();
  verTexto(/10\/08\/2026/);
  verTexto(/sin saldos cargados/);
});

test('con saldos bancarios, clasifica el cobro contra la fecha de cada cuenta', () => {
  const saldos = {
    "Allegria Foods||BICE||usd": { monto:10000, fecha:"2026-09-05", moneda:"usd" },
    "Allegria Foods||Santander||usd": { monto:5000, fecha:"2026-07-01", moneda:"usd" },
  };
  pintar(params(), { saldosBancos: saldos });
  // el cobro del 10-08-2026 cae entre la cuenta más atrasada (01-07) y la más
  // reciente (05-09) → no se puede afirmar que esté conciliado
  expect(texto().match(/no comprobable \(hay cuentas con corte anterior\)/g)).toHaveLength(2);
  verTexto(/no se puede comprobar/);
});

test('no deja borrar un anticipo con cobros registrados', () => {
  window.alert = jest.fn();
  const setParams = jest.fn();
  render(<ParamsFruta seasonKey="2026-2027" fruta="cerezas" params={params()} setParams={setParams}/>);
  fireEvent.click(screen.getAllByTitle('Eliminar anticipo')[0]);
  expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('No se puede borrar'));
  expect(setParams).not.toHaveBeenCalled();
});

test('avisa del sobre-anticipo sin compensarlo solo', () => {
  const p = params({ anticipos_cliente:[{ id:"a1", mes:"Oct-26", usd_kg:0.70, realizaciones:[{ id:"r1", fecha:"2026-08-10", usd:400000 }] }] });
  pintar(p);
  verTexto(/Sobre-anticipo: \$100,000 por sobre la venta/);
  verTexto(/NO se compensa solo/);
});

test('marca el pendiente vencido y ofrece reprogramarlo a mano', () => {
  const p = params({ anticipos_cliente:[{ id:"a1", mes:"Jul-26", usd_kg:0.10, realizaciones:[] }] });
  pintar(p);           // hoy = Sep-26 → Jul-26 está vencido
  verTexto(/vencido: Jul-26 ya pasó/);
  verTexto(/reprogramar a Sep-26/);
  verTexto(/No se da por cobrado ni se mueve solo/);
});

test('avisa cuando el flujo está usando un override manual', () => {
  pintar(params(), { overridesEmpresa:{ "Anticipo Cerezas": { 6: 12345 } } });
  verTexto(/El flujo está usando valores manuales/);
  verTexto(/Anticipo Cerezas/);
});

test('el aviso de override solo cubre los meses de ESTA temporada', () => {
  // idx 1 = May-26, que pertenece a la temporada 2025-2026. Viendo 2026-2027
  // no debe anunciarse: los parámetros de esta temporada no tocan ese mes.
  pintar(params(), { overridesEmpresa:{ "Costo Fruta Exportación": { 1: 0 } } });
  expect(screen.queryByText(/El flujo está usando valores manuales/)).toBeNull();
});

test('un override del mismo mes sí se avisa en la temporada que lo contiene', () => {
  render(<ParamsFruta seasonKey="2025-2026" fruta="cerezas" params={params()}
                      overridesEmpresa={{ "Costo Fruta Exportación": { 1: 0 } }} setParams={()=>{}}/>);
  verTexto(/El flujo está usando valores manuales/);
  verTexto(/May-26/);
});

test('ciruelas: informa que sus costos no llegan al flujo', () => {
  const p = { "2026-2027": { ciruelas:{ kg:100000, fob_usd_kg:1, desc_exp_pct:0, mat_usd_kg:0, srv_usd_kg:0,
    anticipos_cliente:[], anticipos_productor:[], dist_mat:[], dist_srv:[] } } };
  render(<ParamsFruta seasonKey="2026-2027" fruta="ciruelas" params={p} setParams={()=>{}}/>);
  verTexto(/NO están conectados a ninguna línea del flujo/);
});

test('modo solo lectura: sin botones de registro ni de borrado', () => {
  pintar(params(), { readOnly:true });
  expect(texto()).not.toMatch(/Registrar cobro/);
  expect(screen.queryByTitle('Eliminar anticipo')).toBeNull();
});

test('registrar un cobro deja fecha, monto, nota y usuario', () => {
  let guardado = null;
  const setParams = (fn) => { guardado = typeof fn === 'function' ? fn(params()) : fn; };
  render(<ParamsFruta seasonKey="2026-2027" fruta="cerezas" params={params()} setParams={setParams} usuario="Angelo Huerta"/>);
  fireEvent.click(screen.getAllByText(/Registrar cobro/)[0]);
  // El campo de monto confirma al salir (blur), que es lo que hace el navegador
  // cuando apretas Guardar: mousedown → blur → click. fireEvent.click no lo emula.
  const monto = screen.getByPlaceholderText('US$');
  fireEvent.focus(monto);
  fireEvent.change(monto, { target:{ value:'15.000' } });   // con separador de miles
  fireEvent.blur(monto);
  fireEvent.change(screen.getByPlaceholderText('nota / referencia'), { target:{ value:'Transf. BICE' } });
  fireEvent.click(screen.getByText('Guardar'));
  const reas = guardado["2026-2027"].cerezas.anticipos_cliente[0].realizaciones;
  expect(reas).toHaveLength(2);
  expect(reas[1]).toMatchObject({ usd:15000, nota:'Transf. BICE', usuario:'Angelo Huerta' });
  expect(reas[1].fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(reas[1].ts).toBeTruthy();
});
