/* eslint-disable */
// Reportes de Créditos: el reporte NO recalcula la deuda; se compara contra las funciones
// vigentes de creditos.js (posicionAlCorte, analisisCartera, vencimientosCredito, pagosVigentes).
// Datos FICTICIOS (src/reporteCreditos.datosPrueba.js). Corte 13-10-2026.
import { construirReporte, tablasReporte, describirFiltros, alCorte, EMPRESAS_LINEA, EMPRESAS_JV, formatoCelda } from '../reporteCreditos';
import { CREDITOS_PRUEBA, CORTE_PRUEBA, TC_PRUEBA } from '../reporteCreditos.datosPrueba';
import { posicionAlCorte, analisisCartera, valorizarCreditos, vencimientosCredito, pagosVigentes, esAnulado, uidCredito, estadoCredito } from '../creditos';

const OPC = { corte: CORTE_PRUEBA, tcData: TC_PRUEBA };
const rep = (f = {}, o = {}) => construirReporte(CREDITOS_PRUEBA, f, { ...OPC, ...o });
const vigentes = CREDITOS_PRUEBA.filter(c => !esAnulado(c));
const credito = (r, id) => r.creditos.find(c => c.creditoId === id);

describe('cifras = cálculo vigente de creditos.js', () => {
  const r = rep();
  test('capital pendiente y por conciliar de cada crédito = posicionAlCorte', () => {
    vigentes.forEach(c => {
      const p = posicionAlCorte([c], CORTE_PRUEBA), f = credito(r, uidCredito(c));
      expect(f.capitalPendiente).toBeCloseTo(p.capital, 4);
      expect(f.porConciliarTotal).toBeCloseTo(p.porConciliar, 4);
      expect(f.sinDesglosePendiente).toBeCloseTo(p.sinClasificar, 4);
    });
  });
  test('USD por empresa = analisisCartera sobre los créditos valorizados al corte', () => {
    const a = analisisCartera(valorizarCreditos(vigentes.map(c => alCorte(c, CORTE_PRUEBA)), TC_PRUEBA, CORTE_PRUEBA), CORTE_PRUEBA);
    Object.entries(r.resumen.porEmpresa).forEach(([emp, e]) => {
      const x = a.porEmpresa[emp] || { saldoCapital: 0, porConciliar: 0, pendiente: 0 };
      expect(e.usd.capitalPendiente).toBeCloseTo(x.saldoCapital, 1);
      expect(e.usd.porConciliarTotal).toBeCloseTo(x.porConciliar, 1);
      expect(e.usd.pendienteTotal).toBeCloseTo(x.pendiente, 1);
    });
    // Los mismos créditos sin TC en ambos lados
    expect(a.sinTC.map(e => e.uid).sort()).toEqual(r.creditos.filter(c => !c.tc).map(c => c.creditoId).sort());
  });
  test('sin rango: todas las cuotas del modelo, sin omitir ni duplicar', () => {
    const esperadas = vigentes.flatMap(c => vencimientosCredito(c).map(v => v.key)).sort();
    const obtenidas = r.cuotas.map(q => q.cuotaId).sort();
    expect(obtenidas).toEqual(esperadas);
    expect(new Set(obtenidas).size).toBe(obtenidas.length);
    r.creditos.forEach(c => expect(c.nCuotasEnRango).toBe(c.nCuotas));
  });
  test('pagos: solo vigentes (el anulado no aparece), sin duplicar', () => {
    const esperados = vigentes.flatMap(c => pagosVigentes(c).map(p => p.id)).sort();
    expect(r.pagos.map(p => p.pagoId).sort()).toEqual(esperados);
    expect(r.pagos.find(p => p.pagoId === 'pA0')).toBeUndefined();
  });
  test('Σ pendiente de cuotas confirmadas de un crédito = pendiente total del crédito', () => {
    r.creditos.forEach(c => {
      const qs = r.cuotas.filter(q => q.creditoId === c.creditoId && !q.porConciliar);
      expect(qs.reduce((s, q) => s + q.pendienteAlCorte, 0)).toBeCloseTo(c.pendienteTotal, 2);
    });
  });
});

describe('fecha de corte ≠ rango de consulta', () => {
  test('un pago posterior al corte se lista marcado y NO reduce el saldo al corte', () => {
    const r = rep();
    const p = r.pagos.find(x => x.pagoId === 'pA4');
    expect(p.posteriorAlCorte).toBe(true);
    const q = r.cuotas.find(x => x.cuotaId === 'A@2026-10-10');
    expect(q.estado).toBe('vencida'); expect(q.pagadoAlCorte).toBe(30000); expect(q.pendienteAlCorte).toBeCloseTo(74088.89, 2);
    expect(credito(r, 'A').estado).toBe('con_vencidos');
  });
  test('moviendo el corte después del pago, la cuota queda pagada y el TC cambia', () => {
    const r = rep({}, { corte: '2026-10-25' });
    expect(r.cuotas.find(x => x.cuotaId === 'A@2026-10-10').estado).toBe('pagada');
    expect(r.pagos.find(x => x.pagoId === 'pA4').posteriorAlCorte).toBe(false);
    expect(credito(r, 'C').tc.valor).toBe(990);
    expect(credito(rep(), 'C').tc.valor).toBe(955);       // al 13-10 el dato del 20-10 no se usa
  });
  test('el rango filtra cuotas (vencimiento) y pagos (fecha efectiva), sin cambiar el saldo', () => {
    const todo = rep(), r = rep({ desde: '2026-10-01', hasta: '2026-12-31' });
    r.cuotas.forEach(q => { expect(q.fecha >= '2026-10-01' && q.fecha <= '2026-12-31').toBe(true); });
    r.pagos.forEach(p => { expect(p.fecha >= '2026-10-01' && p.fecha <= '2026-12-31').toBe(true); });
    const esperadas = vigentes.flatMap(c => vencimientosCredito(c)).filter(v => v.fecha >= '2026-10-01' && v.fecha <= '2026-12-31').map(v => v.key).sort();
    expect(r.cuotas.map(q => q.cuotaId).sort()).toEqual(esperadas);
    r.creditos.forEach(c => expect(c.capitalPendiente).toBe(credito(todo, c.creditoId).capitalPendiente));
    expect(r.resumen.consolidado.usd).toEqual(todo.resumen.consolidado.usd);
  });
  test('límites del rango inclusivos', () => {
    const r = rep({ desde: '2026-10-10', hasta: '2026-10-10' });
    expect(r.cuotas.map(q => q.cuotaId)).toEqual(['A@2026-10-10']);
  });
  test('rango invertido o fechas inválidas → error, sin filas', () => {
    expect(rep({ desde: '2026-12-01', hasta: '2026-10-01' }).errores[0]).toMatch(/invertido/);
    expect(rep({ desde: '2026-13-01' }).errores.length).toBe(1);
    expect(rep({ desde: '2026-12-01', hasta: '2026-10-01' }).creditos).toEqual([]);
  });
  test('el encabezado dice qué fecha usa cada filtro', () => {
    const t = describirFiltros(rep({ desde: '2026-10-01', hasta: '2026-12-31' })).map(x => x.join(': ')).join('\n');
    expect(t).toMatch(/Saldo de deuda al corte: 13-10-2026/);
    expect(t).toMatch(/01-10-2026 a 31-12-2026 · cuotas por fecha de vencimiento; pagos por fecha efectiva/);
    expect(t).toMatch(/Empresa \(deudora\)/);
  });
});

describe('filtros combinados', () => {
  test('empresa + estado de cuota + rango', () => {
    const r = rep({ empresas: ['Osiris'], estadosCuota: ['vencida', 'por_conciliar'], hasta: '2026-12-31' });
    expect(new Set(r.creditos.map(c => c.empresa))).toEqual(new Set(['Osiris']));
    expect(r.cuotas.map(q => [q.cuotaId, q.estado])).toEqual([['A@2026-10-10', 'vencida'], ['B1@2026-07-31', 'por_conciliar']]);
  });
  test('acreedor + estado del crédito', () => {
    const r = rep({ acreedores: ['Banco Security'], estadosCredito: ['por_conciliar'] });
    expect(r.creditos.map(c => c.creditoId)).toEqual(['B1']);
  });
  test('tipo de pago', () => {
    const r = rep({ tiposPago: ['prepago'] });
    expect(r.pagos).toEqual([]);
  });
  test('resultado vacío: sin filas, sin totales y tablas que lo dicen', () => {
    const r = rep({ acreedores: ['No existe'] });
    expect(r.creditos.length + r.cuotas.length + r.pagos.length).toBe(0);
    const t = tablasReporte(r, { alcance: 'consolidado' });
    expect(t.vacio).toBe(true);
    expect(t.resumen.filas).toEqual([]);
    expect(t.creditos.filas).toEqual([]);
  });
  test('anulados: fuera por defecto; aparecen solo si se piden, sin cuotas ni saldo', () => {
    expect(credito(rep(), 'X')).toBeUndefined();
    const r = rep({ estadosCredito: ['anulado'] });
    expect(r.creditos.map(c => c.creditoId)).toEqual(['X']);
    expect(credito(r, 'X').capitalPendiente).toBe(0);
    expect(r.cuotas).toEqual([]);
  });
});

describe('renovaciones y pagos parciales', () => {
  test('la renovación conserva la cuota original y su primera cuota queda con pago parcial', () => {
    const r = rep({ empresas: ['Allegria Service'], acreedores: ['Banco Renueva Demo'] });
    expect(r.cuotas.map(q => [q.cuotaId, q.origen, q.estado])).toEqual([
      ['R@2026-09-30', 'Cuota', 'pagada'], ['R@R0@0', 'Renovación 1', 'parcial'], ['R@R0@1', 'Renovación 1', 'pendiente']]);
    const q = r.cuotas.find(x => x.cuotaId === 'R@R0@0');
    expect(q.pagadoAlCorte).toBe(1000); expect(q.pendienteAlCorte).toBe(q.total - 1000);
    expect(r.pagos.find(p => p.pagoId === 'pR1').cuotaId).toBe('R@R0@0');   // pago ↔ cuota por ID
    expect(credito(r, 'R').capitalPendiente).toBe(posicionAlCorte([CREDITOS_PRUEBA.find(c => c.uid === 'R')], CORTE_PRUEBA).capital);
  });
});

describe('monedas y TC', () => {
  const r = rep();
  test('crédito sin TC: identificado, en moneda original y el total USD INCOMPLETO', () => {
    const d = credito(r, 'D');
    expect(d.tc).toBeNull(); expect(d.usd.capitalPendiente).toBeNull(); expect(d.capitalPendiente).toBe(300000);
    expect(r.resumen.consolidado.usdIncompleto).toBe(true);
    expect(r.resumen.consolidado.sinTC.map(s => s.creditoId)).toEqual(['D']);
    const t = tablasReporte(r);
    expect(t.avisos.join(' ')).toMatch(/crédito D \(N° 4\) · Frisku Foods · Banco Perú Demo · PEN/);
    expect(t.resumen.filas.some(f => /TOTAL GENERAL en USD \(INCOMPLETO/.test(f.celdas.empresa))).toBe(true);
    const filaPEN = t.resumen.filas.find(f => f.tipo === 'dato' && f.celdas.moneda === 'PEN');
    expect(filaPEN.celdas.usdCapital).toBeNull();
    expect(formatoCelda(null, { tipo: 'usd' }, 'PEN')).toBe('sin TC');
    // Empresa con TODOS sus créditos sin TC: su total USD es «sin TC», nunca 0
    const totFrisku = t.resumen.filas.find(f => /^Total Frisku Foods en USD/.test(f.celdas.empresa));
    expect(totFrisku.celdas.usdCapital).toBeNull();
  });
  test('nunca se suman monedas distintas: un total por moneda + uno en USD', () => {
    const t = tablasReporte(r);
    const totales = t.resumen.filas.filter(f => f.tipo === 'total');
    totales.filter(f => f.moneda !== 'USD' || !/en USD/.test(f.celdas.empresa)).forEach(f => expect(f.celdas.empresa).toMatch(new RegExp(`· ${f.moneda}$`)));
    const clp = r.resumen.consolidado.monedas.CLP;
    expect(clp.capitalPendiente).toBe(95000000);
    // USD del consolidado = Σ capital USD de los créditos con TC (CLP/955, UF, EUR declarado)
    const esperado = r.creditos.filter(c => EMPRESAS_LINEA.includes(c.empresa) && c.tc).reduce((s, c) => s + c.usd.capitalPendiente, 0);
    expect(r.resumen.consolidado.usd.capitalPendiente).toBeCloseTo(esperado, 2);
    expect(credito(r, 'C').usd.capitalPendiente).toBeCloseTo(95000000 / 955, 2);
  });
  test('TC declarado en el crédito queda rotulado como hipótesis; los TC usados con fecha y fuente', () => {
    const t = tablasReporte(r);
    expect(t.avisos.join(' ')).toMatch(/TC declarado en el crédito.*E EUR 0.85 al 01-09-2026/);
    const clp = t.tcUsados.find(x => x.moneda === 'CLP');
    expect(clp).toMatchObject({ tc: 955, fecha: '10-10-2026' }); expect(clp.fuente).toMatch(/manual/);
    expect(t.tcUsados.find(x => x.moneda === 'UF').par).toMatch(/triangulado/);
  });
  test('capital confirmado y por conciliar van separados', () => {
    expect(credito(r, 'B1').capitalPendiente).toBe(0); expect(credito(r, 'B1').porConciliarTotal).toBe(9178);
    expect(r.resumen.consolidado.usd.porConciliarTotal).toBe(9178 + 34650);
  });
});

describe('perímetro: consolidado = 6 sociedades; JV aparte', () => {
  const r = rep();
  test('el consolidado no incluye las JV', () => {
    expect(r.resumen.consolidado.empresas.every(e => EMPRESAS_LINEA.includes(e))).toBe(true);
    expect(r.resumen.jv.empresas).toEqual(EMPRESAS_JV);
    expect(r.resumen.jv.usd.capitalPendiente).toBe(620000);
    const sumaLinea = EMPRESAS_LINEA.filter(e => r.resumen.porEmpresa[e]).reduce((s, e) => s + r.resumen.porEmpresa[e].usd.capitalPendiente, 0);
    expect(r.resumen.consolidado.usd.capitalPendiente).toBeCloseTo(sumaLinea, 2);
  });
  test('tabla consolidada: JV en bloque propio rotulado «no se suma»', () => {
    const t = tablasReporte(r);
    const idxTotal = t.resumen.filas.findIndex(f => /^TOTAL GENERAL en USD/.test(f.celdas.empresa || ''));
    const idxJV = t.resumen.filas.findIndex(f => /^JV/.test(f.celdas.empresa || ''));
    expect(idxTotal).toBeGreaterThan(0); expect(idxJV).toBeGreaterThan(idxTotal);
    expect(t.resumen.filas.find(f => /^Total JV en USD/.test(f.celdas.empresa || '')).celdas.empresa).toMatch(/no se suma al consolidado/);
    expect(t.logo).toBe('/med.png');
  });
  test('reporte por empresa: su logo y solo su total', () => {
    const r2 = rep({ empresas: ['Integrity Farms'] });
    const t = tablasReporte(r2, { alcance: 'empresa', empresa: 'Integrity Farms' });
    expect(t.logo).toBe('/integrity-logo.png');
    expect(t.resumen.filas.filter(f => f.tipo === 'total').map(f => f.celdas.empresa)).toEqual(['Total Integrity Farms · USD', 'Total Integrity Farms en USD']);
  });
});

describe('subtotales junto a las filas que resumen', () => {
  const t = tablasReporte(rep());
  test.each(['creditos', 'cuotas'])('%s: cada subtotal = Σ de las filas inmediatamente anteriores de esa empresa y moneda', (k) => {
    const filas = t[k].filas; const campo = k === 'creditos' ? 'capitalPendiente' : 'total';
    let grupo = [];
    filas.forEach(f => {
      if (f.tipo === 'dato') { grupo.push(f); return; }
      if (f.tipo !== 'subtotal') return;
      const emp = f.celdas.empresa.replace(/^Subtotal /, '').replace(/ · [A-Z]+$/, '');
      const datos = grupo.filter(g => g.celdas.empresa === emp && g.moneda === f.moneda);
      expect(datos.length).toBe(f.celdas._n);
      expect(datos.reduce((s, g) => s + (g.celdas[campo] || 0), 0)).toBeCloseTo(f.celdas[campo], 2);
      expect(grupo.every(g => g.celdas.empresa === emp && g.moneda === f.moneda)).toBe(true);   // sin filas ajenas entre medio
      grupo = [];
    });
  });
});

describe('permisos: empresas autorizadas también en el reporte', () => {
  test('solo las empresas permitidas, aunque el filtro pida otras', () => {
    const r = rep({ empresas: ['Osiris', 'Mediterra'] }, { empresasPermitidas: ['Osiris'] });
    expect(new Set(r.creditos.map(c => c.empresa))).toEqual(new Set(['Osiris']));
    expect(r.cuotas.every(q => q.empresa === 'Osiris') && r.pagos.every(p => p.empresa === 'Osiris')).toBe(true);
  });
  test('lista vacía o null = sin restricción (misma regla que getEmpresasPermitidasUsuario)', () => {
    expect(rep({}, { empresasPermitidas: [] }).creditos.length).toBe(rep().creditos.length);
  });
});
