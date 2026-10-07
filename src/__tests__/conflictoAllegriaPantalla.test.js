/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// AllegriaModule MONTADO de verdad (React), con el transporte reemplazado por un
// PostgREST en memoria.
//
// IMPORTANTE — por qué `require` y no `import`: la instancia compartida del
// contrato (src/persistencia/instancia.js) hace `crearPersistencia()` al
// IMPORTARSE, y la fábrica CAPTURA la referencia de `fetch` en ese momento.
// Reemplazar `global.fetch` después del import deja al contrato escribiendo con
// el fetch verdadero (se vio: el PATCH salía a la URL real de Supabase y moría
// con error de red). Así que `global.fetch` se sustituye ANTES de requerir el
// módulo y la instancia. Todo el tráfico — carga y escritura — queda dentro del
// proceso, y al final se comprueba que cada petición la atendió el falso.
//
// Secuencia: el módulo carga la fila `allegria` en v0; otra sesión la escribe
// (v1); el auto-guardado choca (PATCH condicionado a v0 → 0 filas) y la fila
// queda BLOQUEADA. Se verifica lo que la persona ve: el panel con las DOS
// salidas, y que al recuperar del servidor la pantalla pasa a los datos del
// servidor y el panel se va.
// ═══════════════════════════════════════════════════════════════════════════════
import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

// Fila v0: 1 cliente. Lo que otra sesión deja en v1: 3 clientes.
const V0 = { clientes: [{ id: "c1", nombre: "Disney" }], productores: [], embarques: [] };
const V1 = { clientes: [{ id: "c1", nombre: "Disney" }, { id: "c2" }, { id: "c3" }], productores: [], embarques: [] };

function servidorFalso(opts = {}) {
  const filas = { allegria: { value: JSON.stringify(V0), updated_at: "v0" } };
  const peticiones = [];
  let seq = 2;
  let getsAllegria = 0;
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
      const salida = resp(f ? [{ value: f.value, updated_at: f.updated_at }] : []);
      // Justo después de la carga del módulo, OTRA sesión escribe la fila.
      if (!opts.sinInterferencia && id === "allegria" && ++getsAllegria === 1) {
        filas.allegria = { value: JSON.stringify(V1), updated_at: "v1" };
      }
      return salida;
    }
    const body = JSON.parse(o.body || "{}");
    if (metodo === "PATCH") {
      const ver = decodeURIComponent((/updated_at=eq\.([^&]+)/.exec(u.search) || [])[1] || "");
      if (!filas[id] || filas[id].updated_at !== ver) return resp([]);  // 0 filas = conflicto
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

// ── El transporte se cambia ANTES de cargar la app (ver cabecera) ──────────────
let srv = servidorFalso();
const atendidas = [];
const fetchOriginal = global.fetch;
global.fetch = (...a) => { atendidas.push(String(a[0])); return srv.fetchImpl(...a); };

const AllegriaModule = require("../AllegriaModule.jsx").default;
const { persist } = require("../persistencia/instancia.js");

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

describe("AllegriaModule: el conflicto se puede resolver desde la pantalla", () => {
  beforeEach(() => {
    srv = servidorFalso();
    persist.reset();
    window._lastSavedAllegria = undefined;
  });
  afterAll(() => { global.fetch = fetchOriginal; persist.reset(); });

  // Reloj REAL: el debounce del auto-save del módulo es de 2s y se espera de
  // verdad (con temporizadores falsos la cola de promesas del contrato no
  // drenaba y la prueba miraba un estado intermedio).
  const microtareas = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
  const esperar = async (ms) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };

  test("el auto-guardado choca, aparece el panel con las dos salidas, y recuperar trae el servidor", async () => {
    render(<AllegriaModule {...PROPS} />);
    await microtareas();                                   // carga de la fila

    expect(screen.getByText("1 clientes")).toBeInTheDocument();   // cargó la v0
    expect(screen.queryByRole("button", { name: BOTON_SERVIDOR })).toBeNull();
    expect(screen.queryByRole("button", { name: BOTON_LOCAL })).toBeNull();

    await esperar(2300);                                   // debounce del auto-save
    await waitFor(() => expect(persist.conflictoPendiente("allegria")).toBeTruthy(), { timeout: 4000 });

    // Lo que ve la persona: las dos salidas con su texto.
    expect(await screen.findByRole("button", { name: BOTON_SERVIDOR })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: BOTON_LOCAL })).toBeInTheDocument();
    expect(screen.getByText(/otra sesión modificó Allegria Foods/)).toBeInTheDocument();
    expect(screen.getByText("⚠️ No se guardó: otra sesión cambió los datos")).toBeInTheDocument();
    // Nada se pisó: el servidor tiene lo de la otra sesión (3) y la pantalla lo suyo (1).
    expect(srv.leer("allegria").clientes).toHaveLength(3);
    expect(screen.getByText("1 clientes")).toBeInTheDocument();

    // Salida (a): recuperar la versión del servidor.
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: BOTON_SERVIDOR })); });
    await microtareas();
    await waitFor(() => expect(screen.getByText("3 clientes")).toBeInTheDocument(), { timeout: 4000 });
    expect(persist.conflictoPendiente("allegria")).toBeNull();
    expect(screen.queryByRole("button", { name: BOTON_SERVIDOR })).toBeNull();

    // Ninguna petición salió del proceso: todas las atendió el servidor falso.
    expect(atendidas.length).toBe(srv.peticiones.length);
  }, 30000);

  test("sin conflicto el panel no aparece (guardado normal)", async () => {
    srv = servidorFalso({ sinInterferencia: true });
    render(<AllegriaModule {...PROPS} />);
    await microtareas();
    expect(screen.getByText("1 clientes")).toBeInTheDocument();
    await esperar(2300);
    await microtareas();
    expect(persist.conflictoPendiente("allegria")).toBeNull();
    expect(screen.queryByRole("button", { name: BOTON_SERVIDOR })).toBeNull();
    expect(screen.queryByRole("button", { name: BOTON_LOCAL })).toBeNull();
    expect(screen.queryByText(/otra sesión modificó/)).toBeNull();
    // El guardado normal SÍ ocurrió y quedó confirmado.
    expect(srv.peticiones.filter((p) => p.metodo === "PATCH").length).toBe(1);
    expect(persist.estado("allegria").sucio).toBe(false);
  }, 30000);
});
