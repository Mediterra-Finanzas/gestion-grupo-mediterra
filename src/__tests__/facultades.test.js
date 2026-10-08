/* eslint-disable */
// Facultades en fila propia + modo de la regla de pago (transición coordinada y reversible).
import { filaVacia, normalizarFila, facultadesDe, enriquecerUsuario, conFacultad, puedeActivarMatriz,
  cambiarModo, pagadoresActivos, cargarFacultades, guardarFacultades, FILA_FACULTADES } from "../permisos/facultades.js";
import { puedeMarcarPagada } from "../permisos/acciones";

const ANG = { nombre: "Angelo Huerta", email: "ahuerta@grupomediterra.cl", rol: "admin", esCFO: true };
const CAROL = { nombre: "Carol Machuca", email: "CMachuca@grupomediterra.cl", rol: "editor", rendVerTodas: true };
const MICHELLE = { nombre: "Michelle Garcia", email: "mgarcia@grupomediterra.cl", rol: "editor", rendVerTodas: true };
const USUARIOS = [ANG, CAROL, MICHELLE];
const aprobada = { id: "r", estado: "aprobada" };

test("fila nueva: modo transición, sin facultades", () => {
  const f = filaVacia();
  expect(f.modo).toBe("transicion");
  expect(facultadesDe(CAROL, f)).toEqual({ rendPagar: false, contabEditar: false, remPreparar: false, remAprobar: false });
});
test("identidad por correo normalizado; sin correo no hay facultad", () => {
  const f = conFacultad(filaVacia(), "cmachuca@GRUPOMEDITERRA.cl", "rendPagar", true, ANG);
  expect(facultadesDe(CAROL, f).rendPagar).toBe(true);
  expect(facultadesDe({ nombre: "Carol Machuca" }, f).rendPagar).toBe(false);
  expect(() => conFacultad(f, "", "rendPagar", true, ANG)).toThrow(/correo/);
  expect(() => conFacultad(f, "x@y.cl", "otra", true, ANG)).toThrow(/desconocida/);
});
test("lo que diga la ficha se ignora: la fila es la única fuente", () => {
  const u = enriquecerUsuario({ ...MICHELLE, rendPagar: true, contabEditar: true }, filaVacia(), true);
  expect(u.rendPagar).toBe(false);
  expect(u.contabEditar).toBe(false);
});
test("fila sin leer → sin facultades y sin modo (falla cerrada)", () => {
  const f = conFacultad(filaVacia(), ANG.email, "rendPagar", true, ANG);
  const u = enriquecerUsuario(ANG, f, false);
  expect(u.rendPagar).toBe(false);
  expect(u._facultadesOk).toBe(false);
  expect(puedeMarcarPagada(u, aprobada)).toBe(false);
});
test("normalizar descarta valores no booleanos y claves vacías", () => {
  const f = normalizarFila({ modo: "raro", porCorreo: { "": { rendPagar: true }, "A@B.cl": { rendPagar: "true", remAprobar: true } } });
  expect(f.modo).toBe("transicion");
  expect(f.porCorreo).toEqual({ "a@b.cl": { remAprobar: true } });
});

describe("transición sin periodo sin pagos", () => {
  test("paso 1 (desplegado, fila vacía): pagan los mismos que hoy en producción", () => {
    const f = filaVacia();
    const en = (u) => enriquecerUsuario(u, f, true);
    expect(puedeMarcarPagada(en(ANG), aprobada)).toBe(true);
    expect(puedeMarcarPagada(en(CAROL), aprobada)).toBe(true);
    expect(puedeMarcarPagada(en(MICHELLE), aprobada)).toBe(true);
  });
  test("paso 2 (matriz aplicada, regla aún en transición): siguen pagando los mismos", () => {
    let f = conFacultad(filaVacia(), CAROL.email, "rendPagar", true, ANG);
    f = conFacultad(f, ANG.email, "rendPagar", true, ANG);
    expect(puedeMarcarPagada(enriquecerUsuario(MICHELLE, f, true), aprobada)).toBe(true);
  });
  test("no se puede activar la matriz si nadie activo tiene la facultad de pagar", () => {
    expect(puedeActivarMatriz(filaVacia(), USUARIOS).ok).toBe(false);
    expect(() => cambiarModo(filaVacia(), "matriz", ANG, "", USUARIOS)).toThrow(/nadie|Ninguna/);
    const soloInactivo = conFacultad(filaVacia(), CAROL.email, "rendPagar", true, ANG);
    expect(puedeActivarMatriz(soloInactivo, [{ ...CAROL, desactivado: true }]).ok).toBe(false);
  });
  test("paso 3 (activar): pagan solo quienes tienen la facultad", () => {
    let f = conFacultad(filaVacia(), CAROL.email, "rendPagar", true, ANG);
    f = cambiarModo(f, "matriz", ANG, "", USUARIOS);
    expect(f.modo).toBe("matriz");
    expect(pagadoresActivos(f, USUARIOS).map(u => u.nombre)).toEqual(["Carol Machuca"]);
    expect(puedeMarcarPagada(enriquecerUsuario(CAROL, f, true), aprobada)).toBe(true);
    expect(puedeMarcarPagada(enriquecerUsuario(MICHELLE, f, true), aprobada)).toBe(false);
    expect(puedeMarcarPagada(enriquecerUsuario(ANG, f, true), aprobada)).toBe(false);
  });
  test("reversa: volver a transición exige motivo y queda en el historial", () => {
    let f = cambiarModo(conFacultad(filaVacia(), CAROL.email, "rendPagar", true, ANG), "matriz", ANG, "", USUARIOS);
    expect(() => cambiarModo(f, "transicion", ANG, "  ", USUARIOS)).toThrow(/motivo/);
    f = cambiarModo(f, "transicion", ANG, "rollback de código", USUARIOS);
    expect(f.modo).toBe("transicion");
    expect(f.historial.map(h => h.accion)).toEqual(["facultad", "modo", "modo"]);
    expect(f.historial[2]).toMatchObject({ desde: "matriz", hacia: "transicion", motivo: "rollback de código", usuario: "Angelo Huerta" });
    expect(puedeMarcarPagada(enriquecerUsuario(MICHELLE, f, true), aprobada)).toBe(true);
  });
});

describe("persistencia por el contrato (Regla 9)", () => {
  test("una carga que falla se propaga (no devuelve una fila vacía)", async () => {
    const persist = { load: jest.fn(async () => { throw new Error("red"); }) };
    await expect(cargarFacultades(persist)).rejects.toThrow("red");
  });
  test("fila inexistente → fila vacía; existente → normalizada", async () => {
    expect((await cargarFacultades({ load: async () => ({ existe: false }) })).modo).toBe("transicion");
    const f = await cargarFacultades({ load: async () => ({ existe: true, value: { modo: "matriz", porCorreo: { "a@b.cl": { rendPagar: true } } } }) });
    expect(f.modo).toBe("matriz");
  });
  test("guardar usa saveConfirmed sobre la fila propia", async () => {
    const persist = { saveConfirmed: jest.fn(async () => ({ ok: true })) };
    await guardarFacultades(persist, filaVacia());
    expect(persist.saveConfirmed).toHaveBeenCalledWith(FILA_FACULTADES, expect.objectContaining({ modo: "transicion" }), {});
  });
});
