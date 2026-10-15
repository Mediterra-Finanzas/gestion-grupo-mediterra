/* Contraprueba del informe de impacto: un respaldo SINTÉTICO con casos conocidos.
     node scripts/impacto/prueba.mjs
   Debe detectar la renovación clasificada (extensión) y NO marcar como cambio las
   antiguas (USD, CLP y de crédito anulado), que conservan su cálculo; estas dos
   últimas sí van en "antiguas conservadas con observación". */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'impacto-prueba-'));
const base = { empresa: 'Osiris', acreedor: 'Banco Sint', moneda: 'USD', monto: 1000000, f_inicio: '2026-06-30', f_venc: '2026-12-31', cuota: 1050000,
  tasa_anual: 10, renovable: true, control_desde: '2026-06-30', desglose: { capital: 1000000, interes: 50000, cargos: 0, respaldo: 'x', usuario: 'x', ts: 'x' } };
const ren = { monto: 1000000, mes_ingreso: 'Dic', anio_ingreso: 2026, tasa_anual: 10,
  cuotas: [{ tipo: 'Solo Interés', mes: 'Jun', anio: 2027 }, { tipo: 'Capital+Interés', mes: 'Dic', anio: 2027 }] };
const creditos = [
  { ...base, uid: 's-usd', renovaciones: [ren] },
  { ...base, uid: 's-clp', acreedor: 'Banco CLP', moneda: 'CLP', tc_flujo: 950, monto: 950000000, cuota: 997500000,
    desglose: { capital: 950000000, interes: 47500000, cargos: 0, respaldo: 'x', usuario: 'x', ts: 'x' }, renovaciones: [{ ...ren, monto: 950000000 }] },
  { ...base, uid: 's-anul', acreedor: 'Banco Anulado', anulado: true, motivoAnulacion: 'x', renovaciones: [ren] },
  { ...base, uid: 's-raro', acreedor: 'Banco Raro', renovaciones: [{ ...ren, mes_ingreso: 'Aug' }, { ...ren, anio_ingreso: ' 2026' }] },
  { ...base, uid: 's-mix', acreedor: 'Banco Mixto', renovaciones: [ren, { ...ren, monto: 400000, modalidad: 'extension', confirmada: true, intereses: 'pagados', venc_origen_key: 's-mix@R0@1',
    cuotas: [{ tipo: 'Capital+Interés', mes: 'Jun', anio: 2028 }] }] },
  { ...base, uid: 's-ext', acreedor: 'Banco Ext', renovaciones: [{ ...ren, modalidad: 'extension', confirmada: true, intereses: 'pagados', mes_ingreso: 'Feb', anio_ingreso: 2027 }] },
];
const resp = { fecha: '2026-10-15T00:00:00Z', version: 'Mediterra Hub Backup v1', tablas: { finanzas: { data: { creditos_data: creditos }, updated_at: '2026-10-15T00:00:00Z' } } };
const arch = path.join(tmp, 'respaldo.json');
fs.writeFileSync(arch, JSON.stringify(resp));
execFileSync('node', [path.join(AQUI, 'renovaciones.mjs'), arch, tmp], { env: { ...process.env, HOY: '2026-10-15' }, stdio: 'ignore' });
const r = JSON.parse(fs.readFileSync(path.join(tmp, 'impacto-renovaciones.json'), 'utf8'));
let fallos = 0;
const check = (n, c, x = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fallos++; };
const uids = r.renovaciones.map(x => x.credito);
const ext = r.renovaciones.find(x => /s-ext/.test(x.credito)) || {};
check('Detecta la extensión clasificada (interés 83.333 → 100.000)', Math.round(ext.interes_antes) === 83333 && ext.interes_despues === 100000, JSON.stringify(uids));
check('Lista solo renovaciones que cambian: s-ext y la clasificada de s-mix (no la antigua de s-mix ni las de s-raro)',
  r.renovaciones.length === 2 && r.renovaciones.some(x => /s-mix/.test(x.credito) && x.renovacion === 2), JSON.stringify(r.renovaciones.map(x => `${x.credito} #${x.renovacion}`)));
check('Mes "Aug" y año " 2026" de una antigua: igual que main (sin diferencia)', !r.creditos.some(c => /s-raro/.test(c.credito)));
const ef = (r.creditos.find(c => /s-ext/.test(c.credito)) || {}).efecto || {};
check('Efecto mensual: Pago Préstamos dic-26 −1.000.000, Renovaciones jun-27 +16.667, Ingreso Renovación feb-27 −1.000.000',
  ef['Pago Préstamos - Total']?.[0]?.dif === -1000000 && Math.round(ef['Renovaciones']?.[0]?.dif) === 16667 && ef['Ingreso Renovación']?.[0]?.dif === -1000000);
check('Las antiguas (USD, CLP, anulado) NO aparecen como cambio', !r.creditos.some(c => /s-usd|s-clp|s-anul/.test(c.credito)));
check('Antiguas con observación: CLP sin convertir y crédito anulado', r.antiguasConObservacion.length === 2
  && r.antiguasConObservacion.some(a => /s-clp/.test(a.credito)) && r.antiguasConObservacion.some(a => /s-anul/.test(a.credito)));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo OK');
process.exit(fallos ? 1 : 0);
