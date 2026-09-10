/* eslint-disable */
/* COBERTURA DEL RESPALDO · Tareas, credenciales completas y reconstrucción sin bóveda.
 *
 * Datos SINTÉTICOS con la forma medida en staging el 2026-09-10: `main` con padrón y nueve
 * claves de Tareas; `pins` con `_h` (incluye `fecha` y `pol`), `_hist` y `_tel`.
 * Cada caso tiene su contraprueba: lo que antes se perdía, o lo que nunca debe viajar.
 *
 * Además: modo de identidad declarado (bóveda o legacy), vínculo por nombre exacto
 * (repetidos, colisión, acentos, renombre) y reemisión del código provisorio.
 */
const crypto = require("crypto");
const path = require("path");
const S = require(path.resolve(__dirname, "..", "respaldoDesdeSnapshot.js"));
const I = require(path.resolve(__dirname, "..", "respaldoIdentidad.js"));
const R = require(path.resolve(__dirname, "..", "reconstruirDesdeLote.js"));
const V = require(path.resolve(__dirname, "..", "verificacionCredencialLegacy.js"));

const hashLlave = (n) => crypto.createHash("sha256").update(Buffer.from(String(n), "utf8")).digest("hex");
const UUID = { U1: "11111111-1111-4111-8111-111111111111", U2: "22222222-2222-4222-8222-222222222222" };
const usuario = (nombre, extra) => ({ nombre, email: nombre.toLowerCase() + "@x.invalid", cargo: "", rol: "editor",
  modulos: ["tareas"], empresas_permitidas: ["MED"], esCFO: false, desactivado: false, tab_permisos: { finanzas: "sin_acceso" },
  cadenaAprobacion: [], rendPorOtros: false, rendVerTodas: false, pin: "", ...extra });
const TAREAS = { mes: 9, anio: 2026, estados: { t1__MED: "verde" }, recsDone: { r1: true }, comentarios: { t1: "ok" },
  tareasExtra: [{ id: "x1" }], supervisores: ["U1"], tareasConfig: { m14: { diaLimite: 12 } }, recsComentarios: { r1: "listo" } };
const MAIN = { ...TAREAS, usuarios: [usuario("U1", { rol: "admin", esCFO: true, pin: "445566" }), usuario("U2", { desactivado: true })] };
const CRED_U1 = { v: 1, iter: 100000, salt: "a".repeat(32), hash: "b".repeat(64), fecha: "2026-09-01", pol: "6dig" };
const HIST_U1 = [{ v: 1, iter: 100000, salt: "c".repeat(32), hash: "d".repeat(64) }];
const PINS = {
  U1_h: JSON.stringify(CRED_U1),
  U1_hist: JSON.stringify(HIST_U1),
  U1_tel: "56911111111",
  U2_tel: "56922222222",
  U2_temp: JSON.stringify({ v: 1, iter: 100000, salt: "e".repeat(32), hash: "f".repeat(64), exp: 1 }),
};
const snapshot = (main = MAIN, pins = PINS) => ({
  tomado_at: "2026-09-10T12:00:00.000Z",
  datos: [
    { id: "main", value: main, updated_at: "2026-09-10T11:00:00.000Z" },
    { id: "osiris", value: { contratos: [{ id: "c1" }] }, updated_at: "2026-09-10T11:00:00.000Z" },
    { id: "pins", value: pins, updated_at: "2026-09-10T11:00:00.000Z" },
  ],
  identidades: [{ llave_hash: hashLlave("U1"), identity_id: UUID.U1 }, { llave_hash: hashLlave("U2"), identity_id: UUID.U2 }],
});
const par = (snap = snapshot()) => S.construirPar({ snapshot: snap, correlationId: "c", lote: "l",
  resolverIdentidad: S.resolverDesdeSnapshot(snap, hashLlave), hashLlave });
const conBoveda = (snap) => ({ ...snap, modo_identidad: "boveda" });
const sinBoveda = (snap) => ({ ...snap, modo_identidad: "legacy", identidades: null });
const parLegacy = (snap = sinBoveda(snapshot())) => S.construirPar({ snapshot: snap, correlationId: "c", lote: "l", hashLlave, modoIdentidad: "legacy" });
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

describe("Tareas en main", () => {
  test("las nueve claves de Tareas viajan en negocio.main y el padrón no se duplica", () => {
    const p = S.partirSnapshot(snapshot());
    expect(Object.keys(p.negocio.main.value).sort()).toEqual(Object.keys(TAREAS).sort());
    expect(p.negocio.main.value.usuarios).toBeUndefined();
    expect(p.mainNoClasificadas).toEqual([]);
  });

  test("CONTRAPRUEBA · una clave de main no declarada detiene el respaldo", () => {
    const r = par(snapshot({ ...MAIN, claveNueva: 1 }));
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe(S.MOTIVO_SNAPSHOT.MAIN_NO_CLASIFICADA);
    expect(r.desconocidos).toEqual(["claveNueva"]);
  });
});

describe("Identidades del mismo snapshot", () => {
  test("se resuelven desde el snapshot, sin otra lectura", () => {
    const res = S.resolverDesdeSnapshot(snapshot(), hashLlave);
    expect(res("U1")).toBe(UUID.U1);
    expect(res("U9")).toBeNull();
  });
  test("un snapshot sin identidades no produce resolvedor", () => {
    expect(S.resolverDesdeSnapshot({ datos: [] }, hashLlave)).toBeNull();
  });
});

describe("Objeto B completo", () => {
  test("`fecha`, `pol`, historial, teléfono y llave_hash viajan en B", () => {
    const r = par();
    expect(r.ok).toBe(true);
    const e = r.B.credenciales.find((x) => x.identity_id === UUID.U1);
    expect(e.fecha).toBe("2026-09-01");
    expect(e.pol).toBe("6dig");
    expect(e.historial).toEqual(HIST_U1);
    expect(e.telefono).toBe("56911111111");
    expect(e.llave_hash).toBe(hashLlave("U1"));
  });

  test("un usuario con teléfono y sin credencial conserva el teléfono como complemento", () => {
    const r = par();
    expect(r.B.complementos).toEqual([{ identity_id: UUID.U2, llave_hash: hashLlave("U2"), historial: null, telefono: "56922222222" }]);
  });

  test("`_temp` no viaja: queda declarado con su motivo y solo viaja la marca de reemisión", () => {
    const r = par();
    expect(JSON.stringify(r.B)).not.toContain("f".repeat(64));
    expect(r.noRespaldados).toContainEqual({ base: "U2", llave: "_temp", motivo: I.MOTIVO_PINS.TEMP_TRANSITORIO });
    expect(r.B.reemisiones).toEqual([{ llave_hash: hashLlave("U2") }]);
  });

  test("un PIN en claro legado en pins no viaja y queda declarado", () => {
    const r = par(snapshot(MAIN, { ...PINS, U1: "112233" }));
    expect(r.ok).toBe(true);
    expect(JSON.stringify(r.A) + JSON.stringify(r.B)).not.toContain("112233");
    expect(r.noRespaldados).toContainEqual({ base: "U1", llave: "pin", motivo: I.MOTIVO_PINS.PIN_EN_CLARO });
  });

  test("el PIN en claro del padrón no viaja ni en A ni en B", () => {
    const r = par();
    expect(JSON.stringify(r.A) + JSON.stringify(r.B)).not.toContain("445566");
  });

  test("CONTRAPRUEBA · una llave de pins no clasificada detiene el respaldo sin exponer su nombre", () => {
    const r = par(snapshot(MAIN, { ...PINS, "config-desconocida": "x" }));
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe(I.MOTIVO_PINS.LLAVE_NO_CLASIFICADA);
    expect(r.desconocidos).toBe("1 llaves");
  });

  test("un historial ilegible se reporta y no se copia", () => {
    const r = par(snapshot(MAIN, { ...PINS, U1_hist: "2" }));
    expect(r.B.credenciales[0].historial).toBeNull();
    expect(r.noRespaldados).toContainEqual({ base: "U1", llave: "_hist", motivo: I.MOTIVO_PINS.HISTORIAL_ILEGIBLE });
  });

  test("el teléfono no viaja en A", () => {
    const r = par();
    expect(JSON.stringify(r.A)).not.toContain("56911111111");
  });
});

describe("Reconstrucción desde el lote, sin bóveda", () => {
  const omitirPin = (m) => ({ ...m, usuarios: m.usuarios.map(({ pin, ...u }) => u) });

  test("main vuelve idéntico al origen salvo el PIN en claro", () => {
    const r = par();
    const { filas } = R.reconstruirDesdeLote({ A: r.A, B: r.B, hashLlave });
    expect(filas.main.value).toEqual(omitirPin(MAIN));
  });

  test("pins vuelve con `_h` completo, historial y teléfonos; `_temp` solo como marca vencida", () => {
    const r = par();
    const { filas, sinDueno, ambiguas } = R.reconstruirDesdeLote({ A: r.A, B: r.B, hashLlave });
    expect(sinDueno).toEqual([]);
    expect(ambiguas).toEqual([]);
    expect(JSON.parse(filas.pins.value.U1_h)).toEqual(CRED_U1);
    expect(JSON.parse(filas.pins.value.U1_hist)).toEqual(HIST_U1);
    expect(filas.pins.value.U1_tel).toBe("56911111111");
    expect(filas.pins.value.U2_tel).toBe("56922222222");
    expect(JSON.parse(filas.pins.value.U2_temp)).toEqual(R.TEMP_REEMISION);
    expect(filas.pins.value.U2_temp).not.toContain("f".repeat(64));
  });

  test("los recursos de negocio vuelven tal cual y el desactivado sigue desactivado", () => {
    const r = par();
    const { filas } = R.reconstruirDesdeLote({ A: r.A, B: r.B, hashLlave });
    expect(filas.osiris.value).toEqual({ contratos: [{ id: "c1" }] });
    expect(filas.main.value.usuarios.find((u) => u.nombre === "U2").desactivado).toBe(true);
  });

  test("CONTRAPRUEBA · una credencial cuyo llave_hash no calza con nadie no se asigna", () => {
    const r = par();
    const B = { ...r.B, credenciales: r.B.credenciales.map((e) => ({ ...e, llave_hash: hashLlave("nadie") })) };
    const { filas, sinDueno } = R.reconstruirDesdeLote({ A: r.A, B, hashLlave });
    expect(filas.pins.value.U1_h).toBeUndefined();
    expect(sinDueno).toEqual([UUID.U1]);
  });
});

describe("Modo de identidad · declarado y confirmado por el snapshot", () => {
  const M = S.MOTIVO_SNAPSHOT;
  const decidir = (snapshot, declarado) => S.decidirModoIdentidad({ snapshot, declarado });

  test("bóveda declarada con bóveda en el origen, y legacy declarado sin bóveda: ok", () => {
    expect(decidir(conBoveda(snapshot()), "boveda")).toEqual({ ok: true, modo: "boveda" });
    expect(decidir(sinBoveda(snapshot()), "legacy")).toEqual({ ok: true, modo: "legacy" });
  });

  test("CONTRAPRUEBA · origen sin bóveda con el modo por defecto (bóveda): se detiene", () => {
    const r = decidir(sinBoveda(snapshot()), "boveda");
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe(M.MODO_DISTINTO);
  });

  test("CONTRAPRUEBA · legacy declarado con bóveda en el origen: se detiene, legacy no tapa identidades", () => {
    const r = decidir(conBoveda(snapshot()), "legacy");
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe(M.MODO_DISTINTO);
  });

  test("bóveda a medias, bóveda sin alias y snapshot sin modo son errores, nunca legacy", () => {
    for (const declarado of ["boveda", "legacy"])
      expect(decidir({ ...snapshot(), modo_identidad: "boveda_incompleta", identidades: null }, declarado).motivo).toBe(M.BOVEDA_INCOMPLETA);
    expect(decidir({ ...snapshot(), modo_identidad: "boveda", identidades: [] }, "boveda").motivo).toBe(M.BOVEDA_SIN_ALIAS);
    expect(decidir(snapshot(), "boveda").motivo).toBe(M.MODO_INDETERMINADO);                              // forma anterior, sin el campo
    expect(decidir({ ...snapshot(), modo_identidad: "legacy" }, "legacy").motivo).toBe(M.MODO_INDETERMINADO); // dice legacy y trae identidades
  });

  test("modo ausente o mal escrito: se detiene", () => {
    for (const declarado of [undefined, "", "LEGACY", "auto"])
      expect(decidir(sinBoveda(snapshot()), declarado).motivo).toBe(I.MOTIVO_PINS.MODO_NO_DECLARADO);
  });
});

describe("Modo legacy · origen sin bóveda", () => {
  test("A y B se construyen sin identidades y sin inventar ningún UUID", () => {
    const r = parLegacy();
    expect(r.ok).toBe(true);
    expect(r.A.modo_identidad).toBe("legacy");
    expect(r.B.modo_identidad).toBe("legacy");
    expect(r.sinIdentidad).toEqual([]);
    expect(r.B.total).toBe(1);
    expect([...r.B.credenciales, ...r.B.complementos].every((e) => e.identity_id === null)).toBe(true);
    expect(JSON.stringify(r.B)).not.toMatch(UUID_RE);
  });

  test("la reconstrucción legacy devuelve las mismas filas que la de bóveda", () => {
    const legacy = R.reconstruirDesdeLote({ ...parLegacy(), hashLlave });
    const boveda = R.reconstruirDesdeLote({ ...par(), hashLlave });
    expect(legacy.filas.pins.value).toEqual(boveda.filas.pins.value);
    expect(legacy.filas.main.value).toEqual(boveda.filas.main.value);
    expect(legacy.sinDueno).toEqual([]);
    expect(legacy.ambiguas).toEqual([]);
    expect(legacy.identidadPorNombre).toEqual({ U1: null, U2: null });
  });

  test("CONTRAPRUEBA · en modo bóveda, una credencial sin alias sigue siendo error", () => {
    const r = par({ ...snapshot(), identidades: [{ llave_hash: hashLlave("U2"), identity_id: UUID.U2 }] });
    expect(r.ok).toBe(true);
    expect(r.sinIdentidad).toEqual(["U1"]);
  });

  test("legacy sin función de huella: se detiene", () => {
    expect(I.construirObjetoB({ pins: PINS, modoIdentidad: "legacy" }).motivo).toBe(I.MOTIVO_PINS.SIN_HASH_LLAVE);
  });
});

describe("Vínculo por nombre exacto (llave legada, no identidad canónica)", () => {
  test("CONTRAPRUEBA · dos usuarios con el mismo nombre detienen el respaldo sin exponer el nombre", () => {
    const main = { ...TAREAS, usuarios: [usuario("U1"), usuario("U1", { email: "otra@x.invalid" })] };
    for (const r of [par(snapshot(main)), parLegacy(sinBoveda(snapshot(main)))]) {
      expect(r.ok).toBe(false);
      expect(r.motivo).toBe(I.MOTIVO_PINS.NOMBRE_DUPLICADO);
      expect(r.desconocidos).toBe("1 nombres repetidos");
    }
  });

  test("CONTRAPRUEBA · dos nombres con la misma huella detienen el respaldo y no se asignan al reconstruir", () => {
    const choca = () => "misma-huella";
    expect(I.construirObjetoB({ pins: {}, hashLlave: choca, nombres: ["Ana", "Beto"], modoIdentidad: "legacy" }).motivo)
      .toBe(I.MOTIVO_PINS.COLISION_LLAVE);
    const A = { negocio: {}, padron: { usuarios: [usuario("Ana"), usuario("Beto")] } };
    const B = { credenciales: [{ identity_id: null, llave_hash: "misma-huella", version: 1, iteraciones: 1, sal: "a", hash: "b" }] };
    const rec = R.reconstruirDesdeLote({ A, B, hashLlave: choca });
    expect(rec.ambiguas).toHaveLength(1);
    expect(rec.filas.pins.value).toEqual({});
  });

  test("'José' y 'Jose' son dos usuarios con dos credenciales: no se funden", () => {
    const credJose = { ...CRED_U1, salt: "1".repeat(32) }, credJose2 = { ...CRED_U1, salt: "2".repeat(32) };
    const main = { ...TAREAS, usuarios: [usuario("José"), usuario("Jose")] };
    const pins = { "José_h": JSON.stringify(credJose), "Jose_h": JSON.stringify(credJose2) };
    const conIds = { ...snapshot(main, pins), identidades: [{ llave_hash: hashLlave("José"), identity_id: UUID.U1 },
                                                           { llave_hash: hashLlave("Jose"), identity_id: UUID.U2 }] };
    for (const r of [parLegacy(sinBoveda(snapshot(main, pins))), par(conIds)]) {
      expect(r.ok).toBe(true);
      expect(r.B.total).toBe(2);
      expect(r.basesHuerfanas).toEqual([]);
      const { filas } = R.reconstruirDesdeLote({ A: r.A, B: r.B, hashLlave });
      expect(JSON.parse(filas.pins.value["José_h"])).toEqual(credJose);
      expect(JSON.parse(filas.pins.value["Jose_h"])).toEqual(credJose2);
    }
  });

  test("la misma letra en otra forma Unicode (NFD) es otra llave: queda huérfana, no se funde", () => {
    const nfc = "José", nfd = "José";
    const r = parLegacy(sinBoveda(snapshot({ ...TAREAS, usuarios: [usuario(nfd)] }, { [nfc + "_h"]: JSON.stringify(CRED_U1) })));
    expect(r.ok).toBe(true);
    expect(r.B.total).toBe(0);
    expect(r.basesHuerfanas).toEqual([nfc]);
  });

  test("resolverContra no quita acentos ni mayúsculas y no usa el correo", () => {
    const res = S.resolverContra({ usuarios: [{ nombre: "José", email: "jose@x.invalid", identity_id: UUID.U1 }] });
    expect(res("José")).toBe(UUID.U1);
    for (const otra of ["Jose", "josé", "JOSÉ", "jose@x.invalid"]) expect(res(otra)).toBeNull();
  });

  test("resolverDesdeSnapshot: una huella con dos UUID distintos no se resuelve", () => {
    const snap = { identidades: [{ llave_hash: hashLlave("U1"), identity_id: UUID.U1 }, { llave_hash: hashLlave("U1"), identity_id: UUID.U2 }] };
    expect(S.resolverDesdeSnapshot(snap, hashLlave)("U1")).toBeNull();
  });

  test("cambio de nombre: la credencial vieja queda huérfana, conserva su material y no se asigna al nombre nuevo", () => {
    const main = { ...TAREAS, usuarios: [usuario("U1 Renombrado"), usuario("U2", { desactivado: true })] };
    for (const r of [parLegacy(sinBoveda(snapshot(main))), par(snapshot(main))]) {
      expect(r.ok).toBe(true);
      expect(r.basesHuerfanas).toEqual(["U1"]);
      expect(r.sinIdentidad).toEqual([]);
      expect(r.B.credenciales).toEqual([]);
      expect(r.B.huerfanas).toHaveLength(1);
      const hu = r.B.huerfanas[0];
      expect(hu.llave_hash).toBe(hashLlave("U1"));
      expect(hu.credencial.hash).toBe(CRED_U1.hash);
      expect(hu.historial).toEqual(HIST_U1);
      expect(hu.telefono).toBe("56911111111");
      const rec = R.reconstruirDesdeLote({ A: r.A, B: r.B, hashLlave });
      expect(Object.keys(rec.filas.pins.value).filter((k) => k.startsWith("U1"))).toEqual([]);
      expect(rec.huerfanasNoAplicadas).toBe(1);
      expect(rec.sinDueno).toEqual([]);
    }
  });
});

describe("Reemisión del código provisorio", () => {
  const derivar = (pin, salt, iter) => crypto.pbkdf2Sync(String(pin), Buffer.from(salt, "hex"), iter, 32, "sha256").toString("hex");
  const credDe = (pin, extra) => { const salt = crypto.randomBytes(16).toString("hex"); return { v: 1, iter: 1000, salt, hash: derivar(pin, salt, 1000), ...extra }; };
  const verifyPin = async (pin, cred) => {
    try { const c = typeof cred === "string" ? JSON.parse(cred) : cred; return !!(c && c.salt && c.hash) && derivar(pin, c.salt, c.iter || 100000) === c.hash; }
    catch (e) { return false; }
  };
  const hoy = new Date().toISOString().slice(0, 10);
  const PIN_VIEJO = "482915", CODIGO = "731064";
  const usuarios = [usuario("U1")];
  const origen = () => ({
    U1_h: JSON.stringify(credDe(PIN_VIEJO, { fecha: hoy, pol: "6dig" })),
    U1_temp: JSON.stringify({ ...credDe(CODIGO), exp: Date.now() + 45 * 60 * 1000 }),
  });
  const decidir = (pins, pin) => V.decidirAcceso({ usuarios, pins, email: "u1@x.invalid", pin, verifyPin });
  const restaurar = (pins) => {
    const r = parLegacy(sinBoveda(snapshot({ ...TAREAS, usuarios }, pins)));
    return R.reconstruirDesdeLote({ A: r.A, B: r.B, hashLlave });
  };

  test("en el origen, un código vigente inhabilita el PIN anterior", async () => {
    const pins = origen();
    expect(await decidir(pins, PIN_VIEJO)).toBe(V.DECISION.PIN_INHABILITADO);
    expect(await decidir(pins, CODIGO)).toBe(V.DECISION.CODIGO_OK);
  });

  test("restaurado: vuelve la marca vencida, el PIN anterior sigue inhabilitado y el código viejo no sirve", async () => {
    const pinsO = origen();
    const rec = restaurar(pinsO);
    expect(rec.reemitir).toEqual(["U1"]);
    const pinsR = rec.filas.pins.value;
    expect(JSON.parse(pinsR.U1_temp)).toEqual(R.TEMP_REEMISION);
    expect(JSON.parse(pinsR.U1_h)).toEqual(JSON.parse(pinsO.U1_h));
    expect(await decidir(pinsR, PIN_VIEJO)).toBe(V.DECISION.CODIGO_VENCIDO);
    expect(await decidir(pinsR, CODIGO)).toBe(V.DECISION.CODIGO_VENCIDO);
    expect(V.pinInhabilitado(V.ramaDe({ usuarios, pins: pinsO, nombre: "U1" }))).toBe(true);
    expect(V.pinInhabilitado(V.ramaDe({ usuarios, pins: pinsR, nombre: "U1" }))).toBe(true);
    expect(V.estadoTemp(pinsR.U1_temp)).toMatchObject({ existe: true, expirado: true, legacy: false });
  });

  test("CONTRAPRUEBA · sin la marca, restaurar el `_h` rehabilitaría el PIN que el reseteo inhabilitó", async () => {
    const { U1_temp, ...sinMarca } = restaurar(origen()).filas.pins.value;
    expect(await decidir(sinMarca, PIN_VIEJO)).toBe(V.DECISION.ENTRA);
  });

  test("reemitir sobre lo restaurado: el código nuevo entra y crear el PIN borra la marca", async () => {
    const pinsR = restaurar(origen()).filas.pins.value;
    // "¿Olvidaste tu PIN?" o "Resetear PIN": App.jsx escribe un `_temp` nuevo encima.
    const NUEVO = "905217";
    const reemitido = { ...pinsR, U1_temp: JSON.stringify({ ...credDe(NUEVO), exp: Date.now() + 45 * 60 * 1000 }) };
    expect(await decidir(reemitido, NUEVO)).toBe(V.DECISION.CODIGO_OK);
    expect(await decidir(reemitido, PIN_VIEJO)).toBe(V.DECISION.PIN_INHABILITADO);
    // Crear el PIN: App.jsx guarda un `_h` nuevo y borra `_temp`.
    const PIN_NUEVO = "640382";
    const { U1_temp, ...cambiado } = { ...reemitido, U1_h: JSON.stringify(credDe(PIN_NUEVO, { fecha: hoy, pol: "6dig" })) };
    expect(await decidir(cambiado, PIN_NUEVO)).toBe(V.DECISION.ENTRA);
  });

  test("un `_temp` sin usuario en el padrón no deja marca", () => {
    const r = par(snapshot(MAIN, { ...PINS, Otro_temp: "123456" }));
    expect(r.ok).toBe(true);
    expect(r.B.reemisiones).toEqual([{ llave_hash: hashLlave("U2") }]);
    expect(r.basesHuerfanas).toEqual(["Otro"]);
    expect(r.noRespaldados).toContainEqual({ base: "Otro", llave: "_temp", motivo: I.MOTIVO_PINS.TEMP_TRANSITORIO });
  });
});

describe("Huérfanas · preservadas, nunca asignadas, impiden declarar la recuperación completa", () => {
  test("sin huérfanas ni entradas sin dueño, la recuperación completa es declarable", () => {
    const r = par();
    expect(R.evaluarRecuperacion(R.reconstruirDesdeLote({ A: r.A, B: r.B, hashLlave }))).toEqual({ completa: true, motivos: [] });
  });

  test("una huérfana preservada impide declararla, en los dos modos", () => {
    const main = { ...TAREAS, usuarios: [usuario("U1 Renombrado"), usuario("U2", { desactivado: true })] };
    for (const r of [parLegacy(sinBoveda(snapshot(main))), par(snapshot(main))]) {
      expect(r.B.huerfanas).toHaveLength(1);
      const ev = R.evaluarRecuperacion(R.reconstruirDesdeLote({ A: r.A, B: r.B, hashLlave }));
      expect(ev.completa).toBe(false);
      expect(ev.motivos).toEqual(["1 credenciales huérfanas preservadas sin dueño"]);
    }
  });

  test("CONTRAPRUEBA · una huérfana con el nombre de otro usuario en otra capitalización no se le asigna", () => {
    const r = par(snapshot(MAIN, { ...PINS, u1_h: JSON.stringify({ ...CRED_U1, salt: "9".repeat(32) }) }));
    expect(r.basesHuerfanas).toEqual(["u1"]);
    const rec = R.reconstruirDesdeLote({ A: r.A, B: r.B, hashLlave });
    expect(JSON.parse(rec.filas.pins.value.U1_h)).toEqual(CRED_U1);
    expect(rec.filas.pins.value.u1_h).toBeUndefined();
    expect(R.evaluarRecuperacion(rec).completa).toBe(false);
  });

  test("entradas sin dueño o ambiguas también impiden declararla", () => {
    expect(R.evaluarRecuperacion({ huerfanasNoAplicadas: 0, sinDueno: ["x"], ambiguas: [] }).completa).toBe(false);
    expect(R.evaluarRecuperacion({ huerfanasNoAplicadas: 0, sinDueno: [], ambiguas: ["y"] }).completa).toBe(false);
  });
});
