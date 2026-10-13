/* eslint-disable */
// ══════════════════════════════════════════════════════════════════════════════
// "CONSERVAR MI VERSIÓN" EN FILAS FINANCIERAS Y EN LOS PIN
//
// Esas filas se escriben REEMPLAZANDO la fila completa: no hay fusión por ítem.
// Así que "conservar la mía" no conserva solo lo que yo edité, sino todo el
// contenido de la fila tal como está en MI pantalla, y lo que la otra sesión
// cambió ahí se reemplaza aunque haya tocado algo distinto. Presentarlo como
// "se combinan los cambios" sería falso, y lo que se pierde son montos y
// credenciales de otras personas.
//
// Se comprueba: la advertencia aparece y nombra qué se reemplaza; no se
// presenta como fusión; al confirmar se revalida la versión vigente; y si la
// otra sesión guardó otra vez en el medio, NO se reemplaza nada y el bloqueo
// queda puesto de nuevo.
// ══════════════════════════════════════════════════════════════════════════════
import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import PanelConflictoFila, { reemplazaFilaCompleta } from "../PanelConflictoFila.jsx";
import { crearPersistencia, MOTIVOS } from "../persistencia/persistContract.js";
import { crearResolucionConflicto } from "../persistencia/conflictoFila.js";

const URL_FALSA = "https://falso.test";
const silencio = { info() {}, warn() {}, error() {} };

function servidorFalso(filasIniciales = {}) {
  const filas = { ...filasIniciales };
  const peticiones = [];
  let seq = 1;
  const estado = { ganchoPrePatch: null };
  const resp = (body, status = 200) => ({
    ok: status >= 200 && status < 300, status,
    json: async () => body, text: async () => JSON.stringify(body),
  });
  const fetchImpl = async (url, opts = {}) => {
    const metodo = (opts.method || "GET").toUpperCase();
    const u = new URL(String(url));
    const id = decodeURIComponent((/id=eq\.([^&]+)/.exec(u.search) || [])[1] || "");
    peticiones.push({ metodo, id });
    if (metodo === "GET") {
      const f = filas[id];
      return resp(f ? [{ value: f.value, updated_at: f.updated_at }] : []);
    }
    const body = JSON.parse(opts.body || "{}");
    if (metodo === "PATCH") {
      if (estado.ganchoPrePatch) { const g = estado.ganchoPrePatch; estado.ganchoPrePatch = null; g(filas, () => `v${seq++}`); }
      const ver = decodeURIComponent((/updated_at=eq\.([^&]+)/.exec(u.search) || [])[1] || "");
      if (!filas[id] || filas[id].updated_at !== ver) return resp([]);
      filas[id] = { value: body.value, updated_at: `v${seq++}` };
      return resp([{ id, value: filas[id].value, updated_at: filas[id].updated_at }]);
    }
    if (metodo === "POST") {
      filas[body.id] = { value: body.value, updated_at: `v${seq++}` };
      return resp([{ id: body.id, value: filas[body.id].value, updated_at: filas[body.id].updated_at }], 201);
    }
    throw new Error("método " + metodo);
  };
  const leer = (id) => { const v = filas[id] && filas[id].value; return v === undefined ? undefined : (typeof v === "string" ? JSON.parse(v) : v); };
  const escrituras = () => peticiones.filter(p => p.metodo !== "GET").length;
  return { filas, fetchImpl, leer, escrituras, estado };
}

describe("qué filas se reemplazan completas", () => {
  test.each([["pins"], ["main"], ["finanzas"], ["finanzas_bancos"], ["finanzas_esc_abc"], ["allegria"], ["eeff"], ["nominas"]])(
    "%s se reemplaza completa", (id) => { expect(reemplazaFilaCompleta(id)).toBe(true); });

  test.each([["rendiciones"], ["maestro_tc"], ["frisku_clientes"], [""], [null], [undefined]])(
    "%s no entra en la advertencia", (id) => { expect(reemplazaFilaCompleta(id)).toBe(false); });
});

describe("la advertencia en pantalla", () => {
  const pintar = (rowId, etiqueta) => render(
    <PanelConflictoFila conflicto={{ rowId, etiqueta }} onRecuperar={() => {}} onConservar={() => {}} />);

  test("en los PIN dice que se reemplazan los de todas las personas", () => {
    pintar("pins", "los PIN");
    expect(screen.getByText(/NO combina los dos trabajos/i)).toBeInTheDocument();
    expect(screen.getByText(/los PIN de todas las personas/)).toBeInTheDocument();
  });

  test("en el flujo de caja dice que se reemplaza el de las ocho empresas", () => {
    pintar("finanzas", "el Flujo de Caja");
    expect(screen.getByText(/todo el flujo de caja de las ocho empresas/)).toBeInTheDocument();
  });

  test("en los saldos de bancos nombra todas las cuentas", () => {
    pintar("finanzas_bancos", "los Saldos de Bancos");
    expect(screen.getByText(/los saldos de todas las cuentas/)).toBeInTheDocument();
  });

  test("avisa que lo de la otra sesión se reemplaza aunque haya tocado algo distinto", () => {
    pintar("finanzas", "el Flujo de Caja");
    expect(screen.getByText(/aunque haya tocado algo distinto de lo que tocaste tú/)).toBeInTheDocument();
  });

  test("y que antes de escribir se vuelve a leer la versión vigente", () => {
    pintar("finanzas", "el Flujo de Caja");
    expect(screen.getByText(/se vuelve a leer la versión vigente/)).toBeInTheDocument();
    expect(screen.getByText(/el conflicto queda puesto de nuevo/)).toBeInTheDocument();
  });

  test("NUNCA se presenta como una fusión de cambios", () => {
    pintar("finanzas", "el Flujo de Caja");
    const cuerpo = document.body.textContent;
    expect(cuerpo).not.toMatch(/se combinaron/i);
    expect(cuerpo).not.toMatch(/se fusion/i);
    expect(cuerpo).toMatch(/No se combinan las dos versiones de forma automática/);
  });

  test("en una fila fusionable por ítem la advertencia no aparece", () => {
    pintar("rendiciones", "las Rendiciones");
    expect(screen.queryByText(/NO combina los dos trabajos/i)).toBeNull();
  });
});

describe("al confirmar se revalida la versión vigente", () => {
  // Estado local y servidor distintos, con la fila ya en conflicto.
  function escenario() {
    const srv = servidorFalso({ finanzas: { value: JSON.stringify({ saldo: 1 }), updated_at: "v0" } });
    const persist = crearPersistencia({ fetch: srv.fetchImpl, supaUrl: URL_FALSA, supaKey: "k", logger: silencio });
    let local = { saldo: 999 };          // lo que hay en MI pantalla
    let aplicado = null, conflicto = null, estados = [];
    const res = crearResolucionConflicto({
      persist, rowId: "finanzas", etiqueta: "el Flujo de Caja",
      aplicarValor: (v) => { aplicado = v; },
      guardarLocal: () => persist.saveConfirmed("finanzas", local, {}),
      setConflicto: (c) => { conflicto = c; },
      setEstado: (e) => { estados.push(e); },
      setAviso: () => {},
    });
    return { srv, persist, res, local, get conflicto() { return conflicto; },
      get aplicado() { return aplicado; }, estados };
  }

  test("si nadie más escribió, conservar lo local reemplaza la fila y confirma", async () => {
    const e = escenario();
    await e.persist.load("finanzas");
    // Otra sesión escribe → el guardado local choca y queda el bloqueo.
    const otra = crearPersistencia({ fetch: e.srv.fetchImpl, supaUrl: URL_FALSA, supaKey: "k", logger: silencio });
    await otra.load("finanzas");
    await otra.saveConfirmed("finanzas", { saldo: 7 }, {});
    const r1 = await e.persist.saveConfirmed("finanzas", { saldo: 999 }, {});
    expect(r1.ok).toBe(false);
    expect(e.res.detectar(r1)).toBe(true);
    expect(e.persist.conflictoPendiente("finanzas")).toBeTruthy();

    const r2 = await e.res.conservarLocal();
    expect(r2.ok).toBe(true);
    expect(e.srv.leer("finanzas")).toEqual({ saldo: 999 });   // la fila COMPLETA es la local
    expect(e.persist.conflictoPendiente("finanzas")).toBeFalsy();
  });

  test("si la otra sesión guardó OTRA VEZ en el medio, no se reemplaza nada y el bloqueo vuelve", async () => {
    const e = escenario();
    await e.persist.load("finanzas");
    const otra = crearPersistencia({ fetch: e.srv.fetchImpl, supaUrl: URL_FALSA, supaKey: "k", logger: silencio });
    await otra.load("finanzas");
    await otra.saveConfirmed("finanzas", { saldo: 7 }, {});
    const r1 = await e.persist.saveConfirmed("finanzas", { saldo: 999 }, {});
    e.res.detectar(r1);

    // Justo antes del PATCH de la reconciliación, la otra sesión vuelve a escribir.
    e.srv.estado.ganchoPrePatch = (filas, nuevaVersion) => {
      filas.finanzas = { value: JSON.stringify({ saldo: 8 }), updated_at: nuevaVersion() };
    };
    const r2 = await e.res.conservarLocal();
    expect(r2 && r2.ok).toBe(false);
    // El servidor conserva lo de la otra sesión: NO se reemplazó con lo local.
    expect(e.srv.leer("finanzas")).toEqual({ saldo: 8 });
    // Y el bloqueo quedó puesto de nuevo: hay que volver a decidir.
    expect(e.persist.conflictoPendiente("finanzas")).toBeTruthy();
    expect(e.conflicto).toBeTruthy();
  });

  test("recuperar del servidor descarta lo local y entrega el valor vigente", async () => {
    const e = escenario();
    await e.persist.load("finanzas");
    const otra = crearPersistencia({ fetch: e.srv.fetchImpl, supaUrl: URL_FALSA, supaKey: "k", logger: silencio });
    await otra.load("finanzas");
    await otra.saveConfirmed("finanzas", { saldo: 7 }, {});
    const r1 = await e.persist.saveConfirmed("finanzas", { saldo: 999 }, {});
    e.res.detectar(r1);

    const r2 = await e.res.recuperarDelServidor();
    expect(r2.ok).toBe(true);
    expect(e.aplicado).toEqual({ saldo: 7 });                 // la pantalla queda con lo del servidor
    expect(e.srv.leer("finanzas")).toEqual({ saldo: 7 });      // y no se escribió nada
    expect(e.persist.conflictoPendiente("finanzas")).toBeFalsy();
  });
});
