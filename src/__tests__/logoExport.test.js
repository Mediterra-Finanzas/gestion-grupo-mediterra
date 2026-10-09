import fs from "fs";
import path from "path";
import { encajarLogo, medidasLogoPDF, tamanoJpeg } from "../diseno/logoExport.js";

const prop = (m) => m.w / m.h;

describe("logos en exportaciones: proporción real dentro de la caja", () => {
  test("encajarLogo nunca supera la caja y conserva la proporción", () => {
    const casos = [[2127, 774, 44, 16], [269, 152, 34, 22], [269, 152, 24, 13], [153, 93, 46, 22]];
    for (const [a, b, W, H] of casos) {
      const m = encajarLogo(a, b, W, H);
      expect(m.w).toBeLessThanOrEqual(W + 1e-9);
      expect(m.h).toBeLessThanOrEqual(H + 1e-9);
      expect(prop(m)).toBeCloseTo(a / b, 6);
      expect(Math.abs(m.w - W) < 1e-9 || Math.abs(m.h - H) < 1e-9).toBe(true);
    }
  });
  test("medidas inválidas → null; medidasLogoPDF cae a la caja si jsPDF falla", () => {
    expect(encajarLogo(0, 10, 5, 5)).toBeNull();
    expect(medidasLogoPDF({ getImageProperties: () => { throw new Error("x"); } }, "d", 10, 5)).toEqual({ w: 10, h: 5 });
    expect(medidasLogoPDF({ getImageProperties: () => ({ width: 200, height: 100 }) }, "d", 10, 10)).toEqual({ w: 10, h: 5 });
  });
  test("tamanoJpeg lee el logo real de Osiris (2127 × 774)", () => {
    const buf = new Uint8Array(fs.readFileSync(path.join(__dirname, "../../public/osiris-logo.jpg")));
    expect(tamanoJpeg(buf)).toEqual({ ancho: 2127, alto: 774 });
    expect(tamanoJpeg(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
