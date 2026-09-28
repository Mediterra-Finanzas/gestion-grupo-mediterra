/* eslint-disable */
// Tests de CONTRATO de dbSaveGeneric (validador opt-in). Mockean fetch: no hay red real.
// Demuestran el ORDEN de llamadas (el validador corre ANTES del write), no sólo el resultado.
// Correr desde el checkout principal: `npm test friskuHelpers.dbSaveGeneric`
import { dbSaveGeneric, dbLoadGeneric, _resetPersistencia } from "../friskuHelpers";
import { validarUnicidadOE } from "../friskuLiquidacionesLogic";

const ID = "frisku_liquidaciones";
const resp = (body, { ok = true, status = 200 } = {}) => ({ ok, status, json: async () => body, text: async () => JSON.stringify(body) });
function mockFetch(queue, calls) {
  global.fetch = jest.fn(async (url, opts) => {
    const method = (opts && opts.method) || "GET";
    calls.push({ method, url: String(url) });
    if (!queue.length) throw new Error("fetch inesperado #" + calls.length + " " + method + " " + url);
    return queue.shift();
  });
}
beforeEach(() => { _resetPersistencia(ID); });
afterEach(() => { global.fetch = undefined; });

test("T1 carrera duplicado_oe: el validador rechaza [B,A] ANTES del 2º write", async () => {
  const A = { id: "A", oeId: "X", estado: "enviada" };
  const B = { id: "B", oeId: "X", estado: "borrador" };
  const calls = [];
  mockFetch([
    resp([{ value: [], updated_at: "V" }]),      // GET load  -> servidor vacío, versión V
    resp([]),                                     // PATCH #1  -> 0 filas = conflicto (B pierde el CAS)
    resp([{ value: [A], updated_at: "V2" }]),     // GET reread -> A ganó
    // Si hubiera un 4º fetch (2º PATCH del candidato [B,A]) el mock lanza y el test falla.
  ], calls);
  await dbLoadGeneric(ID);                        // fija versión=V, base=[]
  const r = await dbSaveGeneric(ID, [B], { requiereFilaExistente: true, validarCandidato: validarUnicidadOE });
  expect(r.ok).toBe(false);
  expect(r.motivo).toBe("duplicado_oe");
  expect(r.idExistente).toBe("A");               // la ganadora (ya en el servidor)
  expect(calls.filter(c => c.method === "PATCH").length).toBe(1); // sólo el write perdedor
  expect(calls.length).toBe(3);                  // GET, PATCH, GET — nunca el 2º PATCH
});

test("T2 requiereFilaExistente: fila ausente -> fila_ausente SIN escribir", async () => {
  const calls = [];
  mockFetch([ resp([]) /* GET load -> sin filas */ ], calls);
  await dbLoadGeneric(ID);                        // versión = null (fila ausente)
  const r = await dbSaveGeneric(ID, [{ id: "B", oeId: "X" }], { requiereFilaExistente: true, validarCandidato: validarUnicidadOE });
  expect(r.ok).toBe(false);
  expect(r.motivo).toBe("fila_ausente");
  expect(calls.filter(c => c.method !== "GET").length).toBe(0); // ninguna escritura (ni POST ni PATCH)
});

test("T3 SIN requiereFilaExistente: fila ausente -> POST histórico (retrocompat)", async () => {
  const calls = [];
  mockFetch([
    resp([]),                                     // GET load -> sin filas
    resp([{ id: ID, updated_at: "V1" }]),         // POST upsert -> confirma
  ], calls);
  await dbLoadGeneric(ID);
  const r = await dbSaveGeneric(ID, [{ id: "B", oeId: "X" }]); // sin opts
  expect(r.ok).toBe(true);
  expect(calls.some(c => c.method === "POST")).toBe(true);     // comportamiento histórico intacto
});

test("T4 OEs distintas: fusiona y SÍ escribe el 2º write (no rechaza)", async () => {
  const A = { id: "A", oeId: "X", estado: "enviada" };
  const B = { id: "B", oeId: "Y", estado: "borrador" };
  const calls = [];
  mockFetch([
    resp([{ value: [], updated_at: "V" }]),       // GET load
    resp([]),                                      // PATCH #1 conflicto
    resp([{ value: [A], updated_at: "V2" }]),      // GET reread -> A (otra OE)
    resp([{ value: [B, A], updated_at: "V3" }]),   // PATCH #2 -> ok (fusión OEs distintas)
  ], calls);
  await dbLoadGeneric(ID);
  const r = await dbSaveGeneric(ID, [B], { requiereFilaExistente: true, validarCandidato: validarUnicidadOE });
  expect(r.ok).toBe(true);
  expect(r.fusionado).toBe(true);
  expect(calls.filter(c => c.method === "PATCH").length).toBe(2); // el 2º write ocurre: no hay duplicado
});

test("T5 sin opts: comportamiento idéntico (PATCH directo exitoso)", async () => {
  const calls = [];
  mockFetch([
    resp([{ value: [{ id: "Z", oeId: "Q" }], updated_at: "V" }]),   // GET load
    resp([{ value: [{ id: "Z", oeId: "Q" }], updated_at: "V2" }]),  // PATCH -> ok
  ], calls);
  await dbLoadGeneric(ID);
  const r = await dbSaveGeneric(ID, [{ id: "Z", oeId: "Q" }]);
  expect(r.ok).toBe(true);
  expect(r.fusionado).toBe(false);
});

test("T6 el validador corre también ANTES del write inicial (P1)", async () => {
  // Candidato inicial ya duplicado (dos activas misma OE) -> rechazo antes de cualquier fetch de escritura.
  const cand = [{ id: "A", oeId: "X", estado: "enviada" }, { id: "B", oeId: "X", estado: "borrador" }];
  const calls = [];
  mockFetch([ resp([{ value: [], updated_at: "V" }]) /* GET load */ ], calls);
  await dbLoadGeneric(ID);
  const r = await dbSaveGeneric(ID, cand, { requiereFilaExistente: true, validarCandidato: validarUnicidadOE });
  expect(r.ok).toBe(false);
  expect(r.motivo).toBe("duplicado_oe");
  expect(calls.filter(c => c.method !== "GET").length).toBe(0); // ninguna escritura
});

// ── Fix incidente Carolina: un duplicado YA persistido no debe bloquear el guardado ──
test("T7 duplicado PREEXISTENTE en el servidor -> NO bloquea; el guardado procede (desbloqueo)", async () => {
  const A = { id: "A", oeId: "X", estado: "pagada" };
  const B = { id: "B", oeId: "X", estado: "pagada" };    // dup ya persistido (dato legado)
  const C = { id: "C", oeId: "Y", estado: "borrador" };  // edición NO relacionada de Carolina
  const calls = [];
  mockFetch([
    resp([{ value: [A, B], updated_at: "V" }]),          // GET load -> servidor ya trae el duplicado
    resp([{ value: [A, B, C], updated_at: "V2" }]),      // PATCH -> ok (el validador lo tolera)
  ], calls);
  await dbLoadGeneric(ID);
  const r = await dbSaveGeneric(ID, [A, B, C], { requiereFilaExistente: true, validarCandidato: validarUnicidadOE });
  expect(r.ok).toBe(true);
  expect(calls.filter(c => c.method === "PATCH").length).toBe(1); // el write SÍ ocurre (ya no bloquea)
});

test("T8 AUMENTAR el duplicado preexistente (3ª activa misma OE) -> rechazado sin escribir", async () => {
  const A = { id: "A", oeId: "X" }, B = { id: "B", oeId: "X" }, D = { id: "D", oeId: "X" };
  const calls = [];
  mockFetch([ resp([{ value: [A, B], updated_at: "V" }]) ], calls);  // solo GET
  await dbLoadGeneric(ID);
  const r = await dbSaveGeneric(ID, [A, B, D], { requiereFilaExistente: true, validarCandidato: validarUnicidadOE });
  expect(r.ok).toBe(false);
  expect(r.motivo).toBe("duplicado_oe");
  expect(calls.filter(c => c.method !== "GET").length).toBe(0);      // no escribe
});

test("T9 carga fallida PROPAGA (no habilita guardar con defaults) — anti-borrado", async () => {
  global.fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => "" }));
  await expect(dbLoadGeneric(ID)).rejects.toThrow();   // la excepción debe propagar al caller
});

test("T10 error de Supabase conserva lo local; reintento posterior SÍ guarda", async () => {
  const Z = { id: "Z", oeId: "Q" }, Z2 = { id: "Z2", oeId: "Q2" };
  const calls = [];
  mockFetch([
    resp([{ value: [Z], updated_at: "V0" }]),            // GET load
    resp("boom", { ok: false, status: 400 }),            // PATCH -> 400 (rechazo del servidor)
  ], calls);
  await dbLoadGeneric(ID);
  const r1 = await dbSaveGeneric(ID, [Z, Z2]);
  expect(r1.ok).toBe(false);
  expect(r1.motivo).toBe("http");
  expect(r1.status).toBe(400);                           // el error se reporta, no se traga
  // El error NO corrompió la base ni consumió la versión: el reintento parte de la MISMA versión.
  const calls2 = [];
  mockFetch([ resp([{ value: [Z, Z2], updated_at: "V1" }]) ], calls2);  // PATCH reintento -> ok
  const r2 = await dbSaveGeneric(ID, [Z, Z2]);
  expect(r2.ok).toBe(true);
  expect(calls2.filter(c => c.method === "PATCH").length).toBe(1);
});

test("T11 nunca escribe a un id distinto del indicado", async () => {
  const calls = [];
  mockFetch([
    resp([{ value: [], updated_at: "V" }]),
    resp([{ value: [{ id: "N", oeId: "O" }], updated_at: "V2" }]),
  ], calls);
  await dbLoadGeneric(ID);
  await dbSaveGeneric(ID, [{ id: "N", oeId: "O" }]);
  for (const c of calls) {
    expect(c.url).toContain("calendario_data");
    if (c.method !== "POST") expect(c.url).toContain("id=eq." + ID);   // siempre la MISMA fila
    expect(/id=eq\.(?!frisku_liquidaciones)/.test(c.url)).toBe(false); // jamás otro id
  }
});

test("T12 payload grande realista se serializa y guarda sin pérdida", async () => {
  const grande = Array.from({ length: 250 }, (_, i) => ({ id: "L" + i, oeId: "OE" + i, estado: "pagada", detalle: "x".repeat(200) }));
  let bodyPatch = null;
  global.fetch = jest.fn(async (url, opts) => {
    const method = (opts && opts.method) || "GET";
    if (method === "GET") return resp([{ value: [], updated_at: "V" }]);
    bodyPatch = JSON.parse(opts.body);
    return resp([{ value: grande, updated_at: "V2" }]);
  });
  await dbLoadGeneric(ID);
  const r = await dbSaveGeneric(ID, grande, { requiereFilaExistente: true, validarCandidato: validarUnicidadOE });
  expect(r.ok).toBe(true);
  expect(Array.isArray(bodyPatch.value)).toBe(true);
  expect(bodyPatch.value.length).toBe(250);             // sin pérdida ni truncado
});
