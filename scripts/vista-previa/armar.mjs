/* ─────────────────────────────────────────────────────────────────────────
   Arma la VISTA PREVIA de Créditos: el build real de la app + un Supabase
   simulado en el navegador (shim.js) + datos de ejemplo (semilla.js).

     node scripts/vista-previa/armar.mjs [--build] [--out <carpeta>]
     node scripts/vista-previa/servir.mjs          → http://localhost:4180

   --build   ejecuta antes `react-scripts build` (si no existe build/ también).
   Salida (por defecto scripts/vista-previa/dist, no se versiona):
     index.html     para abrir en local (diálogos y descargas Excel nativos)
     artifact.html  para publicar como Artifact (sin doctype; diálogos en la página,
                    descargas vía la capacidad "downloads" del visor)
   Los datos son SIMULADOS. Nada se lee ni se escribe en producción.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { nuevoStore } from '../e2e/fake.mjs';
import { vencimientosCredito } from '../../src/creditos.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../..');
const args = process.argv.slice(2);
const OUT = path.resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : path.join(AQUI, 'dist'));
const BUILD = path.join(RAIZ, 'build');

if (args.includes('--build') || !fs.existsSync(path.join(BUILD, 'index.html'))) {
  console.log('Compilando la app (react-scripts build)…');
  execSync('npx react-scripts build', { cwd: RAIZ, stdio: 'inherit', shell: true });
}

// ── Datos simulados ─────────────────────────────────────────────────────
// Pagos completos de las cuotas con fecha ≤ hasta (para el crédito del prepago).
const pagarHasta = (c, hasta) => ({ ...c, pagos: vencimientosCredito(c).filter(v => v.fecha <= hasta).map((v, i) => ({
  id: `p-${c.uid}-${i}`, vencKey: v.key, fecha: v.fecha, capital: v.capital, interes: v.interes, cargos: v.cargos, sinDesglose: 0,
  tipo: 'pago', nota: 'Pago simulado', usuario: 'vista previa', ts: `${v.fecha}T12:00:00Z` })) });

const creditos = [
  // 1) CRÉDITO CON CUOTAS + PAGO PARCIAL: capital constante trimestral. Q1 pagada; Q2 con abono
  //    de 50.000 desde una nómina (interés 6.066,67 + capital 43.933,33).
  { uid: 'A', n: 1, tipo_credito: 'contrato', empresa: 'Osiris', acreedor: 'Banco Demo', moneda: 'USD', tipo_cr: 'Capital de trabajo',
    monto: 400000, fecha_desembolso: '2026-01-10', primer_venc: '2026-04-10', vencimiento_final: '2027-01-10', periodicidad: 3, modalidad: 'lineal',
    tasa_tipo: 'fija', tasa_anual: 8, base: 'act360', control_desde: '2026-01-10', prepago_comision_tipo: 'meses_interes', prepago_comision_valor: 1,
    pagos: [
      { id: 'pA1', vencKey: 'A@2026-04-10', fecha: '2026-04-10', capital: 100000, interes: 8000, cargos: 0, sinDesglose: 0, tipo: 'pago', usuario: 'vista previa', ts: '2026-04-10T12:00:00Z' },
      { id: 'pNom', vencKey: 'A@2026-07-10', fecha: '2026-07-10', capital: 43933.33, interes: 6066.67, cargos: 0, sinDesglose: 0, tipo: 'pago',
        origen: { tipo: 'nomina', clave: 'nomina:NOMX:IT1', nominaId: 'NOMX', itemId: 'IT1', nombreNomina: 'Nómina Osiris (simulada)' }, usuario: 'vista previa', ts: '2026-07-10T15:00:00Z' },
    ] },
  // 2) BULLET con intereses semestrales: capital al vencimiento.
  { uid: 'G', n: 7, tipo_credito: 'contrato', empresa: 'Allegria Foods', acreedor: 'Banco Bullet Demo', moneda: 'USD', tipo_cr: 'Capital de trabajo',
    monto: 250000, fecha_desembolso: '2026-04-15', vencimiento_final: '2027-04-15', periodicidad: 6, modalidad: 'bullet_int',
    tasa_tipo: 'fija', tasa_anual: 6, base: 'act365', control_desde: '2026-04-15', prepago_comision_tipo: 'ninguna' },
  // 3) PREPAGO: cuota fija mensual, cuotas abr–sep pagadas; comisión de prepago 1 % del capital.
  pagarHasta({ uid: 'H', n: 8, tipo_credito: 'contrato', empresa: 'Integrity Farms', acreedor: 'Banco Prepago Demo', moneda: 'USD', tipo_cr: 'Capital de trabajo',
    monto: 300000, fecha_desembolso: '2026-03-01', primer_venc: '2026-04-01', vencimiento_final: '2027-02-01', periodicidad: 1, modalidad: 'frances',
    tasa_tipo: 'fija', tasa_anual: 7.2, base: 'act360', control_desde: '2026-03-01', prepago_comision_tipo: 'pct', prepago_comision_valor: 1 }, '2026-10-01'),
  // 4) UF: dos cuotas semestrales. La del 09-10-2026 tiene UF publicada para esa fecha;
  //    la del 09-04-2027 todavía no → UF como hipótesis de proyección.
  { uid: 'F', n: 6, tipo_credito: 'contrato', empresa: 'Mediterra', acreedor: 'Banco UF Demo', moneda: 'UF', tipo_cr: 'Inversión',
    monto: 1000, fecha_desembolso: '2026-04-09', primer_venc: '2026-10-09', vencimiento_final: '2027-04-09', periodicidad: 6, modalidad: 'lineal',
    tasa_tipo: 'fija', tasa_anual: 3.5, base: 'act360', control_desde: '2026-04-09', prepago_comision_tipo: 'ninguna' },
  // Registros antiguos sin desglose (vencidos antes del control → por conciliar)
  { uid: 'B1', n: 30, empresa: 'Osiris', acreedor: 'Banco Security', tipo_inst: 'Banco', monto: 9178, cuota: 9178, f_venc: '2026-07-31', tipo_cr: 'Cuotas Mensuales', pagado: false },
  { uid: 'B2', n: 31, empresa: 'Osiris', acreedor: 'Banco Security', tipo_inst: 'Banco', monto: 9178, cuota: 9178, f_venc: '2026-12-31', tipo_cr: 'Cuotas Mensuales', pagado: false },
  { uid: 'B3', n: 36, empresa: 'Mediterra', acreedor: 'Privado Particular', tipo_inst: 'Privado', monto: 550000, cuota: 550000, f_venc: '2027-01-01', tipo_cr: 'Inversión', tasa: '12.6%', pagado: false },
  { uid: 'B4', n: 35, empresa: 'Mediterra', acreedor: 'Privado Particular', tipo_inst: 'Privado', monto: 34650, cuota: 34650, f_venc: '2026-09-01', tipo_cr: 'Inversión', tasa: '12.6%', pagado: false },
  // Otras monedas: CLP con TC de Maestros; PEN sin TC; EUR con TC declarado (estimado)
  { uid: 'C', n: 3, tipo_credito: 'contrato', empresa: 'Allegria Service', acreedor: 'Banco CLP Demo', moneda: 'CLP', tipo_cr: 'Capital de trabajo',
    monto: 95000000, fecha_desembolso: '2026-06-01', vencimiento_final: '2026-12-01', modalidad: 'bullet_total', tasa_tipo: 'fija', tasa_anual: 6, base: 'act360', control_desde: '2026-06-01' },
  { uid: 'D', n: 4, tipo_credito: 'contrato', empresa: 'Frisku Foods', acreedor: 'Banco Perú Demo', moneda: 'PEN', tipo_cr: 'Capital de trabajo',
    monto: 300000, fecha_desembolso: '2026-07-01', vencimiento_final: '2027-07-01', modalidad: 'bullet_int', periodicidad: 6, tasa_tipo: 'variable',
    tasa_ref_nombre: 'TAMN', tasa_ref_hipotesis: 9, margen: 2, base: 'act360', control_desde: '2026-07-01' },
  { uid: 'E', n: 5, tipo_credito: 'contrato', empresa: 'Allegria Foods', acreedor: 'Banco EUR Demo', moneda: 'EUR', tipo_cr: 'Capital de trabajo',
    monto: 100000, fecha_desembolso: '2026-08-01', vencimiento_final: '2027-02-01', modalidad: 'bullet_total', tasa_tipo: 'fija', tasa_anual: 5, base: 'act360',
    control_desde: '2026-08-01', tc_flujo: 0.85, tc_flujo_fecha: '2026-09-01' },
];

const base = nuevoStore();
const datos = {
  base: Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v.value])),
  creditos,
};

const semilla = `/* Datos SIMULADOS de la vista previa (generado por armar.mjs). */
window.__VP_DATOS = ${JSON.stringify(datos)};
window.__VP_SEMILLA = function () {
  var D = JSON.parse(JSON.stringify(window.__VP_DATOS));
  var hoy = new Date();
  var iso = function (d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  var menos = function (n) { var d = new Date(hoy); d.setDate(d.getDate() - n); return iso(d); };
  var HOY = iso(hoy);
  var ts = function (ms) { return new Date(Date.now() - ms).toISOString(); };
  var store = {}; var t = 60000;
  Object.keys(D.base).forEach(function (k) { store[k] = { value: D.base[k], updated_at: ts(t -= 1000) }; });
  // Mes en curso en el flujo (Apr-26 = índice 0)
  var idxHoy = (hoy.getFullYear() - 2026) * 12 + hoy.getMonth() - 3;
  store.finanzas.value.creditos_data = D.creditos;
  store.finanzas.value.creditos_saldos_informados = [
    { id: 's1', empresa: 'Osiris', acreedor: 'Banco Demo', moneda: 'USD', fecha: HOY, capital: 300000, respaldo: 'Certificado de deuda SIMULADO', usuario: 'vista previa', ts: ts(30000) },
    { id: 's2', empresa: 'Mediterra', acreedor: 'Privado Particular', moneda: 'USD', fecha: HOY, capital: 550000, respaldo: 'Carta del acreedor SIMULADA', usuario: 'vista previa', ts: ts(30000) },
    { id: 's3', empresa: 'Mediterra', acreedor: 'Banco UF Demo', moneda: 'UF', fecha: HOY, capital: 1000.0003, respaldo: 'Certificado SIMULADO en UF', usuario: 'vista previa', ts: ts(30000) },
  ];
  // Valor manual ANTIGUO en Pago Préstamos de Osiris (mes en curso y siguiente): cobertura por definir
  var ov = {}; ov[String(idxHoy)] = 150000; ov[String(idxHoy + 1)] = 20000;
  store.finanzas.value.finanzas_real = { Osiris: { _proyOverrides: { 'egr_nop::Pago Préstamos - Total': ov } } };
  // Tipo de cambio (Maestros) con fechas relativas a hoy. UF del 09-10-2026 = valor publicado de esa fecha.
  store.maestro_tc = { updated_at: ts(20000), value: {
    'USD-CLP': [ { fecha: menos(6), valor: 948, fuente: 'simulado' }, { fecha: menos(2), valor: 955, fuente: 'manual' } ],
    'UF-CLP':  [ { fecha: menos(30), valor: 40012.55, fuente: 'simulado' }, { fecha: menos(1), valor: 40118.27, fuente: 'simulado' },
                 { fecha: '2026-10-09', valor: 40131.84, fuente: 'simulado' } ] } };
  // Nóminas de Osiris: semana en curso en borrador, sin vincular (vincular NO registra pago);
  // semana anterior aprobada, vinculada a la cuota 10-10 SIN pago ("Confirmar pago efectivo");
  // dos semanas atrás aprobada, con el abono de la cuota 10-07 ya registrado en Créditos.
  var tt = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())); tt.setUTCDate(tt.getUTCDate() + 4 - (tt.getUTCDay() || 7));
  var sem = Math.ceil((((tt - new Date(Date.UTC(tt.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7);
  var nom = function (id, numero, item, estado, semana) { estado = estado || 'aprobada'; return { id: id, empresa: 'Osiris', semana: semana, 'año': tt.getUTCFullYear(), numero: numero, fecha: HOY, tc: 955, estado: estado,
    preparadoPor: 'vista previa', revisadoPor: '', aprobadoPor: estado === 'aprobada' ? 'Angelo Huerta' : '', aprobado1Por: '', fechaAprobacion: '', fechaAprobacion1: '',
    items: [item], bancos: {}, notas: '', seccionesExtra: [], estadoNomina: 'activa', historial: [] }; };
  var item = function (id, concepto, usd, vinculo) { var x = { id: id, seccion: 'pagos_usd', tipoDoc: 'Factura', proveedor: 'Banco Demo', rut: '', nDoc: '', fDoc: '', fVenc: '', semVenc: '',
    concepto: concepto, montoCLP: 0, montoUSD: usd, montoPEN: 0, comentario: '', pagado: false, anticipo: 0, estadoLinea: 'activa', historial: [], documentos: [] };
    if (vinculo) x.creditoVinculo = vinculo; return x; };
  store.nominas_v2_done = { value: JSON.stringify({ migrado: true }), updated_at: ts(15000) };
  store.nominas_osiris = { updated_at: ts(14000), value: JSON.stringify({ nominas: [
    nom('NOMZ', 1, item('IT3', 'Cuota ene-27 Banco Demo (sin vincular)', 20000, null), 'borrador', sem),
    nom('NOMY', 1, item('IT2', 'Cuota Q3 Banco Demo (abono parcial)', 30000, { uid: 'A', vencKey: 'A@2026-10-10', acreedor: 'Banco Demo', fecha: '2026-10-10' }), 'aprobada', sem - 1),
    nom('NOMX', 1, item('IT1', 'Cuota Q2 Banco Demo (abono)', 50000, { uid: 'A', vencKey: 'A@2026-07-10', acreedor: 'Banco Demo', fecha: '2026-07-10' }), 'aprobada', sem - 2) ] }) };
  return store;
};
`;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
// Copia del build sin source maps (pesan ~11 MB y no hacen falta).
const copiar = (de, a) => {
  fs.mkdirSync(a, { recursive: true });
  for (const f of fs.readdirSync(de)) {
    const s = path.join(de, f), d = path.join(a, f);
    if (fs.statSync(s).isDirectory()) copiar(s, d);
    else if (!f.endsWith('.map') && f !== 'index.html') fs.copyFileSync(s, d);
  }
};
copiar(BUILD, OUT);
fs.copyFileSync(path.join(AQUI, 'shim.js'), path.join(OUT, 'shim.js'));
fs.copyFileSync(path.join(AQUI, 'diff.js'), path.join(OUT, 'diff.js'));
fs.writeFileSync(path.join(OUT, 'semilla.js'), semilla);

const idx = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
const js = /src="\/(static\/js\/main\.[^"]+\.js)"/.exec(idx)[1];
const css = /href="\/(static\/css\/main\.[^"]+\.css)"/.exec(idx)[1];
const fuentes = '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>';
const cuerpo = (auto) => `<title>Vista previa Créditos</title>
${fuentes}
<link href="${css}" rel="stylesheet"/>
<div id="root"></div>
<script>window.__VP_DIALOGOS_EN_PAGINA = ${auto}; window.__VP_PERMITIR_RESPALDO = ${!auto};</script>
<script src="semilla.js"></script>
<script src="diff.js"></script>
<script src="shim.js"></script>
<script src="${js}"></script>
`;
// Versión LOCAL: aislada aunque el simulador (shim.js) no se cargue. La política de
// contenido del navegador solo permite conexiones al propio localhost, a las fuentes
// del tipo de cambio/UF y a las librerías de exportación: cualquier llamada a la base
// de producción (HTTP o WebSocket), al correo o a otro sitio la bloquea el navegador.
// El simulador intercepta sus llamadas ANTES de la red, así que no le afecta.
// Incidente 2026-10-07: en un equipo Windows el simulador no se activó y la app
// abrió contra producción (ver docs/creditos-respaldo-local.md).
const CSP_LOCAL = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://unpkg.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://mindicador.cl https://api.frankfurter.app https://open.er-api.com",
  "worker-src 'self' blob:",
  "frame-src 'none'", "form-action 'none'", "base-uri 'none'",
].join('; ');
// Si el simulador no quedó activo, la página lo dice y no se puede confundir con la app.
const GUARDIA_LOCAL = `<script>if(!window.__VP_LISTO){window.__VP_NO_AISLADA=true;document.write('<div style="position:fixed;inset:0;z-index:2147483647;background:#7f1d1d;color:#fff;font:16px/1.5 system-ui,sans-serif;padding:40px">'+'<b>VISTA PREVIA NO AISLADA: el simulador no se cargó.</b><br>Cierra esta pestaña y avisa. La conexión a la base de producción está bloqueada en esta página, pero no la uses.</div>');}</script>`;
fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html><html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta http-equiv="Content-Security-Policy" content="${CSP_LOCAL}"/></head><body>
${cuerpo(false).replace('<script src="' + js + '"></script>', GUARDIA_LOCAL + '\n<script src="' + js + '"></script>')}</body></html>
`);
fs.writeFileSync(path.join(OUT, 'artifact.html'), cuerpo(true));
console.log(`Vista previa armada en ${OUT}\n  Local:    node scripts/vista-previa/servir.mjs   → http://localhost:4180\n  Artifact: publicar artifact.html con los archivos de la carpeta`);
