/* eslint-disable */
// Un conflicto NO resuelto no se puede olvidar en el siguiente guardado (oct-2026).
// Caso: maestro_tc (objeto, no fusionable por ítem). La sesión B cambió el USD-CLP a 960;
// esta sesión tiene en pantalla 950 y agregó USD-PEN. El primer guardado choca (bien) y
// avisa. Antes, el conflicto adelantaba la versión a la del servidor sin tocar el estado
// local, así que el SIGUIENTE auto-save escribía 950 encima del 960 de B y devolvía ok.
import { dbSaveGeneric, dbLoadGeneric, _resetPersistencia } from "../friskuHelpers";

const ID = "maestro_tc";
const resp = (body, { ok = true, status = 200 } = {}) => ({ ok, status, json: async () => body, text: async () => JSON.stringify(body) });
let servidor, calls;
function servidorFalso() {
  global.fetch = jest.fn(async (url, opts) => {
    const method = (opts && opts.method) || "GET"; const u = String(url);
    calls.push({ method, body: opts && opts.body });
    if (method === "GET") return resp([{ value: servidor.value, updated_at: servidor.v }]);
    if (method === "PATCH") {
      const m = /updated_at=eq\.([^&]+)/.exec(u); const ver = m ? decodeURIComponent(m[1]) : null;
      if (ver !== servidor.v) return resp([]);                     // condición falla = conflicto
      const b = JSON.parse(opts.body); servidor = { value: b.value, v: "V" + (calls.length + 10) };
      return resp([{ updated_at: servidor.v }]);
    }
    if (method === "POST") { const b = JSON.parse(opts.body); servidor = { value: b.value, v: "VP" }; return resp([{ updated_at: "VP" }]); }
    throw new Error("inesperado " + method);
  });
}
beforeEach(() => { _resetPersistencia(ID); calls = []; });
afterEach(() => { global.fetch = undefined; });

test("tras un conflicto sin resolver, el siguiente guardado tampoco sobrescribe a la otra sesión", async () => {
  servidor = { value: { "USD-CLP": [{ fecha: "2026-10-10", valor: 950, fuente: "manual" }] }, v: "V1" };
  servidorFalso();
  await dbLoadGeneric(ID);
  servidor = { value: { "USD-CLP": [{ fecha: "2026-10-10", valor: 960, fuente: "manual" }] }, v: "V2" };   // la otra sesión
  const local = { "USD-CLP": [{ fecha: "2026-10-10", valor: 950, fuente: "manual" }], "USD-PEN": [{ fecha: "2026-10-10", valor: 3.75, fuente: "manual" }] };
  const r1 = await dbSaveGeneric(ID, local);
  expect(r1.ok).toBe(false);
  const r2 = await dbSaveGeneric(ID, local);                         // el auto-save siguiente
  expect(r2.ok).toBe(false);
  expect(servidor.value["USD-CLP"][0].valor).toBe(960);             // lo de B sigue en el servidor
});

test("un conflicto resuelto por fusión limpia sigue guardando (filas por ítem)", async () => {
  const IDL = "frisku_clientes"; _resetPersistencia(IDL);
  servidor = { value: [{ id: "a", n: 1 }], v: "V1" }; servidorFalso();
  await dbLoadGeneric(IDL);
  servidor = { value: [{ id: "a", n: 1 }, { id: "b", n: 2 }], v: "V2" };   // la otra sesión agregó b
  const r = await dbSaveGeneric(IDL, [{ id: "a", n: 1 }, { id: "c", n: 3 }]);   // esta agregó c
  expect(r.ok).toBe(true);
  expect(servidor.value.map(x => x.id).sort()).toEqual(["a", "b", "c"]);
});
