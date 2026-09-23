/* eslint-disable */
// Tests del cliente frontend del proxy SharePoint (S5B). fetch mockeado, sin red.
import { iniciarSesionSp, cerrarSesionSp, buscarCandidatos, construirReferencia, esWebUrlSharePoint } from "./friskuSharePointClient";

function mkFetch(secuencia) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    const next = typeof secuencia === "function" ? secuencia(calls.length - 1) : secuencia;
    if (next && next.throw) { const e = new Error("abort"); e.name = next.throw; throw e; }
    return { ok: next.status < 400, status: next.status, json: async () => next.body || {} };
  };
  fn.calls = calls;
  return fn;
}

describe("friskuSharePointClient", () => {
  test("iniciarSesionSp ok → {ok:true}; usa credentials include y manda op/email/pin", async () => {
    const f = mkFetch({ status: 200, body: { ok: true } });
    const r = await iniciarSesionSp("uno@x.test", "246810", { fetchImpl: f });
    expect(r).toEqual({ ok: true });
    expect(f.calls[0].url).toBe("/api/frisku-sp");
    expect(f.calls[0].opts.credentials).toBe("include");
    const body = JSON.parse(f.calls[0].opts.body);
    expect(body).toEqual({ op: "login", email: "uno@x.test", pin: "246810" });
  });

  test("mapa de errores genérico", async () => {
    const casos = [[401, "sin_sesion"], [403, "sin_acceso"], [429, "rate_limit"], [502, "graph"], [503, "no_disponible"], [400, "solicitud_invalida"]];
    for (const [st, motivo] of casos) {
      const r = await iniciarSesionSp("a@x.test", "1", { fetchImpl: mkFetch({ status: st, body: { error: "interno-no-expuesto" } }) });
      expect(r).toEqual({ ok: false, motivo });
    }
  });

  test("construirReferencia toma tokens del OE (sin PII)", () => {
    const ref = construirReferencia({ id: "OE1", numeroContenedor: "HLBU9435288", numero: "OE-12", temporada: "2026-2027" }, { clienteNombre: "Cli", exportadorNombre: "Exp", especieNombre: "Arándanos" });
    expect(ref.tokens.contenedor).toBe("HLBU9435288");
    expect(ref.tokens.numeroOE).toBe("OE-12");
    expect(ref.tokens.cliente).toBe("Cli");
  });

  test("esWebUrlSharePoint: solo https *.sharepoint.com", () => {
    expect(esWebUrlSharePoint("https://tenant.sharepoint.com/x")).toBe(true);
    expect(esWebUrlSharePoint("https://evil.com/x")).toBe(false);
    expect(esWebUrlSharePoint("http://tenant.sharepoint.com/x")).toBe(false);
    expect(esWebUrlSharePoint("javascript:alert(1)")).toBe(false);
    expect(esWebUrlSharePoint("")).toBe(false);
  });

  test("buscarCandidatos: search por contenedor, corre matcher y devuelve porId con webUrl", async () => {
    const item = { driveId: "D", itemId: "IT1", name: "BL_HLBU9435288.pdf", webUrl: "https://t.sharepoint.com/BL.pdf", parentReference: { driveId: "D" } };
    const f = mkFetch({ status: 200, body: { items: [{ ...item }], truncated: false } });
    const r = await buscarCandidatos({ id: "OE1", numeroContenedor: "HLBU9435288", temporada: "2026-2027" }, {}, { fetchImpl: f });
    expect(r.ok).toBe(true);
    expect(JSON.parse(f.calls[0].opts.body).op).toBe("search");
    expect(r.resultado.requiereConfirmacion).toBe(true);
    expect(r.porId.IT1.webUrl).toBe("https://t.sharepoint.com/BL.pdf");
  });

  test("buscarCandidatos sin contenedor/OE → op list", async () => {
    const f = mkFetch({ status: 200, body: { items: [] } });
    await buscarCandidatos({ id: "OE2" }, {}, { fetchImpl: f });
    expect(JSON.parse(f.calls[0].opts.body).op).toBe("list");
  });

  test("buscarCandidatos propaga error genérico (sin exponer cuerpo)", async () => {
    const r = await buscarCandidatos({ id: "OE1", numeroContenedor: "HLBU9435288" }, {}, { fetchImpl: mkFetch({ status: 502, body: { detalle: "secreto" } }) });
    expect(r).toEqual({ ok: false, motivo: "graph" });
    expect(JSON.stringify(r)).not.toContain("secreto");
  });

  test("AbortError se propaga (para ignorar respuestas obsoletas)", async () => {
    await expect(buscarCandidatos({ id: "OE1", numeroContenedor: "X" }, {}, { fetchImpl: mkFetch({ throw: "AbortError" }) })).rejects.toMatchObject({ name: "AbortError" });
  });
});
