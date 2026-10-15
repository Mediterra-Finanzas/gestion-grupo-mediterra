/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// UNA CUOTA NO SALE DEL FLUJO POR VENCER (regla del CFO, 13-10-2026)
//
// Antes, en un registro antiguo de Créditos (sin `control_desde`), una cuota
// que vencía sin pago registrado pasaba a "por conciliar" y salía del flujo
// al día siguiente: la obligación desaparecía sin ninguna acción.
// Ahora:
//   · vencida e impaga → sigue en el flujo, arrastrada al mes en curso;
//   · lo vencido ANTES de la fecha de control (13-10-2026) sigue por
//     conciliar, como antes (ninguna cifra histórica cambia);
//   · pago parcial → solo sale lo pagado; el resto sigue proyectado;
//   · fecha estimada de pago → se proyecta ahí sin tocar el vencimiento
//     contractual (sigue VENCIDA), con motivo e historial; se reemplaza o
//     se quita anulando, nunca borrando;
//   · renovación → la cuota original no desaparece por marcarla renovable.
// DATOS SINTÉTICOS.
// ═══════════════════════════════════════════════════════════════════
import {
  flujoCreditosEmpresa, estadoCredito, registrarPago, registrarFechaEstimada, quitarFechaEstimada,
  fechaEstimadaVigente, servicioDeudaPorMes, confirmarImpaga, controlDesde, controlDesdePorRegla,
  CONTROL_DESDE_REGISTROS_ANTIGUOS, partesISO,
} from '../creditos.js';
import { avisosCreditosEmpresa, textosAvisosCreditos, buildEmpresas, aplicarCreditosAEmpresas } from '../FinanzasModule.jsx';
import { MESES, mIdx } from '../horizonte.js';

const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const ubicar = (iso) => { const p = partesISO(iso); return { idx: mIdx(`${MN[p.m-1]}-${String(p.y).slice(2)}`), semIdx: 0 }; };
const flujo = (cs, hoy) => flujoCreditosEmpresa('Allegria Foods', cs, { hoy, ubicar, nMeses: MESES.length });
const OCT = mIdx('Oct-26'), NOV = mIdx('Nov-26'), DEC = mIdx('Dec-26');

// Registro antiguo: sin control_desde, como el de producción.
const bice = { uid: 'B1', n: 11, empresa: 'Allegria Foods', acreedor: 'Banco Sintético', tipo_inst: 'Banco',
  monto: 200000, f_venc: '2026-10-15', tipo_cr: 'Bullet', tasa: '8.3%', cuota: 200000, pagado: false, control_desde: '' };
const historica = { ...bice, uid: 'H1', n: 12, f_venc: '2026-10-01' };   // venció ANTES de la regla

describe('vencer no saca la cuota del flujo', () => {
  test('el registro antiguo se controla desde la fecha de la regla, sin escribir el campo', () => {
    expect(CONTROL_DESDE_REGISTROS_ANTIGUOS).toBe('2026-10-13');
    expect(controlDesde(bice)).toBe('2026-10-13');
    expect(controlDesdePorRegla(bice)).toBe(true);
    expect(bice.control_desde).toBe('');
  });

  test('antes del vencimiento: 200.000 en Oct-26 (contractual)', () => {
    const f = flujo([bice], '2026-10-13');
    expect(f.prestamos.total[OCT]).toBe(200000);
    expect(f.porConciliar).toEqual([]);
  });

  test('vencida e impaga: sigue en el flujo, arrastrada al mes en curso, VENCIDA (no por conciliar)', () => {
    const f = flujo([bice], '2026-10-16');
    expect(f.porConciliar).toEqual([]);
    expect(f.prestamos.total[OCT]).toBe(200000);
    expect(f.arrastrados.map(v => [v.fecha, v.usd])).toEqual([['2026-10-15', 200000]]);
    const e = estadoCredito(bice, '2026-10-16');
    expect(e.vencidoTotal).toBe(200000);
    expect(e.porConciliarTotal).toBe(0);
    // y al pasar de mes no desaparece: se arrastra a noviembre
    const g = flujo([bice], '2026-11-02');
    expect(g.prestamos.total[NOV]).toBe(200000);
    expect(g.prestamos.total[OCT]).toBe(0);
  });

  test('lo vencido ANTES de la regla sigue por conciliar, como antes', () => {
    const f = flujo([historica], '2026-10-16');
    expect(f.porConciliar.map(v => v.usd)).toEqual([200000]);
    expect(f.prestamos.total.reduce((a, b) => a + b, 0)).toBe(0);
    // y se resuelve con la operación que ya existía: confirmar impaga con respaldo
    const conf = confirmarImpaga(historica, 'H1@2026-10-01', 'correo del banco', 'qa');
    expect(flujo([conf], '2026-10-16').prestamos.total[OCT]).toBe(200000);
  });
});

describe('pago registrado', () => {
  test('parcial: sale solo lo pagado, el saldo sigue proyectado y vencido', () => {
    const p = registrarPago(bice, { vencKey: 'B1@2026-10-15', fecha: '2026-10-15', sinDesglose: 50000, nota: 'cartola' }, 'qa');
    expect(p.historial.at(-1).accion).toBe('pago');
    const f = flujo([p], '2026-10-16');
    expect(f.prestamos.total[OCT]).toBe(150000);
    expect(estadoCredito(p, '2026-10-16').vencidoTotal).toBe(150000);
  });
  test('total: la cuota deja de proyectarse; el pago no toca nada fuera del crédito', () => {
    const p = registrarPago(bice, { vencKey: 'B1@2026-10-15', fecha: '2026-10-15', sinDesglose: 200000 }, 'qa');
    expect(flujo([p], '2026-10-16').prestamos.total.reduce((a, b) => a + b, 0)).toBe(0);
    expect(Object.keys(p).filter(k => !(k in bice)).sort()).toEqual(['historial', 'pagos']);
  });
});

describe('fecha estimada de pago', () => {
  const conEst = () => registrarFechaEstimada(bice, 'B1@2026-10-15', '2026-11-20', 'banco informa prórroga verbal', 'qa', '2026-10-16');

  test('se proyecta en la fecha estimada; el vencimiento contractual se conserva y sigue VENCIDA', () => {
    const c = conEst();
    const f = flujo([c], '2026-10-16');
    expect(f.prestamos.total[OCT]).toBe(0);
    expect(f.prestamos.total[NOV]).toBe(200000);
    expect(f.arrastrados).toEqual([]);
    expect(f.estimados.map(v => [v.fecha, v.fechaEstimada, v.vencidaContractual])).toEqual([['2026-10-15', '2026-11-20', true]]);
    expect(c.f_venc).toBe('2026-10-15');
    expect(estadoCredito(c, '2026-10-16').vencidoTotal).toBe(200000);
    expect(c.historial.at(-1)).toMatchObject({ accion: 'fecha estimada', usuario: 'qa' });
    expect(servicioDeudaPorMes([c], '2026-10-16')['2026-11'].total).toBe(200000);
    expect(servicioDeudaPorMes([c], '2026-10-16')['2026-10']).toBeUndefined();
  });

  test('reemplazar anula la anterior con motivo; quitar vuelve al arrastre; nada se borra', () => {
    const c1 = conEst();
    const c2 = registrarFechaEstimada(c1, 'B1@2026-10-15', '2026-12-10', 'nuevo aviso', 'qa', '2026-10-16');
    expect(c2.fechas_estimadas.length).toBe(2);
    expect(c2.fechas_estimadas[0]).toMatchObject({ anulada: true, motivoAnulacion: 'reemplazada por 2026-12-10' });
    expect(flujo([c2], '2026-10-16').prestamos.total[DEC]).toBe(200000);
    const c3 = quitarFechaEstimada(c2, 'B1@2026-10-15', 'se paga ya', 'qa');
    expect(fechaEstimadaVigente(c3, 'B1@2026-10-15')).toBeNull();
    expect(c3.fechas_estimadas.length).toBe(2);
    expect(flujo([c3], '2026-10-16').prestamos.total[OCT]).toBe(200000);
  });

  test('si la fecha estimada pasa sin pago, vuelve al arrastre (no desaparece)', () => {
    const f = flujo([conEst()], '2026-11-25');
    expect(f.prestamos.total[NOV]).toBe(200000);
    expect(f.arrastrados[0].fechaEstimadaVencida).toBe('2026-11-20');
  });

  test('rechazos: fecha pasada, sin motivo, cuota por conciliar, cuota pagada', () => {
    expect(() => registrarFechaEstimada(bice, 'B1@2026-10-15', '2026-10-01', 'x', 'qa', '2026-10-16')).toThrow(/anterior a hoy/);
    expect(() => registrarFechaEstimada(bice, 'B1@2026-10-15', '2026-11-20', ' ', 'qa', '2026-10-16')).toThrow(/motivo/);
    expect(() => registrarFechaEstimada(historica, 'H1@2026-10-01', '2026-11-20', 'x', 'qa', '2026-10-16')).toThrow(/concilia/);
    const pagada = registrarPago(bice, { vencKey: 'B1@2026-10-15', fecha: '2026-10-15', sinDesglose: 200000 }, 'qa');
    expect(() => registrarFechaEstimada(pagada, 'B1@2026-10-15', '2026-11-20', 'x', 'qa', '2026-10-16')).toThrow(/pendiente/);
  });

  test('pantalla y Excel lo avisan con las dos fechas', () => {
    jest.useFakeTimers('modern'); jest.setSystemTime(new Date(2026, 9, 16, 12, 0, 0));
    try {
      const cs = [conEst()];
      const emp = aplicarCreditosAEmpresas(buildEmpresas({}, { cobros: [] }), cs)['Allegria Foods'];
      const av = avisosCreditosEmpresa(emp, 'Allegria Foods', cs, {}, []);
      expect(av.estimados.length).toBe(1);
      const t = textosAvisosCreditos(av).join(' ');
      expect(t).toMatch(/FECHA ESTIMADA/);
      expect(t).toMatch(/vence 15\/10\/2026 \(VENCIDA\) → estimada 20\/11\/2026/);
      const linea = emp.sections.find(s => s.cat === 'egr_nop').lines.find(l => l.label === 'Pago Préstamos - Total');
      expect(linea.proy[NOV]).toBe(200000);
      expect(linea.proy[OCT]).toBe(0);
    } finally { jest.useRealTimers(); }
  });
});

describe('renovación', () => {
  const renovar = (tasa) => ({ ...bice, renovable: true, renovaciones: [{ monto: 200000, mes_ingreso: 'Oct', anio_ingreso: 2026,
    ...(tasa != null ? { tasa_anual: tasa } : {}),
    cuotas: [{ tipo: 'Solo Interés', mes: 'Ene', anio: 2027 }, { tipo: 'Capital+Interés', mes: 'Abr', anio: 2027 }] }] });
  test('marcar el crédito renovable no hace desaparecer la cuota original; la nueva proyecta capital + interés', () => {
    const f = flujo([renovar(8.3)], '2026-10-16');
    expect(f.prestamos.total[OCT]).toBe(200000);                       // la original, hasta registrar su pago
    // 200.000 × 8,3%/12 × 3 meses = 4.150 en Ene-27 y otro tanto en Abr-27 + capital
    expect(f.renovaciones.total[mIdx('Jan-27')]).toBe(4150);
    expect(f.renovaciones.total[mIdx('Apr-27')]).toBe(204150);
  });
  test('sin tasa en la renovación (el registro antiguo solo tiene `tasa` en texto) el interés sale 0: hay que cargarla', () => {
    const f = flujo([renovar(null)], '2026-10-16');
    expect(f.renovaciones.total.reduce((a, b) => a + b, 0)).toBe(200000);
  });
});
