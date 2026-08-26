/* SEC-HF1 · los dos invariantes del hotfix.
 *
 *   1. NO FUGA      · ningún PIN literal en la fuente ni en el bundle publicado.
 *   2. NO DESTRUYE  · el hotfix no modifica ni una credencial guardada.
 *
 * El segundo importa tanto como el primero. La versión anterior de este hotfix dejaba
 * `pin: ""` en `WORKERS_BASE`; como el merge hace `...wb` y el autosave escribe `usuarios`
 * en la fila `main`, ese vacío habría BORRADO el PIN almacenado de seis personas. Una
 * limpieza de frontend no puede convertirse en una modificación silenciosa de datos
 * productivos.
 *
 * Ningún PIN real aparece acá. Los sintéticos van partidos para que el propio detector de
 * fuga no los lea como literal.
 */
import fs from "fs";
import path from "path";
import { credencialPreservada } from "../credencialPreservada";

const RAIZ = path.resolve(__dirname, "..", "..", "..");
const PIN_FALSO = ["4", "8", "2", "9", "1", "3"].join("");

// ── el detector ────────────────────────────────────────────────────────────
const RE_PIN = /[{,\s]pin\s*:\s*["'][0-9]{4,8}["']/g;

function escanear(dirs, exts) {
  const hallazgos = [];
  const recorrer = (dir) => {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      const f = path.join(dir, e.name);
      if (e.isDirectory()) { recorrer(f); continue; }
      if (!exts.some((x) => e.name.endsWith(x))) continue;
      let txt;
      try { txt = fs.readFileSync(f, "utf8"); } catch (e2) { continue; }
      let m;
      RE_PIN.lastIndex = 0;
      while ((m = RE_PIN.exec(txt)) !== null) {
        // Se reporta DÓNDE, nunca QUÉ. Un hallazgo que incluye el valor convierte el
        // informe en una segunda copia del secreto.
        hallazgos.push({
          archivo: path.relative(RAIZ, f).replace(/\\/g, "/"),
          linea: txt.slice(0, m.index).split("\n").length,
        });
      }
    }
  };
  for (const d of dirs) recorrer(path.join(RAIZ, d));
  return hallazgos;
}

describe("SEC-HF1 · 1. no hay PIN literal en ninguna parte", () => {
  test("la fuente está limpia", () => {
    const h = escanear(["src", "api"], [".js", ".jsx", ".mjs", ".ts"])
      .filter((x) => !/__tests__/.test(x.archivo));
    expect(h.length === 0 ? "limpio"
      : "HAY " + h.length + ": " + h.map((x) => x.archivo + ":" + x.linea).join(", ")).toBe("limpio");
  });

  test("el bundle publicado y sus source maps están limpios", () => {
    const dir = path.join(RAIZ, "build", "static", "js");
    if (!fs.existsSync(dir)) {
      // Sin artefacto no se puede afirmar nada sobre él. Decir "0 hallazgos" sería mentir.
      expect(fs.existsSync(dir)).toBe(false);
      return;
    }
    const h = escanear([path.relative(RAIZ, dir)], [".js", ".map"]);
    expect(h.length === 0 ? "limpio"
      : "HAY " + h.length + " en " + [...new Set(h.map((x) => x.archivo))].join(", ")).toBe("limpio");
  });

  test("`WORKERS_BASE` no declara la clave `pin`", () => {
    const s = fs.readFileSync(path.join(RAIZ, "src", "App.jsx"), "utf8");
    const i = s.indexOf("const WORKERS_BASE");
    const bloque = s.slice(i, s.indexOf("\n];", i));
    expect(i).toBeGreaterThan(-1);
    expect((bloque.match(/\bpin\s*:/g) || []).length).toBe(0);
    expect((bloque.match(/nombre\s*:/g) || []).length).toBeGreaterThan(0);
  });

  // ── anti-vacuidad: el detector tiene que cazar lo que dice cazar ─────────
  test("ANTI-VACUIDAD · el detector encuentra un PIN sintético", () => {
    const tmp = path.join(RAIZ, "src", "__sec_hf1_sonda.js");
    fs.writeFileSync(tmp, "const w = [{ nombre: \"X\", pin: \"" + PIN_FALSO + "\" }];\nexport default w;\n");
    try {
      const h = escanear(["src"], [".js"]).filter((x) => /__sec_hf1_sonda/.test(x.archivo));
      expect(h.length).toBe(1);
      expect(Number.isInteger(h[0].linea) && h[0].linea > 0).toBe(true);
    } finally { fs.unlinkSync(tmp); }
  });

  test("NO FILTRA · el hallazgo dice dónde, nunca qué", () => {
    const tmp = path.join(RAIZ, "src", "__sec_hf1_sonda2.js");
    fs.writeFileSync(tmp, "const w = { pin: \"" + PIN_FALSO + "\" };\nexport default w;\n");
    try {
      const h = escanear(["src"], [".js"]).filter((x) => /__sec_hf1_sonda2/.test(x.archivo));
      expect(JSON.stringify(h).includes(PIN_FALSO)).toBe(false);
      expect(Object.keys(h[0]).sort()).toEqual(["archivo", "linea"]);
    } finally { fs.unlinkSync(tmp); }
  });
});

describe("SEC-HF1 · 2. el hotfix no modifica ninguna credencial", () => {
  test("la credencial guardada se preserva tal cual", () => {
    expect(credencialPreservada({ pin: PIN_FALSO })).toEqual({ pin: PIN_FALSO });
  });

  test("sin credencial guardada, no se inventa ninguna", () => {
    expect(credencialPreservada({ nombre: "X" })).toEqual({});
    expect(credencialPreservada(null)).toEqual({});
    expect(credencialPreservada(undefined)).toEqual({});
  });

  test("un `pin` vacío GUARDADO se preserva: descartarlo también sería destruir", () => {
    expect(credencialPreservada({ pin: "" })).toEqual({ pin: "" });
    expect(Object.prototype.hasOwnProperty.call(credencialPreservada({ pin: "" }), "pin")).toBe(true);
  });

  // ── el recorrido real: base estática + guardado → objeto fusionado ──────
  const fusionarComoApp = (wb, saved) => ({
    ...wb,
    ...credencialPreservada(saved),
    rol: saved.rol || wb.rol,
  });

  const SEIS = [1, 2, 3, 4, 5, 6].map((n) => ({
    nombre: "U" + n,
    email: "u" + n + "@ejemplo.invalid",
    pin: ["7", "7", "0", "0", String(n), String(n)].join(""),
    rol: "editor",
  }));
  // `WORKERS_BASE` después del hotfix: sin secreto.
  const BASE = SEIS.map((u) => ({ nombre: u.nombre, email: u.email, cargo: "C", rol: "editor" }));

  test("las seis credenciales sobreviven al merge y a la serialización del autosave", () => {
    const fusionados = BASE.map((wb, i) => fusionarComoApp(wb, SEIS[i]));
    // Lo que el autosave manda de verdad: `usuarios`, serializado.
    const persistido = JSON.parse(JSON.stringify({ usuarios: fusionados })).usuarios;
    const alterados = persistido.filter((u, i) => u.pin !== SEIS[i].pin);
    expect(alterados.length === 0 ? "Δ = 0" : alterados.length + " credenciales alteradas").toBe("Δ = 0");
    expect(persistido.length).toBe(6);
  });

  test("guardar dos veces sin cambios produce el mismo payload", () => {
    const uno = BASE.map((wb, i) => fusionarComoApp(wb, SEIS[i]));
    const dos = BASE.map((wb, i) => fusionarComoApp(wb, uno[i]));
    expect(JSON.stringify(dos)).toBe(JSON.stringify(uno));
  });

  // ── CONTRAPRUEBA: sin la preservación, el daño ocurre ───────────────────
  test("CONTRAPRUEBA · con `pin: \"\"` en la base estática, la credencial SE PIERDE", () => {
    const baseVacia = BASE.map((w) => ({ ...w, pin: "" }));
    const roto = baseVacia.map((wb, i) => ({ ...wb, rol: SEIS[i].rol }));
    expect(roto.every((u) => u.pin === "")).toBe(true);
    expect(roto.some((u, i) => u.pin !== SEIS[i].pin)).toBe(true);
  });

  test("CONTRAPRUEBA · sin `pin` en la base Y sin preservación, la credencial desaparece", () => {
    const roto = BASE.map((wb, i) => ({ ...wb, rol: SEIS[i].rol }));
    expect(roto.every((u) => u.pin === undefined)).toBe(true);
    const persistido = JSON.parse(JSON.stringify({ usuarios: roto })).usuarios;
    expect(persistido.every((u) => !Object.prototype.hasOwnProperty.call(u, "pin"))).toBe(true);
  });

  test("el merge de App.jsx usa la costura, no una copia suya", () => {
    const s = fs.readFileSync(path.join(RAIZ, "src", "App.jsx"), "utf8");
    expect(s.includes("credencialPreservada(saved)")).toBe(true);
    expect(s.includes('import { credencialPreservada }')).toBe(true);
  });
});
