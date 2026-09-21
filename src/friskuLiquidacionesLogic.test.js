/* eslint-disable */
// Tests versionados de la lógica pura de Liquidaciones Frisku.
// Ejecutar con el runner del proyecto (CRA/Jest): `npm test friskuLiquidacionesLogic`
// (Jest no corre bajo .claude/worktrees por el glob; correr desde el checkout principal.)
import {
  pasaFiltroContenedor,
  esLiquidacionActiva, liqsActivasOE, hayLiquidacionActiva,
  upsertPorId,
  normalizarEmail, identidadUsuario,
  liqDraftKey, entityKeyDe, clavesBorradorDeOp,
  evaluarConfirmacion,
} from "./friskuLiquidacionesLogic";

// 1 — filtro por contenedor
describe("1. filtro por contenedor", () => {
  it("parcial, case-insensitive, con trim; oe null no rompe", () => {
    expect(pasaFiltroContenedor({ numeroContenedor: "MSKU1234567" }, "1234")).toBe(true);
    expect(pasaFiltroContenedor({ numeroContenedor: "msku1234567" }, "  MSKU ")).toBe(true);
    expect(pasaFiltroContenedor({ numeroContenedor: "MSKU1" }, "ZZZ")).toBe(false);
    expect(pasaFiltroContenedor(null, "1")).toBe(false);
    expect(pasaFiltroContenedor({ numeroContenedor: "" }, "")).toBe(true);
  });
});

// 2 — OE sin liquidación
describe("2. OE sin liquidación", () => {
  it("no hay activa", () => {
    const liqs = [{ id: "A", oeId: "oe1", estado: "pagada" }];
    expect(hayLiquidacionActiva(liqs, "oe9", "draft")).toBe(false);
    expect(liqsActivasOE(liqs, "oe9", "draft")).toEqual([]);
  });
});

// 3 — OE con liquidación
describe("3. OE con liquidación", () => {
  it("detecta activa por oeId y excluye el propio borrador", () => {
    const liqs = [{ id: "A", oeId: "oe1" }, { id: "B", oeId: "oe1" }, { id: "C", oeId: "oe2" }];
    expect(liqsActivasOE(liqs, "oe1", "draftX").map((l) => l.id)).toEqual(["A", "B"]);
    expect(liqsActivasOE(liqs, "oe1", "A").map((l) => l.id)).toEqual(["B"]); // editando A
  });
  it("registros inactivos/anulados no cuentan (semántica real si existiera)", () => {
    const liqs = [{ id: "A", oeId: "oe1", eliminada: true }, { id: "B", oeId: "oe1", estado: "anulada" }];
    expect(hayLiquidacionActiva(liqs, "oe1", "draft")).toBe(false);
    expect(esLiquidacionActiva({ id: "X", estado: "pagada" })).toBe(true);
  });
});

// 4 — bloqueo de duplicado
describe("4. bloqueo de duplicado", () => {
  it("hayLiquidacionActiva gobierna el bloqueo al crear", () => {
    const liqs = [{ id: "A", oeId: "oe1", estado: "enviada" }];
    // al crear (draft nuevo) para oe1 -> bloquea
    expect(hayLiquidacionActiva(liqs, "oe1", "draftNuevo")).toBe(true);
    // editando la propia A -> NO se bloquea a sí misma
    expect(hayLiquidacionActiva(liqs, "oe1", "A")).toBe(false);
  });
});

// 5 — id idempotente
describe("5. upsert idempotente por id", () => {
  it("agrega nueva; doble guardado no duplica; edición reemplaza en su lugar", () => {
    expect(upsertPorId([{ id: "A" }], { id: "N" }).map((l) => l.id)).toEqual(["A", "N"]);
    let r = upsertPorId([{ id: "A" }], { id: "D", v: 1 });
    r = upsertPorId(r, { id: "D", v: 1 }); // reintento mismo id
    expect(r.map((l) => l.id)).toEqual(["A", "D"]);
    const e = upsertPorId([{ id: "A", v: 1 }, { id: "B", v: 2 }], { id: "B", v: 9 });
    expect(e.map((l) => l.id)).toEqual(["A", "B"]);
    expect(e.find((l) => l.id === "B").v).toBe(9);
    expect(e.find((l) => l.id === "A").v).toBe(1);
  });
});

// 6 — confirmación correcta
describe("6. confirmación correcta", () => {
  it("ok + item con la versión enviada -> guardado", () => {
    const op = { id: "L1", version: "2026-09-21T10:00:00.000Z", createKey: "new::oe1" };
    const r = { ok: true, valor: [{ id: "L1", fechaActualizacion: op.version }], fusionado: false };
    expect(evaluarConfirmacion(r, op).estado).toBe("guardado");
  });
  it("usa r.valor autoritativo (fusión) para confirmar", () => {
    const op = { id: "L1", version: "V", createKey: null };
    const r = { ok: true, fusionado: true, valor: [{ id: "OTRO", fechaActualizacion: "x" }, { id: "L1", fechaActualizacion: "V" }] };
    expect(evaluarConfirmacion(r, op).estado).toBe("guardado");
  });
});

// 7 — error conserva borrador (estado error, no guardado)
describe("7. error -> no confirmado", () => {
  it("red/http -> error", () => {
    const op = { id: "L1", version: "V" };
    expect(evaluarConfirmacion({ ok: false, motivo: "red" }, op).estado).toBe("error");
    expect(evaluarConfirmacion({ ok: false, motivo: "http", status: 400 }, op).estado).toBe("error");
    expect(evaluarConfirmacion(null, op).estado).toBe("error");
  });
});

// 8 — conflicto conserva borrador
describe("8. conflicto del mismo ítem", () => {
  it("conflicto_item con mi id -> conflicto", () => {
    const op = { id: "L1", version: "V" };
    const r = { ok: false, motivo: "conflicto_item", conflictos: ["L1"] };
    expect(evaluarConfirmacion(r, op).estado).toBe("conflicto");
  });
  it("ok pero mi ítem quedó con otra versión -> conflicto (no guardado)", () => {
    const op = { id: "L1", version: "V" };
    const r = { ok: true, valor: [{ id: "L1", fechaActualizacion: "OTRA" }] };
    expect(evaluarConfirmacion(r, op).estado).toBe("conflicto");
  });
  it("conflicto de OTRO ítem -> error reintentable (mi cambio no persistió)", () => {
    const op = { id: "L1", version: "V" };
    const r = { ok: false, motivo: "conflicto_item", conflictos: ["OTRO"] };
    expect(evaluarConfirmacion(r, op).estado).toBe("error");
  });
});

// 9 — limpiar sólo el borrador confirmado
describe("9. claves de borrador de la op confirmada", () => {
  it("devuelve sólo id + createKey de la op", () => {
    expect(clavesBorradorDeOp({ id: "L1", createKey: "new::oe1" })).toEqual(["L1", "new::oe1"]);
    expect(clavesBorradorDeOp({ id: "L1" })).toEqual(["L1"]);
    expect(clavesBorradorDeOp(null)).toEqual([]);
  });
});

// 10 — no borrar borrador de otra entidad
describe("10. no afecta otras entidades", () => {
  it("las claves de la op NO incluyen otras OE/ids", () => {
    const claves = clavesBorradorDeOp({ id: "L1", createKey: "new::oe1" });
    expect(claves.includes("L2")).toBe(false);
    expect(claves.includes("new::oe2")).toBe(false);
  });
});

// 11 — no borrar borrador de otra pestaña (namespace por clave exacta)
describe("11. clave de borrador aislada por usuario+entidad", () => {
  it("distinto usuario o entidad => distinta clave", () => {
    expect(liqDraftKey("a@x.cl", "L1")).not.toBe(liqDraftKey("b@x.cl", "L1"));
    expect(liqDraftKey("a@x.cl", "L1")).not.toBe(liqDraftKey("a@x.cl", "L2"));
  });
});

// 12 — no usar anon: identidad estable obligatoria
describe("12. identidad estable (email) o null", () => {
  it("email normalizado; sin email -> null (borrador deshabilitado, nunca anon)", () => {
    expect(identidadUsuario({ email: "  Ahuerta@GrupoMediterra.CL " })).toBe("ahuerta@grupomediterra.cl");
    expect(identidadUsuario({ nombre: "Sin Email" })).toBe(null);
    expect(identidadUsuario(null)).toBe(null);
    expect(normalizarEmail(undefined)).toBe("");
  });
  it("la clave nunca es anónima compartida", () => {
    // el llamador usa identidadUsuario(); null => no persiste. Aquí verificamos que
    // una clave construida con identidad real NO colisiona con la de otro real.
    const a = identidadUsuario({ email: "x@y.cl" });
    const b = identidadUsuario({ email: "z@y.cl" });
    expect(liqDraftKey(a, "L1")).not.toBe(liqDraftKey(b, "L1"));
  });
});

// 13 — merge de registros distintos (contrato lo reconoce como guardado)
describe("13. dos usuarios, registros distintos", () => {
  it("mi ítem sobrevive en el valor fusionado -> guardado", () => {
    const op = { id: "MIO", version: "V" };
    // el servidor tenía AJENO; la fusión preserva ambos
    const r = { ok: true, fusionado: true, valor: [{ id: "AJENO", fechaActualizacion: "a" }, { id: "MIO", fechaActualizacion: "V" }] };
    const res = evaluarConfirmacion(r, op);
    expect(res.estado).toBe("guardado");
    expect(res.fusionado).toBe(true);
  });
});

// 14 — conflicto del mismo registro (segundo recibe conflicto)
describe("14. dos usuarios, mismo registro", () => {
  it("segundo guardado del mismo id -> conflicto, no last-write-wins", () => {
    const op = { id: "MISMO", version: "V2" };
    const r = { ok: false, motivo: "conflicto_item", conflictos: ["MISMO"], valorServidor: [{ id: "MISMO", fechaActualizacion: "V1" }] };
    expect(evaluarConfirmacion(r, op).estado).toBe("conflicto");
  });
});

// 15 — ausencia de dato ≠ guardado
describe("15. ausencia de dato no es guardado", () => {
  it("ok pero mi ítem no está en el autoritativo -> conflicto (no guardado)", () => {
    const op = { id: "L1", version: "V" };
    expect(evaluarConfirmacion({ ok: true, valor: [{ id: "OTRO", fechaActualizacion: "x" }] }, op).estado).toBe("conflicto");
  });
  it("superseded -> pendiente (aún no confirmado; no limpiar borrador)", () => {
    const op = { id: "L1", version: "V" };
    expect(evaluarConfirmacion({ ok: true, superseded: true }, op).estado).toBe("pendiente");
  });
  it("entityKeyDe: edición usa id; creación usa new::oeId; sin oe -> null", () => {
    expect(entityKeyDe({ id: "L1" }, "oeX")).toBe("L1");
    expect(entityKeyDe(null, "oe5")).toBe("new::oe5");
    expect(entityKeyDe(null, "")).toBe(null);
  });
});
