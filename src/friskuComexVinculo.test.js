/* eslint-disable */
// Tests de la lógica PURA de vinculación SharePoint ↔ requisito COMEX (metadatos, read-only).
import { requisitosDeComex, esVinculoSharePoint, esWebUrlSharePointFrisku, esArchivoStorage, aplicarVinculoComex, quitarVinculoComex } from "./friskuComexVinculo";

const SP = "https://grupomediterra.sharepoint.com/sites/FriskuFoodsSpA/Documentos%20compartidos/BL_HLBU9435288.pdf";
const SP_OLD = "https://grupomediterra.sharepoint.com/sites/FriskuFoodsSpA/Documentos%20compartidos/old.pdf";
const cx0 = () => ({
  docs: [
    { id: "d1", tipo: "Packing List", nombre: "", url: "", fuente: "manual", fechaCarga: "", estado: "pendiente" },                                  // vacío
    { id: "d2", tipo: "QC", nombre: "prev.pdf", url: "https://sp/prev.pdf", fuente: "storage", fechaCarga: "2026-01-01", estado: "cargado" },        // archivo Storage → bloqueado
    { id: "d3", tipo: "Full Set", nombre: "old.pdf", url: SP_OLD, fuente: "sharepoint", fechaCarga: "2026-02-01", estado: "cargado",                 // vínculo SP → reemplazable
      spRef: { driveId: "D0", itemId: "OLD", nombre: "old.pdf", webUrl: SP_OLD, origen: "sharepoint", fecha: "2026-02-01", usuario: "x" } },
  ],
});
const REF = { driveId: "DRV", itemId: "IT1", nombre: "BL_HLBU9435288.pdf", webUrl: SP };
const META = { usuario: "Carolina Lara", fecha: "2026-09-28" };

describe("esWebUrlSharePointFrisku — solo el SharePoint autorizado de Frisku", () => {
  it("acepta https del host+sitio Frisku; rechaza el resto", () => {
    expect(esWebUrlSharePointFrisku(SP)).toBe(true);
    expect(esWebUrlSharePointFrisku("")).toBe(false);
    expect(esWebUrlSharePointFrisku("http://grupomediterra.sharepoint.com/sites/FriskuFoodsSpA/x.pdf")).toBe(false); // http
    expect(esWebUrlSharePointFrisku("https://evil.com/x.pdf")).toBe(false);                                          // dominio ajeno
    expect(esWebUrlSharePointFrisku("https://otro.sharepoint.com/sites/FriskuFoodsSpA/x.pdf")).toBe(false);          // otro tenant
    expect(esWebUrlSharePointFrisku("https://grupomediterra.sharepoint.com/sites/OtroSitio/x.pdf")).toBe(false);     // otro sitio
    expect(esWebUrlSharePointFrisku("javascript:alert(1)")).toBe(false);
  });
});

describe("requisitosDeComex", () => {
  it("lista docId/tipo/tieneRef/bloqueadoStorage", () => {
    expect(requisitosDeComex(cx0())).toEqual([
      { docId: "d1", tipo: "Packing List", tieneRef: false, bloqueadoStorage: false },
      { docId: "d2", tipo: "QC", tieneRef: true, bloqueadoStorage: true },     // archivo subido
      { docId: "d3", tipo: "Full Set", tieneRef: true, bloqueadoStorage: false }, // vínculo SP
    ]);
  });
});

describe("aplicarVinculoComex", () => {
  it("vincula en requisito vacío: solo metadatos + historial; no muta la entrada", () => {
    const cx = cx0(); const snap = JSON.stringify(cx);
    const r = aplicarVinculoComex(cx, "d1", REF, META);
    expect(r.ok).toBe(true);
    const d = r.cx.docs.find((x) => x.id === "d1");
    expect(d.spRef).toEqual({ driveId: "DRV", itemId: "IT1", nombre: "BL_HLBU9435288.pdf", webUrl: SP, origen: "sharepoint", fecha: "2026-09-28", usuario: "Carolina Lara" });
    expect(d.url).toBe(SP); expect(d.fuente).toBe("sharepoint"); expect(d.estado).toBe("cargado");
    expect(Object.keys(d.spRef).sort()).toEqual(["driveId", "fecha", "itemId", "nombre", "origen", "usuario", "webUrl"]);
    expect(r.cx.historial[0]).toMatchObject({ accion: "vincular", docId: "d1", tipo: "Packing List", itemId: "IT1", driveId: "DRV", usuario: "Carolina Lara" });
    expect(JSON.stringify(cx)).toBe(snap);
  });
  it("fail-closed: webUrl vacío, http o dominio/sitio ajeno → weburl_invalida, sin tocar el modelo", () => {
    for (const bad of ["", "http://grupomediterra.sharepoint.com/sites/FriskuFoodsSpA/x.pdf", "https://evil.com/x.pdf", "https://grupomediterra.sharepoint.com/sites/Otro/x.pdf"]) {
      const cx = cx0();
      const r = aplicarVinculoComex(cx, "d1", { ...REF, webUrl: bad }, META);
      expect(r.ok).toBe(false);
      expect(r.motivo).toBe("weburl_invalida");
      expect(cx.docs.find((x) => x.id === "d1").estado).toBe("pendiente"); // nunca "cargado"
    }
  });
  it("reemplazo de un archivo Storage: BLOQUEADO (evita huérfano), sin cambiar el modelo", () => {
    const cx = cx0();
    const r = aplicarVinculoComex(cx, "d2", REF, META);
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("reemplazo_storage_bloqueado");
  });
  it("reemplazo de un vínculo SharePoint existente: PERMITIDO", () => {
    const r = aplicarVinculoComex(cx0(), "d3", REF, META);
    expect(r.ok).toBe(true);
    expect(r.cx.docs.find((x) => x.id === "d3").spRef.itemId).toBe("IT1");
  });
  it("rechaza ref sin driveId/itemId y requisito inexistente", () => {
    expect(aplicarVinculoComex(cx0(), "d1", { itemId: "X", webUrl: SP }, META).motivo).toBe("ref_invalida");
    expect(aplicarVinculoComex(cx0(), "noexiste", REF, META).motivo).toBe("requisito_inexistente");
  });
});

describe("quitarVinculoComex", () => {
  it("desvincula un vínculo SP: limpia la referencia local + historial", () => {
    const r = quitarVinculoComex(cx0(), "d3", { usuario: "Carolina Lara", fecha: "2026-09-29" });
    expect(r.ok).toBe(true);
    const d = r.cx.docs.find((x) => x.id === "d3");
    expect(d.spRef).toBeUndefined(); expect(d.url).toBe(""); expect(d.fuente).toBe("manual"); expect(d.estado).toBe("pendiente");
    expect(r.cx.historial[r.cx.historial.length - 1]).toMatchObject({ accion: "desvincular", docId: "d3", itemId: "OLD", usuario: "Carolina Lara" });
  });
  it("no desvincula un archivo Storage ni un requisito vacío", () => {
    expect(quitarVinculoComex(cx0(), "d2", META).motivo).toBe("sin_vinculo");
    expect(quitarVinculoComex(cx0(), "d1", META).motivo).toBe("sin_vinculo");
    expect(quitarVinculoComex(cx0(), "noexiste", META).motivo).toBe("requisito_inexistente");
  });
  it("esVinculoSharePoint / esArchivoStorage distinguen los casos", () => {
    const cx = cx0();
    expect(esVinculoSharePoint(cx.docs[2])).toBe(true);   // d3
    expect(esVinculoSharePoint(cx.docs[1])).toBe(false);  // d2 storage
    expect(esArchivoStorage(cx.docs[1])).toBe(true);      // d2
    expect(esArchivoStorage(cx.docs[2])).toBe(false);     // d3
  });
});
