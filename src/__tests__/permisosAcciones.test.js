/* eslint-disable */
// Permisos de ACCIONES (oct-2026): cada guarda se prueba permitida y denegada, y
// llamándola de forma directa con un estado que la pantalla no ofrecería.
import {
  nivelExplicito, topeConsulta, meTocaAprobar, puedeAprobarRendicion, puedeMarcarPagada,
  puedeDevolverAprobada, permisoTabAllegria, permisoParametros,
} from "../permisos/acciones";

const CAROL = { admin: false, esCFO: false, rendVerTodas: true, consulta: false, email: "cmachuca@x.cl", nombre: "Carol Machuca" };
const ANGELO = { admin: true, esCFO: true, rendVerTodas: true, consulta: false, email: "ahuerta@x.cl", nombre: "Angelo Huerta" };
const CONSULTA = { admin: false, esCFO: false, rendVerTodas: true, consulta: true, email: "c@x.cl", nombre: "Consulta" };
const TRABAJADOR = { admin: false, esCFO: false, rendVerTodas: false, consulta: false, email: "t@x.cl", nombre: "Trabajador" };
const r = (estado, extra = {}) => ({ id: "r1", folio: 7, estado, ...extra });

describe("nivel explícito y tope de consulta", () => {
  test("solo los tres niveles válidos cuentan como explícitos", () => {
    expect(nivelExplicito({ a: "ver" }, "a")).toBe("ver");
    expect(nivelExplicito({ a: "otro" }, "a")).toBeUndefined();
    expect(nivelExplicito({}, "a")).toBeUndefined();
  });
  test("consulta nunca supera ver; los demás roles no cambian", () => {
    expect(topeConsulta("consulta", "editar")).toBe("ver");
    expect(topeConsulta("consulta", "sin_acceso")).toBe("sin_acceso");
    expect(topeConsulta("editor", "editar")).toBe("editar");
    expect(topeConsulta("admin", "editar")).toBe("editar");
  });
});

describe("Rendiciones · marcar pagada (solo autorización explícita)", () => {
  test("permitido: admin o esCFO con la rendición aprobada", () => {
    expect(puedeMarcarPagada(ANGELO, r("aprobada"))).toBe(true);
    expect(puedeMarcarPagada({ ...TRABAJADOR, esCFO: true }, r("aprobada"))).toBe(true);
  });
  test("denegado: rendVerTodas NO autoriza a pagar (es un permiso de ver)", () => {
    expect(puedeMarcarPagada(CAROL, r("aprobada"))).toBe(false);
  });
  test("denegado: rol consulta, incluso con rendVerTodas", () => {
    expect(puedeMarcarPagada(CONSULTA, r("aprobada"))).toBe(false);
    expect(puedeMarcarPagada({ ...CONSULTA, esCFO: true }, r("aprobada"))).toBe(false);
  });
  test("denegado: trabajador sin autorización", () => {
    expect(puedeMarcarPagada(TRABAJADOR, r("aprobada"))).toBe(false);
  });
  test("intento directo: marcar pagada algo NO aprobado se rechaza, incluso al admin", () => {
    for (const e of ["borrador", "enviada", "rechazada", "pagada"]) expect(puedeMarcarPagada(ANGELO, r(e))).toBe(false);
    expect(puedeMarcarPagada(ANGELO, null)).toBe(false);
  });
});

describe("Rendiciones · aprobar / rechazar", () => {
  const conCadena = r("enviada", { cadena: [{ email: "cmachuca@x.cl" }, { email: "ahuerta@x.cl" }], nivelActual: 0 });
  test("permitido: el aprobador asignado del nivel actual", () => {
    expect(puedeAprobarRendicion(CAROL, conCadena)).toBe(true);
  });
  test("permitido: admin (override existente)", () => {
    expect(puedeAprobarRendicion(ANGELO, conCadena)).toBe(true);
  });
  test("denegado: aprobador de OTRO nivel", () => {
    expect(puedeAprobarRendicion(CAROL, { ...conCadena, nivelActual: 1 })).toBe(false);
  });
  test("denegado: consulta aunque esté asignado", () => {
    expect(puedeAprobarRendicion({ ...CONSULTA, email: "cmachuca@x.cl" }, conCadena)).toBe(false);
  });
  test("sin aprobador asignado: solo CFO/admin", () => {
    expect(puedeAprobarRendicion(CAROL, r("enviada"))).toBe(false);
    expect(puedeAprobarRendicion({ ...TRABAJADOR, esCFO: true }, r("enviada"))).toBe(true);
  });
  test("intento directo: aprobar algo que no está enviado se rechaza", () => {
    for (const e of ["borrador", "aprobada", "rechazada", "pagada"]) expect(puedeAprobarRendicion(ANGELO, r(e))).toBe(false);
  });
  test("meTocaAprobar conserva la regla anterior (comparación sin mayúsculas)", () => {
    expect(meTocaAprobar({ cadena: [{ email: "CMachuca@X.cl" }] }, "cmachuca@x.cl", false, false)).toBe(true);
  });
});

describe("Rendiciones · devolver una aprobada", () => {
  test("permitido: quien la aprobó o un admin", () => {
    expect(puedeDevolverAprobada(CAROL, r("aprobada", { revisadoPor: "Carol Machuca" }))).toBe(true);
    expect(puedeDevolverAprobada(ANGELO, r("aprobada", { revisadoPor: "Otro" }))).toBe(true);
  });
  test("denegado: otro aprobador, consulta, o una que no está aprobada", () => {
    expect(puedeDevolverAprobada(CAROL, r("aprobada", { revisadoPor: "Otro" }))).toBe(false);
    expect(puedeDevolverAprobada({ ...CONSULTA, nombre: "Carol Machuca" }, r("aprobada", { revisadoPor: "Carol Machuca" }))).toBe(false);
    expect(puedeDevolverAprobada(ANGELO, r("pagada"))).toBe(false);
  });
});

describe("Allegria · pestañas configuradas", () => {
  test("sin configuración: igual que antes (manda el permiso de módulo)", () => {
    expect(permisoTabAllegria(true, {}, "clientes")).toEqual({ ver: true, editar: true });
    expect(permisoTabAllegria(false, {}, "clientes")).toEqual({ ver: true, editar: false });
  });
  test("ver explícito: puede ver, no editar", () => {
    expect(permisoTabAllegria(true, { anticipos: "ver" }, "anticipos")).toEqual({ ver: true, editar: false });
  });
  test("sin_acceso explícito: ni ver ni editar", () => {
    expect(permisoTabAllegria(true, { liquidaciones: "sin_acceso" }, "liq_productor")).toEqual({ ver: false, editar: false });
  });
  test("editar explícito NO concede si el módulo no lo permite (consulta)", () => {
    expect(permisoTabAllegria(false, { cobranza: "editar" }, "cobranza")).toEqual({ ver: true, editar: false });
  });
  test("vistas no configurables no se restringen", () => {
    expect(permisoTabAllegria(true, { clientes: "sin_acceso" }, "programa")).toEqual({ ver: true, editar: true });
  });
});

describe("Finanzas · Parámetros", () => {
  test("admin siempre", () => {
    expect(permisoParametros({ esAdmin: true, nivelFlujo: "sin_acceso", nivelParams: "sin_acceso" })).toEqual({ ver: true, editar: true });
  });
  test("igual que antes cuando params = editar: manda flujo", () => {
    expect(permisoParametros({ esAdmin: false, nivelFlujo: "editar", nivelParams: "editar" })).toEqual({ ver: true, editar: true });
    expect(permisoParametros({ esAdmin: false, nivelFlujo: "ver", nivelParams: "editar" })).toEqual({ ver: true, editar: false });
  });
  test("params = ver explícito: no edita aunque edite el flujo", () => {
    expect(permisoParametros({ esAdmin: false, nivelFlujo: "editar", nivelParams: "ver" })).toEqual({ ver: true, editar: false });
  });
  test("params = sin_acceso explícito: no se muestra", () => {
    expect(permisoParametros({ esAdmin: false, nivelFlujo: "editar", nivelParams: "sin_acceso" })).toEqual({ ver: false, editar: false });
  });
});
