/* eslint-disable */
// Tests puros de friskuDocumentRefs (S1). Correr desde checkout sin .claude:
// npm test friskuDocumentRefs
import { clasificarReferenciaDoc, esSharePointPendiente, hashRutaLegacy, SP_LIBRARIES } from "./friskuDocumentRefs";

const RAIZ = "C:/Users/carolina/INVERSIONES MEDITERRA SPA/Frisku Foods SpA - Documentos";
const REL_CARPETA = "FRUTA FRESCA/1. Clientes/3. IDEAL FRUITS/1. Exportadoras/COMEX_2026_2027/Agrokasa/Arándanos/HLBU9435288_AGO_2026";

describe("1. SharePoint sincronizado (allowlist) — pendiente de vincular", () => {
  it("file:///C:/.../Frisku Foods SpA - Documentos/... → sharepoint_synced_pending", () => {
    const r = clasificarReferenciaDoc(`file:///${RAIZ}/${REL_CARPETA}`);
    expect(r.clase).toBe("sharepoint_synced_pending");
    expect(r.biblioteca).toBe("Frisku Foods SpA - Documentos");
  });
  it("decodifica %20/tildes y unifica separadores \\ y /", () => {
    const enc = "file:///C:/Users/carolina/INVERSIONES%20MEDITERRA%20SPA/Frisku%20Foods%20SpA%20-%20Documentos/FRUTA%20FRESCA/Ar%C3%A1ndanos/HLBU9435288_AGO_2026";
    const r = clasificarReferenciaDoc(enc);
    expect(r.clase).toBe("sharepoint_synced_pending");
    expect(r.rutaRelativaDisplay).toContain("FRUTA FRESCA");
    expect(r.rutaRelativaDisplay).toContain("Arándanos");
    const back = clasificarReferenciaDoc(`C:\\Users\\carolina\\INVERSIONES MEDITERRA SPA\\Frisku Foods SpA - Documentos\\FRUTA FRESCA\\Agrokasa\\HLBU9435288_AGO_2026`);
    expect(back.clase).toBe("sharepoint_synced_pending");
  });
  it("NUNCA expone el username de Windows; ruta relativa preservada", () => {
    const r = clasificarReferenciaDoc(`file:///${RAIZ}/${REL_CARPETA}`);
    expect(r.rutaRelativaDisplay.includes("carolina")).toBe(false);
    expect(r.rutaRelativaDisplay.includes("Users")).toBe(false);
    expect(r.rutaRelativaDisplay.includes("C:")).toBe(false);
    expect(JSON.stringify(r).includes("carolina")).toBe(false);
    expect(r.rutaRelativa[0]).toBe("FRUTA FRESCA");
  });
  it("el ejemplo es CARPETA (sin archivo) → esCarpeta=true, nombre vacío", () => {
    const r = clasificarReferenciaDoc(`file:///${RAIZ}/${REL_CARPETA}`);
    expect(r.esCarpeta).toBe(true);
    expect(r.nombre).toBe("");
  });
  it("documento con extensión → nombre + ext", () => {
    const r = clasificarReferenciaDoc(`file:///${RAIZ}/${REL_CARPETA}/BL_HLBU9435288.pdf`);
    expect(r.esCarpeta).toBe(false);
    expect(r.nombre).toBe("BL_HLBU9435288.pdf");
    expect(r.ext).toBe("pdf");
  });
  it("tokens best-effort: temporada + contenedor con confianza", () => {
    const r = clasificarReferenciaDoc(`file:///${RAIZ}/${REL_CARPETA}/doc.pdf`);
    expect(r.tokens.temporada.valor).toBe("2026-2027");
    expect(r.tokens.contenedorOE.valor).toBe("HLBU9435288");
    expect(r.tokens.contenedorOE.confianza).toBe("alta");
  });
  it("múltiples documentos del mismo embarque, en carpetas distintas, nombre repetido → NO son identidad", () => {
    const a = clasificarReferenciaDoc(`file:///${RAIZ}/${REL_CARPETA}/carpetaA/Invoice.pdf`);
    const b = clasificarReferenciaDoc(`file:///${RAIZ}/${REL_CARPETA}/carpetaB/Invoice.pdf`);
    // mismo nombre, distinta ruta → clasificación igual pero rutas relativas distintas (no hay identidad por nombre)
    expect(a.nombre).toBe(b.nombre);
    expect(a.rutaRelativaDisplay).not.toBe(b.rutaRelativaDisplay);
    // el módulo NO inventa identidad (driveId/itemId)
    expect(a.driveId).toBe(undefined);
    expect(a.itemId).toBe(undefined);
    expect(a.webUrl).toBe(undefined);
  });
});

describe("2. Otras clases", () => {
  it("ruta local SIN allowlist → local_real", () => {
    expect(clasificarReferenciaDoc("C:/Users/x/Escritorio/factura.pdf").clase).toBe("local_real");
    expect(clasificarReferenciaDoc("file:///D:/otra biblioteca - Documentos/x.pdf").clase).toBe("local_real"); // no está en allowlist EXACTA
    expect(clasificarReferenciaDoc("\\\\servidor\\share\\x.pdf").clase).toBe("local_real");
  });
  it("URL Supabase Storage → supabase_storage; HTTP externa → http_external", () => {
    expect(clasificarReferenciaDoc("https://bywovqayuzodbzwsriet.supabase.co/storage/v1/object/public/frisku-docs/embarques/x/comex/y/1.pdf").clase).toBe("supabase_storage");
    expect(clasificarReferenciaDoc("https://ejemplo.com/doc.pdf").clase).toBe("http_external");
  });
  it("vacío → pending; patrón no reconocido → unknown (revisión)", () => {
    expect(clasificarReferenciaDoc("").clase).toBe("pending");
    expect(clasificarReferenciaDoc(null).clase).toBe("pending");
    expect(clasificarReferenciaDoc("Frisku").clase).toBe("unknown");
    expect(clasificarReferenciaDoc("algo raro sin esquema").clase).toBe("unknown");
  });
  it("allowlist NO es heurística amplia: '* - Documentos' cualquiera NO cuenta", () => {
    expect(clasificarReferenciaDoc("file:///C:/Users/x/Otra Empresa - Documentos/a/b.pdf").clase).toBe("local_real");
    expect(SP_LIBRARIES).toEqual(["Frisku Foods SpA - Documentos"]);
  });
});

describe("3. Pureza e invariantes", () => {
  it("no muta el input y esSharePointPendiente coincide", () => {
    const url = `file:///${RAIZ}/${REL_CARPETA}/x.pdf`;
    const copia = String(url);
    clasificarReferenciaDoc(url);
    expect(url).toBe(copia);
    expect(esSharePointPendiente(url)).toBe(true);
    expect(esSharePointPendiente("https://ejemplo.com/x.pdf")).toBe(false);
  });
  it("hash de diagnóstico es estable y no revela la ruta/usuario", () => {
    const url = `file:///${RAIZ}/${REL_CARPETA}/x.pdf`;
    const h = hashRutaLegacy(url);
    expect(h).toBe(hashRutaLegacy(url));
    expect(h.startsWith("lp_")).toBe(true);
    expect(h.includes("carolina")).toBe(false);
  });
});
