/* ─────────────────────────────────────────────────────────────────────────
   EFECTOS DE SOLO NAVEGAR — inventario antes de probar en producción.

   ¿Qué escribe o envía la app si alguien solo entra y recorre pantallas, sin
   editar nada? Corre la app real contra el Supabase FALSO (aislado), primero
   una sesión de siembra y después, ya en régimen, una sesión por perfil
   (admin y consulta). Registra por paso: escrituras a calendario_data y a
   otras tablas, subidas a Storage, llamadas a /api/* y a EmailJS.
   Solo hace clic en pestañas de navegación (nunca Guardar/Nuevo/Eliminar…).

   Uso:  APP_URL=http://127.0.0.1:4173 OUT_DIR=/tmp/efectos node scripts/e2e/efectos-navegacion.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { nuevoStore } from './fake.mjs';
import { abrirApp, login, cerrarAvisos, BASE } from './lib.mjs';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(OUT, { recursive: true });
const PIN_CONSULTA = '135790';
const cred = (pin) => { const salt = crypto.randomBytes(16); return JSON.stringify({ v: 1, iter: 100000, salt: salt.toString('hex'), hash: crypto.pbkdf2Sync(pin, salt, 100000, 32, 'sha256').toString('hex') }); };
const MODULOS = ['Administración y Finanzas', 'Genética Diferenciada', 'Flujo de Caja Grupo Mediterra', 'Exportación Fruta Fresca', 'Connecting Quality', 'Sistema Contable Grupo Mediterra', 'Proceso de Fruta Fresca (Planta)'];
const NO_TOCAR = /guardar|nuev|agregar|crear|eliminar|borrar|marcar|aprobar|rechazar|pagar|enviar|subir|importar|exportar|descargar|excel|pdf|imprimir|respaldo|restaurar|salir|pin|permisos|reset|anular|registrar|ingresar real|\+|✕|×|🗑|mediterra$|vencidas|actualizar|resolver/i;

async function sesion(store, perfil, { email, pin }, modulos = MODULOS) {
  const { browser, ctx, page } = await abrirApp(store);
  let paso = 'login';
  const efectos = [];
  page.on('dialog', d => d.dismiss().catch(() => {}));
  // tablas de Contabilidad y Storage: el fake base no las emula
  await ctx.route(u => /supabase\.co\/(rest\/v1\/(?!calendario_data)|storage|functions)/.test(u.href), r => {
    const m = r.request().method();
    if (m !== 'GET') efectos.push({ paso, tipo: 'escritura otra tabla/Storage', det: `${m} ${new URL(r.request().url()).pathname}` });
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '[]' });
  });
  await ctx.route(/mindicador|frankfurter|er-api/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  page.on('request', r => {
    const u = r.url(), m = r.method();
    if (/supabase\.co\/rest\/v1\/calendario_data/.test(u) && m !== 'GET') {
      let id = (/id=eq\.([^&]+)/.exec(u) || [])[1]; let body = null;
      try { body = JSON.parse(r.postData() || '{}'); } catch (_) {}
      if (!id && body) id = Array.isArray(body) ? body.map(x => x.id).join(',') : body.id;
      id = decodeURIComponent(id || '?');
      // Qué claves cambian (solo nombres; nunca valores)
      const nuevo = body && !Array.isArray(body) ? body.value : null;
      const viejo = store[id] ? store[id].value : null;
      const parse = v => { if (typeof v === 'string') { try { return JSON.parse(v); } catch (_) { return v; } } return v; };
      const a = parse(viejo) || {}, b2 = parse(nuevo) || {};
      const claves = typeof a === 'object' && typeof b2 === 'object'
        ? [...new Set([...Object.keys(a), ...Object.keys(b2)])].filter(k => JSON.stringify(a[k]) !== JSON.stringify(b2[k]))
        : ['(valor completo)'];
      efectos.push({ paso, tipo: 'escritura calendario_data', det: `${m} ${id} · cambia: ${claves.slice(0, 6).join(', ') || '(nada: reescribe el mismo valor)'}${claves.length > 6 ? ' …' : ''}` });
    }
    if (u.startsWith(BASE + '/api/')) efectos.push({ paso, tipo: 'llamada /api', det: `${m} ${u.slice(BASE.length)}` + (/send-email/.test(u) ? ' (CORREO)' : '') });
    if (/emailjs/.test(u)) efectos.push({ paso, tipo: 'CORREO (EmailJS)', det: `${m} ${u}` });
  });
  await page.goto(BASE); await page.locator('input[type=email]').waitFor({ timeout: 20000 });
  await page.locator('input[type=email]').fill(email); await page.locator('input[type=password]').fill(pin); await page.keyboard.press('Enter');
  await page.waitForTimeout(2500); await cerrarAvisos(page);
  paso = 'hub (esperando 8 s)'; await page.waitForTimeout(8000);
  for (const mod of modulos) {
    // al recargar, la app vuelve al último módulo (sessionStorage); se limpia esa clave
    await page.evaluate(() => { try { sessionStorage.removeItem('mediterra_modulo'); } catch (_) {} });
    await page.goto(BASE); await page.waitForTimeout(1500);
    if (await page.locator('input[type=email]').count()) {   // la recarga pidió login de nuevo
      paso = `login (antes de ${mod})`;
      await page.locator('input[type=email]').fill(email); await page.locator('input[type=password]').fill(pin); await page.keyboard.press('Enter');
      await page.waitForTimeout(2500); await cerrarAvisos(page);
    }
    const tile = page.getByRole('button', { name: new RegExp(mod.replace(/[()]/g, '\\$&')) }).first();
    if (!(await tile.count())) continue;
    paso = `entrar: ${mod}`; await tile.click(); await page.waitForTimeout(3500); await cerrarAvisos(page);
    const textos = [...new Set(await page.getByRole('button').evaluateAll(bs => bs.map(b => (b.innerText || '').trim()).filter(t => t && t.length < 30)))];
    for (const t of textos.filter(t => !NO_TOCAR.test(t)).slice(0, 20)) {
      paso = `${mod} › ${t}`;
      const b = page.getByRole('button', { name: t, exact: true }).first();
      if (!(await b.isVisible().catch(() => false))) continue;
      await b.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(900);
      await page.keyboard.press('Escape');
    }
    paso = `salir de: ${mod}`; await page.waitForTimeout(2500);
  }
  await browser.close();
  return efectos;
}

// 1) Siembra: deja el store en régimen (usuarios fusionados, filas creadas).
const store = nuevoStore();
await sesion(store, 'siembra', { email: 'ahuerta@grupomediterra.cl', pin: '482913' });
// Usuario de consulta con PIN propio (solo en el store falso).
const main = store.main.value;
const usuarios = (store.usuarios && store.usuarios.value && store.usuarios.value.usuarios) || main.usuarios || [];
const consulta = { nombre: 'Consulta Prueba', cargo: 'Auditor', email: 'consulta@prueba.cl', rol: 'consulta', modulos: ['tareas', 'osiris', 'finanzas', 'contabilidad', 'allegria', 'frisku', 'allegria_service'], esCFO: false };
usuarios.push(consulta);
if (store.usuarios && store.usuarios.value && Array.isArray(store.usuarios.value.usuarios)) store.usuarios.value.usuarios = usuarios; else main.usuarios = usuarios;
store.pins.value['Consulta Prueba_h'] = cred(PIN_CONSULTA);
const t = new Date(Date.now() - 60000).toISOString(); Object.values(store).forEach(f => { if (f && f.updated_at) f.updated_at = t; });

// 2) Régimen: una sesión por perfil sobre una copia del mismo store.
const copia = () => JSON.parse(JSON.stringify(store));
const res = {
  admin: await sesion(copia(), 'admin', { email: 'ahuerta@grupomediterra.cl', pin: '482913' }),
  consulta: await sesion(copia(), 'consulta', { email: 'consulta@prueba.cl', pin: PIN_CONSULTA }),
};
fs.writeFileSync(path.join(OUT, 'efectos-navegacion.json'), JSON.stringify(res, null, 2));
for (const [perfil, ef] of Object.entries(res)) {
  console.log(`\n═══ ${perfil}: ${ef.length} efectos ═══`);
  const agg = {}; ef.forEach(e => { const k = `${e.tipo} · ${e.det}`; (agg[k] ||= new Set()).add(e.paso); });
  Object.entries(agg).forEach(([k, pasos]) => console.log(`  ${k}\n     en: ${[...pasos].slice(0, 4).join(' ; ')}${pasos.size > 4 ? ` (+${pasos.size - 4})` : ''}`));
}
