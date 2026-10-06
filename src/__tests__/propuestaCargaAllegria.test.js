/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// PROPUESTA DE CARGA — Allegria Foods, lado cliente (COPIA AISLADA)
//
// Datos declarados por el CFO. NO se carga nada real: esto corre contra
// `calcAllegria` en memoria y escribe un informe para su revisión.
//
// Las fechas futuras son CALENDARIO INFORMADO, no fecha contractual:
// van como `mes_estimado` con el día en `referencia`. La única fecha
// contractual es el 29/09/2026 de TUNGSHING, que queda VENCIDO.
//
// Las sustituciones van VACÍAS a propósito: requieren el inventario de
// estimaciones ya cargadas, que todavía no tengo.
// ═══════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { calcAllegria } from '../FinanzasModule.jsx';
import { resumenLado, MODELO_VERSION, tratoSinFecha } from '../programas.js';
import { conciliacionRealizaciones } from '../anticipos.js';
import { MESES, mIdx, mesIdxActual } from '../horizonte.js';

// Parámetros INFORMADOS por el CFO (referencia declarada, no verificada aún
// contra el Excel de producción). 4,5 × 0,94 − 0,5 − 1,2 = 2,53 US$/kg.
const KG = 850000, FOB = 4.5, DESC_PCT = 6, MAT = 0.5, SRV = 1.2;
const PPTO_CLIENTE = 3825000;    // 850.000 × 4,5
const RETORNO_PRODUCTOR = 2150500;  // 850.000 × 2,53
const MES_LIQ = 'Mar-27', MES_SALDO_PROD = 'Apr-27';

const mesDe = (iso) => {
  const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${MN[Number(iso.slice(5,7))-1]}-${iso.slice(2,4)}`;
};
const dia = (iso) => `${iso.slice(8,10)}/${iso.slice(5,7)}/${iso.slice(0,4)}`;

// Cuota de calendario INFORMADO: mes estimado, sin fecha contractual inventada.
const informada = (id, iso, usd) => ({
  id, modalidad:'monto', monto:usd, estado:'vigente', v:MODELO_VERSION,
  fecha_prevista:'', mes:mesDe(iso), mes_estimado:true,
  referencia:`calendario informado ${dia(iso)}`, sustituye:[], realizaciones:[],
});
// Cuota con fecha CONTRACTUAL (la única: TUNGSHING septiembre, vencida).
const contractual = (id, iso, usd, reas=[]) => ({
  id, modalidad:'monto', monto:usd, estado:'vigente', v:MODELO_VERSION,
  fecha_prevista:iso, mes:mesDe(iso), mes_estimado:false,
  referencia:'fecha contractual', sustituye:[], realizaciones:reas,
});
// Registro de anticipos ya cobrados, sin cuota de origen declarada.
const historicos = (id, movs) => ({
  id, modalidad:'por_confirmar', monto:null, estado:'borrador', historico:true,
  v:MODELO_VERSION, fecha_prevista:'', mes:'', sustituye:[],
  referencia:'anticipos ya cobrados de la contraparte',
  realizaciones: movs.map(([f,usd],i)=>({ id:`${id}-r${i+1}`, fecha:f, usd,
    nota:'cobro informado por el CFO', usuario:'angelo' })),
});

const PROGRAMAS = [
  { id:'pg-wlh', lado:'cliente', contraparte:'WLH', kilos:null, precio_usd_kg:null,
    presupuesto_asignado:null, cuotas:[
      historicos('wlh-hist', [['2026-07-15',362000],['2026-08-24',39980],['2026-09-16',197980]]),
      informada('wlh-c1','2026-11-30',160000),
      informada('wlh-c2','2026-12-15',160000),
      informada('wlh-c3','2027-01-10',160000),
    ]},
  { id:'pg-snf', lado:'cliente', contraparte:'SNF', kilos:null, precio_usd_kg:null,
    presupuesto_asignado:null, cuotas:[
      // El cobro del 24/09 ES la cuota prevista para el 25/09: una sola, ya cobrada.
      contractual('snf-c0','2026-09-25',161920,[{ id:'snf-c0-r1', fecha:'2026-09-24',
        usd:161920, nota:'cobro de la cuota prevista para el 25/09', usuario:'angelo' }]),
      informada('snf-c1','2026-11-15',161920),
      informada('snf-c2','2026-12-15',69250),
      informada('snf-c3','2026-12-30',115000),
      informada('snf-c4','2027-01-10',69250),
    ]},
  { id:'pg-tung', lado:'cliente', contraparte:'TUNGSHING', kilos:null, precio_usd_kg:null,
    presupuesto_asignado:null, cuotas:[
      contractual('tung-c0','2026-09-29',138000),   // vencido, sin cobrar
      informada('tung-c1','2026-11-15',138000),
      informada('tung-c2','2026-12-15',82800),
      informada('tung-c3','2026-12-30',110400),
      informada('tung-c4','2027-01-10',82200),
    ]},
];

// Don Alberto, dos estados distintos y dos tratamientos distintos:
//
//  · 362.000 con pagaré y ejecución POR CONFIRMAR → ANTECEDENTES. Un monto
//    informado sin fecha verificada: existe, se ve, no cuenta como realizado
//    y no proyecta. Si la cartola confirma, se convierten con su fecha real.
//  · 317.000 COMPROMISOS CONFIRMADOS, no ejecutados → CUOTAS VIGENTES SIN
//    FECHA. Son anticipos pendientes de verdad, con efecto sobre la
//    liquidación, y su falta de mes queda declarada como incompletitud del
//    calendario. No se les inventa mes.
const sinFecha = (id, usd, nota) => ({
  id, modalidad:'monto', monto:usd, estado:'vigente', v:MODELO_VERSION,
  fecha_prevista:'', mes:'', mes_estimado:false,
  referencia:nota, sustituye:[], realizaciones:[],
});
const DON_ALBERTO = {
  id:'pg-dalberto', lado:'productor', contraparte:'Don Alberto', kilos:null,
  precio_usd_kg:null, presupuesto_asignado:null,
  cuotas:[
    sinFecha('da-c1', 119000, 'compromiso confirmado, no ejecutado · sin fecha'),
    sinFecha('da-c2', 119000, 'compromiso confirmado, no ejecutado · sin fecha'),
    sinFecha('da-c3',  79000, 'compromiso confirmado, no ejecutado · sin fecha'),
  ],
  antecedentes:[
    { id:'da-a1', usd:255000, nota:'pagaré · ejecución POR CONFIRMAR', usuario:'angelo' },
    { id:'da-a2', usd:89890,  nota:'pagaré · ejecución POR CONFIRMAR', usuario:'angelo' },
    { id:'da-a3', usd:17110,  nota:'pagaré · ejecución POR CONFIRMAR', usuario:'angelo' },
  ],
};

const frutaBase = (over={}) => ({
  kg:KG, fob_usd_kg:FOB, desc_exp_pct:DESC_PCT, mat_usd_kg:MAT, srv_usd_kg:SRV,
  anticipos_cliente:[], mes_liquidacion:MES_LIQ,
  anticipos_productor:[], mes_saldo_productor:MES_SALDO_PROD,
  dist_mat:[], dist_srv:[], programas:[], modelo_version:MODELO_VERSION,
  decisiones_sin_fecha:{}, ...over,
});
// ⚠ BASE SINTÉTICA, **no** el flujo actual de producción: una temporada con
// los parámetros informados y CERO estimaciones. Producción sí tiene
// estimaciones cargadas, así que esta columna no sirve para aprobar nada;
// se reemplaza por los valores reales cuando lleguen las capturas y el Excel.
const ANTES   = { '2026-2027': { cerezas: frutaBase() } };
const DESPUES = { '2026-2027': { cerezas: frutaBase({ programas:[...PROGRAMAS, DON_ALBERTO] }) } };

const serie = (p, campo) => calcAllegria(p)[campo].cerezas;
const fmt = (v) => new Intl.NumberFormat('es-CL').format(Math.round(v));

describe('propuesta de carga · lado cliente', () => {
  const r = resumenLado({
    programas: DESPUES['2026-2027'].cerezas.programas, lado: 'cliente',
    estimaciones: [], kgFruta: KG, basePresupuesto: PPTO_CLIENTE,
    mIdx, mesIdxActual: mIdx('Oct-26'), mesLiquidacion: MES_LIQ,
    modeloVersion: MODELO_VERSION, decisionesSinFecha: {},
    temporada: '2026-2027', fruta: 'cerezas',
  });

  test('realizado = 761.880', () => expect(Math.round(r.realizado)).toBe(761880));
  test('anticipos pendientes = 1.446.820', () => expect(Math.round(r.pendientes)).toBe(1446820));
  test('vencidos = 138.000 (TUNGSHING septiembre)', () =>
    expect(Math.round((r.cubetas||{}).vencido||0)).toBe(138000));
  test('liquidación residual = 1.616.300', () => expect(Math.round(r.liquidacion)).toBe(1616300));
  test('el cuadre cierra contra el presupuesto', () =>
    expect(Math.round(r.realizado + r.pendientes + r.liquidacion)).toBe(PPTO_CLIENTE));

  test('los parámetros informados dan el retorno declarado', () => {
    // Referencia declarada por el CFO, pendiente de contrastar con el Excel.
    const neto = FOB * (1 - DESC_PCT/100) - MAT - SRV;
    expect(Number(neto.toFixed(2))).toBe(2.53);
    expect(Math.round(neto * KG)).toBe(RETORNO_PRODUCTOR);
    expect(Math.round(KG * FOB)).toBe(PPTO_CLIENTE);
  });

  const resProductor = () => resumenLado({
    programas: DESPUES['2026-2027'].cerezas.programas, lado: 'productor',
    estimaciones: [], kgFruta: KG, basePresupuesto: RETORNO_PRODUCTOR,
    mIdx, mesIdxActual: mIdx('Oct-26'), mesLiquidacion: MES_SALDO_PROD,
    modeloVersion: MODELO_VERSION, decisionesSinFecha: {},
    temporada: '2026-2027', fruta: 'cerezas',
  });

  test('los 317.000 de Don Alberto son anticipos pendientes SIN FECHA, con efecto económico', () => {
    const rp = resProductor();
    // Son pendientes de verdad, no antecedentes sin efecto.
    expect(Math.round((rp.cubetas||{}).sin_fecha||0)).toBe(317000);
    expect(Math.round(rp.pendienteDeCalendarizar||0)).toBe(317000);
    // Sin fecha y con el modelo nuevo el trato es "reservado": NO se absorbe
    // en la liquidación, queda declarado como calendario incompleto.
    expect(Math.round(rp.pendienteSinFechaReservado||0)).toBe(317000);
    const cuota = DESPUES['2026-2027'].cerezas.programas
      .find(p => p.id === 'pg-dalberto').cuotas[0];
    expect(tratoSinFecha(cuota, { modeloVersion: MODELO_VERSION, decisiones: {} })).toBe('reservado');
    // EFECTO SOBRE LA LIQUIDACIÓN: baja de 2.150.500 a 1.833.500.
    expect(Math.round(rp.liquidacion)).toBe(RETORNO_PRODUCTOR - 317000);
    expect(Math.round(rp.liquidacion + rp.pendienteDeCalendarizar)).toBe(RETORNO_PRODUCTOR);
    // Nada ejecutado: el realizado del productor es CERO, y los pendientes
    // CON fecha también, porque no se inventó ningún mes.
    expect(Math.round(rp.realizado)).toBe(0);
    expect(Math.round(rp.pendientes)).toBe(0);
  });

  test('los 362.000 por confirmar NO cuentan como realizado ni proyectan', () => {
    const rp = resProductor();
    expect(Math.round(rp.realizado)).toBe(0);
    // El costo se mueve en UN solo mes, y no por los antecedentes: es el mes
    // del saldo al productor, que baja por los 317.000 reservados sin fecha.
    // Los 362.000 por confirmar no mueven ningún mes.
    const aC = serie(ANTES,'cost'), dC = serie(DESPUES,'cost');
    const movidos = aC.map((v,i)=>[MESES[i], Math.round(dC[i]-v)]).filter(([,x])=>x!==0);
    expect(movidos).toEqual([[MES_SALDO_PROD, -317000]]);
  });

  test('asociar un cobro a una estimación: el saldo económico NO se mueve', () => {
    // Un movimiento real descuenta UNA sola vez. Lo que cambia al asociarlo
    // es QUÉ pendiente se corrige, no el saldo económico ni el realizado.
    const REA = { id:'r1', fecha:'2026-07-15', usd:362000, nota:'cobro', usuario:'angelo' };
    const est = (reas) => [{ id:'est-1', mes:'Jul-26', usd_kg:362000/KG, v:MODELO_VERSION, realizaciones:reas }];
    const comun = { lado:'cliente', kgFruta:KG, basePresupuesto:PPTO_CLIENTE, mIdx,
      mesIdxActual: mIdx('Oct-26'), mesLiquidacion:MES_LIQ, modeloVersion:MODELO_VERSION,
      decisionesSinFecha:{}, temporada:'2026-2027', fruta:'cerezas' };
    const histo = (sust) => ({ id:'pg-x', lado:'cliente', contraparte:'WLH', cuotas:[
      { id:'h', modalidad:'por_confirmar', monto:null, estado:'borrador', historico:true,
        v:MODELO_VERSION, fecha_prevista:'', mes:'', sustituye:sust||[], realizaciones:[REA] }]});

    const soloEst = resumenLado({ ...comun, programas:[],        estimaciones:est([]) });
    const conHist = resumenLado({ ...comun, programas:[histo()], estimaciones:est([]) });
    const histSust= resumenLado({ ...comun, programas:[histo([{estimacionId:'est-1',usd:362000}])], estimaciones:est([]) });
    const enEst   = resumenLado({ ...comun, programas:[],        estimaciones:est([REA]) });

    // El dinero se cuenta una sola vez en todas las formas de registrarlo.
    for (const r of [conHist, histSust, enEst]) expect(Math.round(r.realizado)).toBe(362000);
    // Y el SALDO ECONÓMICO es el mismo: 3.825.000 − 362.000.
    for (const r of [conHist, histSust, enEst])
      expect(Math.round(r.saldoEconomico)).toBe(PPTO_CLIENTE - 362000);

    // Una cuota HISTÓRICA no sustituye (es borrador siempre): declarar la
    // sustitución ahí no cambia nada. La pantalla no la ofrece.
    expect(Math.round(histSust.pendientes)).toBe(Math.round(conHist.pendientes));
    expect(Math.round(histSust.liquidacion)).toBe(Math.round(conHist.liquidacion));

    // Lo que SÍ corrige el registro sobre la estimación: el pendiente fantasma.
    expect(Math.round(conHist.pendientes)).toBe(362000);   // ya cobrado y aún proyectado
    expect(Math.round(enEst.pendientes)).toBe(0);
    expect(Math.round(conHist.liquidacion)).toBe(3101000);
    expect(Math.round(enEst.liquidacion)).toBe(3463000);
    // Las dos cuadran contra la base: la diferencia es el MES en que se
    // proyecta la caja, no el total.
    for (const r of [conHist, enEst])
      expect(Math.round(r.realizado + r.pendientes + r.liquidacion)).toBe(PPTO_CLIENTE);
    expect(Math.round(soloEst.realizado)).toBe(0);
  });

  test('conciliación bancaria de los 761.880: pendiente hasta tener los saldos', () => {
    const progs = DESPUES['2026-2027'].cerezas.programas;
    const cuotas = progs.filter(p => p.lado==='cliente').flatMap(p => p.cuotas);
    const c = conciliacionRealizaciones([cuotas], []);   // sin saldos cargados
    expect(Math.round(c.sin_saldos)).toBe(761880);
    expect(Math.round(c.incluida)).toBe(0);
    expect(c.detalle.length).toBe(4);
  });

  test('informe del efecto mensual', () => {
    const a = serie(ANTES,'ing'), d = serie(DESPUES,'ing');
    const aC = serie(ANTES,'cost'), dC = serie(DESPUES,'cost');
    const rp = resProductor();
    const cuotasCli = DESPUES['2026-2027'].cerezas.programas
      .filter(p => p.lado === 'cliente').flatMap(p => p.cuotas);
    const conc = conciliacionRealizaciones([cuotasCli], []);
    const filas = [];
    for (let i=0;i<MESES.length;i++){
      const di = Math.round(d[i]-a[i]), dc = Math.round(dC[i]-aC[i]);
      if (di || dc) filas.push([MESES[i], Math.round(a[i]), Math.round(d[i]), di, dc]);
    }
    const L = [];
    L.push('# Propuesta de carga — Allegria Foods, Cerezas 2026-2027');
    L.push('');
    L.push('**SIMULACIÓN EN COPIA AISLADA. Ningún dato real fue leído ni escrito.**');
    L.push('');
    L.push('> ⚠ **La columna «antes» NO es el flujo actual de producción.** Es una base');
    L.push('> sintética: la temporada con los parámetros informados y **cero');
    L.push('> estimaciones cargadas**. Producción sí tiene estimaciones, así que esta');
    L.push('> columna no sirve para aprobar nada. Se reemplaza por los valores reales');
    L.push('> cuando lleguen las capturas y el Excel, y recién entonces las diferencias');
    L.push('> son presentables para aprobación.');
    L.push('');
    L.push('## Parámetros usados');
    L.push('');
    L.push('Referencia **declarada** por el CFO, todavía **no contrastada** con el Excel');
    L.push('de producción:');
    L.push('');
    L.push(`- kilos ${fmt(KG)} · FOB US$${FOB}/kg · descuento exportadora ${DESC_PCT}%`);
    L.push(`- materiales US$${MAT}/kg · servicios US$${SRV}/kg`);
    L.push(`- venta cliente = ${fmt(KG)} × ${FOB} = **${fmt(PPTO_CLIENTE)}**`);
    L.push(`- retorno neto productor = ${FOB} × ${(1-DESC_PCT/100).toFixed(2)} − ${MAT} − ${SRV} = **US$${(FOB*(1-DESC_PCT/100)-MAT-SRV).toFixed(2)}/kg** → ${fmt(RETORNO_PRODUCTOR)}`);
    L.push('');
    L.push('## Efecto mensual sobre la base sintética');
    L.push('');
    L.push('| Mes | Anticipo Cerezas (base sintética) | con la propuesta | Δ ingreso | Δ costo |');
    L.push('|---|---:|---:|---:|---:|');
    for (const f of filas) L.push(`| ${f[0]} | ${fmt(f[1])} | ${fmt(f[2])} | ${f[3]>=0?'+':''}${fmt(f[3])} | ${f[4]>=0?'+':''}${fmt(f[4])} |`);
    L.push('');
    L.push(`Suma de los deltas de ingreso: **${fmt(filas.reduce((s,f)=>s+f[3],0))}** (= lo ya cobrado, que está en el banco y deja de proyectarse)`);
    L.push(`Suma de los deltas de costo: **${fmt(filas.reduce((s,f)=>s+f[4],0))}** (= los 317.000 reservados sin fecha, que salen del saldo al productor)`);
    L.push('');
    L.push('## Lado CLIENTE');
    L.push('');
    for (const [k,v] of [['Base (presupuesto de venta)',r.base],['Anticipos ya cobrados',r.realizado],
      ['Anticipos pendientes',r.pendientes],['· vencidos antes del corte',(r.cubetas||{}).vencido||0],
      ['· dentro del horizonte',(r.cubetas||{}).horizonte||0],
      ['· sin fecha',(r.cubetas||{}).sin_fecha||0],
      ['Liquidación residual (Mar-27)',r.liquidacion],['Total calendarizado',r.totalCalendarizado],
      ['Proyectado sobre fechas ESTIMADAS, no pactadas',r.proyeccionEstimada||0],
      ['Con fecha contractual vencida',r.vencidoContractual||0],
      ['Excedente real',r.excedenteReal||0],['Exceso de compromisos',r.excesoCompromisos||0]])
      L.push(`- ${k}: **${fmt(v)}**`);
    L.push('');
    L.push('## Lado PRODUCTOR (Don Alberto)');
    L.push('');
    for (const [k,v] of [['Base (retorno presupuestario)',rp.base],['Pagos ya efectuados',rp.realizado],
      ['Anticipos pendientes CON fecha',rp.pendientes],
      ['Pendiente de calendarizar (sin fecha)',rp.pendienteDeCalendarizar||0],
      ['· reservados, no proyectables',rp.pendienteSinFechaReservado||0],
      ['Saldo al productor (Apr-27)',rp.liquidacion]])
      L.push(`- ${k}: **${fmt(v)}**`);
    L.push('');
    L.push('Los **317.000** confirmados y no ejecutados van como cuotas vigentes **sin');
    L.push('fecha**: bajan el saldo al productor de 2.150.500 a 1.833.500 y quedan');
    L.push('declarados como calendario incompleto. No se les inventó mes, así que no se');
    L.push('proyectan en ninguno. Los **362.000** con pagaré van como **antecedentes**:');
    L.push('se ven, no cuentan como realizado y no proyectan hasta que la cartola');
    L.push('confirme su fecha real.');
    L.push('');
    L.push('## Conciliación bancaria de los cobros confirmados — PENDIENTE');
    L.push('');
    L.push('Que un cobro esté confirmado no prueba que esté incluido en los saldos');
    L.push('bancarios que el flujo usa como punto de partida. Sin los saldos cargados,');
    L.push('el modelo no puede comprobarlo y lo dice:');
    L.push('');
    L.push('| Fecha | US$ | Estado contra los saldos |');
    L.push('|---|---:|---|');
    for (const x of conc.detalle) L.push(`| ${x.fecha} | ${fmt(x.usd)} | ${x.estado === 'sin_saldos' ? 'NO SE PUEDE COMPROBAR (sin saldos cargados)' : x.estado} |`);
    L.push('');
    L.push(`Total sin comprobar: **${fmt(conc.sin_saldos)}**. Se resuelve con la fecha de`);
    L.push('saldo de cada cuenta bancaria: un cobro posterior a la fecha de saldo de su');
    L.push('cuenta **no** está incluido y se contaría dos veces.');
    L.push('');
    L.push('## Cómo asociar un cobro confirmado a una estimación existente');
    L.push('');
    L.push('Medido en la copia aislada, sobre una estimación de 362.000 y un cobro de');
    L.push('362.000:');
    L.push('');
    L.push('| Forma de registrarlo | Realizado | Pendiente | Liquidación | Saldo económico |');
    L.push('|---|---:|---:|---:|---:|');
    L.push('| Estimación sola, sin cobrar | 0 | 362.000 | 3.463.000 | 3.825.000 |');
    L.push('| Cobro en cuota histórica, sin asociar | 362.000 | 362.000 | 3.101.000 | 3.463.000 |');
    L.push('| Cobro en cuota histórica, «sustituyendo» | 362.000 | 362.000 | 3.101.000 | 3.463.000 |');
    L.push('| **Cobro registrado EN la estimación** | 362.000 | **0** | **3.463.000** | 3.463.000 |');
    L.push('');
    L.push('Tres conclusiones para la carga:');
    L.push('');
    L.push('1. **El saldo económico no se mueve** por asociar el cobro: 3.463.000 en los');
    L.push('   tres casos en que el cobro está registrado. El dinero se cuenta una sola');
    L.push('   vez siempre.');
    L.push('2. **Una cuota histórica NO sustituye** (es borrador por diseño). Declarar la');
    L.push('   sustitución ahí no cambia nada; la pantalla tampoco la ofrece.');
    L.push('3. **Si no se asocia, queda un pendiente fantasma**: 362.000 ya cobrados que');
    L.push('   la estimación sigue proyectando, con la liquidación 362.000 más baja. El');
    L.push('   total cuadra igual contra el presupuesto; lo que está mal es **el mes** en');
    L.push('   que se proyecta la caja. Por eso, cuando las capturas muestren una');
    L.push('   estimación que un cobro cubría, el cobro se registra **sobre esa');
    L.push('   estimación**, no como cuota histórica.');
    const out = path.join(process.cwd(),'docs','propuesta-carga-efecto-mensual.md');
    fs.writeFileSync(out, L.join('\n')+'\n');
    expect(filas.length).toBeGreaterThan(0);
  });
});
