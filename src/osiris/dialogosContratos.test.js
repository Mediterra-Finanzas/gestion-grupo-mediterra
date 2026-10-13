/* eslint-disable */
// Los tres diálogos de Contratos que pasaron de window.prompt al diálogo de la app (oct-2026):
// retiro de un anexo con respaldo, baja de una plantación y retiro del registro de reajuste.
// Cada uno: aceptar aplica lo mismo que antes, cancelar no escribe nada, y si el contrato
// cambió mientras se respondía (otra sesión, un guardado) no se aplica y se avisa.
import React from "react";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { ControlContratos } from "../OsirisModule";
import { DialogosHost } from "../diseno/dialogos.jsx";
import { ACTIVACION } from "./fixturesReajuste";

const USUARIO = { nombre: "Prueba Dialogo", email: "dialogo@invalid" };
const BASE = (extra) => Object.assign({ id: "ct_dlg", razonSocial: "DIALOGO (prueba)", pais: "Chile" }, extra || {});

function montar(contrato) {
  const escrituras = [];
  let datos = [contrato];
  const props = () => ({
    data: datos, setData: (f) => { escrituras.push(typeof f === "function" ? f(datos) : f); },
    clientes: [], setClientes: () => {}, viverosData: [], setViveros: () => {}, can: true, usuarioActual: USUARIO,
    tiposAnexoPersist: [], setTiposAnexoPersist: () => {}, tiposContratoPersist: [], setTiposContratoPersist: () => {},
  });
  const u = render(<><DialogosHost/><ControlContratos {...props()}/></>);
  fireEvent.click(screen.getByText(/Ver/));
  return {
    escrituras,
    // Simula que el contrato cambió en otra sesión mientras el diálogo está abierto.
    cambiarDesdeOtraSesion: (cambios) => { datos = [{ ...datos[0], ...cambios }]; u.rerender(<><DialogosHost/><ControlContratos {...props()}/></>); },
  };
}
const dialogo = () => screen.getByTestId("dialogo-app");
async function responder(texto) {
  fireEvent.change(within(dialogo()).getByRole("textbox"), { target: { value: texto } });
  await act(async () => { fireEvent.click(within(dialogo()).getByTestId("dialogo-aceptar")); });
}
async function cancelar() { await act(async () => { fireEvent.click(within(dialogo()).getByText("Cancelar")); }); }
async function clic(el) { await act(async () => { fireEvent.click(el); }); }
const sinNativos = () => {
  const orig = { prompt: window.prompt, confirm: window.confirm };
  const nativos = [];
  window.prompt = (x) => { nativos.push("prompt"); return null; };
  window.confirm = (x) => { nativos.push("confirm:" + String(x).slice(0, 40)); return true; };
  return { nativos, restaurar: () => Object.assign(window, orig) };
};

// ── 1. Retiro de un anexo con documento ──
describe("retiro de un anexo con documento o plantaciones", () => {
  const CT = () => BASE({ anexosExtra: [{ id: "ax1", activo: true, link: "https://doc.invalid/anexo.pdf" }] });
  const abrir = async () => {
    const m = montar(CT());
    fireEvent.click(screen.getAllByText(/📄 Contrato/)[0]);
    await clic(screen.getByTitle(/^Eliminar Anexo/));
    return m;
  };
  test("abre el diálogo de la app (no window.prompt) con el aviso de que no se elimina", async () => {
    const n = sinNativos();
    try {
      await abrir();
      expect(dialogo().textContent).toMatch(/No se elimina: queda retirado/);
      expect(n.nativos).toEqual([]);
    } finally { n.restaurar(); }
  });
  test("aceptar: queda retirado con su motivo, conservando el documento", async () => {
    const m = await abrir();
    await responder("Reemplazado por anexo firmado");
    expect(m.escrituras).toHaveLength(1);
    const ax = m.escrituras[0][0].anexosExtra[0];
    expect(ax.link).toBe("https://doc.invalid/anexo.pdf");
    expect(JSON.stringify(ax)).toMatch(/Reemplazado por anexo firmado/);
    expect(JSON.stringify(ax)).toMatch(/retiro/);
  });
  test("cancelar: no escribe nada", async () => {
    const m = await abrir();
    await cancelar();
    expect(m.escrituras).toHaveLength(0);
  });
  test("si el contrato cambió mientras se respondía: no aplica y avisa", async () => {
    const m = await abrir();
    m.cambiarDesdeOtraSesion({ razonSocial: "DIALOGO (editado en otra sesión)" });
    await responder("motivo");
    expect(m.escrituras).toHaveLength(0);
    expect(dialogo().textContent).toMatch(/cambió mientras respondías/);
  });
});

// ── 2. Baja de una plantación ──
describe("baja de una plantación", () => {
  const CT = () => BASE({ plantaciones: [{ id: "p1", especie: "Cereza", variedad: "Var X", estado: "Plantado", plantas: 100, ha: 2 }] });
  const abrir = async () => {
    const m = montar(CT());
    fireEvent.click(screen.getAllByText(/🌿 Plantaciones/)[0]);
    await clic(screen.getByText("Baja"));
    return m;
  };
  test("aceptar: la plantación queda de baja con su motivo y el registro se conserva", async () => {
    const n = sinNativos();
    try {
      const m = await abrir();
      expect(dialogo().textContent).toMatch(/Dar de baja la plantación "Cereza · Var X"/);
      await responder("Arranque por replante");
      expect(n.nativos).toEqual([]);
      expect(m.escrituras).toHaveLength(1);
      const pl = m.escrituras[0][0].plantaciones;
      expect(pl).toHaveLength(1);
      expect(JSON.stringify(pl[0])).toMatch(/Arranque por replante/);
    } finally { n.restaurar(); }
  });
  test("cancelar: no escribe nada", async () => {
    const m = await abrir();
    await cancelar();
    expect(m.escrituras).toHaveLength(0);
  });
  test("si el contrato cambió mientras se respondía: no aplica y avisa", async () => {
    const m = await abrir();
    m.cambiarDesdeOtraSesion({ plantaciones: [{ id: "p1", especie: "Cereza", variedad: "Var X", estado: "Productivo", plantas: 100, ha: 2 }] });
    await responder("motivo");
    expect(m.escrituras).toHaveLength(0);
    expect(dialogo().textContent).toMatch(/cambió mientras respondías/);
  });
});

// ── 3. Retiro del registro de reajuste ──
describe("retiro (desactivar) del registro de reajuste", () => {
  const CT = () => BASE({
    modeloIngresos: "oc", valorRoyaltyComercial: 3000, rcMesCobro: "Abril", fechaTermino: "2031-06-30",
    rcCohortes: [{ id: "c1", ha: 41.97, desde: "2026/2027" }],
    reajuste: { tipo: "porcentaje", pct: 2, desde: "2026-07-01", referencia: "Clausula 1.2.5", confirmado: true },
    reajusteActivacion: ACTIVACION, rcPagos: { "2029/2030": { nFact: "999", pagado: true } },
  });
  const abrir = async () => {
    const m = montar(CT());
    fireEvent.click(screen.getByText(/Cobros derivados/));
    await clic(screen.getByText("Desactivar"));
    return m;
  };
  test("el diálogo muestra el efecto y exige motivo (Aceptar deshabilitado sin texto)", async () => {
    await abrir();
    expect(dialogo().textContent).toMatch(/Se deja de aplicar: US\$ 17983\.99/);
    expect(within(dialogo()).getByTestId("dialogo-aceptar").disabled).toBe(true);
  });
  test("aceptar con motivo y confirmar: vuelve a la base con el motivo en el registro", async () => {
    const n = sinNativos();
    try {
      const m = await abrir();
      await responder("Se anulo el respaldo");
      expect(n.nativos.filter((x) => x === "prompt")).toEqual([]);
      expect(n.nativos.some((x) => /^confirm:¿Confirmas desactivar/.test(x))).toBe(true);
      expect(m.escrituras).toHaveLength(1);
      const act2 = m.escrituras[0][0].reajusteActivacion;
      expect(act2.activado).toBe(false);
      expect(act2.desactivadoMotivo).toMatch(/respaldo/);
    } finally { n.restaurar(); }
  });
  test("cancelar: no escribe nada ni pide confirmación", async () => {
    const n = sinNativos();
    try {
      const m = await abrir();
      await cancelar();
      expect(m.escrituras).toHaveLength(0);
      expect(n.nativos).toEqual([]);
    } finally { n.restaurar(); }
  });
  test("si el contrato cambió mientras se respondía: no aplica y avisa", async () => {
    const m = await abrir();
    m.cambiarDesdeOtraSesion({ rcMesCobro: "Mayo" });
    await responder("motivo");
    expect(m.escrituras).toHaveLength(0);
    expect(dialogo().textContent).toMatch(/cambió mientras respondías/);
  });
});

// ── Panel de firmas y anexos (solo lectura de lo registrado) ──
describe("panel de firmas y anexos del contrato", () => {
  test("muestra las dos firmas, el documento y el estado de los anexos sin escribir nada", () => {
    const m = montar(BASE({ firmadoLicenciado: true, firmadoOsiris: false, linkContrato: "",
      anexosExtra: [{ id: "ax1", activo: true, firmadoOsiris: true, firmadoLicenciado: false, link: "" }] }));
    const p = screen.getByTestId("estado-firmas").textContent;
    expect(p).toMatch(/Licenciado \(DIALOGO \(prueba\)\): firmado/);
    expect(p).toMatch(/Osiris: pendiente/);
    expect(p).toMatch(/Sin documento adjunto/);
    expect(p).toMatch(/Anexos: 1 activo · 0 con ambas firmas · 1 con firma pendiente/);
    expect(p).toMatch(/Anexo 4 activo con firma pendiente de Licenciado/);
    expect(p).toMatch(/no está definido en la app/);
    expect(m.escrituras).toHaveLength(0);
  });
});
