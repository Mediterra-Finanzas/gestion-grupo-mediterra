/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// Las migraciones legítimas de App.jsx SIGUEN escribiéndose.
//
// El objetivo del cambio era dar salida al conflicto, NO reducir escrituras. Lo
// que no se puede romper:
//   · el merge de usuarios con WORKERS_BASE y `garantizarAccesoRendiciones`
//     (que le da el módulo de rendiciones a todo el personal) tiene que llegar a
//     la fila `usuarios`;
//   · el guardia "sin cambios efectivos" NO puede tragarse esa migración: la
//     carga de `usuarios` se registra SIN el 5º argumento `valorServidor`
//     (App.jsx:2222 → permisosUsuariosStore.registrarCarga), así que el servidor
//     queda DESCONOCIDO y el guardia no actúa (persistContract.js:321-333);
//   · la fila `usuarios` NO entra nunca en conflicto pendiente, porque se guarda
//     con `computeNext` como FUNCIÓN (merge de 3 vías): ante un choque el
//     contrato recomputa contra la versión fresca y reintenta.
//
// ALCANCE: `garantizarAccesoRendiciones` está DUPLICADO — App.jsx:568 (dentro del
// componente, no exportable) y src/permisos/permisosCore.js:24, que es la copia
// fiel y la que se ejerce acá. La construcción de la lista (`construirUsuarios`,
// App.jsx:2130 y ss.) tampoco se exporta, así que el merge con WORKERS_BASE se
// reproduce en su forma esencial. `fetch` inyectado: nada sale del proceso.
// ═══════════════════════════════════════════════════════════════════════════════
import { crearPersistencia } from "../persistencia/persistContract.js";
import { crearUsuariosStore } from "../permisos/permisosUsuariosStore.js";
import { garantizarAccesoRendiciones } from "../permisos/permisosCore.js";

const URL_FALSA = "https://falso.test";
const silencio = { info() {}, warn() {}, error() {} };

function servidorFalso(filasIniciales = {}) {
  const filas = {};
  for (const id of Object.keys(filasIniciales)) filas[id] = { ...filasIniciales[id] };
  const peticiones = [];
  let seq = 1;
  const resp = (body, status = 200) => ({
    ok: status >= 200 && status < 300, status,
    json: async () => body, text: async () => JSON.stringify(body),
  });
  const fetchImpl = async (url, o = {}) => {
    const metodo = (o.method || "GET").toUpperCase();
    const u = new URL(String(url));
    const id = decodeURIComponent((/id=eq\.([^&]+)/.exec(u.search) || [])[1] || "");
    peticiones.push({ metodo, id, host: u.host });
    if (metodo === "GET") {
      const f = filas[id];
      return resp(f ? [{ value: f.value, updated_at: f.updated_at }] : []);
    }
    const body = JSON.parse(o.body || "{}");
    if (metodo === "PATCH") {
      const ver = decodeURIComponent((/updated_at=eq\.([^&]+)/.exec(u.search) || [])[1] || "");
      if (!filas[id] || filas[id].updated_at !== ver) return resp([]);
      filas[id] = { value: body.value, updated_at: `v${seq++}` };
      return resp([{ id, value: filas[id].value, updated_at: filas[id].updated_at }]);
    }
    if (metodo === "POST") {
      filas[body.id] = { value: body.value, updated_at: `v${seq++}` };
      return resp([{ id: body.id, value: filas[body.id].value, updated_at: filas[body.id].updated_at }], 201);
    }
    throw new Error("método no soportado: " + metodo);
  };
  const cuenta = (m) => peticiones.filter((p) => p.metodo === m).length;
  const escrituras = () => peticiones.filter((p) => p.metodo !== "GET").length;
  const leer = (id) => {
    const v = filas[id] && filas[id].value;
    return v === undefined ? undefined : (typeof v === "string" ? JSON.parse(v) : v);
  };
  return { filas, fetchImpl, peticiones, cuenta, escrituras, leer };
}

const sesion = (srv) => crearPersistencia({ fetch: srv.fetchImpl, supaUrl: URL_FALSA, supaKey: "k", logger: silencio });

// Seis personas, como el piso de WORKERS_BASE. Ninguna tiene `finanzas`: son
// exactamente las que la migración tiene que provisionar.
const SIN_RENDICIONES = [
  { nombre: "Angelo Huerta", email: "a@m.cl", rol: "admin", modulos: ["tareas", "finanzas"], tab_permisos: { finanzas: { flujo: "editar" } } },
  { nombre: "Carol", email: "c@m.cl", rol: "editor", modulos: ["tareas"] },
  { nombre: "Michelle", email: "mi@m.cl", rol: "editor", modulos: ["tareas"] },
  { nombre: "Pablo", email: "p@m.cl", rol: "editor", modulos: ["tareas"] },
  { nombre: "Nicolás", email: "n@m.cl", rol: "editor", modulos: ["osiris"] },
  { nombre: "Vania", email: "v@m.cl", rol: "editor", modulos: ["tareas"] },
];
const migrar = (lista) => lista.map(garantizarAccesoRendiciones);

describe("la migración de acceso a Rendiciones llega a la fila `usuarios`", () => {
  test("el merge se escribe aunque el guardia 'sin cambios' esté activo en otras filas", async () => {
    const srv = servidorFalso({ usuarios: { value: JSON.stringify(SIN_RENDICIONES), updated_at: "v0" } });
    const persist = sesion(srv);
    const store = crearUsuariosStore(persist, { id: "usuarios" });

    // Lo que hace App.jsx al cargar: lee la fila, construye la lista mergeada y la
    // registra SIN `valorServidor` (3 argumentos).
    const fila = await persist._leerFila("usuarios");
    const mergeado = migrar(fila.valor);
    store.registrarCarga(mergeado, fila.updatedAt, false);
    expect(persist.estado("usuarios").servidorConocido).toBe(false); // guardia apagado

    const r = await store.guardar(mergeado);
    expect(r.ok).toBe(true);
    expect(srv.cuenta("PATCH")).toBe(1);                   // la migración SÍ se escribió

    // Resultado calculado aparte: las 5 personas sin `finanzas` quedan con el
    // módulo, todas las pestañas financieras en sin_acceso y rendiciones en "ver".
    const enServidor = srv.leer("usuarios");
    const nuevas = enServidor.filter((u) => u.nombre !== "Angelo Huerta");
    expect(nuevas).toHaveLength(5);
    nuevas.forEach((u) => {
      expect(u.modulos).toContain("finanzas");
      expect(u.tab_permisos.finanzas.rendiciones).toBe("ver");
      ["dashboard", "flujo", "bancos", "creditos", "nominas", "params", "reporte", "auditoria", "eeff"]
        .forEach((t) => expect(u.tab_permisos.finanzas[t]).toBe("sin_acceso"));
    });
    // A quien YA tenía Finanzas no se le toca nada (la función es aditiva).
    const angelo = enServidor.find((u) => u.nombre === "Angelo Huerta");
    expect(angelo.tab_permisos.finanzas).toEqual({ flujo: "editar" });
    expect(angelo.modulos).toEqual(["tareas", "finanzas"]);
  });

  test("repetirla no escribe de nuevo (es idempotente y el guardia ya conoce el servidor)", async () => {
    const srv = servidorFalso({ usuarios: { value: JSON.stringify(SIN_RENDICIONES), updated_at: "v0" } });
    const persist = sesion(srv);
    const store = crearUsuariosStore(persist, { id: "usuarios" });
    const fila = await persist._leerFila("usuarios");
    const mergeado = migrar(fila.valor);
    store.registrarCarga(mergeado, fila.updatedAt, false);
    await store.guardar(mergeado);
    const patchTrasMigracion = srv.cuenta("PATCH");

    const otraVez = migrar(srv.leer("usuarios"));
    expect(otraVez).toEqual(srv.leer("usuarios"));          // idempotente
    const r2 = await store.guardar(otraVez);
    expect(r2.ok).toBe(true);
    expect(srv.cuenta("PATCH")).toBe(patchTrasMigracion);   // no se reescribe por gusto
  });

  test("si la fila `usuarios` todavía no existe, la siembra se crea igual", async () => {
    const srv = servidorFalso({});                          // fila inexistente
    const persist = sesion(srv);
    const store = crearUsuariosStore(persist, { id: "usuarios" });
    const fila = await persist._leerFila("usuarios");
    expect(fila.existe).toBe(false);
    const mergeado = migrar(SIN_RENDICIONES);               // viene de main.usuarios
    store.registrarCarga(mergeado, fila.updatedAt, false);
    const r = await store.guardar(mergeado);
    expect(r.ok).toBe(true);
    expect(srv.cuenta("POST")).toBe(1);
    expect(srv.leer("usuarios").filter((u) => (u.modulos || []).includes("finanzas"))).toHaveLength(6);
  });

  test("la fila `usuarios` NO queda bloqueada por un conflicto: recomputa y confirma", async () => {
    const srv = servidorFalso({ usuarios: { value: JSON.stringify(SIN_RENDICIONES), updated_at: "v0" } });
    const p1 = sesion(srv), p2 = sesion(srv);
    const s1 = crearUsuariosStore(p1, { id: "usuarios" });
    const s2 = crearUsuariosStore(p2, { id: "usuarios" });
    const f1 = await p1._leerFila("usuarios");
    const f2 = await p2._leerFila("usuarios");
    s1.registrarCarga(migrar(f1.valor), f1.updatedAt, false);
    s2.registrarCarga(migrar(f2.valor), f2.updatedAt, false);

    // La sesión 1 sube a Carol a aprobadora de rendiciones.
    const deS1 = migrar(f1.valor).map((u) => u.nombre !== "Carol" ? u
      : { ...u, tab_permisos: { ...u.tab_permisos, finanzas: { ...u.tab_permisos.finanzas, rendiciones: "editar" } } });
    expect((await s1.guardar(deS1)).ok).toBe(true);

    // La sesión 2 desactiva a Vania sobre su copia vieja: hay choque de versión,
    // pero NO de campo → el contrato recomputa contra lo fresco y confirma.
    const deS2 = migrar(f2.valor).map((u) => u.nombre !== "Vania" ? u : { ...u, desactivado: true });
    const r = await s2.guardar(deS2);
    expect(r.ok).toBe(true);
    expect(p2.conflictoPendiente("usuarios")).toBeNull();   // nunca se bloquea

    // Los dos cambios quedaron: nadie pisó a nadie.
    const final = srv.leer("usuarios");
    expect(final.find((u) => u.nombre === "Carol").tab_permisos.finanzas.rendiciones).toBe("editar");
    expect(final.find((u) => u.nombre === "Vania").desactivado).toBe(true);
    // Y el acceso a rendiciones del resto sigue puesto.
    expect(final.filter((u) => (u.tab_permisos && u.tab_permisos.finanzas || {}).rendiciones)).toHaveLength(5);
  });
});
