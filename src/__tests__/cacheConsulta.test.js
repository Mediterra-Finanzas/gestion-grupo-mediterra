/* eslint-disable */
// Caché de consulta por sesión del inicio: una lectura por fila y sesión,
// deduplicada; «Actualizar» fuerza; un fallo conserva los datos anteriores.
import { crearCacheConsulta } from "../diseno/lecturaConsulta.js";

function lectorContado() {
  const llamadas = [];
  let falla = false, valor = 1;
  const leerFila = (id) => { llamadas.push(id); return new Promise((res, rej) => setTimeout(() => falla ? rej(new Error("HTTP 503")) : res({ existe: true, valor: valor, version: "v" }), 5)); };
  return { leerFila, llamadas, fallar: (v) => { falla = v; }, poner: (v) => { valor = v; } };
}
let t = 0; const ahora = () => new Date(Date.UTC(2026, 9, 13, 12, 0, t++));

test("una sola lectura por fila: las peticiones simultáneas comparten la misma promesa", async () => {
  const l = lectorContado(); const c = crearCacheConsulta({ leerFila: l.leerFila, ahora });
  const [a, b, d] = await Promise.all([c.leer("finanzas"), c.leer("finanzas"), c.leer("finanzas")]);
  expect(l.llamadas).toEqual(["finanzas"]);
  expect(a).toBe(b); expect(b).toBe(d);
  expect(a.estado).toBe("ok"); expect(a.leidoEn).toBeInstanceOf(Date);
});

test("volver al inicio reutiliza la lectura; «Actualizar» (forzar) vuelve a leer", async () => {
  const l = lectorContado(); const c = crearCacheConsulta({ leerFila: l.leerFila, ahora });
  const r1 = await c.leer("finanzas");
  const r2 = await c.leer("finanzas");
  expect(l.llamadas.length).toBe(1); expect(r2).toBe(r1);
  l.poner(2);
  const r3 = await c.leer("finanzas", { forzar: true });
  expect(l.llamadas.length).toBe(2);
  expect(r3.datos.valor).toBe(2);
  expect(r3.leidoEn > r1.leidoEn).toBe(true);
});

test("si actualizar falla, quedan los datos anteriores con su hora y el error; no se reintenta solo", async () => {
  const l = lectorContado(); const c = crearCacheConsulta({ leerFila: l.leerFila, ahora });
  const ok = await c.leer("finanzas");
  l.fallar(true);
  const e = await c.leer("finanzas", { forzar: true });
  expect(e.estado).toBe("error");
  expect(e.datos.valor).toBe(1);                 // los datos anteriores, no ceros
  expect(e.leidoEn).toEqual(ok.leidoEn);         // con la hora en que se leyeron
  expect(e.error).toMatch(/HTTP 503/);
  expect(e.errorEn > ok.leidoEn).toBe(true);
  const sinForzar = await c.leer("finanzas");
  expect(sinForzar).toBe(e);                     // volver no reintenta en silencio
  expect(l.llamadas.length).toBe(2);
});

test("primera lectura fallida: error sin datos; olvidar (cerrar sesión) limpia todo", async () => {
  const l = lectorContado(); l.fallar(true); const c = crearCacheConsulta({ leerFila: l.leerFila, ahora });
  const e = await c.leer("maestro_tc");
  expect(e.estado).toBe("error"); expect(e.datos).toBeUndefined(); expect(e.leidoEn).toBeNull();
  c.olvidar();
  expect(c.estado("maestro_tc")).toBeNull();
});
