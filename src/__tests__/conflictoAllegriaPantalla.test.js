/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// AllegriaModule MONTADO de verdad (React), con el transporte reemplazado por un
// PostgREST en memoria: `global.fetch` se sustituye durante la prueba, así que
// ninguna petición sale del proceso ni toca Supabase.
//
// Secuencia: el módulo carga la fila `allegria` en v0; otra sesión la escribe
// (v1); el auto-guardado del módulo choca (PATCH condicionado a v0 → 0 filas) y
// la fila queda BLOQUEADA. Lo que se verifica es lo que la persona ve: el panel
// con las DOS salidas, y que al elegir "recuperar la versión del servidor" la
// pantalla pasa a mostrar los datos del servidor y el panel se va.
//
// Es la prueba de que el cableado está puesto en el módulo real (no solo en el
// glue): usa el `persist` compartido, el aplicador del módulo y su auto-save.
// ═══════════════════════════════════════════════════════════════════════════════
import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import AllegriaModule from "../AllegriaModule.jsx";
import { persist } from "../persistencia/instancia.js";

const BOTON_SERVIDOR = "Recuperar la versión del servidor (descarta mi cambio)";
const BOTON_LOCAL = "Conservar mi versión (reemplaza la del servidor)";

const PROPS = {
  usuarioActual: { nombre: "Angelo Huerta", rol: "admin" },
  esAdmin: () => true,
  esSoloConsulta: () => false,
  tabPermisos: {},
  onBack: () => {},
  onLogout: () => {},
};

// Fila v0: 1 cliente. Lo que otra sesión deja en v1: 3 clientes.
const V0 = { clientes: [{ id: "c1", nombre: "Disney" }], productores: [], embarques: [] };
const V1 = { clientes: [{ id: "c1", nombre: "Disney" }, { id: "c2" }, { id: "c3" }], productores: [], embarques: [] };

function servidorFalso() {
  const filas = { allegria: { value: JSON.stringify(V0), updated_at: "v0" } };
  const peticiones = [];
  let seq = 2;
  let getsAllegria = 0;
  const resp = (body, status = 200) => ({
    ok: status >= 200 && status < 300, status,
    json: async () => body, text: async () => JSON.stringify(body),
  });
  const fetchImpl = async (url, opts = {}) => {
    const metodo = (opts.method || "GET").toUpperCase();
    const u = new URL(String(url));
    const id = decodeURIComponent((/id=eq\.([^&]+)/.exec(u.search) || [])[1] || "");
    peticiones.push({ metodo, id, host: u.host });
    if (metodo === "GET") {
      const f = filas[id];
      const salida = resp(f ? [{ value: f.value, updated_at: f.updated_at }] : []);
      // Justo después de la carga del módulo, OTRA sesión escribe la fila.
      if (id === "allegria" && ++getsAllegria === 1) {
        filas.allegria = { value: JSON.stringify(V1), updated_at: "v1" };
      }
      return salida;
    }
    const body = JSON.parse(opts.body || "{}");
    if (metodo === "PATCH") {
      const ver = decodeURIComponent((/updated_at=eq\.([^&]+)/.exec(u.search) || [])[1] || "");
      if (!filas[id] || filas[id].updated_at !== ver) return resp([]);  // conflicto
      filas[id] = { value: body.value, updated_at: `v${seq++}` };
      return resp([{ id, value: filas[id].value, updated_at: filas[id].updated_at }]);
    }
    if (metodo === "POST") {
      filas[body.id] = { value: body.value, updated_at: `v${seq++}` };
      return resp([{ id: body.id, value: filas[body.id].value, updated_at: filas[body.id].updated_at }], 201);
    }
    throw new Error("método no soportado: " + metodo);
  };
  const leer = (id) => {
    const v = filas[id] && filas[id].value;
    return v === undefined ? undefined : (typeof v === "string" ? JSON.parse(v) : v);
  };
  return { filas, fetchImpl, peticiones, leer };
}

describe("AllegriaModule: el conflicto se puede resolver desde la pantalla", () => {
  let srv, fetchOriginal;
  beforeEach(() => {
    srv = servidorFalso();
    fetchOriginal = global.fetch;
    global.fetch = jest.fn(srv.fetchImpl);
    persist.reset();                       // sesión limpia por prueba
    window._lastSavedAllegria = undefined;
  });
  afterEach(() => {
    global.fetch = fetchOriginal;
    persist.reset();
  });

  // Reloj REAL: el debounce del auto-save del módulo es de 2s y se espera de
  // verdad. Con temporizadores falsos la cola de promesas del contrato no
  // alcanzaba a drenar (el PATCH quedaba en vuelo), así que la prueba miraba un
  // estado intermedio en vez del resultado.
  const microtareas = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
  const esperar = async (ms) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };

  test("el auto-guardado choca, aparece el panel con las dos salidas y recuperar trae el servidor", async () => {
    render(<AllegriaModule {...PROPS} />);
    await microtareas();                                  // carga de la fila

    // Cargó la v0: un cliente.
    expect(screen.getByText("1 clientes")).toBeInTheDocument();
    // Sin conflicto todavía: el panel NO está.
    expect(screen.queryByRole("button", { name: BOTON_SERVIDOR })).toBeNull();
    expect(screen.queryByRole("button", { name: BOTON_LOCAL })).toBeNull();

    // El auto-guardado (debounce 2s) escribe condicionado a v0, pero el servidor
    // ya está en v1 → conflicto → la fila queda bloqueada.
    await esperar(2300);
    await waitFor(() => expect(persist.conflictoPendiente("allegria")).toBeTruthy(), { timeout: 4000 });

    // Lo que ve la persona: las dos salidas, con su texto.
    expect(await screen.findByRole("button", { name: BOTON_SERVIDOR })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: BOTON_LOCAL })).toBeInTheDocument();
    expect(screen.getByText(/otra sesión modificó Allegria Foods/)).toBeInTheDocument();
    expect(screen.getByText("⚠️ No se guardó: otra sesión cambió los datos")).toBeInTheDocument();
    // El servidor conserva lo de la otra sesión (3 clientes), y la pantalla sigue
    // con lo suyo: nada se pisó en ninguno de los dos lados.
    expect(srv.leer("allegria").clientes).toHaveLength(3);
    expect(screen.getByText("1 clientes")).toBeInTheDocument();

    // Salida (a): recuperar la versión del servidor.
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: BOTON_SERVIDOR })); });
    await microtareas();
    await waitFor(() => expect(screen.getByText("3 clientes")).toBeInTheDocument());
    expect(persist.conflictoPendiente("allegria")).toBeNull();
    expect(screen.queryByRole("button", { name: BOTON_SERVIDOR })).toBeNull();
  }, 20000);

  test("sin conflicto el panel no aparece nunca (guardado normal)", async () => {
    // Esta vez nadie más escribe: el PATCH condicionado pasa.
    srv.filas.allegria = { value: JSON.stringify(V0), updated_at: "v0" };
    const sinInterferencia = servidorFalso();
    sinInterferencia.filas.allegria = { value: JSON.stringify(V0), updated_at: "v0" };
    // Se anula la escritura ajena: el primer GET ya no mueve la fila.
    global.fetch = jest.fn(async (url, opts = {}) => {
      const metodo = (opts.method || "GET").toUpperCase();
      const u = new URL(String(url));
      const id = decodeURIComponent((/id=eq\.([^&]+)/.exec(u.search) || [])[1] || "");
      if (metodo === "GET") {
        const f = sinInterferencia.filas[id];
        return { ok: true, status: 200, json: async () => (f ? [{ value: f.value, updated_at: f.updated_at }] : []), text: async () => "[]" };
      }
      return sinInterferencia.fetchImpl(url, opts);
    });

    render(<AllegriaModule {...PROPS} />);
    await microtareas();
    expect(screen.getByText("1 clientes")).toBeInTheDocument();
    await esperar(2300);
    await microtareas();
    expect(persist.conflictoPendiente("allegria")).toBeNull();
    expect(screen.queryByRole("button", { name: BOTON_SERVIDOR })).toBeNull();
    expect(screen.queryByRole("button", { name: BOTON_LOCAL })).toBeNull();
    expect(screen.queryByText(/otra sesión modificó/)).toBeNull();
  }, 20000);
});
