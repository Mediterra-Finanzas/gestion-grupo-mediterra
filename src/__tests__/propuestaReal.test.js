/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// PROPUESTA DE CARGA SOBRE EL DATO REAL — Allegria Foods, Cerezas 2026-2027
// Inventario tomado de las capturas y del Excel exportado (hoja Parametros).
// COPIA AISLADA: no se lee ni se escribe producción.
// ═══════════════════════════════════════════════════════════════════
import fs from 'fs'; import path from 'path';
import { calcAllegria } from '../FinanzasModule.jsx';
import { resumenLado, MODELO_VERSION } from '../programas.js';
import { MESES, mIdx } from '../horizonte.js';
import { conciliacionRealizaciones } from '../anticipos.js';

const KG=850000, FOB=4.5, DESC=6, MAT=0.5, SRV=1.2;
const VENTA=3825000, RETORNO=2150500, MES_LIQ='Mar-27', MES_SALDO='Mar-27';
const fmt=v=>new Intl.NumberFormat('es-CL').format(Math.round(v));

// ── INVENTARIO ACTUAL (capturas + Excel) ──────────────────────────
const EST_CLI = [
  { id:'ec1', mes:'Sep-26', usd_kg:0.25, cerrado:true,  realizaciones:[] },  // 212.500 · pasa a liquidación
  { id:'ec2', mes:'Nov-26', usd_kg:0.44, cerrado:false, realizaciones:[] },  // 374.000
  { id:'ec3', mes:'Dec-26', usd_kg:0.44, cerrado:false, realizaciones:[] },  // 374.000
];
const EST_PRO = [
  { id:'ep1', mes:'Dec-26', usd_kg:0.53, cerrado:false, realizaciones:[] },  // 450.500
  { id:'ep2', mes:'Nov-26', usd_kg:0.21, cerrado:true,  realizaciones:[] },  // 178.500 · pasa a liquidación
  { id:'ep3', mes:'Sep-26', usd_kg:0,    cerrado:false, realizaciones:[] },  // 0
];
const DIST_MAT=[{mes:'Jan-27',pct:30},{mes:'Feb-27',pct:30},{mes:'Mar-27',pct:40}];
const DIST_SRV=[{mes:'Nov-26',pct:30},{mes:'Dec-26',pct:30},{mes:'Mar-27',pct:40}];
// Fechas de saldo por cuenta de Allegria Foods (captura de Saldos Bancos).
const FECHAS_CUENTAS=['2026-10-02','2026-10-06','2026-10-06','2026-10-02','2026-10-02',
  '2026-09-28','2026-09-28','2026-09-25','2026-10-02','2026-10-02'];

// ── CALENDARIO REAL DECLARADO ─────────────────────────────────────
const mesDe=iso=>{const MN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${MN[+iso.slice(5,7)-1]}-${iso.slice(2,4)}`;};
const dia=iso=>`${iso.slice(8,10)}/${iso.slice(5,7)}/${iso.slice(0,4)}`;
const inf=(id,iso,usd,sust=[])=>({id,modalidad:'monto',monto:usd,estado:'vigente',v:MODELO_VERSION,
  fecha_prevista:'',mes:mesDe(iso),mes_estimado:true,referencia:`calendario informado ${dia(iso)}`,
  sustituye:sust,realizaciones:[]});
const con=(id,iso,usd,reas=[],sust=[])=>({id,modalidad:'monto',monto:usd,estado:'vigente',v:MODELO_VERSION,
  fecha_prevista:iso,mes:mesDe(iso),mes_estimado:false,referencia:'fecha contractual',
  sustituye:sust,realizaciones:reas});
const hist=(id,movs)=>({id,modalidad:'por_confirmar',monto:null,estado:'borrador',historico:true,
  v:MODELO_VERSION,fecha_prevista:'',mes:'',sustituye:[],referencia:'anticipos ya cobrados',
  realizaciones:movs.map(([f,u],i)=>({id:`${id}-r${i+1}`,fecha:f,usd:u,nota:'cobro informado',usuario:'angelo'}))});

const progsCli = (sustN, sustD) => ([
  { id:'pg-wlh', lado:'cliente', contraparte:'WLH', cuotas:[
    hist('wlh-h',[['2026-07-15',362000],['2026-08-24',39980],['2026-09-16',197980]]),
    inf('wlh-1','2026-11-30',160000, sustN.wlh||[]),
    inf('wlh-2','2026-12-15',160000, sustD.wlh||[]),
    inf('wlh-3','2027-01-10',160000)]},
  { id:'pg-snf', lado:'cliente', contraparte:'SNF', cuotas:[
    con('snf-0','2026-09-25',161920,[{id:'snf-0-r1',fecha:'2026-09-24',usd:161920,
        nota:'cobro de la cuota prevista para el 25/09',usuario:'angelo'}]),
    inf('snf-1','2026-11-15',161920, sustN.snf||[]),
    inf('snf-2','2026-12-15',69250,  sustD.snf1||[]),
    inf('snf-3','2026-12-30',115000, sustD.snf2||[]),
    inf('snf-4','2027-01-10',69250)]},
  { id:'pg-tung', lado:'cliente', contraparte:'TUNGSHING', cuotas:[
    con('tung-0','2026-09-29',138000),
    inf('tung-1','2026-11-15',138000, sustN.tung||[]),
    inf('tung-2','2026-12-15',82800,  sustD.tung1||[]),
    inf('tung-3','2026-12-30',110400, sustD.tung2||[]),
    inf('tung-4','2027-01-10',82200)]},
]);
const DON_ALBERTO = { id:'pg-da', lado:'productor', contraparte:'Don Alberto', cuotas:[
    {id:'da-1',modalidad:'monto',monto:119000,estado:'vigente',v:MODELO_VERSION,fecha_prevista:'',mes:'',
     referencia:'compromiso confirmado, no ejecutado · sin fecha',sustituye:[],realizaciones:[]},
    {id:'da-2',modalidad:'monto',monto:119000,estado:'vigente',v:MODELO_VERSION,fecha_prevista:'',mes:'',
     referencia:'compromiso confirmado, no ejecutado · sin fecha',sustituye:[],realizaciones:[]},
    {id:'da-3',modalidad:'monto',monto:79000, estado:'vigente',v:MODELO_VERSION,fecha_prevista:'',mes:'',
     referencia:'compromiso confirmado, no ejecutado · sin fecha',sustituye:[],realizaciones:[]}],
  antecedentes:[
    {id:'da-a1',usd:255000,nota:'pagaré · ejecución POR CONFIRMAR',usuario:'angelo'},
    {id:'da-a2',usd:89890, nota:'pagaré · ejecución POR CONFIRMAR',usuario:'angelo'},
    {id:'da-a3',usd:17110, nota:'pagaré · ejecución POR CONFIRMAR',usuario:'angelo'}]};

const fruta=(over={})=>({kg:KG,fob_usd_kg:FOB,desc_exp_pct:DESC,mat_usd_kg:MAT,srv_usd_kg:SRV,
  anticipos_cliente:EST_CLI, mes_liquidacion:MES_LIQ, anticipos_productor:EST_PRO,
  mes_saldo_productor:MES_SALDO, dist_mat:DIST_MAT, dist_srv:DIST_SRV, programas:[],
  modelo_version:MODELO_VERSION, decisiones_sin_fecha:{}, ...over});
const P=(f)=>({'2026-2027':{cerezas:f}});
const ANTES = P(fruta());
// Sustituciones propuestas: E2 (Nov-26, 374.000) y E3 (Dec-26, 374.000) al completo.
const SUST_N = { snf:[{estimacionId:'ec2',usd:161920}], tung:[{estimacionId:'ec2',usd:138000}],
                 wlh:[{estimacionId:'ec2',usd:74080}] };               // 374.000
const SUST_D = { snf1:[{estimacionId:'ec3',usd:69250}], snf2:[{estimacionId:'ec3',usd:115000}],
                 tung1:[{estimacionId:'ec3',usd:82800}], tung2:[{estimacionId:'ec3',usd:106950}] }; // 374.000
const DESPUES = P(fruta({ programas:[...progsCli(SUST_N,SUST_D), DON_ALBERTO] }));
// Variante: el mismo total sustituido, repartido distinto entre cuotas.
const SUST_N2 = { wlh:[{estimacionId:'ec2',usd:160000}], snf:[{estimacionId:'ec2',usd:161920}],
                  tung:[{estimacionId:'ec2',usd:52080}] };
const DESPUES2 = P(fruta({ programas:[...progsCli(SUST_N2,SUST_D), DON_ALBERTO] }));
const SIN_SUST = P(fruta({ programas:[...progsCli({},{}), DON_ALBERTO] }));

const rl=(p,lado,base,mesL)=>resumenLado({ programas:p['2026-2027'].cerezas.programas, lado,
  estimaciones: lado==='cliente'?EST_CLI:EST_PRO, kgFruta:KG, basePresupuesto:base, mIdx,
  mesIdxActual:mIdx('Oct-26'), mesLiquidacion:mesL, modeloVersion:MODELO_VERSION,
  decisionesSinFecha:{}, temporada:'2026-2027', fruta:'cerezas' });
const S=(p,c)=>calcAllegria(p['2026-2027']?{...p}:p)[c].cerezas;

describe('propuesta sobre el dato real', () => {
  test('el ANTES reproduce el Excel y la pantalla', () => {
    const ing=S(ANTES,'ing'), cost=S(ANTES,'cost'), mat=S(ANTES,'mat'), srv=S(ANTES,'srv');
    const i=m=>MESES.indexOf(m);
    expect(Math.round(ing[i('Sep-26')])).toBe(0);         // estimación cerrada
    expect(Math.round(ing[i('Nov-26')])).toBe(374000);
    expect(Math.round(ing[i('Dec-26')])).toBe(374000);
    expect(Math.round(ing[i('Mar-27')])).toBe(3077000);   // liquidación de pantalla
    expect(Math.round(cost[i('Dec-26')])).toBe(450500);
    expect(Math.round(cost[i('Mar-27')])).toBe(1700000);  // saldo productor de pantalla
    expect(Math.round(mat[i('Jan-27')])).toBe(127500);
    expect(Math.round(mat[i('Mar-27')])).toBe(170000);
    expect(Math.round(srv[i('Nov-26')])).toBe(306000);
    expect(Math.round(srv[i('Mar-27')])).toBe(408000);
  });

  test('sustituyendo Nov-26 y Dec-26 se reproduce el residual declarado', () => {
    const r=rl(DESPUES,'cliente',VENTA,MES_LIQ);
    expect(Math.round(r.realizado)).toBe(761880);
    expect(Math.round(r.pendientes)).toBe(1446820);
    expect(Math.round((r.cubetas||{}).vencido||0)).toBe(138000);
    expect(Math.round(r.liquidacion)).toBe(1616300);
    expect(Math.round(r.realizado+r.pendientes+r.liquidacion)).toBe(VENTA);
  });

  test('el reparto de la sustitución entre cuotas no cambia ninguna cifra', () => {
    const a=rl(DESPUES,'cliente',VENTA,MES_LIQ), b=rl(DESPUES2,'cliente',VENTA,MES_LIQ);
    for (const k of ['realizado','pendientes','liquidacion','saldoEconomico','totalCalendarizado'])
      expect(Math.round(b[k])).toBe(Math.round(a[k]));
    expect(S(DESPUES2,'ing').map(Math.round)).toEqual(S(DESPUES,'ing').map(Math.round));
  });

  test('SIN sustituir se duplica Nov-26 y Dec-26', () => {
    const r=rl(SIN_SUST,'cliente',VENTA,MES_LIQ);
    expect(Math.round(r.pendientes)).toBe(1446820+748000);
    expect(Math.round(r.liquidacion)).toBe(VENTA-761880-(1446820+748000));
  });

  test('conciliación: los cuatro cobros contra las fechas de saldo por cuenta', () => {
    const cuotas=DESPUES['2026-2027'].cerezas.programas.filter(p=>p.lado==='cliente').flatMap(p=>p.cuotas);
    const c=conciliacionRealizaciones([cuotas],FECHAS_CUENTAS);
    expect(Math.round(c.incluida)).toBe(761880);   // todos anteriores al corte más antiguo
    expect(Math.round(c.no_incluida)).toBe(0);
    expect(c.detalle.length).toBe(4);
  });

  test('informe', () => {
    const r=rl(DESPUES,'cliente',VENTA,MES_LIQ), rp=rl(DESPUES,'productor',RETORNO,MES_SALDO);
    const cuotas=DESPUES['2026-2027'].cerezas.programas.filter(p=>p.lado==='cliente').flatMap(p=>p.cuotas);
    const conc=conciliacionRealizaciones([cuotas],FECHAS_CUENTAS);
    const pares=[['Anticipo Cerezas','ing'],['Costo Fruta Exportación','cost']];
    const L=[]; L.push('# Propuesta de carga — Allegria Foods · Cerezas 2026-2027');
    L.push(''); L.push('Inventario tomado de las capturas y del Excel exportado. Simulación en copia aislada.');
    L.push('');
    L.push('| Mes | '+pares.map(p=>p[0]+' ANTES | DESPUÉS | Δ').join(' | ')+' |');
    L.push('|---|'+pares.map(()=>'---:|---:|---:').join('|')+'|');
    for(let i=0;i<MESES.length;i++){
      const celdas=[]; let mueve=false;
      for(const [,c] of pares){ const a=Math.round(S(ANTES,c)[i]), d=Math.round(S(DESPUES,c)[i]);
        if(a!==d) mueve=true; celdas.push(`${fmt(a)} | ${fmt(d)} | ${d-a>=0?'+':''}${fmt(d-a)}`); }
      if(mueve) L.push(`| ${MESES[i]} | ${celdas.join(' | ')} |`);
    }
    L.push('');
    for(const [et,r2,base] of [['CLIENTE',r,VENTA],['PRODUCTOR',rp,RETORNO]]){
      L.push(`## Lado ${et}`); L.push('');
      L.push(`- Base: **${fmt(r2.base)}** · Saldo económico pendiente: **${fmt(r2.saldoEconomico)}**`);
      L.push(`- Realizado: **${fmt(r2.realizado)}**`);
      L.push(`- Pendientes con fecha: **${fmt(r2.pendientes)}** (vencidos ${fmt((r2.cubetas||{}).vencido||0)}, horizonte ${fmt((r2.cubetas||{}).horizonte||0)})`);
      L.push(`- Pendiente de calendarizar (sin fecha): **${fmt(r2.pendienteDeCalendarizar||0)}**`);
      L.push(`- Liquidación (${et==='CLIENTE'?MES_LIQ:MES_SALDO}): **${fmt(r2.liquidacion)}**`);
      L.push(`- Proyectado sobre fechas estimadas: **${fmt(r2.proyeccionEstimada||0)}** · contractual vencido: **${fmt(r2.vencidoContractual||0)}**`);
      L.push('');
    }
    L.push('## Qué estaba subestimado');
    L.push('');
    L.push('**El total presupuestado de venta NO estaba subestimado**: sigue siendo');
    L.push(`**${fmt(VENTA)}** (850.000 kg × 4,5), igual antes y después. Lo que estaba`);
    L.push('subestimado son **los anticipos y su distribución en el tiempo**: las');
    L.push('estimaciones cargadas suman 960.500 acordados (212.500 + 374.000 + 374.000)');
    L.push('contra 2.208.700 de movimientos y compromisos reales (761.880 cobrados +');
    L.push('1.446.820 pendientes), y los meses en que caen no coinciden. Lo que cambia');
    L.push('es cuánta caja se adelanta a la liquidación y en qué mes, no el total de la');
    L.push('temporada.');
    L.push('');
    L.push('## Conciliación por cuenta — PRESUNCIÓN, no comprobación');
    L.push('');
    L.push('**Comprobados contra cartola: 0 de 4.**');
    L.push('');
    L.push('| Fecha | US$ | Rótulo de la app | Qué significa aquí |');
    L.push('|---|---:|---|---|');
    for(const x of conc.detalle) L.push(`| ${x.fecha} | ${fmt(x.usd)} | «ya incluida en los saldos cargados» | presunción por fecha, sin verificar |`);
    L.push('');
    L.push('El rótulo «ya incluida» que muestra la pantalla **no es una comprobación**.');
    L.push('La app solo compara la fecha del cobro con la fecha de corte más antigua');
    L.push('entre las cuentas cargadas (25/09/2026) y, al ser anterior, la presume');
    L.push('incluida. No sabe en qué cuenta entró el dinero, ni en qué moneda, ni si esa');
    L.push('cuenta estaba conciliada a esa fecha.');
    L.push('');
    L.push('**No se puede concluir que no haya subestimación de caja.** Mientras no se');
    L.push('verifique, por cada movimiento, la cuenta que lo recibió y su cartola, los');
    L.push('cuatro siguen sin comprobar y el riesgo queda abierto.');
    L.push('');
    L.push('## Diferencia pendiente de explicar');
    L.push('');
    L.push('El Excel arranca Oct-26 con saldo inicial **148.112** y la pantalla de Saldos');
    L.push('Bancos muestra **147.970** para Allegria Foods: **142 USD** de diferencia.');
    L.push('Queda registrada como **pendiente de explicar**. No se le atribuye causa: no');
    L.push('hay evidencia de a qué se debe.');
    L.push('');
    L.push('## Lado productor — tres bolsas separadas, sin mezclar');
    L.push('');
    L.push('| Bolsa | US$ | Estado | Tratamiento |');
    L.push('|---|---:|---|---|');
    L.push('| Don Alberto, confirmados NO ejecutados | 317.000 | compromiso firme, **sin fecha** | cuotas vigentes sin mes · reservados, no proyectan |');
    L.push('| Don Alberto, ejecución POR CONFIRMAR | 362.000 | informado, sin fecha verificada | antecedentes · no cuentan como realizado, no proyectan |');
    L.push('| Estimaciones de anticipo vigentes | P1 450.500 (Dec-26) | abierta | proyecta en su mes |');
    L.push('| | P2 178.500 (Nov-26) | cerrada | pasa a liquidación, no proyecta |');
    L.push('| | P3 0 (Sep-26) | abierta | sin efecto |');
    L.push('');
    L.push('Las tres bolsas son independientes. Nada pasa de una a otra por parecido de');
    L.push('monto ni por coincidir el mes.');
    L.push('');
    L.push('### Lo que falta decidir, con su efecto');
    L.push('');
    L.push('¿P1 (450.500 en Dec-26) incluye los 317.000 de Don Alberto? Y si los incluye,');
    L.push('¿el remanente de 133.500 sigue siendo un compromiso estimado?');
    L.push('');
    L.push('| Respuesta | Dec-26 costo | Liquidación Mar-27 | Por pagar |');
    L.push('|---|---:|---:|---:|');
    L.push('| **A** · P1 no es de Don Alberto | 450.500 | 1.383.000 | 2.150.500 |');
    L.push('| **B** · P1 los incluye · remanente 133.500 sigue vigente | 133.500 | 1.700.000 | 2.150.500 |');
    L.push('| **C** · P1 los incluye · remanente ya no es compromiso | 0 | 1.833.500 | 2.150.500 |');
    L.push('');
    L.push('El saldo por pagar es 2.150.500 en las tres: lo que cambia es **en qué mes**');
    L.push('se proyecta la caja, no cuánto se debe. Los 317.000 quedan sin fecha en las');
    L.push('tres, y los 362.000 siguen como antecedentes en las tres.');
    fs.writeFileSync(path.join(process.cwd(),'docs','propuesta-carga-real.md'),L.join('\n')+'\n');
    expect(true).toBe(true);
  });
});
