/* eslint-disable */
// Tests de la lógica PURA de vinculación SharePoint ↔ requisito COMEX (metadatos, read-only).
import { requisitosDeComex, esVinculoSharePoint, aplicarVinculoComex, quitarVinculoComex } from "./friskuComexVinculo";

const cx0 = () => ({
  docs: [
    { id: "d1", tipo: "Packing List", nombre: "", url: "", fuente: "manual", fechaCarga: "", estado: "pendiente" },
    { id: "d2", tipo: "QC", nombre: "prev.pdf", url: "https://sp/prev.pdf", fuente: "storage", fechaCarga: "2026-01-01", estado: "cargado" },
  ],
});
const REF = { driveId: "DRV", itemId: "IT1", nombre: "BL_HLBU9435288.pdf", webUrl: "https://t.sharepoint.com/BL.pdf" };
const META = { usuario: "Carolina Lara", fecha: "2026-09-28" };

describe("requisitosDeComex", () => {
  it("lista docId/tipo/tieneRef; tieneRef=true si hay url o spRef", () => {
    const r = requisitosDeComex(cx0());
    expect(r).toEqual([
      { docId: "d1", tipo: "Packing List", tieneRef: false },
      { docId: "d2", tipo: "QC", tieneRef: true },   // ya tiene archivo
    ]);
  });
});

describe("aplicarVinculoComex", () => {
  it("vincula: guarda SOLO metadatos de referencia + historial; no muta la entrada", () => {
    const cx = cx0();
    const snap = JSON.stringify(cx);
    const r = aplicarVinculoComex(cx, "d1", REF, META);
    expect(r.ok).toBe(true);
    const d = r.cx.docs.find((x) => x.id === "d1");
    expect(d.spRef).toEqual({ driveId: "DRV", itemId: "IT1", nombre: "BL_HLBU9435288.pdf", webUrl: "https://t.sharepoint.com/BL.pdf", origen: "sharepoint", fecha: "2026-09-28", usuario: "Carolina Lara" });
    expect(d.url).toBe("https://t.sharepoint.com/BL.pdf");   // habilita Abrir / semáforo
    expect(d.fuente).toBe("sharepoint");
    expect(d.estado).toBe("cargado");
    // solo metadatos: nada de contenido/base64/blob del archivo
    expect(Object.keys(d.spRef).sort()).toEqual(["driveId", "fecha", "itemId", "nombre", "origen", "usuario", "webUrl"]);
    // historial
    expect(r.cx.historial).toHaveLength(1);
    expect(r.cx.historial[0]).toMatchObject({ accion: "vincular", docId: "d1", tipo: "Packing List", itemId: "IT1", driveId: "DRV", usuario: "Carolina Lara", fecha: "2026-09-28" });
    // no-mutación
    expect(JSON.stringify(cx)).toBe(snap);
  });
  it("reemplazo: sobrescribe la referencia previa y registra un nuevo evento", () => {
    const cx = cx0();
    const r = aplicarVinculoComex(cx, "d2", REF, META);   // d2 ya tenía archivo
    expect(r.ok).toBe(true);
    const d = r.cx.docs.find((x) => x.id === "d2");
    expect(d.spRef.itemId).toBe("IT1");
    expect(d.url).toBe("https://t.sharepoint.com/BL.pdf");
    expect(r.cx.historial[r.cx.historial.length - 1].accion).toBe("vincular");
  });
  it("rechaza ref sin driveId/itemId y requisito inexistente", () => {
    expect(aplicarVinculoComex(cx0(), "d1", { itemId: "X" }, META).motivo).toBe("ref_invalida");
    expect(aplicarVinculoComex(cx0(), "d1", { driveId: "X" }, META).motivo).toBe("ref_invalida");
    expect(aplicarVinculoComex(cx0(), "noexiste", REF, META).motivo).toBe("requisito_inexistente");
  });
});

describe("quitarVinculoComex", () => {
  it("desvincula un requisito con vínculo SP: limpia la referencia local + historial; no toca otros", () => {
    const cx = aplicarVinculoComex(cx0(), "d1", REF, META).cx;   // d1 queda vinculado
    const r = quitarVinculoComex(cx, "d1", { usuario: "Carolina Lara", fecha: "2026-09-29" });
    expect(r.ok).toBe(true);
    const d = r.cx.docs.find((x) => x.id === "d1");
    expect(d.spRef).toBeUndefined();
    expect(d.url).toBe("");
    expect(d.fuente).toBe("manual");
    expect(d.estado).toBe("pendiente");
    expect(r.cx.historial[r.cx.historial.length - 1]).toMatchObject({ accion: "desvincular", docId: "d1", itemId: "IT1", usuario: "Carolina Lara" });
  });
  it("no desvincula un requisito sin vínculo SP (archivo subido normal)", () => {
    expect(quitarVinculoComex(cx0(), "d2", META).motivo).toBe("sin_vinculo");   // d2 es storage, no spRef
    expect(quitarVinculoComex(cx0(), "d1", META).motivo).toBe("sin_vinculo");   // d1 vacío
    expect(quitarVinculoComex(cx0(), "noexiste", META).motivo).toBe("requisito_inexistente");
  });
  it("esVinculoSharePoint distingue vínculo SP de archivo normal", () => {
    const cx = aplicarVinculoComex(cx0(), "d1", REF, META).cx;
    expect(esVinculoSharePoint(cx.docs.find((x) => x.id === "d1"))).toBe(true);
    expect(esVinculoSharePoint(cx.docs.find((x) => x.id === "d2"))).toBe(false);
  });
});
