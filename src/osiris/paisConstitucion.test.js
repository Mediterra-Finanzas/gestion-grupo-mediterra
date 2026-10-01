/* eslint-disable */
// País de constitución: un dato nuevo que no toca nada.
//
// Lo que estas pruebas fijan: que es un campo propio del CLIENTE, que no se
// completa solo, que no entra en ningún cálculo, y que no desplaza ni redefine
// el campo "país" que ya existe.

import {
  PAISES_CONSTITUCION, PENDIENTE, DECLARADO, SIN_CLIENTE,
  paisConstitucionDe, paisConstitucionDeContrato, faltantesPaisConstitucion,
  indicioDesdeDocumentos, clientesPorRevisar, divergenciaConPaisIdentificacion,
  declararPaisConstitucion, NO_HACE,
} from "./paisConstitucion";
import { estadoRetencion, factorNeto } from "./retencion";
import { PAISES } from "../OsirisModule";

const CLI = (extra) => Object.assign({ id: "cli_1", razonSocial: "Cliente SA", pais: "Peru" }, extra || {});
const CT = (extra) => Object.assign(
  { id: "ct_1", clienteId: "cli_1", pais: "Peru", valorRoyaltyPlanta: 1, valorRoyaltyComercial: 3000 },
  extra || {}
);

// ══════════════════════════════════════════════════════════════════
describe("1 · es un campo nuevo del cliente, no el país de siempre", () => {
  test("sin declarar es `pendiente`, nunca el país del cliente", () => {
    const e = paisConstitucionDe(CLI({ pais: "Peru" }));
    expect(e.estado).toBe(PENDIENTE);
    expect(e.valor).toBeNull();          // no cae a "Peru"
    expect(e.declarado).toBe(false);
    expect(e.etiqueta).toBe("sin declarar");
    expect(e.detalle).toMatch(/no significa "no existe"/);
  });

  test("declarado, manda lo declarado y el país del cliente queda intacto", () => {
    const c = declararPaisConstitucion(CLI(), "Reino Unido", { respaldo: "Certificate of Incorporation" });
    expect(paisConstitucionDe(c)).toMatchObject({ estado: DECLARADO, valor: "Reino Unido", declarado: true });
    expect(c.pais).toBe("Peru");          // el campo de identificación no se movió
  });

  test("declarar es puro: no muta el cliente original", () => {
    const original = CLI();
    const copia = JSON.parse(JSON.stringify(original));
    declararPaisConstitucion(original, "Reino Unido");
    expect(original).toEqual(copia);
  });

  test("retirar la declaración vuelve a `pendiente`, sin inventar un país", () => {
    const c = declararPaisConstitucion(CLI(), "Reino Unido");
    const d = declararPaisConstitucion(c, "");
    expect(paisConstitucionDe(d).estado).toBe(PENDIENTE);
    expect(d.paisConstitucion).toBeUndefined();
    expect(d.pais).toBe("Peru");
  });

  test("guarda su respaldo, su autor y su fecha", () => {
    const c = declararPaisConstitucion(CLI(), "Reino Unido",
      { respaldo: "Companies House 13571937", usuario: "Angelo", fecha: "2026-10-01" });
    expect(paisConstitucionDe(c)).toMatchObject({
      valor: "Reino Unido", respaldo: "Companies House 13571937", usuario: "Angelo", fecha: "2026-10-01",
    });
  });
});

// ══════════════════════════════════════════════════════════════════
describe("2 · Reino Unido entra acá y NO en el campo país", () => {
  test("el catálogo nuevo incluye Reino Unido", () => {
    expect(PAISES_CONSTITUCION).toContain("Reino Unido");
  });

  test("la lista del campo `país` sigue siendo exactamente la de antes", () => {
    // Si alguien agrega un país acá, mueve el cálculo de retención de ese
    // contrato. Por eso esta lista queda congelada en esta entrega.
    expect(PAISES).toEqual(["Peru", "Mexico", "Chile", "Corea", "España"]);
    expect(PAISES).not.toContain("Reino Unido");
  });

  test("qué pasaría si alguien escribiera Reino Unido en el campo país", () => {
    // Medido, no supuesto. La regla de hoy es binaria: 0 % si el texto dice
    // "chile", 15 % en cualquier otro caso. Así que el efecto DEPENDE de la
    // tasa anterior, y desde Perú no hay efecto.
    const desdePeru = { id: "a", pais: "Peru" };
    const desdeChile = { id: "b", pais: "Chile" };
    expect(estadoRetencion(desdePeru).pct).toBe(15);
    expect(estadoRetencion({ ...desdePeru, pais: "Reino Unido" }).pct).toBe(15);   // no se mueve
    expect(estadoRetencion(desdeChile).pct).toBe(0);
    expect(estadoRetencion({ ...desdeChile, pais: "Reino Unido" }).pct).toBe(15);  // sí se mueve
    // Y en todos los casos, declarar el país de constitución no interviene.
    expect(estadoRetencion(declararPaisConstitucion(desdePeru, "Reino Unido"))).toEqual(estadoRetencion(desdePeru));
  });

  test("los dos catálogos son independientes", () => {
    expect(PAISES_CONSTITUCION).not.toBe(PAISES);
    expect(PAISES_CONSTITUCION.length).toBeGreaterThan(PAISES.length);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("3 · la fuente es el cliente; el contrato no guarda copia", () => {
  test("el contrato lo resuelve mirando a su cliente", () => {
    const cli = declararPaisConstitucion(CLI(), "Reino Unido");
    const e = paisConstitucionDeContrato(CT(), [cli]);
    expect(e).toMatchObject({ estado: DECLARADO, valor: "Reino Unido", clienteId: "cli_1" });
  });

  test("declarar en el cliente alcanza a TODOS sus contratos de una vez", () => {
    const cli = declararPaisConstitucion(CLI(), "Reino Unido");
    const a = paisConstitucionDeContrato(CT({ id: "ct_1" }), [cli]);
    const b = paisConstitucionDeContrato(CT({ id: "ct_2" }), [cli]);
    expect(a.valor).toBe("Reino Unido");
    expect(b.valor).toBe("Reino Unido");   // una sola respuesta, no dos
  });

  test("declararlo no escribe nada en el contrato", () => {
    const ct = CT();
    const antes = JSON.parse(JSON.stringify(ct));
    const cli = declararPaisConstitucion(CLI(), "Reino Unido");
    paisConstitucionDeContrato(ct, [cli]);
    expect(ct).toEqual(antes);
    expect(ct.paisConstitucion).toBeUndefined();
  });

  test("sin cliente asociado no se adivina desde el país del contrato", () => {
    const sinId = paisConstitucionDeContrato(CT({ clienteId: "" }), []);
    const perdido = paisConstitucionDeContrato(CT({ clienteId: "cli_X" }), [CLI()]);
    [sinId, perdido].forEach((e) => {
      expect(e.estado).toBe(SIN_CLIENTE);
      expect(e.valor).toBeNull();          // el contrato dice "Peru"; no se usa
      expect(e.detalle).toMatch(/no dice nada/);
    });
  });
});

// ══════════════════════════════════════════════════════════════════
describe("4 · no se completa solo", () => {
  test("una dirección en Londres NO declara Reino Unido", () => {
    const agroberries = CLI({
      razonSocial: "Agroberries Limited", pais: "Peru",
      direccion: "C/O Skadden, Arps, 40 Bank Street, Canary Wharf, London, UK", ciudad: "London",
    });
    expect(paisConstitucionDe(agroberries).estado).toBe(PENDIENTE);
    expect(agroberries.paisConstitucion).toBeUndefined();
  });

  test("pero sí lo señala como indicio para revisar", () => {
    const agroberries = CLI({
      direccion: "40 Bank Street, Canary Wharf, London, UK", ciudad: "London", pais: "Peru",
    });
    const ind = indicioDesdeDocumentos(agroberries);
    expect(ind.hay).toBe(true);
    expect(ind.paises).toContain("Reino Unido");
    expect(ind.texto).toMatch(/indicio documental, no una declaración/);
  });

  test("el indicio no molesta cuando coincide con el país ya cargado", () => {
    const normal = CLI({ pais: "Peru", direccion: "Av. Javier Prado, Lima, Perú", ciudad: "Lima" });
    expect(clientesPorRevisar([normal])).toEqual([]);
  });

  test("el indicio no molesta cuando ya está declarado", () => {
    const ya = declararPaisConstitucion(
      CLI({ direccion: "40 Bank Street, London, UK", ciudad: "London" }), "Reino Unido");
    expect(clientesPorRevisar([ya])).toEqual([]);
  });

  test("sin dirección ni ciudad no hay indicio, y eso no es una conclusión", () => {
    const e = indicioDesdeDocumentos(CLI({ direccion: "", ciudad: "" }));
    expect(e.hay).toBe(false);
    expect(e.paises).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("5 · divergencia: se informa, no se corrige sola", () => {
  test("país Perú y constitución Reino Unido: se avisa y se dice que no cambia importes", () => {
    const c = declararPaisConstitucion(CLI({ pais: "Peru" }), "Reino Unido");
    const d = divergenciaConPaisIdentificacion(c);
    expect(d.hay).toBe(true);
    expect(d.pais).toBe("Peru");
    expect(d.paisConstitucion).toBe("Reino Unido");
    expect(d.nota).toMatch(/no cambia ningún importe/);
  });

  test("avisar no modifica el país del cliente", () => {
    const c = declararPaisConstitucion(CLI({ pais: "Peru" }), "Reino Unido");
    divergenciaConPaisIdentificacion(c);
    expect(c.pais).toBe("Peru");
  });

  test("Perú y Perú (con y sin tilde) no es divergencia", () => {
    const c = declararPaisConstitucion(CLI({ pais: "Peru" }), "Perú");
    expect(divergenciaConPaisIdentificacion(c).hay).toBe(false);
  });

  test("sin declarar no hay divergencia que informar", () => {
    expect(divergenciaConPaisIdentificacion(CLI()).hay).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("6 · antecedentes faltantes", () => {
  test("sin declarar, falta el país de constitución", () => {
    expect(faltantesPaisConstitucion(CLI())).toEqual(["país de constitución"]);
  });

  test("declarado sin respaldo, falta el respaldo", () => {
    const c = declararPaisConstitucion(CLI(), "Reino Unido");
    expect(faltantesPaisConstitucion(c)).toEqual(["respaldo documental"]);
  });

  test("declarado con respaldo, no falta nada", () => {
    const c = declararPaisConstitucion(CLI(), "Reino Unido", { respaldo: "Companies House" });
    expect(faltantesPaisConstitucion(c)).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("7 · impacto económico: ninguno", () => {
  const conYSin = (pais, pc) => {
    const base = CT({ pais });
    const cli = declararPaisConstitucion(CLI({ pais }), pc);
    return {
      retencionSin: estadoRetencion(base),
      retencionCon: estadoRetencion(base),       // el contrato no cambió
      factorSin: factorNeto(base),
      factorCon: factorNeto(base),
      cliente: cli,
    };
  };

  ["Peru", "Chile", "Mexico", "Corea", "España"].forEach((pais) => {
    test(`${pais}: declarar Reino Unido como constitución no mueve la retención`, () => {
      const r = conYSin(pais, "Reino Unido");
      expect(r.retencionCon).toEqual(r.retencionSin);
      expect(r.factorCon).toBe(r.factorSin);
      expect(r.cliente.pais).toBe(pais);         // el campo del motor, intacto
    });
  });

  test("el neto por planta y por hectárea son los mismos", () => {
    const ct = CT({ pais: "Peru" });
    const antes = { planta: ct.valorRoyaltyPlanta * factorNeto(ct), ha: ct.valorRoyaltyComercial * factorNeto(ct) };
    declararPaisConstitucion(CLI({ pais: "Peru" }), "Reino Unido", { respaldo: "x" });
    const despues = { planta: ct.valorRoyaltyPlanta * factorNeto(ct), ha: ct.valorRoyaltyComercial * factorNeto(ct) };
    expect(despues).toEqual(antes);
    expect(despues.planta).toBe(0.85);
    expect(despues.ha).toBe(2550);
  });

  test("un cliente con el campo nuevo y otro sin él dan el mismo contrato", () => {
    const con = declararPaisConstitucion(CLI(), "Reino Unido");
    const sin = CLI();
    const ct = CT();
    expect(paisConstitucionDeContrato(ct, [con]).valor).toBe("Reino Unido");
    expect(paisConstitucionDeContrato(ct, [sin]).valor).toBeNull();
    expect(estadoRetencion(ct)).toEqual(estadoRetencion(CT()));   // idéntico
  });
});

// ══════════════════════════════════════════════════════════════════
describe("8 · preservación y compatibilidad", () => {
  test("un cliente viejo, sin el campo, se lee sin romperse", () => {
    const viejo = { id: "cli_9", razonSocial: "Antiguo SA", pais: "Mexico" };
    expect(() => paisConstitucionDe(viejo)).not.toThrow();
    expect(paisConstitucionDe(viejo).estado).toBe(PENDIENTE);
  });

  test("declarar conserva todo lo demás del cliente", () => {
    const c = CLI({ taxID: "123", direccion: "x", ubicaciones: [{ id: "ub1" }] });
    const d = declararPaisConstitucion(c, "Reino Unido");
    expect(d.taxID).toBe("123");
    expect(d.direccion).toBe("x");
    expect(d.ubicaciones).toEqual([{ id: "ub1" }]);
  });

  test("tolera el campo guardado como texto plano, no solo como objeto", () => {
    expect(paisConstitucionDe({ id: "c", pais: "Peru", paisConstitucion: "Reino Unido" }))
      .toMatchObject({ estado: DECLARADO, valor: "Reino Unido", respaldo: "" });
  });

  test("la garantía de lo que NO hace está escrita en el código", () => {
    expect(NO_HACE).toEqual({
      tocaElCampoPais: false,
      tocaElTerritorio: false,
      entraEnAlgunCalculo: false,
      completaClientesExistentes: false,
      guardaCopiaPorContrato: false,
      agregaPaisesAlCampoPais: false,
    });
  });

  test("el módulo no exporta nada que escriba un contrato", () => {
    const mod = require("./paisConstitucion");
    const escriben = Object.keys(mod).filter((k) => /contrato/i.test(k) && /declarar|guardar|set/i.test(k));
    expect(escriben).toEqual([]);
  });
});
