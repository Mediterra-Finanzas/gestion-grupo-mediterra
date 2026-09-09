/* Lo que se prueba aca es el RECHAZO. Un restore que acepta un lote a medias
 * produce un padron que parece correcto, y eso es peor que no restaurar. */
const { restaurarLote, MOTIVO } = require("../restaurarLote.js");
const { planificar, aplicar, resumen, CLASE } = require("../recuperacion.js");

const sha256 = (b) => require("crypto").createHash("sha256").update(b).digest("hex");
const bytesA = Buffer.from(JSON.stringify({ marca: "A" }), "utf8");
const bytesB = Buffer.from(JSON.stringify({ marca: "B" }), "utf8");
const CORR = "11111111-2222-3333-4444-555555555555";
const filaOk = () => ({
  lote_id: "L1", estado: "READY",
  objeto_a: "L1/a.enc", objeto_b: "L1/b.enc",
  sha_a: sha256(bytesA), sha_b: sha256(bytesB),
});
const almacen = { "L1/a.enc": bytesA, "L1/b.enc": bytesB };
const bajar = async (r) => almacen[r] || null;
const claves = { A: "kA", B: "kB" };
const descifrar = async (sobre, clave) => {
  const esperado = sobre.marca === "A" ? "kA" : "kB";
  if (clave !== esperado) return { ok: false, motivo: "autenticacion_fallida" };
  return { ok: true, objeto: { marca: sobre.marca, correlationId: sobre.correlationId || CORR } };
};
const correr = (fila, extra = {}) => restaurarLote({ fila, bajar, sha256, descifrar, claves, ...extra });

describe("restaurarLote · rechazo de lotes incompletos", () => {
  test("lote completo restaura", async () => {
    const r = await correr(filaOk());
    expect(r.ok).toBe(true);
    expect(r.correlationId).toBe(CORR);
  });

  test.each([
    ["lote inexistente", null, MOTIVO.LOTE_DESCONOCIDO],
    ["estado CREATING", { ...filaOk(), estado: "CREATING" }, MOTIVO.NO_PUBLICADO],
    ["estado FAILED", { ...filaOk(), estado: "FAILED" }, MOTIVO.FALLIDO],
    ["sin objeto_b registrado", { ...filaOk(), objeto_b: null }, MOTIVO.REGISTRO_INCOMPLETO],
    ["sin sha_a registrado", { ...filaOk(), sha_a: null }, MOTIVO.REGISTRO_INCOMPLETO],
    ["objeto ausente en Storage", { ...filaOk(), objeto_b: "L1/no-existe.enc" }, MOTIVO.OBJETO_AUSENTE],
    ["sha registrado distinto del real", { ...filaOk(), sha_a: "0".repeat(64) }, MOTIVO.SHA_NO_COINCIDE],
  ])("%s -> rechaza", async (_, fila, motivo) => {
    const r = await correr(fila);
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe(motivo);
  });

  test("A y B de ejecuciones distintas -> rechaza", async () => {
    const otro = { ...almacen, "L1/b.enc": Buffer.from(JSON.stringify({ marca: "B", correlationId: "otro" }), "utf8") };
    const fila = { ...filaOk(), sha_b: sha256(otro["L1/b.enc"]) };
    const r = await restaurarLote({ fila, bajar: async (x) => otro[x] || null, sha256, descifrar, claves });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe(MOTIVO.CORRELATION_DISPAR);
  });

  test("clave equivocada -> rechaza, no restaura a medias", async () => {
    const r = await correr(filaOk(), { claves: { A: "kA", B: "kMALA" } });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe(MOTIVO.DESCIFRADO_FALLIDO);
    expect(r.detalle).toContain("B");
  });
});

describe("recuperacion · las escrituras posteriores del equipo sobreviven", () => {
  const t0 = "2026-09-08T10:00:00.000Z", t1 = "2026-09-09T10:00:00.000Z";
  const respaldo = [
    { id: "a", value: { n: 1 }, updated_at: t0 },
    { id: "b", value: { n: 1 }, updated_at: t0 },
    { id: "c", value: { n: 1 }, updated_at: t0 },
  ];
  const vivo = [
    { id: "b", value: { n: 99 }, updated_at: t1 },   // el equipo edito despues
    { id: "c", value: { n: 1 }, updated_at: t0 },    // igual
    { id: "d", value: { n: 7 }, updated_at: t1 },    // creada despues
  ];                                                  // 'a' se perdio

  test("clasificacion", () => {
    const p = planificar({ respaldo, vivo });
    const de = (id) => p.find((x) => x.id === id);
    expect(de("a").clase).toBe(CLASE.AUSENTE_EN_VIVO);
    expect(de("b").clase).toBe(CLASE.VIVO_MAS_NUEVO);
    expect(de("c").clase).toBe(CLASE.IGUAL);
    expect(de("d").clase).toBe(CLASE.VIVO_MAS_NUEVO);
    expect(resumen(p).insertar).toBe(1);
  });

  test("solo se escribe la fila perdida", async () => {
    const escritas = [];
    await aplicar({ plan: planificar({ respaldo, vivo }), respaldo, escribirFila: (r) => escritas.push(r.id) });
    expect(escritas).toEqual(["a"]);
  });

  test("el plan nunca propone borrar", () => {
    expect(planificar({ respaldo, vivo }).some((p) => p.accion === "borrar")).toBe(false);
  });

  test("un conflicto real exige decision explicita por id", async () => {
    const viejo = [{ id: "b", value: { n: 0 }, updated_at: "2026-09-07T10:00:00.000Z" }];
    const plan = planificar({ respaldo: [respaldo[1]], vivo: viejo });
    expect(plan[0].clase).toBe(CLASE.RESPALDO_MAS_NUEVO);
    const sin = []; await aplicar({ plan, respaldo, escribirFila: (r) => sin.push(r.id) });
    expect(sin).toEqual([]);                                    // no se arrastra solo
    const con = []; await aplicar({ plan, respaldo, escribirFila: (r) => con.push(r.id), idsForzados: ["b"] });
    expect(con).toEqual(["b"]);                                 // solo si alguien lo nombra
  });
});
