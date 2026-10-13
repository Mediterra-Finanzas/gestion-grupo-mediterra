/* eslint-disable */
// Registro de auditoría con escrituras REALMENTE simultáneas (oct-2026).
// Servidor falso con la semántica de PostgREST que importa aquí: el PATCH
// `updated_at=eq.<v>` es atómico (compara y escribe en un solo paso) y devuelve [] si la
// versión ya cambió; el INSERT de una fila que ya existe responde 409. Cada respuesta
// tarda un tiempo al azar, así que las sesiones leen la MISMA versión y chocan de verdad.
import { agregarEventosAtomico, unirPorId } from "../persistencia/auditoriaAtomica";

const ESPERA = () => new Promise((r) => setTimeout(r, Math.random() * 12));
function servidorFalso({ fila = null, perderRespuesta = 0 } = {}) {
  const st = { fila: fila ? { ...fila } : null, seq: 0, patchs: 0, conflictos: 0, perdidas: perderRespuesta };
  const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  st.fetch = async (url, opts = {}) => {
    const metodo = (opts.method || "GET").toUpperCase();
    await ESPERA();                                            // la red: las peticiones se entrelazan
    if (metodo === "GET") { const f = st.fila; return resp(200, f ? [{ value: JSON.parse(JSON.stringify(f.value)), updated_at: f.updated_at }] : []); }
    const body = JSON.parse(opts.body);
    if (metodo === "PATCH") {
      st.patchs++;
      const v = decodeURIComponent(/updated_at=eq\.([^&]+)/.exec(url)[1]);
      // compara-y-escribe atómico (un solo paso síncrono, como el UPDATE … WHERE de Postgres)
      if (!st.fila || st.fila.updated_at !== v) { st.conflictos++; await ESPERA(); return resp(200, []); }
      st.fila = { value: body.value, updated_at: `v${++st.seq}` };
      const rep = [{ id: "audit_log", updated_at: st.fila.updated_at }];
      await ESPERA();
      if (st.perdidas > 0) { st.perdidas--; throw new Error("se perdió la respuesta (simulado)"); }   // escrito, pero el cliente no lo sabe
      return resp(200, rep);
    }
    if (metodo === "POST") {
      if (st.fila) return resp(409, { message: "duplicate key" });
      st.fila = { value: body.value, updated_at: `v${++st.seq}` }; return resp(201, [{ id: "audit_log", updated_at: st.fila.updated_at }]);
    }
    throw new Error("método inesperado " + metodo);
  };
  return st;
}
const ev = (sesion, i) => ({ id: `ev_${sesion}_${i}`, timestamp: "2026-10-13T12:00:00.000Z", descripcion: `sesión ${sesion} evento ${i}` });
const eventosDe = (st) => { const v = st.fila.value; return (typeof v === "string" ? JSON.parse(v) : v).eventos; };

test("8 sesiones × 5 envíos simultáneos: no se pierde ni se duplica ningún evento", async () => {
  const st = servidorFalso({ fila: { value: { eventos: [{ id: "previo", timestamp: "2026-10-01T00:00:00Z" }] }, updated_at: "v0" } });
  const sesiones = Array.from({ length: 8 }, (_, s) => s);
  await Promise.all(sesiones.map(async (s) => {
    for (let k = 0; k < 5; k++) {
      await agregarEventosAtomico({ fetchImpl: st.fetch, url: "x", key: "k", nuevos: [ev(s, 2 * k), ev(s, 2 * k + 1)], esperaBaseMs: 3, maxIntentos: 60 });
    }
  }));
  const ids = eventosDe(st).map((e) => e.id);
  expect(ids.length).toBe(1 + 8 * 5 * 2);
  expect(new Set(ids).size).toBe(ids.length);               // sin duplicados
  expect(ids).toContain("previo");
  expect(st.conflictos).toBeGreaterThan(0);                 // hubo choques de verdad
});

test("una escritura que llegó pero cuya respuesta se perdió: el reintento no duplica", async () => {
  const st = servidorFalso({ fila: { value: { eventos: [] }, updated_at: "v0" }, perderRespuesta: 1 });
  const nuevos = [ev("A", 1), ev("A", 2)];
  await expect(agregarEventosAtomico({ fetchImpl: st.fetch, url: "x", key: "k", nuevos, esperaBaseMs: 1 })).rejects.toThrow(/perdió/);
  // quien llama conserva los eventos y reintenta en el siguiente envío
  const r = await agregarEventosAtomico({ fetchImpl: st.fetch, url: "x", key: "k", nuevos, esperaBaseMs: 1 });
  expect(r.agregados).toBe(0);                              // ya estaban: no se agregan de nuevo
  expect(eventosDe(st).map((e) => e.id)).toEqual(["ev_A_1", "ev_A_2"]);
});

test("dos sesiones crean la fila a la vez: una crea, la otra choca (409) y agrega encima", async () => {
  const st = servidorFalso({ fila: null });
  await Promise.all([
    agregarEventosAtomico({ fetchImpl: st.fetch, url: "x", key: "k", nuevos: [ev("A", 1)], esperaBaseMs: 2, maxIntentos: 30 }),
    agregarEventosAtomico({ fetchImpl: st.fetch, url: "x", key: "k", nuevos: [ev("B", 1)], esperaBaseMs: 2, maxIntentos: 30 }),
  ]);
  expect(eventosDe(st).map((e) => e.id).sort()).toEqual(["ev_A_1", "ev_B_1"]);
});

test("una fila guardada como texto se reescribe como texto", async () => {
  const st = servidorFalso({ fila: { value: JSON.stringify({ eventos: [] }), updated_at: "v0" } });
  await agregarEventosAtomico({ fetchImpl: st.fetch, url: "x", key: "k", nuevos: [ev("A", 1)] });
  expect(typeof st.fila.value).toBe("string");
  expect(eventosDe(st).length).toBe(1);
});

test("una lectura fallida lanza y no escribe nada", async () => {
  const st = servidorFalso({ fila: { value: { eventos: [{ id: "x" }] }, updated_at: "v0" } });
  const f = async (u, o = {}) => ((o.method || "GET") === "GET" ? { ok: false, status: 503, json: async () => ({}) } : st.fetch(u, o));
  await expect(agregarEventosAtomico({ fetchImpl: f, url: "x", key: "k", nuevos: [ev("A", 1)] })).rejects.toThrow(/503/);
  expect(st.patchs).toBe(0);
});

test("control: leer y luego escribir SIN condición (lo anterior) pierde eventos con la misma carrera", async () => {
  const st = servidorFalso({ fila: { value: { eventos: [] }, updated_at: "v0" } });
  const ingenuo = async (nuevos) => {               // la estrategia de antes: GET y POST/PATCH sin versión
    const r = await st.fetch("x?id=eq.audit_log"); const f = (await r.json())[0];
    const { todos } = unirPorId(f.value.eventos, nuevos);
    await ESPERA(); st.fila = { value: { eventos: todos }, updated_at: `v${++st.seq}` };
  };
  await Promise.all(Array.from({ length: 8 }, (_, s) => ingenuo([ev(s, 1)])));
  expect(eventosDe(st).length).toBeLessThan(8);
});
