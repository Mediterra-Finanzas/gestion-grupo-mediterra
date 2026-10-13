/* eslint-disable */
import { borradorConflicto, compararVersiones } from "../persistencia/borradorConflicto.js";

beforeEach(() => borradorConflicto._reset());

test("conserva una COPIA del último valor y la fecha del primer conflicto", () => {
  const v = { allegria_params: { a: 1 } };
  borradorConflicto.guardar("finanzas", v);
  v.allegria_params.a = 99;                                   // mutar el original no toca el borrador
  const b1 = borradorConflicto.obtener("finanzas");
  expect(b1.valor.allegria_params.a).toBe(1);
  b1.valor.allegria_params.a = 5;                             // ni mutar lo obtenido
  expect(borradorConflicto.obtener("finanzas").valor.allegria_params.a).toBe(1);
  borradorConflicto.guardar("finanzas", { allegria_params: { a: 2 } });
  const b2 = borradorConflicto.obtener("finanzas");
  expect(b2.valor.allegria_params.a).toBe(2);                 // el último intento manda
  expect(b2.desde).toBe(b1.desde);                            // pero la antigüedad es la del primero
  borradorConflicto.descartar("finanzas");
  expect(borradorConflicto.tiene("finanzas")).toBe(false);
});

test("comparar: agrupa por sección, cuenta hojas y muestra ejemplos con ambos valores", () => {
  const local = { allegria_params: { "2026-2027": { cerezas: { fob_usd_kg: 0.9, kg: 1000 } } }, creditos_data: [{ n: 1, monto: 10 }] };
  const srv = { allegria_params: { "2026-2027": { cerezas: { fob_usd_kg: 0.6, kg: 2000 } } }, creditos_data: [{ n: 1, monto: 10 }], extra: 1 };
  const c = compararVersiones(local, srv);
  expect(c.iguales).toBe(false);
  expect(c.total).toBe(3);
  const ap = c.secciones.find(s => s.clave === "allegria_params");
  expect(ap.rotulo).toBe("Parámetros Allegria Foods");
  expect(ap.cambios).toBe(2);
  expect(ap.ejemplos[0]).toEqual({ ruta: "2026-2027 › cerezas › fob_usd_kg", local: "0.9", servidor: "0.6" });
  expect(c.secciones.find(s => s.clave === "extra").ejemplos[0]).toEqual({ ruta: "", local: "(no existe)", servidor: "1" });
  expect(compararVersiones(local, JSON.parse(JSON.stringify(local))).iguales).toBe(true);
});
