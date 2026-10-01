/* ─────────────────────────────────────────────────────────────────────────
   Genera un RESPALDO DE PRUEBA con el mismo formato que "💾 Respaldo" de la app
   ({ fecha, usuario, version: "Mediterra Hub Backup v1", tablas: { id: { data,
   updated_at } } }), para probar la carga de respaldos en la vista previa
   local sin usar datos reales.

     node scripts/vista-previa/respaldo-prueba.mjs [salida.json]

   Contenido (todo ficticio):
     · créditos con el formato histórico (CREDITOS_DEFAULT del código: sin uid,
       con `n` repetidos) + un contrato nuevo;
     · un valor manual antiguo en Pago Préstamos (clave vieja, solo etiqueta);
     · una fila de nóminas guardada como TEXTO JSON (como en producción);
     · pins de otros usuarios (no deben llegar al navegador) y una fila backup_*.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(AQUI, '../../src/FinanzasModule.jsx'), 'utf8');
const lit = /const CREDITOS_DEFAULT = (\[[\s\S]*?\n\]);/.exec(src)[1];
const historicos = Function(`return ${lit}`)();

const creditos = [
  ...historicos,
  { uid: 'cr-prueba-contrato', n: 900, tipo_credito: 'contrato', empresa: 'Osiris', acreedor: 'Banco Real Prueba', moneda: 'USD', tipo_cr: 'Capital de trabajo',
    monto: 200000, fecha_desembolso: '2026-03-15', primer_venc: '2026-06-15', vencimiento_final: '2027-03-15', periodicidad: 3, modalidad: 'lineal',
    tasa_tipo: 'fija', tasa_anual: 9, base: 'act360', control_desde: '2026-03-15',
    pagos: [{ id: 'pg-prueba-1', vencKey: 'cr-prueba-contrato@2026-06-15', fecha: '2026-06-15', capital: 50000, interes: 4500, cargos: 0, sinDesglose: 0,
      tipo: 'pago', nota: 'cartola', usuario: 'Angelo Huerta', ts: '2026-06-15T15:00:00Z' }] },
];

const fecha = '2026-09-30T21:15:00.000Z';
const t = (min) => new Date(Date.parse(fecha) - min * 60000).toISOString();
const respaldo = {
  fecha, usuario: 'Angelo Huerta', version: 'Mediterra Hub Backup v1',
  tablas: {
    main: { data: { usuarios: [], estados: {} }, updated_at: t(300) },
    pins: { data: { 'Otro Usuario_h': '{"v":1,"hash":"NO-DEBE-LLEGAR-AL-NAVEGADOR"}' }, updated_at: t(290) },
    finanzas: { data: {
      finanzas_real: { Osiris: { _proyOverrides: { 'Pago Préstamos - Total': { '6': 55000 } } } },
      allegria_params: {}, params_emp: {}, params_as: {}, params_if: {}, params_af: {}, params_ap: {}, params_osiris: {},
      params_participacion: {}, sub_lines: {}, added_lines: {}, intercompany: [], creditos_data: creditos,
    }, updated_at: t(120) },
    finanzas_bancos: { data: { saldos: { 'Osiris||BICE||usd': { monto: 25000, fecha: '2026-09-29', moneda: 'usd' } } }, updated_at: t(110) },
    finanzas_esc_index: { data: { escenarios: [] }, updated_at: t(100) },
    nominas_v2_done: { data: { migrado: true }, updated_at: t(90) },
    nominas_osiris: { data: { nominas: [] }, updated_at: t(80) },
    maestro_tc: { data: { 'USD-CLP': [{ fecha: '2026-09-29', valor: 955, fuente: 'manual' }] }, updated_at: t(70) },
    audit_log: { data: [], updated_at: t(60) },
  },
};
const salida = path.resolve(process.argv[2] || path.join(AQUI, 'dist', 'respaldo_prueba.json'));
fs.mkdirSync(path.dirname(salida), { recursive: true });
fs.writeFileSync(salida, JSON.stringify(respaldo, null, 2));
console.log(`Respaldo de prueba: ${salida} (${creditos.length} créditos)`);
