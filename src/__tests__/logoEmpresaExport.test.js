/* eslint-disable */
// Logo de cada empresa en las exportaciones: tabla única, tamaños reales y
// el dibujo que se agrega a un Excel armado a mano.
import fs from "fs";
import path from "path";
import { rutaLogoEmpresa, tamanoPng, tamanoImagen, formatoDataUrl, agregarLogoHoja } from "../diseno/logoExport.js";
const JSZip = require("/opt/node-tools/node_modules/jszip");
const pub = (f) => new Uint8Array(fs.readFileSync(path.join(__dirname, "../../public", f)));

test("cada empresa tiene su logo, con los dos nombres que usa la app", () => {
  expect(rutaLogoEmpresa("Mediterra")).toBe("/med.png");
  expect(rutaLogoEmpresa("Mediterra Holding")).toBe("/med.png");
  expect(rutaLogoEmpresa("Osiris Plant Management")).toBe("/osiris-logo.jpg");
  expect(rutaLogoEmpresa("Allpa Farms Chile")).toBe("/allpa-chile-logo.png");
  expect(rutaLogoEmpresa("Allpa Farms")).toBe("/allpa-chile-logo.png");
  expect(rutaLogoEmpresa("Allpa Farms Perú")).toBe("/allpa-peru-logo.png");
  expect(rutaLogoEmpresa("Frisku Foods Perú")).toBe("/frisku.png");
  expect(rutaLogoEmpresa("Empresa inexistente")).toBeNull();
  // todos los archivos existen
  ["Mediterra", "Allegria Foods", "Allegria Service", "Frisku Foods", "Osiris", "Integrity Farms", "Allpa Farms", "Allpa Farms Perú"]
    .forEach(e => expect(fs.existsSync(path.join(__dirname, "../../public", rutaLogoEmpresa(e)))).toBe(true));
});

test("tamaños reales de PNG y JPEG; formato para jsPDF", () => {
  expect(tamanoPng(pub("med.png"))).toEqual({ ancho: 269, alto: 152 });
  expect(tamanoImagen(pub("osiris-logo.jpg"))).toEqual({ ancho: 2127, alto: 774 });
  expect(tamanoPng(pub("osiris-logo.jpg"))).toBeNull();
  expect(formatoDataUrl("data:image/jpeg;base64,xx")).toBe("JPEG");
  expect(formatoDataUrl("data:image/png;base64,xx")).toBe("PNG");
});

async function libroMinimo() {
  const z = new JSZip();
  z.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>`);
  z.file("xl/worksheets/sheet1.xml", `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData/><mergeCells count="1"><mergeCell ref="A1:D1"/></mergeCells></worksheet>`);
  return z;
}

test("agrega el logo a la derecha, con su proporción, sin tocar las celdas", async () => {
  const z = await libroMinimo();
  const antes = await z.file("xl/worksheets/sheet1.xml").async("string");
  expect(await agregarLogoHoja(z, { bytes: pub("osiris-logo.jpg"), colWidths: [30, 12, 12, 40], altoPt: 50 })).toBe(true);
  const hoja = await z.file("xl/worksheets/sheet1.xml").async("string");
  expect(hoja).toBe(antes.replace("</worksheet>", '<drawing r:id="rIdLogo1"/></worksheet>'));   // solo se agrega el dibujo
  const dib = await z.file("xl/drawings/drawing1.xml").async("string");
  const [, col] = /<xdr:col>(\d+)<\/xdr:col>/.exec(dib);
  const [, cx, cy] = /<xdr:ext cx="(\d+)" cy="(\d+)"/.exec(dib);
  expect(Number(cy)).toBe(50 * 12700);
  expect(Number(cx) / Number(cy)).toBeCloseTo(2127 / 774, 3);                                // sin deformar
  expect(Number(col)).toBe(3);                                                                // hoja angosta: en la última columna
  expect(z.file("xl/media/logo_empresa.jpeg")).toBeTruthy();
  const ct = await z.file("[Content_Types].xml").async("string");
  expect(ct).toMatch(/Extension="jpeg" ContentType="image\/jpeg"/);
  expect(ct).toMatch(/drawings\/drawing1\.xml/);
  expect(await z.file("xl/worksheets/_rels/sheet1.xml.rels").async("string")).toMatch(/Target="\.\.\/drawings\/drawing1\.xml"/);
});

test("imagen ilegible: no toca el archivo", async () => {
  const z = await libroMinimo();
  const antes = await z.file("xl/worksheets/sheet1.xml").async("string");
  expect(await agregarLogoHoja(z, { bytes: new Uint8Array([1, 2, 3]), colWidths: [10] })).toBe(false);
  expect(await z.file("xl/worksheets/sheet1.xml").async("string")).toBe(antes);
  expect(z.file("xl/drawings/drawing1.xml")).toBeNull();
});

test("hoja ancha: el logo queda dentro de la primera pantalla y a la derecha del título", async () => {
  const z = await libroMinimo();
  const anchos = Array(20).fill(14);                                                           // 20 columnas de ~103 px
  await agregarLogoHoja(z, { bytes: pub("med.png"), colWidths: anchos, altoPt: 50, minIzquierdaPx: 450 });
  const dib = await z.file("xl/drawings/drawing1.xml").async("string");
  const col = Number(/<xdr:col>(\d+)<\/xdr:col>/.exec(dib)[1]);
  const off = Number(/<xdr:colOff>(\d+)<\/xdr:colOff>/.exec(dib)[1]) / 9525;
  const cx = Number(/<xdr:ext cx="(\d+)"/.exec(dib)[1]) / 9525;
  const izq = col * 103 + off;
  expect(izq).toBeGreaterThanOrEqual(450);                                                     // no tapa el título
  expect(izq + cx).toBeLessThanOrEqual(980);                                                   // visible sin desplazarse
});
