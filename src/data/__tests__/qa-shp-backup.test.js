/* SHARED PERSISTENCE · EL GENERADOR DE RESPALDOS, EJERCIDO.
 *
 * Se prueba el modulo REAL (`src/data/backupGenerador.js`), no un
 * sustituto. Los seis requisitos del encargo, cada uno con su caso positivo y su
 * negativo, y con el estado VULNERABLE reproducido para que el contraste se vea:
 *
 *   1 no copia PIN · 2 no copia hashes/salts/tokens · 3 no recrea copias sensibles
 *   4 preserva negocio recuperable · 5 manifest + checksum + restore
 *   6 falla cerrado ante un campo sensible NUEVO
 *
 * ANTI-VACUIDAD: el generador viejo (lista negra) se reproduce acá para demostrar que
 * las mismas filas producen un respaldo CON credenciales. Sin ese contraste, "el
 * respaldo sale limpio" no dice si es merito de la allowlist o de los datos de prueba.
 */
/* eslint-disable */
const path = require("path");
const { createHash } = require("crypto");

const G = require(path.resolve(__dirname, "..", "backupGenerador.js"));
const {
  construirRespaldo, verificarRespaldo, restaurar, detectarSensibles,
  sanearFila, reglaDe, canonico, ALLOWLIST, CLASE, MOTIVO,
} = G;

const digest = (s) => createHash("sha256").update(s).digest("hex");
const ahora = () => "2026-08-27T00:00:00.000Z";
const construir = (filas, allowlist) =>
  construirRespaldo(filas, { digest, ahora, allowlist: allowlist || ALLOWLIST });

/* ── las filas, con la forma real ─────────────────────────────────────────────
 * Ningun valor es real. `main` mezcla datos de Tareas con `usuarios[]`, que es donde
 * vive el PIN en claro; `pins` es el mapa de credenciales derivadas.
 * ───────────────────────────────────────────────────────────────────────────── */
const PIN = ["1", "2", "3", "4", "5", "6"].join("");   // armado, nunca literal
const FILAS = () => [
  { id: "main", value: {
      estados: { t1: "ok" },
      comentarios: { t1: "listo" },
      usuarios: [
        { nombre: "USR1", email: "u1@lab.invalid", rol: "admin", modulos: ["tareas"], activo: true, pin: PIN },
        { nombre: "USR2", email: "u2@lab.invalid", rol: "editor", modulos: ["finanzas"], activo: true, pin: PIN },
      ] } },
  { id: "pins", value: { USR1_h: { salt: "00", hash: "aa" }, USR2_h: { salt: "01", hash: "bb" } } },
  { id: "finanzas", value: { flujo: [1, 2, 3] } },
  { id: "maestro_paises", value: [{ codigo: "CL" }] },
  { id: "nominas_allegria_foods", value: { lineas: [] } },
  { id: "audit_log", value: [{ ev: "x" }] },
  { id: "backup_2026-08-26", value: { fecha: "ayer" } },
  { id: "main_pre_restore_20260616", value: { filas: { main: {} } } },
  { id: "modulo_nuevo_sin_declarar", value: { algo: 1 } },
];

/* ── el generador VIGENTE, reproducido para el contraste ───────────────────── */
function respaldoListaNegra(filas) {
  // `and=(id.not.like.backup_*, id.not.like.main_pre_restore_*, id.neq.audit_log)`
  const out = { fecha: ahora(), version: "auto-v3" };
  for (const f of filas) {
    if (f.id.startsWith("backup_")) continue;
    if (f.id.startsWith("main_pre_restore_")) continue;
    if (f.id === "audit_log") continue;
    out[f.id] = f.value;
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════ */

describe("SHP · backup · [V] el generador vigente copia credenciales", () => {
  const viejo = respaldoListaNegra(FILAS());

  test("la lista negra deja pasar `pins` entera", () => {
    expect(viejo.pins).toBeDefined();
  });
  test("y deja pasar el PIN en claro dentro de `main`", () => {
    expect(viejo.main.usuarios[0].pin).toBeDefined();
  });
  test("el detector encuentra las credenciales en ese respaldo", () => {
    const h = detectarSensibles(viejo);
    expect(h.length).toBeGreaterThan(0);
    expect(h.some((r) => r.includes("pin"))).toBe(true);
  });
  test("cubre un modulo nuevo automaticamente — que es su virtud y su defecto", () => {
    expect(viejo.modulo_nuevo_sin_declarar).toBeDefined();
  });
});

describe("SHP · backup · 1 y 2 · no copia PIN, hashes ni salts", () => {
  const r = construir(FILAS());

  test("el respaldo se construye", () => {
    expect(r.ok).toBe(true);
  });
  test("`pins` NO esta en el respaldo", () => {
    expect(r.payload.pins).toBeUndefined();
  });
  test("`main` SI esta, pero sin el PIN de nadie", () => {
    expect(r.payload.main).toBeDefined();
    for (const u of r.payload.main.usuarios) expect(u.pin).toBeUndefined();
  });
  test("y conserva lo que hace falta para reconstruir el padron", () => {
    const u = r.payload.main.usuarios[0];
    expect(u.nombre).toBe("USR1");
    expect(u.rol).toBe("admin");
    expect(u.modulos).toEqual(["tareas"]);
  });
  test("el detector no encuentra NADA sensible en el respaldo entero", () => {
    expect(detectarSensibles(r.payload)).toEqual([]);
  });
  test("el contraste: sobre las MISMAS filas, el generador viejo si las lleva", () => {
    expect(detectarSensibles(respaldoListaNegra(FILAS())).length).toBeGreaterThan(0);
  });
});

describe("SHP · backup · 3 · no recrea copias sensibles tras la limpieza", () => {
  const r = construir(FILAS());
  test("no copia respaldos previos", () => {
    expect(r.payload["backup_2026-08-26"]).toBeUndefined();
  });
  test("no copia el snapshot del incidente", () => {
    expect(r.payload["main_pre_restore_20260616"]).toBeUndefined();
  });
  test("no copia la auditoria", () => {
    expect(r.payload.audit_log).toBeUndefined();
  });
  test("y cada exclusion queda declarada con su motivo", () => {
    const ids = r.excluidos.map((e) => e.id);
    expect(ids).toContain("pins");
    expect(ids).toContain("backup_2026-08-26");
    expect(r.excluidos.find((e) => e.id === "pins").motivo).toBe(MOTIVO.CLASE_EXCLUIDA);
  });
});

describe("SHP · backup · 4 · el negocio queda recuperable", () => {
  const r = construir(FILAS());
  test("los recursos de negocio estan enteros", () => {
    expect(r.payload.finanzas).toEqual({ flujo: [1, 2, 3] });
    expect(r.payload.maestro_paises).toEqual([{ codigo: "CL" }]);
  });
  test("las familias por prefijo tambien", () => {
    expect(r.payload.nominas_allegria_foods).toEqual({ lineas: [] });
  });
  test("los datos de Tareas dentro de `main` se conservan", () => {
    expect(r.payload.main.estados).toEqual({ t1: "ok" });
    expect(r.payload.main.comentarios).toEqual({ t1: "listo" });
  });
});

describe("SHP · backup · el precio de la allowlist, declarado", () => {
  const r = construir(FILAS());
  test("un modulo NO declarado no se respalda", () => {
    expect(r.payload.modulo_nuevo_sin_declarar).toBeUndefined();
  });
  test("pero se REPORTA en voz alta (la omision tiene que doler antes, no despues)", () => {
    expect(r.noDeclarados).toContain("modulo_nuevo_sin_declarar");
    expect(r.manifiesto.noDeclarados).toContain("modulo_nuevo_sin_declarar");
  });
  test("y declararlo lo incorpora, sin tocar el codigo del generador", () => {
    const r2 = construir(FILAS(),
      ALLOWLIST.concat([{ id: "modulo_nuevo_sin_declarar", clase: CLASE.NEGOCIO, campos: "*" }]));
    expect(r2.payload.modulo_nuevo_sin_declarar).toEqual({ algo: 1 });
    expect(r2.noDeclarados).not.toContain("modulo_nuevo_sin_declarar");
  });
});

describe("SHP · backup · 6 · falla CERRADO ante un campo sensible nuevo", () => {
  test("un campo nuevo no declarado simplemente no se copia (primera capa)", () => {
    const filas = FILAS();
    filas[0].value.usuarios[0].token_recuperacion = "xyz";
    const r = construir(filas);
    expect(r.ok).toBe(true);
    expect(r.payload.main.usuarios[0].token_recuperacion).toBeUndefined();
  });

  test("y si la allowlist esta MAL ESCRITA y lo deja pasar, el respaldo se ABORTA", () => {
    // Segunda capa. La allowlist de abajo es demasiado ancha a proposito.
    const filas = FILAS();
    filas[0].value.usuarios[0].token_recuperacion = "xyz";
    const anchaDeMas = ALLOWLIST.map((r) =>
      r.id === "main"
        ? { ...r, arreglos: { usuarios: ["nombre", "email", "rol", "modulos", "activo", "token_recuperacion"] } }
        : r);
    const r = construir(filas, anchaDeMas);
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe(MOTIVO.SENSIBLE_SOBREVIVIO);
    expect(r.sensibles.some((x) => x.includes("token_recuperacion"))).toBe(true);
  });

  test("abortar significa NO emitir nada: ni payload ni manifiesto", () => {
    const filas = FILAS();
    filas[0].value.usuarios[0].secret_x = "z";
    const ancha = ALLOWLIST.map((r) =>
      r.id === "main" ? { ...r, arreglos: { usuarios: ["nombre", "secret_x"] } } : r);
    const r = construir(filas, ancha);
    expect(r.ok).toBe(false);
    expect(r.payload).toBeUndefined();
    expect(r.manifiesto).toBeUndefined();
  });

  test("[R] retirado el detector, el campo sensible entra y el respaldo sale 'bien'", () => {
    // Se reproduce el generador SIN la segunda capa: la allowlist ancha ya no la frena.
    const filas = FILAS();
    filas[0].value.usuarios[0].token_recuperacion = "xyz";
    const ancha = ALLOWLIST.map((r) =>
      r.id === "main"
        ? { ...r, arreglos: { usuarios: ["nombre", "token_recuperacion"] } }
        : r);
    const sinDetector = {};
    for (const f of filas) {
      const regla = reglaDe(f.id, ancha);
      if (!regla || regla.clase !== CLASE.NEGOCIO) continue;
      const { valor } = sanearFila(f.value, regla);
      if (valor !== null) sinDetector[f.id] = valor;
    }
    expect(detectarSensibles(sinDetector).length).toBeGreaterThan(0);   // el dato esta
    // …y sin la segunda capa nadie lo habria notado: ese es el punto del control.
  });

  test("el detector reconoce las familias de nombre sensible", () => {
    for (const k of ["pin", "password", "token", "hash", "salt", "jwt", "apiKey", "_temp"]) {
      expect(detectarSensibles({ x: { [k]: 1 } }).length).toBeGreaterThan(0);
    }
  });
  test("y no marca campos de negocio que se le parecen", () => {
    expect(detectarSensibles({ pintura: 1, tokenizado: 2, salto: 3, hashtag: 4 })).toEqual([]);
  });
});

describe("SHP · backup · 5 · manifest, checksum y restore", () => {
  const r = construir(FILAS());

  test("el manifiesto declara filas, bytes y huella por recurso", () => {
    expect(r.manifiesto.filas).toBe(Object.keys(r.payload).length);
    expect(r.manifiesto.recursos.length).toBe(r.manifiesto.filas);
    expect(r.manifiesto.bytesTotal).toBeGreaterThan(0);
    for (const x of r.manifiesto.recursos) expect(x.huella).toMatch(/^[0-9a-f]{64}$/);
  });
  test("la huella es REPRODUCIBLE (dos corridas, el mismo valor)", () => {
    expect(construir(FILAS()).manifiesto.huellaTotal).toBe(r.manifiesto.huellaTotal);
  });
  test("el canonico ordena las llaves (si no, la huella dependeria del orden)", () => {
    expect(canonico({ b: 1, a: 2 })).toBe(canonico({ a: 2, b: 1 }));
  });
  test("verificar un respaldo intacto da ok", () => {
    expect(verificarRespaldo(r.payload, r.manifiesto, digest).ok).toBe(true);
  });
  test("restaurar devuelve todas las filas", () => {
    const res = restaurar(r.payload, r.manifiesto, digest);
    expect(res.ok).toBe(true);
    expect(res.filas.length).toBe(r.manifiesto.filas);
  });
  test("y el negocio restaurado es identico al original", () => {
    const res = restaurar(r.payload, r.manifiesto, digest);
    expect(res.filas.find((f) => f.id === "finanzas").value).toEqual({ flujo: [1, 2, 3] });
  });

  test("[R] un respaldo ALTERADO no verifica", () => {
    const p = JSON.parse(JSON.stringify(r.payload));
    p.finanzas.flujo.push(99);
    const v = verificarRespaldo(p, r.manifiesto, digest);
    expect(v.ok).toBe(false);
    expect(v.motivo).toBe(MOTIVO.CHECKSUM);
    expect(v.recurso).toBe("finanzas");
  });
  test("[R] un respaldo al que le FALTA una fila no verifica", () => {
    const p = JSON.parse(JSON.stringify(r.payload));
    delete p.finanzas;
    expect(verificarRespaldo(p, r.manifiesto, digest).ok).toBe(false);
  });
  test("[R] un manifiesto manipulado tampoco cuela", () => {
    const m = JSON.parse(JSON.stringify(r.manifiesto));
    m.recursos[0].huella = "0".repeat(64);
    expect(verificarRespaldo(r.payload, m, digest).ok).toBe(false);
  });
  test("[R] y restaurar de un respaldo alterado NO devuelve datos", () => {
    const p = JSON.parse(JSON.stringify(r.payload));
    p.finanzas.flujo.push(99);
    const res = restaurar(p, r.manifiesto, digest);
    expect(res.ok).toBe(false);
    expect(res.filas).toBeUndefined();
  });
});

describe("SHP · backup · la resolucion de reglas", () => {
  test("el id exacto gana sobre el prefijo", () => {
    expect(reglaDe("nominas", ALLOWLIST).id).toBe("nominas");
  });
  test("el prefijo mas largo gana entre prefijos", () => {
    expect(reglaDe("finanzas_esc_123", ALLOWLIST).prefijo).toBe("finanzas_esc_");
  });
  test("lo no declarado no resuelve a ninguna regla", () => {
    expect(reglaDe("cualquier_cosa_nueva", ALLOWLIST)).toBeNull();
  });
  test("sin filas, no hay respaldo (no se emite uno vacio)", () => {
    expect(construir([]).ok).toBe(false);
    expect(construir([]).motivo).toBe(MOTIVO.SIN_FILAS);
  });
});
