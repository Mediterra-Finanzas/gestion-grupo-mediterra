/* eslint-disable */
// Tests versionados de la lógica de Liquidaciones Frisku (auditables en el repo).
// Correr desde el checkout principal: `npm test friskuLiquidacionesLogic`
// (Jest no crawlea bajo .claude/worktrees por el rootDir con backslash; ver informe).
import {
  pasaFiltroContenedor,
  esLiquidacionActiva, liqsActivasOE, hayLiquidacionActiva,
  upsertPorId,
  normalizarEmail, identidadUsuario,
  liqDraftKey, entityBaseDe, draftEntityKey, clavesBorradorDeOp,
  prefijoBorradorEntidad, clavesRecuperablesDeEntidad,
  evaluarConfirmacion,
} from "./friskuLiquidacionesLogic";
import { fusionarPorId } from "./friskuPersistencia";

// 1 — filtro por contenedor
describe("1. filtro por contenedor", () => {
  it("parcial, case-insensitive, trim; oe null no rompe", () => {
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
    expect(liqsActivasOE(liqs, "oe1", "A").map((l) => l.id)).toEqual(["B"]);
  });
  it("inactivos/anulados no cuentan (semántica real si existiera)", () => {
    const liqs = [{ id: "A", oeId: "oe1", eliminada: true }, { id: "B", oeId: "oe1", estado: "anulada" }];
    expect(hayLiquidacionActiva(liqs, "oe1", "draft")).toBe(false);
    expect(esLiquidacionActiva({ id: "X", estado: "pagada" })).toBe(true);
  });
});

// 4 — bloqueo de duplicado (UI)
describe("4. bloqueo de duplicado", () => {
  it("hayLiquidacionActiva gobierna el bloqueo al crear; editar no se bloquea a sí misma", () => {
    const liqs = [{ id: "A", oeId: "oe1", estado: "enviada" }];
    expect(hayLiquidacionActiva(liqs, "oe1", "draftNuevo")).toBe(true);
    expect(hayLiquidacionActiva(liqs, "oe1", "A")).toBe(false);
  });
});

// 5 — id idempotente
describe("5. upsert idempotente por id", () => {
  it("agrega; doble guardado no duplica; edición reemplaza en su lugar", () => {
    expect(upsertPorId([{ id: "A" }], { id: "N" }).map((l) => l.id)).toEqual(["A", "N"]);
    let r = upsertPorId([{ id: "A" }], { id: "D", v: 1 });
    r = upsertPorId(r, { id: "D", v: 1 });
    expect(r.map((l) => l.id)).toEqual(["A", "D"]);
    const e = upsertPorId([{ id: "A", v: 1 }, { id: "B", v: 2 }], { id: "B", v: 9 });
    expect(e.map((l) => l.id)).toEqual(["A", "B"]);
    expect(e.find((l) => l.id === "B").v).toBe(9);
    expect(e.find((l) => l.id === "A").v).toBe(1);
  });
});

// 6 — confirmación correcta
describe("6. confirmación correcta", () => {
  it("ok + item con la versión enviada -> guardado (incl. fusión autoritativa)", () => {
    const op = { id: "L1", version: "V", entityKey: "L1#i1" };
    expect(evaluarConfirmacion({ ok: true, valor: [{ id: "L1", fechaActualizacion: "V" }] }, op).estado).toBe("guardado");
    const r = { ok: true, fusionado: true, valor: [{ id: "OTRO", fechaActualizacion: "x" }, { id: "L1", fechaActualizacion: "V" }] };
    const res = evaluarConfirmacion(r, op);
    expect(res.estado).toBe("guardado");
    expect(res.fusionado).toBe(true);
  });
});

// 7 — error conserva (estado error)
describe("7. error -> no confirmado", () => {
  it("red/http/null -> error", () => {
    const op = { id: "L1", version: "V" };
    expect(evaluarConfirmacion({ ok: false, motivo: "red" }, op).estado).toBe("error");
    expect(evaluarConfirmacion({ ok: false, motivo: "http", status: 400 }, op).estado).toBe("error");
    expect(evaluarConfirmacion(null, op).estado).toBe("error");
  });
});

// 8 — conflicto conserva
describe("8. conflicto del mismo ítem", () => {
  it("conflicto_item con mi id -> conflicto; ok con otra versión -> conflicto; otro ítem -> error", () => {
    const op = { id: "L1", version: "V" };
    expect(evaluarConfirmacion({ ok: false, motivo: "conflicto_item", conflictos: ["L1"] }, op).estado).toBe("conflicto");
    expect(evaluarConfirmacion({ ok: true, valor: [{ id: "L1", fechaActualizacion: "OTRA" }] }, op).estado).toBe("conflicto");
    expect(evaluarConfirmacion({ ok: false, motivo: "conflicto_item", conflictos: ["OTRO"] }, op).estado).toBe("error");
  });
});

// 9 — limpiar sólo el borrador de la op confirmada (por entityKey exacta de instancia)
describe("9. clave de borrador de la op confirmada", () => {
  it("devuelve sólo la entityKey exacta de la op", () => {
    expect(clavesBorradorDeOp({ id: "L1", entityKey: "L1#iA" })).toEqual(["L1#iA"]);
    expect(clavesBorradorDeOp({ id: "L1" })).toEqual([]);
    expect(clavesBorradorDeOp(null)).toEqual([]);
  });
});

// 10 — no borrar borrador de otra entidad/instancia
describe("10. no afecta otras entidades/instancias", () => {
  it("la clave de la op no incluye otras instancias ni OE", () => {
    const claves = clavesBorradorDeOp({ id: "L1", entityKey: "new::oe1#iA" });
    expect(claves.includes("new::oe1#iB")).toBe(false);
    expect(claves.includes("new::oe2#iA")).toBe(false);
    expect(claves).toEqual(["new::oe1#iA"]);
  });
});

// 11 — clave aislada por usuario+entidad+instancia
describe("11. clave de borrador aislada", () => {
  it("distinto usuario, entidad o instancia => distinta clave", () => {
    expect(liqDraftKey("a@x.cl", "L1#i1")).not.toBe(liqDraftKey("b@x.cl", "L1#i1"));
    expect(draftEntityKey("new::oe1", "iA")).not.toBe(draftEntityKey("new::oe1", "iB"));
    expect(draftEntityKey("new::oe1", "iA")).toBe("new::oe1#iA");
  });
});

// 12 — identidad estable (email) o null; nunca anon compartido
describe("12. identidad estable", () => {
  it("email normalizado; sin email -> null (borrador off, nunca anon)", () => {
    expect(identidadUsuario({ email: "  Ahuerta@GrupoMediterra.CL " })).toBe("ahuerta@grupomediterra.cl");
    expect(identidadUsuario({ nombre: "Sin Email" })).toBe(null);
    expect(identidadUsuario(null)).toBe(null);
    expect(normalizarEmail(undefined)).toBe("");
  });
});

// 13 — dos usuarios, registros distintos: mi ítem sobrevive -> guardado
describe("13. dos usuarios, registros distintos", () => {
  it("ítem propio presente en el valor fusionado -> guardado", () => {
    const op = { id: "MIO", version: "V" };
    const r = { ok: true, fusionado: true, valor: [{ id: "AJENO", fechaActualizacion: "a" }, { id: "MIO", fechaActualizacion: "V" }] };
    expect(evaluarConfirmacion(r, op).estado).toBe("guardado");
  });
});

// 14 — dos usuarios, mismo registro -> conflicto (no LWW)
describe("14. dos usuarios, mismo registro", () => {
  it("segundo guardado del mismo id -> conflicto", () => {
    const op = { id: "MISMO", version: "V2" };
    const r = { ok: false, motivo: "conflicto_item", conflictos: ["MISMO"] };
    expect(evaluarConfirmacion(r, op).estado).toBe("conflicto");
  });
});

// 15 — ausencia de dato ≠ guardado; superseded = pendiente
describe("15. ausencia/pendiente no es guardado", () => {
  it("ok sin mi ítem -> conflicto; superseded -> pendiente; entityBaseDe", () => {
    const op = { id: "L1", version: "V" };
    expect(evaluarConfirmacion({ ok: true, valor: [{ id: "OTRO", fechaActualizacion: "x" }] }, op).estado).toBe("conflicto");
    expect(evaluarConfirmacion({ ok: true, superseded: true }, op).estado).toBe("pendiente");
    expect(entityBaseDe({ id: "L1" }, "oeX")).toBe("L1");
    expect(entityBaseDe(null, "oe5")).toBe("new::oe5");
    expect(entityBaseDe(null, "")).toBe(null);
  });
});

// 16 — BRECHA 1: carrera dos IDs distintos misma OE (fusionarPorId REAL conserva ambos)
describe("16. carrera misma OE / dos IDs (brecha documentada)", () => {
  it("fusionarPorId preserva ambas liquidaciones -> DOS activas para OE X", () => {
    const base = [];                                   // A y B parten vacíos
    const A = { id: "A1", oeId: "X" };                 // Usuario A
    const B = { id: "B1", oeId: "X" };                 // Usuario B (id distinto, misma OE)
    // A guarda primero -> servidor = [A]. B guarda con base vieja []:
    const r = fusionarPorId(base, [B], [A]);
    expect(r.ok).toBe(true);
    expect(r.conflictos).toEqual([]);                  // ids distintos -> NO hay conflicto de ítem
    const activasX = r.valor.filter((l) => l.oeId === "X");
    expect(activasX.length).toBe(2);                   // <-- brecha: dos activas para la misma OE
    // La unicidad por oeId NO la puede garantizar la fusión por id (requiere cambio compartido).
  });
});

// 17 — BRECHA 2 fix: dos pestañas misma OE usan claves distintas
describe("17. dos pestañas, misma OE: claves de borrador distintas", () => {
  it("misma base, instancias distintas -> localStorage keys distintas", () => {
    const base = entityBaseDe(null, "oe1");            // new::oe1
    const kA = liqDraftKey("u@x.cl", draftEntityKey(base, "iA"));
    const kB = liqDraftKey("u@x.cl", draftEntityKey(base, "iB"));
    expect(kA).not.toBe(kB);
    expect(kA).toContain("new::oe1#iA");
    expect(kB).toContain("new::oe1#iB");
  });
});

// 18 — confirmar pestaña A NO elimina el borrador de pestaña B
describe("18. confirmar A no borra el borrador de B", () => {
  it("la limpieza toca sólo la entityKey de A", () => {
    const user = "u@x.cl", base = "new::oe1";
    const keyA = liqDraftKey(user, draftEntityKey(base, "iA"));
    const keyB = liqDraftKey(user, draftEntityKey(base, "iB"));
    // op de A confirmada:
    const opA = { id: "A1", version: "V", entityKey: draftEntityKey(base, "iA") };
    const aBorrar = clavesBorradorDeOp(opA).map((ek) => liqDraftKey(user, ek));
    expect(aBorrar).toEqual([keyA]);
    expect(aBorrar.includes(keyB)).toBe(false);        // borrador de B intacto
  });
});

// 19 — recuperables: encuentra OTRAS instancias, excluye la propia; aislado por usuario
describe("19. descubrir borradores recuperables por instancia", () => {
  it("lista otras instancias de la misma entidad, no la propia ni otros usuarios/OE", () => {
    const user = "u@x.cl", base = "new::oe1";
    const keys = [
      liqDraftKey(user, draftEntityKey(base, "iA")),   // otra instancia (recuperable)
      liqDraftKey(user, draftEntityKey(base, "iB")),   // otra instancia (recuperable)
      liqDraftKey(user, draftEntityKey(base, "iSelf")),// la propia (excluida)
      liqDraftKey(user, draftEntityKey("new::oe2", "iA")), // otra OE (excluida)
      liqDraftKey("otro@x.cl", draftEntityKey(base, "iA")),  // otro usuario (excluida)
      "clave_random",
    ];
    const rec = clavesRecuperablesDeEntidad(keys, user, base, "iSelf");
    expect(rec.sort()).toEqual([
      liqDraftKey(user, draftEntityKey(base, "iA")),
      liqDraftKey(user, draftEntityKey(base, "iB")),
    ].sort());
    expect(prefijoBorradorEntidad(user, base)).toBe(`frisku_liq_draft_v1::${user}::new::oe1#`);
  });
});
