/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// HOTFIX auto-v4 · PRUEBA SOBRE CLON PRODUCTIVO SANITIZADO
//
// Los diez puntos del §4, con la forma real de los datos productivos y ningún dato
// productivo adentro: el clon se construye acá, con la misma estructura y valores
// inventados. Un fixture con datos reales sería exactamente el problema que este
// hotfix existe para resolver.
//
// LO QUE MIDE, y por qué cada cosa:
//   · el generador VIGENTE copia credenciales — sin esta contraprueba, el verde del
//     nuevo no significa nada, porque no se sabe si el control detecta algo;
//   · el NUEVO no las copia y conserva el negocio;
//   · dos sesiones simultáneas no producen dos copias distintas ni dos éxitos.
// ═══════════════════════════════════════════════════════════════════════════════
const path = require("path");
const { createHash } = require("crypto");
const G = require(path.resolve(__dirname, "..", "backupGenerador.js"));
const { sha256Hex } = require(path.resolve(__dirname, "..", "sha256Sync.js"));

const digest = (s) => createHash("sha256").update(String(s)).digest("hex");

// ── clon sanitizado con la FORMA productiva ────────────────────────────────────
function clon() {
  return [
    { id: "main", value: {
        mes: 9, anio: 2026,
        estados: { t1: true }, comentarios: { t1: "ok" }, tareasConfig: {}, supervisores: {},
        usuarios: [
          { nombre: "Persona Uno", email: "uno@ejemplo.invalid", rol: "admin", cargo: "CFO",
            modulos: ["tareas"], pin: "112233", esCFO: true, tab_permisos: {}, desactivado: false },
          { nombre: "Persona Dos", email: "dos@ejemplo.invalid", rol: "editor", cargo: "Analista",
            modulos: ["tareas"], pin: "445566", desactivado: false },
        ] } },
    { id: "pins", value: { "Persona Uno_h": JSON.stringify({ v: 1, iter: 100000, salt: "a".repeat(32), hash: "b".repeat(64) }),
                           "Persona Uno_tel": "+56900000000", "Persona Dos_hist": "[]" } },
    { id: "finanzas", value: { flujo: [{ mes: 1, monto: 1000 }] } },
    { id: "osiris", value: { contratos: [{ id: "ct_1", nPlantas: 100 }] } },
    { id: "frisku", value: { clientes: [{ id: "c1" }], embarques: [] } },
    { id: "osiris_flags", value: { target_reads: "blob", osiris_frozen: true } },
    { id: "eeff_allegria_foods_2026_01", value: { balance: [{ cuenta: "1101", saldo: 500 }] } },
    { id: "maestro_paises", value: [{ codigo: "CL" }] },
    { id: "audit_log", value: { eventos: [] } },
    { id: "backup_2026-09-01", value: { fecha: "x", version: "auto-v3" } },
  ];
}

// El generador VIGENTE, reproducido tal cual: lista negra sobre el `id`.
function generadorVigente(filas) {
  const out = { fecha: "x", version: "auto-v3" };
  filas.filter((f) => !/^backup_/.test(f.id) && !/^main_pre_restore_/.test(f.id) && f.id !== "audit_log")
       .forEach((f) => { out[f.id] = f.value; });
  return out;
}

describe("hotfix auto-v4 · sobre clon productivo sanitizado", () => {
  // 1 y 2 · el generador vigente copia credenciales, y el detector lo ve
  test("1-2 · el generador VIGENTE copia credenciales y el detector las encuentra", () => {
    const viejo = generadorVigente(clon());
    expect(viejo.pins).toBeDefined();
    expect(viejo.main.usuarios[0].pin).toBe("112233");
    expect(G.detectarSensibles(viejo).length).toBeGreaterThan(0);
  });

  // 3 y 4 · auto-v4 no emite credenciales
  test("3-4 · auto-v4 no copia `pins`, ni PIN dentro de `main`, y el detector da cero", () => {
    const r = G.construirRespaldo(clon(), { digest, version: "auto-v4" });
    expect(r.ok).toBe(true);
    expect(r.payload.pins).toBeUndefined();
    for (const u of r.payload.main.usuarios) expect(u.pin).toBeUndefined();
    expect(G.detectarSensibles(r.payload)).toEqual([]);
  });

  // 5 · cobertura de negocio
  test("5 · conserva todos los recursos de negocio del clon", () => {
    const r = G.construirRespaldo(clon(), { digest, version: "auto-v4" });
    for (const id of ["main", "finanzas", "osiris", "frisku", "osiris_flags",
                      "eeff_allegria_foods_2026_01", "maestro_paises"]) {
      expect([id, id in r.payload]).toEqual([id, true]);
    }
    // y lo de negocio de `main` sobrevive al saneo
    expect(r.payload.main.estados).toEqual({ t1: true });
    expect(r.payload.main.usuarios.map((u) => u.nombre)).toEqual(["Persona Uno", "Persona Dos"]);
  });

  // 6 · segunda ejecución idempotente
  test("6 · dos corridas sobre la misma fuente dan el mismo contenido y la misma huella", () => {
    const a = G.construirRespaldo(clon(), { digest, version: "auto-v4", ahora: () => "T" });
    const b = G.construirRespaldo(clon(), { digest, version: "auto-v4", ahora: () => "T" });
    expect(G.canonico(b.payload)).toBe(G.canonico(a.payload));
    expect(b.manifiesto.huellaTotal).toBe(a.manifiesto.huellaTotal);
  });

  // 7, 8 y 9 · concurrencia: alta única, mismo id, sin sobrescritura
  test("7-9 · dos sesiones el mismo día: un solo ganador, sin sobrescritura", async () => {
    // Base falsa con la semántica de `Prefer: resolution=ignore-duplicates`: la clave
    // primaria decide, y el perdedor recibe cero filas en vez de pisar al ganador.
    const tabla = new Map();
    const insertarSiNoExiste = async (id, value) => {
      if (tabla.has(id)) return { ok: true, filas: [] };          // perdió la carrera
      tabla.set(id, value);
      return { ok: true, filas: [{ id }] };                        // ganó
    };
    const fecha = "2026-09-03";
    const backupId = `backup_${fecha}`;
    const sesion = async (marca) => {
      const r = G.construirRespaldo(clon(), { digest, version: "auto-v4", ahora: () => marca });
      return insertarSiNoExiste(backupId, { version: "auto-v4", marca, ...r.payload });
    };
    const [s1, s2] = await Promise.all([sesion("A"), sesion("B")]);
    const ganadores = [s1, s2].filter((x) => x.filas.length === 1);
    expect(ganadores.length).toBe(1);                              // exactamente un éxito
    expect(tabla.size).toBe(1);                                    // un solo backup_id
    expect(tabla.get(backupId).version).toBe("auto-v4");
    // y el contenido guardado es el de quien ganó, sin mezclas
    expect(["A", "B"]).toContain(tabla.get(backupId).marca);
  });

  test("7b · el mecanismo del generador VIGENTE sí se pisa (contraprueba de la carrera)", async () => {
    // `resolution=merge-duplicates` con leer-y-después-escribir: los dos ven "no existe",
    // los dos escriben, el segundo pisa al primero y AMBOS declaran éxito.
    const tabla = new Map();
    const upsert = async (id, value) => { tabla.set(id, value); return { filas: [{ id }] }; };
    // La carrera REAL: las dos pestañas hacen su GET antes de que cualquiera escriba.
    // Intercalar con Promise.all no la reproduce, porque cada función corre entera
    // hasta su primer await; hay que separar la lectura de la escritura a mano.
    const leer = () => tabla.has("backup_x");
    const vistoA = leer(), vistoB = leer();                        // ambas leen: no existe
    const escribir = async (marca, visto) => (visto ? { filas: [] } : upsert("backup_x", { marca }));
    const r = await Promise.all([escribir("A", vistoA), escribir("B", vistoB)]);
    expect(r.filter((x) => x.filas.length === 1).length).toBe(2);  // DOS éxitos declarados
    expect(tabla.size).toBe(1);                                     // sobre una sola fila
  });

  // 10 · restauración por módulo
  test("10 · cada módulo incluido se restaura idéntico a su origen saneado", () => {
    const filas = clon();
    const r = G.construirRespaldo(filas, { digest, version: "auto-v4" });
    const ver = G.verificarRespaldo(r.payload, r.manifiesto, digest);
    expect(ver.ok).toBe(true);
    const rest = G.restaurar(r.payload, r.manifiesto, digest);
    expect(rest.ok).toBe(true);
    for (const id of ["finanzas", "osiris", "frisku", "eeff_allegria_foods_2026_01"]) {
      const origen = filas.find((f) => f.id === id).value;
      expect([id, G.canonico(rest.filas.find((f) => f.id === id).value)]).toEqual([id, G.canonico(origen)]);
    }
  });

  // el digest del navegador es el mismo que el de node
  test("el sha256 síncrono del bundle coincide con node:crypto", () => {
    for (const s of ["", "abc", "ñandú", JSON.stringify(clon())]) {
      expect(sha256Hex(s)).toBe(createHash("sha256").update(s, "utf8").digest("hex"));
    }
  });
});
