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
import { resumenLado, MODELO_VERSION } from '../programas.js';
import { MESES, mIdx, mesIdxActual } from '../horizonte.js';

const PPTO_CLIENTE = 3825000;   // presupuesto de venta declarado
const COSTO_PRODUCTOR = 2150500;
const MES_LIQ = 'Mar-27';

// Las cuotas son por MONTO FIJO, así que el reparto kilos × FOB no altera
// ninguna cifra de esta propuesta: solo fija la base total. No se deducen
// kilos ni tarifas; se usa un reparto neutro que da el presupuesto declarado.
const KG = 1000000, FOB = PPTO_CLIENTE / KG;

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

// Don Alberto: SIN cuotas y SIN meses inventados. Los montos existen como
// antecedentes: se ven, no cuentan como realizado y no proyectan.
const DON_ALBERTO = {
  id:'pg-dalberto', lado:'productor', contraparte:'Don Alberto', kilos:null,
  precio_usd_kg:null, presupuesto_asignado:null, cuotas:[],
  antecedentes:[
    { id:'da-a1', usd:255000, nota:'pagaré · ejecución POR CONFIRMAR', usuario:'angelo' },
    { id:'da-a2', usd:89890,  nota:'pagaré · ejecución POR CONFIRMAR', usuario:'angelo' },
    { id:'da-a3', usd:17110,  nota:'pagaré · ejecución POR CONFIRMAR', usuario:'angelo' },
    { id:'da-a4', usd:119000, nota:'confirmado NO ejecutado', usuario:'angelo' },
    { id:'da-a5', usd:119000, nota:'confirmado NO ejecutado', usuario:'angelo' },
    { id:'da-a6', usd:79000,  nota:'confirmado NO ejecutado', usuario:'angelo' },
  ],
};

const frutaBase = (over={}) => ({
  kg:KG, fob_usd_kg:FOB, desc_exp_pct:0, mat_usd_kg:0, srv_usd_kg:0,
  anticipos_cliente:[], mes_liquidacion:MES_LIQ,
  anticipos_productor:[], mes_saldo_productor:'Apr-27',
  dist_mat:[], dist_srv:[], programas:[], modelo_version:MODELO_VERSION,
  decisiones_sin_fecha:{}, ...over,
});
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

  test('informe del efecto mensual', () => {
    const a = serie(ANTES,'ing'), d = serie(DESPUES,'ing');
    const aC = serie(ANTES,'cost'), dC = serie(DESPUES,'cost');
    const filas = [];
    for (let i=0;i<MESES.length;i++){
      const di = Math.round(d[i]-a[i]), dc = Math.round(dC[i]-aC[i]);
      if (di || dc) filas.push([MESES[i], Math.round(a[i]), Math.round(d[i]), di, dc]);
    }
    const L = [];
    L.push('# Efecto mensual de la propuesta — Allegria Foods, Cerezas 2026-2027');
    L.push('');
    L.push('Copia aislada. Ningún dato real fue leído ni escrito.');
    L.push('');
    L.push('| Mes | Anticipo Cerezas ANTES | DESPUÉS | Δ ingreso | Δ costo |');
    L.push('|---|---:|---:|---:|---:|');
    for (const f of filas) L.push(`| ${f[0]} | ${fmt(f[1])} | ${fmt(f[2])} | ${f[3]>=0?'+':''}${fmt(f[3])} | ${f[4]>=0?'+':''}${fmt(f[4])} |`);
    L.push('');
    L.push(`Suma de los deltas de ingreso: ${fmt(filas.reduce((s,f)=>s+f[3],0))}`);
    L.push(`Suma de los deltas de costo:   ${fmt(filas.reduce((s,f)=>s+f[4],0))}`);
    L.push('');
    L.push('## Resumen del lado cliente que declara el modelo');
    L.push('');
    for (const [k,v] of [['Base (presupuesto)',r.base],['Anticipos ya cobrados',r.realizado],
      ['Anticipos pendientes',r.pendientes],['· vencidos antes del corte',(r.cubetas||{}).vencido||0],
      ['· dentro del horizonte',(r.cubetas||{}).horizonte||0],
      ['· sin fecha',(r.cubetas||{}).sin_fecha||0],
      ['Liquidación residual (Mar-27)',r.liquidacion],['Total calendarizado',r.totalCalendarizado],
      ['Proyectado sobre fechas ESTIMADAS',r.proyeccionEstimada||0],
      ['Con fecha contractual vencida',r.vencidoContractual||0],
      ['Excedente real',r.excedenteReal||0],['Exceso de compromisos',r.excesoCompromisos||0]])
      L.push(`- ${k}: **${fmt(v)}**`);
    const out = path.join(process.cwd(),'docs','propuesta-carga-efecto-mensual.md');
    fs.writeFileSync(out, L.join('\n')+'\n');
    process.stdout.write('\n'+L.join('\n')+'\n');
    expect(filas.length).toBeGreaterThan(0);
  });
});
