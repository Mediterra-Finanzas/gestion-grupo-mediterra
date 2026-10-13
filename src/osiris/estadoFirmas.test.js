/* eslint-disable */
import { estadoFirmasContrato, anexosDelContrato, DECISIONES_FIRMAS } from "./estadoFirmas";

const CT = (extra) => Object.assign({ id: "c1", razonSocial: "Licenciado Ficticio SAC", firmadoLicenciado: true, firmadoOsiris: true, linkContrato: "https://doc.invalid/c.pdf" }, extra || {});

test("firmado completo = las dos firmas, como la etiqueta que ya existía", () => {
  expect(estadoFirmasContrato(CT()).firmadoCompleto).toBe(true);
  const e = estadoFirmasContrato(CT({ firmadoOsiris: false }));
  expect(e.firmadoCompleto).toBe(false);
  expect(e.observaciones).toContain("Firma pendiente: Osiris.");
  expect(e.firmas.map((f) => [f.quien, f.hecho])).toEqual([["Licenciado", true], ["Osiris", false]]);
  expect(e.firmas[0].nombre).toBe("Licenciado Ficticio SAC");
});

test("sin documento adjunto se informa", () => {
  expect(estadoFirmasContrato(CT({ linkContrato: "" })).observaciones).toContain("Sin documento del contrato adjunto.");
});

test("anexos: fijos (booleano antiguo u objeto) y extra, con activo/retirado, firmas y documento", () => {
  const r = CT({
    anexo1: true,                                                     // antiguo: sin firmas registradas
    anexo2: { activo: true, firmadoOsiris: true, firmadoLicenciado: false, link: "" },
    anexo3: false,
    anexosExtra: [
      { id: "x1", activo: true, firmadoOsiris: true, firmadoLicenciado: true, link: "https://doc.invalid/a4.pdf" },
      { id: "x2", activo: false, estadoRegistro: "retirado", firmadoOsiris: true, firmadoLicenciado: true, link: "https://doc.invalid/a5.pdf" },
    ],
  });
  const a = anexosDelContrato(r);
  expect(a.map((x) => x.rotulo)).toEqual(["Anexo 1", "Anexo 2", "Anexo 4", "Anexo 5"]);
  const e = estadoFirmasContrato(r);
  expect(e.resumenAnexos).toEqual({ activos: 3, firmadosAmbos: 1, conFirmaPendiente: 1, sinFirmasRegistradas: 1, sinDocumento: 2, retirados: 1 });
  expect(e.observaciones).toContain("Anexo 2 activo con firma pendiente de Licenciado.");
  expect(e.observaciones).toContain("1 anexo(s) antiguo(s) sin firmas registradas.");
  // El antiguo NO se presenta como «pendiente»: no hay dato.
  expect(e.observaciones.join(" ")).not.toMatch(/Anexo 1 activo con firma pendiente/);
});

test("solo describe: no cambia el contrato", () => {
  const r = CT({ anexo2: { activo: true, firmadoOsiris: false, firmadoLicenciado: false } });
  const antes = JSON.stringify(r);
  estadoFirmasContrato(r);
  expect(JSON.stringify(r)).toBe(antes);
});

test("las reglas no definidas se listan como decisiones", () => {
  expect(DECISIONES_FIRMAS.length).toBeGreaterThanOrEqual(3);
});
