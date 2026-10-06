/* eslint-disable */
import {
  crearClienteServidor, ErrorServidor, diffMain, fusionarMain, sanearUsuarios,
  mensajeErrorLogin, crearGuardadorMain, crearSincroUsuarios,
} from "../authServidor";
import { crearPersistencia } from "../persistencia/persistContract";

function respuesta(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe("cliente servidor", () => {
  test("envía JSON con credentials same-origin y devuelve datos", async () => {
    const llamadas = [];
    const c = crearClienteServidor({ fetch: async (url, init) => { llamadas.push([url, init]); return respuesta(200, { ok: true, debeCambiarPin: false, usuario: { nombre: "A" } }); } });
    const r = await c.login("a@b.cl", "123456");
    expect(r.usuario.nombre).toBe("A");
    expect(llamadas[0][0]).toBe("/api/auth/login");
    expect(llamadas[0][1].method).toBe("POST");
    expect(llamadas[0][1].credentials).toBe("same-origin");
    expect(JSON.parse(llamadas[0][1].body)).toEqual({ email: "a@b.cl", pin: "123456" });
  });
  test("errores tipados y mensajes", async () => {
    const c = crearClienteServidor({ fetch: async () => respuesta(429, { error: "bloqueado" }) });
    await expect(c.login("a@b.cl", "1")).rejects.toMatchObject({ codigo: "bloqueado", status: 429 });
    const sinRed = crearClienteServidor({ fetch: async () => { throw new TypeError("Failed to fetch"); } });
    let err; try { await sinRed.login("a@b.cl", "1"); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(ErrorServidor);
    expect(err.codigo).toBe("sin_conexion");
    expect(mensajeErrorLogin(err)).toMatch(/conectar/);
    expect(mensajeErrorLogin({ codigo: "credenciales" })).toBe("Correo o PIN incorrecto.");
    expect(mensajeErrorLogin({ codigo: "desactivado" })).toMatch(/no está activa/);
  });
  test("sesion devuelve null con 401", async () => {
    const c = crearClienteServidor({ fetch: async () => respuesta(401, { error: "sin_sesion" }) });
    expect(await c.sesion()).toBeNull();
  });
});

describe("diff y fusión de main", () => {
  test("diffMain solo claves cambiadas y nunca usuarios/pins", () => {
    const base = { estados: { a: 1 }, comentarios: {}, mes: 1 };
    const local = { estados: { a: 2 }, comentarios: {}, mes: 1, usuarios: [1], pinsPersonalizados: { x: 1 } };
    expect(diffMain(base, local)).toEqual({ estados: { a: 2 } });
  });
  test("fusiona sub-claves distintas y marca conflicto en la misma", () => {
    const base = { estados: { a: "g", b: "g" }, comentarios: { x: "1" } };
    const local = { estados: { a: "v", b: "g" }, comentarios: { x: "2" } };
    const serv = { estados: { a: "g", b: "r" }, comentarios: { x: "3" } };
    const f = fusionarMain(base, local, serv);
    expect(f.valor.estados).toEqual({ a: "v", b: "r" });
    expect(f.valor.comentarios).toEqual({ x: "3" }); // gana el servidor en conflicto
    expect(f.conflictos).toEqual(["comentarios.x"]);
  });
  test("sanearUsuarios quita credenciales", () => {
    expect(sanearUsuarios([{ nombre: "A", pin: "1234", _h: "x", rol: "admin" }])).toEqual([{ nombre: "A", rol: "admin" }]);
  });
});

describe("guardador de main", () => {
  function persistFalso() { return crearPersistencia({ fetch: async () => { throw new Error("no debe usarse"); }, logger: { info() {}, warn() {}, error() {} } }); }
  test("PATCH con versión y claves cambiadas; 409 → fusiona y reintenta", async () => {
    const persist = persistFalso();
    persist.registrarCarga("main", { estados: { a: "g", b: "g" } }, "v1", "object");
    const patches = [];
    let aplicado = null;
    const cliente = {
      patchMain: async (patch, version) => {
        patches.push({ patch, version });
        if (version === "v1") throw new ErrorServidor("conflicto", 409, { version: "v2" });
        return { version: "v3" };
      },
      leerMain: async () => ({ valor: { estados: { a: "g", b: "r" } }, version: "v2" }),
    };
    const g = crearGuardadorMain({ cliente, persist, alFusionar: (v) => { aplicado = v; } });
    const r = await g.guardar({ estados: { a: "v", b: "g" }, usuarios: undefined });
    expect(r.ok).toBe(true);
    expect(r.conflictos).toEqual([]);
    expect(patches[0]).toEqual({ patch: { estados: { a: "v", b: "g" } }, version: "v1" });
    expect(patches[1]).toEqual({ patch: { estados: { a: "v", b: "r" } }, version: "v2" });
    expect(aplicado.estados).toEqual({ a: "v", b: "r" });
    expect(persist.estado("main").version).toBe("v3");
    expect(persist.isDirty("main")).toBe(false);
  });
  test("sin cambios no llama al servidor; 403 de config reintenta sin config", async () => {
    const persist = persistFalso();
    persist.registrarCarga("main", { estados: {}, tareasConfig: {} }, "v1", "object");
    const patches = [];
    const cliente = { patchMain: async (patch, version) => {
      patches.push(patch);
      if (patch.tareasConfig) throw new ErrorServidor("sin_permiso", 403, {});
      return { version: "v2" };
    } };
    const g = crearGuardadorMain({ cliente, persist });
    expect((await g.guardar({ estados: {}, tareasConfig: {} })).sinCambios).toBe(true);
    const r = await g.guardar({ estados: { a: 1 }, tareasConfig: { t: 1 } });
    expect(r.ok).toBe(true);
    expect(r.sinPermisoConfig).toBe(true);
    expect(patches[1]).toEqual({ estados: { a: 1 } });
  });
});

describe("sincro de usuarios", () => {
  test("PUT solo si cambió, sin credenciales, y 409 = conflicto", async () => {
    const puts = [];
    let falla = false;
    const cliente = { guardarUsuarios: async (valor, version) => {
      puts.push({ valor, version });
      if (falla) throw new ErrorServidor("conflicto", 409, {});
      return { version: "u2" };
    } };
    const s = crearSincroUsuarios({ cliente });
    s.registrar([{ nombre: "A", rol: "admin" }], "u1");
    expect((await s.guardar([{ nombre: "A", rol: "admin", pin: "" }])).sinCambios).toBe(true);
    const r = await s.guardar([{ nombre: "A", rol: "admin" }, { nombre: "B", pin: "" }]);
    expect(r.ok).toBe(true);
    expect(puts[0]).toEqual({ valor: [{ nombre: "A", rol: "admin" }, { nombre: "B" }], version: "u1" });
    falla = true;
    const r2 = await s.guardar([{ nombre: "A", rol: "editor" }, { nombre: "B" }]);
    expect(r2).toMatchObject({ ok: false, motivo: "conflicto" });
  });
});
