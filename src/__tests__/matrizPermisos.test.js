/* eslint-disable */
// Matriz de permisos confirmada 08-10-2026: núcleo de pestañas (registro, pestañas nuevas,
// consulta con excepción explícita) y aplicador de la matriz (identidad por correo).
// Datos FICTICIOS: los correos de las personas sin correo en el código son inventados.
import { getTabPerm, nivelInicialPestana, tabRegistrada } from "../permisos/permisosCore.js";
import { MATRIZ, planMatriz, aplicarPlan, resolverPersona, normNombre } from "../permisos/matrizConfirmada.js";

const ADMIN = { nombre: "Angelo Huerta", rol: "admin" };
const EDITOR = { nombre: "Carol Machuca", rol: "editor" };
const LUCIA = { nombre: "Lucía Corbetto", rol: "consulta",
  tab_permisos: { finanzas: { flujo: "editar", params: "sin_acceso", nominas: "ver" } } };

describe("pestañas registradas: se conserva el acceso actual", () => {
  test("admin edita toda pestaña existente aunque no esté configurada", () => {
    expect(getTabPerm(ADMIN, "finanzas", "flujo")).toBe("editar");
    expect(getTabPerm(ADMIN, "frisku", "bi")).toBe("editar");
    expect(getTabPerm(ADMIN, "tareas", "config")).toBe("editar");
  });
  test("editor sin configurar: editar, como antes (salvo Configuración de Tareas)", () => {
    expect(getTabPerm(EDITOR, "finanzas", "nominas")).toBe("editar");
    expect(getTabPerm(EDITOR, "frisku", "liquidaciones")).toBe("editar");
    expect(getTabPerm(EDITOR, "tareas", "config")).toBe("sin_acceso");
  });
  test("lo configurado manda para editor", () => {
    const u = { ...EDITOR, tab_permisos: { frisku: { liquidaciones: "sin_acceso" }, tareas: { config: "editar" } } };
    expect(getTabPerm(u, "frisku", "liquidaciones")).toBe("sin_acceso");
    expect(getTabPerm(u, "tareas", "config")).toBe("editar");
  });
});

describe("pestañas nuevas: sin acceso para todos, incluido admin", () => {
  test("una pestaña no registrada nace sin acceso", () => {
    expect(tabRegistrada("finanzas", "tesoreria_nueva")).toBe(false);
    expect(getTabPerm(ADMIN, "finanzas", "tesoreria_nueva")).toBe("sin_acceso");
    expect(getTabPerm(EDITOR, "frisku", "nueva")).toBe("sin_acceso");
    expect(getTabPerm(LUCIA, "allegria", "nueva")).toBe("sin_acceso");
  });
  test("hasta que se le asigna un permiso explícito", () => {
    const u = { ...ADMIN, tab_permisos: { finanzas: { tesoreria_nueva: "ver" } } };
    expect(getTabPerm(u, "finanzas", "tesoreria_nueva")).toBe("ver");
  });
  test("al materializar en el merge, una pestaña nueva queda sin_acceso", () => {
    expect(nivelInicialPestana(ADMIN, "finanzas", "tesoreria_nueva", "editar")).toBe("sin_acceso");
    expect(nivelInicialPestana(EDITOR, "finanzas", "nominas", "editar")).toBe("editar");
  });
});

describe("perfil consulta: lo configurado se respeta, lo no configurado queda en ver", () => {
  test("Lucía: excepción explícita en Flujo, Parámetros sin acceso", () => {
    expect(getTabPerm(LUCIA, "finanzas", "flujo")).toBe("editar");
    expect(getTabPerm(LUCIA, "finanzas", "params")).toBe("sin_acceso");
  });
  test("la excepción no concede otras facultades", () => {
    expect(getTabPerm(LUCIA, "finanzas", "nominas")).toBe("ver");
    expect(getTabPerm(LUCIA, "finanzas", "bancos")).toBe("ver");     // no configurada
    expect(getTabPerm(LUCIA, "frisku", "liquidaciones")).toBe("ver");
    expect(LUCIA.rendPagar).toBeUndefined();
    expect(LUCIA.contabEditar).toBeUndefined();
  });
  test("al materializar, consulta queda en ver salvo un sin_acceso legado", () => {
    expect(nivelInicialPestana(LUCIA, "finanzas", "bancos", "editar")).toBe("ver");
    expect(nivelInicialPestana(LUCIA, "finanzas", "bancos", "sin_acceso")).toBe("sin_acceso");
  });
});

// Usuarios ficticios con los nombres del archivo autorizado.
const usuarios = () => [
  { nombre: "Angelo Huerta", email: "ahuerta@grupomediterra.cl", rol: "admin", esCFO: true },
  { nombre: "Carol Machuca", email: "cmachuca@grupomediterra.cl", rol: "editor", rendVerTodas: true,
    tab_permisos: { finanzas: { nominas: "editar" }, tareas: { config: "editar" } } },
  { nombre: "Milagros Becerra", email: "Mbecerra@grupomediterra.cl", rol: "editor", rendVerTodas: true,
    tab_permisos: { finanzas: { nominas: "editar" }, tareas: { config: "editar" } } },
  { nombre: "Michelle Garcia", email: "mgarcia@grupomediterra.cl", rol: "editor", rendVerTodas: true,
    tab_permisos: { tareas: { config: "editar" }, frisku: { liquidaciones: "ver" } } },
  { nombre: "Pablo Duran", email: "pduran@grupomediterra.cl", rol: "editor", rendVerTodas: true,
    tab_permisos: { tareas: { config: "editar" } } },
  { nombre: "Lucía Corbetto", email: "lucia@ficticio.cl", rol: "consulta",
    tab_permisos: { finanzas: { flujo: "editar", params: "sin_acceso" } } },
  { nombre: "Raimundo Valenzuela", email: "raimundo@ficticio.cl", rol: "editor",
    tab_permisos: { frisku: { clientes: "editar" } } },
  { nombre: "Carolina Lara", email: "carolina@ficticio.cl", rol: "editor" },
  { nombre: "Denise Piaget", email: "denise@ficticio.cl", rol: "editor" },
  { nombre: "José Tomás Silva", email: "jts@ficticio.cl", rol: "editor" },
  { nombre: "Jose Tomas Reyes Guevara", email: "jtr@ficticio.cl", rol: "editor", desactivado: true },
];

describe("aplicador de la matriz", () => {
  test("plan: 10 cambios, 12 ya cumplen, 0 sin identificar", () => {
    const p = planMatriz(usuarios());
    expect(p.errores).toEqual([]);
    expect(p.cambios.length).toBe(10);
    expect(p.cumple.length).toBe(12);
    expect(p.cambios.map(c => `${c.nombre}:${c.que}=${c.despues}`).sort()).toEqual([
      "Angelo Huerta:contabEditar=true", "Angelo Huerta:rendPagar=true",
      "Carol Machuca:rendPagar=true", "Carolina Lara:frisku.liquidaciones=editar",
      "Denise Piaget:frisku.liquidaciones=sin_acceso", "José Tomás Silva:frisku.liquidaciones=sin_acceso",
      "Michelle Garcia:contabEditar=true", "Milagros Becerra:rendPagar=true",
      "Pablo Duran:contabEditar=true", "Raimundo Valenzuela:frisku.liquidaciones=editar",
    ]);
  });
  test("aplicar: cambia solo lo del plan, conserva lo demás y es idempotente", () => {
    const us = usuarios();
    const nuevos = aplicarPlan(us, planMatriz(us));
    const de = (n) => nuevos.find(u => u.nombre === n);
    expect(de("Carol Machuca").rendPagar).toBe(true);
    expect(de("Carol Machuca").tab_permisos.finanzas.nominas).toBe("editar");
    expect(de("Michelle Garcia").rendPagar).toBeUndefined();          // ve todas, no paga
    expect(de("Michelle Garcia").tab_permisos.frisku.liquidaciones).toBe("ver"); // conserva
    expect(de("Raimundo Valenzuela").tab_permisos.frisku).toEqual({ clientes: "editar", liquidaciones: "editar" });
    expect(de("Denise Piaget").tab_permisos.frisku).toEqual({ liquidaciones: "sin_acceso" });
    expect(de("Jose Tomas Reyes Guevara")).toEqual(us.find(u => u.nombre === "Jose Tomas Reyes Guevara"));
    expect(de("Lucía Corbetto")).toEqual(us.find(u => u.nombre === "Lucía Corbetto"));
    const otra = planMatriz(nuevos);
    expect(otra.cambios).toEqual([]);
    expect(otra.cumple.length).toBe(22);
  });
  test("identidad: correo conocido con otro nombre → no se aplica", () => {
    const us = usuarios().map(u => u.nombre === "Pablo Duran" ? { ...u, nombre: "Otra Persona" } : u);
    const p = planMatriz(us);
    expect(p.errores.some(e => e.nombre === "Pablo Duran" && /corresponde a "Otra Persona"/.test(e.motivo))).toBe(true);
  });
  test("identidad: nombre repetido o sin correo → no se aplica", () => {
    const rep = [...usuarios(), { nombre: "Carolina  LARA", email: "otra@x.cl", rol: "editor" }];
    expect(resolverPersona(rep, { nombre: "Carolina Lara" }).error).toMatch(/repetido/);
    const sinCorreo = usuarios().map(u => u.nombre === "Denise Piaget" ? { ...u, email: "" } : u);
    expect(resolverPersona(sinCorreo, { nombre: "Denise Piaget" }).error).toMatch(/sin correo|no tiene correo/);
  });
  test("identidad: nombre completo, nunca prefijo (José Tomás Silva ≠ Jose Tomas Reyes Guevara)", () => {
    const us = usuarios().filter(u => u.nombre !== "José Tomás Silva").map(u => ({ ...u, desactivado: false }));
    expect(resolverPersona(us, { nombre: "José Tomás Silva" }).error).toMatch(/no hay usuario/);
    expect(normNombre("José  Tomás SILVA")).toBe("jose tomas silva");
  });
  test("la matriz no lleva datos sensibles", () => {
    const txt = JSON.stringify(MATRIZ);
    expect(txt).not.toMatch(/pin|hash|token|salt/i);
  });
});
