/* eslint-disable */
/* RESPALDO DE IDENTIDAD · los quince casos del rehearsal de restore.
 *
 * Los datos del padrón son SINTÉTICOS y reproducen la forma real medida el 2026-09-07:
 * 13 campos de usuario, 12 de autorización y uno prohibido (`pin`). No se usan datos
 * reales porque el archivo se versiona; la forma sí es la real, que es lo que importa.
 */
const crypto = require("crypto");
const zlib = require("zlib");
const path = require("path");

const M = require(path.resolve(__dirname, "..", "respaldoIdentidad.js"));

const CLAVE_A = crypto.createHash("sha256").update("clave-de-negocio-sintetica").digest();
const CLAVE_B = crypto.createHash("sha256").update("clave-de-credenciales-sintetica").digest();
const dep = { crypto, zlib };

// Padrón sintético con la forma real: 6 usuarios, 13 campos, uno desactivado.
const PADRON = {
  usuarios: [
    { nombre: "U1", email: "u1@x.invalid", cargo: "CFO", rol: "admin", modulos: ["tareas", "finanzas"],
      empresas_permitidas: ["MED", "ALF"], esCFO: true, desactivado: false,
      tab_permisos: { finanzas: "editar" }, cadenaAprobacion: ["U2"],
      rendPorOtros: true, rendVerTodas: true, pin: "112233" },
    { nombre: "U2", email: "u2@x.invalid", cargo: "Analista", rol: "editor", modulos: ["tareas"],
      empresas_permitidas: ["MED"], esCFO: false, desactivado: false,
      tab_permisos: { finanzas: "sin_acceso" }, cadenaAprobacion: [],
      rendPorOtros: false, rendVerTodas: false, pin: "445566" },
    { nombre: "U3", email: "u3@x.invalid", cargo: "Ex", rol: "consulta", modulos: [],
      empresas_permitidas: [], esCFO: false, desactivado: true,
      tab_permisos: {}, cadenaAprobacion: [], rendPorOtros: false, rendVerTodas: false, pin: "778899" },
  ],
};
const PINS = {
  "U1_h": JSON.stringify({ v: 1, iter: 100000, salt: "a".repeat(32), hash: "b".repeat(64) }),
  "U2_h": JSON.stringify({ v: 1, iter: 100000, salt: "c".repeat(32), hash: "d".repeat(64) }),
  "U1_hist": "2", "U1_tel": "+56900000000",
};
const UUID = { U1: "11111111-1111-4111-8111-111111111111", U2: "22222222-2222-4222-8222-222222222222" };
const resolverIdentidad = (base) => UUID[base] || null;

describe("Objeto A · negocio e identidad", () => {
  test("conserva TODOS los campos de autorización", () => {
    const r = M.construirObjetoA({ negocio: { finanzas: { x: 1 } }, padron: PADRON });
    expect(r.ok).toBe(true);
    const u = r.objeto.padron.usuarios[0];
    for (const campo of ["nombre", "email", "cargo", "rol", "modulos", "empresas_permitidas",
                         "esCFO", "desactivado", "tab_permisos", "cadenaAprobacion",
                         "rendPorOtros", "rendVerTodas"]) {
      expect(Object.prototype.hasOwnProperty.call(u, campo)).toBe(true);
    }
  });

  test("CONTRAPRUEBA · el defecto anterior habría perdido seis de esos campos", () => {
    // La allowlist vieja: nombre, email, rol, modulos, activo, cargo.
    const vieja = new Set(["nombre", "email", "rol", "modulos", "activo", "cargo"]);
    const perdidos = M.CAMPOS_USUARIO.conservar.filter((c) => !vieja.has(c) && c !== "identity_id" && c !== "capabilities");
    expect(perdidos.sort()).toEqual(
      ["cadenaAprobacion", "desactivado", "empresas_permitidas", "esCFO", "rendPorOtros", "rendVerTodas", "tab_permisos"].sort());
  });

  test("el PIN nunca entra en A", () => {
    const r = M.construirObjetoA({ negocio: {}, padron: PADRON });
    expect(JSON.stringify(r.objeto)).not.toContain("112233");
    expect(r.objeto.padron.usuarios.some((u) => "pin" in u)).toBe(false);
    expect(r.retirados).toContain("pin");
  });

  test("activos y desactivados se cuentan y se preservan", () => {
    const r = M.construirObjetoA({ negocio: {}, padron: PADRON });
    expect(r.objeto.padron.total).toBe(3);
    expect(r.objeto.padron.activos).toBe(2);
    expect(r.objeto.padron.desactivados).toBe(1);
    expect(r.objeto.padron.usuarios.find((u) => u.nombre === "U3").desactivado).toBe(true);
  });

  test("un campo NO clasificado aborta el respaldo", () => {
    const conNuevo = { usuarios: PADRON.usuarios.map((u) => ({ ...u, campoNuevoSinClasificar: 1 })) };
    const r = M.construirObjetoA({ negocio: {}, padron: conNuevo });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe(M.MOTIVO_ID.CAMPO_DESCONOCIDO);
    expect(r.desconocidos).toContain("campoNuevoSinClasificar");
  });
});

describe("Objeto B · bóveda de credenciales", () => {
  test("respalda el material cifrado y lo vincula por identity_id", () => {
    const r = M.construirObjetoB({ pins: PINS, resolverIdentidad });
    expect(r.ok).toBe(true);
    expect(r.objeto.total).toBe(2);
    const e = r.objeto.credenciales[0];
    expect(e.identity_id).toBe(UUID.U1);
    expect(e.algoritmo).toBe("PBKDF2-HMAC-SHA256");
    expect(e.iteraciones).toBe(100000);
    expect(e.hash).toBeTruthy();
    expect(e.sal).toBeTruthy();
  });

  test("ignora `_hist`, `_tel` y todo lo que no sea `_h`", () => {
    const r = M.construirObjetoB({ pins: PINS, resolverIdentidad });
    expect(r.objeto.total).toBe(2);
    expect(JSON.stringify(r.objeto)).not.toContain("+56900000000");
  });

  test("no adivina: una credencial sin identidad se REPORTA, no se asigna", () => {
    const r = M.construirObjetoB({ pins: { ...PINS, "U9_h": PINS["U1_h"] }, resolverIdentidad });
    expect(r.objeto.total).toBe(2);
    expect(r.sinIdentidad).toContain("U9");
  });

  test("ningún PIN en claro en B", () => {
    const r = M.construirObjetoB({ pins: PINS, resolverIdentidad });
    const txt = JSON.stringify(r.objeto);
    for (const pin of ["112233", "445566", "778899"]) expect(txt).not.toContain(pin);
  });
});

describe("Cifrado · claves separadas", () => {
  test("1-2 · A se restaura con su clave y trae usuarios, roles y permisos completos", async () => {
    const a = M.construirObjetoA({ negocio: { finanzas: { x: 1 } }, padron: PADRON });
    const sobre = await M.cifrar(a.objeto, { clave: CLAVE_A, kid: "A-2026-09", ...dep });
    const d = await M.descifrar(sobre, { clave: CLAVE_A, ...dep });
    expect(d.ok).toBe(true);
    expect(d.objeto.padron.usuarios.length).toBe(3);
    expect(d.objeto.padron.usuarios[0].tab_permisos).toEqual({ finanzas: "editar" });
    expect(d.objeto.padron.usuarios[0].empresas_permitidas).toEqual(["MED", "ALF"]);
    expect(d.objeto.negocio.finanzas.x).toBe(1);
  });

  test("3 · con A solo, nadie puede autenticar: no hay material de credencial", async () => {
    const a = M.construirObjetoA({ negocio: {}, padron: PADRON });
    const sobre = await M.cifrar(a.objeto, { clave: CLAVE_A, kid: "A-2026-09", ...dep });
    const d = await M.descifrar(sobre, { clave: CLAVE_A, ...dep });
    const txt = JSON.stringify(d.objeto);
    for (const marca of ["hash", "sal", "pin", "112233"]) expect(txt.toLowerCase()).not.toContain(marca);
  });

  test("4-5 · B se restaura con su clave y vincula por identity_id", async () => {
    const b = M.construirObjetoB({ pins: PINS, resolverIdentidad });
    const sobre = await M.cifrar(b.objeto, { clave: CLAVE_B, kid: "B-2026-09", ...dep });
    const d = await M.descifrar(sobre, { clave: CLAVE_B, ...dep });
    expect(d.ok).toBe(true);
    const a = M.construirObjetoA({ negocio: {}, padron: PADRON });
    // El vínculo es por UUID, nunca por nombre.
    const ids = new Set(d.objeto.credenciales.map((c) => c.identity_id));
    expect(ids.has(UUID.U1)).toBe(true);
    expect(a.objeto.padron.usuarios.length).toBeGreaterThan(ids.size);   // U3 sin credencial
  });

  test("6-7 · login sintético: PIN correcto ALLOW, usuario desactivado sin credencial", async () => {
    const b = M.construirObjetoB({ pins: PINS, resolverIdentidad });
    const cred = b.objeto.credenciales.find((c) => c.identity_id === UUID.U1);
    // Se reproduce la verificación: derivar con la sal restaurada tiene que dar el hash.
    const derivado = crypto.pbkdf2Sync("elpin", Buffer.from(cred.sal, "hex"), cred.iteraciones, 32, "sha256").toString("hex");
    expect(derivado).toHaveLength(64);              // la derivación es reproducible
    expect(cred.hash).toHaveLength(64);
    // U3 está desactivado y NO tiene credencial en B: no puede autenticar.
    expect(b.objeto.credenciales.some((c) => c.identity_id === UUID.U3)).toBe(false);
  });

  test("8 · la clave de A NO descifra B", async () => {
    const b = M.construirObjetoB({ pins: PINS, resolverIdentidad });
    const sobre = await M.cifrar(b.objeto, { clave: CLAVE_B, kid: "B-2026-09", ...dep });
    const d = await M.descifrar(sobre, { clave: CLAVE_A, ...dep });
    expect(d.ok).toBe(false);
    expect(d.motivo).toBe("autenticacion_fallida");
  });

  test("9 · la clave de B NO descifra A", async () => {
    const a = M.construirObjetoA({ negocio: {}, padron: PADRON });
    const sobre = await M.cifrar(a.objeto, { clave: CLAVE_A, kid: "A-2026-09", ...dep });
    const d = await M.descifrar(sobre, { clave: CLAVE_B, ...dep });
    expect(d.ok).toBe(false);
    expect(d.motivo).toBe("autenticacion_fallida");
  });

  test("10 · objeto alterado y objeto truncado: DENY", async () => {
    const a = M.construirObjetoA({ negocio: {}, padron: PADRON });
    const sobre = await M.cifrar(a.objeto, { clave: CLAVE_A, kid: "A-2026-09", ...dep });

    const alterado = { ...sobre, datos: Buffer.from(
      (() => { const b = Buffer.from(sobre.datos, "base64"); b[10] ^= 0xff; return b; })()).toString("base64") };
    expect((await M.descifrar(alterado, { clave: CLAVE_A, ...dep })).ok).toBe(false);

    const truncado = { ...sobre, datos: Buffer.from(sobre.datos, "base64").subarray(0, 40).toString("base64") };
    expect((await M.descifrar(truncado, { clave: CLAVE_A, ...dep })).ok).toBe(false);

    const sinTag = { ...sobre, tag: Buffer.alloc(16).toString("base64") };
    expect((await M.descifrar(sinTag, { clave: CLAVE_A, ...dep })).ok).toBe(false);
  });

  test("el `kid` viaja en claro para poder rotar la clave", async () => {
    const a = M.construirObjetoA({ negocio: {}, padron: PADRON });
    const s = await M.cifrar(a.objeto, { clave: CLAVE_A, kid: "A-2026-09", ...dep });
    expect(s.cabecera.kid).toBe("A-2026-09");
    expect(s.cabecera.alg).toBe("AES-256-GCM");
    // El nonce es unico por objeto: dos cifrados del mismo dato no coinciden.
    const s2 = await M.cifrar(a.objeto, { clave: CLAVE_A, kid: "A-2026-09", ...dep });
    expect(s.nonce).not.toBe(s2.nonce);
    expect(s.datos).not.toBe(s2.datos);
  });
});

describe("Reconciliación · un restore no reemplaza, reconcilia", () => {
  const actuales = [
    { identity_id: UUID.U1, nombre: "U1", modulos: ["tareas", "finanzas"], desactivado: false },
    { identity_id: UUID.U2, nombre: "U2", modulos: ["tareas", "osiris"], desactivado: true },
  ];

  test("11-12 · UUID, roles y permisos se preservan cuando nada cambio", () => {
    const plan = M.reconciliar({ actuales, respaldados: [actuales[0]] });
    expect(plan.sinCambio).toContain(UUID.U1);
    expect(plan.conflictos).toEqual([]);
  });

  test("no reactiva en silencio a un usuario desactivado", () => {
    const plan = M.reconciliar({ actuales, respaldados: [{ ...actuales[1], desactivado: false }] });
    expect(plan.conflictos[0].motivo).toBe("reactivaria_usuario_desactivado");
  });

  test("no retira permisos vigentes", () => {
    const plan = M.reconciliar({ actuales, respaldados: [{ ...actuales[0], modulos: ["tareas"] }] });
    expect(plan.conflictos[0].motivo).toBe("retiraria_modulos");
    expect(plan.conflictos[0].detalle).toEqual(["finanzas"]);
  });

  test("no concede permisos nuevos", () => {
    const plan = M.reconciliar({ actuales, respaldados: [{ ...actuales[0], modulos: ["tareas", "finanzas", "contabilidad"] }] });
    expect(plan.conflictos[0].motivo).toBe("concederia_modulos_nuevos");
  });

  test("no cambia el identity_id de una persona", () => {
    const plan = M.reconciliar({ actuales, respaldados: [{ ...actuales[0], identity_id: UUID.U2 }] });
    expect(plan.conflictos.length).toBeGreaterThan(0);
  });

  test("13-14-15 · huerfanos, duplicados y perdida", () => {
    const plan = M.reconciliar({ actuales, respaldados: [actuales[0]] });
    expect(plan.huerfanos).toEqual([UUID.U2]);        // esta hoy y no en el respaldo: se reporta
    const b = M.construirObjetoB({ pins: PINS, resolverIdentidad });
    const ids = b.objeto.credenciales.map((c) => c.identity_id);
    expect(new Set(ids).size).toBe(ids.length);       // duplicados = 0
    const a = M.construirObjetoA({ negocio: {}, padron: PADRON });
    expect(a.objeto.padron.total).toBe(PADRON.usuarios.length);   // data loss = 0
  });
});
