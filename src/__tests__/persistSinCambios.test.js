/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// Guardia "sin cambios efectivos": no se escribe si el valor es idénticamente igual
// (JSON canónico) a lo último CONFIRMADO POR EL SERVIDOR y hay versión conocida.
//
// Lo que NO debe bloquear: una fila nueva, una siembra, una migración, ni una fila
// cuyo valor en memoria está transformado (p. ej. `usuarios` fusionado con
// WORKERS_BASE). De ahí que la comparación sea contra `_servidor` y nunca contra
// `_base`, y que `registrarCarga` SIN `valorServidor` deje el servidor como
// DESCONOCIDO: preferimos un PATCH de más antes que una migración perdida.
//
// `fetch` inyectado y apuntado a un host falso: no sale ninguna petición a la red.
// ═══════════════════════════════════════════════════════════════════════════════
import { crearPersistencia, canonico, MOTIVOS } from "../persistencia/persistContract.js";

const URL_FALSA = "https://falso.test";
const silencio = { info() {}, warn() {}, error() {} };

function servidorFalso(filas = {}) {
  const llamadas = [];
  let seq = 1;
  const resp = (b, st = 200) => ({ ok: st < 400, status: st, json: async () => b, text: async () => JSON.stringify(b) });
  const fetch = async (url, opts = {}) => {
    const m = (opts.method || "GET").toUpperCase();
    const u = new URL(String(url));
    const id = decodeURIComponent((/id=eq\.([^&]+)/.exec(u.search) || [])[1] || "");
    const body = opts.body ? JSON.parse(opts.body) : {};
    llamadas.push({ m, id: id || body.id, host: u.host, path: u.pathname });
    if (m === "GET") return resp(filas[id] ? [{ value: filas[id].value, updated_at: filas[id].updated_at }] : []);
    if (m === "PATCH") {
      const ver = decodeURIComponent((/updated_at=eq\.([^&]+)/.exec(u.search) || [])[1] || "");
      if (!filas[id] || filas[id].updated_at !== ver) return resp([]);
      filas[id] = { value: body.value, updated_at: `v${seq++}` };
      return resp([{ id, updated_at: filas[id].updated_at }]);
    }
    filas[body.id] = { value: body.value, updated_at: `v${seq++}` };
    return resp([{ id: body.id, updated_at: filas[body.id].updated_at }], 201);
  };
  const escrituras = () => llamadas.filter((l) => l.m !== "GET").map((l) => `${l.m} ${l.id}`);
  const hosts = () => [...new Set(llamadas.map((l) => l.host))];
  return { fetch, llamadas, escrituras, hosts, filas };
}
const sesion = (S) => crearPersistencia({ fetch: S.fetch, supaUrl: URL_FALSA, supaKey: "k-falsa", logger: silencio });

test("JSON canónico: el orden de las claves no cambia la huella, el contenido sí", () => {
  expect(canonico({ a: 1, b: { x: 1, y: [1, 2] } })).toBe(canonico({ b: { y: [1, 2], x: 1 }, a: 1 }));
  expect(canonico({ a: 1 })).not.toBe(canonico({ a: 2 }));
  expect(canonico([1, 2])).not.toBe(canonico([2, 1]));          // el orden de un arreglo SÍ cuenta
  expect(canonico({ a: undefined })).toBe(canonico({}));        // undefined no viaja al servidor
});

test("misma información que el servidor → no escribe", async () => {
  const S = servidorFalso({ main: { value: JSON.stringify({ a: 1, b: [1, 2] }), updated_at: "v0" } });
  const p = sesion(S);
  await p.load("main");
  const r = await p.saveConfirmed("main", { a: 1, b: [1, 2] });
  expect(r.ok).toBe(true);
  expect(r.sinCambios).toBe(true);
  expect(r.noEscrito).toBe(true);
  expect(S.escrituras()).toEqual([]);
  expect(p.isDirty("main")).toBe(false);
  expect(S.hosts()).toEqual(["falso.test"]);
});

test("el orden de las claves no cuenta como cambio", async () => {
  const S = servidorFalso({ main: { value: { a: 1, b: { x: 1, y: 2 } }, updated_at: "v0" } });
  const p = sesion(S);
  await p.load("main");
  await p.saveConfirmed("main", { b: { y: 2, x: 1 }, a: 1 });
  expect(S.escrituras()).toEqual([]);
});

test("un cambio real se escribe con control de versión, y repetirlo ya no escribe", async () => {
  const S = servidorFalso({ main: { value: { a: 1 }, updated_at: "v0" } });
  const p = sesion(S);
  await p.load("main");
  const r1 = await p.saveConfirmed("main", { a: 2 });
  expect(r1.ok).toBe(true);
  expect(r1.sinCambios).toBeUndefined();
  expect(S.escrituras()).toEqual(["PATCH main"]);
  expect(S.filas.main.value).toEqual({ a: 2 });
  const r2 = await p.saveConfirmed("main", { a: 2 });
  expect(r2.sinCambios).toBe(true);
  expect(S.escrituras()).toEqual(["PATCH main"]);   // la segunda no escribió
  // 20 auto-saves idénticos seguidos: ni un PATCH más
  for (let i = 0; i < 20; i++) await p.saveConfirmed("main", { a: 2 });
  expect(S.escrituras()).toEqual(["PATCH main"]);
});

test("fila inexistente (siembra) se escribe aunque el valor coincida con la base", async () => {
  const S = servidorFalso({});
  const p = sesion(S);
  p.registrarCarga("usuarios", [{ nombre: "A" }], null, "string");
  const r = await p.saveConfirmed("usuarios", [{ nombre: "A" }]);
  expect(r.ok).toBe(true);
  expect(S.escrituras()).toEqual(["POST usuarios"]);
});

test("MIGRACIÓN: registrarCarga sin `valorServidor` deja el servidor DESCONOCIDO y la escritura se hace igual", async () => {
  // Caso real: App.jsx registra `usuarios` con la lista YA fusionada con WORKERS_BASE
  // (acceso a `rendiciones` otorgado en memoria). Si el guardia comparara contra esa
  // base transformada, la migración se vería "sin cambios" y nunca llegaría a la fila.
  const S = servidorFalso({ usuarios: { value: JSON.stringify([{ nombre: "A" }]), updated_at: "v0" } });
  const p = sesion(S);
  const fusionada = [{ nombre: "A", modulos: ["rendiciones"] }];
  p.registrarCarga("usuarios", fusionada, "v0", true);           // 4 argumentos: sin pista del servidor
  expect(p.estado("usuarios").servidorConocido).toBe(false);
  const r = await p.saveConfirmed("usuarios", fusionada);
  expect(r.ok).toBe(true);
  expect(r.sinCambios).toBeUndefined();
  expect(S.escrituras()).toEqual(["PATCH usuarios"]);
  expect(S.filas.usuarios.value).toEqual(JSON.stringify(fusionada));
  // tras la confirmación, el servidor YA es conocido y el repetido no escribe
  expect(p.estado("usuarios").servidorConocido).toBe(true);
  await p.saveConfirmed("usuarios", fusionada);
  expect(S.escrituras()).toEqual(["PATCH usuarios"]);
});

test("con `valorServidor` explícito el guardia actúa desde el primer auto-save", async () => {
  const S = servidorFalso({ usuarios: { value: JSON.stringify([{ nombre: "A" }]), updated_at: "v0" } });
  const p = sesion(S);
  // 5º argumento: lo que REALMENTE tiene la fila (distinto de lo que hay en memoria)
  p.registrarCarga("usuarios", [{ nombre: "A", modulos: ["x"] }], "v0", true, [{ nombre: "A" }]);
  expect(p.estado("usuarios").servidorConocido).toBe(true);
  // el valor transformado SÍ se escribe (no coincide con el servidor)
  const r = await p.saveConfirmed("usuarios", [{ nombre: "A", modulos: ["x"] }]);
  expect(r.ok).toBe(true);
  expect(S.escrituras()).toEqual(["PATCH usuarios"]);

  // y una "migración" que no cambia nada respecto del servidor no escribe
  const S2 = servidorFalso({ usuarios: { value: JSON.stringify([{ nombre: "A" }]), updated_at: "v0" } });
  const p2 = sesion(S2);
  p2.registrarCarga("usuarios", [{ nombre: "A" }], "v0", true, [{ nombre: "A" }]);
  const r2 = await p2.saveConfirmed("usuarios", [{ nombre: "A" }]);
  expect(r2.sinCambios).toBe(true);
  expect(S2.escrituras()).toEqual([]);
});

test("forzar escribe aunque no haya cambios", async () => {
  const S = servidorFalso({ main: { value: { a: 1 }, updated_at: "v0" } });
  const p = sesion(S);
  await p.load("main");
  const r = await p.saveConfirmed("main", { a: 1 }, { forzar: true });
  expect(r.ok).toBe(true);
  expect(r.sinCambios).toBeUndefined();
  expect(S.escrituras()).toEqual(["PATCH main"]);
  expect(S.filas.main.updated_at).toBe("v1");
});

test("sin carga exitosa sigue bloqueado (Regla 9), aun si el valor parece igual", async () => {
  const S = servidorFalso({ main: { value: { a: 1 }, updated_at: "v0" } });
  const p = sesion(S);
  const r = await p.saveConfirmed("main", { a: 1 });
  expect(r.ok).toBe(false);
  expect(r.motivo).toBe(MOTIVOS.SIN_CARGA);
  expect(S.escrituras()).toEqual([]);
});

test("reconcileIncoming actualiza `_servidor`: no se da por guardado algo que el servidor ya no tiene", async () => {
  const S = servidorFalso({ main: { value: { a: 1 }, updated_at: "v0" } });
  const p = sesion(S);
  await p.load("main");
  p.marcarSucio("main");
  S.filas.main = { value: { a: 9 }, updated_at: "v9" };       // otra persona guardó a=9
  const dec = p.reconcileIncoming("main", { a: 9 }, "v9");    // no se aplica (local sucio)
  expect(dec.apply).toBe(false);
  expect(dec.conflictoPendiente).toBe(true);

  // Vuelvo a mi valor original: NO se declara "sin cambios" (el servidor tiene a=9)
  // y tampoco se escribe, porque la fila quedó en conflicto pendiente.
  const r = await p.saveConfirmed("main", { a: 1 });
  expect(r.sinCambios).toBeUndefined();
  expect(r.ok).toBe(false);
  expect(r.motivo).toBe(MOTIVOS.CONFLICTO_PENDIENTE);
  expect(S.escrituras()).toEqual([]);
  expect(S.filas.main.value).toEqual({ a: 9 });

  // Resuelto a favor de lo local, se escribe sobre la versión vigente
  const rr = await p.reconciliarConservandoLocal("main", { a: 1 });
  expect(rr.ok).toBe(true);
  expect(S.escrituras()).toEqual(["PATCH main"]);
  expect(S.filas.main.value).toEqual({ a: 1 });
});

test("una colección sin cambios tampoco escribe, y con un ítem nuevo sí", async () => {
  const S = servidorFalso({ rendiciones: { value: JSON.stringify([{ id: "A" }]), updated_at: "v0" } });
  const p = sesion(S);
  await p.load("rendiciones");
  await p.saveConfirmed("rendiciones", [{ id: "A" }], { merge: true });
  expect(S.escrituras()).toEqual([]);
  const r = await p.saveConfirmed("rendiciones", [{ id: "A" }, { id: "B" }], { merge: true });
  expect(r.ok).toBe(true);
  expect(S.escrituras()).toEqual(["PATCH rendiciones"]);
});

test("ninguna petición sale a la red real", async () => {
  const S = servidorFalso({ main: { value: { a: 1 }, updated_at: "v0" } });
  const p = sesion(S);
  await p.load("main");
  await p.saveConfirmed("main", { a: 2 });
  await p.saveConfirmed("main", { a: 2 });
  expect(S.hosts()).toEqual(["falso.test"]);
  expect(S.llamadas.filter((l) => /supabase\.co$/.test(l.host)).length).toBe(0);
  expect([...new Set(S.llamadas.map((l) => l.path))]).toEqual(["/rest/v1/calendario_data"]);
});
