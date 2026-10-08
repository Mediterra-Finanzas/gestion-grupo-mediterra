/* ─────────────────────────────────────────────────────────────────────────
   TIEMPO REAL POR FILA (navegador, Supabase falso + Realtime EMULADO, datos ficticios).

   El servidor Realtime se emula con page.routeWebSocket:
     · un tópico con filtro `...:id=eq.X` recibe SOLO los cambios de la fila X
       (como el filtro de Supabase);
     · el tópico sin filtro `realtime:public:calendario_data` recibe TODAS las filas
       (el comportamiento que tenía la app antes de este cambio).
   Es una emulación del CLIENTE: prueba qué pide y qué aplica la app. Que el Realtime
   real del proyecto respete el filtro no se puede probar acá (docs §4.14).

   Uso: APP_URL=http://127.0.0.1:4195 OUT_DIR=/tmp/rt node scripts/e2e/realtime-filas.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import { nuevoStore, instalarFake, PIN } from './fake.mjs';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';

let ok = 0, fallos = 0;
const check = (n, c, x = '') => { c ? ok++ : fallos++; console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); };
const st = nuevoStore();
st.pins.value['Carol Machuca_h'] = st.pins.value['Angelo Huerta_h'];
st.usuarios = { updated_at: new Date(Date.now() - 44000).toISOString(), value: [
  { nombre: 'Milagros Becerra', rol: 'editor', modulos: ['tareas'] },
  { nombre: 'Carol Machuca', cargo: 'Analista Finanzas', rol: 'editor', modulos: ['tareas', 'finanzas'],
    tab_permisos: { finanzas: { dashboard: 'sin_acceso', flujo: 'sin_acceso', bancos: 'editar', creditos: 'sin_acceso', nominas: 'editar', reporte: 'sin_acceso', params: 'sin_acceso', auditoria: 'sin_acceso', eeff: 'sin_acceso', rendiciones: 'ver' } } },
  { nombre: 'Michelle Garcia', rol: 'editor', modulos: ['tareas', 'contabilidad'] },
  { nombre: 'Pablo Duran', rol: 'editor', modulos: ['tareas', 'contabilidad'] },
  { nombre: 'Angelo Huerta', rol: 'admin', modulos: ['tareas', 'finanzas'] },
  { nombre: 'Nicolás Fuenzalida', rol: 'gerente_tecnico', modulos: ['osiris'] },
] };
st.nominas_remuneraciones = { updated_at: new Date().toISOString(), value: JSON.stringify({ v: 1, nominas: [{ id: 'r', items: [{ trabajador: 'SECRETO-REM', montoCLP: 999 }] }] }) };
st.frisku_liquidaciones = { updated_at: new Date().toISOString(), value: JSON.stringify([{ id: 'l', ventaTotal: 'SECRETO-LIQ' }]) };

const sockets = [];   // { quien, ws, topics:Set, recibidos:[] }
function publicar(id) {
  const f = st[id];
  for (const s of sockets) for (const t of s.topics) {
    const m = /:id=eq\.(.+)$/.exec(t);
    if (m ? m[1] === id : t === 'realtime:public:calendario_data') {
      s.ws.send(JSON.stringify({ topic: t, event: 'UPDATE', payload: { record: { id, value: f.value, updated_at: f.updated_at } } }));
      s.recibidos.push(id);
    }
  }
}
async function contexto(quien) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, timezoneId: 'America/Santiago' });
  await instalarFake(ctx, st);
  await ctx.route(/open\.er-api\.com|mindicador\.cl|frankfurter\.app/, r => r.abort());
  await ctx.routeWebSocket(/realtime\/v1\/websocket/, ws => {
    const s = { quien, ws, topics: new Set(), recibidos: [] }; sockets.push(s);
    ws.onMessage(raw => { try { const m = JSON.parse(String(raw));
      if (m.event === 'phx_join') { s.topics.add(m.topic); ws.send(JSON.stringify({ topic: m.topic, event: 'phx_reply', ref: m.ref, payload: { status: 'ok', response: {} } })); }
    } catch (e) {} });
  });
  const page = await ctx.newPage();
  const errores = []; page.on('pageerror', e => errores.push(String(e).slice(0, 160)));
  await page.goto(process.env.APP_URL, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type=email]').waitFor({ timeout: 20000 });
  return { browser, page, errores };
}
async function entrar(p, email) {
  await p.locator('input[type=email]').fill(email); await p.locator('input[type=password]').fill(PIN); await p.keyboard.press('Enter');
  await p.waitForTimeout(2500);
  for (const t of ['Entendido', 'Aceptar']) { const b = p.getByRole('button', { name: t }); if (await b.count()) await b.first().click().catch(() => {}); }
}
const topicsDe = (q) => [...new Set(sockets.filter(s => s.quien === q).flatMap(s => [...s.topics]))].sort();
const recibidosDe = (q) => sockets.filter(s => s.quien === q).flatMap(s => s.recibidos);
const tocar = (id, valor) => { st[id] = { value: typeof valor === 'string' ? valor : valor, updated_at: new Date().toISOString() }; };

// ── 1. Pantalla de ingreso, sin sesión ──
const anon = await contexto('anon');
await anon.page.waitForTimeout(1500);
check('Sin sesión: ningún canal de datos abierto', topicsDe('anon').length === 0, topicsDe('anon').join(','));

// ── 2. Carol: hub ──
const carol = await contexto('carol');
await entrar(carol.page, 'cmachuca@grupomediterra.cl');
check('Carol (hub): se une solo a main y usuarios, con filtro', JSON.stringify(topicsDe('carol')) === JSON.stringify(['realtime:public:calendario_data:id=eq.main', 'realtime:public:calendario_data:id=eq.usuarios']), topicsDe('carol').join(' | '));
// Sincronización de `usuarios`: otro admin cambia el cargo de Carol
const us = st.usuarios.value.map(u => u.nombre === 'Carol Machuca' ? { ...u, cargo: 'Cargo Sincronizado RT' } : u);
tocar('usuarios', us); publicar('usuarios'); await carol.page.waitForTimeout(1500);
check('Sincroniza: el cambio de `usuarios` llega y se ve en el hub', /Cargo Sincronizado RT/.test(await carol.page.locator('body').innerText()));

// ── 3. Angelo en Créditos (Finanzas) ──
const ang = await contexto('angelo');
await entrar(ang.page, 'ahuerta@grupomediterra.cl');
await ang.page.getByRole('button', { name: /Flujo de Caja Grupo Mediterra/ }).first().click(); await ang.page.waitForTimeout(4000);
await ang.page.getByRole('button', { name: /Créditos/ }).first().click(); await ang.page.waitForTimeout(1500);
check('Angelo en Finanzas: además se une a la fila finanzas (con filtro)', topicsDe('angelo').includes('realtime:public:calendario_data:id=eq.finanzas') && topicsDe('angelo').every(t => /:id=eq\./.test(t)), topicsDe('angelo').join(' | '));
const fin = typeof st.finanzas.value === 'string' ? JSON.parse(st.finanzas.value) : st.finanzas.value;
tocar('finanzas', { ...fin, creditos_data: [{ n: 99, empresa: 'Allegria Foods', acreedor: 'Acreedor Realtime', tipo_inst: 'Privado', monto: 123456, f_venc: '2027-03-01', tipo_cr: 'Bullet', tasa: '', cuota: 123456, pagado: false }] });
publicar('finanzas'); await ang.page.waitForTimeout(2500);
check('Sincroniza: el cambio de `finanzas` llega y se ve en Créditos', /Acreedor Realtime/.test(await ang.page.locator('body').innerText()));

// ── 4. Cambios en filas restringidas: no deben llegar a nadie por estos canales ──
for (const id of ['nominas_remuneraciones', 'frisku_liquidaciones', 'nominas']) { if (!st[id]) tocar(id, '{"nominas":[]}'); st[id].updated_at = new Date().toISOString(); publicar(id); }
await carol.page.waitForTimeout(500);
const rc = recibidosDe('carol'), ra = recibidosDe('angelo');
check('Carol solo recibió filas pedidas (sin remuneraciones, nóminas ni liquidaciones)', rc.every(id => ['main', 'usuarios', 'finanzas'].includes(id)), rc.join(','));
check('Angelo tampoco recibió filas que su pantalla no usa', ra.every(id => ['main', 'usuarios', 'finanzas'].includes(id)), ra.join(','));
check('Sin errores de página', [anon, carol, ang].every(x => x.errores.length === 0), [anon, carol, ang].flatMap(x => x.errores).join(' | '));
for (const x of [anon, carol, ang]) await x.browser.close();
if (process.env.OUT_DIR) { fs.mkdirSync(process.env.OUT_DIR, { recursive: true }); fs.writeFileSync(process.env.OUT_DIR + '/realtime.json', JSON.stringify(sockets.map(s => ({ quien: s.quien, topics: [...s.topics], recibidos: s.recibidos })), null, 1)); }
console.log(`\n${ok} correctas, ${fallos} fallas · Realtime emulado, datos ficticios`);
process.exit(fallos ? 1 : 0);
