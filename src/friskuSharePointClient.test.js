/* eslint-disable */
// Tests del cliente frontend del proxy SharePoint (S5B). fetch mockeado, sin red.
import { iniciarSesionSp, cerrarSesionSp, buscarCandidatos, construirReferencia, esWebUrlSharePoint, filtrarCandidatosRelevantes } from "./friskuSharePointClient";

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

describe("filtrarCandidatosRelevantes — relevancia estricta", () => {
  const c = (o) => ({ driveId: "D", itemId: "IT", score: 50, confianza: "media", señales: [], advertencias: [], ...o });
  const señ = (...pares) => pares.map(([tipo, resultado]) => ({ tipo, resultado }));
  const res = (cands) => ({ estado: "low_confidence", candidatos: cands, recomendacion: "x", requiereConfirmacion: true });

  test("solo deja archivos con match EXACTO de contenedor u OE", () => {
    const contenedor = c({ itemId: "A", señales: señ(["contenedor", "match"], ["temporada", "match"]) });
    const oe = c({ itemId: "B", señales: señ(["numeroOE", "match"]) });
    const soloTemp = c({ itemId: "C", señales: señ(["temporada", "match"], ["cliente", "match"], ["exportadora", "match"]) });
    const soloNombre = c({ itemId: "E", señales: señ(["nombreArchivo", "match"], ["especie", "match"]) });
    const contradice = c({ itemId: "F", señales: señ(["contenedor", "contradiccion"]) });
    const r = filtrarCandidatosRelevantes(res([contenedor, oe, soloTemp, soloNombre, contradice]), []);
    expect(r.candidatos.map((x) => x.itemId).sort()).toEqual(["A", "B"]);
  });

  test("excluye carpetas (esCarpeta o mimeType folder) y accesos .lnk", () => {
    const cands = [
      c({ itemId: "FOLD1", señales: señ(["contenedor", "match"]) }),
      c({ itemId: "FOLD2", señales: señ(["numeroOE", "match"]) }),
      c({ itemId: "LNK", señales: señ(["contenedor", "match"]) }),
      c({ itemId: "OKF", señales: señ(["contenedor", "match"]) }),
    ];
    const items = [
      { driveId: "D", itemId: "FOLD1", name: "COMEX", esCarpeta: true },
      { driveId: "D", itemId: "FOLD2", name: "sub", mimeType: "folder" },
      { driveId: "D", itemId: "LNK", name: "acceso.lnk", mimeType: "application/octet-stream" },
      { driveId: "D", itemId: "OKF", name: "BL_HLBU9435288.pdf", mimeType: "application/pdf" },
    ];
    const r = filtrarCandidatosRelevantes(res(cands), items);
    expect(r.candidatos.map((x) => x.itemId)).toEqual(["OKF"]);
  });

  test("limita a 10 resultados y marca limitado", () => {
    const cands = Array.from({ length: 13 }, (_, i) => c({ itemId: "I" + i, señales: señ(["contenedor", "match"]) }));
    const r = filtrarCandidatosRelevantes(res(cands), []);
    expect(r.candidatos).toHaveLength(10);
    expect(r.limitado).toBe(true);
  });

  test("sin candidatos relevantes → not_found", () => {
    const r = filtrarCandidatosRelevantes(res([c({ señales: señ(["temporada", "match"]) })]), []);
    expect(r.estado).toBe("not_found");
    expect(r.candidatos).toHaveLength(0);
    expect(r.recomendacion).toBe("sin_candidatos_relevantes");
  });

  test("re-deriva estado: candidato alta → exact_candidate", () => {
    const r = filtrarCandidatosRelevantes(res([c({ score: 80, confianza: "alta", señales: señ(["contenedor", "match"], ["numeroOE", "match"]) })]), []);
    expect(r.estado).toBe("exact_candidate");
  });

  test("es read-only: no muta el resultado ni las señales de entrada", () => {
    const entrada = res([c({ itemId: "A", señales: señ(["contenedor", "match"]) }), c({ itemId: "B", señales: señ(["cliente", "match"]) })]);
    const snap = JSON.stringify(entrada);
    filtrarCandidatosRelevantes(entrada, []);
    expect(JSON.stringify(entrada)).toBe(snap);
  });

  test("integración: buscarCandidatos excluye la carpeta del contenedor y deja el archivo", async () => {
    const items = [
      { driveId: "D", itemId: "CARP", name: "HLBU9435288", esCarpeta: true, mimeType: "folder", parentPath: "COMEX/HLBU9435288" },
      { driveId: "D", itemId: "DOC", name: "BL_HLBU9435288.pdf", webUrl: "https://t.sharepoint.com/BL.pdf", mimeType: "application/pdf", parentPath: "COMEX/HLBU9435288" },
    ];
    const f = mkFetch({ status: 200, body: { items, truncated: false } });
    const r = await buscarCandidatos({ id: "OE1", numeroContenedor: "HLBU9435288" }, {}, { fetchImpl: f });
    expect(r.ok).toBe(true);
    expect(r.resultado.candidatos.map((x) => x.itemId)).toEqual(["DOC"]);
  });
});
