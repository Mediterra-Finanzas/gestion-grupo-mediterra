// node src/creditosPendientes.test.mjs — cambios de Créditos sin confirmar por el servidor.
import { diffCreditos, clasificar, crearAlmacen, pagosNuevos, pagosSinConfirmar, CLAVE_LS } from './creditosPendientes.js';

let fallos = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'OK ' : 'FALLA'} ${n}${x ? ' — ' + x : ''}`); if (!c) fallos++; };
const memoria = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }; };

const A = { uid: 'A', n: 1, acreedor: 'Banco A', pagos: [] };
const B = { uid: 'B', n: 2, acreedor: 'Banco B', pagos: [] };
const pago = { id: 'pg-1', fecha: '2026-08-10', capital: 100, interes: 0, origen: { tipo: 'manual', clave: 'manual:A@x:1' } };
const A1 = { ...A, pagos: [pago], historial: [{ accion: 'pago' }] };

// diff
let d = diffCreditos([A, B], [A1, B]);
ok('diff: solo el crédito que cambió', d.length === 1 && d[0].uid === 'A' && d[0].antes.pagos.length === 0 && d[0].despues.pagos.length === 1);
ok('diff: la valorización en memoria (_tc) no cuenta como cambio', diffCreditos([A], [{ ...A, _tc: { x: 1 } }]).length === 0);
ok('diff: alta nueva con antes=null', diffCreditos([A], [A, B])[0].antes === null);
ok('pagosNuevos: el pago registrado', pagosNuevos(d[0]).map(p => p.id).join() === 'pg-1');

// clasificar contra el servidor
ok('clasificar: el servidor ya lo tiene igual → confirmado', clasificar(d[0], [A1, B]) === 'confirmado');
ok('clasificar: el servidor sigue como antes → reaplicable', clasificar(d[0], [A, B]) === 'reaplicable');
ok('clasificar: mismo pago (misma clave) con otro id/ts en el servidor → confirmado',
  clasificar(d[0], [{ ...A, pagos: [{ ...pago, id: 'pg-otro', ts: 'x' }], historial: [{ accion: 'pago', ts: 'y' }] }, B]) === 'confirmado');
ok('clasificar: mismo pago por clave pero un pago anterior cambió en el servidor → NO confirmado',
  clasificar(diffCreditos([{ ...A, pagos: [{ id: 'p0', capital: 5 }] }], [{ ...A, pagos: [{ id: 'p0', capital: 5, anulado: true }, pago] }])[0],
    [{ ...A, pagos: [{ id: 'p0', capital: 5 }, { ...pago, id: 'pg-x' }] }]) !== 'confirmado');
ok('almacén: JSON que no es lista en localStorage no rompe (lista vacía)', (() => { const m = memoria(); m.setItem(CLAVE_LS, '{"x":1}'); return crearAlmacen(m).listar().length === 0; })());
ok('almacén: si localStorage falla al escribir, la anotación queda en memoria y se avisa',
  (() => { const m = { getItem: () => null, setItem: () => { throw new Error('cuota'); }, removeItem: () => {} }; const a2 = crearAlmacen(m); a2.registrar({ cambios: d }); return a2.listar().length === 1 && a2.soloEnMemoria(); })());
ok('clasificar: el crédito cambió en el servidor por otra causa → conflicto', clasificar(d[0], [{ ...A, acreedor: 'Banco A2' }, B]) === 'conflicto');
ok('clasificar: servidor sin uid (registro antiguo) se identifica igual que en la app',
  clasificar(diffCreditos([{ ...A, uid: 'cr-1-0' }], [{ ...A1, uid: 'cr-1-0' }])[0], [{ n: 1, acreedor: 'Banco A', pagos: [] }]) === 'reaplicable');

// almacén
const st = memoria();
const al = crearAlmacen(st);
const id = al.registrar({ usuario: 'x', cambios: d });
ok('almacén: registra en localStorage como "en_vuelo"', al.listar().length === 1 && al.listar()[0].estado === 'en_vuelo' && st.m.has(CLAVE_LS));
ok('pagosSinConfirmar: marca el pago mientras no hay confirmación', pagosSinConfirmar(al.listar()).has('pg-1'));
al.fallar(id, 'http');
ok('almacén: un fallo lo deja "sin_confirmar" con motivo', al.listar()[0].estado === 'sin_confirmar' && al.listar()[0].motivo === 'http');
const al2 = crearAlmacen(st);
ok('almacén: sobrevive a cerrar el módulo / recargar (otra instancia lo lee)', al2.listar().length === 1);
al2.depurar([A, B]);
ok('depurar: servidor sin el cambio → se conserva', al2.listar().length === 1);
al2.depurar([A1, B]);
ok('depurar: servidor con el cambio → se retira solo', al2.listar().length === 0 && !st.m.has(CLAVE_LS));
const id2 = al.registrar({ cambios: d });
al.marcarHuerfanos(new Set());
ok('marcarHuerfanos: uno RECIENTE de otra pestaña sigue "en_vuelo" (puede estar guardándose)', al.listar().find(e => e.id === id2).estado === 'en_vuelo');
al.marcarHuerfanos(new Set(), 0);
ok('marcarHuerfanos: un "en_vuelo" viejo de una sesión anterior pasa a "sin_confirmar"', al.listar().find(e => e.id === id2).estado === 'sin_confirmar');
al.confirmar(id2);
ok('confirmar: retira la anotación', al.listar().length === 0);

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo OK');
process.exit(fallos ? 1 : 0);
