/* ─────────────────────────────────────────────────────────────────────────
   E2E EN NAVEGADOR — Guardado CONDICIONADO de Nóminas (dos pestañas reales
   sobre el MISMO Supabase falso aislado; solo datos de prueba).

   Casos:
     1. Carga fallida de UNA empresa: no se muestra, no se puede crear ni guardar
        en ella; las demás operan; "Reintentar carga" la habilita.
     2. Fila inexistente CONFIRMADA (≠ error): se puede crear la primera nómina.
     3. Creación simultánea de la misma fila por dos pestañas (409 → combina).
     4. Ediciones concurrentes: independientes (se combinan), mismo campo
        (conflicto → "usar la del servidor" / "mantener la mía"), transición
        contra un cambio del otro (conflicto, no se hace la transición).
     5. Respuesta perdida después de un guardado exitoso: el reintento no
        vuelve a escribir; transición repetida no duplica el historial.
   En todos: solo se escriben las filas cambiadas y la edición local se conserva.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { nuevoStore } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, subTab } from './lib.mjs';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(OUT, { recursive: true });
let fallos = 0;
const check = (n, c, x = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fallos++; };

const hoy = new Date();
const t = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
const semana = Math.ceil((((t - new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7);
const anio = t.getUTCFullYear();
const item = (id) => ({ id, seccion: 'proveedores', tipoDoc: 'Factura', proveedor: 'Proveedor ' + id, rut: '', nDoc: '1', fDoc: '', fVenc: '', semVenc: '',
  concepto: 'Servicio', montoCLP: 1000, montoUSD: 0, montoPEN: 0, comentario: '', pagado: false, anticipo: 0, estadoLinea: 'activa', historial: [], documentos: [] });
const nom = (id, empresa, sem, estado = 'borrador') => ({ id, empresa, semana: sem, año: anio, numero: 1, fecha: hoy.toISOString().slice(0, 10), tc: 950, estado,
  preparadoPor: '', revisadoPor: '', aprobadoPor: '', aprobado1Por: '', fechaAprobacion: '', fechaAprobacion1: '',
  items: [item('it-' + id)], bancos: {}, notas: '', seccionesExtra: [], estadoNomina: 'activa', historial: [] });
const ts = (ms) => new Date(Date.now() - ms).toISOString();

const store = nuevoStore();
store.nominas_v2_done = { value: JSON.stringify({ migrado: true }), updated_at: ts(40000) };
store.nominas_osiris = { value: JSON.stringify({ empresa: 'Osiris', nominas: [nom('nomA', 'Osiris', semana), nom('nomB', 'Osiris', semana - 1)] }), updated_at: ts(39000) };
store.nominas_mediterra = { value: JSON.stringify({ empresa: 'Mediterra', nominas: [nom('nomM', 'Mediterra', semana)] }), updated_at: ts(38000) };
// Integrity Farms: SIN fila (inexistente confirmada)
const fila = (id) => store[id] ? JSON.parse(store[id].value) : null;
const delServidor = (filaId, nomId) => (fila(filaId)?.nominas || []).find((n) => n.id === nomId);
const escriturasDe = (id) => (store.__escrituras || []).filter((e) => e.id === id).length;

// ── dos pestañas (dos navegadores) sobre el MISMO store ─────────────────
async function abrirPestana(nombre) {
  const { browser, ctx, page } = await abrirApp(store);
  const errores = [], dialogos = [];
  // Interruptor por pestaña: simular que ESTA pestaña no logra refrescar (sesión desactualizada).
  const estado = { sinRefresco: false };
  await ctx.route((url) => url.hostname.includes('bywovqayuzodbzwsriet') && url.pathname.endsWith('/calendario_data') && url.search.includes('id=eq.nominas_osiris'),
    (r) => (r.request().method() === 'GET' && estado.sinRefresco ? r.abort('failed') : r.fallback()));
  page.on('pageerror', (e) => errores.push(String(e)));
  page.on('dialog', (d) => { dialogos.push(d.message()); (d.type() === 'prompt' ? d.accept('motivo de prueba') : d.accept()).catch(() => {}); });
  await login(page); await entrarFinanzas(page); await subTab(page, /Nóminas/); await page.waitForTimeout(1500);
  return { nombre, browser, page, errores, dialogos, estado };
}
const notas = (p) => p.page.locator('textarea[placeholder="Observaciones..."]').first();
const aviso = (p) => p.page.locator('[data-aviso-nominas]');
const textoAviso = async (p) => ((await aviso(p).count()) ? await aviso(p).first().innerText() : '');
const filaEmpresa = (p, empresa) => p.page.locator('tr').filter({ has: p.page.locator('td', { hasText: new RegExp(`^\\s*${empresa}\\s*$`) }) }).first();
async function volverALista(p) {
  await p.page.getByRole('button', { name: /Volver/ }).first().click().catch(() => {});
  await p.page.locator('tr').filter({ hasText: 'Mediterra' }).first().waitFor({ timeout: 15000 }); await p.page.waitForTimeout(400);
}
async function abrirNomina(p, empresa, semanaAnterior = false) {
  if (semanaAnterior) { await p.page.locator('button', { hasText: '‹' }).first().click(); await p.page.waitForTimeout(800); }
  await filaEmpresa(p, empresa).getByRole('button', { name: /Editar|Ver/ }).click();
  await notas(p).waitFor({ timeout: 15000 }); await p.page.waitForTimeout(400);
}
async function irASemanaActual(p) { await p.page.locator('button', { hasText: '›' }).first().click(); await p.page.waitForTimeout(1200); }
const escribirNotas = async (p, txt) => { await notas(p).fill(txt); await p.page.waitForTimeout(2500); };

// 1. Carga fallida de Osiris solo para la pestaña 1
store.__interceptarLectura = (id) => (id === 'nominas_osiris' ? { status: 500, body: { message: 'falla simulada' } } : null);
const P1 = await abrirPestana('pestaña 1');
store.__interceptarLectura = null;
const P2 = await abrirPestana('pestaña 2');
await P1.page.screenshot({ path: path.join(OUT, 'c01-carga-fallida.png') });
const banner = P1.page.locator('[data-aviso-carga-nominas]');
check('1a. Carga fallida de Osiris: aviso que nombra la empresa y explica el bloqueo', (await banner.count()) === 1 && /Osiris/.test(await banner.innerText()) && /no se puede crear ni guardar/.test(await banner.innerText()));
check('1b. Osiris no muestra nóminas (se ofrece "+ Crear") y Mediterra sí carga', (await filaEmpresa(P1, 'Osiris').getByRole('button', { name: /\+ Crear/ }).count()) === 1 && (await filaEmpresa(P1, 'Mediterra').getByRole('button', { name: /Editar/ }).count()) === 1);
P1.dialogos.length = 0;
const escrAntes = (store.__escrituras || []).length;
await filaEmpresa(P1, 'Osiris').getByRole('button', { name: /\+ Crear/ }).click(); await P1.page.waitForTimeout(800);
check('1c. Crear en Osiris (no cargada) se BLOQUEA con explicación y no escribe nada', P1.dialogos.some((m) => /No se pudieron cargar las nóminas de Osiris/.test(m)) && (store.__escrituras || []).length === escrAntes && fila('nominas_osiris').nominas.length === 2);
await abrirNomina(P1, 'Mediterra');
await escribirNotas(P1, 'nota Mediterra');
check('1d. Mediterra (cargada) sigue operando: se guarda, y SOLO su fila', delServidor('nominas_mediterra', 'nomM').notas === 'nota Mediterra' && escriturasDe('nominas_mediterra') === 1 && escriturasDe('nominas_osiris') === 0 && (await aviso(P1).count()) === 0);
await volverALista(P1);
await P1.page.getByRole('button', { name: 'Reintentar carga' }).click(); await P1.page.waitForTimeout(1200);
check('1e. "Reintentar carga": Osiris se carga, el aviso desaparece y se puede abrir', (await banner.count()) === 0 && (await filaEmpresa(P1, 'Osiris').getByRole('button', { name: /Editar/ }).count()) === 1);

// 2. Fila inexistente confirmada → se puede crear
await filaEmpresa(P1, 'Integrity Farms').getByRole('button', { name: /\+ Crear/ }).click(); await P1.page.waitForTimeout(2500);
check('2. Integrity Farms sin fila (inexistente CONFIRMADA, no error): se crea la primera nómina', fila('nominas_integrity_farms')?.nominas.length === 1 && (await aviso(P1).count()) === 0);
await volverALista(P1);

// 3. Creación simultánea: la pestaña 2 todavía cree que Integrity no tiene fila
await filaEmpresa(P2, 'Integrity Farms').getByRole('button', { name: /\+ Crear/ }).click(); await P2.page.waitForTimeout(3000);
check('3. Creación simultánea de la fila: la inserción de la pestaña 2 recibe 409, relee y combina → quedan AMBAS nóminas, sin aviso',
  fila('nominas_integrity_farms')?.nominas.length === 2 && (await aviso(P2).count()) === 0, `${fila('nominas_integrity_farms')?.nominas.length} nóminas`);
await volverALista(P2);

// 4a. Ediciones independientes (nómina A en P1, nómina B en P2)
await abrirNomina(P1, 'Osiris');
await escribirNotas(P1, 'uno');
await abrirNomina(P2, 'Osiris', true);   // B está en la semana anterior
await escribirNotas(P2, 'dos');
check('4a. Ediciones independientes (nóminas distintas de la misma empresa): se guardan ambas sin aviso',
  delServidor('nominas_osiris', 'nomA').notas === 'uno' && delServidor('nominas_osiris', 'nomB').notas === 'dos' && (await aviso(P2).count()) === 0);
await volverALista(P2); await irASemanaActual(P2);
// 4b. Mismo campo → conflicto → "usar la del servidor"
await abrirNomina(P2, 'Osiris');          // P2 abre A ANTES de que P1 guarde "X"
// P2 queda DESACTUALIZADA: mientras P1 guarda, los refrescos de fondo de P2 no llegan.
P2.estado.sinRefresco = true;
await escribirNotas(P1, 'X');
P2.estado.sinRefresco = false;
check('4b-0. La pestaña 2 está en la nómina A y ve el cambio combinado de la pestaña 1 ("uno", incorporado al guardar)', (await notas(P2).inputValue()) === 'uno', await notas(P2).inputValue());
await escribirNotas(P2, 'Y');
await P2.page.screenshot({ path: path.join(OUT, 'c02-conflicto.png') });
let ta = await textoAviso(P2);
check('4b. Mismo campo: conflicto explícito con ambos valores; el servidor conserva lo de la otra persona; mi edición sigue en pantalla',
  (await aviso(P2).first().getAttribute('data-aviso-nominas')) === 'conflicto' && /mismo campo \(notas\)/.test(ta) && /Tuyo: Y/.test(ta) && /Servidor: X/.test(ta)
  && delServidor('nominas_osiris', 'nomA').notas === 'X' && (await notas(P2).inputValue()) === 'Y', ta.slice(0, 200));
await P2.page.getByRole('button', { name: 'Usar la versión del servidor' }).click(); await P2.page.waitForTimeout(800);
check('4c. "Usar la versión del servidor" (con confirmación): la pantalla toma X y el conflicto se cierra', (await notas(P2).inputValue()) === 'X' && P2.dialogos.some((m) => /Usar la versión del servidor en Osiris/.test(m)) && !/mismo campo/.test(await textoAviso(P2)));
// 4c-2. Refresco de fondo que falla para Osiris: NO debe borrar de pantalla la nómina abierta ni bloquear la empresa
P2.estado.sinRefresco = true;
await P2.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await P2.page.waitForTimeout(1200);
check('4c-2. Refresco fallido de Osiris: la nómina abierta sigue en pantalla, sin bloqueo de carga',
  (await notas(P2).count()) === 1 && (await notas(P2).inputValue()) === 'X' && (await P2.page.locator('[data-aviso-carga-nominas]').count()) === 0);
P2.estado.sinRefresco = false;
// 4d. Mismo campo → "mantener la mía"
P2.estado.sinRefresco = true;
await escribirNotas(P1, 'X2');
P2.estado.sinRefresco = false;
await escribirNotas(P2, 'Y2');
await P2.page.getByRole('button', { name: /Mantener la mía/ }).click(); await P2.page.waitForTimeout(1500);
check('4d. "Mantener la mía" (con confirmación que lista lo que se sobrescribe): queda Y2 en el servidor',
  delServidor('nominas_osiris', 'nomA').notas === 'Y2' && P2.dialogos.some((m) => /Mantener TU versión en Osiris/.test(m) && /notas/.test(m)) && (await aviso(P2).count()) === 0);
// 4e. Transición contra un cambio del otro
const correosAntes = 0;
await P1.page.getByRole('button', { name: /Marcar Preparada/ }).click(); await P1.page.waitForTimeout(2500);
ta = await textoAviso(P1);
check('4e. Transición de P1 contra el cambio de notas de P2 en la misma nómina: conflicto, el estado NO cambia ni en pantalla ni en el servidor',
  /cambio de estado/.test(ta) && /El cambio de estado NO se hizo/.test(ta) && delServidor('nominas_osiris', 'nomA').estado === 'borrador'
  && (await P1.page.getByRole('button', { name: /Marcar Preparada/ }).count()) === 1, ta.slice(0, 160));
await P1.page.getByRole('button', { name: 'Usar la versión del servidor' }).click(); await P1.page.waitForTimeout(800);
await P1.page.getByRole('button', { name: /Marcar Preparada/ }).click(); await P1.page.waitForTimeout(2500);
check('4f. Tras resolver, la transición se hace normalmente', delServidor('nominas_osiris', 'nomA').estado === 'preparada' && (await aviso(P1).count()) === 0);

// 5. Respuesta perdida después de un guardado exitoso (pestaña 1)
let unaVez = true;
const perderUnaVez = () => { unaVez = true; store.__interceptar = (m, id) => (id === 'nominas_osiris' && m === 'PATCH' && unaVez ? (unaVez = false, 'perdida') : null); };
let escrOsiris = escriturasDe('nominas_osiris');
perderUnaVez();
await escribirNotas(P1, 'Z');
store.__interceptar = null;
check('5a. Respuesta perdida (el servidor SÍ guardó): relee, verifica que ya está y lo da por guardado — una sola escritura, sin aviso',
  delServidor('nominas_osiris', 'nomA').notas === 'Z' && escriturasDe('nominas_osiris') === escrOsiris + 1 && (await aviso(P1).count()) === 0 && (await notas(P1).inputValue()) === 'Z');
// respuesta perdida y tampoco se puede releer (red caída)
escrOsiris = escriturasDe('nominas_osiris');
perderUnaVez(); P1.estado.sinRefresco = true;
await escribirNotas(P1, 'Z2');
store.__interceptar = null;
let ta5 = await textoAviso(P1);
check('5b. Respuesta perdida y sin red para verificar: NO finge éxito (aviso de red), conserva la edición; el servidor sí la tiene',
  delServidor('nominas_osiris', 'nomA').notas === 'Z2' && escriturasDe('nominas_osiris') === escrOsiris + 1 && /sin conexión/i.test(ta5) && (await notas(P1).inputValue()) === 'Z2');
P1.estado.sinRefresco = false;
await P1.page.getByRole('button', { name: 'Reintentar guardar' }).click(); await P1.page.waitForTimeout(1500);
check('5c. Reintento: reconoce que ya estaba guardado, NO vuelve a escribir y cierra el aviso', escriturasDe('nominas_osiris') === escrOsiris + 1 && (await aviso(P1).count()) === 0);
// transición con respuesta perdida: devolución preparada → borrador (con motivo)
const devoluciones = () => (delServidor('nominas_osiris', 'nomA').historial || []).filter((h) => h.accion === 'devolucion' && h.estadoHacia === 'borrador').length;
escrOsiris = escriturasDe('nominas_osiris');
perderUnaVez();
await P1.page.getByRole('button', { name: /← Retroceder/ }).click(); await P1.page.waitForTimeout(2500);
store.__interceptar = null;
check('5d. Transición con respuesta perdida pero verificable: queda hecha UNA vez y la pantalla la muestra hecha',
  delServidor('nominas_osiris', 'nomA').estado === 'borrador' && devoluciones() === 1 && escriturasDe('nominas_osiris') === escrOsiris + 1
  && (await P1.page.getByRole('button', { name: /Marcar Preparada/ }).count()) === 1 && (await aviso(P1).count()) === 0, `devoluciones ${devoluciones()}`);
// la misma, sin red para verificar
await P1.page.getByRole('button', { name: /Marcar Preparada/ }).click(); await P1.page.waitForTimeout(2500);
escrOsiris = escriturasDe('nominas_osiris');
perderUnaVez(); P1.estado.sinRefresco = true;
await P1.page.getByRole('button', { name: /← Retroceder/ }).click(); await P1.page.waitForTimeout(2500);
store.__interceptar = null;
check('5e. Transición con respuesta perdida SIN poder verificar: la pantalla NO la da por hecha (sigue en "preparada") y lo avisa',
  delServidor('nominas_osiris', 'nomA').estado === 'borrador' && (await P1.page.getByRole('button', { name: /← Retroceder/ }).count()) === 1 && /El cambio de estado NO se hizo/.test(await textoAviso(P1)));
P1.estado.sinRefresco = false;
await P1.page.getByRole('button', { name: /← Retroceder/ }).click(); await P1.page.waitForTimeout(2500);
check('5f. Reintento de esa transición: ve que ya está hecha, NO escribe de nuevo y el historial no se duplica',
  delServidor('nominas_osiris', 'nomA').estado === 'borrador' && devoluciones() === 2 && escriturasDe('nominas_osiris') === escrOsiris + 1
  && (await P1.page.getByRole('button', { name: /Marcar Preparada/ }).count()) === 1 && (await aviso(P1).count()) === 0, `devoluciones ${devoluciones()} (1 de 5d + 1 de 5e), escrituras nuevas ${escriturasDe('nominas_osiris') - escrOsiris}`);
for (const p of [P1, P2]) check(`Sin errores de JavaScript (${p.nombre})`, p.errores.length === 0, p.errores.slice(0, 2).join(' | '));
await P1.browser.close(); await P2.browser.close();
console.log(fallos ? `\n${fallos} FALLA(S)` : '\nGuardado condicionado de Nóminas: todos los casos OK');
process.exit(fallos ? 1 : 0);
