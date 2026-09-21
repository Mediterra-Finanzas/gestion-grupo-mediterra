/* Verifica el AISLAMIENTO: que ninguna llamada a Supabase salga del navegador.
   Cuenta las peticiones que el navegador dirige al host de producción y las
   compara con las que el falso respondió; además intercepta cualquier petición
   que NO haya sido atendida por el falso. */
import { nuevoStore, instalarFake } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, irAFlujoEmpresas, elegirEmpresa, subTab } from './lib.mjs';

const store = nuevoStore();
let atendidas = 0;
const { browser, ctx, page } = await abrirApp(store, { log: () => { atendidas++; } });

const pedidas = [];
const escapadas = [];
page.on('request', r => {
  const u = r.url();
  if (u.includes('bywovqayuzodbzwsriet.supabase.co')) pedidas.push(`${r.method()} ${u.slice(0, 90)}`);
});
page.on('requestfinished', async r => {
  const u = r.url();
  if (!u.includes('bywovqayuzodbzwsriet.supabase.co')) return;
  const resp = await r.response().catch(() => null);
  const via = resp ? (await resp.headerValue('access-control-allow-origin').catch(() => null)) : null;
  // el falso siempre responde con este header; si falta, la respuesta vino de la red
  if (via !== '*') escapadas.push(`${r.method()} ${u.slice(0, 90)}`);
});

await login(page);
await entrarFinanzas(page);
await irAFlujoEmpresas(page);
await elegirEmpresa(page, 'Allegria Foods');
await subTab(page, /Parámetros/);
await page.waitForTimeout(2000);

console.log(`peticiones del navegador a supabase: ${pedidas.length}`);
console.log(`respondidas por el falso:            ${atendidas}`);
console.log(`escapadas a la red real:             ${escapadas.length}`);
if (escapadas.length) escapadas.forEach(e => console.log('   ⚠', e));
console.log(pedidas.map(p => '   ' + p).join('\n'));
await browser.close();
process.exit(escapadas.length ? 1 : 0);
