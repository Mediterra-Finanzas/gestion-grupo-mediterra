/* eslint-disable */
/* HOTFIX B · matriz de autorización y comportamiento del endpoint dedicado.
 *
 * QUÉ PRUEBA ESTO Y QUÉ NO. Prueba el HANDLER: su matriz de autorización, la allowlist,
 * el alta única y que un cero de filas no se presente como éxito. NO prueba el
 * despliegue: la sesión server-side no tiene emisor vivo en producción (medido:
 * `/api/login` responde 410), así que el endpoint está BLOCKED BY AUTH y estas pruebas
 * usan una sesión simulada. Un verde acá no autoriza a desplegar, y decirlo es parte
 * del resultado.
 */
const path = require("path");

const RUTA_AUTH = path.resolve(__dirname, "..", "..", "..", "api", "_auth.js");
const RUTA_EP = path.resolve(__dirname, "..", "..", "..", "api", "osiris-backup.js");

// ── dobles ───────────────────────────────────────────────────────────────────
let sesionSimulada = null;
let baseSimulada = null;
let escrituras = [];
let logs = [];

// `jest.mock` se IZA por encima de TODO, incluido el require("path"), asi que el
// especificador tiene que ser un literal relativo. Dos intentos fallidos antes: con la
// constante y con path.resolve, ambos "Cannot access before initialization".
jest.mock("../../../api/_auth.js", () => ({
  SUPA_URL: "https://simulado.invalid",
  faltanSecretos: () => false,
  sesionDeRequest: () => global.__sesion,
  supaFetch: async (ruta, opts = {}) => global.__base(ruta, opts),
}));

const FILAS = [
  { id: "main", value: { mes: 9, anio: 2026, estados: { a: 1 },
      usuarios: [{ nombre: "N1", email: "n1@x.invalid", rol: "admin", cargo: "C", modulos: ["tareas"], pin: "112233" },
                 { nombre: "N2", email: "n2@x.invalid", rol: "editor", cargo: "C", modulos: ["tareas"], pin: "445566" }] } },
  { id: "pins", value: { "N1_h": "{\"v\":1,\"iter\":100000,\"salt\":\"aa\",\"hash\":\"bb\"}" } },
  { id: "finanzas", value: { flujo: [1, 2, 3] } },
  { id: "frisku", value: { clientes: [{ id: 1 }] } },
  { id: "eeff_x_2026_01", value: { total: 10 } },
  { id: "recurso_nunca_visto", value: { algo: 1 } },
  { id: "audit_log", value: { n: 1 } },
];

function baseOk({ yaExiste = false } = {}) {
  let existe = yaExiste;
  return async (ruta, opts = {}) => {
    if (opts.method === "POST") {
      escrituras.push(JSON.parse(opts.body));
      const creaAhora = !existe;
      existe = true;
      return { ok: true, status: creaAhora ? 201 : 200, json: async () => (creaAhora ? [{ id: "backup_x" }] : []) };
    }
    if (/id=eq\.backup_/.test(ruta)) {
      return { ok: true, status: 200, json: async () => (existe ? [{ id: "backup_x" }] : []) };
    }
    return { ok: true, status: 200, json: async () => FILAS };
  };
}

function req(metodo = "POST", cuerpo = {}) { return { method: metodo, body: cuerpo, headers: {} }; }
function res() {
  const r = { _codigo: null, _cuerpo: null, setHeader() {},
    status(c) { r._codigo = c; return r; }, json(b) { r._cuerpo = b; return r; } };
  return r;
}
async function llamar(opciones = {}) {
  const { rol = "admin", metodo = "POST", base = baseOk(), sesion } = opciones;
  global.__sesion = sesion !== undefined ? sesion : (rol ? { email: "a@x.invalid", nombre: "A", rol } : null);
  global.__base = base;
  const handler = require(RUTA_EP);
  const q = res();
  await handler(req(metodo, opciones.cuerpo || {}), q);
  return q;
}

beforeEach(() => { escrituras = []; logs = []; jest.resetModules();
  jest.spyOn(console, "log").mockImplementation((x) => logs.push(x)); });
afterEach(() => { jest.restoreAllMocks(); });

describe("HOTFIX B · autorización del endpoint", () => {
  test("admin válido: ALLOW", async () => {
    const q = await llamar({ rol: "admin" });
    expect([200, 201]).toContain(q._codigo);
    expect(q._cuerpo.ok).toBe(true);
  });

  test("usuario normal: DENY", async () => {
    const q = await llamar({ rol: "editor" });
    expect(q._codigo).toBe(403);
    expect(q._cuerpo.error).toBe("rol_insuficiente");
  });

  test("anon (sin sesión): DENY", async () => {
    const q = await llamar({ sesion: null });
    expect(q._codigo).toBe(401);
    expect(q._cuerpo.error).toBe("sin_sesion");
  });

  test("cookie alterada o vencida: DENY", async () => {
    // `sesionDeRequest` devuelve null tanto por firma inválida como por expiración:
    // el handler no distingue, y no debe — ambas son "no hay sesión".
    const q = await llamar({ sesion: null });
    expect(q._codigo).toBe(401);
  });

  test("el rol enviado por el cliente NO manda", async () => {
    const q = await llamar({ rol: "editor", cuerpo: { rol: "admin", esAdmin: true } });
    expect(q._codigo).toBe(403);
  });

  test("método distinto de POST: rechazado", async () => {
    const q = await llamar({ metodo: "GET" });
    expect(q._codigo).toBe(405);
  });
});

describe("HOTFIX B · contenido del respaldo", () => {
  test("`pins` nunca se copia", async () => {
    await llamar({ rol: "admin" });
    expect(Object.keys(escrituras[0].value)).not.toContain("pins");
  });

  test("`main.usuarios[].pin` nunca se copia", async () => {
    await llamar({ rol: "admin" });
    const usuarios = escrituras[0].value.main.usuarios || [];
    expect(usuarios.length).toBe(2);
    expect(usuarios.some((u) => "pin" in u)).toBe(false);
  });

  test("recurso desconocido: excluido y REPORTADO", async () => {
    await llamar({ rol: "admin" });
    const man = escrituras[0].value.__manifiesto;
    expect(Object.keys(escrituras[0].value)).not.toContain("recurso_nunca_visto");
    expect(man.noDeclarados).toContain("recurso_nunca_visto");
  });

  test("los recursos de negocio SÍ se copian", async () => {
    await llamar({ rol: "admin" });
    for (const id of ["main", "finanzas", "frisku", "eeff_x_2026_01"]) {
      expect(Object.keys(escrituras[0].value)).toContain(id);
    }
  });

  test("CONTRAPRUEBA · si el detector encuentra material, no se emite NADA", async () => {
    // Se fuerza una fila declarada `campos:"*"` que trae credencial adentro.
    const conveneno = FILAS.concat([{ id: "finanzas_bancos", value: { cuentas: [{ hash: "deadbeef", sal: "cafe" }] } }]);
    const q = await llamar({ rol: "admin", base: async (ruta, opts = {}) => {
      if (opts.method === "POST") { escrituras.push(JSON.parse(opts.body)); return { ok: true, json: async () => [{}] }; }
      if (/id=eq\.backup_/.test(ruta)) return { ok: true, json: async () => [] };
      return { ok: true, json: async () => conveneno };
    } });
    expect(q._codigo).toBe(409);
    expect(escrituras.length).toBe(0);      // ni una escritura parcial
  });
});

describe("HOTFIX B · concurrencia, idempotencia y cero filas", () => {
  test("dos solicitudes concurrentes: UNA creación lógica", async () => {
    const base = baseOk();
    const [a, b] = await Promise.all([llamar({ rol: "admin", base }), llamar({ rol: "admin", base })]);
    const creados = [a, b].filter((q) => q._cuerpo.resultado === "creado").length;
    expect(creados).toBe(1);
    expect([a._cuerpo.ok, b._cuerpo.ok]).toEqual([true, true]);
  });

  test("reintento: mismo resultado, sin segunda creación", async () => {
    const q = await llamar({ rol: "admin", base: baseOk({ yaExiste: true }) });
    expect(q._cuerpo.ok).toBe(true);
    expect(q._cuerpo.resultado).toBe("ya_existia");
  });

  test("cero filas NUNCA se presenta como éxito", async () => {
    // La escritura responde ok pero la confirmación no encuentra la fila.
    const q = await llamar({ rol: "admin", base: async (ruta, opts = {}) => {
      if (opts.method === "POST") return { ok: true, json: async () => [] };
      if (/id=eq\.backup_/.test(ruta)) return { ok: true, json: async () => [] };   // no está
      return { ok: true, json: async () => FILAS };
    } });
    expect(q._codigo).toBe(500);
    expect(q._cuerpo.ok).toBe(false);
    expect(q._cuerpo.error).toBe("sin_confirmacion_del_servidor");
  });

  test("origen ilegible: se corta, no se respalda a medias", async () => {
    const q = await llamar({ rol: "admin", base: async () => ({ ok: false, status: 500, json: async () => ({}) }) });
    expect(q._codigo).toBe(502);
  });
});

describe("HOTFIX B · auditoría", () => {
  test("registra correlación y actor ENMASCARADO, sin PII", async () => {
    await llamar({ rol: "admin" });
    const linea = logs.find((l) => typeof l === "string" && l.includes("osiris_backup"));
    expect(linea).toBeTruthy();
    const j = JSON.parse(linea);
    expect(j.correlationId).toBeTruthy();
    expect(j.backupId).toMatch(/^backup_\d{4}-\d{2}-\d{2}$/);
    expect(j.checksum).toBeTruthy();
    // Ni correo, ni nombre, ni contenido.
    expect(linea).not.toContain("a@x.invalid");
    expect(linea).not.toContain("n1@x.invalid");
    expect(linea).not.toContain("112233");
    expect(j.actor).toHaveLength(12);
  });

  test("la respuesta no devuelve contenido del respaldo", async () => {
    const q = await llamar({ rol: "admin" });
    const texto = JSON.stringify(q._cuerpo);
    expect(texto).not.toContain("112233");
    expect(texto).not.toContain("usuarios");
    expect(q._cuerpo.payload).toBeUndefined();
  });
});
