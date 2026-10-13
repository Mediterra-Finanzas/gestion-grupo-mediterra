/* Auditoría oct-2026 · pérdida de datos (navegador, Supabase falso, datos FICTICIOS).
     APP_URL=http://127.0.0.1:4173 node scripts/e2e/auditoria-persistencia.mjs
   Falla (exit 1) mientras alguno de los defectos esté presente. Ver docs/auditoria-funcional-2026-10.md. */
// Evidencia en navegador sobre main vigente (Supabase falso, datos FICTICIOS).
//  A1. Dos sesiones: la segunda escritura de la sesión A borra los eventos de B en audit_log.
//  A2. Lectura fallida de audit_log: el siguiente guardado reemplaza todo el registro.
//  B.  Fila `main` guardada como texto (como la deja «Restaurar respaldo»): ¿se pierden las tareas?
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';
import { instalarFake, nuevoStore, PIN, EMAIL, leerFila } from './fake.mjs';
const BASE = process.env.APP_URL;
let fallos = 0;
const hecho = (n, c, x = '') => { console.log(`${c ? 'DEFECTO PRESENTE' : 'sin defecto'} · ${n}${x ? ' — ' + x : ''}`); if (c && !n.startsWith('B-control')) fallos++; };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
async function sesion(store, antes) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, timezoneId: 'America/Santiago' });
  await instalarFake(ctx, store);
  if (antes) await antes(ctx);
  await ctx.route(/vercel\.app|open\.er-api\.com|mindicador\.cl|frankfurter\.app|emailjs|api\/send-email/, r => r.abort());
  const p = await ctx.newPage();
  await p.goto(BASE); await p.locator('input[type=email]').fill(EMAIL); await p.locator('input[type=password]').fill(PIN); await p.keyboard.press('Enter');
  await p.waitForTimeout(3000);
  return { ctx, p };
}
const eventos = (st) => { const v = leerFila(st, 'audit_log'); return (v && v.eventos) || []; };
const reciente = new Date(Date.now() - 86400000).toISOString();

// A1
{
  const st = nuevoStore(); st.audit_log = { value: { eventos: [{ id: 'ev_previo', timestamp: reciente, accion: 'editar', descripcion: 'evento previo ficticio' }] }, updated_at: new Date().toISOString() };
  const A = await sesion(st); await A.p.waitForTimeout(6500);              // A: primera escritura (lee y cachea)
  const B = await sesion(st); await B.p.evaluate(() => window.auditLog('editar', { descripcion: 'evento de la sesión B' })); await B.p.waitForTimeout(6500);
  const conB = eventos(st).some(e => e.descripcion === 'evento de la sesión B');
  await A.p.evaluate(() => window.auditLog('editar', { descripcion: 'segundo evento de la sesión A' })); await A.p.waitForTimeout(6500);
  const ev = eventos(st);
  hecho('A1 · dos sesiones: la escritura de A borra el evento de B en audit_log', conB && !ev.some(e => e.descripcion === 'evento de la sesión B'),
    `tras B: ${conB ? 'evento B guardado' : 'evento B NO guardado'}; tras A: ${ev.length} eventos, evento B ${ev.some(e => e.descripcion === 'evento de la sesión B') ? 'presente' : 'AUSENTE'}`);
  await A.ctx.close(); await B.ctx.close();
}
// A2
{
  const st = nuevoStore(); st.audit_log = { value: { eventos: Array.from({ length: 5 }, (_, i) => ({ id: `ev_${i}`, timestamp: reciente, accion: 'editar', descripcion: `evento previo ${i}` })) }, updated_at: new Date().toISOString() };
  let caida = true;
  const A = await sesion(st, async (ctx) => ctx.route(/id=eq\.audit_log/, (r) => (caida && r.request().method() === 'GET') ? r.fulfill({ status: 503, body: '{"message":"no disponible (simulado)"}', contentType: 'application/json' }) : r.fallback()));
  await A.p.waitForTimeout(6500); caida = false;
  const ev = eventos(st);
  hecho('A2 · una lectura fallida de audit_log hace que el guardado reemplace el registro completo', !ev.some(e => /evento previo/.test(e.descripcion || '')), `antes 5 eventos previos; después ${ev.length} eventos, previos: ${ev.filter(e => /evento previo/.test(e.descripcion || '')).length}`);
  await A.ctx.close();
}
// B
{
  const st = nuevoStore();
  const mainObj = { ...st.main.value, estados: { m3: { estadoResp: 'verde', estadoSup: 'verde', aprobado: true } }, comentarios: { m3: 'comentario ficticio' }, tareasConfig: { m3: { diaLimite: 9 } }, supervisores: { m3: 'Carol Machuca' }, tareasExtra: [{ id: 'x1', nombre: 'Tarea extra ficticia' }], tareasOverrides: { m3: { frecuencia: 'Mensual' } }, recsComentarios: { r1: 'nota ficticia' } };
  st.main = { value: JSON.stringify(mainObj), updated_at: new Date().toISOString() };   // como queda tras «Restaurar respaldo»
  const A = await sesion(st); await A.p.waitForTimeout(5000);
  const raw = st.main.value; const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const esc = (st.__escrituras || []).filter(e => e.id === 'main');
  hecho('B · fila main como texto: al abrir, el guardado automático pierde datos de Tareas', Object.values({estados:v.estados?.m3?.estadoResp==='verde',comentarios:v.comentarios?.m3==='comentario ficticio',tareasConfig:v.tareasConfig?.m3?.diaLimite===9,supervisores:v.supervisores?.m3==='Carol Machuca',tareasExtra:(v.tareasExtra||[]).some(t=>t.id==='x1'),tareasOverrides:v.tareasOverrides?.m3?.frecuencia==='Mensual',recsComentarios:v.recsComentarios?.r1==='nota ficticia'}).some(c=>!c),
    `campos: ${Object.entries({estados:v.estados?.m3?.estadoResp==='verde',comentarios:v.comentarios?.m3==='comentario ficticio',tareasConfig:v.tareasConfig?.m3?.diaLimite===9,supervisores:v.supervisores?.m3==='Carol Machuca',tareasExtra:(v.tareasExtra||[]).some(t=>t.id==='x1'),tareasOverrides:v.tareasOverrides?.m3?.frecuencia==='Mensual',recsComentarios:v.recsComentarios?.r1==='nota ficticia'}).map(([k,c])=>k+'='+(c?'se conserva':'PERDIDO')).join(', ')}; tipo guardado: ${typeof raw}`);
  await A.ctx.close();
}
// B
{
  const st = nuevoStore();
  const mainObj = { ...st.main.value, estados: { m3: { estadoResp: 'verde', estadoSup: 'verde', aprobado: true } }, comentarios: { m3: 'comentario ficticio' }, tareasConfig: { m3: { diaLimite: 9 } }, supervisores: { m3: 'Carol Machuca' }, tareasExtra: [{ id: 'x1', nombre: 'Tarea extra ficticia' }], tareasOverrides: { m3: { frecuencia: 'Mensual' } }, recsComentarios: { r1: 'nota ficticia' } };
  st.main = { value: mainObj, updated_at: new Date().toISOString() };   // como queda tras «Restaurar respaldo»
  const A = await sesion(st); await A.p.waitForTimeout(5000);
  const raw = st.main.value; const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const esc = (st.__escrituras || []).filter(e => e.id === 'main');
  hecho('B-control · fila main como OBJETO: al abrir, el guardado automático pierde datos de Tareas', Object.values({estados:v.estados?.m3?.estadoResp==='verde',comentarios:v.comentarios?.m3==='comentario ficticio',tareasConfig:v.tareasConfig?.m3?.diaLimite===9,supervisores:v.supervisores?.m3==='Carol Machuca',tareasExtra:(v.tareasExtra||[]).some(t=>t.id==='x1'),tareasOverrides:v.tareasOverrides?.m3?.frecuencia==='Mensual',recsComentarios:v.recsComentarios?.r1==='nota ficticia'}).some(c=>!c),
    `campos: ${Object.entries({estados:v.estados?.m3?.estadoResp==='verde',comentarios:v.comentarios?.m3==='comentario ficticio',tareasConfig:v.tareasConfig?.m3?.diaLimite===9,supervisores:v.supervisores?.m3==='Carol Machuca',tareasExtra:(v.tareasExtra||[]).some(t=>t.id==='x1'),tareasOverrides:v.tareasOverrides?.m3?.frecuencia==='Mensual',recsComentarios:v.recsComentarios?.r1==='nota ficticia'}).map(([k,c])=>k+'='+(c?'se conserva':'PERDIDO')).join(', ')}; tipo guardado: ${typeof raw}`);
  await A.ctx.close();
}
await browser.close();
console.log(fallos ? `\n${fallos} defecto(s) presente(s)` : '\nNingún defecto presente · Chromium emulado · datos ficticios');
process.exit(fallos ? 1 : 0);
