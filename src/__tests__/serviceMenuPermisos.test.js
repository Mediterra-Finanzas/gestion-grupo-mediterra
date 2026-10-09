/* Allegria Service: el menú y las páginas respetan «sin_acceso» explícito
   (antes el menú no se filtraba). Las páginas se simulan: la prueba es del menú. */
import React from "react";
import { render, screen, act } from "@testing-library/react";
jest.mock("../proceso/ui/pages/CentroOperaciones", () => () => null);
jest.mock("../proceso/ui/pages/Configuracion", () => () => null);
jest.mock("../proceso/ui/pages/ProximaFase", () => () => null);
jest.mock("../proceso/ui/pages/Recepciones", () => () => null);
jest.mock("../proceso/ui/pages/NuevaRecepcion", () => () => null);
jest.mock("../proceso/ui/pages/RecepcionDetalle", () => () => null);
jest.mock("../proceso/ui/pages/Lotes", () => () => null);
jest.mock("../proceso/ui/pages/Envases", () => () => null);
jest.mock("../proceso/ui/pages/LoteDetalle", () => () => null);
jest.mock("../proceso/ui/pages/Programa", () => () => null);
jest.mock("../proceso/ui/pages/Ordenes", () => () => null);
jest.mock("../proceso/ui/pages/Orden", () => () => null);
jest.mock("../proceso/ui/pages/ProductoTerminado", () => () => null);
jest.mock("../proceso/ui/pages/Bodega", () => () => null);
jest.mock("../proceso/ui/pages/PalletDetalle", () => () => null);
jest.mock("../proceso/ui/pages/Repaletizaje", () => () => null);
jest.mock("../proceso/ui/pages/Despachos", () => () => null);
jest.mock("../proceso/ui/pages/Despacho", () => () => null);
jest.mock("../proceso/ui/pages/Informes", () => () => null);
jest.mock("../proceso/ui/pages/InformeDetalle", () => () => null);
jest.mock("../proceso/ui/pages/Clientes", () => () => null);
jest.mock("../proceso/ui/pages/ClienteFicha", () => () => null);
jest.mock("../proceso/ui/pages/ReporteDiario", () => () => null);
jest.mock("../proceso/ui/pages/Tarifario", () => () => null);
jest.mock("../proceso/ui/pages/ServiciosFacturables", () => () => null);
jest.mock("../proceso/ui/pages/BasesCobro", () => () => null);
jest.mock("../proceso/ui/pages/BaseCobroDetalle", () => () => null);
jest.mock("../proceso/core/procesoDB", () => ({ cargarPlantas: async () => [], cargarTemporadas: async () => [] }));
import ProcShell from "../proceso/ui/layout/ProcShell";
import { ServiceProvider } from "../proceso/ui/hooks/useServiceContext";

function montar(usuario, esAdmin = false) {
  return render(<ServiceProvider tabPermisos={{}} esAdmin={esAdmin} usuario={usuario}><ProcShell usuario={usuario} /></ServiceProvider>);
}
beforeAll(() => { Object.defineProperty(window, "innerWidth", { value: 1400, configurable: true }); });

test("sin configuración: el menú muestra Lotes y Configuración (como hoy)", () => {
  montar({ nombre: "A", rol: "editor", tab_permisos: {} });
  expect(screen.queryByText("Lotes / Materia Prima")).not.toBeNull();
  expect(screen.queryByText(/Configuración/)).not.toBeNull();
});

test("Lotes en «sin_acceso» explícito: desaparece del menú", () => {
  montar({ nombre: "B", rol: "editor", tab_permisos: { allegria_service: { lotes: "sin_acceso" } } });
  expect(screen.queryByText("Lotes / Materia Prima")).toBeNull();
  expect(screen.queryByText("Recepciones")).not.toBeNull();
});

test("Centro en «sin_acceso»: la página de inicio muestra el aviso y no el contenido", () => {
  montar({ nombre: "C", rol: "editor", tab_permisos: { allegria_service: { centro: "sin_acceso" } } });
  expect(screen.getByTestId("service-sin-acceso")).toBeTruthy();
});

test("admin: nada se oculta", () => {
  montar({ nombre: "D", rol: "admin", tab_permisos: { allegria_service: { lotes: "sin_acceso" } } }, true);
  expect(screen.queryByText("Lotes / Materia Prima")).not.toBeNull();
});
