/* ─────────────────────────────────────────────────────────────────────────
   HUB Y NAVEGACIÓN (rama de diseño) en navegador, Supabase falso, datos FICTICIOS.
   Seis perfiles (scripts/vista-previa/semilla-diseno.mjs) × cuatro tamaños:
   computador 1440×900, laptop 1280×800, tablet 834×1112, teléfono 390×844.
   Comprueba: destinos según permisos efectivos, contadores con datos reales del
   store (y «no disponible» si la lectura falla, nunca cero), la entrada simple
   para quien solo rinde, «Nueva rendición» y que navegar no escriba datos.
   Uso: APP_URL=http://127.0.0.1:4197 OUT_DIR=/tmp/hub node scripts/e2e/hub-navegacion.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import { instalarFake, leerFila, PIN } from './fake.mjs';
import { storeDiseno, PERFILES } from '../vista-previa/semilla-diseno.mjs';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';

const OUT = process.env.OUT_DIR || '/tmp/hub';
fs.mkdirSync(OUT, { recursive: true });
let ok = 0, fallos = 0;
const check = (n, c, x = '') => { c ? ok++ : fallos++; console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); };
const TAM = { computador: [1440, 900], laptop: [1280, 800], tablet: [834, 1112], telefono: [390, 844] };
const perfil = (k) => PERFILES.find(p => p.clave === k);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
async function sesion(clave, tam, { st = storeDiseno(), fallarRend = false } = {}) {
  const [w, h] = TAM[tam];
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, timezoneId: 'America/Santiago', deviceScaleFactor: tam === 'telefono' ? 2 : 1 });
  await instalarFake(ctx, st);
  const control = { fallarRend };
  await ctx.route(/calendario_data.*id=eq\.rendiciones(&|$)/, r => control.fallarRend && r.request().method() === 'GET'
    ? r.fulfill({ status: 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"message":"fallo simulado"}' })
    : r.fallback());
  await ctx.route(/open\.er-api\.com|mindicador\.cl|frankfurter\.app|emailjs/, r => r.abort());
  await ctx.route(/\/rest\/v1\/(?!calendario_data)[a-z_]+/, r => r.request().method() === 'GET'
    ? r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : r.abort());
  await ctx.routeWebSocket(/realtime\/v1\/websocket/, () => {});
  const page = await ctx.newPage();
  const errores = []; page.on('pageerror', e => errores.push(String(e).slice(0, 200)));
  const escrituras = []; ctx.on('request', r => { if (/calendario_data/.test(r.url()) && r.method() !== 'GET') { const m = /"id":"([^"]+)"/.exec(r.postData() || '') || /id=eq\.([^&]+)/.exec(r.url()); escrituras.push(m ? decodeURIComponent(m[1]) : '?'); } });
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.goto(process.env.APP_URL, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type=email]').waitFor({ timeout: 20000 });
  await page.locator('input[type=email]').fill(perfil(clave).email); await page.locator('input[type=password]').fill(PIN); await page.keyboard.press('Enter');
  await page.getByTestId('inicio').waitFor({ timeout: 20000 });
  for (const t of ['Entendido', 'Aceptar']) { const b = page.getByRole('button', { name: t }); if (await b.count()) await b.first().click().catch(() => {}); }
  await page.waitForTimeout(1200);
  return { ctx, page, errores, escrituras, st, control };
}
const foto = (p, nombre) => p.screenshot({ path: `${OUT}/${nombre}.png`, fullPage: true });
// Cifra de un contador: tarjeta (primer div) o pastilla de teléfono ([data-cifra]).
// En teléfono una cifra en cero no se dibuja: se lee 0 si la tarjeta dice «Al día» o
// si la pastilla no está pero la tarjeta sí (las cifras en cero son dato, no falta).
const cifra = async (p, id) => { const l = p.getByTestId(id); if (!(await l.count())) return null;
  const c = l.locator('[data-cifra]'); return Number((await ((await c.count()) ? c : l.locator('div').first()).innerText()).trim()); };
const hay = async (p, id) => (await p.getByTestId(id).count()) > 0;
const navEsperada = { computador: 'nav-lateral', laptop: 'nav-lateral', tablet: 'nav-riel', telefono: 'nav-inferior' };

// ── 1. Recorrido: cada perfil en cada tamaño (capturas) ──
const erroresTodos = [], escriturasNav = [];
for (const p of PERFILES) for (const tam of Object.keys(TAM)) {
  const s = await sesion(p.clave, tam);
  check(`${p.clave} · ${tam}: navegación ${navEsperada[tam]}`, await hay(s.page, navEsperada[tam]));
  const ancho = await s.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`${p.clave} · ${tam}: sin desplazamiento horizontal`, ancho <= 1, `${ancho}px`);
  await foto(s.page, `${p.clave}-${tam}-inicio`);
  if (tam === 'telefono' && await hay(s.page, 'nav-pendientes')) {
    await s.page.getByTestId('nav-pendientes').click(); await s.page.waitForTimeout(400);
    await foto(s.page, `${p.clave}-${tam}-pendientes`);
  }
  if (tam === 'telefono' || tam === 'tablet') {
    await s.page.getByTestId('nav-mas').click(); await s.page.waitForTimeout(300);
    await foto(s.page, `${p.clave}-${tam}-mas`);
    await s.page.keyboard.press('Escape');
  }
  erroresTodos.push(...s.errores); escriturasNav.push(...s.escrituras.filter(id => id !== 'main' && id !== 'usuarios'));
  await s.ctx.close();
}
check('Recorrido sin errores de página', erroresTodos.length === 0, erroresTodos.slice(0, 3).join(' | '));
check('Navegar no escribe datos de negocio (solo la escritura conocida de main/usuarios al entrar)', escriturasNav.length === 0, escriturasNav.join(','));

// ── 2. Destinos según permisos efectivos ──
let s = await sesion('analista', 'computador');
check('Carol: Finanzas ofrece Saldos Bancos, Nóminas y Rendiciones', await hay(s.page, 'acceso-finanzas-bancos') && await hay(s.page, 'acceso-finanzas-nominas') && await hay(s.page, 'acceso-finanzas-rendiciones'));
check('Carol: NO ofrece Flujo, Créditos, Dashboard, Reporte ni Auditoría',
  !(await hay(s.page, 'acceso-finanzas-flujo')) && !(await hay(s.page, 'acceso-finanzas-creditos')) && !(await hay(s.page, 'acceso-finanzas-dashboard'))
  && !(await hay(s.page, 'acceso-finanzas-reporte')) && !(await hay(s.page, 'acceso-finanzas-auditoria')));
check('Carol: módulos asignados en la barra (Tareas, Osiris, Finanzas, Contabilidad) y no otros',
  await hay(s.page, 'nav-modulo-tareas') && await hay(s.page, 'nav-modulo-finanzas') && !(await hay(s.page, 'nav-modulo-allegria')) && !(await hay(s.page, 'nav-modulo-frisku')));
check('Carol: sin herramientas de administración', !(await hay(s.page, 'herramienta-permisos')) && !(await hay(s.page, 'herramienta-respaldo')));
check('Carol · rendiciones: aprobar 0 (sin aprobador asignado: solo CFO), por pagar 1, borradores 1',
  await cifra(s.page, 'cifra-rend-aprobar') === 0 && await cifra(s.page, 'cifra-rend-pagar') === 1 && await cifra(s.page, 'cifra-rend-borrador') === 1);
const revCarol = await cifra(s.page, 'cifra-tareas-revisar');
check('Carol · tareas: por revisar = 1 (Cierre de Allegria Foods marcado por Michelle)', revCarol === 1, String(revCarol));
// Abrir Saldos Bancos desde el acceso: la pestaña activa es la pedida
await s.page.getByTestId('acceso-finanzas-bancos').click(); await s.page.waitForTimeout(3500);
const txtFin = await s.page.locator('body').innerText();
check('Carol: el acceso abre Finanzas y sus pestañas son solo las permitidas', /Saldos Bancos/.test(txtFin) && !/Flujo Empresas/.test(txtFin) && !/Créditos/.test(txtFin));
await s.ctx.close();

s = await sesion('cfo', 'laptop');
check('CFO: Finanzas ofrece las 9 pestañas', (await s.page.locator('[data-testid^="acceso-finanzas-"]').count()) === 9);
check('CFO: herramientas Permisos, Respaldo y Restaurar', await hay(s.page, 'herramienta-permisos') && await hay(s.page, 'herramienta-respaldo') && await hay(s.page, 'herramienta-restaurar'));
check('CFO · rendiciones: aprobar 2 (enviadas sin aprobador asignado), por pagar 1',
  await cifra(s.page, 'cifra-rend-aprobar') === 2 && await cifra(s.page, 'cifra-rend-pagar') === 1);
check('CFO · tareas: por revisar 2 (m3 y m15)', await cifra(s.page, 'cifra-tareas-revisar') === 2, String(await cifra(s.page, 'cifra-tareas-revisar')));
check('CFO: aviso de respaldo suspendido en una línea', await hay(s.page, 'avisos-inicio'));
await s.page.getByTestId('herramienta-permisos').click(); await s.page.waitForTimeout(600);
check('CFO: Permisos abre el panel', /Gestión de Usuarios|Permisos/.test(await s.page.locator('body').innerText()));
await s.ctx.close();

s = await sesion('frisku', 'tablet');
check('Gerente Frisku: Finanzas solo con Saldos Bancos y Rendiciones (sin Dashboard por empresas parciales)',
  await hay(s.page, 'acceso-finanzas-bancos') && await hay(s.page, 'acceso-finanzas-rendiciones') && (await s.page.locator('[data-testid^="acceso-finanzas-"]').count()) === 2);
check('Gerente Frisku: sin tarjeta de tareas (no tiene el módulo)', !(await hay(s.page, 'pend-tareas')));
await s.ctx.close();

s = await sesion('socia', 'computador');
// Su ficha no configura `rendiciones`: main la toma como «editar» por omisión
// (getTabPermisosModulo). La navegación muestra lo que realmente puede abrir.
check('Socia (consulta, Rendiciones sin configurar): la navegación ofrece rendir, igual que la pestaña de main', await hay(s.page, 'nav-nueva-rendicion') && await hay(s.page, 'pend-rendiciones'));
check('Socia: Finanzas sin Parámetros ni Auditoría; con Flujo y Créditos', await hay(s.page, 'acceso-finanzas-flujo') && await hay(s.page, 'acceso-finanzas-creditos') && !(await hay(s.page, 'acceso-finanzas-auditoria')));
await s.ctx.close();

// ── 3. Solo rinde gastos: entrada simple ──
s = await sesion('operario', 'telefono');
check('Operario: entrada simple, sin grilla de módulos ni pestaña Pendientes',
  await hay(s.page, 'inicio-rendiciones') && !(await hay(s.page, 'grilla-modulos')) && !(await hay(s.page, 'nav-pendientes')));
const filas = await s.page.locator('[data-testid^="rend-estado-"]').allInnerTexts();
check('Operario: estados con cifras del store (borrador 1, devuelta 1, enviada 1, pagada 1)',
  /Borradores\s*\n?.*\n?\s*1/.test(filas[0]) && /Devueltas[\s\S]*1$/.test(filas[1].trim()) && /Enviadas[\s\S]*1$/.test(filas[2].trim()) && /Pagadas[\s\S]*1$/.test(filas[4].trim()), filas.join(' / ').replace(/\n/g, ' '));
const antes = (leerFila(s.st, 'rendiciones') || []).length;
await s.page.getByTestId('inicio-nueva-rendicion').click(); await s.page.waitForTimeout(4500);
const despues = leerFila(s.st, 'rendiciones') || [];
check('Operario: «Nueva rendición» crea UN borrador propio, después de cargar', despues.length === antes + 1 && despues.filter(x => x.trabajador === 'Operario Planta' && x.estado === 'borrador').length === 2,
  `${antes} → ${despues.length}`);
await foto(s.page, 'operario-telefono-nueva-rendicion');
await s.ctx.close();

// ── 4. Lectura fallida: «no disponible», nunca cero; reintentar ──
s = await sesion('analista', 'telefono', { fallarRend: true });
check('Lectura de rendiciones fallida: aviso y sin cifras', await hay(s.page, 'error-rendiciones') && !(await hay(s.page, 'cifra-rend-aprobar')));
check('Lectura fallida: el distintivo de Pendientes no muestra un total parcial', !(await s.page.getByTestId('nav-distintivo').count()));
await foto(s.page, 'analista-telefono-lectura-fallida');
s.control.fallarRend = false;
await s.page.getByTestId('reintentar-rendiciones').click(); await s.page.waitForTimeout(1200);
check('Reintentar: aparecen las cifras (teléfono: solo las distintas de cero)', await cifra(s.page, 'cifra-rend-pagar') === 1 && await cifra(s.page, 'cifra-rend-borrador') === 1 && !(await hay(s.page, 'cifra-rend-aprobar')));
await s.ctx.close();

// ── 5. Tareas: el inicio cuenta SIEMPRE el mes en curso (DD5) ──
{
  const MES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const hoy = new Date(); const rotulo = `${MES[hoy.getMonth()]} ${hoy.getFullYear()}`;
  const leer = async (p) => [await cifra(p, 'cifra-tareas-vencidas'), await cifra(p, 'cifra-tareas-porvencer'), await cifra(p, 'cifra-tareas-revisar')].join('/');
  s = await sesion('cfo', 'computador');
  const antes = await leer(s.page);
  check('Tareas: el inicio rotula el mes en curso', (await s.page.getByTestId('pend-tareas').innerText()).includes(rotulo));
  await s.page.getByTestId('nav-modulo-tareas').click(); await s.page.waitForTimeout(1500);
  for (let i = 0; i < 2; i++) { await s.page.getByRole('button', { name: '›', exact: true }).first().click(); await s.page.waitForTimeout(300); }
  await s.page.getByTestId('nav-inicio').click(); await s.page.waitForTimeout(800);
  const despues = await leer(s.page);
  check('Tareas: elegir otro mes en Tareas no cambia los contadores del inicio', antes === despues && (await s.page.getByTestId('pend-tareas').innerText()).includes(rotulo), `${antes} → ${despues}`);
  await s.ctx.close();
  // Mes guardado en la fila main distinto del actual (la app lo restaura al cargar)
  const st2 = storeDiseno(); st2.main.value.mes = (hoy.getMonth() + 10) % 12; st2.main.value.anio = hoy.getFullYear() - (hoy.getMonth() < 2 ? 1 : 0);
  s = await sesion('cfo', 'computador', { st: st2 });
  check('Tareas: con otro mes guardado en main, el inicio sigue en el mes en curso', (await s.page.getByTestId('pend-tareas').innerText()).includes(rotulo) && await leer(s.page) === antes, await leer(s.page));
  await s.ctx.close();
}

await browser.close();
console.log(`\n${ok} correctas, ${fallos} fallas · datos ficticios · capturas en ${OUT}`);
process.exit(fallos ? 1 : 0);
