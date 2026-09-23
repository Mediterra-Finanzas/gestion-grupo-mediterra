/* eslint-disable */
// Dos sesiones sobre la misma fila `osiris`, con un servidor simulado que
// respeta la condición de versión de PostgREST (PATCH ?updated_at=eq.X).
// Cada "sesión" es una copia independiente del módulo, con su propia versión
// cargada, igual que dos pestañas abiertas por dos personas.
//
// Comprueba: ningún guardado pisa cambios ajenos, el conflicto se informa, lo
// pendiente se conserva, y los datos nuevos de P1–P5 sobreviven a una recarga.

function servidorSimulado(valorInicial) {
  const estado = { value: valorInicial, updated_at: "2026-09-23T10:00:00.000Z", escrituras: 0 };
  const fetchMock = jest.fn(async (url, opts = {}) => {
    const u = String(url);
    const metodo = opts.method || "GET";
    if (metodo === "GET") {
      return { ok: true, json: async () => [{ value: estado.value, updated_at: estado.updated_at }] };
    }
    if (metodo === "PATCH") {
      const m = u.match(/updated_at=eq\.([^&]+)/);
      const version = m ? decodeURIComponent(m[1]) : null;
      if (version !== estado.updated_at) {
        // La fila cambió: PostgREST no encuentra qué actualizar y no escribe nada.
        return { ok: true, json: async () => [], text: async () => "[]" };
      }
      const body = JSON.parse(opts.body);
      estado.value = body.value;
      estado.updated_at = body.updated_at;
      estado.escrituras++;
      return { ok: true, json: async () => [{ value: estado.value, updated_at: estado.updated_at }] };
    }
    if (metodo === "POST") {
      const body = JSON.parse(opts.body);
      estado.value = body.value;
      estado.updated_at = body.updated_at;
      estado.escrituras++;
      return { ok: true, json: async () => [{ value: estado.value, updated_at: estado.updated_at }] };
    }
    throw new Error("método no simulado: " + metodo);
  });
  return { estado, fetchMock };
}

// Carga una copia independiente del módulo = una sesión.
function abrirSesion() {
  let mod;
  jest.isolateModules(() => {
    mod = require("../OsirisModule");
  });
  return mod;
}

const BASE = {
  contratos: [
    { id: "ct1", razonSocial: "Cliente Uno", rpPlantaCuotas: [{ id: "c1", nPlantas: 100, nFact: "A-1", fechaPago: "2026-04-01", estadoCF: "pagado" }] },
    { id: "ct2", razonSocial: "Cliente Dos", plantaciones: [{ id: "p1", nPlantas: 500 }] },
  ],
  viveros: [], clientes: [], especies: [], variedades: [],
};

describe("dos sesiones concurrentes sobre la fila osiris", () => {
  let srv;
  beforeEach(() => {
    srv = servidorSimulado(JSON.parse(JSON.stringify(BASE)));
    global.fetch = srv.fetchMock;
    window._lastSavedOsiris = null;
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  async function sesionCargada() {
    const s = abrirSesion();
    const { value, updatedAt } = await s.dbLoadOsiris();
    s.__persistenciaTest.set({ version: updatedAt, cargaOk: true });
    return { s, value: JSON.parse(JSON.stringify(value)) };
  }

  test("el segundo guardado no pisa el primero: se rechaza con conflicto", async () => {
    const A = await sesionCargada();
    const B = await sesionCargada();

    // B guarda primero: agrega una plantación.
    B.value.contratos[1].plantaciones.push({ id: "p2", nPlantas: 900 });
    expect(await B.s.dbSaveOsiris(B.value)).toEqual({ ok: true });

    // A, que cargó antes, intenta guardar su propio cambio.
    A.value.contratos[0].rpPlantaCuotas[0].nFact = "A-2";
    const r = await A.s.dbSaveOsiris(A.value);

    expect(r).toEqual({ ok: false, motivo: "conflicto" });
    expect(srv.estado.escrituras).toBe(1);
    // Lo de B sigue intacto y lo de A no entró.
    expect(srv.estado.value.contratos[1].plantaciones).toHaveLength(2);
    expect(srv.estado.value.contratos[0].rpPlantaCuotas[0].nFact).toBe("A-1");
  });

  test("tras el conflicto, lo pendiente de A se conserva y se puede aplicar sobre lo de B", async () => {
    const A = await sesionCargada();
    const B = await sesionCargada();

    B.value.contratos[1].plantaciones.push({ id: "p2", nPlantas: 900 });
    await B.s.dbSaveOsiris(B.value);

    const pendienteDeA = { nFact: "A-2", fechaPago: "2026-05-05" };
    A.value.contratos[0].rpPlantaCuotas[0] = { ...A.value.contratos[0].rpPlantaCuotas[0], ...pendienteDeA };
    expect((await A.s.dbSaveOsiris(A.value)).motivo).toBe("conflicto");

    // A recarga, ve lo de B y reaplica lo suyo. Nada se perdió.
    const frescoA = await A.s.dbLoadOsiris();
    A.s.__persistenciaTest.set({ version: frescoA.updatedAt });
    const fusion = JSON.parse(JSON.stringify(frescoA.value));
    fusion.contratos[0].rpPlantaCuotas[0] = { ...fusion.contratos[0].rpPlantaCuotas[0], ...pendienteDeA };
    expect(await A.s.dbSaveOsiris(fusion)).toEqual({ ok: true });

    expect(srv.estado.value.contratos[1].plantaciones).toHaveLength(2); // lo de B
    expect(srv.estado.value.contratos[0].rpPlantaCuotas[0].nFact).toBe("A-2"); // lo de A
    expect(srv.estado.value.contratos[0].rpPlantaCuotas[0].fechaPago).toBe("2026-05-05");
    expect(srv.estado.escrituras).toBe(2);
  });

  test("sin una carga exitosa previa no se escribe nada", async () => {
    const s = abrirSesion();
    s.__persistenciaTest.set({ version: null, cargaOk: false });
    expect(await s.dbSaveOsiris({ contratos: [] })).toEqual({ ok: false, motivo: "sin_carga" });
    expect(srv.estado.escrituras).toBe(0);
  });

  test("dos sesiones que editan filas distintas no se pierden si cada una recarga", async () => {
    const A = await sesionCargada();
    A.value.contratos[0].rpPagos = { oc1_ev1: { nFact: "F-1" } };
    expect(await A.s.dbSaveOsiris(A.value)).toEqual({ ok: true });

    const B = await sesionCargada(); // carga después: ya ve lo de A
    B.value.contratos[0].rpPagos = { ...(B.value.contratos[0].rpPagos || {}), oc1_ev2: { nFact: "F-2" } };
    expect(await B.s.dbSaveOsiris(B.value)).toEqual({ ok: true });

    expect(srv.estado.value.contratos[0].rpPagos).toEqual({ oc1_ev1: { nFact: "F-1" }, oc1_ev2: { nFact: "F-2" } });
  });
});

describe("persistencia tras recarga de los datos nuevos de P1-P5", () => {
  test("rpPagos, baja de plantación y sugerencias en revisión sobreviven al viaje de ida y vuelta", async () => {
    const srv = servidorSimulado(JSON.parse(JSON.stringify(BASE)));
    global.fetch = srv.fetchMock;
    window._lastSavedOsiris = null;
    jest.spyOn(console, "log").mockImplementation(() => {});

    const s = abrirSesion();
    const cargado = await s.dbLoadOsiris();
    s.__persistenciaTest.set({ version: cargado.updatedAt, cargaOk: true });

    const v = JSON.parse(JSON.stringify(cargado.value));
    v.contratos[0].rpPagos = { oc1_ev1: { nFact: "F-9", fechaPago: "2026-06-06", estadoCF: "pagado", pagado: true, confirmadoPor: "ana", confirmadoEn: "2026-09-23T10:00:00.000Z" } };
    v.contratos[0].rpSugerenciasRevision = [{ id: "s1", nPlantas: 1200, fechaEvento: "2026-03-01", _revision: true, _motivo: "Se parece a una cuota ya registrada, pero no coincide del todo" }];
    v.contratos[1].plantaciones[0] = {
      ...v.contratos[1].plantaciones[0],
      estadoRegistro: "baja",
      baja: { accion: "baja", motivo: "arranque", usuario: "ana", fecha: "2026-09-23T10:00:00.000Z", documento: "" },
      historial: [{ accion: "baja", motivo: "arranque", usuario: "ana", fecha: "2026-09-23T10:00:00.000Z", documento: "" }],
    };
    expect(await s.dbSaveOsiris(v)).toEqual({ ok: true });

    const releido = await s.dbLoadOsiris();
    expect(releido.value.contratos[0].rpPagos).toEqual(v.contratos[0].rpPagos);
    expect(releido.value.contratos[0].rpSugerenciasRevision).toEqual(v.contratos[0].rpSugerenciasRevision);
    expect(releido.value.contratos[1].plantaciones[0]).toEqual(v.contratos[1].plantaciones[0]);
    // La cuota con antecedentes no se tocó en ningún momento.
    expect(releido.value.contratos[0].rpPlantaCuotas[0]).toEqual(BASE.contratos[0].rpPlantaCuotas[0]);
    jest.restoreAllMocks();
  });
});
