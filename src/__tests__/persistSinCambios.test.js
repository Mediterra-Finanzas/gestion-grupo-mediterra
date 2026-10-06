/* eslint-disable */
// Guardia "sin cambios": no se escribe si el valor es idéntico a lo último
// confirmado por el servidor. Las migraciones, siembras, conflictos y la
// protección ante carga fallida siguen igual.
import { crearPersistencia } from "../persistencia/persistContract.js";

function servidorFalso(filas = {}) {
  const llamadas = [];
  const fetch = async (url, opts = {}) => {
    const m = (opts.method || "GET").toUpperCase();
    const u = new URL(url);
    const id = decodeURIComponent((/id=eq\.([^&]+)/.exec(u.search) || [])[1] || "");
    llamadas.push(`${m} ${id || JSON.parse(opts.body || "{}").id}`);
    const resp = (b, st = 200) => ({ ok: st < 400, status: st, json: async () => b, text: async () => JSON.stringify(b) });
    if (m === "GET") return resp(filas[id] ? [{ value: filas[id].value, updated_at: filas[id].updated_at }] : []);
    const body = JSON.parse(opts.body);
    if (m === "PATCH") {
      const ver = decodeURIComponent((/updated_at=eq\.([^&]+)/.exec(u.search) || [])[1] || "");
      if (!filas[id] || filas[id].updated_at !== ver) return resp([]);
      filas[id] = { value: body.value, updated_at: body.updated_at };
      return resp([{ id, ...filas[id] }]);
    }
    filas[body.id] = { value: body.value, updated_at: body.updated_at };
    return resp([{ id: body.id, ...filas[body.id] }], 201);
  };
  const escrituras = () => llamadas.filter((l) => !l.startsWith("GET"));
  return { fetch, llamadas, escrituras, filas };
}
const silencio = { info() {}, warn() {}, error() {} };

test("misma información que el servidor → no escribe", async () => {
  const S = servidorFalso({ main: { value: JSON.stringify({ a: 1, b: [1, 2] }), updated_at: "v1" } });
  const p = crearPersistencia({ fetch: S.fetch, logger: silencio });
  await p.load("main");
  const r = await p.saveConfirmed("main", { a: 1, b: [1, 2] });
  expect(r.ok).toBe(true);
  expect(r.sinCambios).toBe(true);
  expect(S.escrituras()).toEqual([]);
  expect(p.isDirty("main")).toBe(false);
});

test("el orden de las claves no cuenta como cambio", async () => {
  const S = servidorFalso({ main: { value: { a: 1, b: { x: 1, y: 2 } }, updated_at: "v1" } });
  const p = crearPersistencia({ fetch: S.fetch, logger: silencio });
  await p.load("main");
  await p.saveConfirmed("main", { b: { y: 2, x: 1 }, a: 1 });
  expect(S.escrituras()).toEqual([]);
});

test("un cambio real se escribe con control de versión, y repetirlo ya no escribe", async () => {
  const S = servidorFalso({ main: { value: { a: 1 }, updated_at: "v1" } });
  const p = crearPersistencia({ fetch: S.fetch, logger: silencio });
  await p.load("main");
  const r1 = await p.saveConfirmed("main", { a: 2 });
  expect(r1.ok).toBe(true);
  expect(r1.sinCambios).toBeUndefined();
  expect(S.escrituras()).toEqual(["PATCH main"]);
  expect(S.filas.main.value).toEqual({ a: 2 });
  await p.saveConfirmed("main", { a: 2 });
  expect(S.escrituras()).toEqual(["PATCH main"]);   // la segunda no escribió
});

test("fila inexistente (siembra/migración) se escribe aunque el valor coincida con la base", async () => {
  const S = servidorFalso({});
  const p = crearPersistencia({ fetch: S.fetch, logger: silencio });
  p.registrarCarga("usuarios", [{ nombre: "A" }], null, "string");
  const r = await p.saveConfirmed("usuarios", [{ nombre: "A" }]);
  expect(r.ok).toBe(true);
  expect(S.escrituras()).toEqual(["POST usuarios"]);
});

test("base transformada en memoria (fusión) ≠ servidor → SÍ se escribe la migración", async () => {
  const S = servidorFalso({ usuarios: { value: JSON.stringify([{ nombre: "A" }]), updated_at: "v1" } });
  const p = crearPersistencia({ fetch: S.fetch, logger: silencio });
  const fusionada = [{ nombre: "A", modulos: ["rendiciones"] }];
  p.registrarCarga("usuarios", fusionada, "v1", true, [{ nombre: "A" }]);
  const r = await p.saveConfirmed("usuarios", fusionada);
  expect(r.ok).toBe(true);
  expect(r.sinCambios).toBeUndefined();
  expect(S.escrituras()).toEqual(["PATCH usuarios"]);
  // y la fusión que no cambia nada no escribe
  const S2 = servidorFalso({ usuarios: { value: JSON.stringify([{ nombre: "A" }]), updated_at: "v1" } });
  const p2 = crearPersistencia({ fetch: S2.fetch, logger: silencio });
  p2.registrarCarga("usuarios", [{ nombre: "A" }], "v1", true, [{ nombre: "A" }]);
  await p2.saveConfirmed("usuarios", [{ nombre: "A" }]);
  expect(S2.escrituras()).toEqual([]);
});

test("si el servidor cambió (dato entrante con edición local), se compara contra el valor nuevo", async () => {
  const S = servidorFalso({ main: { value: { a: 1 }, updated_at: "v1" } });
  const p = crearPersistencia({ fetch: S.fetch, logger: silencio });
  await p.load("main");
  p.marcarSucio("main");
  S.filas.main = { value: { a: 9 }, updated_at: "v2" };          // otra persona guardó a=9
  p.reconcileIncoming("main", { a: 9 }, "v2");                   // no se aplica (local sucio)
  const r = await p.saveConfirmed("main", { a: 1 });             // vuelvo a mi valor original
  expect(r.sinCambios).toBeUndefined();                          // NO se da por guardado
  expect(S.escrituras()).toEqual(["PATCH main"]);
});

test("sin carga exitosa sigue bloqueado (Regla 9), aun si el valor parece igual", async () => {
  const S = servidorFalso({});
  const p = crearPersistencia({ fetch: S.fetch, logger: silencio });
  const r = await p.saveConfirmed("main", { a: 1 });
  expect(r.ok).toBe(false);
  expect(r.motivo).toBe("sin_carga");
  expect(S.escrituras()).toEqual([]);
});

test("forzar escribe aunque no haya cambios", async () => {
  const S = servidorFalso({ main: { value: { a: 1 }, updated_at: "v1" } });
  const p = crearPersistencia({ fetch: S.fetch, logger: silencio });
  await p.load("main");
  await p.saveConfirmed("main", { a: 1 }, { forzar: true });
  expect(S.escrituras()).toEqual(["PATCH main"]);
});
