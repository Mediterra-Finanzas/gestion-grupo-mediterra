/* eslint-disable */
// Tests puros de friskuDocumentRefs (S1). Correr desde checkout sin .claude:
// npm test friskuDocumentRefs
import { clasificarReferenciaDoc, esSharePointPendiente, hashRutaLegacy, SP_LIBRARIES, decidirAplicacionRef, refTieneContenido, conservarDocsComex } from "./friskuDocumentRefs";

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

// 4. S2.2 — decidirAplicacionRef: el borrador solo se aplica cuando es válido
describe("4. decidirAplicacionRef (input transitorio)", () => {
  it("escritura progresiva C / C:\\ / C:\\Users / ruta parcial → NUNCA se aplica", () => {
    for (const parcial of ["C", "C:", "C:\\", "C:\\Users", "C:\\Users\\x\\INVERSIONES MEDITERRA SPA\\Frisku Foods SpA - Documentos\\FRUTA"]) {
      const d = decidirAplicacionRef(parcial);
      expect(d.aplicar).toBe(false);           // ningún parcial llega al modelo
      expect(d.valorAplicado).toBe(undefined);
    }
  });
  it("ruta SharePoint completa → no se aplica, aviso 'sharepoint'", () => {
    const d = decidirAplicacionRef(`file:///${RAIZ}/${REL_CARPETA}/x.pdf`);
    expect(d.aplicar).toBe(false);
    expect(d.aviso).toBe("sharepoint");
  });
  it("ruta local real → no se aplica, aviso 'local'", () => {
    const d = decidirAplicacionRef("C:/Users/x/Escritorio/factura.pdf");
    expect(d.aplicar).toBe(false);
    expect(d.aviso).toBe("local");
  });
  it("URL http(s) válida → se aplica tal cual", () => {
    const d = decidirAplicacionRef("https://ejemplo.com/doc.pdf");
    expect(d.aplicar).toBe(true);
    expect(d.valorAplicado).toBe("https://ejemplo.com/doc.pdf");
    expect(d.aviso).toBe(null);
  });
  it("vacío → NO se aplica (no borra la referencia existente; eliminar es acción explícita)", () => {
    const d = decidirAplicacionRef("");
    expect(d.aplicar).toBe(false);
    expect(d.valorAplicado).toBe(undefined);
    expect(d.aviso).toBe(null);
    // espacios en blanco también cuentan como vacío
    expect(decidirAplicacionRef("   ").aplicar).toBe(false);
  });
  it("orden de eventos: teclear parcial→parcial→SharePoint completo nunca marca aplicar", () => {
    const seq = ["f", "fi", "file:///C:/Users/x/INVERSIONES MEDITERRA SPA/Frisku Foods SpA - Documentos/FRUTA/doc.pdf"];
    const aplicados = seq.map(v => decidirAplicacionRef(v).aplicar);
    expect(aplicados).toEqual([false, false, false]); // ningún paso aplica una ruta
  });
});

// 5. Hallazgo 1 — conservación de referencias documentales legacy al abrir el panel COMEX
describe("5. conservarDocsComex (no descarta referencias reales)", () => {
  const DEPRECADOS = ["BL / AWB", "Invoice Comercial", "Certificado Fitosanitario", "Certificado de Origen"];
  const RAIZ = "C:/Users/carolina/INVERSIONES MEDITERRA SPA/Frisku Foods SpA - Documentos";
  const legacy = (tipo) => ({ id: "d_" + tipo, tipo, nombre: tipo + ".pdf", fuente: "manual", estado: "pendiente",
    url: `file:///${RAIZ}/FRUTA FRESCA/HLBU9435288_AGO_2026/${tipo}.pdf` });

  it("refTieneContenido: vacío/espacios = sin contenido; cualquier ruta o http = con contenido", () => {
    expect(refTieneContenido("")).toBe(false);
    expect(refTieneContenido("   ")).toBe(false);
    expect(refTieneContenido(null)).toBe(false);
    expect(refTieneContenido("https://x/y.pdf")).toBe(true);
    expect(refTieneContenido(`file:///${RAIZ}/x.pdf`)).toBe(true);
    expect(refTieneContenido("C:/Users/x/Escritorio/f.pdf")).toBe(true);
  });

  it("BL/AWB con ruta legacy SharePoint se conserva", () => {
    const docs = [legacy("BL / AWB")];
    const r = conservarDocsComex(docs, DEPRECADOS);
    expect(r).toHaveLength(1);
    expect(r[0]).toBe(docs[0]); // misma referencia, intacta
  });
  it("Invoice / Fitosanitario / Origen con ruta legacy se conservan", () => {
    const docs = [legacy("Invoice Comercial"), legacy("Certificado Fitosanitario"), legacy("Certificado de Origen")];
    const r = conservarDocsComex(docs, DEPRECADOS);
    expect(r.map(d => d.tipo)).toEqual(["Invoice Comercial", "Certificado Fitosanitario", "Certificado de Origen"]);
  });
  it("una referencia desconocida no vacía (deprecada) se conserva para revisión", () => {
    const docs = [{ id: "d1", tipo: "BL / AWB", url: "algo raro sin esquema" }];
    expect(conservarDocsComex(docs, DEPRECADOS)).toHaveLength(1);
  });
  it("un documento HTTP/Supabase se conserva", () => {
    const docs = [{ id: "d1", tipo: "BL / AWB", url: "https://x.supabase.co/storage/v1/object/public/frisku-docs/a/b.pdf" }];
    expect(conservarDocsComex(docs, DEPRECADOS)).toHaveLength(1);
  });
  it("un placeholder deprecado verdaderamente vacío mantiene el comportamiento histórico (se descarta)", () => {
    const docs = [{ id: "d1", tipo: "BL / AWB", url: "" }, { id: "d2", tipo: "BL / AWB", url: "   " }];
    expect(conservarDocsComex(docs, DEPRECADOS)).toHaveLength(0);
  });
  it("un documento NO deprecado nunca se descarta, aunque esté vacío", () => {
    const docs = [{ id: "d1", tipo: "QC", url: "" }, { id: "d2", tipo: "Otro", url: "" }];
    expect(conservarDocsComex(docs, DEPRECADOS)).toHaveLength(2);
  });
  it("colección mixta: conserva legacy + no-deprecados, descarta solo placeholders deprecados vacíos", () => {
    const bl = legacy("BL / AWB");
    const qcVacio = { id: "qc", tipo: "QC", url: "" };
    const invVacio = { id: "inv", tipo: "Invoice Comercial", url: "" };
    const r = conservarDocsComex([bl, qcVacio, invVacio], DEPRECADOS);
    expect(r).toEqual([bl, qcVacio]); // invVacio (deprecado vacío) descartado; el resto intacto
  });
  it("PURA: no muta el array ni los documentos recibidos", () => {
    const docs = [legacy("BL / AWB"), { id: "inv", tipo: "Invoice Comercial", url: "" }];
    const copiaLen = docs.length;
    const snapshot = JSON.stringify(docs);
    const r = conservarDocsComex(docs, DEPRECADOS);
    expect(docs).toHaveLength(copiaLen);           // el array original no cambia
    expect(JSON.stringify(docs)).toBe(snapshot);   // los documentos no se mutan
    expect(r).not.toBe(docs);                       // devuelve un array nuevo
  });
  it("entradas no-array o nulas no rompen", () => {
    expect(conservarDocsComex(null, DEPRECADOS)).toEqual([]);
    expect(conservarDocsComex(undefined, null)).toEqual([]);
    expect(conservarDocsComex([null, undefined], DEPRECADOS)).toEqual([]);
  });
});
