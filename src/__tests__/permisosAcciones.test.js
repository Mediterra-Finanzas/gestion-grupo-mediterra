/* eslint-disable */
// Permisos de ACCIONES (oct-2026): cada guarda se prueba permitida y denegada, y
// llamándola de forma directa con un estado que la pantalla no ofrecería.
// Matriz confirmada 08-10-2026: pagar exige la facultad explícita `rendPagar` (ni admin
// ni CFO la tienen por defecto) y el aprobador ASIGNADO aprueba aunque su perfil sea consulta.
import {
  nivelExplicito, meTocaAprobar, puedeAprobarRendicion, puedeMarcarPagada,
  puedeDevolverAprobada, permisoTabAllegria, permisoParametros,
} from "../permisos/acciones";

const CAROL = { admin: false, esCFO: false, rendVerTodas: true, consulta: false, email: "cmachuca@x.cl", nombre: "Carol Machuca" };
const ANGELO = { admin: true, esCFO: true, rendVerTodas: true, consulta: false, email: "ahuerta@x.cl", nombre: "Angelo Huerta" };
const CONSULTA = { admin: false, esCFO: false, rendVerTodas: true, consulta: true, email: "c@x.cl", nombre: "Consulta" };
const TRABAJADOR = { admin: false, esCFO: false, rendVerTodas: false, consulta: false, email: "t@x.cl", nombre: "Trabajador" };
const r = (estado, extra = {}) => ({ id: "r1", folio: 7, estado, ...extra });

describe("nivel explícito", () => {
  test("solo los tres niveles válidos cuentan como explícitos", () => {
    expect(nivelExplicito({ a: "ver" }, "a")).toBe("ver");
    expect(nivelExplicito({ a: "otro" }, "a")).toBeUndefined();
    expect(nivelExplicito({}, "a")).toBeUndefined();
  });
});

// Modo "matriz": solo la facultad. Modo "transicion": la regla publicada (ve todas).
const M = (u) => ({ ...u, _facultadesOk: true, _modoPermisos: "matriz" });
const T = (u) => ({ ...u, _facultadesOk: true, _modoPermisos: "transicion" });

describe("Rendiciones · marcar pagada · modo matriz (facultad rendPagar)", () => {
  test("permitido: Carol, Milagros y Angelo con la facultad, sobre una aprobada", () => {
    expect(puedeMarcarPagada(M({ ...CAROL, rendPagar: true }), r("aprobada"))).toBe(true);
    expect(puedeMarcarPagada(M({ ...TRABAJADOR, nombre: "Milagros Becerra", rendPagar: true }), r("aprobada"))).toBe(true);
    expect(puedeMarcarPagada(M({ ...ANGELO, rendPagar: true }), r("aprobada"))).toBe(true);
  });
  test("denegado: admin y CFO SIN la facultad (admin no es autorización general)", () => {
    expect(puedeMarcarPagada(M(ANGELO), r("aprobada"))).toBe(false);
    expect(puedeMarcarPagada(M({ ...TRABAJADOR, esCFO: true }), r("aprobada"))).toBe(false);
  });
  test("denegado: rendVerTodas NO autoriza a pagar (Michelle, Pablo)", () => {
    expect(puedeMarcarPagada(M(CAROL), r("aprobada"))).toBe(false);
  });
  test("denegado: la facultad tiene que ser exactamente true", () => {
    expect(puedeMarcarPagada(M({ ...CAROL, rendPagar: "true" }), r("aprobada"))).toBe(false);
    expect(puedeMarcarPagada(M({ ...CAROL, rendPagar: 1 }), r("aprobada"))).toBe(false);
  });
  test("intento directo: marcar pagada algo NO aprobado se rechaza, incluso con la facultad", () => {
    const pagador = M({ ...ANGELO, rendPagar: true });
    for (const e of ["borrador", "enviada", "rechazada", "pagada"]) expect(puedeMarcarPagada(pagador, r(e))).toBe(false);
    expect(puedeMarcarPagada(pagador, null)).toBe(false);
  });
});

describe("Rendiciones · marcar pagada · modo transición (regla publicada)", () => {
  test("pagan quienes ven todas (admin, CFO, rendVerTodas), como hoy en producción", () => {
    expect(puedeMarcarPagada(T(ANGELO), r("aprobada"))).toBe(true);
    expect(puedeMarcarPagada(T(CAROL), r("aprobada"))).toBe(true);
  });
  test("no amplía: un trabajador sin ver todas no paga aunque tenga la facultad", () => {
    expect(puedeMarcarPagada(T({ ...TRABAJADOR, rendPagar: true }), r("aprobada"))).toBe(false);
    expect(puedeMarcarPagada(T(TRABAJADOR), r("aprobada"))).toBe(false);
  });
  test("solo aprobadas", () => {
    expect(puedeMarcarPagada(T(ANGELO), r("enviada"))).toBe(false);
  });
});

describe("Rendiciones · marcar pagada · configuración sin leer (falla cerrada)", () => {
  test("si la fila de facultades no se pudo leer, nadie paga", () => {
    expect(puedeMarcarPagada({ ...ANGELO, rendPagar: true }, r("aprobada"))).toBe(false);
    expect(puedeMarcarPagada({ ...ANGELO, rendPagar: true, _facultadesOk: false, _modoPermisos: null }, r("aprobada"))).toBe(false);
    expect(puedeMarcarPagada({ ...ANGELO, _facultadesOk: true, _modoPermisos: "otro" }, r("aprobada"))).toBe(false);
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
  test("permitido: perfil consulta con aprobación ASIGNADA (caso Lucía)", () => {
    expect(puedeAprobarRendicion({ ...CONSULTA, email: "cmachuca@x.cl" }, conCadena)).toBe(true);
  });
  test("denegado: consulta NO asignada", () => {
    expect(puedeAprobarRendicion(CONSULTA, conCadena)).toBe(false);
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
  test("denegado: otro aprobador, consulta que no la aprobó, o una que no está aprobada", () => {
    expect(puedeDevolverAprobada(CAROL, r("aprobada", { revisadoPor: "Otro" }))).toBe(false);
    expect(puedeDevolverAprobada(CONSULTA, r("aprobada", { revisadoPor: "Carol Machuca" }))).toBe(false);
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
