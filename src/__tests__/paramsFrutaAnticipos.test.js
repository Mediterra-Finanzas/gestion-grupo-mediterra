/* eslint-disable */
// Panel de Parámetros de Allegria Foods: que la pantalla muestre acordado,
// realizado, pendiente, liquidación, los avisos (vencido, sobre-anticipo,
// conciliación bancaria, override manual) y que no deje borrar un anticipo
// con cobros registrados.
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { ParamsFruta, fmtDate } from '../FinanzasModule.jsx';

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
  verTexto(/10\/08\/2026/);          // cobro cliente 2026-08-10 (r1), literal, sin corrimiento de zona
  verTexto(/12\/08\/2026/);          // pago productor 2026-08-12 (r2)
  expect(texto()).not.toMatch(/09\/08\/2026/);   // no debe retroceder un día (bug UTC→local)
  verTexto(/sin saldos cargados/);
});

// Regresión de ZONA HORARIA: fmtDate de una fecha-solo "YYYY-MM-DD" debe dar el día LITERAL,
// idéntico en Chile (UTC-3/-4) y en CI (UTC). Al no construir un Date, es estable por diseño.
describe('fmtDate — fecha-solo estable en cualquier zona horaria', () => {
  test.each([
    ['2026-08-10', '10/08/2026'],
    ['2026-08-12', '12/08/2026'],
    ['2026-01-01', '01/01/2026'],
    ['2026-12-31', '31/12/2026'],
    ['2026-03-01', '01/03/2026'],   // el caso clásico que retrocedía a feb-28 en zona negativa
  ])('fmtDate(%s) = %s', (entrada, esperado) => {
    expect(fmtDate(entrada)).toBe(esperado);
  });

  test('un timestamp ISO NO entra por la rama de fecha-solo (se resuelve con Date)', () => {
    const iso = '2026-08-10T02:00:00Z';
    const d = new Date(iso);   // comportamiento anterior; el resultado depende de la zona, pero
    // debe COINCIDIR con la rama Date (no con el literal "10/08/2026" de la rama fecha-solo).
    const esperadoPorDate = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    expect(fmtDate(iso)).toBe(esperadoPorDate);
  });

  test('vacío → guion; entradas nulas seguras', () => {
    expect(fmtDate('')).toBe('—');
    expect(fmtDate(null)).toBe('—');
    expect(fmtDate(undefined)).toBe('—');
  });

  test('fecha-solo inválida no devuelve una fecha imposible', () => {
    expect(fmtDate('2026-13-45')).not.toMatch(/45\/13/);   // nunca "45/13/2026"
    expect(fmtDate('2026-13-45')).toBe('2026-13-45');       // se devuelve el string tal cual
    expect(fmtDate('2026-02-30')).toBe('2026-02-30');       // 30-feb no existe → string tal cual
    expect(fmtDate('2026-00-00')).toBe('2026-00-00');
  });
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
  pintar(p);           // Jul-26 ya pasó → vencido; se ofrece reprogramar al mes en curso
  const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const d = new Date(), mesHoy = `${MN[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`;   // antes estaba fijo "Sep-26"
  verTexto(/vencido: Jul-26 ya pasó/);
  verTexto(new RegExp(`reprogramar a ${mesHoy}`));
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

// ── Regresión: los campos por unidad NO pueden leer el punto como miles ──
// Al convertir los campos a InputNumero, los bucles de parámetros quedaron
// todos como formato "monto" porque el nombre del campo es una variable
// (p[field]). Resultado: un FOB de 0.6 se guardaba como 6 y la venta pasaba
// de 600.000 a 6.000.000. Lo detectó la prueba de navegador, no las unitarias.
describe('formato de los campos de parámetros', () => {
  const guardar = () => { let out = null;
    return { set: fn => { out = typeof fn === 'function' ? fn(params()) : fn; }, leer: () => out }; };

  const escribir = (etiqueta, texto) => {
    const lbl = screen.getByText(etiqueta);
    const input = lbl.parentElement.querySelector('input');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: texto } });
    fireEvent.blur(input);
  };

  test.each([
    ['FOB US$/kg', 'fob_usd_kg', '0.6', 0.6],
    ['FOB US$/kg', 'fob_usd_kg', '0,6', 0.6],
    ['Materiales US$/kg', 'mat_usd_kg', '0.178', 0.178],
    ['Servicios US$/kg', 'srv_usd_kg', '1.2', 1.2],
    ['Desc. exportadora', 'desc_exp_pct', '6.5', 6.5],
  ])('%s: «%s» se guarda como %s, no como miles', (etiqueta, campo, texto, esperado) => {
    const g = guardar();
    render(<ParamsFruta seasonKey="2026-2027" fruta="cerezas" params={params()} setParams={g.set}/>);
    escribir(etiqueta, texto);
    expect(g.leer()["2026-2027"].cerezas[campo]).toBe(esperado);
  });

  test('KG a exportar sí acepta separador de miles', () => {
    const g = guardar();
    render(<ParamsFruta seasonKey="2026-2027" fruta="cerezas" params={params()} setParams={g.set}/>);
    escribir('KG a exportar', '1.000.000');
    expect(g.leer()["2026-2027"].cerezas.kg).toBe(1000000);
  });
});

// ── Textos: registrar un movimiento real vs trasladar el pendiente ──────
// "cerrado" se leía como "pagado". Los textos deben decir qué hace cada
// acción, distinguir cobros de pagos, y no prometer un mes de liquidación
// que no esté configurado.
describe('textos de las dos acciones', () => {
  test('el botón nombra la acción completa y distingue cobro de pago', () => {
    pintar();
    verTexto(/\+ Registrar cobro recibido/);
    verTexto(/\+ Registrar pago efectuado/);
  });

  test('la casilla ya no se llama «cerrado»', () => {
    pintar();
    const casillas = screen.getAllByText('Pasar el pendiente a liquidación');
    expect(casillas.length).toBe(2);                 // cobros y pagos
    expect(texto()).not.toMatch(/(^|\s)cerrado(\s|$)/);
  });

  test('la ayuda de la casilla dice que NO registra un movimiento, con el verbo correcto', () => {
    pintar();
    const ayudas = screen.getAllByTitle(/No se (cobrará|pagará) como anticipo separado/);
    const textos = ayudas.map(e => e.getAttribute('title'));
    expect(textos.some(t => /No se cobrará.*liquidación final.*no registra un cobro/.test(t))).toBe(true);
    expect(textos.some(t => /No se pagará.*saldo final al productor.*no registra un pago/.test(t))).toBe(true);
  });

  test('con el pendiente trasladado y nada registrado, el aviso es informativo', () => {
    pintar(params({
      anticipos_cliente:[{ id:"a1", mes:"Sep-26", usd_kg:0.25, cerrado:true, realizaciones:[] }],
      anticipos_productor:[{ id:"b1", mes:"Nov-26", usd_kg:0.21, cerrado:true, realizaciones:[] }],
    }));
    verTexto(/Sin cobros registrados\. \$250,000 trasladados a liquidación/);
    verTexto(/Sin pagos registrados\. \$210,000 trasladados a liquidación/);
  });

  test('si ya hay algo registrado, el aviso informa solo lo trasladado', () => {
    pintar(params({
      anticipos_cliente:[{ id:"a1", mes:"Sep-26", usd_kg:0.25, cerrado:true,
        realizaciones:[{ id:"r1", fecha:"2026-09-15", usd:150000 }] }],
    }));
    verTexto(/\$100,000 trasladados a liquidación/);
    expect(texto()).not.toMatch(/Sin cobros registrados/);
  });

  test('el formulario recuerda usar la fecha real y no promete conciliación', () => {
    pintar();
    fireEvent.click(screen.getAllByText(/Registrar cobro recibido/)[0]);
    verTexto(/Usa la .*fecha real.* del movimiento/s);
    verTexto(/no demuestra que el saldo ya lo incluya/);
  });
});

describe('no prometer un mes de liquidación que no existe', () => {
  test('con mes configurado, la ayuda lo nombra', () => {
    pintar();
    const t = screen.getAllByTitle(/No se cobrará/)[0].getAttribute('title');
    expect(t).toMatch(/liquidación final/);          // la ayuda de la casilla es genérica
  });

  test('sin mes de liquidación, el aviso de la pantalla no promete un mes', () => {
    pintar(params({ mes_liquidacion:"" }));
    expect(texto()).not.toMatch(/liquidación de\s+\w{3}-\d{2}/);
  });
});
